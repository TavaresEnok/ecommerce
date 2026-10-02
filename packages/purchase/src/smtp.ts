import { createHash } from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';
import type { Mail, Mailer } from './notifications.js';
// Minimal SMTP client (RFC 5321) usable with any standard provider: EHLO, optional STARTTLS with certificate
// validation, AUTH PLAIN, one recipient per message, UTF-8 subject (RFC 2047) and base64 body.
// Configuration comes only from the environment: SMTP_HOST, SMTP_PORT, SMTP_FROM, SMTP_USER, SMTP_PASSWORD, SMTP_STARTTLS.
export class SmtpMailer implements Mailer {
 readonly provider:string;readonly simulated=false;
 private o:{host:string;port:number;from:string;user?:string;pass?:string;starttls:boolean;helo:string};
 constructor(){
  const host=process.env.SMTP_HOST,from=process.env.SMTP_FROM;
  if(!host||!from)throw new Error('SMTP_HOST/SMTP_FROM ausentes');
  this.o={host,port:Number(process.env.SMTP_PORT||587),from,user:process.env.SMTP_USER||undefined,pass:process.env.SMTP_PASSWORD,starttls:process.env.SMTP_STARTTLS!=='false',helo:process.env.SMTP_HELO||'ecommerce.local'};
  this.provider=`SMTP:${host}`;
 }
 async send(mail:Mail){
  if(/[\r\n<>]/.test(mail.to)||!/^[^\s@]+@[^\s@]+$/.test(mail.to))throw new Error('INVALID_RECIPIENT');
  let socket:net.Socket|tls.TLSSocket=net.connect(this.o.port,this.o.host);
  let buffer='';const waiters:((line:string)=>void)[]=[];let failure:(e:Error)=>void=()=>undefined;
  const failed=new Promise<never>((_,reject)=>{failure=reject;});failed.catch(()=>undefined);
  const attach=(s:net.Socket|tls.TLSSocket)=>{s.setEncoding('utf8');s.setTimeout(20000);s.on('timeout',()=>failure(new Error('SMTP_TIMEOUT')));s.on('error',e=>failure(e));
   s.on('data',(d:string)=>{buffer+=d;let i;while((i=buffer.indexOf('\r\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+2);if(/^\d{3} /.test(line))waiters.shift()?.(line);}});};
  attach(socket);
  const cmd=async(line:string|null,expected:number)=>{if(line!==null)socket.write(line+'\r\n');const r=await Promise.race([new Promise<string>(res=>waiters.push(res)),failed]);if(Number(r.slice(0,3))!==expected)throw new Error(`SMTP_${r.slice(0,3)}`);return r;};
  try{
   await cmd(null,220);await cmd(`EHLO ${this.o.helo}`,250);
   if(this.o.starttls){await cmd('STARTTLS',220);socket.removeAllListeners('data');socket=tls.connect({socket:socket as net.Socket,servername:this.o.host});await new Promise<void>((res,rej)=>{socket.once('secureConnect',()=>res());socket.once('error',rej);});attach(socket);await cmd(`EHLO ${this.o.helo}`,250);}
   if(this.o.user)await cmd(`AUTH PLAIN ${Buffer.from(`\u0000${this.o.user}\u0000${this.o.pass??''}`).toString('base64')}`,235);
   await cmd(`MAIL FROM:<${this.o.from}>`,250);await cmd(`RCPT TO:<${mail.to}>`,250);await cmd('DATA',354);
   const id=`<${createHash('sha256').update(mail.idempotencyKey).digest('hex').slice(0,24)}@${this.o.helo}>`;
   const body=(Buffer.from(mail.text,'utf8').toString('base64').match(/.{1,76}/g)??[]).join('\r\n');
   const message=[`From: <${this.o.from}>`,`To: <${mail.to}>`,`Subject: =?UTF-8?B?${Buffer.from(mail.subject,'utf8').toString('base64')}?=`,`Message-ID: ${id}`,`Date: ${new Date().toUTCString()}`,'MIME-Version: 1.0','Content-Type: text/plain; charset=utf-8','Content-Transfer-Encoding: base64','',body].join('\r\n');
   await cmd(`${message}\r\n.`,250);socket.write('QUIT\r\n');return {id};
  }finally{socket.end();}
 }
}

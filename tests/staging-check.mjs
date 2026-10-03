import { test } from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { seed,client } from '../scripts/seed.mjs';
// Staging check over the fictitious substitutes: HTTPS through Caddy (local CA), SMTP capture (Mailpit), DNS zone file.
// Proves the integration code paths end to end; it is NOT homologation with real providers.
assert.equal(process.env.APP_ENV,'staging');const base=process.env.BASE_URL,api=client(base,process.env.PUBLIC_ORIGIN),report={passed:false,mode:'SIMULADO',substitute:'substitutos locais (Caddy com autoridade local, Mailpit, arquivo de zona DNS)',steps:[]};
const ca=readFileSync('/staging/caddy-root.crt'),zone='/staging/dns.json';
const address={cep:'01001000',street:'Rua Demonstração',number:'1',city:'São Paulo',state:'SP',complement:''};
const expect=(r,status=201)=>{assert.equal(r.status,status,JSON.stringify(r.body));return r.body;};
const B32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function totp(secret,step=Math.floor(Date.now()/30000)){let bits='';for(const c of secret)bits+=B32.indexOf(c).toString(2).padStart(5,'0');const key=Buffer.from(bits.match(/.{8}/g).map(b=>parseInt(b,2)));const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(step));const h=createHmac('sha1',key).update(counter).digest(),o=h[h.length-1]&0xf;return ((h.readUInt32BE(o)&0x7fffffff)%1000000).toString().padStart(6,'0');}
const get=(host,path='/')=>new Promise((resolve,reject)=>{const r=https.request({host:'caddy',port:443,servername:host,headers:{host},path,ca,timeout:15000},res=>{const cert=res.socket?.getPeerCertificate?.()?.subject?.CN;let body='';res.setEncoding('utf8');res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,body,cert}));});r.on('error',reject);r.on('timeout',()=>r.destroy(new Error('timeout')));r.end();});
async function until(label,fn,timeout=60000){const end=Date.now()+timeout;while(Date.now()<end){const v=await fn();if(v)return v;await new Promise(r=>setTimeout(r,1000));}throw new Error(`Tempo esgotado: ${label}`);}
const step=(name,detail={})=>{report.steps.push({name,detail,at:new Date().toISOString()});console.log('✔',name);};
test('Homologação local com substitutos fictícios',async()=>{
 try{
  const home=await get('lojas.demo.test');assert.equal(home.status,200);step('HTTPS da plataforma via Caddy (autoridade local)',{status:home.status});
  const [a]=await seed(api,`stg${randomBytes(3).toString('hex')}`);expect(await api(`tenants/${a.id}/purchase/accounts/simulated`,{method:'POST',actor:a.actor}));
  const buyer=`comprador-${randomBytes(3).toString('hex')}@cliente.demo.test`;
  const r=await api(`public/stores/${a.slug}/cart/items`,{method:'POST',body:{variant_id:a.simple.variant_id,quantity:1}});expect(r);const cookie=r.headers.get('set-cookie').split(';')[0];
  const q=expect(await api(`public/stores/${a.slug}/cart/quotes`,{method:'POST',cookie,body:{kind:'TABLE',address}}));
  const order=expect(await api(`public/stores/${a.slug}/cart/checkout`,{method:'POST',cookie,body:{key:randomUUID(),quote_id:q.id,address,buyer:{name:'Comprador Demonstração',email:buyer},method:'PIX',total_cents:q.total_cents}}));step('Compra por HTTPS (pagamento SIMULADO)',{order:order.number});
  const mail=await until('e-mail no SMTP',async()=>{const list=await fetch(`http://mailpit:8025/api/v1/search?query=${encodeURIComponent(`to:${buyer}`)}`).then(x=>x.json());return list.messages?.length?list.messages[0]:null;});
  const full=await fetch(`http://mailpit:8025/api/v1/message/${mail.ID}`).then(x=>x.json());assert.match(full.Subject,/recebemos seu pedido/);const token=/#acesso=([A-Za-z0-9_-]+)/.exec(full.Text)?.[1];assert.ok(token);
  step('E-mail transacional entregue por SMTP (Mailpit) com link seguro',{subject:full.Subject,from:full.From.Address});
  expect(await api(`public/stores/${a.slug}/orders/${order.id}`,{headers:{'x-order-token':token}}),200);step('Acesso ao pedido pelo link do e-mail');
  const s=expect(await api('auth/mfa/setup',{method:'POST',actor:a.actor}));expect(await api('auth/mfa/enable',{method:'POST',actor:a.actor,body:{code:totp(s.secret)}}));
  // Unique per run: the staging database persists and a proven hostname is never transferred to another store.
  const host=`loja-${randomBytes(4).toString('hex')}.demo.test`,d=expect(await api(`tenants/${a.id}/domains`,{method:'POST',actor:a.actor,body:{hostname:host}}));
  const pending=expect(await api(`tenants/${a.id}/domains/${d.id}/verify`,{method:'POST',actor:a.actor}));assert.equal(pending.status,'FAILED');
  // The "store owner" now edits DNS: TXT proof and CNAME to the platform (zone file stands in for public DNS).
  const z=JSON.parse(readFileSync(zone,'utf8'));z[`_ecommerce-challenge.${host}`]={TXT:[d.challenge.value]};z[host]={CNAME:['lojas.demo.test']};writeFileSync(zone,JSON.stringify(z,null,2));
  const active=expect(await api(`tenants/${a.id}/domains/${d.id}/verify`,{method:'POST',actor:a.actor}));assert.equal(active.status,'ACTIVE',JSON.stringify(active));
  const page=await get(host);assert.equal(page.status,200);assert.match(page.body,new RegExp(`data-store="${a.slug}"`));step('Domínio próprio: prova DNS + certificado emitido sob demanda + rota da loja certa',{host,certificate:page.cert});
  await assert.rejects(get(`intrusa-${randomBytes(4).toString('hex')}.demo.test`));step('Hostname não comprovado: Caddy recusa emitir certificado');
  expect(await api(`tenants/${a.id}/domains/${d.id}/canonical`,{method:'POST',actor:a.actor}));assert.equal(expect(await api(`public/stores/${a.slug}`),200).route.canonical,`https://${host}`);step('Domínio canônico aplicado');
  report.passed=true;
 }finally{report.completedAt=new Date().toISOString();writeFileSync('/app/artifacts/staging.json',JSON.stringify(report,null,2));}
});

import { createHash, randomBytes } from 'node:crypto';
import { newId, rows, sql, withTenant, type Database, type Transaction } from '@ecommerce/database';
import { SmtpMailer } from './smtp.js';
// Transactional e-mail is queued in PostgreSQL inside the business transaction; the worker delivers it later.
const money=(v:string)=>{const c=BigInt(v);return `R$ ${c/100n},${(c%100n).toString().padStart(2,'0')}`;};
type Context={number:string;total_cents:string;store:string;buyer:string;carrier?:string|null;tracking?:string|null;protocol?:string;kind?:string;reply?:string;resolution?:string};
const templates:Record<string,(c:Context)=>{subject:string;body:string}>={
 ORDER_RECEIVED:c=>({subject:`${c.store}: recebemos seu pedido nº ${c.number}`,body:`Olá, ${c.buyer}.\n\nRecebemos o pedido nº ${c.number}, total ${money(c.total_cents)}. O pagamento ainda está em confirmação pelo gateway; avisaremos quando for confirmado.\n\nAcompanhe e solicite atendimento: {{ORDER_LINK}}`}),
 PAYMENT_CONFIRMED:c=>({subject:`${c.store}: pagamento do pedido nº ${c.number} confirmado`,body:`Olá, ${c.buyer}.\n\nO pagamento de ${money(c.total_cents)} do pedido nº ${c.number} foi confirmado. Avisaremos sobre o envio ou a retirada.\n\n{{ORDER_LINK}}`}),
 ORDER_CANCELLED:c=>({subject:`${c.store}: pedido nº ${c.number} cancelado`,body:`Olá, ${c.buyer}.\n\nO pedido nº ${c.number} foi cancelado. Se houve pagamento, a devolução é tratada pela loja no meio de pagamento e você será informado quando for confirmada.\n\n{{ORDER_LINK}}`}),
 READY_FOR_PICKUP:c=>({subject:`${c.store}: pedido nº ${c.number} pronto para retirada`,body:`Olá, ${c.buyer}.\n\nSeu pedido nº ${c.number} está pronto para retirada. Leve um documento.\n\n{{ORDER_LINK}}`}),
 SHIPPED:c=>({subject:`${c.store}: pedido nº ${c.number} enviado`,body:`Olá, ${c.buyer}.\n\nSeu pedido nº ${c.number} foi enviado por ${c.carrier}${c.tracking?`, rastreio ${c.tracking}`:''}.\n\n{{ORDER_LINK}}`}),
 DELIVERED:c=>({subject:`${c.store}: pedido nº ${c.number} entregue`,body:`Olá, ${c.buyer}.\n\nRegistramos a entrega do pedido nº ${c.number}. Se precisar, use o atendimento ou o arrependimento pelo link abaixo.\n\n{{ORDER_LINK}}`}),
 REQUEST_RECEIVED:c=>({subject:`${c.store}: protocolo ${c.protocol}`,body:`Olá, ${c.buyer}.\n\nRegistramos sua solicitação (${c.kind}) com protocolo ${c.protocol}. A loja responde em até 5 dias. Receber a solicitação não confirma cancelamento nem devolução de valores.\n\n{{ORDER_LINK}}`}),
 SUPPORT_REPLY:c=>({subject:`${c.store}: resposta ao protocolo ${c.protocol}`,body:`Olá, ${c.buyer}.\n\n${c.reply}\n\n{{ORDER_LINK}}`}),
 REQUEST_RESOLVED:c=>({subject:`${c.store}: protocolo ${c.protocol} concluído`,body:`Olá, ${c.buyer}.\n\n${c.resolution}\n\n{{ORDER_LINK}}`})
};
export async function notify(tx:Transaction,tenant:string,template:string,key:string,target:{orderId?:string|null;requestId?:string|null;context?:Partial<Context>}){
 const [store]=await rows<{name:string}>(tx,sql`select name from shop.tenants where id=${tenant}`);
 let recipient='',context:Context={number:'',total_cents:'0',store:store?.name||'Loja',buyer:'',...target.context};
 if(target.orderId){const [o]=await rows<{number:string;total_cents:string;buyer:{name:string;email:string}}>(tx,sql`select number::text,total_cents::text,buyer from shop.orders where id=${target.orderId}`);if(!o)return;recipient=o.buyer.email;context={...context,number:o.number,total_cents:o.total_cents,buyer:o.buyer.name,...target.context};}
 else if(target.requestId){const [r]=await rows<{contact_name:string;contact_email:string}>(tx,sql`select contact_name,contact_email from shop.consumer_requests where id=${target.requestId}`);if(!r)return;recipient=r.contact_email;context={...context,buyer:r.contact_name,...target.context};}
 if(!recipient||recipient.endsWith('@invalid'))return;const message=templates[template]!(context);
 await tx.execute(sql`insert into shop.notifications(id,tenant_id,order_id,request_id,template,recipient,subject,body,operation_key) values(${newId()},${tenant},${target.orderId??null},${target.requestId??null},${template},${recipient},${message.subject},${message.body},${key}) on conflict(tenant_id,operation_key) do nothing`);
}
export type Mail={to:string;subject:string;text:string;idempotencyKey:string};
export interface Mailer {readonly provider:string;readonly simulated:boolean;send(mail:Mail):Promise<{id:string}>}
// No external provider is homologated (D05). LOCAL records the message as SIMULATED and never leaves the machine.
export class LocalMailer implements Mailer {readonly provider='LOCAL';readonly simulated=true;async send(mail:Mail){if(!mail.to.includes('@'))throw new Error('INVALID_RECIPIENT');return {id:`local-${createHash('sha256').update(mail.idempotencyKey).digest('hex').slice(0,16)}`};}}
export class FailingMailer implements Mailer {readonly provider='FAILING';readonly simulated=true;async send():Promise<{id:string}>{throw new Error('PROVIDER_UNAVAILABLE');}}
export function mailerFromEnv():Mailer|null{const p=process.env.MAIL_PROVIDER||'';if(p==='smtp')return new SmtpMailer();if(p==='local'&&process.env.APP_ENV!=='production')return new LocalMailer();if(p==='fail'&&process.env.APP_ENV!=='production')return new FailingMailer();return null;}
export const MAX_MAIL_ATTEMPTS=6;
export async function deliverNotifications(database:Database,tenant:string,mailer:Mailer|null,origin=process.env.PUBLIC_ORIGIN||''){
 // Without a provider messages stay PENDING; the backlog alert makes the gap visible instead of dropping them.
 if(!mailer)return {sent:0,failed:0,pending:true};
 const due=await withTenant(database,tenant,null,async tx=>{const list=await rows<{id:string;order_id:string|null;recipient:string;subject:string;body:string;operation_key:string;attempts:number}>(tx,sql`select id,order_id,recipient,subject,body,operation_key,attempts from shop.notifications where status='PENDING' and next_attempt_at<=now() and (lease_until is null or lease_until<now()) order by next_attempt_at limit 20 for update skip locked`);for(const n of list)await tx.execute(sql`update shop.notifications set lease_until=now()+interval '2 minutes' where id=${n.id}`);return list;});
 let sent=0,failed=0;
 for(const n of due){
  let text=n.body.replace('{{ORDER_LINK}}','Consulte o pedido no mesmo navegador usado na compra.');
  if(n.order_id&&n.body.includes('{{ORDER_LINK}}')){const token=randomBytes(32).toString('base64url');const [route]=await withTenant(database,tenant,null,async tx=>{await tx.execute(sql`insert into shop.order_access_tokens(id,tenant_id,order_id,token_hash,expires_at) values(${newId()},${tenant},${n.order_id},${createHash('sha256').update(token).digest('hex')},now()+interval '90 days')`);return rows<{slug:string}>(tx,sql`select slug from shop.platform_routes limit 1`);});
   // Secret travels in the fragment: never sent to the server, logs or Referer.
   if(route)text=n.body.replace('{{ORDER_LINK}}',`Acompanhe o pedido: ${origin}/lojas/${route.slug}/pedidos/${n.order_id}#acesso=${token}`);}
  try{const result=await mailer.send({to:n.recipient,subject:n.subject,text,idempotencyKey:n.operation_key});sent++;
   await withTenant(database,tenant,null,tx=>tx.execute(sql`update shop.notifications set status=${mailer.simulated?'SIMULATED':'SENT'},provider=${mailer.provider},provider_message_id=${result.id},sent_at=now(),attempts=attempts+1,lease_until=null,last_error=null where id=${n.id} and status='PENDING'`));}
  catch(error){failed++;const code=(error as Error).message.slice(0,60);await withTenant(database,tenant,null,tx=>tx.execute(sql`update shop.notifications set attempts=attempts+1,last_error=${code},provider=${mailer.provider},lease_until=null,status=case when attempts+1>=${MAX_MAIL_ATTEMPTS} then 'FAILED' else 'PENDING' end,next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,attempts))::int) where id=${n.id}`));}
 }
 return {sent,failed,pending:false};
}

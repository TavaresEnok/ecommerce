import { Body, Controller, Get, Injectable, Module, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { newId, rows, sql, withTenant, type Transaction } from '@ecommerce/database';
import { alerts, assign, erasureBlockers, contact, contactByToken, consumerReply, createExport, deliver, erase, event, financialCommunication, order, PurchaseError, readExport, readyForPickup, registerReturn, requestReconciliation, resolveOperational, resolveRequest, setFiscalReference, ship, staffList, staffReply, startProcessing, tenantStatus, ticket, impediments } from '@ecommerce/purchase';
import { erasureLedgerKey, putObject } from '@ecommerce/media';
import { AccessModule, SessionGuard, type AuthRequest } from './access.js';
import { id, object, text } from './catalogue.js';
import { Infrastructure } from './infrastructure.js';
import { StoresModule, StoresService } from './stores.js';
const OUTCOMES=['ACCEPTED','DECLINED','WITHDRAWN_BY_CONSUMER','INFORMED'];
@Injectable()
class OperationsService {
 constructor(private stores:StoresService,private infra:Infrastructure){}
 private run<T>(tenant:string,req:AuthRequest,action:(tx:Transaction,member:{id:string;role:string})=>Promise<T>,owner=false){return this.stores.run(id(tenant),req.actor,action,owner);}
 orders(tenant:string,req:AuthRequest,q:Record<string,string|undefined>){const f=(name:string,allowed:string[])=>q[name]&&allowed.includes(q[name]!)?q[name]!:null;
  const order_status=f('order_status',['OPEN','COMPLETED','CANCELLED']),payment=f('payment_status',['UNPAID','PENDING','PAID','PARTIALLY_REFUNDED','REFUNDED','CHARGED_BACK']),fulfillment=f('fulfillment_status',['UNFULFILLED','PROCESSING','SHIPPED','DELIVERED','RETURNED']),number=q.number&&/^\d{1,18}$/.test(q.number)?q.number:null,pending=q.pending==='true';
  return this.run(tenant,req,tx=>rows(tx,sql`select o.id,o.number::text,o.order_status,o.payment_status,o.fulfillment_status,o.dispute_status,o.total_cents::text,o.created_at,o.shipping->>'kind' as delivery_kind,
   (select count(*)::int from shop.order_incidents i where i.order_id=o.id and i.status='OPEN') as open_incidents,(select coalesce(sum(i.due_cents),0)::text from shop.order_incidents i where i.order_id=o.id and i.status='OPEN' and i.code='REFUND_ACTION_REQUIRED') as refund_due_cents,
   (select count(*)::int from shop.consumer_requests r where r.order_id=o.id and r.status<>'RESOLVED') as open_requests from shop.orders o
   where (${order_status}::text is null or o.order_status=${order_status}) and (${payment}::text is null or o.payment_status=${payment}) and (${fulfillment}::text is null or o.fulfillment_status=${fulfillment}) and (${number}::bigint is null or o.number=${number}::bigint)
   and (not ${pending} or exists(select 1 from shop.order_incidents i where i.order_id=o.id and i.status='OPEN') or exists(select 1 from shop.consumer_requests r where r.order_id=o.id and r.status<>'RESOLVED')) order by o.number desc limit 100`));}
 impediments(tenant:string,req:AuthRequest,o:string){return this.run(tenant,req,async tx=>({impediments:await impediments(tx,await order(tx,id(o)))}));}
 process(tenant:string,req:AuthRequest,o:string){return this.run(tenant,req,(tx,m)=>startProcessing(tx,tenant,id(o),m.id));}
 ship(tenant:string,req:AuthRequest,o:string,input:unknown){const b=object(input);return this.run(tenant,req,(tx,m)=>ship(tx,tenant,id(o),m.id,text(b.carrier,80),text(b.tracking??'',80,true)));}
 pickup(tenant:string,req:AuthRequest,o:string){return this.run(tenant,req,(tx,m)=>readyForPickup(tx,tenant,id(o),m.id));}
 deliver(tenant:string,req:AuthRequest,o:string,input:unknown){const b=object(input);return this.run(tenant,req,(tx,m)=>deliver(tx,tenant,id(o),m.id,text(b.proof??'',300,true)));}
 returned(tenant:string,req:AuthRequest,o:string,input:unknown){return this.run(tenant,req,(tx,m)=>registerReturn(tx,tenant,id(o),m.id,text(object(input).note,500)));}
 resolveIncident(tenant:string,req:AuthRequest,o:string,i:string,input:unknown){return this.run(tenant,req,(tx,m)=>resolveOperational(tx,tenant,id(o),id(i),m.id,text(object(input).note,1000)),true);}
 reconcile(tenant:string,req:AuthRequest,o:string){return this.run(tenant,req,(tx,m)=>requestReconciliation(tx,tenant,id(o),m.id));}
 fiscal(tenant:string,req:AuthRequest,o:string,input:unknown){return this.run(tenant,req,(tx,m)=>setFiscalReference(tx,tenant,id(o),m.id,text(object(input).reference,120)));}
 revokeLinks(tenant:string,req:AuthRequest,o:string){return this.run(tenant,req,async(tx,m)=>{const x=await order(tx,id(o),true);const r=await tx.execute(sql`update shop.order_access_tokens set revoked_at=now() where order_id=${x.id} and revoked_at is null`);await event(tx,tenant,x,'ACCESS_LINKS_REVOKED','Links de acompanhamento revogados.',m.id);return {revoked:r.rowCount??0};},true);}
 notifications(tenant:string,req:AuthRequest,o:string){return this.run(tenant,req,tx=>rows(tx,sql`select id,template,status,attempts,provider,last_error,created_at,sent_at from shop.notifications where order_id=${id(o)} order by created_at`));}
 retryNotification(tenant:string,req:AuthRequest,n:string){return this.run(tenant,req,async tx=>{const [r]=await rows(tx,sql`update shop.notifications set status='PENDING',attempts=0,next_attempt_at=now(),last_error=null where id=${id(n)} and status in ('FAILED','HELD') and recipient not like '%@invalid' returning id,status`);if(!r)throw new PurchaseError(409,'Notificação não admite reenvio.');return r;},true);}
 support(tenant:string,req:AuthRequest,filter:string){return this.run(tenant,req,tx=>staffList(tx,['open','overdue','all'].includes(filter)?filter:'open'));}
 ticket(tenant:string,req:AuthRequest,r:string){return this.run(tenant,req,tx=>ticket(tx,id(r),true));}
 assign(tenant:string,req:AuthRequest,r:string){return this.run(tenant,req,(tx,m)=>assign(tx,id(r),m.id));}
 reply(tenant:string,req:AuthRequest,r:string,input:unknown){return this.run(tenant,req,(tx,m)=>staffReply(tx,tenant,id(r),m.id,text(object(input).body,4000)));}
 resolve(tenant:string,req:AuthRequest,r:string,input:unknown){const b=object(input),outcome=text(b.outcome,30);if(!OUTCOMES.includes(outcome))throw new PurchaseError(400,'Resultado inválido.');
  // Accepting a cancellation/withdrawal has financial consequence: Owner only. Other outcomes can be recorded by the team.
  return this.run(tenant,req,(tx,m)=>resolveRequest(tx,tenant,id(r),m.id,outcome,text(b.resolution,2000)),outcome==='ACCEPTED');}
 financial(tenant:string,req:AuthRequest,r:string,input:unknown){return this.run(tenant,req,(tx,m)=>financialCommunication(tx,tenant,id(r),m.id,text(object(input).reference,200)),true);}
 createExport(tenant:string,req:AuthRequest,input:unknown){const b=object(input),kind=text(b.kind,10);if(!['STORE','CONSUMER'].includes(kind))throw new PurchaseError(400,'Tipo inválido.');const orderId=kind==='CONSUMER'?id(b.order_id):null;
  return this.run(tenant,req,async(tx,m)=>{if(orderId)await order(tx,orderId);return createExport(tx,tenant,m.id,kind as 'STORE'|'CONSUMER',orderId);},true);}
 readExport(tenant:string,req:AuthRequest,e:string){const token=req.headers['x-export-token'];if(typeof token!=='string'||!/^[A-Za-z0-9_-]{40,60}$/.test(token))throw new PurchaseError(404,'Exportação não encontrada.');return this.run(tenant,req,tx=>readExport(tx,id(e),token),true);}
 async erase(tenant:string,req:AuthRequest,o:string,input:unknown){const reason=text(object(input).reason,500),orderId=id(o),erasure=newId();
  // Ledger first: if the database step fails, reapplying a legitimate request later is safe; the opposite would lose it after a restore.
  await this.run(tenant,req,async tx=>{const blockers=await erasureBlockers(tx,orderId);if(blockers.length)throw new PurchaseError(409,`Eliminação bloqueada por retenção justificada: ${blockers.join(' ')}`);},true);
  await putObject(erasureLedgerKey(id(tenant),erasure),Buffer.from(JSON.stringify({erasure,tenant_id:tenant,order_id:orderId,requested_at:new Date().toISOString()})),'application/json');
  return this.run(tenant,req,(tx,m)=>erase(tx,tenant,orderId,m.id,reason,erasure),true);}
 pause(tenant:string,req:AuthRequest,input:unknown,paused:boolean){const reason=text(object(input).reason??(paused?'':'Retomada pelo Dono'),500);return this.run(tenant,req,async tx=>{await tx.execute(sql`update shop.tenants set sales_paused_at=case when ${paused} then coalesce(sales_paused_at,now()) else null end,sales_pause_reason=case when ${paused} then ${reason} else null end where id=${tenant}`);await tx.execute(sql`insert into shop.tenant_lifecycle_events(id,tenant_id,action,reason,actor) values(${newId()},${tenant},${paused?'SALES_PAUSED':'SALES_RESUMED'},${reason},${'MEMBER:'+req.actor.id})`);const [t]=await rows(tx,sql`select lifecycle_status,sales_paused_at,sales_pause_reason from shop.tenants where id=${tenant}`);return t;},true);}
 // Carrier (provider) shipping: one CARRIER rule per store carries the version that invalidates old quotes.
 carrier(tenant:string,req:AuthRequest,input:unknown){const b=object(input),origin=text(b.origin_cep,9).replace('-',''),enabled=b.enabled!==false,provider=text(b.provider??'SIMULATED',20),sim=b.simulation?object(b.simulation):{};
  if(!/^\d{8}$/.test(origin)||!['SIMULATED','MELHOR_ENVIO'].includes(provider))throw new PurchaseError(400,'Configuração de transportadora inválida.');if(provider!=='SIMULATED')throw new PurchaseError(409,'Provedor de frete não homologado (D09).');
  const simulation={...(sim.fail===true?{fail:true}:{}),...(sim.surcharge_cents!==undefined?{surcharge_cents:Math.max(0,Math.min(100000,Number(sim.surcharge_cents)||0))}:{}),...(sim.validity_minutes!==undefined?{validity_minutes:Math.max(1,Math.min(1440,Number(sim.validity_minutes)||60))}:{})};
  return this.run(tenant,req,async tx=>{const [p]=await rows<{rule_id:string}>(tx,sql`select rule_id from shop.shipping_providers for update`);let rule=p?.rule_id;
   if(!rule){rule=newId();await tx.execute(sql`insert into shop.shipping_rules(id,tenant_id,name,kind,cep_start,cep_end,price_cents,days,priority) values(${rule},${tenant},'Transportadora','CARRIER','00000000','99999999',0,0,0)`);await tx.execute(sql`insert into shop.shipping_providers(id,tenant_id,provider,enabled,origin_cep,rule_id,simulation) values(${newId()},${tenant},${provider},${enabled},${origin},${rule},${JSON.stringify(simulation)}::jsonb)`);}
   else{await tx.execute(sql`update shop.shipping_providers set provider=${provider},enabled=${enabled},origin_cep=${origin},simulation=${JSON.stringify(simulation)}::jsonb,version=version+1,updated_at=now()`);await tx.execute(sql`update shop.shipping_rules set active=${enabled},version=version+1 where id=${rule}`);}
   return (await rows(tx,sql`select provider,enabled,origin_cep,simulation,version::text from shop.shipping_providers`))[0];},true);}
 async status(tenant:string,req:AuthRequest){await this.run(tenant,req,async()=>null);const s=await tenantStatus(this.infra.shop,id(tenant));return {...s,alerts:alerts(s)};}
 // Public support: resolution by slug works for suspended stores so obligations keep being served.
 private async route(slug:string,req:FastifyRequest){const [route]=(await this.infra.shop.pool.query('select * from shop.resolve_store($1,false)',[slug])).rows;if(!route)throw new PurchaseError(404,'Loja não encontrada.');if(req.method!=='GET'&&req.headers.origin!==process.env.PUBLIC_ORIGIN&&req.headers.origin!==route.canonical)throw new PurchaseError(403,'Origem inválida.');return route as {tenant_id:string};}
 async contact(slug:string,req:FastifyRequest,input:unknown){const b=object(input),email=text(b.email,200).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new PurchaseError(400,'E-mail inválido.');const route=await this.route(slug,req);return withTenant(this.infra.shop,route.tenant_id,null,tx=>contact(tx,route.tenant_id,{name:text(b.name,100),email,message:text(b.message,2000),key:text(b.key,100)}));}
 private token(req:FastifyRequest){const t=req.headers['x-support-token'];if(typeof t!=='string'||!/^[A-Za-z0-9_-]{30,60}$/.test(t))throw new PurchaseError(404,'Protocolo não autorizado.');return t;}
 async contactView(slug:string,req:FastifyRequest,r:string){const route=await this.route(slug,req),t=this.token(req);return withTenant(this.infra.shop,route.tenant_id,null,tx=>contactByToken(tx,id(r),t));}
 async contactReply(slug:string,req:FastifyRequest,r:string,input:unknown){const route=await this.route(slug,req),t=this.token(req),body=text(object(input).body,4000);return withTenant(this.infra.shop,route.tenant_id,null,async tx=>{await contactByToken(tx,id(r),t);return consumerReply(tx,route.tenant_id,id(r),body);});}
}
@Controller('tenants/:tenantId/operations')
@UseGuards(SessionGuard)
class OperationsController {constructor(private s:OperationsService){}
 @Get('orders') orders(@Param('tenantId') t:string,@Req() r:AuthRequest,@Query() q:Record<string,string>){return this.s.orders(t,r,q);}
 @Get('orders/:orderId/impediments') impediments(@Param('tenantId') t:string,@Param('orderId') o:string,@Req() r:AuthRequest){return this.s.impediments(t,r,o);}
 @Post('orders/:orderId/process') process(@Param('tenantId') t:string,@Param('orderId') o:string,@Req() r:AuthRequest){return this.s.process(t,r,o);}
 @Post('orders/:orderId/ship') ship(@Param('tenantId') t:string,@Param('orderId') o:string,@Req() r:AuthRequest,@Body() b:unknown){return this.s.ship(t,r,o,b);}
 @Post('orders/:orderId/pickup-ready') pickup(@Param('tenantId') t:string,@Param('orderId') o:string,@Req() r:AuthRequest){return this.s.pickup(t,r,o);}
 @Post('orders/:orderId/deliver') deliver(@Param('tenantId') t:string,@Param('orderId') o:string,@Req() r:AuthRequest,@Body() b:unknown){return this.s.deliver(t,r,o,b);}
 @Post('orders/:orderId/return') returned(@Param('tenantId') t:string,@Param('orderId') o:string,@Req() r:AuthRequest,@Body() b:unknown){return this.s.returned(t,r,o,b);}
 @Post('orders/:orderId/incidents/:incidentId/resolve') resolveIncident(@Param('tenantId') t:string,@Param('orderId') o:string,@Param('incidentId') i:string,@Req() r:AuthRequest,@Body() b:unknown){return this.s.resolveIncident(t,r,o,i,b);}
 @Post('orders/:orderId/reconcile') reconcile(@Param('tenantId') t:string,@Param('orderId') o:string,@Req() r:AuthRequest){return this.s.reconcile(t,r,o);}
 @Post('orders/:orderId/fiscal') fiscal(@Param('tenantId') t:string,@Param('orderId') o:string,@Req() r:AuthRequest,@Body() b:unknown){return this.s.fiscal(t,r,o,b);}
 @Post('orders/:orderId/access/revoke') revoke(@Param('tenantId') t:string,@Param('orderId') o:string,@Req() r:AuthRequest){return this.s.revokeLinks(t,r,o);}
 @Get('orders/:orderId/notifications') notifications(@Param('tenantId') t:string,@Param('orderId') o:string,@Req() r:AuthRequest){return this.s.notifications(t,r,o);}
 @Post('notifications/:notificationId/retry') retry(@Param('tenantId') t:string,@Param('notificationId') n:string,@Req() r:AuthRequest){return this.s.retryNotification(t,r,n);}
 @Post('orders/:orderId/erase') erase(@Param('tenantId') t:string,@Param('orderId') o:string,@Req() r:AuthRequest,@Body() b:unknown){return this.s.erase(t,r,o,b);}
 @Get('support') support(@Param('tenantId') t:string,@Req() r:AuthRequest,@Query('filter') f:string){return this.s.support(t,r,f||'open');}
 @Get('support/:requestId') ticket(@Param('tenantId') t:string,@Param('requestId') q:string,@Req() r:AuthRequest){return this.s.ticket(t,r,q);}
 @Post('support/:requestId/assign') assign(@Param('tenantId') t:string,@Param('requestId') q:string,@Req() r:AuthRequest){return this.s.assign(t,r,q);}
 @Post('support/:requestId/reply') reply(@Param('tenantId') t:string,@Param('requestId') q:string,@Req() r:AuthRequest,@Body() b:unknown){return this.s.reply(t,r,q,b);}
 @Post('support/:requestId/resolve') resolve(@Param('tenantId') t:string,@Param('requestId') q:string,@Req() r:AuthRequest,@Body() b:unknown){return this.s.resolve(t,r,q,b);}
 @Post('support/:requestId/financial') financial(@Param('tenantId') t:string,@Param('requestId') q:string,@Req() r:AuthRequest,@Body() b:unknown){return this.s.financial(t,r,q,b);}
 @Post('exports') createExport(@Param('tenantId') t:string,@Req() r:AuthRequest,@Body() b:unknown){return this.s.createExport(t,r,b);}
 @Get('exports/:exportId') readExport(@Param('tenantId') t:string,@Param('exportId') e:string,@Req() r:AuthRequest){return this.s.readExport(t,r,e);}
 @Post('sales/pause') pause(@Param('tenantId') t:string,@Req() r:AuthRequest,@Body() b:unknown){return this.s.pause(t,r,b,true);}
 @Post('sales/resume') resume(@Param('tenantId') t:string,@Req() r:AuthRequest,@Body() b:unknown){return this.s.pause(t,r,b??{},false);}
 @Post('carrier') carrier(@Param('tenantId') t:string,@Req() r:AuthRequest,@Body() b:unknown){return this.s.carrier(t,r,b);}
 @Get('status') status(@Param('tenantId') t:string,@Req() r:AuthRequest){return this.s.status(t,r);}
}
@Controller('public/stores/:slug/support')
class ContactController {constructor(private s:OperationsService){}
 @Post() contact(@Param('slug') slug:string,@Req() r:FastifyRequest,@Body() b:unknown){return this.s.contact(slug,r,b);}
 @Get(':requestId') view(@Param('slug') slug:string,@Param('requestId') q:string,@Req() r:FastifyRequest){return this.s.contactView(slug,r,q);}
 @Post(':requestId/messages') reply(@Param('slug') slug:string,@Param('requestId') q:string,@Req() r:FastifyRequest,@Body() b:unknown){return this.s.contactReply(slug,r,q,b);}
}
@Module({imports:[StoresModule,AccessModule],providers:[OperationsService],controllers:[OperationsController,ContactController]})
export class OperationsModule{}

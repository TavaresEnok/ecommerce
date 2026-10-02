import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { createDatabase, rows, sql, withTenant } from '@ecommerce/database';
import { processAttempt, processInbox, deliverNotifications, FailingMailer, MAX_MAIL_ATTEMPTS, tenantStatus, alerts } from '@ecommerce/purchase';
import { seed,client } from '../scripts/seed.mjs';
import { lifecycle } from '../scripts/ops-tasks.mjs';
// Deterministic operation tests (worker stopped): fulfillment, support, notifications, suspension, privacy, recovery fixtures.
assert.equal(process.env.APP_ENV,'test');const base=process.env.BASE_URL;assert.equal(new URL(base).hostname,'web');
const api=client(base),report={passed:false,simulation:true,externalHomologation:false,criteria:['T05 (operação)','T25','T32 (exportação/eliminação)','T35','T36','Expedição/retirada','Notificações e falha','Alertas'],tests:[]};
const address={cep:'01001000',street:'Rua TESTE',number:'1',city:'São Paulo TESTE',state:'SP',complement:''};
const expect=(r,status=201)=>{assert.equal(r.status,status,JSON.stringify(r.body));return r.body;};
class CaptureMailer{provider='CAPTURE';simulated=true;sent=[];async send(m){this.sent.push(m);return {id:`cap-${this.sent.length}`};}}
test('Fase 4: operação do piloto com PostgreSQL real e provedores SIMULADOS',async t=>{
  const database=createDatabase(process.env.DATABASE_URL,3);let failures=0;
  const check=async(name,fn)=>{let passed=false;await t.test(name,async()=>{await fn();passed=true;});if(!passed)failures++;report.tests.push({name,result:passed?'passed':'failed'});};
  const tx=(tenant,fn)=>withTenant(database,tenant,null,fn);let a,b,A,B,employee;
  const admin=async(s,o,actor=s.actor)=>expect(await api(`tenants/${s.id}/purchase/orders/${o}`,{actor}),200);
  const op=(s,path,body,actor=s.actor)=>api(`tenants/${s.id}/operations/${path}`,{method:body===undefined?'GET':'POST',actor,body});
  async function buy(s,kind='TABLE',variant=s.simple.variant_id){const r=await api(`public/stores/${s.slug}/cart/items`,{method:'POST',body:{variant_id:variant,quantity:1}});expect(r);const cookie=r.headers.get('set-cookie').split(';')[0];const quote=expect(await api(`public/stores/${s.slug}/cart/quotes`,{method:'POST',cookie,body:{kind,address}}));const order=expect(await api(`public/stores/${s.slug}/cart/checkout`,{method:'POST',cookie,body:{key:randomUUID(),quote_id:quote.id,address,buyer:{name:'Comprador TESTE',email:`comprador-${randomBytes(3).toString('hex')}@example.test`},method:'PIX',total_cents:quote.total_cents}}));return {cookie,order,attempt:order.attempts[0].id};}
  const simulate=async(s,attempt,status,extra={})=>{expect(await api(`tenants/${s.id}/purchase/attempts/${attempt}/simulate`,{method:'POST',actor:s.actor,body:{status,...extra}}));await processInbox(database,s.id);};
  async function paid(s,kind='TABLE'){const p=await buy(s,kind);await processAttempt(database,s.id,p.attempt);await simulate(s,p.attempt,'APPROVED');assert.equal((await admin(s,p.order.id)).payment_status,'PAID');return p;}
  const templates=async(s,o)=>(await tx(s.id,t=>rows(t,sql`select template from shop.notifications where order_id=${o} order by created_at`))).map(n=>n.template);
  try{
    [a,b]=await seed(api,`p4${randomBytes(4).toString('hex')}`);A=a.id;B=b.id;
    for(const s of [a,b]){expect(await api(`tenants/${s.id}/purchase/accounts/simulated`,{method:'POST',actor:s.actor}));expect(await api(`tenants/${s.id}/catalogue/adjustments`,{method:'POST',actor:s.actor,body:{variant_id:s.simple.variant_id,location_id:s.location.id,delta:200,reason:'Saldo de teste da Fase 4'}}));}
    const email=`func-${randomBytes(4).toString('hex')}@example.test`,password=randomBytes(18).toString('base64url'),reg=expect(await api('auth/register',{method:'POST',body:{email,password}}));expect(await api('auth/verify-email',{method:'POST',body:{token:reg.localToken}}));
    const login=await api('auth/login',{method:'POST',body:{email,password}});expect(login);employee={id:login.body.user.id,csrf:login.body.csrf,cookie:login.headers.get('set-cookie').split(';')[0]};
    const invite=expect(await api(`tenants/${A}/invitations`,{method:'POST',actor:a.actor,body:{email}}));expect(await api('invitations/accept',{method:'POST',actor:employee,body:{tenantId:A,token:invite.localToken}}));
    await check('Expedição por transportadora: funcionário separa, envia e entrega; pedido concluído e notificações enfileiradas',async()=>{
      const p=await paid(a),before=(await tx(A,t=>rows(t,sql`select on_hand from shop.inventory_items where variant_id=${a.simple.variant_id}`)))[0].on_hand;
      expect(await op(a,`orders/${p.order.id}/ship`,{carrier:'Correios TESTE',tracking:'BR123'},employee),409);
      expect(await op(a,`orders/${p.order.id}/process`,{},employee));expect(await op(a,`orders/${p.order.id}/pickup-ready`,{},employee),409);
      expect(await op(a,`orders/${p.order.id}/ship`,{carrier:'Correios TESTE',tracking:'BR123'},employee));expect(await op(a,`orders/${p.order.id}/ship`,{carrier:'Outra',tracking:'X'},employee),409);
      expect(await op(a,`orders/${p.order.id}/deliver`,{proof:''},employee));const o=await admin(a,p.order.id);
      assert.equal(o.fulfillment_status,'DELIVERED');assert.equal(o.order_status,'COMPLETED');assert.equal(o.shipment.tracking_code,'BR123');assert.ok(o.history.some(h=>h.event==='ORDER_SHIPPED'));
      assert.deepEqual(await templates(a,p.order.id),['ORDER_RECEIVED','PAYMENT_CONFIRMED','SHIPPED','DELIVERED']);
      expect(await op(a,`orders/${p.order.id}/return`,{note:'Produto recebido de volta TESTE'},employee));assert.equal((await admin(a,p.order.id)).fulfillment_status,'RETURNED');
      assert.equal((await tx(A,t=>rows(t,sql`select on_hand from shop.inventory_items where variant_id=${a.simple.variant_id}`)))[0].on_hand,before);
      const view=expect(await api(`public/stores/${a.slug}/orders/${p.order.id}`,{cookie:p.cookie}),200);assert.equal(view.shipment.carrier,'Correios TESTE');
    });
    await check('Retirada comprovada sem transportadora; bloqueios revalidados no backend',async()=>{
      const p=await paid(a,'PICKUP');expect(await op(a,`orders/${p.order.id}/process`,{},employee));expect(await op(a,`orders/${p.order.id}/ship`,{carrier:'X'},employee),409);
      expect(await op(a,`orders/${p.order.id}/deliver`,{proof:'Documento'},employee),409);expect(await op(a,`orders/${p.order.id}/pickup-ready`,{},employee));
      expect(await op(a,`orders/${p.order.id}/deliver`,{proof:''},employee),400);expect(await op(a,`orders/${p.order.id}/deliver`,{proof:'RG conferido, retirado pelo comprador'},employee));
      const o=await admin(a,p.order.id);assert.equal(o.fulfillment_status,'DELIVERED');assert.equal(o.shipment.kind,'PICKUP');assert.ok((await templates(a,p.order.id)).includes('READY_FOR_PICKUP'));
      const unpaid=await buy(a);expect(await op(a,`orders/${unpaid.order.id}/process`,{},employee),409);assert.match(expect(await op(a,`orders/${unpaid.order.id}/impediments`),200).impediments.join(' '),/Pagamento principal/);
      const partial=await paid(a);await simulate(a,partial.attempt,'REFUNDED',{amount_cents:'500'});const r1=await op(a,`orders/${partial.order.id}/process`,{},employee);assert.equal(r1.status,409);assert.match(r1.body.error,/PARTIAL_REFUND_REVIEW|Pagamento principal/);
      const disputed=await paid(a);await simulate(a,disputed.attempt,'DISPUTED');expect(await op(a,`orders/${disputed.order.id}/process`,{},employee),409);
      const withdrawn=await paid(a);expect(await api(`public/stores/${a.slug}/orders/${withdrawn.order.id}/requests`,{method:'POST',cookie:withdrawn.cookie,body:{kind:'WITHDRAWAL',message:'Desisti',key:randomUUID()}}));expect(await op(a,`orders/${withdrawn.order.id}/process`,{},employee),409);
      const rq=(await admin(a,withdrawn.order.id)).protocols[0].id;expect(await op(a,`support/${rq}/resolve`,{outcome:'WITHDRAWN_BY_CONSUMER',resolution:'Consumidor desistiu do arrependimento por escrito.'},employee));
      assert.equal((await admin(a,withdrawn.order.id)).cancel_requested_at,null);expect(await op(a,`orders/${withdrawn.order.id}/process`,{},employee));
    });
    await check('T35/T05: revisão não financeira só pelo Dono; devolução pendente só encerra com confirmação do gateway',async()=>{
      const p=await paid(a);await simulate(a,p.attempt,'REFUNDED',{amount_cents:'500'});const review=(await admin(a,p.order.id)).incidents.find(i=>i.code==='PARTIAL_REFUND_REVIEW');
      expect(await op(a,`orders/${p.order.id}/incidents/${review.id}/resolve`,{note:'Conferido'},employee),403);expect(await op(a,`orders/${p.order.id}/incidents/${review.id}/resolve`,{note:'Item faltante devolvido; enviar o restante'}));
      const x=await paid(a);expect(await api(`tenants/${A}/purchase/orders/${x.order.id}/cancel`,{method:'POST',actor:a.actor,body:{reason:'Sem condições de envio'}}));const owed=(await admin(a,x.order.id)).incidents.find(i=>i.code==='REFUND_ACTION_REQUIRED');
      expect(await op(a,`orders/${x.order.id}/incidents/${owed.id}/resolve`,{note:'Devolvi'}),409);expect(await op(a,`orders/${x.order.id}/reconcile`,{},employee));
      assert.ok(alerts(await tenantStatus(database,A)).some(al=>al.code==='FINANCIAL_INCIDENT_OPEN'));
      await simulate(a,x.attempt,'REFUNDED',{amount_cents:(await admin(a,x.order.id)).total_cents});assert.equal((await admin(a,x.order.id)).incidents.find(i=>i.id===owed.id).status,'RESOLVED');
      assert.ok((await templates(a,x.order.id)).includes('ORDER_CANCELLED'));
    });
    let linkOrder;
    await check('T36: atendimento vinculado — protocolo, resposta, comunicação financeira antes do aceite, horário original preservado',async()=>{
      const p=await paid(a);linkOrder=p;const ack=expect(await api(`public/stores/${a.slug}/orders/${p.order.id}/requests`,{method:'POST',cookie:p.cookie,body:{kind:'WITHDRAWAL',message:'Quero desistir da compra.',key:randomUUID()}}));
      let list=expect(await op(a,'support?filter=open'),200);const row=list.find(r=>r.id===ack.id);assert.equal(row.financial_action_required,true);assert.ok(alerts(await tenantStatus(database,A)).some(al=>al.code==='FINANCIAL_COMMUNICATION_PENDING'));
      expect(await op(a,`support/${ack.id}/assign`,{},employee));expect(await op(a,`support/${ack.id}/reply`,{body:'Recebemos; vamos providenciar.'},employee));
      expect(await op(a,`support/${ack.id}/resolve`,{outcome:'ACCEPTED',resolution:'Aceito'},employee),403);expect(await op(a,`support/${ack.id}/resolve`,{outcome:'ACCEPTED',resolution:'Aceito'}),409);
      expect(await op(a,`support/${ack.id}/financial`,{reference:'MP painel 01/10 10:00 TESTE'},employee),403);expect(await op(a,`support/${ack.id}/financial`,{reference:'MP painel 01/10 10:00 TESTE'}));
      const done=expect(await op(a,`support/${ack.id}/resolve`,{outcome:'ACCEPTED',resolution:'Arrependimento aceito; devolução comunicada ao meio de pagamento.'}));assert.equal(done.status,'RESOLVED');assert.equal(new Date(done.created_at).toISOString(),new Date(ack.created_at).toISOString());
      const consumer=expect(await api(`public/stores/${a.slug}/orders/${p.order.id}/requests/${ack.id}`,{cookie:p.cookie}),200);assert.equal(consumer.messages.length,3);assert.equal(consumer.financial_reference,undefined);
      expect(await api(`public/stores/${a.slug}/orders/${p.order.id}/requests/${ack.id}/messages`,{method:'POST',cookie:p.cookie,body:{body:'Obrigado'}}),409);
      assert.deepEqual((await templates(a,p.order.id)).filter(n=>['REQUEST_RECEIVED','SUPPORT_REPLY','REQUEST_RESOLVED'].includes(n)),['REQUEST_RECEIVED','SUPPORT_REPLY','REQUEST_RESOLVED']);
      const other=await buy(a);expect(await api(`public/stores/${a.slug}/orders/${p.order.id}/requests/${ack.id}`,{cookie:other.cookie}),404);
    });
    await check('T36: contato geral sem compra — protocolo e código; acesso somente com o código e na loja certa',async()=>{
      const key=randomUUID(),c=expect(await api(`public/stores/${a.slug}/support`,{method:'POST',body:{name:'Visitante TESTE',email:'visitante@example.test',message:'Vocês entregam em Campinas?',key}}));assert.ok(c.token);
      assert.equal(expect(await api(`public/stores/${a.slug}/support`,{method:'POST',body:{name:'Visitante TESTE',email:'visitante@example.test',message:'Vocês entregam em Campinas?',key}})).token,null);
      expect(await api(`public/stores/${a.slug}/support/${c.id}`,{headers:{'x-support-token':c.token}}),200);expect(await api(`public/stores/${a.slug}/support/${c.id}`,{headers:{'x-support-token':'x'.repeat(32)}}),404);expect(await api(`public/stores/${b.slug}/support/${c.id}`,{headers:{'x-support-token':c.token}}),404);
      expect(await api(`public/stores/${a.slug}/support/${c.id}/messages`,{method:'POST',headers:{'x-support-token':c.token},body:{body:'Complemento'}}));
      expect(await op(a,`support/${c.id}/resolve`,{outcome:'INFORMED',resolution:'Sim, entregamos em Campinas.'},employee));
      const n=await tx(A,t=>rows(t,sql`select template,recipient from shop.notifications where request_id=${c.id} order by created_at`));assert.deepEqual(n.map(x=>x.template),['REQUEST_RECEIVED','REQUEST_RESOLVED']);assert.equal(n[0].recipient,'visitante@example.test');
      expect(await op(b,`support/${c.id}`),404);
    });
    await check('Notificações: falha do provedor não apaga protocolo; esgota em FAILED, reenvio pelo Dono; link de acesso por fragmento',async()=>{
      const p=await buy(a),ack=expect(await api(`public/stores/${a.slug}/orders/${p.order.id}/requests`,{method:'POST',cookie:p.cookie,body:{kind:'SUPPORT',message:'Teste de falha',key:randomUUID()}}));
      await tx(A,t=>t.execute(sql`update shop.notifications set next_attempt_at=now()+interval '1 day' where status='PENDING' and order_id is distinct from ${p.order.id}`));
      const fail=new FailingMailer();for(let i=0;i<MAX_MAIL_ATTEMPTS;i++){await tx(A,t=>t.execute(sql`update shop.notifications set next_attempt_at=now() where order_id=${p.order.id} and status='PENDING'`));await deliverNotifications(database,A,fail);}
      const failed=await tx(A,t=>rows(t,sql`select id,status,attempts from shop.notifications where order_id=${p.order.id}`));assert.ok(failed.length>=2&&failed.every(n=>n.status==='FAILED'&&n.attempts===MAX_MAIL_ATTEMPTS));
      const req=(await tx(A,t=>rows(t,sql`select created_at from shop.consumer_requests where id=${ack.id}`)))[0];assert.equal(new Date(req.created_at).toISOString(),new Date(ack.created_at).toISOString());
      assert.ok(alerts(await tenantStatus(database,A)).some(al=>al.code==='NOTIFICATION_FAILED'));
      expect(await op(a,`notifications/${failed[0].id}/retry`,{},employee),403);for(const n of failed)expect(await op(a,`notifications/${n.id}/retry`,{}));
      const mailer=new CaptureMailer();await deliverNotifications(database,A,mailer,base);const mine=mailer.sent.filter(m=>m.text.includes(p.order.id));assert.ok(mine.length>=2);
      const token=/#acesso=([A-Za-z0-9_-]+)/.exec(mine[0].text)[1];assert.ok(!mine[0].text.includes('?'));
      assert.equal(expect(await api(`public/stores/${a.slug}/orders/${p.order.id}`,{headers:{'x-order-token':token}}),200).id,p.order.id);
      expect(await api(`public/stores/${a.slug}/orders/${p.order.id}`,{headers:{'x-order-token':'y'.repeat(43)}}),404);expect(await api(`public/stores/${b.slug}/orders/${p.order.id}`,{headers:{'x-order-token':token}}),404);
      expect(await op(a,`orders/${p.order.id}/access/revoke`,{},employee),403);expect(await op(a,`orders/${p.order.id}/access/revoke`,{}));expect(await api(`public/stores/${a.slug}/orders/${p.order.id}`,{headers:{'x-order-token':token}}),404);
      assert.equal((await tx(A,t=>rows(t,sql`select count(*)::int as n from shop.notifications where order_id=${p.order.id} and status='SIMULATED'`)))[0].n,mine.length);
    });
    await check('T25: suspensão e pausa bloqueiam novas vendas; pedidos, pagamentos, devoluções e atendimento anteriores continuam',async()=>{
      const pending=await buy(b),owed=await paid(b);expect(await api(`tenants/${B}/purchase/orders/${owed.order.id}/cancel`,{method:'POST',actor:b.actor,body:{reason:'Teste T25'}}));await processAttempt(database,B,pending.attempt);
      await lifecycle(database,B,'SUSPENDED','Ensaio T25 TESTE');
      const r=await api(`public/stores/${b.slug}/cart/items`,{method:'POST',body:{variant_id:b.simple.variant_id,quantity:1}});assert.notEqual(r.status,201);
      expect(await api(`public/stores/${b.slug}/orders/${pending.order.id}`,{cookie:pending.cookie}),200);expect(await api(`public/stores/${b.slug}/orders/${pending.order.id}/attempts`,{method:'POST',cookie:pending.cookie,body:{method:'PIX',key:randomUUID()}}),409);
      await simulate(b,pending.attempt,'APPROVED');assert.equal((await admin(b,pending.order.id)).payment_status,'PAID');
      expect(await op(b,`orders/${pending.order.id}/process`,{}));
      await simulate(b,owed.attempt,'REFUNDED',{amount_cents:(await admin(b,owed.order.id)).total_cents});assert.equal((await admin(b,owed.order.id)).payment_status,'REFUNDED');
      expect(await api(`public/stores/${b.slug}/orders/${pending.order.id}/requests`,{method:'POST',cookie:pending.cookie,body:{kind:'SUPPORT',message:'Loja suspensa ainda me atende?',key:randomUUID()}}));
      expect(await api(`public/stores/${b.slug}/support`,{method:'POST',body:{name:'V',email:'v@example.test',message:'Contato com loja suspensa',key:randomUUID()}}));
      const status=await tenantStatus(database,B);assert.equal(status.suspended,true);
      expect(await api(`tenants/${B}/storefront/publish`,{method:'POST',actor:b.actor,body:{revision_id:b.draft.id}}),409);
      await lifecycle(database,B,'REACTIVATED','Fim do ensaio T25');
      expect(await op(b,'sales/pause',{reason:'Férias TESTE'}));const c=await api(`public/stores/${b.slug}/cart/items`,{method:'POST',body:{variant_id:b.simple.variant_id,quantity:1}});const cookie=c.headers.get('set-cookie').split(';')[0];const q=expect(await api(`public/stores/${b.slug}/cart/quotes`,{method:'POST',cookie,body:{kind:'TABLE',address}}));
      const blocked=await api(`public/stores/${b.slug}/cart/checkout`,{method:'POST',cookie,body:{key:randomUUID(),quote_id:q.id,address,buyer:{name:'X',email:'x@example.test'},method:'PIX',total_cents:q.total_cents}});assert.equal(blocked.status,409);assert.match(blocked.body.error,/suspensas/);
      expect(await op(b,'sales/resume',{reason:'Volta'},b.actor));const events=await tx(B,t=>rows(t,sql`select action from shop.tenant_lifecycle_events order by created_at`));assert.deepEqual(events.map(e=>e.action),['SUSPENDED','REACTIVATED','SALES_PAUSED','SALES_RESUMED']);
    });
    await check('T32 (parte 1): exportação privada com expiração e permissão; eliminação bloqueada em pedido aberto',async()=>{
      expect(await op(a,'exports',{kind:'STORE'},employee),403);const e=expect(await op(a,'exports',{kind:'STORE'}));
      expect(await api(`tenants/${A}/operations/exports/${e.id}`,{actor:a.actor,headers:{'x-export-token':'z'.repeat(43)}}),404);
      const data=expect(await api(`tenants/${A}/operations/exports/${e.id}`,{actor:a.actor,headers:{'x-export-token':e.token}}),200);assert.ok(data.orders.length>5);assert.ok(data.orders.every(o=>o.id));
      expect(await api(`tenants/${B}/operations/exports/${e.id}`,{actor:b.actor,headers:{'x-export-token':e.token}}),404);
      await tx(A,t=>t.execute(sql`update shop.data_exports set expires_at=now()-interval '1 second' where id=${e.id}`));expect(await api(`tenants/${A}/operations/exports/${e.id}`,{actor:a.actor,headers:{'x-export-token':e.token}}),410);
      const consumer=expect(await op(a,'exports',{kind:'CONSUMER',order_id:linkOrder.order.id}));const cd=expect(await api(`tenants/${A}/operations/exports/${consumer.id}`,{actor:a.actor,headers:{'x-export-token':consumer.token}}),200);
      assert.equal(cd.orders.length,1);assert.equal(cd.orders[0].id,linkOrder.order.id);
      const open=await buy(a);expect(await op(a,`orders/${open.order.id}/erase`,{reason:'Titular pediu'}),409);
    });
    await check('Fixtures de recuperação (antes do backup): T26 pagamento pendente/PREPARED e T32 pedido concluído com dados pessoais',async()=>{
      const pendingAttempt=await buy(a);await processAttempt(database,A,pendingAttempt.attempt);const prepared=await buy(a);
      // Crash window: the attempt stays PREPARED and claimed (lease) until after the backup, so the worker cannot send it first.
      await tx(A,t=>t.execute(sql`update shop.payment_attempts set lease_until=now()+interval '1 day' where id=${prepared.attempt}`));
      const done=await paid(a);for(const step of ['process','ship','deliver'])expect(await op(a,`orders/${done.order.id}/${step}`,step==='ship'?{carrier:'TESTE',tracking:'T32'}:{}));
      assert.equal((await admin(a,done.order.id)).order_status,'COMPLETED');
      writeFileSync('/app/artifacts/recovery-fixture.json',JSON.stringify({tenantId:A,slug:a.slug,owner:{cookie:a.actor.cookie,csrf:a.actor.csrf,id:a.actor.id},pending:{order:pendingAttempt.order.id,attempt:pendingAttempt.attempt},prepared:{order:prepared.order.id,attempt:prepared.attempt},erase:{order:done.order.id,email:done.order.buyer.email}},null,2));
    });
    report.passed=failures===0;report.completedAt=new Date().toISOString();
  }finally{await database.pool.end();writeFileSync('/app/artifacts/operations.json',JSON.stringify(report,null,2));}
});

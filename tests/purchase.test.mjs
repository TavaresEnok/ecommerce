import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { createDatabase, newId, rows, sql, withTenant } from '@ecommerce/database';
import { processAttempt, processInbox, consume, expire, settle, attemptData, allocate, SimulatedGateway } from '@ecommerce/purchase';
import { seed,client } from '../scripts/seed.mjs';
// Deterministic core: the verifier stops the worker, so this file is the only processor of attempts, inbox and outbox.
assert.equal(process.env.APP_ENV,'test');assert.equal(process.env.PAYMENT_SIMULATION,'true');const base=process.env.BASE_URL;assert.equal(new URL(base).hostname,'web');
const api=client(base),report={passed:false,simulation:true,externalHomologation:false,criteria:['T03','T04','T05','T06','T07','T08','T09','T10','T11','T12','T13','T14','T15','T16','T17','T19','T20','T24','T35 (núcleo)','T36 (protocolo/confirmação)'],tests:[]};
const address={cep:'01001000',street:'Rua TESTE',number:'1',city:'São Paulo TESTE',state:'SP',complement:''};
const expect=(r,status=201)=>{assert.equal(r.status,status,JSON.stringify(r.body));return r.body;};
const fk=e=>(e.cause?.code||e.code)==='23503',rls=e=>(e.cause?.code||e.code)==='42501';
test('Fase 3: compra, estoque e pagamentos com PostgreSQL real e provedor SIMULADO',async t=>{
  const database=createDatabase(process.env.DATABASE_URL,4);
  let failures=0;
  const check=async(name,fn)=>{let passed=false;await t.test(name,async()=>{await fn();passed=true;});if(!passed)failures++;report.tests.push({name,result:passed?'passed':'failed'});};
  let a,b,A,B,employee;
  const tx=(tenant,fn)=>withTenant(database,tenant,null,fn);
  const stock=async(s,variant)=>(await tx(s.id,t=>rows(t,sql`select on_hand,reserved from shop.inventory_items where variant_id=${variant}`)))[0];
  const adjust=async(s,variant,delta)=>expect(await api(`tenants/${s.id}/catalogue/adjustments`,{method:'POST',actor:s.actor,body:{variant_id:variant,location_id:s.location.id,delta,reason:'Ajuste de teste da Fase 3'}}));
  const admin=async(s,orderId,actor=s.actor)=>expect(await api(`tenants/${s.id}/purchase/orders/${orderId}`,{actor}),200);
  async function cart(s,lines){let cookie;for(const [variant_id,quantity] of lines){const r=await api(`public/stores/${s.slug}/cart/items`,{method:'POST',cookie,body:{variant_id,quantity}});expect(r);cookie??=r.headers.get('set-cookie').split(';')[0];}const quote=expect(await api(`public/stores/${s.slug}/cart/quotes`,{method:'POST',cookie,body:{kind:'TABLE',address}}));return {cookie,quote};}
  const checkout=(s,c,over={})=>api(`public/stores/${s.slug}/cart/checkout`,{method:'POST',cookie:c.cookie,body:{key:c.key??=randomUUID(),quote_id:c.quote.id,address,buyer:{name:'Comprador TESTE',email:'comprador@example.test'},method:'PIX',total_cents:c.quote.total_cents,...over}});
  async function order(s,lines){const c=await cart(s,lines),o=expect(await checkout(s,c));return {...c,order:o,attempt:o.attempts[0].id};}
  const simulate=async(s,attempt,status,extra={})=>{expect(await api(`tenants/${s.id}/purchase/attempts/${attempt}/simulate`,{method:'POST',actor:s.actor,body:{status,...extra}}));await processInbox(database,s.id);};
  const incidents=async(s,orderId)=>(await admin(s,orderId)).incidents;
  const age=(s,orderId,reservedMinutes,expiresMinutes)=>tx(s.id,t=>t.execute(sql`update shop.orders set reserved_at=now()-make_interval(mins=>${reservedMinutes}),reservation_expires_at=now()-make_interval(mins=>${expiresMinutes}) where id=${orderId}`));
  try {
    [a,b]=await seed(api,`p3${randomBytes(4).toString('hex')}`);A=a.id;B=b.id;
    for(const s of [a,b]){expect(await api(`tenants/${s.id}/purchase/accounts/simulated`,{method:'POST',actor:s.actor}));await adjust(s,s.simple.variant_id,200);}
    const email=`func-${randomBytes(4).toString('hex')}@example.test`,password=randomBytes(18).toString('base64url'),reg=expect(await api('auth/register',{method:'POST',body:{email,password}}));expect(await api('auth/verify-email',{method:'POST',body:{token:reg.localToken}}));
    const relog=await api('auth/login',{method:'POST',body:{email,password}});expect(relog);employee={id:relog.body.user.id,csrf:relog.body.csrf,cookie:relog.headers.get('set-cookie').split(';')[0]};
    const invite=expect(await api(`tenants/${A}/invitations`,{method:'POST',actor:a.actor,body:{email}}));expect(await api('invitations/accept',{method:'POST',actor:employee,body:{tenantId:A,token:invite.localToken}}));
    let paid;
    await check('Fluxo principal: checkout, snapshots, reserva integral, outbox e baixa única após confirmação autoritativa',async()=>{
      const before=await stock(a,a.simple.variant_id),p=await order(a,[[a.simple.variant_id,2]]);paid=p;
      assert.equal(p.order.order_status,'OPEN');assert.equal(p.order.payment_status,'PENDING');assert.equal(p.order.fulfillment_status,'UNFULFILLED');assert.equal(p.order.total_cents,(2n*2990n+1500n).toString());assert.equal(p.order.simulation,true);
      assert.equal(p.order.history,undefined);assert.equal(p.order.principal_id,undefined);
      const reserved=await stock(a,a.simple.variant_id);assert.equal(reserved.reserved,before.reserved+2);assert.equal(reserved.on_hand,before.on_hand);
      const events=await tx(A,t=>rows(t,sql`select type,published_at,executed_at from shop.purchase_outbox where aggregate_id=${p.order.id}`));assert.deepEqual(events.map(e=>e.type),['CHECKOUT_CREATED']);assert.equal(events[0].published_at,null);
      await processAttempt(database,A,p.attempt);assert.equal((await admin(a,p.order.id)).attempts[0].status,'PENDING');
      await simulate(a,p.attempt,'APPROVED');const o=await admin(a,p.order.id);assert.equal(o.payment_status,'PAID');assert.equal(o.transactions.length,1);assert.equal(o.transactions[0].classification,'PRINCIPAL');
      const after=await stock(a,a.simple.variant_id);assert.equal(after.on_hand,before.on_hand-2);assert.equal(after.reserved,before.reserved);
      const movements=await tx(A,t=>rows(t,sql`select m.reason,m.delta,m.reserved_delta from shop.inventory_movements m join shop.inventory_reservations r on (r.tenant_id,r.id)=(m.tenant_id,m.reservation_id) where r.order_id=${p.order.id} order by m.created_at`));assert.deepEqual(movements.map(m=>m.reason),['RESERVE','CONSUME']);
      assert.ok(o.history.some(h=>h.event==='PAYMENT_RECEIVED'));
    });
    await check('T03: FKs compostas e RLS impedem vínculos de compra entre lojas',async()=>{
      await assert.rejects(tx(A,t=>t.execute(sql`insert into shop.order_items(id,tenant_id,order_id,variant_id,quantity,price_cents,snapshot) values(${newId()},${A},${paid.order.id},${b.simple.variant_id},1,1,'{}')`)),fk);
      const itemB=(await tx(B,t=>rows(t,sql`select id from shop.inventory_items limit 1`)))[0];
      await assert.rejects(tx(A,t=>t.execute(sql`insert into shop.inventory_reservations(id,tenant_id,order_id,item_id,quantity,status) values(${newId()},${A},${paid.order.id},${itemB.id},1,'ACTIVE')`)),fk);
      await assert.rejects(tx(A,t=>t.execute(sql`insert into shop.order_incidents(id,tenant_id,order_id,code,operation_key) values(${newId()},${B},${paid.order.id},'X',${newId()})`)),e=>rls(e)||fk(e));
      for(const table of ['orders','order_items','payment_attempts','payment_transactions','order_incidents','purchase_outbox','payment_inbox','consumer_requests','order_address_corrections','simulated_payments']){assert.equal((await database.pool.query(`select * from shop.${table}`)).rowCount,0);const seen=await tx(B,t=>t.execute(sql.raw(`select tenant_id from shop.${table}`)));for(const r of seen.rows)assert.equal(r.tenant_id,B);}
      const forced=await database.pool.query("select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='shop' and c.relkind='r' and not (c.relrowsecurity and c.relforcerowsecurity)");assert.equal(forced.rowCount,0);
    });
    await check('T04: comprador só acessa o pedido do próprio carrinho; número/ID não autorizam',async()=>{
      const other=await cart(a,[[a.simple.variant_id,1]]);
      expect(await api(`public/stores/${a.slug}/orders/${paid.order.id}`,{cookie:other.cookie}),404);expect(await api(`public/stores/${a.slug}/orders/${paid.order.id}`),404);
      expect(await api(`public/stores/${b.slug}/orders/${paid.order.id}`,{cookie:paid.cookie}),404);
      expect(await api(`public/stores/${a.slug}/orders/${paid.order.id}/requests`,{method:'POST',cookie:other.cookie,body:{kind:'SUPPORT',message:'Tentativa indevida',key:'x'}}),404);
      const own=expect(await api(`public/stores/${a.slug}/orders/${paid.order.id}`,{cookie:paid.cookie}),200);assert.equal(own.payment_status,'PAID');assert.equal(own.history,undefined);assert.ok(own.incidents.every(i=>!('note' in i)));
      expect(await api(`tenants/${B}/purchase/orders/${paid.order.id}`,{actor:a.actor}),404);expect(await api(`tenants/${A}/purchase/orders/${paid.order.id}`,{actor:b.actor}),404);
    });
    await check('T05: funcionário lê pedidos, mas não configura gateway, cancela pago, resolve incidente ou simula',async()=>{
      expect(await api(`tenants/${A}/purchase/orders`,{actor:employee}),200);expect(await api(`tenants/${A}/purchase/orders/${paid.order.id}`,{actor:employee}),200);
      expect(await api(`tenants/${A}/purchase/accounts/simulated`,{method:'POST',actor:employee}),403);
      expect(await api(`tenants/${A}/purchase/orders/${paid.order.id}/cancel`,{method:'POST',actor:employee,body:{reason:'Indevido'}}),403);
      expect(await api(`tenants/${A}/purchase/orders/${paid.order.id}/reallocate`,{method:'POST',actor:employee}),403);
      expect(await api(`tenants/${A}/purchase/attempts/${paid.attempt}/simulate`,{method:'POST',actor:employee,body:{status:'APPROVED'}}),403);
      expect(await api(`tenants/${A}/purchase/orders/${paid.order.id}/address`,{method:'POST',actor:employee,body:{address,reason:'x'}}),403);
      const accounts=expect(await api(`tenants/${A}/purchase/accounts`,{actor:a.actor}),200);expect(await api(`tenants/${A}/purchase/accounts/${accounts[0].id}/revoke`,{method:'POST',actor:employee}),403);
      assert.equal((await admin(a,paid.order.id)).order_status,'OPEN');
    });
    await check('T06: duas compras concorrentes da última unidade — uma reserva integral vence',async()=>{
      const variant=a.variants[0].id,current=await stock(a,variant);await adjust(a,variant,1-(current.on_hand-current.reserved));
      const [x,y]=[await cart(a,[[variant,1]]),await cart(a,[[variant,1]])],count=async()=>(await tx(A,t=>rows(t,sql`select count(*)::int as n from shop.orders`)))[0].n,orders=await count();
      const results=await Promise.all([checkout(a,x),checkout(a,y)]);assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
      const s=await stock(a,variant);assert.equal(s.on_hand-s.reserved,0);assert.ok(s.reserved<=s.on_hand);
      assert.equal(await count(),orders+1);
    });
    await check('T07: carrinho com item indisponível não deixa pedido nem reserva parcial',async()=>{
      const variant=a.variants[1].id,c=await cart(a,[[a.simple.variant_id,1],[variant,2]]),reservations=(await tx(A,t=>rows(t,sql`select count(*)::int as n from shop.inventory_reservations`)))[0].n,orders=(await tx(A,t=>rows(t,sql`select count(*)::int as n from shop.orders`)))[0].n;
      const current=await stock(a,variant);await adjust(a,variant,1-(current.on_hand-current.reserved));
      expect(await checkout(a,c),409);
      assert.equal((await tx(A,t=>rows(t,sql`select count(*)::int as n from shop.inventory_reservations`)))[0].n,reservations);assert.equal((await tx(A,t=>rows(t,sql`select count(*)::int as n from shop.orders`)))[0].n,orders);
      const items=[{variant_id:a.simple.variant_id,quantity:1,price_cents:'2990'},{variant_id:variant,quantity:2,price_cents:'5100'}];
      await assert.rejects(tx(A,async t=>{assert.equal(await allocate(t,A,paid.order.id,items),false);assert.equal((await rows(t,sql`select count(*)::int as n from shop.inventory_reservations`))[0].n,reservations);throw new Error('rollback');}),/rollback/);
      await adjust(a,variant,20);
    });
    let pending;
    await check('T08/T09: mesma chave e nova chave retornam o mesmo pedido; conteúdo diferente gera conflito',async()=>{
      const c=await cart(a,[[a.simple.variant_id,1]]),first=expect(await checkout(a,c));pending={...c,order:first,attempt:first.attempts[0].id};
      assert.equal(expect(await checkout(a,c)).id,first.id);const again={...c,key:randomUUID()};assert.equal(expect(await checkout(a,again)).id,first.id);
      expect(await checkout(a,c,{method:'CARD'}),409);
      const counts=(await tx(A,t=>rows(t,sql`select (select count(*)::int from shop.payment_attempts where order_id=${first.id}) as attempts,(select count(*)::int from shop.inventory_reservations where order_id=${first.id}) as reservations`)))[0];assert.deepEqual(counts,{attempts:1,reservations:1});
    });
    await check('T10: preço/frete alterados ou total adulterado exigem nova confirmação',async()=>{
      const c=await cart(a,[[a.variants[1].id,1]]);expect(await checkout(a,c,{total_cents:'1'}),409);
      expect(await api(`tenants/${A}/catalogue/variants/${a.variants[1].id}`,{method:'PATCH',actor:a.actor,body:{price_cents:'5300'}}),200);
      expect(await checkout(a,c),409);
      const fresh=expect(await api(`public/stores/${a.slug}/cart/quotes`,{method:'POST',cookie:c.cookie,body:{kind:'TABLE',address}}));assert.equal(fresh.total_cents,'6800');
      const o=expect(await checkout(a,{...c,quote:fresh,key:randomUUID()}));assert.equal(o.total_cents,'6800');assert.equal(o.items[0].price_cents,'5300');
      expect(await api(`tenants/${A}/catalogue/variants/${a.variants[1].id}`,{method:'PATCH',actor:a.actor,body:{price_cents:'5100'}}),200);
    });
    await check('T11: criação recebida com resposta perdida e criação nunca entregue — mesma operação, sem duplicar',async()=>{
      await processAttempt(database,A,pending.attempt,new SimulatedGateway(database,true));
      let o=await admin(a,pending.order.id);assert.equal(o.attempts[0].status,'UNKNOWN');assert.ok(o.incidents.some(i=>i.code==='GATEWAY_UNAVAILABLE'&&i.status==='OPEN'));
      expect(await api(`public/stores/${a.slug}/orders/${pending.order.id}/attempts`,{method:'POST',cookie:pending.cookie,body:{method:'CARD',key:randomUUID()}}),409);
      await tx(A,t=>t.execute(sql`update shop.payment_attempts set lease_until=null where id=${pending.attempt}`));await processAttempt(database,A,pending.attempt);
      o=await admin(a,pending.order.id);assert.equal(o.attempts[0].status,'PENDING');assert.ok(o.incidents.every(i=>i.code!=='GATEWAY_UNAVAILABLE'||i.status==='RESOLVED'));
      assert.equal((await tx(A,t=>rows(t,sql`select count(*)::int as n from shop.simulated_payments where reference=${pending.attempt}`)))[0].n,1);
      const lost=await order(a,[[a.simple.variant_id,1]]),real=new SimulatedGateway(database);
      await processAttempt(database,A,lost.attempt,{create:async()=>{throw new Error('NETWORK_BEFORE_PROVIDER');},search:(t,x)=>real.search(t,x),get:(t,x,i)=>real.get(t,x,i)});
      assert.equal((await admin(a,lost.order.id)).attempts[0].status,'UNKNOWN');assert.equal((await tx(A,t=>rows(t,sql`select count(*)::int as n from shop.simulated_payments where reference=${lost.attempt}`)))[0].n,0);
      await tx(A,t=>t.execute(sql`update shop.payment_attempts set lease_until=null where id=${lost.attempt}`));await processAttempt(database,A,lost.attempt);await processAttempt(database,A,lost.attempt);
      assert.equal((await admin(a,lost.order.id)).attempts[0].status,'PENDING');assert.equal((await tx(A,t=>rows(t,sql`select count(*)::int as n from shop.simulated_payments where reference=${lost.attempt}`)))[0].n,1);
    });
    await check('T12: webhook repetido, consulta repetida e fato fora de ordem — um reconhecimento, sem regressão',async()=>{
      const accountId=(await tx(A,t=>rows(t,sql`select account_id from shop.payment_attempts where id=${paid.attempt}`)))[0].account_id;
      const resource=(await tx(A,t=>rows(t,sql`select id from shop.simulated_payments where reference=${paid.attempt}`)))[0].id,before=await stock(a,a.simple.variant_id);
      const {signature,decrypt}=await import('@ecommerce/purchase');const cipher=(await tx(A,t=>rows(t,sql`select credentials_cipher from shop.payment_accounts where id=${accountId}`)))[0].credentials_cipher,secret=decrypt(cipher,`${A}:${accountId}`);
      const eventId=newId(),ts=String(Date.now()),header=`ts=${ts},v1=${signature(secret,resource,eventId,ts)}`;
      for(let i=0;i<3;i++)expect(await api(`payments/simulated/${accountId}/webhook`,{method:'POST',headers:{'x-request-id':eventId,'x-signature':header},body:{event_id:eventId,resource_id:resource}}));
      assert.equal((await tx(A,t=>rows(t,sql`select count(*)::int as n from shop.payment_inbox where event_id=${eventId}`)))[0].n,1);await processInbox(database,A);
      await tx(A,t=>t.execute(sql`update shop.payment_attempts set next_check_at=now(),lease_until=null where id=${paid.attempt}`));await processAttempt(database,A,paid.attempt);
      const attempt=await tx(A,t=>attemptData(t,paid.attempt));await tx(A,t=>settle(t,A,attempt,{id:resource,reference:paid.attempt,seller_id:attempt.seller_id,environment:'SIMULATED',status:'PENDING',amount_cents:attempt.expected_cents,currency:'BRL',approved_at:null,refunds:[],dispute:null}));
      const o=await admin(a,paid.order.id);assert.equal(o.payment_status,'PAID');assert.equal(o.attempts[0].status,'APPROVED');assert.equal(o.transactions.length,1);assert.deepEqual(await stock(a,a.simple.variant_id),before);
    });
    await check('T13: assinatura inválida, vendedor/moeda/valor incompatíveis não confirmam pagamento',async()=>{
      const accountId=(await tx(A,t=>rows(t,sql`select account_id from shop.payment_attempts where id=${pending.attempt}`)))[0].account_id,resource=(await tx(A,t=>rows(t,sql`select id from shop.simulated_payments where reference=${pending.attempt}`)))[0].id,inbox=(await tx(A,t=>rows(t,sql`select count(*)::int as n from shop.payment_inbox`)))[0].n;
      expect(await api(`payments/simulated/${accountId}/webhook`,{method:'POST',headers:{'x-request-id':'r1','x-signature':`ts=${Date.now()},v1=${'0'.repeat(64)}`},body:{event_id:'forjado',resource_id:resource}}),401);
      expect(await api(`payments/simulated/${accountId}/webhook`,{method:'POST',headers:{'x-request-id':'r1','x-signature':`ts=${Date.now()-600000},v1=${'0'.repeat(64)}`},body:{event_id:'antigo',resource_id:resource}}),401);
      assert.equal((await tx(A,t=>rows(t,sql`select count(*)::int as n from shop.payment_inbox`)))[0].n,inbox);
      const attempt=await tx(A,t=>attemptData(t,pending.attempt));await tx(A,t=>settle(t,A,attempt,{id:'forjado-1',reference:pending.attempt,seller_id:'outro-vendedor',environment:'SIMULATED',status:'APPROVED',amount_cents:attempt.expected_cents,currency:'BRL',approved_at:new Date(),refunds:[],dispute:null}));
      let o=await admin(a,pending.order.id);assert.notEqual(o.payment_status,'PAID');assert.equal(o.transactions.length,0);assert.ok(o.incidents.some(i=>i.code==='GATEWAY_IDENTITY_MISMATCH'));
      await tx(A,t=>t.execute(sql`update shop.simulated_payments set amount_cents=amount_cents-1 where reference=${pending.attempt}`));await simulate(a,pending.attempt,'APPROVED');
      o=await admin(a,pending.order.id);assert.notEqual(o.payment_status,'PAID');assert.equal(o.transactions[0].classification,'INCOMPATIBLE');assert.ok(o.incidents.some(i=>i.code==='PAYMENT_VALUE_MISMATCH'&&i.status==='OPEN'));assert.ok(o.incidents.some(i=>i.code==='REFUND_ACTION_REQUIRED'&&i.status==='OPEN'));
      const usd=await order(a,[[a.simple.variant_id,1]]);await processAttempt(database,A,usd.attempt);await tx(A,t=>t.execute(sql`update shop.simulated_payments set currency='USD' where reference=${usd.attempt}`));await simulate(a,usd.attempt,'APPROVED');
      o=await admin(a,usd.order.id);assert.notEqual(o.payment_status,'PAID');assert.equal(o.transactions[0].classification,'INCOMPATIBLE');
    });
    await check('T14: confirmação concorrente com expiração — estado serializado, sem baixa ou liberação dupla',async()=>{
      for(let i=0;i<3;i++){const before=await stock(a,a.simple.variant_id),p=await order(a,[[a.simple.variant_id,1]]);await processAttempt(database,A,p.attempt);
        expect(await api(`tenants/${A}/purchase/attempts/${p.attempt}/simulate`,{method:'POST',actor:a.actor,body:{status:'APPROVED'}}));await age(a,p.order.id,61,1);
        await Promise.all([tx(A,t=>expire(t,A,p.order.id)),processInbox(database,A)]);
        const o=await admin(a,p.order.id),after=await stock(a,a.simple.variant_id),r=await tx(A,t=>rows(t,sql`select status,quantity from shop.inventory_reservations where order_id=${p.order.id}`));
        assert.equal(o.payment_status,'PAID');assert.equal(r.filter(x=>x.status==='ACTIVE').length,0);assert.equal(r.filter(x=>x.status==='CONSUMED').reduce((s,x)=>s+x.quantity,0),1);
        assert.equal(after.on_hand,before.on_hand-1);assert.equal(after.reserved,before.reserved);assert.ok(o.incidents.every(i=>i.status==='RESOLVED'||!['PAYMENT_UNCERTAIN','PAID_WITHOUT_STOCK'].includes(i.code)));}
    });
    await check('Expiração: gateway confirma encerramento → libera e cancela; incerteza só libera após 60 min sem declarar não pago',async()=>{
      const p=await order(a,[[a.simple.variant_id,1]]);await processAttempt(database,A,p.attempt);await age(a,p.order.id,10,1);
      await tx(A,t=>expire(t,A,p.order.id));let o=await admin(a,p.order.id);assert.equal(o.order_status,'OPEN');assert.equal((await tx(A,t=>rows(t,sql`select count(*)::int as n from shop.inventory_reservations where order_id=${p.order.id} and status='ACTIVE'`)))[0].n,1);
      await tx(A,t=>t.execute(sql`update shop.simulated_payments set expires_at=now()-interval '1 minute' where reference=${p.attempt}`));await tx(A,t=>t.execute(sql`update shop.payment_attempts set lease_until=null where id=${p.attempt}`));await processAttempt(database,A,p.attempt);
      o=await admin(a,p.order.id);assert.equal(o.attempts[0].status,'EXPIRED');assert.equal(o.payment_status,'UNPAID');assert.equal(o.order_status,'CANCELLED');assert.ok(o.history.some(h=>h.event==='RESERVATION_RELEASED'));
      const u=await order(a,[[a.simple.variant_id,1]]);await processAttempt(database,A,u.attempt);await age(a,u.order.id,61,5);await tx(A,t=>expire(t,A,u.order.id));
      o=await admin(a,u.order.id);assert.equal(o.order_status,'OPEN');assert.equal(o.payment_status,'PENDING');assert.ok(o.incidents.some(i=>i.code==='PAYMENT_UNCERTAIN'&&i.status==='OPEN'));
      expect(await api(`public/stores/${a.slug}/orders/${u.order.id}/attempts`,{method:'POST',cookie:u.cookie,body:{method:'PIX',key:randomUUID()}}),409);
    });
    await check('T15: aprovação após liberação — realoca com saldo; sem saldo abre PAID_WITHOUT_STOCK e bloqueia até realocação do Dono',async()=>{
      const p=await order(a,[[a.simple.variant_id,1]]);await processAttempt(database,A,p.attempt);await age(a,p.order.id,61,5);await tx(A,t=>expire(t,A,p.order.id));
      const before=await stock(a,a.simple.variant_id);await simulate(a,p.attempt,'APPROVED');let o=await admin(a,p.order.id);
      assert.equal(o.payment_status,'PAID');assert.ok(o.incidents.every(i=>i.code!=='PAID_WITHOUT_STOCK'));assert.equal((await stock(a,a.simple.variant_id)).on_hand,before.on_hand-1);assert.ok(o.incidents.find(i=>i.code==='PAYMENT_UNCERTAIN').status==='RESOLVED');
      const variant=a.variants[1].id,q=await order(a,[[variant,1]]);await processAttempt(database,A,q.attempt);await age(a,q.order.id,61,5);await tx(A,t=>expire(t,A,q.order.id));
      const s=await stock(a,variant);await adjust(a,variant,-(s.on_hand-s.reserved));await simulate(a,q.attempt,'APPROVED');o=await admin(a,q.order.id);
      assert.equal(o.payment_status,'PAID');assert.ok(o.incidents.some(i=>i.code==='PAID_WITHOUT_STOCK'&&i.status==='OPEN'));assert.ok(o.incidents.some(i=>i.code==='REFUND_ACTION_REQUIRED'&&i.status==='OPEN'));assert.equal(o.transactions.length,1);
      expect(await api(`tenants/${A}/purchase/orders/${q.order.id}/reallocate`,{method:'POST',actor:a.actor}),409);
      await adjust(a,variant,1);expect(await api(`tenants/${A}/purchase/orders/${q.order.id}/reallocate`,{method:'POST',actor:a.actor}));
      o=await admin(a,q.order.id);assert.ok(o.incidents.every(i=>i.status==='RESOLVED'||!['PAID_WITHOUT_STOCK','REFUND_ACTION_REQUIRED'].includes(i.code)));assert.ok(o.history.some(h=>h.event==='STOCK_REALLOCATED'));
      const after=await stock(a,variant);assert.equal(after.on_hand-after.reserved,0);await adjust(a,variant,20);
    });
    await check('T16: duas tentativas pagas — dois recebimentos, uma baixa, excedente acompanhado até devolução confirmada',async()=>{
      const before=await stock(a,a.simple.variant_id),p=await order(a,[[a.simple.variant_id,1]]);await processAttempt(database,A,p.attempt);
      expect(await api(`public/stores/${a.slug}/orders/${p.order.id}/attempts`,{method:'POST',cookie:p.cookie,body:{method:'CARD',key:randomUUID()}}),409);
      await simulate(a,p.attempt,'REJECTED');assert.equal((await admin(a,p.order.id)).attempts[0].status,'REJECTED');
      const key=randomUUID(),retry=expect(await api(`public/stores/${a.slug}/orders/${p.order.id}/attempts`,{method:'POST',cookie:p.cookie,body:{method:'CARD',key}}));assert.equal(retry.attempts.length,2);
      assert.equal(expect(await api(`public/stores/${a.slug}/orders/${p.order.id}/attempts`,{method:'POST',cookie:p.cookie,body:{method:'CARD',key}})).attempts.length,2);
      const second=retry.attempts[1].id;await processAttempt(database,A,second);await simulate(a,second,'APPROVED');await simulate(a,p.attempt,'APPROVED');
      let o=await admin(a,p.order.id);assert.equal(o.payment_status,'PAID');assert.deepEqual(o.transactions.map(t=>t.classification).sort(),['EXCESS','PRINCIPAL']);
      assert.ok(o.incidents.some(i=>i.code==='EXCESS_PAYMENT'&&i.status==='OPEN'));assert.equal((await stock(a,a.simple.variant_id)).on_hand,before.on_hand-1);
      const owed=o.incidents.find(i=>i.code==='REFUND_ACTION_REQUIRED');expect(await api(`tenants/${A}/purchase/orders/${p.order.id}/incidents/${owed.id}/note`,{method:'POST',actor:a.actor,body:{note:'Devolvido no painel MP, ref TESTE'}}));
      o=await admin(a,p.order.id);assert.equal(o.incidents.find(i=>i.id===owed.id).status,'OPEN');
      await simulate(a,p.attempt,'REFUNDED',{amount_cents:o.total_cents});o=await admin(a,p.order.id);
      assert.equal(o.payment_status,'PAID');assert.ok(o.incidents.filter(i=>['EXCESS_PAYMENT','REFUND_ACTION_REQUIRED'].includes(i.code)).every(i=>i.status==='RESOLVED'&&i.due_cents==='0'));
    });
    await check('T17/T35: aprovação em pedido cancelado não reabre; devolução externa repetida/atrasada concilia uma vez; anotação não fabrica status',async()=>{
      const before=await stock(a,a.simple.variant_id),p=await order(a,[[a.simple.variant_id,1]]);await processAttempt(database,A,p.attempt);
      expect(await api(`tenants/${A}/purchase/orders/${p.order.id}/cancel`,{method:'POST',actor:a.actor,body:{reason:'Comprador desistiu'}}),409);
      await simulate(a,p.attempt,'REJECTED');expect(await api(`tenants/${A}/purchase/orders/${p.order.id}/cancel`,{method:'POST',actor:a.actor,body:{reason:'Comprador desistiu'}}));
      assert.deepEqual(await stock(a,a.simple.variant_id),before);
      await simulate(a,p.attempt,'APPROVED');let o=await admin(a,p.order.id);assert.equal(o.order_status,'CANCELLED');assert.equal(o.fulfillment_status,'UNFULFILLED');assert.equal(o.transactions.length,1);assert.deepEqual(await stock(a,a.simple.variant_id),before);
      const owed=o.incidents.find(i=>i.code==='REFUND_ACTION_REQUIRED');assert.equal(owed.status,'OPEN');assert.equal(owed.due_cents,o.total_cents);
      expect(await api(`tenants/${A}/purchase/orders/${p.order.id}/incidents/${owed.id}/note`,{method:'POST',actor:a.actor,body:{note:'Comprovante enviado pelo operador'}}));assert.notEqual((await admin(a,p.order.id)).payment_status,'REFUNDED');
      await simulate(a,p.attempt,'REFUNDED',{amount_cents:'1000'});o=await admin(a,p.order.id);assert.equal(o.payment_status,'PARTIALLY_REFUNDED');assert.equal(o.incidents.find(i=>i.id===owed.id).status,'OPEN');assert.equal(o.incidents.find(i=>i.id===owed.id).due_cents,(BigInt(o.total_cents)-1000n).toString());
      await tx(A,t=>t.execute(sql`update shop.payment_attempts set lease_until=null,next_check_at=now() where id=${p.attempt}`));await processAttempt(database,A,p.attempt);await processAttempt(database,A,p.attempt);
      assert.equal((await tx(A,t=>rows(t,sql`select count(*)::int as n from shop.payment_refunds r join shop.payment_transactions x on (x.tenant_id,x.id)=(r.tenant_id,r.transaction_id) where x.order_id=${p.order.id}`)))[0].n,1);
      await simulate(a,p.attempt,'REFUNDED',{amount_cents:(BigInt(o.total_cents)-1000n).toString()});o=await admin(a,p.order.id);
      assert.equal(o.payment_status,'REFUNDED');assert.equal(o.incidents.find(i=>i.id===owed.id).status,'RESOLVED');assert.equal(o.order_status,'CANCELLED');assert.deepEqual(await stock(a,a.simple.variant_id),before);
      expect(await api(`tenants/${A}/purchase/attempts/${p.attempt}/simulate`,{method:'POST',actor:a.actor,body:{status:'REFUNDED',amount_cents:'1'}}),400);
    });
    await check('T19: devolução parcial e disputa preservam fatos sem apagar pagamento ou entrega',async()=>{
      const p=await order(a,[[a.simple.variant_id,1]]);await processAttempt(database,A,p.attempt);await simulate(a,p.attempt,'APPROVED');
      await simulate(a,p.attempt,'REFUNDED',{amount_cents:'500'});let o=await admin(a,p.order.id);assert.equal(o.payment_status,'PARTIALLY_REFUNDED');assert.ok(o.incidents.some(i=>i.code==='PARTIAL_REFUND_REVIEW'&&i.status==='OPEN'));assert.equal(o.transactions[0].refunded_cents,'500');
      await simulate(a,p.attempt,'DISPUTED');o=await admin(a,p.order.id);assert.equal(o.dispute_status,'OPEN');assert.equal(o.payment_status,'PARTIALLY_REFUNDED');assert.equal(o.fulfillment_status,'UNFULFILLED');
      await simulate(a,p.attempt,'DISPUTE_LOST');o=await admin(a,p.order.id);assert.equal(o.dispute_status,'LOST');assert.equal(o.payment_status,'CHARGED_BACK');assert.equal(o.transactions[0].refunded_cents,'500');assert.equal(o.transactions.length,1);
      await tx(A,t=>t.execute(sql`update shop.payment_attempts set lease_until=null where id=${p.attempt}`));await processAttempt(database,A,p.attempt);o=await admin(a,p.order.id);assert.equal(o.dispute_status,'LOST');assert.equal(o.payment_status,'CHARGED_BACK');
      assert.ok(o.history.some(h=>h.event==='DISPUTE_UPDATED'));
    });
    await check('T20: falha entre commit e publicação — evento durável, consumo repetido/concorrente sem efeito duplicado',async()=>{
      const p=await order(a,[[a.simple.variant_id,1]]),[e]=await tx(A,t=>rows(t,sql`select id,published_at,executed_at from shop.purchase_outbox where aggregate_id=${p.order.id}`));assert.equal(e.published_at,null);assert.equal(e.executed_at,null);
      await assert.rejects(consume(database,B,e.id),/Event not in tenant/);
      await Promise.all([consume(database,A,e.id),consume(database,A,e.id),consume(database,A,e.id)]);await consume(database,A,e.id);
      const receipts=await tx(A,t=>rows(t,sql`select count(*)::int as n from shop.purchase_receipts where event_id=${e.id}`));assert.equal(receipts[0].n,1);
      assert.notEqual((await tx(A,t=>rows(t,sql`select executed_at from shop.purchase_outbox where id=${e.id}`)))[0].executed_at,null);
      const numbers=await tx(A,t=>rows(t,sql`select number from shop.orders order by number`));assert.equal(new Set(numbers.map(n=>n.number)).size,numbers.length);
    });
    await check('T24: alterar produto, fornecedor e tema após compra preserva snapshots; correção de endereço auditada',async()=>{
      expect(await api(`tenants/${A}/catalogue/variants/${a.simple.variant_id}`,{method:'PATCH',actor:a.actor,body:{price_cents:'3190'}}),200);
      expect(await api(`tenants/${A}/storefront/profile`,{method:'POST',actor:a.actor,body:{synthetic:true,name:'Fornecedor ALTERADO TESTE',document:'',address:'Novo endereço TESTE',email:'novo@example.test',phone:'TESTE',policies:'Políticas v2 TESTE',delivery:'TESTE',risks:'TESTE'}}));
      const draft=expect(await api(`tenants/${A}/storefront/draft`,{method:'POST',actor:a.actor,body:{schema_version:1,title:'TEMA NOVO TESTE',description:'x',color:'#111111',font:'system',hero:'x',pages:[],menu:[],assets:[]}}));expect(await api(`tenants/${A}/storefront/publish`,{method:'POST',actor:a.actor,body:{revision_id:draft.id}}));
      let o=await admin(a,paid.order.id);assert.equal(o.items[0].price_cents,'2990');assert.equal(o.items[0].snapshot.name,'Caneca café aurora');assert.equal(o.supplier.name,'Fornecedor AURORA TESTE');assert.equal(o.total_cents,'7480');
      await assert.rejects(tx(A,t=>t.execute(sql`update shop.order_items set price_cents=1 where order_id=${paid.order.id}`)),rls);
      const corrected={...address,street:'Rua CORRIGIDA TESTE'};expect(await api(`tenants/${A}/purchase/orders/${paid.order.id}/address`,{method:'POST',actor:a.actor,body:{address:corrected,reason:'Comprador informou número do prédio'}}));
      o=await admin(a,paid.order.id);assert.equal(o.address.street,'Rua TESTE');assert.equal(o.address_corrections[0].address.street,'Rua CORRIGIDA TESTE');assert.ok(o.history.some(h=>h.event==='ADDRESS_CORRECTED'));
      await assert.rejects(tx(A,t=>t.execute(sql`update shop.order_address_corrections set reason='x'`)),rls);
      expect(await api(`tenants/${A}/catalogue/variants/${a.simple.variant_id}`,{method:'PATCH',actor:a.actor,body:{price_cents:'2990'}}),200);
    });
    await check('T36 (protocolo): solicitação durável, confirmação imediata, idempotente e com acesso autorizado',async()=>{
      const key=randomUUID(),r=expect(await api(`public/stores/${a.slug}/orders/${paid.order.id}/requests`,{method:'POST',cookie:paid.cookie,body:{kind:'WITHDRAWAL',message:'Quero exercer o arrependimento.',key}}));
      assert.ok(r.id);assert.ok(r.created_at);assert.match(r.acknowledgement,/não confirma/);
      assert.equal(expect(await api(`public/stores/${a.slug}/orders/${paid.order.id}/requests`,{method:'POST',cookie:paid.cookie,body:{kind:'WITHDRAWAL',message:'Quero exercer o arrependimento.',key}})).id,r.id);
      expect(await api(`public/stores/${a.slug}/orders/${paid.order.id}/requests`,{method:'POST',cookie:paid.cookie,body:{kind:'SUPPORT',message:'Outro',key}}),409);
      const o=await admin(a,paid.order.id);assert.equal(o.protocols.length,1);assert.notEqual(o.cancel_requested_at,null);assert.equal(o.payment_status,'PAID');
      assert.equal((await admin(a,paid.order.id,employee)).protocols.length,1);
    });
    await check('Conta revogada bloqueia novas cobranças; pedidos anteriores continuam consultáveis',async()=>{
      const accounts=expect(await api(`tenants/${B}/purchase/accounts`,{actor:b.actor}),200),p=await order(b,[[b.simple.variant_id,1]]);
      expect(await api(`tenants/${B}/purchase/accounts/${accounts[0].id}/revoke`,{method:'POST',actor:b.actor}));
      const c=await cart(b,[[b.simple.variant_id,1]]);expect(await checkout(b,c),409);
      await processAttempt(database,B,p.attempt);const o=await admin(b,p.order.id);assert.ok(o.incidents.some(i=>i.code==='GATEWAY_UNAVAILABLE'));assert.equal(o.transactions.length,0);
      expect(await api(`public/stores/${b.slug}/orders/${p.order.id}`,{cookie:p.cookie}),200);
      expect(await api(`tenants/${B}/purchase/accounts/simulated`,{method:'POST',actor:b.actor}));
    });
    await check('EXPLAIN ANALYZE das consultas de reconciliação como app_user',async()=>{
      report.queryPlans={};for(const [name,query] of [['attempts_due',sql`select a.id from shop.payment_attempts a where a.tenant_id=${A} and a.next_check_at<=now() order by a.next_check_at limit 25`],['outbox_pending',sql`select id from shop.purchase_outbox where tenant_id=${A} and executed_at is null and next_run_at<=now() order by occurred_at limit 25`],['inbox_pending',sql`select id from shop.payment_inbox where tenant_id=${A} and processed_at is null order by received_at limit 50`]])report.queryPlans[name]=(await tx(A,t=>t.execute(sql`explain (analyze,format json) ${query}`))).rows[0];
      assert.equal(Object.keys(report.queryPlans).length,3);report.indexDecision='Índices parciais de pendências por tenant (0006) cobrem as consultas periódicas; fixture pequena, sem ensaio de capacidade.';
    });
    report.passed=failures===0;report.stores=[a,b].map(s=>({tenantId:s.id,slug:s.slug}));report.completedAt=new Date().toISOString();
    writeFileSync('/app/artifacts/purchase-fixture.json',JSON.stringify({tenantId:A,orderId:paid.order.id,total:'7480'},null,2));
  }finally{await database.pool.end();writeFileSync('/app/artifacts/purchase.json',JSON.stringify(report,null,2));}
});

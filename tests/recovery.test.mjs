import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import { createDatabase, rows, sql, withTenant } from '@ecommerce/database';
import { deliverNotifications, postRestore, processAttempt } from '@ecommerce/purchase';
import { lifecycle, reapplyErasures } from '../scripts/ops-tasks.mjs';
// T26/T32 drill on the restored (older) database. The SIMULATED provider lives in the same database, so its newer
// state is replayed from the live database to stand in for the external gateway that a restore never rewinds.
assert.equal(process.env.APP_ENV,'test');
test('T26/T32: restauração antiga, conciliação sem nova cobrança e reaplicação das eliminações',async()=>{
 const f=JSON.parse(readFileSync('/app/artifacts/recovery-fixture.json','utf8')),A=f.tenantId,url=new URL(process.env.DATABASE_URL);url.pathname='/ecommerce_restore';
 const restored=createDatabase(url.toString(),2),live=createDatabase(process.env.DATABASE_URL,2),report={passed:false,steps:[]},started=Date.now(),mark=s=>report.steps.push({step:s,elapsedMs:Date.now()-started});
 try{
  const [stale]=await withTenant(restored,A,null,tx=>rows(tx,sql`select buyer from shop.orders where id=${f.erase.order}`));assert.equal(stale.buyer.email,f.erase.email);mark('backup antigo contém dado eliminado depois');
  const erasures=await reapplyErasures(restored);assert.ok(erasures.applied>=1);const [clean]=await withTenant(restored,A,null,tx=>rows(tx,sql`select buyer,address from shop.orders where id=${f.erase.order}`));assert.equal(clean.buyer.email,'anonimizado@invalid');assert.equal(clean.address.street,'ANONIMIZADO');mark('eliminações reaplicadas a partir do ledger externo');
  const before=await withTenant(restored,A,null,tx=>rows(tx,sql`select id,status from shop.payment_attempts where id in (${f.pending.attempt},${f.prepared.attempt})`));assert.equal(before.find(x=>x.id===f.prepared.attempt).status,'PREPARED');
  const held=await postRestore(restored,A,'Ensaio T26 TESTE');assert.ok(held.unknown>=1);mark('pós-restauração: vendas pausadas, PREPARED→UNKNOWN, e-mails retidos');
  const [t]=await withTenant(restored,A,null,tx=>rows(tx,sql`select sales_paused_at from shop.tenants where id=${A}`));assert.notEqual(t.sales_paused_at,null);
  const provider=await withTenant(live,A,null,tx=>rows(tx,sql`select id,account_id,reference,operation_key,status,amount_cents::text,currency,seller_id,environment,refunds,dispute,approved_at,expires_at,revision,created_at from shop.simulated_payments`));
  await withTenant(restored,A,null,async tx=>{for(const p of provider)await tx.execute(sql`insert into shop.simulated_payments(id,tenant_id,account_id,reference,operation_key,status,amount_cents,currency,seller_id,environment,refunds,dispute,approved_at,expires_at,revision,created_at) values(${p.id},${A},${p.account_id},${p.reference},${p.operation_key},${p.status},${p.amount_cents},${p.currency},${p.seller_id},${p.environment},${JSON.stringify(p.refunds)}::jsonb,${p.dispute?JSON.stringify(p.dispute):null}::jsonb,${p.approved_at},${p.expires_at},${p.revision},${p.created_at}) on conflict(id) do update set status=excluded.status,refunds=excluded.refunds,dispute=excluded.dispute,approved_at=excluded.approved_at,revision=excluded.revision`);});mark('estado do provedor SIMULADO reproduzido (equivale a consultar o gateway)');
  for(const attempt of [f.pending.attempt,f.prepared.attempt])await processAttempt(restored,A,attempt);
  const [count]=await withTenant(restored,A,null,tx=>rows(tx,sql`select count(*)::int as n from shop.simulated_payments`));assert.equal(count.n,provider.length,'nenhuma cobrança nova criada na conciliação');
  const reconciled=await withTenant(restored,A,null,tx=>rows(tx,sql`select o.id,o.payment_status,(select coalesce(sum(r.amount_cents),0)::text from shop.payment_refunds r join shop.payment_transactions x on (x.tenant_id,x.id)=(r.tenant_id,r.transaction_id) where x.order_id=o.id) as refunded from shop.orders o where o.id in (${f.pending.order},${f.prepared.order})`));
  const liveOrders=await withTenant(live,A,null,tx=>rows(tx,sql`select id,payment_status from shop.orders where id in (${f.pending.order},${f.prepared.order})`));
  for(const o of reconciled)assert.equal(o.payment_status,liveOrders.find(l=>l.id===o.id).payment_status);assert.equal(reconciled.find(o=>o.id===f.pending.order).refunded,'700');mark('pagamentos e devolução posteriores conciliados');
  const [heldNow]=await withTenant(restored,A,null,tx=>rows(tx,sql`select count(*)::int as n from shop.notifications where status='HELD'`));const sent=[];await deliverNotifications(restored,A,{provider:'CAPTURE',simulated:true,send:async m=>{sent.push(m.subject);return {id:'x'};}});
  const [stillHeld]=await withTenant(restored,A,null,tx=>rows(tx,sql`select count(*)::int as n from shop.notifications where status='HELD'`));assert.equal(stillHeld.n,heldNow.n);mark('e-mails anteriores retidos para revisão; somente fatos novos enviados');
  await lifecycle(restored,A,'SALES_RESUMED','Conciliação concluída no ensaio T26');mark('vendas reabertas após conciliação');
  report.passed=true;report.held=heldNow.n;report.newNotifications=sent.length;report.providerPayments=provider.length;report.erasures=erasures;
  report.limitation='Ensaio com pg_dump lógico em ambiente isolado; o provedor é SIMULADO. RPO real depende de WAL/PITR (ver pitr.json) e backup externo (D04).';
 }finally{await restored.pool.end();await live.pool.end();writeFileSync('/app/artifacts/recovery.json',JSON.stringify({...report,completedAt:new Date().toISOString()},null,2));}
});

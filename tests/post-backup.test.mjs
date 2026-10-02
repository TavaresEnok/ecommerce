import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import { createDatabase, rows, sql, withTenant } from '@ecommerce/database';
import { processAttempt, processInbox } from '@ecommerce/purchase';
import { getObject, listKeys } from '@ecommerce/media';
import { client } from '../scripts/seed.mjs';
// Runs after the backup: facts that the restored (older) database will not contain.
assert.equal(process.env.APP_ENV,'test');const raw=client(process.env.BASE_URL);
// Earlier suites share the per-IP limit of the test API (1000/min, exercised by the foundation test); wait for the window instead of raising it.
const api=async(path,options)=>{for(let i=0;i<20;i++){const r=await raw(path,options);if(r.status!==429)return r;await new Promise(done=>setTimeout(done,5000));}throw new Error('Limite de requisições não liberou.');};
const expect=(r,status=201)=>{assert.equal(r.status,status,JSON.stringify(r.body));return r.body;};
test('Fatos posteriores ao backup: pagamento/devolução no provedor e eliminação de dados pessoais',async()=>{
 const f=JSON.parse(readFileSync('/app/artifacts/recovery-fixture.json','utf8')),db=createDatabase(process.env.DATABASE_URL,2),actor=f.owner,A=f.tenantId,report={passed:false};
 try{
  // The worker is running here and may claim the attempt first; either path must end with one provider payment.
  await withTenant(db,A,null,tx=>tx.execute(sql`update shop.payment_attempts set lease_until=null where id=${f.prepared.attempt}`));
  await processAttempt(db,A,f.prepared.attempt);for(let i=0;i<60;i++){const [x]=await withTenant(db,A,null,tx=>rows(tx,sql`select count(*)::int as n from shop.simulated_payments where reference=${f.prepared.attempt}`));if(x.n===1)break;await new Promise(r=>setTimeout(r,500));}
  for(const attempt of [f.pending.attempt,f.prepared.attempt]){expect(await api(`tenants/${A}/purchase/attempts/${attempt}/simulate`,{method:'POST',actor,body:{status:'APPROVED'}}));}
  await processInbox(db,A);
  expect(await api(`tenants/${A}/purchase/attempts/${f.pending.attempt}/simulate`,{method:'POST',actor,body:{status:'REFUNDED',amount_cents:'700'}}));await processInbox(db,A);
  const live=await withTenant(db,A,null,tx=>rows(tx,sql`select id,payment_status from shop.orders where id in (${f.pending.order},${f.prepared.order}) order by id`));assert.ok(live.every(o=>['PAID','PARTIALLY_REFUNDED'].includes(o.payment_status)));
  expect(await api(`tenants/${A}/operations/orders/${f.erase.order}/erase`,{method:'POST',actor,body:{reason:'Pedido de eliminação do titular TESTE'}}));
  const [o]=await withTenant(db,A,null,tx=>rows(tx,sql`select buyer,address from shop.orders where id=${f.erase.order}`));assert.equal(o.buyer.email,'anonimizado@invalid');assert.equal(o.address.street,'ANONIMIZADO');
  const [txs]=await withTenant(db,A,null,tx=>rows(tx,sql`select count(*)::int as n from shop.payment_transactions where order_id=${f.erase.order}`));assert.equal(txs.n,1);
  const keys=await listKeys(`privacy-ledger/${A}/`);const entries=await Promise.all(keys.map(async k=>JSON.parse((await getObject(k)).toString('utf8'))));assert.ok(entries.some(e=>e.order_id===f.erase.order));assert.ok(entries.every(e=>!JSON.stringify(e).includes('@')));
  report.passed=true;report.facts=['APPROVED x2 e devolução parcial após o backup (provedor SIMULADO)','eliminação com ledger externo no S3'];
 }finally{await db.pool.end();writeFileSync('/app/artifacts/post-backup.json',JSON.stringify({...report,completedAt:new Date().toISOString()},null,2));}
});

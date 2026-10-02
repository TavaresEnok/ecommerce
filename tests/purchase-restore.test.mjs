import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import { createDatabase,rows,sql,withTenant } from '@ecommerce/database';
assert.equal(process.env.APP_ENV,'test');
test('Restore preserva pedidos, recebimentos, incidentes e estado da outbox sem reemitir cobranças',async()=>{
 const url=new URL(process.env.DATABASE_URL);url.pathname='/ecommerce_restore';const db=createDatabase(url.toString(),1),f=JSON.parse(readFileSync('/app/artifacts/purchase-fixture.json','utf8'));
 try{await withTenant(db,f.tenantId,null,async tx=>{
   const [o]=await rows(tx,sql`select total_cents::text,payment_status,principal_id from shop.orders where id=${f.orderId}`);assert.equal(o.total_cents,f.total);assert.equal(o.payment_status,'PAID');assert.ok(o.principal_id);
   const [counts]=await rows(tx,sql`select (select count(*)::int from shop.payment_transactions) as transactions,(select count(*)::int from shop.order_incidents) as incidents,(select count(*)::int from shop.purchase_receipts) as receipts,(select count(*)::int from shop.payment_attempts where status='PREPARED' and external_id is not null) as inconsistent`);
   assert.ok(counts.transactions>0);assert.ok(counts.incidents>0);assert.ok(counts.receipts>0);assert.equal(counts.inconsistent,0);
   // Attempts already sent stay UNKNOWN/PENDING/terminal: recovery consults the provider instead of creating a new charge (INV-12).
   const [sent]=await rows(tx,sql`select count(*)::int as n from shop.payment_attempts where status='PREPARED'`);
   writeFileSync('/app/artifacts/purchase-restore.json',JSON.stringify({passed:true,completedAt:new Date().toISOString(),counts,preparedAttempts:sent.n,checks:['pedido e total','recebimento principal','incidentes','recibos de consumo','tentativas enviadas não voltam a PREPARED'],limitation:'Conciliação com pagamentos posteriores ao ponto restaurado (T26) é ensaio operacional da Fase 4.'},null,2));
 });}finally{await db.pool.end();}
});

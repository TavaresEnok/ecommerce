import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { createDatabase, rows, sql, withTenant } from '@ecommerce/database';
import { pilotReport, processAttempt, processInbox, recordSupportTime } from '@ecommerce/purchase';
import { seed,client } from '../scripts/seed.mjs';
// Fase 5 instruments: checkout failure reasons and per-store pilot report, aggregated and free of personal data.
assert.equal(process.env.APP_ENV,'test');const base=process.env.BASE_URL;
const api=client(base),report={passed:false,criteria:['Instrumentos de observação do piloto (Fase 5)'],tests:[]};
const address={cep:'01001000',street:'Rua TESTE',number:'1',city:'São Paulo TESTE',state:'SP',complement:''};
const expect=(r,status=201)=>{assert.equal(r.status,status,JSON.stringify(r.body));return r.body;};
test('Fase 5: instrumentos de observação',async t=>{
 const db=createDatabase(process.env.DATABASE_URL,2);let failures=0;const check=async(name,fn)=>{let ok=false;await t.test(name,async()=>{await fn();ok=true;});if(!ok)failures++;report.tests.push({name,result:ok?'passed':'failed'});};
 try{
  const [a,b]=await seed(api,`p5${randomBytes(4).toString('hex')}`);for(const s of [a,b])expect(await api(`tenants/${s.id}/purchase/accounts/simulated`,{method:'POST',actor:s.actor}));
  const from=new Date(Date.now()-60000);
  await check('Falhas de checkout registradas por motivo, sem carrinho/comprador, isoladas por loja',async()=>{
   const r=await api(`public/stores/${a.slug}/cart/items`,{method:'POST',body:{variant_id:a.simple.variant_id,quantity:1}});const cookie=r.headers.get('set-cookie').split(';')[0];const q=expect(await api(`public/stores/${a.slug}/cart/quotes`,{method:'POST',cookie,body:{kind:'TABLE',address}}));
   const body={key:randomUUID(),quote_id:q.id,address,buyer:{name:'Pessoa Identificável',email:'pessoa@example.test'},method:'PIX',total_cents:'1'};
   expect(await api(`public/stores/${a.slug}/cart/checkout`,{method:'POST',cookie,body}),409);
   expect(await api(`tenants/${a.id}/operations/sales/pause`,{method:'POST',actor:a.actor,body:{reason:'Teste'}}));expect(await api(`public/stores/${a.slug}/cart/checkout`,{method:'POST',cookie,body:{...body,total_cents:q.total_cents}}),409);expect(await api(`tenants/${a.id}/operations/sales/resume`,{method:'POST',actor:a.actor,body:{reason:'Fim'}}));
   const order=expect(await api(`public/stores/${a.slug}/cart/checkout`,{method:'POST',cookie,body:{...body,key:randomUUID(),total_cents:q.total_cents}}));await processAttempt(db,a.id,order.attempts[0].id);
   expect(await api(`tenants/${a.id}/purchase/attempts/${order.attempts[0].id}/simulate`,{method:'POST',actor:a.actor,body:{status:'APPROVED'}}));await processInbox(db,a.id);
   const recorded=await withTenant(db,a.id,null,tx=>rows(tx,sql`select * from shop.checkout_failures`));assert.deepEqual(recorded.map(r=>r.reason).sort(),['PRICE_OR_SHIPPING_CHANGED','SALES_CLOSED']);
   assert.ok(recorded.every(r=>Object.keys(r).sort().join()==='created_at,id,reason,status,tenant_id'));
   assert.equal((await withTenant(db,b.id,null,tx=>rows(tx,sql`select * from shop.checkout_failures`))).length,0);
  });
  await check('Relatório por loja agrega pedidos, falhas, atendimento e tempo de suporte sem dados pessoais',async()=>{
   await assert.rejects(recordSupportTime(db,a.id,15,'ONBOARDING','Ligou de pessoa@example.test','OPERATOR'),/e-mail/);
   await recordSupportTime(db,a.id,25,'ONBOARDING','Configuração de frete e políticas','OPERATOR');
   const r=await pilotReport(db,a.id,from,new Date(Date.now()+60000));
   assert.equal(r.orders.created,1);assert.equal(r.orders.paid,1);assert.equal(r.checkout_failures.SALES_CLOSED,1);assert.equal(r.checkout_success_rate,33.3);assert.equal(r.support.staff_minutes,25);assert.equal(r.published,true);
   const text=JSON.stringify(r);assert.ok(!/@|Pessoa|Rua TESTE|01001000/.test(text),text);assert.match(r.sample_note,/inconclusivos/);
   const other=await pilotReport(db,b.id,from,new Date(Date.now()+60000));assert.equal(other.orders.created,0);assert.equal(other.checkout_success_rate,null);
  });
  report.passed=failures===0;
 }finally{await db.pool.end();writeFileSync('/app/artifacts/pilot-observation.json',JSON.stringify({...report,completedAt:new Date().toISOString()},null,2));}
});

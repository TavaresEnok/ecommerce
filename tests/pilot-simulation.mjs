import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { createDatabase } from '@ecommerce/database';
import { pilotReport, recordSupportTime } from '@ecommerce/purchase';
import { seed,client } from '../scripts/seed.mjs';
// SIMULATED pilot: two fictitious stores with scripted buyers on the local staging, exercising the Fase 5 instruments.
// Output is labelled SIMULADO and is never a substitute for observations of real stores.
assert.equal(process.env.APP_ENV,'staging');const raw=client(process.env.BASE_URL,process.env.PUBLIC_ORIGIN);
// All simulated buyers share one IP; respect the per-IP limit instead of disabling it.
const api=async(path,opts)=>{for(let k=0;;k++){const r=await raw(path,opts);if(r.status!==429||k>30)return r;await new Promise(x=>setTimeout(x,2000));}};
const address={cep:'01001000',street:'Rua Demonstração',number:'1',city:'São Paulo',state:'SP',complement:''};
const expect=(r,status=201)=>{assert.equal(r.status,status,JSON.stringify(r.body));return r.body;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
// Buyer scripts per store: what each simulated buyer does. Deterministic so repeated runs are comparable.
const scripts={A:['PAY','PAY','PAY','ABANDON','REJECT','PAY','STALE_TOTAL','PAY','REFUND','PAY'],B:['PAY','ABANDON','PAY','PAUSED','PAY','REJECT','PAY','ABANDON']};
test('Piloto SIMULADO com duas lojas fictícias',async()=>{
 const db=createDatabase(process.env.DATABASE_URL,2),from=new Date(Date.now()-60000),out={mode:'SIMULADO',environment:'STAGING_LOCAL',passed:false,authorization:{reference:'SIMULADO — sem autorização real de ativação'},stores:[],events:[]};
 try{
  const stores=await seed(api,`pil${randomBytes(3).toString('hex')}`);
  for(const [label,s] of [['A',stores[0]],['B',stores[1]]]){expect(await api(`tenants/${s.id}/purchase/accounts/simulated`,{method:'POST',actor:s.actor}));
   const expected={created:0,paid:0};
   for(const [i,action] of scripts[label].entries()){
    const r=await api(`public/stores/${s.slug}/cart/items`,{method:'POST',body:{variant_id:s.simple.variant_id,quantity:1}});expect(r);const cookie=r.headers.get('set-cookie').split(';')[0];
    const q=expect(await api(`public/stores/${s.slug}/cart/quotes`,{method:'POST',cookie,body:{kind:'TABLE',address}}));
    if(action==='ABANDON'){out.events.push({store:label,buyer:i,action});continue;}
    const body={key:randomUUID(),quote_id:q.id,address,buyer:{name:`Comprador Fictício ${i}`,email:`comprador${i}-${label.toLowerCase()}@cliente.demo.test`},method:i%2?'PIX':'CARD',total_cents:q.total_cents};
    if(action==='STALE_TOTAL'){expect(await api(`public/stores/${s.slug}/cart/checkout`,{method:'POST',cookie,body:{...body,total_cents:'1'}}),409);out.events.push({store:label,buyer:i,action});continue;}
    if(action==='PAUSED'){expect(await api(`tenants/${s.id}/operations/sales/pause`,{method:'POST',actor:s.actor,body:{reason:'Pausa simulada para inventário'}}));expect(await api(`public/stores/${s.slug}/cart/checkout`,{method:'POST',cookie,body}),409);expect(await api(`tenants/${s.id}/operations/sales/resume`,{method:'POST',actor:s.actor,body:{reason:'Fim da pausa simulada'}}));out.events.push({store:label,buyer:i,action});continue;}
    const order=expect(await api(`public/stores/${s.slug}/cart/checkout`,{method:'POST',cookie,body}));expected.created++;
    const attempt=order.attempts[0].id,status=action==='REJECT'?'REJECTED':'APPROVED';
    // The staging worker issues the charge; wait for it instead of processing inline.
    for(let k=0;;k++){const res=await api(`tenants/${s.id}/purchase/attempts/${attempt}/simulate`,{method:'POST',actor:s.actor,body:{status}});if(res.status===201)break;assert.equal(res.status,409,JSON.stringify(res.body));if(k>60)throw new Error('Cobrança não emitida pela fila.');await sleep(1000);}
    if(status==='APPROVED')expected.paid++;
    if(action==='REFUND'){await sleep(3000);expect(await api(`tenants/${s.id}/purchase/attempts/${attempt}/simulate`,{method:'POST',actor:s.actor,body:{status:'REFUNDED',amount_cents:'500'}}));}
    out.events.push({store:label,buyer:i,action,order:order.number});
   }
   await recordSupportTime(db,s.id,label==='A'?40:25,'ONBOARDING','Configuração de frete e políticas (simulado)','OPERATOR');
   await recordSupportTime(db,s.id,10,'SHIPPING','Dúvida sobre prazo de envio (simulado)','OPERATOR');
   // Webhooks are processed by the worker; wait until the report reflects the scripted outcome.
   let report;for(let k=0;k<90;k++){report=await pilotReport(db,s.id,from,new Date(Date.now()+60000));if(report.orders.created===expected.created&&report.orders.paid>=expected.paid)break;await sleep(1000);}
   assert.equal(report.orders.created,expected.created);assert.equal(report.orders.paid,expected.paid,JSON.stringify(report));
   assert.ok(!/@|Comprador|Rua Demonstra|01001000/.test(JSON.stringify(report)),'Relatório com dado pessoal.');
   out.stores.push({id:`loja-ficticia-${label}`,slug:s.slug,segment:label==='A'?'acessórios (fictício)':'papelaria (fictício)',pilotReport:report,t27:{result:'NÃO EXECUTADO',evidence:'T27 exige loja real com cobrança real.'}});
  }
  out.decision={recommendation:'continuar observação',reasons:['Dados SIMULADOS validam apenas os instrumentos; decisão de avançar exige observação de lojas reais.']};
  out.passed=true;
 }finally{await db.pool.end();out.completedAt=new Date().toISOString();writeFileSync('/app/artifacts/pilot-simulation.json',JSON.stringify(out,null,2));}
});

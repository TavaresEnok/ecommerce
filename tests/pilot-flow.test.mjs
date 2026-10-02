import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';
import { createDatabase, rows, sql, withTenant } from '@ecommerce/database';
import { seed,client } from '../scripts/seed.mjs';
// T27 with the real worker: two stores, correct receiving account, stock, e-mail (LOCAL provider) and fulfillment.
assert.equal(process.env.APP_ENV,'test');const base=process.env.BASE_URL;
const api=client(base),report={passed:false,simulation:true,externalHomologation:false,criteria:['T27 (simulado)','Interface de operação desktop/móvel'],stores:[],tests:[],visual:[]};
const address={cep:'01001000',street:'Rua TESTE',number:'1',city:'São Paulo TESTE',state:'SP',complement:''};
const expect=(r,status=201)=>{assert.equal(r.status,status,JSON.stringify(r.body));return r.body;};
async function until(label,fn,timeout=45000){const end=Date.now()+timeout;while(Date.now()<end){const v=await fn();if(v)return v;await new Promise(r=>setTimeout(r,500));}throw new Error(`Tempo esgotado: ${label}`);}
test('T27: fluxo completo em duas lojas com worker real',async t=>{
 const database=createDatabase(process.env.DATABASE_URL,2),browser=await chromium.launch({headless:true});let failures=0;
 const check=async(name,fn)=>{let passed=false;await t.test(name,async()=>{await fn();passed=true;});if(!passed)failures++;report.tests.push({name,result:passed?'passed':'failed'});};
 let stores;
 try{
  stores=await seed(api,`f4${randomBytes(4).toString('hex')}`);for(const s of stores)expect(await api(`tenants/${s.id}/purchase/accounts/simulated`,{method:'POST',actor:s.actor}));
  await check('Duas lojas: compra, recebimento na conta correta, estoque, e-mails e entrega',async()=>{
   const results=await Promise.all(stores.map(async s=>{const tx=fn=>withTenant(database,s.id,null,fn),before=(await tx(t=>rows(t,sql`select on_hand from shop.inventory_items where variant_id=${s.simple.variant_id}`)))[0].on_hand;
    const r=await api(`public/stores/${s.slug}/cart/items`,{method:'POST',body:{variant_id:s.simple.variant_id,quantity:2}});expect(r);const cookie=r.headers.get('set-cookie').split(';')[0];const quote=expect(await api(`public/stores/${s.slug}/cart/quotes`,{method:'POST',cookie,body:{kind:'TABLE',address}}));
    const order=expect(await api(`public/stores/${s.slug}/cart/checkout`,{method:'POST',cookie,body:{key:randomUUID(),quote_id:quote.id,address,buyer:{name:'Comprador TESTE',email:`t27-${s.slug}@example.test`},method:'PIX',total_cents:quote.total_cents}}));
    const attempt=order.attempts[0].id;await until('emissão',async()=>(await tx(t=>rows(t,sql`select status from shop.payment_attempts where id=${attempt}`)))[0].status==='PENDING');
    expect(await api(`tenants/${s.id}/purchase/attempts/${attempt}/simulate`,{method:'POST',actor:s.actor,body:{status:'APPROVED'}}));
    await until('pagamento',async()=>expect(await api(`public/stores/${s.slug}/orders/${order.id}`,{cookie}),200).payment_status==='PAID');
    const [account]=await tx(t=>rows(t,sql`select c.seller_id,x.received_cents::text from shop.payment_transactions x join shop.payment_accounts c on (c.tenant_id,c.id)=(x.tenant_id,x.account_id) where x.order_id=${order.id}`));assert.equal(account.seller_id,`sim-${s.id}`);assert.equal(account.received_cents,order.total_cents);
    for(const [step,body] of [['process',{}],['ship',{carrier:'Transportadora TESTE',tracking:`T27-${s.slug}`}],['deliver',{proof:''}]])expect(await api(`tenants/${s.id}/operations/orders/${order.id}/${step}`,{method:'POST',actor:s.actor,body}));
    const mails=await until('e-mails entregues pelo worker',async()=>{const n=await tx(t=>rows(t,sql`select template,status from shop.notifications where order_id=${order.id} order by created_at`));return n.length===4&&n.every(x=>x.status==='SIMULATED')&&n;});
    const after=(await tx(t=>rows(t,sql`select on_hand,reserved from shop.inventory_items where variant_id=${s.simple.variant_id}`)))[0];assert.equal(after.on_hand,before-2);
    const final=expect(await api(`public/stores/${s.slug}/orders/${order.id}`,{cookie}),200);assert.equal(final.order_status,'COMPLETED');assert.equal(final.fulfillment_status,'DELIVERED');
    return {store:s.slug,order:order.number,total_cents:order.total_cents,seller:'conta SIMULADA da própria loja',notifications:mails.map(m=>`${m.template}:${m.status}`)};}));
   report.stores=results;
   for(const s of stores)for(const other of stores.filter(o=>o!==s))assert.equal((await withTenant(database,s.id,null,tx=>rows(tx,sql`select id from shop.orders where tenant_id=${other.id}`))).length,0);
  });
  await check('Interface: atendimento público, painel de pedidos/atendimento/operação (desktop e móvel)',async()=>{
   const [s]=stores;for(const viewport of [{width:1440,height:900},{width:390,height:844}]){const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    try{
     await page.goto(`${base}/lojas/${s.slug}/atendimento`);const form=page.getByRole('form',{name:'Contato geral'});await form.getByLabel('Nome').fill('Visitante TESTE');await form.getByLabel('E-mail').fill('visitante@example.test');await form.getByLabel('Mensagem').fill('Qual o prazo de troca?');await form.getByRole('button',{name:'Enviar'}).click();
     await page.getByText(/Código de acompanhamento:/).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);await page.screenshot({path:`/app/artifacts/phase4-contact-${viewport.width}.png`,fullPage:true});
     await context.addCookies([{name:s.actor.cookie.split('=')[0],value:s.actor.cookie.split('=')[1],domain:'web',path:'/'}]);
     await page.goto(`${base}/painel/${s.id}/atendimento`);await page.getByRole('heading',{name:'Protocolos'}).waitFor();await page.getByRole('link',{name:/^Contato geral/}).first().click();await page.getByRole('form',{name:'Responder consumidor'}).waitFor();
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);await page.screenshot({path:`/app/artifacts/phase4-support-${viewport.width}.png`,fullPage:true});
     await page.goto(`${base}/painel/${s.id}/pedidos`);await page.getByRole('link',{name:/^Nº \d+$/}).first().click();await page.getByRole('heading',{name:'Expedição'}).waitFor();await page.getByRole('heading',{name:'Notificações ao comprador'}).waitFor();
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);await page.screenshot({path:`/app/artifacts/phase4-orders-${viewport.width}.png`,fullPage:true});
     await page.goto(`${base}/painel/${s.id}/operacao`);await page.getByRole('heading',{name:'Alertas'}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);await page.screenshot({path:`/app/artifacts/phase4-operation-${viewport.width}.png`,fullPage:true});
     assert.equal(errors.length,0,errors.join('\n'));report.visual.push({viewport,pages:['contato público','atendimento','pedidos/expedição','operação'],result:'passed'});
    }finally{await context.close();}}
  });
  report.passed=failures===0;report.completedAt=new Date().toISOString();
 }finally{await browser.close();await database.pool.end();writeFileSync('/app/artifacts/pilot-flow.json',JSON.stringify(report,null,2));}
});

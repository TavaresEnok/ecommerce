import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';
import { Queue } from 'bullmq';
import { createDatabase, rows, sql, withTenant } from '@ecommerce/database';
import { seed,client } from '../scripts/seed.mjs';
// Runs with the real worker: publication, Redis loss, inbox reconciliation and the buyer/merchant interfaces.
assert.equal(process.env.APP_ENV,'test');const base=process.env.BASE_URL;assert.equal(new URL(base).hostname,'web');
const api=client(base),report={passed:false,simulation:true,externalHomologation:false,criteria:['T20 (worker real)','T21','Fluxo comprador/lojista desktop/móvel'],tests:[],visual:[]};
const address={cep:'01001000',street:'Rua TESTE',number:'1',city:'São Paulo TESTE',state:'SP',complement:''};
const expect=(r,status=201)=>{assert.equal(r.status,status,JSON.stringify(r.body));return r.body;};
async function until(label,fn,timeout=45000){const end=Date.now()+timeout;while(Date.now()<end){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,500));}throw new Error(`Tempo esgotado: ${label}`);}
test('Fase 3 com worker real: outbox, perda do Redis e interface',async t=>{
  const database=createDatabase(process.env.DATABASE_URL,2),redis=new URL(process.env.REDIS_URL),queue=new Queue('purchase',{connection:{host:redis.hostname,port:Number(redis.port||6379),maxRetriesPerRequest:1}}),browser=await chromium.launch({headless:true});
  let failures=0;const check=async(name,fn)=>{let passed=false;await t.test(name,async()=>{await fn();passed=true;});if(!passed)failures++;report.tests.push({name,result:passed?'passed':'failed'});};
  let a,A;const tx=fn=>withTenant(database,A,null,fn);
  async function buy(){let cookie;const r=await api(`public/stores/${a.slug}/cart/items`,{method:'POST',body:{variant_id:a.simple.variant_id,quantity:1}});expect(r);cookie=r.headers.get('set-cookie').split(';')[0];const quote=expect(await api(`public/stores/${a.slug}/cart/quotes`,{method:'POST',cookie,body:{kind:'TABLE',address}}));return {cookie,order:expect(await api(`public/stores/${a.slug}/cart/checkout`,{method:'POST',cookie,body:{key:randomUUID(),quote_id:quote.id,address,buyer:{name:'Comprador TESTE',email:'comprador@example.test'},method:'PIX',total_cents:quote.total_cents}}))};}
  try{
    [a]=await seed(api,`w3${randomBytes(4).toString('hex')}`);A=a.id;expect(await api(`tenants/${A}/purchase/accounts/simulated`,{method:'POST',actor:a.actor}));
    await check('T21: jobs publicados e perdidos no Redis são reconstruídos do PostgreSQL e executados uma vez',async()=>{
      await queue.pause();let p;
      try{p=await buy();await until('publicação',async()=>(await tx(t=>rows(t,sql`select published_at from shop.purchase_outbox where aggregate_id=${p.order.id}`))).every(e=>e.published_at));
        assert.ok((await tx(t=>rows(t,sql`select executed_at from shop.purchase_outbox where aggregate_id=${p.order.id}`))).every(e=>!e.executed_at));
        await queue.obliterate({force:true});}finally{await queue.resume();}
      await until('execução após perda',async()=>(await tx(t=>rows(t,sql`select executed_at from shop.purchase_outbox where aggregate_id=${p.order.id}`))).every(e=>e.executed_at));
      const counts=(await tx(t=>rows(t,sql`select (select count(*)::int from shop.purchase_outbox where aggregate_id=${p.order.id}) as events,(select count(*)::int from shop.purchase_receipts r join shop.purchase_outbox o on (o.tenant_id,o.id)=(r.tenant_id,r.event_id) where o.aggregate_id=${p.order.id}) as receipts`)))[0];assert.equal(counts.events,counts.receipts);
      await until('tentativa emitida pelo worker',async()=>(await tx(t=>rows(t,sql`select status from shop.payment_attempts where order_id=${p.order.id}`)))[0].status==='PENDING');
      assert.equal((await tx(t=>rows(t,sql`select count(*)::int as n from shop.simulated_payments s join shop.payment_attempts x on (x.tenant_id,x.id)=(s.tenant_id,s.reference) where x.order_id=${p.order.id}`)))[0].n,1);
    });
    await check('Webhook simulado → inbox durável → consulta autoritativa pelo worker → pago com baixa única',async()=>{
      const p=await buy(),attempt=p.order.attempts[0].id;await until('emissão',async()=>(await tx(t=>rows(t,sql`select status from shop.payment_attempts where id=${attempt}`)))[0].status==='PENDING');
      expect(await api(`tenants/${A}/purchase/attempts/${attempt}/simulate`,{method:'POST',actor:a.actor,body:{status:'APPROVED'}}));
      await until('conciliação',async()=>expect(await api(`public/stores/${a.slug}/orders/${p.order.id}`,{cookie:p.cookie}),200).payment_status==='PAID');
      const r=await tx(t=>rows(t,sql`select status from shop.inventory_reservations where order_id=${p.order.id}`));assert.deepEqual(r.map(x=>x.status),['CONSUMED']);
    });
    await check('Interface: comprador revisa, confirma, recebe comprovante e protocolo; lojista vê pedido (desktop/móvel)',async()=>{
      for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
        const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
        try{
          await page.goto(`${base}/lojas/${a.slug}/produtos/caneca-cafe`);await page.getByRole('button',{name:'Adicionar ao carrinho',exact:true}).click();await page.getByRole('link',{name:'Ver carrinho',exact:true}).click();await page.getByRole('heading',{name:'Seu carrinho',exact:true}).waitFor();
          const form=page.getByRole('form',{name:'Calcular frete'});await form.getByLabel('CEP',{exact:true}).fill('01001000');await form.getByLabel('Rua',{exact:true}).fill('Rua TESTE');await form.getByLabel('Número',{exact:true}).fill('1');await form.getByLabel('Cidade',{exact:true}).fill('São Paulo');await form.getByLabel('UF',{exact:true}).fill('SP');await form.getByRole('button',{name:'Calcular frete'}).click();
          const buyer=page.getByRole('form',{name:'Dados do comprador'});await buyer.getByLabel('Nome completo').fill('Comprador TESTE');await buyer.getByLabel('E-mail para comprovante').fill('comprador@example.test');await buyer.getByRole('button',{name:'Revisar pedido'}).click();
          await page.getByText('Revise antes de confirmar').waitFor();await page.getByRole('button',{name:'Corrigir dados'}).click();await buyer.getByRole('button',{name:'Revisar pedido'}).click();
          await page.getByRole('button',{name:/^Confirmar compra de R\$ 44,90$/}).click();await page.waitForURL(/\/pedidos\/[0-9a-f-]{36}$/).catch(async e=>{console.error('UI_FAILURE',JSON.stringify({url:page.url(),alerts:await page.getByRole('alert').allTextContents(),errors}));throw e;});await page.getByRole('heading',{name:/^Pedido nº \d+$/}).waitFor();
          const orderId=page.url().split('/').at(-1);await page.getByText('COMPROVANTE · PAGAMENTO SIMULADO').waitFor();
          const attempt=await until('emissão',async()=>{const [x]=await tx(t=>rows(t,sql`select id,status from shop.payment_attempts where order_id=${orderId}`));return x?.status==='PENDING'&&x.id;});
          expect(await api(`tenants/${A}/purchase/attempts/${attempt}/simulate`,{method:'POST',actor:a.actor,body:{status:'APPROVED'}}));await page.getByText('Pago',{exact:true}).waitFor({timeout:30000});
          const request=page.getByRole('form',{name:'Abrir solicitação'});await request.getByLabel('Tipo').selectOption('WITHDRAWAL');await request.getByLabel('Mensagem').fill('Desejo exercer o arrependimento.');await request.getByRole('button',{name:'Enviar solicitação'}).click();await page.getByText(/^Protocolo .* registrado em/).waitFor();
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);await page.screenshot({path:`/app/artifacts/phase3-order-${viewport.width}.png`,fullPage:true});
          const intruder=await browser.newContext();const other=await intruder.newPage();await other.goto(`${base}/lojas/${a.slug}/pedidos/${orderId}`);await other.getByText('Pedido não autorizado.').waitFor();await intruder.close();
          await context.addCookies([{name:a.actor.cookie.split('=')[0],value:a.actor.cookie.split('=')[1],domain:'web',path:'/'}]);await page.goto(`${base}/painel/${A}/pedidos`);await page.getByRole('heading',{name:'Pedidos recentes'}).waitFor();
          await page.getByRole('link',{name:/^Nº \d+$/}).first().click();await page.getByRole('heading',{name:'Protocolos do consumidor'}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);await page.screenshot({path:`/app/artifacts/phase3-admin-${viewport.width}.png`,fullPage:true});
          assert.equal(errors.length,0,errors.join('\n'));report.visual.push({viewport,pages:['produto','carrinho/frete','revisão','comprovante','protocolo','painel de pedidos'],result:'passed'});
        }finally{await context.close();}
      }
    });
    report.passed=failures===0;report.completedAt=new Date().toISOString();
  }finally{await queue.close();await browser.close();await database.pool.end();writeFileSync('/app/artifacts/purchase-worker.json',JSON.stringify(report,null,2));}
});

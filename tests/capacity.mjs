// T33 capacity rehearsal (seção 24.2). Runs inside the tests container of ecommerce-capacity-test.
//   node tests/capacity.mjs seed | load | invariants
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { createDatabase, rows, sql, withTenant } from '@ecommerce/database';
import { seed, client } from '../scripts/seed.mjs';
const mode=process.argv[2],WEB='http://web:3000',API='http://api:3001',ORIGIN='http://web:3000',FIXTURE='/app/artifacts/capacity-fixture.json';
if(process.env.APP_ENV!=='test')throw new Error('Somente ambiente de teste.');
const address={cep:'01001000',street:'Rua CARGA',number:'1',city:'São Paulo',state:'SP',complement:''};
const api=client(WEB),expect=(r,status=201)=>{if(r.status!==status)throw new Error(`${r.status} ${JSON.stringify(r.body)}`);return r.body;};
async function pool(items,size,fn){let i=0;await Promise.all(Array.from({length:size},async()=>{while(i<items.length){const item=items[i++];await fn(item);}}));}
if(mode==='seed'){
 const stores=[],started=Date.now();
 for(let i=0;i<5;i++)stores.push(...await seed(api,`cap${i}${randomBytes(3).toString('hex')}`));
 await pool(stores,stores.length,async s=>{const prefix=`tenants/${s.id}`;expect(await api(`${prefix}/purchase/accounts/simulated`,{method:'POST',actor:s.actor}));s.products=[];
  for(const v of [s.simple.variant_id,...s.variants.map(v=>v.id)])expect(await api(`${prefix}/catalogue/adjustments`,{method:'POST',actor:s.actor,body:{variant_id:v,location_id:s.location.id,delta:1000,reason:'Carga T33'}}));
  s.products.push({slug:'caneca-cafe',variants:[s.simple.variant_id]},{slug:'camiseta',variants:s.variants.map(v=>v.id)});
  for(let p=0;p<98;p++){const product=expect(await api(`${prefix}/catalogue/products`,{method:'POST',actor:s.actor,body:{name:`Produto carga ${p} ${['café','chá','caneca','camiseta','livro'][p%5]}`,slug:`produto-${p}`,description:'Produto sintético do ensaio de capacidade T33.',sku:`C${p}-BASE`,price_cents:String(1000+p*10),category_id:s.category.id}}));const variants=[];
   for(let v=0;v<5;v++){const created=expect(await api(`${prefix}/catalogue/products/${product.id}/variants`,{method:'POST',actor:s.actor,body:{sku:`C${p}-V${v}`,price_cents:String(1000+p*10+v),attributes:{tamanho:['P','M','G','GG','XG'][v]},weight_g:200,width_mm:100,height_mm:50,length_mm:150}}));variants.push(created.id);expect(await api(`${prefix}/catalogue/adjustments`,{method:'POST',actor:s.actor,body:{variant_id:created.id,location_id:s.location.id,delta:1000,reason:'Carga T33'}}));}
   expect(await api(`${prefix}/catalogue/products/${product.id}`,{method:'PATCH',actor:s.actor,body:{status:'ACTIVE'}}),200);s.products.push({slug:`produto-${p}`,variants});}
 });
 writeFileSync(FIXTURE,JSON.stringify({seededMs:Date.now()-started,stores:stores.map(s=>({id:s.id,slug:s.slug,actor:s.actor,location:s.location.id,products:s.products}))}));
 console.log(JSON.stringify({stores:stores.length,products:stores.reduce((n,s)=>n+s.products.length,0),variants:stores.reduce((n,s)=>n+s.products.reduce((m,p)=>m+p.variants.length,0),0),seededSeconds:Math.round((Date.now()-started)/1000)}));
}
if(mode==='load'){
 const f=JSON.parse(readFileSync(FIXTURE,'utf8')),phases=JSON.parse(process.env.CAPACITY_PHASES||'[{"name":"frio","rps":20,"seconds":60},{"name":"sustentado","rps":20,"seconds":1800},{"name":"pico","rps":40,"seconds":300}]');
 const samples={},count={},pick=a=>a[Math.floor(Math.random()*a.length)],flows=[];let inflight=0,dropped=0;
 const record=(phase,kind,ms,status,error)=>{const k=`${phase}:${kind}`;(samples[k]??=[]).push(ms);const c=(count[k]??={ok:0,expected4xx:0,error4xx:0,error5xx:0,network:0});if(error)c.network++;else if(status<400)c.ok++;else if(status===409||status===404)c.expected4xx++;else if(status<500)c.error4xx++;else c.error5xx++;};
 async function timed(phase,kind,url,init={}){const start=performance.now();try{const r=await fetch(url,{...init,headers:{...(init.body?{'content-type':'application/json',origin:ORIGIN}:{}),...init.headers},signal:AbortSignal.timeout(15000)});const body=r.headers.get('content-type')?.includes('json')?await r.json():await r.text();record(phase,kind,performance.now()-start,r.status);return {status:r.status,body,headers:r.headers};}catch{record(phase,kind,performance.now()-start,0,true);return {status:0};}}
 const terms=['cafe','cha','caneca','camiseta','livro','produto','C1-V2','xg'];
 async function read(phase){const s=pick(f.stores),r=Math.random();if(r<0.40)return timed(phase,'leitura:vitrine',`${API}/public/stores/${s.slug}`);if(r<0.75)return timed(phase,'leitura:produto',`${API}/public/stores/${s.slug}/products/${pick(s.products).slug}`);if(r<0.95)return timed(phase,'leitura:busca',`${API}/public/stores/${s.slug}?q=${encodeURIComponent(pick(terms))}`);return timed(phase,'pagina:ssr',`${WEB}/lojas/${s.slug}/produtos/${pick(s.products).slug}`);}
 async function purchase(phase){const s=pick(f.stores),p=pick(s.products),v=pick(p.variants);const add=await timed(phase,'escrita:carrinho',`${API}/public/stores/${s.slug}/cart/items`,{method:'POST',body:JSON.stringify({variant_id:v,quantity:1})});if(add.status!==201)return;const cookie=add.headers.get('set-cookie').split(';')[0];
  const q=await timed(phase,'escrita:frete',`${API}/public/stores/${s.slug}/cart/quotes`,{method:'POST',headers:{cookie},body:JSON.stringify({kind:'TABLE',address})});if(q.status!==201)return;
  const c=await timed(phase,'escrita:checkout',`${API}/public/stores/${s.slug}/cart/checkout`,{method:'POST',headers:{cookie},body:JSON.stringify({key:randomUUID(),quote_id:q.body.id,address,buyer:{name:'Carga',email:'carga@example.test'},method:'PIX',total_cents:q.body.total_cents})});if(c.status===201)flows.push({tenant:s.id,order:c.body.id,at:Date.now()});}
 async function lastUnit(){const s=f.stores[0],p=s.products[5],v=p.variants[0];const db=createDatabase(process.env.DATABASE_URL,1);try{const [b]=await withTenant(db,s.id,null,tx=>rows(tx,sql`select on_hand-reserved as available from shop.inventory_items where variant_id=${v}`));const actor=s.actor;await client(WEB)(`tenants/${s.id}/catalogue/adjustments`,{method:'POST',actor,body:{variant_id:v,location_id:s.location,delta:1-b.available,reason:'T33 última unidade'}});}finally{await db.pool.end();}
  const carts=[];for(let i=0;i<20;i++){const add=await fetch(`${API}/public/stores/${s.slug}/cart/items`,{method:'POST',headers:{'content-type':'application/json',origin:ORIGIN},body:JSON.stringify({variant_id:v,quantity:1})});if(add.status!==201)continue;const cookie=add.headers.get('set-cookie').split(';')[0];const q=await(await fetch(`${API}/public/stores/${s.slug}/cart/quotes`,{method:'POST',headers:{'content-type':'application/json',origin:ORIGIN,cookie},body:JSON.stringify({kind:'TABLE',address})})).json();carts.push({cookie,q});}
  const results=await Promise.all(carts.map(c=>fetch(`${API}/public/stores/${s.slug}/cart/checkout`,{method:'POST',headers:{'content-type':'application/json',origin:ORIGIN,cookie:c.cookie},body:JSON.stringify({key:randomUUID(),quote_id:c.q.id,address,buyer:{name:'Carga',email:'carga@example.test'},method:'PIX',total_cents:c.q.total_cents})}).then(r=>r.status)));
  return {contenders:carts.length,won:results.filter(r=>r===201).length,conflicts:results.filter(r=>r===409).length,other:results.filter(r=>r!==201&&r!==409).length,variant:v,tenant:s.id};}
 const started=Date.now(),timeline=[];let contention=null;
 for(const phase of phases){const end=Date.now()+phase.seconds*1000,interval=1000/phase.rps;let next=Date.now(),launched=0;timeline.push({phase:phase.name,rps:phase.rps,seconds:phase.seconds,startedAt:new Date().toISOString()});
  if(phase.name==='sustentado')contention=lastUnit();
  while(Date.now()<end){const now=Date.now();if(now<next){await new Promise(r=>setTimeout(r,next-now));continue;}next+=interval;launched++;if(inflight>400){dropped++;continue;}inflight++;(Math.random()<0.05/3?purchase(phase.name):read(phase.name)).finally(()=>inflight--);}
  timeline.at(-1).launched=launched;}
 while(inflight>0)await new Promise(r=>setTimeout(r,200));
 const pct=(a,p)=>{if(!a.length)return null;const s=[...a].sort((x,y)=>x-y);return Math.round(s[Math.min(s.length-1,Math.floor(p*s.length))]);};
 const latency=Object.fromEntries(Object.entries(samples).sort().map(([k,v])=>[k,{n:v.length,p50:pct(v,0.5),p95:pct(v,0.95),p99:pct(v,0.99),max:Math.round(Math.max(...v)),...count[k]}]));
 writeFileSync('/app/artifacts/capacity-load.json',JSON.stringify({startedAt:new Date(started).toISOString(),finishedAt:new Date().toISOString(),phases:timeline,dropped,latency,contention:await contention,orders:flows},null,1));
 console.log(JSON.stringify({requests:Object.values(samples).reduce((n,a)=>n+a.length,0),orders:flows.length,dropped}));
}
if(mode==='invariants'){
 const f=JSON.parse(readFileSync(FIXTURE,'utf8')),load=JSON.parse(readFileSync('/app/artifacts/capacity-load.json','utf8')),db=createDatabase(process.env.DATABASE_URL,2),violations=[];let orders=0,paid=0,pending=0;const external=[];
 try{for(const s of f.stores)await withTenant(db,s.id,null,async tx=>{
  for(const v of await rows(tx,sql`select i.id,i.on_hand,i.reserved,coalesce((select sum(quantity) from shop.inventory_reservations r where r.item_id=i.id and r.status='ACTIVE'),0)::int as active from shop.inventory_items i`))if(v.on_hand<0||v.reserved<0||v.reserved>v.on_hand||v.reserved!==v.active)violations.push({tenant:s.id,item:v.id,kind:'saldo/reserva'});
  for(const o of await rows(tx,sql`select o.id,o.principal_id,(select sum(quantity)::int from shop.order_items i where i.order_id=o.id) as qty,(select coalesce(sum(quantity),0)::int from shop.inventory_reservations r where r.order_id=o.id and r.status='CONSUMED') as consumed,(select count(*)::int from shop.order_incidents x where x.order_id=o.id and x.code='PAID_WITHOUT_STOCK') as nostock from shop.orders o`)){orders++;if(o.principal_id){paid++;if(o.consumed!==o.qty&&!o.nostock)violations.push({tenant:s.id,order:o.id,kind:'baixa'});}else if(o.consumed>0)violations.push({tenant:s.id,order:o.id,kind:'baixa sem pagamento'});else pending++;}
  const [dup]=await rows(tx,sql`select count(*)::int as n from (select cart_id,cart_version from shop.orders group by 1,2 having count(*)>1) d`);if(dup.n)violations.push({tenant:s.id,kind:'pedido duplicado'});
  for(const x of await rows(tx,sql`select extract(epoch from (s.created_at-o.created_at))*1000 as ms from shop.simulated_payments s join shop.payment_attempts a on (a.tenant_id,a.id)=(s.tenant_id,s.reference) join shop.orders o on (o.tenant_id,o.id)=(a.tenant_id,a.order_id)`))external.push(Number(x.ms));
 });
 const sorted=external.sort((a,b)=>a-b),p=q=>sorted.length?Math.round(sorted[Math.min(sorted.length-1,Math.floor(q*sorted.length))]):null;
 writeFileSync('/app/artifacts/capacity-invariants.json',JSON.stringify({passed:violations.length===0&&load.contention?.won===1,violations:violations.slice(0,50),violationCount:violations.length,orders,paid,unpaid:pending,contention:load.contention,gatewayEmissionMs:{n:sorted.length,p50:p(0.5),p95:p(0.95),max:sorted.at(-1)??null}},null,1));
 console.log(JSON.stringify({violations:violations.length,orders,paid,contention:load.contention}));
 }finally{await db.pool.end();}
}

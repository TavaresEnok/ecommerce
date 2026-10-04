// Screenshots of every page of the running app (synthetic demo data), desktop and mobile.
// Runs inside the tests image against the web service:
//   docker compose run --rm --no-deps -v ./scripts/capture-pages.mjs:/app/scripts/capture-pages.mjs:ro \
//     -v ./.local/demo.json:/app/demo.json:ro tests node scripts/capture-pages.mjs
// With the example stores of scripts/fixtures/seed-presets.mjs, mount .local/demo-presets.json as /app/demo.json instead:
// the first store (CAPTURE_STORE=atelie by default) gets every page; the other stores get home, catalog and product.
// Output: artifacts/capturas/<label>/<nn>-<nome>-<largura>.png and indice.json
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';
import { client } from './seed.mjs';
const base=process.env.BASE_URL||'http://web:3000',api=client(base,process.env.APP_ORIGIN||'http://localhost:3000'),label=process.env.CAPTURE_LABEL||'atual',out=`/app/artifacts/capturas/${label}`,sizes=(process.env.CAPTURE_SIZES||'1440x900,390x844').split(',').map(s=>s.split('x').map(Number));
// demo.json (scripts/seed.mjs) lists {email,password,tenantId,url}; demo-presets.json lists {key,…,store}.
const demo=JSON.parse(readFileSync('/app/demo.json','utf8')).map(d=>({...d,url:d.url??d.store}));
const store=demo.find(d=>d.key===(process.env.CAPTURE_STORE||'atelie'))??demo[0],slug=new URL(store.url).pathname.split('/')[2],others=demo.filter(d=>d!==store&&d.key);
mkdirSync(out,{recursive:true});
const ok=(r,s=201)=>{if(r.status!==s)throw new Error(`${r.status} ${JSON.stringify(r.body)}`);return r;};
// Owner session and one paid order, created through the same public/admin endpoints the interface uses.
const login=ok(await api('auth/login',{method:'POST',body:{email:store.email,password:store.password}}));
const actor={csrf:login.body.csrf,cookie:login.headers.get('set-cookie').split(';')[0]};
const catalogue=ok(await api(`tenants/${store.tenantId}/catalogue`,{actor}),200).body,product=catalogue.products.find(p=>p.status==='ACTIVE'&&p.variants.some(v=>v.active&&v.available>0))??catalogue.products.find(p=>p.status==='ACTIVE'),variant=(product.variants.find(v=>v.active&&v.available>0)??product.variants[0]).id;
const address={cep:'01001000',street:'Rua Demonstração',number:'1',city:'São Paulo',state:'SP',complement:''};
const add=()=>api(`public/stores/${slug}/cart/items`,{method:'POST',body:{variant_id:variant,quantity:1}});
let order=null,orderCart=null;
try{const a=ok(await add());orderCart=a.headers.get('set-cookie').split(';')[0];const q=ok(await api(`public/stores/${slug}/cart/quotes`,{method:'POST',cookie:orderCart,body:{kind:'TABLE',address}})).body;
 order=ok(await api(`public/stores/${slug}/cart/checkout`,{method:'POST',cookie:orderCart,body:{key:randomUUID(),quote_id:q.id,address,buyer:{name:'Comprador Demonstração',email:'comprador@example.test'},method:'PIX',total_cents:q.total_cents}})).body;
 for(let i=0;i<40;i++){const r=await api(`tenants/${store.tenantId}/purchase/attempts/${order.attempts[0].id}/simulate`,{method:'POST',actor,body:{status:'APPROVED'}});if(r.status===201)break;await new Promise(r=>setTimeout(r,1000));}
 await new Promise(r=>setTimeout(r,3000));}catch(e){console.log('Pedido de demonstração não criado:',e.message);}
const cart=ok(await add()).headers.get('set-cookie').split(';')[0];
const cookieOf=c=>({name:c.split('=')[0],value:c.split('=').slice(1).join('='),domain:new URL(base).hostname,path:'/'});
const panel=`/painel/${store.tenantId}`,shop=`/lojas/${slug}`;
// [name, path, session: 'none'|'owner'|'cart', optional action after load]
const pages=[
 ['acesso-entrar','/','none'],
 ['acesso-criar','/','none',async p=>{await p.getByRole('button',{name:'Criar acesso'}).click();}],
 ['acesso-recuperar','/','none',async p=>{await p.getByRole('button',{name:'Esqueci minha senha'}).click();}],
 ['suas-lojas','/','owner'],
 ['painel-catalogo',panel,'owner'],
 ['painel-produto-editar',panel,'owner',async p=>{await p.getByRole('link',{name:new RegExp(product.name)}).first().click();}],
 ['painel-novo-produto',`${panel}?novo=1`,'owner'],
 ['painel-estoque',`${panel}?aba=estoque`,'owner'],
 ['painel-imagens',`${panel}?aba=midia`,'owner'],
 ['painel-categorias-locais',`${panel}?aba=organizacao`,'owner'],
 ['painel-aparencia',`${panel}/aparencia`,'owner',async p=>{await p.waitForTimeout(2500);}],
 ['painel-aparencia-celular',`${panel}/aparencia`,'owner',async p=>{await p.getByRole('button',{name:'Celular'}).click().catch(()=>{});await p.waitForTimeout(2500);}],
 ['painel-pedidos',`${panel}/pedidos`,'owner'],
 ['painel-pedido-detalhe',`${panel}/pedidos`,'owner',async p=>{await p.getByRole('link',{name:/^Nº \d+$/}).first().click();await p.getByRole('heading',{name:'Expedição'}).waitFor({timeout:10000});}],
 ['painel-atendimento',`${panel}/atendimento`,'owner'],
 ['painel-hoje',`${panel}/operacao`,'owner'],
 ...['loja','entregas','dominio','seguranca','plano','dados'].map(s=>[`painel-config-${s}`,`${panel}/configuracoes/${s}`,'owner']),
 ['plataforma',`/plataforma`,'owner'],
 ['preview-rascunho',`/preview/${store.tenantId}`,'owner'],
 ['vitrine-inicio',shop,'none'],
 ['vitrine-catalogo',`${shop}/produtos`,'none'],
 ['vitrine-busca',`${shop}?q=${encodeURIComponent(product.name.split(' ')[0])}`,'none'],
 ['vitrine-produto',`${shop}/produtos/${product.slug}`,'none'],
 ['vitrine-carrinho',`${shop}/carrinho`,'cart'],
 ['vitrine-atendimento',`${shop}/atendimento`,'none'],
 ...(order?[['vitrine-pedido-comprovante',`${shop}/pedidos/${order.id}`,'order']]:[]),
 ['vitrine-nao-encontrada',`${shop}/produtos/nao-existe`,'none'],
];
// Other example stores (other models and edge cases): home, catalog and the first product of each.
for(const o of others){const oslug=new URL(o.url).pathname.split('/')[2],data=await (await fetch(`${base}/api/public/stores/${oslug}`)).json().catch(()=>({products:[]}));
 pages.push([`loja-${o.key}-inicio`,`/lojas/${oslug}`,'none'],...(data.products?.length?[[`loja-${o.key}-catalogo`,`/lojas/${oslug}/produtos`,'none'],[`loja-${o.key}-produto`,`/lojas/${oslug}/produtos/${data.products[0].slug}`,'none']]:[]));}
const browser=await chromium.launch(),index=[];
const only=(process.env.CAPTURE_ONLY||'').split(',').filter(Boolean);
for(const [i,[name,path,session,action]] of pages.entries())for(const [width,height] of sizes){
 if(only.length&&!only.some(o=>name.includes(o)))continue;
 const context=await browser.newContext({viewport:{width,height}});
 if(session==='owner')await context.addCookies([cookieOf(actor.cookie)]);if(session==='cart')await context.addCookies([cookieOf(cart)]);if(session==='order'&&orderCart)await context.addCookies([cookieOf(orderCart)]);
 const page=await context.newPage(),file=`${String(i+1).padStart(2,'0')}-${name}-${width}x${height}.png`,entry={file,path,width,height,result:'ok'};
 try{await page.goto(base+path,{waitUntil:'networkidle',timeout:30000});if(action)await action(page);await page.waitForTimeout(800);
  entry.title=await page.title();entry.firstItem=await page.evaluate(()=>{const row=document.querySelector('[data-first-item],table tbody tr, .product-list li, .grid-products > *');if(!row)return null;const r=row.getBoundingClientRect();return {top:Math.round(r.top+scrollY),bottom:Math.round(r.bottom+scrollY),fitsViewport:r.bottom<=innerHeight};});entry.overflowPx=await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-window.innerWidth));
 }catch(e){entry.result=`falha: ${String(e.message).split('\n')[0]}`;}
 await page.screenshot({path:`${out}/${file.replace('.png','-tela.png')}`,fullPage:false}).catch(()=>{});await page.screenshot({path:`${out}/${file}`,fullPage:true}).catch(()=>{entry.result+=' (sem imagem)';});
 index.push(entry);console.log(entry.result==='ok'?'✔':'✖',file,entry.result==='ok'?'':entry.result);await context.close();
}
await browser.close();writeFileSync(`${out}/indice.json`,JSON.stringify({base,store:slug,capturedAt:new Date().toISOString(),pages:index},null,2));
console.log(`${index.filter(e=>e.result==='ok').length}/${index.length} capturas em artifacts/capturas/${label}`);

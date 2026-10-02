import { test } from 'node:test';
import http from 'node:http';
const hostRequest=(base,path,host)=>new Promise((resolve,reject)=>{http.get(new URL(path,base),{headers:{host}},response=>{let body='';response.on('data',c=>body+=c);response.on('end',()=>resolve({status:response.statusCode,body}));}).on('error',reject);});
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { Queue } from 'bullmq';
import { createDatabase, newId, rows, sql, withTenant } from '@ecommerce/database';
import { QUOTA,bucket,putObject,getObject,deleteObject,reconcileMedia } from '@ecommerce/media';

import { seed,client } from '../scripts/seed.mjs';
assert.equal(process.env.APP_ENV,'test');const base=process.env.BASE_URL;assert.equal(new URL(base).hostname,'web');
const api=client(base),report={passed:false,criteria:['T01','T02','FK catálogo (T03 parcial)','T22','T23','T37','Catálogo/estoque','Carrinho/preço/frete'],tests:[],visual:[]};
const address={cep:'01001000',street:'Rua TESTE',number:'1',city:'São Paulo TESTE',state:'SP',complement:''};
const expect=(r,status=201)=>{assert.equal(r.status,status,JSON.stringify(r.body));return r.body;};
test('Fase 2 integrada: duas lojas navegáveis, banco e S3 reais',async t=>{
  const database=createDatabase(process.env.DATABASE_URL,1),redis=new URL(process.env.REDIS_URL),queue=new Queue('media',{connection:{host:redis.hostname,port:Number(redis.port||6379),maxRetriesPerRequest:1}});
  const browser=await chromium.launch({headless:true});
  let failures=0;
  const check=async(name,fn)=>{let passed=false;await t.test(name,async()=>{await fn();passed=true;});if(!passed)failures++;report.tests.push({name,result:passed?'passed':'failed'});};
  let stores,a,b,A,B,asset;
  try {
    stores=await seed(api);[a,b]=stores;A=a.id;B=b.id;
    await check('Produto simples, atributos explícitos, SKU único e estoque auditado',async()=>{
      const c=expect(await api(`tenants/${A}/catalogue`,{actor:a.actor}),200),simple=c.products.find(p=>p.id===a.simple.id),variable=c.products.find(p=>p.id===a.variable.id);
      assert.equal(simple.variants.length,1);assert.equal(simple.variants[0].is_default,true);assert.equal(simple.variants[0].price_cents,'2990');assert.equal(simple.variants[0].available,10);
      assert.equal(variable.variants.filter(v=>v.active).length,2);assert.equal(variable.variants.find(v=>v.is_default).active,false);assert.equal(c.movements.length,3);
      expect(await api(`tenants/${A}/catalogue/products`,{method:'POST',actor:a.actor,body:{name:'Duplicado TESTE',slug:'duplicado',sku:simple.variants[0].sku,price_cents:'100'}}),409);
      expect(await api(`tenants/${A}/catalogue/products`,{method:'POST',actor:a.actor,body:{name:'Preço float',slug:'float',sku:'float',price_cents:1.5}}),400);
      expect(await api(`tenants/${A}/catalogue/adjustments`,{method:'POST',actor:a.actor,body:{variant_id:a.simple.variant_id,location_id:a.location.id,delta:-11,reason:'Saída impossível'}}),409);
      await withTenant(database,A,a.actor.id,async tx=>{assert.equal((await rows(tx,sql`select * from shop.inventory_items where variant_id=${a.simple.variant_id}`))[0].on_hand,10);});
    });
    await check('Ajustes concorrentes serializados e plano real de consulta por tenant',async()=>{
      const results=await Promise.all([1,2].map(()=>api(`tenants/${A}/catalogue/adjustments`,{method:'POST',actor:a.actor,body:{variant_id:a.simple.variant_id,location_id:a.location.id,delta:1,reason:'Ajuste concorrente TESTE'}})));
      assert.deepEqual(results.map(r=>expect(r).balance).sort((a,b)=>a-b),[11,12]);
      expect(await api(`tenants/${A}/catalogue/adjustments`,{method:'POST',actor:a.actor,body:{variant_id:a.simple.variant_id,location_id:a.location.id,delta:-2,reason:'Recompor fixture TESTE'}}));
      report.queryPlan=await withTenant(database,A,null,async tx=>(await tx.execute(sql`explain (analyze,buffers,format json) select id,name from shop.products where tenant_id=${A} and status='ACTIVE' and search_document @@ websearch_to_tsquery('portuguese',shop.search_text('cafes'))`)).rows);
      assert.ok(report.queryPlan.length);report.indexDecision='GIN parcial de tsvector português após EXPLAIN ANALYZE registrado antes da migration. UNIQUE por tenant cobre escopo. Fixture pequena não é ensaio de capacidade.';
            assert.equal((await database.pool.query("select indexname from pg_indexes where schemaname='shop' and indexname='products_public_search'")).rowCount,1);
    });
    await check('T01/T02: autorização de catálogo, FORCE RLS, contexto sem vazamento e FK composta',async()=>{
      expect(await api(`tenants/${B}/catalogue`,{actor:a.actor}),404);expect(await api(`tenants/${B}/storefront/preview`,{actor:a.actor}),404);
      const names=['products','product_variants','product_options','option_values','variant_values','inventory_items','media_assets','theme_revisions','carts','shipping_quotes'];
      for(const table of names){assert.equal((await database.pool.query(`select * from shop.${table}`)).rowCount,0);await withTenant(database,A,null,async tx=>{const result=await tx.execute(sql.raw(`select tenant_id from shop.${table}`));for(const r of result.rows)assert.equal(r.tenant_id,A);});assert.equal((await database.pool.query(`select * from shop.${table}`)).rowCount,0);}
      await assert.rejects(withTenant(database,A,a.actor.id,tx=>tx.execute(sql`insert into shop.inventory_items(id,tenant_id,variant_id,location_id) values(${newId()},${A},${b.simple.variant_id},${a.location.id})`)),e=>e.cause?.code==='23503'||e.code==='23503');
      await assert.rejects(withTenant(database,A,a.actor.id,tx=>tx.execute(sql`insert into shop.product_media(id,tenant_id,product_id,asset_id) values(${newId()},${A},${b.simple.id},${newId()})`)),e=>e.cause?.code==='23503'||e.code==='23503');
      const valueA=await withTenant(database,A,null,async tx=>(await rows(tx,sql`select id,option_id from shop.option_values limit 1`))[0]);
      const valueB=await withTenant(database,B,null,async tx=>(await rows(tx,sql`select id,option_id from shop.option_values limit 1`))[0]);
      for(const value of [valueA,valueB])await assert.rejects(withTenant(database,A,a.actor.id,tx=>tx.execute(sql`insert into shop.variant_values(id,tenant_id,product_id,variant_id,option_id,value_id) values(${newId()},${A},${a.variable.id},${a.simple.variant_id},${value.option_id},${value.id})`)),e=>e.cause?.code==='23503'||e.code==='23503');
      assert.equal((await database.pool.query("select policyname from pg_policies where policyname='migration_catalogue_tenants'")).rowCount,0);
      assert.equal((await database.pool.query("select column_name from information_schema.columns where table_schema='shop' and table_name='product_variants' and column_name='attributes'")).rowCount,0);
      const roles=await database.pool.query("select relrowsecurity,relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='shop' and c.relkind='r'");for(const row of roles.rows){assert.equal(row.relrowsecurity,true);assert.equal(row.relforcerowsecurity,true);}
    });
    await check('T22: busca com acentos/SKU, cache por loja, rascunho não vaza e publicação atômica',async()=>{
      for(let i=0;i<3;i++)for(const s of stores){const publicData=expect(await api(`public/stores/${s.slug}?q=cafe`),200);assert.equal(publicData.products.length,1);assert.match(publicData.products[0].name,new RegExp(s===a?'aurora':'brisa'));assert.equal(publicData.route.tenant_id,s.id);}
      assert.equal(expect(await api(`public/stores/${a.slug}?q=${b.variants[0].id}`),200).products.length,0);
      assert.equal(expect(await api(`public/stores/${a.slug}?q=aurora-Azul`),200).products[0].id,a.variable.id);
      assert.equal(expect(await api(`public/stores/${a.slug}?q=CAF%C3%89S`),200).products[0].id,a.simple.id);
      const footwear=expect(await api(`tenants/${A}/catalogue/products`,{method:'POST',actor:a.actor,body:{name:'Calçado TESTE',slug:'calcado',description:'Produto sintético para verificar português.',sku:'CALCADO-TESTE',price_cents:'1000'}}));
      expect(await api(`tenants/${A}/catalogue/products/${footwear.id}`,{method:'PATCH',actor:a.actor,body:{status:'ACTIVE'}}),200);
      for(const term of ['calçado','calcado','CALÇADOS'])assert.equal(expect(await api(`public/stores/${a.slug}?q=${encodeURIComponent(term)}`),200).products[0].id,footwear.id);
      assert.equal(expect(await api(`public/stores/${b.slug}?q=calcado`),200).products.length,0);
      const draft=expect(await api(`tenants/${A}/storefront/draft`,{method:'POST',actor:a.actor,body:{schema_version:1,title:'SEGREDO RASCUNHO TESTE',description:'Privado',color:'#245742',font:'system',hero:'Somente preview',pages:[],menu:[],assets:[]}}));
      assert.equal(expect(await api(`tenants/${A}/storefront/preview`,{actor:a.actor}),200).theme.title,'SEGREDO RASCUNHO TESTE');
      assert.equal(expect(await api(`public/stores/${a.slug}`),200).theme.title,'AURORA TESTE');
      expect(await api(`tenants/${A}/storefront/publish`,{method:'POST',actor:a.actor,body:{revision_id:a.draft.id}}),409);
      assert.equal(expect(await api(`public/stores/${a.slug}`),200).theme.title,'AURORA TESTE');
      expect(await api(`tenants/${A}/storefront/draft`,{method:'POST',actor:a.actor,body:{schema_version:2,title:'Inválido',description:'x',pages:[],menu:[],assets:[]}}),400);
      expect(await api(`tenants/${A}/storefront/draft`,{method:'POST',actor:a.actor,body:{schema_version:1,title:'<script>evil</script>',description:'x',pages:[],menu:[],assets:[]}}),400);
      await assert.rejects(withTenant(database,A,a.actor.id,tx=>tx.execute(sql`update shop.theme_revisions set content='{}' where id=${draft.id}`)),e=>e.cause?.code==='42501'||e.code==='42501');
      expect(await api('public/resolve?host=unknown.localhost'),404);expect(await api(`public/resolve?host=${a.slug}.localhost`),200);
    });
    await check('T23: conteúdo inválido, concorrência limitada, processamento WebP e S3 privado',async()=>{
      expect(await api(`tenants/${A}/catalogue/media`,{method:'POST',actor:a.actor,raw:Buffer.from('<svg><script>evil</script></svg>')}),400);
      expect(await api(`tenants/${A}/catalogue/media`,{method:'POST',actor:a.actor,raw:Buffer.alloc(10*1024*1024+1)}),413);
      const oversize=await sharp({create:{width:10001,height:4000,channels:3,background:'#246942'}}).png().toBuffer();
      expect(await api(`tenants/${A}/catalogue/media`,{method:'POST',actor:a.actor,raw:oversize}),400);
      const image=await sharp({create:{width:48,height:48,channels:3,background:'#246942'}}).png().toBuffer();
      await queue.pause();try {
        const uploads=await Promise.all([0,1,2].map(()=>api(`tenants/${A}/catalogue/media`,{method:'POST',actor:a.actor,raw:image})));
        assert.equal(uploads.filter(r=>r.status===201).length,2);assert.equal(uploads.filter(r=>r.status===409).length,1);asset=uploads.find(r=>r.status===201).body.id;
        const badDraft=expect(await api(`tenants/${A}/storefront/draft`,{method:'POST',actor:a.actor,body:{schema_version:1,title:'NÃO PUBLICAR TESTE',description:'Mídia pendente',pages:[],menu:[],assets:[asset]}}));
        expect(await api(`tenants/${A}/storefront/publish`,{method:'POST',actor:a.actor,body:{revision_id:badDraft.id}}),409);
        assert.equal(expect(await api(`public/stores/${a.slug}`),200).theme.title,'AURORA TESTE');
        expect(await api(`tenants/${A}/storefront/draft`,{method:'POST',actor:a.actor,body:{schema_version:1,title:'SEGREDO RASCUNHO TESTE',description:'Privado',pages:[],menu:[],assets:[]}}));
        const original=await withTenant(database,A,null,async tx=>(await rows(tx,sql`select original_key from shop.media_assets where id=${asset}`))[0]);
        assert.deepEqual(await getObject(original.original_key),image);
        const anonymous=await fetch(`${process.env.S3_ENDPOINT}/${bucket}/${original.original_key}`);assert.ok([401,403].includes(anonymous.status));
      }finally{await queue.resume();}
      let c;for(let i=0;i<80;i++){c=expect(await api(`tenants/${A}/catalogue`,{actor:a.actor}),200);if(c.media.filter(m=>m.status==='READY').length===2)break;await new Promise(r=>setTimeout(r,250));}
      assert.equal(c.media.filter(m=>m.status==='READY').length,2);
      const physical=await withTenant(database,A,null,async tx=>(await rows(tx,sql`select renditions from shop.media_assets where id=${asset}`))[0]);
      const physicalKey=physical.renditions[0].key,physicalBody=await getObject(physicalKey);
      const unavailableDraft=expect(await api(`tenants/${A}/storefront/draft`,{method:'POST',actor:a.actor,body:{schema_version:1,title:'STORAGE INDISPONÍVEL TESTE',description:'Não publicar',pages:[],menu:[],assets:[asset]}}));
      await deleteObject(physicalKey);try{expect(await api(`tenants/${A}/storefront/publish`,{method:'POST',actor:a.actor,body:{revision_id:unavailableDraft.id}}),409);assert.equal(expect(await api(`public/stores/${a.slug}`),200).theme.title,'AURORA TESTE');}finally{await putObject(physicalKey,physicalBody,'image/webp');}
      expect(await api(`tenants/${A}/storefront/draft`,{method:'POST',actor:a.actor,body:{schema_version:1,title:'SEGREDO RASCUNHO TESTE',description:'Privado',pages:[],menu:[],assets:[]}}));
      expect(await api(`tenants/${A}/catalogue/products/${a.simple.id}/media`,{method:'POST',actor:a.actor,body:{asset_id:asset}}));
      const imageResponse=await fetch(`${base}/api/public/stores/${a.slug}/media/${asset}/small`);assert.equal(imageResponse.status,200);assert.equal(imageResponse.headers.get('content-type'),'image/webp');const bytes=Buffer.from(await imageResponse.arrayBuffer());assert.equal((await sharp(bytes).metadata()).format,'webp');
      assert.equal((await fetch(`${base}/api/public/stores/${b.slug}/media/${asset}/small`)).status,404);
      // Deliberately corrupt accounting to exercise drift/full-quota recovery; actual objects stay small.
      await withTenant(database,A,null,tx=>tx.execute(sql`update shop.media_assets set stored_bytes=${QUOTA} where id=${asset}`));
      expect(await api(`tenants/${A}/catalogue/media`,{method:'POST',actor:a.actor,raw:image}),409);
      const reconciled=await reconcileMedia(database,A);assert.ok(reconciled.bytes>0&&reconciled.bytes<100000);
      const sum=await withTenant(database,A,null,async tx=>(await rows(tx,sql`select sum(stored_bytes)::text as bytes from shop.media_assets`))[0].bytes);assert.equal(Number(sum),reconciled.bytes);
      const accounting=await withTenant(database,A,null,async tx=>(await rows(tx,sql`select stored_bytes::text from shop.media_usage`))[0]);assert.equal(Number(accounting.stored_bytes),reconciled.bytes);
      await queue.pause();try{
        await withTenant(database,A,null,tx=>tx.execute(sql`update shop.media_usage set stored_bytes=${QUOTA-image.length-1}`));
        const near=await Promise.all([0,1,2].map(()=>api(`tenants/${A}/catalogue/media`,{method:'POST',actor:a.actor,raw:image})));
        assert.equal(near.filter(r=>r.status===201).length,2);assert.equal(near.filter(r=>r.status===409).length,1);
        const admitted=await withTenant(database,A,null,async tx=>(await rows(tx,sql`select stored_bytes::text from shop.media_usage`))[0]);assert.ok(BigInt(admitted.stored_bytes)>BigInt(QUOTA)&&BigInt(admitted.stored_bytes)<=BigInt(QUOTA+2*10*1024*1024));
      }finally{await queue.resume();}
      for(let i=0;i<80;i++){const assets=expect(await api(`tenants/${A}/catalogue`,{actor:a.actor}),200).media;if(assets.filter(m=>m.status==='READY').length===4)break;await new Promise(r=>setTimeout(r,250));}
      await reconcileMedia(database,A);
      const stale=`tenant/${A}/temporary/stale-test`;await putObject(stale,Buffer.from('temporary'),'application/octet-stream');
      await withTenant(database,A,a.actor.id,async tx=>{const member=(await rows(tx,sql`select id from shop.tenant_memberships where user_id=${a.actor.id}`))[0];await tx.execute(sql`insert into shop.media_assets(id,tenant_id,actor_membership_id,status,original_key,content_hash,stored_bytes,created_at) values(${newId()},${A},${member.id},'UPLOADING',${stale},'test',9,now()-interval '25 hours')`);});
            await reconcileMedia(database,A);await assert.rejects(getObject(stale));
            expect(await api(`tenants/${A}/storefront/media/${asset}/small`),401);
            assert.equal((await fetch(`${base}/api/tenants/${A}/storefront/media/${asset}/small`,{headers:{cookie:a.actor.cookie}})).status,200);
    });
    let cookie,quote;
    await check('Carrinho visitante persistente, preço canônico, nenhuma reserva e isolamento',async()=>{
      const empty=await api(`public/stores/${a.slug}/cart`);expect(empty,200);cookie=empty.headers.get('set-cookie').split(';')[0];
      const cart=expect(await api(`public/stores/${a.slug}/cart/items`,{method:'POST',cookie,body:{variant_id:a.simple.variant_id,quantity:2}}));assert.equal(cart.subtotal_cents,'5980');
      expect(await api(`public/stores/${a.slug}/cart/items`,{method:'POST',cookie,body:{variant_id:b.simple.variant_id,quantity:1}}),404);
      expect(await api(`public/stores/${a.slug}/cart/items`,{method:'POST',cookie,body:{variant_id:a.variable.variant_id,quantity:1}}),404);
      const explicit=expect(await api(`public/stores/${a.slug}/cart/items`,{method:'POST',cookie,body:{variant_id:a.variants[0].id,quantity:1}}));assert.equal(explicit.items.length,2);assert.equal(explicit.subtotal_cents,'10880');assert.ok(explicit.items.some(i=>i.attributes.cor==='Azul'));
      expect(await api(`public/stores/${a.slug}/cart/items`,{method:'POST',cookie,body:{variant_id:a.variants[0].id,quantity:0}}));
      expect(await api(`public/stores/${a.slug}/cart/items`,{method:'POST',cookie,body:{variant_id:a.simple.variant_id,quantity:1.5}}),400);
      expect(await api(`public/stores/${a.slug}/cart/items`,{method:'POST',cookie,body:{variant_id:a.simple.variant_id,quantity:11}}),409);
      const anonymous=expect(await api(`public/stores/${a.slug}/cart`),200);assert.equal(anonymous.items.length,0);
      const other=expect(await api(`public/stores/${b.slug}/cart`,{cookie}),200);assert.equal(other.items.length,0);
      expect(await api(`tenants/${A}/catalogue/variants/${a.simple.variant_id}`,{method:'PATCH',actor:a.actor,body:{price_cents:'3190'}}),200);
      assert.equal(expect(await api(`public/stores/${a.slug}/cart`,{cookie}),200).subtotal_cents,'6380');
      await withTenant(database,A,null,async tx=>{const balance=(await rows(tx,sql`select on_hand,reserved from shop.inventory_items where variant_id=${a.simple.variant_id}`))[0];assert.deepEqual(balance,{on_hand:10,reserved:0});});
    });
    await check('Frete com prioridade, retirada, CEP não atendido, validade e fingerprint',async()=>{
      expect(await api(`public/stores/${a.slug}/cart/quotes`,{method:'POST',cookie,body:{kind:'TABLE',address:{...address,cep:'99999999'}}}),404);
      const centre=expect(await api(`tenants/${A}/storefront/shipping`,{method:'POST',actor:a.actor,body:{name:'Centro TESTE',kind:'TABLE',cep_start:'01000000',cep_end:'01009999',price_cents:'900',days:1,priority:20}}));
      quote=expect(await api(`public/stores/${a.slug}/cart/quotes`,{method:'POST',cookie,body:{kind:'TABLE',address}}));assert.equal(quote.price_cents,'900');assert.equal(quote.total_cents,'7280');assert.ok(new Date(quote.expires_at)>new Date());
      expect(await api(`public/stores/${a.slug}/cart/quotes/validate`,{method:'POST',cookie,body:{quote_id:quote.id,address}}));
      expect(await api(`public/stores/${a.slug}/cart/quotes/validate`,{method:'POST',body:{quote_id:quote.id,address}}),409);
      expect(await api(`public/stores/${a.slug}/cart/quotes/validate`,{method:'POST',cookie,body:{quote_id:quote.id,address:{...address,number:'2'}}}),409);
      expect(await api(`tenants/${A}/storefront/shipping`,{method:'POST',actor:a.actor,body:{id:centre.id,name:'Centro TESTE',kind:'TABLE',cep_start:'01000000',cep_end:'01009999',price_cents:'900',days:1,priority:20}}));
      expect(await api(`public/stores/${a.slug}/cart/quotes/validate`,{method:'POST',cookie,body:{quote_id:quote.id,address}}),409);
      quote=expect(await api(`public/stores/${a.slug}/cart/quotes`,{method:'POST',cookie,body:{kind:'TABLE',address}}));
      expect(await api(`public/stores/${a.slug}/cart/items`,{method:'POST',cookie,body:{variant_id:a.simple.variant_id,quantity:1}}));
      expect(await api(`public/stores/${a.slug}/cart/quotes/validate`,{method:'POST',cookie,body:{quote_id:quote.id,address}}),409);
      expect(await api(`public/stores/${a.slug}/cart/items`,{method:'POST',cookie,body:{variant_id:a.simple.variant_id,quantity:2}}));
      quote=expect(await api(`public/stores/${a.slug}/cart/quotes`,{method:'POST',cookie,body:{kind:'TABLE',address}}));
      expect(await api(`tenants/${A}/catalogue/variants/${a.simple.variant_id}`,{method:'PATCH',actor:a.actor,body:{price_cents:'3190',weight_g:350}}),200);
      expect(await api(`public/stores/${a.slug}/cart/quotes/validate`,{method:'POST',cookie,body:{quote_id:quote.id,address}}),409);
      quote=expect(await api(`public/stores/${a.slug}/cart/quotes`,{method:'POST',cookie,body:{kind:'TABLE',address}}));
      expect(await api(`tenants/${A}/catalogue/variants/${a.simple.variant_id}`,{method:'PATCH',actor:a.actor,body:{price_cents:'3290'}}),200);
      expect(await api(`public/stores/${a.slug}/cart/quotes/validate`,{method:'POST',cookie,body:{quote_id:quote.id,address}}),409);
      const pickup=expect(await api(`public/stores/${a.slug}/cart/quotes`,{method:'POST',cookie,body:{kind:'PICKUP',address}}));assert.equal(pickup.price_cents,'0');
      await withTenant(database,A,null,tx=>tx.execute(sql`update shop.shipping_quotes set expires_at=now()-interval '1 second' where id=${pickup.id}`));
      expect(await api(`public/stores/${a.slug}/cart/quotes/validate`,{method:'POST',cookie,body:{quote_id:pickup.id,address}}),409);
    });
    await check('Arquivamento invalida oferta e carrinho, estoque continua auditável',async()=>{
      expect(await api(`tenants/${A}/catalogue/products/${a.simple.id}`,{method:'PATCH',actor:a.actor,body:{status:'ARCHIVED'}}),200);
      assert.equal(expect(await api(`public/stores/${a.slug}?q=cafe`),200).products.length,0);assert.equal(expect(await api(`public/stores/${a.slug}/cart`,{cookie}),200).valid,false);
      expect(await api(`public/stores/${a.slug}/cart/quotes`,{method:'POST',cookie,body:{kind:'TABLE',address}}),409);
      expect(await api(`tenants/${A}/catalogue/products/${a.simple.id}`,{method:'PATCH',actor:a.actor,body:{status:'ACTIVE'}}),200);
    });
    await check('Slug histórico redireciona sem reutilização e domínio não mistura lojas',async()=>{
      expect(await api(`tenants/${A}/catalogue/products/${a.simple.id}`,{method:'PATCH',actor:a.actor,body:{slug:'caneca-nova'}}),200);
      assert.equal(expect(await api(`public/stores/${a.slug}/redirect/caneca-cafe`),200).slug,'caneca-nova');
      expect(await api(`tenants/${A}/catalogue/products/${a.variable.id}`,{method:'PATCH',actor:a.actor,body:{slug:'caneca-cafe'}}),409);
      const moved=await fetch(`${base}/lojas/${a.slug}/produtos/caneca-cafe`,{redirect:'manual'});assert.equal(moved.status,308);
      expect(await api(`tenants/${A}/catalogue/products/${a.simple.id}`,{method:'PATCH',actor:a.actor,body:{slug:'caneca-cafe'}}),200);
      const host=await hostRequest(base,'/',`${a.slug}.localhost:3000`);assert.equal(host.status,200);assert.ok(host.body.includes('AURORA TESTE'));
      assert.equal((await hostRequest(base,`/lojas/${b.slug}`,`${a.slug}.localhost:3000`)).status,404);
      assert.equal((await hostRequest(base,'/','unknown.localhost:3000')).status,404);
    });
    await check('T37: canonical/sitemap/robots/JSON-LD isolados, preview privado, fornecedor TESTE',async()=>{
      for(const s of stores){const page=await browser.newPage();try{await page.goto(`${base}/lojas/${s.slug}/produtos/caneca-cafe`);await page.getByRole('heading',{name:`Caneca café ${s===a?'aurora':'brisa'}`,exact:true}).waitFor();assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'),`${s.published.canonical}/produtos/caneca-cafe`);const data=JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());assert.equal(data.name,`Caneca café ${s===a?'aurora':'brisa'}`);assert.equal(data.offers[0].priceCurrency,'BRL');assert.equal(data.offers[0].price,s===a?'32.90':'29.90');assert.match(await page.locator('meta[name=robots]').getAttribute('content'),/noindex/);await page.getByRole('heading',{name:'Fornecedor e atendimento'}).waitFor();}finally{await page.close();}
        const sitemap=await fetch(`${base}/lojas/${s.slug}/sitemap.xml`).then(r=>r.text());assert.ok(sitemap.includes(`${s.published.canonical}/produtos/caneca-cafe`));assert.ok(!sitemap.includes('/preview')&&!sitemap.includes('/painel')&&!sitemap.includes('/carrinho'));assert.ok(!sitemap.includes(stores.find(o=>o!==s).slug));
        const robots=await fetch(`${base}/lojas/${s.slug}/robots.txt`).then(r=>r.text());assert.match(robots,/Disallow: \/\n/);assert.ok(robots.includes(s.published.canonical));
      }
      expect(await api(`tenants/${A}/storefront/preview`),401);
      const unauth=await browser.newPage();await unauth.goto(`${base}/preview/${A}`);assert.ok(!(await unauth.content()).includes('SEGREDO RASCUNHO TESTE'));await unauth.close();
    });
    await check('Playwright desktop/móvel: vitrine, busca, produto, carrinho/frete e painel',async()=>{
      for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
        const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
        try {
          await page.goto(`${base}/lojas/${a.slug}`);await page.getByRole('heading',{name:'AURORA TESTE',exact:true}).waitFor();
          await page.getByRole('searchbox',{name:'Buscar produto ou SKU'}).fill('cafe');await page.getByRole('button',{name:'Pesquisar',exact:true}).click();await page.getByRole('link',{name:'Caneca café aurora',exact:true}).click();
          await page.getByRole('button',{name:'Adicionar ao carrinho',exact:true}).click();await page.getByRole('status').waitFor({timeout:10000}).catch(async e=>{console.error('UI_FAILURE',JSON.stringify({url:page.url(),alerts:await page.getByRole('alert').allTextContents(),errors}));throw e;});await page.getByRole('link',{name:'Ver carrinho',exact:true}).click();await page.getByRole('heading',{name:'Seu carrinho',exact:true}).waitFor();
          const form=page.getByRole('form',{name:'Calcular frete'});await form.getByLabel('CEP',{exact:true}).fill('01001000');await form.getByLabel('Rua',{exact:true}).fill('Rua TESTE');await form.getByLabel('Número',{exact:true}).fill('1');await form.getByLabel('Cidade',{exact:true}).fill('São Paulo');await form.getByLabel('UF',{exact:true}).fill('SP');await form.getByRole('button',{name:'Calcular frete'}).click();await page.getByText('Centro TESTE:').waitFor();
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);await page.screenshot({path:`/app/artifacts/phase2-store-${viewport.width}.png`,fullPage:true});report.visual.push({viewport,pages:['catálogo','busca','produto','carrinho/frete'],result:'passed',screenshot:`artifacts/phase2-store-${viewport.width}.png`});
          await context.addCookies([{name:a.actor.cookie.split('=')[0],value:a.actor.cookie.split('=')[1],domain:'web',path:'/'}]);await page.goto(`${base}/painel/${A}`);await page.getByRole('heading',{name:'Cadastrar produto simples',exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);await page.screenshot({path:`/app/artifacts/phase2-admin-${viewport.width}.png`,fullPage:true});
          await page.goto(`${base}/preview/${A}`);await page.getByRole('heading',{name:'SEGREDO RASCUNHO TESTE',exact:true}).waitFor();assert.match(await page.locator('meta[name=robots]').getAttribute('content'),/noindex/);assert.equal(errors.length,0,errors.join('\n'));
        }finally{await context.close();}
      }
    });
    report.passed=failures===0;report.stores=stores.map(s=>({tenantId:s.id,slug:s.slug,canonical:s.published.canonical}));report.completedAt=new Date().toISOString();
    const restoreFixtures=[];for(const s of stores){const counts=await withTenant(database,s.id,null,async tx=>(await rows(tx,sql`select (select count(*)::integer from shop.carts) as carts,(select count(*)::integer from shop.cart_items) as items,(select count(*)::integer from shop.shipping_quotes) as quotes`))[0]);restoreFixtures.push({tenantId:s.id,userId:s.actor.id,productId:s.simple.id,variantId:s.simple.variant_id,published:s.published.id,counts});}
    writeFileSync('/app/artifacts/phase2-fixture.json',JSON.stringify(restoreFixtures,null,2));
  }finally{await queue.resume();await queue.close();await browser.close();await database.pool.end();writeFileSync('/app/artifacts/storefront.json',JSON.stringify(report,null,2));}
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import { createDatabase,rows,sql,withTenant } from '@ecommerce/database';
import { getObject } from '@ecommerce/media';
assert.equal(process.env.APP_ENV,'test');
test('Restore preserva catálogo/estoque/tema/carrinhos e objetos S3 locais existentes',async()=>{
 const url=new URL(process.env.DATABASE_URL);url.pathname='/ecommerce_restore';const db=createDatabase(url.toString(),1),fixtures=JSON.parse(readFileSync('/app/artifacts/phase2-fixture.json','utf8'));
 try{for(const f of fixtures)await withTenant(db,f.tenantId,f.userId,async tx=>{
   const [product]=await rows(tx,sql`select name,status from shop.products where id=${f.productId}`);assert.equal(product.status,'ACTIVE');
   const [variant]=await rows(tx,sql`select id from shop.product_variants where id=${f.variantId}`);assert.equal(variant.id,f.variantId);
   const [balance]=await rows(tx,sql`select on_hand,reserved from shop.inventory_items where variant_id=${f.variantId}`);assert.deepEqual(balance,{on_hand:10,reserved:0});
   const [counts]=await rows(tx,sql`select (select count(*)::integer from shop.carts) as carts,(select count(*)::integer from shop.cart_items) as items,(select count(*)::integer from shop.shipping_quotes) as quotes`);assert.deepEqual(counts,f.counts);
   const [theme]=await rows(tx,sql`select published_revision_id from shop.storefronts`);assert.equal(theme.published_revision_id,f.published);
   for(const other of fixtures.filter(o=>o.tenantId!==f.tenantId))assert.equal((await rows(tx,sql`select id from shop.products where tenant_id=${other.tenantId}`)).length,0);
   const media=await rows(tx,sql`select renditions from shop.media_assets where status='READY'`);for(const asset of media)for(const rendition of asset.renditions)assert.equal((await getObject(rendition.key)).length,rendition.bytes);
 });writeFileSync('/app/artifacts/storefront-restore.json',JSON.stringify({passed:true,completedAt:new Date().toISOString(),tenants:fixtures.length,checks:['catálogo','estoque sem reserva','publicação imutável','carrinhos/itens/cotações','RLS','referências S3 existentes'],limitation:'Este teste restaura PostgreSQL; não é restauração externa do bucket. O volume S3 local permanece intacto.'},null,2));}finally{await db.pool.end();}
});

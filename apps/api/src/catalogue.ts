import { BadRequestException, Body, ConflictException, Controller, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Queue } from 'bullmq';
import { createHash } from 'node:crypto';
import { newId, rows, sql, type Transaction } from '@ecommerce/database';
import { MAX_DERIVED, MAX_INPUT, validateImage, putObject } from '@ecommerce/media';
import { assertQuota, entitlements } from '@ecommerce/purchase';
import { AccessModule, SessionGuard, type Actor, type AuthRequest } from './access.js';
import { StoresModule, StoresService } from './stores.js';
import { Infrastructure } from './infrastructure.js';
export function object(value:unknown):Record<string,unknown> {if(!value || typeof value!=='object' || Array.isArray(value))throw new BadRequestException('Objeto inválido.');return value as Record<string,unknown>;}
export function text(value:unknown,max=200,empty=false):string {if(typeof value!=='string' || (!empty&&!value.trim()) || value.length>max || /[<>\u0000-\u0008]/.test(value))throw new BadRequestException('Texto inválido (sem HTML).');return value.trim();}
export function id(value:unknown):string {const v=text(value,36);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v))throw new BadRequestException('ID inválido.');return v;}
export function integer(value:unknown,min=0,max=1_000_000):number {if(typeof value!=='number'||!Number.isInteger(value)||value<min||value>max)throw new BadRequestException('Inteiro inválido.');return value;}
export function cents(value:unknown):string {if(typeof value!=='string'||! /^(0|[1-9][0-9]{0,14})$/.test(value))throw new BadRequestException('Preço deve ser string inteira em centavos.');return value;}
export function slug(value:unknown):string {const v=text(value,100);if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v))throw new BadRequestException('Slug inválido.');return v;}
export async function invalidate(tx:Transaction,tenantId:string,operation:string) {
  await tx.execute(sql`insert into shop.storefronts(id,tenant_id) values(${newId()},${tenantId}) on conflict(tenant_id) do nothing`);
  const [state]=await rows<{version:string}>(tx,sql`update shop.storefronts set version=version+1 where tenant_id=${tenantId} returning version::text`);
  await tx.execute(sql`insert into shop.storefront_events(id,tenant_id,version,operation) values(${newId()},${tenantId},${state.version},${operation})`);
}
export async function productRows(tx:Transaction,publicOnly=false,query='',category='',productSlug='') {
  const products=await rows<Record<string,unknown> & {id:string}>(tx,sql`select p.* from shop.products p where (${!publicOnly} or p.status='ACTIVE') and (${!category} or exists(select 1 from shop.categories c where c.id=p.category_id and c.slug=${category})) and (${!productSlug} or p.slug=${productSlug}) and (${!query} or p.search_document @@ websearch_to_tsquery('portuguese',shop.search_text(${query})) or exists(select 1 from shop.product_variants v where v.product_id=p.id and v.active and shop.search_text(v.sku) like '%'||shop.search_text(${query})||'%')) order by p.name,p.id limit 100`);
  for(const product of products) {
    product.variants=await rows(tx,sql`select v.id,v.sku,coalesce((select jsonb_object_agg(o.name,ov.value) from shop.variant_values vv join shop.product_options o on (o.tenant_id,o.id)=(vv.tenant_id,vv.option_id) join shop.option_values ov on (ov.tenant_id,ov.id)=(vv.tenant_id,vv.value_id) where vv.variant_id=v.id),'{}'::jsonb) as attributes,v.is_default,v.active,v.price_cents::text,v.weight_g,v.width_mm,v.height_mm,v.length_mm,coalesce((select sum(i.on_hand-i.reserved) from shop.inventory_items i where i.variant_id=v.id),0)::integer as available from shop.product_variants v where v.product_id=${product.id} and (${!publicOnly} or v.active) order by v.sku`);
    product.media=await rows(tx,sql`select a.id,a.renditions from shop.product_media m join shop.media_assets a on (a.tenant_id,a.id)=(m.tenant_id,m.asset_id) where m.product_id=${product.id} and a.status='READY' order by m.id`);
  }
  return products;
}
@Injectable()
export class CatalogueService {
  readonly mediaQueue:Queue;
  private validating=0;
  constructor(readonly stores:StoresService,readonly infra:Infrastructure) {
    const redis=new URL(process.env.REDIS_URL!);this.mediaQueue=new Queue('media',{connection:{host:redis.hostname,port:Number(redis.port||6379),maxRetriesPerRequest:1}});
  }
  async onModuleDestroy(){await this.mediaQueue.close();}
  read(tenantId:string,actor:Actor) {return this.stores.run(id(tenantId),actor,async tx=>({products:await productRows(tx),categories:await rows(tx,sql`select * from shop.categories`),locations:await rows(tx,sql`select * from shop.inventory_locations`),inventory:await rows(tx,sql`select * from shop.inventory_items`),movements:await rows(tx,sql`select * from shop.inventory_movements order by created_at desc limit 100`),media:await rows(tx,sql`select id,status,stored_bytes::text,renditions from shop.media_assets order by created_at desc limit 100`)}));}
  category(tenantId:string,actor:Actor,input:unknown) {const b=object(input),name=text(b.name),s=slug(b.slug);return this.stores.run(id(tenantId),actor,async tx=>{const categoryId=newId();await tx.execute(sql`insert into shop.categories(id,tenant_id,name,slug) values(${categoryId},${tenantId},${name},${s})`);await invalidate(tx,tenantId,'category');return {id:categoryId};});}
  create(tenantId:string,actor:Actor,input:unknown) {
    const b=object(input),name=text(b.name),s=slug(b.slug),description=text(b.description??'',8000,true),price=cents(b.price_cents),sku=text(b.sku,80),category=b.category_id?id(b.category_id):null;
    return this.stores.run(id(tenantId),actor,async tx=>{
      // Which field collided, when it can be known before inserting (the unique constraints still decide races).
      if((await rows(tx,sql`select 1 from shop.product_slugs where slug=${s}`)).length)throw new ConflictException('Endereço já usado por outro produto desta loja.');
      if((await rows(tx,sql`select 1 from shop.product_variants where sku=${sku}`)).length)throw new ConflictException('SKU já usado por outra variação desta loja.');
      const productId=newId(),variantId=newId();await tx.execute(sql`insert into shop.products(id,tenant_id,category_id,name,slug,description) values(${productId},${tenantId},${category},${name},${s},${description})`);
      await tx.execute(sql`insert into shop.product_slugs(id,tenant_id,product_id,slug) values(${newId()},${tenantId},${productId},${s})`);
      await tx.execute(sql`insert into shop.product_variants(id,tenant_id,product_id,sku,price_cents,is_default,combination_key) values(${variantId},${tenantId},${productId},${sku},${price},true,'default')`);
      await invalidate(tx,tenantId,'product-created');return {id:productId,variant_id:variantId};
    });
  }
  update(tenantId:string,actor:Actor,productId:string,input:unknown) {
    const b=object(input);if(b.status&&!['DRAFT','ACTIVE','ARCHIVED'].includes(String(b.status)))throw new BadRequestException('Status inválido.');
    const name=b.name===undefined?null:text(b.name),s=b.slug===undefined?null:slug(b.slug),description=b.description===undefined?null:text(b.description,8000,true),category=b.category_id===undefined?undefined:b.category_id===null?null:id(b.category_id);
    return this.stores.run(id(tenantId),actor,async tx=>{
      const [existing]=await rows<{category_id:string|null;status:string}>(tx,sql`select category_id,status from shop.products where id=${id(productId)} for update`);if(!existing)throw new NotFoundException();
      // Plan quotas apply when a product starts counting as active (seção 16.3).
      if(b.status==='ACTIVE'&&existing.status!=='ACTIVE'){await assertQuota(tx,'active_products',1);const [v]=await rows<{n:number}>(tx,sql`select count(*)::int as n from shop.product_variants where product_id=${productId} and active`);await assertQuota(tx,'active_variants',v!.n);}
      if(s) {
        await tx.execute(sql`insert into shop.product_slugs(id,tenant_id,product_id,slug) values(${newId()},${tenantId},${productId},${s}) on conflict(tenant_id,slug) do nothing`);
        const [history]=await rows<{product_id:string}>(tx,sql`select product_id from shop.product_slugs where slug=${s}`);
        if(history.product_id!==productId)throw new ConflictException('Slug reservado no histórico de outro produto.');
      }
      const [result]=await rows(tx,sql`update shop.products set name=coalesce(${name},name),slug=coalesce(${s},slug),description=coalesce(${description},description),status=coalesce(${b.status??null},status),category_id=${category===undefined?existing.category_id:category},updated_at=now() where id=${productId} returning id`);
      await invalidate(tx,tenantId,'product-updated');return result;
    });
  }
  variant(tenantId:string,actor:Actor,productId:string,input:unknown) {
    const b=object(input),attrs=object(b.attributes);if(Object.keys(attrs).length<1||Object.keys(attrs).length>5)throw new BadRequestException('Defina 1 a 5 atributos.');
    const attributes=Object.fromEntries(Object.keys(attrs).sort().map(k=>[text(k,40),text(attrs[k],80)])),key=JSON.stringify(attributes),price=cents(b.price_cents),sku=text(b.sku,80);
    return this.stores.run(id(tenantId),actor,async tx=>{
      const [product]=await rows<{status:string;default_active:boolean}>(tx,sql`select status,exists(select 1 from shop.product_variants v where v.product_id=p.id and v.is_default and v.active) as default_active from shop.products p where id=${id(productId)} for update`);if(!product)throw new NotFoundException();
      if(product.status==='ACTIVE')await assertQuota(tx,'active_variants',product.default_active?0:1);
      await tx.execute(sql`update shop.product_variants set active=false where product_id=${productId} and is_default`);
      const variantId=newId();await tx.execute(sql`insert into shop.product_variants(id,tenant_id,product_id,sku,combination_key,price_cents,weight_g,width_mm,height_mm,length_mm) values(${variantId},${tenantId},${productId},${sku},${key},${price},${integer(b.weight_g??0)},${integer(b.width_mm??0)},${integer(b.height_mm??0)},${integer(b.length_mm??0)})`);
      for(const [name,value] of Object.entries(attributes)){
        await tx.execute(sql`insert into shop.product_options(id,tenant_id,product_id,name) values(${newId()},${tenantId},${productId},${name}) on conflict(tenant_id,product_id,name) do nothing`);
        const [option]=await rows<{id:string}>(tx,sql`select id from shop.product_options where product_id=${productId} and name=${name}`);
        await tx.execute(sql`insert into shop.option_values(id,tenant_id,product_id,option_id,value) values(${newId()},${tenantId},${productId},${option.id},${value}) on conflict(tenant_id,option_id,value) do nothing`);
        const [optionValue]=await rows<{id:string}>(tx,sql`select id from shop.option_values where option_id=${option.id} and value=${value}`);
        await tx.execute(sql`insert into shop.variant_values(id,tenant_id,product_id,variant_id,option_id,value_id) values(${newId()},${tenantId},${productId},${variantId},${option.id},${optionValue.id})`);
      }
      await invalidate(tx,tenantId,'variant-created');return {id:variantId};
    });
  }
  price(tenantId:string,actor:Actor,variantId:string,input:unknown) {const b=object(input),price=cents(b.price_cents);return this.stores.run(id(tenantId),actor,async tx=>{const result=await rows(tx,sql`update shop.product_variants set price_cents=${price},weight_g=coalesce(${b.weight_g===undefined?null:integer(b.weight_g)},weight_g),width_mm=coalesce(${b.width_mm===undefined?null:integer(b.width_mm)},width_mm),height_mm=coalesce(${b.height_mm===undefined?null:integer(b.height_mm)},height_mm),length_mm=coalesce(${b.length_mm===undefined?null:integer(b.length_mm)},length_mm) where id=${id(variantId)} returning id`);if(!result.length)throw new NotFoundException();await invalidate(tx,tenantId,'variant-updated');return result[0];});}
  location(tenantId:string,actor:Actor,input:unknown) {const name=text(object(input).name,100);return this.stores.run(id(tenantId),actor,async tx=>{const locationId=newId();await tx.execute(sql`insert into shop.inventory_locations(id,tenant_id,name) values(${locationId},${tenantId},${name})`);return {id:locationId};});}
  adjust(tenantId:string,actor:Actor,input:unknown) {
    const b=object(input),variant=id(b.variant_id),location=id(b.location_id),delta=integer(b.delta,-1_000_000),reason=text(b.reason,500);
    return this.stores.run(id(tenantId),actor,async(tx,member)=>{
      await tx.execute(sql`insert into shop.inventory_items(id,tenant_id,variant_id,location_id) values(${newId()},${tenantId},${variant},${location}) on conflict(tenant_id,variant_id,location_id) do nothing`);
      const [item]=await rows<{id:string;on_hand:number;reserved:number}>(tx,sql`select * from shop.inventory_items where variant_id=${variant} and location_id=${location} for update`);
      const balance=item.on_hand+delta;if(balance<item.reserved)throw new ConflictException('Saldo insuficiente.');
      await tx.execute(sql`update shop.inventory_items set on_hand=${balance} where id=${item.id}`);
      await tx.execute(sql`insert into shop.inventory_movements(id,tenant_id,item_id,actor_membership_id,delta,balance,reason) values(${newId()},${tenantId},${item.id},${member.id},${delta},${balance},${reason})`);
      await invalidate(tx,tenantId,'inventory-adjusted');return {balance};
    });
  }
  async upload(tenantId:string,actor:Actor,body:Buffer) {
    if(process.env.UPLOADS_DISABLED==='true')throw new ConflictException('Uploads temporariamente bloqueados.');
    if(!Buffer.isBuffer(body)||body.length>MAX_INPUT)throw new BadRequestException('Imagem inválida.');
    await this.stores.run(id(tenantId),actor,async()=>undefined);
    if(this.validating>=2)throw new ConflictException('Processamento de admissão ocupado; tente novamente.');
    this.validating++;
    try{await validateImage(body);}catch{throw new BadRequestException('Somente JPEG/PNG/WebP estático válido, até 10 MB e 40 MP.');}finally{this.validating--;}
    const assetId=newId(),key=`tenant/${id(tenantId)}/temporary/${assetId}`,hash=createHash('sha256').update(body).digest('hex');
    await this.stores.run(tenantId,actor,async(tx,member)=>{
      await tx.execute(sql`select id from shop.tenants where id=${tenantId} for update`);
      const [usage]=await rows<{bytes:string;pending:string}>(tx,sql`select coalesce(sum(stored_bytes),0)::text as bytes,count(*) filter(where status in ('UPLOADING','PENDING'))::text as pending from shop.media_assets`);
      await tx.execute(sql`insert into shop.media_usage(id,tenant_id) values(${newId()},${tenantId}) on conflict(tenant_id) do nothing`);
      const [accounting]=await rows<{stored_bytes:string}>(tx,sql`select stored_bytes::text from shop.media_usage`);
      const plan=await entitlements(tx),quota=BigInt(plan.media_bytes);
      if(Number(usage.pending)>=2)throw new ConflictException('No máximo dois uploads em andamento por loja.');
      if(plan.media_mode==='STRICT'){
        // Commercial plans: the original is stored now and the maximum derived size is reserved, atomically; stored+reserved never exceeds the quota.
        const reserve=BigInt(MAX_DERIVED);
        const [ok]=await rows(tx,sql`update shop.media_usage set reserved_bytes=reserved_bytes+${reserve.toString()}::bigint where tenant_id=${tenantId} and stored_bytes+reserved_bytes+${(reserve+BigInt(body.length)).toString()}::bigint<=${quota.toString()}::bigint returning id`);
        if(!ok)throw new ConflictException('Cota de mídia do plano esgotada; remova imagens ou ajuste o plano.');
        await tx.execute(sql`insert into shop.media_assets(id,tenant_id,actor_membership_id,status,original_key,content_hash,original_bytes,stored_bytes) values(${assetId},${tenantId},${member.id},'UPLOADING',${key},${hash},${body.length},${body.length})`);
        await tx.execute(sql`insert into shop.media_reservations(id,tenant_id,asset_id,bytes) values(${newId()},${tenantId},${assetId},${reserve.toString()})`);
      }else{
      // Pilot: limited tolerance (seção 7) — at most the uploads already admitted may exceed the quota.
      if(BigInt(usage.bytes)>=quota||BigInt(accounting.stored_bytes)>=quota)throw new ConflictException('Cota piloto excedida.');
      await tx.execute(sql`insert into shop.media_assets(id,tenant_id,actor_membership_id,status,original_key,content_hash,original_bytes,stored_bytes) values(${assetId},${tenantId},${member.id},'UPLOADING',${key},${hash},${body.length},${body.length})`);}
      await tx.execute(sql`update shop.media_usage set stored_bytes=stored_bytes+${body.length} where tenant_id=${tenantId}`);
    });
    try {
      await this.mediaQueue.add('reconcile',{tenantId},{jobId:`tenant-${tenantId}-maintenance`,repeat:{every:3600000},removeOnComplete:10});
      await putObject(key,body,'application/octet-stream');
      await this.stores.run(tenantId,actor,async tx=>{await tx.execute(sql`update shop.media_assets set status='PENDING',updated_at=now() where id=${assetId}`);});
      await this.mediaQueue.add('process',{tenantId,assetId},{jobId:`tenant-${tenantId}-${assetId}`,attempts:3,backoff:{type:'exponential',delay:1000},removeOnComplete:100,removeOnFail:100});
      return {id:assetId,status:'PENDING'};
    }catch{throw new ConflictException('Upload não concluído; temporário será reconciliado.');}
  }
  async maintenance(tenantId:string,actor:Actor){await this.stores.run(id(tenantId),actor,async()=>undefined);await this.mediaQueue.add('reconcile',{tenantId},{jobId:`tenant-${tenantId}-manual-${newId()}`,removeOnComplete:10});return {queued:true};}
  link(tenantId:string,actor:Actor,productId:string,input:unknown) {const assetId=id(object(input).asset_id);return this.stores.run(id(tenantId),actor,async tx=>{
    if(!(await rows(tx,sql`select id from shop.products where id=${id(productId)} for update`)).length)throw new NotFoundException();
    const count=await rows<{count:string}>(tx,sql`select count(*)::text from shop.product_media where product_id=${productId}`);
    if(Number(count[0].count)>=10)throw new ConflictException('Máximo de 10 imagens.');
    if(!(await rows(tx,sql`select id from shop.media_assets where id=${assetId} and status='READY'`)).length)throw new BadRequestException('Mídia não disponível.');
    await tx.execute(sql`insert into shop.product_media(id,tenant_id,product_id,asset_id) values(${newId()},${tenantId},${productId},${assetId})`);await invalidate(tx,tenantId,'media-linked');return {linked:true};
  });}
}
@Controller('tenants/:tenantId/catalogue')
@UseGuards(SessionGuard)
class CatalogueController {
  constructor(private readonly service:CatalogueService){}
  @Get() read(@Param('tenantId') t:string,@Req() r:AuthRequest){return this.service.read(t,r.actor);}
  @Post('categories') category(@Param('tenantId') t:string,@Req() r:AuthRequest,@Body() b:unknown){return this.service.category(t,r.actor,b);}
  @Post('products') product(@Param('tenantId') t:string,@Req() r:AuthRequest,@Body() b:unknown){return this.service.create(t,r.actor,b);}
  @Patch('products/:id') update(@Param('tenantId') t:string,@Param('id') p:string,@Req() r:AuthRequest,@Body() b:unknown){return this.service.update(t,r.actor,p,b);}
  @Post('products/:id/variants') variant(@Param('tenantId') t:string,@Param('id') p:string,@Req() r:AuthRequest,@Body() b:unknown){return this.service.variant(t,r.actor,p,b);}
  @Patch('variants/:id') price(@Param('tenantId') t:string,@Param('id') v:string,@Req() r:AuthRequest,@Body() b:unknown){return this.service.price(t,r.actor,v,b);}
  @Post('locations') location(@Param('tenantId') t:string,@Req() r:AuthRequest,@Body() b:unknown){return this.service.location(t,r.actor,b);}
  @Post('adjustments') adjustment(@Param('tenantId') t:string,@Req() r:AuthRequest,@Body() b:unknown){return this.service.adjust(t,r.actor,b);}
  @Post('media/maintenance') maintenance(@Param('tenantId') t:string,@Req() r:AuthRequest){return this.service.maintenance(t,r.actor);}
  @Post('media') upload(@Param('tenantId') t:string,@Req() r:AuthRequest,@Body() b:Buffer){return this.service.upload(t,r.actor,b);}
  @Post('products/:id/media') link(@Param('tenantId') t:string,@Param('id') p:string,@Req() r:AuthRequest,@Body() b:unknown){return this.service.link(t,r.actor,p,b);}
}
@Module({imports:[StoresModule,AccessModule],providers:[CatalogueService],controllers:[CatalogueController],exports:[CatalogueService]})
export class CatalogueModule{}

import { BadRequestException, Body, ConflictException, Controller, Get, Injectable, Module, NotFoundException, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { newId, rows, sql, withTenant, type Transaction } from '@ecommerce/database';
import { getObject } from '@ecommerce/media';
import { AccessModule, SessionGuard, type Actor, type AuthRequest } from './access.js';
import { StoresModule, StoresService } from './stores.js';
import { Infrastructure } from './infrastructure.js';
import { cents, id, integer, invalidate, object, productRows, slug, text } from './catalogue.js';
import { normalize, validateV2, type ThemeV2 } from './theme.js';
type Theme={schema_version:1;title:string;description:string;color:string;font:string;hero:string;pages:{slug:string;title:string;body:string}[];menu:{label:string;path:string}[];assets:string[];supplier?:Record<string,unknown>};
function theme(value:unknown):Theme {
  const b=object(value);if(b.schema_version!==1)throw new BadRequestException('schema_version deve ser 1.');
  const color=text(b.color??'#245742',7);if(!/^#[0-9a-f]{6}$/i.test(color))throw new BadRequestException('Cor inválida.');
  const font=text(b.font??'system',20);if(!['system','serif'].includes(font))throw new BadRequestException('Fonte inválida.');
  if(!Array.isArray(b.pages)||b.pages.length>10||!Array.isArray(b.menu)||b.menu.length>10||!Array.isArray(b.assets)||b.assets.length>5)throw new BadRequestException('Conteúdo do tema inválido.');
  const pages=b.pages.map(p=>{const page=object(p);return {slug:slug(page.slug),title:text(page.title,100),body:text(page.body,8000)};});
  if(new Set(pages.map(p=>p.slug)).size!==pages.length)throw new BadRequestException('Página repetida.');
  const allowed=['/','/carrinho',...pages.map(p=>`/paginas/${p.slug}`)];
  const menu=b.menu.map(m=>{const link=object(m),path=text(link.path,150);if(!allowed.includes(path))throw new BadRequestException('Menu deve apontar para página interna existente.');return {label:text(link.label,60),path};});
  return {schema_version:1,title:text(b.title,100),description:text(b.description,300),color,font,hero:text(b.hero??'',1000,true),pages,menu,assets:b.assets.map(id)};
}
function profile(value:unknown) {
  const b=object(value),synthetic=b.synthetic===true;
  if(synthetic&&!['development','test'].includes(process.env.APP_ENV||''))throw new BadRequestException('Perfil sintético apenas local.');
  const result={synthetic,name:text(b.name,150),document:text(b.document??'',30,true),address:text(b.address,300),email:text(b.email,150),phone:text(b.phone,50),policies:text(b.policies,8000),delivery:text(b.delivery,1000),risks:text(b.risks??'Veja características e cuidados na descrição de cada produto.',1000)};
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)||(!synthetic&&!/^[0-9]{11}(?:[0-9]{3})?$/.test(result.document)))throw new BadRequestException('Fornecedor precisa de contato e documento aplicável.');
  if(synthetic&&!/TESTE/i.test(result.name))throw new BadRequestException('Fornecedor sintético deve ser identificado TESTE.');return result;
}
export type Route={tenant_id:string;canonical:string;slug:string};
export type PublicData={route:Route;theme:ThemeV2;products:Record<string,unknown>[];categories:unknown[];version:string;noindex:boolean};
// Conteúdo salvo: v1 (legado, validado por theme()) ou v2 (validateV2). Devolve o conteúdo e a versão a gravar.
function checkedContent(value:unknown):{content:Theme|ThemeV2;version:1|2;assets:string[]}{const b=object(value);if(b.schema_version===2){const t=validateV2(b);return {content:t,version:2,assets:t.assets};}const t=theme(b);return {content:t,version:1,assets:t.assets};}
const withoutSupplier=(c:Record<string,unknown>)=>{const {supplier:_s,...rest}=c;return rest;};
@Injectable()
export class StorefrontService {
  private readonly cache=new Map<string,{until:number;data:PublicData}>();
  constructor(readonly stores:StoresService,readonly infra:Infrastructure){}
  settings(tenantId:string,actor:Actor){return this.stores.run(id(tenantId),actor,async tx=>{
    const [state]=await rows<{draft_revision_id:string|null;published_revision_id:string|null}>(tx,sql`select * from shop.storefronts`);
    const revisions=await rows<{id:string;content:Record<string,unknown>;created_at:string}>(tx,sql`select id,content,created_at from shop.theme_revisions order by created_at desc limit 20`);
    const draft=state?.draft_revision_id?(await rows<{content:unknown}>(tx,sql`select content from shop.theme_revisions where id=${state.draft_revision_id}`))[0]:undefined;
    // Histórico mínimo de publicações (revisões com o fornecedor congelado), da mais recente para a mais antiga.
    const history=(await rows<{id:string;content:Record<string,unknown>;created_at:string}>(tx,sql`select id,content,created_at from shop.theme_revisions where content ? 'supplier' order by created_at desc limit 10`)).map(r=>{const t=normalize(r.content);return {id:r.id,created_at:r.created_at,title:t.title,preset:t.preset,current:r.id===state?.published_revision_id};});
    return {profile:(await rows(tx,sql`select profile from shop.merchant_profiles`))[0],state,revisions,draft_theme:draft?withoutSupplier(normalize(draft.content) as unknown as Record<string,unknown>):null,history,categories:await rows(tx,sql`select id,name,slug from shop.categories order by name`),shipping:await rows(tx,sql`select *,price_cents::text from shop.shipping_rules order by priority desc,id`)};
  });}
  supplier(tenantId:string,actor:Actor,input:unknown){const p=profile(input);return this.stores.run(id(tenantId),actor,async tx=>{await tx.execute(sql`insert into shop.merchant_profiles(id,tenant_id,profile) values(${newId()},${tenantId},${JSON.stringify(p)}::jsonb) on conflict(tenant_id) do update set profile=excluded.profile,updated_at=now()`);return p;},true);}
  // Rascunho. Com base_revision_id (editor), recusa salvar se outra sessão gravou um rascunho depois (409): nada é sobrescrito
  // em silêncio. Sem ele (clientes antigos), mantém o comportamento anterior.
  draft(tenantId:string,actor:Actor,input:unknown){const body=object(input),base=body.base_revision_id===undefined||body.base_revision_id===null?undefined:id(body.base_revision_id);const {base_revision_id:_b,...rest}=body;const {content,version,assets}=checkedContent(rest);return this.stores.run(id(tenantId),actor,async tx=>{
    const [state]=await rows<{draft_revision_id:string|null}>(tx,sql`select draft_revision_id from shop.storefronts for update`);
    if(base!==undefined&&(state?.draft_revision_id??null)!==base)throw new ConflictException('Outra sessão salvou este rascunho depois que você abriu o editor. Recarregue para ver a versão mais recente; suas alterações não foram gravadas.');
    return this.saveDraft(tx,tenantId,content,version,assets);
  },true);}
  private async saveDraft(tx:Transaction,tenantId:string,content:unknown,version:number,assets:string[]){
    // Com RLS, imagem de outra loja (ou inexistente) não aparece aqui: recusa com motivo claro antes da FK composta.
    for(const asset of assets)if(!(await rows(tx,sql`select id from shop.media_assets where id=${asset}`)).length)throw new BadRequestException('Uma imagem do tema não existe nesta loja. Escolha outra imagem.');
    const revisionId=newId();await tx.execute(sql`insert into shop.theme_revisions(id,tenant_id,schema_version,content) values(${revisionId},${tenantId},${version},${JSON.stringify(content)}::jsonb)`);
    for(const asset of assets)await tx.execute(sql`insert into shop.theme_media(id,tenant_id,revision_id,asset_id) values(${newId()},${tenantId},${revisionId},${asset})`);
    await tx.execute(sql`insert into shop.storefronts(id,tenant_id,draft_revision_id) values(${newId()},${tenantId},${revisionId}) on conflict(tenant_id) do update set draft_revision_id=excluded.draft_revision_id`);return {id:revisionId};
  }
  // Traz a versão publicada (ou outra publicação do histórico) de volta para o rascunho, como nova revisão.
  restoreDraft(tenantId:string,actor:Actor,input:unknown){const b=object(input),from=b.revision_id?id(b.revision_id):null,base=b.base_revision_id===undefined||b.base_revision_id===null?undefined:id(b.base_revision_id);return this.stores.run(id(tenantId),actor,async tx=>{
    const [state]=await rows<{draft_revision_id:string|null;published_revision_id:string|null}>(tx,sql`select draft_revision_id,published_revision_id from shop.storefronts for update`);
    if(base!==undefined&&(state?.draft_revision_id??null)!==base)throw new ConflictException('Outra sessão salvou este rascunho depois que você abriu o editor. Recarregue antes de restaurar.');
    const source=from??state?.published_revision_id;if(!source)throw new ConflictException('A loja ainda não tem versão publicada para restaurar.');
    const [revision]=await rows<{content:Record<string,unknown>}>(tx,sql`select content from shop.theme_revisions where id=${source} and content ? 'supplier'`);if(!revision)throw new NotFoundException('Publicação não encontrada.');
    const {content,version,assets}=checkedContent(withoutSupplier(revision.content));return this.saveDraft(tx,tenantId,content,version,assets);
  },true);}
  async publish(tenantId:string,actor:Actor,input:unknown) {
    const revisionId=id(object(input).revision_id);
    const assets=await this.stores.run(id(tenantId),actor,tx=>rows<{status:string;renditions:{key:string}[]}>(tx,sql`select a.status,a.renditions from shop.theme_media m join shop.media_assets a on (a.tenant_id,a.id)=(m.tenant_id,m.asset_id) where m.revision_id=${revisionId}`),true);
    for(const asset of assets){if(asset.status!=='READY')throw new ConflictException('Mídia ainda não pronta.');try{await getObject(asset.renditions[0].key);}catch{throw new ConflictException('Storage indisponível; publicação anterior preservada.');}}
    return this.stores.run(id(tenantId),actor,async tx=>{
    const [state]=await rows<{draft_revision_id:string}>(tx,sql`select * from shop.storefronts for update`);if(!state || state.draft_revision_id!==revisionId)throw new ConflictException('Rascunho mudou; recarregue antes de publicar.');
    const [revision]=await rows<{content:Theme}>(tx,sql`select content from shop.theme_revisions where id=${revisionId}`);if(!revision)throw new NotFoundException();
    const [supplier]=await rows<{profile:Record<string,unknown>}>(tx,sql`select profile from shop.merchant_profiles`);if(!supplier)throw new ConflictException('Complete o perfil do fornecedor.');
    const checked=checkedContent(withoutSupplier(revision.content as unknown as Record<string,unknown>)),validated=profile(supplier.profile);
    for(const asset of checked.assets)if(!(await rows(tx,sql`select id from shop.media_assets where id=${asset} and status='READY'`)).length)throw new ConflictException('Mídia ainda não pronta.');
    const publicationId=newId(),content={...checked.content,supplier:validated};
    await tx.execute(sql`insert into shop.theme_revisions(id,tenant_id,schema_version,content) values(${publicationId},${tenantId},${checked.version},${JSON.stringify(content)}::jsonb)`);
    for(const asset of checked.assets)await tx.execute(sql`insert into shop.theme_media(id,tenant_id,revision_id,asset_id) values(${newId()},${tenantId},${publicationId},${asset})`);
    const [tenant]=await rows<{slug:string;lifecycle_status:string}>(tx,sql`select slug,lifecycle_status from shop.tenants where id=${tenantId} for update`);
        if(tenant.lifecycle_status==='SUSPENDED')throw new ConflictException('Publicação não reativa loja suspensa.');
    const origin=new URL(process.env.PUBLIC_ORIGIN!),local=['development','test'].includes(process.env.APP_ENV||'');
    if(!local)throw new ConflictException('Domínio da plataforma não homologado; publicação real bloqueada.');
    const hostname=`${tenant.slug}.localhost`,[custom]=await rows<{hostname:string}>(tx,sql`select hostname from shop.custom_domains where canonical and status='ACTIVE'`);
    // An explicit canonical custom domain survives republishing; otherwise the managed subdomain is canonical.
    const canonical=custom?`https://${custom.hostname}`:`http://${hostname}${origin.port?':'+origin.port:''}`;
    await tx.execute(sql`insert into shop.platform_routes(id,tenant_id,hostname,slug,canonical) values(${newId()},${tenantId},${hostname},${tenant.slug},${canonical}) on conflict(tenant_id) do update set canonical=excluded.canonical,hostname=excluded.hostname`);
    await tx.execute(sql`update shop.storefronts set published_revision_id=${publicationId} where tenant_id=${tenantId}`);
    await tx.execute(sql`update shop.tenants set lifecycle_status='ACTIVE',updated_at=now() where id=${tenantId}`);
    await invalidate(tx,tenantId,'published');return {id:publicationId,canonical};
  },true);}
  // Reverte a publicação: republica uma publicação anterior do histórico (com o fornecedor atual). Recusa se a publicação atual
  // mudou desde que a tela foi aberta (expected_published_id), para não desfazer em silêncio o trabalho de outra sessão.
  rollback(tenantId:string,actor:Actor,input:unknown){const b=object(input),target=id(b.revision_id),expected=id(b.expected_published_id);return this.stores.run(id(tenantId),actor,async tx=>{
    const [state]=await rows<{published_revision_id:string|null}>(tx,sql`select published_revision_id from shop.storefronts for update`);
    if(state?.published_revision_id!==expected)throw new ConflictException('A publicação mudou desde que você abriu o histórico. Recarregue antes de reverter.');
    if(target===expected)throw new ConflictException('Esta já é a versão publicada.');
    const [revision]=await rows<{content:Record<string,unknown>}>(tx,sql`select content from shop.theme_revisions where id=${target} and content ? 'supplier'`);if(!revision)throw new NotFoundException('Publicação não encontrada no histórico.');
    const [supplier]=await rows<{profile:Record<string,unknown>}>(tx,sql`select profile from shop.merchant_profiles`);if(!supplier)throw new ConflictException('Complete os dados da loja.');
    const [tenant]=await rows<{lifecycle_status:string}>(tx,sql`select lifecycle_status from shop.tenants where id=${tenantId}`);if(tenant?.lifecycle_status==='SUSPENDED')throw new ConflictException('Loja suspensa: a publicação não pode ser alterada.');
    const checked=checkedContent(withoutSupplier(revision.content)),publicationId=newId(),content={...checked.content,supplier:profile(supplier.profile)};
    for(const asset of checked.assets)if(!(await rows(tx,sql`select id from shop.media_assets where id=${asset} and status='READY'`)).length)throw new ConflictException('Uma imagem desta versão não está mais disponível.');
    await tx.execute(sql`insert into shop.theme_revisions(id,tenant_id,schema_version,content) values(${publicationId},${tenantId},${checked.version},${JSON.stringify(content)}::jsonb)`);
    for(const asset of checked.assets)await tx.execute(sql`insert into shop.theme_media(id,tenant_id,revision_id,asset_id) values(${newId()},${tenantId},${publicationId},${asset})`);
    await tx.execute(sql`update shop.storefronts set published_revision_id=${publicationId} where tenant_id=${tenantId}`);
    await invalidate(tx,tenantId,'published');return {id:publicationId};
  },true);}
  shipping(tenantId:string,actor:Actor,input:unknown){const b=object(input),name=text(b.name,100),kind=text(b.kind,10),start=text(b.cep_start??'00000000',8),end=text(b.cep_end??'99999999',8),price=cents(b.price_cents),days=integer(b.days??0,0,365),priority=integer(b.priority??0,-10000,10000);if(!['PICKUP','TABLE'].includes(kind)||!/^\d{8}$/.test(start)||!/^\d{8}$/.test(end)||end<start)throw new BadRequestException('Regra de frete inválida.');return this.stores.run(id(tenantId),actor,async tx=>{
    const ruleId=b.id?id(b.id):newId();
    if(b.id){if(!(await rows(tx,sql`select id from shop.shipping_rules where id=${ruleId}`)).length)throw new NotFoundException();await tx.execute(sql`update shop.shipping_rules set name=${name},kind=${kind},cep_start=${start},cep_end=${end},price_cents=${price},days=${days},priority=${priority},active=${b.active!==false},version=version+1 where id=${ruleId}`);}
    else await tx.execute(sql`insert into shop.shipping_rules(id,tenant_id,name,kind,cep_start,cep_end,price_cents,days,priority) values(${ruleId},${tenantId},${name},${kind},${start},${end},${price},${days},${priority})`);
    await invalidate(tx,tenantId,'shipping-updated');return {id:ruleId};
  },true);}
  async resolve(value:string,byHost=false):Promise<Route> {
    const normalized=byHost?value.toLowerCase().split(':')[0]:slug(value);
    const result=await this.infra.shop.pool.query('select * from shop.resolve_store($1,$2)',[normalized,byHost]);
    if(!result.rows[0])throw new NotFoundException('Loja não publicada.');return result.rows[0];
  }
  async publicData(value:string,query='',category='',byHost=false):Promise<PublicData> {
    if(query.length>100)throw new BadRequestException('Busca longa.');const route=await this.resolve(value,byHost);
    return withTenant(this.infra.shop,route.tenant_id,null,async tx=>{
      const [state]=await rows<{version:string;published_revision_id:string;lifecycle_status:string}>(tx,sql`select s.version::text,s.published_revision_id,t.lifecycle_status from shop.storefronts s join shop.tenants t on t.tenant_id=s.tenant_id where s.tenant_id=${route.tenant_id}`);
      if(!state || state.lifecycle_status!=='ACTIVE'||!state.published_revision_id)throw new NotFoundException('Vitrine indisponível.');
      const key=`tenant:${route.tenant_id}:published:${state.published_revision_id}:${state.version}:${route.canonical}:${query}:${category}`;
      const cached=this.cache.get(key);if(cached&&cached.until>Date.now())return cached.data;
      const [revision]=await rows<{content:Theme}>(tx,sql`select content from shop.theme_revisions where id=${state.published_revision_id}`);
      const data={route,theme:normalize(revision.content),products:await productRows(tx,true,query,category),categories:await rows(tx,sql`select id,name,slug from shop.categories order by name`),version:state.version,noindex:process.env.APP_ENV!=='production'};
      if(this.cache.size>=200)this.cache.delete(this.cache.keys().next().value!);this.cache.set(key,{until:Date.now()+30000,data});return data;
    });
  }
  async product(value:string,productSlug:string){const data=await this.publicData(value);return withTenant(this.infra.shop,data.route.tenant_id,null,async tx=>{const [product]=await productRows(tx,true,'','',slug(productSlug));if(!product)throw new NotFoundException();return product;});}
  async sitemap(value:string){const data=await this.publicData(value);const products=await withTenant(this.infra.shop,data.route.tenant_id,null,tx=>rows<{slug:string}>(tx,sql`select slug from shop.products where status='ACTIVE' order by slug`));return {...data,products};}
  preview(tenantId:string,actor:Actor) {return this.stores.run(id(tenantId),actor,async tx=>{
    const [revision]=await rows<{content:Theme}>(tx,sql`select r.content from shop.theme_revisions r join shop.storefronts s on s.tenant_id=r.tenant_id and s.draft_revision_id=r.id`);if(!revision)throw new NotFoundException('Sem rascunho.');
    const [supplier]=await rows<{profile:Record<string,unknown>}>(tx,sql`select profile from shop.merchant_profiles`);
    // A prévia usa os produtos ativos (os mesmos que a loja publicada mostraria) e o fornecedor atual no rodapé.
    return {theme:{...normalize(withoutSupplier(revision.content as unknown as Record<string,unknown>)),...(supplier?{supplier:supplier.profile}:{})},products:await productRows(tx,true),categories:await rows(tx,sql`select id,name,slug from shop.categories order by name`),noindex:true,preview:true};
  });}
  async privateMedia(tenantId:string,actor:Actor,assetId:string,size:string) {
    const key=await this.stores.run(id(tenantId),actor,async tx=>{const [asset]=await rows<{renditions:{key:string}[]}>(tx,sql`select renditions from shop.media_assets where id=${id(assetId)} and status='READY'`);if(!asset)throw new NotFoundException();return asset.renditions[size==='small'?0:1]?.key;});
    if(!key)throw new NotFoundException();return getObject(key);
  }
  async oldSlug(value:string,old:string){const data=await this.publicData(value);return withTenant(this.infra.shop,data.route.tenant_id,null,async tx=>{const [product]=await rows<{slug:string}>(tx,sql`select p.slug from shop.product_slugs h join shop.products p on (p.tenant_id,p.id)=(h.tenant_id,h.product_id) where h.slug=${slug(old)} and p.status='ACTIVE'`);if(!product)throw new NotFoundException();return product;});}
  async media(value:string,assetId:string,size:string) {
    const {route}=await this.publicData(value);return withTenant(this.infra.shop,route.tenant_id,null,async tx=>{
      const [asset]=await rows<{renditions:{key:string;width:number}[]}>(tx,sql`select a.renditions from shop.media_assets a where a.id=${id(assetId)} and a.status='READY' and (exists(select 1 from shop.product_media m join shop.products p on (p.tenant_id,p.id)=(m.tenant_id,m.product_id) where m.asset_id=a.id and p.status='ACTIVE') or exists(select 1 from shop.theme_media m join shop.storefronts s on (s.tenant_id,s.published_revision_id)=(m.tenant_id,m.revision_id) where m.asset_id=a.id))`);
      if(!asset)throw new NotFoundException();return asset.renditions[size==='small'?0:1]?.key;
    }).then(async key=>{if(!key)throw new NotFoundException();return getObject(key);});
  }
}
@Controller('tenants/:tenantId/storefront')
@UseGuards(SessionGuard)
class ThemeController {
  constructor(private readonly service:StorefrontService){}
  @Get() settings(@Param('tenantId') t:string,@Req() r:AuthRequest){return this.service.settings(t,r.actor);}
  @Post('profile') supplier(@Param('tenantId') t:string,@Req() r:AuthRequest,@Body() b:unknown){return this.service.supplier(t,r.actor,b);}
  @Post('draft') draft(@Param('tenantId') t:string,@Req() r:AuthRequest,@Body() b:unknown){return this.service.draft(t,r.actor,b);}
  @Post('draft/restore') restore(@Param('tenantId') t:string,@Req() r:AuthRequest,@Body() b:unknown){return this.service.restoreDraft(t,r.actor,b);}
  @Post('rollback') rollback(@Param('tenantId') t:string,@Req() r:AuthRequest,@Body() b:unknown){return this.service.rollback(t,r.actor,b);}
  @Post('publish') publish(@Param('tenantId') t:string,@Req() r:AuthRequest,@Body() b:unknown){return this.service.publish(t,r.actor,b);}
  @Post('shipping') shipping(@Param('tenantId') t:string,@Req() r:AuthRequest,@Body() b:unknown){return this.service.shipping(t,r.actor,b);}
  @Get('media/:id/:size') async privateMedia(@Param('tenantId') t:string,@Param('id') a:string,@Param('size') size:string,@Req() r:AuthRequest,@Res() reply:FastifyReply){const data=await this.service.privateMedia(t,r.actor,a,size);reply.type('image/webp').send(data);}
  @Get('preview') preview(@Param('tenantId') t:string,@Req() r:AuthRequest){return this.service.preview(t,r.actor);}
}
@Controller('public')
class PublicController {
  constructor(private readonly service:StorefrontService){}
  @Get('resolve') resolve(@Query('host') host:string){return this.service.resolve(host||'',true);}
  @Get('stores/:slug') read(@Param('slug') s:string,@Query('q') q='',@Query('category') c=''){return this.service.publicData(s,q,c);}
  @Get('stores/:slug/products/:product') product(@Param('slug') s:string,@Param('product') p:string){return this.service.product(s,p);}
  @Get('stores/:slug/sitemap') sitemap(@Param('slug') s:string){return this.service.sitemap(s);}
  @Get('stores/:slug/redirect/:old') old(@Param('slug') s:string,@Param('old') old:string){return this.service.oldSlug(s,old);}
  @Get('stores/:slug/media/:id/:size') async media(@Param('slug') s:string,@Param('id') a:string,@Param('size') size:string,@Res() reply:FastifyReply){const data=await this.service.media(s,a,size);reply.type('image/webp').header('X-Content-Type-Options','nosniff').send(data);}
}
@Module({imports:[StoresModule,AccessModule],providers:[StorefrontService],controllers:[ThemeController,PublicController],exports:[StorefrontService]})
export class StorefrontModule{}

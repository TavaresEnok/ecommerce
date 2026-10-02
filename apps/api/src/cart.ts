import { ServiceUnavailableException, BadRequestException, Body, ConflictException, Controller, Get, Injectable, Module, NotFoundException, Param, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { newId, rows, sql, withTenant, type Transaction } from '@ecommerce/database';
import { digest, randomToken } from './security.js';
import { Infrastructure } from './infrastructure.js';
import { StorefrontModule, StorefrontService, type Route } from './storefront.js';
import { id, integer, object, text } from './catalogue.js';
import { parcelFor, shippingProvider, simulationEnabled, type CarrierQuote, type SimulationSettings } from '@ecommerce/purchase';
type CartItem={variant_id:string;name:string;sku:string;attributes:Record<string,string>;quantity:number;price_cents:string;weight_g:number;width_mm:number;height_mm:number;length_mm:number;available:number;active:boolean;status:string};
@Injectable()
export class CartService {
  constructor(private readonly storefront:StorefrontService,private readonly infra:Infrastructure){}
  async route(slug:string,req:FastifyRequest) {
    const data=await this.storefront.publicData(slug);
    if(req.method!=='GET' && req.headers.origin!==process.env.PUBLIC_ORIGIN && req.headers.origin!==data.route.canonical)throw new BadRequestException('Origem inválida.');return data.route;
  }
  async run<T>(slug:string,req:FastifyRequest,reply:FastifyReply,action:(tx:Transaction,cart:{id:string;version:string},route:Route)=>Promise<T>) {
    const route=await this.route(slug,req),cookieName=`cart_${route.tenant_id.replaceAll('-','')}`;
    let token=req.cookies[cookieName];const created=!token || !/^[A-Za-z0-9_-]{40,100}$/.test(token);if(created)token=randomToken();
    const result=await withTenant(this.infra.shop,route.tenant_id,null,async tx=>{
      let [cart]=await rows<{id:string;version:string}>(tx,sql`select id,version::text from shop.carts where token_hash=${digest(token!)} and expires_at>now() for update`);
      if(!cart){token=randomToken();cart={id:newId(),version:'0'};await tx.execute(sql`insert into shop.carts(id,tenant_id,token_hash) values(${cart.id},${route.tenant_id},${digest(token)})`);}
      return action(tx,cart,route);
    });
    reply.header('Cache-Control','no-store').setCookie(cookieName,token!,{httpOnly:true,sameSite:'lax',secure:process.env.APP_ENV==='production',path:'/',maxAge:30*86400});return result;
  }
  async items(tx:Transaction,cartId:string) {
    const items=await rows<CartItem>(tx,sql`select v.id as variant_id,p.name,v.sku,coalesce((select jsonb_object_agg(o.name,ov.value) from shop.variant_values vv join shop.product_options o on (o.tenant_id,o.id)=(vv.tenant_id,vv.option_id) join shop.option_values ov on (ov.tenant_id,ov.id)=(vv.tenant_id,vv.value_id) where vv.variant_id=v.id),'{}'::jsonb) as attributes,i.quantity,v.price_cents::text,v.weight_g,v.width_mm,v.height_mm,v.length_mm,v.active,p.status,coalesce((select sum(s.on_hand-s.reserved) from shop.inventory_items s where s.variant_id=v.id),0)::integer as available from shop.cart_items i join shop.product_variants v on (v.tenant_id,v.id)=(i.tenant_id,i.variant_id) join shop.products p on (p.tenant_id,p.id)=(v.tenant_id,v.product_id) where i.cart_id=${cartId} and i.quantity>0 order by v.id`);
    const valid=items.every(i=>i.active&&i.status==='ACTIVE'&&i.quantity<=i.available);
    const subtotal=items.reduce((sum,i)=>sum+BigInt(i.price_cents)*BigInt(i.quantity),0n).toString();
    return {items,valid,subtotal_cents:subtotal};
  }
  read(s:string,req:FastifyRequest,reply:FastifyReply) {return this.run(s,req,reply,async(tx,cart)=>({id:cart.id,version:cart.version,...await this.items(tx,cart.id),checkout_enabled:simulationEnabled()}));}
  change(s:string,req:FastifyRequest,reply:FastifyReply,input:unknown) {const b=object(input),variant=id(b.variant_id),qty=integer(b.quantity,0,99);return this.run(s,req,reply,async(tx,cart,route)=>{
    const [current]=await rows<{available:number}>(tx,sql`select coalesce((select sum(on_hand-reserved) from shop.inventory_items where variant_id=v.id),0)::integer as available from shop.product_variants v join shop.products p on (p.tenant_id,p.id)=(v.tenant_id,v.product_id) where v.id=${variant} and (${qty===0} or (v.active and p.status='ACTIVE'))`);
    if(!current)throw new NotFoundException('Variação indisponível nesta loja.');if(qty>current.available)throw new ConflictException('Quantidade maior que o saldo disponível.');
    await tx.execute(sql`insert into shop.cart_items(id,tenant_id,cart_id,variant_id,quantity) values(${newId()},${route.tenant_id},${cart.id},${variant},${qty}) on conflict(tenant_id,cart_id,variant_id) do update set quantity=excluded.quantity`);
    await tx.execute(sql`update shop.carts set version=version+1 where id=${cart.id}`);return {id:cart.id,...await this.items(tx,cart.id),checkout_enabled:simulationEnabled()};
  });}
  address(value:unknown) {const b=object(value),cep=text(b.cep,9).replace('-','');if(!/^\d{8}$/.test(cep))throw new BadRequestException('CEP inválido.');return {cep,street:text(b.street,150),number:text(b.number,30),city:text(b.city,100),state:text(b.state,2),complement:text(b.complement??'',100,true)};}
  quote(s:string,req:FastifyRequest,reply:FastifyReply,input:unknown) {const b=object(input),address=this.address(b.address),kind=text(b.kind,10);if(kind==='CARRIER')return this.carrierQuote(s,req,reply,address,text(b.service??'',60,true));if(!['PICKUP','TABLE'].includes(kind))throw new BadRequestException('Método inválido.');return this.run(s,req,reply,async(tx,cart,route)=>{
    const data=await this.items(tx,cart.id);if(!data.valid||!data.items.length)throw new ConflictException('Revise os itens disponíveis do carrinho.');
    const [rule]=await rows<{id:string;version:string;price_cents:string;name:string;days:number}>(tx,sql`select id,version::text,price_cents::text,name,days from shop.shipping_rules where active and kind=${kind} and (${kind==='PICKUP'} or (${address.cep} between cep_start and cep_end)) order by priority desc,(cep_end::bigint-cep_start::bigint),id limit 1`);
    if(!rule)throw new NotFoundException('CEP não atendido; nenhum frete gratuito foi criado.');
    const fingerprint=digest(JSON.stringify({address,items:data.items,rule:rule.id,version:rule.version})),quoteId=newId();
    const [quote]=await rows<{id:string;expires_at:Date;price_cents:string}>(tx,sql`insert into shop.shipping_quotes(id,tenant_id,cart_id,rule_id,fingerprint,address,price_cents) values(${quoteId},${route.tenant_id},${cart.id},${rule.id},${fingerprint},${JSON.stringify(address)}::jsonb,${rule.price_cents}) returning id,expires_at,price_cents::text`);
    return {...quote,method:rule.name,days:rule.days,total_cents:(BigInt(data.subtotal_cents)+BigInt(rule.price_cents)).toString()};
  });}
  // Carrier quote: provider called outside any transaction; the cart is re-read before storing so a concurrent change invalidates it.
  async carrierQuote(s:string,req:FastifyRequest,reply:FastifyReply,address:ReturnType<CartService['address']>,service:string){
    const ctx=await this.run(s,req,reply,async(tx,cart)=>{const data=await this.items(tx,cart.id);if(!data.valid||!data.items.length)throw new ConflictException('Revise os itens disponíveis do carrinho.');
      const [p]=await rows<{provider:string;origin_cep:string;simulation:SimulationSettings;rule_id:string;version:string;name:string}>(tx,sql`select p.provider,p.origin_cep,p.simulation,p.rule_id,r.version::text,r.name from shop.shipping_providers p join shop.shipping_rules r on (r.tenant_id,r.id)=(p.tenant_id,p.rule_id) where p.enabled and r.active`);
      if(!p)throw new NotFoundException('Transportadora não configurada nesta loja.');return {cart:cart.id,data,p};});
    const parcel=parcelFor(ctx.data.items);if(!parcel)throw new ConflictException('Itens sem peso/dimensões cadastrados ou acima dos limites da transportadora; escolha outro método.');
    let options:CarrierQuote[];try{options=await shippingProvider(ctx.p.provider,ctx.p.simulation).quote({origin_cep:ctx.p.origin_cep,destination_cep:address.cep,parcel,declared_cents:ctx.data.subtotal_cents});}
    catch{throw new ServiceUnavailableException('Transportadora indisponível no momento; nenhum frete gratuito foi aplicado. Escolha retirada ou entrega local.');}
    const chosen=options.find(o=>o.service===service)??[...options].sort((a,b)=>Number(BigInt(a.price_cents)-BigInt(b.price_cents)))[0];if(!chosen)throw new NotFoundException('Nenhum serviço de transportadora para este CEP.');
    return this.run(s,req,reply,async(tx,cart,route)=>{const data=await this.items(tx,cart.id);if(cart.id!==ctx.cart||JSON.stringify(data.items)!==JSON.stringify(ctx.data.items))throw new ConflictException('Carrinho mudou durante a cotação; cote novamente.');
      const [rule]=await rows<{version:string}>(tx,sql`select version::text from shop.shipping_rules where id=${ctx.p.rule_id} and active`);if(!rule||rule.version!==ctx.p.version)throw new ConflictException('Configuração de frete alterada; cote novamente.');
      const fingerprint=digest(JSON.stringify({address,items:data.items,rule:ctx.p.rule_id,version:rule.version})),quoteId=newId(),expires=new Date(Math.min(Date.now()+15*60000,chosen.expires_at.getTime()));
      const [quote]=await rows<{id:string;expires_at:Date;price_cents:string}>(tx,sql`insert into shop.shipping_quotes(id,tenant_id,cart_id,rule_id,fingerprint,address,price_cents,expires_at,provider,provider_service,provider_quote_ref,days,package) values(${quoteId},${route.tenant_id},${cart.id},${ctx.p.rule_id},${fingerprint},${JSON.stringify(address)}::jsonb,${chosen.price_cents},${expires},${ctx.p.provider},${chosen.service},${chosen.ref},${chosen.days},${JSON.stringify(parcel)}::jsonb) returning id,expires_at,price_cents::text`);
      return {...quote,method:`${ctx.p.name} — ${chosen.service}`,days:chosen.days,total_cents:(BigInt(data.subtotal_cents)+BigInt(chosen.price_cents)).toString(),provider:ctx.p.provider,options:options.map(o=>({service:o.service,price_cents:o.price_cents,days:o.days}))};});}
  validate(s:string,req:FastifyRequest,reply:FastifyReply,input:unknown) {const b=object(input),quoteId=id(b.quote_id),address=this.address(b.address);return this.run(s,req,reply,async(tx,cart)=>{
    const [quote]=await rows<{fingerprint:string;rule_id:string;version:string}>(tx,sql`select q.fingerprint,q.rule_id,r.version::text from shop.shipping_quotes q join shop.shipping_rules r on (r.tenant_id,r.id)=(q.tenant_id,q.rule_id) where q.id=${quoteId} and q.cart_id=${cart.id} and q.expires_at>now() and r.active`);
    if(!quote)throw new ConflictException('Cotação expirada ou não autorizada.');const data=await this.items(tx,cart.id);
    if(!data.valid||quote.fingerprint!==digest(JSON.stringify({address,items:data.items,rule:quote.rule_id,version:quote.version})))throw new ConflictException('Cotação desatualizada; recalcule o frete.');return {valid:true,checkout_enabled:simulationEnabled()};
  });}
}
@Controller('public/stores/:slug/cart')
class CartController {
  constructor(private readonly service:CartService){}
  @Get() read(@Param('slug') s:string,@Req() r:FastifyRequest,@Res({passthrough:true}) p:FastifyReply){return this.service.read(s,r,p);}
  @Post('items') change(@Param('slug') s:string,@Req() r:FastifyRequest,@Res({passthrough:true}) p:FastifyReply,@Body() b:unknown){return this.service.change(s,r,p,b);}
  @Post('quotes') quote(@Param('slug') s:string,@Req() r:FastifyRequest,@Res({passthrough:true}) p:FastifyReply,@Body() b:unknown){return this.service.quote(s,r,p,b);}
  @Post('quotes/validate') validate(@Param('slug') s:string,@Req() r:FastifyRequest,@Res({passthrough:true}) p:FastifyReply,@Body() b:unknown){return this.service.validate(s,r,p,b);}
}
@Module({imports:[StorefrontModule],providers:[CartService],controllers:[CartController],exports:[CartService]})
export class CartModule{}

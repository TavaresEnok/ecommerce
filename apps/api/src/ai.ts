import { Body, Controller, Get, Injectable, Module, Param, Post, Req, UseGuards } from '@nestjs/common';
import { rows, sql } from '@ecommerce/database';
import { aiPolicy, discardDraft, generateDescription, generationView, PurchaseError, saveDraft } from '@ecommerce/purchase';
import { AccessModule, SessionGuard, type AuthRequest } from './access.js';
import { id, object, text } from './catalogue.js';
import { Infrastructure } from './infrastructure.js';
import { StoresModule, StoresService } from './stores.js';
// Product description drafts with AI (Fase 7). Owner and Employee manage catalogue; only the Owner turns the feature on.
@Injectable()
class AiService {
 constructor(private stores:StoresService,private infra:Infrastructure){}
 async generate(tenant:string,req:AuthRequest,product:string,input:unknown){const member=await this.stores.run(id(tenant),req.actor,async(_tx,m)=>m);return generateDescription(this.infra.shop,id(tenant),id(product),member.id,text(object(input).key,100));}
 async read(tenant:string,req:AuthRequest,gen:string){await this.stores.run(id(tenant),req.actor,async()=>null);return generationView(this.infra.shop,id(tenant),id(gen));}
 save(tenant:string,req:AuthRequest,gen:string,input:unknown){const b=object(input);return this.stores.run(id(tenant),req.actor,tx=>saveDraft(tx,id(gen),b.text===undefined?undefined:text(b.text,8000)));}
 discard(tenant:string,req:AuthRequest,gen:string){return this.stores.run(id(tenant),req.actor,tx=>discardDraft(tx,id(gen)));}
 settings(tenant:string,req:AuthRequest){return this.stores.run(id(tenant),req.actor,async tx=>{const p=await aiPolicy(tx);const [s]=await rows(tx,sql`select enabled,monthly_limit_micros::text from shop.ai_settings`);const [u]=await rows(tx,sql`select reserved_micros::text,spent_micros::text,running from shop.ai_usage where period=date_trunc('month',now())::date`);
  return {platform_enabled:p.enabled,model:p.model,price_reference:p.price_reference,tenant_monthly_limit_micros:(s as {monthly_limit_micros?:string}|undefined)?.monthly_limit_micros??p.tenant_monthly_limit_micros,enabled:Boolean((s as {enabled?:boolean}|undefined)?.enabled),usage:u??{reserved_micros:'0',spent_micros:'0',running:0}};});}
 update(tenant:string,req:AuthRequest,input:unknown){const b=object(input),limit=b.monthly_limit_micros===undefined||b.monthly_limit_micros===null?null:text(b.monthly_limit_micros,15);if(limit!==null&&!/^\d{1,15}$/.test(limit))throw new PurchaseError(400,'Limite inválido.');
  return this.stores.run(id(tenant),req.actor,async tx=>{const p=await aiPolicy(tx);if(limit!==null&&BigInt(limit)>BigInt(p.tenant_monthly_limit_micros))throw new PurchaseError(409,'O limite da loja não pode passar do teto definido pela plataforma.');
   await tx.execute(sql`insert into shop.ai_settings(id,tenant_id,enabled,monthly_limit_micros) values(gen_random_uuid(),${tenant},${b.enabled===true},${limit}) on conflict(tenant_id) do update set enabled=excluded.enabled,monthly_limit_micros=excluded.monthly_limit_micros,updated_at=now()`);return {enabled:b.enabled===true,monthly_limit_micros:limit};},true);}
}
@Controller('tenants/:tenantId')
@UseGuards(SessionGuard)
class AiController {constructor(private s:AiService){}
 @Post('catalogue/products/:productId/ai-description') generate(@Param('tenantId') t:string,@Param('productId') p:string,@Req() r:AuthRequest,@Body() b:unknown){return this.s.generate(t,r,p,b);}
 @Get('catalogue/ai-generations/:generationId') read(@Param('tenantId') t:string,@Param('generationId') g:string,@Req() r:AuthRequest){return this.s.read(t,r,g);}
 @Post('catalogue/ai-generations/:generationId/save') save(@Param('tenantId') t:string,@Param('generationId') g:string,@Req() r:AuthRequest,@Body() b:unknown){return this.s.save(t,r,g,b);}
 @Post('catalogue/ai-generations/:generationId/discard') discard(@Param('tenantId') t:string,@Param('generationId') g:string,@Req() r:AuthRequest){return this.s.discard(t,r,g);}
 @Get('ai/settings') settings(@Param('tenantId') t:string,@Req() r:AuthRequest){return this.s.settings(t,r);}
 @Post('ai/settings') update(@Param('tenantId') t:string,@Req() r:AuthRequest,@Body() b:unknown){return this.s.update(t,r,b);}
}
@Module({imports:[AccessModule,StoresModule],providers:[AiService],controllers:[AiController]})
export class AiModule{}

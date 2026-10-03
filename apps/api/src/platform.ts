import { Body, CanActivate, Controller, ExecutionContext, ForbiddenException, Get, Injectable, Module, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { newId, rows, sql, withTenant, type Transaction } from '@ecommerce/database';
import { activePlans, alerts, assignPlan, billingCycle, billingView, cancelAtPeriodEnd, changePlan, PurchaseError, receiveBillingEvent, SimulatedBillingProvider, simulationEnabled, subscription, tenantStatus } from '@ecommerce/purchase';
import { AccessModule, AccessService, SessionGuard as OwnerSession, rejectPendingMfa, type AuthRequest } from './access.js';
import { cookieName, secureEqual } from './security.js';
import { id, object, text } from './catalogue.js';
import { Infrastructure, required } from './infrastructure.js';
import { MfaModule, requireMfa } from './mfa.js';
import { StoresModule, StoresService } from './stores.js';
// Platform administration: separate role granted only by the operator, MFA on every request, reason + audit for every action.
@Injectable()
class PlatformGuard implements CanActivate {
 constructor(private access:AccessService,private infra:Infrastructure){}
 async canActivate(context:ExecutionContext){const req=context.switchToHttp().getRequest<AuthRequest>();req.actor=await this.access.authenticate(req.cookies[cookieName()]);rejectPendingMfa(req.actor);
  if(!['GET','HEAD'].includes(req.method)){const csrf=req.headers['x-csrf-token'];if(req.headers.origin!==required('PUBLIC_ORIGIN')||typeof csrf!=='string'||!secureEqual(csrf,req.actor.csrf))throw new ForbiddenException('Proteção CSRF: origem ou código inválido.');}
  const {rowCount}=await this.infra.access.pool.query('select 1 from access.platform_admins where user_id=$1 and revoked_at is null',[req.actor.id]);if(!rowCount)throw new ForbiddenException('Acesso exclusivo da administração da plataforma.');requireMfa(req.actor);return true;}
}
const ENTITLEMENT_KEYS=['active_products','active_variants','media_bytes','members'] as const;
@Injectable()
class PlatformService {
 constructor(private infra:Infrastructure){}
 private reason(value:unknown){const r=text(value,500);if(r.length<3)throw new PurchaseError(400,'Informe o motivo.');return r;}
 private audit(req:AuthRequest,action:string,tenant:string|null,reason:string,detail:Record<string,unknown>={}){return this.infra.access.pool.query('insert into access.platform_audit(id,admin_user_id,action,tenant_id,reason,detail) values($1,$2,$3,$4,$5,$6)',[newId(),req.actor.id,action,tenant,reason,JSON.stringify(detail)]);}
 private inTenant<T>(tenant:string,fn:(tx:Transaction)=>Promise<T>){return withTenant(this.infra.shop,id(tenant),null,fn);}
 async tenants(){const list=(await this.infra.shop.pool.query('select * from shop.platform_tenants()')).rows as {tenant_id:string;slug:string;name:string;lifecycle_status:string}[];
  return Promise.all(list.slice(0,500).map(async t=>({...t,subscription:await this.inTenant(t.tenant_id,async tx=>{const s=await subscription(tx);const [p]=await rows<{code:string;version:number}>(tx,sql`select code,version from platform.plan_versions where id=${s.plan_version_id}`);return {status:s.status,plan:`${p!.code} v${p!.version}`,period_end:s.current_period_end};})})));}
 // Reading one store's operational data for support requires a reason and is audited.
 async tenant(req:AuthRequest,tenant:string,reason:unknown){const r=this.reason(reason);await this.audit(req,'TENANT_VIEWED',id(tenant),r);const status=await tenantStatus(this.infra.shop,id(tenant));return {status:{...status,alerts:alerts(status)},billing:await this.inTenant(tenant,tx=>billingView(tx))};}
 async lifecycle(req:AuthRequest,tenant:string,input:unknown,action:'SUSPENDED'|'REACTIVATED'){const r=this.reason(object(input).reason);const result=await this.inTenant(tenant,async tx=>{const changed=await tx.execute(action==='SUSPENDED'?sql`update shop.tenants set lifecycle_status='SUSPENDED' where id=${tenant}`:sql`update shop.tenants set lifecycle_status='ACTIVE' where id=${tenant} and lifecycle_status='SUSPENDED'`);if(!changed.rowCount)throw new PurchaseError(409,'Loja inexistente ou em estado incompatível.');await tx.execute(sql`insert into shop.tenant_lifecycle_events(id,tenant_id,action,reason,actor) values(${newId()},${tenant},${action},${r},${'PLATFORM_ADMIN:'+req.actor.id})`);return {tenant,action};});await this.audit(req,`TENANT_${action}`,id(tenant),r);return result;}
 async assign(req:AuthRequest,tenant:string,input:unknown){const b=object(input),r=this.reason(b.reason),plan=id(b.plan_version_id);const s=await this.inTenant(tenant,tx=>assignPlan(tx,plan,`PLATFORM_ADMIN:${req.actor.id}`));await this.audit(req,'PLAN_ASSIGNED',id(tenant),r,{plan});return s;}
 plans(){return this.infra.shop.db.transaction(tx=>rows(tx,sql`select id,code,version,name,price_cents::text,billing_interval,entitlements,status,created_at,activated_at,retired_at from platform.plan_versions order by code,version`));}
 // New plan versions start as DRAFT; editing a version is impossible — a change is a new version.
 async createPlan(req:AuthRequest,input:unknown){const b=object(input),r=this.reason(b.reason),code=text(b.code,31).toUpperCase(),name=text(b.name,100),interval=text(b.billing_interval,10),price=b.price_cents===null||b.price_cents===undefined?null:text(b.price_cents,18),e=object(b.entitlements),mode=text(e.media_mode,10);
  if(!/^[A-Z][A-Z0-9_]{1,30}$/.test(code)||code==='PILOT'||!['NONE','MONTH'].includes(interval)||(price!==null&&!/^\d{1,18}$/.test(price))||!['TOLERANCE','STRICT'].includes(mode))throw new PurchaseError(400,'Plano inválido.');
  const entitlements:Record<string,unknown>={media_mode:mode};for(const k of ENTITLEMENT_KEYS){const v=Number(e[k]);if(!Number.isSafeInteger(v)||v<0)throw new PurchaseError(400,`Cota inválida: ${k}.`);entitlements[k]=v;}
  const plan=await this.infra.shop.db.transaction(async tx=>{const [v]=await rows<{next:number}>(tx,sql`select coalesce(max(version),0)+1 as next from platform.plan_versions where code=${code}`);const planId=newId();await tx.execute(sql`insert into platform.plan_versions(id,code,version,name,price_cents,billing_interval,entitlements,created_by) values(${planId},${code},${v!.next},${name},${price},${interval},${JSON.stringify(entitlements)}::jsonb,${'PLATFORM_ADMIN:'+req.actor.id})`);return {id:planId,code,version:v!.next,status:'DRAFT'};});
  await this.audit(req,'PLAN_CREATED',null,r,plan);return plan;}
 async planStatus(req:AuthRequest,planId:string,input:unknown,status:'ACTIVE'|'RETIRED'){const r=this.reason(object(input).reason);const result=await this.infra.shop.db.transaction(async tx=>{const [p]=await rows(tx,status==='ACTIVE'?sql`update platform.plan_versions set status='ACTIVE',activated_at=now() where id=${id(planId)} and status='DRAFT' returning id,code,version,status`:sql`update platform.plan_versions set status='RETIRED',retired_at=now() where id=${id(planId)} and status='ACTIVE' and code<>'PILOT' returning id,code,version,status`);if(!p)throw new PurchaseError(409,'Transição de plano inválida.');return p;}).catch(e=>{if((e.cause?.code||e.code)==='23514')throw new PurchaseError(409,'Plano pago exige preço aprovado (D07) e recorrência mensal antes de ser ativado.');throw e;});await this.audit(req,`PLAN_${status}`,null,r,{plan:planId});return result;}
 audits(){return this.infra.access.pool.query('select a.action,a.tenant_id,a.reason,a.detail,a.created_at,u.email as admin from access.platform_audit a join access.users u on u.id=a.admin_user_id order by a.created_at desc limit 100').then(r=>r.rows);}
 async alertsAll(){const list=(await this.infra.shop.pool.query('select tenant_id,slug from shop.platform_tenants()')).rows as {tenant_id:string;slug:string}[];const out=[];for(const t of list.slice(0,500)){const s=await tenantStatus(this.infra.shop,t.tenant_id);const a=alerts(s);if(a.length)out.push({tenant_id:t.tenant_id,slug:t.slug,alerts:a});}return out;}
 // Global AI switch and ceilings (D11). The simulator can only be selected where simulation is allowed.
 async aiPolicy(req:AuthRequest,input:unknown){const b=object(input),r=this.reason(b.reason),provider=text(b.provider??'ANTHROPIC',20),num=(v:unknown,name:string)=>{const x=text(v,15);if(!/^\d{1,15}$/.test(x))throw new PurchaseError(400,`Valor inválido: ${name}.`);return x;};
  if(!['ANTHROPIC','SIMULATED'].includes(provider)||(provider==='SIMULATED'&&!simulationEnabled()))throw new PurchaseError(400,'Provedor de IA inválido para este ambiente.');
  if(b.enabled===true&&provider==='ANTHROPIC'&&!process.env.ANTHROPIC_API_KEY)throw new PurchaseError(409,'ANTHROPIC_API_KEY não configurada; não é possível ligar a IA real.');
  const tenantLimit=num(b.tenant_monthly_limit_micros,'limite por loja'),globalLimit=num(b.global_monthly_limit_micros,'limite global');
  const result=await this.infra.shop.db.transaction(async tx=>{await tx.execute(sql`update platform.ai_policy set enabled=${b.enabled===true},provider=${provider},tenant_monthly_limit_micros=${tenantLimit}::bigint,global_monthly_limit_micros=${globalLimit}::bigint,version=version+1,updated_by=${'PLATFORM_ADMIN:'+req.actor.id},updated_at=now() where id=1`);return (await rows(tx,sql`select enabled,provider,model,tenant_monthly_limit_micros::text,global_monthly_limit_micros::text,version from platform.ai_policy where id=1`))[0];});
  await this.audit(req,'AI_POLICY_UPDATED',null,r,result as Record<string,unknown>);return result;}
 async runBilling(req:AuthRequest,input:unknown){const r=this.reason(object(input).reason);const list=(await this.infra.shop.pool.query('select tenant_id from shop.platform_tenants()')).rows as {tenant_id:string}[];const provider=simulationEnabled()?new SimulatedBillingProvider(this.infra.shop):null;const out=[];for(const t of list)out.push({tenant_id:t.tenant_id,status:(await billingCycle(this.infra.shop,t.tenant_id,provider)).status});await this.audit(req,'BILLING_RUN',null,r,{tenants:out.length});return out;}
}
@Controller('platform')
@UseGuards(PlatformGuard)
class PlatformController {constructor(private s:PlatformService){}
 @Get('tenants') tenants(){return this.s.tenants();}
 @Get('tenants/:tenantId') tenant(@Req() r:AuthRequest,@Param('tenantId') t:string,@Query('reason') reason:string){return this.s.tenant(r,t,reason);}
 @Post('tenants/:tenantId/suspend') suspend(@Req() r:AuthRequest,@Param('tenantId') t:string,@Body() b:unknown){return this.s.lifecycle(r,t,b,'SUSPENDED');}
 @Post('tenants/:tenantId/reactivate') reactivate(@Req() r:AuthRequest,@Param('tenantId') t:string,@Body() b:unknown){return this.s.lifecycle(r,t,b,'REACTIVATED');}
 @Post('tenants/:tenantId/plan') assign(@Req() r:AuthRequest,@Param('tenantId') t:string,@Body() b:unknown){return this.s.assign(r,t,b);}
 @Get('plans') plans(){return this.s.plans();}
 @Post('plans') createPlan(@Req() r:AuthRequest,@Body() b:unknown){return this.s.createPlan(r,b);}
 @Post('plans/:planId/activate') activate(@Req() r:AuthRequest,@Param('planId') p:string,@Body() b:unknown){return this.s.planStatus(r,p,b,'ACTIVE');}
 @Post('plans/:planId/retire') retire(@Req() r:AuthRequest,@Param('planId') p:string,@Body() b:unknown){return this.s.planStatus(r,p,b,'RETIRED');}
 @Get('alerts') alerts(){return this.s.alertsAll();}
 @Get('audit') audit(){return this.s.audits();}
 @Post('ai/policy') ai(@Req() r:AuthRequest,@Body() b:unknown){return this.s.aiPolicy(r,b);}
 @Post('billing/run') billing(@Req() r:AuthRequest,@Body() b:unknown){return this.s.runBilling(r,b);}
}
// Store owner billing: visible to the team; plan change/cancel are Owner + MFA.
@Injectable()
class BillingService {
 constructor(private stores:StoresService,private infra:Infrastructure){}
 view(tenant:string,req:AuthRequest){return this.stores.run(id(tenant),req.actor,async tx=>({...await billingView(tx),available_plans:(await activePlans(tx)).filter(p=>p.code!=='PILOT')}));}
 change(tenant:string,req:AuthRequest,input:unknown){requireMfa(req.actor);return this.stores.run(id(tenant),req.actor,tx=>changePlan(tx,id(object(input).plan_version_id),`OWNER:${req.actor.id}`),true);}
 cancel(tenant:string,req:AuthRequest){requireMfa(req.actor);return this.stores.run(id(tenant),req.actor,tx=>cancelAtPeriodEnd(tx,`OWNER:${req.actor.id}`),true);}
 webhook(req:FastifyRequest,input:unknown){const b=object(input);return receiveBillingEvent(this.infra.shop,id(b.tenant_id),text(b.event_id,100),id(b.invoice_id),text(req.headers['x-billing-signature'],100));}
}
@Controller()
class BillingController {constructor(private s:BillingService){}
 @Get('tenants/:tenantId/billing') @UseGuards(OwnerSession) view(@Param('tenantId') t:string,@Req() r:AuthRequest){return this.s.view(t,r);}
 @Post('tenants/:tenantId/billing/plan') @UseGuards(OwnerSession) change(@Param('tenantId') t:string,@Req() r:AuthRequest,@Body() b:unknown){return this.s.change(t,r,b);}
 @Post('tenants/:tenantId/billing/cancel') @UseGuards(OwnerSession) cancel(@Param('tenantId') t:string,@Req() r:AuthRequest){return this.s.cancel(t,r);}
 @Post('billing/simulated/webhook') webhook(@Req() r:FastifyRequest,@Body() b:unknown){return this.s.webhook(r,b);}
}
@Module({imports:[AccessModule,MfaModule,StoresModule],providers:[PlatformGuard,PlatformService,BillingService],controllers:[PlatformController,BillingController]})
export class PlatformModule{}

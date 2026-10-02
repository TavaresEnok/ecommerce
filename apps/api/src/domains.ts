import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { withTenant } from '@ecommerce/database';
import { addDomain, disableDomain, domainsView, httpsProbe, normalizeHostname, PurchaseError, setCanonical, systemDns, verifyDomain } from '@ecommerce/purchase';
import { AccessModule, SessionGuard, type AuthRequest } from './access.js';
import { id, object, text } from './catalogue.js';
import { Infrastructure } from './infrastructure.js';
import { MfaModule, requireMfa } from './mfa.js';
import { StoresModule, StoresService } from './stores.js';
@Injectable()
class DomainService {
 constructor(private stores:StoresService,private infra:Infrastructure){}
 list(tenant:string,req:AuthRequest){return this.stores.run(id(tenant),req.actor,tx=>domainsView(tx));}
 add(tenant:string,req:AuthRequest,input:unknown){requireMfa(req.actor);return this.stores.run(id(tenant),req.actor,tx=>addDomain(tx,tenant,text(object(input).hostname,253)),true);}
 async verify(tenant:string,req:AuthRequest,domain:string){requireMfa(req.actor);await this.stores.run(id(tenant),req.actor,async()=>null,true);
  const target=process.env.PLATFORM_HOST;if(!target)throw new PurchaseError(503,'Domínio da plataforma não configurado (D03); verificação indisponível.');
  return verifyDomain(this.infra.shop,id(tenant),id(domain),{dns:systemDns(),probe:httpsProbe(),target:normalizeHostname(target,'')});}
 canonical(tenant:string,req:AuthRequest,domain:string|null){requireMfa(req.actor);return this.stores.run(id(tenant),req.actor,tx=>setCanonical(tx,domain?id(domain):null),true);}
 disable(tenant:string,req:AuthRequest,domain:string){requireMfa(req.actor);return this.stores.run(id(tenant),req.actor,tx=>disableDomain(tx,id(domain)),true);}
 // Caddy on_demand_tls "ask": certificates only for hostnames proven by a store. Not reachable through the public web proxy.
 async ask(domain:string){let host='';try{host=normalizeHostname(domain,'');}catch{throw new NotFoundException();}const {rows:[r]}=await this.infra.shop.pool.query('select shop.tls_allowed($1) or exists(select 1 from shop.resolve_store($1,true)) as allowed',[host]);if(!r?.allowed)throw new NotFoundException();return {allowed:true};}
}
@Controller('tenants/:tenantId/domains')
@UseGuards(SessionGuard)
class DomainController {constructor(private s:DomainService){}
 @Get() list(@Param('tenantId') t:string,@Req() r:AuthRequest){return this.s.list(t,r);}
 @Post() add(@Param('tenantId') t:string,@Req() r:AuthRequest,@Body() b:unknown){return this.s.add(t,r,b);}
 @Post('canonical/reset') reset(@Param('tenantId') t:string,@Req() r:AuthRequest){return this.s.canonical(t,r,null);}
 @Post(':domainId/verify') verify(@Param('tenantId') t:string,@Param('domainId') d:string,@Req() r:AuthRequest){return this.s.verify(t,r,d);}
 @Post(':domainId/canonical') canonical(@Param('tenantId') t:string,@Param('domainId') d:string,@Req() r:AuthRequest){return this.s.canonical(t,r,d);}
 @Post(':domainId/disable') disable(@Param('tenantId') t:string,@Param('domainId') d:string,@Req() r:AuthRequest){return this.s.disable(t,r,d);}
}
@Controller('internal/tls')
class TlsController {constructor(private s:DomainService){}
 @Get('ask') ask(@Query('domain') d:string){return this.s.ask(d);}
}
@Module({imports:[AccessModule,MfaModule,StoresModule],providers:[DomainService],controllers:[DomainController,TlsController]})
export class DomainModule{}

import { randomBytes } from 'node:crypto';
import { domainToASCII } from 'node:url';
import { Resolver } from 'node:dns/promises';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { newId, rows, sql, withTenant, type Database, type Transaction } from '@ecommerce/database';
import { PurchaseError } from './index.js';
// Domínio próprio (seção 17.2). Provedor padrão: Caddy On-Demand TLS (origem própria, sem terceiros); Cloudflare for SaaS fica como alternativa.
export type DnsLookup={txt(name:string):Promise<string[]>;cname(name:string):Promise<string[]>;a(name:string):Promise<string[]>};
export type RouteProbe=(hostname:string)=>Promise<string>;
export const CHALLENGE_PREFIX='_ecommerce-challenge';
const MAX_DOMAINS=5,FAILURES_BEFORE_FAILED=3;
// Staging only: a JSON zone file stands in for public DNS ({"host":{"TXT":[],"CNAME":[],"A":[]}}), edited by the
// operator exactly as a store owner would edit real DNS. Never honoured in production.
function zoneFile():DnsLookup|null{const file=process.env.DNS_OVERRIDES_FILE;if(!file||process.env.APP_ENV==='production')return null;
 const read=(name:string,type:string)=>{try{const zone=JSON.parse(readFileSync(file,'utf8')) as Record<string,Record<string,string[]>>;return zone[name.toLowerCase()]?.[type]??[];}catch{return [];}};
 return {txt:async n=>read(n,'TXT'),cname:async n=>read(n,'CNAME'),a:async n=>read(n,'A')};}
// Staging only: where the zone file's CNAME points (the edge), so the HTTPS probe follows the same path as a real resolver.
function zoneTarget(hostname:string){const file=process.env.DNS_OVERRIDES_FILE;if(!file||process.env.APP_ENV==='production')return null;try{const zone=JSON.parse(readFileSync(file,'utf8')) as Record<string,Record<string,string[]>>;return zone[hostname.toLowerCase()]?.CNAME?.[0]?.replace(/\.$/,'')??null;}catch{return null;}}
export function systemDns():DnsLookup{const zone=zoneFile();if(zone)return zone;const r=new Resolver({timeout:5000,tries:2});const safe=async(fn:()=>Promise<string[]>)=>{try{return await fn();}catch{return [];}};
 return {txt:name=>safe(async()=>(await r.resolveTxt(name)).map(parts=>parts.join(''))),cname:name=>safe(()=>r.resolveCname(name)),a:name=>safe(()=>r.resolve4(name))};}
// HTTPS GET of the store home through the public path (DNS → TLS → Caddy → web). Certificate validation is never disabled.
export function httpsProbe(origin=process.env.TLS_PROBE_ORIGIN):RouteProbe{return hostname=>new Promise((resolve,reject)=>{
 // Test/dev only: TLS_PROBE_ORIGIN sends the request to the local web service with the Host header, exercising the same routing.
 const local=origin&&['development','test'].includes(process.env.APP_ENV||'')?new URL(origin):null;
 // Staging only: trust the local Caddy CA explicitly (validation stays on; only the root set changes).
 const ca=process.env.TLS_PROBE_CA_FILE&&process.env.APP_ENV!=='production'?readFileSync(process.env.TLS_PROBE_CA_FILE):undefined;
 const req=(local?http:https).request(local?{host:local.hostname,port:local.port,path:'/',headers:{host:hostname},timeout:10000}:{host:zoneTarget(hostname)??hostname,servername:hostname,headers:{host:hostname},path:'/',timeout:10000,...(ca?{ca}:{})},res=>{let body='';res.setEncoding('utf8');res.on('data',c=>{if(body.length<300000)body+=c;});res.on('end',()=>res.statusCode===200?resolve(body):reject(new Error(`HTTP ${res.statusCode}`)));});
 req.on('timeout',()=>req.destroy(new Error('timeout')));req.on('error',reject);req.end();});}
export function normalizeHostname(input:string,platformHost=process.env.PLATFORM_HOST||''){
 const raw=String(input||'').trim().toLowerCase().replace(/\.$/,''),ascii=domainToASCII(raw);
 if(!ascii||ascii.length>253||!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(ascii))throw new PurchaseError(400,'Hostname inválido.');
 const production=process.env.APP_ENV==='production',reserved=['localhost','local','invalid','internal',...(production?['test','example']:[])];
 if(/^\d+(\.\d+){3}$/.test(ascii)||reserved.some(t=>ascii===t||ascii.endsWith(`.${t}`))||(platformHost&&(ascii===platformHost||ascii.endsWith(`.${platformHost}`))))throw new PurchaseError(400,'Hostname reservado ou da própria plataforma.');
 return ascii;}
export type Domain={id:string;hostname:string;status:string;challenge_token:string;canonical:boolean;failure_reason:string|null;consecutive_failures:number};
export const challengeRecord=(d:{hostname:string;challenge_token:string})=>({name:`${CHALLENGE_PREFIX}.${d.hostname}`,type:'TXT',value:`ecommerce-verify=${d.challenge_token}`});
export async function addDomain(tx:Transaction,tenant:string,hostname:string){const host=normalizeHostname(hostname);
 const [existing]=await rows<Domain>(tx,sql`select * from shop.custom_domains where hostname=${host} and status<>'DISABLED'`);if(existing)return {...existing,challenge:challengeRecord(existing)};
 const [count]=await rows<{n:number}>(tx,sql`select count(*)::int as n from shop.custom_domains where status<>'DISABLED'`);if(count!.n>=MAX_DOMAINS)throw new PurchaseError(409,'Limite de domínios por loja atingido.');
 // A fresh, store-bound token every time: a new claimant never inherits an abandoned proof.
 const id=newId(),token=randomBytes(24).toString('base64url');await tx.execute(sql`insert into shop.custom_domains(id,tenant_id,hostname,challenge_token) values(${id},${tenant},${host},${token})`);
 const [d]=await rows<Domain>(tx,sql`select * from shop.custom_domains where id=${id}`);return {...d!,challenge:challengeRecord(d!)};}
async function defaultCanonical(tx:Transaction){const [r]=await rows<{hostname:string}>(tx,sql`select hostname from shop.platform_routes`);if(!r)return null;const origin=new URL(process.env.PUBLIC_ORIGIN||'http://localhost');return origin.protocol==='https:'?`https://${r.hostname}`:`http://${r.hostname}${origin.port?':'+origin.port:''}`;}
async function routeCanonical(tx:Transaction){const [c]=await rows<{hostname:string}>(tx,sql`select hostname from shop.custom_domains where canonical and status='ACTIVE'`);const value=c?`https://${c.hostname}`:await defaultCanonical(tx);if(value)await tx.execute(sql`update shop.platform_routes set canonical=${value}`);await tx.execute(sql`update shop.storefronts set version=version+1`);return value;}
export async function verifyDomain(database:Database,tenant:string,domainId:string,deps:{dns:DnsLookup;probe:RouteProbe;target:string}){
 const d=await withTenant(database,tenant,null,async tx=>{const [x]=await rows<Domain>(tx,sql`select * from shop.custom_domains where id=${domainId} and status in ('PENDING_VERIFICATION','PENDING_TLS','FAILED')`);if(!x)throw new PurchaseError(404,'Domínio não encontrado ou já ativo.');return x;});
 const fail=(reason:string)=>withTenant(database,tenant,null,async tx=>{await tx.execute(sql`update shop.custom_domains set status=case when status='PENDING_TLS' then 'PENDING_TLS' else 'FAILED' end,failure_reason=${reason},last_checked_at=now() where id=${d.id}`);return (await rows(tx,sql`select id,hostname,status,failure_reason from shop.custom_domains where id=${d.id}`))[0];});
 // Network lookups happen outside transactions.
 if(d.status!=='PENDING_TLS'){const txt=await deps.dns.txt(`${CHALLENGE_PREFIX}.${d.hostname}`);if(!txt.includes(`ecommerce-verify=${d.challenge_token}`))return fail(`Registro TXT ${CHALLENGE_PREFIX}.${d.hostname} com o valor indicado não encontrado.`);
  const [cname,a,targetA]=await Promise.all([deps.dns.cname(d.hostname),deps.dns.a(d.hostname),deps.dns.a(deps.target)]);
  if(!cname.map(c=>c.replace(/\.$/,'').toLowerCase()).includes(deps.target)&&!(a.length&&a.every(ip=>targetA.includes(ip))))return fail(`O domínio deve apontar (CNAME) para ${deps.target}.`);
  const claimed=await withTenant(database,tenant,null,tx=>tx.execute(sql`update shop.custom_domains set status='PENDING_TLS',verified_at=now(),failure_reason=null,last_checked_at=now() where id=${d.id}`)).then(()=>true).catch(e=>{if((e.cause?.code||e.code)==='23505')return false;throw e;});
  if(!claimed)return fail('Hostname já verificado por outra loja; não há transferência automática.');}
 // PENDING_TLS lets Caddy's ask endpoint authorize issuance; ACTIVE only after HTTPS serves this exact store.
 const [route]=await withTenant(database,tenant,null,tx=>rows<{slug:string}>(tx,sql`select slug from shop.platform_routes`));
 let body='';try{body=await deps.probe(d.hostname);}catch(e){return fail(`HTTPS ainda indisponível (${(e as Error).message}); tente novamente em alguns minutos.`);}
 if(!route||!body.includes(`data-store="${route.slug}"`))return fail('O endereço responde, mas não entrega esta loja.');
 return withTenant(database,tenant,null,async tx=>{await tx.execute(sql`update shop.custom_domains set status='ACTIVE',activated_at=now(),failure_reason=null,consecutive_failures=0,last_checked_at=now() where id=${d.id} and status='PENDING_TLS'`);return (await rows(tx,sql`select id,hostname,status,canonical from shop.custom_domains where id=${d.id}`))[0];});}
export async function setCanonical(tx:Transaction,domainId:string|null){await tx.execute(sql`update shop.custom_domains set canonical=false where canonical`);
 if(domainId){const r=await tx.execute(sql`update shop.custom_domains set canonical=true where id=${domainId} and status='ACTIVE'`);if(!r.rowCount)throw new PurchaseError(409,'Somente domínio ACTIVE pode ser canônico.');}
 return {canonical:await routeCanonical(tx)};}
export async function disableDomain(tx:Transaction,domainId:string){const r=await tx.execute(sql`update shop.custom_domains set status='DISABLED',canonical=false,disabled_at=now() where id=${domainId} and status<>'DISABLED'`);if(!r.rowCount)throw new PurchaseError(404,'Domínio não encontrado.');return {disabled:true,canonical:await routeCanonical(tx)};}
// Periodic recheck: an ACTIVE domain that stops pointing to the platform (or serving the store) fails after 3 checks and stops routing.
export async function recheckDomains(database:Database,tenant:string,deps:{dns:DnsLookup;probe:RouteProbe;target:string}){const active=await withTenant(database,tenant,null,tx=>rows<Domain>(tx,sql`select * from shop.custom_domains where status='ACTIVE' and (last_checked_at is null or last_checked_at<now()-interval '6 hours')`));
 for(const d of active){const cname=await deps.dns.cname(d.hostname),a=await deps.dns.a(d.hostname),targetA=await deps.dns.a(deps.target);const ok=cname.map(c=>c.replace(/\.$/,'').toLowerCase()).includes(deps.target)||(a.length>0&&a.every(ip=>targetA.includes(ip)));
  await withTenant(database,tenant,null,async tx=>{if(ok){await tx.execute(sql`update shop.custom_domains set consecutive_failures=0,last_checked_at=now() where id=${d.id}`);return;}
   const [x]=await rows<{n:number}>(tx,sql`update shop.custom_domains set consecutive_failures=consecutive_failures+1,last_checked_at=now(),failure_reason='DNS não aponta mais para a plataforma.' where id=${d.id} returning consecutive_failures as n`);
   if(x!.n>=FAILURES_BEFORE_FAILED){await tx.execute(sql`update shop.custom_domains set status='FAILED',canonical=false where id=${d.id}`);await routeCanonical(tx);}});}}
export async function domainsView(tx:Transaction){const list=await rows<Domain&{verified_at:Date|null;activated_at:Date|null}>(tx,sql`select id,hostname,status,challenge_token,canonical,provider,failure_reason,verified_at,activated_at,created_at from shop.custom_domains where status<>'DISABLED' order by created_at`);return list.map(d=>({...d,challenge:challengeRecord(d)}));}

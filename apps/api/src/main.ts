import 'reflect-metadata';
import { ArgumentsHost, Catch, Controller, ExceptionFilter, Get, HttpException, Module, ServiceUnavailableException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { Infrastructure, InfrastructureModule, required } from './infrastructure.js';
import { AccessModule } from './access.js';
import { StoresModule } from './stores.js';
import { CatalogueModule } from './catalogue.js';
import { StorefrontModule } from './storefront.js';
import { CartModule } from './cart.js';
import { PurchaseModule } from './purchase.js';
import { OperationsModule } from './operations.js';
import { MfaModule } from './mfa.js';
import { PlatformModule } from './platform.js';
import { DomainModule } from './domains.js';
import { AiModule } from './ai.js';
import { PurchaseError } from '@ecommerce/purchase';
import { secureEqual } from './security.js';
// Client identity for rate limiting. Path: edge (Caddy) → web (Next) → API. Only the edge sees the client's TCP address;
// it overwrites X-Client-IP with it and adds X-Edge-Auth (shared secret), discarding any client-sent values. X-Forwarded-For
// is never trusted (Next forwards it unchanged). Without a valid pair (direct access in dev/test) the TCP peer is the key.
export function clientKey(request: FastifyRequest) {
  const secret = process.env.EDGE_PROXY_SECRET || '', auth = request.headers['x-edge-auth'], ip = request.headers['x-client-ip'];
  if (secret && typeof auth === 'string' && typeof ip === 'string' && secureEqual(auth, secret) && /^[0-9a-fA-F:.]{2,45}$/.test(ip)) return `client:${ip}`;
  return `peer:${request.ip}`;
}
const limit = (name: string, fallback: number) => Number(process.env[name]) || (process.env.APP_ENV === 'test' ? 1000 : fallback);
// Scopes: credential endpoints (brute force), platform administration, everything else. Each counts per client and route.
const AUTH_ROUTES = new Set(['/auth/login','/auth/register','/auth/recover','/auth/reset','/auth/verify-email','/auth/mfa/verify','/auth/mfa/enable']);
@Catch()
class SafeErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<FastifyReply>();
    const request = host.switchToHttp().getRequest<FastifyRequest>();
    const failure = error as {code?:string;cause?:{code?:string};statusCode?:number};
    const code = failure.code || failure.cause?.code;
    const transportStatus = [400,401,403,404,405,413,415,429].includes(failure.statusCode || 0) ? failure.statusCode! : 500;
    const status = error instanceof PurchaseError ? error.status : error instanceof HttpException ? error.getStatus() : code === '23505' ? 409 : ['23503','23514','22P02'].includes(code || '') ? 400 : transportStatus;
    const message = error instanceof PurchaseError ? error.message : error instanceof HttpException ? error.getResponse() : status === 409 ? 'Dados já cadastrados.' : status === 429 ? 'Limite de requisições excedido; aguarde e tente novamente.' : status < 500 ? 'Requisição inválida.' : 'Falha interna; tente novamente com o requestId informado.';
    if (status >= 500) request.log.error({ event:'operation_failed', request_id: request.id });
    response.status(status).send({ statusCode:status, error:message, requestId:request.id });
  }
}
@Controller('health')
class HealthController {
  constructor(private readonly infra: Infrastructure) {}
  @Get('live') live() { return {status:'ok'}; }
  @Get('ready') async ready() {
    try { await this.infra.shop.pool.query('select 1'); await this.infra.queue.getJobCounts('wait'); return {status:'ok'}; }
    catch { throw new ServiceUnavailableException('Dependência indisponível.'); }
  }
}
@Module({ imports:[InfrastructureModule,AccessModule,StoresModule,CatalogueModule,StorefrontModule,CartModule,PurchaseModule,OperationsModule,MfaModule,PlatformModule,DomainModule,AiModule],controllers:[HealthController] })
class AppModule {}
async function bootstrap() {
  if (required('COOKIE_SECRET').length < 32) throw new Error('COOKIE_SECRET must be at least 32 characters');
  if (required('APP_ENV') === 'production' && (process.env.LOCAL_MAILBOX === 'true' || !required('PUBLIC_ORIGIN').startsWith('https://') || (process.env.EDGE_PROXY_SECRET || '').length < 32)) throw new Error('Unsafe production configuration');
  const adapter = new FastifyAdapter({ bodyLimit: 16384, trustProxy: false, logger: {
    level:'info', redact:['req.headers.cookie','req.headers.authorization','req.headers.x-csrf-token','res.headers.set-cookie'],
    serializers:{req:(req:any)=>({method:req.method,route:req.url?.split('?')[0]}),res:(res:any)=>({statusCode:res.statusCode})}
  }});
  const app = await NestFactory.create<NestFastifyApplication>(AppModule,adapter,{logger:['error','warn']});
  await app.register(cookie);
  await app.register(helmet,{contentSecurityPolicy:false});
  adapter.getInstance().addHook('onRoute', options => {
    if (options.url === '/tenants/:tenantId/catalogue/media') options.bodyLimit=10*1024*1024;
    if (options.url === '/health/ready') options.config = {...options.config, rateLimit:false};
    else if (options.method === 'POST' && AUTH_ROUTES.has(options.url)) options.config = {...options.config, rateLimit:{max:limit('AUTH_RATE_LIMIT_PER_MINUTE',10),timeWindow:'1 minute'}};
    else if (options.url.startsWith('/platform/')) options.config = {...options.config, rateLimit:{max:limit('PLATFORM_RATE_LIMIT_PER_MINUTE',60),timeWindow:'1 minute'}};
  });
  // Per-client limit (see clientKey); RATE_LIMIT_PER_MINUTE lets the capacity rehearsal (single client) and deployments tune it.
  await app.register(rateLimit,{max:limit('RATE_LIMIT_PER_MINUTE',120),timeWindow:'1 minute',keyGenerator:clientKey});
  const server = adapter.getInstance();
  server.addContentTypeParser('application/octet-stream',{parseAs:'buffer',bodyLimit:10*1024*1024},(_request,body,done)=>done(null,body));
  server.addHook('onRequest',async (request,reply) => {
    reply.header('Cache-Control','no-store'); reply.header('X-Request-Id',request.id); reply.header('Referrer-Policy','no-referrer');
    if (request.url.startsWith('/auth/') && !['GET','HEAD'].includes(request.method) && request.headers.origin !== required('PUBLIC_ORIGIN')) return reply.code(403).send({statusCode:403,error:'Origem inválida.',requestId:request.id});
  });
  server.addHook('onResponse', async (request, reply) => { request.log.info({event:'request_completed',request_id:request.id,tenant_id:(request as any).tenantId,operation_id:request.routeOptions.url,type:request.method,duration_ms:reply.elapsedTime}); });
  app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));
  app.useGlobalFilters(new SafeErrors());
  app.enableShutdownHooks();
  await app.get(Infrastructure).checkRoles();
  await app.listen(Number(process.env.PORT || 3001),'0.0.0.0');
}
bootstrap().catch(() => { console.error(JSON.stringify({event:'api_startup_failed',message:'Verifique configuração e papéis do banco.'})); process.exit(1); });

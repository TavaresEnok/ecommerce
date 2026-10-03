import { Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Req, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { newId, rows, sql, withTenant, type Transaction } from '@ecommerce/database';
import { AccessModule, SessionGuard, type Actor, type AuthRequest } from './access.js';
import { AcceptInviteDto, CreateStoreDto, EmailDto, SettingsDto } from './dto.js';
import { Infrastructure, localMailbox } from './infrastructure.js';
import { digest, randomToken } from './security.js';
import { assertQuota, PILOT_PLAN } from '@ecommerce/purchase';
import { jobStatus, type JobSource } from './jobs.js';
type Membership = {id: string; role: 'OWNER'|'EMPLOYEE'; user_id: string; status: string};
@Injectable()
export class StoresService {
  constructor(private readonly infra: Infrastructure) {}
  async authorize(tx: Transaction, actor: Actor, owner = false) {
    const [membership] = await rows<Membership>(tx, sql`select id,role,user_id,status from shop.tenant_memberships where tenant_id=shop.current_tenant() and user_id=${actor.id} and status='ACTIVE' for share`);
    if (!membership) throw new NotFoundException('Loja não encontrada ou sem acesso.');
    if (owner && membership.role !== 'OWNER') throw new ForbiddenException('Ação exclusiva do Dono.');
    return membership;
  }
  run<T>(tenantId: string, actor: Actor, action: (tx: Transaction, member: Membership) => Promise<T>, owner = false) {
    return withTenant(this.infra.shop, tenantId, actor.id, async tx => action(tx, await this.authorize(tx, actor, owner)));
  }
  async list(actor: Actor) {
    const links = await this.infra.shop.db.transaction(async tx => {
      await tx.execute(sql`select set_config('app.current_user_id',${actor.id},true)`);
      return rows<{tenant_id:string}>(tx, sql`select tenant_id from shop.tenant_memberships where user_id=${actor.id} and status='ACTIVE'`);
    });
    return Promise.all(links.map(link => this.run(link.tenant_id, actor, async (tx,member) => {
      const [tenant] = await rows<Record<string,unknown>>(tx, sql`select id,slug,name,lifecycle_status from shop.tenants where id=${link.tenant_id}`);
      return { ...tenant, role: member.role };
    })));
  }
  async create(actor: Actor, input: CreateStoreDto) {
    if (!localMailbox()) throw new ServiceUnavailableException('Abertura de loja requer ativação assistida; fluxo externo ainda não habilitado.');
    const tenantId = newId(); const membershipId = newId();
    await withTenant(this.infra.shop, tenantId, actor.id, async tx => {
      await tx.execute(sql`insert into shop.tenants(id,tenant_id,slug,name) values(${tenantId},${tenantId},${input.slug},${input.name.trim()})`);
      await tx.execute(sql`insert into shop.tenant_memberships(id,tenant_id,user_id,role) values(${membershipId},${tenantId},${actor.id},'OWNER')`);
      await tx.execute(sql`insert into shop.store_settings(id,tenant_id,display_name,updated_by_membership_id) values(${newId()},${tenantId},${input.name.trim()},${membershipId})`);
      await tx.execute(sql`insert into shop.subscriptions(id,tenant_id,plan_version_id,status) values(${newId()},${tenantId},${PILOT_PLAN},'ACTIVE')`);
    });
    return { id: tenantId, name: input.name, slug: input.slug, role: 'OWNER', lifecycle_status: 'DRAFT' };
  }
  read(tenantId: string, actor: Actor) {
    return this.run(tenantId,actor,async tx => {
      const [setting] = await rows(tx, sql`select id,tenant_id,display_name as "displayName",timezone,updated_at as "updatedAt" from shop.store_settings where tenant_id=${tenantId}`);
      return setting;
    });
  }
  update(tenantId: string, actor: Actor, input: SettingsDto) {
    return this.run(tenantId, actor, async (tx,member) => {
      const [setting] = await rows(tx, sql`update shop.store_settings set display_name=${input.displayName.trim()},timezone=${input.timezone},updated_by_membership_id=${member.id},updated_at=now() where tenant_id=${tenantId} returning id,tenant_id,display_name as "displayName",timezone`);
      return setting;
    }, true);
  }
  members(tenantId: string, actor: Actor) {
    return this.run(tenantId,actor,tx => rows(tx,sql`select id,user_id,role,status from shop.tenant_memberships where tenant_id=${tenantId}`),true);
  }
  revoke(tenantId: string, id: string, actor: Actor) {
    return this.run(tenantId,actor,async tx => {
      const [member] = await rows(tx,sql`update shop.tenant_memberships set status='REVOKED',updated_at=now() where tenant_id=${tenantId} and id=${id} and role='EMPLOYEE' returning id`);
      if (!member) throw new NotFoundException('Funcionário não encontrado.');
      return { message: 'Vínculo revogado.' };
    },true);
  }
  invite(tenantId: string, actor: Actor, input: EmailDto) {
    if (!localMailbox()) throw new ServiceUnavailableException('Entrega externa de convites ainda não habilitada.');
    return this.run(tenantId,actor,async (tx,member) => {
      await assertQuota(tx,'members',1);
      const token = randomToken();
      await tx.execute(sql`insert into shop.invitations(id,tenant_id,email,token_hash,inviter_membership_id,expires_at) values(${newId()},${tenantId},${input.email.trim().toLowerCase()},${digest(token)},${member.id},now()+interval '24 hours')`);
      return { tenantId, localToken: token, message: 'Convite LOCAL para Funcionário; válido por 24 horas, uso único. Nenhum e-mail enviado.' };
    },true);
  }
  accept(actor: Actor, input: AcceptInviteDto) {
    return withTenant(this.infra.shop,input.tenantId,actor.id,async tx => {
      const [invite] = await rows<{id:string}>(tx,sql`update shop.invitations set consumed_at=now() where tenant_id=${input.tenantId} and token_hash=${digest(input.token)} and email=${actor.email} and consumed_at is null and expires_at>now() returning id`);
      if (!invite) throw new NotFoundException('Convite inválido, expirado ou de outro e-mail.');
      await tx.execute(sql`insert into shop.tenant_memberships(id,tenant_id,user_id,role) values(${newId()},${input.tenantId},${actor.id},'EMPLOYEE') on conflict(tenant_id,user_id) do update set status='ACTIVE',updated_at=now() where shop.tenant_memberships.role='EMPLOYEE'`);
      return { message: 'Convite aceito.' };
    });
  }
  async check(tenantId: string, actor: Actor) {
    const setting = await this.read(tenantId,actor);
    const job = await this.infra.queue.add('configuration-check', { tenantId, userId: actor.id, resourceId: (setting as {id:string}).id }, { jobId: `tenant-${tenantId}-${newId()}`, removeOnComplete: 100, removeOnFail: 100 });
    return { jobId: job.id };
  }
  async job(tenantId: string, id: string, actor: Actor) {
    await this.read(tenantId,actor);
    const status = await jobStatus(this.infra.queue as unknown as JobSource, id, job => job.data.tenantId === tenantId && job.data.userId === actor.id);
    if (!status) throw new NotFoundException('Job não encontrado.');
    return status;
  }
}
@Controller()
@UseGuards(SessionGuard)
export class StoresController {
  constructor(private readonly stores: StoresService) {}
  @Get('tenants') list(@Req() req: AuthRequest) { return this.stores.list(req.actor); }
  @Post('tenants') create(@Req() req: AuthRequest,@Body() input: CreateStoreDto) { return this.stores.create(req.actor,input); }
  @Post('invitations/accept') accept(@Req() req: AuthRequest,@Body() input: AcceptInviteDto) { return this.stores.accept(req.actor,input); }
  @Get('tenants/:tenantId/settings') read(@Param('tenantId',new ParseUUIDPipe({version:'7'})) id: string,@Req() req: AuthRequest) { req.tenantId=id; return this.stores.read(id,req.actor); }
  @Patch('tenants/:tenantId/settings') update(@Param('tenantId',new ParseUUIDPipe({version:'7'})) id: string,@Req() req: AuthRequest,@Body() input: SettingsDto) { req.tenantId=id; return this.stores.update(id,req.actor,input); }
  @Get('tenants/:tenantId/members') members(@Param('tenantId',new ParseUUIDPipe({version:'7'})) id: string,@Req() req: AuthRequest) { return this.stores.members(id,req.actor); }
  @Patch('tenants/:tenantId/members/:memberId/revoke') revoke(@Param('tenantId',new ParseUUIDPipe({version:'7'})) id: string,@Param('memberId',new ParseUUIDPipe({version:'7'})) member: string,@Req() req: AuthRequest) { return this.stores.revoke(id,member,req.actor); }
  @Post('tenants/:tenantId/invitations') invite(@Param('tenantId',new ParseUUIDPipe({version:'7'})) id: string,@Req() req: AuthRequest,@Body() input: EmailDto) { return this.stores.invite(id,req.actor,input); }
  @Post('tenants/:tenantId/configuration-check') check(@Param('tenantId',new ParseUUIDPipe({version:'7'})) id: string,@Req() req: AuthRequest) { return this.stores.check(id,req.actor); }
  @Get('tenants/:tenantId/jobs/:jobId') job(@Param('tenantId',new ParseUUIDPipe({version:'7'})) id: string,@Param('jobId') job: string,@Req() req: AuthRequest) { return this.stores.job(id,job,req.actor); }
}
@Module({ imports:[AccessModule],controllers:[StoresController],providers:[StoresService],exports:[StoresService] })
export class StoresModule {}

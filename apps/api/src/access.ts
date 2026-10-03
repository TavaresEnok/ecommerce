import { Body, CanActivate, Controller, ExecutionContext, ForbiddenException, Get, Injectable, Module, Post, Req, Res, ServiceUnavailableException, SetMetadata, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { newId, rows, sql } from '@ecommerce/database';
import { CredentialsDto, EmailDto, RecoveryDto, TokenDto } from './dto.js';
import { Infrastructure, localMailbox, required } from './infrastructure.js';
import { checkPassword, cookieName, cookieOptions, csrfFor, digest, hashPassword, randomToken, secureEqual } from './security.js';

export type Actor = { id: string; email: string; verified_at: Date; sessionId: string; csrf: string; mfaEnabled: boolean; mfaVerified: boolean };
export type AuthRequest = FastifyRequest & { actor: Actor; tenantId?: string };
@Injectable()
export class AccessService {
  constructor(private readonly infra: Infrastructure) {}
  async register(input: CredentialsDto) {
    if (!localMailbox()) throw new ServiceUnavailableException('Cadastro assistido/e-mail externo ainda não habilitado.');
    const id = newId(); const token = randomToken(); const password = await hashPassword(input.password);
    await this.infra.access.db.transaction(async tx => {
      await tx.execute(sql`insert into access.users(id,email,password_hash) values(${id},${input.email.trim().toLowerCase()},${password})`);
      await tx.execute(sql`insert into access.tokens(id,user_id,kind,token_hash,expires_at) values(${newId()},${id},'VERIFY',${digest(token)},now()+interval '30 minutes')`);
    });
    return { message: 'MODO LOCAL: use o código abaixo para verificar o e-mail. Nenhuma mensagem enviada.', localToken: token };
  }
  async verify(token: string) {
    await this.infra.access.db.transaction(async tx => {
      const [access] = await rows<{user_id: string}>(tx, sql`update access.tokens set consumed_at=now() where token_hash=${digest(token)} and kind='VERIFY' and consumed_at is null and expires_at>now() returning user_id`);
      if (!access) throw new UnauthorizedException('Código inválido ou expirado.');
      await tx.execute(sql`update access.users set verified_at=now(),updated_at=now() where id=${access.user_id}`);
    });
    return { message: 'E-mail verificado.' };
  }
  async login(input: CredentialsDto) {
    const result = await this.infra.access.pool.query('select id,email,password_hash,verified_at from access.users where email=$1', [input.email.trim().toLowerCase()]);
    const user = result.rows[0];
    // O mesmo custo de hash é aplicado para e-mails inexistentes.
    const valid = user ? await checkPassword(input.password, user.password_hash) : (await hashPassword(input.password), false);
    if (!valid) throw new UnauthorizedException('Credenciais inválidas.');
    if (!user.verified_at) throw new ForbiddenException('Verifique o e-mail antes de acessar.');
    const token = randomToken();
    await this.infra.access.pool.query('insert into access.sessions(id,user_id,token_hash,expires_at) values($1,$2,$3,now()+interval \'7 days\')', [newId(), user.id, digest(token)]);
    const mfa = await this.infra.access.pool.query('select 1 from access.mfa_factors where user_id=$1 and enabled_at is not null', [user.id]);
    return { token, csrf: csrfFor(token), user: { id: user.id, email: user.email }, mfaRequired: Boolean(mfa.rowCount) };
  }
  async authenticate(token: string | undefined): Promise<Actor> {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new UnauthorizedException('Autenticação necessária.');
    const result = await this.infra.access.pool.query('select u.id,u.email,u.verified_at,s.id as "sessionId",(f.enabled_at is not null) as "mfaEnabled",(f.enabled_at is not null and s.mfa_at is not null) as "mfaVerified" from access.sessions s join access.users u on u.id=s.user_id left join access.mfa_factors f on f.user_id=u.id where s.token_hash=$1 and s.revoked_at is null and s.expires_at>now()', [digest(token)]);
    if (!result.rows[0]) throw new UnauthorizedException('Sessão inválida ou expirada.');
    return { ...result.rows[0], csrf: csrfFor(token) };
  }
  async recover(email: string) {
    if (!localMailbox()) throw new ServiceUnavailableException('Entrega externa de recuperação ainda não habilitada.');
    const token = randomToken();
    const result = await this.infra.access.pool.query('select id from access.users where email=$1', [email.trim().toLowerCase()]);
    if (result.rows[0]) await this.infra.access.db.transaction(async tx => {
      await tx.execute(sql`update access.tokens set consumed_at=now() where user_id=${result.rows[0].id} and kind='RECOVERY' and consumed_at is null`);
      await tx.execute(sql`insert into access.tokens(id,user_id,kind,token_hash,expires_at) values(${newId()},${result.rows[0].id},'RECOVERY',${digest(token)},now()+interval '15 minutes')`);
    });
    return { message: 'MODO LOCAL: se a conta existe, o código recupera a senha. Nenhuma mensagem enviada.', localToken: token };
  }
  async reset(input: RecoveryDto) {
    const password = await hashPassword(input.password);
    await this.infra.access.db.transaction(async tx => {
      const [access] = await rows<{user_id: string}>(tx, sql`update access.tokens set consumed_at=now() where token_hash=${digest(input.token)} and kind='RECOVERY' and consumed_at is null and expires_at>now() returning user_id`);
      if (!access) throw new UnauthorizedException('Código inválido ou expirado.');
      await tx.execute(sql`update access.users set password_hash=${password},updated_at=now() where id=${access.user_id}`);
      await tx.execute(sql`update access.sessions set revoked_at=now() where user_id=${access.user_id} and revoked_at is null`);
      await tx.execute(sql`update access.tokens set consumed_at=now() where user_id=${access.user_id} and kind='RECOVERY' and consumed_at is null`);
    });
    return { message: 'Senha alterada; sessões anteriores revogadas.' };
  }
  async logout(actor: Actor, all: boolean) {
    await this.infra.access.pool.query(all ? 'update access.sessions set revoked_at=now() where user_id=$1 and revoked_at is null' : 'update access.sessions set revoked_at=now() where id=$1', [all ? actor.id : actor.sessionId]);
    return { message: 'Sessões revogadas.' };
  }
}
// A password-only session of an account with MFA enabled is "pending": it may only answer the challenge, read the
// minimal session state and sign out. Every other guarded route is refused centrally until the second factor is verified.
const PENDING_MFA_ALLOWED = 'access:pending-mfa-allowed';
export const AllowPendingMfa = () => SetMetadata(PENDING_MFA_ALLOWED, true);
export function rejectPendingMfa(actor: Actor) { if (actor.mfaEnabled && !actor.mfaVerified) throw new ForbiddenException({ message: 'Confirme o código do autenticador (MFA) para continuar.', code: 'MFA_PENDING' }); }
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly access: AccessService, private readonly reflector: Reflector) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    req.actor = await this.access.authenticate(req.cookies[cookieName()]);
    if (!this.reflector.getAllAndOverride<boolean>(PENDING_MFA_ALLOWED, [context.getHandler(), context.getClass()])) rejectPendingMfa(req.actor);
    if (!['GET','HEAD','OPTIONS'].includes(req.method)) {
      const csrf = req.headers['x-csrf-token'];
      if (req.headers.origin !== required('PUBLIC_ORIGIN') || typeof csrf !== 'string' || !secureEqual(csrf, req.actor.csrf)) throw new ForbiddenException('Proteção CSRF: origem ou código inválido.');
    }
    return true;
  }
}
@Controller('auth')
export class AccessController {
  constructor(private readonly access: AccessService) {}
  @Post('register') register(@Body() input: CredentialsDto) { return this.access.register(input); }
  @Post('verify-email') verify(@Body() input: TokenDto) { return this.access.verify(input.token); }
  @Post('login') async login(@Body() input: CredentialsDto, @Res({passthrough:true}) reply: FastifyReply) {
    const result = await this.access.login(input);
    reply.setCookie(cookieName(), result.token, cookieOptions());
    return { user: result.user, csrf: result.csrf, mfaRequired: result.mfaRequired };
  }
  @Post('recover') recover(@Body() input: EmailDto) { return this.access.recover(input.email); }
  @Post('reset') reset(@Body() input: RecoveryDto) { return this.access.reset(input); }
  @Get('session') @UseGuards(SessionGuard) @AllowPendingMfa() session(@Req() req: AuthRequest) { return { user: {id:req.actor.id,email:req.actor.email}, csrf: req.actor.csrf, localMailbox: localMailbox(), mfa: { enabled: req.actor.mfaEnabled, verified: req.actor.mfaVerified } }; }
  @Post('logout') @UseGuards(SessionGuard) @AllowPendingMfa() async logout(@Req() req: AuthRequest, @Res({passthrough:true}) reply: FastifyReply) {
    reply.clearCookie(cookieName(), {path:'/'}); return this.access.logout(req.actor, false);
  }
  @Post('revoke-all') @UseGuards(SessionGuard) @AllowPendingMfa() async revoke(@Req() req: AuthRequest, @Res({passthrough:true}) reply: FastifyReply) {
    reply.clearCookie(cookieName(), {path:'/'}); return this.access.logout(req.actor, true);
  }
}
@Module({ controllers: [AccessController], providers: [AccessService, SessionGuard], exports: [AccessService, SessionGuard] })
export class AccessModule {}

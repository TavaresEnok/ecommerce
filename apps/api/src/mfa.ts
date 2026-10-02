import { Body, Controller, ForbiddenException, Injectable, Module, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { newId } from '@ecommerce/database';
import { AccessModule, SessionGuard, type Actor, type AuthRequest } from './access.js';
import { Infrastructure, required } from './infrastructure.js';
import { digest, randomToken } from './security.js';
import { object, text } from './catalogue.js';
// TOTP (RFC 6238, SHA-1, 30 s, 6 dígitos) — compatível com aplicativos autenticadores comuns. Segredo cifrado (AES-256-GCM).
const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(buffer:Buffer){let bits='',out='';for(const byte of buffer)bits+=byte.toString(2).padStart(8,'0');for(let i=0;i<bits.length;i+=5)out+=ALPHABET[parseInt(bits.slice(i,i+5).padEnd(5,'0'),2)];return out;}
export function fromBase32(value:string){let bits='';for(const c of value.replace(/=+$/,'').toUpperCase()){const i=ALPHABET.indexOf(c);if(i<0)throw new Error('base32');bits+=i.toString(2).padStart(5,'0');}const bytes=[];for(let i=0;i+8<=bits.length;i+=8)bytes.push(parseInt(bits.slice(i,i+8),2));return Buffer.from(bytes);}
export function totp(secret:Buffer,step:number){const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(step));const h=createHmac('sha1',secret).update(counter).digest(),o=h[h.length-1]!&0xf;return ((h.readUInt32BE(o)&0x7fffffff)%1_000_000).toString().padStart(6,'0');}
const currentStep=(now=Date.now())=>Math.floor(now/30000);
const key=()=>{const k=Buffer.from(required('MFA_ENCRYPTION_KEY'),'hex');if(k.length!==32)throw new Error('MFA_ENCRYPTION_KEY must have 32 bytes');return k;};
function seal(value:string,aad:string){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key(),iv);c.setAAD(Buffer.from(aad));const body=Buffer.concat([c.update(value,'utf8'),c.final()]);return [iv,c.getAuthTag(),body].map(b=>b.toString('base64url')).join('.');}
function open(value:string,aad:string){const [iv,tag,body]=value.split('.').map(v=>Buffer.from(v,'base64url'));const d=createDecipheriv('aes-256-gcm',key(),iv!);d.setAAD(Buffer.from(aad));d.setAuthTag(tag!);return Buffer.concat([d.update(body!),d.final()]).toString('utf8');}
// Actions with financial, plan, domain or platform-wide effect require a session that completed MFA.
export function requireMfa(actor:Actor){if(!actor.mfaVerified)throw new ForbiddenException(actor.mfaEnabled?'Confirme o código do autenticador (MFA) nesta sessão.':'Ative a verificação em duas etapas (MFA) para esta ação.');}
@Injectable()
export class MfaService {
  constructor(private infra:Infrastructure){}
  async setup(actor:Actor){const [existing]=(await this.infra.access.pool.query('select enabled_at from access.mfa_factors where user_id=$1',[actor.id])).rows;if(existing?.enabled_at)throw new ForbiddenException('MFA já ativo.');
    const secret=base32(randomBytes(20));await this.infra.access.pool.query('insert into access.mfa_factors(user_id,secret_cipher) values($1,$2) on conflict(user_id) do update set secret_cipher=excluded.secret_cipher,last_used_step=0',[actor.id,seal(secret,`mfa:${actor.id}`)]);
    return {secret,otpauth:`otpauth://totp/E-commerce:${encodeURIComponent(actor.email)}?secret=${secret}&issuer=E-commerce&algorithm=SHA1&digits=6&period=30`};}
  // Accepts the current step ±1 and never the same step twice (replay protection).
  private async check(actor:Actor,code:string,requireEnabled:boolean){const client=await this.infra.access.pool.connect();try{await client.query('begin');
    const [f]=(await client.query('select secret_cipher,enabled_at,last_used_step from access.mfa_factors where user_id=$1 for update',[actor.id])).rows;if(!f||(requireEnabled&&!f.enabled_at))throw new UnauthorizedException('MFA não configurado.');
    const secret=fromBase32(open(f.secret_cipher,`mfa:${actor.id}`)),now=currentStep();let matched=0;
    if(/^\d{6}$/.test(code))for(const step of [now-1,now,now+1])if(step>Number(f.last_used_step)&&totp(secret,step)===code)matched=step;
    if(!matched){if(/^[A-Za-z0-9_-]{16}$/.test(code)&&f.enabled_at){const r=await client.query('update access.mfa_recovery_codes set used_at=now() where user_id=$1 and code_hash=$2 and used_at is null returning id',[actor.id,digest(code)]);if(r.rowCount){await client.query('commit');return 'RECOVERY';}}throw new UnauthorizedException('Código inválido.');}
    await client.query('update access.mfa_factors set last_used_step=$2 where user_id=$1',[actor.id,matched]);await client.query('commit');return 'TOTP';}catch(e){await client.query('rollback');throw e;}finally{client.release();}}
  async enable(actor:Actor,input:unknown){await this.check(actor,text(object(input).code,20),false);const codes=Array.from({length:10},()=>randomToken().slice(0,16));
    await this.infra.access.pool.query('update access.mfa_factors set enabled_at=coalesce(enabled_at,now()) where user_id=$1',[actor.id]);await this.infra.access.pool.query('update access.mfa_recovery_codes set used_at=now() where user_id=$1 and used_at is null',[actor.id]);
    for(const c of codes)await this.infra.access.pool.query('insert into access.mfa_recovery_codes(id,user_id,code_hash) values($1,$2,$3)',[newId(),actor.id,digest(c)]);
    await this.infra.access.pool.query('update access.sessions set mfa_at=now() where id=$1',[actor.sessionId]);
    return {enabled:true,recovery_codes:codes,message:'Guarde os códigos de recuperação; eles não serão exibidos novamente.'};}
  async verify(actor:Actor,input:unknown){const method=await this.check(actor,text(object(input).code,20),true);await this.infra.access.pool.query('update access.sessions set mfa_at=now() where id=$1',[actor.sessionId]);return {verified:true,method};}
}
@Controller('auth/mfa')
@UseGuards(SessionGuard)
class MfaController {constructor(private s:MfaService){}
 @Post('setup') setup(@Req() r:AuthRequest){return this.s.setup(r.actor);}
 @Post('enable') enable(@Req() r:AuthRequest,@Body() b:unknown){return this.s.enable(r.actor,b);}
 @Post('verify') verify(@Req() r:AuthRequest,@Body() b:unknown){return this.s.verify(r.actor,b);}
}
@Module({imports:[AccessModule],providers:[MfaService],controllers:[MfaController],exports:[MfaService]})
export class MfaModule{}

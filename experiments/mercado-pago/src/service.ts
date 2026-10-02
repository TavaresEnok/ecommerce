import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { MercadoPagoClient, ProviderError, ProviderTimeout, type PaymentFact } from './client.ts';
import { open, pkce, randomToken, seal, sha256, verifyWebhook } from './primitives.ts';
// Minimal isolated persistence (SQLite file). Proves behaviour after retry/restart without touching the product database.
const SCHEMA = `
create table if not exists sellers(label text primary key, environment text not null, seller_id text not null, access_cipher text not null, refresh_cipher text not null, expires_at text not null, status text not null check(status in ('CONNECTED','REVOKED')), connected_at text not null, unique(seller_id,environment));
create table if not exists oauth_states(state_hash text primary key, label text not null, verifier_cipher text not null, expires_at text not null, used_at text);
create table if not exists attempts(id text primary key, label text not null, method text not null check(method in ('PIX','CARD')), expected_cents text not null, currency text not null, idempotency_key text not null unique, status text not null check(status in ('PREPARED','UNKNOWN','PENDING','APPROVED','REJECTED','CANCELLED','EXPIRED','REFUNDED','CHARGED_BACK')), external_id text, raw_status text, created_at text not null);
create table if not exists transactions(seller_id text not null, environment text not null, external_id text not null, attempt_id text, amount_cents text not null, currency text not null, classification text not null check(classification in ('PRINCIPAL','EXCESS','INCOMPATIBLE')), status text not null, primary key(seller_id,environment,external_id));
create table if not exists refunds(seller_id text not null, external_id text not null, payment_id text not null, amount_cents text not null, status text not null, primary key(seller_id,external_id));
create table if not exists inbox(event_key text primary key, seller_id text, data_id text not null, topic text not null, received_at text not null, processed_at text, quarantine text);
create table if not exists incidents(key text primary key, attempt_id text, code text not null, detail text not null, created_at text not null);`;
export type Config = { client: MercadoPagoClient; dbPath: string; encryptionKey: Buffer; webhookSecret: string; commissionEnabled?: false; pixMinutes?: number };
export class PaymentPoc {
  readonly db: DatabaseSync; private cfg: Config;
  constructor(cfg: Config) { if ((cfg as { commissionEnabled?: boolean }).commissionEnabled) throw new Error('Comissão não homologada: permanece DESABILITADA'); this.cfg = cfg; this.db = new DatabaseSync(cfg.dbPath); this.db.exec('pragma journal_mode=wal; pragma synchronous=full;'); this.db.exec(SCHEMA); }
  close() { this.db.close(); }
  private tx<T>(fn: () => T): T { this.db.exec('begin immediate'); try { const r = fn(); this.db.exec('commit'); return r; } catch (e) { this.db.exec('rollback'); throw e; } }
  private incident(code: string, key: string, attemptId: string | null, detail: string) { this.db.prepare('insert or ignore into incidents(key,attempt_id,code,detail,created_at) values(?,?,?,?,?)').run(key, attemptId, code, detail, new Date().toISOString()); }
  // ---- OAuth: state is single-use, expires in 10 min, bound to the seller label; PKCE verifier sealed at rest.
  startOAuth(label: string) { const state = randomToken(), { verifier, challenge } = pkce(); this.db.prepare('insert into oauth_states(state_hash,label,verifier_cipher,expires_at) values(?,?,?,?)').run(sha256(state), label, seal(this.cfg.encryptionKey, verifier, `pkce:${label}`), new Date(Date.now() + 600_000).toISOString()); return { state, url: this.cfg.client.authorizeUrl(state, challenge) }; }
  async completeOAuth(state: string, code: string) {
    const row = this.db.prepare('select label,verifier_cipher,expires_at,used_at from oauth_states where state_hash=?').get(sha256(state)) as { label: string; verifier_cipher: string; expires_at: string; used_at: string | null } | undefined;
    if (!row || row.used_at || Date.parse(row.expires_at) < Date.now()) throw new Error('OAuth state inválido, expirado ou reutilizado');
    this.db.prepare('update oauth_states set used_at=? where state_hash=?').run(new Date().toISOString(), sha256(state));
    const grant = await this.cfg.client.exchange(code, open(this.cfg.encryptionKey, row.verifier_cipher, `pkce:${row.label}`));
    this.store(row.label, grant); return { label: row.label, sellerId: grant.sellerId, environment: grant.liveMode ? 'PRODUCTION' : 'SANDBOX' };
  }
  private store(label: string, g: { accessToken: string; refreshToken: string; sellerId: string; liveMode: boolean; expiresAt: Date }) {
    const env = g.liveMode ? 'PRODUCTION' : 'SANDBOX', aad = `${label}:${g.sellerId}:${env}`;
    const existing = this.db.prepare('select seller_id,environment from sellers where label=?').get(label) as { seller_id: string; environment: string } | undefined;
    if (existing && (existing.seller_id !== g.sellerId || existing.environment !== env)) throw new Error('Conta OAuth diferente da associada a este vendedor; reconexão explícita exigida');
    this.db.prepare(`insert into sellers(label,environment,seller_id,access_cipher,refresh_cipher,expires_at,status,connected_at) values(?,?,?,?,?,?,'CONNECTED',?) on conflict(label) do update set access_cipher=excluded.access_cipher,refresh_cipher=excluded.refresh_cipher,expires_at=excluded.expires_at,status='CONNECTED'`).run(label, env, g.sellerId, seal(this.cfg.encryptionKey, g.accessToken, aad), seal(this.cfg.encryptionKey, g.refreshToken, aad), g.expiresAt.toISOString(), new Date().toISOString());
  }
  seller(label: string) { const s = this.db.prepare('select * from sellers where label=?').get(label) as { label: string; environment: string; seller_id: string; access_cipher: string; refresh_cipher: string; expires_at: string; status: string } | undefined; if (!s) throw new Error('Vendedor não conectado'); return s; }
  private async token(label: string, requireConnected = true) {
    const s = this.seller(label); if (requireConnected && s.status !== 'CONNECTED') throw new Error('Conta revogada: novas cobranças bloqueadas');
    const aad = `${s.label}:${s.seller_id}:${s.environment}`;
    if (Date.parse(s.expires_at) - Date.now() < 7 * 86_400_000) { const g = await this.cfg.client.refresh(open(this.cfg.encryptionKey, s.refresh_cipher, aad)); this.store(label, g); return g.accessToken; }
    return open(this.cfg.encryptionKey, s.access_cipher, aad);
  }
  revoke(label: string) { this.db.prepare(`update sellers set status='REVOKED' where label=?`).run(label); }
  // ---- Charges: stable idempotency key per attempt; UNKNOWN is persisted before the network call.
  prepare(label: string, method: 'PIX' | 'CARD', expectedCents: bigint) { const s = this.seller(label); if (s.status !== 'CONNECTED') throw new Error('Conta revogada: novas cobranças bloqueadas'); const id = randomUUID(); this.db.prepare(`insert into attempts(id,label,method,expected_cents,currency,idempotency_key,status,created_at) values(?,?,?,?, 'BRL',?, 'PREPARED',?)`).run(id, label, method, expectedCents.toString(), `poc-${id}`, new Date().toISOString()); return id; }
  attempt(id: string) { return this.db.prepare('select * from attempts where id=?').get(id) as { id: string; label: string; method: 'PIX' | 'CARD'; expected_cents: string; idempotency_key: string; status: string; external_id: string | null }; }
  async send(id: string, payer: { email: string; cardToken?: string; paymentMethodId?: string; issuerId?: string }) {
    const a = this.attempt(id); if (!['PREPARED', 'UNKNOWN'].includes(a.status)) return a;
    if (a.status === 'UNKNOWN') { const found = await this.recover(id); if (found) return this.attempt(id); }
    for (const field of Object.keys(payer)) if (/card_?number|security_?code|cvv|pan/i.test(field)) throw new Error('PAN/CVV não podem entrar no servidor');
    const token = await this.token(a.label); this.db.prepare(`update attempts set status='UNKNOWN' where id=?`).run(id);
    const common = { amountCents: BigInt(a.expected_cents), reference: a.id, payerEmail: payer.email, description: `POC ${a.id.slice(0, 8)}`, idempotencyKey: a.idempotency_key };
    try { const fact = a.method === 'PIX' ? await this.cfg.client.createPix(token, { ...common, expiresAt: new Date(Date.now() + (this.cfg.pixMinutes ?? 30) * 60_000) }) : await this.cfg.client.createCard(token, { ...common, cardToken: payer.cardToken ?? '', paymentMethodId: payer.paymentMethodId ?? '', issuerId: payer.issuerId, installments: 1 }); this.reconcile(fact); }
    catch (e) { if (e instanceof ProviderTimeout) { this.incident('CREATE_UNKNOWN', `unknown-${id}`, id, e.message); return this.attempt(id); } if (e instanceof ProviderError && e.status >= 400 && e.status < 500) { this.db.prepare(`update attempts set status='REJECTED',raw_status=? where id=?`).run(`http_${e.status}`, id); return this.attempt(id); } throw e; }
    return this.attempt(id);
  }
  // Consults by external_reference before any retry; only then reuses the same idempotency key.
  async recover(id: string) { const a = this.attempt(id); const facts = await this.cfg.client.search(await this.token(a.label, false), a.id); for (const f of facts) this.reconcile(f); return facts.length > 0; }
  // ---- Webhook: authenticity → durable inbox → 200. Processing happens later with an authoritative GET.
  receiveWebhook(h: { signature?: string; requestId?: string }, query: Record<string, string | undefined>, body: any) {
    const dataId = query['data.id'] ?? body?.data?.id?.toString(), topic = query.type ?? body?.type ?? 'unknown';
    const check = verifyWebhook(this.cfg.webhookSecret, h.signature, h.requestId, dataId);
    if (!check.ok) return { status: 401, reason: check.reason };
    if (!dataId) return { status: 400, reason: 'missing data.id' };
    const key = `${topic}:${body?.id ?? h.requestId}`;
    this.db.prepare('insert or ignore into inbox(event_key,seller_id,data_id,topic,received_at) values(?,?,?,?,?)').run(key, body?.user_id != null ? String(body.user_id) : null, String(dataId), topic, new Date().toISOString());
    return { status: 200 };
  }
  async processInbox() {
    const pending = this.db.prepare('select * from inbox where processed_at is null order by received_at').all() as { event_key: string; seller_id: string | null; data_id: string; topic: string }[];
    for (const e of pending) {
      const s = e.seller_id ? this.db.prepare('select label from sellers where seller_id=?').get(e.seller_id) as { label: string } | undefined : undefined;
      if (e.topic !== 'payment' || !s) { this.db.prepare('update inbox set processed_at=?,quarantine=? where event_key=?').run(new Date().toISOString(), e.topic !== 'payment' ? 'UNSUPPORTED_TOPIC' : 'UNKNOWN_SELLER', e.event_key); continue; }
      const fact = await this.cfg.client.get(await this.token(s.label, false), e.data_id);
      this.reconcile(fact); this.db.prepare('update inbox set processed_at=? where event_key=?').run(new Date().toISOString(), e.event_key);
    }
  }
  // ---- Reconciliation: seller, environment, reference, amount and currency are checked before choosing a principal.
  reconcile(f: PaymentFact) {
    return this.tx(() => {
      const a = f.reference ? this.db.prepare('select a.*,s.seller_id,s.environment from attempts a join sellers s on s.label=a.label where a.id=?').get(f.reference) as any : undefined;
      const env = f.liveMode ? 'PRODUCTION' : 'SANDBOX';
      if (!a || a.seller_id !== f.sellerId || a.environment !== env) { this.incident('IDENTITY_MISMATCH', `identity-${f.sellerId}-${f.id}`, a?.id ?? null, `payment ${f.id} seller ${f.sellerId} env ${env}`); return 'QUARANTINED'; }
      const statusMap: Record<string, string> = { approved: 'APPROVED', authorized: 'PENDING', pending: 'PENDING', in_process: 'PENDING', in_mediation: 'PENDING', rejected: 'REJECTED', cancelled: 'CANCELLED', refunded: 'REFUNDED', charged_back: 'CHARGED_BACK', expired: 'EXPIRED' };
      const status = statusMap[f.status] ?? 'UNKNOWN', approved = ['APPROVED', 'REFUNDED', 'CHARGED_BACK'].includes(status) || f.approvedAt != null;
      // Older events never regress an approved attempt.
      this.db.prepare(`update attempts set status=case when status in ('APPROVED','REFUNDED','CHARGED_BACK') and ? not in ('REFUNDED','CHARGED_BACK') then status else ? end,external_id=?,raw_status=? where id=?`).run(status, status === 'UNKNOWN' ? 'PENDING' : status, f.id, f.status, a.id);
      if (approved) {
        const compatible = f.currency === 'BRL' && f.amountCents === BigInt(a.expected_cents);
        const principal = this.db.prepare(`select 1 from transactions where attempt_id in (select id from attempts where label=? and id=?) and classification='PRINCIPAL'`).get(a.label, a.id);
        const classification = !compatible ? 'INCOMPATIBLE' : principal ? 'EXCESS' : 'PRINCIPAL';
        this.db.prepare('insert into transactions(seller_id,environment,external_id,attempt_id,amount_cents,currency,classification,status) values(?,?,?,?,?,?,?,?) on conflict do update set status=excluded.status').run(f.sellerId, env, f.id, a.id, f.amountCents.toString(), f.currency, classification, f.status);
        if (!compatible) this.incident('VALUE_MISMATCH', `value-${f.id}`, a.id, `expected ${a.expected_cents} ${a.currency}, got ${f.amountCents} ${f.currency}`);
      }
      for (const r of f.refunds) this.db.prepare('insert into refunds(seller_id,external_id,payment_id,amount_cents,status) values(?,?,?,?,?) on conflict do update set status=excluded.status').run(f.sellerId, r.id, f.id, r.amountCents.toString(), r.status);
      return status;
    });
  }
  refundedCents(paymentId: string) { const r = this.db.prepare(`select coalesce(sum(cast(amount_cents as integer)),0) as total from refunds where payment_id=? and status='approved'`).get(paymentId) as { total: number }; return BigInt(r.total); }
}

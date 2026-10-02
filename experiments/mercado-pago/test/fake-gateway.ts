import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { centsToDecimal, decimalToCents, parseProviderJson, signWebhook } from '../src/primitives.ts';
// SIMULATED Mercado Pago (Payments v1 + OAuth) for local tests only. It is not sandbox and proves code paths, not provider behaviour.
type Payment = { id: string; collector_id: string; live_mode: boolean; status: string; external_reference: string; amountCents: bigint; currency_id: string; payment_method_id: string; date_approved: string | null; refunds: { id: string; amountCents: bigint; status: string }[] };
export class FakeGateway {
  server!: Server; url = ''; payments = new Map<string, Payment>(); idempotency = new Map<string, string>(); tokens = new Map<string, { seller: string; live: boolean }>(); codes = new Map<string, { seller: string; live: boolean; challenge?: string }>();
  dropNextCreateResponse = false; failNextCreateBeforeProvider = false; nextId = 1000; createdCount = 0; lastCreateBody: any = null;
  async start() { this.server = createServer((req, res) => { let raw = ''; req.on('data', c => raw += c); req.on('end', () => this.handle(req.method!, new URL(req.url!, 'http://x'), req.headers, raw, res)); }); await new Promise<void>(r => this.server.listen(0, '127.0.0.1', r)); this.url = `http://127.0.0.1:${(this.server.address() as { port: number }).port}`; return this; }
  stop() { this.server.closeAllConnections(); return new Promise(r => this.server.close(r)); }
  issueCode(seller: string, live = false) { const code = `TG-${randomUUID()}`; this.codes.set(code, { seller, live }); return code; }
  private json(res: any, status: number, body: unknown) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); }
  private serialize(p: Payment) { return `{"id":${p.id},"collector_id":${p.collector_id},"live_mode":${p.live_mode},"status":"${p.status}","external_reference":"${p.external_reference}","transaction_amount":${centsToDecimal(p.amountCents)},"currency_id":"${p.currency_id}","payment_method_id":"${p.payment_method_id}","date_approved":${p.date_approved ? `"${p.date_approved}"` : 'null'},"refunds":[${p.refunds.map(r => `{"id":${r.id},"amount":${centsToDecimal(r.amountCents)},"status":"${r.status}"}`).join(',')}]}`; }
  private handle(method: string, url: URL, headers: any, raw: string, res: any) {
    if (url.pathname === '/oauth/token' && method === 'POST') { const b = JSON.parse(raw); let s: { seller: string; live: boolean } | undefined;
      if (b.grant_type === 'authorization_code') { s = this.codes.get(b.code); this.codes.delete(b.code); if (!b.code_verifier) s = undefined; }
      else if (b.grant_type === 'refresh_token') s = this.tokens.get(`refresh:${b.refresh_token}`);
      if (!s) return this.json(res, 400, { error: 'invalid_grant' });
      const access = `APP_USR-${randomUUID()}`, refresh = `TG-${randomUUID()}`; this.tokens.set(access, s); this.tokens.set(`refresh:${refresh}`, s);
      return this.json(res, 200, { access_token: access, refresh_token: refresh, user_id: Number(s.seller), expires_in: 15552000, live_mode: s.live, public_key: 'APP_USR-public' }); }
    const auth = this.tokens.get(String(headers.authorization ?? '').replace('Bearer ', ''));
    if (!auth) return this.json(res, 401, { message: 'invalid token' });
    if (url.pathname === '/v1/payments' && method === 'POST') {
      if (this.failNextCreateBeforeProvider) { this.failNextCreateBeforeProvider = false; return res.destroy(); }
      const key = String(headers['x-idempotency-key'] ?? ''); if (!key) return this.json(res, 400, { message: 'idempotency key required' });
      const scoped = `${auth.seller}:${key}`; let id = this.idempotency.get(scoped);
      if (!id) { const b = parseProviderJson(raw); this.lastCreateBody = b; if (b.card_number || b.security_code) return this.json(res, 400, { message: 'raw card data rejected' }); id = String(this.nextId++); this.createdCount++;
        this.payments.set(id, { id, collector_id: auth.seller, live_mode: auth.live, status: b.payment_method_id === 'pix' ? 'pending' : 'approved', external_reference: b.external_reference, amountCents: decimalToCents(String(b.transaction_amount)), currency_id: 'BRL', payment_method_id: b.payment_method_id, date_approved: b.payment_method_id === 'pix' ? null : new Date().toISOString(), refunds: [] }); this.idempotency.set(scoped, id); }
      if (this.dropNextCreateResponse) { this.dropNextCreateResponse = false; return res.destroy(); }
      return this.json(res, 201, this.serialize(this.payments.get(id)!)); }
    if (url.pathname === '/v1/payments/search') { const results = [...this.payments.values()].filter(p => p.collector_id === auth.seller && p.external_reference === url.searchParams.get('external_reference')); return this.json(res, 200, `{"results":[${results.map(p => this.serialize(p)).join(',')}]}`); }
    const m = /^\/v1\/payments\/(\d+)(\/refunds)?$/.exec(url.pathname); const p = m ? this.payments.get(m[1]!) : undefined;
    if (!p || p.collector_id !== auth.seller) return this.json(res, 404, { message: 'not found' });
    if (m![2]) return this.json(res, 200, `[${p.refunds.map(r => `{"id":${r.id},"amount":${centsToDecimal(r.amountCents)},"status":"${r.status}"}`).join(',')}]`);
    return this.json(res, 200, this.serialize(p));
  }
  // Provider-side actions (in reality done by the buyer or in the seller dashboard).
  approve(id: string) { const p = this.payments.get(id)!; p.status = 'approved'; p.date_approved = new Date().toISOString(); }
  refund(id: string, cents: bigint) { const p = this.payments.get(id)!; p.refunds.push({ id: String(this.nextId++), amountCents: cents, status: 'approved' }); if (p.refunds.reduce((s, r) => s + r.amountCents, 0n) >= p.amountCents) p.status = 'refunded'; }
  tamper(id: string, patch: Partial<Payment>) { Object.assign(this.payments.get(id)!, patch); }
  webhook(secret: string, id: string, seller: string, opts: { eventId?: string; requestId?: string; ts?: string; badSignature?: boolean } = {}) { const requestId = opts.requestId ?? randomUUID(), ts = opts.ts ?? String(Math.floor(Date.now() / 1000)); const v1 = opts.badSignature ? '0'.repeat(64) : signWebhook(secret, id, requestId, ts); return { headers: { signature: `ts=${ts},v1=${v1}`, requestId }, query: { 'data.id': id, type: 'payment' }, body: { id: opts.eventId ?? Number(String(Date.now()).slice(-9)), type: 'payment', action: 'payment.updated', user_id: Number(seller), data: { id } } }; }
}

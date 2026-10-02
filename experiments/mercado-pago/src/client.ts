import { decimalToCents, jsonWithAmount, parseProviderJson } from './primitives.ts';
// Payments v1 (Checkout Transparente) + OAuth. Never Orders or Checkout Pro in the same flow.
export type Fetch = typeof fetch;
export type ClientConfig = { apiBase?: string; authBase?: string; clientId: string; clientSecret: string; redirectUri: string; timeoutMs?: number; fetch?: Fetch };
export class ProviderTimeout extends Error { path: string; constructor(path: string) { super(`Provider timeout on ${path}; result UNKNOWN`); this.path = path; } }
export class ProviderError extends Error { status: number; body: unknown; constructor(status: number, body: unknown) { super(`Provider HTTP ${status}`); this.status = status; this.body = body; } }
export type Grant = { accessToken: string; refreshToken: string; sellerId: string; liveMode: boolean; expiresAt: Date; publicKey: string | null };
export type PaymentFact = { id: string; status: string; statusDetail: string | null; reference: string | null; sellerId: string; liveMode: boolean; amountCents: bigint; currency: string; methodId: string; approvedAt: string | null; refunds: { id: string; amountCents: bigint; status: string }[]; raw: Record<string, unknown> };
export class MercadoPagoClient {
  readonly apiBase: string; readonly authBase: string; private f: Fetch; private c: ClientConfig;
  constructor(c: ClientConfig) { this.c = c; this.apiBase = c.apiBase ?? 'https://api.mercadopago.com'; this.authBase = c.authBase ?? 'https://auth.mercadopago.com.br'; this.f = c.fetch ?? fetch; }
  authorizeUrl(state: string, challenge: string) {
    if (!/^https:\/\//.test(this.c.redirectUri) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(this.c.redirectUri)) throw new Error('redirect_uri must be HTTPS');
    const u = new URL('/authorization', this.authBase);
    for (const [k, v] of Object.entries({ client_id: this.c.clientId, response_type: 'code', platform_id: 'mp', state, redirect_uri: this.c.redirectUri, code_challenge: challenge, code_challenge_method: 'S256' })) u.searchParams.set(k, v);
    return u.toString();
  }
  private async call(path: string, init: { method?: string; token?: string; body?: string; idempotencyKey?: string }) {
    let response: Response;
    try { response = await this.f(new URL(path, this.apiBase), { method: init.method ?? 'GET', signal: AbortSignal.timeout(this.c.timeoutMs ?? 10_000), headers: { 'Content-Type': 'application/json', ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}), ...(init.idempotencyKey ? { 'X-Idempotency-Key': init.idempotencyKey } : {}) }, body: init.body }); }
    catch (error) { if ((error as Error).name === 'TimeoutError' || (error as Error).name === 'AbortError' || (error as { cause?: { code?: string } }).cause?.code === 'UND_ERR_SOCKET' || (error as Error).message === 'fetch failed') throw new ProviderTimeout(path); throw error; }
    const text = await response.text(); const body = text ? parseProviderJson(text) : null;
    if (!response.ok) throw new ProviderError(response.status, body); return body;
  }
  private grant(raw: any): Grant { if (!raw?.access_token || !raw.refresh_token || raw.user_id == null || !Number.isSafeInteger(Number(raw.expires_in))) throw new Error('Invalid OAuth response'); return { accessToken: String(raw.access_token), refreshToken: String(raw.refresh_token), sellerId: String(raw.user_id), liveMode: Boolean(raw.live_mode), expiresAt: new Date(Date.now() + Number(raw.expires_in) * 1000), publicKey: raw.public_key ? String(raw.public_key) : null }; }
  async exchange(code: string, verifier: string) { return this.grant(await this.call('/oauth/token', { method: 'POST', body: JSON.stringify({ client_id: this.c.clientId, client_secret: this.c.clientSecret, grant_type: 'authorization_code', code, redirect_uri: this.c.redirectUri, code_verifier: verifier }) })); }
  async refresh(refreshToken: string) { return this.grant(await this.call('/oauth/token', { method: 'POST', body: JSON.stringify({ client_id: this.c.clientId, client_secret: this.c.clientSecret, grant_type: 'refresh_token', refresh_token: refreshToken }) })); }
  fact(raw: any): PaymentFact {
    if (raw?.id == null || raw.collector_id == null || typeof raw.live_mode !== 'boolean' || raw.transaction_amount == null || !raw.currency_id) throw new Error('Incomplete authoritative payment');
    return { id: String(raw.id), status: String(raw.status), statusDetail: raw.status_detail ?? null, reference: raw.external_reference ?? null, sellerId: String(raw.collector_id), liveMode: raw.live_mode, amountCents: decimalToCents(String(raw.transaction_amount)), currency: String(raw.currency_id), methodId: String(raw.payment_method_id ?? ''), approvedAt: raw.date_approved ?? null, refunds: (raw.refunds ?? []).map((r: any) => ({ id: String(r.id), amountCents: decimalToCents(String(r.amount)), status: String(r.status) })), raw };
  }
  async createPix(token: string, a: { amountCents: bigint; reference: string; payerEmail: string; description: string; expiresAt: Date; idempotencyKey: string }) {
    const body = jsonWithAmount({ description: a.description, payment_method_id: 'pix', payer: { email: a.payerEmail }, external_reference: a.reference, date_of_expiration: a.expiresAt.toISOString() }, a.amountCents);
    return this.fact(await this.call('/v1/payments', { method: 'POST', token, body, idempotencyKey: a.idempotencyKey }));
  }
  async createCard(token: string, a: { amountCents: bigint; reference: string; payerEmail: string; description: string; cardToken: string; paymentMethodId: string; issuerId?: string; installments: number; idempotencyKey: string }) {
    const body = jsonWithAmount({ description: a.description, token: a.cardToken, installments: a.installments, payment_method_id: a.paymentMethodId, ...(a.issuerId ? { issuer_id: a.issuerId } : {}), payer: { email: a.payerEmail }, external_reference: a.reference }, a.amountCents);
    return this.fact(await this.call('/v1/payments', { method: 'POST', token, body, idempotencyKey: a.idempotencyKey }));
  }
  async get(token: string, id: string) { return this.fact(await this.call(`/v1/payments/${encodeURIComponent(id)}`, { token })); }
  async search(token: string, reference: string) { const raw = await this.call(`/v1/payments/search?external_reference=${encodeURIComponent(reference)}&sort=date_created&criteria=asc`, { token }); return (raw?.results ?? []).map((r: unknown) => this.fact(r)); }
  async refunds(token: string, id: string) { const raw = await this.call(`/v1/payments/${encodeURIComponent(id)}/refunds`, { token }); return (raw ?? []).map((r: any) => ({ id: String(r.id), amountCents: decimalToCents(String(r.amount)), status: String(r.status) })); }
}

// Manual homologation server for the Mercado Pago TEST environment. Never started by verify.mjs.
// Requires an HTTPS public URL (tunnel) configured as redirect_uri and webhook URL in the MP application.
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { MercadoPagoClient } from './client.ts';
import { PaymentPoc } from './service.ts';
const need = (n: string) => { const v = process.env[n]; if (!v) { console.error(`Variável ${n} ausente (veja .env.example).`); process.exit(2); } return v; };
if (process.env.MP_ENVIRONMENT !== 'SANDBOX') { console.error('MP_ENVIRONMENT=SANDBOX é obrigatório: esta POC não opera produção.'); process.exit(2); }
const client = new MercadoPagoClient({ clientId: need('MP_CLIENT_ID'), clientSecret: need('MP_CLIENT_SECRET'), redirectUri: need('MP_REDIRECT_URI') });
const key = Buffer.from(need('POC_ENCRYPTION_KEY'), 'hex'); mkdirSync('.local', { recursive: true });
const poc = new PaymentPoc({ client, dbPath: '.local/poc.sqlite', encryptionKey: key, webhookSecret: need('MP_WEBHOOK_SECRET') });
const evidenceFile = 'evidence/external.json';
// Evidence holds capability, method, environment, date and provider ids — never tokens, payer data or secrets.
function record(capability: string, method: string, result: string, reference: string) { mkdirSync('evidence', { recursive: true }); const e = existsSync(evidenceFile) ? JSON.parse(readFileSync(evidenceFile, 'utf8')) : { environment: 'SANDBOX', operator: process.env.POC_OPERATOR ?? 'não informado', items: [] }; e.items.push({ capability, method, result, reference, at: new Date().toISOString() }); writeFileSync(evidenceFile, JSON.stringify(e, null, 2)); }
const json = (res: any, status: number, body: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); res.end(JSON.stringify(body)); };
createServer((req, res) => { let raw = ''; req.on('data', c => raw += c); req.on('end', async () => {
  const url = new URL(req.url!, 'http://local');
  try {
    if (url.pathname === '/oauth/start') { const label = url.searchParams.get('seller') ?? ''; if (!/^[a-z0-9-]{1,40}$/.test(label)) return json(res, 400, { error: 'seller' }); res.writeHead(302, { Location: poc.startOAuth(label).url }); return res.end(); }
    if (url.pathname === '/oauth/callback') { const r = await poc.completeOAuth(url.searchParams.get('state') ?? '', url.searchParams.get('code') ?? ''); record('OAUTH_CONNECT', '-', 'OK', `${r.label}:${r.sellerId}:${r.environment}`); return json(res, 200, r); }
    if (url.pathname === '/webhooks/mercadopago' && req.method === 'POST') { const r = poc.receiveWebhook({ signature: req.headers['x-signature'] as string, requestId: req.headers['x-request-id'] as string }, Object.fromEntries(url.searchParams), raw ? JSON.parse(raw) : {}); json(res, r.status, { received: r.status === 200 }); if (r.status === 200) { await poc.processInbox(); record('WEBHOOK_SIGNED', '-', 'OK', String(url.searchParams.get('data.id'))); } else record('WEBHOOK_REJECTED', '-', String(r.reason), '-'); return; }
    // Local-only control endpoints (bind to 127.0.0.1); amounts in integer cents.
    if (req.socket.remoteAddress !== '127.0.0.1' && req.socket.remoteAddress !== '::ffff:127.0.0.1') return json(res, 404, {});
    if (url.pathname === '/charge' && req.method === 'POST') { const b = JSON.parse(raw); const id = poc.prepare(b.seller, b.method, BigInt(b.amount_cents)); const a = await poc.send(id, { email: b.payer_email, cardToken: b.card_token, paymentMethodId: b.payment_method_id }); record(`CREATE_${b.method}`, b.method, a.status, `${b.seller}:${a.external_id ?? 'sem-id'}`); return json(res, 200, a); }
    if (url.pathname === '/recover' && req.method === 'POST') { const b = JSON.parse(raw); await poc.recover(b.attempt); const a = poc.attempt(b.attempt); record('QUERY_BY_REFERENCE', a.method, a.status, `${a.label}:${a.external_id}`); const refunded = a.external_id ? poc.refundedCents(a.external_id) : 0n; if (refunded > 0n) record('REFUND_READ', a.method, `${refunded} centavos`, `${a.label}:${a.external_id}`); return json(res, 200, { attempt: a, refunded_cents: a.external_id ? poc.refundedCents(a.external_id).toString() : '0' }); }
    if (url.pathname === '/revoke' && req.method === 'POST') { const b = JSON.parse(raw); poc.revoke(b.seller); record('ACCOUNT_REVOKED_BLOCKS_NEW', '-', 'OK', b.seller); return json(res, 200, { revoked: b.seller }); }
    json(res, 404, {});
  } catch (e) { json(res, 500, { error: (e as Error).message }); }
}); }).listen(Number(process.env.PORT ?? 8787), process.env.HOST ?? '127.0.0.1', () => console.log(`POC Mercado Pago (SANDBOX) em http://127.0.0.1:${process.env.PORT ?? 8787}`));

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { MercadoPagoClient } from '../src/client.ts';
import { PaymentPoc } from '../src/service.ts';
import { decimalToCents, centsToDecimal, jsonWithAmount, parseProviderJson, verifyWebhook, webhookManifest, signWebhook } from '../src/primitives.ts';
import { FakeGateway } from './fake-gateway.ts';
// All tests use the SIMULATED gateway in test/fake-gateway.ts; none of them is external evidence.
const SECRET = 'webhook-secret-test', KEY = randomBytes(32);
async function setup() {
  const gw = await new FakeGateway().start(), dir = mkdtempSync(join(tmpdir(), 'mp-poc-')), dbPath = join(dir, 'poc.sqlite');
  const client = new MercadoPagoClient({ apiBase: gw.url, authBase: 'https://auth.mercadopago.com.br', clientId: 'APP', clientSecret: 'secret', redirectUri: 'https://pilot.example.test/oauth/callback', timeoutMs: 1500 });
  const make = () => new PaymentPoc({ client, dbPath, encryptionKey: KEY, webhookSecret: SECRET });
  let poc = make();
  const connect = async (label: string, seller: string) => { const { state, url } = poc.startOAuth(label); const u = new URL(url); assert.equal(u.searchParams.get('state'), state); assert.equal(u.searchParams.get('code_challenge_method'), 'S256'); return poc.completeOAuth(state, gw.issueCode(seller)); };
  return { gw, client, get poc() { return poc; }, restart() { poc.close(); poc = make(); return poc; }, connect, async done() { poc.close(); await gw.stop(); rmSync(dir, { recursive: true, force: true }); } };
}
test('Dinheiro: centavos inteiros sem float, inclusive no JSON do provedor', () => {
  assert.equal(decimalToCents('19.9'), 1990n); assert.equal(decimalToCents('0.07'), 7n); assert.equal(centsToDecimal(100000000000000001n), '1000000000000000.01');
  assert.equal(parseProviderJson('{"transaction_amount":1000000000000000.01}').transaction_amount, '1000000000000000.01');
  assert.equal(jsonWithAmount({ a: 1 }, 1990n), '{"a":1,"transaction_amount":19.90}'); assert.throws(() => decimalToCents('1.234'));
});
test('Webhook: manifesto oficial, ts em segundos/ms, janela e comparação constante', () => {
  assert.equal(webhookManifest('ABC123', 'req-1', '1704908010'), 'id:abc123;request-id:req-1;ts:1704908010;'); assert.equal(webhookManifest(undefined, 'r', '1'), 'request-id:r;ts:1;');
  const ts = String(Math.floor(Date.now() / 1000)), v1 = signWebhook(SECRET, '123', 'req', ts);
  assert.equal(verifyWebhook(SECRET, `ts=${ts},v1=${v1}`, 'req', '123').ok, true);
  assert.equal(verifyWebhook(SECRET, `ts=${ts},v1=${v1}`, 'req', '124').ok, false);
  assert.equal(verifyWebhook('other', `ts=${ts},v1=${v1}`, 'req', '123').ok, false);
  assert.equal(verifyWebhook(SECRET, `ts=${Number(ts) - 3600},v1=${signWebhook(SECRET, '123', 'req', String(Number(ts) - 3600))}`, 'req', '123').reason, 'stale');
});
test('OAuth: dois vendedores, state único/expirável, PKCE, tokens cifrados, renovação e revogação', async () => {
  const s = await setup();
  try {
    const a = await s.connect('loja-a', '111'), b = await s.connect('loja-b', '222');
    assert.deepEqual([a.sellerId, b.sellerId, a.environment], ['111', '222', 'SANDBOX']);
    const stored = s.poc.seller('loja-a'); assert.ok(!stored.access_cipher.includes('APP_USR')); assert.ok(!JSON.stringify(stored).includes('TG-'));
    const { state } = s.poc.startOAuth('loja-a'); const code = s.gw.issueCode('111'); await s.poc.completeOAuth(state, code); await assert.rejects(s.poc.completeOAuth(state, s.gw.issueCode('111')), /reutilizado/);
    const other = s.poc.startOAuth('loja-a'); await assert.rejects(s.poc.completeOAuth(other.state, s.gw.issueCode('999')), /Conta OAuth diferente/);
    s.poc.db.prepare('update sellers set expires_at=? where label=?').run(new Date(Date.now() + 86_400_000).toISOString(), 'loja-b');
    const before = s.poc.seller('loja-b').access_cipher; const id = s.poc.prepare('loja-b', 'PIX', 1000n); await s.poc.send(id, { email: 'buyer@example.test' }); assert.notEqual(s.poc.seller('loja-b').access_cipher, before);
    s.poc.revoke('loja-a'); assert.throws(() => s.poc.prepare('loja-a', 'PIX', 1000n), /revogada/);
    assert.throws(() => new PaymentPoc({ client: s.client, dbPath: ':memory:', encryptionKey: KEY, webhookSecret: SECRET, commissionEnabled: true } as never), /DESABILITADA/);
  } finally { await s.done(); }
});
test('Pix e cartão por vendedor: valor/ref/idempotência; cartão só com token; sem application_fee', async () => {
  const s = await setup();
  try {
    await s.connect('loja-a', '111'); await s.connect('loja-b', '222');
    const pix = s.poc.prepare('loja-a', 'PIX', 12345n); assert.equal((await s.poc.send(pix, { email: 'c@example.test' })).status, 'PENDING');
    assert.match(s.gw.lastCreateBody.date_of_expiration, /T/); assert.equal(s.gw.lastCreateBody.transaction_amount, '123.45'); assert.equal(s.gw.lastCreateBody.application_fee, undefined);
    const card = s.poc.prepare('loja-b', 'CARD', 5000n); assert.equal((await s.poc.send(card, { email: 'c@example.test', cardToken: 'tok_from_bricks', paymentMethodId: 'master' })).status, 'APPROVED');
    const p = s.gw.payments.get(s.poc.attempt(card).external_id!)!; assert.equal(p.collector_id, '222');
    const raw = s.poc.prepare('loja-b', 'CARD', 5000n); await assert.rejects(s.poc.send(raw, { email: 'c@example.test', card_number: '4111' } as never), /PAN\/CVV/);
    assert.equal(s.gw.createdCount, 2);
  } finally { await s.done(); }
});
test('Timeout após criação e falha antes do provedor: UNKNOWN, consulta e mesma chave — uma cobrança', async () => {
  const s = await setup();
  try {
    await s.connect('loja-a', '111');
    const lost = s.poc.prepare('loja-a', 'PIX', 1000n); s.gw.dropNextCreateResponse = true;
    assert.equal((await s.poc.send(lost, { email: 'c@example.test' })).status, 'UNKNOWN'); assert.equal(s.gw.createdCount, 1);
    s.restart(); assert.equal((await s.poc.send(lost, { email: 'c@example.test' })).status, 'PENDING'); assert.equal(s.gw.createdCount, 1);
    const never = s.poc.prepare('loja-a', 'PIX', 1000n); s.gw.failNextCreateBeforeProvider = true;
    assert.equal((await s.poc.send(never, { email: 'c@example.test' })).status, 'UNKNOWN'); assert.equal(s.gw.createdCount, 1);
    assert.equal((await s.poc.send(never, { email: 'c@example.test' })).status, 'PENDING'); assert.equal((await s.poc.send(never, { email: 'c@example.test' })).status, 'PENDING'); assert.equal(s.gw.createdCount, 2);
  } finally { await s.done(); }
});
test('Webhook: inbox durável, repetição, atraso/fora de ordem, assinatura inválida, vendedor/valor incompatíveis, reinício', async () => {
  const s = await setup();
  try {
    await s.connect('loja-a', '111'); await s.connect('loja-b', '222');
    const id = s.poc.prepare('loja-a', 'PIX', 2000n); await s.poc.send(id, { email: 'c@example.test' }); const pid = s.poc.attempt(id).external_id!;
    const pendingEvent = s.gw.webhook(SECRET, pid, '111', { eventId: '1' }); s.gw.approve(pid); const approvedEvent = s.gw.webhook(SECRET, pid, '111', { eventId: '2' });
    for (const e of [approvedEvent, approvedEvent, pendingEvent]) assert.equal(s.poc.receiveWebhook(e.headers, e.query, e.body).status, 200);
    assert.equal((s.poc.db.prepare('select count(*) as n from inbox').get() as { n: number }).n, 2);
    assert.equal(s.poc.receiveWebhook(s.gw.webhook(SECRET, pid, '111', { badSignature: true }).headers, { 'data.id': pid, type: 'payment' }, {}).status, 401);
    const forged = s.gw.webhook(SECRET, pid, '111'); assert.equal(s.poc.receiveWebhook(forged.headers, { 'data.id': '999999', type: 'payment' }, forged.body).status, 401);
    s.restart(); await s.poc.processInbox();
    assert.equal(s.poc.attempt(id).status, 'APPROVED'); assert.equal((s.poc.db.prepare('select count(*) as n from transactions').get() as { n: number }).n, 1);
    const wrongValue = s.poc.prepare('loja-b', 'PIX', 3000n); await s.poc.send(wrongValue, { email: 'c@example.test' }); const wid = s.poc.attempt(wrongValue).external_id!; s.gw.tamper(wid, { amountCents: 2999n }); s.gw.approve(wid);
    const ev = s.gw.webhook(SECRET, wid, '222'); s.poc.receiveWebhook(ev.headers, ev.query, ev.body); await s.poc.processInbox();
    assert.equal((s.poc.db.prepare('select classification from transactions where external_id=?').get(wid) as { classification: string }).classification, 'INCOMPATIBLE');
    const foreign = s.poc.prepare('loja-a', 'PIX', 1000n); await s.poc.send(foreign, { email: 'c@example.test' }); const fid = s.poc.attempt(foreign).external_id!; s.gw.tamper(fid, { collector_id: '222' });
    const fev = s.gw.webhook(SECRET, fid, '222'); s.poc.receiveWebhook(fev.headers, fev.query, fev.body); await s.poc.processInbox();
    assert.ok(s.poc.db.prepare(`select 1 from incidents where code='IDENTITY_MISMATCH'`).get()); assert.equal(s.poc.db.prepare('select 1 from transactions where external_id=?').get(fid), undefined);
  } finally { await s.done(); }
});
test('Devolução executada no painel (simulado): leitura parcial/total, repetida, sem iniciar estorno pela POC', async () => {
  const s = await setup();
  try {
    await s.connect('loja-a', '111'); const id = s.poc.prepare('loja-a', 'CARD', 10000n); await s.poc.send(id, { email: 'c@example.test', cardToken: 'tok', paymentMethodId: 'visa' }); const pid = s.poc.attempt(id).external_id!;
    s.gw.refund(pid, 2500n); for (let i = 0; i < 2; i++) { const e = s.gw.webhook(SECRET, pid, '111'); s.poc.receiveWebhook(e.headers, e.query, e.body); await s.poc.processInbox(); }
    assert.equal(s.poc.refundedCents(pid), 2500n); assert.equal(s.poc.attempt(id).status, 'APPROVED');
    s.gw.refund(pid, 7500n); await s.poc.recover(id); assert.equal(s.poc.refundedCents(pid), 10000n); assert.equal(s.poc.attempt(id).status, 'REFUNDED');
    assert.equal(typeof (s.poc as unknown as Record<string, unknown>).refund, 'undefined');
  } finally { await s.done(); }
});

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
// Money never passes through IEEE754: provider decimals are parsed as strings into integer cents.
export function decimalToCents(value: string): bigint { if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error(`Unsupported monetary value ${value}`); const [whole, fraction = ''] = value.split('.'); return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0')); }
export function centsToDecimal(cents: bigint): string { if (cents < 0n) throw new Error('Negative amount'); return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`; }
const MONEY_FIELDS = ['transaction_amount', 'amount', 'amount_refunded', 'transaction_amount_refunded', 'net_received_amount', 'total_paid_amount', 'application_fee'];
export function parseProviderJson(raw: string): any { const pattern = new RegExp(`("(?:${MONEY_FIELDS.join('|')})"\\s*:\\s*)(-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)`, 'g'); return JSON.parse(raw.replace(pattern, '$1"$2"')); }
// Body is built by hand so the amount is serialized from integer cents, not from a JS number.
export function jsonWithAmount(body: Record<string, unknown>, amountCents: bigint) { const json = JSON.stringify({ ...body, transaction_amount: '__AMOUNT__' }); return json.replace('"__AMOUNT__"', centsToDecimal(amountCents)); }
export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export function pkce() { const verifier = randomToken(48); return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }; }
export function seal(key: Buffer, value: string, aad: string) { if (key.length !== 32) throw new Error('Encryption key must have 32 bytes'); const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key, iv); c.setAAD(Buffer.from(aad)); const body = Buffer.concat([c.update(value, 'utf8'), c.final()]); return [iv, c.getAuthTag(), body].map(b => b.toString('base64url')).join('.'); }
export function open(key: Buffer, sealed: string, aad: string) { const [iv, tag, body] = sealed.split('.').map(p => Buffer.from(p, 'base64url')); const d = createDecipheriv('aes-256-gcm', key, iv!); d.setAAD(Buffer.from(aad)); d.setAuthTag(tag!); return Buffer.concat([d.update(body!), d.final()]).toString('utf8'); }
// Mercado Pago webhook manifest: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" — absent values are omitted, alphanumeric ids lowercased.
export function webhookManifest(dataId: string | undefined, requestId: string | undefined, ts: string) { let m = ''; if (dataId) m += `id:${/[a-z]/i.test(dataId) ? dataId.toLowerCase() : dataId};`; if (requestId) m += `request-id:${requestId};`; return `${m}ts:${ts};`; }
export function signWebhook(secret: string, dataId: string | undefined, requestId: string | undefined, ts: string) { return createHmac('sha256', secret).update(webhookManifest(dataId, requestId, ts)).digest('hex'); }
export function verifyWebhook(secret: string, header: string | undefined, requestId: string | undefined, dataId: string | undefined, now = Date.now(), toleranceMs = 5 * 60_000) {
  if (!header || !secret) return { ok: false, reason: 'missing' } as const;
  const parts = Object.fromEntries(header.split(',').map(p => p.trim().split('=', 2) as [string, string]));
  const ts = parts.ts ?? '', v1 = parts.v1 ?? '';
  if (!/^\d{10}(\d{3})?$/.test(ts) || !/^[a-f0-9]{64}$/.test(v1)) return { ok: false, reason: 'malformed' } as const;
  const ms = ts.length === 10 ? Number(ts) * 1000 : Number(ts);
  if (Math.abs(now - ms) > toleranceMs) return { ok: false, reason: 'stale' } as const;
  const expected = Buffer.from(signWebhook(secret, dataId, requestId, ts), 'hex');
  return timingSafeEqual(expected, Buffer.from(v1, 'hex')) ? { ok: true, ts } as const : { ok: false, reason: 'mismatch' } as const;
}

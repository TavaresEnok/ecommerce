import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { required } from './infrastructure.js';
export const randomToken = () => randomBytes(32).toString('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const csrfFor = (token: string) => createHmac('sha256', required('COOKIE_SECRET')).update(`csrf:${token}`).digest('hex');
export function secureEqual(a: string, b: string) {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function derive(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 64, { N: 65536, r: 8, p: 1, maxmem: 128 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:65536:8:1:${salt}:${(await derive(password, salt)).toString('hex')}`;
}
export async function checkPassword(password: string, stored: string) {
  const parts = stored.split(':');
  if (parts.length !== 6 || parts.slice(0,4).join(':') !== 'scrypt:65536:8:1') return false;
  return secureEqual((await derive(password, parts[4])).toString('hex'), parts[5]);
}
export const cookieName = () => process.env.APP_ENV === 'production' ? '__Host-ecommerce' : 'ecommerce-local';
export const cookieOptions = () => ({ httpOnly: true, secure: process.env.APP_ENV === 'production', sameSite: 'strict' as const, path: '/', maxAge: 7 * 24 * 3600 });

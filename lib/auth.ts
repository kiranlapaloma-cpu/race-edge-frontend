import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

const COOKIE = 'race_edge_session';
const TTL = 60 * 60 * 24 * 7;

function secret(): string {
  const value = process.env.RACE_EDGE_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error('RACE_EDGE_SESSION_SECRET must be at least 32 characters');
  return value;
}
function signature(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('hex');
}
function equal(a: string, b: string): boolean {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function verifyPassword(input: string): boolean {
  const password = process.env.RACE_EDGE_LOGIN_PASSWORD;
  if (!password || password.length < 10) throw new Error('Configure a login password of at least 10 characters');
  return equal(input, password);
}
export function createSession(): string {
  const expiry = String(Math.floor(Date.now() / 1000) + TTL);
  return `${expiry}.${signature(expiry)}`;
}
export async function isAuthenticated(): Promise<boolean> {
  const cookie = (await cookies()).get(COOKIE)?.value;
  if (!cookie) return false;
  const [expiry, sig, extra] = cookie.split('.');
  if (!expiry || !sig || extra || !/^\d+$/.test(expiry)) return false;
  if (Number(expiry) <= Math.floor(Date.now() / 1000)) return false;
  return equal(sig, signature(expiry));
}
export const sessionCookieName = COOKIE;
export const sessionMaxAge = TTL;

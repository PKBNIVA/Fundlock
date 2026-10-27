// Admin session: a signed, expiring cookie. The signing key is derived from ADMIN_PASSWORD,
// so changing the password signs everyone out.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE = 'fl_admin';
const MAX_AGE = 7 * 24 * 3600; // 7 days

const key = () => createHash('sha256').update('fundlock-admin-v1:' + process.env.ADMIN_PASSWORD).digest();
const sign = (payload) => createHmac('sha256', key()).update(payload).digest('base64url');

export function adminConfigured() {
  return typeof process.env.ADMIN_PASSWORD === 'string' && process.env.ADMIN_PASSWORD.length >= 8;
}

export function passwordMatches(input) {
  const a = createHash('sha256').update(String(input || '')).digest();
  const b = createHash('sha256').update(process.env.ADMIN_PASSWORD).digest();
  return timingSafeEqual(a, b);
}

export function sessionCookie() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + MAX_AGE * 1000 })).toString('base64url');
  return `${COOKIE}=${payload}.${sign(payload)}; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${MAX_AGE}`;
}

export const clearCookie = `${COOKIE}=; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

export function isAdmin(req) {
  if (!adminConfigured()) return false;
  const raw = String(req.headers.cookie || '')
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(COOKIE + '='));
  if (!raw) return false;
  const [payload, sig] = raw.slice(COOKIE.length + 1).split('.');
  if (!payload || !sig) return false;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now();
  } catch {
    return false;
  }
}

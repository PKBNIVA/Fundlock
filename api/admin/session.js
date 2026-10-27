// Admin login.  GET: am I signed in?  POST {password}: sign in.  DELETE: sign out.
import { db, ensureSchema, context, readBody } from '../../lib/db.js';
import { adminConfigured, passwordMatches, sessionCookie, clearCookie, isAdmin } from '../../lib/auth.js';

const MAX_FAILS = 8; // per network per 15 minutes

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') return res.status(200).json({ configured: adminConfigured(), loggedIn: isAdmin(req) });

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', clearCookie);
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!adminConfigured()) return res.status(503).json({ error: 'Admin login is not set up yet (ADMIN_PASSWORD is missing in Vercel).' });

  const { ipHash } = context(req);
  try {
    await ensureSchema();
    const q = await db();
    await q`DELETE FROM admin_login_attempts WHERE at < now() - interval '1 day'`;
    if (ipHash) {
      const [{ n }] = await q`SELECT count(*)::int AS n FROM admin_login_attempts WHERE ip_hash = ${ipHash} AND at > now() - interval '15 minutes'`;
      if (n >= MAX_FAILS) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
    }
    const { password } = readBody(req);
    if (!passwordMatches(password)) {
      if (ipHash) await q`INSERT INTO admin_login_attempts (ip_hash) VALUES (${ipHash})`;
      await new Promise((r) => setTimeout(r, 600));
      return res.status(401).json({ error: 'Wrong password' });
    }
    if (ipHash) await q`DELETE FROM admin_login_attempts WHERE ip_hash = ${ipHash}`;
    res.setHeader('Set-Cookie', sessionCookie());
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('login failed:', err.message);
    return res.status(500).json({ error: 'Login is unavailable right now' });
  }
}

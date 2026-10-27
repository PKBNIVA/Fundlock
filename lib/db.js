// Shared Postgres (Neon) access. DATABASE_URL is set by the Vercel ↔ Neon integration.
import { createHash } from 'node:crypto';

let sql;
let ready;

// Loaded lazily so a database problem can never stop the application form from sending its emails.
export async function db() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  if (!sql) {
    const { neon } = await import('@neondatabase/serverless');
    sql = neon(process.env.DATABASE_URL);
  }
  return sql;
}

// Creates tables on first use, so no separate migration step is needed.
export function ensureSchema() {
  if (!ready) {
    ready = (async () => {
      const q = await db();
      await q`CREATE TABLE IF NOT EXISTS leads (
        id            uuid PRIMARY KEY,
        status        text NOT NULL DEFAULT 'unregistered',   -- unregistered | submitted
        name text, email text, phone text, company text, city text, sector text,
        stage text, amount text, website text, deck text, about text,
        consent       boolean NOT NULL DEFAULT false,
        completion    int NOT NULL DEFAULT 0,                 -- % of required fields filled
        last_field    text,                                   -- where they stopped
        visits        int NOT NULL DEFAULT 1,
        source        jsonb,                                  -- referrer, utm_*, landing page
        country       text,
        region        text,
        device        text,
        ip_hash       text,
        email_status  text,                                   -- sent | failed (submitted only)
        admin_status  text NOT NULL DEFAULT 'new',            -- new | contacted | shortlisted | rejected
        notes         text,
        first_seen    timestamptz NOT NULL DEFAULT now(),
        last_seen     timestamptz NOT NULL DEFAULT now(),
        submitted_at  timestamptz
      )`;
      await q`CREATE INDEX IF NOT EXISTS leads_status_seen ON leads (status, last_seen DESC)`;
      await q`CREATE INDEX IF NOT EXISTS leads_email ON leads (lower(email))`;
      await q`CREATE INDEX IF NOT EXISTS leads_ip_recent ON leads (ip_hash, first_seen)`;
      await q`CREATE TABLE IF NOT EXISTS admin_login_attempts (
        ip_hash text NOT NULL,
        at      timestamptz NOT NULL DEFAULT now()
      )`;
    })().catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

export const FIELDS = {
  name: 'Founder name',
  email: 'Email',
  phone: 'Phone',
  company: 'Startup / company',
  city: 'City',
  sector: 'Sector',
  stage: 'Stage',
  amount: 'Funding required',
  website: 'Website',
  deck: 'Pitch deck',
  about: 'About the business',
};
export const REQUIRED = ['name', 'email', 'phone', 'company', 'city', 'sector', 'stage', 'amount', 'about'];

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function clean(body) {
  const data = {};
  for (const k of Object.keys(FIELDS)) data[k] = String(body?.[k] ?? '').trim().slice(0, k === 'about' ? 4000 : 300);
  return data;
}

export function completion(data) {
  return Math.round((REQUIRED.filter((k) => data[k]).length / REQUIRED.length) * 100);
}

export function cleanSource(src) {
  if (!src || typeof src !== 'object') return null;
  const out = {};
  for (const k of ['referrer', 'landing', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid']) {
    if (src[k]) out[k] = String(src[k]).slice(0, 300);
  }
  return Object.keys(out).length ? out : null;
}

// Request context: approximate location from Vercel's edge headers, a short device label,
// and a salted hash of the IP (used only for abuse limits, never shown).
export function context(req) {
  const h = req.headers;
  const ip = String(h['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
  const salt = process.env.DATABASE_URL || 'fundlock';
  const ua = String(h['user-agent'] || '');
  const device = /iPad|Tablet/i.test(ua) ? 'Tablet' : /Mobi|Android|iPhone/i.test(ua) ? 'Mobile' : ua ? 'Desktop' : null;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : null;
  const dec = (v) => { try { return v ? decodeURIComponent(String(v)) : null; } catch { return String(v); } };
  return {
    ipHash: ip ? createHash('sha256').update(salt + ip).digest('hex').slice(0, 32) : null,
    country: dec(h['x-vercel-ip-country']),
    region: [dec(h['x-vercel-ip-city']), dec(h['x-vercel-ip-country-region'])].filter(Boolean).join(', ') || null,
    device: [device, browser].filter(Boolean).join(' · ') || null,
  };
}

export function readBody(req) {
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body || '{}'); } catch { return {}; }
  }
  return req.body || {};
}

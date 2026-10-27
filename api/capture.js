// Saves what a visitor has typed into the application form before they submit it.
// Called by the page (debounced while typing, and once more when they leave).
// Each browser draft has its own id; rows stay "unregistered" until /api/apply turns them into a submission.
import { db, ensureSchema, clean, completion, cleanSource, context, readBody, FIELDS, UUID_RE } from '../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = readBody(req);
  if (body.company_url) return res.status(204).end(); // honeypot: bot
  const sid = String(body.sid || '');
  if (!UUID_RE.test(sid)) return res.status(400).json({ error: 'Bad id' });

  const d = clean(body.data);
  // Only keep drafts that identify someone: an email, a phone number, a name or a company.
  const phoneDigits = d.phone.replace(/\D/g, '');
  const worthKeeping = /\S+@\S+/.test(d.email) || phoneDigits.length >= 7 || d.name.length >= 2 || d.company.length >= 2;
  if (!worthKeeping) return res.status(204).end();

  const ctx = context(req);
  const lastField = FIELDS[body.lastField] ? body.lastField : null;
  const newVisit = body.newVisit === true ? 1 : 0;
  const src = cleanSource(body.source);
  const pct = completion(d);

  try {
    await ensureSchema();
    const q = await db();

    // Abuse guard: at most 40 new drafts per network per hour.
    if (ctx.ipHash) {
      const [{ n }] = await q`SELECT count(*)::int AS n FROM leads
        WHERE ip_hash = ${ctx.ipHash} AND first_seen > now() - interval '1 hour' AND id <> ${sid}`;
      if (n >= 40) return res.status(204).end();
    }

    const v = (k) => d[k] || null;
    // Keep the latest non-empty value of each field (so erasing a field doesn't lose what they typed),
    // and never touch a draft that has already been submitted.
    await q`INSERT INTO leads (id, name, email, phone, company, city, sector, stage, amount, website, deck, about,
              completion, last_field, source, country, region, device, ip_hash)
      VALUES (${sid}, ${v('name')}, ${v('email')}, ${v('phone')}, ${v('company')}, ${v('city')}, ${v('sector')},
              ${v('stage')}, ${v('amount')}, ${v('website')}, ${v('deck')}, ${v('about')},
              ${pct}, ${lastField}, ${src ? JSON.stringify(src) : null}::jsonb, ${ctx.country}, ${ctx.region}, ${ctx.device}, ${ctx.ipHash})
      ON CONFLICT (id) DO UPDATE SET
        name    = COALESCE(EXCLUDED.name, leads.name),
        email   = COALESCE(EXCLUDED.email, leads.email),
        phone   = COALESCE(EXCLUDED.phone, leads.phone),
        company = COALESCE(EXCLUDED.company, leads.company),
        city    = COALESCE(EXCLUDED.city, leads.city),
        sector  = COALESCE(EXCLUDED.sector, leads.sector),
        stage   = COALESCE(EXCLUDED.stage, leads.stage),
        amount  = COALESCE(EXCLUDED.amount, leads.amount),
        website = COALESCE(EXCLUDED.website, leads.website),
        deck    = COALESCE(EXCLUDED.deck, leads.deck),
        about   = COALESCE(EXCLUDED.about, leads.about),
        completion = GREATEST(leads.completion, EXCLUDED.completion),
        last_field = COALESCE(EXCLUDED.last_field, leads.last_field),
        visits  = leads.visits + ${newVisit},
        source  = COALESCE(leads.source, EXCLUDED.source),
        country = COALESCE(EXCLUDED.country, leads.country),
        region  = COALESCE(EXCLUDED.region, leads.region),
        device  = COALESCE(EXCLUDED.device, leads.device),
        last_seen = now()
      WHERE leads.status = 'unregistered'`;
    return res.status(204).end();
  } catch (err) {
    console.error('capture failed:', err.message);
    return res.status(204).end(); // never bother the visitor with capture errors
  }
}

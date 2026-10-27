// Vercel serverless function: receives the application form, stores it, and sends emails via Brevo.
// Env vars:
//   DATABASE_URL        Neon Postgres (set by the Vercel ↔ Neon integration)
//   BREVO_API_KEY       required for emails
//   BREVO_SENDER_EMAIL  verified sender in Brevo (default info@fundlock.in)
//   NOTIFY_EMAIL        where applications are delivered (default info@fundlock.in)
//   BREVO_LIST_ID       numeric Brevo contact list to add applicants to (optional)
import { randomUUID } from 'node:crypto';
import { db, ensureSchema, clean, cleanSource, context, readBody, FIELDS, REQUIRED, UUID_RE } from '../lib/db.js';

const BREVO = 'https://api.brevo.com/v3';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function brevo(path, body) {
  const res = await fetch(BREVO + path, {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Brevo ${path} failed: ${res.status} ${await res.text()}`);
}

// Saves the submission. Reuses the visitor's draft row (same id) so its history — first visit,
// where they came from, how many times they returned — carries over.
async function save(data, body, req) {
  await ensureSchema();
  const q = await db();
  const ctx = context(req);
  const src = cleanSource(body.source);
  let id = UUID_RE.test(String(body.sid || '')) ? body.sid : randomUUID();
  const [prev] = await q`SELECT status FROM leads WHERE id = ${id}`;
  if (prev?.status === 'submitted') id = randomUUID(); // a second application from the same browser
  const v = (k) => data[k] || null;
  await q`INSERT INTO leads (id, status, name, email, phone, company, city, sector, stage, amount, website, deck, about,
            consent, completion, source, country, region, device, ip_hash, submitted_at)
    VALUES (${id}, 'submitted', ${v('name')}, ${v('email')}, ${v('phone')}, ${v('company')}, ${v('city')}, ${v('sector')},
            ${v('stage')}, ${v('amount')}, ${v('website')}, ${v('deck')}, ${v('about')},
            true, 100, ${src ? JSON.stringify(src) : null}::jsonb, ${ctx.country}, ${ctx.region}, ${ctx.device}, ${ctx.ipHash}, now())
    ON CONFLICT (id) DO UPDATE SET
      status = 'submitted', name = EXCLUDED.name, email = EXCLUDED.email, phone = EXCLUDED.phone,
      company = EXCLUDED.company, city = EXCLUDED.city, sector = EXCLUDED.sector, stage = EXCLUDED.stage,
      amount = EXCLUDED.amount, website = EXCLUDED.website, deck = EXCLUDED.deck, about = EXCLUDED.about,
      consent = true, completion = 100, last_field = NULL,
      source = COALESCE(leads.source, EXCLUDED.source),
      country = COALESCE(EXCLUDED.country, leads.country), region = COALESCE(EXCLUDED.region, leads.region),
      device = COALESCE(EXCLUDED.device, leads.device),
      last_seen = now(), submitted_at = now()`;
  return id;
}

async function sendEmails(data) {
  const sender = { name: 'FundLock', email: process.env.BREVO_SENDER_EMAIL || 'info@fundlock.in' };
  const notify = process.env.NOTIFY_EMAIL || 'info@fundlock.in';
  const rows = Object.entries(FIELDS)
    .map(([k, label]) => `<tr><td style="padding:6px 12px;color:#555;vertical-align:top"><b>${label}</b></td><td style="padding:6px 12px">${esc(data[k] || '-').replace(/\n/g, '<br>')}</td></tr>`)
    .join('');

  // 1. Application to the FundLock team
  await brevo('/smtp/email', {
    sender,
    to: [{ email: notify }],
    replyTo: { email: data.email, name: data.name },
    subject: `New application: ${data.company} (${data.stage})`,
    htmlContent: `<h2>New FundLock application</h2><table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">${rows}</table><p style="font-family:Arial,sans-serif;font-size:13px;color:#555">All applications: <a href="https://www.fundlock.in/admin">fundlock.in/admin</a></p>`,
  });

  // 2. Confirmation to the founder
  await brevo('/smtp/email', {
    sender,
    to: [{ email: data.email, name: data.name }],
    replyTo: { email: notify },
    subject: 'We received your FundLock application',
    htmlContent: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#222">
      <p>Hi ${esc(data.name)},</p>
      <p>Thanks for applying to FundLock with <b>${esc(data.company)}</b>. Our team reviews every application and will get back to you within 5 business days.</p>
      <p>Applications close on 30 October. If you have questions in the meantime, just reply to this email or call us on +91 77373 09657.</p>
      <p>Team FundLock<br><a href="https://www.fundlock.in">www.fundlock.in</a></p></div>`,
  });

  // 3. Save the applicant as a Brevo contact (optional, never blocks the submission)
  if (process.env.BREVO_LIST_ID) {
    await brevo('/contacts', {
      email: data.email,
      attributes: { FIRSTNAME: data.name, COMPANY: data.company },
      listIds: [Number(process.env.BREVO_LIST_ID)],
      updateEnabled: true,
    }).catch((err) => console.error(err.message));
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = readBody(req);
  if (body.company_url) return res.status(200).json({ ok: true }); // honeypot: silently drop bots

  const data = clean(body);
  const missing = REQUIRED.filter((k) => !data[k]);
  if (missing.length) return res.status(400).json({ error: `Please fill in: ${missing.map((k) => FIELDS[k]).join(', ')}` });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return res.status(400).json({ error: 'Please enter a valid email' });
  if (!body.consent) return res.status(400).json({ error: 'Please accept the Privacy Policy' });

  // Store first: once saved, the application is safe even if email sending fails.
  let id = null;
  try {
    id = await save(data, body, req);
  } catch (err) {
    console.error('save failed:', err.message);
  }

  let emailed = false;
  if (process.env.BREVO_API_KEY) {
    try {
      await sendEmails(data);
      emailed = true;
    } catch (err) {
      console.error(err.message);
    }
  } else {
    console.error('BREVO_API_KEY is not set');
  }

  if (id) {
    await (await db())`UPDATE leads SET email_status = ${emailed ? 'sent' : 'failed'} WHERE id = ${id}`.catch((err) => console.error(err.message));
  }

  if (!id && !emailed) return res.status(502).json({ error: 'We could not submit your application right now' });
  return res.status(200).json({ ok: true });
}

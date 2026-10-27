// Admin data.  GET: list applications and unregistered drafts (add ?format=csv to download).
// PATCH {id, admin_status?, notes?}: update review status / notes.  DELETE {id}: erase a record.
import { db, ensureSchema, readBody, FIELDS, UUID_RE } from '../../lib/db.js';
import { isAdmin } from '../../lib/auth.js';

const ADMIN_STATUSES = ['new', 'contacted', 'shortlisted', 'rejected'];
const digits = (s) => String(s || '').replace(/\D/g, '');

const CSV_COLS = [
  ['status', 'Status'], ['admin_status', 'Review'], ['submitted_at', 'Submitted at'], ['first_seen', 'First seen'],
  ['last_seen', 'Last activity'], ...Object.entries(FIELDS), ['completion', 'Completion %'], ['last_field', 'Stopped at'],
  ['visits', 'Visits'], ['source_text', 'Source'], ['country', 'Country'], ['region', 'Location'], ['device', 'Device'],
  ['email_status', 'Emails'], ['notes', 'Notes'],
];
const csvCell = (v) => {
  let s = v == null ? '' : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function sourceText(src) {
  if (!src) return 'Direct';
  if (src.utm_source) return [src.utm_source, src.utm_medium, src.utm_campaign].filter(Boolean).join(' / ');
  if (src.gclid) return 'Google Ads';
  if (src.fbclid) return 'Facebook / Instagram';
  if (src.referrer) {
    try { return new URL(src.referrer).hostname.replace(/^www\./, ''); } catch { return src.referrer; }
  }
  return 'Direct';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!isAdmin(req)) return res.status(401).json({ error: 'Not signed in' });

  try {
    await ensureSchema();
    const q = await db();

    if (req.method === 'PATCH') {
      const { id, admin_status, notes } = readBody(req);
      if (!UUID_RE.test(String(id || ''))) return res.status(400).json({ error: 'Bad id' });
      if (admin_status !== undefined && !ADMIN_STATUSES.includes(admin_status)) return res.status(400).json({ error: 'Bad status' });
      const n = notes === undefined ? undefined : String(notes).slice(0, 4000);
      await q`UPDATE leads SET
        admin_status = COALESCE(${admin_status ?? null}, admin_status),
        notes = CASE WHEN ${n === undefined} THEN notes ELSE ${n ?? null} END
        WHERE id = ${id}`;
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { id } = readBody(req);
      if (!UUID_RE.test(String(id || ''))) return res.status(400).json({ error: 'Bad id' });
      await q`DELETE FROM leads WHERE id = ${id}`;
      return res.status(200).json({ ok: true });
    }

    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const rows = await q`SELECT * FROM leads ORDER BY COALESCE(submitted_at, last_seen) DESC LIMIT 5000`;

    // A draft counts as "converted" once the same person (email or phone) has submitted.
    const subEmails = new Set();
    const subPhones = new Set();
    for (const r of rows) {
      if (r.status !== 'submitted') continue;
      if (r.email) subEmails.add(r.email.toLowerCase());
      if (digits(r.phone).length >= 7) subPhones.add(digits(r.phone).slice(-10));
    }
    const now = Date.now();
    const istDay = (d) => new Date(new Date(d).getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
    const today = istDay(now);

    const leads = rows.map((r) => {
      const converted = r.status === 'unregistered' && (
        (r.email && subEmails.has(r.email.toLowerCase())) ||
        (digits(r.phone).length >= 7 && subPhones.has(digits(r.phone).slice(-10))));
      const reachable = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email || '') || digits(r.phone).length >= 10;
      return { ...r, converted, reachable, source_text: sourceText(r.source), ip_hash: undefined };
    });

    const counts = {
      submitted: leads.filter((l) => l.status === 'submitted').length,
      unregistered: leads.filter((l) => l.status === 'unregistered' && !l.converted).length,
      converted: leads.filter((l) => l.converted).length,
      submittedToday: leads.filter((l) => l.status === 'submitted' && istDay(l.submitted_at) === today).length,
      unregisteredReachable: leads.filter((l) => l.status === 'unregistered' && !l.converted && l.reachable).length,
      newToReview: leads.filter((l) => l.status === 'submitted' && l.admin_status === 'new').length,
    };

    if (req.query.format === 'csv') {
      const view = String(req.query.view || 'all');
      const list = leads.filter((l) =>
        view === 'submitted' ? l.status === 'submitted' :
        view === 'unregistered' ? l.status === 'unregistered' && !l.converted : true);
      const csv = [CSV_COLS.map((c) => c[1]).join(','), ...list.map((l) => CSV_COLS.map(([k]) => csvCell(l[k])).join(','))].join('\r\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="fundlock-${view}-${today}.csv"`);
      return res.status(200).send('﻿' + csv);
    }

    return res.status(200).json({ counts, leads, generatedAt: new Date(now).toISOString() });
  } catch (err) {
    console.error('admin leads failed:', err.message);
    return res.status(500).json({ error: 'Could not load data' });
  }
}

// Vercel serverless function: receives the application form and sends it via Brevo.
// Required env var: BREVO_API_KEY
// Optional env vars:
//   BREVO_SENDER_EMAIL  verified sender in Brevo (default info@fundlock.in)
//   NOTIFY_EMAIL        where applications are delivered (default info@fundlock.in)
//   BREVO_LIST_ID       numeric Brevo contact list to add applicants to

const BREVO = 'https://api.brevo.com/v3';

const FIELDS = {
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
const REQUIRED = ['name', 'email', 'phone', 'company', 'city', 'sector', 'stage', 'amount', 'about'];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function brevo(path, body) {
  const res = await fetch(BREVO + path, {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Brevo ${path} failed: ${res.status} ${await res.text()}`);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  if (body.company_url) return res.status(200).json({ ok: true }); // honeypot: silently drop bots

  const data = {};
  for (const k of Object.keys(FIELDS)) data[k] = String(body[k] || '').trim().slice(0, k === 'about' ? 4000 : 300);

  const missing = REQUIRED.filter((k) => !data[k]);
  if (missing.length) return res.status(400).json({ error: `Please fill in: ${missing.map((k) => FIELDS[k]).join(', ')}` });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return res.status(400).json({ error: 'Please enter a valid email' });
  if (!body.consent) return res.status(400).json({ error: 'Please accept the Privacy Policy' });

  if (!process.env.BREVO_API_KEY) {
    console.error('BREVO_API_KEY is not set');
    return res.status(500).json({ error: 'Applications are temporarily unavailable' });
  }

  const sender = { name: 'FundLock', email: process.env.BREVO_SENDER_EMAIL || 'info@fundlock.in' };
  const notify = process.env.NOTIFY_EMAIL || 'info@fundlock.in';
  const rows = Object.entries(FIELDS)
    .map(([k, label]) => `<tr><td style="padding:6px 12px;color:#555;vertical-align:top"><b>${label}</b></td><td style="padding:6px 12px">${esc(data[k] || '-').replace(/\n/g, '<br>')}</td></tr>`)
    .join('');

  try {
    // 1. Application to the FundLock team
    await brevo('/smtp/email', {
      sender,
      to: [{ email: notify }],
      replyTo: { email: data.email, name: data.name },
      subject: `New application: ${data.company} (${data.stage})`,
      htmlContent: `<h2>New FundLock application</h2><table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">${rows}</table>`,
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

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err.message);
    return res.status(502).json({ error: 'We could not submit your application right now' });
  }
}

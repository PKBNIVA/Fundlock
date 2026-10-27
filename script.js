// ---- Content data ----
// Types of investors in the network. Swap in real firm names once they've agreed to be listed.
const FIRMS = ['Angel Networks', 'Seed Funds', 'Venture Capital Funds', 'Family Offices', 'HNI Investors',
  'Corporate Investors', 'MSME Lenders', 'Government Grant Schemes', 'Incubators', 'Strategic Partners'];

// Investor photos for the "Our Investors" section. Add { name, role, photo } to show a caption.
const INVESTORS = [
  { photo: '/assets/investors/investor-1.jpg' },
  { photo: '/assets/investors/investor-2.jpg' },
  { photo: '/assets/investors/investor-3.jpg' },
  { photo: '/assets/investors/investor-4.jpg' },
  { photo: '/assets/investors/investor-5.jpg' },
];

// [feature, FundLock, Solo]
const COMPARE = [
  ['Committed Investor Access', true, false],
  ['Curated Investor Network', true, false],
  ['Strategic Business Review', true, true],
  ['On-Spot Funding Rounds', true, false],
  ['Ecosystem Partnerships', true, false],
  ['Government Grant Access', true, false],
  ['Marketing Solutions & Website Development', true, false],
  ['Open to All Startups', false, true],
  ['Post-Investment Guidance', true, false],
];

const FAQS = [
  ['What makes FundLock different from other platforms?',
    "We work with just 30 startups per year, which allows us to provide dedicated support and attention. You'll get warm investor introductions, pitch feedback, and guidance throughout your fundraising journey, not just a directory of contacts."],
  ['What are you looking for in applications?',
    "We look for teams with clear execution plans, meaningful traction, and scalable business models. Market opportunity matters, but so does team capability and your ability to adapt. We want to see that you've thought deeply about your business and can articulate it clearly."],
  ['How much funding do startups typically raise?',
    'It varies based on stage and needs. Our investors typically write checks of ₹1.5 Crore or more for MSMEs and ₹50 Lakhs or more for startups. But remember, we make introductions. Final funding amounts depend on your business and investor interest.'],
  ["What's the timeline from application to funding?",
    "Selection takes about 25-30 days from application to decision. If selected, you'll start meeting investors within 2-3 weeks. Fundraising itself typically takes another 30 days, depending on due diligence and negotiations. So roughly 2 months total."],
  ['What is the program fee?',
    'The total program fee is ₹1,00,000 (₹1 Lac) plus applicable taxes for the entire process. This covers onboarding, evaluations, mentoring, documentation support, financial modelling, website assistance, founder bootcamps, investor readiness activities, investor mapping, conclave participation, networking sessions, and capital access facilitation.'],
  ['What support do you provide beyond investor intros?',
    "We'll review your pitch deck, help you prep for meetings, connect you with relevant mentors, and be available for questions throughout your fundraising. You'll also join our founder community for peer support. Think of us as your fundraising co-pilot."],
  ['Do you help with government grants or incubation programs?',
    "Yes, we can point you toward relevant grant programs and incubation opportunities. It's a nice option if you want to build more traction before diluting equity, or if you need non-dilutive capital alongside your fundraise."],
  ["What if I'm not selected?",
    "We'll share honest feedback on your application. Many founders use this feedback to strengthen their business and reapply later. There's no limit on reapplications. We're happy to review again when you're ready."],
];

// ---- Render ----
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

document.getElementById('firmTrack').innerHTML =
  [...FIRMS, ...FIRMS].map((f) => `<div class="firm">${f}</div>`).join('');

document.getElementById('logoGrid').innerHTML = INVESTORS.map((inv) => `
  <figure class="card inv-photo">
    <img src="${inv.photo}" alt="${esc(inv.name || 'FundLock investor')}" loading="lazy" />
    ${inv.name ? `<figcaption><b>${esc(inv.name)}</b>${inv.role ? `<span>${esc(inv.role)}</span>` : ''}</figcaption>` : ''}
  </figure>`).join('');

const mark = (ok) => ok
  ? '<span class="yes"><i data-lucide="check"></i></span>'
  : '<span class="no"><i data-lucide="x"></i></span>';
document.querySelector('#compareTable .table-cta').insertAdjacentHTML('beforebegin',
  COMPARE.map(([f, a, b]) => `<div class="row"><span>${esc(f)}</span><span class="c">${mark(a)}</span><span class="c">${mark(b)}</span></div>`).join(''));

const faqList = document.getElementById('faqList');
faqList.innerHTML = FAQS.map(([q, a], i) => `
  <div class="qa reveal${i === 0 ? ' open' : ''}">
    <button aria-expanded="${i === 0}"><span>${esc(q)}</span><span class="pm">${i === 0 ? '−' : '+'}</span></button>
    <div class="ans"><div><p>${esc(a)}</p></div></div>
  </div>`).join('');
faqList.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const qa = btn.parentElement;
  const open = qa.classList.toggle('open');
  btn.setAttribute('aria-expanded', open);
  btn.querySelector('.pm').textContent = open ? '−' : '+';
});

if (window.lucide) lucide.createIcons();

// ---- Header, menu, back-to-top ----
const header = document.getElementById('header');
const toTop = document.getElementById('toTop');
const onScroll = () => {
  header.classList.toggle('scrolled', scrollY > 20);
  toTop.classList.toggle('show', scrollY > 600);
};
addEventListener('scroll', onScroll, { passive: true });
onScroll();
toTop.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));

const nav = document.getElementById('nav');
document.getElementById('menuBtn').addEventListener('click', () => nav.classList.toggle('open'));
nav.addEventListener('click', (e) => { if (e.target.closest('a')) nav.classList.remove('open'); });

// ---- Reveal, counters, bars ----
const countUp = (el) => {
  const target = +el.dataset.count, pre = el.dataset.prefix || '', suf = el.dataset.suffix || '';
  const t0 = performance.now();
  const tick = (t) => {
    const p = Math.min((t - t0) / 1600, 1);
    el.textContent = pre + Math.round(target * (1 - Math.pow(1 - p, 3))) + suf;
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};
const io = new IntersectionObserver((entries) => {
  entries.forEach((en) => {
    if (!en.isIntersecting) return;
    const el = en.target;
    el.classList.add('in');
    el.querySelectorAll('[data-count]').forEach(countUp);
    el.querySelectorAll('.bar-fill').forEach((b) => (b.style.width = b.dataset.w + '%'));
    io.unobserve(el);
  });
}, { threshold: 0.15 });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

// ---- Side dots ----
const dots = [...document.querySelectorAll('.dots a')];
const secIO = new IntersectionObserver((entries) => {
  entries.forEach((en) => {
    if (en.isIntersecting) dots.forEach((d) => d.classList.toggle('active', d.getAttribute('href') === '#' + en.target.id));
  });
}, { rootMargin: '-45% 0px -50% 0px' });
dots.forEach((d) => { const s = document.querySelector(d.getAttribute('href')); if (s) secIO.observe(s); });

// ---- Cookie consent ----
const cookie = document.getElementById('cookie');
let consent = null;
try { consent = localStorage.getItem('fundlock-cookie'); } catch {}
if (!consent) setTimeout(() => cookie.classList.add('show'), 1500);
cookie.addEventListener('click', (e) => {
  const b = e.target.closest('[data-cookie]');
  if (!b) return;
  try { localStorage.setItem('fundlock-cookie', b.dataset.cookie); } catch {}
  cookie.classList.remove('show');
});

// ---- Application form ----
const form = document.getElementById('appForm');
const msg = document.getElementById('formMsg');

// Draft capture: whatever a visitor types is kept in their browser (so they can pick up where they left off)
// and synced to /api/capture so the team can see unfinished applications. Syncs are debounced while typing,
// sent right away when a field is completed, and once more with sendBeacon when the visitor leaves the page.
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const newId = () => (crypto.randomUUID ? crypto.randomUUID()
  : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));
const DRAFT_FIELDS = ['name', 'email', 'phone', 'company', 'city', 'sector', 'stage', 'amount', 'website', 'deck', 'about'];

// First-touch attribution: where this visitor originally came from.
const source = (() => {
  const saved = store.get('fl-src');
  if (saved) return saved;
  const p = new URLSearchParams(location.search);
  const s = { landing: location.pathname + location.search };
  if (document.referrer && !document.referrer.startsWith(location.origin)) s.referrer = document.referrer;
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid']) if (p.get(k)) s[k] = p.get(k);
  store.set('fl-src', s);
  return s;
})();

let sid = store.get('fl-app-sid') || newId();
store.set('fl-app-sid', sid);
let lastField = null;
let lastSynced = '';
let newVisit = true;
let syncTimer = null;

const draftData = () => {
  const d = {};
  for (const k of DRAFT_FIELDS) d[k] = (form.elements[k]?.value || '').trim();
  return d;
};
const isBot = () => !!form.elements.company_url?.value;
const worthSyncing = (d) => /\S+@\S+/.test(d.email) || d.phone.replace(/\D/g, '').length >= 7 || d.name.length >= 2 || d.company.length >= 2;

function syncDraft(useBeacon = false) {
  clearTimeout(syncTimer);
  if (isBot()) return;
  const data = draftData();
  const sig = JSON.stringify(data);
  if (sig === lastSynced || !worthSyncing(data)) return;
  const body = JSON.stringify({ sid, data, lastField, newVisit, source });
  if (useBeacon && navigator.sendBeacon) {
    // text/plain keeps the beacon a simple request; the API parses the JSON string.
    if (!navigator.sendBeacon('/api/capture', new Blob([body], { type: 'text/plain' }))) return;
  } else {
    fetch('/api/capture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  }
  lastSynced = sig;
  newVisit = false;
}

// Restore a saved draft.
const saved = store.get('fl-app-draft');
if (saved && Object.values(saved).some(Boolean)) {
  for (const k of DRAFT_FIELDS) if (saved[k] && form.elements[k] && !form.elements[k].value) form.elements[k].value = saved[k];
  msg.className = 'form-msg';
  msg.textContent = 'Welcome back! We kept the details you entered last time.';
}

form.addEventListener('input', (e) => {
  if (!DRAFT_FIELDS.includes(e.target.name)) return;
  lastField = e.target.name;
  store.set('fl-app-draft', draftData());
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncDraft, 2500);
});
form.addEventListener('change', (e) => {
  if (!DRAFT_FIELDS.includes(e.target.name)) return;
  lastField = e.target.name;
  syncDraft();
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') syncDraft(true); });
window.addEventListener('pagehide', () => syncDraft(true));

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true;
  msg.className = 'form-msg';
  msg.textContent = 'Submitting…';
  try {
    clearTimeout(syncTimer);
    const data = { ...Object.fromEntries(new FormData(form)), sid, source };
    const res = await fetch('/api/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || 'Something went wrong');
    form.reset();
    // Start fresh: the draft is now a submitted application.
    store.del('fl-app-draft');
    sid = newId();
    store.set('fl-app-sid', sid);
    lastSynced = JSON.stringify(draftData());
    newVisit = true;
    msg.className = 'form-msg ok';
    msg.textContent = "Thanks! Your application is in. We'll get back to you within 5 business days.";
  } catch (err) {
    msg.className = 'form-msg err';
    msg.textContent = `${err.message}. Please try again or email info@fundlock.in.`;
  } finally {
    btn.disabled = false;
  }
});

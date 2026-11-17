// Sends this week's Weekly Update email destinations to the FBSS Newsletter Studio.
// Needs NEWSLETTER_URL (the studio's web address) and NEWSLETTER_IMPORT_KEY (same value as IMPORT_KEY in the studio).
import { env, db, churchTz } from './shared.mjs';
import { publicUrl, isVideo } from './meta.mjs';
import { todayIn } from './email.mjs';

export const newsletterReady = () => !!(env('NEWSLETTER_URL') && env('NEWSLETTER_IMPORT_KEY'));
const addDays = (ymd, n) => { const [y, m, d] = ymd.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return t.toISOString().slice(0, 10); };
const dt = (ymd, opts) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' }); };
const tm = (t) => { if (!t) return ''; const [h, m] = String(t).split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}`; };
const ap = (t) => (Number(String(t).split(':')[0]) >= 12 ? 'PM' : 'AM');

// "Saturday, December 5 · 2:00–4:00 PM · Fellowship Hall", the newsletter's small line above the title.
export function eyebrow(c) {
  if (!c || !c.start_date) return '';
  let date = dt(c.start_date, { weekday: 'long', month: 'long', day: 'numeric' });
  if (c.end_date && c.end_date > c.start_date) date += ' – ' + dt(c.end_date, { weekday: 'long', month: 'long', day: 'numeric' });
  let time = '';
  if (c.start_time) {
    if (c.end_time && (!c.end_date || c.end_date === c.start_date)) time = ap(c.start_time) === ap(c.end_time) ? `${tm(c.start_time)}–${tm(c.end_time)} ${ap(c.end_time)}` : `${tm(c.start_time)} ${ap(c.start_time)}–${tm(c.end_time)} ${ap(c.end_time)}`;
    else time = `${tm(c.start_time)} ${ap(c.start_time)}`;
  }
  return [date, time, c.location].filter(Boolean).join(' · ');
}

// Every Weekly Update (email-type) destination from 2 days ago through the next 7 days,
// from approved campaigns and one-off posts, as newsletter sections.
export async function buildItems() {
  const today = todayIn(churchTz());
  const from = addDays(today, -2), to = addDays(today, 7);
  const s = await db('app_settings?id=eq.1&select=data');
  const chans = (s[0]?.data?.channels) || [];
  let ids = chans.filter((c) => c.kind === 'email').map((c) => c.id);
  if (!chans.length) ids = ['email'];
  if (!ids.length) return { items: [], from, to };
  const list = ids.map((i) => `"${String(i).replace(/"/g, '')}"`).join(',');
  const rows = await db(`destinations?channel_id=in.(${encodeURIComponent(list)})&publish_date=gte.${from}&publish_date=lte.${to}&order=publish_date.asc&select=id,headline,copy,image_paths,publish_date,title,details,campaign_id,campaigns(title,description,start_date,end_date,start_time,end_time,location,link,cover_path,status)`);
  const items = rows
    .filter((d) => !d.campaign_id || !d.campaigns || d.campaigns.status === 'approved')
    .map((d) => {
      const c = d.campaigns || null;
      const img = (d.image_paths || []).find((p) => !isVideo(p)) || (c && c.cover_path) || '';
      const link = (c && c.link) || '';
      return {
        calId: d.id,
        eyebrow: eyebrow(c),
        title: d.headline || (c && c.title) || d.title || '',
        body: d.copy || d.details || (c && c.description) || '',
        image: img ? publicUrl(img) : '',
        button: link ? 'Learn More' : '',
        link,
      };
    });
  return { items, from, to };
}

export async function syncNewsletter() {
  if (!newsletterReady()) throw new Error('The newsletter connection is not set up. Add NEWSLETTER_URL and NEWSLETTER_IMPORT_KEY in Netlify.');
  const { items, from, to } = await buildItems();
  const res = await fetch(env('NEWSLETTER_URL').replace(/\/$/, '') + '/api/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-import-key': env('NEWSLETTER_IMPORT_KEY') },
    body: JSON.stringify({ source: 'fbss-comms', from, to, items }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `The newsletter studio answered ${res.status}.`);
  return { sent: items.length, ...data };
}

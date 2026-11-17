// Public: saves a communication request and emails the admins.
import { json, fail, db, env } from '../lib/shared.mjs';
import { layout, sendEmail, appUrl, fmtRange, esc } from '../lib/email.mjs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/, TIME = /^\d{2}:\d{2}$/;
const str = (v, max) => String(v ?? '').trim().slice(0, max);
export default async (req) => {
  if (req.method !== 'POST') return fail('Use POST', 405);
  const b = await req.json().catch(() => null);
  if (!b) return fail('Bad request.');
  if (b.website) return json({ ok: true }); // spam trap field that real people never fill in
  const r = {
    requester_name: str(b.name, 120), requester_email: str(b.email, 200).toLowerCase(), ministry: str(b.ministry, 120), phone: str(b.phone, 40),
    title: str(b.title, 200), location: str(b.location, 200), description: str(b.description, 6000),
    start_date: DATE.test(b.startDate) ? b.startDate : null, end_date: DATE.test(b.endDate) ? b.endDate : null,
    start_time: TIME.test(b.startTime) ? b.startTime : null, end_time: TIME.test(b.endTime) ? b.endTime : null,
    not_sure: !!b.notSure,
    promo_start: DATE.test(b.promoStart) ? b.promoStart : null,
    promo_end: DATE.test(b.promoEnd) ? b.promoEnd : null,
    needs_graphics: b.graphics === 'yes' ? 'yes' : b.graphics === 'no' ? 'no' : '',
  };
  if (!r.requester_name) return fail('Please enter your name.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.requester_email)) return fail('Please enter a valid email address.');
  if (!r.title) return fail('Please enter the event name.');
  if (!r.start_date && !r.promo_end) return fail('Please enter the event start date, or, if there is no event date, when to stop promoting it.');
  if (!r.start_date) r.end_date = null;
  if (r.end_date && r.end_date < r.start_date) return fail('The end date is before the start date.');
  if (!r.description) return fail('Please describe what you want communicated.');
  if (!r.promo_start) return fail('Please choose when to start promoting this event.');
  if (r.start_date && r.promo_start > r.start_date) return fail('Promotion needs to start on or before the event start date.');
  if (r.promo_end && r.promo_end < r.promo_start) return fail('Promote until is before the promotion start date.');
  if (!r.needs_graphics) return fail('Please say whether you need graphics designed.');
  const s = await db('app_settings?id=eq.1&select=data');
  const chans = (s[0]?.data?.channels) || [];
  r.channel_ids = (Array.isArray(b.channelIds) ? b.channelIds : []).filter((id) => chans.some((c) => c.id === id)).slice(0, 30);
  if (!r.channel_ids.length && !r.not_sure) return fail('Choose at least one place to promote this, or "Not sure".');
  const sid = String(b.submissionId || '');
  const files = Array.isArray(b.files) ? b.files : [];
  if (files.length && !UUID.test(sid)) return fail('Bad submission.');
  r.files = files.slice(0, 15).filter((f) => f && typeof f.path === 'string' && f.path.startsWith(`requests/${sid}/`))
    .map((f) => ({ path: f.path, name: str(f.name, 200), type: str(f.type, 100), size: Number(f.size) || 0 }));
  const [row] = await db('requests', { method: 'POST', prefer: 'return=representation', body: r });

  // Let the admins know (or the addresses in REQUEST_NOTIFY_EMAILS, comma separated).
  try {
    let to = env('REQUEST_NOTIFY_EMAILS').split(',').map((x) => x.trim()).filter(Boolean);
    if (!to.length) to = (await db('profiles?role=eq.admin&select=email')).map((p) => p.email);
    await sendEmail({
      to, replyTo: r.requester_email,
      subject: `New communication request: ${r.title}`,
      html: layout({
        heading: 'New communication request',
        intro: `${esc(r.requester_name)}${r.ministry ? ' (' + esc(r.ministry) + ')' : ''} sent a request.`,
        rows: [['Event', r.title], ['When', fmtRange(r.start_date, r.end_date, r.start_time, r.end_time) || 'No event date'], ['Location', r.location],
          ['Destinations', r.channel_ids.map((id) => chans.find((c) => c.id === id)?.name).filter(Boolean).join(', ') + (r.not_sure ? (r.channel_ids.length ? ', ' : '') + 'Not sure' : '')],
          ['Start promoting', fmtRange(r.promo_start)], ['Promote until', r.promo_end ? fmtRange(r.promo_end) : ''], ['Graphics needed', r.needs_graphics === 'yes' ? 'Yes, please design graphics' : 'No, they have their own'],
          ['Files', r.files.length ? `${r.files.length} attached` : ''], ['Description', r.description]],
        button: { text: 'Review request', url: `${appUrl()}/#request-${row.id}` },
      }),
    });
  } catch (e) { console.error('Request notification failed', e.message); }
  return json({ ok: true });
};
export const config = { path: '/api/request-submit' };

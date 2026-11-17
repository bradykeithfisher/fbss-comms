// Emails a staff member when a destination is assigned to them. Called by the app after an assignment changes.
import { json, fail, requireUser, db } from '../lib/shared.mjs';
import { layout, sendEmail, appUrl, fmtDate, fmtTime } from '../lib/email.mjs';
export default async (req) => {
  if (req.method !== 'POST') return fail('Use POST', 405);
  const user = await requireUser(req);
  if (!user) return fail('Please sign in again.', 401);
  const { id } = await req.json().catch(() => ({}));
  if (!id) return fail('Missing destination.');
  const rows = await db(`destinations?id=eq.${encodeURIComponent(id)}&select=*,campaigns(id,title,start_date,end_date,location,status)`);
  const d = rows[0];
  if (!d || !d.assignee_id) return json({ skipped: 'unassigned' });
  if (d.assigned_notified === d.assignee_id) return json({ skipped: 'already emailed' });
  if (d.campaigns && d.campaigns.status && d.campaigns.status !== 'approved') return json({ skipped: 'campaign not approved yet' });
  if (d.assignee_id === user.id) {  // assigning yourself: no email needed
    await db(`destinations?id=eq.${d.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { assigned_notified: d.assignee_id } });
    return json({ skipped: 'self' });
  }
  const [person] = await db(`profiles?id=eq.${d.assignee_id}&select=email,full_name`);
  const s = await db('app_settings?id=eq.1&select=data');
  const ch = ((s[0]?.data?.channels) || []).find((c) => c.id === d.channel_id) || { name: d.channel_id };
  const camp = d.campaigns || { title: d.title || 'One-off post' };  // one-off posts have no campaign
  const by = user.profile?.full_name || user.email;
  try {
    await sendEmail({
      to: person?.email,
      replyTo: user.email,
      subject: `New assignment: ${ch.name} for ${camp.title}`,
      html: layout({
        heading: 'You have a new assignment',
        intro: `${by.replace(/</g, '&lt;')} assigned you the <strong>${String(ch.name).replace(/</g, '&lt;')}</strong> piece for <strong>${String(camp.title).replace(/</g, '&lt;')}</strong>.`,
        rows: [
          ['Due', d.publish_date ? fmtDate(d.publish_date) + (['social', 'facebook', 'instagram'].includes(ch.kind) && d.publish_time ? ', ' + fmtTime(d.publish_time) : '') + ' (the day it goes out)' : 'Not scheduled yet'],
          ['Event', camp.start_date ? fmtDate(camp.start_date) : ''],
          ['Location', camp.location],
          ['Notes', d.notes],
        ],
        button: { text: 'Open assignment', url: `${appUrl()}/#dest-${d.id}` },
      }),
    });
  } catch (e) { return fail(e.message, 502); }
  await db(`destinations?id=eq.${d.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { assigned_notified: d.assignee_id } });
  return json({ ok: true });
};
export const config = { path: '/api/notify-assigned' };

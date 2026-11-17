// Staff: approve or decline a request and email the person who sent it.
import { json, fail, requireUser, db } from '../lib/shared.mjs';
import { layout, sendEmail, fmtRange, fmtDate, fmtTime, esc } from '../lib/email.mjs';
export default async (req) => {
  if (req.method !== 'POST') return fail('Use POST', 405);
  const user = await requireUser(req);
  if (!user) return fail('Please sign in again.', 401);
  const { id, decision, note, campaignId, notify = true, includeSchedule = true } = await req.json().catch(() => ({}));
  if (!['approved', 'declined'].includes(decision)) return fail('Unknown decision.');
  const [r] = await db(`requests?id=eq.${encodeURIComponent(id)}&select=*`);
  if (!r) return fail('That request no longer exists.', 404);
  const msg = String(note || '').trim().slice(0, 4000);
  await db(`requests?id=eq.${r.id}`, { method: 'PATCH', prefer: 'return=minimal', body: {
    status: decision, decision_note: msg, reviewed_by: user.id, reviewed_at: new Date().toISOString(), ...(campaignId ? { campaign_id: campaignId } : {}),
  } });
  if (!notify) return json({ ok: true, emailed: false });
  const by = user.profile?.full_name || 'The FBSS communications team';
  const approved = decision === 'approved';
  // The planned schedule: every destination on the linked campaign, in date order.
  let schedule = '';
  const cid = campaignId || r.campaign_id;
  if (approved && includeSchedule && cid) {
    const ds = await db(`destinations?campaign_id=eq.${encodeURIComponent(cid)}&select=channel_id,publish_date,publish_time&order=publish_date.asc.nullslast,publish_time.asc.nullslast`);
    const s = await db('app_settings?id=eq.1&select=data');
    const chans = (s[0]?.data?.channels) || [];
    if (ds.length) {
      schedule = `<p style="margin:18px 0 8px;font:600 11px Arial,sans-serif;letter-spacing:1.5px;text-transform:uppercase;color:#686E75">Where and when it goes out</p>
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border-top:1px solid #DED6C5">${ds.map((d) => {
          const name = (chans.find((c) => c.id === d.channel_id) || { name: d.channel_id }).name;
          return `<tr><td style="padding:9px 12px 9px 0;border-bottom:1px solid #DED6C5;font:600 15px Georgia,serif;color:#414A55">${esc(name)}</td>
            <td style="padding:9px 0;border-bottom:1px solid #DED6C5;font:15px Georgia,serif;color:#2E343C;text-align:right">${d.publish_date ? esc(fmtDate(d.publish_date)) + (d.publish_time ? `<br><span style="color:#686E75;font-size:13px">${esc(fmtTime(d.publish_time))}</span>` : '') : 'Date to be set'}</td></tr>`;
        }).join('')}</table>
        <p style="margin:8px 0 0;font:13px Georgia,serif;color:#686E75">Dates can shift a little as we finalize the schedule.</p>`;
    }
  }
  try {
    const result = await sendEmail({
      to: r.requester_email, replyTo: user.email,
      subject: approved ? `Approved: your communication request for ${r.title}` : `Update on your communication request for ${r.title}`,
      html: layout({
        heading: approved ? 'Your request is approved' : 'About your request',
        intro: `Hi ${esc(r.requester_name.split(' ')[0])}, ${approved
          ? `thank you for sending this in. Your communication request for <strong>${esc(r.title)}</strong> is approved, and our team will take it from here.`
          : `thank you for sending in your communication request for <strong>${esc(r.title)}</strong>. We aren't able to move forward with it as submitted.`}`,
        rows: [['Event', r.title], ['When', fmtRange(r.start_date, r.end_date, r.start_time, r.end_time)], ['Location', r.location]],
        bodyHtml: (msg ? `<p style="margin:0 0 12px;padding:12px 14px;background:#EFE9DB;border-left:3px solid #B47E3D">${esc(msg).replace(/\n/g, '<br>')}</p>` : '')
          + schedule
          + `<p style="margin:18px 0 0">Questions? Just reply to this email.<br>${esc(by)}</p>`,
      }),
    });
    return json({ ok: true, emailed: !result.skipped });
  } catch (e) { return json({ ok: true, emailed: false, emailError: e.message }); }
};
export const config = { path: '/api/request-decision' };

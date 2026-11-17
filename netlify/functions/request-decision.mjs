// Staff: approve or decline a request and email the person who sent it.
import { json, fail, requireUser, db } from '../lib/shared.mjs';
import { layout, sendEmail, fmtRange, esc, scheduleHtml } from '../lib/email.mjs';
export default async (req) => {
  if (req.method !== 'POST') return fail('Use POST', 405);
  const user = await requireUser(req);
  if (!user) return fail('Please sign in again.', 401);
  if (!user.isAdmin) return fail('Only admins can approve or decline requests.', 403);
  const { id, decision, note, campaignId, notify = true, includeSchedule = true } = await req.json().catch(() => ({}));
  if (!['approved', 'declined'].includes(decision)) return fail('Unknown decision.');
  const [r] = await db(`requests?id=eq.${encodeURIComponent(id)}&select=*`);
  if (!r) return fail('That request no longer exists.', 404);
  const msg = String(note || '').trim().slice(0, 4000);
  await db(`requests?id=eq.${r.id}`, { method: 'PATCH', prefer: 'return=minimal', body: {
    status: decision, decision_note: msg, reviewed_by: user.id, reviewed_at: new Date().toISOString(), ...(campaignId ? { campaign_id: campaignId } : {}),
  } });
  const by = user.profile?.full_name || 'The FBSS communications team';
  const approved = decision === 'approved';
  const cid = campaignId || r.campaign_id;
  // The planned campaign follows the request: approved with it, or marked declined.
  if (cid) await db(`campaigns?id=eq.${encodeURIComponent(cid)}`, { method: 'PATCH', prefer: 'return=minimal', body: { status: approved ? 'approved' : 'declined', reviewed_by: user.id, reviewed_at: new Date().toISOString() } });
  const schedule = approved && includeSchedule && cid ? await scheduleHtml(db, cid) : '';
  if (!notify) return json({ ok: true, emailed: false });
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

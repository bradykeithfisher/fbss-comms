// Campaign approval:
//   submit  (any staff) — emails the admins when a campaign is waiting for approval; resubmits a declined one
//   approve / decline (admins only) — sets the status and emails the person who submitted it
import { json, fail, requireUser, db } from '../lib/shared.mjs';
import { layout, sendEmail, appUrl, fmtRange, esc, scheduleHtml, adminEmails } from '../lib/email.mjs';
export default async (req) => {
  if (req.method !== 'POST') return fail('Use POST', 405);
  const user = await requireUser(req);
  if (!user) return fail('Please sign in again.', 401);
  const { action, id, note = '', notify = true } = await req.json().catch(() => ({}));
  const [c] = await db(`campaigns?id=eq.${encodeURIComponent(id || '')}&select=*`);
  if (!c) return fail('That campaign no longer exists.', 404);
  const by = user.profile?.full_name || user.email;
  const when = fmtRange(c.start_date, c.end_date, c.start_time, c.end_time);
  const link = `${appUrl()}/#campaign-${c.id}`;

  if (action === 'submit') {
    if (c.status === 'approved') return json({ ok: true, status: 'approved' });
    if (c.status === 'declined') await db(`campaigns?id=eq.${c.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { status: 'pending', review_note: '' } });
    try {
      await sendEmail({
        to: await adminEmails(db), replyTo: user.email,
        subject: `Campaign waiting for approval: ${c.title}`,
        html: layout({
          heading: 'Campaign waiting for approval',
          intro: `${esc(by)} submitted a campaign for approval.`,
          rows: [['Campaign', c.title], ['When', when], ['Location', c.location], ['Ministry', c.ministry], ['Description', c.description]],
          bodyHtml: await scheduleHtml(db, c.id),
          button: { text: 'Review campaign', url: link },
        }),
      });
    } catch (e) { return json({ ok: true, status: 'pending', emailed: false, emailError: e.message }); }
    return json({ ok: true, status: 'pending', emailed: true });
  }

  if (action === 'approve' || action === 'decline') {
    if (!user.isAdmin) return fail('Only admins can approve or decline campaigns.', 403);
    const approved = action === 'approve';
    const msg = String(note).trim().slice(0, 4000);
    await db(`campaigns?id=eq.${c.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { status: approved ? 'approved' : 'declined', reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_note: msg } });
    let emailed = false, emailError = '';
    const [sub] = c.created_by ? await db(`profiles?id=eq.${c.created_by}&select=email,full_name`) : [];
    if (notify && sub && sub.email && c.created_by !== user.id) {
      try {
        const r = await sendEmail({
          to: sub.email, replyTo: user.email,
          subject: approved ? `Approved: ${c.title}` : `Not approved yet: ${c.title}`,
          html: layout({
            heading: approved ? 'Your campaign is approved' : 'Your campaign needs changes',
            intro: `Hi ${esc((sub.full_name || '').split(' ')[0] || 'there')}, ${approved ? `<strong>${esc(c.title)}</strong> is approved. Assignment emails are going out to the team now.` : `<strong>${esc(c.title)}</strong> wasn't approved yet. Make any changes and submit it again from the campaign page.`}`,
            rows: [['Campaign', c.title], ['When', when]],
            bodyHtml: (msg ? `<p style="margin:0 0 12px;padding:12px 14px;background:#EFE9DB;border-left:3px solid #B47E3D">${esc(msg).replace(/\n/g, '<br>')}</p>` : '') + (approved ? await scheduleHtml(db, c.id) : '') + `<p style="margin:18px 0 0">${esc(by)}</p>`,
            button: { text: 'Open campaign', url: link },
          }),
        });
        emailed = !r.skipped;
      } catch (e) { emailError = e.message; }
    }
    return json({ ok: true, status: approved ? 'approved' : 'declined', emailed, emailError });
  }
  return fail('Unknown action.');
};
export const config = { path: '/api/campaign-action' };

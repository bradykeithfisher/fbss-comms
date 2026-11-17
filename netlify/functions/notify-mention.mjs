// Emails staff tagged with @ in a comment on a destination. The app calls this right after a comment is
// sent. Who was tagged is worked out here from the saved comment, and only its author can trigger it.
import { json, fail, requireUser, db } from '../lib/shared.mjs';
import { layout, sendEmail, appUrl, fmtDate, esc } from '../lib/email.mjs';
export default async (req) => {
  if (req.method !== 'POST') return fail('Use POST', 405);
  const user = await requireUser(req);
  if (!user) return fail('Please sign in again.', 401);
  const { commentId } = await req.json().catch(() => ({}));
  if (!/^[0-9a-f-]{36}$/i.test(String(commentId || ''))) return fail('Missing comment.');
  const [cm] = await db(`destination_comments?id=eq.${commentId}&select=id,body,author_id,destination_id`);
  if (!cm) return fail('That comment no longer exists.', 404);
  if (cm.author_id !== user.id) return fail('Only the person who wrote the comment can send it.', 403);
  const team = await db('profiles?select=id,email,full_name');
  const body = String(cm.body || ''), low = body.toLowerCase();
  const tagged = team.filter((p) => p.id !== user.id && p.email && p.full_name && low.includes('@' + p.full_name.toLowerCase()));
  if (!tagged.length) return json({ ok: true, emailed: 0 });
  const [d] = await db(`destinations?id=eq.${cm.destination_id}&select=id,channel_id,publish_date,title,campaigns(title)`);
  if (!d) return fail('That destination no longer exists.', 404);
  const s = await db('app_settings?id=eq.1&select=data');
  const ch = ((s[0]?.data?.channels) || []).find((c) => c.id === d.channel_id) || { name: d.channel_id };
  const what = `${ch.name} for ${d.campaigns?.title || d.title || 'a one-off post'}`;
  const by = user.profile?.full_name || user.email;
  let html = esc(body);   // the comment, with each tagged name in bold
  for (const p of team) if (p.full_name) html = html.split('@' + esc(p.full_name)).join(`<strong style="color:#91412D">@${esc(p.full_name)}</strong>`);
  html = html.replace(/\n/g, '<br>');
  let emailed = 0; const errors = [];
  for (const p of tagged) {
    try {
      await sendEmail({
        to: p.email,
        replyTo: user.email,
        subject: `${by} mentioned you: ${what}`,
        html: layout({
          heading: 'You were mentioned',
          intro: `${esc(by)} tagged you in a comment on <strong>${esc(what)}</strong>.`,
          bodyHtml: `<div style="border-left:3px solid #B47E3D;background:#F6F2E9;padding:12px 16px;margin:4px 0 8px;font-size:15px;line-height:1.5;color:#2E343C">${html}</div>`,
          rows: [['Goes out', d.publish_date ? fmtDate(d.publish_date) : 'Not scheduled yet']],
          button: { text: 'Open and reply', url: `${appUrl()}/#dest-${d.id}` },
        }),
      });
      emailed++;
    } catch (e) { errors.push(e.message); }
  }
  if (!emailed && errors.length) return fail(errors[0], 502);
  return json({ ok: true, emailed });
};
export const config = { path: '/api/notify-mention' };

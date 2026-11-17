// Emails staff tagged with @ in a destination's Notes for the team. The app calls this when someone
// leaves the notes box after tagging new people; the note itself is read from the database.
import { json, fail, requireUser, db } from '../lib/shared.mjs';
import { layout, sendEmail, appUrl, fmtDate, esc } from '../lib/email.mjs';
export default async (req) => {
  if (req.method !== 'POST') return fail('Use POST', 405);
  const user = await requireUser(req);
  if (!user) return fail('Please sign in again.', 401);
  const { destId, userIds } = await req.json().catch(() => ({}));
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map(String).filter((x) => /^[\w-]{1,64}$/.test(x) && x !== user.id))].slice(0, 20);
  if (!/^[\w-]{1,64}$/.test(String(destId || '')) || !ids.length) return fail('Nothing to send.');
  const [d] = await db(`destinations?id=eq.${destId}&select=id,channel_id,notes,publish_date,title,campaigns(title)`);
  if (!d) return fail('That destination no longer exists.', 404);
  const people = await db(`profiles?id=in.(${ids.join(',')})&select=id,email,full_name`);
  const s = await db('app_settings?id=eq.1&select=data');
  const ch = ((s[0]?.data?.channels) || []).find((c) => c.id === d.channel_id) || { name: d.channel_id };
  const what = `${ch.name} for ${d.campaigns?.title || d.title || 'a one-off post'}`;
  const by = user.profile?.full_name || user.email;
  // The note, with each tagged name in bold.
  let note = esc(d.notes || '');
  for (const p of people) if (p.full_name) note = note.split('@' + esc(p.full_name)).join(`<strong style="color:#91412D">@${esc(p.full_name)}</strong>`);
  note = note.replace(/\n/g, '<br>');
  let emailed = 0; const errors = [];
  for (const p of people) {
    if (!p.email) continue;
    try {
      await sendEmail({
        to: p.email,
        replyTo: user.email,
        subject: `${by} mentioned you: ${what}`,
        html: layout({
          heading: 'You were mentioned',
          intro: `${esc(by)} tagged you in the notes for <strong>${esc(what)}</strong>.`,
          bodyHtml: `<div style="border-left:3px solid #B47E3D;background:#F6F2E9;padding:12px 16px;margin:4px 0 8px;font-size:15px;line-height:1.5;color:#2E343C">${note || '<em>(The note is empty.)</em>'}</div>`,
          rows: [['Goes out', d.publish_date ? fmtDate(d.publish_date) : 'Not scheduled yet']],
          button: { text: 'Open it', url: `${appUrl()}/#dest-${d.id}` },
        }),
      });
      emailed++;
    } catch (e) { errors.push(e.message); }
  }
  if (!emailed && errors.length) return fail(errors[0], 502);
  return json({ ok: true, emailed });
};
export const config = { path: '/api/notify-mention' };

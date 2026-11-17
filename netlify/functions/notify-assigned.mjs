// Emails staff about new assignments. One email per person per campaign, listing every piece assigned to them.
// The app calls this with { campaignId } when a campaign is approved, or { ids } after assignments change
// (it waits a few seconds and sends the changes together).
import { json, fail, requireUser, db } from '../lib/shared.mjs';
import { layout, sendEmail, appUrl, fmtDate, fmtTime, esc } from '../lib/email.mjs';
const SOCIAL = ['social', 'facebook', 'instagram'];
export default async (req) => {
  if (req.method !== 'POST') return fail('Use POST', 405);
  const user = await requireUser(req);
  if (!user) return fail('Please sign in again.', 401);
  const body = await req.json().catch(() => ({}));
  const ids = [...new Set([...(Array.isArray(body.ids) ? body.ids : []), ...(body.id ? [body.id] : [])].map(String).filter((x) => /^[\w-]{1,64}$/.test(x)))].slice(0, 200);
  const cid = /^[\w-]{1,64}$/.test(String(body.campaignId || '')) ? String(body.campaignId) : '';
  if (!ids.length && !cid) return fail('Missing destinations.');
  const sel = 'select=*,campaigns(id,title,start_date,end_date,location,status)';
  const rows = await db(cid ? `destinations?campaign_id=eq.${cid}&assignee_id=not.is.null&${sel}` : `destinations?id=in.(${ids.join(',')})&${sel}`);
  // Only assignments nobody has been emailed about, on approved campaigns or one-off posts.
  const todo = rows.filter((d) => d.assignee_id && d.assigned_notified !== d.assignee_id && (!d.campaigns || !d.campaigns.status || d.campaigns.status === 'approved'));
  const mine = todo.filter((d) => d.assignee_id === user.id);  // assigning yourself: no email needed
  if (mine.length) await db(`destinations?id=in.(${mine.map((d) => d.id).join(',')})`, { method: 'PATCH', prefer: 'return=minimal', body: { assigned_notified: user.id } });
  const rest = todo.filter((d) => d.assignee_id !== user.id);
  if (!rest.length) return json({ ok: true, emails: 0, pieces: 0 });

  const s = await db('app_settings?id=eq.1&select=data');
  const chans = (s[0]?.data?.channels) || [];
  const ch = (id) => chans.find((c) => c.id === id) || { name: id, kind: '' };
  const people = await db(`profiles?id=in.(${[...new Set(rest.map((d) => d.assignee_id))].join(',')})&select=id,email,full_name`);
  // Group by person and campaign (each one-off post is its own group).
  const groups = {};
  for (const d of rest) (groups[`${d.assignee_id}|${d.campaign_id || 'one-' + d.id}`] ||= []).push(d);
  const by = esc(user.profile?.full_name || user.email);
  let emails = 0, pieces = 0; const errors = [];
  for (const items of Object.values(groups)) {
    const p = people.find((x) => x.id === items[0].assignee_id); if (!p || !p.email) continue;
    items.sort((a, b) => String(a.publish_date || '9').localeCompare(String(b.publish_date || '9')));
    const camp = items[0].campaigns || { title: items[0].title || 'One-off post' };
    const due = (d) => d.publish_date ? fmtDate(d.publish_date) + (SOCIAL.includes(ch(d.channel_id).kind) && d.publish_time ? ', ' + fmtTime(d.publish_time) : '') : 'Not scheduled yet';
    const list = items.map((d) => `<tr><td style="padding:8px 12px 8px 0;border-top:1px solid #E4DCCB;vertical-align:top"><a href="${appUrl()}/#dest-${d.id}" style="color:#91412D;font-weight:600;text-decoration:none">${esc(ch(d.channel_id).name)}</a>${d.notes ? `<div style="color:#686E75;font-size:13px;margin-top:2px">${esc(d.notes)}</div>` : ''}</td><td style="padding:8px 0;border-top:1px solid #E4DCCB;vertical-align:top;white-space:nowrap;color:#414A55">Due ${esc(due(d))}</td></tr>`).join('');
    const one = items.length === 1;
    try {
      await sendEmail({
        to: p.email,
        replyTo: user.email,
        subject: one ? `New assignment: ${ch(items[0].channel_id).name} for ${camp.title}` : `${items.length} new assignments for ${camp.title}`,
        html: layout({
          heading: one ? 'You have a new assignment' : `You have ${items.length} new assignments`,
          intro: `${by} assigned you ${one ? 'a piece' : `${items.length} pieces`} for <strong>${esc(camp.title)}</strong>. Each one is due the day it goes out.`,
          rows: [['Event', camp.start_date ? fmtDate(camp.start_date) : ''], ['Location', camp.location]],
          bodyHtml: `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-top:8px;font-size:15px">${list}</table>`,
          button: { text: one ? 'Open assignment' : 'Open my work', url: one ? `${appUrl()}/#dest-${items[0].id}` : `${appUrl()}/#my-work` },
        }),
      });
      await db(`destinations?id=in.(${items.map((d) => d.id).join(',')})`, { method: 'PATCH', prefer: 'return=minimal', body: { assigned_notified: items[0].assignee_id } });
      emails++; pieces += items.length;
    } catch (e) { errors.push(e.message); }
  }
  if (!emails && errors.length) return fail(errors[0], 502);
  return json({ ok: true, emails, pieces, people: [...new Set(Object.values(groups).map((g) => g[0].assignee_id))].length });
};
export const config = { path: '/api/notify-assigned' };

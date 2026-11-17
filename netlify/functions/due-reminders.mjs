// Runs every morning. Emails each person a list of their assignments due today.
import { db, churchTz } from '../lib/shared.mjs';
import { layout, sendEmail, appUrl, fmtDate, todayIn, esc } from '../lib/email.mjs';
export default async () => {
  const today = todayIn(churchTz());
  const due = await db(`destinations?due_date=eq.${today}&assignee_id=not.is.null&status=neq.posted&or=(due_reminded_on.is.null,due_reminded_on.neq.${today})&select=id,channel_id,assignee_id,publish_date,status,campaigns(title)`);
  if (!due.length) return new Response('nothing due');
  const s = await db('app_settings?id=eq.1&select=data');
  const chans = (s[0]?.data?.channels) || [];
  const chName = (id) => (chans.find((c) => c.id === id) || { name: id }).name;
  const byPerson = {};
  for (const d of due) (byPerson[d.assignee_id] ||= []).push(d);
  const ids = Object.keys(byPerson);
  const people = await db(`profiles?id=in.(${ids.join(',')})&select=id,email,full_name`);
  let sent = 0;
  for (const p of people) {
    const items = byPerson[p.id];
    const list = items.map((d) => `<li style="margin:0 0 8px"><a href="${appUrl()}/#dest-${d.id}" style="color:#91412D">${esc(chName(d.channel_id))}: ${esc(d.campaigns?.title || '')}</a>${d.publish_date ? ` <span style="color:#686E75">(publishes ${esc(fmtDate(d.publish_date))})</span>` : ''}</li>`).join('');
    try {
      await sendEmail({
        to: p.email,
        subject: items.length === 1 ? `Due today: ${chName(items[0].channel_id)} for ${items[0].campaigns?.title || ''}` : `${items.length} assignments due today`,
        html: layout({
          heading: 'Due today',
          intro: `Good morning${p.full_name ? ', ' + esc(p.full_name.split(' ')[0]) : ''}. ${items.length === 1 ? 'This assignment is' : 'These assignments are'} due today:`,
          bodyHtml: `<ul style="padding-left:20px;margin:0">${list}</ul>`,
          button: { text: 'Open my work', url: `${appUrl()}/#my-work` },
        }),
      });
      await db(`destinations?id=in.(${items.map((d) => d.id).join(',')})`, { method: 'PATCH', prefer: 'return=minimal', body: { due_reminded_on: today } });
      sent++;
    } catch (e) { console.error('Reminder failed for', p.email, e.message); }
  }
  return new Response(`reminded ${sent} people`);
};
// 13:00 UTC = 7 AM Central in winter, 8 AM in summer.
export const config = { schedule: '0 13 * * *' };

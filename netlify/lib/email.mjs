// Sends branded emails through Resend (resend.com). Needs RESEND_API_KEY and EMAIL_FROM in Netlify.
import { env } from './shared.mjs';

export const appUrl = () => (env('APP_URL') || env('URL') || '').replace(/\/$/, '');
export const emailReady = () => !!(env('RESEND_API_KEY') && env('EMAIL_FROM'));

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export { esc };

// rows: [[label, value], ...] shown as a details table. bodyHtml is trusted HTML built with esc().
export function layout({ heading, intro = '', rows = [], bodyHtml = '', button }) {
  const app = appUrl();
  const table = rows.filter((r) => r[1]).map(([k, v]) => `
    <tr><td style="padding:6px 14px 6px 0;font:600 11px Arial,sans-serif;letter-spacing:1.5px;text-transform:uppercase;color:#686E75;vertical-align:top;white-space:nowrap">${esc(k)}</td>
    <td style="padding:6px 0;font:15px Georgia,'Times New Roman',serif;color:#2E343C;line-height:1.5">${esc(v).replace(/\n/g, '<br>')}</td></tr>`).join('');
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#EFE9DB">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EFE9DB;padding:28px 12px"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFDF8;border-top:5px solid #B47E3D">
      <tr><td style="padding:26px 32px 8px"><img src="${app}/assets/logo-email.png" width="214" alt="First Baptist Sulphur Springs" style="display:block;border:0"></td></tr>
      <tr><td style="padding:10px 32px 0;font:400 22px Georgia,'Times New Roman',serif;letter-spacing:2px;text-transform:uppercase;color:#414A55">${esc(heading)}</td></tr>
      ${intro ? `<tr><td style="padding:12px 32px 0;font:16px Georgia,'Times New Roman',serif;line-height:1.6;color:#2E343C">${intro}</td></tr>` : ''}
      ${table ? `<tr><td style="padding:16px 32px 0"><table role="presentation" cellpadding="0" cellspacing="0">${table}</table></td></tr>` : ''}
      ${bodyHtml ? `<tr><td style="padding:14px 32px 0;font:15px Georgia,'Times New Roman',serif;line-height:1.6;color:#2E343C">${bodyHtml}</td></tr>` : ''}
      ${button ? `<tr><td style="padding:24px 32px 6px"><a href="${esc(button.url)}" style="display:inline-block;background:#91412D;color:#ffffff;text-decoration:none;font:600 13px Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;padding:13px 22px">${esc(button.text)}</a></td></tr>` : ''}
      <tr><td style="padding:26px 32px 28px;font:600 11px Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;color:#8C9077">For Hopkins County. For the Gospel.</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

export async function sendEmail({ to, subject, html, replyTo }) {
  const list = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!list.length) return { skipped: 'no recipient' };
  if (!emailReady()) { console.log('Email not configured; skipped:', subject); return { skipped: 'not configured' }; }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env('EMAIL_FROM'), to: list, subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error('Email failed', res.status, t);
    throw new Error(`Email could not be sent (${res.status}).`);
  }
  return { sent: list.length };
}

export const fmtDate = (s) => {
  if (!s) return '';
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};
export const fmtTime = (t) => {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
export const fmtRange = (sd, ed, st, et) => {
  if (!sd) return '';
  const a = fmtDate(sd) + (st ? `, ${fmtTime(st)}` : '');
  if (ed && ed !== sd) return `${a} – ${fmtDate(ed)}${et ? ', ' + fmtTime(et) : ''}`;
  return a + (et ? ` – ${fmtTime(et)}` : '');
};
export function todayIn(tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

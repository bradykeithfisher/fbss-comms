// Runs every 5 minutes. Posts approved Facebook/Instagram destinations whose time has come
// and that have "Post automatically" turned on.
import { db, zonedToUtc, churchTz } from '../lib/shared.mjs';
import { publishDestination, recordFailure, claim, getAccount } from '../lib/meta.mjs';
export default async () => {
  if (!(await getAccount())) return new Response('Not connected');
  const tz = churchTz();
  const tomorrow = new Date(Date.now() + 36 * 3600 * 1000).toISOString().slice(0, 10);
  const due = await db(`destinations?auto_publish=is.true&published_at=is.null&publish_error=eq.&status=in.(approved,scheduled)&publish_date=lte.${tomorrow}&select=id,publish_date,publish_time`);
  const now = Date.now();
  let posted = 0, failed = 0;
  for (const d of due) {
    if (!d.publish_date) continue;
    if (zonedToUtc(d.publish_date, (d.publish_time || '09:00').slice(0, 5), tz).getTime() > now) continue;
    if (!(await claim(d.id))) continue;
    try { await publishDestination(d.id); posted++; }
    catch (e) { await recordFailure(d.id, e.message).catch(() => {}); failed++; }
  }
  return new Response(`checked ${due.length}, posted ${posted}, failed ${failed}`);
};
export const config = { schedule: '*/5 * * * *' };

// Runs every 5 minutes:
//  1. finishes posts already in progress (videos processing, multi-photo uploads), then
//  2. starts approved Facebook/Instagram/Social destinations whose time has come and that have
//     "Post automatically" turned on.
import { db, zonedToUtc, churchTz } from '../lib/shared.mjs';
import { advanceDestination, recordFailure, claim, getAccount } from '../lib/meta.mjs';
const BUDGET_MS = 24000; // scheduled functions get about 30 seconds
export default async () => {
  const stop = Date.now() + BUDGET_MS;
  if (!(await getAccount())) return new Response('Not connected');
  const tz = churchTz();
  const pending = await db('destinations?publish_pending=is.true&published_at=is.null&publish_error=eq.&select=id');
  const tomorrow = new Date(Date.now() + 36 * 3600 * 1000).toISOString().slice(0, 10);
  const due = (await db(`destinations?auto_publish=is.true&publish_pending=is.false&published_at=is.null&publish_error=eq.&status=in.(approved,scheduled)&publish_date=lte.${tomorrow}&select=id,publish_date,publish_time`))
    .filter((d) => d.publish_date && zonedToUtc(d.publish_date, (d.publish_time || '09:00').slice(0, 5), tz).getTime() <= Date.now());
  let posted = 0, processing = 0, failed = 0, skipped = 0;
  for (const d of [...pending, ...due]) {
    if (stop - Date.now() < 4000) { skipped++; continue; }   // pick the rest up next run
    if (!(await claim(d.id))) continue;
    try {
      const r = await advanceDestination(d.id, Math.min(stop, Date.now() + 9000));
      if (r.done) posted++; else processing++;
    } catch (e) { await recordFailure(d.id, e.message).catch(() => {}); failed++; }
  }
  return new Response(`posted ${posted}, still processing ${processing}, failed ${failed}, left for next run ${skipped}`);
};
export const config = { schedule: '*/5 * * * *' };

// "Send to newsletter now" button: pushes this week's Weekly Update items to the Newsletter Studio.
import { json, fail, requireUser } from '../lib/shared.mjs';
import { syncNewsletter } from '../lib/newsletter.mjs';
export default async (req) => {
  if (req.method !== 'POST') return fail('Use POST', 405);
  const user = await requireUser(req);
  if (!user) return fail('Please sign in again.', 401);
  try { return json({ ok: true, ...(await syncNewsletter()) }); }
  catch (e) { return fail(e.message, 502); }
};
export const config = { path: '/api/newsletter-sync' };

// Posts one Facebook or Instagram destination right now.
import { json, fail, requireUser } from '../lib/shared.mjs';
import { publishDestination, recordFailure, claim } from '../lib/meta.mjs';
export default async (req) => {
  if (req.method !== 'POST') return fail('Use POST', 405);
  const user = await requireUser(req);
  if (!user) return fail('Please sign in again.', 401);
  const { id } = await req.json().catch(() => ({}));
  if (!id) return fail('Missing destination.');
  if (!(await claim(id))) return fail('This is already being posted or was already posted.', 409);
  try {
    const r = await publishDestination(id);
    return json({ ok: true, url: r.url });
  } catch (e) {
    await recordFailure(id, e.message).catch(() => {});
    return fail(e.message, 400);
  }
};
export const config = { path: '/api/publish-now' };

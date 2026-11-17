// "Post now": moves a Facebook/Instagram/Social destination as far as it can in a few seconds.
// Videos and multi-photo posts may need more time; those finish in the background (publish-scheduled).
import { json, fail, requireUser } from '../lib/shared.mjs';
import { advanceDestination, recordFailure, claim } from '../lib/meta.mjs';
export default async (req) => {
  if (req.method !== 'POST') return fail('Use POST', 405);
  const user = await requireUser(req);
  if (!user) return fail('Please sign in again.', 401);
  const { id } = await req.json().catch(() => ({}));
  if (!id) return fail('Missing destination.');
  if (!(await claim(id))) return fail('This is already being posted or was already posted.', 409);
  try {
    const r = await advanceDestination(id, Date.now() + 7000);
    return json({ ok: true, ...r });
  } catch (e) {
    await recordFailure(id, e.message).catch(() => {});
    return fail(e.message, 400);
  }
};
export const config = { path: '/api/publish-now' };

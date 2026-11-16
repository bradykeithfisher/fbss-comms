// Admin-only: invite a staff member by email, or remove one.
import { env, json, fail, requireUser, authAdmin, db } from '../lib/shared.mjs';
export default async (req) => {
  if (req.method !== 'POST') return fail('Use POST', 405);
  const user = await requireUser(req);
  if (!user) return fail('Please sign in again.', 401);
  if (!user.isAdmin) return fail('Only admins can manage the team.', 403);
  const body = await req.json().catch(() => ({}));
  const site = env('URL', new URL(req.url).origin);
  try {
    if (body.action === 'invite') {
      const email = String(body.email || '').trim().toLowerCase();
      const name = String(body.name || '').trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('Enter a valid email address.');
      await authAdmin(`invite?redirect_to=${encodeURIComponent(site + '/')}`, { method: 'POST', body: { email, data: { full_name: name } } });
      return json({ ok: true });
    }
    if (body.action === 'remove') {
      const id = String(body.id || '');
      if (!id) return fail('Missing person.');
      if (id === user.id) return fail('You cannot remove yourself.');
      await db(`destinations?assignee_id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', prefer: 'return=minimal', body: { assignee_id: null } });
      await authAdmin(`admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return json({ ok: true });
    }
    return fail('Unknown action.');
  } catch (e) {
    return fail(e.message || 'Something went wrong.', 500);
  }
};
export const config = { path: '/api/team' };

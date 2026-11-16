// Facebook/Instagram connection. Anyone signed in can see the status; only admins can connect or disconnect.
import { json, fail, requireUser, db } from '../lib/shared.mjs';
import { graph, getAccount } from '../lib/meta.mjs';
export default async (req) => {
  const user = await requireUser(req);
  if (!user) return fail('Please sign in again.', 401);
  if (req.method === 'GET') {
    const a = await getAccount();
    return json(a ? { connected: true, pageName: a.page_name, pageId: a.page_id, igUsername: a.ig_username, hasInstagram: !!a.ig_user_id } : { connected: false });
  }
  if (!user.isAdmin) return fail('Only admins can change the Facebook connection.', 403);
  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === 'disconnect') {
      await db('social_accounts?id=eq.1', { method: 'DELETE', prefer: 'return=minimal' });
      return json({ connected: false });
    }
    if (body.action === 'connect') {
      const pageId = String(body.pageId || '').trim(), token = String(body.token || '').trim();
      if (!/^\d+$/.test(pageId)) return fail('The Page ID is a long number. Find it on your Facebook Page under About → Page transparency.');
      if (token.length < 20) return fail('Paste the full access token.');
      const page = await graph(pageId, { fields: 'name,access_token,instagram_business_account{id,username}', access_token: token }, 'GET');
      // A user token returns the Page's own token; a system-user or Page token is used as-is.
      const pageToken = page.access_token || token;
      const ig = page.instagram_business_account || {};
      await db('social_accounts', {
        method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
        body: { id: 1, page_id: pageId, page_name: page.name || '', page_token: pageToken, ig_user_id: ig.id || '', ig_username: ig.username || '', connected_by: user.id, updated_at: new Date().toISOString() },
      });
      return json({ connected: true, pageName: page.name, igUsername: ig.username || '', hasInstagram: !!ig.id });
    }
    return fail('Unknown action.');
  } catch (e) {
    return fail(`Facebook said: ${e.message}`, 400);
  }
};
export const config = { path: '/api/social' };

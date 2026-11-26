// Big videos (over Supabase's 50 MB upload limit) go straight from the browser to Cloudinary.
// The newsletter studio holds the Cloudinary secret, so this asks it to sign the upload.
import { json, fail, requireUser, env } from '../lib/shared.mjs';
export default async (req) => {
  if (req.method !== 'POST') return fail('Use POST', 405);
  const user = await requireUser(req);
  if (!user) return fail('Please sign in again.', 401);
  if (!env('NEWSLETTER_URL') || !env('NEWSLETTER_IMPORT_KEY')) return fail('Big video uploads need the newsletter connection (NEWSLETTER_URL and NEWSLETTER_IMPORT_KEY).', 503);
  const r = await fetch(env('NEWSLETTER_URL').replace(/\/$/, '') + '/api/video-sign', { method: 'POST', headers: { 'x-import-key': env('NEWSLETTER_IMPORT_KEY') } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return fail(j.error || `The newsletter studio answered ${r.status}`, 502);
  return json(j);
};
export const config = { path: '/api/video-sign' };

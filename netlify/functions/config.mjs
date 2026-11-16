// Public settings the browser needs to reach Supabase. The anon key is safe to share.
import { env, json, PUBLIC_KEY } from '../lib/shared.mjs';
export default async () => {
  const url = env('SUPABASE_URL'), anon = PUBLIC_KEY();
  if (!url || !anon) return json({ error: 'The site is missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY. Add them in Netlify → Site configuration → Environment variables, then redeploy.' }, 500);
  return json({ supabaseUrl: url, supabaseAnonKey: anon, aiEnabled: !!env('ANTHROPIC_API_KEY'), timezone: env('CHURCH_TIMEZONE', 'America/Chicago') });
};
export const config = { path: '/api/config' };

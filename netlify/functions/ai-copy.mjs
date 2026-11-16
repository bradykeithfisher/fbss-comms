// Writes copy with Claude. Only signed-in staff can call it.
import { env, json, fail, requireUser } from '../lib/shared.mjs';
export default async (req) => {
  if (req.method !== 'POST') return fail('Use POST', 405);
  const user = await requireUser(req);
  if (!user) return fail('Please sign in again.', 401);
  const key = env('ANTHROPIC_API_KEY');
  if (!key) return fail('AI writing is not set up. Add ANTHROPIC_API_KEY in Netlify environment variables.', 503);
  const { prompt } = await req.json().catch(() => ({}));
  if (!prompt || typeof prompt !== 'string' || prompt.length > 20000) return fail('Missing or too long prompt.');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: env('ANTHROPIC_MODEL', 'claude-sonnet-5-5'), max_tokens: 1500, messages: [{ role: 'user', content: prompt }] }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 429) return fail('Too many AI requests right now. Wait a minute and try again.', 429);
  if (!res.ok) return fail(data?.error?.message || `AI error ${res.status}`, 502);
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  return json({ text });
};
export const config = { path: '/api/ai-copy' };

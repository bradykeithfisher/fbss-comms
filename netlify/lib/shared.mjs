// Shared helpers for the server functions. No npm packages needed.
export const env = (k, d = '') => (globalThis.Netlify?.env?.get?.(k) ?? process.env[k] ?? d);

export const SUPABASE_URL = () => env('SUPABASE_URL').replace(/\/$/, '');
// New Supabase keys (sb_secret_… / sb_publishable_…) are preferred; legacy service_role / anon keys still work.
const SERVICE = () => env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY');
export const PUBLIC_KEY = () => env('SUPABASE_PUBLISHABLE_KEY') || env('SUPABASE_ANON_KEY');
// New keys are not JWTs: send them only on the apikey header. Legacy JWT keys also go on Authorization.
const serviceHeaders = () => { const k = SERVICE(); return k.startsWith('sb_') ? { apikey: k } : { apikey: k, Authorization: `Bearer ${k}` }; };

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
export const fail = (msg, status = 400) => json({ error: msg }, status);

// Supabase REST with the service key (bypasses row level security: server only).
export async function db(path, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${SUPABASE_URL()}/rest/v1/${path}`, {
    method,
    headers: {
      ...serviceHeaders(), 'content-type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Database error ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

export async function authAdmin(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${SUPABASE_URL()}/auth/v1/${path}`, {
    method,
    headers: { ...serviceHeaders(), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error((data && (data.msg || data.message || data.error_description || data.error)) || `Auth error ${res.status}`);
  return data;
}

// Who is calling? Checks the user's login token with Supabase.
export async function requireUser(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const res = await fetch(`${SUPABASE_URL()}/auth/v1/user`, { headers: { apikey: PUBLIC_KEY() || SERVICE(), Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const user = await res.json();
  const rows = await db(`profiles?id=eq.${user.id}&select=id,role,full_name,email`);
  return { ...user, profile: rows[0] || null, isAdmin: rows[0]?.role === 'admin' };
}

// Convert a local church date + time (e.g. America/Chicago) into a real moment in time.
function tzOffset(ts, tz) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ts));
  const g = (t) => +p.find((x) => x.type === t).value;
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - ts;
}
export function zonedToUtc(date, time, tz) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time || '09:00').split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const off = tzOffset(guess, tz);
  let t = guess - off;
  const off2 = tzOffset(t, tz);
  if (off2 !== off) t = guess - off2;
  return new Date(t);
}
export const churchTz = () => env('CHURCH_TIMEZONE', 'America/Chicago');

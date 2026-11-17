// FBSS Communication Calendar: AI artwork for campaign graphics (Supabase Edge Function "graphics").
//
// The app adds a row to graphics_jobs, then calls this function with the row's id. This function
// asks OpenAI for text-free artwork in the right shape, saves it to Storage (files/campaigns/<id>/art/),
// and marks the row 'art'. The app then lays the event's text and logo on top and saves the finished files.
//
// Secrets (Supabase Dashboard > Edge Functions > Secrets):
//   OPENAI_API_KEY        required
//   OPENAI_IMAGE_MODEL    optional, defaults to gpt-image-2
//   OPENAI_IMAGE_QUALITY  optional: low | medium | high (default medium)
// SUPABASE_URL and the project keys are provided automatically.

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });
const env = (k: string) => (Deno.env.get(k) || '').trim();
const firstKey = (name: string, legacy: string) => {
  try { const o = JSON.parse(env(name) || '{}'); if (o.default) return o.default; const v = Object.values(o)[0]; if (v) return String(v); } catch (_) { /* fall through */ }
  return env(legacy);
};
const URL_ = () => env('SUPABASE_URL').replace(/\/$/, '');
// API keys are plain ASCII. Pasted keys sometimes carry invisible characters, quotes or a "Bearer " prefix,
// which make the request fail before it's sent, so keep only the key itself.
export const cleanKey = (k: string) => k.replace(/^\s*(bearer\s+)?["'“”‘’]?/i, '').replace(/[^\x21-\x7E]/g, '').replace(/["'“”‘’]+$/, '');
// Find the key inside whatever was saved (e.g. "OPENAI_API_KEY=sk-...", or a key split across lines).
export const findOpenAIKey = (raw: string) => {
  const joined = String(raw || '').replace(/[^\x21-\x7E]/g, '');
  const m = joined.match(/sk-[A-Za-z0-9_-]{20,}/);
  return m ? m[0] : '';
};
const OPENAI_KEY = () => findOpenAIKey(env('OPENAI_API_KEY'));
// A safe description of a bad secret (never the key itself), to help fix it.
const describeSecret = (raw: string) => {
  const t = String(raw || '').trim();
  const kinds = [/\s/.test(t) && 'spaces or line breaks', /[^\x00-\x7E]/.test(t) && 'hidden or special characters', /=/.test(t) && 'an equals sign', /["'“”‘’]/.test(t) && 'quote marks'].filter(Boolean);
  return `It's ${t.length} characters long and starts with "${t.slice(0, 3).replace(/[^\x21-\x7E]/g, '?')}"${kinds.length ? ', and has ' + kinds.join(', ') : ''}.`;
};
const SECRET = () => cleanKey(firstKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'));
const PUBLIC = () => cleanKey(firstKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY'));
const svcHeaders = (extra: Record<string, string> = {}) => {
  const k = SECRET();
  return k.startsWith('sb_') ? { apikey: k, ...extra } : { apikey: k, authorization: 'Bearer ' + k, ...extra };
};

// The artwork's pixel size for each kind. All multiples of 16, as the image models require.
export const SIZES: Record<string, [number, number]> = {
  poster: [2304, 2688], // 6:7, the shape of a 36 x 42 inch poster
  wide: [2048, 1152],   // 16:9, for the title and background graphics
  social: [1088, 1360], // 4:5, for Facebook and Instagram
  concept: [2048, 1152], // concepts are 16:9; the chosen one becomes the title and background art
};
const COMPOSITION: Record<string, string> = {
  poster: 'A tall vertical artwork. Put the main subject in the upper two-thirds. Keep the bottom third simple and calm, because a text panel will cover it.',
  wide: 'A wide 16:9 artwork. Keep the main subject toward the right side and leave the left half calm and uncluttered, because a title will be placed there.',
  social: 'A vertical 4:5 artwork. Put the main subject in the upper part and keep the lower third calm and simple, because a caption band will cover it.',
  concept: 'A wide 16:9 artwork. Keep the main subject toward the right side and leave the left half calm and uncluttered, because a title will be placed there.',
};
const STYLES: Record<string, string> = {
  auto: 'Choose the visual style that best fits this event.',
  photo: 'Photographic and realistic, with natural, warm light.',
  illustrated: 'A modern editorial illustration with clean shapes and subtle paper texture.',
  watercolor: 'A soft, hand-painted watercolor on textured paper.',
  textured: 'An abstract, textured background of layered paper, brushstrokes and light. No people or objects.',
};

export function buildPrompt(kind: string, camp: Record<string, string>, opts: Record<string, unknown>) {
  const desc = String(camp.description || '').replace(/\s+/g, ' ').slice(0, 700);
  const ref = opts.ref ? [
    `The attached image is the approved design concept. Recreate the same artwork, with the same style, subject, colors, lighting and mood, reframed for the shape described below. It should look like part of the same set.`,
  ] : [];
  const lines = [
    ...ref,
    `Artwork for a church event graphic for First Baptist Sulphur Springs, a Baptist church in a small Texas town. Tasteful, warm and welcoming.`,
    `Event: ${camp.title || 'Church event'}.`,
    desc ? `About the event: ${desc}` : '',
    camp.location ? `Place: ${camp.location}.` : '',
    opts.brief ? `Creative direction (follow this closely): ${String(opts.brief).slice(0, 800)}` : '',
    opts.brief && String(opts.style || 'auto') === 'auto' ? '' : `Style: ${STYLES[String(opts.style || 'auto')] || STYLES.auto}`,
    opts.notes ? `Ideas from the church staff: ${String(opts.notes).slice(0, 600)}` : '',
    `Where it suits the direction, lean on the church's colors: rust red (#91412D), warm gold (#B47E3D), moss green (#8C9077), dusty blue (#ACBABD), slate (#414A55) and cream (#EFE9DB).`,
    COMPOSITION[kind] || '',
    kind === 'concept' && !opts.brief && Number(opts.variation) > 1 ? `This is design concept ${Number(opts.variation)}: take a clearly different creative direction (subject, composition or treatment) from the other concepts.` : '',
    kind !== 'concept' && Number(opts.variation) > 1 ? `This is version ${Number(opts.variation)}: use a different crop or viewpoint of the same scene.` : '',
    `Do not include any text, letters, numbers, words, signs, logos or watermarks anywhere in the image.`,
    `If people appear, show them from behind, in silhouette or at a distance, with no close-up faces.`,
  ];
  return lines.filter(Boolean).join('\n');
}

async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${URL_()}/rest/v1/${path}`, { ...init, headers: svcHeaders({ 'content-type': 'application/json', prefer: 'return=representation', ...(init.headers as Record<string, string> || {}) }) });
  const t = await r.text();
  if (!r.ok) throw new Error(`Database error ${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
const setJob = (id: string, patch: Record<string, unknown>) =>
  rest(`graphics_jobs?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) });

async function signedInUser(req: Request) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const r = await fetch(`${URL_()}/auth/v1/user`, { headers: { apikey: PUBLIC(), authorization: 'Bearer ' + token } });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? u : null;
}

function b64ToBytes(b64: string) {
  const bin = atob(b64); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const publicFileUrl = (path: string) => `${URL_()}/storage/v1/object/public/files/${path.split('/').map(encodeURIComponent).join('/')}`;
export async function makeArt(job: Record<string, any>, camp: Record<string, string>) {
  const [w, h] = SIZES[job.kind] || SIZES.social;
  const opts = job.options || {};
  const req: Record<string, unknown> = {
    model: env('OPENAI_IMAGE_MODEL') || 'gpt-image-2',
    prompt: buildPrompt(job.kind, camp, opts),
    size: `${w}x${h}`,
    quality: env('OPENAI_IMAGE_QUALITY') || 'medium',
    output_format: 'jpeg',
    output_compression: 92,
    n: 1,
  };
  // With an approved concept, ask for the same artwork in this shape (image edit with the concept as reference).
  if (opts.ref) req.images = [{ image_url: publicFileUrl(String(opts.ref)) }];
  const res = await fetch(`https://api.openai.com/v1/images/${opts.ref ? 'edits' : 'generations'}`, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + OPENAI_KEY(), 'content-type': 'application/json' },
    body: JSON.stringify(req),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || `OpenAI answered ${res.status}`;
    if (/safety|moderation|rejected/i.test(msg)) throw new Error("OpenAI's safety check rejected this request. Try different artwork ideas.");
    if (/billing|quota|credit/i.test(msg)) throw new Error('The OpenAI account is out of credit. Add credit at platform.openai.com.');
    if (res.status === 401) throw new Error('OpenAI didn\'t accept the API key. Check OPENAI_API_KEY in Supabase (Edge Functions > Secrets).');
    throw new Error(msg);
  }
  const b64 = data && data.data && data.data[0] && data.data[0].b64_json;
  if (!b64) throw new Error('OpenAI did not return an image.');
  const path = `campaigns/${job.campaign_id}/art/${job.id}.jpg`;
  const up = await fetch(`${URL_()}/storage/v1/object/files/${path}`, { method: 'POST', headers: svcHeaders({ 'content-type': 'image/jpeg', 'x-upsert': 'true' }), body: b64ToBytes(b64) });
  if (!up.ok) throw new Error(`Couldn't save the artwork (${up.status}).`);
  return path;
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method === 'GET') return json({ ready: !!OPENAI_KEY() });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  const user = await signedInUser(req);
  if (!user) return json({ error: 'Please sign in again.' }, 401);
  if (!env('OPENAI_API_KEY')) return json({ error: "AI artwork isn't set up yet. Add OPENAI_API_KEY in Supabase under Edge Functions > Secrets." }, 503);
  if (!OPENAI_KEY()) return json({ error: `Couldn't find an OpenAI key in the OPENAI_API_KEY secret. ${describeSecret(env('OPENAI_API_KEY'))} An OpenAI key starts with sk- and is one long line.` }, 503);
  const body = await req.json().catch(() => ({}));
  const id = String(body.jobId || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Bad request.' }, 400);
  // Claim the job so it only runs once.
  const claimed = await rest(`graphics_jobs?id=eq.${id}&status=eq.queued`, { method: 'PATCH', body: JSON.stringify({ status: 'working', error: '', updated_at: new Date().toISOString() }) });
  const job = claimed && claimed[0];
  if (!job) return json({ error: 'That graphic is already being made.' }, 409);
  const camps = await rest(`campaigns?id=eq.${job.campaign_id}&select=title,description,location`);
  const camp = (camps && camps[0]) || {};
  const work = (async () => {
    try { const path = await makeArt(job, camp); await setJob(id, { status: 'art', art_path: path }); }
    catch (e) { await setJob(id, { status: 'failed', error: String((e as Error).message || e).slice(0, 400) }).catch(() => {}); }
  })();
  // Keep running after we answer, so closing the page doesn't stop the artwork.
  // @ts-ignore EdgeRuntime is provided by Supabase
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) { /* @ts-ignore */ EdgeRuntime.waitUntil(work); return json({ ok: true, status: 'working' }, 202); }
  await work;
  return json({ ok: true });
}

Deno.serve(handler);

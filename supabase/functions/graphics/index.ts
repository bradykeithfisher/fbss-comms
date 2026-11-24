// FBSS Communication Calendar: AI artwork for campaign graphics (Supabase Edge Function "graphics").
//
// The app adds a row to graphics_jobs, then calls this function with the row's id. This function
// asks OpenAI for a finished design (lettering included) in the right shape, saves it to Storage
// (files/campaigns/<id>/art/) and marks the row 'art'. The app then saves the finished files to the campaign.
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

// The image's pixel size for each kind. All multiples of 16, as the image models require.
export const SIZES: Record<string, [number, number]> = {
  concept: [2048, 1152],    // 16:9; the chosen concept is the title graphic
  title: [2048, 1152],
  background: [2048, 1152], // the chosen design with the words removed
  wide: [2048, 1152],
  poster: [2592, 3024],     // 6:7, the shape of a 36 x 42 inch poster
  social: [1088, 1360],     // 4:5, for Facebook and Instagram
};
const FORMAT: Record<string, string> = {
  concept: 'A wide 16:9 title graphic for screens and slides.',
  title: 'A wide 16:9 title graphic for screens and slides.',
  wide: 'A wide 16:9 title graphic for screens and slides.',
  poster: 'A tall 36 x 42 inch printed poster (6:7). Give the title a strong poster layout with comfortable margins.',
  social: 'A vertical 4:5 Instagram and Facebook post. Keep the title large and readable on a phone, with comfortable margins.',
};
// The title graphic and title-only social posts carry just the title. The poster, and social posts marked
// "with details", also carry the event details the staff typed (date and time, place, an extra line).
function wordsFor(kind: string, opts: Record<string, any>, t: Record<string, string>) {
  const title = String(t.title).trim().slice(0, 120);
  const details = kind === 'poster' || (kind === 'social' && opts.details)
    ? [['Date and time', t.when], ['Place', t.where], ['Extra line', t.extra]].filter(([, v]) => String(v || '').trim()) : [];
  if (!details.length) return [
    `The only words on the graphic are the title, spelled exactly: "${title}". Make the title a designed part of the artwork (its lettering style, size and placement belong to the design).`,
    `No other words, letters or numbers anywhere. No logos, no watermarks, no made-up text.`,
  ];
  return [
    `Words on the graphic, each spelled exactly as written:\n- Title (the largest, most designed element, part of the artwork): "${title}"\n` + details.map(([k, v]) => `- ${k}: "${String(v).trim().slice(0, 160)}"`).join('\n'),
    `Set the details smaller and clearly readable, in a type style that suits the design, in a clean hierarchy under or around the title.`,
    `No other words, letters or numbers anywhere. No logos, no watermarks, no made-up text.`,
  ];
}
// First Baptist house style, from the FBSS Brand Guide.
export const FBSS_STYLE = `First Baptist Sulphur Springs house style (from the church's brand guide): calm, refined and warm, never loud. Warm cream (#EFE9DB) backgrounds or deep slate blue (#414A55) panels, with accents in rust (#91412D), gold (#B47E3D), moss green (#8C9077) and dusty blue (#ACBABD). Titles in an elegant classical serif set in ALL CAPS with wide letter spacing; small all-caps sans-serif subheads with wide spacing; a Baskerville-style serif for any smaller text. Generous empty space, thin hairline rules, clean alignment and minimal ornament. Optional faint tone-on-tone line art of stained-glass arches or a simple three-leaf motif. Photography, if used, is warm and natural with soft light. The feeling is welcoming, gospel-focused, authentic and unified. Do not draw the church logo.`;
// Custom images for one social post: staff pick the campaign images to match and describe what they want.
export const POST_SIZES: Record<string, [number, number]> = { feed: [1088, 1360], square: [1216, 1216], story: [1152, 2048], wide: [2048, 1152] };
const POST_SHAPE: Record<string, string> = { feed: 'a vertical 4:5 feed post', square: 'a square 1:1 post', story: 'a tall 9:16 story', wide: 'a wide 16:9 image' };
function postPrompt(camp: Record<string, string>, opts: Record<string, any>) {
  const refs = Array.isArray(opts.refs) && opts.refs.length;
  return [
    refs ? `The attached image${opts.refs.length > 1 ? 's are' : ' is'} this event's existing graphics. Make a new image that clearly belongs to the same set: the same lettering style, colors, imagery and textures.` : '',
    `Create ${POST_SHAPE[opts.shape] || POST_SHAPE.feed} for First Baptist Sulphur Springs, a Baptist church in Sulphur Springs, Texas, to post on social media. Polished, professional church media design.`,
    `Event: ${(opts.text && opts.text.title) || camp.title || 'Church event'}.`,
    opts.style === 'fbss' ? `Style: ${FBSS_STYLE}` : '',
    `What to make (from the church staff; follow this closely): ${String(opts.prompt || '').slice(0, 1500)}`,
    `Spell any words exactly as the staff wrote them. Beyond the words they asked for and the event title, add no other words. No logos or watermarks unless asked.`,
    `Keep words large and readable on a phone, with comfortable margins.`,
    `If people appear, show them from behind, in silhouette or at a distance, with no close-up faces.`,
  ].filter(Boolean).join('\n');
}
export function buildPrompt(kind: string, camp: Record<string, string>, opts: Record<string, any>) {
  if (opts.post) return postPrompt(camp, opts);
  const t = (opts.text || {}) as Record<string, string>;
  if (!t.title) t.title = camp.title || 'Church event';
  if (kind === 'background') {
    return [
      `The attached image is an approved church event graphic. Recreate it as a text-free background: remove every word, letter and number, and fill those areas naturally so the image looks complete and intentional.`,
      `Keep everything else the same: the artwork, colors, textures, borders and composition.`,
      `Do not add any new text, logos or watermarks.`,
    ].join('\n');
  }
  const desc = String(camp.description || '').replace(/\s+/g, ' ').slice(0, 600);
  return [
    opts.ref ? `The attached image is the approved design concept. Create the version described below of this same design: the same lettering style, colors, imagery, textures and overall look, re-laid-out for the new shape so it looks like part of the same set.` : '',
    `Design a finished, professional event graphic for First Baptist Sulphur Springs, a Baptist church in Sulphur Springs, Texas. It should look like the work of a skilled church graphic designer: expressive, custom-feeling lettering that is part of the design, a strong hierarchy, and imagery that fits the event.`,
    `Event: ${t.title}.${desc ? ' About it: ' + desc : ''}`,
    opts.style === 'fbss' ? `Style: ${FBSS_STYLE}` : '',
    opts.brief ? `Design direction (follow this closely${opts.style === 'fbss' ? ', within the house style' : ''}): ${String(opts.brief).slice(0, 900)}` : '',
    !opts.brief && opts.style && opts.style !== 'auto' && opts.style !== 'fbss' ? `Visual style: ${opts.style}.` : '',
    opts.notes ? `Ideas from the church staff: ${String(opts.notes).slice(0, 600)}` : '',
    `Format: ${FORMAT[kind] || FORMAT.concept}`,
    ...wordsFor(kind, opts, t),
    `If people appear, show them from behind, in silhouette or at a distance, with no close-up faces.`,
  ].filter(Boolean).join('\n');
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
  const opts = job.options || {};
  const [w, h] = opts.post ? (POST_SIZES[opts.shape] || POST_SIZES.feed) : (SIZES[job.kind] || SIZES.social);
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
  const refs = opts.post ? (Array.isArray(opts.refs) ? opts.refs.slice(0, 4).map(String) : []) : (opts.ref ? [String(opts.ref)] : []);
  if (refs.length) req.images = refs.map((p) => ({ image_url: publicFileUrl(p) }));
  const res = await fetch(`https://api.openai.com/v1/images/${refs.length ? 'edits' : 'generations'}`, {
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
  const path = job.campaign_id ? `campaigns/${job.campaign_id}/art/${job.id}.jpg` : `photos/${opts.destId || 'one-off'}/art/${job.id}.jpg`;
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
  // One-off posts have no campaign; their title comes with the job.
  const camps = job.campaign_id ? await rest(`campaigns?id=eq.${job.campaign_id}&select=title,description`) : [];
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

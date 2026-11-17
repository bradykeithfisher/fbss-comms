// Facebook Page + Instagram publishing through Meta's Graph API.
import { env, db, SUPABASE_URL } from './shared.mjs';

const GV = () => env('META_GRAPH_VERSION', 'v25.0');

export async function graph(path, params = {}, method = 'POST') {
  const url = `https://graph.facebook.com/${GV()}/${path}`;
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) body.append(k, String(v));
  const res = method === 'GET' ? await fetch(`${url}?${body}`) : await fetch(url, { method, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error ? `${data.error.message}${data.error.error_user_msg ? ' – ' + data.error.error_user_msg : ''}` : `Facebook error ${res.status}`);
  return data;
}

export async function getAccount() {
  const rows = await db('social_accounts?id=eq.1&select=*');
  return rows[0] || null;
}

export const publicUrl = (path) => `${SUPABASE_URL()}/storage/v1/object/public/files/${path.split('/').map(encodeURIComponent).join('/')}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitReady(containerId, token) {
  for (let i = 0; i < 15; i++) {
    const s = await graph(containerId, { fields: 'status_code', access_token: token }, 'GET');
    if (s.status_code === 'FINISHED') return;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error('Instagram could not process the photo. Use a JPEG under 8 MB.');
    await sleep(2000);
  }
  throw new Error('Instagram took too long to process the photo. Try again in a minute.');
}

export async function loadDestination(id) {
  const rows = await db(`destinations?id=eq.${encodeURIComponent(id)}&select=*,campaigns(*)`);
  const d = rows[0];
  if (!d) throw new Error('That destination no longer exists.');
  const s = await db('app_settings?id=eq.1&select=data');
  const channels = (s[0]?.data?.channels) || [];
  const ch = channels.find((c) => c.id === d.channel_id) || { kind: d.channel_id };
  return { d, camp: d.campaigns || {}, kind: ch.kind };
}

const LABEL = { facebook: 'Facebook', instagram: 'Instagram' };

async function postFacebook(acct, text, images) {
  const token = acct.page_token;
  if (!images.length) {
    const r = await graph(`${acct.page_id}/feed`, { message: text, access_token: token });
    return `https://www.facebook.com/${r.id}`;
  }
  const params = { message: text, access_token: token };
  for (let i = 0; i < images.length; i++) {
    const p = await graph(`${acct.page_id}/photos`, { url: publicUrl(images[i]), published: 'false', access_token: token });
    params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: p.id });
  }
  const r = await graph(`${acct.page_id}/feed`, params);
  return `https://www.facebook.com/${r.id}`;
}

async function postInstagram(acct, text, images) {
  const token = acct.page_token;
  let containerId;
  if (images.length === 1) {
    containerId = (await graph(`${acct.ig_user_id}/media`, { image_url: publicUrl(images[0]), caption: text, access_token: token })).id;
  } else {
    const kids = [];
    for (const p of images) {
      const c = await graph(`${acct.ig_user_id}/media`, { image_url: publicUrl(p), is_carousel_item: 'true', access_token: token });
      await waitReady(c.id, token);
      kids.push(c.id);
    }
    containerId = (await graph(`${acct.ig_user_id}/media`, { media_type: 'CAROUSEL', children: kids.join(','), caption: text, access_token: token })).id;
  }
  await waitReady(containerId, token);
  const pub = await graph(`${acct.ig_user_id}/media_publish`, { creation_id: containerId, access_token: token });
  try { return (await graph(pub.id, { fields: 'permalink', access_token: token }, 'GET')).permalink || ''; } catch { return ''; }
}

// Publishes one destination now. "social" destinations go to Facebook and Instagram.
// Each platform is recorded as it succeeds, so a retry never double-posts. Returns { url, parts }.
export async function publishDestination(id) {
  const { d, camp, kind } = await loadDestination(id);
  const platforms = kind === 'social' ? ['facebook', 'instagram'] : (kind === 'facebook' || kind === 'instagram') ? [kind] : [];
  if (!platforms.length) throw new Error('Only Facebook, Instagram and Social destinations can post automatically.');
  if (d.published_at) throw new Error('This was already posted.');
  const acct = await getAccount();
  if (!acct) throw new Error('Facebook and Instagram are not connected yet. An admin can connect them in Settings.');
  const text = (d.copy || '').trim();
  const images = (d.image_paths && d.image_paths.length ? d.image_paths : (camp.cover_path ? [camp.cover_path] : [])).slice(0, 10);
  const parts = { ...(d.published_parts || {}) };
  const todo = platforms.filter((p) => !parts[p]);

  // Check everything first so a Social post never goes out on only one platform because of a fixable problem.
  if (todo.includes('facebook') && !text && !images.length) throw new Error('Add a caption or a photo first.');
  if (todo.includes('instagram')) {
    if (!acct.ig_user_id) throw new Error('No Instagram professional account is linked to the connected Facebook Page.');
    if (!images.length) throw new Error('Instagram posts need at least one photo.');
    if (text.length > 2200) throw new Error('Instagram captions must be 2,200 characters or fewer.');
    if (images.find((p) => !/\.jpe?g$/i.test(p))) throw new Error('Instagram only accepts JPEG photos. Re-add the photo in this app (it converts photos to JPEG automatically).');
  }

  const errors = [];
  for (const p of todo) {
    try {
      const url = p === 'facebook' ? await postFacebook(acct, text, images) : await postInstagram(acct, text, images);
      parts[p] = { url, at: new Date().toISOString() };
      await db(`destinations?id=eq.${d.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { published_parts: parts } });
    } catch (e) {
      errors.push(`${LABEL[p]}: ${e.message}`);
    }
  }
  if (errors.length) {
    const done = platforms.filter((p) => parts[p]).map((p) => LABEL[p]);
    throw new Error((done.length ? `Posted to ${done.join(' and ')}, but ` : '') + errors.join(' '));
  }
  const url = (parts.facebook && parts.facebook.url) || (parts.instagram && parts.instagram.url) || '';
  await db(`destinations?id=eq.${d.id}`, {
    method: 'PATCH', prefer: 'return=minimal',
    body: { status: 'posted', published_at: new Date().toISOString(), external_url: url, publish_error: '', publish_lock: null, published_parts: parts },
  });
  return { url, parts };
}

export async function recordFailure(id, message) {
  await db(`destinations?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', prefer: 'return=minimal', body: { publish_error: String(message).slice(0, 500), publish_lock: null } });
}

// Claim a destination so two runs never post it twice.
export async function claim(id) {
  const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const rows = await db(`destinations?id=eq.${encodeURIComponent(id)}&published_at=is.null&or=(publish_lock.is.null,publish_lock.lt.${stale})`, {
    method: 'PATCH', prefer: 'return=representation', body: { publish_lock: new Date().toISOString() },
  });
  return rows.length > 0;
}

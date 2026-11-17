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
export const isVideo = (path) => /\.(mp4|mov|m4v)$/i.test(path || '');

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
const MAX_PROCESSING_MS = 45 * 60 * 1000;

// Moves one Facebook/Instagram/Social destination as far along as it can before `deadline` (a timestamp).
// Nothing ever waits on Meta: work in progress (uploaded photos, Instagram containers still processing)
// is saved in publish_state and picked up on the next call. The scheduler calls this every 5 minutes.
// Returns { done, processing, url, parts }. Throws a readable message on failure.
export async function advanceDestination(id, deadline = Date.now() + 7000) {
  const { d, camp, kind } = await loadDestination(id);
  const platforms = kind === 'social' ? ['facebook', 'instagram'] : (kind === 'facebook' || kind === 'instagram') ? [kind] : [];
  if (!platforms.length) throw new Error('Only Facebook, Instagram and Social destinations can post automatically.');
  if (d.published_at) throw new Error('This was already posted.');
  if (d.campaign_id && camp.status && camp.status !== 'approved') throw new Error('This campaign has not been approved yet, so it can\'t be posted.');
  const acct = await getAccount();
  if (!acct) throw new Error('Facebook and Instagram are not connected yet. An admin can connect them in Settings.');
  const token = acct.page_token;
  const text = (d.copy || '').trim();
  const media = (d.image_paths && d.image_paths.length ? d.image_paths : (camp.cover_path ? [camp.cover_path] : [])).slice(0, 10);
  const video = media.find(isVideo);
  const parts = { ...(d.published_parts || {}) };
  const state = { ...(d.publish_state || {}) };
  const todo = platforms.filter((p) => !parts[p]);
  const left = () => deadline - Date.now();
  const save = () => db(`destinations?id=eq.${d.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { published_parts: parts, publish_state: state } });

  // Check everything first so a Social post never goes out on only one platform because of a fixable problem.
  if (video && media.length > 1) throw new Error('A video post can have just the one video. Remove the other photos or videos, or split them into separate posts.');
  if (todo.includes('facebook') && !text && !media.length) throw new Error('Add a caption, a photo or a video first.');
  if (todo.includes('instagram')) {
    if (!acct.ig_user_id) throw new Error('No Instagram professional account is linked to the connected Facebook Page.');
    if (!media.length) throw new Error('Instagram posts need a photo or a video.');
    if (text.length > 2200) throw new Error('Instagram captions must be 2,200 characters or fewer.');
    if (!video && media.find((p) => !/\.jpe?g$/i.test(p))) throw new Error('Instagram only accepts JPEG photos. Re-add the photo in this app (it converts photos to JPEG automatically).');
  }

  const errors = [];
  let processing = false;
  for (const p of todo) {
    try {
      if (p === 'facebook') {
        if (video) {
          const r = await graph(`${acct.page_id}/videos`, { file_url: publicUrl(video), description: text, access_token: token });
          parts.facebook = { url: `https://www.facebook.com/${acct.page_id}/videos/${r.id}`, at: new Date().toISOString() };
        } else if (!media.length) {
          const r = await graph(`${acct.page_id}/feed`, { message: text, access_token: token });
          parts.facebook = { url: `https://www.facebook.com/${r.id}`, at: new Date().toISOString() };
        } else {
          const st = state.facebook || { photos: [] };
          while (st.photos.length < media.length && left() > 2500) {
            const ph = await graph(`${acct.page_id}/photos`, { url: publicUrl(media[st.photos.length]), published: 'false', access_token: token });
            st.photos.push(ph.id);
            state.facebook = st; await save();
          }
          if (st.photos.length < media.length || left() < 2000) { state.facebook = st; processing = true; continue; }
          const params = { message: text, access_token: token };
          st.photos.forEach((fbid, i) => { params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: fbid }); });
          const r = await graph(`${acct.page_id}/feed`, params);
          parts.facebook = { url: `https://www.facebook.com/${r.id}`, at: new Date().toISOString() };
          delete state.facebook;
        }
        await save();
      } else {
        const st = state.instagram || { started: Date.now() };
        if (Date.now() - st.started > MAX_PROCESSING_MS) { delete state.instagram; await save(); throw new Error('Instagram took too long to process this. Try again, or use a shorter video.'); }
        if (!st.container) {
          if (video) {
            st.container = (await graph(`${acct.ig_user_id}/media`, { media_type: 'REELS', video_url: publicUrl(video), caption: text, share_to_feed: 'true', access_token: token })).id;
          } else if (media.length === 1) {
            st.container = (await graph(`${acct.ig_user_id}/media`, { image_url: publicUrl(media[0]), caption: text, access_token: token })).id;
          } else {
            st.children = st.children || [];
            while (st.children.length < media.length && left() > 2500) {
              st.children.push((await graph(`${acct.ig_user_id}/media`, { image_url: publicUrl(media[st.children.length]), is_carousel_item: 'true', access_token: token })).id);
              state.instagram = st; await save();
            }
            if (st.children.length < media.length) { state.instagram = st; processing = true; continue; }
            let kidsReady = true;
            for (const kid of st.children) {
              const k = await graph(kid, { fields: 'status_code', access_token: token }, 'GET');
              if (k.status_code === 'ERROR' || k.status_code === 'EXPIRED') { delete state.instagram; await save(); throw new Error('Instagram could not process one of the photos. Use JPEGs under 8 MB.'); }
              if (k.status_code !== 'FINISHED') { kidsReady = false; break; }
            }
            if (!kidsReady) { state.instagram = st; processing = true; await save(); continue; }
            st.container = (await graph(`${acct.ig_user_id}/media`, { media_type: 'CAROUSEL', children: st.children.join(','), caption: text, access_token: token })).id;
          }
          state.instagram = st; await save();
        }
        if (left() < 1500) { processing = true; continue; }
        const c = await graph(st.container, { fields: 'status_code,status', access_token: token }, 'GET');
        if (c.status_code === 'ERROR' || c.status_code === 'EXPIRED') {
          delete state.instagram; await save();
          throw new Error(video ? 'Instagram could not process the video. Use an MP4 or MOV, ideally vertical (9:16), and try again.' : 'Instagram could not process the photo. Use a JPEG under 8 MB.');
        }
        if (c.status_code !== 'FINISHED') { processing = true; continue; }
        const pub = await graph(`${acct.ig_user_id}/media_publish`, { creation_id: st.container, access_token: token });
        let url = '';
        try { url = (await graph(pub.id, { fields: 'permalink', access_token: token }, 'GET')).permalink || ''; } catch { url = ''; }
        parts.instagram = { url, at: new Date().toISOString() };
        delete state.instagram;
        await save();
      }
    } catch (e) {
      errors.push(`${LABEL[p]}: ${e.message}`);
    }
  }

  if (errors.length) {
    const done = platforms.filter((p) => parts[p]).map((p) => LABEL[p]);
    await db(`destinations?id=eq.${d.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { published_parts: parts, publish_state: state, publish_pending: false } });
    throw new Error((done.length ? `Posted to ${done.join(' and ')}, but ` : '') + errors.join(' '));
  }
  if (processing) {
    await db(`destinations?id=eq.${d.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { published_parts: parts, publish_state: state, publish_pending: true, publish_lock: null, publish_error: '' } });
    return { done: false, processing: true, parts };
  }
  const url = (parts.facebook && parts.facebook.url) || (parts.instagram && parts.instagram.url) || '';
  await db(`destinations?id=eq.${d.id}`, {
    method: 'PATCH', prefer: 'return=minimal',
    body: { status: 'posted', published_at: new Date().toISOString(), external_url: url, publish_error: '', publish_lock: null, published_parts: parts, publish_state: {}, publish_pending: false },
  });
  return { done: true, url, parts };
}

export async function recordFailure(id, message) {
  await db(`destinations?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', prefer: 'return=minimal', body: { publish_error: String(message).slice(0, 500), publish_lock: null, publish_pending: false } });
}

// Claim a destination so two runs never post it twice.
export async function claim(id) {
  const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const rows = await db(`destinations?id=eq.${encodeURIComponent(id)}&published_at=is.null&or=(publish_lock.is.null,publish_lock.lt.${stale})`, {
    method: 'PATCH', prefer: 'return=representation', body: { publish_lock: new Date().toISOString() },
  });
  return rows.length > 0;
}

// Public: gives the request form a one-time upload link for one file.
import { json, fail, SUPABASE_URL, serviceFetch, env } from '../lib/shared.mjs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const safe = (n) => String(n || 'file').normalize('NFKD').replace(/[^\w.\-]+/g, '-').replace(/-+/g, '-').slice(-80);
export default async (req) => {
  if (req.method !== 'POST') return fail('Use POST', 405);
  const { submissionId, name, size, index } = await req.json().catch(() => ({}));
  if (!UUID.test(String(submissionId || ''))) return fail('Bad submission.');
  if (!name) return fail('Missing file name.');
  const maxMb = Number(env('MAX_UPLOAD_MB', '50')) || 50;
  if (Number(size) > maxMb * 1024 * 1024) return fail(`${name} is over ${maxMb} MB.`);
  if (Number(index) > 15) return fail('Please upload 15 files or fewer.');
  const path = `requests/${submissionId}/${String(Number(index) || 0).padStart(2, '0')}-${safe(name)}`;
  const res = await serviceFetch(`${SUPABASE_URL()}/storage/v1/object/upload/sign/files/${path.split('/').map(encodeURIComponent).join('/')}`, { method: 'POST', body: '{}' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) return fail(data.message || data.error || 'Could not prepare the upload.', 502);
  const token = new URL(data.url, 'https://x.invalid').searchParams.get('token');
  return json({ path, token });
};
export const config = { path: '/api/request-upload' };

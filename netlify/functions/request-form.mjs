// Public: tells the request form which destinations to offer. No login needed.
import { json, db } from '../lib/shared.mjs';
export default async () => {
  const s = await db('app_settings?id=eq.1&select=data');
  const data = s[0]?.data || {};
  const channels = (data.channels || []).map((c) => ({ id: c.id, name: c.name, kind: c.kind, icon: c.icon || '' }));
  return json({ channels });
};
export const config = { path: '/api/request-form' };

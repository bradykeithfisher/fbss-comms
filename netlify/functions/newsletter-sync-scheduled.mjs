// Every hour: keeps the Newsletter Studio's draft in step with this week's Weekly Update items.
import { newsletterReady, syncNewsletter } from '../lib/newsletter.mjs';
export default async () => {
  if (!newsletterReady()) return new Response('newsletter not connected');
  try { const r = await syncNewsletter(); return new Response(JSON.stringify(r)); }
  catch (e) { console.error('Newsletter sync failed:', e.message); return new Response(e.message, { status: 500 }); }
};
export const config = { schedule: '0 * * * *' };

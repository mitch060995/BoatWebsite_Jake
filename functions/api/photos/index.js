// POST /api/photos  (body: the image bytes) -> { path: "photos/<uuid>" }  (owner only)
// The admin page shrinks photos in the browser first, so uploads are usually a few hundred KB.
import { json, guard } from '../../../server/lib.js';

const TYPES = ['image/jpeg', 'image/webp', 'image/png'];
const MAX_BYTES = 8 * 1024 * 1024;

export async function onRequestPost({ request, env }) {
  const denied = await guard(request, env);
  if (denied) return denied;

  const type = (request.headers.get('content-type') || '').split(';')[0].trim();
  if (!TYPES.includes(type)) return json({ error: 'Photos must be JPEG, WebP or PNG.' }, 415);
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) return json({ error: 'That photo was empty.' }, 400);
  if (bytes.byteLength > MAX_BYTES) return json({ error: 'That photo is too large (8 MB max).' }, 413);

  const id = crypto.randomUUID();
  await env.LISTINGS.put(`photo:${id}`, bytes, { metadata: { type } });
  return json({ path: `photos/${id}` });
}

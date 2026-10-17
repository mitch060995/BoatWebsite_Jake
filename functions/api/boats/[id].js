// DELETE /api/boats/:id -> removes the boat and its photos (owner only)
import { json, guard, getBoats, putBoats, photoKey } from '../../../server/lib.js';

export async function onRequestDelete({ request, env, params }) {
  const denied = await guard(request, env);
  if (denied) return denied;

  const boats = await getBoats(env);
  const boat = boats.find(b => b.id === params.id);
  if (!boat) return json({ error: 'That boat no longer exists.' }, 404);

  await putBoats(env, boats.filter(b => b.id !== params.id));
  await Promise.all((boat.photos || []).map(p => env.LISTINGS.delete(photoKey(p))));
  return json({ ok: true });
}

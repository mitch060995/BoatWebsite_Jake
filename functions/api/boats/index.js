// GET  /api/boats        -> published boats (public)
// GET  /api/boats?all=1  -> every boat including drafts (owner only)
// POST /api/boats        -> create or update one boat (owner only); returns the saved boat
import { json, guard, isAdmin, getBoats, putBoats, cleanBoat, sortBoats, photoKey } from '../../../server/lib.js';

export async function onRequestGet({ request, env }) {
  if (!env.LISTINGS) return json([]);
  const wantAll = new URL(request.url).searchParams.has('all');
  if (wantAll && !(await isAdmin(request, env))) return json({ error: 'Please sign in again.' }, 401);
  const boats = sortBoats(await getBoats(env));
  return wantAll
    ? json(boats)
    : json(boats.filter(b => b.status !== 'draft'), 200, { 'cache-control': 'public, max-age=30' });
}

export async function onRequestPost({ request, env }) {
  const denied = await guard(request, env);
  if (denied) return denied;

  let input;
  try { input = await request.json(); } catch { return json({ error: 'Couldn’t read that boat.' }, 400); }
  const boat = cleanBoat(input);
  if (!boat.title) return json({ error: 'Every boat needs a title.' }, 400);

  const boats = await getBoats(env);
  const now = new Date().toISOString();
  const i = input.id ? boats.findIndex(b => b.id === input.id) : -1;
  let saved;
  if (i >= 0) {
    const old = boats[i];
    saved = { ...boat, id: old.id, created_at: old.created_at, updated_at: now };
    boats[i] = saved;
    // photos taken off this boat are deleted from storage
    const gone = (old.photos || []).filter(p => !saved.photos.includes(p));
    await Promise.all(gone.map(p => env.LISTINGS.delete(photoKey(p))));
  } else {
    saved = { ...boat, id: crypto.randomUUID(), created_at: now, updated_at: now };
    boats.push(saved);
  }
  await putBoats(env, boats);
  return json(saved);
}

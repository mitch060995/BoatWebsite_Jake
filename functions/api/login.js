// POST /api/login  { password }  -> sets the owner's session cookie
import { json, passwordMatches, newSessionCookie } from '../../server/lib.js';

const MAX_TRIES = 8;            // per IP address
const LOCKOUT_SECONDS = 900;    // 15 minutes

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_PASSWORD) return json({ error: 'The admin password hasn’t been set up yet.' }, 500);
  if (!env.LISTINGS) return json({ error: 'Storage is not connected (LISTINGS binding missing).' }, 500);

  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const failKey = `fail:${ip}`;
  const fails = Number(await env.LISTINGS.get(failKey)) || 0;
  if (fails >= MAX_TRIES) return json({ error: 'Too many attempts. Wait 15 minutes and try again.' }, 429);

  let body = {};
  try { body = await request.json(); } catch { /* empty or not JSON */ }

  if (!(await passwordMatches(env, body.password))) {
    await env.LISTINGS.put(failKey, String(fails + 1), { expirationTtl: LOCKOUT_SECONDS });
    return json({ error: 'That password isn’t right.' }, 401);
  }
  if (fails) await env.LISTINGS.delete(failKey);
  return json({ ok: true }, 200, { 'set-cookie': await newSessionCookie(env) });
}

/* Shared helpers for the Cloudflare Pages Functions in /functions.
   Storage is one KV namespace bound as LISTINGS:
     "boats"          -> JSON array of listings
     "photo:<uuid>"   -> image bytes (metadata: { type })
     "fail:<ip>"      -> failed-login counter (expires after 15 minutes)
   The owner's password is the ADMIN_PASSWORD environment variable (set as a secret in Cloudflare). */

const enc = new TextEncoder();
const SESSION_DAYS = 30;
export const STATUSES = ['draft', 'for_sale', 'under_offer', 'sold'];

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmac(env, message) {
  if (!env.ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD is not set');
  // Sessions are signed with a key derived from the password, so changing the password signs everyone out
  const key = await crypto.subtle.importKey('raw', enc.encode(`fms-session:${env.ADMIN_PASSWORD}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

function sameString(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function passwordMatches(env, given) {
  if (!env.ADMIN_PASSWORD || typeof given !== 'string') return false;
  // compare digests so the time taken doesn't leak anything about the password
  return sameString(await hmac(env, `pw:${given}`), await hmac(env, `pw:${env.ADMIN_PASSWORD}`));
}

export async function newSessionCookie(env) {
  const exp = String(Date.now() + SESSION_DAYS * 864e5);
  return `fms_session=${exp}.${await hmac(env, exp)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}`;
}
export const clearSessionCookie = 'fms_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';

export async function isAdmin(request, env) {
  const m = (request.headers.get('cookie') || '').match(/(?:^|;\s*)fms_session=([^;]+)/);
  if (!m || !env.ADMIN_PASSWORD) return false;
  const [exp, sig] = m[1].split('.');
  if (!exp || !sig || !(Number(exp) > Date.now())) return false;
  return sameString(await hmac(env, exp), sig);
}

// Changes must come from this site (blocks cross-site form tricks on top of SameSite cookies)
function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

/** Returns a Response to send back if the request isn't from the signed-in owner, otherwise null. */
export async function guard(request, env) {
  if (!env.LISTINGS) return json({ error: 'Storage is not connected (LISTINGS binding missing).' }, 500);
  if (!sameOrigin(request)) return json({ error: 'Bad origin.' }, 403);
  if (!(await isAdmin(request, env))) return json({ error: 'Please sign in again.' }, 401);
  return null;
}

export const getBoats = async env => (await env.LISTINGS.get('boats', 'json')) || [];
export const putBoats = (env, boats) => env.LISTINGS.put('boats', JSON.stringify(boats));

export const PHOTO_PATH = /^photos\/[0-9a-f-]{36}$/;
export const photoKey = path => `photo:${path.slice('photos/'.length)}`;

/** Keep only known fields, with the right types and sensible lengths. */
export function cleanBoat(input) {
  const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  const num = (v, int) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return null;
    return int ? Math.round(n) : Math.round(n * 100) / 100;
  };
  return {
    title: str(input.title, 120),
    status: STATUSES.includes(input.status) ? input.status : 'draft',
    price: num(input.price, true),
    price_label: str(input.price_label, 40),
    year: num(input.year, true),
    make: str(input.make, 60),
    model: str(input.model, 60),
    length_m: num(input.length_m, false),
    engine: str(input.engine, 80),
    engine_hours: num(input.engine_hours, true),
    location: str(input.location, 80),
    description: str(input.description, 5000),
    photos: Array.isArray(input.photos) ? input.photos.filter(p => typeof p === 'string' && PHOTO_PATH.test(p)).slice(0, 40) : [],
    sort: num(input.sort, true) ?? 0,
  };
}

/** Public order: lowest "order on site" first, then newest. */
export const sortBoats = boats =>
  [...boats].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || String(b.created_at).localeCompare(String(a.created_at)));

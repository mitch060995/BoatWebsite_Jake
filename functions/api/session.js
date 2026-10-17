// GET /api/session -> { admin: true|false }
import { json, isAdmin } from '../../server/lib.js';

export async function onRequestGet({ request, env }) {
  return json({ admin: await isAdmin(request, env), ready: Boolean(env.ADMIN_PASSWORD && env.LISTINGS) });
}

// GET /api/session -> { admin: true|false, ready, missing: [settings not set up yet] }
import { json, isAdmin } from '../../server/lib.js';

export async function onRequestGet({ request, env }) {
  const missing = [!env.ADMIN_PASSWORD && 'ADMIN_PASSWORD', !env.LISTINGS && 'LISTINGS'].filter(Boolean);
  return json({ admin: await isAdmin(request, env), ready: !missing.length, missing });
}

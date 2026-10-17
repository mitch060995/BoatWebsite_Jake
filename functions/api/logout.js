// POST /api/logout -> clears the session cookie
import { json, clearSessionCookie } from '../../server/lib.js';

export const onRequestPost = () => json({ ok: true }, 200, { 'set-cookie': clearSessionCookie });

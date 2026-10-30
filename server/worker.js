// Cloudflare Worker entry (used when the site is deployed as a Worker with `wrangler deploy`).
// It runs the same handlers as Pages Functions in functions/, so the site works either way:
// /api/* and /photos/* go to the matching handler, everything else is a static file.
import * as boats from '../functions/api/boats/index.js';
import * as boat from '../functions/api/boats/[id].js';
import * as contact from '../functions/api/contact.js';
import * as contactFile from '../functions/api/contact-file/[id].js';
import * as login from '../functions/api/login.js';
import * as logout from '../functions/api/logout.js';
import * as photos from '../functions/api/photos/index.js';
import * as session from '../functions/api/session.js';
import * as photo from '../functions/photos/[id].js';

const ROUTES = [
  [/^\/api\/boats\/?$/, boats],
  [/^\/api\/boats\/([^/]+)$/, boat],
  [/^\/api\/contact\/?$/, contact],
  [/^\/api\/contact-file\/([^/]+)$/, contactFile],
  [/^\/api\/login\/?$/, login],
  [/^\/api\/logout\/?$/, logout],
  [/^\/api\/photos\/?$/, photos],
  [/^\/api\/session\/?$/, session],
  [/^\/photos\/([^/]+)$/, photo],
];

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    for (const [pattern, mod] of ROUTES) {
      const match = pathname.match(pattern);
      if (!match) continue;
      const method = request.method === 'HEAD' ? 'Get' : request.method[0] + request.method.slice(1).toLowerCase();
      const handler = mod[`onRequest${method}`];
      if (!handler) return new Response('Method not allowed', { status: 405 });
      return handler({
        request, env,
        params: { id: match[1] && decodeURIComponent(match[1]) },
        waitUntil: p => ctx.waitUntil(p),
        next: () => env.ASSETS.fetch(request),
        data: {},
      });
    }
    if (pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
    return env.ASSETS.fetch(request);
  },
};

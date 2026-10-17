// GET /photos/:id -> the stored photo (public). Photos never change once uploaded, so they're cached for a year.
export async function onRequestGet({ request, env, params, waitUntil }) {
  if (!/^[0-9a-f-]{36}$/.test(params.id) || !env.LISTINGS) return new Response('Not found', { status: 404 });

  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) return hit;

  const { value, metadata } = await env.LISTINGS.getWithMetadata(`photo:${params.id}`, 'arrayBuffer');
  if (!value) return new Response('Not found', { status: 404 });

  const res = new Response(value, {
    headers: {
      'content-type': metadata?.type || 'image/jpeg',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
  waitUntil(cache.put(request, res.clone()));
  return res;
}

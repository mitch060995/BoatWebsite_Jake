// GET /api/contact-file/:id -> an attachment from a contact-form enquiry (kept 7 days).
// The id is long and random, and is only ever sent to the owner's inbox (and to Resend to attach it).
export async function onRequestGet({ env, params }) {
  if (!env.LISTINGS || !/^[0-9a-f-]{36}[0-9a-f-]{8}$/.test(params.id)) return new Response('Not found', { status: 404 });
  const { value, metadata } = await env.LISTINGS.getWithMetadata(`upload:${params.id}`, 'arrayBuffer');
  if (!value) return new Response('This file has expired or doesn’t exist.', { status: 404 });
  const name = (metadata?.filename || 'attachment').replace(/"/g, '');
  return new Response(value, {
    headers: {
      'content-type': metadata?.type || 'application/octet-stream',
      'content-disposition': `inline; filename="${name}"`,
      'cache-control': 'private, max-age=3600',
      'x-robots-tag': 'noindex',
    },
  });
}

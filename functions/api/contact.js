// POST /api/contact  (multipart form: name, email, topic, message, files[], company = honeypot)
// Emails the enquiry to the owner through Resend (https://resend.com), with any photos/PDFs attached.
//
// Settings (Cloudflare Pages → Settings → Variables and Secrets):
//   RESEND_API_KEY  (secret, required)   API key from Resend
//   CONTACT_TO      (optional)           defaults to admin@frasermarinesales.com.au
//   CONTACT_FROM    (optional)           e.g. "Fraser Marine Sales website <website@frasermarinesales.com.au>"
//                                        (needs the domain verified in Resend; defaults to Resend's test sender)
//
// Attachments are stored for 7 days in the LISTINGS KV namespace and handed to Resend as links
// (/api/contact-file/<id>), which it downloads and attaches. Doing it this way keeps the function well
// inside the free plan's per-request CPU limit, even with large photos.
import { json } from '../../server/lib.js';

const TO = 'admin@frasermarinesales.com.au';
const FROM = 'Fraser Marine Sales website <onboarding@resend.dev>';
const MAX_FILES = 6;
const MAX_FILE = 10 * 1024 * 1024;
const MAX_TOTAL = 25 * 1024 * 1024;
const FILE_TTL = 7 * 24 * 3600;
const PER_HOUR = 6;   // enquiries per IP address per hour
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = (v, max) => String(v ?? '').replace(/\r/g, '').trim().slice(0, max);
const safeName = n => String(n || 'file').replace(/[^\w.\- ()]+/g, '_').slice(0, 80) || 'file';

export async function onRequestPost({ request, env }) {
  const wantsHtml = !(request.headers.get('accept') || '').includes('application/json');
  const reply = (body, status = 200) => (wantsHtml
    ? Response.redirect(new URL(status === 200 ? '/?sent=1#contact' : '/?sent=0#contact', request.url).href, 303)
    : json(body, status));

  if (!env.RESEND_API_KEY) return reply({ error: 'Email isn’t set up on this site yet. Please email admin@frasermarinesales.com.au directly.' }, 503);

  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return reply({ error: 'Bad origin.' }, 403);

  let form;
  try { form = await request.formData(); } catch { return reply({ error: 'Couldn’t read that message. Please try again.' }, 400); }

  // Bots fill in the hidden field; pretend it worked
  if (clean(form.get('company'), 200)) return reply({ ok: true });

  const name = clean(form.get('name'), 120);
  const email = clean(form.get('email'), 200);
  const topic = clean(form.get('topic'), 80) || 'General enquiry';
  const message = clean(form.get('message'), 8000);
  if (!name || !message) return reply({ error: 'Please add your name and a message.' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply({ error: 'Please check your email address.' }, 400);

  // Rate limit per IP (uses the same KV namespace as the listings, when it's connected)
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (env.LISTINGS) {
    const key = `contact:${ip}`;
    const count = Number(await env.LISTINGS.get(key)) || 0;
    if (count >= PER_HOUR) return reply({ error: 'Too many messages from this connection. Please try again later or email us directly.' }, 429);
    await env.LISTINGS.put(key, String(count + 1), { expirationTtl: 3600 });
  }

  // Attachments
  const uploads = form.getAll('files').filter(f => f && typeof f === 'object' && f.size > 0);
  if (uploads.length > MAX_FILES) return reply({ error: `Please attach no more than ${MAX_FILES} files.` }, 400);
  let total = 0;
  const attachments = [];
  for (const f of uploads) {
    const type = (f.type || '').toLowerCase();
    if (!TYPES.includes(type)) return reply({ error: `"${safeName(f.name)}" isn’t a photo or PDF.` }, 415);
    if (f.size > MAX_FILE) return reply({ error: `"${safeName(f.name)}" is over 10 MB.` }, 413);
    total += f.size;
    if (total > MAX_TOTAL) return reply({ error: 'Attachments are over 25 MB in total. Please send fewer or smaller files.' }, 413);
    if (!env.LISTINGS) return reply({ error: 'Attachments aren’t available yet. Please send your message without files, or email them directly.' }, 503);
    const id = `${crypto.randomUUID()}${crypto.randomUUID().slice(0, 8)}`;
    const filename = safeName(f.name);
    await env.LISTINGS.put(`upload:${id}`, await f.arrayBuffer(), { expirationTtl: FILE_TTL, metadata: { type, filename } });
    attachments.push({ filename, path: new URL(`/api/contact-file/${id}`, request.url).href });
  }

  const subject = `Website enquiry: ${topic} – ${name}`;
  const text = [
    `Name: ${name}`, `Email: ${email}`, `Interested in: ${topic}`, '', message, '',
    attachments.length ? `Attachments (also downloadable for 7 days):\n${attachments.map(a => `${a.filename}: ${a.path}`).join('\n')}` : '',
    '', 'Reply to this email to answer them directly.',
  ].join('\n');
  const html = `
    <div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#0b1b26">
      <h2 style="margin:0 0 12px;color:#06304a">New website enquiry</h2>
      <table cellpadding="4" style="border-collapse:collapse">
        <tr><td><b>Name</b></td><td>${esc(name)}</td></tr>
        <tr><td><b>Email</b></td><td><a href="mailto:${esc(email)}">${esc(email)}</a></td></tr>
        <tr><td><b>Interested in</b></td><td>${esc(topic)}</td></tr>
      </table>
      <p style="white-space:pre-wrap;border-left:3px solid #9fd5f1;padding-left:12px">${esc(message)}</p>
      ${attachments.length ? `<p><b>Attachments</b> (attached, and downloadable for 7 days):<br>${attachments.map(a => `<a href="${esc(a.path)}">${esc(a.filename)}</a>`).join('<br>')}</p>` : ''}
      <p style="color:#5b6b75;font-size:13px">Reply to this email to answer ${esc(name)} directly.</p>
    </div>`;

  const res = await fetch(env.RESEND_API_URL || 'https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.CONTACT_FROM || FROM,
      to: [env.CONTACT_TO || TO],
      reply_to: email,
      subject,
      text,
      html,
      attachments: attachments.length ? attachments : undefined,
    }),
  });
  if (!res.ok) {
    console.log('Resend error', res.status, await res.text().catch(() => ''));
    return reply({ error: 'Sorry, your message couldn’t be sent just now. Please try again, or email admin@frasermarinesales.com.au.' }, 502);
  }
  return reply({ ok: true });
}

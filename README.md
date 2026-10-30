# Fraser Marine Sales — website

Plain HTML/CSS/JS with no build step, hosted on **Cloudflare Workers**. The boat listings use Cloudflare's own
Worker functions and KV storage (both on the free plan), so there's no other service to sign up for.

```
index.html              the public site
admin/                  the owner's listings page (password login, not linked anywhere)
functions/              server code Cloudflare runs for /api/* and /photos/*
  api/login.js          password check (locks an address out for 15 min after 8 wrong tries)
  api/boats/            list, save and delete boats
  api/photos/           photo uploads
  photos/[id].js        serves photos
server/lib.js           shared helpers (sessions, validation, storage)
css/  js/               site styles and scripts (hero.js = 3D opener, listings.js = Boats for sale)
```

## One-time Cloudflare setup (website manager, about 15 minutes)

The site deploys as a Cloudflare **Worker** (`wrangler.jsonc`, entry `server/worker.js`, which runs the handlers in
`functions/`). It also still works as a Pages project if you ever use one.

1. **Create the site.** Cloudflare dashboard → *Workers & Pages* → *Create application* → import
   `BoatWebsite_Jake` from GitHub. Leave the build command empty and the deploy command as `npx wrangler deploy`.
   Click *Deploy*. The first deploy also creates the KV storage for listings and photos (bound as `LISTINGS`).
   If the build log says it couldn't create it: *Storage & Databases* → *KV* → *Create* (`fraser-listings`), copy
   its ID into `wrangler.jsonc` as `{ "binding": "LISTINGS", "id": "<id>" }`, and push.
2. **Set the owner's password.** The Worker → *Settings* → *Variables and Secrets* → *Add*:
   type **Secret**, name **`ADMIN_PASSWORD`**, value = a strong password for the owner. *Deploy*.
3. **Test it** on the `workers.dev` address: open `/admin/`, sign in, add a boat with a photo, check it shows on the
   home page, then delete it.
4. **Custom domain** (once the domain is Active in Cloudflare): the Worker → *Settings* → *Domains & Routes* →
   *Add* → *Custom domain* → `yourdomain.com.au`, and again for `www.yourdomain.com.au`.
5. **Hand over to the owner:** the address `https://yourdomain.com.au/admin/` and the password. That's all they need.

Every push to `main` redeploys automatically. Secrets and dashboard variables are kept between deploys.

### Changing the owner's password

Edit the `ADMIN_PASSWORD` secret (step 2) and click *Deploy*. This also signs out any phone or computer that was
logged in.

## For the owner: adding a boat from your phone

1. Open **yourdomain.com.au/admin/** (save it to your home screen) and sign in with your password. You stay signed
   in on that phone for 30 days.
2. Tap **+ Add a boat**, fill in the details, tap **+ Add photos** to pick pictures from your camera roll, and tap
   **Save boat**. Photos are shrunk automatically; the first one is the cover (‹ › to reorder, ✕ to remove).
3. It's live on the site straight away.

**Status:** *Draft* is hidden; *For sale*, *Under offer* and *Sold* show on the site with a badge.
To take a boat down, change its status to Draft or tap **Delete boat** (tap twice to confirm).

## Contact form email (Resend, free)

The contact form emails every enquiry, with any photos or PDFs attached, to **admin@frasermarinesales.com.au**.
It sends through [Resend](https://resend.com) (free: 3,000 emails a month, 100 a day). One-time setup:

1. Sign up at resend.com (ideally with admin@frasermarinesales.com.au).
2. *Domains* → *Add domain* → `frasermarinesales.com.au`. Add the DNS records it shows in Cloudflare
   (*DNS* → *Records*; Resend can add them for you with "Sign in to Cloudflare"), then click *Verify*.
3. *API Keys* → *Create API key* (Sending access). Copy it.
4. The Worker → *Settings* → *Variables and Secrets* → *Add*: type **Secret**, name
   **`RESEND_API_KEY`**, value = the key. Also add a plain variable **`CONTACT_FROM`** =
   `Fraser Marine Sales website <website@frasermarinesales.com.au>`.
5. Click *Deploy*, then send a test message from the site.

Notes:
- Until the domain is verified, Resend's test sender only delivers to the email you signed up with.
- To send enquiries somewhere else, add a variable `CONTACT_TO` with the new address.
- Replying to an enquiry email replies straight to the visitor.
- Works alongside Cloudflare Email Routing for admin@: Resend's records sit on the `send.` subdomain and
  `resend._domainkey`, so they don't touch the routing MX/SPF records. Don't turn on "receiving" in Resend.
- Attachments are kept for 7 days in the `LISTINGS` KV namespace (so it must be bound), and visitors are limited
  to 6 messages an hour. If email isn't set up yet, the form falls back to opening the visitor's email app.

## Demo mode (before Cloudflare is set up)

On a host without the Cloudflare functions (like the GitHub Pages preview,
`https://mitch060995.github.io/BoatWebsite_Jake/admin/`), the admin page switches to **demo mode** by itself:
sign in with the password `demo`, add boats and photos, then open the site on the same phone to see them under
"Boats for sale". Everything is kept in that phone's browser only; nobody else sees it, and it disappears if the
browser's data is cleared. On Cloudflare the real server is found and demo mode never appears.

## How it's kept private

- `/admin/` isn't linked from the site and asks search engines not to index it.
- Every change is checked on the server: it needs the owner's login cookie (signed with the password, valid
  30 days, HttpOnly, SameSite=Strict) and has to come from the site itself. Visitors can only read published boats.
- Wrong passwords are rate-limited: 8 tries per address, then a 15-minute lockout.

## Free plan limits (Cloudflare)

KV storage on the free plan allows around 1 GB of data, 100,000 reads and 1,000 writes a day, and Workers
around 100,000 requests a day: far more than a boat dealer needs. Photos are cached by visitors' browsers and
Cloudflare's network, so repeat views barely touch these limits. No credit card is required.

## Running it locally

```
npx wrangler dev --var ADMIN_PASSWORD:test-pass-123
```

Then open http://localhost:8787 (site) and http://localhost:8787/admin/ (password `test-pass-123`).
Local listings are stored in `.wrangler/` and never touch the live site.

## Still to do

- **Contact form email:** finish the Resend setup above.

# Fraser Marine Sales — website

Plain HTML/CSS/JS, no build step. Hosts on GitHub Pages or Cloudflare Pages as-is.

```
index.html          the public site
admin.html          your private listings page (not linked anywhere, login required)
css/                styles (styles.css site, hero.css 3D opener, admin.css admin page)
js/hero.js          3D drone-shot opener (three.js)
js/site.js          page animations, menu, contact form
js/listings.js      "Boats for sale" section, read from Supabase
js/admin.js         add / edit / delete boats and photos
js/config.js        your Supabase URL + anon key  <-- fill this in
supabase/setup.sql  database, security rules and photo storage
```

## Boats for sale: one-time setup (about 15 minutes)

The listings live in a free [Supabase](https://supabase.com) project (database, login and photo storage).
Until it's connected, the "Boats for sale" section simply stays hidden.

1. **Create the project.** Sign up at supabase.com, then *New project*. Pick the **Sydney** region and save the database password somewhere safe.
2. **Create the tables and rules.** Open *SQL Editor* → *New query*, paste everything from `supabase/setup.sql`, change `you@example.com` to the email you'll log in with, and click **Run**.
3. **Lock down sign-ups.** *Authentication* → *Sign In / Providers*: turn **off** "Allow new users to sign up".
4. **Create your login.** *Authentication* → *Users* → *Add user* → *Create new user*: your email (the same one as step 2) and a strong password. Tick *Auto confirm user*.
5. **Password-reset links.** *Authentication* → *URL Configuration*: set *Site URL* to your website address, and add `https://YOUR-SITE/admin.html` under *Redirect URLs*.
6. **Connect the website.** Copy the **Project URL** (*Project Settings* → *Data API*) and the **publishable key** (*Project Settings* → *API Keys*, starts with `sb_publishable_`) into `js/config.js`, then commit and push. Never use a secret key (`sb_secret_…` or `service_role`).

## Adding a boat

Go to `https://YOUR-SITE/admin.html` (bookmark it on your phone), sign in, tap **+ Add a boat**,
fill in the details, add photos (straight from your camera roll; they're shrunk automatically), and **Save**.

- **Status** controls visibility: *Draft* is hidden; *For sale*, *Under offer* and *Sold* show on the site with a badge.
- The **first photo** is the cover. Use ‹ › to reorder and ✕ to remove.
- **Order on site**: lower numbers show first.

## How it's kept private

- `admin.html` isn't linked from the site and asks search engines not to index it.
- More importantly, the database only lets emails in the `admins` table add, edit or delete boats or photos, and
  sign-ups are switched off. Visitors (and anyone who finds the admin page) can only read published boats.

## Good to know

- **Free plan pausing:** Supabase pauses free projects after about a week with no activity. If the boats section ever
  disappears, open the Supabase dashboard and *Restore* the project, or upgrade to the paid plan to stop it pausing.
- **Contact form:** still shows a thank-you message only; connect it to a form service (e.g. Web3Forms or Formspree) so
  messages reach your inbox.

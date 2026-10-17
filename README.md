# Fraser Marine Sales — website

Plain HTML/CSS/JS, no build step and no outside services. Hosts on GitHub Pages or Cloudflare Pages as-is.

```
index.html          the public site
admin/              your private listings editor (Sveltia CMS, not linked anywhere)
  index.html
  config.yml        which fields a boat has, where photos go
data/boats.json     the boats for sale (written by the editor)
images/boats/       boat photos (uploaded by the editor)
css/                styles (styles.css site, hero.css 3D opener)
js/hero.js          3D drone-shot opener (three.js)
js/site.js          page animations, menu, contact form
js/listings.js      "Boats for sale" section, reads data/boats.json
```

## Boats for sale

Listings live in this GitHub repo: the editor saves them to `data/boats.json` and the photos to `images/boats/`.
No database or extra account is needed, just your GitHub login. The editor is
[Sveltia CMS](https://github.com/sveltia/sveltia-cms) (free, MIT licence), loaded from a CDN.

The "Boats for sale" section and its menu link only appear once at least one boat is listed (not a draft).

### One-time setup on your phone (about 5 minutes)

1. **Make an access token.** On GitHub (signed in as `mitch060995`): *Settings* → *Developer settings* →
   *Personal access tokens* → *Fine-grained tokens* → *Generate new token*.
   - **Name:** `Boat listings`
   - **Expiration:** the longest it allows (set a reminder to renew it)
   - **Repository access:** *Only select repositories* → `BoatWebsite_Jake`
   - **Permissions** → *Repository permissions* → **Contents: Read and write**
   - Generate it and copy the token (starts with `github_pat_`). Treat it like a password.
2. **Sign in.** Open `https://mitch060995.github.io/BoatWebsite_Jake/admin/`, tap **Sign In Using Access Token**,
   paste the token. Your phone remembers it, so you only do this once per device.
3. **Bookmark it** (or *Add to Home Screen*) so it's one tap away.

Don't use *Sign In with GitHub*: that option needs an extra login server, which this setup avoids on purpose.

### Adding a boat (from your phone)

1. Open the editor → **Boats for sale** → tap **Add Boat**.
2. Fill in the title and details, then under **Photos** tap to add pictures from your camera roll.
   They're shrunk and converted to WebP automatically. The first photo is the cover.
3. Set **Status** (*Draft* is hidden; *For sale*, *Under offer* and *Sold* show with a badge) and tap **Save**.
4. The site updates about a minute later (GitHub Pages rebuilds after each save).

To mark a boat sold or take it down, open it, change the status (or delete it) and save.

### How it's kept private

- `/admin/` isn't linked from the site and asks search engines not to index it.
- Anyone who finds it can't change anything: saving needs a token with write access to this repo, and only you
  can create one.
- If a phone is lost, delete the token on GitHub (*Fine-grained tokens* → *Delete*) and make a new one.

## Good to know

- **Contact form:** still shows a thank-you message only; connect it to a form service (e.g. Web3Forms or Formspree)
  so messages reach your inbox.

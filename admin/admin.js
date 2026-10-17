/* =========================================================
   Listings admin for the owner: sign in with the password,
   then add / edit / delete boats and their photos. Everything
   goes through the site's own /api (Cloudflare Pages Functions).
   ========================================================= */
(() => {
  const $ = s => document.querySelector(s);
  const views = ['setupView', 'loginView', 'listView', 'editView'];
  const show = id => { views.forEach(v => { $('#' + v).hidden = v !== id; }); window.scrollTo(0, 0); };
  const say = (el, text, kind = '') => { el.textContent = text; el.className = `msg ${kind}`; };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n);
  const STATUS = { draft: 'Draft', for_sale: 'For sale', under_offer: 'Under offer', sold: 'Sold' };
  const photoUrl = path => `/${path}`;

  class SignedOut extends Error {}
  async function api(path, opts = {}) {
    const res = await fetch(`/api/${path}`, { credentials: 'same-origin', ...opts });
    if (res.status === 401 && path !== 'login') { show('loginView'); $('#signOut').hidden = true; throw new SignedOut(); }
    const isJson = (res.headers.get('content-type') || '').includes('application/json');
    const data = isJson ? await res.json() : null;
    if (!res.ok || !isJson) throw new Error(data?.error || `Something went wrong (${res.status}).`);
    return data;
  }

  /* ---------------- start ---------------- */
  (async () => {
    try {
      const s = await api('session');
      if (!s.ready) { $('#setupMsg').textContent = 'The password or storage hasn’t been set up in Cloudflare yet.'; show('setupView'); return; }
      if (s.admin) enter(); else show('loginView');
    } catch {
      show('setupView');
    }
  })();

  function enter() { $('#signOut').hidden = false; loadList(); }

  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.submitter; btn.disabled = true;
    say($('#loginMsg'), 'Signing in…');
    try {
      await api('login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: $('#loginPassword').value }) });
      $('#loginPassword').value = '';
      say($('#loginMsg'), '');
      enter();
    } catch (err) {
      say($('#loginMsg'), err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  $('#signOut').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    $('#signOut').hidden = true;
    show('loginView');
  });

  /* ---------------- list ---------------- */
  let listings = [];
  async function loadList() {
    show('listView');
    say($('#listMsg'), 'Loading…');
    try {
      listings = await api('boats?all=1');
    } catch (err) {
      if (!(err instanceof SignedOut)) say($('#listMsg'), `Couldn't load your boats: ${err.message}`, 'error');
      return;
    }
    say($('#listMsg'), '');
    $('#list').innerHTML = listings.length
      ? listings.map((b, i) => `
        <div class="row">
          ${b.photos?.[0] ? `<img src="${esc(photoUrl(b.photos[0]))}" alt="">` : '<div class="noimg">No photo</div>'}
          <div>
            <h3>${esc(b.title)}</h3>
            <p><span class="pill ${esc(b.status)}">${STATUS[b.status] || b.status}</span>${b.price != null ? esc([b.price_label, money(b.price)].filter(Boolean).join(' ')) : esc(b.price_label || 'POA')}</p>
          </div>
          <button class="btn ghost small" type="button" data-edit="${i}">Edit</button>
        </div>`).join('')
      : '<p class="empty">No boats yet. Tap <strong>+ Add a boat</strong> to list your first one.</p>';
  }
  $('#list').addEventListener('click', e => {
    const b = e.target.closest('[data-edit]');
    if (b) openEditor(listings[+b.dataset.edit]);
  });
  $('#addBoat').addEventListener('click', () => openEditor(null));
  $('#backToList').addEventListener('click', loadList);

  /* ---------------- editor ---------------- */
  const form = $('#editForm');
  const FIELDS = ['title', 'status', 'price', 'price_label', 'year', 'make', 'model', 'length_m', 'engine', 'engine_hours', 'location', 'sort', 'description'];
  let editing = null;   // the saved boat being edited (null = new)
  let photos = [];      // [{ path }] already uploaded, or [{ file, preview }] waiting to upload

  function openEditor(row) {
    editing = row;
    photos = (row?.photos || []).map(path => ({ path }));
    form.reset();
    FIELDS.forEach(f => { if (row && row[f] != null) form.elements[f].value = row[f]; });
    if (!row) form.elements.status.value = 'for_sale';
    $('#editTitle').textContent = row ? 'Edit boat' : 'Add a boat';
    $('#deleteBtn').hidden = !row;
    resetDelete();
    say($('#editMsg'), '');
    renderPhotos();
    show('editView');
  }

  function renderPhotos() {
    $('#photoGrid').innerHTML = photos.length
      ? photos.map((p, i) => `
        <div class="photo${p.file ? ' pending' : ''}">
          <img src="${esc(p.path ? photoUrl(p.path) : p.preview)}" alt="">
          ${i === 0 ? '<span class="cover">Cover</span>' : ''}
          <div class="tools">
            <button type="button" data-move="${i}" data-dir="-1" aria-label="Move earlier" ${i === 0 ? 'disabled' : ''}>‹</button>
            <button type="button" data-remove="${i}" aria-label="Remove photo">✕</button>
            <button type="button" data-move="${i}" data-dir="1" aria-label="Move later" ${i === photos.length - 1 ? 'disabled' : ''}>›</button>
          </div>
        </div>`).join('')
      : '<p class="no-photos">No photos yet. Add a few: the first one is used as the cover on the site.</p>';
  }
  $('#photoGrid').addEventListener('click', e => {
    const mv = e.target.closest('[data-move]'), rm = e.target.closest('[data-remove]');
    if (mv) {
      const i = +mv.dataset.move, j = i + +mv.dataset.dir;
      if (j < 0 || j >= photos.length) return;
      [photos[i], photos[j]] = [photos[j], photos[i]];
    } else if (rm) {
      const [p] = photos.splice(+rm.dataset.remove, 1);
      if (p.preview) URL.revokeObjectURL(p.preview);
    } else return;
    renderPhotos();
  });
  $('#photoInput').addEventListener('change', e => {
    [...e.target.files].forEach(file => { if (file.type.startsWith('image/') || !file.type) photos.push({ file, preview: URL.createObjectURL(file) }); });
    e.target.value = '';
    renderPhotos();
  });

  // Phone photos are huge: shrink to max 2000px JPEG before uploading
  async function shrink(file) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.85));
      if (blob) return blob;
    } catch { /* fall through */ }
    if (['image/jpeg', 'image/webp', 'image/png'].includes(file.type)) return file;
    throw new Error(`"${file.name}" isn't a photo format this browser can read. Try a JPEG.`);
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const save = $('#saveBtn');
    save.disabled = true;
    try {
      const boat = { id: editing?.id };
      FIELDS.forEach(f => { boat[f] = form.elements[f].value.trim(); });

      const total = photos.filter(p => p.file).length;
      let n = 0;
      for (const p of photos) {
        if (p.path) continue;
        n++;
        say($('#editMsg'), `Uploading photo ${n} of ${total}…`);
        const blob = await shrink(p.file);
        const { path } = await api('photos', { method: 'POST', headers: { 'content-type': blob.type }, body: blob });
        URL.revokeObjectURL(p.preview);
        delete p.file; delete p.preview;
        p.path = path;      // keep it if a later step fails, so it isn't uploaded twice
      }
      boat.photos = photos.map(p => p.path);

      say($('#editMsg'), 'Saving…');
      editing = await api('boats', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(boat) });
      photos = editing.photos.map(path => ({ path }));
      renderPhotos();
      $('#editTitle').textContent = 'Edit boat';
      $('#deleteBtn').hidden = false;
      say($('#editMsg'), editing.status === 'draft' ? 'Saved as a draft (not shown on the site).' : 'Saved. It’s live on the site.', 'ok');
    } catch (err) {
      if (!(err instanceof SignedOut)) say($('#editMsg'), err.message || 'Something went wrong. Try again.', 'error');
      renderPhotos();
    } finally {
      save.disabled = false;
    }
  });

  // Delete needs a second tap to confirm
  let deleteArmed = false;
  function resetDelete() { deleteArmed = false; $('#deleteBtn').textContent = 'Delete boat'; $('#deleteBtn').classList.remove('confirm'); }
  $('#deleteBtn').addEventListener('click', async () => {
    if (!editing) return;
    if (!deleteArmed) {
      deleteArmed = true;
      $('#deleteBtn').textContent = 'Tap again to delete for good';
      $('#deleteBtn').classList.add('confirm');
      setTimeout(resetDelete, 5000);
      return;
    }
    try {
      await api(`boats/${encodeURIComponent(editing.id)}`, { method: 'DELETE' });
      loadList();
    } catch (err) {
      if (!(err instanceof SignedOut)) say($('#editMsg'), `Couldn't delete: ${err.message}`, 'error');
    }
  });
})();

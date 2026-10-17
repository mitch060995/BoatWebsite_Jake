/* =========================================================
   Listings admin: sign in, then add / edit / delete boats and
   their photos. Only emails listed in the `admins` table can
   change anything (enforced by the database, not this page).
   ========================================================= */
(() => {
  const $ = s => document.querySelector(s);
  const views = ['setupView', 'loginView', 'resetView', 'listView', 'editView'];
  const show = id => { views.forEach(v => { $('#' + v).hidden = v !== id; }); window.scrollTo(0, 0); };
  const say = (el, text, kind = '') => { el.textContent = text; el.className = `msg ${kind}`; };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n);
  const STATUS = { draft: 'Draft', for_sale: 'For sale', under_offer: 'Under offer', sold: 'Sold' };
  const BUCKET = 'boat-photos';

  const cfg = window.FRASER_CONFIG || {};
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) { show('setupView'); return; }
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

  /* ---------------- auth ---------------- */
  let recovering = false;
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') { recovering = true; show('resetView'); return; }
    if (event === 'SIGNED_OUT') { $('#signOut').hidden = true; show('loginView'); }
    if (event === 'SIGNED_IN' && !recovering && session) enter();
  });
  sb.auth.getSession().then(({ data }) => {
    if (recovering) return;
    if (data.session) enter(); else show('loginView');
  });

  async function enter() {
    $('#signOut').hidden = false;
    const { data: isAdmin, error } = await sb.rpc('is_admin');
    if (error || !isAdmin) {
      show('loginView');
      say($('#loginMsg'), "This account isn't set up to manage listings. Check the email in the admins table.", 'error');
      await sb.auth.signOut();
      return;
    }
    loadList();
  }

  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.submitter; btn.disabled = true;
    say($('#loginMsg'), 'Signing in…');
    const { error } = await sb.auth.signInWithPassword({ email: $('#loginEmail').value.trim(), password: $('#loginPassword').value });
    btn.disabled = false;
    if (error) say($('#loginMsg'), 'Email or password is wrong. Try again, or reset your password.', 'error');
    else say($('#loginMsg'), '');
  });

  $('#forgot').addEventListener('click', async () => {
    const email = $('#loginEmail').value.trim();
    if (!email) { say($('#loginMsg'), 'Type your email above first, then tap "Forgot password?" again.', 'error'); $('#loginEmail').focus(); return; }
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] });
    say($('#loginMsg'), error ? `Couldn't send the reset email: ${error.message}` : 'If that email is set up, a reset link is on its way. Check your inbox.', error ? 'error' : 'ok');
  });

  $('#resetForm').addEventListener('submit', async e => {
    e.preventDefault();
    const { error } = await sb.auth.updateUser({ password: $('#newPassword').value });
    if (error) { say($('#resetMsg'), `Couldn't save it: ${error.message}`, 'error'); return; }
    recovering = false;
    say($('#resetMsg'), 'Password saved.', 'ok');
    history.replaceState(null, '', location.pathname);
    enter();
  });

  $('#signOut').addEventListener('click', () => sb.auth.signOut());

  /* ---------------- list ---------------- */
  let listings = [];
  async function loadList() {
    show('listView');
    say($('#listMsg'), 'Loading…');
    const { data, error } = await sb.from('listings').select('*').order('sort').order('created_at', { ascending: false });
    if (error) { say($('#listMsg'), `Couldn't load your boats: ${error.message}`, 'error'); return; }
    say($('#listMsg'), '');
    listings = data || [];
    $('#list').innerHTML = listings.length
      ? listings.map((b, i) => `
        <div class="row">
          ${b.photos?.[0] ? `<img src="${esc(b.photos[0])}" alt="">` : '<div class="noimg">No photo</div>'}
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
  const NUMERIC = new Set(['price', 'year', 'length_m', 'engine_hours', 'sort']);
  let editing = null;          // the listing row being edited (null = new)
  let photos = [];             // [{ url }] existing, or [{ file, preview }] new
  let removed = [];            // existing photo URLs taken off this listing

  function openEditor(row) {
    editing = row;
    removed = [];
    photos = (row?.photos || []).map(url => ({ url }));
    form.reset();
    FIELDS.forEach(f => { if (row && row[f] != null) form.elements[f].value = row[f]; });
    if (!row) { form.elements.status.value = 'for_sale'; form.elements.make.value = ''; }
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
          <img src="${esc(p.url || p.preview)}" alt="">
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
      if (p.url) removed.push(p.url);
      if (p.preview) URL.revokeObjectURL(p.preview);
    } else return;
    renderPhotos();
  });
  $('#photoInput').addEventListener('change', e => {
    [...e.target.files].forEach(file => { if (file.type.startsWith('image/')) photos.push({ file, preview: URL.createObjectURL(file) }); });
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
      return await new Promise(res => c.toBlob(b => res(b || file), 'image/jpeg', 0.85));
    } catch {
      return file;   // format the browser can't decode: upload as-is
    }
  }
  const pathFromUrl = url => decodeURIComponent(url.split(`/${BUCKET}/`)[1] || '');

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const save = $('#saveBtn');
    save.disabled = true;
    try {
      const row = {};
      FIELDS.forEach(f => {
        const v = form.elements[f].value.trim();
        row[f] = v === '' ? null : NUMERIC.has(f) ? Number(v) : v;
      });
      row.sort = row.sort ?? 0;
      const id = editing?.id || crypto.randomUUID();

      const urls = [];
      let n = 0;
      for (const p of photos) {
        if (p.url) { urls.push(p.url); continue; }
        n++;
        say($('#editMsg'), `Uploading photo ${n} of ${photos.filter(x => x.file).length}…`);
        const blob = await shrink(p.file);
        const ext = blob.type === 'image/jpeg' ? 'jpg' : (p.file.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `${id}/${Date.now()}-${n}.${ext}`;
        const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || p.file.type, cacheControl: '31536000' });
        if (error) throw new Error(`Photo upload failed: ${error.message}`);
        urls.push(sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
      }

      say($('#editMsg'), 'Saving…');
      const payload = { ...row, id, photos: urls, updated_at: new Date().toISOString() };
      const { error } = await sb.from('listings').upsert(payload);
      if (error) throw new Error(`Couldn't save: ${error.message}`);

      if (removed.length) await sb.storage.from(BUCKET).remove(removed.map(pathFromUrl).filter(Boolean));
      photos.forEach(p => p.preview && URL.revokeObjectURL(p.preview));
      editing = { ...payload };
      photos = urls.map(url => ({ url }));
      removed = [];
      renderPhotos();
      $('#editTitle').textContent = 'Edit boat';
      $('#deleteBtn').hidden = false;
      say($('#editMsg'), row.status === 'draft' ? 'Saved as a draft (not shown on the site).' : 'Saved. It\'s live on the site.', 'ok');
    } catch (err) {
      say($('#editMsg'), err.message || 'Something went wrong. Try again.', 'error');
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
    const { error } = await sb.from('listings').delete().eq('id', editing.id);
    if (error) { say($('#editMsg'), `Couldn't delete: ${error.message}`, 'error'); return; }
    const paths = (editing.photos || []).map(pathFromUrl).filter(Boolean);
    if (paths.length) await sb.storage.from(BUCKET).remove(paths);
    loadList();
  });
})();

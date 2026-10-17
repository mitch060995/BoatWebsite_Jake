/* =========================================================
   Boats for sale: read data/boats.json (edited on /admin/ and
   committed to this repo) and show the published boats. The
   section and its nav link stay hidden until there's a boat.
   ========================================================= */
(() => {
  const $ = s => document.querySelector(s);
  const section = $('#boats'), grid = $('#boatGrid'), navLink = $('#navBoats');
  const dlg = $('#boatDialog');

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n);
  const STATUS = { for_sale: 'For sale', under_offer: 'Under offer', sold: 'Sold' };

  const priceText = b => {
    if (has(b.price)) return [b.price_label, money(b.price)].filter(Boolean).join(' ');
    return b.price_label || 'Price on application';
  };
  const specList = b => [
    b.year && String(b.year),
    b.length_m && `${+b.length_m} m`,
    b.engine,
  ].filter(Boolean);

  // Photo paths are saved as /images/boats/...; resolve them against the site's own address so they
  // work both on GitHub Pages (/BoatWebsite_Jake/) and on a custom domain
  const asset = p => new URL(String(p).replace(/^\//, ''), document.baseURI).href;
  const has = v => v !== null && v !== undefined && v !== '';

  fetch('data/boats.json', { cache: 'no-cache' })
    .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
    .then(rows => render((Array.isArray(rows) ? rows : [])
      .filter(b => b && b.title && b.status && b.status !== 'draft')
      .map(b => ({ ...b, photos: (Array.isArray(b.photos) ? b.photos : [b.photos]).filter(Boolean).map(asset) }))))
    .catch(err => console.warn('Listings unavailable:', err));

  let boats = [];
  function render(rows) {
    boats = Array.isArray(rows) ? rows : [];
    if (!boats.length) return;
    grid.innerHTML = boats.map((b, i) => {
      const cover = b.photos && b.photos[0];
      return `
        <article class="card listing" style="--n:${i}">
          <div class="card-inner">
            <button class="listing-open" type="button" data-i="${i}" aria-label="View ${esc(b.title)}">
              <div class="card-art">
                <span class="tag tag-${esc(b.status)}">${esc(STATUS[b.status] || '')}</span>
                ${cover ? `<img src="${esc(cover)}" alt="" loading="lazy">` : '<div class="listing-nophoto">Photos coming soon</div>'}
              </div>
              <div class="card-body">
                <h3>${esc(b.title)}</h3>
                <ul class="specs">${specList(b).map(s => `<li>${esc(s)}</li>`).join('')}</ul>
                <div class="card-foot"><span class="price">${esc(priceText(b))}</span><span class="listing-more">Details <span aria-hidden="true">→</span></span></div>
              </div>
            </button>
          </div>
        </article>`;
    }).join('');
    section.hidden = false;
    navLink.hidden = false;
  }

  // ---- details dialog
  let current = null;
  function open(i) {
    const b = boats[i];
    if (!b) return;
    current = b;
    const photos = b.photos || [];
    const main = $('#bdMain');
    main.hidden = !photos.length;
    if (photos.length) { main.src = photos[0]; main.alt = b.title; }
    $('#bdThumbs').innerHTML = photos.length > 1
      ? photos.map((p, k) => `<button type="button" data-k="${k}" aria-label="Photo ${k + 1}"${k === 0 ? ' aria-current="true"' : ''}><img src="${esc(p)}" alt="" loading="lazy"></button>`).join('')
      : '';
    $('#bdStatus').textContent = STATUS[b.status] || '';
    $('#bdStatus').className = `bd-status tag-${b.status}`;
    $('#bdTitle').textContent = b.title;
    $('#bdPrice').textContent = priceText(b);
    const rows = [
      ['Make', b.make], ['Model', b.model], ['Year', b.year],
      ['Length', b.length_m && `${+b.length_m} m`], ['Engine', b.engine],
      ['Engine hours', b.engine_hours], ['Location', b.location],
    ].filter(r => has(r[1]));
    $('#bdSpecs').innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
    $('#bdDesc').textContent = b.description || '';
    $('#bdEnquire').hidden = b.status === 'sold';
    dlg.showModal();
    document.documentElement.classList.add('dialog-open');
  }
  function close() { dlg.close(); }
  dlg.addEventListener('close', () => document.documentElement.classList.remove('dialog-open'));

  grid.addEventListener('click', e => {
    const btn = e.target.closest('.listing-open');
    if (btn) open(+btn.dataset.i);
  });
  $('#bdThumbs').addEventListener('click', e => {
    const t = e.target.closest('button[data-k]');
    if (!t || !current) return;
    $('#bdMain').src = current.photos[+t.dataset.k];
    $('#bdThumbs').querySelectorAll('button').forEach(b => b.toggleAttribute('aria-current', b === t));
  });
  $('#bdClose').addEventListener('click', close);
  dlg.addEventListener('click', e => { if (e.target === dlg) close(); });   // click on the backdrop

  // "Enquire" fills in the contact form and takes you there
  $('#bdEnquire').addEventListener('click', () => {
    if (!current) return;
    const topic = $('#f-topic'), msg = $('#f-message');
    if (topic) topic.value = "A boat you're selling";
    if (msg && !msg.value.trim()) msg.value = `Hi, I'm interested in the ${current.title}. `;
    close();
    $('#contact').scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => $('#f-name')?.focus({ preventScroll: true }), 700);
  });
})();

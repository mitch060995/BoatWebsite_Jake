/* =========================================================
   Jake & Taylor's — below-the-hero motion layer (vanilla JS)
   ========================================================= */
(() => {
  'use strict';

  const root = document.documentElement;
  root.classList.add('js');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(pointer: fine)').matches;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---------------------------------------------------------
     Single rAF loop: every scroll-linked / per-frame effect
     registers a ticker here. Tracks smoothed scroll velocity.
     --------------------------------------------------------- */
  const tickers = new Set();
  let lastY = window.scrollY, vel = 0, lastT = performance.now();
  function frame(t) {
    const y = window.scrollY;
    const dt = clamp((t - lastT) / 16.667, 0, 4);
    lastT = t;
    vel += ((y - lastY) - vel) * 0.12;
    lastY = y;
    tickers.forEach(fn => fn(dt, y, vel));
    requestAnimationFrame(frame);
  }
  if (!reduced) requestAnimationFrame(frame);

  /* ---------------------------------------------------------
     Inventory (example listings — replace with real stock)
     --------------------------------------------------------- */
  const boats = [
    { name: 'Coastline 23', type: 'Bowrider', year: 2021, len: "23'", hp: '250hp', price: '$68,500', hull: '#ffffff', stripe: '#0f4c6e', sky: ['#bfe3f2', '#f7efe0'] },
    { name: 'Reef Hunter 21', type: 'Fishing', year: 2019, len: "21'", hp: '150hp', price: '$42,900', hull: '#e9eef1', stripe: '#c0392b', sky: ['#cfe7ef', '#eef3ef'] },
    { name: 'Harbour Cruiser 30', type: 'Cruiser', year: 2018, len: "30'", hp: 'Twin 300hp', price: '$139,000', hull: '#f7f3ea', stripe: '#0b1b26', sky: ['#f4d6b0', '#f7ece0'] },
    { name: 'Lazy Days 24', type: 'Pontoon', year: 2022, len: "24'", hp: '115hp', price: '$54,750', hull: '#d9dee2', stripe: '#e0aa5a', sky: ['#c7e4ee', '#f2efe6'] },
    { name: 'Wakeline 20', type: 'Bowrider', year: 2020, len: "20'", hp: '200hp', price: '$39,900', hull: '#ffffff', stripe: '#e0aa5a', sky: ['#d8eef5', '#fbf3e6'] },
    { name: 'Offshore 26 CC', type: 'Fishing', year: 2023, len: "26'", hp: 'Twin 200hp', price: '$118,000', hull: '#eef2f4', stripe: '#0f4c6e', sky: ['#bcdcea', '#ecf1ee'] },
  ];

  // Wavy water surface from x=-60 to x=360 (period 60) so it can drift seamlessly by 60 units
  const surface = (y, amp) => {
    let d = `M-60 ${y} q15 -${amp} 30 0`;
    for (let x = -30; x < 360; x += 30) d += ' t30 0';
    return d;
  };

  function art(b, i) {
    const cabin = b.type === 'Cruiser'
      ? `<path d="M70 66 L100 38 L200 38 L222 64 Z" fill="${b.hull}"/><path d="M106 44 L196 44 L210 60 L92 60 Z" fill="#1b3442"/><rect x="120" y="26" width="60" height="12" rx="3" fill="${b.hull}"/>`
      : b.type === 'Pontoon'
      ? `<rect x="60" y="48" width="180" height="20" rx="4" fill="${b.hull}"/><path d="M70 48 V30 H230 V48" fill="none" stroke="#5b6b75" stroke-width="3"/><rect x="66" y="22" width="170" height="8" rx="3" fill="${b.stripe}"/>`
      : b.type === 'Fishing'
      ? `<path d="M120 66 L132 40 L172 40 L178 66 Z" fill="${b.hull}"/><path d="M136 44 L168 44 L172 56 L132 56 Z" fill="#1b3442"/><path d="M130 40 V18 H176 V40" fill="none" stroke="#5b6b75" stroke-width="2.5"/><rect x="128" y="14" width="52" height="6" rx="2" fill="${b.stripe}"/>`
      : `<path d="M110 66 L132 46 L176 46 L186 66 Z" fill="#1b3442" opacity=".85"/>`;
    const hull = b.type === 'Pontoon'
      ? `<rect x="54" y="68" width="200" height="14" rx="7" fill="#c9d1d6"/><rect x="54" y="82" width="200" height="6" rx="3" fill="#9aa8b1"/>`
      : `<path d="M30 64 L262 58 Q284 58 276 72 L246 96 Q240 101 230 101 L62 101 Q42 101 34 90 Z" fill="${b.hull}"/><path d="M36 76 L272 68" stroke="${b.stripe}" stroke-width="5"/>`;
    const dy = b.type === 'Pontoon' ? 27 : 18;
    return `
      <svg viewBox="0 0 300 188" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style="--n:${i}">
        <defs><linearGradient id="s${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${b.sky[0]}"/><stop offset="1" stop-color="${b.sky[1]}"/></linearGradient></defs>
        <rect width="300" height="188" fill="url(#s${i})"/>
        <circle cx="250" cy="38" r="14" fill="#fff6e4" opacity=".7"/>
        <rect y="116" width="300" height="72" fill="#1d6a8c"/>
        <path class="drift" d="${surface(112, 5)} V188 H-60 Z" fill="#2c81a5"/>
        <g transform="translate(0 ${dy})"><g class="card-sail"><g class="card-boat">${cabin}${hull}</g>
          <g class="foam" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".7"><path d="M30 ${b.type === 'Pontoon' ? 89 : 97} h-16 M26 ${b.type === 'Pontoon' ? 93 : 101} h-22"/></g></g></g>
        <path class="drift rev" d="${surface(117, 3)} V188 H-60 Z" fill="#1d6a8c" opacity=".88"/>
        <path class="drift" d="${surface(130, 4)}" fill="none" stroke="#ffffff" stroke-width="2" opacity=".35"/>
      </svg>`;
  }

  const grid = $('#boatGrid');
  grid.innerHTML = boats.map((b, i) => `
    <article class="card reveal" data-type="${b.type}" style="--d:${(i % 3) * 0.1}s">
      <div class="card-inner" data-tilt>
        <div class="card-art"><span class="tag">${b.type}</span>${art(b, i)}</div>
        <div class="card-body">
          <h3>${b.name}</h3>
          <ul class="specs"><li>${b.year}</li><li>${b.len}</li><li>${b.hp}</li></ul>
          <div class="card-foot"><span class="price">${b.price}</span><a href="#contact">Enquire <span aria-hidden="true">→</span></a></div>
        </div>
      </div>
    </article>`).join('');

  /* Filter chips: fade leavers out, FLIP the stayers, stagger the arrivals in */
  let filterToken = 0;
  function applyFilter(f) {
    const token = ++filterToken;
    const cards = [...grid.children];
    const show = c => f === 'all' || c.dataset.type === f;
    cards.forEach(c => { c.getAnimations().forEach(a => a.cancel()); c.classList.add('in'); c.style.transition = 'none'; });

    if (reduced) { cards.forEach(c => { c.hidden = !show(c); }); return; }

    const leaving = cards.filter(c => !c.hidden && !show(c));
    const entering = cards.filter(c => c.hidden && show(c));
    const out = leaving.map(c => c.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.9) translateY(12px)' }],
      { duration: 260, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }).finished.catch(() => {}));

    Promise.all(out).then(() => {
      if (token !== filterToken) return;
      const staying = cards.filter(c => !c.hidden && show(c));
      const first = new Map(staying.map(c => [c, c.getBoundingClientRect()]));
      leaving.forEach(c => { c.hidden = true; c.getAnimations().forEach(a => a.cancel()); });
      entering.forEach(c => { c.hidden = false; });
      staying.forEach(c => {
        const a = first.get(c), b = c.getBoundingClientRect();
        const dx = a.left - b.left, dy = a.top - b.top;
        if (dx || dy) c.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
          { duration: 650, easing: 'cubic-bezier(.16,1,.3,1)' });
      });
      entering.forEach((c, i) => c.animate(
        [{ opacity: 0, transform: 'translateY(40px) scale(.94)' }, { opacity: 1, transform: 'none' }],
        { duration: 700, delay: 120 + i * 90, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' }));
    });
  }
  $('#filters').addEventListener('click', e => {
    const btn = e.target.closest('.chip');
    if (!btn || btn.classList.contains('active')) return;
    $$('.chip').forEach(c => { const on = c === btn; c.classList.toggle('active', on); c.setAttribute('aria-pressed', on); });
    applyFilter(btn.dataset.filter);
  });

  /* ---------------------------------------------------------
     Split headlines into masked words
     --------------------------------------------------------- */
  function split(el) {
    let i = 0;
    const unit = content => {
      const w = document.createElement('span'); w.className = 'w';
      const wi = document.createElement('span'); wi.className = 'wi';
      wi.style.setProperty('--i', i++);
      wi.append(content); w.append(wi);
      return w;
    };
    const walk = node => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(p => {
            if (!p) return;
            frag.append(/^\s+$/.test(p) ? ' ' : unit(document.createTextNode(p)));
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) {
          if (n.classList.contains('shine')) { const w = unit(''); n.before(w); w.firstChild.append(n); }
          else walk(n);
        }
      });
    };
    walk(el);
    el.classList.add('split');
  }
  $$('[data-split]').forEach(split);

  /* ---------------------------------------------------------
     Reveal on scroll
     --------------------------------------------------------- */
  const revealEls = $$('.reveal, [data-split]');
  if (reduced || !('IntersectionObserver' in window)) {
    revealEls.forEach(el => el.classList.add('in'));
  } else {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });
    revealEls.forEach(el => io.observe(el));
  }

  /* ---------------------------------------------------------
     Count-up stats
     --------------------------------------------------------- */
  const counters = $$('[data-count]');
  if (!reduced && counters.length) {
    counters.forEach(c => { c.textContent = c.dataset.from || '0'; });
    const statIO = new IntersectionObserver(entries => {
      if (!entries.some(e => e.isIntersecting)) return;
      statIO.disconnect();
      const start = performance.now() + 250;
      const run = () => {
        let done = true;
        counters.forEach((c, k) => {
          const from = +(c.dataset.from || 0), to = +c.dataset.count;
          const p = clamp((performance.now() - start - k * 120) / 1800, 0, 1);
          const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
          c.textContent = Math.round(from + (to - from) * e);
          if (p < 1) done = false;
        });
        if (done) tickers.delete(run);
      };
      tickers.add(run);
    }, { threshold: 0.4 });
    statIO.observe($('#stats'));
  }

  /* ---------------------------------------------------------
     Wave dividers (layered SVG, drifting via CSS)
     --------------------------------------------------------- */
  const LAYERS = {
    default: [
      { mid: 34, amp: 20, k: 2, dur: 28, op: 0.22, color: 'var(--gold)' },
      { mid: 52, amp: 18, k: 3, dur: 20, op: 0.45, rev: true },
      { mid: 70, amp: 14, k: 2, dur: 15, op: 1 },
    ],
    sea: [
      { mid: 30, amp: 8, k: 3, dur: 16, op: 0.22, color: '#7fb6d2' },
      { mid: 48, amp: 9, k: 2, dur: 12, op: 0.5, rev: true },
      { mid: 66, amp: 7, k: 3, dur: 9, op: 1 },
    ],
  };
  function wavePath(mid, amp, k) {
    const P = 1440 / k;
    let d = `M0 ${mid} Q${P / 4} ${mid - amp} ${P / 2} ${mid}`;
    for (let x = P; x <= 2880 + 0.1; x += P / 2) d += ` T${x} ${mid}`;
    return `${d} V100 H0 Z`;
  }
  $$('[data-wave]').forEach(el => {
    el.innerHTML = (LAYERS[el.dataset.waveLayers] || LAYERS.default).map(l =>
      `<svg class="wave-l${l.rev ? ' rev' : ''}" viewBox="0 0 2880 100" preserveAspectRatio="none" style="--dur:${l.dur}s;opacity:${l.op}${l.color ? `;color:${l.color}` : ''}"><path d="${wavePath(l.mid, l.amp, l.k)}"/></svg>`
    ).join('');
  });

  /* ---------------------------------------------------------
     Marquee: infinite, speed + skew react to scroll velocity
     --------------------------------------------------------- */
  const track = $('#marqueeTrack');
  if (track) {
    const group = track.firstElementChild;
    let groupW = 0, x = 0, dir = 1, visible = true;
    const fill = () => {
      while (track.children.length > 1) track.lastElementChild.remove();
      groupW = group.getBoundingClientRect().width;
      const copies = Math.max(1, Math.ceil((window.innerWidth * 1.5) / Math.max(groupW, 1)));
      for (let n = 0; n < copies; n++) track.append(group.cloneNode(true));
    };
    fill();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fill);
    window.addEventListener('resize', fill, { passive: true });
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(track.parentElement);
    tickers.add((dt, y, v) => {
      if (!visible || !groupW) return;
      if (v > 0.4) dir = 1; else if (v < -0.4) dir = -1;
      const boost = Math.min(Math.abs(v) * 0.45, 16);
      x -= dir * (0.7 + boost) * dt;
      x = ((x % groupW) - groupW) % groupW;
      const skew = clamp(-v * 0.25, -7, 7);
      track.style.transform = `translate3d(${x}px,0,0) skewX(${skew}deg)`;
    });
  }

  /* ---------------------------------------------------------
     Parallax scenes (sell band + about sunset)
     --------------------------------------------------------- */
  const inView = new WeakMap();
  const viewIO = new IntersectionObserver(entries => entries.forEach(e => inView.set(e.target, e.isIntersecting)), { rootMargin: '10% 0px' });
  const progress = el => {
    const r = el.getBoundingClientRect(), vh = window.innerHeight;
    return clamp((vh - r.top) / (vh + r.height), 0, 1);
  };

  const sell = $('#sell');
  if (sell && !reduced) {
    viewIO.observe(sell);
    const sun = $('#sellSun'), land = $('#sellLand'), boat = $('#sellBoat');
    tickers.add(() => {
      if (!inView.get(sell)) return;
      const p = progress(sell), W = sell.clientWidth, bw = boat.offsetWidth;
      boat.style.transform = `translate3d(${(-bw - 20) + p * (W + bw + 40)}px,0,0)`;
      sun.style.transform = `translate3d(0,${(p - 0.5) * 90}px,0)`;
      land.style.transform = `translate3d(${(0.5 - p) * 40}px,${(p - 0.5) * 18}px,0)`;
    });
  }

  const about = $('#aboutScene');
  if (about && !reduced) {
    viewIO.observe(about);
    const layers = $$('[data-depth], [data-depth-x]', about).map(el => ({
      el, dy: +(el.dataset.depth || 0), dx: +(el.dataset.depthX || 0),
    }));
    tickers.add(() => {
      if (!inView.get(about)) return;
      const p = progress(about) - 0.5;
      layers.forEach(l => { l.el.style.transform = `translate(${p * l.dx}px, ${p * l.dy}px)`; });
    });
  }

  /* ---------------------------------------------------------
     Pointer effects: card tilt, cursor glow, magnetic buttons
     --------------------------------------------------------- */
  if (finePointer && !reduced) {
    const setGlow = (el, e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      el.style.setProperty('--mx', `${px * 100}%`);
      el.style.setProperty('--my', `${py * 100}%`);
      return [px, py];
    };
    grid.addEventListener('pointermove', e => {
      const el = e.target.closest('[data-tilt]');
      if (!el) return;
      const [px, py] = setGlow(el, e);
      el.classList.add('tilting');
      el.style.setProperty('--rx', `${(0.5 - py) * 9}deg`);
      el.style.setProperty('--ry', `${(px - 0.5) * 11}deg`);
    }, { passive: true });
    grid.addEventListener('pointerout', e => {
      const el = e.target.closest('[data-tilt]');
      if (!el || el.contains(e.relatedTarget)) return;
      el.classList.remove('tilting');
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
    });
    $$('[data-glow]').forEach(el => el.addEventListener('pointermove', e => setGlow(el, e), { passive: true }));

    $$('[data-magnetic]').forEach(btn => {
      const zone = btn.closest('.magnet-zone') || btn;
      const label = $('.btn-label', btn);
      zone.addEventListener('pointermove', e => {
        const r = btn.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        btn.style.transition = 'transform .2s ease-out, background .25s, box-shadow .3s';
        btn.style.transform = `translate(${dx * 0.28}px, ${dy * 0.38}px)`;
        if (label) label.style.transform = `translate(${dx * 0.1}px, ${dy * 0.12}px)`;
      }, { passive: true });
      zone.addEventListener('pointerleave', () => {
        btn.style.transition = 'transform .8s cubic-bezier(.16,1,.3,1), background .25s, box-shadow .3s';
        btn.style.transform = '';
        if (label) label.style.transform = '';
      });
    });

    /* Custom cursor: a dot + trailing ring (native cursor stays) */
    const dot = document.createElement('div'); dot.className = 'cursor-dot';
    const ring = document.createElement('div'); ring.className = 'cursor-ring'; ring.append(document.createElement('i'));
    document.body.append(dot, ring);
    let tx = -100, ty = -100, rx = -100, ry = -100;
    window.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      tx = e.clientX; ty = e.clientY;
      if (!root.classList.contains('has-cursor')) { rx = tx; ry = ty; root.classList.add('has-cursor'); }
      dot.style.transform = `translate3d(${tx}px,${ty}px,0)`;
    }, { passive: true });
    document.addEventListener('pointerover', e => {
      ring.classList.toggle('hover', !!e.target.closest('a, button, select, input, textarea, label, .chip'));
    }, { passive: true });
    document.addEventListener('pointerdown', () => ring.classList.add('down'), { passive: true });
    document.addEventListener('pointerup', () => ring.classList.remove('down'), { passive: true });
    document.documentElement.addEventListener('pointerleave', () => root.classList.remove('has-cursor'));
    tickers.add(dt => {
      const k = 1 - Math.pow(1 - 0.2, dt);
      rx += (tx - rx) * k; ry += (ty - ry) * k;
      ring.style.transform = `translate3d(${rx}px,${ry}px,0)`;
    });
  }

  /* Water ripple on buttons + chips */
  if (!reduced) {
    document.addEventListener('pointerdown', e => {
      const b = e.target.closest('.btn, .chip');
      if (!b) return;
      const r = b.getBoundingClientRect();
      const s = Math.max(r.width, r.height) * 2.4;
      const sp = document.createElement('span');
      sp.className = 'ripple';
      sp.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
      b.append(sp);
      setTimeout(() => sp.remove(), 1000);
    }, { passive: true });
  }

  /* ---------------------------------------------------------
     Mobile menu: circular reveal from the hamburger
     --------------------------------------------------------- */
  const nav = $('#nav'), toggle = $('#navToggle'), links = $('#navLinks');
  const mobile = matchMedia('(max-width: 820px)');
  let open = false;
  const others = () => [...document.body.children].filter(el => el !== nav && el.tagName !== 'SCRIPT');
  function setOpen(v, focus = true) {
    open = v;
    nav.classList.toggle('open', v);
    root.classList.toggle('menu-open', v);
    toggle.setAttribute('aria-expanded', String(v));
    toggle.setAttribute('aria-label', v ? 'Close menu' : 'Open menu');
    const isMobile = mobile.matches;
    links.inert = isMobile && !v;
    others().forEach(el => { el.inert = isMobile && v; });
    if (v) {
      const r = toggle.getBoundingClientRect();
      links.style.setProperty('--cx', `${r.left + r.width / 2}px`);
      links.style.setProperty('--cy', `${r.top + r.height / 2}px`);
      if (focus) setTimeout(() => $('a', links).focus({ preventScroll: true }), 250);
    } else if (focus) {
      toggle.focus({ preventScroll: true });
    }
  }
  toggle.addEventListener('click', () => setOpen(!open));
  $$('a', links).forEach(a => a.addEventListener('click', () => { if (open) setOpen(false, false); }));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) setOpen(false); });
  const syncMenu = () => { if (!mobile.matches && open) setOpen(false, false); else setOpen(open, false); };
  mobile.addEventListener ? mobile.addEventListener('change', syncMenu) : mobile.addListener(syncMenu);
  setOpen(false, false);

  /* ---------------------------------------------------------
     Contact form + year
     --------------------------------------------------------- */
  // NOTE: form isn't wired to a backend yet — hook up Formspree/Netlify Forms/etc. before launch.
  $('#contactForm').addEventListener('submit', e => {
    e.preventDefault();
    $('#formNote').textContent = "Thanks! We'll be in touch shortly.";
    e.target.reset();
  });

  $('#year').textContent = new Date().getFullYear();
})();

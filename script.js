/* =========================================================
   Hero: top-down ocean, idle boat -> sails down on scroll ->
   splashes into ripples -> logo surfaces from the water.
   ========================================================= */
(() => {
  const hero = document.getElementById('hero');
  const canvas = document.getElementById('water');
  const ctx = canvas.getContext('2d');
  const boatEl = document.getElementById('boat');
  const logoEl = document.getElementById('logo');
  const copyEl = document.getElementById('heroCopy');
  const hintEl = document.getElementById('hint');
  const glowEl = document.getElementById('heroGlow');
  const nav = document.getElementById('nav');
  const disp = document.getElementById('rippleDisp');
  const turb = document.getElementById('rippleTurb');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // Scroll timeline (0..1 across the pinned hero)
  const T = {
    travelStart: 0.03, travelEnd: 0.55,   // boat sails down
    splash: 0.58,                         // boat dives, ripples burst
    sinkStart: 0.54, sinkEnd: 0.66,
    logoStart: 0.58, logoEnd: 0.80,       // logo surfaces
    copyStart: 0.80, copyEnd: 0.94,
  };

  let W = 0, H = 0, dpr = 1, bw = 60, bl = 150, waterGrad, glints = [];
  const boat = { t: 0, x: 0, y: 0, heading: 0, speed: 0 };
  const wakeL = [], wakeR = [], foam = [], ripples = [];
  let idleTimer = 0, settleTimer = 0, wakeDist = 0, prevP = 0, time = 0;

  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    W = r.width; H = r.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    waterGrad = ctx.createLinearGradient(0, 0, 0, H);
    waterGrad.addColorStop(0, '#0d4a69');
    waterGrad.addColorStop(0.55, '#0a3953');
    waterGrad.addColorStop(1, '#062538');

    const n = Math.round((W * H) / 6500);
    glints = Array.from({ length: n }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      len: 6 + Math.random() * 24, ph: Math.random() * Math.PI * 2, sp: 0.5 + Math.random() * 1.5,
    }));

    bw = clamp(W * 0.055, 40, 76);
    bl = bw * 2.5;
    boatEl.style.width = bw + 'px';
    boatEl.style.height = bl + 'px';
  }

  function progress() {
    if (reduced) return 1;
    const total = hero.offsetHeight - window.innerHeight;
    return total > 0 ? clamp(-hero.getBoundingClientRect().top / total, 0, 1) : 0;
  }

  // Gentle S-curve from upper screen down to centre
  function pathAt(t) {
    const amp = Math.min(W * 0.06, 70);
    return {
      x: W / 2 + Math.sin(t * Math.PI) * amp,
      y: lerp(H * 0.2, H * 0.5, t),
      dx: amp * Math.PI * Math.cos(t * Math.PI),
      dy: H * 0.3,
    };
  }

  function addRipple(x, y, o) {
    ripples.push(Object.assign({ x, y, r: 10, vr: 40, maxR: 200, a0: 0.4, rot: 0, squash: 1, w: 2 }, o));
  }

  function splash(x, y, big) {
    const maxR = Math.hypot(W, H) * (big ? 0.6 : 0.3);
    const n = big ? 6 : 3;
    for (let i = 0; i < n; i++) {
      addRipple(x, y, { r: -i * 55, vr: big ? 240 : 160, maxR, a0: 0.55 - i * 0.05, w: 3 - i * 0.3 });
    }
    for (let i = 0; i < (big ? 40 : 15); i++) {
      const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * (big ? 160 : 70);
      foam.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, age: 0, life: 1 + Math.random(), r: 2 + Math.random() * 4 });
    }
  }

  // ---------- update ----------
  function update(dt, p) {
    time += dt;

    // Boat travel (eased toward the scroll target so it glides)
    const target = smooth(T.travelStart, T.travelEnd, p);
    const prevT = boat.t;
    boat.t += (target - boat.t) * (1 - Math.exp(-dt * 3));
    const pt = pathAt(boat.t);
    const pathLen = Math.hypot(pt.dx, pt.dy);
    const moved = (boat.t - prevT) * pathLen;
    boat.speed = lerp(boat.speed, moved / Math.max(dt, 1e-4), 0.2);

    const moving = clamp(Math.abs(boat.speed) / 60, 0, 1);
    const sink = smooth(T.sinkStart, T.sinkEnd, p);
    const bob = Math.sin(time * 1.2) * 0.035 * (1 - moving * 0.7);
    const drift = Math.sin(time * 0.55) * 4 * (1 - moving);

    boat.x = pt.x + drift;
    boat.y = pt.y + Math.sin(time * 0.8) * 2;
    // Steer along the path, but keep it subtle so the hull reads clearly
    boat.heading = -Math.atan2(pt.dx * 0.3, pt.dy) + bob;

    // Boat render
    const scale = (1 + Math.sin(time * 1.6) * 0.008) * (1 - sink * 0.35);
    boatEl.style.transform =
      `translate(${boat.x - bw / 2}px, ${boat.y - bl / 2}px) rotate(${boat.heading}rad) scale(${scale})`;
    boatEl.style.opacity = 1 - sink;
    boatEl.style.filter = `drop-shadow(${6 * (1 - sink)}px ${12 * (1 - sink)}px 8px rgba(0,0,0,.35)) blur(${sink * 5}px)`;

    // Direction vectors (bow direction + sideways)
    const dir = { x: -Math.sin(boat.heading), y: Math.cos(boat.heading) };
    const perp = { x: Math.cos(boat.heading), y: Math.sin(boat.heading) };

    // V-wake while sailing forward
    if (moved > 0 && sink < 0.4) {
      wakeDist += moved;
      while (wakeDist > 5) {
        wakeDist -= 5;
        const sp = Math.abs(boat.speed);
        const bx = boat.x + dir.x * bl * 0.18, by = boat.y + dir.y * bl * 0.18;
        for (const side of [-1, 1]) {
          const out = 14 + sp * 0.12;
          (side < 0 ? wakeL : wakeR).push({
            x: bx + perp.x * side * bw * 0.48, y: by + perp.y * side * bw * 0.48,
            vx: perp.x * side * out, vy: perp.y * side * out, age: 0, life: 2.6,
          });
        }
        const sx = boat.x - dir.x * bl * 0.48, sy = boat.y - dir.y * bl * 0.48;
        foam.push({
          x: sx + (Math.random() - 0.5) * bw * 0.5, y: sy + (Math.random() - 0.5) * 6,
          vx: (Math.random() - 0.5) * 18 - dir.x * 10, vy: (Math.random() - 0.5) * 18 - dir.y * 10,
          age: 0, life: 1.4 + Math.random() * 1.2, r: 2 + Math.random() * 3,
        });
      }
    }

    // Idle rings around the hull while waiting
    idleTimer += dt;
    if (moving < 0.3 && sink < 0.2 && idleTimer > 1.5) {
      idleTimer = 0;
      addRipple(boat.x, boat.y, { r: bl * 0.42, vr: 26, maxR: bl * 1.25, a0: 0.32, rot: boat.heading, squash: 0.45, w: 1.6 });
    }

    // Splash when the boat dives (and a smaller one if it resurfaces)
    if (prevP < T.splash && p >= T.splash) splash(W / 2, H / 2, true);
    if (prevP >= T.splash && p < T.splash) splash(W / 2, H / 2, false);
    prevP = p;

    // Logo surfacing
    const L = smooth(T.logoStart, T.logoEnd, p);
    const c = smooth(T.copyStart, T.copyEnd, p);
    const logoY = lerp(H * 0.5, H * 0.4, c);
    logoEl.style.opacity = L;
    logoEl.style.top = logoY + 'px';
    logoEl.style.transform = `translate(-50%, -50%) scale(${0.78 + 0.22 * L}) rotate(${(1 - L) * -8}deg)`;
    const d = (1 - L) * 90;
    if (d > 0.5 && L > 0) {
      disp.setAttribute('scale', d.toFixed(1));
      turb.setAttribute('baseFrequency', `${(0.012 + Math.sin(time * 0.9) * 0.003).toFixed(4)} ${(0.022 + Math.cos(time * 1.1) * 0.004).toFixed(4)}`);
      logoEl.style.filter = 'url(#ripple)';
    } else {
      logoEl.style.filter = 'none';
    }
    glowEl.style.opacity = L;

    // Gentle rings behind the settled logo
    settleTimer += dt;
    if (L > 0.95 && settleTimer > 2.6) {
      settleTimer = 0;
      const lr = logoEl.offsetWidth / 2;
      addRipple(W / 2, logoY, { r: lr * 0.9, vr: 45, maxR: lr * 2.6, a0: 0.22, w: 1.5 });
    }

    copyEl.style.opacity = c;
    copyEl.style.transform = `translate(-50%, ${(1 - c) * 24}px)`;
    copyEl.classList.toggle('live', c > 0.5);
    hintEl.style.opacity = 1 - smooth(0.01, 0.06, p);
    nav.classList.toggle('show-brand', c > 0.9);

    // Particles
    for (const arr of [wakeL, wakeR, foam]) {
      for (let i = arr.length - 1; i >= 0; i--) {
        const q = arr[i];
        q.age += dt;
        if (q.age > q.life) { arr.splice(i, 1); continue; }
        q.x += q.vx * dt; q.y += q.vy * dt;
        const k = Math.exp(-dt * 1.1); q.vx *= k; q.vy *= k;
      }
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      r.r += r.vr * dt;
      r.vr *= Math.exp(-dt * 0.35);
      if (r.r > r.maxR) ripples.splice(i, 1);
    }
  }

  // ---------- draw ----------
  function draw() {
    ctx.fillStyle = waterGrad;
    ctx.fillRect(0, 0, W, H);

    // Sun glints / small chop
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#cfe8f2';
    ctx.lineWidth = 1.4;
    for (const g of glints) {
      g.x += 0.12 * g.sp; if (g.x - g.len > W) g.x = -g.len;
      const s = Math.sin(time * g.sp + g.ph);
      if (s < 0.45) continue;
      ctx.globalAlpha = ((s - 0.45) / 0.55) * 0.28;
      ctx.beginPath();
      ctx.moveTo(g.x - g.len / 2, g.y);
      ctx.quadraticCurveTo(g.x, g.y + g.len * 0.2, g.x + g.len / 2, g.y);
      ctx.stroke();
    }

    // Ripple rings
    for (const r of ripples) {
      if (r.r <= 0) continue;
      const k = r.r / r.maxR;
      const a = r.a0 * Math.pow(1 - k, 1.4);
      const sq = lerp(r.squash, 1, k);
      ctx.lineWidth = r.w * (1 + k);
      ctx.globalAlpha = a * 0.6;
      ctx.strokeStyle = '#03141f';
      ctx.beginPath();
      ctx.ellipse(r.x, r.y + 2, r.r * sq, r.r, r.rot, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = a;
      ctx.strokeStyle = '#e9f6fb';
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, r.r * sq, r.r, r.rot, 0, Math.PI * 2);
      ctx.stroke();
    }

    // V-wake lines
    ctx.strokeStyle = '#f1fafd';
    for (const arr of [wakeL, wakeR]) {
      for (let i = 1; i < arr.length; i++) {
        const a = arr[i - 1], b = arr[i];
        if (Math.hypot(a.x - b.x, a.y - b.y) > 30) continue;
        const k = b.age / b.life;
        ctx.globalAlpha = (1 - k) * 0.55;
        ctx.lineWidth = 1.5 + k * 5;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }

    // Foam
    ctx.fillStyle = '#ffffff';
    for (const f of foam) {
      const k = f.age / f.life;
      ctx.globalAlpha = (1 - k) * 0.35;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 + k * 2), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---------- loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (hero.getBoundingClientRect().bottom > 0) {
      update(dt, progress());
      draw();
    }
    requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener('resize', resize);

  // Start the boat where the current scroll position says it should be (e.g. on reload mid-page)
  const p0 = progress();
  boat.t = smooth(T.travelStart, T.travelEnd, p0);
  prevP = p0;

  if (reduced) {
    update(0, 1); draw();
  } else {
    requestAnimationFrame(frame);
  }

  // Nav background once past the hero
  const navSolid = () => nav.classList.toggle('solid', window.scrollY > hero.offsetHeight - window.innerHeight * 0.9);
  window.addEventListener('scroll', navSolid, { passive: true });
  navSolid();
})();

/* =========================================================
   Inventory (example listings — replace with real stock)
   ========================================================= */
(() => {
  const boats = [
    { name: 'Coastline 23', type: 'Bowrider', year: 2021, len: "23'", hp: '250hp', price: '$68,500', hull: '#ffffff', stripe: '#0f4c6e', sky: ['#bfe3f2', '#f7efe0'] },
    { name: 'Reef Hunter 21', type: 'Fishing', year: 2019, len: "21'", hp: '150hp', price: '$42,900', hull: '#e9eef1', stripe: '#c0392b', sky: ['#cfe7ef', '#eef3ef'] },
    { name: 'Harbour Cruiser 30', type: 'Cruiser', year: 2018, len: "30'", hp: 'Twin 300hp', price: '$139,000', hull: '#f7f3ea', stripe: '#0b1b26', sky: ['#f4d6b0', '#f7ece0'] },
    { name: 'Lazy Days 24', type: 'Pontoon', year: 2022, len: "24'", hp: '115hp', price: '$54,750', hull: '#d9dee2', stripe: '#e0aa5a', sky: ['#c7e4ee', '#f2efe6'] },
    { name: 'Wakeline 20', type: 'Bowrider', year: 2020, len: "20'", hp: '200hp', price: '$39,900', hull: '#ffffff', stripe: '#e0aa5a', sky: ['#d8eef5', '#fbf3e6'] },
    { name: 'Offshore 26 CC', type: 'Fishing', year: 2023, len: "26'", hp: 'Twin 200hp', price: '$118,000', hull: '#eef2f4', stripe: '#0f4c6e', sky: ['#bcdcea', '#ecf1ee'] },
  ];

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
    return `
      <svg viewBox="0 0 300 188" preserveAspectRatio="xMidYMid slice">
        <defs><linearGradient id="s${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${b.sky[0]}"/><stop offset="1" stop-color="${b.sky[1]}"/></linearGradient></defs>
        <rect width="300" height="188" fill="url(#s${i})"/>
        <rect y="112" width="300" height="76" fill="#1d6a8c"/>
        <path d="M0 112 q15 -5 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 V120 H0Z" fill="#2c81a5"/>
        <g class="card-boat" transform="translate(0 18)">${cabin}${hull}</g>
        <path d="M30 124 q20 -6 40 0 t40 0 t40 0 t40 0 t40 0 t40 0" fill="none" stroke="#ffffff" stroke-width="2" opacity=".5"/>
      </svg>`;
  }

  const grid = document.getElementById('boatGrid');
  grid.innerHTML = boats.map((b, i) => `
    <article class="card reveal" data-type="${b.type}">
      <div class="card-art"><span class="tag">${b.type}</span>${art(b, i)}</div>
      <div class="card-body">
        <h3>${b.name}</h3>
        <ul class="specs"><li>${b.year}</li><li>${b.len}</li><li>${b.hp}</li></ul>
        <div class="card-foot"><span class="price">${b.price}</span><a href="#contact">Enquire →</a></div>
      </div>
    </article>`).join('');

  document.getElementById('filters').addEventListener('click', e => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === btn));
    const f = btn.dataset.filter;
    grid.querySelectorAll('.card').forEach(c => c.classList.toggle('hide', f !== 'all' && c.dataset.type !== f));
  });
})();

/* =========================================================
   Misc: reveal-on-scroll, mobile nav, contact form, year
   ========================================================= */
(() => {
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  const nav = document.getElementById('nav');
  const toggle = document.getElementById('navToggle');
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open);
  });
  document.querySelectorAll('#navLinks a').forEach(a => a.addEventListener('click', () => {
    nav.classList.remove('open'); toggle.setAttribute('aria-expanded', false);
  }));

  // NOTE: form isn't wired to a backend yet — hook up Formspree/Netlify Forms/etc. before launch.
  document.getElementById('contactForm').addEventListener('submit', e => {
    e.preventDefault();
    document.getElementById('formNote').textContent = "Thanks! We'll be in touch shortly.";
    e.target.reset();
  });

  document.getElementById('year').textContent = new Date().getFullYear();
})();

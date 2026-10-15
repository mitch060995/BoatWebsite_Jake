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

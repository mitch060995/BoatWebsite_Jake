/* =========================================================
   Hero: a drone shot. The boat idles side-on in the swell; as
   you scroll the camera circles it in a rising helix, then the
   boat powers off into the sun and the Fraser logo appears.
   ========================================================= */
import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const hero = document.getElementById('hero');
const stage = document.getElementById('heroStage');
const canvas = document.getElementById('scene');
const logoEl = document.getElementById('logo');
const letters = [...logoEl.querySelectorAll('.logo-word span')];
const introEl = document.getElementById('heroIntro');
const copyEl = document.getElementById('heroCopy');
const hintEl = document.getElementById('hint');
const shadeEl = document.getElementById('heroShade');
const hudEl = document.getElementById('hud');
const hudLabel = document.getElementById('hudLabel');
const hudBar = document.getElementById('hudBar');
const hudHdg = document.getElementById('hudHdg');
const hudAlt = document.getElementById('hudAlt');
const nav = document.getElementById('nav');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Start the story from the top unless deep-linking to a section
if ('scrollRestoration' in history && !location.hash) { history.scrollRestoration = 'manual'; window.scrollTo(0, 0); }

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// Scroll timeline (0..1 across the pinned hero)
const T = {
  orbitEnd: 0.58,                   // three-quarter helix, pulling out, ending behind the stern
  driveStart: 0.56, driveEnd: 0.86, // boat powers away
  logoStart: 0.66, logoEnd: 0.86,
  copyStart: 0.86, copyEnd: 0.97,
};

/* ---------------- renderer, scene, camera ---------------- */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  renderer = null;
}

if (renderer) init();

function init() {
  const mobile = Math.min(window.innerWidth, window.innerHeight) < 700;
  // Start a little under native resolution; drop further if frames run slow (see frame())
  let pixelRatio = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.72;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.3, 20000);

  // Low golden sun ahead of the opening camera, so the first shot is backlit
  const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 5), THREE.MathUtils.degToRad(140));

  const sky = new Sky();
  sky.scale.setScalar(10000);
  const su = sky.material.uniforms;
  su.turbidity.value = 10;
  su.rayleigh.value = 3;
  su.mieCoefficient.value = 0.005;
  su.mieDirectionalG.value = 0.82;
  su.sunPosition.value.copy(sun);

  const water = new Water(new THREE.PlaneGeometry(10000, 10000), {
    textureWidth: mobile ? 256 : 384,
    textureHeight: mobile ? 256 : 384,
    waterNormals: makeWaterNormals(256),
    sunDirection: sun.clone(),
    sunColor: 0xfff1dc,
    waterColor: 0x0b3a4f,
    distortionScale: 4.2,
    fog: false,
  });
  water.rotation.x = -Math.PI / 2;
  water.material.uniforms.size.value = 5.5;
  scene.add(water);

  // Image-based lighting from the sky so the gelcoat picks up the sunset
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(sky);
  scene.environment = pmrem.fromScene(envScene).texture;
  scene.add(sky);

  const sunLight = new THREE.DirectionalLight(0xffdcb4, 2.2);
  sunLight.position.copy(sun).multiplyScalar(100);
  scene.add(sunLight);
  scene.add(new THREE.HemisphereLight(0xbfd6e6, 0x0a2a3a, 0.35));

  const boat = buildBoat();
  scene.add(boat);

  const trail = makeTrail();
  scene.add(trail.mesh);

  /* ---------------- layout ---------------- */
  let W = 0, H = 0;
  function resize() {
    const r = stage.getBoundingClientRect();
    W = r.width; H = r.height;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.fov = camera.aspect < 1 ? 52 : 38;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  function progress() {
    const total = hero.offsetHeight - window.innerHeight;
    return total > 0 ? clamp(-hero.getBoundingClientRect().top / total, 0, 1) : 0;
  }

  /* ---------------- camera path ---------------- */
  const target = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const fwd = new THREE.Vector3();

  function orbitPos(s, out) {
    // Portrait screens sit further back so the whole hull fits side-on
    const fit = Math.max(1, 0.95 / camera.aspect);
    const phi = s * Math.PI * 1.5;                     // 270°: starboard -> bow -> port -> stern
    const R = lerp(11.5, 26, easeInOut(s)) * fit;      // drone pulls out as it circles
    const h = lerp(1.6, 9, easeInOut(s));
    return out.set(Math.sin(phi) * R, h, Math.cos(phi) * R);
  }

  const LABELS = ['Starboard profile', 'Bow', 'Port side', 'Astern'];
  let lastLabel = '';

  /* ---------------- frame ---------------- */
  let ps = progress(), time = 0, intro = 0;
  const end = new THREE.Vector3();
  const finalCam = new THREE.Vector3(-16, 3.2, 3);   // low, just off the stern quarter

  function update(dt, p) {
    time += dt;
    ps += (p - ps) * (1 - Math.exp(-dt * 3.2));   // glide after the scroll rather than snapping to it
    intro = Math.min(1, intro + dt / 2.2);          // camera settles in on load

    const s = smooth(0, T.orbitEnd, ps);
    const d = smooth(T.driveStart, T.driveEnd, ps);

    // Boat: idle bob, then plane away
    const run = Math.pow(d, 2.3) * 420;
    const planing = smooth(0, 0.12, d) * (1 - 0.6 * smooth(0.25, 1, d));
    boat.position.set(run, -0.2 + Math.sin(time * 1.1) * 0.05 + planing * 0.12, 0);
    boat.rotation.set(
      Math.sin(time * 0.7) * 0.025 * (1 - planing),           // roll
      0,
      Math.sin(time * 0.9) * 0.012 + planing * 0.075,           // pitch (bow up when getting on plane)
    );

    trail.update(time, -4.3, run - 4.3, d);

    // Camera: helix around the boat, then ease down to a horizon shot that follows it
    orbitPos(s, camPos);
    camPos.multiplyScalar(lerp(1.18, 1, easeInOut(intro)));
    const settle = smooth(0, 0.7, d);
    orbitPos(1, end);
    if (d > 0) camPos.lerpVectors(end, finalCam, easeInOut(settle));
    camera.position.copy(camPos);

    target.set(0, 0.9, 0);
    const follow = smooth(0, 0.4, d);
    target.x = lerp(0, boat.position.x * 0.92, follow);
    target.y = lerp(0.9, 1.6, follow);
    camera.lookAt(target);

    water.material.uniforms.time.value = time * 0.6;
    renderer.render(scene, camera);

    // HUD: drone heading / altitude
    camera.getWorldDirection(fwd);
    const hdg = Math.round((Math.atan2(fwd.x, -fwd.z) * 180 / Math.PI + 360) % 360);
    hudHdg.textContent = String(hdg).padStart(3, '0') + '°';
    hudAlt.textContent = Math.max(1, Math.round(camera.position.y)) + ' m';
    hudBar.style.transform = `scaleX(${d > 0 ? 1 : s})`;
    const label = d > 0.02 ? 'Underway' : LABELS[Math.round(s * 3)];
    if (label !== lastLabel) { hudLabel.textContent = label; lastLabel = label; }

    overlay(ps);
  }

  /* ---------------- loop ---------------- */
  let last = performance.now(), slow = 0;
  function frame(now) {
    const raw = (now - last) / 1000;
    const dt = Math.min(raw, 0.05);
    last = now;
    if (hero.getBoundingClientRect().bottom > 0) {
      update(dt, progress());
      // Adaptive quality: if we keep missing ~45fps, render fewer pixels
      slow = raw > 0.022 && raw < 0.2 ? slow + 1 : Math.max(0, slow - 1);
      if (slow > 40 && pixelRatio > 0.75) {
        pixelRatio = Math.max(0.75, pixelRatio - 0.25);
        renderer.setPixelRatio(pixelRatio);
        resize();
        slow = 0;
      }
    }
    requestAnimationFrame(frame);
  }

  if (reduced) {
    // Still frame: the horizon after the boat has gone, with the logo and copy in place
    intro = 1; ps = 1; update(0, 1);
    window.addEventListener('resize', () => update(0, 1));
    stage.classList.add('ready');
    return;
  }

  stage.classList.add('live');
  update(0, progress());
  stage.classList.add('ready');
  requestAnimationFrame(t => { last = t; requestAnimationFrame(frame); });
}

/* ---------------- DOM overlays (title, logo, copy) ---------------- */
function overlay(ps) {
  const live = stage.classList.contains('live');
  const L = live ? smooth(T.logoStart, T.logoEnd, ps) : 1;
  const c = live ? smooth(T.copyStart, T.copyEnd, ps) : 1;
  const out = smooth(0.01, 0.07, ps);

  introEl.style.opacity = 1 - out;
  introEl.style.transform = `translateY(${-out * 40}px)`;
  hintEl.style.opacity = 1 - smooth(0.005, 0.04, ps);
  hudEl.style.opacity = smooth(0.0, 0.04, ps) * (1 - smooth(0.62, 0.7, ps));

  logoEl.style.setProperty('--l', L.toFixed(3));
  logoEl.style.top = lerp(42, 36, c) + '%';
  letters.forEach((el, i) => {
    const li = clamp((L - 0.15 - i * 0.07) / 0.45, 0, 1);
    const e = 1 - Math.pow(1 - li, 3);
    el.style.opacity = e;
    el.style.transform = `translateY(${(1 - e) * 0.45}em)`;
  });
  shadeEl.style.opacity = L * 0.85;

  copyEl.style.opacity = c;
  copyEl.style.transform = `translate(-50%, ${(1 - c) * 26}px)`;
  copyEl.classList.toggle('live', c > 0.5);
  nav.classList.toggle('show-brand', c > 0.9);
}

// Nav background once past the hero
const navSolid = () => nav.classList.toggle('solid', window.scrollY > hero.offsetHeight - window.innerHeight * 0.9);
window.addEventListener('scroll', navSolid, { passive: true });
navSolid();
if (!renderer) overlay(1);

/* =========================================================
   Procedural water normal map (tileable), so nothing has to be
   downloaded besides three.js itself.
   ========================================================= */
function makeWaterNormals(size) {
  const waves = [];
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 70; i++) {
    const kx = Math.round((rnd() * 2 - 1) * 22), ky = Math.round((rnd() * 2 - 1) * 22);
    if (!kx && !ky) continue;
    waves.push({ kx, ky, a: 1 / Math.pow(Math.hypot(kx, ky), 1.35), ph: rnd() * Math.PI * 2 });
  }
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let dx = 0, dy = 0;
      for (const w of waves) {
        const c = Math.cos((Math.PI * 2 * (w.kx * x + w.ky * y)) / size + w.ph) * w.a;
        dx += c * w.kx; dy += c * w.ky;
      }
      const nx = -dx * 0.075, ny = -dy * 0.075, l = Math.hypot(nx, ny, 1);
      const o = (y * size + x) * 4;
      data[o] = ((nx / l) * 0.5 + 0.5) * 255;
      data[o + 1] = ((ny / l) * 0.5 + 0.5) * 255;
      data[o + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/* =========================================================
   The boat: a ~8 m centre-console with a T-top and twin
   outboards, built from lofted hull sections.
   Bow points +x, starboard is +z, waterline ≈ y 0.
   ========================================================= */
function buildBoat() {
  const LEN = 8, X0 = -4, W_IN = 0.14, SOLE = 0.62;
  const g = new THREE.Group();

  const M = {
    hull: new THREE.MeshPhysicalMaterial({ color: 0xf5f7f8, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.06, side: THREE.DoubleSide }),
    navy: new THREE.MeshPhysicalMaterial({ color: 0x0d2b40, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1, side: THREE.DoubleSide }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd19a45, metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide }),
    deck: new THREE.MeshStandardMaterial({ color: 0xe9ebea, roughness: 0.55, side: THREE.DoubleSide }),
    teak: new THREE.MeshStandardMaterial({ map: teakTexture(), roughness: 0.75, side: THREE.DoubleSide }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe8ecef, metalness: 1, roughness: 0.12 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x1b2e38, roughness: 0.04, metalness: 0.3, transparent: true, opacity: 0.6 }),
    canvas: new THREE.MeshStandardMaterial({ color: 0x12324a, roughness: 0.85, side: THREE.DoubleSide }),
    cushion: new THREE.MeshStandardMaterial({ color: 0xf1ebe1, roughness: 0.9 }),
    engine: new THREE.MeshPhysicalMaterial({ color: 0x16191c, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.5, metalness: 0.3 }),
  };

  const prof = u => {
    const hb = u < 0.45
      ? 1.28 * (0.88 + 0.12 * Math.sin((u / 0.45) * Math.PI / 2))
      : 1.28 * Math.pow(Math.max(0, 1 - Math.pow((u - 0.45) / 0.55, 2)), 0.62);
    const sheer = 1.0 + 0.36 * Math.pow(u, 2.2);
    const keel = -0.36 + (u > 0.55 ? 1.12 * Math.pow((u - 0.55) / 0.45, 2.1) : 0);
    return { hb, sheer, keel };
  };
  // starboard half-section, keel -> gunwale, as [z, y]
  const section = u => {
    const { hb, sheer, keel } = prof(u);
    const dead = 0.34 * (1 - u * 0.25);
    const chine = Math.min(keel + dead, sheer - 0.08);
    return [
      [0, keel],
      [hb * 0.5, keel + dead * 0.55],
      [hb * 0.9, chine],
      [hb * 0.98, chine + 0.03],
      [hb, lerp(chine, sheer, 0.5)],
      [hb * 0.995, sheer],
    ];
  };
  const xAt = u => X0 + u * LEN;
  const zAt = (u, y) => {
    const s = section(u);
    for (let i = 0; i < s.length - 1; i++) {
      if (y >= s[i][1] && y <= s[i + 1][1]) return lerp(s[i][0], s[i + 1][0], (y - s[i][1]) / Math.max(1e-4, s[i + 1][1] - s[i][1]));
    }
    return s[s.length - 1][0];
  };

  // Generic lofted strip: for each u, a row of points; quads between rows
  function loft(us, row, mat) {
    const rows = us.map(row);
    const n = rows[0].length;
    const pos = [];
    const idx = [];
    rows.forEach(r => r.forEach(p => pos.push(p[0], p[1], p[2])));
    for (let i = 0; i < rows.length - 1; i++) {
      for (let j = 0; j < n - 1; j++) {
        const a = i * n + j, b = a + 1, c = a + n, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    g.add(m);
    return m;
  }
  const range = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => lerp(a, b, i / n));

  // Hull skin: port gunwale -> keel -> starboard gunwale
  loft(range(0, 1, 64), u => {
    const s = section(u), x = xAt(u), r = [];
    for (let i = s.length - 1; i >= 1; i--) r.push([x, s[i][1], -s[i][0]]);
    for (const q of s) r.push([x, q[1], q[0]]);
    return r;
  }, M.hull);

  // Transom (flat stern panel)
  {
    const s = section(0), pts = [];
    for (let i = s.length - 1; i >= 1; i--) pts.push(new THREE.Vector2(-s[i][0], s[i][1]));
    for (const q of s) pts.push(new THREE.Vector2(q[0], q[1]));
    const geo = new THREE.ShapeGeometry(new THREE.Shape(pts));
    geo.rotateY(Math.PI / 2);
    const m = new THREE.Mesh(geo, M.hull);
    m.position.x = X0;
    g.add(m);
  }

  // Navy hull band + gold pinstripe, following the topsides
  const band = (o0, o1, mat, u1 = 0.97) => {
    for (const side of [1, -1]) {
      loft(range(0, u1, 48), u => {
        const { sheer } = prof(u), x = xAt(u);
        return [o0, o1].map(o => { const y = sheer + o; return [x, y, side * (zAt(u, y) + 0.008)]; });
      }, mat);
    }
  };
  band(-0.34, -0.15, M.navy);
  band(-0.41, -0.38, M.gold, 0.93);

  // Gunwale caps
  for (const side of [1, -1]) {
    loft(range(0, 1, 48), u => {
      const { hb, sheer } = prof(u), x = xAt(u);
      return [[x, sheer, side * hb], [x, sheer + 0.004, side * Math.max(0, hb - W_IN)]];
    }, M.deck);
  }
  // Foredeck
  loft(range(0.6, 1, 24), u => {
    const { hb, sheer } = prof(u), x = xAt(u), w = Math.max(0, hb - W_IN);
    return [[x, sheer + 0.003, w], [x, sheer + 0.03, 0], [x, sheer + 0.003, -w]];
  }, M.deck);
  // Aft deck strip over the transom
  loft(range(0, 0.03, 2), u => {
    const { hb, sheer } = prof(u), x = xAt(u), w = hb - W_IN;
    return [[x, sheer + 0.003, w], [x, sheer + 0.003, -w]];
  }, M.deck);
  // Cockpit: inner walls, teak sole, bulkheads
  const CK = range(0.03, 0.6, 30);
  for (const side of [1, -1]) {
    loft(CK, u => {
      const { hb, sheer } = prof(u), x = xAt(u), z = side * (hb - W_IN);
      return [[x, sheer, z], [x, sheer - SOLE, z]];
    }, M.deck);
  }
  loft(CK, u => {
    const { hb, sheer } = prof(u), x = xAt(u), z = hb - W_IN;
    return [[x, sheer - SOLE, z], [x, sheer - SOLE, -z]];
  }, M.teak);
  for (const u of [0.03, 0.6]) {
    const { hb, sheer } = prof(u), z = hb - W_IN;
    const geo = new THREE.PlaneGeometry(z * 2, SOLE);
    geo.rotateY(Math.PI / 2);
    const m = new THREE.Mesh(geo, M.deck);
    m.position.set(xAt(u), sheer - SOLE / 2, 0);
    g.add(m);
  }

  // Rub rails
  for (const side of [1, -1]) {
    const pts = range(0, 1, 40).map(u => { const { hb, sheer } = prof(u); return new THREE.Vector3(xAt(u), sheer - 0.025, side * (hb + 0.012)); });
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.035, 8), M.dark));
  }

  // Bow rail with stanchions
  {
    const H = 0.32, inset = 0.07;
    const star = range(0.62, 0.985, 14).map(u => { const { hb, sheer } = prof(u); return new THREE.Vector3(xAt(u), sheer + H, Math.max(0, hb - inset)); });
    const pts = [...star, ...star.slice(0, -1).reverse().map(v => new THREE.Vector3(v.x, v.y, -v.z))];
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.022, 8), M.chrome));
    for (const u of [0.64, 0.74, 0.84, 0.93]) {
      const { hb, sheer } = prof(u);
      for (const side of [1, -1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, H, 8), M.chrome);
        post.position.set(xAt(u), sheer + H / 2, side * Math.max(0, hb - inset));
        g.add(post);
      }
    }
  }

  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    g.add(m);
    return m;
  };

  // Centre console + windscreen
  const uC = 0.44, xC = xAt(uC), sole = prof(uC).sheer - SOLE;
  add(new RoundedBoxGeometry(0.95, 1.05, 0.95, 3, 0.09), M.deck, xC, sole + 0.525, 0);
  add(new RoundedBoxGeometry(0.06, 0.42, 0.92, 2, 0.02), M.glass, xC + 0.5, sole + 1.18, 0, 0, 0, 0.5);
  add(new RoundedBoxGeometry(0.3, 0.04, 0.5, 2, 0.015), M.dark, xC + 0.2, sole + 1.07, 0, 0, 0, -0.3);

  // T-top: four chrome legs and a navy canopy
  for (const dx of [-0.55, 0.42]) {
    for (const dz of [-0.5, 0.5]) {
      add(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 10), M.chrome, xC + dx, sole + 1.1, dz);
    }
  }
  add(new RoundedBoxGeometry(2.1, 0.1, 1.75, 3, 0.045), M.canvas, xC - 0.08, sole + 2.22, 0);
  add(new RoundedBoxGeometry(2.14, 0.035, 1.79, 2, 0.015), M.chrome, xC - 0.08, sole + 2.16, 0);

  // Leaning post, rear bench, bow cushions
  add(new RoundedBoxGeometry(0.5, 0.85, 0.95, 3, 0.08), M.deck, xC - 1.0, sole + 0.43, 0);
  add(new RoundedBoxGeometry(0.42, 0.18, 0.9, 3, 0.07), M.cushion, xC - 1.0, sole + 0.94, 0);
  {
    const u = 0.1, { hb, sheer } = prof(u), w = (hb - W_IN) * 2 * 0.94;
    add(new RoundedBoxGeometry(0.55, 0.42, w, 3, 0.07), M.deck, xAt(u), sheer - SOLE + 0.21, 0);
    add(new RoundedBoxGeometry(0.5, 0.14, w - 0.04, 3, 0.06), M.cushion, xAt(u) + 0.02, sheer - SOLE + 0.48, 0);
  }
  {
    const u = 0.72, { hb, sheer } = prof(u);
    add(new RoundedBoxGeometry(1.1, 0.12, (hb - W_IN) * 1.6, 3, 0.05), M.cushion, xAt(u), sheer + 0.09, 0);
  }

  // Twin outboards
  const s0 = prof(0).sheer;
  for (const z of [-0.45, 0.45]) {
    add(new RoundedBoxGeometry(0.3, 0.28, 0.32, 2, 0.04), M.dark, X0 - 0.14, s0 - 0.12, z);
    add(new RoundedBoxGeometry(0.66, 0.82, 0.48, 4, 0.14), M.engine, X0 - 0.46, s0 + 0.28, z);
    add(new RoundedBoxGeometry(0.67, 0.05, 0.49, 2, 0.02), M.gold, X0 - 0.46, s0 + 0.1, z);
    add(new RoundedBoxGeometry(0.3, 0.9, 0.2, 2, 0.06), M.engine, X0 - 0.4, s0 - 0.5, z);
    add(new RoundedBoxGeometry(0.42, 0.14, 0.12, 2, 0.05), M.dark, X0 - 0.42, s0 - 1.0, z);
  }

  return g;
}

function teakTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#a7744a'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 16; i++) {
    x.fillStyle = `hsl(28, ${38 + (i * 37) % 14}%, ${40 + (i * 53) % 9}%)`;
    x.fillRect(0, i * 16 + 1, 256, 13);
    x.fillStyle = '#2a1c12'; x.fillRect(0, i * 16 + 14, 256, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  return t;
}

/* =========================================================
   Wake: a foam carpet that grows from where the boat set off
   to its transom, spreading wider behind with Kelvin arms.
   ========================================================= */
function makeTrail() {
  const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uLen: { value: 1 } },
    vertexShader: `
      varying vec2 vUv; varying vec3 vW;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float uTime, uOpacity, uLen; varying vec2 vUv; varying vec3 vW;
      float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        float along = vUv.x;                         // 0 = where it set off, 1 = transom
        float back = (1.0 - along) * uLen;           // metres behind the boat
        float across = abs(vUv.y - 0.5) * 2.0;
        float w = clamp(0.12 + back * 0.045, 0.12, 1.0);
        float n = noise(vW.xz * 1.3 + vec2(uTime * 0.7, 0.0)) * 0.55 + noise(vW.xz * 3.7 - uTime * 0.9) * 0.3 + noise(vW.xz * 9.0) * 0.15;
        float body = 1.0 - smoothstep(w * 0.25, w * 0.6, across);
        float arms = 1.0 - smoothstep(0.0, 0.035 + back * 0.0006, abs(across - w));
        float foam = smoothstep(0.38, 0.72, n * (0.55 + body * 0.75)) * body + arms * smoothstep(0.35, 0.7, n) * 0.75;
        float fade = exp(-back * 0.012) * smoothstep(1.0, 0.985, along);
        gl_FragColor = vec4(vec3(0.94, 0.97, 1.0), foam * fade * uOpacity);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.04;
  mesh.visible = false;
  const WIDTH = 22;
  return {
    mesh,
    update(time, startX, sternX, d) {
      const len = sternX - startX;
      mesh.visible = len > 0.2;
      if (!mesh.visible) return;
      mesh.scale.set(len, 1, WIDTH);
      mesh.position.x = (startX + sternX) / 2;
      mat.uniforms.uTime.value = time;
      mat.uniforms.uLen.value = len;
      mat.uniforms.uOpacity.value = smooth(0, 0.05, d);
    },
  };
}

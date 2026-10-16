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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
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
    textureWidth: mobile ? 256 : 512,
    textureHeight: mobile ? 256 : 512,
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
    boat.position.set(run, -0.1 + Math.sin(time * 1.1) * 0.05 + planing * 0.12, 0);
    boat.rotation.set(
      Math.sin(time * 0.7) * 0.025 * (1 - planing),           // roll
      0,
      Math.sin(time * 0.9) * 0.012 + planing * 0.075,           // pitch (bow up when getting on plane)
    );

    trail.update(time, -4.0, run - 4.0, d);

    // Camera: helix around the boat, then ease down to a horizon shot that follows it
    orbitPos(s, camPos);
    camPos.multiplyScalar(lerp(1.18, 1, easeInOut(intro)));
    const settle = smooth(0, 0.7, d);
    orbitPos(1, end);
    if (d > 0) camPos.lerpVectors(end, finalCam, easeInOut(settle));
    camera.position.copy(camPos);

    target.set(0, 1.1, 0);
    const follow = smooth(0, 0.4, d);
    target.x = lerp(0, boat.position.x * 0.92, follow);
    target.y = lerp(1.1, 1.6, follow);
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
  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (hero.getBoundingClientRect().bottom > 0) update(dt, progress());
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
    el.style.filter = e < 1 ? `blur(${(1 - e) * 12}px)` : 'none';
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
   The boat: a Fraser 737 — a 7.37 m West Australian hardtop
   cabin boat. White deep-V hull, navy rub strip, blue
   pinstripes and the blue swoosh down the hardtop pillar,
   forward cabin, raked windscreen, canvas extension aft,
   sterndrive with a swim platform.
   Bow points +x, starboard is +z, waterline ≈ y 0.2.
   ========================================================= */
function buildBoat() {
  const LEN = 7.37, X0 = -LEN / 2, W_IN = 0.13, SOLE = 0.6;
  const g = new THREE.Group();

  const M = {
    hull: new THREE.MeshPhysicalMaterial({ color: 0xf6f6f2, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06, side: THREE.DoubleSide }),
    navy: new THREE.MeshPhysicalMaterial({ color: 0x14243a, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1, side: THREE.DoubleSide }),
    blue: new THREE.MeshPhysicalMaterial({ color: 0x1f5fb8, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1, side: THREE.DoubleSide }),
    deck: new THREE.MeshStandardMaterial({ color: 0xe6e7e3, roughness: 0.6, side: THREE.DoubleSide }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe8ecef, metalness: 1, roughness: 0.12 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x3b5562, roughness: 0.02, metalness: 0.5, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
    canvas: new THREE.MeshStandardMaterial({ color: 0x1d2a33, roughness: 0.85, side: THREE.DoubleSide }),
    cushion: new THREE.MeshStandardMaterial({ color: 0xece6da, roughness: 0.9 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.5, metalness: 0.3 }),
  };

  // Plan shape and sheer: fine raked entry, beam 2.5 m, near-flat sheer rising a little forward
  const prof = u => {
    const hb = u < 0.42
      ? 1.25 * (0.9 + 0.1 * Math.sin((u / 0.42) * Math.PI / 2))
      : 1.25 * Math.pow(Math.max(0, 1 - Math.pow((u - 0.42) / 0.58, 2)), 0.58);
    const sheer = 1.12 + 0.34 * Math.pow(u, 2.2);
    const keel = -0.38 + (u > 0.52 ? 1.25 * Math.pow((u - 0.52) / 0.48, 2.0) : 0);
    return { hb, sheer, keel };
  };
  // Deep-V section with a reverse chine, keel -> gunwale, as [z, y]
  const section = u => {
    const { hb, sheer, keel } = prof(u);
    const dead = 0.4 * (1 - u * 0.2);
    const chine = Math.min(keel + dead, sheer - 0.1);
    return [
      [0, keel],
      [hb * 0.45, keel + dead * 0.5],
      [hb * 0.88, chine],
      [hb * 0.97, chine - 0.015],            // reverse chine flat
      [hb, chine + 0.06],
      [hb, lerp(chine, sheer, 0.55)],
      [hb * 0.99, sheer],
    ];
  };
  const xAt = u => X0 + u * LEN;
  const zAt = (u, y) => {
    const s = section(u);
    for (let i = 0; i < s.length - 1; i++) {
      const y0 = Math.min(s[i][1], s[i + 1][1]), y1 = Math.max(s[i][1], s[i + 1][1]);
      if (y >= y0 && y <= y1) return lerp(s[i][0], s[i + 1][0], (y - s[i][1]) / ((s[i + 1][1] - s[i][1]) || 1e-4));
    }
    return y > s[s.length - 1][1] ? s[s.length - 1][0] : 0;
  };

  function loft(us, row, mat) {
    const rows = us.map(row);
    const n = rows[0].length;
    const pos = [], idx = [];
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
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    g.add(m);
    return m;
  };
  // A flat bar between two points in the side (x/y) plane, at a given z
  const bar = (x1, y1, x2, y2, z, width, depth, mat) => {
    const L = Math.hypot(x2 - x1, y2 - y1);
    return add(new THREE.BoxGeometry(L, width, depth), mat, (x1 + x2) / 2, (y1 + y2) / 2, z, 0, 0, Math.atan2(y2 - y1, x2 - x1));
  };

  // ---- Hull skin + transom
  loft(range(0, 1, 72), u => {
    const s = section(u), x = xAt(u), r = [];
    for (let i = s.length - 1; i >= 1; i--) r.push([x, s[i][1], -s[i][0]]);
    for (const q of s) r.push([x, q[1], q[0]]);
    return r;
  }, M.hull);
  {
    const s = section(0), pts = [];
    for (let i = s.length - 1; i >= 1; i--) pts.push(new THREE.Vector2(-s[i][0], s[i][1]));
    for (const q of s) pts.push(new THREE.Vector2(q[0], q[1]));
    const geo = new THREE.ShapeGeometry(new THREE.Shape(pts));
    geo.rotateY(Math.PI / 2);
    add(geo, M.hull, X0, 0, 0);
  }

  // ---- Livery: navy rub strip, blue pinstripe under it, blue boot line above the waterline
  const bandAt = (yLo, yHi, mat, u0 = 0, u1 = 0.97, n = 56) => {
    for (const side of [1, -1]) {
      loft(range(u0, u1, n), u => {
        const x = xAt(u);
        return [yLo(u), yHi(u)].map(y => [x, y, side * (zAt(u, y) + 0.008)]);
      }, mat);
    }
  };
  const sh = u => prof(u).sheer;
  bandAt(u => sh(u) - 0.13, u => sh(u) - 0.03, M.navy, 0, 0.985);
  bandAt(u => sh(u) - 0.2, u => sh(u) - 0.17, M.blue, 0, 0.95);
  const boot = u => Math.min(Math.max(0.4, section(u)[4][1] + 0.08), sh(u) - 0.35);
  bandAt(u => boot(u), u => boot(u) + 0.035, M.blue, 0, 0.9);

  // ---- Decks: gunwale caps, foredeck, cockpit
  for (const side of [1, -1]) {
    loft(range(0, 1, 48), u => {
      const { hb, sheer } = prof(u), x = xAt(u);
      return [[x, sheer, side * hb], [x, sheer + 0.004, side * Math.max(0, hb - W_IN)]];
    }, M.deck);
  }
  loft(range(0.6, 1, 24), u => {
    const { hb, sheer } = prof(u), x = xAt(u), w = Math.max(0, hb - W_IN);
    return [[x, sheer + 0.003, w], [x, sheer + 0.03, 0], [x, sheer + 0.003, -w]];
  }, M.deck);
  loft(range(0, 0.03, 2), u => {
    const { hb, sheer } = prof(u), x = xAt(u), w = hb - W_IN;
    return [[x, sheer + 0.003, w], [x, sheer + 0.003, -w]];
  }, M.deck);
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
  }, M.deck);
  {
    const { hb, sheer } = prof(0.03), z = hb - W_IN;
    const geo = new THREE.PlaneGeometry(z * 2, SOLE);
    geo.rotateY(Math.PI / 2);
    add(geo, M.deck, xAt(0.03), sheer - SOLE / 2, 0);
  }

  // ---- Forward cabin: a low moulded top that sweeps down into the foredeck
  const cabW = u => Math.max(0.05, prof(u).hb - 0.2);
  const cabH = u => sh(u) + 0.5 * (1 - smooth(0.76, 0.92, u));
  loft(range(0.6, 0.93, 30), u => {
    const { hb, sheer } = prof(u), x = xAt(u), w = cabW(u), t = cabH(u), wi = Math.max(0, hb - W_IN);
    return [
      [x, sheer + 0.004, wi], [x, t - 0.06, Math.min(wi, w - 0.08)], [x, t, w * 0.55], [x, t + 0.035, 0],
      [x, t, -w * 0.55], [x, t - 0.06, -Math.min(wi, w - 0.08)], [x, sheer + 0.004, -wi],
    ];
  }, M.hull);
  // bulkhead under the windscreen, cockpit side
  {
    const u = 0.6, { hb, sheer } = prof(u), w = hb - W_IN, t = cabH(u);
    const geo = new THREE.PlaneGeometry(w * 2, t - (sheer - SOLE));
    geo.rotateY(Math.PI / 2);
    add(geo, M.deck, xAt(u), (t + sheer - SOLE) / 2, 0);
  }
  // cabin side windows
  for (const side of [1, -1]) {
    loft(range(0.64, 0.78, 6), u => {
      const { hb, sheer } = prof(u), x = xAt(u), wi = hb - W_IN, w = cabW(u), t = cabH(u);
      const zAtY = y => lerp(wi, Math.min(wi, w - 0.08), (y - sheer) / (t - 0.06 - sheer));
      const y0 = sheer + 0.12, y1 = sheer + 0.3;
      return [[x, y0, side * (zAtY(y0) + 0.012)], [x, y1, side * (zAtY(y1) + 0.012)]];
    }, M.glass);
  }

  // ---- Hardtop wheelhouse
  const uWs = 0.6, uWt = 0.535, uRoofBack = 0.33;
  const roofY = sh(0.5) + 1.3;
  const wsBottom = cabH(uWs);
  const halfW = u => prof(u).hb - 0.22;
  // raked windscreen
  loft([0, 1], k => {
    const u = lerp(uWs, uWt, k), x = xAt(u), y = lerp(wsBottom, roofY - 0.06, k), w = halfW(u) - 0.04 * k;
    return [[x, y, w], [x, y, -w]];
  }, M.glass);
  // windscreen frame: centre mullion + side posts
  for (const z of [-1, 0, 1]) {
    const zz = z === 0 ? 0 : z * (halfW(uWs) - 0.02);
    bar(xAt(uWs), wsBottom, xAt(uWt), roofY - 0.04, zz, 0.05, 0.05, z === 0 ? M.hull : M.hull);
  }
  // side glass between windscreen and the rear pillar
  for (const side of [1, -1]) {
    loft(range(0.45, 0.58, 4), u => {
      const x = xAt(u), z = side * (halfW(u) + 0.02);
      const yLo = Math.max(sh(u) + 0.42, u > 0.585 ? wsBottom : sh(u) + 0.42);
      return [[x, yLo, z], [x, roofY - 0.06, z]];
    }, M.glass);
  }
  // roof with a dark visor underneath and grab rails on top
  const roofX0 = xAt(uRoofBack), roofX1 = xAt(uWt) + 0.18;
  const roofW = halfW(0.5) * 2 + 0.16;
  add(new RoundedBoxGeometry(roofX1 - roofX0, 0.09, roofW, 3, 0.04), M.hull, (roofX0 + roofX1) / 2, roofY, 0);
  add(new RoundedBoxGeometry(0.5, 0.02, roofW - 0.08, 2, 0.008), M.navy, roofX1 - 0.3, roofY - 0.055, 0);
  for (const side of [1, -1]) {
    const z = side * (roofW / 2 - 0.12);
    const pts = [
      new THREE.Vector3(roofX0 + 0.25, roofY + 0.04, z), new THREE.Vector3(roofX0 + 0.3, roofY + 0.14, z),
      new THREE.Vector3(roofX1 - 0.35, roofY + 0.14, z), new THREE.Vector3(roofX1 - 0.3, roofY + 0.04, z),
    ];
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), 40, 0.018, 8), M.chrome));
  }
  // antenna, raked back
  add(new THREE.CylinderGeometry(0.008, 0.014, 1.5, 6), M.hull, roofX0 + 0.25, roofY + 0.75, -(roofW / 2 - 0.2), 0, 0, 0.35);

  // rear pillars: solid, slanting forward to the gunwale, with the blue swoosh
  const pTop = [xAt(uRoofBack) + 0.12, roofY - 0.04], pFoot = [xAt(0.43), sh(0.43) + 0.02];
  for (const side of [1, -1]) {
    const z = side * (halfW(0.4) + 0.02);
    bar(pTop[0], pTop[1], pFoot[0], pFoot[1], z, 0.26, 0.05, M.hull);
    // two blue bands along the pillar's outer face, carrying on down the hull side
    const off = side * 0.03;
    bar(pTop[0] + 0.02, pTop[1] - 0.06, pFoot[0] + 0.05, pFoot[1], z + off, 0.08, 0.012, M.blue);
    bar(pTop[0] - 0.07, pTop[1] - 0.06, pFoot[0] - 0.04, pFoot[1], z + off, 0.03, 0.012, M.blue);
  }
  bandAt(u => sh(u) - 0.17, u => sh(u) - 0.08, M.blue, 0.4, 0.46, 4);

  // helm: dash under the windscreen, seats
  add(new RoundedBoxGeometry(0.42, 0.18, halfW(0.58) * 2 - 0.1, 2, 0.04), M.dark, xAt(0.575), wsBottom - 0.1, 0);
  for (const z of [-0.5, 0.5]) {
    add(new RoundedBoxGeometry(0.5, 0.42, 0.5, 3, 0.06), M.deck, xAt(0.5), sh(0.5) - SOLE + 0.21, z);
    add(new RoundedBoxGeometry(0.5, 0.12, 0.5, 3, 0.05), M.cushion, xAt(0.5), sh(0.5) - SOLE + 0.48, z);
    add(new RoundedBoxGeometry(0.1, 0.45, 0.46, 3, 0.04), M.cushion, xAt(0.5) - 0.24, sh(0.5) - SOLE + 0.75, z);
  }

  // canvas extension aft of the hardtop on two stainless bows
  const uCan = 0.1;
  loft([0, 1], k => {
    const u = lerp(uRoofBack + 0.02, uCan, k), x = xAt(u), y = roofY - 0.04 - k * 0.12, w = roofW / 2 - 0.06 - k * 0.05;
    return [[x, y, w], [x, y + 0.04, 0], [x, y, -w]];
  }, M.canvas);
  for (const side of [1, -1]) {
    const z = side * (roofW / 2 - 0.12);
    bar(xAt(uCan), roofY - 0.17, xAt(uCan) - 0.05, sh(uCan), z, 0.035, 0.035, M.chrome);
  }

  // rear lounge / engine box, transom door side
  {
    const u = 0.07, { hb, sheer } = prof(u), w = (hb - W_IN) * 2 * 0.94;
    add(new RoundedBoxGeometry(0.6, 0.45, w, 3, 0.07), M.deck, xAt(u), sheer - SOLE + 0.22, 0);
    add(new RoundedBoxGeometry(0.55, 0.12, w - 0.04, 3, 0.05), M.cushion, xAt(u) + 0.02, sheer - SOLE + 0.5, 0);
  }

  // bow rail along the foredeck
  {
    const H = 0.36, inset = 0.07;
    const star = range(0.66, 0.985, 14).map(u => { const { hb, sheer } = prof(u); return new THREE.Vector3(xAt(u), sheer + H, Math.max(0, hb - inset)); });
    const pts = [...star, ...star.slice(0, -1).reverse().map(v => new THREE.Vector3(v.x, v.y, -v.z))];
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.02, 8), M.chrome));
    for (const u of [0.68, 0.78, 0.87, 0.94]) {
      const { hb, sheer } = prof(u);
      for (const side of [1, -1]) {
        add(new THREE.CylinderGeometry(0.015, 0.015, H, 8), M.chrome, xAt(u), sheer + H / 2, side * Math.max(0, hb - inset));
      }
    }
  }

  // sterndrive: swim platform on the transom, leg under the water
  add(new RoundedBoxGeometry(0.6, 0.07, 2.1, 2, 0.03), M.dark, X0 - 0.3, 0.36, 0);
  add(new RoundedBoxGeometry(0.34, 0.6, 0.22, 2, 0.06), M.dark, X0 - 0.2, 0.02, 0);
  for (const side of [1, -1]) {
    bar(X0 - 0.55, 0.39, X0 - 0.55, 0.78, side * 0.95, 0.025, 0.025, M.chrome);
    bar(X0 - 0.55, 0.78, X0 - 0.05, sh(0) + 0.1, side * 0.95, 0.025, 0.025, M.chrome);
  }

  // FRASER decal near the stern, both sides
  const decal = nameDecal();
  for (const side of [1, -1]) {
    const u = 0.12, y = sh(u) - 0.42;
    const m = add(new THREE.PlaneGeometry(0.9, 0.18), decal, xAt(u), y, side * (zAt(u, y) + 0.012));
    if (side < 0) m.rotation.y = Math.PI;
  }

  return g;
}

function nameDecal() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 102;
  const x = c.getContext('2d');
  x.fillStyle = '#14243a';
  x.font = 'italic 700 74px Georgia, "Times New Roman", serif';
  x.textBaseline = 'middle';
  x.fillText('FRASER', 8, 54);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.3, polygonOffset: true, polygonOffsetFactor: -2 });
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

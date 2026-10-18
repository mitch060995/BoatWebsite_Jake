/* =========================================================
   Hero: a drone shot. The boat idles side-on in the swell; as
   you scroll the camera circles it in a rising helix, then the
   boat powers off into the sun and the Fraser logo appears.
   ========================================================= */
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
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

/* ---------------- ocean swell ----------------
   One set of Gerstner waves drives the ocean mesh (vertex shader)
   AND the boat's heave/pitch/roll (JS), so the hull rides the
   same surface you see. [wavelength m, amplitude m, heading °, steepness, phase] */
const WAVES = [
  [56, 0.27, 18, 0.6, 0.0],
  [33, 0.15, 47, 0.7, 1.7],
  [17, 0.07, -8, 0.8, 4.1],
  [9.5, 0.035, 74, 0.9, 2.3],
  [5.8, 0.016, 30, 1.0, 5.2],
].map(([L, A, deg, Q, ph]) => {
  const k = (Math.PI * 2) / L, r = THREE.MathUtils.degToRad(deg);
  return { dx: Math.cos(r), dz: Math.sin(r), k, A, w: Math.sqrt(9.81 * k), Q, ph };
});
const WAVE_FADE = [260, 1400];       // swell flattens with distance from the camera (the mesh gets coarse)

// Height of the displaced surface above world (x, z), matching the vertex shader
function swellHeight(x, z, t, fade = 1) {
  let px = x, pz = z;
  for (let it = 0; it < 2; it++) {   // undo the horizontal Gerstner shift so we sample the right crest
    let ox = 0, oz = 0;
    for (const v of WAVES) {
      const c = Math.cos(v.k * (v.dx * px + v.dz * pz) - v.w * t + v.ph) * v.Q * v.A * fade;
      ox += v.dx * c; oz += v.dz * c;
    }
    px = x - ox; pz = z - oz;
  }
  let h = 0;
  for (const v of WAVES) h += Math.sin(v.k * (v.dx * px + v.dz * pz) - v.w * t + v.ph) * v.A * fade;
  return h;
}

/* ---------------- renderer, scene, camera ---------------- */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  renderer = null;
}

// The page stays on the hero until the drone shot has played (see setupPlayback)
const root = document.documentElement;
const lockable = !reduced && !location.hash && window.scrollY < window.innerHeight * 0.5;
if (!renderer || !lockable) root.classList.remove('hero-lock');   // the lock itself is set by a tiny script in <head>
const unlockHero = () => root.classList.remove('hero-lock');

if (renderer) {
  const start = () => setTimeout(init, 60);   // just after the first paint
  if (document.readyState === 'complete') start(); else window.addEventListener('load', start, { once: true });
}

function init() {
  const mobile = Math.min(window.innerWidth, window.innerHeight) < 700;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.62;
  // Soft shadows, but only the boat casts/receives them and the light frustum is boat-sized
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.3, 20000);

  // Low golden sun ahead and to the right of the opening camera, so the first shot is backlit,
  // and roughly where the boat heads at the end so it runs up the glitter path into the sun
  const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 5), THREE.MathUtils.degToRad(112));

  const sky = new Sky();
  sky.scale.setScalar(10000);
  const su = sky.material.uniforms;
  su.turbidity.value = 7;
  su.rayleigh.value = 2.2;
  su.mieCoefficient.value = 0.0045;
  su.mieDirectionalG.value = 0.86;
  su.sunPosition.value.copy(sun);

  // The sky is static, so bake it once: a small cube map the ocean samples for
  // its reflections and horizon haze, and a PMREM for the boat's lighting.
  const envScene = new THREE.Scene();
  envScene.add(sky);
  const skyRT = new THREE.WebGLCubeRenderTarget(mobile ? 64 : 128, {
    type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter,
  });
  new THREE.CubeCamera(0.1, 100, skyRT).update(renderer, envScene);
  // For the PMREM, put a dark sea under the sky so hull sides pick up blue-grey from below, not more sky
  const seaDisc = new THREE.Mesh(new THREE.CircleGeometry(95, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.03, 0.065, 0.085, THREE.LinearSRGBColorSpace) }));
  seaDisc.position.y = -1;
  envScene.add(seaDisc);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  pmrem.dispose();
  envScene.remove(seaDisc);
  seaDisc.geometry.dispose(); seaDisc.material.dispose();
  scene.add(sky);

  const sunLight = new THREE.DirectionalLight(0xffd2a6, 6);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.setScalar(mobile ? 512 : 1024);
  Object.assign(sunLight.shadow.camera, { left: -7.5, right: 7.5, top: 7.5, bottom: -7.5, near: 1, far: 70 });
  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.normalBias = 0.025;
  sunLight.shadow.radius = 3;
  scene.add(sunLight, sunLight.target);
  scene.add(new THREE.HemisphereLight(0xbfd6e6, 0x0a2a3a, 0.25));

  const boat = buildBoat();
  scene.add(boat);

  const ocean = makeOcean({ mobile, sun, skyTex: skyRT.texture, hull: boat.userData.waterline });
  scene.add(ocean.mesh);
  const trail = makeTrail(ocean.uniforms);

  const spray = makeSpray(mobile ? 110 : 220);
  scene.add(spray.points);

  // Only the boat shows up in the planar reflection; the sky comes from the baked cube
  ocean.reflectOnly(renderer, () => { sky.visible = false; spray.points.visible = false; },
    () => { sky.visible = true; spray.points.visible = true; });

  /* ---------------- layout ---------------- */
  let W = 0, H = 0;
  function resize() {
    const r = stage.getBoundingClientRect();
    W = r.width; H = r.height;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.fov = camera.aspect < 1 ? 52 : 38;
    camera.updateProjectionMatrix();
    spray.setScale(H * renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))));
  }
  resize();
  window.addEventListener('resize', resize);

  // One scroll, swipe or arrow key starts the film; it then plays through to the logo by itself.
  // The page is held still while it plays so the drone shot stays in view, then scrolls normally.
  const PLAY_SECONDS = 6.5;
  const play = { start: null, done: false };
  function progress() {
    if (play.done) return 1;
    if (play.start === null) return 0;
    const t = (performance.now() - play.start) / 1000 / PLAY_SECONDS;
    if (t >= 1) { play.done = true; unlockHero(); }
    return Math.min(1, t);
  }
  const playing = () => play.start !== null && !play.done;
  function startPlay() {
    if (play.start === null && !play.done) play.start = performance.now();
  }
  function setupPlayback() {
    if (!lockable) { play.done = true; unlockHero(); return; }
    const SCROLL_KEYS = ['ArrowDown', 'PageDown', ' ', 'Spacebar', 'End'];
    const locked = () => !play.done;

    // Any scroll gesture on the hero starts the film; nothing scrolls the page until it has finished
    window.addEventListener('wheel', e => {
      if (!locked()) return;
      e.preventDefault();
      if (e.deltaY > 0) startPlay();
    }, { passive: false });
    let touchY = null;
    window.addEventListener('touchstart', e => { touchY = e.touches[0].clientY; }, { passive: true });
    window.addEventListener('touchmove', e => {
      if (!locked()) return;
      if (e.cancelable) e.preventDefault();
      if (touchY !== null && touchY - e.touches[0].clientY > 4) startPlay();
    }, { passive: false });
    window.addEventListener('keydown', e => {
      if (!locked() || !SCROLL_KEYS.includes(e.key)) return;
      if (e.target.closest?.('input, textarea, select')) return;
      e.preventDefault();
      startPlay();
    });
    // If the page moves anyway (scrollbar, momentum), put it back and start playing
    window.addEventListener('scroll', () => {
      if (locked() && window.scrollY > 0) { window.scrollTo(0, 0); startPlay(); }
    }, { passive: true });
    // Menu and footer links still work: they skip the film
    document.addEventListener('click', e => {
      const a = e.target.closest?.('a[href^="#"]');
      if (a && a.getAttribute('href') !== '#top' && locked()) { play.done = true; unlockHero(); }
    }, true);
    // Someone already tried to scroll while the 3D was loading: start straight away
    if (window.__heroIntent) startPlay();
  }

  /* ---------------- camera path ---------------- */
  const target = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const fwd = new THREE.Vector3();

  function orbitPos(s, out) {
    // Portrait screens sit further back so the whole hull fits side-on
    const fit = Math.max(1, 0.95 / camera.aspect);
    const phi = s * Math.PI * 1.5;                     // 270°: starboard -> bow -> port -> stern
    const R = lerp(14.5, 30, easeInOut(s)) * fit;      // drone pulls out as it circles
    const h = lerp(2.0, 10, easeInOut(s));
    return out.set(Math.sin(phi) * R, h, Math.cos(phi) * R);
  }

  const LABELS = ['Starboard profile', 'Bow', 'Port side', 'Astern'];
  let lastLabel = '';

  /* ---------------- frame ---------------- */
  let ps = progress(), time = 0, intro = 0;
  const end = new THREE.Vector3();
  const finalCam = new THREE.Vector3(-19, 3.8, 3.5);   // low, just off the stern quarter
  // The hull's response to the swell, low-passed so it feels like 5 tonnes of boat
  const ride = { y: 0, pitch: 0, roll: 0, primed: false };
  let lastRun = 0, speed = 0, shadowPrimed = false;

  function update(dt, p) {
    time += dt;
    // ease toward the playback position so starts and stops are soft
    ps += (p - ps) * (1 - Math.exp(-dt * 4));
    intro = Math.min(1, intro + dt / 2.2);          // camera settles in on load

    const s = smooth(0, T.orbitEnd, ps);
    const d = smooth(T.driveStart, T.driveEnd, ps);

    // Camera first, so the swell fades with the same distance the shader uses
    orbitPos(s, camPos);
    camPos.multiplyScalar(lerp(1.18, 1, easeInOut(intro)));
    const settle = smooth(0, 0.7, d);
    orbitPos(1, end);
    if (d > 0) camPos.lerpVectors(end, finalCam, easeInOut(settle));
    camera.position.copy(camPos);

    // Boat: rides the swell, then gets on the plane and runs away
    const run = Math.pow(d, 2.3) * 420;
    const planing = smooth(0, 0.12, d) * (1 - 0.6 * smooth(0.25, 1, d));
    if (dt > 0) speed += ((run - lastRun) / dt - speed) * (1 - Math.exp(-dt * 4));
    lastRun = run;
    const wt = time;
    const fade = 1 - smooth(WAVE_FADE[0], WAVE_FADE[1], Math.hypot(run - camPos.x, camPos.z));
    const hBow = swellHeight(run + 3.4, 0, wt, fade), hStern = swellHeight(run - 3.9, 0, wt, fade);
    const hStbd = swellHeight(run - 0.3, 1.4, wt, fade), hPort = swellHeight(run - 0.3, -1.4, wt, fade);
    const follow1 = 1 - 0.5 * planing;
    const tgtY = (hBow + hStern + hStbd + hPort) * 0.25;
    const tgtPitch = Math.atan2(hBow - hStern, 7.3) * 0.85 * follow1;
    const tgtRoll = -Math.atan2(hStbd - hPort, 2.8) * 0.7 * follow1;
    const k = ride.primed ? 1 - Math.exp(-dt * 3.5) : 1;
    ride.y += (tgtY - ride.y) * k; ride.pitch += (tgtPitch - ride.pitch) * k; ride.roll += (tgtRoll - ride.roll) * k;
    ride.primed = true;

    boat.position.set(run, -0.1 + ride.y + planing * 0.12, 0);
    boat.rotation.set(
      ride.roll + Math.sin(time * 0.7) * 0.01 * (1 - planing),        // roll
      0,
      ride.pitch + planing * 0.075,                                    // pitch (bow up when getting on plane)
    );
    boat.updateMatrixWorld();

    // Keep the shadow frustum wrapped tightly around the boat
    sunLight.target.position.copy(boat.position);
    sunLight.position.copy(sun).multiplyScalar(30).add(boat.position);
    renderer.shadowMap.autoUpdate = d < 0.5 || !shadowPrimed;   // the boat is tiny after that; skip the pass
    shadowPrimed = true;

    trail.update(time, BOAT.stern, run + BOAT.stern, d);
    ocean.update(time, camera, boat.position, d, Math.min(1, Math.abs(speed) / 18));
    spray.update(dt, boat, clamp(Math.abs(speed) / 14, 0, 1) * smooth(0.02, 0.1, d), speed, time);

    target.set(0, 1.6, 0);
    const follow = smooth(0, 0.4, d);
    target.x = lerp(0, boat.position.x * 0.92, follow);
    target.y = lerp(1.6, 2.0, follow);
    camera.lookAt(target);

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

  const go = () => {
    setupPlayback();
    stage.classList.remove('no-3d');
    stage.classList.add('live');
    update(0, progress());
    stage.classList.add('ready');
    requestAnimationFrame(t => { last = t; requestAnimationFrame(frame); });
  };
  if (renderer.compileAsync) renderer.compileAsync(scene, camera).then(go, go);
  else go();
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
  const N = waves.length, TAU = Math.PI * 2;
  const cx = new Float32Array(N * size), sx = new Float32Array(N * size);
  const cy = new Float32Array(N * size), sy = new Float32Array(N * size);
  waves.forEach((w, i) => {
    for (let t = 0; t < size; t++) {
      const ax = (TAU * w.kx * t) / size + w.ph, ay = (TAU * w.ky * t) / size;
      cx[i * size + t] = Math.cos(ax); sx[i * size + t] = Math.sin(ax);
      cy[i * size + t] = Math.cos(ay); sy[i * size + t] = Math.sin(ay);
    }
  });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let dx = 0, dy = 0;
      for (let i = 0; i < N; i++) {
        const w = waves[i], a = i * size + x, b = i * size + y;
        const c = (cx[a] * cy[b] - sx[a] * sy[b]) * w.a;
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
   The boat: a Bertram Caribbean 31 sports flybridge — the
   classic Australian-built 9.4 m (31 ft) cruiser. White deep-V
   hull with a fine raked bow and a strong sheer, navy sheer
   stripe and pinstripe, long foredeck inside a low bow rail,
   sedan saloon with a wrap-around band of dark tinted glass,
   flybridge on the cabin roof with its own console, guard
   rails and a white bimini with clears on a stainless frame,
   open cockpit, ladder up to the fly, boarding platform.
   Twin inboard shafts, so nothing hangs off the transom.
   Bow points +x, starboard is +z, waterline ≈ y 0.1.
   ========================================================= */
const BOAT = { len: 9.2, x0: -4.6, beam: 3.4, stern: -5.0, top: 4.25 };   // hull length, transom x, beam, platform end, bimini top

function buildBoat() {
  const LEN = BOAT.len, X0 = BOAT.x0, HB = BOAT.beam / 2, W_IN = 0.16, SOLE_Y = 0.58;
  const g = new THREE.Group();

  const M = {
    hull: new THREE.MeshPhysicalMaterial({ color: 0xf6f6f2, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06, side: THREE.DoubleSide }),
    navy: new THREE.MeshPhysicalMaterial({ color: 0x101c30, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1, side: THREE.DoubleSide }),
    deck: new THREE.MeshStandardMaterial({ color: 0xe4e4df, roughness: 0.6, side: THREE.DoubleSide }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe8ecef, metalness: 1, roughness: 0.12 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x0a1016, roughness: 0.05, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.03, side: THREE.DoubleSide }),
    clear: new THREE.MeshPhysicalMaterial({ color: 0xe8f0f2, roughness: 0.08, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }),
    canvas: new THREE.MeshStandardMaterial({ color: 0xf1efe8, roughness: 0.85, side: THREE.DoubleSide }),
    sole: new THREE.MeshStandardMaterial({ color: 0xcfcdc4, roughness: 0.9, side: THREE.DoubleSide }),
    cushion: new THREE.MeshStandardMaterial({ color: 0xe9e3d6, roughness: 0.9 }),
    teak: new THREE.MeshStandardMaterial({ color: 0xa8814f, roughness: 0.8 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x23292f, roughness: 0.5, metalness: 0.3 }),
  };

  // Plan and sheer: full beam carried well forward, fine flared entry, sheer sweeping up to the bow
  const prof = u => {
    const hb = u < 0.45
      ? HB * (0.94 + 0.06 * Math.sin((u / 0.45) * Math.PI / 2))
      : HB * Math.pow(Math.max(0, 1 - Math.pow((u - 0.45) / 0.55, 2)), 0.62);
    const sheer = 1.25 + 0.55 * Math.pow(u, 2.3);
    const keel = -0.45 + (u > 0.5 ? 1.65 * Math.pow((u - 0.5) / 0.5, 2.2) : 0);   // forefoot sweeps up into a raked stem
    return { hb, sheer, keel };
  };
  // Deep-V section with a spray rail and flared topsides, keel -> gunwale, as [z, y]
  const section = u => {
    const { hb, sheer, keel } = prof(u);
    const dead = hb * 0.86 * 0.42;                 // ~23° deadrise
    const chine = Math.min(keel + dead, sheer - 0.12);
    return [
      [0, keel],
      [hb * 0.45, keel + dead * 0.48],
      [hb * 0.86, chine],
      [hb * 0.92, chine - 0.012],                  // chine flat
      [hb * 0.94, chine + 0.07],
      [hb * 0.985, lerp(chine, sheer, 0.55)],
      [hb, sheer],
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
  const sh = u => prof(u).sheer;
  const hbAt = u => prof(u).hb;

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
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const UP = V(0, 1, 0);
  // A round bar between two points (rails, stanchions, frame tubes)
  const rod = (a, b, r, mat, seg = 6) => {
    const d = new THREE.Vector3().subVectors(b, a);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), seg, 1), mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(UP, d.normalize());
    g.add(m);
    return m;
  };
  const rail = (pts, r, mat) => pts.slice(1).forEach((p, i) => rod(pts[i], p, r, mat));
  const tube = (pts, r, mat, seg = 64) =>
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.2), seg, r, 6), mat));
  // A flat bar between two points in the side (x/y) plane, at a given z
  const bar = (x1, y1, x2, y2, z, width, depth, mat) => {
    const L = Math.hypot(x2 - x1, y2 - y1);
    return add(new THREE.BoxGeometry(L, width, depth), mat, (x1 + x2) / 2, (y1 + y2) / 2, z, 0, 0, Math.atan2(y2 - y1, x2 - x1));
  };
  // A flat polygon in the cross-section (z/y) plane, placed at x
  const bulkhead = (pts, mat, x) => {
    const geo = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(-z, y))));
    geo.rotateY(Math.PI / 2);
    return add(geo, mat, x, 0, 0);
  };

  // ---- Hull skin + transom
  loft(range(0, 1, 80), u => {
    const s = section(u), x = xAt(u), r = [];
    for (let i = s.length - 1; i >= 1; i--) r.push([x, s[i][1], -s[i][0]]);
    for (const q of s) r.push([x, q[1], q[0]]);
    return r;
  }, M.hull);
  {
    const s = section(0);
    bulkhead([...s.slice(1).reverse().map(([z, y]) => [-z, y]), ...s], M.hull, X0);
  }

  // ---- Livery: navy sheer stripe under the gunwale, pinstripe below it, navy boot stripe
  const bandAt = (yLo, yHi, mat, u0 = 0, u1 = 0.97, n = 64) => {
    for (const side of [1, -1]) {
      loft(range(u0, u1, n), u => {
        const x = xAt(u);
        return [yLo(u), yHi(u)].map(y => [x, y, side * (zAt(u, y) + 0.008)]);
      }, mat);
    }
  };
  bandAt(u => sh(u) - 0.2, u => sh(u) - 0.045, M.navy, 0, 0.99);
  bandAt(u => sh(u) - 0.29, u => sh(u) - 0.265, M.navy, 0, 0.975);
  bandAt(() => 0.2, () => 0.26, M.navy, 0, 0.8, 40);
  // the sheer stripe carries across the transom
  add(new THREE.BoxGeometry(0.01, 0.155, hbAt(0) * 2 - 0.02), M.navy, X0 - 0.006, sh(0) - 0.122, 0);
  // stainless-capped rub rail
  for (const side of [1, -1]) {
    tube(range(0, 0.995, 40).map(u => V(xAt(u), sh(u) - 0.02, side * (hbAt(u) + 0.012))), 0.022, M.chrome, 120);
  }
  // fuel / vent ports in the topsides forward of the cabin
  for (const side of [1, -1]) {
    for (const u of [0.53, 0.56, 0.59]) {
      const y = sh(u) - 0.5;
      add(new THREE.BoxGeometry(0.22, 0.05, 0.01), M.glass, xAt(u), y, side * (zAt(u, y) + 0.012));
    }
  }

  // ---- Decks: gunwale caps, cockpit, side decks, foredeck
  const U_CAB = 0.31, U_RF = 0.6, U_WS = 0.66;   // saloon aft bulkhead, roof front edge, windscreen base
  const ROOF = 2.45;                              // saloon roof / flybridge deck
  const cw = u => Math.max(0.02, hbAt(u) - 0.3);  // half-width of the saloon (narrow side decks)
  const wsBase = sh(U_WS) + 0.3;
  const top = u => u <= U_RF ? ROOF : lerp(ROOF, wsBase, (u - U_RF) / (U_WS - U_RF));

  for (const side of [1, -1]) {
    loft(range(0, 1, 60), u => {
      const { hb, sheer } = prof(u), x = xAt(u);
      return [[x, sheer, side * hb], [x, sheer + 0.004, side * Math.max(0, hb - W_IN)]];
    }, M.deck);
    loft(range(U_CAB, U_WS, 14), u => {
      const x = xAt(u), y = sh(u) + 0.003;
      return [[x, y, side * (hbAt(u) - W_IN)], [x, y, side * cw(u)]];
    }, M.deck);
  }
  // cockpit: sides and sole
  const CK = range(0, U_CAB, 16);
  for (const side of [1, -1]) {
    loft(CK, u => {
      const x = xAt(u), z = side * (hbAt(u) - W_IN);
      return [[x, sh(u), z], [x, SOLE_Y, z]];
    }, M.deck);
  }
  loft(CK, u => {
    const x = xAt(u), z = hbAt(u) - W_IN;
    return [[x, SOLE_Y, z], [x, SOLE_Y, -z]];
  }, M.sole);

  // foredeck: a cambered trunk rising to the windscreen, fairing into the sheer toward the bow
  const fTop = u => sh(u) + 0.08 + (wsBase - sh(U_WS) - 0.08) * (1 - smooth(U_WS, 0.86, u));
  loft(range(U_WS, 1, 36), u => {
    const hb = hbAt(u), x = xAt(u), wi = Math.max(0, hb - W_IN), t = fTop(u), s = sh(u) + 0.004, w = Math.min(wi, cw(u));
    return [[x, s, wi], [x, t - 0.05, w], [x, t, w * 0.55], [x, t + 0.03, 0], [x, t, -w * 0.55], [x, t - 0.05, -w], [x, s, -wi]];
  }, M.deck);

  // ---- Saloon: sides and roof in one section, the front raking down into the windscreen
  loft(range(U_CAB, U_WS, 30), u => {
    const x = xAt(u), c = cw(u), t = top(u), s = sh(u) + 0.004;
    return [[x, s, c], [x, t - 0.1, c - 0.02], [x, t, c - 0.1], [x, t + 0.03, 0], [x, t, -(c - 0.1)], [x, t - 0.1, -(c - 0.02)], [x, s, -c]];
  }, M.hull);
  // raked windscreen with a centre mullion and side posts
  loft(range(U_RF + 0.003, U_WS - 0.003, 4), u => {
    const x = xAt(u), c = cw(u) - 0.12, t = top(u);
    return [[x, t + 0.01, c], [x, t + 0.04, 0], [x, t + 0.01, -c]];
  }, M.glass);
  for (const z of [0, 0.62, -0.62]) bar(xAt(U_RF), ROOF + 0.03, xAt(U_WS), wsBase + 0.03, z, 0.05, 0.05, M.hull);
  // the wrap-around band of tinted side glass, rising aft and following the windscreen rake forward
  const winLo = 1.8, winHi = 2.3;
  const wallZ = (u, y) => lerp(cw(u), cw(u) - 0.02, (y - sh(u)) / (top(u) - 0.1 - sh(u)));
  for (const side of [1, -1]) {
    loft(range(U_CAB + 0.02, U_WS - 0.004, 30), u => {
      const x = xAt(u);
      const hi = Math.max(winLo, Math.min(winHi, top(u) - 0.13, lerp(winLo, winHi, smooth(U_CAB + 0.02, U_CAB + 0.045, u))));
      return [winLo, hi].map(y => [x, y, side * (wallZ(u, y) + 0.012)]);
    }, M.glass);
    for (const u of [0.43, 0.52]) bar(xAt(u), winLo, xAt(u), winHi, side * (wallZ(u, 2.05) + 0.016), 0.025, 0.012, M.dark);
  }
  // aft bulkhead with the saloon door and window, facing the cockpit
  {
    const wi = hbAt(U_CAB) - W_IN, c = cw(U_CAB), s = sh(U_CAB);
    const half = [[wi, SOLE_Y], [wi, s], [c, s], [c - 0.02, ROOF - 0.1], [c - 0.1, ROOF], [0, ROOF + 0.03]];
    bulkhead([...half, ...half.slice(0, -1).reverse().map(([z, y]) => [-z, y])], M.hull, xAt(U_CAB));
    const xb = xAt(U_CAB) - 0.015;
    add(new THREE.BoxGeometry(0.02, 1.72, 0.78), M.glass, xb, SOLE_Y + 0.9, -0.38);
    add(new THREE.BoxGeometry(0.02, 0.5, 0.9), M.glass, xb, (winLo + winHi) / 2, 0.62);
  }

  // ---- Flybridge: deck overhanging the cockpit, helm console, seats, guard rails
  const U_FA = 0.255;                              // aft edge of the fly overhang
  const fx0 = xAt(U_FA), fx1 = xAt(U_RF);
  const fw = cw(0.45) + 0.03;
  add(new RoundedBoxGeometry(fx1 - fx0, 0.1, fw * 2, 2, 0.04), M.hull, (fx0 + fx1) / 2, ROOF + 0.01, 0);
  const FD = ROOF + 0.06;                          // fly deck level
  // helm console: a moulded pod with a raked face, dark dash and a low acrylic screen
  {
    const hw = cw(0.53) - 0.12;
    const shape = new THREE.Shape([
      new THREE.Vector2(xAt(U_RF) - 0.04, FD - 0.01), new THREE.Vector2(xAt(0.535), FD + 0.6),
      new THREE.Vector2(xAt(0.495), FD + 0.64), new THREE.Vector2(xAt(0.47), FD + 0.64), new THREE.Vector2(xAt(0.47), FD - 0.01),
    ]);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: hw * 2, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 });
    geo.translate(0, 0, -hw);
    add(geo, M.hull, 0, 0, 0);
    add(new RoundedBoxGeometry(0.32, 0.04, hw * 2 - 0.1, 2, 0.015), M.dark, xAt(0.49), FD + 0.66, 0, 0, 0, -0.25);
    bar(xAt(0.535), FD + 0.62, xAt(0.515), FD + 0.84, 0, 0.012, hw * 2 - 0.2, M.glass);
    const wheel = add(new THREE.TorusGeometry(0.17, 0.016, 6, 24), M.chrome, xAt(0.47) - 0.08, FD + 0.72, 0.45, 0, Math.PI / 2, 0);
    wheel.rotation.set(0, Math.PI / 2, 0.45, 'YZX');
  }
  // helm chairs and an aft bench
  for (const z of [0.45, -0.45]) {
    rod(V(xAt(0.42), FD, z), V(xAt(0.42), FD + 0.45, z), 0.04, M.chrome);
    add(new RoundedBoxGeometry(0.48, 0.12, 0.5, 2, 0.05), M.cushion, xAt(0.42), FD + 0.5, z);
    add(new RoundedBoxGeometry(0.1, 0.5, 0.48, 2, 0.04), M.cushion, xAt(0.42) - 0.24, FD + 0.78, z, 0, 0, 0.12);
  }
  {
    const x = xAt(0.285);
    add(new RoundedBoxGeometry(0.5, 0.4, 1.7, 2, 0.05), M.hull, x, FD + 0.2, -0.35);
    add(new RoundedBoxGeometry(0.48, 0.1, 1.66, 2, 0.04), M.cushion, x + 0.01, FD + 0.45, -0.35);
    add(new RoundedBoxGeometry(0.1, 0.42, 1.66, 2, 0.04), M.cushion, x - 0.2, FD + 0.7, -0.35, 0, 0, 0.1);
  }
  // guard rails: low moulded coamings with stainless rails above, open at the ladder (aft starboard)
  const zr = fw - 0.08, RH = FD + 0.82, xa = fx0 + 0.08, xf = xAt(0.49);
  for (const side of [1, -1]) {
    add(new RoundedBoxGeometry(xf - xa + 0.1, 0.44, 0.06, 2, 0.025), M.hull, (xa + xf) / 2 + 0.05, FD + 0.22, side * zr);
    rail([V(xf, RH - 0.1, side * zr), V(xf - 0.25, RH, side * zr), V(xa, RH, side * zr)], 0.018, M.chrome);
    for (const x of [xf - 0.25, lerp(xa, xf, 0.45), xa]) rod(V(x, FD + 0.44, side * zr), V(x, RH, side * zr), 0.015, M.chrome);
  }
  rail([V(xa, RH, -zr), V(xa, RH, 0.55)], 0.018, M.chrome);
  rod(V(xa, FD, 0.55), V(xa, RH, 0.55), 0.015, M.chrome);
  rod(V(xa, FD, -0.1), V(xa, RH, -0.1), 0.015, M.chrome);
  // ladder from the cockpit up to the fly
  {
    const xb = xAt(U_CAB) - 0.55, xt = xa, zc = (0.55 + zr) / 2;
    for (const dz of [-0.22, 0.22]) rod(V(xb, SOLE_Y, zc + dz), V(xt, RH, zc + dz), 0.018, M.chrome);
    for (let i = 1; i <= 6; i++) {
      const k = i / 7;
      rod(V(lerp(xb, xt, k), lerp(SOLE_Y, RH, k), zc - 0.22), V(lerp(xb, xt, k), lerp(SOLE_Y, RH, k), zc + 0.22), 0.016, M.chrome);
    }
  }

  // ---- Bimini: white canvas top on a stainless frame, clears zipped in at the front and sides
  const BT = BOAT.top, zb = fw - 0.05, ub0 = 0.27, ub1 = 0.575;
  loft(range(ub0, ub1, 10), u => {
    const x = xAt(u), sag = Math.sin(((u - ub0) / (ub1 - ub0)) * Math.PI * 3) * 0.008;
    return [[x, BT - 0.1, zb + 0.03], [x, BT - 0.02 + sag, zb * 0.6], [x, BT + 0.03 + sag, 0], [x, BT - 0.02 + sag, -zb * 0.6], [x, BT - 0.1, -(zb + 0.03)]];
  }, M.canvas);
  for (const side of [1, -1]) {
    rod(V(xAt(0.285), FD + 0.26, side * zr), V(xAt(0.285), BT - 0.08, side * zb), 0.022, M.chrome);   // aft bow
    rod(V(xAt(0.5), FD + 0.5, side * zr), V(xAt(0.56), BT - 0.08, side * zb), 0.022, M.chrome);        // front bow
    rod(V(xAt(0.42), FD + 0.26, side * zr), V(xAt(0.42), BT - 0.08, side * zb), 0.018, M.chrome);
    // clears down the side, with canvas zip strips
    loft(range(0, 1, 2), k => [
      [lerp(xAt(0.29), xAt(ub1) - 0.03, k), BT - 0.1, side * (zb + 0.01)],
      [lerp(xAt(0.29), xf, k), RH + 0.02, side * (zr + 0.01)],
    ], M.clear);
    bar(xAt(0.42), RH, xAt(0.42), BT - 0.1, side * (lerp(zr, zb, 0.5) + 0.02), 0.05, 0.015, M.canvas);
    bar(xAt(0.29), BT - 0.13, xAt(ub1), BT - 0.13, side * (zb + 0.035), 0.07, 0.015, M.canvas);       // valance
  }
  // front clear, from the bimini's leading edge down to the console screen
  loft([0, 1], k => {
    const x = lerp(xAt(ub1) - 0.02, xAt(0.517), k), y = lerp(BT - 0.1, FD + 0.83, k), w = lerp(zb, cw(0.53) - 0.15, k);
    return [[x, y, w], [x, y, -w]];
  }, M.clear);
  add(new THREE.BoxGeometry(0.06, 0.07, zb * 2 + 0.06), M.canvas, xAt(ub1), BT - 0.13, 0);
  // VHF whips on the aft corners of the bimini frame
  for (const side of [1, -1]) rod(V(xAt(0.285), BT - 0.1, side * (zb + 0.05)), V(xAt(0.285) - 0.45, BT + 1.6, side * (zb + 0.12)), 0.01, M.hull, 5);

  // ---- Bow rail running most of the length to a pulpit, with bowsprit and anchor
  {
    const H = 0.6, inset = 0.09, xt = xAt(1) + 0.55, yt = sh(1) + 0.52;
    add(new RoundedBoxGeometry(xt - xAt(0.96) + 0.1, 0.07, 0.42, 2, 0.03), M.teak, (xt + xAt(0.96)) / 2, sh(1) - 0.02, 0);
    add(new RoundedBoxGeometry(0.3, 0.12, 0.14, 2, 0.03), M.chrome, xt - 0.05, sh(1) - 0.09, 0);
    const star = range(0.36, 0.97, 18).map(u => V(xAt(u), sh(u) + H, Math.max(0.2, hbAt(u) - inset)));
    const pts = [...star, V(xt, yt, 0), ...star.slice().reverse().map(v => V(v.x, v.y, -v.z))];
    tube(pts, 0.02, M.chrome, 220);
    for (const u of [0.38, 0.47, 0.56, 0.65, 0.74, 0.83, 0.91]) {
      for (const side of [1, -1]) {
        const z = side * Math.max(0.2, hbAt(u) - inset);
        rod(V(xAt(u), sh(u), z), V(xAt(u), sh(u) + H, z), 0.015, M.chrome);
      }
    }
    for (const side of [1, -1]) rod(V(xt - 0.08, sh(1) + 0.01, side * 0.17), V(xt, yt, side * 0.03), 0.016, M.chrome);
  }

  // ---- Cockpit details: transom seat, rod holders in the gunwales
  {
    const w = (hbAt(0.02) - W_IN) * 2 - 0.1;
    add(new RoundedBoxGeometry(0.42, 0.42, w, 2, 0.05), M.hull, xAt(0) + 0.24, SOLE_Y + 0.21, 0);
    add(new RoundedBoxGeometry(0.4, 0.09, w - 0.04, 2, 0.04), M.cushion, xAt(0) + 0.25, SOLE_Y + 0.46, 0);
  }
  for (const side of [1, -1]) {
    for (const u of [0.04, 0.13, 0.22]) {
      const z = side * (hbAt(u) - W_IN / 2);
      add(new THREE.CylinderGeometry(0.025, 0.025, 0.06, 8), M.chrome, xAt(u), sh(u) + 0.03, z);
    }
  }

  // ---- Boarding platform across the transom (twin shafts: nothing else hangs off the back)
  add(new RoundedBoxGeometry(BOAT.x0 - BOAT.stern + 0.04, 0.08, hbAt(0) * 2 - 0.15, 2, 0.03), M.teak, (BOAT.x0 + BOAT.stern) / 2 - 0.02, 0.42, 0);
  for (const z of [-0.9, 0, 0.9]) add(new THREE.BoxGeometry(0.4, 0.14, 0.08), M.hull, X0 - 0.18, 0.34, z);

  // Waterline half-beam at 64 stations: the ocean shader uses it for contact shading and foam
  const widths = range(0, 1, 63).map(u => zAt(u, 0.1));
  let uMax = 1;
  for (let i = 63; i >= 0; i--) if (widths[i] > 0.01) { uMax = Math.min(1, (i + 1) / 63); break; }
  g.userData.waterline = { x0: X0, len: LEN, uMax, widths };

  mergeByMaterial(g);
  return g;
}


/* =========================================================
   Ocean: a camera-centred radial grid (dense under the camera,
   sparse to the horizon) displaced by the Gerstner swell above.
   Shading: deep-water body colour + light scattered through the
   crests, Fresnel sky reflection from the baked sky cube, the
   boat's planar reflection (Reflector, boat only), a GGX sun
   glitter path, hull contact occlusion + lapping foam, the wake,
   and haze that melts the far sea into the sky at the horizon.
   ========================================================= */
function makeOcean({ mobile, sun, skyTex, hull }) {
  const SEGS = mobile ? 112 : 176, RINGS = mobile ? 84 : 120, RADIUS = 8000, K = 9.5;
  const pos = [0, 0, 0], idx = [];
  for (let i = 1; i <= RINGS; i++) {
    const r = RADIUS * (Math.exp((K * i) / RINGS) - 1) / (Math.exp(K) - 1);
    for (let j = 0; j < SEGS; j++) { const a = (j / SEGS) * Math.PI * 2; pos.push(Math.cos(a) * r, Math.sin(a) * r, 0); }
  }
  for (let j = 0; j < SEGS; j++) idx.push(0, 1 + j, 1 + ((j + 1) % SEGS));
  for (let i = 1; i < RINGS; i++) {
    const a0 = 1 + (i - 1) * SEGS, a1 = 1 + i * SEGS;
    for (let j = 0; j < SEGS; j++) { const jn = (j + 1) % SEGS; idx.push(a0 + j, a1 + j, a1 + jn, a0 + j, a1 + jn, a0 + jn); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);

  // Waterline half-beam along the hull, so the shader knows where the hull meets the sea
  const lut = new Uint8Array(64 * 4);
  hull.widths.forEach((w, i) => { lut[i * 4] = clamp(Math.round((w / 2.0) * 255), 0, 255); lut[i * 4 + 3] = 255; });
  const hullTex = new THREE.DataTexture(lut, 64, 1, THREE.RGBAFormat);
  hullTex.magFilter = hullTex.minFilter = THREE.LinearFilter;
  hullTex.needsUpdate = true;

  const NW = WAVES.length;
  const shader = {
    name: 'OceanShader',
    uniforms: {
      color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
      tNormals: { value: null }, tSky: { value: null }, tHull: { value: null },
      uTime: { value: 0 },
      uWaveA: { value: WAVES.map(v => new THREE.Vector4(v.dx, v.dz, v.k, v.A)) },
      uWaveB: { value: WAVES.map(v => new THREE.Vector3(v.w, v.Q, v.ph)) },
      uFade: { value: new THREE.Vector2(...WAVE_FADE) },
      uSunDir: { value: sun.clone().normalize() },
      uSunColor: { value: new THREE.Color(1.0, 0.8, 0.58).multiplyScalar(3.2) },
      uDeep: { value: new THREE.Color().setRGB(0.004, 0.022, 0.034, THREE.LinearSRGBColorSpace) },
      uScatter: { value: new THREE.Color().setRGB(0.01, 0.07, 0.06, THREE.LinearSRGBColorSpace) },
      uChop: { value: 0.55 },
      uDistort: { value: 1.0 },
      uHaze: { value: 0.00042 },
      uBoat: { value: new THREE.Vector3() },          // x, z, speed 0..1
      uHull: { value: new THREE.Vector3(hull.x0, hull.len, hull.uMax) },
      uWake: { value: new THREE.Vector4(0, 0, 0, 1) }, // startX, sternX, opacity, length
    },
    vertexShader: /* glsl */`
      #define NW ${NW}
      uniform mat4 textureMatrix;
      uniform float uTime;
      uniform vec4 uWaveA[NW];
      uniform vec3 uWaveB[NW];
      uniform vec2 uFade;
      varying vec4 vMirror;
      varying vec3 vW;
      varying vec3 vN;
      varying float vH;
      void main() {
        vMirror = textureMatrix * vec4(position, 1.0);
        vec4 w = modelMatrix * vec4(position, 1.0);
        float fade = 1.0 - smoothstep(uFade.x, uFade.y, length(w.xz - cameraPosition.xz));
        vec3 p = w.xyz;
        vec3 n = vec3(0.0, 1.0, 0.0);
        for (int i = 0; i < NW; i++) {
          vec4 a = uWaveA[i]; vec3 b = uWaveB[i];
          float A = a.w * fade;
          float th = a.z * dot(a.xy, w.xz) - b.x * uTime + b.z;
          float s = sin(th), c = cos(th);
          p.xz += b.y * A * a.xy * c;
          p.y += A * s;
          n.xz -= a.xy * (a.z * A * c);
          n.y -= b.y * a.z * A * s;
        }
        vW = p; vN = n; vH = p.y;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse, tNormals, tHull;
      uniform samplerCube tSky;
      uniform float uTime, uChop, uDistort, uHaze;
      uniform vec3 uSunDir, uSunColor, uDeep, uScatter, uBoat, uHull;
      uniform vec4 uWake;
      varying vec4 vMirror;
      varying vec3 vW;
      varying vec3 vN;
      varying float vH;

      float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }

      void main() {
        vec3 toCam = cameraPosition - vW;
        float dist = length(toCam);
        vec3 V = toCam / dist;
        vec2 xz = vW.xz;
        float t = uTime;
        float far = smoothstep(30.0, 1600.0, dist);

        // Wind chop on top of the swell: three scrolling octaves of the procedural normal map
        vec2 n1 = texture2D(tNormals, xz * 0.041 + t * vec2(0.010, 0.006)).xy * 2.0 - 1.0;
        vec2 n2 = texture2D(tNormals, xz * 0.113 + t * vec2(-0.016, 0.012)).xy * 2.0 - 1.0;
        vec2 n3 = texture2D(tNormals, xz * 0.37 + t * vec2(0.025, -0.03)).xy * 2.0 - 1.0;
        // Gusts: big slow patches of rougher and glassier water, like cat's paws on the open sea
        // (a very low-frequency read of the normal map is far cheaper than procedural noise here)
        vec2 gq = texture2D(tNormals, xz * 0.0021 + t * vec2(0.0006, 0.0004)).xy;
        float gust = smoothstep(0.25, 0.75, gq.x * 0.6 + gq.y * 0.4);
        vec2 chop = (n1 * 0.55 + n2 * 0.45 + n3 * 0.32 * (1.0 - far)) * uChop * mix(1.0, 0.5, far) * mix(0.65, 1.35, gust);
        vec3 Ng = normalize(vN);
        vec3 N = normalize(vec3(Ng.x + chop.x, Ng.y, Ng.z + chop.y));

        // Where the hull meets the water (boat-local plan view)
        vec2 lp = xz - uBoat.xy;
        float u = (lp.x - uHull.x) / uHull.y;
        float hw = texture2D(tHull, vec2(clamp(u, 0.0, 1.0), 0.5)).r * 2.0;
        float sd = max(abs(lp.y) - hw, max(-u, u - uHull.z) * uHull.y);   // ~distance from the waterline
        float contact = exp(-max(sd, 0.0) * 2.4);

        // Reflections: sky from the cube (rougher with distance), boat from the mirror
        vec3 R = reflect(-V, N); R.y = abs(R.y);
        vec3 sky = textureCube(tSky, R, far * 3.0).rgb;
        sky *= 1.0 - 0.6 * contact;                     // the hull blocks the sky right beside it
        vec2 muv = vMirror.xy / vMirror.w + N.xz * (0.004 + 1.4 / (dist + 6.0)) * uDistort;
        vec4 mir = texture2D(tDiffuse, muv);
        vec3 refl = mix(sky, mir.rgb, clamp(mir.a, 0.0, 1.0));

        float NdV = max(dot(N, V), 0.0);
        float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);

        // Water body: very little comes back out of deep water, except light scattered through the crests
        vec3 L = uSunDir;
        vec3 amb = textureCube(tSky, vec3(0.0, 1.0, 0.0), 8.0).rgb;
        float crest = clamp(vH * 2.2 + 0.35, 0.0, 1.0);
        float toward = pow(max(dot(normalize(-V.xz), normalize(L.xz)), 0.0), 3.0);
        vec3 body = uDeep * amb * 2.2 + uScatter * crest * (amb * 0.6 + uSunColor * 0.12 * toward);
        vec3 col = mix(body, refl, F);

        // Sun glitter: GGX, roughening with distance so it forms a broad path toward the horizon
        vec3 Hh = normalize(L + V);
        float a = mix(0.07, 0.2, far); float a2 = a * a;
        float NdH = max(dot(N, Hh), 0.0);
        float dd = NdH * NdH * (a2 - 1.0) + 1.0;
        float D = a2 / (3.14159 * dd * dd);
        float Fs = 0.02 + 0.98 * pow(1.0 - max(dot(V, Hh), 0.0), 5.0);
        col += uSunColor * min(D * Fs * max(dot(N, L), 0.0) * 0.25 / max(NdV, 0.2), 40.0) * (1.0 - 0.8 * contact);

        // Foam: lapping at the waterline (more when moving), and the wake
        float foam = 0.0, churn = 0.0;
        if (sd < 2.5) {
          float fn = noise(xz * 3.1 + vec2(t * 0.35, -t * 0.2)) * 0.6 + noise(xz * 9.0 - t * 0.8) * 0.4;
          float lap = 0.55 + 0.45 * sin(t * 2.1 + lp.x * 1.6 + vH * 9.0);
          float ringW = 0.3 + 0.55 * uBoat.z + 0.6 * uBoat.z * smoothstep(0.3, 0.9, u);
          float ring = 1.0 - smoothstep(0.0, ringW, sd);
          float meniscus = 1.0 - smoothstep(0.0, 0.1 + 0.1 * uBoat.z, sd);   // water climbing the gelcoat
          foam += ring * smoothstep(0.3, 0.7, fn * (0.65 + 0.55 * lap)) * (0.8 + 0.2 * uBoat.z) + meniscus * (0.35 + 0.25 * lap);
          churn += ring * 0.6;
        }
        if (uWake.z > 0.001 && xz.x > uWake.x && xz.x < uWake.y + 0.5) {
          float along = (xz.x - uWake.x) / uWake.w;       // 0 = where it set off, 1 = transom
          float back = (1.0 - along) * uWake.w;          // metres behind the boat
          float across = abs(xz.y) / 11.0;
          float w = clamp(0.12 + back * 0.045, 0.12, 1.0);
          // streaky foam, stretched along the boat's track
          float n = noise(xz * vec2(0.45, 1.6) + vec2(t * 0.25, 0.0)) * 0.5 + noise(xz * vec2(1.4, 4.2) - t * 0.4) * 0.3 + noise(xz * 9.0) * 0.2;
          float bodyW = 1.0 - smoothstep(w * 0.25, w * 0.6, across);
          float arms = 1.0 - smoothstep(0.0, 0.035 + back * 0.0006, abs(across - w));
          float f = smoothstep(0.38, 0.72, n * (0.55 + bodyW * 0.75)) * bodyW + arms * smoothstep(0.35, 0.7, n) * 0.75;
          float fade = exp(-back * 0.012) * smoothstep(1.0, 0.985, along) * smoothstep(0.0, 10.0, xz.x - uWake.x) * uWake.z;
          foam += f * fade;
          churn += bodyW * fade * exp(-back * 0.02);
        }
        // Aerated water glows turquoise under and around the foam
        col += uScatter * amb * 1.4 * clamp(churn, 0.0, 1.0);
        vec3 foamCol = vec3(0.86, 0.9, 0.92) * (amb * 0.75 + uSunColor * 0.16 * (0.6 + 0.4 * toward));
        col = mix(col, foamCol, clamp(foam, 0.0, 1.0) * (1.0 - far));

        // Horizon haze: blend into the sky colour just above the horizon in this direction
        vec3 hz = textureCube(tSky, normalize(vec3(-V.x, 0.02, -V.z)), 1.0).rgb;
        col = mix(col, hz, 1.0 - exp(-dist * uHaze));

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  };

  const size = mobile ? 256 : 512;
  const mesh = new Reflector(geo, { shader, textureWidth: size, textureHeight: size, clipBias: 0.002, multisample: 0 });   // MSAA buys nothing once the chop distorts it
  mesh.rotation.x = -Math.PI / 2;
  mesh.frustumCulled = false;
  const U = mesh.material.uniforms;
  U.tNormals.value = makeWaterNormals(256);
  U.tSky.value = skyTex;
  U.tHull.value = hullTex;

  return {
    mesh,
    uniforms: U,
    // Hide everything but the boat while the mirror renders, and clear it transparent so the
    // shader can tell boat pixels (alpha 1) from empty ones (alpha 0, use the sky cube)
    reflectOnly(renderer, before, after) {
      const draw = mesh.onBeforeRender;
      const cc = new THREE.Color();
      mesh.onBeforeRender = (r, scene, cam, ...rest) => {
        before();
        renderer.getClearColor(cc); const ca = renderer.getClearAlpha();
        renderer.setClearColor(0x000000, 0);
        draw(r, scene, cam, ...rest);
        renderer.setClearColor(cc, ca);
        after();
      };
    },
    update(time, camera, boatPos, d, speed) {
      mesh.position.set(camera.position.x, 0, camera.position.z);
      U.uTime.value = time;
      U.uBoat.value.set(boatPos.x, boatPos.z, speed);
    },
  };
}

/* =========================================================
   Wake: a foam carpet that grows from where the boat set off
   to its transom, spreading wider behind with Kelvin arms.
   Drawn inside the ocean shader so it rides the swell.
   ========================================================= */
function makeTrail(U) {
  return {
    update(time, startX, sternX, d) {
      const len = sternX - startX;
      U.uWake.value.set(startX, sternX, len > 0.2 ? smooth(0, 0.05, d) : 0, Math.max(len, 0.01));
    },
  };
}

/* =========================================================
   Spray: prop wash boiling up behind the transom and sheets of
   spray peeling off the bow quarters once the boat is planing.
   A small CPU particle pool drawn as soft points.
   ========================================================= */
function makeSpray(n) {
  const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3);
  const life = new Float32Array(n), max = new Float32Array(n), aT = new Float32Array(n).fill(1), aS = new Float32Array(n);
  for (let i = 0; i < n; i++) { aS[i] = 0.6 + Math.random() * 0.8; life[i] = 1; max[i] = 1; }
  const geo = new THREE.BufferGeometry();
  const pA = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const tA = new THREE.BufferAttribute(aT, 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pA);
  geo.setAttribute('aT', tA);
  geo.setAttribute('aS', new THREE.BufferAttribute(aS, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uScale: { value: 400 }, uColor: { value: new THREE.Color(1.0, 0.95, 0.88).multiplyScalar(1.5) } },
    vertexShader: /* glsl */`
      uniform float uScale; attribute float aT, aS; varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aT >= 1.0 ? 0.0 : (0.12 + aT * 0.55) * aS * uScale / -mv.z;
        vA = aT >= 1.0 ? 0.0 : (1.0 - aT) * smoothstep(0.0, 0.08, aT);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; varying float vA;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = (1.0 - smoothstep(0.25, 1.0, r)) * vA * 0.45;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  const v = new THREE.Vector3();
  let next = 0, carry = 0, alive = 0;
  // emitters in boat space: [x, y, z, kind]   kind 0 = prop wash, 1 = bow-quarter sheet
  const EM = [[BOAT.stern, 0.05, 0.45, 0], [BOAT.stern, 0.05, -0.45, 0], [1.3, 0.12, 1.5, 1], [1.3, 0.12, -1.5, 1]];
  return {
    points,
    setScale(s) { mat.uniforms.uScale.value = s; },
    update(dt, boat, rate, spd) {
      if (dt <= 0 || (rate <= 0 && alive === 0)) { points.visible = alive > 0; return; }
      points.visible = true;
      carry += rate * n * 1.4 * dt;
      while (carry >= 1) {
        carry -= 1;
        const i = next; next = (next + 1) % n;
        const e = EM[(Math.random() * EM.length) | 0];
        v.set(e[0] + Math.random() * 0.3, e[1], e[2]).applyMatrix4(boat.matrixWorld);
        pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
        const side = Math.sign(e[2]), sp = Math.min(Math.abs(spd), 22);
        if (e[3] === 0) {
          vel[i * 3] = sp * (0.2 + Math.random() * 0.25);
          vel[i * 3 + 1] = 1.2 + Math.random() * 2.2;
          vel[i * 3 + 2] = side * (0.3 + Math.random() * 1.2);
        } else {
          vel[i * 3] = sp * (0.5 + Math.random() * 0.2);
          vel[i * 3 + 1] = 0.8 + Math.random() * 1.4;
          vel[i * 3 + 2] = side * (1.5 + Math.random() * 2.5);
        }
        life[i] = 0; max[i] = 0.6 + Math.random() * 0.7;
      }
      alive = 0;
      const drag = Math.exp(-dt * 1.8);
      for (let i = 0; i < n; i++) {
        if (life[i] >= max[i]) { aT[i] = 1; continue; }
        alive++;
        life[i] += dt;
        vel[i * 3] *= drag; vel[i * 3 + 2] *= drag; vel[i * 3 + 1] -= 9.8 * dt;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] = Math.max(0.02, pos[i * 3 + 1] + vel[i * 3 + 1] * dt); pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        aT[i] = Math.min(1, life[i] / max[i]);
      }
      pA.needsUpdate = true; tA.needsUpdate = true;
    },
  };
}

/* =========================================================
   Merge the boat's ~150 small meshes into one mesh per material
   (≈15 draw calls), which pays for drawing it again into the
   shadow map and the water's reflection.
   ========================================================= */
function mergeByMaterial(group) {
  group.updateMatrixWorld(true);
  const buckets = new Map();
  for (const m of [...group.children]) {
    if (!m.isMesh) continue;
    const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    geo.applyMatrix4(m.matrix);
    if (!buckets.has(m.material)) buckets.set(m.material, []);
    buckets.get(m.material).push(geo);
    m.geometry.dispose();
    group.remove(m);
  }
  for (const [mat, geos] of buckets) {
    const uv = !!mat.map;
    let count = 0;
    geos.forEach(g => { count += g.attributes.position.count; });
    const P = new Float32Array(count * 3), N = new Float32Array(count * 3), UV = uv ? new Float32Array(count * 2) : null;
    let o = 0;
    for (const g of geos) {
      P.set(g.attributes.position.array, o * 3);
      N.set(g.attributes.normal.array, o * 3);
      if (uv) UV.set(g.attributes.uv.array, o * 2);
      o += g.attributes.position.count;
      g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    if (uv) geo.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = !mat.transparent;   // sun comes through the glass
    mesh.receiveShadow = true;
    group.add(mesh);
  }
}

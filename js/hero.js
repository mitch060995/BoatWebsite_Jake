/* =========================================================
   Hero: a live WebGL ocean (ripple simulation + refraction).
   The boat idles, sails down the screen as you scroll (its hull
   pushes real wake through the water), dives, and the logo
   surfaces through the rings it leaves behind.
   ========================================================= */
(() => {
  const hero = document.getElementById('hero');
  const stage = hero.querySelector('.hero-sticky');
  const canvas = document.getElementById('water');
  const boatEl = document.getElementById('boat');
  const logoEl = document.getElementById('logo');
  const copyEl = document.getElementById('heroCopy');
  const hintEl = document.getElementById('hint');
  const glowEl = document.getElementById('heroGlow');
  const nav = document.getElementById('nav');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Always start the story from the top (unless deep-linking to a section)
  if ('scrollRestoration' in history && !location.hash) { history.scrollRestoration = 'manual'; window.scrollTo(0, 0); }

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // Scroll timeline (0..1 across the pinned hero)
  const T = {
    travelStart: 0.03, travelEnd: 0.52,  // boat sails down
    sinkStart: 0.5, sinkEnd: 0.6,        // boat dives under
    logoStart: 0.56, logoEnd: 0.8,       // logo rises through the ripples
    logoRing: 0.62,
    crispStart: 0.8, crispEnd: 0.86,     // hand over to the crisp SVG logo
    copyStart: 0.82, copyEnd: 0.95,
  };

  let W = 0, H = 0, bw = 60, bl = 150;
  const boat = { t: 0, x: 0, y: 0, heading: 0 };
  let prevFoot = null, prevK = 0, prevP = 0, prevSink = 0, ringTimer = 0, time = 0, ambientTimer = 0;

  /* ---------------- WebGL water ---------------- */
  const water = createWater(canvas);
  if (!water) stage.classList.add('no-webgl');

  function createWater(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
    if (!gl) return null;
    gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('EXT_color_buffer_half_float');

    const VS = `#version 300 es
      in vec2 aPos; out vec2 vUv;
      void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

    const HEAD = `#version 300 es
      precision highp float;
      in vec2 vUv; out vec4 o;
      uniform sampler2D uTex; uniform vec2 uTexel; uniform vec2 uScreen;`;

    // Height-field wave equation: r = height, g = velocity
    const STEP = HEAD + `
      void main(){
        vec4 c = texture(uTex, vUv);
        vec2 dx = vec2(uTexel.x, 0.0), dy = vec2(0.0, uTexel.y);
        float avg = (texture(uTex, vUv - dx).r + texture(uTex, vUv + dx).r +
                     texture(uTex, vUv - dy).r + texture(uTex, vUv + dy).r) * 0.25;
        c.g += (avg - c.r) * 2.0;
        c.g *= 0.991;
        c.r += c.g;
        c.r = mix(c.r, avg, 0.03) * 0.999;   // damp grid-scale noise
        float avgB = (texture(uTex, vUv - dx).b + texture(uTex, vUv + dx).b +
                      texture(uTex, vUv - dy).b + texture(uTex, vUv + dy).b) * 0.25;
        c.b = mix(c.b, avgB, 0.12) * 0.995;  // foam spreads and fades (b = foam)
        vec2 e = min(vUv, 1.0 - vUv);
        c.rg *= mix(0.92, 1.0, smoothstep(0.0, 0.04, min(e.x, e.y)));  // soak up waves at the edges
        o = c;
      }`;

    // A drop (disc) or a ring impulse
    const DROP = HEAD + `
      uniform vec2 uCenter; uniform float uRadius; uniform float uStrength; uniform float uRing;
      void main(){
        vec4 c = texture(uTex, vUv);
        float d = length(vUv * uScreen - uCenter);
        float x = uRing > 0.0 ? abs(d - uRing) / uRadius : d / uRadius;
        float f = max(0.0, 1.0 - x);
        c.r += (0.5 - cos(f * 3.14159) * 0.5) * uStrength;
        o = c;
      }`;

    // The hull displaces water: difference between this frame's footprint and last frame's
    const HULL = HEAD + `
      uniform vec4 uNew; uniform vec4 uOld; uniform vec2 uSize; uniform float uKNew; uniform float uKOld; uniform float uFoam;
      float hull(vec4 b, vec2 p){
        vec2 d = p - b.xy;
        float a = dot(d, b.zw);
        float s = dot(d, vec2(-b.w, b.z));
        float taper = a > 0.0 ? max(0.15, 1.0 - 0.75 * a / uSize.x) : 1.0;   // pointed bow
        float r = (a * a) / (uSize.x * uSize.x) + (s * s) / (uSize.y * uSize.y * taper * taper);
        return 1.0 - smoothstep(0.25, 1.0, r);
      }
      void main(){
        vec4 c = texture(uTex, vUv);
        vec2 p = vUv * uScreen;
        c.r -= uKNew * hull(uNew, p) - uKOld * hull(uOld, p);
        // churned water off the stern and along the sides while under way
        vec2 d = p - uNew.xy;
        float a = dot(d, uNew.zw), side = abs(dot(d, vec2(-uNew.w, uNew.z)));
        float stern = smoothstep(uSize.x * 0.4, -uSize.x * 0.9, a) * smoothstep(uSize.y * 1.25, uSize.y * 0.5, side);
        float wash = (1.0 - smoothstep(0.6, 1.25, (a * a) / (uSize.x * uSize.x * 1.1) + (side * side) / (uSize.y * uSize.y * 2.2))) * 0.5;
        c.b = max(c.b, uFoam * max(stern * step(a, 0.0), wash));
        o = c;
      }`;

    const RENDER = `#version 300 es
      precision highp float;
      in vec2 vUv; out vec4 o;
      uniform sampler2D uH; uniform sampler2D uLogo;
      uniform vec2 uRes; uniform vec2 uTexel; uniform float uTime;
      uniform vec3 uLogoRect; uniform float uLogoA; uniform float uLogoRef; uniform float uFade;

      float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vnoise(vec2 p){
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      // Gradient noise (smoother, less grid-aligned than value noise)
      float gnoise(vec2 p){
        vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
        #define GR(o) (vec2(cos(hash(i + o) * 6.2831), sin(hash(i + o) * 6.2831)))
        float a = dot(GR(vec2(0, 0)), f), b = dot(GR(vec2(1, 0)), f - vec2(1, 0));
        float c = dot(GR(vec2(0, 1)), f - vec2(0, 1)), d = dot(GR(vec2(1, 1)), f - vec2(1, 1));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 0.7 + 0.5;
      }
      const mat2 ROT = mat2(0.8, -0.6, 0.6, 0.8);
      // Rolling open-ocean swell (analytic slope of a few travelling waves)
      vec2 swell(vec2 p, float t){
        vec2 g = vec2(0.0);
        #define WAVE(dx, dy, len, amp, spd) { vec2 d = normalize(vec2(dx, dy)); g += d * amp * cos(dot(d, p) * 6.2831 / len - t * spd); }
        WAVE( 1.0,  0.35, 300.0, 0.030, 0.8)
        WAVE(-0.6,  1.0,  190.0, 0.026, 1.0)
        WAVE( 0.3, -1.0,  120.0, 0.022, 1.3)
        WAVE( 1.0, -0.7,   74.0, 0.018, 1.8)
        WAVE(-1.0, -0.2,   44.0, 0.014, 2.5)
        WAVE( 0.2,  1.0,   27.0, 0.010, 3.2)
        return g;
      }
      // Light network seen through the surface
      float caustic(vec2 uv, float t){
        vec2 p = mod(uv * 6.2831, 6.2831) - 250.0;
        vec2 i = p; float c = 1.0; float inten = 0.005;
        for (int n = 0; n < 4; n++) {
          float tt = t * (1.0 - (3.5 / float(n + 1)));
          i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
          c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
        }
        c /= 4.0; c = 1.17 - pow(c, 1.4);
        return pow(abs(c), 8.0);
      }
      void main(){
        vec2 px = vUv * uRes;
        vec4 s = texture(uH, vUv);
        float hl = texture(uH, vUv - vec2(uTexel.x, 0.0)).r, hr = texture(uH, vUv + vec2(uTexel.x, 0.0)).r;
        float hd = texture(uH, vUv - vec2(0.0, uTexel.y)).r, hu = texture(uH, vUv + vec2(0.0, uTexel.y)).r;
        vec2 gs = vec2(hr - hl, hu - hd) * 8.0;
        gs /= 1.0 + length(gs) * 2.5;          // soft-limit so big waves don't glare
        vec2 g = gs + swell(px, uTime);
        vec3 n = normalize(vec3(-g, 1.0));

        float patchy = vnoise(px * 0.0022 + vec2(uTime * 0.02, -uTime * 0.015));
        vec3 col = mix(vec3(0.025, 0.16, 0.24), vec3(0.06, 0.38, 0.5),
                       clamp(vUv.y * 0.55 + 0.22 + (patchy - 0.5) * 0.4, 0.0, 1.0));
        float ca = caustic(px / uRes.y * 1.3 + n.xy * 0.4, uTime * 0.28);
        col += vec3(0.06, 0.26, 0.3) * ca * 0.6;

        float fres = clamp((1.0 - n.z) * 7.0, 0.0, 0.4);
        col = mix(col, vec3(0.6, 0.8, 0.9), fres);

        vec3 L = normalize(vec3(-0.3, 0.42, 0.86));
        vec3 Hv = normalize(L + vec3(0.0, 0.0, 1.0));
        col += vec3(1.0, 0.93, 0.8) * pow(max(dot(n, Hv), 0.0), 300.0) * 1.8;

        float fN = gnoise(px * 0.07 + uTime * 0.5) * 0.6 + gnoise(ROT * px * 0.18 - uTime * 0.4) * 0.4;
        float churn = abs(s.g) * 3.0 + length(vec2(hr - hl, hu - hd)) * 1.5;
        float foam = smoothstep(0.4, 1.0, churn) * smoothstep(0.2, 0.62, fN);
        float trail = clamp(s.b, 0.0, 1.0);
        float lace = gnoise(px * 0.045 + vec2(uTime * 0.15, 0.0)) * 0.55 + gnoise(ROT * px * 0.12 - uTime * 0.25) * 0.3 + gnoise(ROT * ROT * px * 0.3) * 0.15;
        foam = max(foam, smoothstep(0.42, 0.82, lace + trail * 0.5 - 0.1) * smoothstep(0.02, 0.35, trail) * 0.9);
        col = mix(col, vec3(0.1, 0.42, 0.5), smoothstep(0.0, 0.4, trail) * 0.22);   // aerated turquoise
        col = mix(col, vec3(0.9, 0.96, 0.98), clamp(foam, 0.0, 1.0) * 0.9);

        vec2 luv = (px - uLogoRect.xy) / uLogoRect.z + 0.5 + n.xy * uLogoRef;
        if (uLogoA > 0.0 && luv.x > 0.0 && luv.x < 1.0 && luv.y > 0.0 && luv.y < 1.0) {
          vec4 lc = texture(uLogo, luv);          // premultiplied
          col = col * (1.0 - lc.a * uLogoA) + lc.rgb * uLogoA;
        }

        col *= uFade;
        col += (hash(px + fract(uTime) * 91.0) - 0.5) * 0.02;   // film grain
        o = vec4(col, 1.0);
      }`;

    function program(fs) {
      const p = gl.createProgram();
      for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, fs]]) {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src); gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(sh)); return null; }
        gl.attachShader(p, sh);
      }
      gl.bindAttribLocation(p, 0, 'aPos');
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(p)); return null; }
      const locs = {};
      p.u = name => (name in locs ? locs[name] : (locs[name] = gl.getUniformLocation(p, name)));
      return p;
    }
    const P = { step: program(STEP), drop: program(DROP), hull: program(HULL), render: program(RENDER) };
    if (Object.values(P).some(v => !v)) return null;

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    let A = null, B = null, simW = 0, simH = 0, sw = 0, sh = 0;

    function target(w, h) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      return ok ? { tex, fb } : null;
    }

    const logoTex = gl.createTexture();
    function setLogo(src) {
      gl.bindTexture(gl.TEXTURE_2D, logoTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    function pass(p, setup) {
      gl.useProgram(p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, B.fb);
      gl.viewport(0, 0, simW, simH);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, A.tex);
      gl.uniform1i(p.u('uTex'), 0);
      gl.uniform2f(p.u('uTexel'), 1 / simW, 1 / simH);
      gl.uniform2f(p.u('uScreen'), sw, sh);
      if (setup) setup(p);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      [A, B] = [B, A];
    }

    return {
      ok: true,
      resize(w, h, dpr) {
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
        sw = w; sh = h;
        const nx = Math.round(clamp(w / 4, 150, 420));
        const ny = Math.round(nx * h / w);
        if (nx !== simW || ny !== simH) {
          simW = nx; simH = ny;
          A = target(simW, simH); B = target(simW, simH);
          if (!A || !B) this.ok = false;
        }
      },
      // all positions are CSS pixels with y pointing up (GL convention)
      drop(x, y, radius, strength, ring = 0) {
        pass(P.drop, p => {
          gl.uniform2f(p.u('uCenter'), x, y);
          gl.uniform1f(p.u('uRadius'), radius);
          gl.uniform1f(p.u('uStrength'), strength);
          gl.uniform1f(p.u('uRing'), ring);
        });
      },
      hull(now, old, size, kNew, kOld, foam) {
        pass(P.hull, p => {
          gl.uniform4f(p.u('uNew'), ...now);
          gl.uniform4f(p.u('uOld'), ...old);
          gl.uniform2f(p.u('uSize'), size[0], size[1]);
          gl.uniform1f(p.u('uKNew'), kNew);
          gl.uniform1f(p.u('uKOld'), kOld);
          gl.uniform1f(p.u('uFoam'), foam);
        });
      },
      step(n) { for (let i = 0; i < n; i++) pass(P.step); },
      render(o) {
        const p = P.render;
        gl.useProgram(p);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, A.tex);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, logoTex);
        gl.uniform1i(p.u('uH'), 0);
        gl.uniform1i(p.u('uLogo'), 1);
        gl.uniform2f(p.u('uRes'), sw, sh);
        gl.uniform2f(p.u('uTexel'), 1 / simW, 1 / simH);
        gl.uniform1f(p.u('uTime'), o.time);
        gl.uniform3f(p.u('uLogoRect'), o.logoX, o.logoY, o.logoSize);
        gl.uniform1f(p.u('uLogoA'), o.logoA);
        gl.uniform1f(p.u('uLogoRef'), o.logoRef);
        gl.uniform1f(p.u('uFade'), o.fade);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      setLogo,
    };
  }

  /* ---------------- Logo texture (same artwork as the SVG logo) ---------------- */
  function drawLogoTexture() {
    const S = 1024, k = S / 400;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const x = c.getContext('2d');
    x.scale(k, k);
    const cream = '#f4ebdd', gold = '#e0aa5a';

    x.beginPath(); x.arc(200, 200, 194, 0, Math.PI * 2);
    x.fillStyle = 'rgba(6,30,46,.35)'; x.fill();
    x.lineWidth = 3; x.strokeStyle = cream; x.stroke();
    x.beginPath(); x.arc(200, 200, 146, 0, Math.PI * 2);
    x.globalAlpha = 0.7; x.lineWidth = 1.5; x.stroke(); x.globalAlpha = 1;

    const arcText = (text, r, font, spacing, color, top) => {
      x.font = font; x.fillStyle = color; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
      const widths = [...text].map(ch => x.measureText(ch).width + spacing);
      const total = widths.reduce((a, b) => a + b, 0) - spacing;
      let ang = top ? -Math.PI / 2 - total / r / 2 : Math.PI / 2 + total / r / 2;
      [...text].forEach((ch, i) => {
        const w = widths[i] - spacing;
        const mid = top ? ang + w / r / 2 : ang - w / r / 2;
        x.save();
        x.translate(200, 200);
        if (top) { x.rotate(mid + Math.PI / 2); x.translate(0, -r); }
        else { x.rotate(mid - Math.PI / 2); x.translate(0, r); }
        x.fillText(ch, 0, 0);
        x.restore();
        ang += (top ? 1 : -1) * widths[i] / r;
      });
    };
    arcText("JAKE & TAYLOR'S", 160, '700 22px Manrope, sans-serif', 6, cream, true);
    arcText('BOAT SALES · BUY · SELL · TRADE', 178, '700 13px Manrope, sans-serif', 4, gold, false);

    x.fillStyle = gold;
    for (const cx of [30, 370]) { x.beginPath(); x.arc(cx, 200, 4, 0, Math.PI * 2); x.fill(); }

    x.save(); x.translate(130, 108);
    x.fillStyle = cream;
    x.fill(new Path2D('M8 40 L132 36 Q142 36 138 44 L122 58 Q119 61 112 61 L28 61 Q16 61 11 54 Z'));
    x.fill(new Path2D('M40 38 L56 20 L98 20 L108 36 Z'));
    x.fillStyle = '#0b3550'; x.fill(new Path2D('M60 24 L94 24 L100 33 L54 33 Z'));
    x.strokeStyle = gold; x.lineWidth = 3; x.stroke(new Path2D('M12 50 L136 46'));
    x.restore();

    x.font = '92px "DM Serif Display", Georgia, serif';
    x.fillStyle = cream; x.textAlign = 'center';
    x.fillText('J&T', 200, 245);

    x.lineCap = 'round';
    x.strokeStyle = gold; x.lineWidth = 3;
    x.stroke(new Path2D('M120 272 q13 -10 26 0 t26 0 t26 0 t26 0 t26 0 t26 0'));
    x.strokeStyle = cream; x.lineWidth = 2; x.globalAlpha = 0.7;
    x.stroke(new Path2D('M146 290 q9 -7 18 0 t18 0 t18 0 t18 0 t18 0 t18 0'));
    return c;
  }

  if (water) {
    water.setLogo(drawLogoTexture());
    // Redraw once the web fonts are in so the lettering matches the SVG logo
    Promise.all([
      document.fonts.load('700 22px Manrope'),
      document.fonts.load('92px "DM Serif Display"'),
    ]).then(() => water.setLogo(drawLogoTexture())).catch(() => {});
  }

  /* ---------------- layout ---------------- */
  function resize() {
    const r = stage.getBoundingClientRect();
    W = r.width; H = r.height;
    const dpr = Math.min(window.devicePixelRatio || 1, W < 700 ? 1.5 : 1.75);
    if (water) water.resize(W, H, dpr);
    bw = clamp(W * 0.05, 38, 70);
    bl = bw * 2.5;
    boatEl.style.width = bw + 'px';
    boatEl.style.height = bl + 'px';
  }

  function progress() {
    if (reduced) return 1;
    const total = hero.offsetHeight - window.innerHeight;
    return total > 0 ? clamp(-hero.getBoundingClientRect().top / total, 0, 1) : 0;
  }

  // Gentle S-curve from the upper screen down to the centre
  function pathAt(t) {
    const amp = Math.min(W * 0.06, 70);
    return {
      x: W / 2 + Math.sin(t * Math.PI) * amp,
      y: lerp(H * 0.2, H * 0.5, t),
      dx: amp * Math.PI * Math.cos(t * Math.PI),
      dy: H * 0.3,
    };
  }

  /* ---------------- per-frame ---------------- */
  function update(dt, p) {
    time += dt;

    const target = smooth(T.travelStart, T.travelEnd, p);
    // ease toward the scroll position, but never faster than a steady cruise
    boat.t += clamp((target - boat.t) * (1 - Math.exp(-dt * 3.5)), -0.9 * dt, 0.9 * dt);
    const pt = pathAt(boat.t);
    // only dive once the boat has actually reached the centre (it lags on fast scrolls)
    const sink = smooth(T.sinkStart, T.sinkEnd, p) * smooth(0.9, 0.99, boat.t);

    const bob = Math.sin(time * 1.2) * 0.03;
    boat.x = pt.x + Math.sin(time * 0.55) * 3;
    boat.y = pt.y + Math.sin(time * 0.8) * 2;
    boat.heading = -Math.atan2(pt.dx * 0.3, pt.dy) + bob;

    const scale = (1 + Math.sin(time * 1.6) * 0.008) * (1 - sink * 0.4);
    boatEl.style.transform =
      `translate(${boat.x - bw / 2}px, ${boat.y - bl / 2}px) rotate(${boat.heading}rad) scale(${scale})`;
    boatEl.style.opacity = 1 - sink;
    boatEl.style.filter =
      `drop-shadow(${6 * (1 - sink)}px ${12 * (1 - sink)}px 8px rgba(0,0,0,.4)) blur(${sink * 4}px) brightness(${1 - sink * 0.5})`;

    // Logo + copy
    const L = smooth(T.logoStart, T.logoEnd, p) * smooth(0.9, 0.99, boat.t);
    const crisp = smooth(T.crispStart, T.crispEnd, p);
    const c = smooth(T.copyStart, T.copyEnd, p);
    const logoY = lerp(H * 0.5, H * 0.4, c);
    const logoSize = logoEl.offsetWidth;
    logoEl.style.top = logoY + 'px';
    logoEl.style.opacity = water ? crisp : L;
    if (!water) {
      logoEl.style.transform = `translate(-50%, -50%) scale(${0.8 + 0.2 * L})`;
    }
    glowEl.style.opacity = L;
    copyEl.style.opacity = c;
    copyEl.style.transform = `translate(-50%, ${(1 - c) * 24}px)`;
    copyEl.classList.toggle('live', c > 0.5);
    hintEl.style.opacity = 1 - smooth(0.01, 0.06, p);
    nav.classList.toggle('show-brand', c > 0.9);

    if (!water) return;

    // Boat pushes water around (wake + idle rings from its gentle bobbing)
    const yUp = H - boat.y;
    const dir = [-Math.sin(boat.heading), -Math.cos(boat.heading)];  // bow direction, y-up
    const foot = [boat.x, yUp, dir[0], dir[1]];
    const k = 1.5 * (1 - sink) * (1 + Math.sin(time * 2.4) * 0.1);
    const speed = prevFoot ? Math.hypot(foot[0] - prevFoot[0], foot[1] - prevFoot[1]) / Math.max(dt, 1e-3) : 0;
    const foamAmt = clamp((speed - 20) / 160, 0, 1) * (1 - sink);
    water.hull(foot, prevFoot || foot, [bl * 0.5, bw * 0.5], k, prevFoot ? prevK : k, foamAmt);
    prevFoot = foot; prevK = k;

    // Splash as it dives (and a smaller one if it resurfaces)
    if (prevSink < 0.3 && sink >= 0.3) {
      water.drop(boat.x, yUp, bw * 0.9, -6);
      water.drop(boat.x, yUp, bw * 1.8, 2);
    }
    if (prevSink >= 0.3 && sink < 0.3) water.drop(boat.x, yUp, bw, 0.8);
    // A ring kicks out from the logo's rim as it surfaces
    if (prevP < T.logoRing && p >= T.logoRing) water.drop(W / 2, H - logoY, 18, 1.8, logoSize * 0.5);
    prevP = p; prevSink = sink;

    // Rings keep pulsing out from the centre while the logo surfaces
    ringTimer += dt;
    if (L > 0.02 && L < 0.9 && ringTimer > 0.5) {
      ringTimer = 0;
      water.drop(W / 2, H - logoY, 22, 1.5, logoSize * 0.12);
    }

    // Little bits of life on the surface
    ambientTimer += dt;
    if (ambientTimer > 0.35) {
      ambientTimer = 0;
      water.drop(Math.random() * W, Math.random() * H, 10 + Math.random() * 20, (Math.random() - 0.5) * 0.25);
    }

    water.step(2);
    water.render({
      time,
      logoX: W / 2, logoY: H - logoY,
      logoSize: logoSize * (0.84 + 0.16 * L),
      logoA: L * (1 - crisp),
      logoRef: 0.012 + (1 - L) * 0.14,
      fade: Math.min(1, time / 1.2),
    });
  }

  // Ripples follow the cursor / finger over the water
  let lastPtr = null;
  stage.addEventListener('pointermove', e => {
    if (!water) return;
    const r = stage.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (lastPtr && Math.hypot(x - lastPtr[0], y - lastPtr[1]) < 10) return;
    lastPtr = [x, y];
    water.drop(x, H - y, 14, 0.45);
  }, { passive: true });
  stage.addEventListener('pointerdown', e => {
    if (!water) return;
    const r = stage.getBoundingClientRect();
    water.drop(e.clientX - r.left, H - (e.clientY - r.top), 22, -2.5);
  }, { passive: true });

  /* ---------------- loop ---------------- */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (hero.getBoundingClientRect().bottom > 0) update(dt, progress());
    requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener('resize', resize);
  boat.t = smooth(T.travelStart, T.travelEnd, progress());
  prevP = progress();

  if (reduced) {
    time = 2;
    update(0, 1);
  } else {
    requestAnimationFrame(frame);
  }

  // Nav background once past the hero
  const navSolid = () => nav.classList.toggle('solid', window.scrollY > hero.offsetHeight - window.innerHeight * 0.9);
  window.addEventListener('scroll', navSolid, { passive: true });
  navSolid();
})();

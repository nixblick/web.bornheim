// Straßen-Optik nach Sunset-Techniken (#153, 13.11.2026), eigener Code für ein realistisches Frankfurt:
// Markierung je Fahrstreifen nach RMS (weiß, Leitlinie 3 m / 6 m, Breite 0,12 m, Haltlinie 0,5 m, Fußgängerfurt in
// Blockmarkierung an Ampeln), Belag nach OSM-surface (data/belag.json, tools/fetch_belag.py), Asphalt mit Worley-Rissnetz,
// neuer Asphalt auf Hauptstraßen, Makro-Variation in Weltkoordinaten, Kleinteile-Atlas (ein Material je Kachelstück),
// Bordsteinecken als Bogen, Nässe mit Pfützen aus Rauschen und Tropfenringen.
// Grafikstufen: „Niedrig“ baut nur Mittellinie, Kanaldeckel und Abläufe (ein Mesh statt bisher drei), keine Shader;
// „Mittel“ alles außer Tropfenringen und Spurabrieb; „Hoch“ alles. Kleinteile verschwinden ab einem Abstand je Stufe.

/** Tileable Worley-Rissnetz (F2−F1) mit Bitumen-Verguss, nur in fleckigen Bereichen. rnd: Zufall 0..1. */
export function asphaltRisse(ctx, w, h, rnd) {
  const N = 6, P = []; for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) P.push([i + 0.15 + rnd() * 0.7, j + 0.15 + rnd() * 0.7]);
  const f = [1, 2, 3].map(() => [Math.floor(1 + rnd() * 3), Math.floor(1 + rnd() * 3), rnd() * 6.3]);
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / w, v = y / h;
    let m = 0; for (const [a, b, ph] of f) m += Math.sin((u * a + v * b) * 6.2832 + ph); m /= 3; // tileable Maske
    if (m < 0.35) continue;
    const gx = u * N, gy = v * N, cx = Math.floor(gx), cy = Math.floor(gy); let d1 = 9, d2 = 9;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { const ix = cx + ox, iy = cy + oy; const p = P[((iy + N) % N) * N + ((ix + N) % N)];
      const px = p[0] + (ix - ((ix + N) % N)), py = p[1] + (iy - ((iy + N) % N)); const dd = Math.hypot(gx - px, gy - py); if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd; }
    const e = d2 - d1, tw = 0.022 * Math.min(1, (m - 0.35) * 4); if (e > tw) continue;
    const k = 1 - e / tw, o = (y * w + x) * 4, dk = 0.4 * k * k; d[o] = d[o] * (1 - dk) + 22 * dk; d[o + 1] = d[o + 1] * (1 - dk) + 22 * dk; d[o + 2] = d[o + 2] * (1 - dk) + 21 * dk;
  }
  ctx.putImageData(img, 0, 0);
}

/** @param {any} X  THREE, TH, onOtherRoad, opts, weather, camera (Getter erlaubt) */
export function initStrassen(X) {
  const { THREE } = X;
  const q = () => (X.opts && X.opts.quality) || 'mittel';
  const low = () => q() === 'niedrig' || X.LOW || (X.opts && X.opts.potato);
  const hi = () => q() === 'hoch' || q() === 'ultra';

  // ---------- Belag aus OSM ----------
  const BG = new Map(), BC = 40; let belagOk = false;
  fetch('data/belag.json').then(r => r.ok ? r.json() : null).then(j => { if (!j) return;
    for (const [k, f] of j.s) for (let i = 0; i + 3 < f.length; i += 2) { const s = [f[i], f[i + 1], f[i + 2], f[i + 3], k];
      const x0 = Math.floor(Math.min(s[0], s[2]) / BC), x1 = Math.floor(Math.max(s[0], s[2]) / BC), z0 = Math.floor(Math.min(s[1], s[3]) / BC), z1 = Math.floor(Math.max(s[1], s[3]) / BC);
      for (let a = x0; a <= x1; a++) for (let b = z0; b <= z1; b++) { const key = a + ',' + b; if (!BG.has(key)) BG.set(key, []); BG.get(key).push(s); } }
    belagOk = true; }).catch(() => {});
  const dSeg = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L)); return Math.hypot(px - ax - dx * t, pz - az - dz * t); };
  function belagAt(x, z, ux, uz) { const c = BG.get(Math.floor(x / BC) + ',' + Math.floor(z / BC)); if (!c) return 0; let best = 0, bd = 3.5;
    for (const s of c) { const d = dSeg(x, z, s[0], s[1], s[2], s[3]); if (d >= bd) continue; const sx = s[2] - s[0], sz = s[3] - s[1], sl = Math.hypot(sx, sz) || 1; if (Math.abs((sx * ux + sz * uz) / sl) < 0.8) continue; bd = d; best = s[4]; } return best; }
  /** Sorte einer Straße: 0 Asphalt alt (Wohnstraße), 1 Asphalt neu (Hauptstraße), 2 Großpflaster, 3 Verbundpflaster. „Niedrig“: immer 0. */
  function sorte(r) {
    if (low()) return 0; if (r._so !== undefined && (r._sb || !belagOk)) return r._so;
    let so = r.w >= 9 || r.mw ? 1 : 0;
    if (belagOk && !r.mw) { let hit = 0, n = 0, k = 0; for (let i = 0; i < r.p.length - 1; i++) { const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const l = Math.hypot(bx - ax, bz - az); if (l < 2) continue; n++; const b = belagAt((ax + bx) / 2, (az + bz) / 2, (bx - ax) / l, (bz - az) / l); if (b) { hit++; k = b; } }
      if (n && hit * 2 >= n) so = k === 1 ? 2 : 3; }
    r._so = so; r._sb = belagOk; return so;
  }

  // ---------- Texturen ----------
  const ctex = (w, h, draw, rep) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.userData.shared = true; return t; };
  const mul = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  let TX = null;
  function texs() { if (TX) return TX; TX = {
    neu: ctex(512, 512, (c, w, h) => { const r = mul(11); c.fillStyle = '#4b4b48'; c.fillRect(0, 0, w, h); for (let i = 0; i < 16; i++) { c.fillStyle = r() < 0.5 ? 'rgba(255,255,250,0.025)' : 'rgba(0,0,0,0.04)'; c.beginPath(); c.ellipse(r() * w, r() * h, 40 + r() * 90, 30 + r() * 70, r() * 3, 0, 7); c.fill(); }
      for (let i = 0; i < 16000; i++) { const t = r(); c.fillStyle = t < 0.5 ? 'rgba(20,20,20,0.45)' : t < 0.9 ? 'rgba(130,130,126,0.3)' : 'rgba(190,186,178,0.3)'; c.fillRect(r() * w, r() * h, 1 + r(), 1 + r()); } }, 1 / 8),
    // Großpflaster (Basalt/Granit, 16 cm Steine in Reihen), ein Bild = 2 m
    sett: ctex(512, 512, (c, w, h) => { const r = mul(5); c.fillStyle = '#3c3a37'; c.fillRect(0, 0, w, h); const s = 41;
      for (let y = 0; y < h; y += s) { const off = (y / s) % 2 ? s / 2 : 0; for (let x = -s; x < w + s; x += s) { const g = 85 + r() * 50 | 0, b = g - 4 - r() * 8 | 0; c.fillStyle = `rgb(${g},${g - 2},${b})`; const jx = r() * 3, jy = r() * 3; c.beginPath(); c.roundRect(x + off + 2 + jx, y + 2 + jy, s - 5 - r() * 3, s - 5 - r() * 3, 6); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(x + off + 6, y + 5, s - 14, 4); } } }, 1 / 2),
    // Verbundpflaster (Betonstein 20 × 10 cm, Fischgrät-frei, Läuferverband)
    paving: ctex(512, 512, (c, w, h) => { const r = mul(9); c.fillStyle = '#6b665e'; c.fillRect(0, 0, w, h); const sw = 51, sh = 26;
      for (let y = 0, row = 0; y < h; y += sh, row++) for (let x = row % 2 ? -sw / 2 : 0; x < w; x += sw) { const g = 140 + r() * 30 | 0; c.fillStyle = `rgb(${g},${g - 6},${g - 14})`; c.fillRect(x + 1.5, y + 1.5, sw - 3, sh - 3); } }, 1 / 2),
    atlas: atlasTex() }; return TX; }

  // Kleinteile-Atlas 4 × 2 (256 px je Zelle): 0 Kanaldeckel (Stadtentwässerung Frankfurt), 1 Straßenablauf, 2 Flicken, 3 Ölfleck,
  // 4 Rissverguss, 5 Bremsspur, 6 Aufgrabungsnaht, 7 Spurabrieb
  function atlasTex() { const C = 256; return ctex(C * 4, C * 2, (c) => { const r = mul(3); c.clearRect(0, 0, C * 4, C * 2);
    const cell = (i, f) => { c.save(); c.translate((i % 4) * C, Math.floor(i / 4) * C); c.beginPath(); c.rect(0, 0, C, C); c.clip(); f(); c.restore(); };
    cell(0, () => { c.fillStyle = '#6d6a63'; c.beginPath(); c.arc(128, 128, 126, 0, 7); c.fill(); c.fillStyle = '#34332f'; c.beginPath(); c.arc(128, 128, 112, 0, 7); c.fill();
      c.strokeStyle = '#4a4843'; c.lineWidth = 7; for (let k = 0; k < 9; k++) { c.beginPath(); c.moveTo(40, 30 + k * 23); c.lineTo(216, 30 + k * 23); c.stroke(); }
      c.fillStyle = '#34332f'; c.beginPath(); c.arc(128, 128, 44, 0, 7); c.fill(); c.fillStyle = '#56544e'; c.font = 'bold 20px sans-serif'; c.textAlign = 'center'; c.fillText('STADT', 128, 122); c.fillText('FFM', 128, 146);
      c.strokeStyle = '#8a867c'; c.lineWidth = 3; c.beginPath(); c.arc(128, 128, 112, 0, 7); c.stroke(); });
    cell(1, () => { c.fillStyle = '#5f5c56'; c.fillRect(48, 8, 160, 240); c.fillStyle = '#151514'; for (let x = 62; x < 196; x += 18) c.fillRect(x, 24, 9, 208); c.strokeStyle = '#86827a'; c.lineWidth = 6; c.strokeRect(51, 11, 154, 234); });
    cell(2, () => { c.fillStyle = 'rgba(28,28,30,0.55)'; c.fillRect(10, 10, 236, 236); for (let i = 0; i < 2500; i++) { c.fillStyle = r() < 0.5 ? 'rgba(10,10,10,0.35)' : 'rgba(140,140,135,0.25)'; c.fillRect(10 + r() * 236, 10 + r() * 236, 2, 2); } c.strokeStyle = 'rgba(12,12,12,0.7)'; c.lineWidth = 5; c.strokeRect(10, 10, 236, 236); });
    cell(3, () => { for (let k = 0; k < 4; k++) { const g = c.createRadialGradient(128 + (r() - 0.5) * 60, 128 + (r() - 0.5) * 60, 4, 128, 128, 70 + r() * 40); g.addColorStop(0, 'rgba(8,8,12,0.35)'); g.addColorStop(1, 'rgba(8,8,12,0)'); c.fillStyle = g; c.fillRect(0, 0, C, C); } });
    cell(4, () => { c.strokeStyle = 'rgba(16,16,15,0.8)'; c.lineCap = 'round'; for (let i = 0; i < 3; i++) { let x = 20 + r() * 40, y = 30 + r() * 200, a = (r() - 0.5) * 0.6; c.lineWidth = 6 + r() * 4; c.beginPath(); c.moveTo(x, y); while (x < 236) { a += (r() - 0.5) * 0.7; x += Math.cos(a) * 14; y += Math.sin(a) * 14; c.lineTo(x, y); } c.stroke(); } });
    cell(5, () => { for (const x0 of [70, 186]) { const g = c.createLinearGradient(0, 0, 0, C); g.addColorStop(0, 'rgba(10,10,10,0)'); g.addColorStop(0.3, 'rgba(10,10,10,0.45)'); g.addColorStop(1, 'rgba(10,10,10,0.6)'); c.fillStyle = g; c.fillRect(x0 - 16, 0, 32, C); } });
    cell(6, () => { c.fillStyle = 'rgba(30,30,32,0.6)'; c.fillRect(0, 70, C, 116); for (let i = 0; i < 1800; i++) { c.fillStyle = r() < 0.5 ? 'rgba(10,10,10,0.35)' : 'rgba(150,150,145,0.25)'; c.fillRect(r() * C, 70 + r() * 116, 2, 2); } c.fillStyle = 'rgba(14,14,14,0.75)'; c.fillRect(0, 68, C, 5); c.fillRect(0, 183, C, 5); });
    cell(7, () => { for (const x0 of [64, 192]) { const g = c.createLinearGradient(x0 - 40, 0, x0 + 40, 0); g.addColorStop(0, 'rgba(150,150,145,0)'); g.addColorStop(0.5, 'rgba(160,160,155,0.22)'); g.addColorStop(1, 'rgba(150,150,145,0)'); c.fillStyle = g; c.fillRect(x0 - 40, 0, 80, C); } });
  }, 1); }

  // ---------- Nässe-Baustein (Shader) ----------
  const U = { uWet: { value: 0 }, uPud: { value: 0 }, uT: { value: 0 }, uRing: { value: 0 } };
  const NOISE = `float sh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float sn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(sh(i),sh(i+vec2(1,0)),f.x),mix(sh(i+vec2(0,1)),sh(i+vec2(1,1)),f.x),f.y);}
float sf(vec2 p){return .5*sn(p)+.25*sn(p*2.03+7.)+.125*sn(p*4.01+3.)+.0625*sn(p*8.1+1.);}`;
  /** Nässe, Pfützen, Tropfenringe und Makro-Variation an ein MeshStandardMaterial hängen (nicht in „Niedrig“). */
  function nass(mat, pfuetzen = true) {
    if (!mat || !mat.isMeshStandardMaterial || mat.userData.nass) return mat; mat.userData.nass = true;
    mat.customProgramCacheKey = () => 'strassen-nass-' + (pfuetzen ? 1 : 0);
    mat.onBeforeCompile = sh => { Object.assign(sh.uniforms, U);
      sh.vertexShader = 'varying vec3 vSW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvSW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = 'varying vec3 vSW;\nuniform float uWet, uPud, uT, uRing;\n' + NOISE + '\n' + sh.fragmentShader
        .replace('#include <map_fragment>', `#include <map_fragment>
float sMac = sf(vSW.xz * 0.019); diffuseColor.rgb *= 0.86 + sMac * 0.28; // großflächige Hell/Dunkel-Wolken gegen die 8-m-Wiederholung
float sPm = 0.0; ${pfuetzen ? 'if (uPud > 0.01) { float sp = sf(vSW.xz * 0.11 + 13.0) * 0.7 + sMac * 0.3; float th = 0.8 - uPud * 0.18; sPm = smoothstep(th, th + 0.035, sp); }' : ''}
diffuseColor.rgb *= mix(1.0, 0.45, sPm);`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.035, sPm);')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
if (sPm > 0.0) { normal = normalize(mix(normal, nonPerturbedNormal, sPm));
  if (uRing > 0.5) { vec2 g = vSW.xz * 3.0; vec2 ci = floor(g); vec2 rr = vec2(0.0);
    for (int k = 0; k < 2; k++) { vec2 cc = ci + vec2(float(k), 0.0) * 0.0; float h = sh(cc + float(k) * 3.1); float ph = fract(uT * 0.9 + h); vec2 o = vec2(sh(cc + 5.2 + float(k)), sh(cc + 9.7 + float(k))) * 0.6 + 0.2; vec2 dv = fract(g) - o; float d = length(dv);
      float ring = smoothstep(0.035, 0.0, abs(d - ph * 0.3)) * (1.0 - ph) * step(0.5, sh(cc + floor(uT * 0.9 + h) * 1.7)); rr += dv / max(d, 1e-3) * ring; }
    normal = normalize(normal + (viewMatrix * vec4(rr.x, 0.0, rr.y, 0.0)).xyz * 0.3 * sPm); } }`); };
    mat.needsUpdate = true; return mat;
  }

  // ---------- Materialien ----------
  const MATS = {};
  /** Material für Sorte 1–3 (Sorte 0 bleibt das bisherige Fahrbahnmaterial aus game.js). */
  function belagMat(so, normalMap) { if (MATS[so]) return MATS[so]; const T = texs();
    const m = new THREE.MeshStandardMaterial({ map: so === 1 ? T.neu : so === 2 ? T.sett : T.paving, normalMap: so === 1 ? normalMap : null, color: 0xffffff, roughness: so === 1 ? 0.9 : 0.82, metalness: 0 });
    m.userData.shared = true; m.userData.sorte = so; nass(m); return (MATS[so] = m); }
  function markMat(markTex) { if (MATS.mark) return MATS.mark; const m = new THREE.MeshLambertMaterial({ map: markTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2, side: THREE.DoubleSide }); m.userData.shared = true; return (MATS.mark = m); }
  function atlasMat() { if (MATS.atlas) return MATS.atlas; const m = new THREE.MeshLambertMaterial({ map: texs().atlas, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -3, side: THREE.DoubleSide }); m.userData.shared = true; return (MATS.atlas = m); }
  function eckMat() { if (MATS.eck) return MATS.eck; const m = new THREE.MeshLambertMaterial({ vertexColors: true }); m.userData.shared = true; return (MATS.eck = m); }

  // ---------- Geometrie-Helfer ----------
  const yAt = (r, i, t, x, z) => { if (r.ry && r.el && (r.el[i] || r.el[i + 1])) { const ya = r.el[i] ? r.ry[i] : X.TH(r.p[i][0], r.p[i][1]), yb = r.el[i + 1] ? r.ry[i + 1] : X.TH(r.p[i + 1][0], r.p[i + 1][1]); return ya + (yb - ya) * t; } return X.TH(x, z); };
  class Buf { constructor() { this.p = []; this.u = []; }
    // Viereck auf der Fahrbahn: Mitte (x,z), Längsrichtung (ux,uz), Länge a, Breite b, uv-Rechteck, Höhen-Funktion
    quad(x, z, ux, uz, a, b, uv, hf, dy = 0.06) { const nx = -uz, nz = ux, A = a / 2, B = b / 2; const P = [[-B, -A], [B, -A], [B, A], [-B, A]].map(([s, t]) => { const px = x + nx * s + ux * t, pz = z + nz * s + uz * t; return [px, hf(px, pz) + dy, pz]; });
      const [u0, v0, u1, v1] = uv; const UV = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
      for (const k of [0, 2, 1, 0, 3, 2]) { this.p.push(...P[k]); this.u.push(...UV[k]); } }
    mesh(mat) { if (!this.p.length) return null; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2)); const n = new Float32Array(this.p.length); for (let i = 1; i < n.length; i += 3) n[i] = 1; g.setAttribute('normal', new THREE.BufferAttribute(n, 3)); g.computeBoundingSphere(); const m = new THREE.Mesh(g, mat); m.receiveShadow = true; return m; } }
  const near = (x, z, list, d) => { if (!list) return null; for (const s of list) { const sx = s[0] ?? s.x, sz = s[1] ?? s.z; if (sx === undefined) continue; if ((sx - x) ** 2 + (sz - z) ** 2 < d * d) return [sx, sz]; } return null; };

  // ---------- Markierung ----------
  /** Alle Striche einer Kachel als ein Mesh. roads/signals/crossings aus CITY. */
  function markierung(roads, signals, crossings, markTex) {
    const B = new Buf(), L = low(), W = 0.12, UVL = [0, 0, 1, 1];
    for (const r of roads) { if (r.ped || r.w < 5) continue; const lanes = Math.max(1, r.l || (r.w >= 8 ? 2 : 1)), one = !!r.o;
      // Linien quer zur Fahrbahn: [Versatz, Art] mit Art 'L' Leitlinie, 'S' durchgezogen, 'M' Mitte (Sperrlinie vor Ampeln)
      /** @type {[number, string][]} */ const lines = [];
      if (L) { if (r.w >= 8 && !one) lines.push([0, 'M']); }
      else {
        if (!one && (lanes >= 2 || r.w >= 8)) { const per = Math.max(1, Math.floor(lanes / 2)); lines.push([0, lanes >= 4 ? 'S' : 'M']); const lw = (r.w / 2 - 0.5) / per; for (let k = 1; k < per; k++) for (const sg of [-1, 1]) lines.push([sg * k * lw, 'L']); }
        if (one && lanes >= 2) { const lw = (r.w - 1) / lanes; for (let k = 1; k < lanes; k++) lines.push([-r.w / 2 + 0.5 + k * lw, 'L']); }
        if (r.w >= 11 || r.mw) for (const sg of [-1, 1]) lines.push([sg * (r.w / 2 - 0.35), 'S']);
      }
      if (!lines.length) continue; let s0 = 0;
      for (let i = 0; i < r.p.length - 1; i++) { const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const l = Math.hypot(bx - ax, bz - az); if (l < 0.5) { s0 += l; continue; } const ux = (bx - ax) / l, uz = (bz - az) / l, nx = -uz, nz = ux;
        for (let s = Math.ceil(s0 / 3) * 3 - s0; s < l - 0.1; s += 3) { const ph = Math.floor((s0 + s) / 3 + 1e-6) % 3, a = Math.min(3, l - s), t = (s + a / 2) / l; const cx = ax + ux * (s + a / 2), cz = az + uz * (s + a / 2);
          const sig = !L && near(cx, cz, signals, 28);
          for (const [off, art] of lines) { const solid = art === 'S' || (art === 'M' && sig); if (!solid && ph !== 0) continue; const x = cx + nx * off, z = cz + nz * off; if (X.onOtherRoad(x, z, r, 0.5)) continue;
            const y = yAt(r, i, t, x, z); B.quad(x, z, ux, uz, a - (solid ? 0 : 0.02), art === 'S' && Math.abs(off) > 1 ? W * 1.25 : W * (art === 'M' ? 1.25 : 1), UVL, () => y); } }
        s0 += l; } }
    if (!L) {
      // Haltlinie vor jeder Ampel (0,5 m), über die zuführenden Fahrstreifen
      for (const sgl of signals || []) { const sx = sgl[0], sz = sgl[1]; let r = null, bi = -1, bd = 12; for (const rq of roads) { if (rq.ped || rq.w < 5) continue; for (let i = 0; i < rq.p.length - 1; i++) { const d = dSeg(sx, sz, rq.p[i][0], rq.p[i][1], rq.p[i + 1][0], rq.p[i + 1][1]); if (d < bd) { bd = d; bi = i; r = rq; } } } if (!r) continue;
        const [ax, az] = r.p[bi], [bx, bz] = r.p[bi + 1]; const l = Math.hypot(bx - ax, bz - az) || 1; let ux = (bx - ax) / l, uz = (bz - az) / l; const t = Math.max(0, Math.min(1, ((sx - ax) * ux + (sz - az) * uz) / l));
        const px = ax + ux * l * t, pz = az + uz * l * t; const toB = l * (1 - t), toA = l * t; if (toA < toB) { ux = -ux; uz = -uz; } // Fahrtrichtung zum nahen Knoten
        let back = Math.min(toA, toB) < 4 ? 7 : 0; const hx = px - ux * back, hz = pz - uz * back; if (X.onOtherRoad(hx, hz, r, 0)) continue;
        const rx = -uz, rz = ux; const c0 = r.o ? 0 : r.w / 4, wid = r.o ? r.w - 0.6 : r.w / 2 - 0.4; const cx = hx + rx * c0, cz = hz + rz * c0;
        const y = X.TH(cx, cz); B.quad(cx, cz, rx, rz, wid, 0.5, UVL, () => y, 0.065); sgl._halt = [hx, hz, ux, uz, r]; }
      // Fußgängerfurt (Blockmarkierung 0,5 × 0,5 m, Lücke 0,2 m) an Querungen nahe einer Ampel, statt Zebrastreifen
      for (const c of crossings || []) { const x = c.x ?? (c.p && c.p[Math.floor(c.p.length / 2)][0]), z = c.z ?? (c.p && c.p[Math.floor(c.p.length / 2)][1]); if (x === undefined || !near(x, z, signals, 18)) continue;
        const nr = X.nearestRoadDir && X.nearestRoadDir(x, z, 7); if (!nr || nr.w < 5) continue; const ux = Math.sin(nr.ang), uz = Math.cos(nr.ang), qx = -uz, qz = ux; // ux: entlang der Straße
        for (const e of [-2, 2]) for (let s = -nr.w / 2 + 0.4; s < nr.w / 2 - 0.3; s += 0.7) { const bx = nr.x + ux * e + qx * s, bz = nr.z + uz * e + qz * s; const y = X.TH(bx, bz); B.quad(bx, bz, ux, uz, 0.5, 0.5, UVL, () => y, 0.065); } }
    }
    STAT.mark += B.p.length / 18; STAT.markCalls++;
    return B.mesh(markMat(markTex));
  }
  /** Zebrastreifen gibt es in Frankfurt an Ampeln nicht: game.js fragt vor jedem Zebra hier nach. */
  const anAmpel = (x, z, signals) => !!near(x, z, signals, 18);

  // ---------- Kleinteile ----------
  const AT = i => { const u = (i % 4) / 4, v = 1 - Math.floor(i / 4) / 2; return [u + 0.002, v - 0.498, u + 0.248, v - 0.002]; }; // Atlas-Zelle (flipY: Zeile 0 oben)
  const STUECK = []; const STAT = { mark: 0, markCalls: 0 };
  /** Kanaldeckel, Abläufe und (ab Mittel) Flicken, Öl, Risse, Aufgrabungen, Bremsspuren, Spurabrieb; ab Mittel in 125-m-Stücken mit Abstandsgrenze. */
  function kleinteile(roads, signals, add) {
    const L = low(), H = hi(), C = 125, bufs = new Map(); let sd = 17; const rr = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    const buf = (x, z) => { const k = L ? 'a' : Math.floor(x / C) + ',' + Math.floor(z / C); let b = bufs.get(k); if (!b) { b = new Buf(); b.cx = (Math.floor(x / C) + 0.5) * C; b.cz = (Math.floor(z / C) + 0.5) * C; bufs.set(k, b); } return b; };
    const put = (i, x, z, ux, uz, a, b, r, si, t, dy = 0.055) => { const y = yAt(r, si, t, x, z); buf(x, z).quad(x, z, ux, uz, a, b, AT(i), (px, pz) => r.ry ? y : X.TH(px, pz), dy); };
    for (const r of roads) { if (r.ped || r.w < 6) continue; const deck = !r.mw && !r.ry;
      for (let i = 0; i < r.p.length - 1; i++) { const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const l = Math.hypot(bx - ax, bz - az); if (l < 8) continue; const ux = (bx - ax) / l, uz = (bz - az) / l, nx = -uz, nz = ux;
        const P = (s, off) => [ax + ux * s + nx * off, az + uz * s + nz * off];
        if (deck) for (let s = 4 + rr() * 20; s < l - 3; s += 26 + rr() * 22) { const [x, z] = P(s, (rr() < 0.5 ? -1 : 1) * r.w / 4); if (X.onOtherRoad(x, z, r, -0.5)) continue; put(0, x, z, ux, uz, 0.68, 0.68, r, i, s / l); }
        if (deck) for (let s = 6 + rr() * 15; s < l - 3; s += 22 + rr() * 18) for (const sg of [-1, 1]) { if (rr() < 0.4) continue; const [x, z] = P(s, sg * (r.w / 2 - 0.35)); if (X.onOtherRoad(x, z, r, -0.5)) continue; put(1, x, z, ux, uz, 0.5, 0.32, r, i, s / l); }
        if (L) continue;
        for (let s = 5 + rr() * 30; s < l - 4; s += 30 + rr() * 50) { const kind = rr(); const off = (rr() - 0.5) * (r.w - 2.5); const [x, z] = P(s, off); if (X.onOtherRoad(x, z, r, 0)) continue;
          if (kind < 0.35) put(2, x, z, ux, uz, 1.2 + rr() * 2.5, 1 + rr() * 1.5, r, i, s / l);
          else if (kind < 0.55) put(3, x, z, ux, uz, 1.2 + rr(), 1 + rr() * 0.8, r, i, s / l);
          else if (kind < 0.85) put(4, x, z, ux, uz, 2.5 + rr() * 2, 1.2 + rr(), r, i, s / l);
          else if (!r.ry) { const [cx, cz] = P(s, 0); put(6, cx, cz, nx, nz, r.w - 0.3, 1.1, r, i, s / l, 0.052); } } // Aufgrabung quer über die ganze Breite
        if (H && !r.ry) { const lanes = Math.max(1, r.l || 1), lw = r.w / Math.max(2, lanes); for (let s = 2; s < l - 2; s += 8) { const a = Math.min(8, l - s); for (let k = 0; k < Math.max(2, lanes); k++) { const off = -r.w / 2 + lw * (k + 0.5); const [x, z] = P(s + a / 2, off); if (X.onOtherRoad(x, z, r, 0)) continue; put(7, x, z, ux, uz, a, lw * 0.9, r, i, (s + a / 2) / l, 0.05); } } }
      } }
    // Bremsspuren vor Haltlinien
    if (!L) for (const sgl of signals || []) { const h = sgl._halt; if (!h) continue; const [hx, hz, ux, uz, r] = h; if (rr() < 0.4) continue; const off = r.o ? 0 : r.w / 4; const x = hx - ux * 6 + (-uz) * off, z = hz - uz * 6 + ux * off; put(5, x, z, ux, uz, 7 + rr() * 5, 1.9, r, 0, 0, 0.053); }
    for (const b of bufs.values()) { const m = b.mesh(atlasMat()); if (!m) continue; add(m); if (!L) STUECK.push({ m, x: b.cx, z: b.cz }); }
  }

  // ---------- Bordsteinecken als Bogen ----------
  function ecken(roads, add) { if (low()) return; const nodes = new Map();
    for (const r of roads) { if (r.ped || r.w < 5 || r.ry || r.mw) continue; for (let i = 0; i < r.p.length; i++) { const k = r.p[i][0] + ',' + r.p[i][1]; let n = nodes.get(k); if (!n) nodes.set(k, n = []); n.push([r, i]); } }
    const P = [], Cc = [], col = (c) => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
    const front = col(0x9c978e), top = col(0xbab4a9);
    const q = (a, b, c2, d, cl) => { for (const v of [a, b, c2, a, c2, d]) { P.push(...v); Cc.push(...cl); } };
    for (const [k, n] of nodes) { const roadsAt = new Set(n.map(e => e[0])); if (roadsAt.size < 2) continue; const [ox, oz] = k.split(',').map(Number); const arms = [];
      for (const [r, i] of n) for (const j of [i - 1, i + 1]) { if (j < 0 || j >= r.p.length) continue; const dx = r.p[j][0] - ox, dz = r.p[j][1] - oz, l = Math.hypot(dx, dz); if (l < 1) continue; arms.push({ a: Math.atan2(dz, dx), ux: dx / l, uz: dz / l, hw: r.w / 2, l, r }); }
      if (arms.length < 3) continue; arms.sort((p, q2) => p.a - q2.a);
      for (let m = 0; m < arms.length; m++) { const A = arms[m], Bm = arms[(m + 1) % arms.length]; let d = Bm.a - A.a; if (d <= 0) d += Math.PI * 2; if (d < 0.5 || d > 2.4) continue;
        const nAx = -A.uz, nAz = A.ux, nBx = Bm.uz, nBz = -Bm.ux; // Normalen zur Ecke hin
        const ax0 = ox + nAx * A.hw, az0 = oz + nAz * A.hw, bx0 = ox + nBx * Bm.hw, bz0 = oz + nBz * Bm.hw;
        const den = A.ux * Bm.uz - A.uz * Bm.ux; if (Math.abs(den) < 1e-3) continue; const t = ((bx0 - ax0) * Bm.uz - (bz0 - az0) * Bm.ux) / den; const Qx = ax0 + A.ux * t, Qz = az0 + A.uz * t;
        const R = Math.min(5, 2 + Math.min(A.hw, Bm.hw) * 0.4), tl = R / Math.tan(d / 2); if (tl > Math.min(A.l, Bm.l) - 1 || tl > 14) continue;
        let bxs = A.ux + Bm.ux, bzs = A.uz + Bm.uz; const bl = Math.hypot(bxs, bzs) || 1; bxs /= bl; bzs /= bl; const cd = R / Math.sin(d / 2); const Cx = Qx + bxs * cd, Cz = Qz + bzs * cd;
        const Tax = Qx + A.ux * tl, Taz = Qz + A.uz * tl, Tbx = Qx + Bm.ux * tl, Tbz = Qz + Bm.uz * tl; const a0 = Math.atan2(Taz - Cz, Tax - Cx); let a1 = Math.atan2(Tbz - Cz, Tbx - Cx);
        let da = a1 - a0; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
        const mx = Cx + Math.cos(a0 + da / 2) * R, mz = Cz + Math.sin(a0 + da / 2) * R; if (X.onOtherRoad(mx, mz, null, 0.2)) continue;
        const N = 8, hh = 0.13, ww = 0.3; for (let s = 0; s < N; s++) { const b0 = a0 + da * s / N, b1 = a0 + da * (s + 1) / N; const x0 = Cx + Math.cos(b0) * R, z0 = Cz + Math.sin(b0) * R, x1 = Cx + Math.cos(b1) * R, z1 = Cz + Math.sin(b1) * R;
          const i0x = Cx + Math.cos(b0) * (R - ww), i0z = Cz + Math.sin(b0) * (R - ww), i1x = Cx + Math.cos(b1) * (R - ww), i1z = Cz + Math.sin(b1) * (R - ww); const y0 = X.TH(x0, z0) + 0.04, y1 = X.TH(x1, z1) + 0.04;
          q([x0, y0, z0], [x1, y1, z1], [x1, y1 + hh, z1], [x0, y0 + hh, z0], front); q([x0, y0 + hh, z0], [x1, y1 + hh, z1], [i1x, y1 + hh, i1z], [i0x, y0 + hh, i0z], top); } } }
    if (!P.length) return; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, eckMat()); m.material.side = THREE.DoubleSide; m.receiveShadow = true; add(m); }

  // ---------- je Bild ----------
  let lt = 0;
  function update(dt) { const w = (X.weather && X.weather.wet) || 0; U.uWet.value = w; U.uPud.value = Math.max(0, Math.min(1, (w - 0.3) / 0.6)); U.uT.value += dt; U.uRing.value = hi() && X.weather && X.weather.rain > 0.1 ? 1 : 0;
    for (const so of [1, 2, 3]) { const m = MATS[so]; if (!m) continue; m.color.setScalar(so === 1 ? 0.75 - w * 0.25 : 0.85 - w * 0.3); m.roughness = (so === 1 ? 0.9 : 0.82) - w * 0.45; m.envMapIntensity = 0.3 + w * 1.6; }
    if ((lt += dt) < 0.5) return; lt = 0; const c = X.camera; if (!c) return; const D = hi() ? 320 : 200;
    for (let i = STUECK.length - 1; i >= 0; i--) { const s = STUECK[i]; let o = s.m, inScene = false; while (o) { if (o.isScene) { inScene = true; break; } o = o.parent; }
      s.age = inScene ? 0 : (s.age || 0) + 1; if (s.age > 20) { STUECK.splice(i, 1); continue; } s.m.visible = Math.hypot(c.position.x - s.x, c.position.z - s.z) < D; } }

  return { sorte, belagMat, nass, markierung, anAmpel, kleinteile, ecken, update, get belagOk() { return belagOk; }, U, get stuecke() { return STUECK.length; }, STAT, get dbg() { return { q: q(), LOW: !!X.LOW, potato: !!(X.opts && X.opts.potato), low: low() }; } };
}

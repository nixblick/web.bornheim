// Rasen (André 13.11.2026: „die coolen sachen aus sunset … der rasen usw.“, Bornheim bleibt realistisch).
// Technik nach Sunset world.js (grass-field): Halmbüschel als drei gekreuzte Karten mit Alpha-Halmen, als InstancedMesh
// in 8-m-Zellen nur rund um die Kamera, zum Rand hin flach ausgeblendet, Wind biegt die Spitzen im Vertex-Shader.
// Für Bornheim angepasst: nur auf echten OSM-Grünflächen (Parks, Wiesen, Gärten, Friedhof), nicht auf Wegen, Häusern,
// Wasser oder Brücken; gemähter Stadtrasen kurz (12–28 cm), Wiese höher. Farben bleiben die der Grünflächen.
// Stufen (opts.rasenForce erzwingt Halme auch bei schwacher GPU, nur für Proben): Niedrig/Sparmodus/schwache GPU nur die Bodentextur (eine Textur mehr, kein Halm), Mittel 26 m, Hoch 38 m, Ultra 48 m.

/** Rasenarten, die Halme und die Rasentextur bekommen (Sportplätze, Spielplätze, Parkplätze nicht) */
export const RASEN_KINDS = new Set(['park', 'grass', 'garden', 'meadow', 'allotments', 'dog_park', 'cemetery', 'recreation_ground', 'village_green']);

let GROUND_TEX = null; const GROUND_MATS = new Map();
// Bodentextur 6 m × 6 m (uv = Weltmeter): heller Grundton nahe Weiß, damit die Farbe der Grünfläche erhalten bleibt;
// darauf Mähspuren, Klee- und Moosflecken, kurze Halmstriche. Mittel ≈ 0,93, deshalb die Grundfarbe leicht angehoben.
function groundTex(THREE) {
  if (GROUND_TEX) return GROUND_TEX;
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  let seed = 0x5eed1234; const r = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let q = Math.imul(seed ^ seed >>> 15, 1 | seed); q = q + Math.imul(q ^ q >>> 7, 61 | q) ^ q; return ((q ^ q >>> 14) >>> 0) / 4294967296; };
  x.fillStyle = 'rgb(236,238,232)'; x.fillRect(0, 0, S, S);
  // Flecken (kachelbar: jeweils mit 8 Nachbarkopien gezeichnet)
  const blob = (px, py, rx, ry, a, col) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { x.fillStyle = col; x.beginPath(); x.ellipse(px + ox, py + oy, rx, ry, a, 0, 7); x.fill(); } };
  for (let i = 0; i < 30; i++) blob(r() * S, r() * S, 30 + r() * 90, 20 + r() * 60, r() * 3, r() < 0.5 ? 'rgba(255,255,200,0.07)' : 'rgba(40,60,20,0.08)');
  for (let i = 0; i < 60; i++) blob(r() * S, r() * S, 4 + r() * 10, 3 + r() * 8, r() * 3, r() < 0.6 ? 'rgba(60,90,30,0.12)' : 'rgba(120,100,50,0.10)');
  // Halmstriche
  x.lineCap = 'round';
  for (let i = 0; i < 9000; i++) { const px = r() * S, py = r() * S, l = 3 + r() * 6, a = -Math.PI / 2 + (r() - 0.5) * 1.2, t = r();
    x.strokeStyle = t < 0.45 ? 'rgba(30,55,15,0.28)' : t < 0.85 ? 'rgba(255,255,230,0.22)' : 'rgba(110,95,50,0.2)'; x.lineWidth = 0.8 + r() * 0.8;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 6, 1 / 6); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.userData = { shared: true };
  return (GROUND_TEX = t);
}

/** Material für eine Rasenfläche (alle Stufen; Geometrie braucht uv in Weltmetern, drape(..., withUV)) */
export function rasenMat(THREE, col) {
  let m = GROUND_MATS.get(col); if (m) return m;
  const c = new THREE.Color(col); c.multiplyScalar(1.07);
  m = new THREE.MeshLambertMaterial({ color: c, map: groundTex(THREE) }); m.userData.shared = true; GROUND_MATS.set(col, m); return m;
}

// Halmkarte wie Sunset lr(): 92 gebogene Halme mit Verlauf dunkel → hell, 8 % gelbliche
function bladeTex(THREE) {
  const W = 256, H = 128, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  let seed = 9917; const r = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let q = Math.imul(seed ^ seed >>> 15, 1 | seed); q = q + Math.imul(q ^ q >>> 7, 61 | q) ^ q; return ((q ^ q >>> 14) >>> 0) / 4294967296; };
  const R = (a, b) => a + (b - a) * r(); const hsl = (h, s, l) => `hsl(${h},${s}%,${l}%)`;
  for (let i = 0; i < 92; i++) {
    const short = i < 41, px = R(0.03, 0.97) * W, len = (short ? R(0.45, 0.8) : R(0.6, 0.98)) * H * (0.72 + 0.28 * Math.sin(px / W * Math.PI));
    const lean = R(-0.32, 0.32) * len, curl = R(-0.25, 0.25) * len, w = W * R(0.006, 0.012), dry = r() < 0.08;
    const h = dry ? R(52, 64) : R(84, 106), s = dry ? R(30, 42) : R(36, 52), l = short ? R(19, 25) : R(25, 33);
    const g = x.createLinearGradient(0, H, 0, H - len); g.addColorStop(0, hsl(h, s * 0.9, l * 0.74)); g.addColorStop(0.35, hsl(h, s, l)); g.addColorStop(1, hsl(h - 6, s * 0.9, l * (dry ? 1.55 : 1.38))); x.fillStyle = g;
    const tx = px + lean + curl, ty = H - len, mx = px + lean * 0.5, my = H - len * 0.55;
    x.beginPath(); x.moveTo(px - w, H); x.quadraticCurveTo(mx - w * 0.8, my, tx, ty); x.quadraticCurveTo(mx + w * 0.8, my, px + w, H); x.closePath(); x.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// Büschel wie Sunset Fr(): drei Karten 1 × 1, um 60° gedreht, Spitze leicht versetzt, Normalen nach oben gekippt (weiches Licht)
function tuftGeo(THREE) {
  const pos = [], nor = [], uv = [], idx = [];
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI + 0.3, co = Math.cos(a), si = Math.sin(a), off = (i % 2 ? -1 : 1) * 0.16, nx = -si, nz = co, b = pos.length / 3;
    for (const [u, v, w] of [[-0.5, 0, 0], [0.5, 0, 0], [0.5, 1, off], [-0.5, 1, off]]) { pos.push(co * u + nx * w, v, si * u + nz * w); const n = new THREE.Vector3(nx * 0.22, 1, nz * 0.22).normalize(); nor.push(n.x, n.y, n.z); uv.push(u + 0.5, v); }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
}

const CELL = 8, BUCKET = 64;
const STUFE = { mittel: { r: 26, d: 5 }, hoch: { r: 38, d: 7 }, ultra: { r: 48, d: 9 } };

/** @param {import('./types').Ctx} X */
export function initRasen(X) {
  const { THREE, scene, camera, opts, TH, solidAt, pointInPoly } = X;
  const tex = bladeTex(THREE);
  const wind = { uTime: { value: 0 }, uFade: { value: new THREE.Vector2(20, 26) }, uWind: { value: 1 } };
  const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.38, side: THREE.DoubleSide });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, wind);
    sh.vertexShader = 'uniform float uTime; uniform vec2 uFade; uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
      { vec3 gO = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float gF = 1.0 - smoothstep(uFade.x, uFade.y, distance(gO.xz, cameraPosition.xz));
        transformed.y *= gF;
        float h = uv.y * uv.y; float ph = gO.x * 0.21 + gO.z * 0.17;
        float sway = sin(uTime * 2.1 + ph) * 0.15 + sin(uTime * 5.0 + ph * 3.7) * 0.03 + 0.08;
        float gust = 0.6 + 0.4 * sin(uTime * 0.7 + gO.x * 0.05 - gO.z * 0.03);
        transformed.x += h * sway * gust * uWind; transformed.z += h * sway * gust * uWind * 0.45; }
      #endif`);
    // Schwarze Flecken (#152 Nachbesserung): DoubleSide dreht auf der Rückseite die Normale um (faceDirection), die nach oben
    // gekippte Halmnormale zeigt dann nach unten und bekommt nur das dunkle Bodenlicht der Hemisphäre. Halme sind dünn,
    // beide Seiten sollen gleich hell sein: Umkehr wieder aufheben (faceDirection² = 1).
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal *= faceDirection;');
  };
  mat.customProgramCacheKey = () => 'rasen-halme';
  const maxCap = Math.round(Math.PI * STUFE.ultra.r ** 2 * STUFE.ultra.d * 0.75);
  let mesh = null, cap = 0;
  function ensureMesh(n) { if (mesh && cap >= n) return; if (mesh) { scene.remove(mesh); mesh.dispose(); } cap = Math.min(maxCap, Math.max(n, 4000));
    mesh = new THREE.InstancedMesh(tuftGeo(THREE), mat, cap); mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true; mesh.name = 'rasen-halme';
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); scene.add(mesh); }

  // Grünflächen-Index: Eimer zu 64 m; WORLD.green wächst beim Nachladen, neue Einträge werden nachgezogen
  const buckets = new Map(); let indexed = 0;
  function index() { const G = X.WORLD.green; for (; indexed < G.length; indexed++) { const g = G[indexed]; if (!RASEN_KINDS.has(g.k)) continue;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of g.p) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    const e = { g, x0, x1, z0, z1, meadow: g.k === 'meadow' || g.k === 'village_green', col: g.k === 'meadow' ? 0x86a85c : g.k === 'grass' || g.k === 'dog_park' ? 0x7aa35a : 0x6f9a52 };
    for (let bx = Math.floor(x0 / BUCKET); bx <= Math.floor(x1 / BUCKET); bx++) for (let bz = Math.floor(z0 / BUCKET); bz <= Math.floor(z1 / BUCKET); bz++) { const k = bx + ',' + bz; if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(e); } } }
  function greenAt(list, x, z) { for (const e of list) if (x >= e.x0 && x <= e.x1 && z >= e.z0 && z <= e.z1 && pointInPoly(x, z, e.g.p)) return e; return null; }
  const free = (x, z) => solidAt(x, z) < 0 && !(X.rasenRoad && X.rasenRoad(x, z)) && !(X.waterAt && X.waterAt(x, z) !== null) && !(X.deckAt && X.deckAt(x, z, 1e9, 0) !== null);

  const cells = new Map(); let pending = [], lastX = 1e9, lastZ = 1e9, dirty = false, stufe = null, dens = 0, rad = 0, total = 0;
  const hash = (a, b) => { let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263); h = Math.imul(h ^ h >>> 13, 1274126177); return h ^ h >>> 16; };
  function buildCell(cx, cz) {
    const x0 = cx * CELL, z0 = cz * CELL, list = buckets.get(Math.floor((x0 + 4) / BUCKET) + ',' + Math.floor((z0 + 4) / BUCKET)); const out = { m: null, c: null, n: 0 }; if (!list) return out;
    // 1-m-Raster: Grünfläche und frei (kein Weg, Haus, Wasser, Brücke)
    const ok = new Array(64); let any = false;
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const x = x0 + i + 0.5, z = z0 + j + 0.5, e = greenAt(list, x, z); ok[j * 8 + i] = e && free(x, z) ? e : null; if (ok[j * 8 + i]) any = true; }
    if (!any) return out;
    const n = Math.round(64 * dens), M = new Float32Array(n * 16), C = new Float32Array(n * 3); let k = 0, s = hash(cx, cz);
    const r = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let q = Math.imul(s ^ s >>> 15, 1 | s); q = q + Math.imul(q ^ q >>> 7, 61 | q) ^ q; return ((q ^ q >>> 14) >>> 0) / 4294967296; };
    const tc = new THREE.Color();
    for (let t = 0; t < n; t++) { const lx = r() * 8, lz = r() * 8, a = r() * Math.PI * 2, sc = 0.75 + r() * 0.55, lv = 0.86 + r() * 0.26; const e = ok[Math.min(7, lz | 0) * 8 + Math.min(7, lx | 0)]; if (!e) continue;
      const x = x0 + lx, z = z0 + lz, y = TH(x, z) + 0.03, patch = 0.5 + 0.5 * Math.sin(x * 0.31 + Math.sin(z * 0.23) * 2.0) * Math.cos(z * 0.27 - x * 0.07);
      const hgt = (e.meadow ? 0.32 + patch * 0.3 : 0.12 + patch * 0.14) * sc, wid = (e.meadow ? 0.55 : 0.5) * sc, co = Math.cos(a) * wid, si = Math.sin(a) * wid, o = k * 16;
      M[o] = co; M[o + 2] = -si; M[o + 5] = hgt; M[o + 8] = si; M[o + 10] = co; M[o + 12] = x; M[o + 13] = y; M[o + 14] = z; M[o + 15] = 1;
      // Tönung zur Flächenfarbe hin (Sunset-Halme sind dunkler als Bornheims Rasen), dazu Helligkeit und Trockenflecken
      tc.setHex(e.col); const dry = (1 - patch) * 0.25, B = 1.7; /* Spieltest 43419847797: Halme ohne Aufhellung deutlich dunkler als der Boden */ C[k * 3] = B * (0.55 + tc.r * 1.2) * lv * (1 + dry * 0.5); C[k * 3 + 1] = B * (0.55 + tc.g * 0.9) * lv * (1 + dry * 0.15); C[k * 3 + 2] = B * (0.55 + tc.b * 1.0) * lv * (1 - dry * 0.25); k++; }
    out.m = M.subarray(0, k * 16); out.c = C.subarray(0, k * 3); out.n = k; return out;
  }
  function assemble() { let n = 0; for (const c of cells.values()) n += c.n; ensureMesh(n); n = Math.min(n, cap); let o = 0; const M = mesh.instanceMatrix.array, C = mesh.instanceColor.array;
    for (const c of cells.values()) { if (!c.n) continue; const take = Math.min(c.n, cap - o); if (take <= 0) break; M.set(c.m.subarray(0, take * 16), o * 16); C.set(c.c.subarray(0, take * 3), o * 3); o += take; }
    mesh.count = o; total = o; mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; dirty = false; }
  function reset() { cells.clear(); pending = []; lastX = lastZ = 1e9; if (mesh) mesh.count = 0; total = 0; }

  function update(dt) {
    const q = opts.quality || 'mittel', st = !opts.rasenForce && (opts.potato || X.WEAK_GPU) ||  X.inPocket && X.inPocket(camera.position.x, camera.position.z) ? null : STUFE[q] || null;
    if (st !== stufe) { stufe = st; reset(); if (st) { dens = st.d; rad = st.r; wind.uFade.value.set(rad * 0.72, rad - 1); } }
    if (mesh) mesh.visible = !!stufe; if (!stufe) return;
    wind.uTime.value += dt; wind.uWind.value = X.weather && X.weather.wind ? 1 + X.weather.wind : (X.weather && X.weather.rain ? 1.6 : 1);
    if (indexed < X.WORLD.green.length) { index(); cells.clear(); lastX = 1e9; }
    const p = camera.position, ccx = Math.floor(p.x / CELL), ccz = Math.floor(p.z / CELL), R = Math.ceil(rad / CELL);
    if (Math.hypot(p.x - lastX, p.z - lastZ) > CELL / 2) { lastX = p.x; lastZ = p.z; pending = [];
      for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) if (Math.hypot(i, j) * CELL <= rad + CELL && !cells.has((ccx + i) + ',' + (ccz + j))) pending.push([ccx + i, ccz + j]);
      pending.sort((a, b) => Math.hypot(b[0] - ccx, b[1] - ccz) - Math.hypot(a[0] - ccx, a[1] - ccz));
      for (const [k, c] of cells) { const [a, b] = k.split(',').map(Number); if (Math.hypot(a - ccx, b - ccz) * CELL > rad + 2 * CELL) { cells.delete(k); dirty = true; } } }
    const t0 = performance.now(); while (pending.length && performance.now() - t0 < 2) { const [a, b] = pending.pop(), k = a + ',' + b; if (!cells.has(k)) { cells.set(k, buildCell(a, b)); dirty = true; } }
    if (dirty && (!pending.length || (performance.now() | 0) % 4 === 0)) assemble();
  }
  return { update, get count() { return total; }, get cells() { return cells.size; }, get stufe() { return stufe ? opts.quality : 'aus'; }, reset };
}

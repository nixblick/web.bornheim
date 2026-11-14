// Rasen (André 13.11.2026: „die coolen sachen aus sunset … der rasen usw.“, Bornheim bleibt realistisch).
// Technik nach Sunset world.js (grass-field): Halmbüschel als drei gekreuzte Karten mit Alpha-Halmen, als InstancedMesh
// in 8-m-Zellen nur rund um die Kamera, zum Rand hin flach ausgeblendet, Wind biegt die Spitzen im Vertex-Shader.
// Für Bornheim angepasst: nur auf echten OSM-Grünflächen (Parks, Wiesen, Gärten, Friedhof), nicht auf Wegen, Häusern,
// Wasser oder Brücken; gemähter Stadtrasen kurz (12–28 cm), Wiese höher. Farben bleiben die der Grünflächen.
// Stufen (opts.rasenForce erzwingt Halme auch bei schwacher GPU, nur für Proben): Niedrig/Sparmodus/schwache GPU nur die Bodentextur (eine Textur mehr, kein Halm), Mittel 32 m, Hoch 44 m, Ultra 56 m.
// Rasen 2 (#152): Halmtextur ohne dunkle Ränder, Randabstand zu Wegen, Wind mit Böenfront nach dem Wetter, zwei Rauschgrößen
// für Farbe und Trockenflecken; nur Hoch/Ultra: Durchscheinen der Halme im Gegenlicht und eine zweite, grobe Bodentextur-Abfrage.

/** Rasenarten, die Halme und die Rasentextur bekommen (Sportplätze, Spielplätze, Parkplätze nicht) */
export const RASEN_KINDS = new Set(['park', 'grass', 'garden', 'meadow', 'allotments', 'dog_park', 'cemetery', 'recreation_ground', 'village_green']);

let GROUND_TEX = null, GROUND_STAT = null, GROUND_FEIN = false; const GROUND_MATS = new Map();
// Mittelwert und Streuung (linear, Grünkanal) der Bodentextur auf grober Stufe (8 × 8 Pixel ≈ Mip 3), damit die zweite Abfrage
// im Schnitt mit 1,0 multipliziert (der Boden wird nicht heller oder dunkler, nur ungleichmäßiger). Erst bei Bedarf (Hoch/Ultra).
function groundStat() {
  if (GROUND_STAT) return GROUND_STAT;
  let m = 0.85, s = 0.02;
  try { const c = GROUND_TEX.image, S = c.width, d = c.getContext('2d').getImageData(0, 0, S, S).data, B = 8, N = S / B, lin = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const v = i / 255; lin[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    const blk = new Float32Array(N * N); let sum = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const g = lin[d[(y * S + x) * 4 + 1]]; blk[((y / B) | 0) * N + ((x / B) | 0)] += g; sum += g; }
    m = sum / (S * S); let q = 0; for (let i = 0; i < N * N; i++) { const v = blk[i] / (B * B) - m; q += v * v; } s = Math.sqrt(q / (N * N));
  } catch (e) { /* Canvas nicht lesbar: Schätzwerte */ }
  return (GROUND_STAT = { m, s: Math.max(s, 0.004) });
}
// Hoch/Ultra: eine zweite Abfrage der Bodentextur im 37-m-Maßstab (grobe Mip-Stufe) bricht die sichtbare 6-m-Wiederholung auf
function groundCompile(sh) {
  if (!GROUND_FEIN) return;
  const st = groundStat(), k = 1 / (4 * st.s);
  sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  #ifdef USE_MAP
  { float gV = textureLod( map, vMapUv * ${(6 / 37).toFixed(5)} + vec2( 0.37, 0.71 ), 3.0 ).g;
    diffuseColor.rgb *= 0.85 + 0.3 * clamp( 0.5 + ( gV - ${st.m.toFixed(5)} ) * ${k.toFixed(4)}, 0.0, 1.0 ); }
  #endif`);
}
function setGroundFein(f) { if (f === GROUND_FEIN) return; GROUND_FEIN = f; for (const m of GROUND_MATS.values()) m.needsUpdate = true; }
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
  m = new THREE.MeshLambertMaterial({ color: c, map: groundTex(THREE) }); m.onBeforeCompile = groundCompile; m.customProgramCacheKey = () => GROUND_FEIN ? 'rasen-boden-fein' : 'rasen-boden';
  m.userData.shared = true; GROUND_MATS.set(col, m); return m;
}

// Halmkarte wie Sunset lr(): 92 gebogene Halme mit Verlauf dunkel → hell, 8 % gelbliche. Hoch/Ultra 512 × 256, Mittel 256 × 128.
function bladeTex(THREE, gross, aniso) {
  const W = gross ? 512 : 256, H = gross ? 256 : 128, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
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
  // Dunkle Säume: durchsichtige Pixel sind schwarz (0,0,0,0), beim Mipmapping färben sie die Halmränder dunkel. Deshalb
  // fast durchsichtige Pixel auf das mittlere Grün setzen (Alpha 0) und die Textur selbst aus den Daten bauen; dabei die
  // Zeilen umdrehen (Canvas oben = Halmspitze = v 1, wie zuvor bei CanvasTexture mit flipY).
  const src = x.getImageData(0, 0, W, H).data, out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) { const so = y * W * 4, oo = (H - 1 - y) * W * 4;
    for (let i = 0; i < W * 4; i += 4) { const a = src[so + i + 3];
      if (a < 24) { out[oo + i] = 70; out[oo + i + 1] = 92; out[oo + i + 2] = 40; out[oo + i + 3] = 0; }
      else { out[oo + i] = src[so + i]; out[oo + i + 1] = src[so + i + 1]; out[oo + i + 2] = src[so + i + 2]; out[oo + i + 3] = a; } } }
  const t = new THREE.DataTexture(out, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.anisotropy = aniso; t.needsUpdate = true; return t;
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
// Radius und Dichte je m². Mittel darf nicht mehr Büschel bekommen als vorher (26 m × 5/m²): 32² × 3,3 ≤ 26² × 5,
// auch mit dem Zellrand (40² × 3,3 ≤ 34² × 5). Hoch/Ultra wie im Sunset-Vergleich.
const STUFE = { mittel: { r: 32, d: 3.3 }, hoch: { r: 44, d: 5.5 }, ultra: { r: 56, d: 6.5 } };
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

/** @param {import('./types').Ctx} X */
export function initRasen(X) {
  const { THREE, scene, camera, opts, TH, solidAt, pointInPoly } = X;
  let tex = null, texKey = '', licht = false, windStr = 0.4;
  const wind = { uTime: { value: 0 }, uFade: { value: new THREE.Vector2(20, 26) }, uWindDir: { value: new THREE.Vector2(1, 0) }, uWindStr: { value: 0.4 } };
  const mat = new THREE.MeshLambertMaterial({ map: null, alphaTest: 0.38, side: THREE.DoubleSide });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, wind);
    // Wind: zwei Sinus je Büschel (eigene Phase und Frequenz aus der Weltlage) plus etwas quer, darüber eine wandernde Böenfront
    // in Windrichtung. Biegung wächst mit (Höhe am Halm)^1,4; die Spitze sinkt dabei auf einem Bogen ab, statt den Halm zu dehnen.
    // Rechnung in Weltmetern, Rückweg in die Büschel-Koordinaten über die Spalten der Instanzmatrix (stehen senkrecht aufeinander).
    sh.vertexShader = 'uniform float uTime; uniform vec2 uFade; uniform vec2 uWindDir; uniform float uWindStr;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
      { vec3 gO = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float gF = 1.0 - smoothstep(uFade.x, uFade.y, distance(gO.xz, cameraPosition.xz));
        transformed.y *= gF;
        vec3 gC0 = instanceMatrix[0].xyz; vec3 gC1 = instanceMatrix[1].xyz; vec3 gC2 = instanceMatrix[2].xyz;
        float gPh = fract(sin(dot(floor(gO.xz * 8.0), vec2(12.9898, 78.233))) * 43758.5453) * 6.2831;
        float gFr = 2.1 * (0.85 + 0.3 * fract(gPh * 0.37));
        float gOsc = sin(uTime * gFr + gPh) * 0.62 + sin(uTime * gFr * 2.31 + gPh * 1.7) * 0.26;
        float gQuer = sin(uTime * gFr * 1.43 + gPh * 2.9) * (0.03 + 0.03 * uWindStr);
        float gBoe = 0.5 + 0.5 * sin(dot(gO.xz, uWindDir) * 0.045 - uTime * (0.6 + 1.4 * uWindStr));
        float gAlong = uWindStr * (0.1 + 0.16 * gBoe) + (0.06 + 0.07 * uWindStr) * gOsc * (0.6 + 0.4 * gBoe);
        float gHb = pow(clamp(uv.y, 0.0, 1.0), 1.4) * length(gC1) * gF;
        vec2 gD = (uWindDir * gAlong + vec2(-uWindDir.y, uWindDir.x) * gQuer) * gHb;
        float gHz = length(gD); float gY = transformed.y * length(gC1);
        vec3 gW = vec3(gD.x, -min(0.5 * gHz, gHz * gHz / (2.0 * max(gY, 0.05))), gD.y);
        transformed += vec3(dot(gC0, gW) / dot(gC0, gC0), dot(gC1, gW) / dot(gC1, gC1), dot(gC2, gW) / dot(gC2, gC2)); }
      #endif`);
    // Schwarze Flecken (#152 Nachbesserung): DoubleSide dreht auf der Rückseite die Normale um (faceDirection), die nach oben
    // gekippte Halmnormale zeigt dann nach unten und bekommt nur das dunkle Bodenlicht der Hemisphäre. Halme sind dünn,
    // beide Seiten sollen gleich hell sein: Umkehr wieder aufheben (faceDirection² = 1).
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal *= faceDirection;');
    // Nur Hoch/Ultra: Licht scheint durch die Halme (Gegenlicht, leicht gelblich) und etwas Rücklicht; über RE_Direct, damit
    // Schatten und Straßenlaternen mitwirken. Mittel behält das einfache Material.
    if (licht) sh.fragmentShader = sh.fragmentShader.replace('#include <lights_lambert_pars_fragment>', `#include <lights_lambert_pars_fragment>
void RE_Direct_Rasen( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  RE_Direct_Lambert( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
  float gT = 0.08 * pow( max( dot( geometryViewDir, - directLight.direction ), 0.0 ), 4.0 ) + 0.06;
  reflectedLight.directDiffuse += directLight.color * material.diffuseColor * vec3( 1.08, 1.12, 0.7 ) * gT;
}
#undef RE_Direct
#define RE_Direct RE_Direct_Rasen`);
  };
  mat.customProgramCacheKey = () => licht ? 'rasen-halme-licht' : 'rasen-halme';
  // Halmtextur je Stufe (Größe, Anisotropie); Wechsel baut das Programm neu (licht steckt im Schlüssel)
  function setLook(q) { const gross = q === 'hoch' || q === 'ultra', key = (gross ? 'g' : 'k') + (q === 'ultra' ? 8 : 4);
    if (key !== texKey) { if (tex) tex.dispose(); tex = bladeTex(THREE, gross, q === 'ultra' ? 8 : 4); texKey = key; mat.map = tex; mat.needsUpdate = true; }
    if (gross !== licht) { licht = gross; mat.needsUpdate = true; } }
  const maxCap = Math.round(Math.PI * STUFE.ultra.r ** 2 * STUFE.ultra.d * 0.75);
  // Eine Büschel-Geometrie für alle Neuanlagen (mesh.dispose() gibt nur die Instanzpuffer frei, die Geometrie blieb sonst je Wachstum liegen);
  // Platz wächst in Schritten von 50 %, damit nicht fast jedes assemble() ein neues InstancedMesh samt MB-großer Arrays anlegt.
  const geo = tuftGeo(THREE);
  let mesh = null, cap = 0, lastAsm = 0;
  function ensureMesh(n) { if (mesh && (cap >= n || cap >= maxCap)) return; /* an der Obergrenze nicht bei jedem Zusammenbau neu anlegen */ if (mesh) { scene.remove(mesh); mesh.dispose(); } cap = Math.min(maxCap, Math.max(4000, Math.ceil(n * 1.5)));
    mesh = new THREE.InstancedMesh(geo, mat, cap); mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true; mesh.name = 'rasen-halme';
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); scene.add(mesh); }

  // Grünflächen-Index: Eimer zu 64 m. WORLD.green wächst beim Nachladen und wird beim Entladen ferner Kacheln in Ort gekürzt,
  // ein Zähler „bis hier indexiert“ stimmt danach nicht mehr (Halme fehlten nach einer Reise, alte Flächen blieben in den Eimern).
  // Deshalb bei jeder Änderung (WORLD.greenVer aus register-/unregisterTile, zur Sicherheit auch die Länge) den ganzen Index neu.
  const buckets = new Map(); let seenVer = -1, seenLen = -1, gen = 0;
  function index() { buckets.clear(); for (const g of X.WORLD.green) { if (!RASEN_KINDS.has(g.k)) continue;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of g.p) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    const e = { g, x0, x1, z0, z1, meadow: g.k === 'meadow' || g.k === 'village_green', col: g.k === 'meadow' ? 0x86a85c : g.k === 'grass' || g.k === 'dog_park' ? 0x7aa35a : 0x6f9a52 };
    for (let bx = Math.floor(x0 / BUCKET); bx <= Math.floor(x1 / BUCKET); bx++) for (let bz = Math.floor(z0 / BUCKET); bz <= Math.floor(z1 / BUCKET); bz++) { const k = bx + ',' + bz; if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(e); } } }
  function greenAt(list, x, z) { for (const e of list) if (x >= e.x0 && x <= e.x1 && z >= e.z0 && z <= e.z1 && pointInPoly(x, z, e.g.p)) return e; return null; }
  const free = (x, z) => solidAt(x, z) < 0 && !(X.rasenRoad && X.rasenRoad(x, z)) && !(X.waterAt && X.waterAt(x, z) !== null) && !(X.deckAt && X.deckAt(x, z, 1e9, 0) !== null);

  const cells = new Map(); let pending = [], lastX = 1e9, lastZ = 1e9, dirty = false, stufe = null, dens = 0, rad = 0, total = 0;
  const hash = (a, b) => { let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263); h = Math.imul(h ^ h >>> 13, 1274126177); return h ^ h >>> 16; };
  // Wertrauschen (glatt zwischen Gitterpunkten) für Höhe, Farbe und Trockenflecken
  const vh = (a, b) => (hash(a, b) >>> 0) / 4294967296;
  function vnoise(x, z) { const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    const a = vh(ix, iz), b = vh(ix + 1, iz), c = vh(ix, iz + 1), d = vh(ix + 1, iz + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
  function buildCell(cx, cz) {
    const x0 = cx * CELL, z0 = cz * CELL, list = buckets.get(Math.floor((x0 + 4) / BUCKET) + ',' + Math.floor((z0 + 4) / BUCKET)); const out = { m: null, c: null, n: 0, v: gen, cx, cz }; if (!list) return out;
    // 1-m-Raster: Grünfläche und frei (kein Weg, Haus, Wasser, Brücke); mit einem Feld Rand rundum (10 × 10, Index +1),
    // damit Büschel am Zellrand den Nachbarn kennen. Randfelder können in einem anderen 64-m-Eimer liegen.
    const ok = new Array(100).fill(null); let any = false;
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const x = x0 + i + 0.5, z = z0 + j + 0.5, e = greenAt(list, x, z); ok[(j + 1) * 10 + i + 1] = e && free(x, z) ? e : null; if (ok[(j + 1) * 10 + i + 1]) any = true; }
    if (!any) return out;
    for (let j = -1; j <= 8; j++) for (let i = -1; i <= 8; i++) { if (i >= 0 && i <= 7 && j >= 0 && j <= 7) continue;
      const x = x0 + i + 0.5, z = z0 + j + 0.5, l = buckets.get(Math.floor(x / BUCKET) + ',' + Math.floor(z / BUCKET)), e = l ? greenAt(l, x, z) : null; ok[(j + 1) * 10 + i + 1] = e && free(x, z) ? e : null; }
    const okAt = (i, j) => ok[(j + 1) * 10 + i + 1];
    const n = Math.round(64 * dens), M = new Float32Array(n * 16), C = new Float32Array(n * 3); let k = 0, s = hash(cx, cz);
    const r = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let q = Math.imul(s ^ s >>> 15, 1 | s); q = q + Math.imul(q ^ q >>> 7, 61 | q) ^ q; return ((q ^ q >>> 14) >>> 0) / 4294967296; };
    const tc = new THREE.Color();
    for (let t = 0; t < n; t++) { const lx = r() * 8, lz = r() * 8, a = r() * Math.PI * 2, sc = 0.75 + r() * 0.55, lv = 0.86 + r() * 0.26, ix = Math.min(7, lx | 0), iz = Math.min(7, lz | 0); const e = okAt(ix, iz); if (!e) continue;
      // Randabstand: liegt ein Nicht-Rasen-Feld (Weg, Haus, Wasser, Straße) näher als 0,35 m, kein Büschel (nichts hängt über Bordsteine)
      const fx = lx - ix, fz = lz - iz, sx = fx < 0.35 ? -1 : fx > 0.65 ? 1 : 0, sz = fz < 0.35 ? -1 : fz > 0.65 ? 1 : 0, ex = sx < 0 ? fx : 1 - fx, ez = sz < 0 ? fz : 1 - fz;
      if (sx && !okAt(ix + sx, iz)) continue; if (sz && !okAt(ix, iz + sz)) continue; if (sx && sz && ex * ex + ez * ez < 0.1225 && !okAt(ix + sx, iz + sz)) continue;
      const x = x0 + lx, z = z0 + lz, y = TH(x, z) + 0.03, patch = 0.55 * vnoise(x / 11, z / 11) + 0.45 * vnoise(x / 37 + 91.7, z / 37 - 53.3);
      // Trockenflecken: Anteil ≈ 22 % auf kurzem Stadtrasen, ≈ 50 % auf Wiesen (Schwelle nach der Streuung des Rauschens geschätzt)
      const share = e.meadow ? 0.5 : 0.22, thr = 0.5 + (0.5 - share) * 0.4, dn = 0.4 * vnoise(x / 11 + 17.3, z / 11 + 41.9) + 0.6 * vnoise(x / 37 - 23.1, z / 37 + 7.7), dryP = smooth(thr - 0.04, thr + 0.06, dn);
      const hgt = (e.meadow ? 0.32 + patch * 0.3 : 0.12 + patch * 0.14) * sc * (1 - 0.15 * dryP), wid = (e.meadow ? 0.55 : 0.5) * sc, co = Math.cos(a) * wid, si = Math.sin(a) * wid, o = k * 16;
      M[o] = co; M[o + 2] = -si; M[o + 5] = hgt; M[o + 8] = si; M[o + 10] = co; M[o + 12] = x; M[o + 13] = y; M[o + 14] = z; M[o + 15] = 1;
      // Tönung zur Flächenfarbe hin (Sunset-Halme sind dunkler als Bornheims Rasen), dazu Helligkeit und Trockenflecken
      tc.setHex(e.col); const dry = dryP * 0.38 + (1 - patch) * 0.06, B = 1.7; /* Spieltest 43419847797: Halme ohne Aufhellung deutlich dunkler als der Boden */ C[k * 3] = B * (0.55 + tc.r * 1.2) * lv * (1 + dry * 0.5); C[k * 3 + 1] = B * (0.55 + tc.g * 0.9) * lv * (1 + dry * 0.15); C[k * 3 + 2] = B * (0.55 + tc.b * 1.0) * lv * (1 - dry * 0.25); k++; }
    out.m = M.subarray(0, k * 16); out.c = C.subarray(0, k * 3); out.n = k; return out;
  }
  function assemble() { let n = 0; for (const c of cells.values()) n += c.n; ensureMesh(n); const liste = [...cells.values()];
    // mehr Halme als Platz: die nächsten Zellen zuerst, sonst fehlt der Rasen direkt vor der Kamera
    if (n > cap) { const p = camera.position, qx = p.x / CELL, qz = p.z / CELL; liste.sort((a, b) => ((a.cx - qx) ** 2 + (a.cz - qz) ** 2) - ((b.cx - qx) ** 2 + (b.cz - qz) ** 2)); }
    n = Math.min(n, cap); let o = 0; const M = mesh.instanceMatrix.array, C = mesh.instanceColor.array;
    for (const c of liste) { if (!c.n) continue; const take = Math.min(c.n, cap - o); if (take <= 0) break; M.set(c.m.subarray(0, take * 16), o * 16); C.set(c.c.subarray(0, take * 3), o * 3); o += take; }
    mesh.count = o; total = o; dirty = false; lastAsm = performance.now(); if (!o) return;
    // nur den belegten Teil hochladen, nicht den ganzen Puffer bis cap
    mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceMatrix.addUpdateRange(0, o * 16); mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.clearUpdateRanges(); mesh.instanceColor.addUpdateRange(0, o * 3); mesh.instanceColor.needsUpdate = true; }
  function reset() { cells.clear(); pending = []; lastX = lastZ = 1e9; if (mesh) mesh.count = 0; total = 0; }

  function update(dt) {
    const q = opts.quality || 'mittel', schwach = !opts.rasenForce && (opts.potato || X.WEAK_GPU), st = schwach ||  X.inPocket && X.inPocket(camera.position.x, camera.position.z) ? null : STUFE[q] || null;
    setGroundFein(!schwach && (q === 'hoch' || q === 'ultra')); // zweite Bodentextur-Abfrage nur Hoch/Ultra auf starker GPU
    if (st !== stufe) { stufe = st; reset(); if (st) { dens = st.d; rad = st.r; wind.uFade.value.set(rad * 0.72, rad - 1); setLook(q); } }
    if (mesh) mesh.visible = !!stufe; if (!stufe) return;
    // Windstärke aus dem Wetter (wetter.js: kind, rain 0–1), Regen und Sturm bewegen den Rasen deutlich mehr; weich nachgeführt.
    // Das Wetter kennt keine Windrichtung: Richtung dreht sich langsam.
    const W = X.weather, kind = W && W.kind, ziel = 0.35 + (W ? (W.rain || 0) * 0.55 + (kind === 'storm' ? 0.65 : kind === 'rain' ? 0.15 : kind === 'cloudy' ? 0.1 : 0) : 0);
    windStr += (ziel - windStr) * Math.min(1, dt * 0.25); wind.uWindStr.value = windStr;
    const tw = wind.uTime.value += dt, wa = 0.9 + Math.sin(tw * 0.011) * 0.9 + Math.sin(tw * 0.031) * 0.35; wind.uWindDir.value.set(Math.cos(wa), Math.sin(wa));
    // Index geändert: Zellen nicht leeren (Rasen verschwand kurz und wuchs neu), sondern stehen lassen und nach und nach ersetzen (c.v = Stand)
    if (seenVer !== (X.WORLD.greenVer | 0) || seenLen !== X.WORLD.green.length) { seenVer = X.WORLD.greenVer | 0; seenLen = X.WORLD.green.length; index(); gen++; lastX = 1e9; }
    const p = camera.position, ccx = Math.floor(p.x / CELL), ccz = Math.floor(p.z / CELL), R = Math.ceil(rad / CELL);
    if (Math.hypot(p.x - lastX, p.z - lastZ) > CELL / 2) { lastX = p.x; lastZ = p.z; pending = [];
      for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) if (Math.hypot(i, j) * CELL <= rad + CELL) { const c = cells.get((ccx + i) + ',' + (ccz + j)); if (!c || c.v !== gen) pending.push([ccx + i, ccz + j]); }
      pending.sort((a, b) => Math.hypot(b[0] - ccx, b[1] - ccz) - Math.hypot(a[0] - ccx, a[1] - ccz));
      for (const [k, c] of cells) { const [a, b] = k.split(',').map(Number); if (Math.hypot(a - ccx, b - ccz) * CELL > rad + 2 * CELL) { cells.delete(k); dirty = true; } } }
    const t0 = performance.now(); while (pending.length && performance.now() - t0 < 2) { const [a, b] = pending.pop(), k = a + ',' + b, c = cells.get(k); if (!c || c.v !== gen) { cells.set(k, buildCell(a, b)); dirty = true; } }
    if (dirty && (!pending.length || t0 - lastAsm > 200)) assemble(); // Zwischenstände im Takt statt zufällig in jedem vierten Bild
  }
  return { update, get count() { return total; }, get cells() { return cells.size; }, get stufe() { return stufe ? opts.quality : 'aus'; }, reset };
}

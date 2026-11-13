import { disposeHierarchy } from './dispose.js';
// Wahrzeichen der Innenstadt nach Wikipedia (#73, André 12.11.2026): Alte Oper, Römer, Kaiserdom, Paulskirche und die
// Hochhäuser. Vorbild landmarks.js: je Bau eine Gruppe aus wenigen Grundkörpern und eine Canvas-Textur, gebaut erst in
// Spielernähe, beim Weggehen mit dispose wieder abgebaut. Lage und Größe kommen aus dem OSM-Footprint (data/tiles), den
// game.js über markLandmark() an dieses Modul gibt; der generische Klotz wird dann nicht gezeichnet (b.lm), die Kollision
// bleibt. Lokales Modellsystem: Front zeigt nach +z, Breite entlang x, Ursprung = Mitte der umschließenden Box am Boden.
// Messeturm fehlt hier mit Absicht: game.js hat für ihn schon Krone, Zylinder und Pyramide (kindOf 'messeturm').

// n = OSM-Name, c = ungefährer Mittelpunkt (unterscheidet gleichnamige Bauten), h = Kollisionshöhe (Traufe/Dach),
// t = Punkt, zu dem die Front zeigt, r = Bauradius in m
const LIST = [
  // https://de.wikipedia.org/wiki/Alte_Oper – Neorenaissance (Richard Lucae, 1880), heller Sandstein, grüne Kupfer-Mansarddächer,
  // Mittelrisalit mit Bögen, Inschrift „DEM WAHREN SCHÖNEN GUTEN“, Pegasus auf dem Giebel, Goethe und Mozart an der Front; Front zum Opernplatz
  { id: 'oper', n: 'Alte Oper', c: [-2688, 1491], h: 20, t: [-2665, 1585], r: 900 },
  // https://de.wikipedia.org/wiki/R%C3%B6mer_(Frankfurt_am_Main) – drei Stufengiebel am Römerberg (Alt-Limpurg, Zum Römer, Löwenstein), Balkon, Uhr
  { id: 'roemer', n: 'Alt-Limpurg / Laderam', c: [-2008, 2121], h: 12, t: [-1960, 2121], r: 700, col: '#d8b48a' },
  { id: 'roemer', n: 'Haus zum Römer', c: [-2005, 2109], h: 12, t: [-1960, 2109], r: 700, col: '#b85a48', uhr: 1 },
  { id: 'roemer', n: 'Haus Löwenstein', c: [-2000, 2098], h: 12, t: [-1960, 2098], r: 700, col: '#c9826a' },
  // https://de.wikipedia.org/wiki/Frankfurter_Dom – roter Mainsandstein, angesetzter gotischer Westturm 95 m mit Kuppelhelm und Laterne, Querhaus 64 m
  { id: 'dom', n: 'Kaiserdom St. Bartholomäus', c: [-1735, 2087], h: 22, t: [-1900, 2087], r: 1100 },
  // https://de.wikipedia.org/wiki/Paulskirche_(Frankfurt_am_Main) – Ellipse ca. 40 × 30 m, Traufe 28 m, quadratischer Turm an der Südseite,
  // flaches Kupferdach (Wiederaufbau 1948), roter Mainsandstein
  { id: 'pauls', n: 'Paulskirche', c: [-2066, 2031], h: 28, t: [-2066, 2200], r: 900 },
  // https://de.wikipedia.org/wiki/Eschenheimer_Turm (#92) – „bis zur Oberkante des Turmknaufes 48 m hoch“, Rundturm 10,20–10,28 m
  // Durchmesser, auskragender Wehrgang in 31 m Höhe, vier gleiche Scharwachttürmchen, steiler Helm. OSM (data/tiles/-5_2.json) hatte h 16.
  // Ohne Quelle und daher geschätzt: Auskragung des Wehrgangs, Maße der Türmchen, Steinfarbe (der Artikel nennt keine).
  { id: 'eschenheim', n: 'Eschenheimer Turm', c: [-2138, 1389], h: 31, t: null, r: 900 },
  // Hochhäuser: https://de.wikipedia.org/wiki/Liste_der_Hochh%C3%A4user_in_Frankfurt_am_Main (Höhen) und die Artikel je Turm
  // Commerzbank Tower: dreieckig mit gerundeten Ecken, Himmelsgärten, 259 m, Antenne bis 300 m
  { id: 'coba', n: 'Commerzbank Tower', c: [-2518, 2025], h: 259, t: null, r: 1800 },
  // Main Tower: runder Glasturm 200 m, Antenne bis 240 m, daneben der eckige Steinturm
  { id: 'main', n: 'Main Tower', c: [-2675, 1880], h: 200, t: null, r: 1800 },
  // Westend Tower (Westendstraße 1, „Kronenhochhaus“): 208 m, Krone aus Strahlen auf dem Dach
  { id: 'westend', n: 'Westend Tower', c: [-3374, 2098], h: 208, t: null, r: 1800 },
  // Eurotower: 148 m, Quader mit Bandfenstern
  { id: 'euro', n: 'Eurotower', c: [-2550, 2211], h: 148, t: null, r: 1500 },
  // Trianon: 186 m, dreieckiger Grundriss, auf die Spitze gestellte Pyramide als Kopf
  { id: 'trianon', n: 'Trianon', c: [-3062, 1858], h: 186, t: null, r: 1800 },
  // Messeturm (https://de.wikipedia.org/wiki/Messeturm): 257 m, rotbrauner Granit, quadratischer Schaft, Glaszylinder unter der Pyramidenspitze.
  // Seit 13.11.2026 hier statt im Kachelbau (game.js kindOf 'messeturm'), damit er wie die Skyline bis 2 km steht, auch wenn seine Kachel nicht gebaut ist.
  { id: 'messe', n: 'Messeturm', c: [-4061, 1898], h: 257, t: null, r: 2000 },
];

function centroid(p) { let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } return [x / p.length, z / p.length]; }
// kleinste umschließende Box über alle Kantenrichtungen
function obox(p) {
  let best = null;
  for (let i = 0; i < p.length; i++) {
    const [ax, az] = p[i], [bx, bz] = p[(i + 1) % p.length]; const l = Math.hypot(bx - ax, bz - az); if (l < 0.5) continue;
    const ux = (bx - ax) / l, uz = (bz - az) / l, vx = -uz, vz = ux; let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (const [x, z] of p) { const u = x * ux + z * uz, v = x * vx + z * vz; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const a = (u1 - u0) * (v1 - v0); if (!best || a < best.a) { const um = (u0 + u1) / 2, vm = (v0 + v1) / 2; best = { a, ux, uz, vx, vz, L: u1 - u0, W: v1 - v0, cx: um * ux + vm * vx, cz: um * uz + vm * vz }; }
  }
  return best;
}

// Nachttest 12.11.2026: Bei Dom, Paulskirche und den Hochhäusern ist das Modell kleiner als der OSM-Grundriss, die
// Kollision stand bis 22 m vor der sichtbaren Wand. Seit 13.11. (#73) bekommt b.p den Grundriss des Modells (core),
// der OSM-Umriss bleibt in e.p0 für Lage und Maß des Modells. markLandmark läuft vor registerTile, Raster und Entladen sehen nur den Kern.
function frame(e, p) {
  const ob = obox(p); if (!ob) return null;
  let fx = ob.vx, fz = ob.vz;
  if (e.t) { let bd = -1e9; for (const [dx, dz] of [[ob.ux, ob.uz], [-ob.ux, -ob.uz], [ob.vx, ob.vz], [-ob.vx, -ob.vz]]) { const d = (e.t[0] - ob.cx) * dx + (e.t[1] - ob.cz) * dz; if (d > bd) { bd = d; fx = dx; fz = dz; } } }
  const alongU = Math.abs(fx * ob.ux + fz * ob.uz) > 0.5; return { ob, fx, fz, W: alongU ? ob.W : ob.L, D: alongU ? ob.L : ob.W };
}
const ring = (rx, rz, z0 = 0, n = 20, a0 = 0, a1 = Math.PI * 2) => { const q = []; for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * i / (a1 - a0 >= 6.28 ? n : n - 1); q.push([rx * Math.sin(a), z0 + rz * Math.cos(a)]); } return q; };
const rect = (w, d, z0 = 0) => [[-w / 2, z0 - d / 2], [w / 2, z0 - d / 2], [w / 2, z0 + d / 2], [-w / 2, z0 + d / 2]];
const tri = (R, rot) => [0, 1, 2].map(i => { const a = i * 2 * Math.PI / 3 + rot; return [R * Math.sin(a), R * Math.cos(a)]; });
// Vereinigung konvexer Teile, sternförmig um (ox, oz): je Strahl die Austrittsstelle per Halbierung (inside = Punkt im Modell)
function star(inside, ox, oz, R, n = 96) { const q = []; for (let i = 0; i < n; i++) { const a = i * 2 * Math.PI / n, dx = Math.sin(a), dz = Math.cos(a); let lo = 0, hi = R;
  for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (inside(ox + dx * m, oz + dz * m)) lo = m; else hi = m; } q.push([ox + dx * lo, oz + dz * lo]); } return q; }
// Kern je Bau im Modellsystem (Front +z), gleiche Maße wie mk(); Rückgabe [Polygon, Kollisionshöhe]
// Nachttest 13.11.2026: Alte Oper und Römer bekommen den Kasten des Modells (OSM-Umriss war bis 9 m kleiner), der Dom den
// schmaleren Westturm, die Paulskirche ihren Turm, der Main Tower Zylinder plus Steinturm statt Rechteck (8 m unsichtbare Wand).
function core(e, W, D) {
  const H = e.h, r = Math.min(W, D) / 2;
  if (e.id === 'oper') { const rw = W * 0.44, a = W / 2, f = rw / 2, z2 = D / 2 + 4.9; // Hauptkörper und Mittelrisalit
    return [[[-a, -D / 2], [a, -D / 2], [a, D / 2], [f, D / 2], [f, z2], [-f, z2], [-f, D / 2], [-a, D / 2]], 20]; }
  if (e.id === 'roemer') return [rect(W, D), 12];
  if (e.id === 'dom') { const nw = Math.min(W * 0.42, 26), zq = -D * 0.05, a = nw / 2, b = W / 2, zt = D / 2 - 18, t = 9.5; // Langhaus, Querhaus 11 m, Westturm 19 × 19 m (Front bei D/2 + 0,5 wie mk)
    return [[[-a, -D / 2], [a, -D / 2], [a, zq - 5.5], [b, zq - 5.5], [b, zq + 5.5], [a, zq + 5.5], [a, zt], [t, zt], [t, D / 2 + 0.5], [-t, D / 2 + 0.5], [-t, zt], [-a, zt], [-a, zq + 5.5], [-b, zq + 5.5], [-b, zq - 5.5], [-a, zq - 5.5]], 23]; }
  if (e.id === 'pauls') { const rx = Math.min(20, W / 2), rz = 15, z0 = -D / 2 + rz + 0.5, tz = Math.min(D / 2 - 5, z0 + rz + 3);
    const inside = (x, z) => ((x / rx) ** 2 + ((z - z0) / rz) ** 2 <= 1) || (Math.abs(x) <= 5.5 && Math.abs(z - tz) <= 5.5);
    return [star(inside, 0, Math.max(z0, tz - 5), 60), 28]; }
  if (e.id === 'eschenheim') return [ring(5.1, 5.1), 31]; // Rundturm bis zum Wehrgang wie mk()
  if (e.id === 'coba') return [tri(r * 1.12, Math.PI / 6), H];
  if (e.id === 'trianon') return [tri(r * 1.1, Math.PI / 6), H - 22];
  if (e.id === 'main') { const rr = Math.min(r, D / 2) * 0.95, zc = D / 2 - rr, hw = W * 0.45, z0 = -D / 2 - 2, z1 = zc - rr + 4; // Glaszylinder und Steinturm wie mk()
    const inside = (x, z) => (x * x + (z - zc) ** 2 <= rr * rr) || (Math.abs(x) <= hw && z >= z0 && z <= z1);
    return [star(inside, 0, Math.min(z1, zc) - 1, Math.max(W, D) + 10), H]; }
  if (e.id === 'messe') return [rect(W * 0.95, D * 0.95), 170];
  if (e.id === 'westend') return [rect(W * 0.85, D * 0.85), H - 16];
  if (e.id === 'euro') return [rect(W * 0.9, D * 0.75), H];
  return null;
}
export function markLandmark(b) {
  if (!b || !b.n || !b.p) return;
  for (const e of LIST) if (e.n === b.n) { const [x, z] = centroid(b.p); if (Math.hypot(x - e.c[0], z - e.c[1]) > 80) continue;
    e.p0 = b.p; const fr = frame(e, b.p); const c = fr && core(e, fr.W, fr.D); b.lm = e.id; b.h = e.h; e.b = b;
    if (c) { const { ob, fx, fz } = fr, co = fz, si = fx; b.p = c[0].map(([lx, lz]) => [ob.cx + lx * co + lz * si, ob.cz - lx * si + lz * co]); b.h = c[1]; b.r = 0; b.rh = 0; }
    return; }
}

/** @param {import('./types').Ctx} X */
export function initWahrzeichen(X) {
  const { THREE, scene, player, TH, canvasTex, world } = X;
  const built = new Map(); let scanT = 0; let lastNight = null;

  function mk(e) {
    // Front: die Achse, die am meisten zum Zielpunkt zeigt; ohne Ziel die lange Achse (frame)
    const fr = frame(e, e.p0); if (!fr) return null; const { ob, fx, fz, W, D } = fr;
    let y0 = 1e9; for (const [x, z] of e.p0) y0 = Math.min(y0, TH(x, z));
    const mats = [];
    const M = (col, o = {}) => { const m = new THREE.MeshLambertMaterial(Object.assign({ color: col, emissive: col, emissiveIntensity: 0.05, fog: false }, o)); m.userData.c0 = m.color.clone(); m.userData.e0 = m.emissive.clone(); mats.push(m); return m; };
    const T = (w, h, draw, rx = 1, ry = 1) => { const t = canvasTex(w, h, draw, rx, ry); const m = M(0xffffff, { map: t, emissive: 0xffe2b8, emissiveMap: t }); return m; };
    const g = new THREE.Group(); const add = (geo, m, x = 0, y = 0, z = 0, ry = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
    const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    // vierseitiges Mansard-/Walmdach als Pyramidenstumpf über w × d
    const mansard = (w, h, d, k) => { const c = new THREE.CylinderGeometry(Math.SQRT1_2 * k, Math.SQRT1_2, h, 4, 1); c.rotateY(Math.PI / 4); c.scale(w, 1, d); return c; };
    const prism = (w, h, d) => { const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]); const x = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }); x.translate(0, 0, -d / 2); return x; };
    const kupfer = M(0x5e9c86), sand = M(0xe2d3b4);

    if (e.id === 'oper') {
      const fac = T(512, 256, (c, w, h) => { c.fillStyle = '#e4d6b8'; c.fillRect(0, 0, w, h); c.fillStyle = '#cdbd9a'; c.fillRect(0, h * 0.46, w, 8); c.fillRect(0, h - 14, w, 14);
        for (let i = 0; i < 8; i++) { const x = 18 + i * 62; c.fillStyle = '#4b5560'; c.fillRect(x, h * 0.6, 26, 60); c.beginPath(); c.arc(x + 13, h * 0.6, 13, Math.PI, 0); c.fill(); c.fillRect(x + 2, 34, 22, 50); c.fillStyle = '#d3c39f'; c.fillRect(x - 10, 26, 6, 200); } }, 3, 1);
      const ris = T(512, 512, (c, w, h) => { c.fillStyle = '#e8dbbf'; c.fillRect(0, 0, w, h); c.fillStyle = '#d0bf9b'; for (let i = 0; i < 6; i++) c.fillRect(30 + i * 88, 90, 18, h - 90);
        c.fillStyle = '#3d4650'; for (let i = 0; i < 3; i++) { const x = 70 + i * 140; c.fillRect(x, 300, 90, 190); c.beginPath(); c.arc(x + 45, 300, 45, Math.PI, 0); c.fill(); c.fillRect(x + 10, 130, 70, 110); c.beginPath(); c.arc(x + 45, 130, 35, Math.PI, 0); c.fill(); }
        c.fillStyle = '#cbb893'; c.fillRect(0, 34, w, 46); c.fillStyle = '#5b4a2e'; c.font = 'bold 30px serif'; c.textAlign = 'center'; c.fillText('DEM WAHREN SCHÖNEN GUTEN', w / 2, 68); });
      const facs = [fac, fac, sand, sand, fac, fac];
      add(box(W, 19, D), facs, 0, 9.5 - 1 + 0, 0); // Hauptkörper, 1 m in den Boden
      add(mansard(W, 6, D, 0.86), kupfer, 0, 18 + 3, 0);
      add(box(W * 0.56, 8, D * 0.5), sand, 0, 25, -D * 0.05); add(mansard(W * 0.56, 5, D * 0.5, 0.6), kupfer, 0, 31.5, -D * 0.05); // Saalbau
      add(box(W * 0.66, 13, D * 0.2), sand, 0, 24, -D * 0.38); add(prism(W * 0.66, 7, D * 0.2), kupfer, 0, 30.5, -D * 0.38); // Bühnenhaus
      // Eckpavillons mit Kuppeln
      const kup = new THREE.LatheGeometry([[0, 0], [5.6, 0], [5.4, 2.5], [4.2, 5], [2.2, 6.6], [0.6, 7.2], [0.6, 8.4], [0, 8.6]].map(([r, h]) => new THREE.Vector2(r, h)), 12);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { add(box(13, 4, 13), sand, sx * (W / 2 - 6.5), 20, sz * (D / 2 - 6.5)); add(kup, kupfer, sx * (W / 2 - 6.5), 22, sz * (D / 2 - 6.5)); }
      // Mittelrisalit mit Giebel, Pegasus, Goethe und Mozart
      const rw = W * 0.44; add(box(rw, 24, 5), [sand, sand, sand, sand, ris, sand], 0, 11, D / 2 + 2.4);
      const gieb = prism(rw + 1, 6, 5.4); add(gieb, sand, 0, 23, D / 2 + 2.4);
      const bronze = M(0x3c5c50); const peg = new THREE.Group(); const pp = (geo, x, y, z, rz = 0, ry = 0) => { const o = new THREE.Mesh(geo, bronze); o.position.set(x, y, z); o.rotation.set(0, ry, rz); peg.add(o); };
      pp(box(3.6, 1.4, 1.3), 0, 2.4, 0); pp(box(0.7, 1.8, 0.6), 1.9, 3.4, 0, -0.5); pp(box(1.2, 0.6, 0.6), 2.6, 4.2, 0); for (const lx of [-1.4, 1.4]) for (const lz of [-0.45, 0.45]) pp(box(0.3, 1.8, 0.3), lx, 0.9 + (lx > 0 ? 0.5 : 0), lz, lx > 0 ? 0.7 : 0);
      const wing = new THREE.PlaneGeometry(3.2, 1.6); const wm = M(0x3c5c50, { side: THREE.DoubleSide }); for (const s of [-1, 1]) { const o = new THREE.Mesh(wing, wm); o.position.set(-0.2, 3.9, s * 1.2); o.rotation.set(s * 1.0, 0, 0.5); peg.add(o); }
      peg.position.set(0, 28.6, D / 2 + 2.4); peg.rotation.y = Math.PI / 2; g.add(peg);
      const fig = new THREE.LatheGeometry([[0, 0], [0.5, 0], [0.45, 1.4], [0.3, 1.6], [0.32, 2.0], [0, 2.1]].map(([r, h]) => new THREE.Vector2(r, h)), 8);
      for (const s of [-1, 1]) { add(box(1.6, 3, 1.6), sand, s * (rw / 2 + 3), 1.5, D / 2 + 3); add(fig, bronze, s * (rw / 2 + 3), 3, D / 2 + 3); }
    } else if (e.id === 'roemer') {
      const col = e.col; const fac = T(256, 256, (c, w, h) => { c.fillStyle = col; c.fillRect(0, 0, w, h); c.fillStyle = '#a99677'; c.fillRect(0, h * 0.62, w, h * 0.38);
        c.fillStyle = '#3a3f46'; for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) { const x = 22 + i * 58, y = 30 + r * 70; c.fillRect(x, y, 30, 44); c.beginPath(); c.moveTo(x, y); c.lineTo(x + 15, y - 14); c.lineTo(x + 30, y); c.fill(); }
        for (let i = 0; i < 3; i++) { const x = 30 + i * 75; c.fillRect(x, h * 0.72, 40, h * 0.28); c.beginPath(); c.arc(x + 20, h * 0.72, 20, Math.PI, 0); c.fill(); } });
      const wand = M(new THREE.Color(col).getHex()), dach = M(0x4a4e57); const e1 = 12, gh = 10;
      add(box(W, e1 + 1, D), [wand, wand, wand, wand, fac, wand], 0, (e1 - 1) / 2, 0);
      // Stufengiebel zur Front, Satteldach dahinter
      const n = 4, pts = [new THREE.Vector2(-W / 2, 0)]; for (let i = 0; i < n; i++) { const x0 = -W / 2 + i * W / (2 * n + 1), y = (i + 1) * gh / (n + 1); pts.push(new THREE.Vector2(x0, y), new THREE.Vector2(x0 + W / (2 * n + 1), y)); }
      pts.push(new THREE.Vector2(-W / (4 * n + 2), gh), new THREE.Vector2(W / (4 * n + 2), gh)); for (let i = n - 1; i >= 0; i--) { const x0 = W / 2 - i * W / (2 * n + 1), y = (i + 1) * gh / (n + 1); pts.push(new THREE.Vector2(x0 - W / (2 * n + 1), y), new THREE.Vector2(x0, y)); } pts.push(new THREE.Vector2(W / 2, 0));
      const sg = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: 0.9, bevelEnabled: false }); add(sg, wand, 0, e1, D / 2 - 0.9);
      add(prism(W - 0.4, gh * 0.85, D - 1), dach, 0, e1, -0.5);
      if (e.uhr) { add(box(W * 0.8, 0.3, 1.4), M(0x2c2c2c), 0, 5.2, D / 2 + 0.7); // Balkon
        const ut = canvasTex(128, 128, (c, w, h) => { c.fillStyle = '#1f3d6b'; c.beginPath(); c.arc(64, 64, 62, 0, 7); c.fill(); c.fillStyle = '#d9b44a'; c.beginPath(); c.arc(64, 64, 50, 0, 7); c.fill(); c.strokeStyle = '#1b1b1b'; c.lineWidth = 6; c.beginPath(); c.moveTo(64, 64); c.lineTo(64, 26); c.moveTo(64, 64); c.lineTo(90, 72); c.stroke(); });
        const um = new THREE.MeshBasicMaterial({ map: ut, transparent: true, fog: false }); um.userData.c0 = um.color.clone(); mats.push(um); const u = new THREE.Mesh(new THREE.CircleGeometry(1.3, 20), um); u.position.set(0, e1 + gh * 0.45, D / 2 + 0.02); g.add(u); }
    } else if (e.id === 'dom') {
      const rot = '#a4503d'; const fac = T(256, 512, (c, w, h) => { c.fillStyle = rot; c.fillRect(0, 0, w, h); c.fillStyle = '#8e4232'; for (let y = 0; y < h; y += 16) c.fillRect(0, y, w, 2);
        c.fillStyle = '#2f3138'; for (let i = 0; i < 2; i++) { const x = 40 + i * 110; c.fillRect(x, 120, 60, 300); c.beginPath(); c.moveTo(x, 120); c.lineTo(x + 30, 60); c.lineTo(x + 60, 120); c.fill(); } c.strokeStyle = '#a4503d'; c.lineWidth = 4; for (let i = 0; i < 2; i++) { c.beginPath(); c.moveTo(70 + i * 110, 70); c.lineTo(70 + i * 110, 420); c.stroke(); } });
      const stein = M(0xa4503d), dach = M(0x46484f), helm = M(0x4f8a78);
      const nw = Math.min(W * 0.42, 26); add(box(nw, 23, D - 18), [fac, fac, stein, stein, stein, stein], 0, 10.5, -9); add(prism(nw, 12, D - 18), dach, 0, 22, -9); // Langhaus und Chor (Ost)
      add(box(W, 23, 11), [stein, stein, stein, stein, fac, fac], 0, 10.5, -D * 0.05); add(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-5.5, 0), new THREE.Vector2(5.5, 0), new THREE.Vector2(0, 9)]), { depth: W, bevelEnabled: false }).rotateY(Math.PI / 2).translate(-W / 2, 0, 0), dach, 0, 22, -D * 0.05); // Querhaus
      // Westturm (Front +z): Vierkant bis 42 m, Oktogon bis 72 m, Kuppelhelm mit Laterne bis 95 m
      const tz = D / 2 - 9; add(box(19, 43, 19), [fac, fac, stein, stein, fac, fac], 0, 20.5, tz);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.ConeGeometry(1.2, 6, 4), stein, sx * 8.5, 45, tz + sz * 8.5);
      const okt = new THREE.CylinderGeometry(7.2, 7.6, 30, 8); add(okt, fac, 0, 57, tz, Math.PI / 8);
      add(new THREE.LatheGeometry([[7.6, 0], [7.4, 4], [6, 9], [3.5, 13], [1.6, 15], [1.6, 15.5], [0, 15.6]].map(([r, h]) => new THREE.Vector2(r, h)), 8), helm, 0, 72, tz, Math.PI / 8);
      add(new THREE.CylinderGeometry(1.1, 1.4, 4, 8), helm, 0, 89.6, tz); add(new THREE.ConeGeometry(1.2, 3.4, 8), helm, 0, 93.3, tz);
    } else if (e.id === 'pauls') {
      const fac = T(512, 128, (c, w, h) => { c.fillStyle = '#a24b3b'; c.fillRect(0, 0, w, h); c.fillStyle = '#8a3c2f'; c.fillRect(0, 10, w, 6); c.fillRect(0, h - 18, w, 18); c.fillStyle = '#e7e0d0';
        for (let i = 0; i < 8; i++) { const x = 20 + i * 62; c.fillRect(x, 28, 26, 70); c.beginPath(); c.arc(x + 13, 28, 13, Math.PI, 0); c.fill(); } }, 4, 1);
      const stein = M(0xa24b3b); const rx = Math.min(20, W / 2), rz = 15, z0 = -D / 2 + rz + 0.5;
      const oval = new THREE.CylinderGeometry(1, 1, 29, 28, 1, true); oval.scale(rx, 1, rz); add(oval, fac, 0, 13.5, z0);
      const lid = new THREE.LatheGeometry([[1, 0], [0.9, 0.06], [0.6, 0.14], [0, 0.18]].map(([r, h]) => new THREE.Vector2(r, h * 15)), 28); lid.scale(rx, 1, rz); add(lid, kupfer, 0, 28, z0); // flaches Kupferdach
      add(new THREE.CircleGeometry(1, 28).rotateX(Math.PI / 2).scale(rx, 1, rz), stein, 0, 28, z0);
      const tz = Math.min(D / 2 - 5, z0 + rz + 3); add(box(11, 40, 11), [fac, fac, stein, stein, fac, fac], 0, 19, tz);
      add(box(12, 1.2, 12), stein, 0, 39.6, tz); add(new THREE.CylinderGeometry(4.3, 4.6, 7, 8), stein, 0, 43.7, tz);
      add(new THREE.LatheGeometry([[4.8, 0], [4.4, 2.5], [3, 4.8], [0.8, 6.3], [0.3, 9], [0, 9.2]].map(([r, h]) => new THREE.Vector2(r, h)), 8), kupfer, 0, 47.2, tz);
    } else if (e.id === 'eschenheim') { // Rundturm 10,2 m, Wehrgang 31 m, Helm bis Knauf 48 m (Wikipedia)
      const stein = M(0x9a8f80), schiefer = M(0x3f4652), gold = M(0xd4b04a);
      add(new THREE.CylinderGeometry(5.1, 5.1, 32, 20), stein, 0, 15, 0); // 1 m in den Boden, oben 31 m
      add(new THREE.CylinderGeometry(5.8, 5.6, 2.2, 20), stein, 0, 32.1, 0); // auskragender Wehrgang
      add(new THREE.CylinderGeometry(4.6, 4.6, 3, 16), stein, 0, 34.7, 0);
      add(new THREE.ConeGeometry(4.8, 11.6, 16), schiefer, 0, 42, 0); // Helm 36,2–47,8 m
      add(new THREE.SphereGeometry(0.35, 8, 6), gold, 0, 47.75, 0); // Knauf, Oberkante 48,1 m
      for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2, x = Math.sin(a) * 5.2, z = Math.cos(a) * 5.2; // vier Scharwachttürmchen
        add(new THREE.CylinderGeometry(1.1, 1.1, 3.4, 8), stein, x, 34.9, z); add(new THREE.ConeGeometry(1.3, 4.2, 8), schiefer, x, 38.7, z); }
    } else { // Hochhäuser
      const glas = (base, band, rx, ry) => T(256, 256, (c, w, h) => { c.fillStyle = base; c.fillRect(0, 0, w, h); c.fillStyle = band; for (let y = 0; y < h; y += 16) c.fillRect(0, y, w, 4); c.fillStyle = 'rgba(255,255,255,0.10)'; for (let x = 0; x < w; x += 16) c.fillRect(x, 0, 2, h); c.fillStyle = 'rgba(255,236,190,0.35)'; for (let i = 0; i < 60; i++) c.fillRect(((i * 97) % 16) * 16 + 3, ((i * 53) % 16) * 16 + 5, 10, 9); }, rx, ry);
      const H = e.h, r = Math.min(W, D) / 2;
      if (e.id === 'messe') { const s = Math.min(W, D) * 0.95; const gr = T(256, 256, (c, w, h) => { c.fillStyle = '#8a5a4e'; c.fillRect(0, 0, w, h); for (let r = 0; r < 12; r++) for (let q = 0; q < 8; q++) { const x = q * w / 8, y = r * h / 12; if (q === 0 || q === 7) { c.fillStyle = '#1e2733'; c.fillRect(x, y, w / 8, h / 12); continue; } c.fillStyle = '#6e443b'; c.fillRect(x + 6, y + 4, w / 8 - 12, h / 12 - 8); c.fillStyle = '#26303c'; c.fillRect(x + 9, y + 7, w / 8 - 18, h / 12 - 14); } }, 2, 12);
        add(box(s, 171, s), gr, 0, 84.5, 0); add(box(s * 0.83, 20, s * 0.83), M(0x8a5a4e), 0, 180, 0, Math.PI / 4); // gestufte Krone
        add(new THREE.CylinderGeometry(s * 0.44, s * 0.47, 31, 24), M(0x2a3340), 0, 205.5, 0); add(new THREE.ConeGeometry(s * 0.44, 36, 4), M(0x7a4a40), 0, 239, 0, Math.PI / 4);
      } else if (e.id === 'coba') { const f = glas('#7f96a8', '#c9d0d4', 6, 60); const t = new THREE.CylinderGeometry(r * 1.12, r * 1.12, H, 3, 1); add(t, f, 0, H / 2 - 1, 0, Math.PI / 6);
        const gr = M(0x5b8a4a); for (let k = 1; k < 5; k++) add(new THREE.CylinderGeometry(r * 1.13, r * 1.13, 6, 3, 1, true), gr, 0, k * H / 5, 0, Math.PI / 6); // Himmelsgärten
        add(new THREE.CylinderGeometry(r * 0.35, r * 0.5, 8, 3), M(0xd0d4d8), 0, H + 4, 0, Math.PI / 6); add(new THREE.CylinderGeometry(0.5, 1.2, 41, 6), M(0xe8e8e8), 0, H + 20.5, 0);
      } else if (e.id === 'main') { const f = glas('#4d6f8e', '#93a6b6', 8, 50); const rr = Math.min(r, D / 2) * 0.95, zc = D / 2 - rr; add(new THREE.CylinderGeometry(rr, rr, H, 24), f, 0, H / 2 - 1, zc);
        add(box(W * 0.9, H * 0.85, D - 2 * rr + 6), glas('#9a9488', '#6b665e', 4, 40), 0, H * 0.425 - 1, zc - rr - (D - 2 * rr) / 2 + 1); add(new THREE.CylinderGeometry(0.6, 1.6, 40, 6), M(0xe0e0e0), 0, H + 20, zc);
      } else if (e.id === 'westend') { const f = glas('#c8c2b6', '#8f8a80', 4, 50); add(box(W * 0.85, H - 16, D * 0.85), f, 0, (H - 16) / 2 - 1, 0);
        const gold = M(0xd9cfb8); const kr = new THREE.CylinderGeometry(r * 0.95, r * 0.7, 6, 16, 1, true); add(kr, gold, 0, H - 13, 0); // Krone: Ring und Strahlen
        for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; const s = new THREE.Mesh(box(1.2, 18, 0.6), gold); s.position.set(Math.sin(a) * r * 0.85, H - 6, Math.cos(a) * r * 0.85); s.rotation.set(Math.cos(a) * 0.35, a, -Math.sin(a) * 0.0); s.rotation.order = 'YXZ'; s.rotation.x = 0.3; g.add(s); }
      } else if (e.id === 'euro') { const f = glas('#d6d8d6', '#3e4650', 4, 37); add(box(W * 0.9, H, D * 0.75), f, 0, H / 2 - 1, 0); add(box(W * 0.5, 6, D * 0.4), M(0x9a9ea2), 0, H + 2, 0);
      } else if (e.id === 'trianon') { const f = glas('#6e8aa0', '#b8c2ca', 6, 45); const hb = H - 22; add(new THREE.CylinderGeometry(r * 1.1, r * 1.1, hb, 3, 1), f, 0, hb / 2 - 1, 0, Math.PI / 6);
        add(new THREE.CylinderGeometry(r * 1.25, r * 0.4, 22, 3, 1), M(0x8ea4b4), 0, hb + 10, 0, Math.PI / 6 + Math.PI / 3); }
    }
    g.position.set(ob.cx, y0, ob.cz); g.rotation.y = Math.atan2(fx, fz);
    g.userData.mats = mats; scene.add(g); return g;
  }
  function drop(g) { if (g.userData.sockel) { scene.remove(g.userData.sockel); g.userData.sockel.geometry.dispose(); } scene.remove(g); disposeHierarchy(g); for (const m of g.userData.mats) { if (m.map) m.map.dispose(); m.dispose(); } /* auch Materialien, die gerade an keinem Mesh hängen */ }
  // Fernsicht (André 13.11.2026): Der Szenen-Nebel endet je nach Stufe bei 250–700 m, dahinter waren Dom und Skyline weg.
  // Wahrzeichen nehmen nicht am Nebel teil, sondern bekommen einen eigenen, weiteren Dunst: Farbe gleitet bis FERN zur Nebelfarbe.
  const FERN = 2200, _fc = new THREE.Color();
  // Dunst-Sockel (13.11.2026): Jenseits des Nebels verschwindet der Boden in Nebelfarbe, der Turmfuß blieb scharf, die Hochhäuser
  // schienen zu schweben. Ein offener Zylinder in Nebelfarbe, unten deckend, oben durchsichtig, legt sich um den Fuß; nah unsichtbar.
  function sockel(g) { if (g.userData.sockel) return g.userData.sockel; const bb = new THREE.Box3().setFromObject(g); const R = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * 0.62 + 6;
    const geo = new THREE.CylinderGeometry(R, R, 60, 24, 6, true); const p = geo.attributes.position, col = new Float32Array(p.count * 4);
    for (let i = 0; i < p.count; i++) { const a = Math.max(0, Math.min(1, 1 - (p.getY(i) + 30) / 60)); col.set([1, 1, 1, a * a], i * 4); }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4)); geo.translate(0, 26, 0);
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: false, opacity: 0 }); const s = new THREE.Mesh(geo, m); s.renderOrder = 2;
    s.position.set(g.position.x, g.position.y, g.position.z); scene.add(s); g.userData.sockel = s; g.userData.mats.push(m); return s; }
  function haze() { const f = scene.fog; if (!f) return; const cam = X.camera; if (!cam) return;
    for (const g of built.values()) { if (!g.userData.b || !['coba', 'main', 'westend', 'euro', 'trianon', 'messe'].includes(g.userData.b.lm)) continue; const s = sockel(g);
      const d = Math.hypot(cam.position.x - g.position.x, cam.position.z - g.position.z); s.material.color.copy(f.color); s.material.opacity = Math.max(0, Math.min(0.95, (d - f.far * 0.8) / 150)); s.visible = s.material.opacity > 0.01; }
    for (const g of [...built.values(), ...(X.FAR_HAZE || []).map(h => (h.position = h.position || { x: h.x, z: h.z }, h.userData = h.userData || { mats: h.mats }, h))]) { const d = Math.hypot(cam.position.x - g.position.x, cam.position.z - g.position.z); const near = Math.max(60, f.near);
      const k = Math.min(0.85, Math.max(0, (d - near) / (Math.max(FERN, f.far * 3) - near)));
      if (g.userData.k !== undefined && Math.abs(g.userData.k - k) < 0.01 && g.userData.fc === f.color.getHex()) continue; g.userData.k = k; g.userData.fc = f.color.getHex(); _fc.copy(f.color);
      for (const m of g.userData.mats) { if (m.userData.c0) m.color.copy(m.userData.c0).lerp(_fc, k); if (m.userData.e0) m.emissive.copy(m.userData.e0).lerp(_fc, k); } } }
  function update(dt) {
    haze();
    scanT -= dt; if (scanT > 0) return; scanT = 1;
    const night = !!world.night;
    for (const e of LIST) { if (!e.b) continue; const key = e.n; const [cx, cz] = centroid(e.p0); const d = Math.hypot(player.pos.x - cx, player.pos.z - cz); let g = built.get(key);
      if (g && g.userData.b !== e.b) { drop(g); built.delete(key); g = null; }
      if (!g && d < e.r) { g = mk(e); if (g) { g.userData.b = e.b; built.set(key, g); lastNight = null; } }
      else if (g && d > e.r * 1.2) { drop(g); built.delete(key); } }
    if (night !== lastNight) { lastNight = night; for (const g of built.values()) for (const m of g.userData.mats) if (m.emissiveIntensity !== undefined) m.emissiveIntensity = night ? 0.55 : 0.05; } // nachts angestrahlt
  }
  return { update };
}

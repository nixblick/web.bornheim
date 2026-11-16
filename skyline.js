// Frankfurter Skyline am Horizont (Entwurf 12.11.2026, fertig 16.11.2026). Ziel ist Wiedererkennen, nicht Detail.
// 1) Horizont: alle Hochhäuser ab 90 m mit echtem Grundriss (data/skyline.json, erzeugt von tools/build_skyline.py),
//    ein Mesh, ein Draw-Call. Der Vertex-Shader zieht jeden Turm auf höchstens R Meter an die Kamera heran und
//    skaliert ihn mit (gleicher Sichtwinkel), sobald die echte Kachel gebaut ist, verschwindet er.
// 2) Ikonen: Messeturm-Pyramide, Europaturm (Turmkorb, Antenne), Commerzbank-Antenne und gelbe Krone,
//    Main-Tower-Antenne, Krone des Westend Tower, Henninger-Fass, Japan-Center-Dach, Domturm.
// In der Nähe baut wahrzeichen.js die Wahrzeichen selbst; solange es einen Turm gebaut hat (e.shown), fehlt er hier.
// @ts-ignore -- 'three' kommt zur Laufzeit aus der Importmap; tsc kennt das Modul nicht (types: [])
import * as THREE from 'three';

const R = 760; // wie die alte Horizontschicht: innerhalb der Sichtweite, vor der Himmelskuppel (850)
const lin = h => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const COL = { glas: 0x7f91a8, granit: 0x8e5b4b, granitD: 0x74483b, beton: 0xcfccc4, dunkel: 0x3a4656, rot: 0xc0392b, weiss: 0xe8e8e4, stahl: 0x9aa0a6, sand: 0xa0503a, kupfer: 0x5f8f7c, bronze: 0x5a4a3a, dach: 0x3b3b3b, silber: 0xbac3cd };
const LIT = { fenster: 0xffd890, rot: 0xff2a20, gelb: 0xffd200, warm: 0xffc070, weiss: 0xfff4e0 };

// ---------- Bauteil-Sammler ----------
function parts() { return { pos: [], nrm: [], col: [], lit: [], glow: [], uv: [], win: [] }; }
function vtx(P, p, n, col, lit, glow, uv, win) { P.pos.push(p[0], p[1], p[2]); P.nrm.push(n[0], n[1], n[2]); P.col.push(...col); P.lit.push(lit); P.glow.push(glow); P.uv.push(uv[0], uv[1]); P.win.push(win); }
// Dreieck mit vorgegebener Außennormale; Umlaufsinn wird passend gedreht
function tri(P, a, b, c, n, o, uva = [0, 0], uvb = [0, 0], uvc = [0, 0]) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  if (cx * n[0] + cy * n[1] + cz * n[2] < 0) { [b, c] = [c, b]; [uvb, uvc] = [uvc, uvb]; }
  const col = lin(o.col); vtx(P, a, n, col, o.lit || 0, o.glow || 0, uva, o.win || 0); vtx(P, b, n, col, o.lit || 0, o.glow || 0, uvb, o.win || 0); vtx(P, c, n, col, o.lit || 0, o.glow || 0, uvc, o.win || 0);
}
const area = p => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return a / 2; };
// Prisma aus Grundriss (lokale x/z), Wände mit Fenster-UV (u = Umfang, v = Höhe)
function prism(P, poly, y0, y1, o, bottom = false) {
  const s = area(poly) > 0 ? 1 : -1; let u = 0;
  for (let i = 0; i < poly.length; i++) { const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length]; const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1; const n = [dz / l * s, 0, -dx / l * s];
    tri(P, [ax, y0, az], [bx, y0, bz], [bx, y1, bz], n, o, [u, y0], [u + l, y0], [u + l, y1]); tri(P, [ax, y0, az], [bx, y1, bz], [ax, y1, az], n, o, [u, y0], [u + l, y1], [u, y1]); u += l; }
  const oc = Object.assign({}, o, { win: 0 }); const v2 = poly.map(([x, z]) => new THREE.Vector2(x, z));
  for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(v2, [])) { const a = poly[i], b = poly[j], c = poly[k];
    tri(P, [a[0], y1, a[1]], [b[0], y1, b[1]], [c[0], y1, c[1]], [0, 1, 0], oc);
    if (bottom) tri(P, [a[0], y0, a[1]], [b[0], y0, b[1]], [c[0], y0, c[1]], [0, -1, 0], oc); }
}
// Drehkörper: Profil [[r, y], ...] von der Achse unten nach außen, hoch und zurück zur Achse
function lathe(P, prof, seg, o, cx = 0, cz = 0) {
  for (let k = 0; k < prof.length - 1; k++) { const [r0, y0] = prof[k], [r1, y1] = prof[k + 1]; if (r0 === 0 && r1 === 0) continue;
    const tr = r1 - r0, ty = y1 - y0, tl = Math.hypot(tr, ty) || 1; const nr = ty / tl, ny = -tr / tl;
    for (let i = 0; i < seg; i++) { const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2, am = (a0 + a1) / 2; const n = [nr * Math.cos(am), ny, nr * Math.sin(am)];
      const p = (r, y, a) => [cx + r * Math.cos(a), y, cz + r * Math.sin(a)];
      if (r0 > 0) tri(P, p(r0, y0, a0), p(r0, y0, a1), p(r1, y1, a1), n, o);
      if (r1 > 0) tri(P, p(r0, y0, a0), p(r1, y1, a1), p(r1, y1, a0), n, o); } }
}
// Konvexer Körper aus Eckpunkten und Flächen (Normalen zeigen vom Schwerpunkt weg)
function convex(P, V, F, o) {
  const c = V.reduce((a, v) => [a[0] + v[0] / V.length, a[1] + v[1] / V.length, a[2] + v[2] / V.length], [0, 0, 0]);
  for (const f of F) { const a = V[f[0]], b = V[f[1]], d = V[f[2]]; const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; const l = Math.hypot(...n) || 1; n = n.map(q => q / l);
    const fc = f.reduce((s, i) => [s[0] + V[i][0], s[1] + V[i][1], s[2] + V[i][2]], [0, 0, 0]).map(q => q / f.length);
    if (n[0] * (fc[0] - c[0]) + n[1] * (fc[1] - c[1]) + n[2] * (fc[2] - c[2]) < 0) n = n.map(q => -q);
    for (let i = 1; i < f.length - 1; i++) tri(P, V[f[0]], V[f[i]], V[f[i + 1]], n, o); }
}
const _m = new THREE.Matrix4(), _v = new THREE.Vector3();
const BOXF = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
function box(P, m, o) { const V = []; for (let i = 0; i < 8; i++) { _v.set(i & 1 ? 0.5 : -0.5, i & 2 ? 0.5 : -0.5, i & 4 ? 0.5 : -0.5).applyMatrix4(m); V.push([_v.x, _v.y, _v.z]); } convex(P, V, BOXF, o); }
const boxAt = (P, x, y, z, w, h, d, ry, o) => box(P, _m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(w, h, d)), o);
function pyramid(P, side, y0, y1, ang, o) { const V = []; for (let i = 0; i < 4; i++) { const a = ang + Math.PI / 4 + i * Math.PI / 2, r = side / Math.SQRT2; V.push([Math.cos(a) * r, y0, Math.sin(a) * r]); } V.push([0, y1, 0]); convex(P, V, [[0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4], [0, 1, 2, 3]], o); }
// Rot-weiß gestreifter Mast mit Flugfeuer an der Spitze
function mast(P, y0, y1, r0, r1, th, n = 6) { const st = (y1 - y0) / n; for (let i = 0; i < n; i++) { const ya = y0 + i * st, yb = ya + st, ra = (r0 + (r1 - r0) * i / n) * th, rb = (r0 + (r1 - r0) * (i + 1) / n) * th; lathe(P, [[0, ya], [ra, ya], [rb, yb], [0, yb]], 8, { col: i % 2 ? COL.weiss : COL.rot }); } beacon(P, 0, y1, 0, th); }
function beacon(P, x, y, z, th) { const s = 1.4 * th * th; boxAt(P, x, y + s / 2, z, s, s, s, 0, { col: COL.rot, lit: LIT.rot, glow: 2 }); }
// kleinstes umschließendes Rechteck (Ausrichtung und Seitenlängen)
function obb(poly) { let best = null; for (let i = 0; i < poly.length; i++) { const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length]; const a = Math.atan2(bz - az, bx - ax), c = Math.cos(a), s = Math.sin(a); let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
  for (const [x, z] of poly) { const u = x * c + z * s, v = -x * s + z * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  const ar = (u1 - u0) * (v1 - v0); if (!best || ar < best.ar) best = { ar, ang: a, w: u1 - u0, d: v1 - v0 }; } return best; }
const scalePoly = (poly, k) => poly.map(([x, z]) => [x * k, z * k]);

// ---------- Ikonen: cut = Höhe, bis zu der der OSM-Körper stehen bleibt (0 = komplett eigenes Modell) ----------
// th: Verdickung dünner Teile (Antennen, Flugfeuer) im Horizont, damit sie auf 3–4 km noch ein Pixel breit sind
const ICONS = {
  'Messeturm': (poly, h, th) => ({ cut: 196, build(P) { const o = obb(poly), s = Math.min(o.w, o.d);
    lathe(P, [[0, 196], [s * 0.47, 196], [s * 0.47, 214], [s * 0.5, 214], [s * 0.5, 216.5], [0, 216.5]], 24, { col: COL.granit, lit: LIT.fenster, glow: 0 });
    pyramid(P, s * 0.68, 216.5, 252.5, o.ang, { col: COL.granitD, lit: LIT.warm, glow: 1 }); // nachts angestrahlt
    lathe(P, [[0, 252], [0.6 * th, 252], [0.3 * th, 257], [0, 257]], 6, { col: COL.stahl }); beacon(P, 0, 257, 0, th); } }),
  'Europaturm': (poly, h, th) => ({ cut: 0, build(P) { const B = { col: COL.beton }, G = { col: COL.dunkel, lit: LIT.fenster, glow: 1 };
    lathe(P, [[0, 0], [10, 0], [9.2, 60], [7.6, 140], [5.8, 196], [5.5, 200]], 20, B); // Schaft 20 m unten, 11 m unter dem Korb
    lathe(P, [[5.5, 200], [14, 203.5], [24, 206.5], [29.5, 209]], 32, B);
    lathe(P, [[29.5, 209], [29.5, 213]], 32, G); lathe(P, [[29.5, 213], [28, 214], [29.5, 215]], 32, B);
    lathe(P, [[29.5, 215], [29.5, 224]], 32, G); lathe(P, [[29.5, 224], [27.5, 225], [28.5, 226]], 32, B);
    lathe(P, [[28.5, 226], [28.5, 231]], 32, G); lathe(P, [[28.5, 231], [24, 233.5], [12, 235.5], [4.8, 236.5]], 32, B);
    lathe(P, [[4.8, 236.5], [3.6, 295], [0, 295]], 12, B);
    mast(P, 295, 337.5, 1.8, 0.9, th, 6); beacon(P, 0, 290, 0, th); } }),
  'Commerzbank Tower': (poly, h, th) => ({ cut: 247, build(P) { prism(P, poly, 247, 259, { col: COL.glas, lit: LIT.gelb, glow: 1 }); // gelbe Krone bei Nacht
    boxAt(P, 0, 263, 0, 8, 8, 8, 0, { col: COL.stahl }); mast(P, 267, 300, 1.3, 0.7, th, 6); } }),
  'Main Tower': (poly, h, th) => ({ cut: h, build(P) { lathe(P, [[0, h], [5, h], [5, h + 6], [0, h + 6]], 12, { col: COL.stahl }); mast(P, h + 6, 200, 1.1, 0.6, th, 5); } }),
  'Westend Tower': (poly, h, th) => ({ cut: h, build(P) { const o = obb(poly), r = Math.min(o.w, o.d) * 0.3; // Strahlenkranz aus Lamellen
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; const m = new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * r, h - 2, Math.sin(a) * r), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, -0.22, 'YXZ')), new THREE.Vector3(1, 1, 1));
      box(P, m.multiply(new THREE.Matrix4().compose(new THREE.Vector3(0, 13, 0), new THREE.Quaternion(), new THREE.Vector3(5, 26, 0.9 * th))), { col: COL.weiss, lit: LIT.weiss, glow: 1 }); } beacon(P, 0, h + 1, 0, th); } }),
  'Henninger Turm': (poly, h, th) => ({ cut: h - 22, build(P) { const o = obb(poly), r = Math.min(o.w, o.d) * 0.55; // Fass oben, wie beim alten Silo-Turm
    lathe(P, [[0, h - 22], [r * 0.9, h - 22], [r, h - 20], [r, h - 15]], 24, { col: COL.bronze });
    lathe(P, [[r, h - 15], [r * 1.02, h - 13]], 24, { col: COL.dunkel, lit: LIT.warm, glow: 1 });
    lathe(P, [[r * 1.02, h - 13], [r, h - 4], [r * 0.9, h], [0, h]], 24, { col: COL.bronze }); beacon(P, 0, h, 0, th); } }),
  'Japan Center': (poly, h) => ({ cut: h, build(P) { prism(P, scalePoly(poly, 1.22), h - 1, h + 2.5, { col: COL.dach }, true); } }),
  'Kaiserdom St. Bartholomäus': (poly, h, th) => ({ cut: 0, keep: true, build(P) { const S = { col: COL.sand }; // Westturm: Quader, Achteck, Rippenkuppel mit Laterne
    prism(P, [[-10, -10], [10, -10], [10, 10], [-10, 10]], 0, 42, S);
    const oct = (r, rot = Math.PI / 8) => Array.from({ length: 8 }, (_, i) => [Math.cos(rot + i * Math.PI / 4) * r, Math.sin(rot + i * Math.PI / 4) * r]);
    prism(P, oct(9), 42, 66, S); prism(P, oct(9.6), 66, 67.5, S);
    lathe(P, [[0, 67.5], [8.2, 67.5], [7.6, 74], [5.6, 80], [2.6, 84], [0, 85]], 8, S);
    lathe(P, [[0, 84], [1.4 * th, 84], [1.4 * th, 88], [0.5 * th, 89], [0.25 * th, 95], [0, 95]], 8, { col: COL.kupfer }); } }),
};
const TINT = { 'Silberturm': COL.silber, 'Europäische Zentralbank': 0x6f8090, 'Messeturm': COL.granit, 'Europaturm': COL.beton, 'Henninger Turm': 0x8a8f96, 'Kaiserdom St. Bartholomäus': COL.sand };

function towerParts(P, t, th, far) {
  const ic = ICONS[t.n] ? ICONS[t.n](t.p, t.h, th) : null; const tint = TINT[t.n] || COL.glas;
  const cut = ic ? Math.min(ic.cut, t.h) : t.h;
  if (cut > 0) prism(P, t.p, far ? -40 : 0, cut, { col: tint, win: 1 }); // im Horizont 40 m tiefer, damit kein Spalt am Boden bleibt
  if (ic) ic.build(P); else if (far && t.h >= 100) beacon(P, 0, t.h, 0, th);
}

// ---------- Horizont ----------
export function initSkyline(X) {
  const { scene } = X; const api = { mesh: null, update() {} };
  fetch('data/skyline.json').then(r => r.ok ? r.json() : []).then(list => {
    if (!list.length) return; const N = list.length; const P = parts(); const tid = [];
    for (let i = 0; i < N; i++) { const n0 = P.pos.length / 3; towerParts(P, list[i], 2.6, true); for (let k = n0; k < P.pos.length / 3; k++) tid.push(i); }
    const g = new THREE.BufferGeometry(); const litRGB = new Float32Array(P.lit.length * 3); P.lit.forEach((h, i) => { if (h) litRGB.set(lin(h), i * 3); });
    g.setAttribute('position', new THREE.Float32BufferAttribute(P.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(P.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(P.col, 3)); g.setAttribute('lit', new THREE.BufferAttribute(litRGB, 3));
    g.setAttribute('glow', new THREE.Float32BufferAttribute(P.glow, 1)); g.setAttribute('win', new THREE.Float32BufferAttribute(P.win, 1));
    g.setAttribute('wuv', new THREE.Float32BufferAttribute(P.uv, 2)); g.setAttribute('tid', new THREE.Float32BufferAttribute(tid, 1));
    const T = list.map(t => new THREE.Vector4(t.x, t.y, t.z, 0));
    const U = { T: { value: T }, cam: { value: new THREE.Vector3() }, R: { value: R }, fogCol: { value: new THREE.Color() }, hazeAdd: { value: 0 }, dayMul: { value: 1 }, night: { value: 0 }, blink: { value: 1 }, sun: { value: new THREE.Vector3(0.4, 0.8, 0.3) } };
    const mat = new THREE.ShaderMaterial({ uniforms: U, vertexColors: true, fog: false, side: THREE.DoubleSide,
      vertexShader: `uniform vec4 T[${N}]; uniform vec3 cam; uniform float R, hazeAdd; attribute float tid, glow, win; attribute vec3 lit; attribute vec2 wuv;
        varying vec3 vCol, vLit, vN; varying float vGlow, vWin, vHaze, vTid, vY; varying vec2 vUV;
        void main(){ vec4 a = T[int(tid + 0.5)]; if (a.w > 0.5) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
          vec3 d = a.xyz - cam; float dist = max(length(d.xz), 1.0); float s = min(1.0, R / dist);
          vec3 wp = cam + (d + position) * s;
          vCol = color; vLit = lit; vN = normal; vGlow = glow; vWin = win; vUV = wuv; vTid = tid; vY = position.y;
          vHaze = clamp((dist - 450.0) / 7000.0 + hazeAdd, 0.12, 0.7); // 16.11.: weniger Dunst, die Skyline steht von Bornheim aus klar da
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0); }`,
      fragmentShader: `uniform vec3 fogCol, sun; uniform float dayMul, night, blink;
        varying vec3 vCol, vLit, vN; varying float vGlow, vWin, vHaze, vTid, vY; varying vec2 vUV;
        void main(){ vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
          vec3 c = vCol * (0.6 + 0.4 * max(dot(n, sun), 0.0)) * (0.86 + 0.14 * clamp(vY / 250.0, 0.0, 1.0)) * dayMul;
          if (vWin > 0.5 && night > 0.01) { vec2 q = vUV / vec2(7.0, 7.2); vec2 f = fract(q); float h = fract(sin(dot(floor(q) + vTid * 13.1, vec2(12.9898, 78.233))) * 43758.5453);
            c += vec3(1.0, 0.82, 0.5) * 0.5 * step(0.2, f.x) * step(f.x, 0.8) * step(0.25, f.y) * step(f.y, 0.75) * step(0.7, h) * night; }
          float L = 0.0; if (vGlow > 0.5) { L = night * (vGlow > 1.5 ? blink : 1.0); c = mix(c, vLit, L); }
          // Fuß im Bodendunst (16.11.): unter den Türmen liegt nur der vernebelte Boden (farPlane, Kacheln ab 700 m = fogCol);
          // ohne Übergang endete jeder Turm mit harter Kante darüber und schwebte. Unten ganz fogCol, ab 110 m wie bisher.
          float foot = 1.0 - smoothstep(-40.0, 110.0, vY);
          gl_FragColor = vec4(mix(c, fogCol, max(vHaze, foot) * (1.0 - 0.6 * L)), 1.0);
          #include <colorspace_fragment>
        }` });
    const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.userData.noChunk = true; scene.add(mesh); api.mesh = mesh;
    if (X.onReady) X.onReady(mesh);
    api.update = e => { mesh.visible = !e.pocket; if (!mesh.visible) return;
      U.cam.value.copy(e.cam); U.fogCol.value.copy(e.fogCol); U.hazeAdd.value = e.haze; U.dayMul.value = 0.38 + 0.62 * e.day; U.night.value = nightF(e.day); U.blink.value = e.blink ? 1 : 0;
      if (e.sunDir) U.sun.value.copy(e.sunDir).normalize();
      for (let i = 0; i < N; i++) T[i].w = e.built(list[i].k) || (e.shown && e.shown(list[i].n)) ? 1 : 0; };
  }).catch(e => console.warn('Skyline', e));
  return api;
}
const nightF = day => Math.min(1, Math.max(0, (0.45 - day) / 0.3));

// Hilfe für tools/proben/wahrzeichen.json (#73): misst je Wahrzeichen sichtbare Wand (Strahl gegen das Modell, 1,5 m über
// Grund) gegen Kollision (solidAt des Wahrzeichens) in 36 Richtungen und läuft aus 8 Richtungen echt auf die Wand zu.
//   await (await import('/tools/proben/wz.js')).wz('dom')
const G = window.G, THREE = G.THREE;
const DT = 1 / 60;
const keysOff = () => { for (const k in G.keys) G.keys[k] = false; };
export async function wz(id, opt = {}) {
  const bs = G.WORLD.buildings.map((b, i) => [b, i]).filter(([b]) => b && b.lm === id);
  if (!bs.length) return { id, fehler: 'kein Bau mit lm=' + id };
  const out = [];
  for (const [b, bi] of bs) {
    let g = null; for (let t = 0; t < 40 && !g; t++) { g = G.scene.children.find(o => o.userData && o.userData.b === b); if (!g) await new Promise(r => setTimeout(r, 500)); }
    if (!g) { out.push({ n: b.n, fehler: 'Modell nicht gebaut' }); continue; }
    g.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3());
    const rc = new THREE.Raycaster(); const N = 36, R = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) + 30;
    let gapMax = -1e9, gapMin = 1e9, miss = 0, dirs = [];
    for (let k = 0; k < N; k++) {
      const a = k * 2 * Math.PI / N, dx = Math.sin(a), dz = Math.cos(a);
      const ox = c.x + dx * R, oz = c.z + dz * R, y = G.TH(c.x + dx * 5, c.z + dz * 5);
      // Strahl in mehreren Höhen (Erdgeschoss), nächster Treffer zählt
      let dv = 1e9, nx = dx, nz = dz; for (const yy of [0.5, 1.5, 2.5]) { rc.set(new THREE.Vector3(ox, y + yy, oz), new THREE.Vector3(-dx, 0, -dz)); rc.far = R * 2; const h = rc.intersectObject(g, true).find(q => q.object.visible); if (h && h.distance < dv) { dv = h.distance; if (h.face) { const n = h.face.normal.clone().transformDirection(h.object.matrixWorld); const l = Math.hypot(n.x, n.z); if (l > 0.3) { nx = n.x / l; nz = n.z / l; } } } }
      let dcol = null; for (let s = 0; s < R * 2; s += 0.1) if (G.solidAt(ox - dx * s, oz - dz * s) === bi) { dcol = s; break; }
      if (dv === 1e9 || dcol === null) { miss++; dirs.push({ a: k * 10, dv: dv === 1e9 ? null : +dv.toFixed(1), dcol }); continue; }
      const cosn = Math.abs(nx * dx + nz * dz), gap = (dv - dcol) * cosn; // senkrecht zur Wand: >0 Kollision vor der Wand (unsichtbar), <0 erst im Modell
      gapMax = Math.max(gapMax, gap); gapMin = Math.min(gapMin, gap); dirs.push({ a: k * 10, gap: +gap.toFixed(2), dv, ox, oz, dx, dz, nx, nz });
    }
    // echt laufen: 8 Richtungen, Start 4 m vor der sichtbaren Wand, 3 s auf das Zentrum zu
    const walks = []; const P = G.player, home = P.pos.clone(), god = G.opts.god; G.opts.god = true; if (P.car) G.toggleCar();
    for (const d of dirs.filter((q, i) => q.gap !== undefined && i % 3 === 0)) {
      const wx = d.ox - d.dx * d.dv, wz = d.oz - d.dz * d.dv; const sx = wx + d.nx * 4, sz = wz + d.nz * 4; // senkrecht auf die Wand zu
      if (G.solidAt(sx, sz) >= 0) { walks.push({ a: d.a, frei: false }); continue; }
      P.pos.set(sx, G.floorAt(sx, sz), sz); P.vy = 0; P.mesh.position.copy(P.pos); G.camYaw.v = Math.atan2(-d.nx, -d.nz);
      let bx = null, bz = null; for (let i = 0; i < 180 && bx === null; i++) { const px = P.pos.x, pz = P.pos.z; keysOff(); G.keys.KeyW = true; G.update(DT); if (i > 10 && -((P.pos.x - px) * d.nx + (P.pos.z - pz) * d.nz) < 0.02) { bx = px; bz = pz; } } keysOff(); if (bx === null) { bx = P.pos.x; bz = P.pos.z; }
      const stop = (bx - wx) * d.nx + (bz - wz) * d.nz; // Abstand vor der Wand (negativ = im Modell)
      walks.push({ a: d.a, stop: +stop.toFixed(2), y: +(P.pos.y - G.TH(P.pos.x, P.pos.z)).toFixed(1) });
    }
    G.opts.god = god; P.pos.copy(home); P.vy = 0; P.mesh.position.copy(P.pos);
    const ws = walks.filter(w => w.stop !== undefined).map(w => w.stop);
    out.push({ n: b.n, gapMax: +gapMax.toFixed(2), gapMin: +gapMin.toFixed(2), miss, walkMin: Math.min(...ws), walkMax: Math.max(...ws), walks: JSON.stringify(walks),
      schlecht: dirs.filter(q => q.gap !== undefined && (q.gap > 1.5 || q.gap < -0.3)).map(q => q.a + '°:' + q.gap).join(' ') });
  }
  return out;
}
// Stadion (Nachttest 13.11.): vom Eingang (+z) 6 s geradeaus zur Mitte laufen (muss ankommen), dazu 8 Richtungen gegen die
// Glasfassade von außen (Stopp ≤ 1,5 m vor der Wand, nicht hinein). Ergebnis mit Lage des Kollisionsrings.
export async function stad(cx, cz) {
  const hit = G.WORLD.buildings.map((b, i) => [b, i]).find(([b]) => b && b._stad && Math.hypot(b._stad.mx - cx, b._stad.mz - cz) < 100);
  if (!hit) return { fehler: 'kein Stadion bei ' + cx + ',' + cz };
  const [b, bi] = hit, S = b._stad, P = G.P || G.player, home = P.pos.clone(), god = G.opts.god; G.opts.god = true; if (P.car) G.toggleCar();
  const walk = (sx, sz, yaw, n) => { P.pos.set(sx, G.floorAt(sx, sz), sz); P.vy = 0; P.mesh.position.copy(P.pos); G.camYaw.v = yaw; const fx = Math.sin(yaw), fz = Math.cos(yaw); for (let i = 0; i < n; i++) { const px = P.pos.x, pz = P.pos.z; keysOff(); G.keys.KeyW = true; G.update(DT); if (i > 10 && (P.pos.x - px) * fx + (P.pos.z - pz) * fz < 0.02) { keysOff(); return new THREE.Vector3(px, P.pos.y, pz); } } keysOff(); return P.pos.clone(); };
  // Eingang: 10 m außerhalb auf der +z-Achse, Richtung -z
  const e = walk(S.mx, S.mz + S.rz + 10, Math.PI, 60 * 12); const rein = (e.z - S.mz) / S.rz;
  const mitte = G.solidAt(S.mx, S.mz) < 0;
  const wand = []; for (let k = 1; k < 8; k++) { const a = k * Math.PI / 4, dx = Math.sin(a), dz = Math.cos(a); const sx = S.mx + dx * S.rx * 1 + dx * 4, sz = S.mz + dz * S.rz + dz * 4;
    // Wandpunkt in Laufrichtung: Ellipse r = 1 entlang (dx,dz) aus der Mitte
    const t = 1 / Math.hypot(dx / S.rx, dz / S.rz), wx = S.mx + dx * t, wz = S.mz + dz * t; const s2x = wx + dx * 4, s2z = wz + dz * 4;
    if (G.solidAt(s2x, s2z) >= 0) { wand.push({ a: k * 45, frei: false }); continue; }
    const q = walk(s2x, s2z, Math.atan2(-dx, -dz), 180); wand.push({ a: k * 45, stop: +((q.x - wx) * dx + (q.z - wz) * dz).toFixed(2) }); }
  G.opts.god = god; P.pos.copy(home); P.vy = 0; P.mesh.position.copy(P.pos);
  return { s: S.s, rx: +S.rx.toFixed(1), rz: +S.rz.toFixed(1), h: b.h, imInnenraum: +rein.toFixed(2), mitteFrei: mitte, wand: JSON.stringify(wand) };
}

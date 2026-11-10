// Teststrecke Fußgänger — im Spiel laden mit:
//   await import('/tools/laufen.js?' + Date.now()); const r = await T.laufen(); r
// Fallen (ohne/mit Fallschaden), Landen auf einem Flachdach, gegen eine Hauswand laufen, Springen.
const G = window.G;
const C = new Proxy({}, { get: (_, k) => { const out = []; for (const [, t] of G.TILES) if (t.built && t.data[k]) out.push(...t.data[k]); return out; } });
const DT = 1 / 60;
function keysOff() { for (const k of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'ShiftLeft']) G.keys[k] = false; }
function step(n, keys = []) { for (let i = 0; i < n; i++) { keysOff(); for (const k of keys) G.keys[k] = true; G.update(DT); } keysOff(); }
const P = () => G.player;
function place(x, y, z) { const p = P(); p.pos.set(x, y, z); p.vy = 0; p.mesh.position.copy(p.pos); }
// Flachdach-Haus in der Nähe: Mitte innerhalb, Dach flach (roofHeight an zwei Punkten gleich)
function flatHouse(x0, z0) { let best = null, bd = 1e9;
  for (const b of C.buildings) { if (!b.p || b.p.length < 4 || b.h < 6) continue; const cx = b.p.reduce((a, p) => a + p[0], 0) / b.p.length, cz = b.p.reduce((a, p) => a + p[1], 0) / b.p.length; const d = Math.hypot(cx - x0, cz - z0); if (d > bd || d > 300) continue;
    if (G.solidAt(cx, cz) < 0 || G.solidAt(cx + 1.5, cz) < 0 || G.solidAt(cx, cz + 1.5) < 0) continue; const f0 = G.X.floorAt(cx, cz), f1 = G.X.floorAt(cx + 1.5, cz); if (Math.abs(f0 - f1) > 0.05 || f0 - G.TH(cx, cz) < 5) continue; bd = d; best = { b, cx, cz, roof: f0 }; }
  return best; }

async function laufen() {
  const R = []; const add = (name, ok, detail) => R.push({ name, ok: !!ok, detail });
  if (document.getElementById('start').style.display !== 'none') { document.getElementById('go').click(); await new Promise(r => setTimeout(r, 800)); }
  window.__noAutoMenu = true; if (document.getElementById('menu').style.display === 'flex') G.X.closeMenu();
  if (P().car) G.toggleCar();
  const god = G.opts.god, home = P().pos.clone(); G.opts.god = false;
  try {
    const x = home.x, z = home.z, g = G.X.floorAt(x, z, home.y + 1);
    // 1) kleiner Fall: kein Schaden, steht danach auf dem Boden
    P().hp = 100; place(x, g + 2.5, z); step(90); const y1 = P().pos.y - G.X.floorAt(x, z, P().pos.y + 0.3);
    add('Fall aus 2,5 m: landet ohne Schaden', P().hp === 100 && Math.abs(y1) < 0.05, `hp ${P().hp}, Abstand zum Boden ${y1.toFixed(3)} m`);
    // 2) hoher Fall: Fallschaden, landet auf dem Boden statt darin
    P().hp = 100; place(x, g + 14, z); let vmin = 0; for (let i = 0; i < 150; i++) { step(1); vmin = Math.min(vmin, P().vy); } const y2 = P().pos.y - G.X.floorAt(x, z, P().pos.y + 0.3); const hp2 = P().hp;
    add('Fall aus 14 m: Fallschaden, nicht im Boden', hp2 < 100 && Math.abs(y2) < 0.05, `hp ${Math.round(hp2)}, Aufprall ${(-vmin).toFixed(1)} m/s, Abstand zum Boden ${y2.toFixed(3)} m`);
    P().hp = 100;
    // 3) Dach: von oben auf ein Flachdach fallen und dort stehen bleiben
    const fh = flatHouse(x, z);
    if (!fh) add('Landet auf dem Flachdach', false, 'kein Flachdach-Haus im Umkreis von 300 m');
    else { place(fh.cx, fh.roof + 1.5, fh.cz); step(90); const dy = P().pos.y - fh.roof; add('Landet auf dem Flachdach', Math.abs(dy) < 0.05 && P().hp === 100, `Dach ${(fh.roof - G.TH(fh.cx, fh.cz)).toFixed(1)} m über Gelände, Abstand ${dy.toFixed(3)} m, hp ${P().hp}`); }
    // 4) Wand: auf das Haus zulaufen, darf nicht hinein
    if (fh) { let en = null, sx = 0, sz = 0; /* Kante mit freiem Vorplatz: 0,5 m innen Haus, 1–4 m außen frei; Außenseite über das Raster bestimmt */
      for (let i = 0; i < fh.b.p.length && !en; i++) { const e = G.X.edgeNormal(fh.b.p, i); if (e.l < 3) continue; const mx = e.ax + e.dx / 2, mz = e.az + e.dz / 2; for (const sg of [1, -1]) { const nx = e.nx * sg, nz = e.nz * sg; if (G.solidAt(mx - nx * 0.5, mz - nz * 0.5) < 0) continue; let free = true; for (let d = 1; d <= 4; d += 0.5) if (G.solidAt(mx + nx * d, mz + nz * d) >= 0 || G.X.barrierNear(mx + nx * d, mz + nz * d, 0.6)) free = false; if (free) { en = { nx, nz }; sx = mx + nx * 4; sz = mz + nz * 4; break; } } }
      if (!en) add('Läuft nicht durch die Wand', false, 'keine Hauskante mit freiem Vorplatz');
      else { place(sx, G.X.floorAt(sx, sz), sz); G.X.camYaw.v = Math.atan2(-en.nx, -en.nz); let inside = 0; for (let i = 0; i < 150; i++) { step(1, ['KeyW']); if (G.solidAt(P().pos.x, P().pos.z) >= 0 && P().pos.y < fh.roof - 1) inside++; } const d = Math.hypot(P().pos.x - sx, P().pos.z - sz);
        add('Läuft nicht durch die Wand', inside === 0 && d > 2.5, `nach 2,5 s ${d.toFixed(1)} m gelaufen (Wand nach 4 m), Bilder in der Wand ${inside}`); } }
    // 5) Sprung: hebt ab und landet wieder
    place(x, g, z); step(10); const y0 = P().pos.y; let top = y0; step(1, ['Space']); for (let i = 0; i < 90; i++) { step(1); top = Math.max(top, P().pos.y); }
    add('Sprung: hebt ab und landet', top - y0 > 0.4 && top - y0 < 2.5 && Math.abs(P().pos.y - y0) < 0.05, `Sprunghöhe ${(top - y0).toFixed(2)} m, danach ${(P().pos.y - y0).toFixed(3)} m`);
  } finally { G.opts.god = god; P().hp = Math.max(P().hp, 100); place(home.x, home.y, home.z); keysOff(); }
  const ok = R.filter(r => r.ok).length; console.table(R); return Object.assign(R, { summary: ok + '/' + R.length });
}
window.T = Object.assign(window.T || {}, { laufen });

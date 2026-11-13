// Teststrecke Fahrphysik — im Spiel laden mit:
//   await import('/tools/fahren.js?' + Date.now()); const r = await T.fahren(); r
// Feste, reproduzierbare Abschnitte (Anfahren, Bremsen, Lenken, Kurve, Wand, Bordstein, Auto gegen Auto, bergab, Brücke, Fußgänger).
// Jeder Abschnitt liefert Messwerte und ein ok nach festen Grenzen; Zufall (Unebenheiten) ist für die Dauer abgeschaltet.
const G = window.G;
const C = new Proxy({}, { get: (_, k) => { const out = []; for (const [, t] of G.TILES) if (t.built && t.data[k]) out.push(...t.data[k]); return out; } });
const DT = 1 / 60;

function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function keysOff() { for (const k of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'ShiftLeft']) G.keys[k] = false; }
function clearTraffic(x, z, r = 60) { for (const c of G.cars) { const u = c.userData; if (c === G.player.car || u.mode === 'tram') continue; if (Math.hypot(c.position.x - x, c.position.z - z) < r && (u.mode === 'ai' || u.mode === 'police')) c.position.x += 900; } for (const p of G.peds) if (Math.hypot(p.position.x - x, p.position.z - z) < r) p.position.x += 900; }
function rmCar(c) { if (G.player.car === c) G.toggleCar(); G.scene.remove(c); const i = G.cars.indexOf(c); if (i >= 0) G.cars.splice(i, 1); }
async function ready(x, z) { const tk = Math.floor(x / G.TS) + '_' + Math.floor(z / G.TS); for (let k = 0; k < 80 && !(G.TILES.get(tk) || {}).built; k++) { G.streamUpdate(0.5, true); await new Promise(r => setTimeout(r, 100)); } } /* update() steht still, solange die Kachel unter dem Spieler fehlt: sonst misst der Test 0 km/h */
async function enter(x, z, heading, type = 'sedan', y) { await ready(x, z); const P = G.player; if (P.car) G.toggleCar(); const c = G.makeCar(false, type); c.position.set(x, y ?? G.surfAt(x, z, 1e9), z); c.userData.heading = heading; c.rotation.y = heading; G.scene.add(c); G.cars.push(c); P.pos.copy(c.position); P.mesh.position.copy(P.pos);
  for (const o of G.cars) if (o !== c && o.userData.mode !== 'tram' && o.position.distanceTo(c.position) < 8) o.position.x += 900; /* toggleCar nimmt das nächste Fahrzeug */
  for (const sp of G.staticParked) if (sp.active && Math.hypot(sp.x - x, sp.z - z) < 3) return enterFail(c);
  G.toggleCar(); if (P.car !== c) return enterFail(c); return c; }
function enterFail(c) { if (G.player.car && G.player.car !== c) G.toggleCar(); rmCar(c); return null; }
// Aufzeichnung: je Bild Position, Höhe, Tempo, Neigung; Kennzahlen für Sprünge, Zittern, Stecken
function drive(c, frames, ctl, stop) {
  const u = c.userData, rec = { dyMax: 0, gapMax: 0, flips: 0, nan: 0, solid: 0, frames: 0, vmax: 0 }; let lastY = c.position.y, lastRx = 0, lastD = 0;
  rec.drops = [];
  for (let f = 0; f < frames; f++) { const k = ctl(f, c); keysOff(); for (const n of k) G.keys[n] = true; const s0 = u.speed; { const tk = Math.floor(c.position.x / G.TS) + '_' + Math.floor(c.position.z / G.TS); if (G.TILES.has(tk) && !G.TILES.get(tk).built) rec.stall = (rec.stall || 0) + 1; } G.update(DT); rec.frames++;
    if (k.includes('KeyW') && u.speed < s0 - 0.5 && rec.drops.length < 5) rec.drops.push(`${f}: ${s0.toFixed(1)}→${u.speed.toFixed(1)} bar=${G.barrierHit(c.position.x + Math.sin(u.heading) * 1.5, c.position.z + Math.cos(u.heading) * 1.5, 1)} solid=${G.solidAt(c.position.x + Math.sin(u.heading) * 2.4, c.position.z + Math.cos(u.heading) * 2.4)} cars=${G.cars.filter(o => o !== c && o.position.distanceTo(c.position) < 6).map(o => o.userData.mode).join('/')} parked=${G.staticParked.filter(s => s.active && Math.hypot(s.x - c.position.x, s.z - c.position.z) < 6).length}`);
    const p = c.position; if (!Number.isFinite(p.x + p.y + p.z + u.speed + u.heading)) { rec.nan++; break; }
    rec.dyMax = Math.max(rec.dyMax, Math.abs(p.y - lastY)); lastY = p.y; rec.vmax = Math.max(rec.vmax, Math.abs(u.speed));
    rec.gapMax = Math.max(rec.gapMax, Math.abs(p.y - G.surfAt(p.x, p.z, p.y + 0.5)));
    const d = c.rotation.x - lastRx; if (Math.abs(d) > 0.004 && Math.abs(lastD) > 0.004 && Math.sign(d) !== Math.sign(lastD)) rec.flips++; lastD = d; lastRx = c.rotation.x;
    const fx = Math.sin(u.heading), fz = Math.cos(u.heading), L = (u.dims ? u.dims.l : 4.4) / 2 - 0.3, W = (u.dims ? u.dims.w : 1.9) / 2 - 0.15;
    if ([[L, W], [L, -W], [-L, W], [-L, -W], [0, 0]].some(([a, b]) => G.solidAt(p.x + fx * a + fz * b, p.z + fz * a - fx * b) >= 0)) rec.solid++;
    if (stop && stop(f, c)) break; }
  keysOff(); rec.end = `${rec.stall ? rec.stall + ' Bilder ohne Kachel, ' : ''}v ${u.speed.toFixed(1)} mode ${u.mode}${u.sunk ? ' versunken' : ''}${G.player.car !== c ? ' ausgestiegen' : ''}${rec.drops.length ? ' Einbrüche ' + rec.drops.join(' / ') : ''}`; return rec;
}
// Gerades, freies Fahrbahnstück: längste Kette fast gerader Segmente, Mittellinie frei von Haus, Zaun, Parkreihe
function straight(minL, opt = {}) { const P = G.player; let best = null;
  for (const r of C.roads) { if (!r || r.ry || r.mw || r.ped || r.w < (opt.w || 6) || r.p.length < 2) continue;
    for (let i = 0; i < r.p.length - 1; i++) { const [ax, az] = r.p[i]; let j = i + 1; const dx0 = r.p[j][0] - ax, dz0 = r.p[j][1] - az, a0 = Math.atan2(dx0, dz0);
      while (j + 1 < r.p.length && Math.abs(((Math.atan2(r.p[j + 1][0] - r.p[j][0], r.p[j + 1][1] - r.p[j][1]) - a0 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) < 0.05) j++;
      const [bx, bz] = r.p[j], l = Math.hypot(bx - ax, bz - az); if (l < minL || (best && l <= best.l && !opt.slope)) continue;
      const tx = (bx - ax) / l, tz = (bz - az) / l; let ok = true; for (let s = 2; s < l - 2 && ok; s += 1.5) { const x = ax + tx * s, z = az + tz * s; for (const o of [-1.2, 0, 1.2]) { const qx = x + tz * o, qz = z - tx * o; if (G.solidAt(qx, qz) >= 0 || G.X.barrierNear(qx, qz, 1.4) || G.deckAt(qx, qz) !== null || G.staticParked.some(sp => sp.active && Math.hypot(sp.x - qx, sp.z - qz) < 3.2)) ok = false; } }
      if (!ok) continue; const slope = (G.TH(bx, bz) - G.TH(ax, az)) / l; const cand = { r, ax, az, bx, bz, l, tx, tz, slope, h: Math.atan2(tx, tz) };
      if (opt.slope ? (!best || Math.abs(slope) > Math.abs(best.slope)) : true) best = cand; } }
  return best; }

async function fahren() {
  const P = G.player, R = []; const add = (name, ok, detail) => R.push({ name, ok: !!ok, detail });
  if (document.getElementById('start').style.display !== 'none') { document.getElementById('go').click(); await new Promise(r => setTimeout(r, 800)); }
  window.__noAutoMenu = true; if (document.getElementById('menu').style.display === 'flex') G.X.closeMenu();
  const god = G.opts.god, rain = G.weather.rain, mr = Math.random; G.opts.god = true; G.weather.rain = 0; Math.random = seeded(7); const home = P.pos.clone();
  try {
    // 1) Anfahren und Bremsen auf gerader Strecke
    const s = straight(140);
    if (!s) add('Teststrecke gerade (≥ 140 m)', false, 'keine gefunden');
    else { clearTraffic((s.ax + s.bx) / 2, (s.az + s.bz) / 2, s.l);
      let c = await enter(s.ax + s.tx * 3, s.az + s.tz * 3, s.h); let t100 = null, t50 = null; const along = () => (c.position.x - s.ax) * s.tx + (c.position.z - s.az) * s.tz;
      let rec = drive(c, 900, () => ['KeyW'], (f, c) => { const v = c.userData.speed; if (t50 === null && v >= 13.9) t50 = (f + 1) * DT; if (t100 === null && v >= 27.8) t100 = (f + 1) * DT; return along() > s.l - 60; });
      const vTop = c.userData.speed; const side = Math.abs((c.position.x - s.ax) * s.tz - (c.position.z - s.az) * s.tx);
      add('Anfahren 0–50 km/h in 1–6 s, geradeaus', t50 !== null && t50 > 1 && t50 < 6 && side < 1 && rec.solid === 0 && rec.nan === 0, `0–50: ${t50 && t50.toFixed(1)} s, 0–100: ${t100 ? t100.toFixed(1) + ' s' : 'nicht erreicht'}, nach ${along().toFixed(0)} m ${(vTop * 3.6).toFixed(0)} km/h, seitlich ${side.toFixed(2)} m, Höhensprung max ${rec.dyMax.toFixed(2)} m${rec.drops.length ? ', Einbrüche ' + rec.drops.join('; ') : ''}`);
      // Bremsen aus 50 km/h: S (Bremse) und Leertaste (Handbremse)
      for (const [k, lo, hi, nm] of [['KeyS', 8, 20, 'Bremse S'], ['Space', 6, 20, 'Handbremse']]) { rmCar(c); c = await enter(s.ax + s.tx * 3, s.az + s.tz * 3, s.h); c.userData.speed = 13.9; c.userData.vel = null; const a0 = along(); let back = 0; rec = drive(c, 400, () => [k], (f, c) => { if (c.userData.speed < -0.05) back++; return Math.abs(c.userData.speed) < 0.05; });
        const d = along() - a0; add(`${nm} aus 50 km/h: ${lo}–${hi} m, bleibt stehen`, d > lo && d < hi && back === 0 && Math.abs(c.userData.speed) < 0.3, `${d.toFixed(1)} m in ${(rec.frames * DT).toFixed(1)} s, Rückwärts-Bilder ${back}`); }
      rmCar(c);
      // 2) Lenken: Wendekreis bei 25 km/h, kein Dreher bei 70 km/h
      c = await enter(s.ax + s.tx * 3, s.az + s.tz * 3, s.h); c.userData.speed = 7; c.userData.vel = null; const pts = []; rec = drive(c, 240, () => ['KeyW', 'KeyA'].slice(c.userData.speed > 7 ? 1 : 0), (f, c) => { pts.push([c.position.x, c.position.z]); return false; });
      let cx = 0, cz = 0; const tail = pts.slice(60); for (const [x, z] of tail) { cx += x; cz += z; } cx /= tail.length; cz /= tail.length; const rad = tail.reduce((a, [x, z]) => a + Math.hypot(x - cx, z - cz), 0) / tail.length;
      add('Wendekreis bei 25 km/h: Radius 4–12 m', rad > 4 && rad < 12, `Radius ${rad.toFixed(1)} m (Kollisionen ${rec.solid}, ${rec.end})`); rmCar(c);
      c = await enter(s.ax + s.tx * 3, s.az + s.tz * 3, s.h); c.userData.speed = 19.4; c.userData.vel = null; const h0 = c.userData.heading; let slipMax = 0;
      rec = drive(c, 50, (f) => f < 25 ? ['KeyW', 'KeyD'] : ['KeyW', 'KeyA'], (f, c) => { const u = c.userData; const vh = Math.atan2(u.vel.x, u.vel.y); slipMax = Math.max(slipMax, Math.abs(((vh - u.heading + 3 * Math.PI) % (2 * Math.PI)) - Math.PI)); return false; });
      add('Spurwechsel bei 70 km/h ohne Dreher (Schräglauf < 15°)', slipMax < 0.26 && Math.abs(c.userData.speed) > 12, `Schräglauf max ${(slipMax * 57.3).toFixed(1)}°, Tempo danach ${(c.userData.speed * 3.6).toFixed(0)} km/h, Kursänderung ${((c.userData.heading - h0) * 57.3).toFixed(0)}°, ${rec.end}`); rmCar(c);
      // 3) Auto gegen Auto: mit 50 km/h auf ein stehendes Auto
      { const bx = s.ax + s.tx * 40, bz = s.az + s.tz * 40; const o = G.makeCar(false, 'sedan'); o.position.set(bx, G.TH(bx, bz), bz); o.userData.heading = s.h; o.rotation.y = s.h; o.userData.mode = 'parked'; G.scene.add(o); G.cars.push(o);
        c = await enter(s.ax + s.tx * 3, s.az + s.tz * 3, s.h); c.userData.speed = 13.9; c.userData.vel = null; let minGap = 1e9, vAfter = null; const D = c.userData.dims;
        rec = drive(c, 180, (f) => f < 60 ? ['KeyW'] : [], (f, c) => { const g = (o.position.x - c.position.x) * s.tx + (o.position.z - c.position.z) * s.tz - D.l; minGap = Math.min(minGap, g); if (vAfter === null && g < 0.3) vAfter = 1; return false; });
        const g = (o.position.x - c.position.x) * s.tx + (o.position.z - c.position.z) * s.tz; const oPush = Math.hypot(o.position.x - bx, o.position.z - bz);
        add('Auffahrunfall 50 km/h: keine Durchdringung, anderes Auto wird geschoben, kein Abflug', minGap > -1.0 && g > 0 && oPush > 0.3 && oPush < 25 && Math.abs(o.position.y - G.TH(o.position.x, o.position.z)) < 0.5, `kleinster Abstand ${minGap.toFixed(2)} m (Längen), Gestoßener ${oPush.toFixed(1)} m weit, Tempo danach ${(c.userData.speed * 3.6).toFixed(0)} km/h, Dellen ${c.userData.dents || 0}`); rmCar(c); rmCar(o); }
    }
    // 4) Wand frontal mit 50 km/h und mit 100 km/h
    { let wall = null; for (const b of C.buildings) { if (!b || b.h <= 5 || wall) continue; for (let e = 0; e < b.p.length && !wall; e++) { const [ax, az] = b.p[e], [bx, bz] = b.p[(e + 1) % b.p.length]; const l = Math.hypot(bx - ax, bz - az); if (l < 14) continue; let nx = -(bz - az) / l, nz = (bx - ax) / l; const mx = (ax + bx) / 2, mz = (az + bz) / 2; if (G.solidAt(mx + nx * 2, mz + nz * 2) >= 0) { nx = -nx; nz = -nz; } if (G.solidAt(mx - nx, mz - nz) < 0) continue; let free = true; for (let d = 0.6; d <= 45 && free; d += 1) for (const o of [-1.5, 0, 1.5]) { const x = mx + nx * d + nz * o, z = mz + nz * d - nx * o; if (G.solidAt(x, z) >= 0 || G.X.barrierNear(x, z, 1.4) || G.deckAt(x, z) !== null || G.staticParked.some(sp => sp.active && Math.hypot(sp.x - x, sp.z - z) < 3.2)) free = false; } if (free && Math.hypot(mx - P.pos.x, mz - P.pos.z) < 700) wall = { mx, mz, nx, nz }; } }
      if (!wall) add('Wand frontal', false, 'keine freie Wand mit 45 m Anlauf');
      else { let dmg50 = 0; for (const v of [13.9, 27.8]) { clearTraffic(wall.mx, wall.mz, 60); const c = await enter(wall.mx + wall.nx * 12, wall.mz + wall.nz * 12, Math.atan2(-wall.nx, -wall.nz)); c.userData.speed = v; c.userData.vel = null; let minD = 1e9, maxBack = 0; const dist = () => (c.position.x - wall.mx) * wall.nx + (c.position.z - wall.mz) * wall.nz;
        let vHit = null, last = v; const rec = drive(c, 240, (f) => f < 1 ? ['KeyW'] : [], (f, c) => { const d = dist(); if (vHit === null && d < c.userData.dims.l / 2 + 0.5) vHit = last; last = c.userData.speed; minD = Math.min(minD, d); maxBack = Math.max(maxBack, -c.userData.speed); return false; }); const L = c.userData.dims.l / 2;
        add(`Wand frontal ${Math.round(v * 3.6)} km/h: Aufprall mit vollem Tempo, Schaden wächst mit Tempo`, vHit !== null && vHit > v * 0.85 && (v < 20 || 100 - c.userData.hp > dmg50 + 3), `Tempo am Aufprall ${vHit === null ? '–' : (vHit * 3.6).toFixed(0)} km/h, Schaden ${(100 - c.userData.hp).toFixed(0)} (bei 50 km/h ${dmg50.toFixed(0)})`); if (v < 20) dmg50 = 100 - c.userData.hp;
        add(`Wand frontal ${Math.round(v * 3.6)} km/h: hält, kein Rückprall über 10 km/h`, minD > L - 0.4 && rec.solid === 0 && maxBack < 2.8 && rec.nan === 0, `Front min ${(minD - L).toFixed(2)} m vor der Wand, Rückprall max ${(maxBack * 3.6).toFixed(0)} km/h, in Wand ${rec.solid} Bilder`); rmCar(c); } } }
    // 5) Bordstein: quer von der Fahrbahn auf den Gehweg und zurück
    if (s) { const mx = s.ax + s.tx * s.l / 2, mz = s.az + s.tz * s.l / 2; let ok = null; for (const sg of [1, -1]) { const nx = s.tz * sg, nz = -s.tx * sg; let free = true; for (let d = 0; d < 14 && free; d += 0.7) if (G.solidAt(mx + nx * d, mz + nz * d) >= 0 || G.X.barrierNear(mx + nx * d, mz + nz * d, 1.4)) free = false; if (free) { ok = [nx, nz]; break; } }
      if (!ok) add('Bordstein überfahren', false, 'kein freier Gehweg neben der Strecke');
      else { const [nx, nz] = ok; const c = await enter(mx, mz, Math.atan2(nx, nz)); c.userData.speed = 5; c.userData.vel = null; const rec = drive(c, 120, f => f < 60 ? ['KeyW'] : ['KeyS']);
        add('Bordstein quer überfahren: kein Sprung, kein Zittern', rec.dyMax < 0.12 && rec.flips <= 6 && rec.solid === 0, `Höhensprung max ${rec.dyMax.toFixed(3)} m/Bild, Neigungs-Umkehrungen ${rec.flips}, Abstand zum Boden max ${rec.gapMax.toFixed(2)} m`); rmCar(c); } }
    // 6) Bergab: steilste gerade Straße hinunter, Bodenhaftung und ruhige Neigung
    { const h = straight(50, { slope: true, w: 5 }); if (!h) add('Bergab', false, 'keine geneigte Strecke');
      else { const down = h.slope < 0; const [sx, sz, tx, tz] = down ? [h.ax, h.az, h.tx, h.tz] : [h.bx, h.bz, -h.tx, -h.tz]; clearTraffic(sx, sz, h.l + 20); const c = await enter(sx + tx * 2, sz + tz * 2, Math.atan2(tx, tz)); c.userData.speed = 13.9; c.userData.vel = null;
        const rec = drive(c, 400, () => ['KeyW'], (f, c) => (c.position.x - sx) * tx + (c.position.z - sz) * tz > h.l - 8);
        add('Bergab: Räder am Boden, Neigung ruhig', rec.gapMax < 0.25 && rec.flips <= 8 && rec.dyMax < 0.3 && rec.nan === 0, `Gefälle ${(Math.abs(h.slope) * 100).toFixed(1)} % auf ${h.l.toFixed(0)} m, Abstand Boden max ${rec.gapMax.toFixed(2)} m, Höhensprung ${rec.dyMax.toFixed(2)} m, Neigungs-Umkehrungen ${rec.flips}, ${(rec.vmax * 3.6).toFixed(0)} km/h`); rmCar(c); } }
    // 6b) Hangabtrieb: ohne Gas rollt das Auto bergab an, bergauf rückwärts, mit Handbremse bleibt es stehen
    { const h = straight(40, { slope: true, w: 5 }); if (!h || Math.abs(h.slope) < 0.04) add('Hangabtrieb', false, 'keine Strecke mit ≥ 4 % Gefälle' + (h ? ` (steilste ${(Math.abs(h.slope) * 100).toFixed(1)} %)` : ''));
      else { const down = h.slope < 0; const [sx, sz, tx, tz] = down ? [h.ax, h.az, h.tx, h.tz] : [h.bx, h.bz, -h.tx, -h.tz]; const mx = sx + tx * h.l / 2, mz = sz + tz * h.l / 2; clearTraffic(mx, mz, h.l + 20); const g = 9.81 * Math.abs(h.slope); const v = {};
        for (const [nm, hd, keys] of [['bergab', Math.atan2(tx, tz), []], ['bergauf', Math.atan2(-tx, -tz), []], ['Handbremse', Math.atan2(tx, tz), ['Space']]]) { const c = await enter(mx, mz, hd); if (!c) { v[nm] = NaN; continue; } c.userData.speed = 0; c.userData.vel = null; drive(c, 120, () => keys); v[nm] = c.userData.speed; rmCar(c); }
        const steil = Math.abs(h.slope) >= 0.06; add(steil ? 'Hangabtrieb ab 6 %: rollt bergab an, bergauf zurück, Handbremse hält' : 'Hangabtrieb unter 6 %: flach wirkender Hang, Auto bleibt stehen', steil ? v.bergab > 0.25 * g && v.bergauf < -0.25 * g && Math.abs(v.Handbremse) < 0.3 : Math.abs(v.bergab) < 0.3 && Math.abs(v.bergauf) < 0.3 && Math.abs(v.Handbremse) < 0.3, `Gefälle ${(Math.abs(h.slope) * 100).toFixed(1)} %, nach 2 s ohne Gas: bergab ${(v.bergab * 3.6).toFixed(1)} km/h, bergauf ${(v.bergauf * 3.6).toFixed(1)} km/h, Handbremse ${(v.Handbremse * 3.6).toFixed(1)} km/h (ohne Widerstand wären es ${(g * 2 * 3.6).toFixed(1)} km/h)`); } }
    // 7) Brücke: über ein Deck fahren, nicht durchfallen
    { let br = null, bd = 1e9; for (const r of G.WORLD.roads) { if (!r || !r.ry || !r.el || r.ped) continue; let i0 = -1; for (let i = 0; i < r.p.length - 1; i++) { if (!r.el[i] || !r.el[i + 1]) continue; const x = (r.p[i][0] + r.p[i + 1][0]) / 2, z = (r.p[i][1] + r.p[i + 1][1]) / 2; const d = G.deckAt(x, z); if (d === null || d < G.TH(x, z) + 2.5 || G.solidAt(x, z) >= 0) continue; const dd = Math.hypot(x - P.pos.x, z - P.pos.z); if (dd < bd) { bd = dd; i0 = i; } } if (i0 >= 0) br = { r, i: i0 }; }
      if (!br) add('Brücke', false, 'keine Brücke geladen');
      else { const { r, i } = br; const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const l = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / l, tz = (bz - az) / l; const sx = ax - tx * 2, sz = az - tz * 2; const y0 = G.deckAt(sx, sz); clearTraffic(ax, az, 80);
        const tk = Math.floor(ax / G.TS) + '_' + Math.floor(az / G.TS); for (let k = 0; k < 60 && !(G.TILES.get(tk) || {}).built; k++) { G.streamUpdate(0.5, true); await new Promise(r => setTimeout(r, 100)); }
        const c = await enter(sx, sz, Math.atan2(tx, tz), 'sedan', y0 ?? undefined); c.userData.speed = 11; c.userData.vel = null; let under = 0;
        const rec = drive(c, 240, () => ['KeyW'], (f, c) => { const d = G.deckAt(c.position.x, c.position.z, c.position.y + 1.5); if (d !== null && d > G.TH(c.position.x, c.position.z) + 2 && c.position.y < d - 1) under++; return false; });
        add('Brücke: Auto bleibt auf dem Deck', under === 0 && rec.dyMax < 0.6 && rec.nan === 0, `${under} Bilder unter dem Deck, Höhensprung max ${rec.dyMax.toFixed(2)} m, Start ${y0 === null ? '–' : y0.toFixed(1)} m, Ende ${c.position.y.toFixed(1)} m über Gelände ${G.TH(c.position.x, c.position.z).toFixed(1)} m`); rmCar(c); } }
    // 8) Niedrige Bildrate (20 fps, dt = 0,05): Zaun hält auch bei 100 km/h
    { const segs = []; for (const b of C.barriers) for (let i = 0; i < b.p.length - 1; i++) { const [ax, az] = b.p[i], [bx, bz] = b.p[i + 1]; const l = Math.hypot(bx - ax, bz - az); if (l > 10 && G.solidAt((ax + bx) / 2, (az + bz) / 2) < 0 && G.barrierHit((ax + bx) / 2, (az + bz) / 2, 0.5)) segs.push([ax, az, bx, bz, l]); }
      let tried = 0, crossed = 0; for (const [ax, az, bx, bz, l] of segs.slice(0, 8)) { const mx = (ax + bx) / 2, mz = (az + bz) / 2, nx = -(bz - az) / l, nz = (bx - ax) / l; let side = 0; for (const sg of [1, -1]) { let free = true; for (let d = 1.5; d <= 30 && free; d += 1) if (G.solidAt(mx + nx * d * sg, mz + nz * d * sg) >= 0) free = false; if (free) { side = sg; break; } } if (!side) continue; tried++;
        const c = await enter(mx + nx * 30 * side, mz + nz * 30 * side, Math.atan2(-nx * side, -nz * side)); if (!c) { tried--; continue; } c.userData.speed = 27.8; c.userData.vel = null; G.keys.KeyW = true; for (let f = 0; f < 40; f++) G.update(0.05); keysOff();
        if (((c.position.x - mx) * nx + (c.position.z - mz) * nz) * side < -0.3) crossed++; rmCar(c); if (tried >= 4) break; }
      add('Zaun hält bei 100 km/h und 20 fps', tried > 0 && crossed === 0, `${crossed} von ${tried} durchgefahren`); }
    // 9) Fußgänger: Sprung, Fall vom Dach, Treppen/Dach begehbar
    { if (P.car) G.toggleCar(); const [ox, oz] = window.T && T.openPlace ? T.openPlace() : [P.pos.x, P.pos.z]; P.pos.set(ox, G.TH(ox, oz), oz); P.vy = 0; P.mesh.position.copy(P.pos); G.update(DT); const y0 = P.pos.y; let top = y0, land = 0;
      G.keys.Space = true; G.update(DT); G.keys.Space = false; for (let f = 0; f < 120; f++) { G.update(DT); top = Math.max(top, P.pos.y); if (f > 10 && Math.abs(P.pos.y - y0) < 0.02 && !land) land = f; }
      add('Sprung: 0,4–1,6 m hoch, landet wieder', top - y0 > 0.4 && top - y0 < 1.6 && land > 0 && Math.abs(P.pos.y - G.floorAt(P.pos.x, P.pos.z, P.pos.y + 0.3)) < 0.05, `Höhe ${(top - y0).toFixed(2)} m, gelandet nach ${(land * DT).toFixed(2)} s`); }
  } finally { keysOff(); Math.random = mr; G.opts.god = god; G.weather.rain = rain; if (P.car) G.toggleCar(); P.pos.copy(home); P.mesh.position.copy(home); window.__noAutoMenu = false; }
  return R;
}
window.T = Object.assign(window.T || {}, { fahren });
export default fahren;

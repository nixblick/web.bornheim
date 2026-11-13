// Frischlufteulen im Spiel (#61, erster Kunde): Plakate an Litfaßsäulen (geteilt mit weiteren Kunden-Motiven, #81 Vokabaum), Eulen-Lauf und Eulen-Marathon mit Ziel an der Festhalle.
// Daten nur aus https://frischlufteulen.de/api/spiel/strecken.json (einmal je Sitzung), nichts ausgedacht: ohne freigegebene Strecke keine Plakate und keine Mission.
// Format je Strecke: { name, laenge_km, linie: [[lon, lat], …], link, marathon? }. Keine Nutzerdaten, keine fremden Marken.
/** @param {import('./types').Ctx} X */
export function initEulen(X) {
  const { THREE, scene, player, TH, showMsg, canvasTex, card, sfx, burst, solidAt } = X;
  const LAT0 = 50.129441, LON0 = 8.7096938, R = 6371000;
  const xy = ([lon, lat]) => [(lon - LON0) * Math.PI / 180 * R * Math.cos(LAT0 * Math.PI / 180), -(lat - LAT0) * Math.PI / 180 * R];
  const SPAR = 'eulenMarathon';
  let pendingStart = null; let routes = [], posters = [], run = null, finish = null, startMark = null, t = 0;
  const load = async () => { for (const u of ['https://frischlufteulen.de/api/spiel/strecken.json']) { try { const r = await fetch(u); if (!r.ok) continue; const d = await r.json(); if (d && d.strecken && d.strecken.length) return d.strecken; } catch (e) { /* nächste Quelle */ } } return []; };
  // API-Daten landen per innerHTML in card(): Name ohne HTML-Zeichen, Länge als Zahl, Link nur auf frischlufteulen.de (Nachttest 13.11.)
  const clean = r => { const l = String(r.link || ''); return { name: String(r.name || 'Strecke').replace(/[<>&"'`]/g, '').slice(0, 80), laenge_km: Math.round((Number(r.laenge_km) || 0) * 10) / 10, link: /^https:\/\/frischlufteulen\.de(\/[^"'<>\s]*)?$/.test(l) ? l : 'https://frischlufteulen.de/' }; };
  // Zuschnitt auf das Spielgebiet (#61): nur Punkte in vorhandenen Kacheln (Index wie interiors.js reachable), längster zusammenhängender Abschnitt
  const inArea = ([x, z]) => !!(X.WIDX && X.WIDX.tiles[Math.floor(x / X.TS) + '_' + Math.floor(z / X.TS)]);
  const plen = a => { let s = 0; for (let i = 1; i < a.length; i++) s += Math.hypot(a[i][0] - a[i - 1][0], a[i][1] - a[i - 1][1]); return s; };
  const section = all => { let best = [], cur = []; for (const q of all) { if (inArea(q)) cur.push(q); else { if (plen(cur) > plen(best)) best = cur; cur = []; } } if (plen(cur) > plen(best)) best = cur; return best; };
  const prep = r => { const all = (r.linie || []).map(xy).filter(q => q.every(Number.isFinite)); const pts = section(all); const km = Math.round(plen(pts) / 100) / 10;
    const full = pts.length === all.length; const endIn = all.length > 1 && inArea(all[all.length - 1]);
    if (pts.length < 2 || km < 1) { console.info(`Frischlufteulen: „${r.name}“ nicht angeboten, im Spielgebiet nur ${km} km`); return null; }
    return { ...r, pts, km_gebiet: km, ganz: full, ziel: endIn ? all[all.length - 1] : pts[pts.length - 1], info: full ? `${r.laenge_km} km` : `Abschnitt im Spielgebiet: ${String(km).replace('.', ',')} km von ${String(r.laenge_km).replace('.', ',')} km` }; };
  // use(): auch für die Probe im Spieltest, deren Ursprung (127.0.0.1) der Endpunkt per CORS nicht bedient
  const use = s => { if (startMark) { for (const m of startMark) scene.remove(m); startMark = null; } routes = s.map(r => prep({ ...r, ...clean(r), marathon: r.marathon || /marathon/i.test(r.name || ''), mega: /megamarsch/i.test(r.name || '') })).filter(Boolean); if (routes.length) { for (const p of posters) scene.remove(p); posters = []; /* Säulen neu verteilen, jetzt mit Eulen-Motiv */ } buildStart(); };
  load().then(use);

  // ---------- Plakat (gezeichnet): Eule, Titel, Streckenname ----------
  const posterTex = name => canvasTex(256, 384, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#1f5b3a'); g.addColorStop(1, '#0f2f20'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#f4e9c8'; c.beginPath(); c.ellipse(128, 120, 62, 72, 0, 0, 7); c.fill(); c.fillStyle = '#8a5a2b'; c.beginPath(); c.ellipse(128, 128, 50, 58, 0, 0, 7); c.fill();
    for (const x of [104, 152]) { c.fillStyle = '#fff'; c.beginPath(); c.arc(x, 108, 18, 0, 7); c.fill(); c.fillStyle = '#ffb000'; c.beginPath(); c.arc(x, 108, 10, 0, 7); c.fill(); c.fillStyle = '#111'; c.beginPath(); c.arc(x, 108, 5, 0, 7); c.fill(); }
    c.fillStyle = '#f0a020'; c.beginPath(); c.moveTo(120, 130); c.lineTo(136, 130); c.lineTo(128, 146); c.fill();
    c.fillStyle = '#ffe9a8'; c.font = 'bold 30px sans-serif'; c.textAlign = 'center'; c.fillText('FRISCHLUFT', w / 2, 236); c.fillText('EULEN', w / 2, 268);
    c.fillStyle = '#fff'; c.font = '17px sans-serif'; c.fillText('Laufstrecken in Frankfurt', w / 2, 298); c.font = 'bold 18px sans-serif'; c.fillText((name || '').slice(0, 24), w / 2, 330); c.font = '14px sans-serif'; c.fillStyle = '#bfe0c8'; c.fillText('frischlufteulen.de', w / 2, 362); }, 1, 1);
  // Vokabaum (#81, zweiter Kunde): gezeichneter Baum, Text aus dem Ticket, immer zu sehen (kein Endpunkt nötig)
  const vokaTex = () => canvasTex(256, 384, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#e9f4d8'); g.addColorStop(1, '#b9d99a'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#6b4423'; c.fillRect(118, 130, 20, 80); c.beginPath(); c.moveTo(118, 210); c.lineTo(104, 222); c.lineTo(152, 222); c.lineTo(138, 210); c.fill();
    for (const [x, y, r, col] of [[128, 92, 46, '#2f7d32'], [92, 120, 34, '#388e3c'], [164, 120, 34, '#388e3c'], [110, 70, 30, '#43a047'], [148, 72, 30, '#43a047'], [128, 128, 30, '#2e7031']]) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }
    c.fillStyle = '#ffd54a'; for (const [x, y] of [[100, 96], [150, 104], [128, 64], [116, 132]]) { c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill(); }
    c.fillStyle = '#1e4d21'; c.font = 'bold 40px sans-serif'; c.textAlign = 'center'; c.fillText('VOKABAUM', w / 2, 270);
    c.fillStyle = '#244a26'; c.font = '19px sans-serif'; c.fillText('Vokabeln lernen,', w / 2, 302); c.fillText('Wald wachsen lassen', w / 2, 326); c.font = 'bold 17px sans-serif'; c.fillStyle = '#2f5d8a'; c.fillText('vokabaum.hinjas.de', w / 2, 362); }, 1, 1);
  const MOTIV = { eulen: () => posterTex(routes[0] ? routes[0].name : 'Eulen-Lauf'), vokabaum: vokaTex }; const MATS = {};
  const posterMat = m => MATS[m] || (MATS[m] = new THREE.MeshLambertMaterial({ map: MOTIV[m](), emissive: 0x223322, emissiveIntensity: 0.4 }));
  // je Säule ein Motiv: Eulen nur, wenn der Endpunkt Strecken liefert, Vokabaum immer; abwechselnd verteilt
  const nextMotif = () => { if (!routes.length) return 'vokabaum'; const n = m => posters.filter(p => p.userData.motif === m).length; return n('eulen') <= n('vokabaum') ? 'eulen' : 'vokabaum'; };
  function litfass(x, z, motif) { const g = new THREE.Group(); g.userData.motif = motif; const y = TH(x, z); const col = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 2.8, 16, 1, true), posterMat(motif)); col.position.y = 1.6; g.add(col);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.62, 0.3, 16), new THREE.MeshLambertMaterial({ color: 0x2d4a3a })); cap.position.y = 3.15; g.add(cap); const base = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.7, 0.2, 16), cap.material); base.position.y = 0.1; g.add(base);
    g.position.set(x, y, z); scene.add(g); return g; }
  function updatePosters() { const keep = []; for (const p of posters) { if (Math.hypot(p.position.x - player.pos.x, p.position.z - player.pos.z) < 450) keep.push(p); else scene.remove(p); } posters = keep;
    if (posters.length >= 4) return; const stops = ((X.WORLD || X.CITY).stops || []).filter(s => s.k === 'bus' && Math.hypot(s.x - player.pos.x, s.z - player.pos.z) < 350 && !posters.some(p => Math.hypot(p.position.x - s.x, p.position.z - s.z) < 60));
    for (const s of stops.slice(0, 4 - posters.length)) { for (const [ox, oz] of [[3, 3], [-3, 3], [3, -3], [-3, -3]]) { const x = s.x + ox, z = s.z + oz; if (solidAt(x, z) >= 0 || (X.nearestRoadDir && (() => { const n = X.nearestRoadDir(x, z, 8); return n && Math.hypot(n.x - x, n.z - z) < n.w / 2 + 0.8; })())) continue; posters.push(litfass(x, z, nextMotif())); break; } } }

  // ---------- Start-Markierung des Marathons (grüne Eulen-Säule) ----------
  // je angebotener Strecke eine Säule am ersten Punkt des Abschnitts im Spielgebiet, von der Fahrbahn geschoben, sobald die Kachel steht
  const offRoad = q => { if (q.off || !X.pushOffRoads) return q; const [nx, nz] = X.pushOffRoads(q[0], q[1], 1.0); if (!Number.isNaN(nx) && Math.hypot(nx - q[0], nz - q[1]) < 25) { q[0] = nx; q[1] = nz; } q.off = true; return q; };
  function buildStart() { if (startMark) return; startMark = []; for (const r of routes) { r.pts[0] = r.pts[0].slice(); const [x, z] = r.pts[0]; const m = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 60, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x3ad17a, transparent: true, opacity: 0.25, depthWrite: false })); m.position.set(x, TH(x, z) + 30, z); scene.add(m); m.userData.route = r; startMark.push(m); if (big(r)) { const rb = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 6, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xff9a2a, transparent: true, opacity: 0.45, depthWrite: false })); rb.position.set(4, -27, 0); m.add(rb); /* Rad-Start 4 m östlich */ } } }
  function placeMarks() { for (const m of startMark || []) { const q = m.userData.route.pts[0]; if (q.off || Math.hypot(q[0] - player.pos.x, q[1] - player.pos.z) > 200) continue; offRoad(q); m.position.set(q[0], TH(q[0], q[1]) + 30, q[1]); } }

  // ---------- Lauf ----------
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x3ad17a, transparent: true, opacity: 0.8 }); let ring = null;
  function wps(r) { if (r.W) return r.W; const out = r.W = [r.pts[0]]; let acc = 0; for (let i = 1; i < r.pts.length; i++) { const a = r.pts[i - 1], b = r.pts[i]; acc += Math.hypot(b[0] - a[0], b[1] - a[1]); if (acc > (big(r) ? 900 : 300) || i === r.pts.length - 1) { out.push(b.slice()); acc = 0; } } return out; }
  // ---------- Wettbewerbe (#127, André 13.11.2026): Marathon und Megamarsch zu Fuß (gehen oder rennen) und als zweiter Wettbewerb nur mit dem Rad ----------
  // Etappen à ~10,5 km mit Speichern an der Etappengrenze (Verpflegung); je Etappe eine Zeit, Gesamtzeit = Summe. Fortsetzen startet an der Grenze.
  const STAGE_M = 10500;
  // Tempo im Spiel (game.js): rennen 7,5 m/s (× Stufen-/Fitness-Bonus), Rad höchstens 9 m/s (makeBike maxS)
  const V = { lauf: 7.5, rad: 9 };
  // Echte Zeit: Spielzeit × (Spieltempo / reales Tempo). Reales Tempo: Hobbyläufer 10 km/h = 2,78 m/s, Freizeit-Radler 25 km/h = 6,94 m/s.
  // Dazu hochgerechnet von der gelaufenen Länge im Spielgebiet auf die ganze Strecke (laenge_km).
  const REAL = { lauf: 7.5 / 2.78, rad: 9 / 6.94 };
  // Belohnung: Lauf Marathon 10.000 € (#61), Megamarsch 15.000 € (gut doppelt so lang, im Spielgebiet aber nur ein Abschnitt), Rad 2.500 €
  // (rund 1,2× so schnell und ohne Ausdauer, deshalb ein Viertel des Laufs, wie im Auftrag vorgeschlagen)
  const PAY = r => ({ lauf: r.mega ? 15000 : 10000, rad: 2500 });
  // Medaillen: Schnitt in Bezug auf das Höchsttempo des Modus. Gold ab 85 % (fast durchgehend volles Tempo, nur kurze Pausen),
  // Silber ab 65 %, Bronze für jedes gültige Finish. Bei 42 km zu Fuß: Gold unter ~1:06 h Spielzeit, Silber unter ~1:26 h.
  /** @type {Array<[number, string, string]>} */
  const TIER = [[0.85, 'Gold', '🥇'], [0.65, 'Silber', '🥈'], [0, 'Bronze', '🥉']];
  const big = r => !!(r.marathon || r.mega);
  const kind = r => r.mega ? 'Megamarsch' : r.marathon ? 'Marathon' : 'Eulen-Lauf';
  function stages(r) { if (r.B) return r.B; const W = wps(r); const B = []; let acc = 0, next = STAGE_M; for (let i = 1; i < W.length; i++) { acc += Math.hypot(W[i][0] - W[i - 1][0], W[i][1] - W[i - 1][1]); if (acc >= next && i < W.length - 1) { B.push(i); next += STAGE_M; } } r.len = acc; return (r.B = B); }
  const saveKey = mode => SPAR + (mode === 'rad' ? '_rad' : '');
  const readSave = mode => { try { return JSON.parse(localStorage.getItem(saveKey(mode)) || 'null'); } catch (e) { return null; } };
  const writeSave = (mode, v) => { try { if (v) localStorage.setItem(saveKey(mode), JSON.stringify(v)); else localStorage.removeItem(saveKey(mode)); } catch (e) { /* ohne Speicher weiterlaufen */ } };
  const fmt = ms => { const s = Math.floor(ms / 1000); return Math.floor(s / 3600) + ':' + String(Math.floor(s / 60) % 60).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  const G = () => /** @type {any} */ (window).G;
  function giveBike(x, z) { const g = G(); if (!g || !g.makeBike) return false; const c = g.makeBike(); c.position.set(x, TH(x, z), z); g.scene.add(c); g.cars.push(c); player.pos.set(x + 0.5, TH(x, z), z); g.toggleCar(); return !!(player.car && player.car.userData.bike); }
  function start(r, resume, mode = 'lauf', opt = {}) { const W = wps(r); const B = big(r) ? stages(r) : []; const sv = resume ? readSave(mode) : null; const go = sv && sv.name === r.name;
    const i = go ? sv.i : 1; const stage = B.filter(b => b < i).length;
    if (go && mode === 'lauf' && !player.car) { const [x, z] = W[i - 1]; player.pos.set(x, TH(x, z), z); }
    if (mode === 'rad' && !(player.car && player.car.userData.bike && !player.car.userData.moto)) { const [x, z] = W[go ? i - 1 : 0]; if (!giveBike(x, z)) { showMsg('KEIN RAD VERFÜGBAR', 1500); return; } }
    run = { r, W, B, mode, i, stage, times: go ? sv.times.slice() : [], st0: performance.now(), grace: 3, last: player.pos.clone(), test: !!opt.test };
    if (!ring) { ring = new THREE.Mesh(new THREE.TorusGeometry(3, 0.25, 8, 32), ringMat); scene.add(ring); } ring.visible = true; if (r.marathon) buildFinish(r.ziel);
    const et = B.length ? ` · Etappe ${stage + 1}/${B.length + 1}` : '';
    card((mode === 'rad' ? 'RAD-WETTBEWERB · ' : 'EULEN-') + kind(r).toUpperCase(), `${r.name} · ${r.info}${et} · ` + (mode === 'rad' ? 'nur mit dem Fahrrad, Absteigen macht ungültig' : 'zu Fuß, gehen oder rennen, ohne Auto, Rad oder Bahn') + (B.length ? ' · an jeder Etappengrenze wird gespeichert' : ''), 5); sfx('bell', 0.5); }
  function stop(msg) { run = null; if (ring) ring.visible = false; const o = document.getElementById('obj'); if (o) o.textContent = ''; if (msg) showMsg(msg, 2600); }
  function runUpdate(dt) { const u = run; u.grace -= dt;
    if (u.mode === 'lauf' && player.car) { stop('DISQUALIFIZIERT: NUR ZU FUSS'); return; }
    if (u.mode === 'rad' && u.grace <= 0 && !(player.car && player.car.userData.bike && !player.car.userData.moto)) { stop('UNGÜLTIG: RAD-WETTBEWERB NUR AUF DEM FAHRRAD'); return; }
    const here = player.car ? player.car.position : player.pos; if (!u.test && here.distanceTo(u.last) > 60) { stop('DISQUALIFIZIERT: KEINE ABKÜRZUNG PER BAHN ODER SPRUNG'); return; } u.last.copy(here);
    if (Math.hypot(u.W[u.i][0] - here.x, u.W[u.i][1] - here.z) < 200) offRoad(u.W[u.i]); const [x, z] = u.W[u.i]; ring.position.set(x, TH(x, z) + 3, z); ring.rotation.y += 0.03; const d = Math.hypot(here.x - x, here.z - z); const ms = performance.now() - u.st0;
    const o = document.getElementById('obj'); if (o) o.textContent = `${u.mode === 'rad' ? '🚲' : '🦉'} ${u.r.name}${u.B.length ? ` · Etappe ${u.stage + 1}/${u.B.length + 1}` : ''}: Wegpunkt ${u.i}/${u.W.length - 1} · ${Math.round(d)} m · ${fmt(ms)}`;
    if (d < (u.mode === 'rad' ? 9 : 7)) { u.i++; sfx('click', 0.6);
      if (u.B.includes(u.i - 1) || u.i >= u.W.length) { u.times.push(ms); u.st0 = performance.now(); u.stage++;
        if (u.i < u.W.length) { writeSave(u.mode, { name: u.r.name, i: u.i, times: u.times }); player.hp = Math.min(100, player.hp + 30); showMsg(`ETAPPE ${u.stage} GESCHAFFT · ${fmt(ms)} · GESPEICHERT`, 2200); } }
      if (u.i >= u.W.length) done(); } }
  function best(key, ms) { let a = []; try { a = JSON.parse(localStorage.getItem('eulenBest') || '{}')[key] || []; } catch (e) { /* leer */ } a.push({ ms, am: new Date().toISOString().slice(0, 10) }); a.sort((p, q) => p.ms - q.ms); a = a.slice(0, 5);
    try { const all = JSON.parse(localStorage.getItem('eulenBest') || '{}'); all[key] = a; localStorage.setItem('eulenBest', JSON.stringify(all)); } catch (e) { /* nur Anzeige */ } return a; }
  function done() { const u = run, r = u.r, mode = u.mode; stop(); writeSave(mode, null); const ms = u.times.reduce((a, b) => a + b, 0); const len = r.len || 1;
    const vMax = V[mode] * (mode === 'lauf' ? ((X.perks && X.perks.run) || 1) : 1), frac = len / (ms / 1000) / vMax; const [, tier, ic] = TIER.find(([f]) => frac >= f);
    const real = ms * REAL[mode] * (r.laenge_km && r.km_gebiet ? r.laenge_km / r.km_gebiet : 1);
    let pay = 0; if (big(r)) { pay = PAY(r)[mode]; player.money = (player.money || 0) + pay; player.hp = 100; if ('stamina' in player) player.stamina = 1; for (let k = 0; k < 6; k++) setTimeout(() => burst(player.pos.clone().setY(player.pos.y + 3), [0xff4060, 0xffd84a, 0x3ad17a, 0x4fa8ff][k % 4], 40), k * 250); }
    if (big(r) && X.emit) X.emit('medal', player.pos, { id: `${mode}-${r.mega ? 'megamarsch' : 'marathon'}-${tier.toLowerCase()}`, n: `${ic} ${tier} · ${mode === 'rad' ? 'Rad' : 'Lauf'} · ${kind(r)}`, ms });
    const top = best(`${mode}|${r.name}`, ms); const rank = top.findIndex(e => e.ms === ms) + 1;
    const et = u.times.length > 1 ? ' · Etappen: ' + u.times.map(fmt).join(' / ') : '';
    card((mode === 'rad' ? 'RAD-' : '') + kind(r).toUpperCase() + ' GESCHAFFT', `${ic} ${tier} · Spielzeit ${fmt(ms)}${et} · entspricht etwa ${fmt(real)} echter Zeit für ${String(r.laenge_km).replace('.', ',')} km` + (pay ? ` · +${pay.toLocaleString('de-DE')} € · volles Leben` : '') + (rank ? ` · Bestenliste Platz ${rank}` : '') + ` · <a href="${r.link}" target="_blank" rel="noopener" style="color:#7fe0a0">Strecke auf frischlufteulen.de</a>`, 10); }

  // ---------- Ziel Festhalle: Bogen, roter Teppich, Zuschauer ----------
  function buildFinish([x, z]) { if (finish) return; const g = new THREE.Group(); const y = TH(x, z); const red = new THREE.MeshLambertMaterial({ color: 0xb01020 }), arch = new THREE.MeshLambertMaterial({ color: 0x1f5b3a });
    const carpet = new THREE.Mesh(new THREE.BoxGeometry(3, 0.04, 40), red); carpet.position.set(0, 0.03, -20); g.add(carpet);
    for (const sx of [-2.2, 2.2]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5, 0.5), arch); p.position.set(sx, 2.5, 0); g.add(p); } const top = new THREE.Mesh(new THREE.BoxGeometry(5, 1.1, 0.5), new THREE.MeshLambertMaterial({ map: canvasTex(512, 112, (c, w, h) => { c.fillStyle = '#1f5b3a'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffe9a8'; c.font = 'bold 64px sans-serif'; c.textAlign = 'center'; c.fillText('ZIEL', w / 2, 80); }, 1, 1) })); top.position.set(0, 5.4, 0); g.add(top);
    const fans = []; const fm = [0xd84a4a, 0x4a7ad8, 0xe8c040, 0x5ab868, 0xffffff]; for (let i = 0; i < 40; i++) { const side = i % 2 ? 1 : -1; const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 1.1, 4, 8), new THREE.MeshLambertMaterial({ color: fm[i % fm.length] })); f.position.set(side * (2.4 + Math.random() * 1.5), 0.8, -2 - Math.random() * 36); g.add(f); fans.push(f); }
    g.position.set(x, y, z); scene.add(g); finish = { g, fans }; }

  // ---------- F-Aktionen und Update ----------
  X.fHooks = X.fHooks || [];
  X.fHooks.push(() => { if (run) return null; for (const p of posters) if (Math.hypot(p.position.x - player.pos.x, p.position.z - player.pos.z) < 2.2) { if (p.userData.motif === 'vokabaum') return { label: 'F · Vokabaum-Plakat lesen', act: () => card('VOKABAUM', 'Vokabeln lernen, Wald wachsen lassen · <a href="https://vokabaum.hinjas.de/?von=bornheim" target="_blank" rel="noopener" style="color:#9fe08a">vokabaum.hinjas.de</a>', 8) }; if (!routes.length) continue; const r = routes.find(q => !q.marathon) || routes[0]; return { label: `F · Eulen-Lauf „${r.name}“ starten`, act: () => { const [sx, sz] = r.pts[0]; if (Math.hypot(sx - player.pos.x, sz - player.pos.z) > 40) { showMsg('ZUM START: GRÜNE MARKIERUNG AUF DER KARTE', 2000); pendingStart = r; } else start(r); } }; }
    for (const m of startMark || []) { const r = m.userData.route, [x, z] = r.pts[0]; if (big(r) && Math.hypot(x + 4 - player.pos.x, z - player.pos.z) < 2.5) { const sv = readSave('rad'); const goes = sv && sv.name === r.name; return { label: goes ? `F · Rad-Wettbewerb fortsetzen (${kind(r)})` : `F · Rad-Wettbewerb starten (${kind(r)}, ${r.km_gebiet} km)`, act: () => start(r, goes, 'rad') }; } if (Math.hypot(x - player.pos.x, z - player.pos.z) < 5) { const sv = big(r) ? readSave('lauf') : null; const goes = sv && sv.name === r.name; return { label: big(r) ? (goes ? `F · ${kind(r)} fortsetzen (Etappe ${(r.B || stages(r)).filter(b => b < sv.i).length + 1})` : `F · ${kind(r)} zu Fuß starten (${r.km_gebiet} km)`) : `F · Eulen-Lauf „${r.name}“ starten (${r.km_gebiet} km)`, act: () => { pendingStart = null; start(r, goes); } }; } }
    if (pendingStart) { const [x, z] = pendingStart.pts[0]; if (Math.hypot(x - player.pos.x, z - player.pos.z) < 5) { const r = pendingStart; return { label: `F · Eulen-Lauf „${r.name}“ starten`, act: () => { pendingStart = null; start(r); } }; } }
    return null; });
  function update(dt) { t += dt; if (Math.floor(t) !== Math.floor(t - dt)) { updatePosters(); placeMarks(); } if (run) runUpdate(dt);
    if (finish) for (const [i, f] of finish.fans.entries()) f.position.y = 0.8 + Math.abs(Math.sin(t * 6 + i)) * 0.35; }
  return { update, get posters() { return posters; }, get routes() { return routes; }, get run() { return run; }, get marks() { return startMark || []; }, wps, use, start, stop };
}

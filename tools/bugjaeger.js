// Bug-Jäger: spielt zufällig und wild (laufen, Autos klauen und rasen, U-Bahn, Läden, Häuser, Granaten, Feuer,
// Demos, Storys, Speichern/Laden, Reisen quer durch Frankfurt) und protokolliert alles Auffällige.
// Im Browser laden (Spiel muss bereit sein, `G.CITY` gesetzt):
//   const B = await import('/tools/bugjaeger.js?' + Date.now()); B.start({ minutes: 20 });   // läuft im Hintergrund
//   window.__bj  -> { running, t, actions, findings: [...], summary }
// Ein Fund = { typ, n, erstesMal, wo, detail, aktion }. Gleiche Funde in der Nähe werden zusammengefasst.
let G = window.G; // wird in start() neu gesetzt (Spiel lädt evtl. noch)
const rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)];
const sleep0 = () => new Promise(r => setTimeout(r, 0));

export function start(opt = {}) {
  if (window.__bj && window.__bj.running) return window.__bj;
  const S = window.__bj = { started: Date.now(), running: true, t: 0, frames: 0, actions: {}, action: '', findings: [], log: [], maxFrameMs: 0, slowFrames: 0, stop: false, opt };
  // Spielstand, Story, Fortschritt und Kreativbauten liegen im localStorage: vorher sichern, danach genau so zurückschreiben
  const snap = {}; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); snap[k] = localStorage.getItem(k); } } catch (e) {}
  const origErr = console.error; S.cleanup = []; let godBefore = false;
  (async () => { const t0 = performance.now(); while (!(window.G && window.G.CITY && window.G.update) && performance.now() - t0 < 90000) await new Promise(r => setTimeout(r, 300)); G = window.G; if (!G) throw new Error('Spiel nicht geladen (window.G fehlt)'); godBefore = G.opts.god; await run(S, opt); })().catch(e => { add(S, 'Absturz des Bug-Jägers', String(e && e.stack || e).slice(0, 400)); }).finally(() => {
    for (const f of S.cleanup) try { f(); } catch (e) {} console.error = origErr; if (G) G.opts.god = godBefore;
    try { for (const k of Object.keys(localStorage)) if (!(k in snap)) localStorage.removeItem(k); for (const [k, v] of Object.entries(snap)) localStorage.setItem(k, v); } catch (e) {}
    /* das Spiel in diesem Tab hat noch den Teststand im Speicher: weitere (Auto-)Speicherungen bis zum Neuladen verwerfen */ const setI = Storage.prototype.setItem; if (!setI.__bj) { const f = function (k, v) { if (/^notgta/.test(k)) return; return setI.call(this, k, v); }; f.__bj = true; Storage.prototype.setItem = f; }
    try { const now = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); now[k] = localStorage.getItem(k); } S.storeSame = JSON.stringify(Object.keys(now).sort().map(k => [k, now[k]])) === JSON.stringify(Object.keys(snap).sort().map(k => [k, snap[k]])); } catch (e) {}
    S.running = false; S.summary = summary(S); S.report = report(S); });
  return S;
}
export function stop() { if (window.__bj) window.__bj.stop = true; }

function where(o) { if (!G || !G.player) return { x: 0, z: 0, str: "" }; const p = o || (G.player.car ? G.player.car.position : G.player.pos); return { x: Math.round(p.x), z: Math.round(p.z), str: (document.getElementById('street') || {}).textContent || '' }; }
function add(S, typ, detail, pos) {
  const w = where(pos); const key = typ + '|' + Math.round(w.x / 60) + ',' + Math.round(w.z / 60);
  let f = S.findings.find(f => f.key === key);
  if (!f) { f = { key, typ, n: 0, t0: S.t, erstesMal: mmss(S.t), wo: `${w.x},${w.z} ${w.str}`, str: w.str, xz: [w.x, w.z], detail: String(detail).slice(0, 300), aktion: S.action, vorher: (S.hist || []).slice(-4, -1).join(' → ') }; S.findings.push(f); S.log.push(`${mmss(S.t)} ${typ}: ${f.detail} @ ${f.wo} (${S.action})`); }
  f.n++; f.zuletzt = mmss(S.t);
}
const mmss = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.round(t % 60)).padStart(2, '0')}`;
// Schwere eines Fundes: rot = Absturz/Datenverlust, orange = Spielfehler, gelb = Kartendaten, grau = Hinweis
function sev(typ) { if (/Fehler in|JS-Fehler|Konsolenfehler|Absturz|ungültig|NaN|Speichern fehlgeschlagen|LADE STADT|Anzeige kaputt|Innenraum-Zustand/.test(typ)) return 0; if (/Kartendaten/.test(typ)) return 2; if (/Sehr langes Bild|Zu viele|Speicher wächst|steht über 60 s/.test(typ)) return 3; return 1; }
const SEV = ['🔴 Absturz / Fehler', '🟠 Spielfehler', '🟡 Kartendaten', '⚪ Hinweise'];
// Lesbarer Bericht (Markdown): Kopf, Funde nach Schwere, Fahrten und Flüge, Ablauf
export function report(S = window.__bj) { if (!S) return ''; const sm = S.summary || summary(S); const L = [];
  L.push(`# Bug-Jäger-Bericht · ${new Date(S.started || Date.now()).toLocaleString('de-DE')}`, '', `Spielzeit ${mmss(S.t)} · ${S.frames} Bilder · längstes Bild ${sm.langsamsteBild} · ${Object.values(S.actions).reduce((a, b) => a + b, 0)} Aktionen · Spielstand danach ${S.storeSame === undefined ? 'unbekannt' : S.storeSame ? 'unverändert ✓' : 'VERÄNDERT ✗'}`, '');
  const by = [[], [], [], []]; for (const f of S.findings) by[sev(f.typ)].push(f);
  L.push(`**Funde:** ${by.map((a, i) => `${SEV[i].split(' ')[0]} ${a.length}`).join(' · ')}`, '');
  by.forEach((arr, i) => { if (!arr.length) return; L.push(`## ${SEV[i]}`, ''); arr.sort((a, b) => b.n - a.n).forEach((f, k) => { L.push(`${k + 1}. **${f.typ}** · ${f.n}× · ${f.erstesMal}${f.zuletzt && f.zuletzt !== f.erstesMal ? '–' + f.zuletzt : ''}`, `   - Ort: ${f.str || '?'} (${f.xz ? f.xz.join(', ') : f.wo})`, `   - Aktion: ${f.aktion}${f.vorher ? ` · davor: ${f.vorher}` : ''}`, `   - Detail: ${f.detail || '–'}`); }); L.push(''); });
  if (S.rides && S.rides.length) { L.push('## Fahrten', '', '| Fahrzeug | Strecke | max. km/h | Abzweige | gestürzt |', '|---|---:|---:|---:|:---:|'); for (const r of S.rides) L.push(`| ${r[0]} | ${r[1]} m | ${r[2]} | ${r[3]} | ${r[4] ? '✗' : ''} |`); L.push(''); }
  const fl = S.log.filter(l => /Flug:|Stau hinter/.test(l)); if (fl.length) { L.push('## Flüge und Staus', '', ...fl.map(l => '- ' + l), ''); }
  L.push('## Aktionen', '', Object.entries(S.actions).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}×`).join(' · '), '');
  L.push('<details><summary>Ablauf</summary>', '', ...(S.hist || []).map(h => '- ' + h), '', '</details>'); return L.join('\n'); }
function summary(S) {
  const by = {}; for (const f of S.findings) by[f.typ] = (by[f.typ] || 0) + f.n;
  return { spielzeit: Math.round(S.t) + ' s', bilder: S.frames, aktionen: S.actions, langsamsteBild: Math.round(S.maxFrameMs) + ' ms', bilderUeber100ms: S.slowFrames, funde: by };
}

async function run(S, opt) {
  const minutes = opt.minutes || 10; const end = minutes * 60;
  window.__noAutoMenu = true; const goBtn = document.getElementById('go'); if (goBtn && document.getElementById('start').style.display !== 'none') { goBtn.click(); await new Promise(r => setTimeout(r, 1500)); }
  G.opts.god = !!opt.god; const P = G.player;
  // Fehler im Konsolen-Log mitschneiden
  const origErr = console.error; console.error = (...a) => { add(S, 'Konsolenfehler', a.map(String).join(' ')); origErr.apply(console, a); };
  const origWarn = console.warn; console.warn = (...a) => { if (/Speichern/.test(String(a[0]))) add(S, 'Speichern fehlgeschlagen', a.map(String).join(' ')); if (/Innenraum ohne leave/.test(String(a[0]))) add(S, 'Innenraum-Zustand verloren (Teleport ohne leave)', a.map(String).join(' ')); origWarn.apply(console, a); };
  const onErr = e => add(S, 'JS-Fehler', (e.message || e.reason || e) + (e.filename ? ' @ ' + e.filename.split('/').pop() + ':' + e.lineno : ''));
  addEventListener('error', onErr); addEventListener('unhandledrejection', onErr);
  S.cleanup.push(() => { console.warn = origWarn; removeEventListener('error', onErr); removeEventListener('unhandledrejection', onErr); });
  // Wächter: laufen nach jedem 10. Bild
  let expectJump = 0, lastPos = P.pos.clone(), insideT = 0, carInT = 0, loadT = 0, geo0 = G.renderer.info.memory.geometries, under = 0;
  const pedIn = new Map(), carStuck = new Map(), carIn = new Map(), pedPos = new Map(), wrongT = new Map(); let floatT = 0, carAirT = 0; const trail = [];
  const solidBody = (x, z, y) => G.solidAtH(x, z, y + 0.5) !== -1;
  // Straße führt selbst durch ein Haus (OSM tunnel=building_passage): kein Laufbug, sondern Datenlücke
  const passage = (r, p) => { if (!r || !r.p) return false; let best = 1e9, bp = null; for (let i = 0; i < r.p.length - 1; i++) { const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / L2)); const x = ax + dx * t, z = az + dz * t, d = (x - p.x) ** 2 + (z - p.z) ** 2; if (d < best) { best = d; bp = [x, z]; } } return bp && G.solidAt(bp[0], bp[1]) >= 0; };
  const nearDemo = p => G.DEMO.demos.some(d => d.members.some(m => m.position.distanceTo(p) < 80) || (d.pol && d.pol.cars || []).some(c => c.position && c.position.distanceTo(p) < 60));
  function watch(dt) {
    if (S.frames % 3000 < 10) { const live = new Set(G.peds), liveC = new Set(G.cars); for (const m of [pedIn, pedPos]) for (const k of m.keys()) if (!live.has(k)) m.delete(k); for (const m of [carStuck, carIn, wrongT]) for (const k of m.keys()) if (!liveC.has(k)) m.delete(k); }
    const p = P.car ? P.car.position : P.pos;
    if (![p.x, p.y, p.z].every(Number.isFinite)) add(S, 'Position ungültig (NaN)', JSON.stringify([p.x, p.y, p.z]));
    if (!Number.isFinite(P.hp) || !Number.isFinite(P.money)) add(S, 'Werte ungültig', `hp ${P.hp} geld ${P.money}`);
    if (P.money < 0) add(S, 'Geld negativ', P.money);
    const inPocket = G.X.inPocket && G.X.inPocket(p.x, p.z);
    if (!inPocket && !P.dead) {
      const gy = G.TH(p.x, p.z); if (p.y < gy - 1.5) { under += dt; if (under > 1) { add(S, 'Unter dem Boden', `y ${p.y.toFixed(1)} Gelände ${gy.toFixed(1)}`); under = 0; } } else under = 0;
      if (!P.car && solidBody(P.pos.x, P.pos.z, P.pos.y)) { insideT += dt; if (insideT > 1.5) { add(S, 'Spieler steckt im Gebäude', `y ${P.pos.y.toFixed(1)}`); insideT = 0; } } else insideT = 0;
      if (P.car) { trail.push([Math.round(p.x), Math.round(p.z), Math.round(P.car.userData.speed || 0)]); if (trail.length > 8) trail.shift(); } else trail.length = 0;
      if (P.car && G.solidAtH(p.x, p.z, p.y + 0.8) !== -1) { carInT += dt; if (carInT > 1.5) { add(S, 'Eigenes Auto steckt im Gebäude', `${P.car.userData.type?.name || ''} Weg (x,z,v): ${trail.map(t => t.join('/')).join(' ')}`); carInT = 0; } } else carInT = 0;
    }
    // Schweben, Auto-Physik, Anzeige
    if (!inPocket && !P.dead && !P.car && !(G.creative && G.creative.on)) { const fl = G.floorAt(P.pos.x, P.pos.z, P.pos.y + 0.3); if (P.pos.y - fl > 1.2 && Math.abs(P.vy || 0) < 0.5) { floatT += dt; if (floatT > 2) { add(S, 'Spieler schwebt', `${(P.pos.y - fl).toFixed(1)} m über Boden`); floatT = 0; } } else floatT = 0; }
    if (P.car && !inPocket && !P.car.userData.heli) { const u = P.car.userData, c = P.car; if (Math.abs(u.speed || 0) > 75) add(S, 'Auto unrealistisch schnell', `${Math.round(Math.abs(u.speed) * 3.6)} km/h`); const sy = G.surfAt(c.position.x, c.position.z, c.position.y + 1); if (c.position.y - sy > 2.5) { carAirT += dt; if (carAirT > 2.5) { add(S, 'Auto fliegt/schwebt', `${(c.position.y - sy).toFixed(1)} m über Straße`); carAirT = 0; } } else carAirT = 0; if (Math.abs(u.rollS || 0) > 0.9 || Math.abs(u.pitchS || 0) > 0.9) add(S, 'Auto kippt extrem', `roll ${(u.rollS || 0).toFixed(2)} pitch ${(u.pitchS || 0).toFixed(2)}`); }
    const hud = ((document.getElementById('money') || {}).textContent || '') + ((document.getElementById('hp') || {}).textContent || ''); if (/NaN|undefined/.test(hud)) add(S, 'Anzeige kaputt', hud);
    // Passanten, die auf der Stelle laufen (gegen eine Wand, festgehakt)
    for (const h of G.peds) { const u = h.userData; if (u.state !== 'walk' || h.position.distanceTo(P.pos) > 120) { pedPos.delete(h); continue; } const e = pedPos.get(h); if (!e) { pedPos.set(h, { x: h.position.x, z: h.position.z, t: S.t }); continue; } if (Math.hypot(h.position.x - e.x, h.position.z - e.z) > 1) { e.x = h.position.x; e.z = h.position.z; e.t = S.t; } else if (S.t - e.t > 20) { add(S, 'Passant läuft auf der Stelle', `${u.road && u.road.n || ''} seg ${u.seg}`, h.position); e.t = S.t + 1e9; } }
    if (G.INTERIORS && G.INTERIORS.inside && !inPocket) add(S, 'Innenraum-Zustand ohne Innenraum', `${G.INTERIORS.inside.label || G.INTERIORS.inside.kind || ''}`);
    const jump = lastPos.distanceTo(p); if (jump > 40 && !expectJump) add(S, 'Plötzlich versetzt', `${Math.round(jump)} m in einem Schritt`); lastPos.copy(p);
    const msg = document.getElementById('msg'); if (msg && msg.style.display !== 'none' && /LADE STADT/.test(msg.textContent)) { loadT += dt; if (loadT > 12) { add(S, '„LADE STADT“ hängt', `${Math.round(loadT)} s`); loadT = 0; } } else loadT = 0;
    if (/FEHLGESCHLAGEN/.test((msg || {}).textContent || '') && msg.style.display !== 'none') add(S, 'Meldung „fehlgeschlagen“', msg.textContent);
    // Passanten und Autos in Gebäuden (länger als 3 s)
    const now = S.t;
    for (const h of G.peds) { const u = h.userData; if (u.state === 'dead' || !h.visible || h.position.distanceTo(P.pos) > 120) continue; if (solidBody(h.position.x, h.position.z, h.position.y)) { const t0 = pedIn.get(h) ?? now; pedIn.set(h, t0); if (now - t0 > 3) { add(S, passage(u.road, h.position) ? 'Figur in Hausdurchfahrt (Kartendaten)' : 'Figur steckt im Gebäude', `${u.state}${u.cop ? ' Polizei' : ''}${u.ff ? ' Feuerwehr' : ''}${u.demo ? ' Demo' : ''} y ${h.position.y.toFixed(1)}`, h.position); pedIn.set(h, now + 1e9); } } else pedIn.delete(h); }
    for (const c of G.cars) { const u = c.userData; if (c === P.car || u.mode === 'wreck' || c.position.distanceTo(P.pos) > 150) continue; if (G.solidAt(c.position.x, c.position.z) >= 0 && c.position.y < G.TH(c.position.x, c.position.z) + 3) { const t0 = carIn.get(c) ?? now; carIn.set(c, t0); if (now - t0 > 2) { add(S, passage(u.road, c.position) ? 'Fahrzeug in Hausdurchfahrt (Kartendaten)' : 'Fahrzeug im Gebäude', `${u.mode}${u.cannon ? ' Wasserwerfer' : ''}${u.police ? ' Polizei' : ''}${u.brigade ? ' Feuerwehr' : ''} speed ${(u.speed||0).toFixed(1)}`, c.position); carIn.set(c, now + 1e9); } } else carIn.delete(c);
      if (u.mode === 'ai' && Math.abs(u.speed || 0) < 0.2 && !nearDemo(c.position)) { const t0 = carStuck.get(c) ?? now; carStuck.set(c, t0); if (now - t0 > 60) { add(S, 'KI-Auto steht über 60 s', u.road && u.road.n || '', c.position); carStuck.set(c, now + 1e9); } } else carStuck.delete(c); }
    // Verkehrsregeln: Einbahnstraße, Fußgängerzone, Passanten auf Autobahn (Rückfall-Schutz für behobene Fehler)
    for (const c of G.cars) { const u = c.userData; if (u.mode !== 'ai' || u.police || !u.road || c.position.distanceTo(P.pos) > 150) continue; if (u.road.o && u.dir !== u.road.o && Math.abs(u.speed || 0) > 1) { wrongT.set(c, (wrongT.get(c) || 0) + dt); if (wrongT.get(c) > 2) { add(S, 'KI-Auto gegen die Einbahnstraße', `${u.road.n || ''} dir ${u.dir} o ${u.road.o}`, c.position); wrongT.set(c, -1e9); } } if (u.road.ped && !u.bike) { add(S, 'KI-Auto in Fußgängerzone', u.road.n || '', c.position); } }
    for (const h of G.peds) { const u = h.userData; if (u.state === 'walk' && u.road && (u.road.mw || u.road.ry) && h.position.distanceTo(P.pos) < 150) add(S, 'Passant auf Autobahn/Gleis', u.road.n || '', h.position); }
    if (G.cars.length > 160) add(S, 'Zu viele Fahrzeuge', G.cars.length); if (G.peds.length > 200) add(S, 'Zu viele Figuren', G.peds.length);
    const cops = G.peds.filter(h => h.userData.cop).length; if (cops > 60) add(S, 'Zu viele Polizisten', cops);
  }
  async function frames(n) {
    for (let i = 0; i < n && !S.stop; i++) {
      const a = performance.now(); try { G.update(1 / 60); } catch (e) { add(S, 'Fehler in update()', String(e && e.stack || e).slice(0, 300)); }
      const ms = performance.now() - a; S.maxFrameMs = Math.max(S.maxFrameMs, ms); if (ms > 100) { S.slowFrames++; if (ms > 400) add(S, 'Sehr langes Bild', Math.round(ms) + ' ms'); }
      S.t += 1 / 60; S.frames++; if (expectJump > 0) expectJump--;
      if (i % 10 === 0) watch(10 / 60);
      if (S.frames % 240 === 0) await sleep0();
    }
  }
  const jumpOk = (n = 30) => { expectJump = n; };
  const freeAt = (x, z) => { for (let r = 0; r < 120; r += 3) for (let a = 0; a < 6.28; a += r ? 3 / r : 7) { const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (G.solidAt(px, pz) < 0 && G.solidAt(px + 2, pz) < 0 && G.solidAt(px - 2, pz) < 0 && G.solidAt(px, pz + 2) < 0 && G.solidAt(px, pz - 2) < 0) return [px, pz]; } return [x, z]; };
  const placeAt = (x, z) => { jumpOk(); if (G.INTERIORS.inside) G.INTERIORS.leave(); if (G.SHOPS && G.X.shopOpen) G.SHOPS.close(); [x, z] = freeAt(x, z); if (P.car && P.car.userData.heli) P.car.userData.landed = true; /* Teleport aus der Luft: sonst „Erst landen“ */ if (P.car) G.toggleCar(); P.pos.set(x, G.TH(x, z), z); if (P.mesh) P.mesh.position.copy(P.pos); lastPos.copy(P.pos); };
  const keysOff = () => { for (const k of Object.keys(G.keys)) G.keys[k] = false; };
  const I = G.INTERIORS, D = G.DEMO, W = G.WPN, F = G.FIRE, T = G.THREE;

  const wrapA = x => Math.atan2(Math.sin(x), Math.cos(x));
  // Fahrzeug auf Straße r, Abschnitt i in erlaubter Richtung aufstellen
  function spawnOn(c, r, i) { const dir = r.o === -1 ? -1 : 1; if (dir < 0 && i === 0) i = 1; const a = r.p[i], b = r.p[i + dir] || r.p[i - dir]; const h0 = Math.atan2(b[0] - a[0], b[1] - a[1]); const y0 = G.surfAt(a[0], a[1], 1e9); c.position.set(a[0], y0, a[1]); c.userData.heading = h0; c.rotation.y = h0; c.userData.mode = 'parked'; G.scene.add(c); G.cars.push(c); return c; }
  function enter(c, what) { jumpOk(); P.pos.set(c.position.x + 1.2, c.position.y, c.position.z); if (P.mesh) P.mesh.position.copy(P.pos); G.toggleCar(); if (P.car !== c) { const near = G.cars.filter(o => o !== c && o.position.distanceTo(P.pos) < 5).map(o => `${o.userData.type || 'car'}@${o.position.distanceTo(P.pos).toFixed(1)}m/${o.userData.mode}`).join(' '); add(S, `Einsteigen klappt nicht (${what})`, `statt dessen: ${P.car ? P.car.userData.type : 'nichts'} · Abstand ${c.position.distanceTo(P.pos).toFixed(1)} m · daneben: ${near || '-'} · mode ${c.userData.mode}`); if (P.car) { jumpOk(5); G.toggleCar(); } return false; } return true; }
  const nearestSeg = (x, z, ok) => { let best = null, bd = 1e12; for (const r of G.WORLD.roads) { if (!ok(r)) continue; for (let i = 0; i < r.p.length - 1; i++) { const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)); const d = (ax + dx * t - x) ** 2 + (az + dz * t - z) ** 2; if (d < bd) { bd = d; best = [r, i, Math.sqrt(d)]; } } } return best; };
  // Autopilot: folgt der Straße ein Stück voraus, biegt an Knoten zufällig auf erlaubte Anschlussstraßen ab (Einbahn beachtet)
  async function autopilot(c, r, k, secs, o) {
    let dir = r.o === -1 ? -1 : (r.o === 1 ? 1 : (Math.random() < 0.5 ? 1 : -1)); if (dir < 0 && k === 0) k = 1; if (dir > 0 && k >= r.p.length - 1) k = r.p.length - 2;
    { const a = r.p[k], b = r.p[k + dir]; if (b) { const h = Math.atan2(b[0] - a[0], b[1] - a[1]); if (Math.abs(wrapA(h - c.userData.heading)) > 1.6 && Math.abs(c.userData.speed || 0) < 1) { c.userData.heading = h; c.rotation.y = h; } } }
    const okRoad = q => o.mwOnly ? q.mw : (o.bike ? !q.mw && !q.ry : !q.ped && !q.ry);
    let dist = 0, vmax = 0, slowT = 0, lastY = c.position.y, turns = 0, uturns = 0, loadF = 0; const lastP = c.position.clone(); const u = c.userData;
    for (let f = 0; f < 60 * secs && P.car === c && u.mode !== 'wreck'; f += 5) {
      const segOk = q => q >= 0 && q < r.p.length && q + dir >= 0 && q + dir < r.p.length;
      const proj = q => { const A = r.p[q], B = r.p[q + dir]; const dx = B[0] - A[0], dz = B[1] - A[1], L2 = dx * dx + dz * dz || 1; return { t: ((c.position.x - A[0]) * dx + (c.position.z - A[1]) * dz) / L2, L: Math.sqrt(L2) }; };
      if (!segOk(k)) k = dir > 0 ? 0 : r.p.length - 1; while (segOk(k) && proj(k).t > 1 && segOk(k + dir)) k += dir;
      const look = o.fast ? 25 : o.bike ? 9 : 14;
      let tgt = null; { const pr = proj(k); let need = look; let q = k; let A = r.p[q], B = r.p[q + dir]; let rest = (1 - Math.min(1, Math.max(0, pr.t))) * pr.L;
        while (rest < need && segOk(q + dir)) { need -= rest; q += dir; A = r.p[q]; B = r.p[q + dir]; rest = Math.hypot(B[0] - A[0], B[1] - A[1]); }
        if (rest >= need) { const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, f2 = q === k ? Math.min(1, Math.max(0, pr.t)) + need / L : need / L; tgt = [A[0] + (B[0] - A[0]) * Math.min(1, f2), A[1] + (B[1] - A[1]) * Math.min(1, f2)]; } }
      if (!tgt) { const end = r.p[dir > 0 ? r.p.length - 1 : 0]; const opts = []; for (const q of G.WORLD.roads) { if (q === r || !okRoad(q)) continue; const s0 = q.p[0], s1 = q.p[q.p.length - 1]; if (Math.hypot(s0[0] - end[0], s0[1] - end[1]) < 3 && q.o !== -1) opts.push([q, 1, 0]); else if (Math.hypot(s1[0] - end[0], s1[1] - end[1]) < 3 && q.o !== 1) opts.push([q, -1, q.p.length - 1]); }
        if (!opts.length) { tgt = end; if (Math.hypot(end[0] - c.position.x, end[1] - c.position.z) < 6) { if (!r.o && !o.mwOnly && uturns < 2) { uturns++; dir = -dir; k = dir > 0 ? Math.max(0, k - 1) : Math.min(r.p.length - 1, k + 1); continue; } break; } } else { [r, dir, k] = pick(opts); turns++; continue; } }
      const want = Math.atan2(tgt[0] - c.position.x, tgt[1] - c.position.z), d = wrapA(want - u.heading); const sp = Math.abs(u.speed || 0); const vCap = o.fast ? 99 : o.bike ? 7 : 14;
      G.keys.KeyW = (Math.abs(d) < 0.6 || sp < (o.bike ? 2 : 5)) && sp < vCap; G.keys.KeyS = Math.abs(d) > 0.8 && sp > (o.bike ? 4 : 9); G.keys.KeyA = d > 0.04; G.keys.KeyD = d < -0.04; G.keys.Space = false;
      await frames(5); vmax = Math.max(vmax, sp); dist += lastP.distanceTo(c.position); lastP.copy(c.position);
      const surf = G.surfAt(c.position.x, c.position.z, c.position.y + 2); if (c.position.y < surf - 1.5) add(S, `${o.name}: unter der Fahrbahn`, `${(surf - c.position.y).toFixed(1)} m darunter`);
      if (lastY - c.position.y > 4) add(S, `${o.name}: stürzt ab`, `${(lastY - c.position.y).toFixed(1)} m in 5 Bildern`); lastY = c.position.y;
      const loading = /LADE STADT/.test((document.getElementById('msg') || {}).textContent || '') && (document.getElementById('msg') || {}).style?.display !== 'none'; if (loading && (loadF += 5) < 1800) { await frames(5); f -= 5; slowT = 0; continue; } if (sp < (o.bike ? 0.8 : 2) && f > 120) { slowT += 5 / 60; if (slowT > 6) { const fx = Math.sin(u.heading), fz = Math.cos(u.heading); const wall = G.solidAtH(c.position.x + fx * 2, c.position.z + fz * 2, c.position.y + 0.5); const block = G.cars.filter(o => o !== c && o.position.distanceTo(c.position) < 5).map(o => `${o.userData.type || 'car'}/${o.userData.mode}`).join(','); const fence = G.barrierHit ? G.barrierHit(c.position.x + fx * 1.5, c.position.z + fz * 1.5, 1, c.position.y) : false; const pedsF = G.peds.filter(h => h.userData.state !== 'dead' && h.position.distanceTo(c.position) < 3).length; if (block && wall === -1) { S.log.push(`${Math.round(S.t)}s ${o.name}: Stau hinter ${block} (${r.n || ''})`); break; } add(S, `${o.name}: bleibt hängen`, `nach ${Math.round(dist)} m, ${r.n || 'ohne Namen'} w${r.w} · vorn Wand ${wall !== -1} · Zaun/Mauer ${fence ? 'ja' : 'nein'} · Passanten <3 m: ${pedsF} · Tempo ${(u.speed || 0).toFixed(1)} · Fahrzeuge <5 m: ${block || '-'} · Ziel-Winkel ${(Math.atan2(Math.sin(want - u.heading), Math.cos(want - u.heading))).toFixed(2)}`, c.position); break; } } else slowT = 0;
    }
    keysOff(); const st = { dist: Math.round(dist), vmax: Math.round(vmax * 3.6), turns, crashed: u.mode === 'wreck' };
    S.log.push(`${Math.round(S.t)}s ${o.name}: ${st.dist} m, max ${st.vmax} km/h, ${turns} Abzweige${st.crashed ? ', gestürzt' : ''}`); (S.rides = S.rides || []).push([o.name, st.dist, st.vmax, turns, st.crashed ? 'X' : '']); return st;
  }
  // Rad/Motorrad wie ein Spieler: erst in der Nähe suchen (Ständer, Straßenrand, Verkehr), sonst aufstellen
  async function zweirad(moto) {
    if (P.car) { if (P.car.userData.heli) P.car.userData.landed = true; jumpOk(5); G.toggleCar(); }
    if (!moto && G.updateBikeRacks) G.updateBikeRacks(99);
    const cand = G.cars.filter(c => { const u = c.userData; return u.bike && !!u.moto === moto && u.mode !== 'wreck' && c !== P.car && c.position.distanceTo(P.pos) < 250 && (u.mode === 'parked' || moto && u.mode === 'ai'); }).sort((a, b) => a.position.distanceTo(P.pos) - b.position.distanceTo(P.pos));
    let c = cand[0]; const what = moto ? 'Motorrad' : 'Fahrrad'; S.found = S.found || {}; S.found[what] = (S.found[what] || []).concat([c ? Math.round(c.position.distanceTo(P.pos)) : -1]);
    if (!c) { const sg = nearestSeg(P.pos.x, P.pos.z, q => !q.mw && !q.ry && (moto ? !q.ped : true)); if (!sg) return; c = spawnOn(moto ? G.makeMoto() : G.makeBike(), sg[0], sg[1]); }
    if (!enter(c, what)) return; await frames(20);
    if (P.mesh && !P.mesh.visible) add(S, `Fahrer auf dem ${what} unsichtbar`, '');
    const sg = nearestSeg(c.position.x, c.position.z, q => !q.mw && !q.ry && q.w >= 5 && (moto ? !q.ped : true)); if (!sg) return;
    if (sg[2] > 6) { const [r, i] = sg; const a = r.p[i]; jumpOk(); c.position.set(a[0], G.surfAt(a[0], a[1], 1e9), a[1]); } // vom Ständer auf die Straße schieben
    await autopilot(c, sg[0], sg[1], moto ? 35 : 40, { name: what, bike: !moto });
    if (P.car === c) { jumpOk(5); G.toggleCar(); await frames(10); if (P.car) add(S, `Absteigen vom ${what} klappt nicht`, ''); else if (G.solidAtH(P.pos.x, P.pos.z, P.pos.y + 0.5) !== -1) add(S, `Nach Absteigen (${what}) im Gebäude`, ''); }
  }
  const ACTIONS = {
    async laufen() { G.camYaw.v = rnd(-3.1, 3.1); G.keys.KeyW = true; G.keys.ShiftLeft = Math.random() < 0.5; for (let k = 0; k < 4; k++) { G.keys.KeyA = Math.random() < 0.3; G.keys.KeyD = !G.keys.KeyA && Math.random() < 0.3; if (Math.random() < 0.3) { G.keys.Space = true; await frames(10); G.keys.Space = false; } await frames(rnd(60, 180)); } keysOff(); },
    async fahren() {
      if (!P.car) { const c = G.cars.filter(c => !c.userData.cannon && c.userData.mode !== 'wreck' && c.position.distanceTo(P.pos) < 80).sort((a, b) => a.position.distanceTo(P.pos) - b.position.distanceTo(P.pos))[0]; if (!c) return; jumpOk(); P.pos.set(c.position.x + 1.5, c.position.y, c.position.z); if (P.mesh) P.mesh.position.copy(P.pos); G.toggleCar(); if (!P.car) { add(S, 'Einsteigen klappt nicht', 'neben Auto, E gedrückt'); return; } }
      G.keys.KeyW = true; for (let k = 0; k < 8; k++) { G.keys.KeyA = Math.random() < 0.35; G.keys.KeyD = !G.keys.KeyA && Math.random() < 0.35; G.keys.Space = Math.random() < 0.12; await frames(rnd(40, 120)); } keysOff();
      if (Math.random() < 0.3) { G.keys.KeyS = true; await frames(60); keysOff(); }
      if (Math.random() < 0.6) { jumpOk(5); G.toggleCar(); }
    },
    async reisen() { const ks = Object.entries(G.WIDX.tiles).filter(([, v]) => v[0] > 30); const [k] = pick(ks); const [tx, tz] = k.split('_').map(Number); const x = (tx + 0.5) * G.TS, z = (tz + 0.5) * G.TS; placeAt(x, z); await G.streamInit(x, z); placeAt(x, z); jumpOk(); await frames(120); },
    async ubahn() { const sts = I.metro.stations.filter(s => s.entr.length && G.WIDX.tiles[Math.floor(s.p[0] / G.TS) + '_' + Math.floor(s.p[1] / G.TS)]); if (sts.length < 2) return; const a = pick(sts), b = pick(sts.filter(s => s !== a)); placeAt(a.entr[0][0] + 2, a.entr[0][1] + 2); await G.streamInit(P.pos.x, P.pos.z); jumpOk(); I.station(a, { x: P.pos.x, z: P.pos.z, yaw: 0 }); await frames(200); jumpOk(200); await I.ride(a, b); await frames(120); jumpOk(); I.leave(); await frames(90); if (I.inside) add(S, 'Innenraum nicht verlassen', I.inside.label); },
    async laden() { const s = G.SHOPS.shops.filter(s => Math.hypot(s.x - P.pos.x, s.z - P.pos.z) < 400)[0]; if (!s) return; placeAt(s.x, s.z); await frames(30); jumpOk(); I.shop(s, { x: s.x, z: s.z, yaw: 0 }); await frames(60); P.money += 500; G.SHOPS.open(s); for (const id of ['snack', 'a_pistol', 'paint', 'kit']) G.SHOPS.buy(id); G.SHOPS.close(); await frames(60); jumpOk(); I.leave(); await frames(60); },
    async haus() { const b = G.WORLD.buildings.find(b => b.h >= 9 && b.base && (!b.k || b.k === 'res') && Math.hypot(b.p[0][0] - P.pos.x, b.p[0][1] - P.pos.z) < 300); if (!b) return; placeAt(b.p[0][0], b.p[0][1]); jumpOk(); I.stairwell(b, { x: P.pos.x, z: P.pos.z, yaw: 0 }); await frames(60); const tr = I.inside && I.inside.triggers.find(t => /Aufzug/.test(t.label)); if (tr) { jumpOk(); tr.act(); await frames(120); if (!I.inside && P.pos.y < G.TH(P.pos.x, P.pos.z) + 3) add(S, 'Aufs Dach: nicht oben angekommen', `y ${P.pos.y.toFixed(1)}`); } if (I.inside) { jumpOk(); I.leave(); } await frames(60); },
    async explosion() { const c = G.cars.filter(c => c.position.distanceTo(P.pos) < 60)[0]; const at = c ? c.position.clone() : P.pos.clone().add(new T.Vector3(8, 0, 0)); const from = P.pos.clone(); from.y += 1.6; const v = at.clone().sub(from); v.y = 0; const l = v.length() || 1; v.multiplyScalar(Math.min(16, l) / l); v.y = 5; W.spawnProj(pick(['grenade', 'molotov', 'banger', 'smoke', 'flare']), from, v, 'player'); await frames(240); },
    async feuer() { const c = G.cars.filter(c => c.userData.mode !== 'wreck' && c.position.distanceTo(P.pos) < 80)[0]; if (!c) return; F.ignite(c, { I: 0.8, by: 'test' }); await frames(900); },
    async schiessen() { W.give('pistol', 30); W.select('pistol', true); for (let k = 0; k < 6; k++) { G.camYaw.v = rnd(-3.1, 3.1); W.press(true); await frames(3); W.press(false); await frames(25); } },
    async demo() { const [dx, dz] = freeAt(P.pos.x + rnd(-30, 30), P.pos.z + rnd(-30, 30)); const d = D.spawnDemo({ x: dx, z: dz, n: Math.round(rnd(10, 26)), tension: rnd(0.2, 0.7) }); if (!d) return; for (let k = 0; k < 12; k++) { if (Math.random() < 0.5) d.tension = Math.min(1, d.tension + 0.15); await frames(300); } },
    async story() { const st = G.STORY; const sid = pick(Object.keys(st.STORIES || { s1: 1 })); try { st.useStory(sid); st.S.state = 'active'; st.beginChapter(Math.floor(rnd(0, st.CH.length))); await frames(900); } finally { try { st.stop(); } catch (e) {} } },
    async speichern() { G.saveGame(); await frames(5); const m = document.getElementById('msg').textContent; if (/FEHLGESCHLAGEN/.test(m)) add(S, 'Speichern fehlgeschlagen', m); jumpOk(); G.loadGame(); await frames(60); },
    async kreativ() { G.toggleCreative(); await frames(30); for (let k = 0; k < 3; k++) { G.creativePlace(); await frames(30); } G.toggleCreative(); await frames(30); },
    async wetter() { G.opts.weather = pick(['clear', 'rain', 'storm', 'fog']); G.weather.kind = G.opts.weather; G.world.hour = rnd(0, 24); await frames(60); G.opts.weather = 'auto'; },
    // Autobahn: auf eine von acht Strecken setzen, Autopilot folgt der Fahrbahn mit Vollgas (A661, A5, A66, A3 ...)
    async autobahn() {
      const SPOTS = [[3945, -1303], [-15126, 3030], [-2272, 7591], [-7711, 9122], [-13985, 10544], [-7081, -4553], [-10006, 79]]; const [sx, sz] = pick(SPOTS);
      placeAt(sx + 40, sz + 40); await G.streamInit(sx, sz); placeAt(sx + 40, sz + 40); await frames(30);
      let best = null, bd = 400 * 400; for (const r of G.WORLD.roads) { if (!r.mw || r.w < 10) continue; for (let i = 0; i < r.p.length - 1; i++) { const d = (r.p[i][0] - sx) ** 2 + (r.p[i][1] - sz) ** 2; if (d < bd) { bd = d; best = [r, i]; } } }
      if (!best) { add(S, 'Autobahn nicht gefunden', `${sx},${sz}`); return; }
      const moto = G.makeMoto && Math.random() < 0.33; const c = spawnOn(moto ? G.makeMoto() : G.makeCar(false), best[0], best[1]); if (!enter(c, 'Autobahn')) return;
      const st = await autopilot(c, best[0], best[1], 45, { name: moto ? 'Motorrad (Autobahn)' : 'Auto (Autobahn)', mwOnly: true, fast: true });
      S.autobahn = (S.autobahn || []).concat([[st.dist, st.vmax, moto ? 'M' : 'A']]); if (P.car) { jumpOk(5); G.toggleCar(); } },
    // Fahrrad: wie ein Spieler ein abgestelltes Rad suchen (Fahrradständer, Straßenrand), aufsteigen, durch die Straßen radeln, absteigen
    async rad() { await zweirad(false); },
    // Motorrad: abgestelltes nehmen oder einem Motorradfahrer abnehmen, durch die Stadt fahren
    async motorrad() { await zweirad(true); },
    // Christoph 2: zur BG Unfallklinik, Aufzug (F), einsteigen, abheben, Runde fliegen, irgendwo landen, aussteigen
    async fliegen() {
      const HL = G.HELI; if (!HL) return; placeAt(-200, -1715); await G.streamInit(-200, -1715); placeAt(-200, -1715); for (let k = 0; k < 20 && !HL.site; k++) await frames(30); const S2 = HL.site; if (!S2) { add(S, 'Landeplatz BGU fehlt', ''); return; }
      for (let k = 0; k < 10 && !HL.heli; k++) await frames(30); const H = HL.heli; if (!H) { add(S, 'Christoph 2 fehlt', ''); return; }
      jumpOk(); P.pos.set(S2.ground[0], G.TH(S2.ground[0], S2.ground[1]), S2.ground[1]); if (P.mesh) P.mesh.position.copy(P.pos); await frames(10); jumpOk(200);
      dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', key: 'f', bubbles: true })); dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF', key: 'f', bubbles: true })); await new Promise(r => setTimeout(r, 1300)); await frames(20);
      if (Math.abs(P.pos.y - S2.roofSpot[2]) > 1.5) { add(S, 'Aufzug zum Landeplatz klappt nicht', `y ${P.pos.y.toFixed(1)} statt ${S2.roofSpot[2].toFixed(1)}`); return; }
      if (H.userData.mode === 'wreck') return; jumpOk(); P.pos.set(H.position.x + 4, H.position.y, H.position.z); if (P.mesh) P.mesh.position.copy(P.pos); await frames(5); G.toggleCar(); if (P.car !== H) { add(S, 'Einsteigen in Christoph 2 klappt nicht', ''); return; }
      await frames(330); G.keys.Space = true; await frames(rnd(150, 400)); G.keys.Space = false; let maxV = 0, minAlt = 1e9;
      for (let k = 0; k < 6; k++) { G.keys.KeyW = Math.random() < 0.8; G.keys.KeyA = Math.random() < 0.3; G.keys.KeyD = !G.keys.KeyA && Math.random() < 0.3; G.keys.Space = Math.random() < 0.2; G.keys.ShiftLeft = !G.keys.Space && Math.random() < 0.15; await frames(rnd(90, 240)); maxV = Math.max(maxV, H.userData.speed); minAlt = Math.min(minAlt, H.userData.alt || 0); if (H.userData.mode === 'wreck') break; }
      keysOff(); await frames(240); G.keys.ShiftLeft = true; for (let k = 0; k < 50 && P.car === H && !H.userData.landed; k++) await frames(30); keysOff(); await frames(30);
      S.log.push(`${Math.round(S.t)}s Flug: max ${Math.round(maxV * 3.6)} km/h, ${H.userData.landed ? 'gelandet' : 'nicht gelandet'}, hp ${Math.round(H.userData.hp)}`);
      if (P.car === H && !H.userData.landed) add(S, 'Christoph 2 landet nicht', `Höhe ${Math.round(H.userData.alt || 0)} m`);
      if (P.car === H) { jumpOk(5); G.toggleCar(); await frames(10); if (P.car) add(S, 'Aussteigen aus Christoph 2 klappt nicht', ''); else if (G.solidAtH(P.pos.x, P.pos.z, P.pos.y + 0.5) !== -1) add(S, 'Nach Landung im Gebäude', ''); } },
    // echte Tastendrücke wie ein Spieler (Tastatur-Handler, Menüs, Overlays), nicht nur Funktionsaufrufe
    async tasten() { const key = async (code, hold = 3) => { jumpOk(hold + 40); /* F/E können Innenräume betreten (gewollter Sprung) */ dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true })); await frames(hold); dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true })); await frames(5); };
      for (let k = 0; k < 6; k++) { const c = pick(['KeyH', 'KeyL', 'Tab', 'KeyM', 'KeyV', 'KeyF', 'KeyE', 'KeyR', 'KeyG', 'KeyQ', 'Digit1', 'Digit2', 'Digit3', 'KeyX']); await key(c, c === 'KeyH' ? 40 : 3); await frames(rnd(20, 90)); }
      for (const c of ['Tab', 'KeyM']) { const o = c === 'Tab' ? document.getElementById('tabov') : document.getElementById('bigmap'); if (o && getComputedStyle(o).display !== 'none') await key(c); }
      const mm = document.getElementById('metromenu'); if (mm && mm.style.display !== 'none') { const x = mm.querySelector('#mm_x'); if (x) x.click(); else mm.style.display = 'none'; }
      if (G.X.shopOpen && G.SHOPS) G.SHOPS.close(); if (G.INTERIORS.inside) { jumpOk(); G.INTERIORS.leave(); } window.__noAutoMenu = true; },
    async menue() { const m = document.getElementById('menu'); dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true })); await frames(10); if (!m || getComputedStyle(m).display === 'none') { add(S, 'Menü öffnet nicht mit Esc', ''); return; }
      const tabs = [...m.querySelectorAll('.tabs button[data-tab]')]; /* nur Reiter: nie Startseite, Fehler melden, Export, Neues Spiel */ for (let k = 0; k < 4 && tabs.length; k++) { pick(tabs).dispatchEvent(new MouseEvent('click', { bubbles: true })); await frames(5); }
      if (getComputedStyle(m).display !== 'none') { dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true })); await frames(10); } if (getComputedStyle(m).display !== 'none' && G.X.closeMenu) G.X.closeMenu(); if (getComputedStyle(m).display !== 'none') add(S, 'Menü schließt nicht', ''); },
    async sondersignal() { const [fx, fz] = freeAt(P.pos.x + 3, P.pos.z); const pc = G.makeCar(true); pc.position.set(fx, G.TH(fx, fz), fz); pc.userData.mode = 'parked'; G.scene.add(pc); G.cars.push(pc); jumpOk(); P.pos.set(pc.position.x + 1, pc.position.y, pc.position.z); G.toggleCar(); if (P.car !== pc) return; pc.userData.siren = true; G.keys.KeyW = true; await frames(400); keysOff(); pc.userData.siren = false; jumpOk(); G.toggleCar(); },
  };
  const weights = opt.weights || { laufen: 3, fahren: 5, reisen: 2, ubahn: 1.5, laden: 1, haus: 1, explosion: 2, feuer: 1, schiessen: 1.5, demo: 1.5, story: 1, speichern: 1, kreativ: 0.5, wetter: 1, sondersignal: 0.7, tasten: 1.5, menue: 0.7, autobahn: 1.5, fliegen: 1.2, rad: 1.5, motorrad: 1.2 };
  const bag = Object.entries(weights).flatMap(([k, w]) => Array(Math.round(w * 2)).fill(k));
  while (S.t < end && !S.stop) {
    const name = opt.only ? pick(opt.only) : pick(bag); S.action = name; S.actions[name] = (S.actions[name] || 0) + 1; (S.hist = S.hist || []).push(`${mmss(S.t)} ${name}`);
    if (P.dead) { G.keys.Enter = true; await frames(10); G.keys.Enter = false; jumpOk(); }
    try { await ACTIONS[name](); } catch (e) { add(S, 'Fehler in Aktion ' + name, String(e && e.stack || e).slice(0, 300)); }
    keysOff(); window.__noAutoMenu = true; await frames(20);
  }
  const geo1 = G.renderer.info.memory.geometries; if (geo1 > geo0 * 3 && geo1 - geo0 > 1500) add(S, 'Speicher wächst (Geometrien)', `${geo0} -> ${geo1}`);
}

// Bug-Jäger: spielt zufällig und wild (laufen, Autos klauen und rasen, U-Bahn, Läden, Häuser, Granaten, Feuer,
// Demos, Storys, Speichern/Laden, Reisen quer durch Frankfurt) und protokolliert alles Auffällige.
// Im Browser laden (Spiel muss bereit sein, `G.CITY` gesetzt):
//   const B = await import('/tools/bugjaeger.js?' + Date.now()); B.start({ minutes: 20 });   // läuft im Hintergrund
//   window.__bj  -> { running, t, actions, findings: [...], summary }
// Ein Fund = { typ, n, erstesMal, wo, detail, aktion }. Gleiche Funde in der Nähe werden zusammengefasst.
const G = window.G;
const rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)];
const sleep0 = () => new Promise(r => setTimeout(r, 0));

export function start(opt = {}) {
  if (window.__bj && window.__bj.running) return window.__bj;
  const S = window.__bj = { running: true, t: 0, frames: 0, actions: {}, action: '', findings: [], log: [], maxFrameMs: 0, slowFrames: 0, stop: false, opt };
  run(S, opt).catch(e => { add(S, 'Absturz des Bug-Jägers', String(e && e.stack || e).slice(0, 400)); }).finally(() => { S.running = false; S.summary = summary(S); });
  return S;
}
export function stop() { if (window.__bj) window.__bj.stop = true; }

function where(o) { const p = o || (G.player.car ? G.player.car.position : G.player.pos); return { x: Math.round(p.x), z: Math.round(p.z), str: (document.getElementById('street') || {}).textContent || '' }; }
function add(S, typ, detail, pos) {
  const w = where(pos); const key = typ + '|' + Math.round(w.x / 60) + ',' + Math.round(w.z / 60);
  let f = S.findings.find(f => f.key === key);
  if (!f) { f = { key, typ, n: 0, erstesMal: Math.round(S.t) + ' s', wo: `${w.x},${w.z} ${w.str}`, detail: String(detail).slice(0, 300), aktion: S.action }; S.findings.push(f); S.log.push(`${Math.round(S.t)}s ${typ}: ${f.detail} @ ${f.wo} (${S.action})`); }
  f.n++;
}
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
  const onErr = e => add(S, 'JS-Fehler', (e.message || e.reason || e) + (e.filename ? ' @ ' + e.filename.split('/').pop() + ':' + e.lineno : ''));
  addEventListener('error', onErr); addEventListener('unhandledrejection', onErr);
  // Wächter: laufen nach jedem 10. Bild
  let expectJump = 0, lastPos = P.pos.clone(), insideT = 0, carInT = 0, loadT = 0, geo0 = G.renderer.info.memory.geometries, under = 0;
  const pedIn = new Map(), carStuck = new Map(), carIn = new Map();
  const solidBody = (x, z, y) => G.solidAtH(x, z, y + 0.5) !== -1;
  const nearDemo = p => G.DEMO.demos.some(d => d.members.some(m => m.position.distanceTo(p) < 80) || (d.pol && d.pol.cars || []).some(c => c.position && c.position.distanceTo(p) < 60));
  function watch(dt) {
    const p = P.car ? P.car.position : P.pos;
    if (![p.x, p.y, p.z].every(Number.isFinite)) add(S, 'Position ungültig (NaN)', JSON.stringify([p.x, p.y, p.z]));
    if (!Number.isFinite(P.hp) || !Number.isFinite(P.money)) add(S, 'Werte ungültig', `hp ${P.hp} geld ${P.money}`);
    if (P.money < 0) add(S, 'Geld negativ', P.money);
    const inPocket = G.X.inPocket && G.X.inPocket(p.x, p.z);
    if (!inPocket && !P.dead) {
      const gy = G.TH(p.x, p.z); if (p.y < gy - 1.5) { under += dt; if (under > 1) { add(S, 'Unter dem Boden', `y ${p.y.toFixed(1)} Gelände ${gy.toFixed(1)}`); under = 0; } } else under = 0;
      if (!P.car && solidBody(P.pos.x, P.pos.z, P.pos.y)) { insideT += dt; if (insideT > 1.5) { add(S, 'Spieler steckt im Gebäude', `y ${P.pos.y.toFixed(1)}`); insideT = 0; } } else insideT = 0;
      if (P.car && G.solidAt(p.x, p.z) >= 0 && p.y < G.TH(p.x, p.z) + 3) { carInT += dt; if (carInT > 1.5) { add(S, 'Eigenes Auto steckt im Gebäude', P.car.userData.type?.name || ''); carInT = 0; } } else carInT = 0;
    }
    const jump = lastPos.distanceTo(p); if (jump > 40 && !expectJump) add(S, 'Plötzlich versetzt', `${Math.round(jump)} m in einem Schritt`); lastPos.copy(p);
    const msg = document.getElementById('msg'); if (msg && msg.style.display !== 'none' && /LADE STADT/.test(msg.textContent)) { loadT += dt; if (loadT > 12) { add(S, '„LADE STADT“ hängt', `${Math.round(loadT)} s`); loadT = 0; } } else loadT = 0;
    if (/FEHLGESCHLAGEN/.test((msg || {}).textContent || '') && msg.style.display !== 'none') add(S, 'Meldung „fehlgeschlagen“', msg.textContent);
    // Passanten und Autos in Gebäuden (länger als 3 s)
    const now = S.t;
    for (const h of G.peds) { const u = h.userData; if (u.state === 'dead' || !h.visible || h.position.distanceTo(P.pos) > 120) continue; if (solidBody(h.position.x, h.position.z, h.position.y)) { const t0 = pedIn.get(h) ?? now; pedIn.set(h, t0); if (now - t0 > 3) { add(S, 'Figur steckt im Gebäude', `${u.state}${u.cop ? ' Polizei' : ''}${u.ff ? ' Feuerwehr' : ''}${u.demo ? ' Demo' : ''} y ${h.position.y.toFixed(1)}`, h.position); pedIn.set(h, now + 1e9); } } else pedIn.delete(h); }
    for (const c of G.cars) { const u = c.userData; if (c === P.car || u.mode === 'wreck' || c.position.distanceTo(P.pos) > 150) continue; if (G.solidAt(c.position.x, c.position.z) >= 0 && c.position.y < G.TH(c.position.x, c.position.z) + 3) { const t0 = carIn.get(c) ?? now; carIn.set(c, t0); if (now - t0 > 2) { add(S, 'Fahrzeug im Gebäude', `${u.mode}${u.cannon ? ' Wasserwerfer' : ''}${u.police ? ' Polizei' : ''}${u.brigade ? ' Feuerwehr' : ''} speed ${(u.speed||0).toFixed(1)}`, c.position); carIn.set(c, now + 1e9); } } else carIn.delete(c);
      if (u.mode === 'ai' && Math.abs(u.speed || 0) < 0.2 && !nearDemo(c.position)) { const t0 = carStuck.get(c) ?? now; carStuck.set(c, t0); if (now - t0 > 60) { add(S, 'KI-Auto steht über 60 s', u.road && u.road.n || '', c.position); carStuck.set(c, now + 1e9); } } else carStuck.delete(c); }
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
  const placeAt = (x, z) => { [x, z] = freeAt(x, z); jumpOk(); if (P.car) G.toggleCar(); P.pos.set(x, G.TH(x, z), z); if (P.mesh) P.mesh.position.copy(P.pos); lastPos.copy(P.pos); };
  const keysOff = () => { for (const k of Object.keys(G.keys)) G.keys[k] = false; };
  const I = G.INTERIORS, D = G.DEMO, W = G.WPN, F = G.FIRE, T = G.THREE;

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
    async demo() { const d = D.spawnDemo({ x: P.pos.x + rnd(-30, 30), z: P.pos.z + rnd(-30, 30), n: Math.round(rnd(10, 26)), tension: rnd(0.2, 0.7) }); if (!d) return; for (let k = 0; k < 12; k++) { if (Math.random() < 0.5) d.tension = Math.min(1, d.tension + 0.15); await frames(300); } },
    async story() { const st = G.STORY; const sid = pick(Object.keys(st.STORIES || { s1: 1 })); try { st.useStory(sid); st.S.state = 'active'; st.beginChapter(Math.floor(rnd(0, st.CH.length))); await frames(900); } finally { try { st.stop(); } catch (e) {} } },
    async speichern() { G.saveGame(); await frames(5); const m = document.getElementById('msg').textContent; if (/FEHLGESCHLAGEN/.test(m)) add(S, 'Speichern fehlgeschlagen', m); jumpOk(); G.loadGame(); await frames(60); },
    async kreativ() { G.toggleCreative(); await frames(30); for (let k = 0; k < 3; k++) { G.creativePlace(); await frames(30); } G.toggleCreative(); await frames(30); },
    async wetter() { G.opts.weather = pick(['clear', 'rain', 'storm', 'fog']); G.weather.kind = G.opts.weather; G.world.hour = rnd(0, 24); await frames(60); G.opts.weather = 'auto'; },
    async sondersignal() { const [fx, fz] = freeAt(P.pos.x + 3, P.pos.z); const pc = G.makeCar(true); pc.position.set(fx, G.TH(fx, fz), fz); pc.userData.mode = 'parked'; G.scene.add(pc); G.cars.push(pc); jumpOk(); P.pos.set(pc.position.x + 1, pc.position.y, pc.position.z); G.toggleCar(); if (P.car !== pc) return; pc.userData.siren = true; G.keys.KeyW = true; await frames(400); keysOff(); pc.userData.siren = false; jumpOk(); G.toggleCar(); },
  };
  const weights = opt.weights || { laufen: 3, fahren: 5, reisen: 2, ubahn: 1.5, laden: 1, haus: 1, explosion: 2, feuer: 1, schiessen: 1.5, demo: 1.5, story: 1, speichern: 1, kreativ: 0.5, wetter: 1, sondersignal: 0.7 };
  const bag = Object.entries(weights).flatMap(([k, w]) => Array(Math.round(w * 2)).fill(k));
  while (S.t < end && !S.stop) {
    const name = opt.only ? pick(opt.only) : pick(bag); S.action = name; S.actions[name] = (S.actions[name] || 0) + 1;
    if (P.dead) { G.keys.Enter = true; await frames(10); G.keys.Enter = false; jumpOk(); }
    try { await ACTIONS[name](); } catch (e) { add(S, 'Fehler in Aktion ' + name, String(e && e.stack || e).slice(0, 300)); }
    keysOff(); await frames(20);
  }
  const geo1 = G.renderer.info.memory.geometries; if (geo1 > geo0 * 3 && geo1 - geo0 > 1500) add(S, 'Speicher wächst (Geometrien)', `${geo0} -> ${geo1}`);
  console.error = origErr; removeEventListener('error', onErr); removeEventListener('unhandledrejection', onErr);
  G.opts.god = false;
}

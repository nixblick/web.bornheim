// Laufrunden (#128, André 13.11.2026: „fussgänger sollen immer mal missionen anbieten. joggen in der stadt. bestimmte runde.
// zB. verbessert körperliche fitness.“). Ein Passant mit Läufer-Symbol lädt ein, F startet. Die Runde führt über 4–6 Wegpunkte
// auf Straßen rund um den Startpunkt (1–3 km) zurück zum Start, der Passant läuft hinter dem Spieler mit.
// Zu Fuß, gehen und rennen zählen; Auto oder Rad bricht ab. Belohnung: Fitness (progress.js, Ereignis 'fitness') und EP.
// Höchstens eine Einladung je Ingame-Stunde, nicht bei Fahndung, nicht im Auto, nicht während Vokabaum-Mission.
import { initWegweiser } from './wegweiser.js';
/** @param {import('./types').Ctx} X */
export function initLaufrunden(X) {
  const { THREE, scene, player, peds, world, showMsg, card, sfx, canvasTex, TH } = X;
  let ped = null, offerT = 0, lastHour = null, scanT = 0, run = null;

  const sym = new THREE.SpriteMaterial({ map: canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#3fbf6a'; c.beginPath(); c.arc(32, 32, 28, 0, 7); c.fill(); c.font = '34px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('🏃', w / 2, h / 2 + 2); }), depthTest: false });
  const mark = new THREE.Sprite(sym); mark.scale.set(0.7, 0.7, 0.7); mark.visible = false; mark.renderOrder = 10; scene.add(mark);
  // Ring, Strahl, Kartenlinie und Richtungsanzeige: wegweiser.js (gemeinsam mit eulen.js)
  const WEG = X.WEG || (X.WEG = initWegweiser(X));

  const hoursSince = h => lastHour === null ? 99 : (h - lastHour + 24) % 24;
  const blocked = () => player.car || player.dead || player.wanted > 0 || (X.inPocket && X.inPocket(player.pos.x, player.pos.z)) || (X.creative && X.creative.on) || (X.VOKA_BUSY && X.VOKA_BUSY()) || (!run && !!WEG.cur);
  const okPed = p => { const u = p.userData; return p.visible && u.state === 'walk' && !u.cop && !u.demo && !u.follow && !u.medic && !u.ff && !u.keep && !u.car && !u.vokabaum; };
  function release(cool) { if (ped) { const u = ped.userData; u.keep = false; u.laufrunde = false; if (u.lrSpeed !== undefined) { u.speed = u.lrSpeed; delete u.lrSpeed; } } ped = null; mark.visible = false; if (cool) lastHour = world.hour; }
  function offer(p) { ped = p; const u = p.userData; u.keep = true; u.laufrunde = true; u.lrSpeed = u.speed; u.speed = 0; offerT = 90; mark.visible = true; }
  function tryOffer() { if (ped || run || blocked() || hoursSince(world.hour) < 1) return; let best = null, bd = 1e9; for (const p of peds) { if (!okPed(p)) continue; const d = p.position.distanceTo(player.pos); if (d > 6 && d < 28 && d < bd) { bd = d; best = p; } } if (best) offer(best); }

  // Runde nur auf Straßen (André 15.11.2026: „Punkt 7/8 war in einem Innenhof … Strecken nur auf Straßen, und das Navi
  // der Strecke soll auch nur Straße sein, keine Hinterhöfe“). Das Netz sind die benannten Straßen um den Start: keine
  // Fußwege, keine namenlosen Zufahrten (das sind die Höfe), keine Autobahn. Wegpunkte sind Knoten dieses Netzes, die vom
  // Start aus erreichbar sind; zwischen ihnen führt der kürzeste Weg über die Straßen (pfad, für Karte und Richtungspfeil).
  function netz(x0, z0, R) {
    const N = new Map(), W = X.WORLD, roads = (W && W.roads) || [];
    const node = p => { const k = Math.round(p[0] * 2) + '_' + Math.round(p[1] * 2); let n = N.get(k); if (!n) N.set(k, n = { x: p[0], z: p[1], w: 0, e: [] }); return n; };
    for (const r of roads) { if (!r || !r.n || r.ped || r.mw || !r.p || r.p.length < 2) continue;
      for (let i = 0; i < r.p.length - 1; i++) { const p = r.p[i], q = r.p[i + 1]; if (Math.hypot(p[0] - x0, p[1] - z0) > R && Math.hypot(q[0] - x0, q[1] - z0) > R) continue;
        const u = node(p), v = node(q), l = Math.hypot(p[0] - q[0], p[1] - q[1]); if (u === v) continue; u.e.push([v, l]); v.e.push([u, l]); u.w = Math.max(u.w, r.w || 6); v.w = Math.max(v.w, r.w || 6); } }
    return [...N.values()];
  }
  /** Kürzeste Wege ab Knoten s: setzt n.d (Strecke) und n.v (Vorgänger) auf allen erreichbaren Knoten. */
  let wegeNr = 0;
  function wege(nodes, s) {
    const lauf = ++wegeNr; for (const n of nodes) { n.d = Infinity; n.v = null; } s.d = 0; const H = [s];
    while (H.length) { let bi = 0; for (let i = 1; i < H.length; i++) if (H[i].d < H[bi].d) bi = i; const u = H[bi]; H[bi] = H[H.length - 1]; H.pop(); if (u.fertig === lauf) continue; u.fertig = lauf;
      for (const [v, l] of u.e) if (u.d + l < v.d) { v.d = u.d + l; v.v = u; H.push(v); } }
  }
  const zurueck = n => { const p = []; for (let q = n; q; q = q.v) p.push([q.x, q.z]); return p.reverse(); };
  function plan(x0, z0) {
    const R = 120 + Math.random() * 260, n = 4 + Math.floor(Math.random() * 3), a0 = Math.random() * Math.PI * 2;
    const leer = { pts: [], len: 0, x0, z0, pfad: [], pfadI: [], rad: [] };
    const nodes = netz(x0, z0, R + 220); if (nodes.length < 8) return leer;
    let s0 = null, sd = 60; for (const q of nodes) { const d = Math.hypot(q.x - x0, q.z - z0); if (d < sd) { sd = d; s0 = q; } } if (!s0) return leer; // keine Straße in 60 m: keine Runde
    wege(nodes, s0); const erreichbar = nodes.filter(q => q.d < Infinity);
    // erster Punkt 50–70 m vom Start (André 13.11.: „unter 100 m“), damit der Weg gleich sichtbar losgeht; danach der Kreis
    const ziele = [];
    for (let i = 0; i <= n; i++) { const a = a0 + i / (n + 1) * Math.PI * 2, rr = i ? R : 50 + Math.random() * 20, tx = x0 + Math.sin(a) * rr, tz = z0 + Math.cos(a) * rr;
      let best = null, bd = i ? 90 : 60; for (const q of erreichbar) { if (q === s0 || ziele.includes(q)) continue; const d0 = Math.hypot(q.x - x0, q.z - z0); if (!i && (d0 < 30 || d0 > 95)) continue; const d = Math.hypot(q.x - tx, q.z - tz); if (d < bd && !ziele.some(z => Math.hypot(z.x - q.x, z.z - q.z) < 40)) { bd = d; best = q; } }
      if (best) ziele.push(best); }
    if (ziele.length < 3) return leer;
    ziele.push(s0);
    const pts = [], pfad = [[x0, z0]], pfadI = [], rad = []; let von = s0, len = sd;
    for (const z of ziele) { wege(nodes, von); if (!(z.d < Infinity)) return leer; const p = zurueck(z); for (let k = 1; k < p.length; k++) pfad.push(p[k]); if (p.length < 2 && z !== von) return leer;
      len += z.d; pts.push([z.x, z.z]); pfadI.push(pfad.length - 1); rad.push(5 + (z.w || 6) / 2); von = z; }
    // Schluss: vom Straßenpunkt zurück zum Startplatz (dort stand der Spieler, also erreichbar)
    pts[pts.length - 1] = [x0, z0]; pfad.push([x0, z0]); pfadI[pfadI.length - 1] = pfad.length - 1; rad[rad.length - 1] = 4.5; len += sd;
    return { pts, len, x0, z0, pfad, pfadI, rad }; }

  function start() { if (!ped || !WEG.frei()) return false; const p = plan(player.pos.x, player.pos.z); if (p.pts.length < 4) { showMsg('KEINE RUNDE GEFUNDEN', 1500); release(true); return false; }
    run = { ...p, i: 0, t0: performance.now(), buddy: ped }; mark.visible = false; WEG.route({ pts: p.pts, pfad: p.pfad, pfadI: p.pfadI, get i() { return run ? run.i : 0; }, from: [p.x0, p.z0], label: '🏃 Laufrunde' }); sfx('bell', 0.5);
    card('LAUFRUNDE', `${(p.len / 1000).toFixed(1)} km · ${p.pts.length} Wegpunkte · zu Fuß (gehen oder rennen), der grünen Linie über die Straßen folgen`, 5); return true; }
  function abort(msg) { run = null; WEG.route(null); release(true); if (msg) showMsg(msg, 1600); }
  function finish() { const r = run; run = null; WEG.route(null); const s = Math.round((performance.now() - r.t0) / 1000); const km = r.len / 1000;
    const fit = Math.max(2, Math.min(10, Math.round(km * 3))); // 3 Fitness-Punkte je km, 2–10 je Runde: 100 Punkte nach etwa 10–15 Runden
    if (X.emit) { X.emit('fitness', player.pos, { n: fit }); } if (X.PROGRESS_GAIN) X.PROGRESS_GAIN(Math.round(km * 40), 'Laufrunde');
    sfx('pickup'); card('RUNDE GESCHAFFT', `${km.toFixed(1)} km in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min · Fitness +${fit} · „Danke fürs Mitlaufen!“`, 7); release(true); }

  X.fHooks = X.fHooks || [];
  X.fHooks.push(() => { if (!ped || run || blocked()) return null; if (ped.position.distanceTo(player.pos) > 3) return null; return { label: 'F · Passant: „Läufst du ’ne Runde mit?“', act: () => { start(); } }; });

  function update(dt) {
    if (run) { if (player.dead) return abort(); if (player.car) return abort('LAUFRUNDE ABGEBROCHEN: NUR ZU FUSS');
      const [x, z] = run.pts[run.i]; WEG.update(dt);
      if (run.buddy && peds.includes(run.buddy)) { const b = run.buddy, dx = player.pos.x - b.position.x, dz = player.pos.z - b.position.z, d = Math.hypot(dx, dz); if (d > 2.5) { const k = Math.min(1, (d - 2.5) / d); b.position.x += dx * k; b.position.z += dz * k; b.position.y = TH(b.position.x, b.position.z); b.rotation.y = Math.atan2(dx, dz); } }
      if (Math.hypot(x - player.pos.x, z - player.pos.z) < (run.rad[run.i] || 4.5)) { run.i++; /* Punkt liegt auf der Fahrbahnmitte: auch vom Gehweg aus erreicht */ sfx('click', 0.6); if (run.i >= run.pts.length) finish(); else showMsg(`WEGPUNKT ${run.i}/${run.pts.length}`, 900); }
      return; }
    if (ped) { const u = ped.userData; offerT -= dt; if (!peds.includes(ped) || u.state !== 'walk' || offerT <= 0 || blocked() || ped.position.distanceTo(player.pos) > 60) { release(true); return; } mark.position.set(ped.position.x, ped.position.y + 2.3 + Math.sin(performance.now() / 250) * 0.08, ped.position.z); }
    scanT -= dt; if (scanT <= 0) { scanT = 2; if (Math.random() < 0.2) tryOffer(); } }
  // Testhilfe: G.LAUF.force() setzt die Stunden-Sperre zurück, sucht einen Passanten und startet
  function force() { if (!WEG.frei()) return false; lastHour = null; release(false); tryOffer(); if (!ped) { let best = null, bd = 1e9; for (const p of peds) { if (!okPed(p)) continue; const d = p.position.distanceTo(player.pos); if (d < bd) { bd = d; best = p; } } if (best && bd < 120) offer(best); } return start(); }
  return { update, force, tryOffer, start, stop: () => { if (run) abort('LAUFRUNDE ABGEBROCHEN'); }, get run() { return run; }, get ped() { return ped; }, weg: WEG };
}

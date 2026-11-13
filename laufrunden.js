// Laufrunden (#128, André 13.11.2026: „fussgänger sollen immer mal missionen anbieten. joggen in der stadt. bestimmte runde.
// zB. verbessert körperliche fitness.“). Ein Passant mit Läufer-Symbol lädt ein, F startet. Die Runde führt über 4–6 Wegpunkte
// auf Gehwegen rund um den Startpunkt (1–3 km) zurück zum Start, der Passant läuft hinter dem Spieler mit.
// Zu Fuß, gehen und rennen zählen; Auto oder Rad bricht ab. Belohnung: Fitness (progress.js, Ereignis 'fitness') und EP.
// Höchstens eine Einladung je Ingame-Stunde, nicht bei Fahndung, nicht im Auto, nicht während Vokabaum-Mission.
/** @param {import('./types').Ctx} X */
export function initLaufrunden(X) {
  const { THREE, scene, player, peds, world, showMsg, card, sfx, canvasTex, TH, solidAt } = X;
  let ped = null, offerT = 0, lastHour = null, scanT = 0, run = null;

  const sym = new THREE.SpriteMaterial({ map: canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#3fbf6a'; c.beginPath(); c.arc(32, 32, 28, 0, 7); c.fill(); c.font = '34px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('🏃', w / 2, h / 2 + 2); }), depthTest: false });
  const mark = new THREE.Sprite(sym); mark.scale.set(0.7, 0.7, 0.7); mark.visible = false; mark.renderOrder = 10; scene.add(mark);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x3fbf6a, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.18, 8, 32), ringMat); ring.rotation.x = Math.PI / 2; ring.visible = false; scene.add(ring);

  const hoursSince = h => lastHour === null ? 99 : (h - lastHour + 24) % 24;
  const blocked = () => player.car || player.dead || player.wanted > 0 || (X.inPocket && X.inPocket(player.pos.x, player.pos.z)) || (X.creative && X.creative.on) || (X.VOKA_BUSY && X.VOKA_BUSY());
  const okPed = p => { const u = p.userData; return p.visible && u.state === 'walk' && !u.cop && !u.demo && !u.follow && !u.medic && !u.ff && !u.keep && !u.car && !u.vokabaum; };
  function release(cool) { if (ped) { const u = ped.userData; u.keep = false; u.laufrunde = false; if (u.lrSpeed !== undefined) { u.speed = u.lrSpeed; delete u.lrSpeed; } } ped = null; mark.visible = false; if (cool) lastHour = world.hour; }
  function offer(p) { ped = p; const u = p.userData; u.keep = true; u.laufrunde = true; u.lrSpeed = u.speed; u.speed = 0; offerT = 90; mark.visible = true; }
  function tryOffer() { if (ped || run || blocked() || hoursSince(world.hour) < 1) return; let best = null, bd = 1e9; for (const p of peds) { if (!okPed(p)) continue; const d = p.position.distanceTo(player.pos); if (d > 6 && d < 28 && d < bd) { bd = d; best = p; } } if (best) offer(best); }

  // Runde: Punkte auf einem Kreis um den Start, je auf den Gehweg geschoben und nicht im Haus; Länge aus der Summe der Abschnitte
  function plan(x0, z0) {
    const R = 120 + Math.random() * 260, n = 4 + Math.floor(Math.random() * 3), a0 = Math.random() * Math.PI * 2, pts = [];
    for (let i = 1; i <= n; i++) { const a = a0 + i / (n + 1) * Math.PI * 2; let x = x0 + Math.sin(a) * R, z = z0 + Math.cos(a) * R;
      if (X.pushOffRoads) { const q = X.pushOffRoads(x, z, 1.2); if (q) { x = q[0] ?? q.x ?? x; z = q[1] ?? q.z ?? z; } }
      let ok = solidAt(x, z) < 0; for (let k = 1; !ok && k < 12; k++) { const xx = x + Math.sin(k * 2.4) * k * 3, zz = z + Math.cos(k * 2.4) * k * 3; if (solidAt(xx, zz) < 0) { x = xx; z = zz; ok = true; } }
      if (ok) pts.push([x, z]); }
    pts.push([x0, z0]); let len = 0, px = x0, pz = z0; for (const [x, z] of pts) { len += Math.hypot(x - px, z - pz); px = x; pz = z; }
    return { pts, len }; }

  function start() { if (!ped) return false; const p = plan(player.pos.x, player.pos.z); if (p.pts.length < 4) { showMsg('KEINE RUNDE GEFUNDEN', 1500); release(true); return false; }
    run = { ...p, i: 0, t0: performance.now(), buddy: ped }; mark.visible = false; ring.visible = true; sfx('bell', 0.5);
    card('LAUFRUNDE', `${(p.len / 1000).toFixed(1)} km · ${p.pts.length} Wegpunkte · zu Fuß (gehen oder rennen), grüne Ringe folgen`, 5); return true; }
  function abort(msg) { run = null; ring.visible = false; release(true); if (msg) showMsg(msg, 1600); }
  function finish() { const r = run; run = null; ring.visible = false; const s = Math.round((performance.now() - r.t0) / 1000); const km = r.len / 1000;
    const fit = Math.max(2, Math.min(10, Math.round(km * 3))); // 3 Fitness-Punkte je km, 2–10 je Runde: 100 Punkte nach etwa 10–15 Runden
    if (X.emit) { X.emit('fitness', player.pos, { n: fit }); } if (X.PROGRESS_GAIN) X.PROGRESS_GAIN(Math.round(km * 40), 'Laufrunde');
    sfx('pickup'); card('RUNDE GESCHAFFT', `${km.toFixed(1)} km in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min · Fitness +${fit} · „Danke fürs Mitlaufen!“`, 7); release(true); }

  X.fHooks = X.fHooks || [];
  X.fHooks.push(() => { if (!ped || run || blocked()) return null; if (ped.position.distanceTo(player.pos) > 3) return null; return { label: 'F · Passant: „Läufst du ’ne Runde mit?“', act: () => { start(); } }; });

  function update(dt) {
    if (run) { if (player.dead) return abort(); if (player.car) return abort('LAUFRUNDE ABGEBROCHEN: NUR ZU FUSS');
      const [x, z] = run.pts[run.i]; ring.position.set(x, TH(x, z) + 0.3, z); ring.rotation.z += dt;
      if (run.buddy && peds.includes(run.buddy)) { const b = run.buddy, dx = player.pos.x - b.position.x, dz = player.pos.z - b.position.z, d = Math.hypot(dx, dz); if (d > 2.5) { const k = Math.min(1, (d - 2.5) / d); b.position.x += dx * k; b.position.z += dz * k; b.position.y = TH(b.position.x, b.position.z); b.rotation.y = Math.atan2(dx, dz); } }
      if (Math.hypot(x - player.pos.x, z - player.pos.z) < 4.5) { run.i++; sfx('click', 0.6); if (run.i >= run.pts.length) finish(); else showMsg(`WEGPUNKT ${run.i}/${run.pts.length}`, 900); }
      return; }
    if (ped) { const u = ped.userData; offerT -= dt; if (!peds.includes(ped) || u.state !== 'walk' || offerT <= 0 || blocked() || ped.position.distanceTo(player.pos) > 60) { release(true); return; } mark.position.set(ped.position.x, ped.position.y + 2.3 + Math.sin(performance.now() / 250) * 0.08, ped.position.z); }
    scanT -= dt; if (scanT <= 0) { scanT = 2; if (Math.random() < 0.2) tryOffer(); } }
  // Testhilfe: G.LAUF.force() setzt die Stunden-Sperre zurück, sucht einen Passanten und startet
  function force() { lastHour = null; release(false); tryOffer(); if (!ped) { let best = null, bd = 1e9; for (const p of peds) { if (!okPed(p)) continue; const d = p.position.distanceTo(player.pos); if (d < bd) { bd = d; best = p; } } if (best && bd < 120) offer(best); } return start(); }
  return { update, force, tryOffer, start, get run() { return run; }, get ped() { return ped; } };
}

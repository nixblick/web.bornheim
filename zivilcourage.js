// Zivilcourage-Mission (#129, André 13.11.2026): Ab und zu belästigt ein Passant einen anderen diskriminierend.
// Angezeigt wird nur die Einordnung („pöbelt rassistisch“ …), nie eine ausgeschriebene Beleidigung.
// F in der Nähe = Einschreiten ohne Gewalt (dazustellen, ansprechen, notfalls Hilfe rufen) → Karma +5 und EP über progress.js.
// Wegsehen (Szene läuft ab, Spieler war in Hörweite) → Karma −2. Zuschlagen gibt kein Karma; Fahndung wie bisher über damage().
/** @param {import('./types').Ctx} X */
export function initZivilcourage(X) {
  const { THREE, scene, player, peds, showMsg, sfx, canvasTex } = X;
  const ARTEN = [['rassistisch', 'pöbelt rassistisch'], ['sexistisch', 'belästigt sexistisch'], ['homophob', 'beleidigt homophob']];
  const DAUER = 30, HOER = 25, NAH = 4, LOHN = 5, STRAFE = 2;
  let sc = null, act = null, scanT = 20, coolT = 60;

  // ---------- Hinweis über dem Kopf: nur die Einordnung ----------
  const tex = {}; const label = k => tex[k] || (tex[k] = canvasTex(256, 64, (c, w, h) => { c.fillStyle = '#b3261e'; c.beginPath(); c.roundRect(2, 2, w - 4, h - 4, 14); c.fill(); c.fillStyle = '#fff'; c.font = 'bold 24px sans-serif'; c.textAlign = 'center'; c.fillText('⚠ ' + k, w / 2, 41); }, 1, 1));
  const mark = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true })); mark.scale.set(2.4, 0.6, 1); mark.visible = false; mark.renderOrder = 10; scene.add(mark);

  const blocked = () => player.car || player.dead || player.wanted > 0 || (X.inPocket && X.inPocket(player.pos.x, player.pos.z)) || (X.creative && X.creative.on) || (X.interiors && X.interiors.inside);
  const okPed = p => { const u = p.userData; return p.visible && u.state === 'walk' && !u.cop && !u.demo && !u.follow && !u.medic && !u.ff && !u.keep && !u.car; };
  const hold = p => { const u = p.userData; u.keep = true; u.zivil = true; u.zcSpeed = u.speed; u.speed = 0; u.zcHp = u.hp; };
  const free = p => { const u = p.userData; u.keep = false; u.zivil = false; if (u.zcSpeed !== undefined) { u.speed = u.zcSpeed; delete u.zcSpeed; } };
  const dist = p => p.position.distanceTo(player.pos);
  function end(cool = 90) { if (sc) { free(sc.a); free(sc.b); } sc = null; act = null; mark.visible = false; coolT = cool; }

  // a pöbelt, b ist betroffen
  function begin(a, b, art) { const [k, txt] = art || ARTEN[Math.floor(Math.random() * ARTEN.length)]; hold(a); hold(b); sc = { a, b, k, txt, t: DAUER, heard: false }; mark.material.map = label(txt); mark.material.needsUpdate = true; mark.visible = true; return sc; }
  function tryStart() { if (sc || blocked()) return; const c = peds.filter(p => okPed(p) && dist(p) > 8 && dist(p) < 40); if (c.length < 2) return;
    const a = c[Math.floor(Math.random() * c.length)]; let b = null, bd = 12; for (const p of c) { if (p === a) continue; const d = p.position.distanceTo(a.position); if (d < bd) { bd = d; b = p; } } if (b) begin(a, b); }

  // ---------- Einschreiten: kurze Szene in Schritten ----------
  const SCHRITTE = s => [[0, 'DU STELLST DICH DAZU'], [1.6, 'DU SPRICHST RUHIG AN: „LASS DAS. GEH WEITER.“'], ...(Math.random() < 0.4 ? [[3.2, 'DU RUFST HILFE (110)']] : []), [s ? 4.8 : 3.4, 'BETROFFENE PERSON: „DANKE!“']];
  function intervene() { if (!sc || act) return; act = { t: 0, steps: SCHRITTE(Math.random() < 0.4), i: 0 }; sfx('click', 0.6); }
  X.fHooks = X.fHooks || [];
  X.fHooks.push(() => { if (!sc || act || blocked()) return null; if (Math.min(dist(sc.a), dist(sc.b)) > NAH) return null; return { label: 'F · Einschreiten (ohne Gewalt)', act: intervene }; });

  function update(dt) {
    if (!sc) { coolT -= dt; scanT -= dt; if (scanT <= 0) { scanT = 5; if (coolT <= 0 && Math.random() < 0.15) tryStart(); } return; }
    const { a, b } = sc;
    // Gewalt gegen eine der beiden: Szene vorbei, kein Karma (Fahndung regelt damage() wie bisher)
    const hurt = p => !peds.includes(p) || p.userData.hp < p.userData.zcHp || p.userData.state !== 'walk';
    if (hurt(a) || hurt(b)) { if (dist(a) < HOER) showMsg('GEWALT IST KEIN EINSCHREITEN · KEIN KARMA', 1800); end(); return; }
    a.rotation.y = Math.atan2(b.position.x - a.position.x, b.position.z - a.position.z); b.rotation.y = Math.atan2(a.position.x - b.position.x, a.position.z - b.position.z);
    mark.position.set(a.position.x, a.position.y + 2.4 + Math.sin(performance.now() / 250) * 0.06, a.position.z);
    if (act) { act.t += dt; const st = act.steps; while (act.i < st.length && act.t >= st[act.i][0]) { showMsg(st[act.i][1], 1700, act.i === st.length - 1 ? 'ok' : undefined); act.i++; }
      if (act.i >= st.length && act.t >= st[st.length - 1][0] + 0.8) { const u = a.userData; free(a); u.state = 'flee'; u.fleeT = 5; u.fleeDir = null; X.emit('karma', player.pos, { n: LOHN, why: 'Zivilcourage' }); sc.ok = true; end(); }
      return; }
    if (dist(a) < HOER) { if (!sc.heard) showMsg('PASSANT ' + sc.txt.toUpperCase() + ' · F IN DER NÄHE: EINSCHREITEN', 2500); sc.heard = true; }
    sc.t -= dt; if (sc.t <= 0) { const weg = sc.heard; end(); if (weg) X.emit('karma', player.pos, { n: -STRAFE, why: 'Weggesehen' }); }
  }
  // Testhilfe für die Probe: G.ZIVIL.force() startet sofort eine Szene mit den zwei nächsten Passanten (legt notfalls welche an)
  function force(i = 0) { if (sc) end(0); const near = () => peds.filter(okPed).sort((p, q) => dist(p) - dist(q));
    let c = near(); for (let k = 0; c.length < 2 && k < 20; k++) { X.spawnPedAt(player.pos.x + 5 + k, player.pos.z + 3); c = near(); }
    return c.length >= 2 ? begin(c[0], c[1], ARTEN[i % ARTEN.length]) : null; }
  return { update, force, intervene, get scene() { return sc; }, get acting() { return !!act; } };
}

// Feuer (Autos, Mülltonnen, Brandflächen) und Feuerwehr (Löschfahrzeug, Trupp mit Schlauch, Absperrung, Rückzug bei Angriffen)
export function initFire(X, W, D) {
  const { THREE, scene, player, peds, cars, opts, TH, floorAt, solidAt, sfx, rnd, clamp, pick, moveWithCollision, canvasTex, explode, damage, animateWalk, makeHuman, lerpAngle } = X;
  const V3 = THREE.Vector3;
  const emit = (ev, pos, data) => { for (const f of X.listeners) f(ev, pos, data || {}); };

  // ---------- Flammen ----------
  const flameTex = canvasTex(64, 128, (ctx, w, h) => { const g = ctx.createRadialGradient(32, 96, 2, 32, 80, 60); g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.18, 'rgba(255,214,90,0.95)'); g.addColorStop(0.45, 'rgba(255,120,20,0.75)'); g.addColorStop(0.75, 'rgba(200,40,0,0.25)'); g.addColorStop(1, 'rgba(120,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(32, 2); ctx.bezierCurveTo(60, 50, 64, 90, 50, 120); ctx.lineTo(14, 120); ctx.bezierCurveTo(0, 90, 4, 50, 32, 2); ctx.fill(); });
  function makeFlames(n, spreadX, spreadZ) { const g = new THREE.Group(); const mat = new THREE.SpriteMaterial({ map: flameTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: 0xffffff });
    for (let i = 0; i < n; i++) { const s = new THREE.Sprite(mat); s.userData = { ox: rnd(-spreadX, spreadX), oz: rnd(-spreadZ, spreadZ), ph: rnd(0, 6.3), sz: rnd(0.8, 1.3) }; s.center.set(0.5, 0.05); g.add(s); } g.userData.mat = mat; scene.add(g); return g; }
  const fires = []; const bins = [];
  function fireAt(f) { if (f.car) return f.car.position; if (f.bin) return f.bin.position; return f.pos; }
  function ignite(target, o = {}) {
    let f;
    if (target && target.isObject3D && cars.includes(target)) { const c = target; if (c.userData.fire) { c.userData.fire.I = Math.max(c.userData.fire.I, o.I ?? 0.5); return c.userData.fire; } const D2 = c.userData.dims || { l: 4.4, w: 1.9 }; f = { car: c, I: o.I ?? 0.45, t: 0, g: makeFlames(c.userData.cannon ? 14 : 10, D2.w * 0.35, D2.l * 0.38), h: 0.7 }; c.userData.fire = f; }
    else if (target && target.userData && target.userData.bin) { const b = target; if (b.userData.fire) { b.userData.fire.I = Math.max(b.userData.fire.I, o.I ?? 0.6); return b.userData.fire; } f = { bin: b, I: o.I ?? 0.6, t: 0, g: makeFlames(5, 0.25, 0.25), h: 1.0 }; b.userData.fire = f; }
    else { const p = target.isVector3 ? target.clone() : new V3(target.x, target.y ?? 0, target.z); p.y = floorAt(p.x, p.z, p.y + 0.5); f = { pos: p, I: o.I ?? 0.85, t: 0, life: o.life ?? 10, g: makeFlames(7, 0.9, 0.9), h: 0.05, ground: true }; }
    f.by = o.by || 'npc'; f.spreadT = rnd(1.5, 3); fires.push(f); emit('fireStart', fireAt(f), { fire: f, by: f.by }); sfx('whoosh', clamp(1 - fireAt(f).distanceTo(player.pos) / 80, 0.1, 0.7)); return f;
  }
  function douse(x, y, z, amt) { let hit = false; for (const f of fires) { const p = fireAt(f); const dx = p.x - x, dz = p.z - z; if (dx * dx + dz * dz > 10 || y > p.y + 4) continue; f.I -= amt; f.wetT = 0.4; hit = true; } return hit; }
  function endFire(f, i) { scene.remove(f.g); f.g.userData.mat.dispose(); if (f.car) f.car.userData.fire = null; if (f.bin) f.bin.userData.fire = null; fires.splice(i, 1); const p = fireAt(f); for (let k = 0; k < 8; k++) W.puff(p.clone().setY(p.y + 1), 0xdddddd, 0.8, 3, new V3(rnd(-0.6, 0.6), rnd(1.5, 2.6), rnd(-0.6, 0.6)), 1.6, 0.5); emit('fireOut', p, { fire: f }); }
  const lights = []; for (let i = 0; i < 2; i++) { const l = new THREE.PointLight(0xff7a2a, 0, 22, 2); l.visible = false; scene.add(l); lights.push(l); } // unsichtbar, solange kein Feuer brennt: spart Shader-Arbeit
  let scanT = 0, crackT = 0;
  function updateFires(dt) {
    scanT -= dt; if (scanT <= 0) { scanT = 0.4; // Bengalos zünden, was daneben steht
      for (const p of W.projs) { if (p.kind !== 'flare' || p.t < 0.4 || p.t > 27) continue; const q = p.m.position; if (X.wakeParked && Math.random() < 0.1) X.wakeParked(q, 2.5); for (const c of cars) { if (c.userData.fire || c.position.distanceTo(q) > 2.2) continue; if (Math.random() < 0.2) ignite(c, { I: 0.35, by: p.who }); } for (const b of bins) if (!b.userData.fire && b.position.distanceTo(q) < 1.3 && Math.random() < 0.5) ignite(b, { by: p.who }); } }
    const lit = [];
    for (let i = fires.length - 1; i >= 0; i--) {
      const f = fires[i]; f.t += dt; f.wetT = Math.max(0, (f.wetT || 0) - dt);
      if (f.car && !cars.includes(f.car)) { endFire(f, i); continue; }
      const p = fireAt(f); const dPl = p.distanceTo(player.pos);
      // Verlauf: Autos brennen hoch und explodieren, Tonnen brennen lange, Brandflächen verlöschen
      if (!f.wetT) { if (f.car) { f.I = Math.min(1, f.I + dt * (f.car.userData.mode === 'wreck' ? -0.008 : 0.035)); if (f.car.userData.mode !== 'wreck' && f.t > 45 && f.I > 0.6) { explode(f.car, f.by === 'player' ? 'player' : 'npc'); f.I = 0.8; } } else if (f.bin) f.I = f.t < 70 ? Math.min(0.85, f.I + dt * 0.05) : f.I - dt * 0.02; else f.I -= dt / f.life; }
      if (f.wetT && Math.random() < dt * 10) W.puff(p.clone().setY(p.y + f.h + 0.5), 0xeeeeee, 0.7, 1.8, new V3(rnd(-0.8, 0.8), rnd(1.5, 3), rnd(-0.8, 0.8)), 1.8, 0.5);
      if (f.I <= 0) { endFire(f, i); continue; }
      // Flammen
      const vis = dPl < 200; f.g.visible = vis; if (vis) { const T = performance.now() / 1000; f.g.position.set(p.x, p.y + f.h, p.z); f.g.rotation.y = f.car ? f.car.userData.heading : 0; f.g.userData.mat.opacity = clamp(f.I * 1.3, 0.15, 1);
        for (const s of f.g.children) { const u = s.userData; const fl = 0.75 + 0.35 * Math.sin(T * 9 + u.ph) + 0.15 * Math.sin(T * 23 + u.ph * 3); const sc = (f.ground ? 0.9 : f.bin ? 1.0 : 1.5) * u.sz * (0.35 + f.I * 0.9) * fl; s.scale.set(sc * 0.75, sc * 1.6, 1); s.position.set(u.ox, Math.sin(T * 5 + u.ph) * 0.06, u.oz); } }
      // Rauch und Funken
      if (dPl < 160) { f.e = (f.e || 0) + dt * f.I * (f.car ? 6 : 4); while (f.e > 1) { f.e--; W.puff(p.clone().add(new V3(rnd(-0.8, 0.8), f.h + 1.4, rnd(-0.8, 0.8))), f.car && f.car.userData.mode === 'wreck' ? 0x1c1a18 : 0x2a2622, 1.0, rnd(5, 8), new V3(rnd(-0.4, 0.4), rnd(2.2, 3.4), rnd(-0.4, 0.4)), 1.5, 0.55); } if (Math.random() < dt * f.I * 3) W.sparks(p.clone().setY(p.y + f.h + 0.8), 0xffb050, 3, 4); }
      // Hitze: Menschen gehen weg, wer zu nah steht, nimmt Schaden
      const hr = (f.car ? 2.6 : 1.6) * (0.6 + f.I * 0.5); if (!player.car && dPl < hr) X.hurtPlayer('fire', 16 * f.I * dt);
      for (const q of peds) { const u = q.userData; if (u.state !== 'walk' && u.state !== 'npc') continue; if (q.position.distanceTo(p) < 7) { u.state = 'flee'; u.fleeT = rnd(3, 6); } }
      // Ausbreitung auf Nachbarautos
      f.spreadT -= dt; if (f.spreadT <= 0) { f.spreadT = rnd(2, 3.5); if (f.I > 0.6 && X.wakeParked) X.wakeParked(p, 5.5); if (f.I > 0.6) for (const c of cars) { if (c.userData.fire || c === f.car || c.position.distanceTo(p) > (f.car ? 5.2 : 2.6)) continue; if (Math.random() < 0.3) ignite(c, { I: 0.3, by: 'spread' }); } }
      if (dPl < 120) lit.push([dPl, f, p]);
    }
    lit.sort((a, b) => a[0] - b[0]); const T = performance.now() / 1000;
    lights.forEach((l, k) => { const e = lit[k]; if (!e) { l.intensity = 0; l.visible = false; return; } l.position.set(e[2].x, e[2].y + e[1].h + 1.5, e[2].z); l.intensity = 70 * e[1].I * (0.8 + 0.2 * Math.sin(T * 17 + k) + 0.1 * Math.sin(T * 41)); l.visible = l.intensity > 0.5; });
    crackT -= dt; if (crackT <= 0 && lit.length && lit[0][0] < 40) { crackT = rnd(0.4, 1.2); sfx('crackle', clamp(0.5 - lit[0][0] / 80, 0.05, 0.45)); }
  }

  // ---------- Mülltonnen ----------
  const binMat = [new THREE.MeshStandardMaterial({ color: 0x2f5d3a, roughness: 0.8 }), new THREE.MeshStandardMaterial({ color: 0x555b60, roughness: 0.7 }), new THREE.MeshStandardMaterial({ color: 0x1e4f8a, roughness: 0.8 })];
  function spawnBin(x, z) { const g = new THREE.Group(); const m = pick(binMat); const b = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.0, 0.72), m); b.position.y = 0.5; b.castShadow = true; const lid = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.07, 0.78), m); lid.position.set(0, 1.04, -0.04); lid.rotation.x = -0.12; g.add(b, lid); g.position.set(x, floorAt(x, z, TH(x, z) + 1), z); g.userData.bin = true; scene.add(g); bins.push(g); return g; }
  function removeBin(b) { const i = bins.indexOf(b); if (i >= 0) bins.splice(i, 1); scene.remove(b); if (b.userData.fire) { const j = fires.indexOf(b.userData.fire); if (j >= 0) endFire(b.userData.fire, j); } }

  // ---------- Feuerwehr ----------
  const brigades = []; const FF_COL = 0xb59a5a;
  function makeFirefighter(x, z) { const h = makeHuman(false, { model: 'swat', keepColors: true }); h.traverse(o => { if (o.isMesh && o.material) { o.material = o.material.clone(); const c = o.material.color; const lum = c.r + c.g + c.b; o.material.color.setHex(lum > 1.2 ? 0xe9d27a : FF_COL).convertSRGBToLinear(); } });
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8, 0, 6.3, 0, 1.7), new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.3, metalness: 0.2 })); helm.position.set(0, 1.84, 0.01); h.add(helm);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.3), new THREE.MeshBasicMaterial({ color: 0xe8f04a })); stripe.position.set(0, 1.0, 0); h.add(stripe);
    const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.45, 8), new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.7, roughness: 0.3 })); noz.rotation.x = Math.PI / 2; noz.position.z = -0.2; h.userData.hand.add(noz);
    h.position.set(x, TH(x, z), z); Object.assign(h.userData, { road: pick(X.pedRoads()), seg: 0, dir: 1, side: 1, speed: 3, hp: 160, state: 'ff', t: rnd(0, 5), ff: true, keep: true, aiming: true }); scene.add(h); peds.push(h); X.shootables.push(h); return h; }
  function tape(p, r) { const g = new THREE.Group(); const tex = canvasTex(64, 8, (ctx, w, h) => { for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#ffffff' : '#d01818'; ctx.fillRect(i * 8, 0, 8, h); } }, 6, 1); const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }); const postM = new THREE.MeshStandardMaterial({ color: 0x333333 }); const n = 8; const pts = [];
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; let x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r; pts.push([x, z]); const po = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 5), postM); po.position.set(x, TH(x, z) + 0.5, z); g.add(po); }
    for (let i = 0; i < n; i++) { const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % n]; if (solidAt((ax + bx) / 2, (az + bz) / 2) >= 0) continue; const L = Math.hypot(bx - ax, bz - az); const m = new THREE.Mesh(new THREE.PlaneGeometry(L, 0.08), mat); m.position.set((ax + bx) / 2, (TH(ax, az) + TH(bx, bz)) / 2 + 0.92, (az + bz) / 2); m.rotation.y = Math.atan2(-(bz - az), bx - ax); g.add(m); }
    scene.add(g); return g; }
  function dispatch(f) {
    const p = fireAt(f); let best = null; for (let k = 0; k < 40; k++) { const q = X.randomRoadPoint(pick(X.roadsDrivable)); const dd = Math.hypot(q.x - p.x, q.z - p.z); if (dd > 110 && dd < 220) { best = q; break; } } if (!best) return null;
    const c = D.spawnCannon(best.x, best.z, best.heading, 'fireAI', 'fire'); const b = { truck: c, fire: f, crew: [], state: 'drive', t: 0, retreatT: 0, attacks: 0 }; c.userData.brigade = b; f.brig = b; brigades.push(b);
    D.post('feuerwehr', `Einsatz: Brand ${X.streetAt(p.x, p.z) ? 'in der ' + X.streetAt(p.x, p.z) : 'in Bornheim'}. Bitte Rettungswege freihalten.`, Math.round(rnd(80, 400))); emit('brigadeDispatched', p, { brigade: b }); return b;
  }
  function brigadeAttacked(b, by) { if (b.retreatT <= 0) { D.sub('🧯 Feuerwehr', 'Angriff auf Einsatzkräfte! Alle zurück zum Fahrzeug!', 4); D.post('feuerwehr', 'Unsere Kräfte werden bei den Löscharbeiten angegriffen. Wir ziehen uns zurück. Das Feuer brennt weiter.', 2200); } b.retreatT = 10; b.attacks++; emit('ffAttacked', b.truck.position, { brigade: b, by }); }
  X.listeners.push((ev, pos, data) => {
    const ped = data.ped; if (ped && ped.userData.ff && /^(paint|hit|spray|taser|water)Ped$/.test(ev)) { const b = brigades.find(b => b.crew.includes(ped)); if (b) brigadeAttacked(b, data.who || 'player'); }
    if (ev === 'banger' || ev === 'grenade' || ev === 'molotov') { for (const b of brigades) if (b.crew.some(h => h.position.distanceTo(pos) < 7)) brigadeAttacked(b, data.who || 'player'); for (const bn of bins) if (!bn.userData.fire && bn.position.distanceTo(pos) < (ev === 'grenade' ? 5 : 1.5)) ignite(bn, { by: data.who }); }
    if (ev === 'carExploded') ignite(data.car, { I: 0.9, by: 'explosion' });
  });
  function updateBrigades(dt) {
    if (opts.firebrigade !== false) for (const f of fires) { if (f.brig || f.ground || f.t < 4 || f.I < 0.25 || brigades.filter(b => b.state !== 'leave').length >= 2) continue; if (fireAt(f).distanceTo(player.pos) > 320) continue; dispatch(f); }
    for (let i = brigades.length - 1; i >= 0; i--) {
      const b = brigades[i], c = b.truck, u = c.userData; b.t += dt; b.retreatT = Math.max(0, b.retreatT - dt);
      if (!cars.includes(c) || c === player.car) { for (const h of b.crew) D.removePed(h); if (b.tape) scene.remove(b.tape); if (b.fire) b.fire.brig = null; brigades.splice(i, 1); continue; }
      const fireOn = b.fire && fires.includes(b.fire); const fp = fireOn ? fireAt(b.fire) : null;
      if (!fireOn && b.state !== 'leave') { // nächstes Feuer in der Nähe übernehmen, sonst abrücken
        const nx = fires.find(f => !f.brig && fireAt(f).distanceTo(c.position) < 40); if (nx) { b.fire = nx; nx.brig = b; continue; } b.doneT = (b.doneT || 0) + dt; if (b.doneT > 6) { b.state = 'leave'; for (const h of b.crew) D.removePed(h); b.crew = []; if (b.tape) { scene.remove(b.tape); b.tape = null; } D.post('feuerwehr', 'Brand gelöscht. Einsatz beendet.', Math.round(rnd(200, 900))); } }
      if (b.state === 'drive' && fireOn) { const dx = c.position.x - fp.x, dz = c.position.z - fp.z, L = Math.hypot(dx, dz) || 1; const tx = fp.x + dx / L * 10, tz = fp.z + dz / L * 10; if (!b.path) { b.path = D.route(c.position.x, c.position.z, fp.x, fp.z) || []; b.pi = 0; } while (b.pi < b.path.length - 1 && Math.hypot(b.path[b.pi][0] - c.position.x, b.path[b.pi][1] - c.position.z) < 7) b.pi++; const wp = b.pi < b.path.length - 2 ? b.path[b.pi] : [tx, tz]; D.driveTo(c, wp[0], wp[1], dt, wp[0] === tx ? 8 : 13); const d = Math.hypot(tx - c.position.x, tz - c.position.z);
        if (d < 6 || b.t > 32) { if (d >= 5) { const [qx, qz] = D.freeSpot(tx, tz, 3); c.position.set(qx, TH(qx, qz), qz); } u.speed = 0; if (u.vel) u.vel.set(0, 0); b.state = 'work'; b.tape = tape(fp, 8.5); for (let k = 0; k < 3; k++) { const [x, z] = D.freeSpot(c.position.x + rnd(-2, 2), c.position.z + rnd(-2, 2), 1.5); b.crew.push(makeFirefighter(x, z)); } } }
      else if (b.state === 'work' && fireOn) {
        const back = new V3(c.position.x - Math.sin(u.heading) * 4.5, 0, c.position.z - Math.cos(u.heading) * 4.5);
        b.crew.forEach((h, k) => { const hu = h.userData; if (hu.state === 'dead') return; if (hu.state === 'stunned') return; hu.state = 'ff'; hu.t += dt;
          let tx, tz, face; if (b.retreatT > 0) { tx = back.x + (k - 1) * 1.1; tz = back.z; face = Math.atan2(fp.x - tx, fp.z - tz); } else { const a = Math.atan2(c.position.z - fp.z, c.position.x - fp.x) + (k - 1) * 0.6; tx = fp.x + Math.cos(a) * 4.6; tz = fp.z + Math.sin(a) * 4.6; face = Math.atan2(fp.x - tx, fp.z - tz); }
          const dx = tx - h.position.x, dz = tz - h.position.z, L = Math.hypot(dx, dz); const dF = Math.hypot(fp.x - h.position.x, fp.z - h.position.z); let sp = L > 0.4 ? Math.min(b.retreatT > 0 ? 5 : 2.6, L * 2) : 0; if (sp && b.retreatT <= 0) { hu.tryT = (hu.tryT || 0) + dt; if (hu.tryT > 3 && dF < 10.5) { sp = 0; face = Math.atan2(fp.x - h.position.x, fp.z - h.position.z); } } else hu.tryT = 0; /* kommt nicht näher: von hier löschen */ if (sp) { moveWithCollision(h.position, dx / L * sp * dt, dz / L * sp * dt, 0.3); h.rotation.y = lerpAngle(h.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 8)); } else h.rotation.y = lerpAngle(h.rotation.y, face, Math.min(1, dt * 5)); h.position.y = TH(h.position.x, h.position.z);
          hu.aiming = !sp && b.retreatT <= 0; animateWalk(h, hu.t, sp * 1.8);
          if (!sp && b.retreatT <= 0) { const o = new V3(); hu.hand.getWorldPosition(o); const d = new V3(fp.x - o.x, fp.y + b.fire.h + 0.6 - o.y, fp.z - o.z).normalize(); d.y += 0.12; D.jetEmit(o, d.normalize(), 13, 3); douse(fp.x, fp.y, fp.z, dt * 0.1); } });
        if (b.retreatT <= 0 && b.fire.I > 0.35) { D.aimTurret(c, fp.x, fp.y + 1, fp.z, dt); u.burstT = 1; D.cannonSpray(c, dt); }
      }
      else if (b.state === 'leave' && !b.crew.length && (() => { const nx = fires.find(f => !f.brig && !f.ground && f.t > 2 && fireAt(f).distanceTo(c.position) < 250); if (nx) { b.fire = nx; nx.brig = b; b.state = 'drive'; b.path = null; b.t = 0; b.doneT = 0; b.leaveT = 0; b.away = null; return true; } return false; })()) {}
      else if (b.state === 'leave') { const away = b.away || (b.away = (() => { for (let k = 0; k < 30; k++) { const q = X.randomRoadPoint(pick(X.roadsDrivable)); if (Math.hypot(q.x - c.position.x, q.z - c.position.z) > 200) return [q.x, q.z]; } return [c.position.x + 300, c.position.z]; })()); D.driveTo(c, away[0], away[1], dt, 12); b.leaveT = (b.leaveT || 0) + dt; if (c.position.distanceTo(player.pos) > 150 || (b.leaveT > 20 && c.position.distanceTo(player.pos) > 30) || b.leaveT > 60) { D.removeCar(c); brigades.splice(i, 1); } }
    }
  }
  function update(dt) { updateFires(dt); updateBrigades(dt); }
  X.douse = douse; X.ignite = ignite;
  X.mmHooks.push((ctx, P) => { for (const f of fires) { const p = fireAt(f); const [x, y] = P(p.x, p.z); ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.arc(x, y, 3 + f.I * 2, 0, 7); ctx.fill(); } for (const b of brigades) { const [x, y] = P(b.truck.position.x, b.truck.position.z); ctx.fillStyle = '#e02020'; ctx.fillRect(x - 4, y - 4, 8, 8); } });
  return { update, ignite, douse, fires, bins, spawnBin, removeBin, brigades, dispatch, makeFirefighter, fireAt };
}

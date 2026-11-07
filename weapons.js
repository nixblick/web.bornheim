// Waffen, Wurfsachen, Pyro und Effekte. Wird von game.js mit allen Spiel-Interna (X) gestartet.
export function initWeapons(X) {
  const { THREE, scene, camera, player, peds, cars, shootables, keys, camYaw, opts, TH, solidAtH, floorAt, nearestEdge, edgeNormal, damage, explode, burst, sfx, showMsg, raiseWanted, camShake, canvasTex, tracerMat, makeGun, playAnim, dentCar, moveWithCollision, rnd, clamp, pick } = X;
  const V3 = THREE.Vector3;
  const emit = (ev, pos, data) => { for (const f of X.listeners) f(ev, pos, data || {}); };

  // ---------- Waffenliste ----------
  const DEF = {
    fists:   { n: 'Fäuste', ic: '✊', kind: 'melee', dmg: 14, range: 1.8, rate: 0.42, slot: 1 },
    bat:     { n: 'Baseballschläger', ic: '🏏', kind: 'melee', dmg: 45, range: 2.4, rate: 0.7, slot: 1, give: 1 },
    pistol:  { n: 'Pistole', ic: '🔫', kind: 'gun', dmg: 40, rate: 0.2, mag: 12, spread: 0.004, range: 200, give: 48, snd: 'shot', slot: 2 },
    smg:     { n: 'Maschinenpistole', ic: 'MP', kind: 'gun', dmg: 19, rate: 0.07, mag: 30, spread: 0.028, range: 150, auto: true, give: 120, snd: 'smg', slot: 3 },
    shotgun: { n: 'Schrotflinte', ic: 'SF', kind: 'gun', dmg: 15, pellets: 9, rate: 0.85, mag: 6, spread: 0.075, range: 45, give: 24, snd: 'shotgun', slot: 4 },
    rifle:   { n: 'Sturmgewehr', ic: 'G', kind: 'gun', dmg: 34, rate: 0.11, mag: 30, spread: 0.01, range: 260, auto: true, give: 90, snd: 'rifle', slot: 5 },
    spray:   { n: 'Pfefferspray', ic: '🌶', kind: 'spray', rate: 0.05, auto: true, give: 1, slot: 6 },
    taser:   { n: 'Taser', ic: '⚡', kind: 'taser', rate: 1.1, range: 11, give: 6, slot: 6 },
    paint:   { n: 'Farbbeutel', ic: '🎨', kind: 'throw', rate: 0.45, give: 8, slot: 7 },
    banger:  { n: 'Böller', ic: '🧨', kind: 'throw', rate: 0.6, give: 6, fuse: 1.6, slot: 8 },
    smoke:   { n: 'Rauchtopf', ic: '💨', kind: 'throw', rate: 0.8, give: 3, slot: 9 },
    flare:   { n: 'Bengalo', ic: '🔥', kind: 'throw', rate: 0.8, give: 3, slot: 9 },
    grenade: { n: 'Granate', ic: '💣', kind: 'throw', rate: 1.0, give: 2, fuse: 2.4, slot: 0 },
    molotov: { n: 'Brandsatz', ic: '🍾', kind: 'throw', rate: 0.9, give: 2, slot: 0, creativeOnly: true },
  };
  const ORDER = Object.keys(DEF);
  const inv = {};
  let cur = 'fists', last = 'fists', cool = 0, trigger = false, swingT = 0, meleeT = -1, punchAlt = false, heat = 0, barT = 0;
  const unlimited = () => !!opts.ammo || !!X.creative.on;
  function give(id, n) {
    const d = DEF[id]; if (!d) return; const fresh = !inv[id]; const it = inv[id] || (inv[id] = { mag: 0, res: 0 });
    if (d.kind === 'gun') { if (fresh) it.mag = d.mag; it.res += n ?? d.give; }
    else if (d.kind === 'spray') { if (fresh) it.mag = 100; else it.res += 1; }
    else if (d.kind === 'taser') { if (fresh) it.mag = 1; it.res += n ?? d.give; }
    else if (d.kind === 'throw') it.res += n ?? d.give;
    return fresh;
  }
  function reset() { for (const k of Object.keys(inv)) delete inv[k]; give('fists'); give('pistol', 84); give('paint', 4); select('fists', true); }
  // Sperre in Story-Kapiteln: 'all' = nur Fäuste, 'protest' = Fäuste und Demo-Zubehör (Farbe, Böller, Rauch, Bengalo)
  let lockMode = null; const PROTEST = new Set(['fists', 'paint', 'banger', 'smoke', 'flare']);
  const allowed = id => !lockMode || id === 'fists' || (lockMode === 'protest' && PROTEST.has(id));
  function lock(mode) { if (lockMode === (mode || null)) return; lockMode = mode || null; if (!allowed(cur)) select('fists', true); trigger = false; barT = 2.5; drawBar(); if (lockMode) showMsg(lockMode === 'all' ? 'WAFFEN WEGGESCHLOSSEN' : 'NUR FÄUSTE UND DEMO-ZUBEHÖR', 1800); }
  function save() { return { cur, inv: JSON.parse(JSON.stringify(inv)) }; }
  function load(d) { if (!d || !d.inv) { reset(); return; } for (const k of Object.keys(inv)) delete inv[k]; for (const [k, v] of Object.entries(d.inv)) if (DEF[k]) inv[k] = { mag: +v.mag || 0, res: +v.res || 0 }; if (!inv.fists) give('fists'); select(inv[d.cur] ? d.cur : 'fists', true); }
  // Festnahme: Schusswaffen und Pyro weg, Fäuste und Schläger bleiben
  function confiscate() { for (const k of Object.keys(inv)) if (k !== 'fists' && k !== 'bat') delete inv[k]; select('fists', true); }

  // ---------- Modelle ----------
  const MS = (c, r = 0.55, m = 0.25) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const mBlk = MS(0x1b1c1f, 0.5, 0.4), mGry = MS(0x3d4046, 0.4, 0.6), mWood = MS(0x6b4423, 0.8, 0), mBat = MS(0xb98a55, 0.6, 0);
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; return o; };
  const cyl = (r, l, m, x, y, z, alongZ, r2) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r2 ?? r, l, 10), m); if (alongZ) o.rotation.x = Math.PI / 2; o.position.set(x, y, z); o.castShadow = true; return o; };
  const flashTex = canvasTex(64, 64, (ctx, w, h) => { const gr = ctx.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,220,1)'); gr.addColorStop(0.3, 'rgba(255,200,80,0.9)'); gr.addColorStop(1, 'rgba(255,120,0,0)'); ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h); });
  function addMuzzle(g, z, y, s) { const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); f.position.set(0, y, z); f.scale.set(s, s, 1); f.visible = false; g.add(f); g.userData.flash = f; const mz = new THREE.Object3D(); mz.position.set(0, y, z + 0.02); g.add(mz); g.userData.muzzle = mz; }
  const PAINT = [0xff2d95, 0x39ff14, 0xffe600, 0x00b3ff, 0xff7a00, 0xb14dff];
  let paintIdx = 0;
  function buildModel(id) {
    if (id === 'pistol') return makeGun();
    const g = new THREE.Group();
    if (id === 'smg') { g.add(box(0.06, 0.1, 0.34, mBlk, 0, 0.06, -0.1), box(0.05, 0.15, 0.05, mBlk, 0, -0.05, 0.0), box(0.04, 0.17, 0.05, mGry, 0, -0.04, -0.13), cyl(0.016, 0.12, mGry, 0, 0.07, -0.32, true), box(0.04, 0.05, 0.2, mBlk, 0, 0.05, 0.14)); addMuzzle(g, -0.4, 0.07, 0.55); }
    else if (id === 'shotgun') { g.add(box(0.06, 0.09, 0.3, mBlk, 0, 0.05, -0.04), cyl(0.024, 0.62, mGry, 0, 0.075, -0.48, true), cyl(0.026, 0.3, mWood, 0, 0.025, -0.42, true), box(0.05, 0.12, 0.3, mWood, 0, 0.0, 0.24), box(0.04, 0.1, 0.05, mBlk, 0, -0.06, 0.02)); addMuzzle(g, -0.8, 0.075, 0.85); }
    else if (id === 'rifle') { g.add(box(0.06, 0.12, 0.5, mBlk, 0, 0.06, -0.12), cyl(0.018, 0.36, mGry, 0, 0.07, -0.55, true), box(0.04, 0.2, 0.07, mGry, 0, -0.07, -0.16), box(0.05, 0.13, 0.28, mBlk, 0, 0.03, 0.26), box(0.03, 0.05, 0.18, mGry, 0, 0.15, -0.1)); addMuzzle(g, -0.75, 0.07, 0.7); }
    else if (id === 'bat') { const b = cyl(0.038, 0.85, mBat, 0, 0.36, 0, false, 0.017); const piv = new THREE.Group(); piv.add(b); g.add(piv); g.userData.piv = piv; }
    else if (id === 'spray') { g.add(cyl(0.03, 0.16, MS(0xd8541e, 0.35, 0.5), 0, 0.06, 0), box(0.025, 0.03, 0.03, mBlk, 0, 0.155, -0.01)); const mz = new THREE.Object3D(); mz.position.set(0, 0.155, -0.04); g.add(mz); g.userData.muzzle = mz; }
    else if (id === 'taser') { g.add(box(0.045, 0.08, 0.16, MS(0xf2c418, 0.5, 0.1), 0, 0.05, -0.05), box(0.04, 0.12, 0.05, mBlk, 0, -0.03, 0.02)); const mz = new THREE.Object3D(); mz.position.set(0, 0.05, -0.14); g.add(mz); g.userData.muzzle = mz; }
    else if (id === 'paint') { const col = PAINT[paintIdx % PAINT.length]; const s = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), MS(col, 0.3, 0)); s.scale.y = 0.85; s.castShadow = true; g.add(s, box(0.03, 0.04, 0.03, MS(0xeeeeee), 0, 0.07, 0)); g.userData.col = col; }
    else if (id === 'banger') { g.add(cyl(0.02, 0.13, MS(0xc81e1e, 0.5, 0), 0, 0, 0), cyl(0.003, 0.05, MS(0x222222), 0, 0.085, 0)); }
    else if (id === 'smoke') { g.add(cyl(0.045, 0.14, MS(0x3b7d3a, 0.5, 0.2), 0, 0, 0), cyl(0.03, 0.03, mGry, 0, 0.085, 0)); }
    else if (id === 'flare') { g.add(cyl(0.022, 0.26, MS(0xd02020, 0.5, 0), 0, 0.05, 0), cyl(0.024, 0.04, MS(0x222222), 0, 0.2, 0)); }
    else if (id === 'grenade') { const s = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), MS(0x3f4a2a, 0.6, 0.3)); s.scale.y = 1.2; s.castShadow = true; g.add(s, box(0.02, 0.06, 0.03, mGry, 0.035, 0.05, 0)); }
    else if (id === 'molotov') { const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.85 })); gl.position.y = 0.05; const neck = cyl(0.015, 0.08, MS(0x3f7a3a, 0.1, 0.1), 0, 0.19, 0); const cloth = box(0.04, 0.07, 0.04, MS(0xe8e0c8, 0.9, 0), 0, 0.25, 0); g.add(gl, neck, cloth); g.userData.cloth = cloth; }
    if (!g.userData.muzzle) { const mz = new THREE.Object3D(); mz.position.set(0, 0.05, -0.1); g.add(mz); g.userData.muzzle = mz; }
    return g;
  }
  let model = null;
  function attach() {
    const pm = player.mesh; if (!pm) return; const hand = pm.userData.hand;
    if (model) hand.remove(model); if (pm.userData.gun && pm.userData.gun !== model) hand.remove(pm.userData.gun);
    model = buildModel(cur); if (cur === 'fists') model.visible = false; hand.add(model); pm.userData.gun = model;
  }
  function select(id, quiet) {
    if (!inv[id] || !allowed(id)) { if (inv[id] && !quiet) { barT = 1.5; drawBar(); } return false; } if (id !== cur) { last = cur; cur = id; } attach(); swingT = 0; meleeT = -1; trigger = false; cool = Math.max(cool, 0.15);
    if (!quiet) { sfx('click'); barT = 2; } drawBar(); return true;
  }
  // Ziffern: 1 Nahkampf, 2 Pistole, 3 MP, 4 Schrotflinte, 5 Gewehr, 6 Spray/Taser, 7 Farbe, 8 Böller, 9 Rauch/Bengalo, 0 Granate
  function slotKey(n) { const ids = ORDER.filter(k => DEF[k].slot === n && inv[k] && allowed(k)); if (!ids.length) { barT = 1.5; drawBar(); return; } const i = ids.indexOf(cur); select(ids[(i + 1) % ids.length]); }
  function quick() { select(inv[last] && allowed(last) ? last : 'fists'); }
  function cycle(dir) { const own = ORDER.filter(k => inv[k] && allowed(k)); const i = own.indexOf(cur); select(own[(i + dir + own.length) % own.length]); }
  function canAim() { const k = DEF[cur].kind; return k !== 'melee'; }

  // ---------- HUD ----------
  const barEl = document.getElementById('wbar'), wEl = document.getElementById('weapon');
  function ammoText(id) { const d = DEF[id], it = inv[id]; if (!it) return ''; if (unlimited()) return d.kind === 'melee' ? '' : '∞';
    if (d.kind === 'gun') return it.mag + ' / ' + it.res; if (d.kind === 'spray') return Math.ceil(it.mag) + ' %' + (it.res ? ' +' + it.res : ''); if (d.kind === 'taser') return it.mag + ' / ' + it.res; if (d.kind === 'throw') return '× ' + it.res; return ''; }
  function drawBar() {
    if (wEl) wEl.innerHTML = `<b>${DEF[cur].ic}</b> ${DEF[cur].n} <span>${ammoText(cur)}</span>${lockMode ? ' <span title="In diesem Kapitel gesperrt">🔒</span>' : ''}`;
    if (!barEl) return; barEl.style.display = barT > 0 ? 'flex' : 'none'; if (barT <= 0) return;
    barEl.innerHTML = ORDER.map(k => `<div class="${k === cur ? 'sel' : ''}${inv[k] && allowed(k) ? '' : ' off'}"><i>${inv[k] && !allowed(k) ? '🔒' : DEF[k].ic}</i><small>${(DEF[k].slot)}</small><span>${DEF[k].n}</span></div>`).join('');
  }
  function hud() { return player.car ? null : ammoText(cur); }

  // ---------- Feuern ----------
  function press(down) { if (!allowed(cur)) { select('fists', true); } trigger = down; if (down) tryFire(true); }
  function tryFire(first) {
    if (player.car || player.dead || cool > 0) return false; const d = DEF[cur]; if (!d.auto && !first) return false;
    if (d.kind === 'gun') fireGun(d); else if (d.kind === 'melee') melee(d); else if (d.kind === 'throw') throwIt(d); else if (d.kind === 'spray') sprayTick(d); else if (d.kind === 'taser') taser(d);
    return true;
  }
  function shootPose(snd) { player.aimT = 1.6; const pm = player.mesh.userData; pm.aiming = true; if (pm.mixer) { playAnim(player.mesh, 'shoot', { fade: 0.05 }); pm.curAnim = 'shooting'; } player.yaw = camYaw.v; player.mesh.rotation.y = player.yaw; if (snd) sfx(snd); }
  const _ray = new THREE.Raycaster(), _v = new V3(), _ndc = new THREE.Vector2();
  function candidates(range) { const dir = camera.getWorldDirection(new V3()); const cp = camera.position; return shootables.filter(o => { if (!o.visible || o === player.car || o.userData.hp <= 0 && !cars.includes(o)) return false; const dx = o.position.x - cp.x, dz = o.position.z - cp.z, dy = o.position.y - cp.y; const L = Math.hypot(dx, dy, dz); if (L > range + 5) return false; return (dx * dir.x + dy * dir.y + dz * dir.z) > -3; }); }
  function wallDist(ray, range) { for (let s = 2.5; s < range; s += 1.25) { const p = ray.at(s, _v); if (p.y <= TH(p.x, p.z) || solidAtH(p.x, p.z, p.y) !== -1) return s; } return range; }
  function owner(o) { while (o && !cars.includes(o) && !peds.includes(o)) o = o.parent; return o; }
  function hitTarget(o, dmg, dir) {
    if (peds.includes(o)) { const u = o.userData; if (u.cop && u.hp > 0) { raiseWanted(0.6); emit('hitCop', o.position, { ped: o }); } else emit('hitPed', o.position, { ped: o }); damage(o, dmg, dir); if (u.hp > 0 && u.state !== 'dead' && dmg >= 15 && (u.state === 'demo' || u.state === 'riot')) stun(o, 'hit', 1.2); }
    else damage(o, dmg * 0.6, dir);
  }
  function fireGun(d) {
    const it = inv[cur]; if (it.mag <= 0) { if (it.res > 0 || unlimited()) reload(); else { showMsg('LEER', 600); sfx('click'); cool = 0.3; } return; }
    if (!unlimited()) it.mag--; cool = d.rate; heat = Math.min(1, heat + (d.auto ? 0.12 : 0.3));
    shootPose(d.snd); camShake(cur === 'shotgun' ? 0.16 : cur === 'rifle' ? 0.07 : 0.05); player.mesh.userData.recoil = cur === 'shotgun' ? 0.5 : 0.22;
    const muzzle = new V3(); model.userData.muzzle.getWorldPosition(muzzle);
    const moving = keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD; const spread = d.spread * (player.aimHold ? 0.55 : 1) * (moving ? 1.7 : 1) + heat * (d.auto ? 0.02 : 0.006);
    if (X.wakeParkedRay) { _ray.setFromCamera(_ndc.set(0, 0), camera); X.wakeParkedRay(_ray.ray.origin, _ray.ray.direction, d.range); }
    const cands = candidates(d.range); const n = d.pellets || 1;
    for (let k = 0; k < n; k++) {
      _ndc.set(rnd(-1, 1) * spread, rnd(-1, 1) * spread); _ray.setFromCamera(_ndc, camera); _ray.far = d.range;
      const wd = wallDist(_ray.ray, d.range); const hits = _ray.intersectObjects(cands, true).filter(h => h.distance > 2.5 && h.distance < wd);
      let end; if (hits.length) { end = hits[0].point.clone(); const o = owner(hits[0].object); if (o) hitTarget(o, d.dmg, _ray.ray.direction.clone()); }
      else { end = _ray.ray.at(wd, new V3()); if (wd < d.range) burst(end, 0xc8c0b0, 3, 1.2); }
      if (k < 4) { const len = muzzle.distanceTo(end); const tr = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, len), tracerMat); tr.position.copy(muzzle).lerp(end, 0.5); tr.lookAt(end); scene.add(tr); setTimeout(() => { scene.remove(tr); tr.geometry.dispose(); }, 90); }
    }
    const f = model.userData.flash; if (f) { f.visible = true; f.material.rotation = Math.random() * 6; setTimeout(() => f.visible = false, 60); }
    raiseWanted(d.auto ? 0.08 : 0.15); emit('shot', player.pos, { weapon: cur });
    for (const p of peds) if (p.userData.state === 'walk' && p.position.distanceTo(player.pos) < 45) { p.userData.state = 'flee'; p.userData.fleeT = rnd(4, 8); }
    if (it.mag <= 0 && (it.res > 0 || unlimited())) setTimeout(reload, 250);
  }
  function reload() { const d = DEF[cur], it = inv[cur]; if (!it) return; if (d.kind === 'gun') { if (it.mag >= d.mag) return; if (unlimited()) { it.mag = d.mag; sfx('reload'); cool = 0.6; return; } if (it.res <= 0) return; const n = Math.min(d.mag - it.mag, it.res); it.mag += n; it.res -= n; sfx('reload'); cool = cur === 'shotgun' ? 1.0 : 0.7; }
    else if (d.kind === 'spray' && it.mag < 5 && it.res > 0) { it.res--; it.mag = 100; sfx('reload'); } }
  function addAmmo() { const own = ['pistol', 'smg', 'shotgun', 'rifle'].filter(k => inv[k]); const k = DEF[cur].kind === 'gun' ? cur : own[0]; if (!k) { give('pistol', 24); return 'PISTOLE'; } inv[k].res += Math.ceil(DEF[k].give / 2); return DEF[k].n.toUpperCase(); }

  // ---------- Nahkampf ----------
  function melee(d) {
    cool = d.rate; swingT = 0.34; meleeT = 0.14; player.yaw = camYaw.v; player.mesh.rotation.y = player.yaw; const pm = player.mesh.userData;
    if (pm.mixer) { playAnim(player.mesh, cur === 'bat' ? 'Sword_Slash' : (punchAlt ? 'Punch_Right' : 'Punch_Left'), { once: true, fade: 0.05 }); pm.actT = cur === 'bat' ? 0.55 : 0.4; } punchAlt = !punchAlt; sfx('swing', cur === 'bat' ? 0.8 : 0.4);
  }
  function meleeHit(d) {
    const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw); let best = null, bd = d.range + 0.3;
    for (const p of peds) { const u = p.userData; if (u.state === 'dead' || u.hp <= 0) continue; const dx = p.position.x - player.pos.x, dz = p.position.z - player.pos.z, L = Math.hypot(dx, dz); if (L > bd || Math.abs(p.position.y - player.pos.y) > 1.6) continue; if ((dx * fx + dz * fz) / (L || 1) < 0.35) continue; bd = L; best = p; }
    if (best) { const dir = new V3(fx, 0, fz); sfx('punch', cur === 'bat' ? 1 : 0.7); hitTarget(best, d.dmg, dir); if (best.userData.state !== 'dead') { moveWithCollision(best.position, fx * (cur === 'bat' ? 1.1 : 0.5), fz * (cur === 'bat' ? 1.1 : 0.5), 0.3); if (cur === 'bat') stun(best, 'hit', 2.2); } camShake(0.08); return; }
    if (cur === 'bat' && X.wakeParked) X.wakeParked(player.pos, 3.2);
    if (cur === 'bat') for (const c of cars) { if (c === player.car || c.userData.mode === 'wreck') continue; const dx = c.position.x - player.pos.x, dz = c.position.z - player.pos.z, L = Math.hypot(dx, dz); if (L > 3.4 || (dx * fx + dz * fz) / L < 0.3) continue;
      const wp = new V3(player.pos.x + fx * 1.4, player.pos.y + 0.9, player.pos.z + fz * 1.4); dentCar(c, wp, new V3(fx, -0.2, fz), 0.13); c.userData.hp -= 5; sfx('bump', 0.9); camShake(0.1); emit('vandal', c.position, { car: c }); if (c.userData.mode === 'ai') { c.userData.speed = 0; } return; }
  }

  // ---------- Betäuben (Taser, Spray, Wasser, Schlag) ----------
  function stun(h, kind, t) {
    const u = h.userData; if (u.state === 'dead' || u.hp <= 0) return; if (u.state !== 'stunned') u.prevState = u.state; u.state = 'stunned'; u.stunKind = kind; u.stunT = Math.max(u.stunT || 0, t); u.stunMax = u.stunT;
    if (u.mixer) { playAnim(h, u.charName && /swat|hero|business/.test(u.charName) && kind !== 'spray' ? 'HitRecieve' : 'Idle', { fade: 0.1 }); }
  }
  function updateStunned(h, dt) {
    const u = h.userData; u.stunT -= dt; const lie = u.stunKind === 'taser' || u.stunKind === 'water';
    const k = u.stunT / (u.stunMax || 1); const tx = lie ? (k > 0.15 ? -1.45 : -1.45 * k / 0.15) : (u.stunKind === 'spray' ? 0.5 * Math.min(1, k * 3) : 0);
    h.rotation.x += (tx - h.rotation.x) * Math.min(1, dt * 8); h.position.y = TH(h.position.x, h.position.z) + (lie ? 0.15 * Math.min(1, -h.rotation.x) : 0);
    if (u.stunKind === 'spray' && Math.random() < dt * 0.8) moveWithCollision(h.position, rnd(-0.4, 0.4), rnd(-0.4, 0.4), 0.3);
    if (u.stunKind === 'spray' && Math.random() < dt * 0.6 && h.position.distanceTo(player.pos) < 25) sfx('cough', 0.25);
    if (u.mixer && !u.lod) { u.mixer.update(dt); }
    if (u.stunT <= 0) { h.rotation.x = 0; u.state = u.prevState === 'stunned' || !u.prevState ? 'flee' : u.prevState; if (u.state === 'walk' || u.state === 'flee') { u.state = 'flee'; u.fleeT = rnd(4, 7); } u.curAnim = null; emit('recovered', h.position, { ped: h }); }
  }

  // ---------- Pfefferspray ----------
  function sprayTick(d) {
    const it = inv.spray; if (it.mag <= 0 && !unlimited()) { if (it.res > 0) { reload(); } else { showMsg('SPRAY LEER', 600); cool = 0.5; } return; }
    cool = d.rate; if (!unlimited()) it.mag = Math.max(0, it.mag - 1.2); shootPose(null); if (Math.random() < 0.3) sfx('hiss', 0.25);
    const from = new V3(); model.userData.muzzle.getWorldPosition(from); const dir = camera.getWorldDirection(new V3());
    for (let i = 0; i < 2; i++) puff(from.clone(), 0xffb27a, 0.25, 0.7, dir.clone().multiplyScalar(rnd(6, 9)).add(new V3(rnd(-0.6, 0.6), rnd(-0.3, 0.5), rnd(-0.6, 0.6))), 2.2, 0.55);
    sprayCone(player.pos, dir, 'player');
  }
  function sprayCone(pos, dir, who) {
    const h = Math.hypot(dir.x, dir.z) || 1, fx = dir.x / h, fz = dir.z / h;
    for (const p of peds) { const u = p.userData; if (u.state === 'dead' || (u.state === 'stunned' && u.stunKind === 'spray') || (who !== 'player' && u.cop)) continue; const dx = p.position.x - pos.x, dz = p.position.z - pos.z, L = Math.hypot(dx, dz); if (L > 5.5 || L < 0.2 || (dx * fx + dz * fz) / L < 0.86) continue;
      stun(p, 'spray', rnd(4.5, 7)); if (who === 'player') { if (u.cop) { raiseWanted(0.7); emit('sprayCop', p.position, { ped: p }); } else emit('sprayPed', p.position, { ped: p }); } }
    if (who !== 'player') { const dx = player.pos.x - pos.x, dz = player.pos.z - pos.z, L = Math.hypot(dx, dz); if (L < 5 && L > 0.2 && (dx * fx + dz * fz) / L > 0.8 && !player.car) X.hurtPlayer('spray', 6); }
  }

  // ---------- Taser ----------
  const wireMat = new THREE.LineBasicMaterial({ color: 0xdfe8ff }); const wires = [];
  function taser(d) {
    const it = inv.taser; if (it.mag <= 0 && !unlimited()) { if (it.res > 0) { it.res--; it.mag = 1; sfx('reload'); cool = 1.0; } else { showMsg('KEINE KARTUSCHEN', 700); cool = 0.4; } return; }
    if (!unlimited()) it.mag--; cool = d.rate; shootPose('taser');
    const from = new V3(); model.userData.muzzle.getWorldPosition(from); const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(0, 0), camera);
    let best = null, bd = 1.2; for (const p of peds) { const u = p.userData; if (u.state === 'dead') continue; const c = p.position.clone(); c.y += 1.1; const t = c.clone().sub(ray.ray.origin).dot(ray.ray.direction); if (t < 2 || t > d.range + 4) continue; if (c.distanceTo(player.pos) > d.range) continue; const dd = ray.ray.distanceToPoint(c); if (dd < bd) { bd = dd; best = p; } }
    const end = best ? best.position.clone().setY(best.position.y + 1.1) : ray.ray.at(d.range + 3, new V3());
    for (const off of [-0.06, 0.06]) { const g = new THREE.BufferGeometry().setFromPoints([from.clone().setY(from.y + off), end.clone().setY(end.y + off)]); const l = new THREE.Line(g, wireMat); scene.add(l); wires.push({ l, t: 1.4 }); }
    if (best) { stun(best, 'taser', 6); sfx('taser', 0.8); if (best.userData.cop) { raiseWanted(1); emit('taserCop', best.position, { ped: best }); } else emit('taserPed', best.position, { ped: best }); }
  }

  // ---------- Wurfsachen ----------
  const projs = [];
  function throwIt(d) {
    const it = inv[cur]; if (!unlimited() && it.res <= 0) { showMsg('KEINE ' + d.n.toUpperCase(), 700); cool = 0.4; return; }
    if (!unlimited()) it.res--; cool = d.rate; player.yaw = camYaw.v; player.mesh.rotation.y = player.yaw; const pm = player.mesh.userData;
    if (pm.mixer) { playAnim(player.mesh, 'Punch_Right', { once: true, fade: 0.05 }); pm.actT = 0.38; } sfx('throw', 0.5);
    const from = new V3(); pm.hand.getWorldPosition(from); from.y = Math.max(from.y, player.pos.y + 1.55);
    const dir = camera.getWorldDirection(new V3()); const sp = cur === 'paint' || cur === 'banger' ? 21 : 17; const v = dir.multiplyScalar(sp); v.y += 3.0;
    spawnProj(cur, from, v, 'player'); if (cur === 'paint') paintIdx++; if (model && cur === 'paint') attach();
    if (!unlimited() && it.res <= 0) setTimeout(() => { if (cur === d.id && inv[cur] && inv[cur].res <= 0) select(inv[last] ? last : 'fists', true); }, 400);
  }
  for (const [k, d] of Object.entries(DEF)) d.id = k;
  function spawnProj(kind, from, vel, who) {
    const m = buildModel(kind); m.scale.setScalar(1.25); m.position.copy(from); scene.add(m);
    const p = { kind, m, v: vel.clone(), t: 0, who, fuse: DEF[kind].fuse || 0, rest: false, spin: new V3(rnd(-9, 9), rnd(-9, 9), rnd(-9, 9)), col: m.userData.col ?? pick(PAINT) };
    if (kind === 'smoke') p.col = pick([0x8a3dff, 0x2fbf4f, 0xff7a1a, 0xe8e8e8, 0xff3b6b]);
    projs.push(p); return p;
  }
  const paintTargets = []; // { box: Box3, onHit(point) }
  function bodyHit(x, y, z, who) {
    for (const p of peds) { const u = p.userData; if (u.state === 'dead' || !p.visible) continue; const dx = p.position.x - x, dz = p.position.z - z; if (dx * dx + dz * dz > 0.42 * 0.42) continue; const dy = y - p.position.y; if (dy < 0.1 || dy > 1.9) continue; return p; }
    if (who !== 'player' && !player.car && player.pos.distanceTo(_v.set(x, player.pos.y, z)) < 0.45 && y - player.pos.y > 0.1 && y - player.pos.y < 1.9) return 'player';
    for (const c of cars) { if (c === player.car && who === 'player') continue; const u = c.userData; const dx = x - c.position.x, dz = z - c.position.z; if (dx * dx + dz * dz > 16) continue; const fx = Math.sin(u.heading), fz = Math.cos(u.heading); const al = dx * fx + dz * fz, ac = dx * fz - dz * fx; const D = u.dims || { l: 4.4, w: 1.9, h: 1.5 }; if (Math.abs(al) < D.l / 2 && Math.abs(ac) < D.w / 2 && y < c.position.y + D.h) return c; }
    return null;
  }
  function updateProj(dt) {
    for (let i = projs.length - 1; i >= 0; i--) {
      const p = projs[i]; p.t += dt; const m = p.m; let gone = false;
      if (!p.rest) {
        p.v.y -= 9.8 * dt; const ox = m.position.x, oy = m.position.y, oz = m.position.z; const nx = ox + p.v.x * dt, ny = oy + p.v.y * dt, nz = oz + p.v.z * dt;
        for (const t of paintTargets) if (p.kind === 'paint' && t.box.containsPoint(_v.set(nx, ny, nz))) { addSplat(new V3(nx, ny, nz), t.normal, p.col, 1.6, t.obj); t.onHit(new V3(nx, ny, nz)); gone = true; break; }
        const ho = !gone && p.t > 0.06 ? bodyHit(nx, ny, nz, p.who) : null;
        if (ho && p.kind === 'molotov') { molotovHit(new V3(nx, ny, nz), ho, p); gone = true; }
        else if (ho) { if (p.kind === 'paint') { splatBody(ho, new V3(nx, ny, nz), p); gone = true; } else if (p.t > 0.1) { p.v.x *= -0.3; p.v.z *= -0.3; } }
        if (!gone && solidAtH(nx, nz, ny) !== -1) {
          const ne = nearestEdge(ox, oz, 8); let n = new V3(-p.v.x, 0, -p.v.z).normalize(); if (ne) { const e = edgeNormal(ne.b.p, ne.e); n.set(e.nx, 0, e.nz); if (n.x * (ox - ne.b.p[ne.e][0]) + n.z * (oz - ne.b.p[ne.e][1]) < 0) n.negate(); }
          if (p.kind === 'molotov') { molotovHit(new V3(ox, oy, oz).addScaledVector(n, 0.4), null, p); gone = true; }
          else if (p.kind === 'paint') { const hp = new V3(ox, oy, oz); addSplat(hp, n, p.col, rnd(1.4, 2.0)); emit('paintWall', hp, { color: p.col }); gone = true; }
          else { const dot = p.v.x * n.x + p.v.z * n.z; p.v.x -= 2 * dot * n.x; p.v.z -= 2 * dot * n.z; p.v.multiplyScalar(0.4); }
        } else if (!gone) m.position.set(nx, ny, nz);
        if (!gone) { const gy = floorAt(m.position.x, m.position.z, m.position.y + 0.3);
          if (m.position.y <= gy + 0.06) { m.position.y = gy + 0.06; if (p.kind === 'molotov') { molotovHit(m.position.clone(), null, p); gone = true; } else if (p.kind === 'paint') { addSplat(m.position.clone().setY(gy + 0.01), new V3(0, 1, 0), p.col, rnd(1.5, 2.2)); emit('paintGround', m.position, {}); gone = true; }
            else if (Math.abs(p.v.y) < 1.6) { p.rest = Math.hypot(p.v.x, p.v.z) < 1; p.v.y = 0; p.v.x *= 0.7; p.v.z *= 0.7; } else { p.v.y = -p.v.y * 0.3; p.v.x *= 0.6; p.v.z *= 0.6; if (p.kind !== 'paint') sfx('bump', 0.15); } }
          m.rotation.x += p.spin.x * dt; m.rotation.z += p.spin.z * dt; if (p.rest) { m.rotation.x = Math.PI / 2; } }
      }
      if (!gone && p.kind === 'molotov' && Math.random() < 0.6) { const q = new V3(); (m.userData.cloth || m).getWorldPosition(q); puff(q, 0xff8a2a, 0.22, 0.25, new V3(rnd(-0.3, 0.3), 1, rnd(-0.3, 0.3)), 0.4, 1, true); }
      if (!gone && p.kind === 'banger' && p.t >= p.fuse) { bang(m.position.clone(), p.who); gone = true; }
      if (!gone && p.kind === 'grenade' && p.t >= p.fuse) { boom(m.position.clone(), p.who); gone = true; }
      if (!gone && p.kind === 'smoke') { if (p.t > 0.8 && p.t < 22) { p.e = (p.e || 0) + dt; while (p.e > 0.06) { p.e -= 0.06; const s = Math.min(1, (p.t - 0.8) / 2); puff(m.position.clone().add(new V3(0, 0.25, 0)), p.col, 0.6 * s + 0.4, 6.5, new V3(rnd(-1.4, 1.4), rnd(0.8, 2.0), rnd(-1.4, 1.4)), 0.95, 0.55); } if (p.t < 1 + dt) { sfx('hiss', 0.6); emit('smoke', m.position, {}); } } if (p.t > 26) gone = true; }
      if (!gone && p.kind === 'flare') { if (p.t > 0.2 && p.t < 28) { flareFx(p, dt); } if (p.t > 29) gone = true; }
      if (gone) { scene.remove(m); projs.splice(i, 1); if (p.light) p.light.busy = 0; }
    }
  }

  function molotovHit(pos, hitObj, p) {
    sfx('glass', clamp(1.2 - pos.distanceTo(player.pos) / 70, 0.1, 1)); sparks(pos, 0xffa040, 18, 5); flashLight(pos, 0xff8a2a, 90, 0.4);
    if (X.wakeParked && !(hitObj && cars.includes(hitObj))) { const w = X.wakeParked(pos, 3.5); if (w.length && !hitObj) hitObj = w[0]; }
    if (X.ignite) { if (hitObj && hitObj !== 'player' && cars.includes(hitObj)) X.ignite(hitObj, { I: 0.6, by: p.who }); else X.ignite(pos, { I: 0.9, life: 9, by: p.who }); for (const c of cars) if (c !== hitObj && !c.userData.fire && c.position.distanceTo(pos) < 2.4) X.ignite(c, { I: 0.4, by: p.who }); }
    if (hitObj === 'player') X.hurtPlayer('fire', 20); else if (hitObj && peds.includes(hitObj)) { damage(hitObj, 35, new V3(0, 0, 1), p.who === 'player' ? 'player' : 'npc'); }
    for (const q of peds) { const u = q.userData; if (u.state === 'walk' && q.position.distanceTo(pos) < 14) { u.state = 'flee'; u.fleeT = 6; } }
    if (p.who === 'player') raiseWanted(1.2); emit('molotov', pos, { who: p.who });
  }
  // ---------- Effekte: Rauch, Funken, Licht ----------
  const puffTex = canvasTex(64, 64, (ctx, w, h) => { const gr = ctx.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h); });
  const puffs = [];
  function puff(pos, color, size, life, vel, grow, maxOp, additive) {
    if (puffs.length > 520) return null; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color, transparent: true, depthWrite: false, opacity: 0, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    if (!additive) s.material.color.multiplyScalar((0.22 + 0.78 * (X.world.day ?? 1)) * (0.75 + Math.random() * 0.35)); // Rauch ist nicht selbstleuchtend
    s.position.copy(pos); s.scale.setScalar(size); s.material.rotation = Math.random() * 6; s.userData = { v: vel, life, t: 0, grow, op: maxOp }; scene.add(s); puffs.push(s); return s;
  }
  function updatePuffs(dt) {
    for (let i = puffs.length - 1; i >= 0; i--) { const s = puffs[i], u = s.userData; u.t += dt; s.position.addScaledVector(u.v, dt); u.v.multiplyScalar(Math.pow(0.55, dt)); u.v.y += 0.25 * dt; const k = u.t / u.life; s.scale.addScalar(u.grow * dt * (1 - k * 0.6)); s.material.opacity = u.op * Math.min(1, u.t * 4) * (1 - k) * (1 - k * 0.3);
      if (u.t >= u.life) { scene.remove(s); s.material.dispose(); puffs.splice(i, 1); } }
  }
  // Lichter nur sichtbar, solange sie leuchten: unsichtbare Punktlichter kosten im Shader nichts
  const lights = []; for (let i = 0; i < 2; i++) { const l = new THREE.PointLight(0xffffff, 0, 26, 2); l.castShadow = false; l.visible = false; scene.add(l); lights.push({ l, t: 0, dur: 1, peak: 0, busy: 0 }); }
  function flashLight(pos, color, peak, dur) { const L = lights.filter(x => !x.busy).sort((a, b) => a.t - b.t)[0]; if (!L) return; L.l.position.copy(pos).setY(pos.y + 1); L.l.color.setHex(color); L.peak = peak; L.dur = dur; L.t = dur; }
  function updateLights(dt) { for (const L of lights) { if (L.busy) continue; L.t = Math.max(0, L.t - dt); L.l.intensity = L.peak * (L.t / L.dur) ** 1.5; L.l.visible = L.l.intensity > 0.05; } }
  function flareFx(p, dt) {
    const pos = p.m.position; const fl = 0.75 + Math.random() * 0.5;
    if (!p.light) { const L = lights.find(x => !x.busy) || lights[0]; L.busy = 1; p.light = L; sfx('hiss', 0.7); emit('flare', pos, {}); }
    p.light.l.position.set(pos.x, pos.y + 0.6, pos.z); p.light.l.color.setHex(0xff3018); p.light.l.intensity = 60 * fl * (p.t > 26 ? (28 - p.t) / 2 : 1); p.light.l.visible = p.light.l.intensity > 0.05;
    p.e = (p.e || 0) + dt; while (p.e > 0.05) { p.e -= 0.05; puff(pos.clone().setY(pos.y + 0.15), 0xff5a2a, 0.35, 0.35, new V3(rnd(-1.5, 1.5), rnd(1.5, 3.5), rnd(-1.5, 1.5)), 0.2, 1, true); if (Math.random() < 0.4) puff(pos.clone().setY(pos.y + 0.4), 0xc8504a, 0.8, 5, new V3(rnd(-0.5, 0.5), rnd(0.8, 1.6), rnd(-0.5, 0.5)), 1.4, 0.5); }
    if (Math.random() < dt * 4) sfx('crackle', 0.15);
  }
  function sparks(pos, color, n, sp) { for (let i = 0; i < n; i++) puff(pos.clone(), color, 0.25, rnd(0.25, 0.6), new V3(rnd(-1, 1), rnd(-0.2, 1.2), rnd(-1, 1)).normalize().multiplyScalar(rnd(sp * 0.4, sp)), 0, 1, true); }
  function bang(pos, who) {
    const d = pos.distanceTo(player.pos); sfx('bang', clamp(1.2 - d / 90, 0.15, 1.2)); flashLight(pos, 0xfff0c0, 120, 0.18); sparks(pos, 0xfff0b0, 26, 9); for (let i = 0; i < 5; i++) puff(pos.clone(), 0x9a9a9a, 0.6, 2.5, new V3(rnd(-1, 1), rnd(0.5, 1.5), rnd(-1, 1)), 1.6, 0.6);
    if (d < 25) camShake(0.25 * (1 - d / 25)); if (d < 2.5 && !player.car) X.hurtPlayer('bang', 12);
    for (const p of peds) { const u = p.userData; const dd = p.position.distanceTo(pos); if (dd < 2.5 && u.state !== 'dead') damage(p, 18, new V3().subVectors(p.position, pos).setY(0).normalize(), who === 'player' ? 'player' : 'npc'); else if (dd < 16 && u.state === 'walk') { u.state = 'flee'; u.fleeT = rnd(3, 6); } }
    if (who === 'player') { const cop = peds.some(p => p.userData.cop && p.position.distanceTo(pos) < 30); if (cop) raiseWanted(0.4); }
    emit('banger', pos, { who });
  }
  const scorchMat = new THREE.MeshBasicMaterial({ map: null, color: 0x111111, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  function boom(pos, who) {
    const d = pos.distanceTo(player.pos); sfx('explosion', clamp(1.3 - d / 160, 0.15, 1.3)); flashLight(pos, 0xffa040, 260, 0.45); burst(pos.clone().setY(pos.y + 0.5), 0xff7a1a, 30, 6); burst(pos.clone().setY(pos.y + 1), 0x222222, 14, 3);
    for (let i = 0; i < 10; i++) puff(pos.clone().setY(pos.y + 0.6), i < 4 ? 0xffa040 : 0x3a3530, i < 4 ? 1.2 : 1.6, i < 4 ? 0.5 : 4, new V3(rnd(-2, 2), rnd(1, 4), rnd(-2, 2)), i < 4 ? 6 : 2.2, i < 4 ? 1 : 0.8, i < 4);
    if (d < 45) camShake(0.7 * (1 - d / 45));
    if (!player.car && d < 8) X.hurtPlayer('boom', 95 * (1 - d / 8));
    for (const p of peds) { const u = p.userData; const dd = p.position.distanceTo(pos); if (dd < 8 && u.state !== 'dead') { const dir = new V3().subVectors(p.position, pos).setY(0).normalize(); damage(p, 150 * (1 - dd / 8), dir, who === 'player' ? 'player' : 'npc'); if (u.state === 'dead') { u.fly = new V3(dir.x * 8, 6 + rnd(0, 3), dir.z * 8); u.spin = rnd(-6, 6); } } else if (dd < 30 && u.state === 'walk') { u.state = 'flee'; u.fleeT = 8; } }
    if (X.wakeParked) X.wakeParked(pos, 7);
    for (const c of [...cars]) { const dd = c.position.distanceTo(pos); if (c.userData.mode === 'wreck' || dd > 7) continue; const src = who === 'player' ? 'player' : 'npc'; if (dd < 4.5) explode(c, src); else { c.userData.hp -= 45; if (c.userData.hp <= 0) explode(c, src); } }
    const g = new THREE.Mesh(new THREE.CircleGeometry(1.8, 16), scorchMat); g.rotation.x = -Math.PI / 2; g.position.set(pos.x, floorAt(pos.x, pos.z, pos.y + 0.5) + 0.03, pos.z); scene.add(g); splats.push(g); trimSplats();
    if (who === 'player') raiseWanted(2); emit('grenade', pos, { who });
  }

  // ---------- Farbe ----------
  const splatTex = canvasTex(128, 128, (ctx, w, h) => { ctx.fillStyle = '#fff'; const blob = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }; blob(64, 64, 30); for (let i = 0; i < 22; i++) { const a = Math.random() * 6.28, d = 26 + Math.random() * 30; blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 2 + Math.random() * 7); } for (let i = 0; i < 7; i++) { const a = Math.random() * 6.28; ctx.save(); ctx.translate(64, 64); ctx.rotate(a); ctx.fillRect(-3, 0, 6, 36 + Math.random() * 22); ctx.restore(); } });
  const splatMats = {}; const splatGeo = new THREE.PlaneGeometry(1, 1); const splats = [];
  const splatMat = col => splatMats[col] || (splatMats[col] = new THREE.MeshStandardMaterial({ map: splatTex, color: col, roughness: 0.35, metalness: 0, transparent: true, alphaTest: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, emissive: col, emissiveIntensity: 0.12, side: THREE.DoubleSide }));
  function trimSplats() { while (splats.length > 260) { const o = splats.shift(); if (o.parent) o.parent.remove(o); } }
  function addSplat(pos, normal, col, size, parent) {
    const s = new THREE.Mesh(splatGeo, splatMat(col)); s.position.copy(pos).addScaledVector(normal, 0.035); s.lookAt(s.position.clone().add(normal)); s.rotateZ(rnd(0, 6.28)); s.scale.setScalar(size); s.renderOrder = 2;
    scene.add(s); if (parent) parent.attach(s); splats.push(s); trimSplats(); sfx('splat', clamp(1 - pos.distanceTo(player.pos) / 60, 0.1, 0.9)); burst(pos, col, 5, 1.2); return s;
  }
  function splatBody(o, pt, p) {
    if (o === 'player') { X.hurtPlayer('paint', 0); return; }
    if (peds.includes(o)) { const n = new V3(pt.x - o.position.x, 0, pt.z - o.position.z).normalize(); const s = addSplat(pt, n, p.col, 0.7, o); const u = o.userData; if (u.cop) { if (p.who === 'player') raiseWanted(0.6); emit('paintCop', pt, { ped: o, who: p.who }); } else { if (u.state === 'walk') { u.state = 'flee'; u.fleeT = 5; } emit('paintPed', pt, { ped: o, who: p.who }); } return s; }
    const c = o; const n = new V3(pt.x - c.position.x, 0.6, pt.z - c.position.z).normalize(); addSplat(pt, n, p.col, 1.1, c); emit('paintCar', pt, { car: c, who: p.who }); if (c.userData.police && p.who === 'player') raiseWanted(0.4);
  }

  // ---------- Feuerwerk (Kreativmodus) ----------
  const fws = [];
  function firework(pos) { const base = new THREE.Group(); base.add(box(0.5, 0.35, 0.5, MS(0x8a1c1c, 0.7, 0), 0, 0.18, 0), box(0.52, 0.04, 0.52, MS(0xe0c040, 0.5, 0.2), 0, 0.36, 0)); base.position.copy(pos); base.position.y = floorAt(pos.x, pos.z, pos.y + 1); scene.add(base); fws.push({ base, n: 18, t: 0.5, rockets: [] }); sfx('hiss', 0.4); }
  function updateFireworks(dt) {
    for (let i = fws.length - 1; i >= 0; i--) { const f = fws[i]; f.t -= dt;
      if (f.n > 0 && f.t <= 0) { f.n--; f.t = rnd(0.35, 0.8); const r = { p: f.base.position.clone().setY(f.base.position.y + 0.4), v: new V3(rnd(-1.5, 1.5), rnd(17, 22), rnd(-1.5, 1.5)), t: 0, col: pick([0xff3060, 0x40ff90, 0x40a0ff, 0xffd040, 0xff70ff, 0xffffff]) }; f.rockets.push(r); sfx('whoosh', clamp(1 - r.p.distanceTo(player.pos) / 150, 0.1, 0.6)); }
      for (let j = f.rockets.length - 1; j >= 0; j--) { const r = f.rockets[j]; r.t += dt; r.v.y -= 9.8 * dt; r.p.addScaledVector(r.v, dt); puff(r.p.clone(), 0xffd8a0, 0.3, 0.4, new V3(rnd(-0.3, 0.3), -1, rnd(-0.3, 0.3)), 0, 0.9, true);
        if (r.v.y < 4) { for (let k = 0; k < 46; k++) puff(r.p.clone(), r.col, 0.7, rnd(1.0, 1.8), new V3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(9, 15)), 0, 1, true); flashLight(r.p, r.col, 160, 0.5); sfx('bang', clamp(1 - r.p.distanceTo(player.pos) / 200, 0.1, 0.7)); setTimeout(() => sfx('crackle', 0.35), 350); f.rockets.splice(j, 1); emit('firework', r.p, {}); } }
      if (f.n <= 0 && !f.rockets.length) { f.age = (f.age || 0) + dt; if (f.age > 20) { scene.remove(f.base); fws.splice(i, 1); } } }
  }

  // ---------- Schleife ----------
  function update(dt) {
    cool -= dt; heat = Math.max(0, heat - dt * 1.6); if (barT > 0) { barT -= dt; if (barT <= 0) drawBar(); }
    if (trigger && DEF[cur].auto && !X.creativeSpawnerActive()) tryFire(false);
    if (meleeT >= 0) { meleeT -= dt; if (meleeT < 0) meleeHit(DEF[cur]); }
    if (model && model.userData.piv) { if (swingT > 0) { swingT -= dt; const k = 1 - swingT / 0.34; model.userData.piv.rotation.x = k < 0.35 ? 0.7 + k / 0.35 * 0.5 : 1.2 - (k - 0.35) / 0.65 * 3.1; } else model.userData.piv.rotation.x += (0.7 - model.userData.piv.rotation.x) * Math.min(1, dt * 10); }
    for (const p of peds) if (p.userData.state === 'stunned') updateStunned(p, dt);
    for (let i = wires.length - 1; i >= 0; i--) { wires[i].t -= dt; if (wires[i].t <= 0) { scene.remove(wires[i].l); wires[i].l.geometry.dispose(); wires.splice(i, 1); } }
    updateProj(dt); updatePuffs(dt); updateLights(dt); updateFireworks(dt); drawBar();
  }
  function inSmoke(pos) { for (const p of projs) if (p.kind === 'smoke' && p.t > 2 && p.t < 24 && p.m.position.distanceTo(pos) < 5.5) return true; return false; }

  reset();
  return { quick, DEF, ORDER, inv, give, reset, save, load, confiscate, lock, allowed, get locked() { return lockMode; }, select, slotKey, cycle, press, update, reload, addAmmo, attach, hud, canAim, stun, spawnProj, sprayCone, puff, sparks, bang, boom, flashLight, firework, addSplat, paintTargets, inSmoke, buildModel, PAINT, get cur() { return cur; }, get trigger() { return trigger; }, projs, puffs };
}

// Christoph 2: Rettungshubschrauber auf dem Dach der BG Unfallklinik (Seckbach), Aufzug vom Eingang zum Dachlandeplatz, selbst fliegen.
// Der Hubschrauber ist im Fahrzeugsystem ein „Auto“ (cars, E zum Einsteigen, Kamera folgt), fliegt aber mit eigener Physik (heliDrive).
// Steuerung: W/S neigen (vor/zurück), A/D drehen, Leertaste steigen, Shift sinken, E aussteigen (nur gelandet).
/** @param {import('./types').Ctx} X */
export function initHeli(X) {
  const { THREE, scene, cars, player } = X;
  const BGU = [-35, -1767]; // Hauptgebäude der BG Unfallklinik Frankfurt (Friedberger Landstraße 430)
  const STOP = [-250, -1710]; // Haltestelle „Unfallklinik“: von hier kommt man zu Fuß
  let site = null; // { b, pad:[x,z,y], ground:[x,z], roofSpot:[x,z,y] }
  let heli = null, signT = 0, respawnT = 0;
  let txName = null, txCross = null; // Beschriftungs-Texturen einmal für alle Hubschrauber (disposeCar gibt keine Texturen frei)

  // ---------- Modell ----------
  function label(text, w = 512, h = 96, bg = null, fg = '#c8102e') { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); } g.fillStyle = fg; g.font = `900 ${Math.round(h * 0.62)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 3); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
  function makeHeli() {
    const g = new THREE.Group(); g.rotation.order = 'YXZ'; const body = new THREE.Group(); g.add(body);
    const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.35, metalness: 0.1 }), red = new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.4 }), dark = new THREE.MeshStandardMaterial({ color: 0x24272c, roughness: 0.6 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x1d3a52, roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.85 }), metal = new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: 0.35, metalness: 0.7 });
    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, parent = body) => { geo.userData.own = mat.userData.own = true; /* je Hubschrauber neu gebaut: disposeCar darf sie freigeben */ const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; parent.add(m); return m; };
    const hull = add(new THREE.SphereGeometry(1, 24, 16), white, 0, 1.65, 0.5); hull.scale.set(1.25, 1.15, 2.5);
    add(new THREE.SphereGeometry(1, 24, 16), glass, 0, 1.95, 1.75).scale.set(1.08, 0.82, 1.35);
    const band = add(new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, Math.PI * 0.52, Math.PI * 0.16), red, 0, 1.65, 0.5); band.scale.set(1.27, 1.17, 2.52);
    add(new THREE.CylinderGeometry(0.2, 0.42, 5.6, 12), white, 0, 1.95, -3.6, Math.PI / 2);
    add(new THREE.BoxGeometry(0.14, 1.7, 1.1), red, 0, 2.75, -6.3, 0.25);
    add(new THREE.BoxGeometry(2.0, 0.08, 0.55), white, 0, 2.05, -5.4);
    add(new THREE.BoxGeometry(1.2, 0.5, 1.6), white, 0, 2.75, 0.2); // Triebwerksverkleidung
    for (const sx of [-0.95, 0.95]) { add(new THREE.CylinderGeometry(0.06, 0.06, 3.6, 8), metal, sx, 0.12, 0.4, Math.PI / 2); for (const sz of [-0.4, 1.3]) add(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), metal, sx * 0.85, 0.55, sz, 0, 0, sx * 0.25); }
    // Beschriftung (ohne Logos): „CHRISTOPH 2“ auf beiden Seiten des Heckauslegers, Rettungskreuz an der Tür
    const tx = txName || (txName = label('CHRISTOPH 2', 512, 96)); const plate = new THREE.MeshBasicMaterial({ map: tx, transparent: true, side: THREE.DoubleSide });
    for (const sx of [-1, 1]) { const p = add(new THREE.PlaneGeometry(2.8, 0.52), plate, sx * 0.4, 1.98, -3.2, 0, sx * Math.PI / 2); p.castShadow = false; }
    const cross = txCross || (txCross = label('✚', 128, 128, null, '#c8102e')); const cm = new THREE.MeshBasicMaterial({ map: cross, transparent: true, side: THREE.DoubleSide });
    for (const sx of [-1, 1]) add(new THREE.PlaneGeometry(0.75, 0.75), cm, sx * 1.27, 1.7, 0.1, 0, sx * Math.PI / 2).castShadow = false;
    // Rotoren
    const rotor = new THREE.Group(); rotor.position.set(0, 3.2, 0.3); g.add(rotor); add(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8), metal, 0, -0.2, 0, 0, 0, 0, rotor);
    for (let i = 0; i < 4; i++) { const bl = add(new THREE.BoxGeometry(0.32, 0.04, 5.3), dark, 0, 0, 0, 0, i * Math.PI / 2, 0, rotor); bl.geometry.translate(0, 0, 2.65); }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(5.3, 40), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })); disc.geometry.userData.own = disc.material.userData.own = true; disc.rotation.x = -Math.PI / 2; rotor.add(disc);
    const tail = new THREE.Group(); tail.position.set(0.18, 2.75, -6.45); g.add(tail); for (let i = 0; i < 2; i++) add(new THREE.BoxGeometry(0.04, 1.5, 0.16), dark, 0, 0, 0, i * Math.PI / 2, 0, 0, tail);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 })); beacon.geometry.userData.own = beacon.material.userData.own = true; beacon.position.set(0, 3.05, -0.6); g.add(beacon);
    g.userData = { speed: 0, heading: 0, hp: 450, police: false, driver: null, mode: 'parked', bar: null, wheels: [], tlMat: {}, cone: Object.assign(new THREE.Object3D(), { visible: false }), type: "heli", blMat: null, blink: 0, blinkT: 0, heads: [], bodyMats: [white], dims: { w: 3.2, h: 3.6, l: 12 }, heli: true, keep: true, rotor, tail, disc, beacon, vel: new THREE.Vector3(), rpm: 0, tilt: 0, roll: 0, landed: true };
    return g;
  }

  // ---------- Landeplatz und Aufzug ----------
  const polyArea = P => P.reduce((a, p, i) => { const q = P[(i + 1) % P.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
  const inPoly = (x, z, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [ax, az] = P[i], [bx, bz] = P[j]; if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) c = !c; } return c; };
  const edgeDist = (x, z, P) => { let best = 1e9; for (let i = 0; i < P.length; i++) { const [ax, az] = P[i], [bx, bz] = P[(i + 1) % P.length]; const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)); best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z)); } return best; };
  function findSite() {
    let b = null, bd = 1e9; for (const q of X.WORLD.buildings) { if (!q) continue; const cx = q.p.reduce((a, p) => a + p[0], 0) / q.p.length, cz = q.p.reduce((a, p) => a + p[1], 0) / q.p.length; const d = Math.hypot(cx - BGU[0], cz - BGU[1]); if (d < 90 && Math.abs(polyArea(q.p)) > 3000 && d < bd) { bd = d; b = q; } }
    if (!b || b.base === undefined) return null; // erst, wenn das Gebäude gebaut ist (Dachhöhe bekannt)
    // Landeplatz: Punkt mit größtem Abstand zu den Dachkanten (grobes Raster)
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of b.p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    let pad = null, pd = -1; for (let x = x0; x <= x1; x += 2) for (let z = z0; z <= z1; z += 2) { if (!inPoly(x, z, b.p)) continue; const d = edgeDist(x, z, b.p); if (d > pd) { pd = d; pad = [x, z]; } }
    if (!pad) return null; const py = X.roofHeight(b, pad[0], pad[1]);
    // Aufzug unten: Kantenpunkt zur Haltestelle hin, 1,5 m vor der Wand; oben: 9 m neben dem Landeplatz Richtung Aufzugsschacht
    let gp = null, gd = 1e9; for (let i = 0; i < b.p.length; i++) { const [ax, az] = b.p[i], [bx, bz] = b.p[(i + 1) % b.p.length]; for (let t = 0.1; t <= 0.9; t += 0.1) { const x = ax + (bx - ax) * t, z = az + (bz - az) * t; const d = Math.hypot(x - STOP[0], z - STOP[1]); if (d < gd) { gd = d; const L = Math.hypot(bx - ax, bz - az) || 1; let nx = (bz - az) / L, nz = -(bx - ax) / L; if (inPoly(x + nx * 1.5, z + nz * 1.5, b.p)) { nx = -nx; nz = -nz; } gp = [x + nx * 1.8, z + nz * 1.8]; } } }
    const dx = gp[0] - pad[0], dz = gp[1] - pad[1], L = Math.hypot(dx, dz) || 1; let rs = [pad[0] + dx / L * Math.min(9.5, pd - 1.5), pad[1] + dz / L * Math.min(9.5, pd - 1.5)]; if (!inPoly(rs[0], rs[1], b.p)) rs = [pad[0] + 6, pad[1]];
    return { b, pad: [pad[0], pad[1], py], ground: gp, roofSpot: [rs[0], rs[1], X.roofHeight(b, rs[0], rs[1])], clear: pd };
  }
  function buildSite(S) {
    const g = new THREE.Group(); g.userData.noChunk = true; const [px, pz, py] = S.pad;
    const padTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d'); x.fillStyle = '#3b4046'; x.fillRect(0, 0, 512, 512); x.strokeStyle = '#f2f2f2'; x.lineWidth = 18; x.beginPath(); x.arc(256, 256, 200, 0, 7); x.stroke(); x.strokeStyle = '#ffd400'; x.lineWidth = 10; x.strokeRect(12, 12, 488, 488); x.fillStyle = '#f2f2f2'; x.font = '900 260px system-ui'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('H', 256, 268); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(17, 17), new THREE.MeshLambertMaterial({ map: padTex })); pad.rotation.x = -Math.PI / 2; pad.position.set(px, py + 0.06, pz); pad.receiveShadow = true; g.add(pad);
    const lamp = new THREE.MeshBasicMaterial({ color: 0x5cff7a }); for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const l = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), lamp); l.position.set(px + Math.cos(a) * 8.6, py + 0.15, pz + Math.sin(a) * 8.6); g.add(l); }
    // Aufzugshäuschen auf dem Dach und Schild unten
    const [rx, rz, ry] = S.roofSpot; const hut = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3, 2.6), new THREE.MeshLambertMaterial({ color: 0xd7dbe0 })); const hx = rx + (S.ground[0] - S.pad[0]) / Math.hypot(S.ground[0] - S.pad[0], S.ground[1] - S.pad[1]) * 2.2, hz = rz + (S.ground[1] - S.pad[1]) / Math.hypot(S.ground[0] - S.pad[0], S.ground[1] - S.pad[1]) * 2.2; hut.position.set(hx, ry + 1.5, hz); hut.castShadow = true; g.add(hut);
    const sign = (txt, x, y, z, face) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.64), new THREE.MeshBasicMaterial({ map: label(txt, 640, 120, '#c8102e', '#ffffff'), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(face[0], y, face[1]); g.add(m); };
    sign('AUFZUG · LANDEPLATZ', S.ground[0], X.TH(S.ground[0], S.ground[1]) + 3.2, S.ground[1], STOP); sign('BG UNFALLKLINIK', S.ground[0], X.TH(S.ground[0], S.ground[1]) + 4.0, S.ground[1], STOP);
    scene.add(g); return g;
  }
  function placeHeli() { const [px, pz, py] = site.pad; heli = makeHeli(); heli.position.set(px, py + 0.05, pz); const h = Math.atan2(site.ground[0] - px, site.ground[1] - pz) + Math.PI / 2; heli.userData.heading = h; heli.rotation.y = h; scene.add(heli); cars.push(heli); X.shootables.push(heli); }
  function elevator(up) {
    const ov = document.createElement('div'); ov.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;transition:opacity .35s;z-index:60;display:flex;align-items:center;justify-content:center;color:#fff;font:800 22px system-ui;letter-spacing:2px'; ov.textContent = up ? 'AUFZUG ▲ DACHLANDEPLATZ' : 'AUFZUG ▼ ERDGESCHOSS'; document.body.appendChild(ov); requestAnimationFrame(() => ov.style.opacity = '1'); X.sfx && X.sfx('bell', 0.4);
    setTimeout(() => { const [x, z, y] = up ? site.roofSpot : [site.ground[0], site.ground[1], X.TH(site.ground[0], site.ground[1])]; player.pos.set(x, y + 0.05, z); player.vy = 0; if (player.mesh) player.mesh.position.copy(player.pos); if (up) X.camYaw.v = Math.atan2(site.pad[0] - x, site.pad[1] - z) + Math.PI; ov.style.opacity = '0'; setTimeout(() => ov.remove(), 400); if (up) X.showMsg('CHRISTOPH 2 · E zum Einsteigen', 2200, 'ok'); }, 900);
  }
  X.fHooks = X.fHooks || [];
  X.fHooks.push(() => { if (!site) return null; const d0 = Math.hypot(player.pos.x - site.ground[0], player.pos.z - site.ground[1]); if (d0 < 2.6 && Math.abs(player.pos.y - X.TH(site.ground[0], site.ground[1])) < 2) return { label: 'F · Aufzug zum Hubschrauber-Landeplatz', act: () => elevator(true) };
    const d1 = Math.hypot(player.pos.x - site.roofSpot[0], player.pos.z - site.roofSpot[1]); if (d1 < 3 && Math.abs(player.pos.y - site.roofSpot[2]) < 2) return { label: 'F · Aufzug ins Erdgeschoss', act: () => elevator(false) }; return null; });

  // ---------- Flugphysik ----------
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  function heliDrive(c, dt, ctrl) {
    const u = c.userData, p = c.position; const on = player.car === c;
    u.rpm += ((on ? 1 : 0) - u.rpm) * Math.min(1, dt * (on ? 0.45 : 0.25)); const power = Math.max(0, (u.rpm - 0.75) / 0.25); // erst ab ~75 % Drehzahl trägt der Rotor
    const yawIn = (ctrl.left ? 1 : 0) - (ctrl.right ? 1 : 0), fIn = (ctrl.fwd ? 1 : 0) - (ctrl.back ? 1 : 0);
    if (u.rpm > 0.5) u.heading += yawIn * (u.landed ? 0.35 : 1.25) * dt;
    u.tilt += ((u.landed ? 0 : fIn * 0.28) - u.tilt) * Math.min(1, dt * 2.2); u.roll += ((u.landed ? 0 : -yawIn * 0.22 * Math.min(1, u.speed / 15)) - u.roll) * Math.min(1, dt * 2.5);
    const v = u.vel; if (!u.landed) { const acc = u.tilt / 0.28 * 15 * power; v.x += Math.sin(u.heading) * acc * dt; v.z += Math.cos(u.heading) * acc * dt; const dr = Math.exp(-0.34 * dt); v.x *= dr; v.z *= dr;
      /* Schwung dreht in der Kurve teilweise mit (Querneigung), sonst bremst jede Kurve stark */ const hs = Math.hypot(v.x, v.z); if (hs > 3 && u.tilt > 0.05) { const cur = Math.atan2(v.x, v.z), nh = cur + wrap(u.heading - cur) * Math.min(1, dt * 1.6); v.x = Math.sin(nh) * hs; v.z = Math.cos(nh) * hs; } }
    const wantVy = ((ctrl.brake ? 9 : 0) - (ctrl.run ? 7 : 0)) * power; v.y += (wantVy - v.y) * Math.min(1, dt * 2.4); if (power < 1) v.y -= 9.8 * (1 - power) * dt * (u.landed ? 0 : 1);
    if (u.landed && wantVy > 0.5 && power > 0.9) { u.landed = false; X.showMsg && X.showMsg('ABGEHOBEN', 700); }
    const ox = p.x, oy = p.y, oz = p.z; p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
    const top = X.TH(p.x, p.z) + 600; if (p.y > top) { p.y = top; v.y = Math.min(0, v.y); }
    // Hauswand: zurück und abprallen
    if (X.solidAtH(p.x, p.z, p.y + 1.2) !== -1 || X.solidAtH(p.x + Math.sin(u.heading) * 3, p.z + Math.cos(u.heading) * 3, p.y + 1.6) !== -1) { const hs = Math.hypot(v.x, v.z); p.x = ox; p.z = oz; v.x *= -0.3; v.z *= -0.3; if (hs > 10) { damage(c, (hs - 10) * 6); X.camShake && X.camShake(0.4); } }
    // Boden, Dach, Brücke: landen oder aufschlagen
    const fl = X.floorAt(p.x, p.z, p.y + 1.0); if (p.y <= fl) { const hit = -v.y, hs = Math.hypot(v.x, v.z); p.y = fl; if (!u.landed && (hit > 7 || hs > 14)) { damage(c, hit * 14 + hs * 4); X.camShake && X.camShake(0.5); } v.y = 0; if (hit >= 0 || hs < 3) { v.x *= 0.85; v.z *= 0.85; } if (wantVy <= 0.5 && hs < 4) { if (!u.landed) { u.landed = true; X.showMsg && X.showMsg('GELANDET · E zum Aussteigen', 1200, 'ok'); } } }
    if (u.landed) { v.x *= 0.8; v.z *= 0.8; p.y = Math.max(p.y, fl); }
    u.speed = Math.hypot(v.x, v.z); u.alt = p.y - X.TH(p.x, p.z);
    c.rotation.set(u.tilt, u.heading, u.roll); u.rotor.rotation.y += u.rpm * dt * 38; u.tail.rotation.x += u.rpm * dt * 70; u.disc.material.opacity = Math.max(0, u.rpm - 0.4) * 0.28; u.beacon.visible = (performance.now() % 1000) < 120;
  }
  function damage(c, n) { const u = c.userData; u.hp -= n; if (u.hp > 0 || u.mode === 'wreck') return; u.rpm = 0; if (X.explode) X.explode(c, 'player'); else if (player.car === c && X.exitCar) X.exitCar(); u.mode = 'wreck'; /* explode(c) erwartet das Fahrzeug, steigt selbst aus */ X.showMsg && X.showMsg('CHRISTOPH 2 ABGESTÜRZT', 2000); respawnT = 120; }
  X.heliDrive = heliDrive;

  // ---------- je Bild ----------
  function update(dt) {
    if (!site) { if ((signT -= dt) > 0) return null; signT = 2; if (Math.hypot(player.pos.x - BGU[0], player.pos.z - BGU[1]) > 900) return null; site = findSite(); if (!site) return null; site.g = buildSite(site); }
    if (!heli || (!cars.includes(heli) && Math.hypot(player.pos.x - site.pad[0], player.pos.z - site.pad[1]) > 150)) { if (heli && heli.parent) heli.parent.remove(heli); if ((respawnT -= dt) <= 0) placeHeli(); }
    else if (heli.userData.mode === 'wreck') { respawnT -= dt; if (respawnT <= 0 && Math.hypot(player.pos.x - site.pad[0], player.pos.z - site.pad[1]) > 150) { const i = cars.indexOf(heli); if (i >= 0) cars.splice(i, 1); const j = X.shootables.indexOf(heli); if (j >= 0) X.shootables.splice(j, 1); /* sonst bleibt das Wrack für immer in shootables */ if (X.disposeCar) X.disposeCar(heli); scene.remove(heli); heli = null; } }
    if (heli && player.car !== heli && heli.userData.mode !== 'wreck') heliDrive(heli, dt, {}); // Rotor läuft aus, steht auf dem Platz
    if (player.car && player.car.userData.heli) { const u = player.car.userData; return `${u.landed ? 'GELANDET · Leertaste abheben · E aussteigen' : 'W/S vor/zurück · A/D drehen · Leertaste steigen · Shift sinken'} · Höhe ${Math.round(u.alt || 0)} m · ${Math.round(u.speed * 3.6)} km/h`; }
    if (heli && !player.car && heli.position.distanceTo(player.pos) < 7.5 && heli.userData.mode !== 'wreck') return 'E · Christoph 2 fliegen';
    return null;
  }
  return { update, makeHeli, get heli() { return heli; }, get site() { return site; }, elevator, heliDrive };
}

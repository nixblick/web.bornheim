// Innenräume: U-Bahn (echte Stationen, Eingänge und Linien aus OSM, Fahrt quer durch Frankfurt), Läden und Treppenhäuser.
// Ein Innenraum wird bei Bedarf weit außerhalb der Stadt aufgebaut (Taschenraum) und beim Verlassen wieder abgebaut.
export function initInteriors(X, W, D, SH) {
  const { THREE, scene, player, camera, camYaw, camPitch, sfx, showMsg, TH, keys, world, canvasTex, makeHuman, playAnim, animateWalk, nearestEdge, edgeNormal, solidAt, roofHeight, WORLD } = X;
  const V3 = THREE.Vector3; const $ = id => document.getElementById(id);
  X.interiors = true;
  const PX = 60000, PZ = 0; // Taschenraum
  let inside = null; // { kind, grp, walls, triggers, exit, ... }
  let metro = { lines: [], stations: [] }; const ST = new Map();
  /* U-Bahn-Eingänge auf der Minikarte: blaues „U“ im Umkreis der Karte, damit man die Stationen findet (09.11.2026) */
  if (X.mmHooks) X.mmHooks.push((ctx, P, R) => { const done = new Set(); for (const s of metro.stations) { if (s.entr.length === 0) continue; const e = s.entr[0]; const [x, y] = P(e[0], e[1]); if (x * x + y * y > R * R || done.has(s.id)) continue; done.add(s.id);
    ctx.fillStyle = '#0a3d8f'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.fillRect(x - 6, y - 6, 12, 12); ctx.strokeRect(x - 6, y - 6, 12, 12); ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('U', x, y + 0.5); } });
  fetch('data/metro.json').then(r => r.ok ? r.json() : null).then(m => { if (!m) return; metro = m; for (const s of m.stations) ST.set(s.id, s); }).catch(() => {});

  // ---------- Baukasten ----------
  const M = (col, em = 0.35) => new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: em });
  const box = (g, w, h, d, x, y, z, mat, ry = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(PX + x, y, PZ + z); m.rotation.y = ry; g.add(m); return m; };
  const tileTex = (base, line, stripe) => canvasTex(256, 256, (c, w, h) => { c.fillStyle = base; c.fillRect(0, 0, w, h); c.strokeStyle = line; c.lineWidth = 3; for (let i = 0; i <= 8; i++) { c.beginPath(); c.moveTo(i * 32, 0); c.lineTo(i * 32, h); c.stroke(); c.beginPath(); c.moveTo(0, i * 32); c.lineTo(w, i * 32); c.stroke(); } if (stripe) { c.fillStyle = stripe; c.fillRect(0, 150, w, 34); } });
  const signTex = (txt, bg = '#0a3d8f', fg = '#ffffff', w = 1024, h = 160) => { const t = canvasTex(w, h, (c) => { c.fillStyle = bg; c.fillRect(0, 0, w, h); c.fillStyle = fg; let fs = 96; c.font = `bold ${fs}px Arial, sans-serif`; while (c.measureText(txt).width > w - 60 && fs > 30) { fs -= 4; c.font = `bold ${fs}px Arial, sans-serif`; } c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, w / 2, h / 2 + 4); }); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const panel = (g, tex, w, h, x, y, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex })); m.position.set(PX + x, y, PZ + z); m.rotation.y = ry; g.add(m); return m; };
  function room(kind, W2, D2, H, opts) { // Raum mit Boden, Wänden, Decke; Koordinaten relativ zum Taschenraum, Mitte = 0,0
    const g = new THREE.Group(); const o = opts || {};
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W2 * 2, D2 * 2), new THREE.MeshLambertMaterial({ map: o.floorTex || null, color: o.floorCol || 0xffffff, emissive: o.floorCol || 0x888888, emissiveIntensity: 0.25 })); floor.rotation.x = -Math.PI / 2; floor.position.set(PX, 0.01, PZ); if (o.floorTex) { o.floorTex.repeat.set(W2 / 2, D2 / 2); o.floorTex.wrapS = o.floorTex.wrapT = THREE.RepeatWrapping; } g.add(floor);
    const wm = new THREE.MeshLambertMaterial({ map: o.wallTex || null, color: o.wallCol || 0xffffff, emissive: o.wallCol || 0x999999, emissiveIntensity: 0.3, side: THREE.DoubleSide });
    for (const [w, x, z, ry] of [[W2 * 2, 0, -D2, 0], [W2 * 2, 0, D2, Math.PI], [D2 * 2, -W2, 0, Math.PI / 2], [D2 * 2, W2, 0, -Math.PI / 2]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), wm); m.position.set(PX + x, H / 2, PZ + z); m.rotation.y = ry; g.add(m); }
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W2 * 2, D2 * 2), M(o.ceilCol || 0xe8e8e8, 0.4)); ceil.rotation.x = Math.PI / 2; ceil.position.set(PX, H, PZ); g.add(ceil);
    for (let x = -W2 + 3; x < W2 - 1; x += 6) for (let z = -D2 + 2.5; z < D2 - 1; z += 5) box(g, 1.6, 0.06, 0.4, x, H - 0.05, z, new THREE.MeshBasicMaterial({ color: 0xfff6e0 }));
    return { g, W2, D2, H, walls: [], triggers: [] };
  }
  function enter(R, spawn, yaw, exit, label, anchor) {
    if (inside) leaveSilent();
    scene.add(R.g); inside = Object.assign(R, { exit, label });
    const pad = 0.35;
    X.setPocket({ x0: PX - R.W2 - 5, x1: PX + R.W2 + 5, z0: PZ - R.D2 - 5, z1: PZ + R.D2 + 5, label, anchor: anchor || [exit.x, exit.z],
      solidH: (x, z, y) => { const lx = x - PX, lz = z - PZ; if (y !== undefined && y > R.H - 0.35) return true; if (Math.abs(lx) > R.W2 - pad || Math.abs(lz) > R.D2 - pad) return true; for (const w of R.walls) if (lx > w[0] && lx < w[2] && lz > w[1] && lz < w[3] && (y === undefined || y < (w[4] ?? 99))) return true; return false; } });
    player.pos.set(PX + spawn[0], 0, PZ + spawn[1]); player.vy = 0; if (player.mesh) player.mesh.position.copy(player.pos); camYaw.v = yaw; camPitch.v = 0.12;
    const mm = $('minimap'); if (mm) mm.style.visibility = 'hidden'; sfx('click', 0.4);
  }
  function leaveSilent() { if (!inside) return; scene.remove(inside.g); for (const n of inside.npc || []) inside.g.remove(n); /* Figurenmodelle teilen Geometrie, nicht freigeben */ inside.g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map && o.material.map.isCanvasTexture) o.material.map.dispose(); o.material.dispose(); } }); inside = null; X.setPocket(null); const mm = $('minimap'); if (mm) mm.style.visibility = ''; }
  function leave() { if (!inside) return; const e = inside.exit; leaveSilent(); const y = e.y ?? TH(e.x, e.z); player.pos.set(e.x, y, e.z); player.vy = 0; if (player.mesh) player.mesh.position.copy(player.pos); camYaw.v = e.yaw ?? camYaw.v; sfx('click', 0.4); }
  const trig = (R, x, z, r, label, act) => R.triggers.push({ x, z, r, label, act });

  // ---------- Treppenhaus mit Aufzug aufs Dach ----------
  function stairwell(b, door) {
    const R = room('stair', 5, 4, 3.4, { floorTex: tileTex('#b9b2a6', '#9d968a'), wallCol: 0xe9e1d2, ceilCol: 0xf0ece4 });
    const g = R.g; const wood = M(0x7a5a3a, 0.25), metal = M(0x9aa0a6, 0.3), dark = M(0x2a2d33, 0.2);
    for (let i = 0; i < 8; i++) box(g, 1.6, 0.2 * (i + 1), 0.32, 3.4, 0.1 * (i + 1), -3.6 + i * 0.32, M(0xcfc6b6, 0.3)); // Treppe nach oben (Kulisse)
    R.walls.push([2.5, -3.9, 4.9, -1.2]); box(g, 0.06, 1.0, 2.6, 2.55, 0.9, -2.5, metal); // Geländer
    for (let i = 0; i < 12; i++) box(g, 0.34, 0.24, 0.12, -4.0 + (i % 6) * 0.38, 1.2 + Math.floor(i / 6) * 0.28, -3.92, i % 3 ? M(0xb8b0a0, 0.3) : M(0x6d7d8f, 0.3)); // Briefkästen
    box(g, 1.3, 2.3, 0.1, -1, 1.15, 3.95, metal); box(g, 0.04, 2.2, 0.12, -1, 1.15, 3.9, dark); // Aufzugtür
    box(g, 0.12, 0.3, 0.05, -0.15, 1.2, 3.9, M(0xffd84a, 0.8));
    box(g, 1.2, 2.2, 0.1, 0, 1.1, -3.95, wood); // Haustür
    const floors = Math.max(2, Math.floor(b.h / 3.2));
    panel(g, signTex(`${b.n || 'Wohnhaus'} · ${floors} Etagen`, '#efe9dc', '#3a3a3a', 1024, 120), 2.6, 0.3, 1.8, 2.6, 3.94, Math.PI);
    trig(R, 0, -3.2, 1.3, 'F · Raus auf die Straße', leave);
    trig(R, -1, 3.2, 1.3, `F · Aufzug: aufs Dach (${floors}. Stock + Dach)`, () => { const top = roofSpot(b); if (!top) { showMsg('DACH NICHT ERREICHBAR', 900); return; } leaveSilent(); player.pos.set(top[0], top[2], top[1]); player.vy = 0; if (player.mesh) player.mesh.position.copy(player.pos); sfx('bell', 0.4); showMsg('DACH', 900); });
    enter(R, [0, -2.2], 0, door, b.n || 'Treppenhaus');
  }
  function roofSpot(b) { const cx = b.p.reduce((a, p) => a + p[0], 0) / b.p.length, cz = b.p.reduce((a, p) => a + p[1], 0) / b.p.length; for (const t of [1, 0.7, 0.5, 0.3]) { const x = b.p[0][0] + (cx - b.p[0][0]) * t, z = b.p[0][1] + (cz - b.p[0][1]) * t; if (WORLD.buildings[solidAt(x, z)] === b) return [x, z, roofHeight(b, x, z) + 0.05]; } return null; }

  // ---------- Laden von innen ----------
  const SIZE = { super: [12, 8, 3.6], kiosk: [3.5, 3, 3], food: [6, 4.5, 3.2], bakery: [4.5, 3.5, 3.1], pharmacy: [5, 4, 3.2], hardware: [11, 8, 4.2], sports: [7, 5, 3.4] };
  const PROD = [0xd94b3b, 0x3f8fd2, 0xf2c94c, 0x5cb85c, 0xe67e22, 0x9b59b6, 0xecf0f1, 0x1abc9c, 0x8e5a3c];
  function shop(s, door) {
    const [W2, D2, H] = SIZE[s.k] || SIZE.food; const R = room('shop', W2, D2, H, { floorTex: tileTex('#d9d4c8', '#c4bdae'), wallCol: s.k === 'pharmacy' ? 0xe8f4ea : 0xf2efe6 });
    const g = R.g; const shelfM = M(0xd8d8d8, 0.3), counter = M(0x6b4a33, 0.3);
    if (W2 >= 5) { // Regalreihen mit Waren
      const items = []; for (let x = -W2 + 2.5; x < W2 - 3.5; x += 3) { box(g, 0.6, 1.9, D2 * 2 - 4.5, x, 0.95, 0.6, shelfM); R.walls.push([x - 0.4, -D2 + 2.6, x + 0.4, D2 - 1.4]);
        for (let z = -D2 + 2.7; z < D2 - 1.6; z += 0.45) for (const y of [0.45, 0.95, 1.45]) for (const sd of [-0.36, 0.36]) items.push([x + sd, y, z]); }
      const pm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.32, 0.36), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x333333 }), items.length); const o = new THREE.Object3D(); const c = new THREE.Color();
      items.forEach(([x, y, z], i) => { o.position.set(PX + x, y, PZ + z); o.scale.set(1, 0.7 + Math.random() * 0.6, 1); o.updateMatrix(); pm.setMatrixAt(i, o.matrix); pm.setColorAt(i, c.setHex(PROD[i % PROD.length]).multiplyScalar(0.8 + Math.random() * 0.3)); }); g.add(pm);
    } else { for (let z = -D2 + 0.6; z < D2 - 0.4; z += 0.6) box(g, 0.4, 1.8, 0.5, W2 - 0.3, 0.9, z, M(PROD[Math.abs(Math.round(z * 7)) % PROD.length], 0.4)); }
    // Kasse vorn
    const kx = -W2 + 1.6, kz = -D2 + 1.4; box(g, 1.6, 1.0, 0.7, kx, 0.5, kz + 0.6, counter); R.walls.push([kx - 0.9, kz + 0.2, kx + 0.9, kz + 1.0]);
    const cash = makeHuman(Math.random() < 0.5, { top: 0xc0392b }); cash.position.set(PX + kx, 0, PZ + kz + 1.4); cash.rotation.y = Math.PI; g.add(cash); try { playAnim(cash, 'idle'); } catch (e) {} R.npc = [cash];
    panel(g, signTex(s.name, '#1d6a3a'), Math.min(W2 * 1.6, 7), 0.9, 0, H - 0.6, D2 - 0.02, Math.PI);
    box(g, 1.4, 2.3, 0.08, 0, 1.15, -D2 + 0.02, new THREE.MeshLambertMaterial({ color: 0x9fc4e8, transparent: true, opacity: 0.4 })); // Glastür
    trig(R, kx, kz, 1.6, 'F · Kasse: einkaufen', () => SH.open(s));
    trig(R, 0, -D2 + 0.9, 1.2, 'F · Raus auf die Straße', leave);
    enter(R, [0, -D2 + 1.6], 0, door, s.name);
  }

  // ---------- U-Bahn ----------
  const LCOL = r => (metro.lines.find(l => l.ref === r) || {}).color || '#0a3d8f';
  function station(st, exit, onTrain) {
    const L = 46, H = 7; const R = room('metro', L, 13, H, { floorTex: tileTex('#c9c6bf', '#b2aea6'), wallTex: tileTex('#f3f1ea', '#d8d4c8', LCOL(st.lines[0])), ceilCol: 0xd5d8dc });
    const g = R.g; R.H = H;
    // Gleisbetten links und rechts vom Mittelbahnsteig (Bahnsteig z -4..4)
    for (const sd of [-1, 1]) { const bed = new THREE.Mesh(new THREE.PlaneGeometry(L * 2, 5), M(0x3a3632, 0.15)); bed.rotation.x = -Math.PI / 2; bed.position.set(PX, -1.2, PZ + sd * 6.5); g.add(bed);
      box(g, L * 2, 1.2, 0.3, 0, -0.6, sd * 4.1, M(0xb8b4ab, 0.3)); box(g, L * 2, 0.04, 0.35, 0, 0.02, sd * 3.85, M(0xf2d230, 0.6)); // Bahnsteigkante, gelbe Linie
      for (const o of [-0.72, 0.72]) box(g, L * 2, 0.12, 0.08, 0, -1.1, sd * 6.5 + o, M(0x8a8a8a, 0.4));
      for (let x = -L + 4; x < L; x += 15) panel(g, signTex(st.name), 6, 0.95, x, 3.2, sd * 12.95, sd > 0 ? Math.PI : 0); }
    R.walls.push([-L, -13, L, -4], [-L, 4, L, 13]); // nur der Bahnsteig ist begehbar
    for (let x = -L + 6; x < L - 4; x += 10) { box(g, 0.6, H, 0.6, x, H / 2, 0, M(LCOL(st.lines[0]), 0.35)); R.walls.push([x - 0.4, -0.4, x + 0.4, 0.4]); }
    for (let x = -L + 11; x < L - 6; x += 20) { box(g, 1.8, 0.45, 0.5, x, 0.45, 2.6, M(0x5d6d7e, 0.3)); }
    // Linienschild über dem Bahnsteig
    panel(g, signTex(`${st.lines.join(' · ')}   ${st.name}`, LCOL(st.lines[0])), 9, 1.2, 0, H - 1.2, 0.36, 0); panel(g, signTex(`${st.lines.join(' · ')}   ${st.name}`, LCOL(st.lines[0])), 9, 1.2, 0, H - 1.2, -0.36, Math.PI);
    // Treppe nach oben am Ende
    for (let i = 0; i < 12; i++) box(g, 0.42, 0.25 * (i + 1), 3.2, -L + 6.4 - i * 0.4, 0.125 * (i + 1), 0, M(0x9a958c, 0.3)); box(g, 0.08, 1, 4.6, -L + 4, 3.3, 1.7, M(0x5a6068, 0.3)); box(g, 0.08, 1, 4.6, -L + 4, 3.3, -1.7, M(0x5a6068, 0.3)); panel(g, signTex('Ausgang ↑', '#0a3d8f'), 3, 0.6, -L + 3, 4.6, 0, Math.PI / 2);
    R.walls.push([-L, -1.7, -L + 6.6, 1.7]);
    // Fahrkartenautomat
    box(g, 0.8, 1.7, 0.5, -L + 12, 0.85, -3.4, M(0xe3e3e3, 0.4)); box(g, 0.6, 0.4, 0.05, -L + 12, 1.25, -3.14, new THREE.MeshBasicMaterial({ color: 0x3b7bd6 })); R.walls.push([-L + 11.5, -3.8, -L + 12.5, -3.0]);
    trig(R, -L + 8, 0, 2.2, 'F · Treppe rauf zum Ausgang', leave);
    trig(R, -L + 12, -2.6, 1.4, 'F · Fahrkartenautomat: Ziel wählen (3 €)', () => travelMenu(st));
    // Züge auf beiden Gleisen
    R.trains = [-1, 1].map((sd, i) => { const t = trainModel(LCOL(st.lines[i % st.lines.length] || st.lines[0])); g.add(t); return { m: t, sd, x: 140 * (i ? -1 : 1), state: 'away', t: i * 14 + 6, dir: i ? 1 : -1 }; });
    if (onTrain) { const tr = R.trains[0]; tr.state = 'dwell'; tr.x = 0; tr.t = 7; }
    R.update = dt => { for (const tr of R.trains) { tr.t -= dt;
      if (tr.state === 'away' && tr.t <= 0) { tr.state = 'in'; tr.x = -tr.dir * 140; }
      else if (tr.state === 'in') { const d = -tr.x; const v = Math.min(18, Math.max(1.2, Math.abs(d) * 0.45)); tr.x += Math.sign(d) * v * dt; if (Math.abs(d) < 0.3) { tr.x = 0; tr.state = 'dwell'; tr.t = 14; sfx('bell', 0.25); } }
      else if (tr.state === 'dwell' && tr.t <= 0) { tr.state = 'out'; tr.v = 0; }
      else if (tr.state === 'out') { tr.v = Math.min(18, (tr.v || 0) + 3 * dt); tr.x += tr.dir * tr.v * dt; if (Math.abs(tr.x) > 140) { tr.state = 'away'; tr.t = 18 + Math.random() * 20; } }
      tr.m.position.set(PX + tr.x, 0, PZ + tr.sd * 6.5); tr.m.visible = tr.state !== 'away'; } };
    R.trainNear = () => R.trains.find(tr => tr.state === 'dwell' && Math.sign(player.pos.z - PZ) === tr.sd && Math.abs(player.pos.z - PZ) > 2.6);
    R.station = st;
    enter(R, onTrain ? [4, onTrain === 1 ? 2.4 : -2.4] : [-L + 9, 0], onTrain ? Math.PI / 2 : -Math.PI / 2, exit, `U-Bahn ${st.name}`, st.p);
  }
  function trainModel(col) {
    const g = new THREE.Group(); const body = M(0xd8dde2, 0.35), win = M(0x8fa6bb, 0.75), stripe = M(new THREE.Color(col).getHex(), 0.5);
    for (const z of [-13, 13]) { const b = new THREE.Mesh(new THREE.BoxGeometry(25, 3.2, 2.65), body); b.position.set(z, 1.6 - 1.2 + 0.2, 0); g.add(b); const w = new THREE.Mesh(new THREE.BoxGeometry(24, 0.9, 2.7), win); w.position.set(z, 2.0 - 1.2 + 0.4, 0); g.add(w); const s = new THREE.Mesh(new THREE.BoxGeometry(25.05, 0.3, 2.7), stripe); s.position.set(z, 0.95 - 1.2 + 0.2, 0); g.add(s);
      for (let d = -9; d <= 9; d += 6) { const door = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.2, 2.72), M(0x8e969e, 0.3)); door.position.set(z + d, 1.3 - 1.2 + 0.3, 0); g.add(door); } }
    return g;
  }
  // Netz: Nachbarn je Linie, Fahrzeit über Breitensuche (Umstieg + 3 Min.)
  function plan(from, to) {
    const adj = new Map(); for (const l of metro.lines) for (let i = 0; i < l.stops.length; i++) { const a = l.stops[i]; if (!adj.has(a)) adj.set(a, []); if (i) adj.get(a).push([l.stops[i - 1], l.ref]); if (i < l.stops.length - 1) adj.get(a).push([l.stops[i + 1], l.ref]); }
    const best = new Map([[from.id + '|', 0]]); const q = [[0, from.id, '', [from.id]]];
    while (q.length) { q.sort((a, b) => a[0] - b[0]); const [c, id, line, path] = q.shift(); if (id === to.id) return { min: Math.max(2, Math.round(c)), path, line }; for (const [n, l] of adj.get(id) || []) { const nc = c + 1.8 + (line && l !== line ? 3 : 0); const k = n + '|' + l; if (nc < (best.get(k) ?? 1e9)) { best.set(k, nc); q.push([nc, n, l, path.concat(n)]); } } }
    return null;
  }
  const reachable = s => { const k = Math.floor(s.p[0] / X.TS) + '_' + Math.floor(s.p[1] / X.TS); return !!X.WIDX.tiles[k]; };
  let menuEl = null;
  function travelMenu(st) {
    if (!menuEl) { menuEl = document.createElement('div'); menuEl.id = 'metromenu'; menuEl.style.cssText = 'position:fixed;inset:0;background:#000b;display:none;align-items:center;justify-content:center;z-index:45;font-family:system-ui,sans-serif'; document.body.appendChild(menuEl); }
    const dests = metro.stations.filter(s => s.id !== st.id && reachable(s)).map(s => ({ s, p: plan(st, s) })).filter(d => d.p).sort((a, b) => a.p.min - b.p.min);
    const mine = dests.filter(d => d.s.lines.some(l => st.lines.includes(l))), other = dests.filter(d => !d.s.lines.some(l => st.lines.includes(l)));
    const item = d => `<div class="mi" data-id="${d.s.id}" style="display:flex;justify-content:space-between;gap:10px;padding:6px 8px;border-radius:7px;cursor:pointer"><span>${d.s.lines.map(l => `<b style="background:${LCOL(l)};color:#fff;border-radius:4px;padding:0 5px;font-size:12px;margin-right:4px">${l}</b>`).join('')}${d.s.name}</span><span style="color:#aaa">${d.p.min} Min.</span></div>`;
    menuEl.innerHTML = `<div style="background:#16181d;color:#eee;border:1px solid #333;border-radius:12px;padding:16px 18px;width:min(560px,94vw);max-height:86vh;overflow:auto"><h3 style="margin:0 0 4px">🚇 ${st.name}</h3><div style="color:#aaa;font-size:13px;margin-bottom:8px">Fahrkarte 3 € · Du hast ${player.money} € · Klick aufs Ziel</div>` +
      (mine.length ? `<div style="color:#ffd84a;font-size:13px;margin:6px 0">Direkt (${st.lines.join(', ')})</div>` + mine.map(item).join('') : '') + (other.length ? `<div style="color:#ffd84a;font-size:13px;margin:10px 0 6px">Mit Umstieg</div>` + other.map(item).join('') : '') +
      `<div style="margin-top:10px;text-align:right"><button id="mm_x" style="background:#2a2d35;color:#eee;border:1px solid #444;border-radius:8px;padding:8px 14px;font:600 14px system-ui;cursor:pointer">Abbrechen</button></div></div>`;
    const close = () => { menuEl.style.display = 'none'; X.shopOpen = false; window.__noAutoMenu = false; if (wasLocked) { wasLocked = false; try { X.renderer.domElement.requestPointerLock(); } catch (e) {} } };
    let wasLocked = !!document.pointerLockElement; window.__noAutoMenu = true; if (wasLocked) document.exitPointerLock(); X.shopOpen = true; for (const k in keys) keys[k] = false;
    menuEl.querySelector('#mm_x').onclick = close;
    for (const d of menuEl.querySelectorAll('.mi')) { d.onmouseenter = () => d.style.background = '#2a2d35'; d.onmouseleave = () => d.style.background = ''; d.onclick = () => { close(); ride(st, ST.get(d.dataset.id)); }; }
    menuEl.style.display = 'flex';
  }
  let riding = false;
  async function ride(from, to) {
    if (riding || !to) return; const p = plan(from, to); if (!p) return; riding = true;
    let fine = false; if (player.money >= 3) player.money -= 3; else if (Math.random() < 0.35) fine = true;
    const ov = document.createElement('div'); ov.style.cssText = 'position:fixed;inset:0;background:#05070a;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:46;font-family:system-ui,sans-serif;transition:opacity .4s'; document.body.appendChild(ov);
    const names = p.path.map(id => (ST.get(id) || {}).name || id);
    ov.innerHTML = `<div style="font-size:14px;color:#aaa">${p.line || to.lines[0]} · Richtung ${to.name}</div><div id="rnext" style="font-size:30px;font-weight:800;margin:10px 0">${names[1] || to.name}</div><div style="width:min(420px,80vw);height:6px;background:#222;border-radius:3px"><div id="rbar" style="height:6px;width:0;background:${LCOL(p.line || to.lines[0])};border-radius:3px"></div></div><div style="font-size:13px;color:#888;margin-top:10px">${p.path.length - 1} Halte · ${p.min} Minuten</div>`;
    sfx('bell', 0.4); const t0 = performance.now(); const exitPt = to.entr && to.entr.length ? to.entr[0] : to.p;
    const loading = X.streamInit(exitPt[0], exitPt[1]); let done = false; loading.then(() => done = true, () => done = true);
    await new Promise(res => { const tick = () => { const k = Math.min(1, (performance.now() - t0) / 3500); const bar = ov.querySelector('#rbar'); if (bar) bar.style.width = (k * 100) + '%'; const i = Math.min(names.length - 1, 1 + Math.floor(k * (names.length - 1))); const nx = ov.querySelector('#rnext'); if (nx) nx.textContent = names[i]; if (k >= 1 && done) res(); else setTimeout(tick, 60); }; tick(); });
    world.hour = (world.hour + p.min / 60) % 24;
    const [ex, ez] = exitPt; const [fx, fz] = outside(ex + 2, ez + 2); const exit = { x: fx, z: fz, yaw: camYaw.v };
    if (to.entr && to.entr.length) station(to, exit, 1); else { leaveSilent(); player.pos.set(fx, TH(fx, fz), fz); if (player.mesh) player.mesh.position.copy(player.pos); }
    ov.style.opacity = '0'; setTimeout(() => ov.remove(), 450); riding = false;
    if (fine) { player.money = Math.max(0, player.money - 60); showMsg('FAHRKARTENKONTROLLE: 60 € ERHÖHTES BEFÖRDERUNGSENTGELT', 2600); } else showMsg(to.name.toUpperCase(), 1400);
    if (X.emit) X.emit('metro', player.pos, { to: to.id });
  }

  // ---------- Eingänge an der Oberfläche ----------
  const entrGroups = new Map(); let scanT = 0;
  const uTex = () => signTex('U', '#0a3d8f', '#ffffff', 128, 128);
  function entranceMesh(p, st) {
    const g = new THREE.Group(); const y = TH(p[0], p[1]); const metal = M(0x5a6068, 0.25);
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 4), new THREE.MeshBasicMaterial({ color: 0x0b0c0f })); hole.rotation.x = -Math.PI / 2; hole.position.set(0, 0.04, 0); g.add(hole);
    for (let i = 0; i < 7; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.02, 0.08), M(0x777777, 0.3)); s.position.set(0, 0.05, -1.8 + i * 0.55); g.add(s); }
    for (const [w, d, x, z] of [[0.06, 4, -1.25, 0], [0.06, 4, 1.25, 0], [2.5, 0.06, 0, 2.0]]) { const r = new THREE.Mesh(new THREE.BoxGeometry(w, 1.0, d), metal); r.position.set(x, 0.55, z); g.add(r); }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.6, 6), metal); pole.position.set(1.5, 1.8, 2.2); g.add(pole); /* größeres Schild auf höherem Mast: von der Straße aus erkennbar */
    const sg = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 0.08), [metal, metal, metal, metal, new THREE.MeshBasicMaterial({ map: uTex() }), new THREE.MeshBasicMaterial({ map: uTex() })]); sg.position.set(1.5, 3.9, 2.2); g.add(sg);
    const ne = nearestEdge(p[0], p[1], 20); if (ne) { const e = edgeNormal(ne.b.p, ne.e); g.rotation.y = Math.atan2(e.dx, e.dz); }
    g.position.set(p[0], y, p[1]); scene.add(g); return g;
  }
  function updateEntrances(dt) {
    scanT -= dt; if (scanT > 0) return; scanT = 1;
    const want = new Set(); for (const s of metro.stations) for (let i = 0; i < s.entr.length; i++) { const p = s.entr[i]; if ((p[0] - player.pos.x) ** 2 + (p[1] - player.pos.z) ** 2 < 300 * 300) { const k = s.id + '#' + i; want.add(k); if (!entrGroups.has(k)) entrGroups.set(k, entranceMesh(p, s)); } }
    for (const [k, g] of entrGroups) if (!want.has(k)) { scene.remove(g); g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); entrGroups.delete(k); }
  }
  function nearMetro() {
    let best = null, bd = 9; for (const s of metro.stations) { for (const p of s.entr) { const d = (p[0] - player.pos.x) ** 2 + (p[1] - player.pos.z) ** 2; if (d < bd) { bd = d; best = { s, p, under: true }; } } if (!s.entr.length) { const d = (s.p[0] - player.pos.x) ** 2 + (s.p[1] - player.pos.z) ** 2; if (d < 18 * 18 && d < bd * 40) { bd = d / 40; best = { s, p: s.p, under: false }; } } }
    return best;
  }
  function nearHouse() {
    if (player.pos.y > TH(player.pos.x, player.pos.z) + 1.5) return null;
    const ne = nearestEdge(player.pos.x, player.pos.z, 1.6); if (!ne) return null; const b = ne.b; if (b.h < 7 || (b.k && b.k !== 'res' && b.k !== 'house' && b.k !== 'public')) return null; return b;
  }
  function onRoof() { const i = solidAt(player.pos.x, player.pos.z); if (i < 0) return null; const b = WORLD.buildings[i]; if (!b || b.h < 7) return null; return player.pos.y > roofHeight(b, player.pos.x, player.pos.z) - 0.6 ? b : null; }

  // Ausgang ins Freie: liegt der Punkt in einem Gebäude (z. B. Eingang in der Bahnhofshalle), den nächsten Punkt draußen suchen
  function outside(x, z) { if (solidAt(x, z) < 0) return D.freeSpot(x, z, 1.5); for (let r = 3; r < 260; r += 3) for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; const qx = x + Math.cos(a) * r, qz = z + Math.sin(a) * r; if (solidAt(qx, qz) < 0 && solidAt(qx + 1, qz) < 0 && solidAt(qx - 1, qz) < 0) return [qx, qz]; } return [x, z]; }
  // ---------- Steuerung ----------
  let curT = null; let t = 0;
  function update(dt) {
    t += dt; updateEntrances(dt); curT = null;
    if (inside && !riding && X.inPocket && !X.inPocket(player.pos.x, player.pos.z)) { console.warn('Innenraum ohne leave() verlassen', inside.label || ''); leaveSilent(); } /* Spieler wurde aus dem Innenraum versetzt (Festnahme, Teleport): Zustand aufräumen, sonst hängt Fahren und F */
    if (inside) { if (inside.update) inside.update(dt); for (const n of inside.npc || []) { try { animateWalk(n, t, 0); } catch (e) {} }
      let bd = 1e9; for (const tr of inside.triggers) { const d = Math.hypot(player.pos.x - PX - tr.x, player.pos.z - PZ - tr.z); if (d < tr.r && d < bd) { bd = d; curT = tr; } }
      if (!curT && inside.trainNear && inside.trainNear()) curT = { label: 'F · Einsteigen: Ziel wählen (3 €)', act: () => travelMenu(inside.station) };
      return curT ? curT.label : null; }
    if (player.car || player.dead) return null;
    for (const fh of X.fHooks || []) { const r = fh(); if (r) { curT = r; return r.label; } } /* weitere F-Aktionen (Klinik-Aufzug) */
    const m = nearMetro(); if (m) { curT = { label: `F · ${m.under ? 'U-Bahn' : 'Bahn'} ${m.s.name} (${m.s.lines.join(', ')})`, act: () => { if (m.under) { const [fx, fz] = outside(m.p[0] + 2.2, m.p[1] + 2.2); station(m.s, { x: fx, z: fz, yaw: camYaw.v + Math.PI }); } else travelMenu(m.s); } }; return curT.label; }
    if (SH.near) { const s = SH.near; curT = { label: `F · ${s.name} betreten`, act: () => { if (player.wanted > 0) { showMsg('POLIZEI SUCHT DICH – KEIN EINKAUF', 1200); return; } shop(s, { x: player.pos.x, z: player.pos.z, yaw: camYaw.v + Math.PI }); } }; return curT.label; }
    const r = onRoof(); if (r) { curT = { label: 'F · Treppenhaus (runter)', act: () => { const ne = nearestEdge(player.pos.x, player.pos.z, 60); let ex = player.pos.x, ez = player.pos.z; if (ne) { const e = edgeNormal(ne.b.p, ne.e); const mx = e.ax + e.dx / 2, mz = e.az + e.dz / 2; const cx = r.p.reduce((a, p) => a + p[0], 0) / r.p.length, cz = r.p.reduce((a, p) => a + p[1], 0) / r.p.length; const sg = (mx - cx) * e.nx + (mz - cz) * e.nz > 0 ? 1 : -1; [ex, ez] = D.freeSpot(mx + e.nx * sg * 1.5, mz + e.nz * sg * 1.5, 1.5); } stairwell(r, { x: ex, z: ez, yaw: camYaw.v }); } }; return curT.label; }
    const h = nearHouse(); if (h) { curT = { label: 'F · Hauseingang', act: () => stairwell(h, { x: player.pos.x, z: player.pos.z, yaw: camYaw.v + Math.PI }) }; return curT.label; }
    return null;
  }
  addEventListener('keydown', e => { if (e.code !== 'KeyF' || X.shopOpen || riding || (menuEl && menuEl.style.display === 'flex')) return; if (curT) { e.preventDefault(); curT.act(); } });
  return { update, enter, leave, station, shop, stairwell, travelMenu, ride, plan, get inside() { return inside; }, get metro() { return metro; }, ST, nearMetro };
}

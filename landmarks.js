// Wahrzeichen, von Hand ausgearbeitet (12.11.2026): das Uhrtürmchen auf der Berger Straße.
// Ein einziges Objekt aus wenigen Dreh- und Kastenkörpern, eine geteilte Zifferblatt-Textur, die einmal
// pro Minute die echte Uhrzeit zeigt. Gebaut wird erst, wenn der Spieler in der Nähe ist (Gelände ist dann
// geladen), und wieder abgebaut, wenn er weit weg ist. Kosten: rund 1.500 Dreiecke, eine 256er-Textur.
export function initLandmarks(X) {
  const { THREE, scene, player, TH, CITY, canvasTex, solidAt } = X;
  const poi = (CITY.pois || []).find(p => /Uhrtürmchen/.test(p.n || '')) || { x: -229, z: 491 };
  const NAH = 450, WEG = 600;
  let grp = null, clockTex = null, lastMin = -1, scanT = 0;

  const L_ = (col, em = 0.15) => new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: em });
  const L = (col, em = 0.15) => new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: em });
  // Drehkörper aus einem Profil [radius, höhe], wie eine Schachfigur an der Drehbank
  const lathe = (prof, seg, mat, y = 0) => { const m = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, h]) => new THREE.Vector2(r, h)), seg), mat); m.position.y = y; m.castShadow = true; return m; };

  function drawClock(c, w, h) {
    const d = new Date(), m = d.getMinutes(), hr = d.getHours() % 12 + m / 60;
    c.fillStyle = '#1d2a22'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#f4efe2'; c.beginPath(); c.arc(w / 2, h / 2, w * 0.44, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#b08a3a'; c.lineWidth = 8; c.stroke();
    c.strokeStyle = '#1b1b1b';
    for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2, r1 = w * (i % 5 ? 0.40 : 0.355), r2 = w * 0.42; c.lineWidth = i % 5 ? 2 : 7;
      c.beginPath(); c.moveTo(w / 2 + Math.sin(a) * r1, h / 2 - Math.cos(a) * r1); c.lineTo(w / 2 + Math.sin(a) * r2, h / 2 - Math.cos(a) * r2); c.stroke(); }
    const hand = (a, len, wd) => { c.lineWidth = wd; c.lineCap = 'round'; c.beginPath(); c.moveTo(w / 2, h / 2); c.lineTo(w / 2 + Math.sin(a) * len, h / 2 - Math.cos(a) * len); c.stroke(); };
    hand(hr / 12 * Math.PI * 2, w * 0.22, 10); hand(m / 60 * Math.PI * 2, w * 0.33, 6);
    c.fillStyle = '#b08a3a'; c.beginPath(); c.arc(w / 2, h / 2, 9, 0, Math.PI * 2); c.fill();
  }

  function build() {
    const g = new THREE.Group();
    const stein = L(0xb9a48a, 0.12), eisen = L(0x2f4a3a, 0.12), dach = L(0x5f8f7c, 0.18), gold = L(0xc9a24a, 0.35);
    // Sockel aus Sandstein, achteckig, mit Stufe
    g.add(lathe([[0, 0], [1.5, 0], [1.5, 0.25], [1.3, 0.3], [1.15, 0.35], [1.15, 1.2], [1.3, 1.3], [1.3, 1.42], [0, 1.42]], 8, stein));
    // Gusseiserne Säule mit Wulst und Kapitell
    g.add(lathe([[0, 0], [0.42, 0], [0.42, 0.12], [0.3, 0.25], [0.24, 0.5], [0.22, 2.6], [0.3, 2.75], [0.24, 2.85], [0.24, 3.4], [0.5, 3.6], [0.55, 3.75], [0, 3.75]], 16, eisen, 1.42));
    // Uhrgehäuse, vier Zifferblätter
    clockTex = canvasTex(256, 256, drawClock); clockTex.wrapS = clockTex.wrapT = THREE.ClampToEdgeWrapping; lastMin = new Date().getMinutes();
    const face = new THREE.MeshBasicMaterial({ map: clockTex });
    const kasten = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.35, 1.25), eisen); kasten.position.y = 5.85; kasten.castShadow = true; g.add(kasten);
    const fg = new THREE.PlaneGeometry(1.0, 1.0);
    for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(fg, face); const a = i * Math.PI / 2; f.position.set(Math.sin(a) * 0.63, 5.85, Math.cos(a) * 0.63); f.rotation.y = a; g.add(f); }
    // Gesims, vierseitiges Spitzdach (Kupfer, grün), goldene Spitze
    const ges = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.14, 1.45), eisen); ges.position.y = 6.58; g.add(ges);
    const d = new THREE.Mesh(new THREE.ConeGeometry(1.05, 1.5, 4), dach); d.position.y = 7.4; d.rotation.y = Math.PI / 4; d.castShadow = true; g.add(d);
    g.add(lathe([[0, 0], [0.07, 0], [0.07, 0.25], [0.14, 0.32], [0.07, 0.42], [0.03, 0.85], [0, 0.95]], 8, gold, 8.1));
    // Laternenarme mit warmem Licht (unbeleuchtetes Material, leuchtet auch nachts ohne Lichtquelle)
    const glas = new THREE.MeshBasicMaterial({ color: 0xffe2a0 });
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.7), eisen); arm.position.set(Math.sin(a) * 0.45, 4.3, Math.cos(a) * 0.45); arm.rotation.y = a; g.add(arm);
      const lamp = lathe([[0, 0], [0.12, 0.02], [0.14, 0.22], [0.08, 0.3], [0, 0.32]], 6, glas, 3.98); lamp.position.x = Math.sin(a) * 0.8; lamp.position.z = Math.cos(a) * 0.8; g.add(lamp); }
    g.position.set(poi.x, TH(poi.x, poi.z), poi.z);
    scene.add(g); return g;
  }
  function drop() { scene.remove(grp); grp.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); grp = null; clockTex = null; }

  // ---------- Weitere Wahrzeichen (12.11.2026): Saalbau-Eingang, Tor zum Günthersburgpark, Frankfurter Laternen auf der Berger ----------
  const cen = p => p.reduce((a, q) => [a[0] + q[0] / p.length, a[1] + q[1] / p.length], [0, 0]);
  const nearestOn = (roads, x, z) => { let best = 1e18, res = null; for (const r of roads) for (let i = 0; i < r.p.length - 1; i++) { const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1; const tt = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)); const px = ax + dx * tt, pz = az + dz * tt; const d = (px - x) ** 2 + (pz - z) ** 2; if (d < best) { best = d; res = { x: px, z: pz, r, h: Math.atan2(dx, dz) }; } } return res; };
  const big = (CITY.roads || []).filter(r => !r.mw && !r.ry && r.w >= 6);
  const schild = (txt, w, h, bg, fg) => canvasTex(512, Math.round(512 * h / w), (c, cw, ch) => { c.fillStyle = bg; c.fillRect(0, 0, cw, ch); c.strokeStyle = fg; c.lineWidth = 6; c.strokeRect(10, 10, cw - 20, ch - 20); c.fillStyle = fg; let fs = Math.round(ch * 0.5); c.font = `bold ${fs}px Georgia, serif`; while (c.measureText(txt).width > cw - 60 && fs > 16) { fs -= 2; c.font = `bold ${fs}px Georgia, serif`; } c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, cw / 2, ch / 2 + 2); });
  const plane = (tex, w, h) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex })); return m; };
  // Ausrichtung: Gruppe schaut von (x,z) zum Punkt (tx,tz)
  const face = (g, x, z, tx, tz) => { g.rotation.y = Math.atan2(tx - x, tz - z); };

  const extra = [];
  // Saalbau Bornheim: Vordach, Schriftzug, zwei Wandleuchten am Eingang zur Straße
  { const sb = (CITY.buildings || []).find(b => b && /Saalbau/.test(b.n || '')); if (sb && big.length) { const c = cen(sb.p); const r = nearestOn(big, c[0], c[1]);
      if (r) { const dx = c[0] - r.x, dz = c[1] - r.z, L = Math.hypot(dx, dz) || 1; let ex = r.x, ez = r.z; for (let s = 2; s < L; s += 0.5) { const qx = r.x + dx / L * s, qz = r.z + dz / L * s; if (solidAt && solidAt(qx, qz) >= 0) break; ex = qx; ez = qz; }
        extra.push({ x: ex, z: ez, build() { const g = new THREE.Group(); const dach = new THREE.Mesh(new THREE.BoxGeometry(6, 0.18, 2.2), L_(0x2b3138)); dach.position.set(0, 3.3, -1.1); g.add(dach);
          for (const sx of [-2.7, 2.7]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.3, 6), L_(0x2b3138)); st.position.set(sx, 1.65, -2.1); g.add(st); }
          const s = plane(schild('SAALBAU BORNHEIM', 5.6, 0.7, '#14181f', '#ffd27a'), 5.6, 0.7); s.position.set(0, 3.85, -0.02); g.add(s);
          const glas = new THREE.MeshBasicMaterial({ color: 0xffe2a0 }); for (const sx of [-3.4, 3.4]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.4, 0.22), glas); l.position.set(sx, 2.6, -0.15); g.add(l); }
          g.position.set(ex, TH(ex, ez), ez); face(g, ex, ez, r.x, r.z); return g; } }); } } }
  // Günthersburgpark: zwei Sandsteinpfeiler mit Kugeln und ein Bogenschild am Zugang von der großen Straße
  { const parks = (CITY.green || []).filter(q => q.k === 'park' && /Günthersburg/.test(q.n || '')); const pk = parks[0] || (CITY.green || []).filter(q => q.k === 'park').map(q => ({ q, c: cen(q.p) })).sort((a, b) => Math.hypot(a.c[0] + 466, a.c[1] + 36) - Math.hypot(b.c[0] + 466, b.c[1] + 36)).map(o => o.q)[0];
    if (pk && big.length) { const c = cen(pk.p); const r = nearestOn(big, c[0], c[1]); if (r) { const dx = c[0] - r.x, dz = c[1] - r.z, L = Math.hypot(dx, dz) || 1; const gx = r.x + dx / L * Math.min(L, (r.r.w || 8) / 2 + 3), gz = r.z + dz / L * Math.min(L, (r.r.w || 8) / 2 + 3);
      extra.push({ x: gx, z: gz, build() { const g = new THREE.Group(); const stein = L_(0xb9a48a); const eisen = L_(0x24302a);
        for (const sx of [-2.4, 2.4]) { const pf = lathe([[0, 0], [0.5, 0], [0.5, 0.2], [0.4, 0.3], [0.4, 2.4], [0.5, 2.5], [0.5, 2.62], [0, 2.62]], 4, stein); pf.position.x = sx; g.add(pf); const k = lathe([[0, 0], [0.12, 0], [0.12, 0.08], [0.28, 0.28], [0.22, 0.5], [0, 0.56]], 10, stein, 2.62); k.position.x = sx; g.add(k); }
        const bogen = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.05, 4, 16, Math.PI), eisen); bogen.position.y = 2.7; g.add(bogen);
        const s = plane(schild('Günthersburgpark', 3.0, 0.5, '#24302a', '#e9e2cc'), 3.0, 0.5); s.position.set(0, 4.25, 0); g.add(s); const s2 = s.clone(); s2.rotation.y = Math.PI; g.add(s2);
        g.position.set(gx, TH(gx, gz), gz); face(g, gx, gz, r.x, r.z); return g; } }); } } }
  // Frankfurter Laternen auf der Berger Straße im Umkreis des Uhrtürmchens: ein InstancedMesh je Teil
  { const berger = (CITY.roads || []).filter(r => r.n === 'Berger Straße'); const spots = [];
    for (const r of berger) { const hw = (r.w || 8) / 2 + 1.2; for (let i = 0; i < r.p.length - 1; i++) { const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const L = Math.hypot(bx - ax, bz - az); if (!L) continue; const nx = -(bz - az) / L, nz = (bx - ax) / L;
      for (let s = 6; s < L; s += 26) { const k = spots.length % 2 ? 1 : -1; const x = ax + (bx - ax) * s / L + nx * hw * k, z = az + (bz - az) * s / L + nz * hw * k; if ((x - poi.x) ** 2 + (z - poi.z) ** 2 < 400 * 400 && !(solidAt && solidAt(x, z) >= 0)) spots.push([x, z]); } } }
    if (spots.length) extra.push({ x: poi.x, z: poi.z, build() { const g = new THREE.Group(); const eisen = L_(0x24302a);
      const teile = [[new THREE.LatheGeometry([[0, 0], [0.16, 0], [0.16, 0.3], [0.1, 0.45], [0.065, 0.6], [0.05, 3.6], [0.09, 3.7], [0, 3.72]].map(([a, b]) => new THREE.Vector2(a, b)), 8), eisen],
        [new THREE.LatheGeometry([[0, 0], [0.1, 0], [0.24, 0.12], [0.2, 0.5], [0.26, 0.56], [0.12, 0.72], [0.03, 0.85], [0, 0.85]].map(([a, b]) => new THREE.Vector2(a, b)), 6), new THREE.MeshBasicMaterial({ color: 0xffe2a0 })]];
      const o = new THREE.Object3D(); for (const [geo, mat] of teile) { const im = new THREE.InstancedMesh(geo, mat, spots.length); spots.forEach(([x, z], i) => { o.position.set(x, TH(x, z) + (geo === teile[1][0] ? 3.72 : 0), z); o.updateMatrix(); im.setMatrixAt(i, o.matrix); }); im.computeBoundingSphere(); g.add(im); }
      scene.add(g); return g; }, absolut: true }); }
  for (const e of extra) e.grp = null;

  function update(dt) {
    scanT -= dt; if (scanT > 0) return; scanT = 1;
    const d2 = (player.pos.x - poi.x) ** 2 + (player.pos.z - poi.z) ** 2;
    if (!grp && d2 < NAH * NAH) grp = build();
    else if (grp && d2 > WEG * WEG) drop();
    if (grp) { grp.position.y = TH(poi.x, poi.z); const m = new Date().getMinutes(); if (m !== lastMin) { lastMin = m; const c = clockTex.image; drawClock(c.getContext('2d'), c.width, c.height); clockTex.needsUpdate = true; } }
    for (const e of extra) { const q = (player.pos.x - e.x) ** 2 + (player.pos.z - e.z) ** 2;
      if (!e.grp && q < NAH * NAH) { e.grp = e.build(); if (!e.absolut) scene.add(e.grp); }
      else if (e.grp && q > WEG * WEG) { scene.remove(e.grp); e.grp.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); e.grp = null; } }
  }
  return { update, get pos() { return poi; } };
}

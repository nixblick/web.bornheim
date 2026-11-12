// Wahrzeichen, von Hand ausgearbeitet (12.11.2026): das Uhrtürmchen auf der Berger Straße.
// Ein einziges Objekt aus wenigen Dreh- und Kastenkörpern, eine geteilte Zifferblatt-Textur, die einmal
// pro Minute die echte Uhrzeit zeigt. Gebaut wird erst, wenn der Spieler in der Nähe ist (Gelände ist dann
// geladen), und wieder abgebaut, wenn er weit weg ist. Kosten: rund 1.500 Dreiecke, eine 256er-Textur.
export function initLandmarks(X) {
  const { THREE, scene, player, TH, CITY, canvasTex, solidAt } = X;
  const poi = { x: -229.14, z: 491.16, fest: false };
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

  // Standort (12.11.2026, nach Live-Befund): Das Uhrtürmchen ist in den OSM-Daten kein eigenes Objekt. Die Suche
  // nach dem Namen traf vorher die „Buchhandlung Schutt am Uhrtürmchen“, deren Punkt IM Gebäude liegt (Turm unsichtbar),
  // oder die gleichnamige Kneipe 1,6 km entfernt. Jetzt: vom Buchladen zur Berger Straße gehen, bis der Boden frei ist,
  // dann noch 1,8 m auf den Gehweg. Erst rechnen, wenn die Kachel mit der Berger geladen ist.
  const ANKER = { x: -229.14, z: 491.16 };
  function standort() {
    const roads = ((X.WORLD && X.WORLD.roads) || []).filter(r => r && r.n === 'Berger Straße'); if (!roads.length) return null;
    let best = 1e18, bx = 0, bz = 0; for (const r of roads) for (let i = 0; i < r.p.length - 1; i++) { const [ax, az] = r.p[i], [cx, cz] = r.p[i + 1]; const dx = cx - ax, dz = cz - az, L2 = dx * dx + dz * dz || 1; const tt = Math.max(0, Math.min(1, ((ANKER.x - ax) * dx + (ANKER.z - az) * dz) / L2)); const px = ax + dx * tt, pz = az + dz * tt; const d = (px - ANKER.x) ** 2 + (pz - ANKER.z) ** 2; if (d < best) { best = d; bx = px; bz = pz; } }
    if (best > 60 * 60) return null;
    const L = Math.sqrt(best) || 1, ux = (bx - ANKER.x) / L, uz = (bz - ANKER.z) / L; let s = 0;
    while (s < L && solidAt && solidAt(ANKER.x + ux * s, ANKER.z + uz * s) >= 0) s += 0.5;
    s = Math.min(L, s + 1.8); return { x: ANKER.x + ux * s, z: ANKER.z + uz * s };
  }
  function update(dt) {
    scanT -= dt; if (scanT > 0) return; scanT = 1;
    if (!poi.fest) { if ((player.pos.x - ANKER.x) ** 2 + (player.pos.z - ANKER.z) ** 2 > NAH * NAH) return; const s = standort(); if (!s) return; poi.x = s.x; poi.z = s.z; poi.fest = true; }
    const d2 = (player.pos.x - poi.x) ** 2 + (player.pos.z - poi.z) ** 2;
    if (!grp && d2 < NAH * NAH) grp = build();
    else if (grp && d2 > WEG * WEG) drop();
    if (grp) { grp.position.y = TH(poi.x, poi.z); const m = new Date().getMinutes(); if (m !== lastMin) { lastMin = m; const c = clockTex.image; drawClock(c.getContext('2d'), c.width, c.height); clockTex.needsUpdate = true; } }
  }
  return { update, get pos() { return poi; } };
}

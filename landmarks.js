// Wahrzeichen, von Hand ausgearbeitet (12.11.2026): das Uhrtürmchen auf der Berger Straße.
// Ein einziges Objekt aus wenigen Dreh- und Kastenkörpern, eine geteilte Zifferblatt-Textur, die einmal
// pro Minute die echte Uhrzeit zeigt. Gebaut wird erst, wenn der Spieler in der Nähe ist (Gelände ist dann
// geladen), und wieder abgebaut, wenn er weit weg ist. Kosten: rund 1.500 Dreiecke, eine 256er-Textur.
/** @param {import('./types').Ctx} X */
export function initLandmarks(X) {
  const { THREE, scene, player, TH, CITY, canvasTex, solidAt } = X;
  const poi = { x: -196, z: 427, fest: true };
  const NAH = 800, WEG = 950;
  let grp = null, clockTex = null, lastMin = -1, scanT = 0;

  const L_ = (col, em = 0.15) => new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: em });
  const L = (col, em = 0.15) => new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: em });
  // Drehkörper aus einem Profil [radius, höhe], wie eine Schachfigur an der Drehbank
  const lathe = (prof, seg, mat, y = 0) => { const m = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, h]) => new THREE.Vector2(r, h)), seg), mat); m.position.y = y; m.castShadow = true; return m; };

  function drawClock(c, w, h) {
    const d = new Date(), m = d.getMinutes(), hr = d.getHours() % 12 + m / 60;
    c.fillStyle = '#3a3d42'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#f4efe2'; c.beginPath(); c.arc(w / 2, h / 2, w * 0.44, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#2a2c30'; c.lineWidth = 8; c.stroke();
    c.strokeStyle = '#1b1b1b';
    for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2, r1 = w * (i % 5 ? 0.40 : 0.355), r2 = w * 0.42; c.lineWidth = i % 5 ? 2 : 7;
      c.beginPath(); c.moveTo(w / 2 + Math.sin(a) * r1, h / 2 - Math.cos(a) * r1); c.lineTo(w / 2 + Math.sin(a) * r2, h / 2 - Math.cos(a) * r2); c.stroke(); }
    const hand = (a, len, wd) => { c.lineWidth = wd; c.lineCap = 'round'; c.beginPath(); c.moveTo(w / 2, h / 2); c.lineTo(w / 2 + Math.sin(a) * len, h / 2 - Math.cos(a) * len); c.stroke(); };
    hand(hr / 12 * Math.PI * 2, w * 0.22, 10); hand(m / 60 * Math.PI * 2, w * 0.33, 6);
    c.fillStyle = '#b08a3a'; c.beginPath(); c.arc(w / 2, h / 2, 9, 0, Math.PI * 2); c.fill();
  }

  function build() { // nach Andrés Foto vom 12.11.2026: schlanke, dunkelgraue Vierkantsäule auf Granitsockel, kleiner Uhrkopf, flache Spitze
    const g = new THREE.Group();
    const granit = L(0x8d8983, 0.1), grau = L(0x4b4f55, 0.12), dunkel = L(0x3a3d42, 0.12);
    // Granitsockel, zweistufig, quadratisch
    { const s1 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 1.5), granit); s1.position.y = 0.15; s1.castShadow = true; g.add(s1); const s2 = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.35, 1.15), granit); s2.position.y = 0.47; g.add(s2); }
    // Vierkantsäule, nach oben leicht verjüngt, mit Fuß- und Kopfprofil (Drehkörper mit 4 Seiten = Vierkant)
    { const p = lathe([[0, 0], [0.55, 0], [0.55, 0.18], [0.45, 0.3], [0.4, 0.4], [0.32, 3.2], [0.42, 3.3], [0.42, 3.42], [0, 3.42]], 4, grau, 0.65); p.rotation.y = Math.PI / 4; g.add(p); }
    // Uhrkopf mit vier weißen Zifferblättern
    clockTex = canvasTex(256, 256, drawClock); clockTex.wrapS = clockTex.wrapT = THREE.ClampToEdgeWrapping; lastMin = new Date().getMinutes();
    const face = new THREE.MeshBasicMaterial({ map: clockTex });
    const kasten = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.95, 0.95), dunkel); kasten.position.y = 4.55; kasten.castShadow = true; g.add(kasten);
    const fg = new THREE.PlaneGeometry(0.78, 0.78);
    for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(fg, face); const a = i * Math.PI / 2; f.position.set(Math.sin(a) * 0.48, 4.55, Math.cos(a) * 0.48); f.rotation.y = a; g.add(f); }
    // Gesims und flache Pyramidenspitze mit kleinem Knauf
    const ges = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.1, 1.12), dunkel); ges.position.y = 5.08; g.add(ges);
    const d = new THREE.Mesh(new THREE.ConeGeometry(0.78, 0.7, 4), grau); d.position.y = 5.48; d.rotation.y = Math.PI / 4; d.castShadow = true; g.add(d);
    const kn = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), dunkel); kn.position.y = 5.87; g.add(kn);
    g.position.set(poi.x, TH(poi.x, poi.z), poi.z);
    scene.add(g); return g;
  }
  function drop() { scene.remove(grp); grp.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); grp = null; clockTex = null; }

  // Standort (12.11.2026): Mitten auf dem Bornheimer Wochenmarkt-Platz vor der Arnsburger Straße (~50 m nordöstlich,
  // x: -196, z: 427, 12,9 m Abstand zu den Häuserfassaden auf beiden Seiten).
  const frei = (x, z) => !solidAt || (solidAt(x, z) < 0 && solidAt(x + 1.8, z) < 0 && solidAt(x - 1.8, z) < 0 && solidAt(x, z + 1.8) < 0 && solidAt(x, z - 1.8) < 0);
  function standort() {
    for (const [x, z] of [[-196, 427], [-194, 425], [-198, 429]]) if (frei(x, z)) return { x, z };
    return { x: -196, z: 427 };
  }
  function update(dt) {
    scanT -= dt; if (scanT > 0) return; scanT = 1;
    if (!poi.fest) { const s = standort(); if (s) { poi.x = s.x; poi.z = s.z; poi.fest = true; if (grp) grp.position.set(poi.x, TH(poi.x, poi.z), poi.z); } }
    const d2 = (player.pos.x - poi.x) ** 2 + (player.pos.z - poi.z) ** 2;
    if (!grp && d2 < NAH * NAH) grp = build();
    else if (grp && d2 > WEG * WEG) drop();
    if (grp) { grp.position.y = TH(poi.x, poi.z); const m = new Date().getMinutes(); if (m !== lastMin) { lastMin = m; const c = clockTex.image; drawClock(c.getContext('2d'), c.width, c.height); clockTex.needsUpdate = true; } }
  }
  return { update, get pos() { return poi; } };
}

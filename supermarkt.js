import { disposeHierarchy } from './dispose.js';
// Supermarkt-Eingang (André 13.11.2026: „so ein Supermarkt sieht im Grunde überall gleich aus“). An den echten
// Standorten aus OSM (POI supermarket) bekommt die Fassadenkante am Eingang den typischen Aufbau: flaches Vordach
// auf zwei Stützen, Blende mit neutralem Schriftzug (Supermarkt / Discount / Biomarkt, keine Marken, keine Logos),
// an Hallenbauten dazu ein Glas-Windfang; nachts Lichtfelder unter dem Dach. Form und Maße sind eigener Code nach
// dem üblichen Bild solcher Märkte, keine fremden Modelle oder Texturen. Gebaut wird nur in Spielernähe und beim
// Weggehen abgebaut (wie graeber.js): höchstens MAX Märkte, je Markt 3 Draw-Calls (nachts 4), eigener Takt.

/** @param {import('./types').Ctx} X */
export function initSupermarkt(X) {
  const A = /** @type {any} */ (X);
  const { THREE, scene, player, TH } = A;
  const NAH = 200, WEG = 280, MAX = 4, ROWS = 4;
  const built = new Map(); // key -> Group (leere Gruppe = geprüft, hier wird nichts gebaut)
  let M = null;

  function mats() {
    if (M) return M;
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 128 * ROWS; const c = cv.getContext('2d');
    // Blende: Anthrazit, weiße Schrift, schmaler Farbstreifen je Art (bewusst keine Hausfarben echter Ketten)
    const rows = [['SUPERMARKT', '#2f8f8a'], ['DISCOUNT', '#c9a227'], ['BIOMARKT', '#6f9a3a'], ['MARKT', '#8a8f98']];
    rows.forEach(([t, acc], i) => { const y = i * 128; c.fillStyle = '#2b2f35'; c.fillRect(0, y, 1024, 128); c.fillStyle = acc; c.fillRect(0, y + 112, 1024, 16);
      c.fillStyle = '#f4f4f0'; c.font = '700 78px system-ui, "Segoe UI", Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t, 512, y + 58); });
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    M = { bau: new THREE.MeshLambertMaterial({ color: 0x3c4046 }),
      glas: new THREE.MeshLambertMaterial({ color: 0x8fb0bd, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false, emissive: 0x1c2428 }),
      schild: new THREE.MeshBasicMaterial({ map: tex }),
      licht: new THREE.MeshBasicMaterial({ color: 0xfff0cf }) };
    // Cache für alle Märkte: disposeHierarchy darf ihn beim Abbau eines einzelnen Markts nicht freigeben
    for (const k in M) M[k].userData.shared = true; tex.userData.shared = true;
    return M;
  }
  /** Mehrere Geometrien zu einer (Position, Normale, UV; ohne Index). Eigene kleine Fassung, weil Module three-Zusätze nicht direkt importieren. */
  const mergeGeometries = geos => { const ni = geos.map(q => q.index ? q.toNonIndexed() : q); let n = 0; for (const q of ni) n += q.attributes.position.count;
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2); let o = 0;
    for (let i = 0; i < ni.length; i++) { const q = ni[i]; P.set(q.attributes.position.array, o * 3); N.set(q.attributes.normal.array, o * 3); U.set(q.attributes.uv.array, o * 2); o += q.attributes.position.count; if (q !== geos[i]) q.dispose(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.BufferAttribute(U, 2)); return g; };
  const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
  const art = n => /aldi|lidl|penny|netto|norma/i.test(n) ? 1 : /alnatura|denn|bio|reform/i.test(n) ? 2 : /rewe|edeka|tegut|nahkauf|kaufland|real|hit|super/i.test(n) ? 0 : 3;

  /** Eingang im lokalen Rahmen: x entlang der Fassade, z nach außen, y nach oben; Ursprung am Fassadenfuß. */
  function makeEingang(W, halle, row) {
    const m = mats(), g = new THREE.Group();
    const bau = [], glas = [], licht = [];
    // Vordach: Platte, Blendenträger, zwei Stützen
    bau.push(box(W + 1, 0.2, 3.2, 0, 3.05, 1.6), box(W + 1, 0.8, 0.1, 0, 3.5, 3.15));
    for (const s of [-1, 1]) bau.push(box(0.14, 2.95, 0.14, s * (W / 2 + 0.3), 1.475, 3.0));
    for (let i = 0; i < 4; i++) licht.push(box(0.6, 0.02, 0.6, (i - 1.5) * (W / 4), 2.94, 1.7));
    if (halle) { // Glas-Windfang 5 × 2 m, 2,7 m hoch: Pfosten, Riegel, drei Scheiben
      for (const x of [-2.5, -0.9, 0.9, 2.5]) bau.push(box(0.08, 2.7, 0.08, x, 1.35, 2.0));
      bau.push(box(5.08, 0.1, 0.08, 0, 2.7, 2.0), box(0.08, 0.1, 2.0, -2.5, 2.7, 1.0), box(0.08, 0.1, 2.0, 2.5, 2.7, 1.0), box(5.0, 0.06, 2.0, 0, 2.76, 1.0));
      const front = new THREE.PlaneGeometry(5, 2.65); front.translate(0, 1.33, 2.0); glas.push(front);
      for (const s of [-1, 1]) { const q = new THREE.PlaneGeometry(2, 2.65); q.rotateY(Math.PI / 2); q.translate(s * 2.5, 1.33, 1.0); glas.push(q); }
    }
    const sch = new THREE.PlaneGeometry(W, 0.7); sch.translate(0, 3.5, 3.21);
    { const uv = sch.attributes.uv; const v0 = 1 - (row + 1) / ROWS, v1 = 1 - row / ROWS; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) > 0.5 ? v1 : v0); }
    const add = (geos, mat, schatten) => { if (!geos.length) return null; const q = geos.length > 1 ? mergeGeometries(geos) : geos[0]; if (geos.length > 1) for (const x of geos) x.dispose(); const me = new THREE.Mesh(q, mat); me.castShadow = !!schatten; me.receiveShadow = !!schatten; g.add(me); return me; };
    add(bau, m.bau, true); add(glas, m.glas, false); add([sch], m.schild, false);
    const li = add(licht, m.licht, false); if (li) { li.userData.nacht = true; li.visible = false; }
    return g;
  }

  /** Märkte in der Nähe: Punkt am Fassadenfuß vor dem Eingang, Richtung nach außen. */
  function wanted() {
    const px = player.pos.x, pz = player.pos.z, out = [];
    const pois = (A.WORLD && A.WORLD.pois) || (A.CITY && A.CITY.pois) || [];
    for (const p of pois) {
      if (!p || p.k !== 'supermarket' || out.length >= MAX) continue;
      if ((p.x - px) ** 2 + (p.z - pz) ** 2 > NAH * NAH) continue;
      out.push({ key: 'm' + p.x.toFixed(0) + ',' + p.z.toFixed(0), p });
    }
    return out;
  }
  /** Abstand eines Punkts zur nächsten Straße (für die Wahl der Eingangsseite freistehender Hallen). */
  function strasseNah(x, z) {
    let best = 1e9; const roads = (A.WORLD && A.WORLD.roads) || [];
    for (const r of roads) { if (!r || !r.p || r.ry) continue; const q = r.p[0]; if (Math.abs(q[0] - x) > 220 || Math.abs(q[1] - z) > 220) continue;
      for (let i = 0; i < r.p.length - 1; i++) { const ax = r.p[i][0], az = r.p[i][1], dx = r.p[i + 1][0] - ax, dz = r.p[i + 1][1] - az, l2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)); const d = Math.hypot(ax + dx * t - x, az + dz * t - z); if (d < best) best = d; } }
    return best;
  }
  /** Kante brauchbar? Lang genug und davor frei (Innenhof, Nachbarhaus): Mitte und beide Dachecken. Liefert Lage und Breite. */
  function kante(b, e, p) {
    const en = A.edgeNormal(b.p, e); if (en.l < 7) return null;
    const t0 = Math.max(0.25, Math.min(0.75, ((p.x - en.ax) * en.dx + (p.z - en.az) * en.dz) / (en.l * en.l)));
    const x = en.ax + en.dx * t0, z = en.az + en.dz * t0, W = Math.max(5, Math.min(9, en.l * 0.55)), ux = en.dx / en.l, uz = en.dz / en.l;
    for (const [a, d] of [[0, 2], [W / 2, 3], [-W / 2, 3]]) if (A.solidAt(x + ux * a + en.nx * d, z + uz * a + en.nz * d) >= 0) return null;
    return { en, x, z, W };
  }
  function bauen(p) {
    // Punkt an der Fassade (Laden im Erdgeschoss): nächste Kante. Punkt im Gebäude (freistehende Halle, OSM-Punkt in der
    // Mitte) oder Kante unbrauchbar: die brauchbare Kante, die einer Straße am nächsten liegt.
    const bi = A.solidAt(p.x, p.z); let b = bi >= 0 ? A.WORLD.buildings[bi] : null, k = null;
    if (!b) { const ne = A.nearestEdge(p.x, p.z, 15); if (!ne || !ne.b) return null; b = ne.b; k = kante(b, ne.e, p); }
    if (!k) { let bd = 1e9; for (let e = 0; e < b.p.length; e++) { const c = kante(b, e, p); if (!c) continue; const d = strasseNah(c.x + c.en.nx * 6, c.z + c.en.nz * 6); if (d < bd) { bd = d; k = c; } } }
    if (!k) return null;
    const { en, x, z, W } = k;
    const g = makeEingang(W, b.k === 'hall', art(String(p.n || '')));
    g.position.set(x, TH(x + en.nx * 1.5, z + en.nz * 1.5), z); g.rotation.y = Math.atan2(en.nx, en.nz); g.updateMatrixWorld(true);
    return g;
  }
  const leerVers = new Map(); // Schlüssel → bisherige Versuche für leere Eingänge
  function update() {
    const w = wanted(), keys = new Set(w.map(e => e.key));
    for (const [k, g] of built) { if (keys.has(k)) { /* leer, weil die Hauskachel noch nicht geladen war: alle 6 s neu versuchen, höchstens zehnmal */ if (!g.children.length && (g.userData.vers = (g.userData.vers | 0) + 1) % 4 === 0 && g.userData.vers <= 40) { scene.remove(g); built.delete(k); leerVers.set(k, g.userData.vers); } continue; } const d2 = (g.userData.x - player.pos.x) ** 2 + (g.userData.z - player.pos.z) ** 2; if (d2 > WEG * WEG) { scene.remove(g); disposeHierarchy(g); built.delete(k); } }
    for (const e of w) { if (built.has(e.key)) continue; const g = bauen(e.p) || new THREE.Group(); g.userData.vers = leerVers.get(e.key) | 0; g.userData.x = e.p.x; g.userData.z = e.p.z; g.userData.noChunk = true; built.set(e.key, g); scene.add(g); }
    const nacht = !!(A.world && A.world.night); for (const g of built.values()) for (const o of g.children) if (o.userData.nacht) o.visible = nacht;
  }
  setInterval(() => { try { update(); } catch (e) { console.warn('supermarkt', e); } }, 1500); // eigener Takt, keine Zeile in der Spielschleife
  const api = { update, get count() { let n = 0; for (const g of built.values()) if (g.children.length) n++; return n; }, get list() { return [...built].map(([k, g]) => [k, g.children.length]); } };
  /** @type {any} */ (window).SUPERMARKT = api; return api;
}

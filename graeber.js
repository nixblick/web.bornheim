import { disposeHierarchy } from './dispose.js';
// Typische Frankfurter Gräber und Straßenbahn-Haltestellen, von Hand nach Andrés Fotos (13.11.2026).
// Gräber: Mustergrabanlage (Stele mit Baum-Relief, Stele mit Figur-Relief, Rundkopf mit Rosette, Kreuzstele;
// Beete mit Bodendeckern, Klinkereinfassung, Tannen, Bank). Inschriften nur als unlesbare Rillen, keine Namen.
// Haltestelle: Glas-Wartehalle mit Punktraster, grünes Kästchen, neutrale Vitrine, grüner H-Mast mit gelbem
// H-Schild, Anzeiger, Glasgeländer, niedriger Bahnsteig. Lage aus OSM: „Wasserpark“ (Tram 18) neben dem
// Hauptfriedhof. Gebaut wird nur in Spielernähe, abgebaut beim Weggehen.
/** @param {import('./types').Ctx} X */
export function initGraeber(X) {
  const { THREE, scene, player, TH, CITY, pointInPoly } = X;
  const NAH = 260, WEG = 340, MAX_ANL = 3, MAX_HALT = 4;
  const built = new Map(); // key -> Group
  let scanT = 0, M = null;

  function mats() {
    if (M) return M;
    const L = c => new THREE.MeshLambertMaterial({ color: c });
    const dots = document.createElement('canvas'); dots.width = dots.height = 64; const c = dots.getContext('2d');
    c.fillStyle = 'rgba(200,215,225,0.25)'; c.fillRect(0, 0, 64, 64); c.fillStyle = 'rgba(255,255,255,0.85)';
    for (let y = 4; y < 64; y += 10) for (let x = 4 + (y / 10 % 2) * 5; x < 64; x += 10) { c.beginPath(); c.arc(x, y, 1.6, 0, 7); c.fill(); }
    const dotTex = new THREE.CanvasTexture(dots); dotTex.wrapS = dotTex.wrapT = THREE.RepeatWrapping; dotTex.repeat.set(4, 6);
    M = { sand: L(0xc9bfae), grau: L(0x6e6c68), granit: L(0xa8a49c), dunkel: L(0x3e3f42), klinker: L(0xa2604a), klinkerHell: L(0xc79a86),
      beet: L(0x2f4a26), lav: L(0x6b6a8c), mulch: L(0x4a3426), tanne: L(0x2c4a2a), stamm: L(0x7a4a32), holz: L(0x5a3a26),
      rahmen: L(0x4a4c50), dach: L(0x585a5e), gruen: L(0x2f9a6a), gelb: new THREE.MeshBasicMaterial({ color: 0xf2d21b }),
      vitrine: L(0x8d8f92), anz: new THREE.MeshBasicMaterial({ color: 0x1a1a1a }), anzT: new THREE.MeshBasicMaterial({ color: 0xff9a1a }),
      platte: L(0xb4aea4), kante: L(0xd8d4cc),
      glas: new THREE.MeshLambertMaterial({ map: dotTex, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }) };
    return M;
  }
  const box = (g, w, h, d, m, x, y, z, ry = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.y = ry; g.add(o); return o; };
  const cyl = (g, r1, r2, h, m, x, y, z, seg = 10) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m); o.position.set(x, y, z); g.add(o); return o; };
  const rillen = (g, m, x, y0, z, n, w) => { for (let i = 0; i < n; i++) box(g, w * (0.6 + (i % 2) * 0.3), 0.025, 0.02, m, x, y0 - i * 0.09, z); }; // unlesbare Inschrift

  // ---- Grabstein-Typen (z zeigt nach vorn zum Weg) ----
  const GRAB = {
    baum(g, m) { // helle Sandstein-Stele mit Schultern und Baum-Relief
      box(g, 0.42, 1.25, 0.16, m.sand, 0, 0.62, 0); box(g, 0.6, 0.3, 0.16, m.sand, 0, 0.62, 0);
      box(g, 0.025, 0.7, 0.03, m.granit, 0, 0.9, 0.09); for (let i = 0; i < 6; i++) for (const s of [-1, 1]) { const o = box(g, 0.14, 0.02, 0.03, m.granit, s * 0.05, 0.72 + i * 0.1, 0.09); o.rotation.z = s * 0.6; }
      rillen(g, m.granit, 0, 0.42, 0.085, 3, 0.3);
    },
    figur(g, m) { // dunkle Stele mit gerundetem Kopf und erhabener Figur
      box(g, 0.55, 1.0, 0.15, m.grau, 0, 0.5, 0); const k = cyl(g, 0.275, 0.275, 0.15, m.grau, 0, 1.0, 0, 16); k.rotation.x = Math.PI / 2;
      box(g, 0.1, 0.42, 0.04, m.dunkel, 0, 0.82, 0.09); const a = box(g, 0.38, 0.06, 0.04, m.dunkel, 0, 0.98, 0.09); a.rotation.z = 0.5; cyl(g, 0.05, 0.05, 0.04, m.dunkel, 0.08, 1.12, 0.09, 8).rotation.x = Math.PI / 2;
      rillen(g, m.dunkel, 0, 0.42, 0.085, 3, 0.36);
    },
    rosette(g, m) { // schlanker Pfeiler mit runder Rosettenscheibe
      box(g, 0.32, 0.95, 0.16, m.sand, 0, 0.47, 0); const s = cyl(g, 0.34, 0.34, 0.14, m.sand, 0, 1.22, 0, 20); s.rotation.x = Math.PI / 2;
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const r = box(g, 0.04, 0.26, 0.04, m.granit, Math.sin(a) * 0.17, 1.22 + Math.cos(a) * 0.17, 0.08); r.rotation.z = -a; }
      cyl(g, 0.07, 0.07, 0.05, m.granit, 0, 1.22, 0.08, 10).rotation.x = Math.PI / 2; box(g, 0.025, 0.4, 0.02, m.granit, 0, 0.55, 0.085);
    },
    kreuz(g, m) { // hohe Granitplatte mit Kreuz-Relief zwischen Rillenzeilen
      box(g, 0.62, 1.45, 0.16, m.granit, 0, 0.72, 0); box(g, 0.06, 0.32, 0.03, m.dunkel, 0, 0.86, 0.09); box(g, 0.24, 0.06, 0.03, m.dunkel, 0, 0.9, 0.09);
      rillen(g, m.dunkel, 0, 1.3, 0.085, 3, 0.46); rillen(g, m.dunkel, 0, 0.6, 0.085, 3, 0.46);
    },
    pult(g, m) { box(g, 0.7, 0.12, 0.5, m.grau, 0, 0.1, 0.3).rotation.x = -0.25; }, // Liegestein auf dem Beet
  };
  /** Einzelgrab: Beet (1,1 × 1,9 m) mit Bodendeckern, Stein am Kopfende. typ: baum|figur|rosette|kreuz|pult */
  function makeGrave(typ) {
    const m = mats(), g = new THREE.Group();
    box(g, 1.0, 0.1, 1.8, typ === 'figur' ? m.lav : typ === 'kreuz' ? m.mulch : m.beet, 0, 0.05, 0.95);
    for (let i = 0; i < 5; i++) cyl(g, 0.16 + (i % 2) * 0.06, 0.2, 0.18, m.beet, -0.3 + (i % 3) * 0.3, 0.15, 0.5 + i * 0.28, 7);
    const s = new THREE.Group(); GRAB[typ](s, m); g.add(s); return g;
  }
  /** Mustergrabanlage: vier Gräber in Reihe, Klinkerwege dazwischen und drumherum, zwei Tannen, eine Bank dahinter */
  function makeAnlage() {
    const m = mats(), g = new THREE.Group(); const typen = ['baum', 'pult', 'figur', 'rosette', 'kreuz'];
    typen.forEach((t, i) => { const gr = makeGrave(t); gr.position.x = (i - 2) * 1.45; g.add(gr); });
    box(g, 7.6, 0.06, 0.24, m.klinker, 0, 0.03, 2.0); box(g, 7.6, 0.06, 0.24, m.klinker, 0, 0.03, -0.2);
    for (let i = 0; i < 6; i++) box(g, 0.3, 0.07, 2.2, i % 2 ? m.klinkerHell : m.klinker, (i - 2.5) * 1.45, 0.035, 0.9);
    for (const [x, z] of [[-2.6, -2.6], [2.2, -3.2]]) { cyl(g, 0.18, 0.25, 4, m.stamm, x, 2, z, 7); for (let k = 0; k < 4; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry(2.2 - k * 0.45, 2.4, 9), m.tanne); c.position.set(x, 3.0 + k * 1.5, z); g.add(c); } }
    box(g, 1.6, 0.06, 0.45, m.holz, 0.2, 0.45, -4.5); box(g, 1.6, 0.4, 0.06, m.holz, 0.2, 0.75, -4.72); for (const s of [-0.7, 0.7]) box(g, 0.06, 0.45, 0.4, m.dunkel, 0.2 + s, 0.22, -4.5);
    return g;
  }

  // ---- Haltestelle (lang = entlang der Gleise, +z = Gleisseite) ----
  function nameTex(n) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 48; const x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 256, 48); x.fillStyle = '#1a1a1a'; x.font = 'bold 30px Arial'; x.textAlign = 'center'; x.fillText(n.slice(0, 16), 128, 35);
    return new THREE.CanvasTexture(c);
  }
  let hTex = null;
  function hSchild() { if (hTex) return hTex; const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    x.fillStyle = '#f2d21b'; x.fillRect(0, 0, 64, 64); x.strokeStyle = '#2f9a6a'; x.lineWidth = 5; x.beginPath(); x.arc(32, 32, 27, 0, 7); x.stroke();
    x.fillStyle = '#2f9a6a'; x.font = 'bold 38px Arial'; x.textAlign = 'center'; x.fillText('H', 32, 46); return (hTex = new THREE.CanvasTexture(c)); }
  function makeHaltestelle(name) {
    const m = mats(), g = new THREE.Group(), L = 28;
    box(g, L, 0.22, 3.2, m.platte, 0, 0.11, 0); box(g, L, 0.24, 0.3, m.kante, 0, 0.12, 1.55);
    const hx = -4; // Wartehalle
    for (const x of [-3.0, -1.5, 0, 1.5, 3.0]) box(g, 0.08, 2.5, 0.08, m.rahmen, hx + x, 1.47, -1.1);
    for (const x of [-3.0, 3.0]) box(g, 0.08, 2.5, 0.08, m.rahmen, hx + x, 1.47, 0.2);
    box(g, 6.3, 0.12, 1.6, m.dach, hx, 2.75, -0.45);
    box(g, 1.45, 2.2, 0.03, m.glas, hx - 0.75, 1.35, -1.1); box(g, 1.45, 2.2, 0.03, m.glas, hx + 2.25, 1.35, -1.1);
    box(g, 1.4, 2.0, 0.06, m.vitrine, hx + 0.75, 1.3, -1.1); // Werbevitrine: neutrale Fläche
    box(g, 0.03, 2.2, 1.25, m.glas, hx - 3.0, 1.35, -0.45); box(g, 0.03, 2.2, 1.25, m.glas, hx + 3.0, 1.35, -0.45);
    box(g, 1.2, 0.08, 0.35, m.rahmen, hx - 2.2, 0.68, -0.9); // Sitzbank
    box(g, 0.9, 1.6, 0.5, m.gruen, hx - 4.2, 1.02, -0.9); box(g, 0.92, 0.12, 0.52, new THREE.MeshLambertMaterial({ color: 0x24408a }), hx - 4.2, 1.88, -0.9); // grünes Kästchen
    const nt = nameTex(name); const nm = new THREE.MeshBasicMaterial({ map: nt });
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.26), nm); p.position.set(hx - 2.25, 2.45, -1.1 + s * 0.03); if (s < 0) p.rotation.y = Math.PI; g.add(p); } // Name beidseitig
    for (let x = -1.2; x < L / 2 - 0.5; x += 1.4) { box(g, 0.05, 1.05, 0.05, m.rahmen, x, 0.75, -1.5); box(g, 1.35, 0.85, 0.02, m.glas, x + 0.7, 0.7, -1.5); } // Glasgeländer
    box(g, L / 2 + 1.2, 0.05, 0.07, m.rahmen, (L / 2 - 1.2) / 2, 1.27, -1.5);
    const mx = 6.5; cyl(g, 0.06, 0.06, 3.3, m.gruen, mx, 1.87, -1.2, 8); // H-Mast
    const hm = new THREE.MeshBasicMaterial({ map: hSchild() });
    for (const s of [-1, 1]) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.28, 20), hm); d.position.set(mx, 3.3, -1.2 + s * 0.07); if (s < 0) d.rotation.y = Math.PI; g.add(d); }
    box(g, 0.5, 0.75, 0.05, new THREE.MeshLambertMaterial({ color: 0xf4f4f0 }), mx, 2.5, -1.2); // Fahrplantafel
    cyl(g, 0.06, 0.06, 3.2, m.rahmen, 1.5, 1.82, -1.3, 8); box(g, 1.6, 0.35, 0.18, m.anz, 1.5, 3.2, -1.3); // Anzeiger
    for (const s of [-1, 1]) box(g, 1.3, 0.06, 0.01, m.anzT, 1.5, 3.25, -1.3 + s * 0.095);
    const om = cyl(g, 0.13, 0.15, 7.5, m.rahmen, -L / 2 + 1, 3.9, -1.5, 8); om.userData.mast = true; // Oberleitungsmast
    box(g, 0.08, 0.08, 4.2, m.rahmen, -L / 2 + 1, 6.9, 0.6);
    return g;
  }

  // ---- Platzierung ----
  const railDir = (x, z) => { let best = 1e9, ang = 0; for (const r of CITY.rails || []) { if (r.k === 'platform') continue; const p = r.p; for (let i = 0; i < p.length - 1; i++) { const ax = p[i][0], az = p[i][1], bx = p[i + 1][0], bz = p[i + 1][1]; const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l)); const d = (ax + t * dx - x) ** 2 + (az + t * dz - z) ** 2; if (d < best) { best = d; ang = Math.atan2(dz, dx); } } } return best < 400 ? ang : null; };
  function place(grp, x, z, ang) { grp.position.set(x, TH(x, z), z); grp.rotation.y = -ang; grp.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); scene.add(grp); return grp; }
  function wanted() {
    const px = player.pos.x, pz = player.pos.z, out = [];
    let nh = 0; for (const st of CITY.stops || []) { if (st.k !== 'tram' || nh >= MAX_HALT) continue; if ((st.x - px) ** 2 + (st.z - pz) ** 2 > NAH * NAH) continue; nh++; out.push({ key: 'h' + st.x.toFixed(0) + ',' + st.z.toFixed(0), st }); }
    let na = 0; for (const gp of CITY.green || []) { if (gp.k !== 'cemetery' || na >= MAX_ANL || !gp.p || gp.p.length < 3) continue; let best = null, bd = 1e18; // Punkt am Rand innen, nah am Spieler
      for (let i = 0; i < gp.p.length - 1; i++) { const [ax, az] = gp.p[i], [bx, bz] = gp.p[i + 1]; for (let t = 0.2; t < 0.9; t += 0.3) { const ex = ax + (bx - ax) * t, ez = az + (bz - az) * t, l = Math.hypot(bx - ax, bz - az) || 1, nx = -(bz - az) / l, nz = (bx - ax) / l;
        for (const s of [12, -12]) { const x = ex + nx * s, z = ez + nz * s; if (!pointInPoly(x, z, gp.p)) continue; const d = (x - px) ** 2 + (z - pz) ** 2; if (d < bd) { bd = d; best = { x, z, ang: Math.atan2(bz - az, bx - ax) }; } } } }
      if (best && bd < NAH * NAH) { na++; out.push({ key: 'a' + best.x.toFixed(0) + ',' + best.z.toFixed(0), a: best }); } }
    return out;
  }
  function update(dt) {
    scanT -= dt; if (scanT > 0) return; scanT = 1.5;
    const w = wanted(), keys = new Set(w.map(e => e.key));
    for (const [k, g] of built) { const d2 = (g.position.x - player.pos.x) ** 2 + (g.position.z - player.pos.z) ** 2; if (!keys.has(k) && d2 > WEG * WEG) { scene.remove(g); disposeHierarchy(g); built.delete(k); } }
    for (const e of w) { if (built.has(e.key)) continue;
      if (e.st) { const ang = railDir(e.st.x, e.st.z); if (ang === null) { built.set(e.key, new THREE.Group()); continue; } const s = (e.st.x * 7 + e.st.z * 3) % 2 > 0 ? 1 : -1; // Bahnsteig neben das Gleis
        const ox = -Math.sin(ang) * 3.3 * s, oz = Math.cos(ang) * 3.3 * s; const g = makeHaltestelle(e.st.n || 'Haltestelle'); built.set(e.key, place(g, e.st.x + ox, e.st.z + oz, ang + (s > 0 ? Math.PI : 0))); }
      else built.set(e.key, place(makeAnlage(), e.a.x, e.a.z, e.a.ang)); }
  }
  setInterval(() => { try { update(1.5); } catch (e) { console.warn('graeber', e); } }, 1500); // eigener Takt, keine Zeile in der Spielschleife
  const api = { update, makeGrave, makeAnlage, makeHaltestelle, get count() { return built.size; }, get list() { return [...built].map(([k, g]) => [k, Math.round(g.position.x), Math.round(g.position.z)]); } };
  window.GRAEBER = api; return api;
}

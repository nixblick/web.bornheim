import { disposeHierarchy } from './dispose.js';
// Ladesäulen für E-Autos (André 14.11.2026: „E-Ladesäulen und blaue Parkplätze zum Laden der E-Autos“). Die Standorte kommen
// aus OpenStreetMap (amenity=charging_station, tools/ladesaeulen.py -> data/ladesaeulen.json, rund 330 öffentliche Säulen
// im Spielgebiet; die Kacheln kennen sie nicht). An jedem Standort: so viele Stellplätze wie die Säule Plätze hat (höchstens 4),
// längs am Fahrbahnrand der nächsten Straße, blau markiert mit weißem Rand und Stecker-Zeichen, dazu die Säule auf dem Gehweg
// (grau, grüner Leuchtstreifen, nachts heller). Keine Marken, keine Betreiber. Gebaut wird nur in Spielernähe wie bei
// supermarkt.js: eigener Takt, höchstens MAX Standorte, je Standort 3 Draw-Calls, Abbau beim Weggehen.

/** @param {import('./types').Ctx} X */
export function initLadesaeulen(X) {
  const A = /** @type {any} */ (X);
  const { THREE, scene, player, TH } = A;
  const NAH = 160, WEG = 230, MAX = 6, PLATZ_L = 5.6, PLATZ_B = 2.3;
  const built = new Map(); // key -> Group (leere Gruppe = geprüft, hier passt nichts hin)
  let LISTE = [], M = null;
  fetch('data/ladesaeulen.json').then(r => r.ok ? r.json() : null).then(d => {
    if (d && Array.isArray(d.lade)) LISTE = d.lade.filter(q => Array.isArray(q) && Number.isFinite(q[0]) && Number.isFinite(q[1])).map(q => ({ key: 'l' + q[0].toFixed(0) + ',' + q[1].toFixed(0), x: q[0], z: q[1], n: Math.max(1, Math.min(4, q[2] | 0 || 2)) }));
  }).catch(() => { /* ohne Datei: keine Ladesäulen */ });

  function mats() {
    if (M) return M;
    // Markierung: Blau mit weißem Rand und einem Stecker-Zeichen (Kreis mit Blitz), längs gezeichnet (u entlang der Straße)
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128; const c = cv.getContext('2d');
    c.fillStyle = '#1f5fbf'; c.fillRect(0, 0, 256, 128); c.strokeStyle = '#f2f4f6'; c.lineWidth = 8; c.strokeRect(4, 4, 248, 120);
    c.lineWidth = 6; c.beginPath(); c.arc(128, 64, 34, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#f2f4f6'; c.beginPath(); c.moveTo(134, 36); c.lineTo(114, 68); c.lineTo(128, 68); c.lineTo(120, 92); c.lineTo(142, 58); c.lineTo(128, 58); c.closePath(); c.fill();
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    M = { farbe: new THREE.MeshLambertMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      saeule: new THREE.MeshLambertMaterial({ color: 0x9aa0a6 }),
      licht: new THREE.MeshBasicMaterial({ color: 0x3fe07a }) };
    for (const k in M) M[k].userData.shared = true; tex.userData.shared = true; // gemeinsam für alle Standorte: Abbau gibt sie nicht frei
    return M;
  }
  /** Mehrere Geometrien zu einer (Position, Normale, UV; ohne Index), wie in supermarkt.js */
  const merge = geos => { const ni = geos.map(q => q.index ? q.toNonIndexed() : q); let n = 0; for (const q of ni) n += q.attributes.position.count;
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2); let o = 0;
    for (let i = 0; i < ni.length; i++) { const q = ni[i]; P.set(q.attributes.position.array, o * 3); N.set(q.attributes.normal.array, o * 3); U.set(q.attributes.uv.array, o * 2); o += q.attributes.position.count; q.dispose(); if (q !== geos[i]) geos[i].dispose(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.BufferAttribute(U, 2)); return g; };
  /** Quader mit Mittelpunkt (x, y, z) im Weltraum, um die Hochachse gedreht */
  const quader = (w, h, d, x, y, z, rot) => { const g = new THREE.BoxGeometry(w, h, d); g.rotateY(rot); g.translate(x, y, z); return g; };

  /** Standort aufbauen: Stellplätze an der nächsten Straße, Säule auf dem Gehweg. null = kein passender Platz */
  function bauen(p) {
    const r = A.nearestRoadDir && A.nearestRoadDir(p.x, p.z, 28); if (!r || !(r.w > 0)) return null;
    const ux = Math.sin(r.ang), uz = Math.cos(r.ang); // entlang der Straße
    let nx = p.x - r.x, nz = p.z - r.z; const nl = Math.hypot(nx, nz); if (nl < 0.5) { nx = uz; nz = -ux; } else { nx /= nl; nz /= nl; }
    const s = nx * uz - nz * ux >= 0 ? 1 : -1; nx = uz * s; nz = -ux * s; // Seite der Säule, senkrecht zur Straße
    const t0 = (p.x - r.x) * ux + (p.z - r.z) * uz; // Säule längs verschoben gegenüber dem Fußpunkt
    const rand = r.w / 2, mitte = rand - PLATZ_B / 2 - 0.15, geh = rand + 1.1; // Stellplatz innen am Fahrbahnrand, Säule auf dem Gehweg
    const frei = (x, z) => A.solidAt(x, z) < 0;
    const m = mats(), farbe = [], saeule = [], licht = [];
    const n = p.n, l0 = -(n - 1) / 2 * PLATZ_L;
    for (let i = 0; i < n; i++) { const a = t0 + l0 + i * PLATZ_L, x = r.x + ux * a + nx * mitte, z = r.z + uz * a + nz * mitte;
      if (!frei(x, z) || !frei(x + ux * PLATZ_L / 2, z + uz * PLATZ_L / 2) || !frei(x - ux * PLATZ_L / 2, z - uz * PLATZ_L / 2)) continue;
      const g = new THREE.PlaneGeometry(PLATZ_L, PLATZ_B); g.rotateX(-Math.PI / 2); g.rotateY(r.ang + Math.PI / 2); g.translate(x, TH(x, z) + 0.035, z); farbe.push(g); }
    if (!farbe.length) return null;
    const sx = r.x + ux * t0 + nx * geh, sz = r.z + uz * t0 + nz * geh; if (!frei(sx, sz)) return null;
    const sy = TH(sx, sz), rot = r.ang;
    saeule.push(quader(0.55, 1.55, 0.32, sx, sy + 0.78, sz, rot), quader(0.7, 0.08, 0.45, sx, sy + 1.6, sz, rot), quader(0.62, 0.1, 0.4, sx, sy + 0.05, sz, rot));
    for (const sd of [-1, 1]) saeule.push(quader(0.06, 0.32, 0.12, sx + ux * sd * 0.3, sy + 0.95, sz + uz * sd * 0.3, rot)); // Kabelhalter links und rechts
    licht.push(quader(0.42, 0.06, 0.34, sx, sy + 1.42, sz, rot), quader(0.16, 0.16, 0.34, sx + nx * -0.01, sy + 1.16, sz + nz * -0.01, rot));
    const grp = new THREE.Group();
    for (const [geos, mat] of [[farbe, m.farbe], [saeule, m.saeule], [licht, m.licht]]) { const me = new THREE.Mesh(merge(geos), mat); me.receiveShadow = true; me.castShadow = mat === m.saeule; grp.add(me); }
    grp.userData.lichtMesh = grp.children[2]; return grp;
  }
  function wanted() { const px = player.pos.x, pz = player.pos.z, out = []; for (const q of LISTE) { if ((q.x - px) ** 2 + (q.z - pz) ** 2 < NAH * NAH) out.push(q); } out.sort((a, b) => ((a.x - px) ** 2 + (a.z - pz) ** 2) - ((b.x - px) ** 2 + (b.z - pz) ** 2)); return out.slice(0, MAX); }
  const vers = new Map(); // leere Standorte (Straße oder Haus noch nicht geladen) später erneut versuchen, höchstens zehnmal
  function update() {
    const w = wanted(), keys = new Set(w.map(e => e.key));
    for (const [k, g] of built) { if (keys.has(k)) { if (!g.children.length && (g.userData.v = (g.userData.v | 0) + 1) % 4 === 0 && g.userData.v <= 40) { scene.remove(g); built.delete(k); vers.set(k, g.userData.v); } continue; }
      const d2 = (g.userData.x - player.pos.x) ** 2 + (g.userData.z - player.pos.z) ** 2; if (d2 > WEG * WEG) { scene.remove(g); disposeHierarchy(g); built.delete(k); } }
    for (const e of w) { if (built.has(e.key)) continue; let g = null; try { g = bauen(e); } catch (err) { g = null; } g = g || new THREE.Group(); g.userData.v = vers.get(e.key) | 0; g.userData.x = e.x; g.userData.z = e.z; g.userData.noChunk = true; built.set(e.key, g); scene.add(g); }
    if (M) M.licht.color.setHex(A.world && A.world.night ? 0x5dff94 : 0x2fbf62); // nachts heller
  }
  setInterval(() => { try { update(); } catch (e) { console.warn('ladesaeulen', e); } }, 1500); // eigener Takt, keine Zeile in der Spielschleife
  const api = { update, get count() { let n = 0; for (const g of built.values()) if (g.children.length) n++; return n; }, get standorte() { return LISTE.length; },
    /** nächster gebauter Standort (für Proben) */ ort() { let best = null, bd = 1e12; for (const g of built.values()) { if (!g.children.length) continue; const d = (g.userData.x - player.pos.x) ** 2 + (g.userData.z - player.pos.z) ** 2; if (d < bd) { bd = d; best = [g.userData.x, g.userData.z]; } } return best; } };
  /** @type {any} */ (window).LADE = api; return api;
}

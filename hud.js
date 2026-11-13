// HUD und Anzeigen aus game.js (#118, 13.11.2026): Meldungen, Minikarte, Stadtübersicht und U-Bahn-Linien der Karten.
// Verhalten unverändert; game.js reicht seine Objekte herein und behält dünne Hüllen, damit alle Aufrufer gleich bleiben.

/** @param {any} X Objekte aus game.js */
export function initHud(X) {
  const { msgEl, mm, mmc, MM_HOOKS, ext, MM_SCALE, player, camYaw, opts, cars, TILES, TS, tkey, tileMap } = X; void mm;
  // kind: '' (Alarm, rot und groß), 'ok' (grün, klein), 'info' (gelb, klein)
  function showMsg(t, ms = 2500, kind = '') { msgEl.textContent = t; msgEl.className = kind; msgEl.style.display = 'block'; clearTimeout(showMsg.t); showMsg.t = setTimeout(() => msgEl.style.display = 'none', ms); }
  // DOM nur schreiben, wenn sich der Wert ändert (spart Layout-Arbeit pro Bild)
  const setTxt = (el, v) => { if (el && el.__v !== v) { el.__v = v; el.textContent = v; } };
  const setSty = (el, k, v) => { if (!el) return; const s = el.__s || (el.__s = {}); if (s[k] !== v) { s[k] = v; el.style[k] = v; } };
  function drawMinimap() {
    const R = 110, zoom = 0.9; mmc.clearRect(0, 0, 220, 220); mmc.save(); mmc.beginPath(); mmc.arc(110, 110, R, 0, Math.PI * 2); mmc.clip();
    // Blickrichtung oben: vorwärts ist (sin yaw, cos yaw) in Weltkoordinaten (x rechts, z nach unten auf der Karte); rotate(yaw + π) legt das auf „oben“. Mit opts.mapNorth bleibt Norden (−z) oben.
    mmc.translate(110, 110); if (!opts.mapNorth) mmc.rotate(camYaw.v + Math.PI);
    mmc.scale(zoom, zoom); const px = (player.pos.x - ext.x0) * MM_SCALE, pz = (player.pos.z - ext.z0) * MM_SCALE;
    { const [ptx, ptz] = [Math.floor(player.pos.x / TS), Math.floor(player.pos.z / TS)]; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const t = TILES.get(tkey(ptx + a, ptz + b)); if (t && t.data) mmc.drawImage(t.mm || (t.mm = tileMap(t)), (t.tx * TS - ext.x0) * MM_SCALE - px, (t.tz * TS - ext.z0) * MM_SCALE - pz); } }
    for (const c of cars) { const u = c.userData; mmc.fillStyle = u.police ? '#4f8bff' : '#bbbbbb'; mmc.beginPath(); mmc.arc((c.position.x - ext.x0) * MM_SCALE - px, (c.position.z - ext.z0) * MM_SCALE - pz, u.police ? 3 : 1.5, 0, 7); mmc.fill(); }
    { const P = (x, z) => [(x - ext.x0) * MM_SCALE - px, (z - ext.z0) * MM_SCALE - pz]; for (const f of MM_HOOKS) f(mmc, P, (R - 8) / zoom); }
    mmc.restore();
    // Spielerpfeil: bei Norden-oben in Blickrichtung gedreht, sonst immer nach oben
    mmc.save(); mmc.translate(110, 110); if (opts.mapNorth) mmc.rotate(Math.PI - camYaw.v); mmc.fillStyle = '#ffd84a'; mmc.beginPath(); mmc.moveTo(0, -8); mmc.lineTo(6, 4); mmc.lineTo(-6, 4); mmc.fill(); mmc.restore();
    // Nordmarke am Rand: Norden ist −z; in der gedrehten Karte liegt er bei (−sin yaw, cos yaw)
    { const nx = opts.mapNorth ? 0 : -Math.sin(camYaw.v), nz = opts.mapNorth ? -1 : Math.cos(camYaw.v); const x = 110 + nx * (R - 13), y = 110 + nz * (R - 13); mmc.fillStyle = '#0b0d12dd'; mmc.beginPath(); mmc.arc(x, y, 9, 0, 7); mmc.fill(); mmc.strokeStyle = '#ffd84a'; mmc.lineWidth = 1.5; mmc.stroke(); mmc.fillStyle = '#ffd84a'; mmc.font = 'bold 11px system-ui'; mmc.textAlign = 'center'; mmc.textBaseline = 'middle'; mmc.fillText('N', x, y + 0.5); mmc.textAlign = 'left'; mmc.textBaseline = 'alphabetic'; }
  }
  // Übersicht der ganzen Stadt (data/overview.json, tools/build_overview.py): Hintergrund für Gegenden ohne geladene Kachel
  let OVERVIEW = null; fetch('data/overview.json').then(r => r.ok ? r.json() : null).then(d => { OVERVIEW = d; }).catch(() => {});
  function drawOverview(c2, P, W, H, sc) { if (!OVERVIEW) return; const vis = p => { const [x, y] = P(p[0][0], p[0][1]); return x > -3000 && y > -3000 && x < W + 3000 && y < H + 3000; };
    const poly = (arr, col) => { c2.fillStyle = col; for (const p of arr) { if (!vis(p)) continue; c2.beginPath(); p.forEach((q, i) => { const [x, y] = P(q[0], q[1]); if (i) c2.lineTo(x, y); else c2.moveTo(x, y); }); c2.fill(); } };
    const line = (arr, col, w) => { c2.strokeStyle = col; c2.lineWidth = w; c2.beginPath(); for (const p of arr) { if (!vis(p)) continue; p.forEach((q, i) => { const [x, y] = P(q[0], q[1]); if (i) c2.lineTo(x, y); else c2.moveTo(x, y); }); } c2.stroke(); };
    poly(OVERVIEW.wood, '#22351f'); poly(OVERVIEW.green, '#2c4a2a'); poly(OVERVIEW.water, '#1d3d5c');
    if (sc > 0.08) line(OVERVIEW.r3, '#3a3d44', Math.max(1, 5 * sc)); line(OVERVIEW.r2, '#55595f', Math.max(1, 8 * sc)); line(OVERVIEW.r1, '#8a8478', Math.max(1.4, 12 * sc)); c2.setLineDash([4, 3]); line(OVERVIEW.rail, '#6c6c74', 1); c2.setLineDash([]); }
  // U-Bahn-Linie: echter Streckenverlauf (Feld g aus tools/metro_geometry.py), sonst Station zu Station
  function drawMetroLine(c2, P, l) { c2.strokeStyle = l.color || '#888'; c2.beginPath(); if (l.g && l.g.length) { for (const w of l.g) w.forEach((q, i) => { const [x, y] = P(q[0], q[1]); if (i) c2.lineTo(x, y); else c2.moveTo(x, y); }); } else { let f = true; for (const id of l.stops) { const s = X.interiors().ST.get(id); if (!s) continue; const [x, y] = P(s.p[0], s.p[1]); if (f) c2.moveTo(x, y); else c2.lineTo(x, y); f = false; } } c2.stroke(); }
  return { showMsg, setTxt, setSty, drawMinimap, drawOverview, drawMetroLine };
}

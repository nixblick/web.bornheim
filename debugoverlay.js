// Debug-Overlay (F3) und Messschnittstelle window.G.PERF (#162, André 13.11.2026): erst zählen, dann bauen.
// Zeigt renderer.info (Draw-Calls, Dreiecke, Geometrien, Texturen), Bildzeit (Mittel, 95 %), CPU-Zeit (update + render,
// ohne Warten auf die GPU), GPU-Zeit (EXT_disjoint_timer_query_webgl2, sonst „nicht messbar“) und Draw-Calls je Gruppe.
// Ohne Overlay und ohne Messung ist nichts umgehängt: die Schleife läuft nur durch eine dünne Hülle.
// Gezählt wird exakt: jeder Draw-Call geht durch renderer.renderBufferDirect (Szene und Schattenkarte, three r170).

/** @param {any} G window.G aus game.js; muss vor renderer.setAnimationLoop aufgerufen werden */
export function initDebugOverlay(G) {
  const { renderer, THREE } = G;
  const gl = renderer.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  let active = 0; // Zahl der Nutzer (Overlay, Messung); > 0 = Zähler laufen
  let groups = false; // Gruppen-Zählung (kostet etwas mehr je Draw-Call)
  const ft = [], cpu = [], gpu = [], bld = [], ovl = []; let lastT = 0; const MAXN = 600;
  // #173: Zeit außerhalb update+render sichtbar machen. Lange Bilder/Aufgaben des Browsers (long-animation-frame, sonst longtask) je Quelle,
  // Arbeit nach dem Kachelladen (Promise, außerhalb der Schleife), Zuwachs an Shadern/Geometrien/Texturen je Sekunde, Eigenkosten des Overlays
  const LAF = []; // { t, dur, script, src } der letzten 5 s
  let lafType = null, po = null, buildMax = 0, buildStep = '', syncMs = 0, syncN = 0, loadMs = 0, loadN = 0, lastRes = null, resDelta = null, resT = 0;
  function observe(on) {
    if (!on) { if (po) po.disconnect(); po = null; return; } if (po || typeof PerformanceObserver === 'undefined') return;
    const types = PerformanceObserver.supportedEntryTypes || []; lafType = types.includes('long-animation-frame') ? 'long-animation-frame' : types.includes('longtask') ? 'longtask' : null; if (!lafType) return;
    po = new PerformanceObserver(list => { for (const e of /** @type {any[]} */ (list.getEntries())) {
      let script = 0; const src = new Map();
      if (e.scripts) for (const s of e.scripts) { script += s.duration; const k = `${s.invoker || s.invokerType || '?'}${s.sourceFunctionName ? ' ' + s.sourceFunctionName : ''} (${String(s.sourceURL || '').split('/').pop().split('?')[0]}${s.sourceCharPosition >= 0 ? ':' + s.sourceCharPosition : ''})`; src.set(k, (src.get(k) || 0) + s.duration); }
      else { script = e.duration; const a = e.attribution && e.attribution[0]; src.set(a ? `${a.containerType || ''} ${a.containerName || a.name || ''}`.trim() || 'longtask' : 'longtask', e.duration); }
      LAF.push({ t: e.startTime, dur: e.duration, script, render: e.renderStart ? Math.max(0, e.startTime + e.duration - e.renderStart) : 0, style: e.styleAndLayoutStart ? Math.max(0, e.startTime + e.duration - e.styleAndLayoutStart) : 0, block: e.blockingDuration || 0, src }); } });
    try { po.observe({ type: lafType, buffered: false }); } catch (x) { po = null; }
  }
  function lafStat() { const now = performance.now(); while (LAF.length && LAF[0].t < now - 5000) LAF.shift(); if (!lafType) return null;
    let dur = 0, script = 0, render = 0, block = 0; const src = new Map(); for (const e of LAF) { dur += e.dur; script += e.script; render += e.render; block += e.block; for (const [k, v] of e.src) src.set(k, (src.get(k) || 0) + v); }
    const top = [...src].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => [k, Math.round(v / 5)]);
    return { type: lafType, n: LAF.length, msPerS: Math.round(dur / 5), scriptPerS: Math.round(script / 5), renderPerS: Math.round(render / 5), blockPerS: Math.round(block / 5), top }; }
  function resStep() { const now = performance.now(); if (now - resT < 1000) return; const m = renderer.info.memory, r = { programs: (renderer.info.programs || []).length, geometries: m.geometries, textures: m.textures };
    if (lastRes) resDelta = { programs: r.programs - lastRes.programs, geometries: r.geometries - lastRes.geometries, textures: r.textures - lastRes.textures, s: +((now - resT) / 1000).toFixed(1) }; lastRes = r; resT = now; }
  let byGroup = new Map(), byKey = new Map(), frameInfo = null;
  const pending = []; // offene GPU-Abfragen
  const push = (a, v) => { a.push(v); if (a.length > MAXN) a.shift(); };

  // Gruppe eines Draw-Calls aus vorhandenen Kennungen; was nicht erkennbar ist, landet in „sonstige“
  const inList = (o, list) => { for (let p = o; p; p = p.parent) if (list.includes(p)) return true; return false; };
  const lampMeshes = () => { const s = new Set(); for (const l of G.lampSpots || []) { if (l.lm) s.add(l.lm); if (l.hm) s.add(l.hm); if (l.spotM) s.add(l.spotM); if (l.pts) s.add(l.pts); } return s; };
  let LAMPS = new Set(), lampT = 0;
  let TGRP = new Set(); const inTile = o => { for (let p = o.parent; p; p = p.parent) if (TGRP.has(p)) return true; return false; };
  function classify(o, camera, material) {
    const sc = G.sun && G.sun.shadow && G.sun.shadow.camera;
    const pass = camera === sc ? 'Schatten' : camera === G.camera ? (material === G.scene.overrideMaterial ? 'Normalen (AO)' : 'Szene') : 'Nachbearbeitung';
    if (pass === 'Nachbearbeitung') return [pass, 'Vollbild'];
    let g = 'sonstige';
    const geo = o.geometry, gp = geo && geo.parameters, mat = Array.isArray(o.material) ? o.material[0] : o.material;
    if (inList(o, G.cars)) g = 'Autos'; else if (inList(o, G.peds) || inList(o, [G.player && G.player.mesh])) g = 'Figuren'; else if (inList(o, G.trams || [])) g = 'Bahnen';
    else if (LAMPS.has(o)) g = 'Laternen';
    else if (o.isInstancedMesh && gp && gp.radiusTop === 0.15 && gp.height === 2.2) g = 'Bäume';
    else if (o.isInstancedMesh && mat && (mat.alphaTest === 0.45 || (o.instanceColor && geo.type !== 'BufferGeometry' && /Icosahedron/.test(geo.type)) || (o.instanceColor && mat.color && mat.color.getHex() === 0xffffff && !mat.map))) g = 'Bäume';
    else if (o.userData && o.userData.carInst) g = 'Autos (instanziert)';
    else if ((G.staticParked || []).some(sp => sp.refs && sp.refs.some(r => r.mesh === o))) g = 'Autos (geparkt)';
    else if (!inTile(o) && o.parent && o.parent !== G.scene) g = 'Einzelmodelle (Gräber, Haltestellen, Wahrzeichen)';
    else if (mat && mat.vertexColors && mat.emissiveMap) g = 'Gebäude';
    else if (o.isPoints) g = 'Lichtpunkte';
    else if (o.isInstancedMesh) g = 'Instanzen sonstige';
    return [pass, g];
  }
  const keyOf = o => { const mat = Array.isArray(o.material) ? o.material[0] : o.material; const geo = o.geometry;
    return `${o.isInstancedMesh ? 'Inst' : o.isPoints ? 'Pkt' : 'Mesh'}|${geo ? geo.type : '?'}|${mat ? mat.type : '?'}|#${mat && mat.color ? mat.color.getHexString() : '-'}${mat && mat.map ? '+map' : ''}`; };

  const orig = renderer.renderBufferDirect;
  function counted(camera, scene, geometry, material, object, group) {
    if (groups && object) { const [pass, g] = classify(object, camera, material); const k = pass + ' / ' + g; byGroup.set(k, (byGroup.get(k) || 0) + 1);
      if (pass === 'Szene') { const kk = keyOf(object); byKey.set(kk, (byKey.get(kk) || 0) + 1); } }
    return orig.call(this, camera, scene, geometry, material, object, group);
  }

  function beginFrame() {
    renderer.info.reset();
    if (groups) { byGroup = new Map(); byKey = new Map(); if (performance.now() - lampT > 2000) { LAMPS = lampMeshes(); lampT = performance.now(); TGRP = new Set([...G.TILES.values()].map(q => q.grp).filter(Boolean)); } }
    if (ext) { for (let i = pending.length - 1; i >= 0; i--) { const q = pending[i];
      if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) { if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) push(gpu, gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(q); pending.splice(i, 1); } }
      if (pending.length < 8) { const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); return q; } }
    return null;
  }
  function endFrame(q, t0, t1) {
    if (q) { gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(q); }
    if (lastT) push(ft, t0 - lastT); lastT = t0; push(cpu, t1 - t0);
    const B = G.BUILD_STAT; if (B) { push(bld, B.ms); if (B.max > buildMax) { buildMax = B.max; buildStep = B.step; } syncMs += B.sync || 0; syncN += B.syncN || 0; B.ms = 0; B.max = 0; B.sync = 0; B.syncN = 0; }
    const L = G.LOAD_STAT; if (L) { loadMs += L.ms; loadN += L.n; L.ms = 0; L.n = 0; } resStep();
    const r = renderer.info.render, m = renderer.info.memory;
    frameInfo = /** @type {any} */ ({ calls: r.calls, triangles: r.triangles, points: r.points, lines: r.lines, geometries: m.geometries, textures: m.textures, programs: (renderer.info.programs || []).length });
    if (groups) frameInfo.groups = Object.fromEntries(byGroup), frameInfo.keys = Object.fromEntries(byKey);
  }

  // Hülle um die Spielschleife: game.js ruft setAnimationLoop genau einmal nach initDebugOverlay
  const setLoop = renderer.setAnimationLoop.bind(renderer);
  renderer.setAnimationLoop = cb => setLoop(cb ? (t, f) => {
    if (!active) { cb(t, f); return; }
    const s0 = performance.now(); const q = beginFrame(); const t0 = performance.now(); cb(t, f); const t1 = performance.now(); endFrame(q, t0, t1); if (el) draw(); push(ovl, performance.now() - s0 - (t1 - t0));
  } : null);

  function start(withGroups) {
    if (!active++) { renderer.info.autoReset = false; ft.length = cpu.length = gpu.length = bld.length = ovl.length = 0; lastT = 0; buildMax = 0; loadMs = loadN = 0; LAF.length = 0; observe(true); }
    if (withGroups && !groups) { groups = true; renderer.renderBufferDirect = counted; }
  }
  function stop(withGroups) {
    if (withGroups && groups && !(el && elGroups)) { groups = false; renderer.renderBufferDirect = orig; }
    if (active > 0 && !--active) { renderer.info.autoReset = true; groups = false; renderer.renderBufferDirect = orig; observe(false); }
  }
  const stat = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return { mean: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2), p95: +s[Math.min(s.length - 1, Math.floor(s.length * 0.95))].toFixed(2), n: a.length }; };
  function snapshot() {
    const f = frameInfo || {};
    const top = f.keys ? Object.entries(f.keys).sort((a, b) => b[1] - a[1]).slice(0, 12) : null;
    const size = new THREE.Vector2(); renderer.getDrawingBufferSize(size);
    return { calls: f.calls, triangles: f.triangles, geometries: f.geometries, textures: f.textures, programs: f.programs,
      frameMs: stat(ft), cpuMs: stat(cpu), gpuMs: ext ? stat(gpu) : 'nicht messbar (EXT_disjoint_timer_query_webgl2 fehlt)',
      groups: f.groups || null, top, quality: G.opts.quality, scale: G.opts.scale || 1, pixelRatio: renderer.getPixelRatio(), buffer: [size.x, size.y],
      buildMs: stat(bld), buildSliceMax: { ms: +buildMax.toFixed(1), step: buildStep }, buildSync: { ms: Math.round(syncMs), n: syncN }, loadTile: { ms: Math.round(loadMs), n: loadN }, overlayMs: stat(ovl),
      gapMs: (() => { const a = stat(ft), c = stat(cpu); return a && c ? +(a.mean - c.mean).toFixed(1) : null; })(), longFrames: lafStat(), resPerS: resDelta,
      tiles: [...G.TILES.values()].filter(t => t.built).length, lowGfx: !!G.LOW_GFX, weakGpu: !!G.WEAK_GPU, view: G.opts.view || 700 };
  }

  // Messung für Proben: n Bilder (höchstens maxMs), Ergebnis wie das Overlay; dynamische Auflösung währenddessen aus
  async function measure({ frames = 60, maxMs = 30000, groups: wg = true } = {}) {
    const dyn = G.opts.dynres; G.opts.dynres = false; start(wg);
    try { const t0 = performance.now(); ft.length = cpu.length = gpu.length = 0; lastT = 0;
      buildMax = 0; loadMs = loadN = 0; syncMs = syncN = 0; bld.length = ovl.length = 0;
      while (cpu.length < frames && performance.now() - t0 < maxMs) await new Promise(r => setTimeout(r, 50));
      await new Promise(r => setTimeout(r, 200)); // letzte GPU-Abfragen einsammeln
      const s = snapshot(); s.partial = cpu.length < frames; s.messMs = Math.round(performance.now() - t0); return s;
    } finally { stop(wg); G.opts.dynres = dyn; }
  }
  // Warten, bis alle geladenen Kacheln im Umkreis gebaut sind (nach Sprung oder Wechsel der Grafikstufe)
  async function settle(maxMs = 30000, r = 400) {
    const t0 = performance.now(); let still = 0;
    while (performance.now() - t0 < maxMs) { const p = G.player.pos; let open = 0;
      for (const [, t] of G.TILES) if (!t.built && t.data && Math.hypot((t.tx + 0.5) * G.TS - p.x, (t.tz + 0.5) * G.TS - p.z) < r) open++;
      if (!open) { if (++still >= 4) return true; } else still = 0;
      G.streamUpdate(0.5, true); await new Promise(res => setTimeout(res, 250)); }
    return false;
  }

  // Overlay
  let el = null, elGroups = true;
  function drawNow() {
    const s = snapshot(); const f = v => v == null ? '–' : typeof v === 'string' ? v : `${v.mean} / ${v.p95} ms`;
    let h = `<b>F3 Leistung</b> (${s.quality}, Skala ${s.scale}, ${s.buffer[0]}×${s.buffer[1]})<br>Draw-Calls ${s.calls} · Dreiecke ${(s.triangles / 1000).toFixed(0)}k · Geo ${s.geometries} · Tex ${s.textures} · Shader ${s.programs}<br>`
      + `Bild Ø/95 %: ${f(s.frameMs)}<br>CPU (update+render): ${f(s.cpuMs)}<br>GPU: ${f(s.gpuMs)}<br>`
      + `Lücke außerhalb Schleife Ø: ${s.gapMs == null ? '–' : s.gapMs + ' ms'}<br>Kachelbau je Bild: ${f(s.buildMs)} · längstes Stück ${s.buildSliceMax.ms} ms (${s.buildSliceMax.step || '–'})<br>`
      + `Kachel laden (außerhalb): ${s.loadTile.ms} ms / ${s.loadTile.n} Kacheln · Overlay: ${f(s.overlayMs)}<br>`
      + (s.resPerS ? `Zuwachs je ${s.resPerS.s} s: Shader ${s.resPerS.programs} · Geo ${s.resPerS.geometries} · Tex ${s.resPerS.textures}<br>` : '')
      + (s.longFrames ? `Lange Bilder (${s.longFrames.type}, 5 s): ${s.longFrames.n} · ${s.longFrames.msPerS} ms/s, Skript ${s.longFrames.scriptPerS}, Zeichnen ${s.longFrames.renderPerS}<br>` + s.longFrames.top.map(([k, v]) => `&nbsp; ${k.replace(/</g, '&lt;')}: ${v} ms/s`).join('<br>') + (s.longFrames.top.length ? '<br>' : '') : 'Lange Bilder: nicht messbar<br>')
      + `<i>F4: halbe Auflösung an/aus</i>`;
    if (s.groups) h += '<br>' + Object.entries(s.groups).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join('<br>');
    el.innerHTML = h;
  }
  let drawT = 0; // höchstens 4× je Sekunde neu zeichnen
  function draw() { const n = performance.now(); if (n - drawT > 250) { drawT = n; drawNow(); } }
  function toggle() {
    if (el) { el.remove(); el = null; stop(true); return false; }
    el = document.createElement('div'); el.id = 'debugoverlay';
    el.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99999;background:rgba(0,0,0,.72);color:#e8f0e8;font:12px/1.35 monospace;padding:8px 10px;border-radius:6px;pointer-events:none;max-width:46ch';
    document.body.appendChild(el); start(elGroups); return true;
  }
  let halfPrev = null;
  function halfRes(on = halfPrev === null) {
    if (on && halfPrev === null) { halfPrev = G.opts.scale || 1; G.opts.scale = halfPrev / 2; } else if (!on && halfPrev !== null) { G.opts.scale = halfPrev; halfPrev = null; } else return !!halfPrev;
    G.applyQuality(); return halfPrev !== null;
  }
  addEventListener('keydown', e => { if (e.code === 'F3') { e.preventDefault(); toggle(); } else if (e.code === 'F4' && el) { e.preventDefault(); halfRes(); } });

  const api = { measure, settle, snapshot, toggle, halfRes, get gpuTimer() { return !!ext; } };
  G.PERF = api; return api;
}

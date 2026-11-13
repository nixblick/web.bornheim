// Gelände-Messung (#165): Straßenknicke und Möbel-Fuß gegen sichtbare Oberfläche. Nur messen, nichts ändern.
// Im Spiel laden: await import('/tools/gelaende.js?' + Date.now()); const r = await T.gelaende(x, z, 250); r
// 1. Knick: jede Straße im Umkreis wird nach Bogenlänge alle 4 m abgetastet (Höhe TH wie der Fahrbahn-Streifen,
//    der TH alle ≤ 3 m übernimmt), Knick = |h[i-1] - 2 h[i] + h[i+1]| in cm. Brücken (r.el) bleiben draußen.
// 2. Möbel: Fuß = Unterkante, mit der game.js/graeber.js das Teil setzt (footTH − FOOT_SINK bzw. Gruppenposition).
//    Strahl von 1 m über dem höheren der beiden Füße (alt: TH, neu: Unterkante) senkrecht nach unten gegen flache, nicht
//    instanzierte Kachel-Meshes; der erste Treffer ist die oberste Fläche (vorher: Start 0,4 m über TH, ein tiefer
//    steckender Fuß traf die nächsttiefere Fläche und zählte fälschlich als schwebend). Abstand > 0 = schwebt, < 0 = steckt.
//    Je Klasse stehen die Werte für die neue Unterkante, unter `vorher` dieselbe Messung für den alten Fuß auf TH.
const G = window.G;
const near = (x, z, cx, cz, R) => (x - cx) ** 2 + (z - cz) ** 2 < R * R;

function knicke(cx, cz, R) {
  const out = []; let segs = 0;
  for (const [, t] of G.TILES) { if (!t.built || !t.data || !t.data.roads) continue;
    for (const r of t.data.roads) { if (r.ry && r.el && r.el.some(Boolean)) continue; if (!r.p.some(([x, z]) => near(x, z, cx, cz, R))) continue; segs++;
      // Abtastung nach Bogenlänge alle 4 m
      const pts = []; let carry = 0;
      for (let i = 0; i < r.p.length - 1; i++) { const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const l = Math.hypot(bx - ax, bz - az); let d = carry;
        for (; d <= l; d += 4) { const x = ax + (bx - ax) * d / l, z = az + (bz - az) * d / l; pts.push([x, z, G.TH(x, z)]); } carry = d - l; }
      for (let i = 1; i < pts.length - 1; i++) { const [x, z] = pts[i]; if (!near(x, z, cx, cz, R)) continue;
        const k = Math.abs(pts[i - 1][2] - 2 * pts[i][2] + pts[i + 1][2]) * 100; out.push({ k: +k.toFixed(1), x: +x.toFixed(1), z: +z.toFixed(1), y: +pts[i][2].toFixed(2), n: r.n || '', ang: Math.atan2(pts[i + 1][0] - pts[i - 1][0], pts[i + 1][1] - pts[i - 1][1]) }); } } }
  out.sort((a, b) => b.k - a.k);
  const ks = out.map(o => o.k), q = p => ks.length ? [...ks].sort((a, b) => a - b)[Math.floor((ks.length - 1) * p)] : null;
  return { strassen: segs, punkte: ks.length, median_cm: q(0.5), p95_cm: q(0.95), max_cm: ks[0] ?? null, ueber5: ks.filter(k => k > 5).length, ueber10: ks.filter(k => k > 10).length, ueber20: ks.filter(k => k > 20).length,
    top: out.slice(0, 10).map(o => ({ k: o.k, x: o.x, z: o.z, y: o.y, n: o.n, ang: +o.ang.toFixed(2) })) };
}

// flache Kachel-Meshes einmal je Ort sammeln (Anteil nach oben zeigender Normalen ≥ 60 %)
function flaechen(cx, cz, R) {
  const list = [];
  for (const [, t] of G.TILES) { if (!t.built || !t.grp) continue; const x0 = t.tx * G.TS, z0 = t.tz * G.TS;
    if (cx < x0 - R || cx > x0 + G.TS + R || cz < z0 - R || cz > z0 + G.TS + R) continue;
    t.grp.traverse(o => { if (!o.isMesh || o.isInstancedMesh || !o.geometry || !o.geometry.attributes.normal) return; const m = Array.isArray(o.material) ? o.material[0] : o.material; if (!m || (m.transparent && m.opacity < 0.95) || m.blending === 2) return;
      const nn = o.geometry.attributes.normal; let up = 0, s = 0; const step = Math.max(1, Math.floor(nn.count / 400)); for (let i = 0; i < nn.count; i += step) { s++; if (nn.getY(i) > 0.8) up++; }
      if (s && up / s >= 0.6) list.push(o); }); }
  return list;
}
function art(o) { const m = Array.isArray(o.material) ? o.material[0] : o.material; if (m === G.roadMat) return 'Fahrbahn'; if (m && m.polygonOffset && m.polygonOffsetFactor === 1) return 'Gehweg/Weg'; if (m && m.vertexColors && !m.map) return 'Gelände'; return 'sonstige Fläche'; }

function moebel(cx, cz, R, deadline, max = 150) {
  const T3 = G.THREE, rc = new T3.Raycaster(), dn = new T3.Vector3(0, -1, 0), o3 = new T3.Vector3(); rc.far = 4;
  const targets = flaechen(cx, cz, R + 10);
  const S = G.FOOT_SINK || 0, FT = (x, z, r) => (G.footTH ? G.footTH(x, z, r) : G.TH(x, z)) - S;
  const klassen = {
    Laternen: G.lampSpots.filter(([x, z]) => near(x, z, cx, cz, R)).map(([x, z]) => [x, z, G.TH(x, z), FT(x, z, 0.15)]),
    Baeume: G.treeSpots.filter(([x, z]) => near(x, z, cx, cz, R)).map(([x, z]) => [x, z, G.TH(x, z), FT(x, z, 0.25)]),
    Baenke: [], Graeber: [] };
  for (const [, t] of G.TILES) if (t.built && t.data && t.data.furniture) for (const f of t.data.furniture) if (f.k === 'bench' && !f.skip && f.off && near(f.x, f.z, cx, cz, R) && G.solidAt(f.x, f.z) < 0) klassen.Baenke.push([f.x, f.z, G.TH(f.x, f.z), (G.thMin ? G.thMin(f.x, f.z, 0.8) - S : FT(f.x, f.z, 0.8))]);
  if (window.GRAEBER) for (const [k, x, z] of window.GRAEBER.list) if (/^a/.test(String(k)) && near(x, z, cx, cz, R)) klassen.Graeber.push([x, z, G.TH(x, z), G.TH(x, z)]);
  const res = {}; let zeitUm = false;
  for (const [name, all] of Object.entries(klassen)) {
    const pts = all.sort((a, b) => ((a[0] - cx) ** 2 + (a[1] - cz) ** 2) - ((b[0] - cx) ** 2 + (b[1] - cz) ** 2)).slice(0, max);
    const r = { gesamt: all.length, geprueft: 0, schwebend_5cm: 0, versunken_30cm: 0, ohne_treffer: 0, max_schwebt_cm: 0, max_steckt_cm: 0, flaeche: {}, schlimmste: [], vorher: { schwebend_5cm: 0, versunken_30cm: 0, max_schwebt_cm: 0 } };
    for (const [x, z, alt, foot] of pts) { if (performance.now() > deadline) { zeitUm = true; break; } r.geprueft++;
      rc.set(o3.set(x, Math.max(alt, foot) + 1, z), dn); const hit = rc.intersectObjects(targets, false).find(h => h.face && h.face.normal.y > 0.5);
      if (!hit) { r.ohne_treffer++; continue; }
      const d = (foot - hit.point.y) * 100, dv = (alt - hit.point.y) * 100; if (dv > 5) r.vorher.schwebend_5cm++; if (dv < -30) r.vorher.versunken_30cm++; r.vorher.max_schwebt_cm = Math.max(r.vorher.max_schwebt_cm, +dv.toFixed(1)); const a = art(hit.object); r.flaeche[a] = (r.flaeche[a] || 0) + 1;
      if (d > 5) r.schwebend_5cm++; if (d + S * 100 < -30) r.versunken_30cm++; /* gewollt: Unterkante S tiefer */ r.max_schwebt_cm = Math.max(r.max_schwebt_cm, +d.toFixed(1)); r.max_steckt_cm = Math.max(r.max_steckt_cm, +(-d).toFixed(1));
      r.schlimmste.push({ d: +d.toFixed(1), x: +x.toFixed(1), z: +z.toFixed(1), a }); }
    r.schlimmste = r.schlimmste.sort((p, q) => Math.abs(q.d) - Math.abs(p.d)).slice(0, 3); res[name] = r; }
  return { flaechen_meshes: targets.length, zeitUm, ...res };
}

async function gelaende(cx, cz, R = 250, budgetMs = 38000) {
  const t0 = performance.now(), deadline = t0 + budgetMs;
  const k = knicke(cx, cz, R); const m = moebel(cx, cz, R, deadline);
  return { ort: [cx, cz], R, knick: k, moebel: m, ms: Math.round(performance.now() - t0) };
}
window.T = Object.assign(window.T || {}, { gelaende });

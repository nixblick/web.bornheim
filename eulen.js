// Frischlufteulen im Spiel (#61, erster Kunde): Plakate an Litfaßsäulen (geteilt mit weiteren Kunden-Motiven, #81 Vokabaum), Eulen-Lauf und Eulen-Marathon mit Ziel an der Festhalle.
// Daten nur aus https://frischlufteulen.de/api/spiel/strecken.json (einmal je Sitzung), nichts ausgedacht: ohne freigegebene Strecke keine Plakate und keine Mission.
// Format je Strecke: { name, laenge_km, linie: [[lon, lat], …], link, marathon? }. Keine Nutzerdaten, keine fremden Marken.
export function initEulen(X) {
  const { THREE, scene, player, TH, showMsg, canvasTex, card, sfx, burst, solidAt } = X;
  const LAT0 = 50.129441, LON0 = 8.7096938, R = 6371000;
  const xy = ([lon, lat]) => [(lon - LON0) * Math.PI / 180 * R * Math.cos(LAT0 * Math.PI / 180), -(lat - LAT0) * Math.PI / 180 * R];
  const SPAR = 'eulenMarathon';
  let pendingStart = null; let routes = [], posters = [], run = null, finish = null, startMark = null, t = 0;
  const load = async () => { for (const u of ['https://frischlufteulen.de/api/spiel/strecken.json']) { try { const r = await fetch(u); if (!r.ok) continue; const d = await r.json(); if (d && d.strecken && d.strecken.length) return d.strecken; } catch (e) { /* nächste Quelle */ } } return []; };
  load().then(s => { routes = s.map(r => ({ ...r, marathon: r.marathon || /marathon/i.test(r.name || ''), pts: (r.linie || []).map(xy) })).filter(r => r.pts.length > 1); if (routes.length) { for (const p of posters) scene.remove(p); posters = []; /* Säulen neu verteilen, jetzt mit Eulen-Motiv */ } buildStart(); });

  // ---------- Plakat (gezeichnet): Eule, Titel, Streckenname ----------
  const posterTex = name => canvasTex(256, 384, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#1f5b3a'); g.addColorStop(1, '#0f2f20'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#f4e9c8'; c.beginPath(); c.ellipse(128, 120, 62, 72, 0, 0, 7); c.fill(); c.fillStyle = '#8a5a2b'; c.beginPath(); c.ellipse(128, 128, 50, 58, 0, 0, 7); c.fill();
    for (const x of [104, 152]) { c.fillStyle = '#fff'; c.beginPath(); c.arc(x, 108, 18, 0, 7); c.fill(); c.fillStyle = '#ffb000'; c.beginPath(); c.arc(x, 108, 10, 0, 7); c.fill(); c.fillStyle = '#111'; c.beginPath(); c.arc(x, 108, 5, 0, 7); c.fill(); }
    c.fillStyle = '#f0a020'; c.beginPath(); c.moveTo(120, 130); c.lineTo(136, 130); c.lineTo(128, 146); c.fill();
    c.fillStyle = '#ffe9a8'; c.font = 'bold 30px sans-serif'; c.textAlign = 'center'; c.fillText('FRISCHLUFT', w / 2, 236); c.fillText('EULEN', w / 2, 268);
    c.fillStyle = '#fff'; c.font = '17px sans-serif'; c.fillText('Laufstrecken in Frankfurt', w / 2, 298); c.font = 'bold 18px sans-serif'; c.fillText((name || '').slice(0, 24), w / 2, 330); c.font = '14px sans-serif'; c.fillStyle = '#bfe0c8'; c.fillText('frischlufteulen.de', w / 2, 362); }, 1, 1);
  // Vokabaum (#81, zweiter Kunde): gezeichneter Baum, Text aus dem Ticket, immer zu sehen (kein Endpunkt nötig)
  const vokaTex = () => canvasTex(256, 384, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#e9f4d8'); g.addColorStop(1, '#b9d99a'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#6b4423'; c.fillRect(118, 130, 20, 80); c.beginPath(); c.moveTo(118, 210); c.lineTo(104, 222); c.lineTo(152, 222); c.lineTo(138, 210); c.fill();
    for (const [x, y, r, col] of [[128, 92, 46, '#2f7d32'], [92, 120, 34, '#388e3c'], [164, 120, 34, '#388e3c'], [110, 70, 30, '#43a047'], [148, 72, 30, '#43a047'], [128, 128, 30, '#2e7031']]) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }
    c.fillStyle = '#ffd54a'; for (const [x, y] of [[100, 96], [150, 104], [128, 64], [116, 132]]) { c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill(); }
    c.fillStyle = '#1e4d21'; c.font = 'bold 40px sans-serif'; c.textAlign = 'center'; c.fillText('VOKABAUM', w / 2, 270);
    c.fillStyle = '#244a26'; c.font = '19px sans-serif'; c.fillText('Vokabeln lernen,', w / 2, 302); c.fillText('Wald wachsen lassen', w / 2, 326); c.font = 'bold 17px sans-serif'; c.fillStyle = '#2f5d8a'; c.fillText('vokabaum.hinjas.de', w / 2, 362); }, 1, 1);
  const MOTIV = { eulen: () => posterTex(routes[0] ? routes[0].name : 'Eulen-Lauf'), vokabaum: vokaTex }; const MATS = {};
  const posterMat = m => MATS[m] || (MATS[m] = new THREE.MeshLambertMaterial({ map: MOTIV[m](), emissive: 0x223322, emissiveIntensity: 0.4 }));
  // je Säule ein Motiv: Eulen nur, wenn der Endpunkt Strecken liefert, Vokabaum immer; abwechselnd verteilt
  const nextMotif = () => { if (!routes.length) return 'vokabaum'; const n = m => posters.filter(p => p.userData.motif === m).length; return n('eulen') <= n('vokabaum') ? 'eulen' : 'vokabaum'; };
  function litfass(x, z, motif) { const g = new THREE.Group(); g.userData.motif = motif; const y = TH(x, z); const col = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 2.8, 16, 1, true), posterMat(motif)); col.position.y = 1.6; g.add(col);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.62, 0.3, 16), new THREE.MeshLambertMaterial({ color: 0x2d4a3a })); cap.position.y = 3.15; g.add(cap); const base = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.7, 0.2, 16), cap.material); base.position.y = 0.1; g.add(base);
    g.position.set(x, y, z); scene.add(g); return g; }
  function updatePosters() { const keep = []; for (const p of posters) { if (Math.hypot(p.position.x - player.pos.x, p.position.z - player.pos.z) < 450) keep.push(p); else scene.remove(p); } posters = keep;
    if (posters.length >= 4) return; const stops = ((X.WORLD || X.CITY).stops || []).filter(s => s.k === 'bus' && Math.hypot(s.x - player.pos.x, s.z - player.pos.z) < 350 && !posters.some(p => Math.hypot(p.position.x - s.x, p.position.z - s.z) < 60));
    for (const s of stops.slice(0, 4 - posters.length)) { for (const [ox, oz] of [[3, 3], [-3, 3], [3, -3], [-3, -3]]) { const x = s.x + ox, z = s.z + oz; if (solidAt(x, z) >= 0 || (X.nearestRoadDir && (() => { const n = X.nearestRoadDir(x, z, 8); return n && Math.hypot(n.x - x, n.z - z) < n.w / 2 + 0.8; })())) continue; posters.push(litfass(x, z, nextMotif())); break; } } }

  // ---------- Start-Markierung des Marathons (grüne Eulen-Säule) ----------
  function buildStart() { const m = routes.find(r => r.marathon); if (!m || startMark) return; const [x, z] = m.pts[0]; startMark = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 60, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x3ad17a, transparent: true, opacity: 0.25, depthWrite: false })); startMark.position.set(x, TH(x, z) + 30, z); scene.add(startMark); startMark.userData.route = m; }

  // ---------- Lauf ----------
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x3ad17a, transparent: true, opacity: 0.8 }); let ring = null;
  function wps(r) { const out = [r.pts[0]]; let acc = 0; for (let i = 1; i < r.pts.length; i++) { const a = r.pts[i - 1], b = r.pts[i]; acc += Math.hypot(b[0] - a[0], b[1] - a[1]); if (acc > (r.marathon ? 900 : 300) || i === r.pts.length - 1) { out.push(b); acc = 0; } } return out; }
  function start(r, resume) { const W = wps(r); const saved = resume ? readSave() : null; run = { r, W, i: saved && saved.name === r.name ? saved.i : 1, t0: performance.now() - (saved && saved.name === r.name ? saved.ms : 0), last: player.pos.clone() };
    if (!ring) { ring = new THREE.Mesh(new THREE.TorusGeometry(3, 0.25, 8, 32), ringMat); scene.add(ring); } ring.visible = true; if (r.marathon) buildFinish(r.pts[r.pts.length - 1]);
    card(r.marathon ? 'EULEN-MARATHON' : 'EULEN-LAUF', `${r.name} · ${r.laenge_km} km · zu Fuß, ohne Auto, Rad oder Bahn` + (r.marathon ? ' · Verpflegungsstationen speichern' : ''), 5); sfx('bell', 0.5); }
  function stop(msg) { run = null; if (ring) ring.visible = false; const o = document.getElementById('obj'); if (o) o.textContent = ''; if (msg) showMsg(msg, 2600); }
  const readSave = () => { try { return JSON.parse(localStorage.getItem(SPAR) || 'null'); } catch (e) { return null; } };
  const writeSave = v => { try { if (v) localStorage.setItem(SPAR, JSON.stringify(v)); else localStorage.removeItem(SPAR); } catch (e) { /* ohne Speicher weiterlaufen */ } };
  const fmt = ms => { const s = Math.floor(ms / 1000); return Math.floor(s / 3600) + ':' + String(Math.floor(s / 60) % 60).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  function runUpdate() { const u = run; if (player.car) { stop('DISQUALIFIZIERT: NUR ZU FUSS'); return; } if (player.pos.distanceTo(u.last) > 60) { stop('DISQUALIFIZIERT: KEINE ABKÜRZUNG PER BAHN ODER SPRUNG'); return; } u.last.copy(player.pos);
    const [x, z] = u.W[u.i]; ring.position.set(x, TH(x, z) + 3, z); ring.rotation.y += 0.03; const d = Math.hypot(player.pos.x - x, player.pos.z - z); const ms = performance.now() - u.t0;
    const o = document.getElementById('obj'); if (o) o.textContent = `🦉 ${u.r.name}: Wegpunkt ${u.i}/${u.W.length - 1} · ${Math.round(d)} m · ${fmt(ms)}`;
    if (d < 7) { u.i++; sfx('click', 0.6); if (u.r.marathon && u.i % 5 === 0 && u.i < u.W.length) { writeSave({ name: u.r.name, i: u.i, ms }); showMsg('VERPFLEGUNG: STAND GESPEICHERT', 1500); player.hp = Math.min(100, player.hp + 30); }
      if (u.i >= u.W.length) done(ms); } }
  function done(ms) { const r = run.r; stop(); writeSave(null);
    if (r.marathon) { player.money = (player.money || 0) + 10000; player.hp = 100; if ('stamina' in player) player.stamina = 1; try { const a = JSON.parse(localStorage.getItem('eulenErfolge') || '[]'); a.push({ was: 'Marathon gefinisht', zeit: fmt(ms), am: new Date().toISOString().slice(0, 10) }); localStorage.setItem('eulenErfolge', JSON.stringify(a)); } catch (e) { /* Erfolg nur für diese Sitzung */ }
      for (let k = 0; k < 6; k++) setTimeout(() => burst(player.pos.clone().setY(player.pos.y + 3), [0xff4060, 0xffd84a, 0x3ad17a, 0x4fa8ff][k % 4], 40), k * 250); }
    card(r.marathon ? 'MARATHON GEFINISHT' : 'EULEN-LAUF GESCHAFFT', `${fmt(ms)}` + (r.marathon ? ' · +10.000 € · volles Leben · Erfolg „Marathon gefinisht“' : '') + ` · <a href="${r.link}" target="_blank" rel="noopener" style="color:#7fe0a0">Strecke auf frischlufteulen.de</a>`, 9); }

  // ---------- Ziel Festhalle: Bogen, roter Teppich, Zuschauer ----------
  function buildFinish([x, z]) { if (finish) return; const g = new THREE.Group(); const y = TH(x, z); const red = new THREE.MeshLambertMaterial({ color: 0xb01020 }), arch = new THREE.MeshLambertMaterial({ color: 0x1f5b3a });
    const carpet = new THREE.Mesh(new THREE.BoxGeometry(3, 0.04, 40), red); carpet.position.set(0, 0.03, -20); g.add(carpet);
    for (const sx of [-2.2, 2.2]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5, 0.5), arch); p.position.set(sx, 2.5, 0); g.add(p); } const top = new THREE.Mesh(new THREE.BoxGeometry(5, 1.1, 0.5), new THREE.MeshLambertMaterial({ map: canvasTex(512, 112, (c, w, h) => { c.fillStyle = '#1f5b3a'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffe9a8'; c.font = 'bold 64px sans-serif'; c.textAlign = 'center'; c.fillText('ZIEL', w / 2, 80); }, 1, 1) })); top.position.set(0, 5.4, 0); g.add(top);
    const fans = []; const fm = [0xd84a4a, 0x4a7ad8, 0xe8c040, 0x5ab868, 0xffffff]; for (let i = 0; i < 40; i++) { const side = i % 2 ? 1 : -1; const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 1.1, 4, 8), new THREE.MeshLambertMaterial({ color: fm[i % fm.length] })); f.position.set(side * (2.4 + Math.random() * 1.5), 0.8, -2 - Math.random() * 36); g.add(f); fans.push(f); }
    g.position.set(x, y, z); scene.add(g); finish = { g, fans }; }

  // ---------- F-Aktionen und Update ----------
  X.fHooks = X.fHooks || [];
  X.fHooks.push(() => { if (run) return null; for (const p of posters) if (Math.hypot(p.position.x - player.pos.x, p.position.z - player.pos.z) < 2.2) { if (p.userData.motif === 'vokabaum') return { label: 'F · Vokabaum-Plakat lesen', act: () => card('VOKABAUM', 'Vokabeln lernen, Wald wachsen lassen · <a href="https://vokabaum.hinjas.de/?von=bornheim" target="_blank" rel="noopener" style="color:#9fe08a">vokabaum.hinjas.de</a>', 8) }; if (!routes.length) continue; const r = routes.find(q => !q.marathon) || routes[0]; return { label: `F · Eulen-Lauf „${r.name}“ starten`, act: () => { const [sx, sz] = r.pts[0]; if (Math.hypot(sx - player.pos.x, sz - player.pos.z) > 40) { showMsg('ZUM START: GRÜNE MARKIERUNG AUF DER KARTE', 2000); pendingStart = r; } else start(r); } }; }
    if (startMark) { const [x, z] = startMark.userData.route.pts[0]; if (Math.hypot(x - player.pos.x, z - player.pos.z) < 5) { const sv = readSave(); return { label: sv ? 'F · Eulen-Marathon fortsetzen' : 'F · Eulen-Marathon starten (42 km)', act: () => start(startMark.userData.route, !!sv) }; } }
    if (pendingStart) { const [x, z] = pendingStart.pts[0]; if (Math.hypot(x - player.pos.x, z - player.pos.z) < 5) { const r = pendingStart; return { label: `F · Eulen-Lauf „${r.name}“ starten`, act: () => { pendingStart = null; start(r); } }; } }
    return null; });
  function update(dt) { t += dt; if (Math.floor(t) !== Math.floor(t - dt)) updatePosters(); if (run) runUpdate();
    if (finish) for (const [i, f] of finish.fans.entries()) f.position.y = 0.8 + Math.abs(Math.sin(t * 6 + i)) * 0.35; }
  return { update, get posters() { return posters; }, get routes() { return routes; }, get run() { return run; }, start, stop };
}

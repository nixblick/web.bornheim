// Story-Engine mit Story 1 „Bornheim bleibt" (Hitzesommer, Investor, Demo, Polizei), Story 2 aus story2.js und Story 3 aus story3.js. Alle Personen, Firmen und Accounts sind erfunden.
// Waffen: In Story 1 und 2 bleiben nur Fäuste und Demo-Zubehör (W.lock 'protest'), in Story 3 nur Fäuste (W.lock 'all').
import { story2Chapters } from './story2.js';
import { story3Chapters } from './story3.js';
import { disposeHierarchy } from './dispose.js';
/** @param {import('./types').Ctx} X */
export function initStory(X, W, D, F) {
  const { THREE, scene, camera, player, peds, cars, opts, world, weather, CITY, TH, solidAt, makeHuman, playAnim, sfx, showMsg, raiseWanted, canvasTex, rnd, clamp, pick, distSegSq, pointInPoly } = X;
  const V3 = THREE.Vector3; const $ = id => document.getElementById(id);

  // ---------- Orte aus den echten Kartendaten ----------
  function nearestOn(roads, x, z) { let best = 1e18, res = null; for (const r of roads) for (let i = 0; i < r.p.length - 1; i++) { const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1; const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1); const px = ax + dx * t, pz = az + dz * t; const d = (px - x) ** 2 + (pz - z) ** 2; if (d < best) { best = d; res = { x: px, z: pz, h: Math.atan2(dx, dz), r }; } } return res; }
  const berger = CITY.roads.filter(r => r.n === 'Berger Straße'); /* wieder da (12.11.2026): wird von Kapiteln und Story 2/3 gebraucht, 697e8b0 hatte sie entfernt */
  const UHR = D.freeSpot(-193, 425, 1.5);
  const U0 = nearestOn(berger.length ? berger : CITY.roads, UHR[0], UHR[1]);
  const parkPoly = CITY.green.filter(g => g.k === 'park').map(g => ({ g, c: g.p.reduce((a, p) => [a[0] + p[0] / g.p.length, a[1] + p[1] / g.p.length], [0, 0]) })).sort((a, b) => Math.hypot(a.c[0] + 466, a.c[1] + 36) - Math.hypot(b.c[0] + 466, b.c[1] + 36))[0];
  const PARKC = parkPoly ? parkPoly.c : [-466, -36];
  const gateR = nearestOn(CITY.roads.filter(r => !r.mw && !r.ry && r.w >= 6), PARKC[0], PARKC[1]); const GATE = [gateR.x, gateR.z];
  const SITE = (() => { const dx = PARKC[0] - GATE[0], dz = PARKC[1] - GATE[1], L = Math.hypot(dx, dz) || 1; for (const k of [34, 28, 22, 40, 16]) { const x = GATE[0] + dx / L * k, z = GATE[1] + dz / L * k; if (solidAt(x, z) < 0 && !X.barrierNear(x, z, 8)) return [x, z, Math.atan2(-dx, -dz)]; } return [GATE[0] + dx / L * 20, GATE[1] + dz / L * 20, Math.atan2(-dx, -dz)]; })();
  const EISR = nearestOn(CITY.roads.filter(r => !r.mw && !r.ry && r.w >= 6), 806, 452); const EIS = [EISR.x, EISR.z, EISR.h];

  // ---------- Zustand ----------
  const fresh = () => ({ state: 'new', chap: 0, done: [], endings: [], flags: {} });
  const KEYS = { s1: 'notgta.story', s2: 'notgta.story2', s3: 'notgta.story3' };
  const S1 = fresh(), S2 = fresh(), S3 = fresh(); try { Object.assign(S1, JSON.parse(localStorage.getItem(KEYS.s1) || '{}')); Object.assign(S2, JSON.parse(localStorage.getItem(KEYS.s2) || '{}')); Object.assign(S3, JSON.parse(localStorage.getItem(KEYS.s3) || '{}')); } catch (e) {}
  let S = S1, sid = 's1';
  try { const r = JSON.parse(localStorage.getItem('notgta.rep') || 'null') || { rep: S1.rep, stats: S1.stats }; if (r.rep) Object.assign(D.rep, r.rep); if (r.stats) Object.assign(D.stats, r.stats); } catch (e) {}
  // Nur einfache Werte speichern (keine Figuren, Demos oder Mengen)
  const plain = v => { if (v === null || typeof v !== 'object') return true; if (v.isObject3D || v.members || v instanceof Set) return false; if (Array.isArray(v)) return v.every(plain); return Object.values(v).every(plain); };
  function persist() { const keep = {}; for (const k of Object.keys(S)) if (k !== 'rep' && k !== 'stats' && plain(S[k])) keep[k] = S[k]; try { localStorage.setItem(KEYS[sid], JSON.stringify(keep)); localStorage.setItem('notgta.rep', JSON.stringify({ rep: D.rep, stats: D.stats })); } catch (e) {} }

  // ---------- Anzeige: Ziel, Karte, Marker ----------
  const objEl = $('obj'); let objText = '';
  function setObj(t) { t = t || ''; if (t === objText && objSet) return; objText = t; objSet = true; if (objEl) { objEl.innerHTML = objText; objEl.style.display = objText ? 'block' : 'none'; } } // nur bei Änderung ins DOM (läuft jedes Bild)
  let objSet = false;
  X.objDirty = () => { objSet = false; }; // eulen.js leert #obj nach einem Lauf: Kapitelziel neu schreiben
  const beam = (() => { const g = new THREE.Group(); const mat = new THREE.MeshBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }); const c = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 1.6, 24, 1, true), mat); c.position.y = 0.8; const ringM = new THREE.MeshBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 0.8, depthWrite: false }); const ring = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.35, 32), ringM); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; const beamM = new THREE.MeshBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 0.13, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 70, 8, 1, true), beamM); b.position.y = 35; const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.8, 4), new THREE.MeshBasicMaterial({ color: 0xffd84a })); arrow.rotation.x = Math.PI; arrow.position.y = 3.2; g.add(c, ring, b, arrow); g.userData.arrow = arrow; g.visible = false; scene.add(g); return g; })();
  let mark = null, markObj = null, gps = null, gpsT = 0, startBeacon = null;
  function setMark(p, follow) { mark = p ? [p[0], p[1]] : null; markObj = follow || null; gps = null; gpsT = 0; }
  function markPos() { if (markObj) { if (markObj.parent !== scene && !markObj.isObject3D) return mark; return [markObj.position.x, markObj.position.z]; } return mark; }
  X.mmHooks.push((ctx, P, R) => {
    if (gps && gps.length > 1) { ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 3.5; ctx.globalAlpha = 0.85; ctx.beginPath(); gps.forEach((q, i) => { const [x, y] = P(q[0], q[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); ctx.globalAlpha = 1; }
    const m = markPos(); if (m) { let [x, y] = P(m[0], m[1]); const L = Math.hypot(x, y); if (L > R) { x *= R / L; y *= R / L; } ctx.fillStyle = '#ffd84a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill(); ctx.stroke(); }
    for (const st of Object.values(STORIES)) { if (!st.beacon || !st.beacon.visible) continue; let [x, y] = P(st.at[0], st.at[1]); const L = Math.hypot(x, y); if (L > R) { x *= R / L; y *= R / L; } ctx.fillStyle = st.color; ctx.font = 'bold 13px system-ui'; ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(st.letter, x - 4.3, y + 4.5); } });
  function updateMarker(dt) {
    if (intro) { introT -= dt; if (introT <= 0 || S.state === 'active') endIntro(); }
    const m = markPos(); beam.visible = !!m && (S.state === 'active' || intro); if (beam.visible) { const y = markObj ? markObj.position.y : TH(m[0], m[1]); beam.position.set(m[0], y, m[1]); beam.userData.arrow.position.y = 3.2 + Math.sin(performance.now() / 300) * 0.25; beam.userData.arrow.rotation.y += dt * 2; const far = Math.hypot(m[0] - player.pos.x, m[1] - player.pos.z); beam.children[2].visible = far > 25; beam.children[0].visible = beam.children[3].visible = far > 14; }
    gpsT -= dt; if (m && gpsT <= 0) { gpsT = 2.5; const far = Math.hypot(m[0] - player.pos.x, m[1] - player.pos.z); gps = far > 40 ? D.route(player.pos.x, player.pos.z, m[0], m[1]) : null; }
    const anyOn = S.state === 'active'; for (const st of Object.values(STORIES)) { const b = st.beacon; if (!b) continue; b.visible = !anyOn && !st.S.finishedAll && !X.creative.on; if (!b.visible) continue; const d = Math.hypot(st.at[0] - player.pos.x, st.at[1] - player.pos.z); if (d < 2.2 && !player.car) { useStory(st.id); if (S.state === 'done') { S.state = 'new'; S.chap = 0; } start('beacon'); break; } }
  }
  function makeBeacon(letter, colorHex, at) { const g = new THREE.Group(); const c = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 1.4, 20, 1, true), new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide })); c.position.y = 0.7; const t = canvasTex(128, 128, (ctx) => { ctx.fillStyle = '#' + colorHex.toString(16).padStart(6, '0'); ctx.beginPath(); ctx.arc(64, 64, 60, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '900 84px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(letter, 64, 70); }); const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true })); s.scale.set(1.1, 1.1, 1); s.position.y = 2.6; g.add(c, s); g.position.set(at[0], TH(at[0], at[1]), at[1]); scene.add(g); return g; }

  // ---------- Dialog ----------
  let talkQ = [], talkT = 0, talkDone = null;
  function talk(lines, then) { talkQ = lines.slice(); talkDone = then || null; talkT = 0; nextLine(); }
  function nextLine() { const l = talkQ.shift(); if (!l) { const f = talkDone; talkDone = null; if (f) f(); return; } const [who, text, sec] = l; D.sub(who, text, sec ?? Math.max(3, text.length / 15)); talkT = sec ?? Math.max(3, text.length / 15); }
  function skipLine() { if (talkT > 0) { talkT = 0; nextLine(); } }
  const busy = () => talkT > 0 || talkQ.length > 0;

  // ---------- Hilfen ----------
  let spawned = [];
  const track = o => { spawned.push(o); return o; };
  function cleanup() { X.onG = null; X.rallyLimit = 8; W.lock(null); for (const o of spawned) { if (o.isDemo) { if (!o.result) D.endDemo(o, 'faded'); continue; } if (peds.includes(o)) D.removePed(o); else if (cars.includes(o)) { if (o !== player.car) D.removeCar(o); } else { if (o.parent) o.parent.remove(o); /* Kulissen (Bühne, Plakatwand, Gitter) samt Banner-Textur freigeben (#120); Figuren und Autos haben hp und teilen ihre Vorlagen */ if (o.isObject3D && o.userData.hp === undefined) disposeHierarchy(o, { keep: x => x === adTex }); } if (o.isTarget) W.paintTargets.splice(W.paintTargets.indexOf(o.isTarget), 1); } spawned = []; kim = null; }
  function nameTag(h, text, col = '#7dff9a') { const t = canvasTex(256, 64, (ctx, w, hh) => { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(40, 8, 176, 48); ctx.fillStyle = col; ctx.font = 'bold 34px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, w / 2, 33); }); const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.scale.set(1.2, 0.3, 1); s.position.y = 2.25; s.renderOrder = 5; h.add(s); }
  let kim = null;
  function npc(model, x, z, face, name, col, o = {}) { const h = makeHuman(/woman/.test(model), { model, keepColors: !!o.keep }); if (o.top || o.hair) h.traverse(m => { if (!m.isMesh || !m.material) return; const nm = m.material.name || ''; if (o.top && /Shirt|Main|Dress|Jacket|Top/i.test(nm)) { m.material = m.material.clone(); m.material.color.setHex(o.top); } if (o.hair && /Hair/i.test(nm)) { m.material = m.material.clone(); m.material.color.setHex(o.hair); } }); if (o.student) h.scale.multiplyScalar(0.92);
    h.position.set(x, TH(x, z), z); h.rotation.y = face || 0; Object.assign(h.userData, { road: pick(X.pedRoads()), seg: 0, dir: 1, side: 1, speed: 1.4, hp: o.hp ?? 1e9, state: 'npc', t: 0, keep: true, jit: [0, 0] }); if (name) nameTag(h, name, col); scene.add(h); peds.push(h); X.shootables.push(h); return track(h); }
  function spawnKim(x, z, face) { const h = makeHuman(true, { model: 'woman_tanktop', keepColors: true }); h.traverse(o => { if (o.isMesh && /Shirt|Main/i.test(o.material.name || '')) { o.material = o.material.clone(); o.material.color.setHex(0x8a3dff); } if (o.isMesh && /Hair/i.test(o.material.name || '')) { o.material = o.material.clone(); o.material.color.setHex(0x2fbf6f); } });
    h.position.set(x, TH(x, z), z); h.rotation.y = face ?? 0; Object.assign(h.userData, { road: pick(X.pedRoads()), seg: 0, dir: 1, side: 1, speed: 1.4, hp: 1e9, state: 'npc', t: 0, keep: true, jit: [0, 0] }); nameTag(h, 'Kim'); scene.add(h); peds.push(h); X.shootables.push(h); kim = track(h); return h; }
  function npcIdle(dt) { for (const o of spawned) if (peds.includes(o) && o.userData.state === 'npc') { const u = o.userData; u.t += dt; const dx = player.pos.x - o.position.x, dz = player.pos.z - o.position.z; if (dx * dx + dz * dz < 64) o.rotation.y = X.lerpAngle(o.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 3)); o.position.y = TH(o.position.x, o.position.z) + (u.yOff || 0); if (u.mixer && !u.lod) { X.playAnim(o, 'idle'); u.mixer.update(dt); } } }
  const near = (p, r) => !!p && Math.hypot(p[0] - player.pos.x, p[1] - player.pos.z) < r;
  const adTex = canvasTex(512, 288, (ctx, w, h) => { const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0f2a22'); g.addColorStop(1, '#174d38'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#d9b45a'; ctx.fillRect(0, h - 46, w, 46); ctx.fillStyle = '#fff'; ctx.font = '900 58px system-ui'; ctx.fillText('PARKSIDE', 28, 82); ctx.fillText('TOWERS', 28, 140); ctx.font = '500 26px system-ui'; ctx.fillStyle = '#cfe8d8'; ctx.fillText('Wohnen im Grünen. Bald.', 30, 182); ctx.fillText('ab 14.900 €/m²', 30, 214);
    for (let i = 0; i < 4; i++) { ctx.fillStyle = ['#b9d8ff', '#9ec5f0', '#cfe3ff', '#a8cdf5'][i]; ctx.fillRect(330 + i * 40, 60 + i * 12, 34, 180 - i * 12); } ctx.fillStyle = '#5fbf6a'; ctx.beginPath(); ctx.arc(330, 240, 40, 0, 7); ctx.fill(); ctx.fillStyle = '#14120a'; ctx.font = '900 26px system-ui'; ctx.fillText('GOLDACH LIVING', 30, h - 14); ctx.font = '600 16px system-ui'; ctx.fillText('Living the Bornheim Dream', 300, h - 16); });
  function billboard(x, z, h) { const g = new THREE.Group(); const post = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.5, metalness: 0.6 }); for (const sx of [-1.4, 1.4]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 3.0, 0.14), post); p.position.set(sx, 1.5, 0); p.castShadow = true; g.add(p); }
    const board = new THREE.Mesh(new THREE.BoxGeometry(3.7, 2.1, 0.14), post); board.position.y = 3.1; board.castShadow = true; const face = new THREE.Mesh(new THREE.PlaneGeometry(3.55, 2.0), new THREE.MeshStandardMaterial({ map: adTex, roughness: 0.4, emissive: 0xffffff, emissiveMap: adTex, emissiveIntensity: 0.25 })); face.position.set(0, 3.1, 0.075); const back = face.clone(); back.rotation.y = Math.PI; back.position.z = -0.075; g.add(board, face, back);
    g.position.set(x, TH(x, z), z); g.rotation.y = h; scene.add(g); g.updateMatrixWorld(true); track(g); const box = new THREE.Box3().setFromObject(board).expandByScalar(0.35); const n = new V3(Math.sin(h), 0, Math.cos(h)); const tgt = { box, normal: n, obj: g, onHit: () => { if (!g.userData.hit) { g.userData.hit = true; onBillboard(g); } } }; W.paintTargets.push(tgt); g.isTarget = tgt; return g; }
  function stageAt(x, z, h) { const g = new THREE.Group(); const wood = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.8 }); const p = new THREE.Mesh(new THREE.BoxGeometry(7, 0.6, 4), wood); p.position.y = 0.3; p.castShadow = p.receiveShadow = true; g.add(p);
    const bt = canvasTex(1024, 160, (ctx, w, hh) => { ctx.fillStyle = '#0f2a22'; ctx.fillRect(0, 0, w, hh); ctx.fillStyle = '#d9b45a'; ctx.font = '900 64px system-ui'; ctx.textAlign = 'center'; ctx.fillText('GRUNDSTEINLEGUNG · PARKSIDE TOWERS', w / 2, 80); ctx.fillStyle = '#fff'; ctx.font = '600 34px system-ui'; ctx.fillText('GOLDACH LIVING – Living the Bornheim Dream', w / 2, 132); });
    const bn = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.1), new THREE.MeshStandardMaterial({ map: bt, roughness: 0.5 })); bn.position.set(0, 3.0, -1.9); g.add(bn); for (const sx of [-3.4, 3.4]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.6, 0.1), wood); st.position.set(sx, 1.8, -1.9); g.add(st); }
    const lec = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.5), new THREE.MeshStandardMaterial({ color: 0xd9b45a, roughness: 0.4, metalness: 0.4 })); lec.position.set(0, 1.15, 0.4); g.add(lec); const stone = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.8), new THREE.MeshStandardMaterial({ color: 0x9a948a })); stone.position.set(0, 0.25, 3); g.add(stone);
    g.position.set(x, TH(x, z), z); g.rotation.y = h; scene.add(g); track(g); return g; }
  function vip(x, z, h, model, name, col) { const m = makeHuman(false, { model, keepColors: true }); m.position.set(x, TH(x, z) + 0.6, z); m.rotation.y = h; Object.assign(m.userData, { road: pick(X.pedRoads()), seg: 0, dir: 1, side: 1, speed: 1.4, hp: 300, state: 'npc', t: 0, keep: true, yOff: 0.6 }); nameTag(m, name, col); scene.add(m); peds.push(m); X.shootables.push(m); return track(m); }

  // ---------- Kapitel ----------
  const CH1 = []; let CH = CH1;
  // 1 · 38 GRAD
  CH.push({ title: '38 GRAD', tag: 'Bornheim glüht. Und jemand verkauft den Park.', start() {
      world.hour = 13.5; opts.weather = 'clear'; weather.kind = 'clear';
      D.post('wetter', 'Hitzewarnung Stufe 3 für Frankfurt: bis 38 °C. Trinken Sie ausreichend.', 210); D.post('investor', 'PARKSIDE TOWERS – 120 Wohneinheiten im Grünen. Ab 14.900 €/m². Nachhaltigkeit ist unsere DNA 🌱 #LivingTheDream', 37);
      spawnKim(UHR[0], UHR[1], U0.h + Math.PI / 2);
      talk([['📱 Kim', S.flags.viaDemo ? 'Hey! Hab dich eben mit den Leuten auf der Straße gesehen. Genau so jemanden brauchen wir.' : 'Hey, bist du wach? Bei der Hitze schläft eh keiner.', 4], ['📱 Kim', 'Parkblick Immobilien will den Günthersburgpark bebauen. Luxus-Türme. Mitten in die Wiese.', 5], ['📱 Kim', 'Komm zum Uhrtürmchen auf der Berger. Ich erklär dir alles.', 4]]); },
    steps: [
      { obj: 'Triff Kim am <b>Uhrtürmchen</b>', mark: () => kim, done: () => kim && kim.position.distanceTo(player.pos) < 3.5 && !player.car },
      { enter() { talk([['Kim', 'Da bist du. Siehst du die Plakate? „Wohnen im Grünen. Bald." Bald gibt\'s hier kein Grün mehr.', 5], ['Kim', 'Die haben drei davon auf der Berger aufgestellt. Zeit für ein bisschen Farbe.', 4], ['Kim', 'Nimm die Farbbeutel. Taste 7, zielen, werfen. Und lass dich nicht von einer Streife sehen.', 5]], () => { W.give('paint', 10); W.select('paint'); });
          const pts = []; const cand = berger.filter(r => r.p.some(q => Math.hypot(q[0] - UHR[0], q[1] - UHR[1]) < 320));
          for (let k = 0; k < 60 && pts.length < 3 && cand.length; k++) { const r = pick(cand); const rp = X.randomRoadPoint(r); const dd = Math.hypot(rp.x - UHR[0], rp.z - UHR[1]); if (dd < 45 || dd > 300 || pts.some(p => Math.hypot(p[0] - rp.x, p[1] - rp.z) < 60)) continue; const sd = Math.random() < 0.5 ? 1 : -1; const off = r.w / 2 + 2.6; const x = rp.x + Math.cos(rp.heading) * sd * off, z = rp.z - Math.sin(rp.heading) * sd * off; if (solidAt(x, z) >= 0 || solidAt(x + 2, z) >= 0 || solidAt(x - 2, z) >= 0) continue; pts.push([x, z, rp.heading + (sd > 0 ? -Math.PI / 2 : Math.PI / 2)]); }
          S.boards = pts.map(p => billboard(p[0], p[1], p[2])); S.hits = 0; }, wait: true,
        obj: () => `Verschönere die <b>Investoren-Plakate</b> mit Farbbeuteln (${S.hits || 0}/${S.boards?.length || 3})`, mark: () => (S.boards || []).find(b => !b.userData.hit), done: () => S.boards && S.hits >= S.boards.length },
      { obj: 'Häng die <b>Polizei</b> ab', skip: () => player.wanted <= 0, done: () => player.wanted <= 0 },
      { obj: 'Zurück zu <b>Kim</b>', mark: () => kim, done: () => kim && kim.position.distanceTo(player.pos) < 3.5 && !player.car },
    ],
    finish(next) { talk([['Kim', 'Haha, die sehen jetzt richtig nach Bornheim aus. Schau mal aufs Handy.', 4]], () => { D.post('investor', 'Unsere Kunstwerbung wurde Opfer von Vandalismus. Wir haben Anzeige erstattet. #LivingTheDream', 61); D.post('kollektiv', 'Endlich Farbe im Grau. Wer war das? 😏 #BornheimBleibt', 1800); D.post('hilde', 'Die Plakate waren eh hässlich.', 340); D.addRep('kollektiv', 8); D.addRep('investor', -10); player.money += 150; next(); }); } });
  function onBillboard(g) { S.hits = (S.hits || 0) + 1; sfx('pickup'); showMsg('PLAKAT ' + S.hits + '/' + (S.boards?.length || 3), 900); if (S.hits === 2) { const c = cars.find(c => c.userData.mode === 'ai' && c.position.distanceTo(player.pos) < 120); D.sub('📻 Funk', 'Streife an alle: Person wirft Farbe auf der Berger Straße.', 4); raiseWanted(1, 1); } D.post(pick(['lena', 'troll', 'kollektiv']), pick(['Jemand hat die Investoren-Plakate verschönert 😂', 'Sachbeschädigung ist keine Meinung.', 'Kunst am Bau 🎨']), Math.round(rnd(60, 900))); }

  // 2 · MOBILISIEREN
  CH.push({ title: 'MOBILISIEREN', tag: 'Ein paar Plakate reichen nicht.', start() {
      if (!kim) spawnKim(UHR[0], UHR[1], 0); X.rallyLimit = 99;
      talk([['Kim', 'Wir brauchen Leute. Viele. Sprich junge Leute auf der Berger an – mit G.', 5], ['Kim', 'Wenn du acht zusammen hast, bring sie zum Günthersburgpark. Ich warte da.', 5]]); },
    steps: [
      { obj: () => `Sammle Leute: bei jungen Passanten <b>G</b> drücken (${D.followers.length}/8)`, done: () => D.followers.length >= 8 },
      { enter() { if (kim) { kim.position.set(GATE[0] + 2, TH(GATE[0] + 2, GATE[1]), GATE[1]); } }, obj: () => `Bring alle zum <b>Günthersburgpark</b> (${D.followers.length} dabei)`, mark: () => GATE, fail: () => D.followers.length < 5 ? 'back' : null, done: () => near(GATE, 14) && D.followers.length >= 5 },
    ],
    finish(next) { X.rallyLimit = 8; const fl = D.followers.slice(); for (const f of fl) { f.userData.state = 'walk'; f.userData.follow = false; } const d = D.spawnDemo({ x: GATE[0], z: GATE[1], members: fl, n: fl.length + 6, gather: true, story: true, noPolice: true, max: 30 }); S.gather = d;
      X.card('DIE WIESE FÜLLT SICH', 'Aus acht werden zwanzig.'); talk([['Kim', 'Wow. Schau dich um. Das hast du gemacht.', 4], ['Kim', 'Morgen laufen wir. Bis zum Uhrtürmchen. Mit Transparent.', 4]], () => { D.post('kollektiv', 'Treffen im Günthersburgpark! Wir sind schon über 20! #BornheimBleibt', 2400); D.post('brack', 'Ich habe Verständnis für die Sorgen der jungen Menschen. Deshalb prüft ein Arbeitskreis die Einrichtung eines Gesprächsformats.', 12); D.addRep('kollektiv', 10); W.give('smoke', 2); W.give('flare', 2); showMsg('KIM GIBT DIR RAUCHTÖPFE UND BENGALOS', 1600); next(); }); } });

  // 3 · DEMO
  function startStoryDemo(n, max, banner, blockAt) {
    let d = S.gather && !S.gather.result ? S.gather : null; S.gather = null; if (d) { d.noPolice = false; d.maxStage = 5; d.max = max; d.theme = banner; d.age = 0; } else { d = D.spawnDemo({ x: GATE[0], z: GATE[1], n, max, story: true, banner }); } d.isDemo = true; track(d);
    const r = D.route(GATE[0], GATE[1], U0.x, U0.z); if (r) { d.trail = D.trailFrom(r); d.total = d.trail[d.trail.length - 1].s; d.s = 0; } d.state = 'march'; d.blockAt = blockAt; d.story = true; d.rallyDur = 25; d.speed = 1.5;
    if (!kim) spawnKim(GATE[0], GATE[1], 0); kim.userData.state = 'demo'; kim.userData.demo = d; kim.userData.jit = [0, 0]; d.members.unshift(kim); while (d.members.length < n) { const a = rnd(0, 6.28); const [x, z] = D.freeSpot(GATE[0] + Math.cos(a) * 6, GATE[1] + Math.sin(a) * 6); const h = D.makeMember(x, z); h.userData.demo = d; d.members.push(h); }
    d.onEnd = (res) => { S.flags.demoRes = res; }; S.demo = d; S.flags.demoRes = null; return d; }
  CH.push({ title: 'DEMO', tag: 'Vom Park zur Berger Straße.', start() { const d = startStoryDemo(24, 34, 'BORNHEIM BLEIBT', 0.42);
      talk([['Kim', 'Los geht\'s! Wir laufen zum Uhrtürmchen. Bleib vorne bei mir.', 4], ['Kim', 'Wenn die Polizei Stress macht: G – „Keine Gewalt". Und film alles mit V.', 5]]); },
    steps: [
      { obj: () => { const d = S.demo; const pc = d && d.total ? Math.round(clamp(d.s / d.total, 0, 1) * 100) : 0; const far = d && Math.hypot(d.cx - player.pos.x, d.cz - player.pos.z) > 60; const st = d?.pol.stage; return far ? '<b>Zurück zur Demo!</b>' : `Lauf mit zum <b>Uhrtürmchen</b> (${pc} %)` + (st === 2 && !d.pol.lineOpened ? ' · <b>Polizeikette</b>: mit G deeskalieren' : st === 3 ? ' · <b>Kessel!</b>' : st >= 4 ? ' · <b>Wasserwerfer!</b>' : ''); }, mark: () => S.demo && !S.demo.result ? [S.demo.cx, S.demo.cz] : null, done: () => !!S.flags.demoRes },
    ],
    finish(next) { const ok = S.flags.demoRes === 'success'; S.flags.k3 = S.flags.demoRes;
      if (ok) talk([['Kim', 'Wir sind da! Hörst du das? Die ganze Berger singt!', 4], ['Kim', 'Morgen ist die Grundsteinlegung im Park. der Investor und der Bürgermeister. Ich hab da eine Idee…', 5]], () => { D.addRep('kollektiv', 10); D.addRep('anwohner', 6); next(); });
      else { if (kim) { D.removePed(kim); kim = null; } talk([['📱 Kim', 'Sie haben mich mitgenommen. Sechs Stunden Gefangenensammelstelle. Mir geht\'s gut.', 5], ['📱 Kim', 'Morgen ist die Grundsteinlegung im Park. der Investor und der Bürgermeister. Jetzt erst recht.', 5]], () => { D.addRep('kollektiv', 5); D.post('presse', 'Demo in Bornheim aufgelöst – Polizei spricht von „robuster Lage".', 3100); next(); }); } } });

  // 4 · WASSERMARSCH
  CH.push({ title: 'WASSERMARSCH', tag: 'Grundsteinlegung im Park. Mit Ehrengästen.', start() {
      world.hour = 15; const st = stageAt(SITE[0], SITE[1], SITE[2]); const fx = Math.sin(SITE[2]), fz = Math.cos(SITE[2]);
      S.vips = [vip(SITE[0] - Math.cos(SITE[2]) * 0.8, SITE[1] + Math.sin(SITE[2]) * 0.8, SITE[2], 'man_suit', 'Investor', '#ffd27a'), vip(SITE[0] + Math.cos(SITE[2]) * 1.0, SITE[1] - Math.sin(SITE[2]) * 1.0, SITE[2], 'business_man', 'Bürgermeister', '#cfcfcf')];
      for (let i = 0; i < 6; i++) { const a = (i - 2.5) * 0.9; const x = SITE[0] + fx * 6 + Math.cos(SITE[2]) * a * 1.4, z = SITE[1] + fz * 6 - Math.sin(SITE[2]) * a * 1.4; const g = makeHuman(i % 2 === 0, { model: i % 2 ? 'man_suit' : 'woman_dress' }); g.position.set(x, TH(x, z), z); g.rotation.y = SITE[2] + Math.PI; Object.assign(g.userData, { road: pick(X.pedRoads()), seg: 0, dir: 1, side: 1, speed: 1.4, hp: 100, state: 'npc', t: 0, keep: true }); scene.add(g); peds.push(g); X.shootables.push(g); track(g); }
      const guard = D.spawnSquad(new V3(SITE[0] + fx * 9, 0, SITE[1] + fz * 9)); guard.isDemo = true; track(guard);
      const c = D.spawnCannon(EIS[0], EIS[1], EIS[2], 'parked'); track(c); S.cannon = c; const g2 = D.spawnSquad(new V3(EIS[0] + 6, 0, EIS[1] + 6)); g2.isDemo = true; track(g2);
      S.soaked = new Set();
      talk([['📱 Kim', S.flags.k3 === 'success' ? 'Gestern war Wahnsinn. Heute wird\'s lustig.' : 'Nach gestern hab ich keine Lust mehr auf nett.', 4], ['📱 Kim', 'Der Investor legt gleich im Park den Grundstein. Mit dem Bürgermeister. Kameras, Sekt, alles.', 5], ['📱 Kim', 'Und weißt du, wo die Polizei ihren Wasserwerfer parkt? An der Eissporthalle. Unbewacht. Fast.', 5]]); },
    steps: [
      { obj: 'Hol dir den <b>Wasserwerfer</b> an der Eissporthalle (E)', mark: () => S.cannon, done: () => player.car === S.cannon },
      { obj: 'Fahr zur <b>Grundsteinlegung</b> im Günthersburgpark', mark: () => [SITE[0], SITE[1]], done: () => near([SITE[0], SITE[1]], 34) && player.car === S.cannon, fail: () => player.car !== S.cannon && S.cannon.userData.hp <= 0 ? 'fail' : null },
      { obj: () => `Spritz <b>den Investor und den Bürgermeister</b> von der Bühne – Linksklick (${S.soaked.size}/2)`, mark: () => S.vips.find(v => !S.soaked.has(v)), done: () => S.soaked.size >= 2 },
      { obj: 'Steig aus und <b>tauch unter</b> (Fahndung loswerden)', skip: () => player.wanted <= 0, done: () => player.wanted <= 0 },
    ],
    finish(next) { D.post('presse', 'Investor und Dezernent bei Grundsteinlegung nass gemacht – das Video geht um die Welt.', 48200); D.post('lena', 'ICH KANN NICHT MEHR 😂💦💦', 31000); D.post('brack', 'Dies war ein Angriff auf unsere Demokratie und meinen Anzug.', 410); D.post('investor', 'Wir lassen uns nicht einschüchtern. Parkside Towers kommt. Jetzt mit Pool.', 88); D.post('kollektiv', 'Das waren nicht wir. Aber 😂 Morgen: Großdemo! #BornheimBleibt', 12500);
      D.addRep('investor', -20); D.addRep('polizei', -12); D.addRep('kollektiv', 6); D.stats.reach += 4000; X.card('VIRAL', 'Halb Deutschland hat gesehen, wie der Investor vom Rednerpult gespült wird.'); setTimeout(next, 3000); } });
  X.listeners.push((ev, pos, data) => { if (ev === 'waterPed' && S.vips && S.vips.includes(data.ped)) { S.soaked.add(data.ped); sfx('pickup'); showMsg(data.ped.userData === S.vips[0].userData ? 'GOLDACH: KLATSCHNASS' : 'BRACK: KLATSCHNASS', 1200); for (const o of spawned) if (peds.includes(o) && o.userData.state === 'npc') { o.userData.state = 'flee'; o.userData.fleeT = 20; } } });

  // 5 · BORNHEIM BLEIBT
  CH.push({ title: 'BORNHEIM BLEIBT', tag: 'Heute entscheidet der Stadtrat. Ganz Bornheim ist auf der Straße.', start() { world.hour = 17.5; S.v0 = D.stats.violence; const d = startStoryDemo(36, 46, 'PARK BLEIBT · MIETE RUNTER', 0.33); d.speed = 1.4;
      D.post('presse', 'LIVE: Großdemo in Bornheim. Stadtrat entscheidet heute über Günthersburgpark.', 21000); D.post('troll', 'Geht arbeiten!!1', 40); D.post('hilde', 'Ich bin 81 und laufe heute mit. Mit Rollator. Bornheim bleibt!', 18300);
      talk([['Kim', 'So viele waren wir noch nie. Die ganze Stadt schaut zu.', 4], ['Kim', 'Egal was passiert: Wenn wir friedlich ankommen, können die uns nicht ignorieren.', 5], ['Kim', 'Und wenn\'s eskaliert – dann schreiben die Zeitungen über Chaoten, nicht über den Park. Deine Entscheidung.', 6]]); },
    steps: [
      { obj: () => { const d = S.demo; const pc = d && d.total ? Math.round(clamp(d.s / d.total, 0, 1) * 100) : 0; const far = d && Math.hypot(d.cx - player.pos.x, d.cz - player.pos.z) > 60; const st = d?.pol.stage; return far ? '<b>Zurück zur Demo!</b>' : `Großdemo zum <b>Uhrtürmchen</b> (${pc} %)` + (st === 2 && !d.pol.lineOpened ? ' · <b>Polizeikette</b>' : st === 3 ? ' · <b>Kessel!</b>' : st >= 4 ? ' · <b>Wasserwerfer!</b>' : ''); }, mark: () => S.demo && !S.demo.result ? [S.demo.cx, S.demo.cz] : null, done: () => !!S.flags.demoRes },
    ],
    finish(next) { const v = D.stats.violence - (S.v0 || 0) + D.stats.violence * 0.3; const res = S.flags.demoRes; let end;
      if (v >= 6) end = 'krawall'; else if (res === 'success') end = 'friedlich'; else end = 'kompromiss';
      S.endings = [...new Set([...(S.endings || []), end])];
      const E = { friedlich: ['ENDE: FRIEDLICH UND LAUT', 'Der Stadtrat stoppt Parkside Towers. Der Günthersburgpark bleibt.', [['presse', 'Stadtrat stoppt Bebauung im Günthersburgpark nach friedlicher Großdemo.', 61000], ['investor', 'Wir prüfen alternative Standorte. Offenbach ist auch schön. #LivingTheDream', 120], ['hilde', 'Ich hab geweint. Danke, Kinder.', 44000], ['brack', 'Ich war immer gegen dieses Projekt.', 9]]],
        krawall: ['ENDE: KRAWALL', 'Die Bilder brennen sich ein. Über den Park redet niemand mehr.', [['presse', 'Chaos in Bornheim: Krawalle überschatten Demo. Stadtrat beschleunigt Bebauung „zum Schutz der Anwohner".', 72000], ['investor', 'Danke an die Einsatzkräfte. Parkside Towers jetzt mit Sicherheitsdienst und Glasfassade 2.0.', 340], ['troll', 'Hab ich doch gesagt. Chaoten.', 2900], ['kim', 'Die haben genau die Bilder gekriegt, die sie wollten.', 5100]]],
        kompromiss: ['ENDE: KOMPROMISS', 'Ein Drittel des Parks bleibt. Dafür kommt eine Tiefgarage.', [['presse', 'Kompromiss im Stadtrat: Teilbebauung des Günthersburgparks, Erhalt der „Kernwiese".', 18000], ['brack', 'Ein guter Tag für Bornheim. Und für die Tiefgarage.', 14], ['kollektiv', 'Ein Drittel ist nicht genug. Wir kommen wieder. #BornheimBleibt', 9000], ['investor', 'Wir freuen uns über den konstruktiven Dialog.', 70]]] }[end];
      for (const [w, t, l] of E[2]) D.post(w, t, l); X.card(E[0], E[1], 7); S.flags.lastEnd = end;
      setTimeout(() => { X.card('BORNHEIM BLEIBT', 'Story 1 abgeschlossen. Story 2 „Freitag ist Pflicht" wartet am blauen S vor der Schule.', 7); next(); }, 7500); } });

  // ---------- Story 2 ----------
  const K = { X, W, D, F, talk, track, near, nameTag, npc, cleanup, nearestOn, berger, busy, get S() { return S; }, get sid() { return sid; }, places: { UHR, U0, GATE, PARKC } };
  const ST2 = story2Chapters(K); const ST3 = story3Chapters(K);
  const STORIES = { s1: { id: 's1', S: S1, CH: CH1, title: 'Bornheim bleibt', sub: 'Story 1', letter: 'B', color: '#c86bff', at: UHR, ends: { friedlich: 'Friedlich und laut', krawall: 'Krawall', kompromiss: 'Kompromiss' }, hint: 'Startet, wenn du eine Demo anführst oder mitläufst – oder am lila B am Uhrtürmchen.' },
    s2: { id: 's2', S: S2, CH: ST2.CH, title: 'Freitag ist Pflicht', sub: 'Story 2 · Schulstreik', letter: 'S', color: '#4fd6ff', at: ST2.START, ends: ST2.ends, hint: 'Startet am blauen S vor der ' + ST2.schoolName + '.' } };
  STORIES.s3 = { id: 's3', S: S3, CH: ST3.CH, title: 'Der Kanzler kommt', sub: 'Story 3 · Bürgerdialog', letter: 'K', color: '#ff8c3a', at: ST3.START, ends: ST3.ends, lock: 'all', prefix: 'KANZLER · ', hint: 'Startet am orangen K vor dem Saalbau Bornheim. Ohne Waffen: Fragen statt Fotos.' };
  STORIES.s1.lock = STORIES.s2.lock = 'protest'; STORIES.s2.prefix = 'SCHULSTREIK · ';
  STORIES.s1.beacon = makeBeacon('B', 0xc86bff, UHR); STORIES.s2.beacon = makeBeacon('S', 0x4fd6ff, ST2.START); STORIES.s3.beacon = makeBeacon('K', 0xff8c3a, ST3.START);
  function useStory(id) { if (id === sid) return; sid = id; S = STORIES[id].S; CH = STORIES[id].CH; }
  for (const id of ['s2', 's3']) if (STORIES[id].S.state === 'active' && S1.state !== 'active') useStory(id);

  // ---------- Ablauf ----------
  let stepIdx = 0, stepT = 0, failT = 0, waitT = 0, chapActive = false;
  function start(via, id) { if (id && id !== sid) { if (S.state === 'active') stop(); useStory(id); } if (S.state === 'active') return; if (S.state === 'done') { S.chap = 0; } S.state = 'active'; S.flags.viaDemo = via === 'demo'; persist(); beginChapter(S.chap || 0); }
  let begun = false;
  let doneT = null; // Aufräum-Timer nach Story-Ende: darf keine neu gestartete Story treffen
  function beginChapter(i) { begun = true; if (doneT) { clearTimeout(doneT); doneT = null; } cleanup(); S.chap = i; S.demo = null; S.flags.demoRes = null; stepIdx = -1; chapActive = false; setObj(''); setMark(null); const C = CH[i]; endIntro(); W.lock(C.weapons === 'free' ? null : (C.lock ?? STORIES[sid].lock ?? null)); X.card((STORIES[sid].prefix || '') + 'KAPITEL ' + (i + 1) + ' · ' + C.title, C.tag, 4); persist(); waitT = 2.2; }
  function nextStep() { const C = CH[S.chap]; stepIdx++; stepT = 0; failT = 0; const st = C.steps[stepIdx]; if (!st) { chapActive = false; setObj(''); setMark(null); C.finish(() => completeChapter()); return; } if (st.enter) st.enter(); }
  function completeChapter() { const i = S.chap; if (!S.done.includes(i)) S.done.push(i); if (X.saveGame) setTimeout(() => { if (!player.dead) X.saveGame(true); }, 1500); if (i + 1 < CH.length) { S.chap = i + 1; persist(); waitT = 0; setTimeout(() => { if (S.state === 'active') beginChapter(S.chap); }, 2500); } else { S.state = 'done'; S.finishedAll = true; S.chap = 0; persist(); setObj(''); setMark(null); W.lock(null); doneT = setTimeout(() => { if (S.state !== 'active') cleanup(); }, 20000); } }
  function failChapter(why) { if (!chapActive) return; chapActive = false; X.card('MISSION GESCHEITERT', why, 3.5); setObj(''); setMark(null); setTimeout(() => { const go = () => { if (S.state !== 'active') return; if (player.dead) { setTimeout(go, 1000); return; } beginChapter(S.chap); }; go(); }, 3800); }
  function stop() { if (S.state !== 'active') return; cleanup(); S.state = 'paused'; setObj(''); setMark(null); chapActive = false; X.rallyLimit = 8; persist(); showMsg('STORY PAUSIERT', 1200); }
  function update(dt) {
    if (talkT > 0) { talkT -= dt; if (talkT <= 0) nextLine(); }
    npcIdle(dt); updateMarker(dt);
    if (S.state !== 'active') return;
    if (waitT > 0) { waitT -= dt; if (waitT <= 0) { chapActive = true; CH[S.chap].start(); nextStep(); } return; }
    if (!chapActive) return; const C = CH[S.chap]; if (C.update) C.update(dt); if (!chapActive) return; const st = C.steps[stepIdx]; if (!st) return; stepT += dt;
    if (player.dead) { failChapter('Du bist umgehauen worden.'); return; }
    if (st.skip && st.skip() && !busy()) { nextStep(); return; }
    const txt = typeof st.obj === 'function' ? st.obj() : st.obj; if (!busy() || stepIdx > 0) setObj(txt); const mk = st.mark ? st.mark() : null; if (mk && mk.isObject3D) setMarkObj(mk); else if (mk) { if (!mark || markObj || Math.hypot(mk[0] - mark[0], mk[1] - mark[1]) > 30) setMark(mk); else { mark = [mk[0], mk[1]]; } } else setMark(null);
    if (st.fail) { const f = st.fail(); if (f === 'back') { stepIdx -= 2; nextStep(); return; } if (f) { failChapter(f === 'fail' ? 'Das ging schief.' : f); return; } }
    if (!busy() && st.done()) nextStep();
  }
  function setMarkObj(o) { if (markObj !== o) { markObj = o; mark = [o.position.x, o.position.z]; gps = null; gpsT = 0; } else mark = [o.position.x, o.position.z]; }
  X.listeners.push((ev) => { if (ev === 'busted' && S.state === 'active' && chapActive) failChapter('Du wurdest festgenommen.');
        // Demo gebildet oder beigetreten: Story 1 nicht mehr ungefragt starten (das sperrte mitten im Spiel die Waffen), nur einmal hinweisen und den Weg zeigen
    if ((ev === 'demoFormed' || ev === 'joinedDemo') && S.state !== 'active' && !S1.finishedAll && !S1.declined && !S1.done.length && !S1.hinted) { S1.hinted = true; persist(); X.card('STORY 1 · BORNHEIM BLEIBT', 'Esc › Story wählen – oder zum lila B am Uhrtürmchen (gelber Strahl)', 6); if (!intro) { intro = true; introT = 180; setMark(UHR); setObj('Zur <b>Story</b>: dem gelben Strahl zum lila <b>B</b> folgen · oder Esc › Story wählen'); } } });

  // ---------- Menü ----------
  function renderMenu() { const el = $('storypane'); if (!el) return; const R = D.rep; const bar = (k, n) => `<div class="rep"><span>${n}</span><i><b style="width:${50 + R[k] / 2}%;background:${R[k] >= 0 ? '#62d26f' : '#e05050'}"></b></i><em>${R[k] > 0 ? '+' : ''}${Math.round(R[k])}</em></div>`;
    const block = st => { const Q = st.S, on = Q.state === 'active' && sid === st.id; return `<h3 style="margin-top:10px">${st.title} <small>${st.sub}</small></h3><p>${on ? 'Kapitel ' + (Q.chap + 1) + ' von ' + st.CH.length + ': <b>' + st.CH[Q.chap].title + '</b>' : Q.finishedAll ? 'Abgeschlossen. Enden: ' + (Q.endings || []).map(e => st.ends[e] || e).join(', ') : Q.state === 'paused' ? 'Pausiert in Kapitel ' + ((Q.chap || 0) + 1) : st.hint}</p>
      <div class="row2"><button data-go="${st.id}">${on ? 'Kapitel neu starten' : Q.state === 'paused' ? 'Fortsetzen' : Q.finishedAll ? 'Noch einmal spielen' : 'Story starten'}</button>${on ? `<button data-stop="${st.id}">Pausieren (freies Spiel)</button>` : ''}</div>
      <div class="chaps">${st.CH.map((c, i) => `<button data-sid="${st.id}" data-ch="${i}" ${Q.done.includes(i) || i <= (Q.chap || 0) ? '' : 'disabled'}>${i + 1}. ${c.title}${Q.done.includes(i) ? ' ✓' : ''}</button>`).join('')}</div>`; };
    el.innerHTML = `<div class="story">${Object.values(STORIES).map(block).join('')}<h3 style="margin-top:14px">Ruf</h3>${bar('kollektiv', 'Bewegung')}${bar('polizei', 'Polizei')}${bar('anwohner', 'Anwohner')}${bar('investor', 'Investor')}<p style="opacity:.7;font-size:12px">Reichweite ${D.stats.reach.toLocaleString('de')} · gefilmte Clips ${D.stats.filmed}</p></div>`;
    // @ts-ignore -- Baseline #119: DOM-/Zahl-String-Typen, kein X-Fehler
    for (const b of el.querySelectorAll('[data-go]')) b.onclick = () => { const id = b.dataset.go; if (S.state === 'active' && sid === id) beginChapter(S.chap); else { if (S.state === 'active') stop(); useStory(id); if (S.finishedAll) { S.finishedAll = false; S.state = 'new'; S.chap = 0; S.done = []; } S.declined = false; start('menu'); } X.closeMenu(); };
    // @ts-ignore -- Baseline #119: DOM-/Zahl-String-Typen, kein X-Fehler
    for (const b of el.querySelectorAll('[data-stop]')) b.onclick = () => { stop(); S.declined = true; persist(); renderMenu(); };
    // @ts-ignore -- Baseline #119: DOM-/Zahl-String-Typen, kein X-Fehler
    for (const b of el.querySelectorAll('[data-ch]')) b.onclick = () => { const id = b.dataset.sid, i = +b.dataset.ch; if (S.state === 'active' && sid !== id) stop(); useStory(id); S.state = 'active'; S.declined = false; beginChapter(i); X.closeMenu(); }; }
  X.menuHooks.push(renderMenu);
  // Nach dem Laden: aktive Story setzt das Kapitel fort
  function resume() { if (S.state === 'active' && !begun) { beginChapter(S.chap || 0); return; } startIntro(); }
  // Einstieg für neue Spieler: Wegweiser zur ersten Story, solange noch keine begonnen wurde (höchstens drei Spielstarts lang)
  let intro = false, introT = 0;
  // @ts-ignore -- Baseline #119: DOM-/Zahl-String-Typen, kein X-Fehler
  function startIntro() { if (S.state === 'active') return; const none = Object.values(STORIES).every(st => st.S.state === 'new' && !st.S.done.length && !st.S.finishedAll); let seen = 0; try { seen = +localStorage.getItem('notgta.introSeen') || 0; } catch (e) {} if (!none || seen >= 3) return; try { localStorage.setItem('notgta.introSeen', seen + 1); } catch (e) {}
    intro = true; introT = 240; setMark(UHR); setObj('Willkommen! Für die <b>Story</b> folge der gelben Linie zum lila <b>B</b> am Uhrtürmchen · oder Esc › Story wählen'); X.card('BORNHEIM', 'Freies Spiel – oder zur Story: dem gelben Strahl folgen', 5); }
  function endIntro() { if (!intro) return; intro = false; setMark(null); setObj(''); }

  return { update, start, stop, resume, skipLine, renderMenu, get S() { return S; }, get CH() { return CH; }, get sid() { return sid; }, useStory, STORIES, ST2, persist, get busy() { return S.state === 'active'; }, places: { UHR, GATE, SITE, EIS, PARKC, ...ST2.places, ...ST3.places }, beginChapter, get kim() { return kim; } };
}

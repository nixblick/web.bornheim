// Demos, Polizei-Eskalation, Wasserwerfer, Social-Feed und Ruf. Alle Namen, Accounts und Firmen sind erfunden.
export function initDemo(X, W) {
  const { THREE, scene, camera, player, peds, cars, shootables, keys, camYaw, camPitch, opts, world, CITY, TH, floorAt, solidAt, moveWithCollision, makeHuman, makeCar, playAnim, animateWalk, sfx, SND, showMsg, raiseWanted, camShake, canvasTex, rnd, clamp, pick, lerpAngle, driveCar, carFx, carTerrain, distSegSq } = X;
  const V3 = THREE.Vector3; const $ = id => document.getElementById(id);
  const emit = (ev, pos, data) => { for (const f of X.listeners) f(ev, pos, data || {}); };

  // ---------- Wegenetz für Demozüge (Dijkstra über die Straßen) ----------
  const NODES = new Map(); const nk = (x, z) => Math.round(x * 2) + ',' + Math.round(z * 2);
  function addRoads(list) { for (const r of list) { if (r.mw || r.ry) continue; const cost = r.w >= 8 ? 1 : r.w >= 6 ? 1.15 : 1.6;
    for (let i = 0; i < r.p.length - 1; i++) { const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const ka = nk(ax, az), kb = nk(bx, bz); if (ka === kb) continue; if (!NODES.has(ka)) NODES.set(ka, { x: ax, z: az, e: [] }); if (!NODES.has(kb)) NODES.set(kb, { x: bx, z: bz, e: [] }); const L = Math.hypot(bx - ax, bz - az) * cost; const ea = NODES.get(ka).e; if (ea.some(e => e[0] === kb)) continue; /* Kachel neu geladen: keine doppelten Kanten */ ea.push([kb, L]); NODES.get(kb).e.push([ka, L]); } } }
  addRoads(CITY.roads);
  function nearestNode(x, z) { let best = 1e18, bk = null; for (const [k, n] of NODES) { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < best && n.e.length) { best = d; bk = k; } } return bk; }
  function route(ax, az, bx, bz) {
    const s = nearestNode(ax, az), t = nearestNode(bx, bz); if (!s || !t) return null; const dist = new Map([[s, 0]]), prev = new Map(); const heap = [[0, s]]; const done = new Set();
    const push = (it) => { heap.push(it); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    while (heap.length) { const [d, k] = pop(); if (done.has(k)) continue; done.add(k); if (k === t) break; for (const [k2, L] of NODES.get(k).e) { const nd = d + L; if (nd < (dist.get(k2) ?? 1e18)) { dist.set(k2, nd); prev.set(k2, k); push([nd, k2]); } } }
    if (!done.has(t)) return null; const out = []; let k = t; while (k) { const n = NODES.get(k); out.push([n.x, n.z]); k = prev.get(k); } out.reverse(); return out;
  }
  function trailFrom(pts) { const tr = []; let s = 0; for (let i = 0; i < pts.length; i++) { if (i) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (i && s - tr[tr.length - 1].s < 0.3) continue; tr.push({ x: pts[i][0], z: pts[i][1], s }); } return tr; }
  function posAt(tr, s) { if (!tr.length) return { x: 0, z: 0, h: 0 }; if (s <= tr[0].s) { const b = tr[1] || tr[0]; return { x: tr[0].x, z: tr[0].z, h: Math.atan2(b.x - tr[0].x, b.z - tr[0].z) }; } const n = tr.length - 1; if (s >= tr[n].s) { const a = tr[n - 1] || tr[n]; return { x: tr[n].x, z: tr[n].z, h: Math.atan2(tr[n].x - a.x, tr[n].z - a.z) }; }
    let lo = 0, hi = n; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tr[m].s <= s) lo = m; else hi = m; } const a = tr[lo], b = tr[hi], t = (s - a.s) / ((b.s - a.s) || 1); return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, h: Math.atan2(b.x - a.x, b.z - a.z) }; }

  // ---------- Feed, Ruf, Reichweite ----------
  const HANDLES = { feuerwehr: ['@Feuerwehr_Ost', '#ff6b5b'], rettung: ['@Rettung_FFM', '#ff5252'], selin: ['@selin_streikt', '#7de0ff'], mo: ['@mo_macht_laerm', '#ffb35b'], schule: ['@Schulleitung_HGS', '#cfcfcf'], kurier: ['@KlartextKurier', '#ff5050'], eltern: ['@Elternrat_HGS', '#e2c4ff'], adler: ['@herr_adler', '#b6f08a'], kollektiv: ['@bornheimbleibt', '#7dff9a'], kim: ['@kim_kollektiv', '#7dff9a'], polizei: ['@PraesidiumOst', '#8fb8ff'], investor: ['@ParkblickImmo', '#ffd27a'], presse: ['@Stadtfunk61', '#ff9090'], hilde: ['@hilde_vom_kiez', '#e2c4ff'], lena: ['@lenas_life', '#ff9ad5'], brack: ['@Buergermeister', '#cfcfcf'], troll: ['@MeinungMitMut', '#9a9a9a'], wetter: ['@Wetterwarte_Main', '#9fe0ff'], du: [null, '#ffd84a'] };
  const myHandle = () => player.female ? '@kiezheldin' : '@kiezheld';
  const feed = []; const feedEl = $('feed');
  function post(who, text, likes) { const h = HANDLES[who] || [who, '#ddd']; feed.unshift({ name: h[0] || myHandle(), col: h[1], text, t: 0, likes: likes ?? Math.round(rnd(12, 900)) }); if (feed.length > 4) feed.pop(); renderFeed(); sfx('notify', 0.35); }
  function renderFeed() { if (!feedEl) return; feedEl.innerHTML = feed.map(f => `<div style="opacity:${f.t > 22 ? Math.max(0, 1 - (f.t - 22) / 4) : 1}"><b style="color:${f.col}">${f.name}</b> ${f.text}<i>♥ ${f.likes}</i></div>`).join(''); }
  const rep = { kollektiv: 0, polizei: 0, anwohner: 0, investor: 0 }; const stats = { reach: 140, violence: 0, peaceful: 0, filmed: 0 };
  function addRep(k, v) { rep[k] = clamp(Math.round((rep[k] + v) * 10) / 10, -100, 100); }

  // ---------- Schilder und Transparente ----------
  const SLOGANS = ['Es gibt keinen Planet B', 'Miete runter – Bäume rauf', 'Park statt Penthouse', '38 °C und ihr baut Glas?', 'Wohnen ist kein Luxus', 'Wir sind die Hitze', 'Lieber Schatten als Rendite', 'Unsere Zukunft ist kein Investment', 'Luxustürme? Nein danke', 'Erst die Bäume, dann wir?', '1,5 Grad statt 25 €/m²', 'Oma gegen Abriss', 'Die Erde kocht – ihr kassiert', 'Hitzefrei für alle'];
  const SCHOOL_SLOGANS = ['34 Grad im Klassenraum', 'Bildung statt Bonzen', 'Freitag ist Pflicht', 'Unsere Turnhalle ist seit 2 Jahren zu', 'Verweis? Gern geschehen', 'Saniert die Schulen, nicht die Banken', 'Ich schwänze für eure Enkel', 'Klimakrise ist auch Schulstoff', 'Mehr Lehrer, weniger Polizei', 'Wir sind nicht leise'];
  // Friedliche Themen-Demos, oft von Schüler:innen (André 12.11.2026): eigenes Transparent, eigene Schilder und Sprechchöre.
  // Polizei begleitet nur (maxStage 1), greift nie an, kein schwarzer Block.
  const THEMEN = [
    { b: 'FRIDAYS FOR FUTURE', st: 1, s: ['There is no Planet B', 'Klimaschutz jetzt!', 'Schule schwänzen fürs Klima', 'Ihr habt es versaut', '1,5 Grad!'], c: ['Wir sind hier, wir sind laut, weil ihr uns die Zukunft klaut!', 'Hoch die Hände, Klimawende!', 'What do we want? Climate justice!'] },
    { b: 'KLIMASTREIK', st: 0, s: ['Klimastreik!', 'Kohle stoppen', 'Bus und Bahn für alle', 'Klimagerechtigkeit'], c: ['Hoch die Hände, Klimawende!', 'Wir streiken, bis ihr handelt!', 'Klimaschutz statt Kohleschmutz!'] },
    { b: 'SCHULEN SANIEREN – JETZT!', st: 1, s: ['Unser Klo ist seit Monaten kaputt', 'Saniert die Schulen, nicht die Banken', '34 Grad im Klassenraum', 'Schimmel ist kein Lehrplan'], c: ['Bildung ist kein Luxus!', 'Saniert die Schulen, jetzt!', 'Wir lernen hier, nicht im Ruin!'] },
    { b: 'MARODE TURNHALLEN? NICHT MIT UNS!', st: 1, s: ['Unsere Turnhalle ist seit 2 Jahren zu', 'Sport braucht Hallen', 'Turnhalle statt Ruine', 'Wir wollen Sport!'], c: ['Wir wollen Sport! Gebt uns die Halle!', 'Turnhalle auf, Schule rauf!'] },
    { b: 'FÜR UNSEREN BÜRGERMEISTER', st: 0, s: ['Danke, Bürgermeister!', 'Frankfurt hält zusammen', 'Gemeinsam für die Stadt', 'Weiter so!'], c: ['Frankfurt, wir sind dabei!', 'Gemeinsam für unsere Stadt!'] },
    { b: 'AUTOFREIE INNENSTADT', st: 0, s: ['Straßen für Menschen', 'Platz da!', 'Rad statt Stau', 'Zeil autofrei', 'Kinder statt Karren'], c: ['Wem gehört die Stadt? Uns gehört die Stadt!', 'Platz für Menschen, nicht für Blech!'] },
    { b: 'GEGEN NAZIS', st: 1, s: ['Nazis raus!', 'Nie wieder ist jetzt', 'Kein Platz für Nazis', 'Frankfurt bleibt bunt'], c: ['Nie wieder Faschismus!', 'Alerta, alerta, antifascista!', 'Nazis raus!'] },
    { b: 'GEGEN DIE AFD', st: 0, s: ['AfD ist keine Alternative', 'Hass ist keine Meinung', 'Nicht mit uns', 'Brandmauer halten'], c: ['Ganz Frankfurt hasst die AfD!', 'Nie wieder ist jetzt!'] },
    { b: 'FÜR DEMOKRATIE', st: 0, s: ['Demokratie verteidigen', 'Wir sind die Brandmauer', 'Vielfalt statt Einfalt', 'Grundgesetz Art. 1'], c: ['Wir sind mehr!', 'Demokratie, wir sind dabei!', 'Hand in Hand für Demokratie!'] },
    { b: 'GEGEN RASSISMUS', st: 1, s: ['Kein Mensch ist illegal', 'Rassismus tötet', 'Wir sind alle Frankfurt', 'Say their names'], c: ['Say it loud, say it clear, refugees are welcome here!', 'Gegen Rassismus, für Solidarität!'] },
  ];
  const BANNERS = ['BORNHEIM BLEIBT', 'PARK BLEIBT · MIETE RUNTER', 'KLIMA GERECHT · WOHNEN FÜR ALLE'];
  const texCache = {};
  function signTex(text, bg) { const key = text + bg; if (texCache[key]) return texCache[key]; const t = canvasTex(256, 168, (ctx, w, h) => { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#00000022'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, w - 6, h - 6); ctx.fillStyle = bg === '#202020' ? '#ffe14d' : '#1a1a1a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const words = text.split(' '); const lines = []; let line = ''; ctx.font = '900 34px system-ui, sans-serif'; for (const wd of words) { const tst = line ? line + ' ' + wd : wd; if (ctx.measureText(tst).width > 228 && line) { lines.push(line); line = wd; } else line = tst; } lines.push(line);
      const fs = lines.length > 3 ? 28 : 34; ctx.font = `900 ${fs}px system-ui, sans-serif`; lines.forEach((l, i) => ctx.fillText(l.toUpperCase(), w / 2, h / 2 + (i - (lines.length - 1) / 2) * fs * 1.08)); }); texCache[key] = t; return t; }
  const stickMat = new THREE.MeshLambertMaterial({ color: 0x8a6a45 }); const signGeo = new THREE.PlaneGeometry(0.78, 0.52), stickGeo = new THREE.BoxGeometry(0.03, 1.15, 0.03);
  function addSign(h, text) { const g = new THREE.Group(); const st = new THREE.Mesh(stickGeo, stickMat); st.position.y = 1.75; g.add(st); const m = new THREE.MeshLambertMaterial({ map: signTex(text || pick(SLOGANS), pick(['#f2ead8', '#ffe14d', '#b6f08a', '#ffffff', '#ffb0c8', '#202020'])) });
    const a = new THREE.Mesh(signGeo, m); a.position.set(0, 2.42, 0.02); const b = new THREE.Mesh(signGeo, m); b.position.set(0, 2.42, -0.02); b.rotation.y = Math.PI; g.add(a, b); g.position.set(0.22, 0, 0.12); h.add(g); h.userData.sign = g; }
  function bannerMesh(text) { const t = canvasTex(1024, 128, (ctx, w, h) => { ctx.fillStyle = '#f4efe2'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#c81e3a'; ctx.fillRect(0, 0, w, 14); ctx.fillRect(0, h - 14, w, 14); ctx.fillStyle = '#151515'; ctx.font = '900 76px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, w / 2, h / 2 + 4); });
    const m = new THREE.MeshLambertMaterial({ map: t, side: THREE.FrontSide }); const g = new THREE.Group(); const a = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.85), m); const b = a.clone(); b.rotation.y = Math.PI; g.add(a, b); scene.add(g); return g; }

  // ---------- Figuren ----------
  const YOUNG = ['woman_casual', 'woman_tanktop', 'woman_jacket', 'man', 'hero_man', 'hero_woman'].filter(n => X.CHAR[n]);
  const pedRoads = () => X.pedRoads();
  function blackClothes(h) { h.traverse(o => { if (o.isMesh && /Shirt|Pants|Jacket|LightJacket|Dress|Hoodie|Main/i.test(o.material.name || '')) { o.material = o.material.clone(); o.material.color.setHex(0x151515); } }); }
  function makeMember(x, z, opt = {}) {
    const name = opt.model || pick(YOUNG); const h = makeHuman(/woman/.test(name), { model: name }); h.position.set(x, TH(x, z), z);
    Object.assign(h.userData, { road: pick(pedRoads()), seg: 0, dir: 1, side: 1, speed: 1.4, hp: 100, state: 'demo', t: Math.random() * 10, young: true, jit: [rnd(-0.35, 0.35), rnd(-0.4, 0.4)] });
    if (opt.student) { h.scale.multiplyScalar(rnd(0.86, 0.94)); const bp = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.34, 0.13), new THREE.MeshLambertMaterial({ color: pick([0xd83a3a, 0x2d6fd8, 0x2fbf6f, 0x222222, 0xf2c418, 0x9b4f96]) })); bp.position.set(0, 1.22, -0.17); h.add(bp); h.userData.student = true; }
    if (opt.black) { blackClothes(h); h.userData.black = true; } else if (Math.random() < (opt.signs ?? 0.42)) addSign(h, opt.slogans && Math.random() < 0.85 ? pick(opt.slogans) : opt.student && Math.random() < 0.7 ? pick(SCHOOL_SLOGANS) : null);
    scene.add(h); peds.push(h); shootables.push(h); return h; }
  const batonGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.62, 8); batonGeo.rotateX(Math.PI / 2); batonGeo.translate(0, 0, -0.22); const batonMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
  const shieldMat = new THREE.MeshStandardMaterial({ color: 0xbfd4e6, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.55 }); const shieldGeo = new THREE.BoxGeometry(0.6, 1.05, 0.04);
  function makeCop(x, z, opt = {}) {
    const h = makeHuman(false, { model: 'swat', keepColors: true, top: 0x1f3a6b, pants: 0x1a2e52, style: 'jacket', hair: 'cap' }); h.position.set(x, TH(x, z), z);
    const bt = new THREE.Mesh(batonGeo, batonMat); h.userData.hand.add(bt); h.userData.baton = bt;
    if (opt.shield !== false && Math.random() < 0.6) { const s = new THREE.Mesh(shieldGeo, shieldMat); s.position.set(-0.32, 1.1, 0.38); s.rotation.y = 0.15; h.add(s); h.userData.shield = s; }
    Object.assign(h.userData, { road: pick(pedRoads()), seg: 0, dir: 1, side: 1, speed: 3.2, hp: 120, state: 'riot', t: Math.random() * 10, cop: true, riot: true, task: 'escort', tx: x, tz: z, face: 0, grab: 0, sprayT: rnd(3, 8), hitT: 0 });
    scene.add(h); peds.push(h); shootables.push(h); return h; }
  function removePed(h) { h.traverse(o => { if (o.isSprite && o.material && o.material.map && o.material.map.isCanvasTexture) { o.material.map.dispose(); o.material.dispose(); } }); /* Namensschilder-Texturen freigeben */ X.freeSkel(h); scene.remove(h); const i = peds.indexOf(h); if (i >= 0) peds.splice(i, 1); const j = shootables.indexOf(h); if (j >= 0) shootables.splice(j, 1); }
  function addCar(c) { scene.add(c); cars.push(c); shootables.push(c); return c; }
  function removeCar(c) { if (X.disposeCar) X.disposeCar(c); scene.remove(c); const i = cars.indexOf(c); if (i >= 0) cars.splice(i, 1); const j = shootables.indexOf(c); if (j >= 0) shootables.splice(j, 1); }
  function freeSpot(x, z, r = 2) { if (solidAt(x, z) < 0) return [x, z]; for (let k = 1; k < 12; k++) { const a = k * 2.4, d = r * k * 0.5; const qx = x + Math.cos(a) * d, qz = z + Math.sin(a) * d; if (solidAt(qx, qz) < 0) return [qx, qz]; } for (let d = 4; d <= 30; d += 2) for (let a = 0; a < 6.283; a += 1.8 / d) { const qx = x + Math.cos(a) * d, qz = z + Math.sin(a) * d; if (solidAt(qx, qz) < 0) return [qx, qz]; } /* große Gebäude: weiter außen suchen statt im Haus zu bleiben */ return [x, z]; }

  // ---------- Wasserwerfer ----------
  const MS = (c, r = 0.5, m = 0.2) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const wwText = canvasTex(512, 96, (ctx, w, h) => { ctx.fillStyle = '#e8ecef'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#1d4f9e'; ctx.font = '900 64px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('POLIZEI', w / 2, h / 2 + 3); });
  const fwText = canvasTex(512, 96, (ctx, w, h) => { ctx.fillStyle = '#c8102e'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#ffffff'; ctx.font = '900 60px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('FEUERWEHR', w / 2, h / 2 + 3); });
  function makeCannon(look = 'police') { const fire = look === 'fire'; const TXT = fire ? fwText : wwText;
    const g = new THREE.Group(); const body = new THREE.Group(); g.add(body); const white = MS(fire ? 0xc8102e : 0xe8ecef), blue = MS(fire ? 0xf2f2f2 : 0x1d4f9e), dark = MS(0x1a1c20, 0.8), glass = MS(0x1a2633, 0.1, 0.7);
    const bx = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; body.add(o); return o; };
    bx(2.4, 0.5, 7.4, dark, 0, 0.8, 0); bx(2.5, 1.8, 2.0, white, 0, 2.0, 2.75); bx(2.32, 0.8, 0.06, glass, 0, 2.35, 3.76); bx(2.52, 0.6, 0.8, glass, 0, 2.35, 2.95);
    bx(2.5, 2.3, 5.0, white, 0, 2.2, -1.05); bx(2.54, 0.34, 7.0, blue, 0, 1.45, 0.2); bx(2.0, 0.12, 4.6, MS(0x9aa3ab, 0.6, 0.5), 0, 3.4, -1.1);
    for (const sx of [-1, 1]) { const t = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.65), new THREE.MeshLambertMaterial({ map: TXT })); t.position.set(sx * 1.265, 2.6, -1.0); t.rotation.y = sx * Math.PI / 2; body.add(t); }
    const grill = bx(2.2, 0.5, 0.05, dark, 0, 1.3, 3.77); grill.castShadow = false;
    // Heck: Tür, Leiter, Rundumleuchte, Schriftzug
    { const t = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.5), new THREE.MeshLambertMaterial({ map: TXT })); t.position.set(0, 2.9, -3.56); t.rotation.y = Math.PI; body.add(t); const t2 = t.clone(); t2.position.set(0, 3.15, 3.76); t2.rotation.y = 0; t2.scale.set(0.8, 0.8, 1); body.add(t2); }
    bx(1.0, 1.6, 0.04, MS(0xcfd5da, 0.5, 0.3), -0.55, 1.9, -3.57); bx(0.05, 0.05, 0.04, dark, -0.15, 1.9, -3.6); bx(2.52, 0.3, 0.06, blue, 0, 1.45, -3.56);
    for (const y of [1.2, 1.55, 1.9, 2.25, 2.6, 2.95]) bx(0.5, 0.04, 0.06, MS(0x8a9097, 0.4, 0.7), 0.75, y, -3.62); bx(0.04, 2.0, 0.06, MS(0x8a9097, 0.4, 0.7), 0.52, 2.05, -3.62); bx(0.04, 2.0, 0.06, MS(0x8a9097, 0.4, 0.7), 0.98, 2.05, -3.62);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.22), new THREE.MeshBasicMaterial({ color: 0x3b7bff })); bar2.position.set(0, 3.42, -3.3); body.add(bar2);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xfff6dd, emissive: 0x000000 }); bx(0.4, 0.2, 0.05, headMat, -0.85, 1.3, 3.79); bx(0.4, 0.2, 0.05, headMat, 0.85, 1.3, 3.79);
    const tlMat = new THREE.MeshBasicMaterial({ color: 0x8a1010 }); bx(0.3, 0.2, 0.05, tlMat, -1.0, 1.1, -3.72); bx(0.3, 0.2, 0.05, tlMat, 1.0, 1.1, -3.72);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.14, 0.28), new THREE.MeshBasicMaterial({ color: 0x3b7bff })); bar.position.set(0, 2.98, 3.3); body.add(bar);
    const turret = new THREE.Group(); turret.position.set(0, 3.0, 2.3); body.add(turret); const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.45, 0.35, 14), MS(0x2d3238, 0.5, 0.5)); tb.position.y = 0.17; turret.add(tb);
    const pitch = new THREE.Group(); pitch.position.y = 0.42; turret.add(pitch); const nz = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 1.5, 10), MS(0x2d3238, 0.4, 0.7)); nz.rotation.x = Math.PI / 2; nz.position.z = 0.7; pitch.add(nz); const muzzle = new THREE.Object3D(); muzzle.position.z = 1.48; pitch.add(muzzle);
    const wheels = []; const wg = new THREE.CylinderGeometry(0.55, 0.55, 0.42, 16); wg.rotateZ(Math.PI / 2); const wm = MS(0x161616, 0.9, 0);
    for (const z of [2.5, -1.3, -2.6]) for (const x of [-1.08, 1.08]) { const piv = new THREE.Group(); piv.position.set(x, 0.55, z); piv.userData.wheel = true; const w = new THREE.Mesh(wg, wm); w.castShadow = true; piv.add(w); body.add(piv); wheels.push(piv); }
    const cone = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 10), new THREE.MeshBasicMaterial({ map: X.coneTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); cone.rotation.x = -Math.PI / 2; cone.position.set(0, 0.08, 9); cone.visible = false; g.add(cone);
    g.userData = { speed: 0, heading: 0, hp: 450, police: true, driver: null, mode: 'parked', bar, wheels, tlMat, cone, type: fire ? 'firetruck' : 'cannon', fireTruck: fire, blMat: null, heads: [headMat], bodyMats: [], dims: { w: 2.5, h: 3.1, l: 7.6 }, maxS: 17, turret, pitch, muzzle, cannon: true, tank: 100, spraying: false, burstT: 0 };
    return g; }
  // Strahl: ein Punktwolken-Mesh, Treffer werden entlang der Flugbahn gesucht
  const JN = 420; const jPos = new Float32Array(JN * 3), jVel = new Float32Array(JN * 3), jLife = new Float32Array(JN); let jI = 0;
  const jGeo = new THREE.BufferGeometry(); jGeo.setAttribute('position', new THREE.BufferAttribute(jPos, 3)); const jet = new THREE.Points(jGeo, new THREE.PointsMaterial({ color: 0xeaf4ff, size: 0.55, transparent: true, opacity: 0.62, depthWrite: false })); jet.frustumCulled = false; scene.add(jet);
  for (let i = 0; i < JN; i++) jPos[i * 3 + 1] = -999;
  let jetSnd = null; function jetSound(on, vol) { if (!SND.ctx) return; if (!jetSnd) { const C = SND.ctx; const src = C.createBufferSource(); src.buffer = SND.noise; src.loop = true; const f = C.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 0.5; const g = C.createGain(); g.gain.value = 0; src.connect(f); f.connect(g); g.connect(SND.master); src.start(); jetSnd = g; } jetSnd.gain.setTargetAtTime(on ? vol : 0, SND.ctx.currentTime, 0.08); }
  function cannonSpray(c, dt, aim) {
    const u = c.userData; if (u.tank <= 0) { u.spraying = false; return; } u.spraying = true; u.tank = Math.max(0, u.tank - dt * 3.2);
    c.updateMatrixWorld(true); const o = new V3(); u.muzzle.getWorldPosition(o); const d = new V3(0, 0, 1).applyQuaternion(u.muzzle.getWorldQuaternion(new THREE.Quaternion())).normalize(); const sp = 27;
    if (Math.random() < 0.5) W.puff(o.clone().addScaledVector(d, rnd(2, 9)), 0xf2f8ff, 0.5, 0.6, d.clone().multiplyScalar(rnd(10, 18)), 2.2, 0.35); for (let k = 0; k < 14; k++) { const i = jI = (jI + 1) % JN; jPos[i * 3] = o.x; jPos[i * 3 + 1] = o.y; jPos[i * 3 + 2] = o.z; jVel[i * 3] = d.x * sp + rnd(-0.8, 0.8); jVel[i * 3 + 1] = d.y * sp + rnd(-0.6, 0.6); jVel[i * 3 + 2] = d.z * sp + rnd(-0.8, 0.8); jLife[i] = 1.6; }
    // Treffer entlang der Bahn
    for (let t = 0.05; t < 1.5; t += 0.06) { const px = o.x + d.x * sp * t, py = o.y + d.y * sp * t - 4.9 * t * t, pz = o.z + d.z * sp * t; const gy = TH(px, pz); if (X.douse && py < gy + 3.5) X.douse(px, py, pz, dt * 0.09); if (py < gy || solidAt(px, pz) >= 0) { if (Math.random() < 0.3) W.puff(new V3(px, Math.max(py, gy) + 0.3, pz), 0xeef6ff, 0.8, 0.8, new V3(rnd(-2, 2), rnd(1, 3), rnd(-2, 2)), 2.5, 0.55); break; }
      for (const p of peds) { const pu = p.userData; if (pu.state === 'dead' || pu === u.crew) continue; const dx = p.position.x - px, dz = p.position.z - pz; if (dx * dx + dz * dz > 1.7 || py < p.position.y - 0.2 || py > p.position.y + 2.3) continue; if (pu.cop && c !== player.car) continue;
        moveWithCollision(p.position, d.x * 7 * dt, d.z * 7 * dt, 0.3); if (pu.state !== 'stunned' && pu.state !== 'arrested') { W.stun(p, 'water', rnd(2.2, 3.4)); pu.prevState = pu.cop ? pu.prevState : 'flee'; if (pu.demo) leaveDemo(p); if (c === player.car) { if (pu.cop) raiseWanted(0.5); emit(pu.cop ? 'waterCop' : 'waterPed', p.position, { ped: p }); } } }
      if (c !== player.car && !player.car) { const dx = player.pos.x - px, dz = player.pos.z - pz; if (dx * dx + dz * dz < 1.8 && py > player.pos.y - 0.2 && py < player.pos.y + 2.2) { moveWithCollision(player.pos, d.x * 6.5 * dt, d.z * 6.5 * dt, 0.35); X.hurtPlayer('water', 7 * dt); } }
      for (const o2 of cars) { if (o2 === c) continue; const dx = o2.position.x - px, dz = o2.position.z - pz; if (dx * dx + dz * dz < 4 && py < o2.position.y + 1.8) { o2.position.x += d.x * 1.2 * dt; o2.position.z += d.z * 1.2 * dt; } } }
    jetSound(true, clamp(0.5 - c.position.distanceTo(player.pos) / 160, 0.05, 0.5));
  }
  function jetEmit(o, d, sp, n) { for (let k = 0; k < n; k++) { const i = jI = (jI + 1) % JN; jPos[i * 3] = o.x; jPos[i * 3 + 1] = o.y; jPos[i * 3 + 2] = o.z; jVel[i * 3] = d.x * sp + rnd(-0.5, 0.5); jVel[i * 3 + 1] = d.y * sp + rnd(-0.4, 0.4); jVel[i * 3 + 2] = d.z * sp + rnd(-0.5, 0.5); jLife[i] = 1.4; } }
  function updateJet(dt) { let any = false; for (let i = 0; i < JN; i++) { if (jLife[i] <= 0) continue; any = true; jLife[i] -= dt; jVel[i * 3 + 1] -= 9.8 * dt; jPos[i * 3] += jVel[i * 3] * dt; jPos[i * 3 + 1] += jVel[i * 3 + 1] * dt; jPos[i * 3 + 2] += jVel[i * 3 + 2] * dt; const gy = TH(jPos[i * 3], jPos[i * 3 + 2]); if (jPos[i * 3 + 1] < gy) { jLife[i] = 0; } if (jLife[i] <= 0) jPos[i * 3 + 1] = -999; } jGeo.attributes.position.needsUpdate = any || jGeo.attributes.position.needsUpdate; if (!cars.some(c => c.userData.spraying)) jetSound(false); for (const c of cars) if (c.userData.cannon) c.userData.spraying = false; }
  function aimTurret(c, tx, ty, tz, dt) { const u = c.userData; c.updateMatrixWorld(true); const tp = new V3(); u.turret.getWorldPosition(tp); const yaw = Math.atan2(tx - tp.x, tz - tp.z) - u.heading; u.turret.rotation.y = lerpAngle(u.turret.rotation.y, yaw, Math.min(1, dt * 3)); const dist = Math.hypot(tx - tp.x, tz - tp.z); const want = -Math.atan2(ty - tp.y, dist) - 0.06 - dist * 0.004; u.pitch.rotation.x += (clamp(want, -0.6, 0.5) - u.pitch.rotation.x) * Math.min(1, dt * 3); }
  function spawnCannon(x, z, h, mode = 'parked', look) { const c = makeCannon(look); const [fx, fz] = freeSpot(x, z, 3); c.position.set(fx, TH(fx, fz), fz); c.userData.heading = h; c.rotation.y = h; c.userData.mode = mode; addCar(c); return c; }
  function driveTo(c, tx, tz, dt, maxV) { const u = c.userData; const dx = tx - c.position.x, dz = tz - c.position.z, d = Math.hypot(dx, dz); const want = Math.atan2(dx, dz); const diff = ((want - u.heading + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    const ctrl = { fwd: d > 4 && u.speed < maxV, back: false, left: diff > 0.08, right: diff < -0.08, brake: d <= 4 || u.speed > maxV + 1 };
    if (Math.abs(u.speed) < 0.6 && d > 6) { u.stuck = (u.stuck || 0) + dt; if (u.stuck > 1.5) { ctrl.fwd = false; ctrl.back = true; ctrl.left = !ctrl.left; ctrl.right = !ctrl.right; ctrl.brake = false; if (u.stuck > 3.2) u.stuck = 0; } } else u.stuck = 0;
    driveCar(c, dt, ctrl); return d; }

  // ---------- Demozug ----------
  const demos = []; let followers = [];
  const CHANTS = { march: ['Wir sind hier, wir sind laut, weil ihr uns die Zukunft klaut!', 'Bornheim bleibt!', 'Wem gehört der Park? Uns gehört der Park!', 'Miete runter, Bäume rauf!', 'Hoch die Hände, Klimawende!'], halt: ['Lasst uns durch!', 'Wir sind friedlich, was seid ihr?', 'Bornheim bleibt!'], kessel: ['Lasst sie raus!', 'Wir sind friedlich, was seid ihr?', 'Keine Gewalt!'], rally: ['Bornheim bleibt!', 'Wir kommen wieder!', 'Danke Bornheim!'] };
  const COPSAY = { escort: 'Hier spricht die Polizei. Wir begleiten Ihre Versammlung. Bitte bleiben Sie auf der Fahrbahn.', line: 'Hier spricht die Polizei. Bleiben Sie stehen. Die Strecke ist gesperrt.', kessel: 'Achtung, Achtung. Sie sind eingeschlossen. Verhalten Sie sich ruhig.', cannon: 'Achtung. Wir setzen jetzt Wasserwerfer ein. Verlassen Sie sofort den Bereich.', raeumung: 'Die Versammlung ist aufgelöst. Wir räumen jetzt.' };
  function spawnDemo(o = {}) {
    const n = Math.round((o.n ?? 20) * clamp(opts.peds ?? 1, 0.5, 1.4)); const x = o.x ?? player.pos.x, z = o.z ?? player.pos.z;
    const d = { id: Math.random(), members: [], state: o.leadPlayer ? 'lead' : (o.gather ? 'gather' : 'march'), cx: x, cz: z, tension: o.tension ?? 0.05, energy: 0.5, age: 0, chantT: 2, max: Math.round((o.max ?? 34) * clamp(opts.peds ?? 1, 0.5, 1.4)), leadPlayer: !!o.leadPlayer, story: !!o.story, theme: o.banner || pick(BANNERS), slogans: o.slogans || null, chants: o.chants || null, peaceful: !!o.peaceful,
      pol: { stage: 0, cops: [], cars: [], cannon: null, t: 0, calmT: 0, lineS: null, lineOpened: false, cannonT: 0 }, maxStage: o.maxStage ?? 5, blockAt: o.blockAt ?? null, speed: o.speed ?? 1.25, quietT: 0, joinT: 0, playerT: 0, s: 0, result: null, onEnd: o.onEnd, noPolice: !!o.noPolice, kesselR: 6, label: o.label || '' };
    if (o.dest) { const r = route(x, z, o.dest[0], o.dest[1]); if (r && r.length > 1) { d.trail = trailFrom(r); d.total = d.trail[d.trail.length - 1].s; } }
    if (!d.trail) { d.trail = [{ x, z, s: 0 }]; d.total = 0; }
    if (d.leadPlayer) { d.trail = [{ x: player.pos.x, z: player.pos.z, s: 0 }]; d.total = 0; }
    for (const h of o.members || []) { h.userData.state = 'demo'; h.userData.demo = d; h.userData.jit = h.userData.jit || [rnd(-0.35, 0.35), rnd(-0.4, 0.4)]; if (!h.userData.sign && Math.random() < 0.35) addSign(h); d.members.push(h); }
    const nBlack = o.peaceful ? 0 : (o.black ?? Math.round(n * 0.1));
    for (let i = d.members.length; i < n; i++) { const a = rnd(0, 6.28), r = rnd(1, 6); const [qx, qz] = freeSpot(x + Math.cos(a) * r, z + Math.sin(a) * r, 1.5); const h = makeMember(qx, qz, { slogans: o.slogans, signs: o.slogans ? 0.6 : undefined, black: i < nBlack + (o.members || []).length && i >= (o.members || []).length, student: o.student }); h.userData.demo = d; d.members.push(h); }
    d.student = !!o.student; d.mob = !!o.mob;
    d.banner = bannerMesh(d.theme); demos.push(d); emit('demoStart', new V3(x, 0, z), { demo: d }); return d;
  }
  function leaveDemo(h) { const u = h.userData; const d = u.demo; if (!d) return; d.members.splice(d.members.indexOf(h), 1); u.demo = null; }
  function endDemo(d, result) { if (d.result) return; d.result = result; d.endT = 0; for (const h of [...d.members]) { const u = h.userData; leaveDemo(h); if (u.state === 'demo') { u.state = 'flee'; u.fleeT = rnd(6, 12); } } if (d.banner) { scene.remove(d.banner); d.banner = null; } if (d.onEnd) d.onEnd(result, d); emit('demoEnd', new V3(d.cx, 0, d.cz), { demo: d, result }); }
  function frontS(d) { return d.leadPlayer ? d.trail[d.trail.length - 1].s : d.s; }
  function slotOf(d, i) {
    const cols = d.leadPlayer ? 4 : 5; const row = Math.floor(i / cols), col = i % cols; const h = d.members[i].userData;
    if (d.state === 'gather' || d.state === 'rally') { const a = i * 2.39996, r = 1.6 + Math.sqrt(i) * 1.15; return { x: d.cx + Math.cos(a) * r, z: d.cz + Math.sin(a) * r, h: Math.atan2(-Math.cos(a), -Math.sin(a)) }; }
    if (d.state === 'kessel') { const a = i * 2.39996, r = Math.min(d.kesselR - 1.2, 0.6 + Math.sqrt(i) * 0.75); return { x: d.cx + Math.cos(a) * r, z: d.cz + Math.sin(a) * r, h: Math.atan2(-Math.cos(a), -Math.sin(a)) + Math.PI }; }
    const s = frontS(d) - (d.leadPlayer ? 2.6 : 1.2) - row * 1.25 + h.jit[1]; const p = posAt(d.trail, s); const across = (col - (cols - 1) / 2) * 1.08 + h.jit[0];
    return { x: p.x + Math.cos(p.h) * across, z: p.z - Math.sin(p.h) * across, h: p.h }; }
  function memberUpdate(d, h, i, dt) {
    const u = h.userData; u.t += dt; const dpl = h.position.distanceTo(player.pos); u.lod = dpl > 55;
    const T = slotOf(d, i);
    if (d.pol.lineFix && d.pol.stage === 2 && !d.pol.lineOpened) { const F = d.pol.lineFix, fx = Math.sin(F.h), fz = Math.cos(F.h); const al = (T.x - F.x) * fx + (T.z - F.z) * fz; if (al > -2.5) { T.x -= fx * (al + 2.5 + (i % 3) * 0.8); T.z -= fz * (al + 2.5 + (i % 3) * 0.8); T.h = F.h; } } // nicht durch die Kette
    if (solidAt(T.x, T.z) >= 0) { const k = Math.round(T.x) + ',' + Math.round(T.z); if (u.fixK !== k) { u.fixK = k; u.fix = freeSpot(T.x, T.z, 1.5); } T.x = u.fix[0]; T.z = u.fix[1]; } // Platz liegt im Haus: daneben stellen
    const dx = T.x - h.position.x, dz = T.z - h.position.z, L = Math.hypot(dx, dz);
    let sp = L > 6 ? 3.4 : L > 0.35 ? clamp(L * 1.4, 0.5, d.state === 'lead' ? 3.4 : 1.7) : 0;
    if (u.waitT > 0) { u.waitT -= dt; sp = 0; } // festgefahren: kurz stehen bleiben statt gegen die Wand zu laufen
    if (sp > 0) { const x0 = h.position.x, z0 = h.position.z; moveWithCollision(h.position, dx / L * sp * dt, dz / L * sp * dt, 0.28); h.rotation.y = lerpAngle(h.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 6));
      if (Math.hypot(h.position.x - x0, h.position.z - z0) < sp * dt * 0.3) { u.wallT = (u.wallT || 0) + dt; if (u.wallT > 0.7) { u.wallT = 0; u.waitT = rnd(2.5, 5); u.pose = null; } } else u.wallT = 0; }
    else h.rotation.y = lerpAngle(h.rotation.y, d.state === 'halt' && d.pol.lineS != null ? linePt(d, 0).h : T.h, Math.min(1, dt * 3));
    h.position.y = floorAt(h.position.x, h.position.z, h.position.y + 0.3);
    if (u.mixer) { if (sp > 0.05) { u.pose = null; animateWalk(h, u.t, sp * 2.3); } else { if (!u.pose) u.pose = (d.state === 'halt' || d.state === 'kessel') && Math.random() < (d.state === 'kessel' ? 0.35 : 0.5) && X.CHAR[u.charName].clips.Sitting ? 'Sitting' : X.CHAR[u.charName].clips.Clapping && Math.random() < 0.45 ? 'Clapping' : X.CHAR[u.charName].clips.Wave && Math.random() < 0.3 ? 'Wave' : 'idle'; playAnim(h, u.pose); if (!u.lod) { u.acc = (u.acc || 0) + dt; if (h.position.distanceToSquared(camera.position) > 900 && ((u.fr = (u.fr || 0) + 1) & 1)) {} else { u.mixer.update(u.acc); u.acc = 0; } } } }
    else animateWalk(h, u.t, sp * 2.3);
    if (u.sign) { u.sign.rotation.z = Math.sin(u.t * 2.1 + i) * 0.09; u.sign.position.y = Math.abs(Math.sin(u.t * 3 + i)) * 0.06; }
    // Schwarzer Block: bei hoher Spannung fliegt Farbe oder Böller Richtung Polizei
    if (u.black && d.mob && d.tension > 0.62 && Math.random() < dt * 0.05 * d.tension) { let tg = null, bd = 26; for (const c of cars) { if (c.userData.fire || c.userData.mode === 'wreck' || c.userData.cannon || c === player.car) continue; const dd = c.position.distanceTo(h.position); if (dd < bd && dd > 5) { bd = dd; tg = c; } } if (tg) { const from = h.position.clone().setY(h.position.y + 1.6); const to = tg.position.clone().setY(tg.position.y + 1); const dir = to.sub(from); const dist = dir.length(); dir.normalize().multiplyScalar(Math.min(18, 8 + dist * 0.5)); dir.y += 2 + dist * 0.13; W.spawnProj('molotov', from, dir, 'mob'); d.tension += 0.04; } }
    if (u.black && d.tension > 0.6 && d.pol.cops.length && Math.random() < dt * 0.06 * d.tension) { const tg = nearest(d.pol.cops, h.position, 28); if (tg) { const from = h.position.clone().setY(h.position.y + 1.6); const to = tg.position.clone().setY(tg.position.y + 1); const dir = to.sub(from); const dist = dir.length(); dir.normalize().multiplyScalar(Math.min(19, 9 + dist * 0.5)); dir.y += 2 + dist * 0.12; W.spawnProj(Math.random() < 0.6 ? 'paint' : 'banger', from, dir, 'demo'); d.tension += 0.02; } }
  }
  const nearest = (list, pos, maxD) => { let b = null, bd = maxD; for (const o of list) { if (o.userData.state === 'dead' || o.userData.state === 'stunned') continue; const dd = o.position.distanceTo(pos); if (dd < bd) { bd = dd; b = o; } } return b; };

  // ---------- Polizei ----------
  function linePt(d, extra = 0) { const P = d.pol; if (P.lineFix) return { x: P.lineFix.x + Math.sin(P.lineFix.h) * extra, z: P.lineFix.z + Math.cos(P.lineFix.h) * extra, h: P.lineFix.h }; return posAt(d.trail, P.lineS + extra); }
  // Obergrenze für Einsatzkräfte insgesamt: Ausgefallene werden nicht endlos ersetzt, mehr als COP_MAX gibt es nie
  const COP_MAX = () => Math.round(22 * clamp(opts.peds ?? 1, 0.5, 1.4));
  const copsAlive = () => { let n = 0; for (const p of peds) if (p.userData.cop && p.userData.state !== 'dead') n++; return n; };
  function copsNeeded(d, n) { let guard = 0; while (d.pol.cops.length < n && copsAlive() < COP_MAX() && guard++ < 40) { const tail = posAt(d.trail, Math.max(0, frontS(d) - 30 - rnd(0, 20))); const [x, z] = freeSpot(tail.x + rnd(-3, 3), tail.z + rnd(-3, 3)); const c = makeCop(x, z); c.userData.unit = d; d.pol.cops.push(c); } }
  function policeCar(d, s, side, van) { const p = typeof s === 'object' ? s : posAt(d.trail, s); const x = p.x + Math.cos(p.h) * side * 3.2, z = p.z - Math.sin(p.h) * side * 3.2; const [fx, fz] = freeSpot(x, z, 2.5); const c = makeCar(true, van ? 'police' : null); c.position.set(fx, TH(fx, fz), fz); c.userData.heading = p.h; c.rotation.y = p.h; c.userData.mode = 'parked'; c.userData.unitCar = true; addCar(c); d.pol.cars.push(c); return c; }
  function say(text, vol = 1, pitch = 0.8, rate = 1.0) { if (opts.tts === false || !window.speechSynthesis || document.hidden) return; try { const vs = speechSynthesis.getVoices(); const v = vs.find(v => /^de/i.test(v.lang)); if (!v) return; speechSynthesis.cancel(); const ut = new SpeechSynthesisUtterance(text); ut.voice = v; ut.lang = v.lang; ut.volume = clamp(vol * (opts.vol ?? 0.8), 0, 1); ut.pitch = pitch; ut.rate = rate; speechSynthesis.speak(ut); } catch (e) {} }
  function announce(d, k) { const dist = Math.hypot(player.pos.x - d.cx, player.pos.z - d.cz); if (dist < 90) { sub('📢 Polizei', COPSAY[k], 5); say(COPSAY[k], 1 - dist / 110, 0.7, 0.95); } }
  function setStage(d, st) {
    const P = d.pol; if (st <= P.stage || st > d.maxStage || d.noPolice) return; P.stage = st; P.t = 0; const f = frontS(d);
    if (st === 1) { copsNeeded(d, 4); policeCar(d, Math.max(0, f - 40), 0, false); announce(d, 'escort'); post('polizei', 'Wir begleiten eine Versammlung in Bornheim. Bitte umfahren Sie den Bereich. #ffm', 40); }
    if (st === 2) { const s = d.leadPlayer ? 0 : Math.min(d.total - 2, f + 20); P.lineS = s; if (d.leadPlayer) { let h = player.yaw, x = player.pos.x + Math.sin(h) * 18, z = player.pos.z + Math.cos(h) * 18; P.lineFix = { x, z, h }; } for (const c of [...cars]) { const u = c.userData; if (c === player.car || u.police || u.cannon || u.mode === 'wreck') continue; for (let k = -6; k <= 14; k += 2) { const q = linePt(d, k); if (Math.hypot(c.position.x - q.x, c.position.z - q.z) < 6) { removeCar(c); break; } } } /* Straße für die Kette räumen */ copsNeeded(d, 10); policeCar(d, linePt(d, 9), -0.6, true); policeCar(d, linePt(d, 9), 0.6, true); announce(d, 'line'); post('polizei', 'Die Versammlung wird an der Weiterfahrt gehindert. Wir stehen im Austausch mit der Versammlungsleitung.', 31); post('kollektiv', 'Polizeikette! Bleibt ruhig, bleibt zusammen! #BornheimBleibt', 812); }
    if (st === 3) { d.state = 'kessel'; d.kesselR = clamp(2.6 + Math.sqrt(d.members.length) * 0.95, 5, 9); copsNeeded(d, 14); announce(d, 'kessel'); post('presse', 'EILMELDUNG: Polizei kesselt Demonstrierende in Bornheim ein.', 2300); post('lena', 'krass was hier abgeht 😳 bin live dabei, link in bio #kessel', 5400); addRep('polizei', -3); }
    if (st === 4) { const t = posAt(d.trail, Math.max(0, frontS(d) - 70)); const c = spawnCannon(t.x, t.z, t.h, 'cannonAI'); c.userData.unit = d; P.cannon = c; announce(d, 'cannon'); post('presse', 'Wasserwerfer rollt auf die Berger Straße. Augenzeugen berichten von Panik.', 4100); post('hilde', 'Ich hab im Krieg Wasserwerfer gesehen. Und jetzt hier, gegen Kinder? Schämt euch.', 9800); post('troll', 'Endlich mal duschen für die Klimakleber 😂', 120); }
    if (st === 5) { announce(d, 'raeumung'); post('polizei', 'Die Versammlung wurde aufgelöst. Wer den Bereich nicht verlässt, wird in Gewahrsam genommen.', 15); }
    emit('policeStage', new V3(d.cx, 0, d.cz), { demo: d, stage: st });
  }
  function copUpdate(d, h, i, dt) {
    const u = h.userData; u.t += dt; u.lod = h.position.distanceTo(player.pos) > 55; if (u.state !== 'riot') return; const P = d.pol; u.hitT = Math.max(0, u.hitT - dt);
    // Wer Polizei angreift, wird verfolgt
    const hostile = player.wanted >= 1 && !player.car && h.position.distanceTo(player.pos) < 45;
    let tx = u.tx, tz = u.tz, face = null, run = false; const alive = d.members.length;
    if (hostile || u.task === 'arrestPlayer') { tx = player.pos.x; tz = player.pos.z; run = true; face = Math.atan2(player.pos.x - h.position.x, player.pos.z - h.position.z); }
    else if (P.stage >= 5 && alive && i % 2 === 0) { const m = nearest(d.members, h.position, 60); if (m) { tx = m.position.x; tz = m.position.z; run = true; if (h.position.distanceTo(m.position) < 1.3 && (d.arrT || 0) <= 0) { arrest(m, h); d.arrT = rnd(3, 6); } } } // Räumung: Festnahmen nacheinander, nicht alle auf einmal
    else if (P.stage === 3 || (P.stage === 4 && d.state === 'kessel')) { const n = P.cops.length; const a = i / n * Math.PI * 2; tx = d.cx + Math.cos(a) * d.kesselR; tz = d.cz + Math.sin(a) * d.kesselR; face = Math.atan2(d.cx - tx, d.cz - tz); }
    else if (P.stage === 2 && P.lineS != null && !P.lineOpened) { const p = linePt(d, i >= 9 ? 2.5 : 0); const k = (i % 9) - 4; tx = p.x + Math.cos(p.h) * k * 1.1; tz = p.z - Math.sin(p.h) * k * 1.1; face = p.h + Math.PI; }
    else { const f = frontS(d); const p = posAt(d.trail, f - 3 - (i >> 1) * 6); const side = i % 2 ? 1 : -1; const off = (d.leadPlayer ? 3.2 : 3.6) + 1.2; tx = p.x + Math.cos(p.h) * side * off; tz = p.z - Math.sin(p.h) * side * off; face = p.h; if (P.lineOpened && P.stage === 2) { const q = linePt(d, 0); tx = q.x + Math.cos(q.h) * side * 5.5; tz = q.z - Math.sin(q.h) * side * 5.5; } }
    const dx = tx - h.position.x, dz = tz - h.position.z, L = Math.hypot(dx, dz); const sp = L > 0.4 ? Math.min(run || L > 5 ? 4.6 : 1.8, L * 2) : 0;
    if (sp > 0) { moveWithCollision(h.position, dx / L * sp * dt, dz / L * sp * dt, 0.3); h.rotation.y = lerpAngle(h.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 8)); } else if (face != null) h.rotation.y = lerpAngle(h.rotation.y, face, Math.min(1, dt * 4));
    h.position.y = floorAt(h.position.x, h.position.z, h.position.y + 0.3); u.aiming = false; animateWalk(h, u.t, sp * 1.6);
    // Spieler festnehmen: kurz festhalten reicht
    const dp = h.position.distanceTo(player.pos);
    if ((hostile || (P.stage >= 5 && dp < 10) || u.task === 'arrestPlayer') && !player.car && !player.dead && dp < 1.35) { u.grab += dt; if (u.hitT <= 0 && player.wanted >= 2) { u.hitT = 1.2; X.hurtPlayer('baton', 9); sfx('punch', 0.8); if (u.mixer) { playAnim(h, 'Sword_Slash', { once: true, fade: 0.05 }); u.actT = 0.6; } } if (u.grab > 1.4) { busted(); u.grab = 0; } } else u.grab = Math.max(0, u.grab - dt);
    // Pfefferspray in der Kette und im Kessel
    if ((P.stage === 2 || P.stage === 3) && d.tension > 0.45) { u.sprayT -= dt; if (u.sprayT <= 0) { u.sprayT = rnd(5, 11) / d.tension; const tg = nearest(d.members, h.position, 4.5); const tgt = !player.car && dp < 4.5 && d.tension > 0.6 ? player : tg; if (tgt) { const tp = tgt === player ? player.pos : tgt.position; const dir = new V3(tp.x - h.position.x, 0, tp.z - h.position.z).normalize(); h.rotation.y = Math.atan2(dir.x, dir.z); const o = h.position.clone().setY(h.position.y + 1.5).addScaledVector(dir, 0.5); for (let k = 0; k < 12; k++) W.puff(o.clone(), 0xffb27a, 0.25, 0.7, dir.clone().multiplyScalar(rnd(5, 8)).add(new V3(rnd(-0.5, 0.5), rnd(-0.2, 0.4), rnd(-0.5, 0.5))), 2.2, 0.5); W.sprayCone(h.position, dir, 'cop'); d.tension += 0.03; sfx('hiss', clamp(0.6 - dp / 40, 0.05, 0.5)); if (Math.random() < 0.5) post(pick(['lena', 'kollektiv', 'presse']), pick(['Pfefferspray gegen Sitzende!! 😡', 'Wieder Pfefferspray. Sanis bitte zur Kette! #BornheimBleibt', 'Polizei setzt Reizgas ein, mehrere Verletzte.']), Math.round(rnd(200, 3000))); } } }
  }
  function arrest(m, cop) { const u = m.userData; if (u.state === 'arrested' || u.noArrest) return; leaveDemo(m); u.state = 'arrested'; u.arrT = 0; m.rotation.x = 0; if (u.sign) { m.remove(u.sign); u.sign = null; } if (u.mixer) playAnim(m, X.CHAR[u.charName].clips.Sitting ? 'Sitting' : 'Idle'); stats.arrests = (stats.arrests || 0) + 1; }
  function busted() {
    if (player.dead || player.bustedT > 0) return; player.bustedT = 3.5; emit('busted', player.pos, {}); X.card('FESTGENOMMEN', 'Personalien aufgenommen, Waffen und Pyro beschlagnahmt.'); sfx('door'); W.confiscate(); player.money = Math.floor(player.money * 0.85); player.wanted = 0;
    for (const d of demos) for (const c of d.pol.cops) { c.userData.task = 'escort'; c.userData.grab = 0; }
    for (const c of cars) if (c.userData.mode === 'police') c.userData.mode = 'parked';
    /* nach der Personalienaufnahme in der Nähe freigelassen statt quer durch die Stadt zum festen Revier in Bornheim versetzt */ { const a = Math.random() * Math.PI * 2; let [x, z] = freeSpot(player.pos.x + Math.cos(a) * 30, player.pos.z + Math.sin(a) * 30, 3); if (!X.inPocket || !X.inPocket(player.pos.x, player.pos.z)) { player.pos.set(x, TH(x, z), z); if (player.mesh) player.mesh.position.copy(player.pos); } } addRep('polizei', -5); sub('👮 Polizei', 'Personalien aufgenommen. Sie können gehen – halten Sie sich fern.', 5);
  }
  function updatePolice(d, dt) {
    const P = d.pol; P.t += dt; if (d.noPolice) return;
    if (P.stage === 0 && d.age > (d.story ? 8 : 16)) setStage(d, 1);
    if (P.stage === 1 && P.t > 25 && ((d.blockAt != null && !P.lineOpened && (d.total ? frontS(d) / d.total : 0) >= d.blockAt) || d.tension > 0.32 || (d.leadPlayer && d.age > 75 && d.tension > 0.2))) setStage(d, 2);
    if (P.stage === 2 && P.t > 45 && d.tension > 0.55) setStage(d, 3); // Kette steht mindestens 45 s
    if (P.stage === 3 && P.t > 60 && d.tension > 0.76) setStage(d, 4); // Kessel: mindestens eine Minute warten
    if (P.stage === 4) { P.cannonT += dt; if ((d.tension > 0.92 && P.cannonT > 25) || P.cannonT > 50) setStage(d, 5); } // Wasserwerfer mindestens 25 s, spätestens nach 50 s Räumung
    // Rauchtöpfe: im Kessel und unter Wasserwerfer zündet ab und zu jemand Rauch
    if (P.stage >= 3 && P.stage <= 4 && d.members.length > 3) { d.smokeT = (d.smokeT ?? rnd(8, 14)) - dt; if (d.smokeT <= 0) { d.smokeT = rnd(14, 26); const m = d.members.find(h => h.userData.black) || pick(d.members); const tg = nearest(P.cops, m.position, 40); if (tg) { const from = m.position.clone(); from.y += 1.5; const v = new V3(tg.position.x - from.x, 0, tg.position.z - from.z); const l = v.length() || 1; v.multiplyScalar(Math.min(12, l * 0.9) / l); v.y = 4; W.spawnProj('smoke', from, v, 'npc'); } } }
    // Räumung schrittweise: alle paar Sekunden verlassen einzelne die Versammlung
    if (P.stage >= 5) { d.arrT = (d.arrT || 0) - dt; d.leaveT = (d.leaveT ?? 2) - dt; if (d.leaveT <= 0 && d.members.length > 3) { d.leaveT = rnd(3, 6); const m = pick(d.members); leaveDemo(m); m.userData.state = 'flee'; m.userData.fleeT = rnd(3, 6); } }
    if (P.stage === 3 && P.t > 50 && d.tension < 0.5) { d.tension = 0.4; }
    // Deeskalation: an der Kette lange ruhig → die Polizei lässt durch
    if (P.stage === 2 && !P.lineOpened) { if (d.state === 'halt' || d.leadPlayer) { if (d.tension < 0.24) P.calmT += dt; else P.calmT = Math.max(0, P.calmT - dt * 0.5); } if (P.calmT > 22) { P.lineOpened = true; d.state = d.leadPlayer ? 'lead' : 'march'; sub('📢 Polizei', 'Die Versammlung darf weiterziehen. Danke für Ihre Kooperation.', 5); post('polizei', 'Die Versammlung verläuft friedlich und zieht weiter. Danke an alle Beteiligten.', 410); post('kollektiv', 'Wir dürfen weiter!! Friedlich und laut wirkt. #BornheimBleibt', 2100); addRep('polizei', 6); addRep('anwohner', 3); stats.peaceful++; emit('lineOpened', new V3(d.cx, 0, d.cz), { demo: d }); } }
    if (P.cannon && !cars.includes(P.cannon) && P.cannon !== player.car) { console.warn('Wasserwerfer verloren', P.cannon.position.toArray()); P.cannon = null; if (P.stage === 4 && !P.respawned) { P.respawned = true; P.stage = 3; setStage(d, 4); } }
    for (let i = 0; i < P.cops.length; i++) copUpdate(d, P.cops[i], i, dt);
    const c = P.cannon; if (c && c !== player.car && c.userData.mode === 'cannonAI') { const u = c.userData; const back = posAt(d.trail, Math.max(0, frontS(d) - (d.state === 'kessel' ? 0 : 6))); const ox = d.cx + (back.x - d.cx) * 0 - Math.sin(back.h) * 17, oz = d.cz - Math.cos(back.h) * 17;
      u.pathT = (u.pathT || 0) - dt; if (!u.path || u.pathT <= 0) { u.path = route(c.position.x, c.position.z, ox, oz) || []; u.pi = 0; u.pathT = 6; }
      while (u.pi < u.path.length - 1 && Math.hypot(u.path[u.pi][0] - c.position.x, u.path[u.pi][1] - c.position.z) < 7) u.pi++;
      const dist = Math.hypot(ox - c.position.x, oz - c.position.z); const wp = u.path.length > 2 && dist > 25 && u.pi < u.path.length - 1 ? u.path[u.pi] : [ox, oz]; driveTo(c, wp[0], wp[1], dt, dist > 25 ? 11 : 6);
      u.driveT = (u.driveT || 0) + dt; if (u.driveT > 20 && dist > 30 && Math.abs(u.speed) < 4) { const [fx, fz] = freeSpot(ox, oz, 3); c.position.set(fx, TH(fx, fz), fz); u.speed = 0; if (u.vel) u.vel.set(0, 0); u.heading = Math.atan2(d.cx - fx, d.cz - fz); c.rotation.y = u.heading; u.driveT = 0; } const tg = (player.wanted >= 1 && !player.car && player.pos.distanceTo(c.position) < 34) ? player.pos : (d.members.length ? centroidOf(d.members) : null);
      if (tg && dist < 10) { aimTurret(c, tg.x, tg.y + 1, tg.z, dt); u.burstT -= dt; if (u.burstT < -2.2) u.burstT = rnd(3, 4.5); if (u.burstT > 0 && P.stage >= 4) cannonSpray(c, dt); } }
  }
  const centroidOf = list => { const v = new V3(); let n = 0; for (const h of list) { if (h.userData.state === 'dead') continue; v.add(h.position); n++; } return n ? v.multiplyScalar(1 / n) : null; };

  // ---------- Ton der Menge ----------
  let crowd = null; function crowdSound(vol, energy) { if (!SND.ctx) return; const C = SND.ctx; if (!crowd) { const src = C.createBufferSource(); src.buffer = SND.noise; src.loop = true; const f = C.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.8; const g = C.createGain(); g.gain.value = 0; src.connect(f); f.connect(g); g.connect(SND.master); src.start(); crowd = { g, f, beat: 0, whT: 3 }; } crowd.g.gain.setTargetAtTime(vol * (0.25 + energy * 0.35), C.currentTime, 0.3); crowd.f.frequency.setTargetAtTime(550 + energy * 500 + Math.sin(C.currentTime * 2.3) * 120, C.currentTime, 0.2); }
  function tone(f0, f1, dur, vol, type = 'sine') { if (!SND.ctx || vol < 0.01) return; const C = SND.ctx, t = C.currentTime; const o = C.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur); const g = C.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(SND.master); o.start(t); o.stop(t + dur + 0.05); }
  function crowdBeats(dt, vol, energy) { if (!crowd || vol < 0.02) return; crowd.beat += dt; const step = 0.27; while (crowd.beat > step) { crowd.beat -= step; crowd.bi = ((crowd.bi || 0) + 1) % 8; if ([0, 3, 4, 6].includes(crowd.bi)) tone(110, 48, 0.18, vol * 0.5 * (0.5 + energy)); if (crowd.bi === 2 || crowd.bi === 6) tone(380, 200, 0.06, vol * 0.18, 'triangle'); }
    crowd.whT -= dt; if (crowd.whT <= 0) { crowd.whT = rnd(2, 6) / (0.4 + energy); tone(3100, 2900, 0.22, vol * 0.14, 'sine'); setTimeout(() => tone(3100, 3000, 0.4, vol * 0.12), 260); } }

  // ---------- Anzeige ----------
  const chantEl = $('chant'), subEl = $('sub'); let subT = 0;
  function sub(who, text, sec = 4) { if (!subEl) return; subEl.innerHTML = (who ? `<b>${who}</b> ` : '') + text; subEl.style.display = 'block'; subT = sec; }
  function showChant(d, text) { d.chant = text; d.chantShow = 3.2; }
  function placeChant() { let best = null, bd = 70; for (const d of demos) { if (d.result || !(d.chantShow > 0)) continue; const dd = Math.hypot(d.cx - player.pos.x, d.cz - player.pos.z); if (dd < bd) { bd = dd; best = d; } }
    if (!chantEl) return; if (!best) { chantEl.style.display = 'none'; return; } const p = new V3(best.cx, TH(best.cx, best.cz) + 3.4, best.cz).project(camera); if (p.z > 1 || Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.1) { chantEl.style.display = 'none'; return; }
    chantEl.style.display = 'block'; chantEl.style.left = ((p.x + 1) / 2 * innerWidth) + 'px'; chantEl.style.top = ((1 - p.y) / 2 * innerHeight) + 'px'; chantEl.textContent = '»' + best.chant + '«'; chantEl.style.opacity = Math.min(1, best.chantShow) * clamp(1.3 - bd / 70, 0, 1); }

  // ---------- Hauptschleife ----------
  let spontT = rnd(150, 260), gT = 0;
  function update(dt) {
    if (subT > 0) { subT -= dt; if (subT <= 0 && subEl) subEl.style.display = 'none'; }
    for (const f of feed) f.t += dt; if (feed.length && feed[feed.length - 1].t > 26) feed.pop(); if (Math.random() < dt * 2) renderFeed();
    gT = Math.max(0, gT - dt); if (player.bustedT > 0) player.bustedT -= dt;
    let crowdVol = 0, crowdE = 0;
    for (let k = demos.length - 1; k >= 0; k--) {
      const d = demos[k]; d.age += dt;
      if (d.result) { d.endT += dt; const P = d.pol; for (let i = P.cops.length - 1; i >= 0; i--) { const c = P.cops[i]; if (c.position.distanceTo(player.pos) > 70 || d.endT > 60 || c.userData.state === 'dead') { if (c.userData.state !== 'dead') removePed(c); P.cops.splice(i, 1); } else if (c.userData.state === 'riot') { c.userData.t += dt; animateWalk(c, c.userData.t, 0); } }
        for (let i = P.cars.length - 1; i >= 0; i--) { const c = P.cars[i]; if (c !== player.car && (c.position.distanceTo(player.pos) > 90 || d.endT > 60)) { removeCar(c); P.cars.splice(i, 1); } }
        if (P.cannon && P.cannon !== player.car && P.cannon.userData.mode === 'cannonAI') { const c = P.cannon; const away = posAt(d.trail, 0); driveTo(c, away.x, away.z, dt, 8); if (c.position.distanceTo(player.pos) > 120 || d.endT > 70) { removeCar(c); P.cannon = null; } }
        else if (P.cannon && P.cannon !== player.car && (P.cannon.position.distanceTo(player.pos) > 150 || d.endT > 180)) { removeCar(P.cannon); P.cannon = null; } // vom Spieler übernommener und abgestellter Werfer: sonst bleibt die Demo für immer in der Liste
        if (!P.cops.length && !P.cars.length && !P.cannon) demos.splice(k, 1); continue; }
      // Mitglieder
      for (let i = d.members.length - 1; i >= 0; i--) { const h = d.members[i]; const u = h.userData; if (u.state === 'dead' || u.hp <= 0) { leaveDemo(h); d.tension += 0.12; continue; } if (u.state === 'flee') { leaveDemo(h); continue; } }
      for (let i = 0; i < d.members.length; i++) { const h = d.members[i]; if (h.userData.state === 'demo') memberUpdate(d, h, i, dt); }
      const c = centroidOf(d.members); if (c) { d.cx += (c.x - d.cx) * Math.min(1, dt * 2); d.cz += (c.z - d.cz) * Math.min(1, dt * 2); }
      // Vorankommen
      if (d.state === 'march') { const blockS = d.pol.stage === 2 && !d.pol.lineOpened && d.pol.lineS != null ? d.pol.lineS - 4.5 : 1e9;
        const lp = posAt(d.trail, d.s - 1.2); let lag = d.members.length ? 1e9 : 0; for (const h of d.members.slice(0, 6)) { if (h.userData.state !== 'demo') continue; lag = Math.min(lag, Math.hypot(h.position.x - lp.x, h.position.z - lp.z)); } if (lag === 1e9) lag = 0;
        if (d.s < blockS && lag < 4) d.s = Math.min(d.s + d.speed * dt, d.total, blockS); else if (d.s >= blockS - 0.01) d.state = 'halt';
        if (d.total && d.s >= d.total - 0.1) { d.state = 'rally'; d.rallyT = 0; const e = posAt(d.trail, d.total); d.cx = e.x; d.cz = e.z; post('kollektiv', 'Wir sind da! Kundgebung läuft. Danke an alle! #BornheimBleibt', 1500); emit('demoArrived', new V3(e.x, 0, e.z), { demo: d }); } }
      else if (d.state === 'halt' && (d.pol.lineOpened || d.pol.stage < 2)) d.state = 'march';
      else if (d.state === 'lead') { const t = d.trail[d.trail.length - 1]; if (Math.hypot(player.pos.x - t.x, player.pos.z - t.z) > 0.8) d.trail.push({ x: player.pos.x, z: player.pos.z, s: t.s + Math.hypot(player.pos.x - t.x, player.pos.z - t.z) }); if (d.trail.length > 600) d.trail.splice(0, 100);
        if (d.pol.stage === 2 && !d.pol.lineOpened && d.pol.lineS != null) { const lp = posAt(d.trail, d.pol.lineS); /* Linie steht fest im Weg */ } }
      else if (d.state === 'gather') { d.joinT -= dt; if (d.joinT <= 0 && d.members.length < 14 + d.energy * 10) { d.joinT = rnd(1.5, 3.5); arrive(d); } if (d.members.length >= 14 && d.age > 25 && d.goal) { const r = route(d.cx, d.cz, d.goal[0], d.goal[1]); if (r && r.length > 2) { d.trail = trailFrom(r); d.total = d.trail[d.trail.length - 1].s; d.s = 0; d.state = 'march'; post('kollektiv', 'Wir laufen los! Kommt dazu! #Hitzefrei', 640); } else d.goal = null; } }
      else if (d.state === 'rally') { d.rallyT += dt; if (d.rallyT > (d.rallyDur ?? 50)) endDemo(d, 'success'); }
      if (d.state === 'kessel' && !player.car) { const dx = player.pos.x - d.cx, dz = player.pos.z - d.cz, L = Math.hypot(dx, dz); if (d.playerIn === undefined) d.playerIn = L < d.kesselR; if (d.playerIn && L > d.kesselR - 0.6 && L < d.kesselR + 2) { const a = Math.atan2(dz, dx); const gap = d.pol.cops.some(c => { const cu = c.userData; if (cu.state === 'riot') return false; const ca = Math.atan2(c.position.z - d.cz, c.position.x - d.cx); return Math.abs(((ca - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI) < 0.45; }) || W.inSmoke(player.pos);
          if (!gap) { const tx = d.cx + dx / L * (d.kesselR - 0.6), tz = d.cz + dz / L * (d.kesselR - 0.6); moveWithCollision(player.pos, tx - player.pos.x, tz - player.pos.z, 0.35, player.pos.y); /* nicht in Wände setzen */ if (Math.random() < dt) showMsg('KESSEL – KEIN DURCHKOMMEN', 900); } else d.playerIn = false; } else if (L > d.kesselR + 2) d.playerIn = false; }
      // Spannung und Energie
      d.quietT += dt; const st = d.pol.stage; const atLine = d.state === 'halt' || (d.leadPlayer && st === 2 && !d.pol.lineOpened); d.tension += dt * (atLine ? 0.012 : d.state === 'kessel' ? 0.008 : st >= 1 ? 0.0012 : 0); if (d.quietT > 10 && d.state !== 'kessel' && !atLine) d.tension -= dt * 0.006; d.tension = clamp(d.tension, 0, 1.2); d.energy = clamp(d.energy - dt * 0.006, 0, 1);
      if (d.state === 'march' || d.state === 'lead' || d.state === 'halt') { d.joinT -= dt; if (d.joinT <= 0 && d.members.length < d.max * (0.6 + d.energy * 0.4)) { d.joinT = rnd(3, 7) / (0.3 + d.energy); arrive(d); } }
      // Sprechchöre
      d.chantT -= dt; d.chantShow = (d.chantShow || 0) - dt; if (d.chantT <= 0 && d.members.length >= 3) { d.chantT = rnd(7, 12); const list = CHANTS[d.state === 'kessel' ? 'kessel' : d.state === 'halt' ? 'halt' : d.state === 'rally' ? 'rally' : 'march']; const tx = d.tension > 0.5 && Math.random() < 0.4 ? 'Keine Gewalt!' : pick(d.chants && (d.state === 'march' || d.state === 'gather' || d.state === 'rally') ? d.chants : list); showChant(d, tx); const dd = Math.hypot(player.pos.x - d.cx, player.pos.z - d.cz); if (dd < 55) say(tx, (1 - dd / 70) * 0.9, rnd(1.0, 1.3), 1.08); }
      const dd = Math.hypot(player.pos.x - d.cx, player.pos.z - d.cz); const vol = clamp(1 - dd / 110, 0, 1) * Math.min(1, d.members.length / 16); if (vol > crowdVol) { crowdVol = vol; crowdE = d.energy; }
      // Spieler läuft mit
      if (dd < 9 + Math.sqrt(d.members.length) && !player.car) { d.playerT += dt; if (d.playerT > 18 && !d.joinedSent) { d.joinedSent = true; emit('joinedDemo', player.pos, { demo: d }); addRep('kollektiv', 2); } }
      updatePolice(d, dt);
      if (d.banner) { const a = d.members[0], b = d.members[Math.min(d.members.length - 1, d.leadPlayer ? 3 : 4)]; if (a && b && d.state !== 'kessel' && d.state !== 'gather' && d.state !== 'rally' && a.position.distanceTo(b.position) < 7) { const m = a.position.clone().add(b.position).multiplyScalar(0.5); d.banner.visible = true; d.banner.position.set(m.x, m.y + 1.45, m.z); d.banner.rotation.y = Math.atan2(b.position.x - a.position.x, b.position.z - a.position.z) - Math.PI / 2; d.banner.scale.set(Math.max(2, a.position.distanceTo(b.position) + 0.3), 1, 1); } else d.banner.visible = false; }
      if (d.members.length < 4 && d.age > 10 && !d.result) endDemo(d, d.pol.stage >= 3 ? 'dispersed' : 'faded');
    }
    crowdSound(crowdVol, crowdE); crowdBeats(dt, crowdVol, crowdE); placeChant();
    updateFollowers(dt); updateArrested(dt); updateJet(dt); playerCannon(dt);
    // Spontane Versammlungen in der Hitze des Tages
    if (opts.demos !== false && !X.creative.on && demos.filter(d => !d.result).length < 2 && !X.storyBusy()) { spontT -= dt; if (spontT <= 0) { spontT = rnd(120, 240); /* mehr Demos in der Stadt (André 12.11.2026) */ if (world.hour > 9 && world.hour < 21) spontaneous(); } }
  }
  function arrive(d) { // Neue Leute kommen aus einer Seitenstraße dazu
    const a = rnd(0, 6.28); const r = rnd(35, 55); let [x, z] = [d.cx + Math.cos(a) * r, d.cz + Math.sin(a) * r]; if (solidAt(x, z) >= 0) { const rp = X.randomRoadPoint(pick(pedRoads())); if (Math.hypot(rp.x - d.cx, rp.z - d.cz) > 120) return; x = rp.x; z = rp.z; }
    const h = makeMember(x, z, { slogans: d.slogans, signs: d.slogans ? 0.6 : undefined, black: !d.peaceful && Math.random() < (d.mob ? 0.2 : 0.08), student: d.student && Math.random() < 0.8 }); h.userData.demo = d; d.members.push(h); }
  function updateArrested(dt) { for (let i = peds.length - 1; i >= 0; i--) { const h = peds[i], u = h.userData; if (u.state !== 'arrested') continue; u.arrT += dt; if (u.mixer && !u.lod) { u.mixer.update(dt); } if (u.arrT > 9 && h.position.distanceTo(player.pos) > 12) removePed(h); else if (u.arrT > 30) removePed(h); } }

  // ---------- Spontane Demo und Leute sammeln (Taste G) ----------
  function spontaneous(at, o = {}) { /* o.noPolice: Kreativmodus, nur Leute (André 12.11.2026) */
    let p = at; if (!p) { for (let k = 0; k < 30; k++) { const rp = X.randomRoadPoint(pick(pedRoads().filter(r => r.w >= 6))); const dd = Math.hypot(rp.x - player.pos.x, rp.z - player.pos.z); if (dd > 90 && dd < 200) { p = [rp.x, rp.z]; break; } } } if (!p) return null;
    let goal = null; for (let k = 0; k < 30; k++) { const rp = X.randomRoadPoint(pick(pedRoads().filter(r => r.w >= 7))); const dd = Math.hypot(rp.x - p[0], rp.z - p[1]); if (dd > 260 && dd < 520) { goal = [rp.x, rp.z]; break; } }
    const th = o.thema === false ? null : pick(THEMEN); const d = spawnDemo(Object.assign({ x: p[0], z: p[1], n: 6, gather: true, max: 30, noPolice: !!o.noPolice }, th ? { banner: th.b, slogans: th.s, chants: th.c, peaceful: true, maxStage: 1, student: !!th.st, tension: 0 } : {})); d.goal = goal; d.joinT = 1; d.energy = 0.7; const st = X.streetAt(p[0], p[1]);
    post('kollektiv', th ? `${th.st ? 'Schüler:innen-Demo' : 'Spontandemo'} „${th.b}“ ${st ? 'in der ' + st : 'in Frankfurt'}! Kommt alle, friedlich und laut.` : `Spontandemo ${st ? 'in der ' + st : 'in Bornheim'}! ${world.hour > 11 && world.hour < 19 ? '38 Grad und die Stadt baut Parkplätze. ' : ''}Kommt alle! #Hitzefrei`, Math.round(rnd(300, 1200))); return d;
  }
  function rally() {
    if (X.onG && X.onG()) return;
    if (gT > 0 || player.car || player.dead) return; gT = 1.6; const pm = player.mesh?.userData; if (pm?.mixer) { playAnim(player.mesh, 'Wave', { once: true, fade: 0.1 }); pm.actT = 1.2; }
    // In einer Demo: Sprechchor anstimmen oder deeskalieren
    const d = demos.find(d => !d.result && Math.hypot(player.pos.x - d.cx, player.pos.z - d.cz) < 16 + Math.sqrt(d.members.length));
    if (d) { if (d.tension > 0.15 || d.state === 'halt' || d.state === 'kessel') { d.tension = Math.max(0, d.tension - 0.06); d.quietT = 0; showChant(d, 'Keine Gewalt!'); say('Keine Gewalt!', 0.9, 1.1, 1.1); addRep('polizei', 0.5); stats.peaceful += 0.2; emit('deescalate', player.pos, { demo: d }); } else { d.energy = clamp(d.energy + 0.18, 0, 1); const t = pick(CHANTS.march); showChant(d, t); say(t, 0.9, 1.1, 1.1); emit('chant', player.pos, { demo: d }); } return; }
    let n = 0; for (const p of peds) { const u = p.userData; if (u.state !== 'walk' || u.demo || u.cop || u.follow) continue; if (!YOUNG.includes(u.charName)) continue; if (p.position.distanceTo(player.pos) > 28) continue; if (Math.random() < 0.6 + rep.kollektiv / 250) { u.state = 'follow'; u.follow = true; u.jit = [rnd(-1.5, 1.5), rnd(-1, 1)]; followers.push(p); n++; if (Math.random() < 0.35 && !u.sign) addSign(p); } }
    sfx('click'); say(pick(['Kommt mit! Bornheim bleibt!', 'Alle zum Park! Kommt mit!', 'Hitzefrei! Kommt mit!']), 0.9, 1.15, 1.1);
    if (n) showMsg('+' + n + ' FOLGEN DIR (' + followers.length + ')', 1100); else showMsg(followers.length ? followers.length + ' FOLGEN DIR' : 'NIEMAND HÖRT ZU – SUCH JUNGE LEUTE', 1100);
    if (followers.length >= 4 && !rally.posted) { rally.posted = true; post('du', 'Wir laufen jetzt durch Bornheim. Kommt dazu! #Hitzefrei', Math.round(stats.reach * 0.1)); }
    if (followers.length >= (X.rallyLimit || 8)) { const fl = followers; followers = []; for (const f of fl) f.userData.follow = false; const d2 = spawnDemo({ x: player.pos.x, z: player.pos.z, leadPlayer: true, members: fl, n: fl.length + 4, max: 32 }); d2.energy = 0.8; X.card('SPONTANDEMO', 'Du führst. G: Sprechchor oder deeskalieren · V: filmen'); post('kollektiv', 'Spontandemo in Bornheim! Läuft gerade vorne weg: ' + myHandle() + ' 🔥', 1300); emit('demoFormed', player.pos, { demo: d2, leadPlayer: true }); addRep('kollektiv', 4); }
  }
  function updateFollowers(dt) { for (let i = followers.length - 1; i >= 0; i--) { const h = followers[i], u = h.userData; if (u.state !== 'follow') { u.follow = false; followers.splice(i, 1); continue; } u.t += dt; const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw); const tx = player.pos.x - fx * (2.2 + (i >> 1) * 1.2) + fz * u.jit[0], tz = player.pos.z - fz * (2.2 + (i >> 1) * 1.2) - fx * u.jit[0]; const dx = tx - h.position.x, dz = tz - h.position.z, L = Math.hypot(dx, dz);
      const sp = L > 0.5 ? clamp(L * 1.3, 0.6, L > 8 ? 6.5 : 3.6) : 0; if (sp) { moveWithCollision(h.position, dx / L * sp * dt, dz / L * sp * dt, 0.28); h.rotation.y = Math.atan2(dx, dz); } h.position.y = floorAt(h.position.x, h.position.z, h.position.y + 0.3); animateWalk(h, u.t, sp * 2.2); if (L > 70) { u.state = 'walk'; } } }

  // ---------- Filmen (Taste V) ----------
  let filming = false, clip = 0, filmT = 0; const recEl = $('rec');
  function film() { if (player.car) return; filming = !filming; if (recEl) recEl.style.display = filming ? 'block' : 'none'; if (filming) { clip = 0; filmT = 0; showMsg('AUFNAHME', 700); } else postClip(); }
  function postClip() { if (clip < 2) { showMsg('NICHTS SPANNENDES GEFILMT', 900); return; } const views = Math.round(clip * rnd(400, 900) * (1 + stats.reach / 2000)); stats.reach += Math.round(clip * rnd(30, 70)); stats.filmed++; addRep('kollektiv', clip * 0.4); addRep('polizei', -clip * 0.3); post('du', pick(['Das passiert gerade in Bornheim. Teilt das! #BornheimBleibt', 'Ungeschnitten. Bildet euch selbst eine Meinung. #Bornheim', 'So sieht „friedliche Lageklärung" aus. #Hitzefrei']), views); emit('clipPosted', player.pos, { score: clip }); clip = 0; }
  function updateFilm(dt) { if (!filming) return; filmT += dt; for (const d of demos) { if (d.result) continue; const dd = Math.hypot(player.pos.x - d.cx, player.pos.z - d.cz); if (dd < 45) clip += dt * (0.05 + d.pol.stage * 0.08 + (d.pol.cannon?.userData.spraying ? 0.4 : 0)); } if (recEl) recEl.textContent = '● REC ' + Math.floor(filmT) + 's · ' + Math.floor(clip * 10) / 10; if (filmT > 40) { filming = false; if (recEl) recEl.style.display = 'none'; postClip(); } }

  // ---------- Wasserwerfer selbst fahren ----------
  let cannonTrig = false; function carTrigger(on) { cannonTrig = on; }
  function playerCannon(dt) { const c = player.car; updateFilm(dt); if (!c || !c.userData.cannon) return; const u = c.userData; if (!u.stolen) { u.stolen = true; if (u.fireTruck) { raiseWanted(1); post('feuerwehr', 'Unbekannte haben eines unserer Löschfahrzeuge entwendet. Bitte melden Sie Hinweise.', 900); } else { raiseWanted(2); post('presse', 'Unbekannte entwenden Wasserwerfer der Polizei. Präsidium: „Sehr unangenehm."', 6200); } emit('cannonStolen', c.position, { car: c }); }
    u.turret.rotation.y = lerpAngle(u.turret.rotation.y, camYaw.v - u.heading, Math.min(1, dt * 6)); u.pitch.rotation.x += (clamp(-camPitch.v * 0.9 + 0.12, -0.6, 0.5) - u.pitch.rotation.x) * Math.min(1, dt * 6);
    if (cannonTrig) cannonSpray(c, dt); else u.tank = Math.min(100, u.tank + dt * 2); }

  // ---------- Ereignisse aus Waffen und Spiel ----------
  X.listeners.push((ev, pos, data) => {
    for (const d of demos) { if (d.result) continue; const dd = Math.hypot(pos.x - d.cx, pos.z - d.cz); if (dd > 60) continue; const k = data.who && data.who !== 'player' ? 0.5 : 1; const nearCops = d.pol.cops.some(c => c.position.distanceTo(pos) < 15);
      const T = { shot: 0.3, grenade: 0.6, banger: nearCops ? 0.13 : 0.06, flare: 0.04, smoke: 0.03, paintCop: 0.12, hitCop: 0.16, sprayCop: 0.12, taserCop: 0.12, waterCop: 0.08, firework: 0.02, paintCar: data.car?.userData.police ? 0.06 : 0 }[ev]; if (T) { d.tension += T * k; d.quietT = 0; }
      const E = { flare: 0.25, smoke: 0.15, firework: 0.12, banger: 0.05 }[ev]; if (E) d.energy = clamp(d.energy + E, 0, 1);
      if ((ev === 'shot' || ev === 'grenade') && k === 1) { for (const h of [...d.members]) if (Math.random() < 0.6) { leaveDemo(h); h.userData.state = 'flee'; h.userData.fleeT = rnd(6, 10); h.rotation.x = 0; } }
      if (k === 1 && ['grenade', 'hitCop', 'sprayCop', 'taserCop', 'paintCop', 'shot'].includes(ev)) { stats.violence += ev === 'shot' || ev === 'grenade' ? 3 : 1; addRep('polizei', -2); addRep('anwohner', -1); }
      if (k === 1 && (ev === 'flare' || ev === 'smoke') && Math.random() < 0.5) post(pick(['lena', 'kollektiv', 'troll']), pick(['Pyro auf der Demo 🔥 sieht krass aus', 'Rauchtopf! Die Stimmung kocht 💨', 'Pyrotechnik ist kein Verbrechen.', 'Chaoten mit Bengalos. Typisch.']), Math.round(rnd(80, 900))); }
    if (ev === 'paintCar' && data.who === 'player' && data.car?.userData.police) addRep('polizei', -1);
    if ((ev === 'shot' || ev === 'grenade') && followers.length) { for (const f of followers) { f.userData.state = 'flee'; f.userData.fleeT = 8; } followers = []; }
  });

  // ---------- Minikarte ----------
  X.mmHooks.push((ctx, P) => { for (const d of demos) { if (d.result) continue; ctx.fillStyle = '#c86bff'; for (const h of d.members) { const [x, y] = P(h.position.x, h.position.z); ctx.fillRect(x - 1.5, y - 1.5, 3, 3); } ctx.fillStyle = '#4f8bff'; for (const c of d.pol.cops) { const [x, y] = P(c.position.x, c.position.z); ctx.fillRect(x - 1.5, y - 1.5, 3, 3); } }
    for (const c of cars) if (c.userData.cannon) { const [x, y] = P(c.position.x, c.position.z); ctx.fillStyle = '#4f8bff'; ctx.fillRect(x - 4, y - 4, 8, 8); ctx.strokeStyle = '#fff'; ctx.strokeRect(x - 4, y - 4, 8, 8); } });

  function spawnSquad(pos) { // Kreativmodus: Einsatzhundertschaft mit Wanne
    const near = demos.find(d => !d.result && Math.hypot(pos.x - d.cx, pos.z - d.cz) < 90); if (near) { copsNeeded(near, near.pol.cops.length + 6); if (near.pol.stage < 1) setStage(near, 1); return near; }
    const d = spawnDemo({ x: pos.x, z: pos.z, n: 0, noPolice: false, maxStage: 1 }); d.members.length = 0; d.state = 'guard'; d.banner.visible = false; d.guard = true; d.pol.stage = 1; copsNeeded(d, 6); for (const c of d.pol.cops) { c.position.set(pos.x + rnd(-3, 3), 0, pos.z + rnd(-3, 3)); c.userData.task = 'escort'; } policeCar(d, 0, 1, true); return d; }
  // Wachen ohne Demo bleiben stehen; endDemo erst, wenn der Spieler weit weg ist
  const _origUpdate = update;
  function update2(dt) { for (const d of demos) if (d.guard && !d.result) { d.age = 0; d.members.length = 0; d.cx = d.cx; } _origUpdate(dt); for (const d of demos) if (d.guard && !d.result && Math.hypot(player.pos.x - d.cx, player.pos.z - d.cz) > 250) endDemo(d, 'faded'); }

  return { addRoads,  jetEmit, driveTo, aimTurret, cannonSpray, addCar, SCHOOL_SLOGANS, update: update2, spawnDemo, endDemo, spontaneous, rally, film, carTrigger, spawnCannon, makeCannon, makeCop, makeMember, addSign, post, sub, say, rep, addRep, stats, demos, route, trailFrom, posAt, busted, removePed, removeCar, setStage, get followers() { return followers; }, get filming() { return filming; }, spawnSquad, freeSpot };
}

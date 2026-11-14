import { disposeHierarchy } from './dispose.js';
import { initWegweiser } from './wegweiser.js';
// Rückzugsort Zuhause (#149, André 13.11.2026): eine Wohnung in Bornheim nahe dem Wochenmarkt, betretbar über interiors.js.
// Das Haus wird zur Laufzeit aus den geladenen OSM-Daten gewählt (Wohnhaus nächst dem Startpunkt, Tür an einer freien Fassade
// ohne Laden davor), nicht über feste Gebäude-Indizes. Tür mit Schild „Zuhause“ nur in Spielernähe gebaut, Haus-Zeichen auf
// Minikarte und großer Karte, „Weg zeigen“ über den Wegweiser (Missionsliste in Handy und Pausenmenü).
// Drinnen: Kleiderschrank (drei Outfits als Farbwechsel an Oberteil, Hose und Schuhen, gespeichert unter notgta.outfit)
// und Bett (Stunden wählen, Zeitraffer mit Abblenden, Leben voll, bewusstes Speichern; nicht mit Fahndung).
/** @param {import('./types').Ctx} X @param {any} IN Rückgabe von initInteriors */
export function initZuhause(X, IN) {
  const A = /** @type {any} */ (X);
  const { THREE, scene, player, world, TH, showMsg, card, keys } = A;
  const WEG = A.WEG || (A.WEG = initWegweiser(X));
  const ANCHOR = [-138, 372]; // Startpunkt am Wochenmarkt Bornheim
  const PX = 60000, PZ = 0; // Taschenraum wie interiors.js
  const KEY = 'notgta.outfit';
  const OUTFITS = {
    alltag: { name: 'Alltag' }, // Farben des Modells
    demo: { name: 'Demo-Hoodie', top: 0x56603f, pants: 0x26282c, shoes: 0x3a3a3a },
    lauf: { name: 'Laufkleidung', top: 0x1aa0b8, pants: 0x151517, shoes: 0xe8ecef },
  };
  const HOURS = [1, 3, 6, 8];
  let outfitId = 'alltag'; try { const o = localStorage.getItem(KEY); if (o && OUTFITS[o]) outfitId = o; } catch (e) { /* ohne Speicher: Alltag */ }
  let home = null, lastMesh = null, lastN = 0, marker = null, findT = 0, sleeping = false;
  const atHome = () => !!(IN && IN.inside && IN.inside.zuhause);
  const uhr = h => { const t = ((h % 24) + 24) % 24, hh = Math.floor(t), mm = Math.floor((t - hh) * 60); return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'); };

  // ---------- Haus wählen ----------
  // Wohnhaus (ohne Art oder res/house/apartments, 8–30 m hoch) mit Mittelpunkt nächst ANCHOR; Tür an der Kante, vor der
  // 3 m frei sind, kein Laden/POI im Umkreis von 10 m und keine Fahrbahn: unter den passenden Kanten die straßennächste.
  function find() {
    const W = A.WORLD; if (!W || !W.buildings) return null; const [ax, az] = ANCHOR, cand = [];
    for (const b of W.buildings) {
      if (!b || !b.p || b.p.length < 4 || b.mh) continue; if (b.k && b.k !== 'res' && b.k !== 'house' && b.k !== 'apartments') continue; if (!(b.h >= 8 && b.h <= 30)) continue;
      const q = b.p[0]; if (Math.abs(q[0] - ax) > 160 || Math.abs(q[1] - az) > 160) continue;
      let cx = 0, cz = 0; for (const p of b.p) { cx += p[0]; cz += p[1]; } cx /= b.p.length; cz /= b.p.length;
      const d = Math.hypot(cx - ax, cz - az); if (d < 120) cand.push({ b, cx, cz, d });
    }
    cand.sort((a, c) => a.d - c.d || a.cx - c.cx);
    const pois = W.pois || [], free = (x, z) => A.solidAt(x, z) < 0;
    for (const c of cand) {
      let best = null, bd = 1e9;
      for (let e = 0; e < c.b.p.length; e++) {
        const en = A.edgeNormal(c.b.p, e); if (en.l < 5) continue;
        const mx = en.ax + en.dx / 2, mz = en.az + en.dz / 2, nx = en.nx, nz = en.nz, ux = en.dx / en.l, uz = en.dz / en.l;
        if (!free(mx + nx * 1.2, mz + nz * 1.2) || !free(mx + nx * 3, mz + nz * 3) || !free(mx + ux + nx * 1.2, mz + uz + nz * 1.2) || !free(mx - ux + nx * 1.2, mz - uz + nz * 1.2)) continue;
        let poi = false; for (const p of pois) if (p && p.k && (p.x - mx) ** 2 + (p.z - mz) ** 2 < 100) { poi = true; break; } if (poi) continue;
        const ex = mx + nx * 1.6, ez = mz + nz * 1.6, r = A.nearestRoadDir ? A.nearestRoadDir(ex, ez, 30) : null, rd = r ? Math.hypot(r.x - ex, r.z - ez) - r.w / 2 : 30;
        if (rd < 1) continue;
        if (rd < bd) { bd = rd; best = { x: mx, z: mz, nx, nz, ex, ez, yaw: Math.atan2(nx, nz) }; }
      }
      if (best) return best;
    }
    return null;
  }

  // ---------- Tür mit Schild (nur in der Nähe) ----------
  let MK = null;
  function mk() {
    if (MK) return MK;
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 80; const c = cv.getContext('2d');
    c.fillStyle = '#1f5a3a'; c.fillRect(0, 0, 256, 80); c.strokeStyle = '#f4f1e8'; c.lineWidth = 4; c.strokeRect(4, 4, 248, 72);
    c.fillStyle = '#f4f1e8'; c.beginPath(); c.moveTo(18, 42); c.lineTo(38, 22); c.lineTo(58, 42); c.lineTo(52, 42); c.lineTo(52, 60); c.lineTo(24, 60); c.lineTo(24, 42); c.closePath(); c.fill();
    c.font = '700 34px system-ui, Arial, sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText('Zuhause', 72, 42);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.userData.shared = true;
    MK = { doorG: new THREE.BoxGeometry(1.2, 2.2, 0.12), doorM: new THREE.MeshLambertMaterial({ color: 0x5a3d28, emissive: 0x2a1a10, emissiveIntensity: 0.4 }),
      signG: new THREE.PlaneGeometry(1.0, 0.32), signM: new THREE.MeshBasicMaterial({ map: tex }),
      lampG: new THREE.BoxGeometry(0.18, 0.18, 0.1), lampM: new THREE.MeshBasicMaterial({ color: 0xffe2a0 }) };
    for (const k in MK) MK[k].userData.shared = true; // für alle Aufbauten gleich, beim Abbau stehen lassen
    return MK;
  }
  function buildMarker() {
    const m = mk(), g = new THREE.Group();
    const door = new THREE.Mesh(m.doorG, m.doorM); door.position.set(0, 1.1, 0.07); g.add(door);
    const sign = new THREE.Mesh(m.signG, m.signM); sign.position.set(0, 2.45, 0.09); g.add(sign);
    const lamp = new THREE.Mesh(m.lampG, m.lampM); lamp.position.set(0.85, 2.0, 0.1); g.add(lamp);
    g.position.set(home.x, TH(home.ex, home.ez), home.z); g.rotation.y = Math.atan2(home.nx, home.nz); g.userData.noChunk = true; g.updateMatrixWorld(true);
    scene.add(g); return g;
  }
  function updateMarker() {
    const d = home ? Math.hypot(player.pos.x - home.x, player.pos.z - home.z) : 1e9;
    if (!marker && d < 150) marker = buildMarker();
    else if (marker && d > 220) { scene.remove(marker); disposeHierarchy(marker); marker = null; }
  }

  // ---------- Karten ----------
  const icon = (ctx, x, y, s) => { ctx.save(); ctx.fillStyle = '#f0a830'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x + s * 0.7, y); ctx.lineTo(x + s * 0.7, y + s * 0.8); ctx.lineTo(x - s * 0.7, y + s * 0.8); ctx.lineTo(x - s * 0.7, y); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); };
  if (A.mmHooks) A.mmHooks.push((ctx, P, R) => { if (!home || atHome()) return; let [x, y] = P(home.x, home.z); const L = Math.hypot(x, y); if (R && L > R - 8) { if (Math.hypot(player.pos.x - home.x, player.pos.z - home.z) > 800) return; x *= (R - 8) / L; y *= (R - 8) / L; } icon(ctx, x, y, 7); });
  if (A.mapHooks) A.mapHooks.push((ctx, P) => { if (!home) return; const [x, y] = P(home.x, home.z); icon(ctx, x, y, 8); ctx.save(); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.strokeText('Zuhause', x, y + 9); ctx.fillText('Zuhause', x, y + 9); ctx.restore(); });

  // ---------- Weg zeigen (Wegweiser; eine Strecke zugleich) ----------
  let route = null, rafOn = false;
  function loop() { if (rafOn) return; rafOn = true; let t0 = performance.now();
    const f = () => { if (!route || WEG.cur !== route) { rafOn = false; route = null; return; } const t = performance.now(); WEG.update(Math.min(0.1, (t - t0) / 1000)); t0 = t; requestAnimationFrame(f); }; requestAnimationFrame(f); }
  function guide(on) {
    if (!on) { if (route && WEG.cur === route) WEG.route(null); route = null; return true; }
    if (route && WEG.cur === route) return true; if (atHome()) { showMsg('DU BIST SCHON ZUHAUSE', 1200); return false; } if (!WEG.frei()) return false;
    route = { pts: [home ? [home.ex, home.ez] : ANCHOR.slice()], i: 0, label: '🏠 Zuhause' }; WEG.route(route); loop(); card('WEG NACH HAUSE', 'Dem grünen Strahl folgen', 3); return true;
  }

  // ---------- Outfits ----------
  // Spielermodell hero_man/hero_woman (GLB): Kleidung liegt in den Knoten *_Body, *_Legs, *_Feet; Haut, Augen und Haare bleiben.
  // Die GLB-Materialien teilen sich alle Klone (auch Demo-Figuren): je Spielermodell einmal klonen, dann nur die Farbe setzen.
  // Ersatzfigur aus Kästen (Modelle nicht geladen): Oberteil = Rumpf, Hose und Schuhe am linken Bein.
  function partOf(q) {
    const mn = (q.material && q.material.name) || ''; if (/^(Skin|Eye|Hair|Brow)/i.test(mn)) return null;
    const nm = (q.name || '') + '|' + ((q.parent && q.parent.name) || '');
    return /Body/i.test(nm) ? 'top' : /Legs/i.test(nm) ? 'pants' : /Feet/i.test(nm) ? 'shoes' : null;
  }
  function paint(mat, part, o) { if (!mat || !mat.color) return; if (!mat.userData.zhCol) mat.userData.zhCol = mat.color.clone(); const c = o[part]; if (c === undefined) mat.color.copy(mat.userData.zhCol); else mat.color.setHex(c); }
  function applyOutfit(id) {
    const m = player.mesh; if (!m) return 0; const o = OUTFITS[id] || OUTFITS.alltag; let n = 0;
    m.traverse(q => { if (!q.isMesh || !q.material || Array.isArray(q.material)) return; const part = partOf(q); if (!part) return;
      if (!q.userData.zhOwn) { q.material = q.material.clone(); q.userData.zhOwn = true; } paint(q.material, part, o); n++; });
    const u = m.userData;
    if (!n && u.torso && u.legL) { paint(u.torso.material, 'top', o); const lg = u.legL.children; if (lg[0]) paint(lg[0].material, 'pants', o); if (lg[1]) paint(lg[1].material, 'shoes', o); n = 3; }
    lastN = n; return n;
  }
  function setOutfit(id) {
    if (!OUTFITS[id]) return false; outfitId = id; try { localStorage.setItem(KEY, id); } catch (e) { /* bleibt bis zum Neuladen */ }
    applyOutfit(id); A.sfx && A.sfx('click', 0.5); showMsg('OUTFIT: ' + OUTFITS[id].name.toUpperCase(), 1300, 'ok'); return true;
  }

  // ---------- Schlafen ----------
  function blocked() {
    if (player.wanted > 0) return 'NICHT MIT FAHNDUNG – ERST ABTAUCHEN';
    if (A.storyBusy && A.storyBusy()) return 'ERST DIE STORY PAUSIEREN';
    if ((A.VOKA_BUSY && A.VOKA_BUSY()) || WEG.cur) return 'ERST DIE AKTUELLE AUFGABE BEENDEN';
    return null;
  }
  function sleep(h) {
    if (sleeping || !HOURS.includes(h)) return Promise.resolve(false); const why = blocked(); if (why) { showMsg(why, 1600); return Promise.resolve(false); }
    sleeping = true;
    const ov = document.createElement('div'); ov.style.cssText = 'position:fixed;inset:0;background:#000;color:#ddd;display:flex;align-items:center;justify-content:center;z-index:46;font:700 24px system-ui,sans-serif;opacity:0;transition:opacity .6s';
    ov.textContent = 'Schlafen …'; document.body.appendChild(ov); setTimeout(() => { ov.style.opacity = '1'; }, 30);
    return new Promise(res => setTimeout(() => {
      try { world.hour = (world.hour + h) % 24; player.hp = Math.max(player.hp || 0, 100); if (A.saveGame) A.saveGame(true, true); ov.textContent = uhr(world.hour) + ' Uhr'; } catch (e) { console.warn('zuhause: schlafen', e); }
      setTimeout(() => { ov.style.opacity = '0'; setTimeout(() => { ov.remove(); sleeping = false; card('AUSGESCHLAFEN', `${uhr(world.hour)} Uhr · Leben voll · Spielstand gespeichert`, 4); res(true); }, 650); }, 900);
    }, 700));
  }

  // ---------- Auswahlfenster (Kleiderschrank, Bett) ----------
  let menuEl = null, menuOpts = [], wasLocked = false;
  const menuOn = () => !!menuEl && menuEl.style.display === 'flex';
  function closeMenu() { if (!menuOn()) return; menuEl.style.display = 'none'; A.shopOpen = false; /** @type {any} */ (window).__noAutoMenu = false; if (wasLocked) { wasLocked = false; try { A.renderer.domElement.requestPointerLock(); } catch (e) { /* ohne Sperre weiter */ } } }
  function menu(kind) {
    if (!atHome() || sleeping) return false;
    if (kind === 'bett') { const why = blocked(); if (why) { showMsg(why, 1600); return false; } }
    if (!menuEl) { menuEl = document.createElement('div'); menuEl.id = 'zuhausemenu'; menuEl.style.cssText = 'position:fixed;inset:0;background:#000b;display:none;align-items:center;justify-content:center;z-index:45;font-family:system-ui,sans-serif'; document.body.appendChild(menuEl); }
    menuOpts = kind === 'schrank'
      ? Object.entries(OUTFITS).map(([id, o]) => ({ label: o.name + (id === outfitId ? ' ✓' : ''), k: 'o', v: id, fn: () => setOutfit(id) }))
      : HOURS.map(h => ({ label: `${h} ${h > 1 ? 'Stunden' : 'Stunde'} · bis ${uhr(world.hour + h)} Uhr`, k: 'h', v: String(h), fn: () => { sleep(h); } }));
    const box = document.createElement('div'); box.style.cssText = 'background:#16181d;color:#eee;border:1px solid #333;border-radius:12px;padding:16px 18px;width:min(420px,92vw)';
    const h3 = document.createElement('h3'); h3.style.margin = '0 0 4px'; h3.textContent = kind === 'schrank' ? '👕 Kleiderschrank' : '🛏 Bett'; box.appendChild(h3);
    const sub = document.createElement('div'); sub.style.cssText = 'color:#aaa;font-size:13px;margin-bottom:10px'; sub.textContent = kind === 'schrank' ? 'Was ziehst du an?' : `Jetzt ${uhr(world.hour)} Uhr · Schlafen füllt das Leben auf und speichert`; box.appendChild(sub);
    const bcss = 'display:block;width:100%;text-align:left;margin:6px 0;background:#232730;color:#eee;border:1px solid #3a3f4a;border-radius:8px;padding:9px 12px;font:600 15px system-ui;cursor:pointer';
    menuOpts.forEach((o, i) => { const b = document.createElement('button'); b.type = 'button'; b.style.cssText = bcss; b.textContent = `${i + 1} · ${o.label}`; b.dataset[o.k] = o.v; b.onclick = () => { closeMenu(); o.fn(); }; box.appendChild(b); });
    const x = document.createElement('button'); x.type = 'button'; x.style.cssText = bcss + ';text-align:center;background:#2a2d35;color:#bbb'; x.textContent = 'Abbrechen'; x.onclick = () => closeMenu(); box.appendChild(x);
    menuEl.innerHTML = ''; menuEl.appendChild(box);
    wasLocked = !!document.pointerLockElement; /** @type {any} */ (window).__noAutoMenu = true; if (wasLocked) document.exitPointerLock(); A.shopOpen = true; for (const k in keys) keys[k] = false;
    menuEl.style.display = 'flex'; return true;
  }
  // Esc/F schließen, Ziffern wählen (vor den Spieltasten, wie das Fahrkartenmenü)
  addEventListener('keydown', e => { if (!menuOn()) return; const n = /^Digit([1-9])$/.exec(e.code);
    if (e.code === 'Escape' || (e.code === 'KeyF' && !e.repeat)) closeMenu(); else if (n && menuOpts[+n[1] - 1] && !e.repeat) { const o = menuOpts[+n[1] - 1]; closeMenu(); o.fn(); } else return;
    e.preventDefault(); e.stopImmediatePropagation(); }, true);

  // ---------- Wohnung (Taschenraum über interiors.js) ----------
  /** Mehrere Geometrien zu einer (wie supermarkt.js, ohne three-Zusätze). */
  const merge = geos => { const ni = geos.map(q => q.index ? q.toNonIndexed() : q); let n = 0; for (const q of ni) n += q.attributes.position.count;
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2); let o = 0;
    for (let i = 0; i < ni.length; i++) { const q = ni[i]; P.set(q.attributes.position.array, o * 3); N.set(q.attributes.normal.array, o * 3); U.set(q.attributes.uv.array, o * 2); o += q.attributes.position.count; if (q !== geos[i]) q.dispose(); geos[i].dispose(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.BufferAttribute(U, 2)); return g; };
  function buildRoom() {
    const W2 = 5, D2 = 4, H = 2.8, parts = new Map(); // je Farbe eine Geometrie, ein Draw-Call
    const box = (col, w, h, d, x, y, z, basic) => { const q = new THREE.BoxGeometry(w, h, d); q.translate(PX + x, y, PZ + z); const k = (basic ? 'B' : 'L') + col; if (!parts.has(k)) parts.set(k, []); parts.get(k).push(q); };
    const holz = 0x7a5a3a;
    box(0xa0764a, W2 * 2, 0.02, D2 * 2, 0, 0, 0); // Dielenboden
    box(0xf4f1ea, W2 * 2, 0.02, D2 * 2, 0, H, 0); // Decke
    box(0xefe6d6, W2 * 2, H, 0.1, 0, H / 2, -D2 - 0.05); box(0xefe6d6, W2 * 2, H, 0.1, 0, H / 2, D2 + 0.05); box(0xefe6d6, 0.1, H, D2 * 2, -W2 - 0.05, H / 2, 0); box(0xefe6d6, 0.1, H, D2 * 2, W2 + 0.05, H / 2, 0); // Wände
    box(holz, 1.1, 2.1, 0.08, 0, 1.05, -D2 + 0.04); box(0xb0b4b8, 0.04, 0.2, 0.06, 0.4, 1.0, -D2 + 0.1); // Wohnungstür mit Klinke
    box(0x6b4a33, 2.0, 0.35, 2.2, 3.75, 0.175, 2.7); box(0x4a6fa5, 1.9, 0.2, 2.1, 3.75, 0.45, 2.7); box(0xf2f2f2, 1.5, 0.12, 0.4, 3.75, 0.6, 3.55); box(0x6b4a33, 2.0, 0.9, 0.08, 3.75, 0.6, 3.86); // Bett
    box(0x8a6a4a, 0.6, 2.1, 2.0, -4.65, 1.05, 1.5); box(0x3a2a1a, 0.02, 1.9, 0.03, -4.34, 1.05, 1.5); box(0xb0b4b8, 0.03, 0.25, 0.04, -4.33, 1.1, 1.35); box(0xb0b4b8, 0.03, 0.25, 0.04, -4.33, 1.1, 1.65); // Kleiderschrank
    box(0x5b6b4a, 2.4, 0.42, 0.8, 0, 0.21, 3.45); box(0x5b6b4a, 2.4, 0.5, 0.2, 0, 0.67, 3.8); box(0x5b6b4a, 0.2, 0.6, 0.8, -1.2, 0.3, 3.45); box(0x5b6b4a, 0.2, 0.6, 0.8, 1.2, 0.3, 3.45); // Sofa
    box(0xa54b3a, 2.6, 0.01, 1.8, 0, 0.02, 1.6); // Teppich
    box(holz, 1.4, 0.06, 0.9, -1.5, 0.75, -1.0); for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(holz, 0.06, 0.72, 0.06, -1.5 + sx * 0.62, 0.36, -1.0 + sz * 0.38); // Tisch
    box(0x8a6a4a, 0.35, 1.8, 2.0, 4.78, 0.9, -1.9); for (let i = 0; i < 12; i++) box([0x2f6b8a, 0xb0483a, 0xd8c070][i % 3], 0.22, 0.26 + (i % 4) * 0.03, 0.12, 4.68, 0.5 + Math.floor(i / 6) * 0.6, -2.7 + (i % 6) * 0.3); // Regal mit Büchern
    box(0xb8643a, 0.35, 0.4, 0.35, -4.5, 0.2, -3.5); box(0x3f7a3a, 0.5, 0.6, 0.5, -4.5, 0.75, -3.5); // Pflanze
    box(world.night ? 0x1a2a4a : 0xbfe0ff, 2.0, 1.2, 0.04, -2.6, 1.6, D2 - 0.02, true); box(0xfff2d6, 0.6, 0.05, 0.6, 0, H - 0.04, 0, true); // Fenster, Deckenlampe
    const g = new THREE.Group();
    for (const [k, geos] of parts) { const col = +k.slice(1); const mat = k[0] === 'B' ? new THREE.MeshBasicMaterial({ color: col }) : new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.3 }); g.add(new THREE.Mesh(merge(geos), mat)); }
    const R = { g, W2, D2, H, zuhause: true, walls: [[2.6, 1.5, 4.9, 3.9], [-4.9, 0.4, -4.2, 2.6], [-1.35, 3.0, 1.35, 3.95], [-2.25, -1.55, -0.75, -0.45], [4.5, -3.0, 4.95, -0.8], [-4.8, -3.8, -4.2, -3.2]], triggers: [] };
    R.triggers.push({ x: 0, z: -3.2, r: 1.2, label: 'F · Raus auf die Straße', act: () => IN.leave() });
    R.triggers.push({ x: -3.5, z: 1.5, r: 1.3, label: 'F · Kleiderschrank: Outfit wechseln', act: () => menu('schrank') });
    R.triggers.push({ x: 2.0, z: 2.6, r: 1.3, label: 'F · Bett: schlafen (Zeit vorstellen, speichert)', act: () => menu('bett') });
    return R;
  }
  function enter() {
    if (!home || !IN || !IN.enter) return false; if (player.car || player.dead) return false;
    if (player.wanted > 0) { showMsg('POLIZEI SUCHT DICH – ERST ABTAUCHEN', 1400); return false; }
    guide(false);
    IN.enter(buildRoom(), [0, -2.4], 0, { x: home.ex, z: home.ez, yaw: home.yaw }, 'Zuhause', [home.ex, home.ez]);
    showMsg('ZUHAUSE', 1000); return true;
  }
  // Tür: F-Aktion vor U-Bahn, Läden und Hauseingang (interiors.js fragt X.fHooks zuerst ab)
  A.fHooks = A.fHooks || [];
  A.fHooks.push(() => { if (!home) return null; const dx = player.pos.x - (home.x + home.nx * 0.8), dz = player.pos.z - (home.z + home.nz * 0.8); if (dx * dx + dz * dz > 4) return null; if (Math.abs(player.pos.y - TH(home.ex, home.ez)) > 1.5) return null; return { label: 'F · Nach Hause', act: enter }; });

  // ---------- Takt (eigener, keine Zeile in der Spielschleife) ----------
  function tick() {
    if (player.mesh && player.mesh !== lastMesh) { lastMesh = player.mesh; applyOutfit(outfitId); } // Modell neu gebaut (Spielstart): Outfit wieder anlegen
    if (!home && --findT <= 0) { findT = 2; const inPocket = A.inPocket && A.inPocket(player.pos.x, player.pos.z); if (!inPocket && Math.hypot(player.pos.x - ANCHOR[0], player.pos.z - ANCHOR[1]) < 700) home = find(); }
    updateMarker();
    if (route && WEG.cur === route) { if (home) { const p = route.pts[0]; p[0] = home.ex; p[1] = home.ez; if (Math.hypot(player.pos.x - home.ex, player.pos.z - home.ez) < 6) { guide(false); showMsg('ZUHAUSE', 1000); } } }
  }
  setInterval(() => { try { tick(); } catch (e) { console.warn('zuhause', e); } }, 1000);

  return { find: () => (home = home || find()), enter, menu, outfit: setOutfit, sleep, guide, OUTFITS, HOURS,
    get home() { return home; }, get guiding() { return !!route && WEG.cur === route; }, get inside() { return atHome(); }, look: () => ({ id: outfitId, n: lastN }) };
}

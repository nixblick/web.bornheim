import { disposeHierarchy } from './dispose.js';
// Minispiele mit Lokalkolorit (#147, André 13.11.2026): Tischtennis an den echten Platten und Rubbellos am Kiosk.
// Tischtennis: an jeder Fläche aus OSM (green k 'pitch', s 'table_tennis', z. B. Günthersburgpark) steht in Spielernähe eine
// Betonplatte (Platte, Linien, Netz und Füße; 3 Draw-Calls, geteilte Materialien, Abbau beim Weggehen wie supermarkt.js).
// F an der Platte startet ein Spiel bis 11 (zwei Punkte Vorsprung) gegen einen Passanten: Ball kommt auf dich zu,
// Leertaste, Klick oder Tippen im grünen Feld schlägt zurück, zu früh oder zu spät kostet den Punkt. Esc gibt auf.
// Belohnung nur EP (progress.js), kein Geld. Zählt als Aktivität: nicht neben Laufrunde, Eulen-Lauf, Nebenjob oder Story.
// Rubbellos: neuer Artikel im Kiosk (shops.js), drei Felder, kleine Gewinntabelle, „nur Spielgeld“. Erwartungswert deutlich
// unter dem Preis; EP nur für die ersten drei Lose am Tag. Tischkicker fehlt bewusst: kein Jugendhaus in den Kartendaten.
/** @param {import('./types').Ctx} X @param {any} SHOPS */
export function initMinispiele(X, SHOPS) {
  const A = /** @type {any} */ (X);
  const { THREE, scene, player, TH, keys, showMsg, card, sfx } = A;
  const NAH = 150, WEG = 220, MAX = 6, REICH = 2.8;
  const stats = { ep: 0, spiele: 0, siege: 0, lose: 0, gewinn: 0 };
  const gain = (n, why) => { if (A.PROGRESS_GAIN) A.PROGRESS_GAIN(n, why); stats.ep += n; };

  // ---------- Tageszähler (EP nur die ersten Male am Tag) ----------
  function heute(key) { const t = new Date(), d = t.getFullYear() + '-' + (t.getMonth() + 1) + '-' + t.getDate(); let o = { d, n: 0 }; // Ortszeit-Tag
    try { const s = JSON.parse(localStorage.getItem(key) || 'null'); if (s && s.d === d) o = s; } catch (e) { /* ohne Speicher: zählt nur diese Sitzung */ }
    return { get n() { return o.n; }, inc() { o.n++; try { localStorage.setItem(key, JSON.stringify(o)); } catch (e) { /* nur diese Sitzung */ } } }; }

  // ---------- Fenster (gemeinsam für beide Spiele) ----------
  let ui = null, wasLocked = false, offen = null; // offen: 'tt' | 'los' | null
  function buildUi() { const el = document.createElement('div'); el.id = 'minispiel'; el.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:61;background:#0008;font-family:system-ui,sans-serif;touch-action:none';
    el.innerHTML = '<div style="background:#16181d;color:#eee;border:1px solid #333;border-radius:14px;padding:14px 16px;width:min(92vw,380px);box-shadow:0 8px 30px #0008;text-align:center"><div class="ms_t" style="font-size:13px;color:#aab"></div><div class="ms_s" style="font-size:24px;font-weight:700;margin:6px 0"></div><div class="ms_b"></div><div class="ms_m" style="min-height:20px;font-size:15px;margin-top:6px;color:#ffd84a"></div><div class="ms_f" style="font-size:12px;color:#99a;margin-top:6px"></div><button type="button" class="ms_x" style="margin-top:8px;background:#2a2d35;color:#eee;border:1px solid #444;border-radius:8px;padding:7px 14px;font:600 14px system-ui;cursor:pointer"></button></div>';
    for (const ev of ['mousedown', 'pointerdown', 'touchstart', 'touchend', 'click', 'wheel']) el.addEventListener(ev, e => e.stopPropagation());
    document.body.appendChild(el); return el; }
  const q = sel => ui.querySelector(sel);
  function oeffnen(art) { ui = ui || buildUi(); offen = art; wasLocked = wasLocked || !!document.pointerLockElement; if (document.pointerLockElement) document.exitPointerLock(); window.__noAutoMenu = true; for (const k in keys) keys[k] = false; ui.style.display = 'flex'; }
  function schliessen() { if (ui) ui.style.display = 'none'; offen = null; window.__noAutoMenu = false; if (wasLocked) { wasLocked = false; try { A.renderer.domElement.requestPointerLock(); } catch (e) { /* Maus bleibt frei */ } } }
  // Holt sich der Laden beim Schließen die Maus zurück, während unser Fenster offen ist: wieder freigeben
  document.addEventListener('pointerlockchange', () => { if (offen && document.pointerLockElement) { wasLocked = true; document.exitPointerLock(); } });

  // ======================= Tischtennis =======================
  let M = null;
  function mats() {
    if (M) return M;
    M = { platte: new THREE.MeshLambertMaterial({ color: 0x2f6b4f }), linie: new THREE.MeshLambertMaterial({ color: 0xf2f2ee }), beton: new THREE.MeshLambertMaterial({ color: 0x8a8a84 }) };
    for (const k in M) M[k].userData.shared = true; // Cache für alle Platten: disposeHierarchy darf ihn nicht freigeben
    return M;
  }
  /** Mehrere Geometrien zu einer (Position, Normale, UV; ohne Index), wie supermarkt.js */
  const merge = geos => { const ni = geos.map(g => g.index ? g.toNonIndexed() : g); let n = 0; for (const g of ni) n += g.attributes.position.count;
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2); let o = 0;
    for (let i = 0; i < ni.length; i++) { const g = ni[i]; P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); U.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; if (g !== geos[i]) g.dispose(); geos[i].dispose(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.BufferAttribute(U, 2)); return g; };
  const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
  /** Betonplatte im lokalen Rahmen: x = Längsachse (2,74 m), z quer (1,525 m), Ursprung am Boden in der Mitte */
  function makeTisch() {
    const m = mats(), g = new THREE.Group();
    const platte = [box(2.74, 0.06, 1.525, 0, 0.73, 0)];
    const linie = [box(2.74, 0.004, 0.02, 0, 0.762, 0.752), box(2.74, 0.004, 0.02, 0, 0.762, -0.752), box(0.02, 0.004, 1.525, 1.36, 0.762, 0), box(0.02, 0.004, 1.525, -1.36, 0.762, 0), box(2.74, 0.004, 0.006, 0, 0.762, 0)];
    const beton = [box(0.3, 0.7, 1.1, 0.85, 0.35, 0), box(0.3, 0.7, 1.1, -0.85, 0.35, 0), box(0.03, 0.16, 1.62, 0, 0.84, 0), box(0.06, 0.2, 0.06, 0, 0.82, 0.8), box(0.06, 0.2, 0.06, 0, 0.82, -0.8)];
    for (const [geos, mat] of [[platte, m.platte], [linie, m.linie], [beton, m.beton]]) { const me = new THREE.Mesh(merge(geos), mat); me.castShadow = mat !== m.linie; me.receiveShadow = true; g.add(me); }
    return g;
  }
  // Platten aus den geladenen Grünflächen; Liste nur neu, wenn sich die Grünflächen ändern (greenVer)
  let ver = -1, PL = [];
  function platten() {
    const W = A.WORLD || A.CITY; if (!W || !W.green) return PL; if ((W.greenVer | 0) === ver) return PL; ver = W.greenVer | 0; PL = [];
    for (const f of W.green) { if (!f || f.k !== 'pitch' || f.s !== 'table_tennis' || !f.p || f.p.length < 3) continue;
      let cx = 0, cz = 0; for (const p of f.p) { cx += p[0]; cz += p[1]; } cx /= f.p.length; cz /= f.p.length;
      let bl = 0, ang = 0; for (let i = 0; i < f.p.length; i++) { const a = f.p[i], b = f.p[(i + 1) % f.p.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > bl) { bl = l; ang = Math.atan2(b[1] - a[1], b[0] - a[0]); } }
      PL.push({ key: 't' + cx.toFixed(0) + ',' + cz.toFixed(0), x: cx, z: cz, ang }); }
    return PL;
  }
  const built = new Map(); // key -> Group (leer = hier nichts bauen)
  function update() {
    const px = player.pos.x, pz = player.pos.z, want = [];
    for (const t of platten()) { if (want.length >= MAX) break; if ((t.x - px) ** 2 + (t.z - pz) ** 2 < NAH * NAH) want.push(t); }
    const keysW = new Set(want.map(t => t.key));
    for (const [k, g] of built) { if (keysW.has(k)) continue; if ((g.userData.x - px) ** 2 + (g.userData.z - pz) ** 2 > WEG * WEG) { scene.remove(g); disposeHierarchy(g); built.delete(k); } }
    for (const t of want) { if (built.has(t.key)) continue; let g;
      if (A.solidAt && A.solidAt(t.x, t.z) >= 0) g = new THREE.Group(); // Fläche liegt im Haus (Datenfehler): nichts bauen
      else { g = makeTisch(); g.position.set(t.x, TH(t.x, t.z), t.z); g.rotation.y = -t.ang; g.updateMatrixWorld(true); }
      g.userData.x = t.x; g.userData.z = t.z; g.userData.noChunk = true; built.set(t.key, g); scene.add(g); }
  }
  setInterval(() => { try { update(); } catch (e) { console.warn('minispiele', e); } }, 1500); // eigener Takt, keine Zeile in der Spielschleife

  // ---------- Das Spiel ----------
  const ZONE = 0.2, PERFEKT = 0.07; // Schlagfeld am eigenen Ende (Anteil der Tischlänge) und beste Stelle darin
  let m = null, cv = null, raf = 0, tLast = 0;
  // Testhilfen: tt.auto = true trifft immer genau, tt.tempo beschleunigt das Spiel
  const tt = { auto: false, tempo: 1, last: null, start, abbruch, get spiel() { return m; }, nahe: () => !!naheTisch(),
    get tische() { let n = 0; for (const g of built.values()) if (g.children.length) n++; return n; }, get platten() { return platten().length; } };
  const busy = () => { const W = A.WEG && A.WEG.cur; if (W) return 'LÄUFT NOCH: ' + String(W.label || 'STRECKE').toUpperCase() + ' · ERST BEENDEN';
    if (A.storyBusy && A.storyBusy()) return 'ERST DIE STORY BEENDEN'; return null; }; // Vokabaum-Fragen sind selbst ein Fenster, F kommt dann nicht an
  const blocked = () => player.car || player.dead || player.wanted > 0 || (A.creative && A.creative.on) || A.shopOpen || !!offen;
  function naheTisch() { let best = null, bd = REICH * REICH; for (const g of built.values()) { if (!g.children.length) continue; const d = (g.userData.x - player.pos.x) ** 2 + (g.userData.z - player.pos.z) ** 2; if (d < bd) { bd = d; best = g; } } return best; }
  const fAkt = { label: 'F · Tischtennis: ein Satz bis 11 gegen einen Passanten', act: () => { start(); } };
  A.fHooks = A.fHooks || [];
  A.fHooks.push(() => (blocked() || !naheTisch()) ? null : fAkt);

  function start() {
    if (blocked()) return false; const b = busy(); if (b) { showMsg(b, 1800); return false; }
    oeffnen('tt'); stats.spiele++;
    m = { ich: 0, er: 0, phase: 'pause', t: 1.2, dir: -1, u: 1, v: 0.85, x0: 0.5, x1: 0.5, swung: false, pMiss: 0.1, n: 0 };
    q('.ms_t').textContent = 'Tischtennis · Passant aus dem Park · bis 11, zwei Punkte Vorsprung';
    q('.ms_b').innerHTML = '<canvas width="240" height="300" style="width:min(60vw,240px);height:auto;border-radius:8px;background:#1d2a22;touch-action:none"></canvas>';
    cv = q('.ms_b canvas'); cv.addEventListener('pointerdown', e => { e.preventDefault(); schlag(); });
    q('.ms_f').textContent = 'Leertaste, Klick oder Tippen, wenn der Ball im grünen Feld ist · Esc gibt auf';
    const x = q('.ms_x'); x.textContent = 'Aufgeben'; x.onclick = () => abbruch('SPIEL ABGEBROCHEN');
    zeigen(''); sfx('click', 0.5); tLast = performance.now(); raf = requestAnimationFrame(loop); return true;
  }
  function zeigen(msg) { q('.ms_s').textContent = `Du ${m.ich} : ${m.er} Passant`; q('.ms_m').textContent = msg; } // nur bei Punkt oder Schlag, nicht je Bild
  const aufschlagIch = () => { const s = m.ich + m.er; return (s >= 20 ? s : Math.floor(s / 2)) % 2 === 1; }; // alle zwei Punkte Wechsel, ab 10:10 jeder Punkt
  function punkt(ich, msg) {
    if (ich) m.ich++; else m.er++; sfx('click', ich ? 0.6 : 0.3);
    if ((m.ich >= 11 || m.er >= 11) && Math.abs(m.ich - m.er) >= 2) { zeigen(msg); return ende(); }
    m.phase = 'pause'; m.t = 0.9; zeigen(msg + (m.ich >= 10 && m.er >= 10 && m.ich === m.er ? ' · Einstand' : ''));
  }
  function flug(dir, v) { m.dir = dir; m.v = Math.min(2.2, v); m.x0 = m.x1; m.x1 = 0.2 + Math.random() * 0.6; m.u = dir < 0 ? 1 : 0; m.swung = false; m.phase = 'flug'; }
  function schlag() {
    if (!m || m.phase !== 'flug' || m.dir > 0 || m.swung) return; m.swung = true;
    if (m.u > ZONE) return punkt(false, 'Zu früh');
    const g = Math.max(0, 1 - Math.abs(m.u - PERFEKT) / (ZONE - PERFEKT)); // 1 = genau getroffen
    m.n++; m.pMiss = 0.06 + 0.34 * g; sfx('click', 0.5);
    q('.ms_m').textContent = g > 0.75 ? 'Perfekt!' : g > 0.35 ? 'Gut' : 'Knapp';
    flug(1, m.v * (1.03 + 0.05 * g));
  }
  function tick(dt) {
    if (m.phase === 'pause') { m.t -= dt; if (m.t > 0) return; m.n = 0; if (aufschlagIch()) { m.pMiss = 0.12; flug(1, 0.8); } else flug(-1, 0.8); return; }
    m.u += m.dir * m.v * dt;
    if (m.dir < 0) {
      if (tt.auto && !m.swung && m.u <= PERFEKT) { m.u = PERFEKT; schlag(); return; } // Testhilfe: trifft immer genau
      if (m.u < -0.06 && !m.swung) punkt(false, 'Zu spät');
      return;
    }
    if (m.u >= 1) { if (Math.random() < m.pMiss) punkt(true, m.n ? 'Passant verfehlt' : 'Ass!'); else flug(-1, m.v * 1.04); }
  }
  function zeichne() {
    const c = cv.getContext('2d'), w = cv.width, h = cv.height, mx = 20, my = 16, tw = w - 2 * mx, th = h - 2 * my;
    c.clearRect(0, 0, w, h); c.fillStyle = '#2f6b4f'; c.fillRect(mx, my, tw, th); c.strokeStyle = '#f2f2ee'; c.lineWidth = 2; c.strokeRect(mx, my, tw, th);
    c.beginPath(); c.moveTo(w / 2, my); c.lineTo(w / 2, h - my); c.lineWidth = 1; c.stroke();
    c.fillStyle = '#3a3d42'; c.fillRect(mx - 8, my + th / 2 - 2, tw + 16, 4); // Netz
    c.fillStyle = 'rgba(120,255,150,0.28)'; c.fillRect(mx, my + th * (1 - ZONE), tw, th * ZONE); // Schlagfeld
    if (m.phase !== 'flug') return;
    const k = m.dir < 0 ? 1 - m.u : m.u, bx = mx + tw * (m.x0 + (m.x1 - m.x0) * k), by = my + th * (1 - m.u), hop = Math.abs(Math.sin(k * Math.PI)) * 7;
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.arc(bx, by, 5, 0, 7); c.fill();
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(bx, by - hop, 5 + hop * 0.25, 0, 7); c.fill();
    const xi = m.dir < 0 ? m.x1 : m.x0, xe = m.dir < 0 ? m.x0 : m.x1; // eigener Schläger unten, Passant oben
    c.fillStyle = '#c0392b'; c.fillRect(mx + tw * xi - 14, h - my + 2, 28, 7); c.fillRect(mx + tw * xe - 14, my - 9, 28, 7);
  }
  function loop() {
    if (!m) return; const now = performance.now(), dt = Math.min(0.25, (now - tLast) / 1000) * tt.tempo; tLast = now;
    if (player.dead) return abbruch(); tick(dt); if (!m) return; zeichne(); raf = requestAnimationFrame(loop);
  }
  function stop() { cancelAnimationFrame(raf); m = null; cv = null; schliessen(); }
  function abbruch(msg) { if (!m) return; tt.last = { ich: m.ich, er: m.er, abgebrochen: true }; stop(); if (msg) showMsg(msg, 1400); }
  function ende() {
    const sieg = m.ich > m.er, tag = heute('tischtennisTag'), ep = tag.n < 3 ? (sieg ? 40 : 10) : 5; // volle EP für die ersten drei Sätze am Tag
    const r = { ich: m.ich, er: m.er, sieg, ep }; tt.last = r; stop(); tag.inc(); if (sieg) stats.siege++; gain(ep, 'Tischtennis');
    sfx(r.sieg ? 'pickup' : 'click', 0.6);
    card(r.sieg ? 'SATZ GEWONNEN' : 'SATZ VERLOREN', `${r.ich}:${r.er} gegen den Passanten · +${ep} EP · ${r.sieg ? '„Starker Rückhand!“' : '„Revanche wann immer du willst.“'}`, 5);
  }

  // ======================= Rubbellos =======================
  // Gewinntabelle, Wahrscheinlichkeit je Los. Erwartungswert 0,01·20 + 0,03·6 + 0,05·4 + 0,08·2 = 0,74 € bei 3 € Preis.
  const PREIS = 3, SYM = ['🍏 Äppler', '🥨 Brezel', '🌿 Grie Soß', '⭐ Stern'];
  const TAB = [{ s: 3, geld: 20, p: 0.01 }, { s: 0, geld: 6, p: 0.03 }, { s: 1, geld: 4, p: 0.05 }, { s: 2, geld: 2, p: 0.08 }];
  let seed = (Date.now() ^ 0x9e3779b9) >>> 0;
  const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; // mulberry32
  let los = null; // { felder, offen: [b,b,b], geld, fertig }
  const lo = { last: null, seed(n) { seed = n >>> 0; }, ziehen, oeffnen: losAuf, rubbeln, alles, zu: losZu, get aktiv() { return los; }, PREIS, TAB };
  function ziehen() {
    let r = rnd(), hit = null; for (const t of TAB) { if (r < t.p) { hit = t; break; } r -= t.p; }
    if (hit) return { felder: [hit.s, hit.s, hit.s], geld: hit.geld };
    let f; do { f = [0, 1, 2].map(() => Math.floor(rnd() * SYM.length)); } while (f[0] === f[1] && f[1] === f[2]);
    return { felder: f, geld: 0 };
  }
  function losAuf() {
    if (offen) return false; const z = ziehen(); los = { ...z, offen: [false, false, false], fertig: false }; stats.lose++;
    oeffnen('los'); q('.ms_t').textContent = 'Rubbellos „Bembel-Glück“ · nur Spielgeld, kein Echtgeld';
    q('.ms_s').textContent = 'Drei Gleiche gewinnen';
    q('.ms_b').innerHTML = '<div style="display:flex;gap:8px;justify-content:center;margin:8px 0">' + [0, 1, 2].map(i => `<button type="button" data-i="${i}" style="flex:1;height:76px;border-radius:10px;border:1px solid #777;background:repeating-linear-gradient(45deg,#b8b8b8,#b8b8b8 6px,#a4a4a4 6px,#a4a4a4 12px);color:#111;font:600 15px system-ui;cursor:pointer;touch-action:manipulation">${i + 1}</button>`).join('') + '</div>'
      + '<div style="font-size:12px;color:#99a;line-height:1.5">3× ⭐ 20 € · 3× 🍏 6 € · 3× 🥨 4 € · 3× 🌿 2 €</div>';
    for (const b of ui.querySelectorAll('.ms_b button')) b.addEventListener('click', () => rubbeln(+(/** @type {HTMLElement} */ (b).dataset.i)));
    q('.ms_m').textContent = ''; q('.ms_f').textContent = 'Felder anklicken oder Taste 1–3 · Leertaste rubbelt alles · Esc schließt';
    const x = q('.ms_x'); x.textContent = 'Alles aufrubbeln'; x.onclick = () => { if (los && los.fertig) losZu(); else alles(); };
    sfx('click', 0.5); return true;
  }
  function rubbeln(i) {
    if (!los || los.fertig || los.offen[i]) return; los.offen[i] = true; const b = ui.querySelectorAll('.ms_b button')[i];
    if (b) { b.textContent = SYM[los.felder[i]]; b.style.background = '#f4efe0'; } sfx('click', 0.3);
    if (los.offen.every(Boolean)) auswerten();
  }
  function alles() { for (let i = 0; i < 3; i++) rubbeln(i); }
  function auswerten() {
    const l = los; l.fertig = true; const tag = heute('rubbellosTag'), ep = tag.n < 3 ? 5 : 0; tag.inc();
    if (l.geld) { player.money = (player.money || 0) + l.geld; stats.gewinn += l.geld; sfx('pickup', 0.5); }
    if (ep) gain(ep, 'Rubbellos');
    q('.ms_m').textContent = (l.geld ? `Gewinn: ${l.geld} € Spielgeld` : 'Leider nichts') + (ep ? ` · +${ep} EP` : '');
    const x = q('.ms_x'); x.textContent = 'Schließen'; lo.last = { felder: l.felder.slice(), geld: l.geld, ep };
  }
  function losZu() { if (!los) return; if (!los.fertig) alles(); los = null; schliessen(); }
  // Kiosk-Sortiment um das Los erweitern; Kauf zieht den Preis über shops.js ab, das Los öffnet nach dem Schließen des Ladens
  if (SHOPS && SHOPS.ITEMS && SHOPS.TYPES && SHOPS.TYPES.kiosk) { SHOPS.ITEMS.los = { n: 'Rubbellos (nur Spielgeld)', p: PREIS }; if (!SHOPS.TYPES.kiosk.items.includes('los')) SHOPS.TYPES.kiosk.items.unshift('los'); }
  A.listeners.push((ev, pos, data) => { if (ev !== 'bought' || !data || data.id !== 'los') return;
    window.__noAutoMenu = true; setTimeout(() => { try { if (SHOPS && SHOPS.close) SHOPS.close(); losAuf(); } catch (e) { console.warn('Rubbellos', e); } }, 0); });

  // ---------- Tasten: solange ein Fenster offen ist, laufen keine Spieltasten (wie vokabaum.js, Capture) ----------
  addEventListener('keydown', e => { if (!offen) return; const c = e.code;
    if (offen === 'tt') { if (c === 'Escape') abbruch('SPIEL ABGEBROCHEN'); else if (!e.repeat && (c === 'Space' || c === 'Enter' || c === 'KeyF' || c === 'NumpadEnter')) schlag(); }
    else if (offen === 'los') { const n = c.startsWith('Digit') ? +c.slice(5) : c.startsWith('Numpad') ? +c.slice(6) : 0;
      if (c === 'Escape' || (los && los.fertig && (c === 'Enter' || c === 'Space'))) losZu(); else if (n >= 1 && n <= 3) rubbeln(n - 1); else if (c === 'Space' || c === 'Enter') alles(); }
    e.preventDefault(); e.stopImmediatePropagation(); }, true);
  addEventListener('keyup', e => { if (offen) e.stopImmediatePropagation(); }, true);

  // Testhilfen: G.MINI.tt.start() an einer Platte, tt.auto = true trifft immer, tt.tempo beschleunigt; G.MINI.los.seed(n) macht Lose reproduzierbar
  const api = { update, stats, tt, los: lo, get offen() { return offen; } };
  return api;
}

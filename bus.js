// Bus fahren (André 15.11.2026: „bei Bushaltestellen kann ich nicht Ticket kaufen oder Bus fahren, das fehlt total“).
// F an einer Bushaltestelle öffnet den Fahrkartenautomaten: Linie wählen (echte Linien und Haltestellen aus
// data/busroutes.json, OpenStreetMap), dann das Ziel in Fahrtrichtung. Kurzstrecke bis 2 km 2,40 €, sonst Einzelfahrt 3,80 €.
// Wer ohne Fahrkarte einsteigt, fährt umsonst oder zahlt bei der Kontrolle 60 €. Die Fahrt selbst wird wie beim Taxi nicht
// simuliert: Abblende, Stadt am Ziel laden, Spieler an die Zielhaltestelle stellen, Uhr um die Fahrzeit vorstellen.

/** @param {import('./types').Ctx} X */
export function initBus(X) {
  const A = /** @type {any} */ (X);
  const { player } = A;
  const KURZ = 2.4, EINZEL = 3.8, KURZ_M = 2000, STRAFE = 60, KONTROLLE = 0.3, MIN_JE_KM = 3.5, ZELLE = 60;
  /** @type {any[]} */ let LINIEN = [];
  const raster = new Map(); // Zelle → [[Linie, Haltindex], …]
  let faehrt = false, el = null, opts = [], wasLocked = false, hierT = 0, hierC = null;

  fetch('data/busroutes.json').then(r => r.ok ? r.json() : []).then(d => {
    LINIEN = (d || []).filter(L => L && L.ref && Array.isArray(L.s) && L.s.length > 1);
    for (const L of LINIEN) L.s.forEach((q, i) => { const k = Math.floor(q[0] / ZELLE) + '_' + Math.floor(q[1] / ZELLE); let a = raster.get(k); if (!a) raster.set(k, a = []); a.push([L, i]); });
  }).catch(() => { /* ohne Liniendaten gibt es keinen Automaten */ });

  const eur = v => v.toFixed(2).replace('.', ',') + ' €';
  const msg = (t, ms) => { try { A.showMsg(t, ms || 1800); } catch (e) { /* ohne HUD */ } };
  const name = (L, i) => String((L.sn && L.sn[i]) || 'Haltestelle');
  /** Strecke entlang der Haltestellen i → j in Metern */
  function strecke(L, i, j) { let m = 0; for (let k = i; k < j; k++) m += Math.hypot(L.s[k + 1][0] - L.s[k][0], L.s[k + 1][1] - L.s[k][1]); return m; }
  const preis = (L, i, j) => (strecke(L, i, j) <= KURZ_M ? KURZ : EINZEL);

  /** Halte der Linien im Umkreis r um (x, z): [[Linie, Index, Abstand], …], je Linie und Richtung der nächste, nicht die Endhaltestelle */
  function halte(x, z, r) {
    const cx = Math.floor(x / ZELLE), cz = Math.floor(z / ZELLE), n = Math.ceil(r / ZELLE), best = new Map();
    for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) { const c = raster.get((cx + a) + '_' + (cz + b)); if (!c) continue;
      for (const [L, i] of c) { if (i >= L.s.length - 1) continue; const d = Math.hypot(L.s[i][0] - x, L.s[i][1] - z); if (d > r) continue; const o = best.get(L); if (!o || d < o[2]) best.set(L, [L, i, d]); } }
    return [...best.values()].sort((p, q) => p[2] - q[2]);
  }
  /** Steht der Spieler an einer Bushaltestelle? Am Haltepunkt der Linie (18 m, er liegt auf der Fahrbahn) oder am Haltestellenmast (6 m). */
  function hier() {
    const now = performance.now(); if (now - hierT < 300) return hierC; hierT = now; hierC = null;
    if (!LINIEN.length || player.car || player.dead || faehrt) return null;
    const x = player.pos.x, z = player.pos.z; let h = halte(x, z, 18);
    if (!h.length) { const st = (A.WORLD && A.WORLD.stops) || []; for (const s of st) { if (!s || s.k !== 'bus' || Math.abs(s.x - x) > 6 || Math.abs(s.z - z) > 6) continue; h = halte(s.x, s.z, 40); if (h.length) break; } }
    if (h.length) hierC = { name: name(h[0][0], h[0][1]), linien: h.map(([L, i]) => ({ L, i })) };
    return hierC;
  }

  // ---------- Fahrkartenautomat ----------
  const offen = () => !!el && el.style.display === 'flex';
  function zu() { if (!offen()) return; el.style.display = 'none'; A.shopOpen = false; /** @type {any} */ (window).__noAutoMenu = false; if (wasLocked) { wasLocked = false; try { const q = A.renderer.domElement.requestPointerLock(); if (q && q.catch) q.catch(() => {}); } catch (e) { /* ohne Sperre weiter */ } } }
  const BCSS = 'display:block;width:100%;text-align:left;margin:6px 0;background:#232730;color:#eee;border:1px solid #3a3f4a;border-radius:8px;padding:9px 12px;font:600 15px system-ui;cursor:pointer';
  function zeigen(titel, unter, liste) {
    if (!el) { el = document.createElement('div'); el.id = 'busmenu'; el.style.cssText = 'position:fixed;inset:0;background:#000b;display:none;align-items:center;justify-content:center;z-index:45;font-family:system-ui,sans-serif'; document.body.appendChild(el); }
    const box = document.createElement('div'); box.style.cssText = 'background:#16181d;color:#eee;border:1px solid #333;border-radius:12px;padding:16px 18px;width:min(460px,92vw);max-height:86vh;overflow:auto;-webkit-overflow-scrolling:touch';
    const h3 = document.createElement('h3'); h3.style.margin = '0 0 4px'; h3.textContent = titel; box.appendChild(h3);
    const sub = document.createElement('div'); sub.style.cssText = 'color:#aaa;font-size:13px;margin-bottom:10px'; sub.textContent = unter; box.appendChild(sub);
    opts = liste;
    liste.forEach((o, i) => { const b = document.createElement('button'); b.type = 'button'; b.style.cssText = BCSS + (o.blass ? ';background:#2a2d35;color:#bbb' : ''); b.textContent = (i < 9 ? `${i + 1} · ` : '') + o.label; if (o.d) for (const k in o.d) b.dataset[k] = o.d[k]; b.onclick = e => { e.stopPropagation(); o.fn(); }; box.appendChild(b); });
    const x = document.createElement('button'); x.type = 'button'; x.style.cssText = BCSS + ';text-align:center;background:#2a2d35;color:#bbb'; x.textContent = 'Abbrechen'; x.dataset.a = 'zu'; x.onclick = () => zu(); box.appendChild(x);
    el.innerHTML = ''; el.appendChild(box);
    if (!offen()) { wasLocked = !!document.pointerLockElement; /** @type {any} */ (window).__noAutoMenu = true; if (wasLocked) document.exitPointerLock(); A.shopOpen = true; for (const k in A.keys) A.keys[k] = false; }
    el.style.display = 'flex';
  }
  function automat() {
    const h = hier(); if (!h) return false;
    if ((player.wanted || 0) > 0) { msg('MIT FAHNDUNG STEIGST DU IN KEINEN BUS', 2000); return false; }
    zeigen('🚌 ' + h.name, `Fahrkartenautomat · Kurzstrecke ${eur(KURZ)} (bis 2 km) · Einzelfahrt ${eur(EINZEL)} · du hast ${eur(player.money || 0)}`,
      h.linien.map(({ L, i }) => ({ label: `Linie ${L.ref} · Richtung ${L.n || name(L, L.s.length - 1)}`, d: { linie: L.ref }, fn: () => ziele(L, i, false) })));
    return true;
  }
  function ziele(L, i, ohne) {
    const liste = []; for (let j = i + 1; j < L.s.length; j++) { const km = strecke(L, i, j) / 1000, p = ohne ? 0 : preis(L, i, j);
      liste.push({ label: `${name(L, j)} · ${km.toFixed(1).replace('.', ',')} km · ${ohne ? 'ohne Fahrkarte' : eur(p)}`, d: { ziel: String(j) }, fn: () => { fahren(L, i, j, ohne); } }); }
    liste.push(ohne ? { label: 'Doch eine Fahrkarte kaufen', blass: true, d: { a: 'mit' }, fn: () => ziele(L, i, false) }
      : { label: `Ohne Fahrkarte einsteigen (Kontrolle kostet ${eur(STRAFE)})`, blass: true, d: { a: 'ohne' }, fn: () => ziele(L, i, true) });
    zeigen(`🚌 Linie ${L.ref} · Richtung ${L.n || name(L, L.s.length - 1)}`, ohne ? `Ab ${name(L, i)} · ohne Fahrkarte. Wer sich die Fahrkarte nicht leisten kann, zahlt am Ende am meisten.` : `Ab ${name(L, i)} · wohin?`, liste);
  }
  addEventListener('keydown', e => { if (!offen()) return; const n = /^Digit([1-9])$/.exec(e.code);
    if (e.code === 'Escape' || (e.code === 'KeyF' && !e.repeat)) zu(); else if (n && opts[+n[1] - 1] && !e.repeat) opts[+n[1] - 1].fn(); else return;
    e.preventDefault(); e.stopImmediatePropagation(); }, true);

  /** Gehweg an der Zielhaltestelle: neben der Fahrbahn, nicht im Haus (wie taxi.js) */
  function gehweg(x, z) {
    let r = null; try { r = A.nearestRoadDir(x, z, 60); } catch (e) { r = null; }
    const frei = (a, b) => A.solidAt(a, b) < 0;
    if (r) { const d = (r.w || 6) / 2 + 1.8;
      for (const s of [1, -1]) for (const [ox, oz] of [[Math.cos(r.ang), -Math.sin(r.ang)], [Math.sin(r.ang), Math.cos(r.ang)]]) { const fx = r.x + ox * d * s, fz = r.z + oz * d * s; const n = A.nearestRoadDir(fx, fz, 1.5); if (frei(fx, fz) && !n) return [fx, fz]; }
      if (frei(r.x, r.z)) return [r.x, r.z]; }
    for (let k = 0; k < 40; k++) { const a = k * 2.4, rr = 2 + k; const fx = x + Math.cos(a) * rr, fz = z + Math.sin(a) * rr; if (frei(fx, fz)) return [fx, fz]; }
    return [x, z];
  }

  /** Fahrt von Halt i nach Halt j der Linie L. ohne = ohne Fahrkarte; kontrolle (nur Proben): true/false erzwingt das Ergebnis der Kontrolle. */
  async function fahren(L, i, j, ohne, kontrolle) {
    if (faehrt || !L || !(j > i) || !L.s[j]) return false;
    if ((player.wanted || 0) > 0) { msg('MIT FAHNDUNG STEIGST DU IN KEINEN BUS', 2000); zu(); return false; }
    if (player.car || player.dead) { zu(); return false; }
    const p = ohne ? 0 : preis(L, i, j);
    if ((player.money || 0) < p) { msg('ZU WENIG GELD FÜR DIE FAHRKARTE (' + eur(p) + ')', 2000); return false; }
    faehrt = true; zu();
    const ov = document.createElement('div'); ov.id = 'busfahrt';
    ov.style.cssText = 'position:fixed;inset:0;background:#000;color:#fff;display:flex;align-items:center;justify-content:center;z-index:72;font:700 24px system-ui,sans-serif;opacity:0;transition:opacity .4s;text-align:center;padding:0 16px';
    ov.textContent = `🚌 Linie ${L.ref} · nächster Halt: ${name(L, j)}`; document.body.appendChild(ov);
    try {
      player.money -= p;
      requestAnimationFrame(() => { ov.style.opacity = '1'; });
      for (const k in A.keys) A.keys[k] = false;
      const [zx, zz] = L.s[j], m = strecke(L, i, j);
      try { await Promise.race([A.streamInit(zx, zz), new Promise(r => setTimeout(r, 20000))]); } catch (e) { /* Kacheln laden weiter */ }
      const [fx, fz] = gehweg(zx, zz);
      player.pos.set(fx, A.TH(fx, fz), fz); player.vy = 0; if (player.mesh) player.mesh.position.copy(player.pos);
      try { if (A.zeitVor) A.zeitVor(m / 1000 * MIN_JE_KM / 60); } catch (e) { /* Uhr bleibt */ }
      let zeile = ohne ? 'ohne Fahrkarte, keine Kontrolle' : '−' + eur(p);
      if (ohne && (kontrolle === undefined ? Math.random() < KONTROLLE : kontrolle)) { const s = Math.min(STRAFE, Math.max(0, player.money || 0)); player.money -= s; zeile = `Kontrolle: erhöhtes Beförderungsentgelt −${eur(s)}`; }
      try { A.card(`🚌 ${name(L, j)}`, `Linie ${L.ref} · ${zeile}`, 4); } catch (e) { msg('BUS · ANGEKOMMEN'); }
    } finally {
      for (const k in A.keys) A.keys[k] = false;
      ov.style.opacity = '0'; setTimeout(() => ov.remove(), 450); faehrt = false; hierT = 0;
    }
    return true;
  }

  A.fHooks = A.fHooks || [];
  A.fHooks.push(() => { if (offen()) return null; const h = hier(); return h ? { label: `F · Bushaltestelle ${h.name}: Fahrkarte kaufen`, act: () => { automat(); } } : null; });
  const api = { hier: () => { hierT = 0; return hier(); }, halte, automat, ziele, fahren, preis, strecke, zu, get linien() { return LINIEN; }, get offen() { return offen(); }, get faehrt() { return faehrt; }, KURZ, EINZEL, STRAFE };
  /** @type {any} */ (window).BUS = api;
  return api;
}

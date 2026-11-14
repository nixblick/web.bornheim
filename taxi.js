// Taxi mitfahren (André 14.11.2026: „Bei einem Taxi muss es auch die Möglichkeit geben mitzufahren. Ziel per Klick
// auf die Karte, und bezahlen muss man natürlich.“). F an einem Taxi (parkend oder langsam fahrend) öffnet die Karte
// im Pausenmenü; ein Klick/Tipp dort wählt das Ziel (game.js gibt den Kartenpunkt über X.taxiTap weiter), danach
// Preis und Bestätigung. Die Fahrt selbst wird nicht simuliert: Abblende, Stadt am Ziel laden, Spieler auf den
// Gehweg neben dem nächsten Straßenpunkt stellen, Aufblende. E (Auto klauen) bleibt unberührt.

/** @param {import('./types').Ctx} X */
export function initTaxi(X) {
  const A = /** @type {any} */ (X);
  const { player } = A;
  const GRUND = 4, JE_KM = 2.4, NAH = 6, NAH_FAHREND = 8;
  let pick = false, dlg = null, banner = null, wacht = 0, faehrt = false;

  const eur = v => v.toFixed(2).replace('.', ',') + ' €';
  const istTaxi = c => { const t = c && c.userData && c.userData.type; return t === 'taxi' || t === 'evtaxi'; };
  function preis(x, z) { const km = Math.hypot(x - player.pos.x, z - player.pos.z) / 1000; return Math.round((GRUND + JE_KM * km) * 10) / 10; }
  function blocked() { return !!(player.car || player.dead || faehrt || pick); }
  function naechstesTaxi() {
    let best = null, bd = 1e9;
    for (const c of A.cars || []) {
      if (!istTaxi(c) || c.userData.driver === player) continue;
      const u = c.userData, d = Math.hypot(c.position.x - player.pos.x, c.position.z - player.pos.z);
      const ok = d < NAH || (u.mode === 'ai' && d < NAH_FAHREND && Math.abs(u.speed || 0) < 4);
      if (ok && d < bd) { bd = d; best = c; }
    }
    return best;
  }
  function msg(t, ms) { try { A.showMsg(t, ms || 1800); } catch (e) { /* ohne HUD */ } }
  function anbieten() { return !blocked() && !!naechstesTaxi(); }

  function bannerZeigen(an) {
    if (an && !banner) { banner = document.createElement('div'); banner.id = 'taxihint'; banner.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:70;background:#f0c419;color:#111;padding:8px 14px;border-radius:8px;font:700 15px system-ui,sans-serif;pointer-events:none'; banner.textContent = '🚕 Ziel auf der Karte antippen/anklicken · Esc bricht ab'; document.body.appendChild(banner); }
    if (!an && banner) { banner.remove(); banner = null; }
  }
  function dlgZu() { if (dlg) { dlg.remove(); dlg = null; } }
  function abbrechen() { pick = false; dlgZu(); bannerZeigen(false); clearInterval(wacht); wacht = 0; }
  function menuOffen() { const m = document.getElementById('menu'); return !!m && m.style.display === 'flex'; }

  function rufen() {
    if ((player.wanted || 0) > 0) { msg('MIT FAHNDUNG NIMMT DICH KEIN TAXI MIT', 2000); return; }
    pick = true; A.openMenu();
    try { const b = document.querySelector('#menu button[data-main="karte"]') || document.querySelector('#menu button[data-tab="karte"]'); if (b) /** @type {HTMLElement} */ (b).click(); } catch (e) { /* Karte bleibt erreichbar */ }
    bannerZeigen(true);
    clearInterval(wacht); wacht = setInterval(() => { if (!menuOffen() && !faehrt) abbrechen(); }, 300); // Esc/Weiter schließt das Menü: Auswahl sauber beenden
  }

  /** Kartenklick aus game.js (pmTap); true = verbraucht */
  A.taxiTap = (x, z) => {
    if (!pick) return false;
    const p = preis(x, z); dlgZu();
    dlg = document.createElement('div'); dlg.id = 'taxidlg';
    dlg.style.cssText = 'position:fixed;left:50%;bottom:16%;transform:translateX(-50%);z-index:71;background:#1b1e23;color:#fff;padding:14px 16px;border-radius:10px;font:600 16px system-ui,sans-serif;display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:center;box-shadow:0 4px 20px #0008';
    dlg.innerHTML = `<span>🚕 ${Math.round(Math.hypot(x - player.pos.x, z - player.pos.z) / 100) / 10} km</span><button id="taxi_ok" style="font:700 16px system-ui;padding:8px 14px;background:#f0c419;border:0;border-radius:6px">Fahren für ${eur(p)}</button><button id="taxi_no" style="font:600 16px system-ui;padding:8px 14px;border:0;border-radius:6px">Abbrechen</button>`;
    document.body.appendChild(dlg);
    /** @type {HTMLElement} */ (dlg.querySelector('#taxi_ok')).onclick = e => { e.stopPropagation(); buchen(x, z); };
    /** @type {HTMLElement} */ (dlg.querySelector('#taxi_no')).onclick = e => { e.stopPropagation(); dlgZu(); };
    return true;
  };

  function gehweg(x, z) {
    let r = null; try { r = A.nearestRoadDir(x, z, 300); } catch (e) { r = null; }
    const frei = (a, b) => A.solidAt(a, b) < 0;
    if (r) {
      const d = (r.w || 6) / 2 + 1.8;
      for (const s of [1, -1]) for (const [ox, oz] of [[Math.cos(r.ang), -Math.sin(r.ang)], [Math.sin(r.ang), Math.cos(r.ang)]]) {
        const fx = r.x + ox * d * s, fz = r.z + oz * d * s;
        // quer zur Fahrbahn: der Punkt darf nicht mehr auf der Straße liegen
        const n = A.nearestRoadDir(fx, fz, 1.5); if (frei(fx, fz) && !n) return [fx, fz];
      }
      if (frei(r.x, r.z)) return [r.x, r.z];
    }
    for (let k = 0; k < 40; k++) { const a = k * 2.4, rr = 2 + k; const fx = x + Math.cos(a) * rr, fz = z + Math.sin(a) * rr; if (frei(fx, fz)) return [fx, fz]; }
    return [x, z];
  }

  async function buchen(x, z) {
    if (faehrt) return false;
    if ((player.wanted || 0) > 0) { msg('MIT FAHNDUNG NIMMT DICH KEIN TAXI MIT', 2000); abbrechen(); return false; }
    if (player.car || player.dead) { abbrechen(); return false; }
    const p = preis(x, z);
    if ((player.money || 0) < p) { msg('ZU WENIG GELD FÜRS TAXI (' + eur(p) + ')', 2000); dlgZu(); return false; }
    faehrt = true; abbrechen();
    const ov = document.createElement('div'); ov.id = 'taxifahrt';
    ov.style.cssText = 'position:fixed;inset:0;background:#000;color:#fff;display:flex;align-items:center;justify-content:center;z-index:72;font:700 24px system-ui,sans-serif;opacity:0;transition:opacity .4s';
    ov.textContent = '🚕 Taxi fährt …'; document.body.appendChild(ov);
    try {
      player.money -= p;
      requestAnimationFrame(() => { ov.style.opacity = '1'; });
      try { A.closeMenu(); } catch (e) { /* Menü war zu */ }
      for (const k in A.keys) A.keys[k] = false;
      try { await Promise.race([A.streamInit(x, z), new Promise(r => setTimeout(r, 20000))]); } catch (e) { /* Kacheln laden weiter */ }
      const [fx, fz] = gehweg(x, z);
      player.pos.set(fx, A.TH(fx, fz), fz); player.vy = 0; if (player.mesh) player.mesh.position.copy(player.pos);
      try { A.card('🚕 Taxi · angekommen', '−' + eur(p), 3); } catch (e) { msg('TAXI · ANGEKOMMEN · −' + eur(p)); }
    } finally {
      for (const k in A.keys) A.keys[k] = false;
      ov.style.opacity = '0'; setTimeout(() => ov.remove(), 450); faehrt = false;
    }
    return true;
  }

  A.fHooks = A.fHooks || [];
  A.fHooks.push(() => anbieten() ? { label: 'F · Taxi: mitfahren', act: rufen } : null);
  const api = { anbieten, preis, buchen, rufen, abbrechen, naechstesTaxi, get pick() { return pick; }, get faehrt() { return faehrt; } };
  /** @type {any} */ (window).TAXI = api;
  return api;
}

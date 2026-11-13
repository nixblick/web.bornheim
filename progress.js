// Fortschritt wie in einem Rollenspiel: Erfahrung (EP), Stufen mit Vorteilen, Frankfurter Stadtteile entdecken,
// Statistik und Befehlsübersicht (Tab gedrückt halten). Spielstand im Browser (localStorage).
export const KEYS_HELP = [
  ['WASD', 'laufen / fahren'], ['Shift', 'rennen'], ['Leertaste', 'springen, im Auto Handbremse'], ['Maus', 'umsehen, Linksklick angreifen, Rechtsklick zielen'],
  ['E', 'einsteigen / aussteigen: Auto, Fahrrad, Motorrad (Fahrradständer!), Christoph 2'], ['F', 'Laden, U-Bahn, Hauseingang, Dach, Aufzug zum Landeplatz (BG Unfallklinik, Seckbach)'], ['Christoph 2', 'W/S vor/zurück · A/D drehen · Leertaste steigen · Shift sinken · E nur gelandet'], ['H', 'Hupe; in Polizei-, Feuerwehr-, Wasserwerferfahrzeugen Sondersignal an/aus'], ['L', 'Licht an/aus (im Fahrzeug)'],
  ['1–0, Mausrad', 'Waffe wählen'], ['Q', 'letzte Waffe'], ['R', 'nachladen'], ['G', 'Leute sammeln / Sprechchor'], ['V', 'filmen'], ['X', 'Dialog weiter'],
  ['M', 'große Karte'], ['N', 'Minikarte nach Norden'], ['C', 'Kreativmodus'], ['Tab', 'Statistik, Fortschritt, Befehle'], ['F6 / F9', 'speichern / laden'], ['Esc', 'Menü'], ['F1', 'Hilfe: was geht wo'],
];
/** @param {import('./types').Ctx} X */
export function initProgress(X) {
  const { player, sfx, showMsg } = X; const $ = id => document.getElementById(id);
  if (!X.emit) X.emit = (ev, pos, data) => { for (const f of X.listeners) f(ev, pos, data || {}); };
  const KEY = 'notgta.progress';
  let P = { xp: 0, lvl: 1, seen: {}, st: { drive: 0, walk: 0, time: 0, metro: 0, buy: 0, demo: 0, film: 0, crash: 0 } };
  P.karma = 0; P.fit = 0; P.medals = []; // Karma (Zivilcourage, #129), Fitness (Laufrunden, #128), Medaillen (Marathon/Megamarsch, #127), Basis 13.11.2026
  try { const o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (o) { P = Object.assign(P, o); P.st = Object.assign({ drive: 0, walk: 0, time: 0, metro: 0, buy: 0, demo: 0, film: 0, crash: 0 }, o.st || {}); P.seen = o.seen || {}; P.karma = +o.karma || 0; P.fit = +o.fit || 0; P.medals = Array.isArray(o.medals) ? o.medals : []; } } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) {} };
  const need = l => Math.round(100 * Math.pow(l, 1.45)); // EP bis zur nächsten Stufe
  function perks() { const l = P.lvl - 1; X.perks = { car: Math.max(0.55, 1 - 0.04 * l), shop: Math.max(0.7, 1 - 0.02 * l), run: Math.min(1.3, 1 + 0.02 * l) * (1 + Math.min(0.2, (P.fit || 0) * 0.002)) }; } /* Fitness: bis +20 % Laufgeschwindigkeit bei 100 Punkten */
  perks();
  // ---------- Anzeige: EP-Meldungen und Gebiets-Banner ----------
  const st = document.createElement('style'); st.textContent = `#xpf{position:fixed;left:50%;bottom:150px;transform:translateX(-50%);z-index:7;pointer-events:none;font:700 15px system-ui;color:#c9a0ff;text-shadow:0 2px 6px #000;transition:opacity .4s;opacity:0}
#zoneban{position:fixed;left:50%;top:22%;transform:translateX(-50%);z-index:7;pointer-events:none;text-align:center;transition:opacity .8s;opacity:0;font-family:Georgia,serif;color:#f3e2b5;text-shadow:0 3px 12px #000}
#zoneban small{display:block;font:600 13px system-ui;letter-spacing:3px;color:#d9c48f}#zoneban b{display:block;font-size:40px;letter-spacing:2px}#zoneban i{display:block;font:600 14px system-ui;color:#c9a0ff;font-style:normal;margin-top:4px}
#zone{position:absolute;right:20px;bottom:56px;font:600 14px system-ui;color:#f3e2b5;text-shadow:0 2px 6px #000;text-align:right}
#lvl{margin-top:6px;font:700 12px system-ui;color:#c9a0ff;text-shadow:0 1px 4px #000}#lvl i{display:block;width:140px;height:4px;background:#ffffff22;border-radius:2px;margin-top:3px}#lvl i b{display:block;height:4px;background:#a46bff;border-radius:2px}
#tabov{position:fixed;inset:0;z-index:30;display:none;align-items:center;justify-content:center;background:#000b;font-family:system-ui,sans-serif;color:#eee}
#tabov .box{background:#161a24;border:1px solid #333a4a;border-radius:14px;padding:18px 22px;width:min(980px,96vw);max-height:90vh;overflow:auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px}
#tabov h3{margin:0 0 8px;font-size:15px;letter-spacing:2px;color:#ffd84a}#tabov table{width:100%;font-size:13px;border-collapse:collapse}#tabov td{padding:3px 0;vertical-align:top}#tabov td:first-child{color:#aab;width:42%}
#tabov .zl{columns:2;font-size:12px;line-height:1.55}#tabov .zl span{display:block}#tabov .zl .no{opacity:.35}#tabov kbd{background:#2a3040;border-radius:4px;padding:1px 6px;font:600 12px system-ui;color:#fff}`;
  document.head.appendChild(st);
  const xpf = document.createElement('div'); xpf.id = 'xpf'; document.body.appendChild(xpf);
  const ban = document.createElement('div'); ban.id = 'zoneban'; document.body.appendChild(ban);
  const hud = $('hud'); const zoneEl = document.createElement('div'); zoneEl.id = 'zone'; const lvlEl = document.createElement('div'); lvlEl.id = 'lvl'; if (hud) { hud.appendChild(zoneEl); (hud.querySelector('.tl') || hud).appendChild(lvlEl); /* im Fluss unter Waffe statt fest bei 84 px, sonst überlagerten sich Stufe und Waffe (#100) */ }
  let xpT = 0, xpSum = 0, banT = 0;
  function gain(n, why) {
    // @ts-ignore -- Baseline #119: DOM-/Zahl-String-Typen, kein X-Fehler
    if (n <= 0) return; P.xp += n; xpSum += n; xpf.textContent = `+${xpSum} EP${why ? ' · ' + why : ''}`; xpf.style.opacity = 1; xpT = 2.2;
    while (P.xp >= need(P.lvl)) { P.xp -= need(P.lvl); P.lvl++; perks(); banner('STUFE ' + P.lvl, 'Aufgestiegen', `Auto ${Math.round((1 - X.perks.car) * 100)} % robuster · Läden ${Math.round((1 - X.perks.shop) * 100)} % billiger · ${Math.round((X.perks.run - 1) * 100)} % schneller rennen`); sfx('bell', 0.6); }
    drawLvl(); save();
  }
  function fmtMs(ms) { const t = Math.round(ms / 1000); return Math.floor(t / 3600) + ':' + String(Math.floor(t / 60) % 60).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0') + ' h'; }
  // @ts-ignore -- Baseline #119: DOM-/Zahl-String-Typen, kein X-Fehler
  function banner(big, small, sub) { const e = t => String(t).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';'); /* alles maskiert: Medaillen-/Streckennamen kommen von außen (Hinweis programmierer bornheim, 13.11.2026) */ ban.innerHTML = `<small>${e(small)}</small><b>${e(big)}</b>${sub ? '<i>' + e(sub) + '</i>' : ''}`; ban.style.opacity = 1; banT = 4; }
  function drawLvl() { lvlEl.innerHTML = `Stufe ${P.lvl}<i><b style="width:${Math.round(P.xp / need(P.lvl) * 100)}%"></b></i>`; }
  drawLvl();
  // ---------- Stadtteile ----------
  let D = [];
  fetch('data/districts.json').then(r => r.ok ? r.json() : []).then(d => { D = d.map(z => { const xs = z.r.flat().map(p => p[0]), zs = z.r.flat().map(p => p[1]); return Object.assign(z, { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) }); }); }).catch(() => {});
  const pip = (x, z, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [ax, az] = poly[i], [bx, bz] = poly[j]; if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) c = !c; } return c; };
  function districtAt(x, z) { for (const d of D) { if (x < d.x0 || x > d.x1 || z < d.z0 || z > d.z1) continue; if (d.r.some(r => pip(x, z, r))) return d; } return null; }
  let cur = null, scanT = 0, last = null, saveT = 15;
  // ---------- Ereignisse ----------
  X.listeners.push((ev, pos, data) => {
    if (ev === 'joinedDemo') { P.st.demo++; gain(15, 'Demo'); } else if (ev === 'demoArrived') gain(25, 'Demo am Ziel');
    else if (ev === 'metro') { P.st.metro++; gain(8, 'U-Bahn'); } else if (ev === 'bought') { P.st.buy++; gain(2, 'Einkauf'); }
    else if (ev === 'karma') { const n = +data.n || 0; P.karma = Math.max(-100, Math.min(100, P.karma + n)); showMsg((n >= 0 ? 'KARMA +' : 'KARMA ') + n + (data.why ? ' · ' + data.why : ''), 1400, n >= 0 ? 'ok' : undefined); if (n > 0) gain(n * 2, data.why || 'Zivilcourage'); save(); }
    else if (ev === 'fitness') { const n = +data.n || 0; P.fit = Math.max(0, Math.min(100, P.fit + n)); perks(); showMsg('FITNESS +' + n, 1400, 'ok'); save(); }
    else if (ev === 'medal') { const m = { id: String(data.id || 'medaille'), n: String(data.n || 'Medaille').slice(0, 60), ms: +data.ms || 0, at: Date.now() }; P.medals.push(m); banner('🏅 ' + m.n.toUpperCase(), 'MEDAILLE', m.ms ? fmtMs(m.ms) : ''); sfx('bell', 0.8); gain(200, 'Medaille'); save(); }
    else if (ev === 'filmed' || ev === 'film') { P.st.film++; gain(3, 'Video'); } else if (ev === 'fireOut' && data && data.by === 'player') gain(10, 'Feuer gelöscht');
  });
  // ---------- Tab: Statistik, Fortschritt, Befehle ----------
  const ov = document.createElement('div'); ov.id = 'tabov'; document.body.appendChild(ov);
  const esc = t => String(t).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
  const medalsHtml = () => P.medals.length ? P.medals.map(m => `🏅 ${esc(m.n)}${m.ms ? ' · ' + fmtMs(m.ms) : ''} <small style="color:#8a93a8">${new Date(m.at).toLocaleDateString('de-DE')}</small>`).join('<br>') : 'noch keine';
  const km = m => (m / 1000).toFixed(1) + ' km'; const hm = s => Math.floor(s / 3600) + ' h ' + Math.floor(s / 60 % 60) + ' min';
  function html(withKeys = true) {
    const nZ = D.length || 46, seen = Object.keys(P.seen).length;
    const stats = `<div><h3>FORTSCHRITT</h3><table><tr><td>Stufe</td><td><b style="color:#c9a0ff">${P.lvl}</b> · ${P.xp} / ${need(P.lvl)} EP</td></tr><tr><td>Vorteile</td><td>Auto ${Math.round((1 - X.perks.car) * 100)} % robuster<br>Läden ${Math.round((1 - X.perks.shop) * 100)} % billiger<br>${Math.round((X.perks.run - 1) * 100)} % schneller rennen</td></tr>
      <tr><td>Karma</td><td>${P.karma > 0 ? '+' : ''}${P.karma}</td></tr><tr><td>Fitness</td><td>${P.fit} / 100</td></tr><tr><td>Medaillen</td><td>${medalsHtml()}</td></tr><tr><td>Stadtteile</td><td>${seen} von ${nZ} entdeckt</td></tr><tr><td>Geld</td><td>${player.money} €</td></tr><tr><td>Gefahren</td><td>${km(P.st.drive)}</td></tr><tr><td>Gelaufen</td><td>${km(P.st.walk)}</td></tr><tr><td>Spielzeit</td><td>${hm(P.st.time)}</td></tr><tr><td>U-Bahn-Fahrten</td><td>${P.st.metro}</td></tr><tr><td>Einkäufe</td><td>${P.st.buy}</td></tr><tr><td>Demos</td><td>${P.st.demo}</td></tr></table></div>`;
    const zones = `<div><h3>STADTTEILE ${seen}/${nZ}</h3><div class="zl">${(D.length ? D.map(d => d.n) : []).sort((a, b) => a.localeCompare(b, 'de')).map(n => `<span class="${P.seen[n] ? '' : 'no'}">${P.seen[n] ? '✓' : '·'} ${n}</span>`).join('')}</div></div>`;
    const keys = withKeys ? `<div><h3>BEFEHLE</h3><table>${KEYS_HELP.map(([k, t]) => `<tr><td><kbd>${k}</kbd></td><td>${t}</td></tr>`).join('')}</table></div>` : '';
    if (!withKeys) { // Menü: knapp – Stufe mit Balken, Rest zum Aufklappen
      const pct = Math.min(100, Math.round(P.xp / need(P.lvl) * 100));
      return `<div class="pg"><div style="display:flex;justify-content:space-between;align-items:baseline"><b style="color:#c9a0ff;font-size:16px">Stufe ${P.lvl}</b><small style="color:#aaa">${P.xp} / ${need(P.lvl)} EP</small></div><div style="height:6px;background:#ffffff18;border-radius:3px;margin:5px 0 8px"><i style="display:block;height:100%;width:${pct}%;background:#b07cff;border-radius:3px"></i></div>
        <small style="color:#aaa">Auto ${Math.round((1 - X.perks.car) * 100)} % robuster · Läden ${Math.round((1 - X.perks.shop) * 100)} % billiger · ${Math.round((X.perks.run - 1) * 100)} % schneller</small></div>
        <details class="pgd"><summary>📈 Statistik</summary>${stats.replace('<h3>FORTSCHRITT</h3>', '')}</details><details class="pgd"><summary>🗺 Stadtteile ${seen}/${nZ}</summary>${zones.replace(/<h3>[^<]*<\/h3>/, '')}</details>`; }
    return stats + zones + keys;
  }
  function showTab(on) { if (on) { ov.innerHTML = `<div class="box">${html()}</div>`; ov.style.display = 'flex'; } else ov.style.display = 'none'; }
  addEventListener('keydown', e => { if (e.code !== 'Tab') return; e.preventDefault(); if (!e.repeat) showTab(true); }, true);
  addEventListener('keyup', e => { if (e.code === 'Tab') { e.preventDefault(); showTab(false); } }, true);
  ov.addEventListener('click', () => showTab(false));
  // ---------- Takt ----------
  let lx = null, lz = null;
  function update(dt) {
    // @ts-ignore -- Baseline #119: DOM-/Zahl-String-Typen, kein X-Fehler
    if (xpT > 0) { xpT -= dt; if (xpT <= 0) { xpf.style.opacity = 0; xpSum = 0; } }
    // @ts-ignore -- Baseline #119: DOM-/Zahl-String-Typen, kein X-Fehler
    if (banT > 0) { banT -= dt; if (banT <= 0) ban.style.opacity = 0; }
    P.st.time += dt;
    const inside = X.inPocket && X.inPocket(player.pos.x, player.pos.z);
    const x = player.car ? player.car.position.x : player.pos.x, z = player.car ? player.car.position.z : player.pos.z;
    if (!inside && lx !== null) { const d = Math.hypot(x - lx, z - lz); if (d < 60) { if (player.car) { P.st.drive += d; P.acc = (P.acc || 0) + d / 250; } else { P.st.walk += d; P.acc = (P.acc || 0) + d / 100; } if (P.acc >= 1) { const n = Math.floor(P.acc); P.acc -= n; gain(n, player.car ? 'unterwegs' : 'zu Fuß'); } } }
    lx = x; lz = z;
    scanT -= dt; if (scanT > 0 || inside || !D.length) return; scanT = 0.5;
    const d = districtAt(x, z); if (d !== cur) { cur = d; zoneEl.textContent = d ? d.n : '';
      if (d && !P.seen[d.n]) { P.seen[d.n] = 1; const n = Object.keys(P.seen).length; banner(d.n.toUpperCase(), 'NEUES GEBIET ENTDECKT', `+50 EP · ${n} von ${D.length} Stadtteilen`); sfx('notify', 0.6); gain(50, 'Entdeckt'); save(); }
      else if (d && d !== last) { banner(d.n.toUpperCase(), 'FRANKFURT', ''); banT = 2.2; }
      last = d; }
    saveT -= 0.5; if (saveT <= 0) { saveT = 15; save(); }
  }
  // Menü: Reiter Fortschritt und Steuerung beim Öffnen füllen
  if (X.menuHooks) X.menuHooks.push(() => { const pp = $('progpane'); if (pp) pp.innerHTML = html(false); const kp = $('keyspane'); if (kp) kp.innerHTML = `<table>${KEYS_HELP.map(([k, t]) => `<tr><td><kbd>${k}</kbd></td><td>${t}</td></tr>`).join('')}</table><p style="font-size:12px;color:#8a93a8;margin-top:10px">Am Handy: Stick links, rechts wischen zum Umsehen, Knöpfe rechts; 📊 zeigt die Statistik.</p>`; });
  return { update, gain, P, html, showTab, districtAt, get district() { return cur; }, save };
}

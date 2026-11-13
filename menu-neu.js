// Pausenmenü im Stil GTA V / Project Sunset (André 13.11.2026: „mehr wie bei GTA, ein schönes, übersichtliches Menü“).
// Oben eine schlanke Reiterleiste (Karte, Missionen, Statistik, Einstellungen), Startreiter ist die Karte als große Fläche,
// rechts daneben ein kompakter Statusblock (Uhrzeit, Wetter, Ziel, Gesundheit, Fahndung, Geld, Waffe, Stufe) und die Spiel-Knöpfe.
// Die vorhandenen Knöpfe und Seiten aus play.html werden nur umgehängt (game.js bindet per id); game.js schaltet weiter über data-tab.
import { missionList } from './missionen.js';
/** @param {import('./types').Ctx} X @param {any} S */
export function initMenuNeu(X, S) {
  const { player, world, weather } = X;
  const $ = id => document.getElementById(id);
  const menu = $('menu'); if (!menu) return null;
  const box = menu.querySelector('.box'), side = menu.querySelector('.mside'), opts = menu.querySelector('.opts');
  if (!box || !side || !opts) return null;
  // Eigenes Stylesheet sicherstellen (falls play.html aus dem Cache ohne den Link kommt, standen sonst rohe Knöpfe da)
  if (![...document.styleSheets].some(s => /menu-neu\.css/.test(s.href || ''))) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'menu-neu.css?v=3'; document.head.append(l); }
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const noEmoji = s => String(s || '').replace(/[\p{Extended_Pictographic}️‍]/gu, '').replace(/\s+/g, ' ').trim();
  menu.classList.add('mn');

  // Hauptpunkte: welche Seiten (data-tab) zu welchem Punkt gehören. Eine Beschriftung je Knopf, kein Zweitlabel.
  const SET = ['schnell', 'grafik', 'kamera', 'welt', 'spiel', 'ton', 'hilfe'];
  /** @type {[string, string, string[]][]} */
  const MAIN = [['karte', 'Karte', ['karte', 'uebersicht']], ['story', 'Missionen', ['story']], ['fortschritt', 'Statistik', ['fortschritt']], ['einst', 'Einstellungen', SET]];
  let lastSet = 'schnell';

  const top = el('header', 'mn-top');
  top.append(el('div', 'mn-title', '<span class="mn-eyebrow">Bornheim</span><b>Pause</b>'));
  const nav = el('nav', 'mn-nav');
  for (const [id, label] of MAIN) { const b = el('button'); b.type = 'button'; b.dataset.main = id; b.textContent = label; b.onclick = () => X.menuTab && X.menuTab(id === 'einst' ? lastSet : id); nav.append(b); }
  top.append(nav);
  const resume = $('m_resume'); if (resume) { resume.classList.add('mn-resume'); top.append(resume); }

  // Einstellungen: Reiterzeile; die alten Kopf- und Seitenreiter verschwinden aus dem DOM
  const sub = el('div', 'mn-sub');
  const SUBL = { schnell: 'Schnell', grafik: 'Grafik', kamera: 'Kamera', welt: 'Welt', spiel: 'Spiel', ton: 'Ton & HUD', hilfe: 'Hilfe' };
  for (const t of SET) { const b = el('button'); b.type = 'button'; b.dataset.tab = t; b.textContent = SUBL[t]; b.onclick = () => X.menuTab && X.menuTab(t); sub.append(b); }
  for (const q of menu.querySelectorAll('.tabs, .sidetabs, .sidehead, .mside h2')) q.remove();

  // Statusblock rechts neben der Karte: Werte oben, Spiel-Knöpfe unten (umgehängt, nicht kopiert)
  const status = el('aside', 'mn-status');
  const vals = el('div', 'mn-vals');
  const acts = el('div', 'mn-acts');
  const TXT = { m_save: 'Speichern', m_load: 'Laden', m_feedback: 'Fehler melden', m_restart: 'Neu starten', m_export: 'Exportieren', m_import: 'Importieren', m_home: 'Zur Startseite' };
  for (const n of [...side.childNodes]) if (n.nodeType === 1) acts.append(n);
  for (const [id, t] of Object.entries(TXT)) { const b = $(id); if (b) b.textContent = t; }
  const more = acts.querySelector('details.more'); if (more) more.querySelector('summary').textContent = 'Mehr: Neu starten, Export, Startseite';
  status.append(vals, acts);
  opts.prepend(sub);
  const kp = opts.querySelector('.pane[data-tab=karte]'); if (kp) kp.after(status); else opts.append(status);
  side.remove();
  box.prepend(top);
  box.append(el('footer', 'mn-foot', '<span><kbd>ESC</kbd> Weiter</span><span><kbd>F1</kbd> Hilfe</span><span><kbd>H</kbd> Handy</span><span>Karte: Klick springt hin, Mausrad zoomt</span>'));

  // Hervorhebung: Hauptpunkt nach sichtbarer Seite, Reiterzeile nur unter Einstellungen
  function sync() {
    const vis = /** @type {HTMLElement[]} */ ([...opts.querySelectorAll('.pane')]).find(p => p.style.display !== 'none');
    const tab = vis ? vis.dataset.tab : 'karte';
    const main = (MAIN.find(m => m[2].includes(tab)) || MAIN[0])[0];
    if (main === 'einst') lastSet = tab;
    for (const b of nav.children) b.classList.toggle('on', /** @type {HTMLElement} */ (b).dataset.main === main);
    sub.style.display = main === 'einst' ? 'flex' : 'none';
    menu.dataset.main = main;
  }
  new MutationObserver(sync).observe(opts, { subtree: true, attributes: true, attributeFilter: ['style'] });

  // Kleine Symbole (Linien, currentColor) statt Emoji
  const svg = (d, cls = '') => `<svg class="mn-ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const IC = {
    sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    cloud: '<path d="M7 18h10.5a4 4 0 0 0 .4-8 6 6 0 0 0-11.6 1.5A3.3 3.3 0 0 0 7 18z"/>',
    rain: '<path d="M7 14h10.5a4 4 0 0 0 .4-8 6 6 0 0 0-11.6 1.5A3.3 3.3 0 0 0 7 14z"/><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/>',
    storm: '<path d="M7 13h10.5a4 4 0 0 0 .4-8 6 6 0 0 0-11.6 1.5A3.3 3.3 0 0 0 7 13z"/><path d="M12.5 14l-2.5 4h3l-2 4"/>',
    fog: '<path d="M4 9h16M2 13h20M5 17h14"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    coin: '<circle cx="12" cy="12" r="8.5"/><path d="M14.5 9a3 3 0 1 0 0 6M8 11h5M8 13.5h5"/>',
    aim: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    pin: '<path d="M12 21s6-5.6 6-11a6 6 0 0 0-12 0c0 5.4 6 11 6 11z"/><circle cx="12" cy="10" r="2.2"/>'
  };
  const WX = { clear: 'Klar', cloudy: 'Bewölkt', rain: 'Regen', storm: 'Gewitter', fog: 'Nebel' };
  function weaponNow() {
    const w = $('weapon'); if (!w || !w.textContent.trim()) return null;
    const c = /** @type {HTMLElement} */ (w.cloneNode(true)); const am = c.querySelector('span'); const ammo = am ? am.textContent.trim() : '';
    for (const x of c.querySelectorAll('b, span, small')) x.remove();
    const name = noEmoji(c.textContent); return name ? [name, ammo] : null;
  }
  function board() {
    const h = ((world.hour % 24) + 24) % 24, time = String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.floor((h % 1) * 60)).padStart(2, '0');
    const night = h < 6 || h >= 21, wk = weather.kind in WX ? weather.kind : 'clear';
    const wic = wk === 'clear' ? (night ? IC.moon : IC.sun) : IC[wk];
    let street = ''; try { street = X.streetAt(player.pos.x, player.pos.z) || ''; } catch (e) {}
    const obj = noEmoji(($('obj') && $('obj').textContent) || ''), L = S.LAUF, E = S.EULEN, V = S.VOKA, ST = S.STORY;
    const mis = L && L.run ? ['Laufrunde', `Wegpunkt ${L.run.i + 1} von ${L.run.pts.length}`] : E && E.run ? ['Frischlufteulen', obj] : V && V.mission ? ['Vokabaum', obj] : ST && ST.busy ? [(ST.STORIES[ST.sid] || {}).title || 'Story', obj] : null;
    const hp = Math.max(0, Math.min(100, Math.round(player.hp ?? 100))), wanted = Math.max(0, Math.min(5, Math.round(player.wanted || 0))), P = S.PROGRESS && S.PROGRESS.P;
    const wp = weaponNow(), need = P ? Math.round(100 * Math.pow(P.lvl, 1.45)) : 1, med = P && P.medals ? P.medals.length : 0;
    vals.innerHTML = `<div class="mn-clock"><div><b>${time}</b><span>${svg(IC.pin)}${esc(street || 'Bornheim')}</span></div><div class="mn-wx" title="Wetter">${svg(wic, 'is-wx')}<span>${esc(WX[wk])}</span></div></div>
      <div class="mn-goal">${svg(IC.flag)}<div><small>Ziel</small>${mis ? `<b>${esc(mis[0])}</b>${mis[1] ? `<span>${esc(mis[1])}</span>` : ''}` : '<b class="is-muted">Frei unterwegs</b>'}</div></div>
      <div class="mn-row">${svg(IC.heart)}<span>Gesundheit</span><b>${hp}</b></div><div class="mn-bar${hp < 30 ? ' is-low' : ''}"><i style="transform:scaleX(${hp / 100})"></i></div>
      <div class="mn-row">${svg(IC.star)}<span>Fahndung</span><span class="mn-stars">${[0, 1, 2, 3, 4].map(i => `<i class="${i < wanted ? 'is-on' : ''}"></i>`).join('')}</span></div>
      <div class="mn-row">${svg(IC.coin)}<span>Geld</span><b>${(player.money || 0).toLocaleString('de-DE')} €</b></div>
      <div class="mn-row">${svg(IC.aim)}<span>${esc(wp ? wp[0] : 'Unbewaffnet')}</span><b>${esc(wp ? wp[1] : '')}</b></div>
      ${P ? `<div class="mn-stats"><div><small>Stufe</small><b>${P.lvl}</b><i><em style="width:${Math.min(100, Math.round(P.xp / need * 100))}%"></em></i></div><div><small>Karma</small><b>${P.karma > 0 ? '+' : ''}${P.karma || 0}</b></div><div><small>Fitness</small><b>${P.fit || 0}</b></div><div><small>Medaillen</small><b>${med}</b></div></div>` : ''}`;
  }
  // Missionen: alle startbaren Missionen wie im Handy, über story.js' Storyblöcken (die Storys mit Kapiteln bleiben dort)
  function missions() {
    const sp = $('storypane'); if (!sp) return;
    const rows = missionList(X, S, () => X.closeMenu(), t => X.showMsg(String(t).toUpperCase(), 1600), { stories: false });
    const box2 = el('div', 'mn-mis', `<div class="mn-kicker">Missionen</div><div class="mn-misgrid">${rows.map((r, i) => `<div class="mn-card"><div class="mn-kicker">${esc(r.k)}</div><b>${esc(r.name)}</b><p>${esc(r.info)}</p>${r.btn ? `<button type="button" data-i="${i}">${esc(r.btn)}</button>` : ''}</div>`).join('')}</div><div class="mn-kicker">Storys</div>`);
    for (const b of box2.querySelectorAll('button[data-i]')) /** @type {HTMLElement} */ (b).onclick = () => { const f = rows[+/** @type {HTMLElement} */ (b).dataset.i].fn; if (f) f(); };
    const old = sp.querySelector('.mn-mis'); if (old) old.remove();
    sp.prepend(box2);
  }
  const onMap = () => { const p = /** @type {HTMLElement|null} */ (opts.querySelector('.pane[data-tab=karte]')); return !!p && p.style.display !== 'none'; };
  // Karte neu zeichnen, sobald das Menü sichtbar ist (die Hooks laufen vor display:flex) und bei Größenänderung
  const redraw = () => { if (onMap() && X.menuTab) X.menuTab('karte'); };
  const cv = $('pmap'); let lastW = 0;
  if (cv && 'ResizeObserver' in window) new ResizeObserver(() => { if (cv.clientWidth && Math.abs(cv.clientWidth - lastW) > 2) { lastW = cv.clientWidth; redraw(); } }).observe(cv);
  // Nach game.js' Hook (der 'schnell' setzt): Startseite ist die Karte; F1 und Handy-Karte schalten danach selbst um
  X.menuHooks.push(() => {
    try { board(); missions(); } catch (e) { console.warn('Pausenmenü', e); }
    if (X.menuTab) X.menuTab('karte'); sync();
    requestAnimationFrame(() => { for (const b of acts.querySelectorAll('button')) { const t = noEmoji(b.textContent); if (t !== b.textContent) b.textContent = t; } redraw(); });
  });
  sync();
  return { board, pane: status };
}

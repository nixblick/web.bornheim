// Pausenmenü, neu gegliedert (André 13.11.2026: „cooler. besser. übersichtlicher.“).
// Aus Project Sunset übernommen: großes PAUSE mit Augenbraue, flache Hauptliste ohne Emoji, Startseite als Lage-Board
// (Standort, Mission, Spielfigur), Einstellungen als eigene Seite mit Reiterzeile in Großbuchstaben, Tastenhinweise unten.
// Anders als Sunset: Navigation oben über die volle Breite (5 Punkte, kein Scrollbalken), Inhalt groß in der Mitte.
// Die vorhandenen Knöpfe und Seiten aus play.html werden nur umgehängt; game.js schaltet weiter über data-tab (MENU_TAB).
/** @param {import('./types').Ctx} X @param {any} S */
export function initMenuNeu(X, S) {
  const { player, world, weather } = X;
  const $ = id => document.getElementById(id);
  const menu = $('menu'); if (!menu) return null;
  const box = menu.querySelector('.box'), side = menu.querySelector('.mside'), opts = menu.querySelector('.opts');
  if (!box || !side || !opts) return null;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  menu.classList.add('mn');

  // Hauptpunkte: welche Seiten (data-tab) zu welchem Punkt gehören
  const SET = ['schnell', 'grafik', 'kamera', 'welt', 'spiel', 'ton', 'hilfe'];
  const MAIN = [['uebersicht', 'Übersicht', ['uebersicht']], ['karte', 'Karte', ['karte']], ['story', 'Missionen', ['story']], ['fortschritt', 'Statistik', ['fortschritt']], ['einst', 'Einstellungen', SET]];
  let lastSet = 'schnell';

  // Kopfleiste: Titel links, Navigation Mitte, Weiter rechts
  const top = el('header', 'mn-top');
  top.append(el('div', 'mn-title', '<span class="mn-eyebrow">Frankfurt · Bornheim</span><b>Pause</b>'));
  const nav = el('nav', 'mn-nav');
  for (const [id, label] of MAIN) { const b = el('button', 'mn-main'); b.type = 'button'; b.dataset.main = id; b.textContent = label; b.onclick = () => X.menuTab && X.menuTab(id === 'einst' ? lastSet : id); nav.append(b); }
  top.append(nav);
  const resume = $('m_resume'); if (resume) { resume.classList.add('mn-resume'); top.append(resume); }

  // Einstellungen: Reiterzeile (Sunset ps-tabs); alte Seiten- und Kopfreiter verschwinden
  const sub = el('div', 'mn-sub');
  const SUBL = { schnell: 'Schnell', grafik: 'Grafik', kamera: 'Kamera', welt: 'Welt', spiel: 'Spiel', ton: 'Ton & HUD', hilfe: 'Hilfe' };
  for (const t of SET) { const b = el('button'); b.type = 'button'; b.dataset.tab = t; b.textContent = SUBL[t]; b.onclick = () => X.menuTab && X.menuTab(t); sub.append(b); }
  const oldTabs = opts.querySelector('.tabs'); if (oldTabs) oldTabs.remove();
  const sideTabs = side.querySelector('.sidetabs'); if (sideTabs) sideTabs.remove();
  for (const h of side.querySelectorAll('.sidehead, h2')) h.remove();

  // Übersicht: Board über die volle Breite + Aktionen (Speichern, Laden, Kreativmodus, Fehler melden, Mehr …)
  const pane = el('div', 'pane mn-board'); pane.dataset.tab = 'uebersicht';
  const cards = el('div', 'mn-cards');
  const acts = el('div', 'mn-card mn-acts', '<div class="mn-kicker">Spiel</div>');
  for (const n of [...side.childNodes]) if (n.nodeType === 1) acts.append(n);
  const more = acts.querySelector('details.more'); if (more) more.querySelector('summary').textContent = 'Neu starten, Export, Startseite …';
  pane.append(cards, acts);
  opts.prepend(sub, pane);
  side.remove();
  box.prepend(top);
  box.append(el('footer', 'mn-foot', '<span><kbd>ESC</kbd> Weiter</span><span><kbd>F1</kbd> Hilfe</span><span><kbd>H</kbd> Handy</span>'));

  // Hervorhebung: Hauptpunkt nach sichtbarer Seite, Reiterzeile nur unter Einstellungen
  function sync() {
    const vis = [...opts.querySelectorAll('.pane')].find(p => p.style.display !== 'none');
    const tab = vis ? vis.dataset.tab : 'uebersicht';
    const main = (MAIN.find(m => m[2].includes(tab)) || MAIN[0])[0];
    if (main === 'einst') lastSet = tab;
    for (const b of nav.children) b.classList.toggle('on', /** @type {HTMLElement} */ (b).dataset.main === main);
    sub.style.display = main === 'einst' ? 'flex' : 'none';
    menu.dataset.main = main;
  }
  new MutationObserver(sync).observe(opts, { subtree: true, attributes: true, attributeFilter: ['style'] });

  const WX = { clear: 'Klar', cloudy: 'Bewölkt', rain: 'Regen', storm: 'Gewitter', fog: 'Nebel' };
  function board() {
    const h = ((world.hour % 24) + 24) % 24, time = String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.floor((h % 1) * 60)).padStart(2, '0');
    let street = ''; try { street = X.streetAt(player.pos.x, player.pos.z) || ''; } catch (e) {}
    const obj = ($('obj') && $('obj').textContent.trim()) || '', L = S.LAUF, E = S.EULEN, V = S.VOKA, ST = S.STORY;
    const mis = L && L.run ? ['Laufrunde', `Wegpunkt ${L.run.i + 1} von ${L.run.pts.length}`] : E && E.run ? ['Frischlufteulen', obj] : V && V.mission ? ['Vokabaum', obj] : ST && ST.busy ? [(ST.STORIES[ST.sid] || {}).title || 'Story', obj] : null;
    const hp = Math.max(0, Math.min(100, Math.round(player.hp ?? 100))), w = Math.max(0, Math.min(5, Math.round(player.wanted || 0))), P = S.PROGRESS && S.PROGRESS.P;
    const veh = player.car ? (player.car.userData.bike ? (player.car.userData.moto ? 'Motorrad' : 'Fahrrad') : 'Fahrzeug') : 'zu Fuß';
    cards.innerHTML = `<div class="mn-card mn-place"><div class="mn-kicker">Standort</div><div class="mn-big">${esc(street || 'Bornheim')}</div><div class="mn-facts"><span>${time}</span><span>${esc(WX[weather.kind] || weather.kind)}</span><span>${veh}</span></div><button type="button" class="mn-link" data-go="karte">Karte öffnen</button></div>
      <div class="mn-card"><div class="mn-kicker">Aktuelle Mission</div>${mis ? `<div class="mn-big">${esc(mis[0])}</div><div class="mn-obj">${esc(mis[1] || '')}</div>` : '<div class="mn-obj is-muted">Keine aktive Mission.</div>'}<button type="button" class="mn-link" data-go="story">Missionen</button></div>
      <div class="mn-card"><div class="mn-kicker">${player.female ? 'Sie' : 'Er'}</div><div class="mn-vital"><span>Gesundheit</span><b>${hp}</b></div><div class="mn-bar${hp < 30 ? ' is-low' : ''}"><i style="transform:scaleX(${hp / 100})"></i></div>
      <div class="mn-vital"><span>Fahndung</span><span class="mn-stars">${[0, 1, 2, 3, 4].map(i => `<i class="${i < w ? 'is-on' : ''}"></i>`).join('')}</span></div>
      <div class="mn-vital"><span>Geld</span><b>${player.money || 0} €</b></div>${P ? `<div class="mn-vital"><span>Karma · Fitness</span><b>${P.karma > 0 ? '+' : ''}${P.karma} · ${P.fit}</b></div>` : ''}<button type="button" class="mn-link" data-go="fortschritt">Statistik</button></div>`;
    for (const b of cards.querySelectorAll('[data-go]')) /** @type {HTMLElement} */ (b).onclick = () => X.menuTab && X.menuTab(/** @type {HTMLElement} */ (b).dataset.go);
  }
  // Nach game.js' Hook (der 'schnell' setzt): Startseite ist die Übersicht; F1 und Handy-Karte schalten danach selbst um
  X.menuHooks.push(() => { try { board(); } catch (e) { console.warn('Übersicht', e); } if (X.menuTab) X.menuTab('uebersicht'); sync(); });
  sync();
  return { board, pane };
}

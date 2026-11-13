// Pausenmenü nach Project Sunset (#150, André 13.11.2026: „auch die struktur vom menü generell. sowas übernehmen!“).
// Gliederung wie Sunset: links ein Blatt mit Kopf (Ort, großes PAUSE), einer Navigationsliste und Fußzeile mit Tastenhinweisen;
// rechts der Inhalt. Neu ist die Seite „Übersicht“ mit Karten (Standort, aktuelle Mission, Spielfigur) wie Sunsets Pausen-Board.
// Alle Bornheim-Funktionen bleiben: die vorhandenen Knöpfe und Reiter aus play.html werden nur umgehängt, game.js schaltet
// die Seiten weiter über data-tab (MENU_TAB) und belegt die Knöpfe wie bisher.
/** @param {import('./types').Ctx} X @param {any} S */
export function initMenu(X, S) {
  const { player, world, weather } = X;
  const $ = id => document.getElementById(id);
  const menu = $('menu'); if (!menu) return null;
  const side = menu.querySelector('.mside'), opts = menu.querySelector('.opts'), topTabs = menu.querySelector('.opts .tabs'), sideTabs = menu.querySelector('.sidetabs');
  if (!side || !opts) return null;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  menu.classList.add('sun');

  // Kopf: Augenbraue + großes PAUSE (vorhandenes h2 bleibt)
  const h2 = side.querySelector('h2'); const eb = document.createElement('div'); eb.className = 'ps-eyebrow'; eb.textContent = 'Frankfurt · Bornheim'; side.insertBefore(eb, h2);
  // Navigation: Weiter, dann „Spiel“ (Übersicht + bisherige obere Reiter), dann „Einstellungen“ (bisherige Seitenreiter)
  const nav = document.createElement('nav'); nav.className = 'ps-nav';
  const head = t => { const d = document.createElement('div'); d.className = 'sidehead'; d.textContent = t; return d; };
  const ov = document.createElement('button'); ov.dataset.tab = 'uebersicht'; ov.textContent = '🧭 Übersicht'; ov.onclick = () => X.menuTab && X.menuTab('uebersicht');
  const resume = $('m_resume'); if (resume) resume.after(nav);
  nav.append(head('Spiel'), ov); if (topTabs) { for (const b of [...topTabs.querySelectorAll('button')]) nav.append(b); topTabs.remove(); }
  const sh = side.querySelector('.sidehead'); if (sh) sh.remove();
  if (sideTabs) nav.append(head('Einstellungen'), sideTabs);
  const pane = document.createElement('div'); pane.className = 'pane ps-board'; pane.dataset.tab = 'uebersicht'; opts.prepend(pane);
  const foot = document.createElement('div'); foot.className = 'ps-foot'; foot.innerHTML = '<span><kbd>ESC</kbd> Fortsetzen</span><span><kbd>F1</kbd> Hilfe</span><span><kbd>H</kbd> Handy</span>'; side.append(foot);

  const WX = { clear: 'Klar', cloudy: 'Bewölkt', rain: 'Regen', storm: 'Gewitter', fog: 'Nebel' };
  function board() {
    const h = ((world.hour % 24) + 24) % 24, time = String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.floor((h % 1) * 60)).padStart(2, '0');
    let street = ''; try { street = X.streetAt(player.pos.x, player.pos.z) || ''; } catch (e) {}
    const obj = ($('obj') && $('obj').textContent.trim()) || '', L = S.LAUF, E = S.EULEN, V = S.VOKA, ST = S.STORY;
    const mis = L && L.run ? ['Laufrunde', `Wegpunkt ${L.run.i + 1} von ${L.run.pts.length}`] : E && E.run ? ['Frischlufteulen', obj] : V && V.mission ? ['Vokabaum', obj] : ST && ST.busy ? [(ST.STORIES[ST.sid] || {}).title || 'Story', obj] : null;
    const hp = Math.max(0, Math.min(100, Math.round(player.hp ?? 100))), w = Math.max(0, Math.min(5, Math.round(player.wanted || 0))), P = S.PROGRESS && S.PROGRESS.P;
    const veh = player.car ? (player.car.userData.bike ? (player.car.userData.moto ? 'Motorrad' : 'Fahrrad') : 'Fahrzeug') : 'zu Fuß';
    pane.innerHTML = `<div class="ps-card"><div class="ps-kicker">Standort</div><div class="ps-place">${esc(street || 'Bornheim')}</div><div class="ps-facts"><span>${time}</span><span>${esc(WX[weather.kind] || weather.kind)}</span><span>${veh}</span></div></div>
      <div class="ps-card"><div class="ps-kicker">Aktuelle Mission</div>${mis ? `<div class="ps-mission">${esc(mis[0])}</div><div class="ps-objective">${esc(mis[1] || '')}</div>` : '<div class="ps-objective is-muted">Keine aktive Mission. Aufträge gibt es im Handy (H) unter Missionen.</div>'}</div>
      <div class="ps-card"><div class="ps-kicker">${player.female ? 'Sie' : 'Er'}</div><div class="ps-vital"><span>Gesundheit</span><b>${hp}</b></div><div class="ps-bar${hp < 30 ? ' is-low' : ''}"><i style="transform:scaleX(${hp / 100})"></i></div>
      <div class="ps-vital"><span>Fahndung</span><span class="ps-stars">${[0, 1, 2, 3, 4].map(i => `<i class="${i < w ? 'is-on' : ''}"></i>`).join('')}</span></div>
      <div class="ps-vital"><span>Geld</span><b>${player.money || 0} €</b></div>${P ? `<div class="ps-vital"><span>Karma · Fitness</span><b>${P.karma > 0 ? '+' : ''}${P.karma} · ${P.fit}</b></div>` : ''}</div>`;
  }
  // Beim Öffnen auf die Übersicht; F1 und die Handy-Karte schalten danach selbst auf ihren Reiter um
  X.menuHooks.push(() => { try { board(); } catch (e) { console.warn('Übersicht', e); } if (X.menuTab) X.menuTab('uebersicht'); });
  return { board, pane };
}

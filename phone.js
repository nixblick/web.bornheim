// Handy auf Taste H (#150, André 13.11.2026: „das handy in sunset und auch das menü. super gut.“).
// Aufbau nach Project Sunset (Freigabe André): Hochkant-Handy unten rechts, Statuszeile mit Uhr, Startbildschirm mit großer Uhr
// und App-Raster, App-Seite mit Zurück-Knopf, Toast, Home-Balken. Das Spiel läuft weiter; die Maus ist frei, solange das Handy offen ist.
// Apps nutzen nur vorhandene Systeme: Story-Untertitel und Karten (Nachrichten), Social-Feed (Feed), Pausenkarte (Karte),
// Laufrunde/Frischlufteulen/Vokabaum/Storys (Missionen), progress.js (Statistik), Bildschirmfoto (Kamera), saveGame (Speichern).
// H im Fahrzeug bleibt Hupe/Sondersignal (game.js); das Handy öffnet nur zu Fuß. Cheats nur im Kreativmodus.
/** @param {import('./types').Ctx} X @param {any} S Systeme aus game.js */
export function initPhone(X, S) {
  const { player, world, weather, showMsg, sfx } = X;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const clock = () => { const h = ((world.hour % 24) + 24) % 24; return String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.floor((h % 1) * 60)).padStart(2, '0'); };

  // Verlauf: Untertitel (#sub), Einblendkarten (#card) und Feed (#feed) werden mitgeschrieben, ohne demo.js/story.js anzufassen
  const msgs = [], feed = []; let unread = 0;
  function watch(id, fn) { const el = $(id); if (!el) return; new MutationObserver(() => fn(el)).observe(el, { childList: true, subtree: true, characterData: true }); }
  watch('sub', el => { const b = el.querySelector('b'); const who = b ? b.textContent.trim() : ''; const t = el.textContent.trim().slice(who.length).trim(); if (!t) return; const l = msgs[msgs.length - 1]; if (l && l.who === who && l.text === t) return; msgs.push({ who: who || 'Info', text: t, at: clock() }); if (msgs.length > 80) msgs.shift(); if (!open) unread++; badge(); });
  watch('card', el => { const h = el.querySelector('h2'); if (!h) return; const p = el.querySelector('p'); const t = (p ? p.textContent : '').trim(), who = h.textContent.trim(); const l = msgs[msgs.length - 1]; if (l && l.who === who && l.text === t) return; msgs.push({ who, text: t, at: clock(), card: true }); if (msgs.length > 80) msgs.shift(); });
  watch('feed', el => { for (const d of el.children) { const b = d.querySelector('b'), i = d.querySelector('i'); const name = b ? b.textContent : '', col = b ? b.style.color : '', likes = i ? i.textContent : ''; const text = d.textContent.replace(name, '').replace(likes, '').trim(); const k = name + '|' + text; if (feed.some(f => f.k === k)) continue; feed.unshift({ k, name, col, text, likes }); if (feed.length > 60) feed.pop(); } });

  // ---------- Gerüst (Klassen ps-phone__* wie in Sunset, Optik in ui-sunset.css) ----------
  const root = document.createElement('div'); root.id = 'phone'; root.style.display = 'none';
  root.innerHTML = `<div class="ps-phone" role="dialog" aria-label="Smartphone"><div class="ps-phone__screen is-home">
    <div class="ps-phone__status"><span class="ps-phone__clock"></span><span class="ps-phone__notch"></span><span class="ps-phone__sys"><span class="ps-phone__signal"><b></b><b></b><b></b><b></b></span><i class="ps-phone__battery"><b></b></i></span></div>
    <div class="ps-phone__header"><span class="ps-phone__back" role="button" tabindex="0" title="Zurück">‹</span><span class="ps-phone__title"></span></div>
    <div class="ps-phone__content"></div><div class="ps-phone__toast" style="display:none"></div>
    <div class="ps-phone__homebar" title="Startbildschirm"><i></i></div></div></div>
    <div class="ps-phone__hints"><span><kbd>H</kbd> Schließen</span><span><kbd>ESC</kbd> Zurück</span></div>`;
  document.body.appendChild(root);
  const q = sel => /** @type {HTMLElement} */ (root.querySelector(sel));
  const scr = q('.ps-phone__screen'), content = q('.ps-phone__content'), title = q('.ps-phone__title'), toastEl = q('.ps-phone__toast'); let toastT = 0;
  q('.ps-phone__back').onclick = () => back();
  q('.ps-phone__homebar').onclick = () => home();
  function toast(t, kind = '') { toastEl.textContent = t; toastEl.className = 'ps-phone__toast' + (kind ? ' is-' + kind : ''); toastEl.style.display = 'block'; clearTimeout(toastT); toastT = window.setTimeout(() => toastEl.style.display = 'none', 2200); }

  // ---------- Apps ----------
  const APPS = [
    { id: 'nachrichten', label: 'Nachrichten', icon: '💬', build: appMsgs },
    { id: 'feed', label: 'Feed', icon: '📣', build: appFeed },
    { id: 'karte', label: 'Karte', icon: '🗺', build: appMap },
    { id: 'missionen', label: 'Missionen', icon: '🎯', build: appMissions },
    { id: 'statistik', label: 'Statistik', icon: '📊', build: appStats },
    { id: 'kamera', label: 'Kamera', icon: '📷', build: appCam },
    { id: 'speichern', label: 'Speichern', icon: '💾', build: appSave },
    { id: 'kreativ', label: 'Kreativ', icon: '🛠', build: appCheats, show: () => X.creative && X.creative.on },
  ];
  let open = false, app = null;
  function badge() { const b = q('[data-app=nachrichten] .ps-phone__badge'); if (b) { b.textContent = String(unread); b.style.display = unread ? '' : 'none'; } }
  function home() { app = null; scr.classList.add('is-home'); title.textContent = '';
    const d = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'][new Date().getDay()];
    content.innerHTML = `<div class="ps-phone__home"><div class="ps-phone__date"><div class="ps-phone__bigclock">${clock()}</div><div class="ps-phone__day">${d} · Bornheim</div></div><div class="ps-phone__grid">${APPS.filter(a => !a.show || a.show()).map(a => `<div class="ps-phone__app" tabindex="0" data-app="${a.id}"><span class="ps-phone__appicon">${a.icon}${a.id === 'nachrichten' ? '<span class="ps-phone__badge" style="display:none"></span>' : ''}</span><span class="ps-phone__applabel">${a.label}</span></div>`).join('')}</div></div>`;
    for (const el of content.querySelectorAll('.ps-phone__app')) { const id = /** @type {HTMLElement} */ (el).dataset.app; el.addEventListener('click', () => openApp(id)); el.addEventListener('keydown', e => { if (/** @type {KeyboardEvent} */ (e).key === 'Enter') openApp(id); }); }
    badge(); }
  function openApp(id) { const a = APPS.find(q => q.id === id); if (!a) return false; app = a; scr.classList.remove('is-home'); title.textContent = a.label; content.innerHTML = '<div class="ps-phone__page" data-app="' + a.id + '"></div>'; const page = content.firstElementChild; try { a.build(page); } catch (e) { console.error('Handy-App', id, e); page.innerHTML = '<p class="ps-pempty">Die App ist gerade nicht verfügbar.</p>'; } sfx && sfx('click', 0.4); return true; }
  function back() { if (app) home(); else close(); }
  const list = (items, empty) => items.length ? `<div class="ps-plist">${items.join('')}</div>` : `<p class="ps-pempty">${empty}</p>`;

  function appMsgs(p) { unread = 0; p.innerHTML = list(msgs.slice().reverse().map(m => `<div class="ps-pmsg${m.card ? ' is-card' : ''}"><b>${esc(m.who)}</b><span>${esc(m.at)}</span><p>${esc(m.text)}</p></div>`), 'Noch keine Nachrichten. Storys starten an den leuchtenden Buchstaben auf der Karte.'); }
  function appFeed(p) { p.innerHTML = list(feed.map(f => `<div class="ps-ppost"><b style="color:${esc(f.col)}">${esc(f.name)}</b><p>${esc(f.text)}</p><i>${esc(f.likes)}</i></div>`), 'Der Feed ist leer. Mit <kbd>V</kbd> filmen und posten.'); }
  function appMap(p) { p.innerHTML = '<p class="ps-pempty">Karte öffnet sich …</p>'; close(); if (X.openMenu) { X.openMenu(); if (X.menuTab) X.menuTab('karte'); } }
  function appStats(p) { p.innerHTML = `<div class="ps-pstats">${S.PROGRESS && S.PROGRESS.html ? S.PROGRESS.html(true) : ''}</div>`; }
  function appSave(p) { p.innerHTML = `<div class="ps-pbtns"><button class="ps-pbtn is-amber" data-a="save">💾 Schnellspeichern (F6)</button><button class="ps-pbtn" data-a="menu">Pausenmenü öffnen</button></div>`;
    p.querySelector('[data-a=save]').onclick = () => { try { X.saveGame(true); toast('Gespeichert', 'success'); } catch (e) { toast('Speichern fehlgeschlagen', 'error'); } };
    p.querySelector('[data-a=menu]').onclick = () => { close(); X.openMenu && X.openMenu(); }; }
  function appCam(p) { p.innerHTML = `<div class="ps-pbtns"><p class="ps-pempty">Foto vom Spielbild, ohne Handy. Wird als PNG heruntergeladen.</p><button class="ps-pbtn is-amber" data-a="shot">📷 Foto machen</button></div>`;
    p.querySelector('[data-a=shot]').onclick = () => { root.style.visibility = 'hidden'; requestAnimationFrame(() => { try { const G = /** @type {any} */ (window).G, cv = X.renderer.domElement; const c = G && G.composerRef && G.composerRef(); if (c && c.render) c.render(); else X.renderer.render(X.scene, X.camera); const a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = 'bornheim-' + new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-') + '.png'; a.click(); toast('Foto gespeichert', 'success'); } catch (e) { toast('Foto nicht möglich', 'error'); } root.style.visibility = ''; }); }; }
  function appCheats(p) { p.innerHTML = `<div class="ps-pbtns"><p class="ps-pempty">Nur im Kreativmodus.</p><button class="ps-pbtn" data-a="geld">💶 +1000 €</button><button class="ps-pbtn" data-a="heil">❤ Gesundheit voll</button><button class="ps-pbtn" data-a="fahndung">🚓 Fahndung weg</button></div>`;
    const ok = () => X.creative && X.creative.on;
    p.querySelector('[data-a=geld]').onclick = () => { if (ok()) { player.money = (player.money || 0) + 1000; toast('+1000 €', 'success'); } };
    p.querySelector('[data-a=heil]').onclick = () => { if (ok()) { player.hp = 100; toast('Gesundheit voll', 'success'); } };
    p.querySelector('[data-a=fahndung]').onclick = () => { if (ok()) { player.wanted = 0; toast('Fahndung aufgehoben', 'success'); } }; }

  // Missionen: was gerade läuft, dann startbare Aufträge aus den vorhandenen Systemen
  function appMissions(p) {
    const rows = [], acts = [];
    const row = (kicker, name, info, btn, fn) => { const i = acts.push(fn) - 1; rows.push(`<div class="ps-pmis"><div class="ps-pmis__k">${esc(kicker)}</div><b>${esc(name)}</b><p>${esc(info)}</p>${btn ? `<button class="ps-pbtn" data-i="${i}">${esc(btn)}</button>` : ''}</div>`); };
    const obj = ($('obj') && $('obj').textContent.trim()) || '';
    const L = S.LAUF, E = S.EULEN, V = S.VOKA, ST = S.STORY;
    if (L && L.run) row('Läuft', 'Laufrunde', `Wegpunkt ${L.run.i + 1} von ${L.run.pts.length}`, '', null);
    if (E && E.run) row('Läuft', 'Frischlufteulen', obj || 'Strecke läuft', 'Abbrechen', () => { E.stop(); toast('Abgebrochen'); });
    if (V && V.mission) row('Läuft', 'Vokabaum', obj || 'Mission läuft', '', null);
    if (ST && ST.busy) row('Läuft', 'Story', obj || 'Kapitel läuft', '', null);
    if (L && !L.run) row('Fitness', 'Laufrunde', '1–3 km zu Fuß mit einem Passanten, bringt Fitness und EP.', 'Laufrunde starten', () => { if (player.car) { toast('Nur zu Fuß', 'error'); return; } if (L.force()) close(); else toast('Gerade keine Runde möglich', 'error'); });
    if (E && !E.run) for (const r of (E.routes || []).slice(0, 12)) { const big = r.marathon || r.mega; row(big ? (r.mega ? 'Megamarsch' : 'Marathon') : 'Frischlufteulen', r.name, r.info || (r.km_gebiet + ' km'), big ? 'Lauf starten / fortsetzen' : 'Lauf starten', () => { if (player.car) { toast('Nur zu Fuß', 'error'); return; } E.start(r, !!big, 'lauf'); close(); }); }
    if (V && !V.mission && V.force) row('Hilfe', 'Vokabaum', 'Ein Passant braucht Hilfe mit Vokabeln.', 'Mission starten', () => { V.force(); close(); });
    if (ST && ST.STORIES) for (const [id, s] of Object.entries(ST.STORIES)) { const st = /** @type {any} */ (s); row('Story', st.title, st.sub || '', ST.busy ? '' : 'Story starten', () => { ST.start('phone', id); close(); }); }
    p.innerHTML = list(rows, 'Gerade keine Missionen.');
    for (const b of p.querySelectorAll('button[data-i]')) b.addEventListener('click', () => { const f = acts[+/** @type {HTMLElement} */ (b).dataset.i]; if (f) f(); });
  }

  // ---------- Öffnen / Schließen ----------
  let tick = 0;
  function show(id) { if (!X.started || open) return false; if (X.menuOpen()) X.closeMenu(); open = true; root.style.display = 'block'; /** @type {any} */ (window).__noAutoMenu = true; try { document.exitPointerLock(); } catch (e) {} home(); if (id) openApp(id); tick = window.setInterval(() => { root.querySelector('.ps-phone__clock').textContent = clock(); const bc = root.querySelector('.ps-phone__bigclock'); if (bc) bc.textContent = clock(); }, 1000); root.querySelector('.ps-phone__clock').textContent = clock(); sfx && sfx('click', 0.5); return true; }
  function close() { if (!open) return; open = false; app = null; root.style.display = 'none'; clearInterval(tick); /** @type {any} */ (window).__noAutoMenu = false; if (X.started && !X.menuOpen() && X.lockMouse) X.lockMouse(); }
  function toggle() { return open ? (close(), false) : show(); }
  addEventListener('keydown', e => {
    if (open && e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); back(); return; }
    if (e.code !== 'KeyH' || e.repeat || player.car || X.menuOpen()) return;
    const t = /** @type {HTMLElement} */ (e.target); if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    toggle(); }, true);
  // Touch: Knopf am rechten Rand
  if (/** @type {any} */ (window).__touch) { const b = document.createElement('button'); b.id = 'phonebtn'; b.textContent = '📱'; b.setAttribute('aria-label', 'Handy'); b.addEventListener('touchstart', e => { e.preventDefault(); if (!player.car) toggle(); }, { passive: false }); b.onclick = () => { if (!player.car) toggle(); }; document.body.appendChild(b); }
  return { open: show, close, toggle, openApp, get isOpen() { return open; }, get app() { return app ? app.id : null; }, apps: APPS.map(a => a.id), get msgs() { return msgs; }, get feed() { return feed; } };
}

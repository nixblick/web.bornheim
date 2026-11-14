// Touch-Steuerung für Handy und Tablet: Stick links (analoges Lenken + Laufen; er springt unter den Daumen, wenn man links
// irgendwo aufsetzt), Wischen auf freier Fläche (umsehen), Hoch- und Querformat, Abstand zu Kerbe und Home-Balken (safe-area),
// kontextabhängige Aktionsknöpfe (Fahrzeug, Hubschrauber, Schwimmen, Kreativmodus, Story-Dialoge).
// Wird nur auf Touch-Geräten geladen (play.html setzt window.__touch).
(function () {
  if (!window.__touch) return;
  const css = `#tc{position:fixed;inset:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);z-index:20;pointer-events:none;user-select:none;-webkit-user-select:none;touch-action:none;font-family:system-ui,sans-serif;display:none}
#tc .stick{position:absolute;left:4vw;bottom:6vh;width:30vmin;height:30vmin;max-width:190px;max-height:190px;border-radius:50%;background:#ffffff14;border:2px solid #ffffff40;pointer-events:auto}
#tc .knob{position:absolute;left:50%;top:50%;width:42%;height:42%;margin:-21% 0 0 -21%;border-radius:50%;background:#ffffff55;border:2px solid #ffffffaa}
#tc .b{position:absolute;pointer-events:auto;border-radius:50%;background:#00000066;border:2px solid #ffffff70;color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;text-align:center;line-height:1.05;-webkit-tap-highlight-color:transparent}
#tc .b.on{background:#ffd84aaa;color:#111;border-color:#ffd84a}#tc .b.hide{display:none}
#tc .fire{right:5vw;bottom:9vh;width:17vmin;height:17vmin;max-width:110px;max-height:110px;font-size:12px}
#tc .jump{right:calc(5vw + 19vmin);bottom:5vh;width:12vmin;height:12vmin;max-width:80px;max-height:80px;font-size:10px}
#tc .down{right:calc(5vw + 19vmin);bottom:calc(5vh + 13.5vmin);width:11vmin;height:11vmin;max-width:74px;max-height:74px;font-size:10px}
#tc .aim{right:calc(5vw + 1vmin);bottom:calc(9vh + 19vmin);width:12vmin;height:12vmin;max-width:80px;max-height:80px;font-size:11px}
#tc .e{right:calc(5vw + 20vmin);bottom:calc(5vh + 14vmin);width:12vmin;height:12vmin;max-width:80px;max-height:80px;font-size:12px}
#tc .f{right:calc(5vw + 14vmin);bottom:calc(9vh + 28vmin);min-width:12vmin;height:11vmin;border-radius:10px;padding:0 10px;font-size:12px;max-width:44vw}
#tc .w{right:calc(5vw + 33vmin);bottom:5vh;width:11vmin;height:11vmin;max-width:72px;max-height:72px;font-size:18px}
#tc .ctx1{right:calc(5vw + 33vmin);bottom:calc(5vh + 13vmin);width:10.5vmin;height:10.5vmin;max-width:68px;max-height:68px;font-size:15px}
#tc .ctx2{right:calc(5vw + 45vmin);bottom:5vh;width:10.5vmin;height:10.5vmin;max-width:68px;max-height:68px;font-size:15px}
#tc .top{top:8px;width:40px;height:40px;border-radius:10px;font-size:17px}#tcx{position:fixed;z-index:70;top:calc(8px + env(safe-area-inset-top,0px));right:calc(8px + env(safe-area-inset-right,0px));width:46px;height:46px;border-radius:12px;border:2px solid #ffffffb0;background:#000000c0;color:#fff;font:800 20px system-ui;display:none}#tc .top.x{display:none}#tc.mehr .top.x{display:flex}
body{overscroll-behavior:none;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}#hud{inset:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)!important}
#phonebtn{right:calc(10px + env(safe-area-inset-right, 0px))!important}
#minimap{position:fixed!important;left:calc(8px + env(safe-area-inset-left, 0px))!important;top:calc(78px + env(safe-area-inset-top, 0px))!important;bottom:auto!important;width:96px!important;height:96px!important;pointer-events:auto!important}
#street{top:6px!important;bottom:auto!important;right:auto!important;left:50%!important;transform:translateX(-50%);font-size:14px!important}
#stars{font-size:16px!important;top:52px!important;letter-spacing:2px!important}#money{font-size:14px!important;top:72px!important}
#zone{display:none}#zoneban b{font-size:26px!important}#feed{width:210px!important;top:92px!important;font-size:11px!important}#hint{bottom:12px!important;font-size:12px!important;max-width:38vw;white-space:normal}
#obj{top:30px!important;font-size:11px!important;max-width:44vw!important;padding:4px 10px!important;pointer-events:auto!important}
#sub{bottom:58px!important;font-size:12px!important;max-width:56vw!important;pointer-events:auto!important}
#ammo,#weapon{pointer-events:auto!important}
#hotbar{max-width:92vw!important;overflow-x:auto!important;flex-wrap:nowrap!important;justify-content:flex-start!important;bottom:8px!important;padding:4px 6px!important;touch-action:pan-x!important;-webkit-overflow-scrolling:touch}
#hotbar .slot{flex:0 0 auto!important;min-width:48px!important}
#wbar div.off{display:none}#wbar div{width:52px;height:50px}
#mode{bottom:68px!important;font-size:10px!important;max-width:88vw!important;text-align:center}
#card h2{font-size:28px!important}#card p{font-size:13px!important}
@media (orientation:portrait){#tc .stick{bottom:9vh}#tc .f{max-width:56vw}#obj{top:54px!important;max-width:calc(100vw - 24px)!important;width:max-content}#stars{top:104px!important}#money{top:126px!important}#feed{top:150px!important;width:170px!important}#hint{max-width:70vw;bottom:calc(9vh + 34vmin)!important}#sub{bottom:calc(9vh + 44vmin)!important;max-width:92vw!important}#street{font-size:13px!important;max-width:calc(100vw - 160px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;left:8px!important;transform:none!important}#hud .tl{top:30px!important}#minimap{top:calc(112px + env(safe-area-inset-top, 0px))!important}#hotbar{bottom:calc(9vh + 33vmin)!important}}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const el = document.createElement('div'); el.id = 'tc';
  el.innerHTML = `<div class="stick"><div class="knob"></div></div>
<div class="b fire" data-k="fire">ANGRIFF</div><div class="b jump" data-k="Space">SPRUNG</div><div class="b down hide" data-k="down">▼ RUNTER</div><div class="b aim" data-k="aim">ZIELEN</div>
<div class="b e" data-k="KeyE">E<br><small style="font-size:9px;font-weight:600">Auto</small></div><div class="b f hide" data-k="KeyF">F</div><div class="b w" data-k="weapon">⟳</div>
<div class="b ctx1 hide" data-k="ctx1">↻</div><div class="b ctx2 hide" data-k="ctx2">💡</div>
<div class="b top" data-k="Escape" style="right:8px">☰</div><div class="b top" data-k="KeyM" style="right:54px">🗺</div><div class="b top" data-k="mehr" style="right:100px">⋯</div><div class="b top x" data-k="KeyV" style="right:100px;top:54px">🎥</div><div class="b top x" data-k="stats" style="right:100px;top:100px">📊</div><div class="b top x" data-k="KeyG" style="right:100px;top:146px">📣</div><div class="b top x" data-k="KeyC" style="right:100px;top:192px">🛠</div>`;
  document.body.appendChild(el);
  // Schließen-Knopf für Handy und Statistik: beide decken auf kleinen Bildschirmen alles ab, Tasten zum Schließen gibt es nicht
  const zu = document.createElement('button'); zu.id = 'tcx'; zu.textContent = '✕'; zu.setAttribute('aria-label', 'Schließen'); document.body.appendChild(zu);
  const tabOffen = () => { const o = document.getElementById('tabov'); return !!o && o.style.display === 'flex'; }, handyOffen = () => { const o = document.getElementById('phone'); return !!o && o.style.display === 'block'; };
  function schliessen(e) { if (e) { e.preventDefault(); e.stopPropagation(); } const g = window.G; if (!g) return; if (tabOffen() && g.PROGRESS) g.PROGRESS.showTab(false); else if (g.PHONE && g.PHONE.isOpen) g.PHONE.close(); zu.style.display = 'none'; }
  zu.addEventListener('touchstart', schliessen, { passive: false }); zu.addEventListener('click', schliessen);
  addEventListener('touchend', e => { if (e.target && e.target.id === 'tabov') schliessen(e); }, { passive: false }); // neben die Statistik tippen schließt sie auch
  const G = () => window.G; const key = (code, down) => dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));

  // WebAudio auf iOS/Safari nach Tab-Wechsel oder erstem Tippen automatisch aufwecken
  function resumeAudio() { const g = G(); if (g && g.SND && g.SND.ctx && g.SND.ctx.state === 'suspended') g.SND.ctx.resume().catch(() => {}); }
  for (const ev of ['touchstart', 'touchend', 'click']) addEventListener(ev, resumeAudio, { passive: true }); // iOS lässt Ton erst nach touchend/click zu
  // iOS meldet die neue Größe nach dem Drehen und beim Ein-/Ausblenden der Adressleiste verspätet: Größe nachziehen
  const nachziehen = () => { for (const ms of [120, 450, 900]) setTimeout(() => dispatchEvent(new Event('resize')), ms); };
  addEventListener('orientationchange', nachziehen); if (window.visualViewport) { let vt = 0; visualViewport.addEventListener('resize', () => { clearTimeout(vt); vt = setTimeout(() => dispatchEvent(new Event('resize')), 150); }); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resumeAudio(); });

  // Stick (mit analogem Lenkausschlag für Fahrzeuge)
  const stick = el.querySelector('.stick'), knob = el.querySelector('.knob');
  let sid = null;
  const held = { KeyW: false, KeyS: false, KeyA: false, KeyD: false, ShiftLeft: false };
  const setK = (k, v) => { if (held[k] === v) return; held[k] = v; const g = G(); if (g) g.keys[k] = v; };
  function stickMove(t) {
    const r = stick.getBoundingClientRect(); const R = r.width / 2 || 1;
    let dx = t.clientX - (r.left + R), dy = t.clientY - (r.top + R);
    const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    const nx = dx / R, ny = dy / R;
    setK('KeyW', ny < -0.3); setK('KeyS', ny > 0.3); setK('KeyA', nx < -0.35); setK('KeyD', nx > 0.35);
    setK('ShiftLeft', Math.hypot(nx, ny) > 0.92 && ny < -0.5);
    const g = G();
    if (g && g.player) g.player.touchSteer = Math.abs(nx) < 0.08 ? 0 : Math.max(-1, Math.min(1, -nx / 0.85));
  }
  function stickEnd() {
    sid = null; knob.style.transform = ''; stick.style.left = stick.style.top = stick.style.bottom = '';
    for (const k of Object.keys(held)) setK(k, false);
    const g = G(); if (g && g.player) g.player.touchSteer = 0;
  }
  stick.addEventListener('touchstart', e => { e.preventDefault(); const t = e.changedTouches[0]; sid = t.identifier; stickMove(t); }, { passive: false });

  // Optionale Gyro-Lenkung (Neigen des Geräts im Fahrzeug, wenn in Einstellungen aktiviert)
  addEventListener('deviceorientation', e => {
    const g = G();
    if (!g || !g.opts || !g.opts.gyro || !g.player || !g.player.car || sid !== null) return;
    const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 90;
    const tilt = ang === 90 ? (e.beta || 0) : ang === -90 || ang === 270 ? -(e.beta || 0) : (e.gamma || 0);
    const norm = Math.abs(tilt) < 3 ? 0 : Math.max(-1, Math.min(1, -tilt / 28));
    g.player.touchSteer = norm;
  }, { passive: true });
  const gyroBox = document.getElementById('o_gyro');
  if (gyroBox) gyroBox.addEventListener('change', () => {
    if (gyroBox.checked && typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().catch(() => {});
    }
  });

  // Umsehen: freie Fläche rechts ziehen
  let lid = null, lx = 0, ly = 0;
  addEventListener('touchstart', e => {
    if (!started()) return;
    for (const t of e.changedTouches) {
      if (t.target.closest && t.target.closest('#tc .b, #tc .stick, #menu, #shop, #metromenu, #fb, #hotbar, #wbar, #bigmap, #minimap, #sub, #obj, #phone .ps-phone, #phonebtn, #tabov, #gl_lost')) continue;
      // links unten aufsetzen: der Stick springt unter den Daumen; sonst umsehen
      if (sid === null && t.clientX < innerWidth * (innerHeight > innerWidth ? 0.5 : 0.38) && t.clientY > innerHeight * 0.35) {
        const tr = el.getBoundingClientRect(), R = stick.offsetWidth / 2; stick.style.left = (t.clientX - tr.left - R) + 'px'; stick.style.top = (t.clientY - tr.top - R) + 'px'; stick.style.bottom = 'auto'; sid = t.identifier; stickMove(t);
      } else if (lid === null) { lid = t.identifier; lx = t.clientX; ly = t.clientY; }
    }
  }, { passive: true });
  addEventListener('touchmove', e => {
    const g = G();
    for (const t of e.changedTouches) {
      if (t.identifier === sid) { e.preventDefault(); stickMove(t); }
      else if (t.identifier === lid && g) {
        const dx = t.clientX - lx, dy = t.clientY - ly; lx = t.clientX; ly = t.clientY;
        const s = (g.opts.sens || 1) * 0.0065;
        g.camYaw.v -= dx * s; g.camYaw.lastMove = performance.now();
        g.camPitch.v = Math.max(-0.5, Math.min(1.1, g.camPitch.v + dy * s * 0.8 * (g.opts.invy ? -1 : 1)));
        e.preventDefault();
      }
    }
  }, { passive: false });
  addEventListener('touchend', e => { for (const t of e.changedTouches) { if (t.identifier === sid) stickEnd(); if (t.identifier === lid) lid = null; } });
  addEventListener('touchcancel', e => { for (const t of e.changedTouches) { if (t.identifier === sid) stickEnd(); if (t.identifier === lid) lid = null; } });

  // Knöpfe
  const fireB = el.querySelector('.fire'), jumpB = el.querySelector('.jump'), downB = el.querySelector('.down');
  const aimB = el.querySelector('.aim'), fB = el.querySelector('.f'), eB = el.querySelector('.e');
  const ctx1B = el.querySelector('.ctx1'), ctx2B = el.querySelector('.ctx2'), cTopB = el.querySelector('.top[data-k="KeyC"]');

  for (const b of el.querySelectorAll('.b')) {
    const k = b.dataset.k;
    b.addEventListener('touchstart', e => {
      e.preventDefault(); e.stopPropagation(); b.classList.add('on');
      const g = G(); if (!g) return;
      if (g.player && g.player.dead && (k === 'fire' || k === 'Space')) { g.keys.Enter = true; key('Enter', true); return; }
      if (k === 'fire') {
        if (g.creativeSpawnerActive && g.creativeSpawnerActive()) { if (g.creativePlace) g.creativePlace(); }
        else if (g.player && g.player.car && g.player.car.userData.cannon) { if (g.DEMO && g.DEMO.carTrigger) g.DEMO.carTrigger(true); }
        else if (g.WPN && g.WPN.press) g.WPN.press(true);
      } else if (k === 'aim') {
        g.player.aimHold = !g.player.aimHold; b.classList.toggle('on', g.player.aimHold); return;
      } else if (k === 'weapon') {
        if (g.creative && g.creative.on) { key('Period', true); }
        else if (g.WPN && g.WPN.cycle) g.WPN.cycle(1);
      } else if (k === 'mehr') {
        el.classList.toggle('mehr'); b.classList.toggle('on', el.classList.contains('mehr')); return;
      } else if (k === 'stats') {
        if (g.PROGRESS) { const o = document.getElementById('tabov'); g.PROGRESS.showTab(!(o && o.style.display === 'flex')); }
      } else if (k === 'Space') {
        if (g.player && g.player.swim) { g.keys.ControlLeft = true; key('ControlLeft', true); }
        else { g.keys.Space = true; key('Space', true); }
      } else if (k === 'down') {
        const code = (g.player && g.player.car && g.player.car.userData.heli) ? 'ShiftLeft' : 'ControlLeft';
        g.keys[code] = true; key(code, true);
      } else if (k === 'ctx1') {
        const code = b.dataset.act || 'KeyR'; key(code, true);
      } else if (k === 'ctx2') {
        const code = b.dataset.act || 'KeyL'; key(code, true);
      } else {
        key(k, true);
      }
    }, { passive: false });

    const up = e => {
      e.preventDefault();
      if (k === 'mehr') return; if (k !== 'aim') b.classList.remove('on');
      const g = G(); if (!g) return;
      if (k === 'fire') {
        if (g.WPN && g.WPN.press) g.WPN.press(false);
        if (g.DEMO && g.DEMO.carTrigger) g.DEMO.carTrigger(false);
        g.keys.Enter = false;
      } else if (k === 'Space') {
        g.keys.Space = false; g.keys.ControlLeft = false; g.keys.Enter = false;
        key('Space', false); key('ControlLeft', false);
      } else if (k === 'down') {
        g.keys.ShiftLeft = false; g.keys.ControlLeft = false;
        key('ShiftLeft', false); key('ControlLeft', false);
      } else if (k === 'ctx1' || k === 'ctx2') {
        const code = b.dataset.act; if (code) key(code, false);
      } else if (k !== 'aim' && k !== 'weapon' && k !== 'stats') {
        key(k, false);
      }
    };
    b.addEventListener('touchend', up, { passive: false });
    b.addEventListener('touchcancel', up, { passive: false });
  }

  // Minikarte antippen öffnet die große Karte; Untertitel antippen überspringt Dialogzeile (X); Munition antippen lädt nach (R)
  const mmEl = document.getElementById('minimap');
  if (mmEl) mmEl.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); key('KeyM', true); }, { passive: false });
  const subEl = document.getElementById('sub');
  if (subEl) subEl.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); key('KeyX', true); }, { passive: false });
  for (const id of ['ammo', 'weapon']) {
    const hEl = document.getElementById(id);
    if (hEl) hEl.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); key('KeyR', true); }, { passive: false });
  }

  // Kontextabhängige Beschriftung & Sichtbarkeit der Touch-Knöpfe (alle 200 ms)
  function started() { const s = document.getElementById('start'); return !s || s.style.display === 'none'; }
  // Beschriftung nur schreiben, wenn sie sich ändert (textContent/innerHTML ersetzen sonst jedes Mal die Kindknoten)
  const setT = (b, v) => { if (b._t !== v) { b._t = v; b.textContent = v; } };
  const setH = (b, v) => { if (b._t !== v) { b._t = v; b.innerHTML = v; } };
  setInterval(() => {
    const g = G();
    const zeig = tabOffen() || handyOffen() ? 'block' : 'none'; if (zu.style.display !== zeig) zu.style.display = zeig;
    const on = started() && !document.querySelector('#menu[style*="flex"]');
    el.style.display = on ? 'block' : 'none';
    // Handyknopf (phone.js legt ihn erst später an): nur zu Fuß im laufenden Spiel, bei offenem Handy bleibt er zum Schließen
    const pb = document.getElementById('phonebtn');
    if (pb) { const ph = document.getElementById('phone'), offen = !!ph && ph.style.display === 'block'; const v = on && g && g.player && (offen || (!g.player.car && !g.player.dead)) ? '' : 'none'; if (pb.style.display !== v) pb.style.display = v; }
    if (!on || !g || !g.player) return;
    const p = g.player, car = p.car, cu = car && car.userData;
    const isHeli = !!(cu && cu.heli), isCannon = !!(cu && cu.cannon), isCreat = !!(g.creative && g.creative.on);
    const spawner = !!(g.creativeSpawnerActive && g.creativeSpawnerActive());

    if (cTopB) cTopB.classList.toggle('on', isCreat);

    // 1) Feuer-/Hauptknopf
    setT(fireB, p.dead ? 'NEUSTART' : spawner ? 'SETZEN' : isCannon ? '💦\nWASSER' : 'ANGRIFF');

    // 2) Sprung / Bremse / Steigen / Tauchen
    setT(jumpB, p.dead ? '↩' : p.swim ? 'TAUCHEN' : isCreat ? '▲ HOCH' : isHeli ? '▲ STEIGEN' : car ? 'BREMSE' : 'SPRUNG');

    // 3) Sinken / Runter (nur im Kreativflug oder Hubschrauber)
    const showDown = !p.dead && (isCreat || isHeli);
    downB.classList.toggle('hide', !showDown);
    if (showDown) setT(downB, isHeli ? '▼ SINKEN' : '▼ RUNTER');

    // 4) Zielen-Knopf im Hubschrauber oder bei Spawner ausblenden
    aimB.classList.toggle('hide', isHeli || spawner || isCannon);

    // 5) Kontextknöpfe ctx1 (Hupe/Sirene/Nachladen) & ctx2 (Licht/Zünder)
    if (car && !isHeli) {
      ctx1B.classList.remove('hide'); ctx1B.dataset.act = 'KeyH';
      setT(ctx1B, (cu.police || cu.cannon || cu.brigade || cu.ambulance) ? '🚨' : (cu.bike && !cu.moto) ? '🔔' : '📢');
      ctx1B.classList.toggle('on', !!cu.siren);
      ctx2B.classList.remove('hide'); ctx2B.dataset.act = 'KeyL';
      setT(ctx2B, '💡');
    } else if (!car && g.WPN && g.WPN.DEF) {
      const w = g.WPN.DEF[g.WPN.cur];
      const canReload = !!(w && w.mag);
      const hasFuse = g.WPN.cur === 'tnt' || g.WPN.cur === 'grenade';
      ctx1B.classList.toggle('hide', !canReload);
      if (canReload) { ctx1B.dataset.act = 'KeyR'; setT(ctx1B, '↻'); ctx1B.classList.remove('on'); }
      ctx2B.classList.toggle('hide', !hasFuse);
      if (hasFuse) { ctx2B.dataset.act = 'KeyT'; setT(ctx2B, '⏱'); ctx2B.classList.remove('on'); }
    } else {
      ctx1B.classList.add('hide');
      ctx2B.classList.add('hide');
    }

    // 6) F-Knopf (Kontextaktion aus #hint) & E-Knopf (Einsteigen / Aussteigen)
    const h = (document.getElementById('hint') || {}).textContent || '';
    const fm = h.match(/F · ([^·]+)/);
    fB.classList.toggle('hide', !fm);
    if (fm) setT(fB, fm[1].trim().slice(0, 34));
    const em = h.match(/E · ([^·]+)/);
    setH(eB, em ? em[1].trim().split(' ')[0] : 'E<br><small style="font-size:9px;font-weight:600">Auto</small>');
    eB.classList.toggle('hide', !em && !car);
    eB.style.bottom = showDown ? 'calc(5vh + 26vmin)' : 'calc(5vh + 14vmin)';

  }, 200);

  // Beim Start: Vollbild und Querformat versuchen
  document.addEventListener('click', e => {
    if (e.target && (e.target.id === 'go' || e.target.id === 'cont')) {
      try {
        const r = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
        if (r && r.then) r.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
      } catch (err) {}
    }
  }, true);

  // Zielhinweis: antippen blendet ihn aus (kommt mit dem nächsten Ziel wieder); "Esc" gibt es am Handy nicht -> ☰
  const obj = document.getElementById('obj');
  if (obj) {
    obj.addEventListener('touchstart', e => { e.preventDefault(); obj.style.display = 'none'; }, { passive: false });
    const fix = () => { if (/Esc ›|H Handy|F1 Hilfe/.test(obj.innerHTML)) obj.innerHTML = obj.innerHTML.replace(/Esc ›/g, '☰ ›').replace(/ · H Handy/g, ' · 📱 Handy').replace(/ · F1 Hilfe/g, ''); };
    new MutationObserver(fix).observe(obj, { childList: true, characterData: true, subtree: true });
    fix();
  }

  // Doppeltipp-Zoom und Scrollen verhindern
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.documentElement.style.touchAction = 'none';
})();

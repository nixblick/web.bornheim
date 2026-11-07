// Touch-Steuerung für Handy und Tablet: Stick links (laufen/fahren), Wischen rechts (umsehen), Knöpfe für die wichtigsten Tasten.
// Wird nur auf Touch-Geräten geladen (play.html setzt window.__touch).
(function () {
  if (!window.__touch) return;
  const css = `#tc{position:fixed;inset:0;z-index:20;pointer-events:none;user-select:none;-webkit-user-select:none;touch-action:none;font-family:system-ui,sans-serif;display:none}
#tc .stick{position:absolute;left:4vw;bottom:6vh;width:30vmin;height:30vmin;max-width:190px;max-height:190px;border-radius:50%;background:#ffffff14;border:2px solid #ffffff40;pointer-events:auto}
#tc .knob{position:absolute;left:50%;top:50%;width:42%;height:42%;margin:-21% 0 0 -21%;border-radius:50%;background:#ffffff55;border:2px solid #ffffffaa}
#tc .b{position:absolute;pointer-events:auto;border-radius:50%;background:#00000066;border:2px solid #ffffff70;color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;text-align:center;line-height:1.05;-webkit-tap-highlight-color:transparent}
#tc .b.on{background:#ffd84aaa;color:#111;border-color:#ffd84a}#tc .b.hide{display:none}
#tc .fire{right:5vw;bottom:9vh;width:17vmin;height:17vmin;max-width:110px;max-height:110px;font-size:13px}
#tc .jump{right:calc(5vw + 19vmin);bottom:5vh;width:12vmin;height:12vmin;max-width:80px;max-height:80px;font-size:11px}
#tc .aim{right:calc(5vw + 1vmin);bottom:calc(9vh + 19vmin);width:12vmin;height:12vmin;max-width:80px;max-height:80px;font-size:11px}
#tc .e{right:calc(5vw + 20vmin);bottom:calc(5vh + 14vmin);width:12vmin;height:12vmin;max-width:80px;max-height:80px;font-size:12px}
#tc .f{right:calc(5vw + 14vmin);bottom:calc(9vh + 28vmin);min-width:12vmin;height:11vmin;border-radius:10px;padding:0 10px;font-size:12px;max-width:44vw}
#tc .w{right:calc(5vw + 33vmin);bottom:5vh;width:11vmin;height:11vmin;max-width:72px;max-height:72px;font-size:18px}
#tc .top{top:8px;width:40px;height:40px;border-radius:10px;font-size:18px}
#minimap{position:fixed!important;left:8px!important;top:78px!important;bottom:auto!important;width:96px!important;height:96px!important}
#street{top:6px!important;bottom:auto!important;right:auto!important;left:50%!important;transform:translateX(-50%);font-size:14px!important}
#stars{font-size:16px!important;top:52px!important;letter-spacing:2px!important}#money{font-size:14px!important;top:72px!important}
#feed{width:210px!important;top:92px!important;font-size:11px!important}#hint{bottom:auto!important;top:34px!important;font-size:13px!important}
#tcrot{position:fixed;inset:0;z-index:60;background:#0b0d12;color:#fff;display:none;align-items:center;justify-content:center;text-align:center;font:600 18px system-ui;padding:30px}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const el = document.createElement('div'); el.id = 'tc';
  el.innerHTML = `<div class="stick"><div class="knob"></div></div>
<div class="b fire" data-k="fire">ANGRIFF</div><div class="b jump" data-k="Space">SPRUNG</div><div class="b aim" data-k="aim">ZIELEN</div>
<div class="b e" data-k="KeyE">E<br><small style="font-size:9px;font-weight:600">Auto</small></div><div class="b f hide" data-k="KeyF">F</div><div class="b w" data-k="weapon">⟳</div>
<div class="b top" data-k="Escape" style="right:8px">☰</div><div class="b top" data-k="KeyM" style="right:54px">🗺</div><div class="b top" data-k="KeyV" style="right:100px">🎥</div><div class="b top" data-k="KeyG" style="right:146px">📣</div>`;
  document.body.appendChild(el);
  const rot = document.createElement('div'); rot.id = 'tcrot'; rot.innerHTML = '<div>📱↻<br><br>Bitte das Gerät quer halten.</div>'; document.body.appendChild(rot);
  const G = () => window.G; const key = (code, down) => dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
  // Stick
  const stick = el.querySelector('.stick'), knob = el.querySelector('.knob'); let sid = null, sx = 0, sy = 0; const held = { KeyW: false, KeyS: false, KeyA: false, KeyD: false, ShiftLeft: false };
  const setK = (k, v) => { if (held[k] === v) return; held[k] = v; const g = G(); if (g) g.keys[k] = v; };
  function stickMove(t) { const r = stick.getBoundingClientRect(); const R = r.width / 2; let dx = t.clientX - (r.left + R), dy = t.clientY - (r.top + R); const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; } knob.style.transform = `translate(${dx}px,${dy}px)`; const nx = dx / R, ny = dy / R; setK('KeyW', ny < -0.3); setK('KeyS', ny > 0.3); setK('KeyA', nx < -0.35); setK('KeyD', nx > 0.35); setK('ShiftLeft', Math.hypot(nx, ny) > 0.92 && ny < -0.5); }
  function stickEnd() { sid = null; knob.style.transform = ''; for (const k of Object.keys(held)) setK(k, false); }
  stick.addEventListener('touchstart', e => { e.preventDefault(); const t = e.changedTouches[0]; sid = t.identifier; stickMove(t); }, { passive: false });
  // Umsehen: freie Fläche ziehen
  let lid = null, lx = 0, ly = 0;
  addEventListener('touchstart', e => { if (!started()) return; for (const t of e.changedTouches) { if (t.target.closest && t.target.closest('#tc .b, #tc .stick, #menu, #shop, #metromenu, #fb, #hotbar, #bigmap')) continue; if (lid === null && t.clientX > innerWidth * 0.3) { lid = t.identifier; lx = t.clientX; ly = t.clientY; } } }, { passive: true });
  addEventListener('touchmove', e => { const g = G(); for (const t of e.changedTouches) { if (t.identifier === sid) { e.preventDefault(); stickMove(t); } else if (t.identifier === lid && g) { const dx = t.clientX - lx, dy = t.clientY - ly; lx = t.clientX; ly = t.clientY; const s = (g.opts.sens || 1) * 0.0065; g.camYaw.v -= dx * s; g.camYaw.lastMove = performance.now(); g.camPitch.v = Math.max(-0.5, Math.min(1.1, g.camPitch.v + dy * s * 0.8 * (g.opts.invy ? -1 : 1))); e.preventDefault(); } } }, { passive: false });
  addEventListener('touchend', e => { for (const t of e.changedTouches) { if (t.identifier === sid) stickEnd(); if (t.identifier === lid) lid = null; } });
  addEventListener('touchcancel', e => { for (const t of e.changedTouches) { if (t.identifier === sid) stickEnd(); if (t.identifier === lid) lid = null; } });
  // Knöpfe
  for (const b of el.querySelectorAll('.b')) {
    const k = b.dataset.k;
    b.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); b.classList.add('on'); const g = G(); if (!g) return;
      if (k === 'fire') { if (g.WPN && g.WPN.press) g.WPN.press(true); }
      else if (k === 'aim') { g.player.aimHold = !g.player.aimHold; b.classList.toggle('on', g.player.aimHold); return; }
      else if (k === 'weapon') { if (g.WPN && g.WPN.cycle) g.WPN.cycle(1); }
      else if (k === 'Space') { g.keys.Space = true; key('Space', true); }
      else key(k, true); }, { passive: false });
    const up = e => { e.preventDefault(); if (k !== 'aim') b.classList.remove('on'); const g = G(); if (!g) return; if (k === 'fire') { if (g.WPN && g.WPN.press) g.WPN.press(false); } else if (k === 'Space') { g.keys.Space = false; key('Space', false); } else if (k !== 'aim' && k !== 'weapon') key(k, false); };
    b.addEventListener('touchend', up, { passive: false }); b.addEventListener('touchcancel', up, { passive: false });
  }
  // F-Knopf zeigt die aktuelle Aktion (aus dem Hinweistext), E-Knopf nur, wenn ein Fahrzeug nah ist
  const fB = el.querySelector('.f'), eB = el.querySelector('.e');
  function started() { const s = document.getElementById('start'); return !s || s.style.display === 'none'; }
  setInterval(() => {
    const on = started() && !document.querySelector('#menu[style*="flex"]'); el.style.display = on ? 'block' : 'none';
    const h = (document.getElementById('hint') || {}).textContent || ''; const fm = h.match(/F · (.+)/); fB.classList.toggle('hide', !fm); if (fm) fB.textContent = fm[1].slice(0, 34);
    const em = h.match(/E · ([^·]+)/); eB.innerHTML = em ? em[1].trim().split(' ')[0] : 'E<br><small style="font-size:9px;font-weight:600">Auto</small>'; eB.classList.toggle('hide', !em && !(G() && G().player && G().player.car));
    rot.style.display = innerHeight > innerWidth * 1.1 && on ? 'flex' : 'none';
  }, 250);
  // Beim Start: Vollbild und Querformat versuchen
  document.addEventListener('click', e => { if (e.target && (e.target.id === 'go' || e.target.id === 'cont')) { try { const r = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); if (r && r.then) r.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {}); } catch (err) {} } }, true);
  // Doppeltipp-Zoom und Scrollen verhindern
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.documentElement.style.touchAction = 'none';
})();

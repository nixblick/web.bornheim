// Minimission „Kannst du mir helfen?“ (#81): Ein Passant mit Fragezeichen spricht Englisch oder Französisch,
// drei Sätze, je vier deutsche Antworten (Multiple Choice, Taste 1–4, Maus, Touch). 3 von 3 richtig = 1000 €.
// Sätze und alle Antworten wortgleich aus Vokabaum (data/vokabeln.json, Quelle je Satz, Tickets #82/#83), nichts ausgedacht.
// Höchstens einmal je Ingame-Stunde, nicht bei Fahndung, nicht im Auto. Keine Nutzerdaten an Vokabaum.
/** @param {import('./types').Ctx} X */
export function initVokabaum(X) {
  const { THREE, scene, player, peds, world, keys, showMsg, card, sfx, canvasTex } = X;
  const LINK = 'https://vokabaum.hinjas.de/?von=bornheim', LOHN = 1000, SPAR = 'vokabaumErfolge';
  let last = null, DATA = null, ped = null, offerT = 0, lastHour = null, scanT = 0, ui = null, mission = null, langNext = Math.random() < 0.5 ? 'en' : 'fr';
  fetch('data/vokabeln.json').then(r => r.ok ? r.json() : null).then(d => { if (d && d.en && d.fr) DATA = d; }).catch(() => {});

  // ---------- Fragezeichen über dem Kopf ----------
  const qMat = new THREE.SpriteMaterial({ map: canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#ffd84a'; c.beginPath(); c.arc(32, 32, 28, 0, 7); c.fill(); c.fillStyle = '#1a1a1a'; c.font = 'bold 44px sans-serif'; c.textAlign = 'center'; c.fillText('?', w / 2, 48); }, 1, 1), depthTest: false, transparent: true });
  const mark = new THREE.Sprite(qMat); mark.scale.set(0.7, 0.7, 0.7); mark.visible = false; mark.renderOrder = 10; scene.add(mark);

  const hoursSince = h => lastHour === null ? 99 : (h - lastHour + 24) % 24;
  const blocked = () => !DATA || player.car || player.dead || player.wanted > 0 || (X.inPocket && X.inPocket(player.pos.x, player.pos.z)) || (X.creative && X.creative.on);
  const okPed = p => { const u = p.userData; return p.visible && u.state === 'walk' && !u.cop && !u.demo && !u.follow && !u.medic && !u.ff && !u.keep && !u.car; };
  function release(cool) { if (ped) { const u = ped.userData; u.keep = false; u.vokabaum = false; if (u.vokaSpeed !== undefined) { u.speed = u.vokaSpeed; delete u.vokaSpeed; } } ped = null; mark.visible = false; if (cool) lastHour = world.hour; }
  function offer(p) { ped = p; const u = p.userData; u.keep = true; u.vokabaum = true; u.vokaSpeed = u.speed; u.speed = 0; offerT = 90; mark.visible = true; }
  function tryOffer() { if (ped || mission || blocked() || hoursSince(world.hour) < 1) return; let best = null, bd = 1e9; for (const p of peds) { if (!okPed(p)) continue; const d = p.position.distanceTo(player.pos); if (d > 6 && d < 28 && d < bd) { bd = d; best = p; } } if (best) offer(best); }

  // ---------- Fenster ----------
  function buildUi() { const el = document.createElement('div'); el.id = 'vokabaum'; el.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:60;background:#0008;font-family:system-ui,sans-serif';
    el.innerHTML = '<div style="background:#f3f8ec;color:#1d3a1f;border-radius:14px;padding:18px 18px 14px;width:min(92vw,520px);box-shadow:0 8px 30px #0008"><div class="vk_t" style="font-size:13px;opacity:.75"></div><div class="vk_s" style="font-size:22px;font-weight:700;margin:8px 0 12px"></div><div class="vk_o"></div><div class="vk_f" style="font-size:12px;opacity:.7;margin-top:8px">Taste 1–4, Klick oder Tippen</div></div>';
    for (const ev of ['mousedown', 'pointerdown', 'touchstart', 'touchend', 'click', 'wheel']) el.addEventListener(ev, e => e.stopPropagation()); document.body.appendChild(el); return el; }
  let wasLocked = false;
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function start(lang) { if (!DATA) return false; lang = lang || langNext; langNext = lang === 'en' ? 'fr' : 'en';
    const qs = shuffle(DATA[lang].slice()).slice(0, 3).map(q => ({ q, opts: shuffle([q.richtig, ...q.falsch]) }));
    mission = { lang, qs, i: 0, ok: 0 }; ui = ui || buildUi(); wasLocked = !!document.pointerLockElement; if (wasLocked) document.exitPointerLock(); window.__noAutoMenu = true; for (const k in keys) keys[k] = false;
    mark.visible = false; ui.style.display = 'flex'; sfx('click', 0.5); render(); return true; }
  function render() { const m = mission, c = m.qs[m.i]; ui.querySelector('.vk_t').textContent = `Ein Passant fragt (${m.lang === 'en' ? 'Englisch' : 'Französisch'}) · Satz ${m.i + 1} von 3 · Was heißt das?`;
    ui.querySelector('.vk_s').textContent = c.q.satz; const box = ui.querySelector('.vk_o'); box.textContent = '';
    c.opts.forEach((o, k) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.i = k; b.style.cssText = 'display:block;width:100%;text-align:left;margin:6px 0;padding:11px 12px;border-radius:9px;border:1px solid #7aa86a;background:#fff;color:#1d3a1f;font-size:16px;cursor:pointer;touch-action:manipulation'; b.textContent = `${k + 1}  ${o}`; b.addEventListener('click', () => answer(k)); box.appendChild(b); }); }
  function answer(k) { const m = mission; if (!m || m.wait) return; const c = m.qs[m.i]; const right = c.opts[k] === c.q.richtig; if (right) m.ok++;
    const bs = ui.querySelectorAll('.vk_o button'); bs.forEach((b, j) => { if (c.opts[j] === c.q.richtig) b.style.background = '#b8e6a8'; else if (j === k) b.style.background = '#f2b8b0'; }); sfx('click', right ? 0.7 : 0.3);
    m.wait = true; setTimeout(() => { if (mission !== m) return; m.wait = false; m.i++; if (m.i < 3) render(); else finish(); }, 700); }
  function close() { if (ui) ui.style.display = 'none'; window.__noAutoMenu = false; if (wasLocked) { wasLocked = false; try { X.renderer.domElement.requestPointerLock(); } catch (e) { /* Maus bleibt frei */ } } }
  function finish() { const m = mission; mission = null; close(); release(true);
    if (m.ok === 3) { player.money = (player.money || 0) + LOHN; let n = 1; try { n = (+localStorage.getItem(SPAR) || 0) + 1; localStorage.setItem(SPAR, String(n)); } catch (e) { /* nur für diese Sitzung */ } sfx('pickup');
      card('Merci! / Thank you!', `3 von 3 richtig · +${LOHN.toLocaleString('de-DE')} € · gelöst: ${n}× · Mehr Vokabeln: <a href="${LINK}" target="_blank" rel="noopener" style="color:#9fe08a">vokabaum.hinjas.de</a>`, 9); }
    else card('Merci! / Thank you!', `${m.ok} von 3 richtig · kein Geld, später fragt wieder jemand · Üben: <a href="${LINK}" target="_blank" rel="noopener" style="color:#9fe08a">vokabaum.hinjas.de</a>`, 7);
    last = { ok: m.ok, lang: m.lang }; }
  function abort(msg) { if (mission) { mission = null; close(); } release(true); if (msg) showMsg(msg, 1500); }
  // Taste 1–4 im Fenster; Esc bricht ab. Capture, damit Waffenwahl, Menü und F/E nicht mitlaufen.
  addEventListener('keydown', e => { if (!mission) return; const n = e.code.startsWith('Digit') ? +e.code.slice(5) : e.code.startsWith('Numpad') ? +e.code.slice(6) : 0; if (n >= 1 && n <= 4) answer(n - 1); else if (e.code === 'Escape') abort('PASSANT GEHT WEITER'); e.preventDefault(); e.stopImmediatePropagation(); }, true);
  addEventListener('keyup', e => { if (mission) e.stopImmediatePropagation(); }, true);

  // ---------- F-Aktion und Update ----------
  X.fHooks = X.fHooks || [];
  X.fHooks.push(() => { if (!ped || mission || blocked()) return null; if (ped.position.distanceTo(player.pos) > 3) return null; return { label: 'F · Passant: „Kannst du mir helfen?“', act: () => { start(); } }; });
  function update(dt) { if (mission) { if (player.dead) abort(); return; }
    if (ped) { const u = ped.userData; offerT -= dt; if (!peds.includes(ped) || u.state !== 'walk' || offerT <= 0 || blocked() || ped.position.distanceTo(player.pos) > 60) { release(true); return; } mark.position.set(ped.position.x, ped.position.y + 2.3 + Math.sin(performance.now() / 250) * 0.08, ped.position.z); ped.rotation.y = Math.atan2(player.pos.x - ped.position.x, player.pos.z - ped.position.z); return; }
    scanT -= dt; if (scanT <= 0) { scanT = 2; if (Math.random() < 0.25) tryOffer(); } }
  // Testhilfe: G.VOKA.force('en') setzt die Stunden-Sperre zurück und startet sofort; G.VOKA.mission zeigt die richtige Antwort
  function force(lang) { lastHour = null; release(false); return start(lang); }
  return { update, force, tryOffer, start, get mission() { return mission; }, get ped() { return ped; }, get last() { return last; }, get data() { return DATA; }, get lastHour() { return lastHour; } };
}

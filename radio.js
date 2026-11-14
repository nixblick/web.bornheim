// Autoradio (#146, André 13.11.2026: „Im Auto (nicht auf Rad/zu Fuß) ein Radio: Sender durchschalten, Aus.“).
// Nur im Auto (nicht auf Rad, Motorrad, im Hubschrauber oder zu Fuß): Taste U schaltet Sender 1, 2, 3, Aus.
// Drei erfundene Sender, keine echten Sender und keine echten Personen: Bürgerfunk als Textlaufband mit leisem
// Musikbett, dazu zwei Musiksender. Musik entsteht hier im Code (Web Audio: Bass, Akkorde, Schlagzeug), keine Tondateien.
// Sondermeldungen zu Demo, Polizei, Feuerwehr, Fahndung und Wetter unterbrechen das Band (X.listeners, player.wanted,
// weather.kind; nur zuhören, nichts verändern). Ton über den gemeinsamen Ausgang des Spiels (X.SND.master, Lautstärke
// aus den Optionen), sonst über einen eigenen AudioContext mit derselben Lautstärke. Aus = keine Klangquelle läuft.
// Stand: localStorage 'notgta.radio' (zuletzt gewählter Sender, neue Spieler: aus). Testhilfe: G.X.RADIO.
/** @param {import('./types').Ctx} X */
export function initRadio(X) {
  const A = /** @type {any} */ (X);
  const { player, weather, world } = X;
  const KEY = 'notgta.radio', ITEM_MS = 8000, BULL_MS = 14000, PEGEL = 0.12;
  const touch = !!(/** @type {any} */ (window).__touch);
  const uhr = () => { const h = ((world && world.hour) || 0) % 24; return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`; };
  const WX = { clear: 'trocken und freundlich', cloudy: 'bewölkt, aber trocken', rain: 'Regen, Straßen nass', storm: 'Gewitter und Sturmböen', fog: 'Nebel, schlechte Sicht' };
  const wetter = () => `Das Wetter für Frankfurt: ${WX[weather.kind] || 'wechselhaft'}.`;
  // Sender: Name, Musikstil, Tempo, Akkorde (MIDI-Noten je Takt), Pegel, Laufband
  const SENDER = [
    { name: 'Bürgerfunk Bornheim', stil: 'bett', bpm: 60, pegel: 0.7, akk: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], items: [
      'Sprechstunde Nachbarschaft: Wer hat die Leiter aus dem Hinterhof ausgeliehen? Bitte zurückbringen.',
      'Repair-Café im Gemeindesaal: Toaster, Fahrräder, Lampen. Kaffee gibt es auch.',
      'Der Stadtteilchor sucht tiefe Stimmen. Proben dienstags im Hinterhaus.',
      'Gartenstunde: Jetzt Tulpenzwiebeln setzen, die Balkonkästen nicht vergessen.',
      'Fundsache: Ein grüner Regenschirm wartet im Kiosk am Uhrtürmchen.',
      'Hörerfrage: Warum klingelt die Straßenbahn in der Kurve? Damit sie jeder hört.',
      'Apfelweinkunde: Gerippte Gläser bitte nicht in die Spülmaschine.',
      'Erinnerung: Die gelben Säcke kommen morgen früh an die Straße.',
      'Lesung in der Stadtteilbibliothek: Geschichten vom Main, Eintritt frei.',
      'Stadtteilrunde: Mehr Bänke für die Berger Straße? Schreibt uns eure Ideen.',
      () => `Es ist ${uhr()} Uhr. Sie hören den Bürgerfunk Bornheim.`, wetter] },
    { name: 'Uhrtürmchen-Welle', stil: 'pop', bpm: 100, pegel: 1, akk: [[48, 52, 55], [43, 47, 50], [45, 48, 52], [41, 45, 48]], items: [
      'Jetzt läuft: „Sonntag am Main“', 'Jetzt läuft: „Grüne Soße Blues“', 'Jetzt läuft: „Nachtbus nach Seckbach“',
      'Jetzt läuft: „Kopfsteinpflaster“', 'Jetzt läuft: „Sommer im Ostpark“', 'Jetzt läuft: „Fenster zum Hinterhof“',
      'Uhrtürmchen-Welle: Musik für die Berger Straße.', () => `Es ist ${uhr()} Uhr, die Uhrtürmchen-Welle.`] },
    { name: 'Kellerfunk Ost', stil: 'elektro', bpm: 124, pegel: 0.9, akk: [[45, 48, 52], [45, 48, 52], [41, 45, 48], [43, 47, 50]], items: [
      'Jetzt läuft: „Hafenkran“', 'Jetzt läuft: „Osthafen, vier Uhr“', 'Jetzt läuft: „Betonmischer“',
      'Jetzt läuft: „Schleife Seckbacher Landstraße“', 'Jetzt läuft: „Flutlicht“',
      'Kellerfunk Ost: Nachtmusik aus dem Osthafen.', wetter] },
  ];

  let st = -1; // -1 = aus
  try { const o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (o && Number.isInteger(o.s) && o.s >= 0 && o.s < SENDER.length) st = o.s; } catch (e) { /* kein Speicher: aus */ }
  let shown = '', itemI = 0, itemT = 0, curItem = '', bull = null, hist = [], lastStars = 0, lastWx = weather.kind;

  // ---------- Laufband (eigenes Element, kein Teil der HUD-Texte) ----------
  const el = document.createElement('div'); el.id = 'radioband';
  el.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:8;display:none;max-width:min(560px,86vw);overflow:hidden;white-space:nowrap;text-overflow:ellipsis;background:#000a;color:#e8e2cf;font:600 12px system-ui,sans-serif;padding:3px 10px;border-radius:6px;pointer-events:none';
  if (touch) { el.style.top = '6px'; el.style.bottom = 'auto'; el.style.pointerEvents = 'auto'; el.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); next(); }, { passive: false }); }
  document.body.appendChild(el);

  const inCar = () => { const c = player.car; if (!c || player.dead) return false; const u = c.userData || {}; return !u.bike && !u.heli && !u.boat; };
  function rotate(now, start) { const S = SENDER[st]; if (!S) return; itemT = now; itemI = start ? Math.floor(Math.random() * S.items.length) : (itemI + 1) % S.items.length; const it = S.items[itemI]; curItem = typeof it === 'function' ? it() : it; }

  // ---------- Ton ----------
  let AU = null, playing = -1, out = null, flt = null, timer = 0, tNext = 0, schritt = 0, quellen = new Set(), rausch = null, rauschCtx = null, stumm = false;
  const vol = () => { const v = +(X.opts && X.opts.vol); return isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.8; };
  function audio() {
    const S = A.SND;
    if (S && S.ctx && S.master) { if (!AU || AU.ctx !== S.ctx) { if (AU && AU.eigen) { try { AU.ctx.close(); } catch (e) { /* schon zu */ } } AU = { ctx: S.ctx, dest: S.master, eigen: null }; } return AU; }
    if (AU) return AU;
    const C = window.AudioContext || /** @type {any} */ (window).webkitAudioContext; if (!C) return null;
    const ctx = new C(); const g = ctx.createGain(); g.gain.value = vol(); g.connect(ctx.destination); AU = { ctx, dest: g, eigen: g }; return AU;
  }
  // ohne Nutzergeste bleibt der Kontext stumm; das Versprechen darf nicht als Fehler in der Konsole landen
  function weck(C) { if (C.state !== 'suspended') return; try { const p = C.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ohne Geste */ } }
  function merke(s, ...nodes) { const q = quellen; q.add(s); s.onended = () => { q.delete(s); try { s.disconnect(); for (const n of nodes) n.disconnect(); } catch (e) { /* schon getrennt */ } }; }
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  function ton(C, m, t, dur, typ, g0, att = 0.012) {
    const o = C.createOscillator(), g = C.createGain(); o.type = typ; o.frequency.value = mtof(m);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(g0, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out); merke(o, g); o.start(t); o.stop(t + dur + 0.03);
  }
  function kick(C, t, g0) {
    const o = C.createOscillator(), g = C.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(g0, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25); o.connect(g); g.connect(out); merke(o, g); o.start(t); o.stop(t + 0.28);
  }
  function hit(C, t, dur, typ, f, g0) {
    const s = C.createBufferSource(); s.buffer = rausch; const fi = C.createBiquadFilter(); fi.type = typ; fi.frequency.value = f; const g = C.createGain();
    g.gain.setValueAtTime(g0, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(fi); fi.connect(g); g.connect(out); merke(s, fi, g); s.start(t); s.stop(t + dur + 0.02);
  }
  const rnd3 = a => a[Math.floor(Math.random() * a.length)];
  // Ein Sechzehntel spielen: s = Schritt im Takt (0–15), ak = Akkord des Takts, sd = Länge eines Schritts
  function spiel(C, S, n, t, sd) {
    const s = n % 16, ak = S.akk[Math.floor(n / 16) % S.akk.length];
    if (S.stil === 'bett') { // Bürgerfunk: leises Musikbett unter dem Wort
      if (s === 0) for (const m of ak) ton(C, m, t, sd * 15, 'sine', 0.1, 1.2);
      if (s === 8 && Math.random() < 0.5) ton(C, rnd3(ak) + 12, t, sd * 6, 'sine', 0.04, 0.3);
    } else if (S.stil === 'pop') {
      if (s === 0) for (const m of ak) ton(C, m + 12, t, sd * 15, 'triangle', 0.05, 0.05);
      if (s === 0 || s === 6 || s === 8 || s === 14) ton(C, ak[0] - 12, t, sd * 1.6, 'triangle', 0.35);
      if (s % 2 === 0 && Math.random() < 0.85) ton(C, ak[(s / 2) % 3] + 24, t, sd * 1.2, 'sine', 0.07);
      if (s % 8 === 0) kick(C, t, 0.7);
      if (s === 4 || s === 12) hit(C, t, 0.14, 'bandpass', 1800, 0.35);
      if (s % 2 === 0) hit(C, t, 0.04, 'highpass', 7000, 0.12);
    } else { // elektro
      if (s % 4 === 0) kick(C, t, 0.8);
      if (s % 4 === 2) hit(C, t, 0.08, 'highpass', 8000, 0.14);
      if (s === 4 || s === 12) hit(C, t, 0.1, 'bandpass', 1500, 0.3);
      if (s % 2 === 1) ton(C, ak[0] - 12, t, sd * 0.8, 'square', 0.07);
      if ((s === 3 || s === 10) && Math.random() < 0.6) for (const m of ak) ton(C, m + 12, t, sd * 1.5, 'sawtooth', 0.025);
    }
  }
  function plane() {
    if (!out || playing < 0) return; const C = out.context, S = SENDER[playing], sd = 60 / S.bpm / 4;
    if (tNext < C.currentTime) tNext = C.currentTime + 0.05; // Tab war im Hintergrund: nicht nachholen
    try { while (tNext < C.currentTime + 0.35) { spiel(C, S, schritt, tNext, sd); tNext += sd; schritt++; } } catch (e) { stumm = true; stopMusic(); console.warn('Autoradio ohne Ton', e); }
  }
  function startMusic(i) {
    const a = audio(); if (!a) return; const C = a.ctx; weck(C);
    if (rauschCtx !== C) { rausch = C.createBuffer(1, Math.floor(C.sampleRate * 0.5), C.sampleRate); const d = rausch.getChannelData(0); for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1; rauschCtx = C; }
    playing = i; quellen = new Set();
    out = C.createGain(); out.gain.setValueAtTime(0.0001, C.currentTime); out.gain.linearRampToValueAtTime(PEGEL * SENDER[i].pegel, C.currentTime + 0.6);
    flt = C.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 3800; // klingt nach Autolautsprecher
    out.connect(flt); flt.connect(a.dest);
    tNext = C.currentTime + 0.15; schritt = 0; timer = setInterval(plane, 100); plane();
  }
  function stopMusic() {
    clearInterval(timer); timer = 0; playing = -1;
    const o = out, f = flt, q = quellen; out = null; flt = null; quellen = new Set(); if (!o) return;
    try { const t = o.context.currentTime; o.gain.cancelScheduledValues(t); o.gain.setTargetAtTime(0, t, 0.04); } catch (e) { /* Kontext zu */ }
    setTimeout(() => { for (const s of q) { try { s.stop(); } catch (e) { /* schon aus */ } } q.clear(); try { o.disconnect(); f.disconnect(); } catch (e) { /* schon getrennt */ } }, 220);
  }
  function gong() { if (!out) return; try { const C = out.context, t = C.currentTime + 0.02; ton(C, 81, t, 0.6, 'sine', 0.3); ton(C, 76, t + 0.25, 0.8, 'sine', 0.3); } catch (e) { /* ohne Ton */ } }

  // ---------- Sondermeldungen ----------
  const bereich = p => { const s = p && X.streetAt ? X.streetAt(p.x, p.z) : null; return s ? `im Bereich ${s}` : 'in der Nähe'; };
  function melde(text) {
    const now = performance.now(); if (hist.some(h => h.text === text && now - h.t < 90000)) return; // gleiche Meldung nicht im Minutentakt
    bull = { text, until: now + BULL_MS }; hist.unshift({ text, t: now }); if (hist.length > 8) hist.length = 8; gong();
  }
  X.listeners.push((ev, pos, data) => {
    if (st < 0 || !inCar()) return;
    if (ev === 'demoStart') melde(`Demonstration ${bereich(pos)}. Bitte mit Behinderungen rechnen.`);
    else if (ev === 'policeStage') { const s = data && data.stage;
      if (s === 2) melde(`Polizei sperrt die Strecke einer Demonstration ${bereich(pos)}.`);
      else if (s === 3) melde(`Polizei hat Teile einer Demonstration ${bereich(pos)} eingeschlossen.`);
      else if (s === 4) melde(`Wasserwerfer im Einsatz ${bereich(pos)}. Bitte den Bereich meiden.`);
      else if (s === 5) melde(`Polizei löst eine Versammlung ${bereich(pos)} auf.`); }
    else if (ev === 'brigadeDispatched') melde(`Feuerwehreinsatz ${bereich(pos)}. Bitte Rettungswege freihalten.`);
  });
  const WX_NEU = { rain: 'Wetter: Regen zieht über die Stadt. Bitte Abstand halten.', storm: 'Unwetterwarnung: Gewitter mit Sturmböen über Frankfurt. Bitte vorsichtig fahren.', fog: 'Nebel im Stadtgebiet, die Sicht ist stark eingeschränkt. Licht an!' };
  const SCHLECHT = { rain: 1, storm: 1, fog: 1 };

  // ---------- Takt (4 Hz, nicht jedes Bild) ----------
  function tick() {
    const now = performance.now(), on = st >= 0 && inCar() && !!X.started;
    const stars = player.wanted > 0.05 ? Math.ceil(player.wanted) : 0, kind = weather.kind;
    if (on) {
      if (stars > lastStars) melde(stars >= 3 ? `Großfahndung der Polizei ${bereich(player.pos)}.` : `Polizeieinsatz ${bereich(player.pos)}, Fahndung läuft.`);
      if (kind !== lastWx) { if (WX_NEU[kind]) melde(WX_NEU[kind]); else if (kind === 'clear' && SCHLECHT[lastWx]) melde('Wetter: Es klart auf, die Straßen trocknen.'); }
    }
    lastStars = stars; lastWx = kind;
    const hear = on && !(X.menuOpen && X.menuOpen()) && !document.hidden;
    if (hear && !stumm) { if (playing !== st) { if (playing >= 0) stopMusic(); try { startMusic(st); } catch (e) { stumm = true; stopMusic(); console.warn('Autoradio ohne Ton', e); } } } else if (playing >= 0) stopMusic();
    if (AU && AU.eigen) { const v = vol(); if (Math.abs(AU.eigen.gain.value - v) > 0.01) AU.eigen.gain.value = v; }
    let txt = '', b = false;
    if (on) { if (now - itemT > ITEM_MS || !curItem) rotate(now, !curItem); const S = SENDER[st]; b = !!bull && now < bull.until; txt = `📻 ${S.name} · ${b ? '⚠ ' + bull.text : curItem}`; }
    else if (touch && inCar() && X.started) txt = '📻 Radio aus · antippen';
    if (txt !== shown) { shown = txt; el.textContent = txt; el.style.display = txt ? 'block' : 'none'; el.style.color = b ? '#ffd27a' : '#e8e2cf'; }
  }
  setInterval(tick, 250);

  function next() {
    if (!inCar() || !X.started) return false;
    st = st + 1 >= SENDER.length ? -1 : st + 1;
    try { localStorage.setItem(KEY, JSON.stringify({ s: st })); } catch (e) { /* kein Speicher */ }
    if (playing >= 0) stopMusic();
    if (st >= 0) { rotate(performance.now(), true); const a = audio(); if (a) weck(a.ctx); }
    else { bull = null; curItem = ''; X.showMsg('RADIO AUS', 700); }
    if (X.sfx) X.sfx('click', 0.4);
    tick(); return true;
  }
  addEventListener('keydown', e => {
    if (e.code !== 'KeyU' || e.repeat || !X.started || (X.menuOpen && X.menuOpen()) || X.shopOpen) return;
    const t = /** @type {HTMLElement} */ (e.target); if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (next()) e.preventDefault();
  });

  const api = { next, tick, sender: SENDER.map(s => s.name), get station() { return st; }, get name() { return st >= 0 ? SENDER[st].name : ''; },
    get text() { return shown; }, get bulletin() { return bull && performance.now() < bull.until ? bull.text : ''; }, get history() { return hist.map(h => h.text); },
    get playing() { return playing; }, get audioOk() { return !!(window.AudioContext || /** @type {any} */ (window).webkitAudioContext); }, get quellen() { return quellen.size; } };
  A.RADIO = api;
  return api;
}

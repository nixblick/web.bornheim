// Podcast-Sender (#284, André 16.11.2026: „mp3 files ablegen, wo notebooks.google.com podcast folgen erstellt hat, die dann im
// radio im auto laufen. aber auch per headset auf jedem anderen fahrmittel was man selber bewegt“).
// Folgen: MP3 in audio/podcast/, Liste data/podcast.json ([{ title, file, duration }], erzeugt von tools/podcast.py).
// Im Auto ist „Podcast“ der vierte Sender im Autoradio (radio.js, Taste U) und klingt nach Autolautsprecher (Tiefpass).
// Auf Rad, Lastenrad, Motorrad, Roller und zu Fuß läuft derselbe Player trocken als „Headset“ weiter. Taste J schaltet an/aus,
// Handy-App „Podcast“ und Pausenmenü (Ton & HUD) haben Pause, nächste Folge und Lautstärke. Hubschrauber und Boot: Pause.
// Laden: nur bei Bedarf über ein <audio>-Element (preload none), sw.js lässt audio/ am Cache vorbei.
// Stand: localStorage 'notgta.podcast' = { an, i (Folge), t: { Datei: Sekunde }, vol }. Testhilfe: G.X.PODCAST.
/** @param {import('./types').Ctx} X */
export function initPodcast(X) {
  const A = /** @type {any} */ (X);
  const { player } = X;
  const KEY = 'notgta.podcast', LEER = 'Keine Folgen – MP3 in audio/podcast/ ablegen';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  /** @type {{ title: string, file: string, duration: number }[]} */
  let folgen = [];
  let stand = { an: false, i: 0, t: /** @type {Record<string, number>} */ ({}), vol: 0.8 };
  try { const o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (o && typeof o === 'object') stand = { an: !!o.an, i: Number.isInteger(o.i) ? o.i : 0, t: o.t && typeof o.t === 'object' ? o.t : {}, vol: isFinite(+o.vol) ? Math.max(0, Math.min(1, +o.vol)) : 0.8 }; } catch (e) { /* kein Speicher */ }
  const speichern = () => { try { localStorage.setItem(KEY, JSON.stringify(stand)); } catch (e) { /* kein Speicher */ } };
  const pruefe = l => (Array.isArray(l) ? l : []).filter(f => f && typeof f.file === 'string' && /^[^/\\]+\.mp3$/i.test(f.file)).map(f => ({ title: String(f.title || f.file), file: f.file, duration: +f.duration || 0, src: f.src }));
  function setzeFolgen(l) { folgen = pruefe(l); if (stand.i >= folgen.length) stand.i = 0; }
  fetch('data/podcast.json').then(r => r.ok ? r.json() : []).then(l => { if (!folgen.length) setzeFolgen(l); }).catch(() => { /* keine Liste: Sender bleibt verborgen */ });

  const folge = () => folgen[stand.i] || null;
  const url = f => f.src || ('audio/podcast/' + encodeURIComponent(f.file));
  // Wo hört man: im Auto über das Radio, auf allem Selbstbewegten und zu Fuß per Headset, sonst gar nicht
  function ort() {
    if (player.dead) return '';
    const c = player.car; if (!c) return 'headset';
    const u = c.userData || {}; if (u.heli || u.boat) return '';
    return u.bike ? 'headset' : 'auto';
  }
  const aktiv = () => stand.an && folgen.length > 0;

  // ---------- Ton ----------
  let el = null, graph = null, ctxVon = null, geladen = '', blockiert = false, letzt = 0, modus = '';
  function element() {
    const S = A.SND, C = S && S.ctx && S.master ? S.ctx : null;
    if (el && ctxVon === C) return el;
    const pos = el ? el.currentTime : 0, war = el && !el.paused;
    if (el) { try { el.pause(); el.removeAttribute('src'); el.load(); } catch (e) { /* schon weg */ } if (graph) { try { graph.src.disconnect(); graph.g.disconnect(); graph.f.disconnect(); } catch (e) { /* getrennt */ } } }
    el = new Audio(); el.preload = 'none'; geladen = ''; graph = null; ctxVon = C;
    el.addEventListener('ended', () => { const f = folge(); if (f) stand.t[f.file] = 0; naechste(true); });
    if (C) { try { const src = C.createMediaElementSource(el), g = C.createGain(), f = C.createBiquadFilter(); f.type = 'lowpass'; src.connect(g); g.connect(f); f.connect(S.master); graph = { src, g, f }; } catch (e) { graph = null; } }
    if (war && pos) { /* Spiel-Kontext kam neu dazu: an derselben Stelle weiter */ const fo = folge(); if (fo) stand.t[fo.file] = pos; }
    return el;
  }
  const masterVol = () => { const v = +(X.opts && X.opts.vol); return isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.8; };
  function klang(m) {
    if (!el) return;
    if (graph) { graph.g.gain.value = stand.vol; graph.f.frequency.value = m === 'auto' ? 3800 : 20000; el.volume = 1; } // Auto: Lautsprecher im Innenraum, Headset: trocken
    else el.volume = stand.vol * masterVol();
  }
  function merke() { const f = folge(); if (f && el && geladen === f.file && el.currentTime > 0) { stand.t[f.file] = Math.round(el.currentTime * 10) / 10; speichern(); } }
  function spiel(m) {
    const f = folge(); if (!f) return; const a = element(); klang(m);
    if (geladen !== f.file) { geladen = f.file; a.src = url(f); const t0 = stand.t[f.file] || 0; if (t0 > 0) a.addEventListener('loadedmetadata', () => { try { if (geladen === f.file) a.currentTime = Math.min(t0, (a.duration || t0 + 1) - 0.5); } catch (e) { /* nicht spulbar */ } }, { once: true }); }
    if (a.paused) { try { const p = a.play(); if (p && p.then) p.then(() => { blockiert = false; }, () => { blockiert = true; }); } catch (e) { blockiert = true; } }
    const S = A.SND; if (S && S.ctx && S.ctx.state === 'suspended') { try { const p = S.ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ohne Geste */ } }
  }
  function halt() { if (el && !el.paused) { merke(); el.pause(); } }

  // ---------- Anzeige (Headset; im Auto zeigt das Radioband den Sender) ----------
  const band = document.createElement('div'); band.id = 'podband';
  band.style.cssText = 'position:fixed;left:50%;bottom:52px;transform:translateX(-50%);z-index:8;display:none;max-width:min(520px,86vw);overflow:hidden;white-space:nowrap;text-overflow:ellipsis;background:#000a;color:#cfe3e8;font:600 12px system-ui,sans-serif;padding:3px 10px;border-radius:6px;pointer-events:none';
  document.body.appendChild(band);
  let gezeigt = '';

  // ---------- Takt (4 Hz) ----------
  function tick() {
    const o = ort(), soll = aktiv() && !!X.started && !!o && !(X.menuOpen && X.menuOpen()) && !document.hidden;
    modus = soll ? o : '';
    if (soll) spiel(o); else halt();
    const now = performance.now(); if (soll && now - letzt > 2000) { letzt = now; merke(); }
    const f = folge(), txt = soll && o === 'headset' && f ? `🎧 ${f.title} · J aus` : '';
    if (txt !== gezeigt) { gezeigt = txt; band.textContent = txt; band.style.display = txt ? 'block' : 'none'; }
    if (menuEl && menuEl.isConnected && menuEl.offsetParent) menuZeile();
  }
  setInterval(tick, 250);

  // ---------- Bedienung ----------
  function setAn(v, leise) {
    if (v && !folgen.length) { X.showMsg && X.showMsg(LEER.toUpperCase(), 1800); return false; }
    stand.an = !!v; if (!v) halt(); speichern(); tick();
    if (!leise && X.showMsg) X.showMsg(v ? (ort() === 'auto' ? 'PODCAST IM RADIO' : 'PODCAST: HEADSET AN') : 'PODCAST AUS', 900);
    return true;
  }
  function naechste(weiter) { if (!folgen.length) return false; merke(); halt(); stand.i = (stand.i + 1) % folgen.length; geladen = ''; speichern(); if (weiter !== false) tick(); return true; }
  function lautstaerke(v) { stand.vol = Math.max(0, Math.min(1, +v || 0)); klang(modus); speichern(); }
  function seek(sec) { const f = folge(); if (!f) return; stand.t[f.file] = Math.max(0, +sec || 0); if (el && geladen === f.file) { try { el.currentTime = stand.t[f.file]; } catch (e) { /* nicht spulbar */ } } speichern(); }
  addEventListener('keydown', e => {
    if (e.code !== 'KeyJ' || e.repeat || !X.started || (X.menuOpen && X.menuOpen()) || X.shopOpen) return;
    const t = /** @type {HTMLElement} */ (e.target); if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    setAn(!stand.an); if (X.sfx) X.sfx('click', 0.4); e.preventDefault();
  });

  // Gemeinsame Bedienfläche für Handy-App und Pausenmenü
  function regler(p, toast) {
    const f = folge();
    if (!folgen.length) { p.innerHTML = `<p class="ps-pempty">${esc(LEER)}</p>`; return; }
    p.innerHTML = `<div class="ps-pbtns"><p class="ps-pempty"><b>${esc(f ? f.title : '')}</b><br>Folge ${stand.i + 1} von ${folgen.length} · ${stand.an ? (modus === 'auto' ? 'läuft im Autoradio' : modus === 'headset' ? 'läuft im Headset' : 'an, gerade pausiert') : 'aus'}${blockiert ? ' · Browser wartet auf einen Klick' : ''}</p>
      <button class="ps-pbtn is-amber" data-a="an">${stand.an ? '⏸ Pause' : '▶ Abspielen'}</button><button class="ps-pbtn" data-a="next">⏭ Nächste Folge</button>
      <label class="ps-pempty">Lautstärke <input type="range" min="0" max="1" step="0.05" value="${stand.vol}" data-a="vol"></label></div>`;
    const q = s => /** @type {HTMLInputElement} */ (p.querySelector(`[data-a=${s}]`));
    q('an').onclick = () => { setAn(!stand.an, true); if (toast) toast(stand.an ? 'Podcast an' : 'Podcast pausiert'); regler(p, toast); };
    q('next').onclick = () => { naechste(); if (toast) toast('Nächste Folge'); regler(p, toast); };
    q('vol').oninput = () => lautstaerke(q('vol').value);
  }
  // Pausenmenü: eigener Block unter „Ton & HUD“
  let menuEl = null, menuTxt = '';
  { const pane = document.querySelector('.pane[data-tab=ton]'); if (pane) { menuEl = document.createElement('div'); menuEl.id = 'podmenu'; menuEl.innerHTML = '<h3 style="margin:10px 0 4px;font-size:14px">🎧 Podcast (Taste J)</h3><div></div>'; pane.append(menuEl); } }
  function menuZeile() { const k = JSON.stringify([folgen.length, stand.i, stand.an, modus, blockiert]); if (k === menuTxt) return; menuTxt = k; regler(menuEl.lastElementChild, null); }

  const api = {
    get count() { return folgen.length; }, get an() { return aktiv(); }, get modus() { return modus; }, get ort() { return ort(); },
    get titel() { const f = folge(); return f ? f.title : ''; }, get folge() { return stand.i; }, get vol() { return stand.vol; }, get blockiert() { return blockiert; },
    get src() { return el ? el.getAttribute('src') || '' : ''; }, get gefiltert() { return !!(graph && graph.f.frequency.value < 10000); },
    get stelle() { const f = folge(); if (!f) return 0; return el && geladen === f.file && el.currentTime > 0 ? el.currentTime : (stand.t[f.file] || 0); },
    setAn, naechste, lautstaerke, seek, tick, app: regler, LEER,
    /** Probe: Folgenliste setzen (stumme Test-MP3 aus tools/proben/, nie für Spieler) */
    testFolgen(l) { halt(); geladen = ''; setzeFolgen(l); tick(); return folgen.length; },
  };
  A.PODCAST = api;
  return api;
}

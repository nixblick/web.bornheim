// Erinnerungen, Wohnen Stufe 3 (docs/konzept.md 7.7: „Wohnung als Zentrale“): Fotoalbum und automatisches Tagebuch.
// Fotos: die Kamera-App (phone.js) legt jedes Foto verkleinert ab (längste Seite 960 px, JPEG), höchstens 60 Stück;
// ist das Album voll, fällt das älteste Foto heraus, das weder Favorit ist noch an der Wand hängt.
// Tagebuch: Einträge ohne Zutun aus vorhandenen Signalen (X.listeners: medal, busted, chapterDone, wohnen) und aus
// beobachtetem Zustand (erster Flug mit Christoph 2, erste Taxifahrt), höchstens 200 Einträge.
// Ablage: IndexedDB „bornheim“ mit den Ablagen „fotos“ und „tagebuch“. Fehlt IndexedDB oder ist sie gesperrt (privates
// Fenster), läuft alles mit Listen im Speicher für diese Sitzung weiter; nichts hier darf das Spiel anhalten.
// Die Ablage gehört zum Browser, nicht zum einzelnen Spielstand (spielstaende.js kopiert nur localStorage-Schlüssel).
// Wand in der Wohnung (zuhause.js ruft raum(R) beim Bau des Zimmers): Pinnwand mit Bildschirm, F davor öffnet das Fenster
// mit „Fotos“ und „Erinnerungen“; bis zu vier Rahmen zeigen die aufgehängten Fotos. Das Handy hat dieselbe Ansicht als
// App „Album“.
// Clips (Stufe 4): die Kamera-App nimmt 10 s vom Spielbild auf (ohne Ton, höchstens 960 × 540, rund 1,2 Mbit/s), nur wo der
// Browser MediaRecorder und canvas.captureStream kann. Ablage „clips“ (Datenbank-Version 2), höchstens 6 Stück, ein Clip
// über 8 MB wird nicht abgelegt. Abspielen im dritten Reiter „Clips“ (Wand und Handy); der Fernseher in der Wohnung zeigt
// das Standbild des neuesten Clips und öffnet mit F denselben Reiter. Im Zimmer läuft kein Video als Textur.
/** @param {import('./types').Ctx} X */
export function initErinnerungen(X) {
  const A = /** @type {any} */ (X), W = /** @type {any} */ (window);
  const { THREE, player, world } = A;
  const MAX_FOTOS = 60, MAX_TAGEBUCH = 200, MAX_SEITE = 960, JPEG = 0.8, MAX_RAHMEN = 4, FOTO_FENSTER_MS = 60000, TEX_SEITE = 512;
  const DB = 'bornheim', DB_VERSION = 2, S_F = 'fotos', S_B = 'tagebuch', S_C = 'clips', KEY = 'notgta.erinnern';
  const MAX_CLIPS = 6, CLIP_SEK = 10, CLIP_B = 960, CLIP_H = 540, CLIP_BITS = 1200000, MAX_CLIP_BYTES = 8 * 1024 * 1024, POSTER_SEITE = 320, TV_AUS = 0x10141b;
  const PX = 60000, PZ = 0; // Taschenraum wie interiors.js und zuhause.js
  const FUSS = 'Fotos, Clips und Erinnerungen gehören zu diesem Browser, nicht zum einzelnen Spielstand. Nichts wird hochgeladen.';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const warn = (wo, e) => { try { console.warn('erinnerungen: ' + wo, e); } catch (x) { /* ohne Konsole */ } };
  const tagJetzt = () => Math.max(1, Math.floor(+world.tag || 1));
  const uhrJetzt = () => { const h = (((+world.hour || 0) % 24) + 24) % 24; return Math.round(h * 100) / 100; };
  const uhrText = h => { const t = (((+h || 0) % 24) + 24) % 24, hh = Math.floor(t), mm = Math.floor((t - hh) * 60); return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'); };
  /** Ort wie in der Spielstand-Liste: Straßenname; drinnen der Name des Raums. */
  function ortJetzt() {
    try {
      if (A.ZUHAUSE && A.ZUHAUSE.inside) return 'Zuhause';
      const I = W.G && W.G.INTERIORS; if (I && I.inside) return String(I.inside.label || 'Drinnen');
      return String((A.streetAt && A.streetAt(player.pos.x, player.pos.z)) || 'Frankfurt');
    } catch (e) { return 'Frankfurt'; }
  }

  // ---------- Ablage ----------
  // fotos und buch sind immer der vollständige Stand im Speicher (aufsteigend nach id); die Datenbank wird nur
  // mitgeschrieben. Schlägt ein Schreiben fehl, bleibt der Stand der Sitzung gültig.
  let db = null, fotos = [], buch = [], clips = [], letzteId = 0;
  const neueId = () => (letzteId = Math.max(Date.now(), letzteId + 1));
  // Version 2 (Stufe 4) legt nur die Ablage „clips“ dazu; „fotos“ und „tagebuch“ bleiben, wie sie sind. Hält ein anderer
  // Tab noch Version 1 offen, schließt dessen onversionchange die Verbindung (seit Stufe 3) und die Anfrage läuft durch;
  // bleibt sie länger als 4 s blockiert, gilt für diese Sitzung der Speicher. Meldet der Browser einen Fehler (etwa eine
  // neuere Version aus einem späteren Stand), wird ohne Versionsnummer geöffnet und genutzt, was da ist.
  function oeffnen() {
    let idb = null; try { idb = W.indexedDB; } catch (e) { idb = null; }
    if (!idb) return Promise.resolve(null);
    const versuch = version => new Promise(res => {
      let fertig = false; const ende = (v, fehler) => { if (fertig) { if (v) { try { v.close(); } catch (e) { /* schon zu */ } } return; } fertig = true; res({ d: v, fehler: !!fehler }); };
      try {
        const rq = version ? idb.open(DB, version) : idb.open(DB);
        rq.onupgradeneeded = () => { const d = rq.result; for (const s of [S_F, S_B, S_C]) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' }); };
        rq.onsuccess = () => { const d = rq.result; d.onversionchange = () => { try { d.close(); } catch (e) { /* schon zu */ } if (db === d) db = null; }; d.onclose = () => { if (db === d) db = null; }; ende(d); };
        rq.onerror = e => { try { e.preventDefault(); } catch (x) { /* egal */ } ende(null, true); };
        rq.onblocked = () => { /* der andere Tab schließt gleich; sonst greift die Frist unten */ };
        setTimeout(() => ende(null), 4000); // manche Browser antworten im privaten Fenster gar nicht
      } catch (e) { warn('öffnen', e); ende(null); }
    });
    return versuch(DB_VERSION).then(r => (r.d || !r.fehler ? r.d : versuch(0).then(q => q.d)));
  }
  /** Eine Transaktion; löst immer auf (Ergebnis der Anfrage oder undefined), wirft nie. */
  function tx(store, mode, fn) {
    return new Promise(res => {
      if (!db) { res(undefined); return; }
      try {
        if (!db.objectStoreNames.contains(store)) { res(undefined); return; } // ältere Datenbank ohne diese Ablage: Sitzung
        const t = db.transaction(store, mode); let out; const r = fn(t.objectStore(store));
        if (r) r.onsuccess = () => { out = r.result; };
        t.oncomplete = () => res(out);
        t.onerror = t.onabort = e => { try { e.preventDefault(); } catch (x) { /* egal */ } warn('Ablage ' + store, t.error); res(undefined); };
      } catch (e) { warn('Ablage ' + store, e); res(undefined); }
    });
  }
  const lege = (s, o) => tx(s, 'readwrite', os => { os.put(o); });
  const weg = (s, id) => tx(s, 'readwrite', os => { os.delete(id); });
  /** Datenbank (neu) öffnen und die Ablagen lesen. Ohne Datenbank bleiben die Listen der Sitzung. */
  async function lesen() {
    if (db) { const d = db; db = null; try { d.close(); } catch (e) { /* schon zu */ } }
    db = await oeffnen();
    if (!db) return false;
    const f = await tx(S_F, 'readonly', os => os.getAll()), b = await tx(S_B, 'readonly', os => os.getAll());
    if (Array.isArray(f)) fotos = f.filter(q => q && q.id && q.blob).sort((a, c) => a.id - c.id);
    if (Array.isArray(b)) buch = b.filter(q => q && q.id).sort((a, c) => a.id - c.id);
    const k = await tx(S_C, 'readonly', os => os.getAll());
    if (Array.isArray(k)) clips = k.filter(q => q && q.id && q.blob).sort((a, c) => a.id - c.id);
    for (const q of fotos) letzteId = Math.max(letzteId, q.id); for (const q of buch) letzteId = Math.max(letzteId, q.id); for (const q of clips) letzteId = Math.max(letzteId, q.id);
    return true;
  }
  // Alles, was den Stand ändert, läuft nacheinander und erst nach dem ersten Lesen
  let kette = Promise.resolve();
  const reihe = fn => { const p = kette.then(fn); kette = p.then(() => {}, e => warn('Auftrag', e)); return p.catch(() => null); };
  const bereit = reihe(async () => { await lesen(); return true; });

  // „Zum ersten Mal“-Merker (Taxi, Christoph 2, Festnahme): klein, deshalb localStorage; ohne Speicher gilt die Sitzung
  let merk = {}; try { merk = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { merk = {}; }
  const einmal = k => { if (merk[k]) return false; merk[k] = 1; try { localStorage.setItem(KEY, JSON.stringify(merk)); } catch (e) { /* bleibt bis zum Neuladen */ } return true; };

  // ---------- Fotos ----------
  const meta = f => ({ id: f.id, zeit: f.zeit, tag: f.tag, uhr: f.uhr, ort: f.ort, x: f.x, z: f.z, fav: !!f.fav, wand: f.wand || 0, b: f.b, h: f.h, bytes: f.blob ? f.blob.size : 0 });
  let letztesBild = null, bildT = 0;
  /**
   * Foto vom Spielbild ins Album (derselbe Weg wie der Knopf der Kamera-App). Das Bild wird direkt nach einem eigenen
   * render() gelesen, sonst ist der WebGL-Puffer leer (wie feedback.js). opt.datei: zusätzlich als PNG herunterladen;
   * opt.wieder: die Pixel des letzten Fotos noch einmal ablegen (Proben: viele Fotos ohne viele Renderläufe).
   * @param {{ datei?: boolean, wieder?: boolean }} [opt]
   * @returns {Promise<any>} Metadaten mit anzahl, oder null (kein Bild; Album voll mit geschützten Fotos)
   */
  function fotoAufnehmen(opt = {}) {
    let q = null;
    try {
      if (opt.wieder && letztesBild) q = letztesBild;
      else {
        const cv = A.renderer.domElement, c = W.G && W.G.composerRef && W.G.composerRef();
        if (c && c.render) c.render(); else A.renderer.render(A.scene, A.camera);
        const k = Math.min(1, MAX_SEITE / Math.max(cv.width, cv.height, 1));
        q = document.createElement('canvas'); q.width = Math.max(1, Math.round(cv.width * k)); q.height = Math.max(1, Math.round(cv.height * k));
        q.getContext('2d').drawImage(cv, 0, 0, q.width, q.height);
        if (opt.datei) { const a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = 'bornheim-' + new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-') + '.png'; a.click(); }
        letztesBild = q; clearTimeout(bildT); bildT = W.setTimeout(() => { letztesBild = null; }, 120000);
      }
    } catch (e) { warn('Foto', e); return Promise.resolve(null); }
    const f = { id: 0, zeit: Date.now(), tag: tagJetzt(), uhr: uhrJetzt(), ort: ortJetzt(), x: Math.round(player.pos.x * 10) / 10, z: Math.round(player.pos.z * 10) / 10, fav: false, wand: 0, b: q.width, h: q.height, blob: null };
    return reihe(async () => {
      const blob = await new Promise(r => { try { q.toBlob(r, 'image/jpeg', JPEG); } catch (e) { r(null); } });
      if (!blob) return null;
      f.id = neueId(); f.blob = blob; fotos.push(f);
      const raus = [];
      while (fotos.length > MAX_FOTOS) { const i = fotos.findIndex(p => !p.fav && !p.wand); if (i < 0) break; raus.push(fotos.splice(i, 1)[0]); }
      const selbst = raus.includes(f); // alle 60 sind Favoriten oder hängen: das neue Foto findet keinen Platz
      if (!selbst) await lege(S_F, f);
      for (const p of raus) if (p !== f) await weg(S_F, p.id);
      neuZeichnen();
      return selbst ? null : Object.assign(meta(f), { anzahl: fotos.length });
    });
  }
  const finde = id => fotos.find(q => q.id === +id) || null;
  function favorit(id, an) {
    return reihe(async () => { const f = finde(id); if (!f) return false; f.fav = !!an; await lege(S_F, f); neuZeichnen(); return true; });
  }
  /** An die Wand hängen (an = true) oder abnehmen. Höchstens vier Fotos, und nur mit Wohnung. */
  function haengenG(id, an) {
    return reihe(async () => {
      const f = finde(id); if (!f) return { ok: false, grund: 'Foto nicht gefunden' };
      if (an) {
        if (f.wand) return { ok: true };
        if (A.ZUHAUSE && A.ZUHAUSE.gesperrt) return { ok: false, grund: 'Ohne Wohnung keine Wand' };
        let platz = 0; for (let n = 1; n <= MAX_RAHMEN && !platz; n++) if (!fotos.some(p => p.wand === n)) platz = n;
        if (!platz) return { ok: false, grund: 'Alle vier Rahmen sind belegt' };
        f.wand = platz;
      } else { if (!f.wand) return { ok: true }; f.wand = 0; }
      await lege(S_F, f); rahmenNeu(); neuZeichnen(); return { ok: true };
    });
  }
  function loeschen(id) {
    return reihe(async () => { const i = fotos.findIndex(q => q.id === +id); if (i < 0) return false; const f = fotos.splice(i, 1)[0]; await weg(S_F, f.id); rahmenNeu(); neuZeichnen(); return true; });
  }
  /** Alles löschen (Proben, Aufräumen): Fotos, Clips, Tagebuch und die „zum ersten Mal“-Merker. */
  function leeren() {
    return reihe(async () => {
      fotos = []; buch = []; clips = []; merk = {}; letztesBild = null; try { localStorage.removeItem(KEY); } catch (e) { /* ohne Speicher */ }
      await tx(S_F, 'readwrite', os => { os.clear(); }); await tx(S_B, 'readwrite', os => { os.clear(); }); await tx(S_C, 'readwrite', os => { os.clear(); });
      rahmenNeu(); fernseherNeu(); neuZeichnen(); return true;
    });
  }
  /** Datenbank schließen, neu öffnen und lesen (wie nach einem Neuladen der Seite). */
  function neuLesen() { return reihe(async () => { const ok = await lesen(); rahmenNeu(); fernseherNeu(); neuZeichnen(); return ok; }); }

  // ---------- Clips (Stufe 4) ----------
  // Aufnehmen kann nur, wer MediaRecorder und canvas.captureStream hat und eines dieser Formate schreibt (Reihenfolge:
  // VP9, VP8, WebM ohne Angabe, MP4 für Safari). Sonst bleibt clipTyp leer und der Knopf in der Kamera-App weg.
  const CLIP_TYPEN = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  let clipTyp = '';
  try {
    const MR = W.MediaRecorder, HC = W.HTMLCanvasElement;
    if (MR && typeof MR.isTypeSupported === 'function' && HC && typeof HC.prototype.captureStream === 'function') clipTyp = CLIP_TYPEN.find(t => { try { return !!MR.isTypeSupported(t); } catch (e) { return false; } }) || '';
  } catch (e) { clipTyp = ''; }
  const clipMeta = c => ({ id: c.id, zeit: c.zeit, tag: c.tag, uhr: c.uhr, ort: c.ort, x: c.x, z: c.z, sek: c.sek, b: c.b, h: c.h, mime: c.mime, fav: !!c.fav, bytes: c.blob ? c.blob.size : 0, poster: c.poster ? c.poster.size : 0 });
  const findeClip = id => clips.find(c => c.id === +id) || null;
  const clipEndung = c => (/mp4/.test(String(c.mime)) ? 'mp4' : 'webm');
  const dauerText = sek => { const t = Math.max(0, Math.round(+sek || 0)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
  /**
   * Clip ablegen. Über 6 Stück fällt der älteste heraus, der kein Favorit ist; ein Clip über 8 MB wird nicht abgelegt.
   * @param {Blob} blob @param {{ sek?: number, b?: number, h?: number, mime?: string, poster?: Blob | null }} [m]
   * @returns {Promise<any>} Metadaten mit anzahl, oder { fehler: 'leer' | 'gross' | 'voll' }
   */
  function clipSpeichern(blob, m = {}) {
    const c = { id: 0, zeit: Date.now(), tag: tagJetzt(), uhr: uhrJetzt(), ort: ortJetzt(), x: Math.round(player.pos.x * 10) / 10, z: Math.round(player.pos.z * 10) / 10, sek: Math.round(Math.max(0, +m.sek || 0) * 10) / 10, b: Math.round(+m.b || 0), h: Math.round(+m.h || 0),
      mime: String(m.mime || (blob && blob.type) || 'video/webm').split(';')[0], blob, poster: m.poster || null, fav: false };
    return reihe(async () => {
      if (!blob || !blob.size) return { fehler: 'leer' };
      if (blob.size > MAX_CLIP_BYTES) return { fehler: 'gross' };
      c.id = neueId(); clips.push(c);
      const raus = [];
      while (clips.length > MAX_CLIPS) { const i = clips.findIndex(p => !p.fav); if (i < 0) break; raus.push(clips.splice(i, 1)[0]); }
      const selbst = raus.includes(c); // alle sechs sind Favoriten: der neue Clip findet keinen Platz
      if (!selbst) await lege(S_C, c);
      for (const p of raus) if (p !== c) await weg(S_C, p.id);
      fernseherNeu(); neuZeichnen();
      return selbst ? { fehler: 'voll' } : Object.assign(clipMeta(c), { anzahl: clips.length });
    });
  }
  function clipFavorit(id, an) {
    return reihe(async () => { const c = findeClip(id); if (!c) return false; c.fav = !!an; await lege(S_C, c); neuZeichnen(); return true; });
  }
  function clipLoeschen(id) {
    return reihe(async () => { const i = clips.findIndex(q => q.id === +id); if (i < 0) return false; const c = clips.splice(i, 1)[0]; await weg(S_C, c.id); fernseherNeu(); neuZeichnen(); return true; });
  }

  // Aufnahme. Das Spielbild wird nicht in voller Größe aufgenommen: jedes gezeichnete Bild wird verkleinert in eine eigene
  // 2D-Leinwand kopiert, und deren Strom (captureStream, 24 Bilder/s) geht in den MediaRecorder. Kein Ton, kein AudioContext.
  // Der WebGL-Puffer ist nur in dem Takt gültig, in dem gezeichnet wurde (preserveDrawingBuffer ist aus). Deshalb hängt die
  // Kopie an scene.onAfterRender und läuft als Mikroaufgabe: die kommt dran, sobald der Aufruf der Spielschleife (samt allen
  // Durchgängen des Composers) zurückgekehrt ist, also noch vor dem nächsten Callback und vor dem Zusammensetzen des Bildes.
  // Das kostet je Bild ein drawImage, kein zusätzliches Rendern; nur das erste Bild wird wie beim Foto eigens gerendert.
  /** @type {any} */ let auf = null;
  const sagSpiel = (t, art) => { try { if (A.showMsg) A.showMsg(t, 2400, art || ''); } catch (e) { /* ohne Anzeige weiter */ } };
  function clipTakt(a) {
    if (a.aus) return;
    const jetzt = performance.now(), rest = Math.max(0, a.sek - (jetzt - a.t0) / 1000);
    if (a.badge) a.badge.textContent = '● REC ' + Math.ceil(rest);
    // Zeit um, Fenster im Hintergrund (dort zeichnet das Spiel nicht) oder Pausenmenü offen (die Welt steht): beenden und ablegen
    if (rest <= 0 || document.hidden || (typeof A.menuOpen === 'function' && A.menuOpen())) { clipStopp(); return; }
    // steht das Bild (kein neues seit 300 ms), dasselbe Bild noch einmal zeichnen, damit der Strom weiterläuft
    if (a.bilder && jetzt - a.letztes > 300) { try { a.ctx.drawImage(a.cv, 0, 0); a.letztes = jetzt; } catch (e) { /* nächster Takt */ } }
  }
  /**
   * Clip vom Spielbild aufnehmen (derselbe Weg wie der Knopf der Kamera-App). Läuft schon eine Aufnahme, kommt deren
   * Versprechen zurück. Endet nach sekunden (höchstens 10) oder früher über clipStopp().
   * @param {number} [sekunden] @returns {Promise<any>} Metadaten mit anzahl, oder null (kein Recorder, zu groß, kein Platz)
   */
  function clipAufnehmen(sekunden) {
    if (auf) return auf.fertig;
    if (!clipTyp) return Promise.resolve(null);
    /** @type {any} */ const a = { aus: false, zu: false, t0: performance.now(), sek: Math.min(CLIP_SEK, Math.max(1, +sekunden || CLIP_SEK)), teile: [], bilder: 0, letztes: 0, poster: null, hakenWeg: () => {} };
    a.fertig = new Promise(res => { a.res = res; });
    try {
      const src = A.renderer.domElement, k = Math.min(1, CLIP_B / Math.max(1, src.width), CLIP_H / Math.max(1, src.height));
      const cv = a.cv = document.createElement('canvas'); cv.width = Math.max(2, Math.floor(src.width * k / 2) * 2); cv.height = Math.max(2, Math.floor(src.height * k / 2) * 2); // gerade Maße für den Encoder
      const ctx = a.ctx = cv.getContext('2d', { alpha: false });
      let wartet = false;
      const kopiere = () => {
        wartet = false; if (a.aus) return;
        try {
          ctx.drawImage(src, 0, 0, cv.width, cv.height); a.bilder++; a.letztes = performance.now();
          if (!a.poster) { const pk = Math.min(1, POSTER_SEITE / Math.max(cv.width, cv.height)), pc = a.poster = document.createElement('canvas'); pc.width = Math.max(1, Math.round(cv.width * pk)); pc.height = Math.max(1, Math.round(cv.height * pk)); pc.getContext('2d').drawImage(cv, 0, 0, pc.width, pc.height); }
        } catch (e) { warn('Clip-Bild', e); }
      };
      const sz = A.scene, alt = sz.onAfterRender;
      const haken = function (...p) { try { if (alt) alt.apply(this, p); } catch (e) { /* fremder Haken */ } if (!wartet && !a.aus) { wartet = true; Promise.resolve().then(kopiere); } };
      sz.onAfterRender = haken; a.hakenWeg = () => { if (sz.onAfterRender === haken) sz.onAfterRender = alt; };
      a.stream = cv.captureStream(24);
      const rec = a.rec = new W.MediaRecorder(a.stream, { mimeType: clipTyp, videoBitsPerSecond: CLIP_BITS });
      rec.ondataavailable = e => { if (e.data && e.data.size) a.teile.push(e.data); };
      rec.onstop = () => clipAbschluss(a);
      rec.onerror = () => { a.t0 = Math.min(a.t0, performance.now() - 1000); clipStopp(); };
      rec.start();
      auf = a;
      const c = W.G && W.G.composerRef && W.G.composerRef(); // erstes Bild sofort (auch wenn das Spiel gerade nicht zeichnet), daraus wird das Standbild
      if (c && c.render) c.render(); else A.renderer.render(A.scene, A.camera);
      const bd = a.badge = document.createElement('button'); bd.type = 'button'; bd.id = 'cliprec'; bd.title = 'Aufnahme beenden'; bd.setAttribute('aria-label', 'Aufnahme läuft. Tippen beendet sie.');
      bd.style.cssText = 'position:fixed;left:16px;top:96px;z-index:44;min-height:36px;padding:6px 12px;border:1px solid #ff6b5e;border-radius:18px;background:#0a0d12cc;color:#ff6b5e;font:700 14px system-ui,sans-serif;letter-spacing:.04em;cursor:pointer';
      bd.textContent = '● REC ' + Math.ceil(a.sek); bd.onclick = () => clipStopp(); document.body.appendChild(bd);
      a.uhr = setInterval(() => { try { clipTakt(a); } catch (e) { warn('Clip-Takt', e); } }, 200);
    } catch (e) {
      warn('Clip', e); a.aus = a.zu = true; a.hakenWeg(); clearInterval(a.uhr); if (a.badge) a.badge.remove();
      try { if (a.rec && a.rec.state !== 'inactive') { a.rec.onstop = null; a.rec.stop(); } } catch (x) { /* lief nicht */ }
      try { if (a.stream) for (const t of a.stream.getTracks()) t.stop(); } catch (x) { /* schon aus */ }
      if (auf === a) auf = null; sagSpiel('CLIP NICHT MÖGLICH'); a.res(null);
    }
    return a.fertig;
  }
  /** Laufende Aufnahme beenden und ablegen (frühestens nach 0,7 s, damit mindestens ein Bild im Clip ist). */
  function clipStopp() {
    const a = auf; if (!a || a.aus) return false;
    const frueh = 700 - (performance.now() - a.t0);
    if (frueh > 0) { if (!a.spaeter) a.spaeter = setTimeout(() => { a.spaeter = 0; clipStopp(); }, frueh); return true; }
    a.aus = true; a.dauer = Math.min(a.sek, (performance.now() - a.t0) / 1000);
    clearInterval(a.uhr); clearTimeout(a.spaeter); a.hakenWeg(); if (a.badge) { a.badge.remove(); a.badge = null; }
    a.not = setTimeout(() => clipAbschluss(a), 3000); // meldet der Recorder kein Ende, trotzdem aufräumen
    try { if (a.rec.state !== 'inactive') a.rec.stop(); else clipAbschluss(a); } catch (e) { clipAbschluss(a); }
    return true;
  }
  /** Nach dem Ende des Recorders: Spuren anhalten, Leinwände freigeben, Clip ablegen, Versprechen auflösen. */
  function clipAbschluss(a) {
    if (a.zu) return; a.zu = true; clearTimeout(a.not);
    try { for (const t of a.stream.getTracks()) t.stop(); } catch (e) { /* schon aus */ }
    const typ = String((a.rec && a.rec.mimeType) || clipTyp).split(';')[0] || 'video/webm';
    const blob = a.teile.length ? new Blob(a.teile, { type: typ }) : null; a.teile = [];
    const b = a.cv.width, h = a.cv.height, pc = a.poster;
    (async () => {
      const poster = pc ? await new Promise(r => { try { pc.toBlob(r, 'image/jpeg', 0.72); } catch (e) { r(null); } }) : null;
      try { a.cv.width = a.cv.height = 0; if (pc) pc.width = pc.height = 0; } catch (e) { /* egal */ }
      const m = blob && a.bilder ? await clipSpeichern(blob, { sek: a.dauer, b, h, mime: typ, poster }) : { fehler: 'leer' };
      if (auf === a) auf = null;
      if (m && !m.fehler) sagSpiel(`CLIP GESPEICHERT · ${m.anzahl} VON ${MAX_CLIPS}`, 'ok');
      else sagSpiel(m && m.fehler === 'gross' ? 'CLIP ZU GROSS – NICHT GESPEICHERT' : m && m.fehler === 'voll' ? 'CLIPS VOLL: NUR FAVORITEN – ERST EINEN LÖSCHEN' : 'CLIP NICHT MÖGLICH');
      a.res(m && !m.fehler ? m : null);
    })().catch(e => { warn('Clip ablegen', e); if (auf === a) auf = null; a.res(null); });
  }
  addEventListener('pagehide', () => { if (auf) { auf.t0 = Math.min(auf.t0, performance.now() - 1000); clipStopp(); } });

  // ---------- Tagebuch ----------
  /** Eintrag mit Spieltag, Uhrzeit und Ort von jetzt; hängt das letzte Foto an, wenn es höchstens 60 s alt ist. */
  function eintragen(titel, text, art) {
    const jetzt = Date.now();
    /** @type {any} */ const e = { id: 0, zeit: jetzt, tag: tagJetzt(), uhr: uhrJetzt(), titel: String(titel || 'Erinnerung').slice(0, 80), text: String(text || '').slice(0, 400), ort: ortJetzt() };
    if (art) e.art = String(art);
    return reihe(async () => {
      e.id = neueId();
      const f = fotos[fotos.length - 1]; if (f && jetzt >= f.zeit && jetzt - f.zeit <= FOTO_FENSTER_MS) e.fotoId = f.id;
      buch.push(e); const raus = buch.length > MAX_TAGEBUCH ? buch.splice(0, buch.length - MAX_TAGEBUCH) : [];
      await lege(S_B, e); for (const r of raus) await weg(S_B, r.id);
      neuZeichnen(); return Object.assign({}, e);
    });
  }
  // Signale aus dem Spiel. medal: eulen.js (Marathon, Megamarsch) über progress.js · busted: demo.js · chapterDone: story.js ·
  // wohnen: wohnen.js (einzug, raeumung, kauf, verkauf, versteigerung)
  const WOHN = {
    einzug: ['Einzug', d => `${d.name} · ${d.lage}. Der Mietvertrag ist unterschrieben.`],
    raeumung: ['Zwangsräumung', d => `${d.name} · ${d.lage}. Schloss getauscht, die Sachen sind eingelagert.`],
    kauf: ['Gekauft', d => `${d.name} · ${d.lage}. Im Grundbuch stehst du, an erster Stelle die Bank.`],
    verkauf: ['Verkauft', d => `${d.name} · ${d.lage}.`],
    versteigerung: ['Zwangsversteigerung', d => `${d.name} · ${d.lage}. Den Zuschlag bekam ein Fonds.`],
  };
  if (A.listeners) A.listeners.push((ev, pos, data) => {
    try {
      const d = data || {};
      if (ev === 'medal') { const id = String(d.id || ''); eintragen(/megamarsch/.test(id) ? 'Megamarsch geschafft' : /marathon/.test(id) ? 'Marathon geschafft' : 'Medaille', String(d.n || 'Medaille').slice(0, 60), 'medaille'); }
      else if (ev === 'busted') { if (einmal('festnahme')) eintragen('Erste Festnahme', 'Personalien aufgenommen, Waffen und Pyro beschlagnahmt.', 'festnahme'); }
      else if (ev === 'chapterDone') eintragen('Kapitel geschafft', [d.story, d.title].filter(Boolean).join(' · ') || 'Story', 'kapitel');
      else if (ev === 'wohnen' && WOHN[d.art]) eintragen(WOHN[d.art][0], WOHN[d.art][1]({ name: d.name || 'Wohnung', lage: d.lage || 'Frankfurt' }), 'wohnen-' + d.art);
    } catch (e) { warn('Signal ' + ev, e); }
  });

  // ---------- Ansicht (Wand und Handy-App teilen sie) ----------
  const st = document.createElement('style');
  st.textContent = `#erinnerwand{position:fixed;inset:0;z-index:45;display:none;align-items:center;justify-content:center;background:#0a0d12e0;font-family:system-ui,sans-serif;color:#f1f3f5}
#erinnerwand .er-rahmen{display:flex;flex-direction:column;box-sizing:border-box;width:min(980px,96vw);height:min(760px,94vh);border:1px solid #f1f3f538;border-radius:22px;background:#141a22;overflow:hidden}
#erinnerwand .er-kopf{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px 10px 18px;border-bottom:1px solid #f1f3f51c}
#erinnerwand .er-kopf b{font-size:15px;letter-spacing:.08em;text-transform:uppercase}
#erinnerwand .er-x{flex:none;width:44px;height:44px;border-radius:50%;border:1px solid #f1f3f538;background:#f1f3f50f;color:#f1f3f5;font-size:20px;cursor:pointer}
#erinnerwand .er-inhalt{display:flex;flex-direction:column;flex:1;min-height:0;padding:0 14px 10px}
.er-v{display:flex;flex-direction:column;flex:1;min-height:0}
.er-tabs{flex:none;display:flex;gap:6px;padding:8px 0}
.er-tabs button{flex:1;min-height:40px;padding:8px 6px;border:1px solid #f1f3f538;border-radius:10px;background:#f1f3f50f;color:#f1f3f5d1;font:600 14px system-ui;cursor:pointer}
.er-tabs button.on{background:#f4b544;border-color:#f4b544;color:#111}
.er-k .er-tabs{gap:4px}.er-k .er-tabs button{padding:8px 2px;font-size:12px}
.er-hinweis{flex:none;min-height:16px;font-size:12px;color:#f4b544}
.er-body{flex:1;min-height:0;overflow-y:auto;scrollbar-width:thin}
.er-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.er-k .er-grid{grid-template-columns:repeat(3,1fr);gap:5px}
.er-th{position:relative;display:block;width:100%;padding:0;border:1px solid #f1f3f51c;border-radius:8px;background:#0a0d12;aspect-ratio:16/10;overflow:hidden;cursor:pointer}
.er-th img{width:100%;height:100%;object-fit:cover;display:block}
.er-th i{position:absolute;left:4px;top:3px;font:normal 13px system-ui;color:#f4b544;text-shadow:0 1px 3px #000}
.er-th span{position:absolute;left:0;right:0;bottom:0;padding:2px 5px;background:#0a0d12b8;color:#f1f3f5;font:600 11px system-ui;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.er-leer{color:#8c95a3;font-size:13px;line-height:1.5;margin:10px 2px}
.er-gross{display:flex;flex-direction:column;gap:8px}
.er-bild{position:relative;width:100%;aspect-ratio:16/9;max-height:56vh;background:#0a0d12;border-radius:10px;overflow:hidden}
.er-bild img,.er-bild video{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
.er-nav{position:absolute;top:50%;transform:translateY(-50%);width:44px;height:64px;padding:0;border:0;background:#0a0d1299;color:#fff;font-size:26px;cursor:pointer}
.er-nav.l{left:0;border-radius:0 10px 10px 0}.er-nav.r{right:0;border-radius:10px 0 0 10px}
.er-info{font-size:13px;line-height:1.4;color:#f1f3f5d1}
.er-akt{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:6px}
.er-k .er-akt{grid-template-columns:1fr}
.er-b{min-height:40px;padding:9px 8px;border:1px solid #f1f3f538;border-radius:10px;background:#f1f3f50f;color:#f1f3f5;font:600 13px system-ui;cursor:pointer}
.er-b.on{border-color:#f4b544;color:#f4b544}.er-b.rot{border-color:#e5484d;color:#ff6b5e}.er-b:disabled{opacity:.45;cursor:default}
.er-list{display:flex;flex-direction:column;gap:8px}
.er-e{display:flex;gap:10px;align-items:flex-start;background:#1d2530;border:1px solid #f1f3f51c;border-radius:12px;padding:9px 12px}
.er-e div{flex:1;min-width:0}.er-e b{display:block;font-size:14px;color:#f4b544}.er-e span{display:block;margin-top:2px;font-size:11px;color:#8c95a3}.er-e p{margin:4px 0 0;font-size:13px;line-height:1.4;color:#f1f3f5d1}
.er-mini{flex:none;width:72px;height:46px;padding:0;border:1px solid #f1f3f51c;border-radius:6px;overflow:hidden;background:#0a0d12;cursor:pointer}.er-mini img{width:100%;height:100%;object-fit:cover;display:block}
.er-fuss{flex:none;padding:8px 2px 2px;font-size:11px;line-height:1.4;color:#8c95a3}`;
  document.head.appendChild(st);

  const ansichten = new Set();
  function neuZeichnen() { for (const v of ansichten) { try { v.zeichne(); } catch (e) { warn('Ansicht', e); } } }
  /**
   * Baut die Ansicht mit den Reitern „Fotos“, „Erinnerungen“ und „Clips“ in host. Jede Bild-Adresse (URL.createObjectURL)
   * gehört dieser Ansicht und wird freigegeben, wenn das Foto oder der Clip verschwindet oder die Ansicht schließt. Die
   * Adresse des laufenden Videos gibt es nur einmal: sie wird freigegeben, sobald ein anderer Clip gewählt, der Reiter
   * gewechselt oder die Ansicht geschlossen wird.
   * @param {HTMLElement} host @param {{ kompakt?: boolean, toast?: (t: string, art?: string) => void }} [opt]
   */
  function ansicht(host, opt = {}) {
    const urls = new Map(), purls = new Map(); let tab = 'fotos', gross = 0, klip = 0, loeschId = 0, loeschT = 0, hinweisT = 0, zu = false;
    /** @type {{ id: number, u: string } | null} */ let film = null;
    const url = f => { let u = urls.get(f.id); if (!u) { u = URL.createObjectURL(f.blob); urls.set(f.id, u); } return u; };
    const frei = id => { const u = urls.get(id); if (u) { URL.revokeObjectURL(u); urls.delete(id); } };
    const purl = c => { let u = purls.get(c.id); if (!u) { u = URL.createObjectURL(c.poster); purls.set(c.id, u); } return u; };
    const pfrei = id => { const u = purls.get(id); if (u) { URL.revokeObjectURL(u); purls.delete(id); } };
    /** Video anhalten, vom Element lösen (gibt den Decoder frei) und die Adresse freigeben. */
    const filmFrei = () => { if (!film) return; const v = host.querySelector('video'); if (v) { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) { /* Element schon weg */ } } URL.revokeObjectURL(film.u); film = null; };
    host.innerHTML = `<div class="er-v${opt.kompakt ? ' er-k' : ''}"><div class="er-tabs"><button type="button" data-tab="fotos"></button><button type="button" data-tab="buch"></button><button type="button" data-tab="clips"></button></div><div class="er-hinweis"></div><div class="er-body"></div><div class="er-fuss">${esc(FUSS)}</div></div>`;
    const q = sel => /** @type {any} */ (host.querySelector(sel));
    const body = q('.er-body'), hin = q('.er-hinweis');
    const sag = (t, art) => { if (opt.toast) { opt.toast(t, art); return; } hin.textContent = t; clearTimeout(hinweisT); hinweisT = W.setTimeout(() => { hin.textContent = ''; }, 2600); };
    const neuZuerst = () => fotos.slice().reverse();
    const wo = f => `${esc(f.ort)} · Tag ${f.tag} · ${uhrText(f.uhr)} Uhr`;
    const clipKnoepfe = c => `<button type="button" class="er-b${c.fav ? ' on' : ''}" data-a="fav">${c.fav ? '★ Favorit (bleibt erhalten)' : '☆ Als Favorit merken'}</button>
<button type="button" class="er-b" data-a="datei">⬇ Als Datei speichern (.${clipEndung(c)})</button>
<button type="button" class="er-b rot" data-a="weg">${loeschId === c.id ? 'Wirklich löschen? Noch einmal tippen' : '🗑 Löschen'}</button>
<button type="button" class="er-b" data-a="zurueck">‹ Alle Clips</button>`;
    function zeichneClips() {
      const c = klip ? findeClip(klip) : null; if (!c) klip = 0;
      if (!c) {
        const nein = clipTyp ? '' : '<p class="er-leer">Dieser Browser kann keine Clips aufnehmen.</p>'; // einmal, in klaren Worten
        body.innerHTML = nein + (clips.length ? `<div class="er-grid">${clips.slice().reverse().map(p => `<button type="button" class="er-th" data-clip="${p.id}" title="${wo(p)}">${p.poster ? `<img alt="" loading="lazy" decoding="async" src="${purl(p)}">` : ''}<i>${p.fav ? '★ ' : ''}▶</i><span>${dauerText(p.sek)} · ${esc(p.ort)}</span></button>`).join('')}</div>`
          : clipTyp ? `<p class="er-leer">Noch keine Clips. Die Kamera-App im Handy nimmt ${CLIP_SEK} Sekunden vom Spielbild auf, ohne Ton.</p>` : '');
        return;
      }
      const l = clips.slice().reverse(), info = `<b>${esc(c.ort)}</b> · Tag ${c.tag} · ${uhrText(c.uhr)} Uhr · ${dauerText(c.sek)} · ${(c.blob.size / 1048576).toFixed(1).replace('.', ',')} MB · Clip ${l.indexOf(c) + 1} von ${l.length}`;
      if (film && film.id === c.id && body.querySelector('video')) { q('.er-info').innerHTML = info; q('.er-akt').innerHTML = clipKnoepfe(c); return; } // Video läuft weiter, nur Text und Knöpfe neu
      filmFrei(); film = { id: c.id, u: URL.createObjectURL(c.blob) };
      body.innerHTML = `<div class="er-gross"><div class="er-bild"><video controls muted playsinline preload="metadata" data-clip="${c.id}" src="${film.u}"${c.poster ? ` poster="${purl(c)}"` : ''}></video></div>
<div class="er-info">${info}</div>
<div class="er-akt">${clipKnoepfe(c)}</div></div>`;
      const v = body.querySelector('video'); v.muted = true; // stumm (der Clip hat ohnehin keinen Ton), deshalb darf er nach dem Tippen gleich loslaufen
      try { const p = v.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* dann über die Bedienleiste */ }
    }
    function zeichne() {
      if (zu) return;
      for (const id of [...urls.keys()]) if (!fotos.some(f => f.id === id)) frei(id); // gelöschtes oder verdrängtes Foto
      for (const id of [...purls.keys()]) if (!findeClip(id)) pfrei(id);
      if (film && (tab !== 'clips' || film.id !== klip || !findeClip(klip))) filmFrei(); // anderer Clip, anderer Reiter, Clip gelöscht
      const tf = q('[data-tab=fotos]'), tb = q('[data-tab=buch]'), tc = q('[data-tab=clips]');
      tf.textContent = `Fotos · ${fotos.length}/${MAX_FOTOS}`; tb.textContent = `Erinnerungen · ${buch.length}`; tc.textContent = `Clips · ${clips.length}/${MAX_CLIPS}`;
      tf.classList.toggle('on', tab === 'fotos'); tb.classList.toggle('on', tab === 'buch'); tc.classList.toggle('on', tab === 'clips');
      if (tab === 'clips') { zeichneClips(); return; }
      if (tab === 'buch') {
        body.innerHTML = buch.length ? `<div class="er-list">${buch.slice().reverse().map(e => { const f = e.fotoId ? finde(e.fotoId) : null;
          return `<div class="er-e">${f ? `<button type="button" class="er-mini" data-id="${f.id}" title="Foto ansehen"><img alt="" loading="lazy" decoding="async" src="${url(f)}"></button>` : ''}<div><b>${esc(e.titel)}</b><span>Tag ${e.tag} · ${uhrText(e.uhr)} Uhr · ${esc(e.ort)}</span>${e.text ? `<p>${esc(e.text)}</p>` : ''}</div></div>`; }).join('')}</div>`
          : '<p class="er-leer">Noch keine Erinnerungen. Das Tagebuch schreibt sich von selbst: Story-Kapitel, Medaillen, Einzug, Kauf, die erste Taxifahrt.</p>';
        return;
      }
      const f = gross ? finde(gross) : null; if (!f) gross = 0;
      if (!f) {
        body.innerHTML = fotos.length ? `<div class="er-grid">${neuZuerst().map(p => `<button type="button" class="er-th" data-id="${p.id}" title="${wo(p)}"><img alt="" loading="lazy" decoding="async" src="${url(p)}"><i>${p.fav ? '★' : ''}${p.wand ? ' 🖼' : ''}</i></button>`).join('')}</div>`
          : '<p class="er-leer">Noch keine Fotos. Die Kamera-App im Handy legt jedes Foto hier ab.</p>';
        return;
      }
      const l = neuZuerst(), i = l.indexOf(f), ohneWand = !!(A.ZUHAUSE && A.ZUHAUSE.gesperrt) && !f.wand;
      body.innerHTML = `<div class="er-gross"><div class="er-bild"><img alt="Foto: ${wo(f)}" src="${url(f)}">${l.length > 1 ? '<button type="button" class="er-nav l" data-a="vor" aria-label="Vorheriges Foto">‹</button><button type="button" class="er-nav r" data-a="nach" aria-label="Nächstes Foto">›</button>' : ''}</div>
<div class="er-info"><b>${esc(f.ort)}</b> · Tag ${f.tag} · ${uhrText(f.uhr)} Uhr · Foto ${i + 1} von ${l.length}</div>
<div class="er-akt"><button type="button" class="er-b${f.fav ? ' on' : ''}" data-a="fav">${f.fav ? '★ Favorit (bleibt im Album)' : '☆ Als Favorit merken'}</button>
<button type="button" class="er-b${f.wand ? ' on' : ''}" data-a="wand"${ohneWand ? ' disabled' : ''}>${f.wand ? '🖼 Von der Wand nehmen' : ohneWand ? '🖼 Wand: nur mit Wohnung' : '🖼 An die Wand hängen'}</button>
<button type="button" class="er-b" data-a="datei">⬇ Als Datei speichern</button>
<button type="button" class="er-b rot" data-a="weg">${loeschId === f.id ? 'Wirklich löschen? Noch einmal tippen' : '🗑 Löschen'}</button>
<button type="button" class="er-b" data-a="zurueck">‹ Alle Fotos</button></div></div>`;
    }
    /** Im großen Bild weiter (d = 1) oder zurück (d = -1); true, wenn geblättert wurde. */
    function blaettern(d) {
      if (zu || tab !== 'fotos' || !gross) return false; const l = neuZuerst(), i = l.findIndex(p => p.id === gross); if (i < 0 || l.length < 2) return false;
      gross = l[(i + d + l.length) % l.length].id; loeschId = 0; zeichne(); return true;
    }
    function zeig(id) { if (zu || !finde(id)) return false; tab = 'fotos'; gross = +id; klip = 0; loeschId = 0; zeichne(); return true; }
    /** Clip groß zeigen und abspielen. */
    function zeigClip(id) { if (zu || !findeClip(id)) return false; tab = 'clips'; klip = +id; gross = 0; loeschId = 0; zeichne(); return true; }
    /** Reiter wählen: 'fotos', 'buch' oder 'clips'. */
    function reiter(t) { if (zu || !['fotos', 'buch', 'clips'].includes(t)) return false; tab = t; gross = 0; klip = 0; loeschId = 0; zeichne(); return true; }
    host.addEventListener('click', ev => {
      if (zu) return; const t = /** @type {any} */ (ev.target).closest('button'); if (!t || !host.contains(t) || t.disabled) return;
      if (t.dataset.tab) { reiter(t.dataset.tab); return; }
      if (t.dataset.clip) { zeigClip(t.dataset.clip); return; }
      if (t.dataset.id) { zeig(t.dataset.id); return; }
      const a = t.dataset.a; if (!a) return;
      if (tab === 'clips') {
        const c = findeClip(klip); if (!c) return;
        if (a === 'zurueck') { klip = 0; loeschId = 0; zeichne(); }
        else if (a === 'fav') clipFavorit(c.id, !c.fav).then(() => sag(c.fav ? 'Favorit: bleibt erhalten' : 'Kein Favorit mehr', 'success'));
        else if (a === 'datei') { try { const u = URL.createObjectURL(c.blob), l = document.createElement('a'); l.href = u; l.download = `bornheim-clip-tag${c.tag}-${c.id}.${clipEndung(c)}`; l.click(); setTimeout(() => URL.revokeObjectURL(u), 15000); sag('Als Datei gespeichert', 'success'); } catch (e) { sag('Speichern nicht möglich', 'error'); } }
        else if (a === 'weg') {
          if (loeschId !== c.id) { loeschId = c.id; clearTimeout(loeschT); loeschT = W.setTimeout(() => { loeschId = 0; if (!zu) zeichne(); }, 3500); zeichne(); return; }
          clearTimeout(loeschT); loeschId = 0; klip = 0; clipLoeschen(c.id).then(() => sag('Clip gelöscht', 'success'));
        }
        return;
      }
      const f = finde(gross); if (!f) return;
      if (a === 'vor') blaettern(-1); else if (a === 'nach') blaettern(1);
      else if (a === 'zurueck') { gross = 0; loeschId = 0; zeichne(); }
      else if (a === 'fav') favorit(f.id, !f.fav).then(() => sag(f.fav ? 'Favorit: bleibt im Album' : 'Kein Favorit mehr', 'success'));
      else if (a === 'wand') { const an = !f.wand; haengenG(f.id, an).then(r => sag(r && r.ok ? (an ? 'Hängt an der Wand' : 'Von der Wand genommen') : (r && r.grund) || 'Nicht möglich', r && r.ok ? 'success' : 'error')); }
      else if (a === 'datei') { try { const u = URL.createObjectURL(f.blob), l = document.createElement('a'); l.href = u; l.download = `bornheim-foto-tag${f.tag}-${f.id}.jpg`; l.click(); setTimeout(() => URL.revokeObjectURL(u), 15000); sag('Als Datei gespeichert', 'success'); } catch (e) { sag('Speichern nicht möglich', 'error'); } }
      else if (a === 'weg') {
        if (loeschId !== f.id) { loeschId = f.id; clearTimeout(loeschT); loeschT = W.setTimeout(() => { loeschId = 0; if (!zu) zeichne(); }, 3500); zeichne(); return; }
        clearTimeout(loeschT); loeschId = 0; const l = neuZuerst(), i = l.indexOf(f), nb = l[i + 1] || l[i - 1]; gross = nb ? nb.id : 0;
        loeschen(f.id).then(() => sag('Foto gelöscht', 'success'));
      }
    });
    function schliessen() { if (zu) return; zu = true; clearTimeout(loeschT); clearTimeout(hinweisT); ansichten.delete(v); filmFrei(); for (const id of [...urls.keys()]) frei(id); for (const id of [...purls.keys()]) pfrei(id); try { host.innerHTML = ''; } catch (e) { /* schon weg */ } }
    const v = { zeichne, blaettern, zeig, zeigClip, reiter, schliessen, get tab() { return tab; }, get gross() { return gross; }, get klip() { return klip; }, get adressen() { return urls.size + purls.size + (film ? 1 : 0); } };
    ansichten.add(v); zeichne();
    bereit.then(() => { if (!zu) zeichne(); });
    return v;
  }

  // ---------- Handy-App „Album“ ----------
  /** In die App-Seite des Handys bauen (phone.js). Die Seite hat kein Schließen-Signal: ein kleiner Takt räumt auf. */
  function app(p, H = {}) {
    const v = ansicht(p, { kompakt: true, toast: H.toast });
    const t = setInterval(() => { if (!p.isConnected || !p.getClientRects().length) { clearInterval(t); v.schliessen(); } }, 400);
    return v;
  }

  // ---------- Fenster an der Wand ----------
  let el = null, wandV = null, warGesperrt = false;
  function wandZu() {
    if (!wandV) return false; wandV.schliessen(); wandV = null; el.style.display = 'none'; el.innerHTML = '';
    A.shopOpen = false; W.__noAutoMenu = false;
    if (warGesperrt) { warGesperrt = false; try { const q = A.renderer.domElement.requestPointerLock(); if (q && q.catch) q.catch(() => {}); } catch (e) { /* ohne Sperre weiter */ } }
    return true;
  }
  /** Fenster öffnen (F an der Wand; der Fernseher öffnet es mit reiter = 'clips'). Nur in der eigenen Wohnung und nur, wenn kein anderes Fenster offen ist. */
  function wand(reiter) {
    if (wandV) { if (reiter) wandV.reiter(reiter); return true; } if (!(A.ZUHAUSE && A.ZUHAUSE.inside) || A.shopOpen) return false;
    if (!el) { el = document.createElement('div'); el.id = 'erinnerwand'; el.addEventListener('click', e => { if (e.target === el) wandZu(); }); document.body.appendChild(el); }
    el.innerHTML = '<div class="er-rahmen" role="dialog" aria-label="Fotos, Clips und Erinnerungen"><div class="er-kopf"><b>🖼 Fotos, Clips und Erinnerungen</b><button type="button" class="er-x" aria-label="Schließen" title="Schließen (Esc)">✕</button></div><div class="er-inhalt"></div></div>';
    /** @type {any} */ (el.querySelector('.er-x')).onclick = () => wandZu();
    wandV = ansicht(/** @type {HTMLElement} */ (el.querySelector('.er-inhalt')), {}); if (reiter) wandV.reiter(reiter);
    warGesperrt = !!document.pointerLockElement; W.__noAutoMenu = true; if (warGesperrt) document.exitPointerLock(); A.shopOpen = true; for (const k in A.keys) A.keys[k] = false;
    el.style.display = 'flex'; return true;
  }
  // Esc/F schließen, Pfeile oder A/D blättern im großen Bild (vor den Spieltasten, wie das Fenster in zuhause.js)
  addEventListener('keydown', e => {
    if (!wandV) return; const c = e.code;
    if (c === 'Escape' || (c === 'KeyF' && !e.repeat)) wandZu();
    else if (c === 'ArrowLeft' || c === 'KeyA') wandV.blaettern(-1);
    else if (c === 'ArrowRight' || c === 'KeyD') wandV.blaettern(1);
    else return;
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);

  // ---------- Wand und Rahmen im Zimmer ----------
  // Plätze der vier Rahmen: Mitte an der Wand [x, z] und Normale [nx, nz] ins Zimmer (Zimmer 10 × 8 m, zuhause.js)
  const platzVon = (R, n) => [{ x: -2.4, z: -R.D2, nx: 0, nz: 1 }, { x: -R.W2, z: -1.4, nx: 1, nz: 0 }, { x: R.W2, z: 0.4, nx: -1, nz: 0 }, { x: 0.6, z: R.D2, nx: 0, nz: -1 }][n - 1] || null;
  const RY = 1.68, BW = 0.84, BH = 0.4725; // Höhe der Rahmenmitte, Bildfläche 16:9
  let raumJetzt = null; // { R, bilder: Map<fotoId, { id, platz, mesh }>, tv: { mesh, clipId } } solange das Zimmer steht
  function bildWeg(b) {
    const m = b.mesh; b.mesh = null; if (!m) return;
    try { if (m.parent) m.parent.remove(m); m.geometry.dispose(); if (m.material.map) m.material.map.dispose(); m.material.dispose(); } catch (e) { warn('Rahmen abbauen', e); }
  }
  function raumWeg() { const J = raumJetzt; raumJetzt = null; if (J) { for (const b of J.bilder.values()) bildWeg(b); if (J.tv) bildWeg(J.tv); } }
  /** Foto als Textur: verkleinert auf 512 px, sRGB. Das Zwischenbild wird sofort wieder freigegeben. */
  async function textur(blob) {
    try {
      let src, w, h;
      if (W.createImageBitmap) { src = await W.createImageBitmap(blob); w = src.width; h = src.height; }
      else {
        const u = URL.createObjectURL(blob);
        try { src = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = u; }); } finally { URL.revokeObjectURL(u); }
        w = src.naturalWidth; h = src.naturalHeight;
      }
      const k = Math.min(1, TEX_SEITE / Math.max(w, h, 1)), cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
      cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height); if (src.close) src.close();
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
    } catch (e) { warn('Textur', e); return null; }
  }
  /** Rahmen an den Stand anpassen: abgenommene Fotos abbauen (Textur frei), neue aufhängen. Nur solange das Zimmer steht. */
  function rahmenNeu() {
    const J = raumJetzt; if (!J) return;
    for (const [id, b] of [...J.bilder]) { const f = finde(id); if (!f || f.wand !== b.platz) { bildWeg(b); J.bilder.delete(id); } }
    for (const f of fotos) {
      if (!f.wand || J.bilder.has(f.id)) continue; const pl = platzVon(J.R, f.wand); if (!pl) continue;
      const b = { id: f.id, platz: f.wand, mesh: null }; J.bilder.set(f.id, b);
      textur(f.blob).then(tex => {
        if (raumJetzt !== J || J.bilder.get(f.id) !== b) { if (tex) tex.dispose(); return; } // Zimmer verlassen oder Foto abgenommen, bevor das Bild fertig war
        if (!tex) { J.bilder.delete(f.id); return; }
        const a = tex.image.width / Math.max(1, tex.image.height), bw = a >= BW / BH ? BW : BH * a, bh = a >= BW / BH ? BW / a : BH;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), new THREE.MeshBasicMaterial({ map: tex }));
        m.name = 'erinnerbild'; m.position.set(PX + pl.x + pl.nx * 0.075, RY, PZ + pl.z + pl.nz * 0.075); m.rotation.y = Math.atan2(pl.nx, pl.nz);
        J.R.g.add(m); b.mesh = m;
      });
    }
  }
  // Fernseher: Bildfläche 16:9 an der Südwand links vom Sofa. Sie zeigt das Standbild des neuesten Clips (eine Textur,
  // höchstens 320 px, sRGB), sonst ist sie dunkel. Abgespielt wird im Fenster, nicht als Video-Textur im Zimmer.
  const TVX = -3.0, TVY = 0.89, TVB = 1.02, TVH = 0.57375;
  function fernseherNeu() {
    const J = raumJetzt; if (!J || !J.tv || !J.tv.mesh) return;
    let c = null; for (let i = clips.length - 1; i >= 0 && !c; i--) if (clips[i].poster) c = clips[i];
    const id = c ? c.id : 0; if (id === J.tv.clipId) return; J.tv.clipId = id;
    const setze = tex => {
      const m = J.tv.mesh; if (!m) { if (tex) tex.dispose(); return; }
      const mat = m.material, altT = mat.map; mat.map = tex; mat.color.setHex(tex ? 0xffffff : TV_AUS); mat.needsUpdate = true; if (altT) altT.dispose();
      const a = tex ? tex.image.width / Math.max(1, tex.image.height) : TVB / TVH; // Hochkant-Clip (Handy): mit Rand, nicht verzerrt
      m.scale.set(a >= TVB / TVH ? TVB : TVH * a, a >= TVB / TVH ? TVB / a : TVH, 1);
    };
    if (!c) { setze(null); return; }
    textur(c.poster).then(tex => {
      if (raumJetzt !== J || J.tv.clipId !== id) { if (tex) tex.dispose(); return; } // Zimmer verlassen oder schon ein neuerer Clip
      setze(tex);
    });
  }
  /**
   * Von zuhause.js beim Bau des Zimmers gerufen: Pinnwand mit Ablage und Bildschirm rechts neben der Wohnungstür, vier
   * leere Rahmen mit Passepartout (alles eine Geometrie mit Eckenfarben, ein Draw-Call), F-Aktion davor. Die Bilder
   * selbst sind je ein eigenes Netz mit Textur und entstehen nur für aufgehängte Fotos. Dazu der Fernseher auf einem
   * niedrigen Brett (Kästen in derselben Geometrie, die Bildfläche ein eigenes Netz) mit eigener F-Aktion.
   */
  function raum(R) {
    raumWeg(); if (!R || !R.g || !R.triggers) return false;
    const teile = [];
    const kasten = (col, w, h, d, x, y, z) => { const g0 = new THREE.BoxGeometry(w, h, d), g = g0.toNonIndexed(); g0.dispose(); g.translate(x, y, z); teile.push([g, col]); };
    const bx = 2.6, z0 = -R.D2; // Nordwand, rechts neben der Tür
    kasten(0x6b4a33, 1.7, 1.1, 0.03, bx, 1.62, z0 + 0.015); kasten(0xc49a6c, 1.56, 0.96, 0.02, bx, 1.62, z0 + 0.04); // Pinnwand: Holzrahmen, Kork
    kasten(0xf2e9c8, 0.22, 0.16, 0.01, bx - 0.5, 1.88, z0 + 0.055); kasten(0x9cc7e8, 0.2, 0.2, 0.01, bx - 0.12, 1.52, z0 + 0.055); kasten(0xe8a0a0, 0.18, 0.14, 0.01, bx + 0.56, 1.36, z0 + 0.055); // Zettel
    kasten(0xffffff, 0.3, 0.22, 0.01, bx + 0.32, 1.84, z0 + 0.055); kasten(0x4a6fa5, 0.26, 0.16, 0.01, bx + 0.32, 1.85, z0 + 0.062); // angepinnter Abzug
    kasten(0x7a5a3a, 1.7, 0.05, 0.28, bx, 0.98, z0 + 0.14); // Ablage
    kasten(0x15181d, 0.46, 0.3, 0.04, bx - 0.45, 1.16, z0 + 0.2); kasten(0x7fc4ff, 0.4, 0.24, 0.01, bx - 0.45, 1.16, z0 + 0.225); // kleiner Bildschirm
    kasten(0xb0483a, 0.06, 0.2, 0.16, bx + 0.4, 1.105, z0 + 0.14); kasten(0x2f6b8a, 0.06, 0.22, 0.16, bx + 0.47, 1.115, z0 + 0.14); kasten(0xd8c070, 0.06, 0.18, 0.16, bx + 0.54, 1.095, z0 + 0.14); // Alben
    for (let n = 1; n <= MAX_RAHMEN; n++) { // Rahmen und Passepartout an der Wand, quer zur Normalen
      const p = platzVon(R, n), lage = (col, w, h, d) => (p.nz ? kasten(col, w, h, d, p.x, RY, p.z + p.nz * d / 2) : kasten(col, d, h, w, p.x + p.nx * d / 2, RY, p.z));
      lage(0x3a2a1a, 1.0, 0.64, 0.04); lage(0xf1ece0, 0.9, 0.54, 0.06);
    }
    const fz = R.D2 - 0.28; // Fernseher: Brett mit zwei Wangen, Fuß, flacher dunkler Kasten
    kasten(0x5a4632, 1.6, 0.06, 0.44, TVX, 0.42, fz); kasten(0x4a3a2a, 0.06, 0.39, 0.42, TVX - 0.74, 0.195, fz); kasten(0x4a3a2a, 0.06, 0.39, 0.42, TVX + 0.74, 0.195, fz);
    kasten(0x15181d, 0.34, 0.03, 0.2, TVX, 0.465, fz); kasten(0x15181d, 0.08, 0.1, 0.05, TVX, 0.53, fz); kasten(0x0d0f13, 1.1, 0.64, 0.05, TVX, TVY, fz);
    let n = 0; for (const [g] of teile) n += g.attributes.position.count;
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3), c = new THREE.Color(); let o = 0;
    for (const [g, col] of teile) {
      const k = g.attributes.position.count; P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); c.set(col);
      for (let i = 0; i < k; i++) { C[(o + i) * 3] = c.r; C[(o + i) * 3 + 1] = c.g; C[(o + i) * 3 + 2] = c.b; }
      o += k; g.dispose();
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3)); geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x6a6258, emissiveIntensity: 0.3 }));
    mesh.name = 'erinnerwand'; mesh.position.set(PX, 0, PZ); R.g.add(mesh); // Netz am Taschenraum, Ecken klein: keine Rundung bei x = 60000
    R.triggers.push({ x: bx, z: -R.D2 + 1.1, r: 1.1, label: 'F · Wand: Fotos und Erinnerungen', act: () => wand() });
    const schirm = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: TV_AUS }));
    schirm.name = 'erinnerfernseher'; schirm.position.set(PX + TVX, TVY, PZ + fz - 0.03); schirm.rotation.y = Math.PI; schirm.scale.set(TVB, TVH, 1); R.g.add(schirm); // blickt ins Zimmer (nach Norden)
    if (R.walls) R.walls.push([TVX - 0.85, R.D2 - 0.55, TVX + 0.85, R.D2 - 0.02]);
    R.triggers.push({ x: TVX, z: R.D2 - 1.3, r: 1.1, label: 'F · Fernseher: Clips ansehen', act: () => wand('clips') });
    raumJetzt = { R, bilder: new Map(), tv: { mesh: schirm, clipId: 0 } };
    bereit.then(() => { rahmenNeu(); fernseherNeu(); });
    return true;
  }

  // ---------- Takt (eigener, keine Zeile in der Spielschleife) ----------
  let taxiWar = false;
  function takt() {
    const drin = !!(A.ZUHAUSE && A.ZUHAUSE.inside);
    if (raumJetzt && !drin) raumWeg(); // Zimmer verlassen: Texturen der Rahmen frei (interiors.js baut den Rest ab)
    if (wandV && !drin) wandZu(); // aus der Wohnung versetzt (Räumung): Fenster zu, Eingaben wieder frei
    const car = player.car, u = car && car.userData;
    if (u && u.heli && !u.landed && !merk.heli && einmal('heli')) eintragen('Erster Flug mit Christoph 2', 'Abgehoben. Frankfurt von oben.', 'heli');
    const taxi = !!document.getElementById('taxifahrt'); // taxi.js zeigt diese Blende nur während einer bezahlten Fahrt
    if (taxiWar && !taxi && !merk.taxi && einmal('taxi')) eintragen('Erste Taxifahrt', 'Angekommen, ohne selbst zu fahren.', 'taxi');
    taxiWar = taxi;
  }
  setInterval(() => { try { takt(); } catch (e) { warn('Takt', e); } }, 300);

  const api = {
    MAX_FOTOS, MAX_TAGEBUCH, MAX_SEITE, MAX_RAHMEN, FOTO_FENSTER_MS,
    /** löst auf, sobald die Ablage gelesen ist (auch ohne IndexedDB) */ bereit,
    fotoAufnehmen, /** Metadaten aller Fotos, älteste zuerst */ fotos: () => fotos.map(meta), /** Einträge, älteste zuerst */ tagebuch: () => buch.map(e => Object.assign({}, e)),
    /** gespeichertes JPEG eines Fotos */ blob: id => { const f = finde(id); return f ? f.blob : null; },
    haengen: (id, an) => haengenG(id, an !== false).then(r => !!(r && r.ok)), favorit, loeschen, leeren, neuLesen,
    /** Testhilfe: Eintrag von Hand */ eintrag: (titel, text) => eintragen(titel, text, 'test'),
    MAX_CLIPS, CLIP_SEK, MAX_CLIP_BYTES,
    /** true, wenn dieser Browser Clips aufnehmen kann */ clipKannAufnehmen: !!clipTyp, /** gewähltes Aufnahmeformat oder '' */ clipTyp,
    clipAufnehmen, clipStopp, /** Metadaten aller Clips, älteste zuerst */ clips: () => clips.map(clipMeta),
    /** gespeichertes Video eines Clips */ clipBlob: id => { const c = findeClip(id); return c ? c.blob : null; }, /** Standbild (JPEG) eines Clips */ clipPoster: id => { const c = findeClip(id); return c ? c.poster : null; },
    clipFavorit, clipLoeschen,
    /** Testhilfe: fertiges Video ohne Aufnahme ablegen (dieselben Grenzen); Metadaten oder null */ _clipSpeichern: (blob, m) => clipSpeichern(blob, m).then(r => (r && !r.fehler ? r : null)),
    get clipLaeuft() { return !!auf && !auf.aus; },
    /** Fernseher im Zimmer: { da, clipId, textur, b, h, farbraum } */
    get fernseher() { const t = raumJetzt && raumJetzt.tv, m = t && t.mesh, x = m && m.material.map; return { da: !!m, clipId: t ? t.clipId : 0, textur: !!(x && x.isTexture), b: x ? x.image.width : 0, h: x ? x.image.height : 0, farbraum: x ? x.colorSpace : '' }; },
    raum, wand, wandZu, app,
    get wandOffen() { return !!wandV; }, get ansicht() { return wandV; },
    /** gebaute Bilder in den Rahmen (nur im Zimmer): [{ id, platz, textur, b, h }] */
    get rahmen() { return raumJetzt ? [...raumJetzt.bilder.values()].map(b => { const t = b.mesh && b.mesh.material.map; return { id: b.id, platz: b.platz, textur: !!(t && t.isTexture), b: t ? t.image.width : 0, h: t ? t.image.height : 0 }; }) : []; },
    get imRaum() { return !!raumJetzt; },
    /** 'indexeddb' oder 'sitzung' (ohne Datenbank: nur bis zum Neuladen) */ get speicher() { return db ? 'indexeddb' : 'sitzung'; },
  };
  A.ERINNERN = api; W.ERINNERN = api;
  return api;
}

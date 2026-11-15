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
// App „Album“. Videos kommen erst mit Stufe 4.
/** @param {import('./types').Ctx} X */
export function initErinnerungen(X) {
  const A = /** @type {any} */ (X), W = /** @type {any} */ (window);
  const { THREE, player, world } = A;
  const MAX_FOTOS = 60, MAX_TAGEBUCH = 200, MAX_SEITE = 960, JPEG = 0.8, MAX_RAHMEN = 4, FOTO_FENSTER_MS = 60000, TEX_SEITE = 512;
  const DB = 'bornheim', S_F = 'fotos', S_B = 'tagebuch', KEY = 'notgta.erinnern';
  const PX = 60000, PZ = 0; // Taschenraum wie interiors.js und zuhause.js
  const FUSS = 'Fotos und Erinnerungen gehören zu diesem Browser, nicht zum einzelnen Spielstand. Nichts wird hochgeladen.';
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
  let db = null, fotos = [], buch = [], letzteId = 0;
  const neueId = () => (letzteId = Math.max(Date.now(), letzteId + 1));
  function oeffnen() {
    return new Promise(res => {
      let fertig = false; const ende = v => { if (fertig) { if (v) { try { v.close(); } catch (e) { /* schon zu */ } } return; } fertig = true; res(v); };
      try {
        const idb = W.indexedDB; if (!idb) { ende(null); return; }
        const rq = idb.open(DB, 1);
        rq.onupgradeneeded = () => { const d = rq.result; for (const s of [S_F, S_B]) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' }); };
        rq.onsuccess = () => { const d = rq.result; d.onversionchange = () => { try { d.close(); } catch (e) { /* schon zu */ } if (db === d) db = null; }; d.onclose = () => { if (db === d) db = null; }; ende(d); };
        rq.onerror = e => { try { e.preventDefault(); } catch (x) { /* egal */ } ende(null); };
        rq.onblocked = () => ende(null);
        setTimeout(() => ende(null), 4000); // manche Browser antworten im privaten Fenster gar nicht
      } catch (e) { warn('öffnen', e); ende(null); }
    });
  }
  /** Eine Transaktion; löst immer auf (Ergebnis der Anfrage oder undefined), wirft nie. */
  function tx(store, mode, fn) {
    return new Promise(res => {
      if (!db) { res(undefined); return; }
      try {
        const t = db.transaction(store, mode); let out; const r = fn(t.objectStore(store));
        if (r) r.onsuccess = () => { out = r.result; };
        t.oncomplete = () => res(out);
        t.onerror = t.onabort = e => { try { e.preventDefault(); } catch (x) { /* egal */ } warn('Ablage ' + store, t.error); res(undefined); };
      } catch (e) { warn('Ablage ' + store, e); res(undefined); }
    });
  }
  const lege = (s, o) => tx(s, 'readwrite', os => { os.put(o); });
  const weg = (s, id) => tx(s, 'readwrite', os => { os.delete(id); });
  /** Datenbank (neu) öffnen und beide Ablagen lesen. Ohne Datenbank bleiben die Listen der Sitzung. */
  async function lesen() {
    if (db) { const d = db; db = null; try { d.close(); } catch (e) { /* schon zu */ } }
    db = await oeffnen();
    if (!db) return false;
    const f = await tx(S_F, 'readonly', os => os.getAll()), b = await tx(S_B, 'readonly', os => os.getAll());
    if (Array.isArray(f)) fotos = f.filter(q => q && q.id && q.blob).sort((a, c) => a.id - c.id);
    if (Array.isArray(b)) buch = b.filter(q => q && q.id).sort((a, c) => a.id - c.id);
    for (const q of fotos) letzteId = Math.max(letzteId, q.id); for (const q of buch) letzteId = Math.max(letzteId, q.id);
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
  /** Alles löschen (Proben, Aufräumen): Fotos, Tagebuch und die „zum ersten Mal“-Merker. */
  function leeren() {
    return reihe(async () => {
      fotos = []; buch = []; merk = {}; letztesBild = null; try { localStorage.removeItem(KEY); } catch (e) { /* ohne Speicher */ }
      await tx(S_F, 'readwrite', os => { os.clear(); }); await tx(S_B, 'readwrite', os => { os.clear(); });
      rahmenNeu(); neuZeichnen(); return true;
    });
  }
  /** Datenbank schließen, neu öffnen und lesen (wie nach einem Neuladen der Seite). */
  function neuLesen() { return reihe(async () => { const ok = await lesen(); rahmenNeu(); neuZeichnen(); return ok; }); }

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
.er-hinweis{flex:none;min-height:16px;font-size:12px;color:#f4b544}
.er-body{flex:1;min-height:0;overflow-y:auto;scrollbar-width:thin}
.er-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.er-k .er-grid{grid-template-columns:repeat(3,1fr);gap:5px}
.er-th{position:relative;display:block;width:100%;padding:0;border:1px solid #f1f3f51c;border-radius:8px;background:#0a0d12;aspect-ratio:16/10;overflow:hidden;cursor:pointer}
.er-th img{width:100%;height:100%;object-fit:cover;display:block}
.er-th i{position:absolute;left:4px;top:3px;font:normal 13px system-ui;color:#f4b544;text-shadow:0 1px 3px #000}
.er-leer{color:#8c95a3;font-size:13px;line-height:1.5;margin:10px 2px}
.er-gross{display:flex;flex-direction:column;gap:8px}
.er-bild{position:relative;width:100%;aspect-ratio:16/9;max-height:56vh;background:#0a0d12;border-radius:10px;overflow:hidden}
.er-bild img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
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
   * Baut die Ansicht mit den Reitern „Fotos“ und „Erinnerungen“ in host. Jede Bild-Adresse (URL.createObjectURL) gehört
   * dieser Ansicht und wird freigegeben, wenn das Foto verschwindet oder die Ansicht schließt.
   * @param {HTMLElement} host @param {{ kompakt?: boolean, toast?: (t: string, art?: string) => void }} [opt]
   */
  function ansicht(host, opt = {}) {
    const urls = new Map(); let tab = 'fotos', gross = 0, loeschId = 0, loeschT = 0, hinweisT = 0, zu = false;
    const url = f => { let u = urls.get(f.id); if (!u) { u = URL.createObjectURL(f.blob); urls.set(f.id, u); } return u; };
    const frei = id => { const u = urls.get(id); if (u) { URL.revokeObjectURL(u); urls.delete(id); } };
    host.innerHTML = `<div class="er-v${opt.kompakt ? ' er-k' : ''}"><div class="er-tabs"><button type="button" data-tab="fotos"></button><button type="button" data-tab="buch"></button></div><div class="er-hinweis"></div><div class="er-body"></div><div class="er-fuss">${esc(FUSS)}</div></div>`;
    const q = sel => /** @type {any} */ (host.querySelector(sel));
    const body = q('.er-body'), hin = q('.er-hinweis');
    const sag = (t, art) => { if (opt.toast) { opt.toast(t, art); return; } hin.textContent = t; clearTimeout(hinweisT); hinweisT = W.setTimeout(() => { hin.textContent = ''; }, 2600); };
    const neuZuerst = () => fotos.slice().reverse();
    const wo = f => `${esc(f.ort)} · Tag ${f.tag} · ${uhrText(f.uhr)} Uhr`;
    function zeichne() {
      if (zu) return;
      for (const id of [...urls.keys()]) if (!fotos.some(f => f.id === id)) frei(id); // gelöschtes oder verdrängtes Foto
      const tf = q('[data-tab=fotos]'), tb = q('[data-tab=buch]');
      tf.textContent = `Fotos · ${fotos.length}/${MAX_FOTOS}`; tb.textContent = `Erinnerungen · ${buch.length}`;
      tf.classList.toggle('on', tab === 'fotos'); tb.classList.toggle('on', tab === 'buch');
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
    function zeig(id) { if (!finde(id)) return false; tab = 'fotos'; gross = +id; loeschId = 0; zeichne(); return true; }
    host.addEventListener('click', ev => {
      if (zu) return; const t = /** @type {any} */ (ev.target).closest('button'); if (!t || !host.contains(t) || t.disabled) return;
      if (t.dataset.tab) { tab = t.dataset.tab; gross = 0; loeschId = 0; zeichne(); return; }
      if (t.dataset.id) { zeig(t.dataset.id); return; }
      const a = t.dataset.a, f = finde(gross); if (!a || !f) return;
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
    function schliessen() { if (zu) return; zu = true; clearTimeout(loeschT); clearTimeout(hinweisT); ansichten.delete(v); for (const id of [...urls.keys()]) frei(id); try { host.innerHTML = ''; } catch (e) { /* schon weg */ } }
    const v = { zeichne, blaettern, zeig, schliessen, get tab() { return tab; }, get gross() { return gross; }, get adressen() { return urls.size; } };
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
  /** Fenster öffnen (F an der Wand). Nur in der eigenen Wohnung und nur, wenn kein anderes Fenster offen ist. */
  function wand() {
    if (wandV) return true; if (!(A.ZUHAUSE && A.ZUHAUSE.inside) || A.shopOpen) return false;
    if (!el) { el = document.createElement('div'); el.id = 'erinnerwand'; el.addEventListener('click', e => { if (e.target === el) wandZu(); }); document.body.appendChild(el); }
    el.innerHTML = '<div class="er-rahmen" role="dialog" aria-label="Fotos und Erinnerungen"><div class="er-kopf"><b>🖼 Fotos und Erinnerungen</b><button type="button" class="er-x" aria-label="Schließen" title="Schließen (Esc)">✕</button></div><div class="er-inhalt"></div></div>';
    /** @type {any} */ (el.querySelector('.er-x')).onclick = () => wandZu();
    wandV = ansicht(/** @type {HTMLElement} */ (el.querySelector('.er-inhalt')), {});
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
  let raumJetzt = null; // { R, bilder: Map<fotoId, { id, platz, mesh }> } solange das Zimmer steht
  function bildWeg(b) {
    const m = b.mesh; b.mesh = null; if (!m) return;
    try { if (m.parent) m.parent.remove(m); m.geometry.dispose(); if (m.material.map) m.material.map.dispose(); m.material.dispose(); } catch (e) { warn('Rahmen abbauen', e); }
  }
  function raumWeg() { const J = raumJetzt; raumJetzt = null; if (J) for (const b of J.bilder.values()) bildWeg(b); }
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
  /**
   * Von zuhause.js beim Bau des Zimmers gerufen: Pinnwand mit Ablage und Bildschirm rechts neben der Wohnungstür, vier
   * leere Rahmen mit Passepartout (alles eine Geometrie mit Eckenfarben, ein Draw-Call), F-Aktion davor. Die Bilder
   * selbst sind je ein eigenes Netz mit Textur und entstehen nur für aufgehängte Fotos.
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
    raumJetzt = { R, bilder: new Map() };
    bereit.then(rahmenNeu);
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

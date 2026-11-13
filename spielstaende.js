// Mehrere Spielstände lokal (André 13.11.2026: „würd gern mehrere Spielstände lokal speichern können zum Testen“).
// Eigener Punkt „Spielstand“ im Pausenmenü: benannte Plätze anlegen, laden, überschreiben, als Datei sichern, löschen,
// Datei einlesen. Ein Platz hält alles, was das Spiel lokal ablegt: Position/Inventar (notgta.save), Fortschritt
// (notgta.progress) und Story (notgta.story). Laden heißt: Platz vormerken, Seite neu laden, die Schlüssel werden beim
// Start dieses Moduls zurückgeschrieben (vor initProgress/initStory), dann „Fortsetzen“. So bleibt kein alter Zustand
// im Speicher der Module hängen, und ein automatisches Speichern beim Verlassen überschreibt den Platz nicht.
// Seit Format 2 gehören auch Story 2, Story 3 (notgta.story2/3) und Ruf (notgta.rep) dazu. Ältere Plätze (ohne _v)
// lassen diese drei Schlüssel beim Laden unberührt; eingelesene alte Exportdateien (nurSave) schreiben nur notgta.save.

const KEYS_ALT = ['notgta.save', 'notgta.progress', 'notgta.story'], KEYS_NEU = ['notgta.story2', 'notgta.story3', 'notgta.rep'], KEYS = [...KEYS_ALT, ...KEYS_NEU];
const IDX = 'notgta.slots', PRE = 'notgta.slot.', PEND = 'notgta.slot.pending', MAX = 20;

// Vorgemerkten Platz zurückschreiben: läuft beim Import des Moduls, also vor dem Rumpf von game.js
try {
  const id = sessionStorage.getItem(PEND);
  if (id) {
    sessionStorage.removeItem(PEND);
    const d = JSON.parse(localStorage.getItem(PRE + id) || 'null');
    if (d && typeof d === 'object') {
      const setzen = k => { if (typeof d[k] === 'string') localStorage.setItem(k, d[k]); else localStorage.removeItem(k); };
      if (d.nurSave) { if (typeof d['notgta.save'] === 'string') localStorage.setItem('notgta.save', d['notgta.save']); } // alte Exportdatei: Fortschritt und Storys bleiben, wie sie sind
      else { for (const k of KEYS_ALT) setzen(k); if (+d._v >= 2) for (const k of KEYS_NEU) setzen(k); }
    }
  }
} catch (e) { console.warn('Spielstand zurückschreiben', e); }

/** @param {import('./types').Ctx} X */
export function initSpielstaende(X) {
  const A = /** @type {any} */ (X);
  const menu = document.getElementById('menu'), opts = menu && menu.querySelector('.opts');
  if (!menu || !opts) return null;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const msg = (t, ok) => { try { A.showMsg(t, 1500, ok ? 'ok' : undefined); } catch (e) {} };
  /** @returns {{ id: string, name: string, when: number, ort: string, geld: number, teil?: boolean }[]} */
  const list = () => { try { const l = JSON.parse(localStorage.getItem(IDX) || '[]'); return Array.isArray(l) ? l.filter(s => s && typeof s.id === 'string') : []; } catch (e) { return []; } };
  const putList = l => localStorage.setItem(IDX, JSON.stringify(l));
  const snapshot = () => { /** @type {Record<string, string>} */ const d = { _v: '2' }; for (const k of KEYS) { const v = localStorage.getItem(k); if (v != null) d[k] = v; } return d; };
  const when = t => { try { return new Date(t).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
  const meta = name => { let ort = ''; try { ort = A.streetAt(A.player.pos.x, A.player.pos.z) || ''; } catch (e) {} return { name: String(name || '').trim().slice(0, 40) || 'Spielstand ' + when(Date.now()), when: Date.now(), ort, geld: Math.round(A.player.money || 0) }; };

  /** Aktuellen Stand in einen Platz schreiben; id leer = neuer Platz. */
  function sichern(id, name) {
    if (!A.started) { msg('ERST INS SPIEL'); return false; }
    const l = list(); const alt = id ? l.find(s => s.id === id) : null;
    if (!alt && l.length >= MAX) { msg('HÖCHSTENS ' + MAX + ' SPIELSTÄNDE'); return false; }
    let nid = '';
    try {
      A.saveGame(true); // schreibt notgta.save frisch; Fortschritt und Story speichern sich selbst
      nid = alt ? alt.id : Date.now().toString(36) + Math.floor(performance.now() % 1000).toString(36);
      localStorage.setItem(PRE + nid, JSON.stringify(snapshot()));
      const m = { id: nid, ...meta(name || (alt && alt.name)) };
      putList(alt ? l.map(s => s.id === nid ? m : s) : [m, ...l]);
      msg('SPIELSTAND GESICHERT', true); return true;
    } catch (e) { console.warn('Spielstand sichern', e); if (!alt && nid) { try { localStorage.removeItem(PRE + nid); } catch (_) {} } msg('SPEICHERN FEHLGESCHLAGEN'); return false; }
  }
  function laden(id) {
    if (!localStorage.getItem(PRE + id)) { msg('SPIELSTAND UNBRAUCHBAR'); return; }
    if (A.started && !confirm('Diesen Spielstand laden? Das Spiel lädt neu, nicht gesicherter Fortschritt geht verloren.')) return;
    try { sessionStorage.setItem(PEND, id); } catch (e) { msg('LADEN FEHLGESCHLAGEN'); return; }
    location.reload();
  }
  function loeschen(id) {
    const s = list().find(x => x.id === id); if (!s || !confirm('Spielstand „' + s.name + '“ löschen?')) return;
    try { localStorage.removeItem(PRE + id); putList(list().filter(x => x.id !== id)); } catch (e) {}
    render();
  }
  function datei(id) {
    const s = list().find(x => x.id === id), raw = localStorage.getItem(PRE + id); if (!s || !raw) return;
    let keys; try { keys = JSON.parse(raw); } catch (e) { return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({ bornheimSpielstand: 1, name: s.name, when: s.when, ort: s.ort, geld: s.geld, keys })], { type: 'application/json' }));
    a.download = 'bornheim-' + s.name.replace(/[^\wäöüÄÖÜß-]+/g, '_').slice(0, 30) + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  /** Datei einlesen: neues Format (alle Schlüssel) oder alter Export (nur notgta.save, erkennbar an pos). */
  function einlesen(file) {
    const fr = new FileReader();
    fr.onload = () => {
      /** @type {Record<string, string>} */ const keys = {}; let d, sv, teil = false;
      try { // 1. lesen und prüfen
        d = JSON.parse(String(fr.result)); if (!d || typeof d !== 'object') throw new Error('leer');
        if (d.bornheimSpielstand && d.keys && typeof d.keys === 'object') { for (const k of KEYS) if (typeof d.keys[k] === 'string') keys[k] = d.keys[k]; if (+d.keys._v >= 2) keys._v = '2'; if (d.keys.nurSave) { keys.nurSave = '1'; teil = true; } }
        else if (Array.isArray(d.pos)) { keys['notgta.save'] = JSON.stringify(d); keys.nurSave = '1'; teil = true; } // alter Export: nur Position und Inventar
        sv = JSON.parse(keys['notgta.save'] || 'null'); if (!sv || !Array.isArray(sv.pos) || !sv.pos.every(Number.isFinite)) throw new Error('kein Spielstand');
      } catch (e) { alert('Diese Datei ist kein gültiger Spielstand.'); return; }
      const l = list(); if (l.length >= MAX) { alert('Es sind schon ' + MAX + ' Spielstände gesichert. Bitte erst einen löschen.'); return; }
      const nid = Date.now().toString(36) + 'i';
      try { // 2. ablegen; voller Speicher ist kein Fehler der Datei
        localStorage.setItem(PRE + nid, JSON.stringify(keys));
        putList([{ id: nid, name: String(d.name || file.name.replace(/\.json$/i, '')).slice(0, 40), when: +d.when || +sv.when || Date.now(), ort: String(d.ort || ''), geld: Math.round(+d.geld || +sv.money || 0), teil }, ...l]);
      } catch (e) { console.warn('Spielstand einlesen', e); try { localStorage.removeItem(PRE + nid); } catch (_) {} alert('Der Speicher des Browsers ist voll. Bitte erst einen Spielstand löschen.'); return; }
      msg('SPIELSTAND EINGELESEN', true); render();
    };
    fr.readAsText(file);
  }

  // Seite im Pausenmenü; menu-neu.js führt sie als Hauptpunkt „Spielstand“
  const pane = document.createElement('div'); pane.className = 'pane mn-stand'; pane.dataset.tab = 'stand'; pane.style.display = 'none';
  pane.innerHTML = `<div class="mn-kicker">Neuer Spielstand</div>
    <div class="mn-standneu"><input type="text" id="st_name" maxlength="40" placeholder="Name, z. B. vor der Demo" autocomplete="off"><button type="button" id="st_neu">Sichern</button></div>
    <div class="mn-standakt"><button type="button" id="st_schnell">Schnell speichern</button><button type="button" id="st_schnellladen">Schnellstand laden</button><button type="button" id="st_import">Datei einlesen</button><input type="file" id="st_file" accept=".json,application/json" style="display:none"></div>
    <div class="mn-kicker" id="st_kopf">Gesicherte Spielstände</div><div id="st_liste"></div>
    <p class="mn-standhinweis">Die Spielstände liegen nur in diesem Browser. Für einen anderen Rechner oder als Sicherung: „Datei“.</p>`;
  opts.append(pane);
  const $ = id => /** @type {any} */ (pane.querySelector('#' + id));
  // Tasten im Namensfeld nicht ans Spiel durchreichen (Esc schließt weiter das Menü)
  for (const ev of ['keydown', 'keyup']) $('st_name').addEventListener(ev, e => { if (e.key !== 'Escape') e.stopPropagation(); if (ev === 'keydown' && e.key === 'Enter') $('st_neu').click(); });
  $('st_neu').onclick = () => { if (sichern('', $('st_name').value)) { $('st_name').value = ''; render(); } };
  $('st_schnell').onclick = () => { if (A.started) { A.saveGame(); render(); } else msg('ERST INS SPIEL'); };
  $('st_schnellladen').onclick = () => { const b = document.getElementById('m_load'); if (b) b.click(); };
  $('st_import').onclick = () => $('st_file').click();
  $('st_file').onchange = e => { if (e.target.files[0]) einlesen(e.target.files[0]); e.target.value = ''; };
  $('st_liste').onclick = e => {
    const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('button[data-a]')); if (!b) return;
    const id = b.dataset.id, a = b.dataset.a;
    if (a === 'laden') laden(id); else if (a === 'datei') datei(id); else if (a === 'weg') loeschen(id);
    else if (a === 'neu' && confirm('Diesen Spielstand mit dem aktuellen Stand überschreiben?')) { sichern(id, ''); render(); }
  };
  function render() {
    const l = list();
    $('st_kopf').textContent = 'Gesicherte Spielstände (' + l.length + ' von ' + MAX + ')';
    $('st_liste').innerHTML = l.length ? l.map(s => `<div class="mn-card mn-standzeile"><div><b>${esc(s.name)}</b><span>${esc(when(s.when))}${s.ort ? ' · ' + esc(s.ort) : ''} · ${(+s.geld || 0).toLocaleString('de-DE')} €${s.teil ? ' · nur Position und Inventar' : ''}</span></div>
      <div class="mn-standknoepfe"><button type="button" data-a="laden" data-id="${esc(s.id)}">Laden</button><button type="button" data-a="neu" data-id="${esc(s.id)}">Überschreiben</button><button type="button" data-a="datei" data-id="${esc(s.id)}">Datei</button><button type="button" data-a="weg" data-id="${esc(s.id)}">Löschen</button></div></div>`).join('')
      : '<p class="mn-standleer">Noch kein Spielstand gesichert. Namen eintragen und „Sichern“ wählen.</p>';
  }
  A.menuHooks.push(() => { try { render(); } catch (e) { console.warn('Spielstände', e); } });
  render();
  return { list, sichern, laden, render };
}

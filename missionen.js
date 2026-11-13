// Gemeinsame Missionsliste für Handy-App (phone.js) und Pausenmenü (menu-neu.js), André 13.11.2026.
// Liefert Zeilen { k, name, info, btn, fn }; fn startet die Mission und ruft close() für das jeweilige Fenster.
/** @param {import('./types').Ctx} X @param {any} S @param {() => void} close @param {(t: string, kind?: string) => void} toast @param {{ stories?: boolean }} [o] */
export function missionList(X, S, close, toast, o = {}) {
  const { player } = X;
  const rows = [], row = (k, name, info, btn, fn) => rows.push({ k, name, info, btn, fn });
  const objEl = document.getElementById('obj'), obj = (objEl && objEl.textContent.trim()) || '';
  const L = S.LAUF, E = S.EULEN, V = S.VOKA, ST = S.STORY;
  const foot = fn => () => { if (player.car) { toast('Nur zu Fuß', 'error'); return; } fn(); };
  // Nur eine Strecke zugleich (Laufrunde, Eulen-Lauf, Nebenjob teilen sich den Wegweiser): sagen, was noch läuft
  const frei = fn => () => { const c = X.WEG && X.WEG.cur; if (c) { toast(`Läuft noch: ${c.label} – erst beenden`, 'error'); return; } fn(); };
  if (L && L.run) row('Läuft', 'Laufrunde', `Wegpunkt ${L.run.i + 1} von ${L.run.pts.length}`, L.stop ? 'Abbrechen' : '', () => { L.stop(); toast('Abgebrochen'); });
  if (E && E.run) row('Läuft', 'Frischlufteulen', obj || 'Strecke läuft', 'Abbrechen', () => { E.stop(); toast('Abgebrochen'); });
  if (V && V.mission) row('Läuft', 'Vokabaum', obj || 'Mission läuft', '', null);
  if (ST && ST.busy) row('Läuft', 'Story', obj || 'Kapitel läuft', 'Pausieren', () => { ST.stop(); ST.S.declined = true; ST.persist(); close(); }); // wie der Menüknopf in story.js
  if (L && !L.run) row('Fitness', 'Laufrunde', '1–3 km zu Fuß mit einem Passanten, bringt Fitness und EP.', 'Laufrunde starten', foot(frei(() => { if (L.force()) close(); else toast('Gerade keine Runde möglich', 'error'); })));
  const NJ = S.NEBENJOBS; // Zivile Nebenjobs (#148, nebenjobs.js)
  if (NJ && NJ.job) row('Läuft', NJ.job.J.name, `${NJ.job.done}/${NJ.job.J.n} erledigt`, 'Feierabend', () => { NJ.stop(); close(); });
  else if (NJ) for (const [id, J] of Object.entries(NJ.JOBS)) row('Nebenjob', J.name, `${J.info} ${J.geld} € je Auftrag.`, 'Schicht starten', frei(() => { if (NJ.start(id)) close(); else toast('Gerade nicht möglich', 'error'); }));
  const sv = resumable();
  if (E && !E.run) for (const r of (E.routes || []).slice(0, 12)) { const big = r.marathon || r.mega, goes = big && sv && sv.name === r.name; row(big ? (r.mega ? 'Megamarsch' : 'Marathon') : 'Frischlufteulen', r.name, (goes ? `Fortsetzen ab Wegpunkt ${sv.i + 1} · ` : '') + (r.info || (r.km_gebiet + ' km')), goes ? 'Fortsetzen' : 'Lauf starten', foot(frei(() => { if (E.start(r, !!goes, 'lauf')) close(); }))); }
  if (V && !V.mission && V.request) { const ok = V.ready; row('Hilfe', 'Vokabaum', ok ? 'Ein Passant braucht Hilfe mit Vokabeln.' : 'Gerade fragt niemand – höchstens einmal je Stunde, zu Fuß und ohne Fahndung.', ok ? 'Mission starten' : '', ok ? () => { if (V.request()) close(); else toast('Gerade fragt niemand – später wieder', 'error'); } : null); }
  if (o.stories !== false && ST && ST.STORIES) for (const [id, s] of Object.entries(ST.STORIES)) { const st = /** @type {any} */ (s); row('Story', st.title, st.sub || '', ST.busy ? '' : 'Story starten', () => { ST.start('phone', id); close(); }); }
  return rows;
}

/** Unterbrochener Marathon/Megamarsch zu Fuß (eulen.js, Schlüssel eulenMarathon) */
export function resumable() { try { return JSON.parse(localStorage.getItem('eulenMarathon') || 'null'); } catch (e) { return null; } }

/** Bestzeiten der Frischlufteulen (eulen.js, Schlüssel eulenBest): [{ key, mode, name, ms, am }] je Strecke die beste */
export function bestTimes() {
  let all = {}; try { all = JSON.parse(localStorage.getItem('eulenBest') || '{}') || {}; } catch (e) { /* leer */ }
  return Object.entries(all).filter(([, a]) => Array.isArray(a) && a.length).map(([key, a]) => { const [mode, ...n] = key.split('|'); return { key, mode, name: n.join('|'), ms: +a[0].ms || 0, am: a[0].am || '' }; }).sort((p, q) => p.ms - q.ms);
}

export const fmtMs = ms => { const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0'); };

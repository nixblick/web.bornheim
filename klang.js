// Klang (André 14.11.2026: „kannst du die Sounds verbessern“, zweite Stufe am selben Tag). Die Töne des Spiels entstehen
// im Code (Web Audio, keine Tondateien). Dieses Modul sitzt auf dem alten Ton-Code in game.js:
// - Einzelgeräusche: Rezepte aus Schichten (Anschlag, Körper, Tiefe, Ausklang). Jedes Rezept wird nach dem Start einmal
//   stumm vorgerechnet (OfflineAudioContext, 32 kHz mono, drei Fassungen, Schritte vier, je Takt höchstens eine), mit etwas
//   eingebackenem Raum (gefaltet mit einer erzeugten Raumantwort). Gespielt wird dann ein Puffer: zufällige Fassung, nie
//   zweimal dieselbe hintereinander, Tonhöhe ±4 %, Pegel ±10 %. Bis ein Geräusch fertig ist, klingt das Rezept live.
// - Ort: sfx(kind, vol, pos) mit pos = {x, z} oder Vector3. Die Entfernung dämpft Pegel und Höhen, die Seite kommt über
//   das Stereo-Panorama, Schüsse, Explosionen und Donner mit Schallverzug. Höchstens 24 Einzelgeräusche gleichzeitig.
// - Mischung: Gruppen (Kampf, Fahrzeuge, Umgebung, Bedienung) → SND.master (Lautstärkeregler) → Begrenzer → weiche Decke.
// - Motor: eigene Motorstimme (Obertonwelle, Sättigung, Formanten, Ansaugrauschen). Der alte Motor läuft stumm weiter und
//   liefert Drehzahl und Last. Reifen: Quietschen beim Rutschen, Zischen auf nasser Straße.
// - Kulisse: Stadt (Tag, Nacht), Wind und Regen als vorgerechnete Schleifen, überblendet nach Tageszeit, Wetter und
//   drinnen/draußen. Vögel und Grillen als einzelne Ereignisse, mal näher, mal ferner.
// - ladeAufnahmen(manifest) lädt echte Aufnahmen (CC0, assets/sfx) je Geräusch; sie gehen der Synthese vor. game.js ruft es nach dem Start.
// KLANG.aus = true schaltet zurück auf die alten Töne. Hören kann die Entwicklung den Ton nicht (kein Ton über Andrés
// Lautsprecher): messen() rechnet jedes Geräusch stumm und liefert Spitze, Mittelwert und Länge, dazu die Zahlen der
// vorgerechneten Fassungen; die Probe `klang` prüft sie.

const RAUSCH = new Map(); // je Abtastrate ein Rauschpuffer (ein Puffer gehört keinem bestimmten Kontext)
function rauschen(C) {
  let b = RAUSCH.get(C.sampleRate); if (b) return b;
  b = C.createBuffer(1, Math.floor(C.sampleRate * 2), C.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  RAUSCH.set(C.sampleRate, b); return b;
}
const zufall = (a, b) => a + Math.random() * (b - a);

/** Bausteine für ein Geräusch: N = gefiltertes Rauschen, T = Ton. Zeiten in Sekunden ab t0, alles auf `out`. */
function bau(C, out, t0, vol) {
  const p = zufall(0.94, 1.06); // Tonhöhe je Auslösung leicht anders
  const huelle = (g, dur, o) => { const v = Math.max(0.0001, (o.g ?? 0.5) * vol), a = t0 + (o.d || 0), att = o.att ?? 0.003;
    g.gain.setValueAtTime(0.0001, a); g.gain.linearRampToValueAtTime(v, a + att);
    if (o.sus) { g.gain.setValueAtTime(v, a + Math.max(att, dur - 0.05)); g.gain.linearRampToValueAtTime(0.0001, a + dur); } else g.gain.exponentialRampToValueAtTime(0.0008, a + dur);
    return a; };
  const N = (dur, o) => { const src = C.createBufferSource(); src.buffer = rauschen(C); src.loop = true; const f = C.createBiquadFilter(); f.type = o.type || 'lowpass'; f.Q.value = o.q ?? 0.8;
    const g = C.createGain(), a = huelle(g, dur, o), f0 = Math.max(20, o.f0 * p), f1 = Math.max(20, (o.f1 ?? o.f0) * p);
    f.frequency.setValueAtTime(f0, a); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, a + dur);
    if (o.wob) { const l = C.createOscillator(); l.frequency.value = zufall(5, 11); const lg = C.createGain(); lg.gain.value = o.wob; l.connect(lg); lg.connect(f.detune); l.start(a); l.stop(a + dur + 0.05); } // Mittenfrequenz flattert (Cent)
    src.connect(f); f.connect(g); g.connect(out); src.start(a, Math.random() * 1.5); src.stop(a + dur + 0.05); };
  const T = (dur, o) => { const os = C.createOscillator(); os.type = o.wave || 'sine'; const g = C.createGain(), a = huelle(g, dur, o), f0 = Math.max(20, o.f0 * p), f1 = Math.max(20, (o.f1 ?? o.f0) * p);
    os.frequency.setValueAtTime(f0, a); if (f1 !== f0) os.frequency.exponentialRampToValueAtTime(f1, a + dur);
    if (o.lp) { const f = C.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; os.connect(f); f.connect(g); } else os.connect(g);
    g.connect(out); os.start(a); os.stop(a + dur + 0.05); };
  return { N, T };
}

// Rezepte: Anschlag (kurz, hell), Körper, Tiefe, Ausklang. Pegel so gewählt, dass die Summe vor dem Begrenzer unter 1 bleibt.
const schuss = (s, hell, tief, lang, laut) => { s.N(0.012, { type: 'highpass', f0: 3500 * hell, g: 0.7 * laut }); s.N(0.13, { type: 'bandpass', f0: 1900 * hell, f1: 480, q: 0.9, g: 0.6 * laut });
  s.T(0.15 * tief, { f0: 175 / tief, f1: 46, g: 0.6 * laut }); s.N(lang, { f0: 1500, f1: 200, g: 0.2 * laut, att: 0.02 }); };
const R = {
  shot: s => schuss(s, 1, 1, 0.5, 1),
  smg: s => schuss(s, 1.25, 0.8, 0.28, 0.8),
  rifle: s => { schuss(s, 1.5, 1.1, 0.75, 1); s.N(0.02, { type: 'highpass', f0: 6000, g: 0.35 }); },
  shotgun: s => { schuss(s, 0.75, 1.5, 0.8, 1.1); s.N(0.3, { f0: 900, f1: 110, g: 0.45 }); },
  explosion: s => { s.T(1.3, { f0: 95, f1: 26, g: 0.85 }); s.N(0.04, { type: 'highpass', f0: 2500, g: 0.7 }); s.N(2.2, { f0: 900, f1: 70, g: 0.7, att: 0.01 });
    for (let i = 0; i < 7; i++) s.N(0.05, { type: 'bandpass', f0: zufall(2000, 6000), q: 3, g: 0.14, d: zufall(0.15, 1.2) }); }, // nachrieselnde Trümmer
  bang: s => { s.N(0.03, { type: 'highpass', f0: 5000, g: 0.85 }); s.N(0.5, { f0: 2000, f1: 150, g: 0.55 }); s.T(0.2, { f0: 110, f1: 40, g: 0.55 }); },
  crash: s => { for (const r of [1, 2.76, 5.4, 8.93]) s.T(0.38 / Math.sqrt(r), { wave: 'triangle', f0: 180 * r, g: 0.22 / Math.pow(r, 0.3) }); // Blech: unharmonische Teiltöne
    s.N(0.4, { f0: 2200, f1: 150, g: 0.65 }); s.N(0.08, { type: 'highpass', f0: 3000, g: 0.4 }); s.T(0.3, { f0: 85, f1: 32, g: 0.5 }); },
  bump: s => { s.N(0.14, { f0: 700, f1: 110, g: 0.42 }); s.T(0.12, { f0: 120, f1: 55, g: 0.38 }); },
  hit: s => { s.N(0.1, { type: 'bandpass', f0: 1600, f1: 400, g: 0.45 }); s.T(0.13, { f0: 260, f1: 90, g: 0.32 }); },
  punch: s => { s.N(0.08, { f0: 900, f1: 140, g: 0.55 }); s.T(0.11, { f0: 150, f1: 60, g: 0.5 }); s.N(0.02, { type: 'highpass', f0: 2000, g: 0.2 }); },
  step: s => { s.N(0.06, { f0: 600, f1: 160, g: 0.2 }); s.N(0.015, { type: 'bandpass', f0: 2200, q: 2, g: 0.07 }); }, // Straße, Gehweg
  step_innen: s => { s.N(0.045, { f0: 1400, f1: 300, g: 0.18 }); s.N(0.012, { type: 'bandpass', f0: 3200, q: 2.5, g: 0.1 }); }, // harter Boden drinnen: kürzer, heller
  step_nass: s => { s.N(0.07, { f0: 700, f1: 180, g: 0.2 }); s.N(0.09, { type: 'highpass', f0: 2500, f1: 1500, g: 0.1, d: 0.01 }); }, // nasse Straße: Platschen
  door: s => { s.N(0.1, { f0: 500, f1: 140, g: 0.38 }); s.T(0.09, { f0: 150, f1: 70, g: 0.32 }); s.N(0.02, { type: 'bandpass', f0: 1800, q: 3, g: 0.14, d: 0.07 }); },
  glass: s => { s.N(0.22, { type: 'highpass', f0: 5000, f1: 2500, g: 0.5 }); for (let i = 0; i < 9; i++) s.T(zufall(0.05, 0.22), { f0: zufall(3000, 9000), g: 0.08, d: zufall(0, 0.12) }); }, // Scherben
  // Reifen: weißes Rauschen durch zwei schmale Bänder (Grundton und Oktave), Mitte flattert um ±90 Cent
  screech: s => { const f = zufall(1100, 1500); s.N(0.45, { type: 'bandpass', f0: f, f1: f * 0.9, q: 10, g: 0.9, att: 0.03, wob: 90 }); s.N(0.45, { type: 'bandpass', f0: f * 2, f1: f * 1.8, q: 11, g: 0.5, att: 0.03, wob: 90 }); },
  thunder: s => { s.N(0.06, { type: 'highpass', f0: 3000, g: 0.4 }); s.N(3.5, { f0: 380, f1: 40, g: 0.8, att: 0.03 }); s.T(2.2, { f0: 60, f1: 24, g: 0.55, att: 0.05 });
    for (let i = 0; i < 4; i++) s.N(0.9, { f0: 200, f1: 50, g: 0.3, d: 0.5 + i * 0.6 + zufall(0, 0.3), att: 0.1 }); }, // Nachrollen
  horn: s => { s.T(0.5, { wave: 'sawtooth', f0: 415, g: 0.2, lp: 1700, att: 0.015, sus: true }); s.T(0.5, { wave: 'sawtooth', f0: 522, g: 0.17, lp: 1700, att: 0.015, sus: true }); },
  bell: s => { for (const d of [0, 0.13]) { s.T(0.9, { f0: 2350, g: 0.2, d }); s.T(0.7, { f0: 3540, g: 0.09, d }); s.T(0.5, { f0: 5200, g: 0.045, d }); } },
  pickup: s => { s.T(0.09, { f0: 880, f1: 1320, g: 0.24 }); s.T(0.16, { f0: 1320, f1: 1760, g: 0.24, d: 0.09 }); s.T(0.25, { f0: 2640, g: 0.05, d: 0.09 }); },
  click: s => { s.T(0.03, { wave: 'square', f0: 1100, f1: 800, g: 0.09, lp: 3000 }); s.N(0.01, { type: 'highpass', f0: 4000, g: 0.07 }); },
  reload: s => { for (const [d, a, b] of [[0, 900, 600], [0.13, 700, 1200]]) { s.N(0.035, { type: 'bandpass', f0: 2200, q: 2, g: 0.3, d }); s.T(0.045, { wave: 'square', f0: a, f1: b, g: 0.11, lp: 2500, d }); } },
  notify: s => { s.T(0.08, { f0: 1320, g: 0.1 }); s.T(0.12, { f0: 1760, g: 0.09, d: 0.08 }); },
  swing: s => s.N(0.18, { type: 'bandpass', f0: 600, f1: 2400, q: 1.5, g: 0.32, att: 0.03 }),
  throw: s => s.N(0.15, { type: 'bandpass', f0: 400, f1: 1500, q: 1.5, g: 0.24, att: 0.03 }),
  whoosh: s => s.N(0.8, { type: 'bandpass', f0: 800, f1: 4000, q: 1.2, g: 0.32, att: 0.15 }),
  hiss: s => s.N(0.7, { type: 'highpass', f0: 3000, f1: 2500, g: 0.24, att: 0.05 }),
  taser: s => { s.T(0.5, { wave: 'square', f0: 2400, f1: 2200, g: 0.1, lp: 4000, sus: true }); for (let i = 0; i < 12; i++) s.N(0.012, { type: 'highpass', f0: 3000, g: 0.28, d: i * 0.04 }); },
  splat: s => { s.N(0.13, { f0: 700, f1: 150, g: 0.5 }); s.N(0.03, { type: 'bandpass', f0: 1200, q: 2, g: 0.18 }); },
  cough: s => { s.N(0.11, { type: 'bandpass', f0: 900, f1: 300, q: 2, g: 0.38 }); s.N(0.1, { type: 'bandpass', f0: 800, f1: 300, q: 2, g: 0.28, d: 0.18 }); },
  crackle: s => { for (let i = 0; i < 7; i++) s.N(0.03, { type: 'highpass', f0: zufall(4000, 7000), g: 0.4, d: i * 0.06 + zufall(0, 0.04) }); },
  schoolbell: s => { for (let i = 0; i < 14; i++) { s.T(0.09, { wave: 'square', f0: 2100, g: 0.1, lp: 5000, d: i * 0.095 }); s.T(0.09, { f0: 4200, g: 0.04, d: i * 0.095 }); } },
};

// Pegelabgleich nach der stummen Messung (Probe klang, 14.11.2026): Schüsse und Knall lagen vor dem Begrenzer über 1,
// Schritte, Würfe, Husten und Reifenquietschen kaum hörbar unter 0,1. Faktor je Geräusch, 1 = unverändert.
// Zweiter Abgleich (Probe klang, PR 233): Gewehr und Blech streuten live bis 1,38, Schritte vorgerechnet bis 0,08.
const PEGEL = { shot: 0.75, bang: 0.78, smg: 0.85, explosion: 0.75, rifle: 0.8, shotgun: 0.85, crash: 0.85, step: 4, step_innen: 2.6, step_nass: 2.4, throw: 3, cough: 3, swing: 2.6, screech: 3, whoosh: 2.2, splat: 2.4, reload: 2, notify: 1.6, click: 1.3 };

// ---------- Vorrechnen ----------
const SR = 32000, FASSUNGEN = 3, MAXV = 24;
const anzahl = k => k.startsWith('step') ? 4 : FASSUNGEN;
/** Länge des trockenen Rezepts in Sekunden (danach kommt der Raum), Rest 0,4 s */
const LEN = { explosion: 2.4, thunder: 3.8, schoolbell: 1.4, bell: 1.1, shotgun: 0.85, rifle: 0.8, shot: 0.55, smg: 0.33, horn: 0.55, whoosh: 0.85, hiss: 0.75, taser: 0.55, screech: 0.5, glass: 0.36, crash: 0.45, bang: 0.52, crackle: 0.5, cough: 0.32 };
/** eingebackener Raum: [Anteil gefaltet, Länge der Raumantwort in s]; Bedienungstöne ohne Raum */
const UI = new Set(['click', 'pickup', 'notify', 'reload']);
const HALL = { shot: [0.22, 0.75], smg: [0.2, 0.6], rifle: [0.24, 0.85], shotgun: [0.24, 0.85], explosion: [0.25, 0.9], thunder: [0.22, 0.9], bang: [0.22, 0.75], crash: [0.16, 0.5], glass: [0.15, 0.45] };
const hallVon = k => UI.has(k) ? [0, 0] : HALL[k] || [0.12, 0.35];
/** Mischgruppe je Geräusch, Rest = combat */
const GRUPPE = { click: 'ui', pickup: 'ui', notify: 'ui', reload: 'ui', crash: 'vehicles', bump: 'vehicles', screech: 'vehicles', horn: 'vehicles', door: 'vehicles', bell: 'vehicles',
  thunder: 'ambience', crackle: 'ambience', whoosh: 'ambience', hiss: 'ambience', schoolbell: 'ambience', step: 'ambience', step_innen: 'ambience', step_nass: 'ambience' };
/** Ortsverhalten: Abfall (roll), Hörweite in m (max), Tiefpass ganz fern (lp), Schallverzug (schall) */
const WAFFE = { roll: 1.0, max: 560, lp: 900, schall: true }, KNALL = { roll: 1.0, max: 900, lp: 500, schall: true }, KLEIN = { roll: 1.3, max: 60, lp: 1500, schall: false };
const ORT = { shot: WAFFE, smg: WAFFE, rifle: WAFFE, shotgun: WAFFE, explosion: KNALL, bang: KNALL, thunder: KNALL, crash: { roll: 1.0, max: 250, lp: 900, schall: false },
  bell: { roll: 1.3, max: 140, lp: 1500, schall: false }, horn: { roll: 1.3, max: 140, lp: 1500, schall: false }, whoosh: { roll: 1.3, max: 100, lp: 1500, schall: false }, glass: { roll: 1.3, max: 120, lp: 1500, schall: false } };

/** @type {Record<string, any>} */ const VAR = {};   // Geräusch → vorgerechnete Fassungen (AudioBuffer)
/** @type {Record<string, any>} */ const AUFN = {};  // Geräusch → geladene Aufnahmen (ladeAufnahmen), gehen vor
/** @type {Record<string, any>} */ const BETT = {};  // Kulissen-Schleifen: tag, nacht, wind, regen
const offline = () => { const W = /** @type {any} */ (window); return W.OfflineAudioContext || W.webkitOfflineAudioContext || null; };
const pause = () => new Promise(r => setTimeout(r, 30));

const IMPULS = new Map();
/** Raumantwort: Rauschen mit exponentiellem Abklingen, der Tiefpass fällt mit der Zeit (später Hall ist dumpfer). */
function impuls(O, sek) {
  const key = Math.round(sek * 100); let b = IMPULS.get(key); if (b) return b;
  const n = Math.max(64, Math.floor(SR * sek)); b = O.createBuffer(1, n, SR); const d = b.getChannelData(0); let y = 0;
  for (let i = 0; i < n; i++) { const t = i / n, k = 0.04 + 0.86 * Math.pow(0.06, t); y += k * ((Math.random() * 2 - 1) - y); d[i] = y * Math.exp(-6.9 * t) * (i < 96 ? i / 96 : 1); }
  IMPULS.set(key, b); return b;
}
/** Stille am Ende abschneiden, letzte 10 ms ausblenden, Spitze höchstens 1 (der Begrenzer bekommt keine Übersteuerung). */
function kuerzen(O, b) {
  const d = b.getChannelData(0); let last = d.length - 1, peak = 0; while (last > 0 && Math.abs(d[last]) < 0.0005) last--;
  const n = Math.max(1, Math.min(d.length, last + 64)), f = Math.min(n, Math.floor(SR * 0.01)), o = O.createBuffer(1, n, SR), e = o.getChannelData(0);
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
  const k = peak > 1 ? 1 / peak : 1; for (let i = 0; i < n; i++) e[i] = d[i] * k;
  for (let i = 0; i < f; i++) e[n - 1 - i] *= i / f;
  return o;
}
/** Eine Fassung eines Geräuschs stumm rechnen: trocken plus 10-25 % gefaltet mit der Raumantwort. */
async function rendern(kind) {
  const OC = offline(), [nass, hl] = hallVon(kind), n = Math.ceil(SR * ((LEN[kind] || 0.4) + 0.08 + hl));
  const O = new OC(1, n, SR), ein = O.createGain(), tr = O.createGain(); tr.gain.value = 1 - nass * 0.5; ein.connect(tr); tr.connect(O.destination);
  if (nass > 0) { const cv = O.createConvolver(); cv.buffer = impuls(O, hl); const ng = O.createGain(); ng.gain.value = nass; ein.connect(cv); cv.connect(ng); ng.connect(O.destination); }
  const v = PEGEL[kind] || 1; R[kind](bau(O, ein, 0.004, v), v);
  return kuerzen(O, await O.startRendering());
}

// ---------- Kulissen-Schleifen ----------
const BL = 10, BX = 0.6; // Schleifenlänge, Überblendung an der Nahtstelle (s)
const sinus = (t, per, ph = 0) => Math.sin(2 * Math.PI * t / per + ph);
function kurve(dauer, fn, n = 512) { const c = new Float32Array(n); for (let i = 0; i < n; i++) c[i] = fn(dauer * i / (n - 1)); return c; }
/** Nahtstelle: der Überhang hinter BL wird mit gleicher Leistung über den Anfang geblendet, Pegel auf RMS 0,2. */
function schleife(O, d) {
  const nL = Math.round(BL * SR), nX = Math.round(BX * SR), b = O.createBuffer(1, nL, SR), o = b.getChannelData(0); let s2 = 0;
  for (let i = 0; i < nL; i++) o[i] = d[i];
  for (let i = 0; i < nX; i++) { const a = (i / nX) * Math.PI / 2; o[i] = d[i] * Math.sin(a) + d[nL + i] * Math.cos(a); }
  for (let i = 0; i < nL; i++) s2 += o[i] * o[i];
  const k = 0.2 / Math.max(1e-6, Math.sqrt(s2 / nL)); for (let i = 0; i < nL; i++) o[i] = Math.max(-1, Math.min(1, o[i] * k));
  return b;
}
/** Rauschen durch Filter, deren Mitte und Pegel Summen von Sinus mit unteilbaren Perioden folgen. */
const BETTEN = {
  tag: s => { s('lowpass', 0.6, t => 150 + 60 * sinus(t, 7.3) + 35 * sinus(t, 3.1, 1), t => 0.6 + 0.15 * sinus(t, 5.3)); // Verkehr fern
    s('bandpass', 0.9, t => 520 + 260 * sinus(t, 5.7, 2) + 140 * sinus(t, 2.3), t => 0.05 + 0.05 * Math.max(0, sinus(t, 4.9)) + 0.03 * Math.max(0, sinus(t, 3.7, 1))); // vorbeifahrende Autos
    s('highpass', 0.5, () => 3200, t => 0.008 + 0.004 * sinus(t, 6.1)); },
  nacht: s => { s('lowpass', 0.6, t => 110 + 40 * sinus(t, 8.9) + 20 * sinus(t, 3.3, 1), t => 0.5 + 0.1 * sinus(t, 6.7));
    s('bandpass', 0.8, t => 420 + 200 * sinus(t, 9.1, 1), t => 0.012 + 0.02 * Math.max(0, sinus(t, 7.9))); },
  wind: s => { s('bandpass', 0.7, t => 360 + 200 * sinus(t, 6.1) + 110 * sinus(t, 2.7, 2) + 50 * sinus(t, 1.3), t => 0.5 + 0.32 * sinus(t, 4.3) + 0.15 * sinus(t, 1.9, 1)); // Böen
    s('bandpass', 4, t => 1100 + 320 * sinus(t, 3.7) + 90 * sinus(t, 1.1), t => 0.05 + 0.04 * sinus(t, 5.9)); }, // Pfeifen an Kanten
};
async function bettOffline(art) {
  const OC = offline(), dur = BL + BX, n = Math.ceil(dur * SR), O = new OC(1, n, SR);
  const nb = O.createBuffer(1, n, SR), nd = nb.getChannelData(0); for (let i = 0; i < n; i++) nd[i] = Math.random() * 2 - 1;
  const schicht = (type, q, fK, gK) => { const s = O.createBufferSource(); s.buffer = nb; s.loop = true; const f = O.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueCurveAtTime(kurve(dur, fK), 0, dur); const g = O.createGain(); g.gain.setValueCurveAtTime(kurve(dur, gK), 0, dur);
    s.connect(f); f.connect(g); g.connect(O.destination); s.start(0, Math.random() * dur); };
  BETTEN[art](schicht);
  return schleife(O, (await O.startRendering()).getChannelData(0));
}
/** Regen: leises Grundrauschen plus viele winzige Tropfen (gedämpfte Schwingung mit Rauschen, Tonhöhe und Abklingen zufällig). */
async function regenBett() {
  const OC = offline(), n = Math.ceil((BL + BX) * SR), O = new OC(1, 1, SR), b = O.createBuffer(1, n, SR), d = b.getChannelData(0); let y = 0;
  for (let i = 0; i < n; i++) { const x = Math.random() * 2 - 1; y += 0.35 * (x - y); d[i] = (x - y) * 0.12; }
  const tropfen = Math.round((BL + BX) * 420);
  for (let k = 0; k < tropfen; k++) {
    if (k % 700 === 699) await pause(); // in Häppchen, damit kein Bild hängt
    const i0 = Math.floor(Math.random() * n), f = 1400 * Math.pow(5, Math.random()), tau = zufall(0.0015, 0.01) * SR, a = 0.25 * Math.pow(Math.random(), 2) + 0.02, len = Math.min(n - i0, Math.ceil(tau * 5));
    const w0 = 2 * Math.PI * f / SR, cw = Math.cos(w0), sw = Math.sin(w0), dk = Math.exp(-1 / tau); let c = 1, s = 0, e = a;
    for (let i = 0; i < len; i++) { d[i0 + i] += e * (0.7 * s + 0.3 * (Math.random() * 2 - 1)); const c2 = c * cw - s * sw; s = s * cw + c * sw; c = c2; e *= dk; }
  }
  return schleife(O, d);
}

/** Weiche Decke hinter dem Begrenzer: bis 0,6 linear, darüber tanh bis 0,97. Eingang ist um Faktor 4 vorgeteilt. */
function deckenKurve() { const n = 2049, c = new Float32Array(n); for (let i = 0; i < n; i++) { const s = (i / 1024 - 1) * 4, a = Math.abs(s); c[i] = Math.sign(s) * (a < 0.6 ? a : 0.6 + 0.37 * Math.tanh((a - 0.6) / 0.37)); } return c; }
function tanhKurve() { const n = 1025, c = new Float32Array(n); for (let i = 0; i < n; i++) c[i] = Math.tanh(3 * (i / 512 - 1)) / Math.tanh(3); return c; }
function normalisieren(b, ziel) {
  let p = 0; for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) p = Math.max(p, Math.abs(d[i])); }
  if (p > 1e-6) { const k = ziel / p; for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= k; } }
  return b;
}
/** Zahlen der vorgerechneten Fassungen: Anzahl, Spitzen, RMS, Unterschied zwischen Fassung 1 und 2. */
function vermessen(bs) {
  let pMin = 9, pMax = 0, rs = 0; const ds = bs.map(b => b.getChannelData(0));
  for (const d of ds) { let p = 0, s = 0; for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > p) p = a; s += d[i] * d[i]; } pMin = Math.min(pMin, p); pMax = Math.max(pMax, p); rs += Math.sqrt(s / Math.max(1, d.length)); }
  let diff = 0; if (ds.length > 1) { const a = ds[0], b = ds[1], n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) diff += Math.abs(a[i] - b[i]); diff /= Math.max(1, n); }
  return { n: bs.length, peakMin: +pMin.toFixed(3), peakMax: +pMax.toFixed(3), rms: +(rs / bs.length).toFixed(4), diff: +diff.toFixed(5), ms: Math.round(bs[0].duration * 1000) };
}

/** @param {import('./types').Ctx} X */
export function initKlang(X) {
  const A = /** @type {any} */ (X);
  const innen = () => { const IN = A.INTERIORS || (/** @type {any} */ (window).G || {}).INTERIORS; return !!(IN && IN.inside); };
  // Schritte: drinnen harter Boden, bei Regen nass, sonst Straße (nur Zustände, keine Bodenabfrage je Schritt)
  const schrittArt = () => innen() ? 'step_innen' : A.weather && A.weather.rain > 0.3 ? 'step_nass' : 'step';

  // Warteschlange fürs Vorrechnen: zuerst die Kulisse, dann je Durchgang eine Fassung jedes Geräuschs; je 80-ms-Takt höchstens eine Aufgabe
  const V = { q: [], i: 0, busy: false, t0: performance.now() };
  V.q.push(() => bettOffline('tag').then(b => { BETT.tag = b; }), () => regenBett().then(b => { BETT.regen = b; }), () => bettOffline('wind').then(b => { BETT.wind = b; }), () => bettOffline('nacht').then(b => { BETT.nacht = b; }));
  for (let v = 0; v < 4; v++) for (const k of Object.keys(R)) if (v < anzahl(k)) V.q.push(() => rendern(k).then(b => { (VAR[k] = VAR[k] || []).push(b); }));
  function vorabSchritt() {
    if (V.busy || V.i >= V.q.length) return;
    if (!(A.SND && A.SND.ctx) && performance.now() - V.t0 < 20000) return; // erst wenn das Spiel seinen Ton hat (spätestens nach 20 s)
    if (!offline()) { V.i = V.q.length; return; }
    const job = V.q[V.i++]; V.busy = true;
    job().catch(e => console.warn('klang vorab', e)).finally(() => { V.busy = false; });
  }

  let w = null; // Verdrahtung, sobald das Spiel seinen AudioContext hat (erste Eingabe des Spielers)
  function verdrahten() {
    const S = A.SND; if (w || !S || !S.ctx || !S.master) return !!w;
    const C = S.ctx;
    // Ausgang: SND.master (Lautstärkeregler) → Begrenzer → weiche Decke → Lautsprecher. Kein Live-Hall mehr (der Raum steckt in den Puffern).
    const comp = C.createDynamicsCompressor(); comp.threshold.value = -9; comp.knee.value = 9; comp.ratio.value = 14; comp.attack.value = 0.003; comp.release.value = 0.22;
    const vor = C.createGain(); vor.gain.value = 0.25; const decke = C.createWaveShaper(); decke.curve = deckenKurve();
    try { S.master.disconnect(); } catch (e) { /* war noch nicht verbunden */ }
    S.master.connect(comp); comp.connect(vor); vor.connect(decke); decke.connect(C.destination);
    const gruppen = /** @type {any} */ ({}); for (const k of ['combat', 'vehicles', 'ambience', 'ui']) { const g = C.createGain(); g.connect(S.master); gruppen[k] = g; }
    const senke = C.createGain(); senke.gain.value = 0; senke.connect(C.destination); // alte Stimmen laufen hier stumm weiter (Drehzahl und Pegel bleiben ablesbar)
    const quelle = () => { const s = C.createBufferSource(); s.buffer = rauschen(C); s.loop = true; s.start(0, Math.random() * 1.5); return s; };
    const kette = (src, type, freq, q, nach) => { const f = C.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = C.createGain(); g.gain.value = 0; src.connect(f); f.connect(g); g.connect(nach); return { f, g }; };
    // Motor: Obertonwelle (10 Teiltöne) → Sättigung (Antrieb steigt mit Last) → drei Formanten → Tiefpass; dazu Ansaugrauschen. Einmal gebaut.
    const motor = (() => {
      const amp = [0, 1, 0.8, 0.55, 0.45, 0.32, 0.25, 0.18, 0.13, 0.09, 0.06], re = new Float32Array(amp.length), im = new Float32Array(amp.length);
      for (let k = 1; k < amp.length; k++) { im[k] = amp[k]; re[k] = k % 3 === 0 ? amp[k] * 0.4 : 0; }
      const os = C.createOscillator(); os.setPeriodicWave(C.createPeriodicWave(re, im)); os.frequency.value = 28;
      const drive = C.createGain(); drive.gain.value = 0.3; const sh = C.createWaveShaper(); sh.curve = tanhKurve();
      const pk = [[150, 6, 1.2], [400, 4, 1.5], [1000, 3, 2]].map(([f, db, q]) => { const b = C.createBiquadFilter(); b.type = 'peaking'; b.frequency.value = f; b.gain.value = db; b.Q.value = q; return b; });
      const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 0.7; const g = C.createGain(); g.gain.value = 0;
      os.connect(drive); drive.connect(sh); sh.connect(pk[0]); pk[0].connect(pk[1]); pk[1].connect(pk[2]); pk[2].connect(lp); lp.connect(g); g.connect(gruppen.vehicles);
      const nb = C.createBiquadFilter(); nb.type = 'bandpass'; nb.frequency.value = 700; nb.Q.value = 1.2; const ng = C.createGain(); ng.gain.value = 0; quelle().connect(nb); nb.connect(ng); ng.connect(lp);
      os.start(); return { os, drive, lp, g, nb, ng };
    })();
    // Reifen rutschen: Rauschen durch zwei schmale Bänder (Q 10/11), ein langsamer Schwinger lässt beide um ±90 Cent flattern
    const rutsch = (() => {
      const src = quelle(), g = C.createGain(); g.gain.value = 0; const lfo = C.createOscillator(); lfo.frequency.value = 7; const lg = C.createGain(); lg.gain.value = 90; lfo.connect(lg);
      const b = [[1300, 10], [2600, 11]].map(([f, q]) => { const x = C.createBiquadFilter(); x.type = 'bandpass'; x.frequency.value = f; x.Q.value = q; src.connect(x); x.connect(g); lg.connect(x.detune); return x; });
      g.connect(gruppen.vehicles); lfo.start(); return { g, b };
    })();
    const reifen = kette(quelle(), 'lowpass', 520, 0.6, gruppen.vehicles), wind = kette(quelle(), 'bandpass', 900, 0.5, gruppen.vehicles), nass = kette(quelle(), 'highpass', 2600, 0.7, gruppen.vehicles);
    // Sirene: Sägezahn durch ein Band klingt nach Horn statt nach Flöte
    if (S.siren && S.siren.o && S.siren.g) { try { S.siren.o.type = 'sawtooth'; S.siren.g.disconnect(); const b = C.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = 900; b.Q.value = 0.7; const v = C.createGain(); v.gain.value = 0.8; S.siren.g.connect(b); b.connect(v); v.connect(gruppen.vehicles); } catch (e) { /* Sirene bleibt, wie sie war */ } }
    // Kulisse draußen (Stadt, Wind, Vögel, Grillen) und Regen je mit eigenem Tiefpass für drinnen; Donner ebenso
    const lpg = (nach) => { const f = C.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 18000; f.Q.value = 0.5; const g = C.createGain(); f.connect(g); g.connect(nach); return { f, g }; };
    const aussen = lpg(gruppen.ambience), regen = lpg(gruppen.ambience), donner = lpg(gruppen.ambience);
    w = { C, S, gruppen, senke, motor, rutsch, reifen, wind, nass, aussen, regen, donner, bett: {}, um: [], aus: false, vogelT: 0, last: 0.2, gAlt: 0, skidAlt: undefined, zuletzt: {} };
    umleiten(S.engine && S.engine.g); // alter Motor: stumm, liest weiter mit
    return true;
  }
  /** Alte Stimme stumm schalten (oder mit KLANG.aus wieder hörbar): umhängen wie die Sirene, sie läuft weiter. */
  function umleiten(node) {
    if (!node || w.um.includes(node)) return;
    try { node.disconnect(); node.connect(api.aus ? w.S.master : w.senke); w.um.push(node); } catch (e) { /* bleibt, wie es war */ }
  }
  function umschalten() {
    w.aus = api.aus;
    for (const n of w.um) { try { n.disconnect(); n.connect(w.aus ? w.S.master : w.senke); } catch (e) { /* bleibt */ } }
    if (w.aus) for (const p of [w.motor.g.gain, w.motor.ng.gain, w.rutsch.g.gain, w.nass.g.gain, w.reifen.g.gain, w.wind.g.gain, w.aussen.g.gain, w.regen.g.gain]) p.setTargetAtTime(0, w.C.currentTime, 0.05);
  }
  /** Kulissen-Schleifen starten, sobald sie gerechnet sind; dann die alten Rauschteppiche stumm schalten. */
  function betten() {
    for (const [name, nach] of [['tag', w.aussen.f], ['nacht', w.aussen.f], ['wind', w.aussen.f], ['regen', w.regen.f]]) {
      if (w.bett[name] || !BETT[name]) continue;
      const s = w.C.createBufferSource(); s.buffer = BETT[name]; s.loop = true; const g = w.C.createGain(); g.gain.value = 0; s.connect(g); g.connect(nach); s.start(0, Math.random() * BL); w.bett[name] = { s, g };
      if (name === 'tag') umleiten(w.S.ambient); if (name === 'regen') umleiten(w.S.rain);
    }
  }
  /** Tiefpass mit zufälliger Grenze (2,5-15 kHz) für ein Tierchen: mal nah, mal fern. Wird nach 4 s wieder gelöst. */
  function fern() { const f = w.C.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2500 * Math.pow(6, Math.random()); f.connect(w.aussen.f); setTimeout(() => { try { f.disconnect(); } catch (e) { /* schon weg */ } }, 4000); return f; }
  /** Ein Vogel: drei bis sechs kurze, steigende oder fallende Pfiffe. */
  function vogel(laut) {
    const C = w.C, s = bau(C, fern(), C.currentTime + 0.02, laut), n = 3 + Math.floor(Math.random() * 4), f = zufall(2600, 4800); let d = 0;
    for (let i = 0; i < n; i++) { const l = zufall(0.05, 0.11), auf = Math.random() < 0.6; s.T(l, { f0: f * (auf ? 0.9 : 1.1), f1: f * (auf ? 1.15 : 0.92), g: 0.05, d, att: 0.01 }); d += l + zufall(0.02, 0.08); }
  }
  /** Eine Grille: zwei bis vier Zirpfolgen aus je vier kurzen Pulsen. */
  function grille(laut) {
    const C = w.C, s = bau(C, fern(), C.currentTime + 0.02, laut), f = zufall(4000, 4700), n = 2 + Math.floor(Math.random() * 3);
    for (let j = 0; j < n; j++) for (let i = 0; i < 4; i++) s.T(0.022, { f0: f, g: 0.035, d: j * 0.35 + i * 0.037, att: 0.004 });
  }
  const ziel = (param, v, tc = 0.15) => param.setTargetAtTime(v, w.C.currentTime, tc);
  function tick() {
    vorabSchritt();
    if (!verdrahten()) return;
    if (api.aus !== w.aus) umschalten();
    if (api.aus || w.C.state !== 'running') return;
    betten();
    const S = A.SND, P = A.player, car = P && P.car, u = car && car.userData, sp = u ? Math.abs(u.speed || 0) : 0, motor = !!(u && (!u.bike || u.moto)), t = w.C.currentTime, M = w.motor;
    // Motor: Frequenz und Pegel des alten Motors sind Drehzahl und Last. Leerlauf etwa 28 Hz Zündfrequenz, Vollgas etwa 200 Hz (Motorrad höher)
    const f = S.engine ? S.engine.o1.frequency.value : 50, g = S.engine ? S.engine.g.gain.value : 0;
    const zuend = Math.min(340, u && u.moto ? 40 + Math.max(0, f - 80) * 0.96 : 28 + Math.max(0, f - 50) * 0.9), dreh = Math.min(1, Math.max(0, (zuend - 28) / 172));
    const gas = !!(A.keys && (A.keys.KeyW || A.keys.ArrowUp)) || g > w.gAlt + 0.002; w.gAlt = g; w.last += ((gas ? 1 : 0.2) - w.last) * 0.3; const L = w.last;
    ziel(M.os.frequency, zuend, 0.06); if (Math.random() < 0.12) ziel(M.os.detune, zufall(-13, 13), 0.4); // langsames Schwanken ±13 Cent
    ziel(M.drive.gain, 0.3 + 0.6 * L, 0.08); ziel(M.lp.frequency, 500 + 3500 * L * (0.35 + 0.65 * dreh), 0.08);
    ziel(M.g.gain, motor ? g * 0.55 : 0, 0.08); ziel(M.ng.gain, motor ? (0.02 + 0.06 * L) * g * 2 : 0, 0.1); ziel(M.nb.frequency, 500 + 1500 * dreh, 0.1);
    // Reifen und Fahrtwind; Rutschen erkennt man daran, dass das Spiel u.skidT weiterzählt (nur wenn die Räder rutschen)
    const k = Math.min(1, sp / 32), wt = A.weather || {}, rain = wt.rain || 0;
    ziel(w.reifen.g.gain, car && !u.heli ? Math.pow(k, 1.4) * (u.bike && !u.moto ? 0.03 : 0.12) : 0); ziel(w.reifen.f.frequency, 300 + k * 700);
    ziel(w.wind.g.gain, car ? k * k * 0.09 : 0); ziel(w.wind.f.frequency, 600 + k * 900);
    const skid = !!(u && !u.bike && performance.now() - (u.skidAt || -1e9) < 150 && sp > 6); // Zeitstempel statt Zählervergleich: der Zähler stand bei unter 28 Bildern/s immer auf 0
    ziel(w.rutsch.g.gain, skid ? 2.2 * Math.min(1, sp / 20) : 0, skid ? 0.04 : 0.12); if (skid) w.rutsch.b.forEach((b, i) => ziel(b.frequency, (i ? 2 : 1) * zufall(1150, 1450), 0.1));
    ziel(w.nass.g.gain, car && !u.heli && rain > 0.05 ? rain * Math.pow(k, 1.2) * 0.09 : 0, 0.2); // nasse Straße zischt mit dem Tempo
    // Kulisse: Überblendung über 3-4 s; drinnen gedämpft durch Tiefpass statt nur leiser, Regen und Donner etwas heller
    const h = A.world ? A.world.hour : 12, tag = h > 5.5 && h < 20.5, drin = innen(), raum = car ? 0.45 : 1, T = 1.1, B = w.bett, sturm = Math.max(0, rain - 0.5) * 2;
    ziel(w.aussen.f.frequency, drin ? 650 : 18000, 0.6); ziel(w.aussen.g.gain, drin ? 0.2 : 1, 0.6);
    ziel(w.regen.f.frequency, drin ? 1400 : 18000, 0.6); ziel(w.regen.g.gain, drin ? 0.3 : 1, 0.6);
    ziel(w.donner.f.frequency, drin ? 1100 : 18000, 0.3); ziel(w.donner.g.gain, drin ? 0.45 : 1, 0.3);
    if (B.tag) ziel(B.tag.g.gain, tag ? 0.05 * raum : 0, T); if (B.nacht) ziel(B.nacht.g.gain, tag ? 0 : 0.035 * raum, T);
    if (B.wind) ziel(B.wind.g.gain, (0.012 + sturm * 0.09 + rain * 0.01) * raum, T); if (B.regen) ziel(B.regen.g.gain, rain * 0.55 * (car ? 0.4 : 1), T);
    // Tierchen: tagsüber Vögel, nachts ohne Regen Grillen, je als einzelnes Ereignis
    if (!drin && t > w.vogelT) {
      if (tag && rain < 0.4) { w.vogelT = t + zufall(2.5, 8); if (!car || sp < 8) vogel(car ? 0.4 : 1); }
      else if (!tag && rain < 0.3) { w.vogelT = t + zufall(0.8, 3); if (!car || sp < 5) grille(car ? 0.4 : 1); }
      else w.vogelT = t + 2;
    }
  }
  setInterval(() => { try { tick(); } catch (e) { console.warn('klang', e); } }, 80); // eigener Takt, keine Zeile in der Spielschleife

  /** Ort eines Geräuschs relativ zum Spieler: Pegel, Panorama, Schallverzug, Tiefpass. Ohne pos: Mitte, voll. */
  function ort(kind, pos) {
    const P = A.player && A.player.pos;
    if (!pos || !P || !isFinite(pos.x) || !isFinite(pos.z)) return { gain: 1, pan: 0, delay: 0, lp: 20000, d: 0 };
    const pr = ORT[kind] || KLEIN, dx = pos.x - P.x, dz = pos.z - P.z, d = Math.hypot(dx, dz);
    let gain = d > 5 ? 5 / (5 + pr.roll * (d - 5)) : 1;
    if (d >= pr.max) gain = 0; else if (d > pr.max * 0.75) gain *= (pr.max - d) / (pr.max * 0.25); // letztes Viertel der Hörweite ausblenden
    let rx = 0, rz = 0; const cam = A.camera; // rechte Achse der Kamera
    if (cam && cam.matrixWorld) { const e = cam.matrixWorld.elements; rx = e[0]; rz = e[2]; } else if (A.camYaw) { rx = -Math.cos(A.camYaw.v); rz = Math.sin(A.camYaw.v); }
    const rl = Math.hypot(rx, rz), pan = d > 0.3 && rl > 1e-6 ? Math.max(-0.85, Math.min(0.85, 0.85 * (dx * rx + dz * rz) / (d * rl) * Math.min(1, d / 3))) : 0;
    return { gain, pan, delay: pr.schall ? Math.min(2.5, d / 343) : 0, lp: 20000 * Math.pow(pr.lp / 20000, Math.min(1, d / pr.max)), d };
  }
  // Stimmen: höchstens MAXV Einzelgeräusche; ist alles voll, fällt das leiseste neue weg (oder das leiseste alte, wenn das neue lauter ist)
  const stimmen = [];
  function aufraeumen() { const jetzt = performance.now(); for (let i = stimmen.length - 1; i >= 0; i--) if (stimmen[i].ende < jetzt) stimmen.splice(i, 1); }
  function platz(laut) {
    aufraeumen(); if (stimmen.length < MAXV) return true;
    let k = 0; for (let i = 1; i < stimmen.length; i++) if (stimmen[i].laut < stimmen[k].laut) k = i;
    if (stimmen[k].laut >= laut) return false;
    const s = stimmen.splice(k, 1)[0], t = w.C.currentTime;
    try { s.g.gain.cancelScheduledValues(t); s.g.gain.setTargetAtTime(0, t, 0.015); if (s.src) s.src.stop(t + 0.1); } catch (e) { /* war schon zu Ende */ }
    return true;
  }

  /** Geräusch spielen; false = dieses Geräusch kennt das Modul nicht oder der Ton ist noch nicht bereit (dann spielt game.js es wie bisher). */
  function sfx(kind, vol = 1, pos = null) {
    const art = kind === 'step' ? schrittArt() : kind, aufn = AUFN[art];
    if ((!R[art] && !aufn) || !verdrahten() || api.aus) return false;
    try {
      const C = w.C, o = ort(kind, pos); api.letzter = { kind, gain: +o.gain.toFixed(4), pan: +o.pan.toFixed(3), delay: +o.delay.toFixed(3), lp: Math.round(o.lp), d: Math.round(o.d) };
      if (o.gain <= 0.0005) return true; // außer Hörweite
      if (C.state !== 'running') return true; // Ton angehalten (Handy gesperrt, Anruf): nichts einplanen, sonst spielt nach dem Aufwecken alles auf einmal
      const bs = aufn || VAR[art], v = vol * o.gain, laut = v * (bs ? 1 : PEGEL[art] || 1);
      if (!platz(laut)) return true;
      const t = C.currentTime + o.delay, kette = [], g = C.createGain(); kette.push(g); let n = g;
      if (pos) { const f = C.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = 0.5; n.connect(f); n = f; kette.push(f);
        if (C.createStereoPanner) { const p = C.createStereoPanner(); p.pan.value = o.pan; n.connect(p); n = p; kette.push(p); } }
      n.connect(kind === 'thunder' ? w.donner.f : w.gruppen[GRUPPE[art] || 'combat']);
      const frei = () => { for (const x of kette) { try { x.disconnect(); } catch (e) { /* schon gelöst */ } } };
      if (bs && bs.length) {
        const z = w.zuletzt[kind]; let i = Math.floor(Math.random() * bs.length);
        if (bs.length > 1 && z !== undefined) { i = Math.floor(Math.random() * (bs.length - 1)); if (i >= z) i++; } // nie zweimal dieselbe Fassung
        w.zuletzt[kind] = i;
        const src = C.createBufferSource(), rate = zufall(0.96, 1.04); src.buffer = bs[i]; src.playbackRate.value = rate; g.gain.value = v * zufall(0.9, 1.1);
        src.connect(g); kette.push(src); src.onended = frei; src.start(t);
        stimmen.push({ src, g, laut, ende: performance.now() + (o.delay + bs[i].duration / rate) * 1000 + 60 });
      } else { // noch nicht vorgerechnet: Rezept live
        const pv = vol * (PEGEL[art] || 1), dauer = (LEN[art] || 0.4) + 0.1; g.gain.value = o.gain; R[art](bau(C, g, t, pv), pv);
        stimmen.push({ src: null, g, laut, ende: performance.now() + (o.delay + dauer) * 1000 });
        setTimeout(frei, (o.delay + dauer + 0.3) * 1000);
      }
      return true;
    } catch (e) { console.warn('klang', kind, e); return false; }
  }
  /** Jedes Geräusch stumm rechnen (OfflineAudioContext): Spitze, Mittelwert und Länge in ms, ohne einen Ton auszugeben.
   *  Sind schon Fassungen vorgerechnet, steht deren Messung unter `vor` (n, peakMin, peakMax, rms, diff, ms). */
  async function messen(kinds = Object.keys(R)) {
    const out = {}, OC = offline(); if (!OC) return out;
    for (const kind of kinds) { if (!R[kind]) continue; const O = new OC(1, 44100 * 5, 44100); const v = PEGEL[kind] || 1; R[kind](bau(O, O.destination, 0.02, v), v);
      const d = (await O.startRendering()).getChannelData(0); let peak = 0, sum = 0, last = 0, first = -1;
      for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; if (a > 0.003) { last = i; if (first < 0) first = i; } }
      for (let i = Math.max(0, first); i <= last; i++) sum += d[i] * d[i];
      out[kind] = { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / Math.max(1, last - first + 1)).toFixed(4), ms: Math.round((last - Math.max(0, first)) / 44.1) };
      if (VAR[kind] && VAR[kind].length) out[kind].vor = vermessen(VAR[kind]); }
    return out;
  }
  /** Aufnahmen laden: { kind: [url, …] }. Holt und dekodiert jede Datei, normalisiert die Spitze auf 0,9 und nimmt sie ab dann
   *  als Fassungen dieses Geräuschs (gleicher Weg wie die vorgerechneten: Ort, Stimmenzahl, Gruppen). Liefert die Zahl der Puffer. */
  // Spitzenpegel je Aufnahme, passend zu den vorgerechneten Geräuschen; Schlüssel der Datei → Geräusch im Spiel
  const AUFN_PEGEL = { step: 0.2, step_innen: 0.2, punch: 0.5, hit: 0.5, bump: 0.5, splat: 0.45, door: 0.4, click: 0.3, pickup: 0.35, reload: 0.4 }, AUFN_NAME = { step_holz: 'step_innen' };
  async function ladeAufnahmen(manifest) {
    const OC = offline(); let n = 0; if (!OC || !manifest) return 0;
    let ogg = false, m4a = false; // Safari vor 18.4 kann kein Ogg: dann die AAC-Zwillinge (.m4a, gleicher Name); kann er beides nicht, gar nichts laden
    try { const a = document.createElement('audio'); ogg = !!a.canPlayType('audio/ogg; codecs="vorbis"'); m4a = !ogg && !!a.canPlayType('audio/mp4; codecs="mp4a.40.2"'); } catch (e) { return 0; }
    if (!ogg && !m4a) return 0;
    const dek = new OC(1, 1, 44100);
    for (const key of Object.keys(manifest)) {
      const kind = AUFN_NAME[key] || key; if (!R[kind]) continue; // unbekannt (z. B. step_gras: das Spiel kennt den Untergrund nicht)
      const urls = [].concat(manifest[key] || []), bs = [];
      for (const url0 of urls) { const url = ogg ? url0 : String(url0).replace(/\.ogg$/i, '.m4a'); try { const r = await fetch(url); if (!r.ok) continue; bs.push(normalisieren(await dek.decodeAudioData(await r.arrayBuffer()), AUFN_PEGEL[kind] || 0.4)); } catch (e) { console.warn('klang aufnahme', url, e); } }
      if (bs.length) { AUFN[kind] = bs; n += bs.length; }
    }
    return n;
  }
  const api = { sfx, messen, ort, ladeAufnahmen, aus: false, kinds: Object.keys(R), letzter: null, MAXV,
    get bereit() { return !!w; }, get aufnahmen() { let n = 0; for (const k in AUFN) n += AUFN[k].length; return n; },
    get stimmen() { aufraeumen(); return stimmen.length; },
    /** Stand des Vorrechnens: arten = Geräusche mit allen Fassungen, fertig = Warteschlange leer */
    get vorab() { const arten = Object.keys(R).filter(k => VAR[k] && VAR[k].length >= anzahl(k)).length; return { arten, gesamt: Object.keys(R).length, betten: Object.keys(BETT).length, aufgaben: V.q.length, erledigt: V.i, fertig: V.i >= V.q.length && !V.busy }; },
    get gruppen() { return w ? w.gruppen : null; } };
  /** @type {any} */ (window).KLANG = api; // Ton wieder aufwecken: iOS hält ihn nach Anruf, Sperrbildschirm oder App-Wechsel an ('suspended' oder 'interrupted')
  const wecken = () => { const c = A.SND && A.SND.ctx; if (c && c.state !== 'running' && c.state !== 'closed') { try { const q = c.resume(); if (q && q.catch) q.catch(() => { /* erst nach einer Geste erlaubt */ }); } catch (e) { /* bleibt aus */ } } };
  for (const ev of ['pointerdown', 'touchend', 'keydown']) addEventListener(ev, wecken, { passive: true });
  return api;
}

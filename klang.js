// Klang (André 14.11.2026: „kannst du die Sounds verbessern“). Die Töne des Spiels entstehen im Code (Web Audio, keine
// Tondateien). Bisher war jedes Geräusch ein einzelner Rausch- oder Sinusstoß direkt auf dem Ausgang. Dieses Modul
// - setzt die einzelnen Geräusche aus mehreren Schichten zusammen (Anschlag, Körper, Tiefe, Ausklang) mit leichter
//   Zufallsstreuung, damit zwei Schüsse oder Schritte nie gleich klingen,
// - legt einen Begrenzer und etwas Straßenhall hinter den gemeinsamen Ausgang (wirkt auf alles, auch auf alte Töne),
// - wertet Motor (Oberton, Rauheit, Reifen- und Fahrtwind), Sirene (heller, hornartiger) und Stadtkulisse auf
//   (ferner Verkehr, tagsüber Vögel, nachts Grillen, Windböen bei Sturm).
// Der Ton-Code in game.js bleibt, wie er ist: sfx() fragt nur zuerst hier nach (eine Zeile), Lautstärke und Regler laufen
// weiter über SND.master. Fehlt dieses Modul oder kennt es ein Geräusch nicht, klingt alles wie vorher.
// Hören kann die Entwicklung den Ton nicht (kein Ton über Andrés Lautsprecher): messen() rechnet jedes Geräusch stumm
// in einem OfflineAudioContext und liefert Spitze, Mittelwert und Länge, die Probe `klang` prüft diese Zahlen.

const NOISE = new WeakMap(); // je AudioContext ein Rauschpuffer
function rauschen(C) {
  let b = NOISE.get(C); if (b) return b;
  b = C.createBuffer(1, Math.floor(C.sampleRate * 2), C.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  NOISE.set(C, b); return b;
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
  step: s => { s.N(0.06, { f0: 600, f1: 160, g: 0.2 }); s.N(0.015, { type: 'bandpass', f0: 2200, q: 2, g: 0.07 }); },
  door: s => { s.N(0.1, { f0: 500, f1: 140, g: 0.38 }); s.T(0.09, { f0: 150, f1: 70, g: 0.32 }); s.N(0.02, { type: 'bandpass', f0: 1800, q: 3, g: 0.14, d: 0.07 }); },
  glass: s => { s.N(0.22, { type: 'highpass', f0: 5000, f1: 2500, g: 0.5 }); for (let i = 0; i < 9; i++) s.T(zufall(0.05, 0.22), { f0: zufall(3000, 9000), g: 0.08, d: zufall(0, 0.12) }); }, // Scherben
  screech: s => { s.N(0.45, { type: 'bandpass', f0: 2100, f1: 1500, q: 6, g: 0.45, att: 0.03 }); s.N(0.45, { type: 'bandpass', f0: 2900, f1: 2000, q: 8, g: 0.22, att: 0.03 }); },
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

/** @param {import('./types').Ctx} X */
export function initKlang(X) {
  const A = /** @type {any} */ (X);
  let w = null; // Verdrahtung, sobald das Spiel seinen AudioContext hat (erste Eingabe des Spielers)
  function verdrahten() {
    const S = A.SND; if (w || !S || !S.ctx || !S.master) return !!w;
    const C = S.ctx;
    // Ausgang: Begrenzer hinter SND.master, dazu etwas Straßenhall (kurz, gedämpft). Der Lautstärkeregler bleibt SND.master.
    const comp = C.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.18;
    const len = Math.floor(C.sampleRate * 1.1), imp = C.createBuffer(2, len, C.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = imp.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6) * (i < 400 ? i / 400 : 1); }
    const hall = C.createConvolver(); hall.buffer = imp; const hallLp = C.createBiquadFilter(); hallLp.type = 'lowpass'; hallLp.frequency.value = 4500; const hallG = C.createGain(); hallG.gain.value = 0.13;
    try { S.master.disconnect(); } catch (e) { /* war noch nicht verbunden */ }
    S.master.connect(comp); S.master.connect(hallG); hallG.connect(hall); hall.connect(hallLp); hallLp.connect(comp); comp.connect(C.destination);
    const quelle = () => { const s = C.createBufferSource(); s.buffer = rauschen(C); s.loop = true; s.start(0, Math.random() * 1.5); return s; };
    const kette = (src, type, freq, q) => { const f = C.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = C.createGain(); g.gain.value = 0; src.connect(f); f.connect(g); g.connect(S.master); return { f, g }; };
    // Motor: Oberton und Rauheit folgen dem Motor des Spiels (dessen Frequenz und Pegel lesen wir nur ab), dazu Reifen und Fahrtwind
    const ober = C.createOscillator(); ober.type = 'triangle'; ober.frequency.value = 120; const oberG = C.createGain(); oberG.gain.value = 0; ober.connect(oberG); oberG.connect(S.master); ober.start();
    const rau = kette(quelle(), 'bandpass', 400, 1.2), reifen = kette(quelle(), 'lowpass', 520, 0.6), wind = kette(quelle(), 'bandpass', 900, 0.5);
    // Sirene: Sägezahn durch ein Band klingt nach Horn statt nach Flöte
    if (S.siren && S.siren.o && S.siren.g) { try { S.siren.o.type = 'sawtooth'; S.siren.g.disconnect(); const b = C.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = 900; b.Q.value = 0.7; const v = C.createGain(); v.gain.value = 0.8; S.siren.g.connect(b); b.connect(v); v.connect(S.master); } catch (e) { /* Sirene bleibt, wie sie war */ } }
    // Stadtkulisse: ferner Verkehr (tiefes Rauschen, atmet langsam), Böen, Grillen
    const verkehr = kette(quelle(), 'lowpass', 170, 0.5), boe = kette(quelle(), 'bandpass', 500, 0.4);
    const grille = C.createOscillator(); grille.frequency.value = 4300; const grilleG = C.createGain(); grilleG.gain.value = 0; const puls = C.createOscillator(); puls.type = 'square'; puls.frequency.value = 27; const pulsG = C.createGain(); pulsG.gain.value = 0;
    grille.connect(grilleG); grilleG.connect(S.master); puls.connect(pulsG); pulsG.connect(grilleG.gain); grille.start(); puls.start();
    w = { C, comp, ober, oberG, rau, reifen, wind, verkehr, boe, grilleG, pulsG, vogelT: 0, phase: 0 };
    return true;
  }
  /** Ein Vogel: drei bis sechs kurze, steigende oder fallende Pfiffe. */
  function vogel(laut) {
    const C = w.C, s = bau(C, A.SND.master, C.currentTime + 0.02, laut), n = 3 + Math.floor(Math.random() * 4), f = zufall(2600, 4800); let d = 0;
    for (let i = 0; i < n; i++) { const l = zufall(0.05, 0.11), auf = Math.random() < 0.6; s.T(l, { f0: f * (auf ? 0.9 : 1.1), f1: f * (auf ? 1.15 : 0.92), g: 0.05, d, att: 0.01 }); d += l + zufall(0.02, 0.08); }
  }
  const ziel = (param, v, tc = 0.15) => param.setTargetAtTime(v, w.C.currentTime, tc);
  function tick() {
    if (!verdrahten() || w.C.state !== 'running') return;
    const S = A.SND, P = A.player, car = P && P.car, u = car && car.userData, sp = u ? Math.abs(u.speed || 0) : 0, motor = !!(u && (!u.bike || u.moto) && !u.heli);
    // Motor: Frequenz und Pegel des Spielmotors ablesen
    const f = S.engine ? S.engine.o1.frequency.value : 60, g = S.engine ? S.engine.g.gain.value : 0;
    ziel(w.ober.frequency, f * 2, 0.05); ziel(w.oberG.gain, motor ? g * 0.3 : 0); ziel(w.rau.f.frequency, Math.min(3000, f * 5), 0.05); ziel(w.rau.g.gain, motor ? g * 0.28 : 0);
    const k = Math.min(1, sp / 32); ziel(w.reifen.g.gain, car && !u.heli ? Math.pow(k, 1.4) * (u.bike && !u.moto ? 0.03 : 0.12) : 0); ziel(w.reifen.f.frequency, 300 + k * 700);
    ziel(w.wind.g.gain, car ? k * k * 0.09 : 0); ziel(w.wind.f.frequency, 600 + k * 900);
    // Stadtkulisse: draußen voll, in Innenräumen und im Auto gedämpft
    const wt = A.weather || {}, h = A.world ? A.world.hour : 12, tag = h > 5.5 && h < 20.5, IN = A.INTERIORS || (/** @type {any} */ (window).G || {}).INTERIORS, innen = !!(IN && IN.inside), raum = innen ? 0.12 : car ? 0.45 : 1;
    w.phase += 0.08; ziel(w.verkehr.g.gain, (0.07 + 0.03 * Math.sin(w.phase * 0.35)) * raum * (tag ? 1 : 0.6), 0.6);
    const sturm = Math.max(0, (wt.rain || 0) - 0.5) * 2; ziel(w.boe.g.gain, (0.01 + sturm * 0.12 * (0.6 + 0.4 * Math.sin(w.phase * 0.9))) * raum, 0.5); ziel(w.boe.f.frequency, 400 + 300 * Math.sin(w.phase * 0.5), 0.5);
    const nacht = !tag && !(wt.rain > 0.3) && !innen; ziel(w.grilleG.gain, 0, 0.3); ziel(w.pulsG.gain, nacht ? 0.006 * raum : 0, 0.8); // Grillen: nur der Puls öffnet den Pegel
    if (tag && !innen && !(wt.rain > 0.4) && w.C.currentTime > w.vogelT) { w.vogelT = w.C.currentTime + zufall(2.5, 8); if (!car || sp < 8) vogel(car ? 0.4 : 1); }
  }
  setInterval(() => { try { tick(); } catch (e) { console.warn('klang', e); } }, 80); // eigener Takt, keine Zeile in der Spielschleife

  /** Geräusch spielen; false = dieses Geräusch kennt das Modul nicht oder der Ton ist noch nicht bereit (dann spielt game.js es wie bisher). */
  function sfx(kind, vol = 1) {
    const r = R[kind]; if (!r || !verdrahten() || api.aus) return false;
    try { r(bau(w.C, A.SND.master, w.C.currentTime, vol), vol); return true; } catch (e) { console.warn('klang', kind, e); return false; }
  }
  /** Jedes Geräusch stumm rechnen (OfflineAudioContext): Spitze, Mittelwert und Länge in ms, ohne einen Ton auszugeben. */
  async function messen(kinds = Object.keys(R)) {
    const out = {}, OC = window.OfflineAudioContext || /** @type {any} */ (window).webkitOfflineAudioContext; if (!OC) return out;
    for (const kind of kinds) { if (!R[kind]) continue; const O = new OC(1, 44100 * 5, 44100); R[kind](bau(O, O.destination, 0.02, 1), 1);
      const d = (await O.startRendering()).getChannelData(0); let peak = 0, sum = 0, last = 0, first = -1;
      for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; if (a > 0.003) { last = i; if (first < 0) first = i; } }
      for (let i = Math.max(0, first); i <= last; i++) sum += d[i] * d[i];
      out[kind] = { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / Math.max(1, last - first + 1)).toFixed(4), ms: Math.round((last - Math.max(0, first)) / 44.1) }; }
    return out;
  }
  const api = { sfx, messen, aus: false, kinds: Object.keys(R), get bereit() { return !!w; } };
  /** @type {any} */ (window).KLANG = api; return api;
}

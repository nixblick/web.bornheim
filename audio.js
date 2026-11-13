// Sound (Web Audio, alles synthetisch), ausgelagert aus game.js (#118). Verhalten unverändert.
// audioUpdate bekommt den Spielzustand (player, keys, cars, worldT) als Parameter.
// ---------- Sound (Web Audio, alles synthetisch) ----------
export const SND = { ctx: null, master: null, vol: 0.8, engine: null, siren: null, ambient: null };
export function audioInit() {
  if (SND.ctx) { if (SND.ctx.state === 'suspended') SND.ctx.resume(); return; }
  const C = new (window.AudioContext || window.webkitAudioContext)(); SND.ctx = C; SND.master = C.createGain(); SND.master.gain.value = SND.vol; SND.master.connect(C.destination);
  // Motor: zwei Sägezähne + Tiefpass
  const eg = C.createGain(); eg.gain.value = 0; const ef = C.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 400; const o1 = C.createOscillator(), o2 = C.createOscillator(); o1.type = 'sawtooth'; o2.type = 'square'; o1.frequency.value = 60; o2.frequency.value = 31; o1.connect(ef); o2.connect(ef); ef.connect(eg); eg.connect(SND.master); o1.start(); o2.start(); SND.engine = { g: eg, o1, o2, f: ef };
  // Sirene
  const sg = C.createGain(); sg.gain.value = 0; const so = C.createOscillator(); so.type = 'triangle'; so.frequency.value = 700; so.connect(sg); sg.connect(SND.master); so.start(); SND.siren = { g: sg, o: so };
  // Stadtrauschen
  const buf = C.createBuffer(1, C.sampleRate * 2, C.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1); const src = C.createBufferSource(); src.buffer = buf; src.loop = true; const af = C.createBiquadFilter(); af.type = 'lowpass'; af.frequency.value = 300; const ag = C.createGain(); ag.gain.value = 0.06; src.connect(af); af.connect(ag); ag.connect(SND.master); src.start(); SND.ambient = ag; SND.noise = buf;
  const rs = C.createBufferSource(); rs.buffer = buf; rs.loop = true; const rf = C.createBiquadFilter(); rf.type = 'highpass'; rf.frequency.value = 1200; const rg = C.createGain(); rg.gain.value = 0; rs.connect(rf); rf.connect(rg); rg.connect(SND.master); rs.start(); SND.rain = rg;
}
export function sfx(kind, vol = 1) {
  if (!SND.ctx) return; const C = SND.ctx, t = C.currentTime;
  const noise = (dur, f0, f1, g0, type = 'lowpass') => { const src = C.createBufferSource(); src.buffer = SND.noise; const f = C.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur); const g = C.createGain(); g.gain.setValueAtTime(g0 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); src.connect(f); f.connect(g); g.connect(SND.master); src.start(t); src.stop(t + dur + 0.05); };
  const tone = (dur, f0, f1, g0, type = 'sine') => { const o = C.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur); const g = C.createGain(); g.gain.setValueAtTime(g0 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(SND.master); o.start(t); o.stop(t + dur + 0.05); };
  if (kind === 'shot') { noise(0.18, 4000, 400, 0.9, 'bandpass'); tone(0.12, 180, 50, 0.6); }
  else if (kind === 'reload') { tone(0.05, 900, 600, 0.2, 'square'); setTimeout(() => tone(0.05, 700, 1200, 0.2, 'square'), 120); }
  else if (kind === 'step') { noise(0.07, 800, 200, 0.25); }
  else if (kind === 'crash') { noise(0.5, 1500, 100, 1.0); tone(0.3, 90, 30, 0.6); }
  else if (kind === 'bump') { noise(0.15, 600, 100, 0.4); }
  else if (kind === 'screech') { noise(0.2, 2400, 1500, 0.35, 'bandpass'); }
  else if (kind === 'thunder') { noise(2.5, 400, 30, 1.2); tone(1.5, 55, 25, 0.8); }
  else if (kind === 'explosion') { noise(1.6, 900, 40, 1.4); tone(0.9, 70, 20, 1.0); }
  else if (kind === 'bell') { tone(0.12, 2600, 2500, 0.25, 'sine'); tone(0.3, 3900, 3800, 0.1, 'sine'); setTimeout(() => { tone(0.12, 2600, 2500, 0.2, 'sine'); }, 110); }
  else if (kind === 'horn') { tone(0.5, 420, 420, 0.35, 'square'); tone(0.5, 530, 530, 0.25, 'square'); }
  else if (kind === 'hit') { noise(0.12, 2000, 300, 0.5); tone(0.15, 300, 100, 0.3); }
  else if (kind === 'door') { noise(0.12, 500, 150, 0.35); tone(0.08, 160, 80, 0.3); }
  else if (kind === 'pickup') { tone(0.1, 880, 1320, 0.3); setTimeout(() => tone(0.15, 1320, 1760, 0.3), 90); }
  else if (kind === 'click') { tone(0.04, 1200, 800, 0.15, 'square'); }
  else if (kind === 'smg') { noise(0.1, 5000, 600, 0.7, 'bandpass'); tone(0.07, 220, 70, 0.4); }
  else if (kind === 'shotgun') { noise(0.35, 2500, 120, 1.3); tone(0.25, 120, 35, 0.9); }
  else if (kind === 'rifle') { noise(0.16, 6000, 500, 1.0, 'bandpass'); tone(0.1, 260, 60, 0.5); }
  else if (kind === 'swing') { noise(0.18, 600, 2400, 0.35, 'bandpass'); }
  else if (kind === 'punch') { noise(0.1, 900, 120, 0.7); tone(0.12, 140, 60, 0.6); }
  else if (kind === 'bang') { noise(0.06, 9000, 3000, 1.6, 'highpass'); noise(0.9, 1200, 60, 1.1); tone(0.3, 90, 30, 0.8); }
  else if (kind === 'hiss') { noise(0.7, 3000, 2500, 0.3, 'highpass'); }
  else if (kind === 'taser') { tone(0.5, 2400, 2200, 0.2, 'square'); noise(0.5, 4000, 3000, 0.25, 'bandpass'); }
  else if (kind === 'splat') { noise(0.14, 700, 150, 0.6); }
  else if (kind === 'throw') { noise(0.15, 400, 1500, 0.25, 'bandpass'); }
  else if (kind === 'cough') { noise(0.12, 900, 300, 0.4, 'bandpass'); setTimeout(() => noise(0.1, 800, 300, 0.3, 'bandpass'), 180); }
  else if (kind === 'notify') { tone(0.07, 1320, 1320, 0.12); setTimeout(() => tone(0.09, 1760, 1760, 0.1), 80); }
  else if (kind === 'crackle') { for (let i = 0; i < 6; i++) setTimeout(() => noise(0.03, 7000, 4000, 0.5, 'highpass'), i * 60 + Math.random() * 40); }
  else if (kind === 'bell') { tone(0.35, 1480, 1470, 0.25, 'triangle'); setTimeout(() => tone(0.35, 1480, 1470, 0.22, 'triangle'), 220); }
  else if (kind === 'glass') { noise(0.25, 7000, 2500, 0.8, 'highpass'); tone(0.12, 2600, 1800, 0.15, 'triangle'); }
  else if (kind === 'schoolbell') { for (let i = 0; i < 14; i++) setTimeout(() => tone(0.09, 2100, 2050, 0.22, 'square'), i * 95); }
  else if (kind === 'whoosh') { noise(0.8, 800, 4000, 0.35, 'bandpass'); }
}
export function audioUpdate(dt, player, keys, cars, worldT) {
  if (!SND.ctx) return; const t = SND.ctx.currentTime;
  if (SND.engine) { const car = player.car && (!player.car.userData.bike || player.car.userData.moto) ? player.car : null; /* Fahrrad hat keinen Motor, Motorrad schon */ const sp = car ? Math.abs(car.userData.speed) : 0; const target = car ? 0.18 + Math.min(sp / 30, 1) * 0.25 : 0; SND.engine.g.gain.setTargetAtTime(target, t, 0.1); const f = (car && car.userData.moto ? 80 + sp * 9 : 50 + sp * 6) + (car && keys.KeyW ? 15 : 0); SND.engine.o1.frequency.setTargetAtTime(f, t, 0.08); SND.engine.o2.frequency.setTargetAtTime(f / 2, t, 0.08); SND.engine.f.frequency.setTargetAtTime(300 + sp * 40, t, 0.1); }
  if (SND.siren) { let best = 1e9; for (const c of cars) if (c.userData.mode === 'police' || (c.userData.siren && c !== player.car)) best = Math.min(best, c.position.distanceTo(player.pos)); if (player.car && player.car.userData.siren) best = 0; const g = best < 220 ? 0.25 * (1 - best / 220) : 0; SND.siren.g.gain.setTargetAtTime(g, t, 0.1); SND.siren.o.frequency.setTargetAtTime(Math.floor(worldT * 1.7) % 2 ? 650 : 870, t, 0.03); }
  if (SND.ambient) SND.ambient.gain.setTargetAtTime(player.car ? 0.02 : 0.06, t, 0.5);
}

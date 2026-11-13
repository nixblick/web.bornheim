// Zivile Nebenjobs (#148, André 13.11.2026): Lastenrad-Kurier, Rettungsdienst-Schicht, Müllabfuhr.
// Eine Schicht startet aus der gemeinsamen Missionsliste (missionen.js: Handy und Pausenmenü). Beim Start steht das Dienstfahrzeug
// neben dem Spieler (vorhandene Fahrzeuge: Rad, Rettungswagen, Auto als Müllwagen); die Ziele zeigt der Wegweiser (wegweiser.js).
// Jeder erledigte Auftrag zahlt sofort Geld und EP, das Lastenrad zusätzlich Fitness. Eine Schicht mit mindestens einem Auftrag
// zählt in der Statistik (progress.js, Ereignis 'schicht'). Ende: alle Aufträge erledigt oder „Feierabend“ in der Missionsliste.
import { initWegweiser } from './wegweiser.js';
/** @param {import('./types').Ctx} X */
export function initNebenjobs(X) {
  const { scene, player, cars, shootables, showMsg, card, sfx, TH, solidAt, camYaw } = X;
  const WEG = X.WEG || (X.WEG = initWegweiser(X));
  // Kliniken mit belegten Spielkoordinaten (BG Unfallklinik wie heli.js); weitere erst mit Koordinaten aus OSM
  const KLINIKEN = [{ n: 'BG Unfallklinik', p: [-35, -1767] }];
  const JOBS = {
    kurier: { name: 'Lastenrad-Kurier', info: 'Pakete vom Laden zur Haustür, nur mit dem Rad. Geld, EP und Fitness.', n: 3, geld: 35, ep: 20, fit: 2, veh: 'bike', ok: u => u.bike && !u.moto, need: 'NUR MIT DEM RAD' },
    rettung: { name: 'Rettungsdienst-Schicht', info: 'Im Rettungswagen Verletzte einsammeln und in die Klinik bringen.', n: 2, geld: 120, ep: 45, fit: 0, veh: 'ambulance', ok: u => !!u.ambulance, need: 'NUR IM RETTUNGSWAGEN' },
    muell: { name: 'Müllabfuhr', info: 'Tonnen-Route im Viertel abfahren, an jeder Tonne kurz halten.', n: 1, geld: 90, ep: 30, fit: 0, veh: 'suv', ok: u => !u.bike && !u.heli, need: 'NUR MIT DEM DIENSTWAGEN' },
  };
  let job = null; // { id, J, done, auftrag: { pts, i, label }, veh, t0 }
  const stats = { schichten: 0, auftraege: 0 };

  const here = () => player.car ? player.car.position : player.pos;
  const free = (x, z) => solidAt(x, z) < 0;
  // Punkt auf/neben der Straße in Richtung a, Abstand r; null, wenn nichts Freies
  function roadPoint(x0, z0, r, a, side = 0) {
    for (let k = 0; k < 10; k++) { const aa = a + k * 0.7, x = x0 + Math.sin(aa) * r, z = z0 + Math.cos(aa) * r; const nr = X.nearestRoadDir && X.nearestRoadDir(x, z, 40);
      if (!nr) continue; let px = nr.x, pz = nr.z; if (side) { const qx = -Math.cos(nr.ang), qz = Math.sin(nr.ang); px += qx * (nr.w / 2 + side); pz += qz * (nr.w / 2 + side); }
      if (free(px, pz)) return [px, pz]; }
    return null; }
  function shopPoint(x0, z0) { const S = X.SHOPS_LIST ? X.SHOPS_LIST() : []; let best = null, bd = 1e12; for (const s of S) { const d = (s.x - x0) ** 2 + (s.z - z0) ** 2; if (d > 40 * 40 && d < bd) { bd = d; best = s; } } return best && bd < 600 * 600 ? [best.x, best.z] : null; }

  function plan(id) { const [x0, z0] = [here().x, here().z], a = Math.random() * Math.PI * 2;
    if (id === 'kurier') { const s = shopPoint(x0, z0) || roadPoint(x0, z0, 120, a, 1.5), d = s && roadPoint(s[0], s[1], 200 + Math.random() * 150, a + 2, 1.5); return s && d ? { pts: [s, d], label: '📦 Paket' } : null; }
    if (id === 'rettung') { const e = roadPoint(x0, z0, 200 + Math.random() * 200, a); if (!e) return null; let k = KLINIKEN[0], kd = 1e12; for (const q of KLINIKEN) { const d = Math.hypot(q.p[0] - e[0], q.p[1] - e[1]); if (d < kd) { kd = d; k = q; } } return { pts: [e, k.p.slice()], label: '🚑 Einsatz', klinik: k.n }; }
    const pts = []; for (let i = 0; i < 5; i++) { const p = roadPoint(x0, z0, 60 + i * 45, a + i * 0.9, 0); if (p) pts.push(p); } return pts.length >= 3 ? { pts, label: '🗑 Tonnen' } : null; }

  function spawnVeh(J) { const s = Math.sin(camYaw.v + Math.PI / 2), c = Math.cos(camYaw.v + Math.PI / 2); let x = player.pos.x + s * 3, z = player.pos.z + c * 3; if (!free(x, z)) { x = player.pos.x - s * 3; z = player.pos.z - c * 3; }
    const v = X.makeCar(false, J.veh); v.position.set(x, TH(x, z), z); v.userData.heading = camYaw.v + Math.PI; v.rotation.y = camYaw.v + Math.PI; v.userData.mode = 'parked'; v.userData.nebenjob = true; scene.add(v); cars.push(v); shootables.push(v); return v; }

  function next() { const a = plan(job.id); if (!a) { showMsg('KEIN AUFTRAG GEFUNDEN', 1500); return stop(); } job.auftrag = { ...a, i: 0 };
    WEG.route({ pts: a.pts, get i() { return job && job.auftrag ? job.auftrag.i : 0; }, label: a.label }); }

  function start(id) { const J = JOBS[id]; if (!J || job) return false; if (!WEG.frei()) return false;
    job = { id, J, done: 0, veh: player.car && J.ok(player.car.userData) ? player.car : spawnVeh(J), t0: performance.now() };
    sfx('bell', 0.5); card(J.name.toUpperCase(), `${J.n} ${J.n > 1 ? 'Aufträge' : 'Route'} · ${player.car && J.ok(player.car.userData) ? 'los geht’s' : 'Dienstfahrzeug steht neben dir (E)'} · dem grünen Strahl folgen`, 5);
    next(); return true; }

  function stop() { if (!job) return; const j = job; job = null; WEG.route(null); if (j.done > 0) { stats.schichten++; if (X.emit) X.emit('schicht', player.pos, { job: j.id, n: j.done }); card('FEIERABEND', `${j.J.name}: ${j.done} ${j.done > 1 ? 'Aufträge' : 'Auftrag'} erledigt`, 5); } else showMsg('SCHICHT BEENDET', 1200); }

  function pay() { const J = job.J; job.done++; stats.auftraege++; player.money = (player.money || 0) + J.geld; if (X.PROGRESS_GAIN) X.PROGRESS_GAIN(J.ep, J.name); if (J.fit && X.emit) X.emit('fitness', player.pos, { n: J.fit });
    sfx('pickup'); card('AUFTRAG ERLEDIGT', `+${J.geld} € · +${J.ep} EP${J.fit ? ' · Fitness +' + J.fit : ''} · ${job.done}/${J.n}`, 4);
    WEG.route(null); if (job.done >= J.n) stop(); else next(); }

  function update(dt) { if (!job || !job.auftrag) return; if (player.dead) return stop(); WEG.update(dt);
    const A = job.auftrag, [x, z] = A.pts[A.i], p = here(), d = Math.hypot(x - p.x, z - p.z), u = player.car && player.car.userData;
    const r = job.id === 'rettung' && A.i === 1 ? 25 : 7; if (d > r) return;
    if (!u || !job.J.ok(u)) { if (!job.warnT || performance.now() - job.warnT > 3000) { job.warnT = performance.now(); showMsg(job.J.need, 1500); } return; }
    if (job.id === 'muell' && Math.abs(u.speed || 0) > 3) return; // an der Tonne kurz halten
    A.i++; sfx('click', 0.6);
    if (A.i < A.pts.length) showMsg(job.id === 'kurier' ? 'PAKET ABGEHOLT' : job.id === 'rettung' ? 'PATIENT AN BORD · ZUR ' + (A.klinik || 'KLINIK').toUpperCase() : `TONNE ${A.i}/${A.pts.length} GELEERT`, 1400);
    else pay(); }

  return { update, start, stop, JOBS, stats, get job() { return job; }, weg: WEG };
}

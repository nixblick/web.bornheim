// Wegweiser für Läufe (André 13.11.2026: „Laufrunde sichtbar machen“): hoher grüner Lichtstrahl am nächsten Wegpunkt wie die Story-Strahlen,
// Strecke als Linie auf Minikarte, Pausenkarte und großer Karte mit hervorgehobenem nächsten Punkt, Entfernung und Richtung oben im Spielbild.
// Genutzt von laufrunden.js und eulen.js. route() setzt die aktive Strecke (pts = [[x, z], …], i = nächster Punkt), route(null) blendet alles aus.
/** @param {import('./types').Ctx} X */
export function initWegweiser(X) {
  const { THREE, scene, player, TH, camYaw } = X;
  const COL = 0x3ad17a, CSS = '#3ad17a';
  let cur = null; const drawn = { mm: 0, map: 0 };

  // Strahl: hohe Säule (additiv, 90 m), breiter Bodenring, schwebender Pfeil
  const beam = (() => { const g = new THREE.Group(); g.userData.mats = [];
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 90, 12, 1, true), new THREE.MeshBasicMaterial({ color: COL, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); b.position.y = 45; g.userData.mats = [b.material];
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 90, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xc8ffd8, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })); core.position.y = 45; g.userData.mats.push(core.material);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.42, 10, 40), new THREE.MeshBasicMaterial({ color: COL, transparent: true, opacity: 0.95, depthWrite: false })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.5;
    const disc = new THREE.Mesh(new THREE.RingGeometry(0.4, 3.4, 40), new THREE.MeshBasicMaterial({ color: COL, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide })); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.08;
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.4, 4), new THREE.MeshBasicMaterial({ color: COL })); arrow.rotation.x = Math.PI; arrow.position.y = 4;
    g.add(b, core, ring, disc, arrow); Object.assign(g.userData, { ring, arrow }); g.visible = false; scene.add(g); return g; })();

  // Anzeige oben im Spielbild: eigenes Feld unter #obj (das gehört story.js)
  const hud = document.createElement('div'); hud.id = 'wegweiser';
  hud.style.cssText = 'position:absolute;left:50%;top:84px;transform:translateX(-50%);display:none;align-items:center;gap:10px;background:#000b;color:#fff;padding:6px 16px 6px 10px;border-radius:12px;font:700 17px system-ui;border:2px solid ' + CSS + ';pointer-events:none;z-index:6;white-space:nowrap';
  hud.innerHTML = '<span class="ww-pfeil" style="display:inline-block;color:' + CSS + ';font-size:26px;line-height:1">⬆</span><span class="ww-text"></span>';
  (document.getElementById('hud') || document.body).appendChild(hud);
  const pfeil = /** @type {HTMLElement} */ (hud.querySelector('.ww-pfeil')), text = /** @type {HTMLElement} */ (hud.querySelector('.ww-text'));
  let lastTxt = '';

  // Richtung relativ zur Blickrichtung wie auf der Minikarte (rotate(yaw + π) legt vorwärts nach oben), als Drehung im Uhrzeigersinn
  const relAngle = (dx, dz) => { const t = camYaw.v + Math.PI, x = dx * Math.cos(t) - dz * Math.sin(t), y = dx * Math.sin(t) + dz * Math.cos(t); return Math.atan2(x, -y); };

  function route(r) { cur = r; beam.visible = !!r; hud.style.display = r ? 'flex' : 'none'; if (!r) lastTxt = ''; }
  // Nicht unter #obj (Willkommen/Auftrag, kann zweizeilig sein) rutschen: Oberkante dynamisch darunter (13.11.2026)
  const objEl = document.getElementById('obj'); let topPx = 84;
  const place = () => { const o = objEl && objEl.style.display !== 'none' && objEl.offsetHeight ? objEl.offsetTop + objEl.offsetHeight + 8 : 40; if (o !== topPx) { topPx = o; hud.style.top = o + 'px'; } };
  // Am Tag geht der additive Strahl im hellen Himmel unter: Deckkraft nach Tageslicht anheben (André 13.11.2026)
  const sun = () => { const d = X.world && X.world.day; return typeof d === 'number' ? Math.max(0, Math.min(1, d)) : 0.5; };
  function update(dt) { if (!cur || !cur.pts[cur.i]) return; place(); { const k = sun(), [mb, mc] = beam.userData.mats; mb.opacity = 0.28 + 0.37 * k; mc.opacity = 0.5 + 0.45 * k; const sc = 1 + 0.5 * k; beam.children[0].scale.set(sc, 1, sc); } const [x, z] = cur.pts[cur.i]; const here = player.car ? player.car.position : player.pos;
    beam.position.set(x, TH(x, z), z); beam.userData.ring.rotation.z += dt * 1.5; beam.userData.arrow.position.y = 4 + Math.sin(performance.now() / 300) * 0.4; beam.userData.arrow.rotation.y += dt * 2;
    const dx = x - here.x, dz = z - here.z, d = Math.hypot(dx, dz);
    pfeil.style.transform = `rotate(${relAngle(dx, dz).toFixed(2)}rad)`;
    const t = `${cur.label} · Punkt ${cur.i + 1 - (cur.off || 0)}/${cur.pts.length - (cur.off || 0)} · ${d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1).replace('.', ',') + ' km'}`; if (t !== lastTxt) { lastTxt = t; text.textContent = t; } }

  // Strecke auf einer Karte: erledigte Abschnitte blass, Rest kräftig, nächster Punkt groß mit Rand; R = Kartenradius (Minikarte) zum Anheften am Rand
  function draw(ctx, P, R) { if (!cur) return; const pts = cur.pts, from = cur.from || null; ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const line = (a, b, w, col, al) => { if (b - a < 1) return; ctx.globalAlpha = al; ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); for (let k = a; k <= b; k++) { const q = k < 0 ? from : pts[k]; if (!q) continue; const [x, y] = P(q[0], q[1]); k === a ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke(); };
    const s0 = from ? -1 : 0; line(s0, cur.i, 3, '#9fe8b8', 0.45); line(Math.max(s0, cur.i - 1), pts.length - 1, 7, '#0b3d1e', 0.9); line(Math.max(s0, cur.i - 1), pts.length - 1, 4, CSS, 1);
    ctx.globalAlpha = 1; for (let k = cur.i + 1; k < pts.length; k++) { if (cur.big && k % 5) continue; const [x, y] = P(pts[k][0], pts[k][1]); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#0b3d1e'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fill(); ctx.stroke(); }
    let [x, y] = P(pts[cur.i][0], pts[cur.i][1]); if (R) { const L = Math.hypot(x, y); if (L > R) { x *= R / L; y *= R / L; } }
    const pulse = 1 + Math.sin(performance.now() / 200) * 0.15; ctx.fillStyle = CSS; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, 8 * pulse, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#04210f'; ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(cur.i + 1 - (cur.off || 0)), x, y + 0.5); ctx.restore(); }
  X.mmHooks.push((ctx, P, R) => { if (cur) { draw(ctx, P, R); drawn.mm++; } });
  if (X.mapHooks) X.mapHooks.push((ctx, P) => { if (cur) { draw(ctx, P, 0); drawn.map++; } });

  return { route, update, beam, hud, drawn, get cur() { return cur; } };
}

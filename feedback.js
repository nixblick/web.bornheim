// Feedback: „Senden“ schickt Beschreibung, Spielzustand und optional ein Bildschirmfoto an unseren Dienst
// (relay.geolage.de/bornheim, legt das GitHub-Issue an; kein Konto, keine Mail, kein Token im Client).
// Geht das nicht (Netz, 429, Fehler), bleiben GitHub-Link, Teilen und E-Mail als Ausweich. Nichts geht ohne Klick raus.
const REPO = 'https://github.com/nixblick/web.bornheim';
const ENDPOINT = 'https://relay.geolage.de/bornheim/feedback';
const MAX_BILD = 1400 * 1024; // Dienst nimmt bis 1,5 MB JPEG (dekodiert), etwas Luft
const MAIL = 'service@creavisions.de';
// Fehler überleben einen Absturz: im localStorage, beim nächsten Start als „vorige Sitzung“ im Bericht
const LS = 'bornheim_fehler';
let prevErrors = []; try { prevErrors = JSON.parse(localStorage.getItem(LS) || '[]').slice(-5); localStorage.removeItem(LS); } catch (e) {}
const errors = [];
function logErr(msg) { errors.push(new Date().toTimeString().slice(0, 8) + ' ' + msg); if (errors.length > 5) errors.shift(); try { localStorage.setItem(LS, JSON.stringify(errors)); } catch (e) {} }
addEventListener('error', e => logErr(String(e.message || e.error || 'Fehler').slice(0, 160) + (e.filename ? ' @ ' + e.filename.split('/').pop() + ':' + e.lineno : '')));
addEventListener('unhandledrejection', e => logErr('Promise: ' + String(e.reason && (e.reason.message || e.reason)).slice(0, 160)));
// Grafik verloren (GPU-Speicher, Treiber): das Ereignis bubbelt nicht, aber die Capture-Phase am window sieht es
addEventListener('webglcontextlost', () => { logErr('WebGL-Kontext verloren' + (performance.memory ? ', JS-Heap ' + (performance.memory.usedJSHeapSize / 1048576).toFixed(0) + ' MB' : '')); showLost(); }, true);
addEventListener('webglcontextrestored', () => { const d = document.getElementById('gl_lost'); if (d) d.remove(); }, true);
function showLost() {
  if (document.getElementById('gl_lost')) return;
  if (document.pointerLockElement) document.exitPointerLock();
  const d = document.createElement('div'); d.id = 'gl_lost';
  d.style.cssText = 'position:fixed;inset:0;z-index:49;display:flex;align-items:center;justify-content:center;background:#000c;color:#eee;font:15px system-ui,sans-serif;text-align:center;padding:16px';
  d.innerHTML = '<div><h3 style="margin:0 0 8px">Die Grafik ist abgestürzt</h3><p style="color:#aaa;margin:0 0 14px">Meist ist der Grafikspeicher voll. Dein Spielstand ist gespeichert.</p><button id="gl_reload" style="background:#ffd84a;color:#111;border:0;border-radius:8px;padding:9px 14px;font:600 14px system-ui;cursor:pointer;margin:4px">Neu laden</button><button id="gl_report" style="background:#2a2d35;color:#eee;border:1px solid #444;border-radius:8px;padding:9px 14px;font:600 14px system-ui;cursor:pointer;margin:4px">Fehler melden</button></div>';
  document.body.appendChild(d);
  document.getElementById('gl_reload').onclick = () => location.reload();
  document.getElementById('gl_report').onclick = () => { $('fb_title').value = 'Grafik abgestürzt'; openFeedback(); };
}
const css = `#fb{position:fixed;inset:0;background:#000a;display:none;align-items:center;justify-content:center;z-index:50;font-family:system-ui,sans-serif}
#fb .box{background:#16181d;color:#eee;border:1px solid #333;border-radius:12px;padding:18px 20px;width:min(520px,92vw)}
#fb h3{margin:0 0 10px;font-size:18px}#fb p{font-size:13px;color:#aaa;margin:6px 0}
#fb select,#fb input,#fb textarea{width:100%;box-sizing:border-box;background:#0d0e11;color:#eee;border:1px solid #444;border-radius:8px;padding:8px;font:14px system-ui;margin:4px 0 8px}
#fb textarea{height:110px;resize:vertical}#fb .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}
#fb button{background:#2a2d35;color:#eee;border:1px solid #444;border-radius:8px;padding:9px 14px;font:600 14px system-ui;cursor:pointer}#fb button.y{background:#ffd84a;color:#111;border-color:#ffd84a}
#fb label{font-size:13px;color:#ccc;display:flex;gap:6px;align-items:center}#fb label input{width:auto;margin:0}`;
const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
const el = document.createElement('div'); el.id = 'fb';
el.innerHTML = `<div class="box"><h3>Fehler melden oder Idee schicken</h3>
<select id="fb_kind"><option value="Fehler">Fehler – etwas funktioniert nicht</option><option value="Idee">Idee – das wäre cool</option></select>
<input id="fb_title" maxlength="90" placeholder="Kurz: Was ist los? z. B. Granate zerstört keine Autos">
<textarea id="fb_text" placeholder="Was hast du gemacht, was ist passiert, was hättest du erwartet?"></textarea>
<div id="fb_shotrow" style="display:none;gap:10px;align-items:center;margin:2px 0 8px"><img id="fb_shot" alt="Bildschirmfoto" style="width:120px;border-radius:6px;border:1px solid #444"><label><input type="checkbox" id="fb_useshot" checked> Bildschirmfoto mitschicken</label></div>
<label><input type="checkbox" id="fb_info" checked> Technische Infos anhängen (Browser, Grafik, Position, letzte Fehlermeldungen)</label>
<div class="row"><button class="y" id="fb_send">Senden</button><button id="fb_close">Abbrechen</button></div>
<p id="fb_hint" aria-live="polite"></p>
<p id="fb_what">Gesendet werden nur dein Text, der Spielzustand (falls angehakt) und das Bild (falls angehakt), öffentlich als Issue auf GitHub. Bitte keinen Namen, keine Mail-Adresse oder Ähnliches eintragen.</p>
<p id="fb_alt" style="display:none;margin-top:12px">Andere Wege: <a href="#" id="fb_gh" style="color:#ffd84a">auf GitHub melden</a> (Bild liegt dann in der Zwischenablage, mit Strg+V einfügen), <a href="#" id="fb_share" style="color:#ffd84a">teilen</a> oder <a href="#" id="fb_mail" style="color:#ffd84a">per E-Mail</a>.</p></div>`;
document.body.appendChild(el);
const $ = id => document.getElementById(id);
// Diagnose (André 14.11.2026: „besser verstehen, was bei Usern schiefläuft“): einmal je Sekunde prüft ein Wächter, ob etwas
// offensichtlich nicht stimmt (Figur oder Auto steht in einem Haus, Bildrate bricht ein), und merkt sich Ort und Uhrzeit.
// Das bleibt im Browser und geht nur mit dem Feedback raus, wenn „Spielzustand mitschicken“ angehakt ist – wie die Fehlermeldungen.
const diag = [], dSeen = new WeakSet(); let dRaf = 0, dRaf0 = 0, dT = performance.now(), dFpsSum = 0, dFpsN = 0, dFpsMin = 1e9, dImHaus = 0, dLangsam = 0;
function dlog(msg) { diag.push(new Date().toTimeString().slice(0, 8) + ' ' + msg); if (diag.length > 20) diag.shift(); }
(function dTick() { dRaf++; requestAnimationFrame(dTick); })();
setInterval(() => { try {
  const G = /** @type {any} */ (window).G, now = performance.now(), menu = document.getElementById('menu');
  const pause = !G || !G.player || !(/** @type {any} */ (window).__started) || document.hidden || (menu && menu.style.display === 'flex');
  const fps = (dRaf - dRaf0) * 1000 / Math.max(1, now - dT); dRaf0 = dRaf; dT = now; if (pause) { dLangsam = 0; return; }
  dFpsSum += fps; dFpsN++; if (dFpsN > 5 && fps < dFpsMin) dFpsMin = fps;
  if (fps < 12) { if (++dLangsam === 5) dlog(`Bildrate seit 5 s unter 12 (jetzt ${fps.toFixed(0)}/s, Stufe ${G.opts.quality})`); } else dLangsam = 0;
  const p = G.player, P = p.pos, ort = (x, z) => `x ${x.toFixed(0)}, z ${z.toFixed(0)}`;
  if ((G.INTERIORS && G.INTERIORS.inside) || (G.creative && G.creative.on) || (G.X && G.X.inPocket && G.X.inPocket(P.x, P.z))) return;
  if (!p.car) { if (G.solidAt(P.x, P.z) >= 0 && P.y - G.TH(P.x, P.z) < 2) { if (++dImHaus === 2) dlog('Figur steht in einem Haus: ' + ort(P.x, P.z)); } else dImHaus = 0; }
  else if (!dSeen.has(p.car) && Math.abs(p.car.userData.speed || 0) < 2) { const c = p.car, h = c.userData.heading || 0, L = 1.6; let n = 0; for (const s of [-L, 0, L]) if (G.solidAt(c.position.x + Math.sin(h) * s, c.position.z + Math.cos(h) * s) >= 0) n++; if (n >= 2) { dSeen.add(c); dlog('Eigenes Fahrzeug steckt in einem Haus: ' + ort(c.position.x, c.position.z)); } }
  for (const c of G.cars) { if (c === p.car || !c.visible || dSeen.has(c)) continue; const dx = c.position.x - P.x, dz = c.position.z - P.z; if (dx * dx + dz * dz > 3600) continue;
    if (G.solidAt(c.position.x, c.position.z) >= 0) { dSeen.add(c); dlog(`Auto (${c.userData.mode || '?'}) steht in einem Haus: ` + ort(c.position.x, c.position.z)); } }
} catch (e) { /* Diagnose darf das Spiel nie stören */ } }, 1000);
function info() {
  const G = window.G; const lines = [];
  lines.push('- Seite: ' + location.href.split('?')[0]);
  lines.push('- Browser: ' + navigator.userAgent);
  try { if (G) { const gl = G.renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info'); lines.push('- Grafik: ' + (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '?') + ', Stufe ' + G.opts.quality + ', ' + innerWidth + 'x' + innerHeight); } } catch (e) {}
  try { if (G) { const p = G.player.pos; lines.push(`- Position: x ${p.x.toFixed(0)}, z ${p.z.toFixed(0)} (${document.getElementById('street')?.textContent || '?'})` + (G.player.car ? ', im Fahrzeug' : '') + (G.creative?.on ? ', Kreativmodus' : '')); lines.push(`- Waffe: ${G.WPN?.cur || '?'}, Uhrzeit ${G.world.hour.toFixed(1)}, Wetter ${G.weather.kind}`); const s = G.STORY?.S; if (s && s.state === 'active') lines.push('- Story: ' + (G.STORY.sid || '') + ' Kapitel ' + ((s.ch ?? 0) + 1)); } } catch (e) {}
  const list = (h, a) => { if (a.length) { lines.push(h); for (const e of a) lines.push('  - `' + e.replace(/`/g, "'") + '`'); } };
  try { if (G) lines.push(`- Gerät: ${/** @type {any} */ (window).__touch ? 'Touch' : 'Maus/Tastatur'}, Pixelverhältnis ${devicePixelRatio || 1} (gerendert ${G.renderer.getPixelRatio().toFixed(2)}), Sichtweite ${G.opts.view}, Bildrate Ø ${dFpsN ? (dFpsSum / dFpsN).toFixed(0) : '?'}/s, schlechteste Sekunde ${dFpsMin < 1e9 ? dFpsMin.toFixed(0) : '?'}/s`); } catch (e) {}
  list('- Automatisch erkannt:', diag);
  list('- Letzte Fehlermeldungen:', errors); list('- Vorige Sitzung (vor Neustart/Absturz):', prevErrors);
  return lines.join('\n');
}
function compose() {
  const kind = $('fb_kind').value, title = ($('fb_title').value.trim() || (kind === 'Fehler' ? 'Fehler im Spiel' : 'Idee'));
  const body = ($('fb_text').value.trim() || '(keine Beschreibung)') + ($('fb_info').checked ? '\n\n---\n' + info() : '');
  return { title: `[${kind}] ${title}`, body: body.slice(0, 5500), kind };
}
let wasLocked = false, shotBlob = null, shotCanvas = null;
// Bildschirmfoto: direkt nach einem eigenen render() lesen, sonst ist der WebGL-Puffer leer
function takeShot() {
  shotBlob = null; shotCanvas = null; $('fb_shotrow').style.display = 'none';
  try {
    const G = window.G; if (!G || !G.renderer) return;
    const r = G.composerRef?.(); if (r) r.render(); else G.renderer.render(G.scene, G.camera);
    const src = G.renderer.domElement, k = Math.min(1, 1280 / src.width), c = document.createElement('canvas');
    c.width = Math.round(src.width * k); c.height = Math.round(src.height * k); c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); shotCanvas = c;
    c.toBlob(b => { if (!b) return; shotBlob = b; $('fb_shot').src = URL.createObjectURL(b); $('fb_shotrow').style.display = 'flex'; }, 'image/jpeg', 0.85);
  } catch (e) {}
}
const shotFile = () => shotBlob && $('fb_useshot').checked ? new File([shotBlob], 'bornheim-bildschirmfoto.jpg', { type: 'image/jpeg' }) : null;
const canShareFiles = () => { try { return !!navigator.canShare && navigator.canShare({ files: [new File([''], 'x.jpg', { type: 'image/jpeg' })] }); } catch (e) { return false; } };
// Bild für den Dienst: JPEG-dataURL unter MAX_BILD, notfalls kleiner und gröber
function shotDataUrl() {
  if (!shotCanvas || !$('fb_useshot').checked) return null;
  for (const [k, q] of [[1, 0.85], [1, 0.6], [0.7, 0.6], [0.5, 0.5]]) {
    let c = shotCanvas;
    if (k < 1) { c = document.createElement('canvas'); c.width = Math.round(shotCanvas.width * k); c.height = Math.round(shotCanvas.height * k); c.getContext('2d').drawImage(shotCanvas, 0, 0, c.width, c.height); }
    const d = c.toDataURL('image/jpeg', q);
    if (d.startsWith('data:image/jpeg;base64,') && (d.length - 23) * 0.75 < MAX_BILD) return d;
  }
  return null;
}
function showAlt(msg) { $('fb_hint').textContent = msg; $('fb_alt').style.display = ''; }
export function openFeedback() { delete el.dataset.gesendet; if (document.pointerLockElement) { wasLocked = true; document.exitPointerLock(); } takeShot(); $('fb_hint').textContent = ''; $('fb_alt').style.display = 'none'; $('fb_send').disabled = false; $('fb_close').textContent = 'Abbrechen'; $('fb_share').style.display = navigator.share ? '' : 'none'; /* GitHub ist der Hauptweg, Mail nur Ausweich (André 13.11.2026) */ el.style.display = 'flex'; setTimeout(() => $('fb_title').focus(), 50); }
function close() { el.style.display = 'none'; }
$('fb_close').onclick = close; el.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') close(); }); el.addEventListener('keyup', e => e.stopPropagation());
function download(f) { const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); }
$('fb_share').onclick = async ev => { ev.preventDefault();
  const c = compose(), f = shotFile(), data = { title: 'Bornheim: ' + c.title, text: `Bornheim-Spiel: ${c.title}\n\n${c.body.slice(0, 3000)}\n\n(bitte an ${MAIL})` };
  if (f && canShareFiles()) data.files = [f];
  try { await navigator.share(data); close(); }
  catch (e) { if (e.name !== 'AbortError') $('fb_hint').textContent = 'Teilen ging nicht – bitte „Per E-Mail schicken“ nehmen.'; }
};
$('fb_mail').onclick = ev => { ev.preventDefault();
  const c = compose(), f = shotFile(); let body = c.body.slice(0, 1800);
  if (f) { download(f); body = 'Das Bildschirmfoto ist gerade heruntergeladen worden (bornheim-bildschirmfoto.jpg) – bitte an diese Mail anhängen.\n\n' + body; }
  location.href = `mailto:${MAIL}?subject=${encodeURIComponent('Bornheim: ' + c.title)}&body=${encodeURIComponent(body)}`;
  $('fb_hint').textContent = f ? 'Dein Mailprogramm öffnet sich. Das Bild liegt in deinen Downloads – bitte anhängen.' : 'Dein Mailprogramm öffnet sich.';
};
$('fb_send').onclick = async ev => {
  ev.preventDefault(); const b = $('fb_send'); if (b.disabled) return;
  if (el.dataset.gesendet && !$('fb_title').value.trim() && !$('fb_text').value.trim()) { $('fb_hint').textContent = 'Schon gesendet. Für eine weitere Meldung bitte kurz beschreiben, was los ist.'; return; } // leeres Doppel nach dem Senden verhindern
  delete el.dataset.gesendet;
  const kind = $('fb_kind').value;
  const payload = { kind: 'feedback', typ: kind === 'Fehler' ? 'bug' : 'idee', titel: ($('fb_title').value.trim() || (kind === 'Fehler' ? 'Fehler im Spiel' : 'Idee')).slice(0, 120),
    text: ($('fb_text').value.trim() || '(keine Beschreibung)').slice(0, 5000), zustand: $('fb_info').checked ? info().slice(0, 4000) : '' };
  const bild = shotDataUrl(); if (bild) payload.bild = bild;
  b.disabled = true; $('fb_hint').textContent = 'Wird gesendet …';
  let res, data = null;
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 20000);
    res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: ctl.signal, credentials: 'omit' });
    clearTimeout(t); try { data = await res.json(); } catch (e) {}
  } catch (e) { b.disabled = false; showAlt('Senden ging gerade nicht (keine Verbindung). Bitte einen der anderen Wege nehmen:'); return; }
  if (res.ok && data && data.ok) {
    const h = $('fb_hint'); h.textContent = '';
    const url = typeof data.issue === 'string' && /^https:\/\/github\.com\/nixblick\/web\.bornheim\/issues\/\d+$/.test(data.issue) ? data.issue : null;
    if (url) { h.append('Danke! Gemeldet: '); const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.style.color = '#ffd84a'; a.textContent = url.replace('https://github.com/nixblick/web.bornheim/issues/', 'Issue #'); h.append(a); }
    else h.textContent = 'Danke! Deine Meldung ist angekommen.';
    $('fb_title').value = ''; $('fb_text').value = '';
    // #236/#237: nach dem Senden „Schließen“ statt „Abbrechen“, und eine neue Meldung lässt sich gleich wieder senden (der Knopf blieb gesperrt)
    $('fb_close').textContent = 'Schließen'; b.disabled = false; el.dataset.gesendet = '1';
    setTimeout(() => { if (el.style.display === 'flex' && el.dataset.gesendet) close(); }, 2500); // nach dem Senden schließt sich das Fenster von selbst (André 14.11.2026)
    return;
  }
  b.disabled = false;
  showAlt(res.status === 429 ? 'Gerade kommen zu viele Meldungen an, bitte später noch einmal oder einen der anderen Wege nehmen:' : 'Senden ging nicht (Fehler ' + res.status + '). Bitte einen der anderen Wege nehmen:');
};
$('fb_gh').onclick = async ev => {
  ev.preventDefault(); const c = compose(), f = shotFile();
  if (f) { try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': toPng(f) })]); } catch (e) { download(f); } }
  const url = `${REPO}/issues/new?title=${encodeURIComponent(c.title)}&body=${encodeURIComponent(c.body)}&labels=${encodeURIComponent(c.kind === 'Fehler' ? 'bug' : 'enhancement')}`; open(url, '_blank', 'noopener'); close();
};
// Zwischenablage nimmt nur PNG
async function toPng(b) { const i = await createImageBitmap(b), c = document.createElement('canvas'); c.width = i.width; c.height = i.height; c.getContext('2d').drawImage(i, 0, 0); return new Promise(r => c.toBlob(r, 'image/png')); }
for (const id of ['m_feedback', 's_feedback']) { const b = $(id); if (b) b.onclick = openFeedback; }
window.openFeedback = openFeedback;

// Spielzeit-Marken für die anonyme Zählung (nixblick Analytics zählt Klicks auf Elemente mit data-track)
{ const marks = [10, 30, 60]; let sec = 0; const btn = document.createElement('button'); btn.style.display = 'none'; document.body.appendChild(btn);
  setInterval(() => { const G = window.G; if (!G || !G.player || !G.player.mesh || document.hidden) return; sec += 15; const m = marks.find(m => sec === m * 60); if (m) { btn.setAttribute('data-track', 'spielzeit-' + m); btn.click(); } }, 15000); }

// Kleiner Feedback-Knopf im Spielbild (André 14.11.2026: „gleich an der Stelle, wo man ist, draufklicken: Bildschirmfoto und Feedback“).
// Desktop unten rechts über dem Straßennamen, Touch oben in der Knopfreihe. Nur im laufenden Spiel, nicht im Menü und nicht im Handy.
{ const b = document.createElement('button'); b.id = 'fbbtn'; b.textContent = '🐞'; b.title = 'Fehler melden (mit Bildschirmfoto dieser Stelle)'; b.setAttribute('aria-label', 'Fehler melden');
  const touch = !!(/** @type {any} */ (window).__touch);
  b.style.cssText = 'position:fixed;z-index:19;width:38px;height:38px;border-radius:10px;border:1px solid #ffffff55;background:#000000a0;color:#fff;font-size:18px;cursor:pointer;display:none;padding:0;' +
    (touch ? 'top:calc(8px + env(safe-area-inset-top,0px));right:calc(192px + env(safe-area-inset-right,0px));' : 'right:18px;bottom:64px;');
  const auf = e => { e.preventDefault(); e.stopPropagation(); openFeedback(); };
  b.addEventListener('click', auf); if (touch) b.addEventListener('touchend', auf, { passive: false }); b.addEventListener('mousedown', e => e.stopPropagation());
  document.body.appendChild(b);
  setInterval(() => { const m = document.getElementById('menu'), ph = document.getElementById('phone'); const an = !!(/** @type {any} */ (window).__started) && !(m && m.style.display === 'flex') && !(ph && ph.style.display === 'block') && el.style.display !== 'flex'; const v = an ? 'block' : 'none'; if (b.style.display !== v) b.style.display = v; }, 500);
}

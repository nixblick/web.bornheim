// Feedback: öffnet ein vorausgefülltes GitHub-Issue (oder eine E-Mail) mit Beschreibung und Spielzustand.
// Keine Daten gehen ohne Klick des Spielers raus; das Issue legt der Spieler selbst auf GitHub an.
const REPO = 'https://github.com/nixblick/web.bornheim';
const MAIL = 'mail@andrehinz.de';
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
<label><input type="checkbox" id="fb_info" checked> Technische Infos anhängen (Browser, Grafik, Position im Spiel, letzte Fehlermeldungen)</label>
<p>„Auf GitHub melden“ öffnet ein vorausgefülltes Issue, dafür brauchst du ein kostenloses GitHub-Konto. Ohne Konto geht es per E-Mail.</p>
<div class="row"><button class="y" id="fb_gh">Auf GitHub melden</button><button id="fb_mail">Per E-Mail</button><button id="fb_close">Abbrechen</button></div></div>`;
document.body.appendChild(el);
const $ = id => document.getElementById(id);
function info() {
  const G = window.G; const lines = [];
  lines.push('- Seite: ' + location.href.split('?')[0]);
  lines.push('- Browser: ' + navigator.userAgent);
  try { if (G) { const gl = G.renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info'); lines.push('- Grafik: ' + (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '?') + ', Stufe ' + G.opts.quality + ', ' + innerWidth + 'x' + innerHeight); } } catch (e) {}
  try { if (G) { const p = G.player.pos; lines.push(`- Position: x ${p.x.toFixed(0)}, z ${p.z.toFixed(0)} (${document.getElementById('street')?.textContent || '?'})` + (G.player.car ? ', im Fahrzeug' : '') + (G.creative?.on ? ', Kreativmodus' : '')); lines.push(`- Waffe: ${G.WPN?.cur || '?'}, Uhrzeit ${G.world.hour.toFixed(1)}, Wetter ${G.weather.kind}`); const s = G.STORY?.S; if (s && s.state === 'active') lines.push('- Story: ' + (G.STORY.sid || '') + ' Kapitel ' + ((s.ch ?? 0) + 1)); } } catch (e) {}
  const list = (h, a) => { if (a.length) { lines.push(h); for (const e of a) lines.push('  - `' + e.replace(/`/g, "'") + '`'); } };
  list('- Letzte Fehlermeldungen:', errors); list('- Vorige Sitzung (vor Neustart/Absturz):', prevErrors);
  return lines.join('\n');
}
function compose() {
  const kind = $('fb_kind').value, title = ($('fb_title').value.trim() || (kind === 'Fehler' ? 'Fehler im Spiel' : 'Idee'));
  const body = ($('fb_text').value.trim() || '(keine Beschreibung)') + ($('fb_info').checked ? '\n\n---\n' + info() : '');
  return { title: `[${kind}] ${title}`, body: body.slice(0, 5500), kind };
}
let wasLocked = false;
export function openFeedback() { if (document.pointerLockElement) { wasLocked = true; document.exitPointerLock(); } el.style.display = 'flex'; setTimeout(() => $('fb_title').focus(), 50); }
function close() { el.style.display = 'none'; }
$('fb_close').onclick = close; el.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') close(); }); el.addEventListener('keyup', e => e.stopPropagation());
$('fb_gh').onclick = () => { const c = compose(); const url = `${REPO}/issues/new?title=${encodeURIComponent(c.title)}&body=${encodeURIComponent(c.body)}&labels=${encodeURIComponent(c.kind === 'Fehler' ? 'bug' : 'enhancement')}`; open(url, '_blank', 'noopener'); close(); };
$('fb_mail').onclick = () => { const c = compose(); location.href = `mailto:${MAIL}?subject=${encodeURIComponent('Bornheim: ' + c.title)}&body=${encodeURIComponent(c.body.slice(0, 1800))}`; close(); };
for (const id of ['m_feedback', 's_feedback']) { const b = $(id); if (b) b.onclick = openFeedback; }
window.openFeedback = openFeedback;

// Spielzeit-Marken für die anonyme Zählung (nixblick Analytics zählt Klicks auf Elemente mit data-track)
{ const marks = [10, 30, 60]; let sec = 0; const btn = document.createElement('button'); btn.style.display = 'none'; document.body.appendChild(btn);
  setInterval(() => { const G = window.G; if (!G || !G.player || !G.player.mesh || document.hidden) return; sec += 15; const m = marks.find(m => sec === m * 60); if (m) { btn.setAttribute('data-track', 'spielzeit-' + m); btn.click(); } }, 15000); }

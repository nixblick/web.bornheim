// Gezielte Probe im echten Spiel per Chrome DevTools Protocol, ohne Abhängigkeiten (Node 22).
//   node tools/probe.mjs <proben.json> <ausgabeordner> [chrome-pfad] [url]
// Fertiges Werkzeug für Nachtläufe (13.11.2026: eine Runde verbrachte die ganze Nacht mit dem Bau ihres eigenen
// Testskripts). Runden schreiben nur noch eine JSON-Datei mit Schritten, nicht das Werkzeug.
// Ohne url startet es selbst einen Webserver im Repo (freier Port) und beendet ihn am Ende.
// Harte Grenzen: 20 min gesamt, 60 s je Auswertung. Exit 0 = alles ok, 1 = Fehler/Erwartung verfehlt, 2 = Zeit um.
// Lokal NUR im Nachtfenster 22–06 Uhr (CLAUDE.md).
//
// Schritt (alle Felder optional außer n):
//   n      Name, zugleich Bildname
//   x, z   hinspringen (lädt Kacheln), y Höhe (sonst Gelände), hour Uhrzeit (13), tx/tz Blickziel, pitch
//   ride   [von, nach] Stations-IDs aus data/metro.json fahren; von "" = nächste Station zum Spieler
//   leave  true: Station verlassen (nach ride)
//   js     Ausdruck auswerten und ausgeben (Zugriff über window.G)
//   expect Ausdruck, muss wahr sein, sonst zählt die Probe als rot
//   wait   ms warten vor dem Bild (5000), shot false = kein Bild
import { spawn } from 'node:child_process'; import { writeFileSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs';
import { createServer } from 'node:net'; import { dirname, resolve } from 'node:path'; import { fileURLToPath } from 'node:url';
const [STEPS, OUT, B = process.env.CHROME || 'chromium-browser', URL0] = process.argv.slice(2);
if (!STEPS || !OUT) { console.log('node tools/probe.mjs <proben.json> <ausgabeordner> [chrome] [url]'); process.exit(1); }
mkdirSync(OUT, { recursive: true }); const steps = JSON.parse(readFileSync(STEPS, 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = s => { const l = new Date().toTimeString().slice(0, 5) + ' ' + s; console.log(l); appendFileSync(`${OUT}/stand.txt`, l + '\n'); };
const freePort = () => new Promise(r => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
const kids = []; let code = 0;
const ende = c => { for (const k of kids) try { k.kill(); } catch (e) { /* schon weg */ } process.exit(c); };
setTimeout(() => { log('ZEIT UM (20 min)'); ende(2); }, 20 * 60 * 1000).unref();
let URL = URL0;
if (!URL) { const port = await freePort(); const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  kids.push(spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' })); URL = `http://127.0.0.1:${port}/play.html`; }
const dport = await freePort();
const ch = spawn(B, ['--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720', `--remote-debugging-port=${dport}`, `--user-data-dir=${OUT}/prof`, 'about:blank'], { stdio: 'ignore' }); kids.push(ch);
try {
  let tl = null; for (let i = 0; i < 40 && !tl; i++) { await sleep(1000); try { tl = await (await fetch(`http://127.0.0.1:${dport}/json`)).json(); } catch (e) { tl = null; } }
  if (!tl) throw new Error('Chrome nicht erreichbar');
  const ws = new WebSocket(tl.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => { ws.onopen = r; });
  let id = 0; const pend = new Map(); const errs = [];
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(m.params.args.map(a => a.value || a.description).join(' ')); };
  const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); r({ timeout: true }); } }, 60000); });
  const ev = async x => { const r = await cmd('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
    return r?.timeout ? 'TIMEOUT' : r?.exceptionDetails ? 'EXC ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) : r?.result?.value; };
  const shot = async n => { const r = await cmd('Page.captureScreenshot', { format: 'jpeg', quality: 80 }); if (r?.data) writeFileSync(`${OUT}/${n}.jpg`, Buffer.from(r.data, 'base64')); };
  await cmd('Runtime.enable'); await cmd('Page.enable'); await cmd('Page.navigate', { url: `${URL}?r=${Date.now()}` });
  let ready = false; for (let i = 0; i < 150 && !ready; i++) { await sleep(1000); ready = await ev("document.body.innerText.includes('Frankfurt bereit')") === true; }
  if (!ready) throw new Error('Stadt nach 150 s nicht geladen');
  for (let i = 0; i < 2; i++) { await ev("[...document.querySelectorAll('button')].find(b => /Rein da/.test(b.textContent))?.click()"); await sleep(i ? 5000 : 12000); }
  log('geladen: ' + URL);
  const pos = "(() => { const G = window.G, p = G.player.pos; return JSON.stringify({ x: Math.round(p.x), y: +p.y.toFixed(2), z: Math.round(p.z), drin: !!G.INTERIORS.inside }); })()";
  for (const s of steps) {
    if (s.x !== undefined) await ev(`(async () => { const G = window.G; G.world.hour = ${s.hour ?? 13}; if (G.INTERIORS.inside) G.INTERIORS.leave(); await G.streamInit(${s.x}, ${s.z}); const y = ${s.y ?? 'null'} ?? G.TH(${s.x}, ${s.z}); G.player.pos.set(${s.x}, y, ${s.z}); G.player.vy = 0; if (G.player.mesh) G.player.mesh.position.copy(G.player.pos); })()`);
    if (s.ride) await ev(`(() => { const I = window.G.INTERIORS, M = I.metro, to = I.ST.get(${JSON.stringify(s.ride[1])}); let f = ${JSON.stringify(s.ride[0])} ? I.ST.get(${JSON.stringify(s.ride[0])}) : null;
      if (!f) { let d = 1e12; for (const q of M.stations) { const k = Math.hypot(q.p[0] - window.G.player.pos.x, q.p[1] - window.G.player.pos.z); if (k < d && q.id !== to.id) { d = k; f = q; } } } I.ride(f, to); })()`);
    if (s.ride) await sleep(15000);
    if (s.leave) { await ev('window.G.INTERIORS.inside && window.G.INTERIORS.leave()'); await sleep(6000); }
    await sleep(s.wait ?? 5000);
    if (s.tx !== undefined) await ev(`window.G.camYaw.v = Math.atan2(${s.tx} - window.G.player.pos.x, ${s.tz} - window.G.player.pos.z); window.G.camPitch.v = ${s.pitch ?? 0.2};`);
    let zeile = `${s.n}: ${await ev(pos)}`;
    if (s.js) { const r = await ev(s.js); zeile += ` js=${JSON.stringify(r)}`; if (typeof r === 'string' && /^(EXC|TIMEOUT)/.test(r)) { zeile += ' ROT (Ausnahme)'; code = 1; } }
    if (s.expect) { const ok = await ev(`!!(${s.expect})`) === true; zeile += ok ? ' OK' : ` ROT (${s.expect})`; if (!ok) code = 1; }
    if (s.shot !== false) await shot(s.n);
    log(zeile);
  }
  const e = [...new Set(errs)]; writeFileSync(`${OUT}/fehler.txt`, e.join('\n')); if (e.length) code = 1;
  log(e.length ? `FEHLER (${e.length}):\n${e.slice(0, 10).join('\n')}` : 'keine Fehler'); ws.close();
} catch (e) { log('ABBRUCH: ' + e.message); code = 1; }
ende(code);

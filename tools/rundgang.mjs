// Rundgang durch das echte Spiel (live auf GitHub Pages) per Chrome DevTools Protocol, ohne Abhängigkeiten (Node 22).
//   node tools/rundgang.mjs <ausgabeordner> <chrome-pfad> [start|orte]
// start: Spiel laden, „Rein da“, 20 s laufen lassen, Fehler sammeln, ein Bild. Exit 1 bei Fehlern oder wenn die Stadt nicht lädt.
// orte:  zusätzlich zu festen Orten springen (über window.G) und je Ort ein Bild bei Tag und eins bei Nacht.
// Lokal NUR im Nachtfenster 22–06 Uhr (CLAUDE.md). Auf GitHub läuft „start“ nach jedem Deploy.
import { spawn } from 'node:child_process'; import { writeFileSync, mkdirSync } from 'node:fs';
const [OUT, B, MODE = 'orte'] = process.argv.slice(2); mkdirSync(OUT, { recursive: true });
const URL = process.env.RUNDGANG_URL || 'https://nixblick.github.io/web.bornheim/play.html';
const ORTE = [['woellstaedter', 220, -470], ['tg_bornheim', 262, 52], ['zappbar', -1281, 247], ['nahkauf_eulengasse', 75, -203], ['berger_uhrtuermchen', 0, 0]];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ch = spawn(B, ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720', '--remote-debugging-port=9333', `--user-data-dir=${OUT}/prof`, 'about:blank'], { stdio: 'ignore' });
let code = 0;
try {
  await sleep(3000);
  const tl = await (await fetch('http://127.0.0.1:9333/json')).json(); const ws = new WebSocket(tl.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; }); let id = 0; const pend = new Map(); const errs = [];
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(m.params.args.map(a => a.value || a.description).join(' ')); };
  const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async e => (await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }))?.result?.value;
  const shot = async n => { const r = await cmd('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${OUT}/${n}.png`, Buffer.from(r.data, 'base64')); };
  await cmd('Runtime.enable'); await cmd('Page.enable'); await cmd('Page.navigate', { url: `${URL}?r=${Date.now()}` });
  let ready = false; for (let i = 0; i < 150 && !ready; i++) { await sleep(1000); ready = await ev("document.body.innerText.includes('Frankfurt bereit')"); }
  if (!ready) { errs.push('Stadt nach 150 s nicht geladen'); }
  else {
    await ev("[...document.querySelectorAll('button')].find(b => /Rein da/.test(b.textContent))?.click()"); await sleep(20000); await shot('0_start');
    if (MODE === 'orte') for (const [n, x, z] of ORTE) for (const [tag, h] of [['tag', 13], ['nacht', 22]]) {
      await ev(`(() => { const G = window.G; G.world.hour = ${h}; G.player.pos.set(${x}, G.TH ? G.TH(${x}, ${z}) : G.player.pos.y, ${z}); if (G.player.mesh) G.player.mesh.position.copy(G.player.pos); })()`);
      await sleep(12000); await shot(`${n}_${tag}`); }
  }
  const e = [...new Set(errs)]; writeFileSync(`${OUT}/fehler.txt`, e.join('\n')); console.log(e.length ? `FEHLER:\n${e.join('\n')}` : 'keine Fehler'); if (e.length) code = 1; ws.close();
} finally { ch.kill(); }
process.exit(code);

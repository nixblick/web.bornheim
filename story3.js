// Story 3: „Der Kanzler kommt“ – Sicherheitszone, Bürgerdialog mit Gästeliste, Kolonne gegen Fragen.
// Alle Personen, Ämter, Medien und Accounts sind erfunden. Keine echte Partei, kein echter Politiker. Waffen sind in allen Kapiteln weggeschlossen.
export function story3Chapters(K) {
  const { X, W, D, F } = K;
  const { THREE, scene, player, peds, cars, CITY, TH, solidAt, opts, world, weather, sfx, showMsg, rnd, clamp, pick, playAnim, canvasTex } = X;
  const V3 = THREE.Vector3; const { talk, track, near, npc } = K; const S = () => K.S;
  const { UHR, U0 } = K.places;

  // ---------- Orte aus den Kartendaten ----------
  const roads6 = CITY.roads.filter(r => !r.mw && !r.ry && r.w >= 6);
  const cen = poly => poly.reduce((a, p) => [a[0] + p[0] / poly.length, a[1] + p[1] / poly.length], [0, 0]);
  const sb = CITY.buildings.find(b => b && /Saalbau/.test(b.n || '')); const sbc = sb ? cen(sb.p) : [UHR[0] + 120, UHR[1] - 40];
  const sr = K.nearestOn(roads6, sbc[0], sbc[1]) || U0; const SAAL_ROAD = [sr.x, sr.z, sr.h];
  // Vorplatz: vom Straßenpunkt Richtung Gebäude, erste freie Stelle
  const toward = (from, to, ks) => { const dx = to[0] - from[0], dz = to[1] - from[1], L = Math.hypot(dx, dz) || 1; for (const k of ks) { const x = from[0] + dx / L * k, z = from[1] + dz / L * k; if (solidAt(x, z) < 0 && !X.barrierNear(x, z, 1.5)) return [x, z]; } return D.freeSpot(from[0] + dx / L * ks[0], from[1] + dz / L * ks[0], 2); };
  const SAAL = toward(SAAL_ROAD, sbc, [7, 5, 9, 11, 4]); // Eingang / Bühne
  const SIDE = D.freeSpot(SAAL[0] + Math.cos(sr.h) * 9, SAAL[1] - Math.sin(sr.h) * 9, 2); // Seiteneingang
  // Checkpoint: etwa 90 m von der Bühne weg auf dem Weg zum Uhrtürmchen
  const CP = (() => { const r = D.route(SAAL_ROAD[0], SAAL_ROAD[1], U0.x, U0.z); if (r && r.length > 2) { const tr = D.trailFrom(r); const p = D.posAt(tr, Math.min(tr[tr.length - 1].s * 0.6, 90)); return [p.x, p.z, p.h]; } const dx = U0.x - SAAL_ROAD[0], dz = U0.z - SAAL_ROAD[1], L = Math.hypot(dx, dz) || 1; return [SAAL_ROAD[0] + dx / L * 80, SAAL_ROAD[1] + dz / L * 80, Math.atan2(dx, dz)]; })();
  // Hintereingang: hinter dem Saalbau, von der Demo-Straße aus gesehen – nie näher als 35 m an Vorplatz oder Checkpoint
  const BACK = (() => { const dx = sbc[0] - SAAL_ROAD[0], dz = sbc[1] - SAAL_ROAD[1], L = Math.hypot(dx, dz) || 1; const want = [sbc[0] + dx / L * 45, sbc[1] + dz / L * 45]; const farEnough = p => Math.hypot(p[0] - SAAL_ROAD[0], p[1] - SAAL_ROAD[1]) > 35 && Math.hypot(p[0] - CP[0], p[1] - CP[1]) > 35;
    const r = K.nearestOn(roads6.filter(r => Math.hypot(r.p[0][0] - SAAL_ROAD[0], r.p[0][1] - SAAL_ROAD[1]) > 25), want[0], want[1]); if (r && farEnough([r.x, r.z])) return [r.x, r.z, r.h]; const f = D.freeSpot(want[0], want[1], 2.5); return [f[0], f[1], Math.atan2(dx, dz)]; })();
  const kioskPoi = CITY.pois.filter(p => /kiosk|convenience|newsagent/i.test(p.k || '') || /Kiosk|Späti|Trinkhalle/i.test(p.n || '')).sort((a, b) => Math.hypot(a.x - CP[0], a.z - CP[1]) - Math.hypot(b.x - CP[0], b.z - CP[1]))[0];
  const KIOSK = kioskPoi ? D.freeSpot(kioskPoi.x, kioskPoi.z, 2) : D.freeSpot(CP[0] + Math.cos(CP[2]) * 10, CP[1] - Math.sin(CP[2]) * 10, 2);
  const START = D.freeSpot(SAAL_ROAD[0] - Math.cos(sr.h) * 5, SAAL_ROAD[1] + Math.sin(sr.h) * 5, 1.5);

  // ---------- Personen ----------
  const NAMES = { yusuf: ['Yusuf', '#ffb35b'], falk: ['Dr. Falk', '#cfcfcf'], mara: ['Mara Lenz', '#7de0ff'], kanzler: ['Kanzler Hollweg', '#f0d08a'], hilde: ['Hilde', '#ffd1e8'], tobias: ['Tobias', '#b6f08a'], ayse: ['Ayşe', '#ff9a9a'], jonas: ['Jonas', '#9ad0ff'], ewald: ['Ewald', '#d8c8ff'] };
  const MODELS = { yusuf: 'man', falk: 'woman_dress', mara: 'woman_jacket', kanzler: 'business_man', hilde: 'woman_dress', tobias: 'man', ayse: 'woman_casual', jonas: 'man', ewald: 'man_suit' };
  const person = (key, x, z, face, o = {}) => { const [n, c] = NAMES[key]; return npc(MODELS[key], x, z, face, n, c, { keep: key === 'kanzler', ...o }); };
  const alive = h => h && peds.includes(h) && h.userData.state !== 'dead';
  // Die fünf Fragen aus dem Viertel
  const QUESTIONS = [
    ['hilde', 'Meine Rente: 1.040 Euro. Meine Miete ab Juli: 890. Herr Kanzler, rechnen Sie das mal für mich durch.'],
    ['tobias', 'Nachtschicht im Pflegeheim: zwei Leute für 38 Bewohner. Die „Pflegeoffensive“ war vor vier Jahren. Wo sind die Stellen?'],
    ['ayse', 'Kitaplatz: zwei Jahre Wartezeit. Das Amt sagt, ich soll arbeiten gehen. Womit soll ich das Kind bezahlen, mit dem Bürgergeld, das Sie kürzen?'],
    ['jonas', 'Die Linie 12 fällt jeden dritten Tag aus. Ich hab das Deutschlandticket. Nur den Zug nicht.'],
    ['ewald', 'Die Schule hat Schimmel, der Park wird bebaut, und heute kommen acht Dienstwagen für neunzig Minuten. Was kostet dieser Besuch?'],
  ];
  const ASK = ['Meine Nachbarin hat 1.040 Euro Rente und 890 Euro Miete. Was sagen Sie ihr?', 'Zwei Pflegekräfte für 38 Leute in der Nachtschicht. Wo ist Ihre Offensive?', 'Zwei Jahre Wartezeit auf einen Kitaplatz. Und das Amt sagt: arbeiten gehen.', 'Jeden dritten Tag fällt die 12 aus. Fahren Sie mal Bahn, Herr Kanzler.', 'Was kostet dieser Besuch – und was kostet die Schule ohne Schimmel?'];

  // ---------- Kulisse ----------
  function podium() { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(6, 0.7, 3), new THREE.MeshLambertMaterial({ color: 0x3a3f4c })); m.position.y = 0.35; m.castShadow = true; g.add(m);
    const t = canvasTex(1024, 160, (ctx, w, h) => { ctx.fillStyle = '#10243f'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#fff'; ctx.font = '900 64px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('BÜRGERDIALOG', w / 2, 58); ctx.font = '500 40px system-ui'; ctx.fillStyle = '#ffd84a'; ctx.fillText('FRANKFURT HÖRT ZU', w / 2, 118); });
    const b = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.95), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide })); b.position.set(0, 2.6, -1.3); g.add(b); for (const sx of [-2.9, 2.9]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.1, 6), new THREE.MeshLambertMaterial({ color: 0x888888 })); p.position.set(sx, 1.55, -1.3); g.add(p); }
    const pult = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.15, 0.5), new THREE.MeshLambertMaterial({ color: 0x5a3d2a })); pult.position.set(0, 1.27, 1.0); g.add(pult); scene.add(g); return track(g); }
  function barrierRow(x, z, h, n) { const out = []; for (let i = 0; i < n; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 0.06), new THREE.MeshLambertMaterial({ color: 0xc8c8c8 })); const ox = (i - (n - 1) / 2) * 2.5; const px = x + Math.cos(h) * ox, pz = z - Math.sin(h) * ox; m.position.set(px, TH(px, pz) + 0.55, pz); m.rotation.y = h; scene.add(m); out.push(track(m)); } return out; }
  function blackCar(x, z, h, type = 'sedan') { const c = X.makeCar(false, type); c.position.set(x, TH(x, z), z); c.userData.heading = h; c.rotation.y = h; c.userData.mode = 'parked'; c.userData.speed = 0; c.userData.keep = true; for (const m of c.userData.bodyMats || []) m.color.setHex(0x101114).convertSRGBToLinear(); c.userData.col = 0x101114; D.addCar(c); return track(c); }
  function policeCar(x, z, h) { const c = X.makeCar(true); c.position.set(x, TH(x, z), z); c.userData.heading = h; c.rotation.y = h; c.userData.mode = 'parked'; c.userData.speed = 0; D.addCar(c); return track(c); }
  function convoy(at, h) { const out = []; let k = 0; for (const [type, pol] of [['police', true], ['sedan', false], ['suv', false], ['police', true]]) { const d = -(k++) * 7; const x = at[0] + Math.sin(h) * d, z = at[1] + Math.cos(h) * d; const [fx, fz] = D.freeSpot(x, z, 2.5); out.push(pol ? policeCar(fx, fz, h) : blackCar(fx, fz, h, type)); } return out; }
  function squad(x, z) { const g = D.spawnSquad(new V3(x, 0, z)); g.isDemo = true; track(g); return g; }
  const audience = (n, cx, cz) => { for (let i = 0; i < n; i++) { const a = rnd(0, 6.28), r = rnd(2.5, 7); const [x, z] = D.freeSpot(cx + Math.cos(a) * r, cz + Math.sin(a) * r, 1); const h = npc(pick(['man_suit', 'business_man', 'woman_dress', 'man', 'woman_jacket']), x, z, Math.atan2(cx - x, cz - z) + Math.PI, null, null, { keep: true }); h.userData.guest = true; } };

  // ---------- Reden ----------
  const SPEECH = [
    ['Kanzler Hollweg', 'Liebe Bornheimerinnen und Bornheimer. Ich bin heute hier, um zuzuhören. Das ist mir wichtig.', 5],
    ['Kanzler Hollweg', 'Wir haben verstanden: Die Mieten sind eine Herausforderung. Deshalb haben wir eine Kommission eingesetzt.', 6],
    ['Kanzler Hollweg', 'Pflege ist Herzenssache. Wir investieren in Zukunft. In Wachstum. In Entlastung. In Respekt.', 6],
    ['Kanzler Hollweg', 'Und ich sage ganz klar: Wer arbeitet, muss mehr haben als der, der nicht arbeitet.', 5],
    ['Gäste', '👏 👏 👏', 2.5],
    ['Kanzler Hollweg', 'Gibt es Fragen? … Ja, gern. Der Herr in der zweiten Reihe.', 4],
    ['Gast (Liste)', 'Herr Kanzler, wie schaffen Sie es, bei all dem Druck so gelassen zu bleiben?', 5],
    ['Kanzler Hollweg', 'Haha. Ehrlich gesagt: Termine wie dieser. Menschen wie Sie. Noch eine Frage?', 5],
  ];
  const DEFLECT = ['Das nehme ich mit. Ehrlich. Genau dafür bin ich hier.', 'Ich kenne die Zahlen. Deshalb haben wir die Kommission.', 'Wir sind da auf einem guten Weg. Das braucht Zeit.', 'Ich verstehe die Emotion. Aber bitte: in angemessener Form.'];

  // ---------- Kapitel ----------
  const CH = [];
  let hooked = false; function hook() { if (hooked) return; hooked = true; X.listeners.push((ev, pos, data) => { const Q = S(); if (!Q || Q.state !== 'active' || K.sid !== 's3') return; if (ev === 'lineOpened' && Q.demo && data.demo === Q.demo && !Q.res) Q.res = 'eine_frage'; }); }

  // 1 · SICHERHEITSZONE
  CH.push({ title: 'SICHERHEITSZONE', tag: 'Der Kanzler kommt zum Bürgerdialog. Die Berger Straße wird dicht gemacht.', lock: 'all', start() {
      hook(); const Q = S(); Q.flags = { v0: D.stats.violence, f0: D.stats.filmed }; Q.q = 0; Q.res = null; Q.demo = null; world.hour = 9.2; opts.weather = 'clear'; weather.kind = 'clear';
      D.post('presse', 'Kanzler Hollweg heute zum „Bürgerdialog“ im Saalbau Bornheim. Berger Straße ab 8 Uhr gesperrt, Linie 12 unterbrochen.', 3100); D.post('polizei', 'Sicherheitszone rund um den Saalbau Bornheim. Bitte Ausweise bereithalten, Taschen werden kontrolliert. #ffm', 60); D.post('kanzleramt', 'Zuhören ist Regierungsarbeit. Heute: Frankfurt-Bornheim. #Bürgerdialog', 880); D.post('yusuf', 'Mein Kiosk muss heute zu bleiben. „Sicherheitsbereich“. Wer zahlt mir den Tag? Niemand.', 1400);
      squad(CP[0], CP[1]); barrierRow(CP[0] + Math.sin(CP[2]) * 4, CP[1] + Math.cos(CP[2]) * 4, CP[2], 3);
      Q.yusuf = person('yusuf', KIOSK[0], KIOSK[1], 0); const QS = QUESTIONS; for (let i = 0; i < QS.length; i++) { const a = i / QS.length * 6.28; const [x, z] = D.freeSpot(KIOSK[0] + Math.cos(a) * 6, KIOSK[1] + Math.sin(a) * 6, 1.2); const h = person(QS[i][0], x, z, Math.atan2(KIOSK[0] - x, KIOSK[1] - z)); h.userData.question = QS[i][1]; h.userData.qKey = QS[i][0]; }
      talk([['📱 Yusuf', 'Bist du wach? Komm zum Kiosk. Die haben mir ein Schreiben an die Tür geklebt. Und die halbe Nachbarschaft steht hier.', 5]]); },
    steps: [
      { obj: 'Geh zu <b>Yusufs Kiosk</b>', mark: () => KIOSK, done: () => near(KIOSK, 4) && !player.car },
      { enter() { const Q = S(); talk([['Yusuf', '„Sicherheitsbereich Stufe 2. Gewerbebetrieb untersagt von 6 bis 18 Uhr.“ Entschädigung: keine. Dafür darf ich dem Kanzler zuwinken.', 6], ['Yusuf', 'Und drinnen beim „Bürgerdialog“? Gästeliste. Dreißig Leute, handverlesen. Die hier haben echte Fragen – und keine Einladung.', 6], ['Yusuf', 'Sammel die Fragen. Geh zu den Leuten, G drücken. Ich schreib sie auf Karten. Irgendwer bringt sie da rein.', 5]]); Q.collect = true;
          X.onG = () => { const Q = S(); if (!Q.collect) return false; const tgt = peds.filter(p => p.userData.question && !p.userData.asked && p.position.distanceTo(player.pos) < 3).sort((a, b) => a.position.distanceTo(player.pos) - b.position.distanceTo(player.pos))[0]; if (!tgt) { showMsg('GEH NÄHER AN JEMANDEN MIT FRAGE', 800, 'info'); return true; } tgt.userData.asked = true; Q.q++; sfx('click'); D.sub(NAMES[tgt.userData.qKey][0], tgt.userData.question, 6); showMsg('FRAGE ' + Q.q + '/5 NOTIERT', 800, 'ok'); if (Q.q === 3) D.post('hilde', 'Ein junger Mensch sammelt am Kiosk unsere Fragen. Erste*r seit Jahren, der fragt.', 260); return true; }; },
        obj: () => `Sammle die <b>Fragen</b> der Nachbarn (G, nah ran) ${S().q}/5`, mark: () => { const p = peds.find(p => p.userData.question && !p.userData.asked); return p || KIOSK; }, done: () => S().q >= 5 },
      { enter() { S().collect = false; X.onG = null; talk([['Yusuf', 'Fünf Karten. Ehrlich, konkret, keine Parolen. Jetzt du: zum Checkpoint. Keine Waffen, kein Zeug – das ist Sicherheitszone, und ich will, dass die Fragen ankommen, nicht du in der Zelle.', 7]]); },
        obj: 'Geh zum <b>Checkpoint</b> an der Absperrung', mark: () => CP, done: () => near(CP, 7) && !player.car },
    ],
    finish(next) { const Q = S(); talk([['Polizei', 'Ausweis. Tasche öffnen. … Was ist das? Karten? Keine Flugblätter in der Sicherheitszone. Die bleiben hier.', 6], ['📱 Yusuf', 'Die haben die Karten kassiert?! Okay. Dann anders: Du hast sie im Kopf. Rein mit dir. Ich bleib am Kiosk, falls was ist.', 6]], () => { Q.cardsTaken = true; D.addRep('polizei', -2); D.post('polizei', 'Am Checkpoint Saalbau wurden nicht genehmigte Druckerzeugnisse sichergestellt. Die Lage ist ruhig.', 44); D.post('mara', 'Polizei konfisziert am Saalbau fünf handgeschriebene Fragekarten einer Rentnerin. Ich bin vor Ort.', 5200); next(); }); } });

  // 2 · DER BÜRGERDIALOG
  CH.push({ title: 'DER BÜRGERDIALOG', tag: 'Zweihundert Stühle, dreißig Gäste, eine Gästeliste.', lock: 'all', start() {
      hook(); const Q = S(); Q.flags = Q.flags || { v0: D.stats.violence, f0: D.stats.filmed }; Q.phase = 'wait'; Q.spI = 0; Q.spT = 0; Q.asked = 0; Q.filmedSec = 0; Q.res = null; Q.demo = null; world.hour = 10.6;
      const h = Math.atan2(SAAL_ROAD[0] - SAAL[0], SAAL_ROAD[1] - SAAL[1]); Q.pod = podium(); Q.pod.position.set(SAAL[0], TH(SAAL[0], SAAL[1]), SAAL[1]); Q.pod.rotation.y = h;
      const bx = SAAL[0] + Math.sin(h) * 4.5, bz = SAAL[1] + Math.cos(h) * 4.5; barrierRow(bx, bz, h, 4);
      Q.kanzler = person('kanzler', SAAL[0] + Math.sin(h) * 0.6, SAAL[1] + Math.cos(h) * 0.6, h); Q.kanzler.userData.yOff = 0.7; Q.kanzler.position.y += 0.7; // steht auf dem Podest
      Q.falk = person('falk', SAAL[0] + Math.cos(h) * 5 + Math.sin(h) * 5, SAAL[1] - Math.sin(h) * 5 + Math.cos(h) * 5, h + 0.5); Q.mara = person('mara', SIDE[0], SIDE[1], 0);
      audience(12, SAAL[0] + Math.sin(h) * 9, SAAL[1] + Math.cos(h) * 9); squad(SAAL_ROAD[0] + Math.cos(sr.h) * 8, SAAL_ROAD[1] - Math.sin(sr.h) * 8); Q.cars = convoy(BACK, BACK[2]);
      D.post('presse', 'Live: Kanzler Hollweg spricht in Bornheim. Zugelassen sind Pool-Kameras und geladene Gäste.', 2300); D.post('troll', 'Bürgerdialog = Bürger draußen, Dialog drinnen 😂', 870);
      talk([['📱 Mara Lenz', 'Hier Mara, freie Journalistin. Yusuf hat mir von dir erzählt. Versuch\'s am Haupteingang. Wenn sie dich abweisen: Seiteneingang, ich bin da.', 6]]); },
    update(dt) { const Q = S(); if (Q.phase === 'speech') { Q.spT -= dt; if (D.filming) Q.filmedSec += dt; if (Q.spT <= 0) { const l = SPEECH[Q.spI++]; if (!l) { Q.phase = 'open'; return; } D.sub(l[0], l[1], l[2]); Q.spT = l[2] + 0.6; if (Q.spI === 6) Q.phase = 'open'; } } },
    steps: [
      { obj: 'Geh zum <b>Haupteingang</b> des Saalbaus', mark: () => S().falk, done: () => S().falk && S().falk.position.distanceTo(player.pos) < 4 && !player.car },
      { enter() { talk([['Dr. Falk', 'Name? … Nicht auf der Liste. Der Bürgerdialog ist eine geschlossene Veranstaltung mit Vorab-Akkreditierung.', 6], ['Dr. Falk', 'Fragen reichen Sie gern über das Online-Formular ein. Bearbeitungszeit sechs bis acht Wochen. Schönen Tag.', 5], ['Mara Lenz', 'Psst. Hier rüber. Seiteneingang.', 3]]); },
        obj: 'Triff <b>Mara Lenz</b> am Seiteneingang', mark: () => S().mara, done: () => S().mara && S().mara.position.distanceTo(player.pos) < 3.5 },
      { enter() { const Q = S(); talk([['Mara Lenz', 'Die lassen mich auch nicht rein, nur die Pool-Kameras. Aber die Lautsprecher stehen draußen – man hört jedes Wort.', 6], ['Mara Lenz', 'Film die Rede mit V. Und wenn er fragt, ob es Fragen gibt: dann ruf deine. Laut, nah an der Bühne, mit G.', 6]], () => { Q.phase = 'speech'; Q.spT = 1.5; D.post('kanzleramt', 'Jetzt: Der Kanzler im Gespräch mit den Menschen in Bornheim. 🇩🇪', 640); }); },
        obj: () => `Hör die <b>Rede</b> an der Bühne – filmen mit V (${Math.round(S().filmedSec)} s) – warte auf „Gibt es Fragen?“`, mark: () => SAAL, done: () => S().phase === 'open' },
      { enter() { const Q = S(); X.onG = () => { const Q = S(); if (Q.phase !== 'open') return false; if (Math.hypot(SAAL[0] - player.pos.x, SAAL[1] - player.pos.z) > 14) { showMsg('NÄHER AN DIE BÜHNE', 800, 'info'); return true; } if (Q.asked >= 3) return true; const i = Q.asked++; D.sub('Du', ASK[i % ASK.length], 5); sfx('click');
            setTimeout(() => { if (Q.phase !== 'open') return; if (i === 0) D.sub('Dr. Falk', 'Das ist keine akkreditierte Frage. Bitte den Bereich hinter der Absperrung nicht verlassen.', 4); else if (i === 1) D.sub('Kanzler Hollweg', pick(DEFLECT), 5); else { D.sub('Kanzler Hollweg', 'Ich nehme das mit. Ehrlich. Vielen Dank, Bornheim – ich habe einen Anschlusstermin.', 5); Q.phase = 'done'; } }, 5600);
            if (i === 1) D.post('gast', 'Jemand ruft von draußen Fragen rein. Die Security guckt zur Pressesprecherin. Die guckt aufs Handy.', 3400);
            if (i === 2 && Q.filmedSec > 8) { D.post('mara', '„Ich nehme das mit“ – Kanzler zu Rentnerin mit 1.040 € Rente und 890 € Miete. Ungeschnitten, 48 Sekunden.', 41000); D.stats.reach += 1500; D.addRep('kollektiv', 6); }
            return true; }; },
        obj: () => `Jetzt! Ruf die <b>Fragen</b> der Nachbarn (G) ${Math.min(S().asked, 3)}/3`, mark: () => SAAL, done: () => S().phase === 'done' },
    ],
    finish(next) { const Q = S(); X.onG = null; talk([['Dr. Falk', 'Der Kanzler bedankt sich für den lebendigen Austausch. Die Veranstaltung ist beendet. Bitte verlassen Sie zügig den Sicherheitsbereich.', 6], ['Mara Lenz', 'Hörst du das? Draußen an der Absperrung sammeln sich Leute. Die haben das über die Lautsprecher gehört. Das wird eine Demo – und die Kolonne muss da durch.', 7]], () => { D.post('presse', 'Zwischenrufe beim Bürgerdialog: Kanzler bricht Veranstaltung nach 40 Minuten ab.', 9800); D.post('kanzleramt', 'Ein guter, offener Austausch in Bornheim. Danke an alle, die dabei waren.', 410); D.addRep('anwohner', 4); next(); }); } });

  // 3 · DIE KOLONNE
  CH.push({ title: 'DIE KOLONNE', tag: 'Acht Dienstwagen, eine Straße, fünf Fragen.', lock: 'all', start() {
      hook(); const Q = S(); Q.flags = Q.flags || { v0: D.stats.violence, f0: D.stats.filmed }; Q.v0 = D.stats.violence; Q.res = null; Q.convoyT = 0; world.hour = 12.1;
      Q.cars = convoy(BACK, BACK[2]); Q.yusuf = person('yusuf', BACK[0] + Math.cos(BACK[2]) * 4, BACK[1] - Math.sin(BACK[2]) * 4, BACK[2] + Math.PI);
      const n = 14; const d = D.spawnDemo({ x: SAAL_ROAD[0], z: SAAL_ROAD[1], n, max: 36, story: true, banner: 'FRAGEN STATT FOTOS' }); d.isDemo = true; track(d); Q.demo = d;
      const r = D.route(SAAL_ROAD[0], SAAL_ROAD[1], CP[0], CP[1]); if (r && r.length > 1) { d.trail = D.trailFrom(r); d.total = d.trail[d.trail.length - 1].s; d.s = 0; } d.state = 'march'; d.blockAt = 0.55; d.maxStage = 3; d.rallyDur = 20; d.speed = 1.4; d.theme = 'FRAGEN STATT FOTOS';
      for (const key of ['hilde', 'tobias', 'ayse', 'jonas', 'ewald']) { const [x, z] = D.freeSpot(SAAL_ROAD[0] + rnd(-4, 4), SAAL_ROAD[1] + rnd(-4, 4), 1); const h = person(key, x, z, 0); h.userData.state = 'demo'; h.userData.demo = d; h.userData.jit = [rnd(-1, 1), rnd(-1, 1)]; d.members.push(h); }
      D.post('kollektiv', 'Die Kolonne steht noch hinterm Saalbau. Wir stehen vorne. Mit Fragen, ohne Steine. Kommt zur Berger! #FragenStattFotos', 2600); D.post('polizei', 'Spontanversammlung im Bereich Saalbau. Die Abfahrt der Delegation wird gesichert. Bitte Anweisungen folgen.', 70);
      talk([['📱 Yusuf', 'Ich steh am Hintereingang, mit neuen Karten. Zwei Wege: Ihr bleibt vorne ruhig, dann müssen sie irgendwann mit offenem Fenster durch euch durch. Oder du kommst zu mir, und wir halten die Karten ans Fenster.', 8], ['📱 Mara Lenz', 'Ich film von der Absperrung. Wenn\'s knallt, sind das die Bilder, die sie wollen. Wenn\'s ruhig bleibt, sind es unsere.', 6]]); },
    update(dt) { const Q = S(); const d = Q.demo; if (!d) return;
      if (!Q.res) { if (d.pol.stage >= 3 || D.stats.violence - Q.v0 >= 3) Q.res = 'abgeraeumt'; else if (near(BACK, 5) && !player.car) Q.res = 'hintereingang'; if (Q.res) { Q.convoyT = 0; D.post('polizei', Q.res === 'abgeraeumt' ? 'Die Versammlung wurde aufgelöst. Die Delegation hat den Bereich über eine Ausweichroute verlassen.' : 'Die Delegation hat den Bereich verlassen. Die Versammlung löst sich auf.', 55); } }
      if (Q.res) { Q.convoyT += dt; const away = D.posAt(d.trail, 0); for (const c of Q.cars || []) { if (!cars.includes(c)) continue; c.userData.mode = 'parked'; const t = Q.res === 'abgeraeumt' ? { x: BACK[0] + Math.sin(BACK[2]) * 150, z: BACK[1] + Math.cos(BACK[2]) * 150 } : { x: UHR[0], z: UHR[1] }; D.driveTo(c, t.x, t.z, dt, Q.res === 'eine_frage' ? 3 : 9); } } },
    steps: [
      { obj: () => { const d = S().demo; const far = d && Math.hypot(d.cx - player.pos.x, d.cz - player.pos.z) > 60; return far ? '<b>Zurück zur Demo!</b>' : 'Führe die <b>Demo</b> zur Absperrung – vorne bleiben'; }, mark: () => S().demo && !S().demo.result ? [S().demo.cx, S().demo.cz] : CP, done: () => { const d = S().demo; return d && (d.pol.stage >= 2 || d.state === 'halt'); }, fail: () => S().demo && S().demo.result ? 'Die Demo hat sich aufgelöst.' : null },
      { enter() { D.sub('📢 Polizei', 'Die Delegation verlässt den Bereich. Bitte machen Sie die Fahrbahn frei. Wer stehen bleibt, wird weggetragen.', 6); D.post('presse', 'Stand-off auf der Berger Straße: Kolonne des Kanzlers wartet, Anwohner stehen mit Fragekarten auf der Fahrbahn.', 15000); },
        obj: () => { const d = S().demo; const t = d ? Math.round(clamp(d.tension, 0, 1) * 100) : 0; return `An der <b>Absperrung</b> ruhig bleiben (G = „Keine Gewalt“) · Spannung ${t} % · oder zu <b>Yusuf</b> am Hintereingang`; }, mark: () => S().demo && !S().demo.result ? [S().demo.cx, S().demo.cz] : BACK, done: () => !!S().res, fail: () => S().demo && S().demo.result && !S().res ? 'Die Demo hat sich aufgelöst.' : null },
      { enter() { const Q = S(); if (Q.res === 'eine_frage') talk([['📢 Polizei', 'Die Versammlungsleitung hat Ruhe zugesagt. Die Delegation fährt im Schritttempo. Bitte Abstand halten.', 5], ['Kanzler Hollweg', '(Fenster geht zehn Zentimeter runter) Ich hab Sie gehört. Alle fünf. Ich nehme das mit nach Berlin.', 6], ['Hilde', 'Nehmen Sie lieber meine Miete mit. Die ist leichter.', 4]]);
          else if (Q.res === 'hintereingang') talk([['Yusuf', 'Da! Das zweite Auto. Halt die Karten hoch – hoch!', 3], ['Kanzler Hollweg', '(durch den Spalt) Schicken Sie das bitte ans Bürgerbüro. Danke. Wirklich.', 5], ['Yusuf', 'Das Bürgerbüro. Sechs bis acht Wochen. Na dann.', 4]]);
          else talk([['📢 Polizei', 'Die Versammlung ist aufgelöst. Verlassen Sie den Bereich.', 4], ['📱 Mara Lenz', 'Sie sind über den Hintereingang raus. Und die Schlagzeile schreibt sich jetzt von selbst.', 5]]); },
        obj: () => S().res === 'abgeraeumt' ? 'Die Kolonne ist weg. <b>Geh vom Platz.</b>' : 'Die Kolonne fährt. <b>Sieh zu.</b>', mark: () => null, done: () => S().convoyT > 14 },
    ],
    finish(next) { const Q = S(); const end = Q.res || 'abgeraeumt'; Q.endings = [...new Set([...(Q.endings || []), end])]; Q.flags.lastEnd = end; if (Q.demo && !Q.demo.result) D.endDemo(Q.demo, end === 'abgeraeumt' ? 'cleared' : 'success');
      const E = { eine_frage: ['ENDE: EINE FRAGE', 'Vierzig Sekunden offenes Fenster. Zwei Millionen Klicks. Die Kommission tagt weiter.', [['presse', 'Kanzler stellt sich auf der Berger Straße fünf Fragen aus dem Viertel. Antworten: „Ich nehme das mit.“', 61000], ['mara', 'Das Video: 2,1 Mio. Aufrufe. Die Rente von Hilde ist immer noch 1.040 Euro.', 44000], ['kanzleramt', 'Direkter Austausch, auch wenn\'s unbequem wird – das ist Demokratie. Danke, Bornheim.', 2100], ['hilde', 'Er hat mir die Hand gegeben. Die Miete kommt trotzdem im Juli.', 8800], ['yusuf', 'Kiosk morgen wieder auf. Kaffee für alle, die heute gestanden haben.', 3200]], { kollektiv: 8, polizei: 4, anwohner: 8 }],
        hintereingang: ['ENDE: HINTEREINGANG', 'Fünf Karten am Fenster, ein Spalt von zehn Zentimetern. „Ans Bürgerbüro.“ Die Kolonne fährt weiter.', [['presse', 'Kanzlerbesuch in Bornheim endet über die Hintertür. Anwohner übergeben Fragen „am Seitenfenster“.', 14000], ['yusuf', 'Er hat die Karten genommen. Immerhin. Bürgerbüro, sechs bis acht Wochen. Ich zähl mit.', 2900], ['mara', 'Vorne die Kameras, hinten die Fragen. Ein Bild sagt mehr als der ganze Dialog.', 9100], ['troll', 'Hintereingang, wie beim Catering 😂', 640]], { kollektiv: 3, anwohner: 5 }],
        abgeraeumt: ['ENDE: ABGERÄUMT', 'Die Kolonne nimmt den Hintereingang. Die Schlagzeile: „Ausschreitungen in Bornheim“. Die Fragen stellt niemand.', [['presse', 'Ausschreitungen beim Kanzlerbesuch in Frankfurt-Bornheim: Polizei löst Versammlung auf.', 72000], ['kanzleramt', 'Danke an die Einsatzkräfte. Dialog braucht Respekt – von allen Seiten.', 3300], ['troll', 'Chaoten. Wie immer.', 2800], ['hilde', 'Ich wollte nur meine Frage stellen. Jetzt stehe ich in der Zeitung als „Randaliererin“.', 6100], ['mara', 'Die Bilder, die sie wollten. Punktgenau geliefert.', 5200]], { kollektiv: -4, polizei: -5, anwohner: -3 }] }[end];
      for (const [w, t, l] of E[2]) D.post(w, t, l); for (const [k, v] of Object.entries(E[3])) D.addRep(k, v); X.card(E[0], E[1], 7);
      setTimeout(() => { X.card('DER KANZLER KOMMT', 'Story 3 abgeschlossen. Freies Spiel geht weiter.', 7); next(); }, 7500); } });

  const ends = { eine_frage: 'Eine Frage', hintereingang: 'Hintereingang', abgeraeumt: 'Abgeräumt' };
  return { CH, ends, START, places: { SAAL, SAAL_ROAD, SIDE, BACK, CP, KIOSK, START3: START } };
}

// Story 2: „Freitag ist Pflicht" – Schulstreik, Sternmarsch, Feuer in der Nacht, Wasserwerfer gegen Schüler.
// Alle Personen, Schulen, Behörden und Accounts sind erfunden. Echte Schulgelände aus den Kartendaten sind nur Kulisse.
export function story2Chapters(K) {
  const { X, W, D, F } = K;
  const { THREE, scene, player, peds, cars, CITY, TH, solidAt, pointInPoly, opts, world, weather, sfx, showMsg, rnd, clamp, pick, animateWalk, moveWithCollision, lerpAngle, makeCar, raiseWanted } = X;
  const V3 = THREE.Vector3; const { talk, track, near, npc } = K; const S = () => K.S;
  const { UHR, U0 } = K.places;

  // ---------- Orte ----------
  const roads6 = CITY.roads.filter(r => !r.mw && !r.ry && r.w >= 6);
  const schools = CITY.areas.filter(a => a.k === 'school' && a.n);
  function schoolInfo(real, name) {
    const a = schools.find(s => s.n === real) || schools[0]; const xs = a.p.map(p => p[0]), zs = a.p.map(p => p[1]); const c = [xs.reduce((s, v) => s + v, 0) / xs.length, zs.reduce((s, v) => s + v, 0) / zs.length];
    let yard = null, bd = 1e9; for (let x = Math.min(...xs); x < Math.max(...xs); x += 3) for (let z = Math.min(...zs); z < Math.max(...zs); z += 3) { if (!pointInPoly(x, z, a.p) || solidAt(x, z) >= 0 || X.barrierNear(x, z, 1.2)) continue; let free = 0; for (const [ox, oz] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) if (solidAt(x + ox, z + oz) < 0) free++; if (free < 4) continue; const d = Math.hypot(x - c[0], z - c[1]); if (d < bd) { bd = d; yard = [x, z]; } }
    if (!yard) yard = D.freeSpot(c[0], c[1], 3);
    const g = K.nearestOn(roads6, yard[0], yard[1]); const gate = D.freeSpot(g.x + (yard[0] - g.x) * 0.12, g.z + (yard[1] - g.z) * 0.12, 1.5);
    return { name, real, poly: a.p, yard, gate, road: [g.x, g.z], h: g.h };
  }
  const HGS = schoolInfo('Stauffenbergschule', 'Helmholtz-Gesamtschule'), LGO = schoolInfo('Comeniusschule', 'Lessing-Gymnasium Ost'), BRS = schoolInfo('Kirchnerschule', 'Brückenschule');
  const sb = CITY.buildings.find(b => b && /Saalbau/.test(b.n || '')); const sbc = sb ? sb.p.reduce((a, p) => [a[0] + p[0] / sb.p.length, a[1] + p[1] / sb.p.length], [0, 0]) : [-369, 672];
  const sr = K.nearestOn(roads6, sbc[0], sbc[1]); const STADT = [sr.x, sr.z];
  const START = D.freeSpot(HGS.gate[0], HGS.gate[1], 1.5);
  const NAMES = { selin: ['Selin', '#7de0ff'], mo: ['Mo', '#ffb35b'], kessler: ['Dr. Kessler', '#cfcfcf'], brandt: ['Frau Brandt', '#ff7070'], adler: ['Herr Adler', '#b6f08a'] };
  const person = (key, x, z, face, o = {}) => { const [n, c] = NAMES[key]; const models = { selin: 'woman_casual', mo: 'man', kessler: 'woman_dress', brandt: 'woman_jacket', adler: 'man_suit' }; const tops = { selin: 0x2d6fd8, mo: 0xff8a2a }; return npc(models[key], x, z, face, n, c, { top: tops[key], hair: key === 'selin' ? 0x111111 : undefined, student: key === 'selin' || key === 'mo', ...o }); };
  function students(n, cx, cz, r = 9) { const out = []; for (let i = 0; i < n; i++) { const g = Math.floor(i / 3), a = g * 2.1 + rnd(-0.3, 0.3), rr = r * (0.35 + (g % 3) * 0.3); const [x, z] = D.freeSpot(cx + Math.cos(a) * rr + rnd(-1, 1), cz + Math.sin(a) * rr + rnd(-1, 1), 1); const h = D.makeMember(x, z, { student: true, signs: 0 }); Object.assign(h.userData, { state: 'npc', keep: true }); h.rotation.y = rnd(0, 6.3); track(h); out.push(h); } return out; }
  function demo(o) { const d = D.spawnDemo({ story: true, student: true, ...o }); d.isDemo = true; track(d); return d; }
  function startAt(d, remain) { if (!d.total) return; d.s = Math.max(0, d.total - remain); const p = D.posAt(d.trail, d.s - 6); for (const h of d.members) { const [x, z] = D.freeSpot(p.x + rnd(-3, 3), p.z + rnd(-3, 3), 1); h.position.set(x, TH(x, z), z); } d.cx = p.x; d.cz = p.z; }
  const pct = d => d && d.total ? Math.round(clamp(d.s / d.total, 0, 1) * 100) : 0;
  const alive = h => h && peds.includes(h) && h.userData.state !== 'dead';
  // Ereignisse für die Bilanz
  X.listeners.push((ev, pos, data) => { const Q = S(); if (!Q || Q.state !== 'active' || !Q.flags || Q.flags.v0 === undefined) return;
    if (ev === 'ffAttacked' && data.by === 'player') Q.flags.ffBy = (Q.flags.ffBy || 0) + 1;
    if (ev === 'fireStart' && data.by === 'player') Q.flags.burned = (Q.flags.burned || 0) + 1; });
  // Schritt-Text für mitlaufende Demos
  const demoObj = (label, d) => { if (!d) return ''; const far = Math.hypot(d.cx - player.pos.x, d.cz - player.pos.z) > 60; const st = d.pol.stage; return far ? '<b>Zurück zur Demo!</b>' : `${label} (${pct(d)} %)` + (st === 2 && !d.pol.lineOpened ? ' · <b>Polizeikette</b>: G deeskaliert' : st === 3 ? ' · <b>Kessel!</b>' : st >= 4 ? ' · <b>Wasserwerfer!</b>' : ''); };

  const CH = [];
  // 1 · HITZEFREI, ABGELEHNT
  let teacher = null, cone = null;
  CH.push({ title: 'HITZEFREI, ABGELEHNT', tag: '34 Grad im Klassenraum. Die Schulleitung sagt Nein.', start() {
      const Q = S(); Q.flags = { v0: D.stats.violence, f0: D.stats.filmed }; world.hour = 10.5; opts.weather = 'clear'; weather.kind = 'clear'; Q.flyers = 0; Q.warn = 0; Q.flyerMode = false;
      const [yx, yz] = HGS.yard; students(13, yx, yz, 10); Q.selin = person('selin', HGS.gate[0], HGS.gate[1], 0);
      teacher = person('brandt', yx + 6, yz, 0); teacher.userData.state = 'patrol'; teacher.userData.route = [0, 1, 2, 3].map(k => D.freeSpot(yx + Math.cos(k * Math.PI / 2 + 0.4) * 8, yz + Math.sin(k * Math.PI / 2 + 0.4) * 8, 1.5)); teacher.userData.ri = 0; teacher.userData.wait = 0;
      cone = new THREE.Mesh(new THREE.CircleGeometry(12, 20, -Math.PI / 2 - 0.7, 1.4), new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.16, depthWrite: false })); cone.rotation.x = -Math.PI / 2; cone.position.y = 0.14; cone.renderOrder = 3; teacher.add(cone);
      D.post('wetter', 'Frankfurt: 34 °C um 10 Uhr. Hitzefrei liegt im Ermessen der Schulen.', 120); D.post('schule', 'Hitzefrei wird an der HGS nicht gewährt. Trinken Sie ausreichend Wasser.', 8);
      talk([['📱 Selin', 'Hast du die Mail gesehen? Kein Hitzefrei. Im Physikraum sind 34 Grad. Und die Turnhalle ist seit zwei Jahren gesperrt.', 6], ['📱 Selin', 'Wir streiken am Freitag. Ich hab Flyer gedruckt. Komm zum Schultor, ' + HGS.name + '.', 5]]); },
    update(dt) { const Q = S(); if (!alive(teacher)) return; const u = teacher.userData; u.t += dt; if (u.state !== 'patrol') return;
      const tgt = u.route[u.ri]; const dx = tgt[0] - teacher.position.x, dz = tgt[1] - teacher.position.z, L = Math.hypot(dx, dz);
      if (L > 0.4) { moveWithCollision(teacher.position, dx / L * 1.25 * dt, dz / L * 1.25 * dt, 0.3); teacher.rotation.y = lerpAngle(teacher.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 4)); animateWalk(teacher, u.t, 3); }
      else { u.wait += dt; teacher.rotation.y += Math.sin(u.t * 0.8) * dt * 0.8; animateWalk(teacher, u.t, 0); if (u.wait > 3) { u.wait = 0; u.ri = (u.ri + 1) % u.route.length; } }
      teacher.position.y = TH(teacher.position.x, teacher.position.z); },
    steps: [
      { obj: 'Triff <b>Selin</b> am Schultor', mark: () => S().selin, done: () => near([S().selin.position.x, S().selin.position.z], 3.5) && !player.car },
      { enter() { const Q = S(); talk([['Selin', 'Hier, nimm die Hälfte. Verteil sie auf dem Schulhof – mit G, ganz nah ran.', 5], ['Selin', 'Aber pass auf Frau Brandt auf. Wenn sie dich sieht, gibt\'s einen Verweis. Drei, und du bist raus.', 6]]);
          X.onG = () => { if (!Q.flyerMode) return false; const tgt = peds.filter(p => p.userData.student && p.userData.state === 'npc' && !p.userData.flyer && p.position.distanceTo(player.pos) < 2.8).sort((a, b) => a.position.distanceTo(player.pos) - b.position.distanceTo(player.pos))[0]; if (!tgt) { showMsg('NIEMAND IN DER NÄHE', 700); return true; }
            tgt.userData.flyer = true; Q.flyers++; sfx('click'); const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.3), new THREE.MeshBasicMaterial({ color: 0xffe14d, side: THREE.DoubleSide })); paper.position.set(0.25, 1.15, 0.25); paper.rotation.x = -0.6; tgt.add(paper); showMsg('FLYER ' + Q.flyers + '/6', 700);
            if (alive(teacher)) { const dx = player.pos.x - teacher.position.x, dz = player.pos.z - teacher.position.z, L = Math.hypot(dx, dz); const a = ((Math.atan2(dx, dz) - teacher.rotation.y + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; if (L < 12 && Math.abs(a) < 0.7) { Q.warn++; sfx('horn', 0.3); showMsg('FRAU BRANDT HAT DICH GESEHEN – VERWEIS ' + Q.warn + '/3', 1600); D.sub('Frau Brandt', pick(['Was verteilen Sie da? Das kommt in die Akte!', 'Politische Werbung auf dem Schulhof ist verboten!', 'Ihren Namen, bitte. Sofort.']), 3); D.post('schule', 'Wir erinnern an das Neutralitätsgebot auf dem Schulgelände.', 3); } }
            return true; }; Q.flyerMode = true; },
        obj: () => `Verteile <b>Flyer</b> auf dem Schulhof (G) ${S().flyers}/6 · Verweise ${S().warn}/3 – nicht im roten Blickfeld`, mark: () => HGS.yard, fail: () => S().warn >= 3 ? 'Drei Verweise. Du bist für heute raus.' : null, done: () => S().flyers >= 6 },
      { enter() { S().flyerMode = false; }, obj: 'Zurück zu <b>Selin</b>', mark: () => S().selin, done: () => S().selin.position.distanceTo(player.pos) < 3.5 },
    ],
    finish(next) { talk([['Selin', 'Perfekt. Der Gruppenchat explodiert gerade. Freitag, elf Uhr, große Pause. Wir gehen einfach raus.', 6]], () => { D.post('selin', 'Freitag 11 Uhr. Alle raus. 34 Grad sind kein Unterricht. #FreitagIstPflicht', 1400); D.post('eltern', 'Der Elternrat bittet um Besonnenheit. Und um eine Klimaanlage.', 210); D.addRep('kollektiv', 5); next(); }); } });

  // 2 · FREITAG
  CH.push({ title: 'FREITAG', tag: 'Elf Uhr. Große Pause. Niemand geht zurück rein.', start() {
      const Q = S(); Q.flags = Q.flags || {}; if (Q.flags.v0 === undefined) { Q.flags.v0 = D.stats.violence; Q.flags.f0 = D.stats.filmed; } world.hour = 10.95; Q.strike = false; Q.d = null; Q.out = null; Q.metK = false; const [yx, yz] = HGS.yard; Q.studs = students(20, yx, yz, 11); Q.selin = person('selin', yx + 2, yz + 1, 0); Q.mo = person('mo', yx - 2, yz + 1, 0);
      const kx = HGS.gate[0], kz = HGS.gate[1]; Q.kessler = person('kessler', kx, kz, Math.atan2(yx - kx, yz - kz)); Q.metK = false; sfx('schoolbell');
      talk([['Mo', 'Da bist du ja! Alle warten auf ein Zeichen. Du hast die Flyer verteilt – du gibst das Zeichen.', 5], ['Selin', 'Stell dich auf den Hof und ruf zum Streik auf. G.', 4]]); },
    update(dt) { const Q = S(); if (Q.strike && !Q.metK && alive(Q.kessler) && Q.kessler.position.distanceTo(player.pos) < 10) { Q.metK = true; talk([['Dr. Kessler', 'Wer jetzt das Gelände verlässt, bekommt einen schriftlichen Verweis! Das hat Folgen für Ihren Abschluss!', 5], ['Mo', 'Dann schreiben Sie mal schön. Wir haben Hitzefrei – selbst genehmigt!', 4]]); D.post('schule', 'Unentschuldigtes Fehlen wird gemäß Schulgesetz geahndet.', 12); } },
    steps: [
      { enter() { const Q = S(); X.onG = () => { if (Q.strike) return false; if (!near(HGS.yard, 12)) { showMsg('AUF DEN SCHULHOF', 800); return true; }
            const mem = Q.studs.filter(alive); for (const h of mem) h.userData.keep = false; mem.push(Q.selin, Q.mo); const d = demo({ x: player.pos.x, z: player.pos.z, leadPlayer: true, members: mem, n: mem.length + 4, max: 36, maxStage: 1, banner: 'FREITAG IST PFLICHT' }); d.energy = 0.9; Q.d = d; Q.strike = true; X.onG = null;
            sfx('schoolbell'); X.card('STREIK!', 'Die ganze Schule kommt mit.', 3); D.say && D.say('Freitag ist Pflicht!', 0.9, 1.15, 1.1); return true; }; },
        obj: 'Stell dich auf den Schulhof und ruf zum <b>Streik</b> auf (G)', mark: () => HGS.yard, done: () => !!S().strike },
      { enter() { const Q = S(); let best = null; for (const sg of [1, -1]) { const r = K.nearestOn(roads6, HGS.road[0] + Math.sin(HGS.h) * 55 * sg, HGS.road[1] + Math.cos(HGS.h) * 55 * sg); const d = Math.hypot(r.x - HGS.gate[0], r.z - HGS.gate[1]); if (!best || d > best[2]) best = [r.x, r.z, d]; } Q.out = [best[0], best[1]]; },
        obj: () => `Führ den Streik an der Schulleitung vorbei auf die <b>Straße</b> (${S().d ? S().d.members.length : 0} dabei)`, mark: () => S().out, fail: () => S().d && (S().d.result || S().d.members.length < 6) ? 'Der Streik ist auseinandergefallen.' : null, done: () => near(S().out, 9) && S().d.members.length >= 10 },
    ],
    finish(next) { const Q = S(); X.card('SCHULSTREIK', Q.d.members.length + ' Schülerinnen und Schüler auf der Straße.', 4); D.post('kurier', 'SCHWÄNZ-ALARM! Hunderte Schüler verlassen den Unterricht – Lehrer machtlos!', 3900); D.post('selin', 'Wir sind ' + (Q.d.members.length * 3) + '! Und es werden mehr. #FreitagIstPflicht', 2600); D.post('eltern', 'Wir stehen hinter unseren Kindern. Mehrheitlich.', 330); D.addRep('kollektiv', 8);
      talk([['Selin', 'Das war erst der Anfang. Nächsten Freitag laufen drei Schulen. Sternmarsch zum Uhrtürmchen.', 5]], () => { if (Q.d && !Q.d.result) D.endDemo(Q.d, 'success'); next(); }); } });

  // 3 · STERNMARSCH
  CH.push({ title: 'STERNMARSCH', tag: 'Drei Schulen, drei Züge, ein Ziel.', start() {
      const Q = S(); Q.flags = Q.flags || {}; if (Q.flags.v0 === undefined) { Q.flags.v0 = D.stats.violence; Q.flags.f0 = D.stats.filmed; } world.hour = 11.2; Q.visit = [false, false, false]; Q.arr = [false, false, false]; Q.lost = 0;
      // @ts-ignore -- Baseline #119: DOM-/Zahl-String-Typen, kein X-Fehler
      Q.ds = [[HGS, 'HGS STREIKT', 300], [LGO, 'LESSING STREIKT', 260], [BRS, 'BRÜCKENSCHULE STREIKT', 260]].map(([sc, ban, rem], k) => { const d = demo({ x: sc.gate[0], z: sc.gate[1], n: 16, max: 26, dest: [UHR[0], UHR[1]], banner: ban, maxStage: k === 1 ? 3 : 2, blockAt: k === 1 ? 0.55 : null }); d.speed = 1.55; startAt(d, rem); d.rallyDur = 90; d.onEnd = r => { Q.arr[k] = Q.arr[k] || r === 'success'; Q.lost = (Q.lost || 0) + (r === 'success' ? 0 : 1); }; return d; });
      if (Q.arrL) { const li = X.listeners.indexOf(Q.arrL); if (li >= 0) X.listeners.splice(li, 1); } // alten Listener bei Kapitel-Neustart entfernen
      X.listeners.push(Q.arrL = (ev, p, data) => { if (ev === 'demoArrived' && Q.ds) { const k = Q.ds.indexOf(data.demo); if (k >= 0) Q.arr[k] = true; } });
      talk([['📱 Selin', 'Drei Züge laufen los. Ich bin bei uns, Mo bei der Brückenschule. Die Lessing-Leute kennt keiner.', 5], ['📱 Selin', 'Lauf zu allen drei Zügen, damit sie wissen, dass sie nicht allein sind. Die Polizei will uns trennen.', 6]]); },
    update() { const Q = S(); Q.ds.forEach((d, k) => { if (!Q.visit[k] && !d.result && Math.hypot(d.cx - player.pos.x, d.cz - player.pos.z) < 15) { Q.visit[k] = true; d.energy = 1; sfx('pickup'); showMsg('KONTAKT ' + Q.visit.filter(Boolean).length + '/3', 900); D.say && D.say('Ihr seid nicht allein!', 0.9, 1.1, 1.1); } }); },
    steps: [
      { obj: () => `Halte <b>Kontakt</b> zu allen drei Zügen (${S().visit.filter(Boolean).length}/3)`, mark: () => { const Q = S(); let b = null, bd = 1e9; Q.ds.forEach((d, k) => { if (Q.visit[k] || d.result) return; const dd = Math.hypot(d.cx - player.pos.x, d.cz - player.pos.z); if (dd < bd) { bd = dd; b = [d.cx, d.cz]; } }); return b; }, fail: () => (S().lost || 0) >= 2 ? 'Zwei Züge wurden aufgelöst.' : null, done: () => S().visit.every(Boolean) || S().ds.every((d, k) => S().visit[k] || d.result) },
      { obj: () => `Bring die Züge zum <b>Uhrtürmchen</b> (angekommen ${S().arr.filter(Boolean).length}/3)`, mark: () => { const Q = S(); const d = Q.ds.find((d, k) => !Q.arr[k] && !d.result); return d ? [d.cx, d.cz] : UHR; }, fail: () => (S().lost || 0) >= 2 ? 'Zwei Züge wurden aufgelöst.' : null, done: () => { const Q = S(); return Q.arr.filter(Boolean).length >= 2 && Q.ds.every((d, k) => Q.arr[k] || d.result); } },
    ],
    finish(next) { const Q = S(); X.listeners.splice(X.listeners.indexOf(Q.arrL), 1); const n = Q.arr.filter(Boolean).length; X.card(n === 3 ? 'ALLE DREI DA' : 'ZWEI VON DREI', 'Das Uhrtürmchen gehört heute den Schulen.', 4);
      D.post('presse', 'Sternmarsch: Tausende Schüler legen Bornheim lahm.', 12000); D.post('kurier', 'Wer bezahlt eigentlich den Polizeieinsatz für die Schwänzer?', 2100); D.post('mo', 'Laufen reicht nicht. Die hören uns erst, wenn es weh tut.', 880); D.addRep('kollektiv', 8);
      talk([['Selin', 'Das war riesig. Aber Mo redet von „mehr Druck". Heute Abend ist Treffen am Uhrtürmchen. Ich hab ein mieses Gefühl.', 6]], next); } });

  // 4 · DIE NACHT DANACH
  CH.push({ title: 'DIE NACHT DANACH', tag: 'Abends am Uhrtürmchen. Nicht alle wollen nur reden.', start() {
      const Q = S(); Q.flags = Q.flags || {}; if (Q.flags.v0 === undefined) { Q.flags.v0 = D.stats.violence; Q.flags.f0 = D.stats.filmed; } world.hour = 22.4; Q.neut = 0; Q.t4 = 0; Q.flags.protected = 0; Q.att = []; Q.fire = null; Q.car = null; Q.go = false;
      const d = demo({ x: UHR[0], z: UHR[1], n: 14, gather: true, noPolice: true, max: 18, banner: 'FREITAG IST PFLICHT' }); d.goal = null; Q.d = d;
      Q.mo = person('mo', UHR[0] + 3, UHR[1] + 2, 0); Q.selin = person('selin', UHR[0] - 2, UHR[1] - 1, 0);
      for (let i = 0; i < 4; i++) { const [x, z] = D.freeSpot(UHR[0] + 8 + i, UHR[1] - 4 + i * 1.3, 1); const h = D.makeMember(x, z, { black: true, signs: 0 }); Object.assign(h.userData, { state: 'mob', keep: true, throwT: rnd(2, 4), attacker: true }); track(h); Q.att.push(h); }
      if (!W.inv.spray) W.give('spray');
      talk([['Selin', 'Siehst du die Vermummten bei Mo? Die sind nicht von unserer Schule.', 4], ['Mo', 'Ihr mit euren Schildern. Die lachen über uns. Heute brennt hier was.', 4], ['Selin', 'Ich hab dir Pfefferspray in die Tasche gesteckt. Von meiner Schwester. Nur für den Notfall.', 5]], () => {
        // Ein Vermummter wirft einen Brandsatz auf ein geparktes Auto
        let car = cars.filter(c => !c.userData.police && !c.userData.cannon && c.userData.mode !== 'wreck' && c !== player.car && Math.hypot(c.position.x - UHR[0], c.position.z - UHR[1]) < 35)[0];
        if (!car) { const [x, z] = D.freeSpot(U0.x + Math.cos(U0.h) * 2.4, U0.z - Math.sin(U0.h) * 2.4, 2); car = makeCar(false); car.position.set(x, TH(x, z), z); car.userData.heading = U0.h; car.rotation.y = U0.h; car.userData.mode = 'parked'; D.addCar(car); }
        car.userData.mode = 'parked'; car.userData.speed = 0; const a = Q.att[0]; const from = a.position.clone().setY(a.position.y + 1.6); const dir = car.position.clone().setY(car.position.y + 1).sub(from); const L = dir.length(); dir.normalize().multiplyScalar(Math.min(18, 8 + L * 0.5)); dir.y += 2 + L * 0.13; W.spawnProj('molotov', from, dir, 'mob');
        Q.car = car; Q.fireT = 0; Q.go = true; }); },
    update(dt) { const Q = S(); if (!Q.go) return; Q.t4 += dt;
      if (!Q.fire && Q.car) { Q.fireT += dt; if (Q.car.userData.fire) Q.fire = Q.car.userData.fire; else if (Q.fireT > 2.2) Q.fire = F.ignite(Q.car, { I: 0.5, by: 'mob' }); if (Q.fire && !Q.fire.brig) F.dispatch(Q.fire); }
      for (const h of Q.att) { const u = h.userData; if (u.neut) continue; if (!alive(h) || u.hp < 100 || ['stunned', 'flee', 'arrested'].includes(u.state)) { u.neut = true; Q.neut++; Q.flags.protected = Q.neut; if (u.state === 'stunned') u.prevState = 'flee'; else if (alive(h)) { u.state = 'flee'; u.fleeT = 12; } showMsg('VERMUMMTE AUFGEHALTEN ' + Q.neut + '/4', 900); continue; }
        if (u.state !== 'mob') continue; u.t += dt; const b = F.brigades.find(b => b.crew.length); const tgt = b ? b.crew.filter(alive).sort((p, q) => p.position.distanceTo(h.position) - q.position.distanceTo(h.position))[0] : null;
        let tx = h.position.x, tz = h.position.z; if (tgt) { const dx = h.position.x - tgt.position.x, dz = h.position.z - tgt.position.z, L = Math.hypot(dx, dz) || 1; tx = tgt.position.x + dx / L * 10; tz = tgt.position.z + dz / L * 10; }
        const dx = tx - h.position.x, dz = tz - h.position.z, L = Math.hypot(dx, dz); const sp = L > 0.6 ? Math.min(3.5, L) : 0; if (sp) { moveWithCollision(h.position, dx / L * sp * dt, dz / L * sp * dt, 0.3); h.rotation.y = Math.atan2(dx, dz); } else if (tgt) h.rotation.y = Math.atan2(tgt.position.x - h.position.x, tgt.position.z - h.position.z); h.position.y = TH(h.position.x, h.position.z); animateWalk(h, u.t, sp * 2);
        u.throwT -= dt; if (tgt && L < 4 && u.throwT <= 0) { u.throwT = rnd(2.5, 4.5); const from = h.position.clone().setY(h.position.y + 1.6); const dir = tgt.position.clone().setY(tgt.position.y + 1.2).sub(from); const dd = dir.length(); dir.normalize().multiplyScalar(Math.min(17, 7 + dd * 0.6)); dir.y += 1.5 + dd * 0.12; W.spawnProj(Math.random() < 0.5 ? 'banger' : 'paint', from, dir, 'mob'); if (u.mixer) { X.playAnim(h, 'Punch', { once: true, fade: 0.05 }); u.actT = 0.4; } } } },
    steps: [
      { obj: () => S().go ? 'Ein Auto brennt! Die <b>Feuerwehr</b> kommt …' : 'Hör dir an, was Mo vorhat', mark: () => UHR, done: () => !!S().go && !!(S().fire || S().t4 > 4) },
      { obj: () => `Schütze die <b>Feuerwehr</b>: halte die Vermummten auf (${S().neut}/4) – oder film alles mit V`, mark: () => S().att.find(h => !h.userData.neut && alive(h)) || null, done: () => { const Q = S(); const fireOut = Q.fire && !F.fires.includes(Q.fire); return Q.neut >= 4 || (fireOut && Q.t4 > 20) || Q.t4 > 150; } },
    ],
    finish(next) { const Q = S(); const ff = Q.flags.ffBy || 0; Q.flags.night = ff > 0 ? 'mitgemacht' : Q.neut >= 3 ? 'geschuetzt' : 'zugeschaut';
      if (ff > 0) { D.stats.violence += 3; D.addRep('anwohner', -10); D.post('kurier', 'SCHÜLER GREIFEN FEUERWEHR AN! Video zeigt Jugendlichen mit Böllern.', 52000); D.post('feuerwehr', 'Wer uns angreift, greift alle an, denen wir helfen.', 9000); }
      else if (Q.neut >= 3) { D.addRep('anwohner', 10); D.addRep('polizei', 4); D.post('feuerwehr', 'Danke an die jungen Leute, die gestern Abend Vermummte von unseren Kräften ferngehalten haben.', 15000); D.post('kurier', 'Krawall-Nacht in Bornheim: Auto brennt nach Schülertreffen.', 21000); }
      else { D.post('kurier', 'KRAWALL-KIDS ZÜNDEN AUTOS AN! Ist das noch Klimaschutz?', 61000); D.post('selin', 'Das waren nicht wir. Aber das glaubt jetzt keiner mehr.', 4100); D.addRep('kollektiv', -6); }
      talk([['📱 Selin', ff > 0 ? 'Warst du das mit den Böllern? Sag, dass das nicht stimmt.' : Q.neut >= 3 ? 'Du hast die Feuerwehr gerettet. Mo redet nicht mehr mit mir.' : 'Die Zeitungen machen uns alle zu Brandstiftern. Morgen ist die Großdemo – die Polizei wird keinen Spaß verstehen.', 6]], next); } });

  // 5 · WASSERWERFER GEGEN SCHÜLER
  CH.push({ title: 'WASSERWERFER GEGEN SCHÜLER', tag: 'Nach den Bildern der Nacht greift die Polizei früh durch.', start() {
      const Q = S(); Q.flags = Q.flags || {}; if (Q.flags.v0 === undefined) { Q.flags.v0 = D.stats.violence; Q.flags.f0 = D.stats.filmed; } world.hour = 12; Q.esc = false; Q.kT = 0; Q.kessel = false; Q.res = null; Q.adlerAt = null;
      const d = demo({ x: HGS.gate[0], z: HGS.gate[1], n: 26, max: 34, dest: [UHR[0], UHR[1]], banner: 'BILDUNG STATT BONZEN', maxStage: 5 }); d.speed = 1.5; Q.d = d; d.onEnd = r => { Q.res = r; };
      Q.selin = person('selin', HGS.gate[0], HGS.gate[1], 0); Q.selin.userData.noArrest = true; Q.selin.userData.state = 'demo'; Q.selin.userData.demo = d; d.members.splice(4, 0, Q.selin);
      if (!W.inv.smoke) W.give('smoke', 2); else W.give('smoke', 1);
      talk([['Selin', 'Heute laufen auch die Jüngeren mit. Siebte Klasse. Bleib in meiner Nähe.', 5], ['📱 Mo', 'Ich hab dir zwei Rauchtöpfe zugesteckt. Nicht für Krawall – zum Rauskommen.', 5]]); },
    update(dt) { const Q = S(); const d = Q.d; if (!d) return;
      if (!Q.kessel && d.total && d.s / d.total > 0.3 && !d.result) { Q.kessel = true; d.tension = 0.6; D.setStage(d, 1); D.setStage(d, 2); D.setStage(d, 3); D.post('kurier', 'Polizei stoppt Schüler-Demo – „Gefahr nach Krawallnacht"', 8800); }
      if (Q.kessel && d.pol.stage === 3) { Q.kT += dt; if (Q.kT > 22) { d.tension = Math.max(d.tension, 0.8); D.setStage(d, 4); } }
      const s = Q.selin; if (Q.esc && alive(s)) { const u = s.userData; if (u.state === 'flee' || u.state === 'walk' || u.state === 'demo') { if (u.demo) { d.members.splice(d.members.indexOf(s), 1); u.demo = null; } u.state = 'escort'; s.rotation.x = 0; }
        if (u.state === 'escort') { u.t += dt; const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw); const tx = player.pos.x - fx * 1.6, tz = player.pos.z - fz * 1.6; const dx = tx - s.position.x, dz = tz - s.position.z, L = Math.hypot(dx, dz); const sp = L > 0.5 ? clamp(L * 1.5, 0.6, 6.5) : 0; if (sp) { moveWithCollision(s.position, dx / L * sp * dt, dz / L * sp * dt, 0.28); s.rotation.y = Math.atan2(dx, dz); } s.position.y = TH(s.position.x, s.position.z); animateWalk(s, u.t, sp * 2.2); } } },
    steps: [
      { obj: () => demoObj('Lauf mit dem <b>Schülerzug</b>', S().d), mark: () => S().d && !S().d.result ? [S().d.cx, S().d.cz] : null, done: () => !!S().kessel },
      { enter() { const Q = S(); const d = Q.d; const p = D.posAt(d.trail, Math.max(0, d.s - 75)); const [ax, az] = D.freeSpot(p.x + Math.cos(p.h) * 5, p.z - Math.sin(p.h) * 5, 2); Q.adlerAt = [ax, az]; Q.adler = person('adler', ax, az, p.h); const c = makeCar(false, 'wagon'); const [cx, cz] = D.freeSpot(ax + Math.sin(p.h) * 3, az + Math.cos(p.h) * 3, 2); c.position.set(cx, TH(cx, cz), cz); c.userData.heading = p.h; c.rotation.y = p.h; c.userData.mode = 'parked'; D.addCar(c); track(c);
          talk([['📱 Herr Adler', 'Hier ist Adler. Ich steh mit dem Auto hinter der Polizei. Holt die Kleinen da raus!', 5], ['Selin', 'Ich steck fest! Sie kesseln uns ein!', 3]]); },
        obj: '<b>Kessel!</b> Hol Selin raus – geh zu ihr', mark: () => S().selin, fail: () => !alive(S().selin) || S().selin.userData.state === 'arrested' ? 'Selin wurde festgenommen.' : null, done: () => S().selin.position.distanceTo(player.pos) < 2 },
      { enter() { const Q = S(); Q.esc = true; talk([['Selin', 'Ich bleib hinter dir! Aber durch die Kette kommen wir nicht einfach so.', 4], ['Selin', 'Rauch! Oder irgendeine Lücke.', 3]]); },
        obj: 'Bring Selin raus zu <b>Herrn Adler</b> – Rauchtopf (9) macht eine Lücke in der Kette', mark: () => S().adlerAt, fail: () => !alive(S().selin) || S().selin.userData.state === 'arrested' ? 'Selin wurde festgenommen.' : null, done: () => near(S().adlerAt, 4) && S().selin.position.distanceTo(player.pos) < 7 },
    ],
    finish(next) { const Q = S(); X.card('RAUS', 'Herr Adler fährt Selin und drei Siebtklässler nach Hause.', 4); D.post('kurier', 'Polizei: Wasserwerfereinsatz gegen Schüler „verhältnismäßig".', 7400); D.post('selin', 'Ich bin raus. Danke an die, die nicht weggeschaut haben. Wir sehen uns Freitag.', 22000); D.post('adler', 'Ich bin Lehrer. Heute habe ich gelernt.', 30000); D.addRep('kollektiv', 8); D.addRep('polizei', -6);
      talk([['Herr Adler', 'Freitag ist das Finanz-Event am Main. Die Stadt will saubere Bilder. Ihr wollt zum Stadthaus Ost. Passt auf euch auf.', 6]], next); } });

  // 6 · FREITAG IST PFLICHT
  CH.push({ title: 'FREITAG IST PFLICHT', tag: 'Großdemo zum Stadthaus Ost. Die ganze Stadt schaut zu.', start() {
      const Q = S(); Q.flags = Q.flags || {}; if (Q.flags.v0 === undefined) { Q.flags.v0 = D.stats.violence; Q.flags.f0 = D.stats.filmed; } world.hour = 16.5; Q.res = null; const d = demo({ x: LGO.gate[0], z: LGO.gate[1], n: 34, max: 46, dest: STADT, banner: 'FREITAG IST PFLICHT', maxStage: 5, blockAt: 0.5, mob: true, black: 4 }); d.speed = 1.5; startAt(d, 420); Q.d = d; d.onEnd = r => { Q.res = r; }; d.rallyDur = 25;
      Q.selin = person('selin', d.cx, d.cz, 0); Q.selin.userData.state = 'demo'; Q.selin.userData.demo = d; d.members.splice(2, 0, Q.selin);
      Q.mo = person('mo', d.cx + 1, d.cz, 0); Q.mo.userData.state = 'demo'; Q.mo.userData.demo = d; Q.mo.userData.black = true; d.members.push(Q.mo);
      D.post('presse', 'LIVE: Schüler-Großdemo zum Stadthaus Ost. Parallel tagt am Main das Finanzforum.', 26000); D.post('kurier', 'Heute droht der nächste Krawall-Freitag!', 9800); D.post('eltern', 'Wir laufen heute mit. Alle.', 7200);
      talk([['Selin', 'Das ist der letzte Freitag vor den Ferien. Wenn wir heute friedlich ankommen, müssen die uns zuhören.', 5], ['Mo', 'Und wenn nicht, hört uns wenigstens jemand. Du entscheidest, auf welcher Seite du läufst.', 5]]); },
    steps: [
      { obj: () => demoObj('Großdemo zum <b>Stadthaus Ost</b>', S().d), mark: () => S().d && !S().d.result ? [S().d.cx, S().d.cz] : null, done: () => !!S().res },
    ],
    finish(next) { const Q = S(); const v = D.stats.violence - (Q.flags.v0 || 0); const clips = D.stats.filmed - (Q.flags.f0 || 0); const bad = v >= 6 || (Q.flags.ffBy || 0) > 0 || (Q.flags.burned || 0) > 0;
      const end = bad ? 'suendenbock' : (Q.res === 'success' && (clips >= 1 || (Q.flags.protected || 0) >= 3 || D.rep.kollektiv > 40)) ? 'sanierung' : 'spaltung';
      Q.endings = [...new Set([...(Q.endings || []), end])]; Q.flags.lastEnd = end;
      const E = { sanierung: ['ENDE: SANIERUNG', 'Die Stadt gibt das Geld frei. Die Verweise werden zurückgenommen. Die Turnhalle öffnet im Frühjahr.', [['presse', 'Stadt gibt 40 Millionen für Schulsanierung frei – nach wochenlangen Schülerstreiks.', 64000], ['schule', 'Wir haben die Anliegen der Schülerschaft immer ernst genommen.', 40], ['selin', 'Wir haben gewonnen. Und Freitag bleibt Pflicht. 💙', 88000], ['kurier', 'Erpressung durch Schwänzer? Ein Kommentar.', 1900]]],
        suendenbock: ['ENDE: SÜNDENBOCK', 'Mo wird verurteilt. Die Bilder vom Feuer überstrahlen alles. Das Finanzforum läuft wie geplant.', [['kurier', 'Krawall-Schüler Mo M. (17) vor Gericht – die ganze Geschichte.', 120000], ['polizei', 'Wir danken für die zahlreichen Hinweise zu den Ausschreitungen.', 900], ['mo', 'Ich bin nicht der Einzige, der wütend ist. Ich bin nur der, den sie gekriegt haben.', 15000], ['eltern', 'Der Elternrat distanziert sich von jeder Form der Gewalt.', 300]]],
        spaltung: ['ENDE: SPALTUNG', 'Selin gründet eine neue Gruppe, Mo geht mit den Wütenden. Und du stehst dazwischen.', [['presse', 'Schülerbewegung gespalten: „Leise" gegen „Laute".', 21000], ['selin', 'Neue Gruppe: Leise ist auch laut. Wer mitmacht, schreibt mir.', 9000], ['mo', 'Wer jetzt noch Schilder malt, hat nichts verstanden.', 6000], ['schule', 'An der HGS kehrt wieder Ruhe ein.', 25]]] }[end];
      for (const [w, t, l] of E[2]) D.post(w, t, l); X.card(E[0], E[1], 7);
      setTimeout(() => { X.card('FREITAG IST PFLICHT', 'Story 2 abgeschlossen. Freies Spiel geht weiter.', 7); next(); }, 7500); } });

  const ends = { sanierung: 'Sanierung', suendenbock: 'Sündenbock', spaltung: 'Spaltung' };
  return { CH, ends, START, schoolName: HGS.name, places: { HGS: HGS.yard, HGS_GATE: HGS.gate, LGO: LGO.gate, BRS: BRS.gate, STADT, START } };
}

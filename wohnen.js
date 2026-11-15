// Wohnen, Stufe 1 (docs/konzept.md Abschnitt 7, André 15.11.2026: „Wohnung mieten, mindestens 18 €/m², Monatsmiete;
// ohne Geld Räumung mit Polizei“). Kalender (world.tag, ein Spielmonat = 5 Spieltage), Katalog W1–W3 als
// Mietwohnungen, Mietvertrag mit Kaution, Abbuchung am Monatsersten, zwei Mahnungen, Zwangsräumung, Handy-App „Wohnen“.
// Der Tageszähler selbst liegt in game.js (zeitVor zählt über Mitternacht, steht im Spielstand notgta.save); dieses
// Modul rechnet nur damit. Zustand unter notgta.wohnen (Spielstände Format 4). zuhause.js bleibt die Wohnung selbst:
// hier wird nur ihr Ankerpunkt gesetzt und sie ohne Vertrag gesperrt.
// Noch nicht: Kaufen, Darlehen, Häuser H1–H5 (Stufe 2). Die Kauf-Felder im Katalog und `eigentum` im Zustand stehen
// dafür schon bereit. Alle Namen sind erfunden, keine echten Adressen.

/** @param {import('./types').Ctx} X */
export function initWohnen(X) {
  const A = /** @type {any} */ (X);
  const { player, world } = A;
  const MONAT = 5; // Spieltage je Spielmonat
  const KAUTION_MONATE = 2, KEY = 'notgta.wohnen', NAH = 120, WACHE_SEK = 40, WACHE_WEG = 150;
  // Katalog nach Konzept 7.3. anker: Weltpunkt [x, z] in einem Wohnblock (mit Kacheldaten geprüft), das Haus wählt zuhause.js.
  // kaufQm/kauf: Stufe 2. Einträge ohne mieteQm (Häuser) sind später nur zu kaufen.
  const KATALOG = [
    { id: 'W1', art: 'wohnung', name: '1-Zimmer-Altbau', lage: 'Bornheim, Wochenmarkt', ort: 'in Bornheim am Wochenmarkt', anzeige: '„Charmantes Altbau-Apartment für Singles mit zwei Einkommen. Bad mit Fenster zum Flur.“', qm: 38, mieteQm: 18, kaufQm: 6900, kauf: 262000, anker: [-138, 372] },
    { id: 'W2', art: 'wohnung', name: '3-Zimmer-Altbau mit Balkon', lage: 'Nordend', ort: 'im Nordend', anzeige: '„Familienwohnung in gewachsener Nachbarschaft.“ Gewachsen ist vor allem die Miete.', qm: 78, mieteQm: 21, kaufQm: 8200, kauf: 640000, anker: [-980, 720] },
    { id: 'W3', art: 'wohnung', name: 'Neubauwohnung mit Mainblick', lage: 'Ostend, am Hafen', ort: 'im Ostend am Hafen', anzeige: '„Urbanes Wohnen am Wasser.“ Vorher stand hier ein Hafenbetrieb, davor wohnte hier, wer dort arbeitete.', qm: 96, mieteQm: 24, kaufQm: 9400, kauf: 902000, anker: [900, 1960] },
  ];
  const objekt = id => KATALOG.find(o => o.id === id) || null;
  let AUF = {}; // Wohnung → Faktor auf die Miete. Nach einer Räumung wird neu vermietet, 15 % teurer: das Geschäftsmodell hinter mancher Räumung
  const miete = o => (o && o.mieteQm ? Math.round(o.qm * o.mieteQm * (AUF[o.id] || 1)) : 0);
  const eur = v => Math.round(v).toLocaleString('de-DE') + ' €';
  const tage = n => (n === 1 ? '1 Tag' : n + ' Tagen');

  // ---------- Kalender ----------
  const tag = () => Math.max(1, Math.floor(+world.tag || 1));
  const monat = (t = tag()) => Math.floor((t - 1) / MONAT) + 1;
  const tagImMonat = (t = tag()) => ((t - 1) % MONAT) + 1;
  const bisErster = (t = tag()) => MONAT - tagImMonat(t) + 1; // Tage bis zum nächsten Monatsersten

  // ---------- Zustand ----------
  // miete: Katalog-Nr. der Mietwohnung oder null · zuletzt: letzte Wohnung (Tür bleibt dort, verschlossen) · kaution: hinterlegt
  // schuld: offene Miete (läuft der Vertrag: die fällige; ohne Vertrag: Rest nach der Räumung) · stufe: 0 nichts, 1 Mahnung,
  // 2 Räumungsandrohung · stufeTag: Spieltag der ersten Mahnung · monatBezahlt: bis zu diesem Spielmonat ist bezahlt (0 = noch
  // nicht gesetzt) · frei: der laufende Monat ist die Starthilfe · geraeumt: letzte Wohnung per Räumung verloren
  // eigentum: Stufe 2 (gekaufte Objekte mit Darlehen), bleibt hier leer
  const NEU = () => ({ v: 1, miete: 'W1', zuletzt: 'W1', kaution: 0, schuld: 0, stufe: 0, stufeTag: 0, monatBezahlt: 0, frei: true, geraeumt: false, eigentum: [] });
  function lesen() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (d && typeof d === 'object' && d.v === 1) {
        const n = (x, max = 1e9) => (Number.isFinite(+x) && +x > 0 ? Math.min(max, Math.floor(+x)) : 0), s = NEU();
        s.miete = miete(objekt(d.miete)) ? d.miete : null; s.zuletzt = objekt(d.zuletzt) ? d.zuletzt : s.miete || 'W1';
        s.kaution = n(d.kaution); s.schuld = n(d.schuld); s.stufe = s.miete && s.schuld ? Math.max(1, n(d.stufe, 2)) : 0; s.stufeTag = n(d.stufeTag); s.monatBezahlt = n(d.monatBezahlt);
        s.frei = !!d.frei; s.geraeumt = !!d.geraeumt && !s.miete; s.eigentum = Array.isArray(d.eigentum) ? d.eigentum : [];
        AUF = {}; if (d.auf && typeof d.auf === 'object') for (const k of Object.keys(d.auf)) if (KATALOG.some(o => o.id === k) && +d.auf[k] > 1 && +d.auf[k] <= 1.5) AUF[k] = +d.auf[k];
        return s;
      }
    } catch (e) { /* unlesbar: Startzustand */ }
    return NEU(); // neue und bestehende Spieler: W1 gemietet, erster Monat frei, nichts rückwirkend
  }
  let st = lesen(), laeuft = false;
  function speichern() { try { st.auf = AUF; localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { console.warn('wohnen: speichern', e); } }

  // ---------- Meldungen ----------
  const HV = 'Hausverwaltung Rendite & Wert'; // erfunden
  function melde(titel, kurz, lang, sek = 6) {
    try { if (A.PHONE && A.PHONE.nachricht) A.PHONE.nachricht(HV, lang || kurz); } catch (e) { /* ohne Handy */ }
    try { A.card(titel, kurz, sek); } catch (e) { /* ohne HUD */ }
  }

  // ---------- Wohnung in zuhause.js nachführen ----------
  function abgleich() {
    const Z = A.ZUHAUSE; if (!Z || !Z.setzeAnker || laeuft) return;
    const o = objekt(st.miete || st.zuletzt); if (o) Z.setzeAnker(o.anker, o.ort);
    Z.sperren(!st.miete);
  }

  // ---------- Abrechnung ----------
  function pruefen() {
    if (!A.started) return; // vor „Fortsetzen“ steht world.tag noch auf 1
    const t = tag(), m = monat(t); let neu = false;
    // Kalender zurückgesetzt (neues Spiel, älterer Stand geladen): übernehmen, nichts nachfordern
    if (!st.monatBezahlt || m < st.monatBezahlt) { st.monatBezahlt = m; neu = true; }
    if (st.stufe > 0 && t < st.stufeTag) { st.stufeTag = t; neu = true; }
    const o = objekt(st.miete);
    if (o) {
      const r = miete(o);
      if (st.stufe === 0 && m > st.monatBezahlt) { // Monatserster (oder später bemerkt): genau eine Miete, keine Nachforderung für übersprungene Monate
        neu = true;
        if ((player.money || 0) >= r) {
          const vorher = player.money || 0, anteil = vorher > 0 ? Math.round(r / vorher * 100) : 100; player.money -= r; st.monatBezahlt = m; st.frei = false;
          melde('MIETE ABGEBUCHT', `−${eur(r)} · ${anteil} % von allem, was du hattest`, `Miete für Monat ${m} abgebucht: ${eur(r)} (${o.name}, ${o.lage}). Das waren ${anteil} % deines Geldes. Als tragbar gilt ein Drittel des Einkommens.`, 5);
        } else {
          st.stufe = 1; st.stufeTag = t; st.schuld = r; st.frei = false;
          melde('MAHNUNG', `Miete ${eur(r)} offen · Frist: ein Spieltag`, `Mahnung: Die Miete für Monat ${m} (${eur(r)}) konnte nicht abgebucht werden. Bitte innerhalb eines Spieltags in der App „Wohnen“ zahlen. Wir bitten um Verständnis, dass Verständnis nicht Teil des Mietvertrags ist.`);
        }
      }
      if (st.stufe === 1 && t - st.stufeTag >= 1) {
        st.stufe = 2; neu = true;
        melde('ZWEITE MAHNUNG', `Miete ${eur(st.schuld)} offen · morgen wird geräumt`, `Zweite Mahnung: ${eur(st.schuld)} sind weiter offen. Ohne Zahlung wird die Wohnung am nächsten Spieltag geräumt. Für Ihre Wohnung liegen bereits Anfragen vor.`);
      }
      if (st.stufe === 2 && t - st.stufeTag >= 2) { raeumen(); return; }
    }
    if (neu) speichern();
  }

  /** Offenen Betrag ganz zahlen (keine Teilzahlung). */
  function zahlen() {
    if (!(st.schuld > 0)) return { ok: false, grund: 'Nichts offen' };
    if ((player.money || 0) < st.schuld) return { ok: false, grund: `Es fehlen ${eur(st.schuld - (player.money || 0))}` };
    const b = st.schuld; player.money -= b; st.schuld = 0;
    if (st.miete) { st.stufe = 0; st.monatBezahlt = Math.max(st.monatBezahlt, monat()); }
    speichern(); return { ok: true, betrag: b };
  }

  /** Was der Einzug kostet: Kaution (zwei Monatsmieten) + erste Miete, abzüglich der Kaution der bisherigen Wohnung. */
  function kosten(id) {
    const o = objekt(id), r = miete(o); if (!r) return null;
    const kaution = r * KAUTION_MONATE, zurueck = st.miete && !st.schuld ? st.kaution : 0;
    return { miete: r, kaution, erste: r, zurueck, summe: kaution + r - zurueck };
  }
  /** Warum der Vertrag gerade nicht geht (Text) oder '' */
  function hindernis(id) {
    const k = kosten(id); if (!k) return 'Nicht zu mieten';
    if (id === st.miete) return 'Hier wohnst du schon';
    if (laeuft) return 'Gerade nicht möglich';
    if (st.schuld > 0) return `Erst die offene Miete zahlen (${eur(st.schuld)})`;
    if ((player.money || 0) < k.summe) return `Es fehlen ${eur(k.summe - (player.money || 0))}`;
    return '';
  }
  /** Mietvertrag: alte Wohnung endet sofort (Kaution zurück), neue beginnt mit Kaution und erster Miete. */
  function mieten(id) {
    const grund = hindernis(id); if (grund) return { ok: false, grund };
    const o = objekt(id), k = kosten(id);
    player.money -= k.summe; // die alte Kaution ist darin schon gutgeschrieben
    st.miete = id; st.zuletzt = id; st.kaution = k.kaution; st.schuld = 0; st.stufe = 0; st.stufeTag = 0; st.monatBezahlt = monat(); st.frei = false; st.geraeumt = false;
    speichern(); abgleich();
    melde('MIETVERTRAG', `${o.name} · ${o.lage}`, `Mietvertrag für ${o.name} (${o.lage}, ${o.qm} m²): Kaution ${eur(k.kaution)} und erste Miete ${eur(k.erste)} gezahlt${k.zurueck ? ', alte Kaution ' + eur(k.zurueck) + ' zurück' : ''}. Nächste Miete in ${tage(bisErster())}.`, 5);
    return { ok: true, betrag: k.summe };
  }
  /** Kündigen: gilt in Stufe 1 sofort. Kaution zurück; ist Miete offen, wird sie mit der Kaution verrechnet. */
  function kuendigen() {
    const o = objekt(st.miete); if (!o || laeuft) return { ok: false, grund: 'Kein Mietvertrag' };
    const ab = Math.min(st.kaution, st.schuld), zurueck = st.kaution - ab;
    player.money = (player.money || 0) + zurueck; st.schuld -= ab; st.miete = null; st.kaution = 0; st.stufe = 0; st.stufeTag = 0; st.frei = false; st.geraeumt = false;
    speichern(); abgleich();
    melde('GEKÜNDIGT', zurueck ? `Kaution zurück: ${eur(zurueck)}` : 'Die Wohnung ist abgegeben', `Kündigung bestätigt: ${o.name} ist abgegeben.${zurueck ? ' Kaution zurück: ' + eur(zurueck) + '.' : ''}${st.schuld ? ' Offen bleiben ' + eur(st.schuld) + '.' : ''}`, 5);
    return { ok: true, zurueck };
  }

  // ---------- Räumung ----------
  // Zwei Beamte an der Tür: Figuren wie die Streifenbeamten (gleiches Modell, cop: true), aber im Zustand „wache“, den die
  // Figurenschleife nicht bewegt. spawnOfficer selbst geht nicht: copAI räumt Beamte ohne Fahndung sofort wieder ab.
  // Wer sie angreift, bekommt Fahndung wie bei jedem Beamten (die Stellen in game.js/weapons.js fragen nur cop ab); mit
  // Fahndung wechseln sie in den Zustand „cop“ und sind ab da gewöhnliche Polizei (copAI nimmt fest und räumt sie ab).
  const wachen = []; let wacheT = 0, wacheRaf = false;
  function wacheWeg(p) {
    try { A.freeSkel(p); } catch (e) { /* Kastenfigur */ } A.scene.remove(p);
    let i = A.peds.indexOf(p); if (i >= 0) A.peds.splice(i, 1); i = A.shootables.indexOf(p); if (i >= 0) A.shootables.splice(i, 1);
  }
  function wachenStellen(h) {
    if (!h || !A.makeHuman || (A.opts && A.opts.police === false)) return 0;
    const tx = -h.nz, tz = h.nx; let n = 0; // entlang der Fassade, links und rechts der Tür
    for (const s of [-1, 1]) {
      try {
        const x = h.x + h.nx * 1.0 + tx * 1.4 * s, z = h.z + h.nz * 1.0 + tz * 1.4 * s; if (A.solidAt(x, z) >= 0) continue;
        const p = A.makeHuman(false, { model: 'swat', keepColors: true, top: 0x1f3a6b, pants: 0x1a2e52, style: 'jacket', hair: 'cap' });
        p.position.set(x, A.TH(x, z), z); p.rotation.y = h.yaw;
        const gun = A.makeGun(); if (p.userData.hand) p.userData.hand.add(gun); p.userData.gun = gun; p.userData.aiming = false;
        Object.assign(p.userData, { road: A.CITY && A.CITY.roads && A.CITY.roads.length ? A.pick(A.CITY.roads) : null, seg: 0, dir: 1, side: 1, speed: 2.6, hp: 100, state: 'wache', t: 0, cop: true, keep: true, raeumung: true, shotT: 1, car: null, grab: 0, hotT: 0, shots: 0 });
        A.scene.add(p); A.peds.push(p); A.shootables.push(p); wachen.push(p); n++;
      } catch (e) { console.warn('wohnen: Beamter', e); }
    }
    wacheT = performance.now();
    if (n && !wacheRaf) { wacheRaf = true; const f = () => { if (!wachen.length) { wacheRaf = false; return; } for (const p of wachen) { if (p.userData.state === 'wache') { try { A.animateWalk(p, p.userData.t, 0); } catch (e) { /* ohne Animation */ } } } requestAnimationFrame(f); }; requestAnimationFrame(f); }
    return n;
  }
  function wachenTakt() {
    for (let i = wachen.length - 1; i >= 0; i--) {
      const p = wachen[i], u = p.userData;
      if (!A.peds.includes(p) || u.state === 'dead' || u.state === 'cop') { wachen.splice(i, 1); continue; } // tot oder schon gewöhnliche Polizei: die Spielschleife räumt ab
      if (u.state === 'wache' && player.wanted > 0 && !player.dead) { u.state = 'cop'; wachen.splice(i, 1); continue; }
      if (performance.now() - wacheT > WACHE_SEK * 1000 || Math.hypot(p.position.x - player.pos.x, p.position.z - player.pos.z) > WACHE_WEG) { wacheWeg(p); wachen.splice(i, 1); }
    }
  }
  function sperre() { try { if (A.ZUHAUSE && A.ZUHAUSE.sperren) A.ZUHAUSE.sperren(true); } catch (e) { console.warn('wohnen: sperren', e); } }
  /** Zwangsräumung (auch als Testhilfe). Der Zustand wechselt sofort; ist der Spieler in der Nähe, folgt die Szene an der Tür. */
  function raeumen() {
    const o = objekt(st.miete); if (!o || laeuft) return false;
    const Z = A.ZUHAUSE, h = Z && Z.home, drin = !!(Z && Z.inside);
    const nah = !player.dead && (drin || (!!h && Math.hypot(player.pos.x - h.x, player.pos.z - h.z) < NAH));
    AUF[o.id] = 1.15; st.miete = null; st.zuletzt = o.id; st.kaution = 0; st.stufe = 0; st.stufeTag = 0; st.frei = false; st.geraeumt = true; speichern(); // Kaution einbehalten, Mietschuld bleibt
    const rest = st.schuld ? ` Offen bleiben ${eur(st.schuld)}.` : '';
    try { if (A.PHONE && A.PHONE.nachricht) A.PHONE.nachricht(HV, `Die Wohnung (${o.name}, ${o.lage}) wurde geräumt, das Schloss getauscht. Die Kaution wird einbehalten.${rest} Deine Sachen sind eingelagert. Die Wohnung ist ab morgen wieder inseriert, 15 % teurer. Eine neue Wohnung findest du in der App „Wohnen“.`); } catch (e) { /* ohne Handy */ }
    if (!nah) { sperre(); return true; } // weit weg: still, beim nächsten Besuch ist die Tür zu
    try { A.card('ZWANGSRÄUMUNG', drin ? 'Zwei Beamte begleiten dich hinaus. Sie machen ihren Job, die Wohnung macht ab morgen 15 % mehr.' : 'Schloss getauscht. Ab morgen wieder inseriert, 15 % teurer.', 7); } catch (e) { /* ohne HUD */ }
    if (!drin) { sperre(); wachenStellen(h); return true; }
    laeuft = true; // drinnen: abblenden, vor die Tür, aufblenden
    const ov = document.createElement('div'); ov.id = 'wohnenblende';
    ov.style.cssText = 'position:fixed;inset:0;background:#000;color:#ddd;display:flex;align-items:center;justify-content:center;z-index:72;font:700 22px system-ui,sans-serif;opacity:0;transition:opacity .5s;pointer-events:none';
    ov.textContent = 'Die Wohnung wird geräumt …'; document.body.appendChild(ov); setTimeout(() => { ov.style.opacity = '1'; }, 30);
    for (const k in A.keys) A.keys[k] = false;
    setTimeout(() => {
      try { sperre(); wachenStellen(h); for (const k in A.keys) A.keys[k] = false; } catch (e) { console.warn('wohnen: Räumung', e); }
      laeuft = false; abgleich();
      setTimeout(() => { ov.style.opacity = '0'; setTimeout(() => ov.remove(), 550); }, 500);
    }, 800);
    return true;
  }

  // ---------- Missionsliste (missionen.js) ----------
  function zeilen() {
    const t = tag(), o = objekt(st.miete), kal = `Tag ${tagImMonat(t)} von ${MONAT}`;
    if (!o) return [{ k: 'Wohnen', name: 'Ohne Wohnung', info: (st.schuld ? `Offene Mietschuld: ${eur(st.schuld)}. Erst zahlen, dann neu mieten. ` : '') + 'Ohne Wohnung kein Schlafen und kein Kleiderschrank. Neue Wohnung in der App „Wohnen“.', btn: 'App „Wohnen“' }];
    if (st.stufe > 0) return [{ k: 'Wohnen', name: st.stufe === 1 ? 'Mahnung: Miete offen' : 'Räumung droht', info: `${kal} · ${eur(st.schuld)} offen. ${st.stufe === 1 ? 'Frist: ein Spieltag.' : 'Am nächsten Spieltag wird geräumt.'} Zahlen in der App „Wohnen“.`, btn: 'App „Wohnen“' }];
    return [{ k: 'Wohnen', name: 'Miete', info: `${kal} · Miete fällig in ${tage(bisErster(t))} (${eur(miete(o))})${st.frei ? ' · dieser Monat ist frei (Starthilfe)' : ''}`, btn: 'App „Wohnen“' }];
  }
  function oeffnen() { const P = A.PHONE; if (!P) return false; return P.isOpen ? P.openApp('wohnen') : P.open('wohnen'); }

  // ---------- Handy-App „Wohnen“ (phone.js ruft app(seite, { toast, esc })) ----------
  function app(p, H) {
    const esc = H.esc, t = tag(), m = monat(t), o = objekt(st.miete), geld = player.money || 0, z = [];
    const block = (k, name, zeil, knoepfe = '') => z.push(`<div class="ps-pmis"><div class="ps-pmis__k">${esc(k)}</div><b>${esc(name)}</b>${zeil.map(x => `<p>${esc(x)}</p>`).join('')}${knoepfe}</div>`);
    /** @param {string} a @param {string} text @param {{ amber?: boolean, id?: string, aus?: boolean }} [o2] */
    const knopf = (a, text, o2 = {}) => `<button class="ps-pbtn${o2.amber ? ' is-amber' : ''}" data-a="${a}"${o2.id ? ` data-id="${esc(o2.id)}"` : ''}${o2.aus ? ' disabled style="opacity:.5;cursor:default"' : ''}>${esc(text)}</button>`;
    block('Kalender', `Tag ${tagImMonat(t)} von ${MONAT} · Monat ${m}`, [o ? `Nächste Miete in ${tage(bisErster(t))}, am 1. von Monat ${m + 1}.` : 'Kein Mietvertrag.', `Ein Spielmonat hat ${MONAT} Spieltage. Kontostand: ${eur(geld)}`]);
    if (o) {
      const r = miete(o), zl = [`${o.lage} · ${o.qm} m² · ${eur(r)} je Monat (${o.mieteQm} €/m²)`, `Kaution hinterlegt: ${eur(st.kaution)}`];
      if (st.frei) zl.push('Starthilfe: Dieser Monat ist frei.');
      zl.push(st.stufe === 0 ? 'Nichts offen.' : `Offen: ${eur(st.schuld)} · ${st.stufe === 1 ? 'Mahnung, Frist ein Spieltag' : 'zweite Mahnung, am nächsten Spieltag wird geräumt'}`);
      block('Deine Wohnung', o.name, zl, (st.schuld > 0 ? knopf('zahlen', `Jetzt zahlen: ${eur(st.schuld)}`, { amber: true, aus: geld < st.schuld }) + (geld < st.schuld ? `<p>${esc('Es fehlen ' + eur(st.schuld - geld) + '. Teilzahlung zählt nicht.')}</p>` : '') : '') + knopf('kuendigen', 'Mietvertrag kündigen'));
    } else {
      const zl = [st.geraeumt ? 'Die Wohnung wurde geräumt. Schrank und Sachen sind eingelagert, bis du wieder wohnst.' : 'Du hast gerade keinen Mietvertrag.', 'Ohne Wohnung: kein Schlafen, kein Kleiderschrank. Leer stehende Büros gibt es in dieser Stadt genug, Betten darin nicht.'];
      if (st.schuld > 0) zl.push(`Offene Mietschuld: ${eur(st.schuld)}. Sie ist vor einem neuen Vertrag fällig.`);
      block('Ohne Wohnung', 'Kein Zuhause', zl, st.schuld > 0 ? knopf('zahlen', `Mietschuld zahlen: ${eur(st.schuld)}`, { amber: true, aus: geld < st.schuld }) + (geld < st.schuld ? `<p>${esc('Es fehlen ' + eur(st.schuld - geld) + '.')}</p>` : '') : '');
    }
    for (const q of KATALOG) {
      if (!miete(q) || q.id === st.miete) continue;
      const k = kosten(q.id), grund = hindernis(q.id);
      const zl = [q.anzeige, `${q.lage} · ${q.qm} m² · ${eur(k.miete)} je Monat (${(k.miete / q.qm).toFixed(2).replace('.', ',')} €/m²${AUF[q.id] ? ', nach Neuvermietung 15 % teurer' : ''})`, `Kaution ${eur(k.kaution)} + erste Miete ${eur(k.erste)}${k.zurueck ? ' − alte Kaution ' + eur(k.zurueck) : ''} = ${eur(k.summe)} bei Einzug`];
      block('Zu mieten', q.name, zl, knopf('mieten', o ? 'Umziehen' : 'Mieten', { id: q.id, aus: !!grund }) + (grund ? `<p>${esc(grund)}</p>` : ''));
    }
    p.innerHTML = `<div class="ps-plist">${z.join('')}</div><p class="ps-pempty">Kündigung und Umzug gelten in dieser Fassung sofort. Die Kaution kommt zurück, wenn nichts offen ist. Es gibt immer nur eine Mietwohnung.</p>`;
    let sicher = false;
    for (const b of p.querySelectorAll('button[data-a]')) b.addEventListener('click', () => {
      const d = /** @type {HTMLElement} */ (b).dataset; let r = null;
      if (d.a === 'kuendigen' && !sicher) { sicher = true; b.textContent = 'Wirklich kündigen? Noch einmal tippen'; return; }
      if (d.a === 'zahlen') r = zahlen(); else if (d.a === 'mieten') r = mieten(d.id); else if (d.a === 'kuendigen') r = kuendigen();
      if (r) H.toast(r.ok ? (d.a === 'zahlen' ? 'Bezahlt' : d.a === 'mieten' ? 'Mietvertrag geschlossen' : 'Gekündigt') : r.grund, r.ok ? 'success' : 'error');
      app(p, H);
    });
  }

  // ---------- Takt (eigener, keine Zeile in der Spielschleife) ----------
  setInterval(() => { try { abgleich(); pruefen(); wachenTakt(); } catch (e) { console.warn('wohnen', e); } }, 250);

  const api = {
    MONAT, katalog: KATALOG, miete: id => miete(objekt(id)), kosten, hindernis, mieten, kuendigen, zahlen, raeumen, pruefen, zeilen, oeffnen, app,
    get stand() { return JSON.parse(JSON.stringify(st)); }, get tag() { return tag(); }, get monat() { return monat(); }, get tagImMonat() { return tagImMonat(); }, get bisErster() { return bisErster(); },
    get laeuft() { return laeuft; }, get wachen() { return wachen.length; },
    /** Testhilfen: n Spieltage weiter (rechnet sofort ab), Zustand neu aus dem Speicher lesen, Startzustand */
    tagVor(n = 1) { world.tag = tag() + Math.max(0, Math.floor(n)); pruefen(); return tag(); },
    laden() { st = lesen(); abgleich(); return api.stand; },
    zuruecksetzen() { for (const p of wachen.splice(0)) wacheWeg(p); AUF = {}; st = NEU(); speichern(); abgleich(); return api.stand; },
  };
  A.WOHNEN = api; /** @type {any} */ (window).WOHNEN = api;
  return api;
}

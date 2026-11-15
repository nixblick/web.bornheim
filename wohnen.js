// Wohnen, Stufen 1 und 2 (docs/konzept.md Abschnitt 7, André 15.11.2026: „Wohnung mieten, mindestens 18 €/m², Monatsmiete;
// ohne Geld Räumung mit Polizei“). Kalender (world.tag, ein Spielmonat = 5 Spieltage), Katalog W1–W3 als
// Mietwohnungen, Mietvertrag mit Kaution, Abbuchung am Monatsersten, zwei Mahnungen, Zwangsräumung, Handy-App „Wohnen“.
// Stufe 2: W1–W3 und die Häuser H1–H5 kaufen (20 % Eigenkapital + 10 % Nebenkosten bar, 80 % Darlehen), Rate und
// Hausgeld am Monatsersten, Sondertilgung, Verkauf, Zwangsversteigerung. Bewohnt wird immer nur ein Objekt (wohnsitz).
// Der Tageszähler selbst liegt in game.js (zeitVor zählt über Mitternacht, steht im Spielstand notgta.save); dieses
// Modul rechnet nur damit. Zustand unter notgta.wohnen (Spielstände Format 4). zuhause.js bleibt die Wohnung selbst:
// hier wird nur ihr Ankerpunkt gesetzt und sie ohne Vertrag gesperrt.
// Noch nicht: eigener Innenraum je Haus, Fotos, Videos (Stufen 3 und 4). Alle Namen sind erfunden, keine echten Adressen.

/** @param {import('./types').Ctx} X */
export function initWohnen(X) {
  const A = /** @type {any} */ (X);
  const { player, world } = A;
  const MONAT = 5; // Spieltage je Spielmonat
  const KAUTION_MONATE = 2, KEY = 'notgta.wohnen', NAH = 120, WACHE_SEK = 40, WACHE_WEG = 150;
  // Katalog nach Konzept 7.3. anker: Weltpunkt [x, z] in einem Wohnblock (mit Kacheldaten geprüft), das Haus wählt zuhause.js.
  // kauf: Kaufpreis, inserat: Text des Kaufangebots. Einträge ohne mieteQm (Häuser) sind nur zu kaufen. Anker der Häuser:
  // Mittelpunkt eines Wohnhauses im dichtesten Wohnblock des Stadtteils (Kacheldaten, Grenzen aus data/districts.json).
  const KATALOG = [
    { id: 'W1', art: 'wohnung', name: '1-Zimmer-Altbau', lage: 'Bornheim, Wochenmarkt', ort: 'in Bornheim am Wochenmarkt', anzeige: '„Charmantes Altbau-Apartment für Singles mit zwei Einkommen. Bad mit Fenster zum Flur.“', inserat: '„Kapitalanlage oder Eigennutz: vermietet an zuverlässigen Mieter.“ Der Mieter bist du.', qm: 38, mieteQm: 18, kaufQm: 6900, kauf: 262000, anker: [-138, 372] },
    { id: 'W2', art: 'wohnung', name: '3-Zimmer-Altbau mit Balkon', lage: 'Nordend', ort: 'im Nordend', anzeige: '„Familienwohnung in gewachsener Nachbarschaft.“ Gewachsen ist vor allem die Miete.', inserat: '„Frisch aufgeteilt in Eigentum, Stuck erhalten.“ Die Nachbarn von früher nicht.', qm: 78, mieteQm: 21, kaufQm: 8200, kauf: 640000, anker: [-980, 720] },
    { id: 'W3', art: 'wohnung', name: 'Neubauwohnung mit Mainblick', lage: 'Ostend, am Hafen', ort: 'im Ostend am Hafen', anzeige: '„Urbanes Wohnen am Wasser.“ Vorher stand hier ein Hafenbetrieb, davor wohnte hier, wer dort arbeitete.', inserat: '„Wertstabile Lage am Fluss, Concierge im Haus.“ Abends brennt in jedem dritten Fenster Licht.', qm: 96, mieteQm: 24, kaufQm: 9400, kauf: 902000, anker: [900, 1960] },
    { id: 'H1', art: 'haus', name: 'Reihenhaus', lage: 'Riederwald', ort: 'im Riederwald', inserat: '„Reihenmittelhaus in ehemaliger Arbeitersiedlung, ideal für junge Familien mit Erbschaft.“', qm: 105, kauf: 560000, anker: [1870, -84] },
    { id: 'H2', art: 'haus', name: 'Doppelhaushälfte', lage: 'Seckbach', ort: 'in Seckbach', inserat: '„Dörflicher Charme, die Stadt vor der Tür.“ Die andere Hälfte gehört schon der Bank der Nachbarn.', qm: 130, kauf: 790000, anker: [1230, -1824] },
    { id: 'H3', art: 'haus', name: 'Einfamilienhaus mit Garten', lage: 'Bergen-Enkheim', ort: 'in Bergen-Enkheim', inserat: '„Ruhige Wohnlage für Menschen, die es geschafft haben.“ Wohin geschafft, steht im Grundbuch.', qm: 160, kauf: 1150000, anker: [3189, -2987] },
    { id: 'H4', art: 'haus', name: 'Gründerzeit-Stadthaus', lage: 'Sachsenhausen', ort: 'in Sachsenhausen', inserat: '„Seltene Gelegenheit: ganzes Haus, entmietet und kernsaniert.“ Vorher wohnten hier sechs Parteien.', qm: 210, kauf: 1950000, anker: [-1313, 2671] },
    { id: 'H5', art: 'haus', name: 'Villa', lage: 'Westend', ort: 'im Westend', inserat: '„Repräsentatives Anwesen, diskrete Abwicklung.“ Besichtigung nur mit Kapitalnachweis. Preis ohne Komma, dafür mit Punkt.', qm: 320, kauf: 4200000, anker: [-2936, 694] },
  ];
  const objekt = id => KATALOG.find(o => o.id === id) || null;
  let AUF = {}; // Wohnung → Faktor auf die Miete. Nach einer Räumung wird neu vermietet, 15 % teurer: das Geschäftsmodell hinter mancher Räumung
  const miete = o => (o && o.mieteQm ? Math.round(o.qm * o.mieteQm * (AUF[o.id] || 1)) : 0);
  const eur = v => Math.round(v).toLocaleString('de-DE') + ' €';
  const tage = n => (n === 1 ? '1 Tag' : n + ' Tagen');
  // Kaufen (Konzept 7.6): 20 % Eigenkapital + 10 % Nebenkosten bar, Rest Darlehen; 3,6 % Zins + 2 % Tilgung im Jahr auf das
  // Darlehen ergeben die feste Rate je Spielmonat. Hausgeld je m². Verkauf und Versteigerung als Anteil am Kaufpreis.
  const EIGEN = 0.2, NEBEN = 0.1, ZINS = 0.036, ANNU = 0.056, HAUSGELD_QM = 3.5, VERKAUF = 0.92, VERSTEIGERUNG = 0.7;
  const BANK = 'Sparbank Mainufer'; // erfunden
  const darlehenVon = preis => preis - Math.round(preis * EIGEN), rateVon = preis => Math.round(darlehenVon(preis) * ANNU / 12);
  const hausgeld = o => Math.round(o.qm * HAUSGELD_QM);

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
  // Fassung 2 (Stufe 2): eigentum: [{ id, preis, rest (Restschuld des Darlehens), stufe, stufeTag, schuld (offene Rate +
  // Hausgeld), monatBezahlt }] in Katalogreihenfolge · wohnsitz: Katalog-Nr. des bewohnten Objekts (gemietet oder gekauft)
  // oder null · zuletzt: letzter Wohnsitz · bankschuld: Rest nach einer Versteigerung, die das Darlehen nicht gedeckt hat
  // Fassung 1 (nur Miete) wird beim Lesen übernommen: kein Eigentum, Wohnsitz ist die Mietwohnung.
  const NEU = () => ({ v: 2, miete: 'W1', zuletzt: 'W1', kaution: 0, schuld: 0, stufe: 0, stufeTag: 0, monatBezahlt: 0, frei: true, geraeumt: false, eigentum: [], wohnsitz: 'W1', bankschuld: 0 });
  const rang = id => KATALOG.findIndex(o => o.id === id);
  function lesen() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (d && typeof d === 'object' && (d.v === 1 || d.v === 2)) {
        const n = (x, max = 1e9) => (Number.isFinite(+x) && +x > 0 ? Math.min(max, Math.floor(+x)) : 0), s = NEU();
        s.miete = miete(objekt(d.miete)) ? d.miete : null; s.zuletzt = objekt(d.zuletzt) ? d.zuletzt : s.miete || 'W1';
        s.kaution = n(d.kaution); s.schuld = n(d.schuld); s.stufe = s.miete && s.schuld ? Math.max(1, n(d.stufe, 2)) : 0; s.stufeTag = n(d.stufeTag); s.monatBezahlt = n(d.monatBezahlt);
        s.frei = !!d.frei; s.eigentum = [];
        if (d.v === 2 && Array.isArray(d.eigentum)) for (const e of d.eigentum) {
          const o = e && objekt(e.id); if (!o || !o.kauf || s.eigentum.some(q => q.id === o.id)) continue;
          const preis = n(e.preis) || o.kauf, schuld = n(e.schuld);
          s.eigentum.push({ id: o.id, preis, rest: n(e.rest, darlehenVon(preis)), stufe: schuld ? Math.max(1, n(e.stufe, 2)) : 0, stufeTag: n(e.stufeTag), schuld, monatBezahlt: n(e.monatBezahlt) });
        }
        s.eigentum.sort((a, b) => rang(a.id) - rang(b.id));
        if (s.miete && s.eigentum.some(e => e.id === s.miete)) { s.miete = null; s.stufe = 0; } // gekauft beendet den Mietvertrag
        const hat = id => !!id && (id === s.miete || s.eigentum.some(e => e.id === id));
        s.wohnsitz = d.v === 2 && hat(d.wohnsitz) ? d.wohnsitz : s.miete || (s.eigentum[0] ? s.eigentum[0].id : null);
        if (s.wohnsitz) s.zuletzt = s.wohnsitz;
        s.bankschuld = d.v === 2 ? n(d.bankschuld) : 0; s.geraeumt = !!d.geraeumt && !s.wohnsitz;
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
  function melde(titel, kurz, lang, sek = 6, wer = HV) {
    try { if (A.PHONE && A.PHONE.nachricht) A.PHONE.nachricht(wer, lang || kurz); } catch (e) { /* ohne Handy */ }
    try { A.card(titel, kurz, sek); } catch (e) { /* ohne HUD */ }
  }

  // ---------- Wohnung in zuhause.js nachführen ----------
  function abgleich() {
    const Z = A.ZUHAUSE; if (!Z || !Z.setzeAnker || laeuft) return;
    const o = objekt(st.wohnsitz || st.zuletzt); if (o) Z.setzeAnker(o.anker, o.ort);
    Z.sperren(!st.wohnsitz);
  }
  const besitz = id => st.eigentum.find(e => e.id === id) || null;
  /** Der Wohnsitz id ist weg (gekündigt, geräumt, verkauft, versteigert): ein anderes eigenes Objekt wird Wohnsitz, sonst keiner. */
  function verlassen(id) {
    if (st.wohnsitz !== id) return;
    st.zuletzt = id; st.wohnsitz = st.miete && st.miete !== id ? st.miete : (st.eigentum[0] ? st.eigentum[0].id : null);
    if (st.wohnsitz) st.zuletzt = st.wohnsitz;
  }
  /** „Hier wohnen“: Wohnsitz auf ein gemietetes oder gekauftes Objekt legen. */
  function wohnsitzSetzen(id) {
    if (laeuft) return { ok: false, grund: 'Gerade nicht möglich' };
    if (!id || (id !== st.miete && !besitz(id))) return { ok: false, grund: 'Das Objekt ist weder gemietet noch gekauft' };
    if (id === st.wohnsitz) return { ok: false, grund: 'Hier wohnst du schon' };
    st.wohnsitz = id; st.zuletzt = id; st.geraeumt = false; speichern(); abgleich();
    return { ok: true };
  }

  // ---------- Abrechnung ----------
  function pruefen() {
    if (!A.started || laeuft) return; // vor „Fortsetzen“ steht world.tag noch auf 1; während einer Räumungsszene nichts Neues
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
      if (st.stufe === 2 && t - st.stufeTag >= 2) { raeumen(); return; } // Eigentum folgt im nächsten Takt: nie zwei Räumungen übereinander
    }
    // Eigentum in Katalogreihenfolge, nach der Miete: Rate (Zins + Tilgung) und Hausgeld, gleiche Mahnstufen, am Ende Versteigerung
    for (const e of st.eigentum) {
      const q = objekt(e.id);
      if (!e.monatBezahlt || m < e.monatBezahlt) { e.monatBezahlt = m; neu = true; }
      if (e.stufe > 0 && t < e.stufeTag) { e.stufeTag = t; neu = true; }
      if (e.stufe === 0 && m > e.monatBezahlt) {
        const b = belastung(e); neu = true;
        if ((player.money || 0) >= b.summe) {
          player.money -= b.summe; e.rest -= b.tilgung; e.monatBezahlt = m;
          if (b.rate) melde('RATE ABGEBUCHT', `−${eur(b.summe)} · Zins ${eur(b.zins)}, Tilgung ${eur(b.tilgung)}, Hausgeld ${eur(b.hausgeld)}`, `Abbuchung für Monat ${m}, ${q.name} (${q.lage}): ${eur(b.summe)}. Davon ${eur(b.zins)} Zins für die Bank, ${eur(b.tilgung)} Tilgung für dich, ${eur(b.hausgeld)} Hausgeld. ${e.rest > 0 ? 'Restschuld: ' + eur(e.rest) + '.' : 'Das Darlehen ist getilgt. Ab jetzt bleibt nur das Hausgeld.'}`, 5, BANK);
          else melde('HAUSGELD ABGEBUCHT', `−${eur(b.summe)} · ${q.name}`, `Hausgeld für Monat ${m}, ${q.name} (${q.lage}): ${eur(b.summe)}. Das Darlehen ist getilgt, die Bank verdient hier nichts mehr.`, 5, BANK);
        } else {
          e.stufe = 1; e.stufeTag = t; e.schuld = b.summe;
          melde('MAHNUNG DER BANK', `${q.name}: ${eur(b.summe)} offen · Frist: ein Spieltag`, `Mahnung: Rate und Hausgeld für ${q.name} (${eur(b.summe)}, Monat ${m}) konnten nicht abgebucht werden. Bitte innerhalb eines Spieltags in der App „Wohnen“ zahlen. Ihr Zuhause liegt uns am Herzen: Es ist unsere Sicherheit.`, 6, BANK);
        }
      }
      if (e.stufe === 1 && t - e.stufeTag >= 1) {
        e.stufe = 2; neu = true;
        melde('ZWEITE MAHNUNG DER BANK', `${q.name}: ${eur(e.schuld)} offen · morgen wird versteigert`, `Zweite Mahnung: ${eur(e.schuld)} für ${q.name} sind weiter offen. Ohne Zahlung wird das Objekt am nächsten Spieltag zwangsversteigert. Interessenten gibt es. Sie brauchen kein Darlehen.`, 6, BANK);
      }
      if (e.stufe === 2 && t - e.stufeTag >= 2) { versteigern(e.id); return; } // speichert selbst; weitere Objekte im nächsten Takt
    }
    if (neu) speichern();
  }

  // ---------- Eigentum: Rechnung, Kauf, Sondertilgung, Verkauf ----------
  /** Was im nächsten Monat für ein eigenes Objekt abgeht: Zins auf die Restschuld, Tilgung = Rate − Zins (höchstens der Rest), Hausgeld. */
  function belastung(e) {
    const hg = hausgeld(objekt(e.id)); if (!(e.rest > 0)) return { zins: 0, tilgung: 0, rate: 0, hausgeld: hg, summe: hg };
    const zins = Math.round(e.rest * ZINS / 12), tilgung = Math.min(e.rest, Math.max(0, rateVon(e.preis) - zins));
    return { zins, tilgung, rate: zins + tilgung, hausgeld: hg, summe: zins + tilgung + hg };
  }
  /** Alle Zahlen zu einem Angebot oder einem eigenen Objekt (auch für Proben). */
  function rechnung(id) {
    const o = objekt(id); if (!o || !o.kauf) return null;
    const e = besitz(id), preis = e ? e.preis : o.kauf, eigen = Math.round(preis * EIGEN), neben = Math.round(preis * NEBEN), hg = hausgeld(o), rate = rateVon(preis);
    const r = { preis, eigen, neben, bar: eigen + neben, darlehen: preis - eigen, rate, hausgeld: hg, monat: rate + hg, qmPreis: Math.round(preis / o.qm), eigentum: !!e,
      kautionZurueck: !e && st.miete === id ? st.kaution - Math.min(st.kaution, st.schuld) : 0 };
    if (e) { const b = belastung(e); Object.assign(r, { rest: e.rest, offen: e.schuld, stufe: e.stufe, zins: b.zins, tilgung: b.tilgung, naechste: b.summe, verkauf: Math.round(preis * VERKAUF) - e.rest - e.schuld, versteigerung: Math.round(preis * VERSTEIGERUNG) - e.rest - e.schuld }); }
    return r;
  }
  /** Warum der Kauf gerade nicht geht (Text) oder '' */
  function kaufHindernis(id) {
    const r = rechnung(id); if (!r) return 'Nicht zu kaufen';
    if (r.eigentum) return 'Gehört dir schon';
    if (laeuft) return 'Gerade nicht möglich';
    if (st.bankschuld > 0) return `Erst die Restschuld bei der Bank zahlen (${eur(st.bankschuld)})`;
    if ((player.money || 0) < r.bar) return `Es fehlen ${eur(r.bar - (player.money || 0))} Eigenkapital`;
    return '';
  }
  /** Kaufvertrag: Eigenkapital und Nebenkosten bar, der Rest ist Darlehen. Wer die eigene Mietwohnung kauft, beendet den Mietvertrag. */
  function kaufen(id) {
    const grund = kaufHindernis(id); if (grund) return { ok: false, grund };
    const o = objekt(id), r = rechnung(id); let zurueck = 0;
    player.money -= r.bar;
    if (st.miete === id) { // Mietvertrag endet: Kaution zurück, offene Miete wird damit verrechnet
      const ab = Math.min(st.kaution, st.schuld); zurueck = st.kaution - ab; player.money += zurueck;
      st.schuld -= ab; st.miete = null; st.kaution = 0; st.stufe = 0; st.stufeTag = 0; st.frei = false;
    }
    st.eigentum.push({ id, preis: r.preis, rest: r.darlehen, stufe: 0, stufeTag: 0, schuld: 0, monatBezahlt: monat() });
    st.eigentum.sort((a, b) => rang(a.id) - rang(b.id));
    if (!st.wohnsitz) { st.wohnsitz = id; st.zuletzt = id; st.geraeumt = false; } // ohne Wohnung: sofort einziehen
    speichern(); abgleich(); schildT = 0;
    melde('GEKAUFT', `${o.name} · ${o.lage}`, `Kaufvertrag für ${o.name} (${o.lage}, ${o.qm} m²): Kaufpreis ${eur(r.preis)}. Bar gezahlt: ${eur(r.eigen)} Eigenkapital und ${eur(r.neben)} Nebenkosten. Darlehen: ${eur(r.darlehen)}, Rate ${eur(r.rate)} je Monat, dazu ${eur(r.hausgeld)} Hausgeld.${zurueck ? ' Der Mietvertrag endet, Kaution zurück: ' + eur(zurueck) + '.' : ''} Im Grundbuch stehst du. An erster Stelle steht die Bank.`, 6, BANK);
    return { ok: true, betrag: r.bar, zurueck };
  }
  /** Sondertilgung: Betrag in Euro oder 'alles'; höchstens die Restschuld. */
  function tilgen(id, betrag) {
    const e = besitz(id); if (!e) return { ok: false, grund: 'Gehört dir nicht' };
    if (!(e.rest > 0)) return { ok: false, grund: 'Das Darlehen ist getilgt' };
    if (e.schuld > 0) return { ok: false, grund: 'Erst die offene Rate zahlen' };
    const b = betrag === 'alles' ? e.rest : Math.min(e.rest, Math.floor(+betrag || 0)); if (!(b > 0)) return { ok: false, grund: 'Kein Betrag' };
    if ((player.money || 0) < b) return { ok: false, grund: `Es fehlen ${eur(b - (player.money || 0))}` };
    player.money -= b; e.rest -= b; speichern();
    return { ok: true, betrag: b, rest: e.rest };
  }
  /** Erlös (Anteil am Kaufpreis) minus Restschuld und offene Rate: was übrig ist, wird ausgezahlt; was fehlt, bleibt als Bankschuld. */
  function abrechnen(e, anteil) {
    const erloes = Math.round(e.preis * anteil), netto = erloes - e.rest - e.schuld, aus = Math.max(0, netto), fehlt = Math.max(0, -netto);
    player.money = (player.money || 0) + aus; st.bankschuld += fehlt;
    st.eigentum = st.eigentum.filter(q => q !== e);
    return { erloes, rest: e.rest, offen: e.schuld, auszahlung: aus, fehlt };
  }
  /** Verkaufen: 92 % des Kaufpreises minus Restschuld und offene Rate. */
  function verkaufen(id) {
    const e = besitz(id), o = objekt(id); if (!e || laeuft) return { ok: false, grund: e ? 'Gerade nicht möglich' : 'Gehört dir nicht' };
    const a = abrechnen(e, VERKAUF); verlassen(id); speichern(); abgleich(); schildT = 0;
    melde('VERKAUFT', `${o.name} · Auszahlung ${eur(a.auszahlung)}`, `Verkauf von ${o.name} (${o.lage}): Erlös ${eur(a.erloes)}, das sind 92 % deines Kaufpreises; der Rest sind Makler, Notar und Eile. Abgelöst: ${eur(a.rest)} Darlehen${a.offen ? ' und ' + eur(a.offen) + ' offene Rate' : ''}. Auszahlung: ${eur(a.auszahlung)}.${a.fehlt ? ' Offen bleiben ' + eur(a.fehlt) + '.' : ''}`, 6, BANK);
    return { ok: true, ...a };
  }
  /** Rest nach einer Versteigerung zahlen (ganz). */
  function bankZahlen() {
    if (!(st.bankschuld > 0)) return { ok: false, grund: 'Nichts offen' };
    if ((player.money || 0) < st.bankschuld) return { ok: false, grund: `Es fehlen ${eur(st.bankschuld - (player.money || 0))}` };
    const b = st.bankschuld; player.money -= b; st.bankschuld = 0; speichern(); return { ok: true, betrag: b };
  }

  /** Offenen Betrag ganz zahlen (keine Teilzahlung). Ohne id: die Miete; mit Katalog-Nr.: Rate und Hausgeld des Objekts; 'bank': Restschuld. */
  function zahlen(id) {
    if (id === 'bank') return bankZahlen();
    if (id) {
      const e = besitz(id); if (!e || !(e.schuld > 0)) return { ok: false, grund: 'Nichts offen' };
      if ((player.money || 0) < e.schuld) return { ok: false, grund: `Es fehlen ${eur(e.schuld - (player.money || 0))}` };
      const b = e.schuld, hg = hausgeld(objekt(e.id)), zins = e.rest > 0 ? Math.round(e.rest * ZINS / 12) : 0;
      player.money -= b; e.rest -= Math.min(e.rest, Math.max(0, b - hg - zins)); e.schuld = 0; e.stufe = 0; e.stufeTag = 0; e.monatBezahlt = Math.max(e.monatBezahlt, monat());
      speichern(); return { ok: true, betrag: b };
    }
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
    if (besitz(id)) return 'Gehört dir schon';
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
    st.miete = id; st.zuletzt = id; st.wohnsitz = id; st.kaution = k.kaution; st.schuld = 0; st.stufe = 0; st.stufeTag = 0; st.monatBezahlt = monat(); st.frei = false; st.geraeumt = false;
    speichern(); abgleich();
    melde('MIETVERTRAG', `${o.name} · ${o.lage}`, `Mietvertrag für ${o.name} (${o.lage}, ${o.qm} m²): Kaution ${eur(k.kaution)} und erste Miete ${eur(k.erste)} gezahlt${k.zurueck ? ', alte Kaution ' + eur(k.zurueck) + ' zurück' : ''}. Nächste Miete in ${tage(bisErster())}.`, 5);
    return { ok: true, betrag: k.summe };
  }
  /** Kündigen: gilt in Stufe 1 sofort. Kaution zurück; ist Miete offen, wird sie mit der Kaution verrechnet. */
  function kuendigen() {
    const o = objekt(st.miete); if (!o || laeuft) return { ok: false, grund: 'Kein Mietvertrag' };
    const ab = Math.min(st.kaution, st.schuld), zurueck = st.kaution - ab;
    player.money = (player.money || 0) + zurueck; st.schuld -= ab; st.miete = null; st.kaution = 0; st.stufe = 0; st.stufeTag = 0; st.frei = false; st.geraeumt = false;
    verlassen(o.id); speichern(); abgleich();
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
  /**
   * Gemeinsamer Ablauf für Zwangsräumung (Miete) und Zwangsversteigerung (Eigentum): Lage merken, Zustand über `aendern`
   * sofort wechseln, dann die Szene. Nur wenn das Objekt der Wohnsitz war und der Spieler in der Nähe ist, kommen die
   * Beamten; ist er drin, wird abgeblendet und er steht danach vor der Tür. Bleibt ein anderes Objekt, zieht abgleich() um.
   * @param {string} id @param {() => void} aendern @param {{ titel: string, drin: string, draussen: string, blende: string, fern?: string }} T
   */
  function hinaus(id, aendern, T) {
    const Z = A.ZUHAUSE, war = st.wohnsitz === id, h = war && Z ? Z.home : null, drin = war && !!(Z && Z.inside);
    const nah = war && !player.dead && (drin || (!!h && Math.hypot(player.pos.x - h.x, player.pos.z - h.z) < NAH));
    aendern();
    if (!war) { if (T.fern) { try { A.card(T.titel, T.fern, 7); } catch (e) { /* ohne HUD */ } } return; } // nicht bewohnt: nur die Nachricht
    if (!nah) { sperre(); return; } // weit weg: still, beim nächsten Besuch ist die Tür zu
    try { A.card(T.titel, drin ? T.drin : T.draussen, 7); } catch (e) { /* ohne HUD */ }
    if (!drin) { sperre(); wachenStellen(h); return; }
    laeuft = true; // drinnen: abblenden, vor die Tür, aufblenden
    const ov = document.createElement('div'); ov.id = 'wohnenblende';
    ov.style.cssText = 'position:fixed;inset:0;background:#000;color:#ddd;display:flex;align-items:center;justify-content:center;z-index:72;font:700 22px system-ui,sans-serif;opacity:0;transition:opacity .5s;pointer-events:none';
    ov.textContent = T.blende; document.body.appendChild(ov); setTimeout(() => { ov.style.opacity = '1'; }, 30);
    for (const k in A.keys) A.keys[k] = false;
    setTimeout(() => {
      try { sperre(); wachenStellen(h); for (const k in A.keys) A.keys[k] = false; } catch (e) { console.warn('wohnen: Räumung', e); }
      laeuft = false; abgleich();
      setTimeout(() => { ov.style.opacity = '0'; setTimeout(() => ov.remove(), 550); }, 500);
    }, 800);
  }
  /** Zwangsräumung (auch als Testhilfe). Der Zustand wechselt sofort; ist der Spieler in der Nähe, folgt die Szene an der Tür. */
  function raeumen() {
    const o = objekt(st.miete); if (!o || laeuft) return false;
    hinaus(o.id, () => {
      AUF[o.id] = 1.15; st.miete = null; st.kaution = 0; st.stufe = 0; st.stufeTag = 0; st.frei = false; // Kaution einbehalten, Mietschuld bleibt
      if (st.wohnsitz === o.id) { verlassen(o.id); st.geraeumt = !st.wohnsitz; } speichern();
      const rest = st.schuld ? ` Offen bleiben ${eur(st.schuld)}.` : '';
      try { if (A.PHONE && A.PHONE.nachricht) A.PHONE.nachricht(HV, `Die Wohnung (${o.name}, ${o.lage}) wurde geräumt, das Schloss getauscht. Die Kaution wird einbehalten.${rest} Deine Sachen sind eingelagert. Die Wohnung ist ab morgen wieder inseriert, 15 % teurer. Eine neue Wohnung findest du in der App „Wohnen“.`); } catch (e) { /* ohne Handy */ }
    }, { titel: 'ZWANGSRÄUMUNG', drin: 'Zwei Beamte begleiten dich hinaus. Sie machen ihren Job, die Wohnung macht ab morgen 15 % mehr.', draussen: 'Schloss getauscht. Ab morgen wieder inseriert, 15 % teurer.', blende: 'Die Wohnung wird geräumt …', fern: `${o.name}: geräumt, Schloss getauscht.` });
    return true;
  }
  /** Zwangsversteigerung eines eigenen Objekts (auch als Testhilfe): 70 % des Kaufpreises minus Restschuld und offene Rate. */
  function versteigern(id) {
    const e = besitz(id), o = objekt(id); if (!e || laeuft) return false;
    hinaus(id, () => {
      const a = abrechnen(e, VERSTEIGERUNG);
      if (st.wohnsitz === id) { verlassen(id); st.geraeumt = !st.wohnsitz; } speichern(); schildT = 0;
      const ende = a.fehlt ? `Das reicht nicht: Offen bleiben ${eur(a.fehlt)}. Das Haus hat jetzt der Fonds, die Schulden behältst du.` : a.auszahlung ? `Auszahlung an dich: ${eur(a.auszahlung)}.` : 'Für dich bleibt nichts übrig.';
      try { if (A.PHONE && A.PHONE.nachricht) A.PHONE.nachricht(BANK, `Zwangsversteigerung: ${o.name} (${o.lage}) ist versteigert. Den Zuschlag bekam ein Fonds, für 70 % deines Kaufpreises: ${eur(a.erloes)}. Davon gehen ${eur(a.rest)} Restschuld und ${eur(a.offen)} offene Rate an uns. ${ende} Dein Eigenkapital und die Nebenkosten sind verbraucht.`); } catch (x) { /* ohne Handy */ }
    }, { titel: 'ZWANGSVERSTEIGERUNG', drin: 'Zwei Beamte begleiten dich hinaus. Den Zuschlag hat ein Fonds, er zahlt 70 % deines Kaufpreises.', draussen: 'Schloss getauscht. Den Zuschlag hat ein Fonds, für 70 % deines Kaufpreises.', blende: 'Das Objekt wird geräumt …', fern: `${o.name}: versteigert. Den Zuschlag hat ein Fonds.` });
    return true;
  }

  // ---------- Missionsliste (missionen.js) ----------
  function zeilen() {
    const t = tag(), o = objekt(st.miete), kal = `Tag ${tagImMonat(t)} von ${MONAT}`, btn = 'App „Wohnen“', z = [];
    if (!st.wohnsitz) return [{ k: 'Wohnen', name: 'Ohne Wohnung', info: (st.schuld ? `Offene Mietschuld: ${eur(st.schuld)}. Erst zahlen, dann neu mieten. ` : '') + 'Ohne Wohnung kein Schlafen und kein Kleiderschrank. Neue Wohnung in der App „Wohnen“.', btn }];
    if (o && st.stufe > 0) z.push({ k: 'Wohnen', name: st.stufe === 1 ? 'Mahnung: Miete offen' : 'Räumung droht', info: `${kal} · ${eur(st.schuld)} offen. ${st.stufe === 1 ? 'Frist: ein Spieltag.' : 'Am nächsten Spieltag wird geräumt.'} Zahlen in der App „Wohnen“.`, btn });
    else if (o) z.push({ k: 'Wohnen', name: 'Miete', info: `${kal} · Miete fällig in ${tage(bisErster(t))} (${eur(miete(o))})${st.frei ? ' · dieser Monat ist frei (Starthilfe)' : ''}`, btn });
    let summe = 0, rest = 0, ruhig = 0;
    for (const e of st.eigentum) {
      if (e.stufe > 0) z.push({ k: 'Wohnen', name: e.stufe === 1 ? 'Mahnung: Rate offen' : 'Versteigerung droht', info: `${kal} · ${objekt(e.id).name}: ${eur(e.schuld)} offen. ${e.stufe === 1 ? 'Frist: ein Spieltag.' : 'Am nächsten Spieltag wird versteigert.'} Zahlen in der App „Wohnen“.`, btn });
      else { summe += belastung(e).summe; ruhig++; } rest += e.rest;
    }
    if (ruhig) z.push({ k: 'Wohnen', name: 'Eigentum', info: `${kal} · Rate und Hausgeld fällig in ${tage(bisErster(t))} (${eur(summe)})${rest ? ' · Restschuld ' + eur(rest) : ' · schuldenfrei'}`, btn });
    return z;
  }
  function oeffnen(id = 'wohnen') { const P = A.PHONE; if (!P) return false; return P.isOpen ? P.openApp(id) : P.open(id); }
  const PORTAL = 'redscout'; // erfundenes Wohnungsportal (André 15.11.2026): Angebote ansehen und mieten, in der App oder vor Ort am Schild

  // ---------- Handy-App „Wohnen“ (phone.js ruft app(seite, { toast, esc })) ----------
  function app(p, H, modus = 'wohnen') {
    const markt = modus === 'markt';
    const esc = H.esc, t = tag(), m = monat(t), o = objekt(st.miete), geld = player.money || 0, z = [];
    const block = (k, name, zeil, knoepfe = '') => z.push(`<div class="ps-pmis"><div class="ps-pmis__k">${esc(k)}</div><b>${esc(name)}</b>${zeil.filter(Boolean).map(x => `<p>${esc(x)}</p>`).join('')}${knoepfe}</div>`);
    /** @param {string} a @param {string} text @param {{ amber?: boolean, id?: string, b?: string, aus?: boolean }} [o2] */
    const knopf = (a, text, o2 = {}) => `<button class="ps-pbtn${o2.amber ? ' is-amber' : ''}" data-a="${a}"${o2.id ? ` data-id="${esc(o2.id)}"` : ''}${o2.b ? ` data-b="${esc(o2.b)}"` : ''}${o2.aus ? ' disabled style="opacity:.5;cursor:default"' : ''}>${esc(text)}</button>`;
    const kopf = text => z.push(`<div class="ps-pmis__k" data-kopf="${esc(text)}" style="margin:12px 2px 0;font-size:1.05em">${esc(text)}</div>`);
    const zuMieten = q => !!miete(q) && q.id !== st.miete && !besitz(q.id), zuKaufen = q => !!q.kauf && !besitz(q.id);
    if (markt) block(PORTAL, 'Wohnungen in Frankfurt', [`Suche „bezahlbar“: 0 Treffer. Wir zeigen dir stattdessen ${KATALOG.filter(zuMieten).length} andere.`, `Dein Kontostand: ${eur(geld)}. Kaution sind zwei Monatsmieten, die erste Miete kommt sofort dazu.`, 'Kaufen: 20 % Eigenkapital und 10 % Nebenkosten bar, den Rest leiht die Bank. Sie leiht gern dem, der schon hat.']);
    if (!markt) block('Kalender', `Tag ${tagImMonat(t)} von ${MONAT} · Monat ${m}`, [o ? `Nächste Miete in ${tage(bisErster(t))}, am 1. von Monat ${m + 1}.` : 'Kein Mietvertrag.', st.eigentum.length ? `Rate und Hausgeld: am 1. von Monat ${m + 1}, nach der Miete.` : '', `Ein Spielmonat hat ${MONAT} Spieltage. Kontostand: ${eur(geld)}`]);
    const hier = id => (id === st.wohnsitz ? 'Hier wohnst du.' : ''), einziehen = id => (id !== st.wohnsitz ? knopf('wohnsitz', 'Hier wohnen', { id }) : '');
    if (!markt && o) {
      const r = miete(o), zl = [`${o.lage} · ${o.qm} m² · ${eur(r)} je Monat (${o.mieteQm} €/m²)`, `Kaution hinterlegt: ${eur(st.kaution)}`];
      if (st.frei) zl.push('Starthilfe: Dieser Monat ist frei.');
      zl.push(st.stufe === 0 ? 'Nichts offen.' : `Offen: ${eur(st.schuld)} · ${st.stufe === 1 ? 'Mahnung, Frist ein Spieltag' : 'zweite Mahnung, am nächsten Spieltag wird geräumt'}`, hier(o.id));
      block('Deine Wohnung', o.name, zl, (st.schuld > 0 ? knopf('zahlen', `Jetzt zahlen: ${eur(st.schuld)}`, { amber: true, aus: geld < st.schuld }) + (geld < st.schuld ? `<p>${esc('Es fehlen ' + eur(st.schuld - geld) + '. Teilzahlung zählt nicht.')}</p>` : '') : '') + knopf('kuendigen', 'Mietvertrag kündigen') + einziehen(o.id));
    } else if (!markt && !st.wohnsitz) {
      const zl = [st.geraeumt ? 'Die Wohnung wurde geräumt. Schrank und Sachen sind eingelagert, bis du wieder wohnst.' : 'Du hast gerade keinen Mietvertrag.', 'Ohne Wohnung: kein Schlafen, kein Kleiderschrank. Leer stehende Büros gibt es in dieser Stadt genug, Betten darin nicht.'];
      if (st.schuld > 0) zl.push(`Offene Mietschuld: ${eur(st.schuld)}. Sie ist vor einem neuen Vertrag fällig.`);
      block('Ohne Wohnung', 'Kein Zuhause', zl, st.schuld > 0 ? knopf('zahlen', `Mietschuld zahlen: ${eur(st.schuld)}`, { amber: true, aus: geld < st.schuld }) + (geld < st.schuld ? `<p>${esc('Es fehlen ' + eur(st.schuld - geld) + '.')}</p>` : '') : '');
    } else if (!markt && st.schuld > 0) {
      block('Mietschuld', 'Offene Miete', [`Aus dem letzten Mietvertrag sind ${eur(st.schuld)} offen. Sie sind vor einem neuen Mietvertrag fällig.`], knopf('zahlen', `Mietschuld zahlen: ${eur(st.schuld)}`, { amber: true, aus: geld < st.schuld }));
    }
    if (!markt && st.bankschuld > 0) block(BANK, 'Restschuld nach der Versteigerung', [`Offen: ${eur(st.bankschuld)}. Solange gibt es kein neues Darlehen. Mieten geht weiter.`], knopf('zahlen', `Restschuld zahlen: ${eur(st.bankschuld)}`, { amber: true, id: 'bank', aus: geld < st.bankschuld }) + (geld < st.bankschuld ? `<p>${esc('Es fehlen ' + eur(st.bankschuld - geld) + '.')}</p>` : ''));
    for (const e of markt ? [] : st.eigentum) {
      const q = objekt(e.id), r = rechnung(e.id);
      const zl = [`${q.lage} · ${q.qm} m² · gekauft für ${eur(e.preis)}`,
        e.rest > 0 ? `Restschuld: ${eur(e.rest)} von ${eur(r.darlehen)} Darlehen` : 'Das Darlehen ist getilgt. Es bleibt das Hausgeld.',
        e.rest > 0 ? `Nächster Monat: Zins ${eur(r.zins)} + Tilgung ${eur(r.tilgung)} + Hausgeld ${eur(r.hausgeld)} = ${eur(r.naechste)}` : `Hausgeld: ${eur(r.hausgeld)} je Monat`,
        e.stufe === 0 ? 'Nichts offen.' : `Offen: ${eur(e.schuld)} · ${e.stufe === 1 ? 'Mahnung der Bank, Frist ein Spieltag' : 'zweite Mahnung, am nächsten Spieltag wird versteigert'}`,
        `Verkauf heute: 92 % des Kaufpreises minus Restschuld${e.schuld ? ' und offene Rate' : ''} = ${eur(Math.max(0, r.verkauf))}`, hier(e.id)];
      let kn = e.schuld > 0 ? knopf('zahlen', `Jetzt zahlen: ${eur(e.schuld)}`, { amber: true, id: e.id, aus: geld < e.schuld }) + (geld < e.schuld ? `<p>${esc('Es fehlen ' + eur(e.schuld - geld) + '. Teilzahlung zählt nicht.')}</p>` : '') : '';
      if (e.rest > 0 && !e.schuld) kn += `<p>${esc('Sondertilgung:')}</p>` + [1000, 10000].filter(b => b < e.rest).map(b => knopf('tilgen', eur(b), { id: e.id, b: String(b), aus: geld < b })).join('') + knopf('tilgen', `alles (${eur(e.rest)})`, { id: e.id, b: 'alles', aus: geld < e.rest });
      block('Dein Eigentum', q.name, zl, kn + knopf('verkaufen', 'Verkaufen', { id: e.id }) + einziehen(e.id));
    }
    if (!markt) z.push(`<div class="ps-pbtns">${knopf('markt', 'Angebote bei ' + PORTAL)}</div>`);
    if (markt) kopf('Mieten');
    for (const q of markt ? KATALOG : []) {
      if (!zuMieten(q)) continue;
      const k = kosten(q.id), grund = hindernis(q.id);
      const zl = [q.anzeige, `${q.lage} · ${q.qm} m² · ${eur(k.miete)} je Monat (${(k.miete / q.qm).toFixed(2).replace('.', ',')} €/m²${AUF[q.id] ? ', nach Neuvermietung 15 % teurer' : ''})`, `Kaution ${eur(k.kaution)} + erste Miete ${eur(k.erste)}${k.zurueck ? ' − alte Kaution ' + eur(k.zurueck) : ''} = ${eur(k.summe)} bei Einzug`];
      block('Zu mieten', q.name, zl, knopf('mieten', o ? 'Umziehen' : 'Mieten', { id: q.id, aus: !!grund }) + (grund ? `<p>${esc(grund)}</p>` : ''));
    }
    if (markt) kopf('Kaufen');
    for (const q of markt ? KATALOG : []) {
      if (!zuKaufen(q)) continue;
      const r = rechnung(q.id), grund = kaufHindernis(q.id);
      const zl = [q.inserat, `${q.lage} · ${q.qm} m² · Kaufpreis ${eur(r.preis)} (${eur(r.qmPreis)}/m²)`, `Bar bei Kauf: Eigenkapital ${eur(r.eigen)} + Nebenkosten ${eur(r.neben)} = ${eur(r.bar)}`, `Darlehen ${eur(r.darlehen)} · je Monat: Rate ${eur(r.rate)} + Hausgeld ${eur(r.hausgeld)} = ${eur(r.monat)}`,
        st.miete === q.id ? `Du wohnst hier zur Miete. Mit dem Kauf endet der Mietvertrag${r.kautionZurueck ? ', Kaution zurück: ' + eur(r.kautionZurueck) : ''}.` : ''];
      block('Zu kaufen', q.name, zl, knopf('kaufen', 'Kaufen', { id: q.id, aus: !!grund }) + (grund ? `<p>${esc(grund)}</p>` : ''));
    }
    p.innerHTML = `<div class="ps-plist">${z.join('')}</div><p class="ps-pempty">Kündigung und Umzug gelten in dieser Fassung sofort. Die Kaution kommt zurück, wenn nichts offen ist. Es gibt immer nur eine Mietwohnung, Eigentum beliebig viel. Bewohnbar ist immer nur der aktuelle Wohnsitz.</p>`;
    /** @type {Record<string, string>} */ const FRAGE = { kuendigen: 'Wirklich kündigen? Noch einmal tippen', verkaufen: 'Wirklich verkaufen? Noch einmal tippen', kaufen: 'Verbindlich kaufen? Noch einmal tippen' };
    /** @type {Record<string, string>} */ const OK = { zahlen: 'Bezahlt', mieten: 'Mietvertrag geschlossen', kuendigen: 'Gekündigt', kaufen: 'Gekauft', verkaufen: 'Verkauft', tilgen: 'Sondertilgung gebucht', wohnsitz: 'Wohnsitz gewechselt' };
    let sicher = '';
    for (const b of p.querySelectorAll('button[data-a]')) b.addEventListener('click', () => {
      const d = /** @type {HTMLElement} */ (b).dataset, a = d.a || ''; let r = null;
      if (FRAGE[a] && sicher !== a + (d.id || '')) { sicher = a + (d.id || ''); b.textContent = FRAGE[a]; return; }
      if (a === 'markt') { oeffnen('redscout'); return; }
      if (a === 'zahlen') r = zahlen(d.id); else if (a === 'mieten') r = mieten(d.id); else if (a === 'kuendigen') r = kuendigen();
      else if (a === 'kaufen') r = kaufen(d.id); else if (a === 'verkaufen') r = verkaufen(d.id); else if (a === 'tilgen') r = tilgen(d.id, d.b === 'alles' ? 'alles' : +(d.b || 0)); else if (a === 'wohnsitz') r = wohnsitzSetzen(d.id);
      if (r) H.toast(r.ok ? OK[a] : r.grund, r.ok ? 'success' : 'error');
      app(p, H, modus);
    });
  }

  // ---------- Vor Ort: Schild „Zu vermieten“ / „Zu verkaufen“ an freien Objekten (F öffnet das Angebot im Portal) ----------
  // art: 'M' zu vermieten, 'K' zu verkaufen, 'MK' beides auf einem Schild, '' kein Schild (eigenes Objekt)
  const schilder = new Map(); let schildMat = null, schildT = 0;
  const schildArt = q => (besitz(q.id) ? '' : (miete(q) && q.id !== st.miete ? 'M' : '') + (q.kauf ? 'K' : ''));
  function schildTafel(art) {
    const T = A.THREE; if (schildMat.tafel[art]) return schildMat.tafel[art];
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 160; const c = cv.getContext('2d');
    c.fillStyle = '#c62828'; c.fillRect(0, 0, 256, 160); c.fillStyle = '#fff'; c.textAlign = 'center';
    if (art === 'MK') { c.font = '800 29px system-ui, Arial, sans-serif'; c.fillText('ZU VERMIETEN', 128, 46); c.fillRect(40, 60, 176, 3); c.fillText('ZU VERKAUFEN', 128, 98); }
    else { c.font = '800 44px system-ui, Arial, sans-serif'; c.fillText('ZU', 128, 52); c.fillText(art === 'K' ? 'VERKAUFEN' : 'VERMIETEN', 128, 100); }
    c.font = '600 22px system-ui, Arial, sans-serif'; c.fillText(PORTAL, 128, 138);
    const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4; tex.userData.shared = true;
    const m = new T.MeshBasicMaterial({ map: tex, side: T.DoubleSide }); m.userData.shared = true; return (schildMat.tafel[art] = m);
  }
  function schildBauen(q, art) {
    const T = A.THREE, r = A.nearestRoadDir && A.nearestRoadDir(q.anker[0], q.anker[1], 45); if (!T || !r || !(r.w > 0)) return null;
    const ux = Math.sin(r.ang), uz = Math.cos(r.ang); let nx = uz, nz = -ux; if ((q.anker[0] - r.x) * nx + (q.anker[1] - r.z) * nz < 0) { nx = -nx; nz = -nz; } // zur Hausseite
    let x = 0, z = 0, frei = false; // am Fahrbahnrand; steht dort ein Haus oder eine zweite Fahrbahn, ein paar Meter die Straße entlang
    for (const v of [0, 3, -3, 6, -6]) { x = r.x + nx * (r.w / 2 + 1.3) + ux * v; z = r.z + nz * (r.w / 2 + 1.3) + uz * v; if (A.solidAt(x, z) < 0 && !(A.rasenRoad && A.rasenRoad(x, z))) { frei = true; break; } }
    if (!frei) return null;
    if (!schildMat) { schildMat = { tafel: {}, pfahl: new T.MeshLambertMaterial({ color: 0x55585e }) }; schildMat.pfahl.userData.shared = true; }
    const g = new T.Group(), y = A.TH(x, z);
    const pf = new T.Mesh(new T.BoxGeometry(0.08, 2.2, 0.08), schildMat.pfahl); pf.position.set(0, 1.1, 0); g.add(pf);
    const ta = new T.Mesh(new T.PlaneGeometry(1.1, 0.7), schildTafel(art)); ta.position.set(0, 1.9, 0.05); g.add(ta);
    g.position.set(x, y, z); g.rotation.y = Math.atan2(-nx, -nz); /* Tafel zeigt zur Straße */ g.userData.noChunk = true; g.userData.id = q.id; g.userData.x = x; g.userData.z = z; A.scene.add(g); return g;
  }
  function schildWeg(id) { const g = schilder.get(id); if (!g) return; schilder.delete(id); if (g.parent) { A.scene.remove(g); for (const m of g.children) m.geometry.dispose(); } }
  function schilderTakt() {
    const now = performance.now(); if (now - schildT < 1500) return; schildT = now;
    for (const q of KATALOG) { const art = schildArt(q), nah = Math.hypot(player.pos.x - q.anker[0], player.pos.z - q.anker[1]) < 170, alt = schilder.get(q.id);
      if (art && nah && (!alt || alt.userData.art !== art || (!alt.children.length && now - alt.userData.t > 4000))) { if (alt) schildWeg(q.id); let g = null; try { g = schildBauen(q, art); } catch (e) { g = null; } g = g || new A.THREE.Group(); /* leer: Straße noch nicht geladen, später noch einmal */ g.userData.art = art; g.userData.t = now; schilder.set(q.id, g); }
      else if ((!art || !nah) && alt) schildWeg(q.id); }
  }
  A.fHooks = A.fHooks || [];
  A.fHooks.push(() => { if (player.car || player.dead) return null; for (const [id, g] of schilder) { if (!g.children.length) continue; if ((player.pos.x - g.userData.x) ** 2 + (player.pos.z - g.userData.z) ** 2 > 9) continue; const q = objekt(id), art = g.userData.art, was = [art.includes('M') ? `zu vermieten für ${eur(miete(q))} im Monat` : '', art.includes('K') ? `zu verkaufen für ${eur(q.kauf)}` : ''].filter(Boolean).join(', '); return { label: `F · ${q.name}: ${was} · Angebot ansehen`, act: () => { oeffnen('redscout'); } }; } return null; });

  // ---------- Takt (eigener, keine Zeile in der Spielschleife) ----------
  setInterval(() => { try { abgleich(); pruefen(); wachenTakt(); schilderTakt(); } catch (e) { console.warn('wohnen', e); } }, 250);

  const api = {
    MONAT, katalog: KATALOG, miete: id => miete(objekt(id)), kosten, hindernis, mieten, kuendigen, zahlen, raeumen, pruefen, zeilen, oeffnen, app,
    /** Stufe 2: Kauf mit Darlehen. rechnung(id) liefert alle Zahlen; wohnsitz(id) = „Hier wohnen“ */
    rechnung, kaufHindernis, kaufen, verkaufen, tilgen, versteigern, wohnsitz: wohnsitzSetzen,
    get stand() { return JSON.parse(JSON.stringify(st)); }, get tag() { return tag(); }, get monat() { return monat(); }, get tagImMonat() { return tagImMonat(); }, get bisErster() { return bisErster(); },
    get laeuft() { return laeuft; }, get wachen() { return wachen.length; },
    /** gebaute Schilder [[id, x, z, art], …], art 'M' zu vermieten, 'K' zu verkaufen, 'MK' beides (für Proben) */ get schilder() { return [...schilder].filter(([, g]) => g.children.length).map(([id, g]) => [id, Math.round(g.userData.x), Math.round(g.userData.z), g.userData.art]); }, oeffnenMarkt: () => oeffnen('redscout'),
    /** Testhilfen: n Spieltage weiter (rechnet sofort ab), Zustand neu aus dem Speicher lesen, Startzustand */
    tagVor(n = 1) { world.tag = tag() + Math.max(0, Math.floor(n)); pruefen(); return tag(); },
    laden() { st = lesen(); abgleich(); return api.stand; },
    zuruecksetzen() { for (const p of wachen.splice(0)) wacheWeg(p); AUF = {}; st = NEU(); speichern(); abgleich(); schildT = 0; return api.stand; },
  };
  A.WOHNEN = api; /** @type {any} */ (window).WOHNEN = api;
  return api;
}

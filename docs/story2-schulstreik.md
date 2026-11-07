# Story 2: Schulstreik (Plan)

Arbeitstitel: **„Freitag ist Pflicht“**

Status: gebaut (`story2.js`, `fire.js`). Abweichungen vom Plan: Kapitel 1 spielt auf dem Schulhof statt im Gebäude (keine Innenräume), Kapitel 3 ohne Fahrrad, das Finale führt zum fiktiven „Stadthaus Ost“ (Saalbau-Gebäude als Kulisse). Story 1 „Bornheim bleibt“ dient als technische Grundlage. Demo-System, Polizei-Eskalation, Wasserwerfer, Feed, Ruf und Missionsablauf werden wiederverwendet.

Alle Personen, Schulen, Firmen und Accounts sind erfunden. Reale Schulen aus den Kartendaten bleiben nur Kulisse und tragen im Spiel andere Namen.

## Ton

Härter als Story 1. Story 1 ist bissige Satire mit Happy End als Möglichkeit. Story 2 erzählt, wie eine friedliche Schülerdemo kippt. Brennende Autos und Feuerwehreinsätze sind hier keine Belohnung, sondern Folgen, die das Spiel spürbar macht: Der Feed dreht, Mitschüler werden festgenommen, die eigene Bewegung verliert Rückhalt.

Bezug zu echten Ereignissen nur allgemein: Schulstreiks fürs Klima, überfüllte und marode Schulen, Prüfungsdruck, Wohnungsnot von Familien. Keine Nachstellung eines bestimmten realen Tages und keine echten Namen.

## Ausgangslage

- Die Hauptfigur ist 17, Abschlussjahrgang an der fiktiven „Helmholtz-Gesamtschule Bornheim“.
- Das Dach der Turnhalle ist seit zwei Jahren gesperrt, im Sommer hat es 34 °C im Klassenraum.
- Die Stadt streicht das Sanierungsgeld und finanziert stattdessen das Sicherheitskonzept für ein Finanz-Event am Main.
- Die Schulleitung droht allen, die freitags streiken, mit Verweisen. Prüfungen werden bewusst auf Freitag gelegt.

## Figuren

| Figur | Rolle |
|---|---|
| Mo (17) | Klassensprecher, will Wirkung und Schlagzeilen, wird radikaler |
| Selin (16) | Organisiert über den Gruppenchat, bleibt bei friedlichem Protest |
| Herr Adler | Vertrauenslehrer, hilft heimlich, riskiert seinen Job |
| Dr. Kessler | Schulleiterin, setzt die Verweise durch |
| Kim | aus Story 1, taucht als erfahrene Aktivistin auf (wenn Story 1 gespielt) |
| Einsatzleiter Rothe | Polizei, will „klare Bilder“ vor dem Finanz-Event |
| Feuerwehrfrau Yıldız | rückt bei Bränden aus, wird vom Mob bedrängt, wenn es eskaliert |

## Neue Systeme

1. **Schulhof als Startpunkt.** Pausenklingel, Schüler strömen auf den Hof. Bei Streik gehen sie geschlossen raus statt rein.
2. **Schülermenge.** Jüngere Figuren (kleiner skaliert), Rucksäcke, selbst gemalte Pappschilder, Handys hoch. Wiederverwendung von `makeMember` mit eigenem Look.
3. **Feuer.** Brennende Mülltonnen, brennende Autos als Zustand (Flammen-Partikel, Lichtquelle, Rauchsäule, Hitzeschaden in der Nähe, Ausbreitung auf Nachbarautos nach Zeit). Auslöser: Bengalos in Mülltonnen, Brandsätze von Randalierern (nicht vom Spieler werfbar in Story 2, nur im Kreativmodus), Granaten.
4. **Feuerwehr.** Löschfahrzeug als Fahrzeug wie der Wasserwerfer (Wiederverwendung von Aufbau und Strahl), Feuerwehrleute mit Schlauch. Sie rücken bei jedem Brand an, sperren ab und löschen. Werden sie angegriffen, stoppt der Einsatz und das Feuer breitet sich aus.
5. **Mob-Dynamik.** Eine zweite Gruppe (vermummte Ältere, nicht von der Schule) schließt sich bei hoher Spannung an. Sie zündet Autos an und greift Polizei an. Der Spieler kann sie stoppen, ignorieren oder mitmachen.
6. **Social Feed mit Gegenwind.** Fake-Videos tauchen auf, ein Boulevard-Account macht aus allen Schülern „Krawall-Kids“. Der Spieler kann echte Clips posten (Filmen mit V), um zu kontern.
7. **Folgen in der Welt.** Nach Kapitel 4 bleiben ausgebrannte Autos tagelang stehen (Wracks im Spielstand), Polizeipräsenz an Schulen steigt, Passanten reagieren auf den Spieler.

## Kapitel

1. **Hitzefrei, abgelehnt.** Klassenraum mit 34 °C, Schulleitung verweigert Hitzefrei. Aufgabe: Flyer im Schulgebäude verteilen, ohne von der Aufsicht erwischt zu werden (Schleichen).
2. **Freitag.** Pausenklingel, Streik. Den Schulhof leeren und die Menge an der Schulleitung vorbei auf die Straße führen. Verweise fliegen als Push-Nachrichten.
3. **Sternmarsch.** Drei Schulen laufen von drei Seiten zum Uhrtürmchen. Der Spieler hält Kontakt zu allen Zügen (Fahrrad), die Polizei will die Züge trennen.
4. **Die Nacht danach.** Abends Versammlung, ein Teil will „mehr Druck“. Vermummte zünden ein Auto an. Feuerwehr rückt an, wird mit Flaschen beworfen. Der Spieler entscheidet: Feuerwehr schützen, filmen oder mitmachen.
5. **Wasserwerfer gegen Schüler.** Am nächsten Tag Großdemo, die Polizei setzt nach den Bildern der Nacht früh Wasserwerfer ein. Ziel: Selin und die Jüngeren aus dem Kessel holen.
6. **Freitag ist Pflicht.** Finale vor dem Rathaus-Ersatz (fiktives „Stadthaus Ost“) während des Finanz-Events. Enden abhängig von Gewalt, Ruf und gefilmten Beweisen:
   - **Sanierung:** Die Stadt gibt das Geld frei, Verweise werden zurückgenommen.
   - **Sündenbock:** Mo wird verurteilt, die Bewegung zerfällt, das Event läuft weiter.
   - **Spaltung:** Selin gründet eine neue Gruppe, der Spieler steht zwischen beiden Lagern.

## Technische Schritte

1. Feuer-System in `weapons.js` (Brandzustand für Autos, Mülltonnen als neue Objekte, Ausbreitung, Lichtpool erweitern).
2. Feuerwehr in `demo.js` neben dem Wasserwerfer (Fahrzeug, Besatzung, Löschlogik, Absperrband).
3. Schüler-Look und Schulhof-Ablauf (Klingel, Pausenhof, Ausströmen) als eigenes Modul `school.js`.
4. Mob-Gruppe als zweite Fraktion in der Demo mit eigener Spannung.
5. Feed-Erweiterung: Fake-Videos und Gegenclips.
6. Story-Modul `story2.js` mit dem Missionsablauf aus `story.js` (Kapitel, Ziele, Marker, Dialoge, Enden).
7. Selbsttest: Feuer breitet sich aus und lässt sich löschen, Feuerwehr erreicht den Brand, keine Toten ohne Zutun des Spielers.
8. Webseite: Abschnitt „Storys“ um Story 2 ergänzen.

Grobe Größe: etwa so viel Arbeit wie Story 1. Feuer und Feuerwehr zuerst, weil sie auch im freien Spiel und im Kreativmodus wirken.

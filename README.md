# web.bornheim

Spielen: https://nixblick.github.io/web.bornheim/

Open-World-Spiel im Browser: ganz Frankfurt am Main aus echten OpenStreetMap-Daten und dem Geländemodell DGM1 Hessen,
Figur (Mann/Frau), Autos klauen, Waffe, Passanten, Polizei. Kein Nachbau, keine Marken.

## Aufbau

- `index.html`: Webseite (Startseite mit Bildern, Funktionen, Grafikstufen, Steuerung)
- `play.html` + `game.js`: das Spiel (Welt, Fahren, Passanten, HUD); die Welt lädt 500-m-Kacheln um den Spieler und baut sie schrittweise auf (Zeitbudget je Bild), entfernte Kacheln werden abgebaut
- `weapons.js`: Waffen, Wurfsachen, Pyro, Farbe, Rauch, Licht, Feuerwerk
- `demo.js`: Demos, Polizei-Eskalation (Begleitung, Kette, Kessel, Wasserwerfer, Räumung), Social Feed, Ruf, Leute sammeln, Filmen
- `story.js`: Story-Engine (Kapitel, Ziele, Marker, GPS, Dialoge, Menü) und Story 1 „Bornheim bleibt“ (fünf Kapitel, drei Enden)
- `story2.js`: Story 2 „Freitag ist Pflicht“ (Schulstreik, sechs Kapitel, drei Enden), Plan in `docs/story2-schulstreik.md`
- `story3.js`: Story 3 „Der Kanzler kommt“ (Sicherheitszone, Bürgerdialog mit Gästeliste, Kolonne gegen Fragen; drei Kapitel, drei Enden). In allen Story-Kapiteln sperrt die Engine Waffen (`WPN.lock`): Story 1 und 2 lassen Fäuste und Demo-Zubehör zu, Story 3 nur Fäuste
- `fire.js`: Feuer (Autos, Mülltonnen, Brandflächen, Ausbreitung) und Feuerwehr (Löschfahrzeug, Trupp mit Schlauch, Absperrung, Rückzug bei Angriffen)
- `credits.html`, `impressum.html`: Lizenzen, Impressum und Datenschutz (Impressum vor Veröffentlichung ausfüllen!)
- `vendor/three/`: three.js 0.170 lokal (`tools/vendor_three.py`), kein CDN, keine Drittanbieter
- `assets/site/`: Bilder, Icon und Stylesheet der Webseite, `manifest.webmanifest` für „Zum Startbildschirm hinzufügen“
- Kein Login: Spielstand und Einstellungen im localStorage, Spielstand als Datei exportier- und importierbar

## Lokal starten

```
python -m http.server 8765
```
Dann http://127.0.0.1:8765/ öffnen. Jeder statische Webserver reicht (GitHub Pages, NAS, beliebiger Hoster).

## Tests

`tools/selftest.js` im Spiel laden: `await import('/tools/selftest.js'); await T.checks()` (Ablauf im Skill `.claude/skills/spieltest`).

## Steuerung

WASD laufen, Maus umschauen, Shift rennen, Leertaste springen, E Auto klauen/aussteigen,
Linksklick schießen, R nachladen, Enter nach dem Tod, C Kreativmodus. Start: Mann oder Frau wählen.

## Stand

- Stadt aus OSM: Gebäude (extrudiert, Fassadentextur mit Fenstern, Dächer), Straßen mit Asphalt,
  Bürgersteige, Wege, Straßenbahnschienen, Grünflächen, Bäume, Laternen mit Lichtschein, Ampeln
- Abendstimmung, beleuchtete Fenster, Straßenname und Minimap im HUD
- Autos: geparkt und fahrend (folgen den Straßen), klauen, Fahrer rauszerren, Schaden, Explosion
- 13 Waffen (1–0, Mausrad, Q): Fäuste, Schläger, Pistole, MP, Schrotflinte, Gewehr, Pfefferspray, Taser, Farbbeutel, Böller, Rauchtopf, Bengalo, Granate; Waffen-Pickups in der Stadt
- Demos: spontan oder selbst angeführt (G sammelt junge Leute), Schilder, Transparent, Sprechchöre (optional vorgelesen), Trommeln und Pfeifen; Polizei eskaliert nach Spannung, mit G deeskalieren; Wasserwerfer auch selbst fahrbar; Filmen mit V für den Feed
- Story 1 „Bornheim bleibt“: Start durch Demo anführen oder mitlaufen, lila B am Uhrtürmchen oder Menü; Missionsziele, GPS auf der Minikarte, Dialoge, Ruf bei Kollektiv, Polizei, Anwohnern und Investor
- Fahndungssterne, Polizei spawnt und rammt, Tod und Neustart
- Gelände aus EU-DEM: Straßen, Gebäude, Figuren und Autos folgen der Höhe (Bornheimer Hang)
- Gebäudetypen (Wohnhaus, Schule, Halle, Garage, Kirche) mit eigenen Fassaden, Erdgeschoss mit Türen, Schaufenstern und Toren, Sattel- und Walmdächer aus roof:shape
- Spielplätze mit Geräten, Sportplätze mit Linien und Toren
- Kreativmodus (Taste C): fliegen, alle Waffen ohne Limit, per Klick Feuerwerk, Demo, Polizei-Einheit, Wasserwerfer, Auto oder Mensch setzen; Leiste 1–0, Shift+1–0, ß, Mausrad, Komma/Punkt oder Klick. Unendlich Munition im normalen Spiel: Menü › Spiel
- Verkehr: Rechtsverkehr, Einbahnstraßen und Tempolimits aus OSM, Ampelphasen, KI bremst vor Hindernissen
- Sound komplett synthetisch (Web Audio): Motor, Schüsse, Sirene, Schritte, Crash, Explosion, Hupe (H), Pickups
- Tag-Nacht-Zyklus mit Sonnenstand, Laternen und Scheinwerfern nur bei Dunkelheit
- Menü (Esc): Speichern (F6), Laden (F9), Optionen (Maus, Lautstärke, Schatten, Zeitlauf, Uhrzeit); Spielstand im Browser
- Karte (M) mit Straßennamen, Pickups für Geld, Munition, Leben; Lebensenergie regeneriert ohne Fahndung
- Wetter: klar, bewölkt, Regen, Gewitter mit Blitz und Donner, Nebel; nasse Straßen; automatisch oder im Menü
- Verkehr: Blinker beim Abbiegen, Hupen im Stau, Straßenbahnen auf den oberirdischen Gleisen, Rauch bei Schaden, Wracks verschwinden; Polizei fährt über das Straßennetz, hält und schickt Beamte zu Fuß
- Stadtdetails aus OSM: 421 Ladenschilder mit echten Namen (Apotheken, Bäcker, Banken, Lokale), Zäune, Mauern, Hecken, Schulhöfe mit Zaun, Balkone, Büsche, Bus- und Bahnhaltestellen mit Wartehäuschen, Bänke, Papierkörbe, Fahrradständer, Briefkästen, Brunnen, Zebrastreifen
- Optik-Runde: Himmelsverlauf mit Sonne und Wolken, Dachgesimse und Gurtgesimse, Schornsteine und Dachaufbauten, Bordsteine (an Einmündungen unterbrochen), Straßenbäume, rund 1000 geparkte Autos in Reihen (einsteigbar), Mondlicht, Laternen an allen Wohnstraßen
- Leistung: Stadt in 400-m-Kacheln, Hausfarben als Vertex-Farben, Bäume und Parkreihen als gekachelte Instanzen; Renderzeit etwa ein Drittel niedriger trotz mehr Details
- Echte 3D-Modelle (CC0, siehe CREDITS.md): animierte Passanten (Laufen, Rennen, Stehen, Sterben), Spieler mit Ziel- und Schussanimation, SWAT-Polizei, sieben Automodelle (Taxi elfenbein, Streifenwagen blau-silber), Pistole
- Texturen von Poly Haven: Asphalt mit Rissen, Gehwegpflaster, Kopfstein, Dachziegel, Putzstruktur (Normal-Maps)
- Grafikqualität im Menü: Niedrig, Mittel, Hoch (Leuchteffekt, feine Schatten); Detailstufen für 1800 geparkte Autos
- Zielen mit rechter Maustaste
- Physik: Dächer (flach und steil) und gebaute Blöcke begehbar, Fallen mit Fallschaden, Autos mit Schwung, Reifenhaftung (Regen rutschiger), Handbremsen-Drift mit Bremsspuren und Reifenquietschen, Karosserie neigt sich, angefahrene Passanten fliegen, Kamerawackeln
- Einstellungen in Reitern: Grafik (Qualität, Auflösung, Sichtweite, Schatten, Leuchteffekt, Bildrate), Kamera (Sichtfeld, Abstand, Maus, Wackeln), Welt (Uhrzeit, Zeitlauf, Wetter, Verkehr, Passanten, Polizei), Spiel (Unverwundbar, Munition, Fallschaden, Reifenhaftung), Ton & HUD
- Selbsttest: `tools/selftest.js` (siehe Skill)
- Test-Skill für Claude: `.claude/skills/spieltest/SKILL.md`
- Story 2 „Freitag ist Pflicht“: Flyer verteilen am Schulhof (Blickfeld der Aufsicht), Schulstreik anführen, Sternmarsch dreier Schulen, Nacht mit Brandsatz und Feuerwehr, Selin aus dem Kessel holen, Großdemo mit drei Enden
- Story 3 „Der Kanzler kommt“: Fragen am Kiosk sammeln, am Checkpoint abgenommen bekommen, beim Bürgerdialog hinter der Absperrung reinrufen, mit der Demo vor der Kolonne stehen: ruhig bleiben (Fenster geht runter), Hintereingang (Karten ans Fenster) oder Eskalation (Schlagzeile „Ausschreitungen“)
- Fahrräder: Radler fahren am rechten Fahrbahnrand (eigenes Modell aus Grundformen, Figur sitzt sichtbar drauf), Räder stehen am Straßenrand und als Kulisse an Fahrradständern; mit E aufsteigen oder Radler runterziehen (wenig Fahndung), bis 32 km/h, H klingelt, kein Motorgeräusch; bei zu viel Schaden kippt das Rad um statt zu explodieren (`makeBike`, `tipBike`, `spawnCar(…, bike)`)
- Neues Spiel startet nur mit Fäusten (Waffen im Laden oder als Pickup) und auf Grafikstufe „Niedrig“ (Startbildschirm nennt die passende Stufe), Schwach-GPU-Modus (integrierte Grafik: kein Antialiasing, kürzere Sichtweite, seltenere Schatten), Ladebalken mit Phasen, Start-Knopf erst nach dem Laden, Handy-Hinweis vor dem Laden, Fehlerseite statt ewigem „Lade Stadt“, Autosave alle zwei Minuten und nach jedem Kapitel, Rückfrage vor Laden/Neustart, Polizei-Obergrenze (22)
- Noch nicht: Innenräume

## Starten

Braucht nur Python 3 (Three.js kommt vom CDN):

```bash
python -m http.server 8000
```

Dann http://localhost:8000 öffnen.

## Daten

Ganz Frankfurt in Kacheln zu 500 m (Ursprung bleibt Bornheim, 50.129441 N / 8.7096938 O):

1. `python -I tools/fetch_osm_ffm.py` holt die OSM-Daten der Stadt in Zellen von ca. 2 km über Overpass nach `data/raw/` (nicht im Git; zu große Zellen werden automatisch geviertelt, abgebrochene Läufe setzen fort).
2. `python -I tools/fetch_dgm_ffm.py` holt das Gelände (DGM1 Hessen, 4-m-Raster) je Kachel nach `data/dem/<tx>_<tz>.bin` (126 x 126 Werte, Uint16).
3. `python -I tools/build_tiles.py` erzeugt `data/tiles/<tx>_<tz>.json` und `data/tiles/index.json`. Brücken- und Rampenhöhen werden dabei über die ganze Stadt berechnet. `tools/build_city.py` enthält die Umwandlung OSM -> Spielobjekte.

`data/tiles/` und `data/dem/` sind eingecheckt, damit die Seite ohne Server-Logik läuft.

## Veröffentlichung

Jeder Push auf `main` baut die Seite über `.github/workflows/pages.yml` und
veröffentlicht sie auf GitHub Pages. Auf die Seite kommen nur die Dateien, die der
Browser braucht. Lokal testen geht mit jedem statischen Webserver.

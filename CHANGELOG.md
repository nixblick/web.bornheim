# Changelog

## 2026-11-12

- Fehler melden ohne GitHub: Bildschirmfoto des Spiels (Vorschau, abwählbar); „Teilen“ öffnet am Handy das Teilen-Menü (WhatsApp, Signal, Mail) mit Text und Bild, „Per E-Mail schicken“ lädt das Bild herunter und öffnet die Mail mit Anhang-Hinweis; GitHub nur noch als Link für Leute mit Konto, das Bild liegt dann in der Zwischenablage
- Getestet (Headless-Chrome): `forceContextLoss` zeigt den Hinweis und speichert beide Fehler; nach Neuladen stehen sie im Bericht unter „Vorige Sitzung“, das Bildschirmfoto ist nicht schwarz
- Absturz-Spuren: Grafikverlust (`webglcontextlost`) zeigt einen Hinweis mit „Neu laden“ und „Fehler melden“ statt eines stehenden Bildes; die letzten 5 Fehlermeldungen (mit Uhrzeit) liegen im localStorage und erscheinen nach einem Neustart im Fehlerbericht als „Vorige Sitzung“

## 2026-11-10

- Teststrecke Fußgänger `T.laufen()` (`tools/laufen.js`): Fall aus 2,5 m ohne Schaden, Fall aus 14 m mit Fallschaden (19,6 m/s, −60 hp) und ohne Einsinken, Landen auf einem Flachdach, gegen eine Hauswand laufen (bleibt davor), Sprung (0,92 m); 5/5. Treppen und Ragdoll noch ohne Prüfung
- Hangabtrieb: Autos bekommen g·sin(Neigung) entlang der Fahrtrichtung (abzüglich 1,2 % g Rollwiderstand). Das eigene Auto rollt ohne Gas ab 4 % Gefälle los, bergauf rückwärts; Bremse/Handbremse halten es. KI-Autos erst in Fahrt (wartende rollen nicht weg). Teststrecke `T.fahren()` um „Hangabtrieb“ erweitert (7,5 %: nach 2 s bergab +3,5 km/h, bergauf −3,5 km/h, Handbremse 0), 16/16
- Schwebende Grünflächen (52/−442, sporadisch rot): `drape` prüft die Höhe nur an Kantenmitten und Schwerpunkt, Dreiecke bis 40 m übersahen Buckel im 4-m-Geländeraster (Spielplatz dort 0,24 m über dem Boden; der Test würfelt die Messpunkte, daher sporadisch). Grünflächen und Schulhöfe teilen jetzt jede Kante über 10 m, Toleranz 5 cm: größte Abweichung in 700 Stichproben 0,13 statt 0,18–0,24 m, Dreiecke im Bild −1,5 %
- Selbsttest „Fahrbahn liegt obenauf“: Gleisbett der Straßenbahn liegt gewollt auf der Fahrbahn (war die sporadische Abweichung, 1 cm)
- Fenster bei Nacht: statt flacher, gleich heller Gold-Rechtecke ein Lichtverlauf je Fenster in gemischten Farben (warm, neutral, vereinzelt Fernseher-Blau), Helligkeit 60–100 %, Rahmen und Sprossen bleiben dunkel, ein Drittel mit halb zugezogenem Vorhang; weniger Fenster an (Wohnhaus 32 statt 35 %, öffentlich 35 statt 50 %). Tagsüber waren beleuchtete Fenster braun getönt und im Erdgeschoss passten Tag- und Nachtbild nicht zusammen (zweimal gewürfelt); jetzt überall dunkles Glas
- Selbsttest „Fahrbahn liegt obenauf“ nennt bei Fehlschlag Material und Abstand zur Fahrbahn (schlägt sporadisch fehl, Stichprobe hängt von den gebauten Kacheln ab)
- Speicher: Knochen-Texturen (12×12/16×16) der Figuren wurden beim Entfernen von Passanten (Abstand, Tote, Umsetzen, Demo, Fahrer) nie freigegeben, je Figur eine GPU-Textur; jetzt `freeSkel`. Gemessen über 24 Kachelsprünge mit Spielschleife: vorher 283→391 GPU-Texturen, nachher 67–114 ohne Anstieg. Canvas-Texturen der Kacheln (Schilderatlas) wurden schon freigegeben; `canvasTex` hält freigegebene Texturen nicht mehr in der Anisotropie-Liste
- Gehwege und Wege mit `polygonOffset`: am Hang lag der Gehweg der Querstraße bis 3 cm über der Fahrbahn und flimmerte darüber
- Selbsttest stabil: Fadenkreuz- und Tasertest stellen das Ziel auf die Ebene des Schützen (stand auf Brücken/am Hang Meter tiefer), „Fahrbahn liegt obenauf“ wertet den Tiefenversatz; 76/76 grün
- Grafik Mittel: Asphalt im PBR-Material dunkler (Grundwert 0,4 statt 0,6, Umgebungslicht 0,2 statt 0,4), war seit Mittel als Standard ausgewaschen hellgrau; Schatten mit `normalBias` 0,04 und auf Mittel engerem Bereich (±50 statt ±70 m, ~10 statt 14 cm je Texel) gegen Treppen an Bordsteinen
- Baumkronen (Hoch/Ultra): wieder 60 Blattflächen statt 24 wie vor Antigravity; gemessen kosten alle Blätter zusammen 1–2 ms von 34 ms je Bild (Intel UHD), der Unterschied 24↔60 ist darunter
- Fahrphysik: Zäune am Straßenrand halten Autos wieder (der Antigravity-Umgehungsweg `onOtherRoad` in `barrierHit` ließ sie durch)
- Auto gegen Auto: Trennachsen-Test über die echten gedrehten Umrisse statt Kasten, Stoß nach Masse; geparkte Autos und Wracks werden geschoben (`shoveCar`). Auffahrunfall vorher 0,71 m Durchdringung und 0,2 m Schub, jetzt 0,01 m und 9,8 m
- Hubschrauber: Absturz bei leeren Gebäudeplätzen behoben (`heli.js`)
- Selbsttest: Teststrecke `T.fahren()` (`tools/fahren.js`): Anfahren, Bremsen, Handbremse, Wendekreis, Spurwechsel, Auffahrunfall, Wand bei 50/100 km/h, Bordstein, Gefälle, Brücke, Zaun bei 20 fps, Sprung; Zauntest nimmt nur eingetragene Zäune, Radtest und Teststrecke warten auf die gebaute Kachel, „Fahrbahn liegt obenauf“ sieht alle Kachel-Meshes

## 2026-11-09

- U-Bahn: Eingänge als blaues „U“ auf der Minikarte, Schild am Eingang größer und höher (1 m auf 3,9 m)
- Grafik: Standardstufe nach GPU statt immer „Niedrig“ (Intel UHD: Mittel mit Schatten, 36,8 statt 40,1 fps im Stand), dynamische Auflösung fällt höchstens auf 0,7 statt 0,5
- Schwimmen: Atemluft-Balken, Tauchen mit Strg (15 s), Ermüdung an der Oberfläche nach 90 s, Ertrinken ohne Luft

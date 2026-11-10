# Changelog

## 2026-11-10

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

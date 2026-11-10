# Changelog

## 2026-11-10

- Fahrphysik: Zäune am Straßenrand halten Autos wieder (der Antigravity-Umgehungsweg `onOtherRoad` in `barrierHit` ließ sie durch)
- Auto gegen Auto: Trennachsen-Test über die echten gedrehten Umrisse statt Kasten, Stoß nach Masse; geparkte Autos und Wracks werden geschoben (`shoveCar`). Auffahrunfall vorher 0,71 m Durchdringung und 0,2 m Schub, jetzt 0,01 m und 9,8 m
- Hubschrauber: Absturz bei leeren Gebäudeplätzen behoben (`heli.js`)
- Selbsttest: Teststrecke `T.fahren()` (`tools/fahren.js`): Anfahren, Bremsen, Handbremse, Wendekreis, Spurwechsel, Auffahrunfall, Wand bei 50/100 km/h, Bordstein, Gefälle, Brücke, Zaun bei 20 fps, Sprung; Zauntest nimmt nur eingetragene Zäune, Radtest und Teststrecke warten auf die gebaute Kachel, „Fahrbahn liegt obenauf“ sieht alle Kachel-Meshes

## 2026-11-09

- U-Bahn: Eingänge als blaues „U“ auf der Minikarte, Schild am Eingang größer und höher (1 m auf 3,9 m)
- Grafik: Standardstufe nach GPU statt immer „Niedrig“ (Intel UHD: Mittel mit Schatten, 36,8 statt 40,1 fps im Stand), dynamische Auflösung fällt höchstens auf 0,7 statt 0,5
- Schwimmen: Atemluft-Balken, Tauchen mit Strg (15 s), Ermüdung an der Oberfläche nach 90 s, Ertrinken ohne Luft

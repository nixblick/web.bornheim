# web.bornheim – Regeln für Claude

## Spieltests nur nachts (22:00–06:00)

André, 12.11.2026: Das Notebook ist abgestürzt, weil mehrere Sitzungen gleichzeitig liefen und
eine davon das Spiel im Browser getestet hat (Headless-Chrome mit WebGL, hohe CPU/GPU-Last).

- Alles, was das Spiel startet, läuft **nur zwischen 22:00 und 06:00 Uhr Ortszeit**:
  Headless- und sichtbarer Chrome, `T.checks()`, `T.fahren()`, `T.laufen()`, `T.physik()`,
  Bildschirmfotos, Bildvergleiche, Leistungsmessungen.
- Vorher `date +%H` prüfen. Liegt die Zeit außerhalb des Fensters: nicht testen. Die Änderung wird
  trotzdem fertig gebaut und committet, im CHANGELOG steht dann „ungetestet, Test im Nachtfenster“,
  und André bekommt in der Antwort den fertigen Testbefehl für die Nacht.
- Erlaubt sind tagsüber nur leichte Prüfungen ohne Browser: `node --check`, Python-Skripte unter
  `tools/` ohne Chrome, `grep`.
- Auch nachts läuft immer nur **ein** Browser-Test zur selben Zeit. Am Ende alle Browser und
  Server dieses Laufs beenden.
- Ausnahme nur auf Andrés ausdrückliches Wort in der laufenden Sitzung („teste jetzt“).

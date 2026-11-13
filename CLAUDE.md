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

## Tagsüber: Spieltest auf GitHub

Seit 13.11.2026 fährt der Workflow „Spieltest“ (`.github/workflows/spieltest.yml`) `tools/probe.mjs` auf einem
GitHub-Rechner. Er belastet das Notebook nicht und ist deshalb jederzeit erlaubt:

```
gh workflow run spieltest.yml -R nixblick/web.bornheim -f ref=<zweig> -f proben="wahrzeichen bugs ausstieg"   # Proben von main, Code vom Zweig; neue Proben testen: --ref <probenzweig>
gh run list -R nixblick/web.bornheim -w spieltest.yml -L 1
gh run download -R nixblick/web.bornheim <run-id> -D <ordner>
```

## Werkzeug für gezielte Proben: `tools/probe.mjs`

13.11.2026: Eine Nachtrunde hat die ganze Nacht ihr eigenes Testskript gebaut und nichts getestet.
Deshalb gibt es ein fertiges Werkzeug; eine Runde schreibt nur eine Schrittdatei unter `tools/proben/`.

```
node tools/probe.mjs tools/proben/ausstieg.json <ausgabeordner> "$(command -v chromium-browser || command -v google-chrome)"
```

Es startet selbst Webserver und Chrome auf freien Ports, beendet beides, schreibt `stand.txt` (eine Zeile je
Schritt) und bricht nach 20 min hart ab. Exit 0 = grün, 1 = rot, 2 = Zeit um. Fehlt dem Werkzeug etwas:
Befund melden und erweitern ist eine eigene, kurze Runde, kein Umbau mitten in einer Testrunde.

# Veröffentlichung über GitHub Pages

Webseite und Spiel laufen unter `https://nixblick.github.io/web.bornheim/`. GitHub liefert die Dateien über sein weltweites Netz aus, ein eigener Server wird nicht gebraucht.

## So funktioniert es

- `.github/workflows/pages.yml` stellt bei jedem Push auf `main` nur die Dateien zusammen, die der Browser braucht: die HTML-Seiten, die Spielmodule, `assets/`, `vendor/`, `data/tiles/` und `data/dem/` (ganz Frankfurt in 500-m-Kacheln). Werkzeuge, Tests und Notizen landen nicht auf der Seite.
- Alle Pfade im Spiel sind relativ, das Spiel läuft also im Unterordner `/web.bornheim/`.
- Spielstände liegen im Browser und hängen an der Adresse.

## Lizenzen

- Für den eigenen Code gibt es noch keine Lizenzdatei, es gilt also „alle Rechte vorbehalten“.
- `data/tiles/` ist ein Auszug aus OpenStreetMap und steht unter der ODbL. `data/dem/` stammt aus dem DGM1 Hessen (Datenlizenz Deutschland Zero 2.0).
- Für Modelle, Texturen und Geländedaten gelten die Lizenzen in `CREDITS.md` und `credits.html`.

## Grenzen von GitHub Pages

- Seite bis 1 GB (aktuell etwa 25 MB), einzelne Dateien unter 100 MB.
- Weiches Limit von etwa 100 GB Datenverkehr im Monat. Beim ersten Besuch lädt ein Spieler etwa 20 bis 25 MB, danach kommt fast alles aus dem Browser-Cache. Wird es mehr, kann dasselbe Verzeichnis ohne Änderung auf Cloudflare Pages umziehen.
- Keine Server-Logik. Für Mehrspieler, Bestenlisten oder Konten bräuchte es einen eigenen Dienst.
- Eine eigene Domain geht über eine `CNAME`-Datei und einen DNS-Eintrag.

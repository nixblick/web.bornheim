# Credits

Alle 3D-Modelle, Texturen und Aufnahmen sind frei nutzbar, die Kartendaten stehen unter der ODbL. Herkunft je Ordner und Datei (die Seite dazu im Spiel: `credits.html`):

## Menschen (`assets/people/`)
| Datei | Modell | Autor | Lizenz | Quelle |
|---|---|---|---|---|
| man.glb | Man | Quaternius | CC0 | https://poly.pizza/m/HMnuH5geEG |
| man_suit.glb | Man in Suit | Quaternius | CC0 | https://poly.pizza/m/mQnGoME1ez |
| woman_casual.glb | Woman Casual | Quaternius | CC0 | https://poly.pizza/m/jpKRgGDxhk |
| woman_tanktop.glb | Woman in Tank Top | Quaternius | CC0 | https://poly.pizza/m/XqzeZGB7iU |
| woman_dress.glb | Woman in Dress | Quaternius | CC0 | https://poly.pizza/m/zMyPlQXBzq |
| woman_jacket.glb | Woman | Quaternius | CC0 | https://poly.pizza/m/AQsd9ngvKU |
| hero_man.glb | Casual Character | Quaternius | CC0 | https://poly.pizza/m/kZ3DmIoGip |
| hero_woman.glb | Animated Woman | Quaternius | CC0 | https://poly.pizza/m/qJ2gsTUBHL |
| business_man.glb | Business Man | Quaternius | CC0 | https://poly.pizza/m/JFrLIKqvCH |
| swat.glb | Soldier | Quaternius | CC-BY 3.0 (Namensnennung) | https://poly.pizza/m/oAArCNHjFB |

## Fahrzeuge (`assets/cars/`)
| Datei | Modell | Autor | Lizenz | Quelle |
|---|---|---|---|---|
| sedan.glb | Car | Quaternius | CC0 | https://poly.pizza/m/Cz6yDaUcM9 |
| small.glb | Car | Quaternius | CC0 | https://poly.pizza/m/unqqkULtRU |
| suv.glb | SUV | Quaternius | CC0 | https://poly.pizza/m/xsMtZhBkxL |
| taxi.glb | Taxi | Quaternius | CC0 | https://poly.pizza/m/x43lOScTpN |
| police.glb | Police Car | Quaternius | CC0 | https://poly.pizza/m/BwwnUrWGmV |
| hatchback.glb | Car Hatchback | Kay Lousberg | CC0 | https://poly.pizza/m/BG0KAhmGDt |
| wagon.glb | Stationwagon | Kay Lousberg | CC0 | https://poly.pizza/m/vTTTjDoxhV |

## Waffen (`assets/weapons/`)
| Datei | Modell | Autor | Lizenz | Quelle |
|---|---|---|---|---|
| pistol.glb | Pistol | Quaternius | CC0 | https://poly.pizza/m/J3i9KDQ3kt |

## Geräusche (`assets/sfx/`)
51 kurze Aufnahmen, alle CC0 1.0 (Public Domain), je Aufnahme zwei Fassungen: `.ogg` (Mono, 32 kHz) und `.m4a` (AAC, Mono, 64 kbit/s, für iPhone/Safari ohne Ogg), beide aus derselben CC0-Aufnahme umgewandelt. Zuordnung in `assets/sfx/manifest.json`. Alle übrigen Geräusche, der Motor und die Radiomusik entstehen im Browser (Web Audio, `klang.js`, `radio.js`).

| Dateien | Inhalt | Paket | Autor | Lizenz | Quelle |
|---|---|---|---|---|---|
| step_*, step_gras_*, step_holz_*, punch_*, hit_*, bump_*, splat_* | Schritte (Beton, Gras, Holz), Schläge, Blech, weicher Aufprall | Impact Sounds 1.0 | Kenney | CC0 | https://kenney.nl/assets/impact-sounds |
| door_* | Tür schließen | RPG Audio | Kenney | CC0 | https://kenney.nl/assets/rpg-audio |
| click_* | Klicks | UI Audio | Kenney | CC0 | https://kenney.nl/assets/ui-audio |
| pickup_* | Bestätigung | Interface Sounds 1.0 | Kenney | CC0 | https://kenney.nl/assets/interface-sounds |
| reload_* | Nachladen (Pistole, Gewehr, Vorderschaft) | Gun reload sounds | SpringySpringo | CC0 | https://opengameart.org/content/gun-reload-sounds |

Geprüft am 14.11.2026: Lizenzangabe auf der jeweiligen Seite und, wo vorhanden, in der beiliegenden License.txt. Nicht übernommen wurde ein Schuss-Paket, dessen Seite CC0 nennt, dessen beiliegende Datei aber CC-BY 3.0.

## Texturen (`assets/textures/`)
Alle von Poly Haven (https://polyhaven.com), CC0: painted_plaster_wall, asphalt_02, grey_cartago_02, clay_roof_tiles_02, red_brick_03, cobblestone_floor_04.

## Webseite (`assets/site/`)
Bildschirmfotos aus dem Spiel, Icon und Stylesheet: eigene Inhalte.

## Daten (`data/`, `audio/`)
Kartendaten © OpenStreetMap-Mitwirkende, ODbL 1.0 (https://www.openstreetmap.org/copyright). Alle OSM-Dateien sind daraus abgeleitete Datenbanken und stehen ebenfalls unter der ODbL. Geprüft am 21.11.2026 an den Kopfzeilen der Werkzeuge unter `tools/`.

| Datei | Inhalt | Quelle | Lizenz | Werkzeug |
|---|---|---|---|---|
| `data/tiles/` | Stadtkacheln (Gebäude, Straßen, Wege, Gleise, Grün, Bäume, Ampeln, Läden, Haltestellen) | OpenStreetMap (Overpass bzw. PBF-Auszug), Höhen aus `data/dem/` | ODbL 1.0 | `fetch_osm_ffm.py`, `fetch_umland.py`, `pbf_to_raw.py`, `build_tiles.py` |
| `data/dem/` | Gelände, Stadt und Umland | DGM1 Hessen, © Hessische Verwaltung für Bodenmanagement und Geoinformation (HVBG), INSPIRE-WCS inspire-hessen.de/raster/dgm1, im Spiel auf 4 m gemittelt | Datenlizenz Deutschland – Zero – 2.0 | `fetch_dgm_ffm.py` |
| `data/overview.json` | Übersichtskarte | aus den Kacheln (OpenStreetMap) | ODbL 1.0 | `build_overview.py` |
| `data/skyline.json` | Hochhäuser am Horizont | aus den Kacheln (OpenStreetMap, Gelände DGM1) | ODbL 1.0 | `build_skyline.py` |
| `data/metro.json` | U- und S-Bahn | OpenStreetMap | ODbL 1.0 | `build_metro.py`, `build_sbahn.py` |
| `data/busroutes.json` | Buslinien, Haltestellen | OpenStreetMap (Overpass, ohne eigenes Skript geholt) | ODbL 1.0 | Haltenamen: `busroute_names.py` |
| `data/districts.json` | Stadtteilgrenzen | OpenStreetMap | ODbL 1.0 | `build_districts.py` |
| `data/belag.json` | Pflasterstraßen | OpenStreetMap (Overpass) | ODbL 1.0 | `fetch_belag.py` |
| `data/ladesaeulen.json` | Ladesäulen | OpenStreetMap (Overpass) | ODbL 1.0 | `ladesaeulen.py` |
| `data/jugend.json` | Jugendhäuser | OpenStreetMap | ODbL 1.0 | `jugend.py` |
| `data/vokabeln.json` | Sätze der Minimission „Kannst du mir helfen?“ | Vokabaum (vokabaum.hinjas.de, Kunde), wortgleich | Kundeninhalt | von Hand (#82, #83) |
| `data/podcast.json`, `audio/podcast/` | Podcast-Sender | eigene Folgen | eigene Inhalte | `podcast.py` |
| (live) | Strecken der Frischlufteulen | frischlufteulen.de/api/spiel/strecken.json (Kunde) | Kundeninhalt | `eulen.js` |

Einzelne Hochhaushöhen, die in OSM fehlen, ergänzt `build_city.py` nach belegten Zahlen der deutschen Wikipedia (#94, #96).

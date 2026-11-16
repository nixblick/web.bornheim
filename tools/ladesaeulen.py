"""Ladesäulen für E-Autos aus OpenStreetMap -> data/ladesaeulen.json (für ladesaeulen.js).
Die Kacheln (data/tiles) kennen keine Ladesäulen. Statt alle Kacheln neu zu bauen, holt dieses Skript nur
amenity=charging_station über Overpass und legt eine kleine Liste [[x, z, plätze], …] ab, wie tools/jugend.py.
Nur öffentlich nutzbare Säulen für Autos (keine reinen Fahrradlader, kein access=private/no), nur im Spielgebiet.
Betreiber, Marken und Namen werden nicht übernommen (keine Marken im Spiel).
Aufruf: python tools/ladesaeulen.py            (holt von Overpass)
        python tools/ladesaeulen.py datei.json  (nimmt eine schon geholte Overpass-Antwort)"""
import json, math, sys, urllib.parse, urllib.request

LAT0, LON0, R, TS = 50.129441, 8.7096938, 6371000.0, 500
COSL = math.cos(math.radians(LAT0))
def xz(lat, lon): return (math.radians(lon - LON0) * R * COSL, -math.radians(lat - LAT0) * R)
KEEP = set(json.load(open("data/tiles/index.json", encoding="utf-8"))["tiles"].keys())
Q = ('[out:json][timeout:120];(node["amenity"="charging_station"](50.015,8.47,50.235,8.81);'
     'way["amenity"="charging_station"](50.015,8.47,50.235,8.81););out center tags;')

def holen():
    for u in ("https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"):
        try:
            req = urllib.request.Request(u, data=urllib.parse.urlencode({"data": Q}).encode(), headers={"User-Agent": "web.bornheim-tools"})
            with urllib.request.urlopen(req, timeout=180) as r: return json.loads(r.read().decode("utf-8"))
        except Exception as e: print("Overpass", u, e)
    sys.exit("keine Antwort von Overpass")

d = json.load(open(sys.argv[1], encoding="utf-8")) if len(sys.argv) > 1 else holen()
res = []
for e in d["elements"]:
    t = e.get("tags", {})
    if t.get("access") in ("private", "no"): continue
    if t.get("bicycle") == "yes" and t.get("motorcar") not in ("yes", "designated"): continue  # Fahrradlader
    lat, lon = (e["lat"], e["lon"]) if "lat" in e else (e["center"]["lat"], e["center"]["lon"])
    x, z = xz(lat, lon)
    if f"{math.floor(x / TS)}_{math.floor(z / TS)}" not in KEEP: continue
    try: n = int(t.get("capacity:motorcar") or t.get("capacity") or 2)
    except ValueError: n = 2
    res.append([round(x, 1), round(z, 1), max(1, min(n, 6))])
# Doppelte (Knoten und Fläche derselben Station) näher als 8 m zusammenlegen
out = []
for v in sorted(res):
    if any(math.hypot(o[0] - v[0], o[1] - v[1]) < 8 for o in out): continue
    out.append(v)
json.dump({"quelle": "OpenStreetMap (ODbL)", "lade": out}, open("data/ladesaeulen.json", "w", encoding="utf-8"), separators=(",", ":"))
print(len(out), "Ladesäulen -> data/ladesaeulen.json")

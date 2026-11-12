"""Echter Streckenverlauf der U-Bahn-Linien (U1–U9) aus OSM per Overpass in data/metro.json (Feld g je Linie).
Aufruf: python3 -I tools/metro_geometry.py"""
import json, math, time, urllib.parse, urllib.request
LAT0, LON0, R = 50.129441, 8.7096938, 6371000.0
def xy(lat, lon): return [round(math.radians(lon - LON0) * R * math.cos(math.radians(LAT0))), round(-math.radians(lat - LAT0) * R)]
q = '[out:json][timeout:120];area["name"="Frankfurt am Main"]["admin_level"="6"]->.a;rel(area.a)["type"="route"]["route"~"subway|light_rail"]["ref"~"^U[1-9]$"];way(r)["railway"];out geom;rel(area.a)["type"="route"]["route"~"subway|light_rail"]["ref"~"^U[1-9]$"];out body;'
for i in range(5):
    try:
        req = urllib.request.Request("https://overpass-api.de/api/interpreter", data=urllib.parse.urlencode({"data": q}).encode(), headers={"User-Agent": "web.bornheim-builder"})
        E = json.load(urllib.request.urlopen(req, timeout=180))["elements"]; break
    except Exception as ex: print("retry", ex); time.sleep(15 * (i + 1))
ways = {e["id"]: [xy(p["lat"], p["lon"]) for p in e["geometry"]] for e in E if e["type"] == "way"}
lines = {}
for e in E:
    if e["type"] != "relation": continue
    ref = e["tags"]["ref"]; s = lines.setdefault(ref, set())
    for m in e["members"]:
        if m["type"] == "way" and m["ref"] in ways and not m["role"].startswith("platform"): s.add(m["ref"])
M = json.load(open("data/metro.json", encoding="utf-8"))
for l in M["lines"]:
    l["g"] = [ways[w] for w in sorted(lines.get(l["ref"], []))]
json.dump(M, open("data/metro.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print({l["ref"]: len(l["g"]) for l in M["lines"]})

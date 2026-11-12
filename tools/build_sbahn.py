"""S-Bahn Rhein-Main (S1–S9) und U-Bahn (U1–U9) aus OSM per Overpass in data/metro.json einfügen und das ganze Netz (U und S) auf das Spielgebiet
zuschneiden: nur Halte, deren Kachel es gibt (data/tiles/index.json). Farben aus dem OSM-Tag colour, Streckenverlauf in g.
Aufruf: python3 -I tools/build_sbahn.py"""
import json, math, re, time, urllib.parse, urllib.request
LAT0, LON0, R = 50.129441, 8.7096938, 6371000.0
def xy(lat, lon): return [round(math.radians(lon - LON0) * R * math.cos(math.radians(LAT0)), 1), round(-math.radians(lat - LAT0) * R, 1)]
PFX = r"^(Frankfurt am Main|Frankfurt \(Main\)|Frankfurt)[ -]+"
ALIAS = {"süd": "südbahnhof", "hauptbahnhof tief": "hauptbahnhof", "frankfurt hauptbahnhof": "hauptbahnhof"}
def clean(s): return re.sub(PFX, "", (s or "").strip())
def norm(s): k = re.sub(r"\s*\(.*?\)", "", clean(s)).strip().lower(); return ALIAS.get(k, k)
IDX = json.load(open("data/tiles/index.json")); TS = IDX["ts"]; TILES = set(IDX["tiles"].keys())
inworld = lambda p: f"{math.floor(p[0] / TS)}_{math.floor(p[1] / TS)}" in TILES
q = ('[out:json][timeout:180];(rel["type"="route"]["route"="train"]["ref"~"^S[1-9]$"](49.95,8.40,50.30,8.95);'
     'rel["type"="route"]["route"~"subway|light_rail"]["ref"~"^U[1-9]$"](49.95,8.40,50.30,8.95);)->.r;.r out body;node(r.r);out;way(r.r)["railway"];out geom;')
for i in range(6):
    try:
        req = urllib.request.Request("https://overpass-api.de/api/interpreter", data=urllib.parse.urlencode({"data": q}).encode(), headers={"User-Agent": "web.bornheim-builder"})
        E = json.load(urllib.request.urlopen(req, timeout=240))["elements"]; break
    except Exception as ex: print("retry", ex); time.sleep(20 * (i + 1))
nodes = {e["id"]: e for e in E if e["type"] == "node"}; ways = {e["id"]: [xy(p["lat"], p["lon"]) for p in e["geometry"]] for e in E if e["type"] == "way"}
M = json.load(open("data/metro.json", encoding="utf-8")); ST = {s["id"]: s for s in M["stations"]}
best = {}; allw = {}; OLDL = {l["ref"]: l for l in M["lines"]}; before = set(ST)
for r in (e for e in E if e["type"] == "relation"):
    ref = r["tags"]["ref"]; seq = []
    for m in r["members"]:
        if m["type"] != "node" or not m["role"].startswith("stop") or m["ref"] not in nodes: continue
        n = nodes[m["ref"]]; nm = n.get("tags", {}).get("name");
        if not nm: continue
        k = norm(nm); p = xy(n["lat"], n["lon"])
        if k not in ST: ST[k] = {"id": k, "name": "Südbahnhof" if k == "südbahnhof" else clean(nm), "p": p, "lines": [], "entr": []}
        if not seq or seq[-1] != k: seq.append(k)
    allw.setdefault(ref, set()).update(m["ref"] for m in r["members"] if m["type"] == "way" and m["ref"] in ways and not m["role"].startswith("platform"))
    color = OLDL[ref]["color"] if ref.startswith("U") and ref in OLDL else {"brown": "#8b5a2b"}.get(r["tags"].get("colour", "#3a9a4a"), r["tags"].get("colour", "#3a9a4a"))
    if len(seq) > len(best.get(ref, {}).get("stops", [])): best[ref] = {"ref": ref, "color": color, "stops": seq}
# U-Linien (seit 12.11.2026 ebenfalls von hier): Haltfolge aus OSM bis zum echten Endhalt, Strecke = alle Wege aller Richtungen
for k, l in best.items(): l["g"] = [ways[w] for w in sorted(allw[k])]
M["lines"] = [l for l in M["lines"] if l["ref"] not in best] + [best[k] for k in sorted(best, key=lambda r: (r[0] != "U", r))]
# Zuschneiden: Halte außerhalb des Spielgebiets fallen weg, Linien behalten das längste zusammenhängende Stück im Gebiet
for l in M["lines"]:
    runs, cur = [], []
    for k in l["stops"]:
        if k in ST and inworld(ST[k]["p"]): cur.append(k)
        else: runs.append(cur); cur = []
    runs.append(cur); l["stops"] = max(runs, key=len)
    l["g"] = [w for w in l.get("g", []) if any(inworld(p) for p in w)]
M["lines"] = [l for l in M["lines"] if len(l["stops"]) >= 2]
used = {k for l in M["lines"] for k in l["stops"]}
for s in ST.values(): s["lines"] = sorted({l["ref"] for l in M["lines"] if s["id"] in l["stops"]})
M["stations"] = [ST[k] for k in sorted(used)]
json.dump(M, open("data/metro.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("neue Stationen:", sorted(set(ST) - before))
for l in M["lines"]: print(l["ref"], l["color"], len(l["stops"]), ST[l["stops"][0]]["name"], "→", ST[l["stops"][-1]]["name"])
print(len(M["stations"]), "Stationen im Spielgebiet")

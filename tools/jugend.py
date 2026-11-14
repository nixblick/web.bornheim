"""Jugendhäuser aus dem OSM-Auszug -> data/jugend.json (für den Tischkicker in minispiele.js, Ticket #147).
Die Kacheln (data/tiles) kennen keine Jugendhäuser: tools/pbf_to_raw.py nimmt diese Tags nicht mit. Statt alle Kacheln
neu zu bauen, liest dieses Skript nur die Jugendhäuser aus der PBF-Datei und legt eine kleine Liste ab.
Treffer: amenity=community_centre mit community_centre=youth_centre oder community_centre:for=juvenile/youth/child,
amenity/leisure/social_facility=youth_centre, sowie Gemeinschafts- und Sozialeinrichtungen, deren Name ein Jugendhaus nennt.
Aufruf (ohne -I, damit pip --user greift): python tools/jugend.py data/raw/Frankfurt.osm.pbf"""
import json, math, re, sys
import osmium

LAT0, LON0, R = 50.129441, 8.7096938, 6371000.0; TS = 500
COSL = math.cos(math.radians(LAT0))
def xz(lat, lon): return (math.radians(lon - LON0) * R * COSL, -math.radians(lat - LAT0) * R)
KEEP = set(json.load(open("data/tiles/index.json", encoding="utf-8"))["tiles"].keys())
NAME = re.compile(r"jugendhaus|jugendzentrum|jugendtreff|jugendclub|jugendcafe|jugendcafé|jugendladen|jugendbüro|kinder- und jugend(haus|zentrum|treff|club)|\bjuz\b", re.I)
KEIN = re.compile(r"medizin|praxis|psychi|arzt|heilkunde|hilfe e\.?\s?v|amt\b|herberge", re.I)

def ist_jugendhaus(t):
    a = t.get("amenity", ""); n = t.get("name", "")
    if "youth_centre" in (a, t.get("leisure", ""), t.get("social_facility", ""), t.get("community_centre", "")): return True
    if a == "community_centre" and re.search(r"juvenile|youth|child", t.get("community_centre:for", "")): return True
    if n and NAME.search(n) and not KEIN.search(n) and (a in ("community_centre", "social_facility", "social_centre") or t.get("building") or t.get("office")): return True
    return False

class H(osmium.SimpleHandler):
    def __init__(self): super().__init__(); self.out = {}
    def add(self, kind, oid, t, lat, lon):
        x, z = xz(lat, lon)
        if f"{math.floor(x / TS)}_{math.floor(z / TS)}" not in KEEP: return
        self.out[(kind, oid)] = {"x": round(x, 1), "z": round(z, 1), "n": t.get("name", "Jugendhaus")}  # n nur zum Zusammenlegen, wird nicht ausgeliefert
    def node(self, n):
        if n.tags and n.location.valid():
            t = dict(n.tags)
            if ist_jugendhaus(t): self.add("n", n.id, t, n.location.lat, n.location.lon)
    def way(self, w):
        if not w.tags: return
        t = dict(w.tags)
        if not ist_jugendhaus(t): return
        c = [(nd.location.lat, nd.location.lon) for nd in w.nodes if nd.location.valid()]
        if c: self.add("w", w.id, t, sum(p[0] for p in c) / len(c), sum(p[1] for p in c) / len(c))

h = H(); h.apply_file(sys.argv[1], locations=True)
# Doppelte (Knoten und Fläche derselben Einrichtung) zusammenlegen: näher als 40 m und gleicher Name
res = []
for v in sorted(h.out.values(), key=lambda v: (v["n"], v["x"], v["z"])):
    if any(o["n"] == v["n"] and math.hypot(o["x"] - v["x"], o["z"] - v["z"]) < 40 for o in res): continue
    res.append(v)
json.dump({"quelle": "OpenStreetMap", "jugend": [[v["x"], v["z"]] for v in res]}, open("data/jugend.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(len(res), "Jugendhäuser ->", "data/jugend.json")
for v in sorted(res, key=lambda v: abs(v["x"]) + abs(v["z"]))[:12]: print(" ", v)

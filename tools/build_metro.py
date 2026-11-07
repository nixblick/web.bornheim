"""U-Bahn Frankfurt aus dem OSM-Auszug -> data/metro.json
Linien (Relationen route=subway/light_rail mit ref U..), Haltestellen in Fahrtreihenfolge, Stationen und Eingänge (railway=subway_entrance).
Aufruf (ohne -I, damit pip --user greift): python tools/build_metro.py data/raw/Frankfurt.osm.pbf"""
import json, math, re, sys
import osmium

LAT0, LON0, R = 50.129441, 8.7096938, 6371000.0
def xy(lat, lon): return [round(math.radians(lon - LON0) * R * math.cos(math.radians(LAT0)), 1), round(-math.radians(lat - LAT0) * R, 1)]
COLORS = {"U1": "#c4161c", "U2": "#00a651", "U3": "#2e3092", "U4": "#e7208b", "U5": "#007a3e", "U6": "#0072bc", "U7": "#f58220", "U8": "#c58fc0", "U9": "#fdbe00"}

class Rel(osmium.SimpleHandler):
    def __init__(self): super().__init__(); self.lines = []
    def relation(self, r):
        t = dict(r.tags)
        if t.get("type") != "route" or t.get("route") not in ("subway", "light_rail"): return
        ref = t.get("ref", "")
        if not re.fullmatch(r"U\d", ref): return
        stops = [m.ref for m in r.members if m.type == "n" and m.role.startswith("stop")]
        if len(stops) >= 2: self.lines.append({"ref": ref, "name": t.get("name", ref), "stops": stops, "colour": t.get("colour")})
rel = Rel(); rel.apply_file(sys.argv[1])
need = {n for l in rel.lines for n in l["stops"]}

class Nodes(osmium.SimpleHandler):
    def __init__(self): super().__init__(); self.stop = {}; self.stations = []; self.entr = []
    def node(self, n):
        if not n.location.valid(): return
        t = dict(n.tags); p = xy(n.location.lat, n.location.lon)
        if n.id in need: self.stop[n.id] = {"name": t.get("name", ""), "p": p}
        if t.get("railway") == "subway_entrance": self.entr.append({"p": p, "name": t.get("name", ""), "ref": t.get("ref", "")})
        if t.get("railway") in ("station", "halt") and (t.get("station") in ("subway", "light_rail") or t.get("subway") == "yes" or t.get("light_rail") == "yes") and t.get("name"):
            self.stations.append({"name": t["name"], "p": p})
nd = Nodes(); nd.apply_file(sys.argv[1])

def norm(s): return re.sub(r"\s*\(.*?\)|^Frankfurt \(Main\)[ -]*|^Frankfurt[ -]+", "", s or "").strip().lower()
stations = {}  # Name -> Station
for s in nd.stations:
    k = norm(s["name"]); st = stations.setdefault(k, {"name": re.sub(r"^Frankfurt \(Main\)[ -]*", "", s["name"]), "pts": [], "lines": set(), "entr": []}); st["pts"].append(s["p"])
lines = {}
for l in rel.lines:
    seq = []
    for nid in l["stops"]:
        s = nd.stop.get(nid)
        if not s or not s["name"]: continue
        k = norm(s["name"]); st = stations.setdefault(k, {"name": re.sub(r"^Frankfurt \(Main\)[ -]*", "", s["name"]), "pts": [], "lines": set(), "entr": []})
        if not st["pts"]: st.setdefault("sp", []).append(s["p"])
        st["lines"].add(l["ref"])
        if not seq or seq[-1] != k: seq.append(k)
    if len(seq) >= 2 and (l["ref"] not in lines or len(seq) > len(lines[l["ref"]])): lines[l["ref"]] = seq
out_st = []
for k, st in stations.items():
    pts = st["pts"] or st.get("sp") or []
    if not pts or not st["lines"]: continue
    p = [round(sum(q[0] for q in pts) / len(pts), 1), round(sum(q[1] for q in pts) / len(pts), 1)]
    out_st.append({"id": k, "name": st["name"], "p": p, "lines": sorted(st["lines"]), "entr": []})
for e in nd.entr:
    best, bd = None, 260
    for s in out_st:
        d = math.hypot(s["p"][0] - e["p"][0], s["p"][1] - e["p"][1])
        if d < bd: best, bd = s, d
    if best: best["entr"].append(e["p"])
ids = {s["id"] for s in out_st}
res = {"lines": [{"ref": r, "color": COLORS.get(r, "#888"), "stops": [k for k in seq if k in ids]} for r, seq in sorted(lines.items())], "stations": out_st}
json.dump(res, open("data/metro.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(len(res["lines"]), "Linien,", len(out_st), "Stationen,", sum(1 for s in out_st if s["entr"]), "mit Eingängen,", len(nd.entr), "Eingänge")
for l in res["lines"]: print(l["ref"], len(l["stops"]), "Halte:", ", ".join(next(s["name"] for s in out_st if s["id"] == k) for k in l["stops"][:6]), "…")

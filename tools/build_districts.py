"""Frankfurter Stadtteile (OSM boundary=administrative, admin_level=10) -> data/districts.json
Polygone vereinfacht (Douglas-Peucker, ca. 12 m), lokale Meter wie die Spielwelt.
Aufruf (ohne -I, damit pip --user greift): python tools/build_districts.py data/raw/Frankfurt.osm.pbf"""
import json, math, sys
import osmium

LAT0, LON0, R = 50.129441, 8.7096938, 6371000.0
def xy(lat, lon): return (round(math.radians(lon - LON0) * R * math.cos(math.radians(LAT0)), 1), round(-math.radians(lat - LAT0) * R, 1))
def dp(pts, eps):
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]; dx, dz = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dz) or 1e-9; best, bi = -1, 0
    for i in range(1, len(pts) - 1):
        d = abs((pts[i][0] - a[0]) * dz - (pts[i][1] - a[1]) * dx) / L
        if d > best: best, bi = d, i
    if best <= eps: return [a, b]
    return dp(pts[:bi + 1], eps)[:-1] + dp(pts[bi:], eps)
ring = json.load(open("data/raw/ring.json"))  # Stadtgrenze (lat, lon)
city = [xy(a, b) for a, b in ring]
def inside(p, poly):
    c = False; x, z = p
    for i in range(len(poly)):
        (ax, az), (bx, bz) = poly[i], poly[(i + 1) % len(poly)]
        if (az > z) != (bz > z) and x < (bx - ax) * (z - az) / (bz - az) + ax: c = not c
    return c
class H(osmium.SimpleHandler):
    def __init__(self): super().__init__(); self.out = []
    def area(self, a):
        t = dict(a.tags)
        if t.get("boundary") != "administrative" or t.get("admin_level") not in ("9", "10") or not t.get("name"): return
        rings = []
        for r in a.outer_rings():
            pts = [xy(n.location.lat, n.location.lon) for n in r if n.location.valid()]
            if len(pts) > 3:
                if pts[0] == pts[-1]: pts = pts[:-1]
                far = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)  # geschlossenen Ring am fernsten Punkt teilen
                rings.append(dp(pts[:far + 1], 12)[:-1] + dp(pts[far:] + [pts[0]], 12)[:-1])
        if not rings: return
        big = max(rings, key=len); cx = sum(p[0] for p in big) / len(big); cz = sum(p[1] for p in big) / len(big)
        if not inside((cx, cz), city): return
        self.out.append({"n": t["name"].replace("Frankfurt-", ""), "c": [round(cx), round(cz)], "r": [[list(p) for p in r] for r in rings], "lv": t["admin_level"]})
h = H(); h.apply_file(sys.argv[1], locations=True, idx="flex_mem")
# Ebene 10 = Stadtteile; Ebene 9 (Ortsbezirke) nur dort, wo kein Stadtteil liegt (z. B. Bergen-Enkheim, Harheim)
l10 = [d for d in h.out if d["lv"] == "10"]
seen = {}
for d in l10: seen.setdefault(d["n"], d)
for d in h.out:
    if d["lv"] == "9" and not any(ch.isdigit() for ch in d["n"]) and not any(inside(d["c"], r) for x in l10 for r in x["r"]): seen.setdefault(d["n"], d)
for d in seen.values(): d.pop("lv", None)
res = sorted(seen.values(), key=lambda d: d["n"])
json.dump(res, open("data/districts.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(len(res), "Stadtteile:", ", ".join(d["n"] for d in res))

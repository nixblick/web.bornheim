"""Übersichtskarte der ganzen Stadt für Menükarte und große Karte (data/overview.json):
Straßen, Gleise, Wasser und große Grünflächen aus allen Kacheln, vereinfacht (Douglas-Peucker) und auf ganze Meter gerundet.
Aufruf: python3 -I tools/build_overview.py"""
import glob, json, math
def dp(pts, eps):
    if len(pts) < 3: return pts
    (ax, az), (bx, bz) = pts[0], pts[-1]; L = math.hypot(bx - ax, bz - az) or 1e-9; best, bi = 0, 0
    for i in range(1, len(pts) - 1):
        x, z = pts[i]; d = abs((bx - ax) * (az - z) - (ax - x) * (bz - az)) / L
        if d > best: best, bi = d, i
    if best <= eps: return [pts[0], pts[-1]]
    return dp(pts[:bi + 1], eps)[:-1] + dp(pts[bi:], eps)
def area(p): return abs(sum(p[i][0] * p[i - 1][1] - p[i - 1][0] * p[i][1] for i in range(len(p)))) / 2
def q(p, eps): return [[round(x), round(z)] for x, z in dp(p, eps)]
O = {"r1": [], "r2": [], "r3": [], "rail": [], "water": [], "green": [], "wood": []}; kinds = {}
for f in glob.glob("data/tiles/*.json"):
    d = json.load(open(f, encoding="utf-8"))
    for r in d.get("roads", []):
        w = r.get("w", 0); key = "r1" if w >= 12 or r.get("mw") else "r2" if w >= 8 else "r3" if w >= 5 else None
        if key: O[key].append(q(r["p"], 4 if key == "r3" else 6))
    for r in d.get("rails", []):
        if r.get("k") in ("subway",): continue
        O["rail"].append(q(r["p"], 6))
    for w in d.get("water", []):
        if area(w["p"]) > 600: O["water"].append(q(w["p"], 5))
    for a in d.get("areas", []):
        k = a.get("k"); kinds[k] = kinds.get(k, 0) + 1
        if k in ("water", "river", "basin", "riverbank") and area(a["p"]) > 800: O["water"].append(q(a["p"], 5))
    for g in d.get("green", []):
        if area(g["p"]) < 6000: continue
        O["wood" if g.get("k") == "forest" else "green"].append(q(g["p"], 8))
json.dump(O, open("data/overview.json", "w", encoding="utf-8"), separators=(",", ":"))
print({k: len(v) for k, v in O.items()}, "Flächenarten:", sorted(kinds.items(), key=lambda x: -x[1])[:12])

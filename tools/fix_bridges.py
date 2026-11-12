"""Einmalig (#84): Brückenhöhen der fertigen Kacheln mit tools/bridges.py nachziehen, ohne Rohdaten.
Aufruf im Repo: python3 -I tools/fix_bridges.py [--dry]"""
import glob, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bridges import lift
import array, math, struct
TS = 500; DEM_N = 126; DEM_STEP = 4
_dem = {}
def dem_tile(tx, tz):
    k = (tx, tz)
    if k not in _dem:
        fn = f"data/dem/{tx}_{tz}.bin"
        if os.path.exists(fn):
            b = open(fn, "rb").read(); _dem[k] = array.array("f", (v / 100 - 50 for v in struct.unpack(f"<{DEM_N * DEM_N}H", b)))
        else: _dem[k] = None
    return _dem[k]
def TH(x, z):
    tx, tz = math.floor(x / TS), math.floor(z / TS); H = dem_tile(tx, tz)
    if H is None: return 0.0
    fx = (x - tx * TS) / DEM_STEP; fz = (z - tz * TS) / DEM_STEP
    ix = min(DEM_N - 2, max(0, int(fx))); iz = min(DEM_N - 2, max(0, int(fz))); u = min(1, max(0, fx - ix)); v = min(1, max(0, fz - iz))
    n = DEM_N; h00 = H[iz * n + ix]; h10 = H[iz * n + ix + 1]; h01 = H[(iz + 1) * n + ix]; h11 = H[(iz + 1) * n + ix + 1]
    return (h00 * (1 - u) + h10 * u) * (1 - v) + (h01 * (1 - u) + h11 * u) * v
# (Gelände wie in build_tiles.py)

files = sorted(f for f in glob.glob("data/tiles/*_*.json"))
tiles = {f: json.load(open(f, encoding="utf-8")) for f in files}
roads = [r for d in tiles.values() for r in d.get("roads", [])]
H = {}
for r in roads:
    for i, p in enumerate(r["p"]):
        k = (p[0], p[1]); h = r["ry"][i] if "ry" in r else TH(*k); H[k] = max(H.get(k, -1e9), h)
before = {k: v for k, v in H.items()}
from bridges import water_test
wet = water_test([w for d in tiles.values() for w in d.get("water", [])])
changed = lift(roads, H, TH, wet)
dirty = set(); nroad = 0; rep = []
for f, d in tiles.items():
    for r in d.get("roads", []):
        if not any((p[0], p[1]) in changed for p in r["p"]): continue
        ry = [round(H[(p[0], p[1])], 2) for p in r["p"]]; el = [1 if ry[a] > TH(*r["p"][a]) + 0.25 else 0 for a in range(len(ry))]
        if r.get("ry") == ry and r.get("el") == el: continue
        if r.get("br") or any(el): rep.append((f, r.get("n"), r.get("ry"), ry))
        if any(el): r["ry"] = ry; r["el"] = el
        else: r.pop("ry", None); r.pop("el", None)
        dirty.add(f); nroad += 1
print(len(changed), "Knoten angehoben,", nroad, "Straßenstücke,", len(dirty), "Kacheln")
for f, n, a, b in rep:
    if any(abs(x - y) > 0.5 for x, y in zip(a or [0] * len(b), b)): print(os.path.basename(f), n, a, "->", b)
if "--dry" not in sys.argv:
    for f in dirty: open(f, "w", encoding="utf-8").write(json.dumps(tiles[f], separators=(",", ":"), ensure_ascii=False))

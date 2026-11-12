"""Ganz Frankfurt -> Spielkacheln zu 500 m.
Liest data/raw/blk_*.jsonl.gz (tools/pbf_to_raw.py, Blöcke zu 8 x 8 Kacheln mit Rand) und data/dem/*.bin (tools/fetch_dgm_ffm.py),
schreibt data/tiles/<tx>_<tz>.json und data/tiles/index.json.
Gearbeitet wird Block für Block (wenig Speicher). Brücken- und Rampenhöhen werden je Block samt Rand berechnet (früher im Browser).
Aufruf: python -I tools/build_tiles.py"""
import array, glob, gzip, json, math, os, struct, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_city import convert, xy
from bridges import lift, water_test

TS = 500; DEM_N = 126; DEM_STEP = 4; BASE = 89.02
RAW = "data/raw"; OUT = "data/tiles"; os.makedirs(OUT, exist_ok=True)
T0 = time.time()
def log(*a): print(f"[{time.time() - T0:6.0f}s]", *a, flush=True)

# ---------- Gelände ----------
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

BS = 8
tinfo = json.load(open(f"{RAW}/tiles.json")); KEEP = {tuple(t) for t in tinfo["tiles"]}; CORE = [tuple(t) for t in tinfo["core"]]
KEYS = ["buildings", "roads", "paths", "rails", "water", "green", "trees", "signals", "pois", "barriers", "stops", "furniture", "areas", "crossings"]
idx = {"ts": TS, "base": BASE, "demN": DEM_N, "demStep": DEM_STEP, "origin": [50.129441, 8.7096938], "core": CORE, "tiles": {}}
total = 0; written = set()
def load_block(fn):
    el = []; nodes = {}; nid = -1
    with gzip.open(fn, "rt", encoding="utf-8") as f:
        for line in f:
            o = json.loads(line)
            if "w" in o:
                ids = []
                for c in o["c"]: nodes[nid] = (c[0], c[1]); ids.append(nid); nid -= 1
                el.append({"type": "way", "id": o["w"], "nodes": ids, "tags": o["t"]})
            else: el.append({"type": "node", "id": o["n"], "lat": o["c"][0], "lon": o["c"][1], "tags": o["t"]})
    return el, nodes
def process_block(BX, BZ, fn):
    global total
    el, nodes = load_block(fn); ALL = convert(el, nodes); del el, nodes
    tiles = {}
    # ---------- Brücken und Rampen (wie früher computeRoadHeights im Spiel) ----------
    def segX(ax, az, bx, bz, cx, cz, dx, dz):
        rx, rz, sx, sz = bx - ax, bz - az, dx - cx, dz - cz; den = rx * sz - rz * sx
        if abs(den) < 1e-9: return None
        t = ((cx - ax) * sz - (cz - az) * sx) / den; u = ((cx - ax) * rz - (cz - az) * rx) / den
        return t if 0.001 < t < 0.999 and 0 <= u <= 1 else None
    roads = ALL["roads"]; CLEAR = 6.8; G = 50
    ugrid = {}
    for line in [r["p"] for r in roads if not r.get("br")] + [r["p"] for r in ALL["rails"]]:
        for a in range(len(line) - 1):
            (ax, az), (bx, bz) = line[a], line[a + 1]
            for gx in range(math.floor(min(ax, bx) / G), math.floor(max(ax, bx) / G) + 1):
                for gz in range(math.floor(min(az, bz) / G), math.floor(max(az, bz) / G) + 1): ugrid.setdefault((gx, gz), []).append((ax, az, bx, bz))
    need = {}
    for r in roads:
        if not r.get("br"): continue
        np_ = [r["p"][0]]
        for a in range(len(r["p"]) - 1):
            (ax, az), (bx, bz) = r["p"][a], r["p"][a + 1]; cand = set()
            for gx in range(math.floor(min(ax, bx) / G), math.floor(max(ax, bx) / G) + 1):
                for gz in range(math.floor(min(az, bz) / G), math.floor(max(az, bz) / G) + 1): cand.update(ugrid.get((gx, gz), ()))
            hits = sorted(t for t in (segX(ax, az, bx, bz, *q) for q in cand) if t is not None)
            for t in hits:
                x, z = ax + (bx - ax) * t, az + (bz - az) * t; pt = [round(x, 2), round(z, 2)]; np_.append(pt); need[(pt[0], pt[1])] = TH(x, z) + CLEAR
            np_.append(r["p"][a + 1])
        r["p"] = np_
    bn = {r["n"] for r in roads if r.get("br") and r.get("n")}
    chain = [r for r in roads if r.get("br") or r.get("mw") or (r.get("n") in bn)]
    H = {}
    for r in chain:
        for p in r["p"]:
            k = (p[0], p[1]); H[k] = max(H.get(k, -1e9), TH(*p), need.get(k, -1e9))
    log("Rampen:", len(chain), "Straßen in Ketten,", len(need), "Kreuzungspunkte")
    log("Brücken über Wasser angehoben:", len(lift(roads, H, TH, water_test(ALL["water"]))), "Knoten")  # #84: Widerlager und Spannweite, tools/bridges.py
    for ps in range(80):
        ch = False
        for r in chain:
            sl = 0.045 if r.get("mw") else 0.07
            for a in range(len(r["p"]) - 1):
                ka, kb = tuple(r["p"][a]), tuple(r["p"][a + 1]); d = math.hypot(kb[0] - ka[0], kb[1] - ka[1]); ha, hb = H[ka], H[kb]
                if hb < ha - sl * d - 0.01: H[kb] = ha - sl * d; ch = True
                if ha < hb - sl * d - 0.01: H[ka] = hb - sl * d; ch = True
        if not ch: break
    nel = 0
    for r in roads:
        ry = [round(H.get((p[0], p[1]), TH(*p)), 2) for p in r["p"]]; el = [1 if ry[a] > TH(*r["p"][a]) + 0.25 else 0 for a in range(len(ry))]
        if any(el): r["ry"] = ry; r["el"] = el; nel += 1
    log("erhöhte Straßen:", nel)

    # ---------- Verteilen auf Kacheln ----------
    def T(tx, tz): return tiles.setdefault((tx, tz), {k: [] for k in ALL})
    def tof(x, z): return (math.floor(x / TS), math.floor(z / TS))
    def put(k, key, obj):
        if key in KEEP and key[0] // BS == BX and key[1] // BS == BZ: T(*key)[k].append(obj)
    def split_line(k, obj):
        """Linie an Kachelgrenzen teilen: jedes Segment gehört zur Kachel seiner Mitte, Stücke teilen sich die Endpunkte."""
        p = obj["p"]; start = 0; cur = None
        def emit(a, b, key):
            piece = dict(obj); piece["p"] = p[a:b + 1]
            for f in ("ry", "el"):
                if f in obj: piece[f] = obj[f][a:b + 1]
            put(k, key, piece)
        for a in range(len(p) - 1):
            key = tof((p[a][0] + p[a + 1][0]) / 2, (p[a][1] + p[a + 1][1]) / 2)
            if cur is None: cur = key
            elif key != cur: emit(start, a, cur); start = a; cur = key
        if cur is not None: emit(start, len(p) - 1, cur)
    def clip(poly, x0, z0, x1, z1):
        def cut(pts, inside, inter):
            out = []
            for a in range(len(pts)):
                P, Q = pts[a - 1], pts[a]
                if inside(Q):
                    if not inside(P): out.append(inter(P, Q))
                    out.append(Q)
                elif inside(P): out.append(inter(P, Q))
            return out
        def ix(c): return lambda P, Q: [c, round(P[1] + (Q[1] - P[1]) * (c - P[0]) / ((Q[0] - P[0]) or 1e-9), 2)]
        def iz(c): return lambda P, Q: [round(P[0] + (Q[0] - P[0]) * (c - P[1]) / ((Q[1] - P[1]) or 1e-9), 2), c]
        pts = poly
        for ins, inter in ((lambda q: q[0] >= x0, ix(x0)), (lambda q: q[0] <= x1, ix(x1)), (lambda q: q[1] >= z0, iz(z0)), (lambda q: q[1] <= z1, iz(z1))):
            if not pts: break
            pts = cut(pts, ins, inter)
        return pts
    def split_poly(k, obj):
        xs = [q[0] for q in obj["p"]]; zs = [q[1] for q in obj["p"]]
        a0, a1 = tof(min(xs), min(zs)), tof(max(xs), max(zs))
        if a0 == a1: put(k, a0, obj); return
        for tx in range(a0[0], a1[0] + 1):
            for tz in range(a0[1], a1[1] + 1):
                if (tx, tz) not in KEEP: continue
                c = clip(obj["p"], tx * TS, tz * TS, (tx + 1) * TS, (tz + 1) * TS)
                if len(c) >= 3: piece = dict(obj); piece["p"] = c; piece["cut"] = 1; put(k, (tx, tz), piece)
    for b in ALL["buildings"]:
        cx = sum(q[0] for q in b["p"]) / len(b["p"]); cz = sum(q[1] for q in b["p"]) / len(b["p"]); put("buildings", tof(cx, cz), b)
    for k in ("roads", "paths", "rails", "barriers"):
        for o in ALL[k]: split_line(k, o)
    for k in ("water", "green", "areas"):
        for o in ALL[k]: split_poly(k, o)
    for t in ALL["trees"]: put("trees", tof(*t), t)
    for s in ALL["signals"]: put("signals", tof(*s), s)
    for k in ("pois", "stops", "furniture"):
        for o in ALL[k]: put(k, tof(o["x"], o["z"]), o)
    for c in ALL["crossings"]:
        if "p" in c: m = c["p"][len(c["p"]) // 2]; put("crossings", tof(*m), c)
        else: put("crossings", tof(c["x"], c["z"]), c)

    for (tx, tz), d in tiles.items():
        d = {k: v for k, v in d.items() if v}
        if not d: continue
        s = json.dumps(d, separators=(",", ":"), ensure_ascii=False)
        open(f"{OUT}/{tx}_{tz}.json", "w", encoding="utf-8").write(s); total += len(s); written.add((tx, tz))
        idx["tiles"][f"{tx}_{tz}"] = [len(d.get("buildings", [])), len(d.get("roads", []))]
    log(f"Block {BX},{BZ}:", len(tiles), "Kacheln,", {k: len(ALL[k]) for k in ("buildings", "roads")})
blocks = sorted(glob.glob(f"{RAW}/blk_*.jsonl.gz"))
for n, fn in enumerate(blocks):
    bx, bz = map(int, os.path.basename(fn)[4:-9].split("_")); process_block(bx, bz, fn)
for (tx, tz) in KEEP:
    if (tx, tz) not in written: idx["tiles"].setdefault(f"{tx}_{tz}", [0, 0])
for k, v in idx["tiles"].items():
    tx, tz = map(int, k.split("_")); H = dem_tile(tx, tz); v.append(round(sum(H) / len(H), 1) if H else 0.0); v.append(1 if H else 0)
json.dump(idx, open(f"{OUT}/index.json", "w"), separators=(",", ":"))
log(len(written), "Kacheln geschrieben,", round(total / 1e6, 1), "MB")

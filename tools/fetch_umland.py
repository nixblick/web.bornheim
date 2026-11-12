"""Spielgebiet über die Stadtgrenze hinaus: Korridore entlang U- und S-Bahn bis zu ihren Endhalten im Nahbereich.
Je Korridor ein Streifen um die Strecke (Kacheln, die die Gleise berühren, plus eine Kachel Rand = ca. 1,5 km breit)
und der Ortskern um den Zielhalt (Kacheln im Umkreis von 1 km). Bestehende Kacheln (data/tiles/index.json) bleiben unberührt.
Schritte:
  1. Linien und Halte per Overpass (data/raw/routes.json, wird zwischengespeichert)
  2. neue Kacheln -> data/raw/tiles.json (tiles = nur neue Kacheln, core = bisheriger Kern) und data/raw/umland_tiles.json
  3. OSM je Block (8 x 8 Kacheln) per Overpass -> data/raw/blk_<bx>_<bz>.jsonl.gz im Format von tools/pbf_to_raw.py
Danach: python3 -I tools/fetch_dgm_ffm.py data/raw/umland_tiles.json && python3 -I tools/build_tiles.py --add
Aufruf: python3 -I tools/fetch_umland.py [--plan]   (--plan: nur Kacheln zählen, nichts holen)"""
import gzip, json, math, os, sys, time, urllib.parse, urllib.request
LAT0, LON0, R = 50.129441, 8.7096938, 6371000.0; TS = 500; BS = 8
COSL = math.cos(math.radians(LAT0))
def xy(lat, lon): return (math.radians(lon - LON0) * R * COSL, -math.radians(lat - LAT0) * R)
def ll(x, z): return LAT0 - math.degrees(z / R), LON0 + math.degrees(x / (R * COSL))
def tof(x, z): return (math.floor(x / TS), math.floor(z / TS))
SERVERS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"]
UA = {"User-Agent": "web.bornheim-game/0.4 (github.com/nixblick/web.bornheim)"}
RAW = "data/raw"; os.makedirs(RAW, exist_ok=True)
# Linie -> Zielhalt (OSM-Name). Bis dorthin wird das Gebiet von der Stadt aus verlängert.
TARGETS = {"U2": "Gonzenheim", "U3": "Hohemark", "S5": "Bad Homburg v. d. Höhe", "S3": "Eschborn", "S4": "Eschborn",
           "S6": "Bad Vilbel", "S1": "Offenbach-Bieber", "S2": "Offenbach-Bieber"}
def query(q, timeout=300, tries=8):
    data = urllib.parse.urlencode({"data": q}).encode(); last = None
    for attempt in range(tries):
        url = SERVERS[attempt % len(SERVERS)]
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=UA), timeout=timeout) as r: raw = r.read()
            j = json.loads(raw)
            if j.get("remark") and ("error" in j["remark"].lower() or "timed out" in j["remark"].lower()): raise RuntimeError(j["remark"][:200])
            return j
        except Exception as e:
            last = e; print("  Fehler", url.split('/')[2], str(e)[:120], flush=True); time.sleep(10 + attempt * 15)
    raise last

IDX = json.load(open("data/tiles/index.json")); OLD = {tuple(map(int, k.split("_"))) for k in IDX["tiles"]}
rp = RAW + "/routes.json"
if not os.path.exists(rp):
    q = ('[out:json][timeout:240];(rel["type"="route"]["route"="train"]["ref"~"^S[1-9]$"](49.95,8.40,50.30,8.95);'
         'rel["type"="route"]["route"~"subway|light_rail"]["ref"~"^U[1-9]$"](49.95,8.40,50.30,8.95);)->.r;.r out body;node(r.r);out;way(r.r)["railway"];out geom;')
    json.dump(query(q), open(rp, "w"))
E = json.load(open(rp))["elements"]
nodes = {e["id"]: e for e in E if e["type"] == "node"}; ways = {e["id"]: [xy(p["lat"], p["lon"]) for p in e["geometry"]] for e in E if e["type"] == "way"}
def seg_d(p, a, b):
    dx, dz = b[0] - a[0], b[1] - a[1]; L = dx * dx + dz * dz or 1e-9; t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L))
    return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz)
NEW = set(); report = []
for r in (e for e in E if e["type"] == "relation"):
    ref = r["tags"].get("ref"); tgt = TARGETS.get(ref)
    if not tgt: continue
    st = [(nodes[m["ref"]].get("tags", {}).get("name", ""), xy(nodes[m["ref"]]["lat"], nodes[m["ref"]]["lon"]))
          for m in r["members"] if m["type"] == "node" and m["role"].startswith("stop") and m["ref"] in nodes]
    names = [s[0] for s in st]
    if tgt not in names: continue
    ti = names.index(tgt)
    # vom Zielhalt zur Stadt laufen, bis der erste Halt im bisherigen Gebiet liegt
    step = 1 if ti + 1 < len(st) and any(tof(*s[1]) in OLD for s in st[ti + 1:]) else -1
    chain = [st[ti]]; k = ti
    while 0 <= k + step < len(st):
        k += step; chain.append(st[k])
        if tof(*st[k][1]) in OLD: break
    poly = [c[1] for c in chain]
    band = set()
    for w in (m["ref"] for m in r["members"] if m["type"] == "way" and m["ref"] in ways):
        g = ways[w]
        for a in range(len(g) - 1):
            n = max(1, int(math.hypot(g[a + 1][0] - g[a][0], g[a + 1][1] - g[a][1]) / 100))
            for s in range(n + 1):
                p = (g[a][0] + (g[a + 1][0] - g[a][0]) * s / n, g[a][1] + (g[a + 1][1] - g[a][1]) * s / n)
                if min(seg_d(p, poly[i], poly[i + 1]) for i in range(len(poly) - 1)) < 400: band.add(tof(*p))
    for c in [c[1] for c in chain]: band.add(tof(*c))
    add = {(tx + a, tz + b) for tx, tz in band for a in (-1, 0, 1) for b in (-1, 0, 1)}
    cx, cz = st[ti][1]
    add |= {(tx, tz) for tx in range(math.floor(cx / TS) - 3, math.floor(cx / TS) + 4) for tz in range(math.floor(cz / TS) - 3, math.floor(cz / TS) + 4)
            if math.hypot((tx + 0.5) * TS - cx, (tz + 0.5) * TS - cz) <= 1000 + TS * 0.71}
    new = add - OLD; NEW |= new
    report.append(f"{ref} {r['tags'].get('name', '')[:40]}: {' > '.join(c[0] for c in chain)} | {len(new)} neue Kacheln")
for l in sorted(set(report)): print(l)
NEW = sorted(NEW)
print(len(NEW), "neue Kacheln insgesamt (bisher", len(OLD), ")", flush=True)
json.dump({"ts": TS, "tiles": NEW}, open(RAW + "/umland_tiles.json", "w"))
json.dump({"ts": TS, "core": IDX["core"], "tiles": NEW}, open(RAW + "/tiles.json", "w"))
if "--plan" in sys.argv: sys.exit(0)

# ---------- OSM je Block ----------
Q = open("tools/osm_query.txt", encoding="utf-8").read().replace("out body;\n>;\nout skel qt;", "out geom;")
assert "out geom;" in Q
AREA_REL = ('rel["type"="multipolygon"]["building"]({BBOX});rel["type"="multipolygon"]["natural"~"water|scrub|wood"]({BBOX});'
            'rel["type"="multipolygon"]["landuse"~"grass|cemetery|allotments|forest|meadow|recreation_ground"]({BBOX});'
            'rel["type"="multipolygon"]["leisure"~"park|playground|pitch|garden"]({BBOX});')
Q = Q.replace("\n);\nout geom;", "\n" + AREA_REL + "\n);\nout geom;")
def rings(members):
    segs = [[(p["lat"], p["lon"]) for p in m["geometry"]] for m in members if m["type"] == "way" and m.get("role") == "outer" and m.get("geometry")]
    out = []
    while segs:
        ring = segs.pop(0)
        while ring[0] != ring[-1]:
            for i, s in enumerate(segs):
                if s[0] == ring[-1]: ring += s[1:]; segs.pop(i); break
                if s[-1] == ring[-1]: ring += s[::-1][1:]; segs.pop(i); break
            else: break
        if ring[0] == ring[-1] and len(ring) >= 4: out.append(ring)
    return out
blocks = sorted({(tx // BS, tz // BS) for tx, tz in NEW})
for n, (bx, bz) in enumerate(blocks):
    fn = f"{RAW}/blk_{bx}_{bz}.jsonl.gz"
    if os.path.exists(fn): continue
    mine = [t for t in NEW if t[0] // BS == bx and t[1] // BS == bz]
    x0 = (min(t[0] for t in mine) - 1) * TS; x1 = (max(t[0] for t in mine) + 2) * TS; z0 = (min(t[1] for t in mine) - 1) * TS; z1 = (max(t[1] for t in mine) + 2) * TS
    s_, w_ = ll(x0, z1); n_, e_ = ll(x1, z0)
    t0 = time.time(); j = query(Q.replace("{BBOX}", f"{s_:.5f},{w_:.5f},{n_:.5f},{e_:.5f}"))
    lines = []
    for e in j["elements"]:
        if e["type"] == "node" and e.get("tags"): lines.append({"n": e["id"], "t": e["tags"], "c": [e["lat"], e["lon"]]})
        elif e["type"] == "way" and e.get("geometry"): lines.append({"w": e["id"], "t": e.get("tags", {}), "c": [[p["lat"], p["lon"]] for p in e["geometry"]]})
        elif e["type"] == "relation":
            t = dict(e.get("tags", {})); t.pop("type", None)
            for k, ring in enumerate(rings(e.get("members", []))): lines.append({"w": -(e["id"] * 100 + k), "t": t, "c": [list(p) for p in ring]})
    with gzip.open(fn + ".tmp", "wt", encoding="utf-8", compresslevel=3) as f:
        for o in lines: f.write(json.dumps(o, separators=(",", ":"), ensure_ascii=False) + "\n")
    os.replace(fn + ".tmp", fn)
    print(f"{n + 1}/{len(blocks)} Block {bx},{bz}: {len(mine)} Kacheln, {len(lines)} Objekte, {time.time() - t0:.0f} s", flush=True); time.sleep(5)
print("fertig", flush=True)

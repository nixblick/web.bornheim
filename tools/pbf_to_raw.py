"""OSM-Auszug (.osm.pbf, z. B. BBBike Frankfurt) -> data/raw/blk_<bx>_<bz>.jsonl.gz, ein Block = 8 x 8 Spielkacheln (4 km).
Jeder Weg landet in allen Blöcken, die er (mit einer Kachel Rand) berührt, damit build_tiles.py Block für Block mit wenig Speicher arbeiten kann.
Filtert dieselben Objekte wie tools/osm_query.txt (Overpass-Regex = Teilstring-Treffer).
Braucht pyosmium (pip install osmium) und data/raw/tiles.json (tools/fetch_dgm_ffm.py).
Aufruf (ohne -I, damit pip --user greift): python tools/pbf_to_raw.py data/raw/Frankfurt.osm.pbf"""
import gzip, json, math, re, sys, time
import osmium

LAT0, LON0, R = 50.129441, 8.7096938, 6371000.0; TS = 500; BS = 8
COSL = math.cos(math.radians(LAT0))
def tile(lat, lon): return (math.floor(math.radians(lon - LON0) * R * COSL / TS), math.floor(-math.radians(lat - LAT0) * R / TS))
KEEP = {tuple(t) for t in json.load(open("data/raw/tiles.json"))["tiles"]}
BLOCKS = {(tx // BS, tz // BS) for tx, tz in KEEP}
WAY = [("building", None), ("highway", None), ("natural", "^water$"), ("waterway", None), ("leisure", "park|playground|pitch|garden"),
       ("landuse", "grass|cemetery|allotments|forest|meadow|recreation_ground"), ("railway", "rail|tram|subway|light_rail"),
       ("barrier", "fence|wall|hedge|retaining_wall"), ("natural", "scrub|tree_row|wood"), ("shop", None),
       ("amenity", "bank|cafe|restaurant|pharmacy|school|kindergarten|place_of_worship|community_centre|bar|pub|fast_food")]
NODE = [("natural", "^tree$"), ("highway", "^traffic_signals$"), ("shop", None),
        ("amenity", "bank|cafe|restaurant|pharmacy|bar|pub|fast_food|bakery|kindergarten|school|post_office|doctors|dentist|ice_cream|bicycle_rental|atm"),
        ("highway", "^bus_stop$"), ("railway", "tram_stop|station|halt"), ("amenity", "bench|waste_basket|bicycle_parking|vending_machine|telephone|post_box|recycling|fountain"),
        ("highway", "street_lamp|crossing")]
WAY = [(k, re.compile(v) if v else None) for k, v in WAY]; NODE = [(k, re.compile(v) if v else None) for k, v in NODE]
def match(tags, rules):
    for k, rx in rules:
        v = tags.get(k)
        if v is not None and (rx is None or rx.search(v)): return True
    return False
out = {}
def writer(b):
    if b not in out: out[b] = gzip.open(f"data/raw/blk_{b[0]}_{b[1]}.jsonl.gz", "wt", encoding="utf-8", compresslevel=3)
    return out[b]
def blocks_of(tiles):
    bs = set()
    for tx, tz in tiles:
        for a in (-1, 0, 1):
            for c in (-1, 0, 1):
                b = ((tx + a) // BS, (tz + c) // BS)
                if b in BLOCKS: bs.add(b)
    return bs
class H(osmium.SimpleHandler):
    def __init__(self): super().__init__(); self.nw = 0; self.nn = 0
    def node(self, n):
        if not n.tags or not n.location.valid(): return
        t = dict(n.tags)
        if not match(t, NODE): return
        lat, lon = n.location.lat, n.location.lon; s = json.dumps({"n": n.id, "t": t, "c": [lat, lon]}, separators=(",", ":"), ensure_ascii=False)
        for b in blocks_of([tile(lat, lon)]): writer(b).write(s + "\n")
        self.nn += 1
    def way(self, w):
        if not w.tags: return
        t = dict(w.tags)
        if not match(t, WAY): return
        c = [[nd.location.lat, nd.location.lon] for nd in w.nodes if nd.location.valid()]
        if len(c) < 2: return
        tl = {tile(*p) for p in c}
        if c[0] == c[-1] and len(c) > 3:  # Fläche: alle Kacheln der Bbox (große Wälder umschließen Blöcke ohne eigene Knoten)
            xs = [q[0] for q in tl]; zs = [q[1] for q in tl]
            if (max(xs) - min(xs) + 1) * (max(zs) - min(zs) + 1) < 4000: tl = {(x, z) for x in range(min(xs), max(xs) + 1) for z in range(min(zs), max(zs) + 1)}
        bs = blocks_of(tl)
        if not bs: return
        s = json.dumps({"w": w.id, "t": t, "c": c}, separators=(",", ":"), ensure_ascii=False)
        for b in bs: writer(b).write(s + "\n")
        self.nw += 1
AREA = [("natural", "^water$|scrub|wood"), ("waterway", "riverbank"), ("leisure", "park|playground|pitch|garden"),
        ("landuse", "grass|cemetery|allotments|forest|meadow|recreation_ground"), ("amenity", "school|kindergarten|community_centre|place_of_worship")]
AREA = [(k, re.compile(v)) for k, v in AREA]
def area(self, a):
    """Multipolygone (Main, Stadtwald, große Parks, Großbauten wie Hauptbahnhof und Messe): Außenringe als geschlossene Wege; Wege-Flächen kommen schon über way()."""
    if a.from_way(): return
    t = dict(a.tags)
    bld = t.get("building") not in (None, "no")
    if not bld and not match(t, AREA): return
    if bld: t = {k: v for k, v in t.items() if k in ("building", "height", "building:levels", "roof:shape", "roof:levels", "name", "shop", "amenity", "leisure", "min_height")}
    if t.get("waterway") == "riverbank": t["natural"] = "water"
    for k, ring in enumerate(a.outer_rings()):
        c = [[nd.location.lat, nd.location.lon] for nd in ring if nd.location.valid()]
        if len(c) < 4: continue
        if c[0] != c[-1]: c.append(c[0])
        tl = {tile(*p) for p in c}; xs = [q[0] for q in tl]; zs = [q[1] for q in tl]
        if (max(xs) - min(xs) + 1) * (max(zs) - min(zs) + 1) < 4000: tl = {(x, z) for x in range(min(xs), max(xs) + 1) for z in range(min(zs), max(zs) + 1)}
        bs = blocks_of(tl)
        if not bs: continue
        s = json.dumps({"w": -(a.orig_id() * 100 + k), "t": t, "c": c}, separators=(",", ":"), ensure_ascii=False)
        for b in bs: writer(b).write(s + chr(10))
        self.na += 1
H.area = area
t0 = time.time(); h = H(); h.na = 0; h.apply_file(sys.argv[1], locations=True, idx="flex_mem")
for f in out.values(): f.close()
print(f"{h.nw} Wege, {h.na} Multipolygon-Ringe, {h.nn} Punkte in {len(out)} Blöcken, {time.time() - t0:.0f} s", flush=True)

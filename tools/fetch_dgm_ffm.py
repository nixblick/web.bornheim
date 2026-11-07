"""Geländehöhen für ganz Frankfurt aus dem DGM1 Hessen (HVBG, Datenlizenz Deutschland Zero 2.0), 4-m-Raster.
Ergebnis: je Spielkachel (500 m) data/dem/<tx>_<tz>.bin mit 126 x 126 Werten (Uint16, (h - BASE + 50) * 100, zeilenweise nach z).
Braucht data/raw/ring.json (Stadtgrenze, von tools/fetch_osm_ffm.py). Vorhandene Kacheln werden übersprungen.
Aufruf: python -I tools/fetch_dgm_ffm.py"""
import json, math, os, re, struct, sys, time, urllib.request
LAT0, LON0, R = 50.129441, 8.7096938, 6371000.0
BASE = 89.02; TS = 500; N = 126; STEP = 4
OUT = "data/dem"; os.makedirs(OUT, exist_ok=True)
def xy(lat, lon): return math.radians(lon - LON0) * R * math.cos(math.radians(LAT0)), -math.radians(lat - LAT0) * R
def ll(x, z): return LAT0 - math.degrees(z / R), LON0 + math.degrees(x / (R * math.cos(math.radians(LAT0))))
def utm32(lat, lon):
    a = 6378137.0; f = 1 / 298.257223563; k0 = 0.9996; e2 = f * (2 - f); ep2 = e2 / (1 - e2)
    lon0r = math.radians(9.0); la = math.radians(lat); lo = math.radians(lon)
    Nn = a / math.sqrt(1 - e2 * math.sin(la) ** 2); T = math.tan(la) ** 2; C = ep2 * math.cos(la) ** 2; A = math.cos(la) * (lo - lon0r)
    M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * la - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * math.sin(2 * la)
             + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * math.sin(4 * la) - (35 * e2 ** 3 / 3072) * math.sin(6 * la))
    E = k0 * Nn * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000
    No = k0 * (M + Nn * math.tan(la) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720))
    return E, No
def tiles_for_ring(ring, pad=1):
    P = [xy(a, b) for a, b in ring]
    def inside(x, z):
        c = False; n = len(P)
        for i in range(n):
            (ax, az), (bx, bz) = P[i], P[(i + 1) % n]
            if (az > z) != (bz > z) and x < (bx - ax) * (z - az) / (bz - az) + ax: c = not c
        return c
    x0 = math.floor(min(p[0] for p in P) / TS) - pad; x1 = math.floor(max(p[0] for p in P) / TS) + pad
    z0 = math.floor(min(p[1] for p in P) / TS) - pad; z1 = math.floor(max(p[1] for p in P) / TS) + pad
    core = set()
    for tx in range(x0, x1 + 1):
        for tz in range(z0, z1 + 1):
            if any(inside(tx * TS + a * TS / 4, tz * TS + b * TS / 4) for a in range(5) for b in range(5)): core.add((tx, tz))
    for (x, z) in P[::3]: core.add((math.floor(x / TS), math.floor(z / TS)))
    out = set()
    for (tx, tz) in core:
        for dx in range(-pad, pad + 1):
            for dz in range(-pad, pad + 1): out.add((tx + dx, tz + dz))
    return sorted(core), sorted(out)
if __name__ == "__main__":
    ring = json.load(open("data/raw/ring.json"))
    core, tiles = tiles_for_ring(ring)
    json.dump({"ts": TS, "core": core, "tiles": tiles}, open("data/raw/tiles.json", "w"))
    print(len(core), "Kacheln in der Stadt,", len(tiles), "mit Rand", flush=True)
    todo = [t for t in tiles if not os.path.exists(f"{OUT}/{t[0]}_{t[1]}.bin")]
    blocks = sorted({(math.floor(tx / 4), math.floor(tz / 4)) for tx, tz in todo})
    print(len(blocks), "Blöcke zu laden", flush=True)
    for n, (bx, bz) in enumerate(blocks):
        X0, Z0 = bx * 4 * TS, bz * 4 * TS; X1, Z1 = X0 + 4 * TS, Z0 + 4 * TS
        cs = [utm32(*ll(x, z)) for x in (X0, X1) for z in (Z0, Z1)]
        e0 = math.floor(min(c[0] for c in cs) / 8) * 8 - 16; e1 = math.ceil(max(c[0] for c in cs) / 8) * 8 + 16
        n0 = math.floor(min(c[1] for c in cs) / 8) * 8 - 16; n1 = math.ceil(max(c[1] for c in cs) / 8) * 8 + 16
        url = ("https://inspire-hessen.de/raster/dgm1/ows?SERVICE=WCS&REQUEST=GetCoverage&VERSION=2.0.1&COVERAGEID=he_dgm1_4" +
               f"&SUBSET=E({e0},{e1})&SUBSET=N({n0},{n1})&FORMAT=application/gml%2Bxml")
        for attempt in range(6):
            try:
                xml = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "web.bornheim/0.3"}), timeout=300).read().decode("utf-8"); break
            except Exception as e:
                print("  Fehler", str(e)[:100], flush=True); time.sleep(10 + attempt * 20)
        else: raise SystemExit("WCS nicht erreichbar")
        lo = [float(v) for v in re.search(r"<gml:low>([^<]*)</gml:low>", xml).group(1).split()]
        hi = [float(v) for v in re.search(r"<gml:high>([^<]*)</gml:high>", xml).group(1).split()]
        W = int(hi[0] - lo[0] + 1); H = int(hi[1] - lo[1] + 1)
        origin = [float(v) for v in re.search(r"<gml:origin>.*?<gml:pos>([^<]*)</gml:pos>", xml, re.S).group(1).split()]
        offs = re.findall(r"<gml:offsetVector[^>]*>([^<]*)</gml:offsetVector>", xml)
        dE = float(offs[0].split()[0]); dN = float(offs[1].split()[1])
        vals = [float(v) for v in re.search(r"<gml:tupleList[^>]*>([^<]*)</gml:tupleList>", xml).group(1).replace(",", " ").split()]
        assert len(vals) == W * H, (len(vals), W, H)
        CM = 'axisOrder="+2 +1"' in xml
        g = (lambda i, j: vals[i * H + j]) if CM else (lambda i, j: vals[j * W + i])
        def sample(E, Nn):
            fx = (E - origin[0]) / dE; fy = (Nn - origin[1]) / dN
            ix = max(0, min(W - 2, int(fx))); iy = max(0, min(H - 2, int(fy))); tx = min(1, max(0, fx - ix)); ty = min(1, max(0, fy - iy))
            v = [g(ix, iy), g(ix + 1, iy), g(ix, iy + 1), g(ix + 1, iy + 1)]
            if min(v) < -100: v = [q for q in v if q > -100] or [BASE]; return sum(v) / len(v)
            return (v[0] * (1 - tx) + v[1] * tx) * (1 - ty) + (v[2] * (1 - tx) + v[3] * tx) * ty
        done = 0; TODO = set(todo)
        for tx in range(bx * 4, bx * 4 + 4):
            for tz in range(bz * 4, bz * 4 + 4):
                if (tx, tz) not in TODO: continue
                buf = bytearray()
                for iz in range(N):
                    for ix in range(N):
                        E, No = utm32(*ll(tx * TS + ix * STEP, tz * TS + iz * STEP))
                        buf += struct.pack("<H", max(0, min(65535, round((sample(E, No) - BASE + 50) * 100))))
                open(f"{OUT}/{tx}_{tz}.bin", "wb").write(buf); done += 1
        print(f"{n + 1}/{len(blocks)} Block {bx},{bz}: {done} Kacheln", flush=True); time.sleep(1)
    print("fertig", flush=True)

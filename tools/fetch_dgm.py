"""Gelaendehoehen aus dem DGM1 Hessen (HVBG, Datenlizenz Deutschland Zero 2.0) ueber den INSPIRE-WCS
-> data/dem.json im lokalen Meter-Raster des Spiels. Ersetzt das grobe EU-DEM (25 m).
Aufruf: python tools/fetch_dgm.py [rasterweite_m]   (Standard 4)"""
import json, math, re, sys, urllib.request

STEP = int(sys.argv[1]) if len(sys.argv) > 1 else 4
COV = {1: "he_dgm1", 2: "he_dgm1_2", 4: "he_dgm1_4", 8: "he_dgm1_8"}[STEP]
city = json.load(open("data/city.json", encoding="utf-8"))
lat0, lon0 = city["origin"]
R = 6371000.0
X0, X1, Z0, Z1 = -1000, 1300, -1100, 900

def utm32(lat, lon):
    a = 6378137.0; f = 1 / 298.257223563; k0 = 0.9996; e2 = f * (2 - f); ep2 = e2 / (1 - e2)
    lon0r = math.radians(9.0); la = math.radians(lat); lo = math.radians(lon)
    N = a / math.sqrt(1 - e2 * math.sin(la) ** 2); T = math.tan(la) ** 2; C = ep2 * math.cos(la) ** 2; A = math.cos(la) * (lo - lon0r)
    M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * la - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * math.sin(2 * la)
             + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * math.sin(4 * la) - (35 * e2 ** 3 / 3072) * math.sin(6 * la))
    E = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000
    Nn = k0 * (M + N * math.tan(la) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720))
    return E, Nn

def local_to_ll(x, z):
    return lat0 - math.degrees(z / R), lon0 + math.degrees(x / (R * math.cos(math.radians(lat0))))

# Ausschnitt in UTM mit Rand
cs = [utm32(*local_to_ll(x, z)) for x in (X0, X1) for z in (Z0, Z1)]
e0 = math.floor(min(c[0] for c in cs) / 8) * 8 - 16; e1 = math.ceil(max(c[0] for c in cs) / 8) * 8 + 16
n0 = math.floor(min(c[1] for c in cs) / 8) * 8 - 16; n1 = math.ceil(max(c[1] for c in cs) / 8) * 8 + 16
url = ("https://inspire-hessen.de/raster/dgm1/ows?SERVICE=WCS&REQUEST=GetCoverage&VERSION=2.0.1&COVERAGEID=" + COV +
       f"&SUBSET=E({e0},{e1})&SUBSET=N({n0},{n1})&FORMAT=application/gml%2Bxml")
print("lade", url)
xml = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "web.bornheim/0.2"}), timeout=300).read().decode("utf-8")
lo = [float(v) for v in re.search(r"<gml:low>([^<]*)</gml:low>", xml).group(1).split()]
hi = [float(v) for v in re.search(r"<gml:high>([^<]*)</gml:high>", xml).group(1).split()]
W = int(hi[0] - lo[0] + 1); H = int(hi[1] - lo[1] + 1)
origin = [float(v) for v in re.search(r"<gml:origin>.*?<gml:pos>([^<]*)</gml:pos>", xml, re.S).group(1).split()]
offs = re.findall(r"<gml:offsetVector[^>]*>([^<]*)</gml:offsetVector>", xml)
dE = float(offs[0].split()[0]); dN = float(offs[1].split()[1])
vals = [float(v) for v in re.search(r"<gml:tupleList[^>]*>([^<]*)</gml:tupleList>", xml).group(1).replace(",", " ").split()]
print("Raster", W, "x", H, "Ursprung", origin, "Schritt", dE, dN, "Werte", len(vals))
assert len(vals) == W * H
COLMAJOR = 'axisOrder="+2 +1"' in xml  # GML: zweite Achse (N) laeuft am schnellsten
print('spaltenweise' if COLMAJOR else 'zeilenweise')

def sample(E, N):
    fx = (E - origin[0]) / dE; fy = (N - origin[1]) / dN
    ix = max(0, min(W - 2, int(fx))); iy = max(0, min(H - 2, int(fy))); tx = fx - ix; ty = fy - iy
    g = (lambda i, j: vals[i * H + j]) if COLMAJOR else (lambda i, j: vals[j * W + i])
    return (g(ix, iy) * (1 - tx) + g(ix + 1, iy) * tx) * (1 - ty) + (g(ix, iy + 1) * (1 - tx) + g(ix + 1, iy + 1) * tx) * ty

nx = (X1 - X0) // STEP + 1; nz = (Z1 - Z0) // STEP + 1
hs = []
for iz in range(nz):
    for ix in range(nx):
        hs.append(sample(*utm32(*local_to_ll(X0 + ix * STEP, Z0 + iz * STEP))))
hmin = min(hs)
json.dump({"x0": X0, "z0": Z0, "step": STEP, "nx": nx, "nz": nz, "base": round(hmin, 2), "src": "DGM1 Hessen (HVBG), dl-de/zero-2-0",
           "h": [round(h - hmin, 2) for h in hs]}, open("data/dem.json", "w"), separators=(",", ":"))
print("fertig", nx, "x", nz, "min", round(hmin, 1), "max", round(max(hs), 1))

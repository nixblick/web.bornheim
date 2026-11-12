"""Brückendecks anheben (#84): Endpunkte (Widerlager) und Spannweite.

Vorher kam jede Brückenhöhe nur aus dem Gelände am OSM-Knoten plus Lichtraum über kreuzenden Straßen.
Liegt der letzte Knoten über dem Uferweg statt auf dem Damm (Flößerbrücke Süd: 5,07 m statt ~8 m am
Wasserweg) oder fehlt mitten über dem Main ein Knoten mit Kreuzung (Alte Brücke: 5,23 m), hing das Deck
durch oder lief schräg ins Wasser.

lift(roads, H, TH) ändert H (Schlüssel (x, z) -> Höhe):
1. Widerlager: Endknoten eines Brückenzugs bekommt mindestens das Gelände 4 m und 8 m weiter in Fahrtrichtung.
2. Spannweite: jeder Knoten eines Brückenzugs liegt mindestens auf der Geraden zwischen den beiden Widerlagern.
Nur Brückenzüge über Wasser (wet(x, z) an einem Punkt alle 10 m), sonst bleibt alles wie bisher.
Ein Brückenzug sind alle zusammenhängenden br-Stücke (auch über Kachelgrenzen); mit Verzweigung nur je Weg.
"""
import math


def _k(p):
    return (p[0], p[1])


def _samples(pts):
    for a in range(len(pts) - 1):
        (ax, az), (bx, bz) = pts[a], pts[a + 1]; n = max(1, int(math.hypot(bx - ax, bz - az) / 10))
        for i in range(n + 1): yield (ax + (bx - ax) * i / n, az + (bz - az) * i / n)


def lift(roads, H, TH, wet=None):
    br = [r for r in roads if r.get("br") and len(r["p"]) >= 2]
    ends = {}
    for i, r in enumerate(br):
        for p in (r["p"][0], r["p"][-1]): ends.setdefault(_k(p), []).append(i)
    seen = set(); changed = set()

    def bump(k, h):
        if h > H.get(k, -1e9) + 0.01: H[k] = h; changed.add(k)

    for s in range(len(br)):
        if s in seen: continue
        comp = []; stack = [s]; seen.add(s)
        while stack:
            i = stack.pop(); comp.append(i)
            for p in (br[i]["p"][0], br[i]["p"][-1]):
                for j in ends[_k(p)]:
                    if j not in seen: seen.add(j); stack.append(j)
        deg = {}
        for i in comp:
            for p in (br[i]["p"][0], br[i]["p"][-1]): deg[_k(p)] = deg.get(_k(p), 0) + 1
        term = [k for k, d in deg.items() if d == 1]
        paths = []
        if len(term) == 2 and all(d <= 2 for d in deg.values()):
            # Zug ordnen: vom ersten Endpunkt Stück für Stück weiter
            pts = [term[0]]; used = set(); cur = term[0]
            while True:
                nxt = None
                for i in ends[cur]:
                    if i in used or i not in comp: continue
                    p = br[i]["p"]; seq = p if _k(p[0]) == cur else p[::-1]
                    used.add(i); pts += [_k(q) for q in seq[1:]]; cur = pts[-1]; nxt = i; break
                if nxt is None: break
            paths.append(pts)
        else:
            paths += [[_k(q) for q in br[i]["p"]] for i in comp]
        if wet and not any(wet(*q) for pts in paths for q in _samples(pts)): continue
        for pts in paths:
            for k in pts: H.setdefault(k, TH(*k))
            # 1. Widerlager
            for a, b in ((0, 1), (-1, -2)):
                (tx, tz), (px, pz) = pts[a], pts[b]; d = math.hypot(tx - px, tz - pz)
                if d < 0.5: continue
                ux, uz = (tx - px) / d, (tz - pz) / d
                bump(pts[a], max(TH(tx + ux * s_, tz + uz * s_) for s_ in (4, 8)))
            # 2. Spannweite: nicht unter die Gerade zwischen den Widerlagern
            cum = [0.0]
            for a in range(1, len(pts)): cum.append(cum[-1] + math.hypot(pts[a][0] - pts[a - 1][0], pts[a][1] - pts[a - 1][1]))
            L = cum[-1] or 1; h0, h1 = H[pts[0]], H[pts[-1]]
            for a in range(1, len(pts) - 1): bump(pts[a], h0 + (h1 - h0) * cum[a] / L)
    return changed


def water_test(polys, G=50):
    """wet(x, z): liegt der Punkt in einer Wasserfläche (Raster G m für die Suche)."""
    grid = {}
    for w in polys:
        xs = [q[0] for q in w["p"]]; zs = [q[1] for q in w["p"]]
        for gx in range(math.floor(min(xs) / G), math.floor(max(xs) / G) + 1):
            for gz in range(math.floor(min(zs) / G), math.floor(max(zs) / G) + 1): grid.setdefault((gx, gz), []).append(w["p"])
    def inside(x, z, p):
        c = False; j = len(p) - 1
        for i in range(len(p)):
            (xi, zi), (xj, zj) = p[i], p[j]
            if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi) + xi: c = not c
            j = i
        return c
    return lambda x, z: any(inside(x, z, p) for p in grid.get((math.floor(x / G), math.floor(z / G)), ()))

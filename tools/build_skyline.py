#!/usr/bin/env python3
"""Horizont-Skyline aus den Kacheln erzeugen: alle Gebäude ab 90 m (plus Domturm) mit vereinfachtem Grundriss.
Ausgabe data/skyline.json: [{n, k (Kachel), x, z, y (Geländehöhe), h, p (Grundriss relativ zum Schwerpunkt)}]
Aufruf: python3 tools/build_skyline.py"""
import json, glob, os, math

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IDX = json.load(open(os.path.join(ROOT, 'data/tiles/index.json')))
MIN_H = 90


def rdp(pts, eps):
    if len(pts) < 3: return pts
    (ax, az), (bx, bz) = pts[0], pts[-1]
    dx, dz = bx - ax, bz - az; L = math.hypot(dx, dz) or 1e-9
    dmax, idx = 0, 0
    for i in range(1, len(pts) - 1):
        d = abs((pts[i][0] - ax) * dz - (pts[i][1] - az) * dx) / L
        if d > dmax: dmax, idx = d, i
    if dmax <= eps: return [pts[0], pts[-1]]
    return rdp(pts[:idx + 1], eps)[:-1] + rdp(pts[idx:], eps)


def simplify(p):
    p = [tuple(q) for q in p]
    if p[0] == p[-1]: p = p[:-1]
    # am weitesten entfernten Punkt als Start, damit RDP auf dem geschlossenen Ring sauber teilt
    i0 = max(range(len(p)), key=lambda i: p[i][0] * 3 + p[i][1])
    p = p[i0:] + p[:i0]
    m = max(range(len(p)), key=lambda i: math.hypot(p[i][0] - p[0][0], p[i][1] - p[0][1]))
    for eps in (0.8, 1.5, 2.5, 4):
        s = rdp(p[:m + 1], eps)[:-1] + rdp(p[m:] + [p[0]], eps)[:-1]
        if len(s) <= 24: break
    return s


def dem_h(k, x, z):
    f = os.path.join(ROOT, 'data/dem', k + '.bin')
    inf = IDX['tiles'][k]
    if not os.path.exists(f): return inf[2]
    import array
    a = array.array('H'); a.frombytes(open(f, 'rb').read())
    tx, tz = map(int, k.split('_')); ts, st, n = IDX['ts'], IDX['demStep'], IDX['demN']
    i = min(n - 1, max(0, round((x - tx * ts) / st))); j = min(n - 1, max(0, round((z - tz * ts) / st)))
    return a[j * n + i] / 100 - 50


out = []
for f in sorted(glob.glob(os.path.join(ROOT, 'data/tiles/*_*.json'))):
    k = os.path.basename(f)[:-5]
    t = json.load(open(f))
    for b in t.get('buildings', []):
        n = b.get('n', ''); h = b.get('h', 0)
        dom = n == 'Kaiserdom St. Bartholomäus'
        if h < MIN_H and not dom: continue
        p = b['p'][:-1] if b['p'][0] == b['p'][-1] else b['p']
        cx = sum(q[0] for q in p) / len(p); cz = sum(q[1] for q in p) / len(p)
        if dom:  # Westturm: am Westende des Kirchengrundrisses, auf der Längsachse
            x0 = min(q[0] for q in p); west = [q for q in p if q[0] < x0 + 22]
            cx = x0 + 11; cz = sum(q[1] for q in west) / len(west); h = 95; sp = [[-10, -10], [10, -10], [10, 10], [-10, 10]]
        else:
            sp = [[round(q[0] - cx, 1), round(q[1] - cz, 1)] for q in simplify(p)]
        out.append({'n': n, 'k': k, 'x': round(cx, 1), 'z': round(cz, 1), 'y': round(dem_h(k, cx, cz), 1), 'h': h, 'p': sp})
out.sort(key=lambda o: -o['h'])
json.dump(out, open(os.path.join(ROOT, 'data/skyline.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(out), 'Türme,', os.path.getsize(os.path.join(ROOT, 'data/skyline.json')), 'Bytes')
for o in out[:12]: print(o['n'], o['h'], o['k'], o['x'], o['z'], o['y'], len(o['p']))

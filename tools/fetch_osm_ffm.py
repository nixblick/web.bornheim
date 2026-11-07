"""OSM-Daten für ganz Frankfurt am Main in Zellen von ca. 2 km über Overpass holen.
Ergebnis: data/raw/boundary.json (Stadtgrenze) und data/raw/c_<i>_<j>.json.gz je Zelle.
Bereits vorhandene Zellen werden übersprungen, das Skript kann also jederzeit neu gestartet werden.
Aufruf: python -I tools/fetch_osm_ffm.py"""
import gzip, json, os, sys, time, urllib.parse, urllib.request
SERVERS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
UA = {"User-Agent": "web.bornheim-game/0.3 (github.com/nixblick/web.bornheim)"}
OUT = "data/raw"; os.makedirs(OUT, exist_ok=True)
def query(q, timeout=300, tries=8):
    data = urllib.parse.urlencode({"data": q}).encode(); last = None
    for attempt in range(tries):
        url = SERVERS[attempt % len(SERVERS)]
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=UA), timeout=timeout) as r: raw = r.read()
            j = json.loads(raw)
            if j.get("remark") and ("error" in j["remark"].lower() or "timed out" in j["remark"].lower()): raise RuntimeError(j["remark"][:200])
            return raw
        except Exception as e:
            last = e; print("  Fehler", url.split('/')[2], str(e)[:120], flush=True); time.sleep(5 + attempt * 10)
    raise last
# Stadtgrenze
bpath = OUT + "/boundary.json"
if not os.path.exists(bpath):
    raw = query('[out:json][timeout:120];relation["boundary"="administrative"]["admin_level"="6"]["name"="Frankfurt am Main"];out geom;')
    open(bpath, "wb").write(raw)
rel = json.load(open(bpath, encoding="utf-8"))["elements"][0]
outer = [m["geometry"] for m in rel["members"] if m["type"] == "way" and m.get("role") == "outer"]
pts = [(p["lat"], p["lon"]) for w in outer for p in w]
# Ringe zusammensetzen
segs = [[(p["lat"], p["lon"]) for p in w] for w in outer]; ring = segs.pop(0)
while segs:
    for i, s in enumerate(segs):
        if s[0] == ring[-1]: ring += s[1:]; segs.pop(i); break
        if s[-1] == ring[-1]: ring += s[::-1][1:]; segs.pop(i); break
    else: break
json.dump(ring, open(OUT + "/ring.json", "w"))
def inside(lat, lon):
    c = False; n = len(ring)
    for i in range(n):
        a, b = ring[i], ring[(i + 1) % n]
        if (a[0] > lat) != (b[0] > lat) and lon < (b[1] - a[1]) * (lat - a[0]) / (b[0] - a[0]) + a[1]: c = not c
    return c
S, N = min(p[0] for p in pts), max(p[0] for p in pts); W, E = min(p[1] for p in pts), max(p[1] for p in pts)
DLAT, DLON = 0.02, 0.03
cells = []
i = 0; lat = S
while lat < N:
    j = 0; lon = W
    while lon < E:
        samples = [(lat + a * DLAT / 4, lon + b * DLON / 4) for a in range(5) for b in range(5)]
        if any(inside(*s) for s in samples) or any(lat <= p[0] <= lat + DLAT and lon <= p[1] <= lon + DLON for p in ring[::5]): cells.append((i, j, lat, lon))
        j += 1; lon += DLON
    i += 1; lat += DLAT
print(len(cells), "Zellen", flush=True)
json.dump({"S": S, "W": W, "DLAT": DLAT, "DLON": DLON, "cells": [[c[0], c[1]] for c in cells]}, open(OUT + "/cells.json", "w"))
Q = open("tools/osm_query.txt", encoding="utf-8").read()
def fetch(name, lat, lon, dlat, dlon, depth=0):
    fn = f"{OUT}/{name}.json.gz"
    if os.path.exists(fn) or os.path.exists(f"{OUT}/{name}.split"): 
        if os.path.exists(f"{OUT}/{name}.split"):
            for q, (a, b) in enumerate(((0, 0), (0, 1), (1, 0), (1, 1))): fetch(f"{name}_{q}", lat + a * dlat / 2, lon + b * dlon / 2, dlat / 2, dlon / 2, depth + 1)
        return
    bbox = f"{lat:.5f},{lon:.5f},{lat + dlat:.5f},{lon + dlon:.5f}"
    t0 = time.time()
    try: raw = query(Q.replace("{BBOX}", bbox), tries=3 if depth < 2 else 10)
    except Exception as e:
        if depth >= 2: raise
        print(f"  {name} zu groß, teile in vier", flush=True); open(f"{OUT}/{name}.split", "w").write("1")
        return fetch(name, lat, lon, dlat, dlon, depth)
    with gzip.open(fn, "wb") as f: f.write(raw)
    print(f"{name}: {len(raw) / 1e6:.1f} MB in {time.time() - t0:.0f} s", flush=True); time.sleep(2)
for n, (i, j, lat, lon) in enumerate(cells):
    print(f"Zelle {n + 1}/{len(cells)}", flush=True); fetch(f"c_{i}_{j}", lat, lon, DLAT, DLON)
print("fertig", flush=True)

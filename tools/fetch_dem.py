"""Geländehöhen (EU-DEM 25 m über opentopodata.org) als Raster in lokalen Metern -> data/dem.json"""
import json, math, time, urllib.request, urllib.parse, sys
city = json.load(open("data/city.json", encoding="utf-8"))
lat0, lon0 = city["origin"]
R = 6371000.0
X0, X1, Z0, Z1, STEP = -1000, 1300, -1100, 900, 25
nx = (X1 - X0) // STEP + 1; nz = (Z1 - Z0) // STEP + 1
pts = []
for iz in range(nz):
    for ix in range(nx):
        x = X0 + ix * STEP; z = Z0 + iz * STEP
        lat = lat0 - math.degrees(z / R); lon = lon0 + math.degrees(x / (R * math.cos(math.radians(lat0))))
        pts.append((lat, lon))
print("Punkte:", len(pts), "Raster", nx, "x", nz)
heights = []
URL = "https://api.opentopodata.org/v1/eudem25m"
for i in range(0, len(pts), 100):
    chunk = pts[i:i + 100]
    q = "|".join(f"{a:.6f},{b:.6f}" for a, b in chunk)
    for attempt in range(5):
        try:
            req = urllib.request.Request(URL + "?locations=" + urllib.parse.quote(q), headers={"User-Agent": "web.bornheim/0.1"})
            with urllib.request.urlopen(req, timeout=60) as r:
                res = json.loads(r.read())
            heights += [p["elevation"] if p["elevation"] is not None else 0 for p in res["results"]]
            break
        except Exception as e:
            print("retry", i, e); time.sleep(3)
    else:
        sys.exit("abgebrochen")
    time.sleep(1.1)
    if (i // 100) % 10 == 0: print(i, "von", len(pts))
hmin = min(heights)
out = {"x0": X0, "z0": Z0, "step": STEP, "nx": nx, "nz": nz, "base": hmin, "h": [round(h - hmin, 1) for h in heights]}
json.dump(out, open("data/dem.json", "w"), separators=(",", ":"))
print("fertig: min", hmin, "max", max(heights))

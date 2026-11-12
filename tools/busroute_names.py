"""Gibt den Haltepunkten in data/busroutes.json Namen aus den Kacheln (stops mit n). Aufruf: python3 -I tools/busroute_names.py"""
import glob, json, math
S = []
for f in glob.glob("data/tiles/*.json"):
    for s in json.load(open(f, encoding="utf-8")).get("stops", []):
        if s.get("n"): S.append((s["x"], s["z"], s["n"]))
G = {}
for x, z, n in S: G.setdefault((int(x // 100), int(z // 100)), []).append((x, z, n))
R = json.load(open("data/busroutes.json", encoding="utf-8")); hit = tot = 0
for r in R:
    names = []
    for x, z in r["s"]:
        best, bd = "", 60.0; tot += 1
        for gx in range(int(x // 100) - 1, int(x // 100) + 2):
            for gz in range(int(z // 100) - 1, int(z // 100) + 2):
                for sx, sz, n in G.get((gx, gz), []):
                    d = math.hypot(sx - x, sz - z)
                    if d < bd: bd, best = d, n
        hit += bool(best); names.append(best)
    r["sn"] = names
json.dump(R, open("data/busroutes.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(hit, "von", tot, "Halten benannt")

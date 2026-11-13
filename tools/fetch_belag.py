"""Fahrbahnbelag aus OSM (#153): Straßen mit Pflaster (surface=sett/cobblestone/paving_stones/unhewn_cobblestone)
in Frankfurt über Overpass holen und als kleine Linienliste in Spielkoordinaten ablegen.
Ergebnis: data/belag.json = {"s": [[k, [x,z, x,z, ...]], ...]}, k = 1 Großpflaster (sett/cobblestone), 2 Verbundpflaster.
Die Kacheln bleiben unverändert; das Spiel ordnet jede Straße beim Kachelbau der nächsten Belag-Linie zu.
Aufruf: python -I tools/fetch_belag.py"""
import json, os, sys, urllib.parse, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_city import xy

SERVERS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
UA = {"User-Agent": "web.bornheim-game/0.3 (github.com/nixblick/web.bornheim)"}
Q = """[out:json][timeout:180];
area["boundary"="administrative"]["admin_level"="6"]["name"="Frankfurt am Main"]->.f;
way(area.f)["highway"~"^(primary|secondary|tertiary|unclassified|residential|living_street|service|pedestrian)$"]
  ["surface"~"^(sett|cobblestone|paving_stones|unhewn_cobblestone)$"];
out geom;"""
KIND = {"sett": 1, "cobblestone": 1, "unhewn_cobblestone": 1, "paving_stones": 2}

def main():
    data = urllib.parse.urlencode({"data": Q}).encode(); j = None
    for url in SERVERS:
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=UA), timeout=240) as r: j = json.loads(r.read()); break
        except Exception as e: print(url, e, flush=True)
    if j is None: sys.exit("kein Overpass-Server erreichbar")
    out = []
    for el in j["elements"]:
        g = el.get("geometry"); k = KIND.get(el.get("tags", {}).get("surface"))
        if not g or not k: continue
        flat = []
        for p in g: x, z = xy(p["lat"], p["lon"]); flat += [round(x), round(z)]
        out.append([k, flat])
    os.makedirs("data", exist_ok=True)
    json.dump({"s": out}, open("data/belag.json", "w"), separators=(",", ":"))
    print(len(out), "Linien,", os.path.getsize("data/belag.json") // 1024, "KB")

if __name__ == "__main__": main()

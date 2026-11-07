import json, sys, urllib.request, urllib.parse
# Bornheim, Frankfurt am Main (south,west,north,east)
BBOX = "50.1225,8.6990,50.1385,8.7260"
q = f"""
[out:json][timeout:120];
(
  way["building"]({BBOX});
  way["highway"]({BBOX});
  way["natural"="water"]({BBOX});
  way["waterway"]({BBOX});
  way["leisure"~"park|playground|pitch|garden"]({BBOX});
  way["landuse"~"grass|cemetery|allotments|forest|meadow|recreation_ground"]({BBOX});
  way["railway"~"rail|tram|subway|light_rail"]({BBOX});
  node["natural"="tree"]({BBOX});
  node["highway"="traffic_signals"]({BBOX});
  node["shop"]({BBOX});
  node["amenity"~"bank|cafe|restaurant|pharmacy|bar|pub|fast_food|bakery|kindergarten|school|post_office|doctors|dentist|ice_cream|bicycle_rental|atm"]({BBOX});
  node["highway"="bus_stop"]({BBOX});
  node["railway"~"tram_stop|station|halt"]({BBOX});
  node["amenity"~"bench|waste_basket|bicycle_parking|vending_machine|telephone|post_box|recycling|fountain"]({BBOX});
  node["highway"~"street_lamp|crossing"]({BBOX});
  way["barrier"~"fence|wall|hedge|retaining_wall"]({BBOX});
  way["natural"~"scrub|tree_row|wood"]({BBOX});
  way["shop"]({BBOX});
  way["amenity"~"bank|cafe|restaurant|pharmacy|school|kindergarten|place_of_worship|community_centre|bar|pub|fast_food"]({BBOX});
  way["highway"="crossing"]({BBOX});
);
out body;
>;
out skel qt;
"""
data = urllib.parse.urlencode({"data": q}).encode()
req = urllib.request.Request("https://overpass.private.coffee/api/interpreter", data=data,
                             headers={"User-Agent": "bornheim-game/0.1"})
with urllib.request.urlopen(req, timeout=180) as r:
    raw = r.read()
open("data/bornheim.osm.json", "wb").write(raw)
j = json.loads(raw)
print("elements:", len(j["elements"]))

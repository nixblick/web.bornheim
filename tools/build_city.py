"""OSM-JSON -> data/city.json (lokale Meter-Koordinaten, Ursprung = Bbox-Mitte)."""
import json, math, sys
lat0, lon0 = 50.129441, 8.7096938  # fester Ursprung (dem.json ist darauf bezogen)
R = 6371000.0
def xy(lat, lon):
    x = math.radians(lon-lon0)*R*math.cos(math.radians(lat0))
    z = -math.radians(lat-lat0)*R   # Norden = -z (three.js: Kamera schaut nach -z)
    return [round(x,2), round(z,2)]

def height(t):
    for k in ("height","building:height"):
        if k in t:
            try: return float(str(t[k]).replace("m","").strip())
            except: pass
    for k in ("building:levels","levels"):
        if k in t:
            try: return float(t[k])*3.2 + 1.0
            except: pass
    b = t.get("building","yes")
    if b in ("church","cathedral"): return 25
    if b in ("garage","garages","shed","hut","roof","carport","kiosk"): return 3
    if b in ("apartments","residential","commercial","office","retail","school","hospital","yes"): return 16
    return 10

ROADW = {"motorway":14,"trunk":12,"primary":11,"secondary":9,"tertiary":8,"residential":6.5,
         "unclassified":6,"living_street":5,"service":4,"pedestrian":5}
def convert(elements, nodes=None):
    """OSM-Elemente -> Spielobjekte. nodes: id -> (lat, lon), sonst aus elements."""
    if nodes is None: nodes = {e["id"]: (e["lat"], e["lon"]) for e in elements if e["type"] == "node"}
    ways = [e for e in elements if e["type"] == "way"]
    src = {"elements": elements}
    out = {"origin":[lat0,lon0],"buildings":[],"roads":[],"paths":[],"rails":[],"water":[],"green":[],
           "trees":[],"signals":[],"pois":[],"barriers":[],"stops":[],"furniture":[],"areas":[],"crossings":[]}
    for w in ways:
        t = w.get("tags",{}); pts=[xy(*nodes[n]) for n in w["nodes"] if n in nodes]
        if len(pts)<2: continue
        if "building" in t:
            if len(pts)>=4 and pts[0]==pts[-1]: pts=pts[:-1]
            if len(pts)<3: continue
            b={"p":pts,"h":round(height(t),1)}
            bt=t.get("building","yes")
            if bt in ("church","cathedral","chapel"): b["k"]="church"
            elif bt in ("school","kindergarten","university","college","hospital","office","public","civic","government") or t.get("amenity") in ("school","kindergarten","hospital"): b["k"]="public"
            elif bt in ("industrial","warehouse","retail","supermarket","commercial","service","sports_hall","sports_centre","hangar","transportation") or t.get("leisure") in ("sports_hall","sports_centre"): b["k"]="hall"
            elif bt in ("garage","garages","shed","hut","roof","carport","kiosk","allotment_house","greenhouse","cabin"): b["k"]="small"
            elif bt in ("house","detached","semidetached_house","terrace","bungalow","farm"): b["k"]="house"
            rs=t.get("roof:shape","")
            if rs in ("gabled","hipped","half-hipped","gambrel","mansard","round","skillion","pyramidal"): b["r"]="gabled" if rs in ("gabled","gambrel","round","skillion") else "hipped"
            elif rs=="" and b.get("k") in ("house",) : b["r"]="gabled"
            try: b["rh"]=round(float(t.get("roof:levels",1))*3.0,1) if b.get("r") else 0
            except: b["rh"]=3.0
            if t.get("roof:levels")=="0": b.pop("r",None); b["rh"]=0
            if "name" in t: b["n"]=t["name"]
            if "shop" in t or t.get("amenity") in ("bank","cafe","restaurant","pharmacy","bar","pub","fast_food","supermarket"): b["shop"]=t.get("shop",t.get("amenity"))
            out["buildings"].append(b)
        elif "highway" in t:
            hw=t["highway"]
            if hw in ROADW:
                if t.get("tunnel")=="yes" or t.get("tunnel")=="building_passage" and hw in ("motorway","motorway_link","trunk"): continue
                r={"p":pts,"w":ROADW[hw]}
                if t.get("bridge") and t.get("bridge")!="no": r["br"]=1
                if hw in ("motorway","motorway_link","trunk"): r["mw"]=1
                if "name" in t: r["n"]=t["name"]
                ow=t.get("oneway","no")
                if ow in ("yes","true","1"): r["o"]=1
                elif ow=="-1": r["o"]=-1
                try: r["l"]=int(t.get("lanes","2" if ROADW[hw]>=8 else "1"))
                except: r["l"]=2
                try: r["v"]=int(str(t.get("maxspeed","50")).split()[0])
                except: r["v"]=30 if hw in ("residential","living_street","service") else 50
                if hw=="living_street": r["v"]=10
                if t.get("highway") in ("pedestrian",): r["ped"]=1
                out["roads"].append(r)
            elif hw in ("footway","path","cycleway","steps","track"):
                out["paths"].append({"p":pts})
        elif "barrier" in t and t["barrier"] in ("fence","wall","hedge","retaining_wall","city_wall"):
            out["barriers"].append({"p":pts,"k":t["barrier"]})
            continue
        elif t.get("natural")=="tree_row":
            acc=0.0
            for i in range(len(pts)-1):
                ax,az=pts[i]; bx,bz=pts[i+1]; L=math.hypot(bx-ax,bz-az) or 1
                d=acc
                while d<L:
                    out["trees"].append([round(ax+(bx-ax)*d/L,2),round(az+(bz-az)*d/L,2)]); d+=8
                acc=d-L
            continue
        elif t.get("highway")=="crossing":
            out["crossings"].append({"p":pts}); continue
        elif "railway" in t:
            if t.get("tunnel") in ("yes","building_passage") or t.get("railway")=="subway" and t.get("level","0").startswith("-"): continue
            try:
                if int(t.get("layer","0"))<0: continue
            except: pass
            out["rails"].append({"p":pts,"k":t["railway"]})
        elif t.get("natural")=="water" or "waterway" in t:
            if pts[0]==pts[-1] and len(pts)>3: out["water"].append({"p":pts[:-1]})
        elif t.get("amenity") in ("school","kindergarten","community_centre","place_of_worship","hospital") and "building" not in t and pts[0]==pts[-1] and len(pts)>3:
            out["areas"].append({"p":pts[:-1],"k":t["amenity"],"n":t.get("name","")})
        elif t.get("natural") in ("scrub","wood") and pts[0]==pts[-1] and len(pts)>3:
            out["green"].append({"p":pts[:-1],"k":t["natural"]})
        elif "leisure" in t or "landuse" in t:
            if pts[0]==pts[-1] and len(pts)>3:
                g={"p":pts[:-1],"k":t.get("leisure",t.get("landuse"))}
                if "sport" in t: g["s"]=t["sport"].split(";")[0]
                out["green"].append(g)
        elif t.get("amenity")=="parking" and pts[0]==pts[-1] and len(pts)>3:
            out["green"].append({"p":pts[:-1],"k":"parking"})
    for e in src["elements"]:
        if e["type"]!="node": continue
        t=e.get("tags",{})
        if t.get("natural")=="tree": out["trees"].append(xy(e["lat"],e["lon"]))
        if t.get("highway")=="traffic_signals": out["signals"].append(xy(e["lat"],e["lon"]))
        x,z=xy(e["lat"],e["lon"])
        if ("shop" in t or t.get("amenity") in ("bank","cafe","restaurant","pharmacy","bar","pub","fast_food","post_office","doctors","dentist","ice_cream","atm","kindergarten","school")) and t.get("name"):
            out["pois"].append({"x":x,"z":z,"n":t["name"],"k":t.get("shop",t.get("amenity"))})
        if t.get("highway")=="bus_stop" or t.get("railway") in ("tram_stop","station","halt"):
            out["stops"].append({"x":x,"z":z,"n":t.get("name",""),"k":"bus" if t.get("highway")=="bus_stop" else "tram"})
        if t.get("amenity") in ("bench","waste_basket","bicycle_parking","vending_machine","post_box","recycling","fountain") or t.get("highway") in ("street_lamp",):
            out["furniture"].append({"x":x,"z":z,"k":t.get("amenity",t.get("highway"))})
        if t.get("highway")=="crossing" and t.get("crossing") in ("zebra","marked","traffic_signals","uncontrolled"):
            out["crossings"].append({"x":x,"z":z})
    return out

if __name__ == "__main__":
    src = json.load(open("data/bornheim.osm.json", encoding="utf-8"))
    out = convert(src["elements"])
    json.dump(out, open("data/city.json","w",encoding="utf-8"), separators=(",",":"), ensure_ascii=False)
    print({k:len(v) for k,v in out.items() if isinstance(v,list)}, "origin", out["origin"])

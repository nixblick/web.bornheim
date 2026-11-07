"""Three.js lokal mitliefern (MIT-Lizenz): laedt three.module.js und alle benoetigten Addons
samt ihrer relativen Abhaengigkeiten nach vendor/three/. Danach braucht das Spiel kein CDN mehr.
Aufruf: python tools/vendor_three.py"""
import os, re, urllib.request

VER = "0.170.0"
BASE = f"https://cdn.jsdelivr.net/npm/three@{VER}/"
OUT = "vendor/three"
ROOTS = ["build/three.module.js", "LICENSE"] + [f"examples/jsm/{p}" for p in [
    "utils/BufferGeometryUtils.js", "loaders/GLTFLoader.js", "utils/SkeletonUtils.js", "environments/RoomEnvironment.js",
    "postprocessing/EffectComposer.js", "postprocessing/RenderPass.js", "postprocessing/UnrealBloomPass.js",
    "postprocessing/OutputPass.js", "postprocessing/GTAOPass.js", "postprocessing/ShaderPass.js"]]

done = set(); todo = list(ROOTS)
while todo:
    rel = todo.pop()
    if rel in done: continue
    done.add(rel)
    data = urllib.request.urlopen(urllib.request.Request(BASE + rel, headers={"User-Agent": "web.bornheim-vendor"}), timeout=60).read()
    dst = os.path.join(OUT, rel); os.makedirs(os.path.dirname(dst), exist_ok=True); open(dst, "wb").write(data)
    if rel.endswith(".js") and rel.startswith("examples/"):
        for m in re.findall(r"""(?:import|export)[^'"]*?from\s*['"](\.[^'"]+)['"]""", data.decode("utf-8")):
            todo.append(os.path.normpath(os.path.join(os.path.dirname(rel), m)).replace("\\", "/"))
print(len(done), "Dateien nach", OUT)

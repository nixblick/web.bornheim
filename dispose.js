// Einheitlicher Abbau dynamischer 3D-Objekte (#120): Geometrien, Materialien (auch Arrays), alle Texturen eines
// Materials (map, emissiveMap, normalMap, roughnessMap, alphaMap …, gefunden über isTexture), InstancedMesh-Puffer und
// Knochen-Texturen. Mit preserveShared (Standard) bleibt alles mit userData.shared stehen, ebenso alle Texturen eines
// geteilten Materials. keep(x) = true schützt zusätzlich einzelne Geometrien, Materialien oder Texturen aus Caches.
export function disposeHierarchy(root, { preserveShared = true, keep = null } = {}) {
  if (!root) return;
  const held = x => !!x && ((preserveShared && x.userData && x.userData.shared) || (keep && keep(x)));
  const seen = new Set();
  const freeMat = m => {
    if (!m || seen.has(m) || held(m)) return; seen.add(m);
    for (const k in m) { const t = m[k]; if (t && t.isTexture && !seen.has(t) && !held(t)) { seen.add(t); t.dispose(); } }
    if (m.uniforms) for (const k in m.uniforms) { const t = m.uniforms[k] && m.uniforms[k].value; if (t && t.isTexture && !seen.has(t) && !held(t)) { seen.add(t); t.dispose(); } }
    m.dispose();
  };
  root.traverse(o => {
    if (o.geometry && !seen.has(o.geometry) && !held(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
    if (o.isInstancedMesh) o.dispose();
    if (o.isSkinnedMesh && o.skeleton && o.skeleton.boneTexture) o.skeleton.dispose();
    if (Array.isArray(o.material)) o.material.forEach(freeMat); else freeMat(o.material);
  });
}

// Autolack nach dem Vorbild Sunset (vehicle.js): Klarlack mit Glanz, spiegelnde Scheiben, Metallfelgen, Gummi matt,
// Scheinwerfer- und Rückleuchtengläser glänzend. Nur Material-Tausch an den Vorlagen (CAR_TPL) und den geparkten Instanzen:
// Maße, Kollision, Farben und Anzahl der Draw-Calls bleiben gleich. Niedrig/Sparstufe: unverändert Lambert.
// Mittel: MeshStandardMaterial (Umgebungslicht spiegelt). Hoch/Ultra: MeshPhysicalMaterial mit Clearcoat.

const PAINT = new Set(['Blue', 'LightBlue', 'White', 'Yellow', 'Main', 'Red', 'Green']);
// Werte aus Sunset (Lack roughness 0.46/clearcoat 1/clearcoatRoughness 0.045, Glas roughness 0.05 envMapIntensity 1.35), für Bornheims RoomEnvironment etwas gedämpft
const LOOK = {
  paint: { roughness: 0.42, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.06 },
  glass: { roughness: 0.06, metalness: 0.2, envMapIntensity: 1.35, clearcoat: 1, clearcoatRoughness: 0.03 },
  rim: { roughness: 0.3, metalness: 0.85 },
  rimDark: { roughness: 0.45, metalness: 0.6 },
  rubber: { roughness: 0.88, metalness: 0 },
  lens: { roughness: 0.12, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 },
  trim: { roughness: 0.6, metalness: 0.1 },
};
const kind = n => PAINT.has(n) ? 'paint' : /window|glass/i.test(n) ? 'glass' : n === 'Grey' || n === 'Rim' ? 'rim' : n === 'RimDark' ? 'rimDark' : n === 'Black' ? 'rubber' : /lights?$/i.test(n) ? 'lens' : 'trim';

/** Ein Material in Standard/Physical umbauen; Name, Farbe, Textur, Emissive, Transparenz bleiben.
 * @param {any} THREE @param {any} m @param {boolean} phys @param {string} [k] */
function upgrade(THREE, m, phys, k) {
  if (!m || m.isMeshBasicMaterial || m.isShaderMaterial) return m;
  const L = LOOK[k || kind(m.name)]; const P = phys ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const n = new P({ color: m.color, map: m.map || null, normalMap: m.normalMap || null, emissive: m.emissive || 0x000000, emissiveIntensity: m.emissiveIntensity ?? 1, emissiveMap: m.emissiveMap || null,
    transparent: m.transparent, opacity: m.opacity, side: m.side, vertexColors: m.vertexColors, roughness: L.roughness, metalness: L.metalness });
  if (L.envMapIntensity) n.envMapIntensity = L.envMapIntensity;
  if (phys && L.clearcoat) { n.clearcoat = L.clearcoat; n.clearcoatRoughness = L.clearcoatRoughness; }
  // Atlas-Modelle (citybits_texture): Lack und Rest teilen sich eine Textur, daher mittlerer Glanz statt Gummi
  if (m.map && !k) { n.roughness = 0.45; n.metalness = 0.15; if (phys) { n.clearcoat = 0.6; n.clearcoatRoughness = 0.1; } }
  n.name = m.name; n.userData = { ...m.userData };
  return n;
}

/** Alle Auto-Vorlagen veredeln (vor dem ersten makeCar/buildParked aufrufen).
 * @param {any} THREE @param {Record<string, any>} tpl CAR_TPL @param {string} quality @param {boolean} low LOW_GFX */
export function autolack(THREE, tpl, quality, low) {
  if (low || quality === 'niedrig') return null;
  const phys = quality === 'hoch' || quality === 'ultra'; const cache = new Map();
  for (const T of Object.values(tpl)) T.root.traverse(o => { if (!o.isMesh) return;
    const conv = m => { if (!cache.has(m)) cache.set(m, upgrade(THREE, m, phys)); return cache.get(m); };
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material); });
  for (const m of cache.values()) if (m) m.userData.shared = true;
  // Geparkte Instanzen: Lack (Instanzfarbe) und Rest (Vertexfarben oder Atlas)
  const body = upgrade(THREE, new THREE.MeshLambertMaterial({ color: 0xffffff }), phys, 'paint'); body.userData.shared = true;
  const rest = m => { const r = upgrade(THREE, m, phys, m.map ? undefined : 'trim'); if (!m.map) { r.roughness = 0.35; r.metalness = 0.3; } r.userData.shared = true; return r; };
  return { body, rest };
}

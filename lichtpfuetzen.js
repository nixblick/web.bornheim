// Licht-Pfützen unter Straßenlaternen (#152, Technik aus Sunset render.js „light-pool“): ein InstancedMesh je Kachel wie bisher,
// aber mit Shader statt Additiv-Kreis: physikalisch geformter Abfall (Kern + weiche Schulter), Farbe je Laterne (Natriumdampf warm,
// LED neutral, fest aus der Position gehasht, nichts ausgedacht an der Position), sanftes Einblenden in der Dämmerung (uNight),
// Ausblenden in der Ferne, bei Regen etwas heller (nasser Asphalt spiegelt). Positionen bleiben Bornheims Laternen. Billig: ein Draw-Call je Kachel.
/** @param {import('./types').Ctx} X */
export function initLichtpfuetzen(X) {
  const { THREE } = X;
  // Form wie Sunset jt(): (1-r)^2.2 als Kern, (1-r²)² als Schulter
  const N = 64, data = new Uint8Array(N * N * 4), c = (N - 1) / 2;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const r = Math.min(1, Math.hypot((x - c) / c, (y - c) / c)); const v = Math.min(1, (1 - r) ** 2.2 * 0.55 + (1 - r * r) ** 2 * 0.4); const i = (y * N + x) * 4; data[i] = data[i + 1] = data[i + 2] = Math.round(v * 255); data[i + 3] = 255; }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat); tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.needsUpdate = true;
  const uni = { uMap: { value: tex }, uNight: { value: 0 }, uWet: { value: 0 }, uMaxDistance: { value: 260 } };
  const material = new THREE.ShaderMaterial({
    name: 'LichtPfuetzen', uniforms: uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: `attribute vec4 aPool; uniform float uNight; uniform float uMaxDistance; varying vec2 vUv; varying vec3 vColor;
void main(){ vUv = uv; vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
  float on = smoothstep(aPool.a, aPool.a + 0.25, uNight); float fade = 1.0 - smoothstep(uMaxDistance * 0.7, uMaxDistance, -mv.z);
  vColor = aPool.rgb * on * fade; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D uMap; uniform float uWet; varying vec2 vUv; varying vec3 vColor;
void main(){ float s = texture2D(uMap, vUv).r; vec3 col = vColor * s * (1.0 + uWet * 0.6); if (max(col.r, max(col.g, col.b)) < 0.003) discard; gl_FragColor = vec4(col, 1.0); }`,
  });
  material.userData.shared = true;
  // je Laterne: Farbe und Einschaltschwelle aus der Position (stabil über Neuladen)
  const hash = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };
  const SODIUM = [1.0, 0.56, 0.22], LED = [1.0, 0.82, 0.6];
  /** spotM: InstancedMesh mit Kreisgeometrie, lamps: [[x,z],…] in derselben Reihenfolge */
  function attach(spotM, lamps) {
    const a = new Float32Array(lamps.length * 4);
    lamps.forEach(([x, z], i) => { const h = hash(x, z), led = h < 0.35, b = 0.32 + hash(z, x) * 0.1 /* Nachbesserung #152: Kern war fast weiß, jetzt wärmer und weniger überstrahlt */, col = led ? LED : SODIUM; a[i * 4] = col[0] * b; a[i * 4 + 1] = col[1] * b; a[i * 4 + 2] = col[2] * b; a[i * 4 + 3] = 0.45 + h * 0.3; });
    spotM.geometry = spotM.geometry.clone(); spotM.geometry.userData = {}; /* clone() übernimmt userData.shared der Vorlage, dann gäbe disposeHierarchy die Kopie nie frei */ spotM.geometry.setAttribute('aPool', new THREE.InstancedBufferAttribute(a, 4)); spotM.material = material; spotM.renderOrder = 1;
  }
  // day: 0 Nacht … 1 Tag; wet: 0…1
  function update(day, wet) { uni.uNight.value = Math.min(1, Math.max(0, (0.4 - day) / 0.3)); uni.uWet.value = wet || 0; }
  return { attach, update, material };
}

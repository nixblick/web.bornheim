// Nachbearbeitung nach dem Vorbild Sunset (#152): AgX-Tonemapping mit Look-Stufe (etwas mehr Kontrast und Sättigung
// als das flache AgX), weiche Vignette, FXAA am Ende, Bloom-Voreinstellung je Grafikstufe.
// Ersetzt ACES und OutputPass. Sparstufe und Mittel: nur renderer.toneMapping = AgX, kein Extra-Pass.
// Farben, Licht und Maßstab von Bornheim bleiben unangetastet; das hier ist nur die Kamera-Entwicklung.

const VS = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }';

// AgX (Blender/Filament, gleiche Mathematik wie THREE.AgXToneMapping) plus Look-Stufe, Vignette vor dem Tonemapping
const LOOK_FS = `
uniform sampler2D tDiffuse; uniform float exposure, contrast, saturation, vignette; varying vec2 vUv;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
const mat3 SRGB_TO_2020 = mat3(vec3(0.6274, 0.0691, 0.0164), vec3(0.3293, 0.9195, 0.0880), vec3(0.0433, 0.0113, 0.8956));
const mat3 R2020_TO_SRGB = mat3(vec3(1.6605, -0.1246, -0.0182), vec3(-0.5876, 1.1329, -0.1006), vec3(-0.0728, -0.0083, 1.1187));
const mat3 AGX_INSET = mat3(vec3(0.856627153315983, 0.137318972929847, 0.11189821299995), vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903), vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859));
const mat3 AGX_OUTSET = mat3(vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826), vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294), vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405));
vec3 agxCurve(vec3 x){ vec3 x2=x*x; vec3 x4=x2*x2; return 15.5*x4*x2 - 40.14*x4*x + 31.96*x4 - 6.868*x2*x + 0.4298*x2 + 0.1191*x - 0.00232; }
vec3 agx(vec3 c){
  c = AGX_INSET * (SRGB_TO_2020 * c); c = max(c, 1e-10);
  c = clamp((log2(c) + 12.47393) / 16.5, 0.0, 1.0); c = agxCurve(c);
  float l = dot(c, LUMA); c = pow(max(c, vec3(0.0)), vec3(contrast)); c = l + saturation * (c - l);
  c = pow(max(vec3(0.0), AGX_OUTSET * c), vec3(2.2));
  return clamp(R2020_TO_SRGB * c, 0.0, 1.0);
}
vec3 toSrgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(vec3(0.0031308), c)); }
void main(){
  vec4 t = texture2D(tDiffuse, vUv); vec3 c = t.rgb * exposure;
  vec2 q = (vUv - 0.5) * vec2(1.0, 0.82); c *= 1.0 - vignette * smoothstep(0.32, 0.86, length(q) * 1.18);
  gl_FragColor = vec4(toSrgb(agx(c)), t.a);
}`;

// FXAA (NVIDIA, Lite-Fassung) als letzter Schritt nach dem Farbgrading
const FXAA_FS = `
uniform sampler2D tDiffuse; uniform vec2 px; varying vec2 vUv;
void main(){
  vec3 L = vec3(0.299, 0.587, 0.114);
  vec4 m = texture2D(tDiffuse, vUv);
  float nw = dot(texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * px).rgb, L), ne = dot(texture2D(tDiffuse, vUv + vec2(1.0, -1.0) * px).rgb, L);
  float sw = dot(texture2D(tDiffuse, vUv + vec2(-1.0, 1.0) * px).rgb, L), se = dot(texture2D(tDiffuse, vUv + vec2(1.0, 1.0) * px).rgb, L);
  float lm = dot(m.rgb, L), lo = min(lm, min(min(nw, ne), min(sw, se))), hi = max(lm, max(max(nw, ne), max(sw, se)));
  if (hi - lo < max(0.0312, hi * 0.125)) { gl_FragColor = m; return; }
  vec2 dir = vec2(-((nw + ne) - (sw + se)), (nw + sw) - (ne + se));
  float red = max((nw + ne + sw + se) * 0.03125, 1.0 / 128.0);
  dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + red), -8.0, 8.0) * px;
  vec3 a = 0.5 * (texture2D(tDiffuse, vUv + dir * (1.0/3.0 - 0.5)).rgb + texture2D(tDiffuse, vUv + dir * (2.0/3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture2D(tDiffuse, vUv - dir * 0.5).rgb + texture2D(tDiffuse, vUv + dir * 0.5).rgb);
  float lb = dot(b, L);
  gl_FragColor = vec4((lb < lo || lb > hi) ? a : b, m.a);
}`;

// Look je Stufe: Hoch etwas zurückhaltender, Ultra mit mehr Bloom-Radius (Sunset-Presets, auf Bornheims Licht angepasst)
export const LOOK_PRESET = {
  hoch: { exposure: 1.18, contrast: 1.1, saturation: 1.12, vignette: 0.22, bloom: { strength: 0.28, radius: 0.35, threshold: 0.93 }, fxaa: true },
  ultra: { exposure: 1.18, contrast: 1.12, saturation: 1.14, vignette: 0.24, bloom: { strength: 0.34, radius: 0.5, threshold: 0.9 }, fxaa: true }
};
// Ohne Composer (Niedrig, Mittel): AgX direkt im Renderer, Belichtung leicht angehoben, weil AgX dunkler abbildet als ACES
export const LOOK_EXPOSURE_DIRECT = 1.15;

/** Tonemapping des Renderers setzen: AgX für alle Stufen. Mit Composer wirkt es nicht (Zwischenziel), dort übernimmt makeLookPass. */
export function applyLookTone(THREE, renderer) {
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = LOOK_EXPOSURE_DIRECT;
}

/** Pass für Tonemapping + Look + Vignette, ersetzt OutputPass. */
export function makeLookPass(ShaderPass, preset) {
  const p = new ShaderPass({ uniforms: { tDiffuse: { value: null }, exposure: { value: preset.exposure }, contrast: { value: preset.contrast }, saturation: { value: preset.saturation }, vignette: { value: preset.vignette } }, vertexShader: VS, fragmentShader: LOOK_FS });
  return p;
}

/** FXAA-Pass; die Pixelgröße folgt composer.setSize (bekommt Breite und Höhe schon mit Pixelverhältnis). */
export function makeFxaaPass(THREE, ShaderPass, w, h) {
  const p = new ShaderPass({ uniforms: { tDiffuse: { value: null }, px: { value: new THREE.Vector2(1 / Math.max(1, w), 1 / Math.max(1, h)) } }, vertexShader: VS, fragmentShader: FXAA_FS });
  p.setSize = (W, H) => { p.uniforms.px.value.set(1 / Math.max(1, W), 1 / Math.max(1, H)); };
  return p;
}

import { rauschen } from './himmel.js';
// Wasser des Mains und der Becken (#152, Sunset-Rest „Wasser mit Wellen und Spiegelung“). Bisher eine flache Farbfläche.
// Ab „Mittel“ bekommt das vorhandene Lambert-Material kleine, wandernde Wellen (zwei Zugriffe auf eine kachelbare
// Rauschtextur, die Werte gelten als Neigung), einen Anteil Himmelsfarbe, der zum flachen Blickwinkel hin zunimmt,
// und einen Sonnenglanz. Beleuchtung, Schatten, Nebel und Höhendunst bleiben die des eingebauten Materials
// (onBeforeCompile), die Geometrie und die Zahl der Draw-Calls bleiben gleich. Sparstufe und schwache GPU behalten
// die flache Farbe: dort liefert game.js weiter shLambert.

/** @param {any} THREE */
export function initWasser(THREE) {
  const N = 128, a = rauschen(N, 0x51ed270b), b = rauschen(N, 0x2545f491), px = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) { px[i * 4] = a[i]; px[i * 4 + 1] = b[i]; px[i * 4 + 2] = 0; px[i * 4 + 3] = 255; }
  const tex = new THREE.DataTexture(px, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.needsUpdate = true; tex.userData.shared = true;
  const U = { wTime: { value: 0 }, wNoise: { value: tex }, wSky: { value: new THREE.Color(0x8fb6e8) }, wSun: { value: new THREE.Color(0, 0, 0) }, wSunDirV: { value: new THREE.Vector3(0, 1, 0) } };
  const mat = new THREE.MeshLambertMaterial({ color: 0x4f7fa0 }); mat.userData.shared = true; // Cache für alle Kacheln: beim Entladen nicht freigeben
  mat.customProgramCacheKey = () => 'wasser1';
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'varying vec3 vWasserPos;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWasserPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    sh.fragmentShader = 'uniform float wTime; uniform sampler2D wNoise; uniform vec3 wSky; uniform vec3 wSun; uniform vec3 wSunDirV; varying vec3 vWasserPos;\n' + sh.fragmentShader
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
 { // Wellen: zwei wandernde Lagen, Rot/Grün der Textur als Neigung in x/z; in der Ferne flacher (weniger Flimmern)
  vec2 wuv = vWasserPos.xz * 0.045;
  vec2 wn = ( texture2D( wNoise, wuv + vec2( wTime * 0.011, wTime * 0.006 ) ).rg - 0.5 ) * 0.9 + ( texture2D( wNoise, wuv * 3.1 - vec2( wTime * 0.017, - wTime * 0.012 ) ).rg - 0.5 ) * 0.45;
  float wfern = 1.0 / ( 1.0 + length( vViewPosition ) * 0.012 );
  vec3 wWelt = normalize( vec3( - wn.x * wfern, 1.0, - wn.y * wfern ) );
  normal = normalize( ( viewMatrix * vec4( wWelt, 0.0 ) ).xyz );
 }`)
      .replace('#include <envmap_fragment>', `{ // Himmel im Wasser (nimmt zum flachen Blick hin zu) und Sonnenglanz
  vec3 wV = normalize( vViewPosition );
  float wFr = pow( 1.0 - max( dot( normal, wV ), 0.0 ), 3.0 );
  outgoingLight = mix( outgoingLight, wSky, 0.18 + 0.62 * wFr );
  outgoingLight += wSun * pow( max( dot( normal, normalize( wV + wSunDirV ) ), 0.0 ), 160.0 );
 }
 #include <envmap_fragment>`);
  };
  const _v = new THREE.Vector3();
  /**
   * @param {number} dt Sekunden
   * @param {{ sky: any, sunColor: any, sunDir: any, sunI: number, night: boolean, camera: any }} s sky = Himmelsfarbe oben, sunI = Lichtstärke der Sonne
   */
  function update(dt, s) {
    U.wTime.value = (U.wTime.value + dt) % 4000;
    U.wSky.value.copy(s.sky);
    _v.copy(s.sunDir).normalize(); const hoch = Math.max(0, Math.min(1, _v.y * 3));
    U.wSun.value.copy(s.sunColor).multiplyScalar(s.night ? 0.12 : Math.min(1.6, s.sunI) * 0.9 * hoch); // nachts trägt sun das Mondlicht: nur ein schwacher Schimmer
    U.wSunDirV.value.copy(_v).transformDirection(s.camera.matrixWorldInverse);
  }
  return { mat, update, uniforms: U };
}

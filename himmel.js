// Himmelskuppel mit Wolkendecke im Shader (#152, Technik nach Sunset: Bedeckungsgrad im Himmelsshader statt Einzelwolken).
// Ersetzt die 26 Wolken-Sprites (26 Draw-Calls, durchsichtig, große Füllfläche) durch eine Schicht in der Kuppel, die
// ohnehin gezeichnet wird: 0 zusätzliche Draw-Calls auf jeder Stufe. Die Wolken kommen aus einer einmal gerechneten,
// kachelbaren Rauschtextur (256², ein Kanal). Sparstufe und schwache GPU: ein Texturzugriff je Bildpunkt. Ab „Mittel“:
// zwei Zugriffe, dunklere Unterseite dicker Wolken und heller Rand zur Sonne. Ab „Hoch“ (HIMMEL_VOLUMEN): ein dritter
// Zugriff Richtung Sonne gibt den Wolken eine helle und eine dunkle Seite. Verlauf oben/unten (top/bot) wie bisher,
// Farben und Wetter setzt weiter game.js (applyTime, updateSky).
// Die Kuppel liegt auf der fernsten Tiefe und wird als letztes deckendes Objekt gezeichnet: der Shader läuft nur dort,
// wo wirklich Himmel zu sehen ist (Early-Z), nicht mehr unter Häusern und Boden.

/** Kachelbares Werterauschen, fünf Oktaven, fester Zufall (Bilder der Proben bleiben vergleichbar); auch von wasser.js genutzt. @param {number} N @param {number} [seed] */
export function rauschen(N, seed = 0x9e3779b9) {
  let s = seed; const rand = () => { s |= 0; s = s + 0x6d2b79f5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const f = new Float32Array(N * N); let amp = 1;
  for (const p of [4, 8, 16, 32, 64]) {
    const g = new Float32Array(p * p); for (let i = 0; i < g.length; i++) g[i] = rand();
    const k = p / N;
    for (let y = 0; y < N; y++) {
      const fy = y * k, y0 = Math.floor(fy), y1 = (y0 + 1) % p; let ty = fy - y0; ty = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < N; x++) {
        const fx = x * k, x0 = Math.floor(fx), x1 = (x0 + 1) % p; let tx = fx - x0; tx = tx * tx * (3 - 2 * tx);
        const a = g[y0 * p + x0], b = g[y0 * p + x1], c = g[y1 * p + x0], d = g[y1 * p + x1];
        f[y * N + x] += amp * (a + (b - a) * tx + (c + (d - c) * tx - a - (b - a) * tx) * ty);
      }
    }
    amp *= 0.5;
  }
  let lo = 1e9, hi = -1e9; for (let i = 0; i < f.length; i++) { if (f[i] < lo) lo = f[i]; if (f[i] > hi) hi = f[i]; }
  const out = new Uint8Array(N * N); for (let i = 0; i < f.length; i++) out[i] = Math.round(255 * (f[i] - lo) / (hi - lo));
  return out;
}

const VERT = 'varying vec3 vW; void main(){ vW = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }'; // z = w: fernste Tiefe
const FRAG = `uniform vec3 top; uniform vec3 bot; uniform sampler2D wolkenTex;
uniform vec4 wolken; // x Schwelle im Rauschen (klein = dichte Decke), y Deckkraft, z/w Windversatz (je 0..1)
uniform vec3 wolkenHell; uniform vec3 wolkenDunkel; uniform vec3 sonneRicht; uniform vec3 sonneGlanz; uniform float tagLicht;
varying vec3 vW;
void main(){
  vec3 d = normalize(vW);
  float h = clamp(d.y * 1.8 + 0.04, 0.0, 1.0);
  vec3 col = mix(bot, top, pow(h, 0.65));
  if (d.y > 0.01 && wolken.y > 0.0) {
    // Ebene in Wolkenhöhe; +0.12 krümmt die Schicht zum Horizont hin, sonst läuft sie dort ins Unendliche
    vec2 uv = d.xz / (d.y + 0.12) * 0.11;
    float n = texture2D(wolkenTex, uv + wolken.zw).r;
#ifdef HIMMEL_VOLUMEN
    float n0 = n;
#endif
#ifdef HIMMEL_FEIN
    n = n * 0.72 + texture2D(wolkenTex, uv * 3.0 + wolken.zw * 3.0).r * 0.28;
#endif
    float lo = wolken.x;
    float a = smoothstep(lo, lo + 0.2, n) * smoothstep(0.01, 0.17, d.y) * wolken.y;
    float dick = smoothstep(lo + 0.05, lo + 0.5, n);
    vec3 wc = mix(wolkenHell, wolkenDunkel, dick * 0.75);
#ifdef HIMMEL_FEIN
    float mu = max(dot(d, sonneRicht), 0.0); mu *= mu; mu *= mu;
    wc += sonneGlanz * (mu * mu * (1.0 - dick) * 0.9 + mu * 0.12);
#endif
#ifdef HIMMEL_VOLUMEN
    // Selbstschatten: Dichte ein Stück Richtung Sonne. Dichter dort = diese Stelle liegt im Schatten, dünner = Sonnenseite
    float nS = texture2D(wolkenTex, uv + wolken.zw + normalize(sonneRicht.xz + 1e-4) * 0.04).r;
    float schatten = smoothstep(0.0, 0.3, nS - n0) * tagLicht; // nachts trägt sonneRicht den Mond: kein Schatten
    wc = mix(wc, wolkenDunkel * 0.8, schatten * 0.6);
    wc += sonneGlanz * smoothstep(0.0, 0.3, n0 - nS) * (1.0 - dick * 0.5) * 0.35;
#endif
    col = mix(col, wc, a);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
#ifdef HIMMEL_DIREKT
  // ohne Composer geht das Bild direkt in 8 Bit: ein halber Schritt Rauschen (ohne sin) gegen Farbstufen im Verlauf
  gl_FragColor.rgb += (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) / 255.0;
#endif
}`;

/**
 * @param {any} THREE
 * @param {number} stufe 0 einfach, 1 fein (ab „Mittel“ ohne schwache GPU: zweite Oktave und Sonnenrand), 2 Volumen (ab „Hoch“: Selbstschatten)
 * @param {boolean} [direkt] Bild geht ohne Composer direkt in den Canvas (Niedrig, Mittel): Dithering im Himmelsshader
 */
export function makeHimmel(THREE, stufe, direkt) {
  const N = 256; const tex = new THREE.DataTexture(rauschen(N), N, N, THREE.RedFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.needsUpdate = true;
  const U = { top: { value: new THREE.Color(0x6a8fd0) }, bot: { value: new THREE.Color(0xb9cde6) }, wolkenTex: { value: tex },
    wolken: { value: new THREE.Vector4(0.25, 1, 0, 0) }, wolkenHell: { value: new THREE.Color(1, 1, 1) }, wolkenDunkel: { value: new THREE.Color(0.6, 0.62, 0.66) },
    sonneRicht: { value: new THREE.Vector3(0, 1, 0) }, sonneGlanz: { value: new THREE.Color(0, 0, 0) }, tagLicht: { value: 1 } };
  const mat = new THREE.ShaderMaterial({ uniforms: U, defines: {}, side: THREE.BackSide, depthWrite: false, depthFunc: THREE.LessEqualDepth, fog: false, vertexShader: VERT, fragmentShader: FRAG });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(850, 24, 12), mat); dome.renderOrder = 1000; /* muss das letzte deckende Objekt bleiben; Durchsichtiges (Sonne, Skyline, Regen) kommt ohnehin danach */ dome.frustumCulled = false; dome.userData.noChunk = true;
  let stand = '';
  /** Stufe zur Laufzeit umschalten (Qualitätswechsel): Defines neu setzen, Shader nur bei Änderung neu bauen. @param {number} st 0..2 @param {boolean} [dir] */
  function setStufe(st, dir) {
    const s = st >= 2 ? 2 : st >= 1 ? 1 : 0, key = s + (dir ? 'd' : ''); if (key === stand) return; stand = key;
    /** @type {Record<string, number>} */ const df = {}; if (s >= 1) df.HIMMEL_FEIN = 1; if (s >= 2) df.HIMMEL_VOLUMEN = 1; if (dir) df.HIMMEL_DIREKT = 1;
    mat.defines = df; mat.needsUpdate = true; dome.userData.himmel = s === 2 ? 'volumen' : s === 1 ? 'fein' : 'einfach';
  }
  setStufe(+stufe || 0, !!direkt);
  let wx = 0, wz = 0; const _c = new THREE.Color();
  /**
   * @param {number} dt Sekunden
   * @param {{ day: number, cloud: number, flash: number, night: boolean, sunColor: any, sunDir: any }} s day 0..1 Tageslicht, cloud 0..1 Bewölkung aus dem Wetter
   */
  function update(dt, s) {
    // Zug der Wolken: rund 2,5 m/s in 230 m Höhe wie die alten Sprites; je Achse auf 0..1 gefaltet (Oktave 2 nimmt das Dreifache, bleibt nahtlos)
    wx = (wx + dt * 0.0012) % 1; wz = (wz + dt * 0.0004) % 1;
    // Schwelle: klar rund 15 % Himmel bedeckt, bewölkt (0,7) rund 80 %, Regen und Gewitter (ab 0,9) geschlossene Decke ohne blaue Löcher
    const c = Math.max(0, Math.min(1, s.cloud)); const w = U.wolken.value; w.x = c < 0.7 ? 0.56 - 0.414 * c : 0.27 - (c - 0.7) * 1.57; w.y = (0.6 + 0.4 * s.day) * (0.55 + 0.45 * c); w.z = wx; w.w = wz;
    const hell = (0.14 + 0.86 * s.day) * (1 - c * 0.55) + s.flash * 1.5; // Regendecke deutlich dunkler
    // Wolkenfarbe: Weiß, zur Hälfte in der Lichtfarbe der Sonne (abends warm, nachts kühl)
    U.wolkenHell.value.setRGB(1, 1, 1).lerp(s.sunColor, 0.5 - 0.3 * c).multiplyScalar(hell);
    // Unterseite: dunkler, je dichter die Decke, leicht in Himmelsfarbe
    U.wolkenDunkel.value.copy(U.wolkenHell.value).multiplyScalar(0.8 - 0.32 * c).lerp(_c.copy(U.top.value), 0.18);
    U.sonneRicht.value.copy(s.sunDir).normalize();
    const tag = s.night ? 0 : Math.max(0, Math.min(1, U.sonneRicht.value.y * 4)); U.tagLicht.value = tag;
    const g = tag * (1 - c * 0.7) * 0.6; // nachts trägt sun das Mondlicht: kein Rand
    U.sonneGlanz.value.copy(s.sunColor).multiplyScalar(g);
  }
  return { dome, uniforms: U, update, setStufe };
}

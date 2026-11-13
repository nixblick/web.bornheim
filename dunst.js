// Höhendunst (#152, Technik aus Sunset render.js uHaze, für Bornheim angepasst): statt linearem Nebel wird die Dichte
// entlang des Blickstrahls nach Höhe integriert (exponentiell, Skalenhöhe ~90 m). Bodennahes verschwimmt wie bisher,
// Dächer und Türme bleiben klarer, zur Sonne hin leuchtet der Dunst in Sonnenfarbe. Farbe, near/far und Wetter kommen
// weiter aus scene.fog (game.js applyTime), die Dichte wird daraus abgeleitet: Fernsicht und Kachelrand bleiben gleich.
// Nur ab „Mittel“ ohne schwache GPU: installDunst() ersetzt die Fog-Chunks vor dem ersten Kompilieren. Sparstufe und
// schwache GPU behalten den linearen Nebel unverändert. Fernobjekte mit fog:false (wahrzeichen.js haze/FAR_HAZE) sind
// nicht betroffen. Auf „Niedrig“ zur Laufzeit: Dichte 0, der Shader nimmt dann den alten linearen Weg.

// Gemeinsame Uniform-Werte als einfache Objekte: cloneUniforms kopiert nur Vector/Color, einfache Objekte bleiben
// geteilte Referenzen; WebGLUniforms liest .x/.y/.z/.w. So erreicht ein Wert alle eingebauten Materialien.
const P = { x: 0, y: 1 / 90, z: 0, w: 0 }; // Dichte am Bezugsboden, 1/Skalenhöhe, Bodenhöhe, Nahgrenze
const SUN = { x: 0, y: 0, z: 0 }, SDIR = { x: 0, y: 1, z: 0 }, CAM = { x: 0, y: 0, z: 0 };
let installed = false;

/** Vor dem ersten Rendern aufrufen. @param {any} THREE @param {boolean} on */
export function installDunst(THREE, on) {
  if (!on || installed) return; installed = true;
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = '#ifdef USE_FOG\n varying float vFogDepth;\n varying vec3 vHazeOff;\n#endif';
  // Weltversatz Kamera→Punkt ohne modelMatrix (Instancing/Skinning stecken schon in mvPosition): Rotation der View-Matrix transponiert
  C.fog_vertex = '#ifdef USE_FOG\n vFogDepth = - mvPosition.z;\n vHazeOff = ( vec4( mvPosition.xyz, 0.0 ) * viewMatrix ).xyz;\n#endif';
  C.fog_pars_fragment = '#ifdef USE_FOG\n uniform vec3 fogColor;\n varying float vFogDepth;\n varying vec3 vHazeOff;\n uniform vec4 hazeP;\n uniform vec3 hazeSun;\n uniform vec3 hazeSunDir;\n uniform vec3 hazeCam;\n #ifdef FOG_EXP2\n  uniform float fogDensity;\n #else\n  uniform float fogNear;\n  uniform float fogFar;\n #endif\n#endif';
  C.fog_fragment = `#ifdef USE_FOG
 #ifdef FOG_EXP2
  float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
 #else
  float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  if ( hazeP.x > 0.0 ) {
   float hDist = length( vHazeOff );
   vec3 hDir = vHazeOff / max( hDist, 1e-3 );
   float k = hazeP.y;
   float camH = max( hazeCam.y - hazeP.z, 0.0 );
   float dy = hDir.y * hDist * k;
   float column = abs( dy ) > 1e-3 ? ( 1.0 - exp( - dy ) ) / dy : 1.0;
   float od = hazeP.x * exp( - camH * k ) * max( hDist - hazeP.w, 0.0 ) * column;
   float hf = 1.0 - exp( - od );
   // Kachelrand bleibt verdeckt: die letzten 12 % bis fogFar gehen wie bisher ganz in den Nebel
   hf = max( hf, smoothstep( fogFar * 0.88, fogFar, vFogDepth ) );
   float mu = max( dot( hDir, hazeSunDir ), 0.0 ); float mu2 = mu * mu;
   vec3 air = fogColor + hazeSun * ( mu2 * mu2 * 0.55 + pow( mu2, 16.0 ) * 1.1 );
   gl_FragColor.rgb = mix( gl_FragColor.rgb, air, hf );
  } else {
   gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
  }
 #endif
#endif`;
  const U = { hazeP: { value: P }, hazeSun: { value: SUN }, hazeSunDir: { value: SDIR }, hazeCam: { value: CAM } };
  Object.assign(THREE.UniformsLib.fog, U);
  for (const k in THREE.ShaderLib) { const u = THREE.ShaderLib[k].uniforms; if (u && 'fogNear' in u) Object.assign(u, U); }
}

/** @param {import('./types').Ctx} X */
export function initDunst(X) {
  const { scene, camera, opts, world, sun } = X;
  function update() {
    const f = scene.fog; if (!installed || !f || !f.isFog) return;
    if (opts.quality === 'niedrig' || opts.potato || opts.dunst === false) { P.x = 0; return; } // opts.dunst=false: Vergleich in der Probe
    const cp = camera.position; CAM.x = cp.x; CAM.y = cp.y; CAM.z = cp.z;
    const pp = X.player && X.player.pos; P.z = pp && X.TH ? X.TH(pp.x, pp.z) : 0; // Bezugsboden unter dem Spieler (Gelände in Metern)
    // Optische Tiefe ~2,6 am Boden bis fogFar (93 % Dunst) – wie der lineare Nebel; Wetter und Sichtweite stecken in near/far
    P.w = Math.max(0, f.near * 0.6); P.x = 2.6 / Math.max(60, f.far - P.w);
    const sd = world.sunDir; if (sd) { const l = Math.hypot(sd.x, sd.y, sd.z) || 1; SDIR.x = sd.x / l; SDIR.y = sd.y / l; SDIR.z = sd.z / l; }
    // Sonnenglanz im Dunst: Lichtfarbe der Sonne, nur über dem Horizont, gedämpft
    const day = world.hour > 6.5 && world.hour < 19.8 && !world.night; // nachts trägt sun das Mondlicht: kein Glanz
    const up = day ? Math.max(0, Math.min(1, SDIR.y * 4)) : 0; const s = Math.min(1.2, sun.intensity) * 0.25 * up;
    SUN.x = sun.color.r * s; SUN.y = sun.color.g * s; SUN.z = sun.color.b * s;
  }
  return { update };
}

// Wetter und Regen-Partikel (#118, aus game.js ausgelagert, Verhalten unverändert): Wetterzustand mit weichen
// Übergängen (Regen, Wolken, Nebel), automatischer Wetterwechsel, Regenstriche um die Kamera (GPU-Vertex-Shader),
// Nässe und Gewitter (Blitz, Donner). Straßenglanz, Lichtstreifen, Farbkorrektur und Regenton bleiben in game.js
// (updateWeather), weil sie an dortigen Materialien und am Audio hängen.

export const weather = { kind: 'clear', rain: 0, cloud: 0, fog: 0, next: 180, thunderT: 8, flash: 0 };
export const WEATHER = { clear: [0, 0, 0], cloudy: [0, 0.7, 0.1], rain: [0.7, 0.9, 0.3], storm: [1, 1, 0.4], fog: [0, 0.5, 1] };

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** @param {{ THREE: any, scene: any, camera: any, opts: any, pocket: any, sfx: (kind: string, vol?: number) => void }} X */
export function initWetter(X) {
  const { THREE, scene, camera } = X;
  const rainU = { value: 0 };
  const n = 5000; const pos = new Float32Array(n * 6), y0 = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { const x = rnd(-30, 30), y = rnd(0, 30), z = rnd(-30, 30); pos.set([x, 0, z, x + 0.03, 0.55, z + 0.02], i * 6); y0[i * 2] = y0[i * 2 + 1] = y; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aY0', new THREE.BufferAttribute(y0, 1));
  const m = new THREE.LineBasicMaterial({ color: 0xc8d6ea, transparent: true, opacity: 0.5, depthWrite: false });
  m.onBeforeCompile = sh => { sh.uniforms.uRainY = rainU; sh.vertexShader = 'attribute float aY0; uniform float uRainY;\n' + sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = vec3(position.x, mod(aY0 - uRainY, 30.0) + position.y, position.z);'); };
  const rainPts = new THREE.LineSegments(g, m); rainPts.visible = false; rainPts.frustumCulled = false; scene.add(rainPts);

  /** Übergänge, Wetterwechsel, Regen um die Kamera, Nässe. @param {number} dt */
  function step(dt) {
    const opts = X.opts;
    const [tr, tc, tf] = WEATHER[weather.kind] || WEATHER.clear; const k = Math.min(1, dt * 0.15);
    weather.rain += (tr - weather.rain) * k; weather.cloud += (tc - weather.cloud) * k; weather.fog += (tf - weather.fog) * k;
    if (opts.weather === 'auto') { weather.next -= dt; if (weather.next <= 0) { weather.kind = pick(['clear', 'clear', 'cloudy', 'rain', 'fog', 'storm', 'clear']); weather.next = rnd(150, 400); } }
    else if (opts.weather && WEATHER[opts.weather]) weather.kind = opts.weather;
    // Regen um die Kamera (GPU-Vertex-Shader animiert die Fallbewegung ohne Buffer-Upload pro Frame)
    rainPts.visible = weather.rain > 0.05 && !X.pocket; rainPts.material.opacity = 0.45 * weather.rain; if (rainPts.visible) { rainU.value = (rainU.value + 26 * dt) % 30; rainPts.position.set(camera.position.x, camera.position.y - 15, camera.position.z); }
    weather.wet = (weather.wet || 0) + ((weather.rain > 0.1 ? 1 : 0) - (weather.wet || 0)) * dt * (weather.rain > 0.1 ? 0.05 : 0.008);
  }
  /** Gewitter: Blitz und verzögerter Donner. @param {number} dt */
  function storm(dt) {
    if (weather.kind === 'storm' && weather.rain > 0.5) { weather.thunderT -= dt; if (weather.thunderT <= 0) { weather.thunderT = rnd(6, 25); weather.flash = 0.25; const dist = rnd(0.2, 2.5); setTimeout(() => X.sfx('thunder', clamp(1.2 - dist * 0.4, 0.3, 1)), dist * 1000); } }
    weather.flash = Math.max(0, weather.flash - dt);
  }
  return { rainPts, step, storm };
}

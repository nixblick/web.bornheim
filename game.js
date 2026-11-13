import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { initWeapons } from './weapons.js';
import { initDemo } from './demo.js';
import { initStory } from './story.js';
import { initShops } from './shops.js';
import { initInteriors } from './interiors.js';
import { initProgress } from './progress.js';
import { initFire } from './fire.js';
import { initHeli } from './heli.js';
import { initEulen } from './eulen.js'; import { initZivilcourage } from './zivilcourage.js';
import { initStrassen, asphaltRisse } from './strassen.js';
import { applyLookTone, makeLookPass, makeFxaaPass, LOOK_PRESET } from './look.js';
import { initLichtpfuetzen } from './lichtpfuetzen.js';
import { autolack } from './autolack.js';
import { initVokabaum } from './vokabaum.js';
import { initLaufrunden } from './laufrunden.js';
import { installDunst, initDunst } from './dunst.js';
import { initRasen, rasenMat, RASEN_KINDS } from './rasen.js';
import { initLandmarks } from './landmarks.js';
import { initGraeber } from './graeber.js';
import { initWahrzeichen, markLandmark } from './wahrzeichen.js';
import { disposeHierarchy } from './dispose.js';
import { initPhone } from './phone.js';
import { initMenuNeu } from './menu-neu.js';
import { initDebugOverlay } from './debugoverlay.js';
const GradeShader = { uniforms: { tDiffuse: { value: null }, vig: { value: 0.32 }, wet: { value: 0 }, night: { value: 0 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: 'uniform sampler2D tDiffuse; uniform float vig, wet, night; varying vec2 vUv; void main(){ vec4 c=texture2D(tDiffuse,vUv); vec3 col=c.rgb; float l=dot(col,vec3(0.299,0.587,0.114)); col=mix(vec3(l),col,1.12-wet*0.25); col=(col-0.5)*1.06+0.5; col*=mix(vec3(1.0),vec3(0.92,0.97,1.06),wet*0.7+night*0.5); col=mix(col,col*vec3(1.04,1.0,0.94),0.6*(1.0-night)); vec2 d=vUv-0.5; col*=1.0-vig*dot(d,d)*2.2; gl_FragColor=vec4(clamp(col,0.0,1.0),c.a); }' };
let aoPass = null, gradePass = null;

// ---------- Grundgerüst ----------
// Schwache (integrierte/mobile) GPU vorab erkennen: Antialiasing lässt sich nach dem Anlegen nicht mehr abschalten
const WEAK_GPU = (() => { try { const g = String(localStorage.getItem('notgta.gpu') || '').toLowerCase(); return /intel.*(uhd|hd graphics|iris)|mali|adreno|powervr|videocore/.test(g) && !/\barc\b/.test(g); } catch (e) { return false; } })();
const CAR_VIS = WEAK_GPU ? 120 : 180, PED_VIS = WEAK_GPU ? 75 : 100; // Sichtgrenzen für fahrende Autos und Fußgänger
let renderer;
try { renderer = new THREE.WebGLRenderer({ antialias: !WEAK_GPU, powerPreference: 'high-performance' }); }
catch (e1) { try { renderer = new THREE.WebGLRenderer({ antialias: false }); } catch (e2) { if (window.__fail) window.__fail('WebGL konnte nicht gestartet werden', 'Der Grafik-Kontext im aktuellen Browser-Tab ist blockiert. Bitte schließe diesen Tab und öffne die Seite in einem neuen Tab (oder starte den Browser kurz neu).', String(e2 && e2.message || e2)); throw e2; } }
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
applyLookTone(THREE, renderer); // AgX statt ACES (#152, look.js)
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x3a3550);
scene.fog = new THREE.Fog(0x3a3550, 180, 700);
const camera = new THREE.PerspectiveCamera(65, (innerWidth > 0 && innerHeight > 0) ? innerWidth / innerHeight : 16 / 9, 0.3, 900);

const hemi = new THREE.HemisphereLight(0x8a90c8, 0x4a4038, 1.1); scene.add(hemi);
const world = { hour: 8, speed: 0.25 / 60, headlights: true }; /* Start 8 Uhr, 1 Spielstunde = 4 Minuten (12.11.2026, André) */
let skyU = null, skyDome = null, sunDisk = null, skylineMesh = null, skylineBeacons = null; const clouds = [];
const weather = { kind: 'clear', rain: 0, cloud: 0, fog: 0, next: 180, thunderT: 8, flash: 0 };
const WEATHER = { clear: [0, 0, 0], cloudy: [0, 0.7, 0.1], rain: [0.7, 0.9, 0.3], storm: [1, 1, 0.4], fog: [0, 0.5, 1] };
let rainPts = null, roadMatRef = null; const lampSpots = []; let streaks = null, streakT = 0;
function updateStreaks(dt) {
  const night = (world.hour < 6.5 || world.hour > 19.8) ? 1 : 0; const k = opts.quality === 'niedrig' ? 0 : (weather.wet || 0) * night;
  if (!streaks) { const tex = canvasTex(32, 128, (ctx, w, h) => { const gx = ctx.createLinearGradient(0, 0, w, 0); gx.addColorStop(0, 'rgba(0,0,0,0)'); gx.addColorStop(0.5, 'rgba(255,255,255,1)'); gx.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gx; ctx.fillRect(0, 0, w, h); ctx.globalCompositeOperation = 'destination-in'; const gy = ctx.createLinearGradient(0, 0, 0, h); gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(0.25, 'rgba(0,0,0,1)'); gy.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gy; ctx.fillRect(0, 0, w, h); });
    const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); g.translate(0, 0, 0.5);
    streaks = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ map: tex, color: 0xffd090, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }), 60); streaks.frustumCulled = false; streaks.count = 0; scene.add(streaks); }
  streaks.visible = k > 0.05; if (streaks.userData.car) streaks.userData.car.visible = streaks.visible; if (!streaks.visible) return; streaks.material.opacity = 1.6 * k;
  streakT -= dt; if (streakT > 0 && streaks.count) return; streakT = 0.05;
  const cx = camera.position.x, cz = camera.position.z; const near = []; for (const l of lampSpots) { const d = (l[0] - cx) ** 2 + (l[1] - cz) ** 2; if (d < 120 * 120 && d > 4) near.push([d, l]); }
  near.sort((a, b) => a[0] - b[0]); const o = new THREE.Object3D(); let n = 0;
  for (const [d, [x, z]] of near.slice(0, 60)) { const dist = Math.sqrt(d); o.position.set(x, TH(x, z) + 0.07, z); o.rotation.set(0, Math.atan2(cx - x, cz - z), 0); const L = Math.min(dist * 0.85, 4 + dist * 0.35); o.scale.set(1.3 + dist * 0.015, 1, L); o.updateMatrix(); streaks.setMatrixAt(n++, o.matrix); }
  streaks.count = n; streaks.instanceMatrix.needsUpdate = true;
  // Scheinwerfer (weiß) und Rücklichter (rot) der Autos in der Nähe
  if (!streaks.userData.car) { const m = new THREE.InstancedMesh(streaks.geometry, streaks.material.clone(), 80); m.material.color.setHex(0xffffff); m.frustumCulled = false; m.count = 0; m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(80 * 3), 3); scene.add(m); streaks.userData.car = m; }
  const cm = streaks.userData.car; cm.material.opacity = 1.3 * k; let m2 = 0; const col = new THREE.Color();
  const near2 = cars.filter(c => c.visible !== false && (c.position.x - cx) ** 2 + (c.position.z - cz) ** 2 < 90 * 90 && c.userData.mode !== 'parked' && c.userData.mode !== 'wreck').slice(0, 20);
  for (const c of near2) { const u = c.userData, fx = Math.sin(u.heading), fz = Math.cos(u.heading), L = (u.dims ? u.dims.l : 4.2) / 2;
    for (const [end, cc] of [[1, 0xfff4dd], [-1, 0xff2010]]) { const ex = c.position.x + fx * L * end, ez = c.position.z + fz * L * end; const dist = Math.hypot(ex - cx, ez - cz); if (dist < 3) continue;
      // nur sichtbar, wenn die Lampe zur Kamera zeigt
      if (((cx - ex) * fx + (cz - ez) * fz) * end < 0) continue;
      for (const sd of [-0.65, 0.65]) { if (m2 >= 80) break; const x = ex + fz * sd, z = ez - fx * sd; o.position.set(x, surfAt(x, z, c.position.y) + 0.08, z); o.rotation.set(0, Math.atan2(cx - x, cz - z), 0); o.scale.set(0.45 + dist * 0.008, 1, Math.min(dist * 0.8, 2 + dist * 0.3) * (end > 0 ? 1 : 0.6)); o.updateMatrix(); cm.setMatrixAt(m2, o.matrix); cm.setColorAt(m2, col.setHex(cc)); m2++; } } }
  cm.count = m2; cm.instanceMatrix.needsUpdate = true; if (cm.instanceColor) cm.instanceColor.needsUpdate = true; }
const rainU = { value: 0 };
function makeRain() {
  const n = 5000; const pos = new Float32Array(n * 6), y0 = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { const x = rnd(-30, 30), y = rnd(0, 30), z = rnd(-30, 30); pos.set([x, 0, z, x + 0.03, 0.55, z + 0.02], i * 6); y0[i * 2] = y0[i * 2 + 1] = y; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aY0', new THREE.BufferAttribute(y0, 1));
  const m = new THREE.LineBasicMaterial({ color: 0xc8d6ea, transparent: true, opacity: 0.5, depthWrite: false });
  m.onBeforeCompile = sh => { sh.uniforms.uRainY = rainU; sh.vertexShader = 'attribute float aY0; uniform float uRainY;\n' + sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = vec3(position.x, mod(aY0 - uRainY, 30.0) + position.y, position.z);'); };
  rainPts = new THREE.LineSegments(g, m); rainPts.visible = false; rainPts.frustumCulled = false; scene.add(rainPts);
}
function updateWeather(dt) {
  const [tr, tc, tf] = WEATHER[weather.kind] || WEATHER.clear; const k = Math.min(1, dt * 0.15);
  weather.rain += (tr - weather.rain) * k; weather.cloud += (tc - weather.cloud) * k; weather.fog += (tf - weather.fog) * k;
  if (opts.weather === 'auto') { weather.next -= dt; if (weather.next <= 0) { weather.kind = pick(['clear', 'clear', 'cloudy', 'rain', 'fog', 'storm', 'clear']); weather.next = rnd(150, 400); } }
  else if (opts.weather && WEATHER[opts.weather]) weather.kind = opts.weather;
  // Regen um die Kamera (GPU-Vertex-Shader animiert die Fallbewegung ohne Buffer-Upload pro Frame)
  if (rainPts) { rainPts.visible = weather.rain > 0.05 && !POCKET; rainPts.material.opacity = 0.45 * weather.rain; if (rainPts.visible) { rainU.value = (rainU.value + 26 * dt) % 30; rainPts.position.set(camera.position.x, camera.position.y - 15, camera.position.z); } }
  weather.wet = (weather.wet || 0) + ((weather.rain > 0.1 ? 1 : 0) - (weather.wet || 0)) * dt * (weather.rain > 0.1 ? 0.05 : 0.008);
  STR.update(dt);
  if (roadMatRef) { const w = weather.wet; roadMatRef.color.setScalar(0.6 - w * 0.25); if (roadMatRef.isMeshStandardMaterial) { roadMatRef.color.setScalar(0.4 - w * 0.15); /* PBR-Asphalt plus Umgebungslicht wirkte bei 0,6 ausgewaschen hellgrau (seit Mittel Standard ist) */ roadMatRef.roughness = 0.95 - w * 0.75; const pm = w > 0.12 ? roadMatRef.userData.pud : null; if (roadMatRef.roughnessMap !== pm) { roadMatRef.roughnessMap = pm; roadMatRef.needsUpdate = true; } roadMatRef.envMapIntensity = 0.2 + w * 2.4; } }
  updateStreaks(dt);
  if (gradePass) { gradePass.uniforms.wet.value = weather.wet || 0; gradePass.uniforms.night.value = (world.hour < 6.5 || world.hour > 20) ? 1 : 0; }
  // Gewitter
  if (weather.kind === 'storm' && weather.rain > 0.5) { weather.thunderT -= dt; if (weather.thunderT <= 0) { weather.thunderT = rnd(6, 25); weather.flash = 0.25; const dist = rnd(0.2, 2.5); setTimeout(() => sfx('thunder', clamp(1.2 - dist * 0.4, 0.3, 1)), dist * 1000); } }
  weather.flash = Math.max(0, weather.flash - dt);
  if (SND.rain) SND.rain.gain.setTargetAtTime(weather.rain * 0.22 * (player.car ? 0.4 : 1), SND.ctx.currentTime, 0.5);
} // Spielstunden je Realsekunde
const _cSky = new THREE.Color(), _cFog = new THREE.Color(), _cTmp1 = new THREE.Color(), _cTmp2 = new THREE.Color();
const lerpC = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);
const lerpC2 = (out, a, b, t) => out.setHex(a).lerp(_cTmp1.setHex(b), t);
function applyTime() {
  const h = world.hour; // 0..24
  // Tageslicht 0..1: Nacht bis 5, Dämmerung 5-7, Tag 7-18, Abend 18-21, Nacht
  const day = h < 5 ? 0 : h < 7 ? (h - 5) / 2 : h < 18 ? 1 : h < 21 ? 1 - (h - 18) / 3 : 0;
  const dusk = (h > 17 && h < 21.5) ? 1 - Math.abs(h - 19.5) / 2 : (h > 4.5 && h < 8) ? 1 - Math.abs(h - 6.2) / 1.7 : 0;
  const dk = Math.max(0, dusk);
  lerpC2(_cSky, 0x141830, 0x3a3550, dk).lerp(_cTmp1.setHex(0x8fb6e8), day);
  lerpC2(_cFog, 0x141830, 0x3a3550, dk).lerp(_cTmp1.setHex(0xb9cde6), day);
  const grey = weather.cloud * 0.45; _cSky.lerp(_cTmp1.setHex(0x6b7078), grey * day).multiplyScalar(1 - weather.cloud * 0.25 * day); _cFog.lerp(_cTmp1.setHex(0x7a808a), grey * day);
  if (weather.flash > 0) { _cSky.addScalar(weather.flash * 2); }
  if (skyU) { skyU.top.value.copy(_cSky).multiplyScalar(0.78); skyU.bot.value.copy(_cFog); }
  scene.environmentIntensity = 0.15 + day * 0.65;
  scene.background.copy(_cSky); scene.fog.color.copy(_cFog); const VW = (typeof opts !== 'undefined' && opts.view) || 700; scene.fog.near = Math.min(180, VW * 0.25) - weather.fog * 150 - weather.rain * 60; scene.fog.far = Math.max(120, VW - weather.fog * (VW - 140) - weather.rain * VW * 0.35);
  lerpC2(hemi.color, 0x646c8a, 0xdde8ff, day) /* Nacht weniger blau (#152 Nachbesserung) */; lerpC2(hemi.groundColor, 0x3a3028, 0x8a8070, day); hemi.intensity = (1.0 + day * 0.35 + dusk * 0.25) * (1 - weather.cloud * 0.25) + weather.flash * 3;
  if (day < 0.15 && dusk < 0.3) sun.color.setHex(0x9ea8c4); else lerpC2(sun.color, 0xffa860, 0xfff2dd, Math.max(0, day - dusk * 0.6));
  sun.intensity = (0.45 * (1 - day) * (1 - dusk) + day * 2.0 + dusk * 0.6) * (1 - weather.cloud * 0.7) + weather.flash * 6;
  const ang = ((h - 6) / 12) * Math.PI; // 6 Uhr Osten, 18 Uhr Westen
  if (!world.sunDir) world.sunDir = new THREE.Vector3();
  world.sunDir.set(Math.cos(ang) * 120, Math.max(8, Math.sin(ang) * 160), 60);
  world.night = day < 0.35; world.day = day;
  if (typeof PFUETZEN !== 'undefined' && PFUETZEN) PFUETZEN.update(day, weather.rain); // Licht-Pfützen blenden in der Dämmerung ein (#152)
}
const sun = new THREE.DirectionalLight(0xffa860, 1.6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
const sc = sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 500;
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04; // normalBias gegen Streifen und Treppen auf flachen Flächen (Fahrbahn, Gehweg)
scene.add(sun, sun.target);

let composer = null, bloomPass = null;
// Seitenverhältnis nie NaN (Fenster mit Höhe 0, etwa ein Hintergrund-Tab): sonst wird die Projektionsmatrix ungültig und jeder Strahl (Schüsse, Kamera) NaN
const aspectNow = () => (innerWidth > 0 && innerHeight > 0) ? innerWidth / innerHeight : 16 / 9;
addEventListener('resize', () => { camera.aspect = aspectNow(); camera.updateProjectionMatrix(); if (innerWidth > 0 && innerHeight > 0) { renderer.setSize(innerWidth, innerHeight); if (composer) composer.setSize(innerWidth, innerHeight); } });
// Umgebungslicht (PMREM) wird erst nach dem Lesen der Qualitätsstufe gesetzt: bei „Niedrig“ und schwacher GPU entfällt es (LOW_GFX)
function applyQuality() {
  const q = opts.quality || 'mittel';
  const ultra = q === 'ultra', post = q === 'hoch' || ultra;
  renderer.setPixelRatio((q === 'niedrig' ? 0.75 : ultra ? Math.min(1.5, Math.max(1, devicePixelRatio || 1)) : 1) * (opts.scale || 1)); renderer.setSize(innerWidth, innerHeight);
  const sm = ultra ? 4096 : q === 'hoch' ? 2048 : 1024; sun.shadow.mapSize.set(sm, sm); { const e = ultra ? 95 : q === 'mittel' ? 50 : 70; /* Mittel: 1024er Karte auf 100 m statt 140 m, ~10 statt 14 cm je Texel: weniger Treppen an Bordsteinkanten */ sc.left = -e; sc.right = e; sc.top = e; sc.bottom = -e; sc.updateProjectionMatrix(); } sun.shadow.radius = ultra ? 2 : 1;
  WIN_U.value = q === 'niedrig' ? 0 : 1; if (typeof applyTreeQuality === 'function') applyTreeQuality(); if (typeof rebuildAllTiles === 'function') rebuildAllTiles();
  { const an = ANISO = ultra ? renderer.capabilities.getMaxAnisotropy() : q === 'niedrig' ? 2 : 4;
    if (typeof syncAnisoAll === 'function') syncAnisoAll(an);
    scene.traverse(o => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) for (const key of ['map', 'normalMap', 'roughnessMap', 'emissiveMap']) { const t = m[key]; if (t && t.anisotropy !== an) { t.anisotropy = an; t.needsUpdate = true; } } }); } if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  if (post) { const key = q + (opts.ao ? 'a' : '') + innerWidth + 'x' + innerHeight; if (!composer || composer.userData !== key) { if (composer) composer.dispose(); const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 2 }); composer = new EffectComposer(renderer, rt); composer.userData = key; composer.addPass(new RenderPass(scene, camera)); aoPass = null; if (opts.ao) {
    const aoScale = ultra ? 0.75 : 0.6;
    aoPass = new GTAOPass(scene, camera, Math.max(1, Math.round(innerWidth * aoScale)), Math.max(1, Math.round(innerHeight * aoScale)));
    const origSetSize = aoPass.setSize.bind(aoPass); aoPass.setSize = (w, h) => origSetSize(Math.max(1, Math.round(w * aoScale)), Math.max(1, Math.round(h * aoScale)));
    aoPass.overrideVisibility = () => {}; aoPass.restoreVisibility = () => {};
    aoPass.output = GTAOPass.OUTPUT.Default; aoPass.blendIntensity = 0.85;
    aoPass.updateGtaoMaterial({ radius: 1.2, distanceExponent: 1.5, thickness: 2, scale: 1.2, samples: ultra ? 14 : 8 });
    aoPass.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: ultra ? 6 : 5, rings: 2, samples: ultra ? 10 : 8 });
    const r0 = aoPass.render.bind(aoPass), _aoHid = [];
    aoPass.render = (...args) => {
      _aoHid.length = 0; const hide = o => { if (o && o.visible) { o.visible = false; _aoHid.push(o); } };
      hide(skyDome); hide(sunDisk); hide(skylineMesh); hide(skylineBeacons); hide(rainPts); hide(farPlane); hide(streaks); if (streaks) hide(streaks.userData.car); if (skids.mesh) hide(skids.mesh); if (typeof FX !== 'undefined') hide(FX.mesh);
      for (let i = 0; i < clouds.length; i++) hide(clouds[i]);
      for (let i = 0; i < leafMeshes.length; i++) hide(leafMeshes[i]);
      for (let i = 0; i < nightOnly.length; i++) hide(nightOnly[i]);
      const cx = camera.position.x, cz = camera.position.z;
      for (const [, t] of TILES) if (t.built && t.grp && t.grp.visible) { const dx = (t.tx + 0.5) * TS - cx, dz = (t.tz + 0.5) * TS - cz; if (dx * dx + dz * dz > 420 * 420) hide(t.grp); }
      r0(...args);
      for (let i = 0; i < _aoHid.length; i++) _aoHid[i].visible = true;
    }; composer.addPass(aoPass); } const LP = LOOK_PRESET[ultra ? 'ultra' : 'hoch']; bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), LP.bloom.strength, LP.bloom.radius, LP.bloom.threshold); composer.addPass(bloomPass); composer.addPass(makeLookPass(ShaderPass, LP)); gradePass = new ShaderPass(GradeShader); gradePass.uniforms.vig.value = 0; composer.addPass(gradePass); if (LP.fxaa) composer.addPass(makeFxaaPass(THREE, ShaderPass, innerWidth, innerHeight)); } composer.setSize(innerWidth, innerHeight); bloomPass.strength = LOOK_PRESET[ultra ? 'ultra' : 'hoch'].bloom.strength * (opts.bloom ?? 1); }
  else composer = null;
}

// ---------- Hilfen ----------
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerpAngle = (a, b, t) => { let d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return a + d * t; };
function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function distSegSq(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  let t = l2 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0; t = clamp(t, 0, 1);
  const qx = ax + t * dx, qz = az + t * dz; return (px - qx) ** 2 + (pz - qz) ** 2;
}

// ---------- Stadt ----------
const WIDX = await (await fetch('data/tiles/index.json')).json(); const TS = WIDX.ts;
const WKEYS = ['buildings', 'roads', 'paths', 'rails', 'water', 'green', 'trees', 'signals', 'pois', 'barriers', 'stops', 'furniture', 'areas', 'crossings'];
const WORLD = {}; for (const k of WKEYS) WORLD[k] = []; // alles bisher geladene, nur anhängen (Indizes bleiben gültig)
const CITY = Object.assign({ origin: WIDX.origin }, WORLD); // beim Bau einer Kachel zeigt CITY kurz nur auf deren Daten
const TILES = new Map(); const tkey = (tx, tz) => tx + '_' + tz;
// Qualitätsstufe früh lesen (Normal-Maps werden beim Aufbau gesetzt)
function detectGPU() { try { const gl = renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info'); const s = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); try { localStorage.setItem('notgta.gpu', s); } catch (e) {} return s; } catch (e) { return ''; } }
function autoQuality(gpu) { const g = gpu.toLowerCase();
  if (/swiftshader|llvmpipe|software|basic render/.test(g)) return 'niedrig';
  if (/intel/.test(g) && !/\barc\b/.test(g)) return 'mittel'; /* #173: integrierte Intel-GPU (UHD, Iris Xe, „Mesa Intel(R) Graphics“ RPL/ADL/TGL) immer „Mittel“, auch in Hybrid-Kennungen; Hoch lief in Andrés Chrome mit 150 ms CPU / 127 ms GPU je Bild */
  if (/rtx\s*(30[6-9]0|40[6-9]0|50\d0)|rx\s*(6[7-9]|7[7-9]|9[0-9])\d\d|apple m[2-9] (pro|max|ultra)/.test(g)) return 'ultra';
  if (/nvidia|geforce|rtx|gtx|radeon rx|radeon pro|apple m\d/.test(g)) return 'hoch';
  return 'mittel'; }
const GPU = detectGPU(); let QUALITY = 'mittel', QUALITY_AUTO = false, WEAK_VIEW = false;
try { const o = JSON.parse(localStorage.getItem('notgta.opts') || '{}'); if (o.quality && o.qualityManuell) QUALITY = o.quality; else { const a = autoQuality(GPU); QUALITY = a === 'ultra' ? 'hoch' : a; QUALITY_AUTO = true; } /* #163: nur eine vom Nutzer gewählte Stufe bleibt; sonst jeden Start neu nach GPU (alte Stände ohne qualityManuell damit wieder automatisch) */ /* Standard nach GPU, höchstens „Hoch“: „Mittel“ mit Schatten lief auf Intel UHD so schnell wie „Niedrig“ (41,8 zu 40,7 fps, 09.11.2026), sah aber deutlich besser aus; Software-Renderer bekommen weiter „Niedrig“ */ if (WEAK_GPU && !o.weakTuned) WEAK_VIEW = true; } catch (e) {}
// Sparmodus: „Niedrig“ oder integrierte GPU → Figuren, Autos und Straße mit MeshLambertMaterial (kein PBR, kein Umgebungslicht), Anisotropie global aus der Stufe
const LOW_GFX = WEAK_GPU || QUALITY === 'niedrig';
installDunst(THREE, !LOW_GFX); // Höhendunst ab „Mittel“ (dunst.js, #152), vor dem ersten Kompilieren
let ANISO = QUALITY === 'ultra' ? renderer.capabilities.getMaxAnisotropy() : QUALITY === 'niedrig' ? 2 : 4;
if (LOW_GFX) scene.environment = null; else { const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.6; pm.dispose(); }
// GLB-Materialien (Standard/Physical) einmalig nach Lambert wandeln: map, Farbe, Emissive, Transparenz bleiben; Skinning setzt three.js automatisch
function toLambert(m, cache) { if (!m || m.isMeshLambertMaterial || m.isMeshBasicMaterial) return m; let l = cache.get(m); if (!l) { l = new THREE.MeshLambertMaterial({ name: m.name, color: m.color, map: m.map || null, emissive: m.emissive || 0x000000, emissiveMap: m.emissiveMap || null, emissiveIntensity: m.emissiveIntensity ?? 1, transparent: m.transparent, opacity: m.opacity, side: m.side, alphaTest: m.alphaTest, vertexColors: m.vertexColors }); l.userData = m.userData; cache.set(m, l); m.dispose(); } return l; }
function lambertify(root) { const cache = new Map(); root.traverse(o => { if (!o.isMesh) return; o.material = Array.isArray(o.material) ? o.material.map(m => toLambert(m, cache)) : toLambert(o.material, cache); }); }
// Ladeanzeige: Text plus Balken (p = 0..1), der Start-Knopf bleibt gesperrt, bis alles steht
const loadingEl = document.getElementById('loading'), loadBar = document.getElementById('loadbar'), goBtn = document.getElementById('go');
const setLoading = (t, p) => { if (loadingEl) loadingEl.textContent = t; if (p != null) { if (loadBar) loadBar.style.width = Math.round(p * 100) + '%'; if (goBtn) goBtn.textContent = p >= 1 ? 'Rein da' : 'Lädt … ' + Math.round(p * 100) + ' %'; } };
setLoading('Lade Modelle und Texturen …', 0.04);
const gltfLoader = new GLTFLoader(); const texLoader = new THREE.TextureLoader();
const loadGLB = u => new Promise(res => gltfLoader.load(u, g => res(g), undefined, e => { console.warn('Modell fehlt', u, e); res(null); }));
const loadTex = (u, rep, srgb) => new Promise(res => texLoader.load(u, t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ANISO; res(t); }, undefined, () => res(null)));
const PEOPLE_FILES = ['man', 'man_suit', 'woman_casual', 'woman_tanktop', 'woman_dress', 'woman_jacket', 'hero_man', 'hero_woman', 'business_man', 'swat'];
const CAR_FILES = ['sedan', 'small', 'suv', 'taxi', 'police', 'hatchback', 'wagon'];
const [gPeople, gCars, gPistol, TEXA] = await Promise.all([
  Promise.all(PEOPLE_FILES.map(n => loadGLB(`assets/people/${n}.glb`))),
  Promise.all(CAR_FILES.map(n => loadGLB(`assets/cars/${n}.glb`))),
  loadGLB('assets/weapons/pistol.glb'),
  Promise.all([
    loadTex('assets/textures/asphalt_02_diff_1k.jpg', 1 / 3, true), loadTex('assets/textures/asphalt_02_nor_gl_1k.jpg', 1 / 3, false),
    loadTex('assets/textures/grey_cartago_02_diff_1k.jpg', 1 / 2.2, true), loadTex('assets/textures/grey_cartago_02_nor_gl_1k.jpg', 1 / 2.2, false),
    loadTex('assets/textures/cobblestone_floor_04_diff_1k.jpg', 1 / 2, true), loadTex('assets/textures/cobblestone_floor_04_nor_gl_1k.jpg', 1 / 2, false),
    loadTex('assets/textures/clay_roof_tiles_02_diff_1k.jpg', 1 / 2.5, true), loadTex('assets/textures/clay_roof_tiles_02_nor_gl_1k.jpg', 1 / 2.5, false),
    loadTex('assets/textures/painted_plaster_wall_nor_gl_1k.jpg', 1 / 2.5, false), loadTex('assets/textures/red_brick_03_diff_1k.jpg', 1 / 2, true),
  ])]);
if (LOW_GFX) for (const g of [...gPeople, ...gCars, gPistol]) if (g) lambertify(g.scene); // einmal an den Vorlagen, alle Klone erben die Lambert-Materialien
for (const g of [...gPeople, ...gCars, gPistol]) if (g) g.scene.traverse(o => { if (!o.isMesh) return; for (const m of (Array.isArray(o.material) ? o.material : [o.material])) for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap']) if (m && m[k]) m[k].anisotropy = ANISO; }); // Vorlagen-Texturen auf die Stufe, auch für Modelle, die erst später in die Szene kommen
const NM = QUALITY !== 'niedrig'; // Normal-Maps an?
const TEX = { asphalt: TEXA[0], asphaltN: NM ? TEXA[1] : null, paving: TEXA[2], pavingN: NM ? TEXA[3] : null, cobble: TEXA[4], cobbleN: NM ? TEXA[5] : null, tiles: TEXA[6], tilesN: NM ? TEXA[7] : null, plasterN: NM ? TEXA[8] : null, brick: TEXA[9] };
const DEM = { step: WIDX.demStep, n: WIDX.demN }; const DEMT = new Map();
// Geländehöhe (bilinear aus dem 4-m-Raster der Kachel), in Metern über BASE; ohne geladene Kachel deren Mittelwert
const DEMN = new Map(); let thK = NaN, thH = null; const dkey = (tx, tz) => (tx + 4096) * 8192 + tz + 4096;
// Fuß von Stadtmöbeln am Hang (#165): tiefste Geländehöhe unter der Grundfläche (Mitte und vier Ecken im Abstand r);
// die Modelle reichen FOOT_SINK tiefer, damit nichts über dem gröberen Gelände- oder flachen Gehwegstreifen schwebt
const FOOT_SINK = 0.25;
function footTH(x, z, r) { let m = TH(x, z); for (const [a, b] of [[r, r], [r, -r], [-r, r], [-r, -r]]) m = Math.min(m, TH(x + a, z + b)); return m; }
function TH(x, z) {
  let tx = Math.floor(x / TS), tz = Math.floor(z / TS); const k = dkey(tx, tz); let H; if (k === thK) H = thH; else { H = DEMN.get(k); if (H) { thK = k; thH = H; } }
  if (!H) {
    const inf = WIDX.tiles[tx + '_' + tz]; if (inf) return inf[2];
    let fb = 0;
    for (let dx = -1; dx <= 1 && !H; dx++) for (let dz = -1; dz <= 1 && !H; dz++) {
      if (!dx && !dz) continue; const ntx = tx + dx, ntz = tz + dz, nh = DEMN.get(dkey(ntx, ntz));
      if (nh) { H = nh; tx = ntx; tz = ntz; } else if (!fb) { const ni = WIDX.tiles[ntx + '_' + ntz]; if (ni) fb = ni[2]; }
    }
    if (!H) return fb;
  }
  const n = DEM.n, fx = (x - tx * TS) / DEM.step, fz = (z - tz * TS) / DEM.step;
  const ix = Math.min(n - 2, Math.max(0, Math.floor(fx))), iz = Math.min(n - 2, Math.max(0, Math.floor(fz))); const u = clamp(fx - ix, 0, 1), v = clamp(fz - iz, 0, 1);
  const h00 = H[iz * n + ix], h10 = H[iz * n + ix + 1], h01 = H[(iz + 1) * n + ix], h11 = H[(iz + 1) * n + ix + 1];
  return (h00 * (1 - u) + h10 * u) * (1 - v) + (h01 * (1 - u) + h11 * u) * v;
}
// Innenraum (U-Bahn-Station, Laden, Treppenhaus) liegt als eigener Raum weit außerhalb der Stadt, mit eigener Kollision
let POCKET = null; const inPocket = (x, z) => !!POCKET && x >= POCKET.x0 && x <= POCKET.x1 && z >= POCKET.z0 && z <= POCKET.z1;
const inWorld = (x, z) => inPocket(x, z) || !!WIDX.tiles[Math.floor(x / TS) + '_' + Math.floor(z / TS)];
const rayTargets = []; // Boden, Gebäude, gebaute Blöcke (für Kreativmodus)
const signalMeshes = []; const nightOnly = []; const emissiveMats = []; // Ampelleuchten (Reihenfolge wie CITY.signals, ohne die in Gebäuden)
// Ampelphase: Nord-Süd-Verkehr und Ost-West-Verkehr wechseln sich alle 8 s ab
const SIG_C = [[new THREE.Color(0x2a0806), new THREE.Color(3.2, 0.25, 0.12)], [new THREE.Color(0x2a1a04), new THREE.Color(3.0, 1.6, 0.1)], [new THREE.Color(0x062a10), new THREE.Color(0.2, 3.0, 0.9)]];
function signalRed(heading, t) { const ns = Math.abs(Math.cos(heading)) > 0.7; const phase = Math.floor(t / 8) % 2; return ns ? phase === 1 : phase === 0; }
const CELL = 40, grid = new Map();
const key = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768); // Zahl statt Text: schneller in Maps
function addToGrid(idx, pts) {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
    for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
      const k = key(cx, cz); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(idx);
    }
}
function solidAt(x, z) {
  const c = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))); if (!c) return -1;
  for (const i of c) { const b = WORLD.buildings[i]; if (pointInPoly(x, z, b.p) && !(b.pass && inPassage(b, x, z))) return i; }
  return -1;
}
// Hausdurchfahrten (OSM tunnel=building_passage): Korridor durch das Gebäude ist frei begehbar und befahrbar.
// WICHTIG (Fix #11, 12.11.2026): Geschlossene Fußgängerplatz-Umrisse (wie Wochenmarkt Bornheim) und Wege, die nur eine
// Hausecke berühren oder außen an der Fassade entlanglaufen, dürfen niemals als Hausdurchfahrt eingetragen werden –
// sonst baut gateQuads 4 m hohe schwarze Wände quer vor die Läden. Punkt muss mindestens 0,75 m tief IM Haus liegen.
const isPedArea = r => !!(r && r.ped && r.p && r.p.length >= 4 && Math.hypot(r.p[0][0] - r.p[r.p.length - 1][0], r.p[0][1] - r.p[r.p.length - 1][1]) < 1);
function deepInPoly(x, z, poly, m2 = 0.5625) {
  if (!pointInPoly(x, z, poly)) return false;
  for (let i = 0, n = poly.length; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n]; if (distSegSq(x, z, a[0], a[1], b[0], b[1]) < m2) return false; }
  return true;
}
function inPassage(b, x, z) { for (const q of b.pass) if (distSegSq(x, z, q[0], q[1], q[2], q[3]) < q[4] * q[4]) return true; return false; }
// neues Gebäude: Straßenstücke aus dem Straßenraster, die echt durch den Grundriss laufen, als Durchfahrt eintragen
function buildingPassages(bi) { const b = WORLD.buildings[bi]; if (b.mh >= 2.2 || b._stad || b.lm) return; /* Stadion und Wahrzeichen: eigenes Modell ohne Durchfahrt */ let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of b.p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const g = getRoadGrid(), seen = new Map(); /* Raster liefert die Straße selbst (kein Index): je Straße die schon geprüften Segmente merken */
  for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) { const c = g.get(key(cx, cz)); if (!c) continue;
    for (const [r, i] of c) { let sg = seen.get(r); if (!sg) seen.set(r, sg = new Set()); if (sg.has(i)) continue; sg.add(i); if (r.mw || isPedArea(r)) continue; const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; if (Math.max(ax, bx) < x0 || Math.min(ax, bx) > x1 || Math.max(az, bz) < z0 || Math.min(az, bz) > z1) continue;
      const L = Math.hypot(bx - ax, bz - az); if (L < 2.5) continue; for (let t = 1.2; t <= L - 1.2; t += 1.5) { if (deepInPoly(ax + (bx - ax) * t / L, az + (bz - az) * t / L, b.p)) { const hw = Math.max(1.6, r.w / 2 + 0.3); const q = b.pass || (b.pass = []); if (!q.some(e => e[0] === ax && e[1] === az && e[2] === bx && e[3] === bz)) q.push([ax, az, bx, bz, hw]); break; } } } } }
function passageAdd(r, minBi = 0) { if (isPedArea(r)) return; const hw = Math.max(1.6, r.w / 2 + 0.3);
  for (let i = 0; i < r.p.length - 1; i++) { const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const L = Math.hypot(bx - ax, bz - az); if (L < 2.5) continue; const seen = new Set();
    for (let s = 1.2; s <= L - 1.2; s += 1.5) { const x = ax + (bx - ax) * s / L, z = az + (bz - az) * s / L; const c = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))); if (!c) continue;
      for (const bi of c) { if (bi < minBi || seen.has(bi)) continue; const b = WORLD.buildings[bi]; if (b._stad || b.lm || !deepInPoly(x, z, b.p)) continue; seen.add(bi); const q = b.pass || (b.pass = []); if (!q.some(e => e[0] === ax && e[1] === az && e[2] === bx && e[3] === bz)) q.push([ax, az, bx, bz, hw]); } } } }
// Dachhöhe an einem Punkt (Flachdach oder Sattel-/Walmdach)
function roofHeight(b, x, z) {
  const top = (b.base ?? 0) + b.h;
  if (b._pitched === undefined) { b._pitched = false; if (b.r && b.rh > 0 && b.p.length <= 12) { const ob = orientedBox(b.p); if (ob.ratio > 0.6 && (ob.vmax - ob.vmin) < 24) { const W = (ob.vmax - ob.vmin) + 0.7; b._pitched = { ob, W, vm: (ob.vmin + ob.vmax) / 2, rise: Math.min(b.rh, W * 0.6) }; } } }
  const P = b._pitched; if (!P) return top;
  const v = x * P.ob.vx + z * P.ob.vz; return top + P.rise * clamp(1 - Math.abs(v - P.vm) / (P.W / 2), 0, 1);
}
// Gebaute Blöcke als Säulen (für Stehen und Kollision)
const blockCols = new Map(); const bkey = (x, z) => Math.floor(x) + ',' + Math.floor(z);
function blockAdd(rec) { const k = bkey(rec.x, rec.z); if (!blockCols.has(k)) blockCols.set(k, []); blockCols.get(k).push(rec.y); }
function blockRemove(rec) { const a = blockCols.get(bkey(rec.x, rec.z)); if (a) { const i = a.indexOf(rec.y); if (i >= 0) a.splice(i, 1); } }
// Boden unter (x,z) für jemanden auf Höhe y: Gelände, Dach oder Blockoberkante, höchstens 0.55 m über den Füßen
function floorAt(x, z, y = 1e9) {
  let f = TH(x, z); { const d = deckAt(x, z, y, 0.55); if (d !== null) f = Math.max(f, d); } const bi = solidAt(x, z); if (bi >= 0) { const rh = roofHeight(WORLD.buildings[bi], x, z); if (rh <= y + 0.55) f = Math.max(f, rh); }
  const col = blockCols.get(bkey(x, z)); if (col) for (const cy of col) { const t = cy + 0.5; if (t <= y + 0.55) f = Math.max(f, t); }
  return f;
}
// Hindernis auf Körperhöhe? (Gebäude nur unterhalb des Dachs, Blöcke im Bereich y..y+1.7)
function solidAtH(x, z, y) {
  if (inPocket(x, z)) return POCKET.solidH(x, z, y) ? -2 : -1;
  const bi = solidAt(x, z); if (bi >= 0 && y < roofHeight(WORLD.buildings[bi], x, z) - 0.45) return bi;
  const col = blockCols.get(bkey(x, z)); if (col) for (const cy of col) { if (cy + 0.5 > y + 0.5 && cy - 0.5 < y + 1.7) return -2; }
  return -1;
}
// Sichtlinie für Explosionen und Pfefferspray: Hindernis (Gebäude unter Dachhöhe, gebauter Block) in 0,5-m-Schritten → Wirkung ×0,2
function losFactor(ax, ay, az, bx, by, bz) { const L = Math.hypot(bx - ax, by - ay, bz - az); const n = Math.ceil(L / 0.5); for (let i = 1; i < n; i++) { const k = i / n; if (solidAtH(ax + (bx - ax) * k, az + (bz - az) * k, ay + (by - ay) * k) !== -1) return 0.2; } return 1; }
// Zäune, Mauern, Hecken als Liniensegmente im Raster
const barrierGrid = new Map();
function barrierAdd(ax, az, bx, bz, h) { const seg = [ax, az, bx, bz, h]; for (let cx = Math.floor((Math.min(ax, bx) - 2) / CELL); cx <= Math.floor((Math.max(ax, bx) + 2) / CELL); cx++) for (let cz = Math.floor((Math.min(az, bz) - 2) / CELL); cz <= Math.floor((Math.max(az, bz) + 2) / CELL); cz++) { const k = key(cx, cz); if (!barrierGrid.has(k)) barrierGrid.set(k, []); barrierGrid.get(k).push(seg); } return seg; }
function barrierOnRoad(ax, az, bx, bz) { /* Stück liegt auf einer Fahrbahn: Mitte oder ein Ende (Abstand 0,3 m vom Ende) */ if (onOtherRoad((ax + bx) / 2, (az + bz) / 2, null, 0.8)) return true; const l = Math.hypot(bx - ax, bz - az) || 1, e = Math.min(0.45, 0.3 / l); return onOtherRoad(ax + (bx - ax) * e, az + (bz - az) * e, null, 0.4) || onOtherRoad(bx + (ax - bx) * e, bz + (az - bz) * e, null, 0.4); }
function barrierHit(x, z, r, y) { const c = barrierGrid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))); if (!c) return false; /* Zäune quer über der Fahrbahn fallen schon beim Eintragen weg (barrierOnRoad); die frühere Freigabe der ganzen Fahrbahn ließ Autos durch Zäune am Straßenrand */ for (const [ax, az, bx, bz, h] of c) { if (distSegSq(x, z, ax, az, bx, bz) < (r + 0.15) * (r + 0.15)) { if (y === undefined || y < TH(x, z) + h) return true; } } return false; }
// Gewässer (Main, Hafenbecken, Weiher) im Raster; Brücken, Stege und Uferwege bleiben trocken befahr-/begehbar
const waterGrid = new Map(), pathGrid = new Map();
function waterAdd(w) { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, ym = 1e9; for (const [x, z] of w.p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); ym = Math.min(ym, TH(x, z)); } w.x0 = x0; w.x1 = x1; w.z0 = z0; w.z1 = z1; w.wy = ym + 0.2;
  for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) { const k = key(cx, cz); if (!waterGrid.has(k)) waterGrid.set(k, []); waterGrid.get(k).push(w); } }
function pathAdd(r) { for (let i = 0; i < r.p.length - 1; i++) { const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; for (let cx = Math.floor((Math.min(ax, bx) - 3) / CELL); cx <= Math.floor((Math.max(ax, bx) + 3) / CELL); cx++) for (let cz = Math.floor((Math.min(az, bz) - 3) / CELL); cz <= Math.floor((Math.max(az, bz) + 3) / CELL); cz++) { const k = key(cx, cz); if (!pathGrid.has(k)) pathGrid.set(k, []); pathGrid.get(k).push([r, i]); } } }
function onDryWay(x, z) { const k = key(Math.floor(x / CELL), Math.floor(z / CELL)); const rc = getRoadGrid().get(k); if (rc) for (const [r, i] of rc) { const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; if (distSegSq(x, z, ax, az, bx, bz) < (r.w / 2 + 2.8) ** 2) return true; }
  const pc = pathGrid.get(k); if (pc) for (const [r, i] of pc) { const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; if (distSegSq(x, z, ax, az, bx, bz) < 6.25) return true; } return false; }
function waterAt(x, z, y) { if (inPocket(x, z)) return null; const c = waterGrid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))); if (!c) return null;
  const d = deckAt(x, z, y ?? 1e9, 1.5); if (d !== null && d > TH(x, z) + 0.35) return null;
  if (onDryWay(x, z) || solidAt(x, z) >= 0) return null;
  for (const w of c) if (x >= w.x0 && x <= w.x1 && z >= w.z0 && z <= w.z1 && pointInPoly(x, z, w.p)) { const wy = w.wy ?? (TH(x, z) + 0.2); if (TH(x, z) > wy + 0.1) continue; /* Ufer, Kai und Inseln in der Wasserfläche liegen über dem Wasserspiegel: dort steht man (#84, vorher bis 0,65 m darüber „ertrunken“, Boden sichtbar über dem Kopf) */ if (y === undefined || y <= wy + 0.65) return wy; }
  return null; }
// Kreis-Kollision: probiert Zielposition, dann Achsen einzeln; mit y zählt die Höhe (Dächer, Blöcke)
// Rückgabe: 0 frei, 1 geglitten (Teilweg entlang der Wand), 2 blockiert. `extra(x, z)` = zusätzlicher Blocktest (Fahrzeug-Hülle)
function moveWithCollision(pos, dx, dz, r, y, extra) {
  const S = y === undefined ? (x, z) => solidAt(x, z) >= 0 : (x, z) => solidAtH(x, z, y) !== -1;
  const free = (x, z) => inWorld(x, z) && !S(x, z) && !S(x + r, z) && !S(x - r, z) && !S(x, z + r) && !S(x, z - r) && !barrierHit(x, z, r, y) && !(extra && extra(x, z));
  if (free(pos.x + dx, pos.z + dz)) { pos.x += dx; pos.z += dz; return 0; }
  // Gleiten: erst achsweise, sonst entlang der nächsten Gebäudekante (schräge Wände). 2 = blockiert, wenn kaum Weg übrig blieb (steiler Winkel)
  const L = Math.hypot(dx, dz) || 1e-9; let mx = 0, mz = 0, best = 0;
  const tryMove = (ax, az) => { const l = Math.hypot(ax, az); if (l > best && free(pos.x + ax, pos.z + az)) { best = l; mx = ax; mz = az; } };
  if (Math.abs(dx) > 1e-6) tryMove(dx, 0); if (Math.abs(dz) > 1e-6) tryMove(0, dz);
  if (best < 0.9 * L) { const ne = nearestEdge(pos.x, pos.z, r + 1.5); if (ne) { const e = edgeNormal(ne.b.p, ne.e); const tx = -e.nz, tz = e.nx; const k = dx * tx + dz * tz; if (Math.abs(k) > 1e-6) tryMove(tx * k, tz * k); } }
  pos.x += mx; pos.z += mz; return best < 0.8 * L ? 2 : 1; // bis ~37° zur Wand gleiten (10°: 98 % des Wegs), steiler = Aufprall
}


// ---------- Texturen (prozedural, keine Assets nötig) ----------
const _allCanvasTex = [];
const _lamCache = new Map(), _basCache = new Map(), WALL_MATS = new Map(), GF_MATS = new Map(), sharedEmissiveMats = [];
let ROOF_MAT = null, TILE_ROOF_MAT = null, WALK_MAT = null, PATH_MAT = null, SIG_LENS_MAT = null, SPOT_GLOW_MAT = null, PTS_GLOW_MAT = null, SHELTER_GLASS_MAT = null, DORMER_GLASS_MAT = null;
const BUSLINES = []; fetch('data/busroutes.json').then(r => r.ok ? r.json() : []).then(d => { BUSLINES.push(...d); }).catch(() => {}); const BUS_DISP = new Map(); // echte Buslinien (OSM, 12.11.2026)
const WEGZIELE = []; fetch('data/districts.json').then(r => r.ok ? r.json() : []).then(d => { for (const z of d) if (z.n && z.c) WEGZIELE.push({ n: z.n, c: z.c }); }).catch(() => {}); let KLEID_MAT = null; let WARN_MAT = null, ATRIUM_MAT = null; let ARCH_ID = 1; const ARCH_RIDES = new Map(); let ARCH_LAST = 0, ARCH_COUNT = 0; let SCHAUF_TEX = null, GRANIT_MAT = null, OBST_MAT = null, STREIF_MAT = null; let WEGW_MAT = null, TOR_MAT = null; const GARAGE_MATS = []; let WALL_WASH_MAT = null, BAUZAUN_MAT = null, BAU_LAMP_MAT = null, LAUB_MAT = null; let TRUNK_G = null, CROWN_LOW_G = null, CROWN_HI_G = null, LAMP_G = null, LAMP_HEAD_G = null, LAMP_SPOT_G = null, SIG_LENS_G = null, SIG_POLE_G = null, SIG_BOX_G = null, BUSH_LOW_G = null, BUSH_HI_G = null;
// Fernsicht (13.11.2026): Bauten außerhalb wahrzeichen.js, die über den Nebel hinaus sichtbar bleiben sollen; wahrzeichen.js gibt ihnen den Dunst
const FAR_HAZE = []; // { mats, x, z }
const farMat = col => { const m = new THREE.MeshLambertMaterial({ color: col, fog: false }); m.userData.c0 = m.color.clone(); m.userData.e0 = m.emissive.clone(); return m; };
function shLambert(col, side = THREE.FrontSide) {
  const k = col * 4 + side; let m = _lamCache.get(k);
  if (!m) { m = new THREE.MeshLambertMaterial({ color: col, side }); m.userData.shared = true; _lamCache.set(k, m); }
  return m;
}
function shBasic(col) {
  let m = _basCache.get(col);
  if (!m) { m = new THREE.MeshBasicMaterial({ color: col }); m.userData.shared = true; _basCache.set(col, m); }
  return m;
}
function syncAnisoAll(an) {
  for (const t of TEXA) if (t && t.anisotropy !== an) { t.anisotropy = an; t.needsUpdate = true; }
  for (const t of _allCanvasTex) if (t && t.anisotropy !== an) { t.anisotropy = an; t.needsUpdate = true; }
}
function canvasTex(w, h, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeatX, repeatY); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ANISO; _allCanvasTex.push(t); t.addEventListener('dispose', () => { const i = _allCanvasTex.indexOf(t); if (i >= 0) _allCanvasTex.splice(i, 1); }); return t; /* freigegebene Texturen samt Canvas nicht in der Liste festhalten */
}
// Fassade: 4x4 Fenster je Kachel = 12 m breit, 12.8 m hoch (4 Stockwerke)
const FAC_W = 12, FAC_H = 12.8;
function facadeTextures(kind = 'res') {
  const lit = []; for (let i = 0; i < 16; i++) lit.push(Math.random() < (kind === 'public' ? 0.35 : kind === 'hall' ? 0.2 : 0.32));
  const base = { res: '#f2ece2', house: '#f4efe6', public: '#ece8e0', hall: '#d8d8d6', small: '#d9d2c4', church: '#d5cec2' }[kind] || '#f2ece2';
  const draw = (emis) => (ctx, w, h) => {
    ctx.fillStyle = emis ? '#000' : base; ctx.fillRect(0, 0, w, h);
    const cw = w / 4, ch = h / 4;
    if (!emis) {
      for (let i = 0; i < 1500; i++) { ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`; ctx.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
      if (kind === 'hall') { for (let x = 0; x < w; x += 10) { ctx.fillStyle = 'rgba(0,0,0,0.10)'; ctx.fillRect(x, 0, 3, h); } }
      else if (kind === 'church') { ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 2; for (let y = 0; y < h; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); for (let x = (y / 32 % 2) * 32; x < w; x += 64) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 32); ctx.stroke(); } } }
      else if (kind !== 'small') { ctx.fillStyle = 'rgba(0,0,0,0.10)'; for (let r = 0; r < 4; r++) ctx.fillRect(0, r * h / 4, w, 3); }
    }
    if (kind === 'small') return;
    if (kind === 'church') { // hohe Bogenfenster, eins je zwei Kacheln
      for (let q = 0; q < 4; q += 2) { const x = q * cw + cw * 0.7, y = h * 0.15, ww = cw * 0.6, wh = h * 0.55;
        ctx.fillStyle = emis ? (Math.random() < 0.5 ? '#ffb86a' : '#000') : '#2a2a40'; ctx.beginPath(); ctx.moveTo(x, y + wh); ctx.lineTo(x, y + ww / 2); ctx.arc(x + ww / 2, y + ww / 2, ww / 2, Math.PI, 0); ctx.lineTo(x + ww, y + wh); ctx.fill();
        if (!emis) { ctx.strokeStyle = '#a89c8a'; ctx.lineWidth = 4; ctx.stroke(); } }
      return;
    }
    if (kind === 'hall') { // ein Fensterband oben
      const y = ch * 0.25, wh = ch * 0.35; for (let q = 0; q < 8; q++) { const x = q * cw / 2 + cw * 0.08, ww = cw * 0.36; if (emis) { if (lit[q]) { ctx.fillStyle = '#d8e8ff'; ctx.fillRect(x, y, ww, wh); } continue; } ctx.fillStyle = '#9aa3ad'; ctx.fillRect(x - 3, y - 3, ww + 6, wh + 6); ctx.fillStyle = '#2b3340'; ctx.fillRect(x, y, ww, wh); }
      if (!emis) { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, ch * 0.72, w, 6); }
      return;
    }
    const big = kind === 'public';
    for (let r = 0; r < 4; r++) for (let q = 0; q < 4; q++) {
      const ww = cw * (big ? 0.62 : 0.44), wh = ch * (big ? 0.58 : 0.5); const x = q * cw + (cw - ww) / 2, y = r * ch + ch * 0.2; const i = r * 4 + q;
      if (emis) { if (lit[i]) { // Innenlicht: Farbe und Helligkeit je Fenster verschieden, Rahmen und Sprossen bleiben dunkel, oft Vorhang oder Lampe nur in einer Ecke
          const pal = big ? ['#dfe8f0', '#eef1ea', '#c9d6e4'] : ['#e8b25e', '#f0c98a', '#d9984a', '#f3dcb0', '#c8d2e0', '#7f9cc8'], col = pick(pal), k = 0.6 + Math.random() * 0.4;
          const g = ctx.createRadialGradient(x + ww * (0.3 + Math.random() * 0.4), y + wh * (0.25 + Math.random() * 0.5), 2, x + ww / 2, y + wh / 2, Math.max(ww, wh) * 0.9); g.addColorStop(0, col); g.addColorStop(1, '#000');
          ctx.globalAlpha = k; ctx.fillStyle = g; ctx.fillRect(x, y, ww, wh); if (!big && Math.random() < 0.35) { ctx.globalAlpha = 0.55; ctx.fillStyle = '#000'; const cv = Math.random() < 0.5 ? x : x + ww * 0.55; ctx.fillRect(cv, y, ww * 0.45, wh); } ctx.globalAlpha = 1;
          ctx.fillStyle = '#000'; if (!big) ctx.fillRect(x + ww / 2 - 2, y, 4, wh); ctx.fillRect(x, y + wh / 2 - 2, ww, 4); } continue; }
      ctx.fillStyle = big ? '#c9c4bb' : '#ddd4c4'; ctx.fillRect(x - 4, y - 3, ww + 8, wh + 6);
      ctx.fillStyle = Math.random() < 0.5 ? '#2c3442' : '#323a46'; ctx.fillRect(x, y, ww, wh);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x, y, ww * 0.45, wh * 0.4);
      ctx.fillStyle = '#cfc6b6'; if (!big) ctx.fillRect(x + ww / 2 - 1.5, y, 3, wh); ctx.fillRect(x, y + wh / 2 - 1.5, ww, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - 4, y + wh + 3, ww + 8, 4);
    }
  };
  return { map: canvasTex(512, 512, draw(false), 1 / FAC_W, 1 / FAC_H), emissiveMap: canvasTex(512, 512, draw(true), 1 / FAC_W, 1 / FAC_H) };
}
// Hilfen für Gebäudearten (12.11.2026)
function centroidOf(p) { let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } return [x / p.length, z / p.length]; }
function CITY_SCHOOLS() { const out = []; for (const a of CITY.areas || []) { if (a.k !== 'school') continue; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of a.p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } out.push({ p: a.p, x0, x1, z0, z1 }); } return out; }
// Waldstadion, frei nachgebaut ohne Namen und Werbung: Glasfassade, rotes Leuchtband, Membrandach, Ränge, Rasen, zwei Türme
let STAD_MATS = null;
// Kollision folgt dem Modell (Nachttest 13.11.2026): vorher stand der OSM-Grundriss als 3-m- bzw. 2-m-Klotz über dem ganzen
// Stadion (Spielfeld nicht betretbar). markStadium läuft wie markLandmark vor registerTile: b.p wird der Ring der Glasfassade
// (r 0,96–1,0) mit einem 8 m breiten Eingang auf der +z-Seite, das Modell lässt dort dieselbe Lücke (STAD_GAP).
const STAD_GAP = rx => 4 / rx; // halber Öffnungswinkel
function markStadium(b) {
  if (!b || b._stad || !b.p || b.p.length < 4 || !(b.h >= 8)) return;
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of b.p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, rx = (x1 - x0) / 2, rz = (z1 - z0) / 2; let s = 0; // Waldstadion (Niederrad) und FSV-Stadion am Bornheimer Hang
  if (x1 - x0 > 200 && z1 - z0 > 200 && Math.hypot(mx + 4583, mz - 6771) < 80) s = 1; else if (x1 - x0 > 120 && z1 - z0 > 140 && Math.hypot(mx - 948, mz - 174) < 50) s = 0.55;
  if (!s) return;
  const gh = STAD_GAP(rx), n = 48, pt = (r, i) => { const a = gh + (Math.PI * 2 - 2 * gh) * i / n; return [mx + r * rx * Math.sin(a), mz + r * rz * Math.cos(a)]; };
  const ring = []; for (let i = 0; i <= n; i++) ring.push(pt(1, i)); for (let i = n; i >= 0; i--) ring.push(pt(0.96, i));
  b._stad = { mx, mz, rx, rz, s }; b.p0 = b.p; b.p = ring; b.h = 27 * s; b.r = 0; b.rh = 0; b.mh = 0;
}
function waldstadion(cx, cz, rx, rz, s = 1) { // s = Höhe (FSV-Stadion 0,55, ohne Türme)
  const g = new THREE.Group(); const y0 = TH(cx, cz);
  if (!STAD_MATS) { STAD_MATS = { glas: new THREE.MeshLambertMaterial({ color: 0x8fa3b4, emissive: 0xffd9a0, emissiveIntensity: 0.18, side: THREE.DoubleSide }), band: new THREE.MeshLambertMaterial({ color: 0xd8261c, emissive: 0xff2a1a, emissiveIntensity: 0.7, side: THREE.DoubleSide }),
    dach: new THREE.MeshLambertMaterial({ color: 0xe9ecef, side: THREE.DoubleSide }), rang: new THREE.MeshLambertMaterial({ color: 0x7c8590, side: THREE.DoubleSide }), rasen: new THREE.MeshLambertMaterial({ color: 0x3f7d36 }), beton: new THREE.MeshLambertMaterial({ color: 0xb8b6b0 }) };
    // nach Andrés Fotos (12.11.2026): Ränge aus schwarzen Schalensitzen, weiße Sitze bilden den Vereinsnamen; Fassade aus grauen Lamellen; Membrandach mit Bögen
    const sitze = (txt) => canvasTex(2048, 128, (c, w, h) => { c.fillStyle = '#16181b'; c.fillRect(0, 0, w, h); for (let y = 2; y < h; y += 6) for (let x = 1; x < w; x += 5) { c.fillStyle = '#23262a'; c.fillRect(x, y, 3, 3); }
      for (let x = 0; x < w; x += w / 16) { c.fillStyle = '#cfcfcf'; c.fillRect(x, 0, 6, h); } // Treppen
      if (txt) { c.fillStyle = '#ececec'; c.font = 'bold 74px sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'center'; for (const x of [w * 0.25, w * 0.75]) c.fillText(txt, x, h * 0.55); } }, 1, 1);
    const spieltag = [0, 6].includes(new Date().getDay()); // Wochenende = Spieltag: volle Ränge, Schals hoch
    STAD_MATS.rang.map = spieltag ? canvasTex(2048, 128, (c, w, h) => { c.fillStyle = '#121316'; c.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 3) { const q = Math.random(); c.fillStyle = q < 0.3 ? '#e9e9e9' : q < 0.62 ? '#0a0a0a' : q < 0.7 ? '#c8a088' : q < 0.74 ? '#b5262a' : '#2a2c30'; c.fillRect(x, y, 2, 3); } for (let x = 0; x < w; x += w / 16) { c.fillStyle = '#9a9a9a'; c.fillRect(x, 0, 5, h); } }, 1, 1) : sitze('EINTRACHT FRANKFURT'); STAD_MATS.rang.color.setHex(0xffffff);
    STAD_MATS.rangFSV = new THREE.MeshLambertMaterial({ map: sitze(''), side: THREE.DoubleSide });
    STAD_MATS.glas.map = canvasTex(512, 64, (c, w, h) => { c.fillStyle = '#9ea3a8'; c.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 8) { c.fillStyle = x % 64 === 0 ? '#c9ccce' : '#b4b8bb'; c.fillRect(x, 0, 5, h); } c.fillStyle = '#5d6268'; c.fillRect(0, h * 0.48, w, 3); }, 1, 1);
    STAD_MATS.glas.color.setHex(0xffffff); STAD_MATS.glas.emissiveIntensity = 0.08;
    STAD_MATS.dach.map = canvasTex(1024, 64, (c, w, h) => { c.fillStyle = '#eef0f2'; c.fillRect(0, 0, w, h); c.strokeStyle = '#a69a90'; c.lineWidth = 3; for (let x = 0; x < w; x += 64) { c.beginPath(); c.arc(x + 32, h, 34, Math.PI, 0); c.stroke(); } }, 1, 1);
    STAD_MATS.beton.color.setHex(0xc6c8ca);
    for (const m of Object.values(STAD_MATS)) m.userData.shared = true; }
  const M = STAD_MATS; const gh = STAD_GAP(rx), TL = Math.PI * 2 - 2 * gh; const ring = (r0, h, mat, y, open = true) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r0, h, 48, 1, open, gh, TL), mat); m.scale.set(rx, 1, rz); m.position.y = y; return m; };
  g.add(ring(1, 20, M.glas, 10)); g.add(ring(1.01, 2.4, M.band, 21.5)); g.add(ring(1.0, 3, M.beton, 24));
  const rg = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.98, 18, 48, 1, true, gh, TL), s === 1 ? M.rang : M.rangFSV); rg.scale.set(rx, 1, rz); rg.position.y = 11; g.add(rg);
  const dg = new THREE.RingGeometry(0.62, 1.03, 48, 1); dg.rotateX(-Math.PI / 2); const d = new THREE.Mesh(dg, M.dach); d.scale.set(rx, 1, rz); d.position.y = 27; d.castShadow = true; g.add(d);
  const pg = new THREE.PlaneGeometry(rx * 1.1, rz * 0.8); pg.rotateX(-Math.PI / 2); const p = new THREE.Mesh(pg, M.rasen); p.position.y = 0.3; p.receiveShadow = true; g.add(p);
  for (const s of [-1, 1]) { const tw = new THREE.Mesh(new THREE.BoxGeometry(7, 62, 7), M.turm || (M.turm = Object.assign(new THREE.MeshLambertMaterial({ map: canvasTex(64, 512, (c, w, h) => { c.fillStyle = '#c9cbcd'; c.fillRect(0, 0, w, h); for (let y = 30; y < h; y += 46) { c.fillStyle = '#3d4248'; c.fillRect(10, y, w - 20, 20); } }, 1, 1) }), { userData: { shared: true } }))); tw.position.set(s * (rx + 45), 31, s * rz * 0.3); tw.castShadow = true; g.add(tw); const k = new THREE.Mesh(new THREE.BoxGeometry(8, 6, 8), M.beton); k.position.set(s * (rx + 45), 64, s * rz * 0.3); g.add(k); }
  g.position.set(cx, y0, cz); if (s !== 1) { g.scale.y = s; g.children.slice(-4).forEach(o => { if (o.geometry.type === 'BoxGeometry') o.visible = false; }); } return g;
}
// Fassaden nach Fotos aus Frankfurt (12.11.2026). Eine Kachel = 12 x 12,8 m (vier Geschosse), Farben stecken im Bild, Vertexfarbe bleibt hell.
function facadeStyle(style) {
  const draw = (emis) => (c, w, h) => { const cw = w / 4, ch = h / 4; const R = () => Math.random();
    const fenster = (x, y, ww, wh, rahmen, glas = '#2c3442') => { if (emis) { if (R() < 0.3) { c.fillStyle = pick(['#e8b25e', '#f0c98a', '#dfe8f0']); c.fillRect(x, y, ww, wh); } return; }
      if (rahmen) { c.fillStyle = rahmen; c.fillRect(x - 5, y - 5, ww + 10, wh + 10); } c.fillStyle = glas; c.fillRect(x, y, ww, wh); c.fillStyle = 'rgba(255,255,255,0.16)'; c.fillRect(x, y, ww * 0.45, wh * 0.4); c.fillStyle = '#e6e2da'; c.fillRect(x + ww / 2 - 1.5, y, 3, wh); };
    const ziegel = (x, y, ww, hh, tone) => { if (emis) return; for (let yy = y; yy < y + hh; yy += 8) for (let xx = x - ((yy / 8) % 2) * 8; xx < x + ww; xx += 16) { const k = tone(); c.fillStyle = k; c.fillRect(Math.max(x, xx), yy, Math.min(15, x + ww - xx), 7); } };
    if (style === 'ezb') { // EZB (Fotos 12.11.2026): Glasfassade, silbergraue Stahlsprossen, Geschossdecken nur angedeutet; nachts viele kühl-weiß erleuchtete Scheiben in Gruppen
      const rows = 4, cols = 10, pw = w / cols, ph = h / rows; c.fillStyle = emis ? '#000' : '#8e979f'; c.fillRect(0, 0, w, h);
      for (let r = 0; r < rows; r++) { const band = R() < 0.55; for (let q = 0; q < cols; q++) { const x = q * pw + 2, y = r * ph + 3, ww = pw - 4, hh = ph - 6;
        if (emis) { if ((band && R() < 0.85) || R() < 0.2) { c.fillStyle = pick(['#eef3f8', '#dfe8f2', '#f4f1e6']); c.fillRect(x, y, ww, hh); } continue; }
        const g = c.createLinearGradient(x, y, x + ww, y + hh); g.addColorStop(0, '#3c4a58'); g.addColorStop(0.5, '#56677a'); g.addColorStop(1, '#2c3846'); c.fillStyle = g; c.fillRect(x, y, ww, hh); }
        if (!emis) { c.fillStyle = '#b4bcc4'; c.fillRect(0, r * ph, w, 2); } }
      if (!emis) { c.fillStyle = '#c4ccd4'; for (let q = 0; q <= cols; q++) c.fillRect(q * pw - 1, 0, 2, h); } return; }
    c.fillStyle = '#000'; c.fillRect(0, 0, w, h); if (emis) { for (let r = 0; r < 4; r++) for (let q = 0; q < 4; q++) fenster(q * cw + cw * 0.28, r * ch + ch * 0.25, cw * 0.44, ch * 0.45); return; }
    if (style === 'wache') { // hell verputzt, Fensterrahmen und Ecksteine aus rotem Sandstein, Gesimsband
      c.fillStyle = '#efe3d6'; c.fillRect(0, 0, w, h); c.fillStyle = '#9a4f3e'; c.fillRect(0, h - ch * 0.08 - 4, w, 6);
      for (let y = 0; y < h; y += 24) { c.fillRect(0, y, (y / 24) % 2 ? 14 : 22, 18); c.fillRect(w - ((y / 24) % 2 ? 14 : 22), y, 22, 18); }
      for (let r = 0; r < 4; r++) for (let q = 0; q < 4; q++) fenster(q * cw + cw * 0.27, r * ch + ch * 0.2, cw * 0.46, ch * 0.55, '#9a4f3e', '#3a4250');
      return; }
    if (style === 'abg') { // ABG-Wohnhaus (Foto 12.11.2026): hellblaugrauer Putz, weiße Fensterfaschen mit Sohlbank, Erdgeschoss grau mit dunklen Klappläden, Gurtgesims
      c.fillStyle = '#c9d0d8'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(0,0,0,0.16)'; c.fillRect(cw * 2.95, 0, 4, h);
      for (let r = 0; r < 4; r++) { const y = r * ch; const eg = r === 3; if (eg) { c.fillStyle = '#a9adb0'; c.fillRect(0, y, w, ch); } c.fillStyle = '#e9e6dc'; c.fillRect(0, y, w, 6);
        for (let q = 0; q < 4; q++) { const ww = cw * 0.4, x = q * cw + (cw - ww) / 2, wy = y + ch * 0.24, wh = ch * 0.52; c.fillStyle = '#ece8de'; c.fillRect(x - 9, wy - 9, ww + 18, wh + 14); c.fillRect(x - 13, wy + wh + 3, ww + 26, 8); fenster(x, wy, ww, wh, '#f6f6f2', '#2c333c');
          if (eg) { c.fillStyle = '#3f4549'; c.fillRect(x - 9 - ww * 0.5, wy, ww * 0.45, wh); c.fillRect(x + ww + 9, wy, ww * 0.45, wh); c.fillStyle = 'rgba(255,255,255,0.12)'; for (let s = wy + 4; s < wy + wh; s += 7) { c.fillRect(x - 9 - ww * 0.5, s, ww * 0.45, 2); c.fillRect(x + ww + 9, s, ww * 0.45, 2); } } } }
      return; }
    if (style === 'zwanziger') { // Wöllstädter Straße (Nachtfoto): glatter beigegrauer Putz, weiße Fensterrahmen, Kastenerker mit Gitterbalkon, Sockel dunkler
      c.fillStyle = '#d6cdbf'; c.fillRect(0, 0, w, h); c.fillStyle = '#e4ddd1'; c.fillRect(cw * 1.05, 0, cw * 1.25, h); c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(cw * 2.3, 0, 6, h);
      for (let r = 0; r < 4; r++) { const y = r * ch; for (const q of [0.25, 1.35, 2.7, 3.35]) { const ww = cw * 0.42, x = q * cw, wy = y + ch * 0.26, wh = ch * 0.5; fenster(x, wy, ww, wh, '#f4f4f2', '#2b313a'); c.fillStyle = '#f4f4f2'; c.fillRect(x - 6, wy + wh + 4, ww + 12, 6); }
        if (r === 0) { c.fillStyle = '#4a3a36'; c.fillRect(cw * 1.0, y + ch * 0.62, cw * 1.35, 4); for (let x = cw * 1.0; x < cw * 2.35; x += 7) c.fillRect(x, y + ch * 0.62, 2, ch * 0.3); c.strokeStyle = '#4a3a36'; c.lineWidth = 2; for (let x = cw * 1.1; x < cw * 2.2; x += 18) { c.beginPath(); c.moveTo(x, y + ch * 0.77); c.lineTo(x + 9, y + ch * 0.68); c.lineTo(x + 18, y + ch * 0.77); c.lineTo(x + 9, y + ch * 0.86); c.closePath(); c.stroke(); } }
        if (r === 2) { c.fillStyle = '#c9c0b2'; c.fillRect(cw * 1.0, y + ch * 0.86, cw * 1.35, ch * 0.14); } }
      return; }
    if (style === 'gruender') { // Berger Straße (Foto): heller Putz, Fenster mit Sandsteinrahmen, Ohren und Verdachung, Gurtgesims
      c.fillStyle = '#ece6dc'; c.fillRect(0, 0, w, h); const s = '#8c5145';
      for (let r = 0; r < 4; r++) { const y = r * ch; c.fillStyle = s; c.fillRect(0, y + ch - 10, w, 10); c.fillStyle = 'rgba(0,0,0,0.15)'; c.fillRect(0, y + ch, w, 3);
        for (let q = 0; q < 3; q++) { const ww = cw * 0.52, x = q * (w / 3) + (w / 3 - ww) / 2, wy = y + ch * 0.2, wh = ch * 0.6; c.fillStyle = s; c.fillRect(x - 12, wy - 12, ww + 24, wh + 20); c.fillRect(x - 18, wy - 4, 8, 16); c.fillRect(x + ww + 10, wy - 4, 8, 16); c.fillRect(x - 16, wy - 22, ww + 32, 10); c.fillRect(x - 6, wy + wh + 6, ww + 12, 10);
          fenster(x, wy, ww, wh, null, '#2f3843'); c.fillStyle = 'rgba(240,236,228,0.55)'; c.fillRect(x + 3, wy + 3, ww * 0.18, wh - 6); c.fillRect(x + ww * 0.82 - 3, wy + 3, ww * 0.18, wh - 6); } }
      return; }
    if (style === 'messeturm') { // rotbrauner Granit, enges Fensterraster, dunkle Glasbänder an den Ecken
      c.fillStyle = '#8a5a4e'; c.fillRect(0, 0, w, h); for (let r = 0; r < 12; r++) for (let q = 0; q < 8; q++) { const x = q * w / 8 + 10, y = r * h / 12 + 8; if (q === 0 || q === 7) { c.fillStyle = '#1e2733'; c.fillRect(q * w / 8, y - 8, w / 8, h / 12); continue; } fenster(x, y, w / 8 - 20, h / 12 - 18, '#6e443b', '#26303c'); }
      return; }
    if (style === 'barock') { // Hauptwache: heller Putz, roter Sandstein an Ecken, Fenstern und Gesims
      c.fillStyle = '#efe6d8'; c.fillRect(0, 0, w, h); const s = '#9a4e3c'; c.fillStyle = s; c.fillRect(0, 0, 18, h); c.fillRect(w - 18, 0, 18, h);
      for (let r = 0; r < 4; r++) { c.fillStyle = s; c.fillRect(0, r * ch + ch - 8, w, 8); for (let q = 0; q < 4; q++) { const x = q * cw + cw * 0.3, y = r * ch + ch * 0.2; c.fillStyle = s; c.fillRect(x - 8, y - 14, cw * 0.4 + 16, 9); fenster(x, y, cw * 0.4, ch * 0.58, s, '#2d3540'); } }
      return; }
    if (style === 'sandstein') { // Gründerzeit in rotem Sandstein (Foto Metropolis, Eschenheimer Tor): Rundbogenfenster, Gesimse, Lisenen
      c.fillStyle = '#8f4d3e'; c.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 16) { c.fillStyle = 'rgba(0,0,0,0.08)'; c.fillRect(0, y, w, 2); }
      for (let r = 0; r < 4; r++) { c.fillStyle = '#7a3f33'; c.fillRect(0, r * ch + ch - 9, w, 9); for (let q = 0; q <= 4; q++) c.fillRect(q * cw - 5, r * ch, 10, ch);
        for (let q = 0; q < 4; q++) { const x = q * cw + cw * 0.27, y = r * ch + ch * 0.22, ww = cw * 0.46, wh = ch * 0.56; c.fillStyle = '#6e372c'; c.beginPath(); c.arc(x + ww / 2, y + 2, ww / 2 + 6, Math.PI, 0); c.fill(); fenster(x, y, ww, wh, '#6e372c', '#2a323e'); c.fillStyle = '#2a323e'; c.beginPath(); c.arc(x + ww / 2, y + 1, ww / 2, Math.PI, 0); c.fill(); } }
      return; }
    if (style === 'fw') { // Fachwerk Alt-Bornheim (Foto Eulengasse): weiße Gefache, dunkle Balken mit Streben, blaue Läden, Bruchsteinsockel in der untersten Reihe
      c.fillStyle = '#f1f2ef'; c.fillRect(0, 0, w, h); const bk = '#2b221c';
      for (let r = 0; r < 4; r++) { const y = r * ch; c.fillStyle = bk; c.fillRect(0, y, w, 9); c.fillRect(0, y + ch * 0.5, w, 6);
        for (let q = 0; q <= 8; q++) if (q !== 3 && q !== 5) c.fillRect(q * w / 8 - 4, y, 8, ch);
        c.strokeStyle = bk; c.lineWidth = 7; for (const q of [0, 6]) { c.beginPath(); c.moveTo(q * w / 8, y + ch); c.lineTo((q + 1) * w / 8, y + ch * 0.5); c.stroke(); c.beginPath(); c.moveTo((q + 2) * w / 8, y + ch); c.lineTo((q + 1) * w / 8, y + ch * 0.5); c.stroke(); }
        for (const q of [2.15, 4.15]) { const x = q * w / 8, ww = w / 8 * 0.7; fenster(x + ww * 0.3, y + ch * 0.18, ww * 1.0, ch * 0.62, '#f6f6f2', '#2e3742'); c.fillStyle = '#2f4f86'; c.fillRect(x - ww * 0.15, y + ch * 0.16, ww * 0.42, ch * 0.66); c.fillRect(x + ww * 1.33, y + ch * 0.16, ww * 0.42, ch * 0.66); c.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 0; k < 8; k++) { c.fillRect(x - ww * 0.15, y + ch * (0.2 + k * 0.077), ww * 0.42, 2); c.fillRect(x + ww * 1.33, y + ch * (0.2 + k * 0.077), ww * 0.42, 2); } } }
      return; }
    if (style === 'schiefer') { // Schieferverkleidung (Foto Eulengasse rechts): graue Schuppen, helle Fensterrahmen
      c.fillStyle = '#5d636b'; c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 9) for (let x = -((y / 9) % 2) * 7; x < w; x += 14) { c.fillStyle = pick(['#555b63', '#626870', '#4d535b', '#6a7078']); c.beginPath(); c.moveTo(x, y); c.lineTo(x + 13, y); c.lineTo(x + 13, y + 6); c.arc(x + 6.5, y + 6, 6.5, 0, Math.PI); c.fill(); }
      for (let r = 0; r < 4; r++) for (const q of [0.6, 2.4]) fenster(q * cw + cw * 0.1, r * ch + ch * 0.22, cw * 0.5, ch * 0.55, '#e4e2dc', '#2b333d');
      return; }
    if (style === 'altschule') { c.fillStyle = '#eeede8'; c.fillRect(0, 0, w, h); const sst = '#8e5546';
      for (let r = 0; r < 4; r++) { const y = r * ch; c.fillStyle = sst; c.fillRect(0, y + ch - 7, w, 7); c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(0, y + ch, w, 3);
        for (let q = 0; q < 4; q++) { const x = q * cw + cw * 0.3, ww = cw * 0.4, wy = y + ch * 0.24, wh = ch * 0.6;
          c.fillStyle = sst; c.fillRect(x - 7, wy - 18, ww + 14, 10); c.fillRect(x - 10, wy - 22, ww + 20, 5); c.fillRect(x - 6, wy + wh, ww + 12, 7);
          fenster(x, wy, ww, wh, sst, '#36404c'); c.fillStyle = '#f2f2ee'; c.fillRect(x, wy + wh * 0.32, ww, 3); } }
      return; }
    if (style === 'school') { // weißes Band oben, Fensterband, Klinkersockel (IGS-Bauten)
      for (let r = 0; r < 4; r++) { const y = r * ch; c.fillStyle = '#f1f1ee'; c.fillRect(0, y, w, ch * 0.22); ziegel(0, y + ch * 0.22, w, ch * 0.78, () => pick(['#8c4535', '#9b4c3a', '#7d3d30'])); c.fillStyle = '#e9e9e6'; c.fillRect(0, y + ch * 0.3, w, ch * 0.5);
        for (let q = 0; q < 8; q++) fenster(q * w / 8 + 5, y + ch * 0.34, w / 8 - 10, ch * 0.42, null, '#34404e'); }
      return; }
    if (style === 'nk') { // Nachkriegsblock: Putz hellgrün oder beige, Fensterpaare, Balkonsäule in der Mitte
      c.fillStyle = pick(['#dfe6cf', '#e9e0c8', '#e4e7d6']); c.fillRect(0, 0, w, h);
      for (let r = 0; r < 4; r++) { for (const q of [0, 3]) fenster(q * cw + cw * 0.3, r * ch + ch * 0.28, cw * 0.4, ch * 0.42, '#f4f2ec'); c.fillStyle = '#b9b6ad'; c.fillRect(cw * 1.15, r * ch + ch * 0.18, cw * 1.7, ch * 0.62); fenster(cw * 1.3, r * ch + ch * 0.22, cw * 1.4, ch * 0.32, null, '#3a3f48'); c.fillStyle = '#f4f2ec'; c.fillRect(cw * 1.1, r * ch + ch * 0.55, cw * 1.8, ch * 0.3); c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(cw * 1.1, r * ch + ch * 0.85, cw * 1.8, 4); }
      return; }
    if (style === 'nb') { // Neubau: weiße Geschossbänder, grauer Klinker, Holzfenster
      for (let r = 0; r < 4; r++) { const y = r * ch; c.fillStyle = '#f3f3f1'; c.fillRect(0, y, w, ch * 0.24); ziegel(0, y + ch * 0.24, w, ch * 0.76, () => pick(['#9a9b98', '#b4b3ae', '#8a8c8c', '#c3c1ba']));
        for (let q = 0; q < 4; q++) fenster(q * cw + cw * 0.22, y + ch * 0.32, cw * (q % 2 ? 0.56 : 0.36), ch * 0.58, '#9a6b3e', '#2e3640'); }
      return; }
    if (style === 'zi') { // Mainufer: roter oder dunkelbrauner Klinker, Balkonreihen
      const ton = pick([['#a8473a', '#b5523f', '#963f34'], ['#5c4a42', '#6a564c', '#4f4039']]); ziegel(0, 0, w, h, () => pick(ton));
      for (let r = 0; r < 4; r++) { for (let q = 0; q < 4; q++) fenster(q * cw + cw * 0.2, r * ch + ch * 0.2, cw * 0.6, ch * 0.55, '#d8d4cc', '#2c333d'); c.fillStyle = '#d9d6cf'; c.fillRect(0, r * ch + ch * 0.74, w, ch * 0.07); c.fillStyle = 'rgba(60,60,60,0.55)'; for (let x = 0; x < w; x += 9) c.fillRect(x, r * ch + ch * 0.6, 2, ch * 0.14); }
      return; }
  };
  return { map: canvasTex(512, 512, draw(false), 1 / FAC_W, 1 / FAC_H), emissiveMap: canvasTex(512, 512, draw(true), 1 / FAC_W, 1 / FAC_H) };
}
// Erdgeschoss: 12 m breit, 3.3 m hoch. Tür, Fenster, Läden, Tore
const GF_W = 12, GF_H = 3.3;
const GT_CACHE = new Map();
function groundTextures(kind = 'res') { if (!GT_CACHE.has(kind)) GT_CACHE.set(kind, groundTextures0(kind)); return GT_CACHE.get(kind); }
function groundTextures0(kind = 'res') {
  const M = 512 / GF_W; // px je Meter
  const shop = kind === 'resshop';
  const draw = (emis) => (ctx, w, h) => {
    ctx.fillStyle = emis ? '#000' : { hall: '#c9c9c6', small: '#cfc7b8', church: '#cfc7ba', public: '#dedad2' }[kind] || '#e6dfd3'; ctx.fillRect(0, 0, w, h);
    if (!emis) { for (let i = 0; i < 900; i++) { ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.07})`; ctx.fillRect(Math.random() * w, Math.random() * h, 3, 3); } ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(0, h - 0.45 * M, w, 0.45 * M); /* Sockel */ ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(0, 0, w, 5); }
    const door = (x, dw, dh, col, glass) => { if (emis) { if (glass) { ctx.fillStyle = '#ffe2a0'; ctx.fillRect(x + 0.1 * M, h - dh + 0.2 * M, dw - 0.2 * M, dh * 0.5); } return; } ctx.fillStyle = '#8f8676'; ctx.fillRect(x - 5, h - dh - 5, dw + 10, dh + 5); ctx.fillStyle = col; ctx.fillRect(x, h - dh, dw, dh); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + dw / 2 - 1.5, h - dh, 3, dh); if (glass) { ctx.fillStyle = '#2c3442'; ctx.fillRect(x + 0.1 * M, h - dh + 0.2 * M, dw - 0.2 * M, dh * 0.5); } else { ctx.fillStyle = '#d9c38a'; ctx.fillRect(x + dw * 0.72, h - dh * 0.5, 5, 5); } ctx.fillStyle = '#6a645c'; ctx.fillRect(x - 0.15 * M, h - 0.12 * M, dw + 0.3 * M, 0.12 * M); };
    const win = (x, y, ww, wh, lit) => { if (emis) { if (lit) { const g = ctx.createRadialGradient(x + ww * 0.5, y + wh * 0.4, 2, x + ww / 2, y + wh / 2, Math.max(ww, wh) * 0.9); g.addColorStop(0, pick(['#e8b25e', '#f0c98a', '#f3dcb0', '#c8d2e0'])); g.addColorStop(1, '#000'); ctx.globalAlpha = 0.6 + Math.random() * 0.4; ctx.fillStyle = g; ctx.fillRect(x, y, ww, wh); ctx.globalAlpha = 1; ctx.fillStyle = '#000'; ctx.fillRect(x + ww / 2 - 2, y, 4, wh); } return; } ctx.fillStyle = '#ddd4c4'; ctx.fillRect(x - 4, y - 3, ww + 8, wh + 6); ctx.fillStyle = '#2c3442'; ctx.fillRect(x, y, ww, wh); ctx.fillStyle = '#cfc6b6'; ctx.fillRect(x + ww / 2 - 1.5, y, 3, wh); ctx.fillRect(x, y + wh / 2 - 1.5, ww, 3); };
    if (kind === 'hall') { if (!emis) { ctx.fillStyle = '#7f8388'; ctx.fillRect(1.0 * M, h - 3.0 * M, 4.2 * M, 3.0 * M); ctx.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = h - 3.0 * M; y < h; y += 0.3 * M) ctx.fillRect(1.0 * M, y, 4.2 * M, 2); } door(7.0 * M, 1.0 * M, 2.2 * M, '#555a60', false); win(9.2 * M, h - 2.6 * M, 1.6 * M, 1.0 * M, Math.random() < 0.4); return; }
    if (kind === 'small') { if (!emis) { ctx.fillStyle = '#8a8580'; ctx.fillRect(0.6 * M, h - 2.3 * M, 2.6 * M, 2.3 * M); ctx.fillStyle = 'rgba(0,0,0,0.2)'; for (let y = h - 2.3 * M; y < h; y += 0.35 * M) ctx.fillRect(0.6 * M, y, 2.6 * M, 2); } door(6.5 * M, 0.9 * M, 2.0 * M, '#5a4634', false); return; }
    if (kind === 'church') { if (!emis) { const x = 4.5 * M, dw = 3.0 * M, dh = 3.1 * M; ctx.fillStyle = '#5a4634'; ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x, h - dh + dw / 2); ctx.arc(x + dw / 2, h - dh + dw / 2, dw / 2, Math.PI, 0); ctx.lineTo(x + dw, h); ctx.fill(); ctx.strokeStyle = '#a89c8a'; ctx.lineWidth = 6; ctx.stroke(); } return; }
    if (kind === 'wache') { for (let q = 0; q < 3; q++) { const x = (0.5 + q * 3.9) * M, dw = 3.3 * M, dh = 2.9 * M; if (emis) { ctx.fillStyle = '#3a2a20'; ctx.fillRect(x + 0.2 * M, h - dh + 0.2 * M, dw - 0.4 * M, 0.6 * M); continue; }
        ctx.fillStyle = '#9a4f3e'; ctx.fillRect(x - 0.15 * M, h - dh - 0.15 * M, dw + 0.3 * M, dh + 0.15 * M); ctx.fillStyle = '#b8473a'; ctx.fillRect(x, h - dh, dw, dh); ctx.fillStyle = 'rgba(0,0,0,0.3)'; for (let k = 1; k < 4; k++) ctx.fillRect(x + dw * k / 4 - 1, h - dh, 3, dh);
        ctx.fillStyle = '#3b4250'; for (let k = 0; k < 4; k++) ctx.fillRect(x + dw * k / 4 + 0.15 * M, h - dh + 0.2 * M, dw / 4 - 0.3 * M, 0.7 * M); ctx.fillStyle = '#f2f2f2'; ctx.fillRect(x + dw * 0.4, h - dh * 0.55, dw * 0.2, 0.35 * M); } return; }
    if (kind === 'altschule') { if (!emis) { ctx.fillStyle = '#e8e6e0'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#8e5546'; ctx.fillRect(4.4 * M, h - 3.2 * M, 3.2 * M, 3.2 * M); ctx.fillRect(4.1 * M, h - 3.3 * M, 3.8 * M, 0.35 * M); } door(4.8 * M, 2.4 * M, 2.7 * M, '#2f3a44', true);
      for (const x of [1.0, 9.0]) { if (!emis) { ctx.fillStyle = '#8e5546'; ctx.fillRect((x - 0.12) * M, h - 2.95 * M, 2.24 * M, 2.3 * M); } win(x * M, h - 2.8 * M, 2.0 * M, 2.0 * M, Math.random() < 0.3); } return; }
    if (kind === 'school') { if (!emis) { ctx.fillStyle = '#8c4535'; ctx.fillRect(0, h - 3.0 * M, w, 3.0 * M); } for (let q = 0; q < 4; q++) { const x = (0.3 + q * 2.95) * M; if (emis) { if (Math.random() < 0.35) { ctx.fillStyle = '#dfe8f0'; ctx.fillRect(x, h - 2.7 * M, 2.6 * M, 2.4 * M); } continue; } ctx.fillStyle = '#e9e9e6'; ctx.fillRect(x - 0.08 * M, h - 2.78 * M, 2.76 * M, 2.5 * M); ctx.fillStyle = '#33404d'; ctx.fillRect(x, h - 2.7 * M, 2.6 * M, 2.4 * M); ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(x, h - 2.7 * M, 1.1 * M, 1.0 * M); } return; }
    if (kind === 'public') { door(4.6 * M, 2.4 * M, 2.5 * M, '#3b4a5a', true); win(0.8 * M, h - 2.6 * M, 2.4 * M, 1.6 * M, Math.random() < 0.5); win(8.5 * M, h - 2.6 * M, 2.4 * M, 1.6 * M, Math.random() < 0.5); return; }
    if (shop) { // Schaufenster + Markise + Tür
      if (!emis) { ctx.fillStyle = '#8c5145'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#7a4439'; for (let y = h - 3.3 * M; y < h; y += 0.45 * M) ctx.fillRect(0, y, w, 3); ctx.fillStyle = '#e8e4dc'; ctx.fillRect(8.2 * M, h - 2.9 * M, 1.5 * M, 2.5 * M); ctx.fillStyle = 'rgba(0,0,0,0.12)'; for (let y = h - 2.9 * M; y < h - 0.4 * M; y += 0.12 * M) ctx.fillRect(8.2 * M, y, 1.5 * M, 2); }
      if (!emis) { ctx.fillStyle = '#ddd4c4'; ctx.fillRect(0.6 * M, h - 2.8 * M, 7.0 * M, 2.4 * M); ctx.fillStyle = '#20283a'; ctx.fillRect(0.75 * M, h - 2.65 * M, 6.7 * M, 2.1 * M); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(0.75 * M, h - 2.65 * M, 3 * M, 1 * M); ctx.fillStyle = pick(['#b03a3a', '#2f6b3a', '#2b3a67', '#c98a2a']); for (let x = 0.4 * M; x < 7.4 * M; x += 0.6 * M) ctx.fillRect(x, h - 3.1 * M, 0.3 * M, 0.35 * M); ctx.fillRect(0.4 * M, h - 3.1 * M, 7.0 * M, 0.12 * M); }
      else { ctx.fillStyle = '#ffe6b0'; ctx.fillRect(0.75 * M, h - 2.65 * M, 6.7 * M, 2.1 * M); }
      door(8.4 * M, 1.1 * M, 2.3 * M, '#4a3a2a', false); win(10.2 * M, h - 2.5 * M, 1.2 * M, 1.3 * M, Math.random() < 0.4); return;
    }
    if (!emis) { ctx.fillStyle = '#3a3330'; ctx.fillRect(0.75 * M, h - 2.6 * M, 2.1 * M, 2.6 * M); for (let i = 0; i < 160; i++) { ctx.fillStyle = Math.random() < 0.5 ? '#6a5a50' : '#1e1a18'; ctx.fillRect((0.75 + Math.random() * 2.1) * M, h - Math.random() * 2.6 * M, 2, 2); } // Granitrahmen (Foto Hauseingang)
      ctx.fillStyle = '#7d7a76'; ctx.fillRect(0.9 * M, h - 2.45 * M, 1.8 * M, 2.45 * M); ctx.fillStyle = '#ecebe6'; ctx.fillRect(1.75 * M, h - 2.35 * M, 0.85 * M, 1.05 * M); ctx.fillRect(1.75 * M, h - 1.2 * M, 0.85 * M, 1.1 * M); ctx.fillRect(1.0 * M, h - 2.35 * M, 0.65 * M, 0.55 * M);
      ctx.fillStyle = '#3a2e28'; ctx.fillRect(1.0 * M, h - 1.7 * M, 0.65 * M, 1.6 * M); ctx.fillStyle = '#5a4a40'; for (let y = 0; y < 8; y++) for (let x = 0; x < 2; x++) ctx.fillRect((1.03 + x * 0.32) * M, h - (1.66 - y * 0.19) * M, 0.28 * M, 0.15 * M);
      ctx.fillStyle = '#9a9894'; ctx.fillRect(1.73 * M, h - 1.35 * M, 0.04 * M, 0.4 * M); ctx.fillStyle = '#1e1e22'; ctx.fillRect(3.0 * M, h - 1.9 * M, 0.35 * M, 0.45 * M); ctx.fillStyle = '#7fb8e8'; ctx.fillRect(3.04 * M, h - 1.86 * M, 0.27 * M, 0.37 * M); }
    else { ctx.fillStyle = '#d8d4c8'; ctx.fillRect(1.75 * M, h - 2.35 * M, 0.85 * M, 2.25 * M); }
    for (let q = 0; q < 3; q++) win((3.6 + q * 2.8) * M, h - 2.5 * M, 1.3 * M, 1.4 * M, Math.random() < 0.3);
    /* Keine Hausnummer in der geteilten Erdgeschoss-Textur: die Textur hängt an Hunderten Häusern, überall stand dieselbe Zahl (32 auf der Berger Straße, André 12.11.2026) */
  };
  return { map: canvasTex(512, 141, draw(false), 1 / GF_W, 1 / GF_H), emissiveMap: canvasTex(512, 141, draw(true), 1 / GF_W, 1 / GF_H) };
}
const roofTileTex = canvasTex(128, 128, (ctx, w, h) => { ctx.fillStyle = '#9a4f3a'; ctx.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 16) for (let x = (y / 16 % 2) * 16; x < w + 16; x += 32) { ctx.fillStyle = `rgba(0,0,0,${0.1 + Math.random() * 0.15})`; ctx.fillRect(x - 16, y, 32, 3); ctx.fillRect(x - 1, y, 2, 16); } }, 1 / 3, 1 / 3);
// Hilfen für Grundrisse
function polyArea(p) { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] * p[i][1] - p[i][0] * p[j][1]); return a / 2; }
function orientedBox(p) { // Achse = längste Kante
  let best = 0, ux = 1, uz = 0;
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; const dx = q[0] - p[i][0], dz = q[1] - p[i][1], l = dx * dx + dz * dz; if (l > best) { best = l; ux = dx / Math.sqrt(l); uz = dz / Math.sqrt(l); } }
  const vx = -uz, vz = ux; let umin = 1e9, umax = -1e9, vmin = 1e9, vmax = -1e9;
  for (const [x, z] of p) { const u = x * ux + z * uz, v = x * vx + z * vz; umin = Math.min(umin, u); umax = Math.max(umax, u); vmin = Math.min(vmin, v); vmax = Math.max(vmax, v); }
  const ratio = Math.abs(polyArea(p)) / ((umax - umin) * (vmax - vmin) || 1);
  return { ux, uz, vx, vz, umin, umax, vmin, vmax, ratio, pt: (u, v) => [ux * u + vx * v, uz * u + vz * v] };
}
const asphaltTex = canvasTex(256, 256, (ctx, w, h) => { ctx.fillStyle = '#56565b'; ctx.fillRect(0, 0, w, h); for (let i = 0; i < 6000; i++) { ctx.fillStyle = `rgba(${Math.random() < 0.5 ? 0 : 255},${Math.random() < 0.5 ? 0 : 255},${Math.random() < 0.5 ? 0 : 255},${Math.random() * 0.08})`; ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }, 1 / 6, 1 / 6);
const pavingTex = canvasTex(256, 256, (ctx, w, h) => { ctx.fillStyle = '#b3aca0'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 2; for (let i = 0; i <= 8; i++) { ctx.beginPath(); ctx.moveTo(i * w / 8, 0); ctx.lineTo(i * w / 8, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * h / 8); ctx.lineTo(w, i * h / 8); ctx.stroke(); } for (let i = 0; i < 3000; i++) { ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.07})`; ctx.fillRect(Math.random() * w, Math.random() * h, 3, 3); } }, 1 / 4, 1 / 4);
// Gezeichnete Bodenbeläge (12.11.2026). uv = Weltmeter, ein Bild = 2 m x 2 m (Wiederholung 1/2).
// Gehweg: Frankfurter Betonplatten 50 x 50 cm im Halbverband, leicht unterschiedliche Grautöne, feine Fugen.
const gehwegTex = canvasTex(512, 512, (ctx, w, h) => {
  const S = 128; let seed = 11; const r = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  ctx.fillStyle = '#8c8880'; ctx.fillRect(0, 0, w, h);
  const ton = []; for (let i = 0; i < 16; i++) ton.push(176 + Math.floor(r() * 16));
  for (let row = 0; row < 4; row++) for (let col = -1; col < 4; col++) {
    const x = col * S + (row % 2 ? S / 2 : 0), y = row * S; const g = ton[row * 4 + ((col + 4) % 4)];
    ctx.fillStyle = `rgb(${g},${g - 2},${g - 7})`; ctx.fillRect(x + 2, y + 2, S - 4, S - 4);
    for (let i = 0; i < 90; i++) { const a = r() < 0.5 ? 0.06 : -0.05; ctx.fillStyle = a > 0 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${-a})`; ctx.fillRect(x + 2 + r() * (S - 6), y + 2 + r() * (S - 6), 2, 2); }
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(x + 2, y + 2, S - 4, 2); ctx.fillRect(x + 2, y + 2, 2, S - 4);
  }
  for (let i = 0; i < 3; i++) { ctx.fillStyle = 'rgba(70,60,50,0.06)'; ctx.beginPath(); ctx.ellipse(r() * w, r() * h, 10 + r() * 24, 6 + r() * 14, r() * 3, 0, Math.PI * 2); ctx.fill(); }
}, 1 / 2, 1 / 2);
// Parkweg: wassergebundene Decke, beiger Sand mit feinem Splitt
const kiesTex = canvasTex(512, 512, (ctx, w, h) => {
  let seed = 7; const r = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  ctx.fillStyle = '#c7b08a'; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 14; i++) { ctx.fillStyle = `rgba(${r() < 0.5 ? '255,245,220' : '120,95,60'},0.07)`; ctx.beginPath(); ctx.ellipse(r() * w, r() * h, 30 + r() * 70, 20 + r() * 50, r() * 3, 0, Math.PI * 2); ctx.fill(); }
  for (let i = 0; i < 5000; i++) { const t = r(); ctx.fillStyle = t < 0.4 ? 'rgba(110,90,60,0.35)' : t < 0.75 ? 'rgba(235,225,200,0.5)' : 'rgba(150,140,125,0.45)'; const s = 1 + r() * 2.2; ctx.fillRect(r() * w, r() * h, s, s); }
}, 1 / 2, 1 / 2);
// Fahrbahn gezeichnet (12.11.2026): Asphalt mit feinem Splitt, vergossenen Rissen, zwei Flickstellen und einem Ölfleck.
// Ein Bild = 8 m x 8 m (uv = Weltmeter), Grundton wie die alte Fototextur (#5a5a54), damit die Abdunklung im Spiel gleich bleibt.
const fahrbahnTex = canvasTex(1024, 1024, (ctx, w, h) => {
  let seed = 0x9e3779b9; const r = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let q = Math.imul(seed ^ seed >>> 15, 1 | seed); q = q + Math.imul(q ^ q >>> 7, 61 | q) ^ q; return ((q ^ q >>> 14) >>> 0) / 4294967296; }; /* mulberry32: ohne Streifenmuster */
  ctx.fillStyle = '#5b5b56'; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) { ctx.fillStyle = r() < 0.5 ? 'rgba(255,255,250,0.035)' : 'rgba(0,0,0,0.05)'; ctx.beginPath(); ctx.ellipse(r() * w, r() * h, 60 + r() * 160, 40 + r() * 120, r() * 3, 0, Math.PI * 2); ctx.fill(); }
  // Flickstellen: leicht dunklere, kantige Rechtecke mit Fugenrand
  for (const [x, y, ww, hh] of [[120, 610, 230, 140], [690, 180, 150, 260]]) { ctx.fillStyle = 'rgba(20,20,22,0.12)'; ctx.fillRect(x, y, ww, hh); ctx.strokeStyle = 'rgba(15,15,15,0.3)'; ctx.lineWidth = 2; ctx.strokeRect(x, y, ww, hh); }
  // Splitt
  for (let i = 0; i < 52000; i++) { const t = r(); ctx.fillStyle = t < 0.45 ? 'rgba(25,25,25,0.45)' : t < 0.85 ? 'rgba(150,150,145,0.35)' : 'rgba(205,200,190,0.35)'; const s = 1 + r() * 1.8; ctx.fillRect(r() * w, r() * h, s, s); }
  // Vergossene Risse (Bitumen), leicht wellig
  ctx.strokeStyle = 'rgba(28,28,26,0.75)'; ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) { let x = r() * w, y = r() * h, a = r() * 6.3; ctx.lineWidth = 3 + r() * 3; ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < 14; k++) { a += (r() - 0.5) * 0.9; x += Math.cos(a) * 18; y += Math.sin(a) * 18; ctx.lineTo(x, y); } ctx.stroke(); }
  asphaltRisse(ctx, w, h, r); // Worley-Rissnetz (#153)
  // Ölfleck
  { const g = ctx.createRadialGradient(470, 820, 4, 470, 820, 70); g.addColorStop(0, 'rgba(10,10,12,0.35)'); g.addColorStop(1, 'rgba(10,10,12,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(470, 820, 80, 55, 0.4, 0, Math.PI * 2); ctx.fill(); }
}, 1 / 8, 1 / 8);
// Fahrbahnmarkierung und Kanaldeckel, gezeichnet (12.11.2026)
const markTex = canvasTex(32, 256, (ctx, w, h) => { let s = 5; const r = () => (s = Math.imul(s ^ s >>> 15, 0x2c1b3c6d) + 0x6D2B79F5 | 0, ((s ^ s >>> 13) >>> 0) / 4294967296);
  ctx.clearRect(0, 0, w, h); ctx.fillStyle = 'rgba(236,230,210,0.82)'; ctx.fillRect(2, 4, w - 4, h - 8);
  ctx.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 260; i++) { ctx.fillStyle = `rgba(0,0,0,${0.3 + r() * 0.7})`; const z = 1 + r() * 4; ctx.fillRect(r() * w, r() * h, z, z * (1 + r() * 2)); } ctx.globalCompositeOperation = 'source-over'; }, 1, 1);
markTex.wrapS = markTex.wrapT = THREE.ClampToEdgeWrapping;
// Straßen-Optik (#153): Markierung, Belag, Kleinteile, Bordsteinecken, Nässe in strassen.js
const STR = initStrassen({ THREE, TH: (x, z) => TH(x, z), onOtherRoad: (...a) => onOtherRoad(...a), nearestRoadDir: (...a) => nearestRoadDir(...a), get LOW() { return LOW_GFX; }, get opts() { return opts; }, get weather() { return weather; }, get camera() { return camera; } });
const roofTex = canvasTex(128, 128, (ctx, w, h) => { ctx.fillStyle = '#7d6b62'; ctx.fillRect(0, 0, w, h); for (let i = 0; i < 2000; i++) { ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }, 1 / 5, 1 / 5);


// ---------- Details: Schilder, Zäune, Hecken, Balkone, Büsche, Haltestellen, Möbel, Zebrastreifen ----------
function edgeNormal(poly, i) { const sgn = polyArea(poly) > 0 ? 1 : -1; const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length]; const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1; return { nx: dz / l * sgn, nz: -dx / l * sgn, dx, dz, l, ax, az, bx, bz }; }
function nearestEdge(x, z, maxD = 20) { // nächste Gebäudekante über das Kollisionsraster
  let best = maxD * maxD, res = null; const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const cell = grid.get(key(cx + i, cz + j)); if (!cell) continue; for (const bi of cell) { const b = WORLD.buildings[bi]; for (let e = 0; e < b.p.length; e++) { const q = b.p[(e + 1) % b.p.length]; const d = distSegSq(x, z, b.p[e][0], b.p[e][1], q[0], q[1]); if (d < best) { best = d; res = { b, e, bi }; } } } }
  return res;
}
const SIGN_STYLES = { pharmacy: ['#c8102e', '#ffffff'], bank: ['#1a4f9c', '#ffffff'], cafe: ['#5b3a1e', '#f6e7c8'], restaurant: ['#2b2b2b', '#f2d16b'], fast_food: ['#d8471c', '#ffffff'], bakery: ['#d99a2b', '#3a2a10'], bar: ['#1f1f2e', '#ff6f91'], pub: ['#163a2a', '#e8d9a0'], supermarket: ['#1d6fb8', '#ffffff'], convenience: ['#2a7f3e', '#ffffff'], hairdresser: ['#7a2e8e', '#ffffff'], clothes: ['#222222', '#ffffff'], kiosk: ['#c4342d', '#ffe9a0'], florist: ['#2f7d4a', '#ffd1dc'], ice_cream: ['#ff9ab3', '#3a1a2a'], doctors: ['#ffffff', '#1a4f9c'], dentist: ['#ffffff', '#1a8f8f'], post_office: ['#ffcc00', '#000000'], butcher: ['#b3272d', '#ffffff'], books: ['#3a3a7a', '#ffffff'], optician: ['#ffffff', '#222222'], beauty: ['#c77dba', '#ffffff'], chemist: ['#1a5fb4', '#ffffff'], default: ['#2b3a67', '#ffffff'] };
// Flächen aufs Gelände legen: Dreiecke teilen, bis sie dem Gelände auf ~10 cm folgen (flache Stellen bleiben grob)
function drape(geo, lift, minLen = 2.5, tol = 0.1, maxLen = 40, withUV = false) { // maxLen: Kanten darüber werden immer geteilt; die Prüfung an Kantenmitten und Schwerpunkt übersieht sonst Buckel im 4-m-Raster
  const src = geo.index ? geo.toNonIndexed() : geo; const p = src.attributes.position; const out = []; const H = (x, z) => TH(x, z) + lift;
  const tri = (a, b, c, depth) => { const ha = H(a[0], a[1]), hb = H(b[0], b[1]), hc = H(c[0], c[1]);
    const lab = Math.hypot(a[0] - b[0], a[1] - b[1]), lbc = Math.hypot(b[0] - c[0], b[1] - c[1]), lca = Math.hypot(c[0] - a[0], c[1] - a[1]); const L = Math.max(lab, lbc, lca);
    if (L > minLen && depth < 14) { const m = (u, v) => [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2]; const ce = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
      const dev = Math.max(Math.abs(H(...m(a, b)) - (ha + hb) / 2), Math.abs(H(...m(b, c)) - (hb + hc) / 2), Math.abs(H(...m(c, a)) - (hc + ha) / 2), Math.abs(H(...ce) - (ha + hb + hc) / 3));
      if (dev > tol || L > maxLen) { if (L === lab) { const q = m(a, b); tri(a, q, c, depth + 1); tri(q, b, c, depth + 1); } else if (L === lbc) { const q = m(b, c); tri(a, b, q, depth + 1); tri(a, q, c, depth + 1); } else { const q = m(c, a); tri(a, b, q, depth + 1); tri(q, b, c, depth + 1); } return; } }
    out.push(a[0], ha, a[1], b[0], hb, b[1], c[0], hc, c[1]); };
  for (let i = 0; i < p.count; i += 3) tri([p.getX(i), p.getZ(i)], [p.getX(i + 1), p.getZ(i + 1)], [p.getX(i + 2), p.getZ(i + 2)], 0);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  if (withUV) { const uv = new Float32Array(out.length / 3 * 2); for (let i = 0, j = 0; i < out.length; i += 3, j += 2) { uv[j] = out[i]; uv[j + 1] = out[i + 2]; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); }
  g.computeVertexNormals(); return g;
}
// Zäune, Mauern, Hecken einer Kachel. Eigene Funktion, damit auch der Sparmodus (ohne buildDetails) sie baut:
// sonst gab es dort weder Bild noch Kollision (Nachttest 12.11.2026).
function* buildFences() { // Generator: gibt je 3 Stücke den Hauptthread frei (#173)
  // --- Zäune, Mauern, Hecken ---
  const fenceRail = [], fencePost = [], wall = [], hedge = [], rwall = [];
  // Stücke bis 4 m, jedes auf dem Gelände: lange gerade Kästen lagen über Kuppen im Boden (Hindernis ohne Bild)
  const BSEG = barrierSegs(CITY); if (BUILD_TILE) barrierRegister(BUILD_TILE, BSEG);
  for (const [ax, az, bx, bz, k] of BSEG) { if (++YC % 3 === 0) yield; const L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / 4), ang = Math.atan2(bx - ax, bz - az);
    for (let j = 0; j < n; j++) { const px = ax + (bx - ax) * j / n, pz = az + (bz - az) * j / n, qx = ax + (bx - ax) * (j + 1) / n, qz = az + (bz - az) * (j + 1) / n, l = L / n, mx = (px + qx) / 2, mz = (pz + qz) / 2; const ty = TH(mx, mz), slope = Math.atan2(TH(px, pz) - TH(qx, qz), l);
      const box = (w, h, d, y, arr) => { const g = new THREE.BoxGeometry(w, h, d); g.rotateX(slope); g.rotateY(ang); g.translate(mx, ty + y, mz); arr.push(g); };
      if (k === 'fence') { box(0.05, 0.07, l, 1.2, fenceRail); box(0.05, 0.07, l, 0.65, fenceRail); box(0.05, 0.07, l, 0.15, fenceRail); for (const [x, z] of j === n - 1 ? [[px, pz], [qx, qz]] : [[px, pz]]) { const g = new THREE.BoxGeometry(0.09, 1.3, 0.09); g.translate(x, TH(x, z) + 0.65, z); fencePost.push(g); } }
      else if (k === 'wall' || k === 'city_wall') box(0.3, 1.7, l, 0.85, wall);
      else if (k === 'retaining_wall') box(0.4, 1.0, l, 0.5, rwall);
      else if (k === 'hedge') box(0.8, 1.3, l, 0.65, hedge);
    } }
  const addMerged = (arr, mat, shadow = true) => { if (!arr.length) return; const m = new THREE.Mesh(mergeGeometries(arr), mat); m.castShadow = shadow; m.receiveShadow = true; scene.add(m); };
  addMerged(fenceRail, shLambert(0x55575a), false); addMerged(fencePost, shLambert(0x55575a), false);
  addMerged(wall, shLambert(0x9a9388)); addMerged(rwall, shLambert(0x8a847a)); addMerged(hedge, shLambert(0x3f6f2f));
}
function* buildDetails() {
  // --- Schilder: ein Atlas, ein Mesh ---
  const items = [];
  for (const poi of CITY.pois) { const ne = nearestEdge(poi.x, poi.z, 18); if (ne) items.push({ n: poi.n, k: poi.k, b: ne.b, e: ne.e, px: poi.x, pz: poi.z }); }
  for (const b of CITY.buildings) if (b.n && (b.k === 'public' || b.k === 'hall' || b.k === 'church' || b.shop)) { let e = 0, best = 0; for (let i = 0; i < b.p.length; i++) { const l = edgeNormal(b.p, i).l; if (l > best) { best = l; e = i; } } items.push({ n: b.n, k: b.shop || b.k, b, e, px: null }); }
  const COLS = 8, ROWS = Math.max(1, Math.min(64, Math.ceil(items.length / 8))), CW = 256, CH = 32; const atlas = document.createElement('canvas'); atlas.width = COLS * CW; atlas.height = ROWS * CH; const ac = atlas.getContext('2d');
  const sv = [], suv = [], sn = []; let si = 0;
  for (const it of items.slice(0, COLS * ROWS)) {
    const col = si % COLS, row = Math.floor(si / COLS); const [bg, fg] = /Waschsalon|Eco.?Express/i.test(it.n) ? ['#ffffff', '#1a8a8a'] : /Frisier|Friseur/i.test(it.n) ? ['#f4f1ea', '#2a1a14'] : /Trinkhalle|Wasserhäusche/i.test(it.n) ? ['#f2efe6', '#2a2a2a'] : /Sparkasse|1822/i.test(it.n) ? ['#e2001a', '#ffffff'] : /^nahkauf$/i.test(it.n) ? ['#d8101c', '#ffffff'] : /Eifler/.test(it.n) ? ['#b6ff2e', '#e0141c'] : /D[öo]neria/.test(it.n) ? ['#dff5ec', '#d4165a'] : SIGN_STYLES[it.k] || SIGN_STYLES.default;
    ac.fillStyle = bg; ac.fillRect(col * CW, row * CH, CW, CH); ac.fillStyle = fg; let fs = 20; ac.font = `bold ${fs}px Arial, sans-serif`; let txt = it.n.length > 26 ? it.n.slice(0, 25) + '…' : it.n; while (ac.measureText(txt).width > CW - 12 && fs > 9) { fs--; ac.font = `bold ${fs}px Arial, sans-serif`; } ac.textBaseline = 'middle'; ac.textAlign = 'center'; ac.fillText(txt, col * CW + CW / 2, row * CH + CH / 2 + 1);
    const en = edgeNormal(it.b.p, it.e); const w = Math.min(en.l - 0.6, Math.max(2.4, txt.length * 0.32)); if (w < 1.5) { si++; continue; }
    let t = 0.5; if (it.px !== null) t = clamp(((it.px - en.ax) * en.dx + (it.pz - en.az) * en.dz) / (en.l * en.l), (w / 2 + 0.2) / en.l, 1 - (w / 2 + 0.2) / en.l);
    const mx = en.ax + en.dx * t, mz = en.az + en.dz * t; const ux = en.dx / en.l, uz = en.dz / en.l; const off = 0.14; const y0 = (it.b.base || 0) + 2.75, y1 = y0 + 0.65;
    const A = [mx - ux * w / 2 + en.nx * off, y0, mz - uz * w / 2 + en.nz * off], B = [mx + ux * w / 2 + en.nx * off, y0, mz + uz * w / 2 + en.nz * off], C = [B[0], y1, B[2]], D = [A[0], y1, A[2]];
    const flip = (ux * en.nz - uz * en.nx) < 0; const u0 = flip ? (col + 1) / COLS : col / COLS, u1 = flip ? col / COLS : (col + 1) / COLS, v1 = 1 - row / ROWS, v0 = 1 - (row + 1) / ROWS;
    const tri = (P, Q, R, a, b, c) => { sv.push(...P, ...Q, ...R); suv.push(...a, ...b, ...c); sn.push(en.nx, 0, en.nz, en.nx, 0, en.nz, en.nx, 0, en.nz); };
    tri(A, B, C, [u0, v0], [u1, v0], [u1, v1]); tri(A, C, D, [u0, v0], [u1, v1], [u0, v1]); si++;
  }
  if (sv.length) { const tex = new THREE.CanvasTexture(atlas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = ANISO; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(sv, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(sn, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(suv, 2)); { const mt = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }); mt.userData.ownTex = true; scene.add(new THREE.Mesh(g, mt)); } }
  yield* buildFences(); // Zäune: Bild und Kollision aus einer Quelle, eigener Schritt (läuft auch im Sparmodus)
  const addMerged = (arr, mat, shadow = true) => { if (!arr.length) return null; const m = new THREE.Mesh(mergeGeometries(arr), mat); m.castShadow = shadow; m.receiveShadow = true; scene.add(m); return m; };
  // --- Schulhöfe ---
  const yard = []; for (const a of CITY.areas) { const shape = new THREE.Shape(a.p.map(([x, z]) => new THREE.Vector2(x, -z))); const geo = new THREE.ShapeGeometry(shape); geo.rotateX(-Math.PI / 2); yard.push(drape(geo, 0.06, 2.5, 0.05, 10)); }
  addMerged(yard, shLambert(0x8f8d88), false);
  // --- Balkone ---
  const slab = [], rail = [];
  if (opts.quality !== 'niedrig') for (const b of CITY.buildings) { if (++YC % 3 === 0) yield; if (b.mh >= 2.2 || (b.k && b.k !== 'res') || b.h < 9 || Math.random() > 0.4) continue; let e = 0, best = 0; for (let i = 0; i < b.p.length; i++) { const l = edgeNormal(b.p, i).l; if (l > best) { best = l; e = i; } } if (best < 8) continue; const en = edgeNormal(b.p, e); const ux = en.dx / en.l, uz = en.dz / en.l; const floors = Math.min(5, Math.floor((b.h - 1) / 3.2)); const ang = Math.atan2(en.nx, en.nz);
    for (let f = 1; f < floors; f++) for (let d = 3; d < en.l - 2; d += 5.5) { const x = en.ax + ux * d + en.nx * 0.6, z = en.az + uz * d + en.nz * 0.6; const y = (b.base || 0) + f * 3.2 + 0.1; const g = new THREE.BoxGeometry(2.2, 0.14, 1.2); g.rotateY(ang); g.translate(x, y, z); slab.push(g); const r = new THREE.BoxGeometry(2.2, 0.95, 0.05); r.rotateY(ang); r.translate(x + en.nx * 0.58, y + 0.55, z + en.nz * 0.58); rail.push(r); } }
  addMerged(slab, shLambert(0xd8d2c8)); addMerged(rail, shLambert(0x3b3f44), false);
  // --- Büsche ---
  const bushPts = []; let tries = 0;
  while (CITY.green.length && bushPts.length < Math.min(900, CITY.green.length * 6) && tries++ < 20000) { const g = pick(CITY.green); if (!['garden', 'allotments', 'park', 'grass', 'scrub', 'wood', 'meadow', 'forest'].includes(g.k)) continue; const xs = g.p.map(p => p[0]), zs = g.p.map(p => p[1]); const x = rnd(Math.min(...xs), Math.max(...xs)), z = rnd(Math.min(...zs), Math.max(...zs)); if (pointInPoly(x, z, g.p) && solidAt(x, z) < 0 && waterAt(x, z) === null && deckAt(x, z, 1e9, 0) === null) bushPts.push([x, z]); }
  if (bushPts.length) { const bg = opts.quality === 'niedrig' ? (BUSH_LOW_G || (BUSH_LOW_G = Object.assign(new THREE.IcosahedronGeometry(0.7, 0), { userData: { shared: true } }))) : (BUSH_HI_G || (BUSH_HI_G = Object.assign(new THREE.IcosahedronGeometry(0.7, 1), { userData: { shared: true } }))); const bm = new THREE.InstancedMesh(bg, shLambert(0x4a7d3a), bushPts.length); const o = new THREE.Object3D(); bushPts.forEach(([x, z], i) => { const sc = rnd(0.6, 1.3); o.position.set(x, TH(x, z) + sc * 0.45, z); o.scale.set(sc * rnd(0.9, 1.4), sc * 0.8, sc); o.rotation.y = Math.random() * 6; o.updateMatrix(); bm.setMatrixAt(i, o.matrix); }); bm.castShadow = true; bm.computeBoundingSphere(); scene.add(bm); }
  // --- Haltestellen ---
  const nearRail = (x, z) => (CITY.rails || []).some(r => r.k !== 'platform' && r.p.some((q, i) => i < r.p.length - 1 && (() => { const [ax, az] = q, dx = r.p[i + 1][0] - ax, dz = r.p[i + 1][1] - az, l = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l)); return (ax + t * dx - x) ** 2 + (az + t * dz - z) ** 2 < 400; })())); // gleiche Schwelle wie railDir in graeber.js
  // OSM setzt viele Halte als Haltepunkt auf die Fahrbahn (Reichsburgstraße, André 12.11.2026): Mast an den Rand schieben
  for (const st of CITY.stops) if (!st.off) { const [qx, qz] = pushOffRoads(st.x, st.z, 0.9); if (!Number.isNaN(qx) && Math.hypot(qx - st.x, qz - st.z) < 15) { st.x = qx; st.z = qz; } st.off = true; }
  const poles = [], signsB = [], signsT = [], shelterG = [], shelterRoof = [];
  { const ls = [], lv = [], luv = []; for (const st of CITY.stops) { if (st.k !== 'bus' || solidAt(st.x, st.z) >= 0 || ls.length >= 64) continue; const refs = [...new Set(BUSLINES.filter(L => L.s.some(q => Math.hypot(q[0] - st.x, q[1] - st.z) < 35)).map(L => L.ref))].slice(0, 4); if (!refs.length) continue; const n = ls.length; ls.push(refs.join(' ')); const ty = TH(st.x, st.z), w = 0.5; const A = [st.x - w, ty + 2.2, st.z + 0.03], B = [st.x + w, ty + 2.2, st.z + 0.03], Cc = [st.x + w, ty + 2.42, st.z + 0.03], D = [st.x - w, ty + 2.42, st.z + 0.03]; const v0 = 1 - (n + 1) / 64, v1 = 1 - n / 64; lv.push(...A, ...B, ...Cc, ...A, ...Cc, ...D); luv.push(0, v0, 1, v0, 1, v1, 0, v0, 1, v1, 0, v1); }
    if (lv.length) { const tex = canvasTex(128, 2048, (c, w) => { ls.forEach((s, r) => { c.fillStyle = '#ffffff'; c.fillRect(0, r * 32, w, 32); c.fillStyle = '#c0182a'; c.font = 'bold 22px Arial'; c.fillText(s, 6, r * 32 + 24); }); }, 1, 1); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(lv, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(luv, 2)); g.computeVertexNormals(); scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }))); } } // Liniennummern an der Haltestelle (aus den OSM-Linien)
  for (const st of CITY.stops) { if (solidAt(st.x, st.z) >= 0) continue; if (st.k === 'tram' && nearRail(st.x, st.z)) continue; /* Tramhalt mit Gleis bekommt das Modell aus graeber.js samt grünem H-Mast (13.11.2026) */ const ty = TH(st.x, st.z); const p = new THREE.CylinderGeometry(0.05, 0.05, 3.0, 6); p.translate(st.x, ty + 1.5, st.z); poles.push(p); const sg = new THREE.BoxGeometry(0.55, 0.55, 0.05); sg.translate(st.x, ty + 2.75, st.z); (st.k === 'bus' ? signsB : signsT).push(sg);
    if (st.k === 'bus' && Math.random() < 0.6) { const ne = nearestRoadDir(st.x, st.z); const ang = ne ? ne.ang : 0; let ox = -Math.cos(ang) * 1.6, oz = Math.sin(ang) * 1.6; if (onOtherRoad(st.x + ox, st.z + oz, null, 0.8)) { ox = -ox; oz = -oz; } const cx = st.x + ox, cz = st.z + oz; if (onOtherRoad(cx, cz, null, 0.8)) continue; if (solidAt(cx, cz) < 0) { const roof = new THREE.BoxGeometry(3.6, 0.12, 1.6); roof.rotateY(ang); roof.translate(cx, ty + 2.5, cz); shelterRoof.push(roof); const back = new THREE.BoxGeometry(3.6, 2.2, 0.06); back.rotateY(ang); back.translate(cx + ox * 0.45, ty + 1.3, cz + oz * 0.45); shelterG.push(back); for (const sgn of [-1, 1]) { const post = new THREE.BoxGeometry(0.08, 2.5, 0.08); post.translate(cx + Math.sin(ang) * 1.7 * sgn + ox * 0.45, ty + 1.25, cz + Math.cos(ang) * 1.7 * sgn + oz * 0.45); poles.push(post); } } } }
  addMerged(poles, shLambert(0x444444), false); addMerged(signsB, shBasic(0x2e9c3a)); addMerged(signsT, shBasic(0x1e5fb4));
  addMerged(shelterRoof, shLambert(0x9aa0a8)); if (shelterG.length) { if (!SHELTER_GLASS_MAT) { SHELTER_GLASS_MAT = new THREE.MeshLambertMaterial({ color: 0x9fc4e8, transparent: true, opacity: 0.45 }); SHELTER_GLASS_MAT.userData.shared = true; } const m = new THREE.Mesh(mergeGeometries(shelterG), SHELTER_GLASS_MAT); scene.add(m); }
  // --- Möbel ---
  const benchW = [], bins = [], bikes = [], vend = [], recyc = [], kleid = [], kleidF = [], ringW = [], ringB = [], ringG = [], post = [], fount = [], fountW = [];
  // Stadtmöbel (Fahrradständer, Bänke, Poller, Mülleimer …) nie auf der Fahrbahn: OSM-Punkte liegen oft auf der Straßenlinie
  // (Rödelheim, André 12.11.2026). Einmal an den Rand schieben, höchstens 12 m, sonst weglassen
  for (const f of CITY.furniture) if (!f.off) { const [qx, qz] = pushOffRoads(f.x, f.z, 0.7); if (Number.isNaN(qx) || Math.hypot(qx - f.x, qz - f.z) > 12) f.skip = true; else { f.x = qx; f.z = qz; } f.off = true; }
  for (const f of CITY.furniture) { if (++YC % 3 === 0) yield; if (f.skip || solidAt(f.x, f.z) >= 0) continue; const ty = f.k === 'fountain' ? TH(f.x, f.z) : footTH(f.x, f.z, f.k === 'bench' ? 0.8 : 0.3); const S = FOOT_SINK; const ne = nearestRoadDir(f.x, f.z); const ang = ne ? ne.ang : Math.random() * 6;
    const bx = (w, h, d, y, arr, ox = 0, oz = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.rotateY(ang); g.translate(f.x + ox, ty + y, f.z + oz); arr.push(g); };
    if (f.k === 'bench') { bx(1.6, 0.06, 0.45, 0.45, benchW); bx(1.6, 0.42, 0.05, 0.72, benchW, -Math.cos(ang) * 0.2, Math.sin(ang) * 0.2); bx(0.08, 0.45 + S, 0.4, 0.225 - S / 2, benchW, Math.sin(ang) * 0.7, Math.cos(ang) * 0.7); bx(0.08, 0.45 + S, 0.4, 0.225 - S / 2, benchW, -Math.sin(ang) * 0.7, -Math.cos(ang) * 0.7); }
    else if (f.k === 'waste_basket') { const g = new THREE.CylinderGeometry(0.2, 0.17, 1.0 + S, 8); g.translate(f.x, ty + (1.0 - S) / 2, f.z); bins.push(g); }
    else if (f.k === 'bicycle_parking') { if (Math.random() < 0.5) { for (const o of [-0.5, 0, 0.5]) bx(0.05, 0.75, 0.7, 0.4, bikes, Math.sin(ang) * o, Math.cos(ang) * o); }
      // abgestellte Räder (Kulisse, gemergt): zwei Reifen und ein Rahmen quer zum Bügel
      for (const o of [-0.5, 0.5]) if (Math.random() < 0.55) { const ox = Math.sin(ang) * o, oz = Math.cos(ang) * o; for (const a of [0.55, -0.55]) { const g = new THREE.TorusGeometry(BIKE_R, 0.035, 5, 12); g.rotateY(ang); g.translate(f.x + ox + Math.cos(ang) * a, ty + BIKE_R, f.z + oz - Math.sin(ang) * a); bikes.push(g); } bx(1.0, 0.03, 0.03, 0.62, bikes, ox, oz); bx(0.03, 0.6, 0.03, 0.6, bikes, ox - Math.cos(ang) * 0.2, oz + Math.sin(ang) * 0.2); bx(0.03, 0.55, 0.03, 0.62, bikes, ox + Math.cos(ang) * 0.3, oz - Math.sin(ang) * 0.3); } }
    else if (f.k === 'vending_machine') { if (Math.random() < 0.3) bx(0.8, 1.8 + S, 0.6, (1.8 - S) / 2, vend); }
    else if (f.k === 'recycling') { // Glas- und Altkleidercontainer (Fotos): nur auf Gehweg oder Grünstreifen
      const lx = Math.cos(ang), lz = -Math.sin(ang), nx2 = Math.sin(ang), nz2 = Math.cos(ang); let px = f.x, pz = f.z; if (onOtherRoad(px, pz, null, 0.8)) { let ok = false; for (const s of [2.5, -2.5, 4, -4]) { const qx = f.x + nx2 * s, qz = f.z + nz2 * s; if (!onOtherRoad(qx, qz, null, 0.8) && solidAt(qx, qz) < 0) { px = qx; pz = qz; ok = true; break; } } if (!ok) continue; }
      const y0 = TH(px, pz); for (const [k, ring] of [[-0.8, ringW], [0, ringB], [0.8, ringG]]) { const x = px + lx * k, z = pz + lz * k; const c = new THREE.CylinderGeometry(0.42, 0.46, 1.45, 12); c.translate(x, y0 + 0.73, z); recyc.push(c); const d = new THREE.SphereGeometry(0.42, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); d.translate(x, y0 + 1.45, z); recyc.push(d); const r2 = new THREE.TorusGeometry(0.2, 0.05, 6, 14); r2.rotateX(Math.PI / 2); r2.translate(x, y0 + 1.86, z); ring.push(r2); const lb = new THREE.CylinderGeometry(0.43, 0.43, 0.12, 12, 1, true); lb.translate(x, y0 + 1.25, z); ring.push(lb); }
      { const kx = px + lx * 2.6, kz = pz + lz * 2.6; if (!onOtherRoad(kx, kz, null, 0.5) && solidAt(kx, kz) < 0) { const g = new THREE.BoxGeometry(1.4, 1.9, 1.2); g.rotateY(ang); g.translate(kx, y0 + 0.95, kz); kleid.push(g); const h = new THREE.BoxGeometry(1.2, 0.08, 0.7); h.rotateX(-0.5); h.rotateY(ang); h.translate(kx - nx2 * 0.25, y0 + 1.75, kz - nz2 * 0.25); kleid.push(h); for (const s of [1, -1]) { const p = new THREE.PlaneGeometry(1.1, 1.1); p.rotateY(ang + (s > 0 ? 0 : Math.PI)); p.translate(kx + nx2 * 0.61 * s, y0 + 0.75, kz + nz2 * 0.61 * s); kleidF.push(p); } } } } /* Glascontainer blau, Altkleider rot (Foto) */
    else if (f.k === 'post_box') { bx(0.5, 1.1 + S, 0.4, (1.1 - S) / 2, post); }
    else if (f.k === 'fountain') { /* Becken mit Rand, Wasser, Säule, Schale und Wasserfontäne (12.11.2026) */ const L2 = (p, s) => new THREE.LatheGeometry(p.map(([r, h]) => new THREE.Vector2(r, h)), s);
      const b = L2([[2.0, 0], [2.3, 0], [2.3, 0.5], [2.45, 0.56], [2.45, 0.64], [2.1, 0.64], [2.1, 0.5], [2.0, 0.42]], 20); b.translate(f.x, ty, f.z); fount.push(b);
      const s = L2([[0, 0], [0.32, 0], [0.24, 0.3], [0.2, 1.2], [0.75, 1.35], [0.85, 1.5], [0.7, 1.52], [0.16, 1.45], [0.14, 1.9], [0.24, 2.0], [0, 2.1]], 12); s.translate(f.x, ty, f.z); fount.push(s);
      const w = new THREE.CircleGeometry(2.05, 20); w.rotateX(-Math.PI / 2); w.translate(f.x, ty + 0.4, f.z); fountW.push(w); const w2 = new THREE.CircleGeometry(0.72, 12); w2.rotateX(-Math.PI / 2); w2.translate(f.x, ty + 1.47, f.z); fountW.push(w2);
      const jet = L2([[0, 2.05], [0.06, 2.05], [0.05, 2.75], [0.22, 2.95], [0.38, 2.55], [0.44, 1.5], [0.38, 1.5], [0.32, 2.45], [0.16, 2.8], [0, 2.98]], 10); jet.translate(f.x, ty, f.z); fountW.push(jet); }
  }
  addMerged(benchW, shLambert(0x8b5a2b)); addMerged(bins, shLambert(0x2f3a2f), false); addMerged(bikes, shLambert(0x777777), false); addMerged(vend, shLambert(0xc0392b)); addMerged(recyc, shLambert(0x22325e)); addMerged(kleid, shLambert(0xc8201e)); if (kleidF.length) addMerged(kleidF, KLEID_MAT || (KLEID_MAT = Object.assign(new THREE.MeshLambertMaterial({ map: canvasTex(128, 128, (c, w, h) => { c.fillStyle = '#f4f4f0'; c.fillRect(0, 0, w, h); c.fillStyle = '#c8201e'; c.font = 'bold 22px Arial'; c.textAlign = 'center'; c.fillText('DANKE!', w / 2, 30); c.font = 'bold 14px Arial'; c.fillText('ALTKLEIDER', w / 2, 52); c.fillText('SCHUHE', w / 2, 68); c.fillStyle = '#a0a0a0'; for (let y = 80; y < 122; y += 6) c.fillRect(12, y, w - 24, 2); }, 1, 1) }), { userData: { shared: true } })), false); addMerged(ringW, shLambert(0xf2f2ee), false); addMerged(ringB, shLambert(0x8a5a2a), false); addMerged(ringG, shLambert(0x3a9a4a), false); addMerged(post, shLambert(0xffcc00)); addMerged(fount, shLambert(0xb5aa96)); addMerged(fountW, new THREE.MeshLambertMaterial({ color: 0x3f7fa8, emissive: 0x1d4a66, emissiveIntensity: 0.5 }), false);
  // --- Zebrastreifen ---
  const zebra = [];
  for (const c of CITY.crossings) { let x = c.x, z = c.z; if (c.p) { const m = c.p[Math.floor(c.p.length / 2)]; x = m[0]; z = m[1]; } if (x === undefined || STR.anAmpel(x, z, CITY.signals)) continue; /* an Ampeln Fußgängerfurt statt Zebra (#153) */ const nr = nearestRoadDir(x, z, 7); if (!nr || nr.w < 5) continue; const ang = nr.ang; for (let k = -2.5; k <= 2.5; k++) { const sx = nr.x + Math.sin(ang) * k * 1.0, sz = nr.z + Math.cos(ang) * k * 1.0; const g = new THREE.PlaneGeometry(nr.w - 0.6, 0.5); g.rotateX(-Math.PI / 2); g.rotateY(ang + Math.PI / 2); g.translate(sx, TH(sx, sz) + 0.055, sz); zebra.push(g); } }
  addMerged(zebra, shLambert(0xe9e6dc), false);
  // --- Straßenschilder an Einmündungen (Frankfurter Art: dunkelblau, weiße Schrift) und Poller an den Ecken (Fotos 12.11.2026) ---
  { const ends = []; const seen = new Set();
    for (const r of CITY.roads) { if (!r.n || r.ped || r.mw || r.w < 5) continue; for (const [P, Q] of [[r.p[0], r.p[1]], [r.p[r.p.length - 1], r.p[r.p.length - 2]]]) { const sl = Math.hypot(Q[0] - P[0], Q[1] - P[1]); if (sl < 12) continue; const iux = (Q[0] - P[0]) / sl, iuz = (Q[1] - P[1]) / sl; const k = Math.round(P[0] / 25) + ',' + Math.round(P[1] / 25) + r.n; if (seen.has(k)) continue; seen.add(k); ends.push({ x: P[0] + iux * 8, z: P[1] + iuz * 8, n: r.n, r, ux: iux, uz: iuz }); } }
    const list = ends.slice(0, 96); const COLS = 4, ROWS = Math.max(1, Math.ceil(list.length / COLS)), CW = 256, CH = 48; const at = document.createElement('canvas'); at.width = COLS * CW; at.height = ROWS * CH; const ac = at.getContext('2d');
    const poles = [], sv = [], suv = [], bol = [];
    list.forEach((e, i) => { const col = i % COLS, row = Math.floor(i / COLS); ac.fillStyle = '#16233f'; ac.fillRect(col * CW, row * CH, CW, CH); ac.strokeStyle = '#e8e8e8'; ac.lineWidth = 3; ac.strokeRect(col * CW + 4, row * CH + 4, CW - 8, CH - 8); ac.fillStyle = '#f2f2f2'; let fs = 26; ac.font = `bold ${fs}px Arial`; while (ac.measureText(e.n).width > CW - 20 && fs > 10) { fs--; ac.font = `bold ${fs}px Arial`; } ac.textAlign = 'center'; ac.textBaseline = 'middle'; ac.fillText(e.n, col * CW + CW / 2, row * CH + CH / 2 + 1);
      const ux = e.ux, uz = e.uz; const sx = e.x - uz * (e.r.w / 2 + 1.4), sz = e.z + ux * (e.r.w / 2 + 1.4); if (solidAt(sx, sz) >= 0 || onOtherRoad(sx, sz, null, 0.8)) return; const y = TH(sx, sz);
      const pg = new THREE.CylinderGeometry(0.04, 0.04, 2.9, 5); pg.translate(sx, y + 1.45, sz); poles.push(pg);
      const u0 = col / COLS, u1 = (col + 1) / COLS, v1 = 1 - row / ROWS, v0 = 1 - (row + 1) / ROWS; const w = 0.62;
      { const hp = new THREE.BoxGeometry(0.5, 0.14, 0.02); hp.rotateY(Math.atan2(uz, ux) + Math.PI / 2); hp.translate(sx + ux * 0.32, y + 2.42, sz + uz * 0.32); poles.push(hp); } const qx = sx + ux * (w + 0.07), qz = sz + uz * (w + 0.07); /* Schild neben dem Mast, nicht durch ihn hindurch */ for (const s of [1, -1]) { const ox = -uz * 0.014 * s, oz = ux * 0.014 * s; const A = [qx - ux * w * s + ox, y + 2.55, qz - uz * w * s + oz], B = [qx + ux * w * s + ox, y + 2.55, qz + uz * w * s + oz], C = [B[0], y + 2.8, B[2]], D = [A[0], y + 2.8, A[2]]; sv.push(...A, ...B, ...C, ...A, ...C, ...D); suv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1); }
      } /* Poller entfernt (André 12.11.2026: blockierten Straßen wie die Mainzer Landstraße) */);
    { const pa = [], pb = [], ws = [], wz = []; list.forEach((e, i) => { const ux = e.ux, uz = e.uz, l = 99;
        if (i % 3 === 1 && l > 25) { const x = e.x + ux * 14 + uz * (e.r.w / 2 + 0.9), z = e.z + uz * 14 - ux * (e.r.w / 2 + 0.9); if (solidAt(x, z) < 0 && !onOtherRoad(x, z, null, 0.8)) { const y = TH(x, z); const g = new THREE.BoxGeometry(0.4, 1.6, 0.3); g.translate(x, y + 0.8, z); pa.push(g); const b = new THREE.BoxGeometry(0.3, 0.55, 0.02); b.rotateY(Math.atan2(uz, -ux)); b.translate(x - uz * 0.16, y + 1.15, z + ux * 0.16); pb.push(b); barrierAdd(x - 0.2, z, x + 0.2, z, 1.6); } } // Parkscheinautomat (Foto)
        if (i % 5 === 2) { const sx = e.x - uz * (e.r.w / 2 + 2.6), sz = e.z + ux * (e.r.w / 2 + 2.6); if (solidAt(sx, sz) >= 0 || onOtherRoad(sx, sz, null, 0.8)) return; const y = TH(sx, sz); const p = new THREE.CylinderGeometry(0.04, 0.04, 3.2, 5); p.translate(sx, y + 1.6, sz); poles.push(p);
          const zl = WEGZIELE.map(d => [d.n, d.c[0] - sx, d.c[1] - sz]).filter(d => Math.hypot(d[1], d[2]) > 300).sort((p, q) => Math.hypot(p[1], p[2]) - Math.hypot(q[1], q[2])).slice(0, 3); for (let k = 0; k < zl.length && wz.length < 31; k++) { const [zn, dx, dz] = zl[k]; const dl = Math.hypot(dx, dz); const a = Math.atan2(-dz / dl, dx / dl); const n = wz.length; const km = (dl / 1000).toFixed(1).replace('.', ','); wz.push([zn, km, 0], [zn, km, 1]); { const g = new THREE.PlaneGeometry(1.0, 0.24); const uv = g.attributes.uv; for (let q = 0; q < uv.count; q++) uv.setY(q, (uv.getY(q) + 31 - (n + 1)) / 32); g.rotateY(Math.PI); g.translate(0.62, 0, -0.012); g.rotateY(a); g.translate(sx, y + 2.9 - k * 0.3, sz); ws.push(g); } /* Rückseite */ const g = new THREE.PlaneGeometry(1.0, 0.24); const uv = g.attributes.uv; for (let q = 0; q < uv.count; q++) uv.setY(q, (uv.getY(q) + 31 - n) / 32); g.translate(0, 0, 0.012); g.translate(0.62, 0, 0); g.rotateY(a); g.translate(sx, y + 2.9 - k * 0.3, sz); ws.push(g); } } }); // Radwegweiser weiß (Foto Berger Straße)
      { const sp = [], rf = [], sc = []; list.forEach((e, i) => { const ux = e.ux, uz = e.uz, l = 99;
          if (i % 7 === 3) { const x = e.x + uz * (e.r.w / 2 + 1.0) + ux * 2, z = e.z - ux * (e.r.w / 2 + 1.0) + uz * 2; if (solidAt(x, z) < 0 && !onOtherRoad(x, z, null, 0.8)) { const y = TH(x, z); const p = new THREE.CylinderGeometry(0.04, 0.04, 2.6, 5); p.translate(x, y + 1.3, z); poles.push(p); const fr = new THREE.BoxGeometry(0.9, 0.7, 0.05); fr.rotateY(Math.atan2(ux, uz)); fr.translate(x, y + 2.75, z); rf.push(fr); const m = new THREE.BoxGeometry(0.78, 0.58, 0.02); m.rotateY(Math.atan2(ux, uz)); m.translate(x + ux * 0.03, y + 2.75, z + uz * 0.03); sp.push(m); } } // Verkehrsspiegel (Foto Moni's)
          if (false) { const x = e.x - uz * (e.r.w / 2 + 1.6) + ux * 6, z = e.z + ux * (e.r.w / 2 + 1.6) + uz * 6; if (solidAt(x, z) < 0 && !onOtherRoad(x, z, null, 0.8)) { const y = TH(x, z); const d = new THREE.BoxGeometry(0.16, 0.08, 1.0); d.translate(x, y + 0.12, z); sc.push(d); const s = new THREE.BoxGeometry(0.05, 1.05, 0.05); s.rotateX(0.2); s.translate(x, y + 0.6, z + 0.45); sc.push(s); } } }); // E-Roller
        if (rf.length) addMerged(rf, shLambert(0xd8402a), false); if (sp.length) addMerged(sp, new THREE.MeshBasicMaterial({ color: 0x9aa8b4 }), false); if (sc.length) addMerged(sc, shLambert(0xf07a5a), false); }
      if (pa.length) addMerged(pa, shLambert(0xe4e6e8), false); if (pb.length) addMerged(pb, shLambert(0x2f7fd0), false); if (ws.length) { const tex = canvasTex(256, 2048, (c, w) => { wz.forEach(([n, km, back], r) => { const y = r * 64; const L = back ? 30 : 0; c.fillStyle = '#f4f6f2'; c.fillRect(0, y, w, 64); c.fillStyle = '#1f7a3a'; c.beginPath(); if (back) { c.moveTo(4, y + 32); c.lineTo(26, y + 6); c.lineTo(26, y + 58); } else { c.moveTo(w - 4, y + 32); c.lineTo(w - 26, y + 6); c.lineTo(w - 26, y + 58); } c.fill(); c.fillStyle = '#123'; let fs = 24; c.font = `bold ${fs}px Arial`; while (c.measureText(n).width > w - 104 && fs > 12) { fs--; c.font = `bold ${fs}px Arial`; } c.fillText(n, 10 + L, y + 41); c.font = '20px Arial'; c.fillText(km, w - 72 + (back ? 4 : -2), y + 41); }); }, 1, 1); addMerged(ws, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }), false); } /* Ziele: die nächsten Stadtteile mit echter Entfernung */ }
    if (poles.length) addMerged(poles, shLambert(0x6a6e72), false); if (bol.length) addMerged(bol, shLambert(0x2c2e30), false);
    if (sv.length) { const tex = new THREE.CanvasTexture(at); tex.colorSpace = THREE.SRGBColorSpace; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(sv, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(suv, 2)); g.computeVertexNormals(); scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }))); } }
  // --- Außentische mit Stühlen vor Bäckereien, Cafés und Imbissen (Fotos Eifler, Döneria) ---
  { const tb = [], ch = []; for (const poi of CITY.pois) { if (!['bakery', 'cafe', 'fast_food', 'ice_cream'].includes(poi.k)) continue; const ne = nearestEdge(poi.x, poi.z, 12); if (!ne) continue; const en = edgeNormal(ne.b.p, ne.e); const t0 = clamp(((poi.x - en.ax) * en.dx + (poi.z - en.az) * en.dz) / (en.l * en.l), 0.15, 0.85); const ux = en.dx / en.l, uz = en.dz / en.l;
      for (let k = -1; k <= 1; k += 2) { const x = en.ax + en.dx * t0 + ux * k * 1.6 + en.nx * 2.0, z = en.az + en.dz * t0 + uz * k * 1.6 + en.nz * 2.0; if (solidAt(x, z) >= 0) continue; const y = TH(x, z);
        const top = new THREE.BoxGeometry(0.8, 0.04, 0.8); top.translate(x, y + 0.74, z); tb.push(top); const leg = new THREE.CylinderGeometry(0.03, 0.03, 0.72, 5); leg.translate(x, y + 0.36, z); tb.push(leg);
        for (const s of [-1, 1]) { const cx = x + en.nx * s * 0.6, cz = z + en.nz * s * 0.6; const seat = new THREE.BoxGeometry(0.42, 0.04, 0.42); seat.translate(cx, y + 0.45, cz); ch.push(seat); const back = new THREE.BoxGeometry(0.42, 0.45, 0.04); back.rotateY(Math.atan2(en.nx, en.nz)); back.translate(cx + en.nx * s * 0.2, y + 0.7, cz + en.nz * s * 0.2); ch.push(back); }
        barrierAdd(x - 0.4, z, x + 0.4, z, 0.8); } }
    if (tb.length) addMerged(tb, shLambert(0xd8d6cc)); if (ch.length) addMerged(ch, shLambert(0x2c2e30)); }
  // --- Kita-Stelen „kita frankfurt“ (Foto Eulengasse): weiße Stele mit Tangram-Zeichen, Name je Kita; Einkaufswagen vor Supermärkten ---
  { const kv = [], kuv = [], kitas = [...CITY.pois.filter(p => p.k === 'kindergarten' && /\bKiZ\b|\bKita \d+|Kinderzentrum/.test(p.n || '')), ...CITY.buildings.filter(b => b.n && /\bKiZ\b|\bKita \d+|Kinderzentrum/.test(b.n)).map(b => { const [x, z] = centroidOf(b.p); return { x, z, n: b.n }; })].filter((p, i, a) => a.findIndex(q => Math.hypot(q.x - p.x, q.z - p.z) < 25) === i).slice(0, 64); const COLS = 8, ROWS = Math.max(1, Math.ceil(kitas.length / COLS)), CW = 64, CH = 256; const at = document.createElement('canvas'); at.width = COLS * CW; at.height = ROWS * CH; const ac = at.getContext('2d'); let ki = 0;
    for (const p of kitas) { const ne = nearestEdge(p.x, p.z, 40); let en, x, z; if (ne) { en = edgeNormal(ne.b.p, ne.e); const t0 = clamp(((p.x - en.ax) * en.dx + (p.z - en.az) * en.dz) / (en.l * en.l), 0.1, 0.9); x = en.ax + en.dx * t0 + en.nx * 1.2; z = en.az + en.dz * t0 + en.nz * 1.2; } if (!ne || solidAt(x, z) >= 0) { x = p.x; z = p.z; en = { dx: 1, dz: 0, l: 1, nx: 0, nz: 1 }; if (solidAt(x, z) >= 0) continue; }
      const col = ki % COLS, row = Math.floor(ki / COLS), ox = col * CW, oy = row * CH; ac.fillStyle = '#f6f6f2'; ac.fillRect(ox, oy, CW, CH); const tg = [['#e86a3a', [[4, 4], [60, 4], [32, 32]]], ['#6cb4d8', [[4, 4], [32, 32], [4, 60]]], ['#9ccf6a', [[60, 4], [60, 60], [32, 32]]], ['#e86a3a', [[4, 60], [60, 60], [32, 32]]]]; for (const [c, pts] of tg) { ac.fillStyle = c; ac.beginPath(); pts.forEach(([a, b], i) => i ? ac.lineTo(ox + a, oy + b) : ac.moveTo(ox + a, oy + b)); ac.fill(); }
      ac.fillStyle = '#3a3a3a'; ac.font = 'bold 13px Arial'; ac.fillText('kita', ox + 5, oy + 80); ac.fillText('frank', ox + 5, oy + 94); ac.fillText('furt', ox + 5, oy + 108); ac.save(); ac.translate(ox + 40, oy + 120); ac.rotate(Math.PI / 2); ac.font = '11px Arial'; ac.fillText((p.n || 'Kita').replace(/^Kita\s*/i, '').slice(0, 22), 0, 0); ac.fillText('Willkommen', 0, -14); ac.restore();
      const ux = en.dx / en.l, uz = en.dz / en.l, y = TH(x, z), w = 0.25; const u0x = col / COLS, u1x = (col + 1) / COLS, v1x = 1 - row / ROWS, v0x = 1 - (row + 1) / ROWS; const kox = en.nx * 0.03, koz = en.nz * 0.03; const A = [x - ux * w + kox, y + 0.1, z - uz * w + koz], B = [x + ux * w + kox, y + 0.1, z + uz * w + koz], C = [B[0], y + 2.1, B[2]], D = [A[0], y + 2.1, A[2]]; { const A2 = [x + ux * w - kox, y + 0.1, z + uz * w - koz], B2 = [x - ux * w - kox, y + 0.1, z - uz * w - koz], C2 = [B2[0], y + 2.1, B2[2]], D2 = [A2[0], y + 2.1, A2[2]]; kv.push(...A2, ...B2, ...C2, ...A2, ...C2, ...D2); kuv.push(u0x, v0x, u1x, v0x, u1x, v1x, u0x, v0x, u1x, v1x, u0x, v1x); } /* Rückseite, richtig herum lesbar */ const u0 = col / COLS, u1 = (col + 1) / COLS, v1 = 1 - row / ROWS, v0 = 1 - (row + 1) / ROWS;
      kv.push(...A, ...B, ...C, ...A, ...C, ...D); kuv.push(u0x, v0x, u1x, v0x, u1x, v1x, u0x, v0x, u1x, v1x, u0x, v1x); barrierAdd(A[0], A[2], B[0], B[2], 2); ki++; }
    if (kv.length) { const tex = new THREE.CanvasTexture(at); tex.colorSpace = THREE.SRGBColorSpace; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(kv, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(kuv, 2)); g.computeVertexNormals(); scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }))); } }
  { const wk = [], gr = []; for (const p of CITY.pois) { if (p.k !== 'supermarket') continue; const ne = nearestEdge(p.x, p.z, 15); if (!ne) continue; const en = edgeNormal(ne.b.p, ne.e); const ux = en.dx / en.l, uz = en.dz / en.l; const t0 = clamp(((p.x - en.ax) * en.dx + (p.z - en.az) * en.dz) / (en.l * en.l), 0.2, 0.8); const bx = en.ax + en.dx * t0 + ux * 3 + en.nx * 1.3, bz = en.az + en.dz * t0 + uz * 3 + en.nz * 1.3; if (solidAt(bx, bz) >= 0) continue; const ang = Math.atan2(en.nx, en.nz);
      for (let k = 0; k < 6; k++) { const x = bx + en.nx * k * 0.35, z = bz + en.nz * k * 0.35, y = TH(x, z); const g = new THREE.BoxGeometry(0.55, 0.55, 0.9); g.rotateY(ang); g.translate(x, y + 0.6, z); gr.push(g); const h = new THREE.BoxGeometry(0.55, 0.05, 0.05); h.rotateY(ang); h.translate(x - Math.sin(ang) * 0.45, y + 0.95, z - Math.cos(ang) * 0.45); wk.push(h); }
      barrierAdd(bx, bz, bx + en.nx * 2, bz + en.nz * 2, 1); }
    if (gr.length) addMerged(gr, new THREE.MeshLambertMaterial({ color: 0xb8bcc0, transparent: true, opacity: 0.55 }), false); if (wk.length) addMerged(wk, shLambert(0xd01818), false); }
  // --- Gauben auf flach eingetragenen Wohnhäusern ab 12 m (Foto ABG-Haus), Garagentore an Kleinbauten, Torbögen an Durchfahrten ---
  { const gb = [], gf = [], gt = [], tb = []; let ng = 0; /* gt: vier Torvarianten (Graffiti) */
    for (const b of CITY.buildings) {
      if (!b.k && b.h >= 12 && !(b.rh > 0) && b.p.length <= 12 && ng < 700) { let e = 0, best = 0; for (let i = 0; i < b.p.length; i++) { const l = edgeNormal(b.p, i).l; if (l > best) { best = l; e = i; } } const en = edgeNormal(b.p, e); if (en.l < 8) continue; const ux = en.dx / en.l, uz = en.dz / en.l, ang = Math.atan2(en.nx, en.nz), y = (b.base || 0) + b.h;
        for (let s = 2.2; s < en.l - 2; s += 3.6) { const x = en.ax + ux * s - en.nx * 1.0, z = en.az + uz * s - en.nz * 1.0; const g = new THREE.BoxGeometry(1.4, 1.3, 1.4); g.rotateY(ang); g.translate(x, y + 0.65, z); gb.push(g); const r = new THREE.ConeGeometry(1.05, 0.6, 4); r.rotateY(Math.PI / 4 + ang); r.translate(x, y + 1.6, z); gb.push(r); const w = new THREE.PlaneGeometry(0.7, 0.8); w.rotateY(ang); w.translate(x + en.nx * 0.71, y + 0.65, z + en.nz * 0.71); gf.push(w); ng++; } }
      if (b.k === 'small' && b.h <= 4) { let e = 0, best = 0; for (let i = 0; i < b.p.length; i++) { const l = edgeNormal(b.p, i).l; if (l > best) { best = l; e = i; } } const en = edgeNormal(b.p, e); if (en.l < 2.6 || en.l > 40) continue; const ux = en.dx / en.l, uz = en.dz / en.l, ang = Math.atan2(en.nx, en.nz), y = b.base || TH(en.ax, en.az); const n = Math.floor(en.l / 3);
        for (let k = 0; k < n; k++) { const s = (k + 0.5) * en.l / n; const g = new THREE.PlaneGeometry(2.3, 2.0); g.rotateY(ang); g.translate(en.ax + ux * s + en.nx * 0.09, y + 1.0, en.az + uz * s + en.nz * 0.09); (gt[(ng + k + Math.floor(en.ax)) % 4] || (gt[(ng + k + Math.floor(en.ax)) % 4] = [])).push(g); } }
      if (b.pass) for (const q of b.pass) for (let i = 0; i < b.p.length; i++) { const [px, pz] = b.p[i], [rx, rz] = b.p[(i + 1) % b.p.length]; const d1x = q[2] - q[0], d1z = q[3] - q[1], d2x = rx - px, d2z = rz - pz; const den = d1x * d2z - d1z * d2x; if (Math.abs(den) < 1e-6) continue; const tt = ((px - q[0]) * d2z - (pz - q[1]) * d2x) / den, uu = ((px - q[0]) * d1z - (pz - q[1]) * d1x) / den; if (tt < 0 || tt > 1 || uu < 0 || uu > 1) continue;
        const en = edgeNormal(b.p, i); const x = px + d2x * uu + en.nx * 0.05, z = pz + d2z * uu + en.nz * 0.05; const hw = Math.min(q[4], 3.5), hh = Math.min(4.2, b.h - 1); const g = new THREE.PlaneGeometry(hw * 2 + 0.8, hh + 0.4); g.rotateY(Math.atan2(en.nx, en.nz)); g.translate(x, (b.base || TH(x, z)) + (hh + 0.4) / 2, z); tb.push(g); } }
    if (gb.length) addMerged(gb, shLambert(0x3e4248)); if (gf.length) addMerged(gf, shLambert(0x2a313a), false);
    // Garagentore: 9 cm vor der Wand plus polygonOffset (vorher 4 cm, gleich weit wie das Erdgeschossband: Flackern).
    // Graffiti wie auf Andrés Fotos: SGE (Eintracht) und „Stadt für alle“, eine Variante ohne (12.11.2026)
    gt.forEach((list, v) => { if (!list || !list.length) return; if (!GARAGE_MATS[v]) GARAGE_MATS[v] = Object.assign(new THREE.MeshLambertMaterial({ polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2, map: canvasTex(256, 224, (c, w, h) => {
      c.fillStyle = '#3a3e42'; c.fillRect(0, 0, w, h); c.fillStyle = '#2c3034'; for (let x = 6; x < w; x += 18) c.fillRect(x, 6, 6, h - 12); c.fillStyle = '#9a9a9a'; c.fillRect(120, 150, 16, 10);
      const spray = (t, x, y, size, fill, line, rot) => { c.save(); c.translate(x, y); c.rotate(rot); c.font = `900 ${size}px Impact, Arial Black, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round'; c.shadowColor = fill; c.shadowBlur = 3; c.lineWidth = size * 0.14; c.strokeStyle = line; c.strokeText(t, 0, 0); c.fillStyle = fill; c.fillText(t, 0, 0); c.shadowBlur = 0; c.fillStyle = fill; for (let i = 0; i < 4; i++) { const dx = (Math.random() - 0.5) * size * 1.6; c.fillRect(dx, size * 0.35, 2, 6 + Math.random() * 14); } c.restore(); };
      if (v === 0) { spray('SGE', 128, 92, 92, '#e8e8e8', '#c8102e', -0.06); spray('1899', 170, 165, 34, '#c8102e', '#111', 0.04); }
      else if (v === 1) { spray('STADT', 128, 72, 64, '#f2d22e', '#1d1d1d', -0.05); spray('FÜR ALLE', 128, 140, 50, '#f2d22e', '#1d1d1d', -0.03); }
      else if (v === 2) { spray('SGE', 90, 70, 60, '#111', '#e8e8e8', 0.05); spray('Stadt für alle', 132, 155, 30, '#ff6fb0', '#1d1d1d', -0.04); }
      }, 1, 1) }), { userData: { shared: true } }); addMerged(list, GARAGE_MATS[v], false); });
    if (tb.length) addMerged(tb, TOR_MAT || (TOR_MAT = Object.assign(new THREE.MeshLambertMaterial({ polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, map: canvasTex(128, 128, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = '#e4ddcf'; c.fillRect(0, 0, w, h); const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2a2622'); gr.addColorStop(1, '#46403a'); c.fillStyle = gr; c.beginPath(); c.moveTo(14, h); c.lineTo(14, 54); c.arc(64, 54, 50, Math.PI, 0); c.lineTo(114, h); c.fill(); c.fillStyle = 'rgba(255,220,160,0.25)'; c.fillRect(44, 70, 40, h - 70); /* Licht am anderen Ende */ c.strokeStyle = '#b8aea0'; c.lineWidth = 6; c.beginPath(); c.arc(64, 54, 53, Math.PI, 0); c.stroke(); }, 1, 1) }), { userData: { shared: true } })), false); }
  // --- TG Bornheim (Foto 12.11.2026): Leuchtkreise und Schriftzug an der Hallenwand ---
  for (const b of CITY.buildings) { if (b.n !== 'Turngemeinde Bornheim') continue; let e = 0, best = 0; for (let i = 0; i < b.p.length; i++) { const l = edgeNormal(b.p, i).l; if (l > best) { best = l; e = i; } } const en = edgeNormal(b.p, e);
    const tex = canvasTex(512, 256, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = '#ffffff'; for (const [x, y, r] of [[60, 120, 34], [40, 175, 16], [95, 70, 12], [80, 205, 10], [330, 130, 40], [300, 60, 26], [360, 40, 16], [395, 95, 18], [420, 150, 12], [280, 185, 12], [250, 105, 10], [365, 200, 14], [440, 60, 10]]) { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); } c.fillStyle = '#7fd0ff'; c.font = 'bold 40px Arial'; c.fillText('TG BORNHEIM', 110, 150); }, 1, 1);
    const g = new THREE.PlaneGeometry(9, 4.5); const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })); const t0 = 0.55; m.position.set(en.ax + en.dx * t0 + en.nx * 0.08, (b.base || 0) + Math.min(b.h - 2.5, 8), en.az + en.dz * t0 + en.nz * 0.08); m.rotation.y = Math.atan2(en.nx, en.nz); scene.add(m); break; }
  // --- Sozialrathaus Ost (Foto): dunkles Vordach mit Schriftzug über der ganzen Front, hell erleuchtetes verglastes Erdgeschoss ---
  for (const b of CITY.buildings) { if (b.n !== 'Sozialrathaus Ost') continue; let e = 0, bd = 1e9; for (let i = 0; i < b.p.length; i++) { const en = edgeNormal(b.p, i); const d = distSegSq(242, -300, en.ax, en.az, en.ax + en.dx, en.az + en.dz); if (d < bd && en.l > 8) { bd = d; e = i; } } const en = edgeNormal(b.p, e); const ux = en.dx / en.l, uz = en.dz / en.l, ang = Math.atan2(en.nx, en.nz), y0 = b.base || TH(en.ax, en.az), mx = en.ax + en.dx / 2, mz = en.az + en.dz / 2;
    const cg = new THREE.BoxGeometry(en.l, 0.7, 2.6); cg.rotateY(ang); cg.translate(mx + en.nx * 1.3, y0 + 3.4, mz + en.nz * 1.3); const can = new THREE.Mesh(cg, shLambert(0x3a3632)); scene.add(can);
    const tex = canvasTex(512, 64, (c, w, h) => { c.fillStyle = '#3a3632'; c.fillRect(0, 0, w, h); c.fillStyle = '#e8e2d6'; c.font = '24px Arial'; c.textAlign = 'center'; c.fillText('SOZIALRATHAUS OST', w / 2, 28); c.font = '20px Arial'; c.fillText('DIENSTORT BORNHEIM', w / 2, 54); }, 1, 1);
    const tp = new THREE.Mesh(new THREE.PlaneGeometry(7, 0.62), new THREE.MeshBasicMaterial({ map: tex })); tp.position.set(mx + en.nx * 2.62, y0 + 3.4, mz + en.nz * 2.62); tp.rotation.y = ang; scene.add(tp);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(en.l - 1, 2.8), new THREE.MeshBasicMaterial({ color: 0xbcd6ea })); gl.position.set(mx + en.nx * 0.06, y0 + 1.5, mz + en.nz * 0.06); gl.rotation.y = ang; scene.add(gl);
    for (let s = 2; s < en.l - 1; s += 6) { const pg = new THREE.BoxGeometry(0.35, 3.1, 0.35); pg.translate(en.ax + ux * s + en.nx * 2.3, y0 + 1.55, en.az + uz * s + en.nz * 2.3); scene.add(new THREE.Mesh(pg, shLambert(0x3a3632))); } break; }
  // --- Obststand mit rot-weißem Dach vor Supermärkten (Foto Nahkauf) ---
  { const ti = [], da = []; for (const p of CITY.pois) { if (p.k !== 'supermarket') continue; const ne = nearestEdge(p.x, p.z, 15); if (!ne) continue; const en = edgeNormal(ne.b.p, ne.e); const ux = en.dx / en.l, uz = en.dz / en.l; const t0 = clamp(((p.x - en.ax) * en.dx + (p.z - en.az) * en.dz) / (en.l * en.l), 0.2, 0.8); const x = en.ax + en.dx * t0 - ux * 3 + en.nx * 1.0, z = en.az + en.dz * t0 - uz * 3 + en.nz * 1.0; if (solidAt(x, z) >= 0) continue; const y = TH(x, z), ang = Math.atan2(en.nx, en.nz);
      const g = new THREE.BoxGeometry(1.8, 0.9, 0.8); g.rotateY(ang); g.translate(x, y + 0.45, z); ti.push(g); const r = new THREE.BoxGeometry(2.0, 0.05, 1.1); r.rotateX(-0.25); r.rotateY(ang); r.translate(x, y + 1.9, z); da.push(r); const bk = new THREE.BoxGeometry(2.0, 1.0, 0.04); bk.rotateY(ang); bk.translate(x - en.nx * 0.45, y + 1.4, z - en.nz * 0.45); da.push(bk); barrierAdd(x - ux * 0.9, z - uz * 0.9, x + ux * 0.9, z + uz * 0.9, 0.9); }
    if (ti.length) addMerged(ti, OBST_MAT || (OBST_MAT = Object.assign(new THREE.MeshLambertMaterial({ map: canvasTex(64, 32, (c, w, h) => { c.fillStyle = '#5a4030'; c.fillRect(0, 0, w, h); for (let i = 0; i < 60; i++) { c.fillStyle = pick(['#d8302a', '#f0b020', '#7ab030', '#e86a20']); c.beginPath(); c.arc(Math.random() * w, Math.random() * h * 0.5, 3, 0, 7); c.fill(); } }, 1, 1) }), { userData: { shared: true } })));
    if (da.length) addMerged(da, STREIF_MAT || (STREIF_MAT = Object.assign(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, map: canvasTex(64, 16, (c, w, h) => { for (let x = 0; x < w; x += 8) { c.fillStyle = (x / 8) % 2 ? '#ffffff' : '#d42a22'; c.fillRect(x, 0, 8, h); } }, 1, 1) }), { userData: { shared: true } }))); }
  // --- Markise über Apotheken-Schaufenstern (Foto Sonnen-Apotheke) ---
  { const mk = []; for (const p of CITY.pois) { if (p.k !== 'pharmacy') continue; const ne = nearestEdge(p.x, p.z, 12); if (!ne) continue; const en = edgeNormal(ne.b.p, ne.e); if (en.l < 5) continue; const t0 = clamp(((p.x - en.ax) * en.dx + (p.z - en.az) * en.dz) / (en.l * en.l), 0.25, 0.75); const x = en.ax + en.dx * t0 + en.nx * 0.6, z = en.az + en.dz * t0 + en.nz * 0.6; const g = new THREE.BoxGeometry(Math.min(en.l - 1, 7), 0.05, 1.2); g.rotateX(0.35); g.rotateY(Math.atan2(en.nx, en.nz)); g.translate(x, (ne.b.base || TH(x, z)) + 2.55, z); mk.push(g); }
    if (mk.length) addMerged(mk, shLambert(0xe8dcb8, THREE.DoubleSide), false); }
  // --- Schaufenster mit gezeichnetem Innenleben (Fotos Sonnen-Apotheke, Döneria, Eifler): nachts hell ---
  { const SF = SCHAUF_TEX || (SCHAUF_TEX = {}); const mk = (k, fn) => SF[k] || (SF[k] = new THREE.MeshBasicMaterial({ map: canvasTex(512, 256, fn, 1, 1), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    const rahmen = (c, w, h, col) => { c.strokeStyle = col; c.lineWidth = 10; c.strokeRect(5, 5, w - 10, h - 10); c.fillStyle = col; c.fillRect(w * 0.62, 0, 8, h); };
    const apo = () => mk('apo', (c, w, h) => { c.fillStyle = '#f4f2ec'; c.fillRect(0, 0, w, h); c.fillStyle = '#fffbe8'; for (let x = 30; x < w; x += 120) c.fillRect(x, 14, 80, 6); for (const sx of [20, 190, 360]) { c.fillStyle = '#a8703a'; c.fillRect(sx, 40, 140, 150); c.fillStyle = '#d8e8ea'; c.fillRect(sx + 6, 46, 128, 138); for (let r = 0; r < 5; r++) { c.fillStyle = '#c09060'; c.fillRect(sx + 6, 70 + r * 26, 128, 3); for (let k = 0; k < 9; k++) { c.fillStyle = pick(['#ffffff', '#2f9a4a', '#d8332b', '#2a6fd1', '#f2c94c', '#7fc8e6', '#e86fa0']); c.fillRect(sx + 9 + k * 14, 52 + r * 26, 11, 17); } } } c.fillStyle = '#7a4a2a'; c.fillRect(0, 200, w, 56); c.fillStyle = '#d8102e'; c.font = 'bold 44px serif'; c.fillText('A', 250, 245); rahmen(c, w, h, '#f2f2f0'); });
    const doener = () => mk('doener', (c, w, h) => { for (let x = 0; x < w; x += 24) { c.fillStyle = (x / 24) % 2 ? '#bfe8d6' : '#f4f8f4'; c.fillRect(x, 0, 24, h); } c.fillStyle = '#ffffff'; for (let x = 40; x < w; x += 130) c.fillRect(x, 8, 90, 6); c.fillStyle = '#20262a'; c.fillRect(30, 26, 300, 52); for (let k = 0; k < 4; k++) { c.fillStyle = pick(['#e8a040', '#c85a30', '#f2d070']); c.fillRect(38 + k * 74, 32, 66, 40); }
      c.fillStyle = '#c0c4c8'; c.fillRect(380, 40, 110, 170); for (let r = 0; r < 5; r++) for (let k = 0; k < 7; k++) { c.fillStyle = pick(['#d82020', '#2050c0', '#f0a020', '#30a040', '#1a1a1a']); c.fillRect(386 + k * 15, 48 + r * 32, 11, 26); } c.fillStyle = '#8a5a2a'; c.beginPath(); c.moveTo(250, 100); c.lineTo(290, 100); c.lineTo(282, 190); c.lineTo(258, 190); c.fill(); c.fillStyle = '#b8bcc0'; c.fillRect(0, 190, 370, 66); rahmen(c, w, h, '#2f9a5a'); c.strokeStyle = '#d4165a'; c.lineWidth = 4; c.strokeRect(14, 14, w - 28, h - 28); });
    const baecker = () => mk('baecker', (c, w, h) => { c.fillStyle = '#f0e6d2'; c.fillRect(0, 0, w, h); c.fillStyle = '#2a2a2a'; c.fillRect(260, 20, 240, 150); for (let r = 0; r < 4; r++) { c.fillStyle = '#b08850'; c.fillRect(270, 50 + r * 34, 220, 4); for (let k = 0; k < 8; k++) { c.fillStyle = pick(['#c88a40', '#a8682a', '#d8a860', '#8a5020']); c.beginPath(); c.ellipse(284 + k * 27, 42 + r * 34, 12, 8, 0, 0, 7); c.fill(); } } c.fillStyle = '#d8ecf0'; c.fillRect(0, 170, w, 50); for (let k = 0; k < 18; k++) { c.fillStyle = pick(['#e0a050', '#f2d8a0', '#8a4a20', '#e86a7a']); c.beginPath(); c.arc(16 + k * 28, 196, 9, 0, 7); c.fill(); } c.fillStyle = '#8a8a8a'; c.fillRect(0, 220, w, 36); c.fillStyle = '#4a3a2a'; c.font = 'italic 26px serif'; c.fillText('Handwerk', 40, 80); rahmen(c, w, h, '#3a3e42'); });
    const per = {}; let n = 0;
    for (const p of CITY.pois) { const ty = p.k === 'pharmacy' ? 'apo' : p.k === 'bakery' ? 'baecker' : (p.k === 'fast_food' && /d[öo]ner|kebab|d[öo]neria|imbiss|grill/i.test(p.n || '')) ? 'doener' : null; if (!ty || n > 60) continue; const ne = nearestEdge(p.x, p.z, 12); if (!ne) continue; const en = edgeNormal(ne.b.p, ne.e); if (en.l < 6) continue; const W = Math.min(5, en.l - 1.5); const t0 = clamp(((p.x - en.ax) * en.dx + (p.z - en.az) * en.dz) / (en.l * en.l), (W / 2 + 0.5) / en.l, 1 - (W / 2 + 0.5) / en.l); const x = en.ax + en.dx * t0 + en.nx * 0.05, z = en.az + en.dz * t0 + en.nz * 0.05; const y = (ne.b.base || TH(x, z));
      const g = new THREE.PlaneGeometry(W, 2.3); g.rotateY(Math.atan2(en.nx, en.nz)); g.translate(x, y + 1.5, z); (per[ty] || (per[ty] = [])).push(g); n++; }
    for (const ty in per) { const m = new THREE.Mesh(mergeGeometries(per[ty]), ty === 'apo' ? apo() : ty === 'doener' ? doener() : baecker()); scene.add(m); } }
  // --- Stahl-Bogenbrücken (Wunsch André 12.11.2026, Foto Brücke an der EZB): zwei Bögen je Brücke, oben begehbar ---
  { const tubes = [], hangers = []; for (const r of CITY.roads) { if (!r.br || !r.ry || r.w > 30) continue; let i = 0; while (i < r.p.length - 1) { if (!r.el[i] && !r.el[i + 1]) { i++; continue; } let j = i; while (j < r.p.length - 1 && (r.el[j] || r.el[j + 1])) j++; const pts = r.p.slice(i, j + 1), ys = r.ry.slice(i, j + 1); i = j;
      const cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1])); const L = cum[cum.length - 1]; if (L < 60) continue; const H = Math.min(26, L * 0.16);
      const at = s => { let k = 1; while (k < cum.length - 1 && cum[k] < s) k++; const f = (s - cum[k - 1]) / ((cum[k] - cum[k - 1]) || 1); const dx = pts[k][0] - pts[k - 1][0], dz = pts[k][1] - pts[k - 1][1], dl = Math.hypot(dx, dz) || 1; return { x: pts[k - 1][0] + dx * f, z: pts[k - 1][1] + dz * f, y: ys[k - 1] + (ys[k] - ys[k - 1]) * f, nx: -dz / dl, nz: dx / dl }; };
      const id = ARCH_ID++; for (const sd of [-1, 1]) { const off = sd * (r.w / 2 + 0.7); const cp = []; const N = Math.max(16, Math.round(L / 6)); for (let k = 0; k <= N; k++) { const s = L * k / N, q = at(s); cp.push(new THREE.Vector3(q.x + q.nx * off, q.y + 4 * H * (s / L) * (1 - s / L) + 0.6, q.z + q.nz * off)); }
        tubes.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cp), N * 2, 0.55, 6, false));
        for (let k = 1; k < cp.length; k++) { const a = cp[k - 1], b = cp[k]; const seg = { ax: a.x, az: a.z, bx: b.x, bz: b.z, ya: a.y + 0.45, yb: b.y + 0.45, w: 0.75, r, arch: id, apex: k > N * 0.4 && k < N * 0.6 }; for (let gx = Math.floor((Math.min(a.x, b.x) - 1) / DCELL); gx <= Math.floor((Math.max(a.x, b.x) + 1) / DCELL); gx++) for (let gz = Math.floor((Math.min(a.z, b.z) - 1) / DCELL); gz <= Math.floor((Math.max(a.z, b.z) + 1) / DCELL); gz++) { const kk = gx + ',' + gz; if (!deckGrid.has(kk)) deckGrid.set(kk, []); deckGrid.get(kk).push(seg); } }
        for (let s = 8; s < L - 6; s += 8) { const q = at(s); const top = q.y + 4 * H * (s / L) * (1 - s / L) + 0.6, h = top - q.y - 0.4; if (h < 1.5) continue; const g = new THREE.CylinderGeometry(0.07, 0.07, h, 4); g.translate(q.x + q.nx * off, q.y + 0.4 + h / 2, q.z + q.nz * off); hangers.push(g); } } } }
    if (tubes.length) addMerged(tubes, shLambert(0x5a6470)); if (hangers.length) addMerged(hangers, shLambert(0x4a525c), false); }
  // --- Flugwarnlichter auf Hochhäusern über 100 m (Fotos EZB 12.11.2026), nachts blinkend; EZB: Glas-Atrium zwischen den Türmen ---
  { const wl = []; for (const b of CITY.buildings) { if (!(b.h > 100)) continue; const [cx, cz] = centroidOf(b.p); const top = TH(cx, cz) + b.h; const n = b.p.length; const step = Math.max(1, Math.floor(n / 6));
      for (let i = 0; i < n; i += step) { const [x, z] = b.p[i]; const s = new THREE.SphereGeometry(0.5, 6, 4); s.translate(x + (cx - x) * 0.04, top + 0.5, z + (cz - z) * 0.04); wl.push(s); const s2 = new THREE.SphereGeometry(0.45, 6, 4); s2.translate(x + (cx - x) * 0.04, TH(cx, cz) + b.h * 0.66, z + (cz - z) * 0.04); wl.push(s2); }
      { const a = new THREE.CylinderGeometry(0.15, 0.25, 12, 5); a.translate(cx, top + 6, cz); wl.push(a); const s = new THREE.SphereGeometry(0.6, 6, 4); s.translate(cx, top + 12.3, cz); wl.push(s); }
      if (/Europäische Zentralbank/.test(b.n || '')) { let rr = 0; for (const [x, z] of b.p) rr = Math.max(rr, Math.hypot(x - cx, z - cz)); const g = new THREE.BoxGeometry(rr * 0.35, b.h * 0.92, rr * 0.35); g.rotateY(0.4); g.translate(cx, TH(cx, cz) + b.h * 0.46, cz); addMerged([g], ATRIUM_MAT || (ATRIUM_MAT = Object.assign(new THREE.MeshLambertMaterial({ color: 0xbfd2e4, emissive: 0x9fb8d0, emissiveIntensity: 0.25, transparent: true, opacity: 0.55 }), { userData: { shared: true } })), false); } }
    if (wl.length) { if (!WARN_MAT) { WARN_MAT = new THREE.MeshBasicMaterial({ color: 0xff2a1a }); WARN_MAT.userData.shared = true; } addMerged(wl, WARN_MAT, false); } }
  // --- Friedhöfe (#57): Grabfelder mit stehenden Steinen, Kreuzen, Platten und Grabbeeten; Wege alle 5 Reihen frei ---
  { const st = [], kr = [], pl = [], beet = [], bl = []; let seed = 7; const rr = () => (seed = (seed * 16807) % 2147483647) / 2147483647; let n = 0;
    for (const g of CITY.green) { if (g.k !== 'cemetery' || n > 2400) continue; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of g.p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      const ang = (() => { let best = 0, bl2 = 0; for (let i = 0; i < g.p.length - 1; i++) { const dx = g.p[i + 1][0] - g.p[i][0], dz = g.p[i + 1][1] - g.p[i][1], l = dx * dx + dz * dz; if (l > bl2) { bl2 = l; best = Math.atan2(dx, dz); } } return best; })(); const ca = Math.cos(ang), sa = Math.sin(ang);
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, R = Math.hypot(x1 - x0, z1 - z0) / 2;
      for (let v = -R, row = 0; v < R; v += 2.6, row++) { if (row % 6 === 5) continue; for (let u = -R, col = 0; u < R; u += 1.6, col++) { if (++YC % 500 === 0) yield; if (col % 9 === 8 || n > 2400) continue; const x = cx + u * ca + v * sa, z = cz - u * sa + v * ca;
          if (!pointInPoly(x, z, g.p) || solidAt(x, z) >= 0 || onOtherRoad(x, z, null, 1.0)) continue; let edge = 1e9; for (let i = 0; i < g.p.length - 1; i++) edge = Math.min(edge, distSegSq(x, z, g.p[i][0], g.p[i][1], g.p[i + 1][0], g.p[i + 1][1])); if (edge < 9) continue;
          if (rr() < 0.12) continue; n++; const y = TH(x, z); const r = rr(); const put = (geo, arr, dy, off = 0) => { geo.rotateY(ang); geo.translate(x + sa * off, y + dy, z + ca * off); arr.push(geo); };
          put(new THREE.BoxGeometry(1.0, 0.12, 1.9), beet, 0.06, 0.2); if (rr() < 0.6) put(new THREE.BoxGeometry(0.8, 0.08, 1.4), bl, 0.14, 0.25);
          if (r < 0.55) put(new THREE.BoxGeometry(0.62, 0.75 + rr() * 0.4, 0.14), st, 0.45, -0.75);
          else if (r < 0.75) { put(new THREE.BoxGeometry(0.1, 1.1, 0.1), kr, 0.6, -0.75); put(new THREE.BoxGeometry(0.5, 0.1, 0.1), kr, 0.85, -0.75); }
          else put(new THREE.BoxGeometry(0.7, 0.1, 0.9), pl, 0.18, -0.3); } } }
    if (st.length) addMerged(st, shLambert(0x8a8780)); if (kr.length) addMerged(kr, shLambert(0x5a4632)); if (pl.length) addMerged(pl, shLambert(0x3c3c40)); if (beet.length) addMerged(beet, shLambert(0x9a9690), false); if (bl.length) addMerged(bl, shLambert(0x4d6e34), false); }
  // --- Herbstlaub (Oktober/November, nach Fotos 12.11.2026): Blätter am Fahrbahnrand und auf Gehwegen, eine Punktwolke je Kachel ---
  { const mo = new Date().getMonth(); const SZ = (location.search.match(/saison=(\w+)/) || [])[1] || ([8, 9, 10].includes(mo) ? 'herbst' : [11, 0, 1].includes(mo) ? 'winter' : [3, 4].includes(mo) ? 'fruehling' : ''); if (SZ) { const LCOL = { herbst: ['#c8781e', '#a85a16', '#d9a020'], winter: ['#f4f6fa', '#e6ecf4', '#ffffff'], fruehling: ['#f6c8d8', '#ffffff', '#f2a8c0'] }[SZ] || ['#c8781e']; const lp = []; for (const r of CITY.roads) { if (r.mw || r.w < 4) continue; for (let i = 0; i < r.p.length - 1; i++) { const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const l = Math.hypot(bx - ax, bz - az); const nx = -(bz - az) / (l || 1), nz = (bx - ax) / (l || 1); for (let k = 0; k < l * (SZ === 'winter' ? 2.5 : SZ === 'fruehling' ? 0.5 : 1.2); k++) { const s = Math.random(), sd = Math.random() < 0.5 ? -1 : 1, off = r.w / 2 + (Math.random() < 0.6 ? -Math.random() * 0.8 : Math.random() * 3); const x = ax + (bx - ax) * s + nx * off * sd, z = az + (bz - az) * s + nz * off * sd; lp.push(x, TH(x, z) + 0.07, z); } } }
    if (lp.length) { const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)); if (!LAUB_MAT) LAUB_MAT = Object.assign(new THREE.PointsMaterial({ size: 0.28, sizeAttenuation: true, transparent: true, alphaTest: 0.4, map: canvasTex(32, 32, (c) => { c.fillStyle = pick(LCOL); c.beginPath(); c.ellipse(16, 16, SZ === 'winter' ? 12 : 13, SZ === 'winter' ? 12 : 8, 0.6, 0, 7); c.fill(); }, 1, 1), color: 0xffffff }), { userData: { shared: true } }); scene.add(new THREE.Points(gg, LAUB_MAT)); } } }
  // --- Baustellen: rot-weiße Bauzäune mit gelben Warnleuchten, ein bis zwei je Kachel ---
  { const bz = [], lamps = []; const rs = CITY.roads.filter(r => !r.ped && !r.mw && r.w >= 6 && r.w <= 12); for (let n = 0; n < Math.min(2, rs.length); n++) { if (Math.random() < 0.4) continue; const r = pick(rs); const i = Math.floor(Math.random() * (r.p.length - 1)); const [ax, az] = r.p[i], [bx, bz2] = r.p[i + 1]; const l = Math.hypot(bx - ax, bz2 - az); if (l < 12) continue; const ux = (bx - ax) / l, uz = (bz2 - az) / l, nx = -uz, nz = ux; const cx = ax + ux * l / 2 + nx * r.w / 4, cz = az + uz * l / 2 + nz * r.w / 4; const ang = Math.atan2(ux, uz);
      for (const [du, dn, rot] of [[-3, 1.2, 0], [-1, 1.2, 0], [1, 1.2, 0], [3, 1.2, 0], [-3, -1.2, 0], [-1, -1.2, 0], [1, -1.2, 0], [3, -1.2, 0], [-4, 0, 1], [4, 0, 1]]) { const x = cx + ux * du + nx * dn, z = cz + uz * du + nz * dn; const g = new THREE.BoxGeometry(0.06, 1.0, 2.0); g.rotateY(ang + (rot ? Math.PI / 2 : 0)); g.translate(x, TH(x, z) + 0.6, z); bz.push(g); { const a2 = ang + (rot ? Math.PI / 2 : 0); const ex = Math.sin(a2) * 1.0, ez = Math.cos(a2) * 1.0; barrierAdd(x - ex, z - ez, x + ex, z + ez, 1.1); } /* fest */ if (Math.abs(du) === 3 || rot) { const s = new THREE.SphereGeometry(0.12, 8, 6); s.translate(x, TH(x, z) + 1.25, z); lamps.push(s); } } }
    if (bz.length) { if (!BAUZAUN_MAT) BAUZAUN_MAT = Object.assign(new THREE.MeshLambertMaterial({ map: canvasTex(128, 64, (c, w, h) => { c.fillStyle = '#f2f2ee'; c.fillRect(0, 0, w, h); c.fillStyle = '#d42a22'; for (let x = -h; x < w; x += 32) { c.beginPath(); c.moveTo(x, h); c.lineTo(x + 16, h); c.lineTo(x + 16 + h * 0.5, h * 0.5); c.lineTo(x + h * 0.5, h * 0.5); c.fill(); } c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h * 0.45); c.strokeStyle = '#999'; c.lineWidth = 2; for (let x = 4; x < w; x += 8) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h * 0.45); c.stroke(); } }, 1, 1) }), { userData: { shared: true } }); addMerged(bz, BAUZAUN_MAT, false); }
    if (lamps.length) { const m = new THREE.Mesh(mergeGeometries(lamps), BAU_LAMP_MAT || (BAU_LAMP_MAT = Object.assign(new THREE.MeshBasicMaterial({ color: 0xffc21a }), { userData: { shared: true } }))); scene.add(m); } }
}
function onMotorway(x, z) { const c = getRoadGrid().get(key(Math.floor(x / CELL), Math.floor(z / CELL))); if (!c) return false; for (const [r, i] of c) { if (!r.mw) continue; const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; if (distSegSq(x, z, ax, az, bx, bz) < (r.w / 2 + 2) ** 2) return true; } return false; }
function nearestRoadDir(x, z, maxD = 15) { let best = maxD * maxD, res = null; const g = getRoadGrid(); const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL); const R = Math.ceil(maxD / CELL);
  for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) { const c = g.get(key(cx + a, cz + b)); if (!c) continue; for (const [r, i] of c) { const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const d = distSegSq(x, z, ax, az, bx, bz); if (d < best) { best = d; const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1; const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1); res = { ang: Math.atan2(dx, dz), w: r.w, x: ax + dx * t, z: az + dz * t }; } } }
  return res; }


// ---------- Runde 1: Straßenraster, Himmel, Gesimse, Dachaufbauten, Bordsteine, Straßenbäume, Parkreihen ----------
let roadGridCache = null;
function getRoadGrid() { return roadGridCache || (roadGridCache = new Map()); }
function gridAddRoad(r) { /* Raster speichert die Straße selbst (kein Index in WORLD.roads: die Liste wird beim Freigeben ferner Kacheln kompaktiert) */ const g = getRoadGrid(); for (let i = 0; i < r.p.length - 1; i++) { const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const pad = r.w / 2 + 4; for (let cx = Math.floor((Math.min(ax, bx) - pad) / CELL); cx <= Math.floor((Math.max(ax, bx) + pad) / CELL); cx++) for (let cz = Math.floor((Math.min(az, bz) - pad) / CELL); cz <= Math.floor((Math.max(az, bz) + pad) / CELL); cz++) { const k = key(cx, cz); if (!g.has(k)) g.set(k, []); g.get(k).push([r, i]); } } }
// liegt (x,z) auf der Fahrbahn einer anderen Straße als `self` (+ Rand)?
// Punkt von allen Fahrbahnen an den Rand schieben (Ampelmasten, Bäume aus OSM liegen oft auf der Mittellinie)
function pushOffRoads(x, z, margin = 0.7) {
  for (let k = 0; k < 10; k++) { const c = []; for (let gx = -1; gx <= 1; gx++) for (let gz = -1; gz <= 1; gz++) { const cc = getRoadGrid().get(key(Math.floor(x / CELL) + gx, Math.floor(z / CELL) + gz)); if (cc) c.push(...cc); } let moved = false;
    for (const [r, i] of c) { if (r.ped) continue; const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const lim = r.w / 2 + margin; if (distSegSq(x, z, ax, az, bx, bz) >= lim * lim) continue;
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1; const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1); const cx = ax + dx * t, cz = az + dz * t; let ox = x - cx, oz = z - cz; let d = Math.hypot(ox, oz);
      if (d < 0.05) { const l = Math.sqrt(L2); ox = dz / l; oz = -dx / l; d = 1; } x = cx + ox / d * (lim + 0.05); z = cz + oz / d * (lim + 0.05); moved = true; break; }
    if (!moved) break; }
  const onAny = (px, pz) => { for (let gx = -1; gx <= 1; gx++) for (let gz = -1; gz <= 1; gz++) { const cc = getRoadGrid().get(key(Math.floor(px / CELL) + gx, Math.floor(pz / CELL) + gz)); if (cc) for (const [r, i] of cc) { if (r.ped) continue; const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const lim = r.w / 2 + margin; if (distSegSq(px, pz, ax, az, bx, bz) < lim * lim) return true; } } return false; };
  if (onAny(x, z)) { const x0 = x, z0 = z; for (let rad = 1; rad <= 24; rad += 1) for (let a = 0; a < 16; a++) { const px = x0 + Math.cos(a / 16 * 6.283) * rad, pz = z0 + Math.sin(a / 16 * 6.283) * rad; if (!onAny(px, pz) && solidAt(px, pz) < 0) return [px, pz]; } return [NaN, NaN]; }
  return [x, z]; }
const signalPoles = [], treeSpots = [];
function onOtherRoad(x, z, self, extra = 0) { const c = getRoadGrid().get(key(Math.floor(x / CELL), Math.floor(z / CELL))); if (!c) return false; for (const [r, i] of c) { if (r === self) continue; const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const lim = r.w / 2 + extra; if (distSegSq(x, z, ax, az, bx, bz) < lim * lim) return true; } return false; }
function nearPoint(x, z, list, d) { for (const q of list) { const qx = q.x ?? q[0], qz = q.z ?? q[1]; if (qx === undefined) continue; if ((qx - x) ** 2 + (qz - z) ** 2 < d * d) return true; } return false; }
function streetTrees() {
  const out = [];
  for (const r of CITY.roads) { if (r.w < 8 || r.ped) continue;
    for (let i = 0; i < r.p.length - 1; i++) { const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const l = Math.hypot(bx - ax, bz - az); if (l < 6) continue; const nx = -(bz - az) / l, nz = (bx - ax) / l;
      for (let d = 5; d < l - 4; d += 11) for (const sd of [-1, 1]) { const off = r.w / 2 + 2.0; const x = ax + (bx - ax) * d / l + nx * off * sd, z = az + (bz - az) * d / l + nz * off * sd;
        if (solidAt(x, z) >= 0 || solidAt(x + nx * sd * 1.5, z + nz * sd * 1.5) >= 0 || onOtherRoad(x, z, r, 2) || nearPoint(x, z, CITY.signals, 8) || nearPoint(x, z, CITY.stops, 6)) continue; out.push([x, z]); } } }
  return out;
}
// Echte Frankfurter Hochhäuser (ab 80 m) für die Horizont-Silhouette aus allen Stadtteilen (ein Draw-Call, blendet aus sobald die echte Kachel gebaut ist)
const SKYLINE_TOWERS = [
  [-3028, -1637, 28, 28, 337.5, 0, -8, -5], [-2175, 976, 56, 52, 259, -0.82, -6, 2], [-3705, 972, 41, 41, 256.5, -1.21, -10, 2],
  [-2225, 845, 36, 34, 233, -0.35, -6, 2], [-3352, 1132, 34, 62, 200, 0.25, -9, 2], [-2940, 991, 44, 52, 198, -0.36, -8, 2],
  [-2344, 793, 42, 42, 198, 0.2, -6, 1], [-3391, 956, 38, 49, 185, -1.29, -9, 2], [-82, 1419, 48, 69, 185, -0.26, -1, 3],
  [-2191, 835, 42, 50, 183, 0.43, -6, 2], [-3487, 1126, 30, 56, 172, -1.03, -9, 2], [-2340, 825, 30, 32, 170, 0.27, -6, 2],
  [-2611, 563, 35, 57, 170, 1.38, -7, 1], [-2536, 868, 52, 59, 170, -0.23, -7, 2], [-2713, 1185, 37, 62, 166, -1.16, -7, 2],
  [-3267, 653, 34, 48, 159, 0.68, -9, 1], [-2563, 796, 35, 38, 155, -0.3, -7, 1], [-2579, 755, 35, 38, 155, 1.27, -7, 1],
  [-2458, 916, 38, 42, 155, -0.25, -7, 2], [-2526, 1084, 39, 43, 153.8, -1.2, -7, 2], [-2125, 1020, 40, 65, 148, -1.13, -6, 2],
  [-2819, 865, 44, 43, 142, 0.34, -8, 2], [-2907, 948, 43, 44, 142, 0.9, -8, 2], [-1074, 2407, 42, 42, 140, 0.45, -3, 6],
  [-2505, 1166, 37, 48, 136, -1.14, -7, 2], [-1713, 620, 33, 52, 136, 1.22, -5, 1], [-3348, 998, 27, 47, 130, -1.3, -9, 2],
  [-2231, 902, 26, 40, 127, 0.44, -6, 2], [-4286, 1020, 31, 51, 117, -1.24, -11, 2], [-2221, 1063, 38, 38, 115, 0.44, -6, 2],
  [-3175, 1894, 30, 30, 112.3, -0.89, -8, 4], [-4052, 658, 24, 67, 112, 0.4, -11, 1], [-2340, 761, 29, 29, 110, -0.66, -6, 1],
  [-2118, 1236, 26, 42, 110, 0.38, -6, 3], [-2300, 954, 24, 46, 108.6, 0.44, -6, 2], [-3487, 492, 24, 49, 106, 1.24, -9, 1],
  [-1197, 3082, 31, 34, 100, -0.35, -3, 7], [-1754, 672, 26, 51, 99, 1.22, -5, 1], [-3806, 1307, 19, 89, 96, -1.03, -10, 3],
  [-3059, 976, 20, 48, 96, -1.27, -8, 2], [-2767, 815, 29, 36, 95, -1.32, -7, 2], [-1826, 27, 34, 42, 93, 0.31, -5, 0],
  [546, 1277, 18, 86, 90, -0.21, 1, 3], [-4404, 1463, 21, 61, 87, -0.87, -12, 3]
];
const _skyO = new THREE.Object3D(), _skyC1 = new THREE.Color(), _skyC2 = new THREE.Color(), _skyTint = new THREE.Color();
function buildSky() {
  skyU = { top: { value: new THREE.Color(0x6a8fd0) }, bot: { value: new THREE.Color(0xb9cde6) } };
  const mat = new THREE.ShaderMaterial({ uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vW; void main(){ vW = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying vec3 vW; void main(){ float h = clamp(vW.y * 1.8 + 0.04, 0.0, 1.0); gl_FragColor = vec4(mix(bot, top, pow(h, 0.65)), 1.0);\n#include <colorspace_fragment>\n}' });
  skyDome = new THREE.Mesh(new THREE.SphereGeometry(850, 24, 12), mat); skyDome.renderOrder = -1; skyDome.userData.noChunk = true; skyDome.frustumCulled = false; scene.add(skyDome);
  const sunTex = canvasTex(128, 128, (ctx, w, h) => { const gr = ctx.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(0.15, 'rgba(255,245,210,0.95)'); gr.addColorStop(0.35, 'rgba(255,220,160,0.25)'); gr.addColorStop(1, 'rgba(255,200,120,0)'); ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h); });
  sunDisk = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending })); sunDisk.scale.set(140, 140, 1); scene.add(sunDisk);
  const cloudTex = canvasTex(256, 128, (ctx, w, h) => { for (let i = 0; i < 22; i++) { const x = rnd(40, 216), y = rnd(45, 90), r = rnd(18, 44); const gr = ctx.createRadialGradient(x, y, 2, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); } });
  for (let i = 0; i < 26; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, fog: false, depthWrite: false, transparent: true })); const a = Math.random() * Math.PI * 2, d = rnd(150, 680); sp.userData = { ox: Math.cos(a) * d, oz: Math.sin(a) * d, y: rnd(170, 290) }; const sc = rnd(140, 260); sp.scale.set(sc, sc * 0.45, 1); scene.add(sp); clouds.push(sp); }
  // Frankfurter Skyline-Horizontschicht: ein einziges InstancedMesh (1 Draw-Call) für alle fernen Wolkenkratzer
  const twTex = canvasTex(64, 128, (ctx, w, h) => {
    ctx.fillStyle = '#8fa0b5'; ctx.fillRect(0, 0, w, h);
    for (let y = 4; y < h - 4; y += 6) for (let x = 4; x < w - 4; x += 8) {
      ctx.fillStyle = ((x * 7 + y * 13) % 5 === 0) ? '#ffe4a8' : '#4a5c72';
      ctx.fillRect(x, y, 5, 3.5);
    }
  });
  // Nachtbild (12.11.2026, nach Nachtfotos vom Mainufer): dunkle Fassade, viele helle Fenster in Warm- und Kaltweiß, angestrahlte Krone oben
  const twTexN = canvasTex(64, 128, (ctx, w, h) => { let s = 9; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    ctx.fillStyle = '#141b27'; ctx.fillRect(0, 0, w, h);
    for (let y = 10; y < h - 4; y += 6) for (let x = 4; x < w - 4; x += 8) { const q = r(); ctx.fillStyle = q < 0.55 ? pick(['#fff1cf', '#e9f0ff', '#ffe0a0', '#f6f6ee']) : q < 0.7 ? '#8a7a5a' : '#263040'; ctx.fillRect(x, y, 5, 3.5); }
    const g = ctx.createLinearGradient(0, 0, 0, 10); g.addColorStop(0, '#fff6c8'); g.addColorStop(1, 'rgba(255,240,180,0.2)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, 10); });
  const twGeo = new THREE.BoxGeometry(1, 1, 1); twGeo.userData.shared = true;
  const twMat = new THREE.MeshBasicMaterial({ map: twTex, fog: false, transparent: true, opacity: 0.92 }); twMat.userData.shared = true;
  twMat.userData.day = twTex; twMat.userData.night = twTexN;
  skylineMesh = new THREE.InstancedMesh(twGeo, twMat, SKYLINE_TOWERS.length);
  skylineMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(SKYLINE_TOWERS.length * 3), 3);
  skylineMesh.userData.noChunk = true; skylineMesh.frustumCulled = false; scene.add(skylineMesh);
  const bcGeo = new THREE.SphereGeometry(1, 6, 4); bcGeo.userData.shared = true;
  const bcMat = new THREE.MeshBasicMaterial({ color: 0xff2820, fog: false }); bcMat.userData.shared = true;
  skylineBeacons = new THREE.InstancedMesh(bcGeo, bcMat, SKYLINE_TOWERS.length);
  skylineBeacons.userData.noChunk = true; skylineBeacons.frustumCulled = false; scene.add(skylineBeacons);
}
const _sunV = new THREE.Vector3();
function updateSky(dt) {
  if (BAU_LAMP_MAT) BAU_LAMP_MAT.color.setHex(world.night && Math.floor(performance.now() / 500) % 2 ? 0x4a3a10 : 0xffc21a); // Baustellen-Warnleuchten blinken nachts
  if (!skyDome) return; skyDome.position.copy(camera.position);
  const sd = _sunV.copy(world.sunDir).normalize(); sunDisk.position.copy(camera.position).addScaledVector(sd, 700); sunDisk.material.opacity = clamp(world.day * 1.2 - weather.cloud * 0.9, 0, 1); sunDisk.visible = sunDisk.material.opacity > 0.02;
  const bright = 0.25 + 0.75 * world.day; const grey = 1 - weather.cloud * 0.45; const cov = 0.25 + 0.75 * weather.cloud;
  for (const c of clouds) { c.userData.ox += dt * 2.5; if (c.userData.ox > 700) c.userData.ox -= 1400; const x = camera.position.x + c.userData.ox, z = camera.position.z + c.userData.oz; c.position.set(x, c.userData.y, z); c.material.opacity = cov * (0.55 + 0.45 * world.day); c.material.color.setScalar(bright * grey); }
  if (skylineMesh) {
    const showSkyline = !POCKET;
    skylineMesh.visible = showSkyline;
    skylineBeacons.visible = showSkyline && !!world.night;
    if (showSkyline) {
      const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
      const sm = skylineMesh.material, wantMap = world.night ? sm.userData.night : sm.userData.day; if (wantMap && sm.map !== wantMap) { sm.map = wantMap; sm.needsUpdate = true; }
      const baseCol = world.night ? _skyC1.setHex(0xd8dce6) : _skyC1.setHex(0x7b8ea6).multiplyScalar(0.38 + 0.62 * world.day); // nachts leuchten die Fenster selbst
      const blink = Math.floor(performance.now() / 700) % 2 === 0;
      for (let i = 0; i < SKYLINE_TOWERS.length; i++) {
        const [tx0, tz0, w, d, h, ang, ktx, ktz] = SKYLINE_TOWERS[i];
        const tile = TILES.get(ktx + '_' + ktz);
        if (tile && tile.built) {
          _skyO.scale.setScalar(0); _skyO.updateMatrix();
          skylineMesh.setMatrixAt(i, _skyO.matrix);
          if (world.night) skylineBeacons.setMatrixAt(i, _skyO.matrix);
          continue;
        }
        const dx = tx0 - cx, dz = tz0 - cz, dist = Math.hypot(dx, dz) || 1;
        const dProj = Math.min(dist, 760), s = dProj / dist;
        const inf = WIDX.tiles[ktx + '_' + ktz]; const by = inf ? inf[2] : 98;
        _skyO.position.set(cx + dx * s, cy + (by + h * 0.5 - cy) * s, cz + dz * s);
        _skyO.rotation.set(0, ang, 0);
        _skyO.scale.set(w * s, h * s, d * s);
        _skyO.updateMatrix();
        skylineMesh.setMatrixAt(i, _skyO.matrix);
        const haze = clamp((dist - 450) / 4200 + weather.fog * 0.45 + weather.rain * 0.25, 0.2, 0.82);
        _skyC2.copy(baseCol); if (!world.night) { if (h > 250 && h < 260 && w < 45) _skyC2.multiply(_skyTint.setHex(0xc89a8c)); else if (h > 150 && h < 160) _skyC2.multiply(_skyTint.setHex(0x9fbde6)); } _skyC2.lerp(_cFog, haze); // Messeturm-Granit, Glastürme blau (Fotos)
        skylineMesh.setColorAt(i, _skyC2);
        if (world.night) {
          const r = (blink || i % 3 !== 0) ? Math.max(1.6, dist * 0.0022) * s : 0;
          _skyO.position.set(cx + dx * s, cy + (by + h + 2.5 - cy) * s, cz + dz * s);
          _skyO.scale.setScalar(r);
          _skyO.updateMatrix();
          skylineBeacons.setMatrixAt(i, _skyO.matrix);
        }
      }
      skylineMesh.instanceMatrix.needsUpdate = true;
      skylineMesh.instanceColor.needsUpdate = true;
      if (world.night) skylineBeacons.instanceMatrix.needsUpdate = true;
    }
  }
}
function* buildDetails2() {
  const Q = () => ({ v: [], n: [] });
  const quad = (T, A, B, C, D, nx, ny, nz) => { T.v.push(...A, ...B, ...C, ...A, ...C, ...D); for (let i = 0; i < 6; i++) T.n.push(nx, ny, nz); };
  const mk = (T, mat, shadow = false) => { if (!T.v.length) return null; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(T.v, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(T.n, 3)); const m = new THREE.Mesh(g, mat); m.castShadow = shadow; m.receiveShadow = true; scene.add(m); return m; };
  const cor = Q(), band = Q(), curbF = Q(), curbT = Q(); const roofBox = [], chim = [];
  for (const b of CITY.buildings) { if (++YC % 3 === 0) yield; if (b.mh >= 2.2 || b.lm) continue;
    const base = b.base ?? 0, top = base + b.h, kind = b.k || 'res'; const sgn = polyArea(b.p) > 0 ? 1 : -1;
    const lowQ = opts.quality === 'niedrig'; const doCor = !lowQ && (kind === 'res' || kind === 'public' || kind === 'church' || kind === 'house'); const doBand = !lowQ && (kind === 'res' || kind === 'public') && b.h >= 7;
    for (let i = 0; i < b.p.length; i++) { const [ax, az] = b.p[i], [bx, bz] = b.p[(i + 1) % b.p.length]; const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz); if (l < 1.2) continue; const nx = dz / l * sgn, nz = -dx / l * sgn; const ex = dx / l * 0.3, ez = dz / l * 0.3;
      if (doCor) { const o = 0.34, h = 0.45; const A0 = [ax - ex, top - h, az - ez], B0 = [bx + ex, top - h, bz + ez], A1 = [ax - ex + nx * o, top - h, az - ez + nz * o], B1 = [bx + ex + nx * o, top - h, bz + ez + nz * o], A2 = [A1[0], top, A1[2]], B2 = [B1[0], top, B1[2]], A3 = [ax - ex, top, az - ez], B3 = [bx + ex, top, bz + ez];
        quad(cor, A1, B1, B2, A2, nx, 0, nz); quad(cor, A0, B0, B1, A1, 0, -1, 0); quad(cor, A2, B2, B3, A3, 0, 1, 0); }
      if (doBand && l > 3) { const y = base + GF_H, o = 0.15, h = 0.24; const A0 = [ax, y, az], B0 = [bx, y, bz], A1 = [ax + nx * o, y, az + nz * o], B1 = [bx + nx * o, y, bz + nz * o], A2 = [A1[0], y + h, A1[2]], B2 = [B1[0], y + h, B1[2]], A3 = [ax, y + h, az], B3 = [bx, y + h, bz];
        quad(band, A1, B1, B2, A2, nx, 0, nz); quad(band, A0, B0, B1, A1, 0, -1, 0); quad(band, A2, B2, B3, A3, 0, 1, 0); }
    }
    // Dachaufbauten
    const ob = orientedBox(b.p); const W = (ob.vmax - ob.vmin) + 0.7; const ang = Math.atan2(ob.ux, ob.uz);
    const pitched = b.r && b.rh > 0 && b.p.length <= 12 && ob.ratio > 0.6 && (ob.vmax - ob.vmin) < 24;
    if (pitched) { const ht = top + Math.min(b.rh, W * 0.6); const n = (ob.umax - ob.umin) > 14 ? 2 : 1; for (let k = 0; k < n; k++) { const u = ob.umin + (ob.umax - ob.umin) * (n === 1 ? rnd(0.3, 0.7) : (k ? 0.75 : 0.25)); const vOff = W * rnd(0.08, 0.22) * (Math.random() < 0.5 ? 1 : -1); const surf = ht - (ht - top) * Math.abs(vOff) / (W / 2); const [x, z] = ob.pt(u, (ob.vmin + ob.vmax) / 2 + vOff); const g = new THREE.BoxGeometry(0.55, 1.5, 0.75); g.rotateY(ang); g.translate(x, surf + 0.5, z); chim.push(g); const c2 = new THREE.BoxGeometry(0.7, 0.12, 0.9); c2.rotateY(ang); c2.translate(x, surf + 1.28, z); chim.push(c2); } }
    else if (b.h >= 6 && Math.abs(polyArea(b.p)) > 60 && kind !== 'small') { const cu = (ob.umin + ob.umax) / 2, cv = (ob.vmin + ob.vmax) / 2; const [x, z] = ob.pt(cu + rnd(-2, 2), cv + rnd(-1, 1)); if (pointInPoly(x, z, b.p)) { const g = new THREE.BoxGeometry(2.6, 2.4, 2.4); g.rotateY(ang); g.translate(x, top + 1.2, z); roofBox.push(g); }
      for (let k = 0; k < 3; k++) { const [vx, vz] = ob.pt(rnd(ob.umin + 1, ob.umax - 1), rnd(ob.vmin + 1, ob.vmax - 1)); if (!pointInPoly(vx, vz, b.p)) continue; const g = new THREE.BoxGeometry(rnd(0.6, 1.4), rnd(0.5, 1.1), rnd(0.6, 1.4)); g.rotateY(ang); g.translate(vx, top + 0.45, vz); roofBox.push(g); }
    }
  }
  mk(cor, shLambert(0xe9e2d6, THREE.DoubleSide), true); mk(band, shLambert(0xddd5c8, THREE.DoubleSide));
  if (roofBox.length) { const m = new THREE.Mesh(mergeGeometries(roofBox), shLambert(0x8f8b85)); m.castShadow = true; m.receiveShadow = true; scene.add(m); }
  if (chim.length) { const m = new THREE.Mesh(mergeGeometries(chim), shLambert(0x8a4b38)); m.castShadow = true; scene.add(m); }
  // Bordsteine: an beiden Fahrbahnrändern, unterbrochen an Einmündungen
  for (const r of CITY.roads) { if (r.ped || r.w < 5) continue; if (++YC % 3 === 0) yield;
    for (let i = 0; i < r.p.length - 1; i++) { const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const l = Math.hypot(bx - ax, bz - az); if (l < 0.5) continue; const nx = -(bz - az) / l, nz = (bx - ax) / l; const steps = Math.max(1, Math.ceil(l / 2));
      for (const sd of [-1, 1]) for (let k = 0; k < steps; k++) { const t0 = k / steps, t1 = (k + 1) / steps; const off = r.w / 2; const x0 = ax + (bx - ax) * t0 + nx * off * sd, z0 = az + (bz - az) * t0 + nz * off * sd, x1 = ax + (bx - ax) * t1 + nx * off * sd, z1 = az + (bz - az) * t1 + nz * off * sd;
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2; if (onOtherRoad(mx, mz, r, 0.3)) continue;
        const y0 = TH(x0, z0) + 0.04, y1 = TH(x1, z1) + 0.04, hh = 0.13, ww = 0.3; const ox = nx * sd * ww, oz = nz * sd * ww;
        quad(curbF, [x0, y0, z0], [x1, y1, z1], [x1, y1 + hh, z1], [x0, y0 + hh, z0], -nx * sd, 0, -nz * sd);
        quad(curbT, [x0, y0 + hh, z0], [x1, y1 + hh, z1], [x1 + ox, y1 + hh, z1 + oz], [x0 + ox, y0 + hh, z0 + oz], 0, 1, 0); } } }
  mk(curbF, shLambert(0x9c978e, THREE.DoubleSide)); mk(curbT, shLambert(0xbab4a9, THREE.DoubleSide));
}
// Geparkte Autos als ein InstancedMesh; beim Einsteigen wird daraus ein echtes Auto
const staticParked = []; let parkedMesh = null; let roadMeshRef = null; const roadChunks = [];
const instRefs = [];
let PARK_TG = null, PARK_LOW = null;
// Wachen ohne Namen in OSM, Lage aus der Adresse (Nominatim) und Gebäudegröße: Feuer- und Rettungswache 2, Heinrichstraße 8; Lage per Google-Maps-Punkt bestätigt (50.107023, 8.651487), beide Gebäudeteile
const HECKE_DONE = { v: 0 };
const WOELL = [[406, -503], [356, -491], [301, -479], [245, -468], [186, -459], [136, -457]]; // Wöllstädter Straße (OSM)
const SCHILDER = [ // Nasenschilder nach Fotos (OSM-Punkte): [x, z, Text, Grund, Schrift]
  { x: -1288, z: 239, t: 'zappbar', bg: '#0e0e10', fg: '#f2f2f2' }, { x: 248, z: -488, t: 'CARAVAN', bg: '#efe9dc', fg: '#e8501c' }, { x: -4153, z: 2492, t: 'FEUERWACHE 2', bg: '#c8102e', fg: '#ffffff' }, { x: 224, z: 148, t: 'KIRCHNERSCHULE', bg: '#efe9dc', fg: '#3a2a22' }, { x: -14, z: -175, t: 'DÖNERIA', bg: '#dff5ec', fg: '#d4165a' }, { x: 414, z: -509, t: "Moni's", bg: '#e8d8a0', fg: '#8a2a1a' }, { x: 68, z: -210, t: 'nahkauf', bg: '#d8101c', fg: '#ffffff' }, { x: 191, z: -449, t: 'BÄCKEREI', bg: '#f2c230', fg: '#5a2a10', brezel: 1 }];
const WACHE_OHNE_NAMEN = [[-4153, 2492], [-4136, 2487]];
const WACHEN = []; // Mittelpunkte der Feuerwachen (aus dem Gebäudebau), dort parkt der Kommandowagen
function* buildParked() { // Generator wie die übrigen Bauschritte (#173)
  const local = [];
  for (const r of CITY.roads) { if (++YC % 3 === 0) yield; if (r.ped || r.mw || r.ry || r.w < 5 || r.w > 9.5) continue;
    for (let i = 0; i < r.p.length - 1; i++) { const [ax, az] = r.p[i], [bx2, bz] = r.p[i + 1]; const l = Math.hypot(bx2 - ax, bz - az); if (l < 8) continue; const nx = -(bz - az) / l, nz = (bx2 - ax) / l; const hd = Math.atan2(bx2 - ax, bz - az);
      for (const sd of [-1, 1]) { if (Math.random() < 0.06) continue; for (let d = 4; d < l - 4; d += 5.4) { if (Math.random() < 0.14) continue; const off = r.w / 2 + 0.55; const x = ax + (bx2 - ax) * d / l + nx * off * sd, z = az + (bz - az) * d / l + nz * off * sd;
        const fx = Math.sin(hd) * 2.2, fz = Math.cos(hd) * 2.2; if (solidAt(x, z) >= 0 || solidAt(x + fx, z + fz) >= 0 || solidAt(x - fx, z - fz) >= 0 || solidAt(x + nx * sd, z + nz * sd) >= 0) continue;
        if (onOtherRoad(x + fx, z + fz, r, 1.5) || onOtherRoad(x - fx, z - fz, r, 1.5) || nearPoint(x, z, CITY.signals, 10) || nearPoint(x, z, CITY.stops, 12) || nearPoint(x, z, CITY.crossings, 7)) continue;
        const type = CAR_TPL.evkdow && WACHEN.some(w => Math.hypot(w[0] - x, w[1] - z) < 45) && Math.random() < 0.5 ? 'evkdow' : CAR_PICK.length ? pick(CAR_PICK) : null; local.push({ x, z, h: hd + ((r.o ? r.o < 0 : sd < 0) ? Math.PI : 0) /* #102: Normale zeigt rechts (sd>0), Rechtsverkehr: rechts in Segmentrichtung, links entgegen; Einbahn: beide Seiten in OSM-Richtung */, type, col: carBodyColor(type), active: true, refs: [] }); } } } }
  local.sort(() => Math.random() - 0.5); local.length = Math.min(local.length, 180); staticParked.push(...local);
  // Geometrie je Typ vorbereiten: Lack (Instanzfarbe) + Rest (Vertexfarben oder Atlas-Textur)
  const toNI = g => { const gg = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(k)) gg.deleteAttribute(k); if (!gg.attributes.uv) gg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2)); return gg; };
  const withColor = (g, col) => { const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  const TG = PARK_TG || (PARK_TG = (() => {
  const TG = {};
  for (const type of Object.keys(CAR_TPL)) { const T = CAR_TPL[type]; T.root.updateMatrixWorld(true); const body = [], rest = []; let atlas = null;
    T.root.traverse(m => { if (!m.isMesh) return; const g = toNI(m.geometry.clone().applyMatrix4(m.matrixWorld)); if (BODY_MATS.includes(m.material.name)) body.push(g); else { if (m.material.map) atlas = m.material.map; rest.push(withColor(g, m.material.color)); } });
    TG[type] = { body: body.length ? mergeGeometries(body) : null, rest: rest.length ? mergeGeometries(rest) : null, restMat: (m => LACK ? LACK.rest(m) : m)(atlas ? new THREE.MeshLambertMaterial({ map: atlas }) : new THREE.MeshLambertMaterial({ vertexColors: true })) }; }
  for (const t of Object.values(TG)) { for (const g of [t.body, t.rest]) if (g) g.userData.shared = true; t.restMat.userData.shared = true; } return TG; })());
  if (!PARK_LOW) { PARK_LOW = { bodyMat: LACK ? LACK.body : new THREE.MeshLambertMaterial({ color: 0xffffff }) }; PARK_LOW.bodyMat.userData.shared = true; }
  const bodyMat = PARK_LOW.bodyMat;
  // Ferne Stufe: einfacher Kasten mit Fensterband
  const lp = []; const lcol = (g, c) => withColor(toNI(g), new THREE.Color(c));
  { const b = new THREE.BoxGeometry(1.8, 0.62, 4.3); b.translate(0, 0.6, 0); lp.push(lcol(b, 0xffffff)); const c = new THREE.BoxGeometry(1.6, 0.48, 2.2); c.translate(0, 1.15, -0.2); lp.push(lcol(c, 0xffffff)); const w = new THREE.BoxGeometry(1.62, 0.28, 2.22); w.translate(0, 1.17, -0.2); lp.push(lcol(w, 0x0c1018)); const t = new THREE.BoxGeometry(1.82, 0.3, 4.32); t.translate(0, 0.25, 0); lp.push(lcol(t, 0x161616)); }
  if (!PARK_LOW.geo) { PARK_LOW.geo = mergeGeometries(lp); PARK_LOW.geo.userData.shared = true; PARK_LOW.mat = new THREE.MeshLambertMaterial({ vertexColors: true }); PARK_LOW.mat.userData.shared = true; } const lowGeo = PARK_LOW.geo; const lowMat = PARK_LOW.mat;
  // Kacheln zu 100 m, Nah: Modelle, Fern: Kasten
  const PT = opts.quality === 'niedrig' ? TS : 100; const lowOnly = opts.quality === 'niedrig'; const tiles = new Map(); for (const sp of local) { const k = Math.floor(sp.x / PT) + ',' + Math.floor(sp.z / PT); if (!tiles.has(k)) tiles.set(k, { x0: Math.floor(sp.x / PT) * PT, z0: Math.floor(sp.z / PT) * PT, list: [] }); tiles.get(k).list.push(sp); }
  const o = new THREE.Object3D(); const cc = new THREE.Color();
  const place = (im, list, colorize) => { list.forEach((sp, i) => { o.position.set(sp.x, TH(sp.x, sp.z), sp.z); o.rotation.set(0, sp.h, 0); o.scale.setScalar(1); o.updateMatrix(); im.setMatrixAt(i, o.matrix); if (colorize) im.setColorAt(i, cc.setHex(sp.col).convertSRGBToLinear()); sp.refs.push({ mesh: im, i }); }); im.userData.noChunk = true; im.computeBoundingSphere(); scene.add(im); };
  for (const [, t] of tiles) { const det = []; const byType = new Map(); for (const sp of t.list) { if (!byType.has(sp.type)) byType.set(sp.type, []); byType.get(sp.type).push(sp); }
    for (const [type, list] of byType) { if (lowOnly) break; const G = TG[type]; if (!G) continue; if (G.body) { const im = new THREE.InstancedMesh(G.body, bodyMat, list.length); place(im, list, true); im.castShadow = true; det.push(im); } if (G.rest) { const im = new THREE.InstancedMesh(G.rest, G.restMat, list.length); place(im, list, false); im.castShadow = true; det.push(im); } }
    const low = new THREE.InstancedMesh(lowGeo, lowMat, t.list.length); place(low, t.list, true);
    parkedTiles.push({ x0: t.x0, z0: t.z0, det, low }); }
  _parkedCamX = 1e9;
}
const parkedTiles = []; let _parkedCamX = 1e9, _parkedCamZ = 1e9, _parkedCount = 0;
function updateParkedLOD() { const cx = camera.position.x, cz = camera.position.z; if (_parkedCount === parkedTiles.length && (cx - _parkedCamX) ** 2 + (cz - _parkedCamZ) ** 2 < 16) return; _parkedCamX = cx; _parkedCamZ = cz; _parkedCount = parkedTiles.length; for (const t of parkedTiles) { const dx = Math.max(t.x0 - cx, 0, cx - (t.x0 + 100)), dz = Math.max(t.z0 - cz, 0, cz - (t.z0 + 100)); const near = dx * dx + dz * dz < 90 * 90; for (const m of t.det) m.visible = near; t.low.visible = !near || !t.det.length; } }
// Geparkte Autos sind nur Instanzen; wo Explosion, Feuer, Schläge oder Schüsse sie treffen, werden sie zu echten Autos (mit Schaden, Brand, Wrack)
function wakeParked(pos, r) { const out = []; for (const sp of staticParked) { if (!sp.active) continue; if ((sp.x - pos.x) ** 2 + (sp.z - pos.z) ** 2 < r * r) out.push(activateParked(sp)); } return out; }
function wakeParkedRay(o, d, range) { const hits = []; for (const sp of staticParked) { if (!sp.active) continue; const rx = sp.x - o.x, rz = sp.z - o.z; const dl = Math.hypot(d.x, d.z) || 1; const along = (rx * d.x + rz * d.z) / dl; if (along < 0 || along > range) continue; const ry = TH(sp.x, sp.z) + 0.8 - (o.y + d.y / dl * along); const lat = Math.abs(rx * d.z - rz * d.x) / dl; if (lat < 2.4 && Math.abs(ry) < 2.5) hits.push([along, sp]); } hits.sort((a, b) => a[0] - b[0]); return hits.slice(0, 3).map(h => activateParked(h[1])); }
function activateParked(sp) {
  sp.active = false; const o = new THREE.Object3D(); o.scale.setScalar(0); o.updateMatrix(); for (const r of sp.refs || []) { r.mesh.setMatrixAt(r.i, o.matrix); r.mesh.instanceMatrix.needsUpdate = true; }
  const c = makeCar(false, sp.type); setCarColor(c, sp.col); c.position.set(sp.x, TH(sp.x, sp.z), sp.z); c.userData.heading = sp.h; c.rotation.y = sp.h; c.userData.mode = 'parked'; scene.add(c); cars.push(c); shootables.push(c); return c;
}
// Statische Großgeometrie in Kacheln teilen, damit Sicht- und Schattenkamera nur Nahes zeichnen
function chunkInstanced(o, TILE) {
  const n = o.count, m4 = new THREE.Matrix4(), pos = new THREE.Vector3(); const by = new Map(); const map = new Array(n);
  for (let i = 0; i < n; i++) { o.getMatrixAt(i, m4); pos.setFromMatrixPosition(m4); const k = (Math.floor(pos.x / TILE) + 500) * 1000 + (Math.floor(pos.z / TILE) + 500); if (!by.has(k)) by.set(k, []); by.get(k).push(i); }
  if (by.size < 2) return null; const created = []; const c = new THREE.Color();
  for (const [, idx] of by) { const m = new THREE.InstancedMesh(o.geometry, o.material, idx.length); idx.forEach((oi, j) => { o.getMatrixAt(oi, m4); m.setMatrixAt(j, m4); if (o.instanceColor) { o.getColorAt(oi, c); m.setColorAt(j, c); } map[oi] = { mesh: m, idx: j }; }); m.castShadow = o.castShadow; m.receiveShadow = o.receiveShadow; m.computeBoundingSphere(); scene.add(m); created.push(m); }
  scene.remove(o); for (const lst of [rayTargets, nightOnly]) { const p = lst.indexOf(o); if (p >= 0) { lst.splice(p, 1); lst.push(...created); } }
  return map;
}
function chunkStatic(TILE = (+new URLSearchParams(location.search).get("tile") || 400)) {
  for (const o of scene.children.filter(x => x.isInstancedMesh && x.count > 150 && !x.userData.noChunk)) { const map = chunkInstanced(o, TILE); if (map) for (const r of instRefs) if (r.mesh === o) { const m = map[r.i]; r.mesh = m.mesh; r.i = m.idx; } }
  const list = scene.children.filter(o => o.isMesh && !o.isInstancedMesh && !o.userData.noChunk && !Array.isArray(o.material) && o.geometry.attributes.position.count > 3000);
  for (const o of list) {
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry; const names = Object.keys(g.attributes); const P = g.attributes.position.array; const triN = P.length / 9;
    const tileOf = new Int32Array(triN); const counts = new Map();
    for (let t = 0; t < triN; t++) { const i = t * 9; const cx = (P[i] + P[i + 3] + P[i + 6]) / 3, cz = (P[i + 2] + P[i + 5] + P[i + 8]) / 3; const k = (Math.floor(cx / TILE) + 500) * 1000 + (Math.floor(cz / TILE) + 500); tileOf[t] = k; counts.set(k, (counts.get(k) || 0) + 1); }
    if (counts.size < 2) continue;
    const out = new Map(); for (const [k, n] of counts) { const arrs = {}; for (const nm of names) arrs[nm] = new Float32Array(n * 3 * g.attributes[nm].itemSize); out.set(k, { arrs, fill: 0 }); }
    for (let t = 0; t < triN; t++) { const B = out.get(tileOf[t]); for (const nm of names) { const a = g.attributes[nm], sz = a.itemSize * 3; B.arrs[nm].set(a.array.subarray(t * sz, t * sz + sz), B.fill * sz); } B.fill++; }
    const isRay = rayTargets.indexOf(o); const isNight = nightOnly.indexOf(o);
    for (const [, B] of out) { const ng = new THREE.BufferGeometry(); for (const nm of names) ng.setAttribute(nm, new THREE.BufferAttribute(B.arrs[nm], g.attributes[nm].itemSize)); ng.computeBoundingSphere(); const m = new THREE.Mesh(ng, o.material); m.castShadow = o.castShadow; m.receiveShadow = o.receiveShadow; m.renderOrder = o.renderOrder; scene.add(m); if (isRay >= 0) rayTargets.push(m); if (isNight >= 0) nightOnly.push(m); if (o === roadMeshRef) roadChunks.push(m); }
    if (isRay >= 0) rayTargets.splice(rayTargets.indexOf(o), 1); if (isNight >= 0) nightOnly.splice(nightOnly.indexOf(o), 1); scene.remove(o); o.geometry.dispose(); if (g !== o.geometry) g.dispose();
  }
}

function puddleTex() { const N = 256; const c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'); x.fillStyle = '#f0f0f0'; x.fillRect(0, 0, N, N);
  for (let i = 0; i < 26; i++) { const px = Math.random() * N, py = Math.random() * N, r = 6 + Math.random() * 22; const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(25,25,25,1)'); g.addColorStop(0.6, 'rgba(60,60,60,0.8)'); g.addColorStop(1, 'rgba(60,60,60,0)'); x.fillStyle = g; x.save(); x.translate(px, py); x.scale(1, 0.5 + Math.random()); x.translate(-px, -py); x.beginPath(); x.arc(px, py, r, 0, 7); x.fill(); x.restore(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.05, 0.05); return t; }

// Fenster mit Tiefe: Laibung, Fensterkreuz und Raum dahinter (Interior Mapping), rein im Shader
function windowDepth(mat, big) {
  const u0 = big ? 0.19 : 0.28, u1 = 1 - u0, v0 = big ? 0.22 : 0.30, v1 = 0.80;
  mat.onBeforeCompile = sh => {
    sh.uniforms.uWin = WIN_U;
    sh.vertexShader = 'varying vec3 vWP; varying vec3 vWN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWP = (modelMatrix * vec4(position, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = 'uniform float uWin; varying vec3 vWP; varying vec3 vWN;\nfloat h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  {
    vec3 N = normalize(vWN);
    if (uWin > 0.5 && abs(N.y) < 0.5) {
      vec2 cell = vMapUv * 4.0; vec2 cid = floor(cell); vec2 f = fract(cell);
      const vec2 CS = vec2(${(FAC_W / 4).toFixed(3)}, ${(FAC_H / 4).toFixed(3)});
      vec3 T = abs(N.x) > abs(N.z) ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
      vec3 V = normalize(vWP - cameraPosition);
      float vu = dot(V, T), vv = V.y, vd = max(dot(V, -N), 0.05);
      vec2 pm = f * CS; vec2 r0 = vec2(${u0}, ${v0}) * CS, r1 = vec2(${u1}, ${v1}) * CS;
      if (pm.x > r0.x && pm.x < r1.x && pm.y > r0.y && pm.y < r1.y) {
        float D = 0.2; vec2 q = pm + vec2(vu, vv) * (D / vd);
        vec3 wall = diffuseColor.rgb;
        if (q.x < r0.x) diffuseColor.rgb = wall * 0.78; else if (q.x > r1.x) diffuseColor.rgb = wall * 0.78;
        else if (q.y > r1.y) diffuseColor.rgb = wall * 0.5; else if (q.y < r0.y) diffuseColor.rgb = wall * 0.95;
        else {
          vec2 mid = (r0 + r1) * 0.5; float fr = step(abs(q.x - mid.x), 0.035) + step(abs(q.y - mid.y - 0.15), 0.035) + step(q.x - r0.x, 0.05) + step(r1.x - q.x, 0.05) + step(q.y - r0.y, 0.05) + step(r1.y - q.y, 0.05);
          if (fr > 0.0) diffuseColor.rgb = vec3(0.86, 0.84, 0.8);
          else {
            float rnd = h21(cid + floor(vWP.xz / 40.0));
            vec3 o = vec3(q.x, q.y, 0.0), d = vec3(vu, vv, vd); float R = 3.5;
            float tx = d.x > 0.0 ? (CS.x - o.x) / d.x : -o.x / d.x; float ty = d.y > 0.0 ? (CS.y - o.y) / d.y : -o.y / d.y; float tz = R / d.z;
            vec3 room; float t = min(tx, min(ty, tz));
            vec3 wcol = mix(vec3(0.75, 0.68, 0.58), vec3(0.62, 0.7, 0.72), step(0.5, rnd));
            if (t == tz) { vec3 hp = o + d * t; room = wcol * 0.9; if (rnd > 0.6 && hp.y < 1.6 && abs(hp.x - CS.x * 0.5) < 0.9) room = vec3(0.35, 0.22, 0.15); }
            else if (t == ty) room = d.y > 0.0 ? vec3(0.85) : vec3(0.42, 0.3, 0.2);
            else room = wcol * 0.7;
            room *= 0.75 / (1.0 + t * 0.3);
            float fres = pow(1.0 - vd, 4.0) * 0.7 + 0.04;
            diffuseColor.rgb = mix(room, vec3(0.55, 0.62, 0.72), fres);
          }
        }
      }
    }
  }`);
  };
  mat.customProgramCacheKey = () => 'win' + (big ? 1 : 0);
}

// ---------- Ragdoll: Verlet-Punkte an den Gelenken, Knochen folgen ----------
const RD_J = ['Body', 'Neck', 'Head', 'UpperArmL', 'LowerArmL', 'PalmL', 'UpperArmR', 'LowerArmR', 'PalmR', 'UpperLegL', 'LowerLegL', 'FootL', 'UpperLegR', 'LowerLegR', 'FootR'];
const RD_TORSO = [0, 1, 3, 6, 9, 12];
const RD_LINKS = [[3, 4], [4, 5], [6, 7], [7, 8], [9, 10], [10, 11], [12, 13], [13, 14], [1, 2], [2, 3, 0.6], [2, 6, 0.6], [4, 0, 0.15], [7, 0, 0.15], [10, 12, 0.2], [13, 9, 0.2], [11, 14, 0.1], [5, 1, 0.05], [8, 1, 0.05]];
const RD_AIM = [['Neck', 1, 2], ['UpperArmL', 3, 4], ['LowerArmL', 4, 5], ['UpperArmR', 6, 7], ['LowerArmR', 7, 8], ['UpperLegL', 9, 10], ['LowerLegL', 10, 11], ['UpperLegR', 12, 13], ['LowerLegR', 13, 14]];
const rd_v1 = new THREE.Vector3(), rd_v2 = new THREE.Vector3(), rd_q1 = new THREE.Quaternion(), rd_q2 = new THREE.Quaternion(), rd_m1 = new THREE.Matrix4(), rd_m2 = new THREE.Matrix4();
function rdBasis(P, m) { const up = rd_v1.subVectors(P[1], P[0]).normalize(), side = rd_v2.subVectors(P[6], P[3]); side.addScaledVector(up, -side.dot(up)).normalize(); const fw = new THREE.Vector3().crossVectors(side, up); return m.makeBasis(side, up, fw); }
function ragdoll(h, u, dt) {
  if (u.rdFail) return false;
  if (!u.rd) {
    const B = {}; h.traverse(o => { if (o.isBone) B[o.name] = o; }); B.PalmL = B.PalmL || B.WristL; B.PalmR = B.PalmR || B.WristR; if (!RD_J.every(n => B[n])) { u.rdFail = true; return false; }
    if (u.mixer) u.mixer.stopAllAction(); h.updateMatrixWorld(true);
    const P = RD_J.map(n => B[n].getWorldPosition(new THREE.Vector3()));
    if (P[2].distanceTo(P[1]) < 0.05) P[2].add(rd_v1.subVectors(P[1], P[0]).normalize().multiplyScalar(0.25));
    const v0 = (u.fly ? u.fly.clone() : (u.fallDir ? u.fallDir.clone().setY(0).normalize().multiplyScalar(3.2) : new THREE.Vector3())).multiplyScalar(1 / 60);
    const O = P.map((p, i) => p.clone().sub(v0).sub(i === 2 || i === 1 ? v0.clone().multiplyScalar(0.6) : rd_v1.set(0, 0, 0)));
    const C = []; for (let a = 0; a < RD_TORSO.length; a++) for (let b = a + 1; b < RD_TORSO.length; b++) C.push([RD_TORSO[a], RD_TORSO[b], 1]);
    for (const [a, b, k] of RD_LINKS) C.push([a, b, k ?? 1]); for (const c of C) c.push(P[c[0]].distanceTo(P[c[1]]));
    const B0 = rdBasis(P, new THREE.Matrix4()); const bodyQ0 = B.Body.getWorldQuaternion(new THREE.Quaternion());
    const ft = ['FootL', 'FootR'].map(n => B[n].getWorldQuaternion(new THREE.Quaternion())); const ll0 = [rd_v1.subVectors(P[11], P[10]).clone().normalize(), rd_v1.subVectors(P[14], P[13]).clone().normalize()];
    const ld = {}; for (const [n, a, b] of RD_AIM) { const wq = B[n].getWorldQuaternion(new THREE.Quaternion()).invert(); ld[n] = new THREE.Vector3().subVectors(P[b], P[a]).normalize().applyQuaternion(wq); }
    u.rd = { B, P, O, C, B0inv: B0.clone().invert(), bodyQ0, ft, ll0, ld, t: 0 }; u.fly = null; h.rotation.x = 0;
  }
  const R = u.rd; R.t += dt; if (R.t > 7) return true; // liegt still
  // Fester Schritt 1/60 s mit Akkumulator (höchstens 4 Schritte je Bild): Verlet-Dämpfung und Schwerkraft hängen sonst von der Bildrate ab
  const P = R.P, O = R.O, H = 1 / 60; R.acc = Math.min((R.acc || 0) + dt, 4 * H); const F = R.F || (R.F = new Float64Array(P.length));
  while (R.acc >= H - 1e-9) { R.acc -= H;
    for (let i = 0; i < P.length; i++) { const p = P[i], o = O[i]; const vx = (p.x - o.x) * 0.995, vy = (p.y - o.y) * 0.995, vz = (p.z - o.z) * 0.995; o.copy(p); p.x += vx; p.y += vy - 9.8 * H * H; p.z += vz; F[i] = floorAt(p.x, p.z, p.y + 0.3) + (i === 2 ? 0.1 : 0.06); /* Boden je Punkt einmal je Schritt: Brückendeck, Dach, Gelände */ }
    for (let it = 0; it < 8; it++) {
      for (const [a, b, k, L] of R.C) { const pa = P[a], pb = P[b]; rd_v1.subVectors(pb, pa); const d = rd_v1.length() || 1e-4; const f = (d - L) / d * 0.5 * k; pa.addScaledVector(rd_v1, f); pb.addScaledVector(rd_v1, -f); }
      for (let i = 0; i < P.length; i++) { const p = P[i], fy = F[i]; if (p.y < fy) { p.y = fy; const o = O[i]; o.x += (p.x - o.x) * 0.35; o.z += (p.z - o.z) * 0.35; } if (solidAtH(p.x, p.z, p.y) !== -1) { p.x = O[i].x; p.z = O[i].z; } }
    }
  }
  // Knochen nachführen: Rumpf als starrer Körper, Glieder auf ihre Gelenkpunkte ausrichten
  const B = R.B; const D = rd_m1.multiplyMatrices(rdBasis(P, rd_m2), R.B0inv); const dq = rd_q1.setFromRotationMatrix(D);
  const setWorld = (bone, q, pos) => { const par = bone.parent; par.updateMatrixWorld(true); const pq = par.getWorldQuaternion(rd_q2).invert(); bone.quaternion.copy(pq.multiply(q)); if (pos) { bone.position.copy(par.worldToLocal(pos.clone())); } bone.updateMatrixWorld(true); };
  setWorld(B.Body, dq.clone().multiply(R.bodyQ0), P[0]);
  for (const [n, a, b] of RD_AIM) { const bone = B[n]; bone.updateMatrixWorld(true); const wq = bone.getWorldQuaternion(new THREE.Quaternion()); const cur = R.ld[n].clone().applyQuaternion(wq); const tgt = rd_v1.subVectors(P[b], P[a]).normalize(); setWorld(bone, new THREE.Quaternion().setFromUnitVectors(cur, tgt).multiply(wq)); }
  for (const [k, a, b] of [[0, 10, 11], [1, 13, 14]]) { const foot = B[RD_J[b]]; const tgt = new THREE.Vector3().subVectors(P[b], P[a]).normalize(); const dl = new THREE.Quaternion().setFromUnitVectors(R.ll0[k], tgt); const knee = B[RD_J[a]].getWorldPosition(new THREE.Vector3()); setWorld(foot, dl.multiply(R.ft[k].clone()), knee.addScaledVector(tgt, R.C.find(c => c[0] === a && c[1] === b)[3])); }
  return true;
}

// ---------- Brücken und Rampen: Höhenprofil der Straßen ----------
const deckGrid = new Map(); const DCELL = 20;
function segX(ax, az, bx, bz, cx, cz, dx, dz) { const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz; const den = rx * sz - rz * sx; if (Math.abs(den) < 1e-9) return null; const t = ((cx - ax) * sz - (cz - az) * sx) / den, u = ((cx - ax) * rz - (cz - az) * rx) / den; return t > 0.001 && t < 0.999 && u >= 0 && u <= 1 ? t : null; }
function computeRoadHeights() {
  const CLEAR = 6.8; const under = CITY.roads.filter(r => !r.br).map(r => r.p).concat((CITY.rails || []).map(r => r.p));
  const need = new Map(); // Punktschlüssel -> Mindesthöhe über dem, was darunter kreuzt
  for (const r of CITY.roads) { if (!r.br) continue; const np = [r.p[0]];
    for (let i = 0; i < r.p.length - 1; i++) { const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const hits = [];
      for (const q of under) for (let j = 0; j < q.length - 1; j++) { const t = segX(ax, az, bx, bz, q[j][0], q[j][1], q[j + 1][0], q[j + 1][1]); if (t !== null) hits.push(t); }
      hits.sort((a, b) => a - b); for (const t of hits) { const x = ax + (bx - ax) * t, z = az + (bz - az) * t; const pt = [+x.toFixed(2), +z.toFixed(2)]; np.push(pt); need.set(pt.join(','), TH(x, z) + CLEAR); }
      np.push(r.p[i + 1]); }
    r.p = np; }
  // Höhen je Punkt; gemeinsame Knoten teilen sich die Höhe; nur anheben, Steigung begrenzen
  const H = new Map(); const k = p => p[0] + ',' + p[1];
  for (const r of CITY.roads) for (const p of r.p) { const kk = k(p); const h = Math.max(TH(p[0], p[1]), need.get(kk) || -1e9); H.set(kk, Math.max(H.get(kk) ?? -1e9, h)); }
  const bn = new Set(CITY.roads.filter(r => r.br && r.n).map(r => r.n)); const chain = CITY.roads.filter(r => r.br || r.mw || (r.n && bn.has(r.n)));
  for (let pass = 0; pass < 80; pass++) { let ch = false;
    for (const r of chain) { const sl = r.mw ? 0.045 : 0.07; for (let i = 0; i < r.p.length - 1; i++) { const a = k(r.p[i]), b = k(r.p[i + 1]); const d = Math.hypot(r.p[i + 1][0] - r.p[i][0], r.p[i + 1][1] - r.p[i][1]); const ha = H.get(a), hb = H.get(b);
      if (hb < ha - sl * d - 0.01) { H.set(b, ha - sl * d); ch = true; } if (ha < hb - sl * d - 0.01) { H.set(a, hb - sl * d); ch = true; } } }
    if (!ch) break; }
  for (const r of CITY.roads) { r.ry = r.p.map(p => H.get(k(p))); r.el = r.p.map((p, i) => r.ry[i] > TH(p[0], p[1]) + 0.25);
    if (!r.el.some(Boolean)) { delete r.ry; delete r.el; continue; }
    for (let i = 0; i < r.p.length - 1; i++) { if (!r.el[i] && !r.el[i + 1]) continue; const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1];
      const seg = { ax, az, bx, bz, ya: r.el[i] ? r.ry[i] : TH(ax, az), yb: r.el[i + 1] ? r.ry[i + 1] : TH(bx, bz), w: r.w / 2 + (r.mw ? 0.8 : 2.5), r };
      const x0 = Math.floor((Math.min(ax, bx) - seg.w) / DCELL), x1 = Math.floor((Math.max(ax, bx) + seg.w) / DCELL), z0 = Math.floor((Math.min(az, bz) - seg.w) / DCELL), z1 = Math.floor((Math.max(az, bz) + seg.w) / DCELL);
      for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) { const kk = gx + ',' + gz; if (!deckGrid.has(kk)) deckGrid.set(kk, []); deckGrid.get(kk).push(seg); } } }
}
// Fahrbahnhöhe einer Brücke/Rampe an (x,z), nur wenn sie von Höhe y aus erreichbar ist
function deckAt(x, z, y = 1e9, reach = 1.0) { const c = deckGrid.get(Math.floor(x / DCELL) + ',' + Math.floor(z / DCELL)); if (!c) return null; let best = null;
  for (const s of c) { const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz || 1; const t = clamp(((x - s.ax) * dx + (z - s.az) * dz) / L2, 0, 1); const ex = x - s.ax - dx * t, ez = z - s.az - dz * t; if (ex * ex + ez * ez > s.w * s.w) continue;
    const h = s.ya + (s.yb - s.ya) * t; if (h <= y + reach && (best === null || h > best)) best = h; }
  return best; }
function surfAt(x, z, y) { const t = TH(x, z); const d = deckAt(x, z, y, 1.0); return d !== null && d > t ? d : t; }
function buildBridges() {
  const deck = [], walls = [], pil = []; const box = (arr, cx, cy, cz, sx, sy, sz, rotY) => { const g = new THREE.BoxGeometry(sx, sy, sz); g.rotateY(rotY); g.translate(cx, cy, cz); arr.push(g); };
  const quad = (arr, P) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([...P[0], ...P[1], ...P[2], ...P[0], ...P[2], ...P[3]], 3)); g.computeVertexNormals(); arr.push(g); };
  for (const r of CITY.roads) { if (!r.ry) continue; const hw = r.w / 2 + (r.mw ? 0.8 : 2.5); let run = 0;
    for (let i = 0; i < r.p.length - 1; i++) { if (!r.el[i] && !r.el[i + 1]) continue; const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const ya = r.el[i] ? r.ry[i] : TH(ax, az), yb = r.el[i + 1] ? r.ry[i + 1] : TH(bx, bz);
      const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l, rot = Math.atan2(dx, dz);
      const n = Math.max(1, Math.ceil(l / 4));
      for (let k = 0; k < n; k++) { const t0 = k / n, t1 = (k + 1) / n; const p0 = [ax + dx * t0, az + dz * t0], p1 = [ax + dx * t1, az + dz * t1]; const y0 = ya + (yb - ya) * t0, y1 = ya + (yb - ya) * t1;
        const g0 = TH(p0[0], p0[1]), g1 = TH(p1[0], p1[1]); const hi = Math.min(y0 - g0, y1 - g1); if (Math.max(y0 - g0, y1 - g1) < 0.15) continue;
        for (const sd of [1, -1]) { const ox = nx * hw * sd, oz = nz * hw * sd; const L0 = [p0[0] + ox, p0[1] + oz], L1 = [p1[0] + ox, p1[1] + oz];
          const P = sd > 0 ? [[L0[0], y0 + 0.02, L0[1]], [L1[0], y1 + 0.02, L1[1]], [L1[0], y1 + 1.0, L1[1]], [L0[0], y0 + 1.0, L0[1]]] : [[L1[0], y1 + 0.02, L1[1]], [L0[0], y0 + 0.02, L0[1]], [L0[0], y0 + 1.0, L0[1]], [L1[0], y1 + 1.0, L1[1]]]; quad(walls, P);
          const underR = onOtherRoad((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, r, 1.5);
          const b0 = hi < 3.2 && !underR ? TH(L0[0], L0[1]) - 0.3 : y0 - 1.2, b1 = hi < 3.2 && !underR ? TH(L1[0], L1[1]) - 0.3 : y1 - 1.2;
          const S = sd > 0 ? [[L0[0], b0, L0[1]], [L1[0], b1, L1[1]], [L1[0], y1 + 0.02, L1[1]], [L0[0], y0 + 0.02, L0[1]]] : [[L1[0], b1, L1[1]], [L0[0], b0, L0[1]], [L0[0], y0 + 0.02, L0[1]], [L1[0], y1 + 0.02, L1[1]]]; quad(deck, S); }
        if (hi >= 3.2 || onOtherRoad((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, r, 1.5)) { const A = [p0[0] + nx * hw, y0 - 1.2, p0[1] + nz * hw], B = [p1[0] + nx * hw, y1 - 1.2, p1[1] + nz * hw], C = [p1[0] - nx * hw, y1 - 1.2, p1[1] - nz * hw], D = [p0[0] - nx * hw, y0 - 1.2, p0[1] - nz * hw]; quad(deck, [A, D, C, B]); }
        run += l / n; const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]; const my = (y0 + y1) / 2, mg = TH(mid[0], mid[1]);
        if (hi >= 3.2 && run >= 22 && !onOtherRoad(mid[0], mid[1], r, 0.8)) { run = 0; const ph = my - 1.2 - mg + 0.3; for (const sd of [0.55, -0.55]) box(pil, mid[0] + nx * hw * sd, mg - 0.3 + ph / 2, mid[1] + nz * hw * sd, 1.0, ph, 1.4, rot); box(pil, mid[0], my - 1.5, mid[1], 1.6, 0.6, hw * 2 * 0.8 + 1, rot + Math.PI / 2); } } } }
  const mat = shLambert(0xb9b5ad, THREE.DoubleSide);
  for (const arr of [deck, walls, pil]) if (arr.length) { const geos = arr.map(g => { const gg = g.index ? g.toNonIndexed() : g; for (const a of Object.keys(gg.attributes)) if (a !== 'position' && a !== 'normal') gg.deleteAttribute(a); return gg; }); const m = new THREE.Mesh(mergeGeometries(geos), mat); m.castShadow = true; m.receiveShadow = true; scene.add(m); rayTargets.push(m); }
}
// Gelände: Rasterweite je Qualitätsstufe (4 m Hoch/Ultra, 8 m Mittel, 12 m Niedrig). Gröberes Gelände liegt etwas tiefer, damit es nicht durch Straßen ragt.
let groundMesh = null, groundStep = 0;
function groundMul() { const q = opts.quality || 'mittel'; return q === 'niedrig' ? 3 : q === 'mittel' ? 2 : 1; }
// Höhe eines groben Gitterpunkts: tiefster feiner Punkt im Umkreis, damit die grobe Fläche unter Straßen bleibt
// Straßenkorridor: Höhe der Mittellinie, wenn (x,z) auf Fahrbahn oder Gehweg liegt
function corridorH(x, z) { const g = getRoadGrid(); const cx0 = Math.floor(x / CELL), cz0 = Math.floor(z / CELL); let best = null;
  const pad = DEM.step * groundMul() + 1.5;
  { const c = g.get(key(cx0, cz0)); if (c) {
  for (const [r, i] of c) { if (r.ry && (r.el[i] || r.el[i + 1])) continue; const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const lim = r.w / 2 + (r.mw ? 1.6 : 2.6) + pad; const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1; const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1); const ex = x - ax - dx * t, ez = z - az - dz * t; if (ex * ex + ez * ez > lim * lim) continue; const px = ax + dx * t, pz = az + dz * t; let h = TH(px, pz); if (r.mw && deckAt(px, pz, 1e9, 0) !== null) h = Math.min(h, TH(ax, az) * (1 - t) + TH(bx, bz) * t); if (best === null || h < best) best = h; } } }
  { const pc = pathGrid.get(key(cx0, cz0)); if (pc) { const lim2 = (1.5 + pad) ** 2;
  for (const [r, i] of pc) { const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1; const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1); const ex = x - ax - dx * t, ez = z - az - dz * t; if (ex * ex + ez * ez > lim2) continue; const h = TH(ax + dx * t, az + dz * t); if (best === null || h < best) best = h; } } }
  return best; }
function groundH(x, z, mul) { const wy = waterAt(x, z, TH(x, z)); if (wy !== null) return Math.min(TH(x, z), wy - 3); /* Gewässergrund: das Gelände-Raster liegt im Main auf dem Wasserspiegel, Schwimmer steckten darin (#84) */ const cr = corridorH(x, z); const g = groundH0(x, z, mul); if (cr === null) return g;
  let m = Math.min(g, cr); if (mul > 1) { const s = DEM.step * (mul - 1) * 0.5; m = Math.min(m, TH(x - s, z), TH(x + s, z), TH(x, z - s), TH(x, z + s)); }
  return m - 0.05 * mul; }
// Grobes Gelände folgt der echten Höhe (früher: tiefster Punkt der Umgebung, das ließ Grünflächen und Plätze am Hang bis 0,5 m schweben); Straßen senkt corridorH ab
function groundH0(x, z, mul) { return TH(x, z); }
function buildGround() {
  const mul = groundMul(); const step = DEM.step * mul; if (groundMesh && groundStep === step) return; groundStep = step;
  const nx = Math.floor((DEM.nx - 1) / mul), nz = Math.floor((DEM.nz - 1) / mul); const drop = mul === 1 ? 0.03 : 0.06;
  const gg = new THREE.PlaneGeometry(nx * step, nz * step, nx, nz);
  gg.rotateX(-Math.PI / 2); gg.translate(DEM.x0 + nx * step / 2, 0, DEM.z0 + nz * step / 2);
  { const pa = gg.attributes.position; for (let i = 0; i < pa.count; i++) pa.setY(i, groundH(pa.getX(i), pa.getZ(i), mul) - drop); gg.computeVertexNormals(); }
  { const nn = gg.attributes.normal, cc = new Float32Array(nn.count * 3), dirt = new THREE.Color(0x6e6a60), grass = new THREE.Color(0x5d7c3c), t = new THREE.Color(); for (let i = 0; i < nn.count; i++) { const k = clamp((1 - nn.getY(i) - 0.012) * 18, 0, 1); t.copy(dirt).lerp(grass, k); cc[i * 3] = t.r; cc[i * 3 + 1] = t.g; cc[i * 3 + 2] = t.b; } gg.setAttribute('color', new THREE.BufferAttribute(cc, 3)); }
  if (groundMesh) { scene.remove(groundMesh); groundMesh.geometry.dispose(); const k = rayTargets.indexOf(groundMesh); if (k >= 0) rayTargets.splice(k, 1); }
  groundMesh = new THREE.Mesh(gg, groundMesh ? groundMesh.material : new THREE.MeshLambertMaterial({ vertexColors: true })); groundMesh.receiveShadow = true; scene.add(groundMesh); rayTargets.push(groundMesh); }
const WIN_U = { value: 1 };
let leafMat = null, blobMat = null;
const leafMeshes = [], crownMeshes = [];
function applyTreeQuality() { if (!leafMat) return; const leafy = opts.quality === 'hoch' || opts.quality === 'ultra'; leafMat.visible = leafy; blobMat.visible = !leafy; for (let i = 0; i < leafMeshes.length; i++) leafMeshes[i].visible = leafy; for (let i = 0; i < crownMeshes.length; i++) crownMeshes[i].visible = !leafy; }
// Stützen unter aufgeständerten Bauten: Ecken des Grundrisses, höchstens 8
function pillarSpots(b) { const P = b.p; const n = P.length; const step = Math.max(1, Math.floor(n / 8)); const out = []; for (let i = 0; i < n; i += step) { const [x, z] = P[i]; const [cx, cz] = [P.reduce((a, p) => a + p[0], 0) / n, P.reduce((a, p) => a + p[1], 0) / n]; const d = Math.hypot(cx - x, cz - z) || 1; out.push([x + (cx - x) / d * 0.5, z + (cz - z) / d * 0.5]); } return out; }
// Tor einer Durchfahrt: wo der Korridor die Hauswand echt schneidet, eine dunkle Öffnung knapp vor der Fassade (auf Wandlänge geklemmt, ragt nie über Hausecken hinaus)
function gateQuads(b, q, out) { const [ax, az, bx, bz, hw] = q; const P = b.p; const sgn = polyArea(P) > 0 ? 1 : -1;
  for (let i = 0; i < P.length; i++) { const [cx, cz] = P[i], [dx, dz] = P[(i + 1) % P.length]; const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz; const den = rx * sz - rz * sx; if (Math.abs(den) < 1e-9) continue;
    const t = ((cx - ax) * sz - (cz - az) * sx) / den, u = ((cx - ax) * rz - (cz - az) * rx) / den; if (t < 0.02 || t > 0.98 || u < 0.05 || u > 0.95) continue;
    const l = Math.hypot(sx, sz) || 1, ex = sx / l, ez = sz / l, sinA = Math.abs(rx * ez - rz * ex) / (Math.hypot(rx, rz) || 1); if (sinA < 0.5) continue;
    const nx = ez * sgn, nz = -ex * sgn, w = hw / sinA, s0 = Math.max(0.25, u * l - w), s1 = Math.min(l - 0.25, u * l + w); if (s1 - s0 < 1.6) continue;
    const ox = nx * 0.07, oz = nz * 0.07, ax0 = cx + ex * s0 + ox, az0 = cz + ez * s0 + oz, bx0 = cx + ex * s1 + ox, bz0 = cz + ez * s1 + oz;
    const y0 = Math.min(TH(ax0, az0), TH(bx0, bz0)) - 0.3, y1 = Math.min((b.base ?? y0) + Math.min(4, b.h - 0.6), (b.base ?? y0) + 4);
    const A = [ax0, y0, az0], B = [bx0, y0, bz0], C = [bx0, y1, bz0], D = [ax0, y1, az0];
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([...A, ...B, ...C, ...A, ...C, ...D], 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute([nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz], 3)); out.push(g); } }
function* buildCity() {
  const palette = [0xd9c7b0, 0xcdb8a3, 0xe3d6c4, 0xb8a894, 0xd4b9a0, 0xc8c2b6, 0xe8dccb, 0xb49f8c, 0xd6cfc2, 0xc49e85, 0xb7c4c9, 0xd8b0a8];
  const byKey = new Map(); // "art|farbe" -> Wandgeometrien
  const roofMat = ROOF_MAT || (ROOF_MAT = Object.assign(new THREE.MeshLambertMaterial({ map: roofTex }), { userData: { shared: true } })); const roofGeos = [], tileGeos = [], gableGeos = []; const dW = [], dR = [], dG = []; // Gauben: Wände, Dach, Glas
  const gfByKind = new Map(); // Erdgeschoss je Art
  const GEWERBE = new Set(); for (const p of CITY.pois) { if (/^(kindergarten|school|doctors|dentist|atm|post_box)$/.test(p.k)) continue; const ne = nearestEdge(p.x, p.z, 8); if (ne) GEWERBE.add(ne.b); } for (const b of CITY.buildings) if (b.shop) GEWERBE.add(b); // Laden im Erdgeschoss nur, wo OSM ein Gewerbe kennt (André 12.11.2026)
  const gateGeos = []; // Durchfahrt-Tore (dunkle Öffnung) und Stützen unter aufgeständerten Bauten
  const SCHULHOF = CITY_SCHOOLS(); // Schulgelände (OSM-Flächen) mit Rahmen, für Gebäude ohne Namen
  const kindOf = b => { if (b._kind) return b._kind; const n = b.n || ''; let k = b.k || 'res';
    if (/Feuerwache|Rettungswache|Feuer- und Rettungs|Feuerwehr/i.test(n) && !/Training/i.test(n)) k = 'wache';
    else if (!n && WACHE_OHNE_NAMEN.some(([x, z]) => { const [cx, cz] = centroidOf(b.p); return Math.hypot(cx - x, cz - z) < 6; })) k = 'wache';
    else if (/^Messeturm$/.test(n)) k = 'messeturm';
    else if (/Europäische Zentralbank/.test(n)) k = 'ezb';
    else if (/^Hauptwache$/.test(n)) k = 'barock';
    else if (/schule|gymnasium|\bIGS\b/i.test(n)) k = 'school';
    else if ((k === 'res' || k === 'public' || k === 'small') && SCHULHOF.length) { const [cx, cz] = centroidOf(b.p); if (SCHULHOF.some(s => cx > s.x0 && cx < s.x1 && cz > s.z0 && cz < s.z1 && pointInPoly(cx, cz, s.p))) k = 'school'; }
    if (k === 'school' && b.r && b.rh > 0) k = 'altschule'; // Steildach: Gründerzeitbau wie die Kirchnerschule (Foto 12.11.2026)
    return (b._kind = k); };
  const facKind = (b, kind) => { if (['wache', 'school', 'altschule', 'messeturm', 'barock', 'ezb'].includes(kind)) return kind;
    { const [cx, cz] = centroidOf(b.p); if ((kind === 'res' || kind === 'public') && b.h >= 14 && cx > -3000 && cx < -1500 && cz > 1200 && cz < 2600 && Math.abs((b.p[0][0] * 13 + b.p[0][1] * 7) | 0) % 10 < 3) return 'sandstein'; } /* Innenstadt: rote Sandsteinbauten wie das Metropolis */
    if (kind !== 'res') return kind; const hsh = Math.abs((b.p[0][0] * 31 + b.p[0][1] * 17) | 0) % 12;
    { const [cx, cz] = centroidOf(b.p); if (b.h >= 10 && WOELL.some((p, i) => i && distSegSq(cx, cz, WOELL[i - 1][0], WOELL[i - 1][1], p[0], p[1]) < 625)) return 'zwanziger'; if (b.h >= 10 && hsh >= 6 && hsh < 8 && cz < -300 && cz > -900 && cx > -700 && cx < 900) return 'zwanziger'; if (b.h >= 11 && b.h <= 19 && hsh >= 8 && hsh < 10 && cz < 300 && cz > -1600 && cx > -1600 && cx < 1600) return 'abg'; } // Wöllstädter Straße und Bornheim-Nord; ABG-Häuser
    if (b.h >= 12 && hsh >= 2 && hsh < 6) { const [cx, cz] = centroidOf(b.p); if (cx > -800 && cx < 900 && cz > -900 && cz < 900) return 'gruender'; } // Bornheim: Gründerzeit wie an der Berger Straße
    if (b.r && b.rh > 0 && b.h <= 11.5) { const [cx, cz] = centroidOf(b.p); const alt = cx > -80 && cx < 460 && cz > -400 && cz < 220; /* Alt-Bornheim: Eulengasse, Turmstraße, Rendeler Straße */ if (alt && hsh < 7) return 'fw'; if (alt && hsh < 9) return 'schiefer'; if (!alt && hsh === 0) return 'schiefer'; } return hsh < 6 ? 'res' : hsh < 8 ? 'nk' : hsh < 10 ? 'nb' : 'zi'; };
  for (const b of CITY.buildings) { if (++YC % 3 === 0) yield;
    const kind = kindOf(b);
    if (kind === 'wache') WACHEN.push(centroidOf(b.p));
    if (!HECKE_DONE.v && CITY.buildings.length) { HECKE_DONE.v = 1; // Feuerdorn-Hecken mit roten Beeren an der Wöllstädter Straße (Foto Caravan)
      const ht = canvasTex(128, 64, (c, w, h) => { c.fillStyle = '#2c4a26'; c.fillRect(0, 0, w, h); for (let i = 0; i < 500; i++) { c.fillStyle = Math.random() < 0.12 ? '#e0521c' : pick(['#36592e', '#24401f', '#41693a']); c.fillRect(Math.random() * w, Math.random() * h, 3, 3); } }, 1, 1);
      const hm = new THREE.MeshLambertMaterial({ map: ht }); const hg = [];
      for (let i = 1; i < WOELL.length; i++) { const [ax, az] = WOELL[i - 1], [bx, bz] = WOELL[i]; const l = Math.hypot(bx - ax, bz - az); const nx = -(bz - az) / l, nz = (bx - ax) / l; for (const sd of [-1, 1]) for (let s = 3; s < l - 3; s += 9) { if (Math.random() < 0.45) continue; const x = ax + (bx - ax) * s / l + nx * sd * 7.2, z = az + (bz - az) * s / l + nz * sd * 7.2; if (solidAt(x, z) >= 0) continue; const g2 = new THREE.BoxGeometry(4, 1.1, 0.9); g2.rotateY(Math.atan2(bx - ax, bz - az) + Math.PI / 2); g2.translate(x, TH(x, z) + 0.55, z); hg.push(g2); { const a2 = Math.atan2(bx - ax, bz - az); const ex = Math.cos(a2) * 2, ez = -Math.sin(a2) * 2; barrierAdd(x - ex, z - ez, x + ex, z + ez, 1.1); } } }
      if (hg.length) { const m = new THREE.Mesh(mergeGeometries(hg), hm); m.castShadow = m.receiveShadow = true; scene.add(m); } }
    for (const ZAPP of SCHILDER) if (!ZAPP.done && pointInPoly(ZAPP.x, ZAPP.z, b.p)) { ZAPP.done = 1; let best = null; for (let i = 0; i < b.p.length; i++) { const [ax, az] = b.p[i], [bx, bz] = b.p[(i + 1) % b.p.length]; const l = Math.hypot(bx - ax, bz - az); if (l < 2) continue; const t = Math.max(0, Math.min(1, ((ZAPP.x - ax) * (bx - ax) + (ZAPP.z - az) * (bz - az)) / (l * l))); const px = ax + (bx - ax) * t, pz = az + (bz - az) * t; const d = Math.hypot(px - ZAPP.x, pz - ZAPP.z); if (!best || d < best.d) best = { d, px, pz, ux: (bx - ax) / l, uz: (bz - az) / l }; }
      if (best) { const tex = canvasTex(256, 96, (c, w, h) => { c.fillStyle = ZAPP.bg; c.fillRect(0, 0, w, h); if (ZAPP.brezel) { c.strokeStyle = '#7a3a12'; c.lineWidth = 9; c.beginPath(); c.arc(w / 2 - 22, h / 2, 26, 0, 6.3); c.arc(w / 2 + 22, h / 2, 26, 3.14, 9.4); c.stroke(); } else { c.fillStyle = ZAPP.fg; let fs = 52; c.font = `bold ${fs}px sans-serif`; while (c.measureText(ZAPP.t).width > w - 16 && fs > 18) { fs--; c.font = `bold ${fs}px sans-serif`; } c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ZAPP.t, w / 2, h / 2 + 2); } }, 1, 1);
        const rand = shLambert(0x2a2a2a); const sg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 1.3), [rand, rand, rand, rand, new THREE.MeshBasicMaterial({ map: tex }), new THREE.MeshBasicMaterial({ map: tex })]);
        let nx = -best.uz, nz = best.ux; const [cx0, cz0] = centroidOf(b.p); if ((best.px - cx0) * nx + (best.pz - cz0) * nz < 0) { nx = -nx; nz = -nz; }
        sg.position.set(best.px + nx * 0.75, TH(best.px, best.pz) + 3.4, best.pz + nz * 0.75); sg.rotation.y = Math.atan2(nx, nz) + Math.PI / 2; scene.add(sg); } } // Zappbar, Frankfurter Kneipe (Fotos 12.11.2026)
    if (kind === 'messeturm' && !b._pyr && !b.lm) { /* nur noch Rückfall: normal baut wahrzeichen.js den Messeturm (13.11.2026) */ b._pyr = 1; b.h = 170; const [mx, mz] = centroidOf(b.p); let rr = 0; const mtA = farMat(0x8a5a4e), mtB = farMat(0x2a3340), mtC = farMat(0x7a4a40); FAR_HAZE.push({ mats: [mtA, mtB, mtC], x: mx, z: mz }); for (const [x, z] of b.p) rr = Math.max(rr, Math.hypot(x - mx, z - mz));
      { const kr = new THREE.Mesh(new THREE.BoxGeometry(rr * 1.18, 20, rr * 1.18), mtA); kr.rotation.y = Math.PI / 4; kr.position.set(mx, TH(mx, mz) + 180, mz); kr.castShadow = true; scene.add(kr); } /* gestufte Krone */
      { const zy = new THREE.Mesh(new THREE.CylinderGeometry(rr * 0.62, rr * 0.66, 31, 24), mtB); zy.position.set(mx, TH(mx, mz) + 190 + 15.5, mz); zy.castShadow = true; scene.add(zy); } // Glaszylinder unter der Spitze // Pyramidenspitze, 36 m, rotbraun wie der Granit (Foto 12.11.2026)
      const pm = new THREE.Mesh(new THREE.ConeGeometry(rr * 0.62, 36, 4), mtC); pm.rotation.y = Math.PI / 4; pm.position.set(mx, TH(mx, mz) + 221 + 18, mz); pm.castShadow = true; scene.add(pm); }
    if (b._stad) { const S = b._stad; scene.add(waldstadion(S.mx, S.mz, S.rx, S.rz, S.s)); } // Waldstadion und FSV-Stadion (markStadium)
    const shape = new THREE.Shape(b.p.map(([x, z]) => new THREE.Vector2(x, -z)));
    const ths = b.p.map(([x, z]) => TH(x, z)); const tBase = Math.min(...ths), tTop = Math.max(...ths); b.base = tTop; // Erdgeschoss auf dem höchsten Punkt
    if (b.lm || b._stad) continue; // Stadion: Modell aus waldstadion(), Wahrzeichen (#73) baut wahrzeichen.js, Kollision bleibt über WORLD.buildings
    const lift = b.mh >= 2.2 ? b.mh + (tTop - tBase) + 0.6 : 0; // aufgeständert: Körper erst ab der Unterkante
    const g = new THREE.ExtrudeGeometry(shape, { depth: b.h + (tTop - tBase) + 0.6 - lift, bevelEnabled: false });
    g.rotateX(-Math.PI / 2); g.translate(0, tBase - 0.6 + lift, 0);
    if (lift) { for (const [px, pz] of pillarSpots(b)) { const pg = new THREE.BoxGeometry(0.45, 1, 0.45); pg.scale(1, tTop + b.mh - TH(px, pz) + 0.3, 1); pg.translate(px, (TH(px, pz) + tTop + b.mh) / 2 - 0.15, pz); gateGeos.push(pg.toNonIndexed()); } }
    if (b.pass) for (const q of b.pass) gateQuads(b, q, gateGeos);
    const pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), ny = nrm.getY(i);
      if (Math.abs(ny) > 0.5) uv.setXY(i, x, z); else { const nx = nrm.getX(i), nz = nrm.getZ(i); uv.setXY(i, Math.abs(nx) > Math.abs(nz) ? z : x, y - tTop - GF_H); }
    }
    const fk = facKind(b, kind);
    const c = fk !== kind || ['wache', 'school', 'altschule', 'messeturm', 'barock'].includes(kind) ? 0xf6f6f6 : kind === 'church' ? 0x9a8f86 : kind === 'hall' ? pick([0xbfc3c7, 0xd0d4d8, 0xb9b1a6]) : palette[Math.abs((b.p[0][0] * 7 + b.p[0][1] * 13) | 0) % palette.length];
    const key = fk + '|' + c; if (!byKey.has(key)) byKey.set(key, []);
    for (const grp of g.groups) {
      const sub = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'uv']) { const a = g.attributes[name]; sub.setAttribute(name, new THREE.BufferAttribute(a.array.slice(grp.start * a.itemSize, (grp.start + grp.count) * a.itemSize), a.itemSize)); }
      sub.userData.base = tTop; sub.userData.top = tTop + b.h;
      (grp.materialIndex === 0 ? roofGeos : byKey.get(key)).push(sub);
    }
    // Erdgeschossband: je Kante ein Quad 4 cm vor der Wand, Tür/Fenster-Textur in Metern + Kontakt-Schatten am Gehweg
    if (b.h >= 2.5 && !(b.mh >= 2.2)) {
      const sgn = polyArea(b.p) > 0 ? 1 : -1; const v = [], uvs = [], nn = [], cc = []; let along = 0; const H = Math.min(GF_H, b.h);
      for (let i = 0; i < b.p.length; i++) {
        const [ax, az] = b.p[i], [bx, bz] = b.p[(i + 1) % b.p.length]; const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz); if (l < 1.5) { along += l; continue; }
        const nx = dz / l * sgn, nz = -dx / l * sgn; const ox = nx * 0.04, oz = nz * 0.04; const ya = TH(ax, az) - 0.4, yb = TH(bx, bz) - 0.4, yt = b.base + H;
        /* Dreiecke immer gegen den Uhrzeigersinn von außen: bei umgekehrt gespeichertem Umriss (sgn > 0) Ecken tauschen, sonst
           zeigt die Vorderseite nach innen und Tür/Hausnummer stehen von außen spiegelverkehrt (Rödelheim, André 12.11.2026) */
        const [pa, pb, ka, kb] = sgn > 0 ? [[bx, bz], [ax, az], yb, ya] : [[ax, az], [bx, bz], ya, yb];
        const A = [pa[0] + ox, ka, pa[1] + oz], B = [pb[0] + ox, kb, pb[1] + oz], C = [pb[0] + ox, yt, pb[1] + oz], D = [pa[0] + ox, yt, pa[1] + oz];
        const tri = (P, Q, R, uP, uQ, uR, cP, cQ, cR) => { v.push(...P, ...Q, ...R); uvs.push(...uP, ...uQ, ...uR); nn.push(nx, 0, nz, nx, 0, nz, nx, 0, nz); cc.push(cP, cP, cP, cQ, cQ, cQ, cR, cR, cR); };
        tri(A, B, C, [along, 0], [along + l, 0], [along + l, H], 0.78, 0.78, 0.96); tri(A, C, D, [along, 0], [along + l, H], [along, H], 0.78, 0.96, 0.96);
        along += l;
      }
      if (v.length) { const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); bg.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3)); bg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); bg.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3)); const gk = kind === 'res' && GEWERBE.has(b) ? 'resshop' : kind; if (!gfByKind.has(gk)) gfByKind.set(gk, []); gfByKind.get(gk).push(bg); }
    }
    // Sattel- und Walmdächer auf einfachen Grundrissen
    if (b.r && b.rh > 0 && b.p.length <= 12) {
      const ob = orientedBox(b.p);
      if (ob.ratio > 0.6 && (ob.vmax - ob.vmin) < 24) {
        const ov = 0.35, u0 = ob.umin - ov, u1 = ob.umax + ov, v0 = ob.vmin - ov, v1 = ob.vmax + ov, vm = (v0 + v1) / 2, W = v1 - v0;
        const hs = b.base + b.h, ht = hs + Math.min(b.rh, W * 0.6);
        const P = (u, vv, y) => { const [x, z] = ob.pt(u, vv); return [x, y, z]; };
        const rv = [], ruv = [];
        const tri = (A, B, C, ua, ub, uc) => { rv.push(...A, ...B, ...C); ruv.push(...ua, ...ub, ...uc); };
        const quad = (A, B, C, D, ua, ub, uc, ud) => { tri(A, B, C, ua, ub, uc); tri(A, C, D, ua, uc, ud); };
        const inset = b.r === 'hipped' ? Math.min(W / 2, (u1 - u0) / 2 - 0.5) : 0;
        const slope = Math.hypot(W / 2, ht - hs);
        // Südseite (v0) und Nordseite (v1), Firstlinie von u0+inset bis u1-inset
        quad(P(u0, v0, hs), P(u1, v0, hs), P(u1 - inset, vm, ht), P(u0 + inset, vm, ht), [u0, 0], [u1, 0], [u1 - inset, slope], [u0 + inset, slope]);
        quad(P(u1, v1, hs), P(u0, v1, hs), P(u0 + inset, vm, ht), P(u1 - inset, vm, ht), [u1, 0], [u0, 0], [u0 + inset, slope], [u1 - inset, slope]);
        if (inset > 0) { tri(P(u0, v1, hs), P(u0, v0, hs), P(u0 + inset, vm, ht), [v1, 0], [v0, 0], [vm, slope]); tri(P(u1, v0, hs), P(u1, v1, hs), P(u1 - inset, vm, ht), [v0, 0], [v1, 0], [vm, slope]); }
        else { const gv = []; const gt = (A, B, C) => gv.push(...A, ...B, ...C); gt(P(u0, v1, hs), P(u0, v0, hs), P(u0, vm, ht)); gt(P(u1, v0, hs), P(u1, v1, hs), P(u1, vm, ht)); const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(gv, 3)); gg.computeVertexNormals(); gableGeos.push(gg); }
        // Schleppgauben auf hohen Wohnhäusern: Front, Wangen, flach geneigtes Dach, Fenster
        const rise = ht - hs; if ((kind === 'res' || kind === 'house') && b.h >= 8 && rise >= 2.6 && u1 - u0 >= 7) {
          const n = Math.max(1, Math.floor((u1 - u0 - 2) / 4.2)); const pitch = (u1 - u0) / n;
          for (const vs of [v0, v1]) { const sg = vs === v0 ? 1 : -1; const at = f => vs + (vm - vs) * f, yAt = f => hs + rise * f;
            const ff = 0.22, fb = 0.66; const vf = at(ff), vb = at(fb), yt = yAt(fb) - 0.05, yf = yAt(ff);
            for (let k = 0; k < n; k++) { if (Math.random() < 0.25) continue; const uc = u0 + pitch * (k + 0.5), hw = Math.min(0.95, pitch * 0.32);
              const q = (A, B, C, D, arr) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([...A, ...B, ...C, ...A, ...C, ...D], 3)); g.computeVertexNormals(); arr.push(g); };
              q(P(uc - hw, vf, yf - 0.3), P(uc + hw, vf, yf - 0.3), P(uc + hw, vf, yt), P(uc - hw, vf, yt), dW); // Front
              for (const su of [-1, 1]) q(P(uc + su * hw, vf, yf - 0.3), P(uc + su * hw, vb, yt - 0.3), P(uc + su * hw, vb, yt), P(uc + su * hw, vf, yt), dW); // Wangen
              q(P(uc - hw - 0.12, vf - 0.25 * sg, yt + 0.12), P(uc + hw + 0.12, vf - 0.25 * sg, yt + 0.12), P(uc + hw + 0.12, vb, yt + 0.02), P(uc - hw - 0.12, vb, yt + 0.02), dR); // Dach mit Überstand
              const off = -0.03 * sg; q(P(uc - hw * 0.7, vf + off, yf + 0.25), P(uc + hw * 0.7, vf + off, yf + 0.25), P(uc + hw * 0.7, vf + off, yt - 0.18), P(uc - hw * 0.7, vf + off, yt - 0.18), dG); } } }
        const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rv, 3)); rg.setAttribute('uv', new THREE.Float32BufferAttribute(ruv, 2)); rg.computeVertexNormals(); tileGeos.push(rg);
      }
    }
  }
  const facByKind = FAC_CACHE || (FAC_CACHE = (() => { const f = {}; for (const k of ['res', 'house', 'public', 'hall', 'small', 'church']) f[k] = [facadeTextures(k), facadeTextures(k)]; for (const k of ['wache', 'school', 'altschule', 'nk', 'nb', 'zi', 'fw', 'schiefer', 'messeturm', 'barock', 'sandstein', 'gruender', 'zwanziger', 'abg', 'ezb']) { const s = facadeStyle(k); f[k] = [s, k === 'nk' || k === 'zi' ? facadeStyle(k) : s]; } return f; })());
  const counters = {};
  const groups = new Map(); const tmpC = new THREE.Color();
  for (const [key, geos] of byKey) {
    if (!geos.length) continue; const [kind, cs] = key.split('|'); const c = +cs; counters[kind] = (counters[kind] || 0) + 1; tmpC.setHex(c);
    for (const g of geos) { const pos = g.attributes.position, n = pos.count, base = g.userData.base ?? 0; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const y = pos.getY(i); const ao = y <= base + 2.5 ? 0.78 : 0.98; a[i * 3] = tmpC.r * ao; a[i * 3 + 1] = tmpC.g * ao; a[i * 3 + 2] = tmpC.b * ao; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
    const gk = kind + '|' + (counters[kind] % 2); if (!groups.has(gk)) groups.set(gk, []); groups.get(gk).push(...geos);
  }
  for (const [gk, geos] of groups) { let wall = WALL_MATS.get(gk); if (!wall) { const [kind, v] = gk.split('|'); const ft = facByKind[kind][+v];
    wall = new THREE.MeshLambertMaterial({ vertexColors: true, map: ft.map, emissive: 0xffffff, emissiveMap: ft.emissiveMap, emissiveIntensity: 0.9, normalMap: TEX.plasterN, normalScale: new THREE.Vector2(0.7, 0.7) }); wall.userData.shared = true; sharedEmissiveMats.push(wall); if (kind === 'messeturm') { wall.fog = false; wall.userData.c0 = wall.color.clone(); wall.userData.e0 = wall.emissive.clone(); const mt = CITY.buildings.find(q => q && q._pyr); if (mt) { const [hx, hz] = centroidOf(mt.p); FAR_HAZE.push({ mats: [wall], x: hx, z: hz }); } } if (['res', 'house', 'public'].includes(kind)) windowDepth(wall, kind === 'public'); WALL_MATS.set(gk, wall); }
    const m = new THREE.Mesh(mergeGeometries(geos), wall); m.castShadow = true; m.receiveShadow = true; scene.add(m); rayTargets.push(m); }
  for (const [gk, geos] of gfByKind) { const gfk = gk.replace('2', ''); let gfm = GF_MATS.get(gfk); if (!gfm) { const gt = groundTextures(gfk); gfm = new THREE.MeshLambertMaterial({ vertexColors: true, map: gt.map, emissive: 0xffffff, emissiveMap: gt.emissiveMap, emissiveIntensity: 1.0, side: THREE.DoubleSide }); gfm.userData.shared = true; sharedEmissiveMats.push(gfm); GF_MATS.set(gfk, gfm); } const m = new THREE.Mesh(mergeGeometries(geos), gfm); m.receiveShadow = true; scene.add(m); }
  if (gateGeos.length) { for (const g of gateGeos) { g.deleteAttribute('uv'); if (!g.attributes.normal) g.computeVertexNormals(); } scene.add(new THREE.Mesh(mergeGeometries(gateGeos), shLambert(0x1b1d22, THREE.DoubleSide))); }
  if (roofGeos.length) { const rm = new THREE.Mesh(mergeGeometries(roofGeos), roofMat); rm.receiveShadow = true; scene.add(rm); rayTargets.push(rm); }
  if (tileGeos.length) { if (!TILE_ROOF_MAT) { TILE_ROOF_MAT = new THREE.MeshLambertMaterial(TEX.tiles ? { map: TEX.tiles, normalMap: TEX.tilesN, side: THREE.DoubleSide } : { map: roofTileTex, side: THREE.DoubleSide }); TILE_ROOF_MAT.userData.shared = true; } const tm = new THREE.Mesh(mergeGeometries(tileGeos), TILE_ROOF_MAT); tm.castShadow = true; tm.receiveShadow = true; scene.add(tm); rayTargets.push(tm); }
  if (dW.length) { const mw = new THREE.Mesh(mergeGeometries(dW), shLambert(0xd9cbb6, THREE.DoubleSide)); mw.castShadow = mw.receiveShadow = true; scene.add(mw);
    const mr = new THREE.Mesh(mergeGeometries(dR), shLambert(0x6a3a2c, THREE.DoubleSide)); mr.castShadow = mr.receiveShadow = true; scene.add(mr);
    if (!DORMER_GLASS_MAT) { DORMER_GLASS_MAT = new THREE.MeshLambertMaterial({ color: 0x2a3340, emissive: 0x000000, side: THREE.DoubleSide }); DORMER_GLASS_MAT.userData.shared = true; }
    const mg = new THREE.Mesh(mergeGeometries(dG), DORMER_GLASS_MAT); scene.add(mg); }
  if (gableGeos.length) scene.add(new THREE.Mesh(mergeGeometries(gableGeos), shLambert(0xd9cbb6, THREE.DoubleSide)));
  // Boden
  // Grün- und Freiflächen je Art
  const greenCol = { park: 0x6f9a52, grass: 0x7aa35a, garden: 0x6a9450, meadow: 0x86a85c, forest: 0x4e7d3a, allotments: 0x7f9a5a, dog_park: 0x7aa35a, cemetery: 0x6f9a52, recreation_ground: 0x72a052, playground: 0xd2bb8e, parking: 0x6d6d70, track: 0xb0563c };
  const sportCol = { soccer: 0x3f8a3a, tennis: 0xb0563c, basketball: 0x7a7f86, multi: 0x7a7f86, petanque: 0xc8b48a, table_tennis: 0x7aa35a, volleyball: 0xd2bb8e };
  const byCol = new Map();
  for (const g of CITY.green) { if (++YC % 3 === 0) yield;
    const shape = new THREE.Shape(g.p.map(([x, z]) => new THREE.Vector2(x, -z)));
    const lawn = RASEN_KINDS.has(g.k); let geo = new THREE.ShapeGeometry(shape); geo.rotateX(-Math.PI / 2); geo = drape(geo, g.k === 'pitch' || g.k === 'playground' ? 0.07 : 0.05, 2.5, 0.05, 10, lawn);
    const col = g.k === 'pitch' ? (sportCol[g.s] || 0x7a7f86) : (greenCol[g.k] || 0x6f9a52); const bk = lawn ? 'r' + col : col; /* Rasen: Bodentextur aus rasen.js (uv in Weltmetern) */
    if (!byCol.has(bk)) byCol.set(bk, []); byCol.get(bk).push(geo);
  }
  for (const [col, geos] of byCol) { const m = new THREE.Mesh(mergeGeometries(geos), typeof col === 'string' ? rasenMat(THREE, +col.slice(1)) : shLambert(col)); m.receiveShadow = true; scene.add(m); }
  // Spielplatzgeräte und Sportplatz-Linien
  const propGeos = { red: [], blue: [], yellow: [], wood: [], white: [], steel: [] };
  const bx = (w, h, d, x, y, z, ry, bucket) => { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y + TH(x, z), z); propGeos[bucket].push(g); };
  for (const g of CITY.green) { if (++YC % 3 === 0) yield;
    const ob = orientedBox(g.p); const cu = (ob.umin + ob.umax) / 2, cv = (ob.vmin + ob.vmax) / 2; const ang = Math.atan2(ob.ux, ob.uz) - Math.PI / 2; const [cx, cz] = ob.pt(cu, cv);
    const inside = (u, v) => { const [x, z] = ob.pt(u, v); return pointInPoly(x, z, g.p) && solidAt(x, z) < 0; };
    const L = ob.umax - ob.umin, W = ob.vmax - ob.vmin;
    if (g.k === 'playground' && L > 6 && W > 6) {
      // Schaukel
      if (inside(cu - 3, cv)) { const [x, z] = ob.pt(cu - 3, cv); for (const du of [-1.4, 1.4]) { const [px, pz] = ob.pt(cu - 3 + du, cv); bx(0.1, 2.4, 0.1, px, 1.2, pz, 0, 'steel'); } bx(3.0, 0.1, 0.1, x, 2.4, z, ang, 'steel'); for (const du of [-0.5, 0.5]) { const [px, pz] = ob.pt(cu - 3 + du, cv); bx(0.4, 0.06, 0.2, px, 0.6, pz, ang, 'wood'); bx(0.03, 1.8, 0.03, px, 1.5, pz, 0, 'steel'); } }
      // Rutsche
      if (inside(cu + 3, cv)) { const [x, z] = ob.pt(cu + 3, cv); const [tx, tz] = ob.pt(cu + 3, cv + 1.2); bx(0.8, 1.8, 0.8, tx, 0.9, tz, ang, 'wood'); const sg = new THREE.BoxGeometry(0.6, 0.08, 3.2); sg.rotateX(0.55); sg.rotateY(ang); const [sx, sz] = ob.pt(cu + 3, cv - 0.6); sg.translate(sx, 1.0 + TH(sx, sz), sz); propGeos.red.push(sg); bx(0.9, 0.3, 0.9, tx, 1.9, tz, ang, 'blue'); }
      // Sandkasten
      if (inside(cu, cv + 4)) { const [x, z] = ob.pt(cu, cv + 4); for (const [du, dv, w, d] of [[-1.5, 0, 0.2, 3.2], [1.5, 0, 0.2, 3.2], [0, -1.5, 3.2, 0.2], [0, 1.5, 3.2, 0.2]]) { const [px, pz] = ob.pt(cu + du, cv + 4 + dv); bx(w, 0.3, d, px, 0.15, pz, ang, 'wood'); } const sand = new THREE.BoxGeometry(2.9, 0.1, 2.9); sand.rotateY(ang); sand.translate(x, 0.08 + TH(x, z), z); propGeos.yellow.push(sand); }
      // Wippe
      if (inside(cu, cv - 4)) { const [x, z] = ob.pt(cu, cv - 4); bx(0.3, 0.5, 0.3, x, 0.25, z, ang, 'steel'); const w = new THREE.BoxGeometry(3.0, 0.08, 0.3); w.rotateZ(0.2); w.rotateY(ang); w.translate(x, 0.55 + TH(x, z), z); propGeos.red.push(w); }
      // Bank
      if (inside(cu - 4, cv + 3)) { const [x, z] = ob.pt(cu - 4, cv + 3); bx(1.6, 0.06, 0.4, x, 0.45, z, ang, 'wood'); bx(1.6, 0.4, 0.06, x, 0.7, z, ang, 'wood'); }
    }
    if (g.k === 'pitch' && L > 10 && W > 5 && ob.ratio > 0.7) {
      const i = 0.8, u0 = ob.umin + i, u1 = ob.umax - i, v0 = ob.vmin + i, v1 = ob.vmax - i; const lw = 0.12, ly = 0.03;
      const line = (ua, va, ub, vb) => { const [ax, az] = ob.pt(ua, va), [bz0, bz1] = ob.pt(ub, vb); const l = Math.hypot(bz0 - ax, bz1 - az); const g2 = new THREE.BoxGeometry(lw, 0.02, l); g2.rotateY(Math.atan2(bz0 - ax, bz1 - az)); g2.translate((ax + bz0) / 2, ly + TH((ax + bz0) / 2, (az + bz1) / 2), (az + bz1) / 2); propGeos.white.push(g2); };
      line(u0, v0, u1, v0); line(u1, v0, u1, v1); line(u1, v1, u0, v1); line(u0, v1, u0, v0); line(cu, v0, cu, v1);
      if (g.s === 'soccer' || g.s === 'multi') { for (const [ue, sgn] of [[u0, 1], [u1, -1]]) { for (const dv of [-1.8, 1.8]) { const [px, pz] = ob.pt(ue, cv + dv); bx(0.1, 2.0, 0.1, px, 1.0, pz, 0, 'white'); } const [px, pz] = ob.pt(ue, cv); bx(0.1, 0.1, 3.7, px, 2.0, pz, ang + Math.PI / 2, 'white'); } }
      if (g.s === 'basketball' || g.s === 'multi') { for (const ue of [u0 + 0.5, u1 - 0.5]) { const [px, pz] = ob.pt(ue, cv); bx(0.12, 3.0, 0.12, px, 1.5, pz, 0, 'steel'); bx(1.4, 0.9, 0.06, px, 3.1, pz, ang + Math.PI / 2, 'white'); bx(0.5, 0.04, 0.5, px, 2.7, pz, 0, 'red'); } }
      if (g.s === 'tennis') { for (const dv of [v0, v1]) { const [px, pz] = ob.pt(cu, dv); bx(0.08, 1.1, 0.08, px, 0.55, pz, 0, 'steel'); } const [px, pz] = ob.pt(cu, cv); bx(0.03, 0.9, W - 1.6, px, 0.5, pz, ang, 'steel'); }
    }
  }
  const propMat = { red: 0xc0392b, blue: 0x2980b9, yellow: 0xe3c98a, wood: 0x8b5a2b, white: 0xf4f4f4, steel: 0x8a8f94 };
  for (const k in propGeos) if (propGeos[k].length) { const m = new THREE.Mesh(mergeGeometries(propGeos[k]), shLambert(propMat[k])); m.castShadow = true; scene.add(m); }
  const waters = [];
  for (const w of CITY.water) { const shape = new THREE.Shape(w.p.map(([x, z]) => new THREE.Vector2(x, -z))); const geo = new THREE.ShapeGeometry(shape); geo.rotateX(-Math.PI / 2); geo.translate(0, Math.min(...w.p.map(([x, z]) => TH(x, z))) + 0.2, 0); waters.push(geo); }
  if (waters.length) scene.add(new THREE.Mesh(mergeGeometries(waters), shLambert(0x4f7fa0)));
  // Straßen als Bänder
  const wSurf = (x, z) => { const c = waterGrid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))); if (c) for (const w of c) if (x >= w.x0 && x <= w.x1 && z >= w.z0 && z <= w.z1 && pointInPoly(x, z, w.p)) return (w.wy ?? (TH(x, z) + 0.2)) + 0.04; return TH(x, z); };
  const ribbon = (lines, y, widthFn) => {
    const v = []; // ein großes Dreiecksnetz: Segment-Quads + Kreis-Kappen an den Knoten
    const tri = (a, b, c) => v.push(a[0], y + (a[2] ?? wSurf(a[0], a[1])), a[1], b[0], y + (b[2] ?? wSurf(b[0], b[1])), b[1], c[0], y + (c[2] ?? wSurf(c[0], c[1])), c[1]);
    for (const r of lines) {
      const w = widthFn(r) / 2;
      for (let i = 0; i < r.p.length - 1; i++) {
        const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1];
        const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, nx = -dz / l * w, nz = dx / l * w;
        const el = r.ry && (r.el[i] || r.el[i + 1]); const ya = el ? (r.el[i] ? r.ry[i] : wSurf(ax, az)) : undefined, yb = el ? (r.el[i + 1] ? r.ry[i + 1] : wSurf(bx, bz)) : undefined;
        const ns = Math.max(1, Math.ceil(l / 3)); for (let q = 0; q < ns; q++) { const t0 = q / ns, t1 = (q + 1) / ns; const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1; const y0 = el ? ya + (yb - ya) * t0 : wSurf(x0, z0), y1 = el ? ya + (yb - ya) * t1 : wSurf(x1, z1); // flacher Querschnitt: Höhe der Mittellinie
          const A = [x0 + nx, z0 + nz, y0], B = [x1 + nx, z1 + nz, y1], C = [x1 - nx, z1 - nz, y1], D = [x0 - nx, z0 - nz, y0]; tri(A, B, C); tri(A, C, D); }
      }
      for (let pi = 0; pi < r.p.length; pi++) { const [px, pz] = r.p[pi]; const yy = r.ry && r.el[pi] ? r.ry[pi] : wSurf(px, pz); for (let k = 0; k < 6; k++) { const a0 = k / 6 * Math.PI * 2, a1 = (k + 1) / 6 * Math.PI * 2; tri([px, pz, yy], [px + Math.cos(a0) * w, pz + Math.sin(a0) * w, yy], [px + Math.cos(a1) * w, pz + Math.sin(a1) * w, yy]); } }
    }
    if (!v.length) return null;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    const n = new Float32Array(v.length), uv = new Float32Array(v.length / 3 * 2);
    for (let i = 0, j = 0; i < v.length; i += 3, j += 2) { uv[j] = v[i]; uv[j + 1] = v[i + 2]; }
    /* echte Flächennormale je Dreieck statt (0,1,0): Gefälle von Wegen und Straßen wird im Licht sichtbar (André 13.11.2026, Günthersburgpark) */
    for (let i = 0; i < v.length; i += 9) { const ax = v[i + 3] - v[i], ay = v[i + 4] - v[i + 1], az = v[i + 5] - v[i + 2], bx = v[i + 6] - v[i], by = v[i + 7] - v[i + 1], bz = v[i + 8] - v[i + 2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; } const l = Math.hypot(nx, ny, nz) || 1;
      for (let k = 0; k < 9; k += 3) { n[i + k] = nx / l; n[i + k + 1] = ny / l; n[i + k + 2] = nz / l; } }
    g.setAttribute('normal', new THREE.BufferAttribute(n, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
  };
  const flatMat = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; scene.add(m); };
  const walkG = ribbon(CITY.roads, 0.02, r => r.w + (r.mw ? 1.6 : 5)); if (walkG) { if (!WALK_MAT) { WALK_MAT = new THREE.MeshLambertMaterial({ map: gehwegTex }); /* gezeichnete Betonplatten statt Fototextur (12.11.2026) */ WALK_MAT.userData.shared = true; WALK_MAT.polygonOffset = true; WALK_MAT.polygonOffsetFactor = 1; WALK_MAT.polygonOffsetUnits = 4; /* Gehweg der Querstraße liegt am Hang bis 3 cm über der Fahrbahn: Fahrbahn gewinnt im Tiefenpuffer */ } flatMat(walkG, WALK_MAT); }
  const plazas = []; for (const r of CITY.roads) if (isPedArea(r)) { const sh = new THREE.Shape(r.p.map(([x, z]) => new THREE.Vector2(x, -z))); const pg = new THREE.ShapeGeometry(sh); pg.rotateX(-Math.PI / 2); plazas.push(drape(pg, 0.025, 2.5, 0.05, 10, true)); }
  if (plazas.length && WALK_MAT) flatMat(mergeGeometries(plazas), WALK_MAT);
  { const pedG = ribbon(CITY.roads.filter(r => r.ped && !isPedArea(r) && r.w >= 4), 0.042, r => r.w); if (pedG) flatMat(pedG, GRANIT_MAT || (GRANIT_MAT = Object.assign(new THREE.MeshLambertMaterial({ map: canvasTex(256, 256, (c, w, h) => { c.fillStyle = '#9c9a96'; c.fillRect(0, 0, w, h); for (let i = 0; i < 9000; i++) { c.fillStyle = pick(['#6e6c69', '#c4c2bd', '#888682', '#b0aea9']); c.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); } c.strokeStyle = 'rgba(40,40,40,0.55)'; c.lineWidth = 1.5; for (let y = 0; y < h; y += 32) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); for (let x = (y / 32) % 2 ? 0 : 32; x < w; x += 64) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 32); c.stroke(); } } }, 1 / 4, 1 / 4) }), { userData: { shared: true } }))); } // Granitplatten in Fußgängerzonen (Foto TG Bornheim, Innenstadt)
  const fahrRoads = CITY.roads.filter(r => !isPedArea(r) && !(r.ped && r.w >= 4)); const roadG = ribbon(fahrRoads.filter(r => !STR.sorte(r)), 0.04, r => r.w); /* Sorte 0: bisheriger Asphalt; 1–3 (neuer Asphalt, Pflaster) darunter, ab Mittel (#153) */ if (roadG) { const rm = new THREE.Mesh(roadG, roadMatRef || ((LOW_GFX || opts.potato) ? new THREE.MeshLambertMaterial({ map: fahrbahnTex, color: 0xb8b8b8 }) : new THREE.MeshStandardMaterial(Object.assign({ map: fahrbahnTex, normalMap: TEX.asphaltN, color: 0xb8b8b8 }, { roughness: 0.92, metalness: 0, roughnessMap: null })))); /* Sparmodus und „Sehr schwacher Rechner“: Lambert mit Map */ if (rm.material.userData.pud === undefined) { rm.material.userData.pud = rm.material.isMeshStandardMaterial ? null : puddleTex(); rm.material.userData.shared = true; STR.nass(rm.material); /* Pfützen jetzt im Shader (#153) */ } rm.receiveShadow = true; scene.add(rm); roadMatRef = rm.material; }
  for (const so of [1, 2, 3]) { const g = ribbon(fahrRoads.filter(r => STR.sorte(r) === so), 0.04 + so * 0.002, r => r.w); if (g) flatMat(g, STR.belagMat(so, TEX.asphaltN)); }
  STR.ecken(CITY.roads, m => scene.add(m)); // Bordsteinecken als Bogen (ab Mittel)
  // Fußwege: Stücke, die im Gehwegband einer Straße liegen (in OSM oft als eigene Linie direkt neben der Fahrbahn), weglassen;
  // sonst liegen zwei Beläge übereinander (12.11.2026, Ticket #11: braune Streifen auf dem Gehweg)
  const freiePfade = []; for (const pa of CITY.paths) { if (pa.ry) { freiePfade.push(pa); continue; } let run = [];
    for (let i = 0; i < pa.p.length - 1; i++) { const [ax, az] = pa.p[i], [bx, bz] = pa.p[i + 1]; const im = onOtherRoad((ax + bx) / 2, (az + bz) / 2, null, 2.3) && onOtherRoad(ax, az, null, 2.6) && onOtherRoad(bx, bz, null, 2.6);
      if (im) { if (run.length > 1) freiePfade.push(Object.assign({}, pa, { p: run })); run = []; } else { if (!run.length) run.push(pa.p[i]); run.push(pa.p[i + 1]); } }
    if (run.length > 1) freiePfade.push(Object.assign({}, pa, { p: run })); }
  const pathG = ribbon(freiePfade, 0.03, () => 2); if (pathG) { if (!PATH_MAT) { PATH_MAT = new THREE.MeshLambertMaterial({ map: kiesTex }); /* wassergebundene Decke statt buntem Pflaster-Foto (12.11.2026) */ PATH_MAT.userData.shared = true; PATH_MAT.polygonOffset = true; PATH_MAT.polygonOffsetFactor = 1; PATH_MAT.polygonOffsetUnits = 4; /* Gehweg der Querstraße liegt am Hang bis 3 cm über der Fahrbahn: Fahrbahn gewinnt im Tiefenpuffer */ } flatMat(pathG, PATH_MAT); }
  buildBridges();
  // U-Bahn (railway=subway) fährt in Frankfurt unter der Erde: oben nie zeichnen, auch wenn OSM den Tunnel nicht markiert (André 12.11.2026)
  const SURF_RAILS = CITY.rails.filter(r => r.k !== 'subway');
  const railG = ribbon(SURF_RAILS, 0.05, () => 3); if (railG) { const rm = shLambert(0x6b6258); rm.userData.onRoad = true; /* Gleisbett liegt gewollt auf der Fahrbahn */ flatMat(railG, rm); }
  // Schienen
  const railLines = [];
  // Schienen in Stücken von höchstens 4 m, je Stück eigene Geländehöhe: vorher ein Balken je OSM-Abschnitt auf Höhe der Mitte,
  // auf welligem Gelände tauchte er stellenweise in den Boden und die Gleise wirkten unterbrochen (André 12.11.2026)
  for (const r of SURF_RAILS) for (const off of [-0.72, 0.72]) for (let i = 0; i < r.p.length - 1; i++) { const [ax0, az0] = r.p[i], [bx0, bz0] = r.p[i + 1]; const L = Math.hypot(bx0 - ax0, bz0 - az0) || 1; const nseg = Math.max(1, Math.ceil(L / 4));
    for (let k = 0; k < nseg; k++) { const ax = ax0 + (bx0 - ax0) * k / nseg, az = az0 + (bz0 - az0) * k / nseg, bx = ax0 + (bx0 - ax0) * (k + 1) / nseg, bz = az0 + (bz0 - az0) * (k + 1) / nseg; const l = L / nseg; const nx = -(bz0 - az0) / L * off, nz = (bx0 - ax0) / L * off; const ya = TH(ax + nx, az + nz), yb = TH(bx + nx, bz + nz); const g = new THREE.BoxGeometry(0.08, 0.1, l + 0.04); g.rotateX(Math.atan2(ya - yb, l)); g.rotateY(Math.atan2(bx - ax, bz - az)); g.translate((ax + bx) / 2 + nx, 0.1 + (ya + yb) / 2, (az + bz) / 2 + nz); railLines.push(g); } }
  if (railLines.length) scene.add(new THREE.Mesh(mergeGeometries(railLines), shLambert(0x9a9a9a)));
  // Ampeln
  const sigSpots = [], sigLight = [];
  for (const [sx0, sz0] of CITY.signals) { if (++YC % 3 === 0) yield; if (solidAt(sx0, sz0) >= 0) continue;
    // StVO: je Zufahrt zwei Signalgeber, rechts und links der Fahrbahn
    let best = null, bd = 1e18; for (const r of CITY.roads) { if (r.ped) continue; for (let i = 0; i < r.p.length - 1; i++) { const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const d = distSegSq(sx0, sz0, ax, az, bx, bz); if (d < bd) { bd = d; best = { r, ax, az, bx, bz }; } } }
    let spots = [[sx0, sz0]]; if (best && bd < 400) { const dx = best.bx - best.ax, dz = best.bz - best.az, l = Math.hypot(dx, dz) || 1, L2 = l * l; const t = clamp(((sx0 - best.ax) * dx + (sz0 - best.az) * dz) / L2, 0, 1); const cx = best.ax + dx * t, cz = best.az + dz * t; const o = best.r.w / 2 + 0.8; spots = [[cx - dz / l * o, cz + dx / l * o], [cx + dz / l * o, cz - dx / l * o]]; }
    // Fahrtrichtung der Zufahrt: vom nahen Knoten weg schauen die Lichter dem Verkehr entgegen
    let fx = 0, fz = 1, hd = 0; if (best) { const dA = Math.hypot(sx0 - best.ax, sz0 - best.az), dB = Math.hypot(sx0 - best.bx, sz0 - best.bz); const [nx0, nz0] = dA < dB ? [best.ax, best.az] : [best.bx, best.bz]; const ex = best.bx - best.ax, ez = best.bz - best.az, el = Math.hypot(ex, ez) || 1; const sg = ((sx0 - nx0) * ex + (sz0 - nz0) * ez) >= 0 ? 1 : -1; fx = ex / el * sg; fz = ez / el * sg; hd = Math.atan2(ex, ez); }
    const rot = Math.atan2(fx, fz);
    for (const [qx, qz] of spots) { const [x, z] = pushOffRoads(qx, qz, 0.6); if (Number.isNaN(x) || solidAt(x, z) >= 0) continue; const sp = [x, z]; sp.rot = rot; signalPoles.push(sp); sigSpots.push(sp); const ty = TH(x, z), hy = 3.0 + ty;
      for (let k = 0; k < 3; k++) sigLight.push({ x: x + fx * 0.125, y: hy + 0.3 - k * 0.3, z: z + fz * 0.125, rot, k, hd }); }
  }
  if (sigSpots.length) {
    const poleG = SIG_POLE_G || (SIG_POLE_G = (() => { const g = new THREE.CylinderGeometry(0.055, 0.075, 3.6, 8); g.translate(0, 1.8, 0); g.userData.shared = true; return g; })());
    const boxG = SIG_BOX_G || (SIG_BOX_G = (() => { const g = mergeGeometries([new THREE.BoxGeometry(0.3, 0.95, 0.24).translate(0, 3.0, 0), new THREE.BoxGeometry(0.52, 1.2, 0.025).translate(0, 3.0, -0.13)]); g.userData.shared = true; return g; })());
    const pm = new THREE.InstancedMesh(poleG, shLambert(0x5a5d60), sigSpots.length), bm = new THREE.InstancedMesh(boxG, shLambert(0x1c1c1c), sigSpots.length);
    const lens = SIG_LENS_G || (SIG_LENS_G = Object.assign(new THREE.CircleGeometry(0.095, 14), { userData: { shared: true } }));
    const lmat = SIG_LENS_MAT || (SIG_LENS_MAT = Object.assign(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), { userData: { shared: true } }));
    const lm = new THREE.InstancedMesh(lens, lmat, sigLight.length); const o = new THREE.Object3D();
    sigSpots.forEach((sp, i) => { const ty = TH(sp[0], sp[1]); o.position.set(sp[0], ty, sp[1]); o.rotation.set(0, sp.rot, 0); o.scale.setScalar(1); o.updateMatrix(); pm.setMatrixAt(i, o.matrix); bm.setMatrixAt(i, o.matrix); sp.pm = pm; sp.bm = bm; sp.lm = lm; sp.i = i; });
    pm.computeBoundingSphere(); bm.computeBoundingSphere(); scene.add(pm, bm);
    sigLight.forEach((l, i) => { o.position.set(l.x, l.y, l.z); o.rotation.set(0, l.rot, 0); o.updateMatrix(); lm.setMatrixAt(i, o.matrix); lm.setColorAt(i, new THREE.Color(0x222222)); }); lm.userData.lights = sigLight; lm.userData.noChunk = true; lm.computeBoundingSphere(); scene.add(lm); signalMeshes.push(lm); }
  // Markierung und Kleinteile (#153, strassen.js): ein Mesh je Kachel für die Striche, ein Atlas-Mesh je 125-m-Stück für Deckel, Abläufe, Flicken …
  { const mk = STR.markierung(CITY.roads, CITY.signals, CITY.crossings, markTex); if (mk) scene.add(mk); STR.kleinteile(CITY.roads, CITY.signals, m => scene.add(m)); }
  // Bäume
  const trunk = TRUNK_G || (TRUNK_G = Object.assign(new THREE.CylinderGeometry(0.15, 0.2, 2.2, 5), { userData: { shared: true } }));
  const crown = opts.quality === 'niedrig' ? (CROWN_LOW_G || (CROWN_LOW_G = (() => { const g = new THREE.IcosahedronGeometry(1.9, 0); g.computeVertexNormals(); g.userData.shared = true; return g; })())) : (CROWN_HI_G || (CROWN_HI_G = (() => { const g = mergeGeometries([new THREE.IcosahedronGeometry(1.75, 0), new THREE.IcosahedronGeometry(1.3, 0).translate(0.95, 0.45, 0.35), new THREE.IcosahedronGeometry(1.2, 0).translate(-0.75, 0.6, -0.55), new THREE.IcosahedronGeometry(1.05, 0).translate(0.1, 1.2, -0.2)]); g.computeVertexNormals(); g.userData.shared = true; return g; })()));
  // Keine Bäume auf sichtbaren Gleisen (Ludwig-Landmann-Straße, André 12.11.2026): Raster der Gleisabschnitte, 2,6 m Abstand zur Gleismitte
  const RGRID = new Map(); for (const r of SURF_RAILS) for (let i = 0; i < r.p.length - 1; i++) { const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; for (let cx = Math.floor((Math.min(ax, bx) - 3) / 8); cx <= Math.floor((Math.max(ax, bx) + 3) / 8); cx++) for (let cz = Math.floor((Math.min(az, bz) - 3) / 8); cz <= Math.floor((Math.max(az, bz) + 3) / 8); cz++) { const k = cx + ',' + cz; if (!RGRID.has(k)) RGRID.set(k, []); RGRID.get(k).push([ax, az, bx, bz]); } }
  const onRail = (x, z) => { const l = RGRID.get(Math.floor(x / 8) + ',' + Math.floor(z / 8)); if (l) for (const [ax, az, bx, bz] of l) if (distSegSq(x, z, ax, az, bx, bz) < 2.6 * 2.6) return true; return false; };
  const trees = CITY.trees.concat(extraTrees(Math.min(700, CITY.green.length * 5)), streetTrees()).map(([x, z]) => pushOffRoads(x, z, 0.9)).filter(([x, z]) => !Number.isNaN(x) && !onRail(x, z) && solidAt(x, z) < 0 && waterAt(x, z) === null && deckAt(x, z, 1e9, 0) === null); treeSpots.push(...trees);
  const tm = new THREE.InstancedMesh(trunk, shLambert(0x5a3f2a), trees.length);
  if (!CROWN_MAT) { CROWN_MAT = new THREE.MeshLambertMaterial({ color: 0xffffff }); CROWN_MAT.userData.shared = true; } const cm = new THREE.InstancedMesh(crown, CROWN_MAT, trees.length);
  const o = new THREE.Object3D();
  trees.forEach(([x, z], i) => { const ty = footTH(x, z, 0.25); o.position.set(x, ty + (2.2 - FOOT_SINK) / 2, z); o.scale.set(1, (2.2 + FOOT_SINK) / 2.2, 1); o.updateMatrix(); tm.setMatrixAt(i, o.matrix); const s = rnd(0.8, 1.4); o.position.set(x, 2.2 + s + ty, z); o.scale.setScalar(s); o.updateMatrix(); cm.setMatrixAt(i, o.matrix); });
  { const tc = new THREE.Color(); const greens = [0x4e7d3a, 0x5b8a3c, 0x46703a, 0x6a8f45, 0x3f6a33, 0x5f7f3a]; for (let i = 0; i < trees.length; i++) cm.setColorAt(i, tc.setHex(pick(greens)).multiplyScalar(rnd(0.85, 1.1))); }
  tm.castShadow = cm.castShadow = true; tm.computeBoundingSphere(); cm.computeBoundingSphere(); crownMeshes.push(cm); scene.add(tm, cm);
  // Blattkronen (Hoch/Ultra): dunkler Kern plus 60 Blattflächen mit Alphatextur, Normalen nach außen für weiches Licht (24 Flächen sahen löchrig aus, kosteten aber kaum messbar weniger)
  { if (!leafMat) { const leafTex = canvasTex(256, 256, (ctx, w, h) => { ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#5b8040'; ctx.fillRect(0, 0, 16, 16);
      for (let i = 0; i < 280; i++) { const x = 20 + Math.random() * (w - 40), y = 20 + Math.random() * (h - 40); const dx = x - w / 2, dy = y - h / 2; if (dx * dx + dy * dy > (w * 0.45) ** 2) continue; const g = 120 + Math.random() * 90 | 0; ctx.fillStyle = `rgb(${g * 0.55 | 0},${g},${g * 0.4 | 0})`; ctx.save(); ctx.translate(x, y); ctx.rotate(Math.random() * 6.28); ctx.beginPath(); ctx.ellipse(0, 0, 7 + Math.random() * 5, 3 + Math.random() * 2, 0, 0, 6.29); ctx.fill(); ctx.restore(); } });
    leafTex.colorSpace = THREE.SRGBColorSpace;
    const parts = []; const C = new THREE.Vector3(0, 0.35, 0);
    const core = new THREE.IcosahedronGeometry(1.25, 0).scale(1.1, 0.9, 1.1).translate(0, 0.35, 0); { const uv = new Float32Array(core.attributes.position.count * 2); for (let k = 0; k < uv.length; k += 2) { uv[k] = 0.03; uv[k + 1] = 0.97; } core.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); } parts.push(core.index ? core.toNonIndexed() : core);
    for (let i = 0; i < 60; i++) { const q = new THREE.PlaneGeometry(1.9, 1.9); const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.35, Math.random() - 0.5).normalize(); const r = 0.8 + Math.random() * 1.0; const pos = dir.clone().multiplyScalar(r).multiply(new THREE.Vector3(1.15, 0.95, 1.15)).add(C);
      q.lookAt(dir); q.rotateZ(Math.random() * 6.28); q.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler((Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.9, 0))); q.translate(pos.x, pos.y, pos.z);
      const pa = q.attributes.position, nn = q.attributes.normal; for (let k = 0; k < pa.count; k++) { const v = new THREE.Vector3(pa.getX(k), pa.getY(k), pa.getZ(k)).sub(C).normalize(); nn.setXYZ(k, v.x, v.y, v.z); } parts.push(q.index ? q.toNonIndexed() : q); }
    const leafG = mergeGeometries(parts.map(g => { for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a); return g; }));
    leafMat = new THREE.MeshLambertMaterial({ map: leafTex, alphaTest: 0.45, side: THREE.DoubleSide, color: 0xffffff, emissive: 0x1a2a10 }); leafMat.userData.shared = true; leafG.userData.shared = true; LEAF_G = leafG; } blobMat = CROWN_MAT; const leafG = LEAF_G;
    const lm = new THREE.InstancedMesh(leafG, leafMat, trees.length); const m4 = new THREE.Matrix4(), c = new THREE.Color(); for (let i = 0; i < trees.length; i++) { cm.getMatrixAt(i, m4); lm.setMatrixAt(i, m4); cm.getColorAt(i, c); lm.setColorAt(i, c.multiplyScalar(1.25)); }
    lm.castShadow = false; lm.receiveShadow = false; lm.computeBoundingSphere(); leafMeshes.push(lm); scene.add(lm); applyTreeQuality(); } // Blätter werfen keinen Schatten, die Krone reicht
  // Laternen
  const lampG = LAMP_G || (LAMP_G = Object.assign(new THREE.CylinderGeometry(0.06, 0.08, 5, 5), { userData: { shared: true } })); const lamps = [];
  for (const r of CITY.roads) { if (r.w < 5 || r.ped) continue; let acc = 8, side = 1; if (++YC % 3 === 0) yield; // Abstand über die ganze Straße, Seiten im Wechsel
    for (let i = 0; i < r.p.length - 1; i++) { const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const l = Math.hypot(bx - ax, bz - az) || 0.001; const dx = (bx - ax) / l, dz = (bz - az) / l; let d = acc;
      for (; d < l; d += 24) { const off = (r.w / 2 + 0.6) * side; const sx = ax + dx * d - dz * off, sz = az + dz * d + dx * off; side = -side; if (solidAt(sx, sz) < 0 && !onOtherRoad(sx, sz, r, 0.5) && deckAt(sx, sz, 1e9, 0) === null) lamps.push([sx, sz]); }
      acc = d - l; } }
  for (const f of CITY.furniture) if (f.k === 'street_lamp' && solidAt(f.x, f.z) < 0 && !onOtherRoad(f.x, f.z, null, 0.5) && deckAt(f.x, f.z, 1e9, 0) === null) lamps.push([f.x, f.z]);
  const lm = new THREE.InstancedMesh(lampG, shLambert(0x333333), lamps.length);
  const headG = LAMP_HEAD_G || (LAMP_HEAD_G = Object.assign(new THREE.BoxGeometry(0.5, 0.2, 0.3), { userData: { shared: true } })); const hm = new THREE.InstancedMesh(headG, shBasic(0xffe3a0), lamps.length);
  lamps.forEach(([x, z], i) => { const ty = footTH(x, z, 0.15); o.position.set(x, ty + (5 - FOOT_SINK) / 2, z); o.rotation.set(0, 0, 0); o.scale.set(1, (5 + FOOT_SINK) / 5, 1); o.updateMatrix(); lm.setMatrixAt(i, o.matrix); o.scale.setScalar(1); o.position.set(x, 5.0 + ty, z); o.updateMatrix(); hm.setMatrixAt(i, o.matrix); }); lm.computeBoundingSphere(); hm.computeBoundingSphere(); scene.add(lm, hm); lampSpots.push(...lamps);
  // Lichtschein als additive Sprites
  const glowTex = GLOW_TEX || (GLOW_TEX = canvasTex(64, 64, (ctx, w, h) => { const gr = ctx.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(255,220,150,0.55)'); gr.addColorStop(1, 'rgba(255,220,150,0)'); ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h); }));
  const ptsMat = PTS_GLOW_MAT || (PTS_GLOW_MAT = Object.assign(new THREE.PointsMaterial({ map: glowTex, size: 4.5, sizeAttenuation: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }), { userData: { shared: true } }));
  let pts = null; { const gp = new Float32Array(lamps.length * 3); lamps.forEach(([x, z], i) => { gp[i * 3] = x; gp[i * 3 + 1] = 4.6 + TH(x, z); gp[i * 3 + 2] = z; }); const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(gp, 3)); pts = new THREE.Points(gg, ptsMat); scene.add(pts); nightOnly.push(pts);
    const wash = new THREE.Points(gg.clone(), WALL_WASH_MAT || (WALL_WASH_MAT = Object.assign(new THREE.PointsMaterial({ map: glowTex, size: 14, sizeAttenuation: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.35, color: 0xffd9a0 }), { userData: { shared: true } }))); wash.position.y = -1.4; scene.add(wash); nightOnly.push(wash); } // warmer Schein an der Hauswand (Nachtfoto Wöllstädter Straße)
  // Lichtflecken auf dem Boden
  const spotG = LAMP_SPOT_G || (LAMP_SPOT_G = (() => { const g = new THREE.CircleGeometry(6, 14); g.rotateX(-Math.PI / 2); g.userData.shared = true; return g; })());
  const spotMat = SPOT_GLOW_MAT || (SPOT_GLOW_MAT = Object.assign(new THREE.MeshBasicMaterial({ color: 0xffc77a, map: glowTex, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }), { userData: { shared: true } }));
  const spotM = new THREE.InstancedMesh(spotG, spotMat, lamps.length);
  lamps.forEach((sp, i) => { o.position.set(sp[0], 0.07 + TH(sp[0], sp[1]), sp[1]); o.scale.setScalar(1); o.updateMatrix(); spotM.setMatrixAt(i, o.matrix); sp.lm = lm; sp.hm = hm; sp.spotM = spotM; sp.pts = pts; sp.i = i; }); if (typeof PFUETZEN !== 'undefined' && PFUETZEN) PFUETZEN.attach(spotM, lamps); spotM.computeBoundingSphere(); scene.add(spotM); nightOnly.push(spotM);
}
function extraTrees(n) {
  const out = []; let tries = 0;
  if (!CITY.green.length) return out;
  while (out.length < n && tries++ < n * 20) {
    const g = pick(CITY.green); if (['playground', 'pitch', 'parking', 'track'].includes(g.k)) continue; const xs = g.p.map(p => p[0]), zs = g.p.map(p => p[1]);
    const x = rnd(Math.min(...xs), Math.max(...xs)), z = rnd(Math.min(...zs), Math.max(...zs));
    if (pointInPoly(x, z, g.p)) out.push([x, z]);
  }
  return out;
}

// ---------- Figuren ----------
const SKIN = [0xf1c9a5, 0xe0ac7e, 0xc68642, 0x8d5524, 0xffdbac];
const CLOTH = [0x2b3a67, 0x7a2e2e, 0x2f6b3a, 0x444444, 0xd9d1c0, 0x9b4f96, 0x1e6f8c, 0xcc7722, 0x222222];
const HAIRCOL = [0x1a1a1a, 0x3b2a1a, 0x7a4a1a, 0xd9b36a, 0x8a8a8a, 0xb0343c, 0x2a1a10];
// --- Modell-Figuren (Quaternius, CC0) ---
const CHAR = {};
function shortClip(n) { return n.split('|').pop().replace(/^(Man|Female)_/, ''); }
PEOPLE_FILES.forEach((name, i) => { const g = gPeople[i]; if (!g) return; const s = g.scene; s.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(s); const hgt = box.max.y - box.min.y; const female = /woman/.test(name);
  const target = name === 'swat' ? 1.82 : female ? 1.68 : 1.80; const k = target / (hgt || 1); const clips = {}; for (const a of g.animations) clips[shortClip(a.name)] = a;
  let hand = null; s.traverse(o => { if (o.isBone && /^(Wrist\.?R|MiddleHand\.?R|Hand\.?R)$/i.test(o.name)) hand = o.name; });
  CHAR[name] = { scene: s, k, yOff: -box.min.y * k, clips, hand, family: clips.Idle_Gun_Pointing ? 'hero' : 'human' }; });
const PED_MALE = ['man', 'man_suit', 'man', 'business_man'].filter(n => CHAR[n]), PED_FEMALE = ['woman_casual', 'woman_tanktop', 'woman_dress', 'woman_jacket'].filter(n => CHAR[n]);
const RECOLOR = { Shirt: [0x2b3a67, 0x7a2e2e, 0x2f6b3a, 0x444444, 0xd9d1c0, 0x9b4f96, 0x1e6f8c, 0xcc7722, 0xe8e2d0, 0x6b1f2a], Pants: [0x1f2a44, 0x222222, 0x4a3b2a, 0x5a5a5a, 0x2d3e5a], Jacket: [0x1d1d1d, 0x3d2b1f, 0x5a1e1e, 0x23324a], LightJacket: [0xb9a27a, 0x7d8a5a, 0x2d3e5a], Dress: [0x7a2e8e, 0xb03a3a, 0x1e6f8c, 0x2f6b3a, 0x222222], Hair: [0x1a1a1a, 0x3b2a1a, 0x6a4520, 0xc8a050, 0x8a8a8a], HairBase: null };
function playAnim(h, key, opts = {}) {
  const u = h.userData; if (!u.mixer) return; const T = CHAR[u.charName]; const fam = T.family;
  const map = { idle: fam === 'hero' ? 'Idle_Neutral' : 'Idle', walk: 'Walk', run: 'Run', death: 'Death', aim: fam === 'hero' ? 'Idle_Gun_Pointing' : 'Idle', aimRun: fam === 'hero' ? 'Run_Shoot' : 'Run', shoot: fam === 'hero' ? 'Idle_Gun_Shoot' : 'Punch' };
  const clipName = map[key] || key; if (u.curAnim === clipName) return; const clip = T.clips[clipName] || T.clips.Idle || Object.values(T.clips)[0]; if (!clip) return;
  const next = u.mixer.clipAction(clip); next.reset(); next.enabled = true; next.setEffectiveWeight(1);
  if (opts.once) { next.setLoop(THREE.LoopOnce, 1); next.clampWhenFinished = true; } else next.setLoop(THREE.LoopRepeat, Infinity);
  next.play(); if (u.curAction) u.curAction.crossFadeTo(next, opts.fade ?? 0.22, false); u.curAction = next; u.curAnim = clipName;
}
let ANIM_DT = 1 / 60;
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _tv = new THREE.Vector3(), _camWant = new THREE.Vector3(), _aiTo = new THREE.Vector3(); // Scratch-Vektoren statt Allokationen pro Bild
function syncHand(h) { const u = h.userData; if (!u.handBone) return; u.handBone.getWorldPosition(_v1); h.worldToLocal(_v1); u.hand.position.copy(_v1); u.hand.position.z += 0.11; u.hand.position.y += 0.02; }
const _pedMatCache = new Map();
function makeHumanModel(name, opts = {}) {
  const T = CHAR[name]; const model = SkeletonUtils.clone(T.scene); model.scale.multiplyScalar(T.k); model.position.y = T.yOff;
  const g = new THREE.Group(); g.add(model); const dummy = () => new THREE.Object3D();
  // Feste Hülle für Frustum-Culling: 2,4 m um den Figurenursprung, in Mesh-Einheiten (die GLTF-Knoten sind intern stark skaliert)
  g.updateMatrixWorld(true); model.traverse(o => { if (o.isSkinnedMesh) { const s = o.getWorldScale(_v1).x || 1; o.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 2.4 / s); } });
  model.traverse(o => { if (!o.isMesh) return; o.castShadow = !!opts.shadow; o.receiveShadow = false; o.frustumCulled = true;
    const mn = o.material.name; const pal = RECOLOR[mn]; if (pal && !opts.keepColors) { const hex = pick(pal), ck = o.material.uuid + '|' + hex; let pm = _pedMatCache.get(ck); if (!pm) { pm = o.material.clone(); pm.color.setHex(hex).convertSRGBToLinear(); pm.userData.shared = true; _pedMatCache.set(ck, pm); } o.material = pm; } });
  const mixer = new THREE.AnimationMixer(model); let handBone = null; const bones = {};
  model.traverse(o => { if (o.isBone) { bones[o.name] = o; if (T.hand && o.name === T.hand) handBone = o; } });
  const hand = new THREE.Object3D(); hand.rotation.y = Math.PI; g.add(hand);
  g.userData = { female: /woman/.test(name), charName: name, mixer, handBone, bones, hand, legL: dummy(), legR: dummy(), armL: dummy(), armR: dummy(), torso: dummy() };
  playAnim(g, 'idle'); mixer.update(Math.random() * 2); g.updateMatrixWorld(true); syncHand(g);
  return g;
}
function poseBikeRider(h, moto, pedT = 0, aiming = false, relYaw = 0, pitch = 0) {
  const u = h.userData, B = u.bones;
  if (u.mixer) {
    if (u.actT > 0) { u.actT -= ANIM_DT; if (u.actT <= 0) u.curAnim = null; }
    else playAnim(h, aiming ? 'aim' : 'idle', { fade: 0.1 });
    u.mixer.update(ANIM_DT);
  }
  if (!B || !B.UpperLegL || !B.LowerLegL) {
    const ph = pedT * 4.5, s = moto ? 0 : Math.sin(ph) * 0.35;
    u.legL.rotation.x = -1.05 + s; u.legR.rotation.x = -1.05 - s;
    u.armL.rotation.set(-1.1, 0, -0.15);
    u.armR.rotation.set(aiming ? -Math.PI / 2 + pitch : -1.1, aiming ? relYaw : 0, 0.15);
    return;
  }
  h.updateMatrixWorld(true);
  const hq = h.getWorldQuaternion(_q1);
  const aimB = (b, lx, ly, lz) => {
    if (!b) return;
    b.parent.updateWorldMatrix(true, false); b.updateWorldMatrix(false, false);
    const tgt = _v1.set(lx, ly, lz).normalize().applyQuaternion(hq);
    const wq = b.getWorldQuaternion(_q2);
    const cur = _v2.set(0, 1, 0).applyQuaternion(wq);
    wq.premultiply(_q3.setFromUnitVectors(cur, tgt));
    b.quaternion.copy(b.parent.getWorldQuaternion(_q3).invert().multiply(wq));
    b.updateMatrixWorld(true);
  };
  if (aiming) {
    const sy = Math.sin(relYaw * 0.45), cy = Math.cos(relYaw * 0.45);
    aimB(B.Abdomen, sy * 0.18, 0.96, cy * 0.22);
    aimB(B.Torso || B.Chest, sy * 0.26, 0.94, cy * 0.26);
    aimB(B.Head, Math.sin(relYaw * 0.65) * 0.25, 0.97, Math.cos(relYaw * 0.65) * 0.25);
  } else {
    aimB(B.Abdomen, 0, 0.92, moto ? 0.36 : 0.40);
    aimB(B.Torso || B.Chest, 0, 0.90, moto ? 0.40 : 0.44);
    aimB(B.Head, 0, 0.99, 0.14);
  }
  if (moto) {
    aimB(B.UpperLegL, 0.24, -0.32, 0.92); aimB(B.LowerLegL, 0.10, -0.92, -0.36);
    aimB(B.UpperLegR, -0.24, -0.32, 0.92); aimB(B.LowerLegR, -0.10, -0.92, -0.36);
  } else {
    const ph = pedT * 4.5, sL = Math.sin(ph), cL = Math.cos(ph);
    aimB(B.UpperLegL, 0.14, -0.30 + 0.26 * sL, 0.90); aimB(B.LowerLegL, 0.06, -0.95, 0.05 + 0.22 * cL);
    aimB(B.UpperLegR, -0.14, -0.30 - 0.26 * sL, 0.90); aimB(B.LowerLegR, -0.06, -0.95, 0.05 - 0.22 * cL);
  }
  for (const [f, e] of [[B.FootL, B.LowerLegL_end], [B.FootR, B.LowerLegR_end]]) {
    if (f && e) { e.getWorldPosition(_v1); f.parent.updateWorldMatrix(true, false); f.position.copy(f.parent.worldToLocal(_v1)); f.updateMatrixWorld(true); }
  }
  aimB(B.UpperArmL, -0.12, -0.46, 0.88); aimB(B.LowerArmL, -0.08, -0.14, 0.98);
  if (aiming && u.actT <= 0) {
    const p = clamp(pitch - (u.recoil || 0) * 0.8, -0.9, 0.9);
    const ax = Math.sin(relYaw) * Math.cos(p), ay = -Math.sin(p), az = Math.cos(relYaw) * Math.cos(p);
    aimB(B.UpperArmR, ax, ay - 0.06, az); aimB(B.LowerArmR, ax, ay + 0.04, az);
    syncHand(h); u.hand.rotation.set(p, Math.PI + relYaw, 0, 'YXZ');
  } else {
    if (u.actT <= 0) { aimB(B.UpperArmR, 0.12, -0.46, 0.88); aimB(B.LowerArmR, 0.08, -0.14, 0.98); }
    syncHand(h); u.hand.rotation.set(0, Math.PI, 0);
  }
}
function makeHuman(female, opts = {}) {
  let name = opts.model; if (!name) name = female ? pick(PED_FEMALE) : pick(PED_MALE); if (name && CHAR[name]) return makeHumanModel(name, opts);
  return makeHumanBox(female, opts);
}
function makeHumanBox(female, opts = {}) {
  const g = new THREE.Group(); g.userData.female = female;
  const lam = c => new THREE.MeshLambertMaterial({ color: c });
  const skin = lam(opts.skin ?? pick(SKIN)), top = lam(opts.top ?? pick(CLOTH)), pants = lam(opts.pants ?? pick(CLOTH)), hair = lam(pick(HAIRCOL));
  const shoe = lam(pick([0x111111, 0x3a2a1a, 0xf0f0f0, 0x7a1f1f])), dark = lam(0x161616);
  const box = (w, h, d, m, x, y, z) => { const mm = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); mm.position.set(x, y, z); mm.castShadow = !!opts.shadow; g.add(mm); return mm; };
  const style = opts.style ?? pick(female ? ['shirt', 'jacket', 'hoodie', 'dress', 'skirt'] : ['shirt', 'jacket', 'hoodie', 'shirt']);
  const sw = female ? 0.36 : 0.46, hip = female ? 0.4 : 0.4;
  const legMat = (style === 'dress' || style === 'skirt') ? (Math.random() < 0.5 ? skin : dark) : pants;
  // Beine + Schuhe (Drehpunkt an der Hüfte)
  const leg = (x) => { const l = new THREE.Group(); l.position.set(x, 0.85, 0); const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.8, 0.18), legMat); m.position.y = -0.42; m.castShadow = !!opts.shadow; l.add(m); const sh = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.1, 0.26), shoe); sh.position.set(0, -0.82, 0.04); l.add(sh); g.add(l); return l; };
  g.userData.legL = leg(-0.11); g.userData.legR = leg(0.11);
  if (style === 'dress') { box(hip + 0.1, 0.35, 0.34, top, 0, 0.7, 0); box(hip, 0.25, 0.28, top, 0, 0.98, 0); }
  else if (style === 'skirt') { box(hip + 0.06, 0.32, 0.32, pants, 0, 0.78, 0); }
  else box(hip, 0.22, 0.24, pants, 0, 0.9, 0);
  // Oberkörper
  const torso = box(sw, 0.6, 0.26, top, 0, 1.3, 0); g.userData.torso = torso;
  if (style === 'jacket') { const inner = lam(pick([0xffffff, 0xdddddd, 0x222222, 0xc0392b])); box(sw * 0.4, 0.5, 0.05, inner, 0, 1.32, 0.14); box(sw + 0.06, 0.62, 0.3, top, 0, 1.3, -0.02).material = top; torso.visible = false; }
  if (style === 'hoodie') { box(0.3, 0.16, 0.16, top, 0, 1.64, -0.14); }
  // Arme (Drehpunkt an der Schulter)
  const arm = (x) => { const a = new THREE.Group(); a.position.set(x, 1.56, 0); const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.12), style === 'dress' && Math.random() < 0.5 ? skin : top); m.position.y = -0.3; m.castShadow = !!opts.shadow; a.add(m); const h = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.1, 0.11), skin); h.position.y = -0.64; a.add(h); g.add(a); return a; };
  g.userData.armL = arm(-(sw / 2 + 0.08)); g.userData.armR = arm(sw / 2 + 0.08);
  // Hals, Kopf, Gesicht
  box(0.1, 0.12, 0.1, skin, 0, 1.66, 0);
  box(0.26, 0.28, 0.26, skin, 0, 1.86, 0);
  box(0.03, 0.03, 0.02, dark, -0.06, 1.89, 0.13); box(0.03, 0.03, 0.02, dark, 0.06, 1.89, 0.13);
  // Frisur / Kopfbedeckung
  const hs = opts.hair ?? pick(female ? ['long', 'long', 'bun', 'short', 'cap'] : ['short', 'short', 'bald', 'cap', 'beanie', 'long']);
  if (hs === 'long') { box(0.3, 0.14, 0.3, hair, 0, 1.98, -0.01); box(0.3, 0.42, 0.12, hair, 0, 1.78, -0.14); box(0.1, 0.3, 0.26, hair, -0.14, 1.8, 0); box(0.1, 0.3, 0.26, hair, 0.14, 1.8, 0); }
  else if (hs === 'bun') { box(0.3, 0.14, 0.3, hair, 0, 1.98, -0.01); box(0.14, 0.14, 0.14, hair, 0, 2.02, -0.14); }
  else if (hs === 'short') box(0.28, 0.1, 0.28, hair, 0, 2.0, 0);
  else if (hs === 'cap') { const c = lam(pick([0xc0392b, 0x2c3e50, 0x111111, 0x27ae60])); box(0.3, 0.12, 0.3, c, 0, 1.99, 0); box(0.26, 0.03, 0.14, c, 0, 1.95, 0.2); }
  else if (hs === 'beanie') { box(0.3, 0.18, 0.3, lam(pick([0x7f8c8d, 0x8e44ad, 0x111111])), 0, 2.0, 0); }
  if (Math.random() < 0.2) box(0.28, 0.04, 0.03, dark, 0, 1.89, 0.14); // Brille
  if (!opts.shadow && Math.random() < 0.25) box(0.12, 0.26, 0.2, lam(pick([0x3b2a1a, 0x111111, 0x8e44ad])), -(sw / 2 + 0.18), 1.1, 0); // Tasche
  g.userData.hand = new THREE.Object3D(); g.userData.hand.position.set(0, -0.62, 0); g.userData.armR.add(g.userData.hand);
  g.scale.setScalar(opts.shadow ? 1 : rnd(0.92, 1.08) * (female ? 0.97 : 1));
  return g;
}
function makeGun() {
  if (gPistol) { const g = new THREE.Group(); const m = gPistol.scene.clone(true); m.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(m); const sz = box.getSize(new THREE.Vector3());
    const L = Math.max(sz.x, sz.y, sz.z); const wrap = new THREE.Group(); wrap.add(m); if (sz.x === L) wrap.rotation.y = Math.PI / 2; else if (sz.y === L) wrap.rotation.x = Math.PI / 2;
    wrap.scale.setScalar(0.24 / L); wrap.updateMatrixWorld(true); const b2 = new THREE.Box3().setFromObject(wrap); const c2 = b2.getCenter(new THREE.Vector3()); wrap.position.sub(c2); g.add(wrap);
    m.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    const flashTex = canvasTex(64, 64, (ctx, w, h) => { const gr = ctx.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,220,1)'); gr.addColorStop(0.3, 'rgba(255,200,80,0.9)'); gr.addColorStop(1, 'rgba(255,120,0,0)'); ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h); });
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); flash.position.set(0, 0.03, -0.17); flash.scale.set(0.5, 0.5, 1); flash.visible = false; g.add(flash); g.userData.flash = flash; g.userData.muzzle = new THREE.Object3D(); g.userData.muzzle.position.set(0, 0.03, -0.14); g.add(g.userData.muzzle); g.userData.model = wrap;
    return g; }
  const g = new THREE.Group(); const m = new THREE.MeshLambertMaterial({ color: 0x1a1a1a }); const m2 = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.1), m); grip.position.set(0, -0.04, 0.04);
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.42), m2); slide.position.set(0, 0.1, -0.14);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 8), m); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.1, -0.4);
  g.add(grip, slide, barrel);
  const flashTex = canvasTex(64, 64, (ctx, w, h) => { const gr = ctx.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,220,1)'); gr.addColorStop(0.3, 'rgba(255,200,80,0.9)'); gr.addColorStop(1, 'rgba(255,120,0,0)'); ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h); });
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); flash.position.set(0, 0.1, -0.5); flash.scale.set(0.6, 0.6, 1); flash.visible = false; g.add(flash); g.userData.flash = flash; g.userData.muzzle = new THREE.Object3D(); g.userData.muzzle.position.set(0, 0.1, -0.48); g.add(g.userData.muzzle);
  return g;
}
function animateWalk(h, t, speed) {
  const u = h.userData;
  if (u.mixer) { if (u.dead) return; if (u.actT > 0) { u.actT -= ANIM_DT; u.mixer.update(ANIM_DT); syncHand(h); if (u.actT <= 0) u.curAnim = null; return; } const run = speed > 4.6; const key = speed <= 0.05 ? (u.aiming ? 'aim' : 'idle') : (u.aiming ? (run ? 'aimRun' : 'aimRun') : (run ? 'run' : 'walk')); playAnim(h, key);
    if (u.curAction) u.curAction.timeScale = speed <= 0.05 ? 1 : clamp(speed / (run ? 6.5 : 3.2), 0.6, 1.6);
    if (!u.lod) { u.acc = (u.acc || 0) + ANIM_DT; if (h !== player.mesh && h.position.distanceToSquared(camera.position) > 900 && ((u.fr = (u.fr || 0) + 1) & 1)) return; u.mixer.update(u.acc); u.acc = 0; if (u.hand.children.length) syncHand(h); } return; }
  if (speed <= 0.01) { // Stand: leichtes Atmen, Arme hängen
    const b = Math.sin(t * 1.6) * 0.02; u.legL.rotation.x = 0; u.legR.rotation.x = 0;
    if (!u.aiming) { u.armL.rotation.x = b; u.armR.rotation.x = -b; u.armL.rotation.z = 0.08; u.armR.rotation.z = -0.08; }
    return;
  }
  const s = Math.min(speed / 4, 1.3), a = Math.sin(t * 9) * 0.7 * s;
  u.legL.rotation.x = a; u.legR.rotation.x = -a;
  if (!u.aiming) { u.armL.rotation.x = -a * 0.8; u.armR.rotation.x = a * 0.8; u.armL.rotation.z = 0.08; u.armR.rotation.z = -0.08; }
}

// ---------- Autos ----------
const CARCOL = [0xc0392b, 0x2980b9, 0xf1c40f, 0xecf0f1, 0x2c3e50, 0x27ae60, 0x8e44ad, 0xe67e22, 0x95a5a6, 0x111111];
const CAR_TYPES = {
  compact: { w: 1.72, h: 0.52, l: 3.6, cabW: 1.55, cabH: 0.52, cabL: 1.9, cabZ: -0.05, y: 0.5 },
  sedan:   { w: 1.84, h: 0.55, l: 4.5, cabW: 1.64, cabH: 0.5, cabL: 2.1, cabZ: -0.35, y: 0.52 },
  sport:   { w: 1.9,  h: 0.42, l: 4.3, cabW: 1.6, cabH: 0.38, cabL: 1.7, cabZ: -0.45, y: 0.45 },
  van:     { w: 1.95, h: 0.75, l: 4.9, cabW: 1.9, cabH: 0.85, cabL: 3.6, cabZ: -0.45, y: 0.62 },
  suv:     { w: 1.92, h: 0.7, l: 4.6, cabW: 1.75, cabH: 0.62, cabL: 2.5, cabZ: -0.3, y: 0.62 },
};
const glassMat = new THREE.MeshLambertMaterial({ color: 0x0e1420, emissive: 0x1a2436 });
const headGlowTex = canvasTex(64, 64, (ctx, w, h) => { const gr = ctx.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(255,245,210,0.9)'); gr.addColorStop(1, 'rgba(255,245,210,0)'); ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h); });
const headGlowMat = new THREE.SpriteMaterial({ map: headGlowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
const coneTex = canvasTex(64, 128, (ctx, w, h) => { const gr = ctx.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,240,200,0.35)'); gr.addColorStop(1, 'rgba(255,240,200,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(42, 0); ctx.lineTo(64, h); ctx.lineTo(0, h); ctx.fill(); });
// --- Modell-Autos (Quaternius, Kay Lousberg, CC0) ---
const CAR_TPL = {}; const BODY_MATS = ['Blue', 'LightBlue', 'White', 'Yellow', 'Main', 'Red', 'Green'];
const CAR_LEN = { sedan: 4.5, small: 3.8, suv: 4.7, taxi: 4.6, police: 4.7, hatchback: 4.1, wagon: 4.7 };
CAR_FILES.forEach((name, i) => { const g = gCars[i]; if (!g) return; const s = g.scene; s.updateMatrixWorld(true);
  // Räder um ihre eigene Mitte drehbar machen
  const wheels = []; s.traverse(o => { if (/wheel/i.test(o.name) && (o.isMesh || o.isGroup || o.type === 'Object3D') && !wheels.some(w => { let p = o.parent; while (p) { if (p === w) return true; p = p.parent; } return false; })) wheels.push(o); });
  for (const w of wheels) { const b = new THREE.Box3().setFromObject(w); if (b.isEmpty()) continue; const c = b.getCenter(new THREE.Vector3()); const piv = new THREE.Object3D(); piv.position.copy(c); piv.userData.wheel = true; s.add(piv); piv.attach(w); }
  const root = new THREE.Group(); const inner = new THREE.Group(); inner.add(s); root.add(inner); s.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(s); let sz = box.getSize(new THREE.Vector3()); if (sz.x > sz.z) { inner.rotation.y = Math.PI / 2; }
  // Vorne finden: Scheinwerfer-Material oder hellere Seite
  inner.updateMatrixWorld(true); box = new THREE.Box3().setFromObject(inner); const cz = (box.min.z + box.max.z) / 2; let hz = null, tz = null; inner.traverse(o => { if (!o.isMesh) return; const nm = o.material.name; if (nm !== 'Headlights' && nm !== 'TailLights') return; const hb = new THREE.Box3().setFromObject(o); const z = (hb.min.z + hb.max.z) / 2; if (nm === 'Headlights') hz = z; else tz = z; });
  if (hz !== null && tz !== null ? hz < tz : (hz !== null ? hz < cz : (tz !== null && tz > cz))) inner.rotation.y += Math.PI;
  inner.updateMatrixWorld(true); box = new THREE.Box3().setFromObject(inner); sz = box.getSize(new THREE.Vector3()); const k = (CAR_LEN[name] || 4.4) / sz.z; inner.scale.setScalar(k);
  inner.updateMatrixWorld(true); box = new THREE.Box3().setFromObject(inner); const c = box.getCenter(new THREE.Vector3()); inner.position.set(-c.x, -box.min.y, -c.z); root.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(root); sz = box.getSize(new THREE.Vector3());
  CAR_TPL[name] = { root, dims: { w: sz.x, h: sz.y, l: sz.z } }; });
// --- Eigenes E-Auto (12.11.2026): markenfrei, im Code gezeichnet, rund 3.000 Dreiecke ---
// Crossover mit langer Motorhaube-Kurzform, Fastback, durchgehenden LED-Leisten vorn und hinten, Aero-Felgen.
// Seitenprofil als Form (Länge x Höhe), zur Breite extrudiert; Radhäuser als Bögen im Profil. Vorn = +z.
(() => {
  const root = new THREE.Group(); const inner = new THREE.Group(); root.add(inner);
  const lam = (name, col, em = 0, emCol = col) => { const m = new THREE.MeshLambertMaterial({ color: col, emissive: em ? emCol : 0x000000, emissiveIntensity: em }); m.name = name; return m; };
  const main = lam('Main', 0xffffff), glas = lam('Glass', 0x10161f, 0.25, 0x1c2735), schwarz = lam('Black', 0x16181b), felge = lam('Rim', 0x9aa1a8), felgeD = lam('RimDark', 0x2a2e33);
  const head = lam('Headlights', 0xf2f4f6, 0.4), tail = lam('TailLights', 0x8a1010, 0.3, 0x500808);
  const ext = (pts, depth, mat, bevel = 0.05) => { const s = new THREE.Shape(); pts.forEach(([u, v], i) => i ? s.lineTo(u, v) : s.moveTo(u, v)); return ext2(s, depth, mat, bevel); };
  const ext2 = (shape, depth, mat, bevel) => { const g = new THREE.ExtrudeGeometry(shape, { depth: depth - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 });
    g.translate(0, 0, -(depth - bevel * 2) / 2); g.rotateY(-Math.PI / 2); const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m; };
  // Karosserie bis zur Gürtellinie, mit zwei Radhäusern
  const AV = 1.45, AH = -1.42, R = 0.43, Y0 = 0.3;
  const k = new THREE.Shape(); k.moveTo(-2.33, Y0); k.lineTo(AH - R, Y0); k.absarc(AH, 0.37, R, Math.PI, 0, true); k.lineTo(AV - R, Y0); k.absarc(AV, 0.37, R, Math.PI, 0, true);
  [[2.3, Y0], [2.42, 0.42], [2.42, 0.6], [2.25, 0.72], [1.5, 0.84], [0.9, 0.92], [-0.8, 0.95], [-1.95, 0.97], [-2.33, 0.93], [-2.42, 0.7], [-2.4, 0.42]].forEach(([u, v]) => k.lineTo(u, v));
  inner.add(ext2(k, 1.9, main, 0.1));
  // Glashaus (dunkel), etwas schmaler; darauf ein Dach in Wagenfarbe mit schwarzer Abrisskante
  inner.add(ext([[0.9, 0.9], [0.05, 1.42], [-1.0, 1.47], [-1.9, 1.2], [-2.2, 0.94], [-0.8, 0.93]], 1.6, glas, 0.06));
  inner.add(ext([[0.0, 1.43], [-1.0, 1.48], [-1.82, 1.22], [-1.82, 1.26], [-1.0, 1.52], [0.0, 1.47]], 1.34, main, 0.02));
  inner.add(ext([[-1.86, 1.2], [-2.0, 1.12], [-1.98, 1.17], [-1.84, 1.25]], 1.5, schwarz, 0.01)); /* Dachspoiler */
  { const d = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.16, 0.12), schwarz); d.position.set(0, 0.42, -2.5); inner.add(d); } /* Diffusor */
  // Schweller und Radlaufverkleidung schwarz
  const sill = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.12, 1.9), schwarz); sill.position.set(0, 0.36, 0); inner.add(sill);
  // LED-Leisten über die ganze Breite
  const leiste = (z, y, mat, w = 1.62) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.045, 0.05), mat); m.position.set(0, y, z); inner.add(m); };
  leiste(2.53, 0.64, head); leiste(-2.53, 0.8, tail, 1.6); leiste(2.53, 0.47, schwarz, 1.2);
  // Räder: Reifen, Aero-Felge mit fünf Speichen, Drehpunkt in der Radmitte
  const reifenG = new THREE.CylinderGeometry(0.37, 0.37, 0.25, 22); reifenG.rotateZ(Math.PI / 2);
  const felgeG = new THREE.CylinderGeometry(0.27, 0.27, 0.26, 18); felgeG.rotateZ(Math.PI / 2);
  const nabeG = new THREE.CylinderGeometry(0.07, 0.07, 0.27, 8); nabeG.rotateZ(Math.PI / 2);
  const speicheG = new THREE.BoxGeometry(0.265, 0.05, 0.2);
  for (const z of [AV, AH]) for (const sx of [-1, 1]) {
    const piv = new THREE.Object3D(); piv.position.set(sx * 0.82, 0.37, z); piv.userData.wheel = true; piv.name = 'wheel';
    piv.add(new THREE.Mesh(reifenG, schwarz)); piv.add(new THREE.Mesh(felgeG, felgeD)); piv.add(new THREE.Mesh(nabeG, felge));
    for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(speicheG, felge); s.position.set(0, Math.cos(i / 5 * Math.PI * 2) * 0.13, Math.sin(i / 5 * Math.PI * 2) * 0.13); s.rotation.x = i / 5 * Math.PI * 2 - Math.PI / 2; piv.add(s); }
    inner.add(piv); }
  root.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(root); const sz = box.getSize(new THREE.Vector3());
  inner.position.y = -box.min.y; root.updateMatrixWorld(true);
  CAR_TPL.ev = { root, dims: { w: sz.x, h: sz.y, l: sz.z } };
})();
if (CAR_TPL.ev) { // 12.11.2026: E-Auto auch als Frankfurter Taxi (hellelfenbein, Dachschild) und als Streifenwagen (blau-silber)
  const D0 = CAR_TPL.ev.dims;
  const ab = (zusatz) => { const root = CAR_TPL.ev.root.clone(true); for (const m of zusatz) root.children[0].add(m); root.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(root); const s = b.getSize(new THREE.Vector3()); return { root, dims: { w: s.x, h: D0.h, l: s.z } }; };
  const schild = new THREE.MeshLambertMaterial({ color: 0xf6d34a, emissive: 0xf6d34a, emissiveIntensity: 0.35 }); schild.name = 'TaxiSign';
  const ts = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.16, 0.2), schild); ts.position.set(0, D0.h + 0.08, -0.45);
  CAR_TPL.evtaxi = ab([ts]);
  const blau = new THREE.MeshLambertMaterial({ color: 0x1d4f9e }); blau.name = 'PoliceBlue';
  const gelb = new THREE.MeshLambertMaterial({ color: 0xd8f020, emissive: 0xb8d010, emissiveIntensity: 0.25 }); gelb.name = 'PoliceYellow';
  const streifen = []; for (const sx of [-1, 1]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 3.3), blau); s.position.set(sx * 1.05, 0.62, 0.35); streifen.push(s); const y = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.42, 0.95), gelb); y.position.set(sx * 1.04, 0.62, -1.95); streifen.push(y); }
  { const y = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.3, 0.03), gelb); y.position.set(0, 0.6, -2.55); streifen.push(y); } /* Heckklappe neongelb */
  { const hb = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.03), blau); hb.position.set(0, 0.86, 2.4); streifen.push(hb); }
  CAR_TPL.evpolice = ab(streifen);
  // Kommandowagen der Feuerwehr (12.11.2026, nach Andrés Foto): Lack rot, weiße Flanke, Warnschrägen vorn/hinten, Blaulichtbalken mit Dachschild
  const weiss = new THREE.MeshLambertMaterial({ color: 0xf2f2f0 }); weiss.name = 'KdowWhite';
  const schraeg = canvasTex(128, 64, (c, w, h) => { c.fillStyle = '#e8281e'; c.fillRect(0, 0, w, h); c.fillStyle = '#e9ecef'; for (let x = -h; x < w + h; x += 32) { c.beginPath(); c.moveTo(x, h); c.lineTo(x + 14, h); c.lineTo(x + 14 + h, 0); c.lineTo(x + h, 0); c.fill(); } }, 1, 1);
  const schraegM = new THREE.MeshLambertMaterial({ map: schraeg }); schraegM.name = 'KdowChevron';
  const schildTex = canvasTex(256, 48, (c, w, h) => { c.fillStyle = '#f4f4f2'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.font = 'bold 26px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('FEUERWEHR', w / 2, h / 2 + 1); }, 1, 1);
  const schildM = new THREE.MeshLambertMaterial({ map: schildTex }); schildM.name = 'KdowSign';
  const blauL = new THREE.MeshLambertMaterial({ color: 0x2a5cff, emissive: 0x2a5cff, emissiveIntensity: 0.6 }); blauL.name = 'KdowBlue';
  const kd = [];
  for (const sx of [-1, 1]) { const fl = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.34, 1.5), weiss); { const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.3), schildM); pl.position.set(sx * 1.068, 0.68, -0.1); pl.rotation.y = sx * Math.PI / 2; kd.push(pl); } /* Schriftzug FEUERWEHR seitlich, je ein Mesh (Materiallisten brachen withColor) */ fl.position.set(sx * 1.05, 0.68, -0.1); kd.push(fl);
    const sv = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.9), schraegM); sv.position.set(sx * 1.05, 0.5, 1.9); kd.push(sv); }
  for (const z of [2.54, -2.54]) { const s = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.18, 0.03), schraegM); s.position.set(0, 0.5, z); kd.push(s); }
  { const bb = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.3), blauL); bb.position.set(0, D0.h + 0.05, 0.1); kd.push(bb); const sg = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 0.05), weiss); for (const s of [1, -1]) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.15), schildM); pl.position.set(0, D0.h + 0.17, 0.25 + s * 0.027); if (s < 0) pl.rotation.y = Math.PI; kd.push(pl); } sg.position.set(0, D0.h + 0.17, 0.25); kd.push(sg); }
  CAR_TPL.evkdow = ab(kd); CAR_TPL.evkdow.root.traverse(o => { if (o.isMesh && o.material.name === 'KdowBlue') o.material.name = 'BlueLights'; });
}
{ // Stadtbus 12 m, türkis (Foto 12.11.2026): Kasten mit Fensterband, Leuchtanzeige vorn, rote Rückleuchten, drei Achsen nicht nötig: zwei
  const root = new THREE.Group(), inner = new THREE.Group(); root.add(inner); const lam = (n, c, e = 0) => { const m = new THREE.MeshLambertMaterial({ color: c, emissive: e ? c : 0, emissiveIntensity: e }); m.name = n; return m; };
  const lack = lam('Main', 0xffffff), glas = lam('Glass', 0x141c26, 0.2), schw = lam('Black', 0x16181b), anz = lam('Display', 0xffa020, 0.9), tl = lam('TailLights', 0x8a1010, 0.3), hl = lam('Headlights', 0xf2f4f6, 0.4);
  const bx = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; inner.add(o); };
  bx(2.5, 2.6, 12, lack, 0, 1.65, 0); bx(2.52, 1.0, 10.6, glas, 0, 2.1, -0.4); bx(2.3, 1.3, 0.04, glas, 0, 2.0, 6.01); bx(1.6, 0.22, 0.05, anz, 0, 2.78, 6.02); bx(2.52, 0.3, 12.02, schw, 0, 0.5, 0);
  for (const sx of [-0.9, 0.9]) { bx(0.3, 0.14, 0.05, hl, sx, 0.75, 6.02); bx(0.25, 0.4, 0.05, tl, sx, 0.9, -6.02); }
  for (const z of [3.9, -3.2]) for (const sx of [-1, 1]) { const piv = new THREE.Object3D(); piv.position.set(sx * 1.1, 0.5, z); piv.userData.wheel = true; const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 16), schw); w.rotation.z = Math.PI / 2; piv.add(w); inner.add(piv); }
  root.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(root), s = b.getSize(new THREE.Vector3()); inner.position.y = -b.min.y; CAR_TPL.bus = { root, dims: { w: s.x, h: s.y, l: s.z } }; }
const LACK = autolack(THREE, CAR_TPL, QUALITY, LOW_GFX); // Sunset-Optik: Klarlack, Glas, Felgen (#152)
const CAR_PICK = ['ev', 'ev', 'ev', 'evtaxi', 'sedan', 'sedan', 'small', 'small', 'suv', 'hatchback', 'hatchback', 'wagon', 'wagon', 'taxi'].filter(n => CAR_TPL[n]); /* eigenes E-Auto am häufigsten (12.11.2026) */
function carBodyColor(name) { if (name === 'bus') return 0x19a7b8; return name === 'taxi' || name === 'evtaxi' ? 0xf0e3b8 : name === 'evpolice' ? 0xf3f5f7 : name === 'evkdow' ? 0xe8281e : name === 'police' ? 0xd5dbe2 : pick(CARCOL); }
function setCarColor(c, col) { c.userData.col = col; for (const m of c.userData.bodyMats || []) m.color.setHex(col).convertSRGBToLinear(); if (!c.userData.bodyMats) c.traverse(o => { if (o.isMesh && o.material?.color && o === c.children[0]) o.material.color.setHex(col); }); }
const CONE_MAT = new THREE.MeshBasicMaterial({ map: coneTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }); CONE_MAT.userData.shared = true;
const POLICE_BAR_G = new THREE.BoxGeometry(1.0, 0.14, 0.28); POLICE_BAR_G.userData.shared = true;
const POLICE_BAR_M = new THREE.MeshBasicMaterial({ color: 0x3b7bff }); POLICE_BAR_M.userData.shared = true;
function makeCar(police = false, typeName = null) {
  if (typeName === 'bike') return makeBike(); // Spielstand und Story bauen Räder über denselben Weg
  if (typeName === 'moto') return makeMoto();
  if (typeName === 'ambulance') return makeAmbulance();
  const name = police ? (typeName && /police/.test(typeName) && CAR_TPL[typeName] ? typeName : (CAR_TPL.evpolice && Math.random() < 0.5 ? 'evpolice' : 'police')) : (typeName && CAR_TPL[typeName] ? typeName : pick(CAR_PICK)); const T = CAR_TPL[name];
  if (!T) return makeCarBox(police);
  const g = new THREE.Group(); const m = T.root.clone(true); g.add(m); const D = T.dims;
  const bodyMats = [], heads = []; let tlMat = null, bar = null; const wheels = [];
  const inWheel = o => { let p = o; while (p) { if (p.userData.wheel) return true; p = p.parent; } return false; };
  m.traverse(o => { if (o.userData.wheel) wheels.push(o); if (!o.isMesh) return; const mn = o.material.name; const isBody = BODY_MATS.includes(mn); o.castShadow = isBody || mn === 'Black'; o.receiveShadow = isBody;
    if (police && mn === 'Black' && !inWheel(o)) { o.material = o.material.clone(); o.material.userData.own = true; o.material.color.setHex(0x1d4f9e).convertSRGBToLinear(); return; }
    if (isBody) { o.material = o.material.clone(); o.material.userData.own = true; bodyMats.push(o.material); }
    else if (mn === 'TailLights') { o.material = o.material.clone(); o.material.userData.own = true; tlMat = o.material; }
    else if (mn === 'Headlights' || mn === 'WhiteLights') { o.material = o.material.clone(); o.material.userData.own = true; heads.push(o.material); }
    else if (mn === 'BlueLights') { o.material = new THREE.MeshBasicMaterial({ color: 0x3b7bff }); o.material.userData.own = true; bar = o; } });
  if (!tlMat) { tlMat = new THREE.MeshBasicMaterial({ color: 0x8a1010 }); tlMat.userData.own = true; }
  if (police && !bar) { const bm = POLICE_BAR_M.clone(); bm.userData.own = true; bar = new THREE.Mesh(POLICE_BAR_G, bm); bar.position.set(0, D.h + 0.05, -0.2); g.add(bar); }
  if (!T.blinkGeoL) {
    /* Blinker an die Außenkante der echten Scheinwerfer und Rückleuchten (vorher Außenmaß des ganzen Modells samt Spiegel:
       Blinker schwebten neben dem Auto, André 12.11.2026). Ohne Leuchten-Meshes: 25 cm eingerückt */
    m.updateMatrixWorld(true); const fb = new THREE.Box3(), rb = new THREE.Box3(); m.traverse(o => { if (!o.isMesh) return; const mn = o.material && o.material.name; if (mn === 'Headlights' || mn === 'WhiteLights') fb.expandByObject(o); else if (mn === 'TailLights') rb.expandByObject(o); });
    const side = (bx, front) => bx.isEmpty() ? { x: D.w / 2 - 0.25, y: D.h * 0.45, z: (front ? 1 : -1) * (D.l / 2 - 0.15) } : { x: Math.max(Math.abs(bx.min.x), Math.abs(bx.max.x)) - 0.04, y: (bx.min.y + bx.max.y) / 2, z: front ? bx.max.z - 0.03 : bx.min.z + 0.03 };
    const F = side(fb, true), R = side(rb, false);
    const mkB = sg => { const g1 = new THREE.BoxGeometry(0.1, 0.07, 0.08), g2 = new THREE.BoxGeometry(0.1, 0.07, 0.08); g1.translate(sg * F.x, F.y, F.z); g2.translate(sg * R.x, R.y, R.z); const mg = mergeGeometries([g1, g2]); g1.dispose(); g2.dispose(); mg.userData.shared = true; return mg; };
    T.blinkGeoL = mkB(-1); T.blinkGeoR = mkB(1);
    T.coneGeo = new THREE.PlaneGeometry(D.w + 2.5, 9); T.coneGeo.userData.shared = true;
  }
  const blMat = [new THREE.MeshBasicMaterial({ color: 0x553300 }), new THREE.MeshBasicMaterial({ color: 0x553300 })]; blMat[0].userData.own = blMat[1].userData.own = true;
  g.add(new THREE.Mesh(T.blinkGeoL, blMat[0]), new THREE.Mesh(T.blinkGeoR, blMat[1]));
  const cone = new THREE.Mesh(T.coneGeo, CONE_MAT); cone.rotation.x = -Math.PI / 2; cone.position.set(0, 0.08, D.l / 2 + 4.6); cone.visible = false; g.add(cone);
  g.userData = { speed: 0, heading: 0, hp: 100, police, driver: null, mode: 'parked', bar, wheels, tlMat, cone, type: name, blMat, blink: 0, blinkT: 0, heads, bodyMats, dims: D };
  setCarColor(g, carBodyColor(name)); return g;
}
function makeCarBox(police = false) {
  const g = new THREE.Group();
  const T = CAR_TYPES[police ? 'sedan' : pick(['compact', 'compact', 'sedan', 'sedan', 'sport', 'van', 'suv'])];
  const col = police ? 0xf2f2f2 : pick(CARCOL);
  const paint = new THREE.MeshLambertMaterial({ color: col });
  const body = new THREE.Mesh(new THREE.BoxGeometry(T.w, T.h, T.l), paint); body.position.y = T.y; body.castShadow = true;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(T.cabW, T.cabH, T.cabL), paint); cab.position.set(0, T.y + T.h / 2 + T.cabH / 2, T.cabZ);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(T.cabW + 0.02, T.cabH * 0.55, T.cabL + 0.02), glassMat); glass.position.set(0, cab.position.y + T.cabH * 0.05, T.cabZ);
  const pillarF = new THREE.Mesh(new THREE.BoxGeometry(T.cabW * 0.9, T.cabH * 0.55, 0.06), paint); pillarF.position.set(0, glass.position.y, T.cabZ + T.cabL / 2 - 0.2); pillarF.visible = false;
  g.add(body, cab, glass);
  const dark = new THREE.MeshLambertMaterial({ color: 0x222222 });
  for (const z of [T.l / 2 + 0.05, -T.l / 2 - 0.05]) { const b = new THREE.Mesh(new THREE.BoxGeometry(T.w + 0.04, 0.18, 0.12), dark); b.position.set(0, T.y - T.h / 2 + 0.12, z); g.add(b); } // Stoßstangen
  for (const x of [-(T.cabW / 2 + 0.08), T.cabW / 2 + 0.08]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.1), paint); m.position.set(x, T.y + T.h / 2 + 0.2, T.cabZ + T.cabL / 2 - 0.15); g.add(m); } // Spiegel
  const plate = new THREE.MeshLambertMaterial({ color: 0xeeeeee }); for (const z of [T.l / 2 + 0.12, -T.l / 2 - 0.12]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.11, 0.02), plate); p.position.set(0, T.y - T.h / 2 + 0.3, z); g.add(p); }
  let bar = null;
  if (police) { bar = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0x3b7bff })); bar.position.set(0, cab.position.y + T.cabH / 2 + 0.08, T.cabZ); g.add(bar); const stripe = new THREE.Mesh(new THREE.BoxGeometry(T.w + 0.02, 0.18, T.l - 0.3), new THREE.MeshLambertMaterial({ color: 0x2a55c9 })); stripe.position.y = T.y + 0.05; g.add(stripe); }
  // Räder mit Felgen
  const wg = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12); wg.rotateZ(Math.PI / 2); const wm = new THREE.MeshLambertMaterial({ color: 0x151515 });
  const rg = new THREE.CylinderGeometry(0.2, 0.2, 0.26, 8); rg.rotateZ(Math.PI / 2); const rm = new THREE.MeshLambertMaterial({ color: 0x9a9a9a });
  const wheels = [];
  for (const [x, z] of [[-T.w / 2, T.l / 2 - 0.75], [T.w / 2, T.l / 2 - 0.75], [-T.w / 2, -T.l / 2 + 0.75], [T.w / 2, -T.l / 2 + 0.75]]) { const w = new THREE.Group(); w.position.set(x, 0.34, z); w.add(new THREE.Mesh(wg, wm), new THREE.Mesh(rg, rm)); g.add(w); wheels.push(w); }
  // Scheinwerfer + Lichtkegel, Rücklichter
  const hl = new THREE.MeshBasicMaterial({ color: 0xfff6d0 }); for (const x of [-T.w / 2 + 0.35, T.w / 2 - 0.35]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.05), hl); l.position.set(x, T.y + 0.08, T.l / 2 + 0.01); g.add(l); const sp = new THREE.Sprite(headGlowMat); sp.position.set(x, T.y + 0.08, T.l / 2 + 0.1); sp.scale.set(0.8, 0.8, 1); g.add(sp); }
  const cone = new THREE.Mesh(new THREE.PlaneGeometry(T.w + 2.5, 9), new THREE.MeshBasicMaterial({ map: coneTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); cone.geometry.userData.own = cone.material.userData.own = true; cone.rotation.x = -Math.PI / 2; cone.position.set(0, 0.08, T.l / 2 + 4.6); g.add(cone);
  const tlMat = new THREE.MeshBasicMaterial({ color: 0x8a1010 }); for (const x of [-T.w / 2 + 0.3, T.w / 2 - 0.3]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.05), tlMat); l.position.set(x, T.y + 0.1, -T.l / 2 - 0.01); g.add(l); }
  const blMat = [new THREE.MeshBasicMaterial({ color: 0x553300 }), new THREE.MeshBasicMaterial({ color: 0x553300 })]; blMat[0].userData.own = blMat[1].userData.own = true;
  for (const [i, x] of [[0, -T.w / 2 + 0.08], [1, T.w / 2 - 0.08]]) for (const z of [T.l / 2 - 0.02, -T.l / 2 + 0.02]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.1), blMat[i]); b.position.set(x, T.y + 0.1, z); g.add(b); }
  g.userData = { speed: 0, heading: 0, hp: 100, police, driver: null, mode: 'parked', bar, wheels, tlMat, cone, type: T, blMat, blink: 0, blinkT: 0 };
  return g;
}
const cars = [], peds = [], shootables = [], pickups = [], trams = [];
const roadsDrivable = [], pedRoads = []; // Straßen der gebauten Kacheln
function randomRoadPoint(r) {
  const i = (Math.random() * (r.p.length - 1)) | 0; const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const t = Math.random();
  return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, heading: Math.atan2(bx - ax, bz - az), road: r, seg: i, dir: Math.random() < 0.5 ? 1 : -1 };
}
// ---------- Fahrrad ----------
// Ein Rad ist ein „Auto“ im Fahrzeugsystem (cars, driveCar, carFx), nur klein, langsam, ohne Motor und Lichter; es kippt um statt zu explodieren.
const BIKE_COLS = [0x2d6fd8, 0xd8402d, 0x3aa35a, 0xf0c030, 0x222222, 0xe8e8e8, 0x8a3dff, 0xff8c3a];
const BIKE_TIRE = new THREE.MeshLambertMaterial({ color: 0x181818 }), BIKE_RIM = new THREE.MeshLambertMaterial({ color: 0xb8b8b8 }), BIKE_BLACK = new THREE.MeshLambertMaterial({ color: 0x222222 });
const BIKE_R = 0.34; // Radradius, passt zur Drehung in carFx
function makeBike(col) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body); const frame = new THREE.MeshLambertMaterial({ color: col ?? pick(BIKE_COLS) }); const wheels = [];
  for (const z of [0.55, -0.55]) { const piv = new THREE.Object3D(); piv.position.set(0, BIKE_R, z); const tire = new THREE.Mesh(new THREE.TorusGeometry(BIKE_R, 0.035, 6, 18), BIKE_TIRE); tire.rotation.y = Math.PI / 2; const rim = new THREE.Mesh(new THREE.CylinderGeometry(BIKE_R - 0.04, BIKE_R - 0.04, 0.012, 14), BIKE_RIM); rim.rotation.z = Math.PI / 2; piv.add(tire, rim); piv.userData.wheel = true; body.add(piv); wheels.push(piv); }
  const tube = (a, b, r = 0.022, mat = frame) => { const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 6), mat); m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); body.add(m); return m; };
  const BB = [0, 0.3, -0.05], SEAT = [0, 0.93, -0.25], HEAD = [0, 0.9, 0.33], RA = [0, BIKE_R, -0.55], FA = [0, BIKE_R, 0.55];
  tube(BB, SEAT); tube(SEAT, HEAD); tube(HEAD, BB); tube(BB, RA, 0.014); tube(SEAT, RA, 0.014); tube(HEAD, FA, 0.016); tube([0, 0.9, 0.33], [0, 1.0, 0.3], 0.016);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.52, 6), BIKE_BLACK); bar.rotation.z = Math.PI / 2; bar.position.set(0, 1.0, 0.3); body.add(bar);
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.26), BIKE_BLACK); saddle.position.set(0, 0.97, -0.26); body.add(saddle);
  const crank = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.03), BIKE_BLACK); crank.position.set(0, 0.3, -0.05); crank.rotation.x = 0.6; body.add(crank);
  body.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.geometry.userData.own = true; } }); frame.userData.own = true;
  g.userData = { speed: 0, heading: 0, hp: 40, police: false, driver: null, mode: 'parked', bar: null, wheels, tlMat: {}, cone: Object.assign(new THREE.Object3D(), { visible: false }), type: 'bike', blMat: null, blink: 0, blinkT: 0, heads: [], bodyMats: [frame], dims: { w: 0.6, h: 1.1, l: 1.8 }, bike: true, maxS: 9, accel: 5 };
  return g;
}
// Motorrad: im Fahrzeugsystem ein „Rad“ (bike: true: Fahrer sitzt sichtbar, kippt statt zu explodieren), aber mit Motor (moto: true)
const MOTO_COLS = [0xc0392b, 0x1f1f1f, 0x2d6fd8, 0xf2c418, 0x27ae60, 0xe8e8e8, 0x8e44ad];
function makeMoto(col) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body); const paint = new THREE.MeshLambertMaterial({ color: col ?? pick(MOTO_COLS) }); const dark = BIKE_BLACK, metal = BIKE_RIM; const wheels = []; const R = 0.33;
  for (const z of [0.72, -0.68]) { const piv = new THREE.Object3D(); piv.position.set(0, R, z); const tire = new THREE.Mesh(new THREE.TorusGeometry(R - 0.05, 0.075, 8, 20), BIKE_TIRE); tire.rotation.y = Math.PI / 2; const rim = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.1, R - 0.1, 0.05, 14), metal); rim.rotation.z = Math.PI / 2; piv.add(tire, rim); piv.userData.wheel = true; body.add(piv); wheels.push(piv); }
  const box = (w, h, l, x, y, z, m, rx = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), m); b.position.set(x, y, z); b.rotation.x = rx; body.add(b); return b; };
  box(0.34, 0.24, 0.52, 0, 0.86, 0.2, paint, -0.12); /* Tank */ box(0.3, 0.09, 0.62, 0, 0.84, -0.3, dark); /* Sitzbank */ box(0.32, 0.32, 0.46, 0, 0.5, 0.02, metal); /* Motor */
  box(0.26, 0.16, 0.4, 0, 0.66, -0.62, paint, 0.15); /* Heck */ box(0.05, 0.62, 0.05, 0.1, 0.62, 0.62, metal, -0.35); box(0.05, 0.62, 0.05, -0.1, 0.62, 0.62, metal, -0.35); /* Gabel */
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.66, 6), dark); bar.rotation.z = Math.PI / 2; bar.position.set(0, 1.04, 0.5); body.add(bar);
  const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.7, 8), metal); ex.rotation.x = Math.PI / 2 - 0.12; ex.position.set(0.2, 0.36, -0.36); body.add(ex);
  const lampMat = new THREE.MeshLambertMaterial({ color: 0xfff6d8, emissive: 0xfff2c0, emissiveIntensity: 0.25 }); const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), lampMat); lamp.position.set(0, 0.96, 0.66); body.add(lamp);
  body.traverse(o => { if (o.isMesh) { o.castShadow = true; o.geometry.userData.own = true; } }); paint.userData.own = true; lampMat.userData.own = true;
  g.userData = { speed: 0, heading: 0, hp: 90, police: false, driver: null, mode: 'parked', bar: null, wheels, tlMat: {}, cone: Object.assign(new THREE.Object3D(), { visible: false }), type: 'moto', blMat: null, blink: 0, blinkT: 0, heads: [lampMat], bodyMats: [paint], dims: { w: 0.8, h: 1.2, l: 2.1 }, bike: true, moto: true, maxS: 36, accel: 11 };
  return g;
}
// ---------- Rettungswagen (RTW) ----------
const rtwSideTex = canvasTex(512, 128, (ctx, w, h) => { ctx.fillStyle = '#f4f6f8'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#e62420'; ctx.fillRect(0, 68, w, 44); ctx.fillStyle = '#ffe135'; ctx.fillRect(0, 56, w, 12); ctx.fillStyle = '#e62420'; ctx.font = '900 38px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✚ RETTUNGSDIENST 112', w / 2, 30); ctx.fillStyle = '#ffffff'; ctx.font = '900 28px system-ui,sans-serif'; ctx.fillText('NOTFALLRETTUNG FRANKFURT', w / 2, 90); });
const rtwBackTex = canvasTex(256, 128, (ctx, w, h) => { ctx.fillStyle = '#e62420'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#ffe135'; ctx.fillRect(0, h - 18, w, 18); ctx.fillStyle = '#ffffff'; ctx.font = '900 44px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✚ RTW 112', w / 2, h / 2 - 6); });
const RTW_SIDE_MAT = new THREE.MeshLambertMaterial({ map: rtwSideTex }); RTW_SIDE_MAT.userData.shared = true;
const RTW_BACK_MAT = new THREE.MeshLambertMaterial({ map: rtwBackTex }); RTW_BACK_MAT.userData.shared = true;
const RTW_WHITE = new THREE.MeshLambertMaterial({ color: 0xf4f6f8 }); RTW_WHITE.userData.shared = true;
const RTW_RED = new THREE.MeshLambertMaterial({ color: 0xe62420 }); RTW_RED.userData.shared = true;
const RTW_YEL = new THREE.MeshLambertMaterial({ color: 0xffe135 }); RTW_YEL.userData.shared = true;
function makeAmbulance() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const bx = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; o.geometry.userData.own = true; body.add(o); return o; };
  bx(2.1, 0.38, 5.7, BIKE_BLACK, 0, 0.55, 0); // Fahrgestell
  bx(2.05, 1.35, 1.65, RTW_WHITE, 0, 1.35, 1.85); // Fahrerkabine
  bx(2.02, 0.42, 0.9, RTW_RED, 0, 1.05, 2.38); // Motorhaube rot
  bx(1.92, 0.58, 0.08, glassMat, 0, 1.62, 2.66); // Frontscheibe
  bx(2.07, 0.52, 0.95, glassMat, 0, 1.62, 1.9); // Seitenscheiben
  bx(2.2, 2.05, 3.85, RTW_WHITE, 0, 1.72, -0.88); // Kofferaufbau
  bx(2.22, 0.52, 3.87, RTW_RED, 0, 1.18, -0.88); // Leuchtrote Bauchbinde
  bx(2.23, 0.12, 5.5, RTW_YEL, 0, 1.48, -0.05); // Gelber Reflexstreifen
  bx(2.16, 0.22, 3.82, RTW_RED, 0, 2.68, -0.88); // Dachkante rot
  for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 0.95), RTW_SIDE_MAT); p.geometry.userData.own = true; p.position.set(sx * 1.115, 1.95, -0.88); p.rotation.y = sx * Math.PI / 2; body.add(p); }
  { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.95), RTW_BACK_MAT); p.geometry.userData.own = true; p.position.set(0, 1.95, -2.82); p.rotation.y = Math.PI; body.add(p); }
  const barMat = POLICE_BAR_M.clone(); barMat.userData.own = true;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.14, 0.28), barMat); bar.geometry.userData.own = true; bar.position.set(0, 2.82, 0.75); body.add(bar);
  const bar2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.22), barMat); bar2.geometry.userData.own = true; bar2.position.set(0, 2.82, -2.65); body.add(bar2);
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff6dd, emissive: 0x000000 }); headMat.userData.own = true;
  bx(0.34, 0.18, 0.05, headMat, -0.72, 0.95, 2.84); bx(0.34, 0.18, 0.05, headMat, 0.72, 0.95, 2.84);
  const tlMat = new THREE.MeshBasicMaterial({ color: 0x8a1010 }); tlMat.userData.own = true;
  bx(0.28, 0.18, 0.05, tlMat, -0.85, 0.95, -2.82); bx(0.28, 0.18, 0.05, tlMat, 0.85, 0.95, -2.82);
  const blMat = [new THREE.MeshBasicMaterial({ color: 0x553300 }), new THREE.MeshBasicMaterial({ color: 0x553300 })]; blMat[0].userData.own = blMat[1].userData.own = true;
  for (const [i, x] of [[0, -1.02], [1, 1.02]]) for (const z of [2.78, -2.78]) bx(0.12, 0.1, 0.08, blMat[i], x, 0.95, z);
  const wheels = []; const wg = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14); wg.rotateZ(Math.PI / 2); wg.userData.own = true;
  for (const z of [1.85, -1.75]) for (const x of [-0.96, 0.96]) { const piv = new THREE.Group(); piv.position.set(x, 0.42, z); piv.userData.wheel = true; const w = new THREE.Mesh(wg, BIKE_TIRE); piv.add(w); body.add(piv); wheels.push(piv); }
  const cg = new THREE.PlaneGeometry(4.2, 9); cg.userData.own = true;
  const cone = new THREE.Mesh(cg, CONE_MAT); cone.rotation.x = -Math.PI / 2; cone.position.set(0, 0.08, 7.4); cone.visible = false; g.add(cone);
  g.userData = { speed: 0, heading: 0, hp: 260, police: false, ambulance: true, brigade: true, driver: null, mode: 'parked', bar, wheels, tlMat, cone, type: 'ambulance', blMat, blink: 0, blinkT: 0, heads: [headMat], bodyMats: [], dims: { w: 2.2, h: 2.75, l: 5.8 }, maxS: 26, accel: 11 };
  return g;
}
// Fahrradständer aus der Karte: dort stehen Räder (selten ein Motorrad) zum Mitnehmen bereit, solange man in der Nähe ist
let rackT = 0;
function updateBikeRacks(dt) { if (POCKET || (rackT -= dt) > 0) return; rackT = 2; voiSpawn(); let n = 0; const px = player.pos.x, pz = player.pos.z; let have = 0; for (const c of cars) if (c.userData.rack && (c.position.x - px) ** 2 + (c.position.z - pz) ** 2 < 200 * 200) have++; if (have >= 8) return;
  for (const f of WORLD.furniture) { if (f.k !== 'bicycle_parking') continue; if (!f.off) { const [qx, qz] = pushOffRoads(f.x, f.z, 0.7); if (Number.isNaN(qx) || Math.hypot(qx - f.x, qz - f.z) > 12) f.skip = true; else { f.x = qx; f.z = qz; } f.off = true; } if (f.skip) continue; const d2 = (f.x - px) ** 2 + (f.z - pz) ** 2; if (d2 > 160 * 160 || d2 < 25 * 25) continue; if (f._v && cars.includes(f._v)) continue; if (f._t && performance.now() - f._t < 60000) continue; f._t = performance.now(); if (Math.random() < 0.5) continue; /* nur jeder zweite Ständer */ if (++n > 2 || have + n > 8) break;
    if (solidAt(f.x, f.z) >= 0) { f._t = performance.now(); continue; } const ne = nearestRoadDir(f.x, f.z, 20); const c = Math.random() < 0.15 ? makeMoto() : makeBike(); c.position.set(f.x, surfAt(f.x, f.z, TH(f.x, f.z) + 2), f.z); const h = (ne ? ne.ang : 0) + Math.PI / 2; c.userData.heading = h; c.rotation.y = h; c.userData.mode = 'parked'; c.userData.rack = true;
    scene.add(c); cars.push(c); shootables.push(c); f._v = c; f._t = performance.now(); } }
function voiSpawn() { const px = player.pos.x, pz = player.pos.z; let have = 0; for (const c of cars) if (c.userData.voi && c.userData.mode === 'parked' && (c.position.x - px) ** 2 + (c.position.z - pz) ** 2 < 180 * 180) have++; if (have >= 6) return;
  const rs = roadsNear(px, pz, 1, true); if (!rs.length) return; const p = randomRoadPoint(pick(rs)); const d = Math.hypot(p.x - px, p.z - pz); if (d < 30 || d > 160 || p.road.mw) return; const sd = Math.random() < 0.5 ? 1 : -1; const x = p.x + Math.cos(p.heading) * (p.road.w / 2 + 1.4) * sd, z = p.z - Math.sin(p.heading) * (p.road.w / 2 + 1.4) * sd; if (solidAt(x, z) >= 0 || onOtherRoad(x, z, null, 0.6)) return; /* Roller nicht auf die Nachbarstraße */
  const c = makeVoi(); c.position.set(x, surfAt(x, z, TH(x, z) + 2), z); c.userData.heading = p.heading; c.rotation.y = p.heading; c.userData.mode = 'parked'; scene.add(c); cars.push(c); shootables.push(c); }
function makeVoi() { // Voi-E-Scooter (Fotos): lachsfarbenes Trittbrett und Lenkstange auf dem Rad-Fahrwerk
  const c = makeBike(0xf26d5b); const fm = c.userData.bodyMats[0]; c.traverse(o => { if (o.isMesh && (o.material === fm || (o.geometry.parameters && (o.geometry.parameters.width === 0.12 || o.geometry.parameters.width === 0.3)))) o.visible = false; });
  const body = c.children[0], vm = new THREE.MeshLambertMaterial({ color: 0xf26d5b }); const deck = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.06, 1.0), vm); deck.position.set(0, 0.16, 0); body.add(deck); const st = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6), vm); st.position.set(0, 0.62, 0.42); st.rotation.x = -0.15; body.add(st);
  c.userData.voi = true; c.userData.type = 'voi'; return c; }
function addHelmet(h, col) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), new THREE.MeshLambertMaterial({ color: col ?? pick([0x111111, 0xeeeeee, 0xc0392b, 0x2d6fd8]) })); m.scale.set(1, 1.05, 1.1);
  /* Am Kopfknochen statt fest auf 1,68 m: Fahrer beugt sich auf dem Motorrad vor (poseBikeRider), der Helm blieb hinter dem Kopf (André 12.11.2026).
     Knochen-Y zeigt nach oben aus dem Hals (aimB), Maßstab des Knochens herausrechnen */
  const hb = h.userData.bones && h.userData.bones.Head;
  if (hb) { h.updateMatrixWorld(true); const bs = new THREE.Vector3(), hs = new THREE.Vector3(); hb.getWorldScale(bs); h.getWorldScale(hs); const k = (hs.y || 1) / (bs.y || 1); m.scale.multiplyScalar(k); m.position.set(0, 0.1 * k, 0.01 * k); hb.add(m); }
  else { m.position.set(0, 1.68, 0.01); h.add(m); }
  h.userData.helmet = m; return m; }
// Radler auf einem KI-Rad: eine Figur als Kind des Rads (nicht in peds), beim Klauen steigt sie ab und flieht
function addRider(c) { const h = makeHuman(Math.random() < 0.5), m = !!c.userData.moto; h.position.set(0, m ? -0.02 : 0.05, m ? -0.22 : -0.24); c.add(h); c.userData.rider = h; poseBikeRider(h, m, Math.random() * 6); return h; }
function dropRider(c, flee = true) { const u = c.userData; if (!u.rider) return null; c.remove(u.rider); u.rider = null; const d = spawnPedAt(c.position.x + Math.cos(u.heading) * 1.1, c.position.z - Math.sin(u.heading) * 1.1); if (d) { d.userData.state = flee ? 'flee' : 'stunned'; d.userData.fleeT = 8; if (!flee) WPN.stun(d, 'hit', 2.5); } return d; }
// Umgekipptes Rad/Motorrad (nicht versunken) bleibt nutzbar: E stellt es wieder auf (André 13.11.2026, #101)
const remountable = u => u.mode === 'wreck' && u.bike && !u.sunk;
function tipBike(c, src) { const u = c.userData; if (c === player.car) { player.hp -= 15; camShake(0.3); showMsg('GESTÜRZT', 900); exitCar(); } const d = dropRider(c, false); u.hp = 0; u.speed = 0; u.mode = 'wreck'; u.wreckT = 0; c.rotation.z = Math.PI / 2 * 0.92; c.position.y += 0.1; sfx('crash', 0.35); return d; }
function spawnCar(police = false, near = null, minD = 60, maxD = 220, bike = false) {
  const pool = near ? roadsNear(near.x, near.z, 1, true) : roadsDrivable; if (!pool.length) return null; let p; for (let k = 0; k < 40; k++) { p = randomRoadPoint(pick(pool)); const d = near ? Math.hypot(p.x - near.x, p.z - near.z) : 0; if (!near || (d < maxD && d > minD)) break; }
  let wantBus = !police && !bike && !near && CAR_TPL.bus && BUSLINES.length && Math.random() < 0.06, line = null, li = 0;
  if (wantBus) { const cx = player.pos.x, cz = player.pos.z; for (let k = 0; k < 12 && !line; k++) { const L = pick(BUSLINES); for (let i = 0; i < L.p.length - 1; i += 3) { const d = Math.hypot(L.p[i][0] - cx, L.p[i][1] - cz); if (d > minD && d < maxD) { line = L; li = i; break; } } } if (line) p = { x: line.p[li][0], z: line.p[li][1], heading: Math.atan2(line.p[li + 1][0] - line.p[li][0], line.p[li + 1][1] - line.p[li][1]), road: { p: line.p, w: 8, o: 1, s: line.s }, seg: li, dir: 1 }; else wantBus = false; }
  const moto = bike && Math.random() < 0.35, amb = !police && !bike && Math.random() < 0.035; if (bike && !moto && (p.road.mw || p.road.ry)) return null; // keine Fahrräder auf Autobahn und Hochstraße (Motorräder schon)
  const minGap = bike ? 9 : 64; for (const o of cars) if ((o.position.x - p.x) ** 2 + (o.position.z - p.z) ** 2 < minGap) return null; // nicht in ein anderes Fahrzeug setzen
  const c = moto ? makeMoto() : bike ? makeBike() : amb ? makeAmbulance() : makeCar(police, wantBus ? 'bus' : null); c.position.set(p.x, roadY(p.road, p.x, p.z), p.z);
  const u = c.userData; u.heading = p.heading; u.road = p.road; u.seg = p.seg; u.dir = p.road.o ? p.road.o : p.dir; if (u.dir < 0) u.heading += Math.PI;
  if (line) { u.line = line.ref; let m = BUS_DISP.get(line.ref); if (!m) { m = new THREE.MeshBasicMaterial({ map: canvasTex(256, 40, (cx2, w, h) => { cx2.fillStyle = '#111'; cx2.fillRect(0, 0, w, h); cx2.fillStyle = '#ffa020'; cx2.font = 'bold 30px monospace'; cx2.fillText(`${line.ref} ${line.n}`.slice(0, 15), 6, 31); }, 1, 1) }); BUS_DISP.set(line.ref, m); } c.traverse(o => { if (o.material && o.material.name === 'Display') o.material = m; }); } // Liniennummer vorn
  u.mode = police ? 'police' : (Math.random() < (bike ? 0.65 : 0.55) || p.road.mw || p.road.ry ? 'ai' : 'parked'); u.maxv = moto ? Math.min((p.road.v || 50) / 3.6, 22) * rnd(0.9, 1.15) : bike ? rnd(3.8, 6.2) : Math.min((p.road.v || 50) / 3.6, 15) * rnd(0.8, 1.05);
  if (u.mode === 'parked') { const side = p.road.o && Math.random() < 0.5 ? 1 : -1; /* #102: (cos h, -sin h) zeigt links; Rechtsverkehr parkt rechts in Fahrtrichtung, nur in Einbahnstraßen auch links */ const w = p.road.w / 2 + (bike ? 0.7 : 1.1); c.position.x += Math.cos(u.heading) * side * w; c.position.z -= Math.sin(u.heading) * side * w; if (bike) u.heading += side * Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1) * 0.5; }
  const fr = bike ? 0.8 : 1.8, cx = c.position.x, cz = c.position.z;
  if (solidAt(cx, cz) >= 0 || solidAt(cx + fr, cz) >= 0 || solidAt(cx - fr, cz) >= 0 || solidAt(cx, cz + fr) >= 0 || solidAt(cx, cz - fr) >= 0) return null;
  if (u.mode === 'ai') { u.isCar = true; snapToLane(u, c.position, u.road.w * laneK(u)); u.vh = u.heading; if (solidAt(c.position.x, c.position.z) >= 0) return null; if (bike) { const rd = addRider(c); if (moto) addHelmet(rd); } }
  c.rotation.y = u.heading; scene.add(c); cars.push(c); shootables.push(c); return c;
}
function spawnPed(near = null) {
  const pool = roadsNear(player.pos.x, player.pos.z, 1, false); if (!pool.length) return null; const r = pick(pool); const p = randomRoadPoint(r); const side = Math.random() < 0.5 ? 1 : -1; const w = r.w / 2 + 1.5;
  const x = p.x + Math.cos(p.heading) * side * w, z = p.z - Math.sin(p.heading) * side * w;
  if (solidAt(x, z) >= 0) return null; if (near && Math.hypot(x - near.x, z - near.z) > 200) return null;
  const h = makeHuman(Math.random() < 0.5); h.position.set(x, TH(x, z), z);
  Object.assign(h.userData, { road: r, seg: p.seg, dir: p.dir, side, speed: rnd(1.0, 1.7), hp: 100, state: 'walk', t: Math.random() * 10 });
  scene.add(h); peds.push(h); shootables.push(h); return h;
}
function roadY(r, x, z) { if (!r || !r.ry) return TH(x, z); let bd = 1e18, by = TH(x, z);
  for (let i = 0; i < r.p.length - 1; i++) { const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1; const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1); const ex = x - ax - dx * t, ez = z - az - dz * t; const d = ex * ex + ez * ez;
    if (d < bd) { bd = d; const ya = r.el[i] ? r.ry[i] : TH(ax, az), yb = r.el[i + 1] ? r.ry[i + 1] : TH(bx, bz); by = (r.el[i] || r.el[i + 1]) ? Math.max(TH(x, z), ya + (yb - ya) * t) : TH(x, z); } }
  return by; }
const laneK = u => u.bike && !u.moto ? 0.4 : 0.25; // Spurversatz: Autos fahren rechts der Mitte, Räder am rechten Rand
function snapToLane(u, pos, offset) {
  const r = u.road; let i = u.seg, j = i + u.dir; if (j < 0 || j >= r.p.length) { if (r.o && r.p.length > 1) { i = u.seg = u.dir < 0 ? i + 1 : i - 1; j = i + u.dir; /* Einbahnstraße: Abschnitt verschieben, nie wenden */ } else { u.dir *= -1; j = i + u.dir; } if (i < 0 || i >= r.p.length || j < 0 || j >= r.p.length) return; }
  const [ax, az] = r.p[i], [bx, bz] = r.p[j]; const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 0.001; const nx = -dz / l, nz = dx / l; const tx = ax + nx * offset, tz = az + nz * offset;
  const pr = clamp(((pos.x - tx) * dx + (pos.z - tz) * dz) / (l * l), 0, 1); pos.x = tx + dx * pr; pos.z = tz + dz * pr; pos.y = roadY(u.road, pos.x, pos.z); u.heading = Math.atan2(dx, dz);
}
function advanceAlongRoad(u, pos, dist, offset) {
  if (u.respawn) return;
  // bewegt Objekt entlang Polylinie u.road, Segment u.seg, Richtung u.dir; offset = seitlicher Versatz
  for (let guard = 0; guard < 5 && dist > 0; guard++) {
    const r = u.road; const i = u.seg, j = i + u.dir; if (j < 0 || j >= r.p.length) { if (u.isCar && !u.police && (r.o || Math.hypot(pos.x - player.pos.x, pos.z - player.pos.z) > 70)) { u.respawn = true; return; } u.dir *= -1; u.seg = clamp(u.seg, 0, r.p.length - 1); u.vh = undefined; continue; }
    const [ax, az] = r.p[i], [bx, bz] = r.p[j]; const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 0.001;
    const nx = -dz / l, nz = dx / l; const tx = ax + nx * offset, tz = az + nz * offset;
    const rawProj = ((pos.x - tx) * dx + (pos.z - tz) * dz) / (l * l);
    if (rawProj < 0) { // hinter dem Segmentanfang (nach dem Abbiegen): weich auf den Startpunkt zufahren statt springen
      const gx = tx - pos.x, gz = tz - pos.z, gl = Math.hypot(gx, gz); if (gl > 0.05) { const mv = Math.min(dist, gl); pos.x += gx / gl * mv; pos.z += gz / gl * mv; pos.y = roadY(u.road, pos.x, pos.z); u.heading = Math.atan2(gx, gz); dist -= mv; continue; } }
    const proj = clamp(rawProj, 0, 1); const remain = (1 - proj) * l;
    const step = Math.min(dist, remain + 0.01);
    pos.x = tx + dx * proj + dx / l * step; pos.z = tz + dz * proj + dz / l * step; pos.y = roadY(u.road, pos.x, pos.z);
    u.heading = Math.atan2(dx, dz); dist -= step;
    if (step >= remain) { u.seg = j;
      // Kreuzung: Abbiegen, Einbahnstraßen beachten; am Ende einer Einbahnstraße muss abgebogen werden
      const atEnd = (j === 0 || j === r.p.length - 1);
      if (!u.line && (Math.random() < 0.3 || (atEnd && (r.o || u.isCar)) || u.goal)) { const opts = [];
        for (const [q, k] of nodesNear(bx, bz)) { if (q === r) continue; if (u.mode === 'tram' ? q.w !== undefined : (q.w === undefined || (u.isCar ? q.w < 5 || q.ped : (q.mw || q.ry)) /* Autos nicht in Fußgängerzonen (Zeil, Nordwestzentrum) */)) continue;
          for (const d of [1, -1]) { if (k + d < 0 || k + d >= q.p.length) continue; if (u.isCar && !u.police && q.o && q.o !== d) continue; opts.push([q, k, d]); } }
        if (opts.length) { let choice = pick(opts); if (u.goal) { let best = 1e9; for (const o of opts) { const [q, k, d] = o; const q2 = q.p[k + d]; const dd = Math.hypot(q2[0] - u.goal.x, q2[1] - u.goal.z); if (dd < best) { best = dd; choice = o; } } } const [nr, k, d] = choice; const [nx2, nz2] = nr.p[k + d]; const nh = Math.atan2(nx2 - bx, nz2 - bz); const turn = ((nh - u.heading + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; if (Math.abs(turn) > 0.5) { u.blink = turn > 0 ? 0 : 1; u.blinkT = 2.5; } u.road = nr; u.seg = k; u.dir = d; return; } }
    }
  }
}

// ---------- Sound (Web Audio, alles synthetisch) ----------
const SND = { ctx: null, master: null, vol: 0.8, engine: null, siren: null, ambient: null };
function audioInit() {
  if (SND.ctx) { if (SND.ctx.state === 'suspended') SND.ctx.resume(); return; }
  const C = new (window.AudioContext || window.webkitAudioContext)(); SND.ctx = C; SND.master = C.createGain(); SND.master.gain.value = SND.vol; SND.master.connect(C.destination);
  // Motor: zwei Sägezähne + Tiefpass
  const eg = C.createGain(); eg.gain.value = 0; const ef = C.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 400; const o1 = C.createOscillator(), o2 = C.createOscillator(); o1.type = 'sawtooth'; o2.type = 'square'; o1.frequency.value = 60; o2.frequency.value = 31; o1.connect(ef); o2.connect(ef); ef.connect(eg); eg.connect(SND.master); o1.start(); o2.start(); SND.engine = { g: eg, o1, o2, f: ef };
  // Sirene
  const sg = C.createGain(); sg.gain.value = 0; const so = C.createOscillator(); so.type = 'triangle'; so.frequency.value = 700; so.connect(sg); sg.connect(SND.master); so.start(); SND.siren = { g: sg, o: so };
  // Stadtrauschen
  const buf = C.createBuffer(1, C.sampleRate * 2, C.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1); const src = C.createBufferSource(); src.buffer = buf; src.loop = true; const af = C.createBiquadFilter(); af.type = 'lowpass'; af.frequency.value = 300; const ag = C.createGain(); ag.gain.value = 0.06; src.connect(af); af.connect(ag); ag.connect(SND.master); src.start(); SND.ambient = ag; SND.noise = buf;
  const rs = C.createBufferSource(); rs.buffer = buf; rs.loop = true; const rf = C.createBiquadFilter(); rf.type = 'highpass'; rf.frequency.value = 1200; const rg = C.createGain(); rg.gain.value = 0; rs.connect(rf); rf.connect(rg); rg.connect(SND.master); rs.start(); SND.rain = rg;
}
function sfx(kind, vol = 1) {
  if (!SND.ctx) return; const C = SND.ctx, t = C.currentTime;
  const noise = (dur, f0, f1, g0, type = 'lowpass') => { const src = C.createBufferSource(); src.buffer = SND.noise; const f = C.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur); const g = C.createGain(); g.gain.setValueAtTime(g0 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); src.connect(f); f.connect(g); g.connect(SND.master); src.start(t); src.stop(t + dur + 0.05); };
  const tone = (dur, f0, f1, g0, type = 'sine') => { const o = C.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur); const g = C.createGain(); g.gain.setValueAtTime(g0 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(SND.master); o.start(t); o.stop(t + dur + 0.05); };
  if (kind === 'shot') { noise(0.18, 4000, 400, 0.9, 'bandpass'); tone(0.12, 180, 50, 0.6); }
  else if (kind === 'reload') { tone(0.05, 900, 600, 0.2, 'square'); setTimeout(() => tone(0.05, 700, 1200, 0.2, 'square'), 120); }
  else if (kind === 'step') { noise(0.07, 800, 200, 0.25); }
  else if (kind === 'crash') { noise(0.5, 1500, 100, 1.0); tone(0.3, 90, 30, 0.6); }
  else if (kind === 'bump') { noise(0.15, 600, 100, 0.4); }
  else if (kind === 'screech') { noise(0.2, 2400, 1500, 0.35, 'bandpass'); }
  else if (kind === 'thunder') { noise(2.5, 400, 30, 1.2); tone(1.5, 55, 25, 0.8); }
  else if (kind === 'explosion') { noise(1.6, 900, 40, 1.4); tone(0.9, 70, 20, 1.0); }
  else if (kind === 'bell') { tone(0.12, 2600, 2500, 0.25, 'sine'); tone(0.3, 3900, 3800, 0.1, 'sine'); setTimeout(() => { tone(0.12, 2600, 2500, 0.2, 'sine'); }, 110); }
  else if (kind === 'horn') { tone(0.5, 420, 420, 0.35, 'square'); tone(0.5, 530, 530, 0.25, 'square'); }
  else if (kind === 'hit') { noise(0.12, 2000, 300, 0.5); tone(0.15, 300, 100, 0.3); }
  else if (kind === 'door') { noise(0.12, 500, 150, 0.35); tone(0.08, 160, 80, 0.3); }
  else if (kind === 'pickup') { tone(0.1, 880, 1320, 0.3); setTimeout(() => tone(0.15, 1320, 1760, 0.3), 90); }
  else if (kind === 'click') { tone(0.04, 1200, 800, 0.15, 'square'); }
  else if (kind === 'smg') { noise(0.1, 5000, 600, 0.7, 'bandpass'); tone(0.07, 220, 70, 0.4); }
  else if (kind === 'shotgun') { noise(0.35, 2500, 120, 1.3); tone(0.25, 120, 35, 0.9); }
  else if (kind === 'rifle') { noise(0.16, 6000, 500, 1.0, 'bandpass'); tone(0.1, 260, 60, 0.5); }
  else if (kind === 'swing') { noise(0.18, 600, 2400, 0.35, 'bandpass'); }
  else if (kind === 'punch') { noise(0.1, 900, 120, 0.7); tone(0.12, 140, 60, 0.6); }
  else if (kind === 'bang') { noise(0.06, 9000, 3000, 1.6, 'highpass'); noise(0.9, 1200, 60, 1.1); tone(0.3, 90, 30, 0.8); }
  else if (kind === 'hiss') { noise(0.7, 3000, 2500, 0.3, 'highpass'); }
  else if (kind === 'taser') { tone(0.5, 2400, 2200, 0.2, 'square'); noise(0.5, 4000, 3000, 0.25, 'bandpass'); }
  else if (kind === 'splat') { noise(0.14, 700, 150, 0.6); }
  else if (kind === 'throw') { noise(0.15, 400, 1500, 0.25, 'bandpass'); }
  else if (kind === 'cough') { noise(0.12, 900, 300, 0.4, 'bandpass'); setTimeout(() => noise(0.1, 800, 300, 0.3, 'bandpass'), 180); }
  else if (kind === 'notify') { tone(0.07, 1320, 1320, 0.12); setTimeout(() => tone(0.09, 1760, 1760, 0.1), 80); }
  else if (kind === 'crackle') { for (let i = 0; i < 6; i++) setTimeout(() => noise(0.03, 7000, 4000, 0.5, 'highpass'), i * 60 + Math.random() * 40); }
  else if (kind === 'bell') { tone(0.35, 1480, 1470, 0.25, 'triangle'); setTimeout(() => tone(0.35, 1480, 1470, 0.22, 'triangle'), 220); }
  else if (kind === 'glass') { noise(0.25, 7000, 2500, 0.8, 'highpass'); tone(0.12, 2600, 1800, 0.15, 'triangle'); }
  else if (kind === 'schoolbell') { for (let i = 0; i < 14; i++) setTimeout(() => tone(0.09, 2100, 2050, 0.22, 'square'), i * 95); }
  else if (kind === 'whoosh') { noise(0.8, 800, 4000, 0.35, 'bandpass'); }
}
function audioUpdate(dt) {
  if (!SND.ctx) return; const t = SND.ctx.currentTime;
  if (SND.engine) { const car = player.car && (!player.car.userData.bike || player.car.userData.moto) ? player.car : null; /* Fahrrad hat keinen Motor, Motorrad schon */ const sp = car ? Math.abs(car.userData.speed) : 0; const target = car ? 0.18 + Math.min(sp / 30, 1) * 0.25 : 0; SND.engine.g.gain.setTargetAtTime(target, t, 0.1); const f = (car && car.userData.moto ? 80 + sp * 9 : 50 + sp * 6) + (car && keys.KeyW ? 15 : 0); SND.engine.o1.frequency.setTargetAtTime(f, t, 0.08); SND.engine.o2.frequency.setTargetAtTime(f / 2, t, 0.08); SND.engine.f.frequency.setTargetAtTime(300 + sp * 40, t, 0.1); }
  if (SND.siren) { let best = 1e9; for (const c of cars) if (c.userData.mode === 'police' || (c.userData.siren && c !== player.car)) best = Math.min(best, c.position.distanceTo(player.pos)); if (player.car && player.car.userData.siren) best = 0; const g = best < 220 ? 0.25 * (1 - best / 220) : 0; SND.siren.g.gain.setTargetAtTime(g, t, 0.1); SND.siren.o.frequency.setTargetAtTime(Math.floor(worldT * 1.7) % 2 ? 650 : 870, t, 0.03); }
  if (SND.ambient) SND.ambient.gain.setTargetAtTime(player.car ? 0.02 : 0.06, t, 0.5);
}

// ---------- Straßenbahn ----------
function makeTram() {
  const g = new THREE.Group(); const paint = new THREE.MeshLambertMaterial({ color: 0x3aa8b8 }); /* Foto 12.11.2026: türkis wie die Frankfurter Straßenbahn */ const glass = new THREE.MeshLambertMaterial({ color: 0x182030, emissive: 0x2a3a50 });
  for (const z of [-7.2, 7.2]) { const b = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 13.8), paint); b.position.set(0, 1.7, z); b.castShadow = true; g.add(b); const w = new THREE.Mesh(new THREE.BoxGeometry(2.44, 0.9, 13.0), glass); w.position.set(0, 2.1, z); g.add(w); const roof = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3, 13.6), new THREE.MeshLambertMaterial({ color: 0xcfd3d8 })); roof.position.set(0, 2.95, z); g.add(roof); }
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.25, 28.2), new THREE.MeshLambertMaterial({ color: 0xe8e8e8 })); stripe.position.set(0, 1.0, 0); g.add(stripe);
  const hl = new THREE.MeshBasicMaterial({ color: 0xfff6d0 }); for (const x of [-0.7, 0.7]) for (const z of [14.1, -14.1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.06), hl); l.position.set(x, 1.3, z); g.add(l); }
  { const d = new THREE.MeshBasicMaterial({ map: canvasTex(256, 40, (c, w, h) => { c.fillStyle = '#0a1408'; c.fillRect(0, 0, w, h); c.fillStyle = '#7cff5a'; c.font = 'bold 28px monospace'; c.fillText(pick(['12 Schwanheim', '11 Fechenheim', '14 Bornheim Ernst-May', '18 Preungesheim']).slice(0, 15), 6, 30); }, 1, 1) }); for (const z of [14.12, -14.12]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.3), d); p.position.set(0, 2.55, z); if (z < 0) p.rotation.y = Math.PI; g.add(p); } } // Linienanzeige grün
  g.userData = { speed: 0, heading: 0, hp: 1000, mode: 'tram', road: null, seg: 0, dir: 1, isCar: false, stopT: 0 }; return g;
}
function spawnTrams(n) {
  const lines = CITY.rails.filter(r => r.p.length >= 4 && r.k !== 'platform').sort((a, b) => b.p.length - a.p.length).slice(0, 12); if (!lines.length) return;
  for (let i = 0; i < n; i++) { const r = lines[i % lines.length]; const t = makeTram(); const seg = Math.floor(Math.random() * (r.p.length - 1)); const [ax, az] = r.p[seg]; t.position.set(ax, TH(ax, az), az); Object.assign(t.userData, { road: r, seg, dir: Math.random() < 0.5 ? 1 : -1, speed: 6 }); scene.add(t); trams.push(t); shootables.push(t); }
}
function updateTrams(dt) {
  for (const t of trams) { const u = t.userData; const d = t.position.distanceTo(player.pos); t.visible = d < 300; if (d > 500) continue;
    const tfx = Math.sin(u.heading), tfz = Math.cos(u.heading); const ahead = (x, z, w) => { const rx = x - t.position.x, rz = z - t.position.z; const a = rx * tfx + rz * tfz; return a > 13.5 && a < 26 + u.speed * 1.8 && Math.abs(rx * tfz - rz * tfx) < w; };
    let blocked = !player.car && ahead(player.pos.x, player.pos.z, 2.2); if (!blocked) for (const p of peds) { if (p.userData.state !== 'dead' && ahead(p.position.x, p.position.z, 2)) { blocked = true; break; } } if (!blocked) for (const c of cars) { if (c.userData.mode !== 'wreck' && ahead(c.position.x, c.position.z, 2.3)) { blocked = true; break; } }
    if (blocked) { u.speed = Math.max(0, u.speed - 6 * dt); u.bellT = (u.bellT || 0) - dt; if (u.bellT <= 0 && d < 90) { u.bellT = rnd(2.5, 4); sfx('bell', clamp(1 - d / 90, 0.1, 0.7)); } }
    u.stopT -= dt; if (u.stopT > 0 || blocked) { u.speed = Math.max(0, u.speed - 3 * dt); } else u.speed = Math.min(u.speed + 1.5 * dt, 9);
    if (Math.random() < dt * 0.03) u.stopT = 6; // Haltestelle
    if (u.speed > 0.05) advanceAlongRoad(u, t.position, u.speed * dt, 0); t.rotation.y = u.heading;
    const fx = Math.sin(u.heading), fz = Math.cos(u.heading); const hf = TH(t.position.x + fx * 8, t.position.z + fz * 8), hb = TH(t.position.x - fx * 8, t.position.z - fz * 8); t.position.y = (hf + hb) / 2; t.rotation.x = Math.atan2(hb - hf, 16);
    // Überfahren
    u.hitCD = Math.max(0, (u.hitCD || 0) - dt);
    if (u.speed > 2) { const rel = new THREE.Vector3().subVectors(player.pos, t.position); const along = rel.x * fx + rel.z * fz, side = Math.abs(rel.x * fz - rel.z * fx); if (!player.car && Math.abs(along) < 14.5 && side < 1.6 && (u.hitCD || 0) <= 0) { u.hitCD = 1.2; player.hp -= 40; moveWithCollision(player.pos, -fz * 3 * Math.sign(rel.x * fz - rel.z * fx || 1), fx * 3 * Math.sign(rel.x * fz - rel.z * fx || 1), 0.35); sfx('hit'); }
      for (const p of peds) { if (p.userData.state === 'dead' || !p.visible) continue; const r2 = _tv.subVectors(p.position, t.position); const a2 = r2.x * fx + r2.z * fz, s2 = Math.abs(r2.x * fz - r2.z * fx); if (Math.abs(a2) < 14.5 && s2 < 1.5) { const sg = Math.sign(r2.x * fz - r2.z * fx) || 1; moveWithCollision(p.position, fz * 1.4 * sg, -fx * 1.4 * sg, 0.3); if (p.userData.state !== 'stunned' && !p.userData.cop) WPN.stun(p, 'hit', 1.5); } }
      for (const c of cars) { if (c.userData.mode === 'wreck') continue; const r2 = _tv.subVectors(c.position, t.position); const a2 = r2.x * fx + r2.z * fz, s2 = Math.abs(r2.x * fz - r2.z * fx); if (Math.abs(a2) < 15 && s2 < 2.2) { c.userData.hp -= 60 * dt; const sg = Math.sign(r2.x * fz - r2.z * fx || 1); moveWithCollision(c.position, fz * 6 * dt * sg, -fx * 6 * dt * sg, 0.9); if (c.userData.hp <= 0) explode(c); } }
    }
  }
}

// ---------- Pickups ----------
// Pickups als Frankfurter Symbole (12.11.2026): Leben = Bembel, Geld = Münze mit Adler, Munition = Kiste mit Adler.
// Einmal gebaut und geteilt (vorher je Pickup neue Geometrie, beim Entfernen nie freigegeben).
let PK = null;
function pkAssets() {
  if (PK) return PK;
  const lathe = (prof, seg) => new THREE.LatheGeometry(prof.map(([r, h]) => new THREE.Vector2(r, h)), seg);
  const adler = (c, w, h, bg, fg) => { if (bg) { c.fillStyle = bg; c.fillRect(0, 0, w, h); } c.fillStyle = fg; c.save(); c.translate(w / 2, h / 2); c.scale(w / 128, h / 128);
    c.beginPath(); c.moveTo(0, -38); c.lineTo(9, -30); c.lineTo(6, -18); c.lineTo(40, -30); c.lineTo(30, -6); c.lineTo(42, -2); c.lineTo(22, 6); c.lineTo(12, 4); c.lineTo(14, 22); c.lineTo(26, 40); c.lineTo(8, 32); c.lineTo(0, 44); c.lineTo(-8, 32); c.lineTo(-26, 40); c.lineTo(-14, 22); c.lineTo(-12, 4); c.lineTo(-22, 6); c.lineTo(-42, -2); c.lineTo(-30, -6); c.lineTo(-40, -30); c.lineTo(-6, -18); c.lineTo(-9, -30); c.closePath(); c.fill(); c.restore(); };
  // Bembel: grauer Steinzeug-Krug mit blauem Muster
  const bembelTex = canvasTex(256, 128, (c, w, h) => { c.fillStyle = '#9aa0a6'; c.fillRect(0, 0, w, h); c.strokeStyle = '#1f4fa0'; c.lineWidth = 6;
    for (const y of [22, 106]) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    c.lineWidth = 4; for (let x = 16; x < w; x += 42) { c.beginPath(); c.arc(x, 64, 14, 0, Math.PI * 2); c.stroke(); for (let a = 0; a < 6; a++) { c.beginPath(); c.moveTo(x, 64); c.lineTo(x + Math.cos(a) * 24, 64 + Math.sin(a) * 24); c.stroke(); } } });
  const bembel = lathe([[0, 0], [0.16, 0], [0.2, 0.06], [0.25, 0.24], [0.25, 0.36], [0.19, 0.5], [0.13, 0.6], [0.14, 0.66], [0.11, 0.68], [0, 0.68]], 16); bembel.translate(0, -0.34, 0);
  const henkel = new THREE.TorusGeometry(0.12, 0.03, 6, 12, Math.PI); henkel.rotateZ(-Math.PI / 2); henkel.translate(0.24, 0.02, 0);
  const tuelle = new THREE.ConeGeometry(0.05, 0.14, 6); tuelle.rotateZ(Math.PI / 2.6); tuelle.translate(-0.15, 0.27, 0);
  const coinTex = canvasTex(128, 128, (c, w, h) => adler(c, w, h, '#e0b43a', '#a5302a'));
  const coin = new THREE.CylinderGeometry(0.3, 0.3, 0.06, 24); coin.rotateX(Math.PI / 2);
  const kisteTex = canvasTex(128, 128, (c, w, h) => { c.fillStyle = '#5f6b3a'; c.fillRect(0, 0, w, h); c.strokeStyle = '#3d4626'; c.lineWidth = 6; c.strokeRect(4, 4, w - 8, h - 8); c.fillStyle = '#f2efe6'; c.fillRect(24, 24, 80, 80); adler(c, w, h, null, '#c0392b'); });
  const kiste = new THREE.BoxGeometry(0.5, 0.36, 0.36);
  PK = {
    bembel: [bembel, new THREE.MeshLambertMaterial({ map: bembelTex, emissive: 0x334455, emissiveIntensity: 0.4 })],
    teile: [[henkel, new THREE.MeshLambertMaterial({ color: 0x8e949a, emissive: 0x334455, emissiveIntensity: 0.3 })], [tuelle, new THREE.MeshLambertMaterial({ color: 0x8e949a, emissive: 0x334455, emissiveIntensity: 0.3 })]],
    coin: [coin, [new THREE.MeshLambertMaterial({ color: 0xc89a2a, emissive: 0x7a5a10, emissiveIntensity: 0.6 }), new THREE.MeshBasicMaterial({ map: coinTex }), new THREE.MeshBasicMaterial({ map: coinTex })]],
    kiste: [kiste, new THREE.MeshLambertMaterial({ map: kisteTex, emissive: 0x222211, emissiveIntensity: 0.5 })],
    ring: [new THREE.TorusGeometry(0.42, 0.03, 6, 24), { health: new THREE.MeshBasicMaterial({ color: 0x4a8fe0 }), money: new THREE.MeshBasicMaterial({ color: 0xf0c030 }), ammo: new THREE.MeshBasicMaterial({ color: 0x7fb24a }) }] };
  return PK;
}
function spawnPickup(kind, x, z) {
  if (kind.startsWith('w:')) { const g = new THREE.Group(); const w = WPN.buildModel(kind.slice(2)); w.scale.setScalar(2.4); w.rotation.x = -0.3; w.position.y = 0.05; g.add(w); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 6, 24), new THREE.MeshBasicMaterial({ color: 0xc86bff })); ring.rotation.x = Math.PI / 2; ring.position.y = -0.45; g.add(ring); g.position.set(x, TH(x, z) + 0.5, z); g.userData = { kind, t: Math.random() * 6 }; scene.add(g); pickups.push(g); return g; }
  const A = pkAssets(); const g = new THREE.Group();
  if (kind === 'health') { g.add(new THREE.Mesh(...A.bembel)); for (const t of A.teile) g.add(new THREE.Mesh(...t)); }
  else if (kind === 'money') g.add(new THREE.Mesh(...A.coin));
  else g.add(new THREE.Mesh(...A.kiste));
  { const r = new THREE.Mesh(A.ring[0], A.ring[1][kind] || A.ring[1].money); r.rotation.x = Math.PI / 2; r.position.y = -0.45; g.add(r); }
  g.position.set(x, TH(x, z) + 0.5, z); g.userData = { kind, t: Math.random() * 6 }; scene.add(g); pickups.push(g); return g;
}
function spawnPickups(n) { let tries = 0; while (pickups.length < n && tries++ < n * 20) { const r = pick(CITY.roads); const p = randomRoadPoint(r); const side = Math.random() < 0.5 ? 1 : -1; const x = p.x + Math.cos(p.heading) * side * (r.w / 2 + 1.5), z = p.z - Math.sin(p.heading) * side * (r.w / 2 + 1.5); if (solidAt(x, z) >= 0) continue; if (Math.hypot(x - player.pos.x, z - player.pos.z) > 300) continue; spawnPickup(pick(['money', 'money', 'health']) /* Waffen und Munition nur noch im Laden (André 13.11.2026) */, x, z); } }
function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) { const p = pickups[i]; p.userData.t += dt; p.rotation.y += dt * 1.5; p.position.y = TH(p.position.x, p.position.z) + 0.6 + Math.sin(p.userData.t * 2) * 0.12; const d = p.position.distanceTo(player.pos);
    p.visible = d < 150; if (d < 1.6 || (player.car && d < 2.6)) { const k = p.userData.kind; if (k.startsWith('w:')) { const id = k.slice(2); const fresh = WPN.give(id); showMsg((fresh ? 'NEU: ' : '+ ') + WPN.DEF[id].n.toUpperCase(), 1100); if (fresh && !WPN.DEF[WPN.cur].kind.match(/gun/)) WPN.select(id, true); } else if (k === 'money') { const v = 20 + Math.floor(Math.random() * 80); player.money += v; showMsg('+' + v + ' €', 600, 'ok'); } else if (k === 'ammo') { showMsg('MUNITION: ' + WPN.addAmmo(), 700); } else { player.hp = Math.min(100, player.hp + 50); showMsg('+50 LEBEN', 600, 'ok'); } sfx('pickup'); scene.remove(p); pickups.splice(i, 1); }
    else if (d > 400) { scene.remove(p); pickups.splice(i, 1); } }
  if (pickups.length < 40 && Math.random() < dt * 0.5) spawnPickups(40);
}

// ---------- Spieler ----------
const player = { pos: new THREE.Vector3(0, 0, 0), yaw: 0, vy: 0, hp: 100, bustedT: 0, car: null, female: false, mesh: null, wanted: 0, wantedTimer: 0, dead: false, score: 0, money: 150 };
const camYaw = { v: 0 }, camPitch = { v: 0.2 };
const keys = {};
const opts = { sens: 1, vol: 0.8, shadows: true, timeSpeed: 0.25, headlights: true, weather: 'auto', traffic: 1, quality: QUALITY, scale: 1, view: 700, bloom: 1, ao: true, dynlights: true, fps: false, fov: 65, camdist: 1, invy: false, shake: true, gyro: false, vibrate: true, peds: 1, police: true, god: false, ammo: false, dynres: true, lod: true, potato: false, fall: true, grip: 1, minimap: true, hud: true, tts: true, demos: true, firebrigade: true };
const VERY_WEAK = /hd graphics (2000|2500|3000|4000|400|405|500|505|510)\b|intel.*(atom|celeron|pentium)|mali-[t4]|powervr|adreno \(tm\) [1-5]\d\d|llvmpipe|swiftshader/i.test(GPU);
const OPTS_DEFAULT = Object.assign({}, opts); // Standardwerte vor dem Laden (Rücksetzen alter Sparmodus-Stände, #173)
const POTATO = { quality: 'niedrig', potato: true, shadows: false, ao: false, bloom: 0, view: 250, scale: 0.7, peds: 0.4, traffic: 0.5, dynres: true, lod: true };
const POTATO_KEYS = Object.keys(POTATO).filter(k => k !== 'quality');
// Gespeichert wird nie ein automatischer Sparmodus: ohne potatoManuell stehen für Sparmodus-Werte die Standardwerte in localStorage (#173)
function optsToSave() { const s = Object.assign({}, opts); if (!s.potatoManuell) for (const k of POTATO_KEYS) if (s[k] === POTATO[k]) s[k] = OPTS_DEFAULT[k]; return s; }
function loadOpts() { try { Object.assign(opts, JSON.parse(localStorage.getItem('notgta.opts') || '{}')); } catch (e) {} if (!opts.zeitV2) { if (opts.timeSpeed === 1) opts.timeSpeed = 0.25; opts.zeitV2 = true; } /* alter Standard 1 Std./Min. war zu schnell (12.11.2026) */ if (WEAK_VIEW) { opts.view = Math.min(opts.view || 700, 425); opts.weakTuned = true; } /* #173: Sparmodus wie die Stufe. Nur ein vom Nutzer gesetzter Sparmodus (potatoManuell) bleibt; alte Stände mit potato ohne Markierung (automatisch gesetzt oder vor #173) gehen auf die Standardwerte zurück: Andrés Chrome lief mit Sichtweite 250, Skala 0,7 und ohne Schatten, obwohl die Stufe schon frei war (13.11.2026) */ if (opts.potato && !opts.potatoManuell) { for (const k of POTATO_KEYS) opts[k] = OPTS_DEFAULT[k]; } delete opts.potatoTuned; if (VERY_WEAK && !opts.potatoManuell) { const q = opts.quality; Object.assign(opts, POTATO); if (opts.qualityManuell) opts.quality = q; } /* sehr schwache GPU: Sparmodus nur zur Laufzeit, jeden Start neu */ if (!opts.qualityManuell) opts.quality = VERY_WEAK ? 'niedrig' : QUALITY; applyOpts(); } // einmalig: kürzere Sichtweite auf schwacher GPU, danach frei änderbar
function applyOpts() { camera.far = Math.max(1600, (opts.view || 700) + 200); /* 1600: Skyline und Messeturm aus wahrzeichen.js bis 1,6 km (13.11.2026); Nebel endet früher, Kacheln sind dort ohnehin nicht gebaut */ camera.updateProjectionMatrix(); const mm = document.getElementById('minimap'); if (mm) mm.style.display = opts.minimap === false ? 'none' : ''; const hd = document.getElementById('hud'); if (hd) hd.style.visibility = opts.hud === false ? 'hidden' : 'visible'; const fe = document.getElementById('fps'); if (fe) fe.style.display = opts.fps ? 'block' : 'none'; renderer.shadowMap.enabled = !!opts.shadows && opts.quality !== 'niedrig'; applyQuality(); scene.traverse(o => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) m.needsUpdate = true; } }); world.speed = opts.timeSpeed / 60; SND.vol = opts.vol; if (SND.master) SND.master.gain.value = opts.vol; try { localStorage.setItem('notgta.opts', JSON.stringify(optsToSave())); } catch (e) {} }
function saveGame(quiet) {
  const c = player.car; const data = { v: 1, pos: POCKET ? [POCKET.anchor[0], TH(POCKET.anchor[0], POCKET.anchor[1]), POCKET.anchor[1]] : [player.pos.x, player.pos.y, player.pos.z] /* im Innenraum den Ausgang speichern, nicht den Taschenraum bei x=60000 */, yaw: camYaw.v, hp: Math.max(1, player.hp), inv: WPN.save(), story: STORY ? STORY.sid : null /* nur die Kennung: der Story-Zustand enthält Figuren und Fahrzeuge, die sich nicht speichern lassen ("Speichern fehlgeschlagen"); die Story speichert sich selbst */, money: player.money, score: player.score, wanted: player.wanted, female: player.female, hour: world.hour, car: c ? { x: c.position.x, z: c.position.z, h: c.userData.heading, col: c.userData.col ?? 0xffffff, type: c.userData.type } : null, when: Date.now() };
  try { localStorage.setItem('notgta.save', JSON.stringify(data)); showMsg(quiet ? 'AUTOMATISCH GESPEICHERT' : 'GESPEICHERT', 900, 'ok'); if (!quiet) sfx('click'); } catch (e) { console.warn('Speichern', e); showMsg('SPEICHERN FEHLGESCHLAGEN', 1500); }
}
function hasSave() { try { return !!localStorage.getItem('notgta.save'); } catch (e) { return false; } }
function loadGame() {
  let d; try { d = JSON.parse(localStorage.getItem('notgta.save')); } catch (e) {} if (!d || !Array.isArray(d.pos) || !d.pos.every(Number.isFinite)) { showMsg('SPIELSTAND UNBRAUCHBAR', 1500); return false; }
  if (INTERIORS && INTERIORS.inside) INTERIORS.leave(); // sonst bleibt der Innenraum-Zustand (kein Verkehr, Karte versteckt) aktiv
  if (player.car) exitCar(); player.pos.set(d.pos[0], d.pos[1], d.pos[2]); camYaw.v = Number.isFinite(d.yaw) ? d.yaw : 0; player.hp = clamp(+d.hp || 100, 1, 100); /* Werte aus importierten Dateien absichern */ WPN.load(d.inv); player.money = d.money || 0; player.score = d.score || 0; player.wanted = d.wanted || 0; world.hour = d.hour ?? 19.5; player.dead = false; msgEl.style.display = 'none';
  if (player.mesh) player.mesh.position.copy(player.pos);
  if (d.car) { const c = makeCar(/police/.test(d.car.type || ''), typeof d.car.type === 'string' ? d.car.type : null); c.position.set(d.car.x, TH(d.car.x, d.car.z), d.car.z); c.userData.heading = d.car.h; c.rotation.y = d.car.h; setCarColor(c, d.car.col); scene.add(c); cars.push(c); shootables.push(c); player.car = c; c.userData.mode = 'player'; c.userData.driver = 'player'; if (player.mesh) player.mesh.visible = !!c.userData.bike; player.pos.copy(c.position); }
  for (const c of cars) if (c.userData.police && c !== player.car) c.userData.mode = 'parked';
  showMsg('GELADEN', 900, 'ok'); return true;
}
let menuOpen = false;
const MENU_HOOKS = [];
// Übersicht im Menü: das Wichtigste auf einen Blick
MENU_HOOKS.push(() => { const el = document.getElementById('ovstat'); if (!el) return; const st = (document.getElementById('street') || {}).textContent || '–'; const obj = ((document.getElementById('obj') || {}).textContent || '').replace(/\s+/g, ' ').trim(); const w = player.wanted > 0 ? '⭐'.repeat(Math.ceil(player.wanted)) : 'keine';
  const card = (ic, v, l) => `<div><small>${ic} ${l}</small><b>${v}</b></div>`;
  el.innerHTML = card('💶', (player.money || 0).toLocaleString('de-DE') + ' €', 'Geld') + card('❤', Math.max(0, Math.round(player.hp)) + ' %', 'Leben') + card('🚨', w, 'Fahndung') + card('📍', st, 'Ort') + (obj ? `<div style="grid-column:1/-1"><small>🎯 Ziel</small><b style="font-size:14px;font-weight:600">${obj.slice(0, 160)}</b></div>` : ''); });
function openMenu() { menuOpen = true; clearTimeout(lockT); for (const f of MENU_HOOKS) f(); for (const id of ['m_save', 'm_load', 'm_restart', 'm_export', 'm_creative']) { const b = $(id); if (b) b.style.display = started ? '' : 'none'; } if ($('m_creative')) $('m_creative').textContent = creative.on ? '🛠 Spielmodus (C)' : '🛠 Kreativmodus (C)'; $('m_resume').textContent = started ? 'Weiter' : 'Zurück'; document.exitPointerLock(); $('menu').style.display = 'flex'; $('o_sens').value = opts.sens; $('o_vol').value = opts.vol; $('o_shadows').checked = opts.shadows; $('o_time').value = opts.timeSpeed; $('o_hour').value = Math.round(world.hour); for (const [id, k] of Object.entries(OPT_BIND)) { const el = $(id); if (!el) continue; if (el.type === 'checkbox') el.checked = !!opts[k]; else el.value = opts[k]; } updateOptLabels(); $('o_quality').value = opts.quality || 'mittel'; $('o_weather').value = opts.weather; $('o_traffic').value = opts.traffic; $('m_load').disabled = !hasSave(); }
let lockT = 0; /* #98: Handle des verzögerten lockMouse aus closeMenu; openMenu bricht ihn ab */
function lockMouse() { if (menuOpen || window.__noAutoMenu) return; /* Ticketkauf/Laden offen: Klick gehört dem Menü, nicht dem Spiel (André 13.11.2026) */ try { const p = renderer.domElement.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
function closeMenu() { menuOpen = false; $('menu').style.display = 'none'; clearTimeout(lockT); if (started) lockT = setTimeout(lockMouse, 1300); }
let mapOpen = false, mapPanX = 0, mapPanZ = 0;
function toggleMap() { mapOpen = !mapOpen; if (mapOpen) { mapPanX = 0; mapPanZ = 0; } $('bigmap').style.display = mapOpen ? 'block' : 'none'; if (mapOpen) drawBigMap(); }
function drawBigMap() {
  const cv = $('bigmap'); const W = cv.width = Math.min(innerWidth - 40, 900), H = cv.height = Math.min(innerHeight - 40, 700); const c2 = cv.getContext('2d');
  const span = mapZoom; const sc = W / span; const cx0 = player.pos.x + mapPanX - span / 2, cz0 = player.pos.z + mapPanZ - span * H / W / 2; // Meter -> Pixel
  c2.fillStyle = '#111'; c2.fillRect(0, 0, W, H); const P = (x, z) => [(x - cx0) * sc, (z - cz0) * sc]; drawOverview(c2, P, W, H, sc);
  for (const [, t] of TILES) { if (!t.data) continue; const [x, y] = P(t.tx * TS, t.tz * TS); if (x > W || y > H || x + TS * sc < 0 || y + TS * sc < 0) continue; c2.drawImage(t.mm || (t.mm = tileMap(t)), x, y, TS * sc, TS * sc); }
  c2.font = 'bold 11px system-ui'; c2.fillStyle = '#ddd'; const seen = new Set(); for (const r of WORLD.roads) { if (!r || !r.n || seen.has(r.n) || r.w < 8) continue; const m = r.p[Math.floor(r.p.length / 2)]; const [x, y] = P(m[0], m[1]); if (x < 0 || y < 0 || x > W || y > H) continue; seen.add(r.n); c2.fillText(r.n, x + 3, y - 3); }
  { const M = INTERIORS && INTERIORS.metro; if (M) { c2.lineWidth = 3; for (const l of M.lines) drawMetroLine(c2, P, l);
      c2.font = 'bold 11px system-ui'; for (const s of M.stations) { const [x, y] = P(s.p[0], s.p[1]); if (x < -10 || y < -10 || x > W + 10 || y > H + 10) continue; c2.fillStyle = '#fff'; c2.strokeStyle = '#1e5fb4'; c2.lineWidth = 2.5; c2.beginPath(); c2.arc(x, y, 5, 0, 7); c2.fill(); c2.stroke(); if (mapZoom < 9000) c2.fillText(s.name, x + 7, y + 4); } }
    if (mapZoom < 4500) { PM_STOPS = PM_STOPS || pmStops(); c2.font = '10px system-ui'; for (const s of PM_STOPS) { const [x, y] = P(s.x, s.z); if (x < 0 || y < 0 || x > W || y > H) continue; c2.fillStyle = '#2e9c3a'; c2.fillRect(x - 3, y - 3, 6, 6); if (mapZoom < 2500 && s.n) { c2.fillStyle = '#bfe8c4'; c2.fillText(s.n, x + 5, y + 3); } } } }
  for (const c of cars) if (c.userData.police) { const [x, y] = P(c.position.x, c.position.z); c2.fillStyle = '#4f8bff'; c2.beginPath(); c2.arc(x, y, 4, 0, 7); c2.fill(); }
  for (const p of pickups) { const [x, y] = P(p.position.x, p.position.z); c2.fillStyle = p.userData.kind.startsWith('w:') ? '#c86bff' : p.userData.kind === 'money' ? '#f0c030' : p.userData.kind === 'ammo' ? '#40c060' : '#e04040'; c2.fillRect(x - 2, y - 2, 4, 4); }
  for (const f of MAP_HOOKS) f(c2, P);
  const [px, py] = P(player.pos.x, player.pos.z); c2.save(); c2.translate(px, py); c2.rotate(-camYaw.v + Math.PI); c2.fillStyle = '#ffd84a'; c2.beginPath(); c2.moveTo(0, -9); c2.lineTo(6, 6); c2.lineTo(-6, 6); c2.fill(); c2.restore();
  c2.fillStyle = '#fff'; c2.font = '13px system-ui'; c2.fillText('FRANKFURT · ' + (mapZoom / 1000).toFixed(1) + ' km · Ziehen: Verschieben · Zoom: Mausrad / 2 Finger · ' + Math.floor(world.hour) + ':' + String(Math.floor(world.hour % 1 * 60)).padStart(2, '0') + ' Uhr · M / ✕ schließen', 16, 24);
  // Kompass & Schließen-Knopf oben rechts
  { const x = W - 82, y = 40; c2.fillStyle = '#0b0d12dd'; c2.beginPath(); c2.arc(x, y, 20, 0, 7); c2.fill(); c2.strokeStyle = '#ffd84a'; c2.lineWidth = 1.5; c2.stroke(); c2.fillStyle = '#ffd84a'; c2.beginPath(); c2.moveTo(x, y - 15); c2.lineTo(x + 5, y - 3); c2.lineTo(x - 5, y - 3); c2.fill(); c2.font = 'bold 12px system-ui'; c2.textAlign = 'center'; c2.fillText('N', x, y + 13);
    const bx = W - 34, by = 40; c2.fillStyle = '#0b0d12dd'; c2.beginPath(); c2.arc(bx, by, 18, 0, 7); c2.fill(); c2.strokeStyle = '#ffffff88'; c2.stroke(); c2.fillStyle = '#fff'; c2.font = 'bold 16px system-ui'; c2.fillText('✕', bx, by + 5); c2.textAlign = 'left'; }
}
// Interaktive große Karte: Ziehen zum Verschieben, Doppelklick/Kompass zentriert, ✕ schließt, Pinch-Zoom auf Touch
{ const cv = document.getElementById('bigmap'); let drag = false, lx = 0, ly = 0, pinchD = 0;
  const hitCorner = (clientX, clientY) => { const r = cv.getBoundingClientRect(); const x = (clientX - r.left) * (cv.width / r.width), y = (clientY - r.top) * (cv.height / r.height); if (Math.hypot(x - (cv.width - 34), y - 40) < 24) { toggleMap(); return true; } if (Math.hypot(x - (cv.width - 82), y - 40) < 24) { mapPanX = 0; mapPanZ = 0; drawBigMap(); return true; } return false; };
  cv.addEventListener('mousedown', e => { if (!mapOpen) return; e.stopPropagation(); if (hitCorner(e.clientX, e.clientY)) return; drag = true; lx = e.clientX; ly = e.clientY; });
  addEventListener('mousemove', e => { if (!drag || !mapOpen) return; const sc = mapZoom / (cv.clientWidth || 600); mapPanX -= (e.clientX - lx) * sc; mapPanZ -= (e.clientY - ly) * sc; lx = e.clientX; ly = e.clientY; drawBigMap(); });
  addEventListener('mouseup', () => { drag = false; });
  cv.addEventListener('dblclick', () => { mapPanX = 0; mapPanZ = 0; drawBigMap(); });
  cv.addEventListener('touchstart', e => { if (!mapOpen) return; e.stopPropagation(); if (e.touches.length === 1) { const t = e.touches[0]; if (hitCorner(t.clientX, t.clientY)) { e.preventDefault(); return; } drag = true; lx = t.clientX; ly = t.clientY; } else if (e.touches.length === 2) { drag = false; pinchD = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); } }, { passive: false });
  cv.addEventListener('touchmove', e => { if (!mapOpen) return; e.preventDefault(); e.stopPropagation(); if (e.touches.length === 1 && drag) { const t = e.touches[0]; const sc = mapZoom / (cv.clientWidth || 600); mapPanX -= (t.clientX - lx) * sc; mapPanZ -= (t.clientY - ly) * sc; lx = t.clientX; ly = t.clientY; drawBigMap(); } else if (e.touches.length === 2 && pinchD > 10) { const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); if (d > 10) { mapZoom = clamp(mapZoom * (pinchD / d), 600, 16000); pinchD = d; drawBigMap(); } } }, { passive: false });
  cv.addEventListener('touchend', () => { drag = false; pinchD = 0; });
}
addEventListener('keydown', e => { if (e.code === 'Escape') { if (started && !menuOpen) openMenu(); return; } if (menuOpen) return; keys[e.code] = true; if (e.code === 'KeyM') toggleMap(); if (e.code === 'KeyN' && started) { opts.mapNorth = !opts.mapNorth; applyOpts(); showMsg(opts.mapNorth ? 'MINIKARTE: NORDEN OBEN' : 'MINIKARTE: BLICKRICHTUNG OBEN', 1200, 'info'); } if (e.code === 'F5' && e.ctrlKey) return; if (e.code === 'F6') { e.preventDefault(); saveGame(); } if (e.code === 'F9') { e.preventDefault(); if (confirm('Letzten Spielstand laden? Nicht gespeicherter Fortschritt geht verloren.')) loadGame(); } if (e.code === 'KeyE') toggleCar(); if (e.code === 'KeyR') WPN.reload(); if (e.code === 'KeyT' && WPN && WPN.cycleFuse) WPN.cycleFuse(); if (e.code === 'KeyG') DEMO.rally(); if (e.code === 'KeyV') DEMO.film(); if (e.code === 'KeyX') STORY.skipLine(); if (e.code === 'KeyQ' && !creative.on) WPN.quick(); if (e.code === 'Space') e.preventDefault(); if (e.code === 'KeyC') toggleCreative(); if (e.code === 'KeyH' && player.car) { const u = player.car.userData; if (u.police || u.cannon || u.brigade || u.ambulance) { u.siren = !u.siren; showMsg(u.siren ? 'SONDERSIGNAL AN' : 'SONDERSIGNAL AUS', 900); sfx('click', 0.5); } else sfx(u.bike && !u.moto ? 'bell' : 'horn'); } if (e.code === 'KeyL' && player.car) { const u = player.car.userData; const now = u.lightsForce ?? world.night; u.lightsForce = !now; showMsg(u.lightsForce ? 'LICHT AN' : 'LICHT AUS', 700); sfx('click', 0.4); } if (creative.on && (e.code === 'Comma' || e.code === 'Period')) creativeSelect(creative.slot + (e.code === 'Period' ? 1 : -1)); if (creative.on && e.code === 'Minus') creativeSelect(20); if (e.code.startsWith('Digit')) { const n = (+e.code.slice(5) + 9) % 10; if (creative.on) creativeSelect(n + (e.shiftKey ? 10 : 0)); else if (!player.car || !player.car.userData.cannon) WPN.slotKey(+e.code.slice(5)); } });
const CREATIVE_ITEMS = [
  { n: 'Schläger', w: 'bat' }, { n: 'Pistole', w: 'pistol' }, { n: 'MP', w: 'smg' }, { n: 'Schrotflinte', w: 'shotgun' }, { n: 'Gewehr', w: 'rifle' }, { n: 'Pfefferspray', w: 'spray' }, { n: 'Taser', w: 'taser' }, { n: 'Farbbeutel', w: 'paint' }, { n: 'Böller', w: 'banger' }, { n: 'Rauchtopf', w: 'smoke' },
  { n: 'Bengalo', w: 'flare' }, { n: 'Granate', w: 'grenade' }, { n: 'Zeitbombe', w: 'tnt' }, { n: 'Brandsatz', w: 'molotov' }, { n: 'Raketenwerfer', w: 'rocket' }, { n: 'Feuerwerk', s: 'firework', ic: '🎆' }, { n: 'Demo', s: 'demo', ic: '✊' }, { n: 'Polizei', s: 'police', ic: '🚓' }, { n: 'Wasserwerfer', s: 'cannon', ic: '💦' }, { n: 'Feuerwehr', s: 'firetruck', ic: '🚒' }, { n: 'Rettung', s: 'ambulance', ic: '🚑' }, { n: 'Auto', s: 'car', ic: '🚗' }, { n: 'Mensch', s: 'ped', ic: '🚶' },
];
const creative = { on: false, slot: 1, placed: [], spawned: 0 }; const placedGroup = new THREE.Group(); scene.add(placedGroup);
function creativeSpawnerActive() { return creative.on && !!CREATIVE_ITEMS[creative.slot].s; }
function creativeSelect(i) { creative.slot = (i + CREATIVE_ITEMS.length) % CREATIVE_ITEMS.length; const it = CREATIVE_ITEMS[creative.slot]; if (it.w) { WPN.give(it.w, 0); WPN.select(it.w, true); } drawHotbar(); }
function toggleCreative() {
  if (!started) return; if (!creative.on && WPN.locked) { showMsg('IM STORY-KAPITEL GESPERRT', 1500); return; } creative.on = !creative.on; if (!creative.on && creative.inv0) { WPN.load(creative.inv0); creative.inv0 = null; } /* Kreativ-Waffen (auch Raketenwerfer) bleiben im Kreativmodus, André 13.11.2026 */ if (creative.on) { creative.inv0 = WPN.save(); if (player.car) exitCar(); player.wanted = 0; for (const c of cars) if (c.userData.police && c.userData.mode === 'police') c.userData.mode = 'parked'; creativeSelect(creative.slot); }
  document.getElementById('mode').textContent = creative.on ? 'KREATIV · C zurück · Auswahl: 1-0, Shift+1-0, ß, Mausrad oder , . · Leertaste hoch · Shift runter · Linksklick benutzen' : ''; document.getElementById('hotbar').style.display = creative.on ? 'flex' : 'none'; drawHotbar(); showMsg(creative.on ? 'KREATIVMODUS' : 'SPIELMODUS', 900);
}
{ const hb = document.getElementById('hotbar'); let tx0 = 0;
  hb.addEventListener('mousedown', e => { const sl = e.target.closest('.slot'); if (!sl) return; e.stopPropagation(); e.preventDefault(); creativeSelect(+sl.dataset.i); });
  hb.addEventListener('touchstart', e => { if (e.touches[0]) tx0 = e.touches[0].clientX; }, { passive: true });
  hb.addEventListener('touchend', e => { const t = e.changedTouches[0]; if (!t || Math.abs(t.clientX - tx0) > 12) return; const sl = e.target.closest && e.target.closest('.slot'); if (!sl) return; e.stopPropagation(); e.preventDefault(); creativeSelect(+sl.dataset.i); }, { passive: false });
}
function creativeKey(i) { return i < 10 ? String((i + 1) % 10) : i < 20 ? '⇧' + (i - 9) % 10 : i === 20 ? 'ß' : ''; }
function drawHotbar() { const hb = document.getElementById('hotbar'); hb.innerHTML = CREATIVE_ITEMS.map((it, i) => `<div class="slot${i === creative.slot ? ' sel' : ''}${it.s ? ' sp' : ''}" data-i="${i}" title="${it.n} · Taste ${creativeKey(i)}"><i>${it.w ? WPN.DEF[it.w].ic : it.ic}</i><b>${creativeKey(i)}</b><span>${it.n}</span></div>`).join(''); }
function creativeTarget() { const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(0, 0), camera); ray.far = 90; const hits = ray.intersectObjects(rayTargets, true); if (hits.length) return hits[0]; for (let d = 2; d < 90; d += 1) { const p = ray.ray.at(d, new THREE.Vector3()); if (p.y <= TH(p.x, p.z)) return { point: p }; } return null; }
function creativePlace() {
  const it = CREATIVE_ITEMS[creative.slot]; if (!it.s) return; const hit = creativeTarget(); if (!hit) { showMsg('ZIEL AUF DEN BODEN', 800); return; } const p = hit.point.clone(); if (solidAt(p.x, p.z) >= 0 && p.y < floorAt(p.x, p.z, p.y + 1) - 0.5) return;
  if (it.s === 'car') { const c = makeCar(false); c.position.set(p.x, TH(p.x, p.z), p.z); c.userData.heading = camYaw.v; c.rotation.y = camYaw.v; c.userData.mode = 'parked'; scene.add(c); cars.push(c); shootables.push(c); }
  else if (it.s === 'ped') spawnPedAt(p.x, p.z);
  else if (it.s === 'firework') WPN.firework(p);
  else if (it.s === 'demo') { const d = DEMO.spontaneous([p.x, p.z], { noPolice: true }); if (d) { d.joinT = 0; for (let i = 0; i < 10; i++) { const a = Math.random() * 6.28, r = 2 + Math.random() * 5; const h = DEMO.makeMember(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r); h.userData.demo = d; d.members.push(h); } d.age = 20; } }
  else if (it.s === 'police') DEMO.spawnSquad(p);
  else if (it.s === 'cannon') DEMO.spawnCannon(p.x, p.z, camYaw.v + Math.PI, 'parked');
  else if (it.s === 'firetruck') DEMO.spawnCannon(p.x, p.z, camYaw.v + Math.PI, 'parked', 'fire');
  else if (it.s === 'ambulance') { const c = makeAmbulance(); c.position.set(p.x, TH(p.x, p.z), p.z); c.userData.heading = camYaw.v + Math.PI; c.rotation.y = camYaw.v + Math.PI; c.userData.mode = 'parked'; scene.add(c); cars.push(c); shootables.push(c); }
  else if (it.s === 'bin') FIRE.spawnBin(p.x, p.z);
  creative.spawned++; creative.placed.push({ t: it.s }); sfx('click');
}
function savePlaced() { try { localStorage.setItem('notgta.build', JSON.stringify(creative.placed)); } catch (e) {} }
function loadPlaced() { /* 12.11.2026: rief addPlaced auf, das es nie gab; der Fehler wurde verschluckt, Wiederherstellen lief nie. Gespeichert wird nur der Typ ohne Position, darum bewusst leer bis zu einem echten Speicherformat */ }
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; WPN && WPN.press(false); }); // Alt+Tab bei gedrückter Taste: sonst läuft/fährt die Figur weiter
let locked = false;
document.addEventListener('pointerlockerror', () => {});
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === renderer.domElement; if (locked && menuOpen) { document.exitPointerLock(); locked = false; return; } /* #98: Sperre bei offenem Menü (alter Timer, Fremdaufruf) sofort lösen, sonst geht der Kartenklick als Schuss ins Spiel */ if (!locked && started && !menuOpen && !window.__noAutoMenu && !document.hidden && !mapOpen) setTimeout(() => { if (!locked && !menuOpen) openMenu(); }, 50); });
addEventListener('mousemove', e => { if (!locked) return; camYaw.lastMove = performance.now(); camYaw.v -= e.movementX * 0.0022 * opts.sens; camPitch.v = clamp(camPitch.v + e.movementY * 0.0018 * opts.sens * (opts.invy ? -1 : 1), player.car ? -0.5 : -1.25, 1.1); /* zu Fuß steil nach oben zielen (Hubschrauber, Dächer; André 12.11.2026) */ });
addEventListener('mouseup', e => { if (!WPN) return; /* Klick während des Ladens */ if (e.button === 2) player.aimHold = false; if (e.button === 0) { WPN.press(false); DEMO.carTrigger(false); } });
addEventListener('mousedown', e => { if (!WPN) return; if (!locked) { if (started && !menuOpen && !window.__noAutoMenu) lockMouse(); return; } if (e.button === 2 && !creativeSpawnerActive()) player.aimHold = true; if (e.button !== 0) return; if (creativeSpawnerActive()) creativePlace(); else if (player.car && player.car.userData.cannon) DEMO.carTrigger(true); else WPN.press(true); });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('wheel', e => { if (creative.on && started && !menuOpen) { creativeSelect(creative.slot + (e.deltaY > 0 ? 1 : -1)); return; } if (!locked) return; if (creative.on) creativeSelect(creative.slot + (e.deltaY > 0 ? 1 : -1)); else if (!player.car || !player.car.userData.cannon) WPN.cycle(e.deltaY > 0 ? 1 : -1); });

// ---------- HUD ----------
const $ = id => document.getElementById(id);
let lastHp = 100;
const cross = $('cross'), hint = $('hint'), streetEl = $('street'), ammoEl = $('ammo'), starsEl = $('stars'), healthBar = $('health').firstElementChild, msgEl = $('msg'), whoEl = $('who');
// kind: '' (Alarm, rot und groß), 'ok' (grün, klein), 'info' (gelb, klein)
function showMsg(t, ms = 2500, kind = '') { msgEl.textContent = t; msgEl.className = kind; msgEl.style.display = 'block'; clearTimeout(showMsg.t); showMsg.t = setTimeout(() => msgEl.style.display = 'none', ms); }
// DOM nur schreiben, wenn sich der Wert ändert (spart Layout-Arbeit pro Bild)
const setTxt = (el, v) => { if (el && el.__v !== v) { el.__v = v; el.textContent = v; } };
const setSty = (el, k, v) => { if (!el) return; const s = el.__s || (el.__s = {}); if (s[k] !== v) { s[k] = v; el.style[k] = v; } };
const moneyEl = $('money'), weaponEl = $('weapon');
// Minimap: ganze Stadt einmal vorzeichnen
const MM_SCALE = 0.5; // px pro Meter
const ext = { x0: -1000, z0: -1200 }; // Bezugspunkt der Kartenkoordinaten
const mm = $('minimap'), mmc = mm.getContext('2d'); const MM_HOOKS = [], MAP_HOOKS = []; // MAP_HOOKS: Zeichnen auf großer Karte und Pausenkarte (c2, P), z. B. Laufstrecken (wegweiser.js)
function drawMinimap() {
  const R = 110, zoom = 0.9; mmc.clearRect(0, 0, 220, 220); mmc.save(); mmc.beginPath(); mmc.arc(110, 110, R, 0, Math.PI * 2); mmc.clip();
  // Blickrichtung oben: vorwärts ist (sin yaw, cos yaw) in Weltkoordinaten (x rechts, z nach unten auf der Karte); rotate(yaw + π) legt das auf „oben“. Mit opts.mapNorth bleibt Norden (−z) oben.
  mmc.translate(110, 110); if (!opts.mapNorth) mmc.rotate(camYaw.v + Math.PI);
  mmc.scale(zoom, zoom); const px = (player.pos.x - ext.x0) * MM_SCALE, pz = (player.pos.z - ext.z0) * MM_SCALE;
  { const [ptx, ptz] = [Math.floor(player.pos.x / TS), Math.floor(player.pos.z / TS)]; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const t = TILES.get(tkey(ptx + a, ptz + b)); if (t && t.data) mmc.drawImage(t.mm || (t.mm = tileMap(t)), (t.tx * TS - ext.x0) * MM_SCALE - px, (t.tz * TS - ext.z0) * MM_SCALE - pz); } }
  for (const c of cars) { const u = c.userData; mmc.fillStyle = u.police ? '#4f8bff' : '#bbbbbb'; mmc.beginPath(); mmc.arc((c.position.x - ext.x0) * MM_SCALE - px, (c.position.z - ext.z0) * MM_SCALE - pz, u.police ? 3 : 1.5, 0, 7); mmc.fill(); }
  { const P = (x, z) => [(x - ext.x0) * MM_SCALE - px, (z - ext.z0) * MM_SCALE - pz]; for (const f of MM_HOOKS) f(mmc, P, (R - 8) / zoom); }
  mmc.restore();
  // Spielerpfeil: bei Norden-oben in Blickrichtung gedreht, sonst immer nach oben
  mmc.save(); mmc.translate(110, 110); if (opts.mapNorth) mmc.rotate(Math.PI - camYaw.v); mmc.fillStyle = '#ffd84a'; mmc.beginPath(); mmc.moveTo(0, -8); mmc.lineTo(6, 4); mmc.lineTo(-6, 4); mmc.fill(); mmc.restore();
  // Nordmarke am Rand: Norden ist −z; in der gedrehten Karte liegt er bei (−sin yaw, cos yaw)
  { const nx = opts.mapNorth ? 0 : -Math.sin(camYaw.v), nz = opts.mapNorth ? -1 : Math.cos(camYaw.v); const x = 110 + nx * (R - 13), y = 110 + nz * (R - 13); mmc.fillStyle = '#0b0d12dd'; mmc.beginPath(); mmc.arc(x, y, 9, 0, 7); mmc.fill(); mmc.strokeStyle = '#ffd84a'; mmc.lineWidth = 1.5; mmc.stroke(); mmc.fillStyle = '#ffd84a'; mmc.font = 'bold 11px system-ui'; mmc.textAlign = 'center'; mmc.textBaseline = 'middle'; mmc.fillText('N', x, y + 0.5); mmc.textAlign = 'left'; mmc.textBaseline = 'alphabetic'; }
}
let streetTimer = 0, worldT = 0, sigTick = -1;
function streetNameAt(x, z, maxD = 40) { let best = maxD * maxD, name = ''; const g = getRoadGrid(); const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const c = g.get(key(cx + a, cz + b)); if (!c) continue; for (const [r, i] of c) { if (!r.n) continue; const d = distSegSq(x, z, r.p[i][0], r.p[i][1], r.p[i + 1][0], r.p[i + 1][1]); if (d < best) { best = d; name = r.n; } } }
  return name; }
function nearestStreet() { if (POCKET) return POCKET.label || 'Frankfurt'; return streetNameAt(player.pos.x, player.pos.z) || 'Frankfurt'; }

// ---------- Schießen ----------
const tracerMat = new THREE.MeshBasicMaterial({ color: 0xfff0a0 });
function shoot() { WPN.press(true); WPN.press(false); }
function reload() { WPN.reload(); }
function damage(o, amt, dir, src = 'player') {
  const u = o.userData; if (u.hp <= 0) return;
  if (u.bike && u.rider) { const d = tipBike(o, src); if (d) damage(d, amt, dir, src); return; }
  u.hp -= amt;
  if (peds.includes(o)) { sfx('hit', 0.5); if (u.hp <= 0) { u.state = 'dead'; u.fallDir = dir.clone(); o.rotation.x = 0; if (src === 'player') { player.score += 10; raiseWanted(u.cop ? 1 : 0.5, u.cop ? 4 : 2); } if (u.cop && u.car) u.car.userData.officer = null; } else if (!u.cop && u.state !== 'stunned') { u.state = 'flee'; u.fleeT = 6; o.rotation.x = 0; } }
  else { burst(o.position.clone().setY(1), 0x333333, 6, 1.5); if (u.hp <= 0) explode(o, src); }
}
function explode(c, src = 'player') {
  const u = c.userData; if (u.bike) return tipBike(c, src); u.hp = 0; u.speed = 0; u.mode = 'wreck'; if (c.position.distanceTo(player.pos) < 40) camShake(0.6 * (1 - c.position.distanceTo(player.pos) / 40)); sfx('explosion', clamp(1 - c.position.distanceTo(player.pos) / 150, 0.1, 1));
  c.traverse(m => { if (m.isSprite) m.visible = false; else if (m.isMesh && m.material?.color && m !== u.cone) { m.material = m.material.clone(); m.material.color.setHex(0x1a1a1a); if (m.material.emissive) m.material.emissive.setHex(0); } }); if (u.cone) u.cone.visible = false; u.heads = [];
  burst(c.position.clone().setY(1), 0xff7a1a, 40, 6); burst(c.position.clone().setY(1.5), 0x222222, 20, 3);
  if (c === player.car) { player.hp -= 50; exitCar(); }
  if (player.pos.distanceTo(c.position) < 7 && !player.car) player.hp -= 40 * losFactor(c.position.x, c.position.y + 0.8, c.position.z, player.pos.x, player.pos.y + 1, player.pos.z);
  if (src === 'player') raiseWanted(1, 3);
  for (const f of X.listeners) f('carExploded', c.position, { car: c });
}
// ---------- Partikel-Pool: Rauch, Spray, Funken und Explosionen als ein instanziertes Quad = ein Draw-Call ----------
// Vorher: je Partikel ein Sprite bzw. Mesh mit eigenem Material (bis 520 Sprites + Würfel). Jetzt: feste Puffer, Farbe/Deckkraft/Größe je Instanz,
// vormultipliziertes Alpha (Alpha 0 = additiv für Flammen und Funken). Obergrenze bei schwacher GPU 150, sonst 600; voll → das am weitesten verbrauchte Partikel wird ersetzt.
const FX = (() => {
  const N = WEAK_GPU ? 150 : 600;
  const tex = canvasTex(64, 64, (ctx, w, h) => { const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.45, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }); tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.anisotropy = 1;
  const quad = new THREE.PlaneGeometry(1, 1); const geo = new THREE.InstancedBufferGeometry(); geo.index = quad.index; geo.setAttribute('position', quad.attributes.position); geo.setAttribute('uv', quad.attributes.uv); geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
  const aPos = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3), aCol = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4), aPar = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3); // iCol: rgb + additiv, iPar: Größe, Deckkraft, Drehung
  for (const a of [aPos, aCol, aPar]) a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('iPos', aPos); geo.setAttribute('iCol', aCol); geo.setAttribute('iPar', aPar); geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null } }]), fog: true, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
    vertexShader: `attribute vec3 iPos; attribute vec4 iCol; attribute vec3 iPar; varying vec2 vUv; varying vec4 vCol; varying float vA;
      #include <fog_pars_vertex>
      void main() { vUv = uv; vCol = iCol; vA = iPar.y; float c = cos(iPar.z), s = sin(iPar.z); vec2 q = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * iPar.x;
        vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0); mvPosition.xy += q; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D map; varying vec2 vUv; varying vec4 vCol; varying float vA;
      #include <fog_pars_fragment>
      void main() { float a = texture2D(map, vUv).a * vA; if (a < 0.004) discard; vec3 rgb = vCol.rgb;
      #ifdef USE_FOG
        float ff = smoothstep(fogNear, fogFar, vFogDepth); rgb = mix(rgb, fogColor * (1.0 - vCol.a), ff);
      #endif
        gl_FragColor = vec4(rgb, 1.0);
      #include <colorspace_fragment>
        gl_FragColor = vec4(gl_FragColor.rgb * a, a * (1.0 - vCol.a)); }` });
  mat.uniforms.map.value = tex;
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 10; mesh.visible = false; mesh.userData.fxPool = true; mesh.userData.noChunk = true; scene.add(mesh);
  const F = () => new Float32Array(N); const px = F(), py = F(), pz = F(), vx = F(), vy = F(), vz = F(), tt = F(), lf = F(), sz = F(), gr = F(), op = F(), rt = F(), cr = F(), cg = F(), cb = F(); const kind = new Uint8Array(N), addv = new Uint8Array(N); let n = 0; const C = new THREE.Color();
  const ALL = [px, py, pz, vx, vy, vz, tt, lf, sz, gr, op, rt, cr, cg, cb, kind, addv];
  // kind 0 = Puff (treibt, wächst, blendet ein und aus), 1 = Motorrauch (steigt, wächst, verblasst), 2 = Funke (fällt, prallt am Boden)
  function spawn(k, x, y, z, ux, uy, uz, size, life, grow, maxOp, color, additive) {
    let i; if (n < N) i = n++; else { let bi = 0, bk = -1; for (let j = 0; j < N; j++) { const f = tt[j] / lf[j]; if (f > bk) { bk = f; bi = j; } } i = bi; }
    C.setHex(color); if (!additive && k !== 2) C.multiplyScalar((0.22 + 0.78 * (world.day ?? 1)) * (0.75 + Math.random() * 0.35)); // Rauch ist nicht selbstleuchtend
    px[i] = x; py[i] = y; pz[i] = z; vx[i] = ux; vy[i] = uy; vz[i] = uz; tt[i] = 0; lf[i] = Math.max(0.05, life); sz[i] = size; gr[i] = grow; op[i] = maxOp; rt[i] = Math.random() * 6.28; cr[i] = C.r; cg[i] = C.g; cb[i] = C.b; kind[i] = k; addv[i] = additive ? 1 : 0; return i;
  }
  function update(dt) {
    const damp = Math.pow(0.55, dt);
    for (let i = 0; i < n; i++) {
      tt[i] += dt; if (tt[i] >= lf[i]) { n--; if (i !== n) for (const a of ALL) a[i] = a[n]; i--; continue; }
      const k = kind[i];
      if (k === 0) { vx[i] *= damp; vy[i] = vy[i] * damp + 0.25 * dt; vz[i] *= damp; const q = tt[i] / lf[i]; sz[i] += gr[i] * dt * (1 - q * 0.6); }
      else if (k === 2) vy[i] -= 9 * dt; else sz[i] += gr[i] * dt;
      px[i] += vx[i] * dt; py[i] += vy[i] * dt; pz[i] += vz[i] * dt;
      if (k !== 0) { const gy = TH(px[i], pz[i]); if (py[i] < gy) { py[i] = gy; vx[i] *= 0.3; vy[i] *= 0.3; vz[i] *= 0.3; } }
    }
    const P = aPos.array, Q = aCol.array, R = aPar.array;
    for (let i = 0; i < n; i++) { const q = tt[i] / lf[i], k = kind[i]; const a = k === 0 ? op[i] * Math.min(1, tt[i] * 4) * (1 - q) * (1 - q * 0.3) : k === 1 ? Math.min(0.5, (lf[i] - tt[i]) * 0.35) : (q < 0.75 ? 1 : (1 - q) * 4);
      P[i * 3] = px[i]; P[i * 3 + 1] = py[i]; P[i * 3 + 2] = pz[i]; Q[i * 4] = cr[i]; Q[i * 4 + 1] = cg[i]; Q[i * 4 + 2] = cb[i]; Q[i * 4 + 3] = addv[i]; R[i * 3] = sz[i]; R[i * 3 + 1] = a; R[i * 3 + 2] = rt[i]; }
    geo.instanceCount = n; mesh.visible = n > 0;
    if (n) { for (const [a, w] of [[aPos, 3], [aCol, 4], [aPar, 3]]) { a.clearUpdateRanges(); a.addUpdateRange(0, n * w); a.needsUpdate = true; } }
  }
  return { spawn, update, mesh, get count() { return n; }, max: N };
})();
function puff(pos, color, size, life, vel, grow, maxOp, additive) { return FX.spawn(0, pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, size, life, grow, maxOp, color, additive); }
function smoke(pos, color) { FX.spawn(1, pos.x, pos.y, pos.z, rnd(-0.4, 0.4), rnd(1.2, 2.2), rnd(-0.4, 0.4), 0.4, rnd(0.8, 1.6), 0.6, 0.5, color, false); }
function burst(pos, color, n, spread) { for (let i = 0; i < n; i++) FX.spawn(2, pos.x, pos.y, pos.z, rnd(-1, 1) * spread, rnd(0.5, 2) * spread, rnd(-1, 1) * spread, 0.3, rnd(0.4, 1.2), 0, 1, color, false); }
const shadowSnap = { x: 1e9, z: 1e9, n: 0 };
function vibrate(ms) { if (opts.vibrate !== false && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) {} }
let shakeT = 0; function camShake(t) { shakeT = Math.max(shakeT, t); if (t >= 0.3) vibrate(Math.min(80, Math.round(t * 95))); }
// Polizeihubschrauber (#63): ab 4 Sternen kreist er über dem Spieler, bei 5 Sternen und unerreichbarem Spieler (Dach) schießt der Scharfschütze
const PHELI = []; let PHELI_WAIT = 0;
function makePoliceHeli() { const g = HELI.makeHeli(); const seen = new Map(); g.traverse(o => { if (!o.isMesh || !o.material || !o.material.color) return; const hx = o.material.color.getHex(); if (hx !== 0xc8102e && hx !== 0xf4f4f2) return; if (!seen.has(o.material)) { const m = o.material.clone(); m.color.setHex(hx === 0xc8102e ? 0x1d4f9e : 0xc4c9d0); seen.set(o.material, m); } o.material = seen.get(o.material); });
  const rotor = g.children.find(c => c.isGroup && Math.abs(c.position.y - 3.2) < 0.01); const laser = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 1), new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.7 })); laser.visible = false; scene.add(laser);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffee })); lamp.position.set(0, 0.2, 2.2); g.add(lamp);
  g.userData = { pheli: true, hp: 450, ang: Math.random() * 6.28, aimT: 0, shotT: 2.5, rotor, laser, lamp, hitT: 0 }; return g; }
function dropPoliceHeli(h) { scene.remove(h); scene.remove(h.userData.laser); const i = shootables.indexOf(h); if (i >= 0) shootables.splice(i, 1); PHELI.splice(PHELI.indexOf(h), 1); }
function policeHeli(dt) {
  const off = opts.police === false || creative.on || POCKET || player.dead || player.wanted < 4 || !HELI.makeHeli;
  if (off) { while (PHELI.length) dropPoliceHeli(PHELI[0]); PHELI_WAIT = 0; return; }
  const want = 1; /* immer nur ein Hubschrauber (André 12.11.2026) */ PHELI_WAIT -= dt;
  if (PHELI.length < want && PHELI_WAIT <= 0) { const h = makePoliceHeli(); const a = Math.random() * 6.28; h.position.set(player.pos.x + Math.cos(a) * 260, player.pos.y + 70, player.pos.z + Math.sin(a) * 260); scene.add(h); shootables.push(h); PHELI.push(h); PHELI_WAIT = 4; showMsg('POLIZEIHUBSCHRAUBER IM ANFLUG', 1500); }
  const ground = TH(player.pos.x, player.pos.z); const high = player.pos.y > ground + 4; const night = world.hour < 6.5 || world.hour > 19;
  for (const h of [...PHELI]) { const u = h.userData;
    if (u.hp <= 0) { try { burst(h.position.clone(), 0xff8a30, 40); } catch (e) { /* nur Effekt */ } sfx('explosion', 1); dropPoliceHeli(h); PHELI_WAIT = 30; raiseWanted(1, 5); showMsg('HUBSCHRAUBER ABGESCHOSSEN', 1600); continue; }
    u.ang += dt * 0.35; const R = 45, tx = player.pos.x + Math.cos(u.ang + PHELI.indexOf(h) * 3.14) * R, tz = player.pos.z + Math.sin(u.ang + PHELI.indexOf(h) * 3.14) * R, ty = Math.max(player.pos.y, ground) + 32;
    const dx = tx - h.position.x, dy = ty - h.position.y, dz = tz - h.position.z, L = Math.hypot(dx, dy, dz) || 1, sp = Math.min(L, 30 * dt); h.position.x += dx / L * sp; h.position.y += dy / L * sp; h.position.z += dz / L * sp;
    h.rotation.y = Math.atan2(player.pos.x - h.position.x, player.pos.z - h.position.z); h.rotation.x = 0.12; if (u.rotor) u.rotor.rotation.y += dt * 40; u.lamp.material.color.setHex(night ? 0xffffee : 0x666666);
    if (u.hitT > 0) u.hitT -= dt;
    const snipe = player.wanted >= 5 && high; if (snipe) u.aimT += dt; else u.aimT = Math.max(0, u.aimT - dt);
    const lz = u.laser; lz.visible = snipe && u.aimT > 2; if (lz.visible) { const a = h.position.clone(); a.y -= 0.5; const b = player.pos.clone(); b.y += 1.3; const d = a.distanceTo(b); lz.scale.z = d; lz.position.copy(a).lerp(b, 0.5); lz.lookAt(b); }
    if (snipe && u.aimT > 8) { u.shotT -= dt; if (u.shotT <= 0) { u.shotT = 2.5; const from = h.position.clone(); from.y -= 0.5; const target = player.pos.clone(); target.y += 1.3; const hit = Math.random() < Math.min(0.9, 0.35 + (u.aimT - 8) * 0.05); if (!hit) { target.x += rnd(-2, 2); target.z += rnd(-2, 2); }
        const len = from.distanceTo(target); const tr = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, len), tracerMat); tr.position.copy(from).lerp(target, 0.5); tr.lookAt(target); scene.add(tr); setTimeout(() => { scene.remove(tr); tr.geometry.dispose(); }, 120); sfx('shot', 0.8);
        if (hit && !opts.god) { player.hp -= 45; camShake(0.4); showMsg('SCHARFSCHÜTZE!', 900); } } } } }
function archCheck() { const o = player.car || null; if (o && !o.userData.bike) return; const p = o ? o.position : player.pos; const c = deckGrid.get(Math.floor(p.x / DCELL) + ',' + Math.floor(p.z / DCELL)); if (!c) return;
  for (const s of c) { if (!s.arch || !s.apex) continue; const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz || 1; const tt = clamp(((p.x - s.ax) * dx + (p.z - s.az) * dz) / L2, 0, 1); if ((p.x - s.ax - dx * tt) ** 2 + (p.z - s.az - dz * tt) ** 2 > 1.2 || Math.abs(p.y - (s.ya + (s.yb - s.ya) * tt)) > 2) continue;
    const now = performance.now(); if (ARCH_LAST === s.arch && now - (ARCH_RIDES.get(s.arch) || 0) < 30000) return; ARCH_RIDES.set(s.arch, now); ARCH_LAST = s.arch; ARCH_COUNT++;
    if (ARCH_COUNT === 1) showMsg('ÜBER DEN BOGEN! (1/2 GEDULDET)', 1600); else if (ARCH_COUNT === 2) showMsg('NOCHMAL GUTGEGANGEN (2/2)', 1600); else { showMsg('POLIZEI: RUNTER VOM BRÜCKENBOGEN!', 2000); raiseWanted(1, 2); } return; } }
// Sterne wie in GTA (André 12.11.2026): jede Tat hat eine Obergrenze (Passant geschlagen/getötet höchstens 1–2 Sterne, Polizist 3–4,
// Hubschrauber 5); über der Grenze nur Fahndung verlängern. Höchstens ein Stern Zuwachs je 8 s, damit drei Schüsse nicht hochtreiben.
let WANT_GAIN = 0, WANT_GAIN_T = 0;
function raiseWanted(n, cap = 5) { if (opts.police === false) return; player.wantedTimer = 15; const now = performance.now() / 1000; if (now - WANT_GAIN_T > 8) { WANT_GAIN = 0; WANT_GAIN_T = now; }
  if (player.wanted >= cap) return; const add = Math.min(n, 1 - WANT_GAIN, cap - player.wanted); if (add <= 0) return; WANT_GAIN += add; player.wanted = clamp(player.wanted + add, 0, 5); }

// ---------- Auto fahren ----------
function toggleCar() {
  if (!started || player.dead) return;
  if (player.car) { if (player.car.userData.heli && !player.car.userData.landed) { showMsg('ERST LANDEN', 900); return; } exitCar(); return; }
  let best = null, bd = 4;
  for (const c of cars) { if (c.userData.mode === 'wreck' && !remountable(c.userData)) continue; const d = c.position.distanceTo(player.pos) - (c.userData.cannon ? 3 : c.userData.heli ? 4.5 : 0); if (d < bd) { bd = d; best = c; } }
  if (!best) { let sb = null, sd = 3.6; for (const sp of staticParked) { if (!sp.active) continue; const d = Math.hypot(sp.x - player.pos.x, sp.z - player.pos.z); if (d < sd) { sd = d; sb = sp; } } if (!sb) return; best = activateParked(sb); }
  const u = best.userData;
  if (remountable(u)) { best.rotation.z = 0; u.hp = u.moto ? 90 : 40; u.wreckT = 0; u.speed = 0; showMsg(u.moto ? 'MOTORRAD AUFGESTELLT' : 'RAD AUFGESTELLT', 900); }
  if (u.voi) { if (player.money < 1) { showMsg('VOI: ZU WENIG GELD', 1200); return; } player.money -= 1; u.voiT = 0; showMsg('VOI ENTSPERRT · 1 € + 2 € JE MINUTE', 1600); }
  if (u.mode === 'ai' || u.mode === 'police' || u.mode === 'medicAI') {
    if (u.bike) dropRider(best, true); else { const d = spawnPedAt(best.position.x + Math.cos(u.heading) * 2.2, best.position.z - Math.sin(u.heading) * 2.2); if (d) { d.userData.state = 'flee'; d.userData.fleeT = 8; } }
    raiseWanted(u.police ? 1 : u.ambulance ? 1 : u.bike && !u.moto ? 0.3 : 0.5, u.police ? 3 : u.ambulance ? 2 : 1); showMsg(u.police ? 'STREIFENWAGEN GEKLAUT' : u.ambulance ? 'RETTUNGSWAGEN GEKLAUT' : u.moto ? 'MOTORRAD GEKLAUT' : u.bike ? 'RAD GEKLAUT' : 'AUTO GEKLAUT', 1200);
  }
  if (u.ambulance && !u.healedPlayer && player.hp < 100) { player.hp = Math.min(100, player.hp + 35); u.healedPlayer = true; showMsg('+35 LEBEN (VERBANDKASTEN)', 1200, 'ok'); }
  sfx(u.bike && !u.moto ? 'bell' : 'door'); player.car = best; if (u.moto && !player.mesh.userData.helmet) addHelmet(player.mesh, 0x111111); if (player.mesh.userData.helmet) player.mesh.userData.helmet.visible = !!u.moto; u.mode = 'player'; u.driver = 'player'; player.mesh.visible = !!u.bike; player.pos.copy(best.position); vehName(best);
}
// Fahrzeugname beim Einsteigen unten rechts einblenden (wie in den Vorbildern)
const VEH_NAMES = { sedan: 'Limousine', small: 'Kleinwagen', suv: 'SUV', taxi: 'Taxi', police: 'Streifenwagen', hatchback: 'Kompaktwagen', wagon: 'Kombi', bike: 'Fahrrad', moto: 'Motorrad', heli: 'Christoph 2', cannon: 'Wasserwerfer', firetruck: 'Löschfahrzeug', ambulance: 'Rettungswagen' };
function vehName(c) { const u = c.userData; const n = u.heli ? 'Christoph 2' : u.ambulance ? 'Rettungswagen' : u.cannon ? (u.fireTruck ? 'Löschfahrzeug' : 'Wasserwerfer') : u.police && !u.bike ? 'Streifenwagen' : VEH_NAMES[u.type] || 'Auto'; let el = document.getElementById('vehname'); if (!el) { el = document.createElement('div'); el.id = 'vehname'; el.style.cssText = 'position:fixed;right:28px;bottom:120px;z-index:15;font:italic 900 34px system-ui,sans-serif;color:#fff;letter-spacing:1px;text-shadow:0 2px 0 #000,0 0 12px #000a;pointer-events:none;transition:opacity .6s;opacity:0'; document.body.appendChild(el); } el.textContent = n; el.style.opacity = '1'; clearTimeout(el._t); el._t = setTimeout(() => el.style.opacity = '0', 2200); }
function exitCar() {
  const c = player.car; if (!c) return; const u = c.userData; sfx(u.bike ? 'click' : 'door'); u.mode = u.sunk ? 'wreck' : 'parked'; u.driver = null; if (player.mesh.userData.helmet) player.mesh.userData.helmet.visible = false;
  if (u.heli) { player.pos.set(c.position.x + Math.cos(u.heading) * 2.6, 0, c.position.z - Math.sin(u.heading) * 2.6); player.pos.y = floorAt(player.pos.x, player.pos.z, c.position.y + 1); player.vy = 0; player.car = null; player.mesh.visible = true; player.mesh.position.copy(player.pos); return; }
  const cand = [[Math.cos(u.heading) * 2.2, -Math.sin(u.heading) * 2.2], [-Math.cos(u.heading) * 2.2, Math.sin(u.heading) * 2.2], [-Math.sin(u.heading) * 3.5, -Math.cos(u.heading) * 3.5]];
  for (const [ox, oz] of cand) { player.pos.set(c.position.x + ox, 0, c.position.z + oz); if (solidAt(player.pos.x, player.pos.z) < 0) break; }
  player.pos.y = surfAt(player.pos.x, player.pos.z, c.position.y + 0.5); player.vy = 0; // Brücken/Hochstraßen: auf dem Deck aussteigen, nicht darunter
  player.car = null; player.mesh.visible = true; player.mesh.position.copy(player.pos);
  if (player.mesh.userData.hand) player.mesh.userData.hand.rotation.set(0, Math.PI, 0);
  player.mesh.userData.curAnim = null; playAnim(player.mesh, 'idle', { fade: 0 });
}
// nächster Gehweg zu einem Punkt: Straße, Segment, Seite (sonst laufen Figuren quer durch die Stadt zu einer fernen Straße)
function nearestPedRoad(x, z) { const n = nearestRoadSeg(x, z, false, 25) || nearestRoadSeg(x, z, false); /* kurze Einzelstücke (Durchfahrt, Kachelrest) nur notfalls: sonst Pendeln auf 10 m */ if (!n) return null; const [ax, az] = n.road.p[n.seg], [bx, bz] = n.road.p[n.seg + 1]; n.side = (bx - ax) * (z - az) - (bz - az) * (x - ax) > 0 ? 1 : -1; return n; }
function rehome(u, pos) { const n = nearestPedRoad(pos.x, pos.z); if (!n) return false; const fwd = Math.random() < 0.5; u.road = n.road; u.dir = fwd ? 1 : -1; u.seg = fwd ? n.seg : n.seg + 1; u.side = n.side; u.offSeg = -1; return true; }
/* Seitenversatz gegen Hauswände: Gehweg bzw. Fahrspur liegt auf schmalen Straßen laut OSM teils schon im Haus. Dann näher zur Mitte rücken
   (nie unter kMin), zurück nach außen nur, wenn der volle Versatzpunkt frei ist (sonst Pendeln an der Wand). Prüfung alle 12 Bilder.
   W = voller Versatz in m, sgn = Seite (+1 links der Fahrtrichtung). Ergebnis: Faktor u.offK für den Versatz. */
function sideGuard(u, pos, W, kMin, sgn) {
  if (u.offRoad !== u.road) { u.offRoad = u.road; u.offK = 1; } if ((u.offT = (u.offT || 0) - 1) > 0) return u.offK; u.offT = 12;
  const nx = -Math.cos(u.heading || 0), nz = Math.sin(u.heading || 0); const inWall = (px, pz) => solidAt(px, pz) >= 0 && pos.y < TH(px, pz) + 2;
  if (inWall(pos.x, pos.z)) u.offK = Math.max(kMin, u.offK - 0.25);
  else if (u.offK < 1) { const d = W * (1 - u.offK); if (!inWall(pos.x + nx * sgn * d, pos.z + nz * sgn * d)) u.offK = Math.min(1, u.offK + 0.25); }
  return u.offK;
}
const pedSidewalk = (u, h) => { const W = u.road.w / 2 + 1.5, kMin = Math.min(1, u.road.w / 2 * 0.8 / W); const k0 = u.offK; sideGuard(u, h.position, W, kMin, u.side * u.dir);
  /* schon am Fahrbahnrand und trotzdem in der Wand: auf die andere Straßenseite wechseln (höchstens alle 8 s, sonst Pendeln) */ if (k0 !== undefined && k0 <= kMin + 1e-6 && u.offT === 12 && solidAt(h.position.x, h.position.z) >= 0 && (u.sideT || 0) < performance.now()) { u.side = -u.side; u.offK = 1; u.sideT = performance.now() + 8000; } };
function spawnPedAt(x, z) { if (solidAt(x, z) >= 0) return null; const u0 = {}; if (!rehome(u0, { x, z })) return null; const h = makeHuman(Math.random() < 0.5); h.position.set(x, TH(x, z), z); Object.assign(h.userData, u0, { speed: 1.4, hp: 100, state: 'walk', t: 0 }); scene.add(h); peds.push(h); shootables.push(h); return h; }


// Blechschaden: Karosserie an der Aufprallstelle eindrücken (Geometrie wird beim ersten Schaden je Auto kopiert)
// Fahrzeug-Ressourcen freigeben: nur eigene (geklonte) Geometrien/Materialien, Vorlagen bleiben
function disposeCar(c) { freeSkel(c); c.traverse(o => { if (!o.isMesh) return; if (o.geometry && o.geometry.userData.own) o.geometry.dispose(); const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) if (m && m.userData.own) m.dispose(); }); }
function dentCar(c, wp, dir, strength) {
  if (c.userData.bike) return; // Räder bekommen keine Dellen (dünne Rohre, das Verbiegen erzeugte NaN-Geometrie)
  const u = c.userData; const wheelSet = new Set(); for (const w of u.wheels || []) w.traverse(o => wheelSet.add(o));
  c.updateMatrixWorld(true); let n = 0;
  c.traverse(m => { if (!m.isMesh || wheelSet.has(m) || m.isInstancedMesh || !m.visible) return;
    if (!m.userData.ownGeo) { m.geometry = m.geometry.clone(); m.geometry.userData.own = true; m.userData.ownGeo = true; }
    const inv = new THREE.Matrix4().copy(m.matrixWorld).invert(); const lp = wp.clone().applyMatrix4(inv); const ld = dir.clone().transformDirection(inv).normalize();
    const sc = new THREE.Vector3().setFromMatrixScale(m.matrixWorld).x || 1; const R = 0.9 / sc, S = strength / sc;
    const pos = m.geometry.attributes.position; const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); const d = v.distanceTo(lp); if (d > R) continue; const f = (1 - d / R) ** 2 * S; v.addScaledVector(ld, f); v.y -= f * 0.15 * Math.random(); pos.setXYZ(i, v.x, v.y, v.z); n++; }
    pos.needsUpdate = true; m.geometry.computeVertexNormals(); m.geometry.computeBoundingSphere(); });
  u.dents = (u.dents || 0) + 1; return n; }
// Angestoßenes stehendes Auto oder Wrack rutscht mit Reibung aus (nicht durch Wände), dreht sich etwas
function shoveCar(c, dt) { const u = c.userData, v = u.shove, sp = v.length(); if (sp < 0.05 || (u.mode !== 'parked' && u.mode !== 'wreck')) { u.shove = null; u.shoveSpin = 0; return; }
  const D = u.dims || { l: 4.4, w: 1.9 }; if (moveWithCollision(c.position, v.x * dt, v.y * dt, Math.min(1.05, D.w / 2 + 0.1)) === 2) v.multiplyScalar(0.2);
  v.multiplyScalar(Math.max(0, sp - 9 * dt) / sp); u.heading += (u.shoveSpin || 0) * dt; u.shoveSpin = (u.shoveSpin || 0) * Math.pow(0.05, dt); c.rotation.y = u.heading; carTerrain(c); }
function carTerrain(c) { const u = c.userData; const fx = Math.sin(u.heading), fz = Math.cos(u.heading); const cy = c.position.y; const hf = surfAt(c.position.x + fx * 1.5, c.position.z + fz * 1.5, cy), hb = surfAt(c.position.x - fx * 1.5, c.position.z - fz * 1.5, cy); c.position.y = (hf + hb) / 2; c.rotation.x = Math.atan2(hb - hf, 3); }
function carFx(c, dt, braking) {
  const u = c.userData; if (!u.wheels) return;
  if (Math.abs(u.speed) > 0.05 && c.position.distanceToSquared(camera.position) < 4900) for (const w of u.wheels) w.rotation.x += u.speed * dt / 0.34;
  if (u.tlMat.isMeshBasicMaterial) u.tlMat.color.setHex(braking ? 0xff3030 : 0x8a1010);
  if (u.blMat) { u.blinkT = Math.max(0, (u.blinkT || 0) - dt); const on = u.blinkT > 0 && Math.floor(performance.now() / 350) % 2 === 0; u.blMat[0].color.setHex(on && u.blink === 0 ? 0xffa500 : 0x553300); u.blMat[1].color.setHex(on && u.blink === 1 ? 0xffa500 : 0x553300); }
  if (u.hp < 40 && u.mode !== 'wreck' && !u.bike) { u.smokeT = (u.smokeT || 0) + dt; if (u.smokeT > 0.12) { u.smokeT = 0; const p = c.position.clone(); p.y += 1.0; p.x += Math.sin(u.heading) * 1.8; p.z += Math.cos(u.heading) * 1.8; smoke(p, u.hp < 15 ? 0x222222 : 0x888888); } }
  u.cone.visible = u.mode !== 'parked' && u.mode !== 'wreck' && (c === player.car && u.lightsForce !== undefined ? u.lightsForce : world.night);
  if (u.heads) for (const hm of u.heads) { const on = u.cone.visible; if (hm.emissive) { hm.emissive.setHex(on ? 0xfff0c8 : 0x000000); hm.emissiveIntensity = on ? 2.2 : 0; } }
  if (u.tlMat && u.tlMat.emissive) { u.tlMat.emissive.setHex(braking ? 0xff2020 : (world.night && u.mode !== 'parked' ? 0x601010 : 0x000000)); }
}
const skids = { mesh: null, i: 0 };
function addSkid(x, z, h) { if (!skids.mesh) { const g = new THREE.PlaneGeometry(0.24, 0.7); g.rotateX(-Math.PI / 2); skids.mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.55, depthWrite: false }), 600); const z0 = new THREE.Object3D(); z0.scale.setScalar(0); z0.updateMatrix(); for (let i = 0; i < 600; i++) skids.mesh.setMatrixAt(i, z0.matrix); skids.mesh.frustumCulled = false; scene.add(skids.mesh); }
  const o = new THREE.Object3D(); o.position.set(x, TH(x, z) + 0.06, z); o.rotation.y = h; o.updateMatrix(); skids.mesh.setMatrixAt(skids.i, o.matrix); skids.i = (skids.i + 1) % 600; skids.mesh.instanceMatrix.needsUpdate = true; }
function driveCar(c, dt, ctrl) {
  if (c.userData.heli) { if (X.heliDrive) X.heliDrive(c, dt, ctrl); return; } /* Hubschrauber: eigene Flugphysik in heli.js */
  const u = c.userData; if (c === player.car && !u.bike && ((u.mwT = (u.mwT || 0) - 1) <= 0)) { u.mwT = 15; u.onMw = onMotorway(c.position.x, c.position.z); } const maxS = (u.maxS || (u.police ? 30 : 26)) * (c === player.car && u.onMw ? (u.moto ? 1.25 : 1.7) : 1); /* Autobahn: bis ~160 km/h */ const prev = u.speed, h0 = u.heading;
  if (ctrl.fwd) u.speed += (u.speed < 0 ? 18 : (u.accel || 12) * (1 - 0.55 * Math.max(0, u.speed) / maxS)) * dt; else if (ctrl.back) u.speed -= (u.speed > 0 ? 11 : 6) * dt; else { u.speed *= Math.pow(u.bike ? 0.8 : 0.88, dt); if (Math.abs(u.speed) < 0.3 && !(c === player.car && Math.abs(TH(c.position.x - Math.sin(u.heading) * 6, c.position.z - Math.cos(u.heading) * 6) - TH(c.position.x + Math.sin(u.heading) * 6, c.position.z + Math.cos(u.heading) * 6)) / 12 > 0.05)) u.speed = 0; } // Ausrollen statt Vollbremsung; das eigene Auto rollt erst ab 5 % Gefälle über 12 m von selbst los (André 13.11.: flach wirkende Wiese soll stehen)
  { const fx = Math.sin(u.heading), fz = Math.cos(u.heading), px = c.position.x, pz = c.position.z; const onDeck = deckAt(px, pz, c.position.y, 1.0) !== null;
    /* Neigung für den Hangabtrieb über 12 m statt aus dem Kippwinkel (±1,5 m, carTerrain): das 4-m-Raster hat 3–8 cm Buckel, die man auf der Wiese nicht sieht, die aber über 3 m Basis 8–14 % der Strecke über 4 % Neigung bringen (Günthersburgpark, 13.11.2026). Auf Brücken weiter der Kippwinkel */
    const sl = onDeck ? Math.sin(c.rotation.x || 0) : (TH(px - fx * 6, pz - fz * 6) - TH(px + fx * 6, pz + fz * 6)) / 12; /* Hangabtrieb: g·sin(Neigung) entlang der Fahrtrichtung minus Rollwiderstand (1,2 % g); KI erst in Fahrt, damit wartende Autos nicht wegrollen */ if (Math.abs(sl) > 0.015 && !(ctrl.brake && Math.abs(u.speed) < 1) && (c === player.car || Math.abs(u.speed) > 0.5)) u.speed += 9.81 * (sl - Math.sign(sl) * 0.012) * dt; }
  const hand = ctrl.brake && c === player.car; if (ctrl.brake) u.speed *= Math.pow(hand ? 0.35 : 0.05, dt);
  u.speed = clamp(u.speed, u.bike ? -1.5 : -8, maxS);
  // Lenken: bei hohem Tempo weniger Einschlag, mit Handbremse mehr; am Handy/Tablet stufenlos über Stick oder Gyro
  const steer = (c === player.car && player.touchSteer) ? player.touchSteer : ((ctrl.left ? 1 : 0) - (ctrl.right ? 1 : 0)); const sp = Math.abs(u.speed);
  const sRate = steer === 0 || Math.sign(steer) !== Math.sign(u.steerS || 0) ? 9 : 4.2; u.steerS = (u.steerS || 0) + (steer - (u.steerS || 0)) * Math.min(1, dt * sRate);
  if (c === player.car) { const wb = u.bike ? 1.1 : Math.max(2.3, (u.dims ? u.dims.l : 4.4) * 0.6); const maxA = (u.bike ? 0.75 : 0.6) / (1 + 0.009 * sp * sp) * (hand ? 2.4 : 1); /* Einschlag sinkt mit Tempo: wendig in der Stadt, ruhig bei Tempo; Handbremse: Heck kommt */ u.heading += u.speed / wb * Math.tan(Math.min(0.7, u.steerS * maxA)) * dt; }
  else u.heading += u.steerS * clamp(sp / 6, 0, 1) * (2.3 - 1.0 * Math.min(1, sp / maxS)) * dt * Math.sign(u.speed || 1); // KI-Fahrzeuge (Polizei, Wasserwerfer, Feuerwehr): bewährte Lenkung
  // Geschwindigkeit als Vektor: Haftung zieht ihn zur Fahrtrichtung, Handbremse und Tempo lassen das Heck kommen
  if (!u.vel) u.vel = new THREE.Vector2(Math.sin(u.heading) * u.speed, Math.cos(u.heading) * u.speed);
  const want = new THREE.Vector2(Math.sin(u.heading) * u.speed, Math.cos(u.heading) * u.speed);
  const grip = (hand ? 1.6 : 7.5) * (opts.grip || 1) * (1 - weather.rain * 0.35) * (u.bike ? 2.5 : 1); u.vel.lerp(want, Math.min(1, grip * dt));
  const slip = want.clone().sub(u.vel).length();
  if (slip > 3.2 && sp > 6 && !u.bike) { u.skidT = (u.skidT || 0) + dt; if (u.skidT > 0.035) { u.skidT = 0; const rx = Math.cos(u.heading) * 0.8, rz = -Math.sin(u.heading) * 0.8, bx = -Math.sin(u.heading) * 1.4, bz = -Math.cos(u.heading) * 1.4; addSkid(c.position.x + bx + rx, c.position.z + bz + rz, u.heading); addSkid(c.position.x + bx - rx, c.position.z + bz - rz, u.heading); }
    if (c === player.car) { u.scrT = (u.scrT || 0) - dt; if (u.scrT <= 0) { u.scrT = 0.16; sfx('screech', clamp(slip / 10, 0.2, 0.7)); } } }
  // Karosserie neigt sich in Kurven und beim Bremsen/Beschleunigen
  const body = c.children[0]; if (body) { const acc = (u.speed - prev) / Math.max(dt, 1e-3); if (u.by0 === undefined) { u.by0 = body.position.y; u.rollS = u.pitchS = u.heave = u.rv = u.pv = u.hv = 0; }
    const tRoll = -u.steerS * Math.min(1, sp / 18) * 0.075, tPitch = clamp(-acc * 0.0045, -0.06, 0.06);
    const h = Math.min(dt, 1 / 30), K = 140, C = 12; // gedämpfte Feder, leicht unterkritisch
    u.rv += (K * (tRoll - u.rollS) - C * u.rv) * h; u.pv += (K * (tPitch - u.pitchS) - C * u.pv) * h; u.hv += (180 * -u.heave - 14 * u.hv) * h;
    const gy = c.position.y; if (u.lastY !== undefined) { const vy = (gy - u.lastY) / Math.max(dt, 1e-3); if (u.lastVy !== undefined) u.hv -= clamp((vy - u.lastVy) * 0.04, -0.6, 0.6); u.lastVy = vy; } u.lastY = gy;
    u.rollS += u.rv * h; u.pitchS += u.pv * h; u.heave = clamp(u.heave + u.hv * h, -0.12, 0.1);
    body.rotation.z = u.rollS; body.rotation.x = u.pitchS; body.position.y = u.by0 + u.heave; }
  const dx = u.vel.x * dt, dz = u.vel.y * dt;
  const dmgK = c === player.car ? 0.35 * ((X.perks && X.perks.car) || 1) : 1; // eigenes Auto hält mehr aus, andere bleiben empfindlich
  const p = c.position; const px0 = p.x, pz0 = p.z; const D = u.dims || { l: 4.2, w: 1.9 }; const rr = Math.min(1.05, D.w / 2 + 0.1);
  // Fahrzeug-Hülle gegen Gebäude: Seitenpunkte alle 1,5 m (Wasserwerfer 7,6 m) plus Front/Heck-Mitte, als Zusatztest im Kollisionsschritt (Gleiten bleibt möglich)
  const L2 = D.l / 2 - 0.15, W2 = D.w / 2 - 0.05; const nSide = Math.max(1, Math.ceil(2 * L2 / 1.5));
  const inBoxH = (x, z, fx, fz) => { for (let i = 0; i <= nSide; i++) { const a = -L2 + 2 * L2 * i / nSide; if (solidAt(x + fx * a + fz * W2, z + fz * a - fx * W2) >= 0 || solidAt(x + fx * a - fz * W2, z + fz * a + fx * W2) >= 0) return true; } return solidAt(x + fx * L2, z + fz * L2) >= 0 || solidAt(x - fx * L2, z - fz * L2) >= 0; };
  let bfx = Math.sin(u.heading), bfz = Math.cos(u.heading); const inBox = (x, z) => inBoxH(x, z, bfx, bfz);
  let hit = moveWithCollision(p, dx, dz, rr, undefined, inBox);
  if (hit === 2 && inBox(px0, pz0)) { const fx0 = Math.sin(h0), fz0 = Math.cos(h0);
    if (!inBoxH(px0, pz0, fx0, fz0)) { /* die Lenkung hat eine Ecke in die Wand gedreht: altes Heading zurück und erneut versuchen */ u.heading = h0; u.steerS = 0; bfx = fx0; bfz = fz0; hit = moveWithCollision(p, dx, dz, rr, undefined, inBox); }
    else { /* steckt in der Wand: entlang der kürzesten freien Richtung herausschieben */ let done = false; for (let d = 0.4; d <= 3.01 && !done; d += 0.4) for (let a = 0; a < 8 && !done; a++) { const ox = Math.sin(a * Math.PI / 4) * d, oz = Math.cos(a * Math.PI / 4) * d; if (!inBox(px0 + ox, pz0 + oz)) { p.x = px0; p.z = pz0; if (moveWithCollision(p, ox, oz, rr, undefined, inBox) !== 2) done = true; } } if (!done) { /* keine freie Richtung: wie früher nur mit dem Kreis weiterfahren, statt stehen zu bleiben */ p.x = px0; p.z = pz0; hit = moveWithCollision(p, dx, dz, rr); } else u.speed *= 0.5; } }
  // Aufprallwucht = Tempo, das die Wand geschluckt hat (Streifen kostet wenig, frontal viel)
  const impact = hit ? Math.hypot(dx - (p.x - px0), dz - (p.z - pz0)) / Math.max(dt, 1e-3) : 0;
  { const pre = (D.l / 2 + 2.6) ** 2, PA = D.l / 2 + 2.15, PC = D.w / 2 + 0.93; /* geparkte Reihe: Kasten aus Fahrzeuglänge + Parkerhälfte (4,3 × 1,85 m) */
  for (const sp of staticParked) { if (!sp.active) continue; const ox = p.x - sp.x, oz = p.z - sp.z; if (ox * ox + oz * oz > pre) continue; const hx = Math.sin(sp.h), hz = Math.cos(sp.h); const al = ox * hx + oz * hz, ac = ox * hz - oz * hx; const pa = PA - Math.abs(al), pc = PC - Math.abs(ac); if (pa > 0 && pc > 0) { if (pc < pa) { const sg = Math.sign(ac) || 1; moveWithCollision(p, hz * pc * sg, -hx * pc * sg, rr); } else { const sg = Math.sign(al) || 1; moveWithCollision(p, hx * pa * sg, hz * pa * sg, rr); } if (Math.abs(u.speed) > 5 && (u.dents || 0) < 12) { const sg = Math.sign(u.speed) || 1; const fx = Math.sin(u.heading) * sg, fz = Math.cos(u.heading) * sg; const L = (u.dims ? u.dims.l : 4.2) / 2; dentCar(c, new THREE.Vector3(p.x + fx * (L - 0.15), p.y + 0.6, p.z + fz * (L - 0.15)), new THREE.Vector3(-fx, 0, -fz), Math.min(0.28, Math.abs(u.speed) * 0.012)); if (c === player.car) camShake(Math.min(0.5, Math.abs(u.speed) / 40)); } if (Math.abs(u.speed) > 9) { u.hp -= (Math.abs(u.speed) - 6) * 1.2 * dmgK; if (c === player.car) sfx('crash', 0.6); if (u.hp <= 0) explode(c); } u.speed *= -0.2; if (u.vel) u.vel.multiplyScalar(0.3); } } }
  if (hit === 1 || (hit && impact < 3.5)) { // Streifen: an der Wand entlang gleiten, etwas Tempo verlieren
    const mv = Math.hypot(p.x - px0, p.z - pz0) / Math.max(dt, 1e-3); if (u.vel && mv > 0.01) u.vel.set((p.x - px0) / Math.max(dt, 1e-3), (p.z - pz0) / Math.max(dt, 1e-3)); u.speed *= Math.pow(0.55, dt); if (impact > 1.5 && c === player.car && Math.random() < dt * 6) sfx('bump', 0.2); }
  else if (hit) { if (impact > 5 && (u.dents || 0) < 12) { const sg = Math.sign(u.speed) || 1; const fx = Math.sin(u.heading) * sg, fz = Math.cos(u.heading) * sg; const L = (u.dims ? u.dims.l : 4.2) / 2; const side = (Math.random() - 0.5) * 1.2; const wp = new THREE.Vector3(c.position.x + fx * (L - 0.15) + fz * side, c.position.y + 0.65, c.position.z + fz * (L - 0.15) - fx * side); dentCar(c, wp, new THREE.Vector3(-fx, 0, -fz), Math.min(0.32, impact * 0.013)); } u.pv = (u.pv || 0) + clamp(u.speed * 0.05, -1.2, 1.2); u.rv = (u.rv || 0) + (Math.random() - 0.5) * impact * 0.03; u.hv = (u.hv || 0) + impact * 0.015; if (u.vel) u.vel.multiplyScalar(-0.12); if (impact > 6 && c === player.car) camShake(Math.min(0.5, impact / 45)); if (impact > 11) { if (c === player.car) sfx('crash', clamp(impact / 30, 0.3, 1)); u.hp -= (impact - 8) * 2.2 * dmgK; burst(p.clone().setY(p.y + 0.8), 0xaaaaaa, 4, 2); if (u.hp <= 0) explode(c); } else if (impact > 5 && c === player.car) sfx('bump', 0.5); u.speed = -Math.sign(u.speed) * Math.min(2.5, impact * 0.12); }
  c.rotation.y = u.heading; carFx(c, dt, ctrl.brake || (ctrl.back && u.speed > 0)); carTerrain(c);
  if (Math.abs(u.speed) > 3) for (const ped of peds) { if (ped.userData.state === 'dead') continue; if (ped.position.distanceTo(p) < 3.5 && (() => { const D = u.dims || { l: 4.4, w: 1.9 }; const sg = Math.sign(u.speed) || 1; const hx = Math.sin(u.heading) * sg, hz = Math.cos(u.heading) * sg; const rx = ped.position.x - p.x, rz = ped.position.z - p.z; const al = rx * hx + rz * hz, ac = rx * hz - rz * hx; return al > -D.l / 2 + 0.6 && al < D.l / 2 + 0.3 && Math.abs(ac) < D.w / 2 + 0.25; })()) { const dir = new THREE.Vector3(dx, 0, dz).normalize(); if (c !== player.car) { /* KI-Fahrer weichen aus und schubsen nur */ const sx = ped.position.x - p.x, sz = ped.position.z - p.z, sl = Math.hypot(sx, sz) || 1; moveWithCollision(ped.position, sx / sl * 1.2, sz / sl * 1.2, 0.3); if (ped.userData.state !== 'stunned' && ped.userData.state !== 'cop') WPN.stun(ped, 'hit', 1.5); u.speed *= 0.5; continue; } damage(ped, u.bike ? 35 : 100, dir); const v = Math.abs(u.speed); ped.userData.fly = new THREE.Vector3(dir.x * v * 0.75 + rnd(-1, 1), 2.5 + v * 0.22, dir.z * v * 0.75 + rnd(-1, 1)); ped.userData.spin = rnd(-6, 6); sfx('hit', 0.9); if (c === player.car) raiseWanted(0.5, 2); } }
  { const D = u.dims || { l: 4.4, w: 1.9 }; const hx = Math.sin(u.heading), hz = Math.cos(u.heading);
    for (const o of cars) { if (o === c || o.userData.mode === 'tram' || o.userData.heli || Math.abs(o.position.y - p.y) > 2.5) continue; const rx = o.position.x - p.x, rz = o.position.z - p.z; if (rx * rx + rz * rz > 49) continue; const ou = o.userData, OD = ou.dims || { l: 4.4, w: 1.9 };
      // Zwei gedrehte Rechtecke (Trennachsen-Test über die vier Kantenrichtungen): Stoßrichtung = Achse mit der kleinsten Überlappung.
      // Vorher zählte vom anderen Auto nur min(Länge, 1,6 × Breite): beim Auffahren steckten 0,7 m Blech ineinander
      const oh = o.rotation.y, ohx = Math.sin(oh), ohz = Math.cos(oh); let nx = 0, nz = 0, pen = 1e9;
      for (const [axx, axz] of [[hx, hz], [hz, -hx], [ohx, ohz], [ohz, -ohx]]) { const ra = D.l / 2 * Math.abs(hx * axx + hz * axz) + D.w / 2 * Math.abs(hz * axx - hx * axz), rb = OD.l / 2 * Math.abs(ohx * axx + ohz * axz) + OD.w / 2 * Math.abs(ohz * axx - ohx * axz); const dd = rx * axx + rz * axz, ov = ra + rb - Math.abs(dd); if (ov < pen) { pen = ov; const sg = Math.sign(dd) || 1; nx = axx * sg; nz = axz * sg; } }
      if (pen <= 0) continue;
      const myV = u.vel ? [u.vel.x, u.vel.y] : [hx * u.speed, hz * u.speed]; const oV = ou.vel ? [ou.vel.x, ou.vel.y] : [Math.sin(ou.heading || 0) * (ou.speed || 0), Math.cos(ou.heading || 0) * (ou.speed || 0)];
      const closing = (myV[0] - oV[0]) * nx + (myV[1] - oV[1]) * nz; // > 0: wir fahren aufeinander zu
      const share = ou.mode === 'wreck' || ou.mode === 'parked' && !ou.unitCar ? 0.35 : 0.5; moveWithCollision(p, -nx * pen * (1 - share), -nz * pen * (1 - share), rr); if (ou.mode !== 'wreck') moveWithCollision(o.position, nx * pen * share, nz * pen * share, Math.min(1.05, OD.w / 2 + 0.1)); /* Schuebe ueber die Kollision: nicht in Waende */
      if (closing > 0.5) { /* Impuls nach Masse (Grundfläche): ein Kleinwagen prallt am Wasserwerfer ab, ein stehendes Auto wird weggeschoben statt nur 0,2 m */ const mA = D.l * D.w, mB = OD.l * OD.w * (ou.cannon ? 2.5 : 1), kA = closing * 1.1 * mB / (mA + mB), kB = closing * 1.1 * mA / (mA + mB);
        if (u.vel) { u.vel.x -= nx * kA; u.vel.y -= nz * kA; } u.speed -= (nx * hx + nz * hz) * kA;
        if (ou.mode === 'parked' || ou.mode === 'wreck') { if (!ou.shove) ou.shove = new THREE.Vector2(); ou.shove.x += nx * kB; ou.shove.y += nz * kB; ou.shoveSpin = (ou.shoveSpin || 0) + clamp((rx * nz - rz * nx) * kB * 0.04, -1.5, 1.5); }
        else { if (ou.vel) { ou.vel.x += nx * kB * 0.8; ou.vel.y += nz * kB * 0.8; } ou.speed = (ou.speed || 0) * 0.6; }
        if (closing > 6) { const oK = o === player.car ? 0.35 : 1; u.hp -= (closing - 5) * 1.4 * dmgK; ou.hp -= (closing - 5) * 2.4 * oK; if (c === player.car || o === player.car) { sfx('crash', clamp(closing / 25, 0.3, 1)); camShake(Math.min(0.5, closing / 40)); } if ((u.dents || 0) < 12) dentCar(c, new THREE.Vector3(p.x + nx * (D.w / 2), p.y + 0.6, p.z + nz * (D.w / 2)), new THREE.Vector3(-nx, 0, -nz), Math.min(0.3, closing * 0.012)); if (ou.hp <= 0) explode(o); if (u.hp <= 0) explode(c); } else if (closing > 2 && (c === player.car || o === player.car)) sfx('bump', 0.4);
      }
      if (o === player.car && u.police) player.hp -= 120 * dt; /* Polizei drängt: Schaden pro Sekunde, bildratenunabhängig */ } }
  checkPoles(c);
  const wy = waterAt(p.x, p.z, p.y);
  if (wy !== null) {
    u.speed *= Math.pow(0.02, dt); if (u.vel) u.vel.multiplyScalar(Math.pow(0.02, dt));
    p.y = wy - (u.bike ? 0.65 : 1.05); c.rotation.x *= 0.5;
    if (!u.sunk) {
      u.sunk = true; u.hp = 0; u.mode = 'wreck'; if (u.cone) u.cone.visible = false;
      burst(new THREE.Vector3(p.x, wy + 0.15, p.z), 0xd8eeff, 24, 5.5); sfx('splat', 0.9);
      if (c === player.car) { showMsg('IM MAIN ABGESOFFEN!', 1800); exitCar(); }
      else if (u.bike && u.rider) dropRider(c, false);
    }
  }
}

// Umgefahrene Laternen und Ampeln: Instanz ausblenden und als kippendes 3D-Modell wegschleudern (gefahrlos für das Auto)
const fallenPoles = [], _zeroM4 = new THREE.Matrix4().makeScale(0, 0, 0);
function knockPole(sp, isSig, c) {
  if (sp.down) return; sp.down = true;
  const x = sp[0], z = sp[1], ty = TH(x, z), u = c.userData, sg = Math.sign(u.speed) || 1;
  const fx = Math.sin(u.heading) * sg, fz = Math.cos(u.heading) * sg, v = Math.abs(u.speed);
  if (isSig) {
    if (sp.pm) { sp.pm.setMatrixAt(sp.i, _zeroM4); sp.pm.instanceMatrix.needsUpdate = true; }
    if (sp.bm) { sp.bm.setMatrixAt(sp.i, _zeroM4); sp.bm.instanceMatrix.needsUpdate = true; }
    if (sp.lm) { for (let k = 0; k < 3; k++) sp.lm.setMatrixAt(sp.i * 3 + k, _zeroM4); sp.lm.instanceMatrix.needsUpdate = true; const L = sp.lm.userData.lights; if (L) for (let k = 0; k < 3; k++) if (L[sp.i * 3 + k]) L[sp.i * 3 + k].down = true; }
  } else {
    if (sp.lm) { sp.lm.setMatrixAt(sp.i, _zeroM4); sp.lm.instanceMatrix.needsUpdate = true; }
    if (sp.hm) { sp.hm.setMatrixAt(sp.i, _zeroM4); sp.hm.instanceMatrix.needsUpdate = true; }
    if (sp.spotM) { sp.spotM.setMatrixAt(sp.i, _zeroM4); sp.spotM.instanceMatrix.needsUpdate = true; }
    if (sp.pts) { const pa = sp.pts.geometry.attributes.position; pa.setY(sp.i, -999); pa.needsUpdate = true; }
  }
  const g = new THREE.Group(); g.userData.noChunk = true; g.position.set(x, ty, z);
  if (isSig && SIG_POLE_G && SIG_BOX_G) {
    const pm = new THREE.Mesh(SIG_POLE_G, shLambert(0x5a5d60)), bm = new THREE.Mesh(SIG_BOX_G, shLambert(0x1c1c1c));
    bm.rotation.y = sp.rot || 0; g.add(pm, bm);
  } else if (LAMP_G && LAMP_HEAD_G) {
    const lm = new THREE.Mesh(LAMP_G, shLambert(0x333333)), hm = new THREE.Mesh(LAMP_HEAD_G, shBasic(0xffe3a0));
    lm.position.y = 2.5; hm.position.y = 5.0; g.add(lm, hm);
  }
  scene.add(g);
  fallenPoles.push({ g, vx: fx * v * 0.45 + rnd(-0.8, 0.8), vy: Math.min(3.2, 0.9 + v * 0.12), vz: fz * v * 0.45 + rnd(-0.8, 0.8), ax: fz, az: -fx, ang: 0, vang: Math.max(3.5, v * 0.42), t: 0, y0: ty });
  burst(new THREE.Vector3(x, ty + 0.9, z), 0xffcc55, 8, 4);
  if (c === player.car) sfx('bump', 0.4);
}
function checkPoles(c) {
  const u = c.userData; if ((u.bike && !u.moto) || Math.abs(u.speed) < 3.5) return;
  const p = c.position, D = u.dims || { l: 4.4, w: 1.9 }, hx = Math.sin(u.heading), hz = Math.cos(u.heading);
  const L2 = D.l / 2 + 0.35, W2 = D.w / 2 + 0.35, R2 = (L2 + 0.6) ** 2;
  for (let pass = 0; pass < 2; pass++) {
    const list = pass ? signalPoles : lampSpots;
    for (let i = 0; i < list.length; i++) {
      const sp = list[i]; if (sp.down) continue;
      const rx = sp[0] - p.x, rz = sp[1] - p.z; if (rx * rx + rz * rz > R2) continue;
      if (Math.abs(rx * hx + rz * hz) < L2 && Math.abs(rx * hz - rz * hx) < W2) knockPole(sp, pass === 1, c);
    }
  }
}
function updateFallenPoles(dt) {
  for (let i = fallenPoles.length - 1; i >= 0; i--) {
    const f = fallenPoles[i]; f.t += dt;
    if (f.ang < Math.PI / 2) {
      f.g.position.x += f.vx * dt; f.g.position.z += f.vz * dt;
      f.g.position.y = Math.max(f.y0 + 0.08, f.g.position.y + f.vy * dt); f.vy -= 14 * dt;
      f.ang = Math.min(Math.PI / 2, f.ang + f.vang * dt);
      f.g.setRotationFromAxisAngle(new THREE.Vector3(f.ax, 0, f.az).normalize(), -f.ang);
    } else if (f.t > 15) { scene.remove(f.g); fallenPoles.splice(i, 1); }
  }
}

// ---------- Welt in Kacheln: ganz Frankfurt, geladen wird nur die Umgebung ----------
// Daten (Gebäude, Straßen, Gelände) bleiben nach dem Laden im Speicher, Meshes nur im Umkreis R_MESH.
let waitMsg = false; let FAC_CACHE = null, CROWN_MAT = null, LEAF_G = null, GLOW_TEX = null; let mapZoom = 3000;
const R_DATA = window.__touch ? 2 : 3; /* Handy: weniger Kacheldaten im Speicher */ let R_MESH = 2; const GROUND_MAT = new THREE.MeshLambertMaterial({ vertexColors: true }); GROUND_MAT.userData.shared = true;
const farPlane = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshLambertMaterial({ color: 0x6e6a60 })); farPlane.rotation.x = -Math.PI / 2; farPlane.userData.noChunk = true; scene.add(farPlane);
const OWN_LISTS = () => [rayTargets, nightOnly, emissiveMats, signalMeshes, signalPoles, treeSpots, lampSpots, staticParked, parkedTiles, leafMeshes, crownMeshes];
// Kreuzungen: Index aller Straßen- und Gleispunkte (2-m-Raster)
const NODEIDX = new Map(); const nkey = (x, z) => Math.round(x / 2) + ',' + Math.round(z / 2);
function nodeAdd(r) { r.p.forEach((p, k) => { const kk = nkey(p[0], p[1]); let a = NODEIDX.get(kk); if (!a) NODEIDX.set(kk, a = []); a.push([r, k]); }); }
function nodesNear(x, z) { const out = []; const cx = Math.round(x / 2), cz = Math.round(z / 2); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = NODEIDX.get((cx + a) + ',' + (cz + b)); if (l) for (const e of l) { const p = e[0].p[e[1]]; if (Math.abs(p[0] - x) < 1 && Math.abs(p[1] - z) < 1) out.push(e); } } return out; }
// Ampeln im Raster (für die KI-Autos)
const SIGGRID = new Map();
function signalsNear(x, z) { const out = []; const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = SIGGRID.get(key(cx + a, cz + b)); if (l) out.push(...l); } return out; }
// Brücken/Rampen: Höhen kommen aus build_tiles.py, hier nur das Raster für deckAt
function deckAddRoad(r) {
  if (!r.ry) return;
  for (let i = 0; i < r.p.length - 1; i++) { if (!r.el[i] && !r.el[i + 1]) continue; const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1];
    const seg = { ax, az, bx, bz, ya: r.el[i] ? r.ry[i] : TH(ax, az), yb: r.el[i + 1] ? r.ry[i + 1] : TH(bx, bz), w: r.w / 2 + (r.mw ? 0.8 : 2.5), r };
    const x0 = Math.floor((Math.min(ax, bx) - seg.w) / DCELL), x1 = Math.floor((Math.max(ax, bx) + seg.w) / DCELL), z0 = Math.floor((Math.min(az, bz) - seg.w) / DCELL), z1 = Math.floor((Math.max(az, bz) + seg.w) / DCELL);
    for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) { const kk = gx + ',' + gz; if (!deckGrid.has(kk)) deckGrid.set(kk, []); deckGrid.get(kk).push(seg); } }
}
// Ränder einer Fläche ohne die Schnittkanten an Kachelgrenzen (dort steht kein Zaun)
function ringRuns(o) { const P = o.p.concat([o.p[0]]); if (!o.cut) return [P]; const onCut = (a, b) => { for (const i of [0, 1]) { const m = a[i] / TS; if (Math.abs(m - Math.round(m)) < 1e-4 && Math.abs(a[i] - b[i]) < 0.02) return true; } return false; };
  const runs = []; let cur = [P[0]]; for (let i = 0; i < P.length - 1; i++) { if (onCut(P[i], P[i + 1])) { if (cur.length > 1) runs.push(cur); cur = [P[i + 1]]; } else cur.push(P[i + 1]); } if (cur.length > 1) runs.push(cur); return runs; }
// Zaun-/Mauer-/Heckenstücke einer Kachel, eine Quelle für Bild und Kollision (sonst gibt es unsichtbare Wände).
// OSM-Barrieren wie eingetragen; erfundene Zäune um Schulen, Kitas, Bolzplätze und Kleingärten bekommen an jedem Weg
// und jeder Straße, die den Rand kreuzt, eine Lücke von 3 m. Spielplätze bleiben offen (meist ohne Zaun, oft mitten im Park).
function barrierSegs(d) {
  const out = [], ways = (d.paths || []).concat(d.roads || []), carWays = (d.roads || []).filter(r => !r.ped && !r.ry);
  const add = (pts, k, auto) => { for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1]; const l = Math.hypot(bx - ax, bz - az); if (l < 0.5) continue;
    // Lücken: erfundene Zäune an jedem Weg und jeder Straße (3 m); OSM-Zäune nur an Fahrbahnen, dort so breit wie die
    // Fahrbahn plus Rand (12.11.2026: 1297 von 9552 OSM-Barrieren lagen mit einem Punkt auf der Fahrbahn, z. B. Konstablerwache)
    let cuts = []; const x0 = Math.min(ax, bx) - 1, x1 = Math.max(ax, bx) + 1, z0 = Math.min(az, bz) - 1, z1 = Math.max(az, bz) + 1;
    for (const w of (auto ? ways : carWays)) for (let j = 0; j < w.p.length - 1; j++) { const [cx, cz] = w.p[j], [dx, dz] = w.p[j + 1]; if (Math.max(cx, dx) < x0 || Math.min(cx, dx) > x1 || Math.max(cz, dz) < z0 || Math.min(cz, dz) > z1) continue; const t = segX(ax, az, bx, bz, cx, cz, dx, dz); if (t === null) continue;
      const half = auto && !w.w ? 1.5 : (w.w || 3) / 2 + 0.8; const sn = Math.abs(((bx - ax) * (dz - cz) - (bz - az) * (dx - cx)) / (l * (Math.hypot(dx - cx, dz - cz) || 1))) || 1; cuts.push([t, Math.min(12, half / Math.max(0.35, sn)) / l]); }
    cuts.sort((a, b) => a[0] - b[0]); let t0 = 0;
    for (const c of cuts.concat([null])) { const t = c && c[0], g = c ? c[1] : 0; const t1 = c === null ? 1 : Math.max(t0, t - g); if ((t1 - t0) * l >= 0.5) { const px = ax + (bx - ax) * t0, pz = az + (bz - az) * t0, qx = ax + (bx - ax) * t1, qz = az + (bz - az) * t1;
        if (solidAt((px + qx) / 2, (pz + qz) / 2) < 0 && !barrierOnRoad(px, pz, qx, qz)) out.push([px, pz, qx, qz, k]); }
      if (c !== null) t0 = Math.min(1, t + g); } } };
  for (const b of d.barriers || []) add(b.p, b.k, false);
  for (const a of d.areas || []) for (const r of ringRuns(a)) add(r, 'fence', true);
  for (const g of d.green || []) if (g.k === 'allotments' || g.k === 'pitch') for (const r of ringRuns(g)) add(r, g.k === 'allotments' ? 'hedge' : 'fence', true);
  return out;
}
function barrierH(k) { return k === "retaining_wall" ? 1.0 : k === "fence" || k === "hedge" ? 1.3 : 1.7; }
let BUILD_TILE = null; // Kachel, an der runJob gerade baut
function barrierDrop(t) { for (const seg of t.bar || []) { const [ax, az, bx, bz] = seg; for (let cx = Math.floor((Math.min(ax, bx) - 2) / CELL); cx <= Math.floor((Math.max(ax, bx) + 2) / CELL); cx++) for (let cz = Math.floor((Math.min(az, bz) - 2) / CELL); cz <= Math.floor((Math.max(az, bz) + 2) / CELL); cz++) gridDrop(barrierGrid, key(cx, cz), v => v === seg); } t.bar = []; }
// Hindernis = genau die gezeichneten Stücke (t.bar, damit unregisterTile sie wieder aus dem Raster nehmen kann)
function barrierRegister(t, segs) { barrierDrop(t); t.bar = segs.map(([ax, az, bx, bz, k]) => barrierAdd(ax, az, bx, bz, barrierH(k))); }
// Kachelbild für Minikarte und große Karte
function tileMap(t) {
  const c = document.createElement('canvas'); c.width = c.height = TS * MM_SCALE; const g = c.getContext('2d'); g.fillStyle = '#1b1d22'; g.fillRect(0, 0, c.width, c.height);
  const P = ([x, z]) => [(x - t.tx * TS) * MM_SCALE, (z - t.tz * TS) * MM_SCALE]; const d = t.data;
  const poly = (list, col) => { g.fillStyle = col; for (const o of list || []) { g.beginPath(); o.p.forEach((p, i) => { const [x, y] = P(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.fill(); } };
  poly(d.green, '#2f4a2a'); poly(d.water, '#284a66'); poly(d.buildings, '#34363c');
  g.strokeStyle = '#8d8d93'; g.lineCap = 'round'; for (const r of d.roads || []) { g.lineWidth = Math.max(1, r.w * MM_SCALE * 0.7); g.beginPath(); r.p.forEach((p, i) => { const [x, y] = P(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); }
  return c;
}
function registerTile(t) {
  const d = t.data;
  if (t.k === '0_-1' || t.k === '-1_0') { const fn = d.furniture || (d.furniture = []); const pt = t.k === '0_-1' ? { x: 255, z: -25, k: 'fountain' } : { x: -180, z: 411, k: 'fountain' }; if (!fn.some(f => f.k === 'fountain' && Math.hypot(f.x - pt.x, f.z - pt.z) < 20)) fn.push(pt); }
  const nb0 = WORLD.buildings.length; t.bi = [];
  for (const b of d.buildings || []) { if (!b.n && pointInPoly(242, -280, b.p)) b.n = 'Sozialrathaus Ost'; /* Andrés Angabe: rechts neben der Kita Eulengasse, hinter der Durchfahrt */ const i = WORLD.buildings.length; WORLD.buildings.push(b); if (!(b.mh >= 2.2)) addToGrid(i, b.p); t.bi.push(i); /* aufgeständert (Überbauung, Tankstellendach): darunter frei */ }

  t.rd = []; t.rp = [];
  for (const r of d.roads || []) { const i = WORLD.roads.length; WORLD.roads.push(r); gridAddRoad(r, i); deckAddRoad(r); nodeAdd(r); if (r.w >= 5 && !r.ped) t.rd.push(r); if (!r.mw && !r.ry) t.rp.push(r); if (!r.mw) passageAdd(r); /* Weg durch ein Haus = Durchfahrt/Arkade, auch ohne OSM-Markierung */ }
  for (let bi = nb0; bi < WORLD.buildings.length; bi++) buildingPassages(bi); /* Haus lädt nach dem Weg (Nachbarkachel) */
  for (const r of d.rails || []) { WORLD.rails.push(r); nodeAdd(r); pathAdd(r); }
  for (const p of d.paths || []) pathAdd(p);
  for (const w of d.water || []) waterAdd(w);
  for (const s of d.signals || []) { const k = key(Math.floor(s[0] / CELL), Math.floor(s[1] / CELL)); if (!SIGGRID.has(k)) SIGGRID.set(k, []); SIGGRID.get(k).push(s); }
  for (const k of WKEYS) if (k !== 'buildings' && k !== 'roads' && k !== 'rails' && d[k]) for (const o of d[k]) WORLD[k].push(o);
  t.bar = []; /* Zäune kommen erst mit dem Bild (buildDetails): beim Laden fehlen oft noch Straßen und Häuser der Nachbarkacheln, dann stand das Hindernis mitten auf der Straße, das Bild aber nicht */
  if (typeof DEMO !== 'undefined' && DEMO && DEMO.addRoads) DEMO.addRoads(d.roads || []);
}
// Kacheldaten außerhalb R_DATA+2 wieder freigeben (LRU): Raster-Einträge entfernen, Plätze in WORLD.buildings/roads werden null (Indizes der anderen bleiben gültig),
// Listen in Ort gefiltert (CITY teilt die Arrays), DEM-Höhen, Minikarten-Bild und Rohdaten gelöscht. Fehl-Kacheln (data: {}) ebenso, damit sie neu geladen werden.
// Der Demo-Routengraph (demo.js) bleibt: er ist klein und addRoads legt beim Neuladen keine doppelten Kanten an.
function gridDrop(map, k, pred) { const c = map.get(k); if (!c) return; let w = 0; for (let i = 0; i < c.length; i++) if (!pred(c[i])) c[w++] = c[i]; c.length = w; if (!w) map.delete(k); }
function nodeRemove(r) { for (const p of r.p) { const kk = nkey(p[0], p[1]); const a = NODEIDX.get(kk); if (!a) continue; let w = 0; for (const e of a) if (e[0] !== r) a[w++] = e; a.length = w; if (!w) NODEIDX.delete(kk); } }
function unregisterTile(t) {
  if (t.built) unbuildTile(t); const d = t.data || {};
  for (const i of t.bi || []) { const b = WORLD.buildings[i]; if (!b) continue; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of b.p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) gridDrop(grid, key(cx, cz), v => v === i); WORLD.buildings[i] = null; }
  const g = getRoadGrid(); for (const r of d.roads || []) {
    for (let i = 0; i < r.p.length - 1; i++) { const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const pad = r.w / 2 + 4; for (let cx = Math.floor((Math.min(ax, bx) - pad) / CELL); cx <= Math.floor((Math.max(ax, bx) + pad) / CELL); cx++) for (let cz = Math.floor((Math.min(az, bz) - pad) / CELL); cz <= Math.floor((Math.max(az, bz) + pad) / CELL); cz++) gridDrop(g, key(cx, cz), e => e[0] === r); }
    if (r.ry) for (let i = 0; i < r.p.length - 1; i++) { if (!r.el[i] && !r.el[i + 1]) continue; const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; const w = r.w / 2 + (r.mw ? 0.8 : 2.5); for (let gx = Math.floor((Math.min(ax, bx) - w) / DCELL); gx <= Math.floor((Math.max(ax, bx) + w) / DCELL); gx++) for (let gz = Math.floor((Math.min(az, bz) - w) / DCELL); gz <= Math.floor((Math.max(az, bz) + w) / DCELL); gz++) gridDrop(deckGrid, gx + ',' + gz, s => s.r === r); }
    nodeRemove(r); }
  for (const r of d.rails || []) nodeRemove(r);
  for (const r of (d.paths || []).concat(d.rails || [])) for (let i = 0; i < r.p.length - 1; i++) { const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1]; for (let cx = Math.floor((Math.min(ax, bx) - 3) / CELL); cx <= Math.floor((Math.max(ax, bx) + 3) / CELL); cx++) for (let cz = Math.floor((Math.min(az, bz) - 3) / CELL); cz <= Math.floor((Math.max(az, bz) + 3) / CELL); cz++) gridDrop(pathGrid, key(cx, cz), e => e[0] === r); }
  for (const w of d.water || []) if (w.x0 !== undefined) for (let cx = Math.floor(w.x0 / CELL); cx <= Math.floor(w.x1 / CELL); cx++) for (let cz = Math.floor(w.z0 / CELL); cz <= Math.floor(w.z1 / CELL); cz++) gridDrop(waterGrid, key(cx, cz), v => v === w);
  for (const s of d.signals || []) gridDrop(SIGGRID, key(Math.floor(s[0] / CELL), Math.floor(s[1] / CELL)), v => v === s);
  for (const k of WKEYS) { if (k === 'buildings' || !d[k] || !d[k].length) continue; /* Straßen, Gleise und alle Listen in Ort kompaktieren (CITY teilt die Arrays) */ const S = new Set(d[k]); const L = WORLD[k]; let w = 0; for (let i = 0; i < L.length; i++) if (!S.has(L[i])) L[w++] = L[i]; L.length = w; }
  barrierDrop(t);
  DEMT.delete(t.k); DEMN.delete(dkey(t.tx, t.tz)); thK = NaN; thH = null; t.mm = null; t.data = null; t.rd = []; t.rp = []; t.bi = t.bar = null; TILES.delete(t.k);
}
const loadingTiles = new Set(); const LOAD_STAT = { ms: 0, n: 0 }; // registerTile & Co. je Kachel, summiert bis F3 abholt
async function loadTile(tx, tz) {
  const k = tkey(tx, tz); if (TILES.has(k) || loadingTiles.has(k) || !WIDX.tiles[k]) return; loadingTiles.add(k);
  try {
    const inf = WIDX.tiles[k];
    const [data, dem] = await Promise.all([inf[0] || inf[1] ? fetch(`data/tiles/${k}.json`).then(r => r.ok ? r.json() : {}) : Promise.resolve({}), inf[3] ? fetch(`data/dem/${k}.bin`).then(r => r.ok ? r.arrayBuffer() : null) : Promise.resolve(null)]);
    const l0 = performance.now(); // Arbeit nach dem Laden läuft außerhalb der Spielschleife (Promise): für F3 messen (#173)
    if (dem) { const u = new Uint16Array(dem); const f = new Float32Array(u.length); for (let i = 0; i < u.length; i++) f[i] = u[i] / 100 - 50; DEMT.set(k, f); DEMN.set(dkey(tx, tz), f); }
    for (const b of data.buildings || []) { markLandmark(b); markStadium(b); } // Wahrzeichen (#73): eigener Bau statt OSM-Klotz
    const t = { tx, tz, k, data, built: false }; TILES.set(k, t); registerTile(t); LOAD_STAT.ms += performance.now() - l0; LOAD_STAT.n++;
  } catch (e) { console.warn('Kachel', k, e); TILES.set(k, { tx, tz, k, data: {}, built: false, rd: [], rp: [] }); }
  finally { loadingTiles.delete(k); }
}
function withBuildSet(d, fn, grp = new THREE.Group()) {
  const saved = {}; for (const k of WKEYS) { saved[k] = CITY[k]; CITY[k] = d[k] || []; }
 const add = scene.add; scene.add = function (...o) { grp.add(...o); return this; };
  const L = OWN_LISTS(); const before = L.map(l => l.length);
  try { fn(); } finally { scene.add = add; for (const k of WKEYS) CITY[k] = saved[k]; }
  return { grp, owned: L.map((l, i) => l.slice(before[i])) };
}
function* buildTileGround(t) {
  const mul = groundMul(); const step = DEM.step * mul; const n = Math.round(TS / step); const drop = mul === 1 ? 0.03 : 0.06;
  const gg = new THREE.PlaneGeometry(TS, TS, n, n); gg.rotateX(-Math.PI / 2); gg.translate(t.tx * TS + TS / 2, 0, t.tz * TS + TS / 2);
  const pa = gg.attributes.position; for (let i = 0; i < pa.count; i++) { pa.setY(i, groundH(pa.getX(i), pa.getZ(i), mul) - drop); if ((i & 255) === 255) yield; } gg.computeVertexNormals();
  const nn = gg.attributes.normal, cc = new Float32Array(nn.count * 3), dirt = new THREE.Color(0x6e6a60), grass = new THREE.Color(0x5d7c3c), c = new THREE.Color(); for (let i = 0; i < nn.count; i++) { const k = clamp((1 - nn.getY(i) - 0.012) * 18, 0, 1); c.copy(dirt).lerp(grass, k); cc[i * 3] = c.r; cc[i * 3 + 1] = c.g; cc[i * 3 + 2] = c.b; } gg.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  const m = new THREE.Mesh(gg, GROUND_MAT); m.receiveShadow = true; scene.add(m); rayTargets.push(m);
}
let YC = 0; const BUILD_STEPS = ['ground', 'city', 'det', 'det2', 'park'];
const STEP_FN = { ground: t => buildTileGround(t), city: () => buildCity(), det: () => buildDetails(), det2: () => buildDetails2(), park: () => buildParked(), fence: () => buildFences() };
const _tileFrustum = new THREE.Frustum(), _tileProj = new THREE.Matrix4();
function updateTileVis() {
  camera.updateMatrixWorld();
  _tileProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _tileFrustum.setFromProjectionMatrix(_tileProj);
  const px = player.pos.x, pz = player.pos.z, nearR2 = sun.castShadow ? 22500 : 1600, maxR = (opts.view || 700) + 120, maxR2 = maxR * maxR;
  for (const [, t] of TILES) {
    if (!t.built || !t.grp) continue;
    const x0 = t.tx * TS, z0 = t.tz * TS, dx = Math.max(x0 - px, 0, px - (x0 + TS)), dz = Math.max(z0 - pz, 0, pz - (z0 + TS)), d2 = dx * dx + dz * dz;
    t.grp.visible = d2 < nearR2 || (d2 <= maxR2 && _tileFrustum.intersectsBox(t.box));
  }
}
function finishTile(t, grp, owned) { t.grp = grp; t.owned = owned; t.box = new THREE.Box3(new THREE.Vector3(t.tx * TS - 24, -40, t.tz * TS - 24), new THREE.Vector3((t.tx + 1) * TS + 24, 260, (t.tz + 1) * TS + 24)); scene.add(grp); t.built = true; t.mul = groundMul(); t.ms = Object.values(t.prof).reduce((a, b) => a + b, 0); }
function makeJob(t, far = false) { t.prof = {}; t.lod = far ? 'far' : 'near'; t.potato = !!opts.potato; return { t, steps: far ? ['ground', 'city'] : opts.potato ? ['ground', 'city', 'fence', 'park'] : BUILD_STEPS.slice(), gen: null, grp: new THREE.Group(), owned: OWN_LISTS().map(() => []) }; }
// Fernstufe nachrüsten: Details (Schilder, Zäune, Balkone, Gesimse, Möbel, Parkautos) in die vorhandene Gruppe bauen
function makeUpgrade(t) { return { t, steps: ['det', 'det2', 'park'], gen: null, grp: t.grp, owned: t.owned, upgrade: true }; }
// arbeitet am Job, bis das Zeitbudget (ms) verbraucht ist; true = Kachel fertig
function runJob(j, budget) {
  const t0 = performance.now(); const d = j.t.data; const any = !!(d.buildings || d.roads || d.green);
  while (j.steps.length) { const st = j.steps[0]; if (!j.gen) j.gen = (st === 'ground' || any) ? STEP_FN[st](j.t) : null; let done = !j.gen; const a = performance.now();
    while (!done) { BUILD_TILE = j.t; const s0 = performance.now(); const res = withBuildSet(d, () => { try { done = j.gen.next().done; } finally { BUILD_TILE = null; } }, j.grp); res.owned.forEach((o, i) => { if (o.length) j.owned[i].push(...o); }); const sl = performance.now() - s0; if (sl > BUILD_STAT.max) { BUILD_STAT.max = sl; BUILD_STAT.step = st; } if (performance.now() - t0 > budget) break; }
    j.t.prof[st] = (j.t.prof[st] || 0) + Math.round(performance.now() - a); if (done) { j.steps.shift(); j.gen = null; } if (performance.now() - t0 > budget) break; }
  if (j.steps.length) return false; if (j.upgrade) { j.t.lod = 'near'; j.t.ms = Object.values(j.t.prof).reduce((a, b) => a + b, 0); return true; } finishTile(j.t, j.grp, j.owned); return true;
}
function buildTileNow(t) { runJob(makeJob(t), Infinity); }
let job = null; // Kachel, die gerade schrittweise gebaut wird
let BUILD_BUDGET = 8, _smoothFt = 16.7; // ms Hauptthread je Bild für den Kachelbau, höchstens 8 (#173)
const BUILD_STAT = { ms: 0, max: 0, step: '' }; // Kachelbau im laufenden Bild (F3, G.PERF): Summe, längstes Stück ohne yield, dessen Schritt
function stepJob() { const b = opts.potato ? 4 : (_smoothFt > 26 ? 4.5 : BUILD_BUDGET); const t0 = performance.now(); const done = runJob(job, b); if (done) { job = null; refreshActive(); } BUILD_STAT.ms += performance.now() - t0; }
function cancelJob() { if (!job) return; const t = { built: true, grp: job.grp, owned: job.owned }; scene.add(job.grp); unbuildTile(t); job = null; }
function unbuildTile(t) { barrierDrop(t);
  if (!t.built) return; scene.remove(t.grp); const L = OWN_LISTS();
  L.forEach((l, i) => { const own = t.owned[i]; if (!own.length) return; const s = new Set(own); let w = 0; for (let r = 0; r < l.length; r++) if (!s.has(l[r])) l[w++] = l[r]; l.length = w; });
  disposeHierarchy(t.grp, { keep: x => x.isTexture && !(x.userData && x.userData.own) }); /* Kachel-Texturen kommen aus Caches (TEX, Fassaden, Gehweg), Speicherprobe #120: Zahl bleibt stabil; eigene markiert userData.own */
  t.grp = null; t.owned = null; t.built = false;
}
function rebuildAllTiles() { let n = 0; for (const [, t] of TILES) if (t.built && (t.mul !== groundMul() || !!t.potato !== !!opts.potato)) { unbuildTile(t); n++; } if (n) refreshActive(); }
function refreshActive() { roadsDrivable.length = 0; pedRoads.length = 0; for (const [, t] of TILES) if (t.built) { roadsDrivable.push(...t.rd); pedRoads.push(...t.rp); } }
function roadsNear(x, z, R, car) { const tx = Math.floor(x / TS), tz = Math.floor(z / TS); const out = []; for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) { const t = TILES.get(tkey(tx + a, tz + b)); if (t && t.rd) out.push(...(car ? t.rd : t.rp)); } return out.length ? out : (car ? roadsDrivable : pedRoads); }
const neighborsReady = (tx, tz) => { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const k = tkey(tx + a, tz + b); if (WIDX.tiles[k] && !TILES.has(k)) return false; } return true; };
let streamT = 0, buildT = 0;
function streamUpdate(dt, force = false) {
  const cx = POCKET ? POCKET.anchor[0] : player.car ? player.car.position.x : player.pos.x, cz = POCKET ? POCKET.anchor[1] : player.car ? player.car.position.z : player.pos.z;
  // Im Innenraum (Taschenraum, Boden auf y = 0) keine Ersatz-Bodenplatte: sie lag auf Geländehöhe des Eingangs − 12 m und damit
  // überall über 12 m Gelände (Bornheim) hüfthoch im Raum wie Dreckwasser (André 12.11.2026)
  farPlane.visible = !POCKET; farPlane.position.set(camera.position.x, TH(cx, cz) - 12, camera.position.z);
  const ptx = Math.floor(cx / TS), ptz = Math.floor(cz / TS);
  R_MESH = (opts.view || 700) > 550 ? 2 : 1;
  streamT -= dt; if (streamT <= 0 || force) { streamT = 0.3;
    const want = []; for (let a = -R_DATA; a <= R_DATA; a++) for (let b = -R_DATA; b <= R_DATA; b++) { const k = tkey(ptx + a, ptz + b); if (WIDX.tiles[k] && !TILES.has(k) && !loadingTiles.has(k)) want.push([a * a + b * b, ptx + a, ptz + b]); }
    want.sort((p, q) => p[0] - q[0]); for (const [, tx, tz] of want) { if (loadingTiles.size >= 6) break; loadTile(tx, tz); }
    let changed = false; for (const [, t] of TILES) if (t.built && (Math.abs(t.tx - ptx) > R_MESH + 1 || Math.abs(t.tz - ptz) > R_MESH + 1)) { unbuildTile(t); changed = true; }
    for (const [, t] of TILES) if (!t.built && t !== (job && job.t) && (Math.abs(t.tx - ptx) > R_DATA + 2 || Math.abs(t.tz - ptz) > R_DATA + 2)) unregisterTile(t); // Daten ferner Kacheln freigeben
    if (changed) refreshActive(); }
  if (job) { if (!job.upgrade && (Math.abs(job.t.tx - ptx) > R_MESH + 1 || Math.abs(job.t.tz - ptz) > R_MESH + 1)) cancelJob(); else { stepJob(); return; } }
  buildT -= dt; if (buildT > 0 && !force) return;
  let best = null, bd = 1e9; for (let a = -R_MESH; a <= R_MESH; a++) for (let b = -R_MESH; b <= R_MESH; b++) { const t = TILES.get(tkey(ptx + a, ptz + b)); if (!t || t.built || !neighborsReady(t.tx, t.tz)) continue; const d = a * a + b * b; if (d < bd) { bd = d; best = t; } }
  const lod = opts.lod !== false;
  if (!best && lod) { for (let a = -1; a <= 1 && !best; a++) for (let b = -1; b <= 1; b++) { const t = TILES.get(tkey(ptx + a, ptz + b)); if (t && t.built && t.lod === 'far') { best = t; break; } } if (best) { job = makeUpgrade(best); stepJob(); buildT = 0.05; return; } }
  if (best) { const far = lod && Math.max(Math.abs(best.tx - ptx), Math.abs(best.tz - ptz)) >= 2; if (bd === 0) { const t0 = performance.now(); buildTileNow(best); refreshActive(); BUILD_STAT.ms += performance.now() - t0; } /* Kachel unter dem Spieler am Stück: das Spiel steht ohnehin (hereReady); in Stücken hing die Probe wettbewerb (#173) */ else { job = makeJob(best, far); stepJob(); } buildT = 0.05; }
}
// Großer Hinweis mit Balken, solange der Boden unter dem Spieler noch nicht gebaut ist (Fortschritt: Kacheln im Umkreis)
const buildEl = $('build');
function showBuild(on) { if (!buildEl) return; if (!on) { buildEl.style.display = 'none'; return; } const x = player.car ? player.car.position.x : player.pos.x, z = player.car ? player.car.position.z : player.pos.z; const ptx = Math.floor(x / TS), ptz = Math.floor(z / TS); let tot = 0, bl = 0; for (let a = -R_MESH; a <= R_MESH; a++) for (let b = -R_MESH; b <= R_MESH; b++) { const k = tkey(ptx + a, ptz + b); if (!WIDX.tiles[k]) continue; tot++; const t = TILES.get(k); if (t && t.built) bl++; } buildEl.style.display = 'block'; buildEl.innerHTML = `<h3>BAUE STADT …</h3><div class="bar"><i style="width:${tot ? Math.round(100 * bl / tot) : 0}%"></i></div><p>${bl} von ${tot} Kacheln im Umkreis · einen Moment</p>`; }
// Spieler steht auf noch nicht gebautem Boden?
const hereReady = () => { if (inPocket(player.pos.x, player.pos.z)) return true; const x = player.car ? player.car.position.x : player.pos.x, z = player.car ? player.car.position.z : player.pos.z; const t = TILES.get(tkey(Math.floor(x / TS), Math.floor(z / TS))); return !t ? !inWorld(x, z) : t.built; };
async function streamInit(sx = player.pos.x, sz = player.pos.z) {
 const ptx = Math.floor(sx / TS), ptz = Math.floor(sz / TS); const el = $('loading');
  const need = []; for (let a = -R_DATA; a <= R_DATA; a++) for (let b = -R_DATA; b <= R_DATA; b++) if (WIDX.tiles[tkey(ptx + a, ptz + b)]) need.push([ptx + a, ptz + b]);
  for (let i = 0; i < need.length; i += 8) { await Promise.all(need.slice(i, i + 8).map(([tx, tz]) => loadTile(tx, tz))); const k = Math.min(need.length, i + 8); setLoading(`Lade Frankfurt … ${k} / ${need.length} Kacheln`, 0.3 + 0.5 * k / need.length); }
  let n = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const t = TILES.get(tkey(ptx + a, ptz + b)); /* Rest baut sich beim Spielen */ if (t && !t.built) { setLoading(`Baue Stadt … ${n + 1} / 9`, 0.8 + 0.2 * n / 9); await new Promise(r => setTimeout(r, 0)); /* in der Pause kann das Spiel die Kachel entladen haben (data = null, Probe gelaende 13.11.) */ if (TILES.get(t.k) !== t || !t.data || t.built) continue; buildTileNow(t); n++; await new Promise(r => setTimeout(r, 0)); } }
  refreshActive();
}
// Automatische Auflösung: hält die Bildrate auf schwachen Grafikkarten, indem weniger Pixel gerendert werden
let upT = 0, upOffered = false; let dynK = 1, dynBase = 0, dynSet = 0, dynLast = 0, dynAcc = 0, dynN = 0;
function dynRes() {
  const now = performance.now(), ft = now - dynLast; dynLast = now; if (document.hidden || ft > 250) return;
  _smoothFt = _smoothFt * 0.9 + ft * 0.1;
  if (!upOffered && started && !menuOpen && opts.quality !== 'ultra' && _smoothFt < 20) { upT += ft; if (upT > 30000) { upOffered = true; showMsg('LÄUFT FLÜSSIG – HÖHERE GRAFIKSTUFE MÖGLICH: EINSTELLUNGEN › GRAFIK', 6000, 'ok'); } } else upT = 0; // #163: 30 s über 50 fps → einmal anbieten, nie selbst hochstufen
  const pr = renderer.getPixelRatio(); if (Math.abs(pr - dynSet) > 1e-3) { dynBase = pr; dynK = 1; } // Einstellung wurde geändert
  if (opts.dynres === false) { if (dynK !== 1) { dynK = 1; renderer.setPixelRatio(dynBase); if (composer) composer.setPixelRatio(dynBase); } dynSet = renderer.getPixelRatio(); return; }
  dynAcc += ft; dynN++; if (dynAcc < 1000) { dynSet = renderer.getPixelRatio(); return; }
  const avg = dynAcc / dynN; dynAcc = 0; dynN = 0; const k0 = dynK;
  if (avg > 40 && dynK > 0.7) dynK = Math.max(0.7, dynK - 0.1); /* Untergrenze 0,7: darunter wird das Bild matschig (09.11.2026) */ else if (avg < 22 && dynK < 1) dynK = Math.min(1, dynK + 0.05);
  if (dynK !== k0) { renderer.setPixelRatio(dynBase * dynK); if (composer) composer.setPixelRatio(dynBase * dynK); }
  dynSet = renderer.getPixelRatio();
}
// Ein Klick: alles auf ganz sparsam für sehr schwache Rechner (z. B. Intel HD 400)
{ const b = $('o_potatobtn'); if (b) b.onclick = () => { Object.assign(opts, POTATO); opts.potatoManuell = true; for (const [id, k] of Object.entries(OPT_BIND)) { const el = $(id); if (el) { if (el.type === 'checkbox') el.checked = !!opts[k]; else el.value = opts[k]; } } for (const [id, k] of [['o_quality', 'quality'], ['o_shadows', 'shadows'], ['o_traffic', 'traffic']]) { const el = $(id); if (el) { if (el.type === 'checkbox') el.checked = !!opts[k]; else el.value = opts[k]; } } opts.qualityManuell = true; applyOpts(); rebuildAllTiles(); updateOptLabels(); showMsg('SPARMODUS FÜR SEHR SCHWACHE RECHNER', 1400); }; }
// Ein Klick: alles auf sparsam für schwache Grafikkarten
{ const b = $('o_lowgpu'); if (b) b.onclick = () => { Object.assign(opts, { quality: 'niedrig', shadows: false, ao: false, bloom: 0, view: Math.min(opts.view || 700, 350), scale: 0.85, peds: Math.min(opts.peds ?? 1, 0.6), traffic: Math.min(opts.traffic ?? 1, 0.7), dynres: true, lod: true }); for (const [id, k] of Object.entries(OPT_BIND)) { const el = $(id); if (el) { if (el.type === 'checkbox') el.checked = !!opts[k]; else el.value = opts[k]; } } for (const [id, k] of [['o_quality', 'quality'], ['o_shadows', 'shadows'], ['o_traffic', 'traffic']]) { const el = $(id); if (el) { if (el.type === 'checkbox') el.checked = !!opts[k]; else el.value = opts[k]; } } opts.qualityManuell = true; applyOpts(); updateOptLabels(); showMsg('SPARMODUS AKTIV', 1200); }; }
addEventListener('wheel', e => { if (mapOpen) { mapZoom = clamp(mapZoom * (e.deltaY > 0 ? 1.25 : 0.8), 600, 16000); drawBigMap(); } });

// ---------- Start ----------
let started = false, lastT = performance.now() / 1000, walkT = 0, mmT = 0, autoT = 0;
$('bm').onclick = () => { player.female = false; $('bm').classList.add('sel'); $('bf').classList.remove('sel'); };
$('bf').onclick = () => { player.female = true; $('bf').classList.add('sel'); $('bm').classList.remove('sel'); };
buildSky();
await streamInit();
loadOpts(); applyTime();
// Spielstand als Datei: kein Konto nötig, auf jedem Gerät wieder ladbar
function exportSave() { saveGame(); const data = localStorage.getItem('notgta.save'); if (!data) return; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' })); a.download = 'bornheim-spielstand-' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
function importSave(file) { const fr = new FileReader(); fr.onload = () => { try { const d = JSON.parse(fr.result); if (!d || typeof d !== 'object' || !d.pos) throw new Error('kein Spielstand'); localStorage.setItem('notgta.save', JSON.stringify(d)); if (started) { loadGame(); closeMenu(); } else { $('cont').style.display = 'inline-block'; setLoading('Spielstand importiert. Mit „Fortsetzen“ weiterspielen.'); } } catch (e) { alert('Diese Datei ist kein gültiger Spielstand.'); } }; fr.readAsText(file); }
$('m_export').onclick = exportSave; $('m_import').onclick = $('s_import').onclick = () => $('importfile').click(); $('importfile').onchange = e => { if (e.target.files[0]) importSave(e.target.files[0]); e.target.value = ''; };
$('m_home').onclick = () => { if (!started || confirm('Zur Startseite? Nicht gespeicherter Fortschritt geht verloren.')) location.href = './'; };
$('s_opts').onclick = openMenu;
{ const N = { niedrig: 'Niedrig', mittel: 'Mittel', hoch: 'Hoch', ultra: 'Ultra' }; const sug = autoQuality(GPU); $('gpuinfo').textContent = (QUALITY_AUTO ? 'Grafikstufe: ' + N[QUALITY] + ' (automatisch, ändern unter Einstellungen › Grafik)' : 'Grafikstufe: ' + (N[QUALITY] || QUALITY) + ' (von dir gewählt, ändern unter Einstellungen › Grafik)') + (GPU ? ' · ' + GPU.replace(/ANGLE \((.*)\)/, '$1').slice(0, 70) : '') + (/intel/i.test(GPU) && !/\barc\b/i.test(GPU) ? ' · Integrierte Grafik: „Mittel“ empfohlen; Hoch/Ultra kosten hier viel Bildrate' : ''); }
// Handy-Hinweis kommt jetzt aus play.html, bevor überhaupt etwas geladen wird
$('m_resume').onclick = () => { closeMenu(); if (started) lockMouse(); }; $('m_save').onclick = () => { saveGame(); closeMenu(); }; $('m_load').onclick = () => { if (confirm('Letzten Spielstand laden? Nicht gespeicherter Fortschritt geht verloren.')) { loadGame(); closeMenu(); } }; $('m_restart').onclick = () => { if (confirm('Neu starten? Nicht gespeicherter Fortschritt geht verloren.')) location.reload(); };
for (const id of ['o_sens', 'o_vol', 'o_shadows', 'o_time']) $(id).oninput = () => { opts.sens = +$('o_sens').value; opts.vol = +$('o_vol').value; opts.shadows = $('o_shadows').checked; opts.timeSpeed = +$('o_time').value; applyOpts(); };
$('o_hour').oninput = () => { world.hour = +$('o_hour').value; applyTime(); };
const OPT_BIND = { o_mapnorth: 'mapNorth', o_potato: 'potato', o_dynres: 'dynres', o_lod: 'lod', o_ao: 'ao', o_dynlights: 'dynlights', o_scale: 'scale', o_view: 'view', o_bloom: 'bloom', o_fps: 'fps', o_fov: 'fov', o_camdist: 'camdist', o_invy: 'invy', o_shake: 'shake', o_gyro: 'gyro', o_vibrate: 'vibrate', o_peds: 'peds', o_police: 'police', o_god: 'god', o_ammo: 'ammo', o_fall: 'fall', o_grip: 'grip', o_minimap: 'minimap', o_hud: 'hud', o_tts: 'tts', o_demos: 'demos' };
for (const [id, k] of Object.entries(OPT_BIND)) { const el = $(id); if (!el) continue; el.oninput = el.onchange = () => { opts[k] = el.type === 'checkbox' ? el.checked : +el.value; if (k === 'potato') opts.potatoManuell = el.checked; /* #173: nur ein gesetzter Haken bleibt gespeichert */ if (k === 'police' && !opts.police) player.wanted = 0; applyOpts(); updateOptLabels(); }; }
function updateOptLabels() { for (const el of document.querySelectorAll('#menu input[type=range]')) { const out = el.parentElement.querySelector('output'); if (out) out.textContent = el.dataset.pct ? Math.round(el.value * 100) + ' %' : el.value; } }
// Pausemenü (André 12.11.2026): oben Themen-Reiter, links Einstellungen untereinander; ein Umschalter für beide Leisten
const MENU_TAB = tab => { for (const b of document.querySelectorAll('#menu [data-tab]')) if (b.tagName === 'BUTTON') b.classList.toggle('on', b.dataset.tab === tab); for (const p of document.querySelectorAll('#menu .pane')) p.style.display = p.dataset.tab === tab ? 'block' : 'none'; if (tab === 'schnell') quickSync(); if (tab === 'karte') { pmCenter(); drawPMap(); } };
for (const t of document.querySelectorAll('#menu .tabs button, #menu .sidetabs button')) t.onclick = () => MENU_TAB(t.dataset.tab);
// Schnell: Abbilder der häufig gebrauchten Regler; jede Änderung geht an das Original (dort hängt die Logik)
const QUICK = [['Grafik', ['o_quality', 'o_view']], ['Welt', ['o_hour', 'o_time', 'o_weather', 'o_traffic', 'o_peds', 'o_police']], ['Spiel', ['o_ammo', 'o_god', 'o_vol']]];
const quickPairs = [];
{ const q = $('quick'); if (q) for (const [head, ids] of QUICK) { const h = document.createElement('div'); h.className = 'qh'; h.textContent = head; q.appendChild(h);
  for (const id of ids) { const o = $(id); if (!o) continue; const lab = o.closest('label'); const name = lab ? [...lab.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim() : id;
    const c = o.cloneNode(true); c.id = 'q_' + id; const box = document.createElement('div'); box.className = 'qc'; const l = document.createElement('label'); l.append(name + ' ');
    let out = null; if (c.type === 'range') { const s = document.createElement('span'); out = document.createElement('output'); s.append(c, out); l.append(s); } else l.append(c); box.appendChild(l); q.appendChild(box);
    const show = () => { if (out) out.textContent = c.dataset.pct ? Math.round(c.value * 100) + ' %' : c.value; };
    const push = () => { if (c.type === 'checkbox') o.checked = c.checked; else o.value = c.value; o.dispatchEvent(new Event('input', { bubbles: true })); o.dispatchEvent(new Event('change', { bubbles: true })); show(); };
    c.addEventListener('input', push); c.addEventListener('change', push); quickPairs.push([o, c, show]); } } }
function quickSync() { for (const [o, c, show] of quickPairs) { if (c.type === 'checkbox') c.checked = o.checked; else c.value = o.value; show(); } }
MENU_HOOKS.push(() => { MENU_TAB('schnell'); setTimeout(quickSync, 0); }); /* synchron: F1 und Handy-Karte schalten danach auf ihren Reiter */
// Karte im Menü: springen, U-Bahn und Bus fahren
let pmX = 0, pmZ = 0, pmSpan = 3000; const PM_OFF = new Set(); const pmHits = [];
// Übersicht der ganzen Stadt (data/overview.json, tools/build_overview.py): Hintergrund für Gegenden ohne geladene Kachel
let OVERVIEW = null; fetch('data/overview.json').then(r => r.ok ? r.json() : null).then(d => { OVERVIEW = d; }).catch(() => {});
function drawOverview(c2, P, W, H, sc) { if (!OVERVIEW) return; const vis = p => { const [x, y] = P(p[0][0], p[0][1]); return x > -3000 && y > -3000 && x < W + 3000 && y < H + 3000; };
  const poly = (arr, col) => { c2.fillStyle = col; for (const p of arr) { if (!vis(p)) continue; c2.beginPath(); p.forEach((q, i) => { const [x, y] = P(q[0], q[1]); if (i) c2.lineTo(x, y); else c2.moveTo(x, y); }); c2.fill(); } };
  const line = (arr, col, w) => { c2.strokeStyle = col; c2.lineWidth = w; c2.beginPath(); for (const p of arr) { if (!vis(p)) continue; p.forEach((q, i) => { const [x, y] = P(q[0], q[1]); if (i) c2.lineTo(x, y); else c2.moveTo(x, y); }); } c2.stroke(); };
  poly(OVERVIEW.wood, '#22351f'); poly(OVERVIEW.green, '#2c4a2a'); poly(OVERVIEW.water, '#1d3d5c');
  if (sc > 0.08) line(OVERVIEW.r3, '#3a3d44', Math.max(1, 5 * sc)); line(OVERVIEW.r2, '#55595f', Math.max(1, 8 * sc)); line(OVERVIEW.r1, '#8a8478', Math.max(1.4, 12 * sc)); c2.setLineDash([4, 3]); line(OVERVIEW.rail, '#6c6c74', 1); c2.setLineDash([]); }
// U-Bahn-Linie: echter Streckenverlauf (Feld g aus tools/metro_geometry.py), sonst Station zu Station
function drawMetroLine(c2, P, l) { c2.strokeStyle = l.color || '#888'; c2.beginPath(); if (l.g && l.g.length) { for (const w of l.g) w.forEach((q, i) => { const [x, y] = P(q[0], q[1]); if (i) c2.lineTo(x, y); else c2.moveTo(x, y); }); } else { let f = true; for (const id of l.stops) { const s = INTERIORS.ST.get(id); if (!s) continue; const [x, y] = P(s.p[0], s.p[1]); if (f) c2.moveTo(x, y); else c2.lineTo(x, y); f = false; } } c2.stroke(); }
function pmCenter() { pmX = player.pos.x; pmZ = player.pos.z; }
function pmStops() { const seen = new Map(); for (const l of BUSLINES) (l.s || []).forEach(([x, z], i) => { const k = Math.round(x / 25) + ',' + Math.round(z / 25); if (!seen.has(k)) seen.set(k, { x, z, lines: new Set(), n: '' }); const s = seen.get(k); s.lines.add(l.ref); if (!s.n && l.sn) s.n = l.sn[i] || ''; }); return [...seen.values()]; }
let PM_STOPS = null;
function drawPMap() {
  const cv = $('pmap'); if (!cv || !cv.clientWidth) return; const W = cv.width = cv.clientWidth, H = cv.height = cv.clientHeight; const c2 = cv.getContext('2d'); const sc = W / pmSpan; const cx0 = pmX - pmSpan / 2, cz0 = pmZ - pmSpan * H / W / 2; const P = (x, z) => [(x - cx0) * sc, (z - cz0) * sc];
  c2.fillStyle = '#111'; c2.fillRect(0, 0, W, H); pmHits.length = 0; drawOverview(c2, P, W, H, sc);
  for (const [, t] of TILES) { if (!t.data) continue; const [x, y] = P(t.tx * TS, t.tz * TS); if (x > W || y > H || x + TS * sc < 0 || y + TS * sc < 0) continue; c2.drawImage(t.mm || (t.mm = tileMap(t)), x, y, TS * sc, TS * sc); }
  const M = INTERIORS && INTERIORS.metro;
  if (M && $('pm_u').checked) { const ST = INTERIORS.ST; c2.lineWidth = 3;
    for (const l of M.lines) { if (PM_OFF.has(l.ref)) continue; drawMetroLine(c2, P, l); } void ST;
    c2.font = 'bold 12px system-ui'; for (const s of M.stations) { if (s.lines.every(r => PM_OFF.has(r))) continue; const [x, y] = P(s.p[0], s.p[1]); if (x < -10 || y < -10 || x > W + 10 || y > H + 10) continue; c2.fillStyle = '#fff'; c2.strokeStyle = '#1e5fb4'; c2.lineWidth = 3; c2.beginPath(); c2.arc(x, y, 6, 0, 7); c2.fill(); c2.stroke(); if (pmSpan < 9000) { c2.fillStyle = '#fff'; c2.fillText(s.name, x + 9, y + 4); } pmHits.push({ x, y, kind: 'u', s, lw: pmSpan < 9000 ? c2.measureText(s.name).width + 9 : 0 }); } }
  if ($('pm_b').checked && pmSpan < 7000) { PM_STOPS = PM_STOPS || pmStops(); c2.font = '11px system-ui'; for (const s of PM_STOPS) { const [x, y] = P(s.x, s.z); if (x < 0 || y < 0 || x > W || y > H) continue; c2.fillStyle = '#2e9c3a'; c2.fillRect(x - 4, y - 4, 8, 8); if (pmSpan < 4500) { c2.fillStyle = '#bfe8c4'; c2.fillText((s.n ? s.n + ' · ' : '') + [...s.lines].slice(0, 4).join(' '), x + 6, y + 4); } pmHits.push({ x, y, kind: 'b', s, lw: pmSpan < 4500 ? c2.measureText((s.n ? s.n + ' · ' : '') + [...s.lines].slice(0, 4).join(' ')).width + 6 : 0 }); } }
  for (const f of MAP_HOOKS) f(c2, P);
  const [px, py] = P(player.pos.x, player.pos.z); c2.fillStyle = '#ffd84a'; c2.beginPath(); c2.arc(px, py, 7, 0, 7); c2.fill(); c2.strokeStyle = '#000'; c2.lineWidth = 2; c2.stroke();
  c2.fillStyle = '#fff'; c2.font = '13px system-ui'; c2.fillText((pmSpan / 1000).toFixed(1) + ' km Breite · ' + Math.floor(world.hour) + ':' + String(Math.floor(world.hour % 1 * 60)).padStart(2, '0') + ' Uhr · ' + (player.money || 0) + ' €', 12, 20);
}
{ const box = $('pm_lines'); const M = () => INTERIORS && INTERIORS.metro; const fill = () => { if (!box || box.childElementCount || !M()) return; for (const l of M().lines) { const lb = document.createElement('label'); const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = true; cb.onchange = () => { if (cb.checked) PM_OFF.delete(l.ref); else PM_OFF.add(l.ref); drawPMap(); }; lb.append(cb, ' '); const sw = document.createElement('b'); sw.textContent = l.ref; sw.style.color = l.color || '#fff'; lb.append(sw); box.appendChild(lb); } };
  MENU_HOOKS.push(fill); for (const id of ['pm_u', 'pm_b']) if ($(id)) $(id).onchange = drawPMap; }
async function pmJump(x, z, why, cost, minutes) {
  if (cost && (player.money || 0) < cost) { showMsg('ZU WENIG GELD (' + cost + ' €)', 1600); return; } if (cost) player.money -= cost; closeMenu(); if (player.car) exitCar();
  const ov = document.createElement('div'); ov.style.cssText = 'position:fixed;inset:0;background:#05070acc;color:#fff;display:flex;align-items:center;justify-content:center;z-index:46;font:700 26px system-ui'; ov.textContent = why; document.body.appendChild(ov);
  try { await streamInit(x, z); } catch (e) { /* Kacheln laden weiter im Hintergrund */ }
  let fx = x, fz = z; for (let r = 0; r < 30 && solidAt(fx, fz) >= 0; r += 2) { fx = x + r; fz = z + r * 0.5; } player.pos.set(fx, surfAt(fx, fz, 1e4), fz); if (player.mesh) player.mesh.position.copy(player.pos); player.vy = 0;
  if (minutes) world.hour = (world.hour + minutes / 60) % 24; ov.remove(); }
{ const cv = $('pmap'); let drag = false, moved = 0, lx = 0, ly = 0;
  if (cv) { cv.addEventListener('mousedown', e => { drag = true; moved = 0; lx = e.clientX; ly = e.clientY; });
    addEventListener('mousemove', e => { if (!drag) return; const k = pmSpan / (cv.clientWidth || 600); pmX -= (e.clientX - lx) * k; pmZ -= (e.clientY - ly) * k; moved += Math.abs(e.clientX - lx) + Math.abs(e.clientY - ly); lx = e.clientX; ly = e.clientY; drawPMap(); });
    addEventListener('mouseup', e => { if (!drag) return; drag = false; if (moved > 6 || e.target !== cv) return; pmTap(e.clientX, e.clientY); });
    function pmTap(clX, clY) { const r = cv.getBoundingClientRect(); const mx = (clX - r.left) * cv.width / r.width, my = (clY - r.top) * cv.height / r.height;
      /* #98: Ziel trifft auch über die Beschriftung rechts vom Punkt; vorher nur 12 px um den Punkt, ein Klick aufs Namensschild sprang an die Stelle statt zu fahren */
      let hit = null, hd = 16; for (const h of pmHits) { const onLabel = h.lw && mx >= h.x && mx <= h.x + h.lw && Math.abs(my - h.y) <= 9; const d = onLabel ? Math.min(Math.hypot(h.x - mx, h.y - my), 15.9) : Math.hypot(h.x - mx, h.y - my); if (d < hd) { hd = d; hit = h; } }
      if (hit && hit.kind === 'u') { const M = INTERIORS.metro; let from = null, fd = 1e12; for (const s of M.stations) { const d = Math.hypot(s.p[0] - player.pos.x, s.p[1] - player.pos.z); if (d < fd && s.id !== hit.s.id) { fd = d; from = s; } } if (from) { closeMenu(); if (player.car) exitCar(); INTERIORS.ride(from, hit.s); } return; }
      if (hit && hit.kind === 'b') { const km = Math.hypot(hit.s.x - player.pos.x, hit.s.z - player.pos.z) / 1000; pmJump(hit.s.x, hit.s.z, '🚌 Bus fährt … ' + Math.max(3, Math.round(km * 3)) + ' Minuten', 2.8, Math.max(3, km * 3)); return; }
      const sc = pmSpan / cv.width; pmJump(pmX - pmSpan / 2 + mx * sc, pmZ - pmSpan * cv.height / cv.width / 2 + my * sc, '📍 Springe …', 0, 0); }
    cv.addEventListener('wheel', e => { e.preventDefault(); pmSpan = clamp(pmSpan * (e.deltaY > 0 ? 1.2 : 1 / 1.2), 300, 30000); drawPMap(); }, { passive: false });
    cv.addEventListener('dblclick', () => { pmCenter(); drawPMap(); });
    // Touch: ein Finger zieht, zwei Finger zoomen, kurzes Tippen wirkt wie ein Klick
    let pd = 0, tx = 0, ty = 0;
    cv.addEventListener('touchstart', e => { e.preventDefault(); if (e.touches.length === 1) { drag = true; moved = 0; lx = tx = e.touches[0].clientX; ly = ty = e.touches[0].clientY; } else if (e.touches.length === 2) { drag = false; moved = 99; pd = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); } }, { passive: false });
    cv.addEventListener('touchmove', e => { e.preventDefault(); if (e.touches.length === 1 && drag) { const t0 = e.touches[0]; const k = pmSpan / (cv.clientWidth || 600); pmX -= (t0.clientX - lx) * k; pmZ -= (t0.clientY - ly) * k; moved += Math.abs(t0.clientX - lx) + Math.abs(t0.clientY - ly); lx = t0.clientX; ly = t0.clientY; drawPMap(); } else if (e.touches.length === 2 && pd > 10) { const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); if (d > 10) { pmSpan = clamp(pmSpan * pd / d, 300, 30000); pd = d; drawPMap(); } } }, { passive: false });
    cv.addEventListener('touchend', e => { e.preventDefault(); const tap = drag && moved <= 10 && !e.touches.length; drag = false; pd = 0; if (tap) pmTap(tx, ty); }, { passive: false }); } }
// Suche in der Menükarte: Straßen der geladenen Gegend und alle U-Bahn-Stationen
function pmPlaces() { const out = new Map(); const M = INTERIORS && INTERIORS.metro; if (M) for (const s of M.stations) out.set('🚇 ' + s.name, { x: s.p[0], z: s.p[1], st: s }); for (const r of WORLD.roads) { if (!r || !r.n || out.has(r.n)) continue; const m = r.p[Math.floor(r.p.length / 2)]; out.set(r.n, { x: m[0], z: m[1] }); } return out; }
{ const q = $('pm_q'), dl = $('pm_ql'); if (q && dl) { let P = new Map();
  MENU_HOOKS.push(() => { P = pmPlaces(); dl.replaceChildren(...[...P.keys()].sort((a, b) => a.localeCompare(b, 'de')).slice(0, 1500).map(k => Object.assign(document.createElement('option'), { value: k }))); });
  const go = () => { const v = q.value.trim().toLowerCase(); if (!v) return; let hit = null; for (const [k, p] of P) if (k.toLowerCase() === v || k.toLowerCase().replace('🚇 ', '') === v) { hit = p; break; } if (!hit) for (const [k, p] of P) if (k.toLowerCase().includes(v)) { hit = p; break; } if (!hit) { showMsg('NICHT GEFUNDEN', 1200); return; } pmX = hit.x; pmZ = hit.z; pmSpan = Math.min(pmSpan, 1500); drawPMap(); };
  q.addEventListener('change', go); q.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { go(); const v = q.value.trim().toLowerCase(); const p = [...P].find(([k]) => k.toLowerCase().includes(v)); if (p && e.shiftKey) pmJump(p[1].x, p[1].z, '📍 Springe …', 0, 0); } }); } }
/* F1: Menü direkt auf der Hilfe öffnen */ addEventListener('keydown', e => { if (e.code !== 'F1' || !started) return; e.preventDefault(); if (!menuOpen) openMenu(); MENU_TAB('hilfe'); });
if ($('m_creative')) $('m_creative').onclick = () => { closeMenu(); if (started) toggleCreative(); };
$('o_quality').onchange = () => { const before = opts.quality; opts.quality = $('o_quality').value; opts.qualityManuell = true; applyOpts(); if ((before === 'niedrig') !== (opts.quality === 'niedrig')) showMsg('Texturdetails nach Neustart', 1800); };
$('o_weather').onchange = () => { opts.weather = $('o_weather').value; if (opts.weather !== 'auto') weather.kind = opts.weather; applyOpts(); };
$('o_traffic').oninput = () => { opts.traffic = +$('o_traffic').value; applyOpts(); };
makeRain();
$('cont').style.display = hasSave() ? 'inline-block' : 'none'; try { const w = JSON.parse(localStorage.getItem('notgta.save') || '{}').when; if (w) { const m = Math.round((Date.now() - w) / 60000); $('cont').textContent = 'Fortsetzen (' + (m < 1 ? 'gerade eben' : m < 60 ? 'vor ' + m + ' min' : m < 1440 ? 'vor ' + Math.round(m / 60) + ' h' : 'vor ' + Math.round(m / 1440) + ' Tagen') + ')'; } } catch (e) {}
$('cont').onclick = () => { let d = null; try { d = JSON.parse(localStorage.getItem('notgta.save')); } catch (e) {} if (d && typeof d === 'object') player.female = !!d.female; $('go').onclick(); if (d) loadGame(); world.hour = 8; applyTime(); /* auch beim Fortsetzen morgens um 8 (André 12.11.2026) */ };
// Start: mitten auf der Berger Straße, auf dem Gehweg
{ const bs = CITY.roads.filter(r => r.n === 'Berger Straße').sort((a, b) => Math.hypot(a.p[0][0] - 150, a.p[0][1] + 100) - Math.hypot(b.p[0][0] - 150, b.p[0][1] + 100)); const r = bs[0] || CITY.roads[0]; const [ax, az] = r.p[0], [bx, bz] = r.p[1 % r.p.length];
  const l = Math.hypot(bx - ax, bz - az) || 1; const nx = -(bz - az) / l, nz = (bx - ax) / l; player.pos.set((ax + bx) / 2 + nx * 2, 0, (az + bz) / 2 + nz * 2); player.pos.y = TH(player.pos.x, player.pos.z); camYaw.v = Math.atan2(bx - ax, bz - az) + Math.PI; }
while (solidAt(player.pos.x, player.pos.z) >= 0) player.pos.x += 3;
const X = { FAR_HAZE, sun, THREE, scene, camera, renderer, player, peds, cars, shootables, pickups, FX, puff, losFactor, keys, camYaw, camPitch, opts, world, weather, CITY, TH, solidAt, solidAtH, floorAt, nearestEdge, edgeNormal, moveWithCollision, makeHuman, makeCar, makeAmbulance, dropRider, tipBike, rehome, spawnCar, spawnPedAt, playAnim, animateWalk, damage, explode, burst, smoke, wakeParked, wakeParkedRay, sfx, SND, showMsg, raiseWanted, camShake, freeSkel, canvasTex, tracerMat, makeGun, dentCar, rnd, clamp, pick, lerpAngle, distSegSq, pointInPoly, randomRoadPoint, roadsDrivable, driveCar, carFx, carTerrain, exitCar, syncHand, CHAR, coneTex, hurtPlayer, card, closeMenu, saveGame, lockMouse, disposeCar,
  listeners: [], mmHooks: MM_HOOKS, mapHooks: MAP_HOOKS, menuHooks: MENU_HOOKS, rallyLimit: 8, get creative() { return creative; }, creativeSpawnerActive, pedRoads: () => pedRoads, roadsNear: (x, z, R, car) => roadsNear(x, z, R, car), streetAt: (x, z) => streetNameAt(x, z), barrierNear: (x, z, r) => barrierHit(x, z, r), storyBusy: () => STORY ? STORY.busy : false, openMenu, menuTab: t => MENU_TAB(t), get started() { return started; }, menuOpen: () => menuOpen };
var PFUETZEN = initLichtpfuetzen(X); var DUNST = initDunst(X); var WPN = initWeapons(X); var DEMO = initDemo(X, WPN); var FIRE = initFire(X, WPN, DEMO); var STORY = initStory(X, WPN, DEMO, FIRE); var SHOPS = initShops(X, WPN); Object.assign(X, { wachen: WACHEN, nearestRoadDir, pushOffRoads, setPocket: p => { POCKET = p; camera.userData.init = false; }, inPocket, streamInit, roofHeight, WORLD, TILES, TS, WIDX }); var INTERIORS = initInteriors(X, WPN, DEMO, SHOPS); var PROGRESS = initProgress(X); var HELI = initHeli(X); var EULEN = null; try { EULEN = initEulen(X); } catch (e) { console.warn('Frischlufteulen aus', e); } var VOKA = null; var LAUF = null; try { VOKA = initVokabaum(X); try { LAUF = initLaufrunden(X); X.VOKA_BUSY = () => !!(VOKA && (VOKA.mission || VOKA.ped)); X.PROGRESS_GAIN = (n, why) => PROGRESS.gain(n, why); } catch (e) { console.warn('Laufrunden', e); LAUF = null; } } catch (e) { console.warn('Vokabaum-Mission aus', e); } var RASEN = null; try { Object.assign(X, { LOW_GFX, WEAK_GPU, waterAt, deckAt, rasenRoad: (x, z) => onOtherRoad(x, z, null, 0.3) }); RASEN = initRasen(X); } catch (e) { console.warn('Rasen aus', e); } var ZIVIL = null; try { ZIVIL = initZivilcourage(X); } catch (e) { console.warn('Zivilcourage aus', e); } var LANDMARKS = initLandmarks(X); initGraeber(X); var WAHRZ = initWahrzeichen(X); /* #150: Handy (H) nach Sunset */ var PHONE = null; try { const SY = { STORY, DEMO, PROGRESS, LAUF, VOKA, get EULEN() { return EULEN; } }; initMenuNeu(X, SY); PHONE = initPhone(X, SY); } catch (e) { console.warn('Handy/Menü', e); }
for (let i = 0; i < 200 && cars.length < 60; i++) spawnCar(false, player.pos, 10, 260);
for (let i = 0; i < 55; i++) spawnPed(null);
spawnPickups(40);
spawnTrams(4);
setLoading(`Frankfurt bereit: ${Object.keys(WIDX.tiles).length} Kacheln, ${CITY.buildings.length} Gebäude in der Nähe geladen`, 1); $('go').disabled = false; $('cont').disabled = false; document.getElementById('loadwrap').classList.add('done');
$('go').onclick = () => { audioInit(); world.hour = 8; applyTime(); /* jedes neue Spiel beginnt morgens um 8 */
  player.mesh = makeHuman(player.female, { model: player.female ? 'hero_woman' : 'hero_man', keepColors: true, shadow: true, top: player.female ? 0xd9403c : 0x2b3a67, pants: 0x222222, style: 'jacket', hair: player.female ? 'long' : 'short' }); player.mesh.userData.aiming = false;
  const gun = makeGun(); player.mesh.userData.hand.add(gun); player.mesh.userData.gun = gun; player.mesh.position.copy(player.pos); scene.add(player.mesh);
  whoEl.textContent = player.female ? '♀ Sie' : '♂ Er'; $('start').style.display = 'none'; started = true; window.__started = true; lockMouse(); WPN.attach(); setTimeout(() => STORY.resume(), 1500);
};

// ---------- Schleife ----------
const _nearCars = [];
function update(dt) {
  ANIM_DT = dt;
  dynRes(); if (!started || menuOpen) return; streamUpdate(dt); if (!hereReady()) { showBuild(true); waitMsg = true; return; } else if (waitMsg) { waitMsg = false; showBuild(false); } updateWeather(dt); if (mapOpen && Math.floor(worldT * 2) !== Math.floor((worldT - dt) * 2)) drawBigMap(); worldT += dt; world.hour = (world.hour + dt * world.speed) % 24; applyTime();
  const emI = world.night ? 1.0 : 0.25 * (1 - world.day); for (const o of nightOnly) o.visible = world.night; for (const m of emissiveMats) m.emissiveIntensity = emI; for (const m of sharedEmissiveMats) m.emissiveIntensity = emI;
  if (Math.floor(worldT * 4) !== sigTick) { sigTick = Math.floor(worldT * 4); /* Ampelfarben mit 4 Hz statt jedes Bild hochladen */ for (const lm of signalMeshes) { const L = lm.userData.lights; const ph = worldT % 8; for (let i = 0; i < L.length; i++) { const l = L[i]; const red = signalRed(l.hd, worldT); const amber = !red && ph > 6.6, redAmber = red && ph > 7.2; const on = l.k === 0 ? red : l.k === 1 ? (amber || redAmber) : (!red && !amber); lm.setColorAt(i, SIG_C[l.k][on ? 1 : 0]); } lm.instanceColor.needsUpdate = true; } }
  const ctrl = { fwd: keys.KeyW || keys.ArrowUp, back: keys.KeyS || keys.ArrowDown, left: keys.KeyA || keys.ArrowLeft, right: keys.KeyD || keys.ArrowRight, brake: keys.Space, run: keys.ShiftLeft || keys.ShiftRight };
  if (player.dead) { if (keys.Enter) respawn(); }
  else if (player.car) {
    driveCar(player.car, dt, ctrl); if (player.car) player.pos.copy(player.car.position); /* driveCar kann das Auto zerstören und aussteigen lassen (Explosion, Sturz) */
    player.aimT = Math.max(0, (player.aimT || 0) - dt);
    if (player.car && player.car.userData.bike) { const bu = player.car.userData, m = player.mesh, mu = m.userData; const zOff = bu.moto ? -0.22 : -0.24; m.position.copy(player.car.position); m.position.y += bu.moto ? -0.02 : 0.05; m.position.x += Math.sin(bu.heading) * zOff; m.position.z += Math.cos(bu.heading) * zOff; m.rotation.x = player.car.rotation.x; m.rotation.z = player.car.children[0] ? player.car.children[0].rotation.z : 0; m.rotation.y = bu.heading; player.yaw = bu.heading; walkT += dt * Math.abs(bu.speed) * 0.5;
      const aiming = (!!player.aimHold || player.aimT > 0 || WPN.trigger) && WPN.canAim() && !creativeSpawnerActive(); mu.aiming = aiming;
      const rel = ((camYaw.v - bu.heading + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      poseBikeRider(m, !!bu.moto, walkT, aiming, rel, camPitch.v);
      mu.recoil = (mu.recoil || 0) * 0.75; } // Figur sitzt realistisch im Sattel und kann in jede Richtung zielen/schießen
    if (player.car && !(player.aimHold || player.aimT > 0 || WPN.trigger) && performance.now() - (camYaw.lastMove || 0) > 1500 && Math.abs(player.car.userData.speed) > 2) { camYaw.v = lerpAngle(camYaw.v, player.car.userData.heading + (player.car.userData.speed < 0 ? Math.PI : 0), Math.min(1, dt * 2.5)); camPitch.v += (0.22 - camPitch.v) * Math.min(1, dt); }
  } else {
    const wy = !creative.on ? waterAt(player.pos.x, player.pos.z, player.pos.y) : null;
    const swimming = wy !== null;
    const speed = swimming ? (ctrl.run ? 3.2 : 2.1) : (ctrl.run ? 7.5 * ((X.perks && X.perks.run) || 1) : 3.6); let mx = 0, mz = 0;
    if (ctrl.fwd) mz += 1; if (ctrl.back) mz -= 1; if (ctrl.left) mx -= 1; if (ctrl.right) mx += 1;
    const len = Math.hypot(mx, mz); const moving = len > 0;
    if (moving) { mx /= len; mz /= len; const s = Math.sin(camYaw.v), c = Math.cos(camYaw.v); const wx = -mx * c + mz * s, wz = mx * s + mz * c; const csp = creative.on ? (ctrl.run ? 24 : 12) : speed; moveWithCollision(player.pos, wx * csp * dt, wz * csp * dt, 0.35, swimming ? wy : player.pos.y); player.yaw = lerpAngle(player.yaw, Math.atan2(wx, wz), 1 - Math.exp(-13 * dt)); }
    const gy = floorAt(player.pos.x, player.pos.z, swimming ? wy + 0.5 : player.pos.y);
    if (creative.on) { player.swim = false; const fly = (keys.Space ? 1 : 0) - (keys.ControlLeft ? 1 : 0) - (keys.ShiftLeft && !ctrl.fwd && !ctrl.back && !ctrl.left && !ctrl.right ? 1 : 0); player.pos.y = Math.max(gy, player.pos.y + fly * 9 * dt); player.vy = 0; player.airT = 0; }
    else if (swimming) {
      if (!player.swim) { player.swim = true; sfx('splat', 0.6); burst(new THREE.Vector3(player.pos.x, wy + 0.1, player.pos.z), 0xd8eeff, 12, 3); }
      const dive = !!keys.ControlLeft; player.breath = Math.max(0, (player.breath ?? 1) - dt / (dive ? 15 : 90)); /* Atemluft: tauchen 15 s, an der Oberfläche ermüdet man nach 90 s */
      if (player.breath <= 0 && !opts.god) { player.drownT = (player.drownT || 0) + dt; if (player.drownT > 0.5) { player.drownT = 0; player.hp -= 8; player.drowning = true; sfx('hit', 0.3); } }
      const swimY = wy - (dive ? 2.4 : 1.18); player.vy = 0; player.pos.y += (swimY - player.pos.y) * Math.min(1, dt * 10);
      if (moving && Math.random() < dt * 10) burst(new THREE.Vector3(player.pos.x, wy + 0.05, player.pos.z), 0xd8eeff, 2, 1.2);
    } else {
      player.breath = Math.min(1, (player.breath ?? 1) + dt / 3); player.drowning = false;
      if (player.swim) { player.swim = false; player.pos.y = gy; if (player.mesh.userData.gun) player.mesh.userData.gun.visible = true; }
      if (player.vy <= 0 && player.pos.y > gy && player.pos.y - gy < 0.3) player.pos.y = gy; /* Bodenhaftung bergab und auf Treppen, sonst „schwebt“ man und kann nicht springen */ const onGround = player.pos.y <= gy + 0.02; if (keys.Space && onGround) player.vy = 5.2;
      if (onGround && player.vy <= 0 && player.pos.y > gy - 0.6) { player.pos.y += (gy - player.pos.y) * Math.min(1, dt * 18); }
      player.vy -= 14 * dt; const ny = player.pos.y + player.vy * dt;
      if (ny <= gy) { if (player.vy < -11 && opts.fall !== false && !opts.god) { const dmg = Math.round((-player.vy - 11) * 7); player.hp -= dmg; sfx('hit', 0.8); camShake(0.4); if (dmg > 10) showMsg('AUA', 600); } player.pos.y = gy; player.vy = 0; } else player.pos.y = ny;
    }
    const wPrev = Math.floor(walkT * 9 / Math.PI); walkT += dt * (moving ? (swimming ? 1.3 : ctrl.run ? 1.8 : 1) : (swimming ? 0.35 : 0)); if (!swimming && moving && player.pos.y <= gy + 0.03 && Math.floor(walkT * 9 / Math.PI) !== wPrev) sfx('step', ctrl.run ? 0.5 : 0.3); animateWalk(player.mesh, walkT, swimming ? (moving ? 2.5 : 0.4) : (moving ? speed : 0));
    player.mesh.position.copy(player.pos); player.mesh.rotation.y = player.yaw;
    const m = player.mesh.userData;
    if (swimming) {
      player.aimHold = false; player.aimT = 0; m.aiming = false; if (m.gun) m.gun.visible = false;
      m.armL.rotation.x = -1.15 + Math.sin(walkT * 6) * 0.55; m.armR.rotation.x = -1.15 - Math.sin(walkT * 6) * 0.55;
      m.armL.rotation.z = 0.25; m.armR.rotation.z = -0.25; m.armL.rotation.y = 0; m.armR.rotation.y = 0;
    } else {
      if (m.gun) m.gun.visible = true;
      player.aimT = Math.max(0, (player.aimT || 0) - dt); m.aiming = (!!player.aimHold || player.aimT > 0) && WPN.canAim() && !creativeSpawnerActive(); if (m.aiming) player.yaw = lerpAngle(player.yaw, camYaw.v, 1 - Math.exp(-26 * dt));
      const aimX = -Math.PI / 2 + camPitch.v * 0.7 + (m.recoil || 0); m.armR.rotation.x = aimX; m.armL.rotation.x = aimX; m.armL.rotation.z = -0.35; m.recoil = (m.recoil || 0) * 0.75; const rel = ((camYaw.v - player.yaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; m.armR.rotation.y = rel; m.armL.rotation.y = rel;
    }
  }
  // Kamera
  const camY0 = player.swim ? player.pos.y + 1.1 : player.pos.y;
  const cd = opts.camdist || 1; const cdim = player.car?.userData.dims; const back = (player.car ? Math.max(9, (cdim?.l || 4.4) * 1.7) : 3.6) * cd, up = (player.car ? Math.max(3.2, (cdim?.h || 1.5) + 2.2) : 1.9) * (0.6 + 0.4 * cd), side = player.car ? 0 : 0.8;
  const sy = Math.sin(camYaw.v), cy0 = Math.cos(camYaw.v);
  const ax = player.pos.x + cy0 * side * -1, az = player.pos.z - sy * side * -1; // Ankerpunkt rechts neben der Figur
  const cx = ax - sy * Math.cos(camPitch.v) * back, cz = az - cy0 * Math.cos(camPitch.v) * back, cy = camY0 + up + Math.sin(camPitch.v) * back;
  let t = 1; if (!(creative.on && player.pos.y > TH(player.pos.x, player.pos.z) + 2)) { _nearCars.length = 0; for (let i = 0; i < cars.length; i++) { const c = cars[i]; if (c !== player.car && (c.position.x - player.pos.x) ** 2 + (c.position.z - player.pos.z) ** 2 < 225) _nearCars.push(c); }
    for (let k = 0.1; k <= 1.001; k += 0.05) { const x = ax + (cx - ax) * k, z = az + (cz - az) * k, y = camY0 + up * k + Math.sin(camPitch.v) * back * k;
      let blocked = solidAtH(x, z, y - 0.3) !== -1;
      if (!blocked) for (let i = 0; i < _nearCars.length; i++) { const c = _nearCars[i], u = c.userData, fx = Math.sin(u.heading), fz = Math.cos(u.heading); const dx = x - c.position.x, dz = z - c.position.z; const along = dx * fx + dz * fz, across = dx * fz - dz * fx; if (Math.abs(along) < (u.dims ? u.dims.l / 2 : 2.2) + 0.3 && Math.abs(across) < 1.25 && y < c.position.y + (u.dims ? Math.min(u.dims.h, 1.7) : 1.6) + 0.25) { blocked = true; break; } }
      if (blocked) { t = Math.max(0.08, k - 0.08); break; } } }
  const want = _camWant.set(ax + (cx - ax) * t, Math.max(cy, surfAt(ax + (cx - ax) * t, az + (cz - az) * t, camY0 + 1) + 0.6), az + (cz - az) * t); /* Mindesthöhe kennt Brückendecks (nur das Deck, auf dem die Figur steht, nicht eines darüber) */
  if (!camera.userData.init || want.distanceTo(camera.position) > 30) { camera.position.copy(want); camera.userData.init = true; } else if (t < 1 && Math.hypot(want.x - ax, want.z - az) < Math.hypot(camera.position.x - ax, camera.position.z - az)) camera.position.copy(want); else camera.position.lerp(want, player.car ? 1 - Math.pow(0.001, dt) : 1 - Math.pow(0.00001, dt));
  const fov0 = opts.fov || 65; const fovWant = player.car ? fov0 + Math.min(Math.abs(player.car.userData.speed) / 30, 1) * 12 : fov0; if (Math.abs(camera.fov - fovWant) > 0.1) { camera.fov += (fovWant - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix(); }
  const look = player.car ? 0 : 6; // zu Fuß: Blick auf einen Punkt vor der Figur, damit Fadenkreuz und Waffe eine Linie bilden
  camera.lookAt(ax + sy * look, camY0 + 1.5 + (player.car ? 0 : -Math.sin(camPitch.v) * look * (camPitch.v < 0 ? 0.6 + 2.2 * Math.min(1, -camPitch.v / 1.25) : 0.6)), az + cy0 * look); /* nach oben: Zielpunkt stärker anheben, sonst endet der Blick bei ~35° */
  if (shakeT > 0 && opts.shake !== false) { shakeT = Math.max(0, shakeT - dt); const a = shakeT * 0.35; camera.position.x += rnd(-a, a); camera.position.y += rnd(-a, a); camera.position.z += rnd(-a, a); }
  { const sx = Math.round(player.pos.x / 8) * 8, sz = Math.round(player.pos.z / 8) * 8, sy = player.pos.y; const moved = sx !== shadowSnap.x || sz !== shadowSnap.z; shadowSnap.x = sx; shadowSnap.z = sz; shadowSnap.n++;
    sun.position.set(sx + world.sunDir.x, world.sunDir.y + sy, sz + world.sunDir.z); sun.target.position.set(sx, sy, sz);
    renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = moved || shadowSnap.n % (WEAK_GPU ? 4 : 2) === 0; } updateSky(dt); updateParkedLOD(); updateTileVis();
  // KI-Autos
  for (const c of cars) {
    const u = c.userData;
    const dc = c.position.distanceTo(player.pos); c.visible = dc < CAR_VIS;
    if (u.shove && c !== player.car) shoveCar(c, dt);
    if (u.mode === 'ai') { const d = dc; if (d > 350) continue;
      // Hindernis voraus? (Spieler, Passanten, andere Autos innerhalb 9 m im Fahrkegel)
      const fx = Math.sin(u.heading), fz = Math.cos(u.heading); let block = false;
      const pc = player.car; const yieldS = !!(pc && pc.userData.siren && c !== pc && d < 50 && ((c.position.x - pc.position.x) * Math.sin(pc.userData.heading) + (c.position.z - pc.position.z) * Math.cos(pc.userData.heading)) > 0); // Einsatzfahrzeug hinter mir: rechts ran
      const ahead = (px, pz, r) => { const rx = px - c.position.x, rz = pz - c.position.z; const along = rx * fx + rz * fz; const sidew = Math.abs(rx * fz - rz * fx); return along > 0 && along < 9 + u.speed * 0.4 && sidew < r; };
      if (!player.car && ahead(player.pos.x, player.pos.z, 1.6)) block = true;
      if (!block && u.speed > 0.2 && barrierHit(c.position.x + fx * 4, c.position.z + fz * 4, 0.9)) block = true; // vor Bauzaun halten
      if (u.type === 'bus') { if ((u.haltT || 0) > 0) { u.haltT -= dt; block = true; } else if ((u.haltT || 0) > -6) u.haltT = (u.haltT || 0) - dt; else for (const st of (u.road.s ? u.road.s.map(q => ({ x: q[0], z: q[1], k: 'bus' })) : CITY.stops)) { if (st.k !== 'bus') continue; const dd = (st.x - c.position.x) ** 2 + (st.z - c.position.z) ** 2; if (dd < 64) { u.haltT = 8; block = true; break; } } } // Bus hält an der Haltestelle
      if (!block) for (const o of cars) { if (o !== c && o.visible && Math.abs(o.position.y - c.position.y) < 2.5 && ahead(o.position.x, o.position.z, 1.8)) { block = true; break; } }
      if (!block) for (const p of peds) { if (p.visible && p.userData.state !== 'dead' && ahead(p.position.x, p.position.z, 1.4)) { block = true; break; } }
      if (!block) for (const sg of signalsNear(c.position.x, c.position.z)) { const rx = sg[0] - c.position.x, rz = sg[1] - c.position.z; const along = rx * fx + rz * fz; if (along > 1 && along < 7 + u.speed * 0.6 && Math.abs(rx * fz - rz * fx) < 7 && signalRed(u.heading, worldT)) { block = true; break; } }
      u.isCar = true; u.speed = block ? Math.max(0, u.speed - 18 * dt) : Math.min(u.speed + (u.bike && !u.moto ? 2.2 : 6) * dt, yieldS ? 2.5 : (u.maxv || 9)); if (yieldS && u.speed > 2.5) u.speed = Math.max(2.5, u.speed - 8 * dt);
      u.stuckT = block && u.speed < 0.5 ? (u.stuckT || 0) + dt : 0; if (u.stuckT > rnd(2.5, 6) && d < 80) { u.stuckT = -rnd(4, 10); sfx('horn', clamp(1 - d / 80, 0.1, 0.8)); }
      u.jamT = block ? (u.jamT || 0) + dt : 0; if (u.jamT > 12 && d > 130) { u.jamT = 0; u.respawn = true; } // Dauerstau außer Sicht löst sich auf statt für immer zu stehen
      // Rechtsverkehr: die Normale in advanceAlongRoad dreht sich mit der Fahrtrichtung schon um, ein zusätzliches *u.dir hob das auf und ließ Gegenverkehr auf derselben Spur fahren (Frontalstaus)
      if (u.speed > 0.05) { const lk = yieldS ? Math.max(0.42, laneK(u)) : laneK(u); const k = sideGuard(u, c.position, u.road.w * lk, 0, 1); /* Versatz +W = rechts (Normale (-dz,dx) zeigt bei x Ost/z Süd nach rechts; Rechtsverkehr, #99) ohne u.dir: die Normale dreht schon mit der Fahrtrichtung */ advanceAlongRoad(u, c.position, u.speed * dt, u.road.w * lk * k); }
      if (u.vh === undefined) u.vh = u.heading; u.vh = lerpAngle(u.vh, u.heading, Math.min(1, dt * Math.max(2.5, u.speed * 0.9))); const hh = u.heading; u.heading = u.vh; c.rotation.y = u.vh; carFx(c, dt, block); carTerrain(c); u.heading = hh;
      if (u.respawn) { u.respawn = false; let q = null; const pool = roadsNear(player.pos.x, player.pos.z, 1, true); for (let k = 0; k < 6 && pool.length; k++) { const t = randomRoadPoint(pick(pool)); if (Math.hypot(t.x - player.pos.x, t.z - player.pos.z) > 120) { q = t; break; } } if (q) { u.road = q.road; u.seg = q.seg; u.dir = q.road.o || q.dir; u.heading = q.heading + (u.dir < 0 ? Math.PI : 0); c.position.set(q.x, TH(q.x, q.z), q.z); u.speed = 0; snapToLane(u, c.position, u.road.w * laneK(u)); u.vh = u.heading; c.rotation.y = u.heading; } else if (u.road.o) { u.respawn = true; u.speed = 0; /* Einbahnstraße: nie wenden (Geisterfahrer), am Ende warten bis ein Ersatzpunkt frei ist */ } else { u.dir *= -1; } }
      if (!player.car && d < 4 && u.speed > 1) { const D = u.dims || { l: 4.4, w: 1.9 }; const rx = player.pos.x - c.position.x, rz = player.pos.z - c.position.z; const al = rx * fx + rz * fz, ac = rx * fz - rz * fx; if (al > 0 && al < D.l / 2 + 0.35 && Math.abs(ac) < D.w / 2 + 0.25) { const sg = Math.sign(ac) || 1; moveWithCollision(player.pos, fz * sg * 1.2, -fx * sg * 1.2, 0.35); if (u.speed > 4) { player.hp -= clamp(u.speed * 2.2, 8, 55); player.vy = 3; showMsg('ANGEFAHREN', 700); sfx('hit'); } u.speed = 0; } }
      if (u.rider && c.visible) { u.rt = (u.rt || 0) + dt * (u.speed > 0.2 ? Math.max(0.5, u.speed * 0.5) : 0); poseBikeRider(u.rider, !!u.moto, u.rt); }
    }
    else if (u.mode === 'police') policeAI(c, dt);
    if ((u.police || u.ambulance || u.cannon || u.type === 'evkdow') && u.bar) { const sOn = u.mode === 'police' || u.mode === 'fireAI' || u.mode === 'medicAI' || !!u.siren; u.bar.material.color.setHex(!sOn ? 0x2a2f3a : Math.floor(performance.now() / 250) % 2 ? 0x3b7bff : (u.ambulance ? 0xffffff : 0xff3b3b)); }
  }
  // Wracks nach einer Weile wegräumen
  for (let i = cars.length - 1; i >= 0; i--) { const c = cars[i]; if (c.userData.mode === 'wreck') { c.userData.wreckT = (c.userData.wreckT || 0) + dt; if (c.userData.wreckT > 45 && c.position.distanceTo(player.pos) > 60) { disposeCar(c); scene.remove(c); cars.splice(i, 1); unshoot(c); } } }
  // weit entfernte Autos recyceln (nicht im Innenraum: dort ist alles weit weg)
  if (!POCKET) for (let i = cars.length - 1; i >= 0; i--) { const c = cars[i]; if (c !== player.car && !c.userData.unitCar && !c.userData.cannon && !c.userData.medic && !c.userData.keep && c.position.distanceTo(player.pos) > 450) { disposeCar(c); scene.remove(c); cars.splice(i, 1); unshoot(c); spawnCar(false, player.pos, 120, 260, !!c.userData.bike); } }
  if (!POCKET) { let nb = 0; for (const c of cars) if (c.userData.bike) nb++; const wantB = Math.round(10 * opts.traffic); if (nb < wantB && Math.random() < dt * 0.8) spawnCar(false, player.pos, 50, 200, true);
    const want = Math.round(60 * opts.traffic) + wantB; if (cars.length < want && Math.random() < dt) spawnCar(false, player.pos, 120, 260); else if (cars.length > want + 5) { const far = cars.filter(c => c !== player.car && !c.userData.police && !c.userData.medic && !c.userData.keep && c.position.distanceTo(player.pos) > 200)[0]; if (far) { disposeCar(far); scene.remove(far); cars.splice(cars.indexOf(far), 1); unshoot(far); } } }
  // Passanten
  for (let i = peds.length - 1; i >= 0; i--) {
    const h = peds[i], u = h.userData; const d = h.position.distanceTo(player.pos); h.visible = d < PED_VIS; u.lod = d > 55; if (d > 200) continue; u.t += dt;
    if (u.state === 'walk') { pedSidewalk(u, h); advanceAlongRoad(u, h.position, u.speed * dt, u.side * (u.road.w / 2 + 1.5) * (u.offK ?? 1) * u.dir); /* *u.dir: beim Umdrehen auf demselben Gehweg bleiben */ h.rotation.y = u.heading; animateWalk(h, u.t, u.speed * 2.5); }
    else if (u.state === 'cop') copAI(h, dt);
    else if (u.state === 'flee') { u.fleeT -= dt; if (!u.fleeDir) { const dirx = h.position.x - player.pos.x, dirz = h.position.z - player.pos.z, l = Math.hypot(dirx, dirz) || 1; u.fleeDir = [dirx / l, dirz / l]; u.fleeSide = Math.random() < 0.5 ? 1 : -1; } const x0 = h.position.x, z0 = h.position.z, st = 5 * dt; moveWithCollision(h.position, u.fleeDir[0] * st, u.fleeDir[1] * st, 0.3, undefined, (px, pz) => waterAt(px, pz) !== null); const mv = Math.hypot(h.position.x - x0, h.position.z - z0); if (mv < st * 0.3) { u.fleeBlock = (u.fleeBlock || 0) + 1; const [fx, fz] = u.fleeDir; u.fleeDir = [-fz * u.fleeSide, fx * u.fleeSide]; if (u.fleeBlock > 3) u.fleeT = Math.min(u.fleeT, 0.4); } else u.fleeBlock = 0; /* an der Wand/Ufer seitlich ausweichen statt dagegen zu rennen */ h.position.y = floorAt(h.position.x, h.position.z, h.position.y + 0.3); h.rotation.y = lerpAngle(h.rotation.y, Math.atan2(u.fleeDir[0], u.fleeDir[1]), Math.min(1, dt * 8)); animateWalk(h, u.t * 1.6, mv > st * 0.3 ? 7 : 0); if (u.fleeT <= 0) { u.state = 'walk'; u.fleeDir = null; rehome(u, h.position); } }
    else if (u.state === 'dead') { if (u.mixer && ragdoll(h, u, dt)) {} else if (u.fly) { const y0 = h.position.y; if (moveWithCollision(h.position, u.fly.x * dt, u.fly.z * dt, 0.3, h.position.y) === 2) { u.fly.x *= -0.2; u.fly.z *= -0.2; } /* weggeschleudert: nicht durch Wände, auf Brücken und Dächern landen */ h.position.y += u.fly.y * dt; u.fly.y -= 14 * dt; h.rotation.y += (u.spin || 0) * dt; const fy = floorAt(h.position.x, h.position.z, Math.max(y0, h.position.y) + 0.3); if (h.position.y <= fy && u.fly.y < 0) { h.position.y = fy; if (u.fly.length() > 4) { u.fly.multiplyScalar(0.35); u.fly.y = Math.abs(u.fly.y) * 0.3; } else u.fly = null; } } if (u.mixer && !u.rd) { if (!u.dead) { u.dead = true; playAnim(h, 'death', { once: true, fade: 0.1 }); } u.mixer.update(dt); } else h.rotation.x = Math.min(h.rotation.x + dt * 5, Math.PI / 2); u.deadT = (u.deadT || 0) + dt; if (u.deadT > (u.medic ? 75 : 25)) { freeSkel(h); scene.remove(h); peds.splice(i, 1); unshoot(h); } }
  }
  if (!POCKET) { const pw = Math.round(55 * (opts.peds ?? 1)); for (let k = 0; k < 2 && peds.length < pw; k++) spawnPed(player.pos); if (peds.length > pw + 3) { const far = peds.find(p => { const u = p.userData; return !u.cop && !u.demo && !u.keep && !u.follow && !u.medic && u.state !== 'arrested' && u.state !== 'stunned' && p.position.distanceTo(player.pos) > 90; }); if (far) { freeSkel(far); scene.remove(far); peds.splice(peds.indexOf(far), 1); unshoot(far); } }
    /* weit entfernte Passanten (nach U-Bahn-Fahrt, Reise) nach und nach in die Nähe holen, sonst bleibt die neue Gegend leer */ for (let k = 0, n = 0; k < peds.length && n < 2; k++) { const p = peds[k], u = p.userData; if (u.cop || u.demo || u.keep || u.follow || u.ff || u.medic || u.state === 'arrested' || !(u.state === 'walk' || u.state === 'flee' || u.state === 'dead') || p.position.distanceTo(player.pos) < 450) continue; freeSkel(p); scene.remove(p); peds.splice(k, 1); unshoot(p); k--; n++; spawnPed(player.pos); } }
  updateBikeRacks(dt); updatePickups(dt); updateTrams(dt); updateFallenPoles(dt); WPN.update(dt); DEMO.update(dt); FIRE.update(dt); STORY.update(dt); updateFx(dt); updateDynLights();
  FX.update(dt); // Partikel (ein Pool, ein Draw-Call)
  // Fahndung
  if (creative.on) player.wanted = 0;
  if (player.wanted > 0) { player.wantedTimer -= dt; if (player.wantedTimer <= 0) player.wanted = Math.max(0, player.wanted - dt * 0.25); const want = Math.min(Math.floor(player.wanted) + 1, 5); let n = 0; for (const c of cars) if (c.userData.mode === 'police') n++; if (n < want && Math.random() < dt * 0.5) spawnCar(true, player.pos); }
  else { for (let i = cars.length - 1; i >= 0; i--) { const c = cars[i]; if (c.userData.mode !== 'police') continue; if (c.position.distanceTo(player.pos) > 120) { disposeCar(c); scene.remove(c); cars.splice(i, 1); unshoot(c); } else { c.userData.mode = 'parked'; c.userData.speed = 0; c.userData.officer = null; } } } // nahe Streifenwagen bleiben stehen statt weiter Beamte abzusetzen
  // Tod
  if (opts.god) player.hp = 100;
  { const b = player.breath ?? 1; if (!breathEl) { breathEl = document.createElement('div'); breathEl.id = 'breath'; breathEl.style.cssText = 'position:fixed;left:50%;bottom:92px;transform:translateX(-50%);width:180px;height:10px;border-radius:5px;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.5);overflow:hidden;z-index:5;pointer-events:none'; breathEl.innerHTML = '<div style="height:100%;width:100%;background:#7cc8ff"></div><span style="position:absolute;left:0;right:0;top:-18px;text-align:center;font:600 12px system-ui,sans-serif;color:#fff;text-shadow:0 1px 2px #000">🫧 Luft</span>'; breathEl.style.overflow = 'visible'; breathEl.firstChild.style.borderRadius = '5px'; document.body.appendChild(breathEl); }
    const show = b < 1 || (player.swim && !!keys.ControlLeft); /* volle Luft an der Oberfläche: ausgeblendet (#84) */ setSty(breathEl, 'display', show ? 'block' : 'none'); if (show && !breathHint) { breathHint = true; let seen = false; try { seen = localStorage.getItem('bh_luft') === '1'; localStorage.setItem('bh_luft', '1'); } catch (e) { /* ohne Speicher: Hinweis je Sitzung */ } if (!seen) showMsg('LUFT: TAUCHT MAN ZU LANGE, ERTRINKT MAN', 3200); } if (show) { breathEl.firstChild.style.width = (b * 100).toFixed(0) + '%'; breathEl.firstChild.style.background = b < 0.25 ? '#ff6b5a' : '#7cc8ff'; } }
  player.hp = clamp(player.hp, 0, 100); if (player.hp < lastHp - 0.5) { $('flash').style.opacity = 0.45; setTimeout(() => $('flash').style.opacity = 0, 120); } lastHp = player.hp;
  if (!player.dead && player.hp < 100 && player.wanted === 0) player.hp = Math.min(100, player.hp + dt * 1.5);
  if (player.hp <= 0 && !player.dead) { player.dead = true; showMsg(player.car ? 'ZERSCHELLT · Enter für Neustart' : player.drowning ? 'ERTRUNKEN · Enter für Neustart' : 'UMGEHAUEN · Enter für Neustart', 99999); if (player.car) exitCar(); }
  // HUD
  if (!moneyEl._v) { moneyEl.innerHTML = '<span class="coin">€</span><span></span>'; moneyEl._v = moneyEl.lastChild; } setTxt(moneyEl._v, (player.money || 0).toLocaleString('de-DE'));
  setTxt(ammoEl, player.car ? `${Math.round(Math.abs(player.car.userData.speed) * 3.6)} km/h` + (player.car.userData.cannon ? ` · Wasser ${Math.round(player.car.userData.tank)} % · Linksklick spritzen` : '') : ''); setSty(weaponEl, 'display', (player.car && player.car.userData.cannon) ? 'none' : '');
  setSty(healthBar, 'width', Math.round(player.hp) + '%'); setSty(healthBar, 'background', player.hp > 40 ? '#62d26f' : '#e05050');
  { const n = Math.max(0, Math.min(5, Math.ceil(player.wanted))); if (starsEl.__n !== n) { starsEl.__n = n; starsEl.innerHTML = Array.from({ length: 5 }, (_, i) => `<i class="${i < n ? 'on' : ''}">★</i>`).join(''); starsEl.classList.toggle('hot', n > 0); } }
  autoT += dt; if (autoT > 120 && !player.dead && player.wanted < 1 && !player.car) { autoT = 0; saveGame(true); }
  streetTimer -= dt; if (streetTimer <= 0) { streetTimer = 0.5; streetEl.textContent = nearestStreet(); }
  // Hinweistext einmal zusammenbauen und nur bei Änderung schreiben; Parkautos ohne hypot (Quadratabstand mit Vorprüfung)
  let ht = '';
  if (!player.car) { let near = null; for (const c of cars) if ((c.userData.mode !== 'wreck' || remountable(c.userData)) && c.position.distanceTo(player.pos) < (c.userData.cannon ? 7 : 4)) near = c;
    if (near) ht = remountable(near.userData) ? (near.userData.moto ? 'E · Motorrad aufheben' : 'E · Fahrrad aufheben') : near.userData.mode === 'parked' ? (near.userData.cannon ? 'E · Wasserwerfer übernehmen' : near.userData.ambulance ? 'E · Rettungswagen nehmen' : near.userData.moto ? 'E · Motorrad nehmen' : near.userData.bike ? 'E · Fahrrad nehmen' : 'E · einsteigen') : near.userData.moto ? 'E · Motorradfahrer runterziehen' : near.userData.bike ? 'E · Radler runterziehen' : 'E · Fahrer rauszerren';
    else { const px = player.pos.x, pz = player.pos.z; for (const sp of staticParked) { if (!sp.active) continue; const dx = sp.x - px; if (dx > 3.6 || dx < -3.6) continue; const dz = sp.z - pz; if (dz > 3.6 || dz < -3.6) continue; if (dx * dx + dz * dz < 12.96) { ht = 'E · einsteigen'; break; } } } }
  else ht = player.car.userData.cannon ? 'E · aussteigen · Linksklick Wasser · Maus zielt' : player.car.userData.ambulance ? 'E · aussteigen · Leertaste bremsen · H Martinshorn' : player.car.userData.moto ? 'E · absteigen · Linksklick schießen · H hupen' : player.car.userData.bike ? 'E · absteigen · Linksklick schießen · H klingeln' : 'E · aussteigen · Leertaste bremsen';
  { const sh = SHOPS.update(dt); if (sh && !player.car && !ht) ht = sh; const ih = INTERIORS.update(dt); if (ih) ht = ih; PROGRESS.update(dt); LANDMARKS.update(dt); WAHRZ.update(dt); if (DUNST) DUNST.update(); if (EULEN) EULEN.update(dt); if (VOKA) VOKA.update(dt); if (LAUF) LAUF.update(dt); if (RASEN) RASEN.update(dt); if (ZIVIL) ZIVIL.update(dt); archCheck(); policeHeli(dt); if (WARN_MAT) WARN_MAT.color.setHex(Math.floor(performance.now() / 750) % 2 ? 0xff2a1a : 0x3a0806); if (player.car && player.car.userData.voi) { const vu = player.car.userData; vu.voiT = (vu.voiT || 0) + dt; if (vu.voiT >= 60) { vu.voiT -= 60; if (player.money >= 2) { player.money -= 2; showMsg('VOI −2 €', 700); } else { showMsg('VOI: GUTHABEN LEER', 1200); exitCar(); } } } const hh = HELI.update(dt); if (hh && (!ht || player.car)) ht = hh; }
  if (!locked && !menuOpen && !mapOpen && !document.hidden && !window.__touch) ht = 'Ins Spiel klicken für Maussteuerung';
  setTxt(hint, ht); setSty(hint, 'display', ht ? 'block' : 'none');
  setSty(cross, 'display', ((!player.car || !player.car.userData.cannon) && !player.dead) ? 'block' : 'none');
  mmT -= dt; if (mmT <= 0) { mmT = 0.05; drawMinimap(); } // Minikarte mit 20 Hz statt jedem Bild
}
function unshoot(o) { const j = shootables.indexOf(o); if (j >= 0) shootables.splice(j, 1); } // nie splice(-1): das entfernte sonst ein fremdes Objekt
function freeSkel(h) { h.traverse(o => { if (o.isSkinnedMesh && o.skeleton && o.skeleton.boneTexture) o.skeleton.dispose(); }); } // Knochen-Textur je SkinnedMesh (12x12/16x16), sonst bleibt sie je entfernter Figur auf der GPU
function despawnPed(h) { freeSkel(h); scene.remove(h); const i = peds.indexOf(h); if (i >= 0) peds.splice(i, 1); const j = shootables.indexOf(h); if (j >= 0) shootables.splice(j, 1); }
function copCount() { let n = 0; for (const p of peds) if (p.userData.cop && p.userData.state !== 'dead') n++; return n; }
function spawnOfficer(car) {
  const h = makeHuman(false, { model: 'swat', keepColors: true, top: 0x1f3a6b, pants: 0x1a2e52, style: 'jacket', hair: 'cap' }); const u = car.userData; const x = car.position.x + Math.cos(u.heading) * 2.2, z = car.position.z - Math.sin(u.heading) * 2.2;
  if (solidAt(x, z) >= 0) return null; h.position.set(x, TH(x, z), z); const gun = makeGun(); h.userData.hand.add(gun); h.userData.gun = gun; h.userData.aiming = true;
  Object.assign(h.userData, { road: pick(CITY.roads), seg: 0, dir: 1, side: 1, speed: 2.6, hp: 100, state: 'cop', t: 0, cop: true, shotT: rnd(0.5, 1.5), car });
  scene.add(h); peds.push(h); shootables.push(h); u.officer = h; return h;
}
function copAI(h, dt) {
  const u = h.userData; const to = _aiTo.subVectors(player.pos, h.position); const d = to.length();
  // Fahndung vorbei: Beamter verschwindet (steigt ein). Vorher wurde er zum Passanten mit Pistole, das Auto bekam sofort den nächsten – hunderte „Polizisten“ in Sekunden (Issues #1, #2)
  if (player.wanted <= 0 || player.dead) { if (u.car) { u.car.userData.officer = null; u.car.userData.officerT = 6; } despawnPed(h); return; }
  const dirx = to.x / (d || 1), dirz = to.z / (d || 1); h.rotation.y = Math.atan2(dirx, dirz);
  if (d > 9) { moveWithCollision(h.position, dirx * u.speed * dt, dirz * u.speed * dt, 0.3); h.position.y = floorAt(h.position.x, h.position.z, h.position.y + 0.3); animateWalk(h, u.t, 4); }
  else animateWalk(h, u.t, 0);
  u.armR.rotation.x = -Math.PI / 2; u.armL.rotation.x = -Math.PI / 2; u.armL.rotation.z = -0.35;
  u.shotT -= dt; if (u.shotT <= 0 && d < 28) { u.shotT = rnd(0.9, 1.6); const from = new THREE.Vector3(); u.gun.userData.muzzle.getWorldPosition(from); const hit = Math.random() < (player.car ? 0.25 : 0.4); const target = player.pos.clone(); target.y += 1.2; if (!hit) { target.x += rnd(-2, 2); target.y += rnd(-1, 1.5); target.z += rnd(-2, 2); }
    const len = from.distanceTo(target); const tr = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, len), tracerMat); tr.position.copy(from).lerp(target, 0.5); tr.lookAt(target); scene.add(tr); setTimeout(() => { scene.remove(tr); tr.geometry.dispose(); }, 90); sfx('shot', clamp(1 - d / 40, 0.2, 0.7));
    if (hit) { if (player.car) { player.car.userData.hp -= 6; if (player.car.userData.hp <= 0) explode(player.car); } else player.hp -= 9; } }
}
const roadLen = r => r._len ?? (r._len = r.p.reduce((a, p, i) => i ? a + Math.hypot(p[0] - r.p[i - 1][0], p[1] - r.p[i - 1][1]) : 0, 0));
function nearestRoadSeg(x, z, car = true, minLen = 0) { let best = 1e9, res = null; for (const r of roadsNear(x, z, 1, car)) if ((car || !(r.mw || r.ry)) && (!minLen || roadLen(r) >= minLen)) for (let i = 0; i < r.p.length - 1; i++) { const d = distSegSq(x, z, r.p[i][0], r.p[i][1], r.p[i + 1][0], r.p[i + 1][1]); if (d < best) { best = d; res = { road: r, seg: i }; } } return res; }
function policeAI(c, dt) {
  const u = c.userData; const to = _aiTo.subVectors(player.pos, c.position); const d = to.length();
  if (d > 380) { const q = (() => { for (let k = 0; k < 30; k++) { const rr = randomRoadPoint(pick(roadsNear(player.pos.x, player.pos.z, 1, true))); const dd = Math.hypot(rr.x - player.pos.x, rr.z - player.pos.z); if (dd > 110 && dd < 200) return rr; } return null; })(); if (q) { c.position.set(q.x, TH(q.x, q.z), q.z); u.onRoad = false; u.speed = 0; } return; }
  // Weit weg: über das Straßennetz Richtung Spieler, nah: direkt
  if (d > 40 && (!u.directT || u.directT <= 0)) {
    if (!u.onRoad) { const ns = nearestRoadSeg(c.position.x, c.position.z); if (ns) { const a = ns.road.p[ns.seg], b = ns.road.p[ns.seg + 1]; const toB = Math.hypot(b[0] - player.pos.x, b[1] - player.pos.z) < Math.hypot(a[0] - player.pos.x, a[1] - player.pos.z); u.road = ns.road; u.dir = toB ? 1 : -1; u.seg = toB ? ns.seg : ns.seg + 1; u.onRoad = true; } }
    if (u.onRoad) { u.goal = player.pos; u.isCar = true; u.speed = Math.min(u.speed + 7 * dt, 15); const before = c.position.clone(); advanceAlongRoad(u, c.position, u.speed * dt, u.road.w * 0.25 /* rechts, #99 */); if (c.position.distanceTo(before) > 12) { c.position.copy(before); u.onRoad = false; u.directT = 3; } c.rotation.y = u.heading; carFx(c, dt, false); carTerrain(c); if (u.respawn) { u.respawn = false; u.onRoad = false; u.directT = 3; } return; }
  }
  u.onRoad = false; u.goal = null; u.directT = Math.max(0, (u.directT || 0) - dt);
  const want = Math.atan2(to.x, to.z); const diff = ((want - u.heading + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  const onFoot = !player.car; const ctrl = { fwd: onFoot ? d > 14 : d > 6, back: !onFoot && d < 4, left: diff > 0.1, right: diff < -0.1, brake: onFoot && d <= 14 };
  if (Math.abs(u.speed) < 1 && d > 8) { u.stuck = (u.stuck || 0) + dt; if (u.stuck > 1.5) { ctrl.fwd = false; ctrl.back = true; ctrl.left = !ctrl.left; if (u.stuck > 3) u.stuck = 0; } } else u.stuck = 0;
  driveCar(c, dt, ctrl);
  if (!player.car && d < 2.6 && Math.abs(u.speed) > 4) player.hp -= 12 * dt;
  u.officerT = Math.max(0, (u.officerT || 0) - dt); if (player.wanted > 0 && !player.car && d < 24 && Math.abs(u.speed) < 3 && !u.officer && u.officerT <= 0 && copCount() < 4) { spawnOfficer(c); u.officerT = 4; }
}
// Dynamisches Scheinwerfer-SpotLight & Blaulicht-PointLight (gepoolt, nur auf Hoch/Ultra aktiv; bei visible=false 0 GPU-Kosten)
let carSpot = null, sirenLight = null;
function updateDynLights() {
  const active = opts.dynlights !== false && (opts.quality === 'hoch' || opts.quality === 'ultra') && !POCKET;
  if (!active) { if (carSpot) carSpot.visible = false; if (sirenLight) sirenLight.visible = false; return; }
  if (!carSpot) { carSpot = new THREE.SpotLight(0xfff2d6, 38, 48, 0.54, 0.45, 1.4); carSpot.castShadow = false; carSpot.visible = false; scene.add(carSpot, carSpot.target); }
  if (!sirenLight) { sirenLight = new THREE.PointLight(0x3b7bff, 22, 24, 1.6); sirenLight.castShadow = false; sirenLight.visible = false; scene.add(sirenLight); }
  const pc = player.car; const cu = pc && pc.userData;
  const hlOn = !!(pc && !cu.heli && (cu.lightsForce !== undefined ? cu.lightsForce : world.night));
  carSpot.visible = hlOn;
  if (hlOn) {
    const fx = Math.sin(cu.heading), fz = Math.cos(cu.heading), L = (cu.dims ? cu.dims.l : 4.2) * 0.48;
    carSpot.position.set(pc.position.x + fx * L, pc.position.y + 0.85, pc.position.z + fz * L);
    carSpot.target.position.set(pc.position.x + fx * (L + 22), pc.position.y + 0.2, pc.position.z + fz * (L + 22));
  }
  let bestC = null, bestD = 42 * 42;
  for (const c of cars) {
    const u = c.userData;
    if (!(u.police || u.ambulance || u.cannon || u.type === 'evkdow') || !(u.mode === 'police' || u.mode === 'fireAI' || u.mode === 'medicAI' || u.siren)) continue;
    const d2 = (c.position.x - player.pos.x) ** 2 + (c.position.z - player.pos.z) ** 2;
    if (d2 < bestD) { bestD = d2; bestC = c; }
  }
  sirenLight.visible = !!bestC;
  if (bestC) {
    sirenLight.position.set(bestC.position.x, bestC.position.y + 2.2, bestC.position.z);
    sirenLight.color.setHex(Math.floor(performance.now() / 250) % 2 ? 0x3b7bff : (bestC.userData.ambulance ? 0xffffff : 0xff3b3b));
  }
}
// Effekte am Spieler: Pfefferspray, Wasser, Farbe, Schlagstock
const fxEl = { spray: 0, water: 0, paint: 0 };
function hurtPlayer(kind, amt) { if (player.dead) return; if (!opts.god) player.hp -= amt; if (amt > 2) vibrate(35); if (kind === 'spray') fxEl.spray = 5; if (kind === 'water') fxEl.water = Math.min(3, fxEl.water + 0.6); if (kind === 'paint') { fxEl.paint = 4; $('fx_paint').style.background = `radial-gradient(circle at ${30 + Math.random() * 40}% ${30 + Math.random() * 40}%, #${WPN.PAINT[Math.floor(Math.random() * 6)].toString(16).padStart(6, '0')}cc 0 12%, transparent 30%)`; } if (kind === 'baton' || kind === 'boom') camShake(0.3); }
function updateFx(dt) { for (const k of ['spray', 'water', 'paint']) { fxEl[k] = Math.max(0, fxEl[k] - dt); $('fx_' + k).style.opacity = Math.min(1, fxEl[k] / (k === 'water' ? 1 : 2)); } if (fxEl.spray > 0 && Math.random() < dt * 0.8) sfx('cough', 0.4); }
let cardT = null; function card(title, sub, sec = 4) { const el = $('card'); el.innerHTML = `<h2>${title}</h2>${sub ? '<p>' + sub + '</p>' : ''}`; el.style.display = 'block'; el.style.opacity = 1; clearTimeout(cardT); cardT = setTimeout(() => { el.style.opacity = 0; cardT = setTimeout(() => el.style.display = 'none', 600); }, sec * 1000); }
let breathEl = null, breathHint = false;
function respawn() { player.dead = false; player.hp = 100; player.breath = 1; player.drowning = false; player.wanted = 0; msgEl.style.display = 'none'; for (const c of cars) if (c.userData.police && c !== player.car) c.userData.mode = 'parked'; }

window.G = { STR, BUILD_STAT, LOAD_STAT, VERY_WEAK, get PHONE() { return PHONE; }, barrierHit, HELI, get EULEN() { return EULEN; }, get VOKA() { return VOKA; }, get LAUF() { return LAUF; }, get RASEN() { return RASEN; }, get ZIVIL() { return ZIVIL; }, makeMoto, makeAmbulance, updateBikeRacks, onMotorway, PROGRESS, INTERIORS, explode, makeBike, FX, puff, burst, smoke, LOW_GFX, WEAK_GPU, get canvasTexCount() { return _allCanvasTex.length; }, get ANISO() { return ANISO; }, get roadMat() { return roadMatRef; }, DEMN, DEMT, R_DATA, unregisterTile, SHOPS, TILES, WORLD, WIDX, streamUpdate, streamInit, buildTileNow, TS, WPN, DEMO, STORY, FIRE, X, card, hurtPlayer, composerRef: () => composer,  autoQuality, get QUALITY_AUTO() { return QUALITY_AUTO; }, groundH, footTH, FOOT_SINK, dentCar, deckAt, surfAt, signalPoles, treeSpots, lampSpots, pushOffRoads, onOtherRoad, floorAt, solidAtH, solidAt, roofHeight, camShake,  CHAR, CAR_TPL, playAnim, makeHuman, makeCar, makeGun, applyQuality,  staticParked, chunkStatic,  saveGame, loadGame, world, opts, pickups, weather, trams, scene, cars, peds, player, camera, camYaw, camPitch, keys, CITY, DEM, TH, renderer, sun, hemi, THREE, shoot, toggleCar, update, toggleCreative, creative, creativePlace, creativeSpawnerActive };
try { initDebugOverlay(window.G); } catch (e) { console.warn('Debug-Overlay aus', e); } // F3 und G.PERF (#162), muss vor setAnimationLoop stehen
let fpsN = 0, fpsT = 0;
renderer.setAnimationLoop(() => {
  fpsN++; const tn = performance.now(); if (tn - fpsT > 500) { const fe = document.getElementById('fps'); if (fe && opts.fps) fe.textContent = Math.round(fpsN * 1000 / (tn - fpsT)) + ' fps'; fpsN = 0; fpsT = tn; }
  const now = performance.now() / 1000; const dt = Math.min(now - lastT, 0.05); lastT = now;
  // Ein Fehler in einem Bild darf das Spiel nicht einfrieren (three fordert den nächsten Frame erst nach dem Callback an)
  try { update(dt); audioUpdate(dt); } catch (e) { loopErrors++; if (loopErrors <= 3 || loopErrors % 300 === 0) console.error('update-Fehler', loopErrors, e); if (loopErrors === 3) showMsg('FEHLER IM SPIEL – bitte melden (Esc › Fehler melden)', 4000); }
  try { if (composer) composer.render(); else renderer.render(scene, camera); } catch (e) { loopErrors++; if (loopErrors <= 3) console.error('render-Fehler', e); }
});
let loopErrors = 0;

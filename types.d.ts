// Typen für die statische Prüfung (Ticket #119): `npx -p typescript@5 tsc -p jsconfig.json`.
// Keine Laufzeitwirkung, der Browser lädt diese Datei nie. Neue Eigenschaft am Kontext X → hier eintragen,
// sonst meldet tsc „Property … does not exist on type 'Ctx'“ (genau das soll Tippfehler fangen).

/** Punkt [x, z] in Metern, Ursprung = WIDX.origin */
export type Pt = [number, number];

/** Gebäude aus data/tiles/*.json (build_tiles.py) */
export interface Building {
  p: Pt[];          // Grundriss
  h: number;        // Höhe
  rh?: number;      // Dachhöhe
  mh?: number;      // Mindesthöhe (Brücken, Überbauten)
  r?: string;       // Dachform
  k?: string;       // Art
  n?: string;       // Name
  shop?: string;    // Laden-Art
  base?: number;    // Bodenhöhe, setzt game.js beim Bau
  [extra: `_${string}`]: unknown; // Laufzeit-Markierungen mit _
}

/** Straße aus data/tiles/*.json */
export interface Road {
  p: Pt[];
  w: number;        // Breite
  n?: string;       // Name
  o?: number;       // Einbahn
  l?: number;       // Fahrstreifen
  v?: number;       // Tempo
  el?: number; br?: number; bp?: number; mw?: number; ped?: number; ry?: number;
}

/** Haltestelle */
export interface Stop { x: number; z: number; n?: string; k?: string; }

/** Inhalt einer Kachel data/tiles/<tx>_<tz>.json */
export interface TileData {
  buildings?: Building[]; roads?: Road[]; stops?: Stop[];
  paths?: { p: Pt[] }[]; rails?: { p: Pt[]; k?: string }[]; green?: { p: Pt[]; k?: string }[];
  areas?: { p: Pt[]; k?: string; n?: string }[]; barriers?: { p: Pt[]; k?: string }[];
  pois?: { x: number; z: number; n?: string; k?: string }[]; furniture?: { x: number; z: number; k?: string }[];
  crossings?: { x: number; z: number }[]; trees?: Pt[]; signals?: Pt[]; water?: any[];
}

/** Eintrag in TILES (game.js) */
export interface Tile { tx: number; tz: number; k: string; data: TileData; built: boolean; [more: string]: any; }

/** Was game.js als CITY/WORLD bereitstellt */
export interface City extends TileData { origin?: any; [more: string]: any; }

/** Kontextobjekt X aus game.js (`const X = {…}` plus Object.assign) – Schlüssel bewusst ohne Index-Signatur */
export interface Ctx {
  FAR_HAZE: any;
  THREE: any;
  scene: any;
  camera: any;
  renderer: any;
  player: any;
  peds: any;
  cars: any;
  shootables: any;
  pickups: any;
  FX: any;
  puff: any;
  losFactor: any;
  keys: any;
  camYaw: any;
  camPitch: any;
  opts: any;
  world: any;
  weather: any;
  CITY: City;
  TH: any;
  solidAt: any;
  solidAtH: any;
  floorAt: any;
  nearestEdge: any;
  edgeNormal: any;
  moveWithCollision: any;
  makeHuman: any;
  makeCar: any;
  makeAmbulance: any;
  dropRider: any;
  tipBike: any;
  rehome: any;
  spawnCar: any;
  spawnPedAt: any;
  playAnim: any;
  animateWalk: any;
  damage: any;
  explode: any;
  burst: any;
  smoke: any;
  wakeParked: any;
  wakeParkedRay: any;
  sfx: any;
  SND: any;
  showMsg: any;
  raiseWanted: any;
  camShake: any;
  freeSkel: any;
  canvasTex: any;
  tracerMat: any;
  makeGun: any;
  dentCar: any;
  rnd: any;
  clamp: any;
  pick: any;
  lerpAngle: any;
  distSegSq: any;
  pointInPoly: any;
  randomRoadPoint: any;
  roadsDrivable: any;
  driveCar: any;
  carFx: any;
  carTerrain: any;
  exitCar: any;
  syncHand: any;
  CHAR: any;
  coneTex: any;
  hurtPlayer: any;
  card: any;
  closeMenu: any;
  saveGame: any;
  lockMouse: any;
  disposeCar: any;
  listeners: any;
  mmHooks: any;
  menuHooks: any;
  rallyLimit: any;
  creative: any;
  creativeSpawnerActive: any;
  pedRoads: any;
  roadsNear: any;
  streetAt: any;
  barrierNear: any;
  storyBusy: any;
  wachen: any;
  nearestRoadDir: any;
  pushOffRoads: any;
  setPocket: any;
  douse?: any;
  emit?: any;
  fHooks?: any;
  heliDrive?: any;
  ignite?: any;
  interiors?: any;
  onG?: any;
  perks?: any;
  shopOpen?: any;
  // Laufrunden (#128): von game.js nach initVokabaum gesetzt
  VOKA_BUSY?: () => boolean;
  PROGRESS_GAIN?: (n: number, why?: string) => void;
  // Rasen (rasen.js): vor initRasen per Object.assign gesetzt
  LOW_GFX?: boolean;
  WEAK_GPU?: boolean;
  waterAt?: (x: number, z: number, y?: number) => any;
  deckAt?: (x: number, z: number, y?: number, reach?: number) => any;
  rasenRoad?: (x: number, z: number) => boolean;
  // per Object.assign nach initWeapons… (game.js)
  wachen: any;
  nearestRoadDir: any;
  pushOffRoads: any;
  setPocket: any;
  inPocket: any;
  streamInit: any;
  roofHeight: any;
  WORLD: City;
  TILES: Map<string, Tile>;
  TS: number;
  WIDX: any;
  // Befund #119: wird nirgends gesetzt, die Abfrage in shops.js ist immer falsch (Verhalten unverändert gelassen)
  menuOpen?: () => boolean;
}

declare global {
  interface Window { G?: any; __noAutoMenu?: boolean; __touch?: boolean; openFeedback?: () => void; }
}

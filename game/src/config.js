// Solmar Heat — V2 tuning. One home for every number the game plays by:
// the size of the world, the feel of the cars, the odds of a gunfight, and
// how the law answers. The renderer draws a 1280x720 window onto this
// fixed world, so nothing here is allowed to depend on the screen size.
//
// V2 changes in this file:
// - ENEMY: enemy fire is now a stated hit chance, not a blind spread. The
//   chance is highest up close and falls with distance, and it is the number
//   the self-test measures. Misses are aimed wide on purpose, never fudged.
// - COP: what a foot cop is worth to the law (heat for a shove, heat for a
//   kill) lives here, next to the police tuning it belongs to.

export const WORLD = { width: 3600, height: 2600 };
export const STEP = 1 / 60;
export const VIEW = { width: 1280, height: 720 };
export const SAVE_KEY = 'solmar-heat.save.v1';

// Roads: verticals and horizontals, 72 wide with a 16 px pavement each side.
export const ROAD_X = [200, 500, 800, 1100, 1400, 1700, 2000, 2300, 2600, 2900, 3200];
export const ROAD_Y = [200, 500, 800, 1100, 1400, 1700, 2000, 2300];
export const ROAD_W = 72;
export const SIDEWALK = 16;

// Vic on foot: size, speeds, health, and the punch.
export const PLAYER = {
  radius: 14,
  walkSpeed: 210,
  runSpeed: 330,
  health: 100,
  punchDamage: 25,
  punchRange: 42,
  punchArc: 1.1,
  punchCooldown: 0.35,
};

// Cars: size and the arcade handling numbers every car shares.
export const CAR = {
  length: 64,
  width: 30,
  accel: 420,
  brake: 700,
  reverseAccel: 260,
  maxSpeed: 560,
  maxReverse: 180,
  steer: 2.6,
  grip: 6.0,
  health: 100,
};

// The law: pursuit tuning, how far out units spawn, how long a hold takes.
export const POLICE = {
  accel: 460,
  maxSpeed: 520,
  ramDamage: 12,
  bustHoldSeconds: 1.2,
  spawnDistance: 700,
  despawnDistance: 1400,
  footSpawnDistance: 420,
};

// Wanted: how long clean and unseen before a star decays, and how many
// police units each star level fields.
export const WANTED = {
  decaySeconds: 22,
  starsMax: 5,
  units: [0, 1, 2, 3, 4, 5],
};

// Hitting a cop is a crime the law sees: heat for landing a blow on one,
// extra heat for killing one. A dead cop drops no cash (see combat.js).
export const COP = {
  hitHeat: 0.6,
  killHeat: 1.2,
};

// Enemy fire. A shot first rolls its hit chance, then aims: a hit tracks
// the target with only a whisper of error, a miss is sent wide of the
// target by a visible margin so the player can see it go past. The chance
// falls linearly with range: closeHitChance at arm's length, farHitChance
// at maxRange.
export const ENEMY = {
  baseHitChance: 0.5,
  closeHitChance: 0.55,
  farHitChance: 0.2,
  maxRange: 420,
  hitErrorRad: 0.02,
  missOffsetMin: 45,
  missOffsetMax: 90,
  shootCooldownMin: 1.1,
  shootCooldownMax: 1.9,
  bulletDamage: 12,
};

// Street life: how many traffic cars and pedestrians, and how fast they go.
export const TRAFFIC = {
  count: 26,
  speed: 150,
  speedJitter: 45,
};
export const PEDS = {
  count: 34,
  walkSpeed: 55,
  walkJitter: 25,
  fleeSpeed: 175,
};

// Sun-soaked coastal city: warm sand, teal sea, terracotta roofs.
export const PALETTE = {
  grass: '#7fb069',
  parkGrass: '#69a357',
  sand: '#e8d5a3',
  sea: '#2e8fa3',
  seaDeep: '#1f6f83',
  road: '#3a3f4a',
  roadEdge: '#565d6d',
  lane: '#e8e3c8',
  sidewalk: '#b9b3a4',
  plaza: '#c9c2b2',
  building: '#d9c8a9',
  buildingAlt: '#c9b18c',
  buildingDowntown: '#b8c4d4',
  buildingDocks: '#a89a86',
  roof: '#b65c3f',
  roofAlt: '#8a6d4b',
  roofDowntown: '#5d6b7d',
  window: '#2c3e55',
  windowLit: '#ffd97a',
  tree: '#4e8a4a',
  treeDark: '#3d7040',
  trunk: '#6b4a2f',
  player: '#f2c94c',
  playerShirt: '#e4572e',
  cop: '#2f6fd0',
  copCar: '#1f4fa0',
  gang: '#8e44ad',
  hudBg: 'rgba(12, 16, 24, 0.72)',
  hudText: '#f5f1e6',
  hudAccent: '#f2c94c',
  hudDanger: '#e5534b',
  hudGood: '#7ee787',
  marker: '#ffcf3f',
  markerPolice: '#ff5d5d',
  sky: '#ffd9a0',
};

export const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';
export const FONT_DISPLAY = '"Arial Black", "Trebuchet MS", sans-serif';

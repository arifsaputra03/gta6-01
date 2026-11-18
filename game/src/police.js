// The wanted system and the police who answer it. Stars rise with crimes
// the law sees and fall when the player stays clean and unseen. Police cars
// spawn off-screen, chase by road and by line of sight, ram the player's
// car, and bust the player when they hold them still. Foot cops chase on foot.
//
// V2 changes in this file:
// - One helper, effectivePlayerPos, answers "where is the player" for every
//   spawn, chase, sight and despawn decision: the car while driving, the
//   feet while walking. No path in this file reads the player's on-foot
//   x/y while the player is in a car — that stale position used to decide
//   where the law went, and it pointed at wherever the player got in.
// - Foot cops are built with makePed and flagged isCop, so combat can tell
//   a cop from a civilian (see combat.js).

import { POLICE, WANTED } from './config.js';
import { makeCar, makePed } from './entities.js';
import { nearestRoadPoint } from './city.js';
import { createRandom } from './random.js';

/** Where the player actually is: the car while driving, the feet on foot. */
export function effectivePlayerPos(world) {
  const vic = world.player;
  if (vic.inCar) return { x: vic.inCar.x, y: vic.inCar.y };
  return { x: vic.x, y: vic.y };
}

export function createWanted() {
  return {
    stars: 0,
    heat: 0, // 0..1 inside the current star level
    cleanTimer: 0, // seconds since the last crime
    sirenTimer: 0,
    bustTimer: 0,
  };
}

/** A crime the law may see: raise heat; stars follow when heat fills. */
export function commitCrime(wanted, amount, seen) {
  if (!seen) amount *= 0.4;
  wanted.heat += amount;
  wanted.cleanTimer = 0;
  while (wanted.heat >= 1 && wanted.stars < WANTED.starsMax) {
    wanted.heat -= 1;
    wanted.stars += 1;
  }
  if (wanted.stars >= WANTED.starsMax) wanted.heat = 0;
}

/** Decay stars when the player has been clean and no cop can see them. */
export function updateWanted(wanted, dt, anyCopSees) {
  wanted.cleanTimer += dt;
  if (wanted.stars > 0 && wanted.cleanTimer > WANTED.decaySeconds && !anyCopSees) {
    wanted.stars -= 1;
    wanted.heat = 0.5;
    wanted.cleanTimer = 0;
  }
  wanted.sirenTimer -= dt;
}

/** A road point some distance from (x, y), for spawning a unit out of sight. */
function roadNear(x, y, minDist, maxDist, dice) {
  for (let tries = 0; tries < 12; tries += 1) {
    const angle = dice.range(0, Math.PI * 2);
    const dist = dice.range(minDist, maxDist);
    const road = nearestRoadPoint(x + Math.cos(angle) * dist, y + Math.sin(angle) * dist);
    if (road) return road;
  }
  return { x, y };
}

/** Spawn one police car on a road near the player, out of the player's view. */
export function spawnPoliceCar(world, dice) {
  const { x: px, y: py } = effectivePlayerPos(world);
  const spot = roadNear(px, py, POLICE.spawnDistance, POLICE.spawnDistance + 500, dice);
  const car = makeCar(spot.x, spot.y, Math.atan2(py - spot.y, px - spot.x), 'police', '#1f4fa0', {
    driver: 'police',
    occupied: true,
    maxSpeed: POLICE.maxSpeed + world.wanted.stars * 10,
    accel: POLICE.accel,
    health: 130,
  });
  car.speed = car.maxSpeed * 0.6;
  return car;
}

/**
 * Chase the player: steer toward them, ram their car, and hold a bust when
 * the player is cornered. Returns 'busting' while a bust is in progress.
 */
export function stepPoliceCar(car, world, dt) {
  const { x: tx, y: ty } = effectivePlayerPos(world);
  const vic = world.player;
  const dx = tx - car.x;
  const dy = ty - car.y;
  const dist = Math.hypot(dx, dy) || 1;
  const wantAngle = Math.atan2(dy, dx);
  let turn = wantAngle - car.angle;
  while (turn > Math.PI) turn -= Math.PI * 2;
  while (turn < -Math.PI) turn += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, turn * 2.2));
  // Full throttle while closing in; keep ramming a car, but pull up and stop
  // on a player on foot — a cop that drives straight through the player can
  // never hold them still long enough to make the bust.
  const throttle = dist > 90 ? 1 : (vic.inCar ? 0.6 : 0);
  // Drive with the shared car physics, steering toward the player.
  const maxFwd = car.maxSpeed;
  if (throttle > 0) car.speed += car.accel * throttle * dt;
  else car.speed -= car.speed * 1.4 * dt;
  if (!vic.inCar && dist < 90) {
    car.speed -= car.speed * 3 * dt;
    if (Math.abs(car.speed) < 10) car.speed = 0;
  }
  if (car.speed > maxFwd) car.speed = maxFwd;
  const speedFactor = Math.min(1, Math.abs(car.speed) / 220);
  car.angle += steer * 2.6 * speedFactor * dt;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.smoke = car.health < 45 ? 1 : 0;

  // Bust: the player's car is stopped (or the player is on foot) and a cop is
  // right on top of them. The timer is NOT decayed here: a second unit would
  // undo a foot cop's hold while it works, so the decay lives in the world's
  // stepPolice, which sees every unit at once.
  const vicStopped = vic.inCar ? Math.abs(vic.inCar.speed) < 25 : true;
  if (dist < 70 && vicStopped) {
    world.wanted.bustTimer += dt;
    if (world.wanted.bustTimer > POLICE.bustHoldSeconds) return 'busted';
    return 'busting';
  }
  return 'chasing';
}

/** A foot cop runs at the player; returns true when it catches them. */
export function stepFootCop(cop, world, dt) {
  const vic = world.player;
  if (vic.inCar) return false;
  const dx = vic.x - cop.x;
  const dy = vic.y - cop.y;
  const dist = Math.hypot(dx, dy) || 1;
  const speed = 265;
  cop.x += (dx / dist) * speed * dt;
  cop.y += (dy / dist) * speed * dt;
  cop.angle = Math.atan2(dy, dx);
  cop.speed = speed;
  if (dist < 30) {
    world.wanted.bustTimer += dt;
    return world.wanted.bustTimer > POLICE.bustHoldSeconds;
  }
  return false;
}

/** Does any police unit have line of sight to the player (within range)? */
export function anyCopSees(world) {
  const { x: px, y: py } = effectivePlayerPos(world);
  for (const car of world.cars) {
    if (car.kind !== 'police' || car.dead) continue;
    if (Math.hypot(car.x - px, car.y - py) < 620) return true;
  }
  for (const cop of world.footCops) {
    if (!cop.dead && Math.hypot(cop.x - px, cop.y - py) < 420) return true;
  }
  return false;
}

/** Spawn one foot cop at the spawn distance from the player's position. */
function spawnFootCop(world, dice) {
  const { x: px, y: py } = effectivePlayerPos(world);
  const angle = dice.range(0, Math.PI * 2);
  const cop = makePed(px + Math.cos(angle) * POLICE.footSpawnDistance, py + Math.sin(angle) * POLICE.footSpawnDistance, {
    color: '#1f4fa0', shirt: '#2f6fd0', health: 50, isCop: true,
  });
  cop.angle = 0;
  cop.speed = 0;
  world.footCops.push(cop);
}

/** Keep the field at the right strength for the current star level. */
export function maintainPolice(world, dice, dt) {
  const carsWanted = WANTED.units[world.wanted.stars] || 0;
  let carsHave = 0;
  for (const car of world.cars) if (car.kind === 'police' && !car.dead) carsHave += 1;
  world.policeTimer = (world.policeTimer ?? 0) - dt;
  if (carsHave < carsWanted && world.policeTimer <= 0) {
    world.cars.push(spawnPoliceCar(world, dice));
    world.policeTimer = 1.6;
  }
  // Foot cops join at 2 stars and up, when the player is on foot. They have
  // their own spawn timer so they do not queue behind the police cars.
  // Their spawn point is the player's effective position — the car when
  // driving (they never spawn while the player drives), the feet on foot.
  const feetWanted = world.wanted.stars >= 2 && !world.player.inCar ? Math.min(2, world.wanted.stars - 1) : 0;
  let feetHave = 0;
  for (const cop of world.footCops) if (!cop.dead) feetHave += 1;
  world.footTimer = (world.footTimer ?? 0) - dt;
  if (feetHave < feetWanted && world.footTimer <= 0) {
    spawnFootCop(world, dice);
    world.footTimer = 2.5;
  }
  // Despawn police that fell far behind, and all of them once the heat is off.
  const { x: px, y: py } = effectivePlayerPos(world);
  world.cars = world.cars.filter((car) => {
    if (car.kind !== 'police' || car.dead) return true;
    if (world.wanted.stars === 0) return false;
    return Math.hypot(car.x - px, car.y - py) < POLICE.despawnDistance;
  });
  world.footCops = world.footCops.filter((cop) => {
    if (cop.dead) return false;
    if (world.wanted.stars < 2) return false;
    return Math.hypot(cop.x - px, cop.y - py) < POLICE.despawnDistance;
  });
}

export const __policeRandom = createRandom;

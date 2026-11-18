// The moving things: the player, cars (driven, traffic, police), pedestrians,
// bullets, pickups and particles. Plain data plus the small physics helpers;
// the world wires them together and owns the rules.
//
// V2 changes in this file:
// - makePed takes isCop: a foot cop is a pedestrian the law owns. Combat
//   reads that flag to decide what a hit means (see combat.js).
// - separateCars anchors mission cars: a car flagged missionCar (the job's
//   objective) is never shoved by a ram or by traffic — the other car takes
//   the whole push instead. An objective the player can shove into a wall
//   is a mission that can soft-lock, so the objective does not move.

import { CAR, PLAYER, WORLD } from './config.js';

let nextId = 1;

export const CAR_COLORS = ['#d94f3d', '#3d7dd9', '#e8b73a', '#7a4fd0', '#e8e3d8', '#3a3f4a', '#2fae7d', '#d97ab0', '#c96a1e'];

export function makeCar(x, y, angle, kind, color, opts = {}) {
  return {
    id: nextId,
    kind, // 'civilian' | 'police' | 'taxi' | 'sport' | 'van' | 'truck'
    x, y, angle,
    speed: 0,
    steer: 0,
    color,
    driver: opts.driver ?? null, // 'player' | 'traffic' | 'police' | null (parked)
    health: opts.health ?? CAR.health,
    maxSpeed: opts.maxSpeed ?? CAR.maxSpeed,
    accel: opts.accel ?? CAR.accel,
    occupied: opts.occupied ?? false,
    parked: opts.parked ?? false,
    target: null, // traffic: {x, y} intersection to drive to
    wait: 0,
    smoke: 0,
    dead: false,
    skid: 0,
    horn: 0,
  };
}

export function makePlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2,
    vx: 0, vy: 0,
    health: PLAYER.health,
    money: 250,
    debt: 50000,
    ammo: 0,
    hasGun: false,
    inCar: null, // the car object while driving
    punchTimer: 0,
    punchAngle: 0,
    invulnerable: 0,
    dead: false,
    busted: false,
    moving: false,
    running: false,
    cashStashes: 0,
  };
}

export function makePed(x, y, opts = {}) {
  return {
    id: nextId,
    x, y,
    angle: Math.random() * Math.PI * 2,
    speed: 0,
    target: null,
    flee: 0,
    fleeX: 0, fleeY: 0,
    color: opts.color ?? '#e8e3d8',
    shirt: opts.shirt ?? '#5b8dd9',
    gang: opts.gang ?? false,
    isCop: opts.isCop ?? false,
    health: opts.health ?? 50,
    dead: false,
    scared: 0,
    wait: 0,
  };
}

export function makeBullet(x, y, angle, from, damage) {
  return { x, y, angle, from, damage, life: 0.9, speed: 900 };
}

export function makePickup(x, y, kind, value) {
  return { x, y, kind, value, bob: Math.random() * 6.28, taken: false };
}

export function makeParticle(x, y, vx, vy, life, size, color) {
  return { x, y, vx, vy, life, maxLife: life, size, color };
}

/** One car's arcade physics for dt seconds: throttle -1..1, steer -1..1. */
export function stepCarPhysics(car, throttle, steer, dt, handbrake) {
  const topSpeed = car.maxSpeed;
  const topReverse = 180;
  if (throttle > 0) {
    car.speed += car.accel * throttle * dt;
  } else if (throttle < 0) {
    // Braking first, then reversing once the car has nearly stopped.
    if (car.speed > 5) car.speed -= 700 * dt;
    else car.speed -= 260 * dt;
  } else {
    car.speed -= car.speed * 1.4 * dt;
    if (Math.abs(car.speed) < 4) car.speed = 0;
  }
  if (handbrake) {
    car.speed -= car.speed * 4.5 * dt;
    car.skid = 1;
  } else {
    car.skid = Math.max(0, car.skid - dt * 2);
  }
  if (car.speed > topSpeed) car.speed = topSpeed;
  if (car.speed < -topReverse) car.speed = -topReverse;
  // Steering needs speed, and flips in reverse so the car still turns
  // the way the wheel points.
  const gripFactor = Math.min(1, Math.abs(car.speed) / 220);
  const turnRate = 2.6 * gripFactor * (car.speed < 0 ? -1 : 1);
  car.angle += steer * turnRate * dt;
  const dirX = Math.cos(car.angle);
  const dirY = Math.sin(car.angle);
  const velX = dirX * car.speed;
  const velY = dirY * car.speed;
  car.x += velX * dt;
  car.y += velY * dt;
  car.x = Math.max(20, Math.min(WORLD.width - 20, car.x));
  car.y = Math.max(20, Math.min(WORLD.height - 20, car.y));
  return { vx: velX, vy: velY };
}

/**
 * Circle-vs-circle push for two cars; returns the closing speed, or false
 * when they do not touch. Speeds are NOT damped here — damping every frame
 * while two cars stay in contact would grind both to a halt, so the caller
 * applies its own one-time response (ram damage, shove).
 * A mission car never moves in a push: the other car takes the whole
 * overlap, so a ram cannot shove a job's objective into a wall.
 */
export function separateCars(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const touch = 44;
  if (d >= touch || d < 0.001) return false;
  const push = touch - d;
  const ux = dx / d;
  const uy = dy / d;
  const aAnchored = !!a.missionCar;
  const bAnchored = !!b.missionCar;
  if (aAnchored && bAnchored) return Math.abs(a.speed - b.speed);
  if (aAnchored) {
    b.x += ux * push;
    b.y += uy * push;
  } else if (bAnchored) {
    a.x -= ux * push;
    a.y -= uy * push;
  } else {
    const half = push / 2;
    a.x -= ux * half;
    a.y -= uy * half;
    b.x += ux * half;
    b.y += uy * half;
  }
  return Math.abs(a.speed - b.speed);
}

/** Point (x, y) inside a car's oriented rectangle, inflated by margin. */
export function pointInCar(x, y, car, margin = 0) {
  const c = Math.cos(-car.angle);
  const s = Math.sin(-car.angle);
  const relX = x - car.x;
  const relY = y - car.y;
  const along = relX * c - relY * s;
  const across = relX * s + relY * c;
  return Math.abs(along) <= CAR.length / 2 + margin && Math.abs(across) <= CAR.width / 2 + margin;
}

/** Distance from a point to a car's centre, for proximity checks. */
export function distToCar(x, y, car) {
  return Math.hypot(x - car.x, y - car.y);
}

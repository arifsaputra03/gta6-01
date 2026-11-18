// Combat: the player's punch and pistol, enemy fire, damage, explosions and
// the pickups they leave behind. Bullets are points with a short life; cars
// take damage, smoke, and explode when their health runs out.
//
// V2 changes in this file:
// - Enemy fire is a stated hit chance, not a blind spread. enemyShoot rolls
//   the chance for the range (see config ENEMY), then aims: a hit tracks
//   the target with only a whisper of error, a miss is sent visibly wide.
//   The roll uses the world's seeded generator, so a fight replays exactly.
// - A foot cop is not a civilian. damagePed branches on isCop: a cop never
//   drops cash and never flees like a scared ped — hitting one is a crime
//   the law sees, and killing one raises the heat hard. The same branch
//   covers punches, bullets, explosions and being run over, so melee and
//   gunfire treat cops the same way.
// - bulletTracer gives the renderer the line a bullet actually travels, so
//   the streak on screen matches the path the bullet takes.

import { COP, ENEMY, PLAYER } from './config.js';
import { makeBullet, makeParticle, pointInCar } from './entities.js';
import { commitCrime } from './police.js';

export function createCombat() {
  return { bullets: [], particles: [], skidMarks: [], shake: 0 };
}

/** The hit chance of one enemy shot at this range: close is deadly, far is a prayer. */
export function hitChanceFor(distance) {
  const clamped = Math.max(0, Math.min(ENEMY.maxRange, distance));
  const t = clamped / ENEMY.maxRange;
  return ENEMY.closeHitChance + (ENEMY.farHitChance - ENEMY.closeHitChance) * t;
}

/** The tracer segment a bullet draws: a streak trailing behind its head, along its angle. */
export function bulletTracer(bullet, length = 14) {
  const dirX = Math.cos(bullet.angle);
  const dirY = Math.sin(bullet.angle);
  return {
    x1: bullet.x - dirX * length,
    y1: bullet.y - dirY * length,
    x2: bullet.x,
    y2: bullet.y,
  };
}

/** The player punches in facing direction: hurts peds and cops in range. */
export function playerPunch(world) {
  const vic = world.player;
  if (vic.punchTimer > 0 || vic.inCar) return false;
  vic.punchTimer = PLAYER.punchCooldown;
  vic.punchAngle = vic.angle;
  let landed = false;
  for (const ped of [...world.peds, ...world.footCops]) {
    if (ped.dead) continue;
    const dx = ped.x - vic.x;
    const dy = ped.y - vic.y;
    if (Math.hypot(dx, dy) > PLAYER.punchRange + 14) continue;
    const ang = Math.atan2(dy, dx);
    let diff = ang - vic.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > PLAYER.punchArc) continue;
    damagePed(world, ped, PLAYER.punchDamage, vic);
    landed = true;
  }
  if (landed) world.audio.punch();
  return landed;
}

/** The player fires the pistol toward (tx, ty) in world coordinates. */
export function playerShoot(world, tx, ty) {
  const vic = world.player;
  if (vic.inCar || !vic.hasGun || vic.ammo <= 0) return false;
  if (vic.shootTimer > 0) return false;
  vic.shootTimer = 0.22;
  vic.ammo -= 1;
  const angle = Math.atan2(ty - vic.y, tx - vic.x);
  vic.angle = angle;
  const mx = vic.x + Math.cos(angle) * 22;
  const my = vic.y + Math.sin(angle) * 22;
  world.combat.bullets.push(makeBullet(mx, my, angle, 'player', 34));
  world.combat.shake = Math.max(world.combat.shake, 3);
  for (let i = 0; i < 6; i += 1) {
    world.combat.particles.push(makeParticle(mx, my, Math.cos(angle + (Math.random() - 0.5)) * 120, Math.sin(angle + (Math.random() - 0.5)) * 120, 0.12, 3, '#ffd97a'));
  }
  world.audio.shot();
  return true;
}

/**
 * A gang ped or cop shoots at the player. The shot first rolls its hit
 * chance for the range, then aims honestly: a hit tracks the target, a
 * miss goes wide by a visible margin. The roll is seeded (world.rng), so
 * the same fight plays the same way twice.
 */
export function enemyShoot(world, from, targetX, targetY) {
  const dx = targetX - from.x;
  const dy = targetY - from.y;
  const range = Math.hypot(dx, dy) || 1;
  const base = Math.atan2(dy, dx);
  const rng = world.rng;
  let angle;
  if (rng.chance(hitChanceFor(range))) {
    angle = base + rng.range(-ENEMY.hitErrorRad, ENEMY.hitErrorRad);
  } else {
    const off = rng.range(ENEMY.missOffsetMin, ENEMY.missOffsetMax) * (rng.chance(0.5) ? 1 : -1);
    const ax = targetX + Math.cos(base + Math.PI / 2) * off;
    const ay = targetY + Math.sin(base + Math.PI / 2) * off;
    angle = Math.atan2(ay - from.y, ax - from.x);
  }
  world.combat.bullets.push(makeBullet(from.x, from.y, angle, 'enemy', ENEMY.bulletDamage));
  world.audio.shot();
}

/**
 * Damage a pedestrian. A civilian drops cash sometimes and runs; a cop
 * drops nothing, never flees, and the hit is a crime the law sees — the
 * cop is the witness. Killing a cop raises the heat hard.
 */
export function damagePed(world, ped, damage, attacker) {
  ped.health -= damage;
  if (ped.health > 0) {
    if (ped.isCop) {
      commitCrime(world.wanted, COP.hitHeat, true);
      return false;
    }
    ped.flee = 2;
    ped.fleeX = ped.x - (attacker ? attacker.x : ped.x);
    ped.fleeY = ped.y - (attacker ? attacker.y : ped.y);
    return false;
  }
  ped.dead = true;
  if (ped.isCop) {
    commitCrime(world.wanted, COP.hitHeat + COP.killHeat, true);
    scareNearby(world, ped.x, ped.y, 320);
    return true;
  }
  if (Math.random() < 0.6) {
    world.pickups.push({ x: ped.x, y: ped.y, kind: 'cash', value: 25 + Math.floor(Math.random() * 50), bob: 0, taken: false });
  }
  scareNearby(world, ped.x, ped.y, 320);
  return true;
}

/** Damage a car; at 0 health it explodes (and hurts everyone nearby). */
export function damageCar(world, car, damage) {
  if (car.dead) return;
  car.health -= damage;
  if (car.health > 0) {
    if (car.health < 45) car.smoke = 1;
    return;
  }
  car.dead = true;
  car.health = 0;
  explode(world, car.x, car.y, 90);
}

/** An explosion: particles, shake, noise, area damage. */
export function explode(world, x, y, radius) {
  for (let i = 0; i < 26; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 320;
    world.combat.particles.push(makeParticle(
      x, y, Math.cos(angle) * speed, Math.sin(angle) * speed,
      0.4 + Math.random() * 0.5, 3 + Math.random() * 5,
      ['#ff9f43', '#e5534b', '#ffd97a', '#5a5a5a'][i % 4],
    ));
  }
  world.combat.shake = Math.max(world.combat.shake, 12);
  world.audio.explosion();
  const vic = world.player;
  if (!vic.inCar && Math.hypot(vic.x - x, vic.y - y) < radius) {
    damagePlayer(world, 45, null);
  } else if (vic.inCar && Math.hypot(vic.inCar.x - x, vic.inCar.y - y) < radius + 20) {
    damageCar(world, vic.inCar, 25);
  }
  for (const ped of [...world.peds, ...world.footCops]) {
    if (!ped.dead && Math.hypot(ped.x - x, ped.y - y) < radius) damagePed(world, ped, 80, null);
  }
  for (const car of world.cars) {
    if (!car.dead && car.x !== x && Math.hypot(car.x - x, car.y - y) < radius + 20) damageCar(world, car, 55);
  }
  scareNearby(world, x, y, 480);
}

/** Hurt the player; at 0 health the player is wasted. */
export function damagePlayer(world, amount, from) {
  const vic = world.player;
  if (vic.invulnerable > 0 || vic.dead) return;
  vic.health -= amount;
  vic.invulnerable = 0.4;
  if (vic.health <= 0) {
    vic.health = 0;
    vic.dead = true;
  }
}

/** Every pedestrian in range starts fleeing. Cops are not pedestrians here. */
export function scareNearby(world, x, y, radius) {
  for (const ped of world.peds) {
    if (ped.dead) continue;
    const dx = ped.x - x;
    const dy = ped.y - y;
    if (Math.hypot(dx, dy) < radius) {
      ped.flee = 2.5;
      ped.fleeX = dx;
      ped.fleeY = dy;
    }
  }
}

/** Does this bullet hit a car? The player's own car is never a target. */
function bulletHitsCar(world, b) {
  for (const car of world.cars) {
    if (car.dead || (b.from === 'player' && car === world.player.inCar)) continue;
    if (pointInCar(b.x, b.y, car, 2)) {
      damageCar(world, car, b.damage);
      return true;
    }
  }
  return false;
}

/** Does this enemy bullet hit the player (on foot, or in their car)? */
function bulletHitsPlayer(world, b) {
  const vic = world.player;
  if (!vic.inCar && Math.hypot(b.x - vic.x, b.y - vic.y) < 16) {
    damagePlayer(world, b.damage, null);
    return true;
  }
  if (vic.inCar && pointInCar(b.x, b.y, vic.inCar, 2)) {
    damageCar(world, vic.inCar, b.damage);
    return true;
  }
  return false;
}

/** Does this player bullet hit a pedestrian — cop or civilian? */
function bulletHitsPed(world, b) {
  for (const ped of [...world.peds, ...world.footCops]) {
    if (ped.dead) continue;
    if (Math.hypot(b.x - ped.x, b.y - ped.y) < 16) {
      damagePed(world, ped, b.damage, world.player);
      return true;
    }
  }
  return false;
}

/** Step bullets: move, hit buildings, cars, peds and the player. */
export function stepBullets(world, dt) {
  const { bullets } = world.combat;
  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const b = bullets[i];
    b.x += Math.cos(b.angle) * b.speed * dt;
    b.y += Math.sin(b.angle) * b.speed * dt;
    b.life -= dt;
    let dead = b.life <= 0;
    if (!dead && world.city.buildingAt(b.x, b.y, 2)) {
      dead = true;
      world.combat.particles.push(makeParticle(b.x, b.y, 0, 0, 0.15, 3, '#ffd97a'));
    }
    if (!dead && bulletHitsCar(world, b)) dead = true;
    if (!dead && b.from === 'enemy' && bulletHitsPlayer(world, b)) dead = true;
    if (!dead && b.from === 'player' && bulletHitsPed(world, b)) dead = true;
    if (dead) bullets.splice(i, 1);
  }
}

/** Step particles and skid marks; decay the screen shake. */
export function stepParticles(world, dt) {
  const { particles, skidMarks } = world.combat;
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.92;
    p.vy *= 0.92;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
  for (let i = skidMarks.length - 1; i >= 0; i -= 1) {
    skidMarks[i].life -= dt;
    if (skidMarks[i].life <= 0) skidMarks.splice(i, 1);
  }
  world.combat.shake = Math.max(0, world.combat.shake - dt * 26);
}

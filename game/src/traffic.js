// Traffic and pedestrians. Traffic cars drive the road grid in the right
// lane, turning at intersections and slowing for the car ahead. Pedestrians
// walk the sidewalks, pick new directions at intersections, and flee from
// danger. A car that was just rammed holds its shoved speed for a beat
// instead of braking straight back to cruising speed.

import { ROAD_W, ROAD_X, ROAD_Y, SIDEWALK, TRAFFIC, PEDS, WORLD } from './config.js';
import { CAR_COLORS, makeCar, makePed } from './entities.js';
import { nearestRoad, onRoadSurface } from './city.js';

// How far the lane centre sits from a road's centre line.
const LANE = ROAD_W / 2 - 14;

/** A random point on the road grid: which road, which way along it, which way it faces. */
function randomRoadPoint(rng) {
  const vertical = rng.chance(0.5);
  const road = vertical ? rng.pick(ROAD_X) : rng.pick(ROAD_Y);
  const along = rng.range(120, (vertical ? WORLD.height : WORLD.width) - 120);
  const dir = rng.chance(0.5) ? 1 : -1;
  return { vertical, road, along, dir };
}

export function spawnTrafficCars(city, rng, count) {
  const cars = [];
  for (let i = 0; i < count; i += 1) {
    const spot = randomRoadPoint(rng);
    const x = spot.vertical ? spot.road + (spot.dir > 0 ? LANE : -LANE) : spot.along;
    const y = spot.vertical ? spot.along : spot.road + (spot.dir > 0 ? LANE : -LANE);
    const angle = spot.vertical ? (spot.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (spot.dir > 0 ? 0 : Math.PI);
    const car = makeCar(x, y, angle, rng.pick(['civilian', 'civilian', 'civilian', 'taxi']), rng.pick(CAR_COLORS), {
      driver: 'traffic',
      occupied: true,
      maxSpeed: TRAFFIC.speed + rng.range(-TRAFFIC.speedJitter, TRAFFIC.speedJitter),
    });
    car.speed = car.maxSpeed * rng.range(0.7, 1);
    cars.push(car);
  }
  return cars;
}

export function spawnParkedCars(city, rng, count) {
  const cars = [];
  const spots = [...city.parkingSpots];
  for (let i = 0; i < count && spots.length > 0; i += 1) {
    const spot = spots.splice(Math.floor(rng.next() * spots.length), 1)[0];
    const kind = rng.chance(0.2) ? 'sport' : rng.chance(0.15) ? 'van' : 'civilian';
    const car = makeCar(spot.x, spot.y, 0, kind, rng.pick(CAR_COLORS), {
      parked: true,
      occupied: false,
      maxSpeed: kind === 'sport' ? 640 : kind === 'van' ? 480 : 540,
    });
    cars.push(car);
  }
  return cars;
}

export function spawnPeds(city, rng, count, gangSpots = []) {
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    const spot = randomRoadPoint(rng);
    const side = rng.chance(0.5) ? 1 : -1;
    const off = side * (ROAD_W / 2 + SIDEWALK / 2);
    const x = spot.vertical ? spot.road + off : spot.along;
    const y = spot.vertical ? spot.along : spot.road + off;
    peds.push(makePed(x, y, {
      shirt: rng.pick(['#5b8dd9', '#d95b5b', '#5bd98a', '#e8b73a', '#9b7bd9', '#e8e3d8']),
    }));
  }
  for (const spot of gangSpots) {
    for (let i = 0; i < 3; i += 1) {
      peds.push(makePed(spot.x + rng.range(-50, 50), spot.y + rng.range(-50, 50), {
        gang: true, shirt: '#8e44ad', color: '#3a2b4a', health: 60,
      }));
    }
  }
  return peds;
}

/** The road line in `list` nearest `value`. */
function closestRoadCoord(list, value) {
  let best = list[0];
  let bestD = Math.abs(value - best);
  for (const at of list) {
    const d = Math.abs(value - at);
    if (d < bestD) {
      bestD = d;
      best = at;
    }
  }
  return best;
}

/** The nearest car ahead of `car` on the same road, same direction — or null. */
function carAhead(car, cars) {
  let leader = null;
  let gap = Infinity;
  for (const other of cars) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const forward = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
    const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
    if (forward > 0 && forward < 130 && side < 26 && forward < gap) {
      leader = other;
      gap = forward;
    }
  }
  return leader ? { car: leader, gap } : null;
}

/** At an intersection, pick a new heading: straight, left or right — never a U-turn. */
function chooseTurn(car, rng) {
  const headings = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  const options = [];
  for (const h of headings) {
    const turn = Math.abs(((h - car.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (turn < 0.6) continue; // that heading is back the way it came
    options.push(h);
  }
  car.angle = rng.pick(options);
}

/** Keep a traffic car on the grid: follow the car ahead, turn, hold the lane. */
export function stepTrafficCar(car, cars, dt, rng) {
  const leader = carAhead(car, cars);
  const cruise = leader
    ? Math.max(0, Math.min(car.maxSpeed, leader.car.speed * 0.9 - (130 - leader.gap) * 0.4))
    : car.maxSpeed;
  const target = car.shoveTimer > 0 ? Math.max(cruise, car.speed) : cruise;
  if (car.shoveTimer > 0) car.shoveTimer -= dt;
  car.speed += Math.max(-260 * dt, Math.min(260 * dt, target - car.speed));
  if (car.speed < 0) car.speed = 0;

  const road = nearestRoad(car.x, car.y);
  const goingVertical = Math.abs(Math.cos(car.angle)) < 0.5;
  if (road.dist < 6) {
    const onV = road.axis === 'v';
    const atCrossing = onV
      ? Math.abs(car.y - closestRoadCoord(ROAD_Y, car.y)) < 8
      : Math.abs(car.x - closestRoadCoord(ROAD_X, car.x)) < 8;
    if (atCrossing && !car.turned) {
      car.turned = true;
      chooseTurn(car, rng);
    }
  } else {
    car.turned = false;
  }
  // Drift toward the lane centre of the current road while moving along it.
  if (goingVertical) {
    const laneX = road.axis === 'v'
      ? (Math.sin(car.angle) > 0 ? road.at + LANE : road.at - LANE)
      : car.x;
    car.x += (laneX - car.x) * Math.min(1, dt * 2);
    car.y += Math.sin(car.angle) * car.speed * dt;
  } else {
    const laneY = road.axis === 'h'
      ? (Math.cos(car.angle) > 0 ? road.at + LANE : road.at - LANE)
      : car.y;
    car.y += (laneY - car.y) * Math.min(1, dt * 2);
    car.x += Math.cos(car.angle) * car.speed * dt;
  }
  car.x = Math.max(20, Math.min(WORLD.width - 20, car.x));
  car.y = Math.max(20, Math.min(WORLD.height - 20, car.y));
}

/** Walk a pedestrian along sidewalks; flee from nearby danger. */
export function stepPed(ped, dangers, dt, rng) {
  if (ped.dead) return;
  // A danger in range sets the flee direction; the flee itself runs below.
  let threat = null;
  for (const d of dangers) {
    if (Math.hypot(ped.x - d.x, ped.y - d.y) < d.radius) {
      threat = d;
      break;
    }
  }
  if (threat) {
    ped.flee = 2;
    ped.fleeX = ped.x - threat.x;
    ped.fleeY = ped.y - threat.y;
  }
  if (ped.flee > 0) {
    ped.flee -= dt;
    const len = Math.hypot(ped.fleeX, ped.fleeY) || 1;
    ped.x += (ped.fleeX / len) * PEDS.fleeSpeed * dt;
    ped.y += (ped.fleeY / len) * PEDS.fleeSpeed * dt;
    ped.angle = Math.atan2(ped.fleeY, ped.fleeX);
    ped.speed = PEDS.fleeSpeed;
    ped.scared = 1;
    return;
  }
  ped.scared = Math.max(0, ped.scared - dt);
  if (ped.wait > 0) {
    ped.wait -= dt;
    ped.speed = 0;
    return;
  }
  if (!ped.target) {
    const road = nearestRoad(ped.x, ped.y);
    const side = rng.chance(0.5) ? 1 : -1;
    const along = rng.range(150, 400) * (rng.chance(0.5) ? 1 : -1);
    const off = side * (ROAD_W / 2 + SIDEWALK / 2);
    if (road.axis === 'v') {
      ped.target = { x: road.at + off, y: ped.y + along };
    } else {
      ped.target = { x: ped.x + along, y: road.at + off };
    }
  }
  const dx = ped.target.x - ped.x;
  const dy = ped.target.y - ped.y;
  const dist = Math.hypot(dx, dy);
  const speed = PEDS.walkSpeed + rng.range(-PEDS.walkJitter, PEDS.walkJitter);
  if (dist < 8) {
    ped.target = null;
    if (rng.chance(0.25)) ped.wait = rng.range(1, 4);
    ped.speed = 0;
    return;
  }
  ped.x += (dx / dist) * speed * dt;
  ped.y += (dy / dist) * speed * dt;
  ped.angle = Math.atan2(dy, dx);
  ped.speed = speed;
  // Stay on the sidewalk: if pushed onto the road, step back.
  if (onRoadSurface(ped.x, ped.y) && !onRoadSurface(ped.x - (dx / dist) * 20, ped.y - (dy / dist) * 20)) {
    ped.x -= (dx / dist) * speed * dt * 2;
    ped.y -= (dy / dist) * speed * dt * 2;
  }
}

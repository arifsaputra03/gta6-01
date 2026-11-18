// Staged scenes for the screenshots: a scripted input plus a short autopilot
// drive, so each shot shows a real moment of play — driving, a police chase,
// a mission pickup, a gunfight, the city on foot. Deterministic for a given seed.
//
// V2: the mission scene frames the objective car where it actually parked
// (a real lot spot near the Marina, not the landmark's centre), and there is
// a new combat scene — Vic trading shots with the Vipers, bullets mid-flight
// so the tracers read on screen.

import { enemyShoot, playerShoot } from './combat.js';

export function scriptedInput() {
  const keys = { up: false, down: false, left: false, right: false, run: false, handbrake: false };
  const pointer = { x: 640, y: 360, down: false };
  let queued = 0;
  return {
    held: keys,
    mouse: () => ({ x: pointer.x, y: pointer.y, down: pointer.down }),
    axes: () => ({
      steer: (keys.right ? 1 : 0) - (keys.left ? 1 : 0),
      throttle: (keys.up ? 1 : 0) - (keys.down ? 1 : 0),
    }),
    takeActions: () => {
      const taken = queued;
      queued = 0;
      return taken;
    },
    setHeld: (name, value) => { keys[name] = value; },
    press: (a) => { queued |= a; },
    setMouse: (x, y, down = false) => { pointer.x = x; pointer.y = y; pointer.down = down; },
  };
}

const STEP = 1 / 60;

/** Put Vic in a car at (x, y), facing `angle`, and centre the camera on him. */
function seatPlayer(world, car, x, y, angle) {
  car.x = x;
  car.y = y;
  car.angle = angle;
  car.speed = 0;
  car.driver = 'player';
  car.occupied = true;
  car.parked = false;
  world.player.inCar = car;
  world.player.x = x;
  world.player.y = y;
  world.player.angle = angle;
  world.cameraX = x;
  world.cameraY = y;
}

/** Drive south down a road, steering gently back to the lane centre. */
function cruiseSouth(world, input, seconds, roadX) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const car = world.player.inCar;
    input.setHeld('up', true);
    if (car) {
      const steer = Math.max(-1, Math.min(1, (car.x - roadX) * 0.008));
      input.setHeld('left', steer > 0.15);
      input.setHeld('right', steer < -0.15);
    }
    world.step(STEP, input);
  }
  input.setHeld('up', false);
  input.setHeld('left', false);
  input.setHeld('right', false);
}

/** Let the world run untouched for a while. */
function wait(world, input, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) world.step(STEP, input);
}

/**
 * Stage one named scene on a fresh world. Returns the world, already stepped
 * into the moment the screenshot should capture.
 */
export function stageShot(name, world) {
  const input = scriptedInput();
  world.start();
  if (name === 'drive') {
    // Downtown cruise in Vic's own car, traffic around, mission marker up.
    seatPlayer(world, world.cars[0], 2000, 300, Math.PI / 2);
    cruiseSouth(world, input, 4, 2000);
  } else if (name === 'chase') {
    // Three stars and the law closing in on a downtown straight.
    seatPlayer(world, world.cars[0], 1400, 200, Math.PI / 2);
    world.wanted.stars = 3;
    world.wanted.heat = 0.5;
    cruiseSouth(world, input, 4.5, 1400);
  } else if (name === 'mission') {
    // Hot Property: Vic on foot by the Marina lot, the red Comet GT parked
    // in its lot spot. The camera frames the car where it actually is.
    world.beginMission(1);
    const car = world.missionCar;
    const cx = car ? car.x : 500;
    const cy = car ? car.y : 2060;
    world.player.x = cx - 120;
    world.player.y = cy + 80;
    world.player.angle = Math.atan2(cy - world.player.y, cx - world.player.x);
    world.cameraX = cx;
    world.cameraY = cy;
    wait(world, input, 2.5);
  } else if (name === 'combat') {
    // Street Sweeper: Vic trading shots with the Vipers in the Old Town
    // alley, bullets mid-flight so the tracers read on screen.
    world.beginMission(4);
    world.player.hasGun = true;
    world.player.ammo = 48;
    world.player.x = 700;
    world.player.y = 500;
    world.player.angle = 0;
    world.cameraX = 800;
    world.cameraY = 500;
    const gang = world.peds.filter((p) => p.gang && !p.dead);
    if (gang.length > 0) {
      const target = gang[0];
      world.player.angle = Math.atan2(target.y - world.player.y, target.x - world.player.x);
      // Vic fires; a Viper answers. Both rounds are still in the air when
      // the shot is taken, so the tracers are visible.
      playerShoot(world, target.x, target.y);
      enemyShoot(world, target, world.player.x, world.player.y);
    }
    wait(world, input, 0.12);
  } else {
    // On foot in the Downtown rush hour.
    world.player.x = 1700;
    world.player.y = 1150;
    world.player.angle = 0;
    world.cameraX = 1700;
    world.cameraY = 1150;
    input.setHeld('right', true);
    wait(world, input, 3);
    input.setHeld('right', false);
  }
  return world;
}

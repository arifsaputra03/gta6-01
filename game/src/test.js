// The self-test: ?test=1 runs a scripted pass over every system — walk,
// enter and drive a car, steal a parked car, commit a crime and earn a
// wanted star, police spawning and chasing, mission completion, save/load,
// a bust — and reports pass/fail per check into the DOM and window.__testResult.
//
// V2 adds a regression test for every hostile-audit fix, so a fix that
// regresses fails the suite instead of shipping quietly:
//   R1 save-after-mission      R2 police spawn from the effective position
//   R3 enemy hit chance + tracer geometry
//   R4 cop melee (no flee, no cash, wanted rises)
//   R5 bullet damage vs foot cops and police cars
//   R6 mission-2 lot spawn, ram anchoring, marker follows, end-to-end
//   R7 walk north is north (the inverted on-foot Y axis)

import { createWorld } from './world.js';
import { scriptedInput } from './shots.js';
import { loadSave, saveGame, clearSave } from './save.js';
import { makeCar, makePed } from './entities.js';
import { maintainPolice } from './police.js';
import { bulletTracer, damagePed, enemyShoot, hitChanceFor, playerPunch, playerShoot, stepBullets } from './combat.js';
import { createRandom } from './random.js';
import { ROAD_X, ROAD_Y } from './config.js';

const STEP = 1 / 60;
const ACTION_INTERACT = 4;

function run(world, input, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) world.step(STEP, input);
}

export function runSelfTest() {
  const results = [];
  const check = (name, pass, detail = '') => {
    results.push({ name, pass: !!pass, detail });
    // eslint-disable-next-line no-console
    console.log(`[test] ${pass ? 'PASS' : 'FAIL'} ${name} ${detail}`);
  };

  try {
    // 1. Walk on foot.
    {
      const world = createWorld(7);
      const input = scriptedInput();
      const x0 = world.player.x;
      const y0 = world.player.y;
      input.setHeld('up', true);
      run(world, input, 1);
      const moved = Math.hypot(world.player.x - x0, world.player.y - y0);
      check('walk', moved > 100, `moved ${moved.toFixed(0)}px`);
    }

    // 2. Enter the player's own car.
    let carWorld;
    {
      const world = createWorld(7);
      carWorld = world;
      const input = scriptedInput();
      const car = world.cars[0];
      world.player.x = car.x;
      world.player.y = car.y + 40;
      input.press(ACTION_INTERACT);
      run(world, input, 0.1);
      check('enter-car', world.player.inCar === car, world.player.inCar ? 'in car' : 'still on foot');
    }

    // 3. Drive it.
    {
      const world = carWorld;
      const input = scriptedInput();
      const car = world.player.inCar;
      const x0 = car.x;
      const y0 = car.y;
      input.setHeld('up', true);
      run(world, input, 2);
      const moved = Math.hypot(car.x - x0, car.y - y0);
      check('drive', Math.abs(car.speed) > 150 && moved > 300, `speed ${car.speed.toFixed(0)} moved ${moved.toFixed(0)}px`);
    }

    // 4. Steal a parked car.
    {
      const world = createWorld(7);
      const input = scriptedInput();
      const parked = world.cars.find((c) => c.parked && !c.missionCar);
      world.player.x = parked.x + 40;
      world.player.y = parked.y;
      input.press(ACTION_INTERACT);
      run(world, input, 0.1);
      check('steal-parked-car', world.player.inCar === parked, world.player.inCar ? 'stole it' : 'failed to enter');
    }

    // 5. Crime raises a wanted star (shots fired, unseen: 0.35 * 0.4 each).
    let wantedWorld;
    {
      const world = createWorld(7);
      wantedWorld = world;
      const input = scriptedInput();
      world.player.hasGun = true;
      world.player.ammo = 30;
      const ped = world.peds.find((p) => !p.gang) || world.peds[0];
      ped.x = world.player.x + 120;
      ped.y = world.player.y;
      ped.wait = 99;
      for (let i = 0; i < 120; i += 1) {
        input.setMouse(ped.x - (world.cameraX - 640), ped.y - (world.cameraY - 360), true);
        world.step(STEP, input);
      }
      input.setMouse(640, 360, false);
      check('wanted-star', world.wanted.stars >= 1, `stars ${world.wanted.stars} heat ${world.wanted.heat.toFixed(2)}`);
    }

    // 6. Police spawn and chase at 2 stars. The player drives, so they cannot
    // be busted mid-test (a stationary player on foot would be — correctly).
    {
      const world = wantedWorld;
      const input = scriptedInput();
      world.over = false;
      const car = world.cars[0];
      world.player.x = car.x;
      world.player.y = car.y + 40;
      input.press(ACTION_INTERACT);
      run(world, input, 0.2);
      world.wanted.stars = 2;
      world.wanted.heat = 0.5;
      input.setHeld('up', true);
      run(world, input, 6);
      const cops = world.cars.filter((c) => c.kind === 'police' && !c.dead);
      const px = world.player.inCar ? world.player.inCar.x : world.player.x;
      const py = world.player.inCar ? world.player.inCar.y : world.player.y;
      const nearest = cops.length ? Math.min(...cops.map((c) => Math.hypot(c.x - px, c.y - py))) : Infinity;
      check('police-chase', cops.length >= 1 && nearest < 1000, `${cops.length} police car(s), nearest ${nearest.toFixed(0)}px`);
    }

    // 7. Mission 1 completes: enter car, drive to the Safehouse.
    let missionWorld;
    {
      const world = createWorld(7);
      missionWorld = world;
      const input = scriptedInput();
      world.start();
      const car = world.cars[0];
      world.player.x = car.x;
      world.player.y = car.y + 40;
      input.press(ACTION_INTERACT);
      run(world, input, 0.2);
      const entered = world.player.inCar === car;
      car.x = 500;
      car.y = 500;
      run(world, input, 0.5);
      check('mission-complete', entered && world.missionsDone === 1 && world.player.money === 750,
        `entered=${entered} done=${world.missionsDone} money=$${world.player.money} mission=${world.mission.index}`);
    }

    // 8. Save and load round-trip.
    {
      const world = missionWorld;
      saveGame(world);
      const data = loadSave();
      check('save-load', !!data && data.money === world.player.money && data.missionIndex === world.mission.index,
        data ? `money=$${data.money} mission=${data.missionIndex}` : 'no save data');
      clearSave();
    }

    // 9. A bust: cop car on top of a stationary player.
    {
      const world = createWorld(7);
      const input = scriptedInput();
      world.start();
      world.wanted.stars = 2;
      const cop = makeCar(world.player.x + 30, world.player.y, Math.PI, 'police', '#1f4fa0', {
        driver: 'police', occupied: true, maxSpeed: 600, accel: 400, health: 130,
      });
      cop.speed = 0;
      world.cars.push(cop);
      run(world, input, 4);
      check('bust', world.over === 'busted', `over=${world.over} money=$${world.player.money}`);
    }

    // 10. Streets are busy.
    {
      const world = createWorld(7);
      check('traffic-and-peds', world.cars.length >= 20 && world.peds.length >= 20,
        `${world.cars.length} cars, ${world.peds.length} peds`);
    }

    // --- Regression tests: one per hostile-audit fix ------------------------

    // R1. The save written by a mission completion names the NEXT mission,
    // so Continue never replays the job just finished. (V1 saved the
    // finished mission's index: missionIndex 0 after mission 1.)
    {
      const world = createWorld(7);
      const input = scriptedInput();
      world.start();
      const car = world.cars[0];
      world.player.x = car.x;
      world.player.y = car.y + 40;
      input.press(ACTION_INTERACT);
      run(world, input, 0.2);
      car.x = 500;
      car.y = 500;
      run(world, input, 0.5);
      const data = loadSave();
      check('R1-save-after-mission',
        world.missionsDone === 1 && !!data && data.missionIndex === 1 && data.missionsDone === 1,
        data ? `saved mission=${data.missionIndex} done=${data.missionsDone} live mission=${world.mission.index}` : 'no save written');
      clearSave();
    }

    // R2a. Police cars spawn near the car the player is driving (700-1200px
    // out, on a road), not near wherever the player got in.
    {
      const world = createWorld(7);
      const car = world.cars[0];
      car.x = 2000;
      car.y = 500;
      car.angle = Math.PI / 2;
      car.driver = 'player';
      car.occupied = true;
      car.parked = false;
      world.player.inCar = car;
      world.player.x = car.x;
      world.player.y = car.y;
      world.wanted.stars = 2;
      world.wanted.heat = 0.5;
      for (let i = 0; i < 180; i += 1) maintainPolice(world, world.rng, STEP);
      const cops = world.cars.filter((c) => c.kind === 'police' && !c.dead);
      const nearest = cops.length ? Math.min(...cops.map((c) => Math.hypot(c.x - car.x, c.y - car.y))) : Infinity;
      check('R2a-police-spawn-from-car', cops.length >= 1 && nearest < 1300,
        `${cops.length} police car(s), nearest ${nearest.toFixed(0)}px from the car`);
    }

    // R2b. Foot cops spawn near the player on foot (exactly 420px out), from
    // the player's current position.
    {
      const world = createWorld(7);
      world.player.x = 2000;
      world.player.y = 1500;
      world.wanted.stars = 3;
      world.wanted.heat = 0.5;
      for (let i = 0; i < 180; i += 1) maintainPolice(world, world.rng, STEP);
      const nearest = world.footCops.length
        ? Math.min(...world.footCops.map((c) => Math.hypot(c.x - 2000, c.y - 1500)))
        : Infinity;
      check('R2b-foot-cop-spawn-from-player', world.footCops.length >= 1 && nearest < 600,
        `${world.footCops.length} foot cop(s), nearest ${nearest.toFixed(0)}px from the player`);
    }

    // R2c. After a bust, the heat is cleared around the respawn point: a
    // police car parked next to the Safehouse is gone, a far one stays.
    {
      const world = createWorld(7);
      const near = makeCar(600, 560, 0, 'police', '#1f4fa0', { driver: 'police', occupied: true, health: 130 });
      const far = makeCar(2000, 500, 0, 'police', '#1f4fa0', { driver: 'police', occupied: true, health: 130 });
      world.cars.push(near, far);
      world.wanted.stars = 2;
      world.bustPlayer();
      check('R2c-bust-clears-nearby-police',
        !world.cars.includes(near) && world.cars.includes(far) && world.wanted.stars === 0,
        `near cop gone=${!world.cars.includes(near)} far cop kept=${world.cars.includes(far)} stars=${world.wanted.stars}`);
    }

    // R3a. The hit-chance curve is what config says: 55% up close, 20% at
    // max range, falling in between.
    {
      const close = hitChanceFor(0);
      const mid = hitChanceFor(210);
      const far = hitChanceFor(420);
      check('R3a-hit-chance-curve',
        close === 0.55 && far === 0.2 && mid > far && mid < close && Math.abs(mid - 0.375) < 0.01,
        `0px=${close} 210px=${mid.toFixed(3)} 420px=${far}`);
    }

    // R3b. The measured hit rate matches the configured chance: ~47% at
    // 100px, ~21% at 400px, in a cleared lane (no traffic in the way).
    // The target is the player — enemy bullets only ever check the player,
    // which is who they are aimed at.
    {
      const rateAt = (distance) => {
        const world = createWorld(7);
        world.cars = [];
        world.peds = [];
        world.footCops = [];
        world.player.x = 1000 + distance;
        world.player.y = 1400;
        world.player.inCar = null;
        world.rng = createRandom(1234);
        const shooter = { x: 1000, y: 1400 };
        let hits = 0;
        const trials = 200;
        for (let t = 0; t < trials; t += 1) {
          // The shot is fired from combat.js (not hand-rolled), then the
          // bullet is stepped until it lands or dies.
          world.player.health = 100;
          world.player.invulnerable = 0;
          world.player.dead = false;
          world.combat.bullets = [];
          enemyShoot(world, shooter, world.player.x, world.player.y);
          for (let s = 0; s < 60 && world.combat.bullets.length > 0; s += 1) {
            stepBullets(world, STEP);
          }
          if (world.player.health < 100) hits += 1;
        }
        return hits / trials;
      };
      const r100 = rateAt(100);
      const r400 = rateAt(400);
      check('R3b-measured-hit-rate',
        r100 >= 0.35 && r100 <= 0.60 && r400 >= 0.08 && r400 <= 0.35 && r100 > r400,
        `100px=${(r100 * 100).toFixed(0)}% (expect ~47%) 400px=${(r400 * 100).toFixed(0)}% (expect ~21%)`);
    }

    // R3c. The tracer a bullet draws runs along the bullet's own angle.
    {
      const diag = bulletTracer({ x: 100, y: 100, angle: Math.PI / 4 });
      const flat = bulletTracer({ x: 100, y: 100, angle: 0 });
      const diagAngle = Math.atan2(diag.y2 - diag.y1, diag.x2 - diag.x1);
      const diagLen = Math.hypot(diag.x2 - diag.x1, diag.y2 - diag.y1);
      check('R3c-tracer-follows-angle',
        Math.abs(diagAngle - Math.PI / 4) < 1e-9 && Math.abs(diagLen - 14) < 1e-9
        && flat.y1 === 100 && flat.y2 === 100 && flat.x1 === 86 && flat.x2 === 100,
        `diagonal tracer angle=${diagAngle.toFixed(3)} len=${diagLen.toFixed(1)}`);
    }

    // R4a. Punching a cop: the cop does not flee like a scared civilian, and
    // the hit raises the heat (the law sees an attack on its own).
    {
      const world = createWorld(7);
      const cop = makePed(520, 560, { isCop: true });
      world.footCops = [cop];
      world.player.x = 500;
      world.player.y = 560;
      world.player.angle = 0;
      world.player.punchTimer = 0;
      playerPunch(world);
      check('R4a-punch-cop-no-flee-wanted-rises',
        cop.health === 25 && cop.flee === 0 && world.wanted.heat >= 0.5 && world.wanted.stars === 0,
        `cop health=${cop.health} flee=${cop.flee} heat=${world.wanted.heat.toFixed(2)} stars=${world.wanted.stars}`);
    }

    // R4b. Killing a cop drops no cash and raises a star.
    {
      const world = createWorld(7);
      const cop = makePed(520, 560, { isCop: true });
      world.footCops = [cop];
      const before = world.pickups.length;
      damagePed(world, cop, 100, world.player);
      check('R4b-kill-cop-no-cash-star-rises',
        cop.dead && world.pickups.length === before && world.wanted.stars >= 1,
        `dead=${cop.dead} pickups +${world.pickups.length - before} stars=${world.wanted.stars}`);
    }

    // R4c. Civilians are unchanged: a punch scares them (no wanted), and a
    // dead civilian sometimes drops cash — while 20 dead cops drop none.
    {
      const world = createWorld(7);
      const ped = makePed(520, 560, {});
      world.peds = [ped];
      world.player.x = 500;
      world.player.y = 560;
      world.player.angle = 0;
      world.player.punchTimer = 0;
      playerPunch(world);
      const pedScared = ped.flee > 0 && world.wanted.heat === 0;
      let pedCash = 0;
      let copCash = 0;
      for (let i = 0; i < 20; i += 1) {
        const p = makePed(1000 + i * 3, 1000, {});
        const c = makePed(1000 + i * 3, 1200, { isCop: true });
        const pb = world.pickups.length;
        damagePed(world, p, 200, world.player);
        pedCash += world.pickups.length - pb;
        const cb = world.pickups.length;
        damagePed(world, c, 200, world.player);
        copCash += world.pickups.length - cb;
      }
      check('R4c-ped-vs-cop-cash',
        pedScared && pedCash >= 1 && copCash === 0,
        `ped scared=${pedScared} ped cash x${pedCash}/20, cop cash x${copCash}/20`);
    }

    // R4d. Running a foot cop over: the cop dies and the heat rises. The
    // wanted level is held at 2 so maintainPolice keeps the cop in the
    // world (at 0 stars it despawns every foot cop each step — the same
    // artifact that hid bullet damage in V1).
    {
      const world = createWorld(7);
      world.peds = [];
      const car = world.cars[0];
      world.cars = [car];
      car.x = 1000;
      car.y = 1400;
      car.angle = 0;
      car.speed = 300;
      car.driver = 'player';
      car.occupied = true;
      car.parked = false;
      world.player.inCar = car;
      world.player.x = car.x;
      world.player.y = car.y;
      const cop = makePed(1120, 1400, { isCop: true });
      world.footCops = [cop];
      world.wanted.stars = 2;
      world.wanted.heat = 0.5;
      const input = scriptedInput();
      input.setHeld('up', true);
      run(world, input, 0.6);
      check('R4d-run-over-cop',
        cop.dead && world.wanted.stars >= 2,
        `cop dead=${cop.dead} stars=${world.wanted.stars} heat=${world.wanted.heat.toFixed(2)}`);
    }

    // R5a. Bullets hurt a foot cop: two aimed shots kill one (50 health,
    // 34 per shot), with the wanted level held at 2 so the cop stays in
    // the world for the whole test. (V1's 0/12 reading was a harness
    // artifact: with stars at 0, maintainPolice despawned the cop after
    // the first step, so there was nothing left to hit.)
    {
      const world = createWorld(7);
      world.cars = [];
      world.peds = [];
      world.player.x = 500;
      world.player.y = 500;
      world.player.hasGun = true;
      world.player.ammo = 30;
      world.player.shootTimer = 0;
      const cop = makePed(620, 500, { isCop: true });
      world.footCops = [cop];
      world.wanted.stars = 2;
      world.wanted.heat = 0.5;
      const fireOnce = () => {
        world.player.shootTimer = 0;
        playerShoot(world, cop.x, cop.y);
        for (let s = 0; s < 60 && world.combat.bullets.length > 0; s += 1) stepBullets(world, STEP);
      };
      fireOnce();
      const afterOne = cop.health;
      fireOnce();
      check('R5a-bullets-kill-foot-cop',
        afterOne === 16 && cop.dead,
        `after 1 shot health=${afterOne} (expect 16), after 2 dead=${cop.dead}`);
    }

    // R5b. Bullets hurt a police car: one aimed shot drops it 130 -> 96,
    // four kill it (130 health, 34 per shot).
    {
      const world = createWorld(7);
      world.peds = [];
      world.player.x = 500;
      world.player.y = 500;
      world.player.hasGun = true;
      world.player.ammo = 30;
      world.player.shootTimer = 0;
      const policeCar = makeCar(620, 500, 0, 'police', '#1f4fa0', { driver: 'police', occupied: true, health: 130 });
      world.cars = [policeCar];
      world.wanted.stars = 2;
      world.wanted.heat = 0.5;
      const fireOnce = () => {
        world.player.shootTimer = 0;
        playerShoot(world, policeCar.x, policeCar.y);
        for (let s = 0; s < 60 && world.combat.bullets.length > 0; s += 1) stepBullets(world, STEP);
      };
      fireOnce();
      const afterOne = policeCar.health;
      fireOnce();
      fireOnce();
      fireOnce();
      check('R5b-bullets-kill-police-car',
        afterOne === 96 && policeCar.dead,
        `after 1 shot health=${afterOne} (expect 96), after 4 dead=${policeCar.dead}`);
    }

    // R6a. Mission 2 parks the Comet in a real lot spot: at the curb of a
    // road (34px off the centre — clear of the driving lane), clear of the
    // cross road, not inside a building, near the Marina, marker on the car.
    // (V1 parked it at (500,2060): dead centre of road x=500, in the lane.)
    {
      const world = createWorld(7);
      world.beginMission(1);
      const car = world.missionCar;
      const dRoadX = Math.min(...ROAD_X.map((rx) => Math.abs(car.x - rx)));
      const dRoadY = Math.min(...ROAD_Y.map((ry) => Math.abs(car.y - ry)));
      const dLandmark = Math.hypot(car.x - 500, car.y - 2000);
      const marker = world.missionMarker;
      const markerOff = marker ? Math.hypot(marker.x - car.x, marker.y - car.y) : Infinity;
      check('R6a-mission2-lot-spawn',
        !!car && dRoadX >= 55 && dRoadY >= 30 && !world.city.buildingAt(car.x, car.y, 26)
        && dLandmark <= 400 && markerOff <= 2,
        `car (${car ? car.x : '-'},${car ? car.y : '-'}) dRoadX=${dRoadX} dRoadY=${dRoadY} inBuilding=${!!world.city.buildingAt(car.x, car.y, 26)} dLandmark=${dLandmark.toFixed(0)} markerOff=${markerOff.toFixed(1)}`);
    }

    // R6b. Ram the Comet ten times from four directions: it does not move,
    // takes no damage, and stays enterable. (V1: 35-200px per ram, into
    // buildings on some seeds.)
    {
      const world = createWorld(7);
      world.peds = [];
      world.beginMission(1);
      const car = world.missionCar;
      const x0 = car.x;
      const y0 = car.y;
      const health0 = car.health;
      const pc = world.cars[0];
      world.cars = [pc, car];
      world.wanted.stars = 0;
      pc.driver = 'player';
      pc.occupied = true;
      pc.parked = false;
      world.player.inCar = pc;
      const input = scriptedInput();
      // Rams along the roads, from the west, east, north and south.
      const rams = [
        [car.x - 150, 2000, 0], [car.x + 150, 2000, Math.PI],
        [500, car.y - 150, Math.PI / 2], [500, car.y + 150, -Math.PI / 2],
        [car.x - 150, 2000, 0], [car.x + 150, 2000, Math.PI],
        [500, car.y - 150, Math.PI / 2], [500, car.y + 150, -Math.PI / 2],
        [car.x - 150, 2000, 0], [car.x + 150, 2000, Math.PI],
      ];
      for (const [rx, ry, angle] of rams) {
        pc.x = rx;
        pc.y = ry;
        pc.angle = angle;
        pc.speed = 350;
        input.setHeld('up', true);
        run(world, input, 0.6);
        input.setHeld('up', false);
      }
      const moved = Math.hypot(car.x - x0, car.y - y0);
      // Still enterable after all ten rams. The six seconds of ramming let
      // the world's traffic upkeep respawn cars (world.cars grows back to
      // ~29), and a stray traffic car can end up nearer to Vic than the
      // Comet — nearestCar then (correctly, GTA-style) picks the stranger,
      // which made this check flake ~1 in 8 runs while the Comet never
      // moved or took damage. The guard is that the Comet itself is still
      // enterable, so strip the respawned traffic out before the interact:
      // the ram car is parked far from the lot, out of the 78px interact
      // range, leaving the Comet as the only car in range. (The interact
      // is consumed by the first step of the run below, before that step's
      // traffic upkeep, so no new car can slip in between.)
      world.cars = [pc, car];
      pc.driver = null;
      pc.occupied = false;
      pc.parked = true;
      pc.speed = 0;
      world.player.inCar = null;
      world.player.x = car.x + 40;
      world.player.y = car.y;
      world.player.angle = Math.PI;
      input.press(ACTION_INTERACT);
      run(world, input, 0.1);
      check('R6b-mission2-car-anchored',
        moved <= 5 && car.health === health0 && !car.dead && world.player.inCar === car,
        `moved ${moved.toFixed(1)}px (limit 5) health ${car.health}/${health0} enterable=${world.player.inCar === car}`);
    }

    // R6c. The mission marker follows the objective car when it moves.
    {
      const world = createWorld(7);
      world.beginMission(1);
      const car = world.missionCar;
      car.x += 120;
      const input = scriptedInput();
      run(world, input, 0.1);
      const marker = world.missionMarker;
      const off = marker ? Math.hypot(marker.x - car.x, marker.y - car.y) : Infinity;
      check('R6c-marker-follows-car', off <= 2, `marker ${off.toFixed(1)}px from the car after a 120px move`);
    }

    // R6d. Mission 2 end-to-end: steal the Comet, deliver it to the Garage.
    // (Mission 1 is skipped here, so one completion is missionsDone 1.)
    {
      const world = createWorld(7);
      world.start();
      world.beginMission(1);
      const car = world.missionCar;
      world.cars = [car];
      const input = scriptedInput();
      world.player.x = car.x + 40;
      world.player.y = car.y;
      input.press(ACTION_INTERACT);
      run(world, input, 0.1);
      const stole = world.player.inCar === car;
      car.x = 1100;
      car.y = 800;
      run(world, input, 0.5);
      check('R6d-mission2-end-to-end',
        stole && world.missionsDone === 1 && world.mission.index === 2 && world.player.money === 1250,
        `stole=${stole} done=${world.missionsDone} mission=${world.mission.index} money=$${world.player.money}`);
    }

    // R7a. W walks north: up the screen, decreasing y. (V1 had the Y axis
    // flipped, so W walked south.)
    {
      const world = createWorld(7);
      const input = scriptedInput();
      const y0 = world.player.y;
      const x0 = world.player.x;
      input.setHeld('up', true);
      run(world, input, 1);
      check('R7a-walk-north', world.player.y < y0 - 100 && Math.abs(world.player.x - x0) < 5,
        `y ${y0} -> ${world.player.y.toFixed(0)} (north is -y)`);
    }

    // R7b. S walks south: down the screen, increasing y.
    {
      const world = createWorld(7);
      const input = scriptedInput();
      const y0 = world.player.y;
      input.setHeld('down', true);
      run(world, input, 1);
      check('R7b-walk-south', world.player.y > y0 + 100,
        `y ${y0} -> ${world.player.y.toFixed(0)} (south is +y)`);
    }
  } catch (err) {
    results.push({ name: 'exception', pass: false, detail: String(err && err.stack || err) });
    // eslint-disable-next-line no-console
    console.error('[test] exception', err);
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  const summary = { passed, failed, results };
  window.__testResult = summary;
  const pre = document.getElementById('test-result');
  if (pre) pre.textContent = JSON.stringify(summary, null, 2);
  // eslint-disable-next-line no-console
  console.log(`[test] ${passed}/${results.length} passed`);
  return summary;
}

// The world: everything that moves, collides, pays and chases. One fixed-step
// update per frame wires Vic, the traffic, the pedestrians, the police, the
// missions and the combat together, and hands the renderer the state to draw.
//
// V2 behaviour in this file:
// - A story saves AFTER it completes and the next one has begun, so the
//   saved story index is the job still to do (V1 saved the finished job,
//   and Continue replayed it).
// - On-foot movement reads the keys the right way up: W walks north, up the
//   screen (V1 had the Y axis flipped, so W walked south).
// - A story car parks in a real lot spot near its landmark, never in the
//   driving lane, and the story marker follows the car while the job runs
//   (V1 parked it in the lane, rams shoved it up to 200 px — into buildings
//   on some seeds — and the marker pointed at the empty spawn).
// - Mission cars are anchored against shoves (see entities.js), take no ram
//   or traffic damage, and parked cars are clamped out of buildings every
//   step, so no car can end up where the player cannot reach it.
// - Running a car over a foot cop counts: the cop takes the hit like any
//   pedestrian, and the law sees it (see combat.js).
// - Gang shooters wait a seeded cooldown between shots (world.dice), so a
//   firefight replays exactly for a given seed.

import { CAR, ENEMY, PEDS, PLAYER, STEP, TRAFFIC, WORLD } from './config.js';
import { createCity, nearestRoadPoint } from './city.js';
import { createRandom } from './random.js';
import { distToCar, makeCar, makeParticle, makePed, makePickup, makePlayer, separateCars, stepCarPhysics } from './entities.js';
import { spawnParkedCars, spawnPeds, spawnTrafficCars, stepPed, stepTrafficCar } from './traffic.js';
import { anyCopSees, commitCrime, createWanted, effectivePlayerPos, maintainPolice, stepFootCop, stepPoliceCar, updateWanted } from './police.js';
import { createCombat, damageCar, damagePed, damagePlayer, enemyShoot, explode, playerPunch, playerShoot, scareNearby, stepBullets, stepParticles } from './combat.js';
import { MISSIONS, advanceMission, createMissionState, currentMission, currentStage, finishStory, startMission } from './missions.js';
import { createAudio } from './audio.js';
import { hasSave, saveGame } from './save.js';

/** Straight-line distance between two points. Used everywhere a range is checked. */
function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

const CASH_STASHES = 10;

export function createWorld(seed, opts = {}) {
  const dice = createRandom(seed);
  const town = createCity(seed);
  const audio = createAudio();
  const vic = makePlayer(500, 560);
  const heat = createWanted();
  const combat = createCombat();
  const story = createMissionState();

  const world = {
    seed,
    rng: dice,
    city: town,
    audio,
    player: vic,
    wanted: heat,
    combat,
    mission: story,
    cars: [],
    peds: [],
    footCops: [],
    pickups: [],
    trafficTimer: 0,
    policeTimer: 0,
    sirenTimer: 0,
    playTime: 0,
    missionsDone: 0,
    lastFine: 0,
    banner: null,
    toast: null,
    toastTimer: 0,
    dialogueLine: null,
    dialogueTimer: 0,
    missionMarker: null,
    missionText: null,
    playerX: vic.x,
    playerY: vic.y,
    cameraX: vic.x,
    cameraY: vic.y,
    cameraZoom: 1,
    hasSave: hasSave(),
    bestMoney: 0,
    missionCar: null,
    bankVan: null,
    gangAlive: 0,
    gangKills: 0,
    sprayCooldown: 0,
    clinicCooldown: 0,
    over: false,
    testMode: opts.testMode ?? false,
  };

  // Vic's own car, parked on the road by the safehouse. It is tougher than a
  // random taxi: Vic will need it to survive the heat.
  const ownCar = makeCar(640, 500, 0, 'civilian', '#d94f3d', { parked: true, maxSpeed: 540, health: 200 });
  world.cars.push(ownCar);
  world.cars.push(...spawnTrafficCars(town, dice, TRAFFIC.count));
  world.cars.push(...spawnParkedCars(town, dice, 10));
  world.peds.push(...spawnPeds(town, dice, PEDS.count));
  // Hidden cash stashes for explorers.
  for (let i = 0; i < CASH_STASHES; i += 1) {
    const vertical = dice.chance(0.5);
    const road = vertical ? dice.pick([500, 800, 1100, 1400, 2000, 2600]) : dice.pick([500, 800, 1400, 1700, 2300]);
    const along = dice.range(300, 2200);
    const x = vertical ? road + dice.range(-140, 140) : along;
    const y = vertical ? along : road + dice.range(-140, 140);
    world.pickups.push(makePickup(x, y, 'cash', 100 + dice.int(0, 4) * 50));
  }
  // A health pickup at the clinic, ammo at the gun shop.
  world.pickups.push(makePickup(town.landmarks.clinic.x, town.landmarks.clinic.y + 40, 'health', 40));
  world.pickups.push(makePickup(town.landmarks.gunShop.x, town.landmarks.gunShop.y + 40, 'ammo', 24));

  // --- small helpers ------------------------------------------------------
  function showBanner(text, sub, seconds = 3) {
    world.banner = { text, sub, t: seconds };
  }
  function showToast(text, seconds = 2.5) {
    world.toast = text;
    world.toastTimer = seconds;
  }
  function queueDialogue(lines) {
    world.mission.dialogue = [...lines];
    world.mission.dialogueIndex = 0;
  }
  function landmark(name) {
    const lm = town.landmarks[name];
    return lm ? { x: lm.x, y: lm.y, color: lm.color, label: lm.label } : null;
  }
  function setMarker(x, y, color = '#ffcf3f') {
    world.missionMarker = { x, y, color };
  }
  function clearMarker() {
    world.missionMarker = null;
  }
  /** Where the player actually is: the car while driving, the feet on foot. */
  function playerPos() {
    return effectivePlayerPos(world);
  }
  function nearestCar(maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of world.cars) {
      if (car.dead) continue;
      const d = distToCar(vic.x, vic.y, car);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  // --- missions -----------------------------------------------------------
  function beginMission(index) {
    startMission(story, index);
    queueDialogue(MISSIONS[index].dialogue);
    setupStage();
  }

  // One setup routine per stage kind. A stage that needs the world (a car to
  // park, a crew to spawn, a van to roll) does it here, once, when it begins.
  const STAGE_SETUP = {
    steal(stage) {
      // Park the objective in a real lot spot near the landmark — never in
      // the driving lane, where the player would ram it on arrival.
      const at = landmark(stage.target) || { x: 800, y: 2000 };
      const spot = town.nearestParkingSpot(at.x, at.y);
      const px = spot ? spot.x : at.x;
      const py = spot ? spot.y : at.y + 60;
      const car = makeCar(px, py, 0, stage.carKind || 'sport', '#d94f3d', {
        parked: true, maxSpeed: 640,
      });
      car.missionCar = true;
      world.cars.push(car);
      world.missionCar = car;
      setMarker(car.x, car.y, '#ff3b30');
    },
    goto(stage) {
      const at = landmark(stage.target);
      if (at) setMarker(at.x, at.y, at.color);
    },
    deliver(stage) {
      const at = landmark(stage.target);
      if (at) setMarker(at.x, at.y, at.color);
    },
    timed(stage) {
      const at = landmark(stage.target);
      if (at) setMarker(at.x, at.y, at.color);
    },
    pickup(stage) {
      const at = landmark(stage.target);
      const spot = at ? { x: at.x, y: at.y + 40 } : { x: 2000, y: 2000 };
      world.pickups.push(makePickup(spot.x, spot.y, stage.pickupKind, 48));
      setMarker(spot.x, spot.y, '#c9a2ff');
    },
    eliminate(stage) {
      const base = { x: 800, y: 500 };
      world.gangAlive = 0;
      world.gangKills = 0;
      for (let i = 0; i < stage.count; i += 1) {
        const gx = base.x + dice.range(-90, 90);
        const gy = base.y + dice.range(-90, 90);
        world.peds.push(makePed(gx, gy, { gang: true, shirt: '#8e44ad', color: '#3a2b4a', health: 60 }));
        world.gangAlive += 1;
      }
      setMarker(base.x, base.y, '#8e44ad');
    },
    attackVan() {
      const van = makeCar(1700, 1100, 0, 'van', '#2c3e55', {
        driver: 'traffic', occupied: true, health: 150, maxSpeed: 300, accel: 300,
      });
      van.missionVan = true;
      world.cars.push(van);
      world.bankVan = van;
      setMarker(van.x, van.y, '#ffd97a');
    },
    heat(stage) {
      // A story's heat level is the level the job is built for: set it,
      // rather than only raising a floor, so a hot arrival does not make the
      // job harder than designed.
      heat.stars = stage.stars;
      heat.heat = 0.5;
      heat.cleanTimer = 0;
      clearMarker();
    },
    survive(stage) {
      story.timer = stage.seconds;
      clearMarker();
    },
    loseWanted(stage) {
      const at = landmark(stage.target);
      if (at) setMarker(at.x, at.y, at.color);
    },
    collect() {
      const van = world.bankVan;
      if (van) setMarker(van.x, van.y, '#2fae5f');
    },
  };

  function setupStage() {
    const stage = currentStage(story);
    if (!stage) return;
    story.stageProgress = 0;
    const setup = STAGE_SETUP[stage.type];
    if (setup) setup(stage);
    updateMissionText();
  }

  function updateMissionText() {
    const m = currentMission(story);
    const stage = currentStage(story);
    if (!m || !stage) {
      world.missionText = story.index < 0
        ? { title: 'FREE ROAM', lines: ['The city is yours. Drive, explore,', 'and keep the heat off your back.'] }
        : { title: 'NO MISSION', lines: ['Press Enter at the Safehouse', 'to start the next job.'] };
      return;
    }
    let text = stage.text;
    if (stage.type === 'eliminate') {
      text = `Take out the Vipers (${story.stageProgress}/${stage.count})`;
    } else if (stage.type === 'survive') {
      text = `Survive! ${Math.ceil(story.timer)}s`;
    } else if (stage.type === 'timed') {
      text = `${stage.text} — ${Math.ceil(story.timer)}s left`;
    }
    world.missionText = { title: `${m.name.toUpperCase()}  •  $${m.reward}`, lines: [text] };
  }

  function completeMission() {
    const m = currentMission(story);
    if (!m) return;
    vic.money += m.reward;
    vic.debt = Math.max(0, vic.debt - m.reward);
    world.missionsDone += 1;
    world.bestMoney = Math.max(world.bestMoney, vic.money);
    audio.mission();
    showBanner('MISSION COMPLETE', `${m.name} — +$${m.reward}   Debt left: $${vic.debt.toLocaleString()}`, 3.2);
    const next = story.index + 1;
    if (next >= MISSIONS.length) {
      finishStory(story);
      showBanner('KING OF SOLMAR', 'The debt is paid. The city is yours.', 4);
      clearMarker();
      updateMissionText();
    } else {
      beginMission(next);
    }
    // Save AFTER the next story has begun: the saved story index is the
    // job still to do, so Continue never replays the one just finished.
    saveGame(world);
  }

  function failMission(reason) {
    const m = currentMission(story);
    if (!m) return;
    audio.fail();
    showBanner('MISSION FAILED', reason, 3);
    beginMission(story.index);
  }

  function clearNearbyPolice() {
    // The heat is off after a bust or a clinic visit: the units that caught
    // Vic drive away instead of catching him again on the same street.
    // Measured from where the player actually is (the respawn point here),
    // never from a stale on-foot position left over from driving.
    const p = playerPos();
    world.cars = world.cars.filter((car) => car.kind !== 'police'
      || dist(car.x, car.y, p.x, p.y) > 600);
    world.footCops = [];
  }

  // --- crime, busted, wasted ----------------------------------------------
  function bustPlayer() {
    const fine = Math.max(50, Math.floor(vic.money * 0.1));
    vic.money -= fine;
    world.lastFine = fine;
    heat.stars = 0;
    heat.heat = 0;
    heat.bustTimer = 0;
    audio.busted();
    showBanner('BUSTED', `Fined $${fine}. The heat is off — for now.`, 3);
    respawnPlayer();
    clearNearbyPolice();
    if (story.active) beginMission(story.index);
    world.over = 'busted';
  }
  function wastePlayer() {
    const fine = Math.max(50, Math.floor(vic.money * 0.1));
    vic.money -= fine;
    world.lastFine = fine;
    heat.stars = 0;
    heat.heat = 0;
    audio.busted();
    showBanner('WASTED', `The clinic patched you up for $${fine}.`, 3);
    respawnPlayer();
    clearNearbyPolice();
    if (story.active) beginMission(story.index);
    world.over = 'wasted';
  }
  function respawnPlayer() {
    if (vic.inCar) {
      vic.inCar.driver = null;
      vic.inCar.occupied = false;
      vic.inCar.parked = true;
      vic.inCar.speed = 0;
      vic.inCar = null;
    }
    const safe = town.landmarks.safehouse;
    vic.x = safe.x;
    vic.y = safe.y + 60;
    vic.health = PLAYER.health;
    vic.dead = false;
    vic.invulnerable = 2;
    vic.ammo = Math.max(vic.ammo, 12);
  }

  // --- the per-frame update -------------------------------------------------
  // frameActions: actions already read by the caller this frame (main.js
  // reads them once per frame and hands them to the first step). When null,
  // the world reads them itself — used by the shot staging and the self-test.
  function step(dt, keys, frameActions = null) {
    world.playTime += dt;
    if (world.banner) {
      world.banner.t -= dt;
      if (world.banner.t <= 0) world.banner = null;
    }
    if (world.toastTimer > 0) {
      world.toastTimer -= dt;
      if (world.toastTimer <= 0) world.toast = null;
    }
    if (world.dialogueLine) {
      world.dialogueTimer -= dt;
      if (world.dialogueTimer <= 0) world.dialogueLine = null;
    }
    if (!world.dialogueLine && story.dialogueIndex < story.dialogue.length) {
      const line = story.dialogue[story.dialogueIndex];
      story.dialogueIndex += 1;
      const colon = line.indexOf(':');
      world.dialogueLine = {
        speaker: colon > 0 ? line.slice(0, colon) : 'VIC',
        text: colon > 0 ? line.slice(colon + 1).trim() : line,
      };
      world.dialogueTimer = 3.6;
    }
    if (vic.invulnerable > 0) vic.invulnerable -= dt;
    if (vic.punchTimer > 0) vic.punchTimer -= dt;
    if (vic.shootTimer > 0) vic.shootTimer -= dt;
    if (world.sprayCooldown > 0) world.sprayCooldown -= dt;
    if (world.clinicCooldown > 0) world.clinicCooldown -= dt;

    stepPlayer(dt, keys, frameActions);
    stepCars(dt, keys);
    stepCrowd(dt);
    stepPolice(dt);
    stepBullets(world, dt);
    stepParticles(world, dt);
    stepMission(dt);
    stepPickups(dt);
    stepShops(dt);
    updateWanted(heat, dt, anyCopSees(world));
    maintainPolice(world, dice, dt);

    const driving = !!vic.inCar;
    const speed01 = driving ? Math.abs(vic.inCar.speed) / vic.inCar.maxSpeed : 0;
    audio.engine(speed01, driving);
    world.sirenTimer -= dt;
    if (heat.stars > 0 && world.sirenTimer <= 0) {
      audio.siren();
      world.sirenTimer = 0.85;
    }

    const focus = playerPos();
    world.playerX = focus.x;
    world.playerY = focus.y;
    // Fixed 1:1 zoom: the view is always 1280x720 world units, centred on the player.
    world.cameraZoom = 1;
    world.cameraX += (focus.x - world.cameraX) * Math.min(1, dt * 4);
    world.cameraY += (focus.y - world.cameraY) * Math.min(1, dt * 4);

    if (vic.dead && !world.over) wastePlayer();
  }

  // --- player ---------------------------------------------------------------
  function stepPlayer(dt, keys, frameActions = null) {
    if (vic.dead) return;
    const actions = frameActions ?? keys.takeActions();
    vic.moving = false;
    vic.running = false;
    if (vic.inCar) {
      // Interact exits the car; attack is the horn.
      if (actions & 4) exitCar();
      return;
    }
    const axes = keys.axes();
    const mouse = keys.mouse();
    const run = keys.held.run;
    const speed = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    // Screen up is north, which is -y in world coordinates: the throttle
    // axis is flipped for walking (driving keeps it as forward).
    const mx = axes.steer;
    const my = -axes.throttle;
    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my) || 1;
      vic.x += (mx / len) * speed * dt;
      vic.y += (my / len) * speed * dt;
      vic.moving = true;
      vic.running = run;
      // Face the movement direction, unless aiming the pistol with the mouse.
      if (!(vic.hasGun && mouse.down)) {
        vic.angle = Math.atan2(my, mx);
      }
    }
    if (vic.hasGun && mouse.down) {
      vic.angle = Math.atan2(mouse.y - 360, mouse.x - 640);
    }
    town.resolveCircle(vic, PLAYER.radius);
    town.clamp(vic, PLAYER.radius + 4);
    // Interact: enter the nearest car.
    if (actions & 4) {
      const car = nearestCar(78);
      if (car) enterCar(car);
    }
    // Punch.
    if (actions & 8) playerPunch(world);
    // Shoot with the mouse.
    if (vic.hasGun && mouse.down) {
      const cam = { x: world.cameraX - 640 / world.cameraZoom, y: world.cameraY - 360 / world.cameraZoom };
      const tx = cam.x + mouse.x / world.cameraZoom;
      const ty = cam.y + mouse.y / world.cameraZoom;
      if (playerShoot(world, tx, ty)) {
        commitCrime(heat, 0.35, anyCopSees(world));
        scareNearby(world, vic.x, vic.y, 300);
      }
    }
  }

  function enterCar(car) {
    if (car.dead) return;
    const wasOccupied = car.occupied && car.driver === 'traffic';
    if (wasOccupied) {
      // Yank the driver out: they become a scared pedestrian.
      const driver = makePed(car.x + 40, car.y + 20, { shirt: '#d95b5b' });
      driver.flee = 3;
      driver.fleeX = driver.x - car.x;
      driver.fleeY = driver.y - car.y;
      world.peds.push(driver);
      commitCrime(heat, 0.5, anyCopSees(world));
      showToast('Car stolen! The law saw that...', 2.5);
    }
    car.driver = 'player';
    car.occupied = true;
    car.parked = false;
    vic.inCar = car;
    vic.x = car.x;
    vic.y = car.y;
    vic.angle = car.angle;
    audio.engine(0, true);
  }

  function exitCar() {
    const car = vic.inCar;
    if (!car) return;
    car.driver = null;
    car.occupied = false;
    car.parked = true;
    car.speed = 0;
    vic.inCar = null;
    vic.x = car.x + Math.cos(car.angle + Math.PI / 2) * 40;
    vic.y = car.y + Math.sin(car.angle + Math.PI / 2) * 40;
    vic.angle = car.angle;
    town.resolveCircle(vic, PLAYER.radius);
  }

  // --- cars -----------------------------------------------------------------
  function stepCars(dt, keys) {
    const axes = keys.axes();
    const handbrake = keys.held.handbrake;
    for (const car of world.cars) {
      if (car.dead) continue;
      car.ramCooldown = Math.max(0, (car.ramCooldown ?? 0) - dt);
      if (car === vic.inCar) {
        const before = car.speed;
        stepCarPhysics(car, axes.throttle, axes.steer, dt, handbrake);
        // Building collision: centre + nose + tail circles. Crash damage is
        // charged on the impact itself, not on every frame of a wall graze.
        const wasTouching = car.touchingWall;
        const hit = collideCarWithCity(car);
        if (hit && !wasTouching && Math.abs(before) > 320) {
          damageCar(world, car, 8);
          world.combat.shake = Math.max(world.combat.shake, 5);
          audio.crash();
          spawnSparks(car.x, car.y);
        }
        if (car.skid > 0.5 && Math.abs(car.speed) > 120) {
          world.combat.skidMarks.push({ x: car.x, y: car.y, life: 2.5 });
          if (world.combat.skidMarks.length > 220) world.combat.skidMarks.shift();
        }
        // Exhaust puffs while accelerating.
        if (axes.throttle > 0 && Math.random() < 0.25) {
          const bx = car.x - Math.cos(car.angle) * 30;
          const by = car.y - Math.sin(car.angle) * 30;
          world.combat.particles.push(makeParticle(bx, by, -Math.cos(car.angle) * 40, -Math.sin(car.angle) * 40, 0.4, 3, 'rgba(120,120,120,0.6)'));
        }
      } else if (car.driver === 'police') {
        const result = stepPoliceCar(car, world, dt);
        collideCarWithCity(car);
        if (result === 'busted') bustPlayer();
      } else if (car.driver === 'traffic') {
        stepTrafficCar(car, world.cars, dt, dice);
        collideCarWithCity(car);
      } else if (car.parked) {
        // A parked car that was rammed slides to a stop instead of acting
        // like a concrete wall.
        if (Math.abs(car.speed) > 1) {
          car.x += Math.cos(car.angle) * car.speed * dt;
          car.y += Math.sin(car.angle) * car.speed * dt;
          collideCarWithCity(car);
          car.speed -= car.speed * 1.8 * dt;
          if (Math.abs(car.speed) < 5) car.speed = 0;
        }
        // A parked car never rests inside a building: a shove that pushed
        // it through a wall is undone here, every step.
        collideCarWithCity(car);
      }
    }
    // Car-car separation.
    for (let i = 0; i < world.cars.length; i += 1) {
      for (let j = i + 1; j < world.cars.length; j += 1) {
        const a = world.cars[i];
        const b = world.cars[j];
        if (a.dead || b.dead) continue;
        const impact = separateCars(a, b);
        if (impact === false) continue;
        if (a === vic.inCar || b === vic.inCar) {
          const other = a === vic.inCar ? b : a;
          const heroSpeed = Math.abs(vic.inCar.speed);
          // Shove a same-way car forward to your speed, every frame you stay
          // in contact: ramming through traffic is the point, not a dead stop
          // behind a slow taxi. A head-on car is pushed by the separation
          // itself, so it gets no (clamped-away) negative speed. An anchored
          // story car takes no shove at all — it is the job, not traffic.
          const along = Math.cos(other.angle) * Math.cos(vic.inCar.angle)
            + Math.sin(other.angle) * Math.sin(vic.inCar.angle);
          if (along >= 0 && !other.missionCar) {
            other.speed = Math.max(other.speed, heroSpeed * 0.85);
            other.shoveTimer = 0.7;
          }
          // Damage, sound, shake and a speed loss are one ram per cooldown,
          // not sixty: they key off the player's speed, not the relative speed,
          // which the shove itself equalises away. Police cars are reinforced
          // pursuit vehicles — they do not crumple from being rammed, and they
          // hit less often, so a chase does not write the hero car off.
          const isPolice = other.kind === 'police';
          const ramInterval = isPolice ? 1.5 : 0.5;
          const cooldown = Math.max(a.ramCooldown ?? 0, b.ramCooldown ?? 0);
          if (cooldown <= 0 && heroSpeed > 120) {
            // A police ram still hurts, but the law is trying to stop Vic, not
            // to write his car off in one chase: it costs the hero car less.
            // A story car takes no ram damage: ramming the objective must
            // never destroy the job.
            damageCar(world, vic.inCar, isPolice ? 2 : 5);
            if (!isPolice && !other.missionCar) damageCar(world, other, Math.max(5, Math.floor(heroSpeed / 45)));
            vic.inCar.speed *= 0.8;
            a.ramCooldown = ramInterval;
            b.ramCooldown = ramInterval;
            if (isPolice) {
              commitCrime(heat, 0.3, true);
            }
            audio.crash();
            world.combat.shake = Math.max(world.combat.shake, 4);
          }
        } else if (impact > 320 && !a.missionCar && !b.missionCar) {
          // Two traffic cars clipping each other at speed. Mission cars are
          // exempt: passing traffic must never chip the objective to death.
          const cooldown = Math.max(a.ramCooldown ?? 0, b.ramCooldown ?? 0);
          if (cooldown <= 0) {
            damageCar(world, a, 4);
            damageCar(world, b, 4);
            a.ramCooldown = 0.5;
            b.ramCooldown = 0.5;
          }
        }
      }
    }
    // Cars running over pedestrians — foot cops included: running one over
    // is a crime against the law itself, and damagePed knows the difference.
    for (const car of world.cars) {
      if (car.dead || Math.abs(car.speed) < 60) continue;
      for (const ped of [...world.peds, ...world.footCops]) {
        if (ped.dead) continue;
        if (dist(ped.x, ped.y, car.x, car.y) < 30) {
          damagePed(world, ped, 120, car.driver === 'player' ? vic : null);
          if (car.driver === 'player') {
            commitCrime(heat, 0.5, anyCopSees(world));
            audio.crash();
            showToast('You ran someone over!', 2);
          }
          car.speed *= 0.7;
        }
      }
    }
    // A wrecked car ejects its driver: Vic ends up on foot next to the wreck
    // instead of sitting in a dead car that will never move again.
    if (vic.inCar && vic.inCar.dead) {
      const wreck = vic.inCar;
      vic.inCar = null;
      vic.x = wreck.x + Math.cos(wreck.angle + Math.PI / 2) * 40;
      vic.y = wreck.y + Math.sin(wreck.angle + Math.PI / 2) * 40;
      vic.angle = wreck.angle;
      town.resolveCircle(vic, PLAYER.radius);
      showToast('Your car is wrecked — steal another one!', 3);
    }
    // Remove wrecks that are far away; keep the player's car wrecks.
    world.cars = world.cars.filter((car) => {
      if (!car.dead) return true;
      if (car === vic.inCar) return true;
      const p = playerPos();
      return dist(car.x, car.y, p.x, p.y) < 900;
    });
  }

  function collideCarWithCity(car) {
    const pos = { x: car.x, y: car.y };
    const hit = town.resolveCircle(pos, 26);
    // Nose and tail checks keep the car from clipping corners.
    const nose = { x: car.x + Math.cos(car.angle) * 26, y: car.y + Math.sin(car.angle) * 26 };
    const tail = { x: car.x - Math.cos(car.angle) * 26, y: car.y - Math.sin(car.angle) * 26 };
    const hitNose = town.resolveCircle(nose, 14);
    const hitTail = town.resolveCircle(tail, 14);
    if (hitNose || hitTail) {
      // Push the centre away from the corner it clipped.
      car.x += (nose.x - car.x) * 0.1 + (tail.x - car.x) * 0.1;
      car.y += (nose.y - car.y) * 0.1 + (tail.y - car.y) * 0.1;
    }
    car.x = pos.x;
    car.y = pos.y;
    // A hard hit costs speed once, on impact — not every frame while the car
    // stays in contact, or a wall graze would grind it to a standstill and
    // a chase would die on the first clipped corner. Afterwards the car
    // slides along the wall instead of wedging into it.
    const touching = hit || hitNose || hitTail;
    if (touching && !car.touchingWall && Math.abs(car.speed) > 200) {
      car.speed *= 0.55;
    }
    car.touchingWall = touching;
    return touching;
  }

  function spawnSparks(x, y) {
    for (let i = 0; i < 8; i += 1) {
      world.combat.particles.push(makeParticle(x, y, (Math.random() - 0.5) * 260, (Math.random() - 0.5) * 260, 0.25, 2, '#ffd97a'));
    }
  }

  // --- crowd ------------------------------------------------------------------
  function stepCrowd(dt) {
    const dangers = [];
    for (const b of world.combat.bullets) dangers.push({ x: b.x, y: b.y, radius: 200 });
    const p = playerPos();
    if (vic.inCar && Math.abs(vic.inCar.speed) > 300) dangers.push({ x: p.x, y: p.y, radius: 130 });
    for (const ped of world.peds) {
      if (ped.dead) continue;
      stepPed(ped, dangers, dt, dice);
      town.resolveCircle(ped, 10);
    }
    // Gang members shoot at the player when close and the player is on foot.
    for (const ped of world.peds) {
      if (!ped.gang || ped.dead) continue;
      const d = dist(ped.x, ped.y, p.x, p.y);
      if (d < 420 && !vic.inCar) {
        ped.shootTimer = (ped.shootTimer ?? 0) - dt;
        if (ped.shootTimer <= 0) {
          ped.shootTimer = dice.range(ENEMY.shootCooldownMin, ENEMY.shootCooldownMax);
          enemyShoot(world, ped, p.x, p.y);
        }
      }
    }
    // Count gang kills before the dead are filtered out below: a dead gang
    // ped leaves the crowd, so counting the dead in place would miss them.
    for (const ped of world.peds) {
      if (ped.gang && ped.dead && !ped.counted) {
        ped.counted = true;
        world.gangKills += 1;
      }
    }
    // Despawn far peds, respawn near the player to keep the streets busy.
    const px = p.x;
    const py = p.y;
    let alive = 0;
    for (const ped of world.peds) if (!ped.dead && !ped.gang) alive += 1;
    world.peds = world.peds.filter((ped) => {
      if (ped.gang) return !ped.dead;
      if (ped.dead) return false;
      return dist(ped.x, ped.y, px, py) < 1300;
    });
    if (alive < PEDS.count) {
      const fresh = spawnPeds(town, dice, Math.min(4, PEDS.count - alive));
      for (const ped of fresh) {
        ped.x = px + (Math.random() - 0.5) * 900;
        ped.y = py + (Math.random() - 0.5) * 700;
        world.peds.push(ped);
      }
    }
    // Traffic upkeep: respawn cars that wandered too far.
    let traffic = 0;
    for (const car of world.cars) if (car.driver === 'traffic' && !car.dead && !car.missionVan) traffic += 1;
    world.cars = world.cars.filter((car) => {
      if (car.driver !== 'traffic' || car.dead || car.missionVan) return true;
      return dist(car.x, car.y, px, py) < 1500;
    });
    if (traffic < TRAFFIC.count) {
      const fresh = spawnTrafficCars(town, dice, Math.min(3, TRAFFIC.count - traffic));
      for (const car of fresh) {
        // Park the replacement on a road a good distance from the player, so
        // traffic never pops in right in front of the player's car.
        for (let tries = 0; tries < 8; tries += 1) {
          const angle = dice.range(0, Math.PI * 2);
          const d = dice.range(550, 1000);
          const road = nearestRoadPoint(px + Math.cos(angle) * d, py + Math.sin(angle) * d);
          if (road) {
            car.x = road.x;
            car.y = road.y;
            break;
          }
        }
        world.cars.push(car);
      }
    }
  }

  // --- police -----------------------------------------------------------------
  function stepPolice(dt) {
    let holding = false;
    for (const car of world.cars) {
      if (car.kind !== 'police' || car.dead) continue;
      // Police cars ram the player's car.
      if (vic.inCar && !vic.inCar.dead) {
        const d = dist(car.x, car.y, vic.inCar.x, vic.inCar.y);
        if (d < 60 && Math.abs(car.speed) > 200) {
          damageCar(world, vic.inCar, 3);
        }
        if (d < 70 && Math.abs(vic.inCar.speed) < 25) holding = true;
      } else if (!vic.inCar) {
        if (dist(car.x, car.y, vic.x, vic.y) < 70) holding = true;
      }
    }
    for (const cop of world.footCops) {
      if (cop.dead) continue;
      if (!vic.inCar && dist(cop.x, cop.y, vic.x, vic.y) < 30) holding = true;
      if (stepFootCop(cop, world, dt)) bustPlayer();
    }
    // The bust pressure eases only when no unit is holding the player.
    if (!holding) world.wanted.bustTimer = Math.max(0, world.wanted.bustTimer - dt * 2);
  }

  // --- missions ---------------------------------------------------------------
  function stepMission(dt) {
    const m = currentMission(story);
    const stage = currentStage(story);
    if (!m || !stage || !story.active) return;
    const pos = playerPos();
    // The marker tracks a story car that can move: the steal target is
    // never left pointing at an empty lot.
    if (stage.type === 'steal' && world.missionCar) {
      setMarker(world.missionCar.x, world.missionCar.y, '#ff3b30');
    }
    if (stage.type === 'enterCar') {
      if (vic.inCar) advanceStage();
    } else if (stage.type === 'goto' || stage.type === 'deliver') {
      const at = landmark(stage.target);
      if (at && dist(pos.x, pos.y, at.x, at.y) < stage.radius) advanceStage();
    } else if (stage.type === 'timed') {
      story.timer = story.timer || stage.seconds;
      story.timer -= dt;
      if (story.timer <= 0) {
        failMission('Out of time on the delivery.');
        return;
      }
      const at = landmark(stage.target);
      if (at && dist(pos.x, pos.y, at.x, at.y) < stage.radius) advanceStage();
      updateMissionText();
    } else if (stage.type === 'steal') {
      if (vic.inCar && vic.inCar.missionCar) {
        world.missionCar = null;
        advanceStage();
      }
    } else if (stage.type === 'heat') {
      if (heat.stars >= stage.stars) advanceStage();
    } else if (stage.type === 'survive') {
      story.timer -= dt;
      if (story.timer <= 0) advanceStage();
      updateMissionText();
    } else if (stage.type === 'loseWanted') {
      if (heat.stars === 0) {
        const at = landmark(stage.target);
        if (at && dist(pos.x, pos.y, at.x, at.y) < stage.radius) advanceStage();
      }
    } else if (stage.type === 'pickup') {
      // Completed by the pickup handler below (it calls advanceStage).
    } else if (stage.type === 'eliminate') {
      if (story.stageProgress >= stage.count) advanceStage();
      updateMissionText();
    } else if (stage.type === 'attackVan') {
      const van = world.bankVan;
      if (van && (van.dead || van.health <= 25)) {
        van.speed = 0;
        world.pickups.push(makePickup(van.x, van.y, 'cash', 2500));
        advanceStage();
      } else if (van) {
        setMarker(van.x, van.y, '#ffd97a');
      }
    } else if (stage.type === 'collect') {
      // Completed by the pickup handler below.
    }
  }

  function advanceStage() {
    const result = advanceMission(story);
    if (result === 'done') {
      completeMission();
    } else {
      setupStage();
      audio.click();
    }
  }

  // --- pickups ------------------------------------------------------------------
  function stepPickups(dt) {
    const pos = playerPos();
    for (const p of world.pickups) {
      if (p.taken) continue;
      const d = dist(p.x, p.y, pos.x, pos.y);
      if (d > 34) continue;
      p.taken = true;
      if (p.kind === 'cash') {
        vic.money += p.value;
        vic.cashStashes += 1;
        audio.cash();
        showToast(`+$${p.value}`, 1.6);
      } else if (p.kind === 'health') {
        vic.health = Math.min(100, vic.health + p.value);
        audio.pickup();
        showToast('Health +40', 1.6);
      } else if (p.kind === 'ammo') {
        vic.ammo += p.value;
        vic.hasGun = true;
        audio.pickup();
        showToast(`Ammo +${p.value}`, 1.6);
      } else if (p.kind === 'gun') {
        vic.hasGun = true;
        vic.ammo = Math.max(vic.ammo, p.value);
        audio.pickup();
        showToast('Pistol acquired — click to shoot', 2.5);
        const stage = currentStage(story);
        if (stage && stage.type === 'pickup') advanceStage();
      }
      if (p.kind === 'cash' && world.bankVan && p.value === 2500) {
        const stage = currentStage(story);
        if (stage && stage.type === 'collect') advanceStage();
      }
    }
    world.pickups = world.pickups.filter((p) => !p.taken);
    // Gang kills count toward the eliminate stage.
    const stage = currentStage(story);
    if (stage && stage.type === 'eliminate') {
      story.stageProgress = world.gangKills;
    }
  }

  // --- shops ----------------------------------------------------------------------
  function stepShops(dt) {
    const spray = town.landmarks.sprayShop;
    const clinic = town.landmarks.clinic;
    const pos = playerPos();
    if (vic.inCar && heat.stars > 0 && world.sprayCooldown <= 0) {
      if (dist(pos.x, pos.y, spray.x, spray.y) < 110) {
        if (vic.money >= 100) {
          vic.money -= 100;
          heat.stars = 0;
          heat.heat = 0;
          world.sprayCooldown = 5;
          audio.cash();
          showToast('Resprayed — clean! -$100', 2.5);
        } else {
          showToast('Respray costs $100', 2);
          world.sprayCooldown = 5;
        }
      }
    }
    if (!vic.inCar && vic.health < 100 && world.clinicCooldown <= 0) {
      if (dist(pos.x, pos.y, clinic.x, clinic.y) < 90) {
        if (vic.money >= 50) {
          vic.money -= 50;
          vic.health = 100;
          world.clinicCooldown = 5;
          audio.pickup();
          showToast('Patched up — -$50', 2);
        }
      }
    }
  }

  // --- public API -------------------------------------------------------------------
  // The methods live ON the world object itself and the same object is returned:
  // a spread copy would freeze every primitive and reassigned field (camera,
  // cars, story text, banners, over) at its initial value.
  function start() {
    beginMission(0);
    updateMissionText();
  }

  function camera() {
    return {
      x: world.cameraX - (640 / world.cameraZoom),
      y: world.cameraY - (360 / world.cameraZoom),
      zoom: world.cameraZoom,
      city: town,
    };
  }

  world.step = step;
  world.start = start;
  world.camera = camera;
  world.beginMission = beginMission;
  world.completeMission = completeMission;
  world.failMission = failMission;
  world.bustPlayer = bustPlayer;
  world.wastePlayer = wastePlayer;
  world.showBanner = showBanner;
  world.showToast = showToast;
  world.updateMissionText = updateMissionText;
  world.playerPos = playerPos;
  world.STEP = STEP;
  return world;
}

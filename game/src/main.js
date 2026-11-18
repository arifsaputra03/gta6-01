// Boot and the one loop: input is read once per frame, the game advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// view paints what is there. Screens: title, play, paused, busted,
// wasted and complete. Actions are read once per frame and handed to the
// first game step, so a keypress is never consumed twice or replayed.
//
// ?seed=N fixes the city. ?shot=drive|chase|mission|city|combat (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot. ?test=1 runs the self-test.
import { STEP } from './config.js';
import { createWorld } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import {
  createRenderer,
  SCREEN_BUSTED,
  SCREEN_COMPLETE,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  SCREEN_WASTED,
} from './render.js';
import { stageShot } from './shots.js';
import { runSelfTest } from './test.js';
import { clearSave, loadSave, saveGame } from './save.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const testMode = params.get('test') === '1';
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const game = createWorld(seed);
const view = createRenderer(canvas);
// Debug hook for the self-test and for Playwright verification: the live
// game is reachable so a harness can read money, missions, police and cars
// without guessing from pixels.
window.__world = game;

/** The status line screen readers announce. */
function say(message) {
  status.textContent = message;
}

function runShot(name) {
  stageShot(name, game);
  let painted = 0;
  function paint() {
    view.drawWorld(game, game.camera());
    view.drawHud(game);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runTest() {
  const summary = runSelfTest();
  say(`Self-test: ${summary.passed} passed, ${summary.failed} failed.`);
  view.drawTitle(game);
  window.__testDone = true;
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let sawComplete = false;
  let lag = 0;
  let prev = performance.now();

  function newGame() {
    game.start();
    game.audio.unlock();
    screen = SCREEN_PLAY;
    say('Playing. Pay the debt, Vic.');
  }

  function continueGame() {
    const data = loadSave();
    if (!data) {
      newGame();
      return;
    }
    // The save stores the mission still to do (see world.js completeMission):
    // Continue picks that job up, never the one already finished.
    game.player.money = data.money;
    game.player.debt = data.debt;
    game.player.health = data.health;
    game.player.ammo = data.ammo;
    game.player.hasGun = data.hasGun;
    game.player.cashStashes = data.cashStashes ?? 0;
    game.missionsDone = data.missionsDone;
    game.bestMoney = data.bestMoney ?? 0;
    game.player.x = data.x;
    game.player.y = data.y;
    game.cameraX = data.x;
    game.cameraY = data.y;
    if (data.missionIndex >= 0 && data.missionIndex < 8) {
      game.beginMission(data.missionIndex);
    } else {
      game.mission.index = -1;
      game.updateMissionText();
    }
    game.audio.unlock();
    screen = SCREEN_PLAY;
    say('Welcome back to Solmar.');
  }

  function handleActions(actions) {
    if (actions & ACTION_MUTE) {
      game.audio.setMuted(!game.audio.isMuted());
      say(game.audio.isMuted() ? 'Muted.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) {
        if (game.hasSave) continueGame();
        else newGame();
      }
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        say('Paused.');
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & ACTION_CONFIRM) {
        saveGame(game);
        screen = SCREEN_PLAY;
        say('Saved. Playing.');
      } else if (actions & ACTION_PAUSE) {
        screen = SCREEN_PLAY;
        say('Playing.');
      }
    } else if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
      if (actions & ACTION_CONFIRM) {
        game.over = false;
        screen = SCREEN_PLAY;
        say('Back on the street.');
      }
    } else if (screen === SCREEN_COMPLETE) {
      if (actions & ACTION_CONFIRM) {
        screen = SCREEN_PLAY;
        say('Free roam. The city is yours.');
      }
    }
  }

  /** Paint the current screen (the game underneath, the screen on top). */
  function paint() {
    if (screen === SCREEN_TITLE) {
      view.drawTitle(game);
      return;
    }
    view.drawWorld(game, game.camera());
    if (screen === SCREEN_PLAY) view.drawHud(game);
    else if (screen === SCREEN_PAUSED) view.drawPaused(game);
    else if (screen === SCREEN_BUSTED) view.drawBusted(game);
    else if (screen === SCREEN_WASTED) view.drawWasted(game);
    else if (screen === SCREEN_COMPLETE) view.drawComplete(game);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const delta = Math.min((now - prev) / 1000, MAX_FRAME);
    prev = now;
    const actions = input.takeActions();
    handleActions(actions);
    if (screen === SCREEN_PLAY) {
      lag += delta;
      let first = true;
      while (lag >= STEP && screen === SCREEN_PLAY) {
        game.step(STEP, input, first ? actions : 0);
        first = false;
        lag -= STEP;
        if (game.over === 'busted') {
          screen = SCREEN_BUSTED;
          say('Busted. The Solmar PD caught up with you.');
        } else if (game.over === 'wasted') {
          screen = SCREEN_WASTED;
          say('Wasted. The clinic patched you up.');
        } else if (game.mission.index === -1 && !sawComplete) {
          sawComplete = true;
          screen = SCREEN_COMPLETE;
          say('King of Solmar. The debt is paid.');
        }
      }
    } else {
      lag = 0;
    }
    paint();
  }

  // R on the pause screen restarts the whole story.
  document.addEventListener('keydown', (event) => {
    if ((event.key === 'r' || event.key === 'R') && screen === SCREEN_PAUSED) {
      clearSave();
      window.location.reload();
    }
  });

  // Leaving the tab pauses a running game rather than letting the law catch Vic unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      say('Paused.');
    }
  });

  say('Solmar Heat. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else if (testMode) runTest();
else runGame();

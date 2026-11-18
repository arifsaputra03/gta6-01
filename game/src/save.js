// Save and load: one JSON blob in localStorage holding the money, the debt,
// the mission progress, the position, the health and the ammo. Loading puts
// the player back at the safehouse with the story exactly where it was.
//
// V2 note: the world saves *after* a mission is completed and the next one
// has begun, so the saved mission index is the job still to do — never the
// one just finished. A save that names a finished mission would make the
// player replay it on Continue.

import { SAVE_KEY } from './config.js';

/** The browser's storage, or null where there is none (a bare Node run). */
function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function saveGame(world) {
  const vic = world.player;
  const snap = {
    version: 1,
    money: vic.money,
    debt: vic.debt,
    health: vic.health,
    ammo: vic.ammo,
    hasGun: vic.hasGun,
    missionsDone: world.missionsDone,
    missionIndex: world.mission.index,
    x: vic.inCar ? vic.inCar.x : vic.x,
    y: vic.inCar ? vic.inCar.y : vic.y,
    cashStashes: vic.cashStashes,
    bestMoney: world.bestMoney,
    savedAt: Date.now(),
  };
  try {
    const store = storage();
    if (!store) return false;
    store.setItem(SAVE_KEY, JSON.stringify(snap));
    return true;
  } catch {
    return false;
  }
}

export function loadSave() {
  try {
    const store = storage();
    if (!store) return null;
    const raw = store.getItem(SAVE_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw);
    if (!snap || snap.version !== 1) return null;
    return snap;
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadSave() !== null;
}

export function clearSave() {
  try {
    const store = storage();
    if (store) store.removeItem(SAVE_KEY);
  } catch {
    // Storage can be off; nothing to clear.
  }
}

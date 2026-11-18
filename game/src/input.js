// Keyboard and pointer input. Held keys give movement and steering; one-shot
// presses (confirm, pause, interact, attack, mute) are queued as bit flags
// and taken once by the loop, so a press between two frames is never lost
// and never counted twice. The mouse aims on foot and fires the pistol.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_ATTACK = 8;
export const ACTION_MUTE = 16;
export const ACTION_HANDBRAKE = 32;

// One-shot presses map to a flag; held keys map to a name in `held`.
const PRESS_FLAGS = {
  confirm: ACTION_CONFIRM,
  pause: ACTION_PAUSE,
  interact: ACTION_INTERACT,
  attack: ACTION_ATTACK,
  mute: ACTION_MUTE,
};

const KEYMAP = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  run: ['ShiftLeft', 'ShiftRight'],
  confirm: ['Enter', 'Space'],
  pause: ['KeyP', 'Escape'],
  interact: ['KeyE'],
  attack: ['KeyF'],
  mute: ['KeyM'],
  handbrake: ['Space'],
};

// Inverted once: physical code -> action name.
const BY_CODE = new Map();
for (const [name, codes] of Object.entries(KEYMAP)) {
  for (const code of codes) BY_CODE.set(code, name);
}

export function createInput(canvas) {
  const held = { up: false, down: false, left: false, right: false, run: false, handbrake: false };
  const pointer = { x: 0, y: 0, down: false };
  let actions = 0;

  function actionFor(code) {
    return BY_CODE.get(code) ?? null;
  }

  function queuePress(name) {
    const flag = PRESS_FLAGS[name];
    if (flag) actions |= flag;
  }

  window.addEventListener('keydown', (event) => {
    const name = actionFor(event.code);
    if (!name) return;
    if (PRESS_FLAGS[name]) {
      if (!event.repeat) queuePress(name);
    } else if (name === 'handbrake') {
      held.handbrake = true;
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else {
      held[name] = true;
    }
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    const name = actionFor(event.code);
    if (!name) return;
    if (name === 'handbrake') held.handbrake = false;
    else if (held[name] !== undefined) held[name] = false;
  });
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', () => {
    for (const key of Object.keys(held)) held[key] = false;
    pointer.down = false;
  });

  function trackPointer(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 1280;
    pointer.y = ((event.clientY - rect.top) / rect.height) * 720;
  }
  canvas.addEventListener('pointermove', trackPointer);
  canvas.addEventListener('pointerdown', (event) => {
    trackPointer(event);
    pointer.down = true;
    if (event.button === 0) actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => {
    pointer.down = false;
  });

  return {
    held,
    mouse() {
      return { x: pointer.x, y: pointer.y, down: pointer.down };
    },
    /** -1/0/1 steering and -1/0/1 throttle from the held keys. */
    axes() {
      return {
        steer: (held.right ? 1 : 0) - (held.left ? 1 : 0),
        throttle: (held.up ? 1 : 0) - (held.down ? 1 : 0),
      };
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Drive the virtual input from a script (autopilot / self-test). */
    setHeld(name, value) {
      if (held[name] !== undefined) held[name] = value;
    },
    press(action) {
      actions |= action;
    },
    setMouse(x, y, down) {
      pointer.x = x;
      pointer.y = y;
      pointer.down = down;
    },
  };
}

// Keyboard + touch input. Everything is normalised into a single state object.

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'ShiftLeft', 'ShiftRight', 'KeyJ', 'KeyK', 'KeyL', 'KeyI',
  'KeyE', 'KeyM', 'Escape', 'KeyR',
]);

const TRICK_KEYS = {
  KeyJ: 'backflip',
  KeyK: 'frontflip',
  KeyL: 'sideflip',
  KeyI: 'barspin',
};

export function createInput() {
  const keys = new Set();
  const pressed = new Set();
  const touch = {
    throttle: 0,
    steer: 0,
    wheelie: false,
    jump: false,
    trick: null,
    active: false,
  };

  function down(code) {
    if (keys.has(code)) return;
    keys.add(code);
    pressed.add(code);
  }
  function up(code) {
    keys.delete(code);
  }

  window.addEventListener('keydown', (e) => {
    if (!GAME_KEYS.has(e.code)) return;
    e.preventDefault();
    if (e.repeat) return;
    down(e.code);
  });
  window.addEventListener('keyup', (e) => {
    if (!GAME_KEYS.has(e.code)) return;
    e.preventDefault();
    up(e.code);
  });
  window.addEventListener('blur', () => {
    keys.clear();
    touch.wheelie = false;
    touch.throttle = 0;
    touch.steer = 0;
    touch.trick = null;
  });

  function consume(code) {
    if (pressed.has(code)) {
      pressed.delete(code);
      return true;
    }
    return false;
  }

  function update() {
    const kThrottle = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const kSteer = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    state.throttle = Math.max(-1, Math.min(1, kThrottle + touch.throttle));
    state.steer = Math.max(-1, Math.min(1, kSteer + touch.steer));
    state.wheelie = keys.has('ShiftLeft') || keys.has('ShiftRight') || touch.wheelie;
    let trick = null;
    for (const [code, id] of Object.entries(TRICK_KEYS)) {
      if (keys.has(code)) { trick = id; break; }
    }
    if (!trick) trick = touch.trick;
    state.trick = trick;
    state.groundedWheelie = state.wheelie;
  }

  const state = {
    throttle: 0,
    steer: 0,
    wheelie: false,
    trick: null,
  };

  // Called from the HUD joystick / buttons.
  function setTouchMove(throttle, steer) {
    touch.throttle = throttle;
    touch.steer = steer;
    touch.active = true;
  }
  function setTouchWheelie(on) {
    touch.wheelie = on;
  }
  function setTouchTrick(id) {
    touch.trick = id;
  }
  function tapJump() {
    pressed.add('Space');
  }
  function tap(code) {
    pressed.add(code);
  }

  return {
    keys,
    state,
    consume,
    update,
    setTouchMove,
    setTouchWheelie,
    setTouchTrick,
    tapJump,
    tap,
  };
}

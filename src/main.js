import * as THREE from 'three';
import { createWorld, PARK, SPAWN } from './world.js';
import { createScooter } from './scooter.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import {
  SCOOTERS, TRICKS, TRICK_LIST, WHEELIE, SAVE_KEY, DEFAULT_SAVE,
} from './data.js';
import {
  landingCheck, trickName, createQuest, progressQuest, formatMoney, speedKmh,
} from './logic.js';

/* ==================================================================== */
/* Setup                                                                 */
/* ==================================================================== */

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });

let softwareRenderer = false;
try {
  const gl = renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const gpuName = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
  softwareRenderer = /swiftshader|llvmpipe|software|swangle/i.test(gpuName);
} catch (e) { /* ignore */ }

const isCoarse = window.matchMedia('(pointer: coarse)').matches;
const mobileTier = isCoarse || window.innerWidth < 820;
const SHADOW_SIZE = softwareRenderer ? 1024 : mobileTier ? 1024 : 2048;

renderer.setPixelRatio(softwareRenderer ? 1 : Math.min(window.devicePixelRatio || 1, mobileTier ? 1.5 : 1.8));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1400);
camera.position.set(0, 18, 52);

const world = createWorld(scene);
world.sunLight.shadow.mapSize.set(SHADOW_SIZE, SHADOW_SIZE);
if (SHADOW_SIZE === 1024) {
  world.sunLight.shadow.camera.left = -55;
  world.sunLight.shadow.camera.right = 55;
  world.sunLight.shadow.camera.top = 55;
  world.sunLight.shadow.camera.bottom = -55;
}

/* ==================================================================== */
/* Save / state                                                          */
/* ==================================================================== */

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { ...DEFAULT_SAVE, owned: [...DEFAULT_SAVE.owned] };
    const parsed = JSON.parse(raw);
    const owned = Array.isArray(parsed.owned) && parsed.owned.length ? parsed.owned.filter((id) => SCOOTERS.some((s) => s.id === id)) : ['street'];
    if (!owned.includes('street')) owned.unshift('street');
    const equipped = SCOOTERS.some((s) => s.id === parsed.equipped) ? parsed.equipped : 'street';
    return {
      money: Number.isFinite(parsed.money) ? parsed.money : DEFAULT_SAVE.money,
      owned, equipped,
      bestScore: Number.isFinite(parsed.bestScore) ? parsed.bestScore : 0,
      totalDistance: Number.isFinite(parsed.totalDistance) ? parsed.totalDistance : 0,
      muted: !!parsed.muted,
    };
  } catch (e) {
    return { ...DEFAULT_SAVE, owned: [...DEFAULT_SAVE.owned] };
  }
}

function saveGame() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
}

const save = loadSave();
let scooterData = SCOOTERS.find((s) => s.id === save.equipped) || SCOOTERS[0];

const input = createInput();
const audio = createAudio();
audio.setMuted(save.muted);

const player = {
  x: SPAWN.x, y: 0, z: SPAWN.z,
  yaw: SPAWN.yaw,
  speed: 0, vy: 0,
  grounded: true,
  wheelie: 0,
  wheelieHolding: false,
  crashTimer: 0,
  crashTilt: 0,
  crashReason: '',
  airTime: 0,
  coyote: 0,
  jumpBuffer: 0,
  lastGroundPitch: 0,
  visPitch: 0,
  visRoll: 0,
  crouch: 0,
};

const flip = { id: null, angle: 0, holding: false, settling: false, settleTarget: 0 };
const bar = { angle: 0, holding: false, settling: false, settleTarget: 0 };

const state = {
  mode: 'title',            // title | play | paused | shop
  runScore: 0,
  combo: { mult: 1, points: 0, timer: 0 },
  runDistance: 0,
  distanceFlush: 0,
  airFlush: 0,
  maxSpeed: 0,
  zone: '',
  quests: [],
  time: 0,
  camYaw: SPAWN.yaw,
  shake: 0,
  fovBase: 60,
};

/* ==================================================================== */
/* Player model + HUD                                                    */
/* ==================================================================== */

const model = createScooter(scene, scooterData);
model.applyScooter(scooterData);

const hud = createHud({
  play: () => startRun(),
  restart: () => startRun(),
  pause: () => togglePause(),
  resume: () => resumeGame(),
  openShop: (fromTitle) => openShop(fromTitle),
  closeShop: () => closeShop(),
  mute: () => toggleMute(),
  buy: (id) => buyScooter(id),
  equip: (id) => equipScooter(id),
  reroll: (index) => rerollQuest(index),
  rerollAll: () => { for (let i = 0; i < 3; i++) rerollQuest(i, true); },
}, input, audio);

hud.updateTitleStats(save);
hud.setMoney(save.money);
hud.setScore(0);
hud.setScooter(scooterData);
hud.setMuted(save.muted);
hud.showHud(false);
hud.showTitle(true);

/* ==================================================================== */
/* Quests                                                                */
/* ==================================================================== */

function freshQuests() {
  const diff = Math.floor(state.runScore / 2500);
  const avoid = [];
  const list = [];
  for (let i = 0; i < 3; i++) {
    list.push(createQuest(Math.random, diff, avoid));
    avoid.push(list[i].type);
  }
  state.quests = list;
  hud.updateQuests(state.quests);
}

function emit(event) {
  let changed = false;
  let completed = [];
  state.quests = state.quests.map((q, i) => {
    const next = progressQuest(q, event);
    if (next !== q) changed = true;
    if (next.done && !q.done) completed.push(next);
    return next;
  });
  if (changed) hud.updateQuestProgress(state.quests);
  for (const q of completed) completeQuest(q);
}

function completeQuest(q) {
  addCash(q.reward, q.title);
  hud.showToast(`QUEST COMPLETE · ${q.title.toUpperCase()} · +${formatMoney(q.reward)}`, 'gold');
  audio.quest();
  const index = state.quests.findIndex((x) => x.id === q.id);
  const diff = Math.floor(state.runScore / 2500);
  const avoid = state.quests.filter((x) => x.id !== q.id).map((x) => x.type);
  setTimeout(() => {
    if (state.mode === 'title') return;
    const fresh = createQuest(Math.random, diff, avoid);
    if (index >= 0 && state.quests[index] && state.quests[index].id === q.id) {
      state.quests[index] = fresh;
      hud.updateQuests(state.quests);
    }
  }, 1800);
}

function rerollQuest(index, silent) {
  if (!state.quests[index]) return;
  const avoid = state.quests.filter((x, i) => i !== index).map((x) => x.type);
  const fresh = createQuest(Math.random, Math.floor(state.runScore / 2500), avoid);
  state.quests[index] = fresh;
  hud.updateQuests(state.quests);
  if (!silent) hud.showToast('NEW QUEST · ' + fresh.desc.toUpperCase(), 'teal');
}

/* ==================================================================== */
/* Economy                                                               */
/* ==================================================================== */

function addCash(amount, reason) {
  const value = Math.max(0, Math.round(amount));
  if (value <= 0) return;
  save.money += value;
  state.runScore += value;
  hud.setMoney(save.money);
  hud.setScore(state.runScore);
  saveGame();
}

function buyScooter(id) {
  const s = SCOOTERS.find((x) => x.id === id);
  if (!s || save.owned.includes(id)) return;
  if (save.money < s.price) {
    hud.showToast('NOT ENOUGH CASH · GRAB SOME QUESTS', 'red');
    audio.fail();
    return;
  }
  save.money -= s.price;
  save.owned.push(id);
  save.equipped = id;
  scooterData = s;
  model.applyScooter(s);
  hud.setScooter(s);
  hud.setMoney(save.money);
  hud.showToast(`BOUGHT ${s.name.toUpperCase()} · ${speedKmh(s.top)} KM/H TOP`, 'gold');
  audio.buy();
  hud.renderShop(save);
  hud.updateTitleStats(save);
  saveGame();
}

function equipScooter(id) {
  if (!save.owned.includes(id)) return;
  const s = SCOOTERS.find((x) => x.id === id);
  save.equipped = id;
  scooterData = s;
  model.applyScooter(s);
  hud.setScooter(s);
  hud.renderShop(save);
  saveGame();
}

function toggleMute() {
  const muted = audio.toggleMute();
  save.muted = muted;
  hud.setMuted(muted);
  saveGame();
}

/* ==================================================================== */
/* Modes                                                                 */
/* ==================================================================== */

function startRun() {
  audio.init();
  hud.showTitle(false);
  hud.showHud(true);
  hud.setShopOpen(false);
  hud.setPaused(false);
  resetPlayer();
  state.runScore = 0;
  state.runDistance = 0;
  state.distanceFlush = 0;
  state.airFlush = 0;
  state.maxSpeed = 0;
  hud.setScore(0);
  hud.location('Volt City Skate Park');
  freshQuests();
  state.mode = 'play';
  hud.showToast('HOLD & RELEASE TO FLIP · HOLD TOO LONG AND YOU CRASH', 'teal');
  saveGame();
}

function openShop(fromTitle) {
  audio.init();
  hud.renderShop(save);
  hud.setShopOpen(true);
  if (fromTitle || state.mode === 'title') {
    state.mode = 'shop';
  } else {
    state.mode = 'shop';
  }
}

function closeShop() {
  hud.setShopOpen(false);
  if (state.mode === 'shop' && hud.pauseVisible()) {
    state.mode = 'paused';
  } else if (state.mode === 'shop' && !document.getElementById('title').classList.contains('hidden')) {
    state.mode = 'title';
  } else {
    state.mode = 'play';
  }
}

function togglePause() {
  if (state.mode === 'play') {
    state.mode = 'paused';
    hud.setPaused(true);
    saveGame();
  } else if (state.mode === 'paused') {
    resumeGame();
  }
}

function resumeGame() {
  hud.setPaused(false);
  state.mode = 'play';
}

function resetPlayer() {
  player.x = SPAWN.x;
  player.z = SPAWN.z;
  player.yaw = SPAWN.yaw;
  player.y = 0;
  player.speed = 0;
  player.vy = 0;
  player.grounded = true;
  player.wheelie = 0;
  player.wheelieHolding = false;
  player.crashTimer = 0;
  player.airTime = 0;
  player.crouch = 0;
  flip.id = null; flip.angle = 0; flip.holding = false; flip.settling = false;
  bar.angle = 0; bar.holding = false; bar.settling = false;
  state.combo = { mult: 1, points: 0, timer: 0 };
  hud.setCombo(1, 0);
  hud.setAirborne(false);
  state.camYaw = SPAWN.yaw;
  const spawnGround = world.groundAt(player.x, player.z);
  player.y = spawnGround.height;
  model.root.position.set(player.x, player.y, player.z);
  model.root.rotation.y = player.yaw;
}

/* ==================================================================== */
/* Gameplay helpers                                                      */
/* ==================================================================== */

function crash(reason, power = 1) {
  if (player.crashTimer > 0) return;
  player.crashTimer = 1.65;
  player.crashReason = reason;
  player.crashTilt = (Math.random() - 0.5) * 90;
  player.speed *= 0.18;
  player.wheelie = 0;
  player.wheelieHolding = false;
  state.shake = Math.max(state.shake, 0.75);
  world.spawnDust(player.x, player.y + 0.4, player.z, 26, 5 * power);
  audio.crash();
  hud.bail(reason);
  hud.showTrick(flip.id ? TRICKS[flip.id].name : 'CRASH', 0, '#ff5a4d');
  hud.setCombo(1, 0);
  hud.setWheelie(0, false);
  if (state.combo.points > 0) {
    hud.showToast(`COMBO LOST · ${Math.round(state.combo.points)} POINTS GONE`, 'red');
  }
  state.combo = { mult: 1, points: 0, timer: 0 };
  flip.id = null;
  bar.holding = false;
}

function landClean() {
  let points = 0;
  let parts = [];
  let color = '#ffd166';
  if (flip.id) {
    const chk = landingCheck(flip.angle);
    const turns = Math.max(1, Math.abs(chk.turns));
    const base = TRICKS[flip.id].points * turns * (turns >= 2 ? 1.5 : 1);
    points += base;
    parts.push(trickName(TRICKS[flip.id], turns));
    color = TRICKS[flip.id].color;
    emit({ type: 'trick', trick: flip.id });
  }
  if (bar.angle > 30) {
    const chk = landingCheck(bar.angle);
    const turns = Math.max(1, Math.abs(chk.turns));
    points += TRICKS.barspin.points * turns * (turns >= 2 ? 1.4 : 1);
    parts.push(trickName(TRICKS.barspin, turns));
    if (!parts.length > 1) color = TRICKS.barspin.color;
  }
  const airBonus = Math.max(0, player.airTime - 0.85) * 55;
  points += airBonus;
  if (airBonus > 20) parts.push(`${player.airTime.toFixed(1)}s AIR`);

  const total = points * state.combo.mult;
  if (total > 0) {
    addCash(total, 'tricks');
    state.combo.points += total;
    state.combo.mult = Math.min(9, state.combo.mult + 1);
    state.combo.timer = 5;
    hud.showTrick(parts.join(' + ') || 'CLEAN LANDING', total, color);
    emit({ type: 'combo', amount: total });
  }
  audio.land(Math.min(1.4, 0.5 + player.airTime * 0.3));
  world.spawnDust(player.x, player.y + 0.1, player.z, 12, 2.6);
  state.shake = Math.max(state.shake, Math.min(0.4, 0.12 + player.airTime * 0.07));
}

function beginAir() {
  player.grounded = false;
  player.airTime = 0;
  flip.id = null;
  flip.angle = 0;
  flip.holding = false;
  flip.settling = false;
  bar.angle = 0;
  bar.holding = false;
  bar.settling = false;
  hud.setAirborne(true);
}

function updateTricks(dt) {
  const spinMult = scooterData.spin;

  // ---- flip trick
  const heldId = input.state.trick;
  const flipLike = heldId && heldId !== 'barspin' ? heldId : null;
  const barHeld = heldId === 'barspin';

  if (flipLike) {
    if (flip.id !== flipLike && !flip.settling) {
      flip.id = flipLike;
      if (!flip.holding) flip.angle = 0;
      audio.trick();
    }
    flip.holding = true;
    flip.settling = false;
    const t = TRICKS[flipLike];
    flip.angle += t.speed * spinMult * dt * t.direction;
  } else if (flip.holding) {
    flip.holding = false;
    const chk = landingCheck(flip.angle);
    if (chk.clean && Math.abs(chk.diff) > 2) {
      flip.settling = true;
      flip.settleTarget = chk.turns * 360;
    }
  }

  if (flip.settling) {
    const diff = flip.settleTarget - flip.angle;
    const step = Math.sign(diff) * 900 * dt;
    if (Math.abs(step) >= Math.abs(diff)) {
      flip.angle = flip.settleTarget;
      flip.settling = false;
    } else {
      flip.angle += step;
    }
  }

  // ---- barspin
  if (barHeld) {
    if (!bar.holding) {
      bar.holding = true;
      bar.settling = false;
      audio.trick();
    }
    bar.angle += TRICKS.barspin.speed * spinMult * dt;
  } else if (bar.holding) {
    bar.holding = false;
    const chk = landingCheck(bar.angle, 46);
    if (chk.clean && Math.abs(chk.diff) > 2) {
      bar.settling = true;
      bar.settleTarget = chk.turns * 360;
    }
  }
  if (bar.settling) {
    const diff = bar.settleTarget - bar.angle;
    const step = Math.sign(diff) * 1200 * dt;
    if (Math.abs(step) >= Math.abs(diff)) {
      bar.angle = bar.settleTarget;
      bar.settling = false;
    } else {
      bar.angle += step;
    }
  }
}

function updateWheelie(dt) {
  const want = input.state.wheelie;
  const moving = Math.abs(player.speed) > 3.5;
  if (want && moving && player.grounded && !player.crashTimer) {
    if (!player.wheelieHolding) {
      player.wheelieHolding = true;
      audio.trick();
    }
    player.wheelie += WHEELIE.rise * dt * (1 + player.speed / 90);
    if (player.wheelie >= WHEELIE.max) {
      crash('Held the wheelie way too long — looped out!', 1.2);
      return;
    }
    if (player.wheelie >= WHEELIE.greenLow) {
      const gain = 42 * dt * (1 + Math.min(1.2, player.speed / 26));
      addCash(gain, 'wheelie');
      state.combo.points += gain;
      state.combo.timer = 5;
      emit({ type: 'wheelie', amount: dt });
    }
  } else {
    if (player.wheelieHolding) {
      player.wheelieHolding = false;
      if (player.wheelie > 40) {
        const bonus = Math.round(player.wheelie * 3);
        addCash(bonus, 'wheelie');
        hud.showTrick('WHEELIE RELEASE', bonus, '#ffd166');
        audio.land(0.4);
      } else if (player.wheelie > 8) {
        hud.showToast('EARLY RELEASE · HOLD IT A LITTLE LONGER');
      }
    }
    player.wheelie = Math.max(0, player.wheelie - 150 * dt);
  }
}

/* ==================================================================== */
/* Physics                                                               */
/* ==================================================================== */

const GRAV = 23;
const tmpVec = new THREE.Vector3();

function updatePhysics(dt) {
  const top = scooterData.top;
  const accel = scooterData.accel;
  const handling = scooterData.handling;

  const throttle = input.state.throttle;
  const steer = input.state.steer;

  if (player.crashTimer > 0) {
    player.crashTimer -= dt;
    player.speed *= Math.max(0, 1 - 5 * dt);
    player.x += Math.sin(player.yaw) * player.speed * dt;
    player.z += Math.cos(player.yaw) * player.speed * dt;
    if (player.crashTimer <= 0) {
      // get back on the deck
      player.crashTimer = 0;
      const g = world.groundAt(player.x, player.z);
      player.y = g.height;
      player.vy = 0;
      player.grounded = true;
      player.speed = 0;
      flip.angle = 0; bar.angle = 0;
      flip.settling = false; bar.settling = false;
      flip.holding = false; bar.holding = false;
      hud.showToast('BACK ON THE DECK');
    }
    return;
  }

  // ---- throttle
  if (player.grounded) {
    if (throttle > 0.02) {
      player.speed += accel * throttle * Math.max(0.08, 1 - Math.max(0, player.speed) / top) * dt;
    } else if (throttle < -0.02) {
      if (player.speed > 0.2) player.speed = Math.max(0, player.speed - 22 * (-throttle) * dt);
      else player.speed = Math.max(-7, player.speed - 7 * (-throttle) * dt);
    }
    const drag = (throttle === 0 ? 1.35 : 0.45) * (player.wheelie > 1 ? 1.25 : 0.55);
    player.speed -= Math.sign(player.speed) * Math.min(Math.abs(player.speed), drag * dt * (1 + Math.abs(player.speed) * 0.25));
    if (Math.abs(player.speed) < 0.02) player.speed = 0;
    player.speed = Math.max(-7, Math.min(top * 1.05, player.speed));
  } else {
    player.speed += throttle * 2.6 * dt;
    player.speed = Math.max(-5, Math.min(top * 1.1, player.speed));
  }

  // ---- steering
  const speedK = Math.min(1, Math.abs(player.speed) / 9);
  const steerRate = (player.grounded ? 2.35 : 1.05) * handling * (1 - 0.42 * Math.min(1, Math.abs(player.speed) / top));
  player.yaw -= steer * steerRate * dt * (0.3 + 0.7 * speedK) * (player.speed < -0.1 ? -1 : 1);

  // ---- move
  const beforeX = player.x, beforeZ = player.z;
  player.x += Math.sin(player.yaw) * player.speed * dt;
  player.z += Math.cos(player.yaw) * player.speed * dt;
  world.resolveCollision({ x: player.x, z: player.z }, 0.58);
  const movedX = player.x - beforeX, movedZ = player.z - beforeZ;
  const actualMove = Math.hypot(movedX, movedZ);
  const wantedMove = Math.abs(player.speed) * dt;
  if (wantedMove > 0.0001 && actualMove < wantedMove * 0.7 && player.grounded) {
    if (Math.abs(player.speed) > 14) {
      state.shake = Math.max(state.shake, 0.28);
      player.speed *= 0.42;
    } else {
      player.speed *= 0.8;
    }
  }

  // ---- ground / air
  const ground = world.groundAt(player.x, player.z);
  const gh = ground.height;

  if (player.jumpBuffer > 0 && player.grounded) {
    player.jumpBuffer = 0;
    player.vy = 7.4 * scooterData.jump * (0.65 + 0.35 * Math.min(1, Math.abs(player.speed) / 12)) + (ground.ramp ? Math.max(0, player.vy) * 0.35 : 0);
    beginAir();
    world.spawnDust(player.x, player.y + 0.1, player.z, 8, 1.8);
  }

  if (player.grounded) {
    const dy = gh - player.y;
    if (dy < -0.14) {
      beginAir();
      player.vy = Math.max(0, player.vy);
      player.y += player.vy * dt;
    } else {
      if (dy > 0.0005) {
        player.vy = THREE.MathUtils.clamp(dy / dt, -30, 30);
      } else {
        player.vy = Math.min(0, player.vy - GRAV * dt * 0.5);
      }
      player.y = gh;
    }
  } else {
    player.airTime += dt;
    player.vy -= GRAV * dt;
    player.y += player.vy * dt;
    if (player.y <= gh + 0.02 && player.vy <= 0) {
      player.y = gh;
      // ---- landing judgement
      const flipOk = flip.id ? landingCheck(flip.angle, 68).clean : true;
      const barOk = bar.angle > 15 ? landingCheck(bar.angle, 48).clean : true;
      if (!flipOk) {
        const diff = landingCheck(flip.angle, 68).diff;
        crash(Math.abs(diff) > 180 ? 'Over-rotated the flip — you were still spinning.' : 'Under-rotated — the deck never came back around.', 1.3);
        player.grounded = false;
        player.vy = Math.max(1.5, -player.vy * 0.22);
      } else if (!barOk) {
        crash('Botched the barspin — twisted handlebars on impact.', 1.1);
        player.grounded = false;
        player.vy = Math.max(1.2, -player.vy * 0.2);
      } else {
        player.grounded = true;
        player.vy = 0;
        if (player.airTime > 0.32) landClean();
        player.crouch = 1;
      }
      player.airTime = 0;
      hud.setAirborne(false);
    }
  }

  if (!player.grounded) {
    hud.updateAir = true;
  }

  // ---- tricks & wheelie
  if (player.grounded) {
    if (flip.id || Math.abs(flip.angle) > 1) {
      // settle leftovers
      flip.angle = THREE.MathUtils.damp(flip.angle, 0, 8, dt);
      if (Math.abs(flip.angle) < 0.4) { flip.angle = 0; flip.id = null; }
    }
    if (Math.abs(bar.angle) > 0.5) {
      bar.angle = THREE.MathUtils.damp(bar.angle, Math.round(bar.angle / 360) * 360, 9, dt);
    }
    updateWheelie(dt);
    hud.setAirborne(false);
  } else {
    updateTricks(dt);
    hud.setAirborne(true);
    emit({ type: 'air', amount: dt });
  }

  // ---- stats
  const speedAbs = Math.abs(player.speed);
  if (speedAbs > state.maxSpeed) {
    state.maxSpeed = speedAbs;
    emit({ type: 'speed', amount: speedKmh(speedAbs) });
  }
  if (player.grounded) {
    state.runDistance += speedAbs * dt;
    state.distanceFlush += speedAbs * dt;
    if (state.distanceFlush > 8) {
      emit({ type: 'distance', amount: state.distanceFlush });
      state.distanceFlush = 0;
    }
    save.totalDistance += speedAbs * dt;
  }

  // ---- combo timer
  if (state.combo.timer > 0) {
    state.combo.timer -= dt;
    if (state.combo.timer <= 0) {
      state.combo = { mult: 1, points: 0, timer: 0 };
      hud.setCombo(1, 0);
    }
  }

  // ---- coins
  const collected = world.collectCoins({ x: player.x, y: player.y, z: player.z });
  if (collected) {
    addCash(collected * 6, 'coin');
    for (let i = 0; i < collected; i++) emit({ type: 'coin', amount: 1 });
    audio.coin();
    hud.showToast(`+${formatMoney(collected * 6)} · COIN${collected > 1 ? 'S' : ''}`, 'gold');
  }

  // ---- zone
  const zone = world.zoneAt(player.x, player.z);
  if (zone.id !== state.zone) {
    state.zone = zone.id;
    hud.location(zone.name);
    emit({ type: 'visit', place: zone.id });
  }
}

/* ==================================================================== */
/* Visuals                                                               */
/* ==================================================================== */

function updateModel(dt) {
  const deg2rad = Math.PI / 180;
  let terrainPitch = 0;
  let terrainRoll = 0;
  if (player.grounded) {
    const e = 0.5;
    const hL = world.groundAt(player.x - e, player.z).height;
    const hR = world.groundAt(player.x + e, player.z).height;
    const hD = world.groundAt(player.x, player.z - e).height;
    const hU = world.groundAt(player.x, player.z + e).height;
    const dhdx = (hR - hL) / (2 * e);
    const dhdz = (hU - hD) / (2 * e);
    const s = Math.sin(player.yaw), c = Math.cos(player.yaw);
    const fwdGrad = dhdx * s + dhdz * c;
    const sideGrad = -dhdx * c + dhdz * s;
    terrainPitch = -Math.atan(fwdGrad) / deg2rad;
    terrainRoll = Math.atan(sideGrad) / deg2rad;
    terrainPitch = THREE.MathUtils.clamp(terrainPitch, -48, 48);
    terrainRoll = THREE.MathUtils.clamp(terrainRoll, -32, 32);
  }
  const steerLean = -input.state.steer * Math.min(1, Math.abs(player.speed) / 14) * (player.grounded ? 7 : 3);

  player.visPitch = THREE.MathUtils.damp(player.visPitch, terrainPitch, 7, dt);
  player.visRoll = THREE.MathUtils.damp(player.visRoll, terrainRoll + steerLean, 7, dt);
  player.crouch = THREE.MathUtils.damp(player.crouch, 0, 6, dt);

  model.root.position.set(player.x, player.y, player.z);
  model.root.rotation.y = player.yaw;

  const flipX = player.grounded ? player.visPitch : flip.angle;
  const flipZ = player.grounded ? player.visRoll : player.visRoll * 0.3;

  model.update({
    dt,
    speed: player.speed,
    steer: input.state.steer,
    wheelie: player.wheelie,
    flipX,
    flipZ,
    barspin: bar.angle,
    crouch: player.crouch,
    grounded: player.grounded,
    crashed: player.crashTimer > 0,
    crashTime: 1.65 - Math.max(0, player.crashTimer),
    crashTilt: player.crashTilt,
    time: state.time,
  });
}

const camTarget = new THREE.Vector3(0, 1.2, 0);
let titleOrbit = 0.6;

function updateCamera(dt) {
  if (state.mode === 'title' || state.mode === 'shop' && hud.shopVisible() && state.mode === 'title') {
    titleOrbit += dt * 0.075;
    const r = 52;
    camera.position.set(Math.cos(titleOrbit) * r, 21 + Math.sin(titleOrbit * 0.6) * 3.5, Math.sin(titleOrbit) * r);
    camera.lookAt(0, 3, -6);
    camera.fov = 58;
    camera.updateProjectionMatrix();
    return;
  }

  const speedK = Math.min(1, Math.abs(player.speed) / scooterData.top);
  state.camYaw = THREE.MathUtils.damp(state.camYaw, player.yaw, player.grounded ? 5.2 : 3.4, dt);

  const airborne = !player.grounded;
  const dist = 6.4 + speedK * 1.8 + (airborne ? 1.4 : 0);
  const height = 2.85 + speedK * 0.35 + (airborne ? 0.5 : 0);

  const fx = Math.sin(state.camYaw), fz = Math.cos(state.camYaw);
  tmpVec.set(
    player.x - fx * dist,
    player.y + height,
    player.z - fz * dist,
  );
  const follow = 1 - Math.exp(-dt * (airborne ? 4.2 : 7.5));
  camera.position.lerp(tmpVec, follow);

  const look = new THREE.Vector3(
    player.x + fx * 3.6,
    player.y + 1.35 + (airborne ? 0.35 : 0),
    player.z + fz * 3.6,
  );
  camTarget.lerp(look, 1 - Math.exp(-dt * 9));

  if (state.shake > 0.001) {
    camera.position.x += (Math.random() - 0.5) * state.shake * 0.7;
    camera.position.y += (Math.random() - 0.5) * state.shake * 0.55;
    camera.position.z += (Math.random() - 0.5) * state.shake * 0.7;
    state.shake = THREE.MathUtils.damp(state.shake, 0, 6, dt);
  }

  // keep the camera above the ground
  const groundHere = world.groundAt(camera.position.x, camera.position.z).height;
  if (camera.position.y < groundHere + 1.1) camera.position.y = groundHere + 1.1;

  camera.lookAt(camTarget);
  const targetFov = state.fovBase + speedK * 11 + (airborne ? 3 : 0);
  camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 4.5, dt);
  camera.updateProjectionMatrix();
}

/* ==================================================================== */
/* Main loop                                                             */
/* ==================================================================== */

const clock = new THREE.Clock();
let hudAccum = 0;

function tick() {
  const dt = Math.min(0.034, clock.getDelta());
  state.time += dt;

  input.update();

  if (input.consume('Escape')) {
    if (hud.shopVisible()) closeShop();
    else if (state.mode === 'play' || state.mode === 'paused') togglePause();
  }
  if (input.consume('KeyE')) {
    if (hud.shopVisible()) closeShop();
    else if (state.mode === 'play') openShop(false);
  }
  if (input.consume('KeyM')) toggleMute();
  if (input.consume('Space')) {
    if (state.mode === 'title') startRun();
    else if (state.mode === 'play' && player.grounded) player.jumpBuffer = 0.14;
  }
  if (player.jumpBuffer > 0 && !player.grounded) player.jumpBuffer = Math.max(0, player.jumpBuffer - dt);

  if (state.mode === 'play') {
    updatePhysics(dt);
  }

  updateModel(dt);
  updateCamera(dt);
  world.update(dt, state.time, player);
  audio.updateEngine(player.speed, input.state.throttle, player.grounded);

  hudAccum += dt;
  if (hudAccum > 0.06) {
    const s = hudAccum;
    hudAccum = 0;
    hud.setSpeed(Math.abs(player.speed), scooterData.top);
    hud.setWheelie(player.wheelie, player.wheelieHolding && player.grounded, player.wheelie > WHEELIE.crash - 12);
    const airborne = !player.grounded;
    hud.setRotation(flip.id ? flip.angle : bar.angle, flip.id || (bar.angle > 12 ? 'barspin' : null), airborne);
    if (state.combo.timer > 0) hud.setCombo(state.combo.mult, state.combo.points);
    hud.updateMinimapState({ x: player.x, z: player.z, yaw: player.yaw, coins: world.coins, dt: s });
  }

  renderer.render(scene, camera);
}

renderer.setAnimationLoop(tick);

/* ==================================================================== */
/* Misc                                                                  */
/* ==================================================================== */

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  state.fovBase = w / h < 0.85 ? 72 : 60;
  camera.fov = state.fovBase;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  renderer.setPixelRatio(softwareRenderer ? 1 : Math.min(window.devicePixelRatio || 1, mobileTier ? 1.5 : 1.8));
}
window.addEventListener('resize', onResize);
onResize();

document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveGame();
});
window.addEventListener('pagehide', saveGame);

// keep the world alive behind the title screen
resetPlayer();

// expose a tiny hook for automated smoke checks
window.__voltCity = {
  state,
  player,
  start: () => startRun(),
  get money() { return save.money; },
};

import { SCOOTERS, WHEELIE, TRICK_LIST, TRICKS, CONTROLS } from './data.js';
import { formatMoney, speedKmh, landingCheck, trickName } from './logic.js';
import { PARK, ROAD_X, ROAD_Z } from './world.js';

const ICONS = {
  coin: '◉',
  trick: '⟳',
  wheelie: '↗',
  distance: '➜',
  air: '☁',
  combo: '✹',
  speed: '≫',
  visit: '⌂',
};

function el(id) { return document.getElementById(id); }

function scooterSvg(s) {
  return `
  <svg viewBox="0 0 220 110" aria-hidden="true">
    <defs>
      <linearGradient id="g-${s.id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${s.color}"/>
        <stop offset="1" stop-color="${s.accent}"/>
      </linearGradient>
    </defs>
    <ellipse cx="110" cy="96" rx="78" ry="8" fill="${s.color}" opacity=".18"/>
    <circle cx="52" cy="82" r="16" fill="#13151d" stroke="#2d3242" stroke-width="3"/>
    <circle cx="170" cy="82" r="16" fill="#13151d" stroke="#2d3242" stroke-width="3"/>
    <circle cx="52" cy="82" r="5" fill="${s.color}"/>
    <circle cx="170" cy="82" r="5" fill="${s.color}"/>
    <path d="M52 82 L86 52 L150 52 L170 82" fill="none" stroke="${s.accent}" stroke-width="4" opacity=".5"/>
    <rect x="84" y="50" width="70" height="9" rx="4" fill="${s.deck}" stroke="${s.color}" stroke-width="2"/>
    <path d="M152 74 L168 79" stroke="${s.accent}" stroke-width="4" stroke-linecap="round"/>
    <path d="M150 50 L160 20" stroke="${s.accent}" stroke-width="5" stroke-linecap="round"/>
    <path d="M143 20 L177 20" stroke="${s.color}" stroke-width="5" stroke-linecap="round"/>
    <path d="M150 30 L168 30" stroke="${s.deck}" stroke-width="4" opacity=".6"/>
    <ellipse cx="110" cy="88" rx="54" ry="6" fill="${s.color}" opacity=".22"/>
    <circle cx="126" cy="44" r="4" fill="${s.color}"/>
  </svg>`;
}

export function createHud(handlers, input, audio) {
  const hud = el('hud');
  const title = el('title');
  const shop = el('shop');
  const pause = el('pause');

  const moneyValue = el('moneyValue');
  const scoreValue = el('scoreValue');
  const shopMoney = el('shopMoney');
  const speedValue = el('speedValue');
  const speedoArc = el('speedoArc');
  const scooterName = el('scooterName');
  const questList = el('questList');
  const locationBanner = el('locationBanner');
  const locName = el('locName');
  const comboBox = el('comboBox');
  const comboMult = el('comboMult');
  const comboPoints = el('comboPoints');
  const trickPop = el('trickPop');
  const trickNameEl = el('trickName');
  const trickPointsEl = el('trickPoints');
  const toasts = el('toasts');
  const wheelieMeter = el('wheelieMeter');
  const wheelieMarker = el('wheelieMarker');
  const wheelieHint = el('wheelieHint');
  const rotDial = el('rotDial');
  const rotNeedle = el('rotNeedle');
  const rotTrick = el('rotTrick');
  const rotDegrees = el('rotDegrees');
  const bailBox = el('bailBox');
  const bailReason = el('bailReason');
  const touchControls = el('touchControls');
  const joystick = el('joystick');
  const joystickKnob = el('joystickKnob');
  const trickButtons = el('trickButtons');
  const speedlines = el('speedlines');
  const titleBest = el('titleBest');
  const titleOwned = el('titleOwned');
  const muteBtn = el('muteBtn');
  const pauseMuteBtn = el('pauseMuteBtn');

  let currentQuests = [];
  let questCards = new Map();
  let lastBailTimer = 0;
  let lastLocTimer = 0;
  let trickTimer = 0;
  let titleShopOpen = false;

  /* ---------------- speedo ticks ---------------- */
  const ticks = el('speedoTicks');
  if (ticks) {
    const NS = 'http://www.w3.org/2000/svg';
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * 270 - 135;
      const major = i % 6 === 0;
      const line = document.createElementNS(NS, 'line');
      const rad = (a - 90) * Math.PI / 180;
      const r1 = 61;
      const r2 = major ? 52 : 56;
      line.setAttribute('x1', 80 + Math.cos(rad) * r1);
      line.setAttribute('y1', 80 + Math.sin(rad) * r1);
      line.setAttribute('x2', 80 + Math.cos(rad) * r2);
      line.setAttribute('y2', 80 + Math.sin(rad) * r2);
      line.setAttribute('stroke', major ? 'rgba(255,255,255,.45)' : 'rgba(255,255,255,.16)');
      line.setAttribute('stroke-width', major ? 2 : 1);
      ticks.appendChild(line);
    }
  }
  const arcLen = 2 * Math.PI * 70;

  /* ---------------- minimap ---------------- */
  const minimap = el('minimap');
  const mctx = minimap.getContext('2d');
  const mapScale = (minimap.width - 18) / 380;
  const off = document.createElement('canvas');
  off.width = off.height = minimap.width;
  const octx = off.getContext('2d');
  const WC = minimap.width / 2;
  function wx(x) { return WC + x * mapScale; }
  function wz(z) { return WC + z * mapScale; }

  function drawStaticMap() {
    const w = off.width;
    octx.clearRect(0, 0, w, w);
    octx.fillStyle = '#0d1220';
    octx.fillRect(0, 0, w, w);
    // blocks
    octx.fillStyle = 'rgba(60,70,95,.28)';
    for (const bx of [-134, -78, 78, 134]) for (const bz of [-130, -74, 74, 130]) {
      octx.fillRect(wx(bx - 22), wz(bz - 22), 44 * mapScale, 44 * mapScale);
    }
    // roads
    octx.strokeStyle = 'rgba(170,185,215,.35)';
    octx.lineWidth = 12 * mapScale;
    for (const x of ROAD_X) {
      octx.beginPath(); octx.moveTo(wx(x), 0); octx.lineTo(wx(x), w); octx.stroke();
    }
    for (const z of ROAD_Z) {
      octx.beginPath(); octx.moveTo(0, wz(z)); octx.lineTo(w, wz(z)); octx.stroke();
    }
    // park
    octx.fillStyle = 'rgba(111,242,208,.16)';
    octx.strokeStyle = 'rgba(111,242,208,.7)';
    octx.lineWidth = 1.5;
    const pw = (PARK.maxX - PARK.minX) * mapScale;
    const ph = (PARK.maxZ - PARK.minZ) * mapScale;
    octx.fillRect(wx(PARK.minX), wz(PARK.minZ), pw, ph);
    octx.strokeRect(wx(PARK.minX), wz(PARK.minZ), pw, ph);
    // ramps
    octx.fillStyle = 'rgba(255,209,102,.6)';
    for (const [x, z, r] of [[0, -28, 4], [0, -12, 4], [0, 9, 3], [-24, 10, 3], [-38, 10, 3], [38, 10, 3], [25, 28, 2]]) {
      octx.beginPath();
      octx.arc(wx(x), wz(z), r, 0, Math.PI * 2);
      octx.fill();
    }
    // N marker
    octx.fillStyle = 'rgba(255,255,255,.4)';
    octx.font = '700 9px sans-serif';
    octx.textAlign = 'center';
    octx.fillText('N', WC, 12);
  }
  drawStaticMap();

  let mapAccum = 0;

  function drawMinimap(state) {
    if (!state) return;
    mctx.clearRect(0, 0, minimap.width, minimap.height);
    mctx.drawImage(off, 0, 0);
    // coins
    if (state.coins) {
      mctx.fillStyle = 'rgba(255,209,102,.95)';
      for (const c of state.coins) {
        if (!c.active) continue;
        mctx.fillRect(wx(c.x) - 1, wz(c.z) - 1, 2, 2);
      }
    }
    // player
    const px = wx(state.x);
    const pz = wz(state.z);
    mctx.save();
    mctx.translate(px, pz);
    mctx.rotate(-state.yaw);
    mctx.beginPath();
    mctx.moveTo(0, -7);
    mctx.lineTo(5, 5);
    mctx.lineTo(0, 2);
    mctx.lineTo(-5, 5);
    mctx.closePath();
    mctx.fillStyle = '#6ff2d0';
    mctx.shadowColor = '#6ff2d0';
    mctx.shadowBlur = 8;
    mctx.fill();
    mctx.restore();
    // view cone
    mctx.beginPath();
    mctx.moveTo(px, pz);
    mctx.arc(px, pz, 17, -state.yaw - Math.PI / 2 - 0.5, -state.yaw - Math.PI / 2 + 0.5);
    mctx.closePath();
    mctx.fillStyle = 'rgba(111,242,208,.12)';
    mctx.fill();
  }

  /* ---------------- quests ---------------- */
  function questCard(q, index) {
    const card = document.createElement('div');
    card.className = 'quest-card';
    card.innerHTML = `
      <div class="quest-icon">${ICONS[q.icon] || '✦'}</div>
      <div class="quest-body">
        <div class="quest-title"></div>
        <div class="quest-desc"></div>
        <div class="quest-reward"></div>
        <div class="quest-progress"><i></i></div>
      </div>
      <button class="quest-reroll" title="Reroll quest" aria-label="Reroll quest">↻</button>
    `;
    card.querySelector('.quest-reroll').addEventListener('click', (e) => {
      e.stopPropagation();
      audio.ui();
      handlers.reroll(index);
    });
    questList.appendChild(card);
    return card;
  }

  function paintQuest(card, q) {
    card.querySelector('.quest-title').textContent = q.title;
    card.querySelector('.quest-desc').textContent = q.desc;
    card.querySelector('.quest-reward').textContent = `REWARD ${formatMoney(q.reward)}`;
    const pct = Math.max(0, Math.min(1, q.progress / q.target)) * 100;
    card.querySelector('.quest-progress i').style.width = pct + '%';
    card.classList.toggle('done', !!q.done);
  }

  function updateQuests(quests) {
    currentQuests = quests;
    const ids = quests.map((q) => q.id).join(',');
    const oldIds = [...questCards.keys()].join(',');
    if (ids !== oldIds) {
      questList.innerHTML = '';
      questCards = new Map();
      quests.forEach((q, i) => {
        const card = questCard(q, i);
        questCards.set(q.id, card);
        paintQuest(card, q);
      });
    } else {
      quests.forEach((q) => {
        const card = questCards.get(q.id);
        if (card) paintQuest(card, q);
      });
    }
  }

  function updateQuestProgress(quests) {
    quests.forEach((q) => {
      const card = questCards.get(q.id);
      if (card) paintQuest(card, q);
    });
    currentQuests = quests;
  }

  /* ---------------- shop ---------------- */
  function statRow(label, value, max, display) {
    const pct = Math.max(6, Math.min(100, (value / max) * 100));
    return `<div class="sc-stat"><span>${label}</span><div class="sc-bar"><i style="width:${pct}%"></i></div><b>${display}</b></div>`;
  }

  function renderShop(save) {
    const grid = el('shopGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const equipped = SCOOTERS.find((s) => s.id === save.equipped) || SCOOTERS[0];
    el('shopMoney').textContent = formatMoney(save.money);
    SCOOTERS.forEach((s) => {
      const owned = save.owned.includes(s.id);
      const isEquipped = save.equipped === s.id;
      const canBuy = save.money >= s.price;
      const card = document.createElement('article');
      card.className = `shop-card ${owned ? 'owned' : 'locked'} ${isEquipped ? 'equipped' : ''}`;
      card.innerHTML = `
        <div class="sc-top">
          <div>
            <div class="sc-name">${s.name}</div>
            <div class="sc-tag">${s.tagline}</div>
          </div>
          <span class="sc-badge ${isEquipped ? 'equipped' : owned ? 'owned' : ''}">${isEquipped ? 'RIDING' : owned ? 'OWNED' : s.price === 0 ? 'FREE' : 'FOR SALE'}</span>
        </div>
        <div class="sc-art">${scooterSvg(s)}</div>
        <div class="sc-stats">
          ${statRow('TOP', s.top, 43, speedKmh(s.top) + ' km/h')}
          ${statRow('ACCEL', s.accel, 17, s.accel.toFixed(1))}
          ${statRow('GRIP', s.handling, 1.26, (s.handling * 100).toFixed(0) + '%')}
          ${statRow('SPIN', s.spin, 1.22, s.spin.toFixed(2) + 'x')}
        </div>
        <div class="sc-foot">
          <span class="sc-price ${owned ? 'owned' : ''}">${owned ? 'OWNED' : formatMoney(s.price)}</span>
          <button class="buy-btn ${isEquipped ? 'equipped' : owned ? 'equip' : canBuy ? '' : 'cant'}">${isEquipped ? 'EQUIPPED' : owned ? 'EQUIP' : canBuy ? 'BUY' : 'NEED ' + formatMoney(s.price - save.money)}</button>
        </div>
      `;
      const btn = card.querySelector('.buy-btn');
      if (isEquipped) {
        btn.disabled = true;
      } else if (owned) {
        btn.addEventListener('click', () => { audio.ui(); handlers.equip(s.id); });
      } else if (canBuy) {
        btn.addEventListener('click', () => { handlers.buy(s.id); });
      } else {
        btn.disabled = true;
      }
      grid.appendChild(card);
    });
    return equipped;
  }

  /* ---------------- public API ---------------- */
  function setMoney(v) {
    moneyValue.textContent = formatMoney(v);
    shopMoney.textContent = formatMoney(v);
  }
  function setScore(v) {
    scoreValue.textContent = formatMoney(v);
  }
  function setSpeed(ms, max) {
    const kmh = speedKmh(ms);
    speedValue.textContent = kmh;
    const pct = Math.max(0, Math.min(1, ms / Math.max(1, max * 1.15)));
    speedoArc.style.strokeDasharray = arcLen;
    speedoArc.style.strokeDashoffset = arcLen * (1 - pct);
    speedoArc.style.stroke = pct > 0.82 ? '#ffd166' : pct > 0.55 ? '#6ff2d0' : '#6ff2d0';
    speedlines.classList.toggle('fast', pct > 0.7);
  }
  function setScooter(s) {
    scooterName.textContent = s.name.toUpperCase();
  }
  function showTrick(text, points, color) {
    trickNameEl.textContent = text;
    trickPointsEl.textContent = points > 0 ? `+${Math.round(points)}` : 'BAILED';
    trickPop.style.setProperty('--trick-color', color || '#ffd166');
    trickPop.classList.remove('hidden');
    trickPop.style.animation = 'none';
    void trickPop.offsetWidth;
    trickPop.style.animation = '';
    clearTimeout(trickTimer);
    trickTimer = setTimeout(() => trickPop.classList.add('hidden'), 1700);
  }
  function showToast(text, kind = '') {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = text;
    toasts.appendChild(t);
    while (toasts.children.length > 4) toasts.removeChild(toasts.firstChild);
    setTimeout(() => t.remove(), 3500);
  }
  function setCombo(mult, points) {
    if (mult > 1 || points > 0) {
      comboBox.classList.remove('hidden');
      comboMult.textContent = `COMBO ×${Math.max(1, mult)}`;
      comboPoints.textContent = Math.round(points);
      comboBox.classList.toggle('hot', mult >= 3);
    } else {
      comboBox.classList.add('hidden');
    }
  }
  function setWheelie(angle, active, danger = false) {
    if (!active || angle <= 0.5) {
      wheelieMeter.classList.add('hidden');
      return;
    }
    wheelieMeter.classList.remove('hidden');
    const pct = Math.max(0, Math.min(100, (angle / WHEELIE.max) * 100));
    wheelieMarker.style.left = pct + '%';
    wheelieMeter.classList.toggle('danger', danger);
    wheelieHint.textContent = danger ? 'TOO FAR — BAIL!' : 'RELEASE IN THE GREEN';
  }
  function setRotation(angle, trick, show) {
    if (!show || !trick) {
      rotDial.classList.add('hidden');
      return;
    }
    rotDial.classList.remove('hidden');
    const t = TRICKS[trick];
    rotNeedle.style.transform = `rotate(${angle}deg)`;
    rotTrick.textContent = t ? t.name.toUpperCase() : trick.toUpperCase();
    const deg = Math.round(Math.abs(angle));
    const chk = landingCheck(angle);
    rotDegrees.textContent = `${deg}° ${chk.clean ? '✓' : ''}`;
    rotDegrees.style.color = chk.clean ? '#6ff2d0' : '#ff9389';
  }
  function setAirborne(on) {
    trickButtons.querySelectorAll('.trick-btn').forEach((b) => b.classList.toggle('armed', on));
  }
  function bail(reason) {
    bailReason.textContent = reason;
    bailBox.classList.remove('hidden');
    bailBox.style.animation = 'none';
    void bailBox.offsetWidth;
    bailBox.style.animation = '';
    clearTimeout(lastBailTimer);
    lastBailTimer = setTimeout(() => bailBox.classList.add('hidden'), 1800);
  }
  function location(name) {
    locName.textContent = name.toUpperCase();
    locationBanner.classList.remove('hidden');
    locationBanner.style.animation = 'none';
    void locationBanner.offsetWidth;
    locationBanner.style.animation = '';
    clearTimeout(lastLocTimer);
    lastLocTimer = setTimeout(() => locationBanner.classList.add('hidden'), 4400);
  }
  function updateMinimapState(state) {
    mapAccum += state.dt || 0;
    if (mapAccum > 0.08) {
      mapAccum = 0;
      drawMinimap(state);
    }
  }
  function showTitle(on) {
    title.classList.toggle('hidden', !on);
  }
  function showHud(on) {
    hud.classList.toggle('hidden', !on);
  }
  function setMuted(m) {
    muteBtn.textContent = m ? '✕' : '♪';
    muteBtn.setAttribute('aria-label', m ? 'Unmute sound' : 'Mute sound');
    if (pauseMuteBtn) pauseMuteBtn.textContent = m ? 'SOUND: OFF' : 'SOUND: ON';
  }
  function updateTitleStats(save) {
    titleBest.textContent = formatMoney(save.bestScore);
    titleOwned.textContent = `${save.owned.length} / ${SCOOTERS.length}`;
  }
  function setPaused(on) { pause.classList.toggle('hidden', !on); }
  function setShopOpen(on) { shop.classList.toggle('hidden', !on); }
  function shopVisible() { return !shop.classList.contains('hidden'); }
  function pauseVisible() { return !pause.classList.contains('hidden'); }

  /* ---------------- wiring ---------------- */
  el('playBtn').addEventListener('click', () => { audio.init(); audio.ui(); handlers.play(); });
  el('titleShopBtn').addEventListener('click', () => { audio.init(); audio.ui(); handlers.openShop(true); });
  el('shopClose').addEventListener('click', () => { audio.ui(); handlers.closeShop(); });
  el('shopResume').addEventListener('click', () => { audio.ui(); handlers.closeShop(); });
  el('resumeBtn').addEventListener('click', () => { audio.ui(); handlers.resume(); });
  el('pauseShopBtn').addEventListener('click', () => { audio.ui(); handlers.openShop(false); });
  el('restartBtn').addEventListener('click', () => { audio.ui(); handlers.restart(); });
  el('pauseMuteBtn').addEventListener('click', () => { handlers.mute(); });
  muteBtn.addEventListener('click', () => { handlers.mute(); });
  el('shopBtn').addEventListener('click', () => { audio.ui(); handlers.openShop(false); });
  el('pauseBtn').addEventListener('click', () => { audio.ui(); handlers.pause(); });
  el('rerollAll').addEventListener('click', () => { audio.ui(); handlers.rerollAll(); });

  // trick buttons: usable with mouse and touch
  trickButtons.querySelectorAll('.trick-btn').forEach((btn) => {
    const id = btn.dataset.trick;
    const press = (e) => {
      e.preventDefault();
      input.setTouchTrick(id);
      btn.classList.add('pressed');
    };
    const release = () => {
      if (input.state.trick === id) input.setTouchTrick(null);
      btn.classList.remove('pressed');
    };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointerleave', release);
    btn.addEventListener('pointercancel', release);
  });

  // joystick
  let joyId = null;
  function joyMove(e) {
    const rect = joystick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const max = rect.width * 0.36;
    const len = Math.hypot(dx, dy);
    if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
    joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    input.setTouchMove(Math.max(-1, Math.min(1, -dy / max)), Math.max(-1, Math.min(1, dx / max)));
  }
  joystick.addEventListener('pointerdown', (e) => {
    joystick.setPointerCapture(e.pointerId);
    joyId = e.pointerId;
    joyMove(e);
  });
  joystick.addEventListener('pointermove', (e) => {
    if (joyId === e.pointerId) joyMove(e);
  });
  function joyEnd(e) {
    if (joyId !== null && e.pointerId !== joyId) return;
    joyId = null;
    joystickKnob.style.transform = 'translate(0, 0)';
    input.setTouchMove(0, 0);
  }
  joystick.addEventListener('pointerup', joyEnd);
  joystick.addEventListener('pointercancel', joyEnd);
  joystick.addEventListener('pointerleave', (e) => { if (joyId === e.pointerId) joyEnd(e); });

  const wheelieBtn = el('touchWheelie');
  const wheelieOn = (e) => { e.preventDefault(); input.setTouchWheelie(true); wheelieBtn.style.transform = 'scale(.94)'; };
  const wheelieOff = () => { input.setTouchWheelie(false); wheelieBtn.style.transform = ''; };
  wheelieBtn.addEventListener('pointerdown', wheelieOn);
  wheelieBtn.addEventListener('pointerup', wheelieOff);
  wheelieBtn.addEventListener('pointercancel', wheelieOff);
  wheelieBtn.addEventListener('pointerleave', wheelieOff);
  const jumpBtn = el('touchJump');
  jumpBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); input.tapJump(); jumpBtn.style.transform = 'scale(.94)'; });
  jumpBtn.addEventListener('pointerup', () => { jumpBtn.style.transform = ''; });
  jumpBtn.addEventListener('pointercancel', () => { jumpBtn.style.transform = ''; });

  // Controls hint can be dismissed with a tap on touch devices.
  el('controlsHint').addEventListener('click', (e) => e.currentTarget.remove());

  return {
    showTitle, showHud, setMoney, setScore, setSpeed, setScooter,
    updateQuests, updateQuestProgress, renderShop, showTrick, showToast,
    setCombo, setWheelie, setRotation, setAirborne, bail, location,
    updateMinimapState, setMuted, updateTitleStats, setPaused, setShopOpen,
    shopVisible, pauseVisible, audioReady: () => audio.init(),
    setTitleShopOpen: (v) => { titleShopOpen = v; },
  };
}

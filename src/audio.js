// Tiny WebAudio synth: engine hum, wind, UI and trick sounds, and a soft
// synthwave loop. Everything is generated - no audio files to load.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineGain = null;
  let engineOsc = null;
  let engineSub = null;
  let engineFilter = null;
  let windGain = null;
  let windFilter = null;
  let noiseBuffer = null;
  let musicTimer = null;
  let nextBar = 0;
  let muted = false;
  let ready = false;

  const CHORDS = [
    [55, 59, 62], // G
    [57, 60, 64], // Am
    [53, 57, 60], // F
    [50, 53, 57], // Dm
  ];

  function makeNoise() {
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function init() {
    if (ready) {
      if (ctx && ctx.state === 'suspended') ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.7;
      master.connect(ctx.destination);
      noiseBuffer = makeNoise();

      // engine
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 380;
      engineFilter.Q.value = 4;
      engineFilter.connect(engineGain);
      engineGain.connect(master);

      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc.connect(engineFilter);
      engineOsc.start();

      engineSub = ctx.createOscillator();
      engineSub.type = 'sine';
      engineSub.frequency.value = 42;
      const subGain = ctx.createGain();
      subGain.gain.value = 0.5;
      engineSub.connect(subGain);
      subGain.connect(engineGain);
      engineSub.start();

      // wind
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windFilter.Q.value = 0.6;
      windFilter.connect(windGain);
      windGain.connect(master);
      const windSrc = ctx.createBufferSource();
      windSrc.buffer = noiseBuffer;
      windSrc.loop = true;
      windSrc.connect(windFilter);
      windSrc.start();

      ready = true;
      startMusic();
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) {
      console.warn('audio unavailable', e);
    }
  }

  function tone(freq, dur, type = 'sine', gain = 0.12, slide = null, delay = 0) {
    if (!ready || !ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  function noiseBurst(dur = 0.25, gain = 0.15, freq = 900, delay = 0) {
    if (!ready || !ctx) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(freq, t0);
    filt.frequency.exponentialRampToValueAtTime(120, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.03);
  }

  function whoosh(strength = 1) {
    if (!ready || !ctx) return;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(300, t0);
    filt.frequency.exponentialRampToValueAtTime(2400 * strength, t0 + 0.18);
    filt.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.16 * strength, t0 + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);
    src.connect(filt);
    filt.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + 0.34);
  }

  function coin() {
    tone(880, 0.09, 'sine', 0.1);
    tone(1320, 0.12, 'sine', 0.09, null, 0.07);
    tone(1760, 0.14, 'sine', 0.06, null, 0.14);
  }
  function trick() {
    whoosh(1.1);
    tone(220, 0.18, 'triangle', 0.06, 440);
  }
  function land(power = 1) {
    noiseBurst(0.16, 0.1 + 0.08 * power, 420);
    tone(82, 0.22, 'sine', 0.13, 45);
  }
  function crash() {
    noiseBurst(0.7, 0.45, 1500);
    tone(120, 0.6, 'sawtooth', 0.2, 28);
    tone(70, 0.8, 'sine', 0.24, 22);
  }
  function ui() {
    tone(520, 0.06, 'square', 0.04);
    tone(780, 0.08, 'square', 0.03, null, 0.05);
  }
  function buy() {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 'triangle', 0.08, null, i * 0.09));
  }
  function quest() {
    [659, 784, 988, 1318].forEach((f, i) => tone(f, 0.22, 'sine', 0.09, null, i * 0.11));
  }
  function fail() {
    tone(240, 0.25, 'sawtooth', 0.08, 110);
    noiseBurst(0.2, 0.1, 500);
  }

  function updateEngine(speed, throttle, grounded) {
    if (!ready) return;
    const t = ctx.currentTime;
    const sp = Math.min(1, speed / 34);
    const target = grounded ? 0.026 + sp * 0.05 : 0.012;
    engineGain.gain.setTargetAtTime(target, t, 0.15);
    engineOsc.frequency.setTargetAtTime(48 + sp * 130 + Math.abs(throttle) * 16, t, 0.12);
    engineSub.frequency.setTargetAtTime(38 + sp * 54, t, 0.15);
    engineFilter.frequency.setTargetAtTime(320 + sp * 1700, t, 0.12);
    windGain.gain.setTargetAtTime(grounded ? sp * 0.035 : sp * 0.07, t, 0.2);
    windFilter.frequency.setTargetAtTime(600 + sp * 1400, t, 0.2);
  }

  function scheduleBar(time) {
    const chord = CHORDS[Math.floor((time - nextBar) / 2.9) % CHORDS.length];
    // pad
    chord.forEach((note, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 850;
      osc.type = i === 0 ? 'triangle' : 'sine';
      osc.frequency.value = 440 * Math.pow(2, (note - 69) / 12);
      g.gain.setValueAtTime(0.0001, time);
      g.gain.linearRampToValueAtTime(0.026, time + 0.7);
      g.gain.linearRampToValueAtTime(0.0001, time + 2.75);
      osc.connect(filt);
      filt.connect(g);
      g.connect(master);
      osc.start(time);
      osc.stop(time + 2.8);
    });
    // bass pulse
    for (let i = 0; i < 4; i++) {
      const t = time + i * 0.72;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = 440 * Math.pow(2, (chord[0] - 24 - 69) / 12);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.036, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 420;
      osc.connect(filt);
      filt.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + 0.45);
    }
    // sparkle
    if (Math.random() > 0.5) {
      const t = time + 2.1;
      tone(440 * Math.pow(2, (chord[2] + 12 - 69) / 12), 0.5, 'sine', 0.014, null, t - ctx.currentTime);
    }
  }

  function startMusic() {
    if (!ctx || musicTimer) return;
    nextBar = ctx.currentTime + 1.0;
    musicTimer = setInterval(() => {
      if (!ctx) return;
      while (nextBar < ctx.currentTime + 0.6) {
        scheduleBar(nextBar);
        nextBar += 2.9;
      }
    }, 150);
  }

  function setMuted(value) {
    muted = value;
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.7, ctx.currentTime, 0.05);
  }

  function toggleMute() {
    setMuted(!muted);
    return muted;
  }

  return {
    init, updateEngine, setMuted, toggleMute,
    coin, trick, land, crash, ui, buy, quest, fail,
    get muted() { return muted; },
  };
}

/* eslint-disable react-hooks/immutability -- game state lives in a useRef and mutates every frame by design */
import { useRef, useCallback, useEffect } from 'react';

// ===== CONSTANTS =====
const ROAD_W = 2000;
const SEG_LEN = 200;
const DRAW_DIST = 200;
const DETAIL_DIST = 100;
const JUMP_V = 22;
const GRAVITY = 1.0;
const NUM_TRAFFIC = 45;
const CAM_H = 1000;
const FOV = 100;
const CAM_DEPTH = 1 / Math.tan(((FOV / 2) * Math.PI) / 180);
const TOTAL_SEGS = 6000;
const LANES = 3;

const COL = {
  SKY_T: '#0a0a2e', SKY_B: '#1a0a3e',
  MT_FAR: '#1a1a3a', MT_NEAR: '#252545',
  ROAD_L: '#444466', ROAD_D: '#3a3a5a',
  GRASS_L: '#1a3a1a', GRASS_D: '#153015',
  RUMBLE_L: '#ff2244', RUMBLE_D: '#ffffff',
  LANE_M: 'rgba(255,255,255,0.35)',
  TREE_TRUNK: '#6b4030', TREE_TOP: '#3dd854',
  P_BODY: '#00ccff', P_ACC: '#ff00aa', P_WIN: '#0a0a3a',
  CARS: [
    { b: '#ff3355', a: '#ff8800' },
    { b: '#44cc44', a: '#88ff44' },
    { b: '#ff8800', a: '#ffcc00' },
    { b: '#aa44ff', a: '#ff44ff' },
    { b: '#ffffff', a: '#cccccc' },
  ],
  COIN: '#ffe600',
  COIN_GLOW: '#ffaa00',
  BARREL: '#8B4513',
  BARREL_BAND: '#444444',
  CONE: '#ff6600',
  CONE_STRIPE: '#ffffff',
  OIL: 'rgba(0,0,0,0.85)',
};

// obstacle types
const OBS_CAR = 0;
const OBS_BARREL = 1;
const OBS_CONE = 2;
const OBS_OIL = 3;

// ===== SOUND ENGINE (Web Audio API) =====
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.started = false;
    this.muted = false;
  }

  setMuted(m) {
    this.muted = m;
    if (this.started && m) {
      this.engineGain.gain.value = 0;
      this.windGain.gain.value = 0;
    }
  }

  init() {
    if (this.started) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Engine sound - low oscillator
      this.engineOsc = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 60;
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineGain);
      this.engineGain.connect(this.ctx.destination);
      this.engineOsc.start();

      // Wind noise
      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0;
      const bufSize = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
      this.windNode = this.ctx.createBufferSource();
      this.windNode.buffer = buf;
      this.windNode.loop = true;
      const windFilter = this.ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 800;
      windFilter.Q.value = 0.5;
      this.windNode.connect(windFilter);
      windFilter.connect(this.windGain);
      this.windGain.connect(this.ctx.destination);
      this.windNode.start();

      this.started = true;
    } catch (e) {
      console.warn('Audio not available:', e);
    }
  }

  updateEngine(speedPct) {
    if (!this.started || this.muted) return;
    this.engineOsc.frequency.value = 60 + speedPct * 200;
    this.engineGain.gain.value = Math.min(speedPct * 0.12, 0.08);
    this.windGain.gain.value = Math.max(0, (speedPct - 0.3) * 0.15);
  }

  playCoin() {
    if (!this.ctx || this.muted) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    g.gain.value = 0.15;
    osc.connect(g); g.connect(this.ctx.destination);
    osc.start();
    osc.frequency.linearRampToValueAtTime(1760, this.ctx.currentTime + 0.1);
    g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.2);
    osc.stop(this.ctx.currentTime + 0.25);
  }

  playCrash() {
    if (!this.ctx || this.muted) return;
    const bufSize = this.ctx.sampleRate * 0.4;
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.15));
    const src = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    src.buffer = buf; g.gain.value = 0.3;
    src.connect(g); g.connect(this.ctx.destination);
    src.start();
  }

  playBarrel() {
    if (!this.ctx || this.muted) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 120;
    g.gain.value = 0.12;
    osc.connect(g); g.connect(this.ctx.destination);
    osc.start();
    osc.frequency.linearRampToValueAtTime(40, this.ctx.currentTime + 0.15);
    g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.2);
    osc.stop(this.ctx.currentTime + 0.25);
  }

  playJump() {
    if (!this.ctx || this.muted) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 220;
    g.gain.value = 0.18;
    osc.connect(g); g.connect(this.ctx.destination);
    osc.start();
    osc.frequency.exponentialRampToValueAtTime(720, this.ctx.currentTime + 0.18);
    g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.22);
    osc.stop(this.ctx.currentTime + 0.25);
  }

  playLand() {
    if (!this.ctx || this.muted) return;
    const bufSize = this.ctx.sampleRate * 0.12;
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.2)) * 0.4;
    const src = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    src.buffer = buf; g.gain.value = 0.25;
    src.connect(g); g.connect(this.ctx.destination);
    src.start();
  }

  playOil() {
    if (!this.ctx || this.muted) return;
    const bufSize = this.ctx.sampleRate * 0.6;
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.2 * Math.sin(i / 80);
    const src = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 400;
    src.buffer = buf; g.gain.value = 0.15;
    src.connect(filt); filt.connect(g); g.connect(this.ctx.destination);
    src.start();
  }

  stop() {
    if (!this.started) return;
    this.engineGain.gain.value = 0;
    this.windGain.gain.value = 0;
  }
}

// ===== DRAWING HELPERS =====
function trapezoid(ctx, x1, y1, w1, x2, y2, w2, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1 - w1, y1); ctx.lineTo(x1 + w1, y1);
  ctx.lineTo(x2 + w2, y2); ctx.lineTo(x2 - w2, y2);
  ctx.closePath(); ctx.fill();
}

function drawCar(ctx, cx, cy, w, h, body, accent, win) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(cx, cy + 2, w * 0.52, h * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = body;
  roundRect(ctx, cx - w * 0.44, cy - h * 0.55, w * 0.88, h * 0.6, 5);
  ctx.fillStyle = win;
  roundRect(ctx, cx - w * 0.28, cy - h * 0.82, w * 0.56, h * 0.33, 5);
  ctx.fillStyle = 'rgba(100,200,255,0.12)';
  roundRect(ctx, cx - w * 0.22, cy - h * 0.78, w * 0.22, h * 0.25, 3);
  ctx.fillStyle = accent;
  ctx.fillRect(cx - w * 0.38, cy - 0.01 * h, w * 0.76, h * 0.055);
  ctx.fillStyle = '#ffe600'; ctx.shadowColor = '#ffe600'; ctx.shadowBlur = 6;
  dot(ctx, cx - w * 0.33, cy + 0.01 * h, 2.5);
  dot(ctx, cx + w * 0.33, cy + 0.01 * h, 2.5); ctx.shadowBlur = 0;
  ctx.fillStyle = '#ff0044'; ctx.shadowColor = '#ff0044'; ctx.shadowBlur = 5;
  dot(ctx, cx - w * 0.33, cy - h * 0.53, 2);
  dot(ctx, cx + w * 0.33, cy - h * 0.53, 2); ctx.shadowBlur = 0;
  ctx.fillStyle = '#111';
  ctx.fillRect(cx - w * 0.48, cy - h * 0.12, w * 0.07, h * 0.16);
  ctx.fillRect(cx + w * 0.41, cy - h * 0.12, w * 0.07, h * 0.16);
  ctx.fillRect(cx - w * 0.48, cy - h * 0.52, w * 0.07, h * 0.16);
  ctx.fillRect(cx + w * 0.41, cy - h * 0.52, w * 0.07, h * 0.16);
}

function drawBarrel(ctx, cx, cy, w, h) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(cx, cy + 2, w * 0.45, h * 0.12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COL.BARREL;
  roundRect(ctx, cx - w * 0.35, cy - h * 0.7, w * 0.7, h * 0.75, 4);
  ctx.fillStyle = COL.BARREL_BAND;
  ctx.fillRect(cx - w * 0.36, cy - h * 0.55, w * 0.72, h * 0.08);
  ctx.fillRect(cx - w * 0.36, cy - h * 0.2, w * 0.72, h * 0.08);
  // hazard symbol
  ctx.fillStyle = '#ff0000';
  ctx.font = `${Math.max(8, w * 0.25)}px Arial`;
  ctx.textAlign = 'center';
  ctx.fillText('☠', cx, cy - h * 0.3);
}

function drawCone(ctx, cx, cy, w, h) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(cx, cy + 1, w * 0.35, h * 0.08, 0, 0, Math.PI * 2); ctx.fill();
  // base
  ctx.fillStyle = '#333';
  roundRect(ctx, cx - w * 0.35, cy - h * 0.08, w * 0.7, h * 0.12, 2);
  // cone body
  ctx.fillStyle = COL.CONE;
  ctx.beginPath();
  ctx.moveTo(cx, cy - h * 0.85);
  ctx.lineTo(cx - w * 0.28, cy - h * 0.05);
  ctx.lineTo(cx + w * 0.28, cy - h * 0.05);
  ctx.closePath(); ctx.fill();
  // white stripes
  ctx.fillStyle = COL.CONE_STRIPE;
  ctx.fillRect(cx - w * 0.2, cy - h * 0.55, w * 0.4, h * 0.1);
  ctx.fillRect(cx - w * 0.13, cy - h * 0.72, w * 0.26, h * 0.08);
}

function drawOilSlick(ctx, cx, cy, w, h) {
  // dark base — high contrast against road
  ctx.fillStyle = COL.OIL;
  ctx.beginPath();
  ctx.ellipse(cx, cy - h * 0.08, w * 0.6, h * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  // rainbow sheen — bright and obvious
  const grad = ctx.createRadialGradient(cx - w * 0.15, cy - h * 0.15, 0, cx, cy - h * 0.08, w * 0.55);
  grad.addColorStop(0, 'rgba(180,80,255,0.7)');
  grad.addColorStop(0.4, 'rgba(80,255,180,0.5)');
  grad.addColorStop(0.7, 'rgba(255,180,80,0.4)');
  grad.addColorStop(1, 'rgba(20,10,40,0.2)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(cx, cy - h * 0.08, w * 0.55, h * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawCoin(ctx, cx, cy, scale, time) {
  const r = scale * 300;
  if (r < 2) return;
  const wobble = Math.abs(Math.cos(time * 3 + cx * 0.01));
  // glow
  ctx.shadowColor = COL.COIN;
  ctx.shadowBlur = r * 1.5;
  ctx.fillStyle = COL.COIN;
  ctx.beginPath();
  ctx.ellipse(cx, cy - r * 0.8, r * wobble, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  // inner
  ctx.fillStyle = COL.COIN_GLOW;
  ctx.beginPath();
  ctx.ellipse(cx, cy - r * 0.8, r * 0.65 * wobble, r * 0.65, 0, 0, Math.PI * 2);
  ctx.fill();
  // $ symbol
  if (r > 6) {
    ctx.fillStyle = '#886600';
    ctx.font = `bold ${Math.floor(r)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', cx, cy - r * 0.8);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.fill();
}

function dot(ctx, x, y, r) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

// ===== BUILD ROAD =====
function buildRoad() {
  const segs = [];
  for (let i = 0; i < TOTAL_SEGS; i++) {
    let curve = 0, hill = 0;
    const zones = [
      [50, 250, 2], [300, 500, -3], [600, 800, 4], [900, 1100, -2],
      [1200, 1400, 5], [1500, 1700, -4], [1800, 2200, 3], [2400, 2600, -5],
      [2800, 3200, 2.5], [3400, 3600, -3.5], [3800, 4200, 4.5],
      [4400, 4800, -2.5], [5000, 5500, 6], [5600, 5900, -6],
    ];
    for (const [a, b, c] of zones) if (i > a && i < b) curve = c;
    const hills = [
      [80, 180, 80], [250, 350, -60], [400, 550, -50], [600, 700, 100],
      [700, 850, 90], [1000, 1200, -80], [1300, 1500, 120], [1600, 1800, -100],
      [1900, 2000, 70], [2000, 2300, 60], [2500, 2700, -90], [2800, 2900, 110],
      [3000, 3300, 100], [3400, 3500, -70], [3500, 3800, -60], [3900, 4000, 130],
      [4000, 4400, 80], [4500, 4600, -110], [4700, 4900, 90],
      [5000, 5200, -80], [5300, 5500, 100], [5600, 5800, -120],
    ];
    for (const [a, b, h] of hills) if (i > a && i < b) hill = h;

    segs.push({
      idx: i, curve, hill,
      p1: { world: { x: 0, y: 0, z: i * SEG_LEN }, screen: {}, camera: {} },
      p2: { world: { x: 0, y: 0, z: (i + 1) * SEG_LEN }, screen: {}, camera: {} },
      obstacles: [],
      coins: [],
      tree: Math.random() < 0.15,
      treeSide: Math.random() < 0.5 ? -1 : 1,
      treeOff: 1.2 + Math.random() * 0.8,
    });
  }
  let y = 0;
  for (const s of segs) { s.p1.world.y = y; y += s.hill; s.p2.world.y = y; }
  return segs;
}

function spawnObstacles(segs) {
  for (const s of segs) { s.obstacles = []; s.coins = []; }
  let cooldown = 0;
  for (let i = 40; i < segs.length - 10; i++) {
    const progress = i / segs.length;
    const obsRate = 0.025 + progress * 0.05;
    if (cooldown > 0) { cooldown--; continue; }
    if (Math.random() < obsRate) {
      const lane = Math.floor(Math.random() * LANES);
      const lw = ROAD_W / LANES;
      const x = -ROAD_W / 2 + lw * lane + lw / 2;

      // Pick obstacle type: 35% barrel, 45% cone, 20% oil (cars are now moving traffic)
      const roll = Math.random();
      let type;
      if (roll < 0.35) type = OBS_BARREL;
      else if (roll < 0.8) type = OBS_CONE;
      else type = OBS_OIL;

      const ci = Math.floor(Math.random() * COL.CARS.length);
      segs[i].obstacles.push({ x, ci, type, passed: false });

      const progressC = i / segs.length;
      cooldown = Math.max(3, Math.floor((8 + Math.random() * 12) * (1 - progressC * 0.55)));
    }
  }

  // Spawn coins - more frequent, in lines of 3-5
  for (let i = 20; i < segs.length - 10; i++) {
    if (Math.random() < 0.02) {
      const lane = Math.floor(Math.random() * LANES);
      const lw = ROAD_W / LANES;
      const x = -ROAD_W / 2 + lw * lane + lw / 2;
      const runLen = 3 + Math.floor(Math.random() * 4);
      for (let j = 0; j < runLen && (i + j) < segs.length; j++) {
        // Don't place coins where obstacles are
        if (segs[i + j].obstacles.length === 0) {
          segs[i + j].coins.push({ x, collected: false });
        }
      }
      i += runLen + 5;
    }
  }
}

function spawnTraffic(tLen) {
  const traffic = [];
  const startGap = 1500; // small empty zone in front of player at start
  for (let i = 0; i < NUM_TRAFFIC; i++) {
    const lane = Math.floor(Math.random() * LANES);
    const lw = ROAD_W / LANES;
    const x = -ROAD_W / 2 + lw * lane + lw / 2;
    const z = startGap + (i / NUM_TRAFFIC) * (tLen - startGap - 1000) + Math.random() * 200;
    const speed = SEG_LEN * (0.35 + Math.random() * 0.4);
    const ci = Math.floor(Math.random() * COL.CARS.length);
    traffic.push({ x, z, speed, ci });
  }
  return traffic;
}

// ===== PROJECT =====
function project3d(p, camX, camY, camZ, W, H) {
  p.camera = { x: p.world.x - camX, y: p.world.y - camY, z: p.world.z - camZ };
  if (p.camera.z <= 0) { p.screen = { x: 0, y: 0, w: 0 }; p.scale = 0; return; }
  p.scale = CAM_DEPTH / p.camera.z;
  p.screen = {
    x: Math.round(W / 2 + p.scale * p.camera.x * W / 2),
    y: Math.round(H / 2 - p.scale * p.camera.y * H / 2),
    w: Math.round(p.scale * ROAD_W * W / 2),
  };
}

// ===== HOOK =====
const BASE_MAX_SPD = SEG_LEN * 1.2;

export function useGameEngine() {
  const canvasRef = useRef(null);
  const soundRef = useRef(new SoundEngine());
  const loopRef = useRef(null);
  const S = useRef({
    state: 'start',
    score: 0, coins: 0,
    best: parseInt(localStorage.getItem('trBest') || '0'),
    speed: 0,
    maxSpd: BASE_MAX_SPD,
    accel: SEG_LEN * 0.006,
    decel: SEG_LEN * 0.003,
    brake: SEG_LEN * 0.01,
    offSpd: SEG_LEN * 0.004,
    px: 0, pos: 0, steer: 0,
    jumpY: 0, jumpV: 0,
    segs: [], tLen: 0, trafficCars: [],
    keys: { l: false, r: false, u: false, d: false },
    particles: [],
    smokeTimer: 0,
    oilSlide: 0,
    shakeX: 0, shakeY: 0, shakeDur: 0,
    af: null, lt: 0, gameTime: 0,
    level: 1, diffMul: 1,
    muted: false,
    cb: null,
  });

  const initRoad = useCallback(() => {
    const s = S.current;
    s.segs = buildRoad();
    s.tLen = s.segs.length * SEG_LEN;
    spawnObstacles(s.segs);
    s.trafficCars = spawnTraffic(s.tLen);
  }, []);

  const notifyState = useCallback(() => {
    const s = S.current;
    if (!s.cb) return;
    const sp = s.maxSpd > 0 ? s.speed / s.maxSpd : 0;
    s.cb(s.state, s.score, s.best, Math.floor(sp * 280), s.coins, s.level, s.muted);
  }, []);

  const toggleMute = useCallback(() => {
    const s = S.current;
    s.muted = !s.muted;
    soundRef.current.setMuted(s.muted);
    notifyState();
    return s.muted;
  }, [notifyState]);

  const togglePause = useCallback(() => {
    const s = S.current;
    if (s.state === 'playing') s.state = 'paused';
    else if (s.state === 'paused') {
      s.state = 'playing';
      s.lt = performance.now();
    } else return;
    notifyState();
  }, [notifyState]);

  const startGame = useCallback(() => {
    const s = S.current;
    soundRef.current.init();
    s.state = 'playing';
    s.score = 0; s.coins = 0;
    s.speed = 0; s.px = 0; s.pos = 0;
    s.particles = []; s.shakeDur = 0; s.oilSlide = 0; s.gameTime = 0;
    s.jumpY = 0; s.jumpV = 0;
    s.level = 1; s.diffMul = 1; s.maxSpd = BASE_MAX_SPD;
    initRoad();
    if (s.cb) s.cb('playing', 0, s.best, 0, 0, 1, s.muted);
  }, [initRoad]);

  // ===== GAME LOOP =====
  const loop = useCallback((ts) => {
    const s = S.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dt = Math.min((ts - s.lt) / 1000, 0.05);
    s.lt = ts;
    const W = canvas.width;
    const H = canvas.height;

    // ---- UPDATE ----
    if (s.state === 'playing') {
      s.gameTime += dt;
      s.diffMul = 1 + Math.min(s.gameTime / 60, 1);
      s.maxSpd = BASE_MAX_SPD * s.diffMul;
      const newLevel = Math.floor(s.gameTime / 10) + 1;
      if (newLevel !== s.level) s.level = newLevel;

      if (s.keys.u) s.speed = Math.min(s.speed + s.accel * dt * 60, s.maxSpd);
      else if (s.keys.d) s.speed = Math.max(s.speed - s.brake * dt * 60, 0);
      else s.speed = Math.max(s.speed - s.decel * dt * 60, 0);

      if (!s.keys.u && !s.keys.d && s.speed < s.maxSpd * 0.4)
        s.speed = Math.min(s.speed + s.accel * 0.3 * dt * 60, s.maxSpd * 0.4);

      s.steer = 0;
      if (s.keys.l) s.steer = -1;
      if (s.keys.r) s.steer = 1;

      // Oil slide effect - random drift
      if (s.oilSlide > 0) {
        s.oilSlide -= dt;
        s.px += (Math.sin(s.gameTime * 15) * 3000) * dt;
        s.steer += Math.sin(s.gameTime * 10) * 0.5;
      }

      const segI = Math.floor(s.pos / SEG_LEN) % s.segs.length;
      const seg = s.segs[segI];
      const sp = s.speed / s.maxSpd;

      s.px += s.steer * sp * 5000 * dt;
      s.px -= seg.curve * sp * s.speed * 0.008 * dt * 60;

      if (Math.abs(s.px) > ROAD_W / 2) {
        s.speed = Math.max(s.speed - s.offSpd * dt * 60, 0);
        s.px = Math.max(-ROAD_W * 0.8, Math.min(ROAD_W * 0.8, s.px));
      }

      // Jump physics
      if (s.jumpV !== 0 || s.jumpY < 0) {
        const wasInAir = s.jumpY < 0;
        s.jumpV += GRAVITY * dt * 60;
        s.jumpY += s.jumpV * dt * 60;
        if (s.jumpY >= 0) {
          s.jumpY = 0;
          s.jumpV = 0;
          if (wasInAir) {
            soundRef.current.playLand();
            for (let pi = 0; pi < 6; pi++) {
              s.particles.push({
                x: W / 2 + (Math.random() - 0.5) * 50,
                y: H - 70 + (Math.random() - 0.5) * 8,
                vx: (Math.random() - 0.5) * 5,
                vy: -Math.random() * 2,
                life: 0.4, col: 'rgba(120,120,140,',
                sz: 4 + Math.random() * 3, type: 'smoke',
              });
            }
          }
        }
      }

      // Edge of road slowdown (mild) before fully off-road (heavy)
      const ax = Math.abs(s.px);
      if (ax > ROAD_W * 0.4 && ax <= ROAD_W / 2) {
        const minEdgeSpd = s.maxSpd * 0.45;
        if (s.speed > minEdgeSpd) {
          s.speed = Math.max(s.speed - s.offSpd * 0.5 * dt * 60, minEdgeSpd);
        }
      }

      s.pos += s.speed * dt * 60;
      if (s.pos >= s.tLen) s.pos -= s.tLen;
      s.score += Math.floor(s.speed * dt * 0.1);
      if (s.score > s.best) {
        s.best = s.score;
        s.bestSaveT = (s.bestSaveT || 0) + dt;
        if (s.bestSaveT > 2) {
          localStorage.setItem('trBest', String(s.best));
          s.bestSaveT = 0;
        }
      }

      // Advance traffic cars
      for (const c of s.trafficCars) {
        c.z += c.speed * dt * 60;
        if (c.z >= s.tLen) c.z -= s.tLen;
      }

      // Engine sound
      soundRef.current.updateEngine(sp);

      // Smoke trail
      s.smokeTimer += dt;
      if (s.smokeTimer > 0.03 && s.speed > s.maxSpd * 0.1) {
        s.smokeTimer = 0;
        const intensity = sp;
        for (let si = 0; si < (sp > 0.7 ? 2 : 1); si++) {
          s.particles.push({
            x: W / 2 + (Math.random() - 0.5) * 30 + s.steer * -15,
            y: H - 48 + Math.random() * 10,
            vx: (Math.random() - 0.5) * 1.5 + s.steer * -2,
            vy: 1 + Math.random() * 2,
            life: 0.4 + intensity * 0.4,
            col: sp > 0.8 ? 'rgba(100,100,120,' : 'rgba(80,80,100,',
            sz: 3 + Math.random() * 4 + intensity * 3,
            type: 'smoke',
          });
        }
      }

      // Collision & coin detection
      const psi = Math.floor(s.pos / SEG_LEN) % s.segs.length;
      for (let k = -1; k <= 2; k++) {
        const ci = (psi + k + s.segs.length) % s.segs.length;
        const cs = s.segs[ci];

        // Obstacles (skipped while in air)
        const inAir = s.jumpY < -20;
        for (const o of cs.obstacles) {
          if (inAir) { o.passed = true; continue; }
          const oz = cs.idx * SEG_LEN;
          const relZ = Math.abs(((s.pos - oz) + s.tLen / 2) % s.tLen - s.tLen / 2);
          const hitDist = o.type === OBS_OIL ? 400 : 350;
          if (relZ < SEG_LEN * 0.8) {
            const dx = Math.abs(s.px - o.x);
            if (dx < hitDist && !o.passed) {
              if (o.type === OBS_OIL) {
                // Oil doesn't kill - makes you slide
                o.passed = true;
                s.oilSlide = 1.5;
                soundRef.current.playOil();
                // oil particles
                for (let pi = 0; pi < 8; pi++) {
                  s.particles.push({
                    x: W / 2 + (Math.random() - 0.5) * 40,
                    y: H - 100 + (Math.random() - 0.5) * 20,
                    vx: (Math.random() - 0.5) * 4,
                    vy: -Math.random() * 2,
                    life: 0.6, col: 'rgba(40,20,80,',
                    sz: 4 + Math.random() * 4, type: 'smoke',
                  });
                }
              } else if (o.type === OBS_CONE) {
                // Cones slow you down but don't kill
                o.passed = true;
                s.speed *= 0.3;
                s.shakeDur = 150;
                soundRef.current.playBarrel();
                for (let pi = 0; pi < 6; pi++) {
                  s.particles.push({
                    x: W / 2 + (Math.random() - 0.5) * 30,
                    y: H - 100 + (Math.random() - 0.5) * 15,
                    vx: (Math.random() - 0.5) * 6,
                    vy: -Math.random() * 5 - 1,
                    life: 0.8,
                    col: '#ff6600', sz: 4 + Math.random() * 4, type: 'explosion',
                  });
                }
              } else {
                // Barrel = soft crash: speed drops to 0, game continues
                o.passed = true;
                s.speed = 0;
                s.shakeDur = 400;
                soundRef.current.playCrash();
                for (let pi = 0; pi < 18; pi++) {
                  s.particles.push({
                    x: W / 2 + (Math.random() - 0.5) * 60,
                    y: H - 110 + (Math.random() - 0.5) * 30,
                    vx: (Math.random() - 0.5) * 8,
                    vy: -Math.random() * 5 - 1,
                    life: 0.8,
                    col: ['#ff3355', '#ff8800', '#ffe600'][Math.floor(Math.random() * 3)],
                    sz: 3 + Math.random() * 5, type: 'explosion',
                  });
                }
              }
            }
          } else if (relZ > SEG_LEN) {
            o.passed = true;
          }
        }

        // Coins
        for (const coin of cs.coins) {
          if (coin.collected) continue;
          const cz = cs.idx * SEG_LEN;
          const relZ = Math.abs(((s.pos - cz) + s.tLen / 2) % s.tLen - s.tLen / 2);
          if (relZ < SEG_LEN * 0.8) {
            const dx = Math.abs(s.px - coin.x);
            if (dx < 400) {
              coin.collected = true;
              s.coins++;
              s.score += 50;
              soundRef.current.playCoin();
              // sparkle particles
              for (let pi = 0; pi < 10; pi++) {
                s.particles.push({
                  x: W / 2 + (Math.random() - 0.5) * 40,
                  y: H - 130 + (Math.random() - 0.5) * 30,
                  vx: (Math.random() - 0.5) * 6,
                  vy: -Math.random() * 4 - 1,
                  life: 0.8,
                  col: '#ffe600', sz: 2 + Math.random() * 3, type: 'explosion',
                });
              }
            }
          }
        }
      }

      // Traffic car collision
      if (s.jumpY > -20) {
        for (const c of s.trafficCars) {
          let rel = c.z - s.pos;
          if (rel > s.tLen / 2) rel -= s.tLen;
          if (rel < -s.tLen / 2) rel += s.tLen;
          if (Math.abs(rel) < SEG_LEN * 0.7 && Math.abs(c.x - s.px) < 350) {
            s.speed = 0;
            s.shakeDur = 400;
            soundRef.current.playCrash();
            for (let pi = 0; pi < 22; pi++) {
              s.particles.push({
                x: W / 2 + (Math.random() - 0.5) * 70,
                y: H - 110 + (Math.random() - 0.5) * 30,
                vx: (Math.random() - 0.5) * 9,
                vy: -Math.random() * 6 - 1,
                life: 0.9,
                col: ['#ff3355', '#ff8800', '#ffe600', '#ffffff'][Math.floor(Math.random() * 4)],
                sz: 3 + Math.random() * 6, type: 'explosion',
              });
            }
            // Push the crashed car forward so we don't keep colliding
            c.z = (s.pos + SEG_LEN * 2.5) % s.tLen;
            break;
          }
        }
      }

      if (s.cb) s.cb('playing', s.score, s.best, Math.floor(sp * 280), s.coins, s.level, s.muted);
    } else if (s.state === 'paused') {
      soundRef.current.updateEngine(0);
      if (soundRef.current.started) {
        soundRef.current.engineGain.gain.value = 0;
        soundRef.current.windGain.gain.value = 0;
      }
    }

    // Update particles
    s.particles = s.particles.filter(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.type === 'smoke') {
        p.sz *= 1.02;
        p.life -= 0.025;
      } else {
        p.vy += 0.15;
        p.life -= 0.02;
      }
      return p.life > 0;
    });

    // Shake
    if (s.shakeDur > 0) {
      s.shakeX = (Math.random() - 0.5) * 10;
      s.shakeY = (Math.random() - 0.5) * 10;
      s.shakeDur -= dt * 1000;
    } else { s.shakeX = 0; s.shakeY = 0; }

    // ---- RENDER ----
    ctx.save();
    ctx.translate(s.shakeX, s.shakeY);

    // Sky
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.5);
    sky.addColorStop(0, COL.SKY_T); sky.addColorStop(1, COL.SKY_B);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

    // Stars
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 80; i++) dot(ctx, (i * 137.5) % W, (i * 97.3) % (H * 0.35), 0.5 + (i % 3) * 0.5);

    // Mountains
    ctx.fillStyle = COL.MT_FAR;
    ctx.beginPath(); ctx.moveTo(0, H * 0.45);
    for (let mx = 0; mx <= W; mx += 40)
      ctx.lineTo(mx, H * 0.35 + Math.sin(mx * 0.005 + s.pos * 0.00003) * 40 + Math.sin(mx * 0.01) * 20);
    ctx.lineTo(W, H * 0.5); ctx.lineTo(0, H * 0.5); ctx.fill();

    ctx.fillStyle = COL.MT_NEAR;
    ctx.beginPath(); ctx.moveTo(0, H * 0.48);
    for (let mx = 0; mx <= W; mx += 30)
      ctx.lineTo(mx, H * 0.40 + Math.sin(mx * 0.008 + s.pos * 0.00005) * 30 + Math.cos(mx * 0.015) * 15);
    ctx.lineTo(W, H * 0.5); ctx.lineTo(0, H * 0.5); ctx.fill();

    // ---- ROAD ----
    const baseSeg = Math.floor(s.pos / SEG_LEN) % s.segs.length;
    const baseFrac = (s.pos % SEG_LEN) / SEG_LEN;
    const bs = s.segs[baseSeg];
    const playerY = bs.p1.world.y + (bs.p2.world.y - bs.p1.world.y) * baseFrac;

    let curveX = 0, curveDx = 0, clipY = H;
    const toDraw = [];
    const trafficByN = {};
    for (const c of s.trafficCars) {
      let rel = c.z - s.pos;
      if (rel > s.tLen / 2) rel -= s.tLen;
      if (rel < -s.tLen / 2) rel += s.tLen;
      if (rel < -SEG_LEN || rel > DRAW_DIST * SEG_LEN) continue;
      const nIdx = Math.floor((rel + (s.pos % SEG_LEN)) / SEG_LEN);
      if (nIdx < 0 || nIdx >= DRAW_DIST) continue;
      if (!trafficByN[nIdx]) trafficByN[nIdx] = [];
      trafficByN[nIdx].push({ c, rel });
    }

    for (let n = 0; n < DRAW_DIST; n++) {
      const i = (baseSeg + n) % s.segs.length;
      const sg = s.segs[i];
      const loZ = n * SEG_LEN - (s.pos % SEG_LEN);
      const hiZ = loZ + SEG_LEN;

      const p1 = { world: { x: curveX, y: sg.p1.world.y, z: loZ }, screen: {}, camera: {}, scale: 0 };
      const p2 = { world: { x: curveX + curveDx, y: sg.p2.world.y, z: hiZ }, screen: {}, camera: {}, scale: 0 };

      project3d(p1, s.px, playerY + CAM_H, 0, W, H);
      project3d(p2, s.px, playerY + CAM_H, 0, W, H);

      curveX += curveDx;
      curveDx += sg.curve;

      if (p1.camera.z <= 0 && p2.camera.z <= 0) continue;
      if (p2.screen.y >= clipY) continue;

      toDraw.push({ i, sg, p1, p2, alt: Math.floor(i / 3) % 2 === 0, n });
    }

    // Draw back to front
    for (let d = toDraw.length - 1; d >= 0; d--) {
      const { sg, p1, p2, alt, n } = toDraw[d];
      const detailed = n < DETAIL_DIST;

      // grass
      trapezoid(ctx, p1.screen.x, p1.screen.y, W * 2, p2.screen.x, p2.screen.y, W * 2,
        alt ? COL.GRASS_L : COL.GRASS_D);
      // rumble
      trapezoid(ctx, p1.screen.x, p1.screen.y, p1.screen.w * 1.15,
        p2.screen.x, p2.screen.y, p2.screen.w * 1.15,
        alt ? COL.RUMBLE_L : COL.RUMBLE_D);
      // road
      trapezoid(ctx, p1.screen.x, p1.screen.y, p1.screen.w,
        p2.screen.x, p2.screen.y, p2.screen.w,
        alt ? COL.ROAD_L : COL.ROAD_D);
      // lane markings (only near)
      if (alt && detailed) {
        const lw1 = p1.screen.w * 0.01, lw2 = p2.screen.w * 0.01;
        for (let ln = 1; ln < LANES; ln++) {
          const lx1 = p1.screen.x - p1.screen.w + (p1.screen.w * 2 * ln) / LANES;
          const lx2 = p2.screen.x - p2.screen.w + (p2.screen.w * 2 * ln) / LANES;
          trapezoid(ctx, lx1, p1.screen.y, lw1, lx2, p2.screen.y, lw2, COL.LANE_M);
        }
      }

      // Trees — anchor at segment midpoint so close segs don't go off-screen
      if (detailed && sg.tree) {
        const midScale = (p1.scale + p2.scale) / 2;
        const midX = (p1.screen.x + p2.screen.x) / 2;
        const midY = (p1.screen.y + p2.screen.y) / 2;
        const midW = (p1.screen.w + p2.screen.w) / 2;
        const tx = midX + sg.treeSide * midW * sg.treeOff;
        const ty = Math.min(midY, H - 10);
        const ts = midScale * 28000;
        if (ts > 1.5) {
          ctx.fillStyle = COL.TREE_TRUNK;
          ctx.fillRect(tx - ts * 0.08, ty - ts * 0.6, ts * 0.16, ts * 0.6);
          ctx.fillStyle = COL.TREE_TOP;
          ctx.beginPath(); ctx.moveTo(tx, ty - ts * 1.4);
          ctx.lineTo(tx - ts * 0.4, ty - ts * 0.5);
          ctx.lineTo(tx + ts * 0.4, ty - ts * 0.5);
          ctx.closePath(); ctx.fill();
          ctx.beginPath(); ctx.moveTo(tx, ty - ts * 1.1);
          ctx.lineTo(tx - ts * 0.5, ty - ts * 0.3);
          ctx.lineTo(tx + ts * 0.5, ty - ts * 0.3);
          ctx.closePath(); ctx.fill();
        }
      }

      // Coins — anchor at midpoint
      for (const coin of sg.coins) {
        if (coin.collected) continue;
        const midScale = (p1.scale + p2.scale) / 2;
        if (midScale > 0) {
          const midX = (p1.screen.x + p2.screen.x) / 2;
          const midY = (p1.screen.y + p2.screen.y) / 2;
          const ox = midX + (coin.x * midScale * W) / 2;
          const oy = Math.min(midY, H - 5);
          drawCoin(ctx, ox, oy, midScale, s.gameTime);
        }
      }

      // Traffic cars in this segment
      const carsHere = trafficByN[n];
      if (carsHere) {
        const segLoZ = n * SEG_LEN - (s.pos % SEG_LEN);
        for (const { c, rel } of carsHere) {
          const t = Math.max(0, Math.min(1, (rel - segLoZ) / SEG_LEN));
          const sx = p1.screen.x + (p2.screen.x - p1.screen.x) * t;
          const sy = p1.screen.y + (p2.screen.y - p1.screen.y) * t;
          const scale = p1.scale + (p2.scale - p1.scale) * t;
          if (scale <= 0) continue;
          const ox = sx + (c.x * scale * W) / 2;
          const oyClamp = Math.min(sy, H - 10);
          const cw = scale * 9000;
          const ch = scale * 7000;
          if (cw > 2) {
            const col = COL.CARS[c.ci];
            drawCar(ctx, ox, oyClamp, cw, ch, col.b, col.a, '#1a1a3a');
          }
        }
      }

      // Obstacles — anchor at midpoint, generous scale multiplier
      for (const o of sg.obstacles) {
        if (o.passed && (o.type === OBS_CONE || o.type === OBS_OIL)) continue;
        const midScale = (p1.scale + p2.scale) / 2;
        if (midScale <= 0) continue;
        const midX = (p1.screen.x + p2.screen.x) / 2;
        const midY = (p1.screen.y + p2.screen.y) / 2;
        const ox = midX + (o.x * midScale * W) / 2;
        const oy = Math.min(midY, H - 10);
        const cw = midScale * 9000;
        const ch = midScale * 7000;
        if (cw > 2) {
          if (o.type === OBS_CAR) {
            const c = COL.CARS[o.ci];
            drawCar(ctx, ox, oy, cw, ch, c.b, c.a, '#1a1a3a');
          } else if (o.type === OBS_BARREL) {
            drawBarrel(ctx, ox, oy, cw, ch);
          } else if (o.type === OBS_CONE) {
            drawCone(ctx, ox, oy, cw * 0.55, ch * 0.55);
          } else if (o.type === OBS_OIL) {
            drawOilSlick(ctx, ox, oy, cw * 1.4, ch);
          }
        }
      }

      if (p2.screen.y < clipY) clipY = p2.screen.y;
    }

    // Player car
    if (s.state !== 'start') {
      const pw = 70, ph = 90;
      // Ground shadow when jumping (separate so it stays on the ground)
      if (s.jumpY < 0) {
        const heightFrac = Math.min(-s.jumpY / 250, 1);
        const shScale = 1 - heightFrac * 0.6;
        ctx.fillStyle = `rgba(0,0,0,${0.45 * (1 - heightFrac * 0.5)})`;
        ctx.beginPath();
        ctx.ellipse(W / 2, H - 78, 32 * shScale, 6 * shScale, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.save();
      ctx.translate(W / 2, H - 90 + s.jumpY);
      const tilt = s.steer * -0.05 + (s.oilSlide > 0 ? Math.sin(s.gameTime * 12) * 0.08 : 0)
        + (s.jumpV < 0 ? -0.08 : s.jumpY < 0 ? 0.08 : 0);
      ctx.rotate(tilt);
      drawCar(ctx, 0, 0, pw, ph, COL.P_BODY, COL.P_ACC, COL.P_WIN);
      ctx.restore();

      // Speed lines
      if (s.speed > s.maxSpd * 0.6) {
        const a = (s.speed / s.maxSpd - 0.6) * 2;
        ctx.strokeStyle = `rgba(0,240,255,${a * 0.3})`;
        ctx.lineWidth = 2;
        for (let sl = 0; sl < 5; sl++) {
          const lx = W / 2 + (Math.random() - 0.5) * 120;
          const ly = H - 70 + Math.random() * 40;
          ctx.beginPath(); ctx.moveTo(lx, ly);
          ctx.lineTo(lx + (Math.random() - 0.5) * 5, ly + 20 + Math.random() * 20);
          ctx.stroke();
        }
      }

      // Oil slide warning
      if (s.oilSlide > 0) {
        ctx.fillStyle = `rgba(100,50,200,${0.15 + Math.sin(s.gameTime * 10) * 0.1})`;
        ctx.fillRect(0, 0, W, H);
      }
    }

    // Particles (smoke & explosions)
    for (const p of s.particles) {
      if (p.type === 'smoke') {
        ctx.globalAlpha = p.life * 0.5;
        ctx.fillStyle = p.col + (p.life * 0.4).toFixed(2) + ')';
        dot(ctx, p.x, p.y, p.sz);
      } else {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.col;
        dot(ctx, p.x, p.y, p.sz * p.life);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    s.af = requestAnimationFrame(loopRef.current);
  }, []);

  useEffect(() => {
    loopRef.current = loop;
  }, [loop]);

  // ===== SETUP =====
  const setup = useCallback((cb) => {
    const s = S.current;
    s.cb = cb;
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = 800;
    canvas.height = 600;

    const kd = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') s.keys.l = true;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') s.keys.r = true;
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') s.keys.u = true;
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') s.keys.d = true;
      if (e.key === 'm' || e.key === 'M') toggleMute();
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        togglePause();
      }
      if (e.key === ' ') {
        e.preventDefault();
        if (s.state === 'playing' && s.jumpY === 0 && s.jumpV === 0) {
          s.jumpV = -JUMP_V;
          soundRef.current.playJump();
        }
      }
    };
    const ku = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') s.keys.l = false;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') s.keys.r = false;
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') s.keys.u = false;
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') s.keys.d = false;
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);

    const touchH = (e, down) => {
      e.preventDefault();
      s.keys.l = false; s.keys.r = false; s.keys.u = false;
      if (down) {
        s.keys.u = true;
        for (const t of e.touches) {
          if (t.clientX < window.innerWidth / 2) s.keys.l = true;
          else s.keys.r = true;
        }
      }
    };
    canvas.addEventListener('touchstart', (e) => touchH(e, true), { passive: false });
    canvas.addEventListener('touchmove', (e) => touchH(e, true), { passive: false });
    canvas.addEventListener('touchend', (e) => touchH(e, false), { passive: false });

    initRoad();
    s.lt = performance.now();
    s.af = requestAnimationFrame(loopRef.current);

    return () => {
      cancelAnimationFrame(s.af);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }, [initRoad, toggleMute, togglePause]);

  return { canvasRef, setup, startGame, toggleMute, togglePause, stateRef: S };
}

export default useGameEngine;

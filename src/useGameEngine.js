import { useRef, useCallback } from 'react';

// ===== CONSTANTS =====
const ROAD_W = 2000;
const SEG_LEN = 200;
const DRAW_DIST = 120;
const CAM_H = 1000;
const FOV = 100;
const CAM_DEPTH = 1 / Math.tan(((FOV / 2) * Math.PI) / 180);
const TOTAL_SEGS = 6000;
const LANES = 3;

const COL = {
  SKY_T: '#0a0a2e',
  SKY_B: '#1a0a3e',
  MT_FAR: '#1a1a3a',
  MT_NEAR: '#252545',
  ROAD_L: '#444466',
  ROAD_D: '#3a3a5a',
  GRASS_L: '#1a3a1a',
  GRASS_D: '#153015',
  RUMBLE_L: '#ff2244',
  RUMBLE_D: '#ffffff',
  LANE_M: 'rgba(255,255,255,0.35)',
  TREE_TRUNK: '#3d2b1f',
  TREE_TOP: '#1a8a3a',
  P_BODY: '#00ccff',
  P_ACC: '#ff00aa',
  P_WIN: '#0a0a3a',
  CARS: [
    { b: '#ff3355', a: '#ff8800' },
    { b: '#44cc44', a: '#88ff44' },
    { b: '#ff8800', a: '#ffcc00' },
    { b: '#aa44ff', a: '#ff44ff' },
    { b: '#ffffff', a: '#cccccc' },
  ],
};

// ===== helpers =====
function trapezoid(ctx, x1, y1, w1, x2, y2, w2, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1 - w1, y1);
  ctx.lineTo(x1 + w1, y1);
  ctx.lineTo(x2 + w2, y2);
  ctx.lineTo(x2 - w2, y2);
  ctx.closePath();
  ctx.fill();
}

function drawCar(ctx, cx, cy, w, h, body, accent, win) {
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 2, w * 0.52, h * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  // body
  ctx.fillStyle = body;
  roundRect(ctx, cx - w * 0.44, cy - h * 0.55, w * 0.88, h * 0.6, 5);
  // roof
  ctx.fillStyle = win;
  roundRect(ctx, cx - w * 0.28, cy - h * 0.82, w * 0.56, h * 0.33, 5);
  // shine
  ctx.fillStyle = 'rgba(100,200,255,0.12)';
  roundRect(ctx, cx - w * 0.22, cy - h * 0.78, w * 0.22, h * 0.25, 3);
  // front accent
  ctx.fillStyle = accent;
  ctx.fillRect(cx - w * 0.38, cy - 0.01 * h, w * 0.76, h * 0.055);
  // headlights
  ctx.fillStyle = '#ffe600';
  ctx.shadowColor = '#ffe600';
  ctx.shadowBlur = 6;
  dot(ctx, cx - w * 0.33, cy + 0.01 * h, 2.5);
  dot(ctx, cx + w * 0.33, cy + 0.01 * h, 2.5);
  ctx.shadowBlur = 0;
  // taillights
  ctx.fillStyle = '#ff0044';
  ctx.shadowColor = '#ff0044';
  ctx.shadowBlur = 5;
  dot(ctx, cx - w * 0.33, cy - h * 0.53, 2);
  dot(ctx, cx + w * 0.33, cy - h * 0.53, 2);
  ctx.shadowBlur = 0;
  // wheels
  ctx.fillStyle = '#111';
  ctx.fillRect(cx - w * 0.48, cy - h * 0.12, w * 0.07, h * 0.16);
  ctx.fillRect(cx + w * 0.41, cy - h * 0.12, w * 0.07, h * 0.16);
  ctx.fillRect(cx - w * 0.48, cy - h * 0.52, w * 0.07, h * 0.16);
  ctx.fillRect(cx + w * 0.41, cy - h * 0.52, w * 0.07, h * 0.16);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
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
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// ===== build road =====
function buildRoad() {
  const segs = [];
  for (let i = 0; i < TOTAL_SEGS; i++) {
    let curve = 0;
    let hill = 0;
    // curves
    const zones = [
      [50, 250, 2], [300, 500, -3], [600, 800, 4], [900, 1100, -2],
      [1200, 1400, 5], [1500, 1700, -4], [1800, 2200, 3], [2400, 2600, -5],
      [2800, 3200, 2.5], [3400, 3600, -3.5], [3800, 4200, 4.5],
      [4400, 4800, -2.5], [5000, 5500, 6], [5600, 5900, -6],
    ];
    for (const [a, b, c] of zones) if (i > a && i < b) curve = c;
    // hills
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
      idx: i,
      curve,
      hill,
      p1: { world: { x: 0, y: 0, z: i * SEG_LEN }, screen: {}, camera: {} },
      p2: { world: { x: 0, y: 0, z: (i + 1) * SEG_LEN }, screen: {}, camera: {} },
      obstacles: [],
      tree: Math.random() < 0.15,
      treeSide: Math.random() < 0.5 ? -1 : 1,
      treeOff: 1.2 + Math.random() * 0.8,
    });
  }
  // accumulate Y from hills
  let y = 0;
  for (const s of segs) {
    s.p1.world.y = y;
    y += s.hill;
    s.p2.world.y = y;
  }
  return segs;
}

function spawnObstacles(segs) {
  for (const s of segs) s.obstacles = [];
  let cooldown = 0;
  for (let i = 40; i < segs.length - 10; i++) {
    if (cooldown > 0) { cooldown--; continue; }
    if (Math.random() < 0.035) {
      const lane = Math.floor(Math.random() * LANES);
      const lw = ROAD_W / LANES;
      const x = -ROAD_W / 2 + lw * lane + lw / 2;
      const ci = Math.floor(Math.random() * COL.CARS.length);
      segs[i].obstacles.push({ x, ci, passed: false });
      // sometimes spawn a second car in adjacent lane
      if (Math.random() < 0.3) {
        const lane2 = (lane + (Math.random() < 0.5 ? 1 : -1) + LANES) % LANES;
        const x2 = -ROAD_W / 2 + lw * lane2 + lw / 2;
        const ci2 = Math.floor(Math.random() * COL.CARS.length);
        segs[i].obstacles.push({ x: x2, ci: ci2, passed: false });
      }
      cooldown = 8 + Math.floor(Math.random() * 12); // min gap between groups
    }
  }
}

// ===== project =====
function project3d(p, camX, camY, camZ, W, H) {
  p.camera = {
    x: p.world.x - camX,
    y: p.world.y - camY,
    z: p.world.z - camZ,
  };
  if (p.camera.z <= 0) { p.screen = { x: 0, y: 0, w: 0 }; p.scale = 0; return; }
  p.scale = CAM_DEPTH / p.camera.z;
  p.screen = {
    x: Math.round(W / 2 + p.scale * p.camera.x * W / 2),
    y: Math.round(H / 2 - p.scale * p.camera.y * H / 2),
    w: Math.round(p.scale * ROAD_W * W / 2),
  };
}

// ===== HOOK =====
export function useGameEngine() {
  const canvasRef = useRef(null);
  const S = useRef({
    state: 'start',
    score: 0,
    best: parseInt(localStorage.getItem('trBest') || '0'),
    speed: 0,
    maxSpd: SEG_LEN * 1.2,
    accel: SEG_LEN * 0.006,
    decel: SEG_LEN * 0.003,
    brake: SEG_LEN * 0.01,
    offSpd: SEG_LEN * 0.004,
    px: 0,
    pos: 0,
    steer: 0,
    segs: [],
    tLen: 0,
    keys: { l: false, r: false, u: false, d: false },
    particles: [],
    shakeX: 0, shakeY: 0, shakeDur: 0,
    af: null,
    lt: 0,
    cb: null,
  });

  const initRoad = useCallback(() => {
    const s = S.current;
    s.segs = buildRoad();
    s.tLen = s.segs.length * SEG_LEN;
    spawnObstacles(s.segs);
  }, []);

  const startGame = useCallback(() => {
    const s = S.current;
    s.state = 'playing';
    s.score = 0;
    s.speed = 0;
    s.px = 0;
    s.pos = 0;
    s.particles = [];
    s.shakeDur = 0;
    initRoad();
    if (s.cb) s.cb('playing', 0, s.best, 0);
  }, [initRoad]);

  const endGame = useCallback(() => {
    const s = S.current;
    const canvas = canvasRef.current;
    s.state = 'gameover';
    if (s.score > s.best) {
      s.best = s.score;
      localStorage.setItem('trBest', String(s.best));
    }
    s.shakeDur = 400;
    const W = canvas ? canvas.width : 800;
    const H = canvas ? canvas.height : 600;
    for (let i = 0; i < 30; i++) {
      s.particles.push({
        x: W / 2 + (Math.random() - 0.5) * 60,
        y: H - 120 + (Math.random() - 0.5) * 40,
        vx: (Math.random() - 0.5) * 8,
        vy: -Math.random() * 6 - 2,
        life: 1,
        col: ['#ff3355', '#ff8800', '#ffe600', '#00f0ff'][Math.floor(Math.random() * 4)],
        sz: 3 + Math.random() * 5,
      });
    }
    if (s.cb) s.cb('gameover', s.score, s.best, 0);
  }, []);

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
      if (s.keys.u) s.speed = Math.min(s.speed + s.accel * dt * 60, s.maxSpd);
      else if (s.keys.d) s.speed = Math.max(s.speed - s.brake * dt * 60, 0);
      else s.speed = Math.max(s.speed - s.decel * dt * 60, 0);

      // auto-accel
      if (!s.keys.u && !s.keys.d && s.speed < s.maxSpd * 0.4)
        s.speed = Math.min(s.speed + s.accel * 0.3 * dt * 60, s.maxSpd * 0.4);

      s.steer = 0;
      if (s.keys.l) s.steer = -1;
      if (s.keys.r) s.steer = 1;

      const segI = Math.floor(s.pos / SEG_LEN) % s.segs.length;
      const seg = s.segs[segI];

      const sp = s.speed / s.maxSpd;
      s.px += s.steer * sp * 5000 * dt;
      s.px -= seg.curve * sp * s.speed * 0.008 * dt * 60;

      if (Math.abs(s.px) > ROAD_W / 2) {
        s.speed = Math.max(s.speed - s.offSpd * dt * 60, 0);
        s.px = Math.max(-ROAD_W * 0.8, Math.min(ROAD_W * 0.8, s.px));
      }

      s.pos += s.speed * dt * 60;
      if (s.pos >= s.tLen) s.pos -= s.tLen;

      s.score += Math.floor(s.speed * dt * 0.1);

      // collision
      const psi = Math.floor(s.pos / SEG_LEN) % s.segs.length;
      for (let k = -1; k <= 2; k++) {
        const ci = (psi + k + s.segs.length) % s.segs.length;
        const cs = s.segs[ci];
        for (const o of cs.obstacles) {
          const oz = cs.idx * SEG_LEN;
          const relZ = Math.abs(((s.pos - oz) + s.tLen / 2) % s.tLen - s.tLen / 2);
          if (relZ < SEG_LEN * 0.8) {
            const dx = Math.abs(s.px - o.x);
            if (dx < 350 && !o.passed) {
              endGame();
              break;
            }
          } else if (relZ > SEG_LEN) {
            o.passed = true;
          }
        }
      }

      if (s.cb) s.cb('playing', s.score, s.best, Math.floor(sp * 280));
    }

    // particles
    s.particles = s.particles.filter(p => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life -= 0.02;
      return p.life > 0;
    });

    // shake
    if (s.shakeDur > 0) {
      s.shakeX = (Math.random() - 0.5) * 10;
      s.shakeY = (Math.random() - 0.5) * 10;
      s.shakeDur -= dt * 1000;
    } else { s.shakeX = 0; s.shakeY = 0; }

    // ---- RENDER ----
    ctx.save();
    ctx.translate(s.shakeX, s.shakeY);

    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.5);
    sky.addColorStop(0, COL.SKY_T);
    sky.addColorStop(1, COL.SKY_B);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // stars
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 80; i++) {
      dot(ctx, (i * 137.5) % W, (i * 97.3) % (H * 0.35), 0.5 + (i % 3) * 0.5);
    }

    // mountains
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

    let curveX = 0;
    let curveDx = 0;
    let clipY = H;

    // collect segments to draw (back to front = reverse order)
    const toDraw = [];
    for (let n = 0; n < DRAW_DIST; n++) {
      const i = (baseSeg + n) % s.segs.length;
      const sg = s.segs[i];
      const loZ = n * SEG_LEN - (s.pos % SEG_LEN);
      const hiZ = loZ + SEG_LEN;

      // create fresh projection points (don't mutate originals)
      const p1 = { world: { x: curveX, y: sg.p1.world.y, z: loZ }, screen: {}, camera: {}, scale: 0 };
      const p2 = { world: { x: curveX + curveDx, y: sg.p2.world.y, z: hiZ }, screen: {}, camera: {}, scale: 0 };

      project3d(p1, s.px, playerY + CAM_H, 0, W, H);
      project3d(p2, s.px, playerY + CAM_H, 0, W, H);

      curveX += curveDx;
      curveDx += sg.curve;

      if (p1.camera.z <= 0 && p2.camera.z <= 0) continue;
      if (p2.screen.y >= clipY) continue;

      toDraw.push({ i, sg, p1, p2, alt: Math.floor(i / 3) % 2 === 0 });
    }

    // draw back-to-front
    for (let d = toDraw.length - 1; d >= 0; d--) {
      const { sg, p1, p2, alt } = toDraw[d];

      if (p1.screen.y > clipY || p2.screen.y > clipY) {
        // partial clip
      }

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
      // lane markings
      if (alt) {
        const lw1 = p1.screen.w * 0.01;
        const lw2 = p2.screen.w * 0.01;
        for (let ln = 1; ln < LANES; ln++) {
          const lx1 = p1.screen.x - p1.screen.w + (p1.screen.w * 2 * ln) / LANES;
          const lx2 = p2.screen.x - p2.screen.w + (p2.screen.w * 2 * ln) / LANES;
          trapezoid(ctx, lx1, p1.screen.y, lw1, lx2, p2.screen.y, lw2, COL.LANE_M);
        }
      }

      // trees
      if (sg.tree && p1.scale > 0.001) {
        const tx = p1.screen.x + sg.treeSide * p1.screen.w * sg.treeOff;
        const ty = p1.screen.y;
        const ts = p1.scale * 1200;
        if (ty < clipY && ts > 2) {
          ctx.fillStyle = COL.TREE_TRUNK;
          ctx.fillRect(tx - ts * 0.08, ty - ts * 0.6, ts * 0.16, ts * 0.6);
          ctx.fillStyle = COL.TREE_TOP;
          ctx.beginPath();
          ctx.moveTo(tx, ty - ts * 1.4);
          ctx.lineTo(tx - ts * 0.4, ty - ts * 0.5);
          ctx.lineTo(tx + ts * 0.4, ty - ts * 0.5);
          ctx.closePath(); ctx.fill();
          ctx.beginPath();
          ctx.moveTo(tx, ty - ts * 1.1);
          ctx.lineTo(tx - ts * 0.5, ty - ts * 0.3);
          ctx.lineTo(tx + ts * 0.5, ty - ts * 0.3);
          ctx.closePath(); ctx.fill();
        }
      }

      // obstacles
      for (const o of sg.obstacles) {
        if (p1.scale > 0.001) {
          const ox = p1.screen.x + (o.x * p1.scale * W) / 2;
          const oy = p1.screen.y;
          const cw = p1.scale * 800;
          const ch = p1.scale * 600;
          if (cw > 3 && oy < clipY) {
            const c = COL.CARS[o.ci];
            drawCar(ctx, ox, oy, cw, ch, c.b, c.a, '#1a1a3a');
          }
        }
      }

      if (p2.screen.y < clipY) clipY = p2.screen.y;
    }

    // player car
    if (s.state !== 'start') {
      const pw = 70, ph = 90;
      ctx.save();
      ctx.translate(W / 2, H - 90);
      ctx.rotate(s.steer * -0.05);
      drawCar(ctx, 0, 0, pw, ph, COL.P_BODY, COL.P_ACC, COL.P_WIN);
      ctx.restore();

      // speed lines
      if (s.speed > s.maxSpd * 0.6) {
        const a = (s.speed / s.maxSpd - 0.6) * 2;
        ctx.strokeStyle = `rgba(0,240,255,${a * 0.3})`;
        ctx.lineWidth = 2;
        for (let sl = 0; sl < 5; sl++) {
          const lx = W / 2 + (Math.random() - 0.5) * 120;
          const ly = H - 70 + Math.random() * 40;
          ctx.beginPath();
          ctx.moveTo(lx, ly);
          ctx.lineTo(lx + (Math.random() - 0.5) * 5, ly + 20 + Math.random() * 20);
          ctx.stroke();
        }
      }
    }

    // particles
    for (const p of s.particles) {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.col;
      dot(ctx, p.x, p.y, p.sz * p.life);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    s.af = requestAnimationFrame(loop);
  }, [endGame]);

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
    };
    const ku = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') s.keys.l = false;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') s.keys.r = false;
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') s.keys.u = false;
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') s.keys.d = false;
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);

    // touch
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
    s.af = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(s.af);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }, [loop, initRoad]);

  return { canvasRef, setup, startGame, stateRef: S };
}

export default useGameEngine;

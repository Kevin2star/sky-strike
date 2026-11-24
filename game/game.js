'use strict';
(() => {
const W = 480, H = 720;
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
const $ = id => document.getElementById(id);

// ---------- 설정 ----------
const BIG_LIVES = 3, SMALL_LIVES = 5, MAX_POWER = 5;
const STAGES = [
  { dur: 38, spawn: 1.1,  hpMul: 1.0,  spd: 1.0,  fire: 1.0, weights: [75, 25, 0],  bossHp: 220, name: 'STAGE 1' },
  { dur: 45, spawn: 0.9,  hpMul: 1.35, spd: 1.12, fire: 1.3, weights: [50, 35, 15], bossHp: 380, name: 'STAGE 2' },
  { dur: 50, spawn: 0.75, hpMul: 1.7,  spd: 1.25, fire: 1.6, weights: [35, 40, 25], bossHp: 520, name: 'STAGE 3' },
];
const ENEMY = {
  small:  { r: 14, hp: 2,  score: 100, dmg: 1, vy: 110, fire: 3.2, drop: 0.04, color: '#ff6b6b' },
  medium: { r: 22, hp: 8,  score: 300, dmg: 2, vy: 70,  fire: 2.4, drop: 0.10, color: '#ffa94d' },
  large:  { r: 34, hp: 24, score: 800, dmg: 3, vy: 45,  fire: 2.6, drop: 0.25, color: '#b36bff' },
};
const BOSS_NAMES = ['IRON HAWK', 'CRIMSON WYVERN', 'OMEGA DREADNOUGHT'];
const BOSS_COLORS = [['#6fa8ff', '#ff7b5c', '#ff3b3b'], ['#59d98e', '#ffb347', '#ff4d6d'], ['#b36bff', '#ff5ccf', '#ff2a2a']];

// ---------- 상태 ----------
let state = 'title';          // title | play | over | clear
let paused = false;
let keys = {};
let player, pBullets, eBullets, enemies, items, parts, boss;
let stageIdx, st, score, shake = 0, endTimer = 0;
const stars = Array.from({ length: 70 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: 0.5 + Math.random() * 2 }));

const rand = (a, b) => a + Math.random() * (b - a);
const dist = (a, b, c, d) => Math.hypot(a - c, b - d);

function newGame() {
  score = 0; stageIdx = 0;
  player = { x: W / 2, y: H - 90, big: BIG_LIVES, small: SMALL_LIVES, power: 1, alive: true, invuln: 2, respawn: 0, cd: 0, speed: 300 };
  pBullets = []; eBullets = []; enemies = []; items = []; parts = []; boss = null;
  endTimer = 0; paused = false;
  startStage(0);
  state = 'play';
  ['title', 'over', 'clear'].forEach(i => $(i).classList.add('hidden'));
}
function startStage(i) {
  stageIdx = i;
  st = { phase: 'intro', t: 0, spawnT: 1 };
  enemies = []; eBullets = []; boss = null;
}

// ---------- 입력 ----------
addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  keys[e.key] = true;
  if (e.key === 'Enter' && state !== 'play') newGame();
  if ((e.key === 'p' || e.key === 'P') && state === 'play') paused = !paused;
});
addEventListener('keyup', e => { keys[e.key] = false; });
addEventListener('blur', () => { keys = {}; });
['startBtn', 'retryBtn', 'againBtn'].forEach(id => $(id).addEventListener('click', newGame));

// ---------- 생성 헬퍼 ----------
function ebullet(x, y, ang, speed, dmg = 1, r = 5, color = '#ff5c8a') {
  const m = STAGES[stageIdx].spd;
  eBullets.push({ x, y, vx: Math.cos(ang) * speed * m, vy: Math.sin(ang) * speed * m, dmg, r, color });
}
const aimAng = (x, y) => Math.atan2(player.y - y, player.x - x);
function fan(x, y, n, spread, speed, dmg, r, color, base) {
  const a0 = base ?? aimAng(x, y);
  for (let i = 0; i < n; i++) ebullet(x, y, a0 + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread), speed, dmg, r, color);
}
function ring(x, y, n, speed, off = 0, dmg = 1) {
  for (let i = 0; i < n; i++) ebullet(x, y, off + i / n * Math.PI * 2, speed, dmg, 5, '#ffd34d');
}
function boom(x, y, n, color, power = 1) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, 6.28), s = rand(40, 220) * power;
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.4, 0.9), max: 0.9, color: Math.random() < 0.5 ? color : '#ffe27a', size: rand(2, 5) });
  }
}

function spawnEnemy() {
  const S = STAGES[stageIdx];
  const w = S.weights.slice();
  if (st.t < 12) w[2] = 0;
  const sum = w[0] + w[1] + w[2];
  let r = Math.random() * sum, k = 'small';
  if (r >= w[0]) k = r < w[0] + w[1] ? 'medium' : 'large';
  const d = ENEMY[k];
  const make = (x, y, delay = 0) => enemies.push({
    kind: k, x, y, r: d.r, hp: Math.ceil(d.hp * S.hpMul), max: Math.ceil(d.hp * S.hpMul),
    t: 0, x0: x, ph: rand(0, 6), fireT: rand(0.6, 1.6) + delay, flash: 0,
  });
  const x = rand(50, W - 50);
  make(x, -40);
  if (k === 'small' && Math.random() < 0.4) { make(Math.max(30, x - 50), -80, 0.3); make(Math.min(W - 30, x + 50), -80, 0.3); }
}

function dropItem(x, y, chance) {
  if (Math.random() >= chance) return;
  const r = Math.random();
  const type = r < 0.01 ? 'life' : (r < 0.55 ? 'heal' : 'power');
  items.push({ x, y, type });
}

// ---------- 보스 ----------
function spawnBoss() {
  const S = STAGES[stageIdx];
  boss = {
    stage: stageIdx, x: W / 2, y: -100, w: 70 + stageIdx * 8, h: 40 + stageIdx * 4,
    max: S.bossHp, hp: S.bossHp, shown: S.bossHp, phase: 1, final: stageIdx === 2,
    t: 0, entered: false, trans: 0, tm: {}, ang: 0, flash: 0, dead: false,
  };
}
function cd(b, k, interval, dt) {
  b.tm[k] = (b.tm[k] ?? 0) - dt;
  if (b.tm[k] <= 0) { b.tm[k] += interval; return true; }
  return false;
}
function bossAttack(b, dt) {
  const { x, y } = b, p = b.phase;
  const cannons = () => { ebullet(x - 40, y + 20, Math.PI / 2, 210); ebullet(x + 40, y + 20, Math.PI / 2, 210); };
  const spiral = (arms, step, speed) => {
    b.ang += step;
    for (let i = 0; i < arms; i++) ebullet(x, y + 10, b.ang + i * Math.PI * 2 / arms, speed, 1, 5, '#ff8fb3');
  };
  if (b.stage === 0) {
    if (p === 1) {
      if (cd(b, 'a', 1.4, dt)) fan(x, y + 20, 3, 0.5, 170, 1, 6, '#ff5c8a');
      if (cd(b, 'b', 0.9, dt)) cannons();
    } else {
      if (cd(b, 'a', 0.95, dt)) fan(x, y + 20, 5, 0.9, 200, 1, 6, '#ff5c8a');
      if (cd(b, 'b', 0.7, dt)) cannons();
      if (cd(b, 'c', 2.6, dt)) ring(x, y, 14, 130, rand(0, 6));
    }
  } else if (b.stage === 1) {
    if (p === 1) {
      if (cd(b, 'a', 0.13, dt)) spiral(1, 0.38, 150);
      if (cd(b, 'b', 1.8, dt)) fan(x, y + 20, 3, 0.4, 210, 1, 6, '#ff5c8a');
    } else {
      if (cd(b, 'a', 0.11, dt)) spiral(2, 0.33, 170);
      if (cd(b, 'b', 1.3, dt)) fan(x, y + 20, 5, 0.8, 220, 1, 6, '#ff5c8a');
      if (cd(b, 'c', 3, dt)) ring(x, y, 18, 140, rand(0, 6));
    }
  } else {
    if (p === 1) {
      if (cd(b, 'a', 0.16, dt)) spiral(2, 0.3, 160);
      if (cd(b, 'b', 1.5, dt)) fan(x, y + 20, 5, 0.7, 210, 1, 6, '#ff5c8a');
    } else if (p === 2) {
      if (cd(b, 'a', 0.12, dt)) spiral(3, -0.27, 170);
      if (cd(b, 'b', 1.2, dt)) fan(x, y + 20, 7, 1.1, 220, 1, 6, '#ff5c8a');
      if (cd(b, 'c', 3, dt)) ring(x, y, 20, 140, rand(0, 6));
    } else {
      if (cd(b, 'a', 0.14, dt)) spiral(3, 0.31, 170);
      if (cd(b, 'b', 0.9, dt)) fan(x, y + 20, 5, 0.6, 250, 2, 8, '#ff3b3b');
      if (cd(b, 'c', 0.28, dt)) ebullet(rand(10, W - 10), 0, Math.PI / 2, 200);
      if (cd(b, 'd', 2.6, dt)) ring(x, y, 22, 150, rand(0, 6));
    }
  }
}
function damageBoss(d) {
  const b = boss;
  b.hp -= d; b.flash = 0.06; score += 5;
  if (b.phase === 1 && b.hp <= b.max * 0.5) startTrans(2);
  else if (b.phase === 2 && b.hp <= 0) {
    if (b.final) { b.hp = b.max; startTrans(3); } else killBoss();
  } else if (b.phase === 3 && b.hp <= 0) killBoss();
}
function startTrans(ph) {
  boss.phase = ph; boss.trans = 2.2; boss.tm = {}; eBullets = []; shake = 0.6;
  boom(boss.x, boss.y, 60, BOSS_COLORS[boss.stage][ph - 1], 1.6);
}
function killBoss() {
  boss.dead = true; boss.hp = 0; eBullets = []; st.phase = 'bossdead'; st.t = 0; shake = 1;
  score += 5000 * (stageIdx + 1);
  for (let i = 0; i < 6; i++) boom(boss.x + rand(-50, 50), boss.y + rand(-25, 25), 40, '#ff9d3c', 1.8);
  items.push({ x: boss.x - 30, y: boss.y, type: 'heal' }, { x: boss.x + 30, y: boss.y, type: 'power' });
}

// ---------- 플레이어 ----------
function hurt(d) {
  if (!player.alive || player.invuln > 0) return;
  player.small -= d; player.invuln = 1.0; shake = 0.25;
  if (player.small <= 0) {
    player.alive = false; player.big--; player.small = 0;
    player.power = Math.max(1, player.power - 1);
    boom(player.x, player.y, 70, '#6fd3ff', 1.5); shake = 0.7;
    if (player.big > 0) player.respawn = 1.8; else endTimer = 2;
  }
}
function fire() {
  const n = player.power;
  for (let i = 0; i < n; i++) {
    const o = i - (n - 1) / 2;
    pBullets.push({ x: player.x + o * 8, y: player.y - 18, vx: o * 28, vy: -640, dmg: 1 });
  }
}
function gameOver() {
  state = 'over';
  $('overScore').textContent = `SCORE ${score}  ·  ${STAGES[stageIdx].name} 도달`;
  $('over').classList.remove('hidden');
}
function gameClear() {
  state = 'clear';
  $('clearScore').textContent = `FINAL SCORE ${score}`;
  $('clear').classList.remove('hidden');
}

// ---------- 업데이트 ----------
function update(dt) {
  stars.forEach(s => { s.y += s.s * 60 * dt; if (s.y > H) { s.y = 0; s.x = Math.random() * W; } });
  if (state !== 'play' || paused) return;
  const S = STAGES[stageIdx];
  shake = Math.max(0, shake - dt);

  // 스테이지 진행
  st.t += dt;
  if (st.phase === 'intro' && st.t > 2.5) { st.phase = 'wave'; st.t = 0; }
  else if (st.phase === 'wave') {
    st.spawnT -= dt;
    if (st.spawnT <= 0) { spawnEnemy(); st.spawnT = S.spawn * rand(0.8, 1.2); }
    if (st.t > S.dur) { st.phase = 'warn'; st.t = 0; }
  } else if (st.phase === 'warn' && st.t > 3) { st.phase = 'boss'; st.t = 0; spawnBoss(); }
  else if (st.phase === 'bossdead' && st.t > 3.5) {
    if (stageIdx === 2) { if (state === 'play') gameClear(); return; }
    startStage(stageIdx + 1);
  }

  // 플레이어
  const p = player;
  if (p.alive) {
    const dx = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);
    const dy = (keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0);
    const len = Math.hypot(dx, dy) || 1;
    p.x = Math.min(W - 16, Math.max(16, p.x + dx / len * p.speed * dt));
    p.y = Math.min(H - 20, Math.max(40, p.y + dy / len * p.speed * dt));
    p.invuln = Math.max(0, p.invuln - dt);
    p.cd -= dt;
    if (keys[' '] && p.cd <= 0) { fire(); p.cd = 0.13; }
  } else if (p.big > 0) {
    p.respawn -= dt;
    if (p.respawn <= 0) { p.alive = true; p.small = SMALL_LIVES; p.invuln = 2.5; p.x = W / 2; p.y = H - 90; }
  } else {
    endTimer -= dt;
    if (endTimer <= 0) { gameOver(); return; }
  }

  // 플레이어 총알
  pBullets.forEach(b => { b.x += b.vx * dt; b.y += b.vy * dt; });
  pBullets = pBullets.filter(b => b.y > -20 && b.x > -20 && b.x < W + 20);

  // 적
  enemies.forEach(e => {
    const d = ENEMY[e.kind];
    e.t += dt; e.flash = Math.max(0, e.flash - dt);
    if (e.kind === 'small') { e.y += d.vy * S.spd * dt; e.x = e.x0 + Math.sin(e.t * 2 + e.ph) * 50; }
    else if (e.kind === 'medium') { e.y += d.vy * S.spd * dt; e.x += Math.sin(e.t + e.ph) * 40 * dt; }
    else { e.y += d.vy * dt; e.x += Math.sin(e.t * 0.7 + e.ph) * 30 * dt; }
    e.x = Math.min(W - e.r, Math.max(e.r, e.x));
    e.fireT -= dt;
    if (e.fireT <= 0 && e.y > 0 && e.y < H - 200) {
      e.fireT = d.fire / S.fire * rand(0.8, 1.2);
      if (e.kind === 'small') ebullet(e.x, e.y + 10, aimAng(e.x, e.y), 160, d.dmg, 5, '#ff8a8a');
      else if (e.kind === 'medium') fan(e.x, e.y + 14, 2, 0.25, 180, d.dmg, 7, '#ffb55c');
      else fan(e.x, e.y + 20, 5, 1.0, 150, d.dmg, 9, '#c58bff', Math.PI / 2);
    }
  });
  enemies = enemies.filter(e => e.y < H + 60);

  // 보스
  if (boss && !boss.dead) {
    const b = boss;
    b.t += dt; b.flash = Math.max(0, b.flash - dt);
    if (!b.entered) { b.y += 80 * dt; if (b.y >= 110) { b.y = 110; b.entered = true; } }
    else {
      const amp = 120 + (b.phase - 1) * 30, sp = 0.6 + (b.phase - 1) * 0.25;
      b.x = W / 2 + Math.sin(b.t * sp) * amp;
      b.y = 110 + Math.sin(b.t * 0.9) * 12;
      if (b.trans > 0) b.trans -= dt;
      else bossAttack(b, dt);
    }
    b.shown += (b.hp - b.shown) * Math.min(1, dt * 4);
  }

  // 적 총알
  eBullets.forEach(b => { b.x += b.vx * dt; b.y += b.vy * dt; });
  eBullets = eBullets.filter(b => b.x > -30 && b.x < W + 30 && b.y > -30 && b.y < H + 30);

  // 충돌: 플레이어 총알 vs 적/보스
  for (const b of pBullets) {
    if (boss && !boss.dead && Math.abs(b.x - boss.x) < boss.w && Math.abs(b.y - boss.y) < boss.h) {
      b.dead = true;
      if (boss.entered && boss.trans <= 0) damageBoss(b.dmg);
      continue;
    }
    for (const e of enemies) {
      if (!e.dead && dist(b.x, b.y, e.x, e.y) < e.r + 4) { b.dead = true; e.hp -= b.dmg; e.flash = 0.06; break; }
    }
  }
  pBullets = pBullets.filter(b => !b.dead);
  enemies.forEach(e => {
    if (e.hp <= 0 && !e.dead) {
      e.dead = true; score += ENEMY[e.kind].score;
      boom(e.x, e.y, e.kind === 'large' ? 40 : e.kind === 'medium' ? 22 : 12, ENEMY[e.kind].color, e.kind === 'large' ? 1.3 : 1);
      dropItem(e.x, e.y, ENEMY[e.kind].drop);
    }
  });
  enemies = enemies.filter(e => !e.dead);

  // 충돌: 플레이어 vs 적 총알 / 적 / 보스
  if (p.alive) {
    for (const b of eBullets) if (dist(b.x, b.y, p.x, p.y) < b.r + 5 && p.invuln <= 0 && p.alive) { b.dead = true; hurt(b.dmg); }
    eBullets = eBullets.filter(b => !b.dead);
    for (const e of enemies) if (p.alive && p.invuln <= 0 && dist(e.x, e.y, p.x, p.y) < e.r + 8) { hurt(ENEMY[e.kind].dmg); e.hp -= 3; e.flash = 0.1; }
    if (boss && !boss.dead && p.alive && p.invuln <= 0 && Math.abs(p.x - boss.x) < boss.w && Math.abs(p.y - boss.y) < boss.h) hurt(2);
  }

  // 아이템
  items.forEach(it => {
    it.y += 70 * dt;
    if (p.alive && dist(it.x, it.y, p.x, p.y) < 24) {
      it.dead = true; score += 200;
      if (it.type === 'heal') p.small = Math.min(SMALL_LIVES, p.small + 1);
      else if (it.type === 'power') p.power = Math.min(MAX_POWER, p.power + 1);
      else p.big = Math.min(BIG_LIVES, p.big + 1);
      boom(it.x, it.y, 10, '#ffffff', 0.6);
    }
  });
  items = items.filter(i => !i.dead && i.y < H + 20);

  // 파티클
  parts.forEach(q => { q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt; });
  parts = parts.filter(q => q.life > 0);
}

// ---------- 그리기 ----------
function poly(pts, fill, stroke) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
}
function drawPlayer() {
  const p = player;
  if (!p.alive) return;
  if (p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0) return;
  ctx.save(); ctx.translate(p.x, p.y);
  const fl = 8 + Math.random() * 6;
  poly([[-4, 14], [0, 14 + fl], [4, 14]], '#ffb347');
  poly([[0, -22], [6, -4], [22, 14], [22, 20], [6, 12], [4, 20], [-4, 20], [-6, 12], [-22, 20], [-22, 14], [-6, -4]], '#6fd3ff', '#e8f6ff');
  poly([[0, -12], [3, 0], [-3, 0]], '#12345f');
  ctx.restore();
}
function drawEnemy(e) {
  const c = e.flash > 0 ? '#fff' : ENEMY[e.kind].color, r = e.r;
  ctx.save(); ctx.translate(e.x, e.y);
  if (e.kind === 'small') poly([[0, r], [r, -r * 0.6], [0, -r * 0.2], [-r, -r * 0.6]], c, '#400');
  else if (e.kind === 'medium') {
    poly([[0, r], [r, 0], [r * 0.6, -r], [-r * 0.6, -r], [-r, 0]], c, '#420');
    poly([[-6, -4], [6, -4], [0, 8]], '#2a1500');
  } else {
    poly([[0, r], [r, r * 0.2], [r * 0.8, -r * 0.8], [r * 0.3, -r * 0.5], [-r * 0.3, -r * 0.5], [-r * 0.8, -r * 0.8], [-r, r * 0.2]], c, '#204');
    ctx.fillStyle = '#ff5c5c'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, 6.3); ctx.fill();
  }
  if (e.hp < e.max) { ctx.fillStyle = '#300'; ctx.fillRect(-r, -r - 8, r * 2, 3); ctx.fillStyle = '#5fe08a'; ctx.fillRect(-r, -r - 8, r * 2 * e.hp / e.max, 3); }
  ctx.restore();
}
function drawBoss() {
  const b = boss; if (!b || b.dead) return;
  const col = b.flash > 0 ? '#fff' : BOSS_COLORS[b.stage][b.phase - 1];
  ctx.save(); ctx.translate(b.x, b.y);
  if (b.trans > 0 && Math.floor(b.trans * 14) % 2 === 0) ctx.globalAlpha = 0.5;
  const ph = b.phase, w = b.w, h = b.h, wing = 1 + (ph - 1) * 0.35;
  // 날개
  poly([[-w * 0.4, -h * 0.5], [-w * wing - 10, -h * 0.2], [-w * wing, h * 0.9], [-w * 0.4, h * 0.4]], col, '#111');
  poly([[w * 0.4, -h * 0.5], [w * wing + 10, -h * 0.2], [w * wing, h * 0.9], [w * 0.4, h * 0.4]], col, '#111');
  // 몸통
  poly([[0, h + 12], [w * 0.5, h * 0.4], [w * 0.4, -h], [-w * 0.4, -h], [-w * 0.5, h * 0.4]], '#232a45', col);
  // 페이즈별 가시
  for (let i = 0; i < ph + 1; i++) {
    const x = (i - ph / 2) * 22;
    poly([[x - 6, -h], [x, -h - 10 - ph * 5], [x + 6, -h]], col);
  }
  // 포신 & 눈
  ctx.fillStyle = '#111'; ctx.fillRect(-42, h * 0.3, 8, 18); ctx.fillRect(34, h * 0.3, 8, 18);
  ctx.fillStyle = ph === 1 ? '#ffe27a' : ph === 2 ? '#ff9d3c' : '#ff2a2a';
  ctx.beginPath(); ctx.arc(0, 0, 9 + ph * 2, 0, 6.3); ctx.fill();
  ctx.restore();
}
function drawHUD() {
  ctx.textAlign = 'left'; ctx.fillStyle = '#e8eefc'; ctx.font = 'bold 16px sans-serif';
  ctx.fillText(`SCORE ${score}`, 12, 24);
  ctx.textAlign = 'right'; ctx.fillText(STAGES[stageIdx].name, W - 12, 24);
  // 라이프
  for (let i = 0; i < BIG_LIVES; i++) {
    ctx.font = '22px sans-serif'; ctx.textAlign = 'left';
    ctx.fillStyle = i < player.big ? '#ff4d6d' : '#3a2a35';
    ctx.fillText('♥', 12 + i * 26, H - 40);
  }
  for (let i = 0; i < SMALL_LIVES; i++) {
    ctx.fillStyle = player.alive && i < player.small ? '#5fe08a' : '#24352c';
    ctx.fillRect(12 + i * 18, H - 28, 14, 10);
  }
  ctx.fillStyle = '#ffae42'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'right';
  ctx.fillText(`POWER Lv.${player.power}${player.power >= MAX_POWER ? ' MAX' : ''}`, W - 12, H - 20);
  // 보스 체력바
  if (boss && !boss.dead) {
    const x = 60, y = 38, w = W - 120, h = 14, b = boss;
    ctx.fillStyle = '#111'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = '#4a1a1a'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = BOSS_COLORS[b.stage][b.phase - 1];
    ctx.fillRect(x, y, w * Math.max(0, b.shown) / b.max, h);
    if (b.phase === 1) { ctx.fillStyle = '#fff'; ctx.fillRect(x + w / 2 - 1, y - 3, 2, h + 6); }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`${BOSS_NAMES[b.stage]}  ·  PHASE ${b.phase}${b.final ? '/3' : '/2'}`, W / 2, y - 6);
  }
}
function banner(text, sub, color) {
  ctx.textAlign = 'center';
  ctx.fillStyle = color; ctx.font = 'bold 44px sans-serif'; ctx.fillText(text, W / 2, H / 2 - 20);
  if (sub) { ctx.fillStyle = '#e8eefc'; ctx.font = '18px sans-serif'; ctx.fillText(sub, W / 2, H / 2 + 14); }
}
function draw() {
  ctx.save();
  if (shake > 0 && state === 'play') ctx.translate(rand(-5, 5) * Math.min(1, shake * 2), rand(-5, 5) * Math.min(1, shake * 2));
  ctx.fillStyle = '#05060f'; ctx.fillRect(-10, -10, W + 20, H + 20);
  stars.forEach(s => { ctx.fillStyle = `rgba(200,220,255,${0.25 + s.s / 3})`; ctx.fillRect(s.x, s.y, s.s, s.s * 2); });
  if (state === 'title') { ctx.restore(); return; }

  items.forEach(it => {
    const c = it.type === 'heal' ? '#5fe08a' : it.type === 'power' ? '#ffae42' : '#ff4d6d';
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(it.x, it.y, 12, 0, 6.3); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(it.type === 'heal' ? '+' : it.type === 'power' ? 'P' : '♥', it.x, it.y + 5);
  });
  enemies.forEach(drawEnemy);
  drawBoss();
  drawPlayer();
  ctx.fillStyle = '#9be7ff';
  pBullets.forEach(b => ctx.fillRect(b.x - 2, b.y - 8, 4, 14));
  eBullets.forEach(b => {
    ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.4, 0, 6.3); ctx.fill();
  });
  parts.forEach(q => { ctx.globalAlpha = Math.max(0, q.life / q.max); ctx.fillStyle = q.color; ctx.fillRect(q.x, q.y, q.size, q.size); });
  ctx.globalAlpha = 1;
  ctx.restore();

  drawHUD();
  if (state === 'play') {
    if (st.phase === 'intro') banner(STAGES[stageIdx].name, 'GET READY', '#6fd3ff');
    else if (st.phase === 'warn') { if (Math.floor(st.t * 3) % 2 === 0) banner('WARNING', '보스가 접근 중!', '#ff4d4d'); }
    else if (st.phase === 'bossdead' && st.t > 1) banner(stageIdx === 2 ? 'VICTORY!' : 'STAGE CLEAR', null, '#ffd34d');
    if (!player.alive && player.big > 0) { ctx.textAlign = 'center'; ctx.fillStyle = '#ff9d9d'; ctx.font = 'bold 20px sans-serif'; ctx.fillText('RESPAWNING...', W / 2, H / 2 + 80); }
    if (paused) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H); banner('PAUSED', 'P 키로 계속', '#fff'); }
  }
}

// ---------- 루프 ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  update(dt); draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
})();

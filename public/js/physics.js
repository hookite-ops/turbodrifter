// 카트 주행 물리 — 드리프트/게이지/부스터/순간 부스터/출발 부스터
// 순수 계산 모듈(화면 코드 없음). 플레이어와 AI가 같은 물리를 쓴다.
import { locate } from './tracks.js';

export const KMH = 6.6;            // 표시 속도 = m/s × KMH
export const C = {
  maxSpeed: 30,                    // 일반 최고 속도 (약 198km/h)
  boostSpeed: 41,                  // 부스터 최고 속도 (약 270km/h)
  instSpeed: 35.5,                 // 순간 부스터 최고 속도
  accel: 15, boostAccel: 34, instAccel: 44,
  coast: 5, brake: 30, reverse: 9,
  gripYaw: 1.55, gripYawTop: 0.72, // 일반 조향 (rad/s): 저속 / 최고 속도
  driftYawHeld: 3.3,               // 드리프트 키를 누르는 동안 차체가 도는 속도
  driftYawFree: 2.7,               // 키를 뗀 뒤 방향키로 도는 속도 (끌기/커팅)
  followHeld: 2.3, followFree: 3.4, followGrip: 11,
  maxSlip: 1.02,                   // 최대 드리프트 각 (약 58도)
  driftDrag: 0.46,
  driftMinSpeed: 11,
  gaugeRate: 0.6,
  boostTime: 3.0, instTime: 0.62, instWindow: 0.5, startBoostTime: 1.6,
  radius: 1.15,
};

// 속도가 오를수록 핸들이 둔해진다 → 고속 코너는 드리프트로 돌아야 한다
export function gripYaw(v) {
  if (v <= 12) return C.gripYaw;
  if (v <= C.maxSpeed) return C.gripYaw + (C.gripYawTop - C.gripYaw) * (v - 12) / (C.maxSpeed - 12);
  return C.gripYawTop - 0.14 * clamp((v - C.maxSpeed) / 11, 0, 1);
}
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

export function createKart() {
  return {
    x: 0, z: 0, y: 0, h: 0, mv: 0, speed: 0,
    steer: 0, yawVel: 0,
    drifting: false, driftDir: 0, driftT: 0, slip: 0,
    gauge: 0, boosts: 0, boostT: 0, instT: 0, instWin: 0,
    ti: 0, lat: 0, s: 0, lap: -1, prog: 0, wrongT: 0,
    hitT: 0, padT: 0, airT: 0,
    finished: false, finishTime: 0,
    ev: {},   // 이번 프레임에 일어난 일 (효과음·이펙트용)
    _loc: {},
  };
}

export function placeKart(k, T, p) {
  k.x = p.x; k.z = p.z; k.y = p.y; k.h = p.h; k.mv = p.h; k.speed = 0;
  k.ti = p.i; k.drifting = false; k.steer = 0; k.slip = 0;
  const L = locate(T, k.x, k.z, k.ti, 30, k._loc);
  k.ti = L.i; k.s = L.s; k.lat = L.lat;
}

const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
// inp: {steer(-1..1, +왼쪽), accel, brake, drift, driftTap, boostTap, accelTap}
// rule: {infinite}
export function stepKart(k, inp, dt, T, rule) {
  const ev = k.ev = {};
  const inf = rule && rule.infinite;

  // 조향 입력을 부드럽게
  const target = clamp(inp.steer || 0, -1, 1);
  const sr = (Math.abs(target) < Math.abs(k.steer) || target * k.steer < 0) ? 9 : 6;
  k.steer += clamp(target - k.steer, -sr * dt, sr * dt);

  const boosting = k.boostT > 0, inst = k.instT > 0;
  const fwd = k.speed >= 0 ? 1 : -1;

  // --- 부스터 사용 / 순간 부스터 ---
  if (k.instWin > 0) {
    k.instWin -= dt;
    if (inp.accelTap || inp.boostTap) {
      k.instT = C.instTime; k.instWin = 0; ev.inst = true; inp = { ...inp, boostTap: false };
    }
  }
  if (inp.boostTap && k.boosts > 0 && k.boostT <= 0.15) {
    k.boosts--; k.boostT = C.boostTime; ev.boost = true;
  }
  if (k.boostT > 0) k.boostT -= dt;
  if (k.instT > 0) k.instT -= dt;

  // --- 드리프트 시작 ---
  const canDrift = k.speed > C.driftMinSpeed;
  if (!k.drifting && canDrift && Math.abs(target) > 0.25 && (inp.driftTap || (inp.drift && k.driftT <= 0))) {
    k.drifting = true; k.driftDir = target > 0 ? 1 : -1; k.driftT = 0; ev.driftStart = true;
  }
  if (!k.drifting && k.driftT > 0) k.driftT -= dt; // 재시작 대기

  // --- 차체 회전 ---
  let yaw;
  const sf = clamp(Math.abs(k.speed) / 7, 0, 1);
  if (k.drifting) {
    k.driftT += dt;
    if (inp.drift) yaw = k.driftDir * C.driftYawHeld * (0.55 + 0.45 * Math.abs(k.steer)) + k.steer * 0.6;
    else yaw = k.steer * C.driftYawFree;
  } else {
    yaw = k.steer * gripYaw(Math.abs(k.speed)) * sf * fwd;
  }
  k.yawVel = yaw;
  k.h += yaw * dt;

  // --- 진행 방향이 차체 방향을 따라감 ---
  let slip = wrap(k.h - k.mv);
  if (k.speed < 0) { k.mv = k.h; slip = 0; }
  else if (k.drifting) {
    if (Math.abs(slip) > C.maxSlip) { k.h = k.mv + Math.sign(slip) * C.maxSlip; slip = Math.sign(slip) * C.maxSlip; }
    const f = inp.drift ? C.followHeld : C.followFree;
    k.mv += slip * Math.min(1, f * dt);
  } else {
    k.mv += slip * Math.min(1, C.followGrip * dt);
  }
  slip = wrap(k.h - k.mv);
  k.slip = slip;

  // --- 속도 ---
  let vmax = C.maxSpeed, acc = C.accel;
  if (boosting) { vmax = C.boostSpeed; acc = C.boostAccel; }
  else if (inst) { vmax = C.instSpeed; acc = C.instAccel; }
  if (k.padT > 0) { k.padT -= dt; vmax = Math.max(vmax, C.boostSpeed); acc = Math.max(acc, C.boostAccel); }
  const slopeAcc = -(k._loc.slope || 0) * 9 * Math.cos(wrap(k.mv - Math.atan2(k._loc.tx || 0, k._loc.tz || 1)));
  const throttle = inp.accel || boosting || inst;
  if (inp.brake && !boosting) {
    if (k.speed > 0.5) k.speed -= C.brake * dt;
    else k.speed = Math.max(-C.reverse, k.speed - 12 * dt);
  } else if (throttle) {
    if (k.speed < 0) k.speed += C.brake * dt;
    else if (k.speed < vmax) k.speed += acc * Math.cos(slip) * (1 - 0.55 * (k.speed / vmax) ** 2) * dt;
    else k.speed -= Math.min(k.speed - vmax, 9 * dt); // 부스터가 끝나면 서서히 감속
  } else {
    const d = C.coast * dt;
    k.speed = Math.abs(k.speed) < d ? 0 : k.speed - Math.sign(k.speed) * d;
  }
  if (k.speed > 0) k.speed += slopeAcc * dt * 0.5;
  if (k.drifting) k.speed -= k.speed * C.driftDrag * Math.sin(slip) ** 2 * dt * (inp.drift ? 1.25 : 1);

  // --- 드리프트 게이지 ---
  if (k.drifting) {
    const g = C.gaugeRate * Math.min(1, Math.abs(slip) / 0.75) * clamp(k.speed / C.maxSpeed, 0, 1.2) * (inf ? 3.2 : 1);
    addGauge(k, g * dt, ev, inf);
    // 드리프트 끝: 키를 떼고 차체가 진행 방향과 다시 맞으면
    if ((!inp.drift && Math.abs(slip) < 0.11 && k.driftT > 0.18) || k.speed < 6) {
      k.drifting = false; ev.driftEnd = true;
      if (k.speed >= 6 && k.driftT > 0.3) { k.instWin = C.instWindow; ev.instReady = true; }
      k.driftT = 0.06;
    }
  } else if (inf && k.speed > 8) addGauge(k, 0.1 * dt, ev, inf);

  // --- 이동 ---
  k.x += Math.sin(k.mv) * k.speed * dt;
  k.z += Math.cos(k.mv) * k.speed * dt;

  // --- 트랙 위치·벽 충돌 ---
  const L = locate(T, k.x, k.z, k.ti, 14, k._loc);
  const prevS = k.s;
  k.ti = L.i; k.s = L.s; k.lat = L.lat;
  const lim = L.hw - C.radius;
  if (Math.abs(L.lat) > lim) {
    const side = Math.sign(L.lat);
    const over = Math.abs(L.lat) - lim;
    k.x -= L.nx * side * over; k.z -= L.nz * side * over; k.lat = side * lim;
    const vx = Math.sin(k.mv) * k.speed, vz = Math.cos(k.mv) * k.speed;
    const vn = (vx * L.nx + vz * L.nz) * side; // 벽 쪽으로 향하는 속도
    if (vn > 0) {
      const vt = vx * L.tx + vz * L.tz;
      const nvx = L.tx * vt - L.nx * side * vn * 0.25, nvz = L.tz * vt - L.nz * side * vn * 0.25;
      const ns = Math.hypot(nvx, nvz);
      const loss = clamp(vn / 22, 0.04, 0.55);
      k.mv = Math.atan2(nvx, nvz);
      if (k.speed < 0) { k.speed = -ns * (1 - loss); k.mv = k.h; }
      else k.speed = ns * (1 - loss);
      if (vn > 5) {
        ev.hit = vn; k.hitT = 0.25;
        if (k.drifting) { k.drifting = false; k.driftT = 0.25; ev.driftEnd = true; }
        k.h += wrap(k.mv - k.h) * 0.5;
      } else {
        ev.scrape = true;
        k.h += wrap(k.mv - k.h) * Math.min(1, 4 * dt);
      }
    }
  }
  if (k.hitT > 0) k.hitT -= dt;
  k.y = L.y;

  // --- 부스터 발판 ---
  for (const p of T.pads) {
    let di = k.ti - p.i; if (di < 0) di += T.n;
    if (di < p.len && Math.abs(k.lat) < 3.2 && k.speed > 3) {
      if (k.padT <= 0) ev.pad = true;
      k.padT = 1.1;
    }
  }

  // --- 바퀴 수·역주행 ---
  const half = T.length / 2;
  let ds = k.s - prevS;
  if (ds < -half) { k.lap++; ev.lap = k.lap; } else if (ds > half) { k.lap--; }
  k.prog = k.lap * T.length + k.s;
  const along = Math.sin(k.mv) * L.tx + Math.cos(k.mv) * L.tz;
  if (along < -0.35 && k.speed > 4) k.wrongT += dt; else k.wrongT = 0;
}

function addGauge(k, g, ev, inf) {
  if (k.boosts >= 2) { k.gauge = Math.min(1, k.gauge + g); return; }
  k.gauge += g;
  if (k.gauge >= 1) { k.gauge = k.boosts + 1 >= 2 ? 0 : k.gauge - 1; k.boosts++; ev.charged = true; }
}

// 출발 부스터: GO 직전·직후에 가속(또는 부스터 버튼)을 누르면 발동
export function startBoost(k) { k.boostT = C.startBoostTime; k.ev.boost = true; k.ev.start = true; }

// 카트끼리 밀어내기 (내 카트만 움직임)
export function pushApart(k, ox, oz, oy, ovx, ovz) {
  if (Math.abs((oy || 0) - k.y) > 3) return false;
  const dx = k.x - ox, dz = k.z - oz, d2 = dx * dx + dz * dz, R = C.radius * 2;
  if (d2 >= R * R || d2 < 1e-6) return false;
  const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, pen = R - d;
  k.x += nx * pen * 0.55; k.z += nz * pen * 0.55;
  const vx = Math.sin(k.mv) * k.speed, vz = Math.cos(k.mv) * k.speed;
  const rel = (vx - ovx) * nx + (vz - ovz) * nz;
  if (rel < 0) {
    const nvx = vx - nx * rel * 0.6, nvz = vz - nz * rel * 0.6;
    const ns = Math.hypot(nvx, nvz);
    if (k.speed >= 0) { k.mv = Math.atan2(nvx, nvz); k.speed = ns; }
    return -rel;
  }
  return 0.01;
}

// ---------- AI 드라이버 (연습전·트랙 검증용) ----------
export function createBot(skill = 0.8) {
  return { skill, lane: (Math.random() - 0.5) * 6, drift: false, wasDrift: false, instDelay: 0, boostWait: 0, stuckT: 0, revT: 0, t: Math.random() * 10 };
}
export function botInput(b, k, T, dt) {
  b.t += dt;
  const N = T.n;
  const look = 9 + k.speed * 0.62;
  const li = Math.floor((k.s + look) / T.ds) % N;
  const lane = clamp(b.lane + Math.sin(b.t * 0.3) * 1.5, -(T.hw[li] - 3), T.hw[li] - 3);
  // 코너 안쪽으로 붙기
  let cAhead = 0;
  for (let j = 0; j < 14; j++) cAhead += T.curv[(k.ti + 4 + j * 2) % N];
  cAhead /= 14;
  const apex = clamp(cAhead * 120, -1, 1) * (T.hw[li] - 3.5);
  const tl = clamp(lane * 0.4 + apex, -(T.hw[li] - 2.6), T.hw[li] - 2.6);
  const tx = T.x[li] + T.nx[li] * tl, tz = T.z[li] + T.nz[li] * tl;
  const des = Math.atan2(tx - k.x, tz - k.z);
  const err = wrap(des - (k.drifting ? k.mv : k.h));
  const inp = { steer: clamp(err * 2.6, -1, 1), accel: true, brake: false, drift: false, driftTap: false, boostTap: false, accelTap: false };
  // 급코너에서 드리프트
  let cMax = 0;
  for (let j = 0; j < 10; j++) { const c = T.curv[(k.ti + 3 + j * 2) % N]; if (Math.abs(c) > Math.abs(cMax)) cMax = c; }
  const sharp = Math.abs(cMax) * k.speed > gripYaw(k.speed) * 0.8;
  if (!k.drifting && sharp && Math.abs(err) > 0.13 && k.speed > 15 && Math.sign(err) === Math.sign(cMax)) {
    inp.driftTap = true; inp.drift = true; b.drift = true;
  } else if (k.drifting) {
    // 차체가 목표 방향을 넘어설 때까지 유지, 이후 떼고 반대로 꺾어 커팅
    const herr = wrap(des - k.h);
    const hold = Math.sign(herr) === k.driftDir && Math.abs(herr) > 0.1;
    inp.drift = hold && b.drift;
    if (!hold) b.drift = false;
    inp.steer = inp.drift ? k.driftDir : clamp(herr * 3, -1, 1);
  }
  if (b.wasDrift && !k.drifting && k.instWin > 0) b.instDelay = 0.08 + (1 - b.skill) * 0.5;
  b.wasDrift = k.drifting;
  if (b.instDelay > 0) { b.instDelay -= dt; if (b.instDelay <= 0 && Math.random() < 0.35 + b.skill * 0.6) inp.accelTap = true; }
  if (k.boosts > 0 && k.boostT <= 0 && !k.drifting && Math.abs(cMax) < 0.016 && Math.abs(err) < 0.16) {
    b.boostWait += dt; if (b.boostWait > 0.3 + (1 - b.skill)) { inp.boostTap = true; b.boostWait = 0; }
  }
  // 실력 낮은 봇은 최고 속도에서 살짝 발을 뗌
  if (k.speed > C.maxSpeed * (0.9 + b.skill * 0.1) && k.boostT <= 0 && k.instT <= 0) inp.accel = false;
  // 벽에 박혀 멈추면 후진
  if (Math.abs(k.speed) < 2.5) b.stuckT += dt; else b.stuckT = 0;
  if (b.stuckT > 1.2) { b.revT = 0.9; b.stuckT = 0; }
  if (b.revT > 0) { b.revT -= dt; inp.accel = false; inp.brake = true; inp.steer = -inp.steer; }
  return inp;
}

// 카트 주행 물리 — 드리프트/게이지/부스터/순간 부스터/출발 부스터
// 순수 계산 모듈(화면 코드 없음). 플레이어와 AI가 같은 물리를 쓴다.
import { locate, moverAt } from './tracks.js';

export const KMH = 6.6;            // 표시 속도 = m/s × KMH
export const C = {
  maxSpeed: 30,                    // 일반 최고 속도 (약 198km/h)
  boostSpeed: 41,                  // 부스터 최고 속도 (약 270km/h)
  instSpeed: 35.5,                 // 순간 부스터 최고 속도
  accel: 15, boostAccel: 34, instAccel: 44,
  coast: 5, brake: 30, reverse: 9,
  steerLow: 2.0, steerTop: 1.2, steerBoost: 1.0, // 일반 조향 (rad/s): 저속 / 최고 속도 / 부스터 중
  followGrip: 12,
  // 드리프트: Shift를 짧게 누르면 차체가 driftKick만큼 꺾이고, 방향키를 누르고 있는 동안 그 각을 유지하며 돈다.
  // Shift를 길게 누르면 각이 깊어져 더 급하게 돌지만 속도를 많이 잃는다. 반대 방향키로 끊는다(커팅).
  driftKick: 0.42, driftKickRate: 6.5, driftDeepen: 1.5, maxSlip: 1.05,
  slipHold: 0.22, slipFree: 1.3, slipCut: 5.5,
  turnBase: 1.25, turnSlip: 1.55,
  driftDrag: 0.7, driftThrust: 0.4,
  driftMinSpeed: 10,
  gaugeRate: 0.95,
  boostTime: 3.0, instTime: 0.62, instWindow: 0.5, startBoostTime: 1.6,
  radius: 1.15, gravity: 26,
};
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// 속도에 따른 일반 조향 속도
export function gripYaw(v) {
  if (v <= 10) return C.steerLow;
  if (v <= C.maxSpeed) return C.steerLow + (C.steerTop - C.steerLow) * (v - 10) / (C.maxSpeed - 10);
  return C.steerTop + (C.steerBoost - C.steerTop) * clamp((v - C.maxSpeed) / 11, 0, 1);
}
// 드리프트 중 진행 방향이 도는 속도 (각이 깊을수록 급하게)
export const driftTurn = slipMag => C.turnBase + C.turnSlip * slipMag;

export function createKart() {
  return {
    x: 0, z: 0, y: 0, h: 0, mv: 0, speed: 0,
    steer: 0, yawVel: 0,
    drifting: false, driftDir: 0, driftT: 0, slip: 0, kick: 0, armed: false, pendDir: 0,
    gauge: 0, boosts: 0, boostT: 0, instT: 0, instWin: 0,
    ti: 0, lat: 0, s: 0, lap: -1, prog: 0, wrongT: 0,
    hitT: 0, padT: 0, airT: 0, air: false, vy: 0, surf: 0, bumpT: 0, sc: 0, pi: 0, ps: 0, prevSc: 0,
    finished: false, finishTime: 0,
    ev: {},   // 이번 프레임에 일어난 일 (효과음·이펙트용)
    _loc: {},
  };
}

export function placeKart(k, T, p) {
  k.x = p.x; k.z = p.z; k.y = p.y; k.h = p.h; k.mv = p.h; k.speed = 0;
  k.ti = p.i; k.drifting = false; k.steer = 0; k.slip = 0; k.kick = 0; k.air = false; k.vy = 0; k.sc = 0;
  const L = locate(T, k.x, k.z, k.ti, 30, k._loc);
  k.ti = L.i; k.s = L.s; k.lat = L.lat;
}

const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
// inp: {steer(-1..1, +왼쪽), accel, brake, drift, driftTap, boostTap, accelTap}
// rule: {infinite, time(경기 시간 — 움직이는 장애물 위치)}
export function stepKart(k, inp, dt, T, rule) {
  const ev = k.ev = {};
  const inf = rule && rule.infinite;
  const air = k.air;
  let P = k.sc ? T.shortcuts[k.sc - 1] : T;      // 지금 달리는 길 (본 트랙 또는 지름길)
  const surf = air ? 0 : P.surf[k.sc ? k.pi : k.ti];          // 1 빙판, 2 물
  const ice = surf === 1, water = surf === 2;
  k.surf = surf;

  // 조향 입력 (키보드는 디지털이라 아주 짧게만 다듬는다)
  const target = clamp(inp.steer || 0, -1, 1);
  const sr = (Math.abs(target) < Math.abs(k.steer) || target * k.steer < 0) ? 16 : 11;
  k.steer += clamp(target - k.steer, -sr * dt, sr * dt);
  const dirKey = target > 0.25 ? 1 : target < -0.25 ? -1 : 0;

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
  if (!inp.drift) k.armed = false;
  if (inp.driftTap) k.armed = true;
  const canDrift = k.speed > C.driftMinSpeed;
  if (k.drifting && inp.driftTap && dirKey) {
    if (dirKey === k.driftDir) k.kick = Math.min(C.maxSlip - Math.abs(k.slip), k.kick + 0.28);   // 연타: 각을 한 번 더 넣기
    else k.pendDir = dirKey;                                                                      // 반대로 바로 이어 치기
    k.armed = false;
  }
  if (!k.drifting && canDrift && !air && dirKey && (k.armed || k.pendDir === dirKey)) {
    k.drifting = true; k.driftDir = dirKey; k.driftT = 0; k.armed = false; k.pendDir = 0; ev.driftStart = true;
    k.kick = Math.max(0, C.driftKick - Math.max(0, k.slip * dirKey));
  }
  if (!k.drifting) k.pendDir = 0;

  // --- 방향 ---
  const sf = clamp(Math.abs(k.speed) / 6, 0, 1);
  if (k.speed < 0) {                                   // 후진
    k.h += k.steer * C.steerLow * sf * fwd * dt; k.mv = k.h; k.slip = 0;
  } else if (k.drifting) {
    k.driftT += dt;
    const d = k.driftDir;
    let mag = Math.max(0, k.slip * d);
    const into = dirKey === d, counter = dirKey === -d;
    if (k.kick > 0) { const a = Math.min(k.kick, C.driftKickRate * dt); mag += a; k.kick -= a; }
    if (air) { /* 공중: 각 유지 */ }
    else if (counter) { mag -= C.slipCut * dt; k.kick = 0; }                           // 커팅
    else if (inp.drift) mag += C.driftDeepen * dt;                                     // Shift를 누르는 동안 더 깊게
    else if (into) mag -= C.slipHold * (ice ? 0.35 : 1) * dt;                          // 방향키 유지: 끌기 (빙판은 더 오래)
    else mag -= C.slipFree * (ice ? 0.45 : 1) * dt;                                    // 손을 떼면 서서히 복귀
    mag = clamp(mag, 0, C.maxSlip);
    const turn = driftTurn(mag) * clamp(mag / 0.2, 0, 1) * (counter ? 0.35 : into ? 1.1 : 0.42) * (air ? 0.3 : 1);
    k.mv += d * turn * sf * dt;
    k.slip = d * mag;
    k.h = k.mv + k.slip;
    k.yawVel = d * turn;
  } else {
    const yaw = k.steer * gripYaw(Math.abs(k.speed)) * sf * (air ? 0.35 : 1);
    k.yawVel = yaw;
    k.h += yaw * dt;
    let sl = wrap(k.h - k.mv);
    k.mv += sl * Math.min(1, (air ? 0.6 : ice ? 2.6 : C.followGrip) * dt);   // 빙판은 미끄러진다
    k.slip = wrap(k.h - k.mv);
  }
  const slip = k.slip;

  // --- 속도 ---
  let vmax = C.maxSpeed, acc = C.accel;
  if (boosting) { vmax = C.boostSpeed; acc = C.boostAccel; }
  else if (inst) { vmax = C.instSpeed; acc = C.instAccel; }
  if (k.padT > 0) { k.padT -= dt; vmax = Math.max(vmax, C.boostSpeed); acc = Math.max(acc, C.boostAccel); }
  if (water) { vmax *= 0.6; acc *= 0.7; }                     // 물웅덩이: 느려진다
  if (k.bumpT > 0) k.bumpT -= dt;
  const slopeAcc = -(k._loc.slope || 0) * 9 * Math.cos(wrap(k.mv - Math.atan2(k._loc.tx || 0, k._loc.tz || 1)));
  const throttle = inp.accel || boosting || inst;
  if (air) {
    k.speed -= k.speed * 0.05 * dt;                           // 공중: 가속·감속 없음
  } else if (inp.brake && !boosting) {
    if (k.speed > 0.5) k.speed -= C.brake * dt;
    else k.speed = Math.max(-C.reverse, k.speed - 12 * dt);
  } else if (throttle) {
    if (k.speed < 0) k.speed += C.brake * dt;
    else if (k.speed < vmax) k.speed += acc * Math.cos(slip) * (k.drifting ? C.driftThrust : 1) * (1 - 0.55 * (k.speed / vmax) ** 2) * dt;
    else k.speed -= Math.min(k.speed - vmax, (water ? 30 : 9) * dt); // 부스터가 끝나면 서서히 감속
  } else {
    const d = C.coast * dt;
    k.speed = Math.abs(k.speed) < d ? 0 : k.speed - Math.sign(k.speed) * d;
  }
  if (k.speed > 0 && !air) k.speed += slopeAcc * dt * 0.5;
  if (water && k.speed > vmax) k.speed -= (k.speed - vmax) * 2.5 * dt;
  if (k.drifting) k.speed -= k.speed * C.driftDrag * Math.sin(slip) ** 2 * dt;

  // --- 드리프트 게이지 ---
  if (k.drifting) {
    // 오래 끌수록 충전 효율이 떨어진다 (짧게 끊어 치는 편이 유리)
    const g = C.gaugeRate * (ice ? 1.3 : 1) * Math.abs(slip) * clamp(k.speed / C.maxSpeed, 0, 1.2) / (1 + Math.max(0, k.driftT - 0.6) * 0.9) * (inf ? 3.2 : 1);
    addGauge(k, g * dt, ev, inf);
    if ((Math.abs(slip) < 0.04 && k.kick <= 0 && k.driftT > 0.08) || k.speed < 6) {
      k.drifting = false; ev.driftEnd = true; k.slip = 0; k.h = k.mv;
      if (k.speed >= 6 && k.driftT > 0.22) { k.instWin = C.instWindow; ev.instReady = true; }
      k.driftT = 0;
    }
  } else if (inf && k.speed > 8) addGauge(k, 0.1 * dt, ev, inf);

  // --- 이동 ---
  k.x += Math.sin(k.mv) * k.speed * dt;
  k.z += Math.cos(k.mv) * k.speed * dt;

  // --- 트랙 위치·벽 충돌 ---
  const prevTi = k.sc ? k.pi : k.ti, prevSc = k.sc;
  let L = locate(P, k.x, k.z, prevTi, 14, k._loc);
  const prevS = k.s;
  if (k.sc) {
    // 지름길 양 끝: 본 트랙 도로 안으로 들어오면 본 트랙으로
    if (L.s < 12 || L.s > P.length - 12) {
      const Lm = locate(T, k.x, k.z, L.s < 12 ? P.iA : P.iB, 26, _lm);
      const offS = Math.abs(L.lat) > P.hw[L.i] - C.radius || L.s > P.length - 1.5;   // 지름길 차선을 벗어났거나 끝에 닿음
      if (offS && Math.abs(Lm.lat) < Lm.hw - C.radius * 0.6) { k.sc = 0; P = T; L = Object.assign(k._loc, Lm); }
    }
  } else if (T.shortcuts && T.shortcuts.length && Math.abs(L.lat) > L.hw - C.radius) {
    // 벽 구멍으로 나가면 지름길로
    const g = (L.lat > 0 ? T.gapL : T.gapR)[L.i];
    if (g) {
      const S = T.shortcuts[g - 1], d0 = Math.abs(L.i - S.iA), dA = Math.min(d0, T.n - d0);
      const Ls = locate(S, k.x, k.z, dA < 40 ? 0 : S.n - 1, 30, _lm);
      if (Math.abs(Ls.lat) < S.hw[Ls.i] + 1.2 && Ls.s < S.length - 1) { k.sc = g; P = S; L = Object.assign(k._loc, Ls); }
    }
  }
  if (k.sc) { k.pi = L.i; k.ps = L.s; k.s = ((P.sA + L.s / P.length * (P.sB - P.sA)) % T.length + T.length) % T.length; k.ti = Math.floor(k.s / T.ds) % T.n; k.lat = 0; }
  else { k.ti = L.i; k.s = L.s; k.lat = L.lat; }
  const lim = L.hw - C.radius;
  if (Math.abs(L.lat) > lim) {
    const side = Math.sign(L.lat);
    const over = Math.abs(L.lat) - lim;
    k.x -= L.nx * side * over; k.z -= L.nz * side * over; if (!k.sc) k.lat = side * lim;
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
        if (k.drifting) { k.drifting = false; k.driftT = 0; k.kick = 0; k.slip = 0; ev.driftEnd = true; k.h = k.mv; }
        else k.h += wrap(k.mv - k.h) * 0.5;
      } else {
        ev.scrape = true;
        if (k.drifting) k.h = k.mv + k.slip; else k.h += wrap(k.mv - k.h) * Math.min(1, 4 * dt);
      }
    }
  }
  if (k.hitT > 0) k.hitT -= dt;

  // --- 높이: 점프대 끝에서 날아오르고, 중력으로 떨어진다 ---
  if (k.air) {
    k.vy -= C.gravity * dt; k.y += k.vy * dt; k.airT += dt;
    if (k.y <= L.y) {
      ev.land = Math.max(0.1, -k.vy); k.y = L.y; k.air = false; k.vy = 0;
      if (ev.land > 11) k.speed *= 0.94;
    }
  } else if (prevSc === k.sc && P.ramp[prevTi] && !P.ramp[L.i] && k.speed > 6 && L.i !== prevTi) {
    const pi = P.open ? Math.max(0, prevTi - 1) : (prevTi + P.n - 1) % P.n;
    k.vy = k.speed * Math.max(0.05, (P.y[prevTi] - P.y[pi]) / P.ds);
    k.y = P.y[prevTi]; k.air = true; k.airT = 0; ev.jump = k.vy;
  } else k.y = L.y;

  // --- 장애물 ---
  if (!k.air || k.y - L.y < 1.1) {
    const ks = k.sc ? k.ps : k.s;
    for (const o of P.obs) bumpInto(k, P, L, ks, o.s, o.lat, o.r, o.soft, ev);
    if (P.movers.length) {
      const tm = rule && rule.time || 0;
      for (const m of P.movers) { moverAt(P, m, tm, _mp); if (_mp.edge > 0.5) bumpInto(k, P, L, ks, _mp.s, _mp.lat, m.r, m.soft, ev); }
    }
  }
  k.prevSc = k.sc;

  // --- 부스터 발판 ---
  for (const p of P.pads) {
    let di = L.i - p.i; if (di < 0 && !P.open) di += P.n;
    if (di >= 0 && di < p.len && Math.abs(L.lat - p.lat) < 3.2 && k.speed > 3 && !k.air) {
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

const _mp = {}, _lm = {};
// 원형 장애물(트랙 좌표 s, lat)과 부딪히기. soft = 짚더미·회전초처럼 밀리며 덜 손해
function bumpInto(k, T, L, ks, s, lat, r, soft, ev) {
  let dsx = ks - s; const half = T.length / 2;
  if (!T.open) { if (dsx > half) dsx -= T.length; else if (dsx < -half) dsx += T.length; }
  const R = r + C.radius * 0.9;
  if (dsx > R || dsx < -R) return;
  const dl = L.lat - lat, d = Math.hypot(dsx, dl);
  if (d >= R) return;
  const ux = d > 1e-4 ? dsx / d : -1, ul = d > 1e-4 ? dl / d : 0;
  const nx = L.tx * ux + L.nx * ul, nz = L.tz * ux + L.nz * ul;   // 장애물 → 카트 방향
  k.x += nx * (R - d); k.z += nz * (R - d);
  const vx = Math.sin(k.mv) * k.speed, vz = Math.cos(k.mv) * k.speed, vn = vx * nx + vz * nz;
  if (vn >= 0) return;
  const e = soft ? 1.1 : 1.45;
  const nvx = vx - nx * vn * e, nvz = vz - nz * vn * e, ns = Math.hypot(nvx, nvz);
  const loss = soft ? clamp(-vn / 40, 0.05, 0.3) : clamp(-vn / 26, 0.08, 0.5);
  if (k.speed >= 0) { k.mv = Math.atan2(nvx, nvz); k.speed = ns * (1 - loss); }
  else k.speed *= 1 - loss;
  if (k.drifting && -vn > 6) { k.drifting = false; k.driftT = 0; k.kick = 0; k.slip = 0; ev.driftEnd = true; }
  k.h = k.mv + (k.drifting ? k.slip : wrap(k.h - k.mv) * 0.5);
  if (k.bumpT <= 0) { ev.bump = { v: -vn, soft }; k.bumpT = 0.25; }
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
// lag: 반응 지연(초). 사람처럼 늦게 반응해도 달릴 수 있는지 검증할 때 쓴다.
export function createBot(skill = 0.8, lag = null) {
  return { skill, useShort: skill > 0.75 && Math.random() < 0.6, lane: (Math.random() - 0.5) * 6, phase: 0, holdT: 0, wasDrift: false, instDelay: 0, boostWait: 0, stuckT: 0, revT: 0, t: Math.random() * 10, lag: lag == null ? (1 - skill) * 0.12 : lag, q: [] };
}
export function botInput(b, k, T, dt, time = 0) {
  b.t += dt;
  const P = k.sc ? T.shortcuts[k.sc - 1] : T, N = P.n, open = !!P.open;   // 지금 달리는 길
  const id = j => open ? (j < 0 ? 0 : j > N - 1 ? N - 1 : j) : ((j % N) + N) % N;
  const ks = k.sc ? k.ps : k.s, kti = k.sc ? k.pi : k.ti;
  const look = 7 + k.speed * 0.45;
  const li = id(Math.floor((ks + look) / P.ds));
  const lane = k.sc ? 0 : clamp(b.lane + Math.sin(b.t * 0.3) * 1.5, -(P.hw[li] - 3), P.hw[li] - 3);
  let cAhead = 0;
  for (let j = 0; j < 14; j++) cAhead += P.curv[id(kti + 4 + j * 2)];
  cAhead /= 14;
  const apex = clamp(cAhead * 120, -1, 1) * P.hw[li] * (0.12 + b.skill * 0.2);   // 코너 안쪽으로 살짝 붙기
  let tl = clamp(lane * 0.4 + apex, -(P.hw[li] - 2.6), Math.max(0, P.hw[li] - 2.6));
  if (k.sc) tl = clamp(tl, -(P.hw[li] - 1.8), P.hw[li] - 1.8);
  // 앞의 장애물 피하기 (실력이 낮을수록 늦게 본다)
  if (P.obs.length || P.movers.length) {
    const see = 10 + k.speed * (0.7 + b.skill * 0.6), room = P.hw[li] - 2.2;
    const avoid = (s, lat, r) => {
      let d = s - ks; if (!open) { if (d < -P.length / 2) d += P.length; else if (d > P.length / 2) d -= P.length; }
      if (d < -1 || d > see) return;
      const need = r + 2.3;
      if (Math.abs(tl - lat) >= need) return;
      const L1 = lat + need, R1 = lat - need;
      const okL = L1 < room, okR = R1 > -room;
      tl = okL && okR ? (Math.abs(L1 - tl) < Math.abs(R1 - tl) ? L1 : R1) : okL ? L1 : okR ? R1 : tl;
    };
    for (let pass = 0; pass < 2; pass++) {
      for (const o of P.obs) avoid(o.s, o.lat, o.r);
      for (const m of P.movers) { moverAt(P, m, time + 0.4, _mp); if (_mp.edge > 0.3) avoid(_mp.s, _mp.lat, m.r + (m.type === 'cross' ? Math.abs(m.a) * 0.3 : 0)); }
    }
  }
  let tx = P.x[li] + P.nx[li] * tl, tz = P.z[li] + P.nz[li] * tl;
  // 지름길을 아는 봇: 입구가 가까우면 지름길 경로를 따라간다
  let CP = P, cti = kti, cid = id;
  if (k.sc) b.commit = 0;
  if (!k.sc && b.useShort && T.shortcuts && T.shortcuts.length) {
    for (const S of T.shortcuts) {
      let d = S.sA - k.s; if (d < -T.length / 2) d += T.length;
      if (b.commit === S.id + 1 && d < -60) b.commit = 0;
      if ((d > -3 && d < look + 25) || b.commit === S.id + 1) {
        b.commit = S.id + 1;
        // 지름길 위 내 위치(입구 지난 뒤엔 실제 위치)에서 look만큼 앞
        let sp = Math.max(0, -d); if (d < 0) { const Ls = locate(S, k.x, k.z, Math.round(sp / S.ds), 20, _lm); sp = Ls.s; }
        const si = Math.max(2, Math.min(S.n - 1, Math.round((sp + look - Math.max(0, d)) / S.ds)));
        tx = S.x[si]; tz = S.z[si];
        CP = S; cti = Math.max(0, Math.round(sp / S.ds)); cid = j => j < 0 ? 0 : j > S.n - 1 ? S.n - 1 : j;
        break;
      }
    }
  }
  const des = Math.atan2(tx - k.x, tz - k.z);
  const err = wrap(des - k.mv);
  const inp = { steer: clamp(err * 3, -1, 1), accel: true, brake: false, drift: false, driftTap: false, boostTap: false, accelTap: false };
  let cMax = 0;
  for (let j = 0; j < 10; j++) { const c = CP.curv[cid(cti + 3 + j * 2)]; if (Math.abs(c) > Math.abs(cMax)) cMax = c; }
  const need = Math.abs(cMax) * k.speed;                              // 이 코너를 도는 데 필요한 회전 속도
  let bend = 0; for (let j = 0; j < 24; j++) bend += CP.curv[cid(cti + 2 + j)] * CP.ds;   // 앞 48m 동안 꺾이는 총 각도
  if (!k.drifting) {
    b.phase = 0;
    const thr = gripYaw(k.speed) * (0.5 + (1 - b.skill) * 0.3);
    if (need > thr && Math.abs(bend) > 0.45 && Math.abs(err) > 0.12 && k.speed > 14 && Math.sign(err) === Math.sign(cMax)) {
      inp.driftTap = true; inp.drift = true; inp.steer = Math.sign(err); b.phase = 1;
      b.holdT = clamp((need - driftTurn(C.driftKick) * 1.1) / C.turnSlip / C.driftDeepen, 0, 0.4);   // 급할수록 Shift를 길게
    } else if (Math.abs(err) > 0.5 && k.speed > 20) inp.accel = false;
  } else {
    const d = k.driftDir, remain = err * d;
    if (b.holdT > 0) { b.holdT -= dt; inp.drift = true; }
    if (remain > 0.2) inp.steer = d;                    // 아직 많이 남음: 방향키 유지
    else if (remain > 0.06) inp.steer = 0;              // 거의 다 옴: 손 떼고 크게 돌기
    else { inp.steer = -d; inp.drift = false; b.holdT = 0; }   // 반대키로 끊기
  }
  if (b.wasDrift && !k.drifting && k.instWin > 0) b.instDelay = 0.06 + (1 - b.skill) * 0.45;
  b.wasDrift = k.drifting;
  if (b.instDelay > 0) { b.instDelay -= dt; if (b.instDelay <= 0 && Math.random() < 0.4 + b.skill * 0.6) inp.accelTap = true; }
  if (k.boosts > 0 && k.boostT <= 0 && !k.drifting && Math.abs(bend) < 0.3 && Math.abs(err) < 0.2) {
    b.boostWait += dt; if (b.boostWait > 0.15 + (1 - b.skill) * 0.8) { inp.boostTap = true; b.boostWait = 0; }
  }
  if (k.speed > C.maxSpeed * (0.9 + b.skill * 0.1) && k.boostT <= 0 && k.instT <= 0) inp.accel = false;   // 실력 낮은 봇은 살짝 발을 뗌
  if (Math.abs(k.speed) < 2.5) b.stuckT += dt; else b.stuckT = 0;                                          // 벽에 박히면 후진
  if (b.stuckT > 1.2) { b.revT = 0.9; b.stuckT = 0; }
  if (b.revT > 0) { b.revT -= dt; inp.accel = false; inp.brake = true; inp.steer = -inp.steer; }
  if (b.lag > 0) {                                                                                       // 반응 지연
    b.q.push(inp); const n = Math.round(b.lag / dt);
    if (b.q.length <= n) return { steer: 0, accel: true, brake: false, drift: false, driftTap: false, boostTap: false, accelTap: false };
    return b.q.shift();
  }
  return inp;
}

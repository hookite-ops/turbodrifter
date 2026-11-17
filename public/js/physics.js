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
  driftKick: 0.30, driftKickRate: 6.5, driftDeepen: 2.0, maxSlip: 1.1,
  slipHold: 0.3, slipFree: 1.4, slipCut: 5.5,
  turnBase: 0.55, turnSlip: 2.6,
  driftBase: 0.09, driftDrag: 0.8, driftThrust: 0.35,   // 드리프트 감속: 얕아도 조금, 깊을수록 많이 (U턴에서 약 120km/h까지)
  driftMinSpeed: 10,
  gaugeRate: 1.3,
  boostTime: 3.0, instTime: 0.62, instWindow: 0.5, startBoostTime: 1.6,
  radius: 1.15, gravity: 26,
  // --- 원작 규칙 ---
  dblKick: 0.3, dblGap: 0.16,       // 더블 드리프트: 드리프트 중 Shift를 한 번 더 (너무 빠르면 무시)
  elastTime: 0.7, elastGauge: 1.35, // 탄력: 드리프트 직후 같은 방향으로 다시 치면 게이지가 더 찬다 (숏풀)
  cutTime: 0.28, cutGauge: 0.035,   // 커팅: 드리프트 중 Shift+반대 방향키 → 감속 없이 빠르게 자세 복귀 + 게이지 조금
  instMin: 0.1,                     // 순간 부스터: 이만큼(게이지 10%)도 못 채운 얕은 드리프트는 발동 안 됨
  spinDelay: 0.12, spinRate: 2.6, spinMax: 2.75,   // 스핀턴: 드리프트 중 ↑를 떼면 차가 돌아간다
  hitGauge: 0.14,                   // 벽에 세게 박으면 게이지를 잃는다 (무한 부스터전 제외)
  draftCharge: 1.5, draftTime: 1.2, draftSpeed: 5, draftCool: 2.5,   // 드래프트: 앞 카트 뒤를 1.5초 따라가면 순간 가속
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

// 카트 성능 배율: speed 최고 속도, boost 부스터 속도, gauge 게이지 충전, turn 드리프트 회전, drag 드리프트 감속
export const STATS = {
  toy: { speed: 1.0, boost: 1.0, gauge: 1.14, turn: 1.07, drag: 0.92 },      // 드리프트형
  rocket: { speed: 1.045, boost: 1.045, gauge: 0.9, turn: 0.95, drag: 1.1 },   // 속도형
};
const NO_STAT = { speed: 1, boost: 1, gauge: 1, turn: 1, drag: 1 };
export function createKart(stat = NO_STAT) {
  return {
    st: stat,
    x: 0, z: 0, y: 0, h: 0, mv: 0, speed: 0,
    steer: 0, yawVel: 0,
    drifting: false, driftDir: 0, driftT: 0, slip: 0, kick: 0, armed: false, pendDir: 0,
    gauge: 0, boosts: 0, boostT: 0, instT: 0, instWin: 0,
    ti: 0, lat: 0, s: 0, lap: -1, prog: 0, wrongT: 0,
    hitT: 0, padT: 0, airT: 0, air: false, vy: 0, surf: 0, bumpT: 0, sc: 0, pi: 0, ps: 0, prevSc: 0, draftT: 0, draftB: 0, draftCd: 0, tapT: 0, dblT: 0, cutT: 0, elast: 0, elastT: 0, gMul: 1, driftG: 0, offT: 0,
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
    if (inp.accelTap || (inp.boostTap && k.boosts === 0)) {   // 원작: ↑를 뗐다가 다시 누른다
      k.instT = C.instTime; k.instWin = 0; ev.inst = true; inp = { ...inp, boostTap: false };
      if (inf) addGauge(k, 0.12, ev, inf);
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
  if (k.elastT > 0) k.elastT -= dt;
  if (k.dblT > 0) k.dblT -= dt;
  if (k.cutT > 0) k.cutT -= dt;
  if (k.drifting && inp.driftTap && dirKey) {
    if (dirKey === k.driftDir) {
      if (k.driftT - k.tapT > C.dblGap) {                     // 더블 드리프트: 각과 탄력을 한 번 더
        k.kick = Math.min(C.maxSlip - Math.abs(k.slip), k.kick + C.dblKick); k.dblT = 0.45; k.tapT = k.driftT; ev.dbl = true;
      }
    } else if (k.driftT > 0.15) {                             // 커팅: 반대로 짧게 쳐서 자세 바로잡기
      k.cutT = C.cutTime; k.pendDir = dirKey; ev.cut = true;
      addGauge(k, C.cutGauge * clamp(k.speed / C.maxSpeed, 0, 1.3) * (inf ? 2.2 : 1), ev, inf);
    }
    k.armed = false;
  }
  // 새 드리프트: Shift를 누른 순간, 또는 커팅 뒤에도 Shift+반대 방향을 계속 누르고 있으면 반대로 이어진다
  if (!k.drifting && canDrift && !air && dirKey && (k.armed || (k.pendDir === dirKey && inp.drift))) {
    k.drifting = true; k.driftDir = dirKey; k.driftT = 0; k.tapT = 0; k.armed = false; k.pendDir = 0; k.driftG = 0; k.cutT = 0; ev.driftStart = true;
    const el = k.elastT > 0 && k.elast === dirKey;            // 탄력이 남아 있으면 더 잘 꺾이고 게이지도 더 찬다
    k.gMul = el ? C.elastGauge : 1;
    k.kick = Math.max(0, C.driftKick + (el ? 0.08 : 0) - Math.max(0, k.slip * dirKey));
  }
  if (!k.drifting) k.pendDir = 0;
  k.offT = inp.accel || boosting || inst ? 0 : k.offT + dt;

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
    const spin = k.offT > C.spinDelay && !air;                                         // 스핀턴: ↑를 떼면 차가 계속 돌아간다
    const cap = Math.max(C.maxSlip, mag);
    if (air) { /* 공중: 각 유지 */ }
    else if (spin) mag += C.spinRate * dt;
    else if (k.cutT > 0) { mag -= C.slipCut * 1.7 * dt; k.kick = 0; }                  // 커팅 (Shift+반대키)
    else if (counter) { mag -= C.slipCut * dt; k.kick = 0; }                           // 반대 방향키만: 끊기
    else if (inp.drift) mag += C.driftDeepen * dt;                                     // Shift를 누르는 동안 더 깊게
    else if (into) mag -= C.slipHold * (ice ? 0.35 : 1) * dt;                          // 방향키 유지: 끌기 (빙판은 더 오래)
    else mag -= C.slipFree * (ice ? 0.45 : 1) * dt;                                    // 손을 떼면 서서히 복귀
    mag = clamp(mag, 0, spin ? C.spinMax : cap);
    const turn = driftTurn(Math.min(mag, C.maxSlip)) * k.st.turn * clamp(mag / 0.2, 0, 1) * (counter || k.cutT > 0 ? 0.35 : into ? 1.1 : 0.42) * (air ? 0.3 : 1) * (k.dblT > 0 ? 1.3 : 1) * (mag > 1.6 ? 0.3 : 1);
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
  const st = k.st;
  let vmax = C.maxSpeed * st.speed, acc = C.accel;
  if (boosting) { vmax = C.boostSpeed * st.boost; acc = C.boostAccel; }
  else if (inst) { vmax = C.instSpeed * st.boost; acc = C.instAccel; }
  if (k.padT > 0) { k.padT -= dt; vmax = Math.max(vmax, C.boostSpeed * st.boost); acc = Math.max(acc, C.boostAccel); }
  if (k.draftCd > 0) k.draftCd -= dt;
  if (k.draftB > 0) { k.draftB -= dt; if (!water) { vmax += C.draftSpeed; acc = Math.max(acc, 30); } }   // 드래프트: 순간 가속
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
    else if (k.speed < vmax) { const cs = Math.cos(slip); k.speed += acc * cs * (k.drifting && cs > 0 ? C.driftThrust : 1) * (1 - 0.55 * (k.speed / vmax) ** 2) * dt; }
    else k.speed -= Math.min(k.speed - vmax, (water ? 30 : 9) * dt); // 부스터가 끝나면 서서히 감속
  } else {
    const d = C.coast * dt;
    k.speed = Math.abs(k.speed) < d ? 0 : k.speed - Math.sign(k.speed) * d;
  }
  if (k.speed > 0 && !air) k.speed += slopeAcc * dt * 0.5;
  if (water && k.speed > vmax) k.speed -= (k.speed - vmax) * 2.5 * dt;
  if (k.drifting && k.cutT <= 0) k.speed -= k.speed * (C.driftBase + C.driftDrag * Math.sin(Math.min(Math.abs(slip), Math.PI / 2)) ** 2 * (Math.abs(slip) > 1.3 ? 1.8 : 1)) * st.drag * (boosting ? 0.6 : 1) * dt;
  if (k.speed < 0 && Math.abs(slip) > Math.PI / 2 && k.drifting) k.speed = 0;

  // --- 드리프트 게이지 ---
  if (k.drifting) {
    // 오래 끌수록 충전 효율이 떨어진다 (짧게 끊어 치는 편이 유리)
    const g = C.gaugeRate * k.st.gauge * (ice ? 1.3 : 1) * Math.min(Math.abs(slip), C.maxSlip) * clamp(k.speed / C.maxSpeed, 0, 1.2) / (1 + Math.max(0, k.driftT - 0.6) * 0.9) * k.gMul;
    k.driftG += g * dt;
    addGauge(k, g * dt * (inf ? 2.2 : 1), ev, inf);
    if ((Math.abs(slip) < 0.04 && k.kick <= 0 && k.driftT > 0.08) || k.speed < 6) {
      k.drifting = false; ev.driftEnd = true;
      if (Math.abs(slip) > Math.PI / 2) { k.mv = k.h; k.speed = Math.max(k.speed * 0.2, 1.5); ev.spin = true; }   // 스핀턴 완료: 차가 보는 쪽으로 다시 출발
      else k.h = k.mv;
      k.slip = 0;
      if (k.speed >= 6 && k.driftG >= C.instMin) { k.instWin = C.instWindow; ev.instReady = true; }
      k.elast = k.driftDir; k.elastT = C.elastTime;
      k.driftT = 0;
    }
  }
  if (inf && k.speed > 8) addGauge(k, 0.2 * dt, ev, inf);    // 무한 부스터전: 부스터 중에도 저절로 찬다

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
      // 입구 쪽 구멍으로만 들어간다. 출구 쪽 구멍은 본 트랙 벽처럼 막는다 (거꾸로 들어가지 않게)
      const Ls = dA < 40 ? locate(S, k.x, k.z, 0, 30, _lm) : null;
      if (Ls && Math.abs(Ls.lat) < S.hw[Ls.i] + 1.2 && Ls.s < S.length * 0.5) { k.sc = g; P = S; L = Object.assign(k._loc, Ls); }
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
        if (!inf && k.gauge > 0) { const lost = Math.min(k.gauge, C.hitGauge + vn * 0.008); k.gauge -= lost; ev.gaugeLost = lost; }
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
export function startBoost(k, inf) { k.boostT = C.startBoostTime; k.ev.boost = true; k.ev.start = true; if (inf) addGauge(k, 0.3, k.ev, true); }
// 드래프트 판정은 카트끼리의 위치가 필요해 경기 코드에서 부른다: behind = 앞 카트 바로 뒤에 붙어 있는가
export function stepDraft(k, behind, dt, inf) {
  if (k.draftB > 0 || k.draftCd > 0) { k.draftT = 0; return false; }
  k.draftT = behind ? k.draftT + dt : Math.max(0, k.draftT - dt * 2.5);
  if (k.draftT < C.draftCharge) return false;
  k.draftT = 0; k.draftB = C.draftTime; k.draftCd = C.draftCool + C.draftTime;
  if (inf) addGauge(k, 0.2, k.ev, true);
  return true;
}

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
  return { skill, useShort: false, lane: (Math.random() - 0.5) * 6, phase: 0, holdT: 0, wasDrift: false, instDelay: 0, boostWait: 0, stuckT: 0, revT: 0, t: Math.random() * 10, lag: lag == null ? (1 - skill) * 0.12 : lag, q: [] };
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
  const apex = clamp(cAhead * 120, -1, 1) * P.hw[li] * (0.05 + b.skill * 0.12);   // 코너 안쪽으로 살짝 붙기
  const mg = 3.0; let tl = clamp(lane * 0.4 + apex, -(P.hw[li] - mg), Math.max(0, P.hw[li] - mg));
  if (k.sc) tl = clamp(tl, -(P.hw[li] - 1.8), P.hw[li] - 1.8);
  // 앞의 장애물 피하기 (실력이 낮을수록 늦게 본다)
  if (P.obs.length || P.movers.length) {
    const see = 10 + k.speed * (0.7 + b.skill * 0.6), room = P.hw[li] - 2.2;
    // 앞에 있는 장애물을 가까운 순서로 모아, 가장 가까운 것부터 피한다 (멀리 있는 것 때문에 가까운 것에 붙지 않게)
    const ahead = [];
    const look2 = (s, lat, r) => { let d = s - ks; if (!open) { if (d < -P.length / 2) d += P.length; else if (d > P.length / 2) d -= P.length; } if (d >= -1 && d <= see) ahead.push({ d, lat, r }); };
    for (const o of P.obs) look2(o.s, o.lat, o.r);
    for (const m of P.movers) { moverAt(P, m, time + 0.4, _mp); if (_mp.edge > 0.3) look2(_mp.s, _mp.lat, m.r + (m.type === 'cross' ? Math.abs(m.a) * 0.3 : 0)); }
    ahead.sort((a, b) => a.d - b.d);
    for (const o of ahead) {
      const need = o.r + 2.3;
      if (Math.abs(tl - o.lat) >= need) continue;
      const L1 = o.lat + need, R1 = o.lat - need, okL = L1 < room, okR = R1 > -room;
      tl = okL && okR ? (Math.abs(L1 - tl) < Math.abs(R1 - tl) ? L1 : R1) : okL ? L1 : okR ? R1 : tl;
      break;   // 다음 장애물은 이걸 지나고 나서 생각한다
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
        if (d > 5) {   // 입구 전: 본 트랙을 따라가며 입구 쪽 차선으로 미리 붙는다
          if (S.side === undefined) { const q = Math.min(6, S.n - 1); S.side = Math.sign((S.x[q] - T.x[S.iA]) * T.nx[S.iA] + (S.z[q] - T.z[S.iA]) * T.nz[S.iA]) || 1; }
          const ti = Math.floor(Math.min(k.s + look, S.sA) / T.ds) % T.n, lat2 = S.side * Math.max(0, T.hw[ti] - 2.4) * clamp(1 - (d - 5) / 40, 0, 1);
          tx = T.x[ti] + T.nx[ti] * lat2; tz = T.z[ti] + T.nz[ti] * lat2;
          break;
        }
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
      b.holdT = clamp((need * 1.25 - driftTurn(C.driftKick) * 1.1) / C.turnSlip / C.driftDeepen, 0, 0.6);   // 급할수록 Shift를 길게
    } else if (Math.abs(err) > 0.5 && k.speed > 20) inp.accel = false;
  } else {
    const d = k.driftDir, remain = err * d;
    if (b.holdT > 0) { b.holdT -= dt; inp.drift = true; }
    if (remain > 0.3) inp.steer = d;                    // 아직 많이 남음: 방향키 유지
    else if (remain > 0.12) inp.steer = 0;              // 거의 다 옴: 손 떼고 크게 돌기
    else { inp.steer = -d; inp.drift = false; b.holdT = 0; }   // 반대키로 끊기
  }
  if (b.wasDrift && !k.drifting && k.instWin > 0) b.instDelay = 0.06 + (1 - b.skill) * 0.45;
  b.wasDrift = k.drifting;
  if (b.instDelay > 0) { b.instDelay -= dt; if (b.instDelay <= 0 && Math.random() < 0.4 + b.skill * 0.6) inp.accelTap = true; }
  if (k.boosts > 0 && k.boostT <= 0 && !k.drifting && Math.abs(bend) < 0.3 && Math.abs(err) < 0.2) {
    b.boostWait += dt; if (b.boostWait > 0.15 + (1 - b.skill) * 0.8) { inp.boostTap = true; b.boostWait = 0; }
  }
  if (k.speed > C.maxSpeed * (0.9 + b.skill * 0.1) && k.boostT <= 0 && k.instT <= 0 && !k.drifting && k.draftB <= 0 && b.skill < 0.9) inp.accel = false;   // 실력 낮은 봇은 살짝 발을 뗌
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

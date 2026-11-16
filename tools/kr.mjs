// 원작 기술별 입력을 흉내 내서 수치 확인 (감속·게이지·회전각)
import { buildTrack, pointAt } from '../public/js/tracks.js';
import { createKart, placeKart, stepKart, C } from '../public/js/physics.js';
const T = buildTrack({ id: 'flat', hw: 400, pts: [[0, -2000, 300], [0, 2000, 300], [1500, 2000, 300], [1500, -2000, 300]] });
function run(name, script, o = {}) {
  const k = createKart(); placeKart(k, T, pointAt(T, 100, 0)); k.speed = o.v0 || 30; const h0 = k.mv; if (o.boost) k.boostT = 3;
  const dt = 1 / 120; let log = [], t = 0, prev = {}, minV = 99, dEnd = 0, maxSlip = 0;
  while (t < (o.T || 3.5)) {
    const s = script(t, k);
    const inp = { steer: s.steer || 0, accel: s.accel !== false, brake: false, drift: !!s.drift, driftTap: !!s.drift && !prev.drift, boostTap: false, accelTap: s.accel !== false && prev.accel === false };
    prev = s; stepKart(k, inp, dt, T, o.rule || {}); t += dt; minV = Math.min(minV, k.speed); maxSlip = Math.max(maxSlip, Math.abs(k.slip));
    if (k.ev.driftEnd) dEnd = t;
    for (const e of ['inst', 'charged', 'dbl', 'cut', 'spin']) if (k.ev[e]) log.push(`${t.toFixed(2)}s ${e}`);
  }
  console.log(`${name}: 회전 ${((k.mv - h0) * 57.3).toFixed(0)}° / 끝 ${dEnd.toFixed(2)}s / 최대각 ${(maxSlip * 57.3).toFixed(0)}° / 최저 ${(minV * 6.6).toFixed(0)}km/h / 끝속도 ${(k.speed * 6.6).toFixed(0)} / 게이지 ${(k.gauge * 100 + k.boosts * 100).toFixed(0)}% ${log.join(', ')}`);
}
const until = (k, h0, deg) => (k.mv - h0) * 57.3 < deg;
run('최적화 (탭 0.08 + 방향 0.25 → 반대키)', t => ({ steer: t < 0.25 ? 1 : t < 0.5 ? -1 : 0, drift: t < 0.08 }));
run('직각 90° (탭 + 방향 유지, 80°에서 반대키)', (t, k) => ({ steer: until(k, 0, 78) ? 1 : (k.drifting ? -1 : 0), drift: t < 0.1 }));
run('직각 90° + 커팅(Shift+반대)', (t, k) => { const a = until(k, 0, 78); return { steer: a ? 1 : (k.drifting ? -1 : 0), drift: t < 0.1 || (!a && k.drifting && k.cutT <= 0 && k.slip > 0.2) }; });
run('풀 드리프트 U턴 (Shift 0.5 + 방향, 170°에서 반대키)', (t, k) => ({ steer: until(k, 0, 168) ? 1 : (k.drifting ? -1 : 0), drift: t < 0.5 }));
run('더블 드리프트 U턴 (탭, 0.3초에 다시 탭)', (t, k) => ({ steer: until(k, 0, 168) ? 1 : (k.drifting ? -1 : 0), drift: t < 0.1 || (t > 0.3 && t < 0.4) }));
run('부스터 중 U턴 풀 드리프트', (t, k) => ({ steer: until(k, 0, 168) ? 1 : (k.drifting ? -1 : 0), drift: t < 0.5 }), { boost: true, v0: 41 });
run('숏 → 풀 (탄력)', (t, k) => ({ steer: t < 0.2 ? 1 : t < 0.38 ? -1 : (t > 0.55 && until(k, 0, 85)) ? 1 : (k.drifting && t > 0.6 ? -1 : 0), drift: t < 0.07 || (t > 0.55 && t < 0.65) }));
run('끌기 (탭 + 방향 2초 유지)', t => ({ steer: t < 2 ? 1 : 0, drift: t < 0.1 }));
run('순간 부스터 (직각 후 ↑ 뗐다 누르기)', (t, k) => ({ steer: until(k, 0, 78) ? 1 : (k.drifting ? -1 : 0), drift: t < 0.1, accel: !(k.instWin > 0.3) }));
run('얕은 숏 후 순부 시도', (t, k) => ({ steer: t < 0.12 ? 1 : t < 0.3 ? -1 : 0, drift: t < 0.06, accel: !(k.instWin > 0.3) }));
run('스핀턴 (드리프트 중 ↑ 0.9초 떼기)', (t, k) => ({ steer: t < 0.5 ? 1 : 0, drift: t < 0.3, accel: !(t > 0.25 && t < 1.15) }), { T: 4 });
run('무한전 직각', (t, k) => ({ steer: until(k, 0, 78) ? 1 : (k.drifting ? -1 : 0), drift: t < 0.1 }), { rule: { infinite: true } });

// 사람이 키보드로 하는 드리프트 입력을 흉내 내서 수치 확인
import { buildTrack, pointAt } from '../public/js/tracks.js';
import { createKart, placeKart, stepKart, C } from '../public/js/physics.js';
const T = buildTrack({ id: 'flat', hw: 400, pts: [[0, -2000, 300], [0, 2000, 300], [1500, 2000, 300], [1500, -2000, 300]] }); // 넓은 평지
function run(name, script, rule = {}) {
  const k = createKart(); placeKart(k, T, pointAt(T, 100, 0)); k.speed = 30; const h0 = k.mv;
  const dt = 1 / 120; let log = [], t = 0, prev = {}, minV = 99, dEnd = 0;
  while (t < 3.2) {
    const s = script(t, k);
    const inp = { steer: s.steer || 0, accel: s.accel !== false, brake: false, drift: !!s.drift, driftTap: !!s.drift && !prev.drift, boostTap: !!s.boost && !prev.boost, accelTap: !!s.accelTap && !prev.accelTap };
    prev = s; stepKart(k, inp, dt, T, rule); t += dt; minV = Math.min(minV, k.speed);
    if (k.ev.driftEnd) dEnd = t;
    for (const e of ['inst', 'charged']) if (k.ev[e]) log.push(`${t.toFixed(2)}s ${e}`);
  }
  console.log(`${name}: 진행방향 ${((k.mv - h0) * 57.3).toFixed(0)}° / 드리프트 끝 ${dEnd.toFixed(2)}s / 최저 ${(minV * 6.6).toFixed(0)}km/h / 게이지 ${(k.gauge * 100 + k.boosts * 100).toFixed(0)}% ${log.join(', ')}`);
}
run('일반 좌회전 1초', t => ({ steer: t < 1 ? 1 : 0 }));
run('숏: Shift 0.1초 탭, 방향키 0.3초', t => ({ steer: t < 0.3 ? 1 : 0, drift: t < 0.1 }));
run('기본: 탭 + 방향 0.8초 유지 → 반대키 커팅', t => ({ steer: t < 0.8 ? 1 : t < 1.0 ? -1 : 0, drift: t < 0.1 }));
run('탭 + 방향 계속 2초 (끌기)', t => ({ steer: t < 2 ? 1 : 0, drift: t < 0.1 }));
run('Shift 0.4초 홀드 + 방향 0.8초 → 커팅', t => ({ steer: t < 0.8 ? 1 : t < 1.0 ? -1 : 0, drift: t < 0.4 }));
run('탭 후 손 떼기', t => ({ steer: t < 0.12 ? 1 : 0, drift: t < 0.1 }));
run('기본 + 순간 부스터', (t, k) => ({ steer: t < 0.8 ? 1 : t < 1.0 ? -1 : 0, drift: t < 0.1, accel: !(k.instWin > 0.35), accelTap: k.instWin > 0 && k.instWin <= 0.35 }));
run('좌 드리프트 → 바로 우 드리프트', t => ({ steer: t < 0.6 ? 1 : t < 1.3 ? -1 : t < 1.5 ? 1 : 0, drift: t < 0.1 || (t > 0.62 && t < 0.72) }));
run('무한전 기본 드리프트', t => ({ steer: t < 0.8 ? 1 : t < 1.0 ? -1 : 0, drift: t < 0.1 }), { infinite: true });

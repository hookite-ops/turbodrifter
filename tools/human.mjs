// 사람이 하는 드리프트 입력을 흉내 내서 수치 확인
import { TRACKS, buildTrack, pointAt } from '../public/js/tracks.js';
import { createKart, placeKart, stepKart, C } from '../public/js/physics.js';
const T = buildTrack({ id: 'flat', hw: 400, pts: [[0, -2000, 300], [0, 2000, 300], [1500, 2000, 300], [1500, -2000, 300]] }); // 넓은 평지
function run(name, script, rule = {}) {
  const k = createKart(); placeKart(k, T, pointAt(T, 100, 0)); k.speed = 30; const h0 = k.h;
  const dt = 1 / 120; let log = [], t = 0, prev = {};
  while (t < 3.2) {
    const s = script(t, k);
    const inp = { steer: s.steer || 0, accel: s.accel !== false, brake: false, drift: !!s.drift, driftTap: !!s.drift && !prev.drift, boostTap: !!s.boost && !prev.boost, accelTap: !!s.accelTap && !prev.accelTap };
    prev = s; stepKart(k, inp, dt, T, rule); t += dt;
    for (const e of ['driftStart', 'driftEnd', 'instReady', 'inst', 'charged', 'boost']) if (k.ev[e]) log.push(`${t.toFixed(2)}s ${e}`);
  }
  let dh = k.h - h0;
  console.log(`${name}: 방향 ${(dh * 57.3).toFixed(0)}° / 속도 ${(k.speed * 6.6).toFixed(0)}km/h / 게이지 ${(k.gauge * 100).toFixed(0)}% 부스터 ${k.boosts} | ${log.join(', ')}`);
}
run('그립 좌회전 1초', t => ({ steer: t < 1 ? 1 : 0 }));
run('짧은 드리프트(0.2초 탭)+0.5초 유지 후 커팅', t => ({ steer: t < 0.7 ? 1 : t < 1.0 ? -1 : 0, drift: t < 0.2 }));
run('탭 후 방향만 계속(끌기) 1.5초, 커팅', t => ({ steer: t < 1.5 ? 1 : t < 1.9 ? -1 : 0, drift: t < 0.2 }));
run('드리프트 길게 0.8초 홀드 후 커팅', t => ({ steer: t < 0.8 ? 1 : t < 1.2 ? -1 : 0, drift: t < 0.8 }));
run('탭 후 방향키 놓기(자연 복귀)', t => ({ steer: t < 0.35 ? 1 : 0, drift: t < 0.2 }));
run('커팅 후 순간 부스터', (t, k) => ({ steer: t < 0.7 ? 1 : t < 1.0 ? -1 : 0, drift: t < 0.2, accelTap: k.instWin > 0 && k.instWin < 0.4 }));
run('무한전 같은 드리프트', t => ({ steer: t < 0.7 ? 1 : t < 1.0 ? -1 : 0, drift: t < 0.2 }), { infinite: true });
run('부스터 3초', t => ({ boost: t > 0.1 && t < 0.2 }), {});

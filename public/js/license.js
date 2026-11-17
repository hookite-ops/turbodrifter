// 라이선스 시험: L3(루키) → L2 → L1. 각 라이선스는 시험 3개, 모두 합격하면 다음 라이선스가 열린다.
// goal: 1바퀴 안에 채워야 하는 횟수 / limit: 넘으면 바로 불합격 (time 초, hits 번)
export const LICENSES = [
  {
    id: 'L3', name: 'L3 루키', color: '#7ed957', tests: [
      { title: '드리프트 첫걸음', track: 'village', goal: { drift: 10 }, tip: 'Shift를 누른 채 방향키로 코너를 미끄러지듯 돌아요.' },
      { title: '부스터 모으기', track: 'village', goal: { boost: 3 }, tip: '드리프트로 게이지를 채우고 Ctrl로 부스터를 써요. 출발 부스터는 세지 않아요.' },
      { title: '마을 한 바퀴', track: 'village', limit: { time: 40 }, tip: '40초 안에 한 바퀴. 직선에서는 부스터를 아끼지 마세요.' },
    ],
  },
  {
    id: 'L2', name: 'L2', color: '#4fb8ff', tests: [
      { title: '순간 부스터', track: 'lake', goal: { inst: 4 }, tip: '드리프트가 끝나는 순간 ↑를 뗐다가 다시 눌러요.' },
      { title: '얼음 지름길', track: 'lake', goal: { sc: 1 }, limit: { time: 42 }, tip: '오른쪽 벽이 뚫린 곳으로 들어가 얼음 지름길을 지나요.' },
      { title: '협곡 다운힐', track: 'canyon', limit: { time: 52, hits: 8 }, tip: '좁은 협곡이에요. 벽에 8번 넘게 부딪히면 불합격.' },
    ],
  },
  {
    id: 'L1', name: 'L1', color: '#ffd23f', tests: [
      { title: '커팅', track: 'neon', goal: { cut: 5 }, tip: '드리프트 중 반대 방향키를 짧게 톡 쳐서 자세를 바로잡아요.' },
      { title: '더블 드리프트', track: 'village', goal: { dbl: 5 }, tip: '드리프트 중 Shift를 한 번 더 짧게 눌러 각을 더 줘요.' },
      { title: '네온 시티', track: 'neon', limit: { time: 47, hits: 3 }, tip: '47초 안에, 벽에는 3번까지만.' },
    ],
  },
];
export const GOAL_NAME = { drift: '드리프트', boost: '부스터 사용', inst: '순간 부스터', sc: '지름길 통과', cut: '커팅', dbl: '더블 드리프트' };

// 진행 상황 (localStorage)
export function loadLic(store) { const s = store.get('td_lic', {}); for (const L of LICENSES) if (!Array.isArray(s[L.id])) s[L.id] = L.tests.map(() => 0); return s; }
export const licDone = (s, L) => s[L.id].every(Boolean);
export const licOpen = (s, li) => li === 0 || licDone(s, LICENSES[li - 1]);
export function licBest(s) { let b = null; for (const L of LICENSES) if (licDone(s, L)) b = L; return b; }

// 경기 중 판정
export function licState(li, ti) { return { li, ti, def: LICENSES[li].tests[ti], c: { drift: 0, boost: 0, inst: 0, sc: 0, cut: 0, dbl: 0, hits: 0 }, fail: '', pass: false }; }
export function licEvent(S, ev, k) {
  if (ev.driftStart) S.c.drift++;
  if (ev.boost && !ev.start) S.c.boost++;
  if (ev.inst) S.c.inst++;
  if (ev.cut) S.c.cut++;
  if (ev.dbl) S.c.dbl++;
  if (ev.hit) S.c.hits++;
  if (k.sc && !S._sc) S.c.sc++;
  S._sc = !!k.sc;
}
// 제한을 넘었는지 (경기 중 매 프레임)
export function licCheck(S, t) {
  const L = S.def.limit || {};
  if (L.time && t > L.time) return '시간 초과';
  if (L.hits !== undefined && S.c.hits > L.hits) return '벽 충돌 초과';
  return '';
}
export const licGoalMet = S => Object.entries(S.def.goal || {}).every(([k, v]) => S.c[k] >= v);
export function licRows(S, t) {
  const rows = [];
  for (const [k, v] of Object.entries(S.def.goal || {})) rows.push({ txt: `${GOAL_NAME[k]} ${Math.min(S.c[k], v)}/${v}`, ok: S.c[k] >= v });
  const L = S.def.limit || {};
  if (L.time) rows.push({ txt: `시간 ${t.toFixed(1)} / ${L.time}초`, ok: t <= L.time, warn: t > L.time - 5 });
  if (L.hits !== undefined) rows.push({ txt: `벽 충돌 ${S.c.hits} / ${L.hits}`, ok: S.c.hits <= L.hits, warn: S.c.hits >= L.hits });
  rows.push({ txt: '1바퀴 완주', ok: false, fin: true });
  return rows;
}

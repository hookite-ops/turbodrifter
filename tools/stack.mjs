// 도로끼리 겹침 검사: 위에서 봤을 때 겹치는 두 도로는 높이가 6m 이상 차이 나야 한다 (층 구조)
import { TRACKS, buildTrack } from '../public/js/tracks.js';
for (const d of TRACKS) {
  if (process.argv[2] && d.id !== process.argv[2]) continue;
  const T = buildTrack(d); let bad = 0, stacked = 0, minDy = 99; const ex = [];
  for (let i = 0; i < T.n; i += 2) for (let j = i + 2; j < T.n; j += 2) {
    let ds = Math.abs(i - j) * T.ds; ds = Math.min(ds, T.length - ds); if (ds < 40) continue;
    const pd = Math.hypot(T.x[i] - T.x[j], T.z[i] - T.z[j]); if (pd > T.hw[i] + T.hw[j] + 1.5) continue;
    const dy = Math.abs(T.y[i] - T.y[j]); stacked++; minDy = Math.min(minDy, dy);
    if (dy < 6) { bad++; if (ex.length < 5) ex.push(`s${(i * T.ds) | 0}/s${(j * T.ds) | 0} 높이차 ${dy.toFixed(1)}`); }
  }
  console.log(`${d.id}: 길이 ${T.length | 0}m, 위아래로 겹치는 지점 ${stacked}쌍, 최소 높이차 ${stacked ? minDy.toFixed(1) : '-'}m, 너무 낮음 ${bad}${ex.length ? ' → ' + ex.join(', ') : ''}  ${T.warn.join(';')}`);
}

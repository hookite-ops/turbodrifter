// 트랙 검증: 길이·최소 반지름·겹침 + AI가 같은 물리로 실제 주행한 랩타임
import fs from 'fs';
import { TRACKS, buildTrack, gridSlot } from '../public/js/tracks.js';
import { createKart, placeKart, stepKart, createBot, botInput, C, startBoost } from '../public/js/physics.js';
const out = [];
const only = process.argv[2];
for (const def of TRACKS) {
  if (only && def.id !== only) continue;
  const T = buildTrack(def);
  let minR = 1e9, minAt = 0, sharp = 0, straight = 0;
  for (let i = 0; i < T.n; i++) { const r = 1 / Math.max(1e-6, Math.abs(T.curv[i])); if (r < minR) { minR = r; minAt = i; } if (r < 45) sharp++; if (r > 250) straight++; }
  // 겹침: 떨어진 구간끼리 벽이 닿는지
  let overlaps = 0, minGap = 1e9;
  for (let i = 0; i < T.n; i += 2) for (let j = i + 40; j < T.n; j += 2) {
    if (T.n - j + i < 40) continue;
    const d = Math.hypot(T.x[i] - T.x[j], T.z[i] - T.z[j]);
    if (Math.abs(T.y[i] - T.y[j]) > 6) continue;
    const gap = d - T.hw[i] - T.hw[j];
    if (gap < minGap) minGap = gap;
    if (gap < 3) overlaps++;
  }
  let maxSlope = 0; for (let i = 0; i < T.n; i++) maxSlope = Math.max(maxSlope, Math.abs(T.slope[i]));
  const res = { id: def.id, name: def.name, length: Math.round(T.length), minR: +minR.toFixed(1), minAtFrac: +(minAt / T.n).toFixed(2), sharpPct: Math.round(sharp / T.n * 100), straightPct: Math.round(straight / T.n * 100), minGap: +minGap.toFixed(1), overlaps, maxSlope: +maxSlope.toFixed(3), runs: [] };
  for (const rule of [{ infinite: false }, { infinite: true }]) for (const skill of [0.55, 0.95]) {
    const k = createKart(), b = createBot(skill, skill < 0.9 ? 0.13 : 0); b.lane = 0; b.useShort = process.env.SHORT === '1' && skill > 0.9;
    placeKart(k, T, gridSlot(T, 0)); k.lap = -1;
    let scT = 0, inner = 0, outer = 0, bumps = 0, jumps = 0, wet = 0, lands = []; let t = 0, laps = [], last = 0, drifts = 0, hits = 0, boosts = 0, insts = 0, maxV = 0, path = [];
    const dt = 1 / 60;
    while (t < 400 && laps.length < 3) {
      const inp = botInput(b, k, T, dt, t);
      stepKart(k, inp, dt, T, { ...rule, time: t });
      t += dt;
      if (k.ev.driftStart) drifts++; if (k.ev.hit) { hits++; const c = T.curv[k.ti]; if (Math.abs(c) > 0.008) { if (Math.sign(c) === Math.sign(k.lat)) inner++; else outer++; } } if (k.ev.boost) boosts++; if (k.ev.bump) bumps++; if (k.ev.jump) jumps++; if (k.ev.land && lands.length < 4) lands.push(Math.round(k.s)); if (k.surf === 2) wet += dt; if (k.sc) scT += dt; if (k.ev.inst) insts++;
      maxV = Math.max(maxV, k.speed);
      if (k.ev.lap !== undefined && k.ev.lap >= 1) { laps.push(+(t - last).toFixed(1)); last = t; } else if (k.ev.lap === 0) last = t;
      if (skill > 0.9 && !rule.infinite && laps.length === 1 && Math.round(t * 60) % 6 === 0) path.push([+k.x.toFixed(1), +k.z.toFixed(1), k.drifting ? 1 : 0, k.boostT > 0 ? 1 : 0]);
    }
    res.runs.push({ inf: rule.infinite, skill, scT: +scT.toFixed(1), laps, inner, outer, bumps, jumps, wet: +wet.toFixed(1), lands, drifts, hits, boosts, insts, maxKmh: Math.round(maxV * 6.6) });
    if (path.length) res.path = path;
  }
  res.center = Array.from({ length: T.n }, (_, i) => [+T.x[i].toFixed(1), +T.z[i].toFixed(1), +T.y[i].toFixed(1), +T.hw[i].toFixed(1), +T.nx[i].toFixed(3), +T.nz[i].toFixed(3)]);
  res.pads = T.pads.map(p => [p.i, p.lat]);
  res.obs = T.obs.map(o => [o.i, o.lat, o.r, o.kind]);
  res.zones = T.zones.map(z => [z.i, z.cnt, z.kind]);
  res.jumps = T.jumps.map(j => [j.i, j.cnt]);
  res.ds = T.ds;
  out.push(res);
  const { center, path, ...show } = res; console.log(JSON.stringify(show));
}
fs.mkdirSync('tools/out', { recursive: true });
fs.writeFileSync('tools/out/check.json', JSON.stringify(out));

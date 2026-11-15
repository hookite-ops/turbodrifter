// 트랙 데이터와 스플라인 계산 (three.js 없이 순수 계산 — 서버 테스트에서도 사용)
// 좌표: 미터. 점 = [x, z, 높이(y), 반폭]

// 꼭짓점 = [x, z, 코너 반지름, 높이]. 직선 + 원호(코너)로 이어 붙인다 — 직선(부스터) → 코너(드리프트) 리듬.
const sc = (pts, k) => pts.map(p => [p[0] * k, p[1] * k, (p[2] || 0) * k, p[3] || 0, p[4]]);
export const TRACKS = [
  {
    id: 'village', name: '새싹 마을 순환로', theme: 'village', level: '★☆☆', laps: 3,
    desc: '나무 다리를 지나 개울을 점프로 넘고, 풍차 섬을 왼쪽·오른쪽 중 골라 지나는 입문 코스.',
    hw: 10,
    // [x, z, 코너 반지름, 높이, 반폭]
    pts: [
      [0, -130, 34, 0, 11], [0, 150, 36, 0, 10.5], [65, 187.5, 0, 2, 7.6], [130, 225, 34, 4, 9.5],
      [235, 150, 32, 8, 9.5], [195, 45, 28, 1.5, 10], [255, -40, 28, 0, 10], [235, -102.5, 0, 0, 16.5],
      [215, -165, 34, 0, 10.5], [85, -195, 36, 0, 10],
    ],
    pads: [0.02, { at: { e: 7, t: 0.42 }, lat: -8.5 }, { at: { e: 8, t: 0.86 }, lat: 0 }],
    zones: [
      { from: { e: 1, t: 0.42 }, to: { e: 2, t: 0.58 }, kind: 'tunnel', style: 'barn' },
      { from: { e: 4, t: 0.44 }, to: { e: 4, t: 0.82 }, kind: 'water', style: 'stream' },
    ],
    jumps: [{ at: { e: 4, t: 0.25 }, len: 11, rise: 2.0 }],
    obs: [
      { at: { c: 7, t: 0 }, lat: 0, r: 4.6, kind: 'island' },
      // 짚더미 시케인 (좌우로 번갈아 막는다)
      { at: { e: 8, t: 0.22 }, lat: -7.2, r: 1.9, kind: 'hay', soft: true }, { at: { e: 8, t: 0.22 }, lat: -3.6, r: 1.9, kind: 'hay', soft: true },
      { at: { e: 8, t: 0.44 }, lat: 7.2, r: 1.9, kind: 'hay', soft: true }, { at: { e: 8, t: 0.44 }, lat: 3.6, r: 1.9, kind: 'hay', soft: true },
      { at: { e: 8, t: 0.66 }, lat: -7.2, r: 1.9, kind: 'hay', soft: true }, { at: { e: 8, t: 0.66 }, lat: -3.6, r: 1.9, kind: 'hay', soft: true },
    ],
  },
  {
    id: 'canyon', name: '모래바람 협곡', theme: 'desert', level: '★★☆', laps: 3,
    desc: '절벽 사이 바늘길에서 회전초를 피하고, 광산 터널로 고개를 넘어 내리막 큰 점프.',
    hw: 9,
    pts: [
      [0, -25, 0, 0, 9.5], [0, 140, 26, 0, 9.5], [75, 215, 24, 2], [170, 190, 22, 6], [165, 105, 20, 9], [85, 70, 20, 9],
      [105, -15, 22, 5], [215, 5, 24, 3], [270, 95, 22, 7], [355, 70, 22, 14, 9.5], [370, -55, 26, 18, 10],
      [290, -125, 24, 11, 10], [185, -115, 22, 3], [125, -215, 24, 0], [35, -235, 26, 0], [0, -170, 28, 0, 8.5],
      [0, -130, 0, 0, 6.4], [0, -75, 0, 0, 6.4],
    ],
    pads: [0.02, { at: { e: 8, t: 0.45 }, lat: 0 }, { at: { e: 12, t: 0.5 }, lat: 3 }],
    zones: [
      { from: { e: 9, t: 0.5 }, to: { e: 10, t: 0.3 }, kind: 'tunnel', style: 'mine' },
      { from: { e: 9, t: 0.35 }, to: { e: 10, t: 0.45 }, kind: 'cliff', amt: 0.9 },
      { from: { e: 12, t: 0.1 }, to: { e: 17, t: 0.9 }, kind: 'cliff' },
      { from: { e: 3, t: 0.2 }, to: { e: 5, t: 0.6 }, kind: 'cliff', amt: 0.6 },
    ],
    jumps: [{ at: { e: 11, t: 0.18 }, len: 12, rise: 2.4 }],
    obs: [
      { at: { e: 6, t: 0.55 }, lat: 4.5, r: 1.7, kind: 'rock' },
      { at: { e: 13, t: 0.45 }, lat: -4, r: 1.8, kind: 'rock' }, { at: { e: 13, t: 0.5 }, lat: -6.8, r: 1.3, kind: 'rock' },
    ],
    movers: [
      { kind: 'cross', model: 'tumbleweed', at: { e: 16, t: 0.15 }, a: 5.2, period: 3.4, phase: 0, r: 1.1 },
      { kind: 'cross', model: 'tumbleweed', at: { e: 16, t: 0.55 }, a: 5.2, period: 2.7, phase: 0.4, r: 1.1 },
      { kind: 'cross', model: 'tumbleweed', at: { e: 16, t: 0.95 }, a: 5.2, period: 3.9, phase: 0.75, r: 1.1 },
      { kind: 'cross', model: 'tumbleweed', at: { e: 1, t: 0.4 }, a: 7.5, period: 4.6, phase: 0.2, r: 1.1 },
    ],
  },
  {
    id: 'lake', name: '얼음 호수 8자 다리', theme: 'ice', level: '★★☆', laps: 3,
    desc: '다리 꼭대기에서 점프하고, 얼어붙은 호수 위 빙판을 길게 미끄러진다. 펭귄 조심!',
    hw: 9.5,
    pts: sc([
      [260, 60, 36, 0], [260, -60, 36, 0], [150, -150, 36, 2], [0, 0, 0, 9.5], [-150, 150, 36, 2],
      [-260, 60, 36, 0, 10.5], [-260, -60, 36, 0, 10.5], [-150, -150, 36, 0, 11], [0, 0, 0, 0, 13], [150, 150, 36, 0, 11],
    ], 0.72),
    pads: [{ at: { e: 2, t: 0.35 }, lat: 0 }, { at: { e: 7, t: 0.08 }, lat: 0 }],
    zones: [
      { from: { e: 7, t: 0.12 }, to: { e: 8, t: 0.88 }, kind: 'ice' },
      { from: { c: 5, t: 0.25 }, to: { c: 6, t: 0.75 }, kind: 'tunnel', style: 'icecave' },
      { from: { c: 5, t: 0.0 }, to: { c: 6, t: 1.0 }, kind: 'cliff', amt: 0.5 },
    ],
    jumps: [{ at: { e: 2, t: 0.8 }, len: 10, rise: 1.6 }],
    obs: [],
    movers: [
      { kind: 'cross', model: 'penguin', at: { e: 8, t: 0.35 }, a: 10, period: 5.2, phase: 0, r: 1.0 },
      { kind: 'cross', model: 'penguin', at: { e: 8, t: 0.62 }, a: 10, period: 4.4, phase: 0.5, r: 1.0 },
      { kind: 'cross', model: 'penguin', at: { e: 4, t: 0.5 }, a: 7, period: 3.6, phase: 0.25, r: 1.0 },
    ],
  },
  {
    id: 'neon', name: '네온 시티 하이웨이', theme: 'city', level: '★★★', laps: 2,
    desc: '긴 직선과 직각 코너, 연속 시케인. 부스터를 아끼지 말 것.',
    hw: 9.5,
    pts: sc([
      [0, -220, 27], [0, 220, 27], [120, 220, 25], [120, 120, 24], [240, 120, 24], [240, 240, 25],
      [400, 240, 28], [400, 60, 26], [300, 60, 24], [300, -40, 24], [420, -40, 25], [420, -220, 28],
      [260, -220, 26], [260, -120, 24], [140, -120, 24], [140, -220, 25],
    ], 0.82),
    pads: [0.03, 0.4, 0.66],
  },
];

// 꼭짓점 다각형을 직선+원호로 바꿔 약 2m 간격으로 고르게 샘플링
// 꼭짓점 = [x, z, 코너 반지름, 높이, 반폭]. 장치 위치는 {e: 변 번호, t: 0~1} 또는 {c: 코너 번호, t: 0~1}로 적는다.
export function buildTrack(def, step = 2) {
  const V = def.pts.map(p => ({ x: p[0], z: p[1], r: p[2] || 0, y: p[3] || 0, w: p[4] || def.hw || 9 }));
  const n = V.length;
  const warn = [];
  // 각 꼭짓점의 진입·이탈 방향과 접선 길이
  for (let i = 0; i < n; i++) {
    const a = V[(i + n - 1) % n], b = V[i], c = V[(i + 1) % n];
    let ix = b.x - a.x, iz = b.z - a.z; const il = Math.hypot(ix, iz); ix /= il; iz /= il;
    let ox = c.x - b.x, oz = c.z - b.z; const ol = Math.hypot(ox, oz); ox /= ol; oz /= ol;
    const cross = ix * oz - iz * ox, dot = ix * ox + iz * oz;
    const th = Math.atan2(cross, dot); // 회전각 (부호 있음)
    b.ix = ix; b.iz = iz; b.ox = ox; b.oz = oz; b.th = th; b.il = il; b.ol = ol;
    b.t = Math.abs(th) < 0.02 || !b.r ? 0 : b.r * Math.tan(Math.abs(th) / 2);
  }
  for (let i = 0; i < n; i++) { // 접선 길이가 변보다 길면 반지름 줄이기
    const b = V[i], c = V[(i + 1) % n];
    if (b.t + c.t > b.ol * 0.98) {
      const k = b.ol * 0.98 / (b.t + c.t); warn.push(`코너 ${i}/${(i + 1) % n} 반지름 축소 x${k.toFixed(2)}`);
      b.t *= k; b.r *= k; c.t *= k; c.r *= k;
    }
  }
  const fine = [];
  const marks = [];            // {idx(fine), y, w}
  const eR = [], cR = [];      // 변·코너의 fine 인덱스 범위
  const startMid = () => { const b = V[0], c = V[1]; const d0 = b.t, d1 = b.ol - c.t; return (d0 + d1) / 2; };
  const push = (x, z) => fine.push([x, z]);
  const line = (x0, z0, x1, z1) => { const l = Math.hypot(x1 - x0, z1 - z0), m = Math.max(1, Math.ceil(l / 0.5)); for (let j = 0; j < m; j++) push(x0 + (x1 - x0) * j / m, z0 + (z1 - z0) * j / m); };
  const mid = startMid();
  let cx = V[0].x + V[0].ox * mid, cz = V[0].z + V[0].oz * mid;
  for (let q = 1; q <= n; q++) {
    const b = V[q % n];
    const ex = b.x - b.ix * b.t, ez = b.z - b.iz * b.t;
    const f0 = fine.length; line(cx, cz, ex, ez); eR[q - 1] = [f0, fine.length];
    const c0 = fine.length;
    if (b.t > 0) {
      const sgn = Math.sign(b.th), r = b.t / Math.tan(Math.abs(b.th) / 2);
      const lx = -b.iz * sgn, lz = b.ix * sgn;   // 원호 중심: 진입점에서 회전 방향 쪽 법선으로 r
      const ox = ex + lx * r, oz = ez + lz * r;
      const a0 = Math.atan2(ez - oz, ex - ox), m = Math.max(2, Math.ceil(r * Math.abs(b.th) / 0.5));
      marks.push({ idx: fine.length + Math.floor(m / 2), y: b.y, w: b.w });
      for (let j = 0; j < m; j++) { const a = a0 + b.th * j / m; push(ox + Math.cos(a) * r, oz + Math.sin(a) * r); }
      cx = b.x + b.ox * b.t; cz = b.z + b.oz * b.t;
    } else { marks.push({ idx: fine.length, y: b.y, w: b.w }); cx = b.x; cz = b.z; }
    cR[q % n] = [c0, Math.max(c0 + 1, fine.length)];
  }
  const fLast = fine.length;
  { const b = V[0]; line(cx, cz, b.x + b.ox * mid, b.z + b.oz * mid); }
  const m = fine.length, cum = [0];
  for (let i = 0; i < m; i++) { const a = fine[i], b = fine[(i + 1) % m]; cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const total = cum[m];
  // 높이·폭: 기준점 사이를 거리 기준으로 부드럽게 보간
  marks.sort((a, b) => a.idx - b.idx);
  const lerpMark = (d, key) => {
    const K = marks.length;
    for (let q = 0; q < K; q++) {
      const A = marks[q], B = marks[(q + 1) % K];
      let da = cum[A.idx], db = cum[B.idx]; if (q === K - 1) db += total;
      let dd = d; if (dd < da) dd += total;
      if (dd >= da && dd <= db) { const t = (dd - da) / Math.max(1e-6, db - da); const e = t * t * (3 - 2 * t); return A[key] + (B[key] - A[key]) * e; }
    }
    return marks[0][key];
  };
  const N = Math.round(total / step);
  const ds = total / N;
  const T = {
    def, id: def.id, n: N, ds, length: total, warn,
    x: new Float32Array(N), z: new Float32Array(N), y: new Float32Array(N), hw: new Float32Array(N),
    tx: new Float32Array(N), tz: new Float32Array(N), nx: new Float32Array(N), nz: new Float32Array(N),
    curv: new Float32Array(N), slope: new Float32Array(N),
    surf: new Uint8Array(N),        // 0 도로, 1 빙판, 2 물
    tunnel: new Uint8Array(N),      // 1 = 터널 안
    cliff: new Float32Array(N),     // 0~1 절벽 지형 세기
    ramp: new Uint8Array(N),        // 1 = 점프대 위
  };
  let k = 0;
  for (let i = 0; i < N; i++) {
    const d = i * ds;
    while (k < m - 1 && cum[k + 1] < d) k++;
    const a = fine[k], b = fine[(k + 1) % m];
    const t = (d - cum[k]) / Math.max(1e-6, cum[k + 1] - cum[k]);
    T.x[i] = a[0] + (b[0] - a[0]) * t; T.z[i] = a[1] + (b[1] - a[1]) * t;
    T.y[i] = lerpMark(d, 'y'); T.hw[i] = lerpMark(d, 'w');
  }
  // 직선→코너 이음매를 살짝 다듬기 (완화 곡선 효과)
  for (let pass = 0; pass < 6; pass++) {
    const X = T.x.slice(), Z = T.z.slice();
    for (let i = 0; i < N; i++) { const p = (i + N - 1) % N, q = (i + 1) % N; T.x[i] = X[i] * 0.5 + (X[p] + X[q]) * 0.25; T.z[i] = Z[i] * 0.5 + (Z[p] + Z[q]) * 0.25; }
  }

  // ----- 장치 위치 계산 -----
  const dOf = (spec) => {                       // 위치 지정 → 트랙 거리
    if (typeof spec === 'number') return spec * total;
    if (spec.e !== undefined) {
      let d0, d1;
      if (spec.e === 0) { d0 = cum[fLast] - total; d1 = cum[eR[0][1]]; } else { d0 = cum[eR[spec.e][0]]; d1 = cum[eR[spec.e][1]]; }
      return d0 + (d1 - d0) * spec.t + (spec.m || 0);
    }
    const r = cR[spec.c]; return cum[r[0]] + (cum[r[1]] - cum[r[0]]) * spec.t + (spec.m || 0);
  };
  const iOf = spec => ((Math.round(dOf(spec) / ds) % N) + N) % N;
  T.iOf = iOf;
  T.info = { edges: eR.map((r, e) => Math.round(e === 0 ? cum[eR[0][1]] + total - cum[fLast] : cum[r[1]] - cum[r[0]])), corners: cR.map(r => Math.round(cum[r[1]] - cum[r[0]])) };
  const range = (z) => { const i0 = iOf(z.from), i1 = iOf(z.to); return [i0, ((i1 - i0) % N + N) % N]; };

  // 점프대: 쐐기 모양으로 올라갔다가 뚝 떨어진다
  T.jumps = (def.jumps || []).map(j => {
    const i0 = iOf(j.at), cnt = Math.max(3, Math.round((j.len || 12) / ds));
    for (let q = 0; q <= cnt; q++) { const i = (i0 + q) % N; T.y[i] += (j.rise || 2.4) * Math.pow(q / cnt, 1.25); T.ramp[i] = 1; }
    return { i: i0, cnt, lip: (i0 + cnt) % N };
  });
  // 구역: 빙판·물·터널·절벽
  T.zones = (def.zones || []).map(z => {
    const [i0, cnt] = range(z);
    for (let q = 0; q <= cnt; q++) {
      const i = (i0 + q) % N;
      if (z.kind === 'ice') T.surf[i] = 1; else if (z.kind === 'water') T.surf[i] = 2;
      else if (z.kind === 'tunnel') T.tunnel[i] = 1;
      else if (z.kind === 'cliff') T.cliff[i] = Math.max(T.cliff[i], Math.min(1, q / 10, (cnt - q) / 10) * (z.amt || 1));
    }
    return { kind: z.kind, i: i0, cnt, style: z.style || '' };
  });

  for (let i = 0; i < N; i++) {
    const p = (i + N - 1) % N, q = (i + 1) % N;
    let dx = T.x[q] - T.x[p], dz = T.z[q] - T.z[p];
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    T.tx[i] = dx; T.tz[i] = dz; T.nx[i] = dz; T.nz[i] = -dx; // n = 왼쪽
    T.slope[i] = (T.y[q] - T.y[p]) / l;
  }
  for (let i = 0; i < N; i++) {
    const p = (i + N - 2) % N, q = (i + 2) % N;
    const a1 = Math.atan2(T.tx[p], T.tz[p]), a2 = Math.atan2(T.tx[q], T.tz[q]);
    let da = a2 - a1; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    T.curv[i] = da / (4 * ds); // + = 왼쪽으로 굽음
  }
  // 부스터 발판 (좌우 위치 지정 가능), 고정 장애물, 움직이는 장애물
  T.pads = (def.pads || []).map(p => { const o = (typeof p === 'number' || p.e !== undefined || p.c !== undefined) && p.lat === undefined ? { at: p } : p; return { i: iOf(o.at), lat: o.lat || 0, len: 5 }; });
  T.obs = (def.obs || []).map(o => { const i = iOf(o.at); return { i, s: i * ds, lat: o.lat || 0, r: o.r || 1.2, kind: o.kind || 'cone', soft: !!o.soft }; });
  T.movers = [];
  for (const mv of (def.movers || [])) {
    if (mv.kind === 'traffic') {
      const [i0, cnt] = range(mv), len = cnt * ds;
      for (let q = 0; q < mv.count; q++) for (const lat of mv.lanes) T.movers.push({ type: 'traffic', model: mv.model, s0: i0 * ds, len, off: (q + (lat > 0 ? 0.5 : 0)) * len / mv.count, speed: mv.speed, lat, r: mv.r || 1.6 });
    } else {
      const i = iOf(mv.at);
      T.movers.push({ type: 'cross', model: mv.model, s: i * ds, i, a: mv.a, period: mv.period, phase: mv.phase || 0, r: mv.r || 1.1, soft: true });
    }
  }
  return T;
}

// 움직이는 장애물의 현재 위치 (경기 시간으로 정해지므로 모든 플레이어에게 같다)
export function moverAt(T, m, time, out = {}) {
  if (m.type === 'traffic') { out.s = (m.s0 + (m.off + m.speed * Math.max(0, time)) % m.len) % T.length; out.lat = m.lat; out.edge = Math.min(1, ((m.off + m.speed * Math.max(0, time)) % m.len) / 8, (m.len - (m.off + m.speed * Math.max(0, time)) % m.len) / 8); }
  else { const u = ((Math.max(0, time) / m.period + m.phase) % 1 + 1) % 1; out.s = m.s; out.lat = m.a * (u < 0.5 ? 4 * u - 1 : 3 - 4 * u); out.dir = u < 0.5 ? 1 : -1; out.edge = 1; }
  return out;
}

// 현재 위치를 트랙 좌표로: {i, s(진행 거리), lat(왼쪽 +), y, hw}
export function locate(T, x, z, hint, win = 14, out) {
  const N = T.n;
  let best = 1e18, bi = hint, bt = 0;
  for (let o = -win; o <= win; o++) {
    const i = ((hint + o) % N + N) % N, j = (i + 1) % N;
    const ax = T.x[i], az = T.z[i], bx = T.x[j] - ax, bz = T.z[j] - az;
    const l2 = bx * bx + bz * bz;
    let t = ((x - ax) * bx + (z - az) * bz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = x - (ax + bx * t), dz = z - (az + bz * t);
    const d = dx * dx + dz * dz;
    if (d < best) { best = d; bi = i; bt = t; }
  }
  const j = (bi + 1) % N;
  const cx = T.x[bi] + (T.x[j] - T.x[bi]) * bt, cz = T.z[bi] + (T.z[j] - T.z[bi]) * bt;
  const nx = T.nx[bi] + (T.nx[j] - T.nx[bi]) * bt, nz = T.nz[bi] + (T.nz[j] - T.nz[bi]) * bt;
  const o = out || {};
  o.i = bi; o.t = bt; o.s = (bi + bt) * T.ds;
  o.lat = (x - cx) * nx + (z - cz) * nz;
  o.y = T.y[bi] + (T.y[j] - T.y[bi]) * bt;
  o.hw = T.hw[bi] + (T.hw[j] - T.hw[bi]) * bt;
  o.cx = cx; o.cz = cz; o.nx = nx; o.nz = nz;
  o.tx = T.tx[bi]; o.tz = T.tz[bi]; o.slope = T.slope[bi];
  return o;
}

// 진행 거리 s, 좌우 lat 위치의 월드 좌표
export function pointAt(T, s, lat = 0) {
  const N = T.n; let f = (s / T.ds) % N; if (f < 0) f += N;
  const i = Math.floor(f) % N, j = (i + 1) % N, t = f - Math.floor(f);
  const nx = T.nx[i] + (T.nx[j] - T.nx[i]) * t, nz = T.nz[i] + (T.nz[j] - T.nz[i]) * t;
  return {
    x: T.x[i] + (T.x[j] - T.x[i]) * t + nx * lat, z: T.z[i] + (T.z[j] - T.z[i]) * t + nz * lat,
    y: T.y[i] + (T.y[j] - T.y[i]) * t, h: Math.atan2(T.tx[i], T.tz[i]), i,
  };
}

// 출발 그리드: slot 0이 맨 앞
export function gridSlot(T, slot) {
  const row = Math.floor(slot / 2), side = slot % 2 ? -1 : 1;
  return pointAt(T, T.length - 8 - row * 6.5 - (slot % 2) * 2, side * 3.4);
}

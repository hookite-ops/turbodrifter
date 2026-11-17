// 트랙 데이터와 스플라인 계산 (three.js 없이 순수 계산 — 서버 테스트에서도 사용)
// 좌표: 미터. 점 = [x, z, 높이(y), 반폭]

// 꼭짓점 = [x, z, 코너 반지름, 높이]. 직선 + 원호(코너)로 이어 붙인다 — 직선(부스터) → 코너(드리프트) 리듬.
const sc = (pts, k) => pts.map(p => [p[0] * k, p[1] * k, (p[2] || 0) * k, p[3] || 0, p[4]]);
// 설계 좌표는 '위에서 본 그림' 기준(왼쪽이 −x)으로 적고 vw()로 게임 좌표로 바꾼다
const vw = pts => pts.map(p => [-p[0], p[1], p[2], p[3], p[4]]);
// 도로 폭 기준: 반폭 7m(카트 6대 폭). 직각 코너 반지름 15~18m, 헤어핀 14m → 드리프트 없이는 못 돈다.
export const TRACKS = [
  {
    id: 'village', name: '새싹 마을 한 바퀴', theme: 'village', level: '★☆☆', laps: 3,
    desc: '직각 코너에서 드리프트를 익히는 마을길. 나무 다리, 풍차 로터리, 개울 점프.',
    hw: 7,
    pts: vw([
      [0, -105, 18, 0, 8.5], [0, 130, 18, 0, 8.5], [-130, 130, 16, 2], [-130, 50, 15, 4], [-240, 50, 16, 7],
      [-240, -35, 0, 7, 12], [-240, -120, 30, 6], [-180, -180, 30, 3], [-48, -180, 15, 0], [-48, -105, 15, 0],
    ]),
    pads: [{ at: { e: 0, t: 0.56 }, lat: 0 }, { at: { e: 7, t: 0.0 }, lat: 0 }],
    zones: [
      { from: { e: 1, t: 0.2 }, to: { e: 1, t: 0.85 }, kind: 'tunnel', style: 'barn' },
      { from: { e: 7, t: 0.3 }, to: { e: 7, t: 0.47 }, kind: 'water', style: 'stream' },
    ],
    jumps: [{ at: { e: 7, t: 0.1 }, len: 10, rise: 2.0 }],
    obs: [
      { at: { c: 5, t: 0 }, lat: 0, r: 4.2, kind: 'island' },
      { at: { e: 3, t: 0.28 }, lat: -4.7, r: 1.5, kind: 'hay', soft: true }, { at: { e: 3, t: 0.28 }, lat: -1.6, r: 1.5, kind: 'hay', soft: true },
      { at: { e: 3, t: 0.72 }, lat: 4.7, r: 1.5, kind: 'hay', soft: true }, { at: { e: 3, t: 0.72 }, lat: 1.6, r: 1.5, kind: 'hay', soft: true },
    ],
  },
  {
    id: 'canyon', name: '모래바람 협곡 다운힐', theme: 'desert', level: '★★☆', laps: 3,
    desc: '광산 터널로 정상에 올라 크게 점프한 뒤, 헤어핀이 연달아 나오는 내리막을 내려온다.',
    hw: 7,
    pts: vw([
      [0, -160, 20, 0, 8], [0, 60, 20, 3, 8], [120, 60, 18, 8], [120, 200, 18, 16], [-150, 200, 14, 11],
      [-150, 172, 14, 10.5], [-40, 172, 14, 8.5], [-40, 144, 14, 8], [-150, 144, 14, 6], [-150, 116, 14, 5.5],
      [-40, 116, 15, 3.5], [-40, -20, 0, 1, 5.4], [-40, -160, 20, 0],
    ]),
    pads: [{ at: { e: 0, t: 0.56 }, lat: 0 }, { at: { e: 3, t: 0.3 }, lat: 2.5 }, { at: { e: 3, t: 0.5 }, lat: -2.5 }],
    zones: [
      { from: { e: 2, t: 0.15 }, to: { e: 2, t: 0.85 }, kind: 'tunnel', style: 'mine' },
      { from: { e: 2, t: 0.0 }, to: { e: 2, t: 1.0 }, kind: 'cliff', amt: 0.9 },
      { from: { e: 4, t: 0 }, to: { e: 9, t: 1 }, kind: 'cliff', amt: 0.22 },
      { from: { e: 10, t: 0.12 }, to: { e: 11, t: 0.9 }, kind: 'cliff' },
    ],
    jumps: [{ at: { e: 3, t: 0.07 }, len: 12, rise: 2.4 }],
    obs: [
      { at: { e: 5, t: 0.5 }, lat: 3.4, r: 1.4, kind: 'rock' }, { at: { e: 9, t: 0.5 }, lat: -3.4, r: 1.4, kind: 'rock' },
    ],
    movers: [
      { kind: 'cross', model: 'tumbleweed', at: { e: 10, t: 0.75 }, a: 3.6, period: 3.2, phase: 0, r: 1.0 },
      { kind: 'cross', model: 'tumbleweed', at: { e: 11, t: 0.3 }, a: 3.6, period: 2.6, phase: 0.4, r: 1.0 },
      { kind: 'cross', model: 'tumbleweed', at: { e: 11, t: 0.75 }, a: 4.4, period: 3.8, phase: 0.75, r: 1.0 },
    ],
  },
  {
    id: 'lake', name: '얼음 호수 8자 다리', theme: 'ice', level: '★★☆', laps: 3,
    desc: '다리 꼭대기에서 점프하고, 얼어붙은 호수 위 빙판을 길게 미끄러진다. 펭귄 조심!',
    hw: 7.5,
    pts: sc([
      [260, 60, 30, 0], [260, -60, 30, 0], [150, -150, 30, 2], [0, 0, 0, 9.5], [-150, 150, 30, 2],
      [-260, 60, 30, 0, 8], [-260, -60, 30, 0, 8], [-150, -150, 30, 0, 9], [0, 0, 0, 0, 10.5], [150, 150, 30, 0, 9],
    ], 0.72),
    pads: [{ at: { e: 2, t: 0.35 }, lat: 0 }, { at: { e: 7, t: 0.08 }, lat: 0 }],
    zones: [
      { from: { e: 7, t: 0.12 }, to: { e: 8, t: 0.88 }, kind: 'ice' },
      { from: { c: 5, t: 0.25 }, to: { c: 6, t: 0.75 }, kind: 'tunnel', style: 'icecave' },
      { from: { c: 5, t: 0.0 }, to: { c: 6, t: 1.0 }, kind: 'cliff', amt: 0.5 },
    ],
    jumps: [{ at: { e: 2, t: 0.8 }, len: 10, rise: 1.6 }],
    obs: [],
    // 지름길: 서쪽 고리 안쪽 얼어붙은 연못을 가로지른다 (빙판이라 미끄럽다)
    shortcuts: [{ from: { e: 4, t: 0.55 }, to: { e: 6, t: 0.45 }, hw: 4.2, surf: 'ice', kind: 'ice',
      pts: [[-158, 40, 14], [-161, -40, 14]],
      obs: [{ at: 0.5, lat: 1.5, r: 1.1, kind: 'rock' }] }],
    movers: [
      { kind: 'cross', model: 'penguin', at: { e: 8, t: 0.35 }, a: 7.5, period: 5.2, phase: 0, r: 1.0 },
      { kind: 'cross', model: 'penguin', at: { e: 8, t: 0.62 }, a: 7.5, period: 4.4, phase: 0.5, r: 1.0 },
      { kind: 'cross', model: 'penguin', at: { e: 4, t: 0.5 }, a: 5, period: 3.6, phase: 0.25, r: 1.0 },
    ],
  },
  {
    id: 'neon', name: '네온 시티 하이웨이', theme: 'city', level: '★★★', laps: 2,
    desc: '차들이 달리는 하이웨이를 비집고, 직각 코너가 연달아 나오는 도심 블록을 꿰뚫는다.',
    hw: 7.2,
    pts: sc([
      [0, -220, 22, 0, 10.5], [0, 220, 22, 0, 10.5], [120, 220, 21, 0], [120, 120, 20, 0], [240, 120, 20, 0], [240, 240, 21, 0], [400, 240, 23, 0],
      [400, 60, 22, 0], [300, 60, 20, 2], [300, -40, 20, 5], [420, -40, 21, 10], [420, -220, 23, 10, 8], [260, -220, 22, 4],
      [260, -120, 20, 0, 6.4], [140, -120, 20, 0, 6.4], [140, -220, 21, 0, 7],
    ], 0.82),
    pads: [{ at: { e: 4, t: 0.5 }, lat: 0 }, { at: { e: 11, t: 0.3 }, lat: 2.6 }, { at: { e: 11, t: 0.55 }, lat: -2.6 }],
    zones: [
      { from: { e: 6, t: 0.12 }, to: { e: 6, t: 0.88 }, kind: 'tunnel', style: 'neon' },
    ],
    jumps: [{ at: { e: 10, t: 0.42 }, len: 11, rise: 2.2 }],
    obs: [
      { at: { e: 14, t: 0.3 }, lat: 3.6, r: 0.9, kind: 'cone', soft: true }, { at: { e: 14, t: 0.3 }, lat: 1.8, r: 0.9, kind: 'cone', soft: true },
      { at: { e: 14, t: 0.6 }, lat: -3.6, r: 0.9, kind: 'cone', soft: true }, { at: { e: 14, t: 0.6 }, lat: -1.8, r: 0.9, kind: 'cone', soft: true },
    ],
    // 지름길: 직각 코너를 꺾지 않고 곧장 뒷골목으로 — 지그재그라 드리프트를 잘 끊어야 이득
    shortcuts: [{ from: { e: 11, t: 0.86 }, to: { e: 15, t: 0.2 }, hw: 4.2, kind: 'alley',
      pts: [[186, -178, 8], [168, -197, 8], [149, -167, 8], [130, -192, 8]],
      obs: [{ at: 0.5, lat: 2.1, r: 0.9, kind: 'cone', soft: true }],
      pads: [{ at: 0.84, lat: 0 }] }],
    movers: [
      { kind: 'traffic', model: 'car', from: { e: 0, t: 0.64 }, to: { e: 0, t: 0.97 }, lanes: [4.6, -4.6], count: 2, speed: 17, r: 1.9 },
      { kind: 'traffic', model: 'car', from: { e: 0, t: 0.04 }, to: { e: 0, t: 0.38 }, lanes: [4.6, -4.6], count: 2, speed: 17, r: 1.9 },
      { kind: 'traffic', model: 'car', from: { e: 6, t: 0.05 }, to: { e: 6, t: 0.95 }, lanes: [-3.4], count: 2, speed: 14, r: 1.9 },
    ],
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
  T.shortcuts = (def.shortcuts || []).map((sd, k) => buildShortcut(T, sd, k));
  return T;
}

// ----- 지름길: 본 트랙 두 지점을 잇는 좁은 샛길 (열린 경로) -----
// sd = {from, to, pts:[[x,z,반지름,높이?],...], hw, obs:[{at(0~1), lat, r, kind}], pads:[{at, lat}], jumps:[{at, len, rise}]}
function buildShortcut(T, sd, k) {
  const iA = T.iOf(sd.from), iB = T.iOf(sd.to), hw = sd.hw || 4.5;
  const V = [{ x: T.x[iA], z: T.z[iA], y: T.y[iA], r: 0 }, ...sd.pts.map(p => ({ x: p[0], z: p[1], r: p[2] || 0, y: p[3] })), { x: T.x[iB], z: T.z[iB], y: T.y[iB], r: 0 }];
  // 높이가 비어 있는 꼭짓점은 앞뒤를 거리 비율로 채운다
  const dv = [0]; for (let q = 1; q < V.length; q++) dv.push(dv[q - 1] + Math.hypot(V[q].x - V[q - 1].x, V[q].z - V[q - 1].z));
  for (let q = 1; q < V.length - 1; q++) if (V[q].y === undefined) {
    let a = q - 1, b = q + 1; while (V[b].y === undefined) b++;
    V[q].y = V[a].y + (V[b].y - V[a].y) * (dv[q] - dv[a]) / (dv[b] - dv[a]);
  }
  const fine = [], fy = [];
  const push = (x, z, y) => { fine.push([x, z]); fy.push(y); };
  const line = (x0, z0, y0, x1, z1, y1) => { const l = Math.hypot(x1 - x0, z1 - z0), m = Math.max(1, Math.ceil(l / 0.5)); for (let j = 0; j < m; j++) push(x0 + (x1 - x0) * j / m, z0 + (z1 - z0) * j / m, y0 + (y1 - y0) * j / m); };
  let cx = V[0].x, cz = V[0].z, cy = V[0].y;
  for (let q = 1; q < V.length - 1; q++) {
    const a = V[q - 1], b = V[q], c = V[q + 1];
    let ix = b.x - a.x, iz = b.z - a.z; const il = Math.hypot(ix, iz); ix /= il; iz /= il;
    let ox = c.x - b.x, oz = c.z - b.z; const ol = Math.hypot(ox, oz); ox /= ol; oz /= ol;
    const th = Math.atan2(ix * oz - iz * ox, ix * ox + iz * oz);
    let t = Math.abs(th) < 0.02 || !b.r ? 0 : b.r * Math.tan(Math.abs(th) / 2); t = Math.min(t, il * 0.45, ol * 0.45);
    const ex = b.x - ix * t, ez = b.z - iz * t;
    line(cx, cz, cy, ex, ez, b.y);
    if (t > 0) {
      const sgn = Math.sign(th), r = t / Math.tan(Math.abs(th) / 2), lx = -iz * sgn, lz = ix * sgn, ocx = ex + lx * r, ocz = ez + lz * r;
      const a0 = Math.atan2(ez - ocz, ex - ocx), m = Math.max(2, Math.ceil(r * Math.abs(th) / 0.5));
      for (let j = 0; j < m; j++) { const an = a0 + th * j / m; push(ocx + Math.cos(an) * r, ocz + Math.sin(an) * r, b.y); }
      cx = b.x + ox * t; cz = b.z + oz * t;
    } else { cx = b.x; cz = b.z; }
    cy = b.y;
  }
  const E = V[V.length - 1]; line(cx, cz, cy, E.x, E.z, E.y); push(E.x, E.z, E.y);
  const m = fine.length, cum = [0];
  for (let i = 1; i < m; i++) cum.push(cum[i - 1] + Math.hypot(fine[i][0] - fine[i - 1][0], fine[i][1] - fine[i - 1][1]));
  const total = cum[m - 1], n = Math.max(4, Math.round(total / 2) + 1), ds = total / (n - 1);
  const S = {
    open: true, id: k, n, ds, length: total, iA, iB, hw, kind: sd.kind || 'dirt',
    x: new Float32Array(n), z: new Float32Array(n), y: new Float32Array(n), hw: new Float32Array(n).fill(hw),
    tx: new Float32Array(n), tz: new Float32Array(n), nx: new Float32Array(n), nz: new Float32Array(n),
    curv: new Float32Array(n), slope: new Float32Array(n), surf: new Uint8Array(n), tunnel: new Uint8Array(n), cliff: new Float32Array(n), ramp: new Uint8Array(n),
    out: new Uint8Array(n),
  };
  let q = 0;
  for (let i = 0; i < n; i++) {
    const d = i * ds; while (q < m - 2 && cum[q + 1] < d) q++;
    const t = Math.min(1, (d - cum[q]) / Math.max(1e-6, cum[q + 1] - cum[q]));
    S.x[i] = fine[q][0] + (fine[q + 1][0] - fine[q][0]) * t; S.z[i] = fine[q][1] + (fine[q + 1][1] - fine[q][1]) * t; S.y[i] = fy[q] + (fy[q + 1] - fy[q]) * t;
  }
  for (let pass = 0; pass < 4; pass++) { const X = S.x.slice(), Z = S.z.slice(), Y = S.y.slice(); for (let i = 1; i < n - 1; i++) { S.x[i] = X[i] * 0.5 + (X[i - 1] + X[i + 1]) * 0.25; S.z[i] = Z[i] * 0.5 + (Z[i - 1] + Z[i + 1]) * 0.25; S.y[i] = Y[i] * 0.5 + (Y[i - 1] + Y[i + 1]) * 0.25; } }
  // 지름길 위 점프대
  for (const j of (sd.jumps || [])) { const i0 = Math.round(j.at * (n - 1)), cnt = Math.max(3, Math.round((j.len || 10) / ds)); for (let r = 0; r <= cnt && i0 + r < n; r++) { S.y[i0 + r] += (j.rise || 2) * Math.pow(r / cnt, 1.25); S.ramp[i0 + r] = 1; } }
  for (let i = 0; i < n; i++) {
    const p = Math.max(0, i - 1), r = Math.min(n - 1, i + 1);
    let dx = S.x[r] - S.x[p], dz = S.z[r] - S.z[p]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    S.tx[i] = dx; S.tz[i] = dz; S.nx[i] = dz; S.nz[i] = -dx; S.slope[i] = (S.y[r] - S.y[p]) / l;
  }
  for (let i = 0; i < n; i++) {
    const p = Math.max(0, i - 2), r = Math.min(n - 1, i + 2);
    let da = Math.atan2(S.tx[r], S.tz[r]) - Math.atan2(S.tx[p], S.tz[p]); while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    S.curv[i] = da / Math.max(ds, (r - p) * ds);
  }
  let sB = iB * T.ds; const sA = iA * T.ds; if (sB < sA) sB += T.length;
  S.sA = sA; S.sB = sB; S.saves = Math.round(sB - sA - total);
  // 본 트랙 벽에 구멍 내기: 지름길 도로가 본 트랙 벽선을 지나는 곳
  if (!T.gapL) { T.gapL = new Uint8Array(T.n); T.gapR = new Uint8Array(T.n); }
  const tmp = {}; let hint = iA;
  for (let i = 0; i < n; i++) {
    const near = i < n / 2 ? iA : iB;
    const L = locate(T, S.x[i], S.z[i], i < n / 2 ? hint : near, 40, tmp);
    if (i < n / 2) hint = L.i;
    const al = Math.abs(L.lat);
    S.out[i] = al > L.hw + 0.4 ? 1 : 0;
    if (al > L.hw - hw - 1.5 && al < L.hw + hw + 1.5) {
      const g = L.lat > 0 ? T.gapL : T.gapR, w = Math.ceil((hw + 0.5) / T.ds);
      for (let o = -w; o <= w; o++) g[(L.i + o + T.n) % T.n] = k + 1;
    }
  }
  if (sd.surf === 'ice') for (let i = 0; i < n; i++) S.surf[i] = S.out[i] ? 1 : 0;
  if (sd.cliff) for (let i = 0; i < n; i++) S.cliff[i] = S.out[i] ? sd.cliff * Math.min(1, i / 6, (n - 1 - i) / 6) : 0;
  S.obs = (sd.obs || []).map(o => { const i = Math.round(o.at * (n - 1)); return { i, s: i * ds, lat: o.lat || 0, r: o.r || 1.2, kind: o.kind || 'rock', soft: !!o.soft }; });
  S.pads = (sd.pads || []).map(p => ({ i: Math.round(p.at * (n - 1)), lat: p.lat || 0, len: 5 }));
  S.jumps = []; S.zones = []; S.movers = [];
  return S;
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
  const open = T.open;
  for (let o = -win; o <= win; o++) {
    let i = hint + o; if (open) { if (i < 0 || i > N - 2) continue; } else i = (i % N + N) % N;
    const j = open ? i + 1 : (i + 1) % N;
    const ax = T.x[i], az = T.z[i], bx = T.x[j] - ax, bz = T.z[j] - az;
    const l2 = bx * bx + bz * bz;
    let t = ((x - ax) * bx + (z - az) * bz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = x - (ax + bx * t), dz = z - (az + bz * t);
    const d = dx * dx + dz * dz;
    if (d < best) { best = d; bi = i; bt = t; }
  }
  if (open) bi = Math.max(0, Math.min(N - 2, bi));
  const j = open ? bi + 1 : (bi + 1) % N;
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

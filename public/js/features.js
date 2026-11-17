// 트랙 장치 그리기 — 점프대, 빙판·물, 터널, 장애물, 움직이는 장애물
import * as THREE from '../lib/three.bundle.js';
import { moverAt, pointAt } from './tracks.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// 터널 단면 (lat는 반폭 비율, dy는 m) — 왼쪽 바닥에서 시작해 오른쪽 바닥으로
const PROFILES = {
  barn: hw => [[1, 0], [1, 4.4], [0.62, 6.6], [0, 7.8], [-0.62, 6.6], [-1, 4.4], [-1, 0]].map(([l, y]) => [l * hw, y]),
  round: (hw, hk = 0.78) => { const o = []; for (let a = 0; a <= 14; a++) { const t = Math.PI * a / 14; o.push([Math.cos(t) * hw, Math.sin(t) * (9.5 * hk + 1.5)]); } return o; },
  box: hw => [[1, 0], [1, 8.2], [0.8, 9.2], [-0.8, 9.2], [-1, 8.2], [-1, 0]].map(([l, y]) => [l * hw, y]),
};

export function buildFeatures(T, H) {
  const { g, L, lam, basic, strip, canvasTex, instanced, hq, th, R, disposables } = H;
  const N = T.n, box = H.box;
  const updaters = [];
  const dirAt = i => Math.atan2(T.tx[i], T.tz[i]);

  // 트랙 구간을 따라 단면을 뽑아 만드는 껍데기
  const shell = (i0, cnt, prof, mat, vScale = 6, inward = 0) => {
    const P = prof.length, pos = new Float32Array((cnt + 1) * P * 3), uv = new Float32Array((cnt + 1) * P * 2), idx = [];
    let len = 0; for (let k = 1; k < P; k++) len += Math.hypot(prof[k][0] - prof[k - 1][0], prof[k][1] - prof[k - 1][1]);
    for (let r = 0; r <= cnt; r++) {
      const i = (i0 + r) % N; let acc = 0;
      for (let k = 0; k < P; k++) {
        if (k) acc += Math.hypot(prof[k][0] - prof[k - 1][0], prof[k][1] - prof[k - 1][1]);
        const lat = prof[k][0] * (T.hw[i] + inward), o = (r * P + k) * 3;
        pos[o] = T.x[i] + T.nx[i] * lat; pos[o + 1] = T.y[i] + prof[k][1]; pos[o + 2] = T.z[i] + T.nz[i] * lat;
        uv[(r * P + k) * 2] = acc / len * 4; uv[(r * P + k) * 2 + 1] = r * T.ds / vScale;
        if (r < cnt && k < P - 1) { const a = r * P + k, b = a + P; idx.push(a, b, a + 1, a + 1, b, b + 1); }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const m = L(geo, mat); m.castShadow = hq; m.receiveShadow = true; return m;
  };

  // ----- 점프대 -----
  const kickTex = canvasTex(64, 64, (c, w, h) => {
    c.fillStyle = '#ffd21e'; c.fillRect(0, 0, w, h); c.fillStyle = '#16181f';
    for (let k = -1; k < 3; k++) { c.beginPath(); c.moveTo(4, k * 32 + 30); c.lineTo(32, k * 32 + 8); c.lineTo(60, k * 32 + 30); c.lineTo(60, k * 32 + 42); c.lineTo(32, k * 32 + 20); c.lineTo(4, k * 32 + 42); c.closePath(); c.fill(); }
  });
  const kickMat = basic({ map: kickTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
  const stripeTex = canvasTex(32, 64, (c, w, h) => { for (let k = 0; k < 8; k++) { c.fillStyle = k % 2 ? '#16181f' : '#ffd21e'; c.fillRect(0, k * 8, w, 8); } });
  const stripeMat = lam({ map: stripeTex });
  const jumpPosts = [];
  for (const j of T.jumps) {
    const q = strip(T, i => T.hw[i] - 0.4, 0.05, i => -T.hw[i] + 0.4, 0.05, 0, 0, 1, j.i, j.cnt);
    const uvA = q.attributes.uv; for (let r = 0; r <= j.cnt; r++) { uvA.setY(r * 2, r * 0.6); uvA.setY(r * 2 + 1, r * 0.6); }
    L(q, kickMat);
    // 끝 턱 앞면 (떨어지는 면)
    const lip = j.lip, nx2 = (lip + 1) % N;
    const f = strip(T, i => T.hw[i], 0, i => -T.hw[i], 0, 0, 0, 1, lip, 1);
    const pa = f.attributes.position; pa.setY(2, T.y[nx2] - 0.2); pa.setY(3, T.y[nx2] - 0.2); pa.setX(2, pa.getX(0) + T.tx[lip] * 0.05); pa.setZ(2, pa.getZ(0) + T.tz[lip] * 0.05); pa.setX(3, pa.getX(1) + T.tx[lip] * 0.05); pa.setZ(3, pa.getZ(1) + T.tz[lip] * 0.05); f.computeVertexNormals();
    L(f, stripeMat);
    for (const s of [1, -1]) jumpPosts.push({ x: T.x[lip] + T.nx[lip] * s * (T.hw[lip] + 0.9), z: T.z[lip] + T.nz[lip] * s * (T.hw[lip] + 0.9), y: T.y[lip] + 1.6, sx: 0.45, sy: 3.2, sz: 0.45 });
  }
  if (jumpPosts.length) g.add(instanced(box, stripeMat, jumpPosts, hq));

  // ----- 빙판·물 -----
  const waterTex = canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = '#2f8fd8'; c.fillRect(0, 0, w, h);
    for (let k = 0; k < 70; k++) { c.strokeStyle = `rgba(255,255,255,${0.12 + R() * 0.3})`; c.lineWidth = 1 + R() * 2; const x = R() * w, y = R() * h, l = 8 + R() * 22; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + l / 2, y - 3, x + l, y); c.stroke(); }
  });
  const iceTex = canvasTex(256, 256, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#c9ecff'); gr.addColorStop(0.5, '#e9f8ff'); gr.addColorStop(1, '#b3e0fb'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 1.5;
    for (let k = 0; k < 18; k++) { let x = R() * w, y = R() * h; c.beginPath(); c.moveTo(x, y); for (let q = 0; q < 5; q++) { x += (R() - 0.5) * 60; y += (R() - 0.5) * 60; c.lineTo(x, y); } c.stroke(); }
    c.strokeStyle = 'rgba(90,160,220,0.35)'; for (let k = 0; k < 40; k++) { c.beginPath(); const x = R() * w, y = R() * h; c.moveTo(x, y); c.lineTo(x + (R() - 0.5) * 30, y + (R() - 0.5) * 30); c.stroke(); }
  });
  const waterMat = new THREE.MeshPhongMaterial({ map: waterTex, color: '#ffffff', transparent: true, opacity: 0.82, shininess: 120, specular: 0xbfe8ff, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: THREE.DoubleSide });
  const iceMat = new THREE.MeshPhongMaterial({ map: iceTex, color: '#ffffff', transparent: true, opacity: 0.9, shininess: 160, specular: 0xffffff, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: THREE.DoubleSide });
  disposables.push(waterMat, iceMat, waterTex, iceTex);
  for (const z of T.zones) {
    if (z.kind === 'water') {
      L(strip(T, i => T.hw[i] + 0.1, 0.07, i => -T.hw[i] - 0.1, 0.07, 9, 0, 3, z.i, z.cnt), waterMat);
      if (z.style === 'stream') {   // 도로 양옆으로 흘러가는 개울
        let yw = 1e9; for (let q = 0; q <= z.cnt; q++) yw = Math.min(yw, T.y[(z.i + q) % N]); yw += 0.04;
        for (const s of [1, -1]) L(strip(T, i => s * (T.hw[i] + 0.65), i => yw - T.y[i], i => s * 110, i => yw - T.y[i], 9, 0, 14, (z.i - 2 + N) % N, z.cnt + 4), waterMat);
      }
    } else if (z.kind === 'ice') {
      const m = L(strip(T, i => T.hw[i], 0.035, i => -T.hw[i], 0.035, 26, 0, 1, z.i, z.cnt), iceMat); m.receiveShadow = true;
    }
  }
  updaters.push(t => { waterTex.offset.set(t * 0.05, -t * 0.22); });

  // ----- 터널 -----
  for (const z of T.zones) {
    if (z.kind !== 'tunnel') continue;
    const st = z.style || 'round', i0 = (z.i + N - 1) % N, cnt = z.cnt + 2;
    if (st === 'barn') {
      const wood = canvasTex(256, 128, (c, w, h) => {
        c.fillStyle = '#b8402f'; c.fillRect(0, 0, w, h);
        for (let k = 0; k < 16; k++) { c.fillStyle = `rgba(0,0,0,${0.08 + R() * 0.1})`; c.fillRect(k * 16, 0, 2, h); c.fillStyle = `rgba(255,255,255,${R() * 0.06})`; c.fillRect(k * 16 + 3, 0, 10, h); }
        c.clearRect(40, 40, 46, 30); c.clearRect(170, 40, 46, 30);   // 창문
        c.strokeStyle = '#f6f0e4'; c.lineWidth = 5; c.strokeRect(40, 40, 46, 30); c.strokeRect(170, 40, 46, 30);
      });
      wood.repeat.set(1, 1);
      const inner = lam({ map: wood, side: THREE.DoubleSide, transparent: true, alphaTest: 0.5 });
      shell(i0, cnt, PROFILES.barn(1), inner, 12, 0.7);
      const roofTex = canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#3b3f4c'; c.fillRect(0, 0, w, h); for (let k = 0; k < 8; k++) { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, k * 8 + 6, w, 2); } });
      const roof = lam({ map: roofTex, side: THREE.DoubleSide });
      const rp = [[1.13, 4.2], [0.66, 6.8], [0, 8.4], [-0.66, 6.8], [-1.13, 4.2]].map(([l, y]) => [l, y]);
      shell(i0 - 1, cnt + 2, rp, roof, 4, 0.7);
      // 입구 테두리
      const trim = [];
      for (const r of [i0, (i0 + cnt) % N]) for (const s of [1, -1]) trim.push({ x: T.x[r] + T.nx[r] * s * (T.hw[r] + 0.75), z: T.z[r] + T.nz[r] * s * (T.hw[r] + 0.75), y: T.y[r] + 2.3, sx: 0.5, sy: 4.6, sz: 0.5, ry: dirAt(r) });
      g.add(instanced(box, lam({ color: '#f6f0e4' }), trim, hq));
    } else {
      const P = st === 'neon' ? PROFILES.box(1) : PROFILES.round(1, st === 'icecave' ? 0.95 : 0.7);
      const inTex = canvasTex(128, 128, (c, w, h) => {
        const base = st === 'mine' ? '#7a5638' : st === 'icecave' ? '#8fd0f5' : '#15162b';
        c.fillStyle = base; c.fillRect(0, 0, w, h);
        for (let k = 0; k < 260; k++) { c.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,255,255'},${0.04 + R() * (st === 'icecave' ? 0.18 : 0.1)})`; const s2 = 3 + R() * 14; c.fillRect(R() * w, R() * h, s2, s2 * 0.6); }
        if (st === 'neon') { c.fillStyle = '#2ef2ff'; c.fillRect(0, h - 6, w, 3); }
      });
      const mat = st === 'icecave' ? new THREE.MeshPhongMaterial({ map: inTex, side: THREE.DoubleSide, transparent: true, opacity: 0.88, shininess: 120, specular: 0xffffff, emissive: 0x15405e })
        : st === 'neon' ? basic({ map: inTex, side: THREE.DoubleSide }) : lam({ map: inTex, side: THREE.DoubleSide });
      if (st === 'icecave') disposables.push(mat);
      const m = shell(i0, cnt, P, mat, 8, 0.7);
      if (st === 'icecave') m.castShadow = false;
      // 산·빙산 덮개: 터널이 언덕을 뚫고 지나가는 것처럼
      if (st === 'mine' || st === 'icecave') {
        const hump = [];
        for (let k = 0; k <= 10; k++) { const t = Math.PI * k / 10; hump.push([Math.cos(t) * 1.9, Math.sin(t) * (st === 'mine' ? 15 : 12) + 0.2]); }
        const hm = st === 'mine' ? lam({ color: th.cliff || th.mount, flatShading: true, side: THREE.DoubleSide }) : new THREE.MeshPhongMaterial({ color: '#f4fbff', emissive: '#4a6a85', flatShading: true, shininess: 60, side: THREE.DoubleSide });
        if (st === 'icecave') disposables.push(hm);
        // 입구 쪽은 낮게 깎아 둥근 언덕 모양으로
        const hg = shell(i0 + 2, cnt - 4, hump, hm, 10, 1.2);
        const P2 = hg.geometry.attributes.position, nP = hump.length, rows = P2.count / nP;
        for (let r = 0; r < rows; r++) { const e = Math.min(1, r / 6, (rows - 1 - r) / 6), i = (i0 + 2 + r) % N; for (let k = 0; k < nP; k++) { const v = r * nP + k; P2.setY(v, T.y[i] + 8.8 + (P2.getY(v) - T.y[i] - 0.2) * e * 0.9 + (R() - 0.5) * 0.8); } }
        P2.needsUpdate = true; hg.geometry.computeVertexNormals();
      }
      // 골조·조명
      const ribs = [], lamps = [];
      const step = st === 'neon' ? 5 : 6;
      for (let r = 0; r <= cnt; r += step) {
        const i = (i0 + r) % N, hw = T.hw[i] + 0.7;
        if (st === 'mine') {
          for (const s of [1, -1]) ribs.push({ x: T.x[i] + T.nx[i] * s * (hw - 0.3), z: T.z[i] + T.nz[i] * s * (hw - 0.3), y: T.y[i] + 2.6, sx: 0.5, sy: 5.2, sz: 0.5, ry: dirAt(i) });
          ribs.push({ x: T.x[i], z: T.z[i], y: T.y[i] + 5.2, sx: hw * 2, sy: 0.55, sz: 0.55, ry: dirAt(i) + Math.PI / 2 });
          lamps.push({ x: T.x[i], z: T.z[i], y: T.y[i] + 4.6, s: 0.32 });
        } else if (st === 'neon') {
          const c = r % (step * 2) ? '#ff3fa4' : '#2ef2ff';
          for (const s of [1, -1]) ribs.push({ x: T.x[i] + T.nx[i] * s * (hw - 0.15), z: T.z[i] + T.nz[i] * s * (hw - 0.15), y: T.y[i] + 4.2, sx: 0.25, sy: 8.2, sz: 0.25, ry: dirAt(i), c });
          ribs.push({ x: T.x[i], z: T.z[i], y: T.y[i] + 9.0, sx: hw * 1.6, sy: 0.25, sz: 0.25, ry: dirAt(i) + Math.PI / 2, c });
        } else if (st === 'icecave') {
          for (const s of [1, -1]) if (R() < 0.8) lamps.push({ x: T.x[i] + T.nx[i] * s * (hw - 0.6), z: T.z[i] + T.nz[i] * s * (hw - 0.6), y: T.y[i] + 0.8 + R() * 2, s: 0.5 + R() * 0.6, rx: R(), rz: R() });
        }
      }
      if (st === 'mine') { g.add(instanced(box, lam({ color: '#5b3b22' }), ribs, hq)); const sp = new THREE.SphereGeometry(1, 8, 6); disposables.push(sp); g.add(instanced(sp, basic({ color: '#ffd98a' }), lamps)); }
      if (st === 'neon') g.add(instanced(box, basic({ color: '#ffffff' }), ribs));
      if (st === 'icecave') { const cg = new THREE.OctahedronGeometry(1, 0); cg.scale(0.6, 1.8, 0.6); disposables.push(cg); g.add(instanced(cg, new THREE.MeshPhongMaterial({ color: '#bff0ff', emissive: '#4fb8ff', emissiveIntensity: 0.6, shininess: 140, transparent: true, opacity: 0.9 }), lamps)); }
      // 입구 테두리 (바위·얼음·네온)
      for (const r of [i0, (i0 + cnt) % N]) {
        const hw = T.hw[r] + 0.7, frame = new THREE.Group();
        frame.position.set(T.x[r], T.y[r], T.z[r]); frame.rotation.y = dirAt(r);
        const fm = st === 'neon' ? basic({ color: '#2ef2ff' }) : lam({ color: st === 'mine' ? '#8a6a4a' : '#e8f8ff' });
        const prof = P.map(([l, y]) => [l * hw, y]);
        for (let k = 0; k < prof.length - 1; k++) {
          const [x0, y0] = prof[k], [x1, y1] = prof[k + 1], b = new THREE.Mesh(box, fm);
          const l = Math.hypot(x1 - x0, y1 - y0) + 0.6;
          b.scale.set(l, st === 'neon' ? 0.35 : 1.4, st === 'neon' ? 0.35 : 1.6); b.position.set(-(x0 + x1) / 2, (y0 + y1) / 2, 0); b.rotation.z = Math.atan2(y1 - y0, -(x1 - x0));
          b.castShadow = hq; frame.add(b);
        }
        g.add(frame);
      }
    }
  }

  // ----- 주차 타워: 층마다 바깥 띠, 위층을 받치는 기둥, 천장 조명, 계단 타워, 옥상 조명탑, 안마당 주차 차량 -----
  for (const z of T.zones) {
    if (z.kind !== 'garage') continue;
    const i0 = z.i, cnt = z.cnt, LED = 2.8;   // LED: 도로 벽 바깥으로 튀어나온 바닥 판 폭
    // 트랙 점 격자 (기둥이 도로를 뚫지 않게 확인)
    const CG = 10, grd = new Map();
    for (let i = 0; i < N; i++) { const k = Math.floor(T.x[i] / CG) + ',' + Math.floor(T.z[i] / CG); (grd.get(k) || grd.set(k, []).get(k)).push(i); }
    const roadsNear = (x, zz, rad) => { const out = []; const gx = Math.floor(x / CG), gz = Math.floor(zz / CG);
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) { const l = grd.get((gx + a) + ',' + (gz + b)); if (l) for (const i of l) { const d = Math.hypot(T.x[i] - x, T.z[i] - zz); if (d < T.hw[i] + rad) out.push({ i, d, y: T.y[i] }); } }
      return out; };
    // 1) 바닥 판(벽 바깥으로 2.8m)과 바깥 띠 — 층 사이가 뚫려 보이는 주차장 외벽
    const bandTex = canvasTex(256, 64, (c, w, h) => {
      c.fillStyle = '#3a3e58'; c.fillRect(0, 0, w, h); c.fillStyle = '#2b2e44'; c.fillRect(0, h * 0.62, w, h * 0.38);
      c.fillStyle = '#2ef2ff'; c.fillRect(0, h * 0.5, w, 4); c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(0, 0, w, 3);
      for (let k = 0; k < 8; k++) { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(k * 32, 0, 2, h); }
    });
    const bandM = basic({ map: bandTex, side: THREE.DoubleSide });
    const slabM = lam({ color: '#2a2d42', side: THREE.DoubleSide });
    for (const sd of [1, -1]) {
      const o = i => sd * (T.hw[i] + 0.6), e = i => sd * (T.hw[i] + LED);
      L(strip(T, o, 1.0, e, 1.2, 8, 0, 1, i0, cnt), slabM);          // 판 윗면 (벽 높이에 맞춤)
      L(strip(T, e, 1.2, e, -1.7, 10, 0, 1, i0, cnt), bandM);        // 바깥 띠 (네온 줄)
      L(strip(T, o, -1.7, e, -1.7, 8, 0, 1, i0, cnt), slabM);        // 판 아랫면
    }
    // 2) 천장 조명: 위층 바닥 아래에 두 줄
    const ledM = basic({ color: '#bff6ff', side: THREE.DoubleSide });
    for (const lt of [0.45, -0.45]) L(strip(T, i => T.hw[i] * lt + 0.25, -1.75, i => T.hw[i] * lt - 0.25, -1.75, 0, 0, 1, i0, cnt), ledM);
    // 3) 기둥: 바닥 판 끝 아래(벽 바깥 1.7m). 땅 위 도로에는 세우지 않고, 위를 지나는 도로가 있으면 그 밑에서 멈춰 받친다
    const cols = [], foots = [];
    for (let r = 0; r <= cnt; r += 6) {
      const i = (i0 + r) % N;
      for (const sd of [1, -1]) {
        const lat = sd * (T.hw[i] + 1.7), cx = T.x[i] + T.nx[i] * lat, cz = T.z[i] + T.nz[i] * lat;
        const ground = H.heightAt(cx, cz);
        const inRoad = roadsNear(cx, cz, 1.0);               // 기둥이 도로 위에 놓이는가
        if (inRoad.some(q => q.y < ground + 2.5)) continue;   // 땅 위 도로: 세우지 않음
        const above = roadsNear(cx, cz, LED + 0.2).filter(q => q.y > ground + 3);
        if (!above.length) continue;
        let top = Math.max(...above.map(q => q.y - 1.7));
        for (const q of inRoad) if (q.y > ground) top = Math.min(top, q.y - 1.75);
        if (top - ground < 2.2 || !H.fits(cx, cz, 0.7)) continue;
        cols.push({ x: cx, z: cz, y: (top + ground) / 2, sx: 1.0, sy: top - ground, sz: 1.0, ry: dirAt(i) });
        H.take(cx, cz, 0.7, 'column');
      }
    }
    if (cols.length) g.add(instanced(box, lam({ color: '#4a4f6e' }), cols, hq));
    // 3-2) 층 사이 외벽: 바로 위에 다른 층이 있는 구간에만, 아래층 띠 위부터 위층 띠 아래까지 가로 살(루버) 벽
    const upY = new Float32Array(N).fill(-1);
    for (let r = 0; r <= cnt; r++) {
      const i = (i0 + r) % N;
      const up = roadsNear(T.x[i], T.z[i], 1.5 - T.hw[i]).filter(q => q.y > T.y[i] + 5);
      if (up.length) upY[i] = Math.min(...up.map(q => q.y));
    }
    const louvTex = canvasTex(64, 128, (c, w, h) => {
      for (let k = 0; k < 8; k++) { c.fillStyle = '#3a3e58'; c.fillRect(0, k * 16, w, 8); c.fillStyle = '#2ef2ff'; c.fillRect(0, k * 16 + 7, w, 1); }
      c.fillStyle = '#4a4f6e'; c.fillRect(0, 0, 4, h); c.fillRect(w - 4, 0, 4, h);
    });
    louvTex.wrapS = louvTex.wrapT = THREE.RepeatWrapping;
    const louvM = basic({ map: louvTex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
    let ra = -1;
    for (let r = 0; r <= cnt + 1; r++) {
      const i = (i0 + r) % N, on = r <= cnt && upY[i] > 0;
      if (on && ra < 0) ra = r;
      if (!on && ra >= 0) {
        const a0 = (i0 + ra) % N, c2 = r - 1 - ra;
        if (c2 > 2) for (const sd of [1, -1]) {
          const e = j => sd * (T.hw[j] + LED);
          L(strip(T, e, 1.2, e, j => Math.max(1.3, upY[j] - T.y[j] - 1.7), 6, 0, 1, a0, c2), louvM);
        }
        ra = -1;
      }
    }
    // 3-2b) 바깥 둘레 아래쪽: 땅부터 가장 낮은 층 띠까지 외벽 (밑으로 도로가 지나는 입구는 비운다)
    { let gx0 = 1e9, gx1 = -1e9, gz0 = 1e9, gz1 = -1e9;
      for (let r = 0; r <= cnt; r++) { const i = (i0 + r) % N; gx0 = Math.min(gx0, T.x[i]); gx1 = Math.max(gx1, T.x[i]); gz0 = Math.min(gz0, T.z[i]); gz1 = Math.max(gz1, T.z[i]); }
      const gcx = (gx0 + gx1) / 2, gcz = (gz0 + gz1) / 2;
      const low = new Float32Array(N).fill(1e9), sideOf = new Int8Array(N);
      for (let r = 0; r <= cnt; r++) {
        const i = (i0 + r) % N, sd = (T.nx[i] * (T.x[i] - gcx) + T.nz[i] * (T.z[i] - gcz)) > 0 ? 1 : -1;   // 바깥쪽
        const ex = T.x[i] + T.nx[i] * sd * (T.hw[i] + LED), ez = T.z[i] + T.nz[i] * sd * (T.hw[i] + LED), gy = H.heightAt(ex, ez);
        const under = roadsNear(ex, ez, 1.5).some(q => q.y < T.y[i] - 3);       // 이 벽 밑으로 다른 도로가 지나감
        const below = roadsNear(T.x[i], T.z[i], 1.5 - T.hw[i]).some(q => q.y < T.y[i] - 3);   // 이 층 밑에 다른 층이 있음 (그 층의 띠가 맡는다)
        if (!under && !below && T.y[i] - gy > 3.4) { low[i] = gy; sideOf[i] = sd; }
      }
      let ra2 = -1;
      for (let r = 0; r <= cnt + 1; r++) {
        const i = (i0 + r) % N, on = r <= cnt && low[i] < 1e8 && (ra2 < 0 || sideOf[i] === sideOf[(i0 + ra2) % N]);
        if (on && ra2 < 0) ra2 = r;
        if ((!on || r === cnt + 1) && ra2 >= 0) {
          const a0 = (i0 + ra2) % N, c2 = r - 1 - ra2, sd = sideOf[a0];
          if (c2 > 2) { const e = j => sd * (T.hw[j] + LED); L(strip(T, e, j => low[j] < 1e8 ? low[j] - T.y[j] : -1.7, e, -1.7, 6, 0, 1, a0, c2), louvM); }
          ra2 = on ? r : -1;
        }
      }
    }
    // 3-3) 바닥 층 표시: 1F → 2F → RF
    const floorTex = (txt) => canvasTex(256, 128, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = 'rgba(255,255,255,0.88)'; c.font = '900 104px "Black Han Sans", "Arial Black", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, w / 2, h / 2 + 4); }, false);
    const yA = T.y[i0], yB = T.y[(i0 + cnt) % N];
    for (const [txt, fy] of [['1F', 0.03], ['2F', 0.5], ['RF', 0.97]]) {
      const yt = yA + (yB - yA) * fy; let best = 0, bd = 1e9;
      for (let r = 0; r <= cnt; r++) { const d = Math.abs(T.y[(i0 + r) % N] - yt); if (d < bd) { bd = d; best = r; } }
      const i = (i0 + Math.min(cnt - 3, Math.max(3, best))) % N;
      const pg = new THREE.PlaneGeometry(9, 4.5); disposables.push(pg);
      const m = new THREE.Mesh(pg, basic({ map: floorTex(txt), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      m.position.set(T.x[i], T.y[i] + 0.05, T.z[i]); m.rotation.order = 'YXZ'; m.rotation.y = dirAt(i) + Math.PI; m.rotation.x = -Math.PI / 2 + Math.atan(T.slope[i]);
      g.add(m);
    }
    // 4) 건물 범위 (안마당·모서리 계산용)
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, top = 0;
    for (let r = 0; r <= cnt; r++) { const i = (i0 + r) % N; x0 = Math.min(x0, T.x[i]); x1 = Math.max(x1, T.x[i]); z0 = Math.min(z0, T.z[i]); z1 = Math.max(z1, T.z[i]); top = Math.max(top, T.y[i]); }
    const ccx = (x0 + x1) / 2, ccz = (z0 + z1) / 2;
    // 5) 모서리 계단 타워 + P 간판: 건물 바깥 대각선 방향, 빈자리에만
    const pTex = canvasTex(128, 128, (c, w, h) => { c.fillStyle = '#1b2bff'; c.fillRect(0, 0, w, h); c.strokeStyle = '#fff'; c.lineWidth = 8; c.strokeRect(8, 8, w - 16, h - 16); c.fillStyle = '#fff'; c.font = '900 92px "Black Han Sans", "Arial Black", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('P', w / 2, h / 2 + 6); }, false);
    const towerTex = canvasTex(64, 128, (c, w, h) => { c.fillStyle = '#30334c'; c.fillRect(0, 0, w, h); for (let k = 0; k < 8; k++) { c.fillStyle = k % 2 ? '#ffe9a8' : '#9fe8ff'; c.fillRect(20, k * 16 + 4, 24, 6); } }, true);
    const towers = [], signs = [];
    for (const [qx, qz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
      const dx = Math.sign(qx - ccx), dz = Math.sign(qz - ccz);
      for (const out of [4, 8, 12]) {
        const tx = qx + dx * out, tz = qz + dz * out, Rr = 4.6;
        if (H.nearTrack(tx, tz, Rr + 1.2) || !H.fits(tx, tz, Rr)) continue;
        const gy = H.heightAt(tx, tz), th2 = top + 7;
        towers.push({ x: tx, z: tz, y: gy + th2 / 2, sx: 6.4, sy: th2, sz: 6.4 });
        signs.push({ x: tx, z: tz, y: gy + th2 - 2.6, sx: 6.6, sy: 4.2, sz: 6.6 });
        H.take(tx, tz, Rr, 'tower'); break;
      }
    }
    if (towers.length) { g.add(instanced(box, lam({ map: towerTex }), towers, hq)); g.add(instanced(box, basic({ map: pTex }), signs)); }
    // 6) 옥상 조명탑: 꼭대기 층(위에 아무것도 없는 곳) 바닥 판 끝에
    const poles = [], heads = [];
    for (let r = 0; r <= cnt; r += 14) {
      const i = (i0 + r) % N; if (T.y[i] < top - 3.5) continue;
      for (const sd of [1, -1]) {
        const lat = sd * (T.hw[i] + 2.2), px = T.x[i] + T.nx[i] * lat, pz = T.z[i] + T.nz[i] * lat;
        if (roadsNear(px, pz, LED + 0.5).some(q => q.y > T.y[i] + 1)) continue;
        poles.push({ x: px, z: pz, y: T.y[i] + 4.2, sx: 0.3, sy: 6.8, sz: 0.3 });
        heads.push({ x: px - T.nx[i] * sd * 0.8, z: pz - T.nz[i] * sd * 0.8, y: T.y[i] + 7.6, sx: 2.0, sy: 0.35, sz: 0.8, ry: dirAt(i) });
      }
    }
    if (poles.length) { g.add(instanced(box, lam({ color: '#5a5f80' }), poles, hq)); g.add(instanced(box, basic({ color: '#fff3c4' }), heads)); }
    // 7) 안마당: 줄 맞춰 주차된 차들, 바닥 주차선. 다른 소품은 놓지 않는다
    const inX0 = x0 + 9, inX1 = x1 - 9, inZ0 = z0 + 9, inZ1 = z1 - 9;
    H.noScen.push({ x0: inX0, x1: inX1, z0: inZ0, z1: inZ1 });
    const carB = [], carC = [], lines = [], CC = ['#ff3fa4', '#2ef2ff', '#ffe66a', '#8b5cf6', '#ff7a3c', '#f6f3ea', '#35d49a'];
    for (let px = inX0 + 6; px < inX1 - 4; px += 4.2) for (const pz of [ccz - 9, ccz + 9]) {
      if (H.nearTrack(px, pz, 4) || !H.fits(px, pz, 2.3)) continue;
      const gy = H.heightAt(px, pz);
      lines.push({ x: px - 2.1, z: pz, y: gy + 0.04, sx: 0.15, sy: 0.02, sz: 5.6, c: '#f6f3ea' });
      if (R() < 0.25) continue;   // 빈 칸
      const c = CC[Math.floor(R() * CC.length)];
      carB.push({ x: px, z: pz, y: gy + 0.7, sx: 1.9, sy: 0.8, sz: 4.1, c }); carC.push({ x: px, z: pz + (pz > ccz ? 0.3 : -0.3), y: gy + 1.4, sx: 1.6, sy: 0.65, sz: 2.1, c: '#1a1d2e' });
      H.take(px, pz, 2.3, 'parked');
    }
    if (carB.length) { g.add(instanced(box, lam({ color: '#ffffff' }), carB, hq)); g.add(instanced(box, lam({ color: '#ffffff' }), carC, false)); }
    if (lines.length) g.add(instanced(box, basic({ color: '#ffffff' }), lines));
  }

  // ----- 장애물 -----
  const hayTex = canvasTex(128, 64, (c, w, h) => { c.fillStyle = '#e9bd4f'; c.fillRect(0, 0, w, h); for (let k = 0; k < 200; k++) { c.strokeStyle = `rgba(${R() < 0.5 ? '120,80,20' : '255,240,170'},${0.25 + R() * 0.3})`; c.beginPath(); const x = R() * w, y = R() * h; c.moveTo(x, y); c.lineTo(x + (R() - 0.5) * 14, y + (R() - 0.5) * 4); c.stroke(); } c.fillStyle = '#c0392b'; c.fillRect(0, 20, w, 4); c.fillRect(0, 42, w, 4); });
  const hayTop = canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#d8a83e'; c.fillRect(0, 0, w, h); c.strokeStyle = 'rgba(110,70,20,0.5)'; for (let r = 4; r < 32; r += 4) { c.beginPath(); c.arc(32, 32, r, 0, 7); c.stroke(); } }, false);
  const byKind = {};
  for (const o of T.obs) (byKind[o.kind] = byKind[o.kind] || []).push(o);
  for (const S of (T.shortcuts || [])) for (const o of S.obs) (byKind[o.kind] = byKind[o.kind] || []).push({ ...o, P: S });
  const at = o => pointAt(o.P || T, o.s, o.lat);
  if (byKind.hay) {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 18); disposables.push(geo);
    const items = byKind.hay.map(o => { const p = at(o); return { x: p.x, z: p.z, y: p.y + 0.9, sx: o.r, sy: 1.8, sz: o.r, ry: R() * 6 }; });
    g.add(instanced(geo, [lam({ map: hayTex }), lam({ map: hayTop }), lam({ map: hayTop })], items, hq));
  }
  if (byKind.cone) {
    const geo = new THREE.ConeGeometry(1, 1, 10); disposables.push(geo);
    const items = byKind.cone.map(o => { const p = at(o); return { x: p.x, z: p.z, y: p.y + 0.5, sx: o.r * 0.7, sy: 1.1, sz: o.r * 0.7 }; });
    g.add(instanced(geo, lam({ map: stripeTex, color: '#ff8a3c' }), items, hq));
  }
  if (byKind.rock) {
    const geo = new THREE.DodecahedronGeometry(1, 0); disposables.push(geo);
    const ice = H.th === undefined ? false : !!th.cliff && th.cliff === '#d9eefa';
    const items = byKind.rock.map(o => { const p = at(o); return { x: p.x, z: p.z, y: p.y + o.r * 0.45, sx: o.r * 1.05, sy: o.r * 0.95, sz: o.r * 1.1, ry: R() * 6, c: ice ? (R() < 0.5 ? '#bfe6ff' : '#e6f6ff') : R() < 0.5 ? '#b8743f' : '#a5653a' }; });
    g.add(instanced(geo, lam({ color: '#ffffff', flatShading: true }), items, hq));
  }
  if (byKind.island) {   // 풍차가 서 있는 가운데 섬
    const geo = new THREE.CylinderGeometry(1, 1.06, 1, 32); disposables.push(geo);
    const items = [], tops = [];
    for (const o of byKind.island) { const p = at(o); items.push({ x: p.x, z: p.z, y: p.y + 0.3, sx: o.r, sy: 0.8, sz: o.r }); tops.push({ x: p.x, z: p.z, y: p.y + 0.72, sx: o.r - 0.35, sy: 0.08, sz: o.r - 0.35 }); H.landmarks.push({ m: o.lm || 'windmill', x: p.x, z: p.z, y: p.y + 0.7, h: o.lmH || 19, fit: o.r - 0.6, ry: dirAt(o.i) + Math.PI / 2 }); }
    const curb = canvasTex(256, 32, (c, w, h) => { for (let k = 0; k < 16; k++) { c.fillStyle = k % 2 ? th.curbA : th.curbB; c.fillRect(k * 16, 0, 16, h); } });
    curb.repeat.set(3, 1);
    g.add(instanced(geo, [lam({ map: curb }), lam({ color: th.ground }), lam({ color: th.ground })], items, hq));
    g.add(instanced(geo, lam({ color: th.ground }), tops, false));
  }

  // ----- 움직이는 장애물 -----
  const models = H.moverModels || {};
  const _p = {};
  const mv = T.movers.map(m => {
    const mk = models[m.model]; if (!mk) return null;
    const o = mk(m); g.add(o); return { m, o };
  }).filter(Boolean);
  if (mv.length) updaters.push((t, time) => {
    for (const { m, o } of mv) {
      moverAt(T, m, time, _p); const p = pointAt(T, _p.s, _p.lat);
      o.position.set(p.x, p.y, p.z); o.scale.setScalar(Math.max(0.001, Math.min(1, _p.edge)));
      if (m.type === 'traffic') o.rotation.y = p.h;
      else { o.rotation.y = p.h + (_p.dir > 0 ? Math.PI / 2 : -Math.PI / 2); }
      if (o.userData.anim) o.userData.anim(o, t, _p, m);
    }
  });

  return { update(t, time) { for (const u of updaters) u(t, time); } };
}

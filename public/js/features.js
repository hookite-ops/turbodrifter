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
    const items = byKind.rock.map(o => { const p = at(o); return { x: p.x, z: p.z, y: p.y + o.r * 0.45, sx: o.r * 1.05, sy: o.r * 0.95, sz: o.r * 1.1, ry: R() * 6, c: R() < 0.5 ? '#b8743f' : '#a5653a' }; });
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

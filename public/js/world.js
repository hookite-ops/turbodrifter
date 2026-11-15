// 트랙 3D 세계 만들기 — 도로, 벽, 기둥, 배경 소품
import * as THREE from '../lib/three.bundle.js';
import { GLTFLoader } from '../lib/three.bundle.js';

// ----- 랜드마크 (Tripo로 만든 모델) -----
// at: 트랙 위치(0~1), side: 왼쪽 +1 / 오른쪽 -1, off: 벽에서 떨어진 거리(m), h: 높이(m)
// over: 도로 위를 가로지르는 아치(통로 폭 open m), x/z: 고정 좌표
const LM_FILES = { windmill: 'assets/lm_windmill.glb', arch: 'assets/lm_arch.glb', castle: 'assets/lm_castle.glb', neon: 'assets/lm_neon.glb' };
const LANDMARKS = {
  village: [{ m: 'windmill', at: 0.05, side: 1, off: 14, h: 22 }, { m: 'windmill', at: 0.36, side: -1, off: 16, h: 18 }, { m: 'windmill', at: 0.7, side: 1, off: 15, h: 20 }],
  desert: [{ m: 'arch', over: 0.052, open: 22.5 }, { m: 'arch', at: 0.33, side: -1, off: 30, h: 34 }, { m: 'arch', at: 0.78, side: 1, off: 34, h: 40 }],
  ice: [{ m: 'castle', x: 118, z: 0, h: 60, ry: Math.PI / 2 }, { m: 'castle', x: -118, z: 0, h: 44, ry: -Math.PI / 2 }],
  city: [{ m: 'neon', at: 0.0, side: 1, off: 9, h: 42 }, { m: 'neon', at: 0.2, side: -1, off: 9, h: 38 }, { m: 'neon', at: 0.43, side: 1, off: 9, h: 46 }, { m: 'neon', at: 0.64, side: -1, off: 9, h: 40 }, { m: 'neon', at: 0.86, side: 1, off: 9, h: 44 }],
};
const lmCache = {};
function loadLandmark(name) {
  if (!lmCache[name]) lmCache[name] = new GLTFLoader().loadAsync(LM_FILES[name]).then(g => {
    let mesh = null; g.scene.updateMatrixWorld(true); g.scene.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
    const geo = mesh.geometry.clone(); geo.applyMatrix4(mesh.matrixWorld); geo.computeBoundingBox();
    const bb = geo.boundingBox, map = mesh.material.map;
    let mat;
    if (name === 'neon') mat = new THREE.MeshBasicMaterial({ map });                 // 네온은 밤에도 빛나게
    else if (map) mat = new THREE.MeshLambertMaterial({ map, side: THREE.DoubleSide });
    else {                                                                           // 텍스처 없는 모델(얼음 성): 높이에 따라 얼음색 입히기
      const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
      const lo = new THREE.Color('#5aa9e6'), mid = new THREE.Color('#bfe6ff'), hi = new THREE.Color('#ffffff'), c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const t = (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y);
        if (t < 0.5) c.lerpColors(lo, mid, t * 2); else c.lerpColors(mid, hi, (t - 0.5) * 2);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      mat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 90, specular: 0x99ccff, emissive: 0x16324a });
    }
    return { geo, mat, height: bb.max.y - bb.min.y, minY: bb.min.y };
  }).catch(e => { console.warn(name + ' 랜드마크 로드 실패', e); return null; });
  return lmCache[name];
}
export function preloadLandmarks() { for (const n of Object.keys(LM_FILES)) loadLandmark(n); }
const ARCH_GAP = 0.26;   // 아치 모델의 통로 폭(모델 단위)

export const THEMES = {
  village: { top: '#2f8fff', hor: '#d8f1ff', fog: '#cfeaff', ground: '#69c04a', ground2: '#5cb23f', road: '#5b616d', line: '#ffffff', curbA: '#ff4d42', curbB: '#ffffff', wallA: '#ffffff', wallB: '#3aa0ff', deck: '#8a8f99', sun: 1.25, amb: 1.05, mount: '#7fbf6a' },
  desert: { top: '#ff9a4a', hor: '#ffe7b8', fog: '#ffe2ad', ground: '#e2b46a', ground2: '#d6a65c', road: '#6a5d55', line: '#fff3d0', curbA: '#ff7a1a', curbB: '#fff3d0', wallA: '#c9824a', wallB: '#f4d9a0', deck: '#b0763f', sun: 1.3, amb: 1.0, mount: '#c8834a' },
  ice: { top: '#3c7bd9', hor: '#e6f6ff', fog: '#dff2ff', ground: '#bfe4f7', ground2: '#d8f0fb', road: '#56677d', line: '#ffffff', curbA: '#38b6ff', curbB: '#ffffff', wallA: '#e8f8ff', wallB: '#8fd2ff', deck: '#7f95ad', sun: 1.2, amb: 1.15, mount: '#eaf6ff' },
  city: { top: '#0a0b24', hor: '#3a2a6a', fog: '#2a2152', ground: '#1b1c2e', ground2: '#23243a', road: '#3a3d4e', line: '#ffe66a', curbA: '#ff3fa4', curbB: '#2ef2ff', wallA: '#2ef2ff', wallB: '#151628', deck: '#2a2c40', sun: 0.55, amb: 1.25, mount: '#1a1840', night: true },
};

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4; return t;
}

// 트랙을 따라가는 띠 (lat/dy는 숫자 또는 (i)=>숫자)
function strip(T, lat0, dy0, lat1, dy1, vLen, u0 = 0, u1 = 1) {
  const N = T.n, pos = new Float32Array((N + 1) * 6), uv = new Float32Array((N + 1) * 4), idx = [];
  const f = v => typeof v === 'function' ? v : () => v;
  const L0 = f(lat0), D0 = f(dy0), L1 = f(lat1), D1 = f(dy1);
  for (let r = 0; r <= N; r++) {
    const i = r % N, a = L0(i), b = L1(i);
    pos[r * 6] = T.x[i] + T.nx[i] * a; pos[r * 6 + 1] = T.y[i] + D0(i); pos[r * 6 + 2] = T.z[i] + T.nz[i] * a;
    pos[r * 6 + 3] = T.x[i] + T.nx[i] * b; pos[r * 6 + 4] = T.y[i] + D1(i); pos[r * 6 + 5] = T.z[i] + T.nz[i] * b;
    const v = r * T.ds / vLen;
    uv[r * 4] = u0; uv[r * 4 + 1] = v; uv[r * 4 + 2] = u1; uv[r * 4 + 3] = v;
    if (r < N) { const k = r * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function instanced(geo, mat, items) {
  const m = new THREE.InstancedMesh(geo, mat, items.length);
  const o = new THREE.Object3D(), c = new THREE.Color();
  items.forEach((it, i) => {
    o.position.set(it.x, it.y || 0, it.z); o.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0);
    o.scale.set(it.sx ?? it.s ?? 1, it.sy ?? it.s ?? 1, it.sz ?? it.s ?? 1); o.updateMatrix();
    m.setMatrixAt(i, o.matrix); if (it.c !== undefined) m.setColorAt(i, c.set(it.c));
  });
  m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.frustumCulled = false;
  return m;
}

export function buildWorld(T) {
  const th = THEMES[T.def.theme] || THEMES.village;
  const g = new THREE.Group();
  const R = rng(T.def.id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  const disposables = [];
  const L = (geo, mat) => { const m = new THREE.Mesh(geo, mat); g.add(m); disposables.push(geo); return m; };
  const lam = (opt) => { const m = new THREE.MeshLambertMaterial(opt); disposables.push(m); if (opt.map) disposables.push(opt.map); return m; };

  // ----- 하늘 -----
  const skyGeo = new THREE.SphereGeometry(1400, 24, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(th.top) }, hor: { value: new THREE.Color(th.hor) } },
    vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 hor; varying float h; void main(){ float t = pow(clamp(h*1.25,0.0,1.0),0.6); gl_FragColor = vec4(mix(hor, top, t),1.0);\n#include <colorspace_fragment>\n }',
  });
  const sky = new THREE.Mesh(skyGeo, skyMat); sky.renderOrder = -10; g.add(sky); disposables.push(skyGeo, skyMat);

  // ----- 땅 -----
  const groundTex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = th.ground; c.fillRect(0, 0, w, h);
    if (th.night) { c.strokeStyle = 'rgba(120,130,255,0.25)'; c.lineWidth = 2; for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(i * 64, 0); c.lineTo(i * 64, h); c.moveTo(0, i * 64); c.lineTo(w, i * 64); c.stroke(); } }
    else for (let i = 0; i < 260; i++) { c.fillStyle = i % 2 ? th.ground2 : 'rgba(255,255,255,0.06)'; const s = 4 + R() * 14; c.beginPath(); c.ellipse(R() * w, R() * h, s, s * 0.6, R() * 3, 0, 7); c.fill(); }
  });
  groundTex.repeat.set(90, 90);
  const ground = L(new THREE.PlaneGeometry(3200, 3200), lam({ map: groundTex }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.06;
  let cx = 0, cz = 0; for (let i = 0; i < T.n; i++) { cx += T.x[i]; cz += T.z[i]; } cx /= T.n; cz /= T.n;
  ground.position.x = cx; ground.position.z = cz; sky.position.set(cx, 0, cz);

  // ----- 도로 -----
  const roadTex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = th.road; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) { c.fillStyle = `rgba(${R() > 0.5 ? '255,255,255' : '0,0,0'},${0.03 + R() * 0.05})`; c.fillRect(R() * w, R() * h, 2, 2); }
    // 연석 (양 끝 빨강/흰색)
    const cw = 16;
    for (let k = 0; k < 4; k++) { c.fillStyle = k % 2 ? th.curbA : th.curbB; c.fillRect(0, k * 64, cw, 64); c.fillRect(w - cw, k * 64, cw, 64); }
    c.fillStyle = th.line; c.fillRect(cw + 3, 0, 4, h); c.fillRect(w - cw - 7, 0, 4, h);
    c.globalAlpha = 0.85; c.fillRect(w / 2 - 2.5, 0, 5, 64); c.fillRect(w / 2 - 2.5, 128, 5, 64); c.globalAlpha = 1;
  });
  const hwf = i => T.hw[i];
  L(strip(T, hwf, 0.02, i => -T.hw[i], 0.02, 16), lam({ map: roadTex, side: THREE.DoubleSide }));

  // ----- 벽 -----
  const wallTex = canvasTex(128, 64, (c, w, h) => {
    c.fillStyle = th.wallA; c.fillRect(0, 0, w, h); c.fillStyle = th.wallB; c.fillRect(0, 0, w / 2, h);
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(0, h - 10, w, 10); c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(0, 0, w, 6);
  });
  const wallMat = th.night
    ? new THREE.MeshBasicMaterial({ map: wallTex, side: THREE.DoubleSide })
    : lam({ map: wallTex, side: THREE.DoubleSide });
  disposables.push(wallMat, wallTex);
  const WH = 1.0, WT = 0.6;
  const deckD = i => -(Math.min(T.y[i], 1.3) + 0.08);
  const deckMat = lam({ color: th.deck, side: THREE.DoubleSide });
  for (const s of [1, -1]) {
    L(strip(T, i => s * (T.hw[i] + 0.05), 0, i => s * (T.hw[i] + 0.05), WH, 4), wallMat);
    L(strip(T, i => s * (T.hw[i] + 0.05), WH, i => s * (T.hw[i] + WT), WH, 4, 0, 0.5), wallMat);
    L(strip(T, i => s * (T.hw[i] + WT), WH, i => s * (T.hw[i] + WT), deckD, 4), deckMat);
  }
  // 고가 구간 바닥면
  let hasHigh = false; for (let i = 0; i < T.n; i++) if (T.y[i] > 1.5) { hasHigh = true; break; }
  if (hasHigh) L(strip(T, i => T.hw[i] + WT, deckD, i => -(T.hw[i] + WT), deckD, 16), deckMat);

  // ----- 트랙 근처 검사용 격자 -----
  const CELL = 20, grid = new Map();
  for (let i = 0; i < T.n; i++) { const k = Math.floor(T.x[i] / CELL) + ',' + Math.floor(T.z[i] / CELL); (grid.get(k) || grid.set(k, []).get(k)).push(i); }
  const nearTrack = (x, z, margin, skipFrom = -1, skipWin = 0) => {
    const gx = Math.floor(x / CELL), gz = Math.floor(z / CELL), rr = Math.ceil((margin + 12) / CELL);
    for (let a = -rr; a <= rr; a++) for (let b = -rr; b <= rr; b++) {
      const l = grid.get((gx + a) + ',' + (gz + b)); if (!l) continue;
      for (const i of l) {
        if (skipFrom >= 0) { let d = Math.abs(i - skipFrom); d = Math.min(d, T.n - d); if (d < skipWin) continue; }
        if (Math.hypot(T.x[i] - x, T.z[i] - z) < T.hw[i] + margin) return true;
      }
    }
    return false;
  };

  // ----- 랜드마크 자리 미리 정하기 (그 자리에는 나무·건물을 심지 않는다) -----
  const lmPlan = [];
  for (const d of (LANDMARKS[T.def.theme] || [])) {
    if (d.over !== undefined) {
      const i = Math.floor(d.over * T.n) % T.n, w = d.open / ARCH_GAP;
      lmPlan.push({ m: d.m, open: d.open, x: T.x[i], z: T.z[i], y: T.y[i] - 0.3, ry: Math.atan2(T.tx[i], T.tz[i]), r: w * 0.55 });
    } else if (d.at !== undefined) {
      const i = Math.floor(d.at * T.n) % T.n;
      const place = sd => [T.x[i] + T.nx[i] * sd * (T.hw[i] + d.off), T.z[i] + T.nz[i] * sd * (T.hw[i] + d.off)];
      let [x, z] = place(d.side);
      if (nearTrack(x, z, 7, i, 24)) [x, z] = place(-d.side);
      if (nearTrack(x, z, 5, i, 24)) continue;
      lmPlan.push({ m: d.m, h: d.h, x, z, y: 0, ry: Math.atan2(T.x[i] - x, T.z[i] - z), r: d.h * (d.m === 'neon' ? 0.22 : 0.6) });
    } else lmPlan.push({ m: d.m, h: d.h, x: d.x, z: d.z, y: 0, ry: d.ry || 0, r: d.h * 0.62 });
  }
  const inLandmark = (x, z) => lmPlan.some(l => Math.hypot(l.x - x, l.z - z) < l.r);

  // ----- 고가 기둥 -----
  const pillars = [];
  for (let i = 0; i < T.n; i += 8) {
    if (T.y[i] < 2.2) continue;
    if (nearTrack(T.x[i], T.z[i], 3, i, 30)) continue;
    pillars.push({ x: T.x[i], z: T.z[i], y: (T.y[i] - 1.2) / 2, sx: 2.4, sy: T.y[i] - 1.2, sz: 2.4, ry: Math.atan2(T.tx[i], T.tz[i]) });
  }
  const box = new THREE.BoxGeometry(1, 1, 1); disposables.push(box);
  if (pillars.length) g.add(instanced(box, deckMat, pillars));

  // ----- 출발선 + 게이트 -----
  const chk = canvasTex(128, 32, (c, w, h) => { for (let a = 0; a < 16; a++) for (let b = 0; b < 4; b++) { c.fillStyle = (a + b) % 2 ? '#111' : '#fff'; c.fillRect(a * 8, b * 8, 8, 8); } }, false);
  {
    const i = 0, hw = T.hw[0], tx = T.tx[0], tz = T.tz[0], nx = T.nx[0], nz = T.nz[0], y = T.y[0] + 0.05;
    const q = new THREE.BufferGeometry();
    const a = [T.x[0] + nx * hw - tx * 1.5, y, T.z[0] + nz * hw - tz * 1.5], b = [T.x[0] - nx * hw - tx * 1.5, y, T.z[0] - nz * hw - tz * 1.5];
    const c2 = [T.x[0] + nx * hw + tx * 1.5, y, T.z[0] + nz * hw + tz * 1.5], d = [T.x[0] - nx * hw + tx * 1.5, y, T.z[0] - nz * hw + tz * 1.5];
    q.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c2, ...d], 3));
    q.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2)); q.setIndex([0, 1, 2, 1, 3, 2]);
    const m = new THREE.Mesh(q, new THREE.MeshBasicMaterial({ map: chk, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 })); g.add(m); disposables.push(q, m.material, chk);
    // 게이트
    const gate = new THREE.Group(); gate.position.set(T.x[0], T.y[0], T.z[0]); gate.rotation.y = Math.atan2(tx, tz);
    const postM = lam({ color: th.night ? '#2ef2ff' : '#ff4d42' });
    for (const s of [1, -1]) { const p = new THREE.Mesh(box, postM); p.scale.set(0.9, 8, 0.9); p.position.set(s * (hw + 1.2), 4, 0); gate.add(p); }
    const banner = canvasTex(1024, 128, (c, w, h) => {
      c.fillStyle = '#16181f'; c.fillRect(0, 0, w, h);
      for (let a = 0; a < 64; a++) for (let b = 0; b < 2; b++) { c.fillStyle = (a + b) % 2 ? '#111' : '#fff'; c.fillRect(a * 16, b * 16, 16, 16); c.fillRect(a * 16, h - 32 + b * 16, 16, 16); }
      c.fillStyle = '#ffd23c'; c.font = '900 62px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('T U R B O   D R I F T E R', w / 2, h / 2 + 2);
    }, false);
    const bm = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2 + 3.4, 2.6), new THREE.MeshBasicMaterial({ map: banner, side: THREE.DoubleSide }));
    bm.position.set(0, 7.2, 0); bm.rotation.y = Math.PI; gate.add(bm); disposables.push(bm.geometry, bm.material, banner);
    g.add(gate);
  }

  // ----- 부스터 발판 -----
  const padTex = canvasTex(64, 64, (c, w, h) => {
    c.fillStyle = '#ff7a00'; c.fillRect(0, 0, w, h); c.strokeStyle = '#fff36a'; c.lineWidth = 9; c.lineJoin = 'miter';
    for (let k = -1; k < 3; k++) { c.beginPath(); c.moveTo(6, k * 32 + 4); c.lineTo(32, k * 32 + 26); c.lineTo(58, k * 32 + 4); c.stroke(); }
  });
  const padMat = new THREE.MeshBasicMaterial({ map: padTex, polygonOffset: true, polygonOffsetFactor: -3, side: THREE.DoubleSide }); disposables.push(padMat, padTex);
  for (const p of T.pads) {
    const pos = [], uv = [], idx = [];
    for (let r = 0; r <= p.len; r++) {
      const i = (p.i + r) % T.n;
      pos.push(T.x[i] + T.nx[i] * 3.2, T.y[i] + 0.06, T.z[i] + T.nz[i] * 3.2, T.x[i] - T.nx[i] * 3.2, T.y[i] + 0.06, T.z[i] - T.nz[i] * 3.2);
      uv.push(0, r * 0.5, 1, r * 0.5); if (r < p.len) { const k = r * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const q = new THREE.BufferGeometry(); q.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); q.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); q.setIndex(idx);
    g.add(new THREE.Mesh(q, padMat)); disposables.push(q);
  }

  // ----- 코너 화살표 표지판 -----
  const arrowTex = canvasTex(64, 32, (c, w, h) => {
    c.fillStyle = th.night ? '#ff3fa4' : '#ffd23c'; c.fillRect(0, 0, w, h); c.fillStyle = '#16181f';
    c.beginPath(); c.moveTo(14, 4); c.lineTo(34, 4); c.lineTo(50, 16); c.lineTo(34, 28); c.lineTo(14, 28); c.lineTo(30, 16); c.closePath(); c.fill();
  });
  {
    const pos = [], uv = [], idx = []; let k = 0;
    for (let i = 0; i < T.n; i += 3) {
      if (Math.abs(T.curv[i]) < 0.017) continue;
      const s = -Math.sign(T.curv[i]); // 코너 바깥쪽
      const bx = T.x[i] + T.nx[i] * s * (T.hw[i] + 0.3), bz = T.z[i] + T.nz[i] * s * (T.hw[i] + 0.3), y = T.y[i];
      const ax = bx - T.tx[i] * 2.6, az = bz - T.tz[i] * 2.6, ex = bx + T.tx[i] * 2.6, ez = bz + T.tz[i] * 2.6;
      pos.push(ax, y + 1.1, az, ex, y + 1.1, ez, ax, y + 2.5, az, ex, y + 2.5, ez);
      uv.push(0, 0, 2, 0, 0, 1, 2, 1); idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); k += 4;
    }
    if (k) {
      const q = new THREE.BufferGeometry(); q.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); q.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); q.setIndex(idx);
      const m = new THREE.Mesh(q, new THREE.MeshBasicMaterial({ map: arrowTex, side: THREE.DoubleSide })); g.add(m); disposables.push(q, m.material, arrowTex);
    }
  }

  // ----- 배경 소품 -----
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < T.n; i++) { minX = Math.min(minX, T.x[i]); maxX = Math.max(maxX, T.x[i]); minZ = Math.min(minZ, T.z[i]); maxZ = Math.max(maxZ, T.z[i]); }
  const spots = (count, margin, pad = 110) => {
    const out = []; let tries = 0;
    while (out.length < count && tries++ < count * 30) {
      const x = minX - pad + R() * (maxX - minX + pad * 2), z = minZ - pad + R() * (maxZ - minZ + pad * 2);
      if (!nearTrack(x, z, margin) && !inLandmark(x, z)) out.push({ x, z });
    }
    return out;
  };
  const cone = new THREE.ConeGeometry(1, 1, 7), cyl = new THREE.CylinderGeometry(1, 1, 1, 8), sph = new THREE.SphereGeometry(1, 10, 8);
  disposables.push(cone, cyl, sph);
  const white = lam({ color: '#ffffff' });
  const add = (geo, items, mat = white) => { if (items.length) g.add(instanced(geo, mat, items)); };
  const theme = T.def.theme;

  if (theme === 'village') {
    const trunks = [], leaves = [], leaves2 = [];
    for (const p of spots(230, 5)) { const s = 0.8 + R() * 0.9; trunks.push({ ...p, y: 1.2 * s, sx: 0.35 * s, sy: 2.4 * s, sz: 0.35 * s, c: '#8a5a34' }); const col = ['#3f9d3a', '#4fb548', '#2f8a3c', '#6cc24a'][Math.floor(R() * 4)]; leaves.push({ ...p, y: 4.2 * s, sx: 2.3 * s, sy: 4.4 * s, sz: 2.3 * s, c: col }); leaves2.push({ ...p, y: 6.3 * s, sx: 1.6 * s, sy: 3.2 * s, sz: 1.6 * s, c: col }); }
    add(cyl, trunks); add(cone, leaves); add(cone, leaves2);
    const walls = [], roofs = [];
    for (const p of spots(46, 12)) { const w = 7 + R() * 5, h = 4.5 + R() * 3, ry = Math.floor(R() * 4) * Math.PI / 2 + (R() - 0.5) * 0.3; walls.push({ ...p, y: h / 2, sx: w, sy: h, sz: w * 0.85, ry, c: ['#fff1d6', '#ffe0c2', '#e9f4ff', '#fff7ea'][Math.floor(R() * 4)] }); roofs.push({ ...p, y: h + 1.8, sx: w * 0.82, sy: 3.6, sz: w * 0.82, ry: ry + Math.PI / 4, c: ['#ff6b5a', '#3aa0ff', '#ffb02e', '#8b5cf6'][Math.floor(R() * 4)] }); }
    add(box, walls); add(new THREE.ConeGeometry(1, 1, 4), roofs);
    const hay = []; for (const p of spots(40, 3.5, 40)) hay.push({ ...p, y: 0.7, sx: 0.9, sy: 1.4, sz: 0.9, rx: Math.PI / 2, ry: R() * 3, c: '#f1c75a' }); add(cyl, hay);
  } else if (theme === 'desert') {
    const st = [], arm = [];
    for (const p of spots(120, 4.5)) { const s = 0.8 + R() * 1.0, c = '#3f9a55'; st.push({ ...p, y: 2.2 * s, sx: 0.5 * s, sy: 4.4 * s, sz: 0.5 * s, c }); arm.push({ x: p.x + 0.9 * s, z: p.z, y: 2.6 * s, sx: 0.32 * s, sy: 1.8 * s, sz: 0.32 * s, c }, { x: p.x - 0.9 * s, z: p.z, y: 3.2 * s, sx: 0.32 * s, sy: 1.5 * s, sz: 0.32 * s, c }); }
    add(cyl, st); add(cyl, arm);
    const mesa = [];
    for (const p of spots(60, 16, 160)) { const w = 10 + R() * 22, h = 8 + R() * 26; mesa.push({ ...p, y: h / 2, sx: w, sy: h, sz: w * (0.7 + R() * 0.5), ry: R() * 3, c: ['#c9743a', '#b8632f', '#d98a4a'][Math.floor(R() * 3)] }); mesa.push({ ...p, y: h + 1.2, sx: w * 0.8, sy: 2.4, sz: w * 0.7, ry: R() * 3, c: '#e2a05c' }); }
    add(cyl, mesa);
    const rocks = []; for (const p of spots(140, 3.5)) { const s = 0.6 + R() * 1.6; rocks.push({ ...p, y: s * 0.4, sx: s, sy: s * 0.7, sz: s * 1.2, ry: R() * 3, c: '#b98a5a' }); } add(sph, rocks);
  } else if (theme === 'ice') {
    const trunks = [], l1 = [], l2 = [], snow = [];
    for (const p of spots(170, 5)) { const s = 0.9 + R() * 0.9; trunks.push({ ...p, y: 1.0 * s, sx: 0.3 * s, sy: 2 * s, sz: 0.3 * s, c: '#6b4a34' }); l1.push({ ...p, y: 3.8 * s, sx: 2.2 * s, sy: 4.4 * s, sz: 2.2 * s, c: '#2f7d6a' }); l2.push({ ...p, y: 6.2 * s, sx: 1.5 * s, sy: 3.4 * s, sz: 1.5 * s, c: '#3a8f7a' }); snow.push({ ...p, y: 7.6 * s, sx: 0.9 * s, sy: 1.5 * s, sz: 0.9 * s, c: '#ffffff' }); }
    add(cyl, trunks); add(cone, l1); add(cone, l2); add(cone, snow);
    const spikes = []; for (const p of spots(90, 6, 150)) { const s = 2 + R() * 7; spikes.push({ ...p, y: s * 1.4, sx: s * 0.7, sy: s * 2.8, sz: s * 0.7, rz: (R() - 0.5) * 0.3, c: ['#bfe9ff', '#9fd8ff', '#e6f7ff'][Math.floor(R() * 3)] }); } add(cone, spikes);
    const sm = [];
    for (const p of spots(28, 3.5, 30)) { sm.push({ ...p, y: 0.8, s: 0.9, c: '#fff' }, { ...p, y: 2.0, s: 0.65, c: '#fff' }, { ...p, y: 2.95, s: 0.45, c: '#fff' }); }
    add(sph, sm);
    const igloo = []; for (const p of spots(14, 10)) igloo.push({ ...p, y: 0, sx: 5, sy: 4, sz: 5, c: '#f2fbff' }); add(sph, igloo);
  } else if (theme === 'city') {
    const winTex = canvasTex(64, 128, (c, w, h) => { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); for (let a = 0; a < 4; a++) for (let b = 0; b < 10; b++) { if (R() < 0.62) { c.fillStyle = ['#ffe9a8', '#9fe8ff', '#ffb3e6', '#fff'][Math.floor(R() * 4)]; c.fillRect(a * 16 + 3, b * 12.8 + 3, 10, 7); } } });
    const bMat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveMap: winTex, emissiveIntensity: 1.0 }); disposables.push(bMat, winTex);
    const bl = [];
    for (const p of spots(150, 14, 170)) { const w = 12 + R() * 16, h = 18 + R() * 70; bl.push({ ...p, y: h / 2, sx: w, sy: h, sz: 12 + R() * 16, ry: Math.floor(R() * 2) * Math.PI / 2, c: ['#2a2d55', '#352a5c', '#1f2a4a', '#3a2350'][Math.floor(R() * 4)] }); }
    add(box, bl, bMat);
    // 가로등
    const poles = [], bulbs = [];
    for (let i = 0; i < T.n; i += 14) { const s = (i / 14) % 2 ? 1 : -1; const x = T.x[i] + T.nx[i] * s * (T.hw[i] + 1.6), z = T.z[i] + T.nz[i] * s * (T.hw[i] + 1.6); poles.push({ x, z, y: T.y[i] + 3.5, sx: 0.14, sy: 7, sz: 0.14, c: '#3a3d55' }); bulbs.push({ x: x - T.nx[i] * s * 0.8, z: z - T.nz[i] * s * 0.8, y: T.y[i] + 7, s: 0.42 }); }
    add(cyl, poles);
    const bulbMat = new THREE.MeshBasicMaterial({ color: '#ffe9a8' }); disposables.push(bulbMat); add(sph, bulbs, bulbMat);
    // 별
    const sp = []; for (let i = 0; i < 500; i++) { const a = R() * 6.28, e = 0.12 + R() * 1.3, r = 1250; sp.push(cx + Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, cz + Math.sin(a) * Math.cos(e) * r); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, fog: false })); g.add(stars); disposables.push(sg, stars.material);
  }
  // 구름 + 먼 산
  if (!th.night) { const cl = []; for (let i = 0; i < 46; i++) { const a = R() * 6.28, d = 150 + R() * 800, s = 14 + R() * 26; cl.push({ x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d, y: 110 + R() * 90, sx: s * 2.2, sy: s * 0.55, sz: s * 1.3, c: '#ffffff' }); } const cm = new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false, transparent: true, opacity: 0.92 }); disposables.push(cm); add(sph, cl, cm); }
  { const mt = []; const span = Math.max(maxX - minX, maxZ - minZ) / 2; for (let i = 0; i < 34; i++) { const a = i / 34 * 6.283 + R() * 0.1, d = span + 330 + R() * 260, h = 60 + R() * 150; mt.push({ x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d, y: h / 2 - 2, sx: 90 + R() * 110, sy: h, sz: 90 + R() * 110, ry: R() * 3, c: th.mount }); } add(theme === 'city' ? box : cone, mt, lam({ color: '#ffffff' })); }

  // ----- 랜드마크 세우기 -----
  let dead = false;
  for (const d of lmPlan) {
    loadLandmark(d.m).then(L => {
      if (!L || dead) return;
      const m = new THREE.Mesh(L.geo, L.mat);
      const sc = d.open ? d.open / ARCH_GAP : d.h / L.height;
      m.scale.setScalar(sc); m.position.set(d.x, d.y - L.minY * sc, d.z); m.rotation.y = d.ry;
      g.add(m);
    });
  }

  // ----- 조명 -----
  const hemi = new THREE.HemisphereLight(th.night ? '#8f9cff' : '#ffffff', th.night ? '#3a2a5a' : th.ground, th.amb * 1.6);
  const sun = new THREE.DirectionalLight('#ffffff', th.sun * 1.6); sun.position.set(0.5, 1, 0.3);
  g.add(hemi, sun);

  return {
    group: g, theme: th, fog: new THREE.Fog(th.fog, th.night ? 120 : 220, th.night ? 900 : 1250),
    update(t) { padTex.offset.y = -t * 2.2; },
    dispose() { dead = true; for (const d of disposables) d.dispose && d.dispose(); g.traverse(o => { if (o.isInstancedMesh) o.dispose(); }); },
  };
}

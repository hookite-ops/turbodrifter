// 트랙 3D 세계 만들기 — 도로, 벽, 기둥, 배경 소품
import * as THREE from '../lib/three.bundle.js';
import { GLTFLoader } from '../lib/three.bundle.js';
import { buildFeatures } from './features.js';
import { moverModels } from './movers.js';

// ----- 랜드마크 (Tripo로 만든 모델) -----
// at: 트랙 위치(0~1), side: 왼쪽 +1 / 오른쪽 -1, off: 벽에서 떨어진 거리(m), h: 높이(m)
// over: 도로 위를 가로지르는 아치(통로 폭 open m), x/z: 고정 좌표
const LM_FILES = { windmill: 'assets/lm_windmill.glb', arch: 'assets/lm_arch.glb', castle: 'assets/lm_castle.glb', neon: 'assets/lm_neon.glb' };
const LANDMARKS = {
  village: [{ m: 'windmill', at: 0.05, side: 1, off: 14, h: 22 }, { m: 'windmill', at: 0.36, side: -1, off: 16, h: 18 }, { m: 'windmill', at: 0.7, side: 1, off: 15, h: 20 }],
  desert: [{ m: 'arch', over: 0.035, open: 19 }, { m: 'arch', at: 0.3, side: 1, off: 30, h: 34 }, { m: 'arch', at: 0.62, side: 1, off: 30, h: 38 }],
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
    // 바닥 근처(아래 15%) 꼭짓점의 폭 — 좁은 자리에 맞춰 세울 때 쓴다
    const P = geo.attributes.position, lim = bb.min.y + (bb.max.y - bb.min.y) * 0.15; let bw = 0;
    const cxm = (bb.min.x + bb.max.x) / 2, czm = (bb.min.z + bb.max.z) / 2;
    for (let i = 0; i < P.count; i++) if (P.getY(i) < lim) bw = Math.max(bw, Math.hypot(P.getX(i) - cxm, P.getZ(i) - czm));
    return { geo, mat, height: bb.max.y - bb.min.y, minY: bb.min.y, baseR: bw || (bb.max.x - bb.min.x) / 2, cx: cxm, cz: czm };
  }).catch(e => { console.warn(name + ' 랜드마크 로드 실패', e); return null; });
  return lmCache[name];
}
export function preloadLandmarks() { for (const n of Object.keys(LM_FILES)) loadLandmark(n); }
const ARCH_GAP = 0.26;   // 아치 모델의 통로 폭(모델 단위)


export const THEMES = {
  village: { top: '#2a86f5', hor: '#d9f1ff', fog: '#cfe9fb', ground: '#6fc04c', ground2: '#58a83c', shoulder: '#b99a62', road: '#565b66', line: '#ffffff', curbA: '#ff4d42', curbB: '#ffffff', wallA: '#ffffff', wallB: '#2f8fff', deck: '#8a8f99', sun: 1.35, amb: 1.0, mount: '#7db968', mount2: '#a8cfa0', amp: 15, sunDir: [0.45, 0.72, 0.35], sunCol: '#fff3c9' },
  desert: { cliff: '#b8653a', top: '#f58a3c', hor: '#ffe9bd', fog: '#ffe1ad', ground: '#e3b56b', ground2: '#cf9a52', shoulder: '#c98d52', road: '#66594f', line: '#fff3d0', curbA: '#ff7a1a', curbB: '#fff3d0', wallA: '#c9824a', wallB: '#f4d9a0', deck: '#a8733f', sun: 1.4, amb: 0.95, mount: '#c57e45', mount2: '#e2a56a', amp: 20, sunDir: [-0.5, 0.5, 0.5], sunCol: '#ffd9a0' },
  ice: { cliff: '#d9eefa', top: '#3c7bd9', hor: '#e9f7ff', fog: '#dff2ff', ground: '#eaf6ff', ground2: '#c3e3f7', shoulder: '#b5d8ee', road: '#55667c', line: '#ffffff', curbA: '#38b6ff', curbB: '#ffffff', wallA: '#e8f8ff', wallB: '#8fd2ff', deck: '#7f95ad', sun: 1.25, amb: 1.1, mount: '#cfe6f7', mount2: '#ffffff', amp: 12, sunDir: [0.3, 0.6, -0.6], sunCol: '#ffffff' },
  city: { top: '#090a22', hor: '#3d2a6e', fog: '#2a2152', ground: '#1c1d30', ground2: '#25263e', shoulder: '#30324d', road: '#3a3d4e', line: '#ffe66a', curbA: '#ff3fa4', curbB: '#2ef2ff', wallA: '#2ef2ff', wallB: '#151628', deck: '#2a2c40', sun: 0.6, amb: 1.25, mount: '#1a1840', mount2: '#2a2460', amp: 1.2, sunDir: [0.2, 0.8, 0.4], sunCol: '#b9a8ff', night: true },
};
const ADS = [
  ['TURBO COLA', '#e8332b', '#ffffff'], ['드리프트 킹 타이어', '#ffd21e', '#1c1f2b'], ['부릉 주유소', '#1f9d55', '#ffffff'],
  ['번개 배터리', '#2f6df6', '#ffe14a'], ['말랑 젤리', '#ff6fb1', '#ffffff'], ['BOOST UP 에너지', '#1c1f2b', '#29b6ff'],
];

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 8; return t;
}

// 트랙을 따라가는 띠 (lat/dy는 숫자 또는 (i)=>숫자). i0..i1 구간만 만들 수도 있다.
function strip(T, lat0, dy0, lat1, dy1, vLen, u0 = 0, u1 = 1, i0 = 0, count = T.n) {
  const N = T.n, pos = new Float32Array((count + 1) * 6), uv = new Float32Array((count + 1) * 4), idx = [];
  const f = v => typeof v === 'function' ? v : () => v;
  const L0 = f(lat0), D0 = f(dy0), L1 = f(lat1), D1 = f(dy1);
  for (let r = 0; r <= count; r++) {
    const i = (i0 + r) % N, a = L0(i, r), b = L1(i, r);
    pos[r * 6] = T.x[i] + T.nx[i] * a; pos[r * 6 + 1] = T.y[i] + D0(i, r); pos[r * 6 + 2] = T.z[i] + T.nz[i] * a;
    pos[r * 6 + 3] = T.x[i] + T.nx[i] * b; pos[r * 6 + 4] = T.y[i] + D1(i, r); pos[r * 6 + 5] = T.z[i] + T.nz[i] * b;
    const v = vLen ? r * T.ds / vLen : r / count;   // vLen 0이면 구간 전체를 0~1로
    uv[r * 4] = u0; uv[r * 4 + 1] = v; uv[r * 4 + 2] = u1; uv[r * 4 + 3] = v;
    if (r < count) { const k = r * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function instanced(geo, mat, items, shadow) {
  const m = new THREE.InstancedMesh(geo, mat, items.length);
  const o = new THREE.Object3D(), c = new THREE.Color();
  items.forEach((it, i) => {
    o.position.set(it.x, it.y || 0, it.z); o.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0);
    o.scale.set(it.sx ?? it.s ?? 1, it.sy ?? it.s ?? 1, it.sz ?? it.s ?? 1); o.updateMatrix();
    m.setMatrixAt(i, o.matrix); if (it.c !== undefined) m.setColorAt(i, c.set(it.c));
  });
  m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.frustumCulled = false; m.castShadow = !!shadow;
  return m;
}

// opt.hq = true면 실시간 그림자를 켠다 (PC)
export function buildWorld(T, opt = {}) {
  const hq = !!opt.hq;
  const theme = T.def.theme, th = THEMES[theme] || THEMES.village;
  const g = new THREE.Group();
  const R = rng(T.def.id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  const disposables = [];
  const L = (geo, mat) => { const m = new THREE.Mesh(geo, mat); g.add(m); disposables.push(geo); return m; };
  const lam = (o) => { const m = new THREE.MeshLambertMaterial(o); disposables.push(m); if (o.map) disposables.push(o.map); return m; };
  const basic = (o) => { const m = new THREE.MeshBasicMaterial(o); disposables.push(m); if (o.map) disposables.push(o.map); return m; };
  const N = T.n;
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9, cx = 0, cz = 0;
  for (let i = 0; i < N; i++) { minX = Math.min(minX, T.x[i]); maxX = Math.max(maxX, T.x[i]); minZ = Math.min(minZ, T.z[i]); maxZ = Math.max(maxZ, T.z[i]); cx += T.x[i]; cz += T.z[i]; }
  cx /= N; cz /= N;

  // ----- 하늘 (그라데이션 + 해) -----
  const sunDir = new THREE.Vector3(...th.sunDir).normalize();
  const skyGeo = new THREE.SphereGeometry(1500, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(th.top) }, hor: { value: new THREE.Color(th.hor) }, sunDir: { value: sunDir }, sunCol: { value: new THREE.Color(th.sunCol) }, night: { value: th.night ? 1 : 0 } },
    vertexShader: 'varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; uniform float night; varying vec3 d;
      void main(){ vec3 n = normalize(d); float t = pow(clamp(n.y*1.2,0.0,1.0),0.55); vec3 c = mix(hor, top, t);
        float s = max(dot(n, sunDir), 0.0);
        c += sunCol * (pow(s, 600.0) * 3.0 + pow(s, 40.0) * 0.35 + pow(s, 6.0) * 0.12) * (1.0 - night * 0.6);
        c = mix(c, hor * 1.05, smoothstep(0.08, 0.0, n.y) * 0.8);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat); sky.renderOrder = -10; sky.position.set(cx, 0, cz); g.add(sky); disposables.push(skyGeo, skyMat);

  // ----- 트랙 근처 검사용 격자 -----
  // 본 트랙 + 지름길 점을 한 배열로 (지형·소품 배치용)
  const SCs = T.shortcuts || [];
  const TOT = N + SCs.reduce((a, S) => a + S.n, 0);
  const PX = new Float32Array(TOT), PZ = new Float32Array(TOT), PY = new Float32Array(TOT), PW = new Float32Array(TOT), PC = new Float32Array(TOT);
  PX.set(T.x); PZ.set(T.z); PY.set(T.y); PW.set(T.hw); PC.set(T.cliff);
  { let o = N; for (const S of SCs) { PX.set(S.x, o); PZ.set(S.z, o); PY.set(S.y, o); PW.set(S.hw, o); PC.set(S.cliff, o); o += S.n; } }
  const CELL = 20, grid = new Map();
  for (let i = 0; i < TOT; i++) { const k = Math.floor(PX[i] / CELL) + ',' + Math.floor(PZ[i] / CELL); (grid.get(k) || grid.set(k, []).get(k)).push(i); }
  const nearTrack = (x, z, margin, skipFrom = -1, skipWin = 0) => {
    const gx = Math.floor(x / CELL), gz = Math.floor(z / CELL), rr = Math.ceil((margin + 12) / CELL);
    for (let a = -rr; a <= rr; a++) for (let b = -rr; b <= rr; b++) {
      const l = grid.get((gx + a) + ',' + (gz + b)); if (!l) continue;
      for (const i of l) {
        if (skipFrom >= 0 && i < N) { let d = Math.abs(i - skipFrom); d = Math.min(d, N - d); if (d < skipWin) continue; }
        if (Math.hypot(PX[i] - x, PZ[i] - z) < PW[i] + margin) return true;
      }
    }
    return false;
  };
  // ----- 점유 지도: 놓인 물체마다 바닥 원(x, z, r)을 등록하고, 새 물체는 빈자리에만 놓는다 -----
  const OC = 16, occ = new Map(), foot = []; let maxR = 0;
  const fits = (x, z, r) => {
    const gx = Math.floor(x / OC), gz = Math.floor(z / OC), rr = Math.ceil((r + maxR) / OC);
    for (let a = -rr; a <= rr; a++) for (let b = -rr; b <= rr; b++) {
      const l = occ.get((gx + a) + ',' + (gz + b)); if (!l) continue;
      for (const o of l) if (Math.hypot(o.x - x, o.z - z) < o.r + r) return false;
    }
    return true;
  };
  const take = (x, z, r, kind = '') => { const o = { x, z, r, kind }; if (r > maxR) maxR = r; const k = Math.floor(x / OC) + ',' + Math.floor(z / OC); (occ.get(k) || occ.set(k, []).get(k)).push(o); foot.push(o); return o; };
  // 도로 가장자리까지의 거리와, 그 근처 도로의 높이(겹치는 곳은 낮은 쪽)
  const cd = [], cy = [];
  const trackInfo = (x, z) => {
    const gx = Math.floor(x / CELL), gz = Math.floor(z / CELL); let n = 0, best = 1e9, bi = 0;
    for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) {
      const l = grid.get((gx + a) + ',' + (gz + b)); if (!l) continue;
      for (const i of l) { const d = Math.hypot(PX[i] - x, PZ[i] - z) - PW[i]; cd[n] = d; cy[n++] = PY[i]; if (d < best) { best = d; bi = i; } }
    }
    if (!n) return [90, 0, 0];
    let base = 1e9; for (let i = 0; i < n; i++) if (cd[i] <= best + 7 && cy[i] < base) base = cy[i];
    return [best, base, PC[bi]];
  };

  // 개울(도로를 가로지르는 물길)과 절벽 정보
  const streams = [];
  for (const z of T.zones) if (z.kind === 'water' && z.style === 'stream') {
    const i = (z.i + (z.cnt >> 1)) % N; let yw = 1e9; for (let q = 0; q <= z.cnt; q++) yw = Math.min(yw, T.y[(z.i + q) % N]);
    streams.push({ x: T.x[i], z: T.z[i], tx: T.tx[i], tz: T.tz[i], half: z.cnt * T.ds / 2 + 1, y: yw + 0.04 });
  }
  const streamCut = (x, z, h) => {
    for (const st of streams) {
      const a = Math.abs((x - st.x) * st.tx + (z - st.z) * st.tz);
      if (a < st.half + 9) { const k = 1 - smooth(st.half - 1, st.half + 9, a); h = h * (1 - k) + Math.min(h, st.y - 1.6) * k; }
    }
    return h;
  };
  // ----- 지형 (도로 옆은 도로 높이에 붙고, 멀어질수록 언덕) -----
  const perm = new Float32Array(4096); for (let i = 0; i < 4096; i++) perm[i] = R();
  const hsh = (ix, iz) => perm[((ix * 73856093) ^ (iz * 19349663)) & 4095];
  const vn = (x, z) => { const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz); const a = hsh(ix, iz), b = hsh(ix + 1, iz), c = hsh(ix, iz + 1), d = hsh(ix + 1, iz + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
  const noise = (x, z) => vn(x / 95, z / 95) * 0.65 + vn(x / 33, z / 33) * 0.35;
  const GCAP = T.def.ground ?? 1e9;
  const heightFrom = (x, z, edge, base, cl = 0) => {
    if (base > GCAP) base = GCAP;   // 다리 구간: 땅이 도로를 따라 올라가지 않아 아래가 비고 아치가 보인다
    let h = base * (1 - smooth(12, 75, edge)) - 0.45 * (1 - smooth(2.5, 9, edge)) + smooth(5, 60, edge) * (noise(x, z) - 0.33) * th.amp;
    if (cl > 0) h += cl * (smooth(0.8, 7, edge) * (14 + noise(x * 2, z * 2) * 16) * (1 - smooth(45, 90, edge) * 0.5));   // 절벽: 도로 바로 옆에서 솟는다
    return streams.length ? streamCut(x, z, h) : h;
  };
  const heightAt = (x, z) => { const [e, b, c] = trackInfo(x, z); return heightFrom(x, z, e, b, c); };
  {
    const PAD = 280, STEP = 7;
    const x0 = minX - PAD, z0 = minZ - PAD, nx = Math.ceil((maxX - minX + PAD * 2) / STEP), nz = Math.ceil((maxZ - minZ + PAD * 2) / STEP);
    const pos = new Float32Array((nx + 1) * (nz + 1) * 3), col = new Float32Array((nx + 1) * (nz + 1) * 3), idx = [];
    const _rock = new THREE.Color();
    const c1 = new THREE.Color(th.ground), c2 = new THREE.Color(th.ground2), cs = new THREE.Color(th.shoulder), c = new THREE.Color();
    let p = 0;
    for (let iz = 0; iz <= nz; iz++) for (let ix = 0; ix <= nx; ix++) {
      const x = x0 + ix * STEP, z = z0 + iz * STEP, [edge, base, cl] = trackInfo(x, z);
      const fade = Math.min(smooth(0, 60, ix * STEP), smooth(0, 60, (nx - ix) * STEP), smooth(0, 60, iz * STEP), smooth(0, 60, (nz - iz) * STEP));
      const h = heightFrom(x, z, edge, base, cl) * (edge > 60 ? fade : 1);
      pos[p] = x; pos[p + 1] = h; pos[p + 2] = z;
      const n2 = vn(x / 17, z / 17);
      c.copy(c1).lerp(c2, smooth(0.25, 0.75, n2 * 0.6 + noise(x + 300, z - 200) * 0.4));
      c.lerp(cs, (1 - smooth(1.5, 7, edge)) * 0.85);
      if (cl > 0) c.lerp(_rock.set(th.cliff || th.mount), cl * smooth(1, 4, edge) * (0.75 + 0.25 * n2));
      const lit = 0.92 + n2 * 0.16; col[p] = c.r * lit; col[p + 1] = c.g * lit; col[p + 2] = c.b * lit; p += 3;
    }
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) { const a = iz * (nx + 1) + ix, b = a + 1, d = a + nx + 1, e = d + 1; idx.push(a, d, b, b, d, e); }
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); tg.setAttribute('color', new THREE.BufferAttribute(col, 3)); tg.setIndex(idx); tg.computeVertexNormals();
    const terrain = L(tg, lam({ vertexColors: true })); terrain.receiveShadow = true;
    const far = L(new THREE.PlaneGeometry(5000, 5000), lam({ color: th.ground2 })); far.rotation.x = -Math.PI / 2; far.position.set(cx, -3, cz);
  }

  // ----- 도로 -----
  const roadTex = canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = th.road; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 5200; i++) { c.fillStyle = `rgba(${R() > 0.5 ? '255,255,255' : '0,0,0'},${0.02 + R() * 0.05})`; c.fillRect(R() * w, R() * h, 1 + R() * 2, 1 + R() * 2); }
    for (let i = 0; i < 26; i++) { c.strokeStyle = 'rgba(0,0,0,0.10)'; c.lineWidth = 1 + R() * 2; c.beginPath(); const x = 40 + R() * (w - 80); c.moveTo(x, 0); c.bezierCurveTo(x + (R() - 0.5) * 30, h * 0.3, x + (R() - 0.5) * 30, h * 0.6, x, h); c.stroke(); }
    const cw = 30;
    for (let k = 0; k < 8; k++) { c.fillStyle = k % 2 ? th.curbA : th.curbB; c.fillRect(0, k * 64, cw, 64); c.fillRect(w - cw, k * 64, cw, 64); }
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(cw, 0, 3, h); c.fillRect(w - cw - 3, 0, 3, h);
    c.fillStyle = th.line; c.fillRect(cw + 8, 0, 7, h); c.fillRect(w - cw - 15, 0, 7, h);
    c.globalAlpha = 0.9; for (let k = 0; k < 2; k++) c.fillRect(w / 2 - 4, k * 256, 8, 128); c.globalAlpha = 1;
  });
  const road = L(strip(T, i => T.hw[i], 0.02, i => -T.hw[i], 0.02, 20), lam({ map: roadTex, side: THREE.DoubleSide })); road.receiveShadow = true;

  // ----- 벽 -----
  const wallTex = canvasTex(256, 64, (c, w, h) => {
    c.fillStyle = th.wallA; c.fillRect(0, 0, w, h); c.fillStyle = th.wallB; c.fillRect(0, 0, w / 2, h);
    c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(0, h - 12, w, 12); c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(0, 0, w, 7);
    c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(w / 2 - 1, 0, 2, h); c.fillRect(0, 0, 2, h);
  });
  const wallMat = th.night ? basic({ map: wallTex, side: THREE.DoubleSide }) : lam({ map: wallTex, side: THREE.DoubleSide });
  const WH = 1.0, WT = 0.6, SK = -1.7;
  const deckMat = lam({ color: th.deck, side: THREE.DoubleSide });
  // 벽은 지름길 입구(구멍)를 빼고 이어진 구간마다 만든다
  const runs = (P, ok) => { const out = []; const n = P.n, open = P.open; let i = 0;
    if (!open && ok(0)) { let b = n - 1; while (b > 0 && ok(b)) b--; if (b === 0) return [[0, n]]; i = 0; }
    while (i < n) { if (!ok(i)) { i++; continue; } let j = i; while (j < n && ok(j)) j++; out.push([i, j - i]); i = j; }
    if (!open && out.length > 1 && out[0][0] === 0 && out[out.length - 1][0] + out[out.length - 1][1] === n) { const last = out.pop(); out[0] = [last[0], last[1] + out[0][1]]; }
    return out; };
  const wallsFor = (P, s, ok, mat = wallMat, dmat = deckMat) => {
    for (const [i0, cnt] of runs(P, ok)) {
      if (cnt < 1) continue;
      const c = P.open ? Math.min(cnt, P.n - 1 - i0) : cnt; if (c < 1) continue;
      const w = L(strip(P, i => s * (P.hw[i] + 0.05), 0, i => s * (P.hw[i] + 0.05), WH, 8, 0, 1, i0, c), mat); w.receiveShadow = true;
      L(strip(P, i => s * (P.hw[i] + 0.05), WH, i => s * (P.hw[i] + WT), WH, 8, 0, 0.5, i0, c), mat);
      L(strip(P, i => s * (P.hw[i] + WT), WH, i => s * (P.hw[i] + WT), SK, 8, 0, 1, i0, c), dmat);
    }
  };
  const gapL = T.gapL || new Uint8Array(N), gapR = T.gapR || new Uint8Array(N);
  wallsFor(T, 1, i => !gapL[i]); wallsFor(T, -1, i => !gapR[i]);
  // ----- 지름길 도로·벽 -----
  for (const S of SCs) {
    const dirtTex = canvasTex(256, 256, (c, w, h) => {
      const base = theme === 'city' ? '#2b2c3c' : theme === 'desert' ? '#c99a5e' : theme === 'ice' ? '#cdeaf8' : '#8a7a5a';
      c.fillStyle = base; c.fillRect(0, 0, w, h);
      for (let k = 0; k < 2600; k++) { c.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,255,255'},${0.04 + R() * 0.08})`; c.fillRect(R() * w, R() * h, 1 + R() * 3, 1 + R() * 3); }
      if (theme === 'city') { c.fillStyle = '#ff3fa4'; c.fillRect(0, 0, 8, h); c.fillRect(w - 8, 0, 8, h); }
      else { c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 10; for (const x of [w * 0.3, w * 0.7]) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); } }
    });
    const sr = L(strip(S, i => S.hw[i], 0.015, i => -S.hw[i], 0.015, 14, 0, 1, 0, S.n - 1), lam({ map: dirtTex, side: THREE.DoubleSide })); sr.receiveShadow = true;
    const fenceTex = canvasTex(128, 32, (c, w, h) => { c.fillStyle = theme === 'city' ? '#2ef2ff' : '#8a5a34'; c.fillRect(0, 0, w, h); c.fillStyle = theme === 'city' ? '#ff3fa4' : '#6a4024'; for (let k = 0; k < 4; k++) c.fillRect(k * 32, 0, 6, h); c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(0, 0, w, 4); });
    const fm = th.night ? basic({ map: fenceTex, side: THREE.DoubleSide }) : lam({ map: fenceTex, side: THREE.DoubleSide });
    for (const sd of [1, -1]) wallsFor(S, sd, i => S.out[i] && S.out[Math.max(0, i - 1)] && S.out[Math.min(S.n - 1, i + 1)], fm, deckMat);
  }
  // 고가 구간 (지형보다 높이 떠 있는 곳): 바닥면과 기둥
  const gap = new Float32Array(N); let hasHigh = false;
  for (let i = 0; i < N; i += 2) { const gp = T.y[i] - heightAt(T.x[i], T.z[i]); gap[i] = gap[(i + 1) % N] = gp; if (gp > 2) hasHigh = true; }
  const box = new THREE.BoxGeometry(1, 1, 1); disposables.push(box);
  if (hasHigh) {
    L(strip(T, i => T.hw[i] + WT, SK, i => -(T.hw[i] + WT), SK, 16), deckMat);
    // 아치 다리: 고가 구간 양쪽 가장자리에 땅까지 내려오는 아치 벽 (아래로 다른 도로가 지나는 곳은 비운다)
    const arcCol = { village: ['#cfc6b2', '#a89f8a'], desert: ['#c98a55', '#9c6338'], ice: ['#dff3ff', '#a9d6f2'], city: ['#3a3e58', '#2ef2ff'] }[theme] || ['#bbb', '#888'];
    const arcTex = canvasTex(256, 256, (c, w, h) => {
      // 가로(u) = 위(도로)→아래(땅), 세로(v) = 도로 방향 16m 한 칸
      c.fillStyle = arcCol[0]; c.fillRect(0, 0, w, h);
      if (theme !== 'city') { c.strokeStyle = 'rgba(0,0,0,0.13)'; c.lineWidth = 2; for (let x = 0; x < w; x += 18) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); for (let y = (x / 18) % 2 ? 0 : 20; y < h; y += 40) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + 18, y); c.stroke(); } } }
      c.fillStyle = arcCol[1]; c.fillRect(0, 0, 14, h);                      // 위쪽 띠
      c.globalCompositeOperation = 'destination-out'; c.beginPath();          // 아치 구멍
      const top = w * 0.3; c.moveTo(w + 2, h * 0.17); c.lineTo(top + w * 0.12, h * 0.17);
      c.ellipse(top + w * 0.12, h * 0.5, w * 0.12, h * 0.33, 0, -Math.PI / 2, Math.PI / 2, true);
      c.lineTo(w + 2, h * 0.83); c.closePath(); c.fill();
      c.globalCompositeOperation = 'source-over';
    });
    const arcM = lam({ map: arcTex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
    const roadBelow = (x, z, i, y) => { const gx = Math.floor(x / CELL), gz = Math.floor(z / CELL);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = grid.get((gx + a) + ',' + (gz + b)); if (!l) continue;
        for (const j of l) { if (j >= N) continue; let d = Math.abs(i - j); d = Math.min(d, N - d); if (d < 20) continue; if (PY[j] < y - 2 && Math.hypot(PX[j] - x, PZ[j] - z) < PW[j] + 2.5) return true; } }
      return false; };
    const arcOn = [new Uint8Array(N), new Uint8Array(N)];
    for (let i = 0; i < N; i++) {
      if (gap[i] < 2.6 || T.garage[i] || T.tunnel[i]) continue;
      for (const [k, sd] of [[0, 1], [1, -1]]) { const e = sd * (T.hw[i] + WT), ex = T.x[i] + T.nx[i] * e, ez = T.z[i] + T.nz[i] * e; if (!roadBelow(ex, ez, i, T.y[i])) arcOn[k][i] = 1; }
    }
    for (const [k, sd] of [[0, 1], [1, -1]]) for (const [i0, cnt] of runs(T, i => arcOn[k][i])) {
      if (cnt < 4) continue;
      const e = i => sd * (T.hw[i] + WT);
      L(strip(T, e, SK, e, i => Math.min(SK - 0.5, heightAt(T.x[i] + T.nx[i] * e(i), T.z[i] + T.nz[i] * e(i)) - T.y[i] - 0.4), 16, 0, 1, i0, cnt), arcM);
    }
    const pillars = [];
    for (let i = 0; i < N; i += 8) {
      if (gap[i] < 2.4 || nearTrack(T.x[i], T.z[i], 3, i, 30) || arcOn[0][i] || arcOn[1][i]) continue;
      const base = heightAt(T.x[i], T.z[i]), top = T.y[i] + SK;
      pillars.push({ x: T.x[i], z: T.z[i], y: (top + base) / 2, sx: 2.6, sy: top - base + 1, sz: 2.6, ry: Math.atan2(T.tx[i], T.tz[i]) });
    }
    if (pillars.length) g.add(instanced(box, deckMat, pillars, hq));
  }

  // ----- 트랙 장치 (점프대·물·빙판·터널·장애물) -----
  const featLm = [];
  const noScen = [];   // 소품을 놓지 않는 구역 (주차 타워 안마당 등)
  const feat = buildFeatures(T, { g, L, lam, basic, strip, canvasTex, instanced, hq, th, R, disposables, box, landmarks: featLm, moverModels: moverModels(theme, disposables, hq), heightAt, nearTrack, fits, take, noScen });

  // ----- 도로 위 표시: 출발선, 그리드 칸, 타이어 자국, 코너 화살표 -----
  const decal = (o) => basic({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide, ...o });
  const chk = canvasTex(256, 32, (c) => { for (let a = 0; a < 32; a++) for (let b = 0; b < 4; b++) { c.fillStyle = (a + b) % 2 ? '#111' : '#fff'; c.fillRect(a * 8, b * 8, 8, 8); } }, false);
  L(strip(T, i => T.hw[i] - 1.2, 0.05, i => -T.hw[i] + 1.2, 0.05, 0, 0, 1, N - 1, 2), decal({ map: chk, transparent: false }));
  {
    // 그리드 칸 (8자리)
    const gridTex = canvasTex(64, 64, (c, w, h) => { c.clearRect(0, 0, w, h); c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 6; c.beginPath(); c.moveTo(4, 6); c.lineTo(4, 60); c.lineTo(60, 60); c.lineTo(60, 6); c.stroke(); }, false);
    const gm = decal({ map: gridTex });
    for (let s = 0; s < 8; s++) {
      const row = Math.floor(s / 2), side = s % 2 ? -1 : 1, back = 8 + row * 6.5 + (s % 2) * 2, i0 = (N - Math.round((back + 2) / T.ds) + N) % N;
      L(strip(T, side * 3.4 + 1.5, 0.045, side * 3.4 - 1.5, 0.045, 0, 0, 1, i0, 2), gm);
    }
    // 코너마다 주행선 타이어 자국
    const markTex = canvasTex(32, 64, (c, w, h) => { const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(10,10,14,0)'); gr.addColorStop(0.25, 'rgba(10,10,14,0.55)'); gr.addColorStop(0.75, 'rgba(10,10,14,0.55)'); gr.addColorStop(1, 'rgba(10,10,14,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); c.clearRect(13, 0, 6, h); }, false);
    const mm = decal({ map: markTex });
    let i = 0;
    while (i < N) {
      if (Math.abs(T.curv[i]) < 0.018) { i++; continue; }
      let j = i; while (j < N && Math.abs(T.curv[j]) >= 0.012) j++;
      const len = j - i, sg = Math.sign(T.curv[i]);
      if (len > 6) {
        const i0 = Math.max(0, i - 6), cnt = Math.min(N - 1 - i0, len + 12), off = (R() - 0.5) * 2;
        const lat = (_, r) => sg * (T.hw[i] * 0.52) * (2 * Math.sin(Math.PI * r / cnt) - 1) * 0.85 + off;
        const gq = strip(T, (a, r) => lat(a, r) + 0.75, 0.04, (a, r) => lat(a, r) - 0.75, 0.04, 0, 0, 1, i0, cnt);
        L(gq, mm);
      }
      i = j + 1;
    }
  }
  // 부스터 발판
  const padTex = canvasTex(64, 64, (c, w, h) => {
    c.fillStyle = '#ff7a00'; c.fillRect(0, 0, w, h); c.strokeStyle = '#fff36a'; c.lineWidth = 9; c.lineJoin = 'miter';
    for (let k = -1; k < 3; k++) { c.beginPath(); c.moveTo(6, k * 32 + 4); c.lineTo(32, k * 32 + 26); c.lineTo(58, k * 32 + 4); c.stroke(); }
  });
  const padMat = decal({ map: padTex, transparent: false });
  for (const [P, p] of [...T.pads.map(p => [T, p]), ...(T.shortcuts || []).flatMap(S => S.pads.map(p => [S, p]))]) {
    const q = strip(P, p.lat + 3.2, 0.06, p.lat - 3.2, 0.06, 0, 0, 1, p.i, P.open ? Math.min(p.len, P.n - 1 - p.i) : p.len);
    const uvA = q.attributes.uv; for (let r = 0; r <= p.len; r++) { uvA.setY(r * 2, r * 0.5); uvA.setY(r * 2 + 1, r * 0.5); }
    L(q, padMat);
  }

  // ----- 코너 화살표 표지판 -----
  const arrowTex = canvasTex(64, 32, (c, w, h) => {
    c.fillStyle = th.night ? '#ff3fa4' : '#ffd21e'; c.fillRect(0, 0, w, h); c.fillStyle = '#16181f';
    c.beginPath(); c.moveTo(14, 4); c.lineTo(34, 4); c.lineTo(50, 16); c.lineTo(34, 28); c.lineTo(14, 28); c.lineTo(30, 16); c.closePath(); c.fill();
  });
  {
    const pos = [], uv = [], idx = []; let k = 0;
    for (let i = 0; i < N; i += 3) {
      if (Math.abs(T.curv[i]) < 0.017) continue;
      const s = -Math.sign(T.curv[i]);
      const bx = T.x[i] + T.nx[i] * s * (T.hw[i] + 0.3), bz = T.z[i] + T.nz[i] * s * (T.hw[i] + 0.3), y = T.y[i];
      const ax = bx - T.tx[i] * 2.6, az = bz - T.tz[i] * 2.6, ex = bx + T.tx[i] * 2.6, ez = bz + T.tz[i] * 2.6;
      pos.push(ax, y + 1.1, az, ex, y + 1.1, ez, ax, y + 2.5, az, ex, y + 2.5, ez);
      uv.push(0, 0, 2, 0, 0, 1, 2, 1); idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); k += 4;
    }
    if (k) {
      const q = new THREE.BufferGeometry(); q.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); q.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); q.setIndex(idx);
      L(q, basic({ map: arrowTex, side: THREE.DoubleSide }));
    }
  }

  // ----- 랜드마크 자리 미리 정하기 (그 자리에는 나무·건물을 심지 않는다) -----
  const lmPlan = [];
  for (const d of (LANDMARKS[theme] || [])) {
    if (d.over !== undefined) {
      const i = Math.floor(d.over * N) % N, w = d.open / ARCH_GAP;
      lmPlan.push({ m: d.m, open: d.open, x: T.x[i], z: T.z[i], y: T.y[i] - 0.5, ry: Math.atan2(T.tx[i], T.tz[i]), r: w * 0.55 });
    } else if (d.at !== undefined) {
      const i = Math.floor(d.at * N) % N;
      const place = sd => [T.x[i] + T.nx[i] * sd * (T.hw[i] + d.off), T.z[i] + T.nz[i] * sd * (T.hw[i] + d.off)];
      // 모델 크기만큼 도로에서 떨어진 자리를 찾는다 (바깥쪽 → 반대쪽, 점점 멀리)
      const clr = d.m === 'neon' ? 5 : d.m === 'arch' ? d.h * 0.62 : 7;
      let x, z, ok = false;
      for (const extra of [0, 14, 28, 44]) { for (const sd of [d.side, -d.side]) { const off0 = d.off; d.off = off0 + extra; [x, z] = place(sd); d.off = off0; if (!nearTrack(x, z, clr) && fits(x, z, d.h * (d.m === 'neon' ? 0.22 : 0.6))) { ok = true; break; } } if (ok) break; }
      if (!ok) continue;
      lmPlan.push({ m: d.m, h: d.h, x, z, y: heightAt(x, z) - 0.4, ry: Math.atan2(T.x[i] - x, T.z[i] - z), r: d.h * (d.m === 'neon' ? 0.22 : 0.6) });
    } else lmPlan.push({ m: d.m, h: d.h, x: d.x, z: d.z, y: heightAt(d.x, d.z) - 1.5, ry: d.ry || 0, r: d.h * 0.62 });
  }
  for (const l of featLm) lmPlan.push({ ...l, r: 0 });
  const zones = lmPlan.map(l => ({ x: l.x, z: l.z, r: l.r }));
  // 터널 안·근처에는 구조물(배너·가로등·광고판)을 세우지 않는다
  const inTun = new Uint8Array(N); for (let i = 0; i < N; i++) if (T.tunnel[i] || T.garage[i]) for (let o = -12; o <= 12; o++) inTun[(i + o + N) % N] = 1;
  for (const l of zones) take(l.x, l.z, Math.max(4, l.r), 'landmark');
  const blocked = (x, z, r = 0) => !fits(x, z, r);

  // ----- 출발 게이트 + 관중석 -----
  const startLights = [];
  const dirAt = i => Math.atan2(T.tx[i], T.tz[i]);
  const matSolid = lam({ color: '#ffffff' });
  {
    const hw = T.hw[0], gate = new THREE.Group(); gate.position.set(T.x[0], T.y[0], T.z[0]); gate.rotation.y = dirAt(0);
    const postM = lam({ color: th.night ? '#2ef2ff' : '#e8332b' }), dark = lam({ color: '#20232e' });
    for (const s of [1, -1]) {
      const p = new THREE.Mesh(box, postM); p.scale.set(1.0, 9, 1.0); p.position.set(s * (hw + 1.3), 4.5, 0); p.castShadow = hq; gate.add(p);
      const f = new THREE.Mesh(box, dark); f.scale.set(1.6, 0.6, 1.6); f.position.set(s * (hw + 1.3), 0.3, 0); gate.add(f);
    }
    const beam = new THREE.Mesh(box, dark); beam.scale.set(hw * 2 + 3.6, 0.5, 1.2); beam.position.set(0, 9.1, 0); beam.castShadow = hq; gate.add(beam);
    const banner = canvasTex(1024, 128, (c, w, h) => {
      c.fillStyle = '#16181f'; c.fillRect(0, 0, w, h);
      for (let a = 0; a < 64; a++) for (let b = 0; b < 2; b++) { c.fillStyle = (a + b) % 2 ? '#111' : '#fff'; c.fillRect(a * 16, b * 16, 16, 16); c.fillRect(a * 16, h - 32 + b * 16, 16, 16); }
      c.fillStyle = '#ffd21e'; c.font = 'italic 900 64px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('T U R B O   D R I F T E R', w / 2, h / 2 + 2);
    }, false);
    for (const z of [0.62, -0.62]) { const bm = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2 + 3.4, 2.7), basic({ map: banner, side: THREE.DoubleSide })); bm.position.set(0, 7.4, z); bm.rotation.y = z > 0 ? 0 : Math.PI; gate.add(bm); disposables.push(bm.geometry); }
    // 신호등
    const housing = new THREE.Mesh(box, dark); housing.scale.set(6.4, 1.3, 0.5); housing.position.set(0, 5.3, -0.75); gate.add(housing);
    for (let q = -2; q <= 2; q++) for (const zz of [-1.02, -0.48]) { const l = new THREE.Mesh(new THREE.CircleGeometry(0.4, 14), basic({ color: '#2a1414' })); l.position.set(q * 1.2, 5.3, zz); l.rotation.y = zz < -0.7 ? Math.PI : 0; gate.add(l); disposables.push(l.geometry); startLights.push({ m: l, q: q + 2 }); }
    g.add(gate);
    zones.push({ x: T.x[0], z: T.z[0], r: hw + 6 });

    // 관중석 (출발선 양쪽)
    const crowdTex = canvasTex(256, 32, (c, w, h) => {
      c.fillStyle = '#2a2d3a'; c.fillRect(0, 0, w, h);
      const cols = ['#ff5a4a', '#ffd21e', '#4aa3ff', '#ffffff', '#56d17a', '#ff8fc7', '#ffb347'];
      for (let a = 0; a < 42; a++) { const x = a * 6 + 3 + (R() - 0.5) * 2; c.fillStyle = cols[Math.floor(R() * cols.length)]; c.fillRect(x - 2.2, 14, 4.4, 14); c.fillStyle = ['#f3c9a5', '#e0a878', '#c98a5a'][Math.floor(R() * 3)]; c.beginPath(); c.arc(x, 10, 2.6, 0, 7); c.fill(); }
    });
    crowdTex.repeat.set(3, 1);
    const crowdM = basic({ map: crowdTex }), standM = lam({ color: '#d9dde6' }), roofM = lam({ color: th.night ? '#3a2a6e' : '#2f8fff', side: THREE.DoubleSide });
    for (const s of [1, -1]) {
      // 빈자리가 나올 때까지 출발선 뒤쪽으로 물러난다 (랜드마크·다른 물체와 겹치지 않게)
      const standAt = (i) => { const off = T.hw[i] + 7, px = T.x[i] + T.nx[i] * s * off, pz = T.z[i] + T.nz[i] * s * off, ry = dirAt(i) + (s > 0 ? -Math.PI / 2 : Math.PI / 2);
        const fx = Math.cos(ry), fz = -Math.sin(ry), bx = -Math.sin(ry), bz = -Math.cos(ry);
        const cs = [-16.5, -5.5, 5.5, 16.5].map(q => [px + fx * q + bx * 5, pz + fz * q + bz * 5]);
        return { px, pz, cs, ok: cs.every(([x, z]) => fits(x, z, 5.5) && !nearTrack(x, z, 5.4)) }; };
      let i = Math.floor(N * 0.006) % N, sa = standAt(i);
      for (let back = 1; back < 30 && !sa.ok; back++) { i = (Math.floor(N * 0.006) - back * 3 + N) % N; sa = standAt(i); }
      if (!sa.ok) continue;
      const st = new THREE.Group(), px = sa.px, pz = sa.pz;
      st.position.set(px, Math.max(T.y[i], heightAt(px, pz)) - 0.3, pz); st.rotation.y = dirAt(i) + (s > 0 ? -Math.PI / 2 : Math.PI / 2);
      const LEN = 44;
      for (let r = 0; r < 5; r++) {
        const stp = new THREE.Mesh(box, standM); stp.scale.set(LEN, 1.2 + r * 1.1, 2.2); stp.position.set(0, (1.2 + r * 1.1) / 2, -r * 2.2); stp.castShadow = hq; st.add(stp);
        const cr = new THREE.Mesh(new THREE.PlaneGeometry(LEN - 1, 1.5), crowdM); cr.position.set(0, 1.2 + r * 1.1 + 0.75, -r * 2.2 - 0.3); st.add(cr); disposables.push(cr.geometry);
      }
      const roof = new THREE.Mesh(box, roofM); roof.scale.set(LEN + 2, 0.3, 13); roof.position.set(0, 10.2, -4.6); roof.rotation.x = 0.1; roof.castShadow = hq; st.add(roof);
      for (const q of [-LEN / 2, 0, LEN / 2]) { const pl = new THREE.Mesh(box, standM); pl.scale.set(0.5, 10.5, 0.5); pl.position.set(q, 5.2, -10.4); st.add(pl); }
      g.add(st);
      for (const [x, z] of sa.cs) take(x, z, 5.5, 'stand');   // 관중석은 길쭉하므로 길이를 따라 원 4개로 등록
    }
  }

  // ----- 광고판·가로 구조물·깃발·가로등 -----
  {
    // 광고판: 직선 구간 바깥에, 달려오는 쪽을 향해
    const adGeo = {}, posts = [];
    let lastAd = -999, side = 1, adN = 0;
    for (let i = 20; i < N - 20; i += 4) {
      if ((i - lastAd) * T.ds < 85 || Math.abs(T.curv[i]) > 0.006 || gap[i] > 3 || inTun[i] || T.cliff[i] > 0.2) continue;
      const off = T.hw[i] + 4.5, x = T.x[i] + T.nx[i] * side * off, z = T.z[i] + T.nz[i] * side * off;
      if (nearTrack(x, z, 3.5, i, 30) || blocked(x, z, 5.6)) { side = -side; continue; }
      take(x, z, 5.6, 'ad');
      const yb = Math.max(T.y[i], heightAt(x, z)), ry = dirAt(i) + Math.PI + side * 0.5, W = 10, H = 4.4, cxr = Math.cos(ry), sxr = Math.sin(ry);
      const a = [x - cxr * W / 2, z + sxr * W / 2], b = [x + cxr * W / 2, z - sxr * W / 2], v = adN % ADS.length;
      (adGeo[v] = adGeo[v] || { pos: [], uv: [], idx: [] });
      const G = adGeo[v], k = G.pos.length / 3;
      G.pos.push(a[0], yb + 3.2, a[1], b[0], yb + 3.2, b[1], a[0], yb + 3.2 + H, a[1], b[0], yb + 3.2 + H, b[1]); G.uv.push(0, 0, 1, 0, 0, 1, 1, 1); G.idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      posts.push({ x: a[0] * 0.75 + b[0] * 0.25, z: a[1] * 0.75 + b[1] * 0.25, y: yb + 1.6, sx: 0.35, sy: 3.4, sz: 0.35, c: '#3a3d4a' }, { x: a[0] * 0.25 + b[0] * 0.75, z: a[1] * 0.25 + b[1] * 0.75, y: yb + 1.6, sx: 0.35, sy: 3.4, sz: 0.35, c: '#3a3d4a' });
      posts.push({ x, z, y: yb + 3.2 + H / 2, sx: W + 0.5, sy: H + 0.5, sz: 0.25, ry, c: '#2a2d3a' });
      zones.push({ x, z, r: 7 }); lastAd = i; side = -side; adN++;
    }
    for (const v in adGeo) {
      const [txt, bg, fg] = ADS[v];
      const tex = canvasTex(512, 224, (c, w, h) => {
        c.fillStyle = bg; c.fillRect(0, 0, w, h); c.fillStyle = fg; c.globalAlpha = 0.16; for (let q = -2; q < 12; q++) { c.beginPath(); c.moveTo(q * 60, h); c.lineTo(q * 60 + 30, h); c.lineTo(q * 60 + 110, 0); c.lineTo(q * 60 + 80, 0); c.fill(); } c.globalAlpha = 1;
        c.font = `italic 900 ${txt.length > 9 ? 62 : 78}px "Black Han Sans", "Malgun Gothic", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, w / 2, h / 2 + 4);
        c.lineWidth = 10; c.strokeStyle = fg; c.strokeRect(5, 5, w - 10, h - 10);
      }, false);
      const q = new THREE.BufferGeometry(); q.setAttribute('position', new THREE.Float32BufferAttribute(adGeo[v].pos, 3)); q.setAttribute('uv', new THREE.Float32BufferAttribute(adGeo[v].uv, 2)); q.setIndex(adGeo[v].idx);
      const m = L(q, basic({ map: tex, side: THREE.DoubleSide })); m.position.y = 0; m.renderOrder = 1;
      // 판 앞면이 뒤판(상자)과 겹치지 않게 살짝 앞으로
      const pa = q.attributes.position; for (let k = 0; k < pa.count; k += 4) { const ax = pa.getX(k), az = pa.getZ(k), bx = pa.getX(k + 1), bz = pa.getZ(k + 1); let nxv = -(bz - az), nzv = bx - ax; const l = Math.hypot(nxv, nzv); nxv /= l; nzv /= l; for (let u = 0; u < 4; u++) { pa.setX(k + u, pa.getX(k + u) + nxv * 0.16); pa.setZ(k + u, pa.getZ(k + u) + nzv * 0.16); } }
    }
    // 도로를 가로지르는 배너 구조물
    const gant = [], flagsTex = canvasTex(512, 64, (c, w, h) => {
      c.clearRect(0, 0, w, h); const cols = ['#ff4d42', '#ffd21e', '#2f8fff', '#ffffff', '#35c15a'];
      for (let a = 0; a < 16; a++) { c.fillStyle = cols[a % cols.length]; c.beginPath(); c.moveTo(a * 32, 2); c.lineTo(a * 32 + 32, 2); c.lineTo(a * 32 + 16, 58); c.closePath(); c.fill(); }
      c.fillStyle = '#20232e'; c.fillRect(0, 0, w, 4);
    }, false);
    const flagM = basic({ map: flagsTex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
    const steps = Math.max(3, Math.round(T.length / 230));
    for (let q = 1; q < steps; q++) {
      const i = Math.floor(N * q / steps), hw = T.hw[i];
      if (nearTrack(T.x[i], T.z[i], 6, i, 40) || inTun[i] || T.ramp[i] || T.hw[i] > 10.5) continue;
      const ry = dirAt(i);
      if ([1, -1].some(s => blocked(T.x[i] + T.nx[i] * s * (hw + 1.2), T.z[i] + T.nz[i] * s * (hw + 1.2), 0.6))) continue;
      for (const s of [1, -1]) { gant.push({ x: T.x[i] + T.nx[i] * s * (hw + 1.2), z: T.z[i] + T.nz[i] * s * (hw + 1.2), y: T.y[i] + 4, sx: 0.5, sy: 8, sz: 0.5, ry, c: th.night ? '#ff3fa4' : '#f6f3ea' }); take(T.x[i] + T.nx[i] * s * (hw + 1.2), T.z[i] + T.nz[i] * s * (hw + 1.2), 0.6, 'post'); }
      gant.push({ x: T.x[i], z: T.z[i], y: T.y[i] + 8.1, sx: 0.3, sy: 0.3, sz: hw * 2 + 3, ry: ry + Math.PI / 2, c: '#20232e' });
      const pg = new THREE.PlaneGeometry(hw * 2 + 2.4, 1.6); const fm = new THREE.Mesh(pg, flagM); fm.position.set(T.x[i], T.y[i] + 7.2, T.z[i]); fm.rotation.y = ry; g.add(fm); disposables.push(pg);
    }
    if (gant.length) g.add(instanced(box, matSolid, [...gant, ...posts], hq)); else if (posts.length) g.add(instanced(box, matSolid, posts, hq));
    // 벽 위 깃발 (코너)
    const poles = [], flags = [], fcols = th.night ? ['#2ef2ff', '#ff3fa4'] : ['#ff4d42', '#ffd21e', '#ffffff'];
    for (let i = 0; i < N; i += 5) {
      if (Math.abs(T.curv[i]) < 0.012 || T.tunnel[i] || T.garage[i]) continue;
      const s = -Math.sign(T.curv[i]), x = T.x[i] + T.nx[i] * s * (T.hw[i] + 0.35), z = T.z[i] + T.nz[i] * s * (T.hw[i] + 0.35), ry = dirAt(i);
      poles.push({ x, z, y: T.y[i] + 2.9, sx: 0.09, sy: 1.6, sz: 0.09, c: '#e8e8ee' });
      flags.push({ x: x + Math.sin(ry) * 0.5, z: z + Math.cos(ry) * 0.5, y: T.y[i] + 3.35, sx: 0.04, sy: 0.6, sz: 1.0, ry, c: fcols[(i / 5) % fcols.length | 0] });
    }
    if (poles.length) g.add(instanced(box, matSolid, [...poles, ...flags], false));
    // 가로등
    const lp = [], bulbs = [], arm = [];
    for (let i = 7; i < N; i += 16) {
      const s = (i / 16 | 0) % 2 ? 1 : -1, x = T.x[i] + T.nx[i] * s * (T.hw[i] + 1.5), z = T.z[i] + T.nz[i] * s * (T.hw[i] + 1.5);
      if (nearTrack(x, z, 0.8, i, 24) || gap[i] > 3 || inTun[i] || blocked(x, z, 1.6)) continue;
      take(x, z, 1.6, 'lamp');
      lp.push({ x, z, y: T.y[i] + 3.6, sx: 0.16, sy: 7.2, sz: 0.16, c: th.night ? '#3a3d55' : '#6b7280' });
      arm.push({ x: x - T.nx[i] * s * 0.7, z: z - T.nz[i] * s * 0.7, y: T.y[i] + 7.1, sx: 1.6, sy: 0.12, sz: 0.12, ry: dirAt(i), c: th.night ? '#3a3d55' : '#6b7280' });
      bulbs.push({ x: x - T.nx[i] * s * 1.4, z: z - T.nz[i] * s * 1.4, y: T.y[i] + 6.95, s: 0.34 });
    }
    if (lp.length) { g.add(instanced(box, matSolid, [...lp, ...arm], hq)); const sph0 = new THREE.SphereGeometry(1, 8, 6); disposables.push(sph0); g.add(instanced(sph0, basic({ color: th.night ? '#ffe9a8' : '#fffbe6' }), bulbs)); }
  }

  // ----- 배경 소품 -----
  // rf: 물체 하나의 크기를 정하는 함수 → { r: 바닥 반지름, ...그 밖의 크기 값 }. 정해진 크기만큼 빈자리를 찾아 등록한다
  const spots = (count, margin, pad = 110, maxEdge = 1e9, rf = () => ({ r: 1 }), kind = '') => {
    const out = []; let tries = 0;
    while (out.length < count && tries++ < count * 40) {
      const sz = rf(), r = sz.r;
      const x = minX - pad + R() * (maxX - minX + pad * 2), z = minZ - pad + R() * (maxZ - minZ + pad * 2);
      if (nearTrack(x, z, Math.max(margin, r + 1.2)) || !fits(x, z, r) || noScen.some(q => x > q.x0 - r && x < q.x1 + r && z > q.z0 - r && z < q.z1 + r)) continue;
      if (maxEdge < 1e8 && !nearTrack(x, z, maxEdge)) continue;
      take(x, z, r, kind);
      out.push({ x, z, y: heightAt(x, z), ...sz });
    }
    return out;
  };
  const blob0 = new THREE.IcosahedronGeometry(1, 0); disposables.push(blob0);
  const cone = new THREE.ConeGeometry(1, 1, 7), cyl = new THREE.CylinderGeometry(1, 1, 1, 7), sph = new THREE.SphereGeometry(1, 10, 8), blob = new THREE.IcosahedronGeometry(1, 1), roofG = new THREE.ConeGeometry(1, 1, 4);
  disposables.push(cone, cyl, sph, blob, roofG);
  const add = (geo, items, mat = matSolid, shadow = hq, multi = false) => { if (items.length) { const m = instanced(geo, mat, items, shadow); m.userData.multi = multi; g.add(m); } };
  const pick = a => a[Math.floor(R() * a.length)];

  // 큰 물체부터 자리를 잡는다 (집·메사·빌딩 → 나무 → 작은 소품). 각 물체는 실제 크기만큼의 바닥 원을 차지한다
  if (theme === 'village') {
    const houseTex = canvasTex(128, 64, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(0,0,0,0.08)'; c.fillRect(0, h - 8, w, 8); for (const x of [14, 82]) { c.fillStyle = '#6fb6ff'; c.fillRect(x, 18, 22, 20); c.strokeStyle = '#fff'; c.lineWidth = 3; c.strokeRect(x, 18, 22, 20); c.beginPath(); c.moveTo(x + 11, 18); c.lineTo(x + 11, 38); c.stroke(); } c.fillStyle = '#8a5a34'; c.fillRect(52, 30, 16, 34); });
    const walls = [], roofs = [], chim = [];
    for (const p of spots(48, 11, 110, 1e9, () => { const w = 7 + R() * 5; return { r: w * 0.9, w }; }, 'house')) {
      const w = p.w, h = 4.5 + R() * 2.5, ry = Math.floor(R() * 4) * Math.PI / 2 + (R() - 0.5) * 0.4;
      walls.push({ x: p.x, z: p.z, y: p.y + h / 2 - 0.6, sx: w, sy: h + 1.2, sz: w * 0.85, ry, c: pick(['#fff1d6', '#ffe0c2', '#e9f4ff', '#fff7ea', '#f6d9d0']) });
      roofs.push({ x: p.x, z: p.z, y: p.y + h + 1.7, sx: w * 0.84, sy: 3.6, sz: w * 0.84, ry: ry + Math.PI / 4, c: pick(['#e8503f', '#3a8fe8', '#f2a52e', '#7a54e0', '#3fa66b']) });
      chim.push({ x: p.x + Math.cos(ry) * w * 0.22, z: p.z - Math.sin(ry) * w * 0.22, y: p.y + h + 2, sx: 0.9, sy: 3, sz: 0.9, ry, c: '#b0553f' });
    }
    add(box, walls, lam({ map: houseTex })); add(roofG, roofs); add(box, chim);
    const trunks = [], crowns = [], l1 = [], l2 = [];
    const treeSize = () => { const s = 0.8 + R() * 0.9, round = R() < 0.6; return { s, round, r: (round ? 2.8 : 2.35) * s }; };
    for (const p of [...spots(170, 5, 110, 1e9, treeSize, 'tree'), ...spots(110, 3.5, 30, 26, treeSize, 'tree')]) {
      const s = p.s;
      if (p.round) { // 둥근 나무
        const col = pick(['#3f9d3a', '#4fb548', '#2f8a3c', '#63bf4f', '#7fca5a']);
        trunks.push({ x: p.x, z: p.z, y: p.y + 1.4 * s, sx: 0.32 * s, sy: 2.8 * s, sz: 0.32 * s, c: '#8a5a34' });
        crowns.push({ x: p.x, z: p.z, y: p.y + 4.4 * s, sx: 2.5 * s, sy: 2.3 * s, sz: 2.5 * s, ry: R() * 6, c: col }, { x: p.x + 1.2 * s, z: p.z + 0.5 * s, y: p.y + 3.6 * s, s: 1.5 * s, ry: R() * 6, c: col }, { x: p.x - 1.0 * s, z: p.z - 0.8 * s, y: p.y + 5.2 * s, s: 1.4 * s, ry: R() * 6, c: col });
      } else {
        const col = pick(['#2f8a3c', '#3a9a48', '#2a7a40']);
        trunks.push({ x: p.x, z: p.z, y: p.y + 1.0 * s, sx: 0.3 * s, sy: 2 * s, sz: 0.3 * s, c: '#7a5030' });
        l1.push({ x: p.x, z: p.z, y: p.y + 3.9 * s, sx: 2.3 * s, sy: 4.4 * s, sz: 2.3 * s, c: col }); l2.push({ x: p.x, z: p.z, y: p.y + 6.3 * s, sx: 1.6 * s, sy: 3.3 * s, sz: 1.6 * s, c: col });
      }
    }
    add(cyl, trunks); add(blob, crowns, matSolid, hq, true); add(cone, [...l1, ...l2], matSolid, hq, true);
    const hay = [];
    for (const p of spots(46, 2.4, 20, 9, () => ({ r: 1.15 }), 'hay')) hay.push({ x: p.x, z: p.z, y: p.y + 0.75, sx: 0.85, sy: 1.5, sz: 0.85, rx: Math.PI / 2, ry: R() * 3, c: '#f1c75a' });
    add(cyl, hay);
    const bush = [], flw = [];
    for (const p of spots(260, 1.6, 20, 16, () => { const s = 0.5 + R() * 0.9, f = R() < 0.5; return { s, f, r: f ? Math.max(1.25 * s, 1.5) : 1.25 * s }; }, 'bush')) {
      const s = p.s; bush.push({ x: p.x, z: p.z, y: p.y + s * 0.45, sx: s * 1.2, sy: s * 0.8, sz: s * 1.1, ry: R() * 6, c: pick(['#3f9d3a', '#55b34a', '#2f8a3c']) });
      if (p.f) flw.push({ x: p.x + 1.2, z: p.z + 0.6, y: p.y + 0.25, s: 0.22, c: pick(['#ff6fb1', '#ffd21e', '#ffffff', '#ff8a3c']) }, { x: p.x - 0.8, z: p.z + 1.1, y: p.y + 0.25, s: 0.2, c: pick(['#ff6fb1', '#ffd21e', '#ffffff']) });
    }
    add(blob, bush); add(blob0, flw, matSolid, false);
  } else if (theme === 'desert') {
    const mesa = [];
    for (const p of spots(70, 16, 170, 1e9, () => { const w = 10 + R() * 22, k = 0.7 + R() * 0.5; return { w, k, r: w * Math.max(1, k) * 1.06 }; }, 'mesa')) {
      const w = p.w, h = 8 + R() * 26, ry = R() * 3;
      mesa.push({ x: p.x, z: p.z, y: p.y + h / 2 - 2, sx: w, sy: h + 4, sz: w * p.k, ry, c: pick(['#c9743a', '#b8632f', '#d98a4a']) }, { x: p.x, z: p.z, y: p.y + h + 0.9, sx: w * 0.82, sy: 2.2, sz: w * p.k * 0.86, ry, c: '#e6a862' }, { x: p.x, z: p.z, y: p.y + h * 0.45, sx: w * 1.04, sy: 1.2, sz: w * p.k * 1.04, ry, c: '#a85628' });
    }
    add(cyl, mesa, matSolid, hq, true);
    const st = [], arm = [];
    const cactus = () => { const s = 0.8 + R() * 1.0; return { s, r: 1.3 * s }; };
    for (const p of [...spots(110, 4.5, 110, 1e9, cactus, 'cactus'), ...spots(70, 3, 20, 20, cactus, 'cactus')]) { const s = p.s, c = pick(['#3f9a55', '#4aa85f', '#358a4c']); st.push({ x: p.x, z: p.z, y: p.y + 2.1 * s, sx: 0.5 * s, sy: 4.6 * s, sz: 0.5 * s, c }); arm.push({ x: p.x + 0.9 * s, z: p.z, y: p.y + 2.6 * s, sx: 0.32 * s, sy: 1.8 * s, sz: 0.32 * s, c }, { x: p.x - 0.9 * s, z: p.z, y: p.y + 3.2 * s, sx: 0.32 * s, sy: 1.5 * s, sz: 0.32 * s, c }, { x: p.x + 0.55 * s, z: p.z, y: p.y + 1.9 * s, sx: 0.7 * s, sy: 0.3 * s, sz: 0.3 * s, c }, { x: p.x - 0.55 * s, z: p.z, y: p.y + 2.6 * s, sx: 0.7 * s, sy: 0.3 * s, sz: 0.3 * s, c }); }
    add(cyl, st); add(cyl, arm, matSolid, hq, true);
    const barrel = []; for (const p of spots(40, 2.2, 20, 7, () => ({ r: 0.65 }), 'barrel')) barrel.push({ x: p.x, z: p.z, y: p.y + 0.65, sx: 0.55, sy: 1.3, sz: 0.55, c: pick(['#e8332b', '#2f6df6', '#ffd21e']) }); add(cyl, barrel);
    const rocks = [], bush = [];
    for (const p of spots(240, 1.8, 20, 18, () => { const s = 0.5 + R() * 1.5, rock = R() < 0.6; return { s, rock, r: (rock ? 1.25 : 0.95) * s }; }, 'rock')) { const s = p.s; if (p.rock) rocks.push({ x: p.x, z: p.z, y: p.y + s * 0.3, sx: s, sy: s * 0.7, sz: s * 1.2, ry: R() * 3, c: pick(['#b98a5a', '#a87848', '#caa070']) }); else bush.push({ x: p.x, z: p.z, y: p.y + 0.35, sx: s * 0.9, sy: s * 0.5, sz: s * 0.9, ry: R() * 3, c: pick(['#9aa04a', '#7f8a3a', '#b0a858']) }); }
    add(blob, rocks); add(blob, bush);
  } else if (theme === 'ice') {
    const spikes = []; for (const p of spots(110, 6, 160, 1e9, () => { const s = 2 + R() * 7; return { s, r: s * 0.75 }; }, 'spike')) { const s = p.s; spikes.push({ x: p.x, z: p.z, y: p.y + s * 1.3, sx: s * 0.7, sy: s * 2.8, sz: s * 0.7, c: pick(['#bfe9ff', '#9fd8ff', '#e6f7ff']) }); } add(cone, spikes);
    const trunks = [], l1 = [], l2 = [], snow = [];
    const pine = () => { const s = 0.9 + R() * 0.9; return { s, r: 2.3 * s }; };
    for (const p of [...spots(160, 5, 110, 1e9, pine, 'tree'), ...spots(100, 3.2, 20, 24, pine, 'tree')]) { const s = p.s; trunks.push({ x: p.x, z: p.z, y: p.y + 1.0 * s, sx: 0.3 * s, sy: 2 * s, sz: 0.3 * s, c: '#6b4a34' }); l1.push({ x: p.x, z: p.z, y: p.y + 3.8 * s, sx: 2.2 * s, sy: 4.4 * s, sz: 2.2 * s, c: '#2f7d6a' }); l2.push({ x: p.x, z: p.z, y: p.y + 6.2 * s, sx: 1.5 * s, sy: 3.4 * s, sz: 1.5 * s, c: '#3a8f7a' }); snow.push({ x: p.x, z: p.z, y: p.y + 7.6 * s, sx: 0.9 * s, sy: 1.5 * s, sz: 0.9 * s, c: '#ffffff' }, { x: p.x, z: p.z, y: p.y + 5.0 * s, sx: 1.75 * s, sy: 0.9 * s, sz: 1.75 * s, c: '#f2fbff' }); }
    add(cyl, trunks); add(cone, [...l1, ...l2, ...snow], matSolid, hq, true);
    const sm = [], nose = [];
    for (const p of spots(36, 2.4, 20, 10, () => ({ r: 1.0 }), 'snowman')) { sm.push({ x: p.x, z: p.z, y: p.y + 0.8, s: 0.9, c: '#fff' }, { x: p.x, z: p.z, y: p.y + 2.0, s: 0.65, c: '#fff' }, { x: p.x, z: p.z, y: p.y + 2.95, s: 0.45, c: '#fff' }); nose.push({ x: p.x, z: p.z + 0.5, y: p.y + 3.0, sx: 0.12, sy: 0.4, sz: 0.12, rx: Math.PI / 2, c: '#ff8a1c' }); }
    add(sph, sm, matSolid, hq, true); add(cone, nose);
    const cane = []; for (const p of spots(40, 2.2, 20, 6, () => ({ r: 0.35 }), 'cane')) cane.push({ x: p.x, z: p.z, y: p.y + 1.4, sx: 0.16, sy: 2.8, sz: 0.16, c: R() < 0.5 ? '#e8332b' : '#ffffff' }); add(cyl, cane);
    const mound = []; for (const p of spots(200, 1.8, 20, 18, () => { const s = 0.8 + R() * 2; return { s, r: s * 1.45 }; }, 'mound')) { const s = p.s; mound.push({ x: p.x, z: p.z, y: p.y, sx: s * 1.4, sy: s * 0.6, sz: s * 1.2, ry: R() * 3, c: pick(['#ffffff', '#eaf6ff', '#d6ecfa']) }); } add(blob, mound);
  } else if (theme === 'city') {
    const winTex = canvasTex(64, 128, (c, w, h) => { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); for (let a = 0; a < 4; a++) for (let b = 0; b < 10; b++) { if (R() < 0.62) { c.fillStyle = pick(['#ffe9a8', '#9fe8ff', '#ffb3e6', '#fff']); c.fillRect(a * 16 + 3, b * 12.8 + 3, 10, 7); } } });
    const bMat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveMap: winTex, emissiveIntensity: 1.0 }); disposables.push(bMat, winTex);
    const bl = [], tops = [];
    for (const p of spots(170, 15, 180, 1e9, () => { const w = 12 + R() * 16, d = 12 + R() * 16; return { w, d, r: Math.hypot(w, d) / 2 + 0.5 }; }, 'building')) {
      const { w, d } = p, h = 18 + R() * 76, ry = Math.floor(R() * 2) * Math.PI / 2;
      bl.push({ x: p.x, z: p.z, y: h / 2 - 1, sx: w, sy: h, sz: d, ry, c: pick(['#2a2d55', '#352a5c', '#1f2a4a', '#3a2350']) });
      if (R() < 0.5) tops.push({ x: p.x, z: p.z, y: h - 0.4, sx: w * 1.02, sy: 0.8, sz: d * 1.02, ry, c: pick(['#ff3fa4', '#2ef2ff', '#ffe66a', '#8b5cf6']) });
    }
    add(box, bl, bMat, false); add(box, tops, basic({ color: '#ffffff' }), false);
    const shopTex = canvasTex(128, 64, (c, w, h) => { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.fillRect(6, 34, w - 12, 24); c.fillRect(0, 8, w, 10); });
    const sMat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveMap: shopTex }); disposables.push(sMat, shopTex);
    const shops = []; for (const p of spots(90, 5, 30, 13, () => { const w = 6 + R() * 6, d = 5 + R() * 3; return { w, d, r: Math.hypot(w, d) / 2 + 0.3 }; }, 'shop')) shops.push({ x: p.x, z: p.z, y: 2.4, sx: p.w, sy: 5.2, sz: p.d, ry: Math.floor(R() * 4) * Math.PI / 2, c: pick(['#ff3fa4', '#2ef2ff', '#ffe66a', '#8b5cf6', '#ff7a3c']) });
    add(box, shops, sMat, false);
    const sp = []; for (let i = 0; i < 600; i++) { const a = R() * 6.28, e = 0.1 + R() * 1.3, r = 1350; sp.push(cx + Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, cz + Math.sin(a) * Math.cos(e) * r); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, fog: false })); g.add(stars); disposables.push(sg, stars.material);
  }
  // 구름 (여러 덩이) + 두 겹 산
  if (!th.night) {
    const cl = [];
    for (let i = 0; i < 34; i++) { const a = R() * 6.28, d = 200 + R() * 850, s = 14 + R() * 22, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, y = 120 + R() * 110; cl.push({ x, z, y, sx: s * 2.2, sy: s * 0.6, sz: s * 1.3 }, { x: x + s * 1.4, z: z + s * 0.3, y: y - s * 0.1, sx: s * 1.4, sy: s * 0.45, sz: s }, { x: x - s * 1.3, z: z - s * 0.4, y: y + s * 0.08, sx: s * 1.5, sy: s * 0.5, sz: s * 1.1 }); }
    add(blob, cl, basic({ color: '#ffffff', fog: false, transparent: true, opacity: 0.94 }), false);
  }
  {
    const mt = [], cap = [], span = Math.max(maxX - minX, maxZ - minZ) / 2;
    for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 30; i++) {
      const a = i / 30 * 6.283 + R() * 0.15, d = span + 340 + ring * 260 + R() * 160, h = 70 + ring * 60 + R() * 150, w = 110 + R() * 130, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      mt.push({ x, z, y: h / 2 - 6, sx: w, sy: h, sz: w, ry: R() * 3, c: ring ? th.mount2 : th.mount });
      if (!th.night && theme !== 'desert' && h > 150) cap.push({ x, z, y: h - 6 - h * 0.14, sx: w * 0.29, sy: h * 0.28, sz: w * 0.29, c: '#ffffff' });
    }
    add(theme === 'city' ? box : cone, mt, matSolid, false); add(cone, cap, matSolid, false);
  }

  // ----- 랜드마크 세우기 -----
  let dead = false;
  for (const d of lmPlan) {
    loadLandmark(d.m).then(Lm => {
      if (!Lm || dead) return;
      const m = new THREE.Mesh(Lm.geo, Lm.mat);
      let sc = d.open ? d.open / ARCH_GAP : d.h / Lm.height;
      if (d.fit) sc = Math.min(sc, d.fit / Lm.baseR);
      m.scale.setScalar(sc); m.rotation.y = d.ry; m.castShadow = hq;
      // 모델 중심이 원점에서 벗어나 있으면 바로잡기 (회전 고려)
      const ox = d.fit ? Lm.cx * sc : 0, oz = d.fit ? Lm.cz * sc : 0, c = Math.cos(d.ry), s2 = Math.sin(d.ry);
      m.position.set(d.x - (ox * c + oz * s2), d.y - Lm.minY * sc, d.z - (-ox * s2 + oz * c));
      g.add(m);
    });
  }

  // ----- 조명 (PC는 해 그림자) -----
  const hemi = new THREE.HemisphereLight(th.night ? '#8f9cff' : '#ffffff', th.night ? '#3a2a5a' : th.ground, th.amb * (hq ? 1.35 : 1.6));
  const sun = new THREE.DirectionalLight(th.sunCol, th.sun * (hq ? 2.0 : 1.6));
  sun.position.copy(sunDir).multiplyScalar(150);
  g.add(hemi, sun, sun.target);
  if (hq) {
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = sc.bottom = -75; sc.right = sc.top = 75; sc.near = 10; sc.far = 400; sc.updateProjectionMatrix();
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.5;
  }

  return {
    group: g, theme: th, heightAt, hq, foot,
    fog: new THREE.Fog(th.fog, th.night ? 140 : 260, th.night ? 950 : 1350),
    // 출발 신호등: n = 켜진 빨간 불 수(0~5), 'go' = 모두 초록
    setLights(n) {
      if (n === this._ln) return; this._ln = n;
      for (const { m, q } of startLights) m.material.color.set(n === 'go' ? '#3dff6e' : q < n ? '#ff2a2a' : '#2a1414');
    },
    update(t, px = 0, pz = 0, time = 0) {
      padTex.offset.y = -t * 2.2; feat.update(t, time);
      if (hq) { const gx = Math.round(px / 4) * 4, gz = Math.round(pz / 4) * 4; sun.target.position.set(gx, 0, gz); sun.position.set(gx + sunDir.x * 200, sunDir.y * 200, gz + sunDir.z * 200); }
    },
    dispose() { dead = true; for (const d of disposables) d.dispose && d.dispose(); g.traverse(o => { if (o.isInstancedMesh) o.dispose(); }); },
  };
}

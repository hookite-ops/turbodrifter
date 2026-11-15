// 카트 3D 모델 — Blender로 만든 GLB를 불러와 색·캐릭터별로 한 덩어리로 합친다
import * as THREE from '../lib/three.bundle.js';
import { GLTFLoader, mergeGeometries } from '../lib/three.bundle.js';

export const CHARS = [
  { name: '나비', kind: '고양이', ears: 'Ears_cat', fur: '#f2a65a', fur2: '#a8662e', muzzle: '#fff4e2' },
  { name: '곰돌', kind: '곰', ears: 'Ears_bear', fur: '#a8744a', fur2: '#70482a', muzzle: '#f3ddb8' },
  { name: '토토', kind: '토끼', ears: 'Ears_rabbit', fur: '#fbf6ee', fur2: '#ffb7c5', muzzle: '#ffffff' },
  { name: '멍구', kind: '강아지', ears: 'Ears_dog', fur: '#f6e2b6', fur2: '#8a5a36', muzzle: '#fffaf0' },
  { name: '까미', kind: '검은 고양이', ears: 'Ears_cat', fur: '#3d3d4a', fur2: '#22222a', muzzle: '#d9d9e2' },
  { name: '설이', kind: '북극곰', ears: 'Ears_bear', fur: '#f4f8ff', fur2: '#b8c6dd', muzzle: '#ffffff' },
];
export const COLORS = [
  { name: '빨강', hex: '#ef3d36' }, { name: '파랑', hex: '#2f7df6' }, { name: '노랑', hex: '#ffc928' }, { name: '초록', hex: '#35c15a' },
  { name: '분홍', hex: '#ff6fb1' }, { name: '보라', hex: '#8b5cf6' }, { name: '주황', hex: '#ff8a1f' }, { name: '하늘', hex: '#28c7e8' },
  { name: '흰색', hex: '#f3f3f3' }, { name: '검정', hex: '#30323c' },
];

// 카트 종류: 0 = 직접 만든 클래식(색 변경 가능), 1·2 = Tripo로 만든 모델(텍스처 고정, 색은 스카프에만)
// driver = 드라이버를 좌석에 앉히는 위치(높이 y, 앞뒤 z, 크기 s), flames = 배기 불꽃 위치
export const KARTS = [
  { id: 'classic', name: '클래식' },
  { id: 'toy', name: '토이', file: 'assets/kart_toy.glb', driver: { y: 0.25, z: 0.0, s: 1.0 }, flames: [[0.42, 0.61, -1.3], [-0.42, 0.61, -1.3]] },
  { id: 'rocket', name: '로켓', file: 'assets/kart_rocket.glb', driver: { y: 0.1, z: 0.1, s: 0.92 }, flames: [[0.13, 0.62, -1.42], [-0.13, 0.62, -1.42]] },
];

let asset = null;
const extra = {};   // 카트 id → { body: geometry, wheels: [{geo, pos, front}], mat }
const cache = new Map();
const WHEELS = ['WheelFL', 'WheelFR', 'WheelRL', 'WheelRR'];

export async function loadKartAsset() {
  const loader = new GLTFLoader();
  const jobs = [loader.loadAsync('assets/kart.glb').then(g => { g.scene.updateMatrixWorld(true); asset = g.scene; })
    .catch(e => { console.warn('kart.glb 로드 실패 — 기본 모양 사용', e); asset = null; })];
  for (const k of KARTS) {
    if (!k.file) continue;
    jobs.push(loader.loadAsync(k.file).then(g => {
      g.scene.updateMatrixWorld(true);
      const E = { body: null, wheels: [], mat: null };
      g.scene.traverse(o => {
        if (!o.isMesh) return;
        if (!E.mat) { E.mat = new THREE.MeshPhongMaterial({ map: o.material.map, shininess: 35, specular: 0x333333 }); }
        if (WHEELS.includes(o.name)) E.wheels.push({ geo: o.geometry, pos: o.getWorldPosition(new THREE.Vector3()), front: o.name[5] === 'F' });
        else { const geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld); E.body = geo; }
      });
      if (E.body) extra[k.id] = E;
    }).catch(e => console.warn(k.file + ' 로드 실패', e)));
  }
  await Promise.all(jobs);
}

// 드라이버만 따로 (Tripo 카트 좌석에 앉힐 때 사용)
function buildDriver(ch, colorHex) {
  const key = 'drv' + ch.name + colorHex;
  if (cache.has(key)) return cache.get(key);
  const over = { Body: colorHex, Fur: ch.fur, Fur2: ch.fur2, Muzzle: ch.muzzle };
  const parts = [], tmp = new THREE.Color();
  asset.traverse(o => {
    if (!o.isMesh) return;
    let driver = false, ears = null;
    for (let a = o.parent; a; a = a.parent) { if (a.name === 'Driver') driver = true; if (a.name.startsWith('Ears_')) ears = a.name; }
    if (!(driver || ears === ch.ears)) return;
    const c = over[o.material.name] ? tmp.set(over[o.material.name]).clone() : o.material.color.clone();
    parts.push(prep(o, o.matrixWorld, c));
  });
  const geo = mergeGeometries(parts); parts.forEach(g => g.dispose());
  cache.set(key, geo);
  return geo;
}

function prep(mesh, matrix, color) {
  let g = mesh.geometry.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (g.index) g = g.toNonIndexed();
  g.applyMatrix4(matrix);
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function buildGeoms(ch, colorHex) {
  const key = ch.name + colorHex;
  if (cache.has(key)) return cache.get(key);
  const over = { Body: colorHex, Fur: ch.fur, Fur2: ch.fur2, Muzzle: ch.muzzle };
  const body = [], wheels = { WheelFL: [], WheelFR: [], WheelRL: [], WheelRR: [] };
  const inv = {}, pos = {};
  for (const w of WHEELS) { const p = asset.getObjectByName(w); inv[w] = p.matrixWorld.clone().invert(); pos[w] = p.getWorldPosition(new THREE.Vector3()); }
  const tmp = new THREE.Color();
  asset.traverse(o => {
    if (!o.isMesh) return;
    let wheel = null, ears = null;
    for (let a = o.parent; a; a = a.parent) { if (WHEELS.includes(a.name)) wheel = a.name; if (a.name.startsWith('Ears_')) ears = a.name; }
    if (ears && ears !== ch.ears) return;
    const mn = o.material.name;
    const c = over[mn] ? tmp.set(over[mn]).clone() : o.material.color.clone();
    if (wheel) wheels[wheel].push(prep(o, new THREE.Matrix4().multiplyMatrices(inv[wheel], o.matrixWorld), c));
    else body.push(prep(o, o.matrixWorld, c));
  });
  const res = { body: mergeGeometries(body), wheels: {}, pos, flames: [] };
  for (const w of WHEELS) res.wheels[w] = mergeGeometries(wheels[w]);
  for (const f of ['FlameL', 'FlameR']) { const e = asset.getObjectByName(f); res.flames.push(e ? e.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, 0.5, -1.4)); }
  [...body, ...Object.values(wheels).flat()].forEach(g => g.dispose());
  cache.set(key, res);
  return res;
}

const kartMat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 60, specular: 0x555555 });
const shadowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 4, 32, 32, 32); g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
})();
const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
const shadowGeo = new THREE.PlaneGeometry(3.4, 4.2);
const flameGeo = new THREE.ConeGeometry(0.16, 1.5, 8, 1, true); flameGeo.rotateX(-Math.PI / 2); flameGeo.translate(0, 0, -0.75);
const flameCore = new THREE.ConeGeometry(0.08, 1.0, 6, 1, true); flameCore.rotateX(-Math.PI / 2); flameCore.translate(0, 0, -0.5);

export function makeKart(charIdx, colorIdx, kartIdx = 0) {
  const ch = CHARS[charIdx % CHARS.length], color = COLORS[colorIdx % COLORS.length].hex;
  const K = KARTS[kartIdx % KARTS.length], E = extra[K.id];
  const group = new THREE.Group(), tilt = new THREE.Group(); group.add(tilt);
  const wheels = [];
  let flamePos = [new THREE.Vector3(0.2, 0.52, -1.36), new THREE.Vector3(-0.2, 0.52, -1.36)];
  if (E) {
    tilt.add(new THREE.Mesh(E.body, E.mat));
    for (const w of E.wheels) {
      const m = new THREE.Mesh(w.geo, E.mat); m.position.copy(w.pos); m.rotation.order = 'YXZ';
      m.userData.r = w.pos.y; m.userData.front = w.front; group.add(m); wheels.push(m);
    }
    if (asset) {
      const d = new THREE.Mesh(buildDriver(ch, color), kartMat);
      d.position.set(0, K.driver.y, K.driver.z); d.scale.setScalar(K.driver.s); tilt.add(d);
    }
    flamePos = K.flames.map(f => new THREE.Vector3(f[0], f[1], f[2]));
  } else if (asset) {
    const G = buildGeoms(ch, color);
    tilt.add(new THREE.Mesh(G.body, kartMat));
    for (const w of WHEELS) {
      const m = new THREE.Mesh(G.wheels[w], kartMat); m.position.copy(G.pos[w]); m.rotation.order = 'YXZ';
      m.userData.r = G.pos[w].y; m.userData.front = w[5] === 'F'; group.add(m); wheels.push(m);
    }
    flamePos = G.flames;
  } else {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 2.4), new THREE.MeshPhongMaterial({ color })); b.position.y = 0.5; tilt.add(b);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), new THREE.MeshPhongMaterial({ color: ch.fur })); h.position.set(0, 1.2, -0.2); tilt.add(h);
  }
  const flames = flamePos.map(p => {
    const f = new THREE.Group(); f.position.copy(p);
    const outer = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: 0x33b5ff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    const core = new THREE.Mesh(flameCore, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    f.add(outer, core); f.visible = false; tilt.add(f); f.userData.outer = outer; return f;
  });
  const shadow = new THREE.Mesh(shadowGeo, shadowMat); shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.05; group.add(shadow);
  return { group, tilt, wheels, flames, spin: 0, lean: 0, pitch: 0, tag: null };
}

// 매 프레임 모양 갱신: s = {x,y,z,h,speed,steer,slip,drifting,boost(0 없음/1 순간/2 부스터), slope}
export function poseKart(m, s, dt, t) {
  m.group.position.set(s.x, s.y + 0.02, s.z);
  m.group.rotation.set(0, s.h, 0);
  m.spin += s.speed * dt;
  for (const w of m.wheels) { w.rotation.x = m.spin / (w.userData.r || 0.3); w.rotation.y = w.userData.front ? s.steer * 0.42 : 0; }
  const leanT = s.drifting ? -Math.sign(s.slip || 0) * 0.13 : -(s.steer || 0) * 0.04 * Math.min(1, Math.abs(s.speed) / 20);
  m.lean += (leanT - m.lean) * Math.min(1, dt * 8);
  const pitchT = (s.boost ? -0.07 : 0) - Math.atan(s.slope || 0);
  m.pitch += (pitchT - m.pitch) * Math.min(1, dt * 7);
  m.tilt.rotation.set(m.pitch, 0, m.lean);
  m.tilt.position.y = Math.abs(s.speed) > 2 ? Math.sin(t * 38 + m.spin) * 0.008 : 0;
  for (const f of m.flames) {
    f.visible = s.boost > 0;
    if (f.visible) {
      const k = (s.boost === 2 ? 1.25 : 0.7) * (0.85 + Math.random() * 0.3);
      f.scale.set(s.boost === 2 ? 1.25 : 0.9, s.boost === 2 ? 1.25 : 0.9, k);
      f.userData.outer.material.color.setHex(s.boost === 2 ? 0x2fa8ff : 0xffa63a);
    }
  }
}

// 이름표
export function makeTag(name, color = '#ffffff') {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
  x.font = '700 34px Jua, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  const w = Math.min(240, x.measureText(name).width + 34);
  x.fillStyle = 'rgba(18,20,30,0.62)'; x.beginPath(); x.roundRect(128 - w / 2, 8, w, 48, 24); x.fill();
  x.fillStyle = color; x.fillText(name, 128, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
  s.scale.set(4.2, 1.05, 1); s.position.y = 2.75; s.renderOrder = 5;
  return s;
}

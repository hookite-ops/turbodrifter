// 움직이는 장애물 모양 — 회전초, 펭귄, 자동차
import * as THREE from '../lib/three.bundle.js';
import { GLTFLoader } from '../lib/three.bundle.js';

// GLB가 있으면 그걸 쓰고, 없으면 간단한 도형으로 대신한다
const FILES = { tumbleweed: 'assets/ob_tumbleweed.glb', penguin: 'assets/ob_penguin.glb', car: 'assets/ob_car.glb' };
const cache = {};
function loadModel(name) {
  if (!cache[name]) cache[name] = new GLTFLoader().loadAsync(FILES[name]).then(g => g.scene).catch(() => null);
  return cache[name];
}
export function preloadMovers() { for (const n of Object.keys(FILES)) loadModel(n); }

const CAR_COLS = ['#ff3fa4', '#2ef2ff', '#ffe66a', '#8b5cf6', '#ff7a3c', '#ffffff'];

export function moverModels(theme, disposables, hq) {
  const lam = o => { const m = new THREE.MeshLambertMaterial(o); disposables.push(m); return m; };
  const geo = g => { disposables.push(g); return g; };
  let carN = 0;
  // GLB를 비동기로 받아 자리표시 도형과 바꾼다
  const swap = (grp, name, h, fallback) => {
    grp.add(fallback);
    loadModel(name).then(sc => {
      if (!sc) return;
      const m = sc.clone(true); const bb = new THREE.Box3().setFromObject(m); const sz = bb.getSize(new THREE.Vector3());
      const k = h / sz.y; m.scale.setScalar(k); m.position.y = -bb.min.y * k;
      m.traverse(o => { if (o.isMesh) { o.castShadow = hq; if (grp.userData.tint && o.material.name === 'paint') { o.material = o.material.clone(); o.material.color.set(grp.userData.tint); } } });
      grp.remove(fallback); grp.add(m); grp.userData.model = m;
    });
  };
  return {
    tumbleweed(m) {
      const grp = new THREE.Group(), ball = new THREE.Group();
      const ig = geo(new THREE.IcosahedronGeometry(1, 1)), mat = lam({ color: '#a77a45', wireframe: true });
      const a = new THREE.Mesh(ig, mat); a.scale.setScalar(m.r); const b = new THREE.Mesh(ig, lam({ color: '#c49a5c', wireframe: true })); b.scale.setScalar(m.r * 0.8); b.rotation.set(0.5, 0.3, 0.2);
      const core = new THREE.Mesh(ig, lam({ color: '#8a6136', transparent: true, opacity: 0.55 })); core.scale.setScalar(m.r * 0.55);
      ball.add(a, b, core); ball.position.y = m.r;
      const holder = new THREE.Group(); holder.add(ball); grp.add(holder);
      swap(ball, 'tumbleweed', m.r * 2, new THREE.Group());
      grp.userData.anim = (o, t, p) => { ball.rotation.x = t * 7 * (p.dir || 1); ball.position.y = m.r + Math.abs(Math.sin(t * 5.5)) * 0.9; };
      return grp;
    },
    penguin(m) {
      const grp = new THREE.Group(), body = new THREE.Group();
      const sg = geo(new THREE.SphereGeometry(1, 14, 10));
      const blk = lam({ color: '#1d2230' }), wht = lam({ color: '#f6f8fb' }), org = lam({ color: '#ff9f1c' });
      const torso = new THREE.Mesh(sg, blk); torso.scale.set(0.7, 0.95, 0.65); torso.position.y = 0.95;
      const belly = new THREE.Mesh(sg, wht); belly.scale.set(0.55, 0.8, 0.4); belly.position.set(0, 0.9, 0.32);
      const head = new THREE.Mesh(sg, blk); head.scale.setScalar(0.45); head.position.y = 2.0;
      const beak = new THREE.Mesh(geo(new THREE.ConeGeometry(0.14, 0.4, 8)), org); beak.rotation.x = Math.PI / 2; beak.position.set(0, 1.95, 0.5);
      for (const s of [1, -1]) { const e = new THREE.Mesh(sg, wht); e.scale.setScalar(0.12); e.position.set(s * 0.17, 2.1, 0.36); body.add(e); const f = new THREE.Mesh(sg, org); f.scale.set(0.2, 0.08, 0.3); f.position.set(s * 0.25, 0.06, 0.15); body.add(f); }
      body.add(torso, belly, head, beak);
      body.traverse(o => { if (o.isMesh) o.castShadow = hq; });
      grp.add(body);
      const wrap = new THREE.Group(); swap(wrap, 'penguin', 2.3, new THREE.Group()); grp.add(wrap);
      grp.userData.anim = (o, t, p) => {   // 배로 미끄러지는 동작: 뒤뚱 + 앞으로 기울기
        const tgt = wrap.children.length ? wrap : body; body.visible = !wrap.userData.model;
        tgt.rotation.z = Math.sin(t * 9 + m.s) * 0.12; tgt.rotation.x = 0.35;
      };
      return grp;
    },
    car(m) {
      const grp = new THREE.Group(), c = CAR_COLS[carN++ % CAR_COLS.length];
      grp.userData.tint = c;
      const body = new THREE.Group();
      const bx = geo(new THREE.BoxGeometry(1, 1, 1));
      const paint = lam({ color: c }), glass = lam({ color: '#1a1d2e' }), dark = lam({ color: '#111' });
      const lower = new THREE.Mesh(bx, paint); lower.scale.set(2.0, 0.8, 4.2); lower.position.y = 0.75;
      const cab = new THREE.Mesh(bx, glass); cab.scale.set(1.75, 0.7, 2.2); cab.position.set(0, 1.5, -0.2);
      const tail = new THREE.Mesh(bx, new THREE.MeshBasicMaterial({ color: '#ff2a3c' })); tail.scale.set(1.8, 0.2, 0.05); tail.position.set(0, 0.95, -2.12); disposables.push(tail.material);
      const head = new THREE.Mesh(bx, new THREE.MeshBasicMaterial({ color: '#fff6c8' })); head.scale.set(1.8, 0.2, 0.05); head.position.set(0, 0.85, 2.12); disposables.push(head.material);
      const wg = geo(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12)); wg.rotateZ(Math.PI / 2);
      for (const [x, z] of [[0.95, 1.35], [-0.95, 1.35], [0.95, -1.35], [-0.95, -1.35]]) { const w = new THREE.Mesh(wg, dark); w.position.set(x, 0.42, z); body.add(w); }
      body.add(lower, cab, tail, head); body.traverse(o => { if (o.isMesh) o.castShadow = hq; });
      grp.add(body);
      const wrap = new THREE.Group(); wrap.userData.tint = c; grp.add(wrap);
      swap(wrap, 'car', 1.9, new THREE.Group());
      grp.userData.anim = () => { body.visible = !wrap.userData.model; };
      return grp;
    },
  };
}

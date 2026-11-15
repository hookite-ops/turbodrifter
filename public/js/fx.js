// 이펙트: 드리프트 연기·불꽃·타이어 자국, 부스터 링, 속도선, 색종이
import * as THREE from '../lib/three.bundle.js';

export function makeFx(scene, camera) {
  // ----- 입자 (연기/불꽃/색종이) -----
  const MAX = 700;
  const pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 4), size = new Float32Array(MAX);
  const vel = new Float32Array(MAX * 3), life = new Float32Array(MAX), maxLife = new Float32Array(MAX), base = new Float32Array(MAX * 4), grow = new Float32Array(MAX), grav = new Float32Array(MAX);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('pcolor', new THREE.BufferAttribute(col, 4));
  geo.setAttribute('psize', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { scale: { value: 400 } },
    vertexShader: 'attribute vec4 pcolor; attribute float psize; varying vec4 vc; uniform float scale; void main(){ vc = pcolor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = psize * scale / -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec4 vc; void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.12, length(d)); gl_FragColor = vec4(vc.rgb, vc.a * a);\n#include <colorspace_fragment>\n }',
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 4; scene.add(pts);
  let head = 0;
  function emit(x, y, z, vx, vy, vz, r, g, b, a, s, l, gr = 1.5, gv = 0) {
    const i = head; head = (head + 1) % MAX;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    base[i * 4] = r; base[i * 4 + 1] = g; base[i * 4 + 2] = b; base[i * 4 + 3] = a; size[i] = s; life[i] = maxLife[i] = l; grow[i] = gr; grav[i] = gv;
  }

  // ----- 타이어 자국 -----
  const SK = 900; let sk = 0;
  const spos = new Float32Array(SK * 18), salpha = new Float32Array(SK * 6);
  const sgeo = new THREE.BufferGeometry();
  sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
  sgeo.setAttribute('alpha', new THREE.BufferAttribute(salpha, 1));
  const smat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: THREE.DoubleSide,
    vertexShader: 'attribute float alpha; varying float va; void main(){ va = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying float va; void main(){ gl_FragColor = vec4(0.04,0.04,0.06, va); }',
  });
  const skid = new THREE.Mesh(sgeo, smat); skid.frustumCulled = false; skid.renderOrder = 2; scene.add(skid);
  function skidQuad(ax, ay, az, bx, by, bz, w) {
    let dx = bx - ax, dz = bz - az; const l = Math.hypot(dx, dz); if (l < 0.05 || l > 6) return;
    const px = -dz / l * w, pz = dx / l * w, o = sk * 18; sk = (sk + 1) % SK;
    const v = [ax - px, ay, az - pz, ax + px, ay, az + pz, bx - px, by, bz - pz, ax + px, ay, az + pz, bx + px, by, bz + pz, bx - px, by, bz - pz];
    for (let i = 0; i < 18; i++) spos[o + i] = v[i];
    for (let i = 0; i < 6; i++) salpha[o / 3 + i] = 0.5;
    sgeo.attributes.position.needsUpdate = true; sgeo.attributes.alpha.needsUpdate = true;
  }

  // ----- 부스터 링 (발동 순간 뒤로 퍼지는 고리) -----
  const ringGeo = new THREE.TorusGeometry(1, 0.035, 6, 32);
  const rings = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.visible = false; scene.add(m); rings.push({ m, t: 0, dur: 0.32 });
  }
  let ringI = 0;

  // ----- 속도선 (카메라에 붙어 화면 가장자리에서 흐른다) -----
  const NS = 90, sp = new Float32Array(NS * 6), sd = [];
  for (let i = 0; i < NS; i++) { const a = Math.random() * 6.283, r = 2.6 + Math.random() * 5.5; sd.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.62, z: -6 - Math.random() * 44, l: 0.6 + Math.random() }); }
  const stg = new THREE.BufferGeometry(); stg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const stm = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false });
  const streaks = new THREE.LineSegments(stg, stm); streaks.frustumCulled = false; streaks.renderOrder = 9; streaks.visible = false;
  if (camera) { camera.add(streaks); if (!camera.parent) scene.add(camera); }

  return {
    // 카트 한 대의 드리프트 연기·자국 (st = 카트별 저장소, charge = 게이지 0~1)
    kart(st, s, dt, charge = 0) {
      const sh = Math.sin(s.h), ch = Math.cos(s.h);
      const rear = [[0.78, -0.74], [-0.78, -0.74]];
      const drifting = s.drifting && Math.abs(s.speed) > 6;
      st.acc = (st.acc || 0) + dt;
      const tick = st.acc > 0.028; if (tick) st.acc = 0;
      for (let k = 0; k < 2; k++) {
        const lx = rear[k][0], lz = rear[k][1];
        const wx = s.x + lx * ch + lz * sh, wz = s.z - lx * sh + lz * ch, wy = s.y + 0.045;
        if (drifting) {
          const p = st['p' + k];
          if (p) skidQuad(p[0], p[1], p[2], wx, wy, wz, 0.15);
          st['p' + k] = [wx, wy, wz];
          if (tick) {
            const g = 0.82 + Math.random() * 0.18, depth = Math.min(1, Math.abs(s.slip || 0.4) / 0.6);
            emit(wx, wy + 0.2, wz, (Math.random() - 0.5) * 2.5, 0.9 + Math.random() * 1.4, (Math.random() - 0.5) * 2.5, g, g, g, 0.26 + depth * 0.16, 0.9 + depth * 0.5, 0.6 + Math.random() * 0.4, 3.6);
            // 게이지가 찰수록 불꽃 색이 노랑 → 주황 → 파랑
            const c = charge > 0.85 ? [0.45, 0.8, 1] : charge > 0.45 ? [1, 0.55, 0.15] : [1, 0.86, 0.3];
            for (let q = 0; q < 2; q++) emit(wx, wy + 0.1, wz, -sh * 5 + (Math.random() - 0.5) * 7, 1.5 + Math.random() * 3.5, -ch * 5 + (Math.random() - 0.5) * 7, c[0], c[1], c[2], 1, 0.17, 0.22 + Math.random() * 0.14, 0, 16);
          }
        } else st['p' + k] = null;
      }
      if (s.boost && tick) {
        const bx = s.x - sh * 1.6, bz = s.z - ch * 1.6, big = s.boost === 2;
        emit(bx + (Math.random() - 0.5) * 0.5, s.y + 0.55, bz + (Math.random() - 0.5) * 0.5, -sh * 4, 0.6, -ch * 4, big ? 0.45 : 1, big ? 0.8 : 0.7, big ? 1 : 0.3, 0.5, big ? 0.6 : 0.4, 0.3, 2.8);
      }
    },
    burst(x, y, z, n = 14, r = 1, g = 0.8, b = 0.3) {
      for (let i = 0; i < n; i++) emit(x, y + 0.4, z, (Math.random() - 0.5) * 13, 2 + Math.random() * 6, (Math.random() - 0.5) * 13, r, g, b, 1, 0.2, 0.3 + Math.random() * 0.25, 0, 16);
    },
    dust(x, y, z, n = 5) {
      for (let i = 0; i < n; i++) { const g = 0.75 + Math.random() * 0.2; emit(x, y + 0.2, z, (Math.random() - 0.5) * 3, 0.5 + Math.random(), (Math.random() - 0.5) * 3, g, g, g * 0.95, 0.3, 0.7, 0.5, 3); }
    },
    splash(x, y, z, mv, speed, n = 2) {
      const sh = Math.sin(mv), ch = Math.cos(mv), v = Math.min(1.4, Math.abs(speed) / 25);
      for (let i = 0; i < n; i++) {
        const side = Math.random() < 0.5 ? 1 : -1, sp = 2 + Math.random() * 4 * v;
        emit(x + ch * side * 0.9, y + 0.15, z - sh * side * 0.9, ch * side * sp + sh * speed * 0.2, 2.5 + Math.random() * 4 * v, -sh * side * sp + ch * speed * 0.2, 0.75, 0.9, 1, 0.75, 0.32, 0.45 + Math.random() * 0.3, 1.2, 14);
      }
    },
    confetti(x, y, z, n = 120) {
      const cs = [[1, 0.3, 0.26], [1, 0.82, 0.12], [0.18, 0.56, 1], [0.21, 0.76, 0.35], [1, 0.44, 0.69], [1, 1, 1]];
      for (let i = 0; i < n; i++) { const c = cs[i % cs.length]; emit(x + (Math.random() - 0.5) * 16, y + 5 + Math.random() * 5, z + (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 7, 2 + Math.random() * 5, (Math.random() - 0.5) * 7, c[0], c[1], c[2], 1, 0.28, 2 + Math.random() * 1.5, 0, 5); }
    },
    ring(x, y, z, h, color = 0x7fd8ff, scale = 1) {
      const r = rings[ringI]; ringI = (ringI + 1) % rings.length;
      r.m.position.set(x - Math.sin(h) * 1.4, y + 0.6, z - Math.cos(h) * 1.4); r.m.rotation.set(0, h, 0); r.m.material.color.setHex(color);
      r.t = r.dur; r.s = scale; r.vx = -Math.sin(h) * 9; r.vz = -Math.cos(h) * 9; r.m.visible = true;
    },
    // 속도선 세기 0~1
    streak(amount, dt) {
      stm.opacity = Math.min(0.75, amount * 0.75);
      if (amount < 0.02) { streaks.visible = false; return; }
      streaks.visible = true;
      const v = 60 + amount * 150;
      for (let i = 0; i < NS; i++) {
        const s = sd[i]; s.z += v * dt;
        if (s.z > -1.5) { const a = Math.random() * 6.283, r = 2.6 + Math.random() * 5.5; s.x = Math.cos(a) * r; s.y = Math.sin(a) * r * 0.62; s.z = -46 - Math.random() * 10; }
        const len = (1.5 + amount * 7) * s.l, o = i * 6;
        sp[o] = s.x; sp[o + 1] = s.y; sp[o + 2] = s.z; sp[o + 3] = s.x * 1.02; sp[o + 4] = s.y * 1.02; sp[o + 5] = s.z + len;
      }
      stg.attributes.position.needsUpdate = true;
    },
    update(dt, viewH, fov) {
      mat.uniforms.scale.value = viewH / (2 * Math.tan(fov * Math.PI / 360));
      for (let i = 0; i < MAX; i++) {
        if (life[i] <= 0) { col[i * 4 + 3] = 0; continue; }
        life[i] -= dt; const t = Math.max(0, life[i] / maxLife[i]);
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        vel[i * 3 + 1] -= grav[i] * dt;
        size[i] += grow[i] * dt;
        col[i * 4] = base[i * 4]; col[i * 4 + 1] = base[i * 4 + 1]; col[i * 4 + 2] = base[i * 4 + 2]; col[i * 4 + 3] = base[i * 4 + 3] * Math.min(1, t * 1.6);
      }
      geo.attributes.position.needsUpdate = geo.attributes.pcolor.needsUpdate = geo.attributes.psize.needsUpdate = true;
      for (const r of rings) {
        if (r.t <= 0) continue; r.t -= dt; const k = 1 - Math.max(0, r.t) / r.dur;
        r.m.scale.setScalar((0.5 + k * 1.9) * (r.s || 1)); r.m.material.opacity = (1 - k) * 0.7; r.m.position.x += r.vx * dt; r.m.position.z += r.vz * dt;
        if (r.t <= 0) r.m.visible = false;
      }
      this._f = (this._f || 0) + dt;   // 자국은 천천히 옅어짐
      if (this._f > 0.3) { for (let i = 0; i < salpha.length; i++) if (salpha[i] > 0) salpha[i] = Math.max(0, salpha[i] - 0.008); sgeo.attributes.alpha.needsUpdate = true; this._f = 0; }
    },
    dispose() {
      scene.remove(pts, skid); for (const r of rings) { scene.remove(r.m); r.m.material.dispose(); }
      if (camera) { camera.remove(streaks); if (camera.parent === scene) scene.remove(camera); }   // 메뉴 화면에서 카메라가 다시 스스로 갱신되게
      geo.dispose(); mat.dispose(); sgeo.dispose(); smat.dispose(); ringGeo.dispose(); stg.dispose(); stm.dispose();
    },
  };
}

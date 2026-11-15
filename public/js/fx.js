// 이펙트: 드리프트 연기, 불꽃, 타이어 자국
import * as THREE from '../lib/three.bundle.js';

export function makeFx(scene) {
  // ----- 연기/불꽃 입자 -----
  const MAX = 420;
  const pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 4), size = new Float32Array(MAX);
  const vel = new Float32Array(MAX * 3), life = new Float32Array(MAX), maxLife = new Float32Array(MAX), base = new Float32Array(MAX * 4), grow = new Float32Array(MAX);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('pcolor', new THREE.BufferAttribute(col, 4));
  geo.setAttribute('psize', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { scale: { value: 400 } },
    vertexShader: 'attribute vec4 pcolor; attribute float psize; varying vec4 vc; uniform float scale; void main(){ vc = pcolor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = psize * scale / -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec4 vc; void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.15, length(d)); gl_FragColor = vec4(vc.rgb, vc.a * a);\n#include <colorspace_fragment>\n }',
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 4; scene.add(pts);
  let head = 0;
  function emit(x, y, z, vx, vy, vz, r, g, b, a, s, l, gr = 1.5) {
    const i = head; head = (head + 1) % MAX;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    base[i * 4] = r; base[i * 4 + 1] = g; base[i * 4 + 2] = b; base[i * 4 + 3] = a; size[i] = s; life[i] = maxLife[i] = l; grow[i] = gr;
  }

  // ----- 타이어 자국 -----
  const SK = 700; let sk = 0;
  const spos = new Float32Array(SK * 18), salpha = new Float32Array(SK * 6);
  const sgeo = new THREE.BufferGeometry();
  sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
  sgeo.setAttribute('alpha', new THREE.BufferAttribute(salpha, 1));
  const smat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide,
    vertexShader: 'attribute float alpha; varying float va; void main(){ va = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying float va; void main(){ gl_FragColor = vec4(0.05,0.05,0.07, va); }',
  });
  const skid = new THREE.Mesh(sgeo, smat); skid.frustumCulled = false; skid.renderOrder = 1; scene.add(skid);
  function skidQuad(ax, ay, az, bx, by, bz, w) {
    let dx = bx - ax, dz = bz - az; const l = Math.hypot(dx, dz); if (l < 0.05 || l > 6) return;
    const px = -dz / l * w, pz = dx / l * w, o = sk * 18; sk = (sk + 1) % SK;
    const v = [ax - px, ay, az - pz, ax + px, ay, az + pz, bx - px, by, bz - pz, ax + px, ay, az + pz, bx + px, by, bz + pz, bx - px, by, bz - pz];
    for (let i = 0; i < 18; i++) spos[o + i] = v[i];
    for (let i = 0; i < 6; i++) salpha[o / 3 + i] = 0.42;
    sgeo.attributes.position.needsUpdate = true; sgeo.attributes.alpha.needsUpdate = true;
  }

  return {
    // 카트 한 대의 드리프트 연기·자국 (st = 카트별 저장소)
    kart(st, s, dt) {
      const sh = Math.sin(s.h), ch = Math.cos(s.h);
      const rear = [[0.78, -0.74], [-0.78, -0.74]];
      const drifting = s.drifting && Math.abs(s.speed) > 6;
      for (let k = 0; k < 2; k++) {
        const lx = rear[k][0], lz = rear[k][1];
        const wx = s.x + lx * ch + lz * sh, wz = s.z - lx * sh + lz * ch, wy = s.y + 0.04;
        if (drifting) {
          const p = st['p' + k];
          if (p) skidQuad(p[0], p[1], p[2], wx, wy, wz, 0.13);
          st['p' + k] = [wx, wy, wz];
          st.acc = (st.acc || 0) + dt;
          if (st.acc > 0.03) {
            if (k === 1) st.acc = 0;
            const g = 0.8 + Math.random() * 0.2;
            emit(wx, wy + 0.15, wz, (Math.random() - 0.5) * 2, 0.8 + Math.random() * 1.2, (Math.random() - 0.5) * 2, g, g, g, 0.34, 0.9, 0.55 + Math.random() * 0.3, 3.2);
            if (Math.random() < 0.5) emit(wx, wy + 0.1, wz, -sh * 4 + (Math.random() - 0.5) * 5, 1.5 + Math.random() * 2.5, -ch * 4 + (Math.random() - 0.5) * 5, 1, 0.75, 0.2, 1, 0.16, 0.22, 0);
          }
        } else st['p' + k] = null;
      }
      if (s.boost === 2 && Math.random() < 0.6) {
        const bx = s.x - sh * 1.5, bz = s.z - ch * 1.5;
        emit(bx + (Math.random() - 0.5) * 0.5, s.y + 0.5, bz + (Math.random() - 0.5) * 0.5, -sh * 3, 0.5, -ch * 3, 0.45, 0.8, 1, 0.55, 0.5, 0.3, 2.5);
      }
    },
    burst(x, y, z, n = 14, r = 1, g = 0.8, b = 0.3) {
      for (let i = 0; i < n; i++) emit(x, y + 0.4, z, (Math.random() - 0.5) * 12, 2 + Math.random() * 5, (Math.random() - 0.5) * 12, r, g, b, 1, 0.2, 0.3 + Math.random() * 0.2, 0);
    },
    update(dt, viewH, fov) {
      mat.uniforms.scale.value = viewH / (2 * Math.tan(fov * Math.PI / 360));
      for (let i = 0; i < MAX; i++) {
        if (life[i] <= 0) { col[i * 4 + 3] = 0; continue; }
        life[i] -= dt; const t = Math.max(0, life[i] / maxLife[i]);
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (grow[i] === 0) vel[i * 3 + 1] -= 14 * dt;
        size[i] += grow[i] * dt;
        col[i * 4] = base[i * 4]; col[i * 4 + 1] = base[i * 4 + 1]; col[i * 4 + 2] = base[i * 4 + 2]; col[i * 4 + 3] = base[i * 4 + 3] * t;
      }
      geo.attributes.position.needsUpdate = geo.attributes.pcolor.needsUpdate = geo.attributes.psize.needsUpdate = true;
      // 자국은 천천히 옅어짐
      this._f = (this._f || 0) + dt;
      if (this._f > 0.25) { for (let i = 0; i < salpha.length; i++) if (salpha[i] > 0) salpha[i] = Math.max(0, salpha[i] - 0.012); sgeo.attributes.alpha.needsUpdate = true; this._f = 0; }
    },
    clear() { life.fill(0); salpha.fill(0); sgeo.attributes.alpha.needsUpdate = true; },
    dispose() { scene.remove(pts, skid); geo.dispose(); mat.dispose(); sgeo.dispose(); smat.dispose(); },
  };
}

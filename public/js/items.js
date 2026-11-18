// 아이템전: 아이템 상자 줄, 아이템 2칸, 6가지 아이템(부스터·바나나·방어막·물폭탄·미사일·자석), AI 아이템 사용
import * as THREE from '../lib/three.bundle.js';
import { pointAt, locate } from './tracks.js';
import { C } from './physics.js';

export const ITEM_IDS = ['boost', 'banana', 'shield', 'water', 'missile', 'magnet'];
export const ITEM_NAME = { boost: '부스터', banana: '바나나', shield: '방어막', water: '물폭탄', missile: '미사일', magnet: '자석' };
// HUD 아이콘 (24x24 SVG)
export const ITEM_SVG = {
  boost: '<svg viewBox="0 0 24 24"><path fill="#ffb347" d="M13 2c.6 3.6 4.8 5.6 4.8 10.6A5.8 5.8 0 0 1 6.2 13c0-2.2 1-3.6 2.2-4.8.1 2 .9 3 2 3.3C10.2 8 10.6 5 13 2z"/></svg>',
  banana: '<svg viewBox="0 0 24 24"><path fill="#ffd93b" d="M4 6c1 7 6 12 15 12 1 0 1.5-.8.7-1.4C12 15 8.5 11 7 4.5 6.8 3.6 3.8 4.7 4 6z"/><path fill="#7a5a1e" d="M6 3.2 7.6 3l.4 2-2 .4z"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path fill="#7fe3ff" d="M12 2 20 5v6c0 5-3.4 9-8 11-4.6-2-8-6-8-11V5z"/><path fill="#fff" opacity=".55" d="M12 4.5 6.5 6.6V11c0 3.4 2.2 6.4 5.5 8z"/></svg>',
  water: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13.5" r="7.5" fill="#3ea6ff"/><circle cx="9.5" cy="11" r="2.2" fill="#fff" opacity=".7"/><path fill="#1f5fa8" d="M11 3h2v3.5h-2z"/></svg>',
  missile: '<svg viewBox="0 0 24 24"><path fill="#ff5a4e" d="M20.5 3.5c-4 0-8 2-10.5 5.5L7 12l5 5 3-3c3.5-2.5 5.5-6.5 5.5-10.5z"/><path fill="#ffd23f" d="M7 12 3 13l2 2-2 4 4-2 2 2 1-4z"/><circle cx="15" cy="9" r="1.8" fill="#fff"/></svg>',
  magnet: '<svg viewBox="0 0 24 24"><path fill="#ff5a4e" d="M4 4h5v8a3 3 0 0 0 6 0V4h5v8a8 8 0 0 1-16 0z"/><path fill="#e8ecf5" d="M4 4h5v3H4zm11 0h5v3h-5z"/></svg>',
};
// 원작: 바나나 밟으면 조작 불능 2초, 물폭탄 갇힘 2초(좌우 연타로 줄일 수 있음). 미사일 시간은 확인된 자료가 없어 1.5초
const HIT = { banana: { t: 2, kind: 'spin' }, missile: { t: 1.5, kind: 'flip' }, water: { t: 2, kind: 'bubble' } };

// 순위별 아이템 확률 — 원작(크레이지레이싱 카트라이더) 기준
//  부스터: 중위 20% · 하위 60% / 자석: 상위 5% · 중위 8% · 하위 20% / 미사일: 중위 15%, 2~6위
//  물폭탄: 2~6위 / 실드: 1~3위 / 바나나: 개인전 1위
//  원작에만 있는 아이템(물파리·구름·천사 등) 몫은 같은 순위에서 나오는 우리 아이템에 비율대로 나눴다.
const TIER_W = {
  first: { banana: 50, shield: 45, magnet: 5 },
  upper: { shield: 32, water: 32, missile: 31, magnet: 5 },
  middle: { boost: 20, magnet: 8, missile: 15, water: 57 },
  lower: { boost: 75, magnet: 25 },
};
export function tierOf(rank, n) { return rank === 1 ? 'first' : rank <= 3 ? 'upper' : rank > Math.max(3, n - 2) ? 'lower' : 'middle'; }
function roll(tier) {
  const w = TIER_W[tier]; let sum = 0; for (const id in w) sum += w[id];
  let r = Math.random() * sum; for (const id in w) { r -= w[id]; if (r <= 0) return id; }
  return 'boost';
}

// 상자 줄 위치: 점프대·장애물·출발선에서 떨어진 평평한 곳 3군데
function boxRows(T) {
  const N = T.n, rows = [], bad = new Uint8Array(N);
  const mark = (i, r) => { for (let o = -r; o <= r; o++) bad[((i + o) % N + N) % N] = 1; };
  for (let i = 0; i < N; i++) if (T.ramp[i] || T.surf[i] || Math.abs(T.slope[i]) > 0.12) mark(i, 6);
  for (const j of T.jumps || []) mark(j.i, (j.cnt || 6) + 14);
  for (const o of T.obs || []) mark(o.i, 9);
  for (const p of T.pads || []) mark(p.i, 6);
  for (const S of T.shortcuts || []) { mark(S.iA, 10); mark(S.iB, 10); }
  mark(0, 30);
  for (const f of [0.17, 0.49, 0.78]) {
    const i0 = Math.round(f * N);
    for (let d = 0; d < N / 8; d++) {
      const c = [i0 + d, i0 - d].map(i => ((i % N) + N) % N).find(i => !bad[i] && Math.abs(T.curv[i]) < 0.02);
      if (c !== undefined) { rows.push(c); mark(c, 40); break; }
    }
  }
  return rows;
}

// net: 온라인일 때 {send(msg)}. 내 카트의 줍기·사용·피격만 알리고, 다른 사람 것은 받은 대로 똑같이 그린다.
export function makeItems(R, scene, net = null) {
  let uidN = 0; const newUid = () => (R.me ? R.me.id : 0) + '_' + (++uidN);
  const tell = (e, msg) => { if (net && e && e.me) net.send({ t: 'it', ...msg }); };
  const T = R.T, grp = new THREE.Group(); scene.add(grp);
  const disp = [];
  // 상자: 반투명 무지개 큐브 + 물음표
  const qTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 64, 64); gr.addColorStop(0, '#ff7ad9'); gr.addColorStop(0.5, '#7fd8ff'); gr.addColorStop(1, '#ffe46b'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(3, 3, 58, 58); g.fillStyle = '#fff'; g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 32, 35); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; disp.push(t); return t; })();
  const boxGeo = new THREE.BoxGeometry(1.15, 1.15, 1.15), boxMat = new THREE.MeshBasicMaterial({ map: qTex, transparent: true, opacity: 0.88 });
  disp.push(boxGeo, boxMat);
  const boxes = [];
  for (const i of boxRows(T)) {
    const hw = T.hw[i] - 1.4, n = hw > 6 ? 5 : 4;
    for (let q = 0; q < n; q++) {
      const lat = -hw + (2 * hw) * (q / (n - 1)), p = pointAt(T, i * T.ds, lat);
      const m = new THREE.Mesh(boxGeo, boxMat); m.position.set(p.x, p.y + 1.1, p.z); grp.add(m);
      boxes.push({ i, x: p.x, y: p.y, z: p.z, m, off: 0, ph: q * 0.7 });
    }
  }
  // 바나나·물폭탄·미사일·방어막 모양
  const banGeo = new THREE.TorusGeometry(0.42, 0.13, 6, 10, Math.PI * 1.15), banMat = new THREE.MeshLambertMaterial({ color: '#ffd93b', emissive: '#4a3a00' });
  const wbGeo = new THREE.SphereGeometry(0.55, 14, 10), wbMat = new THREE.MeshPhongMaterial({ color: '#3ea6ff', shininess: 90, transparent: true, opacity: 0.9 });
  const bubGeo = new THREE.SphereGeometry(1, 18, 12), bubMat = new THREE.MeshPhongMaterial({ color: '#9fdcff', transparent: true, opacity: 0.38, shininess: 120, depthWrite: false });
  const misGeo = new THREE.ConeGeometry(0.28, 1.3, 8); misGeo.rotateX(Math.PI / 2); const misMat = new THREE.MeshLambertMaterial({ color: '#ff5a4e', emissive: '#661010' });
  const shGeo = new THREE.SphereGeometry(1.75, 18, 12), shMat = new THREE.MeshBasicMaterial({ color: '#7fe3ff', transparent: true, opacity: 0.22, depthWrite: false });
  disp.push(banGeo, banMat, wbGeo, wbMat, bubGeo, bubMat, misGeo, misMat, shGeo, shMat);

  const drops = [];   // 바나나 {x,y,z,i,m,age}
  const proj = [];    // 물폭탄 {kind:'water', ...} / 미사일 {kind:'missile', ...}
  const zones = [];   // 물폭탄 물방울 {x,y,z,r,t,m}
  const fxs = new Map();   // kart -> {shield mesh, bubble mesh}
  const sfxQ = [];         // main이 소리·메시지를 낸다: {type, e}
  const stats = { get: 0, use: {}, hit: {}, block: 0 };

  const rankList = () => [...R.karts].sort((a, b) => b.k.prog - a.k.prog);
  function tier(e) { const L = rankList(); return tierOf(L.indexOf(e) + 1, L.length); }
  function aheadOf(e) { const L = rankList(), i = L.indexOf(e); return i > 0 ? L[i - 1] : null; }

  function give(e) {
    const s = e.items || (e.items = []);
    if (s.length >= 2) return;
    s.push(roll(tier(e))); e.itemHold = 0;
    sfxQ.push({ type: 'get', e }); stats.get++;
  }
  function hit(e, kind, uid) {
    const k = e.k;
    if (k.stunT > 0) return false;
    if (k.shieldT > 0) { k.shieldT = 0; sfxQ.push({ type: 'block', e }); stats.block++; tell(e, { a: 'block', uid }); return false; }
    const h = HIT[kind]; k.stunT = h.t; k.stunKind = h.kind; k.stunMax = h.t;
    tell(e, { a: 'hit', kind, uid });
    sfxQ.push({ type: 'hit', e, kind }); stats.hit[kind] = (stats.hit[kind] || 0) + 1;
    return true;
  }
  function use(e) {
    const s = e.items; if (!s || !s.length || e.k.stunT > 0) return false;
    const id = s.shift(), k = e.k, uid = newUid();
    let a;
    if (id === 'banana') { const b = pointAt(T, k.s - 3.2, k.lat); a = { x: +b.x.toFixed(2), y: +b.y.toFixed(2), z: +b.z.toFixed(2) }; }
    else if (id === 'water') a = { s: +k.s.toFixed(1), lat: +k.lat.toFixed(2) };
    else if (id === 'missile') { const tg = aheadOf(e); a = { s: +(k.s + 2).toFixed(1), lap: k.lap, lat: +k.lat.toFixed(2), sp: +Math.max(48, k.speed + 18).toFixed(1), tg: tg ? tg.id : -1 }; }
    else a = {};
    if (id === 'boost') { k.boostT = 3; k.startB = false; }   // 원작 아이템전 부스터는 카트와 상관없이 3초
    else if (id === 'magnet') { k.magT = 4; k.magTarget = aheadOf(e); }   // 원작 자석 4초
    spawn(e, id, uid, a);
    tell(e, { a: 'use', item: id, uid, ...a });
    return true;
  }
  // 아이템이 나타나는 부분 (내 것이든 받은 것이든 똑같이)
  function spawn(e, id, uid, a) {
    if (id === 'shield') e.k.shieldT = 2;   // 원작 실드: 2초 동안 공격 1번 막기
    else if (id === 'banana') {
      const m = new THREE.Mesh(banGeo, banMat); m.position.set(a.x, a.y + 0.32, a.z); m.rotation.set(-Math.PI / 2, 0, Math.random() * 6); grp.add(m);
      drops.push({ x: a.x, y: a.y, z: a.z, m, age: 0, owner: e, uid });   // 원작: 30초 동안 남음
      if (drops.length > 14) { const o = drops.shift(); grp.remove(o.m); }
    } else if (id === 'water') {
      const m = new THREE.Mesh(wbGeo, wbMat); grp.add(m);
      proj.push({ kind: 'water', owner: e, s0: a.s, lat: a.lat, t: 0, dur: 0.9, dist: 32, m, uid });
    } else if (id === 'missile') {
      const m = new THREE.Mesh(misGeo, misMat); grp.add(m);
      proj.push({ kind: 'missile', owner: e, target: R.byId.get(a.tg) || null, s: a.s, lap: a.lap, lat: a.lat, t: 0, m, speed: a.sp, uid });
    }
    sfxQ.push({ type: 'use', e, id }); stats.use[id] = (stats.use[id] || 0) + 1;
  }
  // 받은 메시지
  function remove(uid) {
    for (const L of [drops, proj, zones]) { const q = L.findIndex(o => o.uid === uid); if (q >= 0) { grp.remove(L[q].m); L.splice(q, 1); } }
  }
  function onNet(m, e) {
    if (!e || e.me) return;
    const num = v => Number.isFinite(v) ? v : 0;
    if (m.a === 'box') { const b = boxes[m.b | 0]; if (b) { b.off = 1.6; b.m.visible = false; } }
    else if (m.a === 'use' && ITEM_IDS.includes(m.item)) spawn(e, m.item, String(m.uid), { x: num(m.x), y: num(m.y), z: num(m.z), s: num(m.s), lat: num(m.lat), lap: m.lap | 0, sp: num(m.sp) || 48, tg: m.tg });
    else if (m.a === 'hit' && HIT[m.kind]) { const h = HIT[m.kind]; e.k.stunT = h.t; e.k.stunKind = h.kind; e.k.stunMax = h.t; remove(String(m.uid)); sfxQ.push({ type: 'hit', e, kind: m.kind }); if (m.kind === 'missile') sfxQ.push({ type: 'boom', x: e.k.x, y: e.k.y, z: e.k.z }); }
    else if (m.a === 'block') { e.k.shieldT = 0; remove(String(m.uid)); sfxQ.push({ type: 'block', e }); }
  }

  const L0 = {};
  function update(dt, time) {
    for (const e of R.karts) {
      if (!e.remote) continue;
      const k = e.k;
      if (e.vis) { k.x = e.vis.x; k.y = e.vis.y; k.z = e.vis.z; const L = locate(T, k.x, k.z, k.ti, 14, L0); k.ti = L.i; k.lat = L.lat; k.s = L.s; }
      if (k.stunT > 0) k.stunT -= dt;
      if (k.shieldT > 0) k.shieldT -= dt;
    }
    // 상자 회전·다시 생기기·줍기
    for (const b of boxes) {
      if (b.off > 0) { b.off -= dt; b.m.visible = b.off <= 0; if (b.off <= 0) b.m.scale.setScalar(0.4); }
      if (b.m.visible) {
        b.m.rotation.set(time * 0.9 + b.ph, time * 1.4 + b.ph, 0); b.m.position.y = b.y + 1.1 + Math.sin(time * 2.5 + b.ph) * 0.12;
        const sc = b.m.scale.x; if (sc < 1) b.m.scale.setScalar(Math.min(1, sc + dt * 3));
        for (const e of R.karts) {
          if (e.remote) continue;
          const k = e.k; if (Math.abs(k.x - b.x) < 1.7 && Math.abs(k.z - b.z) < 1.7 && Math.abs(k.y - b.y) < 2.2) { b.off = 1.6; b.m.visible = false; give(e); tell(e, { a: 'box', b: boxes.indexOf(b) }); break; }
        }
      }
    }
    // 바나나 밟기
    for (let q = drops.length - 1; q >= 0; q--) {
      const d = drops[q]; d.age += dt; d.m.rotation.z += dt * 0.5;
      let gone = d.age > 30;
      for (const e of R.karts) {
        if (e.remote || gone) continue;
        if (e === d.owner && d.age < 0.6) continue;
        const k = e.k; if ((k.x - d.x) ** 2 + (k.z - d.z) ** 2 < 1.25 ** 2 && Math.abs(k.y - d.y) < 1.5) { hit(e, 'banana', d.uid); gone = true; }
      }
      if (gone) { grp.remove(d.m); drops.splice(q, 1); }
    }
    // 물폭탄 날아가기 → 물방울 / 미사일 따라가기
    for (let q = proj.length - 1; q >= 0; q--) {
      const p = proj[q]; p.t += dt;
      if (p.kind === 'water') {
        const u = Math.min(1, p.t / p.dur), pt = pointAt(T, p.s0 + 2 + p.dist * u, p.lat * (1 - u * 0.5));
        p.m.position.set(pt.x, pt.y + 1 + Math.sin(u * Math.PI) * 6, pt.z);
        if (u >= 1) {
          grp.remove(p.m); proj.splice(q, 1);
          const m = new THREE.Mesh(bubGeo, bubMat); m.position.set(pt.x, pt.y + 1.4, pt.z); m.scale.setScalar(0.3); grp.add(m);
          zones.push({ x: pt.x, y: pt.y, z: pt.z, r: 3.6, t: 4.5, m, owner: p.owner, age: 0, uid: p.uid });
          sfxQ.push({ type: 'splash', x: pt.x, y: pt.y, z: pt.z });
        }
      } else {
        const tgk = p.target && p.target.k;
        // 목표 카트를 따라 트랙 위를 날아간다
        p.s += p.speed * dt;
        let ds = 0;
        if (tgk) { const myProg = p.lap * T.length + p.s, tp = tgk.prog; ds = tp - myProg; p.lat += Math.max(-dt * 6, Math.min(dt * 6, tgk.lat - p.lat)); }
        if (p.s > T.length) { p.s -= T.length; p.lap++; }
        const pt = pointAt(T, p.s, p.lat), nx = pointAt(T, p.s + 1, p.lat);
        const y = tgk && Math.abs(ds) < 12 ? tgk.y : pt.y;
        p.m.position.set(pt.x, y + 0.8, pt.z); p.m.lookAt(nx.x, y + 0.8, nx.z);
        if (Math.random() < 0.6) sfxQ.push({ type: 'trail', x: pt.x, y: y + 0.8, z: pt.z });
        let done = p.t > 7;
        if (tgk && Math.abs(ds) < 1.8) { if (!p.target.remote) { hit(p.target, 'missile', p.uid); sfxQ.push({ type: 'boom', x: tgk.x, y: tgk.y, z: tgk.z }); } done = true; }
        if (!tgk && p.t > 2.5) done = true;
        if (done) { grp.remove(p.m); proj.splice(q, 1); }
      }
    }
    // 물방울 안에 들어온 카트
    for (let q = zones.length - 1; q >= 0; q--) {
      const z = zones[q]; z.t -= dt; z.age += dt;
      const sc = Math.min(1, z.age * 4) * z.r * (z.t < 0.4 ? z.t / 0.4 : 1); z.m.scale.setScalar(Math.max(0.01, sc)); z.m.position.y = z.y + sc * 0.45;
      for (const e of R.karts) { if (e.remote) continue; const k = e.k; if ((k.x - z.x) ** 2 + (k.z - z.z) ** 2 < z.r * z.r && Math.abs(k.y - z.y) < 3 && !(e === z.owner && z.age < 0.5)) { if (hit(e, 'water', z.uid)) { z.t = Math.min(z.t, 0.35); } } }
      if (z.t <= 0) { grp.remove(z.m); zones.splice(q, 1); }
    }
    // 자석: 앞 카트 쪽으로 끌려가며 가속
    for (const e of R.karts) {
      const k = e.k;
      if (k.magT > 0) {
        k.magT -= dt; const t = k.magTarget && k.magTarget.k;
        if (t && k.stunT <= 0) { const gap = t.prog - k.prog; if (gap > 2 && gap < 90) k.boostT = Math.max(k.boostT, 0.12); }
        else if (!t && k.stunT <= 0) k.boostT = Math.max(k.boostT, 0.08);
      }
      if (!e.items) e.items = [];
      e.itemHold = (e.itemHold || 0) + dt;
    }
  }

  // 카트 꾸미기: 방어막 구, 물방울 갇힘, 맞았을 때 돌기·뒤집기
  function pose(e, dt, time) {
    const k = e.k, g = e.model.group;
    let f = fxs.get(e); if (!f) { f = { sh: new THREE.Mesh(shGeo, shMat), bub: new THREE.Mesh(bubGeo, bubMat) }; f.sh.visible = f.bub.visible = false; grp.add(f.sh, f.bub); fxs.set(e, f); }
    f.sh.visible = k.shieldT > 0 && (k.shieldT > 1 || Math.sin(time * 30) > 0); f.sh.position.set(g.position.x, g.position.y + 0.8, g.position.z);
    const stun = k.stunT > 0, u = stun ? 1 - k.stunT / (k.stunMax || 1) : 0;
    f.bub.visible = stun && k.stunKind === 'bubble';
    if (stun && k.stunKind === 'spin') g.rotation.y += u * Math.PI * 4;
    if (stun && k.stunKind === 'flip') { g.position.y += Math.sin(u * Math.PI) * 2.4; g.rotation.x = u * Math.PI * 2; }
    if (f.bub.visible) { const lift = Math.min(1, u * 5) * 0.9; g.position.y += lift; g.rotation.y += Math.sin(time * 3) * 0.3; f.bub.position.set(g.position.x, g.position.y + 0.7, g.position.z); f.bub.scale.setScalar(1.7 + Math.sin(time * 6) * 0.05); }
  }

  // AI: 상황을 보고 아이템을 쓴다
  function botThink(e, skill) {
    const s = e.items; if (!s || !s.length || e.k.stunT > 0) return;
    const id = s[0], k = e.k, hold = e.itemHold || 0;
    if (hold < 0.6 + (1 - skill) * 1.6) return;
    const L = rankList(), i = L.indexOf(e), front = L[i - 1], back = L[i + 1];
    const gapF = front ? front.k.prog - k.prog : 1e9, gapB = back ? k.prog - back.k.prog : 1e9;
    let go = false;
    if (id === 'boost') go = Math.abs(T.curv[k.ti]) < 0.012 || hold > 5;
    else if (id === 'banana') go = gapB < 30 || hold > 7;
    else if (id === 'shield') go = proj.some(p => p.kind === 'missile' && p.target === e) || hold > 9;
    else if (id === 'water') go = (gapF > 18 && gapF < 45) || hold > 8;
    else if (id === 'missile') go = gapF < 150 || hold > 6;
    else if (id === 'magnet') go = (gapF > 6 && gapF < 60) || hold > 8;
    if (go) use(e);
  }

  function dispose() { scene.remove(grp); for (const d of disp) d.dispose && d.dispose(); }
  return { update, use, pose, botThink, dispose, sfxQ, boxes, give, hit, stats, onNet };
}

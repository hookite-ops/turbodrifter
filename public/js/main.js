// 터보 드리프터 — 게임 본체 (메뉴, 레이스, HUD, 입력, 온라인)
import * as THREE from '../lib/three.bundle.js';
import { TRACKS, buildTrack, gridSlot, pointAt } from './tracks.js';
import { C, KMH, createKart, placeKart, stepKart, startBoost, stepDraft, pushApart, createBot, botInput } from './physics.js';
import { buildWorld, preloadLandmarks } from './world.js';
import { loadKartAsset, makeKart, poseKart, makeTag, setKartShadow, CHARS, COLORS, KARTS } from './kartmodel.js';
import { makeFx } from './fx.js';
import { sfx, music } from './audio.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const fmt = ms => { if (ms == null) return '리타이어'; const m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60, c = Math.floor(ms / 10) % 100; return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`; };
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };

// ---------------- 기록·고스트 (혼자 달리기) ----------------
const recKey = c => `${c.track}|${c.mode}|${c.laps}|${c.track === 'neon' ? 'm3' : 'm2'}`;   // m2: 맵을 다시 만든 뒤의 기록
const records = store.get('td_rec', {});
const fmtGap = ms => (ms < 0 ? '-' : '+') + (Math.abs(ms) / 1000).toFixed(2);

// ---------------- 렌더러 ----------------
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const camera = new THREE.PerspectiveCamera(70, 1, 0.3, 3000);
let VW = 1, VH = 1, viewH = 1, baseFov = 70, splitOn = false;
function resize() {
  VW = window.innerWidth; VH = window.innerHeight;
  renderer.setSize(VW, VH, false);
  // 세로 화면 레이스: 위 60%는 게임 화면, 아래 40%는 조작 패널
  const split = splitOn && VW < VH * 0.9;
  viewH = split ? Math.round(VH * 0.6) : VH;
  renderer.setViewport(0, VH - viewH, VW, viewH); renderer.setScissor(0, VH - viewH, VW, viewH); renderer.setScissorTest(split);
  camera.aspect = VW / viewH;
  // 세로 화면에서는 좌우 시야가 좁아지지 않게 세로 시야각을 키운다
  baseFov = camera.aspect >= 1.2 ? 66 : clamp(2 * Math.atan(Math.tan(29 * Math.PI / 180) / camera.aspect) * 180 / Math.PI, 66, 100);
  camera.fov = baseFov; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); window.addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

// 그림자 품질: PC는 켜고 시작, 터치 기기는 끄고 시작 (메뉴에서 바꿀 수 있음)
let HQ = store.get('td_hq', !(('ontouchstart' in window) || navigator.maxTouchPoints > 0));

// ---------------- 프로필 ----------------
const profile = store.get('td_profile', { name: '', char: 0, color: 0, kart: 0, kv: 2 });
// 클래식 카트를 뺀 뒤(v3.1): 옛 번호 0 클래식·1 토이·2 로켓 → 0 토이·1 로켓
if (profile.kv !== 2) { profile.kart = Math.max(0, (profile.kart | 0) - 1); profile.kv = 2; store.set('td_profile', profile); }
if (!profile.name) profile.name = '라이더' + Math.floor(100 + Math.random() * 900);
const saveProfile = () => { store.set('td_profile', profile); if (net.connected) net.send({ t: 'me', name: profile.name, char: profile.char, color: profile.color, kart: profile.kart | 0 }); };

// ---------------- 화면 전환 ----------------
const SCREENS = ['menu', 'online', 'room', 'solo', 'help', 'results', 'pause'];
let screen = 'menu';
function show(name) {
  screen = name;
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== name);
  $('ver').classList.toggle('hidden', name !== 'menu');
}
let toastT = 0;
function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }

// ---------------- 메뉴 장면 (카트 미리보기) ----------------
const menuScene = new THREE.Scene();
let menuKart = null;
{
  const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    // 어두운 차고 + 뒤에서 비추는 노란 사선 조명
    fragmentShader: `varying vec3 d; void main(){ vec3 n = normalize(d); vec3 a = vec3(0.078,0.086,0.122); vec3 b = vec3(0.16,0.18,0.27);
      vec3 c = mix(b, a, smoothstep(-0.1, 0.7, n.y));
      float band = smoothstep(0.035, 0.0, abs(fract((n.x * 1.3 + n.y * 2.2) * 2.0) - 0.5) - 0.2) * smoothstep(0.75, 0.05, n.y) * step(n.z, 0.2);
      c += vec3(1.0, 0.82, 0.12) * band * 0.035;
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
    }`,
  }));
  menuScene.add(sky);
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) { x.fillStyle = (a + b) % 2 ? '#1c1f2b' : '#f6f3ea'; x.fillRect(a * 32, b * 32, 32, 32); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.7, 0.36, 48), [new THREE.MeshLambertMaterial({ color: '#ffd21e' }), new THREE.MeshLambertMaterial({ map: tex }), new THREE.MeshLambertMaterial({ color: '#14161f' })]);
  disc.position.y = -0.18; menuScene.add(disc);
  // 차고 바닥: 아스팔트 + 피트 박스 선
  const fc = document.createElement('canvas'); fc.width = fc.height = 1024; const fx2 = fc.getContext('2d');
  fx2.fillStyle = '#242836'; fx2.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 5000; i++) { fx2.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${0.03 + Math.random() * 0.05})`; fx2.fillRect(Math.random() * 1024, Math.random() * 1024, 2 + Math.random() * 3, 2 + Math.random() * 3); }
  fx2.strokeStyle = '#f6f3ea'; fx2.lineWidth = 10; fx2.strokeRect(332, 300, 360, 424);                       // 피트 박스
  fx2.strokeStyle = '#ffd21e'; fx2.lineWidth = 14; fx2.beginPath(); fx2.moveTo(0, 820); fx2.lineTo(1024, 820); fx2.stroke();
  for (let i = 0; i < 16; i++) { fx2.fillStyle = i % 2 ? '#14161f' : '#ffd21e'; fx2.beginPath(); fx2.moveTo(i * 64, 860); fx2.lineTo(i * 64 + 64, 860); fx2.lineTo(i * 64 + 32, 920); fx2.lineTo(i * 64 - 32, 920); fx2.fill(); }
  const ftex = new THREE.CanvasTexture(fc); ftex.colorSpace = THREE.SRGBColorSpace; ftex.anisotropy = 8;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshLambertMaterial({ map: ftex })); floor.rotation.x = -Math.PI / 2; floor.position.set(0, -0.36, -2); menuScene.add(floor);
  const far = new THREE.Mesh(new THREE.CircleGeometry(60, 40), new THREE.MeshLambertMaterial({ color: '#1b1e29' })); far.rotation.x = -Math.PI / 2; far.position.y = -0.38; menuScene.add(far);
  // 뒷벽: 셔터 패널 + 큰 사선 띠 + 경주 번호
  const wc = document.createElement('canvas'); wc.width = 2048; wc.height = 768; const wx = wc.getContext('2d');
  wx.fillStyle = '#1d2130'; wx.fillRect(0, 0, 2048, 768);
  for (let y = 0; y < 768; y += 48) { wx.fillStyle = 'rgba(255,255,255,0.035)'; wx.fillRect(0, y, 2048, 3); wx.fillStyle = 'rgba(0,0,0,0.22)'; wx.fillRect(0, y + 44, 2048, 4); }
  wx.save(); wx.transform(1, 0, -0.42, 1, 0, 0);
  wx.fillStyle = '#ffd21e'; wx.fillRect(760, 0, 300, 768); wx.fillStyle = '#ff3d2e'; wx.fillRect(1090, 0, 70, 768); wx.fillStyle = '#f6f3ea'; wx.fillRect(1190, 0, 26, 768);
  wx.restore();
  wx.fillStyle = '#f6f3ea'; wx.beginPath(); wx.arc(1560, 330, 190, 0, 7); wx.fill();
  wx.fillStyle = '#14161f'; wx.font = '900 300px "Black Han Sans", "Arial Black", sans-serif'; wx.textAlign = 'center'; wx.textBaseline = 'middle'; wx.fillText('7', 1560, 350);
  for (let i = 0; i < 64; i++) for (let j = 0; j < 2; j++) { wx.fillStyle = (i + j) % 2 ? '#14161f' : '#f6f3ea'; wx.fillRect(i * 32, 704 + j * 32, 32, 32); }
  const wtex = new THREE.CanvasTexture(wc); wtex.colorSpace = THREE.SRGBColorSpace; wtex.anisotropy = 8;
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 15), new THREE.MeshLambertMaterial({ map: wtex })); wall.position.set(0, 7.1, -9.5); menuScene.add(wall);
  for (const sx of [-1, 1]) { const sw = new THREE.Mesh(new THREE.PlaneGeometry(26, 15), new THREE.MeshLambertMaterial({ color: '#191c28' })); sw.position.set(sx * 20, 7.1, 3.5); sw.rotation.y = -sx * Math.PI / 2; menuScene.add(sw); }
  // 타이어 더미·공구 상자 (차고 소품)
  const tg = new THREE.TorusGeometry(0.55, 0.26, 10, 20), tm = new THREE.MeshLambertMaterial({ color: '#15171d' });
  for (const [px, pz, n] of [[-5.2, -5.5, 4], [-4.0, -6.2, 3], [6.4, -6.0, 4]]) for (let i = 0; i < n; i++) { const t = new THREE.Mesh(tg, tm); t.rotation.x = Math.PI / 2; t.position.set(px, -0.1 + i * 0.52, pz); menuScene.add(t); }
  const bx = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, 0.9), new THREE.MeshLambertMaterial({ color: '#ff3d2e' })); bx.position.set(5.0, 0.24, -6.6); menuScene.add(bx);
  const spot = new THREE.SpotLight('#fff3d0', 60, 30, 0.5, 0.6, 1.2); spot.position.set(0, 9, 3); spot.target.position.set(0, 0, 0); menuScene.add(spot, spot.target);
  menuScene.add(new THREE.HemisphereLight('#ffffff', '#3a4266', 1.5));
  const d = new THREE.DirectionalLight('#ffffff', 2.2); d.position.set(3, 5, 4); menuScene.add(d);
  const rim = new THREE.DirectionalLight('#ffd21e', 1.4); rim.position.set(-4, 2, -4); menuScene.add(rim);
}
function refreshMenuKart() {
  if (menuKart) menuScene.remove(menuKart.group);
  menuKart = makeKart(profile.char, profile.color, profile.kart | 0); menuScene.add(menuKart.group);
}

// ---------------- 입력 ----------------
const key = { left: false, right: false, accel: false, brake: false, drift: false };
const tap = { drift: false, boost: false, accel: false };
let usingTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
document.body.classList.toggle('kb', !usingTouch);
const setTouchMode = v => { if (usingTouch !== v) { usingTouch = v; document.body.classList.toggle('kb', !v); } };

window.addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return;
  if (e.repeat) { if (race) e.preventDefault(); return; }
  sfx.init(); let used = true;
  switch (e.code) {
    case 'KeyM': music.setOn(!music.on); toast(music.on ? '음악 켬' : '음악 끔'); break;
    case 'ArrowLeft': key.left = true; break;
    case 'ArrowRight': key.right = true; break;
    case 'ArrowUp': key.accel = true; tap.accel = true; break;
    case 'ArrowDown': key.brake = true; break;
    case 'ShiftLeft': case 'ShiftRight': case 'Space': key.drift = true; tap.drift = true; break;
    case 'ControlLeft': case 'ControlRight': case 'KeyZ': case 'KeyX': tap.boost = true; break;
    case 'KeyR': resetKart(); break;
    case 'Escape': if (race) togglePause(); break;
    default: used = false;
  }
  if (used && race) { e.preventDefault(); setTouchMode(false); }
});
window.addEventListener('keyup', e => {
  switch (e.code) {
    case 'ArrowLeft': key.left = false; break;
    case 'ArrowRight': key.right = false; break;
    case 'ArrowUp': key.accel = false; break;
    case 'ArrowDown': key.brake = false; break;
    case 'ShiftLeft': case 'ShiftRight': case 'Space': key.drift = false; break;
  }
});
window.addEventListener('blur', () => { key.left = key.right = key.accel = key.brake = key.drift = false; });

// 터치 버튼 (손가락마다 따로 추적)
const touchSteer = { dir: 0 };
function bindHold(el, on, off) {
  const ids = new Set();
  el.addEventListener('pointerdown', e => { e.preventDefault(); sfx.init(); setTouchMode(true); ids.add(e.pointerId); try { el.setPointerCapture(e.pointerId); } catch (_) {} el.classList.add('on'); on(e); });
  const up = e => { if (!ids.delete(e.pointerId)) return; if (!ids.size) { el.classList.remove('on'); off(e); } };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
}
{
  const st = $('t-steer'), l = $('t-l'), r = $('t-r'); const pts = new Map();
  const calc = () => {
    let d = 0; const b = st.getBoundingClientRect();
    for (const x of pts.values()) d = x < b.left + b.width / 2 ? -1 : 1; // 마지막 손가락 기준
    touchSteer.dir = d; l.classList.toggle('on', d < 0); r.classList.toggle('on', d > 0);
  };
  st.addEventListener('pointerdown', e => { e.preventDefault(); sfx.init(); setTouchMode(true); pts.set(e.pointerId, e.clientX); try { st.setPointerCapture(e.pointerId); } catch (_) {} calc(); });
  st.addEventListener('pointermove', e => { if (pts.has(e.pointerId)) { pts.set(e.pointerId, e.clientX); calc(); } });
  const up = e => { if (pts.delete(e.pointerId)) calc(); };
  st.addEventListener('pointerup', up); st.addEventListener('pointercancel', up); st.addEventListener('lostpointercapture', up);
  bindHold($('t-drift'), () => { key.drift = true; tap.drift = true; }, () => { key.drift = false; });
  bindHold($('t-boost'), () => { tap.boost = true; }, () => {});
  bindHold($('t-brake'), () => { key.brake = true; }, () => { key.brake = false; });
}
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('pointerdown', () => sfx.init(), { once: true });

// ---------------- 트랙 캐시·썸네일 ----------------
const trackCache = new Map();
const getTrack = id => { if (!trackCache.has(id)) trackCache.set(id, buildTrack(TRACKS.find(t => t.id === id) || TRACKS[0])); return trackCache.get(id); };
function trackPath(T, w, h, pad) {
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < T.n; i++) { minX = Math.min(minX, -T.x[i]); maxX = Math.max(maxX, -T.x[i]); minZ = Math.min(minZ, -T.z[i]); maxZ = Math.max(maxZ, -T.z[i]); }
  const s = Math.min((w - pad * 2) / (maxX - minX), (h - pad * 2) / (maxZ - minZ));
  const ox = (w - (maxX - minX) * s) / 2 - minX * s, oz = (h - (maxZ - minZ) * s) / 2 - minZ * s;
  return { s, map: (x, z) => [-x * s + ox, -z * s + oz] };
}
function drawTrack(cv, T, lw = 7, bg = null) {
  const c = cv.getContext('2d'), w = cv.width, h = cv.height; c.clearRect(0, 0, w, h);
  if (bg) { c.fillStyle = bg; c.fillRect(0, 0, w, h); }
  const P = trackPath(T, w, h, lw + 6);
  const path = () => { c.beginPath(); for (let i = 0; i <= T.n; i += 2) { const [x, y] = P.map(T.x[i % T.n], T.z[i % T.n]); i ? c.lineTo(x, y) : c.moveTo(x, y); } c.closePath(); };
  c.lineJoin = c.lineCap = 'round';
  path(); c.strokeStyle = 'rgba(13,19,48,.85)'; c.lineWidth = lw + 5; c.stroke();
  path(); c.strokeStyle = '#ffffff'; c.lineWidth = lw; c.stroke();
  for (const S of (T.shortcuts || [])) {   // 지름길: 점선
    c.beginPath(); for (let i = 0; i < S.n; i += 2) { const [x, y] = P.map(S.x[i], S.z[i]); i ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.setLineDash([lw * 0.9, lw * 0.7]); c.strokeStyle = 'rgba(255,210,30,0.95)'; c.lineWidth = Math.max(2, lw * 0.45); c.stroke(); c.setLineDash([]);
  }
  const [sx, sy] = P.map(T.x[0], T.z[0]); c.fillStyle = '#ff4d42'; c.beginPath(); c.arc(sx, sy, lw * 0.9, 0, 7); c.fill();
  return P;
}
const THEME_BG = { village: '#4faa3c', desert: '#d9a658', ice: '#a9d8f2', city: '#2a2152' };

// ---------------- 경기 설정 UI (방·혼자 공용) ----------------
function makeSetup(el, cfg, onChange) {
  el.className = 'setup';
  el.innerHTML = `<div class="tracks"></div>
    <div class="su-right"><h3 class="su-name"></h3><div class="su-meta"><span class="lv"></span><span class="len"></span><span class="rec"></span></div><p class="desc"></p>
    <div class="lbl">모드</div><div class="seg" data-k="mode"><button data-v="speed">스피드전</button><button data-v="infinite">무한 부스터전</button></div>
    <div class="lbl">바퀴 수</div><div class="seg" data-k="laps"><button data-v="1">1바퀴</button><button data-v="2">2바퀴</button><button data-v="3">3바퀴</button></div>
    <div class="su-extra"></div></div>`;
  const tr = el.querySelector('.tracks');
  for (const d of TRACKS) {
    const b = document.createElement('button'); b.className = 'tcard'; b.dataset.id = d.id;
    b.innerHTML = `<canvas width="310" height="200"></canvas><b>${d.name}</b><i>${d.level}</i><small class="rec"></small><span class="ck"></span>`;
    tr.appendChild(b); drawTrack(b.querySelector('canvas'), getTrack(d.id), 8, THEME_BG[d.theme]);
    b.onclick = () => { sfx.click(); cfg.track = d.id; cfg.laps = d.laps; onChange(cfg); paint(); };
  }
  el.querySelectorAll('.seg button').forEach(b => b.onclick = () => { sfx.click(); const k = b.parentElement.dataset.k; cfg[k] = k === 'laps' ? +b.dataset.v : b.dataset.v; onChange(cfg); paint(); });
  function paint() {
    tr.querySelectorAll('.tcard').forEach(b => { b.classList.toggle('on', b.dataset.id === cfg.track); const r = records[recKey({ ...cfg, track: b.dataset.id, laps: b.dataset.id === cfg.track ? cfg.laps : (TRACKS.find(t => t.id === b.dataset.id) || {}).laps })]; b.querySelector('.rec').textContent = r ? '기록 ' + fmt(r.total) : ''; });
    el.querySelectorAll('.seg button').forEach(b => b.classList.toggle('on', String(cfg[b.parentElement.dataset.k]) === b.dataset.v));
    const d = TRACKS.find(t => t.id === cfg.track); el.querySelector('.desc').textContent = d ? d.desc : '';
    if (d) {
      el.querySelector('.su-name').textContent = d.name; el.querySelector('.su-meta .lv').textContent = d.level;
      el.querySelector('.su-meta .len').textContent = `한 바퀴 ${Math.round(getTrack(d.id).length)}m`;
      const r = records[recKey(cfg)]; el.querySelector('.su-meta .rec').textContent = r ? '내 기록 ' + fmt(r.total) : '';
    }
  }
  paint();
  return { paint, extra: el.querySelector('.su-extra'), lock(v) { el.classList.toggle('locked', v); } };
}

// ---------------- 온라인 ----------------
const net = {
  ws: null, id: 0, token: '', connected: false, offset: 0, room: null, _samples: [], _rc: false,
  now() { return Date.now() + this.offset; },
  send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); },
  // resume: 끊기기 전에 받은 토큰. 있으면 같은 자리(방·경기)로 되돌아간다. 결과: true 성공 / false 자리가 없어짐
  connect(resume = '') {
    if (this.connected) return Promise.resolve(true);
    return new Promise((res, rej) => {
      const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
      this.ws = ws; let done = false;
      const fail = () => { if (!done) { done = true; rej(new Error('연결 실패')); } };
      const ready = m => {
        this.id = m.id; this.token = m.token; this.connected = true; this._samples = [];
        try { sessionStorage.setItem('td_tok', m.token); } catch (e) {}
        for (let i = 0; i < 5; i++) setTimeout(() => this.send({ t: 'ping', c: Date.now() }), i * 150);
      };
      ws.onerror = fail;
      ws.onclose = () => {
        if (this.ws !== ws) return;
        const was = this.connected; this.connected = false; fail();
        if (!was) return;
        if (this.room && !this.bye) this.reconnect(); else { this.room = null; onDisconnected(); }
      };
      ws.onmessage = ev => {
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.t === 'welcome') {
          if (resume) { ws.send(JSON.stringify({ t: 'resume', token: resume })); return; }
          ready(m);
          this.send({ t: 'me', name: profile.name, char: profile.char, color: profile.color, kart: profile.kart | 0 });
          if (!done) { done = true; res(true); }
        } else if (m.t === 'resumed') {
          ready(m); this.room = m.room;
          if (!done) { done = true; res(true); }
          if (!race && m.go) startRace({ ...m.go, online: true, players: m.room.players.filter(p => p.racing) });
          else if (!race) { show('room'); renderRoom(); }
        } else if (m.t === 'resumeFail') {
          this.ws = null; try { ws.close(); } catch (e) {}
          if (!done) { done = true; res(false); }
        } else if (m.t === 'pong') {
          const rtt = Date.now() - m.c; this._samples.push({ rtt, off: m.s - (m.c + rtt / 2) });
          this._samples.sort((a, b) => a.rtt - b.rtt); this.offset = this._samples[0].off;
        } else onNet(m);
      };
    });
  },
  // 연결이 끊기면 20초 안에 같은 자리로 되돌아가기를 시도한다 (경기 중이면 내 카트는 계속 달린다)
  reconnect() {
    if (this._rc) return; this._rc = true;
    const token = this.token; let tries = 0;
    toast('연결이 끊겼어요. 다시 연결하는 중…');
    const giveUp = () => { this._rc = false; this.room = null; onDisconnected(); };
    const attempt = () => {
      tries++;
      this.connect(token).then(ok => { if (ok) { this._rc = false; toast('다시 연결됐어요.'); } else giveUp(); })
        .catch(() => { if (tries < 8) setTimeout(attempt, 2000); else giveUp(); });
    };
    setTimeout(attempt, 500);
  },
};
setInterval(() => { if (net.connected) net.send({ t: 'ping', c: Date.now() }); }, 20000);

function onDisconnected() {
  toast('서버와 연결이 끊겼어요.');
  if (race && race.online) endRace();
  if (['online', 'room', 'results'].includes(screen) || race) show('menu');
}
const roomCfg = { track: 'village', mode: 'speed', laps: 3 };
let roomSetup = null;
function renderRoom() {
  const r = net.room; if (!r) return;
  $('roomcode').textContent = r.code;
  const host = r.host === net.id;
  Object.assign(roomCfg, { track: r.track, mode: r.mode, laps: r.laps });
  roomSetup.paint(); roomSetup.lock(!host);
  $('pcount').textContent = `${r.players.length}/8`;
  const pl = $('players'); pl.innerHTML = '';
  for (let i = 0; i < 8; i++) {
    const p = r.players[i], d = document.createElement('div');
    if (!p) { d.className = 'pl empty'; d.textContent = '빈 자리'; }
    else {
      d.className = 'pl';
      const st = p.off ? '<span class="st off">끊김</span>' : p.racing ? '<span class="st run">경기 중</span>' : p.id === r.host ? '<span class="st host">방장</span>' : p.ready ? '<span class="st ok">준비</span>' : '<span class="st">대기</span>';
      const kick = host && p.id !== net.id && r.state === 'lobby' ? '<button class="kick" aria-label="내보내기" title="내보내기">✕</button>' : '';
      d.innerHTML = `<span class="sw" style="background:${COLORS[p.color % COLORS.length].hex}"></span><span class="nm"></span>${st}${kick}`;
      d.querySelector('.nm').textContent = `${p.name}${p.id === net.id ? ' (나)' : ''}`;
      const kb = d.querySelector('.kick'); if (kb) kb.onclick = () => { sfx.click(); net.send({ t: 'kick', id: p.id }); };
    }
    pl.appendChild(d);
  }
  const me = r.players.find(p => p.id === net.id) || {};
  const busy = r.state === 'racing';   // 경기 중인 방에 들어왔을 때: 끝날 때까지 기다린다
  $('b-start').classList.toggle('hidden', !host || busy); $('b-ready').classList.toggle('hidden', host || busy);
  $('b-ready').textContent = me.ready ? '준비 취소' : '준비 완료';
  $('b-ready').classList.toggle('blue', !!me.ready);
  $('roomhint').textContent = host ? (r.players.length < 2 ? '친구에게 방 코드를 알려 주세요. 혼자서도 출발할 수 있어요.' : '모두 준비하면 출발할 수 있어요.') : '방장이 트랙과 모드를 고릅니다. 준비를 눌러 주세요.';
}
function renderRoomList(list) {
  const el = $('roomlist'); el.innerHTML = '';
  if (!list.length) { el.innerHTML = '<div class="desc">열린 방이 없어요. 방을 만들어 친구를 불러 보세요.</div>'; return; }
  for (const r of list) {
    const b = document.createElement('button'); b.className = 'roomrow';
    const tn = (TRACKS.find(t => t.id === r.track) || {}).name || '';
    b.innerHTML = `<b>${r.code}</b><span></span><em style="font-style:normal">${r.n}/${r.max}${r.state !== 'lobby' ? ' · 경기 중' : ''}</em>`;
    b.querySelector('span').textContent = `${r.host}의 방 · ${tn} · ${r.mode === 'infinite' ? '무한 부스터전' : '스피드전'}`;
    b.onclick = () => { sfx.click(); net.send({ t: 'join', code: r.code }); };
    el.appendChild(b);
  }
}
function onNet(m) {
  switch (m.t) {
    case 'rooms': renderRoomList(m.rooms); break;
    case 'room': net.room = m.room; if (!race && screen !== 'results') show('room'); renderRoom(); if (m.room.state === 'racing' && !race) $('roomhint').textContent = '지금 경기가 진행 중이에요. 끝나면 여기서 다음 경기에 함께 출발해요.'; break;
    case 'kicked': net.room = null; toast(m.m || '방장이 방에서 내보냈어요.'); if (!race) { show('online'); net.send({ t: 'list' }); } break;
    case 'bye': net.bye = true; toast('서버가 다시 시작되고 있어요. 잠시 후 다시 접속해 주세요.'); setTimeout(() => { net.bye = false; }, 8000); break;
    case 'err': toast(m.m); break;
    case 'go': net.room = m.room; startRace({ track: m.track, mode: m.mode, laps: m.laps, online: true, slots: m.slots, startAt: m.startAt, players: m.room.players.filter(p => p.racing !== false) }); break;
    case 's': if (race && race.online) { const k = race.byId.get(m.id); if (k && !k.me) recvState(k, m.d); } break;
    case 'fin': if (race && race.online) { const k = race.byId.get(m.id); if (k) { k.finished = true; k.finishTime = m.time; if (!k.me) k.k.finished = true; } } break;
    case 'endIn': if (race) race.endAt = performance.now() + m.ms; break;
    case 'left': if (race && race.online) removeKart(m.id); break;
    case 'over': net.room = m.room; if (race && race.online) finishRace(m.results.map(r => ({ ...r, me: r.id === net.id }))); break;
  }
}

// ---------------- 레이스 ----------------
const scene = new THREE.Scene();
let race = null, paused = false;
const BOT_NAMES = ['번개', '솜사탕', '호두', '단풍', '초코', '모카', '구름', '라임', '보리', '자두'];

function addKart(R, o) {
  const model = makeKart(o.char, o.color, o.kart | 0);
  const e = { kartIdx: o.kart | 0, id: o.id, name: o.name, me: !!o.me, bot: o.bot || null, remote: !!o.remote, k: createKart(), model, fx: {}, finished: false, finishTime: 0, char: o.char, color: o.color, net: null, vis: null, lapStart: 0, bestLap: 0, inp: null };
  placeKart(e.k, R.T, gridSlot(R.T, o.slot));
  setKartShadow(model, HQ);
  if (!e.me) { e.tag = makeTag(o.name, e.bot ? '#d5dcff' : '#ffffff'); model.group.add(e.tag); }
  R.scene.add(model.group); R.karts.push(e); R.byId.set(e.id, e);
  return e;
}
function removeKart(id) {
  const R = race, e = R.byId.get(id); if (!e || e.me) return;
  R.scene.remove(e.model.group); R.karts.splice(R.karts.indexOf(e), 1); R.byId.delete(id);
}

function startRace(cfg) {
  if (race) endRace();
  sfx.init();
  const T = getTrack(cfg.track);
  renderer.shadowMap.enabled = HQ;
  const world = buildWorld(T, { hq: HQ });
  while (scene.children.length) scene.remove(scene.children[0]);
  scene.add(world.group); scene.fog = world.fog; scene.background = new THREE.Color(world.theme.hor);
  const R = race = {
    cfg, T, world, scene, fx: makeFx(scene, camera), rule: { infinite: cfg.mode === 'infinite' }, laps: cfg.laps, online: !!cfg.online,
    karts: [], byId: new Map(), me: null, phase: 'countdown', startPerf: 0, time: 0, acc: 0, endAt: 0, firstFin: false,
    lastCount: 9, startTap: -1e9, startUsed: false, sendT: 0, hudT: 0, camA: 0, camY: 0, shake: 0, boostAmt: 0, finT: 0, tipT: 0, msgT: 0, subT: 0, resetCd: 0, order: [], mini: null, done: false,
  };
  if (cfg.online) {
    R.startPerf = performance.now() + (cfg.startAt - net.now());
    for (const p of cfg.players) addKart(R, { id: p.id, name: p.name, char: p.char, color: p.color, kart: p.kart, slot: cfg.slots[p.id] ?? 0, me: p.id === net.id, remote: p.id !== net.id });
  } else {
    R.startPerf = performance.now() + 8600;   // 앞 4초: 트랙 소개 비행
    const n = cfg.rivals | 0, slots = [...Array(n + 1).keys()];
    const mySlot = n; // 맨 뒤에서 출발
    const used = new Set([profile.color]);
    addKart(R, { id: 0, name: profile.name, char: profile.char, color: profile.color, kart: profile.kart, slot: mySlot, me: true });
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    for (let i = 0; i < n; i++) {
      let col = Math.floor(Math.random() * COLORS.length); while (used.has(col) && used.size < COLORS.length) col = (col + 1) % COLORS.length; used.add(col);
      const skill = 0.5 + 0.48 * (1 - i / Math.max(1, n - 1 || 1));
      addKart(R, { id: 100 + i, name: names[i], char: Math.floor(Math.random() * CHARS.length), color: col, kart: Math.floor(Math.random() * KARTS.length), slot: i, bot: createBot(n === 1 ? 0.8 : skill) });
    }
  }
  R.me = R.karts.find(k => k.me);
  R.camA = R.me.k.h; R.camY = R.me.k.y;
  { let a = 1e9, b2 = -1e9, c = 1e9, d = -1e9; for (let i = 0; i < T.n; i++) { a = Math.min(a, T.x[i]); b2 = Math.max(b2, T.x[i]); c = Math.min(c, T.z[i]); d = Math.max(d, T.z[i]); } R.center = { x: (a + b2) / 2, z: (c + d) / 2, r: Math.max(b2 - a, d - c) / 2 }; }
  R.introShown = false;
  // 기록·고스트
  R.lapTimes = []; R.frames = []; R.recNext = 0; R.rec = null; R.ghost = null;
  if (!R.online) {
    R.rec = records[recKey(cfg)] || null;
    const gf = (cfg.rivals | 0) === 0 && R.rec ? store.get('td_ghost_' + recKey(cfg), null) : null;
    if (gf && gf.length > 8) {
      const gm = makeKart(profile.char, profile.color, profile.kart | 0);
      gm.group.traverse(o => { if (o.isMesh || o.isSprite) { const mats = Array.isArray(o.material) ? o.material : [o.material]; o.material = mats.map(m => { const c = m.clone(); c.transparent = true; c.opacity = Math.min(c.opacity ?? 1, 0.38); c.depthWrite = false; return c; }); if (o.material.length === 1) o.material = o.material[0]; o.castShadow = false; } });
      gm.group.add(makeTag('고스트', '#9fe8ff')); scene.add(gm.group);
      R.ghost = { f: gf, model: gm };
    }
  }
  R.autoBot = createBot(0.7);
  // HUD 준비
  $('h-laps').textContent = R.laps; $('h-best').textContent = R.rec ? '기록 ' + fmt(R.rec.total) : ''; $('h-of').textContent = '/' + R.karts.length;
  R.miniBase = document.createElement('canvas'); R.miniBase.width = R.miniBase.height = 220; R.miniMap = drawTrack(R.miniBase, T, 9);
  hideMsg(); setSub('');
  for (const s of SCREENS) $(s).classList.add('hidden'); $('ver').classList.add('hidden');
  $('hud').classList.remove('hidden'); $('touch').classList.remove('hidden');
  $('b-restart').classList.toggle('hidden', R.online);
  paused = false; screen = 'race';
  document.body.classList.add('racing'); splitOn = true; resize();
  sfx.startRace(); music.play(R.laps <= 1 ? T.def.theme + '_final' : T.def.theme, 0.6); music.preload(T.def.theme + '_final');
  $('h-tip').innerHTML = usingTouch ? '<span>방향 + 드리프트 → 게이지가 차면 부스터</span>'
    : '<span><kbd>←</kbd><kbd>→</kbd> 방향</span><span><kbd>↑</kbd> 가속</span><span><kbd>Shift</kbd> 드리프트</span><span><kbd>Ctrl</kbd> 부스터</span>';
  $('h-tip').classList.remove('hidden'); R.tipT = 11;
  if (usingTouch) { // 전체 화면 + 가로 고정 시도 (안 되면 그냥 진행)
    try { const p = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen({ navigationUI: 'hide' }); if (p && p.then) p.then(() => { try { screen_.orientation.lock('landscape').catch(() => {}); } catch (e) {} }).catch(() => {}); } catch (e) {}
  }
}
const screen_ = window.screen;

function endRace() {
  if (!race) return;
  const R = race; race = null;
  sfx.stopRace();
  R.fx.dispose(); scene.remove(R.world.group); R.world.dispose();
  for (const k of R.karts) scene.remove(k.model.group);
  if (R.ghost) scene.remove(R.ghost.model.group);
  $('hud').classList.add('hidden'); $('touch').classList.add('hidden'); $('boostfx').style.opacity = 0;
  renderer.shadowMap.enabled = false;
  document.body.classList.remove('racing'); splitOn = false; resize();
}

function finishRace(results) {
  const R = race; if (!R || R.done) return; R.done = true;
  const list = $('res-list'); list.innerHTML = '';
  for (const r of results) {
    const d = document.createElement('div'); d.className = `res r${r.rank}${r.me ? ' me' : ''}`;
    d.style.setProperty('--i', r.rank - 1);
    d.innerHTML = `<span class="rk">${r.rank}위</span><span class="nm"></span><span class="tm">${fmt(r.time)}</span>`;
    d.querySelector('.nm').textContent = r.name; list.appendChild(d);
  }
  const mine = results.find(r => r.me);
  $('res-title').textContent = mine ? (mine.time == null ? '리타이어…' : R.newRec ? (R.karts.length > 1 ? `${mine.rank}위 · 신기록!` : `신기록! ${fmt(mine.time)}`) : `${mine.rank}위로 완주!`) : '경기 결과';
  const wasOnline = R.online, cfg = R.cfg;
  const top = results.filter(r => r.time != null).slice(0, 3).map(r => { const e = R.karts.find(x => x.id === r.id); return e ? { char: e.char, color: e.color, kart: e.kartIdx, name: r.name, rank: r.rank, me: r.me } : null; }).filter(Boolean);
  setTimeout(() => {
    endRace(); buildPodium(top); show('results'); music.play('menu', 1.2);
    $('b-res-ok').onclick = () => { sfx.click(); if (wasOnline && net.room) { show('room'); renderRoom(); } else show(wasOnline ? 'menu' : 'solo'); };
  }, mine && mine.time != null ? 1800 : 900);
}

function localResults() {
  const R = race;
  const done = R.karts.filter(k => k.finished).sort((a, b) => a.finishTime - b.finishTime);
  const dnf = R.karts.filter(k => !k.finished).sort((a, b) => b.k.prog - a.k.prog);
  return [...done, ...dnf].map((k, i) => ({ id: k.id, name: k.name, time: k.finished ? k.finishTime : null, rank: i + 1, me: k.me }));
}

function recvState(e, d) {
  const now = performance.now();
  e.net = { x: d[0], z: d[1], y: d[2], h: d[3], mv: d[4], speed: d[5], flags: d[6], prog: d[7], steer: d[8] || 0, t: now };
  if (!e.vis) e.vis = { x: d[0], z: d[1], y: d[2], h: d[3] };
  e.k.prog = d[7];
}

function resetKart() {
  const R = race; if (!R || R.phase !== 'race' || R.resetCd > 0 || R.me.finished || paused) return;
  const k = R.me.k, p = pointAt(R.T, k.s, clamp(k.lat, -3, 3));
  k.x = p.x; k.z = p.z; k.y = p.y; k.h = k.mv = p.h; k.speed = 0; k.drifting = false; k.boostT = 0; k.instT = 0; k.air = false; k.vy = 0;
  R.resetCd = 1.5; sfx.click();
}
function togglePause() {
  if (!race || race.done) return;
  paused = !paused; $('pause').classList.toggle('hidden', !paused);
  $('b-mute').textContent = sfx.muted ? '소리 켜기' : '소리 끄기';
  if (paused && !race.online) race.pauseAt = performance.now();
  else if (!paused && !race.online && race.pauseAt) { const d = performance.now() - race.pauseAt; race.startPerf += d; if (race.endAt) race.endAt += d; race.pauseAt = 0; }
  if (paused) sfx.drive(0, false, 0);
  $('b-music').textContent = music.on ? '음악 끄기' : '음악 켜기';
  music.duck(paused ? 0.35 : 1);
}

// ----- HUD 헬퍼 -----
function showMsg(text, cls = '', dur = 1.2) { const m = $('h-msg'); m.textContent = text; m.className = 'h-msg pop ' + cls; void m.offsetWidth; race.msgT = dur; }
function hideMsg() { $('h-msg').classList.add('hidden'); }
let subKey = '';
function setSub(text, cls = '') { const k = text + cls; if (k === subKey) return; subKey = k; const s = $('h-sub'); s.textContent = text; s.className = 'h-sub ' + cls + (text ? '' : ' hidden'); }
function showTip(text, dur) { const t = $('h-tip'); t.textContent = text; t.classList.remove('hidden'); setTimeout(() => t.classList.add('hidden'), dur * 1000); }
const hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }

const H = 1 / 120;
const _lk = new THREE.Vector3();
function updateRace(dt, now) {
  const R = race, T = R.T, me = R.me, k = me.k;
  const simulate = !(paused && !R.online);
  const t = (now - R.startPerf) / 1000; R.time = t;

  // ----- 카운트다운 -----
  if (R.phase === 'countdown') {
    if (t < -4.3) {   // 트랙 소개
      if (!R.introShown) { R.introShown = true; showMsg(T.def.name, 'intro', 3.6); }
      if (!R.online && (tap.accel || tap.boost || tap.drift)) { R.startPerf = now + 4300; tap.accel = tap.boost = tap.drift = false; }   // 아무 키나 누르면 건너뛰기
    }
    R.world.setLights && R.world.setLights(t < -3 ? 0 : t < -2 ? 2 : t < -1 ? 4 : 5);
    const c = Math.ceil(-t);
    if (tap.accel || tap.boost) R.startTap = now;
    if (c !== R.lastCount && c <= 3 && c >= 1) { R.lastCount = c; showMsg(String(c), '', 0.9); sfx.beep(false); }
    if (t >= 0) {
      R.phase = 'race'; showMsg('GO!', 'go', 1.0); sfx.beep(true); R.world.setLights && R.world.setLights('go'); R.lightsOffAt = t + 4;
      for (const e of R.karts) e.lapStart = 0;
      if (now - R.startTap < 160) { startBoost(k, R.rule.infinite); R.startUsed = true; boostFx(R, k); setTimeout(() => race === R && flashSub('출발 부스터!', 'inst'), 0); }
      for (const e of R.karts) if (e.bot && Math.random() < e.bot.skill * 0.7) startBoost(e.k, R.rule.infinite);
    }
    tap.accel = tap.boost = tap.drift = false;
  }

  if (R.lightsOffAt && t > R.lightsOffAt) { R.lightsOffAt = 0; R.world.setLights && R.world.setLights(0); }
  // ----- 물리 (고정 간격) -----
  if (simulate && R.phase !== 'countdown') {
    R.acc += dt; let first = true; R.rule.time = Math.max(0, t);
    while (R.acc >= H) {
      R.acc -= H;
      // 내 카트
      let inp;
      if (me.finished || window.__tdAuto) inp = botInput(R.autoBot, k, T, H, R.rule.time);   // __tdAuto: 자동 주행 테스트용
      else {
        const steer = usingTouch ? -touchSteer.dir : (key.left ? 1 : 0) - (key.right ? 1 : 0);
        inp = { steer, accel: usingTouch ? !key.brake : key.accel, brake: key.brake, drift: key.drift, driftTap: first && tap.drift, boostTap: first && tap.boost, accelTap: first && tap.accel };
        if (first && !R.startUsed && t < 0.36 && (tap.accel || tap.boost)) { startBoost(k, R.rule.infinite); R.startUsed = true; inp.boostTap = false; boostFx(R, k); flashSub('출발 부스터!', 'inst'); }
      }
      stepKart(k, inp, H, T, R.rule);
      handleEvents(R, me, k.ev);
      for (const e of R.karts) {
        if (e.bot && !e.finished) { stepKart(e.k, botInput(e.bot, e.k, T, H, R.rule.time), H, T, R.rule); if (e.k.ev.lap !== undefined) botLap(R, e); }
        else if (e.bot) stepKart(e.k, botInput(e.bot, e.k, T, H, R.rule.time), H, T, R.rule);
      }
      // 드래프트: 앞 카트 3~22m 뒤, 좌우 2.4m 안에서 1.5초 따라가면 순간 가속
      for (const a of R.karts) {
        if (a.remote) continue;
        const q = a.k; let behind = false;
        if (q.speed > 17 && !q.air) {
          const sh = Math.sin(q.mv), ch = Math.cos(q.mv);
          for (const b of R.karts) {
            if (b === a) continue;
            const bx = b.remote && b.vis ? b.vis.x : b.k.x, bz = b.remote && b.vis ? b.vis.z : b.k.z, by = b.remote && b.vis ? b.vis.y : b.k.y;
            if (Math.abs(by - q.y) > 3) continue;
            const dx = bx - q.x, dz = bz - q.z, al = dx * sh + dz * ch, lt = dx * ch - dz * sh;
            if (al > 3 && al < 22 && Math.abs(lt) < 2.4) { behind = true; break; }
          }
        }
        if (stepDraft(q, behind, H, R.rule.infinite) && a.me) { sfx.noise(0.6, 2800, 700, 0.3); flashSub('드래프트!', 'inst'); boostFx(R, q); }
      }
      // 카트끼리 밀기
      for (const a of R.karts) {
        if (a.remote) continue;
        for (const b of R.karts) {
          if (a === b) continue;
          const bx = b.remote ? (b.vis ? b.vis.x : b.k.x) : b.k.x, bz = b.remote ? (b.vis ? b.vis.z : b.k.z) : b.k.z;
          const bs = b.remote && b.net ? b.net.speed : b.k.speed, bm = b.remote && b.net ? b.net.mv : b.k.mv, by = b.remote && b.vis ? b.vis.y : b.k.y;
          const hit = pushApart(a.k, bx, bz, by, Math.sin(bm) * bs, Math.cos(bm) * bs);
          if (hit > 4 && a.me && first) { sfx.hit(hit * 0.5); R.shake = 0.22; }
        }
      }
      first = false;
    }
    if (!first) tap.accel = tap.boost = tap.drift = false;
  } else if (R.phase !== 'countdown') tap.accel = tap.boost = tap.drift = false;
  if (R.resetCd > 0) R.resetCd -= dt;

  // ----- 기록용 위치 저장 · 고스트 재생 -----
  if (!R.online && R.phase === 'race' && simulate) {
    if (!me.finished) while (t >= R.recNext) { R.frames.push(Math.round(k.x * 10), Math.round(k.z * 10), Math.round(k.y * 10), Math.round(k.h * 100)); R.recNext += 0.1; }
    if (R.ghost) {
      const f = R.ghost.f, n = f.length / 4, u = t * 10, i = Math.min(n - 2, Math.floor(u)), a = Math.min(1, u - i), m = R.ghost.model;
      if (u >= n - 1) m.group.visible = false;
      else {
        const o = i * 4, q = o + 4, x = (f[o] + (f[q] - f[o]) * a) / 10, z = (f[o + 1] + (f[q + 1] - f[o + 1]) * a) / 10, y = (f[o + 2] + (f[q + 2] - f[o + 2]) * a) / 10;
        let dh = (f[q + 3] - f[o + 3]) / 100; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
        const sp = Math.hypot(f[q] - f[o], f[q + 1] - f[o + 1]);   // 0.1초 동안 이동(10배 단위) = m/s
        poseKart(m, { x, y, z, h: f[o + 3] / 100 + dh * a, speed: sp, steer: 0, slip: 0, drifting: false, boost: 0, slope: 0 }, dt, now / 1000);
      }
    }
  }

  // ----- 원격 카트 보간 -----
  for (const e of R.karts) {
    if (!e.remote || !e.net) continue;
    const n = e.net, age = Math.min(0.4, (now - n.t) / 1000);
    const tx = n.x + Math.sin(n.mv) * n.speed * age, tz = n.z + Math.cos(n.mv) * n.speed * age;
    const v = e.vis, a = 1 - Math.exp(-14 * dt);
    if (Math.hypot(tx - v.x, tz - v.z) > 25) { v.x = tx; v.z = tz; v.y = n.y; v.h = n.h; }
    v.x += (tx - v.x) * a; v.z += (tz - v.z) * a; v.y += (n.y - v.y) * a; v.h += wrap(n.h - v.h) * a;
  }

  // ----- 순위 -----
  const order = R.karts.slice().sort((a, b) => (a.finished && b.finished) ? a.finishTime - b.finishTime : a.finished ? -1 : b.finished ? 1 : b.k.prog - a.k.prog);
  R.order = order; const myRank = order.indexOf(me) + 1;
  if (R.phase === 'race' && R.lastRank && myRank !== R.lastRank && t > 3 && !me.finished) {   // 순위가 바뀌면 숫자판이 튄다
    const el = document.querySelector('.h-rank'); el.classList.remove('up', 'down'); void el.offsetWidth; el.classList.add(myRank < R.lastRank ? 'up' : 'down');
    if (myRank < R.lastRank) sfx.tone(988, 0.08, 'triangle', 0.12);
  }
  R.lastRank = myRank;

  // ----- 혼자 달리기: 종료 판정 -----
  if (!R.online && !R.done && R.phase === 'race') {
    if (R.karts.every(e => e.finished) || (R.endAt && now >= R.endAt)) finishRace(localResults());
  }

  // ----- 모델·이펙트 -----
  const tt = now / 1000;
  for (const e of R.karts) {
    let s;
    if (e.remote) {
      if (!e.vis) { s = { x: e.k.x, y: e.k.y, z: e.k.z, h: e.k.h, speed: 0, steer: 0, slip: 0, drifting: false, boost: 0, slope: 0 }; }
      else { const n = e.net, f = n.flags | 0; s = { x: e.vis.x, y: e.vis.y, z: e.vis.z, h: e.vis.h, speed: n.speed, steer: n.steer, slip: wrap(n.h - n.mv), drifting: !!(f & 1), boost: f & 2 ? 2 : f & 4 ? 1 : 0, slope: 0 }; }
    } else {
      const q = e.k; s = { x: q.x, y: q.y, z: q.z, h: q.h, speed: q.speed, steer: q.steer, slip: q.slip, drifting: q.drifting, boost: q.boostT > 0 || q.padT > 0 ? 2 : q.instT > 0 ? 1 : 0, slope: q.air ? clamp(q.vy / Math.max(8, q.speed), -0.55, 0.55) : (q._loc.slope || 0) };
    }
    poseKart(e.model, s, dt, tt);
    if (simulate) {
      R.fx.kart(e.fx, s, dt, e.me ? k.gauge : 0.3);
      if (!e.me && s.boost === 2 && e.fx.wasBoost !== 2) R.fx.ring(s.x, s.y, s.z, s.h);   // 다른 카트의 부스터 발동
      e.fx.wasBoost = s.boost;
    }
  }
  // 슬립스트림 바람
  if (simulate && (k.draftT > 0.15 || k.draftB > 0)) { R.draftAcc = (R.draftAcc || 0) + dt; if (R.draftAcc > 0.05) { R.draftAcc = 0; R.fx.streakAt && R.fx.streakAt(k, k.draftB > 0); } }
  // 물 튀김
  if (simulate) for (const e of R.karts) { const q = e.k; if (!e.remote && q.surf === 2 && Math.abs(q.speed) > 5 && Math.random() < dt * 30) R.fx.splash(q.x, q.y, q.z, q.mv, q.speed); }
  R.fx.update(simulate ? dt : 0, viewH, camera.fov);
  R.world.update(tt, k.x, k.z, R.rule.time || 0);

  // ----- 카메라 -----
  const sp01 = clamp(k.speed / C.boostSpeed, 0, 1), boosting = k.boostT > 0 || k.padT > 0;
  R.boostAmt += ((boosting ? 1 : k.instT > 0 ? 0.45 : 0) - R.boostAmt) * (1 - Math.exp(-(boosting ? 9 : 3) * dt));
  // 진행 방향을 따라가되, 드리프트 중에는 차체가 꺾인 모습이 보이도록 조금만 같이 돈다
  const lookYaw = k.mv + k.slip * 0.38;
  R.camA += wrap(lookYaw - R.camA) * (1 - Math.exp(-(R.phase === 'countdown' ? 20 : 8.5) * dt));
  R.camY += (k.y - R.camY) * (1 - Math.exp(-9 * dt));
  let orbit = 0, extraD = 0, extraH = 0;
  if (R.phase === 'countdown') {                         // 출발 전: 앞쪽에서 돌아 들어오는 연출
    const u = clamp((t + 4.3) / 3.3, 0, 1), e = 1 - (1 - u) ** 3;
    orbit = (1 - e) * 2.7; extraD = (1 - e) * 3.4; extraH = (1 - e) * 1.5;
  } else if (me.finished) {                              // 완주 후: 앞으로 돌아 나가며 카트를 비춘다
    R.finT += dt; const u = clamp(R.finT / 2.4, 0, 1), e = u * u * (3 - 2 * u);
    orbit = e * 2.75; extraD = e * 1.4;
  }
  const yaw = R.camA + orbit, front = clamp(1 - Math.abs(orbit) / 1.3, 0, 1);
  const dist = 5.3 + sp01 * 0.9 + R.boostAmt * 1.1 + extraD, ch = 2.45 + sp01 * 0.2 + extraH;
  let shx = 0, shy = 0;
  if (R.shake > 0) { R.shake -= dt; const a = Math.max(0, R.shake) * 1.7; shx = Math.sin(now * 0.085) * a; shy = Math.cos(now * 0.12) * a * 0.7; }
  if (R.boostAmt > 0.05) { shx += Math.sin(now * 0.07) * 0.022 * R.boostAmt; shy += Math.sin(now * 0.113) * 0.016 * R.boostAmt; }
  camera.position.set(k.x - Math.sin(yaw) * dist + Math.cos(yaw) * shx, R.camY + ch + shy, k.z - Math.cos(yaw) * dist - Math.sin(yaw) * shx);
  camera.lookAt(k.x + Math.sin(R.camA) * 5.5 * front, R.camY + 0.95, k.z + Math.cos(R.camA) * 5.5 * front);
  if (R.phase === 'countdown' && t < -3.7) {   // 트랙 소개: 하늘에서 트랙 전체를 돌아보다가 출발선으로 내려온다
    const C0 = R.center, u = clamp((t + 8.6) / 4.3, 0, 1), a0 = R.camA + Math.PI * 0.75 - u * 1.6;
    const rad = C0.r * (1.25 - u * 0.35), hgt = C0.r * (0.85 - u * 0.3) + 20;
    const ix = C0.x + Math.sin(a0) * rad, iz = C0.z + Math.cos(a0) * rad;
    const blend = clamp((t + 4.6) / 0.9, 0, 1), e = blend * blend * (3 - 2 * blend);   // 마지막 0.9초는 출발 카메라로 이어 붙이기
    const lx = C0.x + (k.x - C0.x) * u * 0.6, lz = C0.z + (k.z - C0.z) * u * 0.6;
    const cpx = camera.position.x, cpy = camera.position.y, cpz = camera.position.z;
    camera.position.set(ix + (cpx - ix) * e, hgt + (cpy - hgt) * e, iz + (cpz - iz) * e);
    _lk.set(lx + (k.x - lx) * e, 0 + (R.camY + 0.95) * e, lz + (k.z - lz) * e); camera.lookAt(_lk);
  }
  const fovT = baseFov + sp01 * 6 + R.boostAmt * 12;
  camera.fov += (Math.min(fovT, 112) - camera.fov) * (1 - Math.exp(-7 * dt)); camera.updateProjectionMatrix();
  R.fx.streak(R.phase === 'countdown' ? 0 : clamp((sp01 - 0.66) * 1.1, 0, 0.3) + R.boostAmt * 0.7, dt);
  { const o = Math.round(R.boostAmt * 25) / 25; if (hudCache.bfx !== o) { hudCache.bfx = o; $('boostfx').style.opacity = o; } }

  // ----- 소리 -----
  if (simulate) sfx.drive(clamp(Math.abs(k.speed) / C.boostSpeed, 0, 1), k.drifting ? clamp(Math.abs(k.slip) / 0.5, 0.4, 1) : 0, boosting ? 2 : k.instT > 0 ? 1 : 0);

  // ----- 온라인 전송 -----
  if (R.online && R.phase === 'race') {
    R.sendT -= dt;
    if (R.sendT <= 0) {
      R.sendT = 1 / 15;
      const f = (k.drifting ? 1 : 0) | (k.boostT > 0 || k.padT > 0 ? 2 : 0) | (k.instT > 0 ? 4 : 0) | (me.finished ? 8 : 0);
      net.send({ t: 's', d: [+k.x.toFixed(2), +k.z.toFixed(2), +k.y.toFixed(2), +k.h.toFixed(3), +k.mv.toFixed(3), +k.speed.toFixed(2), f, Math.round(k.prog * 10) / 10, +k.steer.toFixed(2)] });
    }
  }

  // ----- HUD -----
  const kmh = Math.round(Math.abs(k.speed) * KMH);
  setText('h-speed', String(kmh));
  if (!usingTouch) { const off = Math.round(208 * (1 - clamp(kmh / 290, 0, 1))); if (hudCache.dial !== off) { hudCache.dial = off; $('dial-fg').style.strokeDashoffset = off; } }
  $('h-inst').classList.toggle('on', k.instWin > 0 && !me.finished);
  if (R.tipT > 0) { R.tipT -= dt; if (R.tipT <= 0) $('h-tip').classList.add('hidden'); }
  $('h-speedbox').classList.toggle('boost', boosting);
  { const g = Math.round(clamp(k.gauge, 0, 1) * 200) / 200; if (hudCache.gauge !== g) { hudCache.gauge = g; $('bar-i').style.transform = `scaleX(${g})`; } }
  $('bar').classList.toggle('full', k.boosts >= 2 && k.gauge >= 1);
  $('slot0').classList.toggle('on', k.boosts >= 1); $('slot1').classList.toggle('on', k.boosts >= 2);
  $('t-boost').classList.toggle('ready', k.boosts > 0 && k.instWin <= 0); $('t-boost').classList.toggle('inst', k.instWin > 0 && !me.finished);
  setText('h-rank', String(myRank)); setText('h-of', '/' + R.karts.length);
  setText('h-lap', String(clamp(k.lap + 1, 1, R.laps)));
  if (R.phase === 'race' && !me.finished) setText('h-time', fmt(Math.max(0, t * 1000)));
  if (R.msgT > 0) { R.msgT -= dt; if (R.msgT <= 0) hideMsg(); }
  if (R.subT > 0) { R.subT -= dt; }
  if (R.subT <= 0) {
    if (R.endAt && !me.finished && !R.done) setSub(`종료까지 ${Math.max(0, Math.ceil((R.endAt - now) / 1000))}`, 'end');
    else if (k.wrongT > 1 && !me.finished) setSub('역주행!', 'warn');
    else if (me.finished && !R.done) setSub(R.endAt ? `결과 발표까지 ${Math.max(0, Math.ceil((R.endAt - now) / 1000))}` : '다른 선수를 기다리는 중…', 'end');
    else setSub('');
  }
  R.hudT -= dt;
  if (R.hudT <= 0) {
    R.hudT = 0.2;
    const b = $('h-board'); let html = '';
    // 화면 높이에 들어가는 만큼만 (내 순위가 항상 보이게)
    const land = VW > VH, u = land ? Math.min(VW / 100, VH * 0.019) : Math.min(VW * 0.019, VH / 100);
    const fit = clamp(Math.floor((VH / u - (land ? (usingTouch ? 35 : 30) : 97)) / 2.95), 3, 8);
    let from = clamp(myRank - Math.ceil(fit / 2), 0, Math.max(0, order.length - fit));
    order.slice(from, from + fit).forEach((e, i) => { html += `<div class="${e.me ? 'me' : ''}${e.finished ? ' fin' : ''}"><i>${from + i + 1}</i>${e.name.replace(/[<>&]/g, '')}</div>`; });
    if (hudCache.board !== html) { hudCache.board = html; b.innerHTML = html; }
  }
  // 미니맵
  const mc = $('mini').getContext('2d'); mc.clearRect(0, 0, 220, 220); mc.drawImage(R.miniBase, 0, 0);
  for (const e of order.slice().reverse()) {
    const px = e.remote && e.vis ? e.vis.x : e.k.x, pz = e.remote && e.vis ? e.vis.z : e.k.z;
    const [x, y] = R.miniMap.map(px, pz);
    mc.beginPath(); mc.arc(x, y, e.me ? 8 : 6, 0, 7); mc.fillStyle = COLORS[e.color % COLORS.length].hex; mc.fill();
    mc.lineWidth = e.me ? 3.5 : 2; mc.strokeStyle = e.me ? '#fff' : 'rgba(13,19,48,.9)'; mc.stroke();
  }
}
function flashSub(text, cls) { subKey = ''; setSub(text, cls); race.subT = 0.9; }

function boostFx(R, k) {
  sfx.boost(); R.fx.ring(k.x, k.y, k.z, k.h); R.fx.ring(k.x, k.y, k.z, k.h, 0xffffff, 0.6);
  const f = $('flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
}
function handleEvents(R, me, ev) {
  const k = me.k;
  if (ev.boost && !ev.start) boostFx(R, k);
  if (ev.inst) { sfx.inst(); R.fx.ring(k.x, k.y, k.z, k.h, 0xffb347, 0.55); flashSub('순간 부스터!', 'inst'); }
  if (ev.charged) { sfx.charged(); R.fx.burst(k.x, k.y + 0.6, k.z, 16, 0.45, 0.8, 1); }
  if (ev.pad) boostFx(R, k);
  if (ev.driftStart) sfx.driftStart();
  if (ev.dbl) sfx.driftStart();
  if (ev.cut) sfx.tone(660, 0.05, 'square', 0.05);
  if (ev.spin) { sfx.noise(0.3, 1200, 300, 0.25); flashSub('스핀턴!', 'inst'); }
  if (ev.gaugeLost > 0.03) { const el = document.querySelector('.h-gauge'); el.classList.remove('lost'); void el.offsetWidth; el.classList.add('lost'); }
  if (ev.hit) { sfx.hit(ev.hit); R.shake = clamp(0.14 + ev.hit * 0.012, 0.16, 0.34); R.fx.burst(k.x, k.y, k.z, 12); R.fx.dust(k.x, k.y, k.z, 6); }
  if (ev.scrape && Math.random() < 0.2) R.fx.dust(k.x, k.y, k.z, 1);
  if (ev.jump) { sfx.noise(0.35, 1800, 500, 0.25); R.fx.dust(k.x, k.y, k.z, 4); }
  if (ev.land) { const v = ev.land; sfx.land(v); R.shake = Math.max(R.shake || 0, clamp(v * 0.018, 0.06, 0.3)); R.fx.dust(k.x, k.y, k.z, 6 + Math.min(10, v | 0)); if (k.surf === 2) R.fx.splash(k.x, k.y, k.z, k.mv, k.speed, 14); }
  if (ev.bump) { sfx.hit(ev.bump.soft ? ev.bump.v * 0.35 : ev.bump.v * 0.8); R.shake = Math.max(R.shake || 0, ev.bump.soft ? 0.1 : 0.2); if (ev.bump.soft) R.fx.burst(k.x, k.y + 0.8, k.z, 14, 0.95, 0.8, 0.35); else R.fx.burst(k.x, k.y + 0.5, k.z, 10); }
  if (ev.lap !== undefined && !me.finished) {
    const tms = R.time * 1000;
    if (ev.lap >= 1) {
      const lt = tms - me.lapStart; if (!me.bestLap || lt < me.bestLap) me.bestLap = lt; $('h-best').textContent = 'BEST ' + fmt(me.bestLap);
      R.lapTimes.push(Math.round(lt));
      // 내 기록과 비교 (누적 시간 차이)
      if (R.rec && R.rec.laps && R.rec.laps.length >= ev.lap) { const ref = R.rec.laps.slice(0, ev.lap).reduce((a, b) => a + b, 0), d = tms - ref; setTimeout(() => race === R && flashSub(fmtGap(d), d < 0 ? 'inst' : 'warn'), 50); }
    }
    me.lapStart = tms;
    if (ev.lap >= R.laps) {
      me.finished = true; me.finishTime = Math.round(tms); k.finished = true;
      const rank = R.karts.filter(e => e.finished).length;
      showMsg('FINISH!', 'go', 3); sfx.finish(); setText('h-time', fmt(me.finishTime)); R.fx.confetti(k.x, k.y, k.z);
      if (R.online) net.send({ t: 'fin', time: me.finishTime });
      else if (!R.rec || me.finishTime < R.rec.total) {   // 신기록: 기록과 고스트 저장
        R.newRec = true;
        records[recKey(R.cfg)] = { total: me.finishTime, laps: R.lapTimes, bestLap: Math.round(me.bestLap || 0), at: Date.now() };
        store.set('td_rec', records); store.set('td_ghost_' + recKey(R.cfg), R.frames);
        setTimeout(() => race === R && flashSub(R.rec ? `신기록! ${fmtGap(me.finishTime - R.rec.total)}` : '첫 기록!', 'end'), 1300);
      }
      else if (!R.endAt) R.endAt = performance.now() + (R.karts.length > 1 ? 10000 : 1500);
    } else if (ev.lap >= 1) { showMsg(ev.lap === R.laps - 1 ? 'FINAL LAP' : `LAP ${ev.lap + 1}`, '', 1.4); sfx.lap(); if (ev.lap === R.laps - 1) music.play(R.T.def.theme + '_final', 0.5); }
  }
}
function botLap(R, e) {
  if (e.k.ev.lap >= R.laps) {
    e.finished = true; e.finishTime = Math.round(R.time * 1000); e.k.finished = true;
    if (!R.endAt) R.endAt = performance.now() + 10000;
  }
}

// ---------------- 메인 루프 ----------------
let last = performance.now();
let frames = 0;
function frame(now) {
  requestAnimationFrame(frame); frames++;
  const dt = Math.min(window.__tdMaxDt || 0.05, (now - last) / 1000); last = now;   // __tdMaxDt: 느린 환경 테스트용
  if (race) { updateRace(dt, now); if (race) { if (window.__tdCam) { const c = window.__tdCam; camera.position.set(c[0], c[1], c[2]); camera.lookAt(c[3], c[4], c[5]); } renderer.render(scene, camera); } else renderMenu(dt, now); }   // __tdCam: 테스트용 고정 카메라
  else renderMenu(dt, now);
}
// ---------------- 시상대 (결과 화면 뒤 3D) ----------------
let podium = null;
function buildPodium(top) {
  if (podium) { menuScene.remove(podium.group); podium.dispose(); podium = null; }
  if (!top.length) return;
  const group = new THREE.Group(), disp = [], karts = [];
  const box = new THREE.BoxGeometry(1, 1, 1); disp.push(box);
  const spots = { 1: [0, 1.5], 2: [-2.7, 1.0], 3: [2.7, 0.65] }, cols = { 1: '#ffd21e', 2: '#cfd6e6', 3: '#e09a5a' };
  for (const r of top) {
    const [x, h] = spots[r.rank] || [0, 0.4];
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128; const c = cv.getContext('2d');
    c.fillStyle = cols[r.rank]; c.fillRect(0, 0, 128, 128); c.fillStyle = '#14161f'; c.font = '900 88px "Black Han Sans", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(r.rank), 64, 70);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; disp.push(tex);
    const side = new THREE.MeshLambertMaterial({ color: cols[r.rank] }), front = new THREE.MeshLambertMaterial({ map: tex }); disp.push(side, front);
    const b = new THREE.Mesh(box, [side, side, side, side, front, side]); b.scale.set(2.5, h, 2.4); b.position.set(x, h / 2 - 0.36, 0); group.add(b);
    const km = makeKart(r.char, r.color, r.kart); km.group.position.set(x, h - 0.36, 0); km.group.rotation.y = -x * 0.08;
    km.group.add(makeTag(r.name + (r.me ? ' (나)' : ''), r.me ? '#ffd21e' : '#ffffff'));
    group.add(km.group); karts.push({ km, r, base: h - 0.36 });
  }
  // 꽃가루
  const cg = new THREE.PlaneGeometry(0.12, 0.2); disp.push(cg);
  const cm = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }); disp.push(cm);
  const NC = 160, conf = new THREE.InstancedMesh(cg, cm, NC), C = new THREE.Color(), parts = [];
  const pal = ['#ff4d42', '#ffd21e', '#29b6ff', '#ffffff', '#35c15a', '#ff6fb1'];
  for (let i = 0; i < NC; i++) { conf.setColorAt(i, C.set(pal[i % pal.length])); parts.push({ x: (Math.random() - 0.5) * 12, y: Math.random() * 9, z: (Math.random() - 0.5) * 5, v: 0.8 + Math.random() * 1.4, r: Math.random() * 6, w: 2 + Math.random() * 4 }); }
  group.add(conf);
  menuScene.add(group);
  const o = new THREE.Object3D();
  podium = {
    group, karts,
    update(t, dt) {
      for (const { km, r, base } of karts) { km.group.position.y = base + (r.rank === 1 ? Math.abs(Math.sin(t * 3.2)) * 0.25 : Math.abs(Math.sin(t * 2.4 + r.rank)) * 0.08); for (const w of km.wheels || []) w.rotation.x = t * 3; }
      for (let i = 0; i < NC; i++) { const p = parts[i]; p.y -= p.v * dt; p.r += p.w * dt; if (p.y < -0.4) { p.y = 8 + Math.random() * 2; p.x = (Math.random() - 0.5) * 12; } o.position.set(p.x + Math.sin(p.r) * 0.3, p.y, p.z); o.rotation.set(p.r, p.r * 0.7, 0); o.updateMatrix(); conf.setMatrixAt(i, o.matrix); }
      conf.instanceMatrix.needsUpdate = true;
    },
    dispose() { for (const d of disp) d.dispose(); },
  };
}

function renderMenu(dt, now) {
  const onPodium = screen === 'results' && podium;
  if (menuKart) menuKart.group.visible = !onPodium;
  if (podium) podium.group.visible = !!onPodium;
  if (onPodium) {
    podium.update(now / 1000, Math.min(dt, 0.05));
    const portrait = camera.aspect < 1;
    camera.fov = portrait ? 60 : 40; camera.updateProjectionMatrix();
    if (portrait) { camera.position.set(0, 5, 17); camera.lookAt(0, -2.4, 0); }
    else { camera.position.set(2.4, 4.2, 15.5); camera.lookAt(5.4, 1.0, 0); }   // 시상대를 화면 왼쪽에
    renderer.render(menuScene, camera); return;
  }
  if (menuKart) { menuKart.group.rotation.y = now / 1000 * 0.6; for (const w of menuKart.wheels) w.rotation.x = now / 300; }
  const portrait = camera.aspect < 1;
  camera.fov = portrait ? 52 : 38; camera.updateProjectionMatrix();
  if (portrait) { camera.position.set(0, 3.2, 10); camera.lookAt(0, -2.6, 0); }
  else { camera.position.set(-0.6, 2.2, 8.0); camera.lookAt(1.75, 0.75, 0); }   // 카트를 화면 왼쪽에
  renderer.render(menuScene, camera);
}

// ---------------- 버튼 연결 ----------------
function buildMenu() {
  const nm = $('name'); nm.value = profile.name;
  nm.addEventListener('input', () => { profile.name = nm.value.replace(/[<>]/g, '').trim().slice(0, 10) || '라이더'; saveProfile(); });
  nm.addEventListener('keydown', e => { if (e.key === 'Enter') nm.blur(); });
  const ce = $('chars'), co = $('colors'), ke = $('karts');
  KARTS.forEach((k, i) => { const b = document.createElement('button'); b.className = 'chip'; b.textContent = k.name; b.onclick = () => { sfx.click(); profile.kart = i; saveProfile(); paint(); refreshMenuKart(); }; ke.appendChild(b); });
  CHARS.forEach((c, i) => { const b = document.createElement('button'); b.className = 'chip'; b.textContent = c.name; b.title = c.kind; b.onclick = () => { sfx.click(); profile.char = i; saveProfile(); paint(); refreshMenuKart(); }; ce.appendChild(b); });
  COLORS.forEach((c, i) => { const b = document.createElement('button'); b.className = 'dot'; b.style.background = c.hex; b.title = c.name; b.onclick = () => { sfx.click(); profile.color = i; saveProfile(); paint(); refreshMenuKart(); }; co.appendChild(b); });
  function paint() { [...ce.children].forEach((b, i) => b.classList.toggle('on', i === profile.char)); [...co.children].forEach((b, i) => b.classList.toggle('on', i === profile.color)); [...ke.children].forEach((b, i) => b.classList.toggle('on', i === (profile.kart | 0))); $('colorlbl').textContent = (profile.kart | 0) === 0 ? '카트 색' : '스카프 색'; }
  paint();
}
const soloCfg = Object.assign({ track: 'village', mode: 'speed', laps: 3, rivals: 7 }, store.get('td_solo', {}));
if (![1, 2, 3].includes(soloCfg.laps)) soloCfg.laps = 3;   // 5바퀴를 뺀 뒤 저장값 정리
function init() {
  buildMenu();
  const soloSetup = makeSetup($('solo-setup'), soloCfg, () => store.set('td_solo', soloCfg));
  soloSetup.extra.append($('solo-rivals-lbl'), $('solo-rivals'), $('b-solo-go'));
  const paintBgm = () => { $('b-bgm').textContent = music.on ? '음악 켜짐' : '음악 꺼짐'; };
  $('b-bgm').onclick = () => { music.setOn(!music.on); sfx.click(); paintBgm(); }; paintBgm();
  roomSetup = makeSetup($('room-setup'), roomCfg, c => net.send({ t: 'cfg', track: c.track, mode: c.mode, laps: c.laps }));
  const rv = $('solo-rivals');
  const paintR = () => rv.querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.v === soloCfg.rivals));
  rv.querySelectorAll('button').forEach(b => b.onclick = () => { sfx.click(); soloCfg.rivals = +b.dataset.v; store.set('td_solo', soloCfg); paintR(); }); paintR();

  document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => { sfx.click(); show('menu'); });
  $('b-solo').onclick = () => { sfx.click(); show('solo'); };
  $('b-help').onclick = () => { sfx.click(); show('help'); };
  const paintHq = () => { $('b-hq').textContent = HQ ? '그림자 켜짐' : '그림자 꺼짐'; };
  $('b-hq').onclick = () => { sfx.click(); HQ = !HQ; store.set('td_hq', HQ); paintHq(); toast(HQ ? '그림자를 켰어요. 느리면 다시 꺼 주세요.' : '그림자를 껐어요. 더 가볍게 돌아가요.'); };
  paintHq();
  $('b-solo-go').onclick = () => startRace({ ...soloCfg, online: false });
  $('b-online').onclick = async () => {
    sfx.click(); $('b-online').disabled = true;
    try { await net.connect(); show('online'); net.send({ t: 'list' }); }
    catch (e) { toast('서버에 연결하지 못했어요. 잠시 뒤 다시 해 보세요.'); }
    $('b-online').disabled = false;
  };
  $('b-refresh').onclick = () => { sfx.click(); net.send({ t: 'list' }); };
  $('b-create').onclick = () => { sfx.click(); net.send({ t: 'create' }); };
  $('b-quick').onclick = () => { sfx.click(); net.send({ t: 'quick' }); };
  const joinCode = () => { const c = $('code').value.trim().toUpperCase(); if (c.length !== 4) return toast('방 코드 4글자를 넣어 주세요.'); net.send({ t: 'join', code: c }); $('code').blur(); };
  $('b-join').onclick = () => { sfx.click(); joinCode(); };
  $('code').addEventListener('keydown', e => { if (e.key === 'Enter') joinCode(); });
  $('b-leave').onclick = () => { sfx.click(); net.send({ t: 'leave' }); net.room = null; show('online'); };
  $('b-share').onclick = async () => {
    const code = net.room && net.room.code; if (!code) return;
    const text = `터보 드리프터 같이 하자! 방 코드: ${code}\n${location.origin}`;
    try { if (navigator.share && usingTouch) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); toast('방 코드와 주소를 복사했어요.'); } }
    catch (e) { toast('방 코드: ' + code); }
  };
  $('b-ready').onclick = () => { sfx.click(); const me = net.room && net.room.players.find(p => p.id === net.id); net.send({ t: 'ready', v: !(me && me.ready) }); };
  $('b-start').onclick = () => { sfx.click(); net.send({ t: 'start' }); };
  $('b-pause').onclick = () => togglePause();
  $('b-reset').onclick = () => resetKart();
  $('b-resume').onclick = () => togglePause();
  $('b-restart').onclick = () => { const cfg = race.cfg; $('pause').classList.add('hidden'); startRace(cfg); };
  $('b-mute').onclick = () => { sfx.setMuted(!sfx.muted); $('b-mute').textContent = sfx.muted ? '소리 켜기' : '소리 끄기'; };
  $('b-music').onclick = () => { music.setOn(!music.on); $('b-music').textContent = music.on ? '음악 끄기' : '음악 켜기'; if (paused) music.duck(0.35); };
  $('b-quit').onclick = () => {
    const online = race && race.online; $('pause').classList.add('hidden'); endRace(); music.play('menu', 1);
    if (online) { net.send({ t: 'leave' }); net.room = null; show('online'); net.send({ t: 'list' }); } else show('solo');
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden && race && !race.online && !paused && !race.done) togglePause(); });
}

(async function boot() {
  await loadKartAsset(); preloadLandmarks();
  init(); refreshMenuKart(); show('menu'); music.play('menu');
  // 새로고침·끊김 뒤: 20초 안이면 있던 방(또는 경기)으로 되돌아간다
  try { const tk = sessionStorage.getItem('td_tok'); if (tk) net.connect(tk).then(ok => { if (ok) toast('있던 방으로 돌아왔어요.'); }).catch(() => {}); } catch (e) {}
  $('loading').classList.add('hidden');
  requestAnimationFrame(frame);
  window.__td = { get frames() { return frames; }, info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles }), get race() { return race; }, net, startRace, key, tap, profile }; // 테스트용
})();

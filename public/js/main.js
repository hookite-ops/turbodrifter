// 터보 드리프터 — 게임 본체 (메뉴, 레이스, HUD, 입력, 온라인)
import * as THREE from '../lib/three.bundle.js';
import { TRACKS, buildTrack, gridSlot, pointAt } from './tracks.js';
import { C, KMH, createKart, placeKart, stepKart, startBoost, pushApart, createBot, botInput } from './physics.js';
import { buildWorld, preloadLandmarks } from './world.js';
import { loadKartAsset, makeKart, poseKart, makeTag, CHARS, COLORS, KARTS } from './kartmodel.js';
import { makeFx } from './fx.js';
import { sfx } from './audio.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const fmt = ms => { if (ms == null) return '리타이어'; const m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60, c = Math.floor(ms / 10) % 100; return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`; };
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };

// ---------------- 렌더러 ----------------
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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

// ---------------- 프로필 ----------------
const profile = store.get('td_profile', { name: '', char: 0, color: 0 });
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
  menuScene.background = new THREE.Color('#2f8fff');
  const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 16, 8), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying float h; void main(){ vec3 a = vec3(0.07,0.12,0.36); vec3 b = vec3(0.18,0.56,1.0); vec3 c = vec3(0.75,0.93,1.0); float t = clamp(h*1.4+0.25,0.0,1.0); gl_FragColor = vec4(mix(c, mix(b,a,smoothstep(0.3,1.0,t)), smoothstep(0.0,0.5,t)),1.0);\n#include <colorspace_fragment>\n }',
  }));
  menuScene.add(sky);
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) { x.fillStyle = (a + b) % 2 ? '#22306b' : '#f4f1e6'; x.fillRect(a * 32, b * 32, 32, 32); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.5, 0.4, 40), [new THREE.MeshLambertMaterial({ color: '#ffd23c' }), new THREE.MeshLambertMaterial({ map: tex }), new THREE.MeshLambertMaterial({ color: '#c98f00' })]);
  disc.position.y = -0.2; menuScene.add(disc);
  menuScene.add(new THREE.HemisphereLight('#ffffff', '#6aa0ff', 1.9));
  const d = new THREE.DirectionalLight('#ffffff', 1.8); d.position.set(2, 4, 3); menuScene.add(d);
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
    case 'ArrowLeft': case 'KeyA': key.left = true; break;
    case 'ArrowRight': case 'KeyD': key.right = true; break;
    case 'ArrowUp': case 'KeyW': key.accel = true; tap.accel = true; break;
    case 'ArrowDown': case 'KeyS': key.brake = true; break;
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
    case 'ArrowLeft': case 'KeyA': key.left = false; break;
    case 'ArrowRight': case 'KeyD': key.right = false; break;
    case 'ArrowUp': case 'KeyW': key.accel = false; break;
    case 'ArrowDown': case 'KeyS': key.brake = false; break;
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
  const [sx, sy] = P.map(T.x[0], T.z[0]); c.fillStyle = '#ff4d42'; c.beginPath(); c.arc(sx, sy, lw * 0.9, 0, 7); c.fill();
  return P;
}
const THEME_BG = { village: '#4faa3c', desert: '#d9a658', ice: '#a9d8f2', city: '#2a2152' };

// ---------------- 경기 설정 UI (방·혼자 공용) ----------------
function makeSetup(el, cfg, onChange) {
  el.className = 'setup';
  el.innerHTML = `<div class="lbl">트랙</div><div class="tracks"></div><div class="desc"></div>
    <div class="lbl">모드</div><div class="seg" data-k="mode"><button data-v="speed">스피드전</button><button data-v="infinite">무한 부스터전</button></div>
    <div class="lbl">바퀴 수</div><div class="seg" data-k="laps"><button data-v="1">1바퀴</button><button data-v="2">2바퀴</button><button data-v="3">3바퀴</button><button data-v="5">5바퀴</button></div>`;
  const tr = el.querySelector('.tracks');
  for (const d of TRACKS) {
    const b = document.createElement('button'); b.className = 'tcard'; b.dataset.id = d.id;
    b.innerHTML = `<canvas width="200" height="160"></canvas><b>${d.name}</b><i>${d.level}</i>`;
    tr.appendChild(b); drawTrack(b.querySelector('canvas'), getTrack(d.id), 8, THEME_BG[d.theme]);
    b.onclick = () => { sfx.click(); cfg.track = d.id; cfg.laps = d.laps; onChange(cfg); paint(); };
  }
  el.querySelectorAll('.seg button').forEach(b => b.onclick = () => { sfx.click(); const k = b.parentElement.dataset.k; cfg[k] = k === 'laps' ? +b.dataset.v : b.dataset.v; onChange(cfg); paint(); });
  function paint() {
    tr.querySelectorAll('.tcard').forEach(b => b.classList.toggle('on', b.dataset.id === cfg.track));
    el.querySelectorAll('.seg button').forEach(b => b.classList.toggle('on', String(cfg[b.parentElement.dataset.k]) === b.dataset.v));
    const d = TRACKS.find(t => t.id === cfg.track); el.querySelector('.desc').textContent = d ? d.desc : '';
  }
  paint();
  return { paint, lock(v) { el.classList.toggle('locked', v); } };
}

// ---------------- 온라인 ----------------
const net = {
  ws: null, id: 0, connected: false, offset: 0, room: null, _samples: [],
  now() { return Date.now() + this.offset; },
  send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); },
  connect() {
    if (this.connected) return Promise.resolve();
    return new Promise((res, rej) => {
      const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
      this.ws = ws; let done = false;
      const fail = () => { if (!done) { done = true; rej(new Error('연결 실패')); } };
      ws.onerror = fail;
      ws.onclose = () => { const was = this.connected; this.connected = false; this.room = null; fail(); if (was) onDisconnected(); };
      ws.onmessage = ev => {
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.t === 'welcome') {
          this.id = m.id; this.connected = true; this._samples = [];
          this.send({ t: 'me', name: profile.name, char: profile.char, color: profile.color, kart: profile.kart | 0 });
          for (let i = 0; i < 5; i++) setTimeout(() => this.send({ t: 'ping', c: Date.now() }), i * 150);
          if (!done) { done = true; res(); }
        } else if (m.t === 'pong') {
          const rtt = Date.now() - m.c; this._samples.push({ rtt, off: m.s - (m.c + rtt / 2) });
          this._samples.sort((a, b) => a.rtt - b.rtt); this.offset = this._samples[0].off;
        } else onNet(m);
      };
    });
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
      const st = p.id === r.host ? '<span class="st host">방장</span>' : p.ready ? '<span class="st ok">준비</span>' : '<span class="st">대기</span>';
      d.innerHTML = `<span class="sw" style="background:${COLORS[p.color % COLORS.length].hex}"></span><span class="nm"></span>${st}`;
      d.querySelector('.nm').textContent = `${p.name}${p.id === net.id ? ' (나)' : ''}`;
    }
    pl.appendChild(d);
  }
  const me = r.players.find(p => p.id === net.id) || {};
  $('b-start').classList.toggle('hidden', !host); $('b-ready').classList.toggle('hidden', host);
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
    case 'room': net.room = m.room; if (!race && screen !== 'results') show('room'); renderRoom(); break;
    case 'err': toast(m.m); break;
    case 'go': net.room = m.room; startRace({ track: m.track, mode: m.mode, laps: m.laps, online: true, slots: m.slots, startAt: m.startAt, players: m.room.players }); break;
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
  const e = { id: o.id, name: o.name, me: !!o.me, bot: o.bot || null, remote: !!o.remote, k: createKart(), model, fx: {}, finished: false, finishTime: 0, char: o.char, color: o.color, net: null, vis: null, lapStart: 0, bestLap: 0, inp: null };
  placeKart(e.k, R.T, gridSlot(R.T, o.slot));
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
  const world = buildWorld(T);
  while (scene.children.length) scene.remove(scene.children[0]);
  scene.add(world.group); scene.fog = world.fog; scene.background = new THREE.Color(world.theme.hor);
  const R = race = {
    cfg, T, world, scene, fx: makeFx(scene), rule: { infinite: cfg.mode === 'infinite' }, laps: cfg.laps, online: !!cfg.online,
    karts: [], byId: new Map(), me: null, phase: 'countdown', startPerf: 0, time: 0, acc: 0, endAt: 0, firstFin: false,
    lastCount: 9, startTap: -1e9, startUsed: false, sendT: 0, hudT: 0, camA: 0, camY: 0, shake: 0, msgT: 0, subT: 0, resetCd: 0, order: [], mini: null, done: false,
  };
  if (cfg.online) {
    R.startPerf = performance.now() + (cfg.startAt - net.now());
    for (const p of cfg.players) addKart(R, { id: p.id, name: p.name, char: p.char, color: p.color, kart: p.kart, slot: cfg.slots[p.id] ?? 0, me: p.id === net.id, remote: p.id !== net.id });
  } else {
    R.startPerf = performance.now() + 4600;
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
  R.autoBot = createBot(0.7);
  // HUD 준비
  $('h-laps').textContent = R.laps; $('h-best').textContent = ''; $('h-of').textContent = '/' + R.karts.length;
  R.miniBase = document.createElement('canvas'); R.miniBase.width = R.miniBase.height = 220; R.miniMap = drawTrack(R.miniBase, T, 9);
  hideMsg(); setSub(''); $('h-tip').classList.add('hidden');
  for (const s of SCREENS) $(s).classList.add('hidden'); $('ver').classList.add('hidden');
  $('hud').classList.remove('hidden'); $('touch').classList.remove('hidden');
  $('b-restart').classList.toggle('hidden', R.online);
  paused = false; screen = 'race';
  document.body.classList.add('racing'); splitOn = true; resize();
  sfx.startRace();
  if (usingTouch) { // 전체 화면 + 가로 고정 시도 (안 되면 그냥 진행)
    try { const p = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen({ navigationUI: 'hide' }); if (p && p.then) p.then(() => { try { screen_.orientation.lock('landscape').catch(() => {}); } catch (e) {} }).catch(() => {}); } catch (e) {}
    showTip('방향 + 드리프트 → 게이지가 차면 부스터!', 4.5);
  }
}
const screen_ = window.screen;

function endRace() {
  if (!race) return;
  const R = race; race = null;
  sfx.stopRace();
  R.fx.dispose(); scene.remove(R.world.group); R.world.dispose();
  for (const k of R.karts) scene.remove(k.model.group);
  $('hud').classList.add('hidden'); $('touch').classList.add('hidden'); $('lines').style.opacity = 0;
  document.body.classList.remove('racing'); splitOn = false; resize();
}

function finishRace(results) {
  const R = race; if (!R || R.done) return; R.done = true;
  const list = $('res-list'); list.innerHTML = '';
  for (const r of results) {
    const d = document.createElement('div'); d.className = `res r${r.rank}${r.me ? ' me' : ''}`;
    d.innerHTML = `<span class="rk">${r.rank}위</span><span class="nm"></span><span class="tm">${fmt(r.time)}</span>`;
    d.querySelector('.nm').textContent = r.name; list.appendChild(d);
  }
  const mine = results.find(r => r.me);
  $('res-title').textContent = mine ? (mine.time == null ? '리타이어…' : `${mine.rank}위로 완주!`) : '경기 결과';
  const wasOnline = R.online, cfg = R.cfg;
  setTimeout(() => {
    endRace(); show('results');
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
  k.x = p.x; k.z = p.z; k.y = p.y; k.h = k.mv = p.h; k.speed = 0; k.drifting = false; k.boostT = 0; k.instT = 0;
  R.resetCd = 1.5; sfx.click();
}
function togglePause() {
  if (!race || race.done) return;
  paused = !paused; $('pause').classList.toggle('hidden', !paused);
  $('b-mute').textContent = sfx.muted ? '소리 켜기' : '소리 끄기';
  if (paused && !race.online) race.pauseAt = performance.now();
  else if (!paused && !race.online && race.pauseAt) { const d = performance.now() - race.pauseAt; race.startPerf += d; if (race.endAt) race.endAt += d; race.pauseAt = 0; }
  if (paused) sfx.drive(0, false, 0);
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
function updateRace(dt, now) {
  const R = race, T = R.T, me = R.me, k = me.k;
  const simulate = !(paused && !R.online);
  const t = (now - R.startPerf) / 1000; R.time = t;

  // ----- 카운트다운 -----
  if (R.phase === 'countdown') {
    const c = Math.ceil(-t);
    if (tap.accel || tap.boost) R.startTap = now;
    if (c !== R.lastCount && c <= 3 && c >= 1) { R.lastCount = c; showMsg(String(c), '', 0.9); sfx.beep(false); }
    if (t >= 0) {
      R.phase = 'race'; showMsg('GO!', 'go', 1.0); sfx.beep(true); $('h-tip').classList.add('hidden');
      for (const e of R.karts) e.lapStart = 0;
      if (now - R.startTap < 160) { startBoost(k); R.startUsed = true; sfx.boost(); setTimeout(() => race === R && flashSub('출발 부스터!', 'inst'), 0); }
      for (const e of R.karts) if (e.bot && Math.random() < e.bot.skill * 0.7) startBoost(e.k);
    }
    tap.accel = tap.boost = tap.drift = false;
  }

  // ----- 물리 (고정 간격) -----
  if (simulate && R.phase !== 'countdown') {
    R.acc += dt; let first = true;
    while (R.acc >= H) {
      R.acc -= H;
      // 내 카트
      let inp;
      if (me.finished) inp = botInput(R.autoBot, k, T, H);
      else {
        const steer = usingTouch ? -touchSteer.dir : (key.left ? 1 : 0) - (key.right ? 1 : 0);
        inp = { steer, accel: usingTouch ? !key.brake : key.accel, brake: key.brake, drift: key.drift, driftTap: first && tap.drift, boostTap: first && tap.boost, accelTap: first && tap.accel };
        if (first && !R.startUsed && t < 0.36 && (tap.accel || tap.boost)) { startBoost(k); R.startUsed = true; inp.boostTap = false; sfx.boost(); flashSub('출발 부스터!', 'inst'); }
      }
      stepKart(k, inp, H, T, R.rule);
      handleEvents(R, me, k.ev);
      for (const e of R.karts) {
        if (e.bot && !e.finished) { stepKart(e.k, botInput(e.bot, e.k, T, H), H, T, R.rule); if (e.k.ev.lap !== undefined) botLap(R, e); }
        else if (e.bot) stepKart(e.k, botInput(e.bot, e.k, T, H), H, T, R.rule);
      }
      // 카트끼리 밀기
      for (const a of R.karts) {
        if (a.remote) continue;
        for (const b of R.karts) {
          if (a === b) continue;
          const bx = b.remote ? (b.vis ? b.vis.x : b.k.x) : b.k.x, bz = b.remote ? (b.vis ? b.vis.z : b.k.z) : b.k.z;
          const bs = b.remote && b.net ? b.net.speed : b.k.speed, bm = b.remote && b.net ? b.net.mv : b.k.mv, by = b.remote && b.vis ? b.vis.y : b.k.y;
          const hit = pushApart(a.k, bx, bz, by, Math.sin(bm) * bs, Math.cos(bm) * bs);
          if (hit > 4 && a.me && first) { sfx.hit(hit * 0.5); R.shake = 0.15; }
        }
      }
      first = false;
    }
    if (!first) tap.accel = tap.boost = tap.drift = false;
  } else if (R.phase !== 'countdown') tap.accel = tap.boost = tap.drift = false;
  if (R.resetCd > 0) R.resetCd -= dt;

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
      const q = e.k; s = { x: q.x, y: q.y, z: q.z, h: q.h, speed: q.speed, steer: q.steer, slip: q.slip, drifting: q.drifting, boost: q.boostT > 0 || q.padT > 0 ? 2 : q.instT > 0 ? 1 : 0, slope: q._loc.slope || 0 };
    }
    poseKart(e.model, s, dt, tt);
    if (simulate) R.fx.kart(e.fx, s, dt);
  }
  R.fx.update(simulate ? dt : 0, viewH, camera.fov);
  R.world.update(tt);

  // ----- 카메라 -----
  const sp01 = clamp(k.speed / C.boostSpeed, 0, 1), boosting = k.boostT > 0 || k.padT > 0;
  const camTarget = k.h - k.slip * 0.55;
  R.camA += wrap(camTarget - R.camA) * (1 - Math.exp(-(R.phase === 'countdown' ? 3 : 7.5) * dt));
  R.camY += (k.y - R.camY) * (1 - Math.exp(-8 * dt));
  const back = 6.4 + sp01 * 1.4 + (boosting ? 1.3 : 0), ch = 3.0 + sp01 * 0.35;
  if (R.shake > 0) R.shake -= dt;
  const shx = R.shake > 0 ? (Math.random() - 0.5) * 0.35 : boosting ? (Math.random() - 0.5) * 0.05 : 0;
  camera.position.set(k.x - Math.sin(R.camA) * back + shx, R.camY + ch + (R.shake > 0 ? (Math.random() - 0.5) * 0.25 : 0), k.z - Math.cos(R.camA) * back);
  camera.lookAt(k.x + Math.sin(R.camA) * 5, R.camY + 0.95, k.z + Math.cos(R.camA) * 5);
  const fovT = baseFov + sp01 * 9 + (boosting ? 13 : k.instT > 0 ? 6 : 0);
  camera.fov += (Math.min(fovT, 112) - camera.fov) * (1 - Math.exp(-6 * dt)); camera.updateProjectionMatrix();
  $('lines').style.opacity = boosting ? 0.75 : k.instT > 0 ? 0.4 : 0;

  // ----- 소리 -----
  if (simulate) sfx.drive(clamp(Math.abs(k.speed) / C.boostSpeed, 0, 1), k.drifting, boosting ? 2 : k.instT > 0 ? 1 : 0);

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
  setText('h-speed', String(Math.round(Math.abs(k.speed) * KMH)));
  $('h-speedbox').classList.toggle('boost', boosting);
  $('bar-i').style.width = (clamp(k.gauge, 0, 1) * 100).toFixed(1) + '%';
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
    const fit = clamp(Math.floor((VH / u - (land ? 35 : 97)) / 2.95), 3, 8);
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

function handleEvents(R, me, ev) {
  const k = me.k;
  if (ev.boost && !ev.start) sfx.boost();
  if (ev.inst) { sfx.inst(); flashSub('순간 부스터!', 'inst'); }
  if (ev.charged) sfx.charged();
  if (ev.pad) sfx.boost();
  if (ev.hit) { sfx.hit(ev.hit); R.shake = 0.18; R.fx.burst(k.x, k.y, k.z, 10); }
  if (ev.lap !== undefined && !me.finished) {
    const tms = R.time * 1000;
    if (ev.lap >= 1) { const lt = tms - me.lapStart; if (!me.bestLap || lt < me.bestLap) me.bestLap = lt; $('h-best').textContent = 'BEST ' + fmt(me.bestLap); }
    me.lapStart = tms;
    if (ev.lap >= R.laps) {
      me.finished = true; me.finishTime = Math.round(tms); k.finished = true;
      const rank = R.karts.filter(e => e.finished).length;
      showMsg('FINISH!', 'go', 3); sfx.finish(); setText('h-time', fmt(me.finishTime));
      if (R.online) net.send({ t: 'fin', time: me.finishTime });
      else if (!R.endAt) R.endAt = performance.now() + (R.karts.length > 1 ? 10000 : 1500);
    } else if (ev.lap >= 1) { showMsg(ev.lap === R.laps - 1 ? 'FINAL LAP' : `LAP ${ev.lap + 1}`, '', 1.4); sfx.lap(); }
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
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (race) { updateRace(dt, now); if (race) renderer.render(scene, camera); else renderMenu(dt, now); }
  else renderMenu(dt, now);
}
function renderMenu(dt, now) {
  if (menuKart) { menuKart.group.rotation.y = now / 1000 * 0.6; for (const w of menuKart.wheels) w.rotation.x = now / 300; }
  const portrait = camera.aspect < 1;
  camera.fov = portrait ? 52 : 38; camera.updateProjectionMatrix();
  if (portrait) { camera.position.set(0, 3.4, 10); camera.lookAt(0, -1.9, 0); }
  else { camera.position.set(0, 2.5, 10.5); camera.lookAt(0.15, 0.55, 0); }
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
function init() {
  buildMenu();
  makeSetup($('solo-setup'), soloCfg, () => store.set('td_solo', soloCfg));
  roomSetup = makeSetup($('room-setup'), roomCfg, c => net.send({ t: 'cfg', track: c.track, mode: c.mode, laps: c.laps }));
  const rv = $('solo-rivals');
  const paintR = () => rv.querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.v === soloCfg.rivals));
  rv.querySelectorAll('button').forEach(b => b.onclick = () => { sfx.click(); soloCfg.rivals = +b.dataset.v; store.set('td_solo', soloCfg); paintR(); }); paintR();

  document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => { sfx.click(); show('menu'); });
  $('b-solo').onclick = () => { sfx.click(); show('solo'); };
  $('b-help').onclick = () => { sfx.click(); show('help'); };
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
  $('b-quit').onclick = () => {
    const online = race && race.online; $('pause').classList.add('hidden'); endRace();
    if (online) { net.send({ t: 'leave' }); net.room = null; show('online'); net.send({ t: 'list' }); } else show('solo');
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden && race && !race.online && !paused && !race.done) togglePause(); });
}

(async function boot() {
  await loadKartAsset(); preloadLandmarks();
  init(); refreshMenuKart(); show('menu');
  $('loading').classList.add('hidden');
  requestAnimationFrame(frame);
  window.__td = { get race() { return race; }, net, startRace, key, tap, profile }; // 테스트용
})();

// 터보 드리프터 서버 — 정적 파일 + 온라인 방(WebSocket)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(__dirname, 'public');
const PORT = process.env.PORT || 8080;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/healthz') { res.writeHead(200); res.end('ok'); return; }
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUB, p));
  if (!file.startsWith(PUB)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(file).toLowerCase();
    const heavy = ext === '.glb' || ext === '.ogg' || ext === '.mp3' || p.startsWith('/lib/');
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': heavy ? 'public, max-age=86400' : 'no-cache' });
    res.end(buf);
  });
});

// ---------------- 방 ----------------
const TRACK_IDS = ['village', 'canyon', 'lake', 'neon'];
const MODES = ['speed', 'infinite'];
const MAX = 8;
const rooms = new Map();
let nextId = 1;

const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
const cast = (room, o, except) => { const s = JSON.stringify(o); for (const p of room.players.values()) if (p !== except && p.ws.readyState === 1) p.ws.send(s); };
const clean = (s, n) => String(s || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, n);

function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) { let c = ''; for (let i = 0; i < 4; i++) c += A[Math.floor(Math.random() * A.length)]; if (!rooms.has(c)) return c; }
}
function roomView(r) {
  return {
    code: r.code, host: r.host, track: r.track, mode: r.mode, laps: r.laps, state: r.state,
    players: [...r.players.values()].map(p => ({ id: p.id, name: p.name, char: p.char, color: p.color, kart: p.kart, ready: p.ready })),
  };
}
function roomList() {
  return [...rooms.values()].filter(r => !r.hidden).map(r => ({
    code: r.code, n: r.players.size, max: MAX, track: r.track, mode: r.mode, state: r.state,
    host: (r.players.get(r.host) || {}).name || '',
  }));
}
const pushRoom = r => cast(r, { t: 'room', room: roomView(r) });

function leave(p) {
  const r = p.room; if (!r) return;
  r.players.delete(p.id); p.room = null;
  cast(r, { t: 'left', id: p.id });
  if (r.players.size === 0) { clearTimeout(r.endTimer); clearTimeout(r.capTimer); rooms.delete(r.code); return; }
  if (r.host === p.id) r.host = r.players.keys().next().value;
  pushRoom(r);
  if (r.state === 'racing') checkOver(r);
}
function join(p, r) {
  if (p.room) leave(p);
  if (r.players.size >= MAX) return send(p.ws, { t: 'err', m: '방이 가득 찼어요.' });
  if (r.state !== 'lobby') return send(p.ws, { t: 'err', m: '이미 경기 중인 방이에요. 끝나면 들어갈 수 있어요.' });
  p.room = r; p.ready = false; r.players.set(p.id, p);
  pushRoom(r);
}
function create(p) {
  const r = { code: newCode(), host: p.id, track: 'village', mode: 'speed', laps: 3, state: 'lobby', players: new Map(), endTimer: null, capTimer: null };
  rooms.set(r.code, r); join(p, r);
}
function startRace(r) {
  r.state = 'racing'; r.startAt = Date.now() + 8600; r.firstFin = 0; r.results = [];
  const ids = [...r.players.keys()].sort(() => Math.random() - 0.5);
  const slots = {}; ids.forEach((id, i) => { slots[id] = i; });
  for (const p of r.players.values()) { p.fin = false; p.time = 0; p.prog = -1e9; p.ready = false; }
  cast(r, { t: 'go', startAt: r.startAt, slots, track: r.track, mode: r.mode, laps: r.laps, room: roomView(r) });
  clearTimeout(r.capTimer);
  r.capTimer = setTimeout(() => finishRace(r), 5500 + 6 * 60 * 1000);
}
function checkOver(r) {
  if (r.state !== 'racing') return;
  const all = [...r.players.values()];
  if (all.length && all.every(p => p.fin)) finishRace(r);
}
function finishRace(r) {
  if (r.state !== 'racing') return;
  clearTimeout(r.endTimer); clearTimeout(r.capTimer);
  const all = [...r.players.values()];
  const done = all.filter(p => p.fin).sort((a, b) => a.time - b.time);
  const dnf = all.filter(p => !p.fin).sort((a, b) => b.prog - a.prog);
  const results = [...done, ...dnf].map((p, i) => ({ id: p.id, name: p.name, char: p.char, color: p.color, time: p.fin ? p.time : null, rank: i + 1 }));
  r.state = 'lobby';
  cast(r, { t: 'over', results, room: roomView(r) });
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
wss.on('connection', ws => {
  const p = { id: nextId++, ws, name: '라이더', char: 0, color: 0, kart: 0, room: null, ready: false, alive: true, fin: false, time: 0, prog: 0 };
  ws.on('pong', () => { p.alive = true; });
  send(ws, { t: 'welcome', id: p.id, now: Date.now() });
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    const r = p.room;
    switch (m.t) {
      case 's': // 주행 상태 중계
        if (r && r.state === 'racing' && Array.isArray(m.d) && m.d.length <= 10) {
          if (typeof m.d[7] === 'number') p.prog = m.d[7];
          cast(r, { t: 's', id: p.id, d: m.d }, p);
        }
        break;
      case 'ping': send(ws, { t: 'pong', c: m.c, s: Date.now() }); break;
      case 'me':
        p.name = clean(m.name, 10) || '라이더'; p.char = (m.char | 0) & 7; p.color = (m.color | 0) & 15; p.kart = (m.kart | 0) & 3;
        if (r) pushRoom(r);
        break;
      case 'list': send(ws, { t: 'rooms', rooms: roomList() }); break;
      case 'create': create(p); break;
      case 'join': {
        const t = rooms.get(clean(m.code, 4).toUpperCase());
        if (!t) send(ws, { t: 'err', m: '그 코드의 방이 없어요.' }); else join(p, t);
        break;
      }
      case 'quick': {
        const t = [...rooms.values()].find(x => x.state === 'lobby' && x.players.size < MAX);
        if (t) join(p, t); else create(p);
        break;
      }
      case 'leave': leave(p); send(ws, { t: 'rooms', rooms: roomList() }); break;
      case 'cfg':
        if (r && r.host === p.id && r.state === 'lobby') {
          if (TRACK_IDS.includes(m.track)) r.track = m.track;
          if (MODES.includes(m.mode)) r.mode = m.mode;
          if ([1, 2, 3, 5].includes(m.laps)) r.laps = m.laps;
          pushRoom(r);
        }
        break;
      case 'ready': if (r && r.state === 'lobby') { p.ready = !!m.v; pushRoom(r); } break;
      case 'start':
        if (r && r.host === p.id && r.state === 'lobby') {
          const wait = [...r.players.values()].filter(x => x.id !== r.host && !x.ready);
          if (wait.length) send(ws, { t: 'err', m: `아직 준비 안 한 사람이 있어요: ${wait.map(x => x.name).join(', ')}` });
          else startRace(r);
        }
        break;
      case 'fin':
        if (r && r.state === 'racing' && !p.fin) {
          const t = Number(m.time);
          const least = 8000; // 말도 안 되는 기록 거르기
          if (!(t > least) || Date.now() < r.startAt + least) break;
          p.fin = true; p.time = Math.round(t);
          const rank = [...r.players.values()].filter(x => x.fin).length;
          cast(r, { t: 'fin', id: p.id, time: p.time, rank });
          if (!r.firstFin) { // 1등이 들어오면 10초 뒤 경기 종료 (원작 규칙)
            r.firstFin = Date.now();
            cast(r, { t: 'endIn', ms: 10000 });
            r.endTimer = setTimeout(() => finishRace(r), 10500);
          }
          checkOver(r);
        }
        break;
      case 'emote': if (r && typeof m.e === 'number') cast(r, { t: 'emote', id: p.id, e: m.e | 0 }, p); break;
    }
  });
  ws.on('close', () => leave(p));
  ws.on('error', () => {});
});

setInterval(() => {
  for (const ws of wss.clients) {
    // ws 객체에 p를 달지 않았으므로 ping만 보낸다 (끊긴 연결은 close로 정리됨)
    if (ws.readyState === 1) { try { ws.ping(); } catch {} }
  }
}, 25000);

server.listen(PORT, () => console.log('turbodrifter listening on ' + PORT));

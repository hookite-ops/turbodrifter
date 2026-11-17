// 터보 드리프터 서버 — 정적 파일 + 온라인 방(WebSocket)
// 방은 서버 메모리에 있으므로 Cloud Run 인스턴스는 1개로 고정해야 한다.
import http from 'http';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { TRACKS, buildTrack } from './public/js/tracks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(__dirname, 'public');
const PORT = process.env.PORT || 8080;
const T0 = Date.now();
const log = (ev, o = {}) => console.log(JSON.stringify({ ev, ...o }));

// ---------------- 정적 파일 (메모리 캐시 + gzip + ETag) ----------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};
const TEXT = new Set(['.html', '.js', '.css', '.json', '.svg', '.webmanifest']);
const fileCache = new Map();   // 경로 → {buf, gz, etag, type, heavy}
function loadFile(file, urlPath) {
  let f = fileCache.get(file);
  if (f) return f;
  let st; try { st = fs.statSync(file); } catch { return null; }
  if (!st.isFile()) return null;
  const buf = fs.readFileSync(file), ext = path.extname(file).toLowerCase();
  f = {
    buf, type: MIME[ext] || 'application/octet-stream',
    gz: TEXT.has(ext) && buf.length > 1024 ? zlib.gzipSync(buf, { level: 9 }) : null,
    etag: `"${st.size.toString(36)}-${Math.round(st.mtimeMs).toString(36)}"`,
    heavy: ext === '.glb' || ext === '.ogg' || ext === '.mp3' || urlPath.startsWith('/lib/'),
  };
  fileCache.set(file, f);
  return f;
}
const server = http.createServer((req, res) => {
  const head = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, head); res.end(); return; }
  let p;
  try { p = decodeURIComponent((req.url || '/').split('?')[0]); } catch { res.writeHead(400, head); res.end(); return; }
  if (p.length > 200) { res.writeHead(414, head); res.end(); return; }
  if (p === '/healthz') { res.writeHead(200, head); res.end('ok'); return; }
  if (p === '/statz') {
    let racing = 0, players = 0; for (const r of rooms.values()) { if (r.state === 'racing') racing++; players += r.players.size; }
    res.writeHead(200, { ...head, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ uptime: Math.round((Date.now() - T0) / 1000), conns: wss.clients.size, rooms: rooms.size, racing, players, dropped: stats.dropped, resumed: stats.resumed }));
    return;
  }
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUB, p));
  if (!file.startsWith(PUB + path.sep)) { res.writeHead(403, head); res.end(); return; }
  const f = loadFile(file, p);
  if (!f) { res.writeHead(404, head); res.end('not found'); return; }
  head['Content-Type'] = f.type; head.ETag = f.etag;
  head['Cache-Control'] = f.heavy ? 'public, max-age=86400' : 'no-cache';   // 코드·페이지는 매번 ETag로 확인 → 배포 즉시 반영
  if (req.headers['if-none-match'] === f.etag) { res.writeHead(304, head); res.end(); return; }
  let body = f.buf;
  if (f.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) { body = f.gz; head['Content-Encoding'] = 'gzip'; head.Vary = 'Accept-Encoding'; }
  head['Content-Length'] = body.length;
  res.writeHead(200, head);
  res.end(req.method === 'HEAD' ? undefined : body);
});
server.keepAliveTimeout = 65000;

// ---------------- 방 ----------------
const TRACK_LEN = {}; for (const d of TRACKS) TRACK_LEN[d.id] = buildTrack(d).length;
const TRACK_IDS = Object.keys(TRACK_LEN);
const MODES = ['speed', 'infinite'];
const MAX = 8, MAX_ROOMS = 150, MAX_CONN = 500, MAX_PER_IP = 10;
const GRACE = 20000;            // 연결이 끊겨도 이 시간 동안 자리를 지켜 준다 (재접속)
const START_DELAY = 8600;       // 트랙 소개 4초 + 카운트다운
const TOP_SPEED = 46;           // m/s. 부스터 41 + 드래프트 5 — 이보다 빠른 완주 기록은 받지 않는다
const rooms = new Map();
const sessions = new Map();     // 토큰 → 플레이어
const ipCount = new Map();
const stats = { dropped: 0, resumed: 0 };
let nextId = 1;

const send = (ws, o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
const cast = (room, o, except) => { const s = JSON.stringify(o); for (const p of room.players.values()) if (p !== except && p.ws && p.ws.readyState === 1) p.ws.send(s); };
const clean = (s, n) => String(s ?? '').replace(/[<>\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e]/g, '').trim().slice(0, n);
const num = (v, lo, hi) => typeof v === 'number' && v === v ? (v < lo ? lo : v > hi ? hi : v) : null;

function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) { let c = ''; for (let i = 0; i < 4; i++) c += A[crypto.randomInt(A.length)]; if (!rooms.has(c)) return c; }
}
function roomView(r) {
  return {
    code: r.code, host: r.host, track: r.track, mode: r.mode, laps: r.laps, state: r.state,
    players: [...r.players.values()].map(p => ({ id: p.id, name: p.name, char: p.char, color: p.color, kart: p.kart, ready: p.ready, off: !p.ws, racing: !!p.racing })),
  };
}
function roomList() {
  return [...rooms.values()].map(r => ({
    code: r.code, n: r.players.size, max: MAX, track: r.track, mode: r.mode, state: r.state,
    host: (r.players.get(r.host) || {}).name || '',
  })).sort((a, b) => (a.state === 'lobby' ? 0 : 1) - (b.state === 'lobby' ? 0 : 1) || b.n - a.n).slice(0, 40);
}
const pushRoom = r => cast(r, { t: 'room', room: roomView(r) });
const touch = r => { r.active = Date.now(); };

// 방 안에서 같은 이름이 겹치면 숫자를 붙인다
function uniqueName(r, p) {
  const taken = new Set([...r.players.values()].filter(x => x !== p).map(x => x.name));
  if (!taken.has(p.name)) return;
  const base = p.name.slice(0, 8);
  for (let i = 2; i < 10; i++) if (!taken.has(base + i)) { p.name = base + i; return; }
}
function pickHost(r) {   // 연결돼 있는 사람 중에서 방장을 고른다
  for (const p of r.players.values()) if (p.ws) return p.id;
  return r.players.keys().next().value;
}
function closeRoom(r) { clearTimeout(r.endTimer); clearTimeout(r.capTimer); rooms.delete(r.code); log('room_close', { code: r.code }); }

function leave(p) {
  const r = p.room; if (!r) return;
  r.players.delete(p.id); p.room = null; p.racing = false; p.ready = false;
  cast(r, { t: 'left', id: p.id });
  if (r.players.size === 0) return closeRoom(r);
  if (r.host === p.id) r.host = pickHost(r);
  pushRoom(r);
  if (r.state === 'racing') checkOver(r);
}
function join(p, r) {
  if (p.room === r) return;
  if (r.players.size >= MAX) return send(p.ws, { t: 'err', m: '방이 가득 찼어요.' });
  if (p.room) leave(p);
  p.room = r; p.ready = false; p.racing = false; r.players.set(p.id, p);
  uniqueName(r, p); touch(r);
  pushRoom(r);   // 경기 중인 방에 들어오면 대기실에서 기다렸다가 다음 경기에 함께 출발한다
}
function create(p) {
  if (rooms.size >= MAX_ROOMS) return send(p.ws, { t: 'err', m: '지금은 방이 너무 많아요. 열린 방에 들어가 보세요.' });
  const r = { code: newCode(), host: p.id, track: 'village', mode: 'speed', laps: 3, state: 'lobby', players: new Map(), endTimer: null, capTimer: null, active: Date.now() };
  rooms.set(r.code, r); log('room_open', { code: r.code });
  join(p, r);
}
function startRace(r) {
  r.state = 'racing'; r.startAt = Date.now() + START_DELAY; r.firstFin = 0; touch(r);
  const racers = [...r.players.values()].filter(p => p.ws);
  const ids = racers.map(p => p.id);
  for (let i = ids.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  const slots = {}; ids.forEach((id, i) => { slots[id] = i; });
  for (const p of r.players.values()) { p.fin = false; p.time = 0; p.prog = -1e9; p.ready = false; p.racing = !!p.ws; p.lastS = 0; }
  r.minTime = r.laps * TRACK_LEN[r.track] / TOP_SPEED * 1000;
  r.goMsg = { t: 'go', startAt: r.startAt, slots, track: r.track, mode: r.mode, laps: r.laps };
  cast(r, { ...r.goMsg, room: roomView(r) });
  clearTimeout(r.capTimer);
  r.capTimer = setTimeout(() => finishRace(r), START_DELAY + 6 * 60 * 1000);
  log('race_start', { code: r.code, track: r.track, mode: r.mode, laps: r.laps, n: racers.length });
}
function checkOver(r) {
  if (r.state !== 'racing') return;
  const all = [...r.players.values()].filter(p => p.racing);
  if (!all.length || all.every(p => p.fin)) finishRace(r);
}
function finishRace(r) {
  if (r.state !== 'racing') return;
  clearTimeout(r.endTimer); clearTimeout(r.capTimer);
  const all = [...r.players.values()].filter(p => p.racing);
  const done = all.filter(p => p.fin).sort((a, b) => a.time - b.time);
  const dnf = all.filter(p => !p.fin).sort((a, b) => b.prog - a.prog);
  const results = [...done, ...dnf].map((p, i) => ({ id: p.id, name: p.name, char: p.char, color: p.color, kart: p.kart, time: p.fin ? p.time : null, rank: i + 1 }));
  r.state = 'lobby'; r.goMsg = null; touch(r);
  for (const p of r.players.values()) p.racing = false;
  cast(r, { t: 'over', results, room: roomView(r) });
  log('race_end', { code: r.code, finished: done.length, dnf: dnf.length });
}

// ---------------- 연결 ----------------
const ipOf = req => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
const wss = new WebSocketServer({
  server, path: '/ws', maxPayload: 2048,
  // 다른 사이트의 페이지가 이 서버로 몰래 접속하는 것을 막는다 (브라우저가 아니면 Origin이 없다)
  verifyClient: ({ origin, req }) => { if (!origin) return true; try { return new URL(origin).host === req.headers.host; } catch { return false; } },
});

function newPlayer(ws) {
  const p = { id: nextId++, token: crypto.randomBytes(12).toString('base64url'), ws, name: '라이더', char: 0, color: 0, kart: 0, room: null, ready: false, racing: false, alive: true, fin: false, time: 0, prog: 0, lastS: 0, tok: 60, tokAt: Date.now(), bad: 0, graceT: null };
  sessions.set(p.token, p);
  return p;
}
function drop(p) {             // 연결이 끊겼을 때: 방에 있으면 잠시 자리를 지켜 준다
  p.ws = null;
  const r = p.room;
  if (!r) { sessions.delete(p.token); return; }
  if (r.host === p.id && r.state === 'lobby') { const h = pickHost(r); if (h !== p.id) r.host = h; }
  pushRoom(r);
  clearTimeout(p.graceT);
  p.graceT = setTimeout(() => { if (!p.ws) { leave(p); sessions.delete(p.token); } }, GRACE);
  if ([...r.players.values()].every(x => !x.ws)) { /* 모두 끊김: 유예 시간이 지나면 방이 닫힌다 */ }
}

wss.on('connection', (ws, req) => {
  const ip = ipOf(req), n = (ipCount.get(ip) || 0) + 1;
  if (wss.clients.size > MAX_CONN || n > MAX_PER_IP) { send(ws, { t: 'err', m: '접속이 너무 많아요. 잠시 후 다시 시도해 주세요.' }); ws.close(1013); return; }
  ipCount.set(ip, n);
  let p = newPlayer(ws);
  ws.on('pong', () => { p.alive = true; });
  send(ws, { t: 'welcome', id: p.id, token: p.token, now: Date.now() });

  ws.on('message', (raw, isBinary) => {
    if (isBinary) return;
    // 속도 제한: 초당 45개까지 (주행 상태 15개 + 여유). 넘치면 버리고, 계속 넘치면 끊는다
    const now = Date.now();
    p.tok = Math.min(60, p.tok + (now - p.tokAt) * 0.045); p.tokAt = now;
    if (p.tok < 1) { stats.dropped++; if (++p.bad > 300 && !p.kicked) { p.kicked = true; log('flood_kick', { id: p.id }); ws.close(1008); } return; }
    p.tok -= 1;
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;
    const r = p.room;
    switch (m.t) {
      case 's': { // 주행 상태 중계 — 값을 검사하고 다듬어서 보낸다
        if (!r || r.state !== 'racing' || !p.racing || !Array.isArray(m.d) || m.d.length !== 9) break;
        if (now - p.lastS < 40) break;                           // 25Hz 넘게 보내면 버림
        const d = m.d, o = [num(d[0], -5000, 5000), num(d[1], -5000, 5000), num(d[2], -100, 300), num(d[3], -1e4, 1e4), num(d[4], -1e4, 1e4), num(d[5], -20, 70), num(d[6], 0, 15), num(d[7], -1e6, 1e6), num(d[8], -1, 1)];
        if (o.includes(null)) break;
        o[6] |= 0; p.prog = o[7]; p.lastS = now;
        cast(r, { t: 's', id: p.id, d: o }, p);
        break;
      }
      case 'ping': send(ws, { t: 'pong', c: num(m.c, 0, 1e15), s: now }); break;
      case 'resume': { // 끊겼던 연결 되살리기
        const old = typeof m.token === 'string' ? sessions.get(m.token) : null;
        if (!old || old === p || (old.ws && old.ws.readyState === 1) || !old.room) { send(ws, { t: 'resumeFail' }); break; }
        clearTimeout(old.graceT); sessions.delete(p.token);
        old.ws = ws; old.alive = true; old.tok = 60; old.tokAt = now; p = old; stats.resumed++;
        const rr = p.room;
        send(ws, { t: 'resumed', id: p.id, token: p.token, now, room: roomView(rr), go: rr.state === 'racing' && p.racing ? rr.goMsg : null });
        pushRoom(rr);
        break;
      }
      case 'me':
        p.name = clean(m.name, 10) || '라이더'; p.char = (m.char | 0) & 7; p.color = (m.color | 0) & 15; p.kart = (m.kart | 0) & 1;
        if (r) { uniqueName(r, p); pushRoom(r); }
        break;
      case 'list': send(ws, { t: 'rooms', rooms: roomList() }); break;
      case 'create': create(p); break;
      case 'join': {
        const t = rooms.get(clean(m.code, 4).toUpperCase());
        if (!t) send(ws, { t: 'err', m: '그 코드의 방이 없어요.' }); else join(p, t);
        break;
      }
      case 'quick': { // 대기 중이고 사람이 가장 많은 방으로
        let best = null;
        for (const x of rooms.values()) if (x.state === 'lobby' && x.players.size < MAX && x !== r && (!best || x.players.size > best.players.size)) best = x;
        if (best) join(p, best); else if (!r) create(p);
        break;
      }
      case 'leave': leave(p); send(ws, { t: 'rooms', rooms: roomList() }); break;
      case 'cfg':
        if (r && r.host === p.id && r.state === 'lobby') {
          if (TRACK_IDS.includes(m.track)) r.track = m.track;
          if (MODES.includes(m.mode)) r.mode = m.mode;
          if ([1, 2, 3].includes(m.laps)) r.laps = m.laps;
          touch(r); pushRoom(r);
        }
        break;
      case 'ready': if (r && r.state === 'lobby') { p.ready = !!m.v; touch(r); pushRoom(r); } break;
      case 'kick': { // 방장이 대기실에서 내보내기
        if (!r || r.host !== p.id || r.state !== 'lobby') break;
        const x = r.players.get(m.id | 0);
        if (x && x !== p) { send(x.ws, { t: 'kicked' }); leave(x); if (!x.ws) sessions.delete(x.token); }
        break;
      }
      case 'start':
        if (r && r.host === p.id && r.state === 'lobby') {
          const wait = [...r.players.values()].filter(x => x.id !== r.host && x.ws && !x.ready);
          if (wait.length) send(ws, { t: 'err', m: `아직 준비 안 한 사람이 있어요: ${wait.map(x => x.name).join(', ')}` });
          else startRace(r);
        }
        break;
      case 'fin': { // 완주: 서버 시계와 트랙 길이로 기록을 확인한다
        if (!r || r.state !== 'racing' || !p.racing || p.fin) break;
        const elapsed = now - r.startAt;
        let t = Number(m.time);
        if (!(t > 0) || elapsed < r.minTime || t < r.minTime) { p.bad += 20; log('fin_reject', { id: p.id, t, elapsed: Math.round(elapsed), min: Math.round(r.minTime) }); break; }
        if (p.prog < (r.laps - 0.12) * TRACK_LEN[r.track]) { log('fin_reject_prog', { id: p.id, prog: p.prog }); break; }
        if (Math.abs(t - elapsed) > 2500) t = elapsed;         // 내 시계와 너무 다르면 서버 시계 기준
        p.fin = true; p.time = Math.round(t);
        const rank = [...r.players.values()].filter(x => x.fin).length;
        cast(r, { t: 'fin', id: p.id, time: p.time, rank });
        if (!r.firstFin) { // 1등이 들어오면 10초 뒤 경기 종료 (원작 규칙)
          r.firstFin = now;
          cast(r, { t: 'endIn', ms: 10000 });
          r.endTimer = setTimeout(() => finishRace(r), 10500);
        }
        checkOver(r);
        break;
      }
      case 'emote': if (r && typeof m.e === 'number') cast(r, { t: 'emote', id: p.id, e: (m.e | 0) & 15 }, p); break;
    }
  });
  ws.on('close', () => {
    const c = (ipCount.get(ip) || 1) - 1; if (c <= 0) ipCount.delete(ip); else ipCount.set(ip, c);
    if (p.ws === ws) drop(p);
  });
  ws.on('error', () => {});
});

// 응답 없는 연결 정리 (15초마다 ping, 한 번 놓치면 끊음) + 오래 비어 있는 대기실 닫기
setInterval(() => {
  for (const p of sessions.values()) {
    const ws = p.ws; if (!ws) continue;
    if (!p.alive) { try { ws.terminate(); } catch {} continue; }
    p.alive = false; try { ws.ping(); } catch {}
  }
  const now = Date.now();
  for (const r of rooms.values()) {
    if (r.state === 'lobby' && now - r.active > 30 * 60 * 1000) {
      for (const p of [...r.players.values()]) { send(p.ws, { t: 'kicked', m: '오래 쉬어서 방이 닫혔어요.' }); leave(p); }
    }
  }
}, 15000);

// 종료 신호(Cloud Run 재배포): 접속자에게 알리고 깔끔하게 닫는다 → 클라이언트가 새 서버로 다시 접속
let closing = false;
function shutdown(sig) {
  if (closing) return; closing = true; log('shutdown', { sig });
  for (const ws of wss.clients) { send(ws, { t: 'bye' }); try { ws.close(1001); } catch {} }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', e => log('error', { m: String(e && e.stack || e).slice(0, 500) }));

server.listen(PORT, () => log('listen', { port: PORT, tracks: TRACK_LEN }));

// 소리: 엔진·스키드·충돌은 Kenney CC0 음원, 부스터·카운트 신호음은 간단한 합성음
let ctx = null, master = null, bufs = {}, engine = null, skid = null, boostN = null, ready = false, muted = false;

async function load(name) {
  for (const ext of ['ogg', 'mp3']) {
    try {
      const r = await fetch(`assets/${name}.${ext}`); if (!r.ok) continue;
      return await ctx.decodeAudioData(await r.arrayBuffer());
    } catch (e) { /* 다음 형식 시도 */ }
  }
  return null;
}
function loop(buf, gain) {
  if (!buf) return null;
  const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
  const g = ctx.createGain(); g.gain.value = gain; s.connect(g).connect(master); s.start();
  return { s, g };
}

export const sfx = {
  async init() { // 첫 터치 때 호출
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
      const [e, s, i] = await Promise.all([load('engine'), load('skid'), load('impact')]);
      bufs = { engine: e, skid: s, impact: i };
      // 부스터용 바람 소리 (노이즈)
      const nb = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate), d = nb.getChannelData(0);
      for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
      bufs.noise = nb; ready = true;
    } catch (e) { console.warn('소리 초기화 실패', e); }
  },
  setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.8; },
  get muted() { return muted; },
  startRace() {
    if (!ready) return; this.stopRace();
    engine = loop(bufs.engine, 0.0); skid = loop(bufs.skid, 0.0);
    const s = ctx.createBufferSource(); s.buffer = bufs.noise; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.value = 0; s.connect(f).connect(g).connect(master); s.start(); boostN = { s, g, f };
  },
  stopRace() {
    for (const l of [engine, skid, boostN]) if (l) { try { l.s.stop(); } catch (e) {} }
    engine = skid = boostN = null;
  },
  drive(speed01, drifting, boost) { // 매 프레임
    if (!ready || !ctx) return; const t = ctx.currentTime;
    if (engine) { engine.s.playbackRate.setTargetAtTime(0.55 + speed01 * 1.25 + (boost ? 0.25 : 0), t, 0.06); engine.g.gain.setTargetAtTime(0.28 + speed01 * 0.22, t, 0.1); }
    if (skid) skid.g.gain.setTargetAtTime(drifting ? 0.5 : 0, t, 0.05);
    if (boostN) { boostN.g.gain.setTargetAtTime(boost === 2 ? 0.42 : boost === 1 ? 0.22 : Math.max(0, speed01 - 0.7) * 0.18, t, 0.08); boostN.f.frequency.setTargetAtTime(700 + speed01 * 900 + (boost ? 600 : 0), t, 0.1); }
  },
  hit(v = 1) {
    if (!ready || !bufs.impact) return;
    const s = ctx.createBufferSource(); s.buffer = bufs.impact; const g = ctx.createGain(); g.gain.value = Math.min(1, 0.35 + v * 0.05);
    s.connect(g).connect(master); s.start();
  },
  tone(freq, dur = 0.15, type = 'square', vol = 0.18, slide = 0) {
    if (!ready) return; const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
  },
  beep(go) { this.tone(go ? 1320 : 660, go ? 0.5 : 0.18, 'square', 0.16); },
  boost() { this.tone(180, 0.5, 'sawtooth', 0.2, 900); },
  inst() { this.tone(520, 0.18, 'triangle', 0.25, 700); },
  charged() { this.tone(880, 0.09, 'triangle', 0.22); setTimeout(() => this.tone(1320, 0.14, 'triangle', 0.22), 80); },
  click() { this.tone(700, 0.05, 'triangle', 0.15); },
  lap() { [784, 988, 1175].forEach((f, i) => setTimeout(() => this.tone(f, 0.14, 'triangle', 0.2), i * 90)); },
  finish() { [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'triangle', 0.22), i * 110)); },
};

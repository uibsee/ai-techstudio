import type { Control, Demo2D, DemoMap } from './types';

type Made = ReturnType<Demo2D['make']>;

/**
 * 소리 4 (i435 ~ i438) · 온라인 대전 5 (i439 ~ i443) 견본.
 *
 * 소리: 카드는 소리 없이 눈으로 (층마다 색 막대 악보 · 파형 · 음량 곡선 · 박자 점).
 *   크게 보기의 「▶ 소리 듣기」를 누르면 그때 AudioContext 를 만들어 코드로 합성한 짧은 반복 음악
 *   (A 단조 Am–F–C–G, 북 · 베이스 · 화음 · 멜로디)을 박자 시계(앞질러 예약)로 튼다. dispose 때 close.
 * 온라인: 진짜 서버 없이 흉내 — 「나 · 서버 · 상대」 세 줄 시퀀스 그림에 메시지 점이 지연을 두고 날아간다.
 *   (사이트 온라인 대전은 Firebase 를 쓴다 — 여기서는 원리만.)
 */

// ═════════════════════ 공용 그리기 ═════════════════════

type G = CanvasRenderingContext2D;
const FONT = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
const font = (px: number, wt = 600): string => `${wt} ${Math.max(5, px).toFixed(1)}px ${FONT}`;

function reset(g: G): void {
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.shadowBlur = 0;
  g.shadowColor = 'transparent';
  g.setLineDash([]);
  g.lineCap = 'butt';
  g.lineJoin = 'miter';
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.filter = 'none';
}

function rr(g: G, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, Math.max(0, w), Math.max(0, h), Math.max(0, Math.min(r, w / 2, h / 2)));
}

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const ease = (k: number): number => k * k * (3 - 2 * k);

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function mixHex(h1: string, h2: string, k: number): string {
  const a = parseInt(h1.slice(1), 16);
  const b = parseInt(h2.slice(1), 16);
  const c = (s: number): number => Math.round(lerp((a >> s) & 255, (b >> s) & 255, k));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

/** 짙은 바탕 — 위아래 그러데이션 + 은은한 빛 + 옅은 모눈 */
function backdrop(g: G, w: number, h: number, c1: string, c2: string, glow: string, u: number): void {
  const lg = g.createLinearGradient(0, 0, 0, h);
  lg.addColorStop(0, c1);
  lg.addColorStop(1, c2);
  g.fillStyle = lg;
  g.fillRect(0, 0, w, h);
  const rg = g.createRadialGradient(w * 0.7, h * 0.15, 0, w * 0.7, h * 0.15, Math.max(w, h) * 0.8);
  rg.addColorStop(0, glow);
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,0.025)';
  g.lineWidth = 1;
  const step = 14 * u;
  g.beginPath();
  for (let x = step; x < w; x += step) {
    g.moveTo(x, 0);
    g.lineTo(x, h);
  }
  for (let y = step; y < h; y += step) {
    g.moveTo(0, y);
    g.lineTo(w, y);
  }
  g.stroke();
}

/** 알약 글씨표 — 그린 폭을 돌려줌 */
function chip(g: G, x: number, y: number, text: string, col: string, px: number, align: 'left' | 'right' | 'center' = 'left', solid = false): number {
  g.font = font(px, 700);
  const tw = g.measureText(text).width;
  const ph = px * 1.65;
  const pw = tw + px * 1.3;
  const x0 = align === 'left' ? x : align === 'right' ? x - pw : x - pw / 2;
  rr(g, x0, y, pw, ph, ph / 2);
  g.fillStyle = solid ? col : hexA(col, 0.16);
  g.fill();
  g.strokeStyle = hexA(col, solid ? 0.9 : 0.55);
  g.lineWidth = Math.max(1, px * 0.09);
  g.stroke();
  g.fillStyle = solid ? '#0b1020' : col;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.fillText(text, x0 + px * 0.65, y + ph / 2 + px * 0.04);
  g.textBaseline = 'alphabetic';
  return pw;
}

function txt(g: G, s: string, x: number, y: number, px: number, col: string, align: CanvasTextAlign = 'left', wt = 600): void {
  g.font = font(px, wt);
  g.fillStyle = col;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillText(s, x, y);
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
}

function panel(g: G, x: number, y: number, w: number, h: number, r: number, edge = 'rgba(255,255,255,0.08)'): void {
  rr(g, x, y, w, h, r);
  const lg = g.createLinearGradient(0, y, 0, y + h);
  lg.addColorStop(0, 'rgba(255,255,255,0.055)');
  lg.addColorStop(1, 'rgba(255,255,255,0.02)');
  g.fillStyle = lg;
  g.fill();
  g.strokeStyle = edge;
  g.lineWidth = 1;
  g.stroke();
}

function glowDot(g: G, x: number, y: number, r: number, col: string, a = 1): void {
  const rg = g.createRadialGradient(x, y, 0, x, y, r * 3.2);
  rg.addColorStop(0, hexA(col, 0.55 * a));
  rg.addColorStop(1, hexA(col, 0));
  g.fillStyle = rg;
  g.beginPath();
  g.arc(x, y, r * 3.2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = hexA(col, a);
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = `rgba(255,255,255,${0.8 * a})`;
  g.beginPath();
  g.arc(x - r * 0.25, y - r * 0.25, r * 0.4, 0, Math.PI * 2);
  g.fill();
}

interface Lay {
  big: boolean;
  u: number;
  pad: number;
}
function lay(w: number, h: number): Lay {
  const big = w > 420;
  const s = Math.min(w / 280, h / 175);
  const u = s * (big ? 0.62 : 1);
  return { big, u, pad: (big ? 16 : 7) * (big ? s * 0.6 : s) };
}

// ═════════════════════ 음악 (코드 합성) ═════════════════════

const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
/** Am – F – C – G (각 마디: 베이스 뿌리음 · 화음) */
const PROG = [
  { root: 45, ch: [57, 60, 64], name: 'Am' },
  { root: 41, ch: [53, 57, 60], name: 'F' },
  { root: 48, ch: [55, 60, 64], name: 'C' },
  { root: 43, ch: [55, 59, 62], name: 'G' },
];
/** 멜로디 32칸(8분음표) — A 단조 5음 음계 */
const MEL = [69, -1, 72, -1, 76, 74, 72, -1, 69, -1, 72, 74, 72, -1, 69, -1, 67, -1, 72, -1, 76, -1, 79, 76, 74, -1, 71, -1, 67, -1, -1, -1];
const KICK = [1, 0, 0, 1, 1, 0, 0, 0];
const SNARE = [0, 0, 1, 0, 0, 0, 1, 0];
const BASSP = [0, -1, 0, 12, 0, -1, 0, 7];
const STEPS = 32;

const LAYER_NAME = ['북', '베이스', '화음', '멜로디'];
const LAYER_COL = ['#ff6b8a', '#ffb547', '#4fd1ff', '#b08cff'];

interface Note {
  s: number;
  len: number;
  m: number;
  kind?: number;
}
/** 층마다 그릴 음표 */
const NOTES: Note[][] = (() => {
  const L: Note[][] = [[], [], [], []];
  for (let s = 0; s < STEPS; s++) {
    const k = s & 7;
    const P = PROG[s >> 3]!;
    if (KICK[k]) L[0]!.push({ s, len: 0.8, m: 0, kind: 0 });
    if (SNARE[k]) L[0]!.push({ s, len: 0.8, m: 1, kind: 1 });
    L[0]!.push({ s, len: 0.5, m: 2, kind: 2 });
    const bo = BASSP[k]!;
    if (bo >= 0) L[1]!.push({ s, len: 0.9, m: P.root + bo });
    if (k === 0) for (const m of P.ch) L[2]!.push({ s, len: 8, m });
    const mm = MEL[s]!;
    if (mm >= 0) {
      let len = 1;
      while (len < 3 && s + len < STEPS && MEL[s + len] === -1) len++;
      L[3]!.push({ s, len, m: mm });
    }
  }
  return L;
})();

class Engine {
  ac: AudioContext;
  out: GainNode;
  duck: GainNode;
  filt: BiquadFilterNode;
  lg: GainNode[] = [];
  voice: GainNode;
  noise: AudioBuffer;
  bpm = 100;
  trans = 0;
  wantTrans = 0;
  hats16 = false;
  alarm = false;
  step = 0;
  nextT: number;
  hist: { s: number; t: number; d: number }[] = [];
  timer: number;
  onStep: ((s: number, T: number) => void) | null = null;

  constructor(on: number[]) {
    const ac = new AudioContext({ latencyHint: 'interactive' });
    this.ac = ac;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 8;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    comp.connect(ac.destination);
    this.out = ac.createGain();
    this.out.gain.value = 0.5;
    this.out.connect(comp);
    this.duck = ac.createGain();
    this.duck.connect(this.out);
    this.filt = ac.createBiquadFilter();
    this.filt.type = 'lowpass';
    this.filt.frequency.value = 18000;
    this.filt.Q.value = 0.7;
    this.filt.connect(this.duck);
    this.voice = ac.createGain();
    this.voice.gain.value = 1;
    this.voice.connect(this.out);
    for (let i = 0; i < 5; i++) {
      const gn = ac.createGain();
      gn.gain.value = on[i] ?? 0;
      gn.connect(this.filt);
      this.lg.push(gn);
    }
    // 멜로디 메아리
    const dl = ac.createDelay(1);
    dl.delayTime.value = 0.45;
    const fb = ac.createGain();
    fb.gain.value = 0.3;
    const wet = ac.createGain();
    wet.gain.value = 0.22;
    this.lg[3]!.connect(dl);
    dl.connect(fb);
    fb.connect(dl);
    dl.connect(wet);
    wet.connect(this.filt);
    const n = ac.sampleRate;
    this.noise = ac.createBuffer(1, n, n);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    if (ac.state === 'suspended') void ac.resume();
    this.nextT = ac.currentTime + 0.1;
    this.timer = window.setInterval(() => this.pump(), 25);
    this.pump();
  }
  stepDur(): number {
    return 60 / this.bpm / 2;
  }
  pump(): void {
    const ac = this.ac;
    while (this.nextT < ac.currentTime + 0.14) {
      const s = this.step % STEPS;
      const d = this.stepDur();
      this.play(s, this.nextT, d);
      this.hist.push({ s: this.step, t: this.nextT, d });
      if (this.hist.length > 64) this.hist.shift();
      this.nextT += d;
      this.step++;
    }
  }
  /** 지금 들리는 자리 (칸, 소수) */
  pos(): number {
    const now = this.ac.currentTime;
    for (let i = this.hist.length - 1; i >= 0; i--) {
      const e = this.hist[i]!;
      if (e.t <= now) return e.s + Math.min(1, (now - e.t) / e.d);
    }
    return (this.hist[0]?.s ?? 0) - 0.001;
  }
  setLayer(i: number, v: number): void {
    const gn = this.lg[i];
    if (gn) gn.gain.setTargetAtTime(v, this.ac.currentTime, 0.05);
  }
  private env(gn: GainNode, T: number, peak: number, a: number, dcy: number): void {
    gn.gain.setValueAtTime(0.0001, T);
    gn.gain.linearRampToValueAtTime(peak, T + a);
    gn.gain.exponentialRampToValueAtTime(0.0001, T + a + dcy);
  }
  private osc(type: OscillatorType, f: number, T: number, end: number, dest: AudioNode, detune = 0): OscillatorNode {
    const o = this.ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, T);
    o.detune.value = detune;
    o.connect(dest);
    o.start(T);
    o.stop(end);
    return o;
  }
  private noiseAt(T: number, dur: number, dest: AudioNode): void {
    const s = this.ac.createBufferSource();
    s.buffer = this.noise;
    s.connect(dest);
    s.start(T, Math.random() * 0.5, dur + 0.05);
  }
  kick(T: number): void {
    const gn = this.ac.createGain();
    gn.connect(this.lg[0]!);
    this.env(gn, T, 0.95, 0.004, 0.32);
    const o = this.osc('sine', 155, T, T + 0.4, gn);
    o.frequency.exponentialRampToValueAtTime(44, T + 0.13);
  }
  snare(T: number): void {
    const gn = this.ac.createGain();
    gn.connect(this.lg[0]!);
    this.env(gn, T, 0.36, 0.002, 0.17);
    const bp = this.ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900;
    bp.Q.value = 0.8;
    bp.connect(gn);
    this.noiseAt(T, 0.2, bp);
    const tg = this.ac.createGain();
    tg.connect(this.lg[0]!);
    this.env(tg, T, 0.22, 0.002, 0.09);
    this.osc('triangle', 188, T, T + 0.12, tg);
  }
  hat(T: number, acc: boolean): void {
    const gn = this.ac.createGain();
    gn.connect(this.lg[0]!);
    this.env(gn, T, acc ? 0.13 : 0.07, 0.001, 0.04);
    const hp = this.ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7800;
    hp.connect(gn);
    this.noiseAt(T, 0.06, hp);
  }
  bass(T: number, m: number, len: number): void {
    const gn = this.ac.createGain();
    gn.connect(this.lg[1]!);
    this.env(gn, T, 0.24, 0.005, len);
    const lp = this.ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 6;
    lp.frequency.setValueAtTime(1500, T);
    lp.frequency.exponentialRampToValueAtTime(260, T + 0.2);
    lp.connect(gn);
    this.osc('sawtooth', mtof(m), T, T + len + 0.05, lp);
    this.osc('sine', mtof(m - 12), T, T + len + 0.05, gn);
  }
  pad(T: number, ms: number[], len: number): void {
    const gn = this.ac.createGain();
    gn.connect(this.lg[2]!);
    gn.gain.setValueAtTime(0.0001, T);
    gn.gain.linearRampToValueAtTime(0.05, T + 0.12);
    gn.gain.setValueAtTime(0.05, T + len - 0.05);
    gn.gain.exponentialRampToValueAtTime(0.0001, T + len + 0.35);
    const lp = this.ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1500;
    lp.connect(gn);
    for (const m of ms) {
      const f = mtof(m + this.trans);
      this.osc('sawtooth', f, T, T + len + 0.4, lp, -7);
      this.osc('sawtooth', f, T, T + len + 0.4, lp, 7);
    }
  }
  lead(T: number, m: number, len: number): void {
    const gn = this.ac.createGain();
    gn.connect(this.lg[3]!);
    this.env(gn, T, 0.13, 0.008, len * 0.95 + 0.18);
    const lp = this.ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3400;
    lp.connect(gn);
    const f = mtof(m);
    this.osc('triangle', f, T, T + len + 0.3, lp);
    const sq = this.ac.createGain();
    sq.gain.value = 0.35;
    sq.connect(lp);
    this.osc('square', f, T, T + len + 0.3, sq, 4);
  }
  beep(T: number, m: number): void {
    const gn = this.ac.createGain();
    gn.connect(this.lg[4]!);
    this.env(gn, T, 0.06, 0.002, 0.09);
    this.osc('square', mtof(m), T, T + 0.12, gn);
  }
  play(s: number, T: number, d: number): void {
    const k = s & 7;
    if (k === 0) this.trans = this.wantTrans;
    const P = PROG[s >> 3]!;
    const tr = this.trans;
    if (KICK[k] || (this.hats16 && k === 7)) this.kick(T);
    if (SNARE[k]) this.snare(T);
    this.hat(T, k % 2 === 0);
    if (this.hats16) this.hat(T + d / 2, false);
    const bo = BASSP[k]!;
    if (bo >= 0) this.bass(T, P.root + bo + tr, d * 1.5);
    if (k === 0) this.pad(T, P.ch, d * 8);
    const mm = MEL[s]!;
    if (mm >= 0) {
      let len = 1;
      while (len < 3 && s + len < STEPS && MEL[s + len] === -1) len++;
      this.lead(T, mm + tr, len * d);
    }
    if (this.alarm && k % 2 === 0) this.beep(T, (k % 4 === 0 ? 88 : 84) + tr);
    if (this.onStep) this.onStep(s, T);
  }
  /** 말소리 흉내 — 모음 두 공명(포먼트)을 지난 톱니파 음절들. 길이(초)를 돌려준다 */
  speak(T: number): number {
    const V = [
      [800, 1200],
      [500, 1900],
      [300, 2300],
      [500, 900],
      [350, 800],
      [650, 1700],
    ];
    let t = T;
    const n = 7;
    for (let i = 0; i < n; i++) {
      const dur = 0.1 + Math.random() * 0.08;
      const v = V[Math.floor(Math.random() * V.length)]!;
      const f0 = 230 * (1.12 - (i / n) * 0.25) * (1 + (Math.random() - 0.5) * 0.08);
      const gn = this.ac.createGain();
      gn.connect(this.voice);
      gn.gain.setValueAtTime(0.0001, t);
      gn.gain.linearRampToValueAtTime(0.55, t + 0.02);
      gn.gain.setValueAtTime(0.5, t + dur - 0.03);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      for (let j = 0; j < 2; j++) {
        const bp = this.ac.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = v[j]!;
        bp.Q.value = j === 0 ? 5 : 8;
        bp.connect(gn);
        const o = this.osc('sawtooth', f0, t, t + dur + 0.02, bp);
        o.frequency.linearRampToValueAtTime(f0 * 0.93, t + dur);
      }
      if (i % 2 === 0) {
        const cg = this.ac.createGain();
        cg.connect(this.voice);
        this.env(cg, t, 0.12, 0.002, 0.03);
        const hp = this.ac.createBiquadFilter();
        hp.type = 'bandpass';
        hp.frequency.value = 3500;
        hp.connect(cg);
        this.noiseAt(t, 0.04, hp);
      }
      t += dur + (i === 3 ? 0.12 : 0.03);
    }
    return t - T;
  }
  close(): void {
    clearInterval(this.timer);
    void this.ac.close();
  }
}

/** 소리 견본의 박자 시계 — 소리가 나면 실제 소리 자리, 아니면 dt 로 적분 */
class Clock {
  phase = 0;
  eng: Engine | null = null;
  tick(dt: number, bpm: number): number {
    if (this.eng && this.eng.ac.state === 'running' && this.eng.hist.length) this.phase = this.eng.pos();
    else this.phase += Math.min(dt, 0.1) * (bpm / 30);
    return Math.max(0, this.phase);
  }
}

/** 층별 막대 악보 */
function drawRoll(
  g: G,
  x: number,
  y: number,
  w: number,
  h: number,
  pos: number,
  on: number[],
  u: number,
  big: boolean,
  opt: { win?: number; tint?: string | null; labels?: boolean } = {},
): void {
  const win = opt.win ?? STEPS;
  const labelW = opt.labels === false ? 0 : (big ? 46 : 30) * u;
  const rx = x + labelW;
  const rw = w - labelW;
  const gap = 3 * u;
  const lh = (h - gap * 3) / 4;
  const scroll = win < STEPS;
  const p = ((pos % STEPS) + STEPS) % STEPS;
  // 칸 → x
  const sx = (s: number): number => {
    if (!scroll) return rx + (s / STEPS) * rw;
    let d = s - p;
    while (d < -win * 0.35) d += STEPS;
    while (d > STEPS - win * 0.35) d -= STEPS;
    return rx + rw * 0.3 + (d / win) * rw;
  };
  for (let L = 0; L < 4; L++) {
    const ly = y + L * (lh + gap);
    const o = on[L] ?? 0;
    const col = opt.tint ? mixHex(LAYER_COL[L]!, opt.tint, 0.45) : LAYER_COL[L]!;
    const colHex = LAYER_COL[L]!;
    rr(g, rx, ly, rw, lh, 3 * u);
    g.fillStyle = `rgba(255,255,255,${0.025 + 0.03 * o})`;
    g.fill();
    // 마디 · 박 선
    g.save();
    rr(g, rx, ly, rw, lh, 3 * u);
    g.clip();
    for (let s = 0; s < STEPS; s += 2) {
      const xx = sx(s);
      if (xx < rx - 2 || xx > rx + rw + 2) continue;
      g.fillStyle = s % 8 === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)';
      g.fillRect(xx, ly, 1, lh);
    }
    const cw = (rw / win) * 1;
    for (const n of NOTES[L]!) {
      const xx = sx(n.s);
      const ww = Math.max(2 * u, n.len * cw - 1.2 * u);
      if (xx + ww < rx || xx > rx + rw) continue;
      let ny: number;
      let nh: number;
      if (L === 0) {
        nh = n.kind === 2 ? lh * 0.12 : lh * 0.22;
        ny = n.kind === 0 ? ly + lh * 0.7 : n.kind === 1 ? ly + lh * 0.4 : ly + lh * 0.14;
      } else {
        const lo = L === 1 ? 40 : L === 2 ? 52 : 66;
        const hi = L === 1 ? 62 : L === 2 ? 65 : 80;
        nh = Math.max(2.4 * u, lh * (L === 2 ? 0.15 : 0.18));
        ny = ly + lh * 0.1 + (1 - (n.m - lo) / (hi - lo)) * (lh * 0.8 - nh);
      }
      // 지금 울리는 음
      let hit = 0;
      let d = p - n.s;
      if (d < 0) d += STEPS;
      if (d < n.len) hit = 1;
      else if (d < n.len + 3) hit = 1 - (d - n.len) / 3;
      const a = o > 0.02 ? 0.35 + 0.65 * o : 0;
      if (a <= 0) {
        rr(g, xx, ny, ww, nh, nh / 2);
        g.fillStyle = 'rgba(160,170,190,0.13)';
        g.fill();
        continue;
      }
      if (hit > 0 && o > 0.3) {
        g.shadowColor = colHex;
        g.shadowBlur = 10 * u * hit * o;
      }
      rr(g, xx, ny, ww, nh, Math.min(nh / 2, 3 * u));
      g.fillStyle = hit > 0.01 ? mixHex(colHex, '#ffffff', hit * 0.55 * o) : col;
      g.globalAlpha = a * (0.55 + 0.45 * Math.max(hit, 0.3));
      g.fill();
      g.globalAlpha = 1;
      g.shadowBlur = 0;
    }
    g.restore();
    if (o < 0.5) {
      g.fillStyle = `rgba(8,10,20,${0.45 * (1 - o)})`;
      rr(g, rx, ly, rw, lh, 3 * u);
      g.fill();
      if (o < 0.2) txt(g, '꺼짐', rx + rw / 2, ly + lh / 2, 7 * u, 'rgba(200,205,220,0.45)', 'center', 700);
    }
    if (labelW > 0) {
      g.fillStyle = hexA(colHex, 0.25 + 0.75 * o);
      rr(g, x, ly + lh * 0.18, 3 * u, lh * 0.64, 1.5 * u);
      g.fill();
      txt(g, LAYER_NAME[L]!, x + 6 * u, ly + lh / 2, (big ? 9 : 7.4) * u, o > 0.5 ? '#e8ecf8' : 'rgba(200,205,220,0.45)', 'left', 700);
    }
  }
  // 재생 줄
  const px = scroll ? rx + rw * 0.3 + (pos - Math.floor(pos)) * 0 : rx + (p / STEPS) * rw;
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = Math.max(1, 1.2 * u);
  g.shadowColor = '#ffffff';
  g.shadowBlur = 6 * u;
  g.beginPath();
  g.moveTo(px, y - 2 * u);
  g.lineTo(px, y + h + 2 * u);
  g.stroke();
  g.shadowBlur = 0;
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(px - 3 * u, y - 4 * u);
  g.lineTo(px + 3 * u, y - 4 * u);
  g.lineTo(px, y);
  g.fill();
}

/** 소리 견본 공통: 「▶ 소리 듣기 / ■ 멈추기」 */
function soundButton(start: () => void, stop: () => void, isOn: () => boolean): Control {
  return {
    type: 'button',
    label: '▶ 소리 듣기 / ■ 멈추기',
    on: () => (isOn() ? stop() : start()),
  };
}

function soundBadge(g: G, w: number, L: Lay, on: boolean, t: number): void {
  if (!L.big) return;
  const u = L.u;
  const x = w - L.pad;
  const y = L.pad;
  if (on) {
    const pw = chip(g, x, y, '♪ 소리 나는 중', '#7dffb2', 8.5 * u, 'right');
    for (let i = 0; i < 4; i++) {
      const bh = (3 + 5 * Math.abs(Math.sin(t * 7 + i * 1.7))) * u;
      g.fillStyle = '#7dffb2';
      g.fillRect(x - pw - 14 * u + i * 3 * u, y + 7 * u - bh / 2, 2 * u, bh);
    }
  } else chip(g, x, y, '소리 꺼짐 — 아래 「▶ 소리 듣기」', '#9aa6c4', 8.5 * u, 'right');
}

// ═════════════════════ i435 배경음악 층 쌓기 ═════════════════════

const STAGES = [
  { name: '평화로운 마을', on: [0, 0, 1, 0], col: '#7dffb2' },
  { name: '탐험 시작', on: [0, 1, 1, 1], col: '#4fd1ff' },
  { name: '적이 나타났다', on: [1, 1, 1, 0], col: '#ffb547' },
  { name: '보스 싸움!', on: [1, 1, 1, 1], col: '#ff6b8a' },
];

function demoLayers(): Made {
  const clock = new Clock();
  let eng: Engine | null = null;
  let auto = true;
  const manual = [1, 1, 1, 1];
  const cur = [0, 0, 1, 0];
  let stT = 0;
  const lvl = [0, 0, 0, 0];
  const start = (): void => {
    if (eng) return;
    eng = new Engine([...cur, 0]);
    clock.eng = eng;
  };
  const stop = (): void => {
    eng?.close();
    eng = null;
    clock.eng = null;
  };
  const controls: Control[] = [
    soundButton(start, stop, () => !!eng),
    { type: 'toggle', label: '상황 따라 자동으로 (꺼면 직접 고르기)', value: true, on: (v) => (auto = v) },
  ];
  for (let i = 0; i < 4; i++)
    controls.push({
      type: 'toggle',
      label: `${LAYER_NAME[i]} 층`,
      value: true,
      on: (v) => {
        manual[i] = v ? 1 : 0;
        auto = false;
      },
    });
  return {
    controls,
    draw(g, w, h, t, dt) {
      reset(g);
      const L = lay(w, h);
      const { u, pad, big } = L;
      backdrop(g, w, h, '#0d1226', '#070912', 'rgba(110,90,255,0.14)', u);
      const pos = clock.tick(dt, 100);
      // 상황: 2마디(16칸)마다 다음 상황 — 박자에 맞춰 바뀐다
      const stage = Math.floor(pos / 16) % 4;
      const st = STAGES[stage]!;
      const target = auto ? st.on : manual;
      for (let i = 0; i < 4; i++) {
        const k = 1 - Math.exp(-Math.min(dt, 0.1) * 7);
        const tv = target[i]!;
        if (eng && Math.abs(cur[i]! - tv) > 0.001 && Math.abs(cur[i]! - tv) > 0.3) eng.setLayer(i, tv);
        cur[i] = lerp(cur[i]!, tv, k);
        if (Math.abs(cur[i]! - tv) < 0.002) cur[i] = tv;
      }
      if (eng) for (let i = 0; i < 4; i++) eng.setLayer(i, target[i]!);
      stT = (pos % 16) / 16;
      // 머리: 상황 이름 + 진행
      const hx = pad;
      const hy = pad;
      txt(g, auto ? '지금 상황' : '직접 고른 층', hx, hy + 5 * u, (big ? 8 : 6.6) * u, '#8d97b8', 'left', 600);
      const pw = chip(g, hx, hy + 10 * u, auto ? st.name : '수동', auto ? st.col : '#c9d2ee', (big ? 11 : 8.4) * u, 'left', true);
      if (auto) {
        const bx = hx + pw + 6 * u;
        const bw = (big ? 120 : 64) * u;
        for (let i = 0; i < 4; i++) {
          const x0 = bx + i * (bw / 4);
          rr(g, x0, hy + 16 * u, bw / 4 - 2 * u, 3 * u, 1.5 * u);
          g.fillStyle = i < stage ? hexA(STAGES[i]!.col, 0.8) : i === stage ? hexA(st.col, 0.25) : 'rgba(255,255,255,0.08)';
          g.fill();
          if (i === stage) {
            rr(g, x0, hy + 16 * u, (bw / 4 - 2 * u) * stT, 3 * u, 1.5 * u);
            g.fillStyle = st.col;
            g.fill();
          }
        }
      }
      soundBadge(g, w, L, !!eng, t);
      // 섞는 단추판 (오른쪽) + 악보 (왼쪽)
      const top = hy + (big ? 34 : 27) * u;
      const mixW = (big ? 88 : 52) * u;
      const rollW = w - pad * 2 - mixW - 8 * u;
      const rollH = h - top - pad - (big ? 18 : 12) * u;
      drawRoll(g, pad, top, rollW, rollH, pos, cur, u, big);
      // 박자 점
      const beat = Math.floor(pos / 2) % 4;
      for (let i = 0; i < 4; i++) {
        const cx = pad + (big ? 46 : 30) * u + (rollW - (big ? 46 : 30) * u) * ((i + 0.5) / 4) - (rollW - (big ? 46 : 30) * u) * 0.0;
        const on = i === beat;
        glowDot(g, cx, top + rollH + (big ? 10 : 7) * u, (on ? 2.6 : 1.8) * u, on ? '#ffffff' : '#56607e', on ? 1 : 0.6);
      }
      // 섞는 판
      const mx = w - pad - mixW;
      panel(g, mx, top, mixW, rollH, 5 * u);
      const fw = mixW / 4;
      for (let i = 0; i < 4; i++) {
        const cx = mx + fw * (i + 0.5);
        const ty = top + 6 * u;
        const bh = rollH - (big ? 26 : 20) * u;
        // 소리 크기(음표가 울릴 때 튐)
        let hit = 0;
        const p = pos % STEPS;
        for (const n of NOTES[i]!) {
          let d = p - n.s;
          if (d < 0) d += STEPS;
          if (d < n.len + 1.5) hit = Math.max(hit, 1 - d / (n.len + 1.5));
        }
        lvl[i] = Math.max(hit * cur[i]!, (lvl[i] ?? 0) - Math.min(dt, 0.1) * 2.5);
        const lv = lvl[i]!;
        rr(g, cx - 3 * u, ty, 6 * u, bh, 3 * u);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fill();
        const fh = bh * (0.15 + 0.85 * lv);
        const lg2 = g.createLinearGradient(0, ty + bh, 0, ty);
        lg2.addColorStop(0, LAYER_COL[i]!);
        lg2.addColorStop(1, mixHex(LAYER_COL[i]!, '#ffffff', 0.5));
        rr(g, cx - 3 * u, ty + bh - fh, 6 * u, fh, 3 * u);
        g.fillStyle = lg2;
        g.globalAlpha = 0.15 + 0.85 * cur[i]!;
        g.fill();
        g.globalAlpha = 1;
        // 켬 단추
        const ky = ty + bh + 7 * u;
        g.beginPath();
        g.arc(cx, ky, 3.6 * u, 0, Math.PI * 2);
        g.fillStyle = cur[i]! > 0.5 ? LAYER_COL[i]! : 'rgba(255,255,255,0.08)';
        g.fill();
        g.strokeStyle = hexA(LAYER_COL[i]!, 0.7);
        g.lineWidth = 1;
        g.stroke();
      }
      if (big) txt(g, '같은 박자 위에서 층을 더하고 빼면 음악이 끊기지 않고 분위기만 바뀐다 (2마디마다 다음 상황)', pad, h - pad * 0.6, 8.5 * u, '#8d97b8');
    },
    dispose() {
      stop();
    },
  };
}

// ═════════════════════ i436 긴장에 따라 바뀌는 음악 ═════════════════════

function demoTension(): Made {
  const clock = new Clock();
  let eng: Engine | null = null;
  let auto = true;
  let manualT = 0.5;
  let ten = 0;
  let timeLeft = 30;
  let flash = 0;
  let lastBeat = -1;
  const start = (): void => {
    if (eng) return;
    eng = new Engine([0, 1, 1, 0, 0]);
    clock.eng = eng;
  };
  const stop = (): void => {
    eng?.close();
    eng = null;
    clock.eng = null;
  };
  const params = (k: number) => ({
    bpm: Math.round(92 + 60 * k),
    cut: Math.round(700 + 11000 * Math.pow(k, 1.6)),
    trans: k > 0.72 ? 2 : 0,
    layers: [k > 0.22 ? 1 : 0, 1, 1, k > 0.48 ? 1 : 0, k > 0.8 ? 1 : 0],
    h16: k > 0.62,
  });
  return {
    controls: [
      soundButton(start, stop, () => !!eng),
      { type: 'toggle', label: '시간 따라 자동 (끄면 아래 손잡이)', value: true, on: (v) => (auto = v) },
      {
        type: 'range',
        label: '긴장 (0 평온 → 1 위기)',
        min: 0,
        max: 1,
        step: 0.01,
        value: 0.5,
        on: (v) => {
          manualT = v;
          auto = false;
        },
      },
    ],
    draw(g, w, h, t, dt) {
      reset(g);
      const L = lay(w, h);
      const { u, pad, big } = L;
      // 남은 시간 30 → 0 (8초에 한 바퀴)
      if (auto) {
        timeLeft -= Math.min(dt, 0.1) * 3.75;
        if (timeLeft < -2) timeLeft = 30;
      }
      const want = auto ? clamp(1 - Math.max(0, timeLeft) / 30, 0, 1) : manualT;
      ten = lerp(ten, want, 1 - Math.exp(-Math.min(dt, 0.1) * 5));
      const P = params(ten);
      if (eng) {
        eng.bpm = P.bpm;
        eng.wantTrans = P.trans;
        eng.hats16 = P.h16;
        eng.alarm = P.layers[4] === 1;
        eng.filt.frequency.setTargetAtTime(P.cut, eng.ac.currentTime, 0.1);
        for (let i = 0; i < 5; i++) eng.setLayer(i, P.layers[i]!);
      }
      const pos = clock.tick(dt, P.bpm);
      const hot = mixHex('#4fb6ff', '#ff4d5e', ease(ten));
      backdrop(g, w, h, mixHex('#0b1430', '#2a0a14', ten), '#06070d', hexA('#ff3050', 0.04 + 0.2 * ten), u);
      const beat = Math.floor(pos / 2);
      if (beat !== lastBeat) {
        lastBeat = beat;
        if (ten > 0.6) flash = 1;
      }
      flash = Math.max(0, flash - Math.min(dt, 0.1) * 4);
      if (flash > 0) {
        g.strokeStyle = hexA('#ff3b55', flash * 0.6 * ten);
        g.lineWidth = 6 * u;
        g.strokeRect(0, 0, w, h);
      }
      // 왼쪽: 남은 시간 고리 + 긴장 막대
      const lw = (big ? 150 : 92) * u;
      const cx = pad + lw / 2;
      const R = Math.min(lw * 0.36, (h - pad * 2) * 0.27);
      const cy = pad + R + (big ? 14 : 8) * u;
      g.lineWidth = 5 * u;
      g.strokeStyle = 'rgba(255,255,255,0.08)';
      g.beginPath();
      g.arc(cx, cy, R, 0, Math.PI * 2);
      g.stroke();
      const frac = auto ? clamp(timeLeft / 30, 0, 1) : 1 - ten;
      g.strokeStyle = hot;
      g.lineCap = 'round';
      g.shadowColor = hot;
      g.shadowBlur = 8 * u;
      g.beginPath();
      g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
      g.stroke();
      g.shadowBlur = 0;
      g.lineCap = 'butt';
      const sec = Math.max(0, Math.ceil(timeLeft));
      const pulse = ten > 0.6 ? 1 + 0.08 * flash : 1;
      txt(g, auto ? `${sec}` : `${Math.round(ten * 100)}`, cx, cy - 1 * u, R * 0.72 * pulse, '#ffffff', 'center', 800);
      txt(g, auto ? '남은 초' : '긴장 %', cx, cy + R * 0.52, R * 0.24, '#9aa6c4', 'center', 600);
      // 긴장 막대
      const by = cy + R + (big ? 16 : 10) * u;
      const bw = lw - 6 * u;
      txt(g, '긴장', pad + 3 * u, by, 7 * u, '#9aa6c4');
      const bx0 = pad + 3 * u;
      const bh = 5 * u;
      rr(g, bx0, by + 5 * u, bw, bh, bh / 2);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fill();
      const lg2 = g.createLinearGradient(bx0, 0, bx0 + bw, 0);
      lg2.addColorStop(0, '#4fb6ff');
      lg2.addColorStop(0.6, '#ffb547');
      lg2.addColorStop(1, '#ff4d5e');
      rr(g, bx0, by + 5 * u, bw * ten, bh, bh / 2);
      g.fillStyle = lg2;
      g.fill();
      // 읽은 값
      const ry = by + bh + (big ? 16 : 12) * u;
      const rows: [string, string][] = [
        ['빠르기', `${P.bpm} BPM`],
        ['밝기(필터)', P.cut >= 1000 ? `${(P.cut / 1000).toFixed(1)}kHz` : `${P.cut}Hz`],
        ['음높이', P.trans ? '+2 반음' : '그대로'],
      ];
      const rh = (big ? 15 : 10.5) * u;
      rows.forEach(([a, b], i) => {
        if (ry + i * rh > h - pad) return;
        txt(g, a, pad + 3 * u, ry + i * rh, (big ? 8.5 : 6.8) * u, '#8d97b8');
        txt(g, b, pad + lw - 3 * u, ry + i * rh, (big ? 9 : 7.2) * u, '#eef2ff', 'right', 700);
      });
      soundBadge(g, w, L, !!eng, t);
      // 오른쪽: 흘러가는 악보 (긴장할수록 빨리 · 붉게 · 또렷하게)
      const rx = pad + lw + 8 * u;
      const top = pad + (big ? 30 : 4) * u;
      const rw = w - rx - pad;
      const rh2 = h - top - pad - (big ? 22 : 16) * u;
      const on = [P.layers[0]!, 1, 1, P.layers[3]!];
      drawRoll(g, rx, top, rw, rh2, pos, on, u, big, { win: 16, tint: ten > 0.05 ? (ten > 0.5 ? '#ff4d5e' : '#4fb6ff') : null });
      // 필터 안개: 긴장이 낮으면 소리가 먹먹 → 그림도 뿌옇게
      const fog = (1 - ten) * 0.38;
      if (fog > 0.01) {
        const fg = g.createLinearGradient(rx, 0, rx + rw, 0);
        fg.addColorStop(0, `rgba(30,50,90,${fog * 0.2})`);
        fg.addColorStop(1, `rgba(30,50,90,${fog})`);
        g.fillStyle = fg;
        rr(g, rx + (big ? 46 : 30) * u, top, rw - (big ? 46 : 30) * u, rh2, 3 * u);
        g.fill();
      }
      // 아래 칩
      const cyb = top + rh2 + (big ? 6 : 4) * u;
      let xx = rx + (big ? 46 : 30) * u;
      const cp = (big ? 8.5 : 6.4) * u;
      xx += chip(g, xx, cyb, P.h16 ? '찰랑이 16분' : '찰랑이 8분', '#ff6b8a', cp) + 4 * u;
      xx += chip(g, xx, cyb, P.layers[3] ? '멜로디 켬' : '멜로디 끔', '#b08cff', cp) + 4 * u;
      if (xx < w - pad - 30 * u) chip(g, xx, cyb, P.layers[4] ? '경보음 켬' : '경보음 끔', '#ffd15c', cp);
    },
    dispose() {
      stop();
    },
  };
}

// ═════════════════════ i437 덕킹 ═════════════════════

const LINES = ['정답이에요! 아주 잘했어요', '다음 문제로 가 볼까요?', '시간이 얼마 안 남았어요!', '보물 상자를 찾았어요!'];

function demoDuck(): Made {
  const clock = new Clock();
  let eng: Engine | null = null;
  let ducking = true;
  let depthDb = -14;
  let vt0 = -10;
  let vt1 = -10;
  let syl: { a: number; b: number }[] = [];
  let line = 0;
  let cyc = 0;
  let simT = 0;
  const hist: { m: number; v: number; a: number }[] = [];
  let histAcc = 0;
  const start = (): void => {
    if (eng) return;
    eng = new Engine([1, 1, 1, 1, 0]);
    clock.eng = eng;
  };
  const stop = (): void => {
    eng?.close();
    eng = null;
    clock.eng = null;
  };
  const say = (): void => {
    line = (line + 1) % LINES.length;
    if (eng) {
      const T = eng.ac.currentTime + 0.05;
      const d = eng.speak(T);
      const off = simT - eng.ac.currentTime;
      vt0 = T + off;
      vt1 = T + d + off;
      if (ducking) {
        const dg = eng.duck.gain;
        const gv = Math.pow(10, depthDb / 20);
        dg.cancelScheduledValues(eng.ac.currentTime);
        dg.setTargetAtTime(gv, T - 0.05, 0.05);
        dg.setTargetAtTime(1, T + d, 0.25);
      }
    } else {
      vt0 = simT + 0.05;
      vt1 = vt0 + 1.3;
    }
    // 음절 막대 (그림용)
    syl = [];
    let a = vt0;
    const n = 7;
    const span = vt1 - vt0;
    for (let i = 0; i < n; i++) {
      const d = (span / n) * (0.7 + 0.25 * Math.sin(i * 2.3));
      syl.push({ a, b: a + d });
      a += span / n;
    }
  };
  return {
    controls: [
      soundButton(start, stop, () => !!eng),
      { type: 'button', label: '🗣 말하기 (안내 음성 흉내)', on: say },
      { type: 'toggle', label: '덕킹 켬 (말할 때 음악 줄이기)', value: true, on: (v) => (ducking = v) },
      { type: 'range', label: '줄이는 깊이 (dB)', min: -30, max: -3, step: 1, value: -14, on: (v) => (depthDb = v) },
    ],
    draw(g, w, h, t, dt) {
      reset(g);
      const L = lay(w, h);
      const { u, pad, big } = L;
      const dd = Math.min(dt, 0.1);
      simT += dd;
      const pos = clock.tick(dd, 100);
      // 카드: 3.6초마다 저절로 말하기
      cyc += dd;
      if (cyc > 3.6) {
        cyc = 0;
        if (!eng) say();
      }
      // 음악 음량 곡선 (붙을 때 0.05초, 풀릴 때 0.25초)
      const dg = Math.pow(10, depthDb / 20);
      let m = 1;
      if (ducking) {
        if (simT >= vt0 - 0.05 && simT < vt1) m = lerp(1, dg, 1 - Math.exp(-(simT - vt0 + 0.05) / 0.05));
        else if (simT >= vt1) {
          const m1 = dg;
          m = lerp(m1, 1, 1 - Math.exp(-(simT - vt1) / 0.25));
        }
      }
      let v = 0;
      for (const s of syl) if (simT >= s.a && simT < s.b) v = 0.6 + 0.4 * Math.sin(((simT - s.a) / (s.b - s.a)) * Math.PI);
      const speaking = simT >= vt0 && simT < vt1 + 0.15;
      histAcc += dd;
      while (histAcc > 1 / 60) {
        histAcc -= 1 / 60;
        const ph = pos;
        const kickE = Math.exp(-(((ph % 2) + 2) % 2) * 2.2);
        const a = clamp(0.3 + 0.5 * kickE + 0.25 * Math.abs(Math.sin(ph * 7.3)) * Math.abs(Math.sin(ph * 2.1 + 1)), 0, 1);
        hist.push({ m, v: v > 0 ? v * (0.55 + 0.45 * Math.abs(Math.sin(simT * 41))) : 0, a });
        if (hist.length > 300) hist.shift();
      }
      backdrop(g, w, h, '#0c1324', '#06080f', 'rgba(80,200,255,0.12)', u);
      soundBadge(g, w, L, !!eng, t);
      // 위: 안내 캐릭터 + 말풍선
      const ay = pad + (big ? 34 : 18) * u;
      const ar = (big ? 15 : 11) * u;
      const ax = pad + ar + 2 * u;
      const bounce = speaking ? Math.abs(Math.sin(simT * 14)) * 1.5 * u : 0;
      g.fillStyle = '#ffd36b';
      g.beginPath();
      g.arc(ax, ay - bounce, ar, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#2a2140';
      g.beginPath();
      g.arc(ax - ar * 0.35, ay - ar * 0.15 - bounce, ar * 0.12, 0, Math.PI * 2);
      g.arc(ax + ar * 0.35, ay - ar * 0.15 - bounce, ar * 0.12, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      const mo = speaking ? 0.12 + v * 0.2 : 0.06;
      g.ellipse(ax, ay + ar * 0.35 - bounce, ar * 0.25, ar * mo, 0, 0, Math.PI * 2);
      g.fillStyle = '#7a2b3a';
      g.fill();
      if (speaking) {
        const k = clamp((simT - vt0) / 0.15, 0, 1);
        const bx = ax + ar + 6 * u;
        const text = LINES[line]!;
        const fp = (big ? 11 : 8) * u;
        g.font = font(fp, 700);
        const tw = Math.min(g.measureText(text).width, w - bx - pad * 2 - 10 * u);
        g.globalAlpha = k;
        rr(g, bx, ay - fp * 1.1, tw + fp * 1.4, fp * 2.2, fp * 0.9);
        g.fillStyle = '#f4f7ff';
        g.fill();
        g.beginPath();
        g.moveTo(bx + 1, ay - 3 * u);
        g.lineTo(bx - 5 * u, ay + 2 * u);
        g.lineTo(bx + 1, ay + 4 * u);
        g.fill();
        g.save();
        g.beginPath();
        g.rect(bx, ay - fp * 1.1, tw + fp * 1.2, fp * 2.2);
        g.clip();
        txt(g, text, bx + fp * 0.7, ay, fp, '#1a2140', 'left', 700);
        g.restore();
        g.globalAlpha = 1;
      } else txt(g, '(조용 — 음악만)', ax + ar + 8 * u, ay, (big ? 9 : 7) * u, '#5d6787');
      // 가운데: 음악 파형 (덕킹되면 작아짐) + 말소리 파형
      const wh = (big ? 70 : 34) * u;
      const wy = ay + ar + (big ? 12 : 5) * u + wh / 2;
      const wx = pad;
      const ww = w - pad * 2;
      panel(g, wx, wy - wh / 2, ww, wh, 5 * u);
      txt(g, '배경음악', wx + 5 * u, wy - wh / 2 + 6 * u, 6.6 * u * (big ? 1.2 : 1), '#7fdcff', 'left', 700);
      g.save();
      rr(g, wx, wy - wh / 2, ww, wh, 5 * u);
      g.clip();
      const N = big ? 150 : 70;
      const bw2 = ww / N;
      for (let i = 0; i < N; i++) {
        const hi = hist[Math.floor(((i + 0.5) / N) * (hist.length - 1))];
        if (!hi) continue;
        const xx = wx + i * bw2;
        const ma = hi.a * hi.m * wh * 0.42;
        g.fillStyle = hi.m < 0.9 ? mixHex('#4fd1ff', '#2a5a80', 1 - hi.m) : '#4fd1ff';
        g.fillRect(xx + bw2 * 0.15, wy - ma, bw2 * 0.7, ma * 2);
        if (hi.v > 0) {
          const va = hi.v * wh * 0.4;
          g.fillStyle = 'rgba(255,211,107,0.92)';
          g.fillRect(xx + bw2 * 0.3, wy - va, bw2 * 0.4, va * 2);
        }
      }
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(wx, wy - 0.5, ww, 1);
      g.restore();
      // 아래: 음량 곡선 (dB)
      const gy = wy + wh / 2 + (big ? 12 : 6) * u;
      const gh = h - gy - pad - (big ? 16 : 0) * u;
      if (gh > 14 * u) {
        panel(g, wx, gy, ww, gh, 5 * u);
        const lab = (big ? 7.5 : 6) * u;
        txt(g, '음악 음량', wx + 5 * u, gy + 6 * u, lab, '#9aa6c4', 'left', 700);
        txt(g, '0 dB', wx + ww - 4 * u, gy + 6 * u, lab, '#6f7a99', 'right');
        txt(g, `${depthDb} dB`, wx + ww - 4 * u, gy + gh - 6 * u, lab, '#6f7a99', 'right');
        const top = gy + 11 * u;
        const bot = gy + gh - 4 * u;
        const yOf = (lin: number): number => {
          const db = 20 * Math.log10(Math.max(lin, 1e-4));
          return lerp(top, bot, clamp(db / Math.min(-3, depthDb), 0, 1));
        };
        // 말소리 칸
        for (let i = 0; i < hist.length; i++) {
          const hh = hist[i]!;
          if (hh.v > 0) {
            const xx = wx + (i / 299) * ww;
            g.fillStyle = 'rgba(255,211,107,0.18)';
            g.fillRect(xx, top, ww / 299 + 0.5, bot - top);
          }
        }
        const x0 = wx + ((300 - hist.length) / 299) * ww;
        g.beginPath();
        g.moveTo(x0, bot);
        hist.forEach((hh, i) => g.lineTo(wx + ((i + 300 - hist.length) / 299) * ww, yOf(hh.m)));
        g.lineTo(wx + ww, bot);
        g.closePath();
        const fg = g.createLinearGradient(0, top, 0, bot);
        fg.addColorStop(0, 'rgba(79,209,255,0.35)');
        fg.addColorStop(1, 'rgba(79,209,255,0.02)');
        g.fillStyle = fg;
        g.fill();
        g.beginPath();
        hist.forEach((hh, i) => {
          const xx = wx + ((i + 300 - hist.length) / 299) * ww;
          if (i === 0) g.moveTo(xx, yOf(hh.m));
          else g.lineTo(xx, yOf(hh.m));
        });
        g.strokeStyle = '#4fd1ff';
        g.lineWidth = 1.5 * u;
        g.stroke();
        if (!ducking && speaking) chip(g, wx + ww / 2, gy + gh / 2 - 6 * u, '덕킹 꺼짐 — 말이 음악에 묻혀요', '#ff6b8a', (big ? 9 : 6.6) * u, 'center');
      }
      if (big) txt(g, '말이 시작되면 0.05초 만에 줄이고, 끝나면 0.25초에 걸쳐 천천히 되돌린다 (빨리 붙고 · 천천히 풀림)', pad, h - pad * 0.6, 8.5 * u, '#8d97b8');
    },
    dispose() {
      stop();
    },
  };
}

// ═════════════════════ i438 박자 맞춰 연출 ═════════════════════

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  col: string;
}

function demoBeat(): Made {
  const clock = new Clock();
  let eng: Engine | null = null;
  let sync = true;
  let prevPos = 0;
  let freePh = [0, 0, 0];
  let simT = 0;
  let nextBurst = 1;
  const sparks: Spark[] = [];
  const marks: { at: number; err: number }[] = [];
  let flash = 0;
  const balls = [
    { per: 2, col: '#ff6b8a', name: '한 박' },
    { per: 4, col: '#ffb547', name: '두 박' },
    { per: 1, col: '#4fd1ff', name: '반 박' },
  ];
  const impact = [0, 0, 0];
  const start = (): void => {
    if (eng) return;
    eng = new Engine([1, 1, 1, 1, 0]);
    clock.eng = eng;
  };
  const stop = (): void => {
    eng?.close();
    eng = null;
    clock.eng = null;
  };
  let W = 280;
  let H = 175;
  const burst = (x: number, y: number, big: number): void => {
    const cols = ['#ffd36b', '#ff6b8a', '#4fd1ff', '#b08cff', '#7dffb2'];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + Math.random() * 0.2;
      const sp = (40 + Math.random() * 60) * big;
      sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, col: cols[i % cols.length]! });
    }
    if (sparks.length > 200) sparks.splice(0, sparks.length - 200);
  };
  return {
    controls: [
      soundButton(start, stop, () => !!eng),
      { type: 'toggle', label: '박자 맞춤 (끄면 제멋대로 타이머)', value: true, on: (v) => (sync = v) },
      { type: 'button', label: '★ 터뜨리기 (다음 박에 예약)', on: () => (nextBurst = -1) },
    ],
    draw(g, w, h, t, dt) {
      reset(g);
      W = w;
      H = h;
      const L = lay(w, h);
      const { u, pad, big } = L;
      const dd = Math.min(dt, 0.1);
      simT += dd;
      const pos = clock.tick(dd, 100);
      const sPerStep = 0.3;
      backdrop(g, w, h, '#120d26', '#07060f', 'rgba(255,120,200,0.12)', u);
      if (flash > 0) {
        g.fillStyle = `rgba(255,220,150,${flash * 0.12})`;
        g.fillRect(0, 0, w, h);
      }
      flash = Math.max(0, flash - dd * 3);
      soundBadge(g, w, L, !!eng, t);
      // 박자 등 4개
      const beatF = pos / 2;
      const beat = Math.floor(beatF) % 4;
      const bx0 = pad;
      const by = pad + (big ? 8 : 6) * u;
      txt(g, '박자', bx0, by, (big ? 8 : 6.6) * u, '#9aa6c4', 'left', 700);
      for (let i = 0; i < 4; i++) {
        const cx = bx0 + (big ? 34 : 24) * u + i * (big ? 18 : 13) * u;
        const on = i === beat;
        const fr = on ? 1 - (beatF % 1) : 0;
        glowDot(g, cx, by, (2.6 + (on ? 1.4 * fr : 0)) * u, i === 0 ? '#ffd36b' : '#ff6b8a', on ? 0.6 + 0.4 * fr : 0.22);
      }
      chip(g, bx0 + (big ? 110 : 80) * u, by - (big ? 7 : 5.5) * u, sync ? '박자 시계로 예약' : '따로 노는 타이머', sync ? '#7dffb2' : '#ff6b8a', (big ? 8.5 : 6.4) * u);
      // 무대
      const floorY = h - pad - (big ? 46 : 28) * u;
      const stTop = by + (big ? 16 : 10) * u;
      g.strokeStyle = 'rgba(255,255,255,0.15)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(pad, floorY);
      g.lineTo(w - pad, floorY);
      g.stroke();
      const jump = floorY - stTop - 10 * u;
      const r = (big ? 9 : 6.5) * u;
      // 공: 박자 맞춤이면 음악 자리, 아니면 조금 다른 빠르기의 제 시계
      const area = w * 0.55;
      for (let i = 0; i < 3; i++) {
        const b = balls[i]!;
        let ph: number;
        if (sync) ph = pos / b.per;
        else {
          freePh[i] = (freePh[i] ?? 0) + (dd / (b.per * sPerStep)) * (1.13 + i * 0.07);
          ph = freePh[i]!;
        }
        const prevPh = sync ? prevPos / b.per : ph - (dd / (b.per * sPerStep)) * (1.13 + i * 0.07);
        if (Math.floor(ph) !== Math.floor(prevPh)) {
          impact[i] = 1;
          // 박과의 어긋남 (ms)
          const near = Math.round(pos / 2) * 2;
          const err = ((pos - near) * sPerStep * 1000) | 0;
          marks.push({ at: simT, err: sync ? 0 : err });
          if (marks.length > 40) marks.shift();
        }
        impact[i] = Math.max(0, impact[i]! - dd * 5);
        const f = ph % 1;
        const hgt = 1 - Math.pow(2 * f - 1, 2);
        const x = pad + area * ((i + 0.5) / 3);
        const y = floorY - r - hgt * jump * (i === 2 ? 0.45 : i === 1 ? 1 : 0.7);
        const sq = impact[i]! * 0.35;
        // 그림자
        g.fillStyle = `rgba(0,0,0,${0.35 * (1 - hgt * 0.6)})`;
        g.beginPath();
        g.ellipse(x, floorY + 1.5 * u, r * (1 - hgt * 0.4), r * 0.25, 0, 0, Math.PI * 2);
        g.fill();
        if (impact[i]! > 0) {
          g.strokeStyle = hexA(b.col, impact[i]! * 0.8);
          g.lineWidth = 1.5 * u;
          g.beginPath();
          g.ellipse(x, floorY, r * (1.2 + (1 - impact[i]!) * 1.6), r * 0.35 * (1.2 + (1 - impact[i]!)), 0, 0, Math.PI * 2);
          g.stroke();
        }
        const rg = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
        rg.addColorStop(0, mixHex(b.col, '#ffffff', 0.6));
        rg.addColorStop(1, b.col);
        g.fillStyle = rg;
        g.beginPath();
        g.ellipse(x, y + r * sq * 0.5, r * (1 + sq), r * (1 - sq), 0, 0, Math.PI * 2);
        g.fill();
        txt(g, b.name, x, floorY + (big ? 10 : 7) * u, (big ? 8 : 6.2) * u, '#8d97b8', 'center');
      }
      // 별 터짐: 마디 첫 박 (또는 예약)
      const sx = pad + area + (w - pad * 2 - area) / 2;
      const sy = stTop + (floorY - stTop) * 0.45;
      const bar = Math.floor(pos / 8);
      const prevBar = Math.floor(prevPos / 8);
      if (sync) {
        if (bar !== prevBar) {
          burst(sx, sy, u);
          flash = 1;
        }
        if (nextBurst === -1 && Math.floor(pos / 2) !== Math.floor(prevPos / 2)) {
          burst(sx, sy, u * 0.7);
          nextBurst = 1;
        }
      } else {
        nextBurst -= dd;
        if (nextBurst <= 0 || nextBurst < -0.5) {
          burst(sx, sy, u);
          flash = 1;
          nextBurst = 1.6 + Math.random() * 1.4;
        }
      }
      prevPos = pos;
      // 별 모양 가운데
      const pul = 1 + flash * 0.3;
      g.save();
      g.translate(sx, sy);
      g.rotate(t * 0.6);
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const rr2 = (i % 2 ? 4 : 10) * u * pul;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        if (i === 0) g.moveTo(Math.cos(a) * rr2, Math.sin(a) * rr2);
        else g.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2);
      }
      g.closePath();
      g.fillStyle = '#ffd36b';
      g.shadowColor = '#ffd36b';
      g.shadowBlur = 12 * u * (0.4 + flash);
      g.fill();
      g.restore();
      g.globalCompositeOperation = 'lighter';
      for (const s of sparks) {
        s.life -= dd * 1.3;
        s.x += s.vx * dd;
        s.y += s.vy * dd;
        s.vy += 60 * u * dd;
        s.vx *= 0.97;
        s.vy *= 0.97;
        if (s.life <= 0) continue;
        g.fillStyle = hexA(s.col, s.life);
        g.beginPath();
        g.arc(s.x, s.y, 1.8 * u * s.life + 0.5, 0, Math.PI * 2);
        g.fill();
      }
      g.globalCompositeOperation = 'source-over';
      for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i]!.life <= 0 || sparks[i]!.x < 0 || sparks[i]!.x > W || sparks[i]!.y > H) sparks.splice(i, 1);
      // 아래: 박 격자 + 일어난 일 표시
      const ty = floorY + (big ? 22 : 14) * u;
      const tw = w - pad * 2;
      const span = 4;
      g.strokeStyle = 'rgba(255,255,255,0.1)';
      g.beginPath();
      g.moveTo(pad, ty);
      g.lineTo(pad + tw, ty);
      g.stroke();
      // 박 눈금 (박자 시계 기준, 오른쪽 끝이 지금)
      const secPerBeat = 0.6;
      const nowBeat = pos / 2;
      for (let b = Math.ceil(nowBeat - span / secPerBeat); b <= nowBeat; b++) {
        const x = pad + tw - ((nowBeat - b) * secPerBeat * tw) / span;
        g.fillStyle = b % 4 === 0 ? 'rgba(255,211,107,0.7)' : 'rgba(255,255,255,0.3)';
        g.fillRect(x - 0.5, ty - 4 * u, 1, 8 * u);
      }
      for (const m of marks) {
        const age = simT - m.at;
        if (age > span) continue;
        const x = pad + tw - (age * tw) / span;
        const good = Math.abs(m.err) < 30;
        g.fillStyle = good ? '#7dffb2' : '#ff6b8a';
        g.beginPath();
        g.arc(x, ty, 1.8 * u, 0, Math.PI * 2);
        g.fill();
      }
      const recent = marks.filter((m) => simT - m.at < span);
      const avg = recent.length ? recent.reduce((a, m) => a + Math.abs(m.err), 0) / recent.length : 0;
      txt(g, sync ? '어긋남 0 ms — 모두 박 위에' : `평균 어긋남 ±${Math.round(avg)} ms`, pad, ty + (big ? 12 : 8) * u, (big ? 8.5 : 6.6) * u, sync ? '#7dffb2' : '#ff8aa5', 'left', 700);
      if (big) txt(g, '노란 눈금 = 마디 첫 박 · 점 = 공이 땅에 닿은 순간 (초록 = 박 위, 빨강 = 어긋남)', w - pad, ty + 12 * u, 8 * u, '#8d97b8', 'right');
    },
    dispose() {
      stop();
    },
  };
}

// ═════════════════════ 온라인 흉내 ═════════════════════

type Lane = 0 | 1 | 2;
interface Msg {
  a: Lane;
  b: Lane;
  t0: number;
  t1: number;
  label: string;
  col: string;
  lost?: boolean;
  fat?: boolean;
  fired?: boolean;
  cb?: () => void;
}
interface Mark {
  lane: Lane;
  t: number;
  text: string;
  col: string;
}
interface Span {
  lane: Lane;
  t0: number;
  t1: number;
  col: string;
}

class Net {
  now = 0;
  msgs: Msg[] = [];
  timers: { at: number; fn: () => void; gen: number }[] = [];
  marks: Mark[] = [];
  spans: Span[] = [];
  gen = 0;
  send(a: Lane, b: Lane, lat: number, label: string, col: string, cb?: () => void, o: { lost?: boolean; fat?: boolean } = {}): Msg {
    const m: Msg = { a, b, t0: this.now, t1: this.now + Math.max(0.02, lat), label, col, ...o };
    if (cb) m.cb = cb;
    this.msgs.push(m);
    return m;
  }
  after(d: number, fn: () => void): void {
    this.timers.push({ at: this.now + d, fn, gen: this.gen });
  }
  mark(lane: Lane, text: string, col: string): void {
    this.marks.push({ lane, t: this.now, text, col });
  }
  /** 다음 바퀴 — 남은 예약 버리기 (지난 그림은 위로 흘러가게 둔다) */
  restart(): void {
    this.gen++;
    this.timers = [];
    for (const m of this.msgs) if (!m.fired) m.cb = undefined;
  }
  step(dt: number): void {
    this.now += Math.min(dt, 0.1);
    for (let guard = 0; guard < 50; guard++) {
      let best = -1;
      for (let i = 0; i < this.timers.length; i++) {
        const tm = this.timers[i]!;
        if (tm.at <= this.now && (best < 0 || tm.at < this.timers[best]!.at)) best = i;
      }
      if (best < 0) break;
      const tm = this.timers.splice(best, 1)[0]!;
      if (tm.gen === this.gen) tm.fn();
    }
    for (const m of this.msgs) {
      if (!m.fired && this.now >= m.t1) {
        m.fired = true;
        if (!m.lost && m.cb) m.cb();
      }
    }
    const old = this.now - 12;
    this.msgs = this.msgs.filter((m) => m.t1 > old);
    this.marks = this.marks.filter((m) => m.t > old);
    this.spans = this.spans.filter((s) => s.t1 > old);
  }
}

const ME_COL = '#4fd1ff';
const OPP_COL = '#ff7aa8';
const SRV_COL = '#ffd36b';
const OK_COL = '#7dffb2';
const BAD_COL = '#ff5d6c';
const LANE_NAME = ['나', '서버', '상대'];

function laneX(x: number, w: number, lane: Lane): number {
  return x + w * [0.16, 0.5, 0.84][lane]!;
}

/** 시퀀스 그림: 시간은 아래로 흐르고(아래 끝 = 지금), 메시지는 기울어진 선 — 기울기 = 지연 */
function drawSeq(g: G, x: number, y: number, w: number, h: number, net: Net, u: number, big: boolean, winIn = 0): void {
  const win = winIn || (big ? 5.5 : 3.6);
  panel(g, x, y, w, h, 6 * u);
  const hh = (big ? 26 : 18) * u;
  const top = y + hh + 2 * u;
  const bot = y + h - 8 * u;
  const yOf = (t: number): number => bot - ((net.now - t) / win) * (bot - top);
  // 머리
  for (let l = 0; l < 3; l++) {
    const lx = laneX(x, w, l as Lane);
    const col = [ME_COL, SRV_COL, OPP_COL][l]!;
    const cy = y + hh / 2 + 1 * u;
    const r = (big ? 8 : 5.6) * u;
    if (l === 1) {
      rr(g, lx - r * 0.9, cy - r, r * 1.8, r * 2, 2 * u);
      g.fillStyle = hexA(col, 0.2);
      g.fill();
      g.strokeStyle = col;
      g.lineWidth = 1;
      g.stroke();
      for (let k = 0; k < 3; k++) {
        g.fillStyle = col;
        g.fillRect(lx - r * 0.55, cy - r * 0.6 + k * r * 0.55, r * 1.1, r * 0.22);
      }
    } else {
      g.beginPath();
      g.arc(lx, cy, r, 0, Math.PI * 2);
      g.fillStyle = hexA(col, 0.2);
      g.fill();
      g.strokeStyle = col;
      g.lineWidth = 1;
      g.stroke();
      g.beginPath();
      g.arc(lx, cy - r * 0.25, r * 0.33, 0, Math.PI * 2);
      g.arc(lx, cy + r * 0.7, r * 0.6, Math.PI, 0);
      g.fillStyle = col;
      g.fill();
    }
    txt(g, LANE_NAME[l]!, lx + r + 3 * u, cy, (big ? 9.5 : 7) * u, col, 'left', 800);
  }
  g.strokeStyle = 'rgba(255,255,255,0.06)';
  g.beginPath();
  g.moveTo(x + 4 * u, y + hh);
  g.lineTo(x + w - 4 * u, y + hh);
  g.stroke();
  g.save();
  g.beginPath();
  g.rect(x, top - 2 * u, w, bot - top + 8 * u);
  g.clip();
  // 시간 눈금 (0.5초)
  const t0 = Math.ceil((net.now - win) * 2) / 2;
  for (let tt = t0; tt <= net.now; tt += 0.5) {
    const yy = yOf(tt);
    g.fillStyle = 'rgba(255,255,255,0.035)';
    g.fillRect(x + 4 * u, yy, w - 8 * u, 1);
  }
  // 줄
  for (let l = 0; l < 3; l++) {
    const lx = laneX(x, w, l as Lane);
    const lg = g.createLinearGradient(0, top, 0, bot);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(1, 'rgba(255,255,255,0.22)');
    g.strokeStyle = lg;
    g.lineWidth = Math.max(1, 1.2 * u);
    g.beginPath();
    g.moveTo(lx, top);
    g.lineTo(lx, bot);
    g.stroke();
  }
  // 구간 (끊김 등)
  for (const s of net.spans) {
    const lx = laneX(x, w, s.lane);
    const y0 = yOf(s.t0);
    const y1 = yOf(Math.min(s.t1, net.now));
    g.strokeStyle = hexA(s.col, 0.8);
    g.lineWidth = 3.4 * u;
    g.setLineDash([3 * u, 2.5 * u]);
    g.beginPath();
    g.moveTo(lx, y0);
    g.lineTo(lx, y1);
    g.stroke();
    g.setLineDash([]);
  }
  // 메시지
  const labels: { m: Msg; ax: number; bx: number; y0: number; y1: number; a: number }[] = [];
  for (const m of net.msgs) {
    const ax = laneX(x, w, m.a);
    const bx = laneX(x, w, m.b);
    const y0 = yOf(m.t0);
    const y1 = yOf(m.t1);
    const k = clamp((net.now - m.t0) / (m.t1 - m.t0), 0, 1);
    const kk = m.lost ? Math.min(k, 0.62) : k;
    const ex = lerp(ax, bx, kk);
    const ey = lerp(y0, y1, kk);
    const age = net.now - m.t1;
    const fade = age > 0 ? clamp(1 - age / (win * 0.9), 0.15, 1) : 1;
    g.globalAlpha = fade;
    g.strokeStyle = m.col;
    g.lineWidth = (m.fat ? 2.8 : 1.4) * u;
    if (m.lost) g.setLineDash([2.5 * u, 2 * u]);
    g.beginPath();
    g.moveTo(ax, y0);
    g.lineTo(ex, ey);
    g.stroke();
    g.setLineDash([]);
    if (k >= 1 && !m.lost) {
      const ang = Math.atan2(y1 - y0, bx - ax);
      const s = (m.fat ? 5 : 4) * u;
      g.fillStyle = m.col;
      g.beginPath();
      g.moveTo(bx, y1);
      g.lineTo(bx - Math.cos(ang - 0.45) * s, y1 - Math.sin(ang - 0.45) * s);
      g.lineTo(bx - Math.cos(ang + 0.45) * s, y1 - Math.sin(ang + 0.45) * s);
      g.fill();
    }
    if (m.lost && k >= 0.62) {
      const s = 3.4 * u;
      g.strokeStyle = BAD_COL;
      g.lineWidth = 1.8 * u;
      g.beginPath();
      g.moveTo(ex - s, ey - s);
      g.lineTo(ex + s, ey + s);
      g.moveTo(ex + s, ey - s);
      g.lineTo(ex - s, ey + s);
      g.stroke();
    }
    g.globalAlpha = 1;
    if (k < 1 && !(m.lost && k >= 0.62)) glowDot(g, ex, ey, (m.fat ? 3.2 : 2.3) * u, m.col);
    // 이름표 (나중에 겹치지 않게 놓기)
    if (age < win * 0.7 && (k > 0.3 || big)) labels.push({ m, ax, bx, y0, y1, a: fade * clamp((k - 0.15) * 3, 0, 1) });
  }
  // 줄 위 글표 — 같은 줄에서 가까우면 위로 쌓기 (먼저 놓아 우선)
  const fp = (big ? 8 : 5.8) * u;
  const chH = fp * 1.65;
  const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const hitBox = (x0: number, y0: number, x1: number, y1: number): boolean => boxes.some((r) => x0 < r.x1 && x1 > r.x0 && y0 < r.y1 && y1 > r.y0);
  const lastY: number[] = [1e9, 1e9, 1e9];
  const mks = [...net.marks].sort((p, q) => q.t - p.t);
  for (const mk of mks) {
    let yy = yOf(mk.t) - fp * 0.82;
    if (yy > lastY[mk.lane]! - chH - 1) yy = lastY[mk.lane]! - chH - 1;
    lastY[mk.lane] = yy;
    if (yy < top - 4 * u) continue;
    const lx = laneX(x, w, mk.lane);
    const align = mk.lane === 1 ? 'center' : mk.lane === 0 ? 'left' : 'right';
    const ox = mk.lane === 1 ? lx : align === 'right' ? lx - 3 * u : lx + 3 * u;
    g.globalAlpha = clamp(1 - (net.now - mk.t) / (win * 0.9), 0.2, 1);
    const pw = chip(g, ox, yy, mk.text, mk.col, fp, align, true);
    const x0 = align === 'left' ? ox : align === 'right' ? ox - pw : ox - pw / 2;
    boxes.push({ x0, y0: yy, x1: x0 + pw, y1: yy + chH });
    g.globalAlpha = 1;
  }
  // 메시지 이름표 — 새것부터, 겹치면 선 위 다른 자리, 그래도 겹치면 생략
  for (let i = labels.length - 1; i >= 0; i--) {
    const L = labels[i]!;
    g.font = font(fp, 700);
    const tw = g.measureText(L.m.label).width;
    const lw = tw + 6 * u;
    const lh = fp * 1.6;
    for (const kk of [0.36, 0.62, 0.2, 0.8]) {
      const mx = lerp(L.ax, L.bx, kk);
      const my = lerp(L.y0, L.y1, kk);
      const x0 = mx - lw / 2;
      const y0 = my - lh / 2;
      if (hitBox(x0, y0, x0 + lw, y0 + lh)) continue;
      boxes.push({ x0, y0, x1: x0 + lw, y1: y0 + lh });
      g.globalAlpha = L.a;
      rr(g, x0, y0, lw, lh, lh / 2);
      g.fillStyle = 'rgba(10,14,28,0.9)';
      g.fill();
      g.strokeStyle = hexA(L.m.col, 0.5);
      g.lineWidth = 1;
      g.stroke();
      txt(g, L.m.label, mx, my, fp, L.m.col, 'center', 700);
      g.globalAlpha = 1;
      break;
    }
  }
  g.restore();
  // 지금 줄
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.setLineDash([2 * u, 2 * u]);
  g.beginPath();
  g.moveTo(x + 4 * u, bot);
  g.lineTo(x + w - 4 * u, bot);
  g.stroke();
  g.setLineDash([]);
  txt(g, '지금', x + w - 5 * u, bot + 4 * u, 5.4 * u * (big ? 1.3 : 1), 'rgba(255,255,255,0.45)', 'right', 700);
}

type P = 'X' | 'O';
interface Cell {
  p: P;
  wait: boolean;
  t: number;
  auto?: boolean;
}
class Board {
  c: (Cell | null)[] = [null, null, null, null, null, null, null, null, null];
  gone: { i: number; p: P; t: number }[] = [];
  hourglass = -1;
  hover = -1;
  flash: number[] = [];
  flashT = -10;
  set(i: number, p: P, wait: boolean, now: number, auto = false): void {
    const old = this.c[i];
    if (old && old.p === p && !wait && old.wait) {
      old.wait = false;
      old.t = now;
      return;
    }
    this.c[i] = { p, wait, t: now, auto };
  }
  undo(i: number, now: number): void {
    const old = this.c[i];
    if (old) this.gone.push({ i, p: old.p, t: now });
    this.c[i] = null;
  }
  clear(): void {
    this.c = [null, null, null, null, null, null, null, null, null];
    this.gone = [];
    this.hourglass = -1;
    this.hover = -1;
    this.flash = [];
  }
  copyFrom(b: Board, now: number): void {
    this.flash = [];
    for (let i = 0; i < 9; i++) {
      const s = b.c[i];
      const m = this.c[i];
      if ((s?.p ?? '') !== (m?.p ?? '') || (m && m.wait)) this.flash.push(i);
      this.c[i] = s ? { p: s.p, wait: false, t: now } : null;
    }
    this.flashT = now;
  }
}

function drawPiece(g: G, p: P, cx: number, cy: number, r: number, u: number, a: number, sc: number): void {
  g.globalAlpha = a;
  g.lineCap = 'round';
  g.lineWidth = Math.max(1.5, r * 0.28);
  const col = p === 'X' ? ME_COL : OPP_COL;
  g.strokeStyle = col;
  g.shadowColor = col;
  g.shadowBlur = 6 * u * a;
  const s = r * sc;
  g.beginPath();
  if (p === 'X') {
    g.moveTo(cx - s * 0.7, cy - s * 0.7);
    g.lineTo(cx + s * 0.7, cy + s * 0.7);
    g.moveTo(cx + s * 0.7, cy - s * 0.7);
    g.lineTo(cx - s * 0.7, cy + s * 0.7);
  } else g.arc(cx, cy, s * 0.78, 0, Math.PI * 2);
  g.stroke();
  g.shadowBlur = 0;
  g.lineCap = 'butt';
  g.globalAlpha = 1;
}

function drawBoard(g: G, x: number, y: number, s: number, b: Board, now: number, u: number, title?: string, titleCol = '#c9d2ee'): void {
  panel(g, x, y, s, s, 6 * u, 'rgba(255,255,255,0.1)');
  const m = s * 0.08;
  const cs = (s - m * 2) / 3;
  g.strokeStyle = 'rgba(255,255,255,0.16)';
  g.lineWidth = Math.max(1, 1.3 * u);
  g.lineCap = 'round';
  g.beginPath();
  for (let i = 1; i < 3; i++) {
    g.moveTo(x + m + cs * i, y + m + 2 * u);
    g.lineTo(x + m + cs * i, y + s - m - 2 * u);
    g.moveTo(x + m + 2 * u, y + m + cs * i);
    g.lineTo(x + s - m - 2 * u, y + m + cs * i);
  }
  g.stroke();
  g.lineCap = 'butt';
  const cc = (i: number): [number, number] => [x + m + cs * ((i % 3) + 0.5), y + m + cs * (Math.floor(i / 3) + 0.5)];
  const r = cs * 0.32;
  if (b.hover >= 0) {
    const [hx, hy] = cc(b.hover);
    rr(g, hx - cs * 0.42, hy - cs * 0.42, cs * 0.84, cs * 0.84, 4 * u);
    g.fillStyle = 'rgba(255,122,168,0.1)';
    g.fill();
    drawPiece(g, 'O', hx, hy, r, u, 0.25 + 0.1 * Math.sin(now * 6), 1);
  }
  const fl = clamp(1 - (now - b.flashT) / 0.8, 0, 1);
  for (const i of b.flash) {
    if (fl <= 0) break;
    const [fx, fy] = cc(i);
    rr(g, fx - cs * 0.45, fy - cs * 0.45, cs * 0.9, cs * 0.9, 4 * u);
    g.fillStyle = hexA(OK_COL, 0.3 * fl);
    g.fill();
  }
  for (let i = 0; i < 9; i++) {
    const c = b.c[i];
    if (!c) continue;
    const [cx, cy] = cc(i);
    const age = now - c.t;
    const pop = age < 0.2 ? 0.6 + 0.4 * ease(age / 0.2) + Math.sin((age / 0.2) * Math.PI) * 0.15 : 1;
    if (c.wait) {
      drawPiece(g, c.p, cx, cy, r, u, 0.45, pop);
      g.strokeStyle = hexA(c.p === 'X' ? ME_COL : OPP_COL, 0.8);
      g.lineWidth = 1.2 * u;
      g.setLineDash([2.5 * u, 2.5 * u]);
      g.lineDashOffset = -now * 12 * u;
      g.beginPath();
      g.arc(cx, cy, cs * 0.42, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      g.lineDashOffset = 0;
    } else drawPiece(g, c.p, cx, cy, r, u, 1, pop);
    if (c.auto) chip(g, cx, cy + cs * 0.22, '자동', SRV_COL, 5.2 * u, 'center', true);
  }
  for (const gn of b.gone) {
    const age = now - gn.t;
    if (age > 0.9) continue;
    const [cx, cy] = cc(gn.i);
    const sh = Math.sin(age * 50) * 3 * u * (1 - age / 0.9);
    rr(g, cx - cs * 0.45, cy - cs * 0.45, cs * 0.9, cs * 0.9, 4 * u);
    g.fillStyle = hexA(BAD_COL, 0.25 * (1 - age / 0.9));
    g.fill();
    drawPiece(g, gn.p, cx + sh, cy, r, u, 1 - age / 0.9, 1);
  }
  if (b.hourglass >= 0) {
    const [cx, cy] = cc(b.hourglass);
    g.save();
    g.translate(cx, cy);
    g.rotate(Math.floor(now * 2) % 2 ? Math.PI : 0);
    const s2 = cs * 0.2;
    g.strokeStyle = '#c9d2ee';
    g.lineWidth = 1.2 * u;
    g.beginPath();
    g.moveTo(-s2, -s2 * 1.2);
    g.lineTo(s2, -s2 * 1.2);
    g.lineTo(-s2, s2 * 1.2);
    g.lineTo(s2, s2 * 1.2);
    g.closePath();
    g.stroke();
    g.restore();
  }
  if (title) txt(g, title, x + s / 2, y - 5 * u, 6.8 * u, titleCol, 'center', 700);
}

function veil(g: G, x: number, y: number, s: number, now: number, u: number, text: string): void {
  rr(g, x, y, s, s, 6 * u);
  g.fillStyle = 'rgba(6,8,16,0.72)';
  g.fill();
  const cx = x + s / 2;
  const cy = y + s / 2 - 5 * u;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.floor(now * 10) * (Math.PI / 4);
    g.fillStyle = `rgba(200,210,240,${0.15 + (i / 8) * 0.85})`;
    g.beginPath();
    g.arc(cx + Math.cos(a) * 7 * u, cy + Math.sin(a) * 7 * u, 1.5 * u, 0, Math.PI * 2);
    g.fill();
  }
  txt(g, text, cx, cy + 15 * u, 7 * u, '#e6ebff', 'center', 700);
}

interface NLay {
  big: boolean;
  u: number;
  pad: number;
  bx: number;
  by: number;
  bs: number;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  colW: number;
}
function nlay(w: number, h: number): NLay {
  const big = w > 420;
  const s = Math.min(w / 280, h / 175);
  const u = s * (big ? 0.66 : 1);
  const pad = (big ? 14 : 6) * (big ? s * 0.6 : s);
  const colW = big ? Math.min(w * 0.36, h * 0.72) : w * 0.38;
  const top = pad + (big ? 24 : 14) * u;
  const bs = Math.min(colW - pad, h - top - pad - (big ? 40 : 26) * u);
  const bx = pad + (colW - pad - bs) / 2;
  const sx = colW + (big ? 10 : 4) * u;
  return { big, u, pad, bx, by: top, bs, sx, sy: pad, sw: w - sx - pad, sh: h - pad * 2, colW };
}

function netBg(g: G, w: number, h: number, u: number): void {
  backdrop(g, w, h, '#0b1222', '#05070d', 'rgba(70,130,255,0.13)', u);
}

/** 왼쪽 위 상태 줄 */
function statusLine(g: G, L: NLay, text: string, col: string): void {
  chip(g, L.pad, L.pad, text, col, (L.big ? 8.6 : 6.4) * L.u);
}

function latControl(get: { v: number }, label = '지연 (한 방향, ms)'): Control {
  return { type: 'range', label, min: 50, max: 800, step: 10, value: get.v, on: (v) => (get.v = v) };
}

// ═════════════════════ i439 지연 숨기기 ═════════════════════

function demoPredict(): Made {
  const net = new Net();
  const lat = { v: 260 };
  let optimistic = true;
  let mixReject = true;
  const me = new Board();
  let cyc = 0;
  let pressT = -1;
  let seenT = -1;
  let shownLag = 0;
  let status = '';
  let statusCol = '#9aa6c4';
  const preset = (): void => {
    me.clear();
    me.set(0, 'X', false, -9);
    me.set(4, 'O', false, -9);
    me.set(8, 'X', false, -9);
  };
  const run = (): void => {
    net.restart();
    preset();
    const L = lat.v / 1000;
    const reject = mixReject && cyc % 2 === 1;
    cyc++;
    status = '내 차례';
    statusCol = ME_COL;
    if (reject) {
      // 상대 수가 서버에 먼저 도착
      net.after(0.25, () => {
        net.send(2, 1, L, 'O → ③', OPP_COL, () => {
          net.mark(1, '#4 상대 ✓', OK_COL);
          net.send(1, 2, L, '확인', OK_COL);
          net.send(1, 0, L, 'O → ③', OPP_COL, () => {
            const c = me.c[2];
            if (c && c.wait) {
              me.undo(2, net.now);
              net.mark(0, '되돌림 ↶', BAD_COL);
            }
            me.hourglass = -1;
            me.set(2, 'O', false, net.now);
          });
        });
      });
    }
    net.after(0.4, () => {
      pressT = net.now;
      seenT = -1;
      status = optimistic ? '바로 보임 · 확인 기다림' : '서버 답을 기다리는 중…';
      statusCol = optimistic ? ME_COL : '#ffb547';
      if (optimistic) {
        me.set(2, 'X', true, net.now);
        seenT = net.now;
        shownLag = 0;
      } else me.hourglass = 2;
      net.mark(0, '③ 누름', ME_COL);
      net.send(0, 1, L, 'X → ③', ME_COL, () => {
        if (reject) {
          net.mark(1, '거절: 이미 둔 칸', BAD_COL);
          net.send(1, 0, L, '거절 ✕', BAD_COL, () => {
            status = optimistic ? '거절 → 되돌렸어요' : '거절됐어요';
            statusCol = BAD_COL;
            me.hourglass = -1;
          });
        } else {
          net.mark(1, '#4 나 ✓', OK_COL);
          net.send(1, 2, L, 'X → ③', ME_COL);
          net.send(1, 0, L, '확인 ✓', OK_COL, () => {
            me.hourglass = -1;
            me.set(2, 'X', false, net.now);
            if (seenT < 0) {
              seenT = net.now;
              shownLag = (seenT - pressT) * 1000;
            }
            status = '확인됨 ✓';
            statusCol = OK_COL;
          });
        }
      });
    });
    const period = Math.max(3, 0.4 + 2 * L + 1.7);
    net.after(period, run);
  };
  run();
  return {
    controls: [
      latControl(lat),
      { type: 'toggle', label: '지연 숨기기 (내 수 먼저 보여 주기)', value: true, on: (v) => (optimistic = v) },
      { type: 'toggle', label: '가끔 거절되는 상황 섞기', value: true, on: (v) => (mixReject = v) },
      { type: 'button', label: '처음부터', on: () => ((cyc = 0), run()) },
    ],
    draw(g, w, h, _t, dt) {
      reset(g);
      net.step(dt);
      const L = nlay(w, h);
      const { u, big } = L;
      netBg(g, w, h, u);
      statusLine(g, L, `지연 ${lat.v}ms`, '#9aa6c4');
      drawBoard(g, L.bx, L.by, L.bs, me, net.now, u);
      const iy = L.by + L.bs + (big ? 12 : 8) * u;
      txt(g, status, L.bx + L.bs / 2, iy, (big ? 9 : 6.8) * u, statusCol, 'center', 700);
      const lag = optimistic ? 0 : seenT > 0 ? shownLag : pressT > 0 ? (net.now - pressT) * 1000 : 0;
      txt(g, `누르고 보이기까지 ${Math.round(lag)} ms`, L.bx + L.bs / 2, iy + (big ? 14 : 10) * u, (big ? 8 : 6) * u, optimistic ? OK_COL : '#ffb547', 'center', 600);
      drawSeq(g, L.sx, L.sy, L.sw, L.sh, net, u, big);
    },
  };
}

// ═════════════════════ i440 다시 접속 ═════════════════════

function demoReconnect(): Made {
  const net = new Net();
  const lat = { v: 220 };
  let downFor = 1.6;
  let resync = true;
  const me = new Board();
  const srv = new Board();
  let offline = false;
  let connecting = false;
  let status = '';
  let statusCol = '#9aa6c4';
  let moveNo = 0;
  const move = (who: 0 | 2, cell: number, connected: () => boolean): void => {
    const L = lat.v / 1000;
    const p: P = who === 0 ? 'X' : 'O';
    const col = who === 0 ? ME_COL : OPP_COL;
    if (who === 0) me.set(cell, p, false, net.now);
    net.send(who, 1, L, `${p} → ${cell + 1}`, col, () => {
      moveNo++;
      srv.set(cell, p, false, net.now);
      net.mark(1, `#${moveNo}`, SRV_COL);
      const other: Lane = who === 0 ? 2 : 0;
      const lost = other === 0 && !connected();
      net.send(1, other, L, `${p} → ${cell + 1}`, col, () => {
        if (other === 0) me.set(cell, p, false, net.now);
      }, { lost });
    });
  };
  const run = (): void => {
    net.restart();
    me.clear();
    srv.clear();
    offline = false;
    connecting = false;
    moveNo = 0;
    status = '연결됨';
    statusCol = OK_COL;
    const L = lat.v / 1000;
    const on = (): boolean => !offline && !connecting;
    net.after(0.2, () => move(0, 4, on));
    net.after(0.2 + 2 * L + 0.3, () => move(2, 0, on));
    net.after(0.2 + 4 * L + 0.6, () => move(0, 2, on));
    const dT = 0.2 + 6 * L + 1.2;
    net.after(dT, () => {
      offline = true;
      status = '끊김!';
      statusCol = BAD_COL;
      net.mark(0, '와이파이 끊김', BAD_COL);
      net.spans.push({ lane: 0, t0: net.now, t1: net.now + downFor + 2 * L, col: BAD_COL });
    });
    // 끊긴 사이 상대는 계속 둔다 (나는 못 받음)
    net.after(dT + 0.3, () => move(2, 6, on));
    net.after(dT + downFor, () => {
      offline = false;
      connecting = true;
      status = '연결 중…';
      statusCol = '#ffb547';
      net.send(0, 1, L, resync ? '다시 접속 · 마지막 #3' : '다시 접속', ME_COL, () => {
        if (resync) {
          net.mark(1, '판 · 차례 보내기', SRV_COL);
          net.send(1, 0, L, '판 전체 + 차례', SRV_COL, () => {
            me.copyFrom(srv, net.now);
            connecting = false;
            status = '이어서 ✓ 내 차례';
            statusCol = OK_COL;
            net.mark(0, '판 맞춤 ✓', OK_COL);
            net.after(0.5, () => move(0, 8, on));
          }, { fat: true });
        } else {
          net.send(1, 0, L, '연결 OK', SRV_COL, () => {
            connecting = false;
            status = '판이 서버와 달라요!';
            statusCol = BAD_COL;
            net.mark(0, '판 어긋남 ✕', BAD_COL);
          });
        }
      });
    });
    net.after(dT + downFor + 2 * L + 2.4, run);
  };
  run();
  return {
    controls: [
      latControl(lat),
      { type: 'range', label: '끊긴 시간 (초)', min: 0.6, max: 3, step: 0.1, value: 1.6, on: (v) => (downFor = v) },
      { type: 'toggle', label: '다시 접속 때 판 전체 받기', value: true, on: (v) => (resync = v) },
      { type: 'button', label: '처음부터', on: () => run() },
    ],
    draw(g, w, h, _t, dt) {
      reset(g);
      net.step(dt);
      const L = nlay(w, h);
      const { u, big } = L;
      netBg(g, w, h, u);
      statusLine(g, L, status, statusCol);
      if (big) {
        // 내 화면 + 서버 판 나란히
        const s2 = L.bs * 0.62;
        drawBoard(g, L.bx, L.by + 10 * u, s2, me, net.now, u, '내 화면', ME_COL);
        if (offline || connecting) veil(g, L.bx, L.by + 10 * u, s2, net.now, u, offline ? '끊김…' : '연결 중…');
        const s3 = L.bs * 0.36;
        drawBoard(g, L.bx + L.bs - s3, L.by + 10 * u + s2 - s3, s3, srv, net.now, u * 0.7, '서버 판', SRV_COL);
        txt(g, '끊긴 사이 생긴 수는', L.pad, L.by + s2 + 30 * u, 8 * u, '#8d97b8');
        txt(g, '다시 접속 때 「판 전체」로 한 번에 받는다', L.pad, L.by + s2 + 42 * u, 8 * u, '#8d97b8');
      } else {
        drawBoard(g, L.bx, L.by, L.bs, me, net.now, u);
        if (offline || connecting) veil(g, L.bx, L.by, L.bs, net.now, u, offline ? '끊김…' : '연결 중…');
        txt(g, '끊긴 동안 온 수 ✕ → 판 전체로 받기', L.bx + L.bs / 2, L.by + L.bs + 8 * u, 5.8 * u, '#8d97b8', 'center');
      }
      drawSeq(g, L.sx, L.sy, L.sw, L.sh, net, u, big);
    },
  };
}

// ═════════════════════ i441 차례 시계 ═════════════════════

function demoClock(): Made {
  const net = new Net();
  const lat = { v: 200 };
  let skew = 1.5;
  let fix = true;
  const TURN = 5;
  const me = new Board();
  let deadline = -1;
  let offset: number | null = null;
  let t1 = 0;
  let localOver = false;
  let srvOver = false;
  let gotDeadline = false;
  const run = (): void => {
    net.restart();
    me.clear();
    me.set(0, 'O', false, -9);
    me.set(4, 'X', false, -9);
    me.set(5, 'O', false, -9);
    offset = null;
    deadline = -1;
    localOver = false;
    srvOver = false;
    gotDeadline = false;
    const L = lat.v / 1000;
    // 시계 맞추기 (핑)
    net.after(0.1, () => {
      t1 = net.now + skew;
      net.send(0, 1, L, `핑 (내 시각 ${t1.toFixed(1)})`, '#c9d2ee', () => {
        const S = net.now;
        net.send(1, 0, L, `퐁 (서버 ${S.toFixed(1)})`, SRV_COL, () => {
          const t2 = net.now + skew;
          offset = S - (t1 + t2) / 2;
          net.mark(0, `차이 ${(-offset).toFixed(1)}초`, '#c9d2ee');
        });
      });
    });
    // 차례 시작 (서버 시각 기준 마감)
    net.after(0.3, () => {
      deadline = net.now + TURN;
      net.mark(1, `마감 ${deadline.toFixed(1)}`, SRV_COL);
      net.send(1, 0, L, '내 차례 · 마감 시각', SRV_COL, () => (gotDeadline = true));
      net.after(TURN, () => {
        srvOver = true;
        net.mark(1, '시간 초과', BAD_COL);
        net.send(1, 0, L, '시간 초과 → 자동 수', BAD_COL, () => me.set(8, 'X', false, net.now, true));
        net.send(1, 2, L, '자동 수', BAD_COL);
      });
    });
    net.after(0.3 + TURN + 2 * L + 1.8, run);
  };
  run();
  const ring = (g: G, cx: number, cy: number, R: number, left: number, col: string, title: string, sub: string, u: number, big: boolean): void => {
    g.lineWidth = 4 * u;
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.stroke();
    const f = clamp(left / TURN, 0, 1);
    g.strokeStyle = left <= 1 ? BAD_COL : col;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f);
    g.stroke();
    g.lineCap = 'butt';
    txt(g, left > 0 ? left.toFixed(1) : '0.0', cx, cy, R * 0.62, '#ffffff', 'center', 800);
    txt(g, title, cx, cy + R + (big ? 9 : 6.5) * u, (big ? 8 : 6) * u, col, 'center', 700);
    if (sub) txt(g, sub, cx, cy + R + (big ? 20 : 13.5) * u, (big ? 7 : 5.2) * u, '#8d97b8', 'center');
  };
  return {
    controls: [
      { type: 'range', label: '내 기기 시계 차이 (초)', min: -3, max: 3, step: 0.1, value: 1.5, on: (v) => (skew = v) },
      { type: 'toggle', label: '서버 시각으로 보정', value: true, on: (v) => (fix = v) },
      latControl(lat),
      { type: 'button', label: '처음부터', on: () => run() },
    ],
    draw(g, w, h, _t, dt) {
      reset(g);
      net.step(dt);
      const L = nlay(w, h);
      const { u, big } = L;
      netBg(g, w, h, u);
      const local = net.now + skew;
      const srvLeft = deadline > 0 ? deadline - net.now : TURN;
      let myLeft = TURN;
      let sub = '';
      if (deadline > 0 && gotDeadline) {
        if (fix && offset !== null) {
          myLeft = deadline - (local + offset);
          sub = '보정됨';
        } else if (fix) {
          myLeft = deadline - local;
          sub = '맞추는 중…';
        } else {
          myLeft = deadline - local;
          sub = `${skew >= 0 ? '+' : ''}${skew.toFixed(1)}초 어긋남`;
        }
      } else if (deadline > 0) sub = '마감 받는 중';
      if (gotDeadline && myLeft <= 0 && !srvOver && !localOver) {
        localOver = true;
        net.mark(0, '내 화면만 0초?', BAD_COL);
      }
      statusLine(g, L, `서버 ${net.now.toFixed(1)} · 내 시계 ${local.toFixed(1)}`, '#9aa6c4');
      // 두 시계
      const R = L.bs * 0.17;
      const cy = L.by + R + 2 * u;
      ring(g, L.bx + L.bs * 0.25, cy, R, srvLeft, SRV_COL, '서버 남은 시간', '진짜 기준', u, big);
      ring(g, L.bx + L.bs * 0.75, cy, R, myLeft, ME_COL, '내 화면', sub, u, big);
      const by2 = cy + R + (big ? 28 : 19) * u;
      const s2 = L.by + L.bs - by2 + (big ? 30 : 20) * u;
      const bsz = Math.min(s2, L.bs * 0.62);
      drawBoard(g, L.bx + (L.bs - bsz) / 2, by2, bsz, me, net.now, u * 0.8);
      if (srvOver) chip(g, L.bx + L.bs / 2, by2 + bsz + 3 * u, '시간 초과 → 서버가 자동으로 둠', BAD_COL, (big ? 8 : 5.8) * u, 'center');
      drawSeq(g, L.sx, L.sy, L.sw, L.sh, net, u, big);
    },
  };
}

// ═════════════════════ i442 동시에 둔 수 정리 ═════════════════════

function demoRace(): Made {
  const net = new Net();
  const latMe = { v: 300 };
  const latOpp = { v: 180 };
  const me = new Board();
  const op = new Board();
  let cyc = 0;
  let order: { who: string; col: string; sent: number; got: number; ok: boolean }[] = [];
  const run = (): void => {
    net.restart();
    me.clear();
    op.clear();
    for (const b of [me, op]) {
      b.set(0, 'X', false, -9);
      b.set(2, 'O', false, -9);
      b.set(6, 'O', false, -9);
    }
    order = [];
    const cell = 4;
    const lm = latMe.v / 1000;
    const lo = latOpp.v / 1000;
    const dMe = cyc % 2 ? 0 : 0.04;
    const dOp = cyc % 2 ? 0.04 : 0;
    cyc++;
    let taken: P | null = null;
    const arrive = (who: 0 | 2, sent: number): void => {
      const p: P = who === 0 ? 'X' : 'O';
      const col = who === 0 ? ME_COL : OPP_COL;
      const n = order.length + 1;
      if (!taken) {
        taken = p;
        order.push({ who: who === 0 ? '나' : '상대', col, sent, got: net.now, ok: true });
        net.mark(1, `#${n} ${who === 0 ? '나' : '상대'} ✓`, OK_COL);
        net.send(1, 0, lm, who === 0 ? '확인 ✓' : `${p} → ⑤`, who === 0 ? OK_COL : col, () => me.set(cell, p, false, net.now));
        net.send(1, 2, lo, who === 2 ? '확인 ✓' : `${p} → ⑤`, who === 2 ? OK_COL : col, () => op.set(cell, p, false, net.now));
      } else {
        order.push({ who: who === 0 ? '나' : '상대', col, sent, got: net.now, ok: false });
        net.mark(1, `#${n} ${who === 0 ? '나' : '상대'} ✕`, BAD_COL);
        const back = who === 0 ? lm : lo;
        net.send(1, who, back, '거절 · 이미 차지됨', BAD_COL, () => {
          const b = who === 0 ? me : op;
          net.mark(who, '되돌림 ↶', BAD_COL);
          void b;
        });
      }
    };
    // 거의 같은 순간에 둘 다 ⑤ 칸
    net.after(0.3 + dMe, () => {
      const s = net.now;
      me.set(cell, 'X', true, net.now);
      net.send(0, 1, lm, 'X → ⑤', ME_COL, () => arrive(0, s));
    });
    net.after(0.3 + dOp, () => {
      const s = net.now;
      op.set(cell, 'O', true, net.now);
      net.send(2, 1, lo, 'O → ⑤', OPP_COL, () => arrive(2, s));
    });
    const period = 0.35 + 2 * Math.max(lm, lo) + 2;
    net.after(period, run);
  };
  // 남이 이긴 칸: 내 흐린 수를 지우고 상대 수 (set 이 같은 p 만 굳히므로 직접 처리)
  const origSet = Board.prototype.set;
  const fix = (b: Board): void => {
    b.set = function (i: number, p: P, wait: boolean, now: number, auto = false): void {
      const old = this.c[i];
      if (old && old.wait && old.p !== p && !wait) this.undo(i, now);
      origSet.call(this, i, p, wait, now, auto);
    };
  };
  fix(me);
  fix(op);
  run();
  return {
    controls: [
      latControl(latMe, '내 지연 (ms)'),
      latControl(latOpp, '상대 지연 (ms)'),
      { type: 'button', label: '다시 (둘이 동시에)', on: () => run() },
    ],
    draw(g, w, h, _t, dt) {
      reset(g);
      net.step(dt);
      const L = nlay(w, h);
      const { u, big } = L;
      netBg(g, w, h, u);
      statusLine(g, L, '둘 다 ⑤ 칸을 거의 동시에!', '#ffb547');
      const gap = 4 * u;
      const s2 = Math.min(L.bs * 0.62, (L.colW - L.pad - gap) / 2);
      const y0 = L.by + (big ? 10 : 7) * u;
      const lx = L.pad + (L.colW - L.pad - (s2 * 2 + gap)) / 2;
      drawBoard(g, lx, y0, s2, me, net.now, u * 0.75, '내 화면', ME_COL);
      drawBoard(g, lx + s2 + gap, y0, s2, op, net.now, u * 0.75, '상대 화면', OPP_COL);
      // 서버 순서표
      const ty = y0 + s2 + (big ? 10 : 7) * u;
      const rowH = (big ? 15 : 10.5) * u;
      const tw = s2 * 2 + gap;
      panel(g, lx, ty, tw, rowH * 2.9, 4 * u);
      const fp = (big ? 7.6 : 5.6) * u;
      txt(g, '서버 도착 순서', lx + 4 * u, ty + rowH * 0.5, fp, SRV_COL, 'left', 800);
      txt(g, '보냄 → 도착', lx + tw - 4 * u, ty + rowH * 0.5, fp, '#6f7a99', 'right');
      order.forEach((o, i) => {
        const yy = ty + rowH * (1.4 + i * 0.95);
        txt(g, `#${i + 1} ${o.who}`, lx + 4 * u, yy, fp, o.col, 'left', 800);
        txt(g, `${(o.sent % 100).toFixed(2)}s → ${(o.got % 100).toFixed(2)}s`, lx + tw * 0.62, yy, fp * 0.95, '#c9d2ee', 'center');
        txt(g, o.ok ? '차지 ✓' : '거절 ✕', lx + tw - 4 * u, yy, fp, o.ok ? OK_COL : BAD_COL, 'right', 800);
      });
      if (big) txt(g, '먼저 「보낸」 쪽이 아니라 서버에 먼저 「도착한」 쪽이 이긴다 — 서버 하나가 순서를 정해야 두 화면이 같아진다', L.pad, h - L.pad * 0.7, 8 * u, '#8d97b8');
      drawSeq(g, L.sx, L.sy, L.sw, L.sh - (big ? 14 * u : 0), net, u, big);
    },
  };
}

// ═════════════════════ i443 상대 상태 ═════════════════════

type Pres = 'watch' | 'think' | 'away' | 'gone';
const PRES: Record<Pres, { label: string; col: string }> = {
  watch: { label: '보는 중', col: '#7dffb2' },
  think: { label: '생각 중', col: '#ffd36b' },
  away: { label: '자리 비움', col: '#8d97b8' },
  gone: { label: '나감', col: '#ff5d6c' },
};

function demoPresence(): Made {
  const net = new Net();
  const lat = { v: 200 };
  let showHover = true;
  const me = new Board();
  let seen: Pres = 'watch';
  let real: Pres = 'watch';
  let alive = true;
  let lastBeat = 0;
  let goneAt = -1;
  let hoverTarget = -1;
  let hoverMove = 0;
  const tell = (p: Pres, label: string): void => {
    real = p;
    const L = lat.v / 1000;
    net.send(2, 1, L, label, PRES[p].col, () => {
      net.send(1, 0, L, label, PRES[p].col, () => (seen = p));
    });
  };
  const leave = (): void => {
    if (!alive) return;
    alive = false;
    real = 'gone';
    net.mark(2, '창 닫음', BAD_COL);
    net.spans.push({ lane: 2, t0: net.now, t1: net.now + 2.2, col: BAD_COL });
    // 서버가 끊김을 알아챔 (Firebase onDisconnect 처럼)
    net.after(lat.v / 1000 + 0.6, () => {
      net.mark(1, '끊김 감지', BAD_COL);
      net.send(1, 0, lat.v / 1000, '상대 나감', BAD_COL, () => {
        seen = 'gone';
        goneAt = net.now;
      });
    });
  };
  const run = (): void => {
    net.restart();
    me.clear();
    me.set(4, 'X', false, -9);
    me.set(0, 'O', false, -9);
    me.set(8, 'X', false, -9);
    alive = true;
    goneAt = -1;
    if (seen !== 'watch' || real !== 'watch') {
      net.mark(2, '다시 들어옴', OK_COL);
      tell('watch', '들어옴');
    }
    real = 'watch';
    net.after(1.2, () => tell('think', '생각 중…'));
    net.after(3.4, () => {
      const L = lat.v / 1000;
      real = 'watch';
      net.send(2, 1, L, 'O → ③', OPP_COL, () => net.send(1, 0, L, 'O → ③', OPP_COL, () => {
        me.set(2, 'O', false, net.now);
        seen = 'watch';
      }));
    });
    net.after(4.8, () => tell('away', '자리 비움'));
    net.after(6.4, leave);
    net.after(9.2, run);
  };
  run();
  return {
    controls: [
      latControl(lat),
      { type: 'toggle', label: '상대가 보는 칸 보여 주기', value: true, on: (v) => (showHover = v) },
      { type: 'button', label: '상대 나가기', on: leave },
      { type: 'button', label: '처음부터', on: () => run() },
    ],
    draw(g, w, h, _t, dt) {
      reset(g);
      net.step(dt);
      const dd = Math.min(dt, 0.1);
      // 숨결(하트비트): 연결된 동안 0.8초마다
      if (alive && net.now - lastBeat > 0.8) {
        lastBeat = net.now;
        net.send(2, 1, lat.v / 1000, '♥', '#ff9db8');
      }
      // 생각 중: 마우스가 칸 위를 돌아다님
      hoverMove -= dd;
      if (seen === 'think') {
        if (hoverMove <= 0) {
          const empty = [1, 2, 3, 5, 6, 7];
          hoverTarget = empty[Math.floor(Math.random() * empty.length)]!;
          hoverMove = 0.55;
        }
        me.hover = showHover ? hoverTarget : -1;
      } else me.hover = -1;
      const L = nlay(w, h);
      const { u, big } = L;
      netBg(g, w, h, u);
      // 상대 카드
      const cx = L.pad;
      const cy = L.pad;
      const cw = L.colW - L.pad;
      const ch = (big ? 34 : 22) * u;
      panel(g, cx, cy, cw, ch, 5 * u);
      const st = PRES[seen];
      const ar = ch * 0.32;
      const ax = cx + ar + 5 * u;
      const ay = cy + ch / 2;
      g.globalAlpha = seen === 'gone' ? 0.35 : seen === 'away' ? 0.6 : 1;
      g.fillStyle = hexA(OPP_COL, 0.25);
      g.beginPath();
      g.arc(ax, ay, ar, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = OPP_COL;
      g.beginPath();
      g.arc(ax, ay - ar * 0.2, ar * 0.38, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(ax, ay + ar * 0.85, ar * 0.65, Math.PI, 0);
      g.fill();
      g.globalAlpha = 1;
      // 상태 점
      const pulse = seen === 'watch' || seen === 'think' ? 0.5 + 0.5 * Math.sin(net.now * 5) : 0;
      g.fillStyle = hexA(st.col, 0.3 * pulse);
      g.beginPath();
      g.arc(ax + ar * 0.75, ay + ar * 0.7, ar * 0.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = st.col;
      g.strokeStyle = '#0b1222';
      g.lineWidth = 1.5 * u;
      g.beginPath();
      g.arc(ax + ar * 0.75, ay + ar * 0.7, ar * 0.3, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      const nx = ax + ar + 6 * u;
      txt(g, '상대 · 민지', nx, ay - ch * 0.17, (big ? 9 : 6.6) * u, '#e6ebff', 'left', 800);
      let line = st.label;
      if (seen === 'think') line += ' ' + '•••'.slice(0, 1 + (Math.floor(net.now * 3) % 3));
      if (seen === 'gone' && goneAt > 0) line += ` · ${Math.max(0, Math.ceil(20 - (net.now - goneAt) * 6))}초 뒤 기권승`;
      txt(g, line, nx, ay + ch * 0.2, (big ? 8 : 6) * u, st.col, 'left', 700);
      // 판
      const by = cy + ch + (big ? 10 : 6) * u;
      const bs = Math.min(L.colW - L.pad, h - by - L.pad - (big ? 18 : 10) * u);
      const bx = L.pad + (L.colW - L.pad - bs) / 2;
      drawBoard(g, bx, by, bs, me, net.now, u * 0.85);
      if (seen === 'gone') {
        rr(g, bx, by, bs, bs, 6 * u);
        g.fillStyle = 'rgba(6,8,16,0.55)';
        g.fill();
        txt(g, '상대가 나갔어요', bx + bs / 2, by + bs / 2, (big ? 10 : 7) * u, '#ffb0b8', 'center', 800);
      }
      const leg = (big ? 7.4 : 5.4) * u;
      let lx = L.pad;
      const ly = by + bs + (big ? 6 : 3) * u;
      for (const k of ['watch', 'think', 'away', 'gone'] as Pres[]) {
        g.fillStyle = PRES[k].col;
        g.globalAlpha = k === seen ? 1 : 0.4;
        g.beginPath();
        g.arc(lx + leg * 0.4, ly + leg * 0.6, leg * 0.35, 0, Math.PI * 2);
        g.fill();
        g.font = font(leg, 700);
        txt(g, PRES[k].label, lx + leg, ly + leg * 0.62, leg, PRES[k].col, 'left', 700);
        lx += leg * 1.4 + g.measureText(PRES[k].label).width + 3 * u;
        g.globalAlpha = 1;
      }
      void real;
      drawSeq(g, L.sx, L.sy, L.sw, L.sh, net, u, big);
    },
  };
}

// ═════════════════════ 목록 ═════════════════════

export const DEMOS: DemoMap = {
  i435: { kind: '2d', caption: '같은 박자 위에 북 · 베이스 · 화음 · 멜로디 층을 상황마다 켜고 끈다 — 2마디마다 분위기가 바뀜', make: demoLayers },
  i436: { kind: '2d', caption: '남은 시간이 줄수록 빨라지고 · 밝아지고 · 음이 올라가고 · 층이 늘어나는 음악', make: demoTension },
  i437: { kind: '2d', caption: '안내 말소리가 나오는 동안 배경음악 음량을 쑥 낮췄다가 천천히 되돌림', make: demoDuck },
  i438: { kind: '2d', caption: '공이 땅에 닿는 순간 · 별 터짐을 음악 박자 시계에 맞춰 예약 — 끄면 어긋난다', make: demoBeat },
  i439: { kind: '2d', caption: '내 수는 누르자마자 흐리게 보이고 서버 확인이 오면 진해짐 — 거절되면 되돌린다', make: demoPredict },
  i440: { kind: '2d', caption: '끊긴 사이 놓친 수 ✕ → 다시 접속하면 서버에서 판 전체 · 차례를 받아 이어 한다', make: demoReconnect },
  i441: { kind: '2d', caption: '핑 · 퐁으로 내 기기 시계와 서버 시계 차이를 재서 남은 시간을 맞춘다 — 초과하면 서버가 자동 처리', make: demoClock },
  i442: { kind: '2d', caption: '둘이 거의 동시에 같은 칸 — 서버에 먼저 도착한 수만 받고, 늦은 쪽은 거절 · 되돌림', make: demoRace },
  i443: { kind: '2d', caption: '상대의 숨결(♥) · 상태 신호로 보는 중 · 생각 중 · 자리 비움 · 나감을 점과 글로', make: demoPresence },
};

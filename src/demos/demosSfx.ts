import type { Control, Demo2D, DemoMap } from './types';

/**
 * 「효과음 (SFX)」 견본 (i128 ~ i169) — 소리 파일 없이 Web Audio 로 바로 합성한다.
 *
 * - 카드는 소리를 내지 않는다. 대신 같은 조리법(recipe)을 OfflineAudioContext 로 한 번 그려 얻은
 *   파형 · 스펙트로그램(소리의 모양)을 그리고, 재생 위치 막대가 지나가며 작은 그림이 소리에 맞춰 움직인다.
 * - 자세히 보기의 「▶ 소리 듣기」를 눌러야 진짜 소리가 난다. 그때는 AnalyserNode 로 실시간 파형 · 스펙트럼도 보인다.
 * - 모든 견본은 하나의 AudioContext(처음 누를 때 만들고 resume) → 견본별 버스 → 주 음량 0.35 → 리미터(압축기) 를 쓴다.
 *   dispose 에서 버스를 끊고 반복 소리는 모두 멈춘다.
 */

type G = CanvasRenderingContext2D;
type BA = BaseAudioContext;
type P = Record<string, number>;
type Rnd = () => number;
/** 조리법: c 에서 out 으로 t0 부터 소리를 짠다 (실시간 · 오프라인 모두) */
type Rec = (c: BA, out: AudioNode, t0: number, p: P, r: Rnd) => void;

const F = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
const MONO = 'ui-monospace, Consolas, "Courier New", monospace';
const TAU = Math.PI * 2;
const clamp = (x: number, a = 0, b = 1): number => (x < a ? a : x > b ? b : x);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const st2 = (n: number): number => Math.pow(2, n / 12);
const easeOut = (x: number): number => 1 - Math.pow(1 - clamp(x), 3);
const easeIO = (x: number): number => {
  const v = clamp(x);
  return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
};
function rng(seed: number): Rnd {
  let s = Math.abs(Math.floor(seed * 9301 + 49297)) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
function hash(i: number): number {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ 0x165667b1;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

// ═════════════════════ 소리 엔진 ═════════════════════

let AC: AudioContext | null = null;
let MASTER: GainNode | null = null;
let ANA: AnalyserNode | null = null;
let LIMIT: DynamicsCompressorNode | null = null;

/** 공용 AudioContext — 처음 누를 때 만들고 매번 resume (자동 재생 막힘 풀기) */
function audio(): AudioContext {
  if (!AC) {
    AC = new AudioContext({ latencyHint: 'interactive' });
    MASTER = AC.createGain();
    MASTER.gain.value = 0.35;
    LIMIT = AC.createDynamicsCompressor();
    LIMIT.threshold.value = -10;
    LIMIT.knee.value = 6;
    LIMIT.ratio.value = 12;
    LIMIT.attack.value = 0.003;
    LIMIT.release.value = 0.15;
    ANA = AC.createAnalyser();
    ANA.fftSize = 2048;
    ANA.smoothingTimeConstant = 0.6;
    MASTER.connect(LIMIT);
    LIMIT.connect(ANA);
    ANA.connect(AC.destination);
  }
  if (AC.state === 'suspended') void AC.resume();
  return AC;
}

/** 견본 하나의 소리 길 — 끊으면 그 견본 소리가 모두 멈춘다 */
class Bus {
  g: GainNode | null = null;
  stops: (() => void)[] = [];
  level = 1;
  node(): GainNode {
    const ac = audio();
    if (!this.g) {
      this.g = ac.createGain();
      this.g.gain.value = this.level;
      this.g.connect(MASTER!);
    }
    return this.g;
  }
  onStop(f: () => void): void {
    this.stops.push(f);
  }
  stopAll(): void {
    for (const f of this.stops) {
      try {
        f();
      } catch {
        /* 이미 멈춤 */
      }
    }
    this.stops = [];
  }
  kill(): void {
    this.stopAll();
    if (this.g && AC) {
      try {
        this.g.gain.cancelScheduledValues(AC.currentTime);
        this.g.gain.setValueAtTime(0, AC.currentTime);
        this.g.disconnect();
      } catch {
        /* 무시 */
      }
    }
    this.g = null;
  }
}

const NOISE = new WeakMap<BA, AudioBuffer>();
function noiseBuf(c: BA): AudioBuffer {
  let b = NOISE.get(c);
  if (b) return b;
  b = c.createBuffer(1, Math.floor(c.sampleRate * 2), c.sampleRate);
  const d = b.getChannelData(0);
  const r = rng(7);
  for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
  NOISE.set(c, b);
  return b;
}
const BROWN = new WeakMap<BA, AudioBuffer>();
/** 갈색 잡음 (낮은 소리 쪽이 큰 잡음 — 불 · 바람 · 엔진 바닥) */
function brownBuf(c: BA): AudioBuffer {
  let b = BROWN.get(c);
  if (b) return b;
  b = c.createBuffer(1, Math.floor(c.sampleRate * 3), c.sampleRate);
  const d = b.getChannelData(0);
  const r = rng(11);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    last = (last + 0.02 * (r() * 2 - 1)) / 1.02;
    d[i] = last * 3.5;
  }
  BROWN.set(c, b);
  return b;
}
function noise(c: BA, t0: number, dur: number, r: Rnd = Math.random, brown = false): AudioBufferSourceNode {
  const s = c.createBufferSource();
  s.buffer = brown ? brownBuf(c) : noiseBuf(c);
  s.loop = true;
  s.start(t0, r() * 1.5);
  if (dur > 0) s.stop(t0 + dur + 0.05);
  return s;
}
function osc(c: BA, type: OscillatorType, f: number, t0: number, dur: number): OscillatorNode {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  o.start(t0);
  if (dur > 0) o.stop(t0 + dur + 0.05);
  return o;
}
/** 소리 크기 봉투: 0 → peak (a 초) → hold → 지수로 사라짐 (d 초). out 에 이어 둔 GainNode 를 돌려준다 */
function envG(c: BA, out: AudioNode, t0: number, a: number, hold: number, d: number, peak: number): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + Math.max(0.0005, a));
  g.gain.setValueAtTime(peak, t0 + a + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + hold + d);
  g.connect(out);
  return g;
}
function gainN(c: BA, v: number): GainNode {
  const g = c.createGain();
  g.gain.value = v;
  return g;
}
function filt(c: BA, type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode {
  const b = c.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  return b;
}
function shaper(c: BA, k: number): WaveShaperNode {
  const w = c.createWaveShaper();
  const n = 1024;
  const cv = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    cv[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  w.curve = cv;
  w.oversample = '2x';
  return w;
}
function pan(c: BA, v: number): StereoPannerNode {
  const p = c.createStereoPanner();
  p.pan.value = v;
  return p;
}
function chain(...n: AudioNode[]): void {
  for (let i = 0; i < n.length - 1; i++) n[i]!.connect(n[i + 1]!);
}
/** 짧은 사인 「삑」 하나 */
function tone(c: BA, out: AudioNode, t0: number, f: number, d: number, peak: number, type: OscillatorType = 'sine', a = 0.003): OscillatorNode {
  const o = osc(c, type, Math.min(f, c.sampleRate * 0.45), t0, a + d);
  o.connect(envG(c, out, t0, a, 0, d, peak));
  return o;
}
/** 지수 감쇠 잡음 잔향 (코드로 만든 IR) */
function makeIR(c: BA, sec: number, seed = 3): AudioBuffer {
  const len = Math.max(1, Math.floor(c.sampleRate * sec));
  const b = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    const r = rng(seed + ch * 17);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const x = i / len;
      const k = 0.15 + 0.8 * x; // 뒤로 갈수록 먹먹하게 (고역이 먼저 사라짐)
      lp = lp + (1 - k) * ((r() * 2 - 1) - lp);
      d[i] = lp * Math.pow(1 - x, 2.2) * Math.exp(-x * 3);
    }
  }
  return b;
}

// ═════════════════════ 소리 모양 그리기 (오프라인) ═════════════════════

interface Prev {
  dur: number;
  peaks: Float32Array; // [min, max] × 300
  env: Float32Array; // 300
  spec: HTMLCanvasElement;
  lanes?: { name: string; color: string; peaks: Float32Array }[];
}
const NB = 300;
const PREV = new Map<string, Promise<Prev>>();

function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const tr = re[b]! * cr - im[b]! * ci;
        const ti = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a] = re[a]! + tr;
        im[a] = im[a]! + ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}
const CMAP = ['#06061a', '#24104f', '#5a1a85', '#a72d7f', '#e8526a', '#fb8f4f', '#fdd36a', '#fffbe0'].map((c) => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
});
function cmap(v: number): [number, number, number] {
  const x = clamp(v) * (CMAP.length - 1);
  const i = Math.min(CMAP.length - 2, Math.floor(x));
  const f = x - i;
  const a = CMAP[i]!;
  const b = CMAP[i + 1]!;
  return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];
}
function peaksOf(d: Float32Array): Float32Array {
  const pk = new Float32Array(NB * 2);
  const per = d.length / NB;
  for (let b = 0; b < NB; b++) {
    let mn = 0;
    let mx = 0;
    const s = Math.floor(b * per);
    const e = Math.min(d.length, Math.floor((b + 1) * per) + 1);
    for (let i = s; i < e; i++) {
      const v = d[i]!;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    pk[b * 2] = mn;
    pk[b * 2 + 1] = mx;
  }
  return pk;
}
function analyze(d: Float32Array, sr: number, dur: number, lo: number): Prev {
  // 크기 맞추기 (작은 소리도 모양이 보이게)
  let m = 0;
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]!));
  const sc = m > 1e-5 ? 0.95 / m : 1;
  const nd = new Float32Array(d.length);
  for (let i = 0; i < d.length; i++) nd[i] = d[i]! * sc;
  const peaks = peaksOf(nd);
  const env = new Float32Array(NB);
  for (let b = 0; b < NB; b++) env[b] = Math.max(Math.abs(peaks[b * 2]!), Math.abs(peaks[b * 2 + 1]!));
  // 스펙트로그램 (가로 = 시간, 세로 = 로그 주파수)
  const N = 1024;
  const cols = 200;
  const rows = 80;
  const hi = Math.min(11000, sr / 2);
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  const mags = new Float32Array(cols * rows);
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((TAU * i) / (N - 1));
  const hop = Math.max(1, (nd.length - N / 2) / cols);
  let maxDb = -200;
  for (let cI = 0; cI < cols; cI++) {
    const s0 = Math.floor(cI * hop) - N / 2;
    for (let i = 0; i < N; i++) {
      const j = s0 + i;
      re[i] = j >= 0 && j < nd.length ? nd[j]! * win[i]! : 0;
      im[i] = 0;
    }
    fft(re, im);
    for (let r = 0; r < rows; r++) {
      const f0 = lo * Math.pow(hi / lo, r / rows);
      const f1 = lo * Math.pow(hi / lo, (r + 1) / rows);
      const b0 = (f0 / sr) * N;
      const b1 = Math.max(b0 + 0.01, (f1 / sr) * N);
      let mag = 0;
      if (b1 - b0 < 1) {
        const bi = Math.floor(b0);
        const fr = b0 - bi;
        const m0 = Math.hypot(re[bi]!, im[bi]!);
        const m1 = Math.hypot(re[bi + 1] ?? 0, im[bi + 1] ?? 0);
        mag = lerp(m0, m1, fr);
      } else {
        for (let bi = Math.floor(b0); bi <= Math.ceil(b1) && bi < N / 2; bi++) mag = Math.max(mag, Math.hypot(re[bi]!, im[bi]!));
      }
      const db = 20 * Math.log10(mag + 1e-9);
      mags[cI * rows + r] = db;
      if (db > maxDb) maxDb = db;
    }
  }
  const spec = document.createElement('canvas');
  spec.width = cols;
  spec.height = rows;
  const sg = spec.getContext('2d')!;
  const img = sg.createImageData(cols, rows);
  const range = 72;
  for (let cI = 0; cI < cols; cI++) {
    for (let r = 0; r < rows; r++) {
      const v = (mags[cI * rows + r]! - (maxDb - range)) / range;
      const [R, Gc, B] = cmap(Math.pow(clamp(v), 1.25));
      const o = ((rows - 1 - r) * cols + cI) * 4;
      img.data[o] = R;
      img.data[o + 1] = Gc;
      img.data[o + 2] = B;
      img.data[o + 3] = 255;
    }
  }
  sg.putImageData(img, 0, 0);
  return { dur, peaks, env, spec };
}
async function renderBuf(rec: Rec, dur: number, p: P, seed: number, sr = 22050): Promise<Float32Array> {
  const oc = new OfflineAudioContext(1, Math.max(64, Math.ceil(sr * dur)), sr);
  const g = oc.createGain();
  g.connect(oc.destination);
  rec(oc, g, 0.002, p, rng(seed));
  const buf = await oc.startRendering();
  return buf.getChannelData(0);
}
interface Layer {
  name: string;
  color: string;
  key: string;
  rec: Rec;
}
function getPrev(id: string, rec: Rec, dur: number, p: P, lo: number, layers?: Layer[]): Promise<Prev> {
  const key = id + JSON.stringify(p);
  const hit = PREV.get(key);
  if (hit) return hit;
  const pr = (async (): Promise<Prev> => {
    const d = await renderBuf(rec, dur, p, 5);
    const pv = analyze(d, 22050, dur, lo);
    if (layers) {
      pv.lanes = [];
      for (const L of layers) {
        const ld = await renderBuf(L.rec, dur, p, 5);
        pv.lanes.push({ name: L.name, color: L.color, peaks: peaksOf(ld) });
      }
    }
    return pv;
  })();
  if (PREV.size > 120) {
    const first = PREV.keys().next().value;
    if (first !== undefined) PREV.delete(first);
  }
  PREV.set(key, pr);
  return pr;
}

// ═════════════════════ 그리기 도구 ═════════════════════

function reset(g: G): void {
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.lineWidth = 1;
  g.setLineDash([]);
  g.shadowBlur = 0;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.imageSmoothingEnabled = true;
}
function rr(g: G, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, Math.max(0, w), Math.max(0, h), Math.max(0, Math.min(r, w / 2, h / 2)));
}
function txt(g: G, s: string, x: number, y: number, size: number, color = '#fff', align: CanvasTextAlign = 'center', weight = 700, font = F): void {
  g.font = `${weight} ${size}px ${font}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(s, x, y);
}
function circ(g: G, x: number, y: number, r: number): void {
  g.beginPath();
  g.arc(x, y, Math.max(0, r), 0, TAU);
}
function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function star(g: G, x: number, y: number, r: number, n = 5, inner = 0.45, rot = -Math.PI / 2): void {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const rad = i % 2 ? r * inner : r;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i) g.lineTo(px, py);
    else g.moveTo(px, py);
  }
  g.closePath();
}
function sparkle(g: G, x: number, y: number, r: number, color = '#fff8d0'): void {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x, y - r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.quadraticCurveTo(x, y, x, y + r);
  g.quadraticCurveTo(x, y, x - r, y);
  g.quadraticCurveTo(x, y, x, y - r);
  g.fill();
}
/** 눈 · 입 있는 작은 얼굴 (블록 캐릭터) */
function eyes(g: G, x: number, y: number, s: number, blink = false): void {
  g.fillStyle = '#1b1530';
  if (blink) {
    g.fillRect(x - s * 0.42, y - s * 0.03, s * 0.26, s * 0.07);
    g.fillRect(x + s * 0.16, y - s * 0.03, s * 0.26, s * 0.07);
  } else {
    circ(g, x - s * 0.28, y, s * 0.11);
    g.fill();
    circ(g, x + s * 0.28, y, s * 0.11);
    g.fill();
    g.fillStyle = '#fff';
    circ(g, x - s * 0.25, y - s * 0.04, s * 0.04);
    g.fill();
    circ(g, x + s * 0.31, y - s * 0.04, s * 0.04);
    g.fill();
  }
}
function blob(g: G, x: number, y: number, s: number, color: string, sx = 1, sy = 1, mood: 'happy' | 'ouch' | 'calm' = 'calm'): void {
  g.save();
  g.translate(x, y);
  g.scale(sx, sy);
  const gr = g.createLinearGradient(0, -s, 0, s);
  gr.addColorStop(0, rgba(color, 1));
  gr.addColorStop(1, shade(color, -0.25));
  rr(g, -s, -s, s * 2, s * 2, s * 0.55);
  g.fillStyle = gr;
  g.fill();
  g.lineWidth = s * 0.12;
  g.strokeStyle = 'rgba(20,10,40,0.55)';
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.35)';
  rr(g, -s * 0.7, -s * 0.82, s * 0.8, s * 0.28, s * 0.14);
  g.fill();
  if (mood === 'ouch') {
    g.strokeStyle = '#1b1530';
    g.lineWidth = s * 0.1;
    for (const ex of [-0.3, 0.3]) {
      g.beginPath();
      g.moveTo(s * (ex - 0.12), -s * 0.12);
      g.lineTo(s * (ex + 0.12), s * 0.08);
      g.moveTo(s * (ex + 0.12), -s * 0.12);
      g.lineTo(s * (ex - 0.12), s * 0.08);
      g.stroke();
    }
    g.beginPath();
    g.ellipse(0, s * 0.42, s * 0.16, s * 0.12, 0, 0, TAU);
    g.fillStyle = '#1b1530';
    g.fill();
  } else {
    eyes(g, 0, -s * 0.05, s, false);
    g.strokeStyle = '#1b1530';
    g.lineWidth = s * 0.09;
    g.beginPath();
    if (mood === 'happy') g.arc(0, s * 0.2, s * 0.22, 0.15 * Math.PI, 0.85 * Math.PI);
    else g.arc(0, s * 0.22, s * 0.14, 0.2 * Math.PI, 0.8 * Math.PI);
    g.stroke();
    g.fillStyle = 'rgba(255,120,150,0.55)';
    circ(g, -s * 0.55, s * 0.22, s * 0.12);
    g.fill();
    circ(g, s * 0.55, s * 0.22, s * 0.12);
    g.fill();
  }
  g.restore();
}
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number): number => Math.round(clamp(k < 0 ? v * (1 + k) : v + (255 - v) * k, 0, 255));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
function coin(g: G, x: number, y: number, r: number, spin = 1, face = '★'): void {
  const sx = Math.max(0.12, Math.abs(spin));
  g.save();
  g.translate(x, y);
  g.fillStyle = '#9a5b12';
  g.beginPath();
  g.ellipse(r * 0.1 * Math.sign(spin || 1), r * 0.06, r * sx, r, 0, 0, TAU);
  g.fill();
  const gr = g.createLinearGradient(-r, -r, r, r);
  gr.addColorStop(0, '#fff2a8');
  gr.addColorStop(0.45, '#ffc93a');
  gr.addColorStop(1, '#d98a12');
  g.fillStyle = gr;
  g.beginPath();
  g.ellipse(0, 0, r * sx, r, 0, 0, TAU);
  g.fill();
  g.strokeStyle = 'rgba(150,80,10,0.8)';
  g.lineWidth = r * 0.1;
  g.beginPath();
  g.ellipse(0, 0, r * 0.74 * sx, r * 0.74, 0, 0, TAU);
  g.stroke();
  if (sx > 0.45) {
    g.scale(sx, 1);
    txt(g, face, 0, r * 0.04, r * 0.95, 'rgba(160,85,10,0.9)', 'center', 900);
  }
  g.restore();
}
function flatCoin(g: G, x: number, y: number, r: number): void {
  g.fillStyle = '#a8650e';
  g.beginPath();
  g.ellipse(x, y + r * 0.16, r, r * 0.36, 0, 0, TAU);
  g.fill();
  const gr = g.createLinearGradient(x - r, y, x + r, y);
  gr.addColorStop(0, '#ffe27a');
  gr.addColorStop(0.5, '#fff4b8');
  gr.addColorStop(1, '#e09a1c');
  g.fillStyle = gr;
  g.beginPath();
  g.ellipse(x, y, r, r * 0.36, 0, 0, TAU);
  g.fill();
  g.strokeStyle = 'rgba(150,80,10,0.6)';
  g.lineWidth = r * 0.08;
  g.beginPath();
  g.ellipse(x, y, r * 0.7, r * 0.24, 0, 0, TAU);
  g.stroke();
}
function speaker(g: G, x: number, y: number, s: number, lit: number, color = '#7cc8ff'): void {
  g.save();
  g.translate(x, y);
  rr(g, -s * 0.6, -s * 0.9, s * 1.2, s * 1.8, s * 0.2);
  const gr = g.createLinearGradient(0, -s, 0, s);
  gr.addColorStop(0, '#3a3560');
  gr.addColorStop(1, '#221d40');
  g.fillStyle = gr;
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  g.lineWidth = s * 0.06;
  g.stroke();
  const pump = 1 + lit * 0.12;
  for (const [cy, rr0] of [
    [-s * 0.45, s * 0.22],
    [s * 0.28, s * 0.42 * pump],
  ] as const) {
    circ(g, 0, cy, rr0);
    g.fillStyle = '#120f26';
    g.fill();
    circ(g, 0, cy, rr0 * 0.45);
    g.fillStyle = rgba(color, 0.4 + lit * 0.6);
    g.fill();
  }
  g.restore();
}
function waves(g: G, x: number, y: number, r0: number, n: number, k: number, color: string, spread = 0.7, dir = 0): void {
  for (let i = 0; i < n; i++) {
    const ph = (k + i / n) % 1;
    const r = r0 + ph * r0 * 2.2;
    g.strokeStyle = rgba(color, (1 - ph) * 0.85);
    g.lineWidth = Math.max(1, r0 * 0.14);
    g.beginPath();
    g.arc(x, y, r, dir - spread, dir + spread);
    g.stroke();
  }
}

// ═════════════════════ 한 번 재생 견본 틀 ═════════════════════

interface PRange {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
}
interface PToggle {
  key: string;
  label: string;
  toggle: true;
  value: boolean;
}
type PDef = PRange | PToggle;
interface ShotApi {
  p: P;
  st: Record<string, number>;
  /** 실시간 재생 (rec 생략 = 기본 조리법) */
  play(rec?: Rec, dur?: number): void;
  refresh(): void;
  bus: Bus;
}
interface Shot {
  caption: string;
  /** 소리 이름 (의성어) */
  title: string;
  color: string;
  dur: number | ((p: P) => number);
  params?: PDef[];
  rec: Rec;
  /** 그림에 쓰는 조리법 (없으면 rec) */
  preview?: Rec;
  previewDur?: number | ((p: P) => number);
  /** 100 칸 상자 가운데(0,0) 기준 그림. k = 소리 진행 (0..1, 끝난 뒤 > 1) */
  icon: (g: G, k: number, t: number, p: P, st: Record<string, number>) => void;
  extra?: (api: ShotApi) => Control[];
  layers?: Layer[];
  /** 스펙트로그램 아래 끝 주파수 */
  lo?: number;
  playLabel?: string;
  /** 오른쪽 위 작은 설명 */
  note?: (p: P) => string;
}
const isT = (d: PDef): d is PToggle => 'toggle' in d;
const durOf = (d: number | ((p: P) => number), p: P): number => (typeof d === 'number' ? d : d(p));

/** 오른쪽 그림 칸 배치 */
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Lay {
  u: number;
  big: boolean;
  scene: Box;
  spec: Box;
  wave: Box;
  live: Box | null;
}
function layout(w: number, h: number): Lay {
  const big = w > 420;
  const u = Math.min(w / 280, h / 175) * (big ? 0.62 : 1);
  const pad = (big ? 14 : 7) * Math.min(w / 280, h / 175) * (big ? 0.6 : 1);
  const sw = big ? w * 0.3 : w * 0.37;
  const scene = { x: pad, y: pad, w: sw - pad, h: h - 2 * pad };
  const rx = scene.x + scene.w + pad;
  const rw = w - rx - pad;
  const ah = h - 2 * pad;
  if (!big) {
    return { u, big, scene, spec: { x: rx, y: pad, w: rw, h: ah * 0.58 }, wave: { x: rx, y: pad + ah * 0.62, w: rw, h: ah * 0.38 }, live: null };
  }
  return {
    u,
    big,
    scene,
    spec: { x: rx, y: pad, w: rw, h: ah * 0.4 },
    wave: { x: rx, y: pad + ah * 0.43, w: rw, h: ah * 0.22 },
    live: { x: rx, y: pad + ah * 0.68, w: rw, h: ah * 0.32 },
  };
}
function bgDark(g: G, w: number, h: number, color: string, t: number): void {
  const gr = g.createLinearGradient(0, 0, w, h);
  gr.addColorStop(0, '#120f24');
  gr.addColorStop(1, '#1b1433');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  const rg = g.createRadialGradient(w * 0.18, h * 0.55, 0, w * 0.18, h * 0.55, Math.max(w, h) * 0.6);
  rg.addColorStop(0, rgba(color, 0.16 + 0.03 * Math.sin(t * 1.3)));
  rg.addColorStop(1, rgba(color, 0));
  g.fillStyle = rg;
  g.fillRect(0, 0, w, h);
}
function panel(g: G, b: Box, u: number, color: string, a = 0.05): void {
  rr(g, b.x, b.y, b.w, b.h, 8 * u);
  g.fillStyle = `rgba(255,255,255,${a})`;
  g.fill();
  g.strokeStyle = rgba(color, 0.22);
  g.lineWidth = Math.max(1, u);
  g.stroke();
}
function drawSpec(g: G, b: Box, u: number, pv: Prev | null, color: string, lo: number): void {
  g.save();
  rr(g, b.x, b.y, b.w, b.h, 7 * u);
  g.fillStyle = '#06061a';
  g.fill();
  g.clip();
  if (pv) {
    g.imageSmoothingEnabled = true;
    g.drawImage(pv.spec, b.x, b.y, b.w, b.h);
  } else {
    txt(g, '소리 모양 그리는 중…', b.x + b.w / 2, b.y + b.h / 2, 9 * u, 'rgba(255,255,255,0.5)');
  }
  // 주파수 눈금
  const hi = 11000;
  g.font = `600 ${6.5 * u}px ${F}`;
  for (const f of [100, 1000, 5000]) {
    if (f < lo) continue;
    const y = b.y + b.h - (Math.log(f / lo) / Math.log(hi / lo)) * b.h;
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(b.x, y);
    g.lineTo(b.x + b.w, y);
    g.stroke();
    txt(g, f >= 1000 ? `${f / 1000}k` : `${f}`, b.x + 3 * u, y - 4 * u, 6.5 * u, 'rgba(255,255,255,0.55)', 'left', 600);
  }
  g.restore();
  rr(g, b.x, b.y, b.w, b.h, 7 * u);
  g.strokeStyle = rgba(color, 0.35);
  g.lineWidth = Math.max(1, u * 0.8);
  g.stroke();
}
function wavePath(g: G, b: Box, pk: Float32Array, ox: number, oy: number, hh: number): void {
  g.beginPath();
  for (let i = 0; i < NB; i++) g.lineTo(ox + (i / (NB - 1)) * b.w, oy - pk[i * 2 + 1]! * hh);
  for (let i = NB - 1; i >= 0; i--) g.lineTo(ox + (i / (NB - 1)) * b.w, oy - pk[i * 2]! * hh);
  g.closePath();
}
function drawWave(g: G, b: Box, u: number, pv: Prev | null, color: string, head: number): void {
  rr(g, b.x, b.y, b.w, b.h, 7 * u);
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.fill();
  if (!pv) return;
  g.save();
  rr(g, b.x, b.y, b.w, b.h, 7 * u);
  g.clip();
  if (pv.lanes && pv.lanes.length) {
    const n = pv.lanes.length;
    pv.lanes.forEach((L, i) => {
      const lh = b.h / n;
      const cy = b.y + lh * (i + 0.5);
      wavePath(g, b, L.peaks, b.x, cy, lh * 0.45);
      g.fillStyle = rgba(L.color, 0.85);
      g.fill();
      txt(g, L.name, b.x + b.w - 4 * u, cy - lh * 0.3, 7 * u, rgba(L.color, 1), 'right', 800);
    });
  } else {
    const cy = b.y + b.h / 2;
    const hh = b.h * 0.44;
    wavePath(g, b, pv.peaks, b.x, cy, hh);
    g.fillStyle = rgba(color, 0.28);
    g.fill();
    if (head >= 0 && head <= 1) {
      g.save();
      g.beginPath();
      g.rect(b.x, b.y, b.w * head, b.h);
      g.clip();
      wavePath(g, b, pv.peaks, b.x, cy, hh);
      const gr = g.createLinearGradient(0, b.y, 0, b.y + b.h);
      gr.addColorStop(0, shade(color, 0.45));
      gr.addColorStop(0.5, color);
      gr.addColorStop(1, shade(color, 0.45));
      g.fillStyle = gr;
      g.fill();
      g.restore();
    }
    g.strokeStyle = 'rgba(255,255,255,0.15)';
    g.beginPath();
    g.moveTo(b.x, cy);
    g.lineTo(b.x + b.w, cy);
    g.stroke();
  }
  g.restore();
}
function playhead(g: G, l: Lay, head: number, color: string): void {
  if (head < 0 || head > 1) return;
  const x = l.spec.x + l.spec.w * head;
  const y0 = l.spec.y - 2 * l.u;
  const y1 = l.wave.y + l.wave.h + 2 * l.u;
  g.save();
  g.shadowColor = color;
  g.shadowBlur = 8 * l.u;
  g.strokeStyle = '#ffffff';
  g.lineWidth = Math.max(1.2, 1.4 * l.u);
  g.beginPath();
  g.moveTo(x, y0);
  g.lineTo(x, y1);
  g.stroke();
  g.restore();
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(x - 4 * l.u, y0 - 3 * l.u);
  g.lineTo(x + 4 * l.u, y0 - 3 * l.u);
  g.lineTo(x, y0 + 3 * l.u);
  g.fill();
}
const LIVE_T = new Float32Array(2048);
const LIVE_F = new Uint8Array(1024);
/** 실시간 분석 (큰 화면) — 왼쪽 파형(오실로스코프) · 오른쪽 스펙트럼 막대 */
function drawLive(g: G, b: Box, u: number, color: string, label = '실시간 소리 · AnalyserNode'): number {
  panel(g, b, u, color, 0.04);
  txt(g, label, b.x + 8 * u, b.y + 9 * u, 8.5 * u, 'rgba(255,255,255,0.65)', 'left', 700);
  let level = 0;
  const ih = b.h - 22 * u;
  const iy = b.y + 18 * u;
  const hw = b.w * 0.48;
  if (!ANA) {
    txt(g, '▶ 소리 듣기를 누르면 여기서 실제 소리가 움직여요', b.x + b.w / 2, iy + ih / 2, 9 * u, 'rgba(255,255,255,0.45)');
    return 0;
  }
  ANA.getFloatTimeDomainData(LIVE_T);
  ANA.getByteFrequencyData(LIVE_F);
  // 파형
  const cy = iy + ih / 2;
  g.strokeStyle = 'rgba(255,255,255,0.1)';
  g.beginPath();
  g.moveTo(b.x + 8 * u, cy);
  g.lineTo(b.x + 8 * u + hw, cy);
  g.stroke();
  g.save();
  g.shadowColor = color;
  g.shadowBlur = 6 * u;
  g.strokeStyle = shade(color, 0.3);
  g.lineWidth = Math.max(1.2, 1.5 * u);
  g.beginPath();
  const n = 1024;
  for (let i = 0; i < n; i++) {
    const v = LIVE_T[i]!;
    level = Math.max(level, Math.abs(v));
    const x = b.x + 8 * u + (i / (n - 1)) * hw;
    const y = cy - clamp(v * 2.4, -1, 1) * ih * 0.48;
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  }
  g.stroke();
  g.restore();
  // 스펙트럼 (로그 주파수 막대)
  const sx = b.x + b.w * 0.53;
  const sw = b.w * 0.44;
  const bars = 48;
  const sr = AC ? AC.sampleRate : 48000;
  for (let i = 0; i < bars; i++) {
    const f0 = 40 * Math.pow(12000 / 40, i / bars);
    const f1 = 40 * Math.pow(12000 / 40, (i + 1) / bars);
    let m = 0;
    for (let bi = Math.floor((f0 / sr) * 2048); bi <= Math.ceil((f1 / sr) * 2048) && bi < 1024; bi++) m = Math.max(m, LIVE_F[bi]!);
    const v = m / 255;
    const bh = Math.max(1.5 * u, v * ih);
    const x = sx + (i / bars) * sw;
    const gr = g.createLinearGradient(0, iy + ih, 0, iy);
    gr.addColorStop(0, rgba(color, 0.5));
    gr.addColorStop(1, '#fff3c4');
    g.fillStyle = gr;
    rr(g, x, iy + ih - bh, sw / bars - 1.5 * u, bh, 1.5 * u);
    g.fill();
  }
  txt(g, '40Hz', sx, b.y + b.h - 4 * u, 6.5 * u, 'rgba(255,255,255,0.4)', 'left', 600);
  txt(g, '12k', sx + sw, b.y + b.h - 4 * u, 6.5 * u, 'rgba(255,255,255,0.4)', 'right', 600);
  return level;
}
function title(g: G, s: string, b: Box, u: number, color: string, pulse: number): void {
  const size = 12.5 * u * (1 + pulse * 0.12);
  g.save();
  g.translate(b.x + 9 * u, b.y + 13 * u);
  g.rotate(-0.05);
  g.font = `900 ${size}px ${F}`;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.lineWidth = 3.2 * u;
  g.strokeStyle = 'rgba(10,6,24,0.9)';
  g.strokeText(s, 0, 0);
  g.fillStyle = shade(color, 0.35 + pulse * 0.3);
  g.fillText(s, 0, 0);
  g.restore();
}

interface ShotFrame {
  color: string;
  title: string;
  prev: Prev | null;
  dur: number;
  /** 소리 진행 (0..1 이면 재생 위치 막대) */
  k: number;
  lo: number;
  live: boolean;
  note: string;
  icon: (g: G) => void;
  liveLabel?: string;
}
/** 한 번 소리 · 반복 소리 견본이 함께 쓰는 화면: 왼쪽 그림 칸 · 오른쪽 스펙트로그램 + 파형 · (큰 화면) 실시간 분석 */
function drawShot(g: G, w: number, h: number, t: number, o: ShotFrame): void {
  reset(g);
  const L = layout(w, h);
  const u = L.u;
  bgDark(g, w, h, o.color, t);
  const head = o.k >= 0 && o.k <= 1 ? o.k : -1;
  const envV = o.prev && head >= 0 ? o.prev.env[Math.min(NB - 1, Math.floor(head * NB))]! : 0;
  panel(g, L.scene, u, o.color, 0.045);
  const sc = L.scene;
  const rg = g.createRadialGradient(sc.x + sc.w / 2, sc.y + sc.h * 0.56, 0, sc.x + sc.w / 2, sc.y + sc.h * 0.56, sc.w * 0.6);
  rg.addColorStop(0, rgba(o.color, 0.1 + envV * 0.35));
  rg.addColorStop(1, rgba(o.color, 0));
  g.fillStyle = rg;
  g.fillRect(sc.x, sc.y, sc.w, sc.h);
  g.save();
  rr(g, sc.x, sc.y, sc.w, sc.h, 8 * u);
  g.clip();
  g.translate(sc.x + sc.w / 2, sc.y + sc.h * 0.57);
  const isz = Math.min(sc.w, sc.h * 0.78) / 100;
  g.scale(isz * 0.92, isz * 0.92);
  o.icon(g);
  g.restore();
  reset(g);
  title(g, o.title, sc, u, o.color, envV);
  txt(g, `${o.dur.toFixed(2)}초`, sc.x + sc.w - 7 * u, sc.y + sc.h - 8 * u, 7.5 * u, 'rgba(255,255,255,0.5)', 'right', 700, MONO);
  drawSpec(g, L.spec, u, o.prev, o.color, o.lo);
  drawWave(g, L.wave, u, o.prev, o.color, head);
  playhead(g, L, head, o.color);
  txt(g, '주파수 ↑  시간 →', L.spec.x + L.spec.w - 5 * u, L.spec.y + 8 * u, 6.8 * u, 'rgba(255,255,255,0.6)', 'right', 700);
  if (o.note) txt(g, o.note, L.spec.x + L.spec.w - 5 * u, L.spec.y + L.spec.h - 7 * u, 7 * u, 'rgba(255,255,255,0.8)', 'right', 700);
  if (L.live) {
    drawLive(g, L.live, u, o.color, o.liveLabel);
    if (o.live) txt(g, '● 재생 중', L.live.x + L.live.w - 8 * u, L.live.y + 9 * u, 8.5 * u, shade(o.color, 0.4), 'right', 800);
  }
}

function shotDemo(id: string, s: Shot): Demo2D {
  return {
    kind: '2d',
    caption: s.caption,
    make() {
      const p: P = {};
      for (const d of s.params ?? []) p[d.key] = isT(d) ? (d.value ? 1 : 0) : d.value;
      const st: Record<string, number> = {};
      const lo = s.lo ?? 60;
      let prev: Prev | null = null;
      let want = '';
      let timer = 0;
      const pRec = s.preview ?? s.rec;
      const pDur = (): number => durOf(s.previewDur ?? s.dur, p);
      const load = (): void => {
        const key = JSON.stringify(p);
        want = key;
        void getPrev(id, pRec, pDur(), { ...p }, lo, s.layers).then((pv) => {
          if (want === key) prev = pv;
        });
      };
      load();
      let playAt = -1;
      let playDur = 0;
      const bus = new Bus();
      const api: ShotApi = {
        p,
        st,
        bus,
        play(rec = s.rec, dur = durOf(s.dur, p)) {
          const ac = audio();
          rec(ac, bus.node(), ac.currentTime + 0.03, p, Math.random);
          playAt = performance.now() + 30;
          playDur = dur;
        },
        refresh() {
          clearTimeout(timer);
          timer = window.setTimeout(load, 120);
        },
      };
      const controls: Control[] = [{ type: 'button', label: s.playLabel ?? '▶ 소리 듣기', on: () => api.play() }];
      for (const d of s.params ?? []) {
        if (isT(d))
          controls.push({
            type: 'toggle',
            label: d.label,
            value: d.value,
            on: (v) => {
              p[d.key] = v ? 1 : 0;
              api.refresh();
            },
          });
        else
          controls.push({
            type: 'range',
            label: d.label,
            min: d.min,
            max: d.max,
            step: d.step,
            value: d.value,
            on: (v) => {
              p[d.key] = v;
              api.refresh();
            },
          });
      }
      if (s.extra) controls.push(...s.extra(api));
      return {
        controls,
        draw(g, w, h, t) {
          const dd = prev ? prev.dur : pDur();
          // 재생 위치: 실제로 들리는 중이면 그 자리, 아니면 조용히 되풀이
          const now = performance.now();
          let k: number;
          let live = false;
          if (playAt > 0 && now - playAt < playDur * 1000 + 600) {
            k = (now - playAt) / 1000 / Math.max(0.05, playDur);
            live = true;
          } else {
            const per = Math.max(dd + 1.1, 2.4);
            k = (t % per) / dd;
          }
          drawShot(g, w, h, t, { color: s.color, title: s.title, prev, dur: dd, k, lo, live, note: s.note ? s.note(p) : '', icon: (gg) => s.icon(gg, k, t, p, st) });
        },
        dispose() {
          clearTimeout(timer);
          bus.kill();
        },
      };
    },
  };
}

// ═════════════════════ 조리법 (한 번 소리) ═════════════════════

const recCoin: Rec = (c, out, t0, p) => {
  const { pitch = 0, tail = 0.35 } = p;
  const f1 = 987.77 * st2(pitch);
  const o = osc(c, 'square', f1, t0, 0.08 + tail);
  o.frequency.setValueAtTime(f1 * st2(5), t0 + 0.075);
  chain(o, filt(c, 'lowpass', 7000), envG(c, out, t0, 0.002, 0.07, tail, 0.3));
};
const recJump: Rec = (c, out, t0, p) => {
  const { pitch = 0, sweep = 3 } = p;
  const f0 = 220 * st2(pitch);
  const o = osc(c, 'square', f0, t0, 0.3);
  o.frequency.exponentialRampToValueAtTime(f0 * sweep, t0 + 0.2);
  const tri = osc(c, 'triangle', f0 / 2, t0, 0.3);
  tri.frequency.exponentialRampToValueAtTime((f0 * sweep) / 2, t0 + 0.2);
  const g = envG(c, out, t0, 0.004, 0.06, 0.2, 0.3);
  chain(o, filt(c, 'lowpass', 3200), g);
  chain(tri, gainN(c, 0.8), g);
};
const recLaser: Rec = (c, out, t0, p) => {
  const { start = 1800, wobble = 0.5 } = p;
  const o = osc(c, 'sawtooth', start, t0, 0.32);
  o.frequency.exponentialRampToValueAtTime(110, t0 + 0.3);
  const lfo = osc(c, 'sine', 32, t0, 0.32);
  const lg = gainN(c, start * 0.06 * wobble);
  lfo.connect(lg);
  lg.connect(o.frequency);
  chain(o, filt(c, 'lowpass', 6000), envG(c, out, t0, 0.002, 0.04, 0.27, 0.25));
};
const recBoom: Rec = (c, out, t0, p, r) => {
  const { size = 1.4, drive = 0.5 } = p;
  const n = noise(c, t0, size + 0.1, r);
  const lp = filt(c, 'lowpass', 3000, 1);
  lp.frequency.setValueAtTime(3000, t0);
  lp.frequency.exponentialRampToValueAtTime(200, t0 + size * 0.75);
  const g = envG(c, out, t0, 0.004, 0.05, size, 0.9);
  chain(n, lp, shaper(c, 1 + drive * 25), g);
  const sub = osc(c, 'sine', 90, t0, 0.5);
  sub.frequency.exponentialRampToValueAtTime(32, t0 + 0.45);
  sub.connect(envG(c, out, t0, 0.003, 0.02, 0.45, 0.8));
};
const recHit: Rec = (c, out, t0, p, r) => {
  const { power = 0.6 } = p;
  const g = envG(c, out, t0, 0.002, 0.02, 0.11, 0.55);
  const sh = shaper(c, 2 + power * 30);
  sh.connect(g);
  const n = noise(c, t0, 0.13, r);
  chain(n, filt(c, 'bandpass', 1400, 0.9), gainN(c, 0.8), sh);
  const o = osc(c, 'square', 240, t0, 0.13);
  o.frequency.exponentialRampToValueAtTime(70, t0 + 0.12);
  chain(o, gainN(c, 0.5), sh);
};
const recPowerUp: Rec = (c, out, t0, p) => {
  const { pitch = 0, speed = 1 } = p;
  const step = 0.06 / speed;
  const notes = [0, 4, 7, 12, 16, 19, 24];
  const total = step * notes.length;
  const o = osc(c, 'square', 330, t0, total + 0.25);
  notes.forEach((n, i) => o.frequency.setValueAtTime(392 * st2(pitch + n), t0 + i * step));
  const lfo = osc(c, 'sine', 14, t0, total + 0.25);
  const lg = gainN(c, 12);
  chain(lfo, lg);
  lg.connect(o.frequency);
  chain(o, filt(c, 'lowpass', 5000), envG(c, out, t0, 0.004, total, 0.22, 0.22));
};
const recBlip: Rec = (c, out, t0, p) => {
  const { wave = 0, pitch = 0 } = p;
  for (let i = 0; i < 3; i++) tone(c, out, t0 + i * 0.2, 880 * st2(pitch), 0.045, wave ? 0.18 : 0.4, wave ? 'square' : 'sine', 0.002);
};
const recClick: Rec = (c, out, t0, p, r) => {
  const { freq = 3000 } = p;
  const one = (t: number, v: number, f: number): void => {
    const n = noise(c, t, 0.02, r);
    chain(n, filt(c, 'bandpass', f, 1.6), envG(c, out, t, 0.0006, 0.002, 0.012, v));
    tone(c, out, t, f * 0.55, 0.006, v * 0.25, 'triangle', 0.0005);
  };
  one(t0, 1.4, freq);
  one(t0 + 0.13, 0.6, freq * 1.25);
};
const recHover: Rec = (c, out, t0, p, r) => {
  const { jitter = 0.15 } = p;
  for (let i = 0; i < 7; i++) {
    const f = 2600 * (1 + (r() - 0.5) * jitter * 2);
    tone(c, out, t0 + i * 0.09, f, 0.012, 0.25 * 0.25, 'triangle', 0.0008);
    const n = noise(c, t0 + i * 0.09, 0.012, r);
    chain(n, filt(c, 'bandpass', f * 1.4, 2), envG(c, out, t0 + i * 0.09, 0.0005, 0.001, 0.008, 0.25 * 0.5));
  }
};
const tick2 = (c: BA, out: AudioNode, t0: number, up: boolean, r: Rnd): void => {
  const fs = up ? [1100, 1700] : [1700, 1100];
  fs.forEach((f, i) => {
    tone(c, out, t0 + i * 0.055, f, 0.03, 0.35, 'square', 0.001);
    const n = noise(c, t0 + i * 0.055, 0.01, r);
    chain(n, filt(c, 'highpass', 3000), envG(c, out, t0 + i * 0.055, 0.0005, 0.001, 0.008, 0.3));
  });
};
const recToggle: Rec = (c, out, t0, _p, r) => {
  tick2(c, out, t0, true, r);
  tick2(c, out, t0 + 0.6, false, r);
};
const recError: Rec = (c, out, t0, p) => {
  const { pitch = 0 } = p;
  for (let k = 0; k < 2; k++) {
    const t = t0 + k * 0.17;
    const g = envG(c, out, t, 0.006, 0.09, 0.05, 0.3);
    const lp = filt(c, 'lowpass', 900);
    lp.connect(g);
    for (const f of [150, 158]) osc(c, 'square', f * st2(pitch), t, 0.16).connect(lp);
  }
};
const recBell: Rec = (c, out, t0, p) => {
  const { ratio = 3.5, index = 4, pitch = 0 } = p;
  const fc = 660 * st2(pitch);
  const fm = fc * ratio;
  const car = osc(c, 'sine', fc, t0, 2.6);
  const mod = osc(c, 'sine', fm, t0, 2.6);
  const mg = c.createGain();
  mg.gain.setValueAtTime(fm * index, t0);
  mg.gain.exponentialRampToValueAtTime(fm * 0.05, t0 + 1.6);
  chain(mod, mg);
  mg.connect(car.frequency);
  car.connect(envG(c, out, t0, 0.002, 0, 2.4, 0.35));
  // 맑은 위 배음 하나
  tone(c, out, t0, fc * 2.76, 0.9, 0.06);
};
const recWhoosh: Rec = (c, out, t0, p, r) => {
  const { speed = 1 } = p;
  const D = 0.75 / speed;
  const n = noise(c, t0, D, r);
  const bp = filt(c, 'bandpass', 400, 1.3);
  bp.frequency.setValueAtTime(400, t0);
  bp.frequency.exponentialRampToValueAtTime(3000, t0 + D * 0.5);
  bp.frequency.exponentialRampToValueAtTime(400, t0 + D);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.9, t0 + D * 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + D);
  const pn = c.createStereoPanner();
  pn.pan.setValueAtTime(-1, t0);
  pn.pan.linearRampToValueAtTime(1, t0 + D);
  chain(n, bp, g, pn, out);
};
const NOTE_NAMES = ['도', '도#', '레', '레#', '미', '파', '파#', '솔', '솔#', '라', '라#', '시'];
const recArp: Rec = (c, out, t0, p) => {
  const { key = 0, gap = 70 } = p;
  const base = 523.25 * st2(key);
  [0, 4, 7, 12].forEach((n, i) => {
    const t = t0 + (i * gap) / 1000;
    tone(c, out, t, base * st2(n), 0.42, 0.22, 'triangle', 0.003);
    tone(c, out, t, base * st2(n) * 2, 0.15, 0.05, 'sine', 0.002);
  });
};
const comboDing = (c: BA, out: AudioNode, t0: number, n: number): void => {
  const f = 784 * st2(n);
  tone(c, out, t0, f, 0.28, 0.25, 'triangle', 0.002);
  tone(c, out, t0, f * 2, 0.12, 0.08, 'sine', 0.002);
  tone(c, out, t0 + 0.05, f * 1.5, 0.22, 0.1, 'sine', 0.002);
};
const recComboRun: Rec = (c, out, t0) => {
  for (let n = 0; n < 8; n++) comboDing(c, out, t0 + n * 0.22, n);
};
const PENTA = [0, 2, 4, 7, 9];
const SAMPLE_VALUES = [12, 47, 33, 78, 91, 60, 25, 100];
function pentaNote(v: number): number {
  const steps = 15; // 세 옥타브
  const i = Math.round((clamp(v / 100) * (steps - 1)));
  return 12 * Math.floor(i / 5) + PENTA[i % 5]!;
}
const recPenta: Rec = (c, out, t0, p) => {
  const q = p['quant'] ?? 1;
  SAMPLE_VALUES.forEach((v, i) => {
    const f = q ? 261.63 * st2(pentaNote(v)) : 261.63 * Math.pow(2, (v / 100) * 3);
    tone(c, out, t0 + i * 0.2, f, 0.3, 0.22, 'triangle', 0.004);
  });
};
/** 주행계 째깍 — 표시 숫자가 바뀔 때만, 30ms 보다 촘촘하면 거름 */
function odoTicks(target: number, D: number): { t: number; v: number }[] {
  const out: { t: number; v: number }[] = [];
  let lastT = -1;
  let lastV = 0;
  for (let ms = 0; ms <= D * 1000; ms += 2) {
    const v = Math.round(target * easeOut(ms / (D * 1000)));
    if (v !== lastV && ms - lastT >= 30) {
      out.push({ t: ms / 1000, v });
      lastT = ms;
      lastV = v;
    }
  }
  return out;
}
const recOdo: Rec = (c, out, t0, p) => {
  const { target = 250 } = p;
  const D = 1.4;
  for (const tk of odoTicks(target, D)) tone(c, out, t0 + tk.t, 700 + 1100 * (tk.v / target), 0.025, 0.16, 'square', 0.001);
  tone(c, out, t0 + D + 0.05, 1568, 0.5, 0.2, 'triangle');
  tone(c, out, t0 + D + 0.05, 2093, 0.6, 0.12, 'triangle');
};
// 말소리 옹알이
const VOWEL_F: [number, number][] = [
  [800, 1200], // ㅏ
  [700, 1700], // ㅐ
  [750, 1300], // ㅑ
  [700, 1750], // ㅒ
  [550, 1000], // ㅓ
  [500, 1800], // ㅔ
  [550, 1100], // ㅕ
  [500, 1800], // ㅖ
  [450, 850], // ㅗ
  [600, 1200], // ㅘ
  [600, 1600], // ㅙ
  [400, 1800], // ㅚ
  [450, 900], // ㅛ
  [350, 800], // ㅜ
  [500, 1000], // ㅝ
  [400, 1700], // ㅞ
  [350, 2000], // ㅟ
  [350, 850], // ㅠ
  [400, 1500], // ㅡ
  [350, 2000], // ㅢ
  [300, 2300], // ㅣ
];
const SAY = '안녕! 나는 선배 윤정확이야. 같이 검사해 볼까?';
function babble(c: BA, out: AudioNode, t0: number, text: string, voice: number, speed: number): number {
  const stepT = 0.078 / speed;
  let t = t0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const vi = Math.floor(((code - 0xac00) % 588) / 28);
      const [f1, f2] = VOWEL_F[vi] ?? [500, 1500];
      const f0 = voice * (1 + ((code % 7) - 3) * 0.045);
      const o = osc(c, 'sawtooth', f0, t, stepT);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.92, t + stepT * 0.9);
      const g = envG(c, out, t, 0.006, stepT * 0.35, stepT * 0.5, 0.5);
      const b1 = filt(c, 'bandpass', f1, 5);
      const b2 = filt(c, 'bandpass', f2, 6);
      o.connect(b1);
      o.connect(b2);
      b1.connect(g);
      chain(b2, gainN(c, 0.6), g);
      t += stepT;
    } else if (ch === ' ') t += stepT * 0.6;
    else t += stepT * 2.2;
  }
  return t - t0;
}
const recBabble: Rec = (c, out, t0, p) => {
  babble(c, out, t0, SAY, p['voice'] ?? 320, p['speed'] ?? 1);
};
const babbleDur = (p: P): number => {
  const sp = p['speed'] ?? 1;
  let n = 0;
  for (const ch of SAY) n += /[가-힣]/.test(ch) ? 1 : ch === ' ' ? 0.6 : 2.2;
  return (n * 0.078) / sp + 0.15;
};
const recSteps: Rec = (c, out, t0, p, r) => {
  const { speed = 1, ground = 0 } = p;
  const gap = 0.36 / speed;
  for (let i = 0; i < 6; i++) {
    const t = t0 + i * gap;
    const pv = 1 + (r() - 0.5) * 0.2; // ±10%
    const vol = Math.pow(10, ((r() - 0.5) * 6) / 20); // ±3dB
    const pn = pan(c, i % 2 ? 0.35 : -0.35);
    pn.connect(out);
    const n = noise(c, t, 0.12, r);
    const f = (ground ? 2200 : 700) * pv;
    chain(n, filt(c, ground ? 'bandpass' : 'lowpass', f, ground ? 1.4 : 0.8), envG(c, pn, t, 0.002, 0.01, ground ? 0.06 : 0.09, 0.8 * vol));
    const th = osc(c, 'sine', 110 * pv, t, 0.1);
    th.frequency.exponentialRampToValueAtTime(60 * pv, t + 0.08);
    th.connect(envG(c, pn, t, 0.002, 0, 0.08, 0.5 * vol));
  }
};
const VARS = [
  { f: 820, q: 6, b: 1 },
  { f: 960, q: 7, b: 0.95 },
  { f: 740, q: 5, b: 1.05 },
];
const recRobin: Rec = (c, out, t0, p, r) => {
  const vary = p['vary'] ?? 1;
  for (let i = 0; i < 6; i++) {
    const t = t0 + i * 0.24;
    const v = vary ? VARS[i % 3]! : VARS[0]!;
    const rate = vary ? 1 + (r() - 0.5) * 0.1 : 1;
    const vol = vary ? Math.pow(10, ((r() - 0.5) * 4) / 20) : 1;
    const o = osc(c, 'sine', v.f * rate, t, 0.15);
    o.frequency.exponentialRampToValueAtTime(v.f * rate * 0.8, t + 0.12);
    o.connect(envG(c, out, t, 0.001, 0, 0.12, 0.45 * vol * v.b));
    const n = noise(c, t, 0.03, vary ? r : () => 0.3);
    chain(n, filt(c, 'bandpass', v.f * 2.2 * rate, v.q), envG(c, out, t, 0.0008, 0, 0.025, 0.7 * vol));
  }
};
const layHit: Rec = (c, out, t0, p, r) => {
  if (!(p['l0'] ?? 1)) return;
  const n = noise(c, t0, 0.03, r);
  chain(n, filt(c, 'highpass', 2000), envG(c, out, t0, 0.0005, 0.002, 0.018, 0.9));
};
const layBody: Rec = (c, out, t0, p) => {
  if (!(p['l1'] ?? 1)) return;
  const o = osc(c, 'sine', 190, t0, 0.32);
  o.frequency.exponentialRampToValueAtTime(58, t0 + 0.26);
  o.connect(envG(c, out, t0, 0.002, 0.02, 0.26, 0.85));
  const tr = osc(c, 'triangle', 380, t0, 0.15);
  tr.frequency.exponentialRampToValueAtTime(120, t0 + 0.12);
  tr.connect(envG(c, out, t0, 0.002, 0, 0.12, 0.25));
};
const layTail: Rec = (c, out, t0, p, r) => {
  if (!(p['l2'] ?? 1)) return;
  const n = noise(c, t0, 1, r);
  const lp = filt(c, 'lowpass', 1400);
  lp.frequency.setValueAtTime(1400, t0);
  lp.frequency.exponentialRampToValueAtTime(300, t0 + 0.9);
  chain(n, lp, envG(c, out, t0 + 0.01, 0.03, 0, 0.85, 0.22));
};
const recLayers: Rec = (c, out, t0, p, r) => {
  layHit(c, out, t0, p, r);
  layBody(c, out, t0, p, r);
  layTail(c, out, t0, p, r);
};
const recSub: Rec = (c, out, t0, p, r) => {
  const { from = 120, to = 45 } = p;
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 6;
  comp.attack.value = 0.002;
  comp.release.value = 0.2;
  const mk = gainN(c, 1.6);
  chain(comp, mk, out);
  const o = osc(c, 'sine', from, t0, 0.55);
  o.frequency.exponentialRampToValueAtTime(to, t0 + 0.3);
  o.connect(envG(c, comp, t0, 0.003, 0.08, 0.42, 0.9));
  // 폰 스피커용 위쪽 층 (딸깍 + 짧은 몸통)
  const n = noise(c, t0, 0.03, r);
  chain(n, filt(c, 'bandpass', 1800, 1), envG(c, out, t0, 0.0005, 0.003, 0.02, 0.35));
  const h2 = osc(c, 'triangle', from * 2, t0, 0.12);
  h2.frequency.exponentialRampToValueAtTime(to * 2, t0 + 0.1);
  h2.connect(envG(c, out, t0, 0.002, 0, 0.1, 0.18));
};
const recBubbles: Rec = (c, out, t0, p, r) => {
  const { size = 0.5 } = p;
  for (let i = 0; i < 6; i++) {
    const t = t0 + i * 0.16 + r() * 0.06;
    const f0 = lerp(900, 280, clamp(size + (r() - 0.5) * 0.3));
    const o = osc(c, 'sine', f0, t, 0.1);
    o.frequency.exponentialRampToValueAtTime(f0 * 3, t + 0.06);
    o.connect(envG(c, out, t, 0.002, 0.01, 0.07, 0.45));
  }
};
const recDice: Rec = (c, out, t0, p, r) => {
  const { force = 1 } = p;
  let t = 0;
  let gap = 0.025 / force;
  let v = 1;
  while (gap < 0.32 && t < 1.6) {
    const tt = t0 + t;
    const f = 2200 + r() * 1800;
    const n = noise(c, tt, 0.012, r);
    chain(n, filt(c, 'bandpass', f, 3), envG(c, out, tt, 0.0005, 0.001, 0.012, 0.9 * v));
    tone(c, out, tt, f * 0.6, 0.02, 0.12 * v, 'sine', 0.0005);
    t += gap * (0.7 + r() * 0.6);
    gap *= 1.22;
    v *= 0.94;
  }
  const roll = noise(c, t0, t, r);
  const g = c.createGain();
  g.gain.setValueAtTime(0.25, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + t);
  chain(roll, filt(c, 'lowpass', 500), g, out);
};
const recFlip: Rec = (c, out, t0, _p, r) => {
  const n = noise(c, t0, 0.14, r);
  const bp = filt(c, 'bandpass', 2000, 0.8);
  bp.frequency.setValueAtTime(2000, t0);
  bp.frequency.exponentialRampToValueAtTime(7000, t0 + 0.12);
  chain(n, filt(c, 'highpass', 1500), bp, envG(c, out, t0, 0.04, 0, 0.08, 0.5));
  const t1 = t0 + 0.14;
  const k = noise(c, t1, 0.01, r);
  chain(k, filt(c, 'bandpass', 3200, 2), envG(c, out, t1, 0.0005, 0.001, 0.01, 1));
  tone(c, out, t1, 900, 0.025, 0.15, 'triangle', 0.0005);
};
const recCoins: Rec = (c, out, t0, p, r) => {
  const { count = 10 } = p;
  for (let i = 0; i < count; i++) {
    const t = t0 + Math.pow(r(), 1.4) * 0.35;
    const f = 2400 + r() * 2200;
    const v = 0.5 + r() * 0.5;
    const pn = pan(c, (r() - 0.5) * 0.8);
    pn.connect(out);
    tone(c, pn, t, f, 0.18, 0.12 * v, 'sine', 0.0008);
    tone(c, pn, t, f * 2.76, 0.09, 0.07 * v, 'sine', 0.0008);
    if (f * 5.4 < c.sampleRate * 0.45) tone(c, pn, t, f * 5.4, 0.05, 0.04 * v, 'sine', 0.0008);
    const n = noise(c, t, 0.01, r);
    chain(n, filt(c, 'highpass', 5000), envG(c, pn, t, 0.0005, 0.001, 0.008, 0.25 * v));
  }
};
const recServo: Rec = (c, out, t0, p, r) => {
  const { time = 0.6 } = p;
  const N = 64;
  const curve = new Float32Array(N);
  const gcur = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const sp = Math.sin((Math.PI * i) / (N - 1));
    curve[i] = 110 + 520 * sp;
    gcur[i] = 0.05 + 0.35 * sp;
  }
  const o = osc(c, 'sawtooth', 110, t0, time + 0.1);
  o.frequency.setValueCurveAtTime(curve, t0 + 0.02, time);
  const o2 = osc(c, 'square', 55, t0, time + 0.1);
  o2.frequency.setValueCurveAtTime(curve.map((f) => f / 2), t0 + 0.02, time);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.setValueCurveAtTime(gcur, t0 + 0.02, time);
  const lp = filt(c, 'lowpass', 1300, 4);
  o.connect(lp);
  chain(o2, gainN(c, 0.3), lp);
  chain(lp, g, out);
  const clk = (t: number, v: number): void => {
    const n = noise(c, t, 0.012, r);
    chain(n, filt(c, 'bandpass', 2600, 2), envG(c, out, t, 0.0005, 0.001, 0.012, v));
  };
  clk(t0, 0.9);
  clk(t0 + time + 0.03, 1.1);
};
const recDoppler: Rec = (c, out, t0, p) => {
  const { speed = 40 } = p;
  const D = 2.6;
  const N = 128;
  const L = (speed * D) / 2;
  const fq = new Float32Array(N);
  const gv = new Float32Array(N);
  const pv = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const tt = (i / (N - 1)) * D;
    const x = -L + speed * tt;
    const rr0 = Math.hypot(x, 6);
    const vr = (speed * x) / rr0; // + = 멀어짐
    fq[i] = 300 * (343 / (343 + vr));
    gv[i] = 0.9 / (1 + rr0 / 6);
    pv[i] = clamp(x / rr0, -1, 1);
  }
  const o = osc(c, 'sawtooth', 300, t0, D);
  o.frequency.setValueCurveAtTime(fq, t0, D);
  const o2 = osc(c, 'square', 150, t0, D);
  o2.frequency.setValueCurveAtTime(fq.map((f) => f / 2), t0, D);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.setValueCurveAtTime(gv, t0, D);
  const pn = c.createStereoPanner();
  pn.pan.setValueCurveAtTime(pv, t0, D);
  const lp = filt(c, 'lowpass', 1800, 1);
  o.connect(lp);
  chain(o2, gainN(c, 0.4), lp);
  chain(lp, g, pn, out);
};
/** 짧은 가락 + 찰랑 (벽 뒤 소리 시험용) */
function phrase(c: BA, out: AudioNode, t0: number, r: Rnd): void {
  [0, 4, 7, 12, 7, 4].forEach((n, i) => {
    tone(c, out, t0 + i * 0.16, 523.25 * st2(n), 0.22, 0.2, 'sawtooth', 0.004);
    const nn = noise(c, t0 + i * 0.16, 0.04, r);
    chain(nn, filt(c, 'highpass', 6000), envG(c, out, t0 + i * 0.16, 0.001, 0.005, 0.03, 0.35));
  });
}
function wallNode(c: BA, out: AudioNode, wall: number, thick: number): AudioNode {
  if (!wall) return out;
  const lp = filt(c, 'lowpass', lerp(1500, 350, thick), 0.8);
  chain(lp, gainN(c, lerp(0.7, 0.4, thick)), out);
  return lp;
}
const recOcclude: Rec = (c, out, t0, p, r) => {
  phrase(c, wallNode(c, out, p['wall'] ?? 1, p['thick'] ?? 0.5), t0, r);
};
const prevOcclude: Rec = (c, out, t0, p, r) => {
  phrase(c, out, t0, r);
  phrase(c, wallNode(c, out, 1, p['thick'] ?? 0.5), t0 + 1.25, r);
};
const recReverb: Rec = (c, out, t0, p, r) => {
  const { size = 1.6, wet = 0.6 } = p;
  const cv = c.createConvolver();
  cv.buffer = makeIR(c, size);
  const wg = gainN(c, wet * 1.2);
  chain(cv, wg, out);
  const dry = gainN(c, 0.8);
  dry.connect(out);
  const hit = (t: number, f: number): void => {
    const n = noise(c, t, 0.05, r);
    const e = envG(c, dry, t, 0.001, 0.005, 0.04, 0.8);
    chain(n, filt(c, 'bandpass', f, 0.9), e);
    e.connect(cv);
  };
  hit(t0, 1300);
  const pl = osc(c, 'triangle', 392, t0 + 0.25, 0.3);
  const e2 = envG(c, dry, t0 + 0.25, 0.003, 0, 0.25, 0.45);
  pl.connect(e2);
  e2.connect(cv);
};
const recEcho: Rec = (c, out, t0, p) => {
  const { time = 0.32, fb = 0.5 } = p;
  // 「야호~」: 톱니파 음 높이 미끄럼 + 모음 필터 (아 → 오)
  const o = osc(c, 'sawtooth', 300, t0, 0.62);
  o.frequency.setValueAtTime(280, t0);
  o.frequency.linearRampToValueAtTime(420, t0 + 0.2);
  o.frequency.linearRampToValueAtTime(330, t0 + 0.6);
  const v1 = filt(c, 'bandpass', 800, 5);
  v1.frequency.setValueAtTime(800, t0);
  v1.frequency.linearRampToValueAtTime(480, t0 + 0.45);
  const v2 = filt(c, 'bandpass', 1250, 6);
  v2.frequency.setValueAtTime(1250, t0);
  v2.frequency.linearRampToValueAtTime(850, t0 + 0.45);
  const voice = envG(c, out, t0, 0.04, 0.35, 0.2, 0.9);
  o.connect(v1);
  o.connect(v2);
  v1.connect(voice);
  chain(v2, gainN(c, 0.6), voice);
  const dl = c.createDelay(2);
  dl.delayTime.value = time;
  const lp = filt(c, 'lowpass', 2200);
  const fg = gainN(c, Math.min(0.6, fb));
  voice.connect(dl);
  chain(dl, lp, fg, dl);
  lp.connect(out);
};

// ═════════════════════ 작은 그림 (100 칸 상자) ═════════════════════

const on01 = (k: number): number => (k >= 0 && k <= 1 ? 1 : 0);
function ground(g: G, y: number, color = 'rgba(255,255,255,0.14)'): void {
  g.strokeStyle = color;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(-46, y);
  g.lineTo(46, y);
  g.stroke();
}
function shadow(g: G, x: number, y: number, rx: number, a = 0.35): void {
  g.fillStyle = `rgba(0,0,0,${a})`;
  g.beginPath();
  g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, rx * 0.25), 0, 0, TAU);
  g.fill();
}

const SHOTS: Record<string, Shot> = {
  i128: {
    caption: '네모파가 한 박자 뒤 4도 위로 뛰는 「딩딩!」 — 스펙트로그램에 계단 두 칸',
    title: '딩딩!',
    color: '#ffc93a',
    dur: (p) => 0.08 + (p['tail'] ?? 0.35) + 0.05,
    params: [
      { key: 'pitch', label: '음 높이 (반음)', min: -12, max: 12, step: 1, value: 0 },
      { key: 'tail', label: '꼬리 길이 (초)', min: 0.1, max: 0.8, step: 0.05, value: 0.35 },
    ],
    rec: recCoin,
    icon(g, k, t) {
      const a = on01(k);
      const y = a ? -38 * Math.sin(Math.PI * clamp(k * 1.2)) : 0;
      shadow(g, 0, 32, 20 - (a ? Math.sin(Math.PI * clamp(k * 1.2)) * 8 : 0));
      // 블록
      rr(g, -26, 6, 52, 22, 5);
      g.fillStyle = '#d07a2a';
      g.fill();
      g.strokeStyle = '#5a2b0a';
      g.lineWidth = 2.5;
      g.stroke();
      txt(g, '?', 0, 18, 18, '#ffe9a8', 'center', 900);
      coin(g, 0, -12 + y, 17, Math.cos(t * 7));
      if (a) {
        for (let i = 0; i < 5; i++) {
          const an = (i / 5) * TAU + k * 2;
          const rad = 22 + k * 22;
          sparkle(g, Math.cos(an) * rad, -12 + y + Math.sin(an) * rad, 5 * (1 - k));
        }
        g.globalAlpha = 1 - clamp(k);
        txt(g, '+1', 26, -40 - k * 12, 14, '#fff6c8', 'center', 900);
        g.globalAlpha = 1;
      }
    },
  },
  i129: {
    caption: '음 높이가 위로 쓸려 올라가는 「보잉」 — 스펙트로그램의 오르막 곡선',
    title: '보잉',
    color: '#7be08a',
    dur: 0.32,
    params: [
      { key: 'pitch', label: '시작 음 (반음)', min: -12, max: 12, step: 1, value: 0 },
      { key: 'sweep', label: '올라가는 폭 (배)', min: 1.5, max: 6, step: 0.5, value: 3 },
    ],
    rec: recJump,
    icon(g, k) {
      ground(g, 32);
      const j = on01(k) ? Math.sin(Math.PI * clamp(k * 1.3)) : 0;
      const land = k > 0.77 && k < 1.1 ? Math.sin(((k - 0.77) / 0.33) * Math.PI) : 0;
      const pre = k > 1.6 ? clamp((k - 1.6) * 3) : 0;
      shadow(g, 0, 33, 16 - j * 8);
      const y = 18 - j * 50;
      blob(g, 0, y, 14, '#7be08a', 1 - land * 0.15 + pre * 0.1, 1 + j * 0.15 + land * 0.2 - pre * 0.15, 'happy');
      if (j > 0.2) {
        g.strokeStyle = 'rgba(180,255,190,0.6)';
        g.lineWidth = 2;
        for (const dx of [-8, 0, 8]) {
          g.beginPath();
          g.moveTo(dx, y + 20);
          g.lineTo(dx, y + 20 + j * 16);
          g.stroke();
        }
      }
    },
  },
  i130: {
    caption: '톱니파가 빠르게 내려가며 떨리는 「퓨웅」 — 위에서 아래로 떨어지는 줄무늬',
    title: '퓨웅',
    color: '#ff5fa8',
    dur: 0.34,
    params: [
      { key: 'start', label: '시작 음 (Hz)', min: 600, max: 3000, step: 50, value: 1800 },
      { key: 'wobble', label: '떨림', min: 0, max: 1.5, step: 0.1, value: 0.5 },
    ],
    rec: recLaser,
    icon(g, k, t) {
      // 발사기
      rr(g, -46, -10, 20, 20, 4);
      g.fillStyle = '#4c4a78';
      g.fill();
      circ(g, -26, 0, 6);
      g.fillStyle = on01(k) ? '#ffd0ea' : '#ff5fa8';
      g.fill();
      // 과녁 (수정)
      g.save();
      g.translate(36, 0);
      g.rotate(Math.sin(t) * 0.1);
      g.beginPath();
      g.moveTo(0, -16);
      g.lineTo(9, 0);
      g.lineTo(0, 16);
      g.lineTo(-9, 0);
      g.closePath();
      g.fillStyle = on01(k) && k > 0.3 ? '#ffd0ea' : '#7a6cff';
      g.fill();
      g.restore();
      if (on01(k)) {
        const w0 = 7 * (1 - k);
        g.save();
        g.shadowColor = '#ff5fa8';
        g.shadowBlur = 14;
        g.strokeStyle = '#ff9ccb';
        g.lineWidth = w0 + 1.5;
        g.beginPath();
        for (let x = -24; x <= 30; x += 2) g.lineTo(x, Math.sin(x * 0.5 + t * 50) * 2 * (1 - k));
        g.stroke();
        g.strokeStyle = '#fff';
        g.lineWidth = Math.max(0.8, w0 * 0.4);
        g.stroke();
        g.restore();
        for (let i = 0; i < 4; i++) sparkle(g, 30 + Math.cos(i * 1.7) * 10 * k, Math.sin(i * 2.3) * 12 * k, 4 * (1 - k), '#ffd0ea');
      }
    },
  },
  i131: {
    caption: '잡음이 저역 필터로 3k → 200Hz 닫히며 사라지는 「쾅」 — 위쪽이 먼저 꺼지는 삼각형',
    title: '쾅!',
    color: '#ff8a3d',
    dur: (p) => (p['size'] ?? 1.4) + 0.15,
    params: [
      { key: 'size', label: '길이 (초)', min: 0.5, max: 2.5, step: 0.1, value: 1.4 },
      { key: 'drive', label: '찌그러짐', min: 0, max: 1, step: 0.05, value: 0.5 },
    ],
    rec: recBoom,
    lo: 30,
    icon(g, k, t) {
      ground(g, 34);
      if (!on01(k)) {
        // 폭탄 + 불꽃 심지
        circ(g, 0, 12, 18);
        const gr = g.createRadialGradient(-6, 4, 2, 0, 12, 18);
        gr.addColorStop(0, '#6a6890');
        gr.addColorStop(1, '#1d1b33');
        g.fillStyle = gr;
        g.fill();
        rr(g, -5, -10, 10, 7, 2);
        g.fillStyle = '#3a3860';
        g.fill();
        g.strokeStyle = '#c8a070';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(0, -10);
        g.quadraticCurveTo(6, -20, 12, -18);
        g.stroke();
        sparkle(g, 12, -19, 5 + Math.sin(t * 30) * 2, '#ffd36a');
        return;
      }
      const e = easeOut(k * 1.6);
      for (let i = 0; i < 3; i++) {
        const rad = (14 + i * 12) * (0.4 + e) * (1 - i * 0.12);
        circ(g, 0, 12, rad);
        g.fillStyle = ['rgba(255,240,180,', 'rgba(255,160,60,', 'rgba(220,70,40,'][i]! + (1 - clamp(k * 1.1)) * (0.9 - i * 0.2) + ')';
        g.fill();
      }
      for (let i = 0; i < 12; i++) {
        const an = hash(i) * TAU;
        const d = 10 + e * 46 * (0.6 + hash(i + 9) * 0.6);
        g.fillStyle = `rgba(80,60,70,${1 - clamp(k)})`;
        rr(g, Math.cos(an) * d - 3, 12 + Math.sin(an) * d - 3 + k * k * 20, 6, 6, 1.5);
        g.fill();
      }
      for (let i = 0; i < 5; i++) {
        const sx = (hash(i + 30) - 0.5) * 50;
        circ(g, sx, 10 - k * 30 - i * 4, 8 + k * 14);
        g.fillStyle = `rgba(120,110,140,${0.35 * clamp(k * 2) * (1 - clamp(k))})`;
        g.fill();
      }
    },
  },
  i132: {
    caption: '잡음 + 네모파 0.1초, 음이 내려가며 찌그러지는 「툭」 — WaveShaper 로 거칠게',
    title: '툭!',
    color: '#ff5c6c',
    dur: 0.2,
    params: [{ key: 'power', label: '찌그러짐 (아픔)', min: 0, max: 1, step: 0.05, value: 0.6 }],
    rec: recHit,
    icon(g, k) {
      ground(g, 32);
      const a = on01(k);
      const sq = a ? Math.sin(Math.PI * clamp(k * 2)) : 0;
      const shake = a ? Math.sin(k * 60) * 4 * (1 - k) : 0;
      shadow(g, shake, 33, 18);
      blob(g, shake, 14 + sq * 4, 16, '#8fb6ff', 1 + sq * 0.25, 1 - sq * 0.22, a && k < 0.9 ? 'ouch' : 'calm');
      if (a) {
        g.globalAlpha = 1 - clamp(k);
        for (let i = 0; i < 3; i++) {
          const an = -Math.PI / 2 + (i - 1) * 0.9 + k * 3;
          star(g, Math.cos(an) * 28, -6 + Math.sin(an) * 14, 6, 5, 0.45);
          g.fillStyle = '#ffe36a';
          g.fill();
        }
        // 맞은 자리 번쩍
        star(g, 22, -6, 10 + k * 8, 8, 0.45, k);
        g.fillStyle = '#ff5c6c';
        g.fill();
        g.globalAlpha = 1;
      }
    },
  },
  i133: {
    caption: '네모파 아르페지오가 0.5초 동안 위로 + 떨림 — 계단처럼 오르는 줄',
    title: '뚜루루딩',
    color: '#b88bff',
    dur: (p) => (0.06 / (p['speed'] ?? 1)) * 7 + 0.3,
    params: [
      { key: 'pitch', label: '시작 음 (반음)', min: -12, max: 12, step: 1, value: 0 },
      { key: 'speed', label: '빠르기', min: 0.5, max: 2, step: 0.1, value: 1 },
    ],
    rec: recPowerUp,
    icon(g, k, t) {
      const a = on01(k);
      const grow = a ? easeOut(k) : k > 1 && k < 1.8 ? 1 : 0;
      for (let i = 0; i < 7; i++) {
        const lit = a && k * 7 > i;
        rr(g, -42 + i * 12, 30 - i * 7 - 8, 9, 8 + i * 7, 2);
        g.fillStyle = lit ? `hsl(${260 + i * 14},90%,${65 + i * 3}%)` : 'rgba(255,255,255,0.1)';
        g.fill();
      }
      g.save();
      g.translate(16, -18);
      g.rotate(t * 0.8);
      g.scale(0.7 + grow * 0.5, 0.7 + grow * 0.5);
      star(g, 0, 0, 16, 5, 0.48);
      const gr = g.createRadialGradient(0, -4, 1, 0, 0, 16);
      gr.addColorStop(0, '#fff8d0');
      gr.addColorStop(1, '#ffb52e');
      g.fillStyle = gr;
      g.fill();
      g.strokeStyle = '#8a4a00';
      g.lineWidth = 2;
      g.stroke();
      g.restore();
      if (grow > 0) {
        g.strokeStyle = `rgba(200,170,255,${0.8 * (1 - clamp(k - 1))})`;
        g.lineWidth = 2;
        circ(g, 16, -18, 16 + grow * 14);
        g.stroke();
      }
    },
  },
  i134: {
    caption: '30~60ms 아주 짧은 「삡」 — 메뉴 칸을 옮길 때마다 한 번',
    title: '삡',
    color: '#5fd4ff',
    dur: 0.5,
    params: [
      { key: 'wave', label: '네모파 (끄면 사인파)', toggle: true, value: false },
      { key: 'pitch', label: '음 높이 (반음)', min: -12, max: 12, step: 1, value: 0 },
    ],
    rec: recBlip,
    icon(g, k) {
      const sel = on01(k) ? Math.min(2, Math.floor((k * 0.5) / 0.2)) : k > 1 ? 2 : 0;
      const items = ['시작하기', '단계 고르기', '소리 설정'];
      items.forEach((s, i) => {
        const y = -26 + i * 24;
        rr(g, -36, y - 9, 76, 18, 6);
        g.fillStyle = i === sel ? 'rgba(95,212,255,0.3)' : 'rgba(255,255,255,0.06)';
        g.fill();
        if (i === sel) {
          g.strokeStyle = '#5fd4ff';
          g.lineWidth = 1.5;
          g.stroke();
        }
        txt(g, s, -26, y, 9, i === sel ? '#fff' : 'rgba(255,255,255,0.6)', 'left', 700);
      });
      const y = -26 + sel * 24;
      g.fillStyle = '#ffe36a';
      g.beginPath();
      g.moveTo(-46, y - 6);
      g.lineTo(-38, y);
      g.lineTo(-46, y + 6);
      g.fill();
    },
  },
  i135: {
    caption: '5~15ms 잡음을 대역 필터(2~4kHz)로 — 누를 때 「틱」, 뗄 때 작은 「틱」',
    title: '틱',
    color: '#9ef0c8',
    dur: 0.25,
    params: [{ key: 'freq', label: '필터 중심 (Hz)', min: 1500, max: 5000, step: 100, value: 3000 },],
    rec: recClick,
    icon(g, k) {
      const down = k >= 0 && k < 0.5 ? 1 : 0;
      shadow(g, 0, 22, 34, 0.4);
      rr(g, -32, 2, 64, 20, 10);
      g.fillStyle = '#1f6b52';
      g.fill();
      rr(g, -32, -6 + down * 6, 64, 22, 10);
      const gr = g.createLinearGradient(0, -6, 0, 16);
      gr.addColorStop(0, '#b9ffe0');
      gr.addColorStop(1, '#46c99a');
      g.fillStyle = gr;
      g.fill();
      txt(g, '확인', 0, 5 + down * 6, 11, '#0d3b2c', 'center', 900);
      // 손가락
      g.save();
      g.translate(10, -22 + down * 8);
      g.fillStyle = '#ffd9b8';
      g.strokeStyle = '#7a4a2a';
      g.lineWidth = 1.8;
      rr(g, -5, -20, 10, 22, 5);
      g.fill();
      g.stroke();
      rr(g, 3, -10, 14, 16, 6);
      g.fill();
      g.stroke();
      g.restore();
      if (down) {
        g.strokeStyle = 'rgba(158,240,200,0.8)';
        g.lineWidth = 2;
        for (const s of [-1, 1]) {
          g.beginPath();
          g.moveTo(s * 38, -6);
          g.lineTo(s * 46, -12);
          g.stroke();
        }
      }
    },
  },
  i136: {
    caption: '칸 위를 지날 때 클릭보다 −12dB 작은 째깍 — 음 높이를 조금씩 흔들어 기계 같지 않게',
    title: '째깍',
    color: '#ffd166',
    dur: 0.7,
    params: [{ key: 'jitter', label: '음 무작위 폭', min: 0, max: 0.4, step: 0.02, value: 0.15 }],
    rec: recHover,
    icon(g, k) {
      const cx = on01(k) ? lerp(-36, 40, k) : -36;
      const hov = on01(k) ? Math.min(6, Math.floor(k * 7)) : -1;
      for (let i = 0; i < 7; i++) {
        const x = -40 + i * 13;
        const up = i === hov ? 5 : 0;
        rr(g, x - 5, -4 - up, 10, 16, 2.5);
        g.fillStyle = i === hov ? '#ffd166' : 'rgba(255,255,255,0.14)';
        g.fill();
      }
      // 마우스 화살표
      g.save();
      g.translate(cx, 14);
      g.fillStyle = '#fff';
      g.strokeStyle = '#111';
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, 16);
      g.lineTo(4, 12);
      g.lineTo(7, 19);
      g.lineTo(10, 17.5);
      g.lineTo(7, 11);
      g.lineTo(12, 11);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
      txt(g, '40ms 에 한 번만', 0, -26, 8, 'rgba(255,255,255,0.55)');
    },
  },
  i137: {
    caption: '켤 땐 올라가는 「틱틱」, 끌 땐 내려가는 「틱틱」 — 소리만 들어도 켜졌는지 앎',
    title: '틱틱',
    color: '#6ef0a0',
    dur: 0.8,
    rec: recToggle,
    extra: (api) => [
      { type: 'button', label: '켜기 소리만', on: () => api.play((c, o, t0, _p, r) => tick2(c, o, t0, true, r), 0.2) },
      { type: 'button', label: '끄기 소리만', on: () => api.play((c, o, t0, _p, r) => tick2(c, o, t0, false, r), 0.2) },
    ],
    icon(g, k) {
      const onS = k >= 0 && k < 0.75 / 0.8 && k > 0 ? (k < 0.6 / 0.8 ? 1 : 0) : 0;
      const kx = onS ? 1 : 0;
      rr(g, -30, -15, 60, 30, 15);
      g.fillStyle = kx ? '#2fb874' : '#4a4766';
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 2;
      g.stroke();
      circ(g, lerp(-15, 15, kx), 0, 12);
      g.fillStyle = '#fff';
      g.fill();
      txt(g, kx ? '켜짐' : '꺼짐', 0, 28, 10, kx ? '#6ef0a0' : 'rgba(255,255,255,0.55)', 'center', 800);
      // 오르내리는 음 화살표
      g.strokeStyle = kx ? '#6ef0a0' : '#ff9a9a';
      g.lineWidth = 2.4;
      g.beginPath();
      if (kx) {
        g.moveTo(-10, -26);
        g.lineTo(0, -34);
        g.lineTo(10, -40);
      } else {
        g.moveTo(-10, -40);
        g.lineTo(0, -34);
        g.lineTo(10, -26);
      }
      g.stroke();
    },
  },
  i138: {
    caption: '살짝 어긋난 낮은 두 음(150 · 158Hz)의 맥놀이 + 저역 필터 — 「부부」 두 번',
    title: '부부',
    color: '#ff6b6b',
    dur: 0.4,
    params: [{ key: 'pitch', label: '음 높이 (반음)', min: -12, max: 12, step: 1, value: 0 }],
    rec: recError,
    lo: 40,
    icon(g, k) {
      const a = on01(k);
      const sh = a ? Math.sin(k * 70) * 6 * (1 - k * 0.5) : 0;
      g.save();
      g.translate(sh, 0);
      circ(g, 0, 0, 26);
      g.fillStyle = a ? '#ff4d5e' : '#7a3b4a';
      g.fill();
      g.strokeStyle = '#fff';
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(-10, -10);
      g.lineTo(10, 10);
      g.moveTo(10, -10);
      g.lineTo(-10, 10);
      g.stroke();
      g.restore();
      txt(g, '맞대 볼 거리가 없어요', 0, 38, 8, 'rgba(255,255,255,0.6)');
    },
  },
  i139: {
    caption: 'FM 합성 종소리 — 변조 비율이 정수가 아니면(3.5) 쇠종 같은 어긋난 배음 · 긴 꼬리',
    title: '띵~',
    color: '#ffe08a',
    dur: 2.5,
    params: [
      { key: 'ratio', label: '변조 비율 (정수면 맑음)', min: 1, max: 5, step: 0.05, value: 3.5 },
      { key: 'index', label: '변조 세기', min: 0, max: 10, step: 0.5, value: 4 },
      { key: 'pitch', label: '음 높이 (반음)', min: -12, max: 12, step: 1, value: 0 },
    ],
    rec: recBell,
    note: (p) => `변조 = 반송파 × ${(p['ratio'] ?? 3.5).toFixed(2)}`,
    icon(g, k, t) {
      const a = on01(k);
      const sw = a ? Math.sin(k * 22) * 0.4 * Math.exp(-k * 2.5) : Math.sin(t) * 0.02;
      g.save();
      g.translate(0, -30);
      g.rotate(sw);
      const gr = g.createLinearGradient(-24, 0, 24, 0);
      gr.addColorStop(0, '#b97a10');
      gr.addColorStop(0.4, '#ffe9a0');
      gr.addColorStop(1, '#c48310');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(-6, 4);
      g.bezierCurveTo(-16, 8, -16, 34, -26, 46);
      g.lineTo(26, 46);
      g.bezierCurveTo(16, 34, 16, 8, 6, 4);
      g.closePath();
      g.fill();
      g.strokeStyle = '#6a4006';
      g.lineWidth = 2;
      g.stroke();
      circ(g, 0, 2, 5);
      g.fill();
      g.stroke();
      circ(g, sw * -20, 48, 5);
      g.fillStyle = '#6a4006';
      g.fill();
      g.restore();
      if (a) {
        waves(g, -26, 10, 8, 3, k * 2, '#ffe08a', 0.6, Math.PI);
        waves(g, 26, 10, 8, 3, k * 2, '#ffe08a', 0.6, 0);
      }
    },
  },
  i140: {
    caption: '잡음 대역 필터 중심이 400 → 3000 → 400Hz, 소리가 왼쪽에서 오른쪽으로 지나감',
    title: '휙',
    color: '#8fd8ff',
    dur: (p) => 0.75 / (p['speed'] ?? 1) + 0.05,
    params: [{ key: 'speed', label: '빠르기', min: 0.5, max: 2.5, step: 0.1, value: 1 }],
    rec: recWhoosh,
    icon(g, k) {
      const a = on01(k);
      const x = a ? lerp(-34, 34, easeIO(k)) : -34;
      for (let i = 0; i < 4; i++) {
        g.strokeStyle = `rgba(143,216,255,${0.5 - i * 0.1})`;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x - 22 - i * 4, -12 + i * 8);
        g.lineTo(x - 22 - 26 * a - i * 8, -12 + i * 8);
        g.stroke();
      }
      g.save();
      g.translate(x, 0);
      g.rotate(0.08);
      rr(g, -16, -22, 32, 44, 5);
      g.fillStyle = '#fff';
      g.fill();
      g.strokeStyle = '#8fd8ff';
      g.lineWidth = 2;
      g.stroke();
      star(g, 0, 0, 9);
      g.fillStyle = '#5aa8ff';
      g.fill();
      g.restore();
      txt(g, '왼쪽', -36, 36, 8, 'rgba(255,255,255,0.45)');
      txt(g, '오른쪽', 36, 36, 8, 'rgba(255,255,255,0.45)');
    },
  },
  i141: {
    caption: '배경음악과 같은 조의 1-3-5-8 을 70ms 간격으로 — 어느 조로 바꿔도 늘 어울림',
    title: '도미솔도',
    color: '#ffa8d8',
    dur: (p) => (3 * (p['gap'] ?? 70)) / 1000 + 0.5,
    params: [
      { key: 'key', label: '조 (반음 올림: 0 = 다장조)', min: 0, max: 11, step: 1, value: 0 },
      { key: 'gap', label: '간격 (ms)', min: 40, max: 160, step: 5, value: 70 },
    ],
    rec: recArp,
    note: (p) => `${NOTE_NAMES[(p['key'] ?? 0) % 12]} 장조`,
    icon(g, k, _t, p) {
      const key = p['key'] ?? 0;
      const tones = [0, 4, 7, 12].map((n) => n + key);
      const lit = on01(k) ? Math.min(3, Math.floor(k * 4.2)) : -1;
      // 두 옥타브 건반 (흰 14)
      const W = [0, 2, 4, 5, 7, 9, 11];
      const kw = 6.4;
      for (let i = 0; i < 14; i++) {
        const semi = 12 * Math.floor(i / 7) + W[i % 7]!;
        const x = -45 + i * kw;
        const idx = tones.indexOf(semi);
        rr(g, x, -14, kw - 0.8, 36, 1.5);
        g.fillStyle = idx >= 0 ? (idx <= lit ? '#ff7cc4' : '#ffd6ec') : '#f4f0ff';
        g.fill();
      }
      for (let i = 0; i < 14; i++) {
        const w = W[i % 7]!;
        if (w === 4 || w === 11) continue;
        const semi = 12 * Math.floor(i / 7) + w + 1;
        const x = -45 + i * kw + kw * 0.62;
        const idx = tones.indexOf(semi);
        rr(g, x, -14, kw * 0.7, 21, 1);
        g.fillStyle = idx >= 0 ? (idx <= lit ? '#ff3ea5' : '#a05080') : '#1d1830';
        g.fill();
      }
      tones.forEach((_, i) => {
        if (i > lit) return;
        txt(g, ['1', '3', '5', '8'][i]!, -30 + i * 20, -28 - (i === lit ? 4 : 0), 11, '#ffa8d8', 'center', 900);
      });
    },
  },
  i142: {
    caption: '연속 정답마다 반음씩 위로 — 재생 속도 2^(n/12), 계단처럼 오르는 「딩」',
    title: '콤보!',
    color: '#ffb84d',
    dur: 8 * 0.22 + 0.35,
    rec: recComboRun,
    playLabel: '▶ 8콤보 들어 보기',
    extra: (api) => [
      {
        type: 'button',
        label: '정답! (콤보 +1)',
        on: () => {
          const n = Math.min(12, (api.st['n'] ?? -1) + 1);
          api.st['n'] = n;
          api.st['at'] = performance.now();
          api.play((c, o, t0) => comboDing(c, o, t0, n), 0.35);
        },
      },
      {
        type: 'button',
        label: '콤보 끊기',
        on: () => {
          api.st['n'] = -1;
          api.play((c, o, t0) => {
            const x = osc(c, 'triangle', 220, t0, 0.3);
            x.frequency.exponentialRampToValueAtTime(110, t0 + 0.25);
            x.connect(envG(c, o, t0, 0.005, 0, 0.25, 0.3));
          }, 0.3);
        },
      },
    ],
    icon(g, k, _t, _p, st) {
      const manual = st['at'] !== undefined && performance.now() - (st['at'] ?? 0) < 4000;
      const n = manual ? (st['n'] ?? -1) : on01(k) ? Math.min(7, Math.floor((k * (8 * 0.22 + 0.35)) / 0.22)) : -1;
      for (let i = 0; i < 8; i++) {
        const lit = i <= n;
        const x = -42 + i * 11;
        const hgt = 8 + i * 5;
        rr(g, x, 28 - hgt, 8, hgt, 2);
        g.fillStyle = lit ? `hsl(${40 - i * 4},100%,${60 + i * 2}%)` : 'rgba(255,255,255,0.08)';
        g.fill();
      }
      if (n >= 0) {
        const sc = 1 + (manual ? 0.2 : 0) + n * 0.04;
        g.save();
        g.translate(-14, -26);
        g.scale(sc, sc);
        txt(g, `${n + 1} 콤보`, 0, 0, 14, '#ffd27a', 'center', 900);
        g.restore();
        txt(g, `× 2^(${n}/12) = ${Math.pow(2, n / 12).toFixed(2)}`, -14, -10, 8, 'rgba(255,255,255,0.6)', 'center', 700, MONO);
      }
    },
  },
  i143: {
    caption: '어떤 값이든 5음계 음으로 맞춤 — 큰 수 = 높은 음, 아무렇게나 쳐도 안 어긋남',
    title: '값 → 음',
    color: '#7fe3d0',
    dur: 8 * 0.2 + 0.35,
    params: [{ key: 'quant', label: '5음계로 맞추기 (끄면 그냥 주파수)', toggle: true, value: true }],
    rec: recPenta,
    note: (p) => ((p['quant'] ?? 1) ? '도 레 미 솔 라 (5음계)' : '맞추지 않음 — 음이 어긋남'),
    extra: (api) => [
      { type: 'range', label: '값 하나 들어 보기 (0~100)', min: 0, max: 100, step: 1, value: 50, on: (v) => {
        api.st['v'] = v;
        const q = api.p['quant'] ?? 1;
        api.play((c, o, t0) => tone(c, o, t0, q ? 261.63 * st2(pentaNote(v)) : 261.63 * Math.pow(2, (v / 100) * 3), 0.3, 0.22, 'triangle', 0.004), 0.35);
      } },
    ],
    icon(g, k) {
      const cur = on01(k) ? Math.min(7, Math.floor((k * (8 * 0.2 + 0.35)) / 0.2)) : -1;
      SAMPLE_VALUES.forEach((v, i) => {
        const x = -44 + i * 11.5;
        const hgt = 6 + v * 0.5;
        rr(g, x, 30 - hgt, 9, hgt, 2);
        g.fillStyle = i === cur ? '#7fe3d0' : i < cur ? 'rgba(127,227,208,0.45)' : 'rgba(255,255,255,0.12)';
        g.fill();
        if (i === cur) {
          const ny = 30 - hgt - 10;
          g.fillStyle = '#fff';
          g.beginPath();
          g.ellipse(x + 4.5, ny, 4, 3, -0.4, 0, TAU);
          g.fill();
          g.strokeStyle = '#fff';
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(x + 8, ny);
          g.lineTo(x + 8, ny - 12);
          g.stroke();
          txt(g, String(v), x + 4.5, 38, 8, '#7fe3d0', 'center', 800);
        }
      });
    },
  },
  i144: {
    caption: '숫자가 바뀔 때마다 블립, 최소 30ms 간격 — 목표에 가까울수록 음이 높아짐',
    title: '째깍째깍',
    color: '#ffd84d',
    dur: 2.1,
    params: [{ key: 'target', label: '목표 점수', min: 30, max: 900, step: 10, value: 250 }],
    rec: recOdo,
    icon(g, k, _t, p) {
      const target = p['target'] ?? 250;
      const v = on01(k) ? Math.round(target * easeOut((k * 2.1) / 1.4)) : k > 1 ? target : 0;
      const done = on01(k) && k * 2.1 > 1.4;
      rr(g, -42, -18, 84, 34, 8);
      g.fillStyle = '#0c0a1c';
      g.fill();
      g.strokeStyle = done ? '#ffd84d' : 'rgba(255,216,77,0.4)';
      g.lineWidth = 2;
      g.stroke();
      const s = String(v).padStart(3, '0');
      [...s].forEach((d, i) => {
        const x = -22 + i * 22 - (s.length - 3) * 11;
        rr(g, x - 9, -13, 18, 24, 4);
        g.fillStyle = '#221d3a';
        g.fill();
        txt(g, d, x, -0.5, 18, done ? '#fff3a0' : '#ffd84d', 'center', 900, MONO);
      });
      txt(g, '점수', 0, -28, 9, 'rgba(255,255,255,0.6)');
      if (done) {
        for (let i = 0; i < 5; i++) sparkle(g, Math.cos(i * 1.3) * 40, 26 + Math.sin(i * 2.1) * 6, 4, '#fff3a0');
      }
    },
  },
  i145: {
    caption: '글자마다 짧은 블립 — 글자 코드로 음 높이, 모음(ㅏ·ㅣ·ㅜ…)으로 필터를 바꿔 말처럼',
    title: '옹알옹알',
    color: '#ffb0c8',
    dur: babbleDur,
    params: [
      { key: 'voice', label: '목소리 높이 (Hz)', min: 140, max: 600, step: 10, value: 320 },
      { key: 'speed', label: '빠르기', min: 0.6, max: 1.8, step: 0.1, value: 1 },
    ],
    rec: recBabble,
    icon(g, k, t, p) {
      const n = on01(k) ? Math.floor(SAY.length * k) : k > 1 ? SAY.length : 0;
      // 말풍선
      rr(g, -48, -46, 96, 40, 8);
      g.fillStyle = '#fff';
      g.fill();
      g.beginPath();
      g.moveTo(-20, -7);
      g.lineTo(-28, 4);
      g.lineTo(-10, -7);
      g.fill();
      const shown = SAY.slice(0, n);
      const l1 = shown.slice(0, 12);
      const l2 = shown.slice(12);
      txt(g, l1, -43, -34, 8.5, '#2a1d3a', 'left', 700);
      txt(g, l2, -43, -19, 8.5, '#2a1d3a', 'left', 700);
      // 선배 얼굴 (안경)
      const talk = on01(k) && Math.sin(t * 40) > 0 ? 1 : 0;
      g.save();
      g.translate(-24, 26);
      circ(g, 0, 0, 16);
      g.fillStyle = '#ffd9b8';
      g.fill();
      g.fillStyle = '#2b2140';
      g.beginPath();
      g.arc(0, -3, 17, Math.PI * 1.05, Math.PI * 1.95);
      g.fill();
      g.strokeStyle = '#2b2140';
      g.lineWidth = 1.6;
      circ(g, -6, 1, 4.5);
      g.stroke();
      circ(g, 6, 1, 4.5);
      g.stroke();
      g.fillStyle = '#2b2140';
      circ(g, -6, 1, 1.4);
      g.fill();
      circ(g, 6, 1, 1.4);
      g.fill();
      g.beginPath();
      g.ellipse(0, 9, 3.5, 1 + talk * 2.5, 0, 0, TAU);
      g.fillStyle = '#a03050';
      g.fill();
      g.restore();
      txt(g, `${Math.round(p['voice'] ?? 320)}Hz`, 22, 28, 9, 'rgba(255,255,255,0.6)', 'center', 700, MONO);
    },
  },
  i146: {
    caption: '걸음마다 음 ±10% · 크기 ±3dB 를 바꾸고 왼발 · 오른발을 좌우로 — 똑같은 소리가 없음',
    title: '저벅저벅',
    color: '#d6b38a',
    dur: (p) => (0.36 / (p['speed'] ?? 1)) * 6,
    params: [
      { key: 'speed', label: '걸음 빠르기', min: 0.6, max: 2, step: 0.1, value: 1 },
      { key: 'ground', label: '돌바닥 (끄면 흙)', toggle: true, value: false },
    ],
    rec: recSteps,
    lo: 40,
    icon(g, k, _t, p) {
      const stone = p['ground'] ?? 0;
      rr(g, -48, -40, 96, 80, 8);
      g.fillStyle = stone ? '#5d5a70' : '#6b4f35';
      g.fill();
      if (stone)
        for (let i = 0; i < 12; i++) {
          rr(g, -46 + (i % 4) * 24 + (Math.floor(i / 4) % 2) * 8, -38 + Math.floor(i / 4) * 26, 22, 24, 3);
          g.strokeStyle = 'rgba(0,0,0,0.25)';
          g.lineWidth = 1.5;
          g.stroke();
        }
      const n = on01(k) ? Math.floor(k * 6) + 1 : k > 1 ? 6 : 0;
      for (let i = 0; i < n; i++) {
        const x = -36 + i * 14.5;
        const y = i % 2 ? 10 : -12;
        const age = on01(k) ? k * 6 - i : 3;
        g.globalAlpha = clamp(1 - age * 0.12, 0.35, 1);
        g.save();
        g.translate(x, y);
        g.rotate(Math.PI / 2);
        g.fillStyle = stone ? 'rgba(255,255,255,0.35)' : 'rgba(30,14,6,0.6)';
        g.beginPath();
        g.ellipse(0, 0, 9, 5.4, 0, 0, TAU);
        g.fill();
        g.beginPath();
        g.ellipse(-12, 0, 4.4, 3.8, 0, 0, TAU);
        g.fill();
        g.restore();
        g.globalAlpha = 1;
        if (on01(k) && i === n - 1) {
          g.strokeStyle = 'rgba(255,240,210,0.7)';
          g.lineWidth = 1.5;
          circ(g, x, y, 8 + (k * 6 - i) * 8);
          g.stroke();
        }
      }
      txt(g, '왼', -38, 32, 8, 'rgba(255,255,255,0.6)');
      txt(g, '오', -23, 32, 8, 'rgba(255,255,255,0.6)');
    },
  },
  i147: {
    caption: '같은 「톡」 6번 — 변주를 켜면 속도 1±0.05 · 크기 ±2dB · 변형 3개를 돌려 써서 줄무늬가 다 다름',
    title: '톡톡톡',
    color: '#a0e0ff',
    dur: 6 * 0.24 + 0.15,
    params: [{ key: 'vary', label: '라운드 로빈 + 무작위 (끄면 똑같이)', toggle: true, value: true }],
    rec: recRobin,
    note: (p) => ((p['vary'] ?? 1) ? '변형 A · B · C 돌려 쓰기' : '같은 소리 그대로 — 기계 같음'),
    icon(g, k, _t, p) {
      const vary = p['vary'] ?? 1;
      const cur = on01(k) ? Math.min(5, Math.floor((k * 1.59) / 0.24)) : -1;
      const cols = ['#ffb36b', '#8fd8ff', '#c6a2ff'];
      ['A', 'B', 'C'].forEach((s, i) => {
        const x = -30 + i * 30;
        const lit = cur >= 0 && (vary ? cur % 3 === i : i === 0);
        rr(g, x - 11, -40, 22, 22, 5);
        g.fillStyle = lit ? cols[i]! : 'rgba(255,255,255,0.08)';
        g.fill();
        txt(g, s, x, -29, 11, lit ? '#1a1430' : 'rgba(255,255,255,0.5)', 'center', 900);
      });
      for (let i = 0; i < 6; i++) {
        const x = -40 + i * 16;
        const vi = vary ? i % 3 : 0;
        const hgt = vary ? 16 + hash(i * 7) * 12 : 22;
        rr(g, x - 4, 30 - hgt, 8, hgt, 2);
        g.fillStyle = i <= cur ? cols[vi]! : 'rgba(255,255,255,0.12)';
        g.fill();
      }
      txt(g, vary ? '조금씩 다르게' : '똑같이 반복', 0, -6, 9, 'rgba(255,255,255,0.6)');
    },
  },
  i148: {
    caption: '짧은 잡음 타격 + 내려가는 몸통 + 잔향 꼬리 — 층마다 따로 사라짐 (아래 세 줄)',
    title: '쾅 (3층)',
    color: '#ff9f5a',
    dur: 1.05,
    params: [
      { key: 'l0', label: '타격 층', toggle: true, value: true },
      { key: 'l1', label: '몸통 층', toggle: true, value: true },
      { key: 'l2', label: '꼬리 층', toggle: true, value: true },
    ],
    rec: recLayers,
    layers: [
      { name: '타격', color: '#ffe36a', key: 'l0', rec: layHit },
      { name: '몸통', color: '#ff8a3d', key: 'l1', rec: layBody },
      { name: '꼬리', color: '#b88bff', key: 'l2', rec: layTail },
    ],
    lo: 40,
    icon(g, k) {
      const hitK = on01(k) ? clamp(k * 10) : 0;
      const y = on01(k) ? -6 + 0 * hitK : k > 1.5 ? -20 - clamp((k - 1.5) * 2) * 10 : -30;
      ground(g, 30);
      // 종이
      rr(g, -30, 18, 60, 12, 2);
      g.fillStyle = '#f6efe0';
      g.fill();
      // 도장
      g.save();
      g.translate(0, y);
      rr(g, -7, -26, 14, 20, 4);
      g.fillStyle = '#8a5a3a';
      g.fill();
      rr(g, -16, -8, 32, 22, 4);
      g.fillStyle = '#c0392b';
      g.fill();
      g.restore();
      if (on01(k)) {
        circ(g, 0, 24, 14 + k * 30);
        g.strokeStyle = `rgba(255,159,90,${0.8 * (1 - k)})`;
        g.lineWidth = 3;
        g.stroke();
        txt(g, '반려', 0, 24, 9, '#c0392b', 'center', 900);
      } else if (k > 1) {
        g.strokeStyle = '#c0392b';
        g.lineWidth = 1.6;
        rr(g, -12, 19, 24, 10, 2);
        g.stroke();
        txt(g, '반려', 0, 24.5, 7.5, '#c0392b', 'center', 900);
      }
    },
  },
  i149: {
    caption: '사인 120 → 45Hz 0.3초 + 압축 — 가슴에 울리는 「쿵」 (폰 스피커용 위쪽 층도 함께)',
    title: '쿵',
    color: '#6f8bff',
    dur: 0.6,
    params: [
      { key: 'from', label: '시작 음 (Hz)', min: 70, max: 200, step: 5, value: 120 },
      { key: 'to', label: '끝 음 (Hz)', min: 30, max: 70, step: 1, value: 45 },
    ],
    rec: recSub,
    lo: 25,
    icon(g, k) {
      const a = on01(k);
      speaker(g, 0, 2, 24, a ? Math.max(0, Math.sin(k * 60)) * (1 - k) : 0, '#6f8bff');
      if (a) {
        for (let i = 0; i < 3; i++) {
          const r = 26 + ((k * 2 + i / 3) % 1) * 30;
          g.strokeStyle = `rgba(111,139,255,${0.7 * (1 - ((k * 2 + i / 3) % 1))})`;
          g.lineWidth = 3;
          circ(g, 0, 2, r);
          g.stroke();
        }
      }
    },
  },
  i151: {
    caption: '사인 음이 400 → 1200Hz 로 빠르게 오르고 사라지는 「뽁」 — 큰 방울일수록 낮게 시작',
    title: '뽀록',
    color: '#5fc8ff',
    dur: 1.05,
    params: [{ key: 'size', label: '방울 크기', min: 0, max: 1, step: 0.05, value: 0.5 }],
    rec: recBubbles,
    icon(g, k, t, p) {
      const size = p['size'] ?? 0.5;
      rr(g, -48, -10, 96, 52, 6);
      const gr = g.createLinearGradient(0, -10, 0, 42);
      gr.addColorStop(0, 'rgba(95,200,255,0.35)');
      gr.addColorStop(1, 'rgba(30,80,160,0.55)');
      g.fillStyle = gr;
      g.fill();
      g.strokeStyle = 'rgba(180,230,255,0.6)';
      g.lineWidth = 1.5;
      g.beginPath();
      for (let x = -48; x <= 48; x += 3) g.lineTo(x, -10 + Math.sin(x * 0.2 + t * 3) * 1.5);
      g.stroke();
      for (let i = 0; i < 6; i++) {
        const st = (i * 0.16) / 1.05;
        const lk = on01(k) ? (k - st) * 3 : -1;
        const x = -32 + hash(i) * 64;
        const r = 3 + size * 6 + hash(i + 4) * 2;
        if (lk >= 0 && lk < 1) {
          const y = 36 - lk * 50;
          circ(g, x, y, r * (lk > 0.9 ? 1.4 : 1));
          g.strokeStyle = 'rgba(220,245,255,0.9)';
          g.lineWidth = 1.5;
          g.stroke();
          circ(g, x - r * 0.35, y - r * 0.35, r * 0.25);
          g.fillStyle = '#fff';
          g.fill();
        } else if (lk >= 1 && lk < 1.3) {
          for (let j = 0; j < 5; j++) {
            const an = (j / 5) * TAU;
            circ(g, x + Math.cos(an) * (r + (lk - 1) * 30), -14 + Math.sin(an) * (r + (lk - 1) * 30), 1.2);
            g.fillStyle = '#dff6ff';
            g.fill();
          }
        }
      }
    },
  },
  i152: {
    caption: '주사위 덜그럭 — 무작위 딸깍의 간격이 점점 벌어지고, 밑에 구르는 잡음이 깔림',
    title: '달그락',
    color: '#ff7a7a',
    dur: 1.7,
    params: [{ key: 'force', label: '던지는 힘', min: 0.5, max: 2, step: 0.1, value: 1 }],
    rec: recDice,
    icon(g, k) {
      const a = on01(k);
      const e = easeOut(a ? k * 1.1 : 1);
      const x = lerp(-34, 18, e);
      const y = 20 - Math.abs(Math.sin(e * Math.PI * 4)) * 22 * (1 - e);
      const rot = e * Math.PI * 5;
      ground(g, 34);
      shadow(g, x, 34, 14);
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      rr(g, -12, -12, 24, 24, 5);
      g.fillStyle = '#fff';
      g.fill();
      g.strokeStyle = '#c33';
      g.lineWidth = 2;
      g.stroke();
      const face = a && k < 0.95 ? Math.floor(e * 20) % 6 : 5;
      const PIPS = [[[0, 0]], [[-1, -1], [1, 1]], [[-1, -1], [0, 0], [1, 1]], [[-1, -1], [1, -1], [-1, 1], [1, 1]], [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]];
      for (const [px, py] of PIPS[face]!) {
        circ(g, px! * 6, py! * 6, 2.4);
        g.fillStyle = face === 0 ? '#d22' : '#222';
        g.fill();
      }
      g.restore();
    },
  },
  i153: {
    caption: '고역 잡음 「휙」 다음 작은 딸깍 「탁」 — 카드가 반쯤 돌 때 휙, 내려놓을 때 탁',
    title: '팟탁',
    color: '#ffd0a0',
    dur: 0.3,
    rec: recFlip,
    icon(g, k) {
      const a = on01(k);
      const ang = a ? easeIO(clamp(k / 0.5)) * Math.PI : k > 1 ? Math.PI : 0;
      const sx = Math.cos(ang);
      const front = sx < 0;
      g.save();
      g.scale(Math.max(0.04, Math.abs(sx)), 1);
      rr(g, -20, -28, 40, 56, 6);
      g.fillStyle = front ? '#fff8ec' : '#5a4adf';
      g.fill();
      g.strokeStyle = front ? '#d2a060' : '#2e2290';
      g.lineWidth = 2.5;
      g.stroke();
      if (front) {
        txt(g, '7', 0, 2, 26, '#e0485a', 'center', 900);
      } else {
        for (let i = 0; i < 4; i++)
          for (let j = 0; j < 5; j++) {
            star(g, -12 + i * 8, -20 + j * 10, 2.5);
            g.fillStyle = 'rgba(255,255,255,0.35)';
            g.fill();
          }
      }
      g.restore();
      if (a && k > 0.45) {
        g.strokeStyle = `rgba(255,208,160,${1 - k})`;
        g.lineWidth = 2;
        for (const s of [-1, 1]) {
          g.beginPath();
          g.moveTo(s * 26, 24);
          g.lineTo(s * 36, 30);
          g.stroke();
        }
      }
    },
  },
  i154: {
    caption: '쇳소리 5~15개를 0.3초 안에 흩뿌림 — 음 · 때 · 좌우가 모두 무작위인 「차르륵」',
    title: '차르륵',
    color: '#ffd24a',
    dur: 0.6,
    params: [{ key: 'count', label: '동전 수', min: 3, max: 20, step: 1, value: 10 }],
    rec: recCoins,
    icon(g, k, _t, p) {
      const n = Math.round(p['count'] ?? 10);
      // 더미
      for (let i = 0; i < 9; i++) {
        const row = i < 5 ? 0 : i < 8 ? 1 : 2;
        const col = i < 5 ? i : i < 8 ? i - 5 : 0;
        const x = -26 + col * 13 + row * 6.5 + (row === 2 ? 13 : 0);
        const y = 32 - row * 6;
        flatCoin(g, x, y, 9);
      }
      for (let i = 0; i < n; i++) {
        const st = Math.pow(hash(i), 1.4) * 0.35 / 0.6;
        const lk = on01(k) ? (k - st) * 4 : -1;
        const x = -30 + hash(i + 3) * 60;
        if (lk < 0 || lk > 1.3) continue;
        const y = lk < 1 ? lerp(-50, 22, lk * lk) : 22 - Math.sin((lk - 1) * 10) * 6;
        coin(g, x, y, 7, Math.cos(lk * 12 + i));
        if (lk > 1) sparkle(g, x + 6, y - 6, 4, '#fff6c8');
      }
    },
  },
  i155: {
    caption: '톱니파 → 저역 필터, 움직임 빠르기를 따라 음이 오르내림 + 시작 · 끝 딸깍',
    title: '위이잉',
    color: '#9fe870',
    dur: (p) => (p['time'] ?? 0.6) + 0.15,
    params: [{ key: 'time', label: '움직이는 시간 (초)', min: 0.25, max: 1.5, step: 0.05, value: 0.6 }],
    rec: recServo,
    lo: 40,
    icon(g, k, _t, p) {
      const T = (p['time'] ?? 0.6) + 0.15;
      const x = on01(k) ? clamp((k * T - 0.02) / (T - 0.15)) : k > 1 ? 1 : 0;
      const ang = lerp(-0.9, 0.9, easeIO(x));
      // 받침
      rr(g, -26, 22, 52, 14, 4);
      g.fillStyle = '#4a4766';
      g.fill();
      // 톱니
      g.save();
      g.translate(0, 18);
      g.rotate(ang * 2);
      g.beginPath();
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU;
        const rad = i % 2 ? 11 : 14;
        g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      g.closePath();
      g.fillStyle = '#9fe870';
      g.fill();
      circ(g, 0, 0, 4);
      g.fillStyle = '#2c3a20';
      g.fill();
      g.restore();
      // 팔
      g.save();
      g.translate(0, 18);
      g.rotate(ang - Math.PI / 2);
      rr(g, -5, -5, 46, 10, 5);
      g.fillStyle = '#cfd8e8';
      g.fill();
      g.strokeStyle = '#4a4766';
      g.lineWidth = 2;
      g.stroke();
      circ(g, 42, 0, 6);
      g.fillStyle = '#ff7a7a';
      g.fill();
      g.restore();
      // 빠르기 막대
      const sp = on01(k) ? Math.sin(Math.PI * x) : 0;
      rr(g, 32, 30 - sp * 40, 8, sp * 40 + 1, 2);
      g.fillStyle = '#9fe870';
      g.fill();
      txt(g, '빠르기', 36, 38, 7, 'rgba(255,255,255,0.55)');
    },
  },
  i157: {
    caption: '다가올 땐 높게, 지나가면 낮게 — f × c/(c + v방향) 로 음을 바꾸고 좌우로 이동',
    title: '니이이용',
    color: '#ffcf5a',
    dur: 2.7,
    params: [{ key: 'speed', label: '차 속도 (m/s)', min: 8, max: 80, step: 2, value: 40 }],
    rec: recDoppler,
    note: (p) => `${Math.round((p['speed'] ?? 40) * 3.6)} km/h`,
    lo: 50,
    icon(g, k, t, p) {
      const v = p['speed'] ?? 40;
      const a = on01(k);
      const x = a ? lerp(-60, 60, k) : -60;
      ground(g, 16);
      // 듣는 사람
      g.fillStyle = '#ffd9b8';
      circ(g, 0, 34, 6);
      g.fill();
      txt(g, '나', 0, 45, 7, 'rgba(255,255,255,0.6)');
      // 물결: 앞쪽은 촘촘
      if (a)
        for (let i = 0; i < 6; i++) {
          const age = ((t * 3 + i / 6) % 1) * 1.0;
          const ex = x - age * v * 0.9;
          circ(g, ex, 4, age * 40);
          g.strokeStyle = `rgba(255,207,90,${0.5 * (1 - age)})`;
          g.lineWidth = 1.5;
          g.stroke();
        }
      g.save();
      g.translate(x, 4);
      rr(g, -16, -8, 32, 12, 4);
      g.fillStyle = '#ff5a5a';
      g.fill();
      rr(g, -9, -15, 16, 8, 3);
      g.fillStyle = '#ffb0a0';
      g.fill();
      for (const wx of [-9, 9]) {
        circ(g, wx, 5, 4);
        g.fillStyle = '#222';
        g.fill();
      }
      g.restore();
    },
  },
  i158: {
    caption: '같은 가락을 벽 없이 → 벽 뒤에서 — 저역 필터로 고음이 잘리고 작아짐 (오른쪽 반이 어두움)',
    title: '웅웅',
    color: '#9db4ff',
    dur: 1.3,
    previewDur: 2.55,
    params: [
      { key: 'wall', label: '벽 뒤에서 듣기', toggle: true, value: true },
      { key: 'thick', label: '벽 두께', min: 0, max: 1, step: 0.05, value: 0.5 },
    ],
    rec: recOcclude,
    preview: prevOcclude,
    extra: (api) => [{ type: 'button', label: '벽 없이 → 벽 뒤 비교', on: () => api.play(prevOcclude, 2.55) }],
    icon(g, k, _t, p) {
      const behind = k > 0.49 && k <= 1 ? 1 : 0;
      const thick = p['thick'] ?? 0.5;
      speaker(g, -30, 0, 15, on01(k) ? 0.6 : 0, '#9db4ff');
      // 벽
      const wx = 2;
      if (behind || !on01(k)) {
        rr(g, wx - 4 - thick * 5, -34, 8 + thick * 10, 68, 2);
        g.fillStyle = '#7a6a5a';
        g.fill();
        for (let i = 0; i < 6; i++) {
          g.strokeStyle = 'rgba(0,0,0,0.3)';
          g.beginPath();
          g.moveTo(wx - 4 - thick * 5, -34 + i * 11);
          g.lineTo(wx + 4 + thick * 5, -34 + i * 11);
          g.stroke();
        }
      }
      // 귀
      g.fillStyle = '#ffd9b8';
      g.beginPath();
      g.ellipse(34, 0, 9, 13, 0, 0, TAU);
      g.fill();
      g.strokeStyle = '#c08060';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(34, 0, 5, -1.2, 1.6);
      g.stroke();
      if (on01(k)) {
        const muff = behind;
        for (let i = 0; i < 3; i++) {
          const ph = (k * 4 + i / 3) % 1;
          const xx = -12 + ph * 40;
          if (muff && xx > wx) continue;
          g.strokeStyle = `rgba(157,180,255,${0.8 * (1 - ph)})`;
          g.lineWidth = 2;
          g.beginPath();
          g.arc(xx - 10, 0, 12, -0.6, 0.6);
          g.stroke();
        }
        if (muff) {
          g.strokeStyle = 'rgba(157,180,255,0.35)';
          g.lineWidth = 4;
          g.beginPath();
          g.arc(16, 0, 10, -0.5, 0.5);
          g.stroke();
        }
      }
      txt(g, behind || !on01(k) ? '벽 뒤' : '벽 없음', 0, 42, 8, 'rgba(255,255,255,0.6)');
    },
  },
  i159: {
    caption: '코드로 만든 잔향(지수로 사라지는 잡음)과 섞기 — 방이 클수록 꼬리가 길게 남음',
    title: '쿵…웅…',
    color: '#c9a0ff',
    dur: (p) => 0.6 + (p['size'] ?? 1.6),
    params: [
      { key: 'size', label: '방 크기 = 꼬리 길이 (초)', min: 0.2, max: 4, step: 0.1, value: 1.6 },
      { key: 'wet', label: '잔향 섞는 양', min: 0, max: 1, step: 0.05, value: 0.6 },
    ],
    rec: recReverb,
    note: (p) => ((p['size'] ?? 1.6) < 0.6 ? '작은 방' : (p['size'] ?? 1.6) < 2 ? '교실 · 강당' : '큰 동굴'),
    icon(g, k, _t, p) {
      const size = p['size'] ?? 1.6;
      const R = 14 + size * 8;
      // 동굴 아치
      g.fillStyle = '#2a2140';
      g.beginPath();
      g.ellipse(0, 30, R + 14, R + 6, 0, Math.PI, TAU);
      g.fill();
      g.fillStyle = '#120d22';
      g.beginPath();
      g.ellipse(0, 30, R, R - 4, 0, Math.PI, TAU);
      g.fill();
      ground(g, 30);
      // 반사 선
      if (on01(k)) {
        for (let i = 0; i < 8; i++) {
          const an = Math.PI + (i + 0.5) * (Math.PI / 8);
          const ph = clamp(k * (2.2 / size) * 2 - i * 0.05);
          g.strokeStyle = `rgba(201,160,255,${0.7 * (1 - clamp(k * 1.1))})`;
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(0, 26);
          const ex = Math.cos(an) * R;
          const ey = 30 + Math.sin(an) * (R - 4);
          g.lineTo(lerp(0, ex, ph), lerp(26, ey, ph));
          if (ph >= 1) g.lineTo(lerp(ex, 0, clamp(k * 3)), lerp(ey, 26, clamp(k * 3)));
          g.stroke();
        }
      }
      circ(g, 0, 24, 5);
      g.fillStyle = '#ffd9b8';
      g.fill();
    },
  },
  i160: {
    caption: '「야호~」 뒤 DelayNode + 되먹임(<0.6) + 고리 안 저역 필터 — 메아리가 점점 작고 먹먹하게',
    title: '야호~',
    color: '#7fe0a0',
    dur: (p) => 0.7 + (p['time'] ?? 0.32) * (2 + 10 * (p['fb'] ?? 0.5)),
    params: [
      { key: 'time', label: '메아리 간격 (초)', min: 0.1, max: 0.7, step: 0.02, value: 0.32 },
      { key: 'fb', label: '되먹임 (0.6 넘지 않게)', min: 0, max: 0.6, step: 0.02, value: 0.5 },
    ],
    rec: recEcho,
    icon(g, k, _t, p) {
      // 산
      g.fillStyle = '#2f5a48';
      g.beginPath();
      g.moveTo(-50, 34);
      g.lineTo(-20, -18);
      g.lineTo(4, 34);
      g.fill();
      g.fillStyle = '#3f7a5a';
      g.beginPath();
      g.moveTo(-6, 34);
      g.lineTo(28, -30);
      g.lineTo(56, 34);
      g.fill();
      g.fillStyle = '#e8f4ff';
      g.beginPath();
      g.moveTo(28, -30);
      g.lineTo(21, -17);
      g.lineTo(35, -17);
      g.fill();
      blob(g, -36, 24, 7, '#ffd36a', 1, 1, 'happy');
      if (on01(k)) {
        const T = (p['time'] ?? 0.32) / ((0.7 + (p['time'] ?? 0.32) * (2 + 10 * (p['fb'] ?? 0.5))) || 1);
        for (let i = 0; i < 6; i++) {
          const ph = (k - i * T) / (T * 1.6);
          if (ph < 0 || ph > 1) continue;
          const amp = Math.pow(p['fb'] ?? 0.5, i);
          g.strokeStyle = `rgba(127,224,160,${amp * (1 - ph)})`;
          g.lineWidth = 2;
          g.beginPath();
          const dir = i % 2 ? Math.PI : 0;
          const cx = i % 2 ? 20 : -36;
          g.arc(cx, 10, 8 + ph * 40, dir - 0.5, dir + 0.5);
          g.stroke();
          if (i === 0) txt(g, '야호~', -20, -36, 11, '#7fe0a0', 'center', 900);
        }
      }
    },
  },
};

// ═════════════════════ 반복 소리 (켜기 · 끄기) 공용 ═════════════════════

/** 짧은 앞날 예약기 — 25~50ms 마다 깨어나 [다음, 지금 + ahead) 의 일을 미리 예약 (setTimeout 은 늦어도 소리는 정확) */
class Ahead {
  private id = 0;
  next = 0;
  constructor(
    private ac: AudioContext,
    private fn: (from: number, to: number) => void,
    private ahead = 0.2,
  ) {}
  start(t0: number): void {
    this.next = t0;
    this.tick();
    this.id = window.setInterval(() => this.tick(), 40);
  }
  private tick(): void {
    const to = this.ac.currentTime + this.ahead;
    if (to > this.next) {
      this.fn(this.next, to);
      this.next = to;
    }
  }
  stop(): void {
    clearInterval(this.id);
  }
}

// ── 환경음 (Farnell 방식: 걸러낸 잡음 + 무작위 사건) ──
const AMB = ['비', '바람', '모닥불', '시냇물'];
interface AmbBed {
  srcs: AudioScheduledSourceNode[];
  bps: BiquadFilterNode[];
}
function ambBed(c: BA, out: AudioNode, t0: number, mode: number, r: Rnd): AmbBed {
  const srcs: AudioScheduledSourceNode[] = [];
  const bps: BiquadFilterNode[] = [];
  const lfo = (f: number, depth: number, target: AudioParam): void => {
    const o = osc(c, 'sine', f, t0, 0);
    const g = gainN(c, depth);
    chain(o, g);
    g.connect(target);
    srcs.push(o);
  };
  if (mode === 0) {
    const n = noise(c, t0, 0, r);
    chain(n, filt(c, 'highpass', 1600), filt(c, 'lowpass', 9000), gainN(c, 0.2), out);
    const n2 = noise(c, t0, 0, r);
    chain(n2, filt(c, 'lowpass', 600), gainN(c, 0.16), out);
    srcs.push(n, n2);
  } else if (mode === 1) {
    for (const [f, q, lf, la, v] of [
      [450, 2.5, 0.13, 260, 0.5],
      [1300, 6, 0.21, 600, 0.22],
    ] as const) {
      const n = noise(c, t0, 0, r);
      const bp = filt(c, 'bandpass', f, q);
      const g = gainN(c, v);
      chain(n, bp, g, out);
      lfo(lf, la, bp.frequency);
      lfo(lf * 0.7, v * 0.8, g.gain);
      srcs.push(n);
    }
  } else if (mode === 2) {
    const b = noise(c, t0, 0, r, true);
    chain(b, filt(c, 'lowpass', 420), gainN(c, 0.9), out);
    const h = noise(c, t0, 0, r);
    const hg = gainN(c, 0.025);
    chain(h, filt(c, 'highpass', 4500), hg, out);
    lfo(0.6, 0.015, hg.gain);
    srcs.push(b, h);
  } else {
    const n = noise(c, t0, 0, r);
    for (let i = 0; i < 5; i++) {
      const bp = filt(c, 'bandpass', 400 + i * 300, 9);
      const g = gainN(c, 0.5);
      chain(n, bp, g, out);
      bps.push(bp);
    }
    const h = noise(c, t0, 0, r);
    chain(h, filt(c, 'highpass', 3000), gainN(c, 0.05), out);
    srcs.push(n, h);
  }
  return { srcs, bps };
}
function ambEvents(c: BA, out: AudioNode, mode: number, from: number, to: number, r: Rnd, bps: BiquadFilterNode[]): void {
  if (mode === 0) {
    // 빗방울 딸깍 (초당 ~30)
    for (let t = from + r() * 0.03; t < to; t += -Math.log(1 - r() * 0.999) / 30) {
      const f = 1800 + r() * 3500;
      const o = osc(c, 'sine', f, t, 0.03);
      o.frequency.exponentialRampToValueAtTime(f * 0.45, t + 0.025);
      o.connect(envG(c, out, t, 0.001, 0, 0.025, 0.04 + r() * 0.12));
    }
  } else if (mode === 2) {
    // 탁탁 튀는 소리 (가끔 몰려서)
    for (let t = from + r() * 0.1; t < to; t += -Math.log(1 - r() * 0.999) / 7) {
      const burst = r() < 0.25 ? 3 : 1;
      for (let b = 0; b < burst; b++) {
        const tt = t + b * (0.01 + r() * 0.03);
        const n = noise(c, tt, 0.012, r);
        chain(n, filt(c, 'highpass', 1500 + r() * 2500), envG(c, out, tt, 0.0005, 0.001, 0.006 + r() * 0.01, 0.3 + r() * 0.6));
      }
    }
  } else if (mode === 3) {
    // 물 소리: 좁은 필터 중심이 쉴 새 없이 무작위로 + 가끔 방울
    for (let t = from; t < to; t += 0.035) for (const bp of bps) bp.frequency.setTargetAtTime(300 + Math.pow(r(), 1.6) * 1700, t, 0.012);
    for (let t = from + r() * 0.2; t < to; t += -Math.log(1 - r() * 0.999) / 4) {
      const f0 = 500 + r() * 500;
      const o = osc(c, 'sine', f0, t, 0.07);
      o.frequency.exponentialRampToValueAtTime(f0 * 2.4, t + 0.05);
      o.connect(envG(c, out, t, 0.002, 0.005, 0.05, 0.08));
    }
  }
}
function ambRec(mode: number): Rec {
  return (c, out, t0, _p, r) => {
    const b = ambBed(c, out, t0, mode, r);
    ambEvents(c, out, mode, t0, t0 + 3, r, b.bps);
  };
}
function ambIcon(g: G, mode: number, t: number, on: number): void {
  if (mode === 0) {
    // 구름 · 빗줄기 · 물웅덩이
    g.fillStyle = '#5b6a8f';
    for (const [x, y, r0] of [
      [-20, -34, 14],
      [0, -40, 18],
      [20, -34, 14],
      [-8, -28, 13],
      [10, -28, 13],
    ] as const) {
      circ(g, x, y, r0);
      g.fill();
    }
    g.strokeStyle = 'rgba(170,210,255,0.8)';
    g.lineWidth = 1.6;
    for (let i = 0; i < 22; i++) {
      const x = -34 + hash(i) * 68;
      const ph = (t * (1.6 + hash(i + 3)) + hash(i + 7)) % 1;
      const y = -22 + ph * 52;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x - 1.5, y + 6);
      g.stroke();
    }
    g.fillStyle = 'rgba(80,120,190,0.4)';
    g.beginPath();
    g.ellipse(0, 36, 40, 7, 0, 0, TAU);
    g.fill();
    for (let i = 0; i < 4; i++) {
      const ph = (t * 1.3 + i / 4) % 1;
      g.strokeStyle = `rgba(190,220,255,${0.7 * (1 - ph)})`;
      g.beginPath();
      g.ellipse(-24 + hash(i + 11) * 48, 36, ph * 10, ph * 2.5, 0, 0, TAU);
      g.stroke();
    }
  } else if (mode === 1) {
    for (let i = 0; i < 6; i++) {
      const y = -30 + i * 12;
      const sh = ((t * (0.6 + hash(i) * 0.6) + hash(i + 2)) % 1) * 140 - 70;
      g.strokeStyle = `rgba(200,230,255,${0.25 + 0.3 * hash(i + 5)})`;
      g.lineWidth = 2;
      g.beginPath();
      for (let x = -30; x <= 30; x += 3) g.lineTo(sh + x, y + Math.sin((x + t * 60) * 0.08) * 4);
      g.stroke();
    }
    for (let i = 0; i < 4; i++) {
      const ph = (t * 0.5 + i / 4) % 1;
      const x = -55 + ph * 110;
      const y = -10 + Math.sin(ph * 8 + i) * 18;
      g.save();
      g.translate(x, y);
      g.rotate(ph * 12);
      g.fillStyle = ['#ffb84d', '#ff7a4d', '#9fe870', '#ffd84d'][i]!;
      g.beginPath();
      g.ellipse(0, 0, 6, 3, 0, 0, TAU);
      g.fill();
      g.restore();
    }
  } else if (mode === 2) {
    // 장작
    g.save();
    g.translate(0, 30);
    for (const a of [-0.35, 0.35]) {
      g.save();
      g.rotate(a);
      rr(g, -30, -5, 60, 10, 5);
      g.fillStyle = '#6b3f22';
      g.fill();
      g.restore();
    }
    g.restore();
    const fl = (s: number, col: string, ph: number): void => {
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(-18 * s, 26);
      const top = -36 * s - Math.sin(t * 9 + ph) * 5 * s;
      g.bezierCurveTo(-24 * s, 0, -6 * s + Math.sin(t * 7 + ph) * 4, -10 * s, Math.sin(t * 5 + ph) * 5, top);
      g.bezierCurveTo(8 * s + Math.sin(t * 6 + ph) * 3, -10 * s, 24 * s, 0, 18 * s, 26);
      g.closePath();
      g.fill();
    };
    fl(1, '#ff5a2a', 0);
    fl(0.75, '#ffa02a', 1);
    fl(0.45, '#ffe48a', 2);
    for (let i = 0; i < 6; i++) {
      const ph = (t * 0.8 + hash(i)) % 1;
      circ(g, (hash(i + 4) - 0.5) * 30 + Math.sin(ph * 9) * 5, 10 - ph * 60, 1.4);
      g.fillStyle = `rgba(255,200,90,${1 - ph})`;
      g.fill();
    }
  } else {
    rr(g, -48, -14, 96, 40, 6);
    const gr = g.createLinearGradient(0, -14, 0, 26);
    gr.addColorStop(0, '#3fa0d8');
    gr.addColorStop(1, '#1c4f8a');
    g.fillStyle = gr;
    g.fill();
    for (let i = 0; i < 9; i++) {
      const y = -8 + (i % 4) * 9;
      const x = (((t * 40 + hash(i) * 200) % 120) - 60) | 0;
      g.strokeStyle = 'rgba(220,245,255,0.6)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 6, y - 2, x + 12, y);
      g.stroke();
    }
    for (const [x, y, rx] of [
      [-30, 22, 9],
      [14, 26, 12],
      [36, 18, 7],
    ] as const) {
      g.fillStyle = '#7d7a90';
      g.beginPath();
      g.ellipse(x, y, rx, rx * 0.55, 0, 0, TAU);
      g.fill();
    }
  }
  if (on) {
    g.fillStyle = '#ff5c6c';
    circ(g, 42, -42, 3 + Math.sin(t * 6));
    g.fill();
  }
}

/** 환경음 · 엔진 · 그레인처럼 「켜 두는」 소리 견본의 공용 틀 */
interface LoopSpec {
  caption: string;
  color: string;
  title: (st: LoopState) => string;
  lo?: number;
  /** 미리 보기 (오프라인 3초 남짓) */
  preview: (st: LoopState) => { key: string; rec: Rec; dur: number };
  /** 실시간 시작 — 멈추는 함수 돌려줌 */
  start: (ac: AudioContext, out: AudioNode, st: LoopState) => () => void;
  icon: (g: G, k: number, t: number, st: LoopState) => void;
  /** 카드에서 저절로 바뀌는 모드 수 (1 이면 안 바뀜) */
  cycle?: number;
  controls: (st: LoopState, api: LoopApi) => Control[];
  note?: (st: LoopState) => string;
}
interface LoopState {
  mode: number;
  /** 사용자가 모드를 고름 (카드처럼 저절로 돌지 않음) */
  picked: boolean;
  on: boolean;
  v: Record<string, number>;
  /** 실시간 조절 훅 (시작 함수가 넣어 둠) */
  live?: (key: string, v: number) => void;
}
interface LoopApi {
  setOn(on: boolean): void;
  restart(): void;
  reload(): void;
}
function loopDemo(id: string, s: LoopSpec, v0: Record<string, number> = {}): Demo2D {
  return {
    kind: '2d',
    caption: s.caption,
    make() {
      const st: LoopState = { mode: 0, picked: false, on: false, v: { ...v0 } };
      const cache = new Map<string, Prev>();
      let wantKey = '';
      let timer = 0;
      const ensure = (): Prev | null => {
        const pv = s.preview(st);
        const key = pv.key;
        const hit = cache.get(key);
        if (hit) return hit;
        if (wantKey !== key) {
          wantKey = key;
          void getPrev(id + key, pv.rec, pv.dur, {}, s.lo ?? 60).then((x) => cache.set(key, x));
        }
        return null;
      };
      const bus = new Bus();
      let stop: (() => void) | null = null;
      const api: LoopApi = {
        setOn(on) {
          st.on = on;
          if (stop) {
            stop();
            stop = null;
          }
          bus.kill();
          st.live = undefined;
          if (on) {
            const ac = audio();
            stop = s.start(ac, bus.node(), st);
          }
        },
        restart() {
          if (st.on) api.setOn(true);
        },
        reload() {
          clearTimeout(timer);
          timer = window.setTimeout(() => ensure(), 150);
        },
      };
      let lastMode = -1;
      return {
        controls: s.controls(st, api),
        draw(g, w, h, t) {
          if (!st.picked && (s.cycle ?? 1) > 1) st.mode = Math.floor(t / 4) % (s.cycle ?? 1);
          if (st.mode !== lastMode) lastMode = st.mode;
          const prev = ensure();
          const dur = s.preview(st).dur;
          const k = (t % dur) / dur;
          drawShot(g, w, h, t, {
            color: s.color,
            title: s.title(st),
            prev,
            dur,
            k,
            lo: s.lo ?? 60,
            live: st.on,
            note: s.note ? s.note(st) : '',
            icon: (gg) => s.icon(gg, k, t, st),
            liveLabel: st.on ? '실시간 소리 · AnalyserNode (켜져 있음)' : '실시간 소리 · AnalyserNode — ▶ 켜기 를 켜 보세요',
          });
        },
        dispose() {
          clearTimeout(timer);
          if (stop) stop();
          bus.kill();
        },
      };
    },
  };
}

// ── 엔진 ──
const rpmOf = (speed: number): number => 850 + speed * 50;
interface Engine {
  set(speed: number, t: number, tc?: number): void;
  srcs: AudioScheduledSourceNode[];
}
function engine(c: BA, out: AudioNode, t0: number, r: Rnd): Engine {
  const cyl = 4;
  const saw = osc(c, 'sawtooth', 30, t0, 0);
  const sub = osc(c, 'square', 15, t0, 0);
  const hi = osc(c, 'sine', 60, t0, 0);
  const am = osc(c, 'sine', 30, t0, 0);
  const n = noise(c, t0, 0, r);
  const lp = filt(c, 'lowpass', 500, 2);
  const bp = filt(c, 'bandpass', 120, 2);
  const amG = gainN(c, 0.6);
  const amD = gainN(c, 0.4);
  chain(am, amD);
  amD.connect(amG.gain);
  saw.connect(lp);
  chain(sub, gainN(c, 0.5), lp);
  chain(hi, gainN(c, 0.3), lp);
  chain(n, bp, gainN(c, 0.6), lp);
  chain(lp, shaper(c, 3), amG, gainN(c, 0.5), out);
  const set = (speed: number, t: number, tc = 0.08): void => {
    const f0 = (rpmOf(speed) / 60) * (cyl / 2);
    saw.frequency.setTargetAtTime(f0, t, tc);
    sub.frequency.setTargetAtTime(f0 / 2, t, tc);
    hi.frequency.setTargetAtTime(f0 * 2, t, tc);
    am.frequency.setTargetAtTime(f0 / 2, t, tc);
    bp.frequency.setTargetAtTime(f0 * 3, t, tc);
    lp.frequency.setTargetAtTime(300 + rpmOf(speed) * 0.35, t, tc);
  };
  set(0, t0, 0.001);
  return { set, srcs: [saw, sub, hi, am, n] };
}
/** 미리 보기 속도 곡선: 0 → 100 → 0 */
const ENG_DUR = 3.2;
const engCurve = (x: number): number => 100 * Math.sin(Math.PI * clamp(x)) ** 1.4;
function carIcon(g: G, t: number, speed: number): void {
  // 길
  rr(g, -50, 14, 100, 26, 3);
  g.fillStyle = '#2b2a3c';
  g.fill();
  g.strokeStyle = '#ffd84d';
  g.lineWidth = 2;
  g.setLineDash([8, 7]);
  g.lineDashOffset = t * speed * 2;
  g.beginPath();
  g.moveTo(-50, 27);
  g.lineTo(50, 27);
  g.stroke();
  g.setLineDash([]);
  // 차
  const bob = Math.sin(t * (10 + speed * 0.4)) * (0.6 + speed * 0.01);
  g.save();
  g.translate(-12, 8 + bob);
  rr(g, -22, -10, 44, 14, 5);
  g.fillStyle = '#ff5a5a';
  g.fill();
  rr(g, -12, -19, 22, 11, 4);
  g.fillStyle = '#ffb0a0';
  g.fill();
  for (const wx of [-13, 13]) {
    circ(g, wx, 5, 5.5);
    g.fillStyle = '#1a1a24';
    g.fill();
    g.save();
    g.translate(wx, 5);
    g.rotate(t * speed * 0.4);
    g.strokeStyle = '#888';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(-3, 0);
    g.lineTo(3, 0);
    g.stroke();
    g.restore();
  }
  // 배기 연기
  for (let i = 0; i < 3; i++) {
    const ph = (t * (1 + speed * 0.03) + i / 3) % 1;
    circ(g, -26 - ph * 16, 0 - ph * 6, 2 + ph * 4);
    g.fillStyle = `rgba(200,200,220,${0.4 * (1 - ph)})`;
    g.fill();
  }
  g.restore();
  // 회전계
  g.save();
  g.translate(30, -22);
  circ(g, 0, 0, 18);
  g.fillStyle = '#100d20';
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.3)';
  g.lineWidth = 1.5;
  g.stroke();
  g.strokeStyle = '#ff5a5a';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(0, 0, 15, Math.PI * 0.75 + Math.PI * 1.5 * 0.8, Math.PI * 2.25);
  g.stroke();
  const a = Math.PI * 0.75 + Math.PI * 1.5 * clamp(rpmOf(speed) / 6500);
  g.strokeStyle = '#ffd84d';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(Math.cos(a) * 14, Math.sin(a) * 14);
  g.stroke();
  txt(g, `${Math.round(rpmOf(speed))}`, 0, 9, 6.5, '#fff', 'center', 800, MONO);
  txt(g, 'rpm', 0, 15, 5, 'rgba(255,255,255,0.6)');
  g.restore();
}

// ── 그레인 ──
const GSRC = new WeakMap<BA, AudioBuffer>();
/** 알갱이로 쪼갤 원본: 비브라토 있는 「아~」 노랫소리 + 종소리 (코드로 바로 계산) */
function grainSource(c: BA): AudioBuffer {
  const hit = GSRC.get(c);
  if (hit) return hit;
  const sr = c.sampleRate;
  const len = Math.floor(sr * 1.6);
  const b = c.createBuffer(1, len, sr);
  const d = b.getChannelData(0);
  const form = (f: number): number => Math.exp(-(((f - 750) / 260) ** 2)) + 0.6 * Math.exp(-(((f - 1250) / 300) ** 2)) + 0.25 * Math.exp(-(((f - 2600) / 400) ** 2));
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const f0 = 220 * st2(Math.floor(t / 0.4) * 2 + 3 * (t > 1.2 ? 1 : 0)) * (1 + 0.012 * Math.sin(TAU * 5.5 * t));
    ph += f0 / sr;
    let v = 0;
    for (let hN = 1; hN <= 14; hN++) v += (form(f0 * hN) / hN) * Math.sin(TAU * ph * hN);
    const bell = Math.sin(TAU * 1320 * t) * Math.exp(-((t % 0.4) * 9)) * 0.25;
    d[i] = (v * 0.5 + bell) * Math.min(1, t * 20, (1.6 - t) * 20);
  }
  GSRC.set(c, b);
  return b;
}
const HANN = new Float32Array(32).map((_, i) => Math.max(0.0001, Math.sin((Math.PI * i) / 31) ** 2));
function grains(c: BA, out: AudioNode, from: number, to: number, v: Record<string, number>, r: Rnd): void {
  const buf = grainSource(c);
  const size = (v['size'] ?? 50) / 1000;
  const dens = v['dens'] ?? 30;
  const pos = v['pos'] ?? 0.4;
  const spread = v['spread'] ?? 0.2;
  const pitch = v['pitch'] ?? 2;
  for (let t = from; t < to; t += (1 / dens) * (0.6 + r() * 0.8)) {
    const s = c.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = st2((r() - 0.5) * 2 * pitch);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.setValueCurveAtTime(HANN, t, size);
    const pn = pan(c, (r() - 0.5) * 1.2);
    chain(s, g, gainN(c, 0.5), pn, out);
    const at = clamp(pos + (r() - 0.5) * spread, 0, 0.98) * (buf.duration - size * 2);
    s.start(t, at, size * 2);
    s.stop(t + size + 0.01);
  }
}

const LOOPS: Record<string, { spec: LoopSpec; v0?: Record<string, number> }> = {
  i150: {
    spec: {
      caption: '걸러낸 잡음으로 만든 비 · 바람 · 모닥불 · 시냇물 — 소리 파일 0개 (Farnell 방식)',
      color: '#7cc8ff',
      title: (st) => AMB[st.mode]!,
      cycle: 4,
      lo: 40,
      note: (st) => ['고역 잡음 + 빗방울 딸깍', '천천히 움직이는 대역 필터', '갈색 잡음 + 탁탁', '좁은 필터가 무작위로 출렁'][st.mode]!,
      preview: (st) => ({ key: 'amb' + st.mode, rec: ambRec(st.mode), dur: 3 }),
      start(ac, out, st) {
        const r = Math.random;
        const t0 = ac.currentTime + 0.05;
        const fade = gainN(ac, 0);
        fade.gain.setTargetAtTime(1, t0, 0.3);
        fade.connect(out);
        const bed = ambBed(ac, fade, t0, st.mode, r);
        const sch = new Ahead(ac, (a, b) => ambEvents(ac, fade, st.mode, a, b, r, bed.bps), 0.25);
        sch.start(t0);
        return () => {
          sch.stop();
          for (const s of bed.srcs) s.stop();
        };
      },
      icon: (g, _k, t, st) => ambIcon(g, st.mode, t, st.on ? 1 : 0),
      controls: (st, api) => [
        { type: 'toggle', label: '▶ 켜기 / ■ 끄기', value: false, on: (v) => api.setOn(v) },
        ...AMB.map(
          (name, i): Control => ({
            type: 'button',
            label: name,
            on: () => {
              st.mode = i;
              st.picked = true;
              api.restart();
            },
          }),
        ),
      ],
    },
  },
  i156: {
    spec: {
      caption: 'rpm/60 × 실린더 수 ÷ 2 = 기본 음 — 배음 합 + 필터, 속도가 오르면 음 · 밝기가 함께 오름',
      color: '#ff7a5a',
      title: () => '부릉부릉',
      lo: 20,
      note: (st) => (st.on ? `${Math.round(st.v['speed'] ?? 30)} km/h · 기본 음 ${((rpmOf(st.v['speed'] ?? 30) / 60) * 2).toFixed(0)}Hz` : '미리 보기: 0 → 100 → 0 km/h'),
      preview: () => ({
        key: 'eng',
        dur: ENG_DUR,
        rec: (c, out, t0, _p, r) => {
          const e = engine(c, out, t0, r);
          for (let i = 0; i <= 64; i++) e.set(engCurve(i / 64), t0 + (i / 64) * ENG_DUR, 0.03);
        },
      }),
      start(ac, out, st) {
        const t0 = ac.currentTime + 0.05;
        const fade = gainN(ac, 0);
        fade.gain.setTargetAtTime(1, t0, 0.15);
        fade.connect(out);
        const e = engine(ac, fade, t0, Math.random);
        e.set(st.v['speed'] ?? 30, t0, 0.001);
        st.live = (k, v) => {
          if (k === 'speed') e.set(v, ac.currentTime, 0.12);
        };
        return () => {
          for (const s of e.srcs) s.stop();
        };
      },
      icon: (g, k, t, st) => carIcon(g, t, st.on ? (st.v['speed'] ?? 30) : engCurve(k)),
      controls: (st, api) => [
        { type: 'toggle', label: '▶ 켜기 / ■ 끄기 (시동)', value: false, on: (v) => api.setOn(v) },
        {
          type: 'range',
          label: '속도 (km/h)',
          min: 0,
          max: 110,
          step: 1,
          value: 30,
          on: (v) => {
            st.v['speed'] = v;
            st.live?.('speed', v);
          },
        },
      ],
    },
    v0: { speed: 30 },
  },
  i169: {
    spec: {
      caption: '짧은 노랫소리를 20~80ms 알갱이로 잘게 흩뿌려 — 끝없이 이어지는 신비한 소리',
      color: '#c08bff',
      title: () => '알갱이 구름',
      lo: 60,
      note: (st) => `${Math.round(st.v['size'] ?? 50)}ms × 초당 ${Math.round(st.v['dens'] ?? 30)}개`,
      preview: (st) => ({
        key: 'gr' + JSON.stringify(st.v),
        dur: 3,
        rec: (c, out, t0, _p, r) => grains(c, out, t0, t0 + 2.9, st.v, r),
      }),
      start(ac, out, st) {
        const t0 = ac.currentTime + 0.05;
        const sch = new Ahead(ac, (a, b) => grains(ac, out, a, b, st.v, Math.random), 0.15);
        sch.start(t0);
        return () => sch.stop();
      },
      icon(g, _k, t, st) {
        const pos = st.v['pos'] ?? 0.4;
        const spread = st.v['spread'] ?? 0.2;
        const size = (st.v['size'] ?? 50) / 1000;
        // 원본 소리 띠
        rr(g, -46, 18, 92, 22, 4);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fill();
        g.strokeStyle = 'rgba(192,139,255,0.7)';
        g.lineWidth = 1;
        g.beginPath();
        for (let i = 0; i <= 92; i++) {
          const a = Math.sin(i * 0.9) * Math.sin(i * 0.23 + 1) * 8;
          g.moveTo(-46 + i, 29 - Math.abs(a));
          g.lineTo(-46 + i, 29 + Math.abs(a));
        }
        g.stroke();
        const cx = -46 + pos * 92;
        rr(g, cx - (spread * 92) / 2, 16, spread * 92, 26, 3);
        g.fillStyle = 'rgba(192,139,255,0.18)';
        g.fill();
        g.strokeStyle = '#ffffff';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(cx, 14);
        g.lineTo(cx, 44);
        g.stroke();
        txt(g, '원본 1.6초', -46, 48, 6.5, 'rgba(255,255,255,0.5)', 'left');
        // 날아오르는 알갱이 (창 모양 = 한 알)
        const n = 26;
        for (let i = 0; i < n; i++) {
          const life = 1.1;
          const ph = ((t + hash(i) * life) % life) / life;
          const sx = cx + (hash(i + 50 + Math.floor((t + hash(i) * life) / life) * 7) - 0.5) * spread * 92;
          const x = sx + (hash(i + 9) - 0.5) * 60 * ph;
          const y = 14 - ph * 58;
          const w0 = 4 + size * 120;
          g.globalAlpha = (1 - ph) * 0.95;
          g.fillStyle = `hsl(${270 + hash(i + 3) * 70},90%,72%)`;
          g.beginPath();
          g.moveTo(x - w0 / 2, y);
          g.quadraticCurveTo(x, y - 9, x + w0 / 2, y);
          g.closePath();
          g.fill();
        }
        g.globalAlpha = 1;
      },
      controls: (st, api) => {
        const rng0 = (key: string, label: string, min: number, max: number, step: number): Control => ({
          type: 'range',
          label,
          min,
          max,
          step,
          value: st.v[key] ?? 0,
          on: (v) => {
            st.v[key] = v;
            api.reload();
          },
        });
        return [
          { type: 'toggle', label: '▶ 켜기 / ■ 끄기', value: false, on: (v) => api.setOn(v) },
          rng0('size', '알갱이 길이 (ms)', 20, 80, 2),
          rng0('dens', '빽빽함 (초당 개수)', 5, 60, 1),
          rng0('pos', '읽는 위치', 0, 1, 0.01),
          rng0('spread', '흩뿌림 폭', 0, 1, 0.02),
        ];
      },
    },
    v0: { size: 50, dens: 30, pos: 0.4, spread: 0.2, pitch: 2 },
  },
};

// ═════════════════════ 음악 엔진 (덕킹 · 적응 음악 · 박자 · 버스) ═════════════════════

const PROG = [
  [0, 4, 7],
  [-3, 0, 4],
  [-7, -3, 0],
  [-5, -1, 2],
]; // 도 · 라단조 · 파 · 솔 (도 아래 위)
interface MOuts {
  pad?: AudioNode;
  bass?: AudioNode;
  drums?: AudioNode;
  arp?: AudioNode;
}
/** 16분음표 한 칸을 예약 (실시간 · 오프라인 모두) */
function musicStep(c: BA, o: MOuts, t: number, step: number, spb: number, r: Rnd): void {
  const bar = Math.floor(step / 16);
  const s = step % 16;
  const ch = PROG[bar % 4]!;
  if (o.pad && s === 0) {
    for (const n of ch) {
      const f = 261.63 * st2(n);
      const lp = filt(c, 'lowpass', 1100);
      const e = envG(c, o.pad, t, 0.25, spb * 16 - 0.55, 0.5, 0.07);
      lp.connect(e);
      osc(c, 'triangle', f, t, spb * 16).connect(lp);
      chain(osc(c, 'sawtooth', f * 1.004, t, spb * 16), gainN(c, 0.25), lp);
    }
  }
  if (o.bass && (s === 0 || s === 8 || s === 6 || s === 14)) {
    const root = ((ch[0]! % 12) + 12) % 12;
    tone(c, o.bass, t, 65.41 * st2(root), spb * (s % 8 === 0 ? 3 : 1.5), s % 8 === 0 ? 0.42 : 0.28, 'triangle', 0.005);
  }
  if (o.drums) {
    if (s % 4 === 0) {
      const k = osc(c, 'sine', 150, t, 0.2);
      k.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      k.connect(envG(c, o.drums, t, 0.002, 0.02, 0.16, s % 8 === 0 ? 0.9 : 0.6));
    }
    if (s === 4 || s === 12) {
      const n = noise(c, t, 0.15, r);
      chain(n, filt(c, 'bandpass', 1900, 0.8), envG(c, o.drums, t, 0.001, 0.01, 0.12, 0.35));
      tone(c, o.drums, t, 210, 0.06, 0.18, 'triangle', 0.001);
    }
    if (s % 2 === 0) {
      const n = noise(c, t, 0.04, r);
      chain(n, filt(c, 'highpass', 7500), envG(c, o.drums, t, 0.0008, 0.002, 0.03, s % 4 === 2 ? 0.16 : 0.08));
    }
  }
  if (o.arp) {
    const n = ch[s % 3]! + 12 + (s % 6 >= 3 ? 12 : 0);
    tone(c, o.arp, t, 261.63 * st2(n), spb * 0.9, 0.07, 'square', 0.002);
  }
}
function stinger(c: BA, out: AudioNode, t: number): void {
  [0, 4, 7, 12, 16].forEach((n, i) => {
    tone(c, out, t + i * 0.07, 523.25 * st2(n), i === 4 ? 0.9 : 0.25, 0.2, 'triangle', 0.003);
    tone(c, out, t + i * 0.07, 523.25 * st2(n) * 2, 0.15, 0.05, 'square', 0.002);
  });
}
class Music {
  t0 = 0;
  step = 0;
  next = 0;
  bpm = 120;
  private id = 0;
  stingAt = -1;
  wantSting = false;
  constructor(
    private ac: AudioContext,
    private outs: MOuts,
    private sting?: AudioNode,
  ) {}
  get spb(): number {
    return 60 / this.bpm / 4;
  }
  start(): void {
    this.t0 = this.ac.currentTime + 0.1;
    this.next = this.t0;
    this.step = 0;
    this.tick();
    this.id = window.setInterval(() => this.tick(), 25);
  }
  private tick(): void {
    while (this.next < this.ac.currentTime + 0.12) {
      if (this.wantSting && this.step % 16 === 0 && this.sting) {
        stinger(this.ac, this.sting, this.next);
        this.stingAt = this.next;
        this.wantSting = false;
      }
      musicStep(this.ac, this.outs, this.next, this.step, this.spb, Math.random);
      this.next += this.spb;
      this.step++;
    }
  }
  /** 지금 몇 번째 16분음표인지 (소수) */
  pos(): number {
    return (this.ac.currentTime - this.t0) / this.spb;
  }
  stop(): void {
    clearInterval(this.id);
  }
}

// ═════════════════════ 그림판 틀 (가상 280 × 150) ═════════════════════

interface Frame {
  u: number;
  big: boolean;
  live: Box | null;
}
const VW = 280;
const VH = 150;
/** 배경 + 가운데 가상 화면(280 × 150). fn 안에서는 가상 좌표로 그린다 */
function frame(g: G, w: number, h: number, t: number, color: string, fn: () => void, liveLabel?: string): Frame {
  reset(g);
  bgDark(g, w, h, color, t);
  const big = w > 420;
  const s0 = Math.min(w / 280, h / 175);
  const u = s0 * (big ? 0.62 : 1);
  const pad = big ? 14 * s0 * 0.6 : 6 * s0;
  const ah = h - 2 * pad;
  const main: Box = big ? { x: pad, y: pad, w: w - 2 * pad, h: ah * 0.7 } : { x: pad, y: pad, w: w - 2 * pad, h: ah };
  const live: Box | null = big ? { x: pad, y: pad + ah * 0.73, w: w - 2 * pad, h: ah * 0.27 } : null;
  const sc = Math.min(main.w / VW, main.h / VH);
  g.save();
  g.translate(main.x + (main.w - VW * sc) / 2, main.y + (main.h - VH * sc) / 2);
  g.scale(sc, sc);
  fn();
  g.restore();
  reset(g);
  if (live) drawLive(g, live, u, color, liveLabel);
  return { u, big, live };
}
function chip(g: G, s: string, x: number, y: number, size: number, fill: string, fg = '#fff'): number {
  g.font = `800 ${size}px ${F}`;
  const tw = g.measureText(s).width;
  const ph = size * 1.7;
  const pw = tw + size * 1.2;
  rr(g, x - pw / 2, y - ph / 2, pw, ph, ph / 2);
  g.fillStyle = fill;
  g.fill();
  txt(g, s, x, y + size * 0.05, size, fg, 'center', 800);
  return pw;
}
function vpanel(g: G, x: number, y: number, w: number, h: number, color: string, a = 0.05): void {
  rr(g, x, y, w, h, 7);
  g.fillStyle = `rgba(255,255,255,${a})`;
  g.fill();
  g.strokeStyle = rgba(color, 0.25);
  g.lineWidth = 1;
  g.stroke();
}

// ═════════════════════ i161 덕킹 ═════════════════════

const DUCK_TC = 0.06;
const BACK_TC = 0.25;
const duckDemo: Demo2D = {
  kind: '2d',
  caption: '말소리가 나오는 동안 음악 버스를 0.3 으로 낮췄다가 되돌림 — 말이 또렷하게 들림',
  make() {
    const bus = new Bus();
    let music: Music | null = null;
    let musicG: GainNode | null = null;
    let duckOn = true;
    const talks: { at: number; dur: number; duck: boolean }[] = [];
    const stopAll = (): void => {
      music?.stop();
      music = null;
      bus.kill();
    };
    const say = (): void => {
      const ac = audio();
      if (!music) start();
      const t0 = ac.currentTime + 0.05;
      const vb = gainN(ac, 1.2);
      vb.connect(bus.node());
      const d = babble(ac, vb, t0 + 0.08, '여기 숫자가 서로 안 맞아요! 다시 볼까요?', 330, 1.05);
      if (duckOn && musicG) {
        musicG.gain.setTargetAtTime(0.3, t0, DUCK_TC);
        musicG.gain.setTargetAtTime(1, t0 + 0.08 + d + 0.1, BACK_TC);
      }
      talks.push({ at: performance.now() / 1000 + 0.05, dur: d + 0.18, duck: duckOn });
    };
    const start = (): void => {
      const ac = audio();
      musicG = gainN(ac, 1);
      musicG.connect(bus.node());
      music = new Music(ac, { pad: musicG, bass: musicG, drums: musicG });
      music.bpm = 100;
      music.start();
    };
    /** 그래프용 음악 크기 (실제 자동화와 같은 시간 상수로 계산) */
    const gainAt = (T: number, list: { at: number; dur: number; duck: boolean }[]): number => {
      let v = 1;
      let last = -1e9;
      for (const e of list) {
        if (!e.duck) continue;
        if (T < e.at) break;
        // 앞 상태에서 이어 계산 (대략)
        void last;
        const a = Math.min(T, e.at + e.dur) - e.at;
        v = 0.3 + (v - 0.3) * Math.exp(-a / DUCK_TC);
        if (T > e.at + e.dur) v = 1 + (v - 1) * Math.exp(-(T - e.at - e.dur) / BACK_TC);
        last = e.at;
      }
      return v;
    };
    return {
      controls: [
        {
          type: 'toggle',
          label: '▶ 배경 음악 켜기 / ■ 끄기',
          value: false,
          on: (v) => {
            if (v) {
              if (!music) start();
            } else stopAll();
          },
        },
        { type: 'button', label: '🗨 선배가 말하기', on: say },
        { type: 'toggle', label: '덕킹 쓰기 (끄면 음악에 묻힘)', value: true, on: (v) => (duckOn = v) },
      ],
      draw(g, w, h, t) {
        const nowS = performance.now() / 1000;
        const real = !!music || (talks.length > 0 && nowS - talks[talks.length - 1]!.at < 8);
        // 카드: 4초마다 말하기를 흉내
        const sim: { at: number; dur: number; duck: boolean }[] = [];
        const base = Math.floor(t / 4) * 4;
        for (let i = -2; i <= 0; i++) sim.push({ at: base + i * 4 + 1, dur: 1.6, duck: true });
        const list = real ? talks : sim;
        const T = real ? nowS : t;
        frame(g, w, h, t, '#ff9fc4', () => {
          txt(g, '덕킹 — 말할 때 음악 낮추기', 12, 13, 11, '#ffd0e2', 'left', 900);
          chip(g, real ? '실제 소리' : '흉내', 250, 13, 7.5, real ? '#ff5c8a' : 'rgba(255,255,255,0.15)');
          // 두 줄 시간표 (지난 6초)
          const gx = 12;
          const gw = 256;
          const span = 6;
          const tx = (tt: number): number => gx + gw - ((T - tt) / span) * gw;
          vpanel(g, gx, 26, gw, 52, '#ffb84d');
          vpanel(g, gx, 84, gw, 30, '#ff9fc4');
          txt(g, '음악 버스 크기', gx + gw - 5, 33, 7, 'rgba(255,255,255,0.6)', 'right');
          txt(g, '목소리', gx + gw - 5, 91, 7, 'rgba(255,255,255,0.6)', 'right');
          // 0.3 기준선
          const y1 = 74;
          const y0 = 34;
          const gy = (v: number): number => lerp(y1, y0, v);
          g.strokeStyle = 'rgba(255,255,255,0.18)';
          g.setLineDash([3, 3]);
          g.beginPath();
          g.moveTo(gx, gy(0.3));
          g.lineTo(gx + gw, gy(0.3));
          g.stroke();
          g.setLineDash([]);
          txt(g, '0.3', gx + 4, gy(0.3) - 4, 6, 'rgba(255,255,255,0.5)', 'left');
          // 음악 크기 곡선
          g.beginPath();
          for (let i = 0; i <= 120; i++) {
            const tt = T - span + (i / 120) * span;
            const v = gainAt(tt, list);
            g.lineTo(tx(tt), gy(v));
          }
          g.lineTo(gx + gw, y1);
          g.lineTo(gx, y1);
          g.closePath();
          const gr = g.createLinearGradient(0, y0, 0, y1);
          gr.addColorStop(0, 'rgba(255,184,77,0.55)');
          gr.addColorStop(1, 'rgba(255,184,77,0.05)');
          g.fillStyle = gr;
          g.fill();
          g.strokeStyle = '#ffb84d';
          g.lineWidth = 1.8;
          g.beginPath();
          for (let i = 0; i <= 120; i++) {
            const tt = T - span + (i / 120) * span;
            g.lineTo(tx(tt), gy(gainAt(tt, list)));
          }
          g.stroke();
          // 목소리 막대
          for (const e of list) {
            const x0 = Math.max(gx, tx(e.at));
            const x1 = Math.min(gx + gw, tx(e.at + e.dur));
            if (x1 <= gx || x0 >= gx + gw) continue;
            for (let x = x0; x < x1; x += 2.5) {
              const a = 3 + Math.abs(Math.sin(x * 0.7) * Math.sin(x * 0.13)) * 9;
              g.fillStyle = '#ff9fc4';
              g.fillRect(x, 103 - a / 2, 1.6, a);
            }
          }
          // 지금 선
          g.strokeStyle = '#fff';
          g.lineWidth = 1.2;
          g.beginPath();
          g.moveTo(gx + gw - 1, 26);
          g.lineTo(gx + gw - 1, 114);
          g.stroke();
          const cur = gainAt(T, list);
          txt(g, `음악 × ${cur.toFixed(2)}`, 140, 128, 10, cur < 0.6 ? '#ff9fc4' : '#ffd27a', 'center', 900, MONO);
          txt(g, `낮출 때 ${DUCK_TC * 1000}ms · 되돌릴 때 ${BACK_TC * 1000}ms (setTargetAtTime)`, 140, 142, 7, 'rgba(255,255,255,0.55)');
        });
      },
      dispose: stopAll,
    };
  },
};

// ═════════════════════ i162 적응 음악 + 마디 맞춤 스팅어 ═════════════════════

const LAYER_NAMES = ['화음', '베이스', '북', '아르페지오'];
const LAYER_COL = ['#7cc8ff', '#9fe870', '#ffb84d', '#ff7cc4'];
const adaptDemo: Demo2D = {
  kind: '2d',
  caption: '긴장할수록 악기 층이 하나씩 켜지고, 정답 징글은 「다음 마디 첫 박」에 맞춰 나옴 — 미리 보기 예약기',
  make() {
    const bus = new Bus();
    let music: Music | null = null;
    let layers: GainNode[] = [];
    let tension = 1;
    const setT = (v: number): void => {
      tension = v;
      if (music && AC) layers.forEach((L, i) => L.gain.setTargetAtTime(i <= tension ? 1 : 0, AC!.currentTime, 0.4));
    };
    const start = (): void => {
      const ac = audio();
      const out = bus.node();
      layers = [0, 1, 2, 3].map((i) => {
        const g = gainN(ac, i <= tension ? 1 : 0);
        g.connect(out);
        return g;
      });
      const sting = gainN(ac, 1.2);
      sting.connect(out);
      music = new Music(ac, { pad: layers[0], bass: layers[1], drums: layers[2], arp: layers[3] }, sting);
      music.bpm = 112;
      music.start();
    };
    const stop = (): void => {
      music?.stop();
      music = null;
      bus.kill();
    };
    let simSting = -1;
    return {
      controls: [
        { type: 'toggle', label: '▶ 음악 켜기 / ■ 끄기', value: false, on: (v) => (v ? start() : stop()) },
        { type: 'range', label: '긴장도 (0 ~ 3 = 남은 시간이 줄어듦)', min: 0, max: 3, step: 1, value: 1, on: (v) => setT(v) },
        {
          type: 'button',
          label: '★ 정답 징글 (다음 마디에)',
          on: () => {
            if (!music) start();
            music!.wantSting = true;
          },
        },
      ],
      draw(g, w, h, t) {
        const real = !!music;
        const spb = 60 / 112 / 4;
        let pos: number;
        let ten: number;
        let qd = false;
        let stingStep = -1;
        if (real && music) {
          pos = music.pos();
          ten = tension;
          qd = music.wantSting;
          if (music.stingAt > 0) stingStep = (music.stingAt - music.t0) / spb;
        } else {
          pos = (t / spb) % (16 * 16);
          ten = Math.floor((t / 6) % 4);
          // 카드: 마디 중간에 정답 → 다음 마디 첫 박에 징글
          const bar = Math.floor(pos / 16);
          if (bar % 3 === 1 && pos % 16 > 6) qd = true;
          if (bar % 3 === 2) simSting = bar * 16;
          stingStep = simSting;
        }
        frame(
          g,
          w,
          h,
          t,
          '#ff7cc4',
          () => {
            txt(g, '적응 음악 · 마디 맞춤 스팅어', 12, 13, 11, '#ffd0ea', 'left', 900);
            chip(g, real ? '실제 소리' : '흉내', 250, 13, 7.5, real ? '#ff5c8a' : 'rgba(255,255,255,0.15)');
            // 긴장 막대 (시간)
            txt(g, '긴장도', 12, 32, 7.5, 'rgba(255,255,255,0.6)', 'left');
            for (let i = 0; i < 4; i++) {
              rr(g, 44 + i * 16, 27, 13, 10, 3);
              g.fillStyle = i <= ten ? ['#7cc8ff', '#9fe870', '#ffb84d', '#ff5c6c'][i]! : 'rgba(255,255,255,0.1)';
              g.fill();
            }
            // 마디 격자: 지금 마디 포함 3마디
            const curBar = Math.floor(pos / 16);
            const gx = 70;
            const gw = 198;
            const barW = gw / 3;
            const x0bar = curBar;
            const sx = (step: number): number => gx + ((step - x0bar * 16) / 16) * barW;
            for (let li = 0; li < 4; li++) {
              const y = 46 + li * 19;
              txt(g, LAYER_NAMES[li]!, 12, y + 7, 8, li <= ten ? LAYER_COL[li]! : 'rgba(255,255,255,0.3)', 'left', 800);
              rr(g, gx, y, gw, 14, 3);
              g.fillStyle = 'rgba(255,255,255,0.04)';
              g.fill();
              const onL = li <= ten;
              for (let s = x0bar * 16; s < (x0bar + 3) * 16; s++) {
                const ss = s % 16;
                const hit = li === 0 ? ss === 0 : li === 1 ? ss === 0 || ss === 8 || ss === 6 || ss === 14 : li === 2 ? ss % 2 === 0 : true;
                if (!hit) continue;
                const x = sx(s);
                const wdt = li === 0 ? barW - 2 : barW / 16 - 1;
                const past = s < pos;
                const alpha = onL ? (past ? 0.95 : 0.45) : 0.08;
                rr(g, x + 0.5, y + (li === 2 && ss % 4 !== 0 ? 4 : 1.5), wdt, li === 2 && ss % 4 !== 0 ? 6 : 11, 2);
                g.fillStyle = rgba(LAYER_COL[li]!, alpha);
                g.fill();
              }
            }
            // 마디 선
            for (let b = 0; b <= 3; b++) {
              const x = gx + b * barW;
              g.strokeStyle = 'rgba(255,255,255,0.35)';
              g.lineWidth = b === 0 ? 1.5 : 1;
              g.beginPath();
              g.moveTo(x, 42);
              g.lineTo(x, 122);
              g.stroke();
              txt(g, `${x0bar + b + 1}마디`, x + 3, 126, 6.5, 'rgba(255,255,255,0.45)', 'left');
            }
            // 스팅어 예약 · 울림
            if (qd) {
              const x = gx + barW;
              star(g, x, 38, 7);
              g.fillStyle = '#ffe36a';
              g.fill();
              txt(g, '다음 마디 첫 박에 ★ 예약됨', x + 10, 38, 7.5, '#ffe36a', 'left', 800);
            }
            if (stingStep >= 0 && pos - stingStep >= 0 && pos - stingStep < 20) {
              const x = sx(stingStep);
              const k = (pos - stingStep) / 20;
              g.strokeStyle = `rgba(255,227,106,${1 - k})`;
              g.lineWidth = 3;
              g.beginPath();
              g.moveTo(x, 42);
              g.lineTo(x, 122);
              g.stroke();
              star(g, x, 84, 10 + k * 14, 5, 0.45, k * 2);
              g.fillStyle = `rgba(255,227,106,${1 - k})`;
              g.fill();
              txt(g, '★ 정답 징글!', x + 8, 132, 9, `rgba(255,227,106,${1 - k})`, 'left', 900);
            }
            // 재생 막대
            const px = sx(pos);
            g.strokeStyle = '#fff';
            g.lineWidth = 1.5;
            g.beginPath();
            g.moveTo(px, 42);
            g.lineTo(px, 122);
            g.stroke();
            txt(g, '앞 0.12초를 25ms 마다 미리 예약 (setInterval + AudioContext 시계)', 140, 144, 6.8, 'rgba(255,255,255,0.5)');
          },
          real ? '실시간 소리 · AnalyserNode' : '실시간 소리 · AnalyserNode — ▶ 음악 켜기',
        );
      },
      dispose: stop,
    };
  },
};

// ═════════════════════ i163 박자 검출 ═════════════════════

/** 저음 에너지 (오프라인 미리 계산 — 카드용) */
interface BeatPre {
  e: Float32Array;
  avg: Float32Array;
  beat: Uint8Array;
  hop: number;
  dur: number;
}
let BEAT_PRE: Promise<BeatPre> | null = null;
function beatPre(): Promise<BeatPre> {
  if (BEAT_PRE) return BEAT_PRE;
  BEAT_PRE = (async (): Promise<BeatPre> => {
    const sr = 22050;
    const spb = 60 / 120 / 4;
    const dur = spb * 64;
    const oc = new OfflineAudioContext(1, Math.ceil(sr * dur), sr);
    const out = oc.createGain();
    out.connect(oc.destination);
    const r = rng(3);
    for (let s = 0; s < 64; s++) musicStep(oc, { pad: out, bass: out, drums: out }, s * spb, s, spb, r);
    const d = (await oc.startRendering()).getChannelData(0);
    // 저역 통과 (한 극) → 프레임 에너지
    const hopN = 441; // 20ms
    const n = Math.floor(d.length / hopN);
    const e = new Float32Array(n);
    let lp = 0;
    const a = 1 - Math.exp((-TAU * 150) / sr);
    for (let f = 0; f < n; f++) {
      let s2 = 0;
      for (let i = 0; i < hopN; i++) {
        lp += a * (d[f * hopN + i]! - lp);
        s2 += lp * lp;
      }
      e[f] = s2 / hopN;
    }
    const avg = new Float32Array(n);
    const beat = new Uint8Array(n);
    let last = -100;
    const W = 43;
    for (let f = 0; f < n; f++) {
      let s = 0;
      let c = 0;
      for (let j = Math.max(0, f - W); j <= f; j++) {
        s += e[j]!;
        c++;
      }
      avg[f] = s / c;
      if (e[f]! > avg[f]! * 1.35 && f - last > 10 && e[f]! > 1e-5) {
        beat[f] = 1;
        last = f;
      }
    }
    let mx = 0;
    for (let f = 0; f < n; f++) mx = Math.max(mx, e[f]!);
    for (let f = 0; f < n; f++) {
      e[f] = e[f]! / mx;
      avg[f] = avg[f]! / mx;
    }
    return { e, avg, beat, hop: hopN / sr, dur };
  })();
  return BEAT_PRE;
}
const beatDemo: Demo2D = {
  kind: '2d',
  caption: '저음(150Hz 아래) 에너지가 최근 평균보다 1.35배 크면 「박」 — 그림이 음악에 맞춰 튐',
  make() {
    let pre: BeatPre | null = null;
    void beatPre().then((p) => (pre = p));
    const bus = new Bus();
    let music: Music | null = null;
    let ana: AnalyserNode | null = null;
    const hist: { e: number; avg: number; beat: boolean }[] = [];
    let lastBeat = -1;
    let bump = 0;
    let lastBeatT = -9;
    let sens = 1.35;
    const fbuf = new Float32Array(512);
    const start = (): void => {
      const ac = audio();
      const out = bus.node();
      ana = ac.createAnalyser();
      ana.fftSize = 1024;
      ana.smoothingTimeConstant = 0;
      const mix = gainN(ac, 1);
      mix.connect(out);
      mix.connect(ana);
      music = new Music(ac, { pad: mix, bass: mix, drums: mix });
      music.start();
    };
    const stop = (): void => {
      music?.stop();
      music = null;
      ana = null;
      bus.kill();
    };
    return {
      controls: [
        { type: 'toggle', label: '▶ 음악 켜기 / ■ 끄기', value: false, on: (v) => (v ? start() : stop()) },
        { type: 'range', label: '민감도 (평균의 몇 배면 박)', min: 1.1, max: 2.5, step: 0.05, value: 1.35, on: (v) => (sens = v) },
      ],
      draw(g, w, h, t, dt) {
        const real = !!(music && ana);
        let series: { e: number; avg: number; beat: boolean }[] = [];
        if (real && ana && AC) {
          ana.getFloatFrequencyData(fbuf);
          const binHz = AC.sampleRate / 1024;
          let s = 0;
          for (let i = 1; i * binHz < 150; i++) s += Math.pow(10, fbuf[i]! / 10);
          const prevAvg = hist.length ? hist.slice(-40).reduce((a, b) => a + b.e, 0) / Math.min(40, hist.length) : s;
          const isB = s > prevAvg * sens && t - lastBeatT > 0.2 && s > 1e-6;
          if (isB) lastBeatT = t;
          hist.push({ e: s, avg: prevAvg, beat: isB });
          if (hist.length > 160) hist.shift();
          const mx = Math.max(1e-9, ...hist.map((x) => x.e));
          series = hist.map((x) => ({ e: x.e / mx, avg: x.avg / mx, beat: x.beat }));
        } else if (pre) {
          const f = Math.floor((t % pre.dur) / pre.hop);
          for (let i = f - 120; i <= f; i++) {
            const j = ((i % pre.e.length) + pre.e.length) % pre.e.length;
            series.push({ e: pre.e[j]!, avg: pre.avg[j]!, beat: pre.beat[j] === 1 });
          }
          const cur = Math.floor((t % pre.dur) / pre.hop);
          for (let i = lastBeat + 1; i <= cur && lastBeat >= 0 && cur >= lastBeat; i++) if (pre.beat[i] === 1) lastBeatT = t;
          lastBeat = cur;
        }
        bump = Math.max(0, 1 - (t - lastBeatT) / 0.3);
        void dt;
        frame(
          g,
          w,
          h,
          t,
          '#9fe870',
          () => {
            txt(g, '박자 검출 · 반응 그림', 12, 13, 11, '#d6ffc0', 'left', 900);
            chip(g, real ? '실제 소리 분석 중' : '미리 계산한 음악', 240, 13, 7.5, real ? '#3aa860' : 'rgba(255,255,255,0.15)');
            // 에너지 그래프
            const gx = 12;
            const gw = 170;
            const gy0 = 28;
            const gh = 96;
            vpanel(g, gx, gy0, gw, gh, '#9fe870');
            const n = series.length;
            if (n > 1) {
              g.beginPath();
              series.forEach((p, i) => g.lineTo(gx + (i / (n - 1)) * gw, gy0 + gh - 4 - Math.sqrt(p.e) * (gh - 12)));
              g.lineTo(gx + gw, gy0 + gh);
              g.lineTo(gx, gy0 + gh);
              g.closePath();
              g.fillStyle = 'rgba(159,232,112,0.35)';
              g.fill();
              g.strokeStyle = '#ffd84d';
              g.lineWidth = 1.4;
              g.setLineDash([3, 2]);
              g.beginPath();
              series.forEach((p, i) => g.lineTo(gx + (i / (n - 1)) * gw, gy0 + gh - 4 - Math.sqrt(p.avg * (real ? sens : 1.35)) * (gh - 12)));
              g.stroke();
              g.setLineDash([]);
              series.forEach((p, i) => {
                if (!p.beat) return;
                const x = gx + (i / (n - 1)) * gw;
                g.fillStyle = '#ff5c8a';
                g.fillRect(x - 1, gy0 + 3, 2, gh - 6);
                circ(g, x, gy0 + 6, 2.5);
                g.fill();
              });
            }
            txt(g, '저음 에너지', gx + 4, gy0 + 8, 6.5, '#9fe870', 'left');
            txt(g, '-- 평균 × 민감도', gx + 50, gy0 + 8, 6.5, '#ffd84d', 'left');
            txt(g, '| 박', gx + 118, gy0 + 8, 6.5, '#ff5c8a', 'left');
            // 반응 그림: 튀는 친구 + 고리
            const cx = 230;
            const cy = 92;
            for (let i = 0; i < 3; i++) {
              const ph = clamp((t - lastBeatT) / 0.6 - i * 0.15);
              if (ph <= 0 || ph >= 1) continue;
              circ(g, cx, cy, 14 + ph * 34);
              g.strokeStyle = `rgba(159,232,112,${0.7 * (1 - ph)})`;
              g.lineWidth = 2;
              g.stroke();
            }
            shadow(g, cx, 122, 16 - bump * 4);
            blob(g, cx, cy - bump * 16, 16, '#9fe870', 1 + bump * 0.12, 1 - bump * 0.1 + bump * 0.2, bump > 0.3 ? 'happy' : 'calm');
            for (let i = 0; i < 5; i++) {
              const hgt = 6 + bump * 20 * (0.5 + hash(i + Math.floor(t * 4)) * 0.5);
              rr(g, 200 + i * 13, 140 - hgt, 9, hgt, 2);
              g.fillStyle = rgba(['#9fe870', '#7cc8ff', '#ffb84d', '#ff7cc4', '#c08bff'][i]!, 0.85);
              g.fill();
            }
          },
          real ? '실시간 소리 · AnalyserNode' : '실시간 소리 · AnalyserNode — ▶ 음악 켜기',
        );
      },
      dispose: stop,
    };
  },
};

// ═════════════════════ i164 오디오 스프라이트 ═════════════════════

const SPRITE_SOUNDS: { name: string; color: string; rec: Rec; dur: number; p: P }[] = [
  { name: '딩딩', color: '#ffc93a', rec: recCoin, dur: 0.5, p: { pitch: 0, tail: 0.35 } },
  { name: '보잉', color: '#7be08a', rec: recJump, dur: 0.32, p: { pitch: 0, sweep: 3 } },
  { name: '퓨웅', color: '#ff5fa8', rec: recLaser, dur: 0.34, p: { start: 1800, wobble: 0.5 } },
  { name: '부부', color: '#ff6b6b', rec: recError, dur: 0.4, p: { pitch: 0 } },
  { name: '띵~', color: '#ffe08a', rec: recBell, dur: 1.4, p: { ratio: 3.5, index: 4, pitch: 0 } },
];
interface Sprite {
  buf: AudioBuffer;
  marks: { name: string; color: string; at: number; dur: number }[];
  peaks: Float32Array;
}
let SPRITE: Promise<Sprite> | null = null;
function makeSprite(): Promise<Sprite> {
  if (SPRITE) return SPRITE;
  SPRITE = (async (): Promise<Sprite> => {
    const sr = 44100;
    const gap = 0.12;
    const total = SPRITE_SOUNDS.reduce((a, s) => a + s.dur + gap, 0);
    const oc = new OfflineAudioContext(1, Math.ceil(sr * total), sr);
    const out = oc.createGain();
    out.gain.value = 1.4;
    out.connect(oc.destination);
    let at = 0.01;
    const marks: Sprite['marks'] = [];
    for (const s of SPRITE_SOUNDS) {
      s.rec(oc, out, at, s.p, rng(9));
      marks.push({ name: s.name, color: s.color, at, dur: s.dur });
      at += s.dur + gap;
    }
    const buf = await oc.startRendering();
    return { buf, marks, peaks: peaksOf(buf.getChannelData(0)) };
  })();
  return SPRITE;
}
const spriteDemo: Demo2D = {
  kind: '2d',
  caption: '효과음 5개를 버퍼 하나에 이어 붙이고(OfflineAudioContext), 시작 위치 · 길이로 골라 재생',
  make() {
    let sp: Sprite | null = null;
    void makeSprite().then((s) => (sp = s));
    const bus = new Bus();
    let playing = -1;
    let playAt = 0;
    const play = (i: number): void => {
      if (!sp) return;
      const ac = audio();
      const m = sp.marks[i]!;
      const src = ac.createBufferSource();
      src.buffer = sp.buf;
      src.connect(bus.node());
      src.start(ac.currentTime + 0.01, m.at, m.dur);
      playing = i;
      playAt = performance.now();
    };
    return {
      controls: SPRITE_SOUNDS.map((s, i): Control => ({ type: 'button', label: `▶ ${s.name}`, on: () => play(i) })),
      draw(g, w, h, t) {
        let cur = -1;
        let k = 0;
        const real = playing >= 0 && sp && performance.now() - playAt < sp.marks[playing]!.dur * 1000 + 300;
        if (real && sp) {
          cur = playing;
          k = (performance.now() - playAt) / 1000 / sp.marks[playing]!.dur;
        } else {
          const per = 1.3;
          cur = Math.floor(t / per) % SPRITE_SOUNDS.length;
          k = (t % per) / per / 0.7;
        }
        frame(g, w, h, t, '#ffc93a', () => {
          txt(g, '오디오 스프라이트 — 파일 하나 · 소리 다섯', 12, 13, 11, '#ffe6a0', 'left', 900);
          // 파일 아이콘
          rr(g, 12, 28, 30, 36, 4);
          g.fillStyle = '#f4f0ff';
          g.fill();
          g.fillStyle = '#c9c0e8';
          g.beginPath();
          g.moveTo(32, 28);
          g.lineTo(42, 38);
          g.lineTo(32, 38);
          g.fill();
          txt(g, 'sfx', 27, 52, 8, '#5a4adf', 'center', 900, MONO);
          txt(g, '.mp3 1개', 27, 72, 7, 'rgba(255,255,255,0.6)');
          // 긴 파형
          const gx = 50;
          const gw = 218;
          const gy = 30;
          const gh = 46;
          vpanel(g, gx, gy, gw, gh, '#ffc93a');
          if (sp) {
            const total = sp.buf.duration;
            sp.marks.forEach((m, i) => {
              const x0 = gx + (m.at / total) * gw;
              const x1 = gx + ((m.at + m.dur) / total) * gw;
              rr(g, x0, gy + 1, x1 - x0, gh - 2, 3);
              g.fillStyle = rgba(m.color, i === cur ? 0.28 : 0.08);
              g.fill();
              if (i === cur) {
                g.strokeStyle = m.color;
                g.lineWidth = 1.5;
                g.stroke();
              }
            });
            g.save();
            wavePath(g, { x: gx, y: gy, w: gw, h: gh }, sp.peaks, gx, gy + gh / 2, gh * 0.42);
            g.fillStyle = 'rgba(255,255,255,0.75)';
            g.fill();
            g.restore();
            sp.marks.forEach((m, i) => {
              const x0 = gx + (m.at / total) * gw;
              const x1 = gx + ((m.at + m.dur) / total) * gw;
              txt(g, m.name, (x0 + x1) / 2, gy + gh + 9, 8, i === cur ? m.color : 'rgba(255,255,255,0.55)', 'center', 800);
              if (i === cur && k <= 1) {
                const px = lerp(x0, x1, clamp(k));
                g.strokeStyle = '#fff';
                g.lineWidth = 1.5;
                g.beginPath();
                g.moveTo(px, gy - 3);
                g.lineTo(px, gy + gh + 3);
                g.stroke();
              }
            });
            const m = sp.marks[cur]!;
            vpanel(g, 50, 98, 218, 40, m.color, 0.06);
            txt(g, `source.start(0, ${m.at.toFixed(2)}, ${m.dur.toFixed(2)})`, 159, 112, 9.5, m.color, 'center', 800, MONO);
            txt(g, `시작 ${m.at.toFixed(2)}초 · 길이 ${m.dur.toFixed(2)}초만 잘라 재생`, 159, 128, 7.5, 'rgba(255,255,255,0.6)');
          } else txt(g, '버퍼 굽는 중…', gx + gw / 2, gy + gh / 2, 9, 'rgba(255,255,255,0.5)');
          txt(g, '요청 1번', 27, 112, 8, '#9fe870', 'center', 900);
          txt(g, '(5번 → 1번)', 27, 124, 6.5, 'rgba(255,255,255,0.5)');
        });
      },
      dispose: () => bus.kill(),
    };
  },
};

// ═════════════════════ i165 채널 버스 ═════════════════════

const BUSES = [
  { key: 'music', name: '음악', color: '#7cc8ff' },
  { key: 'sfx', name: '효과음', color: '#ffc93a' },
  { key: 'voice', name: '목소리', color: '#ff9fc4' },
  { key: 'amb', name: '환경음', color: '#9fe870' },
];
const BUS_KEY = 'studio:sfx-bus-v1';
function loadVols(): Record<string, number> {
  const d: Record<string, number> = { music: 0.6, sfx: 0.9, voice: 1, amb: 0.5 };
  try {
    const s = localStorage.getItem(BUS_KEY);
    if (s) Object.assign(d, JSON.parse(s) as Record<string, number>);
  } catch {
    /* 저장 못 씀 */
  }
  return d;
}
const busDemo: Demo2D = {
  kind: '2d',
  caption: '주 음량 → 음악 · 효과음 · 목소리 · 환경음 버스 — 버스마다 음량 · 저장 + 끝에 가벼운 리미터',
  make() {
    const vols = loadVols();
    let savedAt = -9;
    const bus = new Bus();
    let nodes: Record<string, { g: GainNode; a: AnalyserNode }> = {};
    let music: Music | null = null;
    let sch: Ahead | null = null;
    let amb: AmbBed | null = null;
    const tbuf = new Float32Array(512);
    const save = (): void => {
      try {
        localStorage.setItem(BUS_KEY, JSON.stringify(vols));
        savedAt = performance.now() / 1000;
      } catch {
        /* 무시 */
      }
    };
    const start = (): void => {
      const ac = audio();
      const out = bus.node();
      nodes = {};
      for (const b of BUSES) {
        const g = gainN(ac, vols[b.key] ?? 1);
        const a = ac.createAnalyser();
        a.fftSize = 512;
        g.connect(a);
        g.connect(out);
        nodes[b.key] = { g, a };
      }
      music = new Music(ac, { pad: nodes['music']!.g, bass: nodes['music']!.g });
      music.bpm = 96;
      music.start();
      const t0 = ac.currentTime + 0.05;
      amb = ambBed(ac, nodes['amb']!.g, t0, 0, Math.random);
      let nextSfx = t0 + 0.5;
      let nextVoice = t0 + 1.2;
      sch = new Ahead(ac, (a, b) => {
        ambEvents(ac, nodes['amb']!.g, 0, a, b, Math.random, []);
        while (nextSfx < b) {
          recCoin(ac, nodes['sfx']!.g, nextSfx, { pitch: Math.floor(Math.random() * 3) * 2, tail: 0.3 }, Math.random);
          nextSfx += 1.1;
        }
        while (nextVoice < b) {
          babble(ac, nodes['voice']!.g, nextVoice, '좋아요 잘했어요', 300, 1);
          nextVoice += 3.2;
        }
      });
      sch.start(t0);
    };
    const stop = (): void => {
      music?.stop();
      sch?.stop();
      for (const s of amb?.srcs ?? []) s.stop();
      music = null;
      sch = null;
      amb = null;
      nodes = {};
      bus.kill();
    };
    const setVol = (k: string, v: number): void => {
      vols[k] = v;
      const n = nodes[k];
      if (n && AC) n.g.gain.setTargetAtTime(v, AC.currentTime, 0.03);
      save();
    };
    return {
      controls: [
        { type: 'toggle', label: '▶ 네 버스 모두 켜기 / ■ 끄기', value: false, on: (v) => (v ? start() : stop()) },
        ...BUSES.map((b): Control => ({ type: 'range', label: `${b.name} 버스`, min: 0, max: 1, step: 0.05, value: vols[b.key] ?? 1, on: (v) => setVol(b.key, v) })),
      ],
      draw(g, w, h, t) {
        const real = !!music;
        frame(
          g,
          w,
          h,
          t,
          '#7cc8ff',
          () => {
            txt(g, '채널 버스 · 음량 조절', 12, 13, 11, '#cfe8ff', 'left', 900);
            if (performance.now() / 1000 - savedAt < 1.5) chip(g, '저장됨 ✓', 246, 13, 7.5, '#3aa860');
            BUSES.forEach((b, i) => {
              const x = 16 + i * 46;
              vpanel(g, x, 24, 40, 112, b.color, 0.05);
              txt(g, b.name, x + 20, 32, 8, b.color, 'center', 900);
              // 계량기
              let lvl: number;
              const n = nodes[b.key];
              if (real && n) {
                n.a.getFloatTimeDomainData(tbuf);
                let m = 0;
                for (let j = 0; j < tbuf.length; j++) m = Math.max(m, Math.abs(tbuf[j]!));
                lvl = clamp(m * 2.2);
              } else {
                const v = vols[b.key] ?? 1;
                lvl = v * (0.35 + 0.35 * Math.abs(Math.sin(t * (2 + i) + i)) + (i === 1 ? 0.3 * Math.max(0, Math.sin(t * 5)) : 0));
              }
              const mh = 80;
              for (let s = 0; s < 16; s++) {
                const on = s / 16 < lvl;
                rr(g, x + 5, 126 - (s + 1) * (mh / 16), 7, mh / 16 - 1.2, 1);
                g.fillStyle = on ? (s > 13 ? '#ff5c6c' : s > 10 ? '#ffd84d' : '#6ef0a0') : 'rgba(255,255,255,0.07)';
                g.fill();
              }
              // 페이더
              const v = vols[b.key] ?? 1;
              rr(g, x + 25, 44, 3, mh, 1.5);
              g.fillStyle = 'rgba(0,0,0,0.5)';
              g.fill();
              const fy = 44 + mh - v * mh;
              rr(g, x + 19, fy - 4, 15, 8, 2);
              g.fillStyle = '#e8e4ff';
              g.fill();
              g.fillStyle = b.color;
              g.fillRect(x + 20, fy - 0.6, 13, 1.2);
              txt(g, `${Math.round(v * 100)}`, x + 26, 131, 6.5, 'rgba(255,255,255,0.6)', 'center', 700, MONO);
            });
            // 흐름: 버스 → 주 음량 → 리미터 → 스피커
            const fx = 204;
            const items = ['주 음량 0.35', '리미터', '스피커'];
            items.forEach((s, i) => {
              const y = 40 + i * 34;
              vpanel(g, fx, y - 10, 64, 20, '#c9a0ff', 0.08);
              txt(g, s, fx + 32, y, 8, '#e6d8ff', 'center', 800);
              if (i < 2) {
                g.strokeStyle = 'rgba(255,255,255,0.4)';
                g.lineWidth = 1.2;
                g.beginPath();
                g.moveTo(fx + 32, y + 10);
                g.lineTo(fx + 32, y + 24);
                g.stroke();
              }
            });
            g.strokeStyle = 'rgba(255,255,255,0.25)';
            g.beginPath();
            g.moveTo(198, 80);
            g.lineTo(204, 40);
            g.stroke();
            txt(g, 'localStorage 에 저장', fx + 32, 140, 6.5, 'rgba(255,255,255,0.5)');
          },
          real ? '실시간 소리 · 주 출력' : '실시간 소리 · ▶ 네 버스 모두 켜기',
        );
      },
      dispose: stop,
    };
  },
};

// ═════════════════════ i166 모바일 잠금 풀기 ═════════════════════

const unlockDemo: Demo2D = {
  kind: '2d',
  caption: '폰은 사용자가 처음 터치하기 전엔 소리를 막음 — 첫 터치에 resume(), 짧은 효과음은 미리 디코딩',
  make() {
    let pre: AudioBuffer | null = null;
    let lastLag = -1;
    let lastKind = '';
    const bus = new Bus();
    const prep = async (): Promise<void> => {
      const oc = new OfflineAudioContext(1, Math.ceil(44100 * 0.5), 44100);
      recCoin(oc, oc.destination, 0.002, { pitch: 0, tail: 0.35 }, Math.random);
      pre = await oc.startRendering();
    };
    void prep();
    return {
      controls: [
        {
          type: 'button',
          label: '① 첫 터치: AudioContext 만들고 resume()',
          on: () => {
            audio();
          },
        },
        {
          type: 'button',
          label: '② 미리 디코딩한 소리 재생',
          on: () => {
            const t0 = performance.now();
            const ac = audio();
            if (!pre) return;
            const s = ac.createBufferSource();
            s.buffer = pre;
            s.connect(bus.node());
            s.start();
            lastLag = performance.now() - t0 + (ac.baseLatency ?? 0) * 1000 + ((ac as AudioContext & { outputLatency?: number }).outputLatency ?? 0) * 1000;
            lastKind = '미리 디코딩';
          },
        },
        {
          type: 'button',
          label: '③ 그 자리에서 합성해 재생',
          on: () => {
            const t0 = performance.now();
            const ac = audio();
            recCoin(ac, bus.node(), ac.currentTime, { pitch: 0, tail: 0.35 }, Math.random);
            lastLag = performance.now() - t0 + (ac.baseLatency ?? 0) * 1000 + ((ac as AudioContext & { outputLatency?: number }).outputLatency ?? 0) * 1000;
            lastKind = '바로 합성';
          },
        },
      ],
      draw(g, w, h, t) {
        const big = w > 420;
        const state = AC ? AC.state : '없음';
        // 카드 흉내: 4초 주기 — 잠김 → 터치 → 풀림 → 소리
        const ph = (t % 4.5) / 4.5;
        const simUnlocked = ph > 0.35;
        const unlocked = big && AC ? state === 'running' : simUnlocked;
        frame(g, w, h, t, '#6ef0a0', () => {
          txt(g, '모바일 소리 잠금 풀기', 12, 13, 11, '#c8ffd8', 'left', 900);
          // 폰
          g.save();
          g.translate(52, 82);
          rr(g, -26, -52, 52, 100, 9);
          g.fillStyle = '#1a1730';
          g.fill();
          g.strokeStyle = '#8a86b0';
          g.lineWidth = 2;
          g.stroke();
          rr(g, -21, -44, 42, 82, 4);
          g.fillStyle = unlocked ? '#123d2e' : '#2a1d2e';
          g.fill();
          // 자물쇠
          const open = unlocked ? 1 : 0;
          g.strokeStyle = unlocked ? '#6ef0a0' : '#ff7a7a';
          g.lineWidth = 3;
          g.beginPath();
          g.arc(0, -12 - open * 5, 8, Math.PI, 0);
          g.stroke();
          rr(g, -11, -12, 22, 17, 3);
          g.fillStyle = unlocked ? '#6ef0a0' : '#ff7a7a';
          g.fill();
          if (unlocked) {
            waves(g, 0, 22, 4, 3, t * 1.2, '#6ef0a0', 0.8, -Math.PI / 2);
          } else txt(g, '♪ ×', 0, 22, 10, '#ff7a7a', 'center', 900);
          // 손가락 (카드)
          if (!big && ph > 0.22 && ph < 0.42) {
            const d = 1 - Math.abs(ph - 0.32) / 0.1;
            circ(g, 6, 8, 6 + d * 3);
            g.fillStyle = 'rgba(255,217,184,0.9)';
            g.fill();
            circ(g, 6, 8, 12 + d * 8);
            g.strokeStyle = `rgba(255,255,255,${d * 0.6})`;
            g.lineWidth = 1.5;
            g.stroke();
          }
          g.restore();
          // 단계
          const steps = [
            ['페이지 열림', 'new AudioContext() → suspended'],
            ['첫 터치 · 클릭', 'pointerdown 안에서 ctx.resume()'],
            ['running', '이제 소리가 남'],
            ['짧은 효과음', '미리 decodeAudioData 해 두기'],
          ];
          const at = big ? (state === 'running' ? 3 : AC ? 1 : 0) : Math.min(3, Math.floor(ph * 4.4));
          steps.forEach(([a, b], i) => {
            const y = 32 + i * 28;
            const done = i <= at;
            vpanel(g, 98, y - 11, 170, 23, done ? '#6ef0a0' : '#ffffff', done ? 0.09 : 0.03);
            circ(g, 110, y, 6);
            g.fillStyle = done ? '#6ef0a0' : 'rgba(255,255,255,0.15)';
            g.fill();
            txt(g, String(i + 1), 110, y + 0.5, 7, done ? '#0c2a1c' : '#fff', 'center', 900);
            txt(g, a!, 122, y - 4, 8, done ? '#fff' : 'rgba(255,255,255,0.5)', 'left', 800);
            txt(g, b!, 122, y + 6, 6.5, done ? 'rgba(200,255,220,0.8)' : 'rgba(255,255,255,0.35)', 'left', 600, b!.includes('(') ? MONO : F);
          });
          if (big) {
            const lat = AC ? `기본 지연 ${((AC.baseLatency ?? 0) * 1000).toFixed(1)}ms · ${AC.sampleRate}Hz` : 'AudioContext 아직 없음';
            txt(g, `지금 상태: ${state} · latencyHint: 'interactive' · ${lat}`, 12, 143, 7.5, '#c8ffd8', 'left', 700, MONO);
            if (lastLag >= 0) txt(g, `${lastKind}: 누름 → 소리 약 ${lastLag.toFixed(1)}ms`, 268, 13, 7.5, '#ffd84d', 'right', 800);
          } else txt(g, 'latencyHint: "interactive" — 지연을 짧게', 140, 143, 7, 'rgba(255,255,255,0.5)');
        });
      },
      dispose: () => bus.kill(),
    };
  },
};

// ═════════════════════ i167 소리 자막 ═════════════════════

const CAP_EVENTS: { cap: string; text: string; color: string; rec: Rec; p: P; icon: string }[] = [
  { cap: '[딩동]', text: '정답!', color: '#6ef0a0', rec: recArp, p: { key: 0, gap: 70 }, icon: '○' },
  { cap: '[부부]', text: '숫자가 안 맞아요', color: '#ff6b6b', rec: recError, p: { pitch: 0 }, icon: '×' },
  { cap: '[째깍째깍]', text: '10초 남음', color: '#ffd84d', rec: recOdo, p: { target: 60 }, icon: '⏱' },
  { cap: '[끼익]', text: '문이 열렸어요', color: '#9db4ff', rec: recServo, p: { time: 0.6 }, icon: '🚪' },
];
const captionDemo: Demo2D = {
  kind: '2d',
  caption: '「[딩동] 정답!」 처럼 중요한 소리는 글로도 — 소리를 끈 학생도 같은 정보를 받음',
  make() {
    const bus = new Bus();
    let showCap = true;
    let cur = -1;
    let at = -9;
    return {
      controls: [
        ...CAP_EVENTS.map(
          (e, i): Control => ({
            type: 'button',
            label: `▶ ${e.cap} ${e.text}`,
            on: () => {
              const ac = audio();
              e.rec(ac, bus.node(), ac.currentTime + 0.02, e.p, Math.random);
              cur = i;
              at = performance.now() / 1000;
            },
          }),
        ),
        { type: 'toggle', label: '자막 보이기', value: true, on: (v) => (showCap = v) },
      ],
      draw(g, w, h, t) {
        const now = performance.now() / 1000;
        let i: number;
        let k: number;
        let muted = false;
        if (now - at < 2.6 && cur >= 0) {
          i = cur;
          k = (now - at) / 2.6;
        } else {
          i = Math.floor(t / 2.6) % CAP_EVENTS.length;
          k = (t % 2.6) / 2.6;
          muted = Math.floor(t / (2.6 * 4)) % 2 === 1;
        }
        const e = CAP_EVENTS[i]!;
        frame(g, w, h, t, e.color, () => {
          txt(g, '소리 자막 (접근성)', 12, 13, 11, '#ffffff', 'left', 900);
          // 게임 화면 흉내
          vpanel(g, 12, 24, 256, 96, e.color, 0.04);
          // 판 위 그림
          const pop = easeOut(k * 4) * (1 - clamp((k - 0.8) * 5));
          g.save();
          g.translate(70, 70);
          g.scale(0.6 + pop * 0.5, 0.6 + pop * 0.5);
          circ(g, 0, 0, 22);
          g.fillStyle = rgba(e.color, 0.25);
          g.fill();
          g.strokeStyle = e.color;
          g.lineWidth = 3;
          g.stroke();
          txt(g, e.icon, 0, 1, 22, e.color, 'center', 900);
          g.restore();
          // 스피커 (켜짐 / 끔)
          g.save();
          g.translate(236, 40);
          g.fillStyle = 'rgba(255,255,255,0.8)';
          g.beginPath();
          g.moveTo(-8, -4);
          g.lineTo(-3, -4);
          g.lineTo(3, -9);
          g.lineTo(3, 9);
          g.lineTo(-3, 4);
          g.lineTo(-8, 4);
          g.closePath();
          g.fill();
          if (muted) {
            g.strokeStyle = '#ff6b6b';
            g.lineWidth = 2;
            g.beginPath();
            g.moveTo(7, -6);
            g.lineTo(15, 6);
            g.moveTo(15, -6);
            g.lineTo(7, 6);
            g.stroke();
          } else if (k < 0.6) waves(g, 4, 0, 4, 2, t * 2, '#fff', 0.7, 0);
          g.restore();
          txt(g, muted ? '소리 끔 — 그래도 알 수 있어요' : '소리 켬', 236, 58, 6.5, muted ? '#ffb0b0' : 'rgba(255,255,255,0.5)', 'center', 700);
          // 자막 띠
          if (showCap && k < 0.92) {
            const a = clamp(k * 8) * (1 - clamp((k - 0.8) * 8));
            g.globalAlpha = a;
            rr(g, 100, 92, 160, 22, 5);
            g.fillStyle = 'rgba(0,0,0,0.75)';
            g.fill();
            g.font = `900 10px ${F}`;
            const cw = g.measureText(e.cap + ' ').width;
            g.font = `800 10px ${F}`;
            const tw = g.measureText(e.text).width;
            const sx = 180 - (cw + tw) / 2;
            txt(g, e.cap, sx, 103.5, 10, e.color, 'left', 900);
            txt(g, e.text, sx + cw, 103.5, 10, '#fff', 'left', 800);
            g.globalAlpha = 1;
          }
          txt(g, '대괄호 = 무슨 소리인지 · 그 뒤 = 그 뜻', 140, 134, 7.5, 'rgba(255,255,255,0.55)');
        });
      },
      dispose: () => bus.kill(),
    };
  },
};

// ═════════════════════ i168 진동과 소리 맞추기 ═════════════════════

const HAPTICS: { name: string; pat: number[]; rec: Rec; p: P; color: string }[] = [
  { name: '가볍게', pat: [12], rec: recClick, p: { freq: 3000 }, color: '#9fe870' },
  { name: '중간', pat: [30, 50, 30], rec: recCoin, p: { pitch: 0, tail: 0.2 }, color: '#ffd84d' },
  { name: '세게', pat: [90, 60, 140], rec: recSub, p: { from: 120, to: 45 }, color: '#ff7a5a' },
];
const hapticDemo: Demo2D = {
  kind: '2d',
  caption: '소리와 같은 순간에 진동 무늬 — navigator.vibrate([켜기, 쉬기, 켜기 …]) (가볍게 · 중간 · 세게)',
  make() {
    const bus = new Bus();
    let cur = -1;
    let at = -9;
    let sent = '';
    const can = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
    return {
      controls: HAPTICS.map(
        (hp, i): Control => ({
          type: 'button',
          label: `▶ ${hp.name} (소리 + 진동)`,
          on: () => {
            const ac = audio();
            hp.rec(ac, bus.node(), ac.currentTime + 0.01, hp.p, Math.random);
            let ok = false;
            try {
              ok = can ? navigator.vibrate(hp.pat) : false;
            } catch {
              ok = false;
            }
            sent = ok ? `vibrate([${hp.pat.join(', ')}]) 보냄` : '이 기기는 진동이 없어요 (PC) — 폰에서 눌러 보세요';
            cur = i;
            at = performance.now() / 1000;
          },
        }),
      ),
      draw(g, w, h, t) {
        const now = performance.now() / 1000;
        let i: number;
        let ms: number;
        if (now - at < 1.6 && cur >= 0) {
          i = cur;
          ms = (now - at) * 1000;
        } else {
          i = Math.floor(t / 1.6) % 3;
          ms = (t % 1.6) * 1000;
        }
        const hp = HAPTICS[i]!;
        // 진동 켜짐?
        let acc = 0;
        let buzzing = false;
        hp.pat.forEach((d, j) => {
          if (ms >= acc && ms < acc + d && j % 2 === 0) buzzing = true;
          acc += d;
        });
        const total = hp.pat.reduce((a, b) => a + b, 0);
        frame(g, w, h, t, hp.color, () => {
          txt(g, '진동과 소리 맞추기', 12, 13, 11, '#fff', 'left', 900);
          // 폰
          const amp = buzzing ? (i + 1) * 1.2 : 0;
          g.save();
          g.translate(48 + Math.sin(t * 90) * amp, 80 + Math.cos(t * 77) * amp * 0.5);
          rr(g, -22, -46, 44, 88, 8);
          g.fillStyle = '#1a1730';
          g.fill();
          g.strokeStyle = buzzing ? hp.color : '#8a86b0';
          g.lineWidth = 2;
          g.stroke();
          rr(g, -17, -38, 34, 72, 4);
          g.fillStyle = '#2a2448';
          g.fill();
          txt(g, hp.name, 0, -4, 10, hp.color, 'center', 900);
          g.restore();
          if (buzzing)
            for (const s of [-1, 1]) {
              g.strokeStyle = rgba(hp.color, 0.8);
              g.lineWidth = 1.6;
              g.beginPath();
              for (let y = -20; y <= 20; y += 4) g.lineTo(48 + s * (30 + (y % 8 === 0 ? 3 : 0)), 80 + y);
              g.stroke();
            }
          // 시간표: 소리 · 진동 (0 ~ 400ms)
          const gx = 100;
          const gw = 168;
          const span = Math.max(400, total + 100);
          const xs = (m: number): number => gx + (m / span) * gw;
          vpanel(g, gx, 30, gw, 40, hp.color, 0.04);
          vpanel(g, gx, 78, gw, 26, hp.color, 0.04);
          txt(g, '소리', gx + gw - 4, 37, 7, 'rgba(255,255,255,0.6)', 'right');
          txt(g, '진동', gx + gw - 4, 85, 7, 'rgba(255,255,255,0.6)', 'right');
          // 소리 모양 (간단한 봉투)
          g.beginPath();
          const sd = i === 0 ? 30 : i === 1 ? 300 : 500;
          for (let m = 0; m <= span; m += span / 120) {
            const a = m < sd ? Math.exp((-m / sd) * 3) * (0.5 + 0.5 * Math.abs(Math.sin(m * (i === 2 ? 0.25 : 1.3)))) : 0;
            g.lineTo(xs(m), 52 - a * 14);
          }
          for (let m = span; m >= 0; m -= span / 120) {
            const a = m < sd ? Math.exp((-m / sd) * 3) * (0.5 + 0.5 * Math.abs(Math.sin(m * (i === 2 ? 0.25 : 1.3)))) : 0;
            g.lineTo(xs(m), 52 + a * 14);
          }
          g.closePath();
          g.fillStyle = rgba(hp.color, 0.6);
          g.fill();
          // 진동 막대
          let a0 = 0;
          hp.pat.forEach((d, j) => {
            if (j % 2 === 0) {
              rr(g, xs(a0), 84, Math.max(2, xs(a0 + d) - xs(a0)), 14, 3);
              g.fillStyle = hp.color;
              g.fill();
            }
            a0 += d;
          });
          // 지금 선
          if (ms < span) {
            g.strokeStyle = '#fff';
            g.lineWidth = 1.4;
            g.beginPath();
            g.moveTo(xs(ms), 27);
            g.lineTo(xs(ms), 106);
            g.stroke();
          }
          txt(g, `0ms`, gx, 110, 6.5, 'rgba(255,255,255,0.45)', 'left');
          txt(g, `${span}ms`, gx + gw, 110, 6.5, 'rgba(255,255,255,0.45)', 'right');
          txt(g, `navigator.vibrate([${hp.pat.join(', ')}])`, 184, 124, 8.5, hp.color, 'center', 800, MONO);
          txt(g, sent || (can ? '이 브라우저는 진동 지원' : 'PC 는 대개 진동 없음 — 앱은 Capacitor Haptics'), 184, 139, 6.8, 'rgba(255,255,255,0.55)');
        });
      },
      dispose: () => bus.kill(),
    };
  },
};

// ═════════════════════ 모음 ═════════════════════

const BUILT: DemoMap = {};
for (const [id, s] of Object.entries(SHOTS)) BUILT[id] = shotDemo(id, s);
for (const [id, l] of Object.entries(LOOPS)) BUILT[id] = loopDemo(id, l.spec, l.v0);

export const DEMOS: DemoMap = {
  ...BUILT,
  i161: duckDemo,
  i162: adaptDemo,
  i163: beatDemo,
  i164: spriteDemo,
  i165: busDemo,
  i166: unlockDemo,
  i167: captionDemo,
  i168: hapticDemo,
};

/* 견본판(i499) 추가 소리 묶음(sfxPack.ts)이 같은 엔진 · 그림 도구를 쓴다 */
export type { Shot, Rec, P as SfxParams };
export { shotDemo, osc, noise, envG, gainN, filt, shaper, pan, chain, tone, makeIR, st2, clamp, easeOut, hash, TAU };
export { rr, txt, circ, rgba, star, sparkle, blob, shade, coin, flatCoin, waves, ground, shadow, on01, eyes };

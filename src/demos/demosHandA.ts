import type { Control, DemoMap } from './types';

/**
 * 손그림 그림체 (2D) 앞 9개 견본 (i323 ~ i331) — 선 들끓기 · 스케치 선 · 연필 빗금 · 지그재그 칠 · 수채 · 먹 붓 · 마커 · 색연필 결 · 점묘.
 * 같은 주제(정육면체 · 원그래프 · 웃는 세모 · 숫자 7)를 스타일만 바꿔 그린다. 왼쪽 = 반듯한 원본(또는 비교 대상), 오른쪽 = 손그림.
 * 무거운 그림(연필 결 · 수채 · 먹 · 크레파스)은 주제 · 크기마다 한 번만 오프스크린에 구워 두고 그리기만 한다.
 * 난수는 모두 시드 고정 — 프레임마다 지글거리지 않는다 (선 들끓기만 일부러 몇 장을 번갈아).
 */

type G = CanvasRenderingContext2D;
type P = [number, number];
interface Path { pts: P[]; closed: boolean; bw?: number }
interface Fill { pts: P[]; color: string; tone: number }
interface Dot { c: P; r: number }
interface Subject { name: string; lines: Path[]; fills: Fill[]; brush: Path[]; dots: Dot[] }

const F = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
const TAU = Math.PI * 2;
const INK = '#2a2833';

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const smooth = (e0: number, e1: number, x: number): number => {
  const v = clamp01((x - e0) / (e1 - e0));
  return v * v * (3 - 2 * v);
};

function hash2(i: number, j: number, s = 0): number {
  let h = (Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul((j | 0) + 0x165667b1, 0x85ebca6b) ^ Math.imul((s | 0) + 0x3c6ef372, 0xc2b2ae35)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
function vnoise(x: number, y: number, s = 0): number {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return lerp(lerp(hash2(i, j, s), hash2(i + 1, j, s), ux), lerp(hash2(i, j + 1, s), hash2(i + 1, j + 1, s), ux), uy);
}
/** 주기 P 로 이어지는 값 잡음 (타일 이음새 없음) */
function pnoise(x: number, y: number, P: number, s = 0): number {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const m = (v: number): number => ((v % P) + P) % P;
  return lerp(lerp(hash2(m(i), m(j), s), hash2(m(i + 1), m(j), s), ux), lerp(hash2(m(i), m(j + 1), s), hash2(m(i + 1), m(j + 1), s), ux), uy);
}
const n1 = (x: number, s: number): number => vnoise(x, 7.31, s);
function mulberry(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r: () => number): number => (r() + r() + r() + r() - 2) * 0.866;
function mk(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}
function rgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
/** k < 0 어둡게, k > 0 밝게 */
function shade(hex: string, k: number): string {
  const [r, g, b] = rgb(hex);
  const f = (c: number): number => Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function reset(g: G): void {
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.filter = 'none';
  g.shadowBlur = 0;
  g.shadowColor = 'transparent';
  g.setLineDash([]);
  g.lineCap = 'round';
  g.lineJoin = 'round';
}

/* ═════════════════ 주제 4개 (단위 정사각형 0..1, y 아래) ═════════════════ */

const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n: number): P[] => {
  const o: P[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return o;
};
const seg = (x1: number, y1: number, x2: number, y2: number): Path => ({ pts: [[x1, y1], [x2, y2]], closed: false });

const CUBE: Subject = (() => {
  const lines = [
    seg(0.18, 0.38, 0.62, 0.38), seg(0.62, 0.38, 0.62, 0.82), seg(0.62, 0.82, 0.18, 0.82), seg(0.18, 0.82, 0.18, 0.38),
    seg(0.18, 0.38, 0.4, 0.18), seg(0.4, 0.18, 0.84, 0.18), seg(0.84, 0.18, 0.62, 0.38), seg(0.84, 0.18, 0.84, 0.62), seg(0.84, 0.62, 0.62, 0.82),
  ];
  return {
    name: '정육면체',
    lines,
    fills: [
      { pts: [[0.18, 0.38], [0.4, 0.18], [0.84, 0.18], [0.62, 0.38]], color: '#ffd76e', tone: 0.12 },
      { pts: [[0.18, 0.38], [0.62, 0.38], [0.62, 0.82], [0.18, 0.82]], color: '#ffa94d', tone: 0.45 },
      { pts: [[0.62, 0.38], [0.84, 0.18], [0.84, 0.62], [0.62, 0.82]], color: '#e8743b', tone: 0.8 },
    ],
    brush: lines,
    dots: [],
  };
})();

const PIE: Subject = (() => {
  const cx = 0.5;
  const cy = 0.52;
  const r = 0.35;
  const a0 = -Math.PI / 2;
  const a1 = a0 + TAU * 0.42;
  const a2 = a0 + TAU * 0.72;
  const rad = (a: number): Path => ({ pts: [[cx, cy], [cx + Math.cos(a) * r, cy + Math.sin(a) * r]], closed: false });
  const wedge = (s: number, e: number, color: string, tone: number): Fill => ({ pts: [[cx, cy], ...arc(cx, cy, r, s, e, 28)], color, tone });
  return {
    name: '원그래프',
    lines: [{ pts: arc(cx, cy, r, 0, TAU, 72).slice(0, 72), closed: true }, rad(a0), rad(a1), rad(a2)],
    fills: [wedge(a0, a1, '#ff6b6b', 0.75), wedge(a1, a2, '#4dabf7', 0.42), wedge(a2, a0 + TAU, '#69db7c', 0.15)],
    brush: [{ pts: arc(cx, cy, r, a0 - 0.5, a0 + TAU - 0.75, 70), closed: false, bw: 1.15 }, rad(a0), rad(a1), rad(a2)],
    dots: [],
  };
})();

const TRI: Subject = {
  name: '세모 친구',
  lines: [
    { pts: [[0.5, 0.13], [0.87, 0.83], [0.13, 0.83]], closed: true },
    { pts: arc(0.5, 0.6, 0.1, 0.35, Math.PI - 0.35, 16), closed: false },
  ],
  fills: [
    { pts: [[0.5, 0.13], [0.87, 0.83], [0.13, 0.83]], color: '#8fd3ff', tone: 0.3 },
    { pts: [[0.5, 0.13], [0.87, 0.83], [0.62, 0.83]], color: '#4f9fe0', tone: 0.62 },
    { pts: arc(0.33, 0.69, 0.05, 0, TAU, 14).slice(0, 14), color: '#ff8fab', tone: 0.35 },
    { pts: arc(0.67, 0.69, 0.05, 0, TAU, 14).slice(0, 14), color: '#ff8fab', tone: 0.35 },
  ],
  brush: [
    { pts: [[0.5, 0.13], [0.87, 0.83], [0.13, 0.83]], closed: true },
    { pts: arc(0.5, 0.6, 0.1, 0.35, Math.PI - 0.35, 16), closed: false, bw: 0.6 },
  ],
  dots: [{ c: [0.41, 0.55], r: 0.033 }, { c: [0.59, 0.55], r: 0.033 }],
};

const SEVEN: Subject = {
  name: '숫자 7',
  lines: [{ pts: [[0.24, 0.16], [0.78, 0.16], [0.78, 0.29], [0.5, 0.86], [0.36, 0.86], [0.64, 0.29], [0.24, 0.29]], closed: true }],
  fills: [
    { pts: [[0.24, 0.16], [0.78, 0.16], [0.78, 0.29], [0.24, 0.29]], color: '#b197fc', tone: 0.68 },
    { pts: [[0.64, 0.29], [0.78, 0.29], [0.5, 0.86], [0.36, 0.86]], color: '#9775fa', tone: 0.78 },
  ],
  brush: [{ pts: [[0.22, 0.22], [0.5, 0.215], [0.74, 0.2], [0.66, 0.38], [0.54, 0.62], [0.43, 0.86]], closed: false, bw: 1.75 }],
  dots: [],
};

const SUBJ: Subject[] = [CUBE, PIE, TRI, SEVEN];

/** 주제 차례 — pick 0 = 돌아가며, 1..4 = 고정. a = 바뀔 때 종이로 흐려졌다 나타나는 알파 */
function cyc(t: number, period: number, pick: number): { i: number; tc: number; a: number } {
  const k = Math.floor(t / period);
  const tc = t - k * period;
  const i = pick > 0 ? pick - 1 : ((k % 4) + 4) % 4;
  const a = Math.min(1, tc / 0.3, (period - tc) / 0.3);
  return { i, tc, a: clamp01(a) };
}

/* ═════════════════ 종이 · 결 (한 번만 굽기) ═════════════════ */

let paperTileC: HTMLCanvasElement | null = null;
let hanjiTileC: HTMLCanvasElement | null = null;
let toothTileC: HTMLCanvasElement | null = null;
let toothArr: Float32Array | null = null;

function toothField(): Float32Array {
  if (toothArr) return toothArr;
  const a = new Float32Array(256 * 256);
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const v = 0.46 * pnoise(x / 4, y / 4, 64, 11) + 0.34 * pnoise(x / 2, y / 2, 128, 23) + 0.2 * hash2(x, y, 5);
      a[y * 256 + x] = clamp01((v - 0.5) * 1.9 + 0.5);
    }
  toothArr = a;
  return a;
}
function paperTile(): HTMLCanvasElement {
  if (paperTileC) return paperTileC;
  const c = mk(256, 256);
  const g = c.getContext('2d')!;
  const im = g.createImageData(256, 256);
  const T = toothField();
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const m = 0.6 * pnoise(x / 32, y / 32, 8, 3) + 0.4 * pnoise(x / 12, y / 12, 21.333, 4);
      const tt = T[y * 256 + x]!;
      const tl = T[((y + 255) & 255) * 256 + ((x + 255) & 255)]!;
      const e = (tt - tl) * 16 + (m - 0.5) * 10 + (tt - 0.5) * 6;
      const o = (y * 256 + x) * 4;
      im.data[o] = 245 + e;
      im.data[o + 1] = 240 + e;
      im.data[o + 2] = 228 + e * 1.05;
      im.data[o + 3] = 255;
    }
  g.putImageData(im, 0, 0);
  paperTileC = c;
  return c;
}
function hanjiTile(): HTMLCanvasElement {
  if (hanjiTileC) return hanjiTileC;
  const c = mk(256, 256);
  const g = c.getContext('2d')!;
  const im = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const m = 0.55 * pnoise(x / 40, y / 40, 6.4, 8) + 0.45 * pnoise(x / 9, y / 9, 28.444, 9);
      const e = (m - 0.5) * 14 + (hash2(x, y, 2) - 0.5) * 5;
      const o = (y * 256 + x) * 4;
      im.data[o] = 238 + e;
      im.data[o + 1] = 229 + e;
      im.data[o + 2] = 207 + e;
      im.data[o + 3] = 255;
    }
  g.putImageData(im, 0, 0);
  // 닥 섬유 — 이음새 없이 9칸에 겹쳐 그림
  const r = mulberry(77);
  g.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const x = r() * 256;
    const y = r() * 256;
    const a = r() * TAU;
    const L = 10 + r() * 34;
    const bend = (r() - 0.5) * 12;
    const light = r() < 0.6;
    g.strokeStyle = light ? 'rgba(255,252,240,0.55)' : 'rgba(150,130,95,0.22)';
    g.lineWidth = 0.4 + r() * 0.7;
    for (let ox = -256; ox <= 256; ox += 256)
      for (let oy = -256; oy <= 256; oy += 256) {
        g.beginPath();
        g.moveTo(x + ox, y + oy);
        g.quadraticCurveTo(x + ox + Math.cos(a) * L * 0.5 - Math.sin(a) * bend, y + oy + Math.sin(a) * L * 0.5 + Math.cos(a) * bend, x + ox + Math.cos(a) * L, y + oy + Math.sin(a) * L);
        g.stroke();
      }
  }
  hanjiTileC = c;
  return c;
}
/** 종이 이(골짜기) 무늬 — destination-out 으로 연필 · 물감이 군데군데 비게 */
function toothTile(): HTMLCanvasElement {
  if (toothTileC) return toothTileC;
  const c = mk(256, 256);
  const g = c.getContext('2d')!;
  const im = g.createImageData(256, 256);
  const T = toothField();
  for (let i = 0; i < 256 * 256; i++) {
    im.data[i * 4 + 3] = Math.round(255 * smooth(0.62, 0.22, T[i]!));
  }
  g.putImageData(im, 0, 0);
  toothTileC = c;
  return c;
}

const colorToothMap = new Map<string, HTMLCanvasElement>();
/** 색연필 결: 색을 칠하고 종이 골짜기만 비운 타일 (줄에 무늬로 씀) */
function colorTooth(color: string): HTMLCanvasElement {
  let c = colorToothMap.get(color);
  if (c) return c;
  c = mk(256, 256);
  const g = c.getContext('2d')!;
  g.fillStyle = shade(color, -0.1);
  g.fillRect(0, 0, 256, 256);
  g.globalCompositeOperation = 'destination-out';
  g.globalAlpha = 0.75;
  g.drawImage(toothTile(), 0, 0);
  colorToothMap.set(color, c);
  return c;
}
const patCache = new WeakMap<G, Map<HTMLCanvasElement, CanvasPattern>>();
function pat(g: G, src: HTMLCanvasElement): CanvasPattern {
  let m = patCache.get(g);
  if (!m) {
    m = new Map();
    patCache.set(g, m);
  }
  let p = m.get(src);
  if (!p) {
    p = g.createPattern(src, 'repeat')!;
    m.set(src, p);
  }
  return p;
}

/* ═════════════════ 굽기 · 임시 층 ═════════════════ */

interface BK { g: G; d: number; m: number; S: number; W: number; H: number }
/** 주제 그림을 정사각형(S) + 둘레 여유(m)에 구워 둔다 */
class Bakery {
  private map = new Map<string, HTMLCanvasElement>();
  get(key: string, S: number, d: number, fn: (b: BK) => void): HTMLCanvasElement {
    const k = `${key}|${Math.round(S)}@${d}`;
    const hit = this.map.get(k);
    if (hit) {
      this.map.delete(k);
      this.map.set(k, hit);
      return hit;
    }
    const m = S * 0.12;
    const B = S + m * 2;
    const c = mk(B * d, B * d);
    const g = c.getContext('2d')!;
    g.setTransform(d, 0, 0, d, 0, 0);
    reset(g);
    fn({ g, d, m, S, W: c.width, H: c.height });
    this.map.set(k, c);
    if (this.map.size > 48) {
      const first = this.map.keys().next().value;
      if (first !== undefined) this.map.delete(first);
    }
    return c;
  }
  clear(): void {
    this.map.clear();
  }
}
const pool: HTMLCanvasElement[] = [];
/** 같은 크기의 임시 층 (변환 = d 배, 깨끗하게 비움) */
function layer(b: BK, idx: number): [HTMLCanvasElement, G] {
  let c = pool[idx];
  if (!c) {
    c = mk(1, 1);
    pool[idx] = c;
  }
  if (c.width !== b.W || c.height !== b.H) {
    c.width = b.W;
    c.height = b.H;
  }
  const g = c.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  reset(g);
  g.clearRect(0, 0, c.width, c.height);
  g.setTransform(b.d, 0, 0, b.d, 0, 0);
  return [c, g];
}
function grainOut(lg: G, strength: number, ox: number, oy: number, scale = 1): void {
  lg.save();
  lg.setTransform(1, 0, 0, 1, 0, 0);
  lg.globalCompositeOperation = 'destination-out';
  lg.globalAlpha = strength;
  const p = pat(lg, toothTile());
  p.setTransform(new DOMMatrix().translate(ox, oy).scale(scale));
  lg.fillStyle = p;
  lg.fillRect(0, 0, lg.canvas.width, lg.canvas.height);
  lg.restore();
}
function blit(g: G, src: HTMLCanvasElement, alpha = 1, op: GlobalCompositeOperation = 'source-over'): void {
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = alpha;
  g.globalCompositeOperation = op;
  g.drawImage(src, 0, 0);
  g.restore();
}
const X = (b: BK, p: P): P => [b.m + p[0] * b.S, b.m + p[1] * b.S];
const mapPts = (b: BK, pts: P[]): P[] => pts.map((p) => X(b, p));

/* ═════════════════ 손 선 (떨림 · 넘침 · 굵기) ═════════════════ */

interface RS { p: P[]; s: number[]; L: number }
function resample(src: P[], step: number): RS {
  const lens: number[] = [];
  let L = 0;
  for (let i = 0; i < src.length - 1; i++) {
    const d = Math.hypot(src[i + 1]![0] - src[i]![0], src[i + 1]![1] - src[i]![1]);
    lens.push(d);
    L += d;
  }
  if (lens.length === 0) return { p: [src[0]!, src[0]!], s: [0, 0], L: 0 };
  const n = Math.max(2, Math.ceil(L / step) + 1);
  const p: P[] = [];
  const s: number[] = [];
  let si = 0;
  let acc = 0;
  for (let k = 0; k < n; k++) {
    const tg = (L * k) / (n - 1);
    while (si < lens.length - 1 && acc + lens[si]! < tg) {
      acc += lens[si]!;
      si++;
    }
    const a = src[si]!;
    const bb = src[si + 1]!;
    const f = clamp01((tg - acc) / (lens[si]! || 1));
    p.push([a[0] + (bb[0] - a[0]) * f, a[1] + (bb[1] - a[1]) * f]);
    s.push(tg);
  }
  return { p, s, L };
}
/** 손으로 그은 길: 떨림(jit) · 시작 · 끝 넘침(over) · 휨. sc = S/100 */
function handPath(pts: P[], closed: boolean, seed: number, jit: number, over: number, sc: number, step = 1.6): RS {
  const r = mulberry(seed);
  let path: P[] = pts.slice();
  const unit = (a: P, b: P): P => {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
  };
  if (closed) {
    const k = Math.floor(r() * path.length);
    path = path.slice(k).concat(path.slice(0, k + 1));
    if (over > 0 && path.length > 2) {
      const u = unit(path[0]!, path[1]!);
      const o = over * (0.4 + r() * 0.9);
      path.push([path[0]![0] + u[0] * o, path[0]![1] + u[1] * o]);
    }
  } else if (over > 0 && path.length > 1) {
    const u0 = unit(path[1]!, path[0]!);
    const o0 = over * (0.15 + r() * 0.9);
    path.unshift([path[0]![0] + u0[0] * o0, path[0]![1] + u0[1] * o0]);
    const n = path.length;
    const u1 = unit(path[n - 2]!, path[n - 1]!);
    const o1 = over * (0.15 + r() * 0.9);
    path.push([path[n - 1]![0] + u1[0] * o1, path[n - 1]![1] + u1[1] * o1]);
  }
  const rs = resample(path, step * sc);
  const bow = (r() - 0.5) * 2 * jit * 1.3;
  const out: P[] = [];
  const n = rs.p.length;
  for (let i = 0; i < n; i++) {
    const a = rs.p[Math.max(0, i - 1)]!;
    const c = rs.p[Math.min(n - 1, i + 1)]!;
    const dl = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
    const nx = -(c[1] - a[1]) / dl;
    const ny = (c[0] - a[0]) / dl;
    const s = rs.s[i]!;
    const off = jit * ((n1(s / (24 * sc), seed) - 0.5) * 1.8 + (n1(s / (5 * sc), seed + 3) - 0.5) * 0.45) + bow * Math.sin((Math.PI * s) / (rs.L || 1));
    out.push([rs.p[i]![0] + nx * off, rs.p[i]![1] + ny * off]);
  }
  return { p: out, s: rs.s, L: rs.L };
}
/** 연필 한 획 — 가운데가 굵고 양끝이 가늘게 (누르는 힘). 굵기가 변하는 띠를 한 번에 채움 */
function pencilStroke(g: G, hp: RS, w: number, sc: number, seed: number): void {
  const n = hp.p.length;
  if (n < 2) return;
  const half: number[] = [];
  const nr: P[] = [];
  for (let i = 0; i < n; i++) {
    const f = hp.s[i]! / (hp.L || 1);
    const pr = Math.pow(Math.sin(Math.PI * (0.03 + f * 0.94)), 0.45);
    const wn = 0.86 + 0.28 * n1(hp.s[i]! / (11 * sc), seed + 9);
    half.push((w * (0.32 + 0.68 * pr) * wn) / 2);
    const a = hp.p[Math.max(0, i - 1)]!;
    const c = hp.p[Math.min(n - 1, i + 1)]!;
    const dl = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
    nr.push([-(c[1] - a[1]) / dl, (c[0] - a[0]) / dl]);
  }
  const prev = g.fillStyle;
  g.fillStyle = g.strokeStyle;
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const x = hp.p[i]![0] + nr[i]![0] * half[i]!;
    const y = hp.p[i]![1] + nr[i]![1] * half[i]!;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  // 끝 둥글게
  const e = hp.p[n - 1]!;
  g.arc(e[0], e[1], half[n - 1]!, Math.atan2(nr[n - 1]![1], nr[n - 1]![0]), Math.atan2(-nr[n - 1]![1], -nr[n - 1]![0]), true);
  for (let i = n - 1; i >= 0; i--) g.lineTo(hp.p[i]![0] - nr[i]![0] * half[i]!, hp.p[i]![1] - nr[i]![1] * half[i]!);
  const s0 = hp.p[0]!;
  g.arc(s0[0], s0[1], half[0]!, Math.atan2(-nr[0]![1], -nr[0]![0]), Math.atan2(nr[0]![1], nr[0]![0]), true);
  g.closePath();
  g.fill();
  g.fillStyle = prev;
}
/** 꼭짓점이 몇 개 안 되는 닫힌 길은 변마다 따로 (모서리 넘침이 보이게) */
function explode(path: Path): Path[] {
  if (path.pts.length > 9) return [path];
  const o: Path[] = [];
  const n = path.pts.length;
  const m = path.closed ? n : n - 1;
  for (let i = 0; i < m; i++) o.push({ pts: [path.pts[i]!, path.pts[(i + 1) % n]!], closed: false });
  return o;
}
function polyPath(g: G, pts: P[]): void {
  g.beginPath();
  g.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]![0], pts[i]![1]);
  g.closePath();
}
function linePath(g: G, pts: P[], closed: boolean): void {
  g.beginPath();
  g.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]![0], pts[i]![1]);
  if (closed) g.closePath();
}
/** 칠할 면을 기울인 줄로 자른 구간 (볼록 다각형) */
function spans(pts: P[], ang: number, gap: number): [P, P][] {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const rp = pts.map((p): P => [p[0] * c + p[1] * s, -p[0] * s + p[1] * c]);
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of rp) {
    y0 = Math.min(y0, p[1]);
    y1 = Math.max(y1, p[1]);
  }
  const out: [P, P][] = [];
  for (let y = y0 + gap * 0.5; y < y1; y += gap) {
    let xa = Infinity;
    let xb = -Infinity;
    for (let i = 0; i < rp.length; i++) {
      const a = rp[i]!;
      const b = rp[(i + 1) % rp.length]!;
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        const x = a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
        xa = Math.min(xa, x);
        xb = Math.max(xb, x);
      }
    }
    if (xb > xa) {
      const back = (x: number): P => [x * c - y * s, x * s + y * c];
      out.push([back(xa), back(xb)]);
    }
  }
  return out;
}
function centroid(pts: P[]): P {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p[0];
    y += p[1];
  }
  return [x / pts.length, y / pts.length];
}

/* ═════════════════ 화면 틀 ═════════════════ */

interface Panel { x: number; y: number; w: number; h: number; sx: number; sy: number; S: number }
interface Stage { u: number; d: number; L: Panel | null; R: Panel }
function stage(g: G, w: number, h: number, split: boolean, lblL: string, lblR: string, accent: string, paperR: 'paper' | 'hanji' | 'white' = 'paper', bottom = 0): Stage {
  reset(g);
  const u = Math.min(w / 280, h / 175, 2);
  const d = g.getTransform().a || 1;
  const bgG = g.createLinearGradient(0, 0, 0, h);
  bgG.addColorStop(0, '#262833');
  bgG.addColorStop(1, '#15161c');
  g.fillStyle = bgG;
  g.fillRect(0, 0, w, h);
  const pad = 7 * u;
  const gap = 7 * u;
  const pw = split ? (w - pad * 2 - gap) / 2 : Math.min(w - pad * 2, (h - pad * 2) * 1.5);
  const ph = h - pad * 2;
  const mkP = (x: number): Panel => {
    const top = 17 * u;
    const avail = ph - top - 5 * u - bottom * u;
    const S = Math.min(pw * 0.88, avail * 0.98);
    return { x, y: pad, w: pw, h: ph, sx: x + (pw - S) / 2, sy: pad + top + (avail - S) / 2, S };
  };
  const L = split ? mkP(pad) : null;
  const R = mkP(split ? pad + pw + gap : (w - pw) / 2);
  const sheet = (p: Panel, kind: 'paper' | 'hanji' | 'white'): void => {
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.5)';
    g.shadowBlur = 9 * u;
    g.shadowOffsetY = 3 * u;
    if (kind === 'white') g.fillStyle = '#fbfbf9';
    else {
      const pt = pat(g, kind === 'hanji' ? hanjiTile() : paperTile());
      pt.setTransform(new DOMMatrix().scale(kind === 'hanji' ? 0.8 : 0.62));
      g.fillStyle = pt;
    }
    g.fillRect(p.x, p.y, p.w, p.h);
    g.restore();
    if (kind !== 'white') {
      // 종이 가장자리 살짝 그늘
      const vg = g.createRadialGradient(p.x + p.w / 2, p.y + p.h / 2, Math.min(p.w, p.h) * 0.35, p.x + p.w / 2, p.y + p.h / 2, Math.max(p.w, p.h) * 0.75);
      vg.addColorStop(0, 'rgba(120,100,60,0)');
      vg.addColorStop(1, 'rgba(120,100,60,0.12)');
      g.fillStyle = vg;
      g.fillRect(p.x, p.y, p.w, p.h);
    }
  };
  const label = (p: Panel, txt: string, col: string): void => {
    g.font = `700 ${8.2 * u}px ${F}`;
    g.textBaseline = 'middle';
    const tw = g.measureText(txt).width;
    g.fillStyle = col;
    const rx = p.x + 5 * u;
    const ry = p.y + 4.5 * u;
    g.beginPath();
    g.roundRect(rx, ry, tw + 9 * u, 11 * u, 5.5 * u);
    g.fill();
    g.fillStyle = '#fff';
    g.fillText(txt, rx + 4.5 * u, ry + 5.7 * u);
  };
  if (L) {
    sheet(L, 'white');
    label(L, lblL, '#7b808c');
  }
  sheet(R, paperR);
  label(R, lblR, accent);
  return { u, d, L, R };
}
/** 구운 주제 그림을 판 위에 */
function put(g: G, c: HTMLCanvasElement, p: Panel, alpha = 1, op: GlobalCompositeOperation = 'source-over'): void {
  const m = p.S * 0.12;
  g.save();
  g.globalAlpha = alpha;
  g.globalCompositeOperation = op;
  g.drawImage(c, p.sx - m, p.sy - m, p.S + m * 2, p.S + m * 2);
  g.restore();
}
function tag(g: G, txt: string, x: number, y: number, u: number, col = 'rgba(40,36,50,0.75)', align: CanvasTextAlign = 'right'): void {
  g.font = `600 ${7.2 * u}px ${F}`;
  g.textAlign = align;
  g.textBaseline = 'alphabetic';
  g.fillStyle = col;
  g.fillText(txt, x, y);
  g.textAlign = 'left';
}

/* ═════════════════ 반듯한 원본 ═════════════════ */

function bakeClean(b: BK, s: Subject, mode: 'color' | 'gray' | 'line'): void {
  const g = b.g;
  if (mode !== 'line') {
    const [lc, lg] = layer(b, 0);
    for (const f of s.fills) {
      if (mode === 'color') lg.fillStyle = f.color;
      else {
        const v = Math.round(255 * (1 - f.tone * 0.86));
        lg.fillStyle = `rgb(${v},${v},${v})`;
      }
      polyPath(lg, mapPts(b, f.pts));
      lg.fill();
    }
    if (mode === 'gray') {
      lg.globalCompositeOperation = 'source-atop';
      const gr = lg.createLinearGradient(b.m, b.m, b.m + b.S, b.m + b.S);
      gr.addColorStop(0, 'rgba(255,255,255,0.25)');
      gr.addColorStop(1, 'rgba(0,0,0,0.22)');
      lg.fillStyle = gr;
      lg.fillRect(0, 0, b.m * 2 + b.S, b.m * 2 + b.S);
      lg.globalCompositeOperation = 'source-over';
    }
    blit(g, lc);
  }
  g.strokeStyle = INK;
  g.lineWidth = b.S * 0.016;
  for (const l of s.lines) {
    linePath(g, mapPts(b, l.pts), l.closed);
    g.stroke();
  }
  g.fillStyle = INK;
  for (const dt of s.dots) {
    const c = X(b, dt.c);
    g.beginPath();
    g.arc(c[0], c[1], dt.r * b.S, 0, TAU);
    g.fill();
  }
}

/** 연필 선 그림 (선 들끓기 · 스케치 · 빗금 · 칠하기 · 수채 밑그림이 같이 쓴다) */
interface PencilOpt { seed: number; jit: number; over: number; passes: number; w: number; col: string; grain: number; explodeAll?: boolean }
function bakePencil(b: BK, s: Subject, o: PencilOpt): void {
  const sc = b.S / 100;
  const paths = o.explodeAll ? s.lines.flatMap(explode) : s.lines;
  for (let pass = 0; pass < o.passes; pass++) {
    const [lc, lg] = layer(b, 1);
    lg.strokeStyle = o.col;
    lg.lineCap = 'round';
    paths.forEach((pth, i) => {
      const hp = handPath(mapPts(b, pth.pts), pth.closed, o.seed * 997 + i * 31 + pass * 7919, o.jit * sc, o.over * sc, sc);
      pencilStroke(lg, hp, o.w * sc * (pass ? 0.8 : 1), sc, o.seed + i + pass * 13);
    });
    // 눈 — 연필로 꾹꾹 칠한 점
    lg.fillStyle = o.col;
    s.dots.forEach((dt, i) => {
      const c = X(b, dt.c);
      const hp = handPath(arc(c[0], c[1], dt.r * b.S, 0, TAU, 12).slice(0, 12), true, o.seed * 51 + i * 3 + pass, o.jit * sc * 0.25, 0, sc, 1);
      linePath(lg, hp.p, true);
      lg.fill();
    });
    grainOut(lg, o.grain, pass * 37 + o.seed * 11, pass * 53);
    blit(b.g, lc, pass ? 0.75 : 0.95);
  }
}

/* ═════════════════ i323 선 들끓기 — 장면 굽기 ═════════════════ */

function bakeBoilFrame(b: BK, s: Subject, f: number, jit: number): void {
  const sc = b.S / 100;
  const r = mulberry(f * 7 + 3);
  // 색: 판마다 살짝 다르게 어긋난 칠 (손으로 매번 칠한 느낌)
  const [lc, lg] = layer(b, 0);
  const dx = (r() - 0.5) * 2.2 * sc * jit;
  const dy = (r() - 0.5) * 2.2 * sc * jit;
  s.fills.forEach((fl, i) => {
    const hp = handPath(mapPts(b, fl.pts).map((p): P => [p[0] + dx, p[1] + dy]), true, f * 131 + i * 17, jit * 1.1 * sc, 0, sc, 2.5);
    lg.fillStyle = fl.color;
    lg.globalAlpha = 0.85;
    linePath(lg, hp.p, true);
    lg.fill();
  });
  lg.globalAlpha = 1;
  grainOut(lg, 0.16, f * 41, f * 23);
  blit(b.g, lc, 1, 'multiply');
  bakePencil(b, s, { seed: f * 13 + 1, jit: jit * 1.15, over: 0.6 * jit, passes: 1, w: 1.9, col: '#2b2734', grain: 0.42 });
}

/* ═════════════════ i325 빗금 ═════════════════ */

const HATCH_TH = [0.04, 0.32, 0.56, 0.76];
const HATCH_ANG = [Math.PI / 4, -Math.PI / 4, 0, Math.PI / 2];
function bakeHatchLayer(b: BK, s: Subject, k: number, gapK: number, jit: number, cross: boolean): void {
  const sc = b.S / 100;
  const g = b.g;
  const r = mulberry(k * 101 + 7);
  const fills: { pts: P[]; tone: number }[] = [...s.fills.map((f) => ({ pts: f.pts, tone: f.tone })), ...s.dots.map((dt) => ({ pts: arc(dt.c[0], dt.c[1], dt.r * 1.15, 0, TAU, 14).slice(0, 14), tone: 0.97 }))];
  const [lc, lg] = layer(b, 2);
  lg.strokeStyle = '#2c2a35';
  lg.lineCap = 'round';
  for (const f of fills) {
    if (f.tone <= HATCH_TH[k]!) continue;
    const pts = mapPts(b, f.pts);
    const small = f.pts.length > 10 && f.tone > 0.9;
    const ang = cross ? HATCH_ANG[k]! : Math.PI / 4;
    const gap = (small ? 0.9 : 2.6) * sc * gapK * (cross ? 1 : 1 / (1 + k * 0.8));
    const rows = spans(pts, ang, gap);
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const off = cross ? 0 : (k * gap) / 4;
    for (const [a0, b0] of rows) {
      const a: P = [a0[0] - sa * off, a0[1] + ca * off];
      const bb: P = [b0[0] - sa * off, b0[1] + ca * off];
      const len = Math.hypot(bb[0] - a[0], bb[1] - a[1]);
      if (len < 0.5 * sc) continue;
      const i0 = (r() * 0.9 - 0.3) * gap * 1.4;
      const i1 = (r() * 0.9 - 0.3) * gap * 1.4;
      const jo = (r() - 0.5) * 0.45 * gap;
      const tilt = (r() - 0.5) * 0.05 * len;
      const x0 = a[0] + ca * i0 - sa * jo;
      const y0 = a[1] + sa * i0 + ca * jo;
      const x1 = bb[0] - ca * i1 - sa * (jo + tilt);
      const y1 = bb[1] - sa * i1 + ca * (jo + tilt);
      const bend = (r() - 0.5) * jit * sc * 1.2;
      lg.globalAlpha = 0.5 + r() * 0.45;
      lg.lineWidth = (0.42 + r() * 0.35) * sc * (small ? 0.7 : 1);
      lg.beginPath();
      lg.moveTo(x0, y0);
      lg.quadraticCurveTo((x0 + x1) / 2 - sa * bend, (y0 + y1) / 2 + ca * bend, x1, y1);
      lg.stroke();
    }
  }
  lg.globalAlpha = 1;
  grainOut(lg, 0.4, k * 61, k * 29);
  blit(g, lc);
}

/* ═════════════════ i326 지그재그 · i329 마커 줄 ═════════════════ */

interface Poly { pts: P[]; L: number; cum: number[]; color: string }
function mkPoly(pts: P[], color: string): Poly {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  return { pts, L: cum[cum.length - 1]!, cum, color };
}
function drawPolyUpTo(g: G, pl: Poly, len: number): void {
  if (len <= 0) return;
  g.beginPath();
  g.moveTo(pl.pts[0]![0], pl.pts[0]![1]);
  for (let i = 1; i < pl.pts.length; i++) {
    if (pl.cum[i]! <= len) g.lineTo(pl.pts[i]![0], pl.pts[i]![1]);
    else {
      const a = pl.pts[i - 1]!;
      const b = pl.pts[i]!;
      const f = (len - pl.cum[i - 1]!) / (pl.cum[i]! - pl.cum[i - 1]! || 1);
      g.lineTo(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f);
      break;
    }
  }
  g.stroke();
}
/** 면 하나를 낙서 지그재그 한 줄로 (단위 좌표) */
function zigzag(f: Fill, seed: number, gapU: number, over: number): P[] {
  const r = mulberry(seed);
  const ang = (r() < 0.5 ? 1 : -1) * (0.45 + r() * 0.5);
  const small = f.pts.length > 10 && f.pts.length < 20;
  const gap = gapU * (small ? 0.55 : 1);
  const rows = spans(f.pts, ang, gap);
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const out: P[] = [];
  rows.forEach(([a, b], i) => {
    const eb = (r() - 0.35) * gap * over * 1.6;
    const A: P = i === 0 ? [a[0], a[1]] : out[out.length - 1]!;
    const B: P = [b[0] + ca * eb, b[1] + sa * eb];
    // 왔다(A→B) 갔다(B→다음 줄 A) — 꺾이는 곳이 뾰족한 지그재그
    const bend = (r() - 0.5) * gap * 1.2;
    if (i === 0) out.push(A);
    out.push([(A[0] + B[0]) / 2 - sa * bend, (A[1] + B[1]) / 2 + ca * bend]);
    out.push(B);
    const nx = rows[i + 1];
    if (nx) {
      const ea2 = (r() - 0.35) * gap * over * 1.6;
      const A2: P = [nx[0][0] - ca * ea2, nx[0][1] - sa * ea2];
      const bend2 = (r() - 0.5) * gap * 1.2;
      out.push([(B[0] + A2[0]) / 2 - sa * bend2, (B[1] + A2[1]) / 2 + ca * bend2]);
      out.push(A2);
    }
  });
  return out;
}

/* ═════════════════ i327 수채 ═════════════════ */

function decimate(pts: P[], max: number): P[] {
  if (pts.length <= max) return pts;
  const o: P[] = [];
  for (let i = 0; i < max; i++) o.push(pts[Math.floor((i * pts.length) / max)]!);
  return o;
}
function deform(pts: P[], depth: number, vr: number, r: () => number): P[] {
  let cur = pts;
  for (let d = 0; d < depth; d++) {
    const nx: P[] = [];
    for (let i = 0; i < cur.length; i++) {
      const a = cur[i]!;
      const b = cur[(i + 1) % cur.length]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      nx.push(a);
      const gn = gauss(r) * len * vr;
      const ga = gauss(r) * len * vr * 0.3;
      const ux = (b[0] - a[0]) / (len || 1);
      const uy = (b[1] - a[1]) / (len || 1);
      nx.push([(a[0] + b[0]) / 2 - uy * gn + ux * ga, (a[1] + b[1]) / 2 + ux * gn + uy * ga]);
    }
    cur = nx;
  }
  return cur;
}
function bakeWater(b: BK, s: Subject, seed: number, spread: number, layers: number, edge: boolean): void {
  const sc = b.S / 100;
  const g = b.g;
  // 연필 밑그림 (옅게)
  bakePencil(b, s, { seed: 5, jit: 0.5, over: 0.8, passes: 1, w: 0.9, col: '#6b6676', grain: 0.55 });
  g.save();
  g.globalAlpha = 1;
  const fills: Fill[] = [...s.fills, ...s.dots.map((dt): Fill => ({ pts: arc(dt.c[0], dt.c[1], dt.r * 1.05, 0, TAU, 10).slice(0, 10), color: '#343a5c', tone: 1 }))];
  fills.forEach((f, fi) => {
    const r = mulberry(seed * 1009 + fi * 71);
    const raw = mapPts(b, f.pts);
    const base0 = raw.length > 8 ? decimate(raw, 16) : resample([...raw, raw[0]!], b.S * 0.13).p.slice(0, -1);
    // 가장자리를 안쪽으로 살짝 당겨 종이 흰 틈이 남게
    const c = centroid(base0);
    const shrink = f.tone >= 1 ? 1 : 0.965;
    const base1 = base0.map((p): P => [c[0] + (p[0] - c[0]) * shrink, c[1] + (p[1] - c[1]) * shrink]);
    const tiny = f.tone >= 1;
    const base = deform(base1, tiny ? 1 : 2, 0.16 * spread, r);
    const [lc, lg] = layer(b, 0);
    lg.fillStyle = f.color;
    lg.filter = `blur(${0.5 * sc}px)`;
    const nL = tiny ? Math.ceil(layers * 0.6) : layers;
    for (let i = 0; i < nL; i++) {
      const poly = deform(base, tiny ? 2 : 3, 0.13 * spread, r);
      lg.globalAlpha = tiny ? 0.12 : 0.055 + 0.02 * r();
      polyPath(lg, poly);
      lg.fill();
    }
    lg.globalAlpha = 1;
    lg.filter = 'none';
    // 안료 알갱이 (종이 골짜기에 덜 묻음) — 크고 부드러운 얼룩
    grainOut(lg, 0.13, fi * 47 + seed * 13, fi * 19, 2.2);
    if (edge && !tiny) {
      // 가장자리 짙게: 층 - 흐린 층 = 안쪽 테두리 고리
      const [ec, eg] = layer(b, 1);
      blit(eg, lc);
      eg.save();
      eg.setTransform(1, 0, 0, 1, 0, 0);
      eg.globalCompositeOperation = 'destination-out';
      eg.filter = `blur(${1.8 * sc * b.d}px)`;
      eg.drawImage(lc, 0, 0);
      eg.restore();
      eg.globalCompositeOperation = 'source-in';
      eg.fillStyle = shade(f.color, -0.32);
      eg.fillRect(0, 0, b.m * 2 + b.S, b.m * 2 + b.S);
      blit(lc.getContext('2d')!, ec, 1);
      blit(lc.getContext('2d')!, ec, 0.6);
    }
    blit(g, lc, 1, 'multiply');
  });
  g.restore();
  // 웃는 입은 가는 붓선
  if (s === TRI) {
    const hp = handPath(mapPts(b, TRI.lines[1]!.pts), false, 9, 0.3 * sc, 0, sc);
    g.strokeStyle = 'rgba(52,58,92,0.85)';
    pencilStroke(g, hp, 1.6 * sc, sc, 3);
  }
}

/* ═════════════════ i328 먹 붓 ═════════════════ */

interface BrushOpt { press: number; dry: number; bleed: number; seed: number }
function brushStroke(b: BK, pts: P[], closed: boolean, Wmax: number, o: BrushOpt): void {
  const g = b.g;
  const sc = b.S / 100;
  const hp = handPath(pts, closed, o.seed, 0.5 * sc, closed ? 2 * sc : 0, sc, 0.9);
  const n = hp.p.length;
  const L = hp.L || 1;
  const prof = (f: number, s: number): number => {
    const entry = f < 0.07 ? 0.82 + 0.35 * Math.sin((f / 0.07) * Math.PI) : 1;
    const body = 0.8 + 0.26 * n1(s / (14 * sc), o.seed + 5);
    const tail = f > 0.62 ? Math.pow(clamp01((1 - f) / 0.38), 0.75) : 1;
    return entry * body * Math.max(0.05, tail);
  };
  const Wf: number[] = [];
  const nrm: P[] = [];
  for (let i = 0; i < n; i++) {
    const f = hp.s[i]! / L;
    Wf.push(Wmax * (1 - o.press + o.press * prof(f, hp.s[i]!)) * (o.press < 0.3 ? Math.max(0.35, Math.pow(clamp01((1 - f) / 0.12), 0.5)) : 1));
    const a = hp.p[Math.max(0, i - 1)]!;
    const c = hp.p[Math.min(n - 1, i + 1)]!;
    const dl = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
    nrm.push([-(c[1] - a[1]) / dl, (c[0] - a[0]) / dl]);
  }
  const body: P[] = [];
  for (let i = 0; i < n; i++) body.push([hp.p[i]![0] + nrm[i]![0] * Wf[i]! * 0.5, hp.p[i]![1] + nrm[i]![1] * Wf[i]! * 0.5]);
  for (let i = n - 1; i >= 0; i--) body.push([hp.p[i]![0] - nrm[i]![0] * Wf[i]! * 0.42, hp.p[i]![1] - nrm[i]![1] * Wf[i]! * 0.42]);
  // 먹 번짐 — 한지에 스민 흐린 테
  if (o.bleed > 0.01) {
    g.save();
    g.filter = `blur(${(1 + o.bleed * 4) * sc}px)`;
    g.globalAlpha = 0.18 + o.bleed * 0.3;
    g.fillStyle = '#3d3934';
    polyPath(g, body);
    g.fill();
    g.restore();
  }
  // 몸통 (젖은 먹) — 끝으로 갈수록 먹이 말라 옅어짐 (불투명 조각을 조금씩 겹쳐 이음새 없이)
  g.save();
  g.globalCompositeOperation = 'darken';
  const step = 3;
  for (let i = 0; i < n - 1; i += step) {
    const j = Math.min(n - 1, i + step + 1);
    const f = hp.s[i]! / L;
    const v = 0.07 + 0.88 * o.dry * smooth(0.0, 1, f) * (0.7 + 0.3 * n1(hp.s[i]! / (20 * sc), o.seed + 41));
    g.fillStyle = `rgb(${Math.round(v * 250 + 6)},${Math.round(v * 238 + 5)},${Math.round(v * 220 + 4)})`;
    g.beginPath();
    g.moveTo(hp.p[i]![0] + nrm[i]![0] * Wf[i]! * 0.5, hp.p[i]![1] + nrm[i]![1] * Wf[i]! * 0.5);
    g.lineTo(hp.p[j]![0] + nrm[j]![0] * Wf[j]! * 0.5, hp.p[j]![1] + nrm[j]![1] * Wf[j]! * 0.5);
    g.lineTo(hp.p[j]![0] - nrm[j]![0] * Wf[j]! * 0.42, hp.p[j]![1] - nrm[j]![1] * Wf[j]! * 0.42);
    g.lineTo(hp.p[i]![0] - nrm[i]![0] * Wf[i]! * 0.42, hp.p[i]![1] - nrm[i]![1] * Wf[i]! * 0.42);
    g.closePath();
    g.fill();
  }
  g.restore();
  // 붓털 — 마를수록 끝에서 갈라짐 (갈필)
  const M = 34;
  const r = mulberry(o.seed + 99);
  g.save();
  g.strokeStyle = '#16130f';
  g.lineCap = 'round';
  for (let k = 0; k < M; k++) {
    const off = (k / (M - 1) - 0.5) * 0.92 + (r() - 0.5) * 0.04;
    const ink = 0.75 + r() * 0.25;
    const fr = 10 + r() * 22;
    g.lineWidth = Math.max(0.45, (Wmax / M) * (1.1 + r() * 0.9));
    g.globalAlpha = 0.55 + 0.4 * ink;
    let on = false;
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const f = hp.s[i]! / L;
      const edgeK = Math.abs(off) * 2;
      const gapT = o.dry * (0.05 + 1.1 * f * f + edgeK * edgeK * 0.6) - (ink - 0.75) * 0.5;
      const vis = n1(hp.s[i]! / (fr * sc), o.seed * 7 + k * 13) > 1 - gapT ? false : true;
      const x = hp.p[i]![0] + nrm[i]![0] * off * Wf[i]!;
      const y = hp.p[i]![1] + nrm[i]![1] * off * Wf[i]!;
      if (vis && Wf[i]! > 0.4) {
        if (!on) g.moveTo(x, y);
        else g.lineTo(x, y);
        on = true;
      } else on = false;
    }
    g.stroke();
  }
  g.restore();
}

/* ═════════════════ i330 크레파스 · 색연필 ═════════════════ */

function toothMask(lc: HTMLCanvasElement, th: number, soft: number, scale: number, keepMul: number, waxy: boolean): void {
  const g = lc.getContext('2d')!;
  const im = g.getImageData(0, 0, lc.width, lc.height);
  const T = toothField();
  const W = lc.width;
  const H = lc.height;
  const dt = im.data;
  const inv = 1 / scale;
  for (let y = 0; y < H; y++) {
    const ty = (Math.floor(y * inv) & 255) * 256;
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4 + 3;
      const a = dt[o]!;
      if (a === 0) continue;
      const tv = T[ty + (Math.floor(x * inv) & 255)]!;
      if (waxy) {
        // 덜 겹친(옅은) 곳일수록 골짜기를 더 건너뜀 → 결 따라 줄무늬
        const k = smooth(th - soft, th + soft, tv + (a / 255 - 1) * 0.95);
        dt[o] = 255 * k;
      } else dt[o] = a * smooth(th - soft, th + soft, tv) * keepMul;
    }
  }
  g.putImageData(im, 0, 0);
}
function bakeCrayon(b: BK, s: Subject, pressure: number, crayon: boolean): void {
  const sc = b.S / 100;
  const [lc, lg] = layer(b, 0);
  lg.lineCap = 'round';
  s.fills.forEach((f, fi) => {
    const r = mulberry(fi * 31 + (crayon ? 1 : 2));
    const pts = mapPts(b, f.pts);
    const small = f.pts.length > 10;
    const dirs = crayon ? [0.6 + r() * 0.4] : [0.5 + r() * 0.3, -0.9 - r() * 0.3];
    dirs.forEach((ang, di) => {
      const gap = (crayon ? 3.2 : 1.25) * sc * (small ? 0.6 : 1);
      const rows = spans(pts, ang, gap);
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      for (const [a, bb] of rows) {
        const e0 = (r() - 0.4) * gap * 1.2;
        const e1 = (r() - 0.4) * gap * 1.2;
        lg.strokeStyle = shade(f.color, (r() - 0.5) * 0.18);
        lg.lineWidth = crayon ? gap * 1.9 : (0.75 + r() * 0.35) * sc;
        lg.globalAlpha = crayon ? 0.42 + 0.5 * r() : 0.55 + 0.35 * r() - di * 0.1;
        lg.beginPath();
        lg.moveTo(a[0] - ca * e0, a[1] - sa * e0);
        const bend = (r() - 0.5) * gap;
        lg.quadraticCurveTo((a[0] + bb[0]) / 2 - sa * bend, (a[1] + bb[1]) / 2 + ca * bend, bb[0] + ca * e1, bb[1] + sa * e1);
        lg.stroke();
      }
    });
  });
  lg.globalAlpha = 1;
  // 테두리 — 짙은 크레파스 / 색연필
  const col = '#3a3150';
  lg.strokeStyle = col;
  s.lines.forEach((l, i) => {
    const hp = handPath(mapPts(b, l.pts), l.closed, 300 + i, 0.5 * sc, 0.6 * sc, sc);
    pencilStroke(lg, hp, (crayon ? 2.6 : 1.3) * sc, sc, i);
  });
  lg.fillStyle = col;
  s.dots.forEach((dt) => {
    const c = X(b, dt.c);
    lg.beginPath();
    lg.arc(c[0], c[1], dt.r * b.S, 0, TAU);
    lg.fill();
  });
  // 종이 이: 누르는 힘이 셀수록 골짜기까지 색이 들어감
  const th = crayon ? 0.55 - pressure * 0.55 : 0.7 - pressure * 0.4;
  toothMask(lc, th, crayon ? 0.05 : 0.12, (crayon ? 1.05 : 0.6) * b.d, crayon ? 1 : 0.55 + pressure * 0.45, crayon);
  blit(b.g, lc, 1);
}

/* ═════════════════ i331 점묘 — 가중 보로노이 (로이드) ═════════════════ */

interface Stip { R: number; dens: Float32Array; snaps: Float32Array[]; cur: Float32Array; n: number }
function stipInit(s: Subject, N: number): Stip {
  const R = 150;
  const c = mk(R, R);
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, R, R);
  const lc = mk(R, R);
  const lg = lc.getContext('2d')!;
  for (const f of s.fills) {
    const v = Math.round(255 * (1 - f.tone * 0.86));
    lg.fillStyle = `rgb(${v},${v},${v})`;
    polyPath(lg, f.pts.map((p): P => [p[0] * R, p[1] * R]));
    lg.fill();
  }
  lg.globalCompositeOperation = 'source-atop';
  const gr = lg.createLinearGradient(0, 0, R, R);
  gr.addColorStop(0, 'rgba(255,255,255,0.3)');
  gr.addColorStop(1, 'rgba(0,0,0,0.25)');
  lg.fillStyle = gr;
  lg.fillRect(0, 0, R, R);
  g.drawImage(lc, 0, 0);
  g.strokeStyle = '#000';
  g.lineWidth = 1.3;
  g.lineJoin = 'round';
  for (const l of s.lines) {
    linePath(g, l.pts.map((p): P => [p[0] * R, p[1] * R]), l.closed);
    g.stroke();
  }
  g.fillStyle = '#000';
  for (const dt of s.dots) {
    g.beginPath();
    g.arc(dt.c[0] * R, dt.c[1] * R, dt.r * R, 0, TAU);
    g.fill();
  }
  const px = g.getImageData(0, 0, R, R).data;
  const dens = new Float32Array(R * R);
  for (let i = 0; i < R * R; i++) {
    const l = px[i * 4]! / 255;
    dens[i] = Math.pow(Math.max(0, 1 - l - 0.03), 1.25);
  }
  // 처음: 밀도대로 막 뿌림 (뭉치고 빈 곳 많음)
  const r = mulberry(N + 17);
  const cur = new Float32Array(N * 2);
  let k = 0;
  let guard = 0;
  while (k < N && guard++ < N * 400) {
    const x = r() * R;
    const y = r() * R;
    const d = dens[Math.floor(y) * R + Math.floor(x)]!;
    if (r() < d) {
      cur[k * 2] = x;
      cur[k * 2 + 1] = y;
      k++;
    }
  }
  const st: Stip = { R, dens, snaps: [cur.slice(0, k * 2)], cur: cur.slice(0, k * 2), n: k };
  return st;
}
function stipStep(st: Stip): void {
  const { R, dens, n } = st;
  const pts = st.cur;
  const Gn = Math.max(4, Math.ceil(Math.sqrt(n) * 0.9));
  const cs = R / Gn;
  const head = new Int32Array(Gn * Gn).fill(-1);
  const next = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const cx = Math.min(Gn - 1, Math.floor(pts[i * 2]! / cs));
    const cy = Math.min(Gn - 1, Math.floor(pts[i * 2 + 1]! / cs));
    next[i] = head[cy * Gn + cx]!;
    head[cy * Gn + cx] = i;
  }
  const sx = new Float64Array(n);
  const sy = new Float64Array(n);
  const sw = new Float64Array(n);
  for (let y = 0; y < R; y++)
    for (let x = 0; x < R; x++) {
      const w = dens[y * R + x]!;
      if (w < 0.004) continue;
      const px = x + 0.5;
      const py = y + 0.5;
      const cx = Math.floor(px / cs);
      const cy = Math.floor(py / cs);
      let best = -1;
      let bd = Infinity;
      for (let ring = 0; ring < Gn; ring++) {
        for (let j = cy - ring; j <= cy + ring; j++) {
          if (j < 0 || j >= Gn) continue;
          for (let i = cx - ring; i <= cx + ring; i++) {
            if (i < 0 || i >= Gn) continue;
            if (ring > 0 && i !== cx - ring && i !== cx + ring && j !== cy - ring && j !== cy + ring) continue;
            for (let q = head[j * Gn + i]!; q >= 0; q = next[q]!) {
              const dx = pts[q * 2]! - px;
              const dy = pts[q * 2 + 1]! - py;
              const dd = dx * dx + dy * dy;
              if (dd < bd) {
                bd = dd;
                best = q;
              }
            }
          }
        }
        if (best >= 0 && Math.sqrt(bd) < ring * cs) break;
      }
      if (best < 0) continue;
      sx[best] = sx[best]! + px * w;
      sy[best] = sy[best]! + py * w;
      sw[best] = sw[best]! + w;
    }
  const nx = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    if (sw[i]! > 0) {
      nx[i * 2] = sx[i]! / sw[i]!;
      nx[i * 2 + 1] = sy[i]! / sw[i]!;
    } else {
      nx[i * 2] = pts[i * 2]!;
      nx[i * 2 + 1] = pts[i * 2 + 1]!;
    }
  }
  st.cur = nx;
  st.snaps.push(nx);
}

/* ═════════════════ 공통 조절 ═════════════════ */

const pickCtl = (on: (v: number) => void): Control => ({ type: 'range', label: '주제 (0 = 돌아가며 · 1 정육면체 · 2 원그래프 · 3 세모 · 4 숫자 7)', min: 0, max: 4, step: 1, value: 0, on });
const splitCtl = (on: (v: boolean) => void): Control => ({ type: 'toggle', label: '왼쪽에 비교 그림 나란히', value: true, on });

/* ═════════════════════════════ 견본 ═════════════════════════════ */

export const DEMOS: DemoMap = {
  /* ───────── i323 선 들끓기 ───────── */
  i323: {
    kind: '2d',
    caption: '왼쪽 한 장 그대로 · 오른쪽 살짝 다르게 그린 3장을 10fps 로 번갈아 — 선이 살아서 꿈틀거려요',
    make() {
      const bk = new Bakery();
      let boil = true;
      let frames = 3;
      let fps = 10;
      let jit = 1.2;
      let pick = 0;
      let split = true;
      let ver = 0;
      return {
        draw(g, w, h, t) {
          const { i, a } = cyc(t, 4, pick);
          const s = SUBJ[i]!;
          const st = stage(g, w, h, split, '한 장 그대로', `${fps}fps 번갈아`, '#e8590c');
          const fr = boil ? Math.floor(t * fps) % frames : 0;
          const get = (f: number, S: number): HTMLCanvasElement => bk.get(`b${i}-${f}-${ver}`, S, st.d, (b) => bakeBoilFrame(b, s, f, jit));
          if (st.L) put(g, get(0, st.L.S), st.L, a, 'multiply');
          put(g, get(fr, st.R.S), st.R, a, 'multiply');
          // 필름 칸 — 지금 보이는 장
          const u = st.u;
          const R = st.R;
          const bw = 9 * u;
          const x0 = R.x + R.w - 6 * u - frames * (bw + 2.5 * u);
          const y0 = R.y + 5 * u;
          for (let k = 0; k < frames; k++) {
            const x = x0 + k * (bw + 2.5 * u);
            g.fillStyle = k === fr ? '#e8590c' : 'rgba(60,50,40,0.18)';
            g.beginPath();
            g.roundRect(x, y0, bw, 9 * u, 2 * u);
            g.fill();
            g.fillStyle = k === fr ? '#fff' : 'rgba(60,50,40,0.55)';
            g.font = `700 ${6.5 * u}px ${F}`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText(String(k + 1), x + bw / 2, y0 + 4.8 * u);
          }
          g.textAlign = 'left';
        },
        controls: [
          { type: 'toggle', label: '들끓기 켜기', value: true, on: (v) => (boil = v) },
          { type: 'range', label: '장 수', min: 2, max: 4, step: 1, value: 3, on: (v) => (frames = v) },
          { type: 'range', label: '바꾸는 빠르기 (fps)', min: 4, max: 24, step: 1, value: 10, on: (v) => (fps = v) },
          { type: 'range', label: '떨림 세기', min: 0.3, max: 3, step: 0.1, value: 1.2, on: (v) => { jit = v; ver++; bk.clear(); } },
          pickCtl((v) => (pick = v)),
          splitCtl((v) => (split = v)),
        ],
        dispose() {
          bk.clear();
        },
      };
    },
  },

  /* ───────── i324 스케치 선 ───────── */
  i324: {
    kind: '2d',
    caption: '돋보기로 모서리를 보면 — 왼쪽은 딱 맞게 끝나고, 오른쪽 연필 선은 모서리를 넘겨 두 번 겹쳐 그었어요',
    make() {
      const bk = new Bakery();
      let over = 1;
      let passes = 2;
      let jit = 0.8;
      let lens = true;
      let pick = 0;
      let split = true;
      let ver = 0;
      const corners = (s: Subject): P[] => {
        const o: P[] = [];
        for (const l of s.lines) if (l.pts.length <= 9) for (const p of l.pts) o.push(p);
        if (o.length === 0) o.push([0.5, 0.17], [0.85, 0.52], [0.5, 0.52]);
        return o;
      };
      const bakeSketch = (b: BK, s: Subject): void => {
        const sc = b.S / 100;
        // 연한 보조선 (구도 잡기)
        const g = b.g;
        g.save();
        g.strokeStyle = 'rgba(90,90,120,0.22)';
        g.lineWidth = 0.45 * sc;
        const r = mulberry(4);
        for (const l of s.lines.flatMap(explode)) {
          if (l.pts.length !== 2) continue;
          const [p, q] = mapPts(b, l.pts) as [P, P];
          const dx = q[0] - p[0];
          const dy = q[1] - p[1];
          const e0 = 0.12 + r() * 0.2;
          const e1 = 0.12 + r() * 0.2;
          g.beginPath();
          g.moveTo(p[0] - dx * e0, p[1] - dy * e0);
          g.lineTo(q[0] + dx * e1, q[1] + dy * e1);
          g.stroke();
        }
        if (s === PIE) {
          const c = X(b, [0.5, 0.52]);
          g.beginPath();
          g.moveTo(c[0] - 0.45 * b.S, c[1]);
          g.lineTo(c[0] + 0.45 * b.S, c[1]);
          g.moveTo(c[0], c[1] - 0.45 * b.S);
          g.lineTo(c[0], c[1] + 0.42 * b.S);
          g.stroke();
        }
        g.restore();
        bakePencil(b, s, { seed: 3, jit, over: over * 3.6, passes, w: 1.05, col: '#2d2b36', grain: 0.45, explodeAll: true });
      };
      return {
        draw(g, w, h, t) {
          const { i, tc, a } = cyc(t, 6, pick);
          const s = SUBJ[i]!;
          const st = stage(g, w, h, split, '반듯한 원본', '스케치 선', '#5c7cfa');
          const cL = st.L ? bk.get(`c${i}`, st.L.S, st.d, (b) => bakeClean(b, s, 'line')) : null;
          const cR = bk.get(`s${i}-${ver}`, st.R.S, st.d, (b) => bakeSketch(b, s));
          const ZB = Math.min(6, st.d * 2.6);
          if (st.L && cL) put(g, cL, st.L, a);
          put(g, cR, st.R, a, 'multiply');
          if (!lens) return;
          // 돋보기: 모서리를 차례로
          const cs = corners(s);
          const seg = 1.4;
          const k = Math.floor(tc / seg);
          const f = smooth(0, 0.45, tc / seg - k);
          const p0 = cs[k % cs.length]!;
          const p1 = cs[(k + 1) % cs.length]!;
          const fp: P = [lerp(p0[0], p1[0], f), lerp(p0[1], p1[1], f)];
          const lensOn = (p: Panel, c: HTMLCanvasElement, paper: boolean): void => {
            const u = st.u;
            const lr = Math.min(p.w, p.h) * 0.2;
            const fx = p.sx + fp[0] * p.S;
            const fy = p.sy + fp[1] * p.S;
            const lx = Math.min(p.x + p.w - lr - 4 * u, Math.max(p.x + lr + 4 * u, fx + lr * 0.9));
            const ly = Math.min(p.y + p.h - lr - 4 * u, Math.max(p.y + lr + 16 * u, fy - lr * 0.9));
            const Z = 2.6;
            g.save();
            g.globalAlpha = a;
            g.beginPath();
            g.arc(lx, ly, lr, 0, TAU);
            g.clip();
            g.translate(lx, ly);
            g.scale(Z, Z);
            g.translate(-fx, -fy);
            if (paper) {
              const pt = pat(g, paperTile());
              pt.setTransform(new DOMMatrix().scale(0.62));
              g.fillStyle = pt;
            } else g.fillStyle = '#fbfbf9';
            g.fillRect(fx - lr, fy - lr, lr * 2, lr * 2);
            g.globalCompositeOperation = paper ? 'multiply' : 'source-over';
            const m = p.S * 0.12;
            g.drawImage(c, p.sx - m, p.sy - m, p.S + m * 2, p.S + m * 2);
            g.restore();
            g.save();
            g.globalAlpha = a;
            g.strokeStyle = 'rgba(40,40,60,0.35)';
            g.lineWidth = 1 * u;
            g.beginPath();
            g.arc(fx, fy, lr / Z, 0, TAU);
            g.stroke();
            g.strokeStyle = '#3b3f52';
            g.lineWidth = 3 * u;
            g.beginPath();
            g.arc(lx, ly, lr, 0, TAU);
            g.stroke();
            g.strokeStyle = 'rgba(255,255,255,0.5)';
            g.lineWidth = 1.2 * u;
            g.beginPath();
            g.arc(lx, ly, lr - 2.5 * u, -2.6, -1.4);
            g.stroke();
            g.restore();
          };
          if (st.L) lensOn(st.L, bk.get(`c${i}`, st.L.S, ZB, (b) => bakeClean(b, s, 'line')), false);
          lensOn(st.R, bk.get(`s${i}-${ver}`, st.R.S, ZB, (b) => bakeSketch(b, s)), true);
        },
        controls: [
          { type: 'range', label: '모서리 넘침', min: 0, max: 2.5, step: 0.1, value: 1, on: (v) => { over = v; ver++; } },
          { type: 'range', label: '겹쳐 긋기 (번)', min: 1, max: 3, step: 1, value: 2, on: (v) => { passes = v; ver++; } },
          { type: 'range', label: '손떨림', min: 0, max: 2.5, step: 0.1, value: 0.8, on: (v) => { jit = v; ver++; } },
          { type: 'toggle', label: '돋보기', value: true, on: (v) => (lens = v) },
          pickCtl((v) => (pick = v)),
          splitCtl((v) => (split = v)),
        ],
        dispose() {
          bk.clear();
        },
      };
    },
  },

  /* ───────── i325 연필 빗금 ───────── */
  i325: {
    kind: '2d',
    caption: '왼쪽 회색 명암 · 오른쪽 빗금 — 어두운 면일수록 방향을 바꾼 빗금이 한 겹씩 더 쌓여요',
    make() {
      const bk = new Bakery();
      let gapK = 1;
      let jit = 1;
      let cross = true;
      let pick = 0;
      let split = true;
      let ver = 0;
      return {
        draw(g, w, h, t) {
          const { i, tc, a } = cyc(t, 4.8, pick);
          const s = SUBJ[i]!;
          const st = stage(g, w, h, split, '회색 명암', '연필 빗금', '#495057');
          if (st.L) put(g, bk.get(`g${i}`, st.L.S, st.d, (b) => bakeClean(b, s, 'gray')), st.L, a);
          const S = st.R.S;
          let shown = 0;
          for (let k = 0; k < 4; k++) {
            const t0 = 0.35 + k * 0.5;
            const al = smooth(t0, t0 + 0.3, tc);
            if (al <= 0) continue;
            shown = k + 1;
            put(g, bk.get(`h${i}-${k}-${ver}`, S, st.d, (b) => bakeHatchLayer(b, s, k, gapK, jit, cross)), st.R, a * al, 'multiply');
          }
          put(g, bk.get(`o${i}-${ver}`, S, st.d, (b) => bakePencil(b, s, { seed: 2, jit: 0.6, over: 1.2, passes: 1, w: 1.5, col: '#26242e', grain: 0.4 })), st.R, a, 'multiply');
          // 겹 수 표시
          const u = st.u;
          const R = st.R;
          for (let k = 0; k < 4; k++) {
            const x = R.x + R.w - 6 * u - (4 - k) * 9.5 * u;
            const y = R.y + 5 * u;
            g.fillStyle = k < shown ? '#495057' : 'rgba(60,50,40,0.15)';
            g.fillRect(x, y, 8 * u, 9 * u);
            if (k < shown) {
              g.save();
              g.beginPath();
              g.rect(x, y, 8 * u, 9 * u);
              g.clip();
              g.strokeStyle = 'rgba(255,255,255,0.8)';
              g.lineWidth = 0.7 * u;
              for (let q = 0; q <= k; q++) {
                const an = HATCH_ANG[q]!;
                for (let z = -12; z <= 12; z += 3) {
                  const cx = x + 4 * u - Math.sin(an) * z * u;
                  const cy = y + 4.5 * u + Math.cos(an) * z * u;
                  g.beginPath();
                  g.moveTo(cx - Math.cos(an) * 10 * u, cy - Math.sin(an) * 10 * u);
                  g.lineTo(cx + Math.cos(an) * 10 * u, cy + Math.sin(an) * 10 * u);
                  g.stroke();
                }
              }
              g.restore();
            }
          }
          tag(g, `${shown}겹`, R.x + R.w - 6 * u - 4 * 9.5 * u - 3 * u, R.y + 12.2 * u, u, 'rgba(40,36,50,0.8)');
        },
        controls: [
          { type: 'range', label: '빗금 간격 (작을수록 촘촘)', min: 0.6, max: 1.8, step: 0.05, value: 1, on: (v) => { gapK = v; ver++; } },
          { type: 'range', label: '손떨림', min: 0, max: 3, step: 0.1, value: 1, on: (v) => { jit = v; ver++; } },
          { type: 'toggle', label: '교차 빗금 (끄면 한 방향만 촘촘히)', value: true, on: (v) => { cross = v; ver++; } },
          pickCtl((v) => (pick = v)),
          splitCtl((v) => (split = v)),
        ],
        dispose() {
          bk.clear();
        },
      };
    },
  },

  /* ───────── i326 지그재그 칠하기 ───────── */
  i326: {
    kind: '2d',
    caption: '왼쪽 반듯하게 채운 면 · 오른쪽 색연필로 왔다 갔다 낙서하듯 칠해요 — 끝이 테두리를 살짝 삐져나가요',
    make() {
      const bk = new Bakery();
      let gapK = 1;
      let over = 1;
      let pick = 0;
      let split = true;
      let seed = 1;
      const cache = new Map<string, Poly[]>();
      const polys = (s: Subject, i: number, S: number, ox: number, oy: number): Poly[] => {
        const key = `${i}-${seed}-${gapK}-${over}`;
        let unit = cache.get(key);
        if (!unit) {
          unit = s.fills.map((f, fi) => mkPoly(zigzag(f, seed * 97 + fi * 13 + i * 5, 0.022 * gapK, over), f.color));
          cache.set(key, unit);
        }
        return unit.map((pl) => mkPoly(pl.pts.map((p): P => [ox + p[0] * S, oy + p[1] * S]), pl.color));
      };
      return {
        draw(g, w, h, t) {
          const period = 5;
          const { i, tc, a } = cyc(t, period, pick);
          const s = SUBJ[i]!;
          const st = stage(g, w, h, split, '반듯한 원본', '지그재그 칠', '#f76707');
          if (st.L) put(g, bk.get(`c${i}`, st.L.S, st.d, (b) => bakeClean(b, s, 'color')), st.L, a);
          const R = st.R;
          const pls = polys(s, i, R.S, R.sx, R.sy);
          const total = pls.reduce((q, p) => q + p.L, 0);
          let len = total * smooth(0.25, 3.2, tc);
          g.save();
          g.globalAlpha = a * 0.92;
          g.globalCompositeOperation = 'multiply';
          g.lineWidth = R.S * 0.013;
          g.lineJoin = 'round';
          g.lineCap = 'round';
          for (const pl of pls) {
            const cp = pat(g, colorTooth(pl.color));
            cp.setTransform(new DOMMatrix().scale(0.7));
            g.strokeStyle = cp;
            drawPolyUpTo(g, pl, len);
            len -= pl.L;
            if (len <= 0) break;
          }
          g.restore();
          put(g, bk.get(`o${i}`, R.S, st.d, (b) => bakePencil(b, s, { seed: 4, jit: 0.7, over: 1, passes: 1, w: 1.6, col: '#2a2733', grain: 0.4 })), R, a, 'multiply');
        },
        controls: [
          { type: 'range', label: '줄 간격', min: 0.6, max: 2, step: 0.05, value: 1, on: (v) => (gapK = v) },
          { type: 'range', label: '삐져나감', min: 0, max: 2, step: 0.1, value: 1, on: (v) => (over = v) },
          { type: 'button', label: '다시 칠하기', on: () => { seed++; cache.clear(); } },
          pickCtl((v) => (pick = v)),
          splitCtl((v) => (split = v)),
        ],
        dispose() {
          bk.clear();
          cache.clear();
        },
      };
    },
  },

  /* ───────── i327 수채화 ───────── */
  i327: {
    kind: '2d',
    caption: '왼쪽 단색 칠 · 오른쪽 수채 — 젖은 물감이 번지다 마르면서 가장자리가 짙어지고 겹친 곳이 진해져요',
    make() {
      const bk = new Bakery();
      let spread = 1;
      let layers = 26;
      let edge = true;
      let seed = 1;
      let pick = 0;
      let split = true;
      let ver = 0;
      return {
        draw(g, w, h, t) {
          const { i, tc, a } = cyc(t, 5, pick);
          const s = SUBJ[i]!;
          const st = stage(g, w, h, split, '반듯한 원본', '수채', '#1c7ed6');
          if (st.L) put(g, bk.get(`c${i}`, st.L.S, st.d, (b) => bakeClean(b, s, 'color')), st.L, a);
          const R = st.R;
          const c = bk.get(`w${i}-${seed}-${ver}`, R.S, st.d, (b) => bakeWater(b, s, seed, spread, layers, edge));
          // 젖음 → 마름: 흐림이 걷히고 색이 자리 잡음
          const wet = 1 - smooth(0.3, 1.9, tc);
          g.save();
          if (wet > 0.01) g.filter = `blur(${wet * 3.5 * st.u}px)`;
          put(g, c, R, a * (0.55 + 0.45 * (1 - wet)), 'multiply');
          g.restore();
          if (wet > 0.02) tag(g, '마르는 중…', R.x + R.w - 6 * st.u, R.y + 12 * st.u, st.u, `rgba(28,126,214,${0.9 * wet + 0.1})`);
        },
        controls: [
          { type: 'range', label: '번짐 (가장자리 흔들림)', min: 0.3, max: 2.2, step: 0.05, value: 1, on: (v) => { spread = v; ver++; } },
          { type: 'range', label: '물감 겹 수', min: 8, max: 44, step: 1, value: 26, on: (v) => { layers = v; ver++; } },
          { type: 'toggle', label: '가장자리 짙게', value: true, on: (v) => { edge = v; ver++; } },
          { type: 'button', label: '다시 칠하기', on: () => { seed++; } },
          pickCtl((v) => (pick = v)),
          splitCtl((v) => (split = v)),
        ],
        dispose() {
          bk.clear();
        },
      };
    },
  },

  /* ───────── i328 먹 붓 ───────── */
  i328: {
    kind: '2d',
    caption: '왼쪽 같은 굵기 선 · 오른쪽 먹 붓 — 꾹 눌러 굵게 시작해 가늘게 빠지고, 마른 붓끝은 결이 갈라져요',
    make() {
      const bk = new Bakery();
      let press = 0.85;
      let dry = 0.55;
      let bleed = 0.5;
      let pick = 0;
      let split = true;
      let ver = 0;
      let maskC: HTMLCanvasElement | null = null;
      const bakeBrush = (b: BK, s: Subject): void => {
        const W = b.S * 0.062;
        s.brush.forEach((pth, k) => {
          brushStroke(b, mapPts(b, pth.pts), pth.closed, W * (pth.bw ?? 1), { press, dry, bleed, seed: 11 + k * 17 });
        });
        if (s === TRI) {
          s.dots.forEach((dt, k) => {
            const c = X(b, dt.c);
            const r = dt.r * b.S;
            brushStroke(b, [[c[0] - r * 0.2, c[1] - r * 0.9], [c[0] + r * 0.1, c[1] + r * 0.8]], false, r * 1.9, { press: 0.9, dry: dry * 0.3, bleed, seed: 70 + k });
          });
        }
      };
      return {
        draw(g, w, h, t) {
          const period = 5;
          const { i, tc, a } = cyc(t, period, pick);
          const s = SUBJ[i]!;
          const st = stage(g, w, h, split, '같은 굵기 선', '먹 붓', '#212529', 'hanji');
          if (st.L) put(g, bk.get(`c${i}`, st.L.S, st.d, (b) => bakeClean(b, s, 'line')), st.L, a);
          const R = st.R;
          const c = bk.get(`k${i}-${ver}`, R.S, st.d, (b) => bakeBrush(b, s));
          // 붓이 지나간 만큼만 보이게 (굵은 길 가면)
          const lens = s.brush.map((p) => {
            let L = 0;
            for (let q = 1; q < p.pts.length; q++) L += Math.hypot(p.pts[q]![0] - p.pts[q - 1]![0], p.pts[q]![1] - p.pts[q - 1]![1]);
            if (p.closed) L += Math.hypot(p.pts[0]![0] - p.pts[p.pts.length - 1]![0], p.pts[0]![1] - p.pts[p.pts.length - 1]![1]);
            return L;
          });
          const total = lens.reduce((q, v) => q + v, 0) + (s === TRI ? 0.15 : 0);
          let prog = total * smooth(0.2, 2.8, tc);
          if (!maskC) maskC = mk(1, 1);
          if (maskC.width !== c.width || maskC.height !== c.height) {
            maskC.width = c.width;
            maskC.height = c.height;
          }
          const mg = maskC.getContext('2d')!;
          mg.setTransform(1, 0, 0, 1, 0, 0);
          reset(mg);
          mg.clearRect(0, 0, maskC.width, maskC.height);
          const sc = c.width / (R.S * 1.24);
          const m = R.S * 0.12;
          mg.setTransform(sc, 0, 0, sc, 0, 0);
          mg.strokeStyle = '#000';
          mg.lineWidth = R.S * 0.2;
          const toB = (p: P): P => [m + p[0] * R.S, m + p[1] * R.S];
          s.brush.forEach((p, k) => {
            if (prog <= 0) return;
            const pts = p.closed ? [...p.pts, p.pts[0]!, p.pts[1]!] : p.pts;
            const pl = mkPoly(pts.map(toB), '');
            const want = Math.min(prog, lens[k]!) * R.S;
            drawPolyUpTo(mg, pl, prog >= lens[k]! ? pl.L + R.S : want);
            prog -= lens[k]!;
          });
          if (prog > 0) {
            mg.fillStyle = '#000';
            for (const dt of s.dots) {
              const q = toB(dt.c);
              mg.beginPath();
              mg.arc(q[0], q[1], R.S * 0.08, 0, TAU);
              mg.fill();
            }
          }
          mg.setTransform(1, 0, 0, 1, 0, 0);
          mg.globalCompositeOperation = 'source-in';
          mg.drawImage(c, 0, 0);
          put(g, maskC, R, a, 'multiply');
          // 낙관
          const u = st.u;
          const sx = R.x + R.w - 15 * u;
          const sy = R.y + R.h - 15 * u;
          g.save();
          g.globalAlpha = 0.85 * a;
          g.fillStyle = '#c92a2a';
          g.beginPath();
          g.roundRect(sx, sy, 10 * u, 10 * u, 1.5 * u);
          g.fill();
          g.fillStyle = '#f8e9d8';
          g.font = `800 ${6.6 * u}px ${F}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText('수', sx + 5 * u, sy + 5.4 * u);
          g.restore();
          g.textAlign = 'left';
        },
        controls: [
          { type: 'range', label: '붓 압력 차이', min: 0, max: 1, step: 0.05, value: 0.85, on: (v) => { press = v; ver++; } },
          { type: 'range', label: '갈필 (마른 붓)', min: 0, max: 1, step: 0.05, value: 0.55, on: (v) => { dry = v; ver++; } },
          { type: 'range', label: '먹 번짐', min: 0, max: 1, step: 0.05, value: 0.5, on: (v) => { bleed = v; ver++; } },
          pickCtl((v) => (pick = v)),
          splitCtl((v) => (split = v)),
        ],
        dispose() {
          bk.clear();
          maskC = null;
        },
      };
    },
  },

  /* ───────── i329 마커 · 형광펜 ───────── */
  i329: {
    kind: '2d',
    caption: '왼쪽 그냥 덮어 칠하면 글씨 · 선이 가려져요 — 오른쪽 곱하기 혼합은 겹친 줄이 진해지고 아래 글씨가 비쳐요',
    make() {
      let multiply = true;
      let ink = 0.85;
      let gapK = 1;
      let pick = 0;
      let split = true;
      interface MS { a: P; b: P; color: string; w: number; clip: P[] }
      const cache = new Map<string, MS[]>();
      const strokesOf = (s: Subject, i: number): MS[] => {
        const key = `${i}-${gapK}`;
        let o = cache.get(key);
        if (o) return o;
        o = [];
        const r = mulberry(i * 7 + 1);
        const w = 0.07;
        s.fills.forEach((f, fi) => {
          // 손으로 테두리 따라 칠한 경계 (살짝 넘침 · 흔들림)
          const c = centroid(f.pts);
          const small = f.pts.length > 10;
          const ex = f.pts.map((q): P => [c[0] + (q[0] - c[0]) * (small ? 1.15 : 1.035), c[1] + (q[1] - c[1]) * (small ? 1.15 : 1.035)]);
          const clip = handPath(ex, true, i * 31 + fi * 7, 0.007, 0, 0.01, 1).p;
          const ang = 0.35 + r() * 0.3;
          const rows = spans(f.pts, ang, w * 0.78 * gapK * (f.pts.length > 10 ? 0.6 : 1));
          const ca = Math.cos(ang);
          const sa = Math.sin(ang);
          for (const [a, b] of rows) {
            const e0 = (0.15 + r() * 0.5) * w;
            const e1 = (0.15 + r() * 0.5) * w;
            o.push({ a: [a[0] - ca * e0, a[1] - sa * e0], b: [b[0] + ca * e1, b[1] + sa * e1], color: f.color, w: small ? w * 0.6 : w, clip });
          }
        });
        cache.set(key, o);
        return o;
      };
      const panel = (g: G, p: Panel, s: Subject, ms: MS[], tc: number, mul: boolean, u: number, a: number): void => {
        const S = p.S;
        const T = (q: P): P => [p.sx + q[0] * S, p.sy + q[1] * S];
        // 인쇄된 선 · 글씨
        g.save();
        g.globalAlpha = a;
        g.strokeStyle = INK;
        g.lineWidth = S * 0.012;
        for (const l of s.lines) {
          linePath(g, l.pts.map(T), l.closed);
          g.stroke();
        }
        g.fillStyle = INK;
        for (const dt of s.dots) {
          const c = T(dt.c);
          g.beginPath();
          g.arc(c[0], c[1], dt.r * S, 0, TAU);
          g.fill();
        }
        const fs = Math.max(8 * u, S * 0.11);
        g.font = `700 ${fs}px ${F}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        const ty = p.sy + S + fs * 0.75;
        g.fillText(s.name, p.x + p.w / 2, ty);
        const tw = g.measureText(s.name).width;
        g.textAlign = 'left';
        // 마커 줄 — 하나씩 쓱
        g.globalCompositeOperation = mul ? 'multiply' : 'source-over';
        g.lineCap = 'butt';
        const inkA = mul ? ink : 1;
        const n = ms.length;
        ms.forEach((m, k) => {
          const t0 = 0.3 + (k / n) * 2.3;
          const f = clamp01((tc - t0) / 0.1);
          if (f <= 0) return;
          const A = T(m.a);
          const B0 = T(m.b);
          const B: P = [lerp(A[0], B0[0], f), lerp(A[1], B0[1], f)];
          g.save();
          linePath(g, m.clip.map(T), true);
          g.clip();
          g.globalAlpha = a * inkA;
          g.strokeStyle = m.color;
          g.lineWidth = m.w * S;
          g.beginPath();
          g.moveTo(A[0], A[1]);
          g.lineTo(B[0], B[1]);
          g.stroke();
          // 펜을 댄 곳에 잉크가 살짝 고임
          if (mul) {
            g.globalAlpha = a * ink * 0.18;
            g.fillStyle = m.color;
            g.beginPath();
            g.ellipse(A[0], A[1], m.w * S * 0.22, m.w * S * 0.48, Math.atan2(B0[1] - A[1], B0[0] - A[0]), 0, TAU);
            g.fill();
          }
          g.restore();
        });
        // 형광펜 두 줄 (노랑 · 분홍이 겹침)
        const hl = (x0: number, x1: number, col: string, t0: number, dy: number): void => {
          const f = clamp01((tc - t0) / 0.35);
          if (f <= 0) return;
          g.globalAlpha = a * inkA * 0.9;
          g.strokeStyle = col;
          g.lineCap = 'butt';
          g.lineWidth = fs * 1.05;
          g.beginPath();
          g.moveTo(x0, ty + dy);
          g.lineTo(lerp(x0, x1, f), ty + dy - fs * 0.06 * f);
          g.stroke();
        };
        const cx = p.x + p.w / 2;
        hl(cx - tw * 0.62, cx + tw * 0.4, '#ffe94d', 2.7, 0);
        hl(cx - tw * 0.05, cx + tw * 0.62, '#ff8cc6', 3.1, fs * 0.08);
        g.restore();
      };
      return {
        draw(g, w, h, t) {
          const { i, tc, a } = cyc(t, 5, pick);
          const s = SUBJ[i]!;
          const st = stage(g, w, h, split, '덮어 칠하기', multiply ? '곱하기 혼합' : '곱하기 끔', '#d6336c', 'white', 20);
          const ms = strokesOf(s, i);
          if (st.L) panel(g, st.L, s, ms, tc, false, st.u, a);
          panel(g, st.R, s, ms, tc, multiply, st.u, a);
        },
        controls: [
          { type: 'toggle', label: '곱하기 혼합 (오른쪽)', value: true, on: (v) => (multiply = v) },
          { type: 'range', label: '잉크 진하기', min: 0.3, max: 1, step: 0.05, value: 0.85, on: (v) => (ink = v) },
          { type: 'range', label: '줄 간격 (작을수록 많이 겹침)', min: 0.5, max: 1.3, step: 0.05, value: 1, on: (v) => { gapK = v; cache.clear(); } },
          pickCtl((v) => (pick = v)),
          splitCtl((v) => (split = v)),
        ],
        dispose() {
          cache.clear();
        },
      };
    },
  },

  /* ───────── i330 색연필 · 크레파스 결 ───────── */
  i330: {
    kind: '2d',
    caption: '왼쪽 꽉 찬 칠 · 오른쪽 크레파스 — 종이 결의 골짜기엔 색이 안 묻어 하얗게 비고, 세게 누를수록 메워져요',
    make() {
      const bk = new Bakery();
      let crayon = true;
      let fixP = 0;
      let pick = 0;
      let split = true;
      const PR = [0.25, 0.55, 0.9];
      return {
        draw(g, w, h, t) {
          const period = 6;
          const { i, tc, a } = cyc(t, period, pick);
          const s = SUBJ[i]!;
          const st = stage(g, w, h, split, '반듯한 원본', crayon ? '크레파스' : '색연필', '#f08c00');
          if (st.L) put(g, bk.get(`c${i}`, st.L.S, st.d, (b) => bakeClean(b, s, 'color')), st.L, a);
          const R = st.R;
          // 누르는 힘: 약 → 중 → 강 (겹쳐 바뀜)
          let lv = 0;
          let mixK = 0;
          if (fixP > 0) lv = fixP - 1;
          else {
            const x = clamp01((tc - 0.3) / (period - 0.9)) * 3;
            lv = Math.min(2, Math.floor(x));
            mixK = lv < 2 ? smooth(0.75, 1, x - lv) : 0;
          }
          const get = (k: number): HTMLCanvasElement => bk.get(`y${i}-${k}-${crayon ? 1 : 0}`, R.S, st.d, (b) => bakeCrayon(b, s, PR[k]!, crayon));
          put(g, get(lv), R, a * (1 - mixK), 'multiply');
          if (mixK > 0) put(g, get(lv + 1), R, a * mixK, 'multiply');
          // 힘 눈금
          const u = st.u;
          const cur = lv + mixK;
          tag(g, '힘', R.x + R.w - 33 * u, R.y + 12.2 * u, u);
          for (let k = 0; k < 3; k++) {
            const on = cur >= k - 0.01;
            g.fillStyle = on ? '#f08c00' : 'rgba(60,50,40,0.18)';
            g.beginPath();
            g.arc(R.x + R.w - 27 * u + k * 9 * u, R.y + 10 * u, (2.2 + k * 0.9) * u, 0, TAU);
            g.fill();
          }
        },
        controls: [
          { type: 'toggle', label: '크레파스 (끄면 색연필)', value: true, on: (v) => (crayon = v) },
          { type: 'range', label: '누르는 힘 (0 = 약→강 자동 · 1 약 · 2 중 · 3 강)', min: 0, max: 3, step: 1, value: 0, on: (v) => (fixP = v) },
          pickCtl((v) => (pick = v)),
          splitCtl((v) => (split = v)),
        ],
        dispose() {
          bk.clear();
        },
      };
    },
  },

  /* ───────── i331 점묘 ───────── */
  i331: {
    kind: '2d',
    caption: '왼쪽 회색 명암 · 오른쪽 점만으로 — 막 뿌린 점이 가중 보로노이 이완으로 고르게 퍼져 어두운 곳일수록 촘촘해요',
    make() {
      let N = 1500;
      let dotK = 1;
      let pick = 0;
      let split = true;
      const bk = new Bakery();
      const states = new Map<string, Stip>();
      const MAXIT = 36;
      const stateOf = (i: number): Stip => {
        const k = `${i}-${N}`;
        let st = states.get(k);
        if (!st) {
          st = stipInit(SUBJ[i]!, N);
          states.set(k, st);
        }
        return st;
      };
      return {
        draw(g, w, h, t) {
          const period = 6;
          const { i, tc, a } = cyc(t, period, pick);
          const s = SUBJ[i]!;
          const sp = stateOf(i);
          if (sp.snaps.length <= MAXIT) stipStep(sp);
          else if (pick === 0) {
            const nx = stateOf((i + 1) % 4);
            if (nx.snaps.length <= MAXIT) stipStep(nx);
          }
          const st = stage(g, w, h, split, '회색 명암', '점묘', '#343a40');
          if (st.L) put(g, bk.get(`g${i}`, st.L.S, st.d, (b) => bakeClean(b, s, 'gray')), st.L, a);
          const R = st.R;
          const want = Math.max(0, Math.floor((tc - 0.5) * 14));
          const k = Math.min(want, sp.snaps.length - 1, MAXIT);
          const pts = sp.snaps[k]!;
          const sc = R.S / sp.R;
          const base = R.S * 0.0052 * dotK * Math.sqrt(1500 / N);
          g.save();
          g.globalAlpha = a * 0.92;
          g.fillStyle = '#1f1c24';
          g.beginPath();
          for (let q = 0; q < sp.n; q++) {
            const x = pts[q * 2]!;
            const y = pts[q * 2 + 1]!;
            const d = sp.dens[Math.min(sp.R - 1, Math.floor(y)) * sp.R + Math.min(sp.R - 1, Math.floor(x))]!;
            const rr = base * (0.8 + 0.35 * Math.sqrt(d)) * (0.85 + 0.3 * hash2(q, 3, 9));
            const X0 = R.sx + x * sc;
            const Y0 = R.sy + y * sc;
            g.moveTo(X0 + rr, Y0);
            g.arc(X0, Y0, rr, 0, TAU);
          }
          g.fill();
          g.restore();
          const u = st.u;
          tag(g, k === 0 ? '막 뿌림' : `이완 ${k}회`, R.x + R.w - 6 * u, R.y + 12.2 * u, u);
          tag(g, `점 ${sp.n}개`, R.x + R.w - 6 * u, R.y + R.h - 5 * u, u, 'rgba(40,36,50,0.5)');
        },
        controls: [
          { type: 'range', label: '점 개수', min: 500, max: 3500, step: 100, value: 1500, on: (v) => { N = v; states.clear(); } },
          { type: 'range', label: '점 크기', min: 0.5, max: 1.8, step: 0.05, value: 1, on: (v) => (dotK = v) },
          pickCtl((v) => (pick = v)),
          splitCtl((v) => (split = v)),
        ],
        dispose() {
          bk.clear();
          states.clear();
        },
      };
    },
  },
};

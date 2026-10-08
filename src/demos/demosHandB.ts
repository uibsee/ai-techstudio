import type { Control, DemoMap } from './types';

/**
 * 손그림 그림체 (2D) 뒤쪽 8개 견본 (i332 ~ i339) — 콜라주 · 칠판 분필 · 공책 낙서 · 만화 펜선 + 스크린톤 ·
 * 목판화 · 손글씨 흔들기 · 그려지는 애니 · 설계도.
 * 같은 주제(정육면체 · 원그래프 · 웃는 세모 · 숫자 7)를 그림체만 바꿔 보여 준다.
 * 종이 · 칠판 · 판 질감은 잡음으로 한 번만 구운 오프스크린 캔버스, 흔들림은 시드 고정 난수라 프레임마다 지글거리지 않는다.
 * 대부분 「가르는 선」으로 왼쪽 반듯한 원본 ↔ 오른쪽 손그림을 견준다. 좌표는 카드 280 × 175 기준(u 배).
 */

type G = CanvasRenderingContext2D;
type P = [number, number];
type Ink = string | CanvasPattern;
const F = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
const TAU = Math.PI * 2;

const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
const clamp01 = (x: number): number => clamp(x, 0, 1);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const smooth = (e0: number, e1: number, x: number): number => {
  const v = clamp01((x - e0) / (e1 - e0));
  return v * v * (3 - 2 * v);
};
const ease = (x: number): number => {
  const v = clamp01(x);
  return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
};

/* ───────────── 잡음 · 난수 ───────────── */

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
function fbm(x: number, y: number, s = 0): number {
  return vnoise(x, y, s) * 0.55 + vnoise(x * 2.1, y * 2.1, s + 7) * 0.3 + vnoise(x * 4.3, y * 4.3, s + 13) * 0.15;
}
/** 주기가 있는 값 잡음 (타일 무늬용) */
function pnoise2(x: number, y: number, Px: number, Py: number, s = 0): number {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const mx = (v: number): number => ((v % Px) + Px) % Px;
  const my = (v: number): number => ((v % Py) + Py) % Py;
  return lerp(
    lerp(hash2(mx(i), my(j), s), hash2(mx(i + 1), my(j), s), ux),
    lerp(hash2(mx(i), my(j + 1), s), hash2(mx(i + 1), my(j + 1), s), ux),
    uy,
  );
}
/** 1차원 부드러운 잡음 −1 ~ 1 */
function n1(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash2(i, seed, 77), hash2(i + 1, seed, 77), u) * 2 - 1;
}
function rng(seed: number): () => number {
  let s = Math.abs(Math.floor(seed * 9301 + 49297)) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/* ───────────── 캔버스 도구 ───────────── */

function mk(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}
const c2 = (c: HTMLCanvasElement): G => c.getContext('2d')!;
function reset(g: G): void {
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.lineWidth = 1;
  g.setLineDash([]);
  g.filter = 'none';
  g.shadowBlur = 0;
  g.shadowColor = 'transparent';
  g.lineCap = 'butt';
  g.lineJoin = 'miter';
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
}
interface Fit {
  u: number;
  ox: number;
  oy: number;
  s: number;
  w: number;
  h: number;
}
function fitOf(g: G, w: number, h: number): Fit {
  const m = g.getTransform();
  const u = Math.min(w / 280, h / 175);
  return { u, ox: (w - 280 * u) / 2, oy: (h - 175 * u) / 2, s: clamp(Math.hypot(m.a, m.b), 1, 2), w, h };
}
const enter = (g: G, f: Fit): void => {
  g.save();
  g.translate(f.ox, f.oy);
  g.scale(f.u, f.u);
};
const keyOf = (f: Fit, ...v: number[]): string => [f.w, f.h, f.s, ...v].map((x) => x.toFixed(3)).join('|');
/** 기준 좌표계 안에서 화면 전체 크기 그림(구운 캔버스)을 덮기 */
const fullImg = (g: G, f: Fit, c: HTMLCanvasElement): void => g.drawImage(c, -f.ox / f.u, -f.oy / f.u, f.w / f.u, f.h / f.u);

function bake(W: number, H: number, fn: (x: number, y: number, c: number[]) => void): HTMLCanvasElement {
  const cv = mk(W, H);
  const g = c2(cv);
  const im = g.createImageData(cv.width, cv.height);
  const d = im.data;
  const c = [0, 0, 0, 255];
  for (let y = 0; y < cv.height; y++) {
    for (let x = 0; x < cv.width; x++) {
      c[3] = 255;
      fn(x, y, c);
      const i = (y * cv.width + x) * 4;
      d[i] = c[0]!;
      d[i + 1] = c[1]!;
      d[i + 2] = c[2]!;
      d[i + 3] = c[3]!;
    }
  }
  g.putImageData(im, 0, 0);
  return cv;
}

let GRAIN: HTMLCanvasElement | null = null;
/** 종이 결 타일 (밝고 어두운 잔 얼룩, 이음새 없음) */
function grainTile(): HTMLCanvasElement {
  if (GRAIN) return GRAIN;
  GRAIN = bake(128, 128, (x, y, c) => {
    const n = pnoise2(x / 8, y / 8, 16, 16, 3);
    const m = pnoise2(x / 2, y / 2, 64, 64, 5);
    const v = hash2(x, y, 9);
    const l = n * 0.45 + m * 0.25 + v * 0.3;
    const on = l > 0.5;
    c[0] = c[1] = c[2] = on ? 255 : 30;
    c[3] = Math.abs(l - 0.5) * 2 * 110;
  });
  return GRAIN;
}
const PATS = new WeakMap<object, WeakMap<HTMLCanvasElement, CanvasPattern>>();
/** 캔버스 무늬 — sc 로 무늬 크기를 화면 화소에 맞춘다 (기준 좌표계에서 1/(u·dpr)) */
function patIn(g: G, cv: HTMLCanvasElement, sc: number): CanvasPattern {
  let m = PATS.get(g);
  if (!m) {
    m = new WeakMap();
    PATS.set(g, m);
  }
  let p = m.get(cv);
  if (!p) {
    p = g.createPattern(cv, 'repeat')!;
    m.set(cv, p);
  }
  p.setTransform(new DOMMatrix([sc, 0, 0, sc, 0, 0]));
  return p;
}

/** 종이 굽기 — 바탕색 · 얼룩 · 섬유 · 티 · 가장자리 어둡게 */
function bakePaper(f: Fit, rgb: [number, number, number], amt = 1, vig = 0.25, seed = 1): HTMLCanvasElement {
  const s = f.s;
  return bake(f.w * s, f.h * s, (x, y, c) => {
    const fx = x / s;
    const fy = y / s;
    const m = fbm(fx * 0.03, fy * 0.03, seed);
    const fib = vnoise(fx * 1.1, fy * 0.22, seed + 2);
    const sp = hash2(x, y, seed + 3);
    let v = 1 + amt * (0.06 * (m - 0.5) + 0.035 * (fib - 0.5) + (sp > 0.994 ? -0.06 : 0) + (sp < 0.004 ? 0.03 : 0));
    const dx = fx / f.w - 0.5;
    const dy = fy / f.h - 0.5;
    v *= 1 - vig * (dx * dx + dy * dy) * 1.4;
    c[0] = rgb[0] * v;
    c[1] = rgb[1] * v;
    c[2] = rgb[2] * v;
  });
}
/** 어두운 책상 위 종이 한 장 (그림자 포함) */
function bakeSheet(f: Fit, rgb: [number, number, number], inset: number): HTMLCanvasElement {
  const s = f.s;
  const desk = bake(f.w * s, f.h * s, (x, y, c) => {
    const fx = x / s;
    const fy = y / s;
    const m = fbm(fx * 0.02, fy * 0.2, 31);
    const v = 0.85 + 0.3 * m;
    c[0] = 44 * v;
    c[1] = 40 * v;
    c[2] = 46 * v;
  });
  const paper = bakePaper(f, rgb, 1, 0.12, 4);
  const g = c2(desk);
  g.scale(s, s);
  const r = { x: inset, y: inset, w: f.w - inset * 2, h: f.h - inset * 2 };
  g.save();
  g.filter = `blur(${(5 * s).toFixed(1)}px)`;
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillRect(r.x + 2, r.y + 4, r.w, r.h);
  g.restore();
  g.save();
  g.beginPath();
  g.rect(r.x, r.y, r.w, r.h);
  g.clip();
  g.drawImage(paper, 0, 0, f.w, f.h);
  g.restore();
  return desk;
}

/* ───────────── 선 · 모양 ───────────── */

function polyPath(g: G, pts: P[], closed = true): void {
  g.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    if (i) g.lineTo(p[0], p[1]);
    else g.moveTo(p[0], p[1]);
  }
  if (closed) g.closePath();
}
function resample(pts: P[], closed: boolean, step: number): P[] {
  const out: P[] = [];
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const k = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let j = 0; j < k; j++) out.push([lerp(a[0], b[0], j / k), lerp(a[1], b[1], j / k)]);
  }
  out.push(closed ? pts[0]! : pts[pts.length - 1]!);
  return out;
}
/** 길이를 따라 부드럽게 흔들린 선 (시드 고정 → 매 프레임 같은 모양) */
function wobbly(pts: P[], closed: boolean, seed: number, amp: number, freq = 0.09, step = 1.6): P[] {
  if (amp <= 0) return closed ? [...pts, pts[0]!] : pts.slice();
  const out: P[] = [];
  let s = 0;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const L = Math.hypot(dx, dy) || 1e-6;
    const nx = -dy / L;
    const ny = dx / L;
    const k = Math.max(1, Math.ceil(L / step));
    for (let j = i === 0 ? 0 : 1; j <= k; j++) {
      const f = j / k;
      const ss = s + L * f;
      const o = amp * (n1(ss * freq, seed) * 0.75 + n1(ss * freq * 3.3, seed + 17) * 0.25);
      out.push([a[0] + dx * f + nx * o, a[1] + dy * f + ny * o]);
    }
    s += L;
  }
  return out;
}
function cumLen(pts: P[]): number[] {
  const c = [0];
  for (let i = 1; i < pts.length; i++) c.push(c[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  return c;
}
function upTo(pts: P[], cum: number[], d: number): P[] {
  if (d >= cum[cum.length - 1]!) return pts;
  const out: P[] = [];
  for (let i = 0; i < pts.length; i++) {
    if (cum[i]! <= d) out.push(pts[i]!);
    else {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const k = (d - cum[i - 1]!) / (cum[i]! - cum[i - 1]! || 1);
      out.push([lerp(a[0], b[0], k), lerp(a[1], b[1], k)]);
      break;
    }
  }
  return out;
}
function arcPts(cx: number, cy: number, r: number, a0: number, a1: number, n = 32, ry = r): P[] {
  const o: P[] = [];
  for (let i = 0; i <= n; i++) {
    const a = lerp(a0, a1, i / n);
    o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * ry]);
  }
  return o;
}
/** 양끝을 조금 넘겨 긋기 */
function over(a: P, b: P, o0: number, o1: number): P[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = Math.hypot(dx, dy) || 1;
  return [
    [a[0] - (dx / L) * o0, a[1] - (dy / L) * o0],
    [b[0] + (dx / L) * o1, b[1] + (dy / L) * o1],
  ];
}
/** 굵기가 변하는 펜 선 (양끝은 가늘게, 중간 굵게, 필압 잡음) — d 까지만 그림 */
function taper(g: G, src: P[], wMax: number, amt: number, seed: number, fill: Ink = '#111', d = Infinity): void {
  const pts = resample(src, false, 1.2);
  const n = pts.length;
  if (n < 2) return;
  const cum = cumLen(pts);
  const L = cum[n - 1]! || 1;
  const left: P[] = [];
  const right: P[] = [];
  for (let i = 0; i < n; i++) {
    if (cum[i]! > d) break;
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(n - 1, i + 1)]!;
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    const prof = Math.pow(Math.sin(Math.PI * clamp(cum[i]! / L, 0, 1)), 0.55);
    const w = wMax * (1 - amt + amt * prof) * (1 + 0.18 * n1(cum[i]! * 0.07, seed)) * 0.5;
    const p = pts[i]!;
    left.push([p[0] - dy * w, p[1] + dx * w]);
    right.push([p[0] + dy * w, p[1] - dx * w]);
  }
  if (left.length < 2) return;
  g.beginPath();
  g.moveTo(left[0]![0], left[0]![1]);
  for (let i = 1; i < left.length; i++) g.lineTo(left[i]![0], left[i]![1]);
  for (let i = right.length - 1; i >= 0; i--) g.lineTo(right[i]![0], right[i]![1]);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
}
function inPoly(pts: P[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!;
    const b = pts[j]!;
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
function distSeg(x: number, y: number, a: P, b: P): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const k = clamp01(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1));
  return Math.hypot(x - a[0] - dx * k, y - a[1] - dy * k);
}
function distPoly(pts: P[], x: number, y: number): number {
  let m = 1e9;
  for (let i = 0; i < pts.length; i++) m = Math.min(m, distSeg(x, y, pts[i]!, pts[(i + 1) % pts.length]!));
  return m;
}
/** 볼록 다각형을 지그재그로 채우는 길 (마커 · 색연필 칠) */
function zigzag(poly: P[], ang: number, sp: number): P[] {
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  const nx = -dy;
  const ny = dx;
  let mn = 1e9;
  let mx = -1e9;
  for (const p of poly) {
    const c = p[0] * nx + p[1] * ny;
    mn = Math.min(mn, c);
    mx = Math.max(mx, c);
  }
  const out: P[] = [];
  let flip = false;
  for (let c = mn + sp * 0.5; c < mx; c += sp) {
    let t0 = 1e9;
    let t1 = -1e9;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      const ca = a[0] * nx + a[1] * ny - c;
      const cb = b[0] * nx + b[1] * ny - c;
      if ((ca <= 0 && cb > 0) || (ca > 0 && cb <= 0)) {
        const k = ca / (ca - cb);
        const px = a[0] + (b[0] - a[0]) * k;
        const py = a[1] + (b[1] - a[1]) * k;
        const tt = px * dx + py * dy;
        t0 = Math.min(t0, tt);
        t1 = Math.max(t1, tt);
      }
    }
    if (t1 > t0) {
      const A: P = [nx * c + dx * t0, ny * c + dy * t0];
      const B: P = [nx * c + dx * t1, ny * c + dy * t1];
      if (flip) out.push(B, A);
      else out.push(A, B);
      flip = !flip;
    }
  }
  return out;
}

/* ───────────── 같은 주제: 정육면체 · 원그래프 · 웃는 세모 · 숫자 7 ───────────── */

const COL = {
  orange: '#f08a3c',
  blue: '#3d7fd9',
  green: '#47b26b',
  yellow: '#f6c443',
  red: '#e2483d',
  pink: '#ff8fa8',
  top: '#9adbd6',
  front: '#3fb0a9',
  side: '#2a7f7a',
  ink: '#25303d',
};
interface Cube {
  front: P[];
  top: P[];
  side: P[];
  back: P;
}
function cube(x: number, y: number, s: number): Cube {
  const o: P = [s * 0.42, -s * 0.34];
  const fx = x - s / 2 - o[0] / 2;
  const fy = y - s / 2 - o[1] / 2;
  const f0: P = [fx, fy];
  const f1: P = [fx + s, fy];
  const f2: P = [fx + s, fy + s];
  const f3: P = [fx, fy + s];
  const a = (p: P): P => [p[0] + o[0], p[1] + o[1]];
  return { front: [f0, f1, f2, f3], top: [f0, f1, a(f1), a(f0)], side: [f1, a(f1), a(f2), f2], back: a(f3) };
}
const cubeHidden = (c: Cube): P[][] => [
  [c.top[3]!, c.back],
  [c.back, c.side[2]!],
  [c.back, c.front[3]!],
];
const PIE = [
  { f: 1 / 2, c: COL.orange, lab: '1/2' },
  { f: 1 / 3, c: COL.blue, lab: '1/3' },
  { f: 1 / 6, c: COL.green, lab: '1/6' },
];
interface Slice {
  pts: P[];
  a0: number;
  a1: number;
  c: string;
  lab: string;
  mid: number;
}
function pieSlices(x: number, y: number, r: number): Slice[] {
  let a = -Math.PI / 2;
  return PIE.map((p) => {
    const a0 = a;
    const a1 = a + p.f * TAU;
    a = a1;
    return { pts: [[x, y] as P, ...arcPts(x, y, r, a0, a1, Math.max(5, Math.ceil(p.f * 44)))], a0, a1, c: p.c, lab: p.lab, mid: (a0 + a1) / 2 };
  });
}
interface Tri {
  x: number;
  y: number;
  s: number;
  pts: P[];
  eyes: [P, P];
  er: number;
  sm: { c: P; r: number; a0: number; a1: number };
  ch: [P, P];
  cr: number;
}
function tri(x: number, y: number, s: number): Tri {
  return {
    x,
    y,
    s,
    pts: [
      [x, y - s * 0.55],
      [x + s * 0.56, y + s * 0.42],
      [x - s * 0.56, y + s * 0.42],
    ],
    eyes: [
      [x - s * 0.17, y + s * 0.04],
      [x + s * 0.17, y + s * 0.04],
    ],
    er: s * 0.06,
    sm: { c: [x, y + s * 0.1], r: s * 0.15, a0: Math.PI * 0.18, a1: Math.PI * 0.82 },
    ch: [
      [x - s * 0.3, y + s * 0.21],
      [x + s * 0.3, y + s * 0.21],
    ],
    cr: s * 0.07,
  };
}
const SEVEN: P[] = [
  [-0.38, -0.5],
  [0.4, -0.5],
  [0.4, -0.36],
  [0.02, 0.5],
  [-0.17, 0.5],
  [0.19, -0.33],
  [-0.38, -0.33],
];
const seven = (x: number, y: number, s: number): P[] => SEVEN.map(([a, b]) => [x + a * s, y + b * s] as P);

type Item =
  | { k: 'cube' | 'pie' | 'tri' | 'seven'; x: number; y: number; s: number }
  | { k: 'text'; x: number; y: number; s: number; str: string; al?: CanvasTextAlign };
/** 반듯한 원본 (평평한 색 + 고른 선) */
function cleanItems(g: G, items: Item[], lw = 1.4): void {
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = COL.ink;
  g.lineWidth = lw;
  const dot = (p: P, r: number): void => {
    g.beginPath();
    g.arc(p[0], p[1], r, 0, TAU);
    g.fill();
  };
  for (const it of items) {
    if (it.k === 'cube') {
      const c = cube(it.x, it.y, it.s);
      const faces: [P[], string][] = [
        [c.top, COL.top],
        [c.side, COL.side],
        [c.front, COL.front],
      ];
      for (const [p, col] of faces) {
        polyPath(g, p);
        g.fillStyle = col;
        g.fill();
        g.stroke();
      }
    } else if (it.k === 'pie') {
      for (const sl of pieSlices(it.x, it.y, it.s)) {
        polyPath(g, sl.pts);
        g.fillStyle = sl.c;
        g.fill();
        g.stroke();
      }
    } else if (it.k === 'tri') {
      const t = tri(it.x, it.y, it.s);
      polyPath(g, t.pts);
      g.fillStyle = COL.yellow;
      g.fill();
      g.stroke();
      g.fillStyle = COL.pink;
      t.ch.forEach((p) => dot(p, t.cr));
      g.fillStyle = COL.ink;
      t.eyes.forEach((p) => dot(p, t.er));
      g.beginPath();
      g.arc(t.sm.c[0], t.sm.c[1], t.sm.r, t.sm.a0, t.sm.a1);
      g.stroke();
    } else if (it.k === 'seven') {
      polyPath(g, seven(it.x, it.y, it.s));
      g.fillStyle = COL.red;
      g.fill();
      g.stroke();
    } else if (it.k === 'text') {
      g.fillStyle = COL.ink;
      g.font = `600 ${it.s}px ${F}`;
      g.textAlign = it.al ?? 'left';
      g.fillText(it.str, it.x, it.y);
      g.textAlign = 'left';
    }
  }
}
function drawClean(g: G, f: Fit, items: Item[], bg = '#f6f5f1'): void {
  g.fillStyle = bg;
  g.fillRect(0, 0, f.w, f.h);
  enter(g, f);
  cleanItems(g, items);
  g.restore();
}

/* ───────────── 손글씨 (글자마다 기울기 · 크기 · 기준선) ───────────── */

interface Jit {
  rot: number;
  size: number;
  base: number;
  space?: number;
}
interface HandStyle {
  fill: Ink;
  weight?: number;
  stroke?: number;
  al?: 'left' | 'center' | 'right';
  k?: number | ((i: number, n: number) => number);
}
function handText(g: G, str: string, x: number, y: number, size: number, seed: number, j: Jit | number, st: HandStyle): { x0: number; x1: number } {
  const jj: Jit = typeof j === 'number' ? { rot: j, size: j, base: j, space: j } : j;
  const chars = [...str];
  g.font = `${st.weight ?? 600} ${size}px ${F}`;
  const r = rng(seed);
  const slope = (r() - 0.5) * 0.05;
  const n = chars.length;
  const kOf = (i: number): number => (typeof st.k === 'function' ? st.k(i, n) : st.k ?? 1);
  const gl = chars.map((ch) => {
    const w = g.measureText(ch).width;
    const a = r();
    const b = r();
    const c = r();
    const d = r();
    const e = r();
    const q = r();
    return {
      ch,
      w,
      rot: (a - 0.5) * 0.22 * jj.rot,
      sc: 1 + (b - 0.5) * 0.24 * jj.size,
      dy: (c - 0.5) * size * 0.17 * jj.base,
      sk: (d - 0.5) * 0.26 * jj.rot,
      adv: w * (1 + (e - 0.5) * 0.2 * (jj.space ?? jj.size)),
      sx: 1 + (q - 0.5) * 0.12 * jj.size,
    };
  });
  let total = 0;
  gl.forEach((q, i) => (total += lerp(q.w, q.adv, kOf(i))));
  const x0 = st.al === 'center' ? x - total / 2 : st.al === 'right' ? x - total : x;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  let cx = x0;
  gl.forEach((q, i) => {
    const k = kOf(i);
    const adv = lerp(q.w, q.adv, k);
    const mx = cx + adv / 2;
    if (q.ch !== ' ') {
      const dy = (q.dy + slope * (mx - x0) * jj.base) * k;
      g.save();
      g.translate(mx, y + dy);
      g.rotate(q.rot * k);
      g.transform(lerp(1, q.sc * q.sx, k), 0, q.sk * k, lerp(1, q.sc, k), 0, 0);
      g.fillStyle = st.fill;
      g.fillText(q.ch, 0, 0);
      if (st.stroke) {
        g.strokeStyle = st.fill;
        g.lineWidth = st.stroke;
        g.lineJoin = 'round';
        g.strokeText(q.ch, 0, 0);
      }
      g.restore();
    }
    cx += adv;
  });
  g.textAlign = 'left';
  return { x0, x1: cx };
}

/* ───────────── 가르는 선 (원본 ↔ 손그림) ───────────── */

function pill(g: G, x: number, y: number, txt: string, al: 'l' | 'r', u: number, w: number, bg = 'rgba(12,16,24,0.74)'): void {
  g.font = `700 ${9 * u}px ${F}`;
  const tw = g.measureText(txt).width + 12 * u;
  const hh = 15 * u;
  const x0 = clamp(al === 'r' ? x - tw : x, 4 * u, w - tw - 4 * u);
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(x0, y, tw, hh, hh / 2);
  g.fill();
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(txt, x0 + tw / 2, y + hh / 2 + 0.5 * u);
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
}
function splitter(g: G, w: number, h: number, t: number, clean: () => void, lab: string, fixed?: number): void {
  reset(g);
  const u = Math.min(w / 280, h / 175);
  const x = fixed ?? w * (0.4 + 0.2 * Math.sin(t * 0.7));
  g.save();
  g.beginPath();
  g.rect(0, 0, x, h);
  g.clip();
  clean();
  g.restore();
  reset(g);
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.5)';
  g.shadowBlur = 6 * u;
  g.fillStyle = '#fff';
  g.fillRect(x - 1 * u, 0, 2 * u, h);
  g.beginPath();
  g.arc(x, h / 2, 8 * u, 0, TAU);
  g.fill();
  g.restore();
  g.strokeStyle = '#334';
  g.lineWidth = 1.4 * u;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(x - 2 * u, h / 2 - 3 * u);
  g.lineTo(x - 5 * u, h / 2);
  g.lineTo(x - 2 * u, h / 2 + 3 * u);
  g.moveTo(x + 2 * u, h / 2 - 3 * u);
  g.lineTo(x + 5 * u, h / 2);
  g.lineTo(x + 2 * u, h / 2 + 3 * u);
  g.stroke();
  const pu = Math.min(u, 1.35);
  pill(g, x - 6 * pu, h - 21 * pu, '원본', 'r', pu, w);
  pill(g, x + 6 * pu, h - 21 * pu, lab, 'l', pu, w);
  reset(g);
}
const cmpToggle = (v: boolean, on: (v: boolean) => void): Control => ({ type: 'toggle', label: '원본과 비교 (가르는 선)', value: v, on });

/* ═════════════ i332 종이 오려 붙이기 (콜라주) ═════════════ */

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Piece {
  img: HTMLCanvasElement;
  sh: HTMLCanvasElement;
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  rot: number;
  lift: boolean;
  shA: number;
}
/** 찢긴 가장자리: 색 면은 살짝 안쪽 · 흰 속지 테두리는 굵기가 들쭉날쭉 · 잔 섬유 들쭉 */
function torn(pts: P[], seed: number, rough: number, rim: number): { col: P[]; wht: P[] } {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    area += a[0] * b[1] - b[0] * a[1];
  }
  const sg = area > 0 ? 1 : -1;
  const col: P[] = [];
  const wht: P[] = [];
  let s = 0;
  let j = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const L = Math.hypot(dx, dy) || 1;
    const nx = (dy / L) * sg;
    const ny = (-dx / L) * sg;
    const k = Math.max(1, Math.ceil(L / 0.7));
    for (let q = 0; q < k; q++) {
      const f = q / k;
      const ss = s + L * f;
      const px = a[0] + dx * f;
      const py = a[1] + dy * f;
      const fine = hash2(j, seed) - 0.5;
      const co = (n1(ss * 0.2, seed) * 0.4 + fine * 0.3) * rough - 0.15 * rough;
      const rw = rim > 0 ? rough * rim * (0.5 + 1.7 * Math.max(0, n1(ss * 0.08, seed + 5))) + 0.25 : 0;
      const wo = co + rw + (hash2(j, seed + 1) - 0.5) * 0.45 * rough * rim;
      col.push([px + nx * co, py + ny * co]);
      wht.push([px + nx * wo, py + ny * wo]);
      j++;
    }
    s += L;
  }
  return { col, wht };
}
function piece(pts: P[], paint: (g: G, b: Box) => void, sc: number, seed: number, rough: number, rot: number, lift: boolean, decor?: (g: G) => void, rim = 1, shA = 0.42): Piece {
  const t = torn(pts, seed, rough, rim);
  let x0 = 1e9;
  let y0 = 1e9;
  let x1 = -1e9;
  let y1 = -1e9;
  for (const p of [...t.wht, ...t.col]) {
    x0 = Math.min(x0, p[0]);
    y0 = Math.min(y0, p[1]);
    x1 = Math.max(x1, p[0]);
    y1 = Math.max(y1, p[1]);
  }
  const m = 5;
  const b: Box = { x: x0 - m, y: y0 - m, w: x1 - x0 + 2 * m, h: y1 - y0 + 2 * m };
  const img = mk(b.w * sc, b.h * sc);
  const g = c2(img);
  g.scale(sc, sc);
  g.translate(-b.x, -b.y);
  if (rim > 0) {
    polyPath(g, t.wht);
    g.fillStyle = '#f8f5ec';
    g.fill();
    g.save();
    g.clip();
    g.globalAlpha = 0.6;
    g.fillStyle = patIn(g, grainTile(), 1 / sc);
    g.fillRect(b.x, b.y, b.w, b.h);
    g.restore();
  }
  g.save();
  polyPath(g, t.col);
  g.clip();
  paint(g, b);
  g.globalAlpha = 0.55;
  g.fillStyle = patIn(g, grainTile(), 1 / sc);
  g.fillRect(b.x, b.y, b.w, b.h);
  g.globalAlpha = 1;
  const lg = g.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
  lg.addColorStop(0, 'rgba(255,255,255,0.16)');
  lg.addColorStop(1, 'rgba(0,0,0,0.14)');
  g.fillStyle = lg;
  g.fillRect(b.x, b.y, b.w, b.h);
  decor?.(g);
  g.restore();
  if (rim > 0) {
    polyPath(g, t.col);
    g.strokeStyle = 'rgba(0,0,0,0.13)';
    g.lineWidth = 0.35;
    g.stroke();
  }
  const sh = mk(b.w * sc, b.h * sc);
  const gs = c2(sh);
  gs.filter = `blur(${(1.4 * sc).toFixed(1)}px)`;
  gs.scale(sc, sc);
  gs.translate(-b.x, -b.y);
  polyPath(gs, rim > 0 ? t.wht : t.col);
  gs.fillStyle = '#000';
  gs.fill();
  let cx = 0;
  let cy = 0;
  pts.forEach((p) => {
    cx += p[0] / pts.length;
    cy += p[1] / pts.length;
  });
  return { img, sh, ...b, cx, cy, rot, lift, shA };
}
function drawPiece(g: G, p: Piece, lift = 0): void {
  g.save();
  g.translate(p.cx, p.cy - lift * 2);
  g.rotate(p.rot + lift * 0.035);
  const k = 1 + lift * 0.05;
  g.scale(k, k);
  if (p.shA > 0) {
    g.globalAlpha = p.shA * (1 - lift * 0.35);
    const e = 1 + lift * 0.05;
    g.drawImage(p.sh, p.x - p.cx + 1.2 + lift * 4, p.y - p.cy + 1.8 + lift * 5, p.w * e, p.h * e);
    g.globalAlpha = 1;
  }
  g.drawImage(p.img, p.x - p.cx, p.y - p.cy, p.w, p.h);
  g.restore();
}
const paintFlat =
  (c: string) =>
  (g: G, b: Box): void => {
    g.fillStyle = c;
    g.fillRect(b.x, b.y, b.w, b.h);
  };
const paintDots =
  (c: string, dc: string, sp: number, r: number) =>
  (g: G, b: Box): void => {
    paintFlat(c)(g, b);
    g.fillStyle = dc;
    g.beginPath();
    let row = 0;
    for (let y = b.y; y < b.y + b.h + sp; y += sp, row++) {
      for (let x = b.x + (row % 2) * sp * 0.5; x < b.x + b.w + sp; x += sp) {
        g.moveTo(x + r, y);
        g.arc(x, y, r, 0, TAU);
      }
    }
    g.fill();
  };
const paintStripes =
  (c: string, sc: string, sp: number, wd: number) =>
  (g: G, b: Box): void => {
    paintFlat(c)(g, b);
    g.strokeStyle = sc;
    g.lineWidth = wd;
    g.beginPath();
    for (let k = -b.h; k < b.w + b.h; k += sp) {
      g.moveTo(b.x + k, b.y + b.h);
      g.lineTo(b.x + k + b.h, b.y);
    }
    g.stroke();
  };
const paintGraph =
  (c: string, lc: string, sp: number) =>
  (g: G, b: Box): void => {
    paintFlat(c)(g, b);
    g.strokeStyle = lc;
    g.lineWidth = 0.28;
    g.beginPath();
    for (let x = b.x; x < b.x + b.w; x += sp) {
      g.moveTo(x, b.y);
      g.lineTo(x, b.y + b.h);
    }
    for (let y = b.y; y < b.y + b.h; y += sp) {
      g.moveTo(b.x, y);
      g.lineTo(b.x + b.w, y);
    }
    g.stroke();
  };
function bakeKraft(f: Fit): HTMLCanvasElement {
  const s = f.s;
  return bake(f.w * s, f.h * s, (x, y, c) => {
    const fx = x / s;
    const fy = y / s;
    const m = fbm(fx * 0.018, fy * 0.018, 3);
    const fib = vnoise(fx * 0.9, fy * 0.08, 5);
    const fib2 = vnoise(fx * 0.12, fy * 1.4, 8);
    const sp = hash2(x, y, 9);
    let v = 0.86 + 0.26 * (m - 0.5) + (fib - 0.5) * 0.07 + (fib2 - 0.5) * 0.04 + 0.018 * Math.sin(fx * 0.85) + (sp > 0.992 ? -0.18 : sp < 0.006 ? 0.12 : 0);
    const dx = fx / f.w - 0.5;
    const dy = fy / f.h - 0.5;
    v *= 1 - 0.5 * (dx * dx + dy * dy);
    c[0] = 178 * v;
    c[1] = 136 * v;
    c[2] = 92 * v;
  });
}
function rectPts(cx: number, cy: number, w: number, h: number, a: number, r: () => number, jit = 0): P[] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return (
    [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ] as P[]
  ).map(([x, y]) => {
    const xx = x + (r() - 0.5) * jit;
    const yy = y + (r() - 0.5) * jit;
    return [cx + xx * c - yy * s, cy + xx * s + yy * c] as P;
  });
}

function makeCollage() {
  let rough = 1.2;
  let tilt = 1;
  let cmp = true;
  let kBg = '';
  let bgC: HTMLCanvasElement | null = null;
  let kP = '';
  let pieces: Piece[] = [];
  const items: Item[] = [
    { k: 'seven', x: 62, y: 100, s: 78 },
    { k: 'tri', x: 150, y: 104, s: 74 },
    { k: 'pie', x: 232, y: 58, s: 27 },
    { k: 'cube', x: 222, y: 134, s: 32 },
    { k: 'text', x: 18, y: 30, s: 15, str: '도형 친구' },
  ];
  const build = (f: Fit): void => {
    const sc = f.u * f.s;
    const r = rng(17);
    const T = (a: number): number => (r() - 0.5) * a * tilt;
    const mv = (p: P[], dx: number, dy: number): P[] => p.map((q) => [q[0] + dx, q[1] + dy] as P);
    const out: Piece[] = [];
    // 정육면체 — 세 면을 따로 오린 종이 (윗면은 모눈종이)
    const cb = cube(222, 134, 32);
    out.push(piece(mv(cb.side, 0.9, 0.2), paintFlat('#226e69'), sc, 3, rough, T(0.1), true));
    out.push(piece(mv(cb.top, 0.2, -0.9), paintGraph('#f4efdf', 'rgba(60,110,200,0.55)', 3.2), sc, 4, rough, T(0.1), true));
    out.push(piece(cb.front, paintFlat('#33a49c'), sc, 5, rough, T(0.08), true));
    // 원그래프 — 조각마다 다른 종이, 살짝 벌어지게
    const pz: ((g: G, b: Box) => void)[] = [paintFlat('#f08a3c'), paintDots('#3b78d8', 'rgba(255,255,255,0.35)', 3.6, 0.55), paintStripes('#45ad69', 'rgba(255,255,255,0.28)', 3.4, 1.1)];
    pieSlices(232, 58, 27).forEach((sl, i) => {
      out.push(piece(mv(sl.pts, Math.cos(sl.mid) * 2.4, Math.sin(sl.mid) * 2.4), pz[i]!, sc, 10 + i, rough, T(0.14), true));
    });
    // 숫자 7 — 물방울 무늬 빨간 종이
    out.push(piece(seven(62, 100, 78), paintDots('#e2483d', 'rgba(130,12,10,0.32)', 5, 1.15), sc, 20, rough, T(0.12) - 0.05 * tilt, false));
    // 웃는 세모 — 눈 · 볼 · 입도 따로 오려 붙인 종이
    const tr = tri(150, 104, 74);
    out.push(
      piece(tr.pts, paintFlat('#f5c33b'), sc, 21, rough, T(0.08) + 0.03 * tilt, false, (g) => {
        g.fillStyle = 'rgba(0,0,0,0.2)';
        tr.ch.forEach((p) => {
          g.beginPath();
          g.arc(p[0] + 0.4, p[1] + 0.6, tr.cr * 1.05, 0, TAU);
          g.fill();
        });
        g.fillStyle = '#f68aa1';
        tr.ch.forEach((p) => {
          g.beginPath();
          g.arc(p[0], p[1], tr.cr * 1.05, 0, TAU);
          g.fill();
        });
        tr.eyes.forEach((p) => {
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.beginPath();
          g.arc(p[0] + 0.5, p[1] + 0.7, tr.er * 1.3, 0, TAU);
          g.fill();
          g.fillStyle = '#1d1d22';
          g.beginPath();
          g.arc(p[0], p[1], tr.er * 1.3, 0, TAU);
          g.fill();
          g.fillStyle = '#fff';
          g.beginPath();
          g.arc(p[0] - tr.er * 0.4, p[1] - tr.er * 0.45, tr.er * 0.42, 0, TAU);
          g.fill();
        });
        g.lineCap = 'round';
        g.lineWidth = 2.6;
        g.strokeStyle = 'rgba(0,0,0,0.22)';
        g.beginPath();
        g.arc(tr.sm.c[0] + 0.5, tr.sm.c[1] + 0.7, tr.sm.r, tr.sm.a0, tr.sm.a1);
        g.stroke();
        g.strokeStyle = '#1d1d22';
        g.beginPath();
        g.arc(tr.sm.c[0], tr.sm.c[1], tr.sm.r, tr.sm.a0, tr.sm.a1);
        g.stroke();
      }),
    );
    // 제목 — 글자마다 다른 종이에서 오린 협박 편지 글자
    const TL: [string, string, string, string][] = [
      ['도', '#f7f3e8', '#1f1f1f', F],
      ['형', '#e9473b', '#fff6e8', 'serif'],
      ['친', '#2d2d2d', '#f6d04d', F],
      ['구', '#4d8be0', '#ffffff', 'serif'],
    ];
    TL.forEach(([ch, bgc, fg, font], i) => {
      const x = 26 + i * 16 + (i > 1 ? 6 : 0);
      const y = 24 + (r() - 0.5) * 3;
      const a = T(0.4);
      const big = 11 + r() * 3;
      out.push(
        piece(rectPts(x, y, 13.5, 16, 0, r, 1.6), paintFlat(bgc), sc, 30 + i, rough * 0.7, a, true, (g) => {
          g.fillStyle = fg;
          g.font = `900 ${big}px ${font}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(ch, x, y + 0.8);
        }),
      );
    });
    // 투명 테이프
    const tape = (cx: number, cy: number, a: number, sd: number): Piece => piece(rectPts(cx, cy, 22, 8, a, r, 0.6), paintFlat('rgba(240,228,192,0.72)'), sc, sd, 0.9, 0, false, undefined, 0, 0.12);
    out.push(tape(150, 66, 0.25, 40), tape(40, 60, -0.55, 41), tape(253, 36, 0.6, 42));
    pieces = out;
  };
  return {
    draw(g: G, w: number, h: number, t: number): void {
      reset(g);
      const f = fitOf(g, w, h);
      const k1 = keyOf(f);
      if (k1 !== kBg) {
        bgC = bakeKraft(f);
        kBg = k1;
      }
      const k2 = keyOf(f, rough, tilt);
      if (k2 !== kP) {
        build(f);
        kP = k2;
      }
      g.drawImage(bgC!, 0, 0, w, h);
      enter(g, f);
      const lifters = pieces.map((p, i) => (p.lift ? i : -1)).filter((i) => i >= 0);
      const tq = Math.floor(t * 12) / 12; // 스톱모션처럼 12장/초
      const per = 2.2;
      const act = lifters[Math.floor(tq / per) % lifters.length] ?? -1;
      const ph = (tq % per) / per;
      const lift = Math.sin(Math.PI * clamp01((ph - 0.1) / 0.6));
      pieces.forEach((p, i) => drawPiece(g, p, i === act ? lift : 0));
      g.restore();
      if (cmp) splitter(g, w, h, t, () => drawClean(g, f, items, '#f4f2ec'), '콜라주');
    },
    controls: [
      { type: 'range', label: '찢긴 정도', min: 0.2, max: 2.4, step: 0.1, value: rough, on: (v) => (rough = v) },
      { type: 'range', label: '조각 기울기', min: 0, max: 2.5, step: 0.1, value: tilt, on: (v) => (tilt = v) },
      cmpToggle(cmp, (v) => (cmp = v)),
    ] as Control[],
  };
}

/* ═════════════ i333 칠판 · 분필 ═════════════ */

function chalkTile(rgb: [number, number, number], seed: number, grit: number): HTMLCanvasElement {
  return bake(192, 192, (x, y, c) => {
    const n = pnoise2(x / 6, y / 16, 32, 12, seed);
    const n2 = pnoise2(x / 2, y / 2, 96, 96, seed + 3);
    const sp = hash2(x, y, seed + 7);
    const a = 0.8 + (n - 0.5) * 0.95 * grit + (n2 - 0.5) * 0.55 * grit - (sp > 1 - 0.16 * grit ? 0.75 : 0);
    c[0] = rgb[0];
    c[1] = rgb[1];
    c[2] = rgb[2];
    c[3] = clamp01(a) * 255;
  });
}
function bakeBoard(f: Fit, smear: number): HTMLCanvasElement {
  const s = f.s;
  const cv = bake(f.w * s, f.h * s, (x, y, c) => {
    const bx = (x / s - f.ox) / f.u;
    const by = (y / s - f.oy) / f.u;
    const m = fbm(bx * 0.02, by * 0.02, 21);
    const m2 = vnoise(bx * 0.18, by * 0.18, 4);
    const v = 0.92 + 0.2 * (m - 0.5) + 0.07 * (m2 - 0.5);
    let e = smooth(0.5, 0.8, fbm(bx * 0.011 + 5, by * 0.02, 33)) * 0.12;
    const arcs: [number, number, number][] = [
      [70, 40, 60],
      [215, 125, 52],
      [160, 20, 95],
      [40, 150, 44],
    ];
    for (const [cx, cy, R] of arcs) {
      const d = Math.hypot(bx - cx, by - cy);
      const band = Math.exp(-(((d - R) / 10) ** 2));
      if (band > 0.01) e += band * 0.085 * (0.4 + vnoise(Math.atan2(by - cy, bx - cx) * 30, d * 0.7, 8));
    }
    e *= smear;
    if (hash2(x, y, 13) > 0.996) e += 0.12;
    c[0] = lerp(32 * v, 205, e);
    c[1] = lerp(64 * v, 215, e);
    c[2] = lerp(53 * v, 205, e);
  });
  // 나무 틀 · 분필 받침
  const g = c2(cv);
  g.scale(s, s);
  const T = 7 * f.u;
  const w = f.w;
  const h = f.h;
  const wood = (x: number, y: number, ww: number, hh: number, vert: boolean, seed: number): void => {
    const gr = vert ? g.createLinearGradient(x, 0, x + ww, 0) : g.createLinearGradient(0, y, 0, y + hh);
    gr.addColorStop(0, '#a3713f');
    gr.addColorStop(0.45, '#7d502b');
    gr.addColorStop(1, '#55341c');
    g.fillStyle = gr;
    g.fillRect(x, y, ww, hh);
    const r = rng(seed);
    g.strokeStyle = 'rgba(40,20,8,0.28)';
    g.lineWidth = 0.6;
    for (let i = 0; i < 16; i++) {
      g.beginPath();
      if (vert) {
        const xx = x + r() * ww;
        g.moveTo(xx, y);
        g.bezierCurveTo(xx + (r() - 0.5) * 3, y + hh * 0.3, xx + (r() - 0.5) * 3, y + hh * 0.7, xx + (r() - 0.5) * 2, y + hh);
      } else {
        const yy = y + r() * hh;
        g.moveTo(x, yy);
        g.bezierCurveTo(x + ww * 0.3, yy + (r() - 0.5) * 3, x + ww * 0.7, yy + (r() - 0.5) * 3, x + ww, yy + (r() - 0.5) * 2);
      }
      g.stroke();
    }
  };
  // 틀 안쪽 그늘
  const sh = (x0: number, y0: number, x1: number, y1: number): void => {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, 'rgba(0,0,0,0.45)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) || w, Math.abs(y1 - y0) || h);
  };
  sh(0, T, 0, T + 6 * f.u);
  sh(T, 0, T + 6 * f.u, 0);
  sh(w - T, 0, w - T - 6 * f.u, 0);
  wood(0, 0, w, T, false, 1);
  wood(0, h - T, w, T, false, 2);
  wood(0, 0, T, h, true, 3);
  wood(w - T, 0, T, h, true, 4);
  const ty = h - T - 5 * f.u;
  const tg = g.createLinearGradient(0, ty, 0, ty + 5 * f.u);
  tg.addColorStop(0, '#b47c4a');
  tg.addColorStop(1, '#6a4224');
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(T, ty - 2 * f.u, w - 2 * T, 2 * f.u);
  g.fillStyle = tg;
  g.fillRect(T, ty, w - 2 * T, 5 * f.u);
  const stick = (x: number, len: number, col: string): void => {
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.roundRect(x + 0.8 * f.u, ty - 2.2 * f.u, len, 3.2 * f.u, 1.4 * f.u);
    g.fill();
    g.fillStyle = col;
    g.beginPath();
    g.roundRect(x, ty - 3 * f.u, len, 3.2 * f.u, 1.4 * f.u);
    g.fill();
  };
  stick(T + 34 * f.u, 15 * f.u, '#f1f0e8');
  stick(T + 56 * f.u, 9 * f.u, '#f4dd7a');
  stick(w - T - 70 * f.u, 12 * f.u, '#f3a6b8');
  const r = rng(5);
  g.fillStyle = 'rgba(240,240,232,0.35)';
  for (let i = 0; i < 70; i++) {
    g.beginPath();
    g.arc(T + r() * (w - 2 * T), ty + r() * 1.5 * f.u, (0.2 + r() * 0.6) * f.u, 0, TAU);
    g.fill();
  }
  return cv;
}

function makeChalk() {
  let grit = 1;
  let smear = 1;
  let cmp = true;
  let kB = '';
  let board: HTMLCanvasElement | null = null;
  let kT = '';
  let tiles: HTMLCanvasElement[] = [];
  let kG = '';
  let ghost: HTMLCanvasElement | null = null;
  const REG = [
    { x: 18, y: 12, w: 140, h: 28, t0: 0, t1: 1.3 },
    { x: 24, y: 54, w: 86, h: 84, t0: 1.4, t1: 2.8 },
    { x: 114, y: 58, w: 150, h: 20, t0: 2.9, t1: 4.0 },
    { x: 114, y: 87, w: 110, h: 20, t0: 4.1, t1: 4.8 },
    { x: 114, y: 117, w: 156, h: 22, t0: 4.9, t1: 6.2 },
    { x: 0, y: 0, w: 0, h: 0, t0: 6.3, t1: 7.3 },
  ];
  interface M {
    chalk: boolean;
    ink: [Ink, Ink, Ink];
    jit: number;
  }
  const content = (g: G, m: M, rev: (i: number) => number, t: number): P | null => {
    let tip: P | null = null;
    const [W, Y, PK] = m.ink;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const cl = (pts: P[], w: number, ink: Ink, closed = false, seed = 1): void => {
      const q = m.chalk ? wobbly(pts, closed, seed, 0.55, 0.08) : closed ? [...pts, pts[0]!] : pts;
      if (m.chalk) {
        g.strokeStyle = 'rgba(230,240,232,0.07)';
        g.lineWidth = w * 3.2;
        polyPath(g, q, false);
        g.stroke();
      }
      g.strokeStyle = ink;
      g.lineWidth = w;
      polyPath(g, q, false);
      g.stroke();
    };
    const tx = (s: string, x: number, y: number, size: number, ink: Ink, seed: number): { x0: number; x1: number } => {
      if (m.chalk) handText(g, s, x + 0.5, y + 0.4, size, seed, m.jit, { fill: 'rgba(230,240,232,0.06)', weight: 700, stroke: 2.4 });
      return handText(g, s, x, y, size, seed, m.jit, { fill: ink, weight: 600 });
    };
    const reg = (i: number, fn: () => void): void => {
      const p = rev(i);
      if (p <= 0) return;
      const R = REG[i]!;
      if (p < 1) {
        g.save();
        g.beginPath();
        g.rect(R.x, R.y, R.w * p, R.h);
        g.clip();
        fn();
        g.restore();
        tip = [R.x + R.w * p, R.y + R.h * 0.62 + Math.sin(t * 34) * R.h * 0.2];
      } else fn();
    };
    reg(0, () => {
      tx('정육면체의 겉넓이', 24, 29, 15, Y, 3);
      const pts: P[] = [];
      for (let x = 22; x <= 152; x += 3) pts.push([x, 35.5 + (m.chalk ? Math.sin(x * 0.2) * 1.1 : 0)]);
      cl(pts, 1.3, Y, false, 4);
    });
    reg(1, () => {
      const c = cube(64, 94, 44);
      cl(c.front, 1.5, W, true, 5);
      cl([c.front[0]!, c.top[3]!, c.top[2]!, c.front[1]!], 1.5, W, false, 6);
      cl([c.top[2]!, c.side[2]!, c.front[2]!], 1.5, W, false, 7);
      g.setLineDash([2.6, 2.4]);
      cubeHidden(c).forEach((l, i) => cl(l, 1.1, W, false, 8 + i));
      g.setLineDash([]);
      tx('3', (c.front[2]![0] + c.front[3]![0]) / 2 - 3, c.front[2]![1] + 12, 11, Y, 11);
      tx('3', c.front[0]![0] - 10, (c.front[0]![1] + c.front[3]![1]) / 2 + 4, 11, Y, 12);
      tx('3', (c.side[2]![0] + c.side[3]![0]) / 2 + 4, (c.side[2]![1] + c.side[3]![1]) / 2 + 9, 11, Y, 13);
    });
    reg(2, () => tx('한 면 = 3 × 3 = 9', 118, 73, 13, W, 21));
    reg(3, () => tx('면의 수 = 6', 118, 102, 13, W, 22));
    reg(4, () => tx('겉넓이 = 9 × 6 = 54', 118, 133, 13, W, 23));
    const p5 = rev(5);
    if (p5 > 0) {
      g.font = `600 13px ${F}`;
      const wAll = g.measureText('겉넓이 = 9 × 6 = 54').width;
      const w54 = g.measureText('54').width;
      const cx = 118 + wAll - w54 / 2 + 3;
      const cy = 128.5;
      const circ: P[] = [];
      for (let i = 0; i <= 64; i++) {
        const a = -2.5 + (i / 64) * TAU * 1.12;
        const rr = 1 + 0.06 * Math.sin(a * 1.7) + 0.05 * (i / 64);
        circ.push([cx + Math.cos(a) * 15 * rr, cy + Math.sin(a) * 10.5 * rr]);
      }
      const cum = cumLen(circ);
      const k = clamp01(p5 / 0.6);
      const part = upTo(circ, cum, cum[cum.length - 1]! * k);
      cl(part, 1.6, PK, false, 31);
      if (k < 1) tip = part[part.length - 1]!;
      const k2 = clamp01((p5 - 0.6) / 0.4);
      if (k2 > 0) {
        // 구석 낙서: 웃는 세모
        const tr = tri(246, 36, 26);
        const lines: P[][] = [
          [...tr.pts, tr.pts[0]!],
          arcPts(tr.sm.c[0], tr.sm.c[1], tr.sm.r, tr.sm.a0, tr.sm.a1, 10),
          [
            [272, 22],
            [276, 18],
          ],
          [
            [274, 30],
            [279, 30],
          ],
          [
            [220, 22],
            [216, 18],
          ],
        ];
        lines.forEach((l, i) => {
          const cc = cumLen(l);
          const kk = clamp01(k2 * lines.length - i);
          if (kk > 0) cl(upTo(l, cc, cc[cc.length - 1]! * kk), 1.2, PK, false, 40 + i);
        });
        if (k2 > 0.5) {
          g.fillStyle = PK;
          tr.eyes.forEach((p) => {
            g.beginPath();
            g.arc(p[0], p[1], 1.4, 0, TAU);
            g.fill();
          });
        }
        if (k2 < 1) tip = [246, 36];
      }
    }
    return tip;
  };
  const inkOf = (gg: G, sc: number): [Ink, Ink, Ink] => [patIn(gg, tiles[0]!, sc), patIn(gg, tiles[1]!, sc), patIn(gg, tiles[2]!, sc)];
  const bakeGhost = (f: Fit): HTMLCanvasElement => {
    const a = mk(f.w * f.s, f.h * f.s);
    const ga = c2(a);
    ga.setTransform(f.s * f.u, 0, 0, f.s * f.u, f.s * f.ox, f.s * f.oy);
    content(ga, { chalk: true, ink: inkOf(ga, 1 / (f.u * f.s)), jit: 1 }, () => 1, 0);
    const b = mk(f.w * f.s, f.h * f.s);
    const gb = c2(b);
    gb.filter = `blur(${(2.2 * f.s * f.u).toFixed(1)}px)`;
    gb.drawImage(a, 0, 0);
    gb.globalAlpha = 0.6;
    gb.drawImage(a, 7 * f.s * f.u, 1 * f.s);
    gb.drawImage(a, -5 * f.s * f.u, -1 * f.s);
    return b;
  };
  const stick = (g: G, p: P): void => {
    g.save();
    g.translate(p[0], p[1]);
    g.rotate(-0.95);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath();
    g.roundRect(1.5, 1, 16, 3.8, 1.6);
    g.fill();
    const gr = g.createLinearGradient(0, -1.9, 0, 1.9);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(1, '#c9c9bf');
    g.fillStyle = gr;
    g.beginPath();
    g.roundRect(0, -1.9, 16, 3.8, 1.6);
    g.fill();
    g.restore();
  };
  const eraser = (g: G, x: number, y: number): void => {
    g.save();
    g.translate(x, y);
    g.rotate(-0.08);
    const r = rng(9);
    g.fillStyle = 'rgba(230,236,226,0.22)';
    for (let i = 0; i < 14; i++) {
      g.beginPath();
      g.arc(-16 - r() * 18, (r() - 0.5) * 14, 0.8 + r() * 2.2, 0, TAU);
      g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.roundRect(-12, -5, 28, 15, 2);
    g.fill();
    g.fillStyle = '#8e8e8a';
    g.fillRect(-14, 1, 28, 7);
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 0.5;
    for (let i = -12; i < 14; i += 2.2) {
      g.beginPath();
      g.moveTo(i, 1.5);
      g.lineTo(i, 7.5);
      g.stroke();
    }
    const gr = g.createLinearGradient(0, -6, 0, 1);
    gr.addColorStop(0, '#d39a5e');
    gr.addColorStop(1, '#8b5a30');
    g.fillStyle = gr;
    g.beginPath();
    g.roundRect(-14, -6, 28, 7.5, 2);
    g.fill();
    g.restore();
  };
  return {
    draw(g: G, w: number, h: number, t: number): void {
      reset(g);
      const f = fitOf(g, w, h);
      const kb = keyOf(f, smear);
      if (kb !== kB) {
        board = bakeBoard(f, smear);
        kB = kb;
      }
      const kt = keyOf(f, grit);
      if (kt !== kT) {
        tiles = [chalkTile([240, 242, 234], 1, grit), chalkTile([247, 222, 118], 2, grit), chalkTile([246, 150, 172], 3, grit)];
        kT = kt;
      }
      if (kG !== kt) {
        ghost = bakeGhost(f);
        kG = kt;
      }
      g.drawImage(board!, 0, 0, w, h);
      g.globalAlpha = 0.22 * smear;
      g.drawImage(ghost!, 0, 0, w, h);
      g.globalAlpha = 1;
      const tc = t % 12;
      const ex = tc >= 9.4 ? lerp(-24, 300, clamp01((tc - 9.4) / 2)) : -60;
      enter(g, f);
      g.save();
      g.beginPath();
      g.rect(ex, -600, 3000, 3000);
      g.clip();
      const rev = (i: number): number => clamp01((tc - REG[i]!.t0) / (REG[i]!.t1 - REG[i]!.t0));
      const tip = content(g, { chalk: true, ink: inkOf(g, 1 / (f.u * f.s)), jit: 1 }, rev, t);
      g.restore();
      if (tip && tc < 9.4) stick(g, tip);
      if (tc >= 9.4 && tc < 11.4) eraser(g, ex, 92 + 54 * Math.sin(((tc - 9.4) / 2) * TAU * 3.5));
      g.restore();
      if (cmp)
        splitter(
          g,
          w,
          h,
          t,
          () => {
            g.fillStyle = '#fafaf7';
            g.fillRect(0, 0, w, h);
            enter(g, f);
            content(g, { chalk: false, ink: ['#1f2937', '#c2410c', '#db2777'], jit: 0 }, () => 1, t);
            g.restore();
          },
          '분필',
        );
    },
    controls: [
      { type: 'range', label: '분필 거칠기', min: 0.2, max: 2, step: 0.1, value: grit, on: (v) => (grit = v) },
      { type: 'range', label: '번짐 · 지운 자국', min: 0, max: 2.5, step: 0.1, value: smear, on: (v) => (smear = v) },
      cmpToggle(cmp, (v) => (cmp = v)),
    ] as Control[],
  };
}

/* ═════════════ i334 공책 낙서 (줄 공책 · 볼펜) ═════════════ */

function bakeNotebook(f: Fit): HTMLCanvasElement {
  const s = f.s;
  const cv = bake(f.w * s, f.h * s, (x, y, c) => {
    const bx = (x / s - f.ox) / f.u;
    const by = (y / s - f.oy) / f.u;
    const m = fbm(bx * 0.05, by * 0.05, 2);
    const fib = vnoise(bx * 1.3, by * 0.25, 6);
    const sp = hash2(x, y, 3);
    let v = 0.99 + 0.035 * (m - 0.5) + 0.02 * (fib - 0.5) + (sp > 0.995 ? -0.04 : 0);
    v *= 1 - 0.06 * smooth(40, 0, bx); // 철한 쪽 그늘
    const dx = x / s / f.w - 0.5;
    const dy = y / s / f.h - 0.5;
    v *= 1 - 0.18 * (dx * dx + dy * dy);
    c[0] = 252 * v;
    c[1] = 250 * v;
    c[2] = 242 * v;
  });
  const g = c2(cv);
  g.scale(s, s);
  const u = f.u;
  g.strokeStyle = 'rgba(110,160,225,0.55)';
  g.lineWidth = Math.max(0.6, 0.5 * u);
  for (let k = -30; k < 60; k++) {
    const y = f.oy + (22 + 12 * k) * u;
    if (y < 14 * u + f.oy * 0 || y > f.h) continue;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(f.w, y);
    g.stroke();
  }
  g.strokeStyle = 'rgba(232,88,88,0.6)';
  g.lineWidth = Math.max(0.6, 0.55 * u);
  for (const dx of [0, 1.8]) {
    const x = f.ox + (36 + dx) * u;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, f.h);
    g.stroke();
  }
  // 커피 자국
  const r = rng(4);
  for (let i = 0; i < 6; i++) {
    g.strokeStyle = `rgba(150,100,50,${0.04 + r() * 0.05})`;
    g.lineWidth = (0.6 + r() * 1.6) * u;
    g.beginPath();
    const a0 = r() * TAU;
    g.arc(f.ox + 252 * u, f.oy + 150 * u, (15 + r() * 1.5) * u, a0, a0 + 2 + r() * 3.5);
    g.stroke();
  }
  // 구멍 (아래 책상이 보임)
  for (const yb of [30, 87.5, 145]) {
    const cx = f.ox + 15 * u;
    const cy = f.oy + yb * u;
    const rr = 4.2 * u;
    const gr = g.createRadialGradient(cx - rr * 0.3, cy - rr * 0.3, 0, cx, cy, rr);
    gr.addColorStop(0, '#3a332c');
    gr.addColorStop(1, '#1c1814');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(cx, cy, rr, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 0.8 * u;
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 0.6 * u;
    g.beginPath();
    g.arc(cx, cy, rr + 0.6 * u, 0.2, 2.6);
    g.stroke();
  }
  return cv;
}
function star5(cx: number, cy: number, r: number, a0 = -Math.PI / 2): P[] {
  const o: P[] = [];
  for (let i = 0; i <= 5; i++) {
    const a = a0 + ((i * 2) % 5) * (TAU / 5) + (i === 5 ? 0 : 0);
    o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return o;
}

function makeNotebook() {
  let amp = 1;
  let passes = 2;
  let cmp = true;
  let kP = '';
  let paper: HTMLCanvasElement | null = null;
  const INK = '#22409c';
  interface M {
    pen: boolean;
    ink: string;
  }
  const content = (g: G, m: M, circ: number, stars: number): P | null => {
    let tip: P | null = null;
    let sd = 1;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const pl = (pts: P[], closed = false, w = 1.05, pass = m.pen ? passes : 1, a = amp): void => {
      for (let k = 0; k < pass; k++) {
        const q = m.pen ? wobbly(pts, closed, sd * 13 + k * 31, a * (k ? 1.35 : 0.9), 0.1, 1.4) : closed ? [...pts, pts[0]!] : pts;
        g.strokeStyle = m.ink;
        g.globalAlpha = m.pen ? (k ? 0.6 : 0.92) : 1;
        g.lineWidth = m.pen ? w * (k ? 0.8 : 1) : w * 0.9;
        polyPath(g, q, false);
        g.stroke();
        if (m.pen && k === 0) {
          g.fillStyle = m.ink;
          g.beginPath();
          g.arc(q[0]![0], q[0]![1], w * 0.62, 0, TAU);
          g.fill();
        }
      }
      g.globalAlpha = 1;
      sd++;
    };
    const tx = (s: string, x: number, y: number, size: number, al: 'left' | 'center' | 'right' = 'left'): { x0: number; x1: number } =>
      handText(g, s, x, y, size, sd++ * 7, m.pen ? amp * 1.1 : 0, { fill: m.ink, weight: m.pen ? 500 : 600, stroke: m.pen ? 0.3 : 0, al });
    tx('10월 6일 (화)', 272, 19, 7.5, 'right');
    tx('3. 정육면체의 모서리는 모두 몇 개일까?', 44, 32, 10);
    // 정육면체 스케치 + 빗금 + 모서리 번호
    const c = cube(74, 84, 30);
    const edges: P[][] = [
      [c.front[0]!, c.front[1]!],
      [c.front[1]!, c.front[2]!],
      [c.front[2]!, c.front[3]!],
      [c.front[3]!, c.front[0]!],
      [c.top[3]!, c.top[2]!],
      [c.top[2]!, c.side[2]!],
      [c.front[0]!, c.top[3]!],
      [c.front[1]!, c.top[2]!],
      [c.front[2]!, c.side[2]!],
    ];
    edges.forEach((e) => pl(m.pen ? over(e[0]!, e[1]!, 1.2, 1.6) : e));
    g.setLineDash([2, 1.8]);
    cubeHidden(c).forEach((e) => pl(e, false, 0.8, 1));
    g.setLineDash([]);
    g.save();
    polyPath(g, c.side);
    g.clip();
    for (let k = -40; k < 40; k += 2.3) pl([[c.side[0]![0] + k, c.side[0]![1] + 30], [c.side[0]![0] + k + 18, c.side[0]![1] - 10]], false, 0.6, 1, amp * 0.3);
    g.restore();
    const cen: P = [74 + 6, 84 - 4];
    [...edges, ...cubeHidden(c)].forEach((e, i) => {
      const mx = (e[0]![0] + e[1]![0]) / 2;
      const my = (e[0]![1] + e[1]![1]) / 2;
      const dx = mx - cen[0];
      const dy = my - cen[1];
      const l = Math.hypot(dx, dy) || 1;
      tx(String(i + 1), mx + (dx / l) * 5, my + (dy / l) * 5 + 2, 5.2, 'center');
    });
    // 바를 정 대신 막대 세기
    const tally = (x: number, n: number, strike: boolean): void => {
      for (let i = 0; i < n; i++) pl([[x + i * 3, 61], [x + i * 3 + 0.4, 71]], false, 0.9, 1);
      if (strike) pl([[x - 2, 69], [x + 11, 62]], false, 0.9, 1);
    };
    tally(120, 4, true);
    tally(137, 4, true);
    tally(154, 2, false);
    // 화살표
    const arr: P[] = [];
    for (let i = 0; i <= 20; i++) {
      const k = i / 20;
      arr.push([lerp(104, 146, k), 90 + Math.sin(k * Math.PI) * -7 + k * 8]);
    }
    pl(arr, false, 1, 1);
    pl([[140.5, 94.5], [146, 98], [139.8, 100.6]], false, 1, 1);
    tx('답: 12개', 150, 105, 11);
    // 답에 동그라미 (움직임)
    if (circ > 0) {
      const ring: P[] = [];
      for (let i = 0; i <= 70; i++) {
        const a = -2.3 + (i / 70) * TAU * 1.7;
        const rr = 1 + 0.05 * Math.sin(a * 1.3) + 0.07 * (i / 70);
        ring.push([171 + Math.cos(a) * 27 * rr, 101 + Math.sin(a) * 10.5 * rr - (i / 70) * 1.2]);
      }
      const q = m.pen ? wobbly(ring, false, 77, amp * 0.6, 0.1, 1.4) : ring;
      const cc = cumLen(q);
      const part = upTo(q, cc, cc[cc.length - 1]! * circ);
      g.strokeStyle = m.ink;
      g.lineWidth = 1.05;
      g.globalAlpha = 0.92;
      polyPath(g, part, false);
      g.stroke();
      g.globalAlpha = 1;
      if (circ < 1) tip = part[part.length - 1]!;
    }
    tx('7 + 5 = 12', 120, 129, 9.5);
    pl([[176, 124], [179.5, 128.5], [187, 118.5]], false, 1.1, 1);
    // 원그래프
    const PC: P = [230, 76];
    const R = 21;
    pl(arcPts(PC[0], PC[1], R, -Math.PI / 2 - 0.15, Math.PI * 1.5 + 0.25, 44));
    for (const a of [-Math.PI / 2, Math.PI / 2, Math.PI / 2 + (TAU / 3)]) pl([PC, [PC[0] + Math.cos(a) * R, PC[1] + Math.sin(a) * R]], false, 1, 1);
    g.save();
    polyPath(g, [PC, ...arcPts(PC[0], PC[1], R, Math.PI / 2 + TAU / 3, Math.PI * 1.5, 8)]);
    g.clip();
    for (let k = -30; k < 30; k += 2.4) {
      pl([[PC[0] - 30 + k, PC[1] + 10], [PC[0] - 10 + k, PC[1] - 30]], false, 0.55, 1, amp * 0.3);
      pl([[PC[0] - 30 + k, PC[1] - 30], [PC[0] - 10 + k, PC[1] + 10]], false, 0.55, 1, amp * 0.3);
    }
    g.restore();
    tx('1/2', PC[0] + 10, PC[1] + 3, 6.5, 'center');
    tx('1/3', PC[0] - 9, PC[1] + 10, 6.5, 'center');
    tx('1/2 + 1/3 + 1/6 = 1', 198, 117, 8);
    // 별
    if (stars > 0) {
      for (const [x, y, r0, i] of [
        [207, 99, 5.5, 0],
        [132, 112, 3.8, 1],
      ] as [number, number, number, number][]) {
        const k = clamp01(stars * 2 - i);
        if (k <= 0) continue;
        const st = star5(x, y, r0);
        const q = m.pen ? wobbly(st, false, 90 + i, amp * 0.35, 0.2, 1) : st;
        const cc = cumLen(q);
        const part = upTo(q, cc, cc[cc.length - 1]! * k);
        g.strokeStyle = m.ink;
        g.lineWidth = 1;
        polyPath(g, part, false);
        g.stroke();
        if (k < 1) tip = part[part.length - 1]!;
      }
    }
    // 웃는 세모 낙서 + 말
    const tr = tri(252, 146, 24);
    pl(tr.pts, true);
    g.fillStyle = m.ink;
    tr.eyes.forEach((p) => {
      g.beginPath();
      g.arc(p[0], p[1], 1.3, 0, TAU);
      g.fill();
    });
    pl(arcPts(tr.sm.c[0], tr.sm.c[1], tr.sm.r, tr.sm.a0, tr.sm.a1, 8), false, 1, 1);
    pl([[263, 128], [266, 124]], false, 0.9, 1);
    pl([[267, 134], [271, 133]], false, 0.9, 1);
    tx('쉽지?', 212, 158, 8.5);
    // 소용돌이
    const sp: P[] = [];
    for (let i = 0; i <= 60; i++) {
      const a = i * 0.32;
      sp.push([54 + Math.cos(a) * i * 0.13, 152 + Math.sin(a) * i * 0.13]);
    }
    pl(sp, false, 0.9, 1);
    return tip;
  };
  const pen = (g: G, p: P): void => {
    g.save();
    g.translate(p[0], p[1]);
    g.save();
    g.translate(4, 5);
    g.rotate(-0.9);
    g.fillStyle = 'rgba(0,0,0,0.14)';
    g.fillRect(4, -2.6, 58, 5.2);
    g.restore();
    g.rotate(-0.9);
    g.fillStyle = '#c3c7cf';
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(5, -1.6);
    g.lineTo(5, 1.6);
    g.closePath();
    g.fill();
    g.fillStyle = '#2f4fb3';
    g.fillRect(5, -2.3, 13, 4.6);
    g.fillStyle = 'rgba(232,240,252,0.92)';
    g.fillRect(18, -2.5, 42, 5);
    g.fillStyle = '#2a4cc0';
    g.fillRect(18, -0.5, 40, 1);
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.fillRect(18, -2.2, 42, 0.8);
    g.fillStyle = '#2f4fb3';
    g.fillRect(58, -2.6, 6, 5.2);
    g.restore();
  };
  return {
    draw(g: G, w: number, h: number, t: number): void {
      reset(g);
      const f = fitOf(g, w, h);
      const kp = keyOf(f);
      if (kp !== kP) {
        paper = bakeNotebook(f);
        kP = kp;
      }
      g.drawImage(paper!, 0, 0, w, h);
      const tc = t % 5;
      const circ = smooth(0.3, 1.8, tc);
      const stars = smooth(1.9, 2.6, tc);
      enter(g, f);
      g.globalCompositeOperation = 'multiply';
      const tip = content(g, { pen: true, ink: INK }, circ, stars);
      g.globalCompositeOperation = 'source-over';
      if (tip) pen(g, tip);
      g.restore();
      if (cmp)
        splitter(
          g,
          w,
          h,
          t,
          () => {
            g.fillStyle = '#ffffff';
            g.fillRect(0, 0, w, h);
            enter(g, f);
            content(g, { pen: false, ink: '#334155' }, 1, 1);
            g.restore();
          },
          '볼펜 낙서',
        );
    },
    controls: [
      { type: 'range', label: '손떨림', min: 0, max: 2.5, step: 0.1, value: amp, on: (v) => (amp = v) },
      { type: 'range', label: '겹쳐 긋기', min: 1, max: 3, step: 1, value: passes, on: (v) => (passes = v) },
      cmpToggle(cmp, (v) => (cmp = v)),
    ] as Control[],
  };
}

/* ═════════════ i335 만화 펜선 + 스크린톤 ═════════════ */

function bakeTone(f: Fit, pitch: number, rad: (x: number, y: number) => number): HTMLCanvasElement {
  const cv = mk(f.w * f.s, f.h * f.s);
  const g = c2(cv);
  g.setTransform(f.s * f.u, 0, 0, f.s * f.u, f.s * f.ox, f.s * f.oy);
  g.fillStyle = '#161616';
  const x0 = -f.ox / f.u - 6;
  const x1 = (f.w - f.ox) / f.u + 6;
  const y0 = -f.oy / f.u - 6;
  const y1 = (f.h - f.oy) / f.u + 6;
  const q = pitch * Math.SQRT1_2;
  g.beginPath();
  for (let k = Math.floor(y0 / q); k * q < y1; k++) {
    for (let mm = Math.floor(x0 / q); mm * q < x1; mm++) {
      if ((k + mm) & 1) continue;
      const x = mm * q;
      const y = k * q;
      const r = rad(x, y) * pitch;
      if (r < 0.04) continue;
      g.moveTo(x + r, y);
      g.arc(x, y, r, 0, TAU);
    }
  }
  g.fill();
  return cv;
}
function makeManga() {
  let tap = 0.85;
  let dot = 1;
  let cmp = true;
  let kT = '';
  let tones: HTMLCanvasElement[] = [];
  let kP = '';
  let paper: HTMLCanvasElement | null = null;
  const toneIn = (g: G, f: Fit, path: () => void, cv: HTMLCanvasElement): void => {
    g.save();
    path();
    g.clip();
    fullImg(g, f, cv);
    g.restore();
  };
  return {
    draw(g: G, w: number, h: number, t: number): void {
      reset(g);
      const f = fitOf(g, w, h);
      const kp = keyOf(f);
      if (kp !== kP) {
        paper = bakePaper(f, [246, 243, 234], 1, 0.18, 7);
        kP = kp;
      }
      const kt = keyOf(f, dot);
      if (kt !== kT) {
        tones = [
          bakeTone(f, 2.6, () => 0.34 * dot),
          bakeTone(f, 2.6, () => 0.19 * dot),
          bakeTone(f, 2.6, (_x, y) => 0.4 * smooth(80, 10, y) * dot),
        ];
        kT = kt;
      }
      const [dark, light, grad] = tones as [HTMLCanvasElement, HTMLCanvasElement, HTMLCanvasElement];
      g.drawImage(paper!, 0, 0, w, h);
      const tq = Math.floor(t * 15) / 15;
      const tc = tq % 3;
      const imp = Math.exp(-tc * 4.5);
      const step = Math.floor(t * 15);
      const shx = (hash2(step, 1) - 0.5) * 3.2 * imp;
      const shy = (hash2(step, 2) - 0.5) * 3.2 * imp;
      enter(g, f);
      g.save();
      g.translate(shx, shy);
      g.save();
      g.beginPath();
      g.rect(10, 10, 260, 155);
      g.clip();
      g.fillStyle = '#fdfdfb';
      g.fillRect(0, 0, 280, 175);
      fullImg(g, f, grad);
      // 집중선
      const C: P = [150, 98];
      const r = rng(5);
      g.fillStyle = '#111';
      g.beginPath();
      for (let i = 0; i < 150; i++) {
        const a = (i / 150) * TAU + (r() - 0.5) * 0.035;
        const rin = (60 + r() * 40) * (1 - 0.2 * imp);
        const wo = 0.4 + r() * 1.9;
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        const R = 240;
        g.moveTo(C[0] + dx * R - dy * wo, C[1] + dy * R + dx * wo);
        g.lineTo(C[0] + dx * rin, C[1] + dy * rin);
        g.lineTo(C[0] + dx * R + dy * wo, C[1] + dy * R - dx * wo);
        g.closePath();
      }
      g.fill();
      // 정육면체 (윗면 옅은 톤 · 옆면 짙은 톤)
      const cb = cube(54, 130, 34);
      polyPath(g, cb.front);
      g.fillStyle = '#fff';
      g.fill();
      polyPath(g, cb.top);
      g.fill();
      polyPath(g, cb.side);
      g.fill();
      toneIn(g, f, () => polyPath(g, cb.top), light);
      toneIn(g, f, () => polyPath(g, cb.side), dark);
      const cedges: P[][] = [
        [cb.front[0]!, cb.front[1]!],
        [cb.front[1]!, cb.front[2]!],
        [cb.front[2]!, cb.front[3]!],
        [cb.front[3]!, cb.front[0]!],
        [cb.front[0]!, cb.top[3]!],
        [cb.top[3]!, cb.top[2]!],
        [cb.front[1]!, cb.top[2]!],
        [cb.top[2]!, cb.side[2]!],
        [cb.side[2]!, cb.front[2]!],
      ];
      cedges.forEach((e, i) => taper(g, over(e[0]!, e[1]!, 0.8, 0.8), 1.9, tap, 50 + i));
      // 웃는 세모 (충격에 커짐)
      g.save();
      const zs = 1 + 0.07 * imp;
      g.translate(150, 100);
      g.scale(zs, zs);
      g.translate(-150, -100);
      const tr = tri(150, 100, 76);
      polyPath(g, tr.pts);
      g.fillStyle = '#fff';
      g.fill();
      toneIn(
        g,
        f,
        () => {
          polyPath(g, tr.pts);
          g.clip();
          polyPath(g, [tr.pts[0]!, tr.pts[1]!, [150 + 76 * 0.14, tr.pts[1]![1]]]);
        },
        dark,
      );
      toneIn(
        g,
        f,
        () => {
          polyPath(g, tr.pts);
          g.clip();
          g.beginPath();
          g.rect(100, tr.pts[1]![1] - 9, 100, 9);
        },
        light,
      );
      for (let i = 0; i < 3; i++) {
        const a = tr.pts[i]!;
        const b = tr.pts[(i + 1) % 3]!;
        taper(g, over(a, b, 2.2, 2.2), 3.2, tap, 60 + i);
      }
      // 큰 눈 · 반짝
      tr.eyes.forEach((p) => {
        g.fillStyle = '#111';
        g.beginPath();
        g.ellipse(p[0], p[1] - 2, 4.2, 6.2, 0, 0, TAU);
        g.fill();
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(p[0] - 1.4, p[1] - 4.4, 1.7, 0, TAU);
        g.fill();
        g.beginPath();
        g.arc(p[0] + 1.3, p[1] + 0.6, 0.85, 0, TAU);
        g.fill();
      });
      // 벌린 입 + 혀 톤
      const mx = 150;
      const my = 107;
      const mouth = (): void => {
        g.beginPath();
        g.moveTo(mx - 8, my);
        g.quadraticCurveTo(mx, my + 15, mx + 8, my);
        g.closePath();
      };
      mouth();
      g.fillStyle = '#111';
      g.fill();
      g.save();
      mouth();
      g.clip();
      g.fillStyle = '#fff';
      g.beginPath();
      g.ellipse(mx, my + 9.5, 5, 3.6, 0, 0, TAU);
      g.fill();
      toneIn(
        g,
        f,
        () => {
          g.beginPath();
          g.ellipse(mx, my + 9.5, 5, 3.6, 0, 0, TAU);
        },
        light,
      );
      g.restore();
      // 볼 빗금 (만화식 홍조)
      tr.ch.forEach((p, j) => {
        for (let i = 0; i < 3; i++) taper(g, [[p[0] - 3 + i * 2.6, p[1] + 2.4], [p[0] - 1 + i * 2.6, p[1] - 2.4]], 1.1, 1, 70 + i + j * 3);
      });
      // 반짝 별
      const sx = 182;
      const sy = 56;
      const sp = (k: number): void => {
        g.beginPath();
        g.moveTo(sx, sy - 7 * k);
        g.quadraticCurveTo(sx, sy, sx + 7 * k, sy);
        g.quadraticCurveTo(sx, sy, sx, sy + 7 * k);
        g.quadraticCurveTo(sx, sy, sx - 7 * k, sy);
        g.quadraticCurveTo(sx, sy, sx, sy - 7 * k);
      };
      sp(1.25);
      g.fillStyle = '#111';
      g.fill();
      sp(1);
      g.fillStyle = '#fff';
      g.fill();
      g.restore();
      // 말풍선
      const bx = 70;
      const by = 38;
      const ell = arcPts(bx, by, 46, 0, TAU, 60, 19);
      polyPath(g, ell);
      g.fillStyle = '#fff';
      g.fill();
      taper(g, ell.slice(0, 31), 1.9, tap * 0.7, 80);
      taper(g, ell.slice(30), 1.9, tap * 0.7, 81);
      const tail: P[] = [
        [96, 52],
        [120, 72],
        [106, 50],
      ];
      polyPath(g, tail);
      g.fillStyle = '#fff';
      g.fill();
      taper(g, [tail[0]!, tail[1]!], 1.7, tap, 82);
      taper(g, [tail[1]!, tail[2]!], 1.7, tap, 83);
      g.fillStyle = '#111';
      g.font = `900 14px ${F}`;
      g.textAlign = 'center';
      g.fillText('정답은 7 !', bx, by + 5);
      g.textAlign = 'left';
      // 효과음 글씨
      const sfx = 1 + 0.3 * imp;
      g.save();
      g.translate(228, 46);
      g.scale(sfx, sfx);
      g.rotate(-0.12);
      g.font = `900 27px ${F}`;
      g.lineJoin = 'round';
      const glyphs: [string, number, number, number][] = [
        ['두', -24, 0, -0.12],
        ['둥', 4, 6, 0.1],
        ['!', 26, 2, 0.2],
      ];
      for (const [ch, x, y, a] of glyphs) {
        g.save();
        g.translate(x, y);
        g.rotate(a);
        g.textAlign = 'center';
        g.strokeStyle = '#fff';
        g.lineWidth = 6;
        g.strokeText(ch, 0, 0);
        g.fillStyle = '#111';
        g.fillText(ch, 0, 0);
        g.restore();
      }
      g.restore();
      g.restore();
      // 칸 테두리
      g.strokeStyle = '#111';
      g.lineWidth = 2.6;
      g.strokeRect(10, 10, 260, 155);
      g.restore();
      g.restore();
      if (cmp)
        splitter(
          g,
          w,
          h,
          t,
          () => {
            drawClean(
              g,
              f,
              [
                { k: 'cube', x: 54, y: 130, s: 34 },
                { k: 'tri', x: 150, y: 100, s: 76 },
              ],
              '#f6f6f2',
            );
            enter(g, f);
            g.beginPath();
            g.ellipse(70, 38, 46, 19, 0, 0, TAU);
            g.fillStyle = '#fff';
            g.fill();
            g.strokeStyle = COL.ink;
            g.lineWidth = 1.2;
            g.stroke();
            g.fillStyle = COL.ink;
            g.font = `500 13px ${F}`;
            g.textAlign = 'center';
            g.fillText('정답은 7 !', 70, 43);
            g.textAlign = 'left';
            g.restore();
          },
          '만화',
        );
    },
    controls: [
      { type: 'range', label: '펜 굵기 변화 (끝 가늘게)', min: 0, max: 1, step: 0.05, value: tap, on: (v) => (tap = v) },
      { type: 'range', label: '스크린톤 점 크기', min: 0.4, max: 1.6, step: 0.05, value: dot, on: (v) => (dot = v) },
      cmpToggle(cmp, (v) => (cmp = v)),
    ] as Control[],
  };
}

/* ═════════════ i336 목판화 ═════════════ */

const WT = tri(206, 118, 46);
const WC = cube(92, 100, 56);
const yG = (x: number): number => 139 + 4 * Math.sin(x * 0.035 + 0.5) + 2.5 * Math.sin(x * 0.09 + 1);
const yH = (x: number): number => 116 + 9 * Math.sin(x * 0.022 + 2) + 5 * Math.sin(x * 0.061);
const aaE = (d: number, e: number, px: number): number => clamp01(0.5 + (e - d) / (px * 1.4));
/** 판 홈 줄무늬: 줄 굵기(dark) = 어두움, 선 사이를 칼로 파낸 흰 홈 */
function stripe(c: number, pitch: number, dark: number, px: number): number {
  const v = c / pitch;
  const fr = v - Math.floor(v);
  return aaE(Math.min(fr, 1 - fr) * pitch, dark * pitch * 0.5, px);
}
function woodInk(bx: number, by: number, R: number, D: number, px: number): number {
  const qx = bx + (vnoise(bx * 0.8, by * 0.8, 3) - 0.5) * 1.3 * R;
  const qy = by + (vnoise(bx * 0.8 + 9.1, by * 0.8, 4) - 0.5) * 1.3 * R;
  const lw = (vnoise(bx * 0.07, by * 0.07, 6) - 0.5) * 1.5 * R + (vnoise(bx * 0.5, by * 0.5, 7) - 0.5) * 0.35 * R;
  const tp = 0.7 + 0.6 * vnoise(bx * 0.11, by * 0.11, 12);
  let v = 0;
  if (qx > 176 && qx < 236 && qy > 88 && qy < 141 && inPoly(WT.pts, qx, qy)) {
    v = aaE(distPoly(WT.pts, qx, qy), 1.7, px);
    const sh = smooth(-4, 16, qx - WT.x + (qy - WT.y) * 0.3);
    v = Math.max(v, stripe(bx * 0.7 + by * 0.7 + lw, 2.2 * D, 0.55 * sh * tp, px));
    for (const e of WT.eyes) {
      const de = Math.hypot(qx - e[0], qy - e[1]);
      if (de < WT.er * 1.6) {
        v = Math.max(v, aaE(de, WT.er * 1.2, px));
        if (Math.hypot(qx - e[0] + WT.er * 0.4, qy - e[1] + WT.er * 0.45) < WT.er * 0.42) v = 0;
      }
    }
    const ds = Math.hypot(qx - WT.sm.c[0], qy - WT.sm.c[1]);
    const ang = Math.atan2(qy - WT.sm.c[1], qx - WT.sm.c[0]);
    if (ang > WT.sm.a0 && ang < WT.sm.a1) v = Math.max(v, aaE(Math.abs(ds - WT.sm.r), 0.95, px));
    for (const ch of WT.ch) if (Math.hypot(qx - ch[0], qy - ch[1]) < WT.cr) v = Math.max(v, stripe(bx - by, 1.5, 0.45, px));
  } else if (qx > 50 && qx < 130 && qy > 56 && qy < 142 && (inPoly(WC.front, qx, qy) || inPoly(WC.top, qx, qy) || inPoly(WC.side, qx, qy))) {
    if (inPoly(WC.front, qx, qy)) {
      v = stripe(bx + lw, 2.5 * D, (0.24 + 0.32 * clamp01((qy - WC.front[0]![1]) / 56)) * tp, px);
      v = Math.max(v, aaE(distPoly(WC.front, qx, qy), 1.4, px));
    } else if (inPoly(WC.top, qx, qy)) {
      v = stripe(by + lw, 2.3 * D, 0.15 * tp, px);
      v = Math.max(v, aaE(distPoly(WC.top, qx, qy), 1.4, px));
    } else {
      v = stripe(0.629 * bx + 0.777 * by + lw, 2.2 * D, 0.74, px);
      v = Math.max(v, aaE(distPoly(WC.side, qx, qy), 1.4, px));
    }
  } else if (qy > yG(qx)) {
    const c = qy - yG(qx);
    v = c < 1.8 ? 1 : stripe(by - yG(bx) + lw * 0.5, 2.7 * D, (0.45 + 0.4 * clamp01(c / 28)) * tp, px);
    if ((qx > 62 && qx < 134 && c < 4.5) || (qx > 182 && qx < 232 && c < 3.5)) v = 1;
  } else if (qy > yH(qx)) {
    const c = qy - yH(qx);
    v = c < 1.3 ? 1 : stripe(by + lw, 2.4 * D, (0.22 + 0.25 * clamp01(c / 18)) * tp, px);
  } else {
    const d = Math.hypot(qx - 150, qy - 40);
    // 구름
    let cd = 1e9;
    for (const [cx, cy, r] of [
      [30, 34, 8],
      [41, 28, 10],
      [53, 33, 8],
      [238, 26, 7],
      [249, 21, 9],
      [260, 26, 7],
    ] as [number, number, number][])
      cd = Math.min(cd, Math.hypot(qx - cx, qy - cy) - r);
    const cloudBottom = qx < 140 ? 38 : 30;
    if (cd < 0 && qy < cloudBottom) {
      v = Math.max(aaE(-cd, 1.1, px), aaE(cloudBottom - qy, 1.1, px));
      v = Math.max(v, stripe(by + lw, 2.4, 0.12 * smooth(cloudBottom - 8, cloudBottom, qy), px));
    } else if (d < 12.5) v = d > 3 ? stripe(d, 3.2, 0.16, px) : 0;
    else if (d < 15.4) v = aaE(Math.abs(d - 13.9), 1.4, px);
    else {
      const a = Math.atan2(qy - 40, qx - 150);
      const ray = Math.floor((a + Math.PI) / (TAU / 22)) % 2 === 0;
      const dark = (0.1 + 0.62 * smooth(16, 200, d)) * (ray ? 0.3 : 1);
      v = stripe(Math.hypot(bx - 150, by - 40) + lw, 3 * D, dark * tp, px);
    }
  }
  v *= 1 - 0.25 * smooth(0.58, 0.8, fbm(bx * 0.012, by * 0.1, 40));
  return v;
}
function bakeWoodcut(f: Fit, R: number, D: number): { print: HTMLCanvasElement; block: HTMLCanvasElement } {
  const s = Math.min(f.s, 1.5);
  const W = Math.max(1, Math.round(f.w * s));
  const H = Math.max(1, Math.round(f.h * s));
  const px = 1 / (f.u * s);
  const ink = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const bx = (x / s - f.ox) / f.u;
      const by = (y / s - f.oy) / f.u;
      let v = woodInk(bx, by, R, D, px);
      if (v > 0.5 && hash2(x, y, 41) > 0.994) v *= 0.35;
      ink[y * W + x] = v;
    }
  }
  const print = bake(W, H, (x, y, c) => {
    const v = ink[y * W + x]! * 0.96;
    const bx = (x / s - f.ox) / f.u;
    const by = (y / s - f.oy) / f.u;
    const p = 0.97 + 0.06 * (fbm(bx * 0.06, by * 0.06, 2) - 0.5) + 0.03 * (vnoise(bx * 1.2, by * 0.3, 3) - 0.5);
    c[0] = lerp(238 * p, 27, v);
    c[1] = lerp(229 * p, 23, v);
    c[2] = lerp(209 * p, 21, v);
  });
  const block = bake(W, H, (x, y, c) => {
    const v = ink[y * W + (W - 1 - x)]!;
    const bx = (x / s - f.ox) / f.u;
    const by = (y / s - f.oy) / f.u;
    const gl = Math.sin(by * 0.9 + fbm(bx * 0.01, by * 0.05, 50) * 16);
    const wv = (0.86 + 0.08 * gl + 0.1 * (fbm(bx * 0.04, by * 0.3, 52) - 0.5)) * 0.84;
    const gloss = 18 * smooth(0.55, 0.85, fbm(bx * 0.03, by * 0.03, 51));
    c[0] = lerp(196 * wv, 36 + gloss, v);
    c[1] = lerp(150 * wv, 31 + gloss, v);
    c[2] = lerp(102 * wv, 29 + gloss, v);
  });
  return { print, block };
}
function makeWoodcut() {
  let R = 1;
  let D = 1;
  let peel = true;
  let cmp = false;
  let kW = '';
  let wc: { print: HTMLCanvasElement; block: HTMLCanvasElement } | null = null;
  const seal = (g: G): void => {
    g.save();
    g.translate(250, 152);
    g.rotate(0.05);
    const sq = wobbly(
      [
        [-9, -9],
        [9, -9],
        [9, 9],
        [-9, 9],
      ],
      true,
      5,
      0.5,
      0.4,
      1,
    );
    polyPath(g, sq);
    g.fillStyle = 'rgba(184,46,36,0.92)';
    g.fill();
    g.strokeStyle = '#ece2cc';
    g.lineWidth = 1;
    g.strokeRect(-6.6, -6.6, 13.2, 13.2);
    g.fillStyle = '#ece2cc';
    g.font = `900 12px ${F}`;
    g.textAlign = 'center';
    g.fillText('7', 0, 4.4);
    g.textAlign = 'left';
    g.restore();
  };
  const clean = (g: G, f: Fit): void => {
    const sky = g.createLinearGradient(0, 0, 0, f.h);
    sky.addColorStop(0, '#bfe0fb');
    sky.addColorStop(1, '#fdf3dc');
    g.fillStyle = sky;
    g.fillRect(0, 0, f.w, f.h);
    enter(g, f);
    g.strokeStyle = '#f2b632';
    g.lineWidth = 1.4;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      g.beginPath();
      g.moveTo(150 + Math.cos(a) * 19, 40 + Math.sin(a) * 19);
      g.lineTo(150 + Math.cos(a) * 26, 40 + Math.sin(a) * 26);
      g.stroke();
    }
    g.fillStyle = '#ffd34d';
    g.beginPath();
    g.arc(150, 40, 14, 0, TAU);
    g.fill();
    g.fillStyle = '#fff';
    for (const [cx, cy, r] of [
      [30, 34, 8],
      [41, 28, 10],
      [53, 33, 8],
      [238, 26, 7],
      [249, 21, 9],
      [260, 26, 7],
    ] as [number, number, number][]) {
      g.beginPath();
      g.arc(cx, cy, r, 0, TAU);
      g.fill();
    }
    const band = (fn: (x: number) => number, col: string): void => {
      g.beginPath();
      g.moveTo(-300, 400);
      for (let x = -300; x <= 600; x += 6) g.lineTo(x, fn(x));
      g.lineTo(600, 400);
      g.closePath();
      g.fillStyle = col;
      g.fill();
    };
    band(yH, '#9ccc7a');
    band(yG, '#5d9e48');
    cleanItems(g, [
      { k: 'cube', x: 92, y: 100, s: 56 },
      { k: 'tri', x: 206, y: 118, s: 46 },
    ]);
    g.fillStyle = '#c0392b';
    g.fillRect(241, 143, 18, 18);
    g.fillStyle = '#fff';
    g.font = `800 12px ${F}`;
    g.textAlign = 'center';
    g.fillText('7', 250, 156.4);
    g.textAlign = 'left';
    g.restore();
  };
  return {
    draw(g: G, w: number, h: number, t: number): void {
      reset(g);
      const f = fitOf(g, w, h);
      const kw = keyOf(f, R, D);
      if (kw !== kW) {
        wc = bakeWoodcut(f, R, D);
        kW = kw;
      }
      const tc = t % 8;
      const b = !peel ? 1 : tc < 3 ? ease(tc / 3) : tc < 5.5 ? 1 : tc < 7 ? 1 - ease((tc - 5.5) / 1.5) : 0;
      const xb = lerp(-0.06, 1.06, b) * w;
      const u = f.u;
      // 찍은 그림 (왼쪽)
      g.save();
      g.beginPath();
      g.rect(0, 0, xb, h);
      g.clip();
      g.drawImage(wc!.print, 0, 0, w, h);
      enter(g, f);
      seal(g);
      g.restore();
      g.restore();
      // 나무판 (오른쪽, 좌우 반대)
      if (xb < w) {
        g.save();
        g.beginPath();
        g.rect(xb, 0, w - xb, h);
        g.clip();
        g.drawImage(wc!.block, 0, 0, w, h);
        g.restore();
        if (xb > 0) {
          // 들린 종이 끝 (뒷면 · 그늘)
          const cw = 12 * u;
          const sg = g.createLinearGradient(xb, 0, xb + cw * 1.8, 0);
          sg.addColorStop(0, 'rgba(0,0,0,0.45)');
          sg.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = sg;
          g.fillRect(xb, 0, cw * 1.8, h);
          const pg = g.createLinearGradient(xb - cw, 0, xb, 0);
          pg.addColorStop(0, 'rgba(238,229,209,0)');
          pg.addColorStop(0.55, '#d9ccb0');
          pg.addColorStop(1, '#f6eedc');
          g.fillStyle = pg;
          g.fillRect(xb - cw, 0, cw, h);
        }
      }
      const pu = Math.min(u, 1.35);
      if (peel) {
        if (xb > 70 * u) pill(g, Math.min(xb, w) - 8 * pu, 8 * pu, '찍은 판화', 'r', pu, w);
        if (xb < w - 90 * u) pill(g, Math.max(xb, 0) + 8 * pu, 8 * pu, '깎은 나무판 (좌우 반대)', 'l', pu, w);
      }
      if (cmp) splitter(g, w, h, t, () => clean(g, f), '목판화');
    },
    controls: [
      { type: 'range', label: '거친 가장자리', min: 0, max: 2.5, step: 0.1, value: R, on: (v) => (R = v) },
      { type: 'range', label: '칼자국 간격', min: 0.7, max: 1.8, step: 0.05, value: D, on: (v) => (D = v) },
      { type: 'toggle', label: '나무판과 번갈아 보기', value: peel, on: (v) => (peel = v) },
      cmpToggle(cmp, (v) => (cmp = v)),
    ] as Control[],
  };
}

/* ═════════════ i337 손글씨 글자 흔들기 ═════════════ */

function roundRectPts(x: number, y: number, w: number, h: number, r: number): P[] {
  const o: P[] = [];
  const cs: [number, number, number][] = [
    [x + w - r, y + r, -Math.PI / 2],
    [x + w - r, y + h - r, 0],
    [x + r, y + h - r, Math.PI / 2],
    [x + r, y + r, Math.PI],
  ];
  for (const [cx, cy, a0] of cs) for (let i = 0; i <= 6; i++) o.push([cx + Math.cos(a0 + (i / 6) * (Math.PI / 2)) * r, cy + Math.sin(a0 + (i / 6) * (Math.PI / 2)) * r]);
  return o;
}
function makeHand() {
  let rotS = 1;
  let sizeS = 1;
  let baseS = 1;
  let seed = 1;
  let kP = '';
  let sheet: HTMLCanvasElement | null = null;
  const INK = '#24324a';
  return {
    draw(g: G, w: number, h: number, t: number): void {
      reset(g);
      const f = fitOf(g, w, h);
      const kp = keyOf(f);
      if (kp !== kP) {
        sheet = bakeSheet(f, [251, 247, 236], 7 * f.u);
        kP = kp;
      }
      g.drawImage(sheet!, 0, 0, w, h);
      const tc = t % 5.5;
      const K = tc < 0.8 ? 0 : tc < 2.2 ? ease((tc - 0.8) / 1.4) : tc < 4.6 ? 1 : 1 - ease((tc - 4.6) / 0.9);
      const kf = (i: number, n: number): number => clamp01(K * 1.5 - (i / Math.max(1, n)) * 0.5);
      const j: Jit = { rot: rotS, size: sizeS, base: baseS, space: sizeS };
      enter(g, f);
      // 말풍선 — 반듯한 둥근 네모 → 손으로 그린 테두리
      const bub = [...roundRectPts(32, 26, 216, 44, 15)];
      const tailAt = bub.findIndex((p) => p[1] > 69 && p[0] < 90);
      const withTail = [...bub.slice(0, Math.max(1, tailAt)), [76, 70] as P, [64, 82] as P, [64, 70] as P, ...bub.slice(Math.max(1, tailAt))];
      const q = wobbly(withTail, true, seed * 7, 1.5 * K * Math.max(rotS, 0.3), 0.07, 2);
      polyPath(g, q, false);
      g.fillStyle = 'rgba(255,255,255,0.78)';
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = lerp(1.1, 1.4, K);
      g.lineJoin = 'round';
      g.lineCap = 'round';
      g.stroke();
      const st = { fill: INK, weight: 600, stroke: 0.5 * K, al: 'center' as const, k: kf };
      handText(g, '수학은 정말 재미있어!', 140, 55, 20, seed * 11 + 1, j, st);
      const r2 = handText(g, '7 + 5 = 12', 140, 113, 32, seed * 11 + 2, j, st);
      if (K > 0) {
        g.globalAlpha = K;
        const ul: P[] = [];
        for (let x = r2.x0; x <= r2.x1; x += 3) ul.push([x, 121 + Math.sin(x * 0.15) * 1.2]);
        polyPath(g, wobbly(ul, false, seed + 3, 0.8, 0.1), false);
        g.lineWidth = 1.3;
        g.stroke();
        g.globalAlpha = 1;
      }
      handText(g, '7  7  7  7  7', 140, 154, 24, seed * 11 + 3, { rot: rotS * 1.3, size: sizeS * 1.3, base: baseS * 1.2, space: sizeS }, st);
      g.restore();
      const u = f.u;
      pill(g, 14 * Math.min(u, 1.35), 12 * Math.min(u, 1.35), K < 0.5 ? '타자 글씨' : '손글씨', 'l', Math.min(u, 1.35), w, K < 0.5 ? 'rgba(60,70,90,0.8)' : 'rgba(124,58,237,0.85)');
    },
    controls: [
      { type: 'range', label: '기울기', min: 0, max: 2.5, step: 0.1, value: rotS, on: (v) => (rotS = v) },
      { type: 'range', label: '크기 흔들림', min: 0, max: 2.5, step: 0.1, value: sizeS, on: (v) => (sizeS = v) },
      { type: 'range', label: '기준선 흔들림', min: 0, max: 2.5, step: 0.1, value: baseS, on: (v) => (baseS = v) },
      { type: 'button', label: '다른 손글씨', on: () => (seed += 1) },
    ] as Control[],
  };
}

/* ═════════════ i338 그려지는 애니 ═════════════ */

interface Stroke {
  pts: P[];
  cum: number[];
  len: number;
  seed: number;
  clip?: P[];
  col?: string;
  dot?: { p: P; r: number };
}
const mkS = (pts: P[], seed: number, extra: Partial<Stroke> = {}): Stroke => {
  const cum = cumLen(pts);
  return { pts, cum, len: cum[cum.length - 1]!, seed, ...extra };
};
interface StageAt {
  idx: number;
  d: number;
  tip: P;
  travel: boolean;
}
function stageAt(list: Stroke[], p: number): StageAt {
  const tw = 0.35;
  let total = 0;
  for (let i = 0; i < list.length; i++) {
    total += list[i]!.len;
    if (i > 0) {
      const a = list[i - 1]!.pts[list[i - 1]!.pts.length - 1]!;
      const b = list[i]!.pts[0]!;
      total += Math.hypot(b[0] - a[0], b[1] - a[1]) * tw;
    }
  }
  let rem = p * total;
  let prev: P = list[0]!.pts[0]!;
  for (let i = 0; i < list.length; i++) {
    const s = list[i]!;
    if (i > 0) {
      const tr = Math.hypot(s.pts[0]![0] - prev[0], s.pts[0]![1] - prev[1]) * tw;
      if (rem < tr) {
        const k = tr > 0 ? rem / tr : 1;
        return { idx: i, d: 0, tip: [lerp(prev[0], s.pts[0]![0], k), lerp(prev[1], s.pts[0]![1], k)], travel: true };
      }
      rem -= tr;
    }
    if (rem < s.len) {
      const part = upTo(s.pts, s.cum, rem);
      return { idx: i, d: rem, tip: part[part.length - 1]!, travel: false };
    }
    rem -= s.len;
    prev = s.pts[s.pts.length - 1]!;
  }
  return { idx: list.length, d: 0, tip: prev, travel: true };
}
function tool(g: G, kind: 'pencil' | 'pen' | 'marker', p: P, col: string, lift: number): void {
  g.save();
  g.translate(p[0], p[1] - lift * 2.5);
  const ang = -0.95;
  g.save();
  g.translate(5 + lift * 5, 6 + lift * 6);
  g.rotate(ang);
  g.fillStyle = 'rgba(0,0,0,0.16)';
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(10, -3.4);
  g.lineTo(74, -3.4);
  g.lineTo(74, 3.4);
  g.lineTo(10, 3.4);
  g.closePath();
  g.fill();
  g.restore();
  g.rotate(ang);
  if (kind === 'pencil') {
    g.fillStyle = '#ebc79f';
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(10, -3.2);
    g.lineTo(10, 3.2);
    g.closePath();
    g.fill();
    g.fillStyle = '#3b3b40';
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(3.2, -1);
    g.lineTo(3.2, 1);
    g.closePath();
    g.fill();
    g.fillStyle = '#f6c51d';
    g.fillRect(10, -3.2, 52, 2.1);
    g.fillStyle = '#ffdb5c';
    g.fillRect(10, -1.1, 52, 2.2);
    g.fillStyle = '#d49d00';
    g.fillRect(10, 1.1, 52, 2.1);
    const mg = g.createLinearGradient(0, -3.3, 0, 3.3);
    mg.addColorStop(0, '#e9ecef');
    mg.addColorStop(0.5, '#9aa1a9');
    mg.addColorStop(1, '#d6dade');
    g.fillStyle = mg;
    g.fillRect(62, -3.3, 6, 6.6);
    g.fillStyle = '#f08c9a';
    g.beginPath();
    g.roundRect(68, -3.1, 6, 6.2, 1.6);
    g.fill();
  } else if (kind === 'pen') {
    g.fillStyle = '#c9ccd2';
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(7, -2.4);
    g.lineTo(7, 2.4);
    g.closePath();
    g.fill();
    g.fillStyle = '#1b1e28';
    g.beginPath();
    g.roundRect(7, -3, 66, 6, 2.5);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.fillRect(9, -2.4, 62, 1);
    g.fillStyle = '#c0c4cc';
    g.fillRect(48, -4.4, 20, 1.6);
  } else {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, -1.2);
    g.lineTo(4, -2.6);
    g.lineTo(4, 2.6);
    g.lineTo(0, 1.6);
    g.closePath();
    g.fill();
    g.fillStyle = '#d8dade';
    g.fillRect(4, -3.4, 6, 6.8);
    const bg = g.createLinearGradient(0, -4, 0, 4);
    bg.addColorStop(0, '#ffffff');
    bg.addColorStop(1, '#c9ccd2');
    g.fillStyle = bg;
    g.beginPath();
    g.roundRect(10, -4, 54, 8, 2);
    g.fill();
    g.fillStyle = col;
    g.fillRect(46, -4, 6, 8);
    g.beginPath();
    g.roundRect(64, -4.2, 9, 8.4, 2.5);
    g.fill();
  }
  g.restore();
}
function makeDrawAnim() {
  let speed = 1;
  let showTool = true;
  let eraseSk = true;
  let clock = 0;
  let kP = '';
  let sheet: HTMLCanvasElement | null = null;
  // 그릴 것: 원그래프 · 웃는 세모 · 정육면체
  const PC: P = [62, 98];
  const PR = 30;
  const tr = tri(146, 100, 72);
  const cb = cube(232, 102, 40);
  const slices = pieSlices(PC[0], PC[1], PR);
  const radii: P[][] = [-Math.PI / 2, Math.PI / 2, Math.PI / 2 + TAU / 3].map((a) => [PC, [PC[0] + Math.cos(a) * PR, PC[1] + Math.sin(a) * PR]]);
  const r = rng(3);
  const SK: Stroke[] = [];
  const INK: Stroke[] = [];
  const FILL: Stroke[] = [];
  let sd = 1;
  const skEdges = (pts: P[], closed: boolean, passes = 2): void => {
    const n = closed ? pts.length : pts.length - 1;
    for (let pass = 0; pass < passes; pass++)
      for (let i = 0; i < n; i++) SK.push(mkS(wobbly(over(pts[i]!, pts[(i + 1) % pts.length]!, 1 + r() * 3, 1.5 + r() * 3.5), false, sd++, 0.9, 0.1, 1.5), sd));
  };
  // ① 연필 밑그림 — 넘치게 · 두 번
  SK.push(mkS(wobbly(arcPts(PC[0], PC[1], PR + 1, -2, -2 + TAU + 0.5, 50), false, sd++, 1.4, 0.06, 1.5), sd));
  SK.push(mkS(wobbly(arcPts(PC[0], PC[1], PR - 0.5, -1.2, -1.2 + TAU + 0.3, 50), false, sd++, 1.3, 0.06, 1.5), sd));
  radii.forEach((l) => SK.push(mkS(wobbly(over(l[0]!, l[1]!, 0, 2.5), false, sd++, 0.8, 0.1, 1.5), sd)));
  skEdges(tr.pts, true);
  tr.eyes.forEach((e) => SK.push(mkS(wobbly(arcPts(e[0], e[1], tr.er * 1.4, 0, TAU + 0.6, 14), false, sd++, 0.5, 0.2, 1), sd)));
  SK.push(mkS(wobbly(arcPts(tr.sm.c[0], tr.sm.c[1], tr.sm.r, tr.sm.a0 - 0.2, tr.sm.a1 + 0.2, 12), false, sd++, 0.6, 0.1, 1.5), sd));
  skEdges(cb.front, true, 1);
  skEdges([cb.front[0]!, cb.top[3]!, cb.top[2]!, cb.side[2]!, cb.front[2]!], false, 1);
  skEdges([cb.front[1]!, cb.top[2]!], false, 1);
  // ② 펜 선 — 한 번에 또렷하게
  INK.push(mkS(wobbly(arcPts(PC[0], PC[1], PR, -Math.PI / 2, -Math.PI / 2 + TAU, 60), false, sd++, 0.35, 0.08, 1.2), sd));
  radii.forEach((l) => INK.push(mkS(resample(l, false, 1.2), sd++)));
  INK.push(mkS(wobbly(tr.pts, true, sd++, 0.3, 0.08, 1.2), sd));
  tr.eyes.forEach((e) => INK.push(mkS(arcPts(e[0], e[1], tr.er, 0, TAU, 14), sd++, { dot: { p: e, r: tr.er } })));
  INK.push(mkS(arcPts(tr.sm.c[0], tr.sm.c[1], tr.sm.r, tr.sm.a0, tr.sm.a1, 14), sd++));
  INK.push(mkS(wobbly(cb.front, true, sd++, 0.3, 0.08, 1.2), sd));
  INK.push(mkS(wobbly([cb.front[0]!, cb.top[3]!, cb.top[2]!, cb.front[1]!], false, sd++, 0.3, 0.08, 1.2), sd));
  INK.push(mkS(wobbly([cb.top[2]!, cb.side[2]!, cb.front[2]!], false, sd++, 0.3, 0.08, 1.2), sd));
  // ③ 색칠 — 마커로 지그재그
  slices.forEach((sl, i) => FILL.push(mkS(zigzag(sl.pts, -0.7 + i * 0.5, 2.6), sd++, { clip: sl.pts, col: sl.c })));
  FILL.push(mkS(zigzag(tr.pts, -0.8, 2.8), sd++, { clip: tr.pts, col: COL.yellow }));
  tr.ch.forEach((c) => {
    const cp = arcPts(c[0], c[1], tr.cr * 1.1, 0, TAU, 12);
    FILL.push(mkS(zigzag(cp, 0.6, 1.4), sd++, { clip: cp, col: COL.pink }));
  });
  (
    [
      [cb.front, COL.front, -0.6],
      [cb.top, COL.top, 0.1],
      [cb.side, COL.side, -1.3],
    ] as [P[], string, number][]
  ).forEach(([p, c, a]) => FILL.push(mkS(zigzag(p, a, 2.6), sd++, { clip: p, col: c })));
  const S1 = 2.4;
  const S2 = 3.0;
  const S3 = 2.8;
  const HOLD = 1.8;
  const FADE = 0.8;
  const TOTAL = S1 + S2 + S3 + HOLD + FADE;
  const drawList = (_g: G, list: Stroke[], st: StageAt, fn: (s: Stroke, d: number) => void): void => {
    for (let i = 0; i < list.length && i <= st.idx; i++) {
      if (i < st.idx) fn(list[i]!, Infinity);
      else if (!st.travel) fn(list[i]!, st.d);
    }
  };
  const chips = (g: G, f: Fit, stage: number): void => {
    const u = Math.min(f.u, 1.35);
    const labs = ['① 연필 밑그림', '② 펜 선', '③ 색칠'];
    g.font = `700 ${8.5 * u}px ${F}`;
    const ws = labs.map((l) => g.measureText(l).width + 12 * u);
    const gap = 5 * u;
    let x = f.w / 2 - (ws.reduce((a, b) => a + b, 0) + gap * 2) / 2;
    labs.forEach((l, i) => {
      const hh = 14 * u;
      const y = f.oy + 6 * f.u + 5 * u;
      g.fillStyle = i === stage ? 'rgba(124,58,237,0.92)' : i < stage ? 'rgba(40,48,64,0.75)' : 'rgba(40,48,64,0.35)';
      g.beginPath();
      g.roundRect(x, y, ws[i]!, hh, hh / 2);
      g.fill();
      g.fillStyle = i <= stage ? '#fff' : 'rgba(255,255,255,0.75)';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(l + (i < stage ? ' ✓' : ''), x + ws[i]! / 2, y + hh / 2 + 0.5 * u);
      x += ws[i]! + gap;
    });
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
  };
  return {
    draw(g: G, w: number, h: number, _t: number, dt: number): void {
      reset(g);
      clock += Math.min(0.1, Math.max(0, dt)) * speed;
      const f = fitOf(g, w, h);
      const kp = keyOf(f);
      if (kp !== kP) {
        sheet = bakeSheet(f, [252, 251, 247], 6 * f.u);
        kP = kp;
      }
      g.drawImage(sheet!, 0, 0, w, h);
      const T = clock % TOTAL;
      const p1 = clamp01(T / S1);
      const p2 = clamp01((T - S1) / S2);
      const p3 = clamp01((T - S1 - S2) / S3);
      const fade = clamp01((T - (S1 + S2 + S3 + HOLD)) / FADE);
      const st1 = stageAt(SK, p1);
      const st2 = stageAt(INK, p2);
      const st3 = stageAt(FILL, p3);
      enter(g, f);
      g.globalAlpha = 1 - fade;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      // 연필 밑그림 (색칠할 때 지우개로 옅어짐)
      const skA = eraseSk ? 1 - 0.85 * smooth(0, 0.25, p3) : 1;
      g.globalAlpha = (1 - fade) * skA;
      g.strokeStyle = 'rgba(80,80,88,0.55)';
      g.lineWidth = 0.7;
      drawList(g, SK, st1, (s, d) => {
        polyPath(g, d === Infinity ? s.pts : upTo(s.pts, s.cum, d), false);
        g.stroke();
      });
      // 색칠
      g.globalAlpha = 1 - fade;
      if (p3 > 0) {
        g.globalCompositeOperation = 'multiply';
        drawList(g, FILL, st3, (s, d) => {
          g.save();
          polyPath(g, s.clip!);
          g.clip();
          g.strokeStyle = s.col!;
          g.globalAlpha = (1 - fade) * 0.85;
          g.lineWidth = 3.8;
          polyPath(g, d === Infinity ? s.pts : upTo(s.pts, s.cum, d), false);
          g.stroke();
          g.restore();
        });
        g.globalCompositeOperation = 'source-over';
      }
      // 펜 선
      if (p2 > 0)
        drawList(g, INK, st2, (s, d) => {
          taper(g, s.pts, 1.7, 0.55, s.seed, '#1a1a1e', d);
          if (s.dot && d === Infinity) {
            g.fillStyle = '#1a1a1e';
            g.beginPath();
            g.arc(s.dot.p[0], s.dot.p[1], s.dot.r, 0, TAU);
            g.fill();
          }
        });
      g.globalAlpha = 1;
      if (showTool && fade === 0) {
        if (p1 < 1) tool(g, 'pencil', st1.tip, '#000', st1.travel ? 1 : 0);
        else if (p2 < 1) tool(g, 'pen', st2.tip, '#000', st2.travel ? 1 : 0);
        else if (p3 < 1) tool(g, 'marker', st3.tip, FILL[Math.min(st3.idx, FILL.length - 1)]!.col!, st3.travel ? 1 : 0);
      }
      g.restore();
      chips(g, f, p1 < 1 ? 0 : p2 < 1 ? 1 : p3 < 1 ? 2 : 3);
    },
    controls: [
      { type: 'range', label: '그리는 속도', min: 0.3, max: 2.5, step: 0.1, value: speed, on: (v) => (speed = v) },
      { type: 'toggle', label: '도구(연필 · 펜 · 마커) 보이기', value: showTool, on: (v) => (showTool = v) },
      { type: 'toggle', label: '색칠할 때 밑그림 지우기', value: eraseSk, on: (v) => (eraseSk = v) },
      { type: 'button', label: '처음부터 다시 그리기', on: () => (clock = 0) },
    ] as Control[],
  };
}

/* ═════════════ i339 설계도 · 모눈 도면 (블루프린트) ═════════════ */

function bakeBlue(f: Fit, wear: number): HTMLCanvasElement {
  const s = f.s;
  const cv = bake(f.w * s, f.h * s, (x, y, c) => {
    const fx = x / s;
    const fy = y / s;
    const bx = (fx - f.ox) / f.u;
    const by = (fy - f.oy) / f.u;
    const k = clamp01((fx / f.w) * 0.5 + (fy / f.h) * 0.5);
    const m = fbm(bx * 0.02, by * 0.02, 61);
    const fib = vnoise(bx * 1.2, by * 0.25, 62);
    let r = lerp(34, 20, k);
    let gg = lerp(90, 62, k);
    let b = lerp(162, 124, k);
    const v = 0.94 + 0.14 * (m - 0.5) + 0.04 * (fib - 0.5);
    r *= v;
    gg *= v;
    b *= v;
    let e = smooth(0.62, 0.86, fbm(bx * 0.01 + 7, by * 0.013, 9)) * 0.14 * wear;
    const dx = fx / f.w - 0.5;
    const dy = fy / f.h - 0.5;
    e += Math.pow(Math.max(Math.abs(dx), Math.abs(dy)) * 2, 6) * 0.18 * wear;
    if (hash2(x, y, 63) > 0.996) e += 0.15;
    c[0] = lerp(r, 120, e);
    c[1] = lerp(gg, 165, e);
    c[2] = lerp(b, 215, e);
  });
  const g = c2(cv);
  g.scale(s, s);
  const u = f.u;
  const x0 = Math.floor(-f.ox / u / 5) * 5;
  const y0 = Math.floor(-f.oy / u / 5) * 5;
  for (let bx = x0; f.ox + bx * u <= f.w; bx += 5) {
    g.strokeStyle = bx % 25 === 0 ? 'rgba(210,232,255,0.22)' : 'rgba(200,225,255,0.09)';
    g.lineWidth = bx % 25 === 0 ? Math.max(0.8, 0.6 * u) : Math.max(0.5, 0.35 * u);
    g.beginPath();
    g.moveTo(f.ox + bx * u, 0);
    g.lineTo(f.ox + bx * u, f.h);
    g.stroke();
  }
  for (let by = y0; f.oy + by * u <= f.h; by += 5) {
    g.strokeStyle = by % 25 === 0 ? 'rgba(210,232,255,0.22)' : 'rgba(200,225,255,0.09)';
    g.lineWidth = by % 25 === 0 ? Math.max(0.8, 0.6 * u) : Math.max(0.5, 0.35 * u);
    g.beginPath();
    g.moveTo(0, f.oy + by * u);
    g.lineTo(f.w, f.oy + by * u);
    g.stroke();
  }
  // 접은 자국
  const cx = f.w * 0.5;
  const cy = f.h * 0.5;
  const crease = (vert: boolean): void => {
    const gr = vert ? g.createLinearGradient(cx - 6 * u, 0, cx + 6 * u, 0) : g.createLinearGradient(0, cy - 6 * u, 0, cy + 6 * u);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(0.45, `rgba(0,0,30,${0.14 * wear})`);
    gr.addColorStop(0.5, `rgba(255,255,255,${0.14 * wear})`);
    gr.addColorStop(0.62, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    if (vert) g.fillRect(cx - 6 * u, 0, 12 * u, f.h);
    else g.fillRect(0, cy - 6 * u, f.w, 12 * u);
  };
  crease(true);
  crease(false);
  return cv;
}
function makeBlueprint() {
  let wob = 0.6;
  let wear = 1;
  let cmp = true;
  let kB = '';
  let paper: HTMLCanvasElement | null = null;
  interface M {
    col: string;
    glow: string | null;
    wob: number;
    hand: number;
    fill: string;
  }
  const S = 17;
  const NX = 30;
  const NY = 28;
  const N = (c: number, r: number): P => [NX + c * S, NY + r * S];
  const content = (g: G, m: M, ff: number): void => {
    let sd = 1;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const L = (pts: P[], w = 0.9, closed = false, dash: number[] | null = null): void => {
      const q = wobbly(pts, closed, sd++, m.wob, 0.07, 2);
      if (dash) g.setLineDash(dash);
      if (m.glow) {
        g.strokeStyle = m.glow;
        g.lineWidth = w * 2.8;
        polyPath(g, q, false);
        g.stroke();
      }
      g.strokeStyle = m.col;
      g.lineWidth = w;
      polyPath(g, q, false);
      g.stroke();
      g.setLineDash([]);
    };
    const T = (s: string, x: number, y: number, size: number, al: 'left' | 'center' | 'right' = 'left'): void => {
      handText(g, s, x, y, size, sd++ * 7, m.hand, { fill: m.col, weight: 500, al });
    };
    const head = (b: P, a: P): void => {
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      g.fillStyle = m.col;
      g.beginPath();
      g.moveTo(b[0], b[1]);
      g.lineTo(b[0] - Math.cos(ang - 0.35) * 3, b[1] - Math.sin(ang - 0.35) * 3);
      g.lineTo(b[0] - Math.cos(ang + 0.35) * 3, b[1] - Math.sin(ang + 0.35) * 3);
      g.closePath();
      g.fill();
    };
    const dim = (a: P, b: P, off: number, lab: string): void => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1;
      const ux = -dy / l;
      const uy = dx / l;
      const A: P = [a[0] + ux * off, a[1] + uy * off];
      const B: P = [b[0] + ux * off, b[1] + uy * off];
      const sg = Math.sign(off);
      L([[a[0] + ux * sg * 1.2, a[1] + uy * sg * 1.2], [A[0] + ux * sg * 2, A[1] + uy * sg * 2]], 0.45);
      L([[b[0] + ux * sg * 1.2, b[1] + uy * sg * 1.2], [B[0] + ux * sg * 2, B[1] + uy * sg * 2]], 0.45);
      L([A, B], 0.55);
      head(A, B);
      head(B, A);
      let ang = Math.atan2(dy, dx);
      if (ang > Math.PI / 2) ang -= Math.PI;
      if (ang < -Math.PI / 2) ang += Math.PI;
      g.save();
      g.translate((A[0] + B[0]) / 2 + ux * sg * 3.6, (A[1] + B[1]) / 2 + uy * sg * 3.6);
      g.rotate(ang);
      T(lab, 0, 2.2, 6.4, 'center');
      g.restore();
    };
    // 전개도 (자르는 선 = 실선, 접는 선 = 점선)
    const outline: P[] = [N(1, 0), N(2, 0), N(2, 2), N(3, 2), N(3, 3), N(2, 3), N(2, 4), N(1, 4), N(1, 3), N(0, 3), N(0, 2), N(1, 2)];
    polyPath(g, outline);
    g.fillStyle = m.fill;
    g.fill();
    // 풀칠 날개
    const tab = (a: P, b: P, out: P): void => {
      const pts: P[] = [a, [lerp(a[0], b[0], 0.2) + out[0], lerp(a[1], b[1], 0.2) + out[1]], [lerp(a[0], b[0], 0.8) + out[0], lerp(a[1], b[1], 0.8) + out[1]], b];
      L(pts, 0.6, false, [1.6, 1.4]);
    };
    tab(N(1, 0), N(1, 1), [-4, 0]);
    tab(N(2, 2), N(3, 2), [0, -4]);
    tab(N(2, 4), N(1, 4), [0, 4]);
    L(outline, 1.05, true);
    for (const [a, b] of [
      [N(1, 1), N(2, 1)],
      [N(1, 2), N(2, 2)],
      [N(1, 2), N(1, 3)],
      [N(2, 2), N(2, 3)],
      [N(1, 3), N(2, 3)],
    ] as [P, P][])
      L([a, b], 0.7, false, [2.2, 1.6]);
    const lab = (s: string, c: number, r: number): void => T(s, NX + (c + 0.5) * S, NY + (r + 0.5) * S + 2, 5.6, 'center');
    lab('윗면', 1, 0);
    lab('뒷면', 1, 1);
    lab('밑면', 1, 2);
    lab('옆', 0, 2);
    lab('옆', 2, 2);
    lab('앞면', 1, 3);
    dim(N(0, 0), N(0, 4), 9, '12 cm');
    dim(N(1, 4), N(2, 4), 9, '3 cm');
    // 주석 (지시선 + 손글씨)
    L([[NX + 1.6 * S, NY + 2 * S], [96, 52]], 0.5);
    head([NX + 1.6 * S, NY + 2 * S], [96, 52]);
    T('접는 선', 98, 54, 7);
    L([[NX + 3 * S, NY + 2.6 * S], [96, 80]], 0.5);
    head([NX + 3 * S, NY + 2.6 * S], [96, 80]);
    T('자르는 선', 98, 82, 7);
    T('겉넓이 = 6 × 3 × 3', 20, 132, 8.5);
    T('= 54 cm²', 52, 145, 8.5);
    // 접히는 정육면체 (등각 투영)
    const S3 = 22;
    const O: P = [205, 84];
    const pr = (x: number, y: number, z: number): P => [O[0] + (x - z) * 0.866 * S3, O[1] + ((x + z) * 0.5 - y) * S3];
    const th = ff * (Math.PI / 2);
    const c = Math.cos(th);
    const sn = Math.sin(th);
    const c2v = Math.cos(2 * th);
    const s2v = Math.sin(2 * th);
    const faces: [number, number, number][][] = [
      [
        [0, 0, 0],
        [1, 0, 0],
        [1, 0, 1],
        [0, 0, 1],
      ],
      [
        [0, 0, 0],
        [1, 0, 0],
        [1, sn, -c],
        [0, sn, -c],
      ],
      [
        [0, 0, 1],
        [1, 0, 1],
        [1, sn, 1 + c],
        [0, sn, 1 + c],
      ],
      [
        [0, 0, 0],
        [0, 0, 1],
        [-c, sn, 1],
        [-c, sn, 0],
      ],
      [
        [1, 0, 0],
        [1, 0, 1],
        [1 + c, sn, 1],
        [1 + c, sn, 0],
      ],
      [
        [0, sn, 1 + c],
        [1, sn, 1 + c],
        [1, sn + s2v, 1 + c + c2v],
        [0, sn + s2v, 1 + c + c2v],
      ],
    ];
    faces
      .map((fc) => ({ fc, z: fc.reduce((a, p) => a + p[0] + p[1] + p[2], 0) }))
      .sort((a, b) => a.z - b.z)
      .forEach(({ fc }) => {
        const pts = fc.map((p) => pr(p[0], p[1], p[2]));
        polyPath(g, pts);
        g.fillStyle = m.fill;
        g.fill();
        L(pts, 0.95, true);
      });
    const dA = smooth(0.9, 1, ff);
    if (dA > 0) {
      g.globalAlpha = dA;
      dim(pr(0, 0, 1), pr(1, 0, 1), 7, '3 cm');
      dim(pr(1, 1, 1), pr(1, 0, 1), -7, '3 cm');
      g.globalAlpha = 1;
    }
    // 표제란
    L(
      [
        [192, 140],
        [272, 140],
        [272, 170],
        [192, 170],
      ],
      0.8,
      true,
    );
    L([[192, 153], [272, 153]], 0.5);
    L([[236, 153], [236, 170]], 0.5);
    T('정육면체 전개도', 196, 149.5, 7);
    T('축척 1:1', 196, 164, 6);
    T('도면 07', 240, 164, 6);
  };
  return {
    draw(g: G, w: number, h: number, t: number): void {
      reset(g);
      const f = fitOf(g, w, h);
      const kb = keyOf(f, wear);
      if (kb !== kB) {
        paper = bakeBlue(f, wear);
        kB = kb;
      }
      g.drawImage(paper!, 0, 0, w, h);
      const tc = t % 7;
      const ff = tc < 1 ? 0 : tc < 3 ? ease((tc - 1) / 2) : tc < 5 ? 1 : tc < 6.5 ? 1 - ease((tc - 5) / 1.5) : 0;
      enter(g, f);
      content(g, { col: 'rgba(238,246,255,0.94)', glow: 'rgba(190,225,255,0.16)', wob, hand: 1, fill: 'rgba(28,84,160,0.55)' }, ff);
      g.restore();
      if (cmp)
        splitter(
          g,
          w,
          h,
          t,
          () => {
            g.fillStyle = '#fbfcfd';
            g.fillRect(0, 0, w, h);
            enter(g, f);
            g.strokeStyle = 'rgba(30,41,59,0.07)';
            g.lineWidth = 0.4;
            g.beginPath();
            for (let x = -200; x < 480; x += 5) {
              g.moveTo(x, -200);
              g.lineTo(x, 400);
            }
            for (let y = -200; y < 400; y += 5) {
              g.moveTo(-200, y);
              g.lineTo(480, y);
            }
            g.stroke();
            content(g, { col: '#1e293b', glow: null, wob: 0, hand: 0, fill: 'rgba(226,232,240,0.85)' }, ff);
            g.restore();
          },
          '설계도',
        );
    },
    controls: [
      { type: 'range', label: '손떨림', min: 0, max: 1.6, step: 0.05, value: wob, on: (v) => (wob = v) },
      { type: 'range', label: '종이 낡음 (얼룩 · 접은 자국)', min: 0, max: 2, step: 0.1, value: wear, on: (v) => (wear = v) },
      cmpToggle(cmp, (v) => (cmp = v)),
    ] as Control[],
  };
}

/* ═════════════ 등록 ═════════════ */

export const DEMOS: DemoMap = {
  i332: { kind: '2d', caption: '색종이를 찢어 붙인 듯 — 찢긴 흰 테두리 · 종이 결 · 그림자 · 살짝 기운 조각 (가르는 선 왼쪽은 반듯한 원본)', make: makeCollage },
  i333: { kind: '2d', caption: '분필 결이 끊긴 선 · 문지른 번짐 — 풀이를 쓰고 지우면 흐릿한 지운 자국이 남아요', make: makeChalk },
  i334: { kind: '2d', caption: '줄 공책 위 파란 볼펜 낙서 — 겹쳐 그은 선 · 빗금 · 화살표 · 동그라미 · 별 (왼쪽은 반듯한 원본)', make: makeNotebook },
  i335: { kind: '2d', caption: '굵기가 변하는 펜 선 + 점 스크린톤 그늘 + 집중선 — 「두둥!」 하는 만화 한 컷', make: makeManga },
  i336: { kind: '2d', caption: '칼로 판 홈 같은 흑백 선 · 거친 가장자리 — 깎은 나무판(좌우 반대)을 찍으면 판화가 돼요', make: makeWoodcut },
  i337: { kind: '2d', caption: '글자마다 기울기 · 크기 · 기준선을 살짝 달리하면 타자 글씨가 손글씨로 — 같은 7도 매번 달라요', make: makeHand },
  i338: { kind: '2d', caption: '① 연필 밑그림 → ② 펜 선 → ③ 색칠 — 도구 끝이 선을 따라가며 그리는 순서 자체가 연출', make: makeDrawAnim },
  i339: { kind: '2d', caption: '파란 도면 위 흰 선 · 치수선 · 화살표 · 손글씨 주석 — 정육면체 전개도가 접혀요', make: makeBlueprint },
};

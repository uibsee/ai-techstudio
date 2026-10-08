import type * as THREE from 'three';
import type { Control, DemoMap } from './types';

/**
 * 견본 — 지도 · 맵 B : 길찾기 · 이동 (i264 ~ i270) · 지도 보기 · 표현 (i271 ~ i281)
 * 길찾기는 한 걸음씩 보여 준다 (열린 칸 노랑 · 닫힌 칸 파랑 · 끝나면 길 긋기 → 새 문제).
 * 2D 는 캔버스, 바뀌지 않는 바닥은 화면 밖 캔버스(Layer)에 한 번만 그려 둔다. 3D 는 디오라마 · 월드 맵 · 등고선 지형.
 */

type G = CanvasRenderingContext2D;
type V2 = [number, number];
const F = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
const HAND = '"Gaegu", "Nanum Pen Script", "Gowun Dodum", "Comic Sans MS", cursive';
const TAU = Math.PI * 2;
const SQ2 = Math.SQRT2;

const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
const clamp01 = (x: number): number => clamp(x, 0, 1);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const smooth = (e0: number, e1: number, x: number): number => {
  const v = clamp01((x - e0) / (e1 - e0));
  return v * v * (3 - 2 * v);
};
const ease = (k: number): number => smooth(0, 1, k);
const scaleOf = (w: number, h: number): number => Math.min(w / 280, h / 175);

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
function fbm(x: number, y: number, s = 0, oct = 4): number {
  let a = 0.5;
  let f = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += vnoise(x * f, y * f, s + o * 17) * a;
    norm += a;
    a *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}
function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
const dprOf = (g: G): number => Math.max(1, Math.min(3, g.getTransform().a || 1));
function mk(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}
/** 바뀌지 않는 층 — 열쇠가 같으면 다시 그리지 않는다 */
class Layer {
  c: HTMLCanvasElement | null = null;
  key = '';
  get(key: string, w: number, h: number, dpr: number, paint: (g: G) => void): HTMLCanvasElement {
    if (!this.c || key !== this.key) {
      this.c = mk(w * dpr, h * dpr);
      const lg = this.c.getContext('2d')!;
      lg.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint(lg);
      this.key = key;
    }
    return this.c;
  }
}
function reset(g: G): void {
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.imageSmoothingEnabled = true;
  g.lineWidth = 1;
  g.lineCap = 'butt';
  g.lineJoin = 'miter';
  g.setLineDash([]);
  g.lineDashOffset = 0;
  g.shadowBlur = 0;
  g.shadowColor = 'transparent';
  g.shadowOffsetX = 0;
  g.shadowOffsetY = 0;
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
function pill(g: G, s: string, x: number, y: number, size: number, fill: string, fg = '#fff', align: 'center' | 'left' | 'right' = 'center'): number {
  g.font = `800 ${size}px ${F}`;
  const tw = g.measureText(s).width;
  const ph = size * 1.7;
  const pw = tw + size * 1.3;
  const x0 = align === 'center' ? x - pw / 2 : align === 'left' ? x : x - pw;
  rr(g, x0, y - ph / 2, pw, ph, ph / 2);
  g.fillStyle = fill;
  g.fill();
  txt(g, s, x0 + pw / 2, y + size * 0.05, size, fg, 'center', 800);
  return pw;
}
function bgGrad(g: G, w: number, h: number, a: string, b: string): void {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, a);
  gr.addColorStop(1, b);
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
}
function vignette(g: G, w: number, h: number, a = 0.45): void {
  const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.62);
  gr.addColorStop(0, 'rgba(0,0,0,0)');
  gr.addColorStop(1, `rgba(0,0,0,${a})`);
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
}
type RGB = [number, number, number];
function hexRGB(c: string): RGB {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rampAt(ramp: RGB[], k: number): RGB {
  const x = clamp01(k) * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(x));
  const f = x - i;
  const a = ramp[i]!;
  const b = ramp[i + 1]!;
  return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];
}
const css = (c: RGB, a = 1): string => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

/* ───────── 칸 지도 공통 ───────── */
interface Fit {
  s: number;
  ox: number;
  oy: number;
}
function fitGrid(cols: number, rows: number, x: number, y: number, w: number, h: number): Fit {
  const s = Math.min(w / cols, h / rows);
  return { s, ox: x + (w - cols * s) / 2, oy: y + (h - rows * s) / 2 };
}
class Heap {
  k: number[] = [];
  v: number[] = [];
  get size(): number {
    return this.k.length;
  }
  push(key: number, val: number): void {
    const k = this.k;
    const v = this.v;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p]! <= key) break;
      k[i] = k[p]!;
      v[i] = v[p]!;
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  pop(): number {
    const k = this.k;
    const v = this.v;
    const top = v[0]!;
    const lk = k.pop()!;
    const lv = v.pop()!;
    const n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1]! < k[c]!) c++;
        if (k[c]! >= lk) break;
        k[i] = k[c]!;
        v[i] = v[c]!;
        i = c;
      }
      k[i] = lk;
      v[i] = lv;
    }
    return top;
  }
}
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];
const DL = [1, 1, 1, 1, SQ2, SQ2, SQ2, SQ2];

/** 여덟 방향 이웃 (모서리 끼어 지나가기 금지) */
function eachNb(cols: number, rows: number, block: (i: number) => boolean, i: number, fn: (j: number, len: number) => void): void {
  const x = i % cols;
  const y = (i / cols) | 0;
  for (let d = 0; d < 8; d++) {
    const nx = x + DX[d]!;
    const ny = y + DY[d]!;
    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
    const j = ny * cols + nx;
    if (block(j)) continue;
    if (d >= 4 && (block(y * cols + nx) || block(ny * cols + x))) continue;
    fn(j, DL[d]!);
  }
}
/** 비용 지도 다익스트라 (목표에서 거꾸로 — 흐름장 · 등시선) */
function dijkstra(cols: number, rows: number, cost: Float32Array, src: number): Float32Array {
  const N = cols * rows;
  const dist = new Float32Array(N).fill(Infinity);
  const heap = new Heap();
  dist[src] = 0;
  heap.push(0, src);
  const blocked = (j: number): boolean => !isFinite(cost[j]!);
  while (heap.size) {
    const i = heap.pop();
    const di = dist[i]!;
    eachNb(cols, rows, blocked, i, (j, len) => {
      const nd = di + ((cost[i]! + cost[j]!) / 2) * len;
      if (nd < dist[j]! - 1e-6) {
        dist[j] = nd;
        heap.push(nd, j);
      }
    });
  }
  return dist;
}
function drawFlag(g: G, x: number, y: number, s: number, col: string): void {
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.ellipse(x, y + s * 0.05, s * 0.32, s * 0.12, 0, 0, TAU);
  g.fill();
  g.strokeStyle = '#e8e2d0';
  g.lineWidth = Math.max(1, s * 0.09);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x, y - s);
  g.stroke();
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(x, y - s);
  g.quadraticCurveTo(x + s * 0.35, y - s * 0.95, x + s * 0.62, y - s * 0.78);
  g.quadraticCurveTo(x + s * 0.35, y - s * 0.62, x, y - s * 0.55);
  g.closePath();
  g.fill();
  g.lineCap = 'butt';
}
function drawPin(g: G, x: number, y: number, s: number, col: string, t = 0): void {
  const p = 1 + 0.5 * ((t * 1.4) % 1);
  g.strokeStyle = col;
  g.globalAlpha = 1 - ((t * 1.4) % 1);
  g.lineWidth = Math.max(1, s * 0.08);
  g.beginPath();
  g.ellipse(x, y, s * 0.45 * p, s * 0.2 * p, 0, 0, TAU);
  g.stroke();
  g.globalAlpha = 1;
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.ellipse(x, y, s * 0.22, s * 0.09, 0, 0, TAU);
  g.fill();
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(x, y);
  g.bezierCurveTo(x - s * 0.1, y - s * 0.35, x - s * 0.34, y - s * 0.5, x - s * 0.34, y - s * 0.74);
  g.arc(x, y - s * 0.74, s * 0.34, Math.PI, 0);
  g.bezierCurveTo(x + s * 0.34, y - s * 0.5, x + s * 0.1, y - s * 0.35, x, y);
  g.fill();
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(x, y - s * 0.74, s * 0.13, 0, TAU);
  g.fill();
}

/* ═════════ i264 A* · 다익스트라 · 탐욕 ═════════ */
interface Run {
  closedAt: Int32Array;
  openedAt: Int32Array;
  steps: number;
  path: number[];
  cost: number;
}
const ALGO_NAME = ['A*', '다익스트라', '탐욕'];
const ALGO_COL = ['#38d39f', '#7c8cff', '#ff8a5c'];
function gridSearch(cols: number, rows: number, wall: Uint8Array, s: number, goal: number, algo: number): Run {
  const N = cols * rows;
  const gs = new Float32Array(N).fill(Infinity);
  const par = new Int32Array(N).fill(-1);
  const closedAt = new Int32Array(N).fill(-1);
  const openedAt = new Int32Array(N).fill(-1);
  const gx = goal % cols;
  const gy = (goal / cols) | 0;
  const H = (i: number): number => {
    const dx = Math.abs((i % cols) - gx);
    const dy = Math.abs(((i / cols) | 0) - gy);
    return Math.max(dx, dy) + (SQ2 - 1) * Math.min(dx, dy);
  };
  const key = (i: number): number => (algo === 0 ? gs[i]! + H(i) * 1.0001 : algo === 1 ? gs[i]! : H(i));
  const heap = new Heap();
  gs[s] = 0;
  openedAt[s] = 0;
  heap.push(key(s), s);
  let step = 0;
  const blocked = (j: number): boolean => wall[j] === 1;
  while (heap.size) {
    const i = heap.pop();
    if (closedAt[i]! >= 0) continue;
    step++;
    closedAt[i] = step;
    if (i === goal) break;
    eachNb(cols, rows, blocked, i, (j, len) => {
      if (closedAt[j]! >= 0) return;
      const ng = gs[i]! + len;
      if (algo === 2 ? openedAt[j]! < 0 : ng < gs[j]! - 1e-6) {
        gs[j] = ng;
        par[j] = i;
        if (openedAt[j]! < 0) openedAt[j] = step;
        heap.push(key(j), j);
      }
    });
  }
  const path: number[] = [];
  if (closedAt[goal]! >= 0) for (let c = goal; c >= 0; c = par[c]!) path.unshift(c);
  return { closedAt, openedAt, steps: step, path, cost: gs[goal]! };
}
interface Maze {
  cols: number;
  rows: number;
  wall: Uint8Array;
  s: number;
  g: number;
  id: number;
}
function makeMaze(cols: number, rows: number, seed: number): Maze {
  for (let tries = 0; ; tries++) {
    const r = rng(seed * 31 + tries);
    const wall = new Uint8Array(cols * rows);
    const set = (x: number, y: number): void => {
      if (x >= 0 && y >= 0 && x < cols && y < rows) wall[y * cols + x] = 1;
    };
    const sy = 2 + Math.floor(r() * (rows - 4));
    const sx = 1 + Math.floor(r() * 3);
    const gx = cols - 2 - Math.floor(r() * 3);
    const gy = 2 + Math.floor(r() * (rows - 4));
    // 탐욕을 속이는 컵 모양 벽 (출발 쪽으로 열림)
    const cx = Math.floor(cols * (0.5 + r() * 0.12));
    const cy = clamp(Math.round(lerp(sy, gy, 0.5)), 4, rows - 5);
    const half = 3 + Math.floor(r() * 2);
    for (let y = cy - half; y <= cy + half; y++) set(cx, y);
    for (let x = cx - 4; x <= cx; x++) {
      set(x, cy - half);
      set(x, cy + half);
    }
    const segs = Math.floor((cols * rows) / 45);
    for (let k = 0; k < segs; k++) {
      let x = Math.floor(r() * cols);
      let y = Math.floor(r() * rows);
      const horiz = r() < 0.5;
      const len = 3 + Math.floor(r() * 6);
      for (let q = 0; q < len; q++) {
        set(x, y);
        if (horiz) x++;
        else y++;
      }
    }
    const s = sy * cols + sx;
    const g = gy * cols + gx;
    wall[s] = 0;
    wall[g] = 0;
    const run = gridSearch(cols, rows, wall, s, g, 1);
    if (run.path.length > cols * 0.8 || tries > 30) return { cols, rows, wall, s, g, id: seed * 100 + tries };
  }
}
function paintTiles(lg: G, fit: Fit, cols: number, rows: number, wall: Uint8Array, floorA: string, floorB: string, wallTop: string, wallSide: string): void {
  const { s, ox, oy } = fit;
  rr(lg, ox - s * 0.25, oy - s * 0.25, cols * s + s * 0.5, rows * s + s * 0.5, s * 0.6);
  lg.fillStyle = 'rgba(0,0,0,0.35)';
  lg.fill();
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      lg.fillStyle = (x + y) & 1 ? floorA : floorB;
      lg.fillRect(ox + x * s, oy + y * s, s, s);
    }
  // 벽: 그림자 → 옆면 → 윗면
  lg.fillStyle = 'rgba(0,0,0,0.35)';
  for (let i = 0; i < wall.length; i++)
    if (wall[i]) {
      const x = i % cols;
      const y = (i / cols) | 0;
      lg.fillRect(ox + x * s + s * 0.15, oy + y * s + s * 0.25, s, s);
    }
  for (let i = 0; i < wall.length; i++)
    if (wall[i]) {
      const x = ox + (i % cols) * s;
      const y = oy + ((i / cols) | 0) * s;
      lg.fillStyle = wallSide;
      lg.fillRect(x, y, s, s);
      lg.fillStyle = wallTop;
      lg.fillRect(x, y - s * 0.12, s, s * 0.88);
      lg.fillStyle = 'rgba(255,255,255,0.13)';
      lg.fillRect(x, y - s * 0.12, s, s * 0.12);
    }
}
function cellC(fit: Fit, cols: number, i: number): V2 {
  return [fit.ox + ((i % cols) + 0.5) * fit.s, fit.oy + (((i / cols) | 0) + 0.5) * fit.s];
}
function strokePathPart(g: G, pts: V2[], k: number): V2 | null {
  if (pts.length < 2) return null;
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
  let left = total * clamp01(k);
  g.beginPath();
  g.moveTo(pts[0]![0], pts[0]![1]);
  let head: V2 = pts[0]!;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L >= left) {
      head = [a[0] + ((b[0] - a[0]) * left) / (L || 1), a[1] + ((b[1] - a[1]) * left) / (L || 1)];
      g.lineTo(head[0], head[1]);
      break;
    }
    left -= L;
    g.lineTo(b[0], b[1]);
    head = b;
  }
  g.stroke();
  return head;
}
function glowStroke(g: G, pts: V2[], k: number, col: string, wdt: number): V2 | null {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = col;
  g.globalAlpha = 0.25;
  g.lineWidth = wdt * 3;
  strokePathPart(g, pts, k);
  g.globalAlpha = 1;
  g.lineWidth = wdt;
  const head = strokePathPart(g, pts, k);
  g.strokeStyle = 'rgba(255,255,255,0.75)';
  g.lineWidth = wdt * 0.35;
  strokePathPart(g, pts, k);
  return head;
}

function drawSearch(g: G, fit: Fit, M: Maze, run: Run, S: number, pathK: number, t: number): void {
  const { s } = fit;
  const gap = s > 6 ? 0.7 : 0.3;
  const N = M.cols * M.rows;
  const steps = Math.max(1, run.steps);
  for (let i = 0; i < N; i++) {
    const ca = run.closedAt[i]!;
    const oa = run.openedAt[i]!;
    const x = fit.ox + (i % M.cols) * s;
    const y = fit.oy + ((i / M.cols) | 0) * s;
    if (ca > 0 && ca <= S) {
      const k = ca / steps;
      const fresh = clamp01(1 - (S - ca) / 8);
      const l = 30 + 22 * k + 30 * fresh;
      g.fillStyle = `hsl(${212 - 26 * k},${62 + 10 * fresh}%,${l}%)`;
      g.fillRect(x + gap, y + gap, s - gap * 2, s - gap * 2);
    } else if (oa >= 0 && oa <= S) {
      g.fillStyle = '#ffcf4a';
      g.fillRect(x + gap, y + gap, s - gap * 2, s - gap * 2);
      g.fillStyle = 'rgba(255,255,255,0.45)';
      g.fillRect(x + gap, y + gap, s - gap * 2, (s - gap * 2) * 0.3);
    }
  }
  if (pathK > 0 && run.path.length) {
    const pts = run.path.map((i) => cellC(fit, M.cols, i));
    const head = glowStroke(g, pts, pathK, '#ff4f8b', Math.max(1.5, s * 0.32));
    if (head && pathK < 1) {
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(head[0], head[1], s * 0.38, 0, TAU);
      g.fill();
    }
  }
  const sp = cellC(fit, M.cols, M.s);
  const gp = cellC(fit, M.cols, M.g);
  drawFlag(g, sp[0] - s * 0.1, sp[1] + s * 0.4, s * 1.6, '#3ddc84');
  drawPin(g, gp[0], gp[1] + s * 0.35, s * 1.5, '#ff4f6b', t);
}

/* ═════════ i271 · i274 · i280 공용: 섬 세계 그림 (한 번만 굽는다) ═════════ */
const WORLD_W = 1024;
const WORLD_H = 640;
let worldCache: { c: HTMLCanvasElement; h: Float32Array; towns: V2[] } | null = null;
function worldHeight(x: number, y: number): number {
  const nx = x / WORLD_W - 0.5;
  const ny = y / WORLD_H - 0.5;
  const d = Math.hypot(nx * 1.15, ny * 1.5);
  return fbm(x / 170, y / 170, 11, 4) * 1.0 - d * 1.3 - 0.04;
}
const WORLD_RAMP: [number, RGB][] = [
  [-0.25, hexRGB('#10325c')],
  [-0.02, hexRGB('#1d5c8f')],
  [0.0, hexRGB('#3f8fbf')],
  [0.02, hexRGB('#e8d79a')],
  [0.05, hexRGB('#9ccc6a')],
  [0.16, hexRGB('#5ea24c')],
  [0.27, hexRGB('#3e7f3c')],
  [0.36, hexRGB('#8a8a6a')],
  [0.46, hexRGB('#b9b3a3')],
  [0.52, hexRGB('#f4f6f8')],
];
function worldColor(h: number): RGB {
  if (h <= WORLD_RAMP[0]![0]) return WORLD_RAMP[0]![1];
  for (let i = 1; i < WORLD_RAMP.length; i++) {
    const [h1, c1] = WORLD_RAMP[i]!;
    if (h <= h1) {
      const [h0, c0] = WORLD_RAMP[i - 1]!;
      const f = (h - h0) / (h1 - h0);
      return [lerp(c0[0], c1[0], f), lerp(c0[1], c1[1], f), lerp(c0[2], c1[2], f)];
    }
  }
  return WORLD_RAMP[WORLD_RAMP.length - 1]![1];
}
function getWorld(): { c: HTMLCanvasElement; h: Float32Array; towns: V2[] } {
  if (worldCache) return worldCache;
  const W = WORLD_W;
  const H = WORLD_H;
  const hs = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) hs[y * W + x] = worldHeight(x, y);
  const c = mk(WORLD_W, WORLD_H);
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const h = hs[y * W + x]!;
      let col = worldColor(h);
      if (h > 0.02) {
        const hx = hs[y * W + Math.min(W - 1, x + 1)]! - h;
        const hy = hs[Math.min(H - 1, y + 1) * W + x]! - h;
        const sh = clamp(1 + (-hx - hy) * 22, 0.62, 1.3);
        col = [col[0] * sh, col[1] * sh, col[2] * sh];
      } else {
        const wave = 0.94 + 0.06 * vnoise(x * 0.15, y * 0.15, 5);
        col = [col[0] * wave, col[1] * wave, col[2] * wave];
      }
      const o = (y * W + x) * 4;
      img.data[o] = clamp(col[0], 0, 255);
      img.data[o + 1] = clamp(col[1], 0, 255);
      img.data[o + 2] = clamp(col[2], 0, 255);
      img.data[o + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  // 바닷가 흰 물결 띠
  const r = rng(77);
  const hAt = (x: number, y: number): number => hs[clamp(Math.round(y), 0, H - 1) * W + clamp(Math.round(x), 0, W - 1)]!;
  g.fillStyle = 'rgba(255,255,255,0.18)';
  for (let k = 0; k < 9000; k++) {
    const x = r() * WORLD_W;
    const y = r() * WORLD_H;
    const h = hAt(x, y);
    if (h < 0 && h > -0.035) g.fillRect(x, y, 2, 2);
  }
  // 숲 (작은 나무 점)
  for (let k = 0; k < 2600; k++) {
    const x = r() * WORLD_W;
    const y = r() * WORLD_H;
    const h = hAt(x, y);
    if (h > 0.12 && h < 0.33 && vnoise(x / 60, y / 60, 9) > 0.48) {
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath();
      g.ellipse(x + 1.5, y + 2.5, 3.2, 1.6, 0, 0, TAU);
      g.fill();
      g.fillStyle = h > 0.24 ? '#2f6a34' : '#3d8a3e';
      g.beginPath();
      g.arc(x, y, 3, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.beginPath();
      g.arc(x - 1, y - 1, 1.3, 0, TAU);
      g.fill();
    }
  }
  // 마을
  const towns: V2[] = [];
  for (let k = 0; k < 4000 && towns.length < 9; k++) {
    const x = 80 + r() * (WORLD_W - 160);
    const y = 60 + r() * (WORLD_H - 120);
    const h = hAt(x, y);
    if (h > 0.05 && h < 0.2 && towns.every((p) => Math.hypot(p[0] - x, p[1] - y) > 150)) towns.push([x, y]);
  }
  // 길 (마을끼리)
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (let i = 0; i + 1 < towns.length; i++) {
    const a = towns[i]!;
    const b = towns[i + 1]!;
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.quadraticCurveTo((a[0] + b[0]) / 2 + 30, (a[1] + b[1]) / 2 - 30, b[0], b[1]);
    g.strokeStyle = 'rgba(80,50,20,0.35)';
    g.lineWidth = 5;
    g.stroke();
    g.strokeStyle = '#f1dfae';
    g.lineWidth = 2.5;
    g.stroke();
  }
  for (const [x, y] of towns) {
    for (let q = 0; q < 6; q++) {
      const hx = x + (hash2(q, x, 3) - 0.5) * 26;
      const hy = y + (hash2(q, y, 4) - 0.5) * 18;
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(hx - 3, hy - 1, 8, 5);
      g.fillStyle = '#f4ead8';
      g.fillRect(hx - 4, hy - 3, 7, 5);
      g.fillStyle = q % 2 ? '#d9534f' : '#e07b39';
      g.beginPath();
      g.moveTo(hx - 5, hy - 3);
      g.lineTo(hx - 0.5, hy - 7);
      g.lineTo(hx + 4, hy - 3);
      g.fill();
    }
  }
  worldCache = { c, h: hs, towns };
  return worldCache;
}
function worldH(x: number, y: number): number {
  const w = getWorld();
  return w.h[clamp(Math.round(y), 0, WORLD_H - 1) * WORLD_W + clamp(Math.round(x), 0, WORLD_W - 1)]!;
}

/* ═════════ 묶음 1 : i264 · i265 · i266 ═════════ */
const D1: DemoMap = {
  i264: {
    kind: '2d',
    caption: 'A* 는 목표 쪽으로 뾰족하게, 다익스트라는 둥글게 다 퍼지고, 탐욕은 빠르지만 컵 벽에 걸려 돌아가요 (노랑 = 열린 칸 · 파랑 = 닫힌 칸)',
    make() {
      const COLS = 30;
      const ROWS = 18;
      let seed = 1;
      let M = makeMaze(COLS, ROWS, seed);
      let runs = [0, 1, 2].map((a) => gridSearch(COLS, ROWS, M.wall, M.s, M.g, a));
      let algo = 0;
      let compare = false;
      let speed = 1;
      let phaseT = 0;
      const done = [-1, -1, -1];
      const layer = new Layer();
      const RATE = 110;
      const newMap = (): void => {
        seed++;
        M = makeMaze(COLS, ROWS, seed);
        runs = [0, 1, 2].map((a) => gridSearch(COLS, ROWS, M.wall, M.s, M.g, a));
        phaseT = 0;
        algo = 0;
        done.fill(-1);
      };
      const chips = (g: G, w: number, y: number, u: number, live: number[]): void => {
        let x = w - 6 * u;
        for (let a = 2; a >= 0; a--) {
          const v = live[a]!;
          const s = v < 0 ? `${ALGO_NAME[a]} —` : `${ALGO_NAME[a]} ${v}칸`;
          const on = compare || a === algo;
          const pw = pill(g, s, x, y, 7.5 * u, on ? ALGO_COL[a]! : 'rgba(255,255,255,0.1)', on ? '#0b1020' : 'rgba(255,255,255,0.75)', 'right');
          x -= pw + 4 * u;
        }
      };
      return {
        draw(g, w, h, t, dt) {
          reset(g);
          const u = scaleOf(w, h);
          const dpr = dprOf(g);
          phaseT += Math.min(dt, 0.1) * speed;
          bgGrad(g, w, h, '#141b2e', '#0b1020');
          const headH = 22 * u;
          if (!compare) {
            const run = runs[algo]!;
            const S = phaseT * RATE;
            const tDone = run.steps / RATE;
            const pathK = (phaseT - tDone) / 0.8;
            if (phaseT > tDone) done[algo] = run.steps;
            if (phaseT > tDone + 0.8 + 1.4) {
              algo++;
              phaseT = 0;
              if (algo > 2) newMap();
            }
            const fit = fitGrid(COLS, ROWS, 7 * u, headH + 3 * u, w - 14 * u, h - headH - 9 * u);
            const L = layer.get(`1|${M.id}|${w}|${h}|${dpr}`, w, h, dpr, (lg) => paintTiles(lg, fit, COLS, ROWS, M.wall, '#222c46', '#26314d', '#4a5578', '#2a3150'));
            g.drawImage(L, 0, 0, w, h);
            drawSearch(g, fit, M, run, S, pathK, t);
            const live = done.slice();
            if (live[algo]! < 0) live[algo] = Math.min(run.steps, Math.floor(S));
            chips(g, w, headH / 2 + 1 * u, u, live);
            txt(g, ALGO_NAME[algo]!, 8 * u, headH / 2 + 1.5 * u, 13 * u, ALGO_COL[algo]!, 'left', 900);
            if (pathK > 1) {
              const L2 = run.path.length > 1 ? `길이 ${run.cost.toFixed(1)}` : '';
              pill(g, L2, w / 2, h - 12 * u, 8 * u, 'rgba(255,79,139,0.92)');
            }
          } else {
            const S = phaseT * RATE;
            const maxSteps = Math.max(...runs.map((r) => r.steps));
            if (phaseT > maxSteps / RATE + 0.8 + 1.8) newMap();
            const vert = h > w * 0.9;
            const pw = vert ? w : w / 3;
            const ph = vert ? (h - headH) / 3 : h - headH;
            const fits: Fit[] = [];
            for (let a = 0; a < 3; a++) {
              const px = vert ? 0 : a * pw;
              const py = headH + (vert ? a * ph : 0);
              fits.push(fitGrid(COLS, ROWS, px + 4 * u, py + 12 * u, pw - 8 * u, ph - 16 * u));
            }
            const L = layer.get(`3|${M.id}|${w}|${h}|${dpr}`, w, h, dpr, (lg) => {
              for (const f of fits) paintTiles(lg, f, COLS, ROWS, M.wall, '#222c46', '#26314d', '#4a5578', '#2a3150');
            });
            g.drawImage(L, 0, 0, w, h);
            const live = [0, 0, 0];
            for (let a = 0; a < 3; a++) {
              const run = runs[a]!;
              const f = fits[a]!;
              drawSearch(g, f, M, run, S, (phaseT - run.steps / RATE) / 0.8, t);
              live[a] = Math.min(run.steps, Math.floor(S));
              txt(g, ALGO_NAME[a]!, f.ox, f.oy - 6 * u, 10 * u, ALGO_COL[a]!, 'left', 900);
              if (S >= run.steps) txt(g, `길이 ${run.cost.toFixed(1)}`, f.ox + COLS * f.s, f.oy - 6 * u, 8.5 * u, '#ff8fb3', 'right', 800);
            }
            txt(g, '같은 문제 · 같은 속도', 8 * u, headH / 2 + 1.5 * u, 10 * u, '#cfd8ff', 'left', 800);
            chips(g, w, headH / 2 + 1 * u, u, live);
          }
        },
        controls: [
          { type: 'toggle', label: '셋 나란히 비교', value: false, on: (v) => ((compare = v), (phaseT = 0), (algo = 0), done.fill(-1)) },
          { type: 'range', label: '속도', min: 0.3, max: 3, step: 0.1, value: 1, on: (v) => (speed = v) },
          { type: 'button', label: '새 문제', on: newMap },
          { type: 'button', label: '다음 알고리즘', on: () => ((algo = (algo + 1) % 3), (phaseT = 0)) },
        ] as Control[],
      };
    },
  },

  i265: {
    kind: '2d',
    caption: '목표에서 거꾸로 거리 물결을 퍼뜨려 칸마다 화살표 하나 — 유닛 수백 마리가 그 지도 하나만 보고 몰려가요',
    make() {
      const C = 32;
      const R = 20;
      let wall = new Uint8Array(C * R);
      let cost: Float32Array = new Float32Array(C * R);
      let dist: Float32Array = new Float32Array(C * R);
      const dir = new Float32Array(C * R * 2);
      let goal = 0;
      let waveStart = 0;
      let lastGoalT = -99;
      let mapSeed = 3;
      let showArrows = true;
      let showNum = false;
      let count = 300;
      let now = 0;
      const MAXU = 800;
      const px = new Float32Array(MAXU);
      const py = new Float32Array(MAXU);
      const vx = new Float32Array(MAXU);
      const vy = new Float32Array(MAXU);
      let alive = 0;
      const head = new Int32Array(C * R);
      const next = new Int32Array(MAXU);
      const layer = new Layer();
      const free = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < C && y < R && wall[(y | 0) * C + (x | 0)] === 0;
      const buildMap = (): void => {
        const r = rng(mapSeed);
        wall = new Uint8Array(C * R);
        for (let k = 0; k < 9; k++) {
          const bw = r() < 0.5 ? 1 + Math.floor(r() * 2) : 3 + Math.floor(r() * 5);
          const bh = bw <= 2 ? 3 + Math.floor(r() * 6) : 1 + Math.floor(r() * 2);
          const x0 = 2 + Math.floor(r() * (C - bw - 4));
          const y0 = 1 + Math.floor(r() * (R - bh - 2));
          for (let y = y0; y < y0 + bh; y++) for (let x = x0; x < x0 + bw; x++) wall[y * C + x] = 1;
        }
        for (let k = 0; k < 3; k++) {
          const x0 = 3 + Math.floor(r() * (C - 6));
          const y0 = 2 + Math.floor(r() * (R - 4));
          for (let y = y0; y < y0 + 2; y++) for (let x = x0; x < x0 + 2; x++) wall[y * C + x] = 1;
        }
        cost = new Float32Array(C * R);
        for (let i = 0; i < C * R; i++) cost[i] = wall[i] ? Infinity : 1;
        alive = 0;
      };
      const retarget = (): void => {
        const r = rng(mapSeed * 97 + Math.floor(now * 10));
        let best = goal;
        let bestD = -1;
        for (let k = 0; k < 30; k++) {
          const x = 1 + Math.floor(r() * (C - 2));
          const y = 1 + Math.floor(r() * (R - 2));
          const i = y * C + x;
          if (wall[i]) continue;
          const d = Math.hypot(x - (goal % C), y - ((goal / C) | 0)) + r() * 4;
          if (d > bestD) {
            bestD = d;
            best = i;
          }
        }
        goal = best;
        dist = dijkstra(C, R, cost, goal);
        for (let i = 0; i < C * R; i++) {
          let bx = 0;
          let by = 0;
          let bd = dist[i]!;
          eachNb(C, R, (j) => wall[j] === 1, i, (j) => {
            if (dist[j]! < bd) {
              bd = dist[j]!;
              bx = (j % C) - (i % C);
              by = ((j / C) | 0) - ((i / C) | 0);
            }
          });
          const l = Math.hypot(bx, by) || 1;
          dir[i * 2] = bx / l;
          dir[i * 2 + 1] = by / l;
        }
        waveStart = now;
        lastGoalT = now;
      };
      const spawn = (n: number): void => {
        const r = rng(alive * 13 + 7 + mapSeed);
        while (alive < n) {
          const x = r() * C;
          const y = r() * R;
          if (!free(x, y) || !isFinite(dist[(y | 0) * C + (x | 0)]!)) continue;
          px[alive] = x;
          py[alive] = y;
          vx[alive] = 0;
          vy[alive] = 0;
          alive++;
        }
      };
      buildMap();
      goal = 2 * C + 2;
      retarget();
      spawn(count);
      const UCOL = ['#ffd166', '#06d6a0', '#ff6b8b', '#8ecae6'];
      const HEAT: RGB[] = ['#ffcf6b', '#ff7a59', '#c94f86', '#6a4fa8', '#2c3e7a'].map(hexRGB);
      return {
        draw(g, w, h, t, dtRaw) {
          reset(g);
          now = t;
          const dt = Math.min(dtRaw, 0.05);
          const u = scaleOf(w, h);
          const dpr = dprOf(g);
          if (t - lastGoalT > 4.2 || t < lastGoalT) retarget();
          if (alive < count) spawn(count);
          if (alive > count) alive = count;
          bgGrad(g, w, h, '#16203a', '#0b1222');
          const headH = 18 * u;
          const fit = fitGrid(C, R, 6 * u, headH, w - 12 * u, h - headH - 6 * u);
          const { s, ox, oy } = fit;
          const L = layer.get(`${mapSeed}|${w}|${h}|${dpr}`, w, h, dpr, (lg) => paintTiles(lg, fit, C, R, wall, '#1f2a45', '#222e4a', '#56618a', '#2b3354'));
          g.drawImage(L, 0, 0, w, h);
          const waveR = (t - waveStart) * 30;
          let maxD = 1;
          for (let i = 0; i < C * R; i++) if (isFinite(dist[i]!) && dist[i]! > maxD) maxD = dist[i]!;
          // 거리 물든 칸
          for (let i = 0; i < C * R; i++) {
            const d = dist[i]!;
            if (wall[i] || !isFinite(d) || d > waveR) continue;
            const x = ox + (i % C) * s;
            const y = oy + ((i / C) | 0) * s;
            const front = waveR - d < 1.6 && waveR < maxD + 2;
            g.fillStyle = front ? 'rgba(255,255,255,0.55)' : css(rampAt(HEAT, d / maxD), 0.42);
            g.fillRect(x + 0.5, y + 0.5, s - 1, s - 1);
          }
          // 화살표
          if (showArrows && s >= 4) {
            g.beginPath();
            const a = s * 0.3;
            for (let i = 0; i < C * R; i++) {
              if (wall[i] || i === goal || dist[i]! > waveR || !isFinite(dist[i]!)) continue;
              const cx = ox + ((i % C) + 0.5) * s;
              const cy = oy + (((i / C) | 0) + 0.5) * s;
              const dx = dir[i * 2]!;
              const dy = dir[i * 2 + 1]!;
              const tx = cx + dx * a;
              const ty = cy + dy * a;
              g.moveTo(cx - dx * a, cy - dy * a);
              g.lineTo(tx, ty);
              g.moveTo(tx - dx * a * 0.55 - dy * a * 0.45, ty - dy * a * 0.55 + dx * a * 0.45);
              g.lineTo(tx, ty);
              g.lineTo(tx - dx * a * 0.55 + dy * a * 0.45, ty - dy * a * 0.55 - dx * a * 0.45);
            }
            g.strokeStyle = 'rgba(235,240,255,0.55)';
            g.lineWidth = Math.max(0.7, s * 0.07);
            g.stroke();
          }
          if (showNum && s >= 16) {
            for (let i = 0; i < C * R; i++) {
              if (wall[i] || !isFinite(dist[i]!) || dist[i]! > waveR) continue;
              txt(g, String(Math.round(dist[i]!)), ox + ((i % C) + 0.5) * s, oy + (((i / C) | 0) + 0.72) * s, s * 0.28, 'rgba(255,255,255,0.8)', 'center', 700);
            }
          }
          // 유닛 움직이기
          head.fill(-1);
          for (let k = 0; k < alive; k++) {
            const ci = clamp(py[k]! | 0, 0, R - 1) * C + clamp(px[k]! | 0, 0, C - 1);
            next[k] = head[ci]!;
            head[ci] = k;
          }
          const SP = 3.4;
          for (let k = 0; k < alive; k++) {
            const x = px[k]!;
            const y = py[k]!;
            const ci = clamp(y | 0, 0, R - 1) * C + clamp(x | 0, 0, C - 1);
            let wx = dir[ci * 2]! * SP;
            let wy = dir[ci * 2 + 1]! * SP;
            if (ci === goal || dist[ci]! < 1.2) {
              const gx = (goal % C) + 0.5 - x;
              const gy = ((goal / C) | 0) + 0.5 - y;
              wx = gx * 1.5;
              wy = gy * 1.5;
            }
            // 서로 밀기
            let sx = 0;
            let sy = 0;
            const cx = x | 0;
            const cy = y | 0;
            for (let yy = cy - 1; yy <= cy + 1; yy++)
              for (let xx = cx - 1; xx <= cx + 1; xx++) {
                if (xx < 0 || yy < 0 || xx >= C || yy >= R) continue;
                for (let o = head[yy * C + xx]!; o >= 0; o = next[o]!) {
                  if (o === k) continue;
                  const ddx = x - px[o]!;
                  const ddy = y - py[o]!;
                  const d2 = ddx * ddx + ddy * ddy;
                  if (d2 < 0.16 && d2 > 1e-6) {
                    const d = Math.sqrt(d2);
                    sx += (ddx / d) * (0.4 - d);
                    sy += (ddy / d) * (0.4 - d);
                  }
                }
              }
            wx += sx * 14;
            wy += sy * 14;
            vx[k] = lerp(vx[k]!, wx, clamp01(dt * 7));
            vy[k] = lerp(vy[k]!, wy, clamp01(dt * 7));
            const nx = x + vx[k]! * dt;
            if (free(nx, y)) px[k] = nx;
            else vx[k] = vx[k]! * -0.2;
            const ny = py[k]! + vy[k]! * dt;
            if (free(px[k]!, ny)) py[k] = ny;
            else vy[k] = vy[k]! * -0.2;
          }
          // 유닛 그리기 (색마다 한 번에)
          const rad = Math.max(1.1, s * 0.2);
          g.fillStyle = 'rgba(0,0,0,0.35)';
          g.beginPath();
          for (let k = 0; k < alive; k++) {
            const X = ox + px[k]! * s;
            const Y = oy + py[k]! * s + rad * 0.5;
            g.moveTo(X + rad, Y);
            g.arc(X, Y, rad, 0, TAU);
          }
          g.fill();
          for (let c = 0; c < UCOL.length; c++) {
            g.fillStyle = UCOL[c]!;
            g.beginPath();
            for (let k = c; k < alive; k += UCOL.length) {
              const X = ox + px[k]! * s;
              const Y = oy + py[k]! * s;
              g.moveTo(X + rad, Y);
              g.arc(X, Y, rad, 0, TAU);
            }
            g.fill();
          }
          if (rad > 2.2) {
            g.fillStyle = '#1a1a2a';
            g.beginPath();
            for (let k = 0; k < alive; k++) {
              const sp = Math.hypot(vx[k]!, vy[k]!) || 1;
              const X = ox + px[k]! * s + (vx[k]! / sp) * rad * 0.35;
              const Y = oy + py[k]! * s + (vy[k]! / sp) * rad * 0.35;
              g.moveTo(X + rad * 0.22, Y);
              g.arc(X, Y, rad * 0.22, 0, TAU);
            }
            g.fill();
          }
          const gp = cellC(fit, C, goal);
          drawPin(g, gp[0], gp[1] + s * 0.4, s * 1.9, '#ff4f6b', t);
          txt(g, '흐름장', 8 * u, headH / 2 + 1 * u, 11 * u, '#ffd166', 'left', 900);
          pill(g, `유닛 ${alive}마리 · 지도 1장`, w - 7 * u, headH / 2 + 1 * u, 7.5 * u, 'rgba(255,255,255,0.12)', '#e8ecff', 'right');
          vignette(g, w, h, 0.3);
        },
        controls: [
          { type: 'range', label: '유닛 수', min: 50, max: 800, step: 50, value: 300, on: (v) => (count = v) },
          { type: 'toggle', label: '화살표 보기', value: true, on: (v) => (showArrows = v) },
          { type: 'toggle', label: '거리 숫자 (크게 볼 때)', value: false, on: (v) => (showNum = v) },
          { type: 'button', label: '새 목표', on: () => retarget() },
          { type: 'button', label: '새 지도', on: () => (mapSeed++, buildMap(), retarget(), spawn(count)) },
        ] as Control[],
      };
    },
  },

  i266: {
    kind: '2d',
    caption: '길 1 · 풀 2 · 모래 3 · 늪 5 — 같은 시간 선(등시선)이 길을 따라 길쭉하게, 늪에서는 촘촘하게 퍼져요',
    make() {
      const C = 40;
      const R = 25;
      const T_ROAD = 0;
      const T_GRASS = 1;
      const T_SAND = 2;
      const T_SWAMP = 3;
      const T_WATER = 4;
      const COST = [1, 2, 3, 5, Infinity];
      const TCOL = ['#a8784a', '#6fae58', '#ecd9a0', '#5f7a4a', '#2f6fa3'];
      let seed = 4;
      let terr = new Uint8Array(C * R);
      let src = 0;
      let dst = 0;
      let dist: Float32Array = new Float32Array(C * R);
      let path: number[] = [];
      let flat = false;
      let speed = 1;
      let phaseT = 0;
      let rounds = 0;
      const layer = new Layer();
      const small = mk(C, R);
      const sg = small.getContext('2d')!;
      const img = sg.createImageData(C, R);
      const buildTerrain = (): void => {
        terr = new Uint8Array(C * R);
        for (let y = 0; y < R; y++)
          for (let x = 0; x < C; x++) {
            const n = fbm(x * 0.09, y * 0.11, seed, 4);
            const m = fbm(x * 0.13 + 40, y * 0.13, seed + 5, 3);
            let k = T_GRASS;
            if (n < 0.34) k = T_WATER;
            else if (n < 0.41) k = T_SWAMP;
            else if (m > 0.6) k = T_SAND;
            terr[y * C + x] = k;
          }
        // 길 두 개 (가로 · 세로로 구불구불)
        const r = rng(seed * 7);
        for (let q = 0; q < 2; q++) {
          let x = q === 0 ? 0 : 6 + Math.floor(r() * (C - 12));
          let y = q === 0 ? 4 + Math.floor(r() * (R - 8)) : 0;
          for (let k = 0; k < 200; k++) {
            terr[y * C + x] = T_ROAD;
            if (q === 0) {
              x++;
              if (r() < 0.25) y = clamp(y + (r() < 0.5 ? -1 : 1), 1, R - 2);
              if (x >= C) break;
            } else {
              y++;
              if (r() < 0.25) x = clamp(x + (r() < 0.5 ? -1 : 1), 1, C - 2);
              if (y >= R) break;
            }
            terr[y * C + Math.min(C - 1, x)] = T_ROAD;
          }
        }
      };
      const costArr = (): Float32Array => {
        const c = new Float32Array(C * R);
        for (let i = 0; i < C * R; i++) c[i] = terr[i] === T_WATER ? Infinity : flat ? 1 : COST[terr[i]!]!;
        return c;
      };
      const newProblem = (): void => {
        const r = rng(seed * 131 + rounds * 7 + 1);
        const land = (): number => {
          for (;;) {
            const i = Math.floor(r() * C * R);
            if (terr[i] !== T_WATER) return i;
          }
        };
        const cost = costArr();
        for (let k = 0; k < 20; k++) {
          src = land();
          dist = dijkstra(C, R, cost, src);
          let n = 0;
          for (let i = 0; i < C * R; i++) if (isFinite(dist[i]!)) n++;
          if (n > C * R * 0.5) break;
        }
        let best = src;
        for (let k = 0; k < 40; k++) {
          const i = land();
          if (isFinite(dist[i]!) && dist[i]! > dist[best]! && r() < 0.6) best = i;
        }
        dst = best;
        path = [];
        for (let c = dst; c !== src; ) {
          path.unshift(c);
          let bj = -1;
          let bd = dist[c]!;
          eachNb(C, R, (j) => !isFinite(cost[j]!), c, (j) => {
            if (dist[j]! < bd) {
              bd = dist[j]!;
              bj = j;
            }
          });
          if (bj < 0) break;
          c = bj;
        }
        path.unshift(src);
        phaseT = 0;
      };
      buildTerrain();
      newProblem();
      const BAND: RGB[] = ['#fff2a8', '#ffc46b', '#ff8a5c', '#e2587a', '#a74f9e', '#6252a8', '#3b4a96'].map(hexRGB);
      return {
        draw(g, w, h, _t, dt) {
          reset(g);
          const u = scaleOf(w, h);
          const dpr = dprOf(g);
          phaseT += Math.min(dt, 0.1) * speed;
          let maxD = 1;
          for (let i = 0; i < C * R; i++) if (isFinite(dist[i]!) && dist[i]! > maxD) maxD = dist[i]!;
          const DUR = 3.4;
          const T = (phaseT / DUR) * maxD;
          if (phaseT > DUR + 2.6) {
            rounds++;
            if (rounds % 3 === 0) seed++, buildTerrain();
            newProblem();
          }
          bgGrad(g, w, h, '#1a2233', '#0d1320');
          const headH = 18 * u;
          const fit = fitGrid(C, R, 5 * u, headH, w - 10 * u, h - headH - 5 * u);
          const { s, ox, oy } = fit;
          const L = layer.get(`${seed}|${w}|${h}|${dpr}`, w, h, dpr, (lg) => {
            rr(lg, ox - 3, oy - 3, C * s + 6, R * s + 6, 5);
            lg.fillStyle = 'rgba(0,0,0,0.4)';
            lg.fill();
            for (let i = 0; i < C * R; i++) {
              const x = ox + (i % C) * s;
              const y = oy + ((i / C) | 0) * s;
              const k = terr[i]!;
              const c = hexRGB(TCOL[k]!);
              const v = 0.9 + 0.2 * hash2(i, 3, seed);
              lg.fillStyle = css([c[0] * v, c[1] * v, c[2] * v]);
              lg.fillRect(x, y, s + 0.5, s + 0.5);
            }
            // 무늬: 풀 포기 · 모래 점 · 늪 갈대 · 물결
            const r = rng(seed + 99);
            for (let i = 0; i < C * R; i++) {
              const x = ox + (i % C) * s;
              const y = oy + ((i / C) | 0) * s;
              const k = terr[i]!;
              if (k === T_GRASS && r() < 0.5) {
                lg.strokeStyle = 'rgba(30,80,30,0.5)';
                lg.lineWidth = Math.max(0.6, s * 0.08);
                const gx = x + s * (0.2 + r() * 0.6);
                const gy = y + s * (0.4 + r() * 0.4);
                lg.beginPath();
                lg.moveTo(gx - s * 0.12, gy - s * 0.2);
                lg.lineTo(gx, gy);
                lg.lineTo(gx + s * 0.12, gy - s * 0.22);
                lg.stroke();
              } else if (k === T_SAND) {
                lg.fillStyle = 'rgba(150,110,50,0.45)';
                for (let q = 0; q < 3; q++) lg.fillRect(x + r() * s, y + r() * s, Math.max(0.6, s * 0.08), Math.max(0.6, s * 0.08));
              } else if (k === T_SWAMP) {
                lg.strokeStyle = 'rgba(25,45,20,0.7)';
                lg.lineWidth = Math.max(0.6, s * 0.07);
                lg.beginPath();
                const gx = x + s * 0.5;
                lg.moveTo(gx, y + s * 0.85);
                lg.lineTo(gx - s * 0.1, y + s * 0.25);
                lg.moveTo(gx + s * 0.2, y + s * 0.85);
                lg.lineTo(gx + s * 0.25, y + s * 0.35);
                lg.stroke();
                lg.fillStyle = 'rgba(60,90,70,0.6)';
                lg.fillRect(x + s * 0.1, y + s * 0.7, s * 0.3, s * 0.12);
              } else if (k === T_WATER && r() < 0.3) {
                lg.strokeStyle = 'rgba(255,255,255,0.25)';
                lg.lineWidth = Math.max(0.6, s * 0.07);
                lg.beginPath();
                lg.arc(x + s * 0.5, y + s * 0.8, s * 0.3, Math.PI * 1.2, Math.PI * 1.8);
                lg.stroke();
              } else if (k === T_ROAD) {
                lg.fillStyle = 'rgba(120,80,40,0.35)';
                lg.fillRect(x + s * 0.47, y + s * 0.2, s * 0.06, s * 0.6);
              }
            }
          });
          g.drawImage(L, 0, 0, w, h);
          // 등시 띠 (작은 그림을 늘려서 부드럽게)
          const band = maxD / 9;
          const d8 = img.data;
          for (let i = 0; i < C * R; i++) {
            const d = dist[i]!;
            const o = i * 4;
            if (!isFinite(d) || d > T) {
              d8[o + 3] = 0;
              continue;
            }
            const b = Math.floor(d / band);
            const c = rampAt(BAND, b / 9);
            const alt = b % 2 ? 0.86 : 1;
            d8[o] = c[0] * alt;
            d8[o + 1] = c[1] * alt;
            d8[o + 2] = c[2] * alt;
            d8[o + 3] = 150;
          }
          sg.putImageData(img, 0, 0);
          g.imageSmoothingEnabled = true;
          g.drawImage(small, ox, oy, C * s, R * s);
          // 등시선 (칸 가운데 값으로 마칭 스퀘어)
          const val = (x: number, y: number): number => {
            const d = dist[y * C + x]!;
            return isFinite(d) ? d : 1e6;
          };
          const iso = (lv: number): void => {
            for (let y = 0; y < R - 1; y++)
              for (let x = 0; x < C - 1; x++) {
                const a = val(x, y);
                const b = val(x + 1, y);
                const c = val(x + 1, y + 1);
                const d = val(x, y + 1);
                const idx = (a < lv ? 1 : 0) | (b < lv ? 2 : 0) | (c < lv ? 4 : 0) | (d < lv ? 8 : 0);
                if (idx === 0 || idx === 15) continue;
                const X = ox + (x + 0.5) * s;
                const Y = oy + (y + 0.5) * s;
                const e = (p: number, q: number): number => clamp01((lv - p) / (q - p));
                const top: V2 = [X + e(a, b) * s, Y];
                const right: V2 = [X + s, Y + e(b, c) * s];
                const bot: V2 = [X + e(d, c) * s, Y + s];
                const left: V2 = [X, Y + e(a, d) * s];
                const seg = (p: V2, q: V2): void => {
                  g.moveTo(p[0], p[1]);
                  g.lineTo(q[0], q[1]);
                };
                switch (idx) {
                  case 1: case 14: seg(left, top); break;
                  case 2: case 13: seg(top, right); break;
                  case 3: case 12: seg(left, right); break;
                  case 4: case 11: seg(right, bot); break;
                  case 6: case 9: seg(top, bot); break;
                  case 7: case 8: seg(left, bot); break;
                  case 5: seg(left, top); seg(right, bot); break;
                  case 10: seg(top, right); seg(left, bot); break;
                }
              }
          };
          g.lineJoin = 'round';
          g.lineCap = 'round';
          g.beginPath();
          for (let lv = band; lv < T; lv += band) iso(lv);
          g.strokeStyle = 'rgba(255,255,255,0.75)';
          g.lineWidth = Math.max(0.8, s * 0.12);
          g.stroke();
          if (T < maxD) {
            g.beginPath();
            iso(T);
            g.strokeStyle = 'rgba(255,240,140,0.35)';
            g.lineWidth = Math.max(2, s * 0.6);
            g.stroke();
            g.strokeStyle = '#fff6b0';
            g.lineWidth = Math.max(1.2, s * 0.2);
            g.stroke();
          }
          // 가장 싼 길
          const pathK = (phaseT - DUR) / 0.9;
          if (pathK > 0) glowStroke(g, path.map((i) => cellC(fit, C, i)), pathK, '#ff3d7f', Math.max(1.4, s * 0.28));
          const sp = cellC(fit, C, src);
          g.fillStyle = '#fff';
          g.beginPath();
          g.arc(sp[0], sp[1], s * 0.7, 0, TAU);
          g.fill();
          g.fillStyle = '#ff3d7f';
          g.beginPath();
          g.arc(sp[0], sp[1], s * 0.42, 0, TAU);
          g.fill();
          const dp = cellC(fit, C, dst);
          drawFlag(g, dp[0], dp[1] + s * 0.4, s * 2, '#ff3d7f');
          // 머리 · 범례
          txt(g, flat ? '비용 모두 1' : '지형 비용', 7 * u, headH / 2 + 1 * u, 10.5 * u, '#fff2a8', 'left', 900);
          let lx = w - 6 * u;
          const items: [string, number][] = [['늪 5', 3], ['모래 3', 2], ['풀 2', 1], ['길 1', 0]];
          g.font = `800 ${7.5 * u}px ${F}`;
          for (const [s2, k] of items) {
            const tw = g.measureText(s2).width;
            txt(g, s2, lx, headH / 2 + 1 * u, 7.5 * u, '#e8ecf5', 'right', 800);
            lx -= tw + 4 * u;
            rr(g, lx - 7 * u, headH / 2 - 3 * u, 7 * u, 7 * u, 2 * u);
            g.fillStyle = TCOL[k]!;
            g.fill();
            lx -= 13 * u;
          }
          if (pathK > 1) pill(g, `걸린 시간 ${dist[dst]!.toFixed(0)}`, w / 2, h - 12 * u, 8 * u, 'rgba(255,61,127,0.92)');
          vignette(g, w, h, 0.25);
        },
        controls: [
          { type: 'toggle', label: '지형 비용 끄기 (모두 1)', value: false, on: (v) => ((flat = v), newProblem()) },
          { type: 'range', label: '속도', min: 0.3, max: 3, step: 0.1, value: 1, on: (v) => (speed = v) },
          { type: 'button', label: '새 출발점', on: () => (rounds++, newProblem()) },
          { type: 'button', label: '새 지도', on: () => (seed++, buildTerrain(), newProblem()) },
        ] as Control[],
      };
    },
  },
};

/* ───────── 내비 메시 도구 (들로네 삼각형 · 깔때기) ───────── */
interface DTri {
  a: number;
  b: number;
  c: number;
  cx: number;
  cy: number;
  r2: number;
}
function mkTri(P: V2[], a: number, b: number, c: number): DTri {
  const [ax, ay] = P[a]!;
  const [bx, by] = P[b]!;
  const [cx, cy] = P[c]!;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-12) return { a, b, c, cx: 0, cy: 0, r2: Infinity };
  const A = ax * ax + ay * ay;
  const B = bx * bx + by * by;
  const Cc = cx * cx + cy * cy;
  const ux = (A * (by - cy) + B * (cy - ay) + Cc * (ay - by)) / d;
  const uy = (A * (cx - bx) + B * (ax - cx) + Cc * (bx - ax)) / d;
  return { a, b, c, cx: ux, cy: uy, r2: (ax - ux) ** 2 + (ay - uy) ** 2 };
}
function delaunay(pts: V2[]): [number, number, number][] {
  const P = pts.slice();
  const n = P.length;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of P) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  const d = Math.max(x1 - x0, y1 - y0) * 20;
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  P.push([mx - d, my - d], [mx, my + d], [mx + d, my - d]);
  let tris: DTri[] = [mkTri(P, n, n + 1, n + 2)];
  for (let i = 0; i < n; i++) {
    const [px, py] = P[i]!;
    const keep: DTri[] = [];
    const edges = new Map<string, [number, number] | null>();
    for (const t of tris) {
      if ((px - t.cx) ** 2 + (py - t.cy) ** 2 < t.r2) {
        for (const [u, v] of [
          [t.a, t.b],
          [t.b, t.c],
          [t.c, t.a],
        ] as [number, number][]) {
          const k = u < v ? u + ',' + v : v + ',' + u;
          edges.set(k, edges.has(k) ? null : [u, v]);
        }
      } else keep.push(t);
    }
    tris = keep;
    for (const e of edges.values()) if (e) tris.push(mkTri(P, e[0], e[1], i));
  }
  return tris.filter((t) => t.a < n && t.b < n && t.c < n).map((t) => [t.a, t.b, t.c]);
}
function inPoly(p: V2, poly: V2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
const tri2 = (a: V2, b: V2, c: V2): number => (c[0] - a[0]) * (b[1] - a[1]) - (b[0] - a[0]) * (c[1] - a[1]);
function inTri(p: V2, a: V2, b: V2, c: V2, eps = 1e-4): boolean {
  const d1 = (p[0] - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (p[1] - b[1]);
  const d2 = (p[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (p[1] - c[1]);
  const d3 = (p[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (p[1] - a[1]);
  const neg = d1 < -eps || d2 < -eps || d3 < -eps;
  const pos = d1 > eps || d2 > eps || d3 > eps;
  return !(neg && pos);
}
function funnel(start: V2, end: V2, portals: [V2, V2][]): V2[] {
  const P: [V2, V2][] = [[start, start], ...portals, [end, end]];
  const path: V2[] = [start];
  let apex = start;
  let left = start;
  let right = start;
  let ai = 0;
  let li = 0;
  let ri = 0;
  const eq = (a: V2, b: V2): boolean => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
  for (let i = 1; i < P.length; i++) {
    const [L, Rr] = P[i]!;
    if (tri2(apex, right, Rr) <= 0) {
      if (eq(apex, right) || tri2(apex, left, Rr) > 0) {
        right = Rr;
        ri = i;
      } else {
        path.push(left);
        apex = left;
        ai = li;
        left = right = apex;
        li = ri = ai;
        i = ai;
        continue;
      }
    }
    if (tri2(apex, left, L) >= 0) {
      if (eq(apex, left) || tri2(apex, right, L) < 0) {
        left = L;
        li = i;
      } else {
        path.push(right);
        apex = right;
        ai = ri;
        left = right = apex;
        li = ri = ai;
        i = ai;
        continue;
      }
    }
  }
  const last = path[path.length - 1]!;
  if (!eq(last, end)) path.push(end);
  return path;
}
interface NavMesh {
  P: V2[];
  T: [number, number, number][];
  cen: V2[];
  nb: { o: number; u: number; v: number }[][];
  obs: V2[][];
  W: number;
  H: number;
}
function buildNav(seed: number): NavMesh {
  const W = 160;
  const H = 100;
  const r = rng(seed);
  const obs: V2[][] = [];
  const circ: [number, number, number][] = [];
  for (let k = 0; k < 60 && obs.length < 7; k++) {
    const hw = 5 + r() * 13;
    const hh = 3 + r() * 7;
    const rad = Math.hypot(hw, hh);
    const cx = 10 + rad + r() * (W - 20 - rad * 2);
    const cy = 8 + rad * 0.6 + r() * (H - 16 - rad * 1.2);
    if (circ.some(([x, y, q]) => Math.hypot(x - cx, y - cy) < q + rad + 9)) continue;
    const ang = (r() - 0.5) * 1.4;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const poly: V2[] = (
      [
        [-hw, -hh],
        [hw, -hh],
        [hw, hh],
        [-hw, hh],
      ] as V2[]
    ).map(([x, y]) => [cx + x * ca - y * sa, cy + x * sa + y * ca]);
    if (poly.some(([x, y]) => x < 5 || y < 5 || x > W - 5 || y > H - 5)) continue;
    obs.push(poly);
    circ.push([cx, cy, rad]);
  }
  const pts: V2[] = [];
  const jit = (): number => (r() - 0.5) * 0.02;
  const addEdge = (a: V2, b: V2, sp: number): void => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(L / sp));
    for (let i = 0; i < n; i++) pts.push([lerp(a[0], b[0], i / n) + jit(), lerp(a[1], b[1], i / n) + jit()]);
  };
  const room: V2[] = [
    [0, 0],
    [W, 0],
    [W, H],
    [0, H],
  ];
  for (let i = 0; i < 4; i++) addEdge(room[i]!, room[(i + 1) % 4]!, 12);
  for (const o of obs) for (let i = 0; i < o.length; i++) addEdge(o[i]!, o[(i + 1) % o.length]!, 6.5);
  const T = delaunay(pts).filter(([a, b, c]) => {
    const m: V2 = [(pts[a]![0] + pts[b]![0] + pts[c]![0]) / 3, (pts[a]![1] + pts[b]![1] + pts[c]![1]) / 3];
    if (obs.some((o) => inPoly(m, o))) return false;
    // 장애물 꼭짓점을 품은 얇은 삼각형도 걸러 낸다
    for (const o of obs) {
      for (let q = 0; q < 3; q++) {
        const e0 = pts[[a, b, c][q]!]!;
        const e1 = pts[[a, b, c][(q + 1) % 3]!]!;
        const mid: V2 = [lerp((e0[0] + e1[0]) / 2, m[0], 0.12), lerp((e0[1] + e1[1]) / 2, m[1], 0.12)];
        if (inPoly(mid, o)) return false;
      }
    }
    return true;
  });
  const cen: V2[] = T.map(([a, b, c]) => [(pts[a]![0] + pts[b]![0] + pts[c]![0]) / 3, (pts[a]![1] + pts[b]![1] + pts[c]![1]) / 3]);
  const em = new Map<string, number[]>();
  T.forEach((t, ti) => {
    for (let q = 0; q < 3; q++) {
      const u = t[q]!;
      const v = t[(q + 1) % 3]!;
      const k = u < v ? u + ',' + v : v + ',' + u;
      const l = em.get(k);
      if (l) l.push(ti);
      else em.set(k, [ti]);
    }
  });
  const nb: { o: number; u: number; v: number }[][] = T.map(() => []);
  for (const [k, l] of em) {
    if (l.length !== 2) continue;
    const [u, v] = k.split(',').map(Number) as [number, number];
    nb[l[0]!]!.push({ o: l[1]!, u, v });
    nb[l[1]!]!.push({ o: l[0]!, u, v });
  }
  return { P: pts, T, cen, nb, obs, W, H };
}
function locateTri(M: NavMesh, p: V2): number {
  for (let i = 0; i < M.T.length; i++) {
    const [a, b, c] = M.T[i]!;
    if (inTri(p, M.P[a]!, M.P[b]!, M.P[c]!, 0)) return i;
  }
  return -1;
}
function triCorridor(M: NavMesh, s: number, e: number): number[] {
  const N = M.T.length;
  const g = new Float32Array(N).fill(Infinity);
  const par = new Int32Array(N).fill(-1);
  const heap = new Heap();
  const hd = (i: number): number => Math.hypot(M.cen[i]![0] - M.cen[e]![0], M.cen[i]![1] - M.cen[e]![1]);
  g[s] = 0;
  heap.push(hd(s), s);
  const closed = new Uint8Array(N);
  while (heap.size) {
    const i = heap.pop();
    if (closed[i]) continue;
    closed[i] = 1;
    if (i === e) break;
    for (const { o, u, v } of M.nb[i]!) {
      const mid: V2 = [(M.P[u]![0] + M.P[v]![0]) / 2, (M.P[u]![1] + M.P[v]![1]) / 2];
      const ng = g[i]! + Math.hypot(mid[0] - M.cen[i]![0], mid[1] - M.cen[i]![1]) + Math.hypot(M.cen[o]![0] - mid[0], M.cen[o]![1] - mid[1]);
      if (ng < g[o]!) {
        g[o] = ng;
        par[o] = i;
        heap.push(ng + hd(o), o);
      }
    }
  }
  if (!closed[e]) return [];
  const out: number[] = [];
  for (let c = e; c >= 0; c = par[c]!) out.unshift(c);
  return out;
}
function polyLen(p: V2[]): number {
  let L = 0;
  for (let i = 1; i < p.length; i++) L += Math.hypot(p[i]![0] - p[i - 1]![0], p[i]![1] - p[i - 1]![1]);
  return L;
}
function alongPoly(p: V2[], d: number): [V2, number] {
  let left = d;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1]!;
    const b = p[i]!;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (left <= L) {
      const k = L ? left / L : 0;
      return [[a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], Math.atan2(b[1] - a[1], b[0] - a[0])];
    }
    left -= L;
  }
  const n = p.length;
  const a = p[Math.max(0, n - 2)]!;
  const b = p[n - 1]!;
  return [b, Math.atan2(b[1] - a[1], b[0] - a[0])];
}

/* ───────── 그림자 던지기 시야 ───────── */
function shadowcast(C: number, R: number, opaque: (x: number, y: number) => boolean, ox: number, oy: number, radius: number, vis: Uint8Array): void {
  vis.fill(0);
  vis[oy * C + ox] = 1;
  const M = [
    [1, 0, 0, -1, -1, 0, 0, 1],
    [0, 1, -1, 0, 0, -1, 1, 0],
    [0, 1, 1, 0, 0, -1, -1, 0],
    [1, 0, 0, 1, -1, 0, 0, -1],
  ];
  const cast = (row: number, start: number, end: number, xx: number, xy: number, yx: number, yy: number): void => {
    if (start < end) return;
    let newStart = 0;
    for (let j = row; j <= radius; j++) {
      let dx = -j - 1;
      const dy = -j;
      let blocked = false;
      while (dx <= 0) {
        dx++;
        const X = ox + dx * xx + dy * xy;
        const Y = oy + dx * yx + dy * yy;
        const lS = (dx - 0.5) / (dy + 0.5);
        const rS = (dx + 0.5) / (dy - 0.5);
        if (start < rS) continue;
        else if (end > lS) break;
        const inb = X >= 0 && Y >= 0 && X < C && Y < R;
        if (inb && dx * dx + dy * dy < radius * radius) vis[Y * C + X] = 1;
        const op = !inb || opaque(X, Y);
        if (blocked) {
          if (op) {
            newStart = rS;
            continue;
          } else {
            blocked = false;
            start = newStart;
          }
        } else if (op && j < radius) {
          blocked = true;
          cast(j + 1, start, lS, xx, xy, yx, yy);
          newStart = rS;
        }
      }
      if (blocked) break;
    }
  };
  for (let o = 0; o < 8; o++) cast(1, 1, 0, M[0]![o]!, M[1]![o]!, M[2]![o]!, M[3]![o]!);
}
interface Dungeon {
  C: number;
  R: number;
  wall: Uint8Array;
  rooms: V2[];
  id: number;
}
function makeDungeon(C: number, R: number, seed: number): Dungeon {
  const r = rng(seed);
  const wall = new Uint8Array(C * R).fill(1);
  const rects: [number, number, number, number][] = [];
  for (let k = 0; k < 80 && rects.length < 10; k++) {
    const w = 4 + Math.floor(r() * 6);
    const h = 3 + Math.floor(r() * 4);
    const x = 1 + Math.floor(r() * (C - w - 2));
    const y = 1 + Math.floor(r() * (R - h - 2));
    if (rects.some(([a, b, c, d]) => x < a + c + 2 && x + w + 2 > a && y < b + d + 2 && y + h + 2 > b)) continue;
    rects.push([x, y, w, h]);
  }
  rects.sort((a, b) => a[0] + a[1] * 0.3 - (b[0] + b[1] * 0.3));
  for (const [x, y, w, h] of rects) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) wall[yy * C + xx] = 0;
    if (w >= 6 && h >= 5) {
      wall[(y + 1) * C + x + 1] = 1;
      wall[(y + h - 2) * C + x + w - 2] = 1;
      if (r() < 0.6) wall[(y + 1) * C + x + w - 2] = 1;
    }
  }
  const rooms: V2[] = rects.map(([x, y, w, h]) => [x + (w >> 1), y + (h >> 1)]);
  const carve = (x: number, y: number): void => {
    wall[y * C + x] = 0;
  };
  for (let i = 0; i + 1 < rooms.length; i++) {
    const [ax, ay] = rooms[i]!;
    const [bx, by] = rooms[i + 1]!;
    if (r() < 0.5) {
      for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) carve(x, ay);
      for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) carve(bx, y);
    } else {
      for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) carve(ax, y);
      for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) carve(x, by);
    }
  }
  for (const [x, y] of rooms) carve(x, y);
  return { C, R, wall, rooms, id: seed };
}
function bfsPath(C: number, R: number, block: (i: number) => boolean, s: number, e: number): number[] {
  const par = new Int32Array(C * R).fill(-2);
  par[s] = -1;
  const q = [s];
  for (let h = 0; h < q.length; h++) {
    const i = q[h]!;
    if (i === e) break;
    const x = i % C;
    const y = (i / C) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d]!;
      const ny = y + DY[d]!;
      if (nx < 0 || ny < 0 || nx >= C || ny >= R) continue;
      const j = ny * C + nx;
      if (par[j] !== -2 || block(j)) continue;
      par[j] = i;
      q.push(j);
    }
  }
  if (par[e] === -2) return [];
  const out: number[] = [];
  for (let c = e; c >= 0; c = par[c]!) out.unshift(c);
  return out;
}
function drawHero(g: G, x: number, y: number, s: number, ang: number, col = '#ffd166'): void {
  g.fillStyle = 'rgba(0,0,0,0.4)';
  g.beginPath();
  g.ellipse(x, y + s * 0.35, s * 0.42, s * 0.18, 0, 0, TAU);
  g.fill();
  g.fillStyle = col;
  g.beginPath();
  g.arc(x, y, s * 0.42, 0, TAU);
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.45)';
  g.lineWidth = Math.max(0.8, s * 0.07);
  g.stroke();
  const ex = Math.cos(ang) * s * 0.16;
  const ey = Math.sin(ang) * s * 0.12;
  g.fillStyle = '#1b1b2a';
  for (const sgn of [-1, 1]) {
    g.beginPath();
    g.arc(x + ex - Math.sin(ang) * s * 0.13 * sgn, y + ey - s * 0.05 + Math.cos(ang) * s * 0.08 * sgn, s * 0.065, 0, TAU);
    g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,0.45)';
  g.beginPath();
  g.arc(x - s * 0.15, y - s * 0.18, s * 0.11, 0, TAU);
  g.fill();
}

/* ───────── 노선도 자료 ───────── */
const ST: [number, number, string][] = [
  [0, 4, '해돋이'],
  [2, 4, '솔숲'],
  [4, 4, '별빛'],
  [6, 4, '중앙'],
  [8, 4, '시장'],
  [10, 4, '강변'],
  [12, 4, '바다'],
  [6, 0, '북문'],
  [6, 2, '학교'],
  [6, 6, '공원'],
  [6, 8, '남문'],
  [2, 2, '숲속'],
  [8, 8, '호수'],
  [10, 8, '동산'],
  [12, 8, '끝마을'],
  [10, 0, '과학관'],
  [10, 2, '도서관'],
  [10, 6, '시청'],
];
const LINES: { name: string; col: string; st: number[] }[] = [
  { name: '1호선', col: '#ff5a5f', st: [0, 1, 2, 3, 4, 5, 6] },
  { name: '2호선', col: '#3fa7ff', st: [7, 8, 3, 9, 10] },
  { name: '3호선', col: '#3ddc84', st: [11, 2, 9, 12, 13, 14] },
  { name: '4호선', col: '#ffc53d', st: [15, 16, 5, 17, 13] },
];
const ST_GEO: V2[] = ST.map(([x, y], i) => {
  const cx = 6;
  const cy = 4;
  const dx = x - cx;
  const dy = y - cy;
  const d = Math.hypot(dx, dy) || 1;
  const k = Math.pow(d / 7, 0.55) * 7 / d;
  return [cx + dx * k * 1.05 + Math.sin(y * 0.9 + 1) * 0.9 + (hash2(i, 1, 5) - 0.5) * 1.3, cy + dy * k * 0.95 + Math.sin(x * 0.6) * 0.8 + (hash2(i, 2, 5) - 0.5) * 1.2];
});
/** 환승을 가장 적게 (같으면 역 수가 적게) */
function subwayRoute(a: number, b: number): { st: number[]; ln: number[]; transfers: number } | null {
  const key = (s: number, l: number): number => s * 8 + l;
  const dist = new Map<number, number>();
  const par = new Map<number, number>();
  const heap = new Heap();
  for (let l = 0; l < LINES.length; l++)
    if (LINES[l]!.st.includes(a)) {
      dist.set(key(a, l), 0);
      heap.push(0, key(a, l));
    }
  let endK = -1;
  while (heap.size) {
    const k = heap.pop();
    const s = (k / 8) | 0;
    const l = k % 8;
    const d = dist.get(k)!;
    if (s === b) {
      endK = k;
      break;
    }
    const st = LINES[l]!.st;
    const p = st.indexOf(s);
    for (const q of [p - 1, p + 1]) {
      if (q < 0 || q >= st.length) continue;
      const nk = key(st[q]!, l);
      if (d + 1 < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, d + 1);
        par.set(nk, k);
        heap.push(d + 1, nk);
      }
    }
    for (let l2 = 0; l2 < LINES.length; l2++) {
      if (l2 === l || !LINES[l2]!.st.includes(s)) continue;
      const nk = key(s, l2);
      if (d + 1000 < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, d + 1000);
        par.set(nk, k);
        heap.push(d + 1000, nk);
      }
    }
  }
  if (endK < 0) return null;
  const st: number[] = [];
  const ln: number[] = [];
  for (let k: number | undefined = endK; k !== undefined; k = par.get(k)) {
    const s = (k / 8) | 0;
    if (st[0] === s) {
      ln[0] = k % 8;
      continue;
    }
    st.unshift(s);
    ln.unshift(k % 8);
  }
  let transfers = 0;
  for (let i = 1; i < ln.length; i++) if (ln[i] !== ln[i - 1]) transfers++;
  return { st, ln, transfers };
}

/* ═════════ 묶음 2 : i267 · i268 · i269 · i270 ═════════ */
const D2: DemoMap = {
  i267: {
    kind: '2d',
    caption: '걸을 수 있는 땅을 삼각형으로 → 삼각형 줄(파랑) → 꼬불꼬불 중심 길 대신 깔때기로 당긴 곧은 길(노랑)',
    make() {
      let seed = 2;
      let M = buildNav(seed);
      let speed = 1;
      let showMesh = true;
      let useFunnel = true;
      let phaseT = 0;
      let prob = 0;
      let start: V2 = [0, 0];
      let goal: V2 = [0, 0];
      let corridor: number[] = [];
      let portals: [V2, V2][] = [];
      let zig: V2[] = [];
      let straight: V2[] = [];
      const layer = new Layer();
      const freeAt = (p: V2): boolean => locateTri(M, p) >= 0 && M.obs.every((o) => !inPoly(p, o));
      const meshHas = (p: V2): boolean => {
        for (const [a, b, c] of M.T) if (inTri(p, M.P[a]!, M.P[b]!, M.P[c]!, 1e-3)) return true;
        return false;
      };
      const valid = (path: V2[]): boolean => {
        for (let i = 1; i < path.length; i++)
          for (let k = 1; k < 16; k++) {
            const a = path[i - 1]!;
            const b = path[i]!;
            if (!meshHas([lerp(a[0], b[0], k / 16), lerp(a[1], b[1], k / 16)])) return false;
          }
        return true;
      };
      const newProblem = (): void => {
        prob++;
        const r = rng(seed * 1000 + prob);
        for (let tries = 0; tries < 200; tries++) {
          const a: V2 = [4 + r() * 30, 4 + r() * (M.H - 8)];
          const b: V2 = [M.W - 34 + r() * 30, 4 + r() * (M.H - 8)];
          if (r() < 0.5) {
            a[0] = M.W - a[0];
            b[0] = M.W - b[0];
          }
          if (!freeAt(a) || !freeAt(b)) continue;
          const ta = locateTri(M, a);
          const tb = locateTri(M, b);
          const cor = triCorridor(M, ta, tb);
          if (cor.length < 3) continue;
          start = a;
          goal = b;
          corridor = cor;
          break;
        }
        const raw: [V2, V2][] = [];
        for (let i = 0; i + 1 < corridor.length; i++) {
          const e = M.nb[corridor[i]!]!.find((n) => n.o === corridor[i + 1])!;
          const p = M.P[e.u]!;
          const q = M.P[e.v]!;
          const c = M.cen[corridor[i]!]!;
          raw.push(tri2(c, p, q) > 0 ? [p, q] : [q, p]);
        }
        portals = raw;
        straight = funnel(start, goal, raw);
        if (!valid(straight)) {
          portals = raw.map(([p, q]) => [q, p]);
          straight = funnel(start, goal, portals);
        }
        zig = [start, ...corridor.slice(1, -1).map((i) => M.cen[i]!), goal];
        phaseT = 0;
      };
      newProblem();
      const TRI_COL = ['#7fd3ff', '#a7f3d0', '#c4b5fd', '#fde68a', '#fbcfe8'];
      return {
        draw(g, w, h, t, dt) {
          reset(g);
          const u = scaleOf(w, h);
          const dpr = dprOf(g);
          phaseT += Math.min(dt, 0.1) * speed;
          bgGrad(g, w, h, '#1c2234', '#0e1220');
          const pad = 8 * u;
          const headH = 16 * u;
          const k = Math.min((w - pad * 2) / M.W, (h - headH - pad * 1.3) / M.H);
          const ox = (w - M.W * k) / 2;
          const oy = headH + (h - headH - pad * 0.5 - M.H * k) / 2;
          const S = (p: V2): V2 => [ox + p[0] * k, oy + p[1] * k];
          const L = layer.get(`${seed}|${w}|${h}|${dpr}|${showMesh}`, w, h, dpr, (lg) => {
            rr(lg, ox - 4 * u, oy - 4 * u, M.W * k + 8 * u, M.H * k + 8 * u, 6 * u);
            lg.fillStyle = '#3a3346';
            lg.fill();
            lg.fillStyle = '#2a3142';
            lg.fillRect(ox, oy, M.W * k, M.H * k);
            // 바닥 돌 판
            const tile = 10 * k;
            lg.save();
            lg.beginPath();
            lg.rect(ox, oy, M.W * k, M.H * k);
            lg.clip();
            for (let y = 0; y < M.H * k; y += tile)
              for (let x = 0; x < M.W * k; x += tile) {
                lg.fillStyle = `rgba(255,255,255,${0.02 + 0.03 * hash2(x | 0, y | 0, 4)})`;
                lg.fillRect(ox + x + 0.5, oy + y + 0.5, tile - 1, tile - 1);
              }
            lg.restore();
            if (showMesh) {
              M.T.forEach(([a, b, c], i) => {
                const pa = S(M.P[a]!);
                const pb = S(M.P[b]!);
                const pc = S(M.P[c]!);
                lg.beginPath();
                lg.moveTo(pa[0], pa[1]);
                lg.lineTo(pb[0], pb[1]);
                lg.lineTo(pc[0], pc[1]);
                lg.closePath();
                lg.globalAlpha = 0.09;
                lg.fillStyle = TRI_COL[i % TRI_COL.length]!;
                lg.fill();
                lg.globalAlpha = 1;
                lg.strokeStyle = 'rgba(140,220,255,0.33)';
                lg.lineWidth = Math.max(0.6, 0.7 * u);
                lg.stroke();
              });
            }
            // 장애물: 그림자 → 옆면 → 윗면
            for (const o of M.obs) {
              const sp = o.map(S);
              const poly = (dx: number, dy: number): void => {
                lg.beginPath();
                sp.forEach(([x, y], i) => (i ? lg.lineTo(x + dx, y + dy) : lg.moveTo(x + dx, y + dy)));
                lg.closePath();
              };
              poly(3 * u, 4 * u);
              lg.fillStyle = 'rgba(0,0,0,0.45)';
              lg.fill();
              poly(0, 0);
              lg.fillStyle = '#5b4636';
              lg.fill();
              poly(0, -3 * u);
              const gr = lg.createLinearGradient(sp[0]![0], sp[0]![1] - 20 * u, sp[2]![0], sp[2]![1]);
              gr.addColorStop(0, '#c9a27a');
              gr.addColorStop(1, '#8d6a4c');
              lg.fillStyle = gr;
              lg.fill();
              lg.strokeStyle = 'rgba(60,40,25,0.6)';
              lg.lineWidth = 1 * u;
              lg.stroke();
              // 나무 판 줄
              lg.save();
              lg.clip();
              lg.strokeStyle = 'rgba(80,55,35,0.35)';
              for (let q = -40; q < 40; q += 4) {
                lg.beginPath();
                lg.moveTo(sp[0]![0] + q * u * 1.5, sp[0]![1] - 30 * u);
                lg.lineTo(sp[0]![0] + q * u * 1.5 + 30 * u, sp[0]![1] + 30 * u);
                lg.stroke();
              }
              lg.restore();
            }
          });
          g.drawImage(L, 0, 0, w, h);
          // 단계: 삼각형 줄 → 중심 길 → 문(포털) → 곧은 길 → 걷기
          const tA = 1.1;
          const tB = tA + 0.7;
          const tC = tB + 0.9;
          const walkLen = polyLen(useFunnel ? straight : zig);
          const tD = tC + Math.min(3, walkLen / 45);
          if (phaseT > tD + 0.9) newProblem();
          const nCor = Math.min(corridor.length, Math.floor((phaseT / tA) * corridor.length) + 1);
          for (let i = 0; i < nCor; i++) {
            const [a, b, c] = M.T[corridor[i]!]!;
            const pa = S(M.P[a]!);
            const pb = S(M.P[b]!);
            const pc = S(M.P[c]!);
            g.beginPath();
            g.moveTo(pa[0], pa[1]);
            g.lineTo(pb[0], pb[1]);
            g.lineTo(pc[0], pc[1]);
            g.closePath();
            const fresh = i === nCor - 1 && phaseT < tA;
            g.fillStyle = fresh ? 'rgba(160,230,255,0.75)' : 'rgba(80,170,255,0.32)';
            g.fill();
            g.strokeStyle = 'rgba(150,215,255,0.8)';
            g.lineWidth = 0.8 * u;
            g.stroke();
          }
          // 중심 길 (지그재그)
          if (phaseT > tA) {
            g.setLineDash([3 * u, 3 * u]);
            g.strokeStyle = 'rgba(255,255,255,0.75)';
            g.lineWidth = 1.3 * u;
            strokePathPart(g, zig.map(S), (phaseT - tA) / (tB - tA));
            g.setLineDash([]);
            g.fillStyle = 'rgba(255,255,255,0.8)';
            for (const p of zig.slice(1, -1)) {
              const q = S(p);
              g.beginPath();
              g.arc(q[0], q[1], 1.6 * u, 0, TAU);
              g.fill();
            }
          }
          // 포털과 깔때기 곧은 길
          if (phaseT > tB && useFunnel) {
            const pk = clamp01((phaseT - tB) / (tC - tB));
            const nP = Math.floor(pk * portals.length);
            g.lineCap = 'round';
            for (let i = 0; i < Math.min(portals.length, nP + 1); i++) {
              const [l, r] = portals[i]!;
              const a = S(l);
              const b = S(r);
              g.strokeStyle = 'rgba(255,214,102,0.45)';
              g.lineWidth = 2 * u;
              g.beginPath();
              g.moveTo(a[0], a[1]);
              g.lineTo(b[0], b[1]);
              g.stroke();
            }
            glowStroke(g, straight.map(S), pk, '#ffd166', 2.4 * u);
            for (const p of straight.slice(1, -1)) {
              const q = S(p);
              g.fillStyle = '#fff';
              g.beginPath();
              g.arc(q[0], q[1], 2.4 * u, 0, TAU);
              g.fill();
            }
          }
          // 걷는 캐릭터
          const path = useFunnel ? straight : zig;
          const wk = clamp01((phaseT - tC) / (tD - tC));
          const [pos, ang] = alongPoly(path, ease(wk) * polyLen(path));
          const sp = S(start);
          const gp = S(goal);
          drawFlag(g, sp[0], sp[1] + 2 * u, 13 * u, '#3ddc84');
          drawPin(g, gp[0], gp[1] + 2 * u, 13 * u, '#ff4f6b', t);
          const hp = S(pos);
          drawHero(g, hp[0], hp[1], 11 * u, ang, '#ffd166');
          txt(g, '내비 메시', 8 * u, headH / 2 + 1 * u, 10.5 * u, '#9fe0ff', 'left', 900);
          const step = phaseT < tA ? '① 삼각형 줄 찾기' : phaseT < tB ? '② 중심을 이은 길' : phaseT < tC ? (useFunnel ? '③ 깔때기로 당기기' : '③ 중심 길 그대로') : '④ 걷기';
          pill(g, `${step} · 삼각형 ${M.T.length}개`, w - 7 * u, headH / 2 + 1 * u, 7.5 * u, 'rgba(255,255,255,0.12)', '#e8ecff', 'right');
          if (phaseT > tC) {
            const a = polyLen(zig);
            const b = polyLen(straight);
            pill(g, `중심 길 ${a.toFixed(0)} → 곧은 길 ${b.toFixed(0)}`, w / 2, h - 9 * u, 7.5 * u, 'rgba(255,190,60,0.92)', '#2a1a00');
          }
        },
        controls: [
          { type: 'toggle', label: '삼각형 보기', value: true, on: (v) => (showMesh = v) },
          { type: 'toggle', label: '깔때기로 곧게 (끄면 중심 길)', value: true, on: (v) => ((useFunnel = v), (phaseT = 0)) },
          { type: 'range', label: '속도', min: 0.3, max: 3, step: 0.1, value: 1, on: (v) => (speed = v) },
          { type: 'button', label: '새 문제', on: newProblem },
          { type: 'button', label: '새 방', on: () => ((seed++), (M = buildNav(seed)), newProblem()) },
        ] as Control[],
      };
    },
  },

  i268: {
    kind: '2d',
    caption: '횃불 든 탐험가 — 벽 뒤는 그림자로 가려지고, 한 번 본 칸은 푸르스름하게 기억, 아직 못 본 곳은 까맣게',
    make() {
      const C = 44;
      const R = 27;
      let seed = 5;
      let D = makeDungeon(C, R, seed);
      const vis = new Uint8Array(C * R);
      let seen = new Uint8Array(C * R);
      let radius = 8;
      let memory = true;
      let speed = 1;
      let path: number[] = [];
      let pi = 0;
      let frac = 0;
      let lastCell = -1;
      let roomI = 0;
      let born = 0;
      let nowT = 0;
      const lit = new Layer();
      const mem = new Layer();
      const opaque = (x: number, y: number): boolean => D.wall[y * C + x] === 1;
      const reset2 = (): void => {
        D = makeDungeon(C, R, seed);
        seen = new Uint8Array(C * R);
        roomI = 0;
        const [x, y] = D.rooms[0]!;
        path = [y * C + x];
        pi = 0;
        frac = 0;
        lastCell = -1;
        born = nowT;
      };
      reset2();
      const nextTarget = (): void => {
        const cur = path[path.length - 1]!;
        const r = rng(seed * 50 + roomI);
        let best: number[] = [];
        for (let k = 0; k < 6; k++) {
          const [x, y] = D.rooms[Math.floor(r() * D.rooms.length)]!;
          const p = bfsPath(C, R, (j) => D.wall[j] === 1, cur, y * C + x);
          let unseen = 0;
          for (const c of p) if (!seen[c]) unseen++;
          if (p.length > 1 && (best.length === 0 || unseen > 0)) best = p;
          if (unseen > 4) break;
        }
        roomI++;
        path = best.length ? best : [cur];
        pi = 0;
        frac = 0;
      };
      const paintDungeon = (lg: G, fit: Fit): void => {
        const { s, ox, oy } = fit;
        lg.fillStyle = '#07070c';
        lg.fillRect(ox, oy, C * s, R * s);
        for (let i = 0; i < C * R; i++) {
          const x = ox + (i % C) * s;
          const y = oy + ((i / C) | 0) * s;
          if (!D.wall[i]) {
            const v = 0.85 + 0.25 * hash2(i, 7, D.id);
            lg.fillStyle = css([118 * v, 98 * v, 80 * v]);
            lg.fillRect(x, y, s, s);
            lg.fillStyle = 'rgba(40,28,20,0.5)';
            lg.fillRect(x, y + s - Math.max(0.6, s * 0.08), s, Math.max(0.6, s * 0.08));
            lg.fillRect(x + s - Math.max(0.6, s * 0.08), y, Math.max(0.6, s * 0.08), s);
            if (hash2(i, 9, D.id) < 0.12) {
              lg.fillStyle = 'rgba(60,45,35,0.6)';
              lg.beginPath();
              lg.arc(x + s * 0.4, y + s * 0.5, s * 0.12, 0, TAU);
              lg.fill();
            }
          }
        }
        for (let i = 0; i < C * R; i++) {
          if (!D.wall[i]) continue;
          const cx = i % C;
          const cy = (i / C) | 0;
          let nearFloor = false;
          for (let d = 0; d < 8; d++) {
            const nx = cx + DX[d]!;
            const ny = cy + DY[d]!;
            if (nx >= 0 && ny >= 0 && nx < C && ny < R && !D.wall[ny * C + nx]) nearFloor = true;
          }
          if (!nearFloor) continue;
          const x = ox + cx * s;
          const y = oy + cy * s;
          lg.fillStyle = '#3b3442';
          lg.fillRect(x, y, s, s);
          lg.fillStyle = '#5d5468';
          lg.fillRect(x, y, s, s * 0.62);
          lg.fillStyle = 'rgba(255,255,255,0.12)';
          lg.fillRect(x, y, s, Math.max(0.6, s * 0.1));
          lg.strokeStyle = 'rgba(0,0,0,0.35)';
          lg.lineWidth = Math.max(0.5, s * 0.06);
          lg.beginPath();
          lg.moveTo(x + s * (cy % 2 ? 0.3 : 0.7), y);
          lg.lineTo(x + s * (cy % 2 ? 0.3 : 0.7), y + s * 0.62);
          lg.stroke();
        }
      };
      return {
        draw(g, w, h, t, dt) {
          reset(g);
          nowT = t;
          const u = scaleOf(w, h);
          const dpr = dprOf(g);
          // 움직이기
          frac += Math.min(dt, 0.1) * speed * 7;
          while (frac >= 1) {
            frac -= 1;
            pi++;
            if (pi >= path.length - 1) nextTarget();
          }
          const ci = path[Math.min(pi, path.length - 1)]!;
          const ni = path[Math.min(pi + 1, path.length - 1)]!;
          if (ci !== lastCell) {
            shadowcast(C, R, opaque, ci % C, (ci / C) | 0, radius, vis);
            for (let i = 0; i < C * R; i++) if (vis[i]) seen[i] = 1;
            lastCell = ci;
          }
          let floorN = 0;
          let seenN = 0;
          for (let i = 0; i < C * R; i++)
            if (!D.wall[i]) {
              floorN++;
              if (seen[i]) seenN++;
            }
          if (seenN / floorN > 0.9 || t - born > 30 || t < born) {
            seed++;
            reset2();
          }
          g.fillStyle = '#050508';
          g.fillRect(0, 0, w, h);
          const headH = 16 * u;
          const fit = fitGrid(C, R, 4 * u, headH, w - 8 * u, h - headH - 4 * u);
          const { s, ox, oy } = fit;
          const key = `${D.id}|${w}|${h}|${dpr}`;
          const LL = lit.get(key, w, h, dpr, (lg) => paintDungeon(lg, fit));
          const ML = mem.get(key, w, h, dpr, (lg) => {
            lg.filter = 'grayscale(0.85) brightness(0.42)';
            lg.drawImage(LL, 0, 0, w, h);
            lg.filter = 'none';
            lg.globalCompositeOperation = 'source-atop';
            lg.fillStyle = 'rgba(40,70,140,0.28)';
            lg.fillRect(0, 0, w, h);
            lg.globalCompositeOperation = 'source-over';
          });
          if (memory) {
            g.drawImage(ML, 0, 0, w, h);
            g.fillStyle = '#050508';
            g.beginPath();
            for (let i = 0; i < C * R; i++) if (!seen[i]) g.rect(ox + (i % C) * s - 0.3, oy + ((i / C) | 0) * s - 0.3, s + 0.6, s + 0.6);
            g.fill();
          }
          // 보이는 칸
          const hx = ox + (lerp(ci % C, ni % C, frac) + 0.5) * s;
          const hy = oy + (lerp((ci / C) | 0, (ni / C) | 0, frac) + 0.5) * s;
          g.save();
          g.beginPath();
          for (let i = 0; i < C * R; i++) if (vis[i]) g.rect(ox + (i % C) * s - 0.3, oy + ((i / C) | 0) * s - 0.3, s + 0.6, s + 0.6);
          g.clip();
          g.drawImage(LL, 0, 0, w, h);
          const fl = 1 + 0.04 * Math.sin(t * 17) + 0.03 * Math.sin(t * 29);
          const R0 = radius * s * fl;
          const gr = g.createRadialGradient(hx, hy, 0, hx, hy, R0);
          gr.addColorStop(0, 'rgba(255,200,120,0.28)');
          gr.addColorStop(0.45, 'rgba(255,150,60,0.08)');
          gr.addColorStop(0.8, 'rgba(10,8,20,0.45)');
          gr.addColorStop(1, 'rgba(5,5,10,0.75)');
          g.fillStyle = gr;
          g.fillRect(hx - R0, hy - R0, R0 * 2, R0 * 2);
          g.restore();
          g.globalCompositeOperation = 'lighter';
          const glow = g.createRadialGradient(hx, hy, 0, hx, hy, s * 2.2);
          glow.addColorStop(0, 'rgba(255,190,90,0.55)');
          glow.addColorStop(1, 'rgba(255,120,40,0)');
          g.fillStyle = glow;
          g.fillRect(hx - s * 2.2, hy - s * 2.2, s * 4.4, s * 4.4);
          g.globalCompositeOperation = 'source-over';
          const ang = Math.atan2(((ni / C) | 0) - ((ci / C) | 0), (ni % C) - (ci % C));
          drawHero(g, hx, hy, s * 1.25, ang, '#7fd3ff');
          // 횃불
          g.fillStyle = '#ffdf7a';
          g.beginPath();
          g.arc(hx + s * 0.45, hy - s * 0.45 + Math.sin(t * 20) * s * 0.03, s * 0.2, 0, TAU);
          g.fill();
          txt(g, '시야 · 가림', 7 * u, headH / 2 + 1 * u, 10.5 * u, '#ffd38a', 'left', 900);
          pill(g, `본 칸 ${Math.round((seenN / floorN) * 100)}% · 반경 ${radius}`, w - 6 * u, headH / 2 + 1 * u, 7.5 * u, 'rgba(255,255,255,0.12)', '#e8ecff', 'right');
        },
        controls: [
          { type: 'range', label: '횃불 반경', min: 3, max: 14, step: 1, value: 8, on: (v) => ((radius = v), (lastCell = -1)) },
          { type: 'toggle', label: '본 칸 기억하기', value: true, on: (v) => (memory = v) },
          { type: 'range', label: '속도', min: 0.3, max: 3, step: 0.1, value: 1, on: (v) => (speed = v) },
          { type: 'button', label: '새 던전', on: () => (seed++, reset2()) },
        ] as Control[],
      };
    },
  },

  i269: {
    kind: '2d',
    caption: '가까운 곳부터 가는 욕심 길 → 엇갈린 두 길을 풀어 잇는 2-opt 로 점점 짧게 (빨강 = 끊는 길 · 초록 = 새로 잇는 길)',
    make() {
      let n = 16;
      let seed = 3;
      let speed = 1;
      let ghost = true;
      let pts: V2[] = [];
      let greedy: number[] = [];
      let moves: { i: number; k: number; before: number[] }[] = [];
      let finalT: number[] = [];
      let phaseT = 0;
      const AW = 1.6;
      const layer = new Layer();
      const D = (a: number, b: number): number => Math.hypot(pts[a]![0] - pts[b]![0], pts[a]![1] - pts[b]![1]);
      const tourLen = (o: number[]): number => {
        let L = 0;
        for (let i = 0; i < o.length; i++) L += D(o[i]!, o[(i + 1) % o.length]!);
        return L;
      };
      const gen = (): void => {
        const r = rng(seed);
        pts = [];
        for (let k = 0; k < 3000 && pts.length < n; k++) {
          const p: V2 = [0.06 + r() * (AW - 0.12), 0.07 + r() * 0.86];
          if (pts.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > 0.11)) pts.push(p);
        }
        const N = pts.length;
        const used = new Uint8Array(N);
        greedy = [0];
        used[0] = 1;
        for (let s = 1; s < N; s++) {
          const c = greedy[greedy.length - 1]!;
          let b = -1;
          for (let j = 0; j < N; j++) if (!used[j] && (b < 0 || D(c, j) < D(c, b))) b = j;
          greedy.push(b);
          used[b] = 1;
        }
        const o = greedy.slice();
        moves = [];
        for (let it = 0; it < 60; it++) {
          let best = -1e-9;
          let bi = -1;
          let bk = -1;
          for (let i = 1; i < N - 1; i++)
            for (let k = i + 1; k < N; k++) {
              const a = o[i - 1]!;
              const b = o[i]!;
              const c = o[k]!;
              const d = o[(k + 1) % N]!;
              const delta = D(a, c) + D(b, d) - D(a, b) - D(c, d);
              if (delta < best) {
                best = delta;
                bi = i;
                bk = k;
              }
            }
          if (bi < 0) break;
          moves.push({ i: bi, k: bk, before: o.slice() });
          const seg = o.slice(bi, bk + 1).reverse();
          o.splice(bi, seg.length, ...seg);
        }
        finalT = o;
        phaseT = 0;
      };
      gen();
      const HOUSE = ['#ff8fa3', '#8ecae6', '#ffd166', '#b8f2a1', '#cdb4ff'];
      return {
        draw(g, w, h, _t, dt) {
          reset(g);
          const u = scaleOf(w, h);
          const dpr = dprOf(g);
          phaseT += Math.min(dt, 0.1) * speed;
          const N = pts.length;
          const tBuild = N * 0.11;
          const tMove = 0.62;
          const tOpt = tBuild + 0.4 + moves.length * tMove;
          const tEnd = tOpt + 3.2;
          if (phaseT > tEnd) {
            seed++;
            gen();
          }
          const headH = 17 * u;
          const k = Math.min((w - 12 * u) / AW, h - headH - 8 * u);
          const ox = (w - AW * k) / 2;
          const oy = headH + 2 * u;
          const S = (i: number): V2 => [ox + pts[i]![0] * k, oy + pts[i]![1] * k];
          const L = layer.get(`${seed}|${n}|${w}|${h}|${dpr}`, w, h, dpr, (lg) => {
            bgGrad(lg, w, h, '#18233c', '#0d1424');
            rr(lg, ox - 4 * u, oy - 4 * u, AW * k + 8 * u, k + 8 * u, 7 * u);
            lg.fillStyle = '#1f2c48';
            lg.fill();
            lg.save();
            lg.clip();
            // 동네 블록 · 공원 · 강
            const r = rng(seed + 5);
            const bs = 0.1 * k;
            for (let y = oy - 4 * u; y < oy + k; y += bs)
              for (let x = ox - 4 * u; x < ox + AW * k; x += bs) {
                const park = r() < 0.08;
                rr(lg, x + bs * 0.12, y + bs * 0.12, bs * 0.76, bs * 0.76, bs * 0.12);
                lg.fillStyle = park ? '#24503f' : '#26355a';
                lg.fill();
                if (park) {
                  lg.fillStyle = '#2f6b50';
                  lg.beginPath();
                  lg.arc(x + bs * 0.4, y + bs * 0.45, bs * 0.16, 0, TAU);
                  lg.arc(x + bs * 0.62, y + bs * 0.6, bs * 0.12, 0, TAU);
                  lg.fill();
                }
              }
            lg.strokeStyle = 'rgba(70,140,220,0.55)';
            lg.lineWidth = bs * 0.5;
            lg.lineCap = 'round';
            lg.beginPath();
            lg.moveTo(ox + AW * k * 0.62, oy - 10);
            lg.bezierCurveTo(ox + AW * k * 0.5, oy + k * 0.35, ox + AW * k * 0.78, oy + k * 0.6, ox + AW * k * 0.66, oy + k + 10);
            lg.stroke();
            lg.restore();
          });
          g.drawImage(L, 0, 0, w, h);
          // 지금 순서 · 길
          let order: number[];
          let edges = 0;
          let mv: { i: number; k: number; before: number[] } | null = null;
          let mk2 = 0;
          if (phaseT < tBuild) {
            order = greedy;
            edges = Math.floor(phaseT / 0.11);
          } else if (phaseT < tOpt) {
            const m = Math.floor((phaseT - tBuild - 0.4) / tMove);
            if (m < 0) order = greedy;
            else {
              mv = moves[Math.min(m, moves.length - 1)]!;
              order = mv.before;
              mk2 = (phaseT - tBuild - 0.4 - m * tMove) / tMove;
            }
            edges = N;
          } else {
            order = finalT;
            edges = N;
          }
          const lw = Math.max(1.6, 2.2 * u);
          if (ghost && phaseT >= tOpt) {
            g.setLineDash([3 * u, 3 * u]);
            g.strokeStyle = 'rgba(255,170,90,0.45)';
            g.lineWidth = 1.2 * u;
            g.beginPath();
            greedy.forEach((i, q) => {
              const p = S(i);
              if (q) g.lineTo(p[0], p[1]);
              else g.moveTo(p[0], p[1]);
            });
            g.closePath();
            g.stroke();
            g.setLineDash([]);
          }
          const skip = new Set<string>();
          if (mv && mk2 < 1) {
            const a = order[mv.i - 1]!;
            const b = order[mv.i]!;
            const c = order[mv.k]!;
            const d = order[(mv.k + 1) % N]!;
            skip.add(a + '-' + b);
            skip.add(c + '-' + d);
          }
          g.lineCap = 'round';
          g.lineJoin = 'round';
          g.beginPath();
          for (let q = 0; q < Math.min(edges, N); q++) {
            const a = order[q]!;
            const b = q + 1 < N ? order[q + 1]! : order[0]!;
            if (q + 1 >= N && phaseT < tBuild) break;
            if (skip.has(a + '-' + b)) continue;
            const pa = S(a);
            const pb = S(b);
            g.moveTo(pa[0], pa[1]);
            g.lineTo(pb[0], pb[1]);
          }
          g.strokeStyle = 'rgba(80,200,255,0.25)';
          g.lineWidth = lw * 3;
          g.stroke();
          g.strokeStyle = '#6ad1ff';
          g.lineWidth = lw;
          g.stroke();
          if (phaseT < tBuild && edges < N) {
            const a = S(order[edges]!);
            const b = S(order[Math.min(edges + 1, N - 1)]!);
            const f = (phaseT % 0.11) / 0.11;
            g.strokeStyle = '#fff';
            g.lineWidth = lw;
            g.beginPath();
            g.moveTo(a[0], a[1]);
            g.lineTo(lerp(a[0], b[0], f), lerp(a[1], b[1], f));
            g.stroke();
          }
          if (mv && mk2 < 1) {
            const a = S(order[mv.i - 1]!);
            const b = S(order[mv.i]!);
            const c = S(order[mv.k]!);
            const d = S(order[(mv.k + 1) % N]!);
            const blink = 0.55 + 0.45 * Math.sin(phaseT * 30);
            const old = 1 - smooth(0.45, 0.8, mk2);
            g.strokeStyle = `rgba(255,70,90,${old * blink})`;
            g.lineWidth = lw * 1.3;
            g.beginPath();
            g.moveTo(a[0], a[1]);
            g.lineTo(b[0], b[1]);
            g.moveTo(c[0], c[1]);
            g.lineTo(d[0], d[1]);
            g.stroke();
            const nk = smooth(0.35, 0.85, mk2);
            g.strokeStyle = '#5dff9a';
            g.lineWidth = lw * 1.3;
            g.beginPath();
            g.moveTo(a[0], a[1]);
            g.lineTo(lerp(a[0], c[0], nk), lerp(a[1], c[1], nk));
            g.moveTo(b[0], b[1]);
            g.lineTo(lerp(b[0], d[0], nk), lerp(b[1], d[1], nk));
            g.stroke();
          }
          // 집 · 창고
          for (let i = 0; i < N; i++) {
            const [x, y] = S(i);
            const s = 7 * u;
            if (i === 0) {
              g.fillStyle = 'rgba(0,0,0,0.4)';
              g.fillRect(x - s * 1.1 + 2 * u, y - s * 0.4 + 2 * u, s * 2.2, s * 1.2);
              g.fillStyle = '#ffd166';
              g.fillRect(x - s * 1.1, y - s * 0.4, s * 2.2, s * 1.2);
              g.fillStyle = '#e09f3e';
              g.beginPath();
              g.moveTo(x - s * 1.3, y - s * 0.35);
              g.lineTo(x, y - s * 1.1);
              g.lineTo(x + s * 1.3, y - s * 0.35);
              g.fill();
              g.fillStyle = '#7a4b16';
              g.fillRect(x - s * 0.4, y + s * 0.1, s * 0.8, s * 0.7);
              continue;
            }
            g.fillStyle = 'rgba(0,0,0,0.4)';
            g.fillRect(x - s * 0.5 + 1.5 * u, y - s * 0.2 + 1.5 * u, s, s * 0.8);
            g.fillStyle = '#f4ead8';
            g.fillRect(x - s * 0.5, y - s * 0.2, s, s * 0.8);
            g.fillStyle = HOUSE[i % HOUSE.length]!;
            g.beginPath();
            g.moveTo(x - s * 0.7, y - s * 0.15);
            g.lineTo(x, y - s * 0.8);
            g.lineTo(x + s * 0.7, y - s * 0.15);
            g.fill();
            g.fillStyle = '#6b4a2a';
            g.fillRect(x - s * 0.15, y + s * 0.2, s * 0.3, s * 0.4);
          }
          // 트럭
          if (phaseT >= tOpt) {
            const poly = [...finalT.map(S), S(finalT[0]!)];
            const tk = ((phaseT - tOpt) / 3.2) % 1;
            const [p, ang] = alongPoly(poly, ease(tk) * polyLen(poly));
            g.save();
            g.translate(p[0], p[1]);
            g.rotate(ang);
            const s = 6 * u;
            g.fillStyle = 'rgba(0,0,0,0.4)';
            g.fillRect(-s + 1.5 * u, -s * 0.5 + 1.5 * u, s * 2, s);
            g.fillStyle = '#ff6b6b';
            g.fillRect(-s, -s * 0.55, s * 1.3, s * 1.1);
            g.fillStyle = '#ffe3e3';
            g.fillRect(s * 0.35, -s * 0.45, s * 0.65, s * 0.9);
            g.fillStyle = '#334';
            g.fillRect(s * 0.7, -s * 0.38, s * 0.22, s * 0.76);
            g.restore();
          }
          const curLen = phaseT < tBuild ? -1 : tourLen(mv ? (mk2 > 0.8 ? moves[moves.indexOf(mv) + 1]?.before ?? finalT : order) : order);
          const gl = tourLen(greedy);
          txt(g, phaseT < tBuild ? '욕심 길 만들기' : phaseT < tOpt ? '2-opt 고치기' : '다 고쳤어요', 8 * u, headH / 2 + 1 * u, 10.5 * u, phaseT < tBuild ? '#ffb86b' : '#5dff9a', 'left', 900);
          if (curLen > 0) {
            const pct = Math.round((1 - curLen / gl) * 100);
            pill(g, `길이 ${(gl * 10).toFixed(1)} → ${(curLen * 10).toFixed(1)} km${pct > 0 ? ` (−${pct}%)` : ''}`, w - 6 * u, headH / 2 + 1 * u, 7.5 * u, 'rgba(255,255,255,0.12)', '#e8ecff', 'right');
          } else pill(g, `배달할 곳 ${N - 1}군데`, w - 6 * u, headH / 2 + 1 * u, 7.5 * u, 'rgba(255,255,255,0.12)', '#e8ecff', 'right');
        },
        controls: [
          { type: 'range', label: '배달할 곳 수', min: 8, max: 40, step: 1, value: 16, on: (v) => ((n = v), gen()) },
          { type: 'range', label: '속도', min: 0.3, max: 3, step: 0.1, value: 1, on: (v) => (speed = v) },
          { type: 'toggle', label: '욕심 길 겹쳐 보기 (점선)', value: true, on: (v) => (ghost = v) },
          { type: 'button', label: '새 문제', on: () => (seed++, gen()) },
        ] as Control[],
      };
    },
  },

  i270: {
    kind: '2d',
    caption: '실제 지도의 구불구불한 노선이 곧은 노선도로 바뀌어요 — 거리는 버리고 「연결」만 남겨 환승이 가장 적은 길 찾기',
    make() {
      let auto = true;
      let schem = true;
      let routeSeed = 1;
      let route = subwayRoute(0, 12);
      let cycleT = 0;
      let lastCycle = -1;
      const newRoute = (): void => {
        const r = rng(routeSeed++ * 17);
        for (let k = 0; k < 30; k++) {
          const a = Math.floor(r() * ST.length);
          const b = Math.floor(r() * ST.length);
          if (a === b) continue;
          const rt = subwayRoute(a, b);
          if (rt && rt.transfers >= 1 && rt.st.length >= 4) {
            route = rt;
            break;
          }
        }
        cycleT = 0;
      };
      newRoute();
      const PER = 9;
      return {
        draw(g, w, h, _t, dt) {
          reset(g);
          const u = scaleOf(w, h);
          cycleT += Math.min(dt, 0.1);
          const ph = cycleT % PER;
          const cyc = Math.floor(cycleT / PER);
          if (cyc !== lastCycle) {
            if (lastCycle >= 0) newRoute();
            lastCycle = cyc;
          }
          const m = auto ? smooth(1.4, 2.8, ph) * (1 - smooth(7.6, 8.9, ph)) : schem ? 1 : 0;
          // 배경 — 실제 지도(땅 · 공원 · 강) ↔ 노선도(어두운 판)
          bgGrad(g, w, h, '#151b2b', '#0c111d');
          const headH = 16 * u;
          const k = Math.min((w - 24 * u) / 13, (h - headH - 16 * u) / 9);
          const ox = (w - 12 * k) / 2;
          const oy = headH + (h - headH - 8 * k) / 2;
          const pos = (i: number): V2 => {
            const s = ST[i]!;
            const gp = ST_GEO[i]!;
            return [ox + lerp(gp[0], s[0], m) * k, oy + lerp(gp[1], s[1], m) * k];
          };
          if (m < 1) {
            g.globalAlpha = 1 - m;
            const r = rng(9);
            for (let q = 0; q < 7; q++) {
              const x = ox + (-0.5 + r() * 13) * k;
              const y = oy + (-0.5 + r() * 9) * k;
              g.fillStyle = q % 3 ? 'rgba(70,120,80,0.35)' : 'rgba(90,85,70,0.35)';
              g.beginPath();
              g.ellipse(x, y, k * (0.8 + r()), k * (0.5 + r() * 0.6), r() * 3, 0, TAU);
              g.fill();
            }
            // 도시 길
            g.strokeStyle = 'rgba(255,255,255,0.06)';
            g.lineWidth = 1;
            g.beginPath();
            for (let q = 0; q < 14; q++) {
              const y = oy + (q * 0.7 - 0.5) * k;
              g.moveTo(ox - k, y + Math.sin(q) * k * 0.3);
              g.bezierCurveTo(ox + 3 * k, y - k * 0.6, ox + 8 * k, y + k * 0.6, ox + 13 * k, y);
            }
            g.stroke();
            g.globalAlpha = 1;
          }
          // 강 (구불구불 → 곧은 띠)
          g.strokeStyle = 'rgba(60,130,220,0.35)';
          g.lineWidth = k * 0.55;
          g.lineCap = 'round';
          g.beginPath();
          const rv: V2[] = [];
          for (let q = 0; q <= 24; q++) {
            const x = -1 + (q / 24) * 14;
            const yg = 5.2 + Math.sin(x * 0.8) * 0.9 + Math.sin(x * 2.1) * 0.25;
            rv.push([ox + x * k, oy + lerp(yg, 5, m) * k]);
          }
          rv.forEach(([x, y], q) => (q ? g.lineTo(x, y) : g.moveTo(x, y)));
          g.stroke();
          // 노선
          const onRoute = new Set<string>();
          if (route) for (let i = 1; i < route.st.length; i++) onRoute.add(`${route.ln[i]}:${Math.min(route.st[i - 1]!, route.st[i]!)}-${Math.max(route.st[i - 1]!, route.st[i]!)}`);
          const routeK = clamp01((ph - (auto ? 3 : 0.2)) / 2.2);
          const showRoute = route && m > 0.97 && (auto ? ph > 3 && ph < 7.8 : true);
          const lw = Math.max(2.2, k * 0.24);
          g.lineCap = 'round';
          g.lineJoin = 'round';
          LINES.forEach((ln) => {
            g.strokeStyle = ln.col;
            g.globalAlpha = showRoute ? 0.35 : 1;
            g.lineWidth = lw;
            g.beginPath();
            const P = ln.st.map(pos);
            const ten = 1 - m;
            g.moveTo(P[0]![0], P[0]![1]);
            for (let i = 0; i + 1 < P.length; i++) {
              const p0 = P[Math.max(0, i - 1)]!;
              const p1 = P[i]!;
              const p2 = P[i + 1]!;
              const p3 = P[Math.min(P.length - 1, i + 2)]!;
              g.bezierCurveTo(p1[0] + ((p2[0] - p0[0]) / 6) * ten, p1[1] + ((p2[1] - p0[1]) / 6) * ten, p2[0] - ((p3[0] - p1[0]) / 6) * ten, p2[1] - ((p3[1] - p1[1]) / 6) * ten, p2[0], p2[1]);
            }
            g.stroke();
          });
          g.globalAlpha = 1;
          // 길 빛내기
          let trainP: V2 | null = null;
          if (showRoute && route) {
            const P = route.st.map(pos);
            g.strokeStyle = '#ffffff';
            g.globalAlpha = 0.18;
            g.lineWidth = lw * 3.4;
            strokePathPart(g, P, routeK);
            g.globalAlpha = 1;
            for (let i = 1; i < P.length; i++) {
              const seg = (i - 1) / (P.length - 1);
              const seg2 = i / (P.length - 1);
              if (routeK <= seg) break;
              const kk = clamp01((routeK - seg) / (seg2 - seg));
              g.strokeStyle = LINES[route.ln[i]!]!.col;
              g.lineWidth = lw * 1.6;
              g.beginPath();
              g.moveTo(P[i - 1]![0], P[i - 1]![1]);
              g.lineTo(lerp(P[i - 1]![0], P[i]![0], kk), lerp(P[i - 1]![1], P[i]![1], kk));
              g.stroke();
              if (kk < 1) trainP = [lerp(P[i - 1]![0], P[i]![0], kk), lerp(P[i - 1]![1], P[i]![1], kk)];
            }
          }
          // 역
          const lineCount = ST.map((_, i) => LINES.filter((l) => l.st.includes(i)).length);
          const bigLabels = u > 1.5;
          ST.forEach((s, i) => {
            const [x, y] = pos(i);
            const inter = lineCount[i]! > 1;
            const onR = route?.st.includes(i) && showRoute;
            g.fillStyle = '#fff';
            g.strokeStyle = inter ? '#1a1f2e' : LINES.find((l) => l.st.includes(i))!.col;
            g.lineWidth = Math.max(1.2, k * 0.08);
            g.beginPath();
            g.arc(x, y, inter ? k * 0.2 : k * 0.12, 0, TAU);
            g.fill();
            g.stroke();
            if (inter || bigLabels || onR) {
              g.font = `800 ${Math.max(7, 7 * u)}px ${F}`;
              g.textAlign = 'left';
              g.textBaseline = 'middle';
              g.lineWidth = 3;
              g.strokeStyle = '#0c111d';
              g.strokeText(s[2], x + k * 0.26, y - k * 0.28);
              g.fillStyle = onR ? '#fff' : 'rgba(225,232,255,0.85)';
              g.fillText(s[2], x + k * 0.26, y - k * 0.28);
            }
          });
          if (trainP) {
            g.fillStyle = 'rgba(255,255,255,0.35)';
            g.beginPath();
            g.arc(trainP[0], trainP[1], k * 0.35, 0, TAU);
            g.fill();
            g.fillStyle = '#fff';
            g.beginPath();
            g.arc(trainP[0], trainP[1], k * 0.18, 0, TAU);
            g.fill();
          }
          // 환승 표시
          if (showRoute && route && routeK > 0.3) {
            for (let i = 1; i + 1 < route.st.length; i++) {
              if (route.ln[i] === route.ln[i + 1]) continue;
              const [x, y] = pos(route.st[i]!);
              pill(g, '환승', x, y + k * 0.55, 6.5 * u, '#ffffff', '#111');
            }
          }
          txt(g, m > 0.5 ? '노선도' : '실제 지도', 7 * u, headH / 2 + 1 * u, 10.5 * u, '#cfe0ff', 'left', 900);
          if (route && showRoute) {
            const a = ST[route.st[0]!]![2];
            const b = ST[route.st[route.st.length - 1]!]![2];
            pill(g, `${a} → ${b} · 환승 ${route.transfers}번 · ${route.st.length - 1}개 역`, w - 6 * u, headH / 2 + 1 * u, 7.5 * u, 'rgba(255,255,255,0.14)', '#fff', 'right');
          } else {
            let x = w - 6 * u;
            for (let l = LINES.length - 1; l >= 0; l--) x -= pill(g, LINES[l]!.name, x, headH / 2 + 1 * u, 6.5 * u, LINES[l]!.col, '#111', 'right') + 3 * u;
          }
        },
        controls: [
          { type: 'toggle', label: '자동으로 바꾸기', value: true, on: (v) => (auto = v) },
          { type: 'toggle', label: '노선도로 보기 (자동 끔일 때)', value: true, on: (v) => (schem = v) },
          { type: 'button', label: '새 길 찾기', on: () => ((lastCycle = -1), (cycleT = auto ? 3 : 0), newRoute(), auto && (cycleT = 3)) },
        ] as Control[],
      };
    },
  },
};

/* ═════════ 묶음 3 : i271 · i272 · i273 · i274 ═════════ */
function drawStar(g: G, x: number, y: number, r: number, col: string, rot = 0): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot - Math.PI / 2 + (i * Math.PI) / 5;
    const rr2 = i % 2 ? r * 0.45 : r;
    const px = x + Math.cos(a) * rr2;
    const py = y + Math.sin(a) * rr2;
    if (i) g.lineTo(px, py);
    else g.moveTo(px, py);
  }
  g.closePath();
  g.fillStyle = col;
  g.fill();
}
const niceNum = (v: number): number => {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p;
};
const fmtM = (m: number): string => (m >= 1000 ? `${+(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
const comma = (n: number): string => Math.round(n).toLocaleString('ko-KR');

const D3: DemoMap = {
  i271: {
    kind: '2d',
    caption: '큰 화면은 내 주변만, 구석 작은 지도에는 섬 전체 · 내 위치 · 지금 보이는 범위(흰 틀) · 목표(깜박이는 별)',
    make() {
      const W = getWorld();
      let mmSize = 1;
      let zoom = 1.7;
      let showFrame = true;
      let showTrail = true;
      let p: V2 = [W.towns[0]?.[0] ?? 500, W.towns[0]?.[1] ?? 320];
      let tgt: V2 = p;
      let cam: V2 = [p[0], p[1]];
      let found = 0;
      let seed = 1;
      const trail: V2[] = [];
      const pickTarget = (): void => {
        const r = rng(seed++ * 13);
        for (let k = 0; k < 80; k++) {
          const q: V2 = [80 + r() * (WORLD_W - 160), 60 + r() * (WORLD_H - 120)];
          const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
          if (d < 140 || d > 420) continue;
          let ok = true;
          for (let s = 0; s <= 20; s++) if (worldH(lerp(p[0], q[0], s / 20), lerp(p[1], q[1], s / 20)) < 0.03) ok = false;
          if (ok) {
            tgt = q;
            return;
          }
        }
        tgt = [WORLD_W / 2, WORLD_H / 2];
      };
      pickTarget();
      return {
        draw(g, w, h, t, dt) {
          reset(g);
          const u = scaleOf(w, h);
          const d = Math.min(dt, 0.1);
          const dx = tgt[0] - p[0];
          const dy = tgt[1] - p[1];
          const dist = Math.hypot(dx, dy);
          const sp = 70 * d;
          if (dist < sp + 1) {
            found++;
            pickTarget();
          } else {
            p = [p[0] + (dx / dist) * sp, p[1] + (dy / dist) * sp];
          }
          const last = trail[trail.length - 1];
          if (!last || Math.hypot(last[0] - p[0], last[1] - p[1]) > 6) {
            trail.push([p[0], p[1]]);
            if (trail.length > 400) trail.shift();
          }
          cam = [lerp(cam[0], p[0], clamp01(d * 3)), lerp(cam[1], p[1], clamp01(d * 3))];
          // 큰 화면
          const Z = Math.min(zoom * u, 1.3 + zoom * 0.7);
          const vw = w / Z;
          const vh = h / Z;
          const sx = cam[0] - vw / 2;
          const sy = cam[1] - vh / 2;
          g.fillStyle = '#10325c';
          g.fillRect(0, 0, w, h);
          g.imageSmoothingEnabled = true;
          g.drawImage(W.c, sx, sy, vw, vh, 0, 0, w, h);
          const toS = (q: V2): V2 => [(q[0] - sx) * Z, (q[1] - sy) * Z];
          // 목표 (화면 밖이면 가장자리 화살표)
          const ts = toS(tgt);
          const blink = 0.5 + 0.5 * Math.sin(t * 8);
          if (ts[0] > 0 && ts[1] > 0 && ts[0] < w && ts[1] < h) {
            drawStar(g, ts[0], ts[1], (7 + 2 * blink) * u, `rgba(255,214,90,${0.6 + 0.4 * blink})`, t);
          } else {
            const ang = Math.atan2(ts[1] - h / 2, ts[0] - w / 2);
            const ex = clamp(w / 2 + Math.cos(ang) * w, 14 * u, w - 14 * u);
            const ey = clamp(h / 2 + Math.sin(ang) * h, 14 * u, h - 14 * u);
            g.save();
            g.translate(ex, ey);
            g.rotate(ang);
            g.fillStyle = `rgba(255,214,90,${0.6 + 0.4 * blink})`;
            g.beginPath();
            g.moveTo(8 * u, 0);
            g.lineTo(-5 * u, -6 * u);
            g.lineTo(-2 * u, 0);
            g.lineTo(-5 * u, 6 * u);
            g.fill();
            g.restore();
          }
          const ps = toS(p);
          drawHero(g, ps[0], ps[1] - 3 * u, 13 * u, Math.atan2(dy, dx), '#ff8fa3');
          vignette(g, w, h, 0.35);
          // 미니맵
          const mw = w * 0.34 * mmSize;
          const mh = (mw * WORLD_H) / WORLD_W;
          const mx = w - mw - 8 * u;
          const my = 8 * u;
          const mz = mw / WORLD_W;
          g.save();
          g.shadowColor = 'rgba(0,0,0,0.55)';
          g.shadowBlur = 10 * u;
          g.shadowOffsetY = 3 * u;
          rr(g, mx - 3 * u, my - 3 * u, mw + 6 * u, mh + 6 * u, 7 * u);
          g.fillStyle = '#e9dcc0';
          g.fill();
          g.restore();
          g.save();
          rr(g, mx, my, mw, mh, 5 * u);
          g.clip();
          g.drawImage(W.c, mx, my, mw, mh);
          g.fillStyle = 'rgba(10,20,40,0.12)';
          g.fillRect(mx, my, mw, mh);
          if (showTrail && trail.length > 1) {
            g.setLineDash([2 * u, 2 * u]);
            g.strokeStyle = 'rgba(255,255,255,0.8)';
            g.lineWidth = 1 * u;
            g.beginPath();
            trail.forEach((q, i) => (i ? g.lineTo(mx + q[0] * mz, my + q[1] * mz) : g.moveTo(mx + q[0] * mz, my + q[1] * mz)));
            g.stroke();
            g.setLineDash([]);
          }
          if (showFrame) {
            g.strokeStyle = '#ffffff';
            g.lineWidth = 1.4 * u;
            g.fillStyle = 'rgba(255,255,255,0.14)';
            g.beginPath();
            g.rect(mx + sx * mz, my + sy * mz, vw * mz, vh * mz);
            g.fill();
            g.stroke();
          }
          drawStar(g, mx + tgt[0] * mz, my + tgt[1] * mz, (3.5 + 2 * blink) * u, blink > 0.5 ? '#ffd65a' : '#ff6b6b', t);
          const pr = 2.6 * u;
          g.fillStyle = 'rgba(255,143,163,0.35)';
          g.beginPath();
          g.arc(mx + p[0] * mz, my + p[1] * mz, pr * (1.8 + ((t * 2) % 1) * 1.5), 0, TAU);
          g.fill();
          g.fillStyle = '#ff4f7b';
          g.strokeStyle = '#fff';
          g.lineWidth = 1 * u;
          g.beginPath();
          g.arc(mx + p[0] * mz, my + p[1] * mz, pr, 0, TAU);
          g.fill();
          g.stroke();
          g.restore();
          rr(g, mx, my, mw, mh, 5 * u);
          g.strokeStyle = '#7a5a35';
          g.lineWidth = 1.5 * u;
          g.stroke();
          pill(g, `찾은 별 ${found}`, 8 * u, 13 * u, 7.5 * u, 'rgba(15,20,35,0.75)', '#ffd65a', 'left');
        },
        controls: [
          { type: 'range', label: '미니맵 크기', min: 0.6, max: 1.6, step: 0.05, value: 1, on: (v) => (mmSize = v) },
          { type: 'range', label: '큰 화면 확대', min: 0.8, max: 4, step: 0.1, value: 1.7, on: (v) => (zoom = v) },
          { type: 'toggle', label: '보이는 범위 틀', value: true, on: (v) => (showFrame = v) },
          { type: 'toggle', label: '지나온 길', value: true, on: (v) => (showTrail = v) },
        ] as Control[],
      };
    },
  },

  i272: {
    kind: '2d',
    caption: '확대 단계(z)가 오를 때마다 더 자세한 타일로 바꿔 끼워요 — 아직 못 받은 타일은 윗단계 그림을 늘려 임시로 (끌기 · 휠도 돼요)',
    make() {
      interface Tile {
        c: HTMLCanvasElement;
        born: number;
      }
      let RES = 96;
      const cache = new Map<string, Tile>();
      const queue: string[] = [];
      let auto = true;
      let showGrid = true;
      let zoomCtl = 2;
      let cx = 0.5;
      let cy = 0.5;
      let Zc = 0.5;
      let tour = 0;
      let idleUntil = 0;
      let now = 0;
      let attached: HTMLCanvasElement | null = null;
      let drag: V2 | null = null;
      const listeners: [string, EventListener][] = [];
      const towns: [number, number, string, number][] = [];
      const TN = ['한빛', '솔내', '별뫼', '가람', '누리', '다온', '바람골', '새벽', '해오름', '물빛', '달내', '구름재'];
      {
        const r = rng(42);
        for (let k = 0; k < 3000 && towns.length < TN.length; k++) {
          const x = 0.1 + r() * 0.8;
          const y = 0.1 + r() * 0.8;
          const hh = slipH(x, y, 6);
          if (hh > 0.04 && hh < 0.2 && towns.every((q) => Math.hypot(q[0] - x, q[1] - y) > 0.12)) towns.push([x, y, TN[towns.length]!, towns.length < 4 ? 1 : 2]);
        }
      }
      function slipH(x: number, y: number, oct: number): number {
        const d = Math.hypot(x - 0.5, y - 0.5);
        return fbm(x * 5, y * 5, 21, oct) * 1.1 - d * 1.25 + 0.06;
      }
      const makeTile = (z: number, tx: number, ty: number): HTMLCanvasElement => {
        const n = 1 << z;
        const c = mk(RES, RES);
        const tg = c.getContext('2d')!;
        const img = tg.createImageData(RES, RES);
        const oct = 3 + z;
        const H = new Float32Array((RES + 1) * (RES + 1));
        for (let y = 0; y <= RES; y++)
          for (let x = 0; x <= RES; x++) H[y * (RES + 1) + x] = slipH((tx + x / RES) / n, (ty + y / RES) / n, oct);
        for (let y = 0; y < RES; y++)
          for (let x = 0; x < RES; x++) {
            const hv = H[y * (RES + 1) + x]!;
            let col = worldColor(hv);
            if (hv > 0.02) {
              const gx = H[y * (RES + 1) + x + 1]! - hv;
              const gy = H[(y + 1) * (RES + 1) + x]! - hv;
              const sh = clamp(1 + (-gx - gy) * 6 * n * (96 / RES), 0.6, 1.35);
              col = [col[0] * sh, col[1] * sh, col[2] * sh];
            }
            const o = (y * RES + x) * 4;
            img.data[o] = clamp(col[0], 0, 255);
            img.data[o + 1] = clamp(col[1], 0, 255);
            img.data[o + 2] = clamp(col[2], 0, 255);
            img.data[o + 3] = 255;
          }
        tg.putImageData(img, 0, 0);
        return c;
      };
      const tourAt = (k: number): [number, number, number] => {
        const T = towns[1] ?? [0.5, 0.5];
        const T2 = towns[3] ?? [0.4, 0.6];
        const keys: [number, number, number][] = [
          [0.5, 0.5, 0.3],
          [T[0], T[1], 2.2],
          [T[0], T[1], 3.9],
          [T2[0], T2[1], 3.6],
          [T2[0], T2[1], 1.6],
          [0.5, 0.5, 0.3],
        ];
        const L = keys.length - 1;
        const x = (k % L + L) % L;
        const i = Math.floor(x);
        const f = ease(x - i);
        const a = keys[i]!;
        const b = keys[i + 1]!;
        return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];
      };
      const attach = (c: HTMLCanvasElement): void => {
        attached = c;
        const on = (n: string, f: EventListener): void => {
          c.addEventListener(n, f, { passive: false });
          listeners.push([n, f]);
        };
        on('wheel', ((e: WheelEvent) => {
          e.preventDefault();
          Zc = clamp(Zc - e.deltaY * 0.0025, 0, 4.4);
          idleUntil = now + 5;
        }) as EventListener);
        on('pointerdown', ((e: PointerEvent) => {
          drag = [e.clientX, e.clientY];
          idleUntil = now + 5;
        }) as EventListener);
        on('pointermove', ((e: PointerEvent) => {
          if (!drag) return;
          const scale = 190 * Math.sqrt(c.clientWidth / 280) * Math.pow(2, Zc);
          cx -= (e.clientX - drag[0]) / scale;
          cy -= (e.clientY - drag[1]) / scale;
          cx = clamp(cx, 0, 1);
          cy = clamp(cy, 0, 1);
          drag = [e.clientX, e.clientY];
          idleUntil = now + 5;
        }) as EventListener);
        const up = (): void => {
          drag = null;
        };
        on('pointerup', up as EventListener);
        on('pointerleave', up as EventListener);
      };
      return {
        draw(g, w, h, t, dt) {
          reset(g);
          now = t;
          const u = scaleOf(w, h);
          if (!attached && w > 500) attach(g.canvas);
          const wantRes = w > 500 ? 176 : 96;
          if (wantRes !== RES) {
            RES = wantRes;
            cache.clear();
            queue.length = 0;
          }
          if (auto && t > idleUntil) {
            tour += Math.min(dt, 0.1) / 2.6;
            const [a, b, z] = tourAt(tour);
            cx = lerp(cx, a, 0.08);
            cy = lerp(cy, b, 0.08);
            Zc = lerp(Zc, z, 0.08);
          } else if (!auto && t > idleUntil) Zc = lerp(Zc, zoomCtl, 0.08);
          const z = clamp(Math.floor(Zc + 0.25), 0, 4);
          const n = 1 << z;
          const worldPx = 190 * Math.sqrt(u) * Math.pow(2, Zc);
          const tilePx = worldPx / n;
          const ox = w / 2 - cx * worldPx;
          const oy = h / 2 - cy * worldPx;
          g.fillStyle = '#0d2a4d';
          g.fillRect(0, 0, w, h);
          const x0 = clamp(Math.floor(-ox / tilePx), 0, n - 1);
          const x1 = clamp(Math.floor((w - ox) / tilePx), 0, n - 1);
          const y0 = clamp(Math.floor(-oy / tilePx), 0, n - 1);
          const y1 = clamp(Math.floor((h - oy) / tilePx), 0, n - 1);
          let shown = 0;
          let loading = 0;
          g.imageSmoothingEnabled = true;
          for (let ty = y0; ty <= y1; ty++)
            for (let tx = x0; tx <= x1; tx++) {
              const key = `${z}/${tx}/${ty}`;
              const X = ox + tx * tilePx;
              const Y = oy + ty * tilePx;
              const tile = cache.get(key);
              shown++;
              const fadeK = tile ? clamp01((t - tile.born) / 0.35) : 0;
              if (fadeK < 1) {
                // 윗단계 타일 늘려 쓰기
                let drawn = false;
                for (let pz = z - 1; pz >= 0 && !drawn; pz--) {
                  const sh = z - pz;
                  const ptx = tx >> sh;
                  const pty = ty >> sh;
                  const pt = cache.get(`${pz}/${ptx}/${pty}`);
                  if (pt) {
                    const sub = RES / (1 << sh);
                    g.drawImage(pt.c, (tx - (ptx << sh)) * sub, (ty - (pty << sh)) * sub, sub, sub, X, Y, tilePx + 0.5, tilePx + 0.5);
                    drawn = true;
                  }
                }
                if (!drawn) {
                  g.fillStyle = '#1b3150';
                  g.fillRect(X, Y, tilePx, tilePx);
                }
                if (!tile) {
                  loading++;
                  if (!queue.includes(key)) queue.push(key);
                  const sp = (t * 3 + tx + ty) % 1;
                  g.strokeStyle = 'rgba(255,255,255,0.5)';
                  g.lineWidth = 2 * u;
                  g.beginPath();
                  g.arc(X + tilePx / 2, Y + tilePx / 2, Math.min(9 * u, tilePx * 0.12), sp * TAU, sp * TAU + 4);
                  g.stroke();
                }
              }
              if (tile) {
                g.globalAlpha = fadeK;
                g.drawImage(tile.c, X, Y, tilePx + 0.5, tilePx + 0.5);
                g.globalAlpha = 1;
              }
              if (showGrid) {
                g.strokeStyle = 'rgba(255,255,255,0.35)';
                g.lineWidth = 1;
                g.strokeRect(X + 0.5, Y + 0.5, tilePx - 1, tilePx - 1);
                if (tilePx > 60 * u * 0.8) txt(g, `${z}/${tx}/${ty}`, X + 4 * u, Y + 8 * u, 7 * u, 'rgba(255,255,255,0.75)', 'left', 700, 'ui-monospace, monospace');
              }
            }
          // 타일 받기 (한 장면에 두 장 — 받는 모습이 보이게)
          for (let k = 0; k < (RES > 100 ? 1 : 2) && queue.length; k++) {
            const key = queue.shift()!;
            if (cache.has(key)) continue;
            const [zz, xx, yy] = key.split('/').map(Number) as [number, number, number];
            if (zz !== z) continue;
            cache.set(key, { c: makeTile(zz, xx, yy), born: t });
          }
          if (queue.length > 40) queue.splice(0, queue.length - 40);
          if (cache.size > 160) {
            for (const k of cache.keys()) {
              if (cache.size <= 120) break;
              if (!k.startsWith('0/') && !k.startsWith('1/')) cache.delete(k);
            }
          }
          // 이름 (확대 단계에 따라 늘어남)
          for (const [x, y, name, lv] of towns) {
            if (lv > z) continue;
            const X = ox + x * worldPx;
            const Y = oy + y * worldPx;
            if (X < -40 || Y < -20 || X > w + 40 || Y > h + 20) continue;
            g.fillStyle = '#fff';
            g.strokeStyle = '#333';
            g.lineWidth = 1.2 * u;
            g.beginPath();
            g.arc(X, Y, (lv === 1 ? 3.2 : 2.4) * u, 0, TAU);
            g.fill();
            g.stroke();
            g.font = `800 ${(lv === 1 ? 9 : 7.5) * u}px ${F}`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.lineWidth = 3 * u;
            g.strokeStyle = 'rgba(20,30,50,0.85)';
            g.strokeText(name, X, Y - 9 * u);
            g.fillStyle = '#fff';
            g.fillText(name, X, Y - 9 * u);
          }
          // 화면 단추 · 단계 표
          const bx = w - 16 * u;
          for (const [i, s] of ['+', '−'].entries()) {
            rr(g, bx - 9 * u, 10 * u + i * 20 * u, 18 * u, 18 * u, 4 * u);
            g.fillStyle = 'rgba(255,255,255,0.92)';
            g.fill();
            txt(g, s, bx, 19.5 * u + i * 20 * u, 12 * u, '#223', 'center', 800);
          }
          const barH = 70 * u;
          const by = 56 * u;
          rr(g, bx - 2 * u, by, 4 * u, barH, 2 * u);
          g.fillStyle = 'rgba(255,255,255,0.3)';
          g.fill();
          const kz = 1 - Zc / 4.4;
          g.fillStyle = '#ffd166';
          g.beginPath();
          g.arc(bx, by + kz * barH, 4.5 * u, 0, TAU);
          g.fill();
          pill(g, `z = ${z}`, 8 * u, 13 * u, 8.5 * u, 'rgba(15,20,35,0.8)', '#ffd166', 'left');
          pill(g, `타일 ${shown}장${loading ? ` · 받는 중 ${loading}` : ''}`, 8 * u, 31 * u, 7 * u, 'rgba(15,20,35,0.7)', '#e8ecff', 'left');
        },
        controls: [
          { type: 'toggle', label: '자동 여행', value: true, on: (v) => (auto = v) },
          { type: 'range', label: '확대 (자동 끔일 때)', min: 0, max: 4.4, step: 0.1, value: 2, on: (v) => ((zoomCtl = v), (auto = false)) },
          { type: 'toggle', label: '타일 경계 · 번호', value: true, on: (v) => (showGrid = v) },
          { type: 'button', label: '타일 다시 받기', on: () => cache.clear() },
        ] as Control[],
        dispose() {
          if (attached) for (const [n, f] of listeners) attached.removeEventListener(n, f);
          cache.clear();
        },
      };
    },
  },

  i273: {
    kind: '2d',
    caption: '양피지 결 · 탄 가장자리 · 접힌 자국 · 잉크 물결 바다 · 나침반 장미 — 점선 길이 그려지며 X 표까지',
    make() {
      let seed = 3;
      let age = 0.6;
      let speed = 1;
      let phaseT = 0;
      const layer = new Layer();
      const geo = (w: number, h: number, u: number): { isl: V2[]; path: V2[]; ship: V2; X: V2; cx: number; cy: number } => {
        const r = rng(seed);
        const cx = w * 0.47;
        const cy = h * 0.53;
        const R0 = Math.min(w * 0.28, h * 0.32);
        const isl: V2[] = [];
        const ph1 = r() * 6;
        const ph2 = r() * 6;
        for (let i = 0; i < 90; i++) {
          const a = (i / 90) * TAU;
          const k = 1 + 0.22 * Math.sin(a * 2 + ph1) + 0.12 * Math.sin(a * 5 + ph2) + 0.07 * (vnoise(Math.cos(a) * 3 + seed, Math.sin(a) * 3, 3) - 0.5) * 4;
          isl.push([cx + Math.cos(a) * R0 * k * 1.35, cy + Math.sin(a) * R0 * k * 0.85]);
        }
        const ship: V2 = [cx - R0 * 2.1, cy + R0 * 0.75];
        const land: V2 = isl[Math.floor(90 * 0.42)]!;
        const X: V2 = [cx + R0 * (0.3 + r() * 0.5), cy - R0 * (0.15 + r() * 0.3)];
        const path: V2[] = [ship];
        const mid1: V2 = [lerp(ship[0], land[0], 0.5), lerp(ship[1], land[1], 0.5) + 10 * u];
        path.push(mid1, land);
        for (let k = 1; k <= 5; k++) {
          const f = k / 5;
          path.push([lerp(land[0], X[0], f) + Math.sin(f * 7 + seed) * R0 * 0.18, lerp(land[1], X[1], f) + Math.cos(f * 5) * R0 * 0.12]);
        }
        return { isl, path, ship, X, cx, cy };
      };
      const smoothPts = (pts: V2[], n: number): V2[] => {
        const out: V2[] = [];
        for (let i = 0; i + 1 < pts.length; i++) {
          const p0 = pts[Math.max(0, i - 1)]!;
          const p1 = pts[i]!;
          const p2 = pts[i + 1]!;
          const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
          for (let k = 0; k < n; k++) {
            const s = k / n;
            const s2 = s * s;
            const s3 = s2 * s;
            const f = (a: number, b: number, c: number, d: number): number => 0.5 * (2 * b + (-a + c) * s + (2 * a - 5 * b + 4 * c - d) * s2 + (-a + 3 * b - 3 * c + d) * s3);
            out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
          }
        }
        out.push(pts[pts.length - 1]!);
        return out;
      };
      const paint = (lg: G, w: number, h: number, u: number): void => {
        const r = rng(seed * 7 + 1);
        const { isl, ship, cx, cy } = geo(w, h, u);
        // 책상
        bgGrad(lg, w, h, '#3a271a', '#21160e');
        lg.strokeStyle = 'rgba(0,0,0,0.25)';
        for (let y = 0; y < h; y += 5 * u) {
          lg.lineWidth = 0.6 * u + r() * u;
          lg.beginPath();
          lg.moveTo(0, y);
          for (let x = 0; x <= w; x += 20 * u) lg.lineTo(x, y + Math.sin(x * 0.01 + y) * 2 * u);
          lg.stroke();
        }
        // 종이 모양 (울퉁불퉁 가장자리)
        const m = 9 * u;
        const edge: V2[] = [];
        const per = (x0: number, y0: number, x1: number, y1: number, nx: number, ny: number): void => {
          const L = Math.hypot(x1 - x0, y1 - y0);
          const n = Math.ceil(L / (4 * u));
          for (let i = 0; i < n; i++) {
            const f = i / n;
            const j = (vnoise(f * 12 + x0 * 0.01, y0 * 0.01, seed) - 0.5) * 7 * u * (0.5 + age) + (r() - 0.5) * 1.6 * u;
            edge.push([lerp(x0, x1, f) + nx * j, lerp(y0, y1, f) + ny * j]);
          }
        };
        per(m, m, w - m, m, 0, 1);
        per(w - m, m, w - m, h - m, -1, 0);
        per(w - m, h - m, m, h - m, 0, -1);
        per(m, h - m, m, m, 1, 0);
        const paperPath = (): void => {
          lg.beginPath();
          edge.forEach(([x, y], i) => (i ? lg.lineTo(x, y) : lg.moveTo(x, y)));
          lg.closePath();
        };
        lg.save();
        lg.shadowColor = 'rgba(0,0,0,0.6)';
        lg.shadowBlur = 14 * u;
        lg.shadowOffsetY = 5 * u;
        paperPath();
        lg.fillStyle = '#e3cc96';
        lg.fill();
        lg.restore();
        lg.save();
        paperPath();
        lg.clip();
        const pg = lg.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.5, Math.hypot(w, h) * 0.6);
        pg.addColorStop(0, '#f3e3b8');
        pg.addColorStop(0.6, '#e2c58c');
        pg.addColorStop(1, '#b98a4e');
        lg.fillStyle = pg;
        lg.fillRect(0, 0, w, h);
        // 얼룩 · 결
        for (let k = 0; k < 60 * (0.4 + age); k++) {
          const x = r() * w;
          const y = r() * h;
          const rad = (4 + r() * 26) * u;
          const sg = lg.createRadialGradient(x, y, 0, x, y, rad);
          sg.addColorStop(0, `rgba(120,80,30,${0.05 + r() * 0.08 * age})`);
          sg.addColorStop(1, 'rgba(120,80,30,0)');
          lg.fillStyle = sg;
          lg.fillRect(x - rad, y - rad, rad * 2, rad * 2);
        }
        lg.fillStyle = 'rgba(90,60,25,0.06)';
        for (let k = 0; k < 1500; k++) lg.fillRect(r() * w, r() * h, u * (0.5 + r()), u * (0.5 + r()));
        // 커피 고리
        lg.strokeStyle = `rgba(110,65,25,${0.12 + 0.15 * age})`;
        lg.lineWidth = 2.2 * u;
        lg.beginPath();
        lg.arc(w * 0.82, h * 0.78, 16 * u, 0.3, 5.6);
        lg.stroke();
        // 바다 잉크 물결선 (섬 둘레 고리)
        const ink = 'rgba(70,40,18,';
        const islPath = (g2: G): void => {
          g2.beginPath();
          isl.forEach(([x, y], i) => (i ? g2.lineTo(x, y) : g2.moveTo(x, y)));
          g2.closePath();
        };
        const rip = mk(w * 2, h * 2);
        const rg = rip.getContext('2d')!;
        rg.scale(2, 2);
        rg.lineJoin = 'round';
        for (let k = 5; k >= 1; k--) {
          islPath(rg);
          rg.globalCompositeOperation = 'source-over';
          rg.strokeStyle = `${ink}${0.12 + 0.1 * (5 - k) / 4})`;
          rg.lineWidth = k * 7 * u;
          rg.stroke();
          rg.globalCompositeOperation = 'destination-out';
          rg.lineWidth = k * 7 * u - 1.3 * u;
          rg.strokeStyle = '#000';
          rg.stroke();
        }
        lg.drawImage(rip, 0, 0, w, h);
        // 바다 물결 무늬
        lg.strokeStyle = `${ink}0.35)`;
        lg.lineWidth = 0.9 * u;
        for (let k = 0; k < 14; k++) {
          const x = r() * w;
          const y = r() * h;
          if (Math.hypot((x - cx) / 1.6, y - cy) < Math.min(w, h) * 0.38) continue;
          lg.beginPath();
          lg.moveTo(x, y);
          lg.quadraticCurveTo(x + 4 * u, y - 3 * u, x + 8 * u, y);
          lg.quadraticCurveTo(x + 12 * u, y - 3 * u, x + 16 * u, y);
          lg.stroke();
        }
        // 섬
        islPath(lg);
        const ig = lg.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.4);
        ig.addColorStop(0, 'rgba(160,150,80,0.45)');
        ig.addColorStop(1, 'rgba(190,160,90,0.3)');
        lg.fillStyle = ig;
        lg.fill();
        lg.strokeStyle = `${ink}0.9)`;
        lg.lineWidth = 1.6 * u;
        lg.stroke();
        // 해변 점 찍기
        lg.save();
        islPath(lg);
        lg.clip();
        lg.lineWidth = 6 * u;
        lg.strokeStyle = 'rgba(240,215,150,0.5)';
        islPath(lg);
        lg.stroke();
        // 산 (잉크 ∧ + 빗금)
        for (let k = 0; k < 6; k++) {
          const x = cx - Math.min(w, h) * 0.12 + k * 13 * u + (r() - 0.5) * 6 * u;
          const y = cy + (k % 2 ? -6 : 4) * u - 10 * u;
          const s = (8 + r() * 5) * u;
          lg.fillStyle = 'rgba(150,120,70,0.35)';
          lg.beginPath();
          lg.moveTo(x - s, y + s * 0.6);
          lg.lineTo(x, y - s * 0.6);
          lg.lineTo(x + s, y + s * 0.6);
          lg.fill();
          lg.strokeStyle = `${ink}0.85)`;
          lg.lineWidth = 1.2 * u;
          lg.beginPath();
          lg.moveTo(x - s, y + s * 0.6);
          lg.lineTo(x, y - s * 0.6);
          lg.lineTo(x + s, y + s * 0.6);
          lg.stroke();
          lg.lineWidth = 0.7 * u;
          for (let q = 1; q < 4; q++) {
            lg.beginPath();
            lg.moveTo(x + (s * q) / 5, y - s * 0.6 + (s * 1.2 * q) / 5);
            lg.lineTo(x + (s * q) / 5 - s * 0.15, y + s * 0.6);
            lg.stroke();
          }
        }
        // 야자나무
        for (let k = 0; k < 5; k++) {
          const a = r() * TAU;
          const x = cx + Math.cos(a) * Math.min(w, h) * 0.24;
          const y = cy + Math.sin(a) * Math.min(w, h) * 0.13 + 8 * u;
          const s = 7 * u;
          lg.strokeStyle = `${ink}0.85)`;
          lg.lineWidth = 1.3 * u;
          lg.beginPath();
          lg.moveTo(x, y);
          lg.quadraticCurveTo(x + s * 0.4, y - s * 0.8, x + s * 0.2, y - s * 1.6);
          lg.stroke();
          for (let q = 0; q < 5; q++) {
            const b = -Math.PI / 2 + (q - 2) * 0.7;
            lg.beginPath();
            lg.moveTo(x + s * 0.2, y - s * 1.6);
            lg.quadraticCurveTo(x + s * 0.2 + Math.cos(b) * s * 0.7, y - s * 1.6 + Math.sin(b) * s * 0.5 - s * 0.3, x + s * 0.2 + Math.cos(b) * s * 1.1, y - s * 1.6 + Math.sin(b) * s * 0.6 + s * 0.3);
            lg.stroke();
          }
        }
        lg.restore();
        // 배
        {
          const [x, y] = ship;
          const s = 11 * u;
          lg.fillStyle = 'rgba(110,70,30,0.6)';
          lg.strokeStyle = `${ink}0.9)`;
          lg.lineWidth = 1.2 * u;
          lg.beginPath();
          lg.moveTo(x - s, y);
          lg.lineTo(x + s, y);
          lg.lineTo(x + s * 0.7, y + s * 0.4);
          lg.lineTo(x - s * 0.7, y + s * 0.4);
          lg.closePath();
          lg.fill();
          lg.stroke();
          lg.beginPath();
          lg.moveTo(x, y);
          lg.lineTo(x, y - s * 1.3);
          lg.stroke();
          lg.fillStyle = 'rgba(245,232,200,0.9)';
          lg.beginPath();
          lg.moveTo(x + 1 * u, y - s * 1.2);
          lg.quadraticCurveTo(x + s * 0.9, y - s * 0.7, x + 1 * u, y - s * 0.2);
          lg.closePath();
          lg.fill();
          lg.stroke();
          lg.beginPath();
          lg.moveTo(x - 1 * u, y - s * 1.1);
          lg.quadraticCurveTo(x - s * 0.7, y - s * 0.65, x - 1 * u, y - s * 0.3);
          lg.closePath();
          lg.fill();
          lg.stroke();
        }
        // 바다 괴물 꼬리
        {
          const x = w * 0.78;
          const y = h * 0.28;
          lg.strokeStyle = `${ink}0.8)`;
          lg.lineWidth = 1.3 * u;
          for (let q = 0; q < 3; q++) {
            lg.beginPath();
            lg.arc(x + q * 12 * u, y, 5 * u, Math.PI, 0);
            lg.stroke();
          }
          lg.beginPath();
          lg.moveTo(x + 41 * u, y);
          lg.lineTo(x + 46 * u, y - 6 * u);
          lg.lineTo(x + 44 * u, y + 1 * u);
          lg.stroke();
        }
        // 나침반 장미
        {
          const x = w * 0.85;
          const y = h * 0.62;
          const R = Math.min(w, h) * 0.13;
          lg.strokeStyle = `${ink}0.8)`;
          lg.lineWidth = 1 * u;
          lg.beginPath();
          lg.arc(x, y, R * 0.8, 0, TAU);
          lg.stroke();
          lg.beginPath();
          lg.arc(x, y, R * 0.72, 0, TAU);
          lg.stroke();
          for (let i = 0; i < 8; i++) {
            const a = (i * Math.PI) / 4 - Math.PI / 2;
            const L = i % 2 ? R * 0.6 : R;
            const s = i % 2 ? R * 0.1 : R * 0.15;
            for (const side of [-1, 1]) {
              lg.beginPath();
              lg.moveTo(x, y);
              lg.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L);
              lg.lineTo(x + Math.cos(a + (side * Math.PI) / 2) * s, y + Math.sin(a + (side * Math.PI) / 2) * s);
              lg.closePath();
              lg.fillStyle = side > 0 ? 'rgba(70,40,18,0.85)' : 'rgba(240,225,190,0.9)';
              lg.fill();
              lg.stroke();
            }
          }
          txt(lg, 'N', x, y - R - 6 * u, 9 * u, 'rgba(120,30,20,0.9)', 'center', 900, 'Georgia, serif');
        }
        // 제목
        txt(lg, '보물섬', w * 0.18, h * 0.16, 17 * u, 'rgba(70,40,18,0.9)', 'center', 700, HAND);
        lg.strokeStyle = `${ink}0.6)`;
        lg.lineWidth = 1 * u;
        lg.beginPath();
        lg.moveTo(w * 0.1, h * 0.16 + 11 * u);
        lg.quadraticCurveTo(w * 0.18, h * 0.16 + 15 * u, w * 0.26, h * 0.16 + 10 * u);
        lg.stroke();
        // 접힌 자국
        for (const [x0, y0, x1, y1] of [
          [w * 0.5, 0, w * 0.5, h],
          [0, h * 0.5, w, h * 0.5],
        ] as [number, number, number, number][]) {
          const vert = x0 === x1;
          const lgr = vert ? lg.createLinearGradient(x0 - 6 * u, 0, x0 + 6 * u, 0) : lg.createLinearGradient(0, y0 - 6 * u, 0, y0 + 6 * u);
          lgr.addColorStop(0, 'rgba(0,0,0,0)');
          lgr.addColorStop(0.48, 'rgba(90,60,25,0.16)');
          lgr.addColorStop(0.52, 'rgba(255,245,215,0.22)');
          lgr.addColorStop(1, 'rgba(0,0,0,0)');
          lg.fillStyle = lgr;
          if (vert) lg.fillRect(x0 - 6 * u, y0, 12 * u, y1 - y0);
          else lg.fillRect(x0, y0 - 6 * u, x1 - x0, 12 * u);
        }
        // 탄 가장자리
        lg.lineJoin = 'round';
        paperPath();
        lg.strokeStyle = 'rgba(60,30,10,0.55)';
        lg.lineWidth = (10 + 18 * age) * u;
        lg.filter = `blur(${(3 + 4 * age) * u}px)`;
        lg.stroke();
        lg.filter = 'none';
        paperPath();
        lg.strokeStyle = 'rgba(40,18,5,0.85)';
        lg.lineWidth = 2.2 * u;
        lg.stroke();
        lg.restore();
      };
      return {
        draw(g, w, h, t, dt) {
          reset(g);
          const u = scaleOf(w, h);
          const dpr = dprOf(g);
          phaseT += Math.min(dt, 0.1) * speed;
          const L = layer.get(`${seed}|${age}|${w}|${h}|${dpr}`, w, h, dpr, (lg) => paint(lg, w, h, u));
          g.drawImage(L, 0, 0, w, h);
          const G2 = geo(w, h, u);
          const pts = smoothPts(G2.path, 12);
          const drawK = clamp01(phaseT / 3.2);
          // 잉크 점선 길
          g.setLineDash([5 * u, 4 * u]);
          g.strokeStyle = 'rgba(150,30,25,0.9)';
          g.lineWidth = 1.9 * u;
          g.lineCap = 'round';
          const head = strokePathPart(g, pts, ease(drawK));
          g.setLineDash([]);
          // 깃펜 끝
          if (head && drawK < 1) {
            g.save();
            g.translate(head[0], head[1]);
            g.rotate(-0.7);
            g.fillStyle = 'rgba(250,245,235,0.95)';
            g.strokeStyle = 'rgba(60,40,20,0.8)';
            g.lineWidth = 0.8 * u;
            g.beginPath();
            g.moveTo(0, 0);
            g.quadraticCurveTo(4 * u, -10 * u, 2 * u, -24 * u);
            g.quadraticCurveTo(-4 * u, -12 * u, 0, 0);
            g.fill();
            g.stroke();
            g.restore();
          }
          // X 표
          const xk = clamp01((phaseT - 3.2) / 0.5);
          if (xk > 0) {
            const [x, y] = G2.X;
            const s = 8 * u * (1 + 0.08 * Math.sin(t * 5));
            g.strokeStyle = '#a3121a';
            g.lineWidth = 3.2 * u;
            g.lineCap = 'round';
            g.beginPath();
            const k1 = clamp01(xk * 2);
            const k2 = clamp01(xk * 2 - 1);
            g.moveTo(x - s, y - s);
            g.lineTo(x - s + 2 * s * k1, y - s + 2 * s * k1);
            if (k2 > 0) {
              g.moveTo(x + s, y - s);
              g.lineTo(x + s - 2 * s * k2, y - s + 2 * s * k2);
            }
            g.stroke();
            if (xk >= 1) {
              g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 4);
              g.strokeStyle = 'rgba(200,40,30,0.5)';
              g.lineWidth = 1.2 * u;
              g.beginPath();
              g.arc(x, y, s * 1.9, 0, TAU);
              g.stroke();
              g.globalAlpha = 1;
              txt(g, '여기!', x + s * 2.2, y - s * 1.6, 11 * u, 'rgba(140,20,20,0.95)', 'left', 700, HAND);
            }
          }
          if (phaseT > 6.5) phaseT = 0;
          // 촛불 빛 · 그늘
          const fl = 0.92 + 0.05 * Math.sin(t * 9) + 0.03 * Math.sin(t * 23);
          const cg = g.createRadialGradient(w * 0.42, h * 0.4, 0, w * 0.5, h * 0.5, Math.hypot(w, h) * 0.62 * fl);
          cg.addColorStop(0, 'rgba(255,200,120,0.08)');
          cg.addColorStop(0.6, 'rgba(0,0,0,0)');
          cg.addColorStop(1, 'rgba(10,5,0,0.5)');
          g.fillStyle = cg;
          g.fillRect(0, 0, w, h);
        },
        controls: [
          { type: 'range', label: '낡은 정도', min: 0, max: 1, step: 0.1, value: 0.6, on: (v) => (age = v) },
          { type: 'range', label: '그리는 속도', min: 0.3, max: 3, step: 0.1, value: 1, on: (v) => (speed = v) },
          { type: 'button', label: '다시 그리기', on: () => (phaseT = 0) },
          { type: 'button', label: '새 보물섬', on: () => ((seed++), (phaseT = 0)) },
        ] as Control[],
      };
    },
  },

  i274: {
    kind: '2d',
    caption: '지도를 당기면 축척 막대가 「200 m → 1 km → 5 km」로 바뀌고 1 : 50 000 비율도 따라가요 · 나침반은 돌아간 북쪽을 가리켜요',
    make() {
      const W = getWorld();
      let autoZoom = true;
      let rotate = true;
      let zoomCtl = 2;
      let showRatio = true;
      let Z = 1;
      let ang = 0;
      const MPP = 50; // 세계 1 칸 = 50 m
      return {
        draw(g, w, h, t) {
          reset(g);
          const u = scaleOf(w, h);
          const target = autoZoom ? Math.exp(lerp(Math.log(0.4), Math.log(3.2), 0.5 + 0.5 * Math.sin(t * 0.45 - 1.2))) : zoomCtl;
          Z = lerp(Z, target, 0.1);
          ang = rotate ? Math.sin(t * 0.25) * 0.7 : lerp(ang, 0, 0.1);
          const town = W.towns[2] ?? [WORLD_W / 2, WORLD_H / 2];
          const fx = lerp(WORLD_W / 2, town[0], smooth(0.6, 3, Z));
          const fy = lerp(WORLD_H / 2, town[1], smooth(0.6, 3, Z));
          const Zs = Math.min(Z * u, 3.2);
          g.fillStyle = '#10325c';
          g.fillRect(0, 0, w, h);
          g.save();
          g.translate(w / 2, h / 2);
          g.rotate(ang);
          g.scale(Zs, Zs);
          g.translate(-fx, -fy);
          g.drawImage(W.c, 0, 0);
          // km 격자 (세계 좌표에 그려 함께 돎)
          const gridM = niceNum((150 * MPP) / Zs);
          const gs = gridM / MPP;
          g.strokeStyle = 'rgba(255,255,255,0.16)';
          g.lineWidth = 1 / Zs;
          g.beginPath();
          for (let x = 0; x <= WORLD_W; x += gs) {
            g.moveTo(x, 0);
            g.lineTo(x, WORLD_H);
          }
          for (let y = 0; y <= WORLD_H; y += gs) {
            g.moveTo(0, y);
            g.lineTo(WORLD_W, y);
          }
          g.stroke();
          g.restore();
          vignette(g, w, h, 0.35);
          // 축척 막대
          const mPerPx = MPP / Zs;
          const nice = niceNum(95 * u * mPerPx);
          const barW = nice / mPerPx;
          const bx = 12 * u;
          const by = h - 18 * u;
          rr(g, bx - 6 * u, by - 20 * u, barW + 30 * u, 32 * u, 6 * u);
          g.fillStyle = 'rgba(255,255,255,0.88)';
          g.fill();
          for (let i = 0; i < 4; i++) {
            g.fillStyle = i % 2 ? '#fff' : '#1a2233';
            g.fillRect(bx + (barW / 4) * i, by, barW / 4, 4 * u);
          }
          g.strokeStyle = '#1a2233';
          g.lineWidth = 1 * u;
          g.strokeRect(bx, by, barW, 4 * u);
          txt(g, '0', bx, by - 6 * u, 7 * u, '#1a2233', 'center', 800);
          txt(g, fmtM(nice / 2), bx + barW / 2, by - 6 * u, 7 * u, '#1a2233', 'center', 800);
          txt(g, fmtM(nice), bx + barW, by - 6 * u, 7 * u, '#1a2233', 'center', 800);
          if (showRatio) {
            const ratio = mPerPx / 0.0002646;
            const p = Math.pow(10, Math.floor(Math.log10(ratio)) - 1);
            pill(g, `1 : ${comma(Math.round(ratio / p) * p)}`, bx - 6 * u, 14 * u, 8.5 * u, 'rgba(255,255,255,0.9)', '#1a2233', 'left');
          }
          // 나침반
          const cx = w - 26 * u;
          const cy = 28 * u;
          const R = 19 * u;
          g.save();
          g.shadowColor = 'rgba(0,0,0,0.5)';
          g.shadowBlur = 8 * u;
          g.fillStyle = 'rgba(250,247,240,0.95)';
          g.beginPath();
          g.arc(cx, cy, R, 0, TAU);
          g.fill();
          g.restore();
          g.strokeStyle = '#1a2233';
          g.lineWidth = 1.2 * u;
          g.beginPath();
          g.arc(cx, cy, R * 0.86, 0, TAU);
          g.stroke();
          g.save();
          g.translate(cx, cy);
          g.rotate(ang);
          for (let i = 0; i < 16; i++) {
            const a = (i / 16) * TAU;
            g.beginPath();
            g.moveTo(Math.cos(a) * R * 0.86, Math.sin(a) * R * 0.86);
            g.lineTo(Math.cos(a) * R * (i % 4 ? 0.78 : 0.7), Math.sin(a) * R * (i % 4 ? 0.78 : 0.7));
            g.stroke();
          }
          for (let i = 0; i < 4; i++) {
            const a = (i * Math.PI) / 2 - Math.PI / 2;
            for (const side of [-1, 1]) {
              g.beginPath();
              g.moveTo(0, 0);
              g.lineTo(Math.cos(a) * R * 0.66, Math.sin(a) * R * 0.66);
              g.lineTo(Math.cos(a + side * 0.9) * R * 0.14, Math.sin(a + side * 0.9) * R * 0.14);
              g.closePath();
              g.fillStyle = i === 0 ? (side > 0 ? '#e63946' : '#a4161a') : side > 0 ? '#3a4660' : '#c9d1e3';
              g.fill();
            }
          }
          const lab = ['N', 'E', 'S', 'W'];
          for (let i = 0; i < 4; i++) {
            const a = (i * Math.PI) / 2 - Math.PI / 2;
            g.save();
            g.translate(Math.cos(a) * R * 1.3, Math.sin(a) * R * 1.3);
            g.rotate(-ang);
            txt(g, lab[i]!, 0, 0, (i ? 7 : 9) * u, i ? '#e8ecff' : '#ff6b6b', 'center', 900);
            g.restore();
          }
          g.restore();
          g.fillStyle = '#1a2233';
          g.beginPath();
          g.arc(cx, cy, 2 * u, 0, TAU);
          g.fill();
        },
        controls: [
          { type: 'toggle', label: '자동 확대 · 축소', value: true, on: (v) => (autoZoom = v) },
          { type: 'range', label: '확대 (자동 끔일 때)', min: 0.4, max: 3.2, step: 0.05, value: 2, on: (v) => ((zoomCtl = v), (autoZoom = false)) },
          { type: 'toggle', label: '지도 돌리기', value: true, on: (v) => (rotate = v) },
          { type: 'toggle', label: '1 : N 비율 보기', value: true, on: (v) => (showRatio = v) },
        ] as Control[],
      };
    },
  },
};

/* ═════════ 묶음 4 : i277 · i278 · i280 · i281 ═════════ */
/** 주기 P 로 이어지는 값 잡음 (타일로 깔아도 이음새 없음) */
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
const REGION_NAMES = ['가람', '나래', '다솜', '라온', '마루', '바다', '사랑', '아라', '자람', '차오', '카라', '타래', '파랑', '하늘', '한결', '은빛'];
const DATASETS: { name: string; unit: string; ramp: RGB[]; f: (x: number, y: number, i: number) => number }[] = [
  { name: '인구 밀도', unit: '명/km²', ramp: ['#fff3c4', '#ffc078', '#ff7b54', '#d63d6b', '#7a1f5c'].map(hexRGB), f: (x, y, i) => 80 + 900 * Math.pow(clamp01(1 - Math.hypot(x - 0.62, y - 0.4) * 1.9), 2) + 60 * hash2(i, 1) },
  { name: '강수량', unit: 'mm', ramp: ['#e6f5ff', '#9fd3f5', '#4fa3e0', '#2563b8', '#1b2f7a'].map(hexRGB), f: (x, y, i) => 700 + 900 * clamp01(1.1 - x * 1.2 + y * 0.3) + 120 * hash2(i, 2) },
  { name: '사과 생산', unit: '톤', ramp: ['#f2fbe0', '#c3e88d', '#7fcf6a', '#2f9e60', '#0f5f4a'].map(hexRGB), f: (x, y, i) => 50 + 2400 * Math.pow(clamp01(1 - Math.hypot(x - 0.3, y - 0.65) * 2.2), 1.5) + 150 * hash2(i, 3) },
];
const HEAT_RAMPS: RGB[][] = [
  ['#000000', '#1b2a8a', '#1fa2ff', '#2ef08a', '#ffe14a', '#ff6a2a', '#ffffff'].map(hexRGB),
  ['#000000', '#3b0f70', '#8c2981', '#de4968', '#fe9f6d', '#fcfdbf', '#ffffff'].map(hexRGB),
];

const D4: DemoMap = {
  i277: {
    kind: '2d',
    caption: '지역마다 값을 색으로 — 5단계로 나눠 칠하고 범례로 읽어요 · 마우스(가짜 커서)를 대면 그 지역 값이 떠요',
    make() {
      let classes = 5;
      let continuous = false;
      let auto = true;
      let ds = 0;
      let prevDs = 0;
      let swapT = -9;
      let lastSwap = 0;
      let nextReq = false;
      let seedPts: V2[] = [];
      let vals: number[][] = [];
      let resKey = '';
      let RW = 0;
      let RH = 0;
      let rid = new Int16Array(0);
      let edge = new Uint8Array(0);
      let cvs: HTMLCanvasElement | null = null;
      let img: ImageData | null = null;
      let colorKey = '';
      let cent: V2[] = [];
      const NREG = 14;
      {
        const r = rng(11);
        for (let k = 0; k < 4000 && seedPts.length < NREG; k++) {
          const p: V2 = [0.12 + r() * 0.76, 0.12 + r() * 0.76];
          if (landAt(p[0], p[1]) && seedPts.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > 0.14)) seedPts.push(p);
        }
        vals = DATASETS.map((d) => seedPts.map((p, i) => d.f(p[0], p[1], i)));
      }
      function landAt(x: number, y: number): boolean {
        const d = Math.hypot((x - 0.5) * 1.05, (y - 0.5) * 1.15);
        return fbm(x * 3.2, y * 3.2, 33, 4) * 0.55 + 0.45 - d * 1.05 > 0.3;
      }
      const build = (W: number, H: number): void => {
        RW = W;
        RH = H;
        rid = new Int16Array(W * H).fill(-1);
        const sx = new Float32Array(NREG * 2);
        seedPts.forEach((p, i) => ((sx[i * 2] = p[0]), (sx[i * 2 + 1] = p[1])));
        const cx = new Float64Array(NREG);
        const cy = new Float64Array(NREG);
        const cn = new Float64Array(NREG);
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++) {
            const fx = x / W;
            const fy = y / H;
            if (!landAt(fx, fy)) continue;
            // 경계를 살짝 흔들어 자연스러운 땅 모양으로
            const jx = fx + (vnoise(fx * 18, fy * 18, 4) - 0.5) * 0.035;
            const jy = fy + (vnoise(fx * 18 + 9, fy * 18, 4) - 0.5) * 0.035;
            let best = 0;
            let bd = Infinity;
            for (let i = 0; i < seedPts.length; i++) {
              const d = (jx - sx[i * 2]!) ** 2 + ((jy - sx[i * 2 + 1]!) * 0.85) ** 2;
              if (d < bd) {
                bd = d;
                best = i;
              }
            }
            rid[y * W + x] = best;
            cx[best] = cx[best]! + x;
            cy[best] = cy[best]! + y;
            cn[best] = cn[best]! + 1;
          }
        cent = seedPts.map((_, i) => [cx[i]! / Math.max(1, cn[i]!), cy[i]! / Math.max(1, cn[i]!)]);
        edge = new Uint8Array(W * H);
        for (let y = 1; y < H - 1; y++)
          for (let x = 1; x < W - 1; x++) {
            const i = y * W + x;
            const a = rid[i]!;
            if (a < 0) continue;
            const r2 = rid[i + 1]!;
            const b = rid[i + W]!;
            const l = rid[i - 1]!;
            const tp = rid[i - W]!;
            if (r2 < 0 || b < 0 || l < 0 || tp < 0) edge[i] = 2;
            else if (r2 !== a || b !== a) edge[i] = 1;
          }
        cvs = mk(W, H);
        img = cvs.getContext('2d')!.createImageData(W, H);
        colorKey = '';
      };
      const classOf = (v: number, mn: number, mx: number): number => clamp(Math.floor(((v - mn) / (mx - mn + 1e-9)) * classes), 0, classes - 1);
      const colorFor = (d: number, v: number): RGB => {
        const arr = vals[d]!;
        const mn = Math.min(...arr);
        const mx = Math.max(...arr);
        const k = continuous ? (v - mn) / (mx - mn) : (classOf(v, mn, mx) + 0.5) / classes;
        return rampAt(DATASETS[d]!.ramp, k);
      };
      const layer = new Layer();
      return {
        draw(g, w, h, t) {
          reset(g);
          const u = scaleOf(w, h);
          const dpr = dprOf(g);
          if (nextReq || (auto && t - lastSwap > 4 && t > swapT + 1)) {
            nextReq = false;
            prevDs = ds;
            ds = (ds + 1) % DATASETS.length;
            swapT = t;
            lastSwap = t;
          }
          const tw = smooth(0, 0.7, t - swapT);
          const headH = 18 * u;
          const legW = 64 * u;
          const mapW = w - legW - 14 * u;
          const mapH = h - headH - 8 * u;
          const side = Math.min(mapW, mapH * 1.25);
          const mw = Math.round(side);
          const mh = Math.round(side / 1.25);
          const mx0 = 6 * u + (mapW - mw) / 2;
          const my0 = headH + (mapH - mh) / 2;
          const res = Math.min(1.5, dpr);
          const key = `${mw}|${mh}|${res}`;
          if (key !== resKey) {
            build(Math.round(mw * res), Math.round(mh * res));
            resKey = key;
          }
          // 가짜 커서
          const cxp = 0.5 + 0.36 * Math.sin(t * 0.53) * Math.cos(t * 0.21);
          const cyp = 0.5 + 0.32 * Math.sin(t * 0.37 + 1);
          const hx = Math.floor(cxp * RW);
          const hy = Math.floor(cyp * RH);
          const hov = rid[clamp(hy, 0, RH - 1) * RW + clamp(hx, 0, RW - 1)] ?? -1;
          const ck = `${ds}|${prevDs}|${tw.toFixed(2)}|${hov}|${classes}|${continuous}`;
          if (ck !== colorKey && img && cvs) {
            colorKey = ck;
            const lut = new Uint32Array(NREG + 1);
            for (let i = 0; i < seedPts.length; i++) {
              const a = colorFor(prevDs, vals[prevDs]![i]!);
              const b = colorFor(ds, vals[ds]![i]!);
              let c: RGB = [lerp(a[0], b[0], tw), lerp(a[1], b[1], tw), lerp(a[2], b[2], tw)];
              if (i === hov) c = [lerp(c[0], 255, 0.25), lerp(c[1], 255, 0.25), lerp(c[2], 255, 0.25)];
              lut[i] = (255 << 24) | ((c[2] & 255) << 16) | ((c[1] & 255) << 8) | (c[0] & 255);
            }
            const d32 = new Uint32Array(img.data.buffer);
            const WHITE = (220 << 24) | (255 << 16) | (255 << 8) | 255;
            const COAST = (255 << 24) | (60 << 16) | (40 << 8) | 30;
            for (let i = 0; i < d32.length; i++) {
              const r2 = rid[i]!;
              if (r2 < 0) {
                d32[i] = 0;
                continue;
              }
              const e = edge[i]!;
              d32[i] = e === 2 ? COAST : e === 1 ? (r2 === hov || rid[i + 1] === hov || rid[i + RW] === hov ? 0xffffffff : WHITE) : lut[r2]!;
            }
            cvs.getContext('2d')!.putImageData(img, 0, 0);
          }
          // 바다 · 그림자 (고정 층)
          const L = layer.get(`${key}|${w}|${h}|${dpr}`, w, h, dpr, (lg) => {
            bgGrad(lg, w, h, '#14203a', '#0b1222');
            lg.strokeStyle = 'rgba(120,170,255,0.06)';
            lg.lineWidth = 1;
            for (let x = 0; x < w; x += 14 * u) {
              lg.beginPath();
              lg.moveTo(x, 0);
              lg.lineTo(x, h);
              lg.stroke();
            }
            for (let y = 0; y < h; y += 14 * u) {
              lg.beginPath();
              lg.moveTo(0, y);
              lg.lineTo(w, y);
              lg.stroke();
            }
            if (cvs) {
              lg.save();
              lg.filter = `blur(${5 * u}px) brightness(0)`;
              lg.globalAlpha = 0.6;
              lg.drawImage(cvs, mx0 + 3 * u, my0 + 5 * u, mw, mh);
              lg.restore();
            }
          });
          g.drawImage(L, 0, 0, w, h);
          if (cvs) {
            g.imageSmoothingEnabled = true;
            g.drawImage(cvs, mx0, my0, mw, mh);
          }
          // 값 글씨 (크게 볼 때)
          const D = DATASETS[ds]!;
          if (u > 1.4) {
            cent.forEach((c, i) => {
              const x = mx0 + (c[0] / RW) * mw;
              const y = my0 + (c[1] / RH) * mh;
              const v = vals[ds]![i]!;
              g.font = `800 ${6.5 * u}px ${F}`;
              g.textAlign = 'center';
              g.textBaseline = 'middle';
              g.lineWidth = 2.5 * u;
              g.strokeStyle = 'rgba(0,0,0,0.35)';
              g.strokeText(comma(v), x, y);
              g.fillStyle = '#fff';
              g.fillText(comma(v), x, y);
            });
          }
          // 범례
          const arr = vals[ds]!;
          const mn = Math.min(...arr);
          const mxv = Math.max(...arr);
          const lx = w - legW - 4 * u;
          let ly = headH + 6 * u;
          rr(g, lx, ly - 4 * u, legW, h - ly - 6 * u, 6 * u);
          g.fillStyle = 'rgba(255,255,255,0.07)';
          g.fill();
          txt(g, D.unit, lx + legW / 2, ly + 3 * u, 6.5 * u, 'rgba(230,236,255,0.7)', 'center', 700);
          ly += 10 * u;
          const hovClass = hov >= 0 ? classOf(arr[hov]!, mn, mxv) : -1;
          if (continuous) {
            const bh = h - ly - 16 * u;
            const gr = g.createLinearGradient(0, ly + bh, 0, ly);
            D.ramp.forEach((c, i) => gr.addColorStop(i / (D.ramp.length - 1), css(c)));
            rr(g, lx + 6 * u, ly, 10 * u, bh, 3 * u);
            g.fillStyle = gr;
            g.fill();
            txt(g, comma(mxv), lx + 20 * u, ly + 3 * u, 6.5 * u, '#e8ecff', 'left', 700);
            txt(g, comma(mn), lx + 20 * u, ly + bh - 3 * u, 6.5 * u, '#e8ecff', 'left', 700);
            if (hov >= 0) {
              const yy = ly + bh * (1 - (arr[hov]! - mn) / (mxv - mn));
              g.fillStyle = '#fff';
              g.beginPath();
              g.moveTo(lx + 4 * u, yy);
              g.lineTo(lx, yy - 3 * u);
              g.lineTo(lx, yy + 3 * u);
              g.fill();
            }
          } else {
            const rowH = Math.min(14 * u, (h - ly - 10 * u) / classes);
            for (let c = classes - 1; c >= 0; c--) {
              const y = ly + (classes - 1 - c) * rowH;
              const col = rampAt(D.ramp, (c + 0.5) / classes);
              rr(g, lx + 6 * u, y, 11 * u, rowH - 2 * u, 2 * u);
              g.fillStyle = css(col);
              g.fill();
              if (c === hovClass) {
                g.strokeStyle = '#fff';
                g.lineWidth = 1.5 * u;
                g.stroke();
              }
              const a = mn + ((mxv - mn) * c) / classes;
              txt(g, `${comma(a)}~`, lx + 20 * u, y + (rowH - 2 * u) / 2, 6.2 * u, c === hovClass ? '#fff' : 'rgba(230,236,255,0.8)', 'left', 700);
            }
          }
          // 커서 · 말풍선
          const px = mx0 + cxp * mw;
          const py = my0 + cyp * mh;
          if (hov >= 0) {
            const s1 = REGION_NAMES[hov] ?? '?';
            const s2 = `${comma(arr[hov]!)} ${D.unit}`;
            g.font = `800 ${7.5 * u}px ${F}`;
            const bw = Math.max(g.measureText(s1).width, g.measureText(s2).width) + 12 * u;
            const bx = clamp(px + 8 * u, 2, w - bw - 2);
            const by = clamp(py - 30 * u, 2, h - 30 * u);
            g.save();
            g.shadowColor = 'rgba(0,0,0,0.4)';
            g.shadowBlur = 6 * u;
            rr(g, bx, by, bw, 24 * u, 5 * u);
            g.fillStyle = 'rgba(255,255,255,0.96)';
            g.fill();
            g.restore();
            txt(g, s1, bx + 6 * u, by + 7.5 * u, 7 * u, '#556', 'left', 800);
            txt(g, s2, bx + 6 * u, by + 17 * u, 7.5 * u, '#111', 'left', 900);
          }
          g.fillStyle = '#fff';
          g.strokeStyle = '#111';
          g.lineWidth = 1 * u;
          g.beginPath();
          g.moveTo(px, py);
          g.lineTo(px, py + 11 * u);
          g.lineTo(px + 3 * u, py + 8 * u);
          g.lineTo(px + 7.5 * u, py + 8 * u);
          g.closePath();
          g.fill();
          g.stroke();
          txt(g, D.name, 8 * u, headH / 2 + 1 * u, 10.5 * u, css(D.ramp[2]!), 'left', 900);
          pill(g, continuous ? '연속 색' : `${classes}단계`, w - 6 * u, headH / 2 + 1 * u, 7 * u, 'rgba(255,255,255,0.12)', '#e8ecff', 'right');
        },
        controls: [
          { type: 'range', label: '단계 수', min: 3, max: 7, step: 1, value: 5, on: (v) => (classes = v) },
          { type: 'toggle', label: '연속 색 (단계 없이)', value: false, on: (v) => (continuous = v) },
          { type: 'toggle', label: '자료 자동으로 바꾸기', value: true, on: (v) => (auto = v) },
          { type: 'button', label: '다음 자료', on: () => (nextReq = true) },
        ] as Control[],
      };
    },
  },

  i278: {
    kind: '2d',
    caption: '게임 화면에서 누른 자리를 모으면 — 많이 눌린 곳이 뜨겁게(빨강 · 흰빛) 번져요 · 「시작」 단추에 몰리는 게 한눈에',
    make() {
      const GW = 120;
      const GH = 75;
      const heat = new Float32Array(GW * GH);
      let radius = 4;
      let showDots = true;
      let rampI = 0;
      let rate = 45;
      let acc = 0;
      let count = 0;
      let round = 0;
      let peak = 1;
      const pings: { x: number; y: number; t: number }[] = [];
      const small = mk(GW, GH);
      const sg = small.getContext('2d')!;
      const img = sg.createImageData(GW, GH);
      const layer = new Layer();
      // 화면 요소 (0..1 좌표) — 누르는 자리 분포의 중심
      const spots = (): [number, number, number, number][] => {
        const r = rng(round * 3 + 1);
        return [
          [0.5, 0.78, 0.07, 0.38 + r() * 0.1], // 시작
          [0.18, 0.12, 0.04, 0.1], // 뒤로
          [0.86, 0.12, 0.04, 0.12 + r() * 0.08], // 상점
          [0.3, 0.42, 0.06, 0.1 + r() * 0.1], // 1단계
          [0.5, 0.42, 0.06, 0.08 + r() * 0.06],
          [0.7, 0.42, 0.06, 0.05 + r() * 0.05],
          [0.5, 0.42, 0.3, 0.06], // 아무 데나
        ];
      };
      let S = spots();
      const gauss = (r: () => number): number => {
        const a = Math.max(1e-6, r());
        return Math.sqrt(-2 * Math.log(a)) * Math.cos(TAU * r());
      };
      const rr2 = rng(99);
      const addPoint = (t: number): void => {
        const tot = S.reduce((a, s) => a + s[3], 0);
        let pick = rr2() * tot;
        let sp = S[0]!;
        for (const s of S) {
          pick -= s[3];
          if (pick <= 0) {
            sp = s;
            break;
          }
        }
        const x = clamp01(sp[0] + gauss(rr2) * sp[2]);
        const y = clamp01(sp[1] + gauss(rr2) * sp[2] * 1.2);
        pings.push({ x, y, t });
        if (pings.length > 260) pings.shift();
        const R = radius;
        const gx = x * GW;
        const gy = y * GH;
        for (let yy = Math.floor(gy - R * 2); yy <= gy + R * 2; yy++)
          for (let xx = Math.floor(gx - R * 2); xx <= gx + R * 2; xx++) {
            if (xx < 0 || yy < 0 || xx >= GW || yy >= GH) continue;
            const d2 = (xx + 0.5 - gx) ** 2 + (yy + 0.5 - gy) ** 2;
            heat[yy * GW + xx] = heat[yy * GW + xx]! + Math.exp(-d2 / (R * R * 0.5));
          }
        count++;
      };
      const restart = (): void => {
        heat.fill(0);
        count = 0;
        round++;
        S = spots();
        pings.length = 0;
        peak = 1;
      };
      const paintScreen = (lg: G, x0: number, y0: number, W: number, H: number, u: number): void => {
        const gr = lg.createLinearGradient(0, y0, 0, y0 + H);
        gr.addColorStop(0, '#3a2f6b');
        gr.addColorStop(1, '#1d2a52');
        rr(lg, x0, y0, W, H, 8 * u);
        lg.fillStyle = gr;
        lg.fill();
        lg.save();
        lg.clip();
        lg.fillStyle = 'rgba(255,255,255,0.05)';
        for (let i = 0; i < 30; i++) lg.fillRect(x0 + hash2(i, 1) * W, y0 + hash2(i, 2) * H, 2 * u, 2 * u);
        lg.restore();
        const btn = (cx: number, cy: number, bw: number, bh: number, label: string, col: string): void => {
          rr(lg, x0 + cx * W - bw / 2, y0 + cy * H - bh / 2 + 2 * u, bw, bh, bh * 0.3);
          lg.fillStyle = 'rgba(0,0,0,0.35)';
          lg.fill();
          rr(lg, x0 + cx * W - bw / 2, y0 + cy * H - bh / 2, bw, bh, bh * 0.3);
          lg.fillStyle = col;
          lg.fill();
          txt(lg, label, x0 + cx * W, y0 + cy * H, Math.min(bh * 0.42, 11 * u), '#fff', 'center', 900);
        };
        txt(lg, '별빛 모험', x0 + W / 2, y0 + H * 0.16, 13 * u, '#ffe08a', 'center', 900);
        btn(0.18, 0.12, 26 * u, 15 * u, '←', '#4a5590');
        btn(0.86, 0.12, 30 * u, 15 * u, '상점', '#d9488f');
        btn(0.3, 0.42, 30 * u, 30 * u, '1', '#3fbf7f');
        btn(0.5, 0.42, 30 * u, 30 * u, '2', '#3f9fdf');
        btn(0.7, 0.42, 30 * u, 30 * u, '3', '#8a6fdf');
        btn(0.5, 0.78, 76 * u, 22 * u, '시작', '#ff8a3d');
      };
      return {
        draw(g, w, h, t, dt) {
          reset(g);
          const u = scaleOf(w, h);
          const dpr = dprOf(g);
          acc += Math.min(dt, 0.1) * rate;
          while (acc >= 1) {
            acc -= 1;
            addPoint(t);
          }
          if (count > 420) restart();
          const x0 = 8 * u;
          const y0 = 8 * u;
          const W = w - 16 * u;
          const H = h - 16 * u;
          const L = layer.get(`${w}|${h}|${dpr}`, w, h, dpr, (lg) => {
            bgGrad(lg, w, h, '#0f1424', '#080b14');
            paintScreen(lg, x0, y0, W, H, u);
          });
          g.drawImage(L, 0, 0, w, h);
          g.fillStyle = 'rgba(5,8,18,0.45)';
          g.fillRect(x0, y0, W, H);
          // 색 입히기
          let mx = 0;
          for (let i = 0; i < heat.length; i++) if (heat[i]! > mx) mx = heat[i]!;
          peak = Math.max(lerp(peak, mx, 0.08), 1);
          const ramp = HEAT_RAMPS[rampI]!;
          const d = img.data;
          for (let i = 0; i < heat.length; i++) {
            const k = clamp01(heat[i]! / peak);
            const kk = Math.pow(k, 0.7);
            const c = rampAt(ramp, kk);
            d[i * 4] = c[0];
            d[i * 4 + 1] = c[1];
            d[i * 4 + 2] = c[2];
            d[i * 4 + 3] = clamp(kk * 1.6, 0, 1) * 215;
          }
          sg.putImageData(img, 0, 0);
          g.save();
          rr(g, x0, y0, W, H, 8 * u);
          g.clip();
          g.imageSmoothingEnabled = true;
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = 0.9;
          g.drawImage(small, x0, y0, W, H);
          g.globalCompositeOperation = 'source-over';
          g.globalAlpha = 1;
          if (showDots) {
            for (const p of pings) {
              const age = t - p.t;
              const X = x0 + p.x * W;
              const Y = y0 + p.y * H;
              if (age < 0.6) {
                g.strokeStyle = `rgba(255,255,255,${0.9 * (1 - age / 0.6)})`;
                g.lineWidth = 1.3 * u;
                g.beginPath();
                g.arc(X, Y, (2 + age * 18) * u, 0, TAU);
                g.stroke();
              }
              g.fillStyle = 'rgba(255,255,255,0.55)';
              g.fillRect(X - 0.8 * u, Y - 0.8 * u, 1.6 * u, 1.6 * u);
            }
          }
          g.restore();
          // 색 사다리
          const bw = 70 * u;
          const bx = w - bw - 14 * u;
          const by = h - 20 * u;
          rr(g, bx - 5 * u, by - 9 * u, bw + 10 * u, 22 * u, 5 * u);
          g.fillStyle = 'rgba(8,10,20,0.7)';
          g.fill();
          const gr = g.createLinearGradient(bx, 0, bx + bw, 0);
          ramp.forEach((c, i) => gr.addColorStop(i / (ramp.length - 1), css(c)));
          g.fillStyle = gr;
          g.fillRect(bx, by, bw, 5 * u);
          txt(g, '적게', bx, by - 4 * u, 6 * u, '#cfd6ee', 'left', 700);
          txt(g, '많이', bx + bw, by - 4 * u, 6 * u, '#cfd6ee', 'right', 700);
          pill(g, `누른 횟수 ${count}`, 14 * u, h - 17 * u, 7.5 * u, 'rgba(8,10,20,0.7)', '#fff', 'left');
        },
        controls: [
          { type: 'range', label: '번짐 반경', min: 1.5, max: 9, step: 0.5, value: 4, on: (v) => (radius = v) },
          { type: 'range', label: '누르는 빠르기', min: 5, max: 150, step: 5, value: 45, on: (v) => (rate = v) },
          { type: 'toggle', label: '누른 점 보기', value: true, on: (v) => (showDots = v) },
          { type: 'toggle', label: '색 사다리: 무지개 ↔ 마그마', value: false, on: (v) => (rampI = v ? 1 : 0) },
          { type: 'button', label: '다시 모으기', on: restart },
        ] as Control[],
      };
    },
  },

  i280: {
    kind: '2d',
    caption: '출발 → 도착으로 점선이 그려지며 비행기가 날고, 땅길은 발자국이 콕콕 — 거리 숫자가 같이 올라가요',
    make() {
      const Wd = getWorld();
      let speed = 1;
      let mode = 0; // 0 자동 · 1 비행기 · 2 걷기
      let seq: number[] = [];
      let legT = 0;
      let leg = 0;
      let round = 0;
      let total = 0;
      const newSeq = (): void => {
        const r = rng(round++ * 7 + 3);
        const n = Wd.towns.length;
        const s: number[] = [Math.floor(r() * n)];
        while (s.length < 4) {
          const c = Math.floor(r() * n);
          if (!s.includes(c)) s.push(c);
        }
        seq = s;
        leg = 0;
        legT = 0;
        total = 0;
      };
      newSeq();
      const legMode = (i: number): number => (mode ? mode : i % 2 ? 2 : 1);
      const legPts = (i: number): V2[] => {
        const a = Wd.towns[seq[i]!]!;
        const b = Wd.towns[seq[i + 1]!]!;
        const out: V2[] = [];
        const lm = legMode(i);
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const L = Math.hypot(dx, dy);
        for (let k = 0; k <= 40; k++) {
          const f = k / 40;
          const nx = -dy / L;
          const ny = dx / L;
          const off = lm === 1 ? Math.sin(f * Math.PI) * L * 0.28 : Math.sin(f * Math.PI * 3 + i) * L * 0.04;
          out.push([a[0] + dx * f + nx * off, a[1] + dy * f + ny * off]);
        }
        return out;
      };
      const LEG = 2.4;
      return {
        draw(g, w, h, t, dt) {
          reset(g);
          const u = scaleOf(w, h);
          legT += (Math.min(dt, 0.1) * speed) / LEG;
          if (legT >= 1.25) {
            total += polyLen(legPts(leg)) * 0.05;
            leg++;
            legT = 0;
            if (leg >= seq.length - 1) newSeq();
          }
          // 지도 (책 지도 같은 색감)
          const sc = Math.max(w / WORLD_W, h / WORLD_H) * 1.15;
          const ox = (w - WORLD_W * sc) / 2;
          const oy = (h - WORLD_H * sc) / 2;
          g.drawImage(Wd.c, ox, oy, WORLD_W * sc, WORLD_H * sc);
          g.globalCompositeOperation = 'multiply';
          g.fillStyle = '#e8d6b0';
          g.fillRect(0, 0, w, h);
          g.globalCompositeOperation = 'source-over';
          g.fillStyle = 'rgba(255,240,210,0.12)';
          g.fillRect(0, 0, w, h);
          const S = (p: V2): V2 => [ox + p[0] * sc, oy + p[1] * sc];
          // 지난 길
          for (let i = 0; i < leg; i++) {
            const pts = legPts(i).map(S);
            g.setLineDash(legMode(i) === 1 ? [5 * u, 4 * u] : [2 * u, 3 * u]);
            g.strokeStyle = 'rgba(160,40,40,0.55)';
            g.lineWidth = 1.6 * u;
            strokePathPart(g, pts, 1);
          }
          g.setLineDash([]);
          // 지금 길
          const pts = legPts(leg).map(S);
          const k = clamp01(legT);
          const lm = legMode(leg);
          const ek = ease(k);
          if (lm === 1) {
            g.setLineDash([5 * u, 4 * u]);
            g.lineDashOffset = -t * 20 * u;
            g.strokeStyle = '#c0262d';
            g.lineWidth = 2 * u;
            g.lineCap = 'round';
            strokePathPart(g, pts, ek);
            g.setLineDash([]);
            const [p, ang] = alongPoly(pts, ek * polyLen(pts));
            const lift = Math.sin(k * Math.PI);
            // 그림자 → 비행기
            g.fillStyle = 'rgba(0,0,0,0.25)';
            g.beginPath();
            g.ellipse(p[0] + 6 * u * lift, p[1] + 10 * u * lift, 7 * u, 3 * u, ang, 0, TAU);
            g.fill();
            g.save();
            g.translate(p[0], p[1]);
            g.rotate(ang);
            const s = (8 + 3 * lift) * u;
            g.fillStyle = '#ffffff';
            g.strokeStyle = '#2a3550';
            g.lineWidth = 0.9 * u;
            g.beginPath();
            g.moveTo(s, 0);
            g.quadraticCurveTo(s * 0.8, -s * 0.16, s * 0.2, -s * 0.14);
            g.lineTo(-s * 0.1, -s * 0.85);
            g.lineTo(-s * 0.35, -s * 0.85);
            g.lineTo(-s * 0.15, -s * 0.14);
            g.lineTo(-s * 0.75, -s * 0.12);
            g.lineTo(-s * 0.95, -s * 0.42);
            g.lineTo(-s * 1.05, -s * 0.42);
            g.lineTo(-s * 0.95, 0);
            g.lineTo(-s * 1.05, s * 0.42);
            g.lineTo(-s * 0.95, s * 0.42);
            g.lineTo(-s * 0.75, s * 0.12);
            g.lineTo(-s * 0.15, s * 0.14);
            g.lineTo(-s * 0.35, s * 0.85);
            g.lineTo(-s * 0.1, s * 0.85);
            g.lineTo(s * 0.2, s * 0.14);
            g.quadraticCurveTo(s * 0.8, s * 0.16, s, 0);
            g.closePath();
            g.fill();
            g.stroke();
            g.fillStyle = '#e63946';
            g.fillRect(-s * 0.95, -s * 0.06, s * 0.3, s * 0.12);
            g.restore();
          } else {
            // 발자국
            const L = polyLen(pts);
            const step = 7 * u;
            const n = Math.floor((ek * L) / step);
            for (let q = 0; q <= n; q++) {
              const [p, ang] = alongPoly(pts, q * step);
              const side = q % 2 ? 1 : -1;
              const age = n - q;
              g.globalAlpha = clamp(1 - age * 0.04, 0.35, 1);
              g.save();
              g.translate(p[0] - Math.sin(ang) * side * 2.2 * u, p[1] + Math.cos(ang) * side * 2.2 * u);
              g.rotate(ang + Math.PI / 2);
              g.fillStyle = '#5a3418';
              g.beginPath();
              g.ellipse(0, 0, 1.4 * u, 2.3 * u, 0, 0, TAU);
              g.fill();
              g.beginPath();
              g.ellipse(0, 2.9 * u, 1.1 * u, 1.1 * u, 0, 0, TAU);
              g.fill();
              g.restore();
            }
            g.globalAlpha = 1;
          }
          // 도시 핀
          seq.forEach((ti, i) => {
            if (i > leg + 1) return;
            const p = S(Wd.towns[ti]!);
            const born = i <= leg ? 1 : clamp01((legT - 0.95) / 0.25);
            if (born <= 0) return;
            const bounce = 1 - Math.abs(Math.sin(born * Math.PI * 1.5)) * (1 - born) * 0.8;
            g.save();
            g.translate(p[0], p[1]);
            g.scale(born, born * bounce + (1 - born));
            drawPin(g, 0, 0, 16 * u, i === 0 ? '#2a9d8f' : '#e63946', t);
            g.restore();
            pill(g, `${i + 1}`, p[0], p[1] - 22 * u, 6.5 * u, '#fff', '#222');
          });
          const curDist = total + polyLen(legPts(leg)) * 0.05 * ek;
          pill(g, `${lm === 1 ? '✈ 비행기' : '걷기'} · ${curDist.toFixed(1)} km`, 8 * u, 14 * u, 8.5 * u, 'rgba(255,255,255,0.92)', '#2a1a10', 'left');
          vignette(g, w, h, 0.4);
        },
        controls: [
          { type: 'range', label: '속도', min: 0.3, max: 3, step: 0.1, value: 1, on: (v) => (speed = v) },
          { type: 'range', label: '이동 (0 번갈아 · 1 비행기 · 2 걷기)', min: 0, max: 2, step: 1, value: 0, on: (v) => (mode = v) },
          { type: 'button', label: '새 여행', on: newSeq },
        ] as Control[],
      };
    },
  },

  i281: {
    kind: '2d',
    caption: '지금 보이는 곳은 밝게 · 가 본 곳은 흐리게 · 아직 모르는 곳은 구름 안개 — 탐험가가 가장 가까운 미지로 걸어가요',
    make() {
      const C = 36;
      const R = 22;
      let seed = 8;
      let terr = new Uint8Array(C * R); // 0 물 1 모래 2 풀 3 숲 4 산
      let state = new Uint8Array(C * R);
      let radius = 3.6;
      let soft = true;
      let speed = 1;
      let path: number[] = [];
      let pi = 0;
      let frac = 0;
      let born = 0;
      let nowT = 0;
      const colL = new Layer();
      const grayL = new Layer();
      const visM = mk(C, R);
      const vmg = visM.getContext('2d')!;
      const vImg = vmg.createImageData(C, R);
      const fogM = mk(C, R);
      const fmg = fogM.getContext('2d')!;
      const fImg = fmg.createImageData(C, R);
      let tmpA: HTMLCanvasElement | null = null;
      let tmpB: HTMLCanvasElement | null = null;
      let cloud: HTMLCanvasElement | null = null;
      const block = (i: number): boolean => terr[i] === 0 || terr[i] === 4;
      const gen = (): void => {
        for (let tries = 0; tries < 20; tries++) {
          terr = new Uint8Array(C * R);
          for (let y = 0; y < R; y++)
            for (let x = 0; x < C; x++) {
              const d = Math.hypot((x / C - 0.5) * 1.2, (y / R - 0.5) * 1.3);
              const hgt = fbm(x * 0.13, y * 0.13, seed + tries * 3, 4) - d * 0.9 + 0.3;
              const f = fbm(x * 0.2 + 30, y * 0.2, seed + 7, 3);
              terr[y * C + x] = hgt < 0.28 ? 0 : hgt < 0.33 ? 1 : hgt > 0.6 ? 4 : f > 0.55 ? 3 : 2;
            }
          let start = -1;
          for (let i = Math.floor(C * R * 0.5); i < C * R; i++)
            if (!block(i)) {
              start = i;
              break;
            }
          if (start < 0) continue;
          let reach = 0;
          let land = 0;
          const seen2 = new Uint8Array(C * R);
          const q = [start];
          seen2[start] = 1;
          for (let h = 0; h < q.length; h++) {
            const i = q[h]!;
            reach++;
            const x = i % C;
            const y = (i / C) | 0;
            for (let d = 0; d < 4; d++) {
              const nx = x + DX[d]!;
              const ny = y + DY[d]!;
              if (nx < 0 || ny < 0 || nx >= C || ny >= R) continue;
              const j = ny * C + nx;
              if (seen2[j] || block(j)) continue;
              seen2[j] = 1;
              q.push(j);
            }
          }
          for (let i = 0; i < C * R; i++) if (!block(i)) land++;
          if (reach > land * 0.8 && land > C * R * 0.35) {
            state = new Uint8Array(C * R);
            path = [start];
            pi = 0;
            frac = 0;
            born = nowT;
            return;
          }
        }
      };
      const nextGoal = (): void => {
        const cur = path[Math.min(pi, path.length - 1)]!;
        // 아직 모르는 칸에 가장 가까운 길 (너비 우선)
        const par = new Int32Array(C * R).fill(-2);
        par[cur] = -1;
        const q = [cur];
        let goal = -1;
        for (let h = 0; h < q.length && goal < 0; h++) {
          const i = q[h]!;
          const x = i % C;
          const y = (i / C) | 0;
          for (let d = 0; d < 4; d++) {
            const nx = x + DX[d]!;
            const ny = y + DY[d]!;
            if (nx < 0 || ny < 0 || nx >= C || ny >= R) continue;
            const j = ny * C + nx;
            if (par[j] !== -2 || block(j)) continue;
            par[j] = i;
            if (state[j] === 0) {
              goal = j;
              break;
            }
            q.push(j);
          }
        }
        if (goal < 0) {
          seed++;
          gen();
          return;
        }
        const out: number[] = [];
        for (let c = goal; c >= 0; c = par[c]!) out.unshift(c);
        path = out;
        pi = 0;
        frac = 0;
      };
      gen();
      const TC = ['#2f6fa3', '#e7d39a', '#7cc35f', '#3f8f4a', '#8b8578'];
      const paintTerrain = (lg: G, fit: Fit): void => {
        const { s, ox, oy } = fit;
        for (let i = 0; i < C * R; i++) {
          const x = ox + (i % C) * s;
          const y = oy + ((i / C) | 0) * s;
          const c = hexRGB(TC[terr[i]!]!);
          const v = 0.92 + 0.14 * hash2(i, 5, seed);
          lg.fillStyle = css([c[0] * v, c[1] * v, c[2] * v]);
          lg.fillRect(x, y, s + 0.6, s + 0.6);
        }
        for (let i = 0; i < C * R; i++) {
          const cx = ox + ((i % C) + 0.5) * s;
          const cy = oy + (((i / C) | 0) + 0.5) * s;
          const k = terr[i]!;
          if (k === 3) {
            for (const [dx, dy] of [
              [-0.18, 0.05],
              [0.2, -0.1],
            ] as V2[]) {
              lg.fillStyle = 'rgba(0,0,0,0.25)';
              lg.beginPath();
              lg.ellipse(cx + dx * s + s * 0.05, cy + dy * s + s * 0.22, s * 0.22, s * 0.1, 0, 0, TAU);
              lg.fill();
              lg.fillStyle = '#2c6e3a';
              lg.beginPath();
              lg.arc(cx + dx * s, cy + dy * s, s * 0.24, 0, TAU);
              lg.fill();
              lg.fillStyle = 'rgba(255,255,255,0.15)';
              lg.beginPath();
              lg.arc(cx + dx * s - s * 0.07, cy + dy * s - s * 0.07, s * 0.09, 0, TAU);
              lg.fill();
            }
          } else if (k === 4) {
            lg.fillStyle = '#6d675c';
            lg.beginPath();
            lg.moveTo(cx - s * 0.45, cy + s * 0.35);
            lg.lineTo(cx, cy - s * 0.42);
            lg.lineTo(cx + s * 0.45, cy + s * 0.35);
            lg.fill();
            lg.fillStyle = '#f2f4f7';
            lg.beginPath();
            lg.moveTo(cx - s * 0.16, cy - s * 0.14);
            lg.lineTo(cx, cy - s * 0.42);
            lg.lineTo(cx + s * 0.16, cy - s * 0.14);
            lg.fill();
          } else if (k === 0 && hash2(i, 8, seed) < 0.3) {
            lg.strokeStyle = 'rgba(255,255,255,0.3)';
            lg.lineWidth = Math.max(0.6, s * 0.07);
            lg.beginPath();
            lg.arc(cx, cy + s * 0.2, s * 0.25, Math.PI * 1.15, Math.PI * 1.85);
            lg.stroke();
          } else if (k === 2 && hash2(i, 9, seed) < 0.2) {
            lg.fillStyle = ['#ffd6e7', '#fff3a8', '#ffffff'][Math.floor(hash2(i, 10, seed) * 3)]!;
            lg.beginPath();
            lg.arc(cx + s * 0.15, cy, s * 0.07, 0, TAU);
            lg.arc(cx - s * 0.12, cy + s * 0.15, s * 0.06, 0, TAU);
            lg.fill();
          }
        }
      };
      return {
        draw(g, w, h, t, dt) {
          reset(g);
          nowT = t;
          const u = scaleOf(w, h);
          const dpr = dprOf(g);
          frac += Math.min(dt, 0.1) * speed * 4;
          while (frac >= 1) {
            frac -= 1;
            pi++;
            if (pi >= path.length - 1) nextGoal();
          }
          const ci = path[Math.min(pi, path.length - 1)]!;
          const ni = path[Math.min(pi + 1, path.length - 1)]!;
          const px = lerp(ci % C, ni % C, frac) + 0.5;
          const py = lerp((ci / C) | 0, (ni / C) | 0, frac) + 0.5;
          // 상태 · 가면
          let land = 0;
          let explored = 0;
          for (let i = 0; i < C * R; i++) {
            const d = Math.hypot((i % C) + 0.5 - px, ((i / C) | 0) + 0.5 - py);
            const vis = smooth(radius + 0.6, radius - 0.8, d);
            if (d < radius) state[i] = 2;
            else if (state[i] === 2) state[i] = 1;
            const known = state[i]! > 0;
            const o = i * 4;
            vImg.data[o + 3] = known ? Math.round((1 - vis) * 255) : 255;
            fImg.data[o + 3] = known ? 0 : 255;
            if (!block(i)) {
              land++;
              if (known) explored++;
            }
          }
          vmg.putImageData(vImg, 0, 0);
          fmg.putImageData(fImg, 0, 0);
          if (explored / land > 0.97 || t - born > 40 || t < born) {
            seed++;
            gen();
          }
          bgGrad(g, w, h, '#0e1424', '#070a14');
          const headH = 16 * u;
          const fit = fitGrid(C, R, 5 * u, headH, w - 10 * u, h - headH - 5 * u);
          const { s, ox, oy } = fit;
          const key = `${seed}|${w}|${h}|${dpr}|${terr[0]}${terr[C * R - 1]}`;
          const CL = colL.get(key, w, h, dpr, (lg) => paintTerrain(lg, fit));
          const GL = grayL.get(key, w, h, dpr, (lg) => {
            lg.filter = 'grayscale(0.9) brightness(0.55) contrast(0.9)';
            lg.drawImage(CL, 0, 0, w, h);
            lg.filter = 'none';
            lg.globalCompositeOperation = 'source-atop';
            lg.fillStyle = 'rgba(70,90,150,0.25)';
            lg.fillRect(0, 0, w, h);
          });
          if (!cloud) {
            const n = 192;
            cloud = mk(n, n);
            const cg = cloud.getContext('2d')!;
            const ci2 = cg.createImageData(n, n);
            for (let y = 0; y < n; y++)
              for (let x = 0; x < n; x++) {
                const v = (pnoise((x / n) * 6, (y / n) * 6, 6, 3) * 0.55 + pnoise((x / n) * 12, (y / n) * 12, 12, 4) * 0.3 + pnoise((x / n) * 24, (y / n) * 24, 24, 5) * 0.15) * 255;
                const o = (y * n + x) * 4;
                ci2.data[o] = 200;
                ci2.data[o + 1] = 210;
                ci2.data[o + 2] = 240;
                ci2.data[o + 3] = Math.max(0, v - 90) * 0.75;
              }
            cg.putImageData(ci2, 0, 0);
          }
          const pw = Math.round(w * dpr);
          const ph = Math.round(h * dpr);
          if (!tmpA || tmpA.width !== pw || tmpA.height !== ph) {
            tmpA = mk(pw, ph);
            tmpB = mk(pw, ph);
          }
          const A = tmpA.getContext('2d')!;
          const B = tmpB!.getContext('2d')!;
          g.drawImage(CL, 0, 0, w, h);
          // 가 본 곳: 흐린 그림을 「지금 안 보이는 곳」 가면으로
          A.setTransform(1, 0, 0, 1, 0, 0);
          A.globalCompositeOperation = 'source-over';
          A.clearRect(0, 0, pw, ph);
          A.drawImage(GL, 0, 0, pw, ph);
          A.globalCompositeOperation = 'destination-in';
          A.imageSmoothingEnabled = soft;
          A.drawImage(visM, ox * dpr, oy * dpr, C * s * dpr, R * s * dpr);
          A.globalCompositeOperation = 'source-over';
          g.drawImage(tmpA, 0, 0, w, h);
          // 모르는 곳: 어두운 구름
          B.setTransform(1, 0, 0, 1, 0, 0);
          B.globalCompositeOperation = 'source-over';
          B.clearRect(0, 0, pw, ph);
          B.fillStyle = '#070b16';
          B.fillRect(0, 0, pw, ph);
          const cs = 150 * u * dpr;
          const offx = (t * 6 * u * dpr) % cs;
          for (let y = -cs; y < ph + cs; y += cs) for (let x = -cs; x < pw + cs; x += cs) B.drawImage(cloud, x + offx, y + offx * 0.4, cs, cs);
          B.globalCompositeOperation = 'destination-in';
          B.imageSmoothingEnabled = soft;
          B.drawImage(fogM, ox * dpr, oy * dpr, C * s * dpr, R * s * dpr);
          B.globalCompositeOperation = 'source-over';
          g.drawImage(tmpB!, 0, 0, w, h);
          // 탐험가
          const X = ox + px * s;
          const Y = oy + py * s;
          const ang = Math.atan2(((ni / C) | 0) - ((ci / C) | 0), (ni % C) - (ci % C));
          drawHero(g, X, Y - s * 0.15, s * 1.2, ang, '#ffb347');
          g.strokeStyle = '#fff';
          g.lineWidth = Math.max(0.8, s * 0.08);
          g.beginPath();
          g.moveTo(X + s * 0.38, Y - s * 0.1);
          g.lineTo(X + s * 0.38, Y - s * 0.9);
          g.stroke();
          g.fillStyle = '#ff4f6b';
          g.beginPath();
          g.moveTo(X + s * 0.38, Y - s * 0.9);
          g.lineTo(X + s * 0.8, Y - s * 0.75);
          g.lineTo(X + s * 0.38, Y - s * 0.6);
          g.fill();
          txt(g, '안개 지도', 7 * u, headH / 2 + 1 * u, 10.5 * u, '#bfe3ff', 'left', 900);
          pill(g, `탐험한 땅 ${explored} / ${land}칸 (${Math.round((explored / land) * 100)}%)`, w - 6 * u, headH / 2 + 1 * u, 7.5 * u, 'rgba(255,255,255,0.12)', '#e8ecff', 'right');
        },
        controls: [
          { type: 'range', label: '시야 반경', min: 1.5, max: 7, step: 0.5, value: 3.6, on: (v) => (radius = v) },
          { type: 'toggle', label: '부드러운 안개 가장자리', value: true, on: (v) => (soft = v) },
          { type: 'range', label: '속도', min: 0.3, max: 3, step: 0.1, value: 1, on: (v) => (speed = v) },
          { type: 'button', label: '다시 탐험', on: () => (seed++, gen()) },
        ] as Control[],
      };
    },
  },
};

/* ═════════ 묶음 5 (3D) : i275 · i276 · i279 ═════════ */
type T3 = typeof THREE;
function gradTex(T: T3, top: string, bot: string): THREE.CanvasTexture {
  const c = mk(4, 256);
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, top);
  gr.addColorStop(1, bot);
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 256);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
function disposeAll(scene: THREE.Scene): void {
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (mat)
      (Array.isArray(mat) ? mat : [mat]).forEach((x) => {
        for (const v of Object.values(x)) if (v && (v as THREE.Texture).isTexture) (v as THREE.Texture).dispose();
        x.dispose();
      });
  });
  const bg = scene.background as THREE.Texture | null;
  if (bg && bg.isTexture) bg.dispose();
}
function numSprite(T: T3, s: string, bg: string): THREE.Sprite {
  const c = mk(128, 128);
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.beginPath();
  g.arc(64, 64, 54, 0, TAU);
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = '#fff';
  g.stroke();
  txt(g, s, 64, 68, 58, '#fff', 'center', 900);
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, depthWrite: false }));
  return sp;
}

const D5: DemoMap = {
  i275: {
    kind: '3d',
    caption: '높이 지도를 계단 블록으로 쌓은 섬 판 — 옆면에 흙 · 돌 지층, 판 둘레는 물이 차 있는 유리 상자',
    make(T) {
      const scene = new T.Scene();
      scene.background = gradTex(T, '#8fd0ff', '#eaf7ff');
      const cam = new T.PerspectiveCamera(30, 1.6, 0.1, 200);
      scene.add(new T.HemisphereLight(0xfdfbff, 0x7a6a50, 1.5));
      const sun = new T.DirectionalLight(0xfff0d8, 2.4);
      sun.position.set(7, 12, 5);
      scene.add(sun);
      const N = 22;
      const S = 9.6 / N;
      const LH = 0.3;
      let levels = 7;
      let waterL = 1.6;
      let seed = 1;
      let spin = true;
      let riseStart = 0;
      let lastNew = 0;
      let now = 0;
      let hgt = new Int8Array(N * N);
      const MAXI = N * N * 13;
      const root = new T.Group();
      scene.add(root);
      const box = new T.BoxGeometry(1, 1, 1);
      const blocks = new T.InstancedMesh(box, new T.MeshStandardMaterial({ roughness: 0.82, metalness: 0, flatShading: true }), MAXI);
      blocks.instanceMatrix.setUsage(T.DynamicDrawUsage);
      root.add(blocks);
      // 판
      const half = (N * S) / 2;
      const base = new T.Mesh(new T.BoxGeometry(N * S + 0.5, 0.45, N * S + 0.5), new T.MeshStandardMaterial({ color: 0x6a4630, roughness: 0.7 }));
      base.position.y = -0.225;
      root.add(base);
      const trim = new T.Mesh(new T.BoxGeometry(N * S + 0.8, 0.18, N * S + 0.8), new T.MeshStandardMaterial({ color: 0x3e2a1d, roughness: 0.6 }));
      trim.position.y = -0.5;
      root.add(trim);
      // 물 (옆면이 보이는 유리 상자 + 일렁이는 윗면)
      const waterBox = new T.Mesh(new T.BoxGeometry(N * S, 1, N * S), new T.MeshStandardMaterial({ color: 0x2b9be0, transparent: true, opacity: 0.42, roughness: 0.2, depthWrite: false }));
      root.add(waterBox);
      const wTopG = new T.PlaneGeometry(N * S, N * S, 44, 44);
      wTopG.rotateX(-Math.PI / 2);
      const wTop = new T.Mesh(wTopG, new T.MeshStandardMaterial({ color: 0x7fd6ff, transparent: true, opacity: 0.55, roughness: 0.1, metalness: 0.1, depthWrite: false, flatShading: true }));
      root.add(wTop);
      const wBase = Float32Array.from(wTopG.attributes.position!.array as Float32Array);
      // 나무 · 집 · 구름
      const TREE_MAX = 70;
      const trees = new T.InstancedMesh(new T.ConeGeometry(0.2, 0.55, 7), new T.MeshStandardMaterial({ color: 0x2f8f46, roughness: 0.8, flatShading: true }), TREE_MAX);
      const trunks = new T.InstancedMesh(new T.CylinderGeometry(0.05, 0.06, 0.2, 6), new T.MeshStandardMaterial({ color: 0x6b4428 }), TREE_MAX);
      root.add(trees, trunks);
      const houses = new T.Group();
      root.add(houses);
      const houseBody = new T.BoxGeometry(0.34, 0.26, 0.3);
      const houseRoof = new T.ConeGeometry(0.29, 0.22, 4);
      houseRoof.rotateY(Math.PI / 4);
      const houseMats = [new T.MeshStandardMaterial({ color: 0xfaf3e6 }), new T.MeshStandardMaterial({ color: 0xe0533f, flatShading: true }), new T.MeshStandardMaterial({ color: 0x3f7fd0, flatShading: true })];
      const clouds = new T.Group();
      const cloudMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
      const cloudG = new T.IcosahedronGeometry(0.5, 1);
      for (let c = 0; c < 3; c++) {
        const cg = new T.Group();
        for (let k = 0; k < 4; k++) {
          const m = new T.Mesh(cloudG, cloudMat);
          m.position.set(k * 0.45 - 0.7, Math.sin(k * 2) * 0.12, (k % 2) * 0.2);
          m.scale.setScalar(0.7 + (k % 3) * 0.22);
          cg.add(m);
        }
        cg.position.set(-5 + c * 4.5, 4 + c * 0.4, -3 + c * 2);
        clouds.add(cg);
      }
      root.add(clouds);
      const m4 = new T.Matrix4();
      const col = new T.Color();
      const q = new T.Quaternion();
      const v = new T.Vector3();
      const sc = new T.Vector3();
      const treeSpots: [number, number][] = [];
      const genIsland = (): void => {
        hgt = new Int8Array(N * N);
        for (let z = 0; z < N; z++)
          for (let x = 0; x < N; x++) {
            const nx = (x + 0.5) / N - 0.5;
            const nz = (z + 0.5) / N - 0.5;
            const d = Math.hypot(nx, nz * 1.1);
            const val = fbm(x * 0.15, z * 0.15, seed * 9, 4) * 1.25 - d * 2.1 + 0.42;
            hgt[z * N + x] = clamp(Math.floor(val * levels * 1.15), 0, levels);
          }
        const r = rng(seed * 5);
        treeSpots.length = 0;
        for (let i = 0; i < N * N && treeSpots.length < TREE_MAX; i++) {
          const L = hgt[i]!;
          if (L > waterL + 0.5 && L <= levels - 2 && r() < 0.22) treeSpots.push([i, 0.75 + r() * 0.5]);
        }
        houses.clear();
        let placed = 0;
        for (let k = 0; k < 300 && placed < 3; k++) {
          const i = Math.floor(r() * N * N);
          const L = hgt[i]!;
          if (L <= waterL + 0.5 || L > levels - 3 || treeSpots.some(([j]) => j === i)) continue;
          const hg = new T.Group();
          const b = new T.Mesh(houseBody, houseMats[0]);
          b.position.y = 0.13;
          const rf = new T.Mesh(houseRoof, houseMats[placed % 2 ? 2 : 1]);
          rf.position.y = 0.37;
          hg.add(b, rf);
          hg.userData.cell = i;
          hg.rotation.y = r() * 3;
          houses.add(hg);
          placed++;
        }
        riseStart = now;
      };
      const topColor = (L: number): number => (L <= waterL ? 0xd8c38c : L <= waterL + 1 ? 0xe9d79e : L <= levels * 0.55 ? 0x74c24e : L <= levels * 0.72 ? 0x4f9a3e : L <= levels * 0.86 ? 0x9a948a : 0xf4f7fa);
      const layout = (): void => {
        const rk = clamp01((now - riseStart) / 1.6);
        let n = 0;
        for (let z = 0; z < N; z++)
          for (let x = 0; x < N; x++) {
            const i = z * N + x;
            const L = hgt[i]!;
            const dc = Math.hypot(x - N / 2, z - N / 2) / (N * 0.7);
            const k = easeOutBack(clamp01(rk * 1.6 - dc * 0.6));
            const shown = Math.max(0, Math.round(L * k));
            for (let y = 0; y <= shown; y++) {
              v.set((x + 0.5) * S - half, (y + 0.5) * LH, (z + 0.5) * S - half);
              sc.set(S, LH, S);
              m4.compose(v, q, sc);
              blocks.setMatrixAt(n, m4);
              if (y === shown) col.setHex(topColor(L));
              else {
                const strata = y < 1 ? 0x5e5049 : y % 2 ? 0x8a6242 : 0x7a5338;
                col.setHex(L <= waterL ? 0xc9b07a : strata);
                const ao = 0.62 + 0.38 * (y / Math.max(1, shown));
                col.multiplyScalar(ao);
              }
              blocks.setColorAt(n, col);
              n++;
            }
          }
        blocks.count = n;
        blocks.instanceMatrix.needsUpdate = true;
        if (blocks.instanceColor) blocks.instanceColor.needsUpdate = true;
        treeSpots.forEach(([i, s], t) => {
          const x = i % N;
          const z = (i / N) | 0;
          const L = hgt[i]!;
          const grow = clamp01((rk - 0.6) / 0.4) * s;
          const y = (L + 1) * LH;
          v.set((x + 0.5) * S - half, y + 0.38 * grow, (z + 0.5) * S - half);
          sc.set(grow, grow, grow);
          m4.compose(v, q, sc);
          trees.setMatrixAt(t, m4);
          v.y = y + 0.1 * grow;
          m4.compose(v, q, sc);
          trunks.setMatrixAt(t, m4);
        });
        trees.count = treeSpots.length;
        trunks.count = treeSpots.length;
        trees.instanceMatrix.needsUpdate = true;
        trunks.instanceMatrix.needsUpdate = true;
        houses.children.forEach((hg) => {
          const i = hg.userData.cell as number;
          hg.position.set(((i % N) + 0.5) * S - half, (hgt[i]! + 1) * LH, (((i / N) | 0) + 0.5) * S - half);
          hg.scale.setScalar(Math.max(0.001, clamp01((rk - 0.7) / 0.3)));
        });
      };
      function easeOutBack(k: number): number {
        const c1 = 1.4;
        return k <= 0 ? 0 : 1 + (c1 + 1) * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
      }
      genIsland();
      let laidDone = false;
      let angle = 0.6;
      return {
        scene,
        camera: cam,
        update(t, dt) {
          now = t;
          if (t - lastNew > 9 || t < lastNew) {
            lastNew = t;
            seed++;
            genIsland();
            laidDone = false;
          }
          if (!laidDone) {
            layout();
            if (t - riseStart > 1.7) laidDone = true;
          }
          const wh = (waterL + 1) * LH * 0.98;
          waterBox.scale.y = wh;
          waterBox.position.y = wh / 2;
          const pa = wTopG.attributes.position!;
          const arr = pa.array as Float32Array;
          for (let i = 0; i < arr.length; i += 3) arr[i + 1] = wh + Math.sin(wBase[i]! * 2.2 + t * 1.8) * 0.025 + Math.cos(wBase[i + 2]! * 1.9 + t * 1.4) * 0.025;
          pa.needsUpdate = true;
          wTopG.computeVertexNormals();
          clouds.children.forEach((c, i) => {
            c.position.x = ((c.position.x + dt * (0.25 + i * 0.08) + 8) % 16) - 8;
          });
          if (spin) angle += dt * 0.25;
          const R = 17;
          cam.position.set(Math.cos(angle) * R, 10.5, Math.sin(angle) * R);
          cam.lookAt(0, 0.6, 0);
        },
        controls: [
          { type: 'range', label: '계단 높이 단계 수', min: 3, max: 12, step: 1, value: 7, on: (x) => ((levels = x), genIsland(), (laidDone = false), (lastNew = now)) },
          { type: 'range', label: '물 높이', min: 0, max: 4, step: 0.5, value: 1.6, on: (x) => ((waterL = x), genIsland(), (laidDone = false), (lastNew = now)) },
          { type: 'toggle', label: '빙글빙글 돌기', value: true, on: (x) => (spin = x) },
          { type: 'button', label: '새 섬', on: () => ((seed++), genIsland(), (laidDone = false), (lastNew = now)) },
        ] as Control[],
        dispose() {
          disposeAll(scene);
        },
      };
    },
  },

  i276: {
    kind: '3d',
    caption: '섬 위 점선 길을 따라 꼬마가 폴짝폴짝 — 도착하면 자물쇠가 풀리고 깃발이 올라가요',
    make(T) {
      const scene = new T.Scene();
      scene.background = gradTex(T, '#5fb8ff', '#d6f1ff');
      const cam = new T.PerspectiveCamera(36, 1.6, 0.1, 200);
      scene.add(new T.HemisphereLight(0xffffff, 0x6f8a5a, 1.6));
      const sun = new T.DirectionalLight(0xfff2dc, 2.2);
      sun.position.set(5, 10, 6);
      scene.add(sun);
      // 바다
      const sea = new T.Mesh(new T.CircleGeometry(40, 48), new T.MeshStandardMaterial({ color: 0x2f9fe3, roughness: 0.35 }));
      sea.rotation.x = -Math.PI / 2;
      sea.position.y = 0.25;
      scene.add(sea);
      // 섬 (울퉁불퉁 둥근 모양을 밀어 올린 판)
      const shapePts: THREE.Vector2[] = [];
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * TAU;
        const r = 4.3 + Math.sin(a * 3 + 1) * 0.45 + Math.sin(a * 5 + 2) * 0.2;
        shapePts.push(new T.Vector2(Math.cos(a) * r, Math.sin(a) * r * 0.82));
      }
      const shape = new T.Shape(shapePts);
      const islG = new T.ExtrudeGeometry(shape, { depth: 0.7, bevelEnabled: true, bevelThickness: 0.22, bevelSize: 0.28, bevelSegments: 4, curveSegments: 48 });
      islG.rotateX(-Math.PI / 2);
      const island = new T.Mesh(islG, [new T.MeshStandardMaterial({ color: 0x7ccf52, roughness: 0.85 }), new T.MeshStandardMaterial({ color: 0xc89a62, roughness: 0.9 })]);
      scene.add(island);
      const TOP = 0.7 + 0.22;
      const foamShape = new T.Shape(shapePts.map((p) => p.clone().multiplyScalar(1.12)));
      foamShape.holes.push(new T.Path(shapePts.map((p) => p.clone()).reverse()));
      const foamG = new T.ShapeGeometry(foamShape, 40);
      foamG.rotateX(-Math.PI / 2);
      const foam = new T.Mesh(foamG, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false }));
      foam.position.y = 0.27;
      scene.add(foam);
      // 길 마디 (바깥에서 가운데 성까지 나선)
      const NN = 8;
      const nodes: THREE.Vector3[] = [];
      for (let i = 0; i < NN; i++) {
        const a = -2.5 + i * 0.95;
        const r = 3.2 - i * 0.4;
        nodes.push(new T.Vector3(Math.cos(a) * r, TOP + 0.02, -Math.sin(a) * r * 0.82));
      }
      const curve = new T.CatmullRomCurve3(nodes, false, 'catmullrom', 0.5);
      // 구슬 점선
      const BEADS = 70;
      const beads = new T.InstancedMesh(new T.SphereGeometry(0.06, 10, 8), new T.MeshStandardMaterial({ roughness: 0.5 }), BEADS);
      scene.add(beads);
      const beadT: number[] = [];
      const m4 = new T.Matrix4();
      const qq = new T.Quaternion();
      const one = new T.Vector3(1, 0.55, 1);
      for (let b = 0; b < BEADS; b++) {
        const u = (b + 0.5) / BEADS;
        const tt = curve.getUtoTmapping(u, 0);
        beadT.push(tt);
        m4.compose(curve.getPoint(tt), qq, one);
        beads.setMatrixAt(b, m4);
      }
      // 마디 판 · 자물쇠 · 깃발 · 번호
      const padG = new T.CylinderGeometry(0.34, 0.4, 0.14, 28);
      const pads: THREE.Mesh[] = [];
      const locks: THREE.Group[] = [];
      const flags: THREE.Group[] = [];
      const lockMat = new T.MeshStandardMaterial({ color: 0xc9cbd6, metalness: 0.6, roughness: 0.3 });
      const flagG = new T.PlaneGeometry(0.42, 0.28, 8, 2);
      flagG.translate(0.21, 0, 0);
      const flagBase = Float32Array.from(flagG.attributes.position!.array as Float32Array);
      const flagMat = new T.MeshStandardMaterial({ color: 0xff4d5e, side: T.DoubleSide, flatShading: true });
      const poleMat = new T.MeshStandardMaterial({ color: 0xf2f2f2 });
      const poleG = new T.CylinderGeometry(0.025, 0.025, 0.9, 8);
      nodes.forEach((p, i) => {
        const pad = new T.Mesh(padG, new T.MeshStandardMaterial({ color: 0x9a9aa8, roughness: 0.45 }));
        pad.position.copy(p).add(new T.Vector3(0, 0.05, 0));
        scene.add(pad);
        pads.push(pad);
        const lk = new T.Group();
        const body = new T.Mesh(new T.BoxGeometry(0.24, 0.2, 0.1), lockMat);
        body.position.y = 0.18;
        const shackle = new T.Mesh(new T.TorusGeometry(0.075, 0.025, 8, 16, Math.PI), lockMat);
        shackle.position.y = 0.28;
        shackle.name = 'shackle';
        const hole = new T.Mesh(new T.CircleGeometry(0.025, 10), new T.MeshBasicMaterial({ color: 0x333344 }));
        hole.position.set(0, 0.17, 0.051);
        lk.add(body, shackle, hole);
        lk.position.copy(pad.position).add(new T.Vector3(0, 0.05, 0));
        scene.add(lk);
        locks.push(lk);
        const fg = new T.Group();
        const pole = new T.Mesh(poleG, poleMat);
        pole.position.y = 0.45;
        const cloth = new T.Mesh(i === NN - 1 ? flagG.clone() : flagG, flagMat);
        cloth.position.y = 0.76;
        cloth.name = 'cloth';
        fg.add(pole, cloth);
        fg.position.copy(pad.position).add(new T.Vector3(0.18, 0.05, -0.1));
        scene.add(fg);
        flags.push(fg);
        const ns = numSprite(T, String(i + 1), '#2b3a67');
        ns.scale.setScalar(0.32);
        ns.position.copy(pad.position).add(new T.Vector3(-0.32, 0.5, 0.15));
        scene.add(ns);
      });
      // 성 (마지막 마디 뒤)
      const castle = new T.Group();
      const wallM = new T.MeshStandardMaterial({ color: 0xf1e6d2, roughness: 0.8 });
      const roofM = new T.MeshStandardMaterial({ color: 0x5b6ee1, roughness: 0.5, flatShading: true });
      const keep = new T.Mesh(new T.BoxGeometry(0.8, 0.7, 0.6), wallM);
      keep.position.y = 0.35;
      castle.add(keep);
      for (const [x, z] of [
        [-0.45, -0.3],
        [0.45, -0.3],
        [-0.45, 0.3],
        [0.45, 0.3],
      ] as V2[]) {
        const tw = new T.Mesh(new T.CylinderGeometry(0.16, 0.18, 1.0, 12), wallM);
        tw.position.set(x, 0.5, z);
        const rf = new T.Mesh(new T.ConeGeometry(0.22, 0.4, 12), roofM);
        rf.position.set(x, 1.2, z);
        castle.add(tw, rf);
      }
      const last = nodes[NN - 1]!;
      castle.position.set(last.x - 0.1, TOP, last.z - 0.75);
      scene.add(castle);
      // 나무 · 바위
      const treeG = new T.ConeGeometry(0.26, 0.7, 8);
      const treeM = new T.MeshStandardMaterial({ color: 0x2e8b4a, roughness: 0.8, flatShading: true });
      const trunkG = new T.CylinderGeometry(0.05, 0.06, 0.18, 6);
      const trunkM = new T.MeshStandardMaterial({ color: 0x7a4b2a });
      const rr2 = rng(4);
      let trees = 0;
      for (let k = 0; k < 400 && trees < 26; k++) {
        const x = (rr2() - 0.5) * 8;
        const z = (rr2() - 0.5) * 6.5;
        if (!inPoly([x, -z], shapePts.map((p) => [p.x * 0.88, p.y * 0.88] as V2))) continue;
        let near = false;
        for (let s = 0; s <= 40; s++) if (curve.getPoint(s / 40).distanceTo(new T.Vector3(x, TOP, z)) < 0.55) near = true;
        if (near || Math.hypot(x - castle.position.x, z - castle.position.z) < 1) continue;
        const tr = new T.Mesh(treeG, treeM);
        const sc2 = 0.7 + rr2() * 0.6;
        tr.scale.setScalar(sc2);
        tr.position.set(x, TOP + 0.45 * sc2, z);
        const tk = new T.Mesh(trunkG, trunkM);
        tk.position.set(x, TOP + 0.09, z);
        scene.add(tr, tk);
        trees++;
      }
      // 꼬마
      const hero = new T.Group();
      const skin = new T.MeshStandardMaterial({ color: 0xffd7b5, roughness: 0.7 });
      const red = new T.MeshStandardMaterial({ color: 0xe8413b, roughness: 0.55 });
      const blue = new T.MeshStandardMaterial({ color: 0x3557c9, roughness: 0.6 });
      const blk = new T.MeshBasicMaterial({ color: 0x1a1a22 });
      const bodyM = new T.Mesh(new T.CapsuleGeometry(0.13, 0.12, 4, 12), blue);
      bodyM.position.y = 0.2;
      const shirt = new T.Mesh(new T.SphereGeometry(0.135, 16, 10, 0, TAU, 0, Math.PI / 2), red);
      shirt.position.y = 0.24;
      const head = new T.Mesh(new T.SphereGeometry(0.17, 20, 14), skin);
      head.position.y = 0.48;
      const cap = new T.Mesh(new T.SphereGeometry(0.175, 20, 10, 0, TAU, 0, Math.PI / 2), red);
      cap.position.y = 0.5;
      const brim = new T.Mesh(new T.CylinderGeometry(0.12, 0.12, 0.03, 16), red);
      brim.position.set(0, 0.52, 0.13);
      const eyeG = new T.SphereGeometry(0.025, 8, 6);
      const e1 = new T.Mesh(eyeG, blk);
      e1.position.set(-0.06, 0.48, 0.155);
      const e2 = new T.Mesh(eyeG, blk);
      e2.position.set(0.06, 0.48, 0.155);
      const nose = new T.Mesh(new T.SphereGeometry(0.03, 8, 6), new T.MeshStandardMaterial({ color: 0xf5a98a }));
      nose.position.set(0, 0.44, 0.17);
      const heroBody = new T.Group();
      heroBody.add(bodyM, shirt, head, cap, brim, e1, e2, nose);
      hero.add(heroBody);
      const shadow = new T.Mesh(new T.CircleGeometry(0.16, 20), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.01;
      hero.add(shadow);
      hero.scale.setScalar(1.25);
      scene.add(hero);
      // 반짝이
      const sparkM = new T.SpriteMaterial({ color: 0xffe27a, transparent: true, blending: T.AdditiveBlending, depthWrite: false });
      const sparks: THREE.Sprite[] = [];
      for (let k = 0; k < 14; k++) {
        const s = new T.Sprite(sparkM);
        s.visible = false;
        scene.add(s);
        sparks.push(s);
      }
      // 상태
      let cleared = 1; // 0 번째는 처음부터 열림
      let at = 0;
      let phase: 'wait' | 'walk' | 'unlock' | 'done' = 'wait';
      let pt = 0;
      let follow = true;
      let goNow = false;
      const camT = new T.Vector3(0, TOP, 0);
      const camP = new T.Vector3(0, 9, 8);
      const restart = (): void => {
        cleared = 1;
        at = 0;
        phase = 'wait';
        pt = 0;
      };
      const tOf = (i: number): number => i / (NN - 1);
      const tmp = new T.Vector3();
      const col = new T.Color();
      return {
        scene,
        camera: cam,
        update(t, dt) {
          const d = Math.min(dt, 0.1);
          pt += d;
          let pos = curve.getPoint(tOf(at));
          let hop = 0;
          let face = curve.getTangent(clamp(tOf(at), 0.001, 0.999));
          if (phase === 'wait' && (pt > 1.1 || goNow)) {
            goNow = false;
            if (at >= NN - 1) {
              phase = 'done';
            } else {
              phase = 'walk';
            }
            pt = 0;
          }
          if (phase === 'walk') {
            const segLen = curve.getPoint(tOf(at)).distanceTo(curve.getPoint(tOf(at + 1))) + 0.3;
            const dur = segLen / 1.6;
            const k = clamp01(pt / dur);
            const tt = lerp(tOf(at), tOf(at + 1), ease(k));
            pos = curve.getPoint(tt);
            face = curve.getTangent(tt);
            const hops = Math.max(2, Math.round(segLen / 0.45));
            hop = Math.abs(Math.sin(k * Math.PI * hops)) * 0.22;
            if (k >= 1) {
              at++;
              pt = 0;
              phase = at >= cleared ? 'unlock' : 'wait';
            }
          }
          if (phase === 'unlock') {
            if (pt > 0.9) {
              cleared = at + 1;
              phase = 'wait';
              pt = 0;
            }
          }
          if (phase === 'done' && pt > 2.4) restart();
          hero.position.copy(pos);
          heroBody.position.y = hop;
          shadow.scale.setScalar(1 - hop * 1.5);
          if (face) hero.rotation.y = Math.atan2(face.x, face.z);
          heroBody.scale.set(1 + hop * 0.15, 1 - hop * 0.1 + (phase === 'done' ? Math.abs(Math.sin(t * 8)) * 0.1 : 0), 1 + hop * 0.15);
          // 구슬 색
          const openT = tOf(Math.max(0, cleared - 1));
          for (let b = 0; b < BEADS; b++) {
            col.setHex(beadT[b]! <= openT + 1e-4 ? 0xfff4d6 : 0x8c7a62);
            beads.setColorAt(b, col);
          }
          if (beads.instanceColor) beads.instanceColor.needsUpdate = true;
          // 판 · 자물쇠 · 깃발
          for (let i = 0; i < NN; i++) {
            const pad = pads[i]!;
            const pm = pad.material as THREE.MeshStandardMaterial;
            const isCur = i === at;
            const unlocking = phase === 'unlock' && i === at;
            const open = i < cleared || (unlocking && pt > 0.45);
            pm.color.setHex(open ? (isCur ? 0xff5a5f : 0xffc93c) : 0x9a9aa8);
            pm.emissive.setHex(isCur ? 0x551111 : 0x000000);
            pm.emissiveIntensity = isCur ? 0.5 + 0.5 * Math.sin(t * 6) : 0;
            const lk = locks[i]!;
            if (i < cleared && !unlocking) lk.visible = false;
            else {
              lk.visible = true;
              const shackle = lk.getObjectByName('shackle')!;
              if (unlocking) {
                const k = clamp01(pt / 0.9);
                shackle.position.y = 0.28 + smooth(0, 0.3, k) * 0.08;
                lk.position.y = pad.position.y + 0.05 + Math.sin(clamp01(k / 0.5) * Math.PI) * 0.35;
                lk.rotation.y = smooth(0.3, 1, k) * 8;
                lk.scale.setScalar(Math.max(0.001, 1 + 0.4 * Math.sin(clamp01(k / 0.6) * Math.PI) - smooth(0.6, 1, k)));
              } else {
                shackle.position.y = 0.28;
                lk.position.y = pad.position.y + 0.05 + Math.sin(t * 2 + i) * 0.02;
                lk.rotation.y = Math.sin(t * 1.5 + i) * 0.3;
                lk.scale.setScalar(1);
              }
            }
            const fg = flags[i]!;
            const show = i < cleared - 1 || (i < cleared && i !== at) || (unlocking && pt > 0.5) || (phase === 'done' && i === NN - 1);
            const target = show ? 1 : 0;
            fg.scale.y = lerp(fg.scale.y, target, 0.15);
            fg.visible = fg.scale.y > 0.02;
          }
          // 깃발 펄럭
          const fa = flagG.attributes.position!;
          const arr = fa.array as Float32Array;
          for (let k = 0; k < arr.length; k += 3) arr[k + 2] = Math.sin(flagBase[k]! * 9 - t * 7) * 0.05 * (flagBase[k]! / 0.42);
          fa.needsUpdate = true;
          // 반짝이
          sparks.forEach((s, k) => {
            if (phase === 'unlock' && pt > 0.45) {
              const kk = (pt - 0.45) / 0.45;
              const a = (k / sparks.length) * TAU;
              s.visible = true;
              s.position.copy(pads[at]!.position).add(tmp.set(Math.cos(a) * kk * 0.8, 0.3 + kk * 0.6 - kk * kk * 0.5, Math.sin(a) * kk * 0.8));
              s.scale.setScalar(0.12 * (1 - kk) + 0.02);
            } else s.visible = false;
          });
          foam.scale.setScalar(1 + Math.sin(t * 1.6) * 0.012);
          // 카메라
          const want = follow ? tmp.copy(hero.position) : tmp.set(0, TOP, 0);
          camT.lerp(want, 0.06);
          const off = follow ? new T.Vector3(1.2, 4.8, 4.6) : new T.Vector3(0, 8.6, 7.8);
          camP.lerp(off.add(camT), 0.06);
          cam.position.copy(camP);
          cam.lookAt(camT);
        },
        controls: [
          { type: 'button', label: '다음 단계로', on: () => (goNow = true) },
          { type: 'toggle', label: '카메라 따라가기', value: true, on: (x) => (follow = x) },
          { type: 'button', label: '처음부터', on: restart },
        ] as Control[],
        dispose() {
          disposeAll(scene);
          sparkM.dispose();
        },
      };
    },
  },

  i279: {
    kind: '3d',
    caption: '같은 높이를 이은 선(등고선)과 높이별 색 띠 — 산을 위에서 내려다보면 그대로 등고선 지도가 돼요 (물 높이 = 등고선 한 줄)',
    make(T) {
      const scene = new T.Scene();
      scene.background = gradTex(T, '#101a30', '#1d2c4a');
      const cam = new T.PerspectiveCamera(36, 1.6, 0.1, 200);
      const SEG = 150;
      const SZ = 10;
      const MAXH = 3.2;
      const hAt = (x: number, z: number): number => {
        const p1 = Math.exp(-((x - 1.4) ** 2 + (z + 0.8) ** 2) / 5.5) * 2.6;
        const p2 = Math.exp(-((x + 2.2) ** 2 + (z - 1.6) ** 2) / 3.2) * 1.8;
        const n = fbm(x * 0.32 + 10, z * 0.32 + 10, 5, 4) - 0.45;
        return clamp(p1 + p2 + n * 1.1 + 0.35, 0, MAXH);
      };
      const geo = new T.PlaneGeometry(SZ, SZ, SEG, SEG);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position!;
      for (let i = 0; i < pos.count; i++) pos.setY(i, hAt(pos.getX(i), pos.getZ(i)));
      geo.computeVertexNormals();
      // 옆면 (지층 단면)
      const skirtPos: number[] = [];
      const BASE = -0.5;
      const edge = (x0: number, z0: number, x1: number, z1: number): void => {
        for (let k = 0; k < SEG; k++) {
          const ax = lerp(x0, x1, k / SEG);
          const az = lerp(z0, z1, k / SEG);
          const bx = lerp(x0, x1, (k + 1) / SEG);
          const bz = lerp(z0, z1, (k + 1) / SEG);
          const ha = hAt(ax, az);
          const hb = hAt(bx, bz);
          skirtPos.push(ax, ha, az, ax, BASE, az, bx, hb, bz, bx, hb, bz, ax, BASE, az, bx, BASE, bz);
        }
      };
      const H = SZ / 2;
      edge(-H, H, H, H);
      edge(H, H, H, -H);
      edge(H, -H, -H, -H);
      edge(-H, -H, -H, H);
      const skirt = new T.BufferGeometry();
      skirt.setAttribute('position', new T.Float32BufferAttribute(skirtPos, 3));
      skirt.computeVertexNormals();
      const uni = {
        uInterval: { value: 0.25 },
        uBands: { value: 1 },
        uSlice: { value: 1.0 },
        uExag: { value: 1.0 },
        uMaxH: { value: MAXH },
        uLight: { value: new T.Vector3(0.5, 0.8, 0.3).normalize() },
        uSide: { value: 0 },
      };
      const vs = `
        uniform float uExag; varying float vH; varying vec3 vN; varying vec3 vW;
        void main(){
          vH = position.y;
          vec3 p = position; p.y *= uExag;
          vN = normalize(vec3(normal.x * uExag, normal.y, normal.z * uExag));
          vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`;
      const fs = `
        uniform float uInterval; uniform float uBands; uniform float uSlice; uniform float uMaxH; uniform vec3 uLight; uniform float uSide;
        varying float vH; varying vec3 vN; varying vec3 vW;
        vec3 ramp(float k){
          vec3 c0 = vec3(0.16,0.45,0.30); vec3 c1 = vec3(0.47,0.70,0.33); vec3 c2 = vec3(0.86,0.80,0.45);
          vec3 c3 = vec3(0.78,0.52,0.30); vec3 c4 = vec3(0.55,0.42,0.36); vec3 c5 = vec3(0.97,0.97,0.98);
          k = clamp(k, 0.0, 1.0) * 5.0;
          if (k < 1.0) return mix(c0, c1, k);
          if (k < 2.0) return mix(c1, c2, k - 1.0);
          if (k < 3.0) return mix(c2, c3, k - 2.0);
          if (k < 4.0) return mix(c3, c4, k - 3.0);
          return mix(c4, c5, k - 4.0);
        }
        void main(){
          float lv = vH / uInterval;
          float band = floor(lv);
          float k = uBands > 0.5 ? (band + 0.5) * uInterval / uMaxH : vH / uMaxH;
          vec3 col = ramp(k);
          if (uSide > 0.5) col *= 0.75 + 0.1 * step(0.5, fract(lv * 0.5));
          float ndl = max(dot(normalize(vN), uLight), 0.0);
          col *= 0.45 + 0.75 * ndl;
          // 등고선 (화면에서 늘 같은 굵기)
          float fw = fwidth(lv);
          float f = abs(fract(lv - 0.5) - 0.5) / max(fw, 1e-4);
          bool idx = mod(floor(lv + 0.5), 5.0) < 0.5;
          float wdt = idx ? 1.6 : 0.9;
          float line = 1.0 - smoothstep(wdt - 0.6, wdt + 0.6, f);
          if (uSide < 0.5 && vH > 0.02) col = mix(col, idx ? vec3(0.25,0.14,0.07) : vec3(0.36,0.22,0.12), line * (idx ? 0.95 : 0.7));
          // 물 높이와 만나는 선 — 빛나는 등고선 한 줄
          float sd = abs(vH - uSlice) / max(fwidth(vH), 1e-4);
          float glow = 1.0 - smoothstep(0.5, 2.5, sd);
          col = mix(col, vec3(1.0, 0.95, 0.55), glow);
          gl_FragColor = vec4(col, 1.0);
        }`;
      const mat = new T.ShaderMaterial({ uniforms: uni, vertexShader: vs, fragmentShader: fs });
      const sideUni = { ...uni, uSide: { value: 1 } };
      const sideMat = new T.ShaderMaterial({ uniforms: sideUni, vertexShader: vs, fragmentShader: fs, side: T.DoubleSide });
      const terrain = new T.Mesh(geo, mat);
      const sides = new T.Mesh(skirt, sideMat);
      const baseM = new T.Mesh(new T.BoxGeometry(SZ + 0.02, 0.2, SZ + 0.02), new T.MeshBasicMaterial({ color: 0x2a2018 }));
      baseM.position.y = BASE - 0.1;
      const grp = new T.Group();
      grp.add(terrain, sides, baseM);
      scene.add(grp);
      // 물 높이 판
      const water = new T.Mesh(new T.BoxGeometry(SZ, 1, SZ), new T.MeshBasicMaterial({ color: 0x3aa8ff, transparent: true, opacity: 0.32, depthWrite: false }));
      grp.add(water);
      let interval = 0.25;
      let bands = true;
      let topView = false;
      let autoTilt = true;
      let exag = 1;
      let moveWater = true;
      let ang = 0.5;
      let tilt = 0.6;
      return {
        scene,
        camera: cam,
        update(t, dt) {
          uni.uInterval.value = interval;
          uni.uBands.value = bands ? 1 : 0;
          uni.uExag.value = exag;
          const slice = moveWater ? 0.15 + (0.5 - 0.5 * Math.cos(t * 0.7)) * (MAXH * 0.75) : 0.6;
          uni.uSlice.value = slice;
          const wh = slice * exag - BASE;
          water.scale.y = Math.max(0.001, wh);
          water.position.y = BASE + wh / 2;
          ang += dt * 0.15;
          const want = topView ? 1.5 : autoTilt ? lerp(0.55, 1.5, smooth(0.55, 0.95, 0.5 + 0.5 * Math.sin(t * 0.5))) : 0.6;
          tilt = lerp(tilt, want, 0.05);
          const R = 15.5;
          const a = ang;
          cam.position.set(Math.cos(a) * Math.cos(tilt) * R, Math.sin(tilt) * R + 0.5, Math.sin(a) * Math.cos(tilt) * R);
          cam.up.set(0, 1, 0);
          if (tilt > 1.45) cam.up.set(-Math.cos(a), 0, -Math.sin(a));
          cam.lookAt(0, 0.6, 0);
        },
        controls: [
          { type: 'range', label: '등고선 간격', min: 0.1, max: 0.6, step: 0.05, value: 0.25, on: (x) => (interval = x) },
          { type: 'toggle', label: '높이별 색 띠 (끄면 부드럽게)', value: true, on: (x) => (bands = x) },
          { type: 'toggle', label: '위에서 보기', value: false, on: (x) => (topView = x) },
          { type: 'toggle', label: '자동으로 눕혔다 세우기', value: true, on: (x) => (autoTilt = x) },
          { type: 'range', label: '높이 과장', min: 0.4, max: 2.2, step: 0.1, value: 1, on: (x) => (exag = x) },
          { type: 'toggle', label: '물 높이 오르내리기', value: true, on: (x) => (moveWater = x) },
        ] as Control[],
        dispose() {
          disposeAll(scene);
        },
      };
    },
  },
};

export const DEMOS: DemoMap = { ...D1, ...D2, ...D3, ...D4, ...D5 };

import * as THREE from 'three';
import type { Control, DemoMap } from './types';

/**
 * 지도 생성 (절차) · 격자 · 좌표 견본 (i245 ~ i263).
 * 절차 생성 견본은 알고리즘이 한 걸음씩 돌아가는 모습을 보여 준다 — 다 지어지면 잠깐 멈췄다가 새 시드로 다시.
 * 2D 는 캔버스(정적인 층은 화면 밖 캔버스에 구워 둠), 침식 지형 · 지구본은 3D.
 */

type G = CanvasRenderingContext2D;
type V3 = [number, number, number];
type P2 = [number, number];
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
  return v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2;
};
const scaleOf = (w: number, h: number): number => Math.min(w / 280, h / 175);
const ui = (u: number): number => Math.min(u, 1.5);

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
  let n = 0;
  for (let k = 0; k < oct; k++) {
    sum += vnoise(x * f, y * f, s + k * 17) * a;
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return sum / n;
}
function mulberry(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function mkCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}
const c2 = (c: HTMLCanvasElement): G => c.getContext('2d')!;
function reset(g: G): void {
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.imageSmoothingEnabled = true;
  g.lineWidth = 1;
  g.setLineDash([]);
  g.lineCap = 'butt';
  g.lineJoin = 'miter';
  g.shadowBlur = 0;
  g.shadowColor = 'transparent';
}
function txt(g: G, s: string, x: number, y: number, size: number, color = '#fff', align: CanvasTextAlign = 'center', weight = 700): void {
  g.font = `${weight} ${size}px ${F}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(s, x, y);
}
function rr(g: G, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, Math.max(0, w), Math.max(0, h), Math.max(0, Math.min(r, w / 2, h / 2)));
}
function pill(g: G, s: string, x: number, y: number, size: number, fill: string, fg = '#fff', align: 'center' | 'left' | 'right' = 'left'): number {
  g.font = `800 ${size}px ${F}`;
  const tw = g.measureText(s).width;
  const ph = size * 1.7;
  const pw = tw + size * 1.3;
  const x0 = align === 'center' ? x - pw / 2 : align === 'right' ? x - pw : x;
  rr(g, x0, y - ph / 2, pw, ph, ph / 2);
  g.fillStyle = fill;
  g.fill();
  txt(g, s, x0 + pw / 2, y + size * 0.05, size, fg, 'center', 800);
  return pw;
}
function hexV(c: string): V3 {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mix = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgb = (c: V3, a = 1): string => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
function rampAt(stops: [number, V3][], k: number): V3 {
  if (k <= stops[0]![0]) return stops[0]![1];
  for (let i = 1; i < stops.length; i++) {
    const b = stops[i]!;
    if (k <= b[0]) {
      const a = stops[i - 1]!;
      return mix(a[1], b[1], (k - a[0]) / (b[0] - a[0]));
    }
  }
  return stops[stops.length - 1]![1];
}
/** 그림 캔버스를 화면에 꽉 차게 (비율 유지 · 넘치는 쪽은 잘림) */
function drawCover(g: G, c: HTMLCanvasElement, w: number, h: number, smoothOn = true): void {
  const s = Math.max(w / c.width, h / c.height);
  const dw = c.width * s;
  const dh = c.height * s;
  g.imageSmoothingEnabled = smoothOn;
  g.drawImage(c, (w - dw) / 2, (h - dh) / 2, dw, dh);
  g.imageSmoothingEnabled = true;
}
function vignette(g: G, w: number, h: number, a = 0.45): void {
  const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
  gr.addColorStop(0, 'rgba(0,0,0,0)');
  gr.addColorStop(1, `rgba(0,0,0,${a})`);
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
}

/* ───────────── 한 걸음씩 돌리기 ───────────── */

interface Run {
  seed: number;
  speed: number;
  holding: boolean;
  holdT: number;
  restart(seed?: number): void;
  tick(dt: number): void;
}
/** step() 이 true 를 돌려주면 다 지은 것 — hold 초 멈췄다가 새 시드로 */
function runner(o: { start(seed: number): void; step(): boolean; rate: number; hold?: number; cap?: number }): Run {
  let acc = 0;
  const r: Run = {
    seed: 0,
    speed: 1,
    holding: false,
    holdT: 0,
    restart(seed?: number) {
      r.seed = seed ?? 1 + Math.floor(Math.random() * 9998);
      r.holding = false;
      r.holdT = 0;
      acc = 0;
      o.start(r.seed);
    },
    tick(dt: number) {
      const d = Math.min(dt, 0.1);
      if (r.holding) {
        r.holdT += d;
        if (r.holdT >= (o.hold ?? 1.6)) r.restart();
        return;
      }
      acc += d * o.rate * r.speed;
      let n = Math.min(Math.floor(acc), o.cap ?? 4000);
      acc -= Math.floor(acc);
      while (n-- > 0) {
        if (o.step()) {
          r.holding = true;
          r.holdT = 0;
          break;
        }
      }
    },
  };
  return r;
}
const speedCtl = (r: Run): Control => ({ type: 'range', label: '속도', min: 0.25, max: 4, step: 0.25, value: 1, on: (v) => { r.speed = v; } });
const seedCtl = (r: Run): Control => ({ type: 'button', label: '새 시드', on: () => r.restart() });

/* ───────────── 지형 (높이 · 습도) ───────────── */

interface Terrain {
  W: number;
  H: number;
  h: Float32Array;
  raw: Float32Array;
  m: Float32Array;
  sea: number;
  lo: number;
  hi: number;
}
function makeTerrain(W: number, H: number, seed: number, land = 0.45, isl = 1, oct = 5): Terrain {
  const h = new Float32Array(W * H);
  const raw = new Float32Array(W * H);
  const m = new Float32Array(W * H);
  const sc = 3.4 / H;
  const ox = hash2(seed, 1) * 200;
  const oy = hash2(seed, 2) * 200;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const fx = x * sc + ox;
      const fy = y * sc + oy;
      const nx = (x / (W - 1)) * 2 - 1;
      const ny = (y / (H - 1)) * 2 - 1;
      const d2 = nx * nx * 0.9 + ny * ny;
      const n = fbm(fx, fy, seed, oct) + (fbm(fx * 2.3 + 9, fy * 2.3 + 3, seed + 5, 3) - 0.5) * 0.12;
      raw[i] = n;
      h[i] = n - isl * 0.62 * d2;
      m[i] = fbm(fx * 0.8 + 40, fy * 0.8 + 20, seed + 77, 3);
    }
  }
  const s = Array.from(h).sort((a, b) => a - b);
  return { W, H, h, raw, m, sea: s[Math.floor((1 - land) * (s.length - 1))]!, lo: s[0]!, hi: s[s.length - 1]! };
}
const SEA: [number, V3][] = [
  [0, [226, 246, 240]],
  [0.03, [128, 212, 214]],
  [0.11, [56, 156, 200]],
  [0.3, [30, 98, 164]],
  [0.65, [17, 58, 116]],
  [1, [10, 34, 78]],
];
const C_SAND = hexV('#ecdba5');
const C_DRY = hexV('#c6c07a');
const C_GRASS = hexV('#86c05c');
const C_LUSH = hexV('#5aa652');
const C_SHRUB = hexV('#98a860');
const C_FOREST = hexV('#3d7f45');
const C_ROCK = hexV('#8e8270');
const C_SNOW = hexV('#f3f5f7');
function biome(t: number, m: number): V3 {
  const low = mix(mix(C_DRY, C_GRASS, smooth(0.36, 0.5, m)), C_LUSH, smooth(0.56, 0.7, m));
  const mid = mix(C_SHRUB, C_FOREST, smooth(0.38, 0.5, m));
  let c = C_SAND;
  c = mix(c, low, smooth(0.025, 0.05, t));
  c = mix(c, mid, smooth(0.27, 0.34, t));
  c = mix(c, C_ROCK, smooth(0.52, 0.6, t));
  c = mix(c, C_SNOW, smooth(0.76, 0.82, t));
  return c;
}
/** 지형 한 칸 색 (언덕 그늘 · 바다 깊이 · 물거품) */
function terrainColor(T: Terrain, x: number, y: number, shade = true): V3 {
  const { W, H, h } = T;
  const i = y * W + x;
  const v = h[i]!;
  if (v < T.sea) {
    const k = (T.sea - v) / (T.sea - T.lo + 1e-6);
    let c = rampAt(SEA, k);
    const band = smooth(0.075, 0.09, k) * (1 - smooth(0.09, 0.105, k));
    c = mix(c, [190, 232, 236], band * 0.35);
    return c;
  }
  const t = (v - T.sea) / (T.hi - T.sea + 1e-6);
  let c = biome(t, T.m[i]!);
  if (shade) {
    const xl = h[y * W + Math.max(0, x - 1)]!;
    const xr = h[y * W + Math.min(W - 1, x + 1)]!;
    const yu = h[Math.max(0, y - 1) * W + x]!;
    const yd = h[Math.min(H - 1, y + 1) * W + x]!;
    const s = clamp(1 + (xr - xl + (yd - yu)) * H * 0.65, 0.68, 1.28);
    const grain = 0.97 + hash2(x, y, 3) * 0.05;
    c = [c[0] * s * grain, c[1] * s * grain, c[2] * s * grain];
  }
  return c;
}
function terrainImage(T: Terrain, shade = true): HTMLCanvasElement {
  const cv = mkCanvas(T.W, T.H);
  const g = c2(cv);
  const img = g.createImageData(T.W, T.H);
  const d = img.data;
  for (let y = 0; y < T.H; y++) {
    for (let x = 0; x < T.W; x++) {
      const c = terrainColor(T, x, y, shade);
      const o = (y * T.W + x) * 4;
      d[o] = c[0];
      d[o + 1] = c[1];
      d[o + 2] = c[2];
      d[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

/* ───────────── 보로노이 (반평면 자르기) ───────────── */

function clipHalf(poly: P2[], nx: number, ny: number, c: number): P2[] {
  const out: P2[] = [];
  const n = poly.length;
  for (let k = 0; k < n; k++) {
    const a = poly[k]!;
    const b = poly[(k + 1) % n]!;
    const da = nx * a[0] + ny * a[1] - c;
    const db = nx * b[0] + ny * b[1] - c;
    if (da <= 0) out.push(a);
    if (da <= 0 !== db <= 0) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}
function voronoi(sites: P2[], W: number, H: number): P2[][] {
  return sites.map((s, i) => {
    let poly: P2[] = [
      [0, 0],
      [W, 0],
      [W, H],
      [0, H],
    ];
    for (let j = 0; j < sites.length && poly.length > 2; j++) {
      if (j === i) continue;
      const o = sites[j]!;
      const nx = o[0] - s[0];
      const ny = o[1] - s[1];
      poly = clipHalf(poly, nx, ny, (nx * (o[0] + s[0]) + ny * (o[1] + s[1])) / 2);
    }
    return poly;
  });
}
function centroid(poly: P2[]): [number, number, number] {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let k = 0; k < poly.length; k++) {
    const p = poly[k]!;
    const q = poly[(k + 1) % poly.length]!;
    const cr = p[0] * q[1] - q[0] * p[1];
    a += cr;
    cx += (p[0] + q[0]) * cr;
    cy += (p[1] + q[1]) * cr;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-9) return [poly[0]?.[0] ?? 0, poly[0]?.[1] ?? 0, 0];
  return [cx / (6 * a), cy / (6 * a), Math.abs(a)];
}
function polyPath(g: G, poly: P2[], ox: number, oy: number, s: number): void {
  g.beginPath();
  poly.forEach((p, k) => (k ? g.lineTo(ox + p[0] * s, oy + p[1] * s) : g.moveTo(ox + p[0] * s, oy + p[1] * s)));
  g.closePath();
}
function arrow(g: G, x0: number, y0: number, x1: number, y1: number, head: number): void {
  const a = Math.atan2(y1 - y0, x1 - x0);
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x1 - Math.cos(a - 0.45) * head, y1 - Math.sin(a - 0.45) * head);
  g.lineTo(x1 - Math.cos(a + 0.45) * head, y1 - Math.sin(a + 0.45) * head);
  g.closePath();
  g.fill();
}

/* ───────────── 작은 우선순위 큐 ───────────── */

class Heap {
  private k: number[] = [];
  private v: number[] = [];
  get size(): number {
    return this.k.length;
  }
  clear(): void {
    this.k.length = 0;
    this.v.length = 0;
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
        const l = i * 2 + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && k[r]! < k[l]! ? r : l;
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

const N8: P2[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];

/* ───────────── 대충 그린 세계 지도 (경도, 위도) — 투영 · 지구본 견본이 함께 씀 ───────────── */

type LL = [number, number];
interface Land { name: string; ice?: boolean; pts: LL[] }
const pl = (name: string, flat: number[], ice = false): Land => {
  const pts: LL[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) pts.push([flat[i]!, flat[i + 1]!]);
  return { name, pts, ice };
};
const WORLD: Land[] = [
  pl('북아메리카', [-166,68,-160,71,-150,70.5,-140,69.5,-128,70,-115,68.5,-100,68,-94,71,-85,69.5,-82,66,-88,64,-93,61,-94,58.5,-88,56.5,-82,55,-80,52,-79,55,-77,59,-78,62,-72,61.5,-65,60,-61,56,-56,52.5,-59,48,-65,48.5,-64,45,-70,43.5,-70,41.7,-74,40.5,-76,38,-75.5,35.5,-78,33.8,-81,31.5,-80,27,-80.5,25.2,-82,26.5,-83,29,-85.5,30,-89,30.2,-90,29.2,-94,29.6,-97,27.8,-97.5,25,-97.5,22,-95.5,19,-91,18.6,-90.5,21,-87,21.5,-88,18,-88.5,16,-84,15.8,-83.5,12,-83.7,10.8,-81.5,9,-79.5,9.5,-77.5,8.5,-78,7.2,-80.5,7.5,-82,8.2,-85.7,10,-86,11.5,-87.6,13,-91.5,14,-94,16,-96.5,15.7,-101,17.2,-105.5,20.5,-105.2,22.5,-106.5,23.5,-109,25.5,-110,27.5,-112.5,29.8,-114.6,31.7,-114.2,30,-112,27,-110,23,-111.5,24.5,-114,28,-115.5,29.5,-116.8,32,-118.5,34,-120.6,34.6,-122,36.8,-123.8,39.5,-124.2,42,-124,46,-124.7,48.4,-123,48.5,-125.5,50,-128,51,-130,54,-133,57,-136,58.5,-139.5,59.7,-144,60,-148,60.5,-152,59,-154,57.5,-157,58.5,-158.5,56.5,-162,55.2,-164.5,54.5,-161.5,56,-157.5,58.6,-162,58.7,-164.5,60.5,-165.5,62.5,-164,64,-168,65.5]),
  pl('남아메리카', [-77,8.4,-75.5,10.6,-72,11.8,-71.3,11,-69,11.6,-64,10.7,-61,10.5,-60,8.5,-57,6,-53,5.6,-51,4,-50,1.8,-48.5,-1,-44.5,-2.5,-40,-3,-37,-4.8,-35,-7,-35,-9,-37,-12,-39,-14,-39,-17.8,-40.5,-21,-42,-23,-45,-23.8,-48.5,-26,-48.8,-28.5,-51,-31,-53,-33.8,-55,-35,-57.5,-35.2,-57,-37,-58,-38.5,-62,-39,-62.3,-41,-65,-41,-64,-42.5,-65.5,-45,-67.5,-46.5,-66,-48,-68.5,-50.5,-69.2,-52.5,-68.5,-54.5,-71.5,-54,-74.5,-52,-75.5,-48.5,-74,-44,-73.5,-40,-73.3,-37,-71.6,-33,-71.4,-29,-70.5,-25,-70.2,-20,-70.4,-18.4,-73,-16.5,-76.3,-13.5,-78,-10.5,-79.5,-7.5,-81.2,-5.5,-80.3,-3.4,-80.8,-1,-80,1,-78.8,1.8,-77.5,4,-77.4,6.5]),
  pl('아프리카', [-17,21,-16.2,24,-13.5,27.5,-10,30,-9.6,32,-6.8,34,-5.5,35.8,-2,35.1,1.5,36.6,6,37,9.8,37.3,11,35.2,10,33.8,11.6,33,15.2,32.3,19,30.3,20.3,32.5,23.5,32.5,25.2,31.6,29,30.9,32.3,31.3,34.2,31.2,34.5,28,32.6,29.8,33.5,27,35.5,23.5,37.2,21,38.6,17.8,39.6,15.5,41.7,13,43.3,12.2,44.5,10.5,49,11.3,51.2,11.8,51,10.4,49.5,6.5,47.8,4.5,45.5,2,43,-0.5,41,-2.2,39.4,-4.6,38.8,-6.5,39.6,-8.5,40.5,-10.5,40.6,-15,37.5,-17.8,35,-20,35.5,-23.8,32.8,-26,32.4,-28.6,30.5,-31,27.5,-33.5,25,-34,22.5,-33.9,20,-34.8,18.4,-34,18,-31.5,16.5,-28.5,15.2,-26.5,14.5,-22.8,13.2,-20,11.8,-17,12.2,-14,13.6,-11.5,13,-8.5,12.2,-6,11.8,-3.5,9.5,-1,9.4,1,9.8,3.2,8.8,4.4,6.5,4.3,4.5,6.3,2,6.3,-1,5,-3,5.1,-7.5,4.4,-9.5,5.4,-11.5,6.8,-13.2,8.3,-13.3,9.6,-15,11,-16.7,12.4,-17.2,14.7,-16.5,16.2,-16.2,19.5]),
  pl('유라시아', [-9.3,38.7,-8.9,42,-8.2,43.6,-4.4,43.4,-1.5,43.4,-1.2,46,-2.6,47.5,-4.5,48.5,-1.5,48.7,1.5,50.2,3.5,51.4,4.8,53,7,53.5,8.6,53.9,8.3,55.5,8.2,57,10.3,57.6,10.5,56.2,12.4,56,11,54.2,14,54,18.5,54.5,21.2,55.2,21,57,23.8,57.5,24.2,59.4,28,59.8,29.5,60.2,23,59.9,21.4,60.9,21.5,63.3,25.3,65.2,22.5,65.8,18.8,63.6,17.5,61,18.8,59.8,16.5,57.2,14.6,56.1,12.8,56.3,11.2,58.4,10.5,59.3,8,58.1,5.6,58.9,5,61.8,8,63.5,12.5,65.9,14.5,68,18.5,69.8,24,71,28.5,71,31,70,33,69.3,36.8,68.6,41,67.5,39.5,66.3,34.5,66,33,64.3,37,63.8,38,64.8,40.3,64.5,44,66.3,44,68.5,46.5,68.2,53.5,68.6,57.5,68.6,61,69.4,66,69.5,68.5,68.2,69,72.5,72.5,72.8,72.4,71,73.5,68.5,73,66.8,74.5,67.6,77,72.2,80.5,73.5,86,73.8,87,75,92,75.8,98,76.3,104,77.7,107,77,111,76.7,113.5,75.8,113,73.6,118,73.5,123.5,73,128,72.9,129.5,71.2,132,71.8,139,71.6,141,72.8,147,72.3,152,71,157,71,160,70.6,167,69.6,170,70,176,69.8,180,68.9,180,65,178,64.7,178.5,62.5,174,61.8,170.5,60,166,60,163,59.8,162,58,163.3,56.2,162,54.9,160,53.2,158.5,51.6,156.7,51,156,53,155.5,56,157,57.8,159.8,61,154,59.2,151.3,59.5,148,59.3,143,59.3,140.5,57.8,136.5,54.9,138.2,53.8,141.4,52.2,140.6,50.2,140.4,48.5,138.2,46.4,135.5,43.9,133,42.8,131,42.6,129.7,41,129.5,40,128,39,129.4,37,129.2,35.2,126.5,34.4,126.4,36.8,126.1,37.7,124.8,38,125.3,39.6,124.3,40,121.8,39,121.6,40.9,119.6,39.9,117.9,38.9,118.8,37.6,120.8,37.8,122.5,37.2,120.3,36.1,119.2,34.9,120.6,33.4,121.9,31.7,121.9,30.8,121.4,28.4,119.6,25.7,118.6,24.6,116.5,23,113.5,22.2,110.8,21.4,109.9,20.5,108.5,21.7,106.7,20.7,105.8,19,107.4,16.8,108.9,15.3,109.3,12.5,109,11.3,106.8,10.4,105,8.6,104.8,10.4,103,11,100.9,12.6,100,13.4,99.2,10.5,100.3,8.3,101,6.8,102.1,6.2,103.4,4.9,103.5,2.8,104.2,1.3,103.4,1.4,101.4,2.8,100.4,5,98.4,8,98.6,10.6,98.5,13.1,97.6,16.1,97.2,16.9,95.4,15.7,94.2,16,94.5,19,92.4,20.7,91.8,22.6,90.3,21.8,88.9,21.6,87,21.5,86.5,20.2,84.9,19.2,82.2,16.6,80.3,15.9,80,12,79.9,10.3,77.5,8,76.6,8.9,75.7,11.3,74.9,12.7,74.2,14.6,73.4,16,72.8,19.2,72.6,21.4,70.5,20.9,69.2,22.1,68.2,23.7,67.2,24.7,66.5,25.4,64.5,25.2,61.5,25.1,59.6,25.4,57.4,25.7,56.4,27.1,54.7,26.5,51.5,27.9,50.1,30.1,48.6,29.9,47.9,29,48.8,27.7,50.2,26.7,50.8,24.8,51.6,24.2,54,24.1,56,26.1,56.4,24.9,58.6,23.6,59.8,22.5,58.5,20.4,56.3,17.9,52.4,16.4,48.7,14,45,12.7,43.5,12.6,42.7,15.7,42.8,17.5,40.9,19.5,39.1,21.3,37.5,24.3,35.6,27.4,34.6,28.1,34.9,29.5,34.3,31.3,34.9,32.8,35.9,35.4,36.1,36.6,34.6,36.8,32.5,36.1,30.6,36.7,29,36.6,27.6,37,26.3,38.2,26.5,39.4,26.2,40.1,29,41,31.2,41.1,33.5,42,35.2,42,38.3,40.9,40.4,41,41.6,41.5,41.5,42.6,39.9,43.4,38,44.4,37.5,45.4,39,47,36.7,46.7,35,45.6,33.6,44.6,33.3,45.8,31.7,46.3,30.7,46.6,29.6,45.3,28.8,44.9,28.6,43.7,27.7,42.6,28,42,26.1,40.8,24,40.8,22.6,40.3,23.3,39.2,22.9,37.9,22.4,36.5,21.1,37.8,21.1,38.8,20.2,39.6,19.4,41.4,19.5,42.2,18.5,42.5,16.6,43.2,15.2,44.2,13.7,45.1,12.4,45.4,12.6,44.1,13.9,42.8,16,41.7,17.5,40.9,18.5,40.2,17,39.3,17.1,38.9,16.1,38,15.7,40,14.1,40.8,12.1,41.7,10.5,42.9,8.9,44.4,7,43.7,4.6,43.4,3.1,43.1,3.1,41.9,0.8,41,0.1,39.3,-0.3,37.6,-2.1,36.7,-4.4,36.7,-5.4,36.1,-6.5,36.9,-7.5,37.1,-8.9,37]),
  pl('그린란드', [-73,78,-66,80.5,-58,82,-45,82.8,-30,83.5,-20,82,-12,81.5,-18,77,-20,74,-22,70.5,-26,68.5,-32,68,-38,65.5,-42,61,-44,60,-48,61,-50,64,-53,66.5,-54,69.5,-56,72.5,-60,75.8,-67,76.5,-71,77.5], true),
  pl('영국', [-5.7,50,-3,50.6,1.4,51.2,1.7,52.7,0.3,53.5,-1.5,55,-2,56,-1.8,57.6,-3.3,58.6,-5,58.6,-6.2,57.5,-5.6,56,-4.9,54.8,-3.2,54.9,-3,53.4,-4.6,53.3,-4,52,-5.2,51.8,-3.5,51.4]),
  pl('아일랜드', [-6,52,-6,53.9,-7.3,55.3,-8.5,55,-10,54,-10.2,51.8,-8.5,51.6]),
  pl('아이슬란드', [-24,65.5,-22,66.4,-16,66.5,-13.6,65.2,-15,64.3,-18.7,63.4,-22.7,63.9]),
  pl('혼슈', [130,31.5,131.5,31.5,132,33.8,135,33.6,136.8,34.3,139,34.8,140.9,35.7,140.6,38,141.6,39.5,141.4,41.4,140,40.6,139.8,38.3,137.3,36.8,136,35.7,133,35.5,131,34.3]),
  pl('홋카이도', [140,41.8,141.2,41.5,143.2,42,145.4,43.3,144.3,44,141.8,45.4,141.4,43.4,140.3,43.2]),
  pl('루손', [120,18.5,122.2,18.5,122,16,124,13,123,13.5,121,14.5,120.6,16]),
  pl('민다나오', [122,7,126.5,7.3,126,9,125,9.8,123.7,8]),
  pl('보르네오', [109,1.5,111,2.5,113,3.2,115.5,5.5,117.7,6.9,119,5.3,118,4.3,117.6,1,116.6,-1.5,116,-3.8,114.5,-3.5,111.5,-3,110.2,-1.7,109,-0.4]),
  pl('수마트라', [95.3,5.6,97.5,5.2,100.4,2.3,103.8,-0.9,106,-3,105.8,-5.8,104.5,-5.9,102.3,-4,100.4,-0.8,98.8,1.6,97.1,3.4]),
  pl('자와', [105.2,-6.8,106.2,-6,108.5,-6.4,111,-6.4,114.6,-7.7,113,-8.4,110,-8.1,106.4,-7.4]),
  pl('술라웨시', [119.5,-5.5,120.5,-3,120,0,121.1,1.3,124.9,1.5,122,0.4,121,-1,123,-1,121.5,-3.5,121.4,-5]),
  pl('뉴기니', [131,-1.3,134,-0.8,138,-1.6,141,-2.6,145.7,-5,147.5,-6.3,150,-10.4,146,-8.2,143.4,-8.9,141,-9.1,138.5,-8.3,137.9,-5.4,135,-4.4,132,-2.9]),
  pl('오스트레일리아', [113.5,-22,114,-26.5,115.5,-31.5,115,-34.2,117.9,-35,121,-33.8,124,-33,126,-32.3,129,-31.6,131.5,-31.5,134,-32.7,135.8,-34.8,137.8,-33,138.2,-34.4,137.5,-35.6,139.6,-36,140.6,-38,143.5,-38.8,146.2,-39,148,-37.8,150,-37.5,150.8,-34.5,152.5,-32,153.5,-28.5,153,-25,150.8,-22.6,149,-20.5,146.3,-18.9,145.4,-16,145.3,-14.8,143.7,-14,142.5,-10.7,141.6,-12.6,141.5,-15.5,140.6,-17.4,139,-17.1,136.8,-15.9,135.5,-15,136.7,-12.2,135.5,-12,133,-11.3,130.3,-12.3,129,-14.8,127.7,-14.2,125.8,-14.5,123.6,-16.6,122.2,-18,121,-19.5,118.8,-20.3,116.7,-20.6,114.6,-21.8]),
  pl('태즈메이니아', [145,-40.8,148.2,-40.9,148,-43.2,146,-43.6,144.7,-41.5]),
  pl('뉴질랜드 북섬', [172.7,-34.4,174.5,-36,175.9,-37.5,178.5,-37.7,177,-39.3,176,-41.3,174.6,-41.3,175.2,-40,173.8,-39.2,174.6,-37.5]),
  pl('뉴질랜드 남섬', [172.8,-40.5,174.3,-41.6,173,-43.8,171,-45,169,-46.6,166.5,-46,168.3,-44,171,-42.5]),
  pl('마다가스카르', [44,-25,43.3,-22,44.4,-19.5,44.2,-16.5,46.3,-15.8,48,-14,49.3,-12,50.4,-15.5,49.4,-17.8,47.9,-23,47,-25.1,45.4,-25.6]),
  pl('스리랑카', [79.8,6.2,80.1,9.8,81.8,7.5,81.2,6.2]),
  pl('쿠바', [-85,21.8,-82,23.1,-77.5,21.8,-74.2,20.2,-77.7,19.9,-80.5,21.7,-83,22]),
  pl('히스파니올라', [-74.4,18.3,-72.8,19.9,-69.9,19.6,-68.4,18.6,-71,17.8]),
  pl('뉴펀들랜드', [-59.3,47.6,-55.4,51.5,-52.7,47.5,-55.5,46.8]),
  pl('배핀', [-61.9,66.6,-65,62,-71,62.5,-74.5,64.5,-77.5,65.4,-73,67.2,-74,68.8,-81.4,69.9,-89,70.5,-86,72.5,-80,73.8,-73,72.3,-67,69.5,-64,67.5]),
  pl('엘즈미어', [-90,76.5,-84,77,-78,77.5,-72,79,-68,80.5,-62,82.2,-72,83,-87,82,-92,80.5,-88,78.5], true),
  pl('빅토리아', [-118,69,-101,68.7,-100,71,-105,73.2,-115,73.3,-118,71]),
  pl('뱅크스', [-125,71.9,-121,74.4,-116,73,-120,71]),
  pl('스발바르', [11,78.3,16,80,22,79.5,27,78.5,20,77,16,76.6], true),
  pl('노바야제믈랴', [51.5,71.5,57,70.6,57.5,73.5,62,75.5,68.5,76.5,66,76.9,56,74.5,53,72.8]),
  pl('남극', [-180,-78,-160,-78,-150,-76,-130,-74,-110,-74,-100,-73,-80,-73,-68,-70,-62,-64,-58,-64,-60,-68,-62,-73,-60,-76,-40,-78,-30,-77,-15,-73,0,-70,20,-70,40,-69,60,-67,80,-67,95,-66,110,-66,130,-66,150,-68,165,-71,170,-72,165,-78,180,-78,180,-90,-180,-90], true),
];
/** 변을 step 도 이하로 잘게 */
function densify(pts: LL[], step: number, close = true): LL[] {
  const out: LL[] = [];
  const n = pts.length;
  for (let i = 0; i < (close ? n : n - 1); i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    const k = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / step));
    for (let j = 0; j < k; j++) out.push([lerp(a[0], b[0], j / k), lerp(a[1], b[1], j / k)]);
  }
  if (!close) out.push(pts[n - 1]!);
  return out;
}
/** 경도 · 위도 → 단위 구 위 점 (three 의 SphereGeometry 무늬 좌표와 맞춤) */
function llVec(lon: number, lat: number): V3 {
  const p = ((lon + 180) * Math.PI) / 180;
  const t = (lat * Math.PI) / 180;
  return [-Math.cos(p) * Math.cos(t), Math.sin(t), Math.sin(p) * Math.cos(t)];
}

export const DEMOS: DemoMap = {
  /* ───────────── i245 잡음 섬 지도 ───────────── */
  i245: {
    kind: '2d',
    caption: '잡음을 겹치고(①) 가장자리를 낮춰 섬으로(②) — 높이 · 습도로 바다 · 모래 · 풀 · 숲 · 바위 · 눈 색칠(③)',
    make() {
      let T: Terrain | null = null;
      let W = 0;
      let H = 0;
      let L: Float32Array[] = [];
      let fin: Uint8ClampedArray = new Uint8ClampedArray(4);
      let cv = mkCanvas(1, 1);
      let img: ImageData | null = null;
      let tk = 0;
      let steps = true;
      let isl = 1;
      let res = 150;
      const A = 110;
      const B = 55;
      const C = 75;
      const build = (seed: number): void => {
        W = res;
        H = Math.round(res * 0.625);
        T = makeTerrain(W, H, seed, 0.45, isl);
        const sc = 3.4 / H;
        const ox = hash2(seed, 1) * 200;
        const oy = hash2(seed, 2) * 200;
        L = [1, 2, 3].map((o) => {
          const a = new Float32Array(W * H);
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) a[y * W + x] = fbm(x * sc + ox, y * sc + oy, seed, o);
          return a;
        });
        L.push(T.raw);
        cv = mkCanvas(W, H);
        img = c2(cv).createImageData(W, H);
        fin = new Uint8ClampedArray(W * H * 4);
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++) {
            const c = terrainColor(T, x, y);
            const o = (y * W + x) * 4;
            fin[o] = c[0];
            fin[o + 1] = c[1];
            fin[o + 2] = c[2];
            fin[o + 3] = 255;
          }
      };
      const run = runner({
        rate: 60,
        hold: 1.8,
        start(seed) {
          build(seed);
          tk = steps ? 0 : A + B;
        },
        step() {
          tk++;
          return tk >= A + B + C;
        },
      });
      run.restart();
      let lastStage = '';
      const paint = (): void => {
        if (!T || !img) return;
        const d = img.data;
        const n = W * H;
        const gray = (v: number, o: number): void => {
          const k = clamp01((v + 0.15) / 0.95);
          const kk = k * k * (3 - 2 * k);
          d[o] = 18 + kk * 222;
          d[o + 1] = 22 + kk * 220;
          d[o + 2] = 34 + kk * 214;
          d[o + 3] = 255;
        };
        if (tk < A) {
          const f = (tk / A) * 3;
          const li = Math.min(2, Math.floor(f));
          const k = ease(f - li);
          const a = L[li]!;
          const b = L[li + 1]!;
          for (let i = 0; i < n; i++) gray(lerp(a[i]!, b[i]!, k), i * 4);
          lastStage = `① 잡음 겹치기 · 옥타브 ${li + 1 + (k > 0.5 ? 1 : 0)}`;
        } else if (tk < A + B) {
          const k = ease((tk - A) / B);
          for (let i = 0; i < n; i++) gray(lerp(T.raw[i]!, T.h[i]!, k), i * 4);
          lastStage = '② 가장자리 낮추기 → 섬 모양';
        } else {
          const p = (tk - A - B) / C;
          for (let y = 0; y < H; y++)
            for (let x = 0; x < W; x++) {
              const i = y * W + x;
              const o = i * 4;
              const front = p * 1.3 - 0.15;
              const pos = (x / W) * 0.75 + (y / H) * 0.25;
              const k = smooth(front + 0.15, front, pos);
              const gk = clamp01((T.h[i]! + 0.15) / 0.95);
              const gg = gk * gk * (3 - 2 * gk);
              const edge = Math.max(0, 1 - Math.abs(pos - front - 0.07) * 18) * 60;
              d[o] = lerp(18 + gg * 222, fin[o]!, k) + edge;
              d[o + 1] = lerp(22 + gg * 220, fin[o + 1]!, k) + edge;
              d[o + 2] = lerp(34 + gg * 214, fin[o + 2]!, k) + edge;
              d[o + 3] = 255;
            }
          lastStage = run.holding ? `완성 · 시드 ${run.seed}` : '③ 높이 · 습도 → 생물군 색칠';
        }
        c2(cv).putImageData(img, 0, 0);
      };
      const legend: [string, V3][] = [
        ['깊은 바다', SEA[4]![1]],
        ['얕은 바다', SEA[1]![1]],
        ['모래', C_SAND],
        ['풀밭', C_GRASS],
        ['숲', C_FOREST],
        ['바위', C_ROCK],
        ['눈', C_SNOW],
      ];
      return {
        draw(g, w, h, _t, dt) {
          reset(g);
          const want = w > 420 ? 320 : 150;
          if (want !== res) {
            res = want;
            run.restart(run.seed);
          }
          run.tick(dt);
          paint();
          drawCover(g, cv, w, h);
          vignette(g, w, h, 0.3);
          const u = ui(scaleOf(w, h));
          pill(g, lastStage, 8 * ui(u), 13 * ui(u), 9 * ui(u), 'rgba(10,20,40,0.72)');
          if (tk >= A + B && w > 420) {
            let x = 10 * u;
            const y = h - 14 * u;
            g.font = `700 ${8 * u}px ${F}`;
            for (const [name, c] of legend) {
              const tw = g.measureText(name).width;
              rr(g, x, y - 7 * u, tw + 20 * u, 14 * u, 7 * u);
              g.fillStyle = 'rgba(10,20,40,0.6)';
              g.fill();
              g.beginPath();
              g.arc(x + 7 * u, y, 3.5 * u, 0, TAU);
              g.fillStyle = rgb(c);
              g.fill();
              txt(g, name, x + 13 * u, y, 8 * u, '#fff', 'left');
              x += tw + 24 * u;
            }
          }
        },
        controls: [
          seedCtl(run),
          speedCtl(run),
          { type: 'toggle', label: '단계 보기 (잡음 → 섬 → 색)', value: true, on: (v) => { steps = v; run.restart(run.seed); } },
          { type: 'range', label: '섬 모양 세기', min: 0, max: 1.6, step: 0.1, value: 1, on: (v) => { isl = v; run.restart(run.seed); } },
        ],
      };
    },
  },

  /* ───────────── i246 보로노이 + 로이드 ───────────── */
  i246: {
    kind: '2d',
    caption: '씨앗마다 가장 가까운 땅 = 한 나라 — 로이드 완화: 씨앗을 제 나라의 무게중심으로 옮기면 크기가 고르게',
    make() {
      const LW = 1.6;
      const LH = 1;
      let count = 18;
      let lloyd = true;
      let arrows = true;
      let sites: P2[] = [];
      let from: P2[] = [];
      let to: P2[] = [];
      let tk = 0;
      let iter = 0;
      let firstCv = 1;
      const IT = 46;
      const ITERS = 8;
      const COLS = ['#e9c46a', '#f4a261', '#a8d5a2', '#9ecbe0', '#d9a7c7', '#f2d0a4', '#b8c99d', '#c4b5e8', '#f7b7a3', '#8fd3c1'].map(hexV);
      let all: P2[] = [];
      let colorOf: number[] = [];
      const run = runner({
        rate: 60,
        hold: 1.6,
        start(seed) {
          const r = mulberry(seed);
          all = [];
          for (let i = 0; i < count; i++) all.push([0.06 + r() * (LW - 0.12), 0.06 + r() * (LH - 0.12)]);
          // 몰린 곳이 있도록 일부는 한쪽으로
          const cx = 0.3 + r() * 1.0;
          const cy = 0.3 + r() * 0.4;
          for (let i = 0; i < count * 0.35; i++) all[i] = [clamp(cx + (r() - 0.5) * 0.45, 0.03, LW - 0.03), clamp(cy + (r() - 0.5) * 0.4, 0.03, LH - 0.03)];
          colorOf = all.map((_, i) => i % COLS.length);
          sites = [];
          from = [];
          to = [];
          tk = 0;
          iter = 0;
          firstCv = 1;
        },
        step() {
          tk++;
          const sow = count * 3;
          if (tk <= sow) {
            if (tk % 3 === 0) sites.push([...all[tk / 3 - 1]!] as P2);
            if (tk === sow) firstCv = areaCv();
            return false;
          }
          if (!lloyd) return tk > sow + 30;
          const lt = tk - sow - 1;
          const it = Math.floor(lt / IT);
          if (it >= ITERS) return true;
          const f = (lt % IT) / IT;
          if (lt % IT === 0) {
            iter = it + 1;
            from = sites.map((s) => [s[0], s[1]] as P2);
            to = voronoi(sites, LW, LH).map((p, i) => {
              const c = centroid(p);
              return c[2] > 0 ? ([c[0], c[1]] as P2) : from[i]!;
            });
          }
          if (f >= 0.35) {
            const k = ease((f - 0.35) / 0.6);
            sites = from.map((p, i) => [lerp(p[0], to[i]![0], k), lerp(p[1], to[i]![1], k)] as P2);
          }
          return false;
        },
      });
      const areaCv = (): number => {
        const ar = voronoi(sites, LW, LH).map((p) => centroid(p)[2]);
        const mean = ar.reduce((a, b) => a + b, 0) / Math.max(1, ar.length);
        const sd = Math.sqrt(ar.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, ar.length));
        return sd / (mean || 1);
      };
      run.restart();
      return {
        draw(g, w, h, t, dt) {
          reset(g);
          run.tick(dt);
          const u = ui(scaleOf(w, h));
          g.fillStyle = '#1b2a3d';
          g.fillRect(0, 0, w, h);
          const s = Math.min(w / LW, h / LH);
          const ox = (w - LW * s) / 2;
          const oy = (h - LH * s) / 2;
          // 바탕 종이
          g.fillStyle = '#efe3c6';
          g.fillRect(ox, oy, LW * s, LH * s);
          const polys = voronoi(sites, LW, LH);
          polys.forEach((p, i) => {
            if (p.length < 3) return;
            polyPath(g, p, ox, oy, s);
            const c = COLS[colorOf[i]!]!;
            const gr = g.createLinearGradient(0, oy, 0, oy + LH * s);
            gr.addColorStop(0, rgb(mix(c, [255, 255, 255], 0.15)));
            gr.addColorStop(1, rgb(mix(c, [120, 90, 60], 0.12)));
            g.fillStyle = gr;
            g.fill();
          });
          // 종이 결
          g.globalAlpha = 0.08;
          for (let k = 0; k < 40; k++) {
            const yy = oy + ((k * 37) % 100) / 100 * LH * s;
            g.fillStyle = k % 2 ? '#7a5a30' : '#fff';
            g.fillRect(ox, yy, LW * s, 1);
          }
          g.globalAlpha = 1;
          // 국경선
          g.lineJoin = 'round';
          polys.forEach((p) => {
            if (p.length < 3) return;
            polyPath(g, p, ox, oy, s);
            g.strokeStyle = 'rgba(255,250,235,0.7)';
            g.lineWidth = 3.2 * u;
            g.stroke();
          });
          polys.forEach((p) => {
            if (p.length < 3) return;
            polyPath(g, p, ox, oy, s);
            g.strokeStyle = '#6a4a2e';
            g.lineWidth = 1.3 * u;
            g.setLineDash([4 * u, 2.2 * u]);
            g.stroke();
          });
          g.setLineDash([]);
          // 무게중심 화살표
          const lt = tk - count * 3 - 1;
          const f = lt >= 0 ? (lt % IT) / IT : 0;
          if (arrows && lloyd && lt >= 0 && !run.holding && iter > 0) {
            const al = f < 0.35 ? smooth(0, 0.15, f) : 1 - smooth(0.7, 0.95, f);
            g.globalAlpha = al;
            g.strokeStyle = '#c0392b';
            g.fillStyle = '#c0392b';
            g.lineWidth = 1.6 * u;
            to.forEach((c, i) => {
              const a = from[i]!;
              const dx = (c[0] - a[0]) * s;
              const dy = (c[1] - a[1]) * s;
              if (Math.hypot(dx, dy) > 3 * u) arrow(g, ox + a[0] * s, oy + a[1] * s, ox + c[0] * s, oy + c[1] * s, 4.5 * u);
              g.beginPath();
              g.arc(ox + c[0] * s, oy + c[1] * s, 3 * u, 0, TAU);
              g.stroke();
            });
            g.globalAlpha = 1;
          }
          // 수도(씨앗)
          sites.forEach((p, i) => {
            const x = ox + p[0] * s;
            const y = oy + p[1] * s;
            const pop = i === sites.length - 1 && tk <= count * 3 ? 1 + Math.sin((tk % 3) * 1) * 0.4 : 1;
            g.beginPath();
            g.arc(x, y + 0.8 * u, 3.6 * u * pop, 0, TAU);
            g.fillStyle = 'rgba(60,30,10,0.35)';
            g.fill();
            g.beginPath();
            g.arc(x, y, 3.2 * u * pop, 0, TAU);
            g.fillStyle = '#fff';
            g.fill();
            g.lineWidth = 1.4 * u;
            g.strokeStyle = '#3a2614';
            g.stroke();
            g.beginPath();
            g.arc(x, y, 1.2 * u, 0, TAU);
            g.fillStyle = '#c0392b';
            g.fill();
          });
          // 테두리 그늘
          g.strokeStyle = '#5a3e22';
          g.lineWidth = 2 * u;
          g.strokeRect(ox + 1 * u, oy + 1 * u, LW * s - 2 * u, LH * s - 2 * u);
          vignette(g, w, h, 0.25);
          // 정보
          const cvNow = sites.length === count ? areaCv() : 1;
          const label = tk <= count * 3 ? `씨앗 뿌리기 ${sites.length}/${count}` : lloyd ? `로이드 완화 ${iter}회` : '보로노이 지역';
          pill(g, label, 8 * ui(u), 13 * ui(u), 9 * ui(u), 'rgba(58,38,20,0.85)');
          if (sites.length === count) {
            const bw = 70 * u;
            const bx = w - bw - 10 * u;
            const by = 13 * u;
            txt(g, '넓이 차이', bx - 4 * u, by, 8 * u, '#3a2614', 'right', 800);
            rr(g, bx, by - 4 * u, bw, 8 * u, 4 * u);
            g.fillStyle = 'rgba(58,38,20,0.25)';
            g.fill();
            const k = clamp01(cvNow / Math.max(0.6, firstCv));
            rr(g, bx, by - 4 * u, bw * k, 8 * u, 4 * u);
            g.fillStyle = k > 0.5 ? '#d35400' : '#27ae60';
            g.fill();
            txt(g, `±${Math.round(cvNow * 100)}%`, bx + bw / 2, by + 11 * u, 8 * u, '#3a2614', 'center', 800);
          }
          void t;
        },
        controls: [
          seedCtl(run),
          speedCtl(run),
          { type: 'toggle', label: '로이드 완화', value: true, on: (v) => { lloyd = v; run.restart(run.seed); } },
          { type: 'toggle', label: '무게중심 화살표', value: true, on: (v) => { arrows = v; } },
          { type: 'range', label: '씨앗 수', min: 6, max: 48, step: 1, value: 18, on: (v) => { count = v; run.restart(run.seed); } },
        ],
      };
    },
  },

  /* ───────────── i247 BSP 던전 ───────────── */
  i247: {
    kind: '2d',
    caption: '공간을 반씩 쪼개고(BSP) → 칸마다 방 하나 → 형제 칸끼리 복도로 이어 던전 완성',
    make() {
      const TW = 64;
      const TH = 40;
      interface Node { x: number; y: number; w: number; h: number; d: number; a?: Node; b?: Node; room?: [number, number, number, number]; split?: [number, number, number, number] }
      type Ev = { k: 'split'; n: Node } | { k: 'room'; n: Node } | { k: 'cor'; path: P2[] } | { k: 'deco' };
      let map = new Uint8Array(TW * TH); // 0 빈 곳 1 방 2 복도
      let evs: Ev[] = [];
      let ei = 0;
      let wait = 0;
      let curT = 0;
      let curDur = 1;
      let splits: Node[] = [];
      let rooms: Node[] = [];
      let deco = false;
      let showLines = true;
      let maxDepth = 4;
      let dirty = true;
      let off = mkCanvas(1, 1);
      let offW = 0;
      let offH = 0;
      let chest: P2 = [0, 0];
      let stairs: P2 = [0, 0];
      const run = runner({
        rate: 60,
        hold: 2,
        start(seed) {
          const r = mulberry(seed);
          const ri = (a: number, b: number): number => a + Math.floor(r() * (b - a + 1));
          map = new Uint8Array(TW * TH);
          evs = [];
          splits = [];
          rooms = [];
          deco = false;
          ei = 0;
          wait = 0;
          dirty = true;
          const root: Node = { x: 1, y: 1, w: TW - 2, h: TH - 2, d: 0 };
          const q: Node[] = [root];
          const leaves: Node[] = [];
          while (q.length) {
            const n = q.shift()!;
            const canV = n.w >= 16;
            const canH = n.h >= 12;
            if (n.d >= maxDepth || (!canV && !canH)) {
              leaves.push(n);
              continue;
            }
            let vert = n.w / n.h > 1.25 ? true : n.h / n.w > 1.25 ? false : r() < 0.5;
            if (vert && !canV) vert = false;
            if (!vert && !canH) vert = true;
            if (vert) {
              const sx = Math.round(n.w * (0.38 + r() * 0.24));
              n.a = { x: n.x, y: n.y, w: sx, h: n.h, d: n.d + 1 };
              n.b = { x: n.x + sx, y: n.y, w: n.w - sx, h: n.h, d: n.d + 1 };
              n.split = [n.x + sx, n.y, n.x + sx, n.y + n.h];
            } else {
              const sy = Math.round(n.h * (0.38 + r() * 0.24));
              n.a = { x: n.x, y: n.y, w: n.w, h: sy, d: n.d + 1 };
              n.b = { x: n.x, y: n.y + sy, w: n.w, h: n.h - sy, d: n.d + 1 };
              n.split = [n.x, n.y + sy, n.x + n.w, n.y + sy];
            }
            evs.push({ k: 'split', n });
            q.push(n.a, n.b);
          }
          for (const n of leaves) {
            const rw = ri(Math.max(4, Math.floor(n.w * 0.4)), Math.max(4, Math.floor(n.w * 0.78)));
            const rh = ri(Math.max(3, Math.floor(n.h * 0.4)), Math.max(3, Math.floor(n.h * 0.78)));
            const rx = n.x + ri(1, n.w - rw - 1);
            const ry = n.y + ri(1, n.h - rh - 1);
            n.room = [rx, ry, rw, rh];
            evs.push({ k: 'room', n });
          }
          const pick = (n: Node): [number, number, number, number] => {
            if (n.room) return n.room;
            return pick(r() < 0.5 ? n.a! : n.b!);
          };
          const cors: Ev[] = [];
          const walk = (n: Node): void => {
            if (!n.a || !n.b) return;
            walk(n.a);
            walk(n.b);
            const A = pick(n.a);
            const B = pick(n.b);
            const ax = ri(A[0] + 1, A[0] + A[2] - 2);
            const ay = ri(A[1] + 1, A[1] + A[3] - 2);
            const bx = ri(B[0] + 1, B[0] + B[2] - 2);
            const by = ri(B[1] + 1, B[1] + B[3] - 2);
            const path: P2[] = [];
            const hFirst = r() < 0.5;
            let x = ax;
            let y = ay;
            path.push([x, y]);
            const goX = (): void => {
              while (x !== bx) {
                x += Math.sign(bx - x);
                path.push([x, y]);
              }
            };
            const goY = (): void => {
              while (y !== by) {
                y += Math.sign(by - y);
                path.push([x, y]);
              }
            };
            if (hFirst) {
              goX();
              goY();
            } else {
              goY();
              goX();
            }
            cors.push({ k: 'cor', path });
          };
          walk(root);
          evs.push(...cors, { k: 'deco' });
          const rs = leaves.map((n) => n.room!);
          const c0 = rs[0]!;
          const c1 = rs[rs.length - 1]!;
          stairs = [c0[0] + 1, c0[1] + 1];
          chest = [c1[0] + c1[2] - 2, c1[1] + 1];
        },
        step() {
          curT++;
          if (wait-- > 0) return false;
          const e = evs[ei++];
          if (!e) return true;
          curT = 0;
          if (e.k === 'split') {
            splits.push(e.n);
            curDur = 12;
          } else if (e.k === 'room') {
            const [rx, ry, rw, rh] = e.n.room!;
            for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) map[y * TW + x] = 1;
            rooms.push(e.n);
            curDur = 7;
          } else if (e.k === 'cor') {
            for (const [x, y] of e.path) if (!map[y * TW + x]) map[y * TW + x] = 2;
            curDur = 9;
          } else {
            deco = true;
            curDur = 6;
          }
          wait = curDur;
          dirty = true;
          return false;
        },
      });
      run.restart();
      const renderOff = (w: number, h: number): void => {
        if (offW !== w || offH !== h) {
          off = mkCanvas(w, h);
          offW = w;
          offH = h;
          dirty = true;
        }
        if (!dirty) return;
        dirty = false;
        const g = c2(off);
        const ts = Math.min(w / TW, h / TH);
        const ox = (w - TW * ts) / 2;
        const oy = (h - TH * ts) / 2;
        g.fillStyle = '#16131c';
        g.fillRect(0, 0, w, h);
        g.fillStyle = 'rgba(255,255,255,0.035)';
        for (let y = 0; y < TH; y += 2) for (let x = (y / 2) % 2; x < TW; x += 2) g.fillRect(ox + x * ts + ts * 0.45, oy + y * ts + ts * 0.45, ts * 0.12, ts * 0.12);
        const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= TW || y >= TH ? 0 : map[y * TW + x]!);
        // 벽
        for (let y = 0; y < TH; y++)
          for (let x = 0; x < TW; x++) {
            if (at(x, y)) continue;
            let near = false;
            for (const [dx, dy] of N8) if (at(x + dx, y + dy)) near = true;
            if (!near) continue;
            const X = ox + x * ts;
            const Y = oy + y * ts;
            g.fillStyle = '#3c3244';
            g.fillRect(X, Y, ts + 0.5, ts + 0.5);
            g.fillStyle = '#5d4f66';
            g.fillRect(X, Y, ts + 0.5, ts * 0.42);
            if (at(x, y + 1)) {
              g.fillStyle = '#251e2b';
              g.fillRect(X, Y + ts * 0.42, ts + 0.5, ts * 0.58);
              g.fillStyle = 'rgba(255,255,255,0.08)';
              g.fillRect(X + ts * 0.1, Y + ts * 0.62, ts * 0.35, ts * 0.12);
            }
          }
        // 바닥
        for (let y = 0; y < TH; y++)
          for (let x = 0; x < TW; x++) {
            const v = at(x, y);
            if (!v) continue;
            const X = ox + x * ts;
            const Y = oy + y * ts;
            const n = hash2(x, y, 9);
            const base: V3 = v === 1 ? [190, 158, 112] : [150, 124, 92];
            const c = mix(base, [120, 96, 70], n * 0.35);
            g.fillStyle = rgb(c);
            g.fillRect(X, Y, ts + 0.5, ts + 0.5);
            g.fillStyle = 'rgba(60,40,20,0.25)';
            g.fillRect(X, Y + ts - Math.max(1, ts * 0.08), ts, Math.max(1, ts * 0.08));
            g.fillRect(X + ts - Math.max(1, ts * 0.08), Y, Math.max(1, ts * 0.08), ts);
            if (at(x, y - 1) === 0) {
              g.fillStyle = 'rgba(20,10,20,0.35)';
              g.fillRect(X, Y, ts, ts * 0.3);
            }
          }
      };
      return {
        draw(g, w, h, t, dt) {
          reset(g);
          run.tick(dt);
          renderOff(Math.round(w), Math.round(h));
          g.drawImage(off, 0, 0, w, h);
          const u = ui(scaleOf(w, h));
          const ts = Math.min(w / TW, h / TH);
          const ox = (w - TW * ts) / 2;
          const oy = (h - TH * ts) / 2;
          // 방 등불
          if (deco) {
            g.globalCompositeOperation = 'lighter';
            for (const n of rooms) {
              const [rx, ry, rw, rh] = n.room!;
              const cx = ox + (rx + rw / 2) * ts;
              const cy = oy + (ry + rh / 2) * ts;
              const R = Math.max(rw, rh) * ts * 0.75;
              const fl = 0.85 + Math.sin(t * 7 + rx) * 0.08;
              const gr = g.createRadialGradient(cx, cy, 0, cx, cy, R);
              gr.addColorStop(0, `rgba(255,170,80,${0.13 * fl})`);
              gr.addColorStop(1, 'rgba(255,120,40,0)');
              g.fillStyle = gr;
              g.fillRect(cx - R, cy - R, R * 2, R * 2);
              // 횃불
              const tx = ox + (rx + 0.5) * ts;
              const ty = oy + (ry - 0.55) * ts;
              const fr = g.createRadialGradient(tx, ty, 0, tx, ty, ts * 1.6);
              fr.addColorStop(0, `rgba(255,220,120,${0.9 * fl})`);
              fr.addColorStop(1, 'rgba(255,120,30,0)');
              g.fillStyle = fr;
              g.fillRect(tx - ts * 2, ty - ts * 2, ts * 4, ts * 4);
            }
            g.globalCompositeOperation = 'source-over';
            // 계단 · 보물 상자
            const sx = ox + stairs[0] * ts;
            const sy = oy + stairs[1] * ts;
            for (let k = 0; k < 4; k++) {
              g.fillStyle = k % 2 ? '#2a2230' : '#7a6a80';
              g.fillRect(sx, sy + k * ts * 0.4, ts * 1.6, ts * 0.4);
            }
            const cx = ox + chest[0] * ts;
            const cy = oy + chest[1] * ts;
            rr(g, cx, cy + ts * 0.2, ts * 1.5, ts * 1.1, ts * 0.2);
            g.fillStyle = '#8a4b1f';
            g.fill();
            g.fillStyle = '#f1c40f';
            g.fillRect(cx, cy + ts * 0.6, ts * 1.5, ts * 0.18);
            g.fillRect(cx + ts * 0.65, cy + ts * 0.5, ts * 0.2, ts * 0.4);
          }
          // 나누기 선
          if (showLines) {
            const fade = run.holding ? 1 - smooth(0.2, 1.2, run.holdT) * 0.75 : 1;
            g.lineCap = 'round';
            splits.forEach((n, i) => {
              const s = n.split!;
              const last = i === splits.length - 1 && rooms.length === 0;
              const k = last ? ease(curT / 12) : 1;
              const hue = 45 + n.d * 55;
              g.strokeStyle = `hsla(${hue},85%,65%,${0.85 * fade})`;
              g.lineWidth = Math.max(1, (2.6 - n.d * 0.45) * u);
              g.setLineDash([5 * u, 3 * u]);
              g.beginPath();
              const x0 = ox + s[0] * ts;
              const y0 = oy + s[1] * ts;
              const x1 = ox + s[2] * ts;
              const y1 = oy + s[3] * ts;
              g.moveTo(x0, y0);
              g.lineTo(lerp(x0, x1, k), lerp(y0, y1, k));
              g.stroke();
            });
            g.setLineDash([]);
            g.strokeStyle = `rgba(255,220,140,${0.5 * fade})`;
            g.lineWidth = 1.5 * u;
            g.strokeRect(ox + ts, oy + ts, (TW - 2) * ts, (TH - 2) * ts);
          }
          const stage = run.holding ? `던전 완성 · 방 ${rooms.length}개` : rooms.length === 0 ? `① 반씩 쪼개기 ${splits.length}번` : !deco && evs[ei - 1]?.k === 'room' ? `② 칸마다 방 ${rooms.length}개` : '③ 형제 칸끼리 복도 잇기';
          pill(g, stage, 8 * ui(u), 13 * ui(u), 9 * ui(u), 'rgba(20,14,28,0.85)', '#ffe6b0');
        },
        controls: [
          seedCtl(run),
          speedCtl(run),
          { type: 'toggle', label: '나누기 선 보기', value: true, on: (v) => { showLines = v; } },
          { type: 'range', label: '쪼개기 깊이', min: 2, max: 6, step: 1, value: 4, on: (v) => { maxDepth = v; run.restart(run.seed); } },
        ],
      };
    },
  },
  /* ───────────── i248 셀룰러 오토마타 동굴 ───────────── */
  i248: {
    kind: '2d',
    caption: '무작위 벽 → 「이웃 8칸 중 벽이 5개 이상이면 벽」을 몇 번 되풀이 → 매끈한 동굴 · 끊긴 굴은 메우기',
    make() {
      const GW = 72;
      const GH = 45;
      let grid = new Uint8Array(GW * GH);
      let removed = new Uint8Array(GW * GH);
      let iter = 0;
      let stage: 'iter' | 'fill' | 'done' = 'iter';
      let fillP = 0.47;
      let iters = 5;
      let tk = 0;
      let fadeK = 1;
      let cvA = mkCanvas(1, 1);
      let cvB = mkCanvas(1, 1);
      let floor = mkCanvas(1, 1);
      let cw = 0;
      let ch = 0;
      let dirty = true;
      let cursor = 0;
      let cursorT = 0;
      let crystals: number[] = [];
      const ST = 40;
      const at = (g: Uint8Array, x: number, y: number): number => (x < 0 || y < 0 || x >= GW || y >= GH ? 1 : g[y * GW + x]!);
      const walls8 = (g: Uint8Array, x: number, y: number): number => {
        let n = 0;
        for (const [dx, dy] of N8) n += at(g, x + dx, y + dy);
        return n;
      };
      const run = runner({
        rate: 60,
        hold: 1.8,
        start(seed) {
          const r = mulberry(seed);
          grid = new Uint8Array(GW * GH);
          for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) grid[y * GW + x] = x === 0 || y === 0 || x === GW - 1 || y === GH - 1 || r() < fillP ? 1 : 0;
          removed = new Uint8Array(GW * GH);
          iter = 0;
          stage = 'iter';
          tk = 0;
          fadeK = 1;
          dirty = true;
          crystals = [];
        },
        step() {
          tk++;
          fadeK = Math.min(1, fadeK + 1 / 14);
          if (tk % ST !== 0) return false;
          if (stage === 'iter') {
            if (iter >= iters) {
              // 가장 큰 굴만 남기기
              const lab = new Int32Array(GW * GH).fill(-1);
              let best = -1;
              let bestN = 0;
              const sizes: number[] = [];
              for (let i = 0; i < GW * GH; i++) {
                if (grid[i] || lab[i]! >= 0) continue;
                const id = sizes.length;
                let n = 0;
                const st = [i];
                lab[i] = id;
                while (st.length) {
                  const c = st.pop()!;
                  n++;
                  const x = c % GW;
                  const y = (c / GW) | 0;
                  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as P2[]) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
                    const k = ny * GW + nx;
                    if (!grid[k] && lab[k]! < 0) {
                      lab[k] = id;
                      st.push(k);
                    }
                  }
                }
                sizes.push(n);
                if (n > bestN) {
                  bestN = n;
                  best = id;
                }
              }
              for (let i = 0; i < GW * GH; i++) if (!grid[i] && lab[i] !== best) removed[i] = 1;
              stage = 'fill';
              return false;
            }
            const nx = new Uint8Array(GW * GH);
            for (let y = 0; y < GH; y++)
              for (let x = 0; x < GW; x++) {
                const n = walls8(grid, x, y);
                nx[y * GW + x] = x === 0 || y === 0 || x === GW - 1 || y === GH - 1 ? 1 : n >= 5 ? 1 : n <= 3 ? 0 : grid[y * GW + x]!;
              }
            grid = nx;
            iter++;
            fadeK = 0;
            dirty = true;
            return false;
          }
          if (stage === 'fill') {
            for (let i = 0; i < GW * GH; i++) if (removed[i]) grid[i] = 1;
            const r = mulberry(run.seed + 3);
            for (let k = 0; k < 400 && crystals.length < 14; k++) {
              const i = Math.floor(r() * GW * GH);
              const x = i % GW;
              const y = (i / GW) | 0;
              if (!grid[i] && at(grid, x, y - 1)) crystals.push(i);
            }
            removed = new Uint8Array(GW * GH);
            stage = 'done';
            fadeK = 0;
            dirty = true;
            return false;
          }
          return true;
        },
      });
      run.restart();
      const renderCave = (cv: HTMLCanvasElement, w: number, h: number): void => {
        const g = c2(cv);
        g.clearRect(0, 0, w, h);
        g.drawImage(floor, 0, 0);
        const ts = Math.max(w / GW, h / GH);
        const ox = (w - GW * ts) / 2;
        const oy = (h - GH * ts) / 2;
        // 칸 지도를 부드럽게 키우고 문턱으로 잘라 매끈한 바위 모양(마스크)을 만든다
        const small = mkCanvas(GW, GH);
        const sg = c2(small);
        const sd = sg.createImageData(GW, GH);
        for (let i = 0; i < GW * GH; i++) {
          const v = grid[i] ? 255 : 0;
          sd.data[i * 4] = v;
          sd.data[i * 4 + 1] = v;
          sd.data[i * 4 + 2] = v;
          sd.data[i * 4 + 3] = 255;
        }
        sg.putImageData(sd, 0, 0);
        const mask = mkCanvas(w, h);
        const mg = c2(mask);
        mg.filter = `blur(${Math.max(1, ts * 0.45)}px)`;
        mg.drawImage(small, ox, oy, GW * ts, GH * ts);
        mg.filter = 'none';
        const md = mg.getImageData(0, 0, w, h);
        const a = md.data;
        for (let o = 0; o < a.length; o += 4) {
          const v = a[o]! / 255;
          const k = clamp01((v - 0.44) / 0.08);
          a[o] = 255;
          a[o + 1] = 255;
          a[o + 2] = 255;
          a[o + 3] = k * 255;
        }
        mg.putImageData(md, 0, 0);
        const layer = (col: string, dx: number, dy: number, tex = false): void => {
          const L = mkCanvas(w, h);
          const lg = c2(L);
          lg.drawImage(mask, 0, 0);
          lg.globalCompositeOperation = 'source-in';
          lg.fillStyle = col;
          lg.fillRect(0, 0, w, h);
          if (tex) {
            lg.globalCompositeOperation = 'source-atop';
            const r = mulberry(11);
            for (let k = 0; k < (w * h) / 90; k++) {
              lg.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
              const s = 1 + r() * ts * 0.5;
              lg.fillRect(r() * w, r() * h, s, s);
            }
          }
          g.drawImage(L, dx, dy);
        };
        layer('rgba(30,14,10,0.6)', ts * 0.12, ts * 0.38);
        layer('#8a7184', 0, -ts * 0.16);
        layer('#2e2436', 0, ts * 0.05, true);
      };
      return {
        draw(g, w, h, t, dt) {
          reset(g);
          run.tick(dt);
          const W = Math.round(w);
          const H = Math.round(h);
          if (W !== cw || H !== ch) {
            cw = W;
            ch = H;
            cvA = mkCanvas(W, H);
            cvB = mkCanvas(W, H);
            floor = mkCanvas(W, H);
            const fg = c2(floor);
            const gr = fg.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.6);
            gr.addColorStop(0, '#d2a674');
            gr.addColorStop(0.6, '#9a6f4c');
            gr.addColorStop(1, '#5a3d2e');
            fg.fillStyle = gr;
            fg.fillRect(0, 0, W, H);
            const r = mulberry(5);
            for (let k = 0; k < (W * H) / 60; k++) {
              fg.fillStyle = r() < 0.5 ? 'rgba(255,230,190,0.12)' : 'rgba(60,30,20,0.14)';
              const s = 0.6 + r() * 2.2;
              fg.fillRect(r() * W, r() * H, s, s);
            }
            dirty = true;
          }
          if (dirty) {
            dirty = false;
            const tmp = cvA;
            cvA = cvB;
            cvB = tmp;
            renderCave(cvB, W, H);
          }
          g.drawImage(cvA, 0, 0, w, h);
          g.globalAlpha = ease(fadeK);
          g.drawImage(cvB, 0, 0, w, h);
          g.globalAlpha = 1;
          const u = ui(scaleOf(w, h));
          const ts = Math.max(w / GW, h / GH);
          const ox = (w - GW * ts) / 2;
          const oy = (h - GH * ts) / 2;
          // 메울 작은 굴
          if (stage === 'fill') {
            g.fillStyle = `rgba(255,70,60,${0.45 + Math.sin(t * 12) * 0.25})`;
            for (let i = 0; i < GW * GH; i++) if (removed[i]) g.fillRect(ox + (i % GW) * ts, oy + ((i / GW) | 0) * ts, ts + 0.5, ts + 0.5);
          }
          // 수정
          if (stage === 'done') {
            g.globalCompositeOperation = 'lighter';
            for (const i of crystals) {
              const x = ox + ((i % GW) + 0.5) * ts;
              const y = oy + (((i / GW) | 0) + 0.3) * ts;
              const R = ts * (2.2 + Math.sin(t * 3 + i) * 0.5);
              const gr = g.createRadialGradient(x, y, 0, x, y, R);
              gr.addColorStop(0, 'rgba(140,240,255,0.9)');
              gr.addColorStop(1, 'rgba(60,120,255,0)');
              g.fillStyle = gr;
              g.fillRect(x - R, y - R, R * 2, R * 2);
            }
            g.globalCompositeOperation = 'source-over';
          }
          vignette(g, w, h, 0.45);
          // 규칙 카드: 칸 하나의 이웃 세기
          cursorT -= dt;
          if (cursorT <= 0) {
            cursorT = 0.45;
            const r = Math.random;
            for (let k = 0; k < 40; k++) {
              const x = 2 + Math.floor(r() * (GW - 4));
              const y = 2 + Math.floor(r() * (GH - 4));
              const n = walls8(grid, x, y);
              if (n >= 2 && n <= 6) {
                cursor = y * GW + x;
                break;
              }
            }
          }
          if (stage === 'iter') {
            const cx = cursor % GW;
            const cy = (cursor / GW) | 0;
            g.strokeStyle = '#ffe14d';
            g.lineWidth = 1.5 * u;
            g.strokeRect(ox + (cx - 1) * ts, oy + (cy - 1) * ts, ts * 3, ts * 3);
            const cs = 7 * u;
            const bx = w - cs * 3 - 44 * u;
            const by = 8 * u;
            rr(g, bx - 5 * u, by - 4 * u, cs * 3 + 52 * u, cs * 3 + 8 * u, 5 * u);
            g.fillStyle = 'rgba(20,12,24,0.82)';
            g.fill();
            for (let j = -1; j <= 1; j++)
              for (let i = -1; i <= 1; i++) {
                const v = at(grid, cx + i, cy + j);
                g.fillStyle = i === 0 && j === 0 ? '#ffe14d' : v ? '#6b5672' : '#d8b080';
                g.fillRect(bx + (i + 1) * cs + 0.5, by + (j + 1) * cs + 0.5, cs - 1, cs - 1);
              }
            const n = walls8(grid, cx, cy);
            const res = n >= 5 ? '벽' : n <= 3 ? '길' : '그대로';
            txt(g, `벽 ${n}`, bx + cs * 3 + 6 * u, by + cs * 0.9, 8 * u, '#fff', 'left', 800);
            txt(g, `→ ${res}`, bx + cs * 3 + 6 * u, by + cs * 2.2, 8 * u, n >= 5 ? '#c9a8ff' : '#ffd08a', 'left', 800);
          }
          const label = stage === 'iter' ? (iter === 0 ? `무작위 벽 ${Math.round(fillP * 100)}%` : `규칙 ${iter}번 적용`) : stage === 'fill' ? '끊긴 작은 굴 메우기' : '동굴 완성';
          pill(g, label, 8 * ui(u), 13 * ui(u), 9 * ui(u), 'rgba(20,12,24,0.82)', '#ffe6c0');
        },
        controls: [
          seedCtl(run),
          speedCtl(run),
          { type: 'range', label: '처음 벽 비율', min: 0.38, max: 0.56, step: 0.01, value: 0.47, on: (v) => { fillP = v; run.restart(run.seed); } },
          { type: 'range', label: '규칙 되풀이', min: 1, max: 8, step: 1, value: 5, on: (v) => { iters = v; run.restart(run.seed); } },
        ],
      };
    },
  },

  /* ───────────── i249 파동 함수 붕괴 (WFC) ───────────── */
  i249: {
    kind: '2d',
    caption: '이웃 규칙(바다–모래–풀–숲–산은 한 단계씩만 붙음)을 지키며 가능성이 가장 적은 칸부터 확정 — 해안 · 숲이 저절로 이어져요',
    make() {
      const GW = 30;
      const GH = 19;
      const NT = 6;
      const WT = [1.7, 2.1, 1.4, 3, 2.3, 1.1];
      let lo = new Int8Array(GW * GH);
      let hi = new Int8Array(GW * GH);
      let val = new Int8Array(GW * GH);
      let flash = new Float32Array(GW * GH);
      let left = 0;
      let last = -1;
      let showOpts = true;
      let coherence = 2.5;
      let rnd = mulberry(1);
      let tiles = mkCanvas(1, 1);
      let tw = 0;
      let th = 0;
      let pending: number[] = [];
      let clock = 0;
      const NAMES = ['깊은 바다', '바다', '모래', '풀밭', '숲', '산'];
      const COL = ['#1f4f8c', '#3a88c8', '#ecd59a', '#7cc35a', '#3f8f48', '#9a907e'];
      const run = runner({
        rate: 140,
        hold: 1.8,
        start(seed) {
          rnd = mulberry(seed);
          lo = new Int8Array(GW * GH).fill(0);
          hi = new Int8Array(GW * GH).fill(NT - 1);
          val = new Int8Array(GW * GH).fill(-1);
          flash = new Float32Array(GW * GH).fill(-9);
          left = GW * GH;
          last = -1;
          pending = [];
          tw = 0;
        },
        step() {
          if (left <= 0) return true;
          // 가장 불확실하지 않은(가능성이 적은) 칸
          let best = -1;
          let bs = 1e9;
          for (let i = 0; i < GW * GH; i++) {
            if (val[i]! >= 0) continue;
            const s = hi[i]! - lo[i]! + hash2(i, run.seed, 11) * 0.6;
            if (s < bs) {
              bs = s;
              best = i;
            }
          }
          if (best < 0) return true;
          const x0 = best % GW;
          const y0 = (best / GW) | 0;
          const wts: number[] = [];
          let sum = 0;
          for (let v = lo[best]!; v <= hi[best]!; v++) {
            let w = WT[v]!;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as P2[]) {
              const nx = x0 + dx;
              const ny = y0 + dy;
              if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
              if (val[ny * GW + nx] === v) w *= coherence;
            }
            wts.push(w);
            sum += w;
          }
          let pick = rnd() * sum;
          let v = lo[best]!;
          for (const w of wts) {
            if (pick < w) break;
            pick -= w;
            v++;
          }
          v = Math.min(v, hi[best]!);
          const st = [best];
          lo[best] = v;
          hi[best] = v;
          // 퍼뜨리기
          while (st.length) {
            const c = st.pop()!;
            const cx = c % GW;
            const cy = (c / GW) | 0;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as P2[]) {
              const nx = cx + dx;
              const ny = cy + dy;
              if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
              const n = ny * GW + nx;
              const nl = Math.max(lo[n]!, lo[c]! - 1);
              const nh = Math.min(hi[n]!, hi[c]! + 1);
              if (nl !== lo[n] || nh !== hi[n]) {
                lo[n] = nl;
                hi[n] = nh;
                flash[n] = clock;
                st.push(n);
              }
            }
          }
          // 확정된 칸
          for (let i = 0; i < GW * GH; i++)
            if (val[i]! < 0 && lo[i] === hi[i]) {
              val[i] = lo[i]!;
              left--;
              pending.push(i);
            }
          last = best;
          return false;
        },
      });
      run.restart();
      const drawTile = (g: G, v: number, X: number, Y: number, s: number, i: number): void => {
        const n = hash2(i, 7, 3);
        g.fillStyle = COL[v]!;
        g.fillRect(X, Y, s + 0.6, s + 0.6);
        if (v <= 1) {
          g.strokeStyle = v === 0 ? 'rgba(120,180,240,0.45)' : 'rgba(200,235,255,0.55)';
          g.lineWidth = Math.max(1, s * 0.08);
          g.beginPath();
          const yy = Y + s * (0.35 + n * 0.3);
          g.moveTo(X + s * 0.2, yy);
          g.quadraticCurveTo(X + s * 0.35, yy - s * 0.15, X + s * 0.5, yy);
          g.quadraticCurveTo(X + s * 0.65, yy + s * 0.15, X + s * 0.8, yy);
          g.stroke();
        } else if (v === 2) {
          g.fillStyle = 'rgba(170,130,70,0.45)';
          for (let k = 0; k < 3; k++) g.fillRect(X + s * hash2(i, k, 1) * 0.8, Y + s * hash2(i, k, 2) * 0.8, s * 0.1, s * 0.1);
        } else if (v === 3) {
          g.fillStyle = 'rgba(60,130,50,0.7)';
          const tx = X + s * (0.2 + n * 0.5);
          const ty = Y + s * 0.6;
          g.beginPath();
          g.moveTo(tx, ty);
          g.lineTo(tx + s * 0.08, ty - s * 0.25);
          g.lineTo(tx + s * 0.16, ty);
          g.lineTo(tx + s * 0.24, ty - s * 0.2);
          g.lineTo(tx + s * 0.3, ty);
          g.fill();
        } else if (v === 4) {
          g.fillStyle = 'rgba(20,50,20,0.35)';
          g.beginPath();
          g.ellipse(X + s * 0.55, Y + s * 0.78, s * 0.36, s * 0.14, 0, 0, TAU);
          g.fill();
          g.fillStyle = '#2a6a33';
          g.beginPath();
          g.arc(X + s * 0.5, Y + s * 0.48, s * 0.36, 0, TAU);
          g.fill();
          g.fillStyle = '#58a65a';
          g.beginPath();
          g.arc(X + s * 0.42, Y + s * 0.4, s * 0.17, 0, TAU);
          g.fill();
        } else {
          g.fillStyle = '#7a705f';
          g.beginPath();
          g.moveTo(X + s * 0.05, Y + s * 0.92);
          g.lineTo(X + s * 0.5, Y + s * 0.1);
          g.lineTo(X + s * 0.95, Y + s * 0.92);
          g.fill();
          g.fillStyle = '#b6ab95';
          g.beginPath();
          g.moveTo(X + s * 0.5, Y + s * 0.1);
          g.lineTo(X + s * 0.95, Y + s * 0.92);
          g.lineTo(X + s * 0.6, Y + s * 0.92);
          g.fill();
          g.fillStyle = '#fafafa';
          g.beginPath();
          g.moveTo(X + s * 0.5, Y + s * 0.1);
          g.lineTo(X + s * 0.66, Y + s * 0.38);
          g.lineTo(X + s * 0.5, Y + s * 0.32);
          g.lineTo(X + s * 0.36, Y + s * 0.36);
          g.fill();
        }
      };
      return {
        draw(g, w, h, _t, dt) {
          reset(g);
          clock += dt;
          run.tick(dt);
          const u = ui(scaleOf(w, h));
          const s = Math.min((w - 4) / GW, (h - 4) / GH);
          const ox = (w - GW * s) / 2;
          const oy = (h - GH * s) / 2;
          const W = Math.round(w);
          const H = Math.round(h);
          if (tw !== W || th !== H) {
            tw = W;
            th = H;
            tiles = mkCanvas(W, H);
            pending = [];
            for (let i = 0; i < GW * GH; i++) if (val[i]! >= 0) pending.push(i);
          }
          const tg = c2(tiles);
          if (left === GW * GH && pending.length === 0) tg.clearRect(0, 0, W, H);
          for (const i of pending) drawTile(tg, val[i]!, ox + (i % GW) * s, oy + ((i / GW) | 0) * s, s, i);
          pending = [];
          g.fillStyle = '#0d1220';
          g.fillRect(0, 0, w, h);
          g.drawImage(tiles, 0, 0, w, h);
          // 아직 안 정해진 칸
          for (let i = 0; i < GW * GH; i++) {
            if (val[i]! >= 0) continue;
            const X = ox + (i % GW) * s;
            const Y = oy + ((i / GW) | 0) * s;
            g.fillStyle = '#18203a';
            g.fillRect(X + 0.5, Y + 0.5, s - 1, s - 1);
            if (showOpts) {
              const nOpt = hi[i]! - lo[i]! + 1;
              const bw = (s - 3) / NT;
              for (let v = lo[i]!; v <= hi[i]!; v++) {
                g.fillStyle = COL[v]!;
                g.globalAlpha = nOpt === NT ? 0.28 : 0.85;
                g.fillRect(X + 1.5 + v * bw, Y + s * 0.3, Math.max(1, bw - 0.4), s * 0.4);
              }
              g.globalAlpha = 1;
            }
            const fk = 1 - (clock - flash[i]!) / 0.35;
            if (fk > 0) {
              g.strokeStyle = `rgba(120,230,255,${fk * 0.9})`;
              g.lineWidth = 1;
              g.strokeRect(X + 1, Y + 1, s - 2, s - 2);
            }
          }
          if (last >= 0 && !run.holding) {
            g.strokeStyle = '#fff';
            g.lineWidth = 2 * u;
            g.strokeRect(ox + (last % GW) * s, oy + ((last / GW) | 0) * s, s, s);
          }
          const done = GW * GH - left;
          pill(g, run.holding ? '모든 칸 확정 — 규칙을 어긴 이음 없음' : `확정 ${done} / ${GW * GH} 칸`, 8 * ui(u), 13 * ui(u), 9 * ui(u), 'rgba(10,14,30,0.85)');
          if (w > 420) {
            let x = 10 * u;
            const y = h - 13 * u;
            for (let v = 0; v < NT; v++) {
              g.font = `700 ${8 * u}px ${F}`;
              const tw2 = g.measureText(NAMES[v]!).width;
              rr(g, x, y - 7 * u, tw2 + 22 * u, 14 * u, 7 * u);
              g.fillStyle = 'rgba(10,14,30,0.75)';
              g.fill();
              g.fillStyle = COL[v]!;
              g.fillRect(x + 4 * u, y - 4 * u, 8 * u, 8 * u);
              txt(g, NAMES[v]!, x + 15 * u, y, 8 * u, '#fff', 'left');
              x += tw2 + 20 * u;
              if (v < NT - 1) txt(g, '↔', x + 2 * u, y, 8 * u, '#9fb4d8');
              x += 8 * u;
            }
          }
        },
        controls: [
          seedCtl(run),
          speedCtl(run),
          { type: 'toggle', label: '남은 가능성 보기', value: true, on: (v) => { showOpts = v; } },
          { type: 'range', label: '같은 타일 끼리 뭉치기', min: 1, max: 10, step: 0.5, value: 2.5, on: (v) => { coherence = v; run.restart(run.seed); } },
        ],
      };
    },
  },

  /* ───────────── i250 미로 세 가지 ───────────── */
  i250: {
    kind: '2d',
    caption: '같은 크기 미로를 깊이 우선 · 크루스칼 · 윌슨으로 — 다 지으면 출발점에서 거리 색: 긴 복도 vs 짧은 갈래',
    make() {
      let C = 10;
      let R = 14;
      let distOn = true;
      interface Mz {
        pass: Uint8Array;
        inM: Uint8Array;
        done: boolean;
        stack: number[];
        edges: [number, number][];
        par: Int32Array;
        walk: number[] | null;
        head: number;
        dist: Int32Array;
        maxD: number;
        dead: number;
        sol: number[];
      }
      let mz: Mz[] = [];
      let rnd = mulberry(1);
      let flood = 0;
      const BIT = (a: number, b: number): [number, number] => {
        const d = b - a;
        if (d === 1) return [1, 4];
        if (d === -1) return [4, 1];
        if (d === C) return [2, 8];
        return [8, 2];
      };
      const carve = (m: Mz, a: number, b: number): void => {
        const [ba, bb] = BIT(a, b);
        m.pass[a] = m.pass[a]! | ba;
        m.pass[b] = m.pass[b]! | bb;
      };
      const nbrs = (i: number): number[] => {
        const x = i % C;
        const y = (i / C) | 0;
        const o: number[] = [];
        if (x > 0) o.push(i - 1);
        if (x < C - 1) o.push(i + 1);
        if (y > 0) o.push(i - C);
        if (y < R - 1) o.push(i + C);
        return o;
      };
      const find = (p: Int32Array, i: number): number => {
        while (p[i] !== i) {
          p[i] = p[p[i]!]!;
          i = p[i]!;
        }
        return i;
      };
      const newMz = (): Mz => ({ pass: new Uint8Array(C * R), inM: new Uint8Array(C * R), done: false, stack: [], edges: [], par: new Int32Array(C * R), walk: null, head: -1, dist: new Int32Array(C * R).fill(-1), maxD: 1, dead: 0, sol: [] });
      const finish = (m: Mz): void => {
        m.done = true;
        const q = [0];
        m.dist[0] = 0;
        const from = new Int32Array(C * R).fill(-1);
        while (q.length) {
          const c = q.shift()!;
          for (const n of nbrs(c)) {
            if (m.dist[n]! >= 0) continue;
            if (!(m.pass[c]! & BIT(c, n)[0])) continue;
            m.dist[n] = m.dist[c]! + 1;
            from[n] = c;
            q.push(n);
          }
        }
        m.maxD = Math.max(1, ...Array.from(m.dist));
        m.dead = 0;
        for (let i = 0; i < C * R; i++) {
          const p = m.pass[i]!;
          if (p === 1 || p === 2 || p === 4 || p === 8) m.dead++;
        }
        m.sol = [];
        for (let c = C * R - 1; c >= 0; c = from[c]!) m.sol.push(c);
      };
      const stepDfs = (m: Mz): void => {
        if (!m.stack.length) return finish(m);
        const c = m.stack[m.stack.length - 1]!;
        const opts = nbrs(c).filter((n) => !m.inM[n]);
        if (!opts.length) {
          m.stack.pop();
          m.head = m.stack[m.stack.length - 1] ?? -1;
          return;
        }
        const n = opts[Math.floor(rnd() * opts.length)]!;
        carve(m, c, n);
        m.inM[n] = 1;
        m.stack.push(n);
        m.head = n;
      };
      const stepKruskal = (m: Mz): void => {
        while (m.edges.length) {
          const [a, b] = m.edges.pop()!;
          const ra = find(m.par, a);
          const rb = find(m.par, b);
          if (ra === rb) continue;
          m.par[ra] = rb;
          carve(m, a, b);
          m.inM[a] = 1;
          m.inM[b] = 1;
          m.head = b;
          return;
        }
        finish(m);
      };
      const stepWilson = (m: Mz): void => {
        if (!m.walk) {
          const rest: number[] = [];
          for (let i = 0; i < C * R; i++) if (!m.inM[i]) rest.push(i);
          if (!rest.length) return finish(m);
          m.walk = [rest[Math.floor(rnd() * rest.length)]!];
          return;
        }
        const c = m.walk[m.walk.length - 1]!;
        const ns = nbrs(c);
        const n = ns[Math.floor(rnd() * ns.length)]!;
        m.head = n;
        if (m.inM[n]) {
          m.walk.push(n);
          for (let k = 0; k < m.walk.length - 1; k++) {
            carve(m, m.walk[k]!, m.walk[k + 1]!);
            m.inM[m.walk[k]!] = 1;
          }
          m.walk = null;
          return;
        }
        const at = m.walk.indexOf(n);
        if (at >= 0) m.walk.length = at + 1;
        else m.walk.push(n);
      };
      const run = runner({
        rate: 75,
        hold: 2,
        start(seed) {
          rnd = mulberry(seed);
          mz = [newMz(), newMz(), newMz()];
          const d = mz[0]!;
          d.inM[0] = 1;
          d.stack = [0];
          const k = mz[1]!;
          k.inM.fill(1);
          for (let i = 0; i < C * R; i++) {
            k.par[i] = i;
            if (i % C < C - 1) k.edges.push([i, i + 1]);
            if (i + C < C * R) k.edges.push([i, i + C]);
          }
          for (let i = k.edges.length - 1; i > 0; i--) {
            const j = Math.floor(rnd() * (i + 1));
            const tmp = k.edges[i]!;
            k.edges[i] = k.edges[j]!;
            k.edges[j] = tmp;
          }
          mz[2]!.inM[Math.floor(rnd() * C * R)] = 1;
          flood = 0;
        },
        step() {
          const [a, b, c] = mz as [Mz, Mz, Mz];
          if (!a.done) stepDfs(a);
          if (!b.done) stepKruskal(b);
          if (!c.done) for (let k = 0; k < 4 && !c.done; k++) stepWilson(c);
          if (a.done && b.done && c.done) {
            flood += 1 / 70;
            return flood >= 1.25;
          }
          return false;
        },
      });
      run.restart();
      const NAMES = ['깊이 우선', '크루스칼', '윌슨'];
      const NOTE = ['긴 복도 · 갈래 적음', '짧은 갈래 많음', '고르게 무작위'];
      const distCol = (k: number): string => {
        const c = rampAt(
          [
            [0, [80, 220, 200]],
            [0.35, [90, 140, 255]],
            [0.7, [190, 100, 240]],
            [1, [255, 150, 80]],
          ],
          k,
        );
        return rgb(c);
      };
      return {
        draw(g, w, h, t, dt) {
          reset(g);
          run.tick(dt);
          const u = ui(scaleOf(w, h));
          g.fillStyle = '#0c111e';
          g.fillRect(0, 0, w, h);
          const pw = w / 3;
          const top = 20 * u;
          const bot = 16 * u;
          mz.forEach((m, p) => {
            const cs = Math.min((pw - 8 * u) / C, (h - top - bot) / R);
            const ox = p * pw + (pw - cs * C) / 2;
            const oy = top + (h - top - bot - cs * R) / 2;
            const wt = Math.max(1, cs * 0.24);
            rr(g, ox - wt, oy - wt, cs * C + wt, cs * R + wt, 3 * u);
            g.fillStyle = '#1a2236';
            g.fill();
            const walkSet = m.walk ? new Set(m.walk) : null;
            const stackSet = p === 0 && !m.done ? new Set(m.stack) : null;
            for (let i = 0; i < C * R; i++) {
              const inm = m.inM[i] || (walkSet?.has(i) ?? false);
              if (!inm) continue;
              const x = ox + (i % C) * cs;
              const y = oy + ((i / C) | 0) * cs;
              let col = '#dfe8f7';
              if (m.done && distOn && flood > 0) {
                const d = m.dist[i]! / m.maxD;
                col = d <= flood ? distCol(d) : '#dfe8f7';
              } else if (p === 1 && !m.done) {
                const r0 = find(m.par, i);
                col = `hsl(${(hash2(r0, 3) * 360) | 0},65%,72%)`;
              } else if (stackSet?.has(i)) col = '#8fe3c8';
              if (walkSet?.has(i) && !m.inM[i]) col = '#ff7eb6';
              g.fillStyle = col;
              const pa = m.pass[i]!;
              g.fillRect(x, y, cs - wt + ((pa & 1) ? wt : 0), cs - wt);
              if (pa & 2) g.fillRect(x, y, cs - wt, cs);
            }
            if (m.walk) {
              g.strokeStyle = '#ff4f9a';
              g.lineWidth = Math.max(1, cs * 0.28);
              g.lineJoin = 'round';
              g.beginPath();
              m.walk.forEach((c, k) => {
                const X = ox + (c % C) * cs + (cs - wt) / 2;
                const Y = oy + ((c / C) | 0) * cs + (cs - wt) / 2;
                if (k) g.lineTo(X, Y);
                else g.moveTo(X, Y);
              });
              g.stroke();
            }
            if (!m.done && m.head >= 0) {
              const X = ox + (m.head % C) * cs + (cs - wt) / 2;
              const Y = oy + ((m.head / C) | 0) * cs + (cs - wt) / 2;
              g.beginPath();
              g.arc(X, Y, cs * 0.45 + Math.sin(t * 14) * cs * 0.08, 0, TAU);
              g.fillStyle = p === 2 ? '#ff4f9a' : '#ffe14d';
              g.fill();
            }
            if (m.done && flood >= 1) {
              const k = clamp01((flood - 1) / 0.2);
              g.strokeStyle = `rgba(255,255,255,${k})`;
              g.lineWidth = Math.max(1, cs * 0.22);
              g.lineJoin = 'round';
              g.beginPath();
              m.sol.forEach((c, j) => {
                const X = ox + (c % C) * cs + (cs - wt) / 2;
                const Y = oy + ((c / C) | 0) * cs + (cs - wt) / 2;
                if (j) g.lineTo(X, Y);
                else g.moveTo(X, Y);
              });
              g.stroke();
            }
            txt(g, NAMES[p]!, p * pw + pw / 2, 10 * u, 9 * u, ['#ffe14d', '#9ad7ff', '#ff8cc0'][p]!, 'center', 800);
            const info = m.done ? `막다른 길 ${m.dead} · 길이 ${m.sol.length}` : NOTE[p]!;
            txt(g, info, p * pw + pw / 2, h - 8 * u, 7.5 * u, m.done ? '#fff' : '#8a97b4', 'center', 700);
          });
          g.fillStyle = 'rgba(255,255,255,0.07)';
          g.fillRect(pw, 4 * u, 1, h - 8 * u);
          g.fillRect(pw * 2, 4 * u, 1, h - 8 * u);
        },
        controls: [
          seedCtl(run),
          speedCtl(run),
          { type: 'toggle', label: '거리 색 · 정답 길', value: true, on: (v) => { distOn = v; } },
          { type: 'range', label: '미로 크기', min: 6, max: 22, step: 1, value: 10, on: (v) => { C = v; R = Math.round(v * 1.4); run.restart(run.seed); } },
        ],
      };
    },
  },
  /* ───────────── i251 강 흘려보내기 ───────────── */
  i251: {
    kind: '2d',
    caption: '칸마다 빗물 1 — 높은 곳부터 가장 낮은 이웃으로 넘겨 모으면 물줄기가 합쳐져 강, 고인 웅덩이는 호수',
    make() {
      let T: Terrain | null = null;
      let W = 0;
      let H = 0;
      let base = mkCanvas(1, 1);
      let order = new Int32Array(0);
      let down = new Int32Array(0);
      let acc = new Float32Array(0);
      let lake = new Uint8Array(0);
      let done = new Uint8Array(0);
      let pi = 0;
      let per = 1;
      let thr = 6;
      let drops = true;
      let res = 120;
      const P: { c: number; k: number }[] = [];
      const heap = new Heap();
      const run = runner({
        rate: 60,
        hold: 2.2,
        start(seed) {
          W = res;
          H = Math.round(res * 0.625);
          T = makeTerrain(W, H, seed, 0.56, 1.05);
          const n = W * H;
          const filled = new Float32Array(n);
          const seen = new Uint8Array(n);
          down = new Int32Array(n).fill(-1);
          heap.clear();
          for (let i = 0; i < n; i++)
            if (T.h[i]! < T.sea) {
              seen[i] = 1;
              filled[i] = T.h[i]!;
              heap.push(T.h[i]!, i);
            }
          const pops: number[] = [];
          while (heap.size) {
            const c = heap.pop();
            pops.push(c);
            const cx = c % W;
            const cy = (c / W) | 0;
            for (const [dx, dy] of N8) {
              const x = cx + dx;
              const y = cy + dy;
              if (x < 0 || y < 0 || x >= W || y >= H) continue;
              const k = y * W + x;
              if (seen[k]) continue;
              seen[k] = 1;
              filled[k] = Math.max(T.h[k]!, filled[c]! + 1e-5);
              down[k] = c;
              heap.push(filled[k]!, k);
            }
          }
          const land: number[] = [];
          for (let k = pops.length - 1; k >= 0; k--) if (T.h[pops[k]!]! >= T.sea) land.push(pops[k]!);
          order = Int32Array.from(land);
          lake = new Uint8Array(n);
          for (const i of land) if (filled[i]! - T.h[i]! > 0.004) lake[i] = 1;
          acc = new Float32Array(n);
          done = new Uint8Array(n);
          pi = 0;
          per = Math.max(1, Math.ceil(order.length / 150));
          base = terrainImage(T);
          P.length = 0;
        },
        step() {
          for (let k = 0; k < per && pi < order.length; k++, pi++) {
            const c = order[pi]!;
            acc[c] = acc[c]! + 1;
            done[c] = 1;
            const d = down[c]!;
            if (d >= 0) acc[d] = acc[d]! + acc[c]!;
          }
          return pi >= order.length;
        },
      });
      run.restart();
      return {
        draw(g, w, h, _t, dt) {
          reset(g);
          const want = w > 420 ? 200 : 120;
          if (want !== res) {
            res = want;
            run.restart(run.seed);
          }
          run.tick(dt);
          if (!T) return;
          drawCover(g, base, w, h);
          const s = Math.max(w / W, h / H);
          const ox = (w - W * s) / 2;
          const oy = (h - H * s) / 2;
          const X = (i: number): number => ox + ((i % W) + 0.5) * s;
          const Y = (i: number): number => oy + (((i / W) | 0) + 0.5) * s;
          const u = ui(scaleOf(w, h));
          const k = res / 120;
          // 호수
          g.fillStyle = '#4a9fd6';
          g.beginPath();
          for (let p = 0; p < pi; p++) {
            const c = order[p]!;
            if (!lake[c]) continue;
            g.moveTo(X(c) + s * 0.8, Y(c));
            g.arc(X(c), Y(c), s * 0.8, 0, TAU);
          }
          g.fill();
          // 강 — 굵기별로 묶어 그리기
          const T0 = thr * k * k;
          const buckets: number[][] = [[], [], [], [], []];
          for (let p = 0; p < pi; p++) {
            const c = order[p]!;
            const a = acc[c]!;
            if (a < T0 || down[c]! < 0) continue;
            const b = Math.min(4, Math.floor(Math.log2(a / T0) * 0.9));
            buckets[b]!.push(c);
          }
          g.lineCap = 'round';
          for (let pass = 0; pass < 2; pass++)
            buckets.forEach((list, b) => {
              if (!list.length) return;
              g.beginPath();
              for (const c of list) {
                const d = down[c]!;
                g.moveTo(X(c), Y(c));
                g.lineTo(X(d), Y(d));
              }
              const wd = (0.35 + b * 0.32) * s * (res > 150 ? 1.3 : 1);
              g.strokeStyle = pass ? '#86d0f5' : '#2a78c0';
              g.lineWidth = pass ? Math.max(0.6, wd * 0.4) : Math.max(1, wd);
              g.stroke();
            });
          // 막 물이 지나간 높이 띠
          if (!run.holding) {
            g.fillStyle = 'rgba(255,255,255,0.28)';
            for (let p = Math.max(0, pi - per * 8); p < pi; p++) {
              const c = order[p]!;
              g.fillRect(X(c) - s / 2, Y(c) - s / 2, s, s);
            }
          }
          // 물방울
          if (drops && pi > 0) {
            while (P.length < 70) P.push({ c: order[Math.floor(Math.random() * pi)]!, k: Math.random() });
            g.fillStyle = 'rgba(220,245,255,0.9)';
            for (const q of P) {
              q.k += dt * 7;
              while (q.k >= 1) {
                q.k -= 1;
                const d = down[q.c]!;
                if (d < 0 || !T || T.h[d]! < T.sea) {
                  q.c = order[Math.floor(Math.random() * pi)]!;
                  break;
                }
                q.c = d;
              }
              const d = down[q.c]!;
              if (d < 0) continue;
              const x = lerp(X(q.c), X(d), q.k);
              const y = lerp(Y(q.c), Y(d), q.k);
              g.beginPath();
              g.arc(x, y, 1.3 * u, 0, TAU);
              g.fill();
            }
          }
          vignette(g, w, h, 0.25);
          const pct = Math.round((pi / Math.max(1, order.length)) * 100);
          pill(g, run.holding ? '모든 빗물이 바다로 — 강 · 호수 완성' : `높은 곳부터 물 모으기 ${pct}%`, 8 * u, 13 * u, 9 * u, 'rgba(10,30,50,0.8)');
        },
        controls: [
          seedCtl(run),
          speedCtl(run),
          { type: 'range', label: '강이 되는 물의 양', min: 2, max: 30, step: 1, value: 6, on: (v) => { thr = v; } },
          { type: 'toggle', label: '흐르는 물방울', value: true, on: (v) => { drops = v; } },
        ],
      };
    },
  },

  /* ───────────── i252 길 놓기 (A*) ───────────── */
  i252: {
    kind: '2d',
    caption: '마을 사이를 A* 로 잇기 — 산 · 비탈은 비싸게, 평지 · 이미 난 길은 싸게: 노란 칸이 살펴본 곳',
    make() {
      const W = 96;
      const H = 60;
      let T: Terrain | null = null;
      let base = mkCanvas(1, 1);
      let villages: number[] = [];
      let pairs: [number, number][] = [];
      let pk = 0;
      let road = new Uint8Array(W * H);
      let roads: number[][] = [];
      let gS = new Float32Array(W * H);
      let came = new Int32Array(W * H);
      let closed = new Uint8Array(W * H);
      let seenN = 0;
      let mode: 'search' | 'path' = 'search';
      let pathAnim = 0;
      let curPath: number[] = [];
      let goal = 0;
      let mountain = 1;
      let showSearch = true;
      let hiRes = 2;
      let lastCost = 0;
      let totalCost = 0;
      const heap = new Heap();
      const exp = mkCanvas(W, H);
      let expImg = c2(exp).createImageData(W, H);
      const elev = (i: number): number => (T ? (T.h[i]! - T.sea) / (T.hi - T.sea) : 0);
      const startSearch = (): void => {
        const [a, b] = pairs[pk]!;
        gS.fill(Infinity);
        came.fill(-1);
        closed.fill(0);
        heap.clear();
        gS[a] = 0;
        goal = b;
        heap.push(0, a);
        seenN = 0;
        mode = 'search';
        expImg = c2(exp).createImageData(W, H);
      };
      const run = runner({
        rate: 60,
        hold: 2.2,
        start(seed) {
          T = makeTerrain(W, H, seed, 0.66, 0.85);
          base = terrainImage(makeTerrain(W * hiRes, H * hiRes, seed, 0.66, 0.85));
          const r = mulberry(seed + 9);
          villages = [];
          for (let k = 0; k < 4000 && villages.length < 6; k++) {
            const i = Math.floor(r() * W * H);
            const x = i % W;
            const y = (i / W) | 0;
            if (x < 4 || y < 4 || x > W - 5 || y > H - 5) continue;
            const e = elev(i);
            if (T.h[i]! < T.sea || e < 0.04 || e > 0.32) continue;
            if (villages.some((v) => Math.hypot((v % W) - x, ((v / W) | 0) - y) < W * 0.2)) continue;
            villages.push(i);
          }
          // 최소 신장 나무 순서 (프림)
          pairs = [];
          const inT = [0];
          while (inT.length < villages.length) {
            let best: [number, number] = [0, 0];
            let bd = Infinity;
            for (const a of inT)
              for (let b = 0; b < villages.length; b++) {
                if (inT.includes(b)) continue;
                const va = villages[a]!;
                const vb = villages[b]!;
                const d = Math.hypot((va % W) - (vb % W), ((va / W) | 0) - ((vb / W) | 0));
                if (d < bd) {
                  bd = d;
                  best = [a, b];
                }
              }
            inT.push(best[1]);
            pairs.push([villages[best[0]]!, villages[best[1]]!]);
          }
          road = new Uint8Array(W * H);
          roads = [];
          pk = 0;
          totalCost = 0;
          if (pairs.length) startSearch();
        },
        step() {
          if (!T || pk >= pairs.length) return true;
          if (mode === 'path') {
            pathAnim += 1 / 30;
            if (pathAnim >= 1) {
              for (const c of curPath) road[c] = 1;
              roads.push(curPath);
              totalCost += lastCost;
              pk++;
              if (pk >= pairs.length) return true;
              startSearch();
            }
            return false;
          }
          const gx = goal % W;
          const gy = (goal / W) | 0;
          for (let n = 0; n < 45 && heap.size; n++) {
            const c = heap.pop();
            if (closed[c]) continue;
            closed[c] = 1;
            seenN++;
            const o = c * 4;
            const d = expImg.data;
            d[o] = 255;
            d[o + 1] = 214;
            d[o + 2] = 80;
            d[o + 3] = 120;
            if (c === goal) {
              curPath = [];
              for (let q = c; q >= 0; q = came[q]!) curPath.push(q);
              curPath.reverse();
              lastCost = gS[c]!;
              mode = 'path';
              pathAnim = 0;
              return false;
            }
            const cx = c % W;
            const cy = (c / W) | 0;
            for (const [dx, dy] of N8) {
              const x = cx + dx;
              const y = cy + dy;
              if (x < 0 || y < 0 || x >= W || y >= H) continue;
              const k = y * W + x;
              if (closed[k] || T.h[k]! < T.sea) continue;
              const de = Math.abs(elev(k) - elev(c));
              let cost = 1 + mountain * (de * 60 + Math.max(0, elev(k) - 0.35) * 14);
              if (road[k]) cost = 0.35;
              cost *= dx && dy ? 1.414 : 1;
              const ng = gS[c]! + cost;
              if (ng < gS[k]!) {
                gS[k] = ng;
                came[k] = c;
                heap.push(ng + Math.hypot(x - gx, y - gy) * 0.5, k);
              }
            }
          }
          if (!heap.size) {
            pk++;
            if (pk >= pairs.length) return true;
            startSearch();
          }
          return false;
        },
      });
      run.restart();
      const roadPath = (g: G, path: number[], upto: number, X: (i: number) => number, Y: (i: number) => number): void => {
        // 차이킨으로 부드럽게
        let pts: P2[] = path.slice(0, Math.max(2, upto)).map((c) => [X(c), Y(c)]);
        for (let it = 0; it < 2; it++) {
          const q: P2[] = [pts[0]!];
          for (let k = 0; k < pts.length - 1; k++) {
            const a = pts[k]!;
            const b = pts[k + 1]!;
            q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
          }
          q.push(pts[pts.length - 1]!);
          pts = q;
        }
        g.beginPath();
        pts.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
      };
      return {
        draw(g, w, h, t, dt) {
          reset(g);
          const wantR = w > 420 ? 4 : 2;
          if (wantR !== hiRes) {
            hiRes = wantR;
            run.restart(run.seed);
          }
          run.tick(dt);
          if (!T) return;
          drawCover(g, base, w, h);
          const s = Math.max(w / W, h / H);
          const ox = (w - W * s) / 2;
          const oy = (h - H * s) / 2;
          const X = (i: number): number => ox + ((i % W) + 0.5) * s;
          const Y = (i: number): number => oy + (((i / W) | 0) + 0.5) * s;
          const u = ui(scaleOf(w, h));
          if (showSearch && mode === 'search' && !run.holding) {
            c2(exp).putImageData(expImg, 0, 0);
            g.imageSmoothingEnabled = false;
            g.drawImage(exp, ox, oy, W * s, H * s);
            g.imageSmoothingEnabled = true;
          }
          g.lineCap = 'round';
          g.lineJoin = 'round';
          const all: [number[], number][] = roads.map((p) => [p, p.length]);
          if (mode === 'path' && !run.holding) all.push([curPath, Math.ceil(curPath.length * ease(pathAnim))]);
          for (const [p, n] of all) {
            roadPath(g, p, n, X, Y);
            g.strokeStyle = 'rgba(60,35,15,0.55)';
            g.lineWidth = 3.4 * u;
            g.stroke();
          }
          for (const [p, n] of all) {
            roadPath(g, p, n, X, Y);
            g.strokeStyle = '#ead09a';
            g.lineWidth = 1.8 * u;
            g.stroke();
          }
          // 마을
          villages.forEach((v, k) => {
            const x = X(v);
            const y = Y(v);
            const b = 1 + Math.sin(t * 3 + k) * 0.04;
            g.fillStyle = 'rgba(30,20,10,0.35)';
            g.beginPath();
            g.ellipse(x + 1.5 * u, y + 4.5 * u, 7 * u, 2.5 * u, 0, 0, TAU);
            g.fill();
            g.fillStyle = '#fff5e0';
            g.fillRect(x - 5 * u, y - 2 * u * b, 10 * u, 7 * u);
            g.fillStyle = '#d9483b';
            g.beginPath();
            g.moveTo(x - 6.5 * u, y - 1.5 * u);
            g.lineTo(x, y - 8 * u * b);
            g.lineTo(x + 6.5 * u, y - 1.5 * u);
            g.fill();
            g.fillStyle = '#7a4a2a';
            g.fillRect(x - 1.3 * u, y + 1.5 * u, 2.6 * u, 3.5 * u);
          });
          if (mode === 'search' && !run.holding && pairs[pk]) {
            const [a, b] = pairs[pk]!;
            for (const v of [a, b]) {
              g.strokeStyle = '#ffe14d';
              g.lineWidth = 1.6 * u;
              g.beginPath();
              g.arc(X(v), Y(v) - 2 * u, 10 * u + Math.sin(t * 8) * 1.5 * u, 0, TAU);
              g.stroke();
            }
          }
          vignette(g, w, h, 0.25);
          const label = run.holding ? `길 완성 · 총 비용 ${Math.round(totalCost)}` : mode === 'search' ? `A* 탐색 ${pk + 1}/${pairs.length} · 살펴본 칸 ${seenN}` : `가장 싼 길 · 비용 ${Math.round(lastCost)}`;
          pill(g, label, 8 * u, 13 * u, 9 * u, 'rgba(40,28,12,0.82)', '#fff3d6');
        },
        controls: [
          seedCtl(run),
          speedCtl(run),
          { type: 'range', label: '산 · 비탈 비용', min: 0, max: 3, step: 0.25, value: 1, on: (v) => { mountain = v; run.restart(run.seed); } },
          { type: 'toggle', label: '살펴본 칸 보기', value: true, on: (v) => { showSearch = v; } },
        ],
      };
    },
  },

  /* ───────────── i253 물방울 침식 (3D) ───────────── */
  i253: {
    kind: '3d',
    caption: '물방울 수만 개가 비탈을 굴러 흙을 깎고 낮은 곳에 쌓아요 — 골짜기가 파이고 아래엔 모래 부채꼴',
    make() {
      const N = 112;
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x9fc7e8);
      scene.fog = new THREE.Fog(0x9fc7e8, 13, 27);
      const cam = new THREE.PerspectiveCamera(40, 1.6, 0.1, 100);
      scene.add(new THREE.HemisphereLight(0xdbeeff, 0x4a3a2a, 1.1));
      const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
      sun.position.set(-6, 5, 3);
      scene.add(sun);
      const geo = new THREE.PlaneGeometry(10, 10, N - 1, N - 1);
      geo.rotateX(-Math.PI / 2);
      const col = new Float32Array(N * N * 3);
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
      const mesh = new THREE.Mesh(geo, mat);
      scene.add(mesh);
      const water = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshStandardMaterial({ color: 0x2f7fb8, roughness: 0.25, transparent: true, opacity: 0.82 }));
      water.rotation.x = -Math.PI / 2;
      water.position.y = 0.32;
      scene.add(water);
      // 물방울 자취
      const TR = 600;
      const tpos = new Float32Array(TR * 3);
      const tgeo = new THREE.BufferGeometry();
      tgeo.setAttribute('position', new THREE.BufferAttribute(tpos, 3));
      const tmat = new THREE.PointsMaterial({ color: 0x9fe4ff, size: 0.07, transparent: true, opacity: 0.9, depthWrite: false });
      const trail = new THREE.Points(tgeo, tmat);
      scene.add(trail);
      let ti = 0;
      const HS = 3.4;
      let hm = new Float32Array(N * N);
      let orig = new Float32Array(N * N);
      let drops = 0;
      const TOTAL = 24000;
      let perFrame = 150;
      let showDrops = true;
      let holdT = 0;
      let seed = 1;
      let frame = 0;
      const build = (): void => {
        seed = 1 + Math.floor(Math.random() * 9999);
        for (let y = 0; y < N; y++)
          for (let x = 0; x < N; x++) {
            const nx = x / (N - 1) - 0.5;
            const ny = y / (N - 1) - 0.5;
            const d = Math.sqrt(nx * nx + ny * ny) * 2;
            let v = fbm(x * 0.045 + seed, y * 0.045, seed, 5);
            const ridge = 1 - Math.abs(fbm(x * 0.03, y * 0.03 + seed, seed + 3, 3) * 2 - 1);
            v = v * 0.6 + ridge * 0.55;
            v = v * (1 - smooth(0.55, 1.05, d)) - 0.05;
            hm[y * N + x] = Math.max(0, v);
          }
        orig = hm.slice();
        drops = 0;
        holdT = 0;
        tpos.fill(0);
        tgeo.setDrawRange(0, 0);
        ti = 0;
        refresh();
      };
      const sample = (x: number, y: number): [number, number, number] => {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        const fx = x - ix;
        const fy = y - iy;
        const i = iy * N + ix;
        const a = hm[i]!;
        const b = hm[i + 1]!;
        const c = hm[i + N]!;
        const d = hm[i + N + 1]!;
        return [(b - a) * (1 - fy) + (d - c) * fy, (c - a) * (1 - fx) + (d - b) * fx, a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy];
      };
      const erodeAt = (x: number, y: number, amt: number): void => {
        const cx = Math.floor(x);
        const cy = Math.floor(y);
        let ws = 0;
        const R = 2;
        for (let j = -R; j <= R; j++)
          for (let i = -R; i <= R; i++) {
            const d = Math.hypot(i + cx - x, j + cy - y);
            if (d < R) ws += R - d;
          }
        for (let j = -R; j <= R; j++)
          for (let i = -R; i <= R; i++) {
            const px = cx + i;
            const py = cy + j;
            if (px < 0 || py < 0 || px >= N || py >= N) continue;
            const d = Math.hypot(px - x, py - y);
            if (d >= R) continue;
            const k = py * N + px;
            const take = Math.min(hm[k]!, (amt * (R - d)) / ws);
            hm[k] = hm[k]! - take;
          }
      };
      const drop = (record: boolean): void => {
        let x = 2 + Math.random() * (N - 5);
        let y = 2 + Math.random() * (N - 5);
        let dx = 0;
        let dy = 0;
        let sp = 1;
        let wv = 1;
        let sed = 0;
        for (let life = 0; life < 40; life++) {
          const ix = Math.floor(x);
          const iy = Math.floor(y);
          const fx = x - ix;
          const fy = y - iy;
          const [gx, gy, hh] = sample(x, y);
          dx = dx * 0.05 - gx * 0.95;
          dy = dy * 0.05 - gy * 0.95;
          const len = Math.hypot(dx, dy);
          if (len < 1e-9) break;
          dx /= len;
          dy /= len;
          x += dx;
          y += dy;
          if (x < 1 || y < 1 || x >= N - 2 || y >= N - 2) break;
          const nh = sample(x, y)[2];
          const dh = nh - hh;
          if (record && life % 2 === 0) {
            const o = (ti % TR) * 3;
            tpos[o] = (x / (N - 1) - 0.5) * 10;
            tpos[o + 1] = nh * HS + 0.05;
            tpos[o + 2] = (y / (N - 1) - 0.5) * 10;
            ti++;
          }
          const cap = Math.max(-dh, 0.01) * sp * wv * 4;
          const i = iy * N + ix;
          if (sed > cap || dh > 0) {
            const dep = dh > 0 ? Math.min(dh, sed) : (sed - cap) * 0.3;
            sed -= dep;
            hm[i] = hm[i]! + dep * (1 - fx) * (1 - fy);
            hm[i + 1] = hm[i + 1]! + dep * fx * (1 - fy);
            hm[i + N] = hm[i + N]! + dep * (1 - fx) * fy;
            hm[i + N + 1] = hm[i + N + 1]! + dep * fx * fy;
          } else {
            const er = Math.min((cap - sed) * 0.3, -dh);
            erodeAt(x - dx, y - dy, er);
            sed += er;
          }
          sp = Math.sqrt(Math.max(0, sp * sp - dh * 4));
          wv *= 0.98;
        }
      };
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const C_G: V3 = [0.36, 0.6, 0.27];
      const C_R: V3 = [0.5, 0.44, 0.38];
      const C_S: V3 = [0.86, 0.76, 0.52];
      const C_D: V3 = [0.32, 0.24, 0.18];
      const C_W: V3 = [0.95, 0.96, 0.98];
      const refresh = (): void => {
        for (let i = 0; i < N * N; i++) pos.setY(i, hm[i]! * HS);
        pos.needsUpdate = true;
        geo.computeVertexNormals();
        const nor = geo.attributes.normal as THREE.BufferAttribute;
        for (let i = 0; i < N * N; i++) {
          const ny = nor.getY(i);
          const hh = hm[i]!;
          const diff = hh - orig[i]!;
          let c = mix(C_R, C_G, smooth(0.7, 0.86, ny));
          c = mix(c, C_W, smooth(0.62, 0.72, hh) * smooth(0.75, 0.9, ny));
          c = mix(c, C_S, clamp01(diff * 60));
          c = mix(c, C_D, clamp01(-diff * 25) * 0.6);
          if (hh * HS < 0.4) c = mix(c, C_S, 0.85);
          col[i * 3] = c[0];
          col[i * 3 + 1] = c[1];
          col[i * 3 + 2] = c[2];
        }
        (geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
      };
      build();
      // 숫자 표지
      const lab = document.createElement('canvas');
      lab.width = 512;
      lab.height = 96;
      const ltex = new THREE.CanvasTexture(lab);
      ltex.colorSpace = THREE.SRGBColorSpace;
      const lspr = new THREE.Sprite(new THREE.SpriteMaterial({ map: ltex, depthTest: false, transparent: true }));
      lspr.scale.set(4.2, 0.79, 1);
      lspr.renderOrder = 10;
      scene.add(lspr);
      let lastLab = '';
      const drawLab = (s: string): void => {
        if (s === lastLab) return;
        lastLab = s;
        const g = c2(lab);
        g.clearRect(0, 0, 512, 96);
        rr(g, 8, 14, 496, 68, 34);
        g.fillStyle = 'rgba(12,28,48,0.78)';
        g.fill();
        txt(g, s, 256, 50, 36, '#fff', 'center', 800);
        ltex.needsUpdate = true;
      };
      return {
        scene,
        camera: cam,
        update(t, dt) {
          frame++;
          const ang = t * 0.12;
          cam.position.set(Math.sin(ang) * 11.5, 7.2, Math.cos(ang) * 11.5);
          cam.lookAt(0, 0.6, 0);
          lspr.position.copy(cam.position).multiplyScalar(0.45).add(new THREE.Vector3(0, 2.2, 0));
          if (drops < TOTAL) {
            const n = Math.min(perFrame, TOTAL - drops);
            for (let k = 0; k < n; k++) drop(showDrops && k % 25 === 0);
            drops += n;
            if (frame % 2 === 0 || drops >= TOTAL) refresh();
            tgeo.setDrawRange(0, Math.min(ti, TR));
            (tgeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
          } else {
            holdT += dt;
            tmat.opacity = Math.max(0, 0.9 - holdT);
            if (holdT > 2.5) {
              build();
              tmat.opacity = 0.9;
            }
          }
          trail.visible = showDrops;
          drawLab(drops >= TOTAL ? `침식 끝 · 물방울 ${TOTAL.toLocaleString()}개` : `물방울 ${drops.toLocaleString()}개`);
        },
        controls: [
          { type: 'button', label: '새 지형', on: () => build() },
          { type: 'range', label: '한 번에 떨어뜨릴 물방울', min: 50, max: 800, step: 50, value: 150, on: (v) => { perFrame = v; } },
          { type: 'toggle', label: '물방울 자취', value: true, on: (v) => { showDrops = v; } },
        ],
        dispose() {
          geo.dispose();
          mat.dispose();
          water.geometry.dispose();
          (water.material as THREE.Material).dispose();
          tgeo.dispose();
          tmat.dispose();
          ltex.dispose();
          lspr.material.dispose();
        },
      };
    },
  },

  /* ───────────── i254 포아송 원판 ───────────── */
  i254: {
    kind: '2d',
    caption: '왼쪽 그냥 무작위는 뭉치고 비어요 — 오른쪽 포아송 원판: 활성 점 둘레 고리(r~2r)에서만 새 점, 서로 최소 거리를 지켜 고른 숲',
    make() {
      let rad = 0.075;
      let rings = true;
      interface Pt { x: number; y: number; born: number; c: number }
      let pts: Pt[] = [];
      let rnd: Pt[] = [];
      let active: number[] = [];
      let tries: { x: number; y: number; ok: boolean; t: number }[] = [];
      let cur = -1;
      let clock = 0;
      let rng = mulberry(1);
      let grid: Int32Array = new Int32Array(0);
      let gw = 0;
      let gh = 0;
      const AW = 1;
      const AH = 1.25;
      const run = runner({
        rate: 60,
        hold: 1.8,
        start(seed) {
          rng = mulberry(seed);
          pts = [];
          rnd = [];
          active = [];
          tries = [];
          const cs = rad / Math.SQRT2;
          gw = Math.ceil(AW / cs);
          gh = Math.ceil(AH / cs);
          grid = new Int32Array(gw * gh).fill(-1);
          add(AW * (0.3 + rng() * 0.4), AH * (0.3 + rng() * 0.4));
        },
        step() {
          // 활성 점 하나에서 k 번 던져 보기
          if (!active.length) return true;
          const ai = Math.floor(rng() * active.length);
          const p = pts[active[ai]!]!;
          cur = active[ai]!;
          let placed = false;
          for (let k = 0; k < 18; k++) {
            const a = rng() * TAU;
            const d = rad * (1 + rng());
            const x = p.x + Math.cos(a) * d;
            const y = p.y + Math.sin(a) * d;
            const ok = x > 0.02 && y > 0.02 && x < AW - 0.02 && y < AH - 0.02 && far(x, y);
            tries.push({ x, y, ok, t: clock });
            if (ok) {
              add(x, y);
              placed = true;
              break;
            }
          }
          if (!placed) active.splice(ai, 1);
          // 같은 수만큼 그냥 무작위
          while (rnd.length < pts.length) rnd.push({ x: 0.02 + rng() * (AW - 0.04), y: 0.02 + rng() * (AH - 0.04), born: clock, c: rng() });
          if (tries.length > 60) tries.splice(0, tries.length - 60);
          return false;
        },
      });
      const far = (x: number, y: number): boolean => {
        const cs = rad / Math.SQRT2;
        const gx = Math.floor(x / cs);
        const gy = Math.floor(y / cs);
        for (let j = gy - 2; j <= gy + 2; j++)
          for (let i = gx - 2; i <= gx + 2; i++) {
            if (i < 0 || j < 0 || i >= gw || j >= gh) continue;
            const q = grid[j * gw + i]!;
            if (q >= 0 && Math.hypot(pts[q]!.x - x, pts[q]!.y - y) < rad) return false;
          }
        return true;
      };
      const add = (x: number, y: number): void => {
        const cs = rad / Math.SQRT2;
        pts.push({ x, y, born: clock, c: rng() });
        const k = pts.length - 1;
        active.push(k);
        grid[Math.floor(y / cs) * gw + Math.floor(x / cs)] = k;
      };
      run.restart();
      const tree = (g: G, x: number, y: number, r: number, c: number, grow: number): void => {
        const rr2 = r * (grow < 1 ? ease(grow) * 1.15 : 1);
        if (rr2 <= 0.2) return;
        g.fillStyle = 'rgba(10,40,10,0.35)';
        g.beginPath();
        g.ellipse(x + rr2 * 0.25, y + rr2 * 0.35, rr2 * 1.02, rr2 * 0.8, 0, 0, TAU);
        g.fill();
        const base = mix([46, 120, 58], [92, 160, 70], c);
        g.fillStyle = rgb(base);
        g.beginPath();
        g.arc(x, y, rr2, 0, TAU);
        g.fill();
        g.fillStyle = rgb(mix(base, [255, 255, 200], 0.25));
        g.beginPath();
        g.arc(x - rr2 * 0.28, y - rr2 * 0.3, rr2 * 0.45, 0, TAU);
        g.fill();
      };
      return {
        draw(g, w, h, _t, dt) {
          reset(g);
          clock += dt;
          run.tick(dt);
          const u = ui(scaleOf(w, h));
          g.fillStyle = '#20301f';
          g.fillRect(0, 0, w, h);
          const top = 18 * u;
          const pw = Math.min((w - 18 * u) / 2, ((h - top - 6 * u) * AW) / AH);
          const ph = (pw * AH) / AW;
          const gap = (w - pw * 2) / 3;
          const panels: [number, Pt[], string, boolean][] = [
            [gap, rnd, '그냥 무작위', false],
            [gap * 2 + pw, pts, '포아송 원판', true],
          ];
          for (const [px, list, name, isP] of panels) {
            const py = top + (h - top - ph) / 2 - 2 * u;
            rr(g, px, py, pw, ph, 6 * u);
            const gr = g.createLinearGradient(0, py, 0, py + ph);
            gr.addColorStop(0, '#9ccf72');
            gr.addColorStop(1, '#79b356');
            g.fillStyle = gr;
            g.fill();
            g.save();
            rr(g, px, py, pw, ph, 6 * u);
            g.clip();
            const S = pw / AW;
            if (rings) {
              g.fillStyle = 'rgba(255,255,255,0.13)';
              for (const p of list) {
                g.beginPath();
                g.arc(px + p.x * S, py + p.y * S, (rad / 2) * S, 0, TAU);
                g.fill();
              }
              if (!isP) {
                // 너무 가까운 짝 = 빨간 선
                g.strokeStyle = 'rgba(230,40,40,0.85)';
                g.lineWidth = 1.4 * u;
                g.beginPath();
                for (let i = 0; i < list.length; i++)
                  for (let j = i + 1; j < list.length; j++) {
                    const a = list[i]!;
                    const b = list[j]!;
                    if (Math.hypot(a.x - b.x, a.y - b.y) < rad) {
                      g.moveTo(px + a.x * S, py + a.y * S);
                      g.lineTo(px + b.x * S, py + b.y * S);
                    }
                  }
                g.stroke();
              }
            }
            const sorted = [...list].sort((a, b) => a.y - b.y);
            for (const p of sorted) tree(g, px + p.x * S, py + p.y * S, rad * 0.42 * S, p.c, (clock - p.born) / 0.35);
            if (isP && !run.holding) {
              // 활성 점 · 고리 · 던져 본 점
              g.fillStyle = 'rgba(255,200,60,0.9)';
              for (const a of active) {
                const p = pts[a]!;
                g.beginPath();
                g.arc(px + p.x * S, py + p.y * S, 1.6 * u, 0, TAU);
                g.fill();
              }
              const c = pts[cur];
              if (c) {
                g.beginPath();
                g.arc(px + c.x * S, py + c.y * S, rad * 2 * S, 0, TAU);
                g.arc(px + c.x * S, py + c.y * S, rad * S, 0, TAU, true);
                g.fillStyle = 'rgba(255,230,90,0.22)';
                g.fill('evenodd');
                g.strokeStyle = 'rgba(255,230,90,0.9)';
                g.lineWidth = 1.2 * u;
                g.beginPath();
                g.arc(px + c.x * S, py + c.y * S, rad * S, 0, TAU);
                g.stroke();
              }
              for (const q of tries) {
                const k = 1 - (clock - q.t) / 0.5;
                if (k <= 0) continue;
                g.globalAlpha = k;
                g.fillStyle = q.ok ? '#7dff9a' : '#ff5a5a';
                g.beginPath();
                g.arc(px + q.x * S, py + q.y * S, 1.8 * u, 0, TAU);
                g.fill();
              }
              g.globalAlpha = 1;
            }
            g.restore();
            txt(g, name, px + pw / 2, 10 * u, 9 * u, isP ? '#ffe680' : '#e8e8e8', 'center', 800);
          }
          txt(g, `나무 ${pts.length}그루씩`, w / 2, h - 6 * u, 7 * u, 'rgba(255,255,255,0.6)', 'center', 700);
        },
        controls: [
          seedCtl(run),
          speedCtl(run),
          { type: 'range', label: '최소 거리', min: 0.05, max: 0.14, step: 0.005, value: 0.075, on: (v) => { rad = v; run.restart(run.seed); } },
          { type: 'toggle', label: '거리 원 · 너무 가까운 짝', value: true, on: (v) => { rings = v; } },
        ],
      };
    },
  },
  /* ───────────── i255 시드 지도 ───────────── */
  i255: {
    kind: '2d',
    caption: '시드 숫자 하나가 지도 전체를 정해요 — 친구와 같은 시드면 똑같은 섬, 한 자리만 달라도 전혀 다른 섬',
    make() {
      const cache = new Map<number, HTMLCanvasElement>();
      const mapOf = (seed: number): HTMLCanvasElement => {
        let c = cache.get(seed);
        if (!c) {
          c = terrainImage(makeTerrain(128, 80, seed, 0.42, 1.05, 5));
          cache.set(seed, c);
          if (cache.size > 8) cache.delete(cache.keys().next().value!);
        }
        return c;
      };
      let ct = 0;
      let cyc = 0;
      let speed = 1;
      let seedA = 1000 + Math.floor(Math.random() * 9000);
      let seedB = seedA;
      let fixed = -1;
      let forceDiff = false;
      let diff = false;
      const newCycle = (): void => {
        ct = 0;
        cyc++;
        seedA = fixed >= 0 ? fixed : 1000 + Math.floor(Math.random() * 9000);
        diff = forceDiff || cyc % 3 === 0;
        if (diff) {
          const k = Math.floor(Math.random() * 4);
          const s = String(seedA).padStart(4, '0').split('');
          s[k] = String((Number(s[k]) + 1 + Math.floor(Math.random() * 8)) % 10);
          seedB = Number(s.join(''));
        } else seedB = seedA;
        mapOf(seedA);
        mapOf(seedB);
      };
      newCycle();
      const TYPE = 1.0;
      const BUILD = 1.3;
      const SHOW = 1.9;
      return {
        draw(g, w, h, t, dt) {
          reset(g);
          ct += Math.min(dt, 0.1) * speed;
          if (ct > TYPE + BUILD + SHOW) newCycle();
          const u = ui(scaleOf(w, h));
          const bg = g.createLinearGradient(0, 0, 0, h);
          bg.addColorStop(0, '#16213a');
          bg.addColorStop(1, '#0d1424');
          g.fillStyle = bg;
          g.fillRect(0, 0, w, h);
          const gap = 10 * u;
          const pw = (w - gap * 3) / 2;
          const mh = Math.min(pw * 0.625, h - 54 * u);
          const my = Math.max(30 * u, (h - mh + 26 * u) / 2);
          const hy = my - 30 * u;
          [seedA, seedB].forEach((sd, p) => {
            const px = gap + p * (pw + gap);
            txt(g, p ? '친구 B' : '친구 A', px + 4 * u, hy + 12 * u, 9 * u, p ? '#ffb3d1' : '#9fd8ff', 'left', 800);
            // 시드 다이얼
            const digits = String(sd).padStart(4, '0');
            const dw = 15 * u;
            const dx0 = px + pw - dw * 4 - 4 * u;
            for (let k = 0; k < 4; k++) {
              const lock = TYPE * (0.25 + k * 0.18) + p * 0.08;
              const shown = ct >= lock ? digits[k]! : String(Math.floor(hash2(Math.floor(t * 30), k + p * 7) * 10));
              const x = dx0 + k * dw;
              rr(g, x, hy + 4 * u, dw - 2 * u, 18 * u, 3 * u);
              g.fillStyle = ct >= lock ? '#f5f0e6' : '#3a4566';
              g.fill();
              const changed = diff && p === 1 && digits[k] !== String(seedA).padStart(4, '0')[k];
              txt(g, shown, x + (dw - 2 * u) / 2, hy + 13.5 * u, 12 * u, ct >= lock ? (changed && ct > TYPE ? '#e8590c' : '#1b2440') : '#9fb0d8', 'center', 900);
            }
            txt(g, '시드', dx0 - 4 * u, hy + 13 * u, 8 * u, '#8a97b4', 'right', 700);
            // 지도
            const mx = px;
            rr(g, mx, my, pw, mh, 6 * u);
            g.fillStyle = '#0a1830';
            g.fill();
            const k = clamp01((ct - TYPE) / BUILD);
            if (k <= 0) txt(g, '시드 넣는 중…', mx + pw / 2, my + mh / 2, 9 * u, 'rgba(160,180,220,0.55)', 'center', 700);
            if (k > 0) {
              g.save();
              rr(g, mx, my, pw, mh, 6 * u);
              g.clip();
              const rw = pw * ease(k);
              g.beginPath();
              g.rect(mx, my, rw, mh);
              g.clip();
              g.drawImage(mapOf(sd), mx, my, pw, mh);
              g.restore();
              if (k < 1) {
                const ex = mx + rw;
                const gr = g.createLinearGradient(ex - 14 * u, 0, ex + 2 * u, 0);
                gr.addColorStop(0, 'rgba(255,255,255,0)');
                gr.addColorStop(1, 'rgba(200,240,255,0.85)');
                g.fillStyle = gr;
                g.fillRect(ex - 14 * u, my, 16 * u, mh);
              }
            }
            rr(g, mx, my, pw, mh, 6 * u);
            g.strokeStyle = p ? 'rgba(255,179,209,0.6)' : 'rgba(159,216,255,0.6)';
            g.lineWidth = 1.5 * u;
            g.stroke();
          });
          // 판정
          const vk = clamp01((ct - TYPE - BUILD) / 0.3);
          if (vk > 0) {
            const cx = w / 2;
            const cy = my + mh / 2;
            g.globalAlpha = vk;
            g.beginPath();
            g.arc(cx, cy, 12 * u * (0.6 + 0.4 * ease(vk)), 0, TAU);
            g.fillStyle = diff ? '#e8590c' : '#2fb36b';
            g.fill();
            g.lineWidth = 2 * u;
            g.strokeStyle = '#fff';
            g.stroke();
            txt(g, diff ? '≠' : '=', cx, cy + 0.5 * u, 15 * u, '#fff', 'center', 900);
            pill(g, diff ? '한 자리만 달라도 → 전혀 다른 섬' : '같은 시드 → 똑같은 섬', cx, cy + 24 * u, 8.5 * u, diff ? 'rgba(232,89,12,0.95)' : 'rgba(47,179,107,0.95)', '#fff', 'center');
            g.globalAlpha = 1;
          }
        },
        controls: [
          { type: 'range', label: '시드 고정 (0 = 무작위)', min: 0, max: 9999, step: 1, value: 0, on: (v) => { fixed = v > 0 ? v : -1; newCycle(); } },
          { type: 'toggle', label: '친구 B 는 한 자리 바꾸기', value: false, on: (v) => { forceDiff = v; newCycle(); } },
          { type: 'range', label: '속도', min: 0.25, max: 3, step: 0.25, value: 1, on: (v) => { speed = v; } },
          { type: 'button', label: '다시', on: () => newCycle() },
        ],
      };
    },
  },

  /* ───────────── i256 육각 격자 좌표 ───────────── */
  i256: {
    kind: '2d',
    caption: '육각 칸 = (q, r, s) 세 수, 늘 q + r + s = 0 — 이웃 6칸 · 거리 · 고리 · 직선을 덧셈으로',
    make() {
      const RAD = 4;
      const cells: [number, number][] = [];
      for (let q = -RAD; q <= RAD; q++) for (let r = Math.max(-RAD, -q - RAD); r <= Math.min(RAD, -q + RAD); r++) cells.push([q, r]);
      const DIRS: [number, number][] = [
        [1, 0],
        [1, -1],
        [0, -1],
        [-1, 0],
        [-1, 1],
        [0, 1],
      ];
      const dist = (a: [number, number], b: [number, number]): number => (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[0] + a[1] - b[0] - b[1])) / 2;
      const inside = (c: [number, number]): boolean => dist(c, [0, 0]) <= RAD;
      const QC = '#ff6b8a';
      const RC = '#5fd68f';
      const SC = '#5ab4ff';
      let auto = true;
      let mode = 0;
      let mt = 0;
      let labels = true;
      let cur: [number, number] = [0, 0];
      let walkT = 0;
      let A: [number, number] = [-3, 1];
      let B: [number, number] = [3, -2];
      const MODES = ['좌표 (q, r, s)', '이웃 6칸', '거리', '고리', '직선'];
      const DUR = 4;
      const pickLine = (): void => {
        const r = Math.random;
        for (;;) {
          A = cells[Math.floor(r() * cells.length)]!;
          B = cells[Math.floor(r() * cells.length)]!;
          if (dist(A, B) >= 5) break;
        }
      };
      const enter = (m: number): void => {
        mode = m;
        mt = 0;
        if (m === 1 || m === 3) cur = [0, 0];
        if (m === 2) cur = cells[Math.floor(Math.random() * cells.length)]!;
        if (m === 4) pickLine();
      };
      const hexLine = (a: [number, number], b: [number, number]): { c: [number, number]; f: [number, number] }[] => {
        const n = dist(a, b);
        const out: { c: [number, number]; f: [number, number] }[] = [];
        for (let i = 0; i <= n; i++) {
          const k = n ? i / n : 0;
          const fq = lerp(a[0] + 1e-6, b[0] + 1e-6, k);
          const fr = lerp(a[1] + 1e-6, b[1] + 1e-6, k);
          const fs = -fq - fr;
          let q = Math.round(fq);
          let r = Math.round(fr);
          const s = Math.round(fs);
          const dq = Math.abs(q - fq);
          const dr = Math.abs(r - fr);
          const ds = Math.abs(s - fs);
          if (dq > dr && dq > ds) q = -r - s;
          else if (dr > ds) r = -q - s;
          out.push({ c: [q, r], f: [fq, fr] });
        }
        return out;
      };
      return {
        draw(g, w, h, _t, dt) {
          reset(g);
          mt += Math.min(dt, 0.1);
          if (auto && mt > DUR) enter((mode + 1) % 5);
          const u = ui(scaleOf(w, h));
          const bg = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) / 2);
          bg.addColorStop(0, '#1d2742');
          bg.addColorStop(1, '#0c1120');
          g.fillStyle = bg;
          g.fillRect(0, 0, w, h);
          const top = 22 * u;
          const size = Math.min((w * 0.94) / (Math.sqrt(3) * (2 * RAD + 1)), (h - top - 4 * u) / (1.5 * 2 * RAD + 2));
          const cx = w / 2;
          const cy = top + (h - top) / 2;
          const P = (q: number, r: number): P2 => [cx + size * Math.sqrt(3) * (q + r / 2), cy + size * 1.5 * r];
          const hexPath = (q: number, r: number, k = 0.94): void => {
            const [x, y] = P(q, r);
            g.beginPath();
            for (let i = 0; i < 6; i++) {
              const a = (Math.PI / 3) * i - Math.PI / 6;
              const px = x + Math.cos(a) * size * k;
              const py = y + Math.sin(a) * size * k;
              if (i) g.lineTo(px, py);
              else g.moveTo(px, py);
            }
            g.closePath();
          };
          // 좌표 모드: 커서가 이웃으로 걸어 다님
          if (mode === 0) {
            walkT -= dt;
            if (walkT <= 0) {
              walkT = 0.7;
              const opts = DIRS.map((d) => [cur[0] + d[0], cur[1] + d[1]] as [number, number]).filter(inside);
              cur = opts[Math.floor(Math.random() * opts.length)]!;
            }
          }
          const fill = new Map<string, string>();
          const key = (c: [number, number]): string => c[0] + ',' + c[1];
          const extra: (() => void)[] = [];
          if (mode === 0) {
            for (const c of cells) {
              const s = -c[0] - c[1];
              const cs = -cur[0] - cur[1];
              if (c[0] === cur[0]) fill.set(key(c), 'rgba(255,107,138,0.28)');
              if (c[1] === cur[1]) fill.set(key(c), 'rgba(95,214,143,0.28)');
              if (s === cs) fill.set(key(c), 'rgba(90,180,255,0.28)');
            }
            fill.set(key(cur), '#ffd54a');
          } else if (mode === 1) {
            fill.set(key(cur), '#ffd54a');
            const n = Math.min(6, Math.floor(mt / 0.35));
            for (let i = 0; i < n; i++) {
              const d = DIRS[i]!;
              const c: [number, number] = [cur[0] + d[0], cur[1] + d[1]];
              fill.set(key(c), '#ffb347');
              extra.push(() => {
                const [x0, y0] = P(cur[0], cur[1]);
                const [x1, y1] = P(c[0], c[1]);
                g.strokeStyle = '#fff';
                g.fillStyle = '#fff';
                g.lineWidth = 1.4 * u;
                arrow(g, x0 + (x1 - x0) * 0.32, y0 + (y1 - y0) * 0.32, x0 + (x1 - x0) * 0.62, y0 + (y1 - y0) * 0.62, 3.5 * u);
                if (!labels || size < 16) return;
                const sg = (v: number): string => (v > 0 ? '+' + v : v < 0 ? '−' + -v : '0');
                txt(g, `${sg(d[0])},${sg(d[1])},${sg(-d[0] - d[1])}`, x1, y1 + size * 0.55, Math.max(7, size * 0.24), '#3a2a00', 'center', 800);
              });
            }
          } else if (mode === 2) {
            const R = mt / 0.4;
            for (const c of cells) {
              const d = dist(c, cur);
              if (d <= R) fill.set(key(c), rgb(rampAt([[0, [255, 214, 74]], [0.5, [255, 140, 70]], [1, [190, 70, 140]]], d / 8)));
            }
          } else if (mode === 3) {
            fill.set(key(cur), '#ffd54a');
            const RR = 3;
            const ring: [number, number][] = [];
            let c: [number, number] = [cur[0] + DIRS[4]![0] * RR, cur[1] + DIRS[4]![1] * RR];
            for (let i = 0; i < 6; i++)
              for (let j = 0; j < RR; j++) {
                ring.push(c);
                c = [c[0] + DIRS[i]![0], c[1] + DIRS[i]![1]];
              }
            const n = Math.min(ring.length, Math.floor(mt / 0.15));
            for (let i = 0; i < n; i++) fill.set(key(ring[i]!), i === n - 1 ? '#fff' : '#ff9f43');
            extra.push(() => {
              g.strokeStyle = 'rgba(255,255,255,0.8)';
              g.lineWidth = 1.5 * u;
              g.beginPath();
              for (let i = 0; i < n; i++) {
                const [x, y] = P(ring[i]![0], ring[i]![1]);
                if (i) g.lineTo(x, y);
                else g.moveTo(x, y);
              }
              g.stroke();
            });
          } else {
            const line = hexLine(A, B);
            const n = Math.min(line.length, Math.floor(mt / 0.22) + 1);
            for (let i = 0; i < n; i++) fill.set(key(line[i]!.c), '#7ee0c3');
            fill.set(key(A), '#ffd54a');
            fill.set(key(B), '#ff6b8a');
            extra.push(() => {
              const [x0, y0] = P(A[0], A[1]);
              const [x1, y1] = P(B[0], B[1]);
              g.strokeStyle = 'rgba(255,255,255,0.85)';
              g.lineWidth = 1.4 * u;
              g.setLineDash([4 * u, 3 * u]);
              g.beginPath();
              g.moveTo(x0, y0);
              g.lineTo(x1, y1);
              g.stroke();
              g.setLineDash([]);
              for (let i = 0; i < n; i++) {
                const [x, y] = P(line[i]!.f[0], line[i]!.f[1]);
                g.beginPath();
                g.arc(x, y, 2.4 * u, 0, TAU);
                g.fillStyle = '#fff';
                g.fill();
              }
            });
          }
          for (const c of cells) {
            hexPath(c[0], c[1]);
            const f = fill.get(key(c));
            g.fillStyle = '#26324f';
            g.fill();
            if (f) {
              g.fillStyle = f;
              g.fill();
            }
            g.strokeStyle = '#3d4d78';
            g.lineWidth = 1;
            g.stroke();
          }
          for (const e of extra) e();
          // 칸 글씨
          if (labels && size >= 17) {
            const fs = Math.max(7, size * 0.31);
            for (const c of cells) {
              const [x, y] = P(c[0], c[1]);
              const s = -c[0] - c[1];
              const f = fill.get(key(c));
              const dark = f !== undefined && f.startsWith('#');
              if (mode === 2 && f) {
                txt(g, String(dist(c, cur)), x, y, size * 0.5, '#2a1400', 'center', 900);
                continue;
              }
              g.globalAlpha = dark ? 1 : 0.92;
              txt(g, String(c[0]), x - size * 0.34, y - size * 0.22, fs, dark ? '#a01838' : QC, 'center', 800);
              txt(g, String(c[1]), x + size * 0.34, y - size * 0.22, fs, dark ? '#156a3a' : RC, 'center', 800);
              txt(g, String(s), x, y + size * 0.36, fs, dark ? '#0f4a8a' : SC, 'center', 800);
              g.globalAlpha = 1;
            }
          }
          // 정보 띠
          const cs = -cur[0] - cur[1];
          let info = '';
          if (mode === 0) info = `(q, r, s) = (${cur[0]}, ${cur[1]}, ${cs}) · 합 0`;
          else if (mode === 1) info = '이웃 = 방향 6개를 더하기';
          else if (mode === 2) info = '거리 = (|Δq| + |Δr| + |Δs|) ÷ 2';
          else if (mode === 3) info = '고리 반지름 3 = 18칸';
          else info = `직선 = 거리 ${dist(A, B)}칸을 고르게 나눠 반올림`;
          pill(g, MODES[mode]!, 8 * u, 12 * u, 8.5 * u, 'rgba(255,213,74,0.95)', '#2a1d00');
          pill(g, info, w - 8 * u, 12 * u, 8 * u, 'rgba(10,14,30,0.85)', '#fff', 'right');
          if (mode === 0 && size < 17) {
            const [x, y] = P(cur[0], cur[1]);
            txt(g, String(cur[0]), x - size * 0.95, y - size * 1.2, 8 * u, QC, 'center', 900);
            txt(g, String(cur[1]), x + size * 0.95, y - size * 1.2, 8 * u, RC, 'center', 900);
            txt(g, String(cs), x, y + size * 1.55, 8 * u, SC, 'center', 900);
          }
        },
        controls: [
          { type: 'toggle', label: '자동 순환', value: true, on: (v) => { auto = v; } },
          { type: 'range', label: '보기 (좌표 · 이웃 · 거리 · 고리 · 직선)', min: 0, max: 4, step: 1, value: 0, on: (v) => { enter(v); } },
          { type: 'toggle', label: '칸 좌표 글씨', value: true, on: (v) => { labels = v; } },
          { type: 'button', label: '다시', on: () => enter(mode) },
        ],
      };
    },
  },

  /* ───────────── i257 아이소메트릭 타일 ───────────── */
  i257: {
    kind: '2d',
    caption: '네모 격자를 45° 돌리고 세로를 반으로 눌러 = 등각 화면 — 블록은 뒤(x+y 작은 쪽)부터 앞으로 그려야 겹침이 맞아요',
    make() {
      const N = 7;
      type Kind = 0 | 1 | 2 | 3 | 4 | 5; // 물 · 모래 · 풀 · 돌 · 집 · 나무
      let kinds: Kind[] = [];
      let hts: number[] = [];
      let ct = 0;
      let speed = 1;
      let wrong = false;
      let showOrder = true;
      const gen = (): void => {
        const seed = Math.floor(Math.random() * 9999);
        kinds = [];
        hts = [];
        for (let y = 0; y < N; y++)
          for (let x = 0; x < N; x++) {
            const e = fbm(x * 0.32 + seed, y * 0.32, seed, 3) + (1 - Math.hypot(x - 3, y - 3) / 4.5) * 0.25;
            let k: Kind = e < 0.42 ? 0 : e < 0.48 ? 1 : e < 0.66 ? 2 : 3;
            const r = hash2(x, y, seed);
            if (k === 2 && r < 0.18) k = 4;
            else if (k === 2 && r < 0.42) k = 5;
            kinds.push(k);
            hts.push(k === 0 ? 0.35 : k === 1 ? 0.6 : k === 3 ? Math.min(2.3, 1.6 + (e - 0.66) * 4) : 1);
          }
      };
      gen();
      const TOP = 0.8;
      const MORPH = 1.2;
      const DROP = 0.055;
      const HOLD = 2.2;
      const total = (): number => TOP + MORPH + N * N * DROP + 0.4 + HOLD;
      const COLS: Record<number, [string, string, string]> = {
        0: ['#58b4ea', '#3a88c0', '#2f72a6'],
        1: ['#f0dba2', '#d1b97c', '#b99f62'],
        2: ['#93d36c', '#62a347', '#4f8a39'],
        3: ['#b2b0bc', '#86848f', '#6e6c78'],
        4: ['#93d36c', '#62a347', '#4f8a39'],
        5: ['#93d36c', '#62a347', '#4f8a39'],
      };
      return {
        draw(g, w, h, t, dt) {
          reset(g);
          ct += Math.min(dt, 0.1) * speed;
          if (ct > total()) {
            ct = 0;
            gen();
          }
          const u = ui(scaleOf(w, h));
          const bg = g.createLinearGradient(0, 0, 0, h);
          bg.addColorStop(0, '#24345a');
          bg.addColorStop(1, '#121a30');
          g.fillStyle = bg;
          g.fillRect(0, 0, w, h);
          const k = ease((ct - TOP) / MORPH);
          const S = Math.min(w / (N * 1.55), (h * 0.9) / (N * (1 - 0.3 * k) + 1.6 * k)) * 0.98;
          const cx = w / 2;
          const cy = h * (0.5 + 0.06 * k);
          const ang = (k * Math.PI) / 4;
          const sy = 1 - 0.5 * k;
          const P = (gx: number, gy: number, z = 0): P2 => {
            const a = (gx - N / 2) * S;
            const b = (gy - N / 2) * S;
            const x = a * Math.cos(ang) - b * Math.sin(ang);
            const y = (a * Math.sin(ang) + b * Math.cos(ang)) * sy;
            return [cx + x, cy + y - z * S * 0.62 * k];
          };
          const quad = (p: P2[], col: string): void => {
            g.beginPath();
            p.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])));
            g.closePath();
            g.fillStyle = col;
            g.fill();
          };
          // 바닥 격자 (돌아가는 판)
          quad([P(0, 0), P(N, 0), P(N, N), P(0, N)], 'rgba(255,255,255,0.05)');
          g.strokeStyle = 'rgba(160,190,255,0.35)';
          g.lineWidth = 1;
          for (let i = 0; i <= N; i++) {
            const a = P(i, 0);
            const b = P(i, N);
            const c = P(0, i);
            const d = P(N, i);
            g.beginPath();
            g.moveTo(a[0], a[1]);
            g.lineTo(b[0], b[1]);
            g.moveTo(c[0], c[1]);
            g.lineTo(d[0], d[1]);
            g.stroke();
          }
          // 블록
          const dropT = ct - TOP - MORPH;
          const order: number[] = [];
          for (let i = 0; i < N * N; i++) order.push(i);
          const depth = (i: number): number => (i % N) + Math.floor(i / N);
          order.sort((a, b) => (wrong ? depth(b) - depth(a) : depth(a) - depth(b)) || a - b);
          const appearOrder = [...order].sort((a, b) => depth(a) - depth(b) || a - b);
          const rank = new Map<number, number>();
          appearOrder.forEach((c, i) => rank.set(c, i));
          for (const c of order) {
            const r = rank.get(c)!;
            const bt = dropT - r * DROP;
            if (bt <= 0) continue;
            const x = c % N;
            const y = Math.floor(c / N);
            const kd = kinds[c]!;
            const fall = Math.max(0, 1 - bt / 0.28);
            const hz = hts[c]!;
            const z0 = fall * fall * 4;
            const [top, left, right] = COLS[kd]!;
            const A = P(x, y, hz + z0);
            const B = P(x + 1, y, hz + z0);
            const C = P(x + 1, y + 1, hz + z0);
            const D = P(x, y + 1, hz + z0);
            const Cb = P(x + 1, y + 1, z0);
            const Db = P(x, y + 1, z0);
            const Bb = P(x + 1, y, z0);
            g.globalAlpha = 1 - fall * 0.6;
            quad([D, C, Cb, Db], left);
            quad([C, B, Bb, Cb], right);
            quad([A, B, C, D], top);
            g.strokeStyle = 'rgba(0,0,0,0.18)';
            g.lineWidth = 0.8;
            g.beginPath();
            g.moveTo(A[0], A[1]);
            g.lineTo(B[0], B[1]);
            g.lineTo(C[0], C[1]);
            g.lineTo(D[0], D[1]);
            g.closePath();
            g.stroke();
            if (kd === 0) {
              const m = P(x + 0.5, y + 0.5, hz + z0);
              g.strokeStyle = 'rgba(255,255,255,0.5)';
              g.lineWidth = 1;
              g.beginPath();
              g.ellipse(m[0], m[1], S * 0.22, S * 0.08, 0, 0, Math.PI);
              g.stroke();
            }
            if (kd === 5) {
              const m = P(x + 0.5, y + 0.5, hz + z0);
              g.fillStyle = '#7a4a28';
              g.fillRect(m[0] - S * 0.05, m[1] - S * 0.35, S * 0.1, S * 0.35);
              g.beginPath();
              g.arc(m[0], m[1] - S * 0.55, S * 0.3, 0, TAU);
              g.fillStyle = '#3f8f3c';
              g.fill();
              g.beginPath();
              g.arc(m[0] - S * 0.09, m[1] - S * 0.64, S * 0.13, 0, TAU);
              g.fillStyle = '#6cc35a';
              g.fill();
            }
            if (kd === 4) {
              const z1 = hz + z0;
              const b2 = P(x + 0.8, y + 0.2, z1 + 0.8);
              const c2b = P(x + 0.8, y + 0.8, z1 + 0.8);
              const d2 = P(x + 0.2, y + 0.8, z1 + 0.8);
              const cbb = P(x + 0.8, y + 0.8, z1);
              const dbb = P(x + 0.2, y + 0.8, z1);
              const bbb = P(x + 0.8, y + 0.2, z1);
              quad([d2, c2b, cbb, dbb], '#efe4cf');
              quad([c2b, b2, bbb, cbb], '#d6c8ad');
              const apex = P(x + 0.5, y + 0.5, z1 + 1.35);
              quad([d2, c2b, apex], '#e0503f');
              quad([c2b, b2, apex], '#b83a2e');
              const door = P(x + 0.5, y + 0.8, z1 + 0.3);
              g.fillStyle = '#7a4a28';
              g.fillRect(door[0] - S * 0.06, door[1] - S * 0.08, S * 0.12, S * 0.2);
            }
            g.globalAlpha = 1;
            if (showOrder && bt < 0.7 && k >= 1) {
              const m = P(x + 0.5, y + 0.5, hz + z0);
              g.globalAlpha = 1 - bt / 0.7;
              txt(g, String(r + 1), m[0], m[1] - S * 0.5, Math.max(8, S * 0.38), '#fff', 'center', 900);
              g.globalAlpha = 1;
            }
          }
          // 커서 칸 · 좌표
          if (dropT < 0) {
            const ci = Math.floor(t * 1.2) % (N * N);
            const x = (ci * 3) % N;
            const y = Math.floor((ci * 5) / N) % N;
            const A = P(x, y);
            const B = P(x + 1, y);
            const C = P(x + 1, y + 1);
            const D = P(x, y + 1);
            g.beginPath();
            g.moveTo(A[0], A[1]);
            g.lineTo(B[0], B[1]);
            g.lineTo(C[0], C[1]);
            g.lineTo(D[0], D[1]);
            g.closePath();
            g.fillStyle = 'rgba(255,213,74,0.55)';
            g.fill();
            g.strokeStyle = '#ffd54a';
            g.lineWidth = 2 * u;
            g.stroke();
            const m = P(x + 0.5, y + 0.5);
            txt(g, `(${x}, ${y})`, m[0], m[1], Math.max(8, S * 0.3), '#fff', 'center', 900);
          }
          const label = ct < TOP ? '① 위에서 본 네모 격자' : ct < TOP + MORPH ? '② 45° 돌리고 세로 ½' : wrong ? '③ 앞에서 뒤로 그리면 — 겹침이 틀려요' : '③ 뒤에서 앞으로 블록 쌓기';
          pill(g, label, 8 * u, 13 * u, 9 * u, 'rgba(10,14,30,0.82)');
          if (w > 420 || k >= 1) {
            g.font = `700 ${7.5 * u}px ${F}`;
            const lines = ['화면 x = (x − y) × 칸폭 ÷ 2', '화면 y = (x + y) × 칸높이 ÷ 2'];
            const bw = 120 * u;
            rr(g, w - bw - 8 * u, h - 30 * u, bw, 24 * u, 5 * u);
            g.fillStyle = 'rgba(10,14,30,0.75)';
            g.fill();
            lines.forEach((s, i) => txt(g, s, w - bw - 2 * u, h - 23.5 * u + i * 11 * u, 7.5 * u, '#cfe0ff', 'left', 700));
          }
        },
        controls: [
          { type: 'button', label: '새 마을', on: () => { ct = 0; gen(); } },
          { type: 'range', label: '속도', min: 0.25, max: 3, step: 0.25, value: 1, on: (v) => { speed = v; } },
          { type: 'toggle', label: '그리는 순서 틀리게 (앞 → 뒤)', value: false, on: (v) => { wrong = v; } },
          { type: 'toggle', label: '그리는 순서 번호', value: true, on: (v) => { showOrder = v; } },
        ],
      };
    },
  },

  /* ───────────── i258 자동 타일 (비트마스크) ───────────── */
  i258: {
    kind: '2d',
    caption: '땅을 칠하면 이웃 4칸(위1 · 오른쪽2 · 아래4 · 왼쪽8)을 더한 수로 가장자리 조각이 저절로 — 끄면 네모 칸 그대로',
    make() {
      const GW = 24;
      const GH = 15;
      let land = new Uint8Array(GW * GH);
      let bx = GW / 2;
      let by = GH / 2;
      let dir = 0;
      let stepN = 0;
      let auto = true;
      let nums = true;
      let rnd = mulberry(1);
      let curCell = -1;
      let painted = new Float32Array(GW * GH);
      let clock = 0;
      const STEPS = 190;
      const run = runner({
        rate: 38,
        hold: 1.8,
        start(seed) {
          rnd = mulberry(seed);
          land = new Uint8Array(GW * GH);
          painted = new Float32Array(GW * GH).fill(-9);
          bx = GW * (0.35 + rnd() * 0.3);
          by = GH * (0.35 + rnd() * 0.3);
          dir = rnd() * TAU;
          stepN = 0;
        },
        step() {
          stepN++;
          if (stepN > STEPS) return true;
          const erase = stepN > STEPS * 0.82;
          dir += (rnd() - 0.5) * 1.3;
          const cxm = GW / 2 - bx;
          const cym = GH / 2 - by;
          dir += Math.sin(Math.atan2(cym, cxm) - dir) * 0.15 * Math.min(1, Math.hypot(cxm, cym) / 6);
          bx = clamp(bx + Math.cos(dir) * 0.8, 1.5, GW - 2.5);
          by = clamp(by + Math.sin(dir) * 0.8, 1.5, GH - 2.5);
          const x = Math.floor(bx);
          const y = Math.floor(by);
          curCell = y * GW + x;
          const set = (i: number): void => {
            if (erase) {
              if (land[i]) {
                land[i] = 0;
                painted[i] = clock;
              }
            } else if (!land[i]) {
              land[i] = 1;
              painted[i] = clock;
            }
          };
          set(curCell);
          if (!erase && rnd() < 0.7) {
            const d = [1, -1, GW, -GW][Math.floor(rnd() * 4)]!;
            const j = curCell + d;
            if (j >= 0 && j < GW * GH) set(j);
          }
          return false;
        },
      });
      run.restart();
      const L = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < GW && y < GH && land[y * GW + x] === 1;
      const maskOf = (x: number, y: number): number => (L(x, y - 1) ? 1 : 0) | (L(x + 1, y) ? 2 : 0) | (L(x, y + 1) ? 4 : 0) | (L(x - 1, y) ? 8 : 0);
      /** 땅 한 칸 모양: 드러난 쪽만 e 만큼 늘이고(음수면 줄이고), 두 쪽이 드러난 모서리는 둥글게 */
      const shape = (g: G, x: number, y: number, X: number, Y: number, s: number, e: number, r: number): void => {
        const m = maskOf(x, y);
        const n = !(m & 1);
        const ea = !(m & 2);
        const so = !(m & 4);
        const we = !(m & 8);
        const x0 = X - (we ? e : 0);
        const x1 = X + s + (ea ? e : 0);
        const y0 = Y - (n ? e : 0);
        const y1 = Y + s + (so ? e : 0);
        g.beginPath();
        g.roundRect(x0, y0, x1 - x0, y1 - y0, [n && we ? r : 0, n && ea ? r : 0, so && ea ? r : 0, so && we ? r : 0]);
        g.fill();
      };
      /** 오목한 모서리(양옆은 땅, 대각선은 물) 메우기 · 깎기 */
      const concave = (g: G, x: number, y: number, X: number, Y: number, s: number, e: number): void => {
        const corners: [number, number][] = [
          [1, -1],
          [1, 1],
          [-1, 1],
          [-1, -1],
        ];
        for (const [dx, dy] of corners) {
          if (!(L(x + dx, y) && L(x, y + dy) && !L(x + dx, y + dy))) continue;
          const cx = dx > 0 ? X + s : X;
          const cy = dy > 0 ? Y + s : Y;
          if (e > 0) g.fillRect(dx > 0 ? cx : cx - e, dy > 0 ? cy : cy - e, e, e);
          else {
            const i = -e;
            g.fillRect(dx > 0 ? cx - i : cx, dy > 0 ? cy - i : cy, i, i);
          }
        }
      };
      let water = mkCanvas(1, 1);
      let ww = 0;
      let wh = 0;
      return {
        draw(g, w, h, t, dt) {
          reset(g);
          clock += dt;
          run.tick(dt);
          const u = ui(scaleOf(w, h));
          const s = Math.min(w / GW, h / GH);
          const ox = (w - GW * s) / 2;
          const oy = (h - GH * s) / 2;
          if (ww !== Math.round(w) || wh !== Math.round(h)) {
            ww = Math.round(w);
            wh = Math.round(h);
            water = mkCanvas(ww, wh);
            const wg = c2(water);
            const gr = wg.createLinearGradient(0, 0, 0, wh);
            gr.addColorStop(0, '#3fa6d8');
            gr.addColorStop(1, '#2a7fb8');
            wg.fillStyle = gr;
            wg.fillRect(0, 0, ww, wh);
            wg.strokeStyle = 'rgba(255,255,255,0.16)';
            wg.lineWidth = 1.2;
            const r = mulberry(4);
            for (let k = 0; k < 90; k++) {
              const x = r() * ww;
              const y = r() * wh;
              const L2 = 6 + r() * 10;
              wg.beginPath();
              wg.moveTo(x, y);
              wg.quadraticCurveTo(x + L2 / 2, y - 3, x + L2, y);
              wg.stroke();
            }
          }
          g.drawImage(water, 0, 0, w, h);
          const cellXY = (i: number): [number, number, number, number] => {
            const x = i % GW;
            const y = (i / GW) | 0;
            return [x, y, ox + x * s, oy + y * s];
          };
          const list: number[] = [];
          for (let i = 0; i < GW * GH; i++) if (land[i]) list.push(i);
          if (auto) {
            const layers: [string, number, number][] = [
              ['rgba(255,255,255,0.55)', s * 0.24, s * 0.5],
              ['#e9d39a', s * 0.1, s * 0.38],
              ['#7fc45c', -s * 0.14, s * 0.26],
            ];
            for (const [col, e, r] of layers) {
              g.fillStyle = col;
              for (const i of list) {
                const [x, y, X, Y] = cellXY(i);
                shape(g, x, y, X, Y, s, e, r);
              }
              for (const i of list) {
                const [x, y, X, Y] = cellXY(i);
                if (e < 0) g.fillStyle = '#e9d39a';
                concave(g, x, y, X, Y, s, e);
                g.fillStyle = col;
              }
            }
            // 풀 무늬
            for (const i of list) {
              const [x, y, X, Y] = cellXY(i);
              if (maskOf(x, y) !== 15) continue;
              const n = hash2(x, y, 5);
              if (n < 0.35) {
                g.fillStyle = '#5ea844';
                g.beginPath();
                g.arc(X + s * (0.3 + n), Y + s * 0.5, s * 0.12, 0, TAU);
                g.fill();
              } else if (n > 0.85) {
                g.fillStyle = '#fff6a8';
                g.beginPath();
                g.arc(X + s * 0.5, Y + s * 0.5, s * 0.07, 0, TAU);
                g.fill();
              }
            }
          } else {
            g.fillStyle = '#7fc45c';
            for (const i of list) {
              const [, , X, Y] = cellXY(i);
              g.fillRect(X, Y, s, s);
            }
            g.strokeStyle = 'rgba(0,0,0,0.12)';
            for (const i of list) {
              const [, , X, Y] = cellXY(i);
              g.strokeRect(X + 0.5, Y + 0.5, s - 1, s - 1);
            }
          }
          // 막 칠한 칸 반짝
          for (const i of list) {
            const k = 1 - (clock - painted[i]!) / 0.4;
            if (k <= 0) continue;
            const [, , X, Y] = cellXY(i);
            g.fillStyle = `rgba(255,255,255,${k * 0.6})`;
            g.fillRect(X, Y, s, s);
          }
          if (nums && s >= 9) {
            for (const i of list) {
              const [x, y, X, Y] = cellXY(i);
              txt(g, String(maskOf(x, y)), X + s / 2, Y + s / 2 + 0.5, Math.max(6, s * 0.36), 'rgba(30,60,20,0.75)', 'center', 800);
            }
          }
          // 붓
          if (!run.holding && curCell >= 0) {
            const erase = stepN > STEPS * 0.82;
            const [, , X, Y] = cellXY(curCell);
            g.strokeStyle = erase ? '#ff6b6b' : '#ffe14d';
            g.lineWidth = 2 * u;
            g.strokeRect(X - 1, Y - 1, s + 2, s + 2);
            const px = X + s * 0.9;
            const py = Y - s * 0.2;
            g.save();
            g.translate(px, py);
            g.rotate(0.7 + Math.sin(t * 10) * 0.08);
            g.fillStyle = erase ? '#ff9aa0' : '#8a5a34';
            g.fillRect(-s * 0.12, -s * 1.3, s * 0.24, s * 1.1);
            g.fillStyle = erase ? '#fff' : '#7fc45c';
            g.beginPath();
            g.ellipse(0, -s * 0.12, s * 0.16, s * 0.24, 0, 0, TAU);
            g.fill();
            g.restore();
          }
          // 계산 창: 지금 칸의 이웃 → 수
          if (curCell >= 0 && land[curCell]) {
            const x = curCell % GW;
            const y = (curCell / GW) | 0;
            const m = maskOf(x, y);
            const cs = 9 * u;
            const bw = cs * 3 + 64 * u;
            const bx0 = w - bw - 6 * u;
            const by0 = h - cs * 3 - 14 * u;
            rr(g, bx0, by0, bw, cs * 3 + 8 * u, 5 * u);
            g.fillStyle = 'rgba(10,20,40,0.85)';
            g.fill();
            const cells: [number, number, number][] = [
              [0, -1, 1],
              [1, 0, 2],
              [0, 1, 4],
              [-1, 0, 8],
            ];
            g.fillStyle = '#ffe14d';
            g.fillRect(bx0 + 4 * u + cs, by0 + 4 * u + cs, cs - 1, cs - 1);
            const parts: string[] = [];
            for (const [dx, dy, b] of cells) {
              const on = L(x + dx, y + dy);
              g.fillStyle = on ? '#7fc45c' : '#3a88c8';
              g.fillRect(bx0 + 4 * u + (dx + 1) * cs, by0 + 4 * u + (dy + 1) * cs, cs - 1, cs - 1);
              txt(g, String(b), bx0 + 4 * u + (dx + 1.5) * cs, by0 + 4 * u + (dy + 1.5) * cs, 6 * u, on ? '#183008' : '#cfe8ff', 'center', 800);
              if (on) parts.push(String(b));
            }
            txt(g, parts.length ? parts.join('+') : '0', bx0 + cs * 3 + 10 * u, by0 + 4 * u + cs * 0.9, 8 * u, '#cfe0ff', 'left', 700);
            txt(g, `= ${m}번 조각`, bx0 + cs * 3 + 10 * u, by0 + 4 * u + cs * 2.1, 8.5 * u, '#ffe14d', 'left', 900);
          }
          pill(g, auto ? '자동 타일 켜짐 — 수에 맞는 가장자리 조각' : '자동 타일 꺼짐 — 네모 칸만', 8 * u, 12 * u, 8.5 * u, 'rgba(10,20,40,0.82)');
        },
        controls: [
          seedCtl(run),
          speedCtl(run),
          { type: 'toggle', label: '자동 타일', value: true, on: (v) => { auto = v; } },
          { type: 'toggle', label: '칸마다 비트 수', value: true, on: (v) => { nums = v; } },
        ],
      };
    },
  },
  /* ───────────── i259 마칭 스퀘어 ───────────── */
  i259: {
    kind: '2d',
    caption: '칸 네 귀가 기준보다 높은지(●) 낮은지(○)로 16가지 조각 — 칸을 하나씩 훑으며 이으면 매끈한 해안선 · 등고선',
    make() {
      let GX = 28;
      let GY = 17;
      let f = new Float32Array(0);
      let levels = 1;
      let interp = true;
      let caseNum = true;
      let p = 0;
      let heat = mkCanvas(1, 1);
      const run = runner({
        rate: 200,
        hold: 1.8,
        start(seed) {
          GY = Math.round(GX * 0.62);
          const r = mulberry(seed);
          const blobs: [number, number, number, number][] = [];
          const nb = 5 + Math.floor(r() * 4);
          for (let k = 0; k < nb; k++) blobs.push([r() * GX, r() * GY, (0.12 + r() * 0.2) * GX, k < 2 ? -0.5 : 0.55 + r() * 0.5]);
          f = new Float32Array((GX + 1) * (GY + 1));
          for (let y = 0; y <= GY; y++)
            for (let x = 0; x <= GX; x++) {
              let v = 0.18;
              for (const [bx, by, br, a] of blobs) v += a * Math.exp(-((x - bx) ** 2 + (y - by) ** 2) / (br * br));
              v += (fbm((x / GX) * 4 + seed, (y / GX) * 4, seed, 3) - 0.5) * 0.35;
              f[y * (GX + 1) + x] = v;
            }
          // 땅이 절반쯤 되게 값 펴기 (가운데값 → 0.5)
          {
            const so = Array.from(f).sort((a, b) => a - b);
            const q = (k: number): number => so[Math.floor(k * (so.length - 1))]!;
            const mid = q(0.52);
            const sc = 0.8 / Math.max(1e-6, q(0.92) - q(0.08));
            for (let i = 0; i < f.length; i++) f[i] = 0.5 + (f[i]! - mid) * sc;
          }
          heat = mkCanvas(GX + 1, GY + 1);
          const hg = c2(heat);
          const im = hg.createImageData(GX + 1, GY + 1);
          for (let i = 0; i < f.length; i++) {
            const c = rampAt(
              [
                [-0.2, [20, 40, 90]],
                [0.4, [40, 90, 140]],
                [0.6, [70, 140, 110]],
                [1.1, [200, 190, 140]],
              ],
              f[i]!,
            );
            im.data[i * 4] = c[0];
            im.data[i * 4 + 1] = c[1];
            im.data[i * 4 + 2] = c[2];
            im.data[i * 4 + 3] = 255;
          }
          hg.putImageData(im, 0, 0);
          p = 0;
        },
        step() {
          p += Math.max(1, Math.round((GX * GY) / 476));
          return p >= GX * GY + GX;
        },
      });
      run.restart();
      const ths = (): number[] => (levels === 1 ? [0.5] : Array.from({ length: levels }, (_, i) => 0.3 + (i * 0.62) / Math.max(1, levels - 1)));
      const BAND: V3[] = [hexV('#7fc45c'), hexV('#a9cf6a'), hexV('#d9c780'), hexV('#c39a6b'), hexV('#ece7e0')];
      return {
        draw(g, w, h, t, dt) {
          reset(g);
          run.tick(dt);
          const u = ui(scaleOf(w, h));
          g.fillStyle = '#0e1828';
          g.fillRect(0, 0, w, h);
          const cs = Math.min((w - 8) / GX, (h - 8) / GY);
          const ox = (w - GX * cs) / 2;
          const oy = (h - GY * cs) / 2;
          g.globalAlpha = 0.55;
          g.imageSmoothingEnabled = true;
          g.drawImage(heat, ox - cs / 2, oy - cs / 2, (GX + 1) * cs, (GY + 1) * cs);
          g.globalAlpha = 1;
          const V = (x: number, y: number): number => f[y * (GX + 1) + x]!;
          const done = Math.min(GX * GY, p);
          const TH = ths();
          const segs: P2[][] = TH.map(() => []);
          TH.forEach((th, li) => {
            g.beginPath();
            for (let c = 0; c < done; c++) {
              const x = c % GX;
              const y = (c / GX) | 0;
              const cv: [number, number, number][] = [
                [x, y, V(x, y)],
                [x + 1, y, V(x + 1, y)],
                [x + 1, y + 1, V(x + 1, y + 1)],
                [x, y + 1, V(x, y + 1)],
              ];
              const poly: P2[] = [];
              const cross: P2[] = [];
              for (let k = 0; k < 4; k++) {
                const a = cv[k]!;
                const b = cv[(k + 1) % 4]!;
                if (a[2] >= th) poly.push([ox + a[0] * cs, oy + a[1] * cs]);
                if (a[2] >= th !== b[2] >= th) {
                  const tt = interp ? (th - a[2]) / (b[2] - a[2]) : 0.5;
                  const q: P2 = [ox + lerp(a[0], b[0], tt) * cs, oy + lerp(a[1], b[1], tt) * cs];
                  poly.push(q);
                  cross.push(q);
                }
              }
              if (poly.length >= 3) {
                poly.forEach((q, k) => (k ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])));
                g.closePath();
              }
              for (let k = 0; k + 1 < cross.length; k += 2) segs[li]!.push(cross[k]!, cross[k + 1]!);
            }
            g.fillStyle = rgb(BAND[Math.min(BAND.length - 1, levels === 1 ? 0 : Math.round((li / Math.max(1, levels - 1)) * (BAND.length - 1)))]!, levels === 1 ? 0.92 : 0.9);
            g.fill();
          });
          // 선
          g.lineCap = 'round';
          segs.forEach((list, li) => {
            g.beginPath();
            for (let k = 0; k + 1 < list.length; k += 2) {
              g.moveTo(list[k]![0], list[k]![1]);
              g.lineTo(list[k + 1]![0], list[k + 1]![1]);
            }
            g.strokeStyle = levels === 1 ? '#fffbe8' : li === 0 ? '#fffbe8' : 'rgba(70,45,20,0.8)';
            g.lineWidth = (levels === 1 ? 2.2 : 1.4) * u;
            g.stroke();
          });
          // 격자 · 귀 점
          g.strokeStyle = 'rgba(255,255,255,0.08)';
          g.lineWidth = 1;
          g.beginPath();
          for (let x = 0; x <= GX; x++) {
            g.moveTo(ox + x * cs, oy);
            g.lineTo(ox + x * cs, oy + GY * cs);
          }
          for (let y = 0; y <= GY; y++) {
            g.moveTo(ox, oy + y * cs);
            g.lineTo(ox + GX * cs, oy + y * cs);
          }
          g.stroke();
          if (levels === 1 && cs >= 7) {
            const r = Math.max(1.2, cs * 0.12);
            for (let y = 0; y <= GY; y++)
              for (let x = 0; x <= GX; x++) {
                const on = V(x, y) >= 0.5;
                g.beginPath();
                g.arc(ox + x * cs, oy + y * cs, r, 0, TAU);
                if (on) {
                  g.fillStyle = 'rgba(255,255,255,0.85)';
                  g.fill();
                } else {
                  g.strokeStyle = 'rgba(255,255,255,0.35)';
                  g.lineWidth = 1;
                  g.stroke();
                }
              }
          }
          // 칸 번호
          if (caseNum && levels === 1 && cs >= 15) {
            for (let c = 0; c < done; c++) {
              const x = c % GX;
              const y = (c / GX) | 0;
              const n = (V(x, y) >= 0.5 ? 8 : 0) + (V(x + 1, y) >= 0.5 ? 4 : 0) + (V(x + 1, y + 1) >= 0.5 ? 2 : 0) + (V(x, y + 1) >= 0.5 ? 1 : 0);
              if (n === 0 || n === 15) continue;
              txt(g, String(n), ox + (x + 0.5) * cs, oy + (y + 0.5) * cs, cs * 0.34, 'rgba(20,40,20,0.75)', 'center', 800);
            }
          }
          // 지금 훑는 칸
          if (p < GX * GY && !run.holding) {
            const x = p % GX;
            const y = (p / GX) | 0;
            const n = (V(x, y) >= 0.5 ? 8 : 0) + (V(x + 1, y) >= 0.5 ? 4 : 0) + (V(x + 1, y + 1) >= 0.5 ? 2 : 0) + (V(x, y + 1) >= 0.5 ? 1 : 0);
            g.fillStyle = 'rgba(255,225,77,0.25)';
            g.fillRect(ox, oy + y * cs, GX * cs, cs);
            g.strokeStyle = '#ffe14d';
            g.lineWidth = 2 * u;
            g.strokeRect(ox + x * cs, oy + y * cs, cs, cs);
            if (levels === 1) {
              const bits = n.toString(2).padStart(4, '0');
              pill(g, `조각 ${bits} = ${n}번`, Math.min(w - 70 * u, ox + (x + 1) * cs + 4 * u), oy + y * cs - 6 * u + (y < 2 ? 22 * u : 0), 7.5 * u, 'rgba(255,225,77,0.95)', '#2a1d00');
            }
          }
          const label = run.holding ? (levels === 1 ? '해안선 완성' : `등고선 ${levels}개 완성`) : `칸 훑기 ${done} / ${GX * GY}`;
          pill(g, label, 8 * u, 13 * u, 9 * u, 'rgba(10,16,30,0.85)');
          void t;
        },
        controls: [
          seedCtl(run),
          speedCtl(run),
          { type: 'toggle', label: '가장자리 보간 (끄면 칸 가운데 → 계단)', value: true, on: (v) => { interp = v; } },
          { type: 'range', label: '등고선 개수', min: 1, max: 5, step: 1, value: 1, on: (v) => { levels = v; } },
          { type: 'range', label: '격자 칸 수', min: 12, max: 48, step: 2, value: 28, on: (v) => { GX = v; run.restart(run.seed); } },
          { type: 'toggle', label: '조각 번호', value: true, on: (v) => { caseNum = v; } },
        ],
      };
    },
  },

  /* ───────────── i260 좌표평면 보물 지도 ───────────── */
  i260: {
    kind: '2d',
    caption: '배가 (+3, −2) 처럼 이동 화살표(벡터)대로 움직이고, 닿은 곳마다 (x, y) 좌표 — 마지막 자리에 보물!',
    make() {
      const XR = 8;
      const YR = 5;
      let pts: P2[] = [];
      let ct = 0;
      let speed = 1;
      let quads = true;
      let guides = true;
      let islands: [number, number, number, number][] = [];
      const MOVE = 2.1;
      const gen = (): void => {
        const r = Math.random;
        const ri = (a: number, b: number): number => a + Math.floor(r() * (b - a + 1));
        pts = [[ri(-6, -2), ri(-3, 3)]];
        while (pts.length < 5) {
          const c = pts[pts.length - 1]!;
          const n: P2 = [c[0] + ri(-5, 5), c[1] + ri(-4, 4)];
          if (Math.abs(n[0]) > XR - 1 || Math.abs(n[1]) > YR - 1 || (n[0] === c[0] && n[1] === c[1]) || Math.abs(n[0] - c[0]) + Math.abs(n[1] - c[1]) < 3) continue;
          pts.push(n);
        }
        islands = [];
        for (let k = 0; k < 5; k++) islands.push([(r() * 2 - 1) * XR * 0.85, (r() * 2 - 1) * YR * 0.8, 0.7 + r() * 1.1, r() * 100]);
        ct = 0;
      };
      gen();
      const total = (): number => (pts.length - 1) * MOVE + 3;
      const sg = (v: number): string => (v > 0 ? '+' + v : v < 0 ? '−' + -v : '0');
      const num = (v: number): string => (v < 0 ? '−' + -v : String(v));
      return {
        draw(g, w, h, t, dt) {
          reset(g);
          ct += Math.min(dt, 0.1) * speed;
          if (ct > total()) gen();
          const u = ui(scaleOf(w, h));
          // 양피지
          const bg = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) * 0.6);
          bg.addColorStop(0, '#f6ead0');
          bg.addColorStop(1, '#d9bf8c');
          g.fillStyle = bg;
          g.fillRect(0, 0, w, h);
          const cell = Math.min((w - 16 * u) / (XR * 2), (h - 16 * u) / (YR * 2));
          const cx = w / 2;
          const cy = h / 2;
          const S = (x: number, y: number): P2 => [cx + x * cell, cy - y * cell];
          // 바다 물결 무늬 · 섬
          g.fillStyle = 'rgba(70,140,170,0.18)';
          g.fillRect(cx - XR * cell, cy - YR * cell, XR * 2 * cell, YR * 2 * cell);
          for (const [ix, iy, ir, is] of islands) {
            const [x, y] = S(ix, iy);
            const blobP = (sc: number, sd: number): void => {
              g.beginPath();
              for (let k = 0; k <= 40; k++) {
                const a = (k / 40) * TAU;
                const rr2 = ir * cell * sc * (0.7 + vnoise(Math.cos(a) * 1.6 + is, Math.sin(a) * 1.6 + sd, 3) * 0.45 + vnoise(Math.cos(a) * 4 + is, Math.sin(a) * 4, 5) * 0.15);
                const px = x + Math.cos(a) * rr2;
                const py = y + Math.sin(a) * rr2 * 0.8;
                if (k) g.lineTo(px, py);
                else g.moveTo(px, py);
              }
              g.closePath();
            };
            blobP(1.25, 0);
            g.setLineDash([2, 3]);
            g.strokeStyle = 'rgba(70,120,140,0.45)';
            g.lineWidth = 1;
            g.stroke();
            g.setLineDash([]);
            blobP(1, 0);
            g.fillStyle = '#e2cb92';
            g.fill();
            g.strokeStyle = 'rgba(110,80,40,0.7)';
            g.lineWidth = 1.2;
            g.stroke();
            blobP(0.68, 0.3);
            g.fillStyle = 'rgba(132,170,96,0.85)';
            g.fill();
            // 산 표시
            g.strokeStyle = 'rgba(90,70,40,0.7)';
            g.lineWidth = 1.1;
            for (let k = 0; k < 2; k++) {
              const mx = x + (k - 0.5) * ir * cell * 0.45;
              const my = y - ir * cell * 0.05 * (k + 1);
              const ms = ir * cell * 0.22;
              g.beginPath();
              g.moveTo(mx - ms, my + ms * 0.5);
              g.lineTo(mx, my - ms * 0.5);
              g.lineTo(mx + ms, my + ms * 0.5);
              g.stroke();
            }
          }
          // 사분면
          const cur = (() => {
            const i = Math.min(pts.length - 1, Math.floor(ct / MOVE));
            const k = clamp01((ct - i * MOVE - 0.55) / 0.85);
            const a = pts[i]!;
            const b = pts[Math.min(pts.length - 1, i + 1)]!;
            return { i, k, x: lerp(a[0], b[0], ease(k)), y: lerp(a[1], b[1], ease(k)) };
          })();
          if (quads) {
            const qn = cur.x > 0 && cur.y > 0 ? 1 : cur.x < 0 && cur.y > 0 ? 2 : cur.x < 0 && cur.y < 0 ? 3 : cur.x > 0 && cur.y < 0 ? 4 : 0;
            const Q: [number, number, string, string][] = [
              [1, 1, '제1사분면', '(+, +)'],
              [-1, 1, '제2사분면', '(−, +)'],
              [-1, -1, '제3사분면', '(−, −)'],
              [1, -1, '제4사분면', '(+, −)'],
            ];
            Q.forEach(([sx, sy, name, sgn], qi) => {
              const on = qn === qi + 1;
              if (on) {
                g.fillStyle = 'rgba(255,200,60,0.16)';
                g.fillRect(sx > 0 ? cx : cx - XR * cell, sy > 0 ? cy - YR * cell : cy, XR * cell, YR * cell);
              }
              const [lx, ly] = S(sx * XR * 0.5, sy * YR * 0.62);
              txt(g, name, lx, ly, 9 * u, on ? 'rgba(140,80,0,0.7)' : 'rgba(90,60,30,0.25)', 'center', 900);
              txt(g, sgn, lx, ly + 10 * u, 8 * u, on ? 'rgba(140,80,0,0.7)' : 'rgba(90,60,30,0.25)', 'center', 800);
            });
          }
          // 모눈 · 축
          g.strokeStyle = 'rgba(110,80,40,0.22)';
          g.lineWidth = 1;
          g.beginPath();
          for (let x = -XR; x <= XR; x++) {
            const [px] = S(x, 0);
            g.moveTo(px, cy - YR * cell);
            g.lineTo(px, cy + YR * cell);
          }
          for (let y = -YR; y <= YR; y++) {
            const [, py] = S(0, y);
            g.moveTo(cx - XR * cell, py);
            g.lineTo(cx + XR * cell, py);
          }
          g.stroke();
          g.strokeStyle = '#4a3218';
          g.fillStyle = '#4a3218';
          g.lineWidth = 1.6 * u;
          arrow(g, cx - XR * cell, cy, cx + XR * cell + 2 * u, cy, 5 * u);
          arrow(g, cx, cy + YR * cell, cx, cy - YR * cell - 2 * u, 5 * u);
          txt(g, 'x', cx + XR * cell - 4 * u, cy - 7 * u, 9 * u, '#4a3218', 'center', 800);
          txt(g, 'y', cx + 7 * u, cy - YR * cell + 4 * u, 9 * u, '#4a3218', 'center', 800);
          const every = cell >= 14 ? 1 : 2;
          for (let x = -XR + 1; x < XR; x++) if (x && x % every === 0) txt(g, num(x), S(x, 0)[0], cy + 7 * u, 6.5 * u, '#6a4a28', 'center', 700);
          for (let y = -YR + 1; y < YR; y++) if (y && y % every === 0) txt(g, num(y), cx - 7 * u, S(0, y)[1], 6.5 * u, '#6a4a28', 'center', 700);
          txt(g, 'O', cx - 6 * u, cy + 7 * u, 6.5 * u, '#6a4a28', 'center', 800);
          // 지나온 길
          g.setLineDash([3 * u, 3 * u]);
          g.strokeStyle = 'rgba(160,40,30,0.7)';
          g.lineWidth = 1.6 * u;
          g.beginPath();
          for (let i = 0; i <= cur.i; i++) {
            const p = i < cur.i ? pts[i]! : ([cur.x, cur.y] as P2);
            const [px, py] = S(p[0], p[1]);
            if (i) g.lineTo(px, py);
            else g.moveTo(px, py);
          }
          if (cur.i > 0 || cur.k > 0) {
            const [px, py] = S(cur.x, cur.y);
            g.lineTo(px, py);
          }
          g.stroke();
          g.setLineDash([]);
          // 지난 점 이름
          for (let i = 0; i <= cur.i; i++) {
            const p = pts[i]!;
            if (i === cur.i && cur.k > 0) continue;
            const [px, py] = S(p[0], p[1]);
            g.beginPath();
            g.arc(px, py, 2.6 * u, 0, TAU);
            g.fillStyle = '#a0281e';
            g.fill();
            if (i < cur.i) txt(g, `(${num(p[0])}, ${num(p[1])})`, px, py - 8 * u, 7 * u, 'rgba(90,40,20,0.7)', 'center', 800);
          }
          const last = pts.length - 1;
          const end = cur.i >= last;
          // 이동 벡터
          if (!end) {
            const a = pts[cur.i]!;
            const b = pts[cur.i + 1]!;
            const k = clamp01((ct - cur.i * MOVE) / 0.5);
            const [ax, ay] = S(a[0], a[1]);
            const [bx, by] = S(lerp(a[0], b[0], ease(k)), lerp(a[1], b[1], ease(k)));
            g.strokeStyle = '#1f6fd1';
            g.fillStyle = '#1f6fd1';
            g.lineWidth = 2.2 * u;
            if (k > 0.05) arrow(g, ax, ay, bx, by, 6 * u);
            const [mx, my] = S((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
            if (k > 0.3) pill(g, `(${sg(b[0] - a[0])}, ${sg(b[1] - a[1])})`, mx, my - 10 * u, 8 * u, 'rgba(31,111,209,0.92)', '#fff', 'center');
          }
          // 안내선 (축까지 점선)
          if (guides) {
            const [px, py] = S(cur.x, cur.y);
            g.setLineDash([2 * u, 2.5 * u]);
            g.strokeStyle = 'rgba(31,111,209,0.75)';
            g.lineWidth = 1.2 * u;
            g.beginPath();
            g.moveTo(px, py);
            g.lineTo(px, cy);
            g.moveTo(px, py);
            g.lineTo(cx, py);
            g.stroke();
            g.setLineDash([]);
          }
          // 보물
          if (end) {
            const p = pts[last]!;
            const [px, py] = S(p[0], p[1]);
            const k = ease(clamp01((ct - last * MOVE) / 0.5));
            g.strokeStyle = '#c0392b';
            g.lineWidth = 3 * u;
            g.lineCap = 'round';
            const R = 7 * u * k;
            g.beginPath();
            g.moveTo(px - R, py - R);
            g.lineTo(px + R, py + R);
            g.moveTo(px + R, py - R);
            g.lineTo(px - R, py + R);
            g.stroke();
            g.globalCompositeOperation = 'lighter';
            const gr = g.createRadialGradient(px, py, 0, px, py, 22 * u);
            gr.addColorStop(0, `rgba(255,210,80,${0.6 * k})`);
            gr.addColorStop(1, 'rgba(255,160,40,0)');
            g.fillStyle = gr;
            g.fillRect(px - 22 * u, py - 22 * u, 44 * u, 44 * u);
            g.globalCompositeOperation = 'source-over';
            pill(g, `보물 (${num(p[0])}, ${num(p[1])})!`, px, py - 16 * u, 9 * u, 'rgba(192,57,43,0.95)', '#fff', 'center');
          }
          // 배
          {
            const [px, py] = S(cur.x, cur.y);
            const bob = Math.sin(t * 4) * 1.2 * u;
            g.save();
            g.translate(px, py - 4 * u + bob);
            g.fillStyle = 'rgba(40,30,20,0.25)';
            g.beginPath();
            g.ellipse(0, 5.5 * u, 9 * u, 2.2 * u, 0, 0, TAU);
            g.fill();
            g.fillStyle = '#7a4a24';
            g.beginPath();
            g.moveTo(-9 * u, 0);
            g.lineTo(9 * u, 0);
            g.lineTo(6 * u, 5 * u);
            g.lineTo(-6 * u, 5 * u);
            g.closePath();
            g.fill();
            g.fillStyle = '#4a2a10';
            g.fillRect(-0.7 * u, -13 * u, 1.4 * u, 13 * u);
            g.fillStyle = '#fffaf0';
            g.beginPath();
            g.moveTo(0.8 * u, -12 * u);
            g.quadraticCurveTo(8 * u, -6 * u, 0.8 * u, -1.5 * u);
            g.closePath();
            g.fill();
            g.fillStyle = '#c0392b';
            g.beginPath();
            g.moveTo(0.7 * u, -13 * u);
            g.lineTo(5 * u, -11.5 * u);
            g.lineTo(0.7 * u, -10 * u);
            g.fill();
            g.restore();
          }
          if (!end && cur.k >= 1) {
            const [px, py] = S(cur.x, cur.y);
            pill(g, `(${num(Math.round(cur.x))}, ${num(Math.round(cur.y))})`, px, py + 14 * u, 8.5 * u, 'rgba(60,35,15,0.9)', '#ffe9b0', 'center');
          }
          if (cur.i === 0 && cur.k === 0) {
            const [px, py] = S(pts[0]![0], pts[0]![1]);
            pill(g, `출발 (${num(pts[0]![0])}, ${num(pts[0]![1])})`, px, py + 14 * u, 8.5 * u, 'rgba(60,35,15,0.9)', '#ffe9b0', 'center');
          }
          vignette(g, w, h, 0.3);
        },
        controls: [
          { type: 'button', label: '새 보물 지도', on: () => gen() },
          { type: 'range', label: '속도', min: 0.25, max: 3, step: 0.25, value: 1, on: (v) => { speed = v; } },
          { type: 'toggle', label: '사분면 표시', value: true, on: (v) => { quads = v; } },
          { type: 'toggle', label: '축까지 안내선', value: true, on: (v) => { guides = v; } },
        ],
      };
    },
  },

  /* ───────────── i261 지도 투영 ───────────── */
  i261: {
    kind: '2d',
    caption: '같은 지구를 등거리 원통 → 메르카토르 → 몰바이데로 펴기 — 빨간 원은 지구 위에서 모두 같은 크기, 그린란드가 아프리카만큼 커져요',
    make() {
      const MAXLAT = 82;
      type Proj = (lon: number, lat: number) => P2;
      const R = Math.PI / 180;
      const moll = (lon: number, lat: number): P2 => {
        const ph = clamp(lat, -89.999, 89.999) * R;
        let th = ph;
        for (let i = 0; i < 12; i++) {
          const d = (2 * th + Math.sin(2 * th) - Math.PI * Math.sin(ph)) / (2 + 2 * Math.cos(2 * th));
          th -= d;
          if (Math.abs(d) < 1e-7) break;
        }
        return [((2 * Math.SQRT2) / Math.PI) * lon * R * Math.cos(th), Math.SQRT2 * Math.sin(th)];
      };
      const PROJ: { name: string; f: Proj }[] = [
        { name: '등거리 원통 (위도 · 경도 그대로)', f: (lon, lat) => [lon * R, lat * R] },
        { name: '메르카토르 (각도는 그대로, 극으로 갈수록 커짐)', f: (lon, lat) => [lon * R, Math.log(Math.tan(Math.PI / 4 + (clamp(lat, -MAXLAT, MAXLAT) * R) / 2))] },
        { name: '몰바이데 (넓이는 그대로)', f: moll },
      ];
      const lands = WORLD.map((l) => ({ name: l.name, ice: !!l.ice, pts: densify(l.pts.map((p) => [p[0], clamp(p[1], -MAXLAT, MAXLAT)] as LL), 2) }));
      const grat: LL[][] = [];
      for (let lon = -180; lon <= 180; lon += 30) {
        const line: LL[] = [];
        for (let lat = -MAXLAT; lat <= MAXLAT; lat += 2) line.push([lon, lat]);
        grat.push(line);
      }
      for (let lat = -60; lat <= 60; lat += 30) {
        const line: LL[] = [];
        for (let lon = -180; lon <= 180; lon += 3) line.push([lon, lat]);
        grat.push(line);
      }
      const frame: LL[] = [];
      for (let lon = -180; lon <= 180; lon += 3) frame.push([lon, MAXLAT]);
      for (let lat = MAXLAT; lat >= -MAXLAT; lat -= 2) frame.push([180, lat]);
      for (let lon = 180; lon >= -180; lon -= 3) frame.push([lon, -MAXLAT]);
      for (let lat = -MAXLAT; lat <= MAXLAT; lat += 2) frame.push([-180, lat]);
      // 티소 원: 지구 위 같은 크기(반지름 6°)의 원
      const tissot: LL[][] = [];
      for (const lat of [-60, -30, 0, 30, 60])
        for (let lon = -150; lon <= 150; lon += 60) {
          const ring: LL[] = [];
          const r = 6 * R;
          const p1 = lat * R;
          for (let k = 0; k < 28; k++) {
            const b = (k / 28) * TAU;
            const p2 = Math.asin(Math.sin(p1) * Math.cos(r) + Math.cos(p1) * Math.sin(r) * Math.cos(b));
            const l2 = lon * R + Math.atan2(Math.sin(b) * Math.sin(r) * Math.cos(p1), Math.cos(r) - Math.sin(p1) * Math.sin(p2));
            ring.push([l2 / R, p2 / R]);
          }
          tissot.push(ring);
        }
      // 투영마다 미리 계산 + 크기
      const pre = PROJ.map((P) => {
        const proj = (list: LL[]): P2[] => list.map((q) => P.f(q[0], q[1]));
        const fr = proj(frame);
        let X = 0;
        let Y = 0;
        for (const q of fr) {
          X = Math.max(X, Math.abs(q[0]));
          Y = Math.max(Y, Math.abs(q[1]));
        }
        return { X, Y, lands: lands.map((l) => proj(l.pts)), grat: grat.map(proj), frame: fr, tissot: tissot.map(proj) };
      });
      let auto = true;
      let pick = 0;
      let showT = true;
      let showRatio = true;
      let ct = 0;
      let from = 0;
      let to = 0;
      let mk = 1;
      const HOLD = 2.3;
      const MORPH = 1.3;
      const gi = WORLD.findIndex((l) => l.name === '그린란드');
      const ai = WORLD.findIndex((l) => l.name === '아프리카');
      const areaOf = (pts: P2[]): number => {
        let a = 0;
        for (let k = 0; k < pts.length; k++) {
          const p = pts[k]!;
          const q = pts[(k + 1) % pts.length]!;
          a += p[0] * q[1] - q[0] * p[1];
        }
        return Math.abs(a / 2);
      };
      return {
        draw(g, w, h, _t, dt) {
          reset(g);
          const d = Math.min(dt, 0.1);
          if (auto) {
            ct += d;
            if (mk >= 1 && ct > HOLD) {
              from = to;
              to = (to + 1) % 3;
              mk = 0;
              ct = 0;
            }
          } else if (to !== pick && mk >= 1) {
            from = to;
            to = pick;
            mk = 0;
          }
          if (mk < 1) mk = Math.min(1, mk + d / MORPH);
          const k = ease(mk);
          const u = ui(scaleOf(w, h));
          g.fillStyle = '#0c1424';
          g.fillRect(0, 0, w, h);
          const top = 22 * u;
          const bot = showRatio ? 18 * u : 6 * u;
          const A = pre[from]!;
          const B = pre[to]!;
          const fit = (p: { X: number; Y: number }): number => Math.min((w - 12 * u) / (2 * p.X), (h - top - bot) / (2 * p.Y));
          const sa = fit(A);
          const sb = fit(B);
          const cx = w / 2;
          const cy = top + (h - top - bot) / 2;
          const M = (a: P2, b: P2): P2 => [cx + lerp(a[0] * sa, b[0] * sb, k), cy - lerp(a[1] * sa, b[1] * sb, k)];
          const path = (a: P2[], b: P2[], close: boolean): P2[] => {
            const out: P2[] = [];
            g.beginPath();
            for (let i = 0; i < a.length; i++) {
              const q = M(a[i]!, b[i]!);
              out.push(q);
              if (i) g.lineTo(q[0], q[1]);
              else g.moveTo(q[0], q[1]);
            }
            if (close) g.closePath();
            return out;
          };
          // 바다
          path(A.frame, B.frame, true);
          const og = g.createLinearGradient(0, top, 0, h - bot);
          og.addColorStop(0, '#2d6fa8');
          og.addColorStop(0.5, '#2a78b8');
          og.addColorStop(1, '#2d6fa8');
          g.fillStyle = og;
          g.fill();
          // 경위선
          g.strokeStyle = 'rgba(255,255,255,0.16)';
          g.lineWidth = 1;
          A.grat.forEach((l, i) => {
            path(l, B.grat[i]!, false);
            g.stroke();
          });
          // 땅
          let areaG = 0;
          let areaA = 0;
          lands.forEach((l, i) => {
            const pts = path(A.lands[i]!, B.lands[i]!, true);
            const isG = i === gi;
            const isA = i === ai;
            g.fillStyle = isG ? '#f2f7fb' : isA ? '#f0a54a' : l.ice ? '#e4edf3' : '#8cc36b';
            g.fill();
            g.strokeStyle = isG ? '#5ab4ff' : isA ? '#b86a14' : 'rgba(40,70,30,0.65)';
            g.lineWidth = isG || isA ? 1.6 * u : 0.8;
            g.stroke();
            if (isG) areaG = areaOf(pts);
            if (isA) areaA = areaOf(pts);
          });
          // 티소 원
          if (showT) {
            g.fillStyle = 'rgba(235,60,70,0.55)';
            g.strokeStyle = 'rgba(255,220,220,0.9)';
            g.lineWidth = 1;
            A.tissot.forEach((l, i) => {
              path(l, B.tissot[i]!, true);
              g.fill();
              g.stroke();
            });
          }
          // 테두리
          path(A.frame, B.frame, true);
          g.strokeStyle = 'rgba(255,255,255,0.7)';
          g.lineWidth = 1.4 * u;
          g.stroke();
          // 이름표
          const lab = (lon: number, lat: number, s: string, col: string): void => {
            const q = M(PROJ[from]!.f(lon, lat), PROJ[to]!.f(lon, lat));
            pill(g, s, q[0], q[1], 7.5 * u, col, '#fff', 'center');
          };
          lab(-42, 73, '그린란드', 'rgba(30,110,200,0.9)');
          lab(20, 5, '아프리카', 'rgba(180,100,20,0.9)');
          pill(g, PROJ[mk < 0.5 ? from : to]!.name, 8 * u, 11 * u, 8.5 * u, 'rgba(255,255,255,0.95)', '#10203a');
          if (showRatio && areaG > 0) {
            const ratio = areaA / areaG;
            const y = h - 9 * u;
            txt(g, `화면 속 넓이  그린란드 : 아프리카 = 1 : ${ratio.toFixed(1)}`, w / 2 - 6 * u, y, 8 * u, '#ffffff', 'right', 800);
            txt(g, '진짜는 1 : 14', w / 2 + 6 * u, y, 8 * u, '#ffd36b', 'left', 800);
          }
        },
        controls: [
          { type: 'toggle', label: '자동으로 바꾸기', value: true, on: (v) => { auto = v; } },
          { type: 'range', label: '투영 (등거리 · 메르카토르 · 몰바이데)', min: 0, max: 2, step: 1, value: 0, on: (v) => { pick = v; auto = false; } },
          { type: 'toggle', label: '티소 원 (같은 크기의 원)', value: true, on: (v) => { showT = v; } },
          { type: 'toggle', label: '넓이 비교', value: true, on: (v) => { showRatio = v; } },
        ],
      };
    },
  },

  /* ───────────── i262 지구본 · 큰 원 ───────────── */
  i262: {
    kind: '3d',
    caption: '위도 · 경도 → 지구본 위 점 — 두 도시를 잇는 가장 짧은 길은 지구 중심을 지나는 평면이 자른 「큰 원」, 비행기는 그 길로',
    make() {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x060a18);
      const cam = new THREE.PerspectiveCamera(32, 1.6, 0.1, 200);
      cam.position.set(0, 0, 4.3);
      scene.add(new THREE.AmbientLight(0x8090b0, 0.55));
      const sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
      sun.position.set(-3, 2, 4);
      scene.add(sun);
      // 지구 무늬
      const tc = mkCanvas(2048, 1024);
      {
        const g = c2(tc);
        const X = (lon: number): number => ((lon + 180) / 360) * 2048;
        const Y = (lat: number): number => ((90 - lat) / 180) * 1024;
        const og = g.createLinearGradient(0, 0, 0, 1024);
        og.addColorStop(0, '#1d4f84');
        og.addColorStop(0.5, '#2a7cbf');
        og.addColorStop(1, '#1d4f84');
        g.fillStyle = og;
        g.fillRect(0, 0, 2048, 1024);
        const drawLand = (l: Land): void => {
          g.beginPath();
          l.pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))));
          g.closePath();
        };
        g.lineJoin = 'round';
        for (const l of WORLD) {
          drawLand(l);
          g.strokeStyle = 'rgba(120,200,230,0.55)';
          g.lineWidth = 9;
          g.stroke();
        }
        for (const l of WORLD) {
          drawLand(l);
          g.fillStyle = l.ice ? '#eef4f8' : '#7cb85c';
          g.fill();
          g.strokeStyle = l.ice ? '#c8d8e4' : '#4f7f3a';
          g.lineWidth = 1.5;
          g.stroke();
        }
        // 땅 결 (사막 · 숲 · 얼음)
        g.save();
        for (const l of WORLD) drawLand(l);
        g.clip();
        for (let y = 0; y < 1024; y += 4)
          for (let x = 0; x < 2048; x += 4) {
            const lat = 90 - (y / 1024) * 180;
            const n = fbm(x * 0.006, y * 0.006, 4, 3);
            const dry = Math.abs(Math.abs(lat) - 24) < 12 ? 0.6 : 0;
            if (Math.abs(lat) > 62) {
              g.fillStyle = `rgba(240,246,250,${smooth(62, 70, Math.abs(lat)) * 0.9})`;
              g.fillRect(x, y, 4, 4);
            } else if (n + dry * 0.25 > 0.62) {
              g.fillStyle = 'rgba(214,190,120,0.55)';
              g.fillRect(x, y, 4, 4);
            } else if (n < 0.4) {
              g.fillStyle = 'rgba(40,100,45,0.35)';
              g.fillRect(x, y, 4, 4);
            }
          }
        g.restore();
        g.strokeStyle = 'rgba(255,255,255,0.13)';
        g.lineWidth = 1.5;
        for (let lon = -180; lon <= 180; lon += 30) {
          g.beginPath();
          g.moveTo(X(lon), 0);
          g.lineTo(X(lon), 1024);
          g.stroke();
        }
        for (let lat = -60; lat <= 60; lat += 30) {
          g.beginPath();
          g.moveTo(0, Y(lat));
          g.lineTo(2048, Y(lat));
          g.stroke();
        }
        g.strokeStyle = 'rgba(255,220,120,0.35)';
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(0, Y(0));
        g.lineTo(2048, Y(0));
        g.stroke();
      }
      const tex = new THREE.CanvasTexture(tc);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const outer = new THREE.Group();
      const inner = new THREE.Group();
      outer.add(inner);
      scene.add(outer);
      const gGeo = new THREE.SphereGeometry(1, 96, 64);
      const gMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, metalness: 0 });
      inner.add(new THREE.Mesh(gGeo, gMat));
      // 대기 빛
      const halo = mkCanvas(256, 256);
      {
        const g = c2(halo);
        const gr = g.createRadialGradient(128, 128, 60, 128, 128, 128);
        gr.addColorStop(0, 'rgba(90,170,255,0)');
        gr.addColorStop(0.62, 'rgba(90,170,255,0.55)');
        gr.addColorStop(0.72, 'rgba(70,140,255,0.25)');
        gr.addColorStop(1, 'rgba(40,80,255,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, 256, 256);
      }
      const hTex = new THREE.CanvasTexture(halo);
      const hMat = new THREE.SpriteMaterial({ map: hTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
      const hSpr = new THREE.Sprite(hMat);
      hSpr.scale.set(2.75, 2.75, 1);
      hSpr.position.z = -0.3;
      scene.add(hSpr);
      // 별
      const sp = new Float32Array(700 * 3);
      for (let i = 0; i < 700; i++) {
        const v = new THREE.Vector3().randomDirection().multiplyScalar(60);
        sp[i * 3] = v.x;
        sp[i * 3 + 1] = v.y;
        sp[i * 3 + 2] = v.z;
      }
      const sGeo = new THREE.BufferGeometry();
      sGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
      const sMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, transparent: true, opacity: 0.8, depthWrite: false });
      scene.add(new THREE.Points(sGeo, sMat));
      const CITY: Record<string, LL> = { 서울: [126.98, 37.57], 뉴욕: [-74, 40.7], 런던: [-0.13, 51.5], 시드니: [151.2, -33.9], 리우: [-43.2, -22.9], 카이로: [31.2, 30], 로스앤젤레스: [-118.2, 34], 케이프타운: [18.4, -33.9] };
      const ROUTES: [string, string][] = [
        ['서울', '런던'],
        ['서울', '뉴욕'],
        ['런던', '뉴욕'],
        ['서울', '시드니'],
        ['카이로', '리우'],
        ['로스앤젤레스', '시드니'],
        ['케이프타운', '서울'],
      ];
      const V = (ll: LL, r = 1): THREE.Vector3 => {
        const v = llVec(ll[0], ll[1]);
        return new THREE.Vector3(v[0], v[1], v[2]).multiplyScalar(r);
      };
      const route = new THREE.Group();
      inner.add(route);
      const disposables: { dispose(): void }[] = [];
      let tubeGeo: THREE.TubeGeometry | null = null;
      let TUB = 160;
      const RAD = 8;
      let plane: THREE.Mesh | null = null;
      let curve: THREE.CatmullRomCurve3 | null = null;
      let distKm = 0;
      let ri = -1;
      let rt = 0;
      let speed = 1;
      let llOn = true;
      let llGroup: THREE.Group | null = null;
      let wantY = 0;
      let wantX = 0;
      const label = (s: string, col: string): THREE.Sprite => {
        const c = mkCanvas(512, 112);
        const g = c2(c);
        g.font = `800 40px ${F}`;
        const tw = Math.min(500, g.measureText(s).width + 44);
        rr(g, (512 - tw) / 2, 16, tw, 80, 40);
        g.fillStyle = 'rgba(8,14,30,0.82)';
        g.fill();
        g.strokeStyle = col;
        g.lineWidth = 4;
        g.stroke();
        txt(g, s, 256, 57, 40, '#fff', 'center', 800);
        const t2 = new THREE.CanvasTexture(c);
        t2.colorSpace = THREE.SRGBColorSpace;
        const m = new THREE.SpriteMaterial({ map: t2, depthTest: false, transparent: true });
        disposables.push(t2, m);
        const s2 = new THREE.Sprite(m);
        s2.scale.set(0.82, 0.18, 1);
        s2.renderOrder = 20;
        return s2;
      };
      const distSpr = { s: null as THREE.Sprite | null };
      const nextRoute = (): void => {
        for (const d of disposables) d.dispose();
        disposables.length = 0;
        route.clear();
        if (distSpr.s) scene.remove(distSpr.s);
        ri = (ri + 1) % ROUTES.length;
        rt = 0;
        const [na, nb] = ROUTES[ri]!;
        const A = CITY[na]!;
        const B = CITY[nb]!;
        const va = V(A);
        const vb = V(B);
        const ang = va.angleTo(vb);
        distKm = ang * 6371;
        const pts: THREE.Vector3[] = [];
        const N = 80;
        for (let i = 0; i <= N; i++) {
          const s = i / N;
          const p = new THREE.Vector3().copy(va).multiplyScalar(Math.sin((1 - s) * ang) / Math.sin(ang)).add(vb.clone().multiplyScalar(Math.sin(s * ang) / Math.sin(ang)));
          pts.push(p.multiplyScalar(1.004 + Math.sin(Math.PI * s) * (0.05 + ang * 0.07)));
        }
        curve = new THREE.CatmullRomCurve3(pts);
        TUB = 160;
        tubeGeo = new THREE.TubeGeometry(curve, TUB, 0.011, RAD, false);
        tubeGeo.setDrawRange(0, 0);
        const tMat = new THREE.MeshBasicMaterial({ color: 0xffd34a });
        disposables.push(tubeGeo, tMat);
        route.add(new THREE.Mesh(tubeGeo, tMat));
        // 땅 위 큰 원 (점선)
        const gpts: THREE.Vector3[] = [];
        for (let i = 0; i <= 120; i++) {
          const s = i / 120;
          gpts.push(new THREE.Vector3().copy(va).multiplyScalar(Math.sin((1 - s) * ang) / Math.sin(ang)).add(vb.clone().multiplyScalar(Math.sin(s * ang) / Math.sin(ang))).multiplyScalar(1.003));
        }
        const gGeo2 = new THREE.BufferGeometry().setFromPoints(gpts);
        const gM = new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.025, gapSize: 0.02, transparent: true, opacity: 0.85 });
        const gl = new THREE.Line(gGeo2, gM);
        gl.computeLineDistances();
        disposables.push(gGeo2, gM);
        route.add(gl);
        // 도시 핀 · 이름
        const pinGeo = new THREE.SphereGeometry(0.022, 16, 12);
        const pinMat = new THREE.MeshBasicMaterial({ color: 0xff5a6a });
        disposables.push(pinGeo, pinMat);
        for (const [nm, ll] of [
          [na, A],
          [nb, B],
        ] as [string, LL][]) {
          const pin = new THREE.Mesh(pinGeo, pinMat);
          pin.position.copy(V(ll, 1.01));
          route.add(pin);
          const ns = ll[1] >= 0 ? 'N' : 'S';
          const ew = ll[0] >= 0 ? 'E' : 'W';
          const l = label(`${nm} ${Math.abs(ll[1]).toFixed(0)}°${ns} ${Math.abs(ll[0]).toFixed(0)}°${ew}`, '#ff5a6a');
          l.position.copy(V(ll, 1.2));
          route.add(l);
        }
        // 비행기
        const pGeo = new THREE.ConeGeometry(0.03, 0.09, 10);
        pGeo.rotateX(Math.PI / 2);
        const pMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        disposables.push(pGeo, pMat);
        plane = new THREE.Mesh(pGeo, pMat);
        route.add(plane);
        // 출발 도시의 위도선 · 경도선
        llGroup = new THREE.Group();
        const par: THREE.Vector3[] = [];
        for (let lon = -180; lon <= 180; lon += 3) par.push(V([lon, A[1]], 1.003));
        const mer: THREE.Vector3[] = [];
        for (let lat = -90; lat <= 90; lat += 3) mer.push(V([A[0], lat], 1.003));
        for (const list of [par, mer]) {
          const gg = new THREE.BufferGeometry().setFromPoints(list);
          const mm = new THREE.LineBasicMaterial({ color: 0x7ef0c8, transparent: true, opacity: 0.85 });
          disposables.push(gg, mm);
          llGroup.add(new THREE.Line(gg, mm));
        }
        route.add(llGroup);
        llGroup.visible = llOn;
        // 가운데로 돌리기
        const mid = va.clone().add(vb).normalize();
        wantY = Math.atan2(-mid.x, mid.z);
        wantX = Math.asin(clamp(mid.y, -1, 1)) * 0.85;
        const ds = label(`큰 원 거리 약 ${Math.round(distKm / 10) * 10} km`, '#ffd34a');
        ds.scale.set(1.5, 0.33, 1);
        ds.position.set(0, -1.32, 0.4);
        distSpr.s = ds;
        ds.visible = false;
        scene.add(ds);
      };
      nextRoute();
      inner.rotation.y = wantY;
      outer.rotation.x = wantX;
      const angLerp = (a: number, b: number, k: number): number => {
        let d = b - a;
        while (d > Math.PI) d -= TAU;
        while (d < -Math.PI) d += TAU;
        return a + d * k;
      };
      return {
        scene,
        camera: cam,
        update(_t, dt) {
          const d = Math.min(dt, 0.1) * speed;
          rt += d;
          const k = 1 - Math.exp(-Math.min(dt, 0.1) * 3);
          inner.rotation.y = angLerp(inner.rotation.y, wantY, k);
          outer.rotation.x = lerp(outer.rotation.x, wantX, k);
          const grow = clamp01((rt - 0.9) / 2.2);
          if (tubeGeo) tubeGeo.setDrawRange(0, Math.floor(ease(grow) * TUB) * RAD * 6);
          if (plane && curve) {
            const s = clamp(ease(grow), 0.001, 0.999);
            plane.position.copy(curve.getPointAt(s));
            plane.lookAt(inner.localToWorld(curve.getPointAt(Math.min(1, s + 0.01))));
            plane.visible = grow > 0 && grow < 1;
          }
          if (distSpr.s) distSpr.s.visible = grow >= 1;
          if (rt > 5.4) nextRoute();
        },
        controls: [
          { type: 'button', label: '다음 도시', on: () => nextRoute() },
          { type: 'range', label: '속도', min: 0.25, max: 3, step: 0.25, value: 1, on: (v) => { speed = v; } },
          { type: 'toggle', label: '출발 도시의 위도선 · 경도선', value: true, on: (v) => { llOn = v; if (llGroup) llGroup.visible = v; } },
        ],
        dispose() {
          for (const d of disposables) d.dispose();
          tex.dispose();
          gGeo.dispose();
          gMat.dispose();
          hTex.dispose();
          hMat.dispose();
          sGeo.dispose();
          sMat.dispose();
        },
      };
    },
  },

  /* ───────────── i263 쿼드트리 ───────────── */
  i263: {
    kind: '2d',
    caption: '물체가 많은 칸만 4칸으로 더 쪼개기(쿼드트리) — 노란 상자 안을 찾을 때 겹치는 칸만 열어 보니 검사 수가 확 줄어요',
    make() {
      let N = 260;
      let cap = 4;
      let query = true;
      let lines = true;
      interface Pt { x: number; y: number; vx: number; vy: number; cl: number }
      let pts: Pt[] = [];
      const gen = (): void => {
        pts = [];
        for (let i = 0; i < N; i++) {
          const cl = i < N * 0.6 ? (i % 2) + 1 : 0;
          if (cl) {
            // 무리 점은 vx, vy 에 무리 가운데로부터의 자리(가우스)를 담는다
            const r = Math.sqrt(-2 * Math.log(Math.random() + 1e-9)) * 0.065;
            const a = Math.random() * TAU;
            pts.push({ x: 0.5, y: 0.5, vx: Math.cos(a) * r, vy: Math.sin(a) * r, cl });
          } else pts.push({ x: Math.random(), y: Math.random(), vx: (Math.random() - 0.5) * 0.05, vy: (Math.random() - 0.5) * 0.05, cl });
        }
      };
      gen();
      interface QN { x: number; y: number; s: number; d: number; items: number[]; kids: QN[] | null }
      const build = (): QN => {
        const root: QN = { x: 0, y: 0, s: 1, d: 0, items: [], kids: null };
        const ins = (n: QN, i: number): void => {
          if (n.kids) {
            const p = pts[i]!;
            const k = (p.x >= n.x + n.s / 2 ? 1 : 0) + (p.y >= n.y + n.s / 2 ? 2 : 0);
            ins(n.kids[k]!, i);
            return;
          }
          n.items.push(i);
          if (n.items.length > cap && n.d < 7) {
            const h2 = n.s / 2;
            n.kids = [
              { x: n.x, y: n.y, s: h2, d: n.d + 1, items: [], kids: null },
              { x: n.x + h2, y: n.y, s: h2, d: n.d + 1, items: [], kids: null },
              { x: n.x, y: n.y + h2, s: h2, d: n.d + 1, items: [], kids: null },
              { x: n.x + h2, y: n.y + h2, s: h2, d: n.d + 1, items: [], kids: null },
            ];
            const it = n.items;
            n.items = [];
            for (const j of it) ins(n, j);
          }
        };
        for (let i = 0; i < pts.length; i++) ins(root, i);
        return root;
      };
      return {
        draw(g, w, h, t, dt) {
          reset(g);
          const d = Math.min(dt, 0.05);
          // 무리 둘이 빙빙 돌며 몰려다님
          const c1x = 0.5 + Math.cos(t * 0.5) * 0.28;
          const c1y = 0.5 + Math.sin(t * 0.7) * 0.28;
          const c2x = 0.5 + Math.cos(t * 0.37 + 2) * 0.3;
          const c2y = 0.5 + Math.sin(t * 0.45 + 1) * 0.3;
          for (const p of pts) {
            if (p.cl) {
              // 무리 점: 무리 가운데 + 제 자리(가우스) 를 천천히 돌림
              const tx = p.cl === 1 ? c1x : c2x;
              const ty = p.cl === 1 ? c1y : c2y;
              const a = t * (p.cl === 1 ? 0.6 : -0.45);
              const sx = p.vx * Math.cos(a) - p.vy * Math.sin(a);
              const sy = p.vx * Math.sin(a) + p.vy * Math.cos(a);
              p.x = clamp(tx + sx, 0.001, 0.999);
              p.y = clamp(ty + sy, 0.001, 0.999);
              continue;
            }
            p.x += p.vx * d;
            p.y += p.vy * d;
            if (p.x < 0.002 || p.x > 0.998) p.vx *= -1;
            if (p.y < 0.002 || p.y > 0.998) p.vy *= -1;
            p.x = clamp(p.x, 0.001, 0.999);
            p.y = clamp(p.y, 0.001, 0.999);
          }
          const root = build();
          const u = ui(scaleOf(w, h));
          g.fillStyle = '#0a1020';
          g.fillRect(0, 0, w, h);
          const S = Math.min(w - 16 * u, h - 10 * u);
          const ox = (w - S) / 2 + (w > S * 1.4 ? S * 0.22 : 0);
          const oy = (h - S) / 2;
          // 질의 상자
          const qw = 0.26;
          const qh = 0.2;
          const qx = 0.5 + Math.cos(t * 0.31) * 0.34 - qw / 2;
          const qy = 0.5 + Math.sin(t * 0.43) * 0.36 - qh / 2;
          let checked = 0;
          let found = 0;
          const visited = new Set<QN>();
          const hit = new Set<number>();
          const seen = new Set<number>();
          const q = (n: QN): void => {
            if (n.x > qx + qw || n.x + n.s < qx || n.y > qy + qh || n.y + n.s < qy) return;
            visited.add(n);
            if (n.kids) {
              for (const k of n.kids) q(k);
              return;
            }
            for (const i of n.items) {
              checked++;
              seen.add(i);
              const p = pts[i]!;
              if (p.x >= qx && p.x <= qx + qw && p.y >= qy && p.y <= qy + qh) {
                found++;
                hit.add(i);
              }
            }
          };
          if (query) q(root);
          // 칸
          let leaves = 0;
          const drawN = (n: QN): void => {
            if (n.kids) {
              for (const k of n.kids) drawN(k);
              if (lines) {
                g.strokeStyle = `hsla(${190 + n.d * 22},80%,${62 + n.d * 3}%,${0.75 - n.d * 0.07})`;
                g.lineWidth = Math.max(0.6, (2.2 - n.d * 0.28) * u);
                g.beginPath();
                g.moveTo(ox + (n.x + n.s / 2) * S, oy + n.y * S);
                g.lineTo(ox + (n.x + n.s / 2) * S, oy + (n.y + n.s) * S);
                g.moveTo(ox + n.x * S, oy + (n.y + n.s / 2) * S);
                g.lineTo(ox + (n.x + n.s) * S, oy + (n.y + n.s / 2) * S);
                g.stroke();
              }
              return;
            }
            leaves++;
            if (query && visited.has(n)) {
              g.fillStyle = 'rgba(255,214,74,0.13)';
              g.fillRect(ox + n.x * S, oy + n.y * S, n.s * S, n.s * S);
            } else if (n.items.length) {
              g.fillStyle = `rgba(90,180,255,${0.03 + n.d * 0.012})`;
              g.fillRect(ox + n.x * S, oy + n.y * S, n.s * S, n.s * S);
            }
          };
          g.fillStyle = '#111a30';
          g.fillRect(ox, oy, S, S);
          drawN(root);
          g.strokeStyle = 'rgba(120,200,255,0.7)';
          g.lineWidth = 1.5 * u;
          g.strokeRect(ox, oy, S, S);
          // 점
          for (let i = 0; i < pts.length; i++) {
            const p = pts[i]!;
            const x = ox + p.x * S;
            const y = oy + p.y * S;
            const isHit = hit.has(i);
            const isSeen = seen.has(i);
            g.beginPath();
            g.arc(x, y, (isHit ? 2.6 : 1.8) * u, 0, TAU);
            g.fillStyle = isHit ? '#ff8a3a' : isSeen ? '#fff3b0' : '#8fd0ff';
            g.fill();
          }
          if (query) {
            g.strokeStyle = '#ffd54a';
            g.lineWidth = 2 * u;
            g.setLineDash([5 * u, 3 * u]);
            g.strokeRect(ox + qx * S, oy + qy * S, qw * S, qh * S);
            g.setLineDash([]);
          }
          // 정보
          const ix = w > S * 1.4 ? 8 * u : ox + 4 * u;
          const lines2: [string, string][] = query
            ? [
                [`칸 ${leaves}개 · 점 ${pts.length}개`, '#cfe0ff'],
                [`검사 ${checked}번`, '#ffe680'],
                [`(쪼개기 없으면 ${pts.length}번)`, '#8a97b4'],
                [`찾음 ${found}개`, '#ff9a5a'],
              ]
            : [[`칸 ${leaves}개 · 점 ${pts.length}개`, '#cfe0ff']];
          if (w > S * 1.4) {
            lines2.forEach(([s, c], i) => txt(g, s, ix, 16 * u + i * 14 * u, 9 * u, c, 'left', 800));
          } else {
            pill(g, query ? `검사 ${checked} / ${pts.length}번 · 찾음 ${found}` : `칸 ${leaves}개`, ox + 4 * u, oy + 10 * u, 8 * u, 'rgba(10,14,30,0.85)');
          }
        },
        controls: [
          { type: 'range', label: '한 칸에 담을 수 (넘으면 쪼갬)', min: 1, max: 16, step: 1, value: 4, on: (v) => { cap = v; } },
          { type: 'range', label: '점 개수', min: 40, max: 800, step: 20, value: 260, on: (v) => { N = v; gen(); } },
          { type: 'toggle', label: '찾기 상자', value: true, on: (v) => { query = v; } },
          { type: 'toggle', label: '나누기 선', value: true, on: (v) => { lines = v; } },
        ],
      };
    },
  },
};

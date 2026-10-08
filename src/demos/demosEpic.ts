import type { Control, DemoMap } from './types';

/**
 * 「Epicurius」(순수 캔버스 2D 브라우저 게임)에서 배운 기법 견본 (i73 ~ i78).
 * 원작 코드는 옮기지 않고, 기법(화소 광선 굽기 · 작은 지연 렌더러 · 안개 걷기 · 빛 버퍼 · 절차 음악 · 청크 캐시)만
 * 작은 코드로 다시 짰다. 카드(280×175) 기준 u = min(w/280, h/175) 배로 키워 그린다.
 */

type G = CanvasRenderingContext2D;
type V3 = [number, number, number];
const F = '"Pretendard Variable", Pretendard, system-ui, sans-serif';

const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
const clamp01 = (x: number): number => clamp(x, 0, 1);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const smooth = (e0: number, e1: number, x: number): number => {
  const v = clamp01((x - e0) / (e1 - e0));
  return v * v * (3 - 2 * v);
};
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
  const a = hash2(i, j, s);
  const b = hash2(i + 1, j, s);
  const c = hash2(i, j + 1, s);
  const d = hash2(i + 1, j + 1, s);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}
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
function fbm(x: number, y: number, s = 0): number {
  return vnoise(x, y, s) * 0.55 + vnoise(x * 2.1, y * 2.1, s + 7) * 0.3 + vnoise(x * 4.3, y * 4.3, s + 13) * 0.15;
}
function rng(seed: number): () => number {
  let s = Math.abs(Math.floor(seed * 9301 + 49297)) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
function mkCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}
function c2(c: HTMLCanvasElement): G {
  return c.getContext('2d')!;
}
function reset(g: G): void {
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.imageSmoothingEnabled = true;
  g.lineWidth = 1;
  g.setLineDash([]);
}
function bg(g: G, w: number, h: number, a: string, b: string): void {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, a);
  gr.addColorStop(1, b);
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
}
function txt(g: G, s: string, x: number, y: number, size: number, color = '#fff', align: CanvasTextAlign = 'center', font = F, weight = 700): void {
  g.font = `${weight} ${size}px ${font}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(s, x, y);
}
function rr(g: G, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, Math.max(0, w), Math.max(0, h), Math.max(0, Math.min(r, w / 2, h / 2)));
}
function pill(g: G, s: string, x: number, y: number, size: number, fill: string, fg = '#fff', align: 'center' | 'left' = 'center'): number {
  g.font = `800 ${size}px ${F}`;
  const tw = g.measureText(s).width;
  const ph = size * 1.65;
  const pw = tw + size * 1.3;
  const x0 = align === 'center' ? x - pw / 2 : x;
  rr(g, x0, y - ph / 2, pw, ph, ph / 2);
  g.fillStyle = fill;
  g.fill();
  txt(g, s, x0 + pw / 2, y + size * 0.04, size, fg, 'center', F, 800);
  return pw;
}
function hex(c: string): V3 {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** 색 사다리(어두움 → 밝음)에서 k(0..1) 자리 색 — 이웃 둘을 섞음 */
function rampAt(ramp: V3[], k: number): V3 {
  const x = clamp01(k) * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(x));
  const f = x - i;
  const a = ramp[i]!;
  const b = ramp[i + 1]!;
  return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number): number => (BAYER[(y & 3) * 4 + (x & 3)]! + 0.5) / 16;

/* 2:1 등각(디메트릭) 카메라 — 고도 30° 라 땅의 정사각형이 가로:세로 2:1 마름모로 보인다 */
const CE = Math.cos(Math.PI / 6);
const SE = Math.sin(Math.PI / 6);
const FWD: V3 = [0, -SE, -CE]; // 카메라가 보는 쪽
const rotY = (v: V3, a: number): V3 => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
};
const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/* ───────── 기본 도형 (부호 거리) ───────── */
interface Prim {
  k: 0 | 1; // 0 타원체 · 1 캡슐
  c: V3;
  r: V3;
  a: V3;
  b: V3;
  rad: number;
  m: number;
  bump?: number;
}
const ell = (c: V3, r: V3, m: number, bump = 0): Prim => ({ k: 0, c, r, a: c, b: c, rad: 0, m, bump });
const cap = (a: V3, b: V3, rad: number, m: number): Prim => ({ k: 1, c: a, r: [rad, rad, rad], a, b, rad, m });

function sdPrim(p: Prim, x: number, y: number, z: number): number {
  if (p.k === 0) {
    const dx = x - p.c[0];
    const dy = y - p.c[1];
    const dz = z - p.c[2];
    const k0 = Math.sqrt((dx * dx) / (p.r[0] * p.r[0]) + (dy * dy) / (p.r[1] * p.r[1]) + (dz * dz) / (p.r[2] * p.r[2]));
    const k1 = Math.sqrt((dx * dx) / p.r[0] ** 4 + (dy * dy) / p.r[1] ** 4 + (dz * dz) / p.r[2] ** 4);
    let d = k1 < 1e-6 ? -Math.min(p.r[0], p.r[1], p.r[2]) : (k0 * (k0 - 1)) / k1;
    if (p.bump) d += (Math.sin(x * 1.3 + 1.7) * Math.sin(y * 1.1 + 0.3) * Math.sin(z * 1.37 + 2.1) + Math.sin(x * 2.9 + y * 2.3) * 0.35) * p.bump;
    return d;
  }
  const pax = x - p.a[0];
  const pay = y - p.a[1];
  const paz = z - p.a[2];
  const bax = p.b[0] - p.a[0];
  const bay = p.b[1] - p.a[1];
  const baz = p.b[2] - p.a[2];
  const hh = clamp01((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz || 1));
  return Math.hypot(pax - bax * hh, pay - bay * hh, paz - baz * hh) - p.rad;
}
function nPrim(p: Prim, x: number, y: number, z: number): V3 {
  if (p.k === 0) return norm([(x - p.c[0]) / (p.r[0] * p.r[0]), (y - p.c[1]) / (p.r[1] * p.r[1]), (z - p.c[2]) / (p.r[2] * p.r[2])]);
  const bax = p.b[0] - p.a[0];
  const bay = p.b[1] - p.a[1];
  const baz = p.b[2] - p.a[2];
  const hh = clamp01(((x - p.a[0]) * bax + (y - p.a[1]) * bay + (z - p.a[2]) * baz) / (bax * bax + bay * bay + baz * baz || 1));
  return norm([x - p.a[0] - bax * hh, y - p.a[1] - bay * hh, z - p.a[2] - baz * hh]);
}

/** 화소 하나마다 광선 — 정사영 등각 카메라. 결과: 깊이 · 도형 번호 · 법선(도형 좌표) */
interface Hits {
  W: number;
  H: number;
  depth: Float32Array;
  id: Int16Array;
  nx: Float32Array;
  ny: Float32Array;
  nz: Float32Array;
  px: Float32Array;
  py: Float32Array;
  pz: Float32Array;
}
function castAll(prims: Prim[], W: number, H: number, ax: number, ay: number, yaw: number, D = 40, analyticN = true): Hits {
  const n = W * H;
  const hits: Hits = {
    W,
    H,
    depth: new Float32Array(n).fill(1e9),
    id: new Int16Array(n).fill(-1),
    nx: new Float32Array(n),
    ny: new Float32Array(n),
    nz: new Float32Array(n),
    px: new Float32Array(n),
    py: new Float32Array(n),
    pz: new Float32Array(n),
  };
  const f = rotY(FWD, -yaw);
  // 경계 상자 — 빈 광선은 빨리 끝내기
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const sx = px - ax + 0.5;
      const sy = ay - py - 0.5;
      const o = rotY([sx, sy * CE + D * SE, -sy * SE + D * CE], -yaw);
      let t = 0;
      for (let s = 0; s < 64; s++) {
        const x = o[0] + f[0] * t;
        const y = o[1] + f[1] * t;
        const z = o[2] + f[2] * t;
        let best = 1e9;
        let bi = -1;
        for (let q = 0; q < prims.length; q++) {
          const d = sdPrim(prims[q]!, x, y, z);
          if (d < best) {
            best = d;
            bi = q;
          }
        }
        if (best < 0.05) {
          const k = py * W + px;
          hits.depth[k] = t;
          hits.id[k] = bi;
          let nn: V3;
          if (analyticN) nn = nPrim(prims[bi]!, x, y, z);
          else {
            const e = 0.35;
            const sd = (xx: number, yy: number, zz: number): number => {
              let m = 1e9;
              for (const pr of prims) m = Math.min(m, sdPrim(pr, xx, yy, zz));
              return m;
            };
            nn = norm([sd(x + e, y, z) - sd(x - e, y, z), sd(x, y + e, z) - sd(x, y - e, z), sd(x, y, z + e) - sd(x, y, z - e)]);
          }
          hits.nx[k] = nn[0];
          hits.ny[k] = nn[1];
          hits.nz[k] = nn[2];
          hits.px[k] = x;
          hits.py[k] = y;
          hits.pz[k] = z;
          break;
        }
        t += Math.max(best * 0.9, 0.04);
        if (t > D * 2 + 10) break;
      }
    }
  }
  return hits;
}

/* ═════════════════════ i73 미리 그린 3D 스프라이트 ═════════════════════ */
const SKIN = 0;
const HAIR = 1;
const HAT = 2;
const BAND = 3;
const TUNIC = 4;
const BELT = 5;
const LEG = 6;
const SHOE = 7;
const RAMPS73: V3[][] = [
  ['#9a5a45', '#d98a68', '#f6bf98', '#ffe2c8'],
  ['#3b2420', '#64392a', '#8d5634', '#b67a48'],
  ['#8a5a1a', '#d39a32', '#f3cb5c', '#fff0a6'],
  ['#6e1f2c', '#b8344a', '#e8586a', '#ff9aa4'],
  ['#1e4f78', '#2f7fb8', '#56b0e0', '#a6e2ff'],
  ['#4a2a1a', '#7a4a2a', '#a9703f', '#cf9a5c'],
  ['#3a3048', '#5a4c70', '#7c6c98', '#a898c0'],
  ['#2a1a16', '#4a2e22', '#6e4632', '#946448'],
].map((r) => r.map(hex));
const PASTEL: V3[] = ['#ff8fb1', '#ffc56b', '#fff07a', '#9be27a', '#6fd6c8', '#7fb6ff', '#b29bff', '#ff9e7a', '#f7a8ff', '#8ee0ff', '#c4f07a', '#ffd1a0', '#a0ffd8', '#d0b0ff'].map(hex);

function kidPrims(frame: number): { prims: Prim[]; eyes: V3[]; cheeks: V3[] } {
  const ph = (frame * Math.PI) / 2;
  const sw = Math.sin(ph);
  const bob = frame % 2 === 1 ? 1 : 0;
  const zl = 3.6 * sw;
  const zr = -3.6 * sw;
  const liftL = Math.max(0, Math.cos(ph + Math.PI / 2)) * 1.2;
  const liftR = Math.max(0, -Math.cos(ph + Math.PI / 2)) * 1.2;
  const prims: Prim[] = [
    ell([-3, 1.6 + liftL, zl + 0.9], [2.4, 1.7, 3.2], SHOE),
    ell([3, 1.6 + liftR, zr + 0.9], [2.4, 1.7, 3.2], SHOE),
    cap([-3, 11 + bob, 0], [-3, 3.2 + liftL, zl], 2.2, LEG),
    cap([3, 11 + bob, 0], [3, 3.2 + liftR, zr], 2.2, LEG),
    ell([0, 17 + bob, 0], [7.4, 8.4, 6], TUNIC),
    ell([0, 15.2 + bob, 0], [7.7, 1.4, 6.3], BELT),
    cap([-7, 22 + bob, 0], [-8.6, 13.6 + bob, -zl * 0.8], 2, SKIN),
    cap([7, 22 + bob, 0], [8.6, 13.6 + bob, -zr * 0.8], 2, SKIN),
    ell([0, 31 + bob, 0.5], [8, 7.6, 7.6], SKIN),
    ell([0, 33 + bob, -1.8], [8.6, 7, 7.6], HAIR),
    ell([0, 30.2 + bob, 8], [1.3, 1.1, 1.2], SKIN),
    ell([0, 37.6 + bob, -0.3], [11.5, 1.3, 11.5], HAT),
    ell([0, 41 + bob, -0.6], [6.2, 4.6, 6.2], HAT),
    ell([0, 39 + bob, -0.6], [6.5, 1.3, 6.5], BAND),
  ];
  return {
    prims,
    eyes: [
      [-2.9, 31.6 + bob, 7.4],
      [2.9, 31.6 + bob, 7.4],
    ],
    cheeks: [
      [-4.8, 29.4 + bob, 6.6],
      [4.8, 29.4 + bob, 6.6],
    ],
  };
}
const SW73 = 40;
const SH73 = 52;
const AX73 = 20;
const AY73 = 47;
const LIGHT73: V3 = norm([-0.55, 0.75, 0.45]);
interface Baked73 {
  baked: HTMLCanvasElement;
  raw: HTMLCanvasElement;
}
function bake73(dir: number, frame: number, steps: number, lines: boolean): Baked73 {
  const yaw = (dir * Math.PI) / 4;
  const { prims, eyes, cheeks } = kidPrims(frame);
  const H = castAll(prims, SW73, SH73, AX73, AY73, yaw);
  const L = rotY(LIGHT73, -yaw);
  const n = SW73 * SH73;
  const bc = mkCanvas(SW73, SH73);
  const rc = mkCanvas(SW73, SH73);
  const bi = c2(bc).createImageData(SW73, SH73);
  const ri = c2(rc).createImageData(SW73, SH73);
  const bd = bi.data;
  const rd = ri.data;
  const OUT: V3 = [58, 36, 48];
  for (let k = 0; k < n; k++) {
    const id = H.id[k]!;
    const x = k % SW73;
    const y = (k / SW73) | 0;
    if (id < 0) {
      if (!lines) continue;
      // 바깥 테두리: 빈 칸인데 이웃이 몸이면 진한 자두색 (검정 아님)
      const nb = (xx: number, yy: number): boolean => xx >= 0 && yy >= 0 && xx < SW73 && yy < SH73 && H.id[yy * SW73 + xx]! >= 0;
      if (nb(x - 1, y) || nb(x + 1, y) || nb(x, y - 1) || nb(x, y + 1)) {
        bd[k * 4] = OUT[0];
        bd[k * 4 + 1] = OUT[1];
        bd[k * 4 + 2] = OUT[2];
        bd[k * 4 + 3] = 255;
      }
      continue;
    }
    const m = prims[id]!.m;
    const nn: V3 = [H.nx[k]!, H.ny[k]!, H.nz[k]!];
    const lam = Math.max(0, dot(nn, L));
    const shade = clamp01(0.26 + 0.74 * lam);
    // 구운 그림: 몇 단계 명암 + 4×4 디더
    const v = shade * (steps - 1) + (bayer(x, y) - 0.5) * 0.95;
    const lvl = clamp(Math.round(v), 0, steps - 1);
    let col = rampAt(RAMPS73[m]!, steps > 1 ? lvl / (steps - 1) : 0.6);
    if (lines) {
      // 안쪽 깊이 선: 바로 옆 화소가 훨씬 앞에 있으면 (나는 뒤) 어둡게
      const me = H.depth[k]!;
      const front = (xx: number, yy: number): boolean => xx >= 0 && yy >= 0 && xx < SW73 && yy < SH73 && H.depth[yy * SW73 + xx]! < me - 3.2;
      if (front(x - 1, y) || front(x + 1, y) || front(x, y - 1) || front(x, y + 1)) {
        const d0 = RAMPS73[m]![0]!;
        col = [lerp(d0[0], OUT[0], 0.5), lerp(d0[1], OUT[1], 0.5), lerp(d0[2], OUT[2], 0.5)];
      }
    }
    bd[k * 4] = col[0];
    bd[k * 4 + 1] = col[1];
    bd[k * 4 + 2] = col[2];
    bd[k * 4 + 3] = 255;
    // 날것: 도형마다 다른 색 + 매끈한 명암
    const pc = PASTEL[id % PASTEL.length]!;
    const sp = Math.pow(Math.max(0, dot(norm([L[0] + 0, L[1] + 0.5, L[2] + 0.9]), nn)), 18) * 70;
    rd[k * 4] = clamp(pc[0] * (0.35 + 0.75 * lam) + sp, 0, 255);
    rd[k * 4 + 1] = clamp(pc[1] * (0.35 + 0.75 * lam) + sp, 0, 255);
    rd[k * 4 + 2] = clamp(pc[2] * (0.35 + 0.75 * lam) + sp, 0, 255);
    rd[k * 4 + 3] = 255;
  }
  // 눈 · 볼 = 투영한 「점」
  const dots = (list: V3[], c: V3, needFront: number): void => {
    for (const e of list) {
      const w = rotY(e, yaw);
      const facing = rotY([e[0] * 0.3, 0, 1], yaw);
      if (dot(facing, [0, SE, CE]) < needFront) continue;
      const px = Math.round(AX73 + w[0] - 0.5);
      const py = Math.round(AY73 - (w[1] * CE - w[2] * SE) - 0.5);
      if (px < 0 || py < 0 || px >= SW73 || py >= SH73) continue;
      const k = py * SW73 + px;
      const td = dot(w, FWD) + 40;
      if (H.id[k]! < 0 || Math.abs(H.depth[k]! - td) > 2) continue;
      bd[k * 4] = c[0];
      bd[k * 4 + 1] = c[1];
      bd[k * 4 + 2] = c[2];
      bd[k * 4 + 3] = 255;
    }
  };
  dots(eyes, [40, 26, 36], 0.25);
  dots(cheeks, [255, 128, 140], 0.35);
  c2(bc).putImageData(bi, 0, 0);
  c2(rc).putImageData(ri, 0, 0);
  return { baked: bc, raw: rc };
}

function makeI73() {
  let steps = 4;
  let lines = true;
  let ringRaw = false;
  let cache = new Map<string, Baked73>();
  const queue: [number, number][] = [];
  const fill = (): void => {
    queue.length = 0;
    for (let f = 0; f < 4; f++) for (let d = 0; d <= 4; d++) queue.push([d, f]);
  };
  fill();
  const rebake = (): void => {
    cache = new Map();
    fill();
  };
  // 동 · 남동 · 북동만 굽고 서쪽 셋은 좌우 뒤집기
  const get = (dir: number, frame: number): { s: Baked73; flip: boolean } | null => {
    const src = dir > 4 ? 8 - dir : dir;
    const s = cache.get(src + '_' + frame);
    return s ? { s, flip: dir > 4 } : null;
  };
  const blit = (g: G, img: HTMLCanvasElement, cx: number, footY: number, sc: number, flip: boolean): void => {
    g.save();
    g.imageSmoothingEnabled = false;
    g.translate(Math.round(cx), Math.round(footY));
    if (flip) g.scale(-1, 1);
    g.drawImage(img, -AX73 * sc, -AY73 * sc, SW73 * sc, SH73 * sc);
    g.restore();
  };
  const shadow = (g: G, x: number, y: number, rx: number): void => {
    g.fillStyle = 'rgba(70,60,90,.22)';
    g.beginPath();
    g.ellipse(x, y, rx, rx * 0.45, 0, 0, Math.PI * 2);
    g.fill();
  };
  const NAMES = ['남', '남동', '동', '북동', '북', '북서', '서', '남서'];
  const controls: Control[] = [
    { type: 'range', label: '명암 단계', min: 2, max: 6, step: 1, value: steps, on: (v) => ((steps = v), rebake()) },
    { type: 'toggle', label: '테두리 · 깊이 선', value: lines, on: (v) => ((lines = v), rebake()) },
    { type: 'toggle', label: '바퀴도 3D 도형으로', value: ringRaw, on: (v) => (ringRaw = v) },
  ];
  return {
    controls,
    draw(g: G, w: number, h: number, t: number) {
      reset(g);
      const u = scaleOf(w, h);
      bg(g, w, h, '#cfe8ff', '#fdf3e2');
      // 한 프레임에 한 장씩 굽는다 (굽는 모습도 보이게)
      const job = queue.shift();
      if (job) cache.set(job[0] + '_' + job[1], bake73(job[0], job[1], steps, lines));
      const frame = Math.floor(t * 6) % 4;
      // ── 왼쪽: 8방향 바퀴
      const cx = w * 0.27;
      const cy = h * 0.5;
      const rx = Math.min(w * 0.205, h * 0.6);
      const ry = Math.min(rx * 0.62, h * 0.3);
      g.fillStyle = '#e9d9b4';
      g.strokeStyle = '#c9b68a';
      g.lineWidth = 1.5 * u;
      g.beginPath();
      g.moveTo(cx, cy - ry * 1.15);
      g.lineTo(cx + rx * 1.15, cy);
      g.lineTo(cx, cy + ry * 1.15);
      g.lineTo(cx - rx * 1.15, cy);
      g.closePath();
      g.fill();
      g.stroke();
      const sr = Math.max(0.6, (h * 0.22) / SH73);
      const order = [4, 3, 5, 2, 6, 1, 7, 0]; // 뒤(위)부터 앞(아래)으로
      for (const d of order) {
        const a = (d * Math.PI) / 4;
        const x = cx + Math.sin(a) * rx;
        const y = cy + Math.cos(a) * ry;
        shadow(g, x, y, 7 * sr);
        const sp = get(d, frame);
        if (sp) blit(g, ringRaw ? sp.s.raw : sp.s.baked, x, y, sr, sp.flip);
        else txt(g, '…', x, y - 20 * sr, 10 * u, '#8a7a9a');
      }
      for (let d = 0; d < 8; d++) {
        const a = (d * Math.PI) / 4;
        pill(g, NAMES[d]! + (d > 4 ? ' ⇋' : ''), cx + Math.sin(a) * rx, cy + Math.cos(a) * ry + 7 * u, 6 * u, 'rgba(255,255,255,.8)', d > 4 ? '#d0457a' : '#7a6450');
      }
      // ── 오른쪽: 같은 인물, 3D 도형 ↔ 구운 그림
      const dir = Math.floor(t / 1.3) % 8;
      const sb = Math.max(1, (h * 0.58) / SH73);
      const fy = h * 0.83;
      const xr = w * 0.64;
      const xb = w * 0.87;
      shadow(g, xr, fy, 9 * sb);
      shadow(g, xb, fy, 9 * sb);
      const sp = get(dir, frame);
      if (sp) {
        blit(g, sp.s.raw, xr, fy, sb, sp.flip);
        blit(g, sp.s.baked, xb, fy, sb, sp.flip);
      }
      g.fillStyle = 'rgba(80,70,110,.25)';
      g.fillRect(w * 0.755, h * 0.2, 1.2 * u, h * 0.7);
      pill(g, '3D 도형', xr, 13 * u, 8.5 * u, 'rgba(60,50,100,.7)', '#e6e0ff');
      pill(g, '구운 그림', xb, 13 * u, 8.5 * u, '#ff6fa8');
      pill(g, `걷기 ${frame + 1}/4 · ${NAMES[dir]}`, (xr + xb) / 2, h - 9 * u, 7.5 * u, 'rgba(255,255,255,.75)', '#5a4a70');
      if (queue.length) pill(g, `굽는 중 ${20 - queue.length}/20`, 8 * u, h - 10 * u, 7.5 * u, '#ffb43a', '#3a2a10', 'left');
      else pill(g, `${steps}단계 명암 + 디더`, 8 * u, h - 10 * u, 7.5 * u, 'rgba(60,50,100,.7)', '#fff', 'left');
    },
  };
}

/* ═════════════════════ i74 작은 지연 렌더러 ═════════════════════ */
const BW74 = 128;
const BH74 = 92;
const AX74 = 64;
const AY74 = 84;
const MAT_LEAF = 1;
const MAT_BARK = 2;
const MAT_ROCK = 3;
const MAT_MOSS = 4;
const RAMP74: Record<number, V3[]> = {
  [MAT_LEAF]: ['#17301f', '#24502c', '#356e30', '#58903a', '#8fb346', '#cfdc72'].map(hex),
  [MAT_BARK]: ['#26170f', '#43291c', '#664330', '#8d6a49', '#b4966a'].map(hex),
  [MAT_ROCK]: ['#2a2834', '#454452', '#686672', '#938e8a', '#c4baa8', '#ebe0c8'].map(hex),
  [MAT_MOSS]: ['#26381f', '#3f5a2a', '#678438', '#9db050', '#cfd57a'].map(hex),
};
const BASE74: Record<number, V3> = { [MAT_LEAF]: hex('#5d9a3e'), [MAT_BARK]: hex('#80583c'), [MAT_ROCK]: hex('#8e8a8c'), [MAT_MOSS]: hex('#7e9a40') };
const MATCOL74: Record<number, V3> = { [MAT_LEAF]: hex('#4fd06a'), [MAT_BARK]: hex('#c0703a'), [MAT_ROCK]: hex('#8f9ab8'), [MAT_MOSS]: hex('#e0e04a') };

function makeI74() {
  const prims: Prim[] = [
    cap([-24, 0, 0], [-23, 24, 0], 2.7, MAT_BARK),
    ell([-24, 1.2, 0], [5, 2.6, 5], MAT_BARK),
    cap([-23, 18, 0], [-31, 29, 2], 1.6, MAT_BARK),
    cap([-23, 20, 0], [-15, 30, -1], 1.5, MAT_BARK),
    ell([-23, 41, 0], [10, 9, 10], MAT_LEAF, 2.2),
    ell([-33, 33, 3], [8, 7, 8], MAT_LEAF, 2.2),
    ell([-13.5, 34, 2], [8, 7, 8], MAT_LEAF, 2.2),
    ell([-27, 48, -3], [7.5, 6.5, 7.5], MAT_LEAF, 2),
    ell([-17, 47, -2], [7, 6.5, 7], MAT_LEAF, 2),
    ell([-23, 31, 7], [7, 6, 6], MAT_LEAF, 2),
    ell([-31, 41, -6], [7, 6.5, 7], MAT_LEAF, 2),
    ell([-22, 53, 0], [5.5, 4.5, 5.5], MAT_LEAF, 1.8),
    ell([27, 4, 2], [13, 8.5, 10], MAT_ROCK, 1.0),
    ell([41, 3, 7], [6.5, 4.2, 5.5], MAT_ROCK, 0.7),
    ell([16, 2, 9], [4.5, 2.8, 4], MAT_ROCK, 0.5),
  ];
  const n = BW74 * BH74;
  const H = castAll(prims, BW74, BH74, AX74, AY74, 0, 60, false);
  const mat = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    const id = H.id[k]!;
    if (id < 0) continue;
    let m = prims[id]!.m;
    if (m === MAT_ROCK && H.ny[k]! > 0.72 && vnoise(H.px[k]! * 0.4, H.pz[k]! * 0.4, 5) > 0.4) m = MAT_MOSS;
    mat[k] = m;
  }
  // 구석 그늘(AO): 둘레 화소가 나보다 앞에 있으면 어둡게 — 한 번만
  const ao = new Float32Array(n).fill(1);
  let dmin = 1e9;
  let dmax = -1e9;
  for (let k = 0; k < n; k++) {
    if (!mat[k]) continue;
    const d = H.depth[k]!;
    dmin = Math.min(dmin, d);
    dmax = Math.max(dmax, d);
    const x = k % BW74;
    const y = (k / BW74) | 0;
    let occ = 0;
    for (let a = 0; a < 8; a++) {
      const xx = Math.round(x + Math.cos((a * Math.PI) / 4) * 3);
      const yy = Math.round(y + Math.sin((a * Math.PI) / 4) * 3);
      if (xx < 0 || yy < 0 || xx >= BW74 || yy >= BH74) continue;
      const kk = yy * BW74 + xx;
      if (mat[kk] && H.depth[kk]! < d - 1.5) occ += Math.min(1, (d - H.depth[kk]!) / 6);
    }
    ao[k] = 1 - Math.min(0.55, occ * 0.09);
  }
  const dith = new Float32Array(n);
  for (let k = 0; k < n; k++) dith[k] = hash2(k % BW74, (k / BW74) | 0, 3) * 0.6 + vnoise((k % BW74) * 0.7, ((k / BW74) | 0) * 0.7, 9) * 0.4;
  // 정지 패널 셋: 깊이 · 법선 · 재질
  const mkStatic = (fn: (k: number) => V3): HTMLCanvasElement => {
    const c = mkCanvas(BW74, BH74);
    const im = c2(c).createImageData(BW74, BH74);
    for (let k = 0; k < n; k++) {
      if (!mat[k]) continue;
      const v = fn(k);
      im.data[k * 4] = v[0];
      im.data[k * 4 + 1] = v[1];
      im.data[k * 4 + 2] = v[2];
      im.data[k * 4 + 3] = 255;
    }
    c2(c).putImageData(im, 0, 0);
    return c;
  };
  const cDepth = mkStatic((k) => {
    const v = 255 * (1 - (H.depth[k]! - dmin) / (dmax - dmin || 1)) * 0.85 + 30;
    return [v, v, v * 1.05];
  });
  const cNorm = mkStatic((k) => [(H.nx[k]! * 0.5 + 0.5) * 255, (H.ny[k]! * 0.5 + 0.5) * 255, (H.nz[k]! * 0.5 + 0.5) * 255]);
  const cMat = mkStatic((k) => MATCOL74[mat[k]!]!);
  const cLit = mkCanvas(BW74, BH74);
  const cPal = mkCanvas(BW74, BH74);
  const iLit = c2(cLit).createImageData(BW74, BH74);
  const iPal = c2(cPal).createImageData(BW74, BH74);
  let dither = true;
  let fixed = 0;
  let lastShade = -1;
  let L: V3 = [0, 1, 0];
  const shadePass = (t: number): void => {
    const phi = 0.55 + Math.sin(t * 0.45) * 0.75;
    L = norm([-Math.cos(phi) * 0.85, 0.8, Math.sin(phi) * 0.85]);
    for (let k = 0; k < n; k++) {
      const m = mat[k]!;
      if (!m) continue;
      const nn: V3 = [H.nx[k]!, H.ny[k]!, H.nz[k]!];
      let lam = dot(nn, L);
      lam = m === MAT_LEAF ? Math.pow(clamp01(lam * 0.6 + 0.4), 1.6) : Math.max(0, lam);
      // 화면 공간 그림자: 빛 쪽으로 걸어가며 깊이 버퍼에 가리는 것이 있나
      let sh = 1;
      if (lam > 0.02) {
        const P: V3 = [H.px[k]!, H.py[k]!, H.pz[k]!];
        for (let s = 1; s <= 12; s++) {
          const q: V3 = [P[0] + L[0] * s * 2.2, P[1] + L[1] * s * 2.2, P[2] + L[2] * s * 2.2];
          const qx = Math.floor(AX74 + q[0]);
          const qy = Math.floor(AY74 - (q[1] * CE - q[2] * SE));
          if (qx < 0 || qy < 0 || qx >= BW74 || qy >= BH74) break;
          const qk = qy * BW74 + qx;
          if (!mat[qk]) continue;
          const tq = dot(q, FWD) + 60;
          const dd = H.depth[qk]!;
          if (dd < tq - 1.2 && dd > tq - 14) {
            sh = 0.25;
            break;
          }
        }
      }
      const lit = clamp01((0.3 + 0.75 * lam * sh) * ao[k]!);
      const b = BASE74[m]!;
      iLit.data[k * 4] = clamp(b[0] * lit * 1.35, 0, 255);
      iLit.data[k * 4 + 1] = clamp(b[1] * lit * 1.35, 0, 255);
      iLit.data[k * 4 + 2] = clamp(b[2] * lit * 1.35, 0, 255);
      iLit.data[k * 4 + 3] = 255;
      const ramp = RAMP74[m]!;
      const nr = ramp.length;
      const idx = clamp(Math.round(lit * (nr - 1) + (dither ? (dith[k]! - 0.5) * 0.9 : 0)), 0, nr - 1);
      const c = ramp[idx]!;
      iPal.data[k * 4] = c[0];
      iPal.data[k * 4 + 1] = c[1];
      iPal.data[k * 4 + 2] = c[2];
      iPal.data[k * 4 + 3] = 255;
    }
    c2(cLit).putImageData(iLit, 0, 0);
    c2(cPal).putImageData(iPal, 0, 0);
  };
  const STAGES = [
    { name: '① 깊이', c: cDepth, ground: false },
    { name: '② 법선', c: cNorm, ground: false },
    { name: '③ 재질', c: cMat, ground: false },
    { name: '④ 빛 계산', c: cLit, ground: true },
    { name: '⑤ 팔레트 + 디더', c: cPal, ground: true },
  ];
  const drawPanel = (g: G, i: number, x: number, y: number, pw: number, ph: number, u: number, big: boolean): void => {
    const st = STAGES[i]!;
    rr(g, x, y, pw, ph, 6 * u);
    g.fillStyle = st.ground ? '#b9cf86' : '#1b2140';
    g.fill();
    g.save();
    rr(g, x, y, pw, ph, 6 * u);
    g.clip();
    const sc = Math.min(pw / BW74, ph / BH74);
    const ox = x + (pw - BW74 * sc) / 2;
    const oy = y + (ph - BH74 * sc) / 2;
    if (st.ground) {
      // 땅 + 오른쪽 아래로 늘어진 부드러운 그림자 (빛 방향 따라)
      g.fillStyle = '#a8c070';
      g.beginPath();
      g.ellipse(ox + AX74 * sc, oy + AY74 * sc, 64 * sc, 18 * sc, 0, 0, Math.PI * 2);
      g.fill();
      const dx = -L[0] * 10 * sc;
      const dy = (-L[2] * 0.5 + 0.3) * 6 * sc;
      g.fillStyle = 'rgba(40,60,30,.32)';
      for (const [sx, r, ry] of [
        [-23, 15, 6],
        [27, 13, 5],
        [41, 6, 3],
      ] as const) {
        g.beginPath();
        g.ellipse(ox + (AX74 + sx) * sc + dx, oy + (AY74 - 1) * sc + dy, r * sc, ry * sc, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.imageSmoothingEnabled = false;
    g.drawImage(st.c, ox, oy, BW74 * sc, BH74 * sc);
    g.imageSmoothingEnabled = true;
    g.restore();
    if (big) pill(g, st.name, x + 8 * u, y + 12 * u, 8.5 * u, 'rgba(15,20,50,.75)', '#fff', 'left');
  };
  const controls: Control[] = [
    { type: 'range', label: '단계 (0 = 자동)', min: 0, max: 5, step: 1, value: 0, on: (v) => (fixed = v) },
    { type: 'toggle', label: '잡음 디더', value: dither, on: (v) => ((dither = v), (lastShade = -1)) },
  ];
  return {
    controls,
    draw(g: G, w: number, h: number, t: number) {
      reset(g);
      const u = scaleOf(w, h);
      bg(g, w, h, '#232c63', '#0d1230');
      if (lastShade < 0 || t - lastShade > 0.07) {
        shadePass(t);
        lastShade = t;
      }
      const cur = fixed > 0 ? fixed - 1 : Math.floor(t / 2.2) % 5;
      // 오른쪽: 단계 목록 (작은 그림 5장)
      const colW = w * 0.3;
      const gap = 4 * u;
      const th = (h - gap * 6) / 5;
      const tw = Math.min(colW - 6 * u, th * (BW74 / BH74));
      const x0 = w - tw - 8 * u;
      for (let i = 0; i < 5; i++) {
        const y = gap + i * (th + gap);
        drawPanel(g, i, x0, y, tw, th, u, false);
        g.lineWidth = (i === cur ? 2.5 : 1) * u;
        g.strokeStyle = i === cur ? '#ffd23f' : 'rgba(255,255,255,.25)';
        rr(g, x0, y, tw, th, 6 * u);
        g.stroke();
        txt(g, STAGES[i]!.name.split(' ')[0]!, x0 - 7 * u, y + th / 2, 9 * u, i === cur ? '#ffd23f' : '#9aa6dd', 'center', F, 800);
        if (i < 4) txt(g, '↓', x0 + tw / 2, y + th + gap / 2, 6 * u, 'rgba(255,255,255,.5)');
      }
      // 왼쪽: 큰 그림
      const bx = 8 * u;
      const by = 8 * u;
      const bw = x0 - 22 * u - bx;
      const bh = h - 16 * u;
      drawPanel(g, cur, bx, by, bw, bh, u, true);
      const note = cur < 3 ? 'G-buffer · 한 번만 굽기' : cur === 3 ? '빛 · 그림자 · 구석 그늘' : '색 사다리 + 잡음 디더';
      g.font = `800 ${7 * u}px ${F}`;
      const nw = g.measureText(note).width + 7 * 1.3 * u;
      pill(g, note, bx + bw - 8 * u - nw, by + 12 * u, 7 * u, cur < 3 ? 'rgba(90,110,220,.85)' : '#ff6fa8', '#fff', 'left');
    },
  };
}

/* ═════════════════════ i75 안개 걷기 ═════════════════════ */
const N75 = 18;
function makeI75() {
  const ter = new Uint8Array(N75 * N75); // 0 물 · 1 모래 · 2 풀
  const obj = new Uint8Array(N75 * N75); // 0 없음 · 1 나무 · 2 바위 · 3 꽃
  for (let j = 0; j < N75; j++)
    for (let i = 0; i < N75; i++) {
      const dx = (i - N75 / 2 + 0.5) / (N75 / 2);
      const dy = (j - N75 / 2 + 0.5) / (N75 / 2);
      let hgt = fbm(i * 0.21, j * 0.21, 4) + 0.38 - Math.hypot(dx, dy) * 0.42;
      if (Math.hypot(i - 11.5, j - 6) < 2.2) hgt -= 0.4; // 호수
      const k = j * N75 + i;
      ter[k] = hgt < 0.36 ? 0 : hgt < 0.43 ? 1 : 2;
      const r = hash2(i, j, 11);
      if (ter[k] === 2) obj[k] = r < 0.16 ? 1 : r < 0.21 ? 2 : r < 0.3 ? 3 : 0;
      else if (ter[k] === 1 && r < 0.08) obj[k] = 2;
    }
  const land = (i: number, j: number): boolean => i >= 0 && j >= 0 && i < N75 && j < N75 && ter[j * N75 + i]! > 0;
  let start: [number, number] = [9, 9];
  for (let r = 0; r < 9 && !land(start[0], start[1]); r++) start = [9 - r, 9 + (r % 2)];
  const E = new Float32Array(N75 * N75); // 드러난 정도 (0..1, 천천히)
  const T = new Float32Array(N75 * N75); // 목표
  const visits = new Float32Array(N75 * N75);
  const walker = { i: start[0], j: start[1], ni: start[0], nj: start[1], p: 1, x: start[0], y: start[1] };
  let resetAt = 0;
  let resetting = false;
  // 안개 마스크 — 땅 칸당 4화소, 둘레 3칸 여유
  const K = 4;
  const P = 3;
  const MW = (N75 + 2 * P) * K;
  const mask = mkCanvas(MW, MW);
  const rim = mkCanvas(MW, MW);
  const mImg = c2(mask).createImageData(MW, MW);
  const rImg = c2(rim).createImageData(MW, MW);
  const noiseM = new Float32Array(MW * MW);
  for (let y = 0; y < MW; y++) for (let x = 0; x < MW; x++) noiseM[y * MW + x] = vnoise(x / 6, y / 6, 71) * 0.62 + vnoise(x / 2.4, y / 2.4, 73) * 0.38 - 0.5;
  const eAt = (i: number, j: number): number => (i < 0 || j < 0 || i >= N75 || j >= N75 ? 0 : E[j * N75 + i]!);
  let edgeNoise = true;
  let clouds = true;
  const rebuildMask = (): void => {
    const md = mImg.data;
    const rd = rImg.data;
    const amp = edgeNoise ? 0.55 : 0;
    for (let y = 0; y < MW; y++)
      for (let x = 0; x < MW; x++) {
        const tu = x / K - P - 0.5;
        const tv = y / K - P - 0.5;
        const i0 = Math.floor(tu);
        const j0 = Math.floor(tv);
        const fu = tu - i0;
        const fv = tv - j0;
        const v0 = lerp(eAt(i0, j0), eAt(i0 + 1, j0), fu);
        const v1 = lerp(eAt(i0, j0 + 1), eAt(i0 + 1, j0 + 1), fu);
        const v = lerp(v0, v1, fv) + noiseM[y * MW + x]! * amp;
        const k = (y * MW + x) * 4;
        md[k] = md[k + 1] = md[k + 2] = 255;
        md[k + 3] = smooth(0.32, 0.62, v) * 255;
        const band = Math.max(0, 1 - Math.abs(v - 0.42) / 0.2);
        rd[k] = 236;
        rd[k + 1] = 242;
        rd[k + 2] = 255;
        rd[k + 3] = band * band * 150;
      }
    c2(mask).putImageData(mImg, 0, 0);
    c2(rim).putImageData(rImg, 0, 0);
  };
  // 구름 무늬 두 겹 (이어 붙여도 이음새 없게 주기 잡음)
  const cloudTex = (seed: number, s: number): HTMLCanvasElement => {
    const S = 96;
    const c = mkCanvas(S, S);
    const im = c2(c).createImageData(S, S);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const v = pnoise((x / S) * s, (y / S) * s, s, seed) * 0.6 + pnoise((x / S) * s * 2, (y / S) * s * 2, s * 2, seed + 3) * 0.28 + pnoise((x / S) * s * 4, (y / S) * s * 4, s * 4, seed + 5) * 0.12;
        const k = (y * S + x) * 4;
        im.data[k] = im.data[k + 1] = 248;
        im.data[k + 2] = 255;
        im.data[k + 3] = smooth(0.45, 0.75, v) * 200;
      }
    c2(c).putImageData(im, 0, 0);
    return c;
  };
  const cl1 = cloudTex(21, 3);
  const cl2 = cloudTex(29, 4);
  let fog: HTMLCanvasElement | null = null;
  let ground: HTMLCanvasElement | null = null;
  let gw = 0;
  let gh = 0;
  let hw = 1;
  let hh = 1;
  let ox = 0;
  let oy = 0;
  const scr = (i: number, j: number): [number, number] => [ox + (i - j) * hw, oy + (i + j) * hh];
  const bakeGround = (w: number, h: number): void => {
    ground = mkCanvas(w, h);
    fog = mkCanvas(w, h);
    const q = c2(ground);
    const COL: string[][] = [
      ['#4aa3d8', '#55acdf'],
      ['#ead79a', '#e3cd8c'],
      ['#7fc45a', '#74bb52'],
    ];
    for (let j = 0; j < N75; j++)
      for (let i = 0; i < N75; i++) {
        const k = j * N75 + i;
        const tt = ter[k]!;
        const [x, y] = scr(i, j);
        q.beginPath();
        q.moveTo(x, y);
        q.lineTo(x + hw, y + hh);
        q.lineTo(x, y + hh * 2);
        q.lineTo(x - hw, y + hh);
        q.closePath();
        q.fillStyle = COL[tt]![(i + j) & 1]!;
        q.fill();
        q.strokeStyle = 'rgba(0,0,0,.05)';
        q.stroke();
        if (tt === 2 && hash2(i, j, 5) < 0.5) {
          q.fillStyle = '#5fa846';
          for (let s = 0; s < 3; s++) q.fillRect(x + (hash2(i, j, s) - 0.5) * hw, y + hh * (0.6 + hash2(j, i, s) * 0.8), Math.max(1, hw * 0.12), Math.max(1, hw * 0.22));
        }
      }
  };
  const step = (dt: number): boolean => {
    let changed = false;
    // 걷는 아이: 아직 안 가 본 쪽을 좋아한다
    walker.p += dt * 2.4;
    if (walker.p >= 1) {
      walker.i = walker.ni;
      walker.j = walker.nj;
      visits[walker.j * N75 + walker.i]! += 1;
      const cands: [number, number, number][] = [];
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const a = walker.i + di;
        const b = walker.j + dj;
        if (!land(a, b)) continue;
        let unexplored = 0;
        for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) if (land(a + x, b + y) && T[(b + y) * N75 + a + x] === 0) unexplored++;
        cands.push([a, b, unexplored * 1.5 - visits[b * N75 + a]! * 2 + hash2(a + walker.p * 999, b, Math.floor(performance.now())) * 3]);
      }
      cands.sort((p, q) => q[2] - p[2]);
      const c = cands[0];
      if (c) {
        walker.ni = c[0];
        walker.nj = c[1];
      }
      walker.p = 0;
    }
    walker.x = lerp(walker.i, walker.ni, walker.p);
    walker.y = lerp(walker.j, walker.nj, walker.p);
    if (!resetting)
      for (let j = 0; j < N75; j++)
        for (let i = 0; i < N75; i++) if (Math.hypot(i - walker.x, j - walker.y) < 2.6) T[j * N75 + i] = 1;
    for (let k = 0; k < E.length; k++) {
      const d = T[k]! - E[k]!;
      if (Math.abs(d) > 0.001) {
        E[k] = E[k]! + clamp(d, -dt * 1.2, dt * 2.5);
        changed = true;
      }
    }
    return changed;
  };
  let lastNoise = edgeNoise;
  const controls: Control[] = [
    { type: 'toggle', label: '경계 잡음', value: edgeNoise, on: (v) => (edgeNoise = v) },
    { type: 'toggle', label: '흐르는 구름', value: clouds, on: (v) => (clouds = v) },
  ];
  return {
    controls,
    draw(g: G, w: number, h: number, t: number, dt: number) {
      reset(g);
      const u = scaleOf(w, h);
      dt = Math.min(dt, 0.05);
      const nhw = Math.min((w * 0.96) / (2 * N75), (h * 0.9) / N75);
      if (!ground || gw !== w || gh !== h || Math.abs(nhw - hw) > 0.01) {
        gw = w;
        gh = h;
        hw = nhw;
        hh = hw / 2;
        ox = w / 2;
        oy = h / 2 - N75 * hh;
        bakeGround(w, h);
      }
      // 다 걸으면 안개를 다시 덮고 처음부터
      let explored = 0;
      let landN = 0;
      for (let k = 0; k < T.length; k++)
        if (ter[k]) {
          landN++;
          explored += T[k]!;
        }
      if (!resetting && (explored / landN > 0.8 || t - resetAt > 50)) {
        resetting = true;
        resetAt = t;
        T.fill(0);
        visits.fill(0);
      }
      if (resetting && t - resetAt > 1.4) {
        resetting = false;
        resetAt = t;
      }
      const changed = step(dt);
      if (changed || lastNoise !== edgeNoise) rebuildMask();
      lastNoise = edgeNoise;
      g.fillStyle = '#2b3556';
      g.fillRect(0, 0, w, h);
      g.drawImage(ground!, 0, 0, w, h);
      // 물 반짝임
      g.strokeStyle = 'rgba(255,255,255,.55)';
      g.lineWidth = Math.max(1, hw * 0.08);
      for (let j = 0; j < N75; j++)
        for (let i = 0; i < N75; i++) {
          if (ter[j * N75 + i] !== 0 || hash2(i, j, 2) > 0.35) continue;
          const ph = (t * 0.8 + hash2(i, j, 8) * 6) % 3;
          if (ph > 1) continue;
          const [x, y] = scr(i + 0.5, j + 0.5);
          g.globalAlpha = Math.sin(ph * Math.PI);
          g.beginPath();
          g.moveTo(x - hw * 0.3, y);
          g.lineTo(x + hw * 0.3, y);
          g.stroke();
        }
      g.globalAlpha = 1;
      // 안개 층: 바탕 + 구름 두 겹 → 드러난 곳은 마스크로 뚫기
      const f = c2(fog!);
      reset(f);
      f.setTransform(1, 0, 0, 1, 0, 0);
      f.globalCompositeOperation = 'source-over';
      const fg = f.createLinearGradient(0, 0, 0, h);
      fg.addColorStop(0, '#5d6c95');
      fg.addColorStop(1, '#3d4a72');
      f.fillStyle = fg;
      f.fillRect(0, 0, w, h);
      if (clouds) {
        const tile = (img: HTMLCanvasElement, size: number, sx: number, sy: number, a: number): void => {
          f.globalAlpha = a;
          const x0 = (((sx % size) + size) % size) - size;
          const y0 = (((sy % size) + size) % size) - size;
          for (let y = y0; y < h; y += size) for (let x = x0; x < w; x += size) f.drawImage(img, x, y, size + 0.5, size + 0.5);
        };
        tile(cl1, 200 * u, t * 9 * u, t * 3 * u, 0.55);
        tile(cl2, 120 * u, -t * 15 * u, t * 5 * u, 0.4);
        f.globalAlpha = 1;
      }
      f.globalCompositeOperation = 'destination-out';
      f.imageSmoothingEnabled = true;
      // 마스크(땅 칸 좌표) → 등각 마름모로 비틀어 그리기
      f.setTransform(hw / K, hh / K, -hw / K, hh / K, ox, oy - 2 * P * hh);
      f.drawImage(mask, 0, 0);
      f.setTransform(1, 0, 0, 1, 0, 0);
      f.globalCompositeOperation = 'source-over';
      g.drawImage(fog!, 0, 0, w, h);
      // 경계의 옅은 안개 띠
      g.save();
      g.setTransform(g.getTransform().multiply(new DOMMatrix([hw / K, hh / K, -hw / K, hh / K, ox, oy - 2 * P * hh])));
      g.globalAlpha = 0.85;
      g.drawImage(rim, 0, 0);
      g.restore();
      // 물건 · 아이: 바닥만 가리고 키 큰 것은 안 잘림 (드러난 칸이면 통째로)
      const items: { d: number; fn: () => void }[] = [];
      for (let j = 0; j < N75; j++)
        for (let i = 0; i < N75; i++) {
          const o = obj[j * N75 + i]!;
          const e = E[j * N75 + i]!;
          if (!o || e < 0.35) continue;
          items.push({
            d: i + j,
            fn: () => {
              const [x, y] = scr(i + 0.5, j + 0.5);
              g.globalAlpha = smooth(0.35, 0.7, e);
              if (o === 1) {
                const s = hw * (0.9 + hash2(i, j, 4) * 0.3);
                g.fillStyle = 'rgba(30,60,30,.25)';
                g.beginPath();
                g.ellipse(x + s * 0.2, y, s * 0.6, s * 0.28, 0, 0, Math.PI * 2);
                g.fill();
                g.fillStyle = '#7a5234';
                g.fillRect(x - s * 0.1, y - s * 1.1, s * 0.2, s * 1.1);
                for (const [dy, r, c] of [
                  [1.5, 0.62, '#3f8a3c'],
                  [2.1, 0.5, '#4fa046'],
                  [2.6, 0.34, '#66b955'],
                ] as const) {
                  g.fillStyle = c;
                  g.beginPath();
                  g.arc(x, y - s * dy, s * r, 0, Math.PI * 2);
                  g.fill();
                }
                g.fillStyle = 'rgba(255,255,255,.25)';
                g.beginPath();
                g.arc(x - s * 0.15, y - s * 2.75, s * 0.12, 0, Math.PI * 2);
                g.fill();
              } else if (o === 2) {
                g.fillStyle = '#8d8c98';
                g.beginPath();
                g.ellipse(x, y - hh * 0.3, hw * 0.4, hh * 0.55, 0, 0, Math.PI * 2);
                g.fill();
                g.fillStyle = '#b6b4bf';
                g.beginPath();
                g.ellipse(x - hw * 0.1, y - hh * 0.5, hw * 0.22, hh * 0.28, 0, 0, Math.PI * 2);
                g.fill();
              } else {
                for (let s = 0; s < 3; s++) {
                  g.fillStyle = ['#ff7aa8', '#ffd84a', '#ffffff'][s]!;
                  g.beginPath();
                  g.arc(x + (s - 1) * hw * 0.3, y - hh * 0.2 + (s % 2) * hh * 0.3, Math.max(1, hw * 0.1), 0, Math.PI * 2);
                  g.fill();
                }
              }
              g.globalAlpha = 1;
            },
          });
        }
      items.push({
        d: walker.x + walker.y + 0.6,
        fn: () => {
          const [x, y] = scr(walker.x + 0.5, walker.y + 0.5);
          const s = hw * 0.85;
          const bob = Math.abs(Math.sin(t * 10)) * s * 0.12;
          g.fillStyle = 'rgba(30,30,60,.3)';
          g.beginPath();
          g.ellipse(x, y, s * 0.35, s * 0.16, 0, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#ff6f61';
          rr(g, x - s * 0.25, y - s * 0.95 - bob, s * 0.5, s * 0.62, s * 0.2);
          g.fill();
          g.fillStyle = '#ffd9b8';
          g.beginPath();
          g.arc(x, y - s * 1.15 - bob, s * 0.27, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#ffe14a';
          g.beginPath();
          g.ellipse(x, y - s * 1.33 - bob, s * 0.38, s * 0.1, 0, 0, Math.PI * 2);
          g.fill();
          g.beginPath();
          g.arc(x, y - s * 1.38 - bob, s * 0.18, Math.PI, 0);
          g.fill();
        },
      });
      items.sort((a, b) => a.d - b.d);
      for (const it of items) it.fn();
      const pct = Math.round((explored / landN) * 100);
      pill(g, `탐험 ${pct}%`, 8 * u, 13 * u, 8.5 * u, 'rgba(20,26,60,.75)', '#fff', 'left');
    },
  };
}

/* ═════════════════════ i76 낮 · 밤 빛 버퍼 ═════════════════════ */
function glowSprite(r: number, g0: number, b: number): HTMLCanvasElement {
  const c = mkCanvas(64, 64);
  const q = c2(c);
  const gr = q.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(${r},${g0},${b},1)`);
  gr.addColorStop(0.35, `rgba(${r},${g0},${b},.55)`);
  gr.addColorStop(1, `rgba(${r},${g0},${b},0)`);
  q.fillStyle = gr;
  q.fillRect(0, 0, 64, 64);
  return c;
}
function makeI76() {
  const N = 9;
  let scene: HTMLCanvasElement | null = null;
  let layer: HTMLCanvasElement | null = null;
  let light: HTMLCanvasElement | null = null;
  let sw = 0;
  let sh = 0;
  let hw = 1;
  let hh = 1;
  let ox = 0;
  let oy = 0;
  const lamps: { x: number; y: number; r: number; kind: 'lamp' | 'win' }[] = [];
  let tower = { x: 0, y: 0 };
  const P = (i: number, j: number, z = 0): [number, number] => [ox + (i - j) * hw, oy + (i + j) * hh - z * hh * 2];
  const glowWarm = glowSprite(255, 196, 112);
  const glowWin = glowSprite(255, 214, 140);
  const glowFly = glowSprite(200, 255, 140);
  const poly = (q: G, pts: [number, number][], fill: string, stroke = 'rgba(40,30,40,.35)'): void => {
    q.beginPath();
    pts.forEach((p, i) => (i ? q.lineTo(p[0], p[1]) : q.moveTo(p[0], p[1])));
    q.closePath();
    q.fillStyle = fill;
    q.fill();
    q.strokeStyle = stroke;
    q.lineWidth = Math.max(0.6, hw * 0.04);
    q.stroke();
  };
  const WATER = (i: number, j: number): boolean => j >= 7 || (i >= 7 && j >= 5);
  const PATH = (i: number, j: number): boolean => (i === 4 && j < 7) || (j === 3 && i < 7);
  const bake = (w: number, h: number): void => {
    scene = mkCanvas(w, h);
    layer = mkCanvas(w, h);
    light = mkCanvas(Math.ceil(w / 2), Math.ceil(h / 2));
    lamps.length = 0;
    const q = c2(scene);
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const wt = WATER(i, j);
        const c = wt ? ((i + j) & 1 ? '#4ea8dc' : '#57b0e2') : PATH(i, j) ? '#e6cf94' : (i + j) & 1 ? '#86c95c' : '#7cc054';
        poly(q, [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)], c, 'rgba(0,0,0,.06)');
      }
    // 땅 옆면
    poly(q, [P(0, N), P(N, N), P(N, N, -0.5), P(0, N, -0.5)], '#6b4a34');
    poly(q, [P(N, 0), P(N, N), P(N, N, -0.5), P(N, 0, -0.5)], '#8a6040');
    const items: { d: number; fn: () => void }[] = [];
    const house = (i0: number, j0: number, di: number, dj: number, hgt: number, wall: string, wallR: string, roof: string, roofD: string): void => {
      items.push({
        d: i0 + j0 + di + dj,
        fn: () => {
          poly(q, [P(i0, j0 + dj), P(i0 + di, j0 + dj), P(i0 + di, j0 + dj, hgt), P(i0, j0 + dj, hgt)], wall);
          poly(q, [P(i0 + di, j0), P(i0 + di, j0 + dj), P(i0 + di, j0 + dj, hgt), P(i0 + di, j0, hgt)], wallR);
          const rh = hgt * 0.75;
          poly(q, [P(i0, j0, hgt), P(i0 + di, j0, hgt), P(i0 + di, j0 + dj / 2, hgt + rh), P(i0, j0 + dj / 2, hgt + rh)], roofD);
          poly(q, [P(i0 + di, j0, hgt), P(i0 + di, j0 + dj, hgt), P(i0 + di, j0 + dj / 2, hgt + rh)], wallR);
          poly(q, [P(i0, j0 + dj, hgt), P(i0 + di, j0 + dj, hgt), P(i0 + di, j0 + dj / 2, hgt + rh), P(i0, j0 + dj / 2, hgt + rh)], roof);
          // 창문 (밤에 빛)
          for (const a of [0.3, 0.7]) {
            const [x, y] = P(i0 + di * a, j0 + dj, hgt * 0.5);
            poly(q, [
              [x - hw * 0.12, y - hh * 0.25],
              [x + hw * 0.12, y - hh * 0.1],
              [x + hw * 0.12, y + hh * 0.35],
              [x - hw * 0.12, y + hh * 0.2],
            ], '#ffe6a0');
            lamps.push({ x, y, r: hw * 0.9, kind: 'win' });
          }
          const [dx, dy] = P(i0 + di, j0 + dj * 0.5, 0);
          poly(q, [
            [dx, dy - hh * 0.05],
            [dx + hw * 0.22, dy - hh * 0.27],
            [dx + hw * 0.22, dy - hh * 1.17],
            [dx, dy - hh * 0.95],
          ], '#7a4a2a');
        },
      });
    };
    house(1, 0.6, 2, 1.8, 1.2, '#f6e3c4', '#e2c9a2', '#e8624f', '#b9493c');
    house(5.4, 0.8, 1.8, 1.8, 1.0, '#fff2d8', '#ead6b2', '#4f8fd8', '#3a6fb0');
    house(1, 4.4, 1.6, 2, 1.1, '#f2ddc8', '#dcc4a8', '#f0a43c', '#c47f28');
    house(5.2, 4.2, 1.6, 1.4, 0.9, '#f8ead0', '#e4d0b0', '#a46ad8', '#7f4fb0');
    const tree = (i: number, j: number, s: number): void => {
      items.push({
        d: i + j,
        fn: () => {
          const [x, y] = P(i, j);
          q.fillStyle = 'rgba(30,60,30,.22)';
          q.beginPath();
          q.ellipse(x + hw * 0.2, y, hw * 0.5 * s, hh * 0.45 * s, 0, 0, Math.PI * 2);
          q.fill();
          q.fillStyle = '#7a5234';
          q.fillRect(x - hw * 0.07, y - hh * 1.4 * s, hw * 0.14, hh * 1.4 * s);
          for (const [dy, r, c] of [
            [2.0, 0.5, '#3f8a3c'],
            [2.7, 0.42, '#4fa046'],
            [3.3, 0.28, '#6abb58'],
          ] as const) {
            q.fillStyle = c;
            q.beginPath();
            q.arc(x, y - hh * dy * s, hw * r * s, 0, Math.PI * 2);
            q.fill();
          }
        },
      });
    };
    tree(0.5, 2.6, 1);
    tree(3.4, 6.4, 1.1);
    tree(7.6, 2.8, 0.9);
    tree(6.6, 6.2, 1);
    tree(0.6, 6.6, 0.9);
    const lamp = (i: number, j: number): void => {
      items.push({
        d: i + j,
        fn: () => {
          const [x, y] = P(i, j);
          q.fillStyle = '#4a3a3a';
          q.fillRect(x - hw * 0.04, y - hh * 2.2, hw * 0.08, hh * 2.2);
          q.fillStyle = '#ffd36a';
          rr(q, x - hw * 0.12, y - hh * 2.6, hw * 0.24, hh * 0.45, hw * 0.05);
          q.fill();
          q.fillStyle = '#4a3a3a';
          q.fillRect(x - hw * 0.15, y - hh * 2.7, hw * 0.3, hh * 0.12);
          lamps.push({ x, y: y - hh * 2.4, r: hw * 2.1, kind: 'lamp' });
        },
      });
    };
    lamp(3.8, 2.8);
    lamp(4.6, 5.6);
    lamp(2.2, 3.7);
    lamp(6.8, 3.6);
    // 등대 (바닷가 모서리)
    items.push({
      d: 8.2 + 6.2,
      fn: () => {
        const [x, y] = P(8.2, 6.2);
        const tw = hw * 0.32;
        const th = hh * 5.2;
        q.fillStyle = 'rgba(30,40,60,.25)';
        q.beginPath();
        q.ellipse(x, y, tw * 1.3, tw * 0.6, 0, 0, Math.PI * 2);
        q.fill();
        for (let s = 0; s < 5; s++) {
          const y0 = y - (th * s) / 5;
          const w0 = tw * (1 - s * 0.08);
          const w1 = tw * (1 - (s + 1) * 0.08);
          poly(q, [
            [x - w0, y0],
            [x + w0, y0],
            [x + w1, y0 - th / 5],
            [x - w1, y0 - th / 5],
          ], s % 2 ? '#e8524a' : '#fbf6ee');
        }
        const top = y - th;
        q.fillStyle = '#ffe680';
        rr(q, x - tw * 0.55, top - hh * 0.75, tw * 1.1, hh * 0.75, 2);
        q.fill();
        poly(q, [
          [x - tw * 0.8, top - hh * 0.75],
          [x + tw * 0.8, top - hh * 0.75],
          [x, top - hh * 1.5],
        ], '#3a4a6a');
        tower = { x, y: top - hh * 0.38 };
      },
    });
    items.sort((a, b) => a.d - b.d);
    for (const it of items) it.fn();
  };
  let auto = true;
  let hour = 20;
  let useBuffer = true;
  let clockH = 12;
  const controls: Control[] = [
    { type: 'toggle', label: '시간 저절로', value: auto, on: (v) => (auto = v) },
    { type: 'range', label: '시각', min: 0, max: 24, step: 0.25, value: hour, on: (v) => ((hour = v), (auto = false)) },
    { type: 'toggle', label: '빛 버퍼 (끄면 그냥 어둡게)', value: useBuffer, on: (v) => (useBuffer = v) },
  ];
  const stars = Array.from({ length: 60 }, (_, i) => [hash2(i, 1, 9), hash2(i, 2, 9) * 0.5, hash2(i, 3, 9)] as const);
  const flies = Array.from({ length: 14 }, (_, i) => [hash2(i, 4, 1) * 7 + 0.5, hash2(i, 5, 1) * 6 + 0.5, hash2(i, 6, 1) * 6] as const);
  return {
    controls,
    draw(g: G, w: number, h: number, t: number) {
      reset(g);
      const u = scaleOf(w, h);
      const nhw = Math.min((w * 0.86) / (2 * N), (h * 0.66) / N);
      if (!scene || sw !== w || sh !== h) {
        sw = w;
        sh = h;
        hw = nhw;
        hh = hw / 2;
        ox = w / 2 - hw * 0.3;
        oy = h * 0.5 - N * hh + hh * 1.6;
        bake(w, h);
      }
      clockH = auto ? (14 + t * 1.1) % 24 : hour;
      const H = clockH;
      // 어둠 dk: 낮 0 · 밤 1, 노을빛 warm
      const dk = H < 5 ? 1 : H < 7.5 ? 1 - smooth(5, 7.5, H) : H < 17.5 ? 0 : H < 20.5 ? smooth(17.5, 20.5, H) : 1;
      const warm = Math.max(0, 1 - Math.abs(H - 18.2) / 1.8) + Math.max(0, 1 - Math.abs(H - 6.3) / 1.3) * 0.6;
      // 하늘
      const top = [lerp(lerp(120, 255, warm * 0.4), 14, dk), lerp(lerp(196, 150, warm * 0.6), 18, dk), lerp(lerp(255, 160, warm * 0.6), 52, dk)];
      const bot = [lerp(lerp(214, 255, warm), 40, dk), lerp(lerp(238, 190, warm), 44, dk), lerp(lerp(255, 150, warm), 96, dk)];
      bg(g, w, h, `rgb(${top.map((v) => v | 0).join(',')})`, `rgb(${bot.map((v) => v | 0).join(',')})`);
      if (dk > 0.2) {
        g.fillStyle = '#fff';
        for (const [sx, sy, ph] of stars) {
          g.globalAlpha = (dk - 0.2) * (0.5 + 0.5 * Math.sin(t * 2 + ph * 20));
          g.fillRect(sx * w, sy * h, 1.4 * u, 1.4 * u);
        }
        g.globalAlpha = 1;
      }
      // 해 · 달
      const ang = ((H - 6) / 12) * Math.PI;
      const sx = w * 0.5 - Math.cos(ang) * w * 0.42;
      const sy = h * 0.42 - Math.sin(ang) * h * 0.34;
      if (Math.sin(ang) > -0.15) {
        g.fillStyle = warm > 0.3 ? '#ffb15a' : '#fff0a0';
        g.beginPath();
        g.arc(sx, sy, 10 * u, 0, Math.PI * 2);
        g.fill();
      } else {
        const mx = w * 0.5 + Math.cos(ang) * w * 0.42;
        const my = h * 0.42 + Math.sin(ang) * h * 0.34;
        g.fillStyle = '#f4f1dc';
        g.beginPath();
        g.arc(mx, my, 8 * u, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = `rgb(${top.map((v) => v | 0).join(',')})`;
        g.beginPath();
        g.arc(mx + 3.5 * u, my - 2 * u, 7 * u, 0, Math.PI * 2);
        g.fill();
      }
      // 장면 층 = 낮 그림 × 빛 버퍼 (곱하기)
      const lq = c2(layer!);
      reset(lq);
      lq.clearRect(0, 0, w, h);
      lq.drawImage(scene!, 0, 0);
      // 물결 반짝임 (낮에만 잘 보임)
      lq.strokeStyle = 'rgba(255,255,255,.6)';
      lq.lineWidth = Math.max(1, hw * 0.06);
      for (let k = 0; k < 10; k++) {
        const ph = (t * 0.7 + k * 0.37) % 2;
        if (ph > 1) continue;
        const [x, y] = P(1 + ((k * 3.7) % 8), 7.3 + ((k * 1.3) % 1.4));
        lq.globalAlpha = Math.sin(ph * Math.PI) * 0.8;
        lq.beginPath();
        lq.moveTo(x - hw * 0.25, y);
        lq.lineTo(x + hw * 0.25, y);
        lq.stroke();
      }
      lq.globalAlpha = 1;
      const amb = [lerp(255, 46, dk), lerp(255, 56, dk), lerp(255, 112, dk)];
      amb[1] = amb[1]! * (1 - warm * 0.22 * (1 - dk));
      amb[2] = amb[2]! * (1 - warm * 0.45 * (1 - dk));
      const L = c2(light!);
      reset(L);
      L.setTransform(0.5, 0, 0, 0.5, 0, 0);
      L.fillStyle = `rgb(${amb.map((v) => v | 0).join(',')})`;
      L.fillRect(0, 0, w, h);
      const lit = useBuffer ? smooth(0.05, 0.6, dk) : 0;
      if (lit > 0) {
        L.globalCompositeOperation = 'lighter';
        lamps.forEach((lp, i) => {
          const fl = lp.kind === 'lamp' ? 1 + Math.sin(t * 13 + i) * 0.04 + Math.sin(t * 7.3 + i * 2) * 0.04 : 1;
          const r = lp.r * fl;
          L.globalAlpha = lit * (lp.kind === 'lamp' ? 1 : 0.7);
          L.drawImage(lp.kind === 'lamp' ? glowWarm : glowWin, lp.x - r, lp.y - r * 0.7, r * 2, r * 1.4);
        });
        for (let k = 0; k < flies.length; k++) {
          const f = flies[k]!;
          const [x, y] = P(f[0] + Math.sin(t * 0.6 + f[2]) * 0.8, f[1] + Math.cos(t * 0.5 + f[2] * 2) * 0.8, 0.6 + Math.sin(t * 1.3 + k) * 0.3);
          const r = hw * 0.55;
          L.globalAlpha = lit * Math.max(0, Math.sin(t * 2.2 + f[2] * 3));
          L.drawImage(glowFly, x - r, y - r, r * 2, r * 2);
        }
        // 등대 빛줄기: 도는 쐐기
        const a = t * 1.3;
        const len = w * 0.75;
        L.globalAlpha = lit * 0.9;
        const bx = tower.x + Math.cos(a) * len;
        const by = tower.y + Math.sin(a) * len * 0.5;
        const gr = L.createLinearGradient(tower.x, tower.y, bx, by);
        gr.addColorStop(0, 'rgba(255,240,190,1)');
        gr.addColorStop(1, 'rgba(255,240,190,0)');
        L.fillStyle = gr;
        L.beginPath();
        L.moveTo(tower.x, tower.y);
        L.lineTo(tower.x + Math.cos(a - 0.13) * len, tower.y + Math.sin(a - 0.13) * len * 0.5);
        L.lineTo(tower.x + Math.cos(a + 0.13) * len, tower.y + Math.sin(a + 0.13) * len * 0.5);
        L.closePath();
        L.fill();
        L.globalAlpha = lit;
        L.drawImage(glowWarm, tower.x - hw * 1.5, tower.y - hw * 1.1, hw * 3, hw * 2.2);
      }
      lq.globalCompositeOperation = 'multiply';
      lq.drawImage(light!, 0, 0, w, h);
      lq.globalCompositeOperation = 'destination-in';
      lq.drawImage(scene!, 0, 0);
      lq.globalCompositeOperation = 'source-over';
      g.drawImage(layer!, 0, 0, w, h);
      // 더하기 번짐: 등불 · 창 · 반딧불이 진짜 빛나 보이게
      if (lit > 0) {
        g.globalCompositeOperation = 'lighter';
        lamps.forEach((lp) => {
          const r = lp.r * (lp.kind === 'lamp' ? 0.35 : 0.3);
          g.globalAlpha = lit * 0.45;
          g.drawImage(glowWarm, lp.x - r, lp.y - r, r * 2, r * 2);
        });
        for (let k = 0; k < flies.length; k++) {
          const f = flies[k]!;
          const [x, y] = P(f[0] + Math.sin(t * 0.6 + f[2]) * 0.8, f[1] + Math.cos(t * 0.5 + f[2] * 2) * 0.8, 0.6 + Math.sin(t * 1.3 + k) * 0.3);
          g.globalAlpha = lit * Math.max(0, Math.sin(t * 2.2 + f[2] * 3));
          g.drawImage(glowFly, x - hw * 0.18, y - hw * 0.18, hw * 0.36, hw * 0.36);
        }
        g.globalAlpha = lit * 0.25;
        const a = t * 1.3;
        const len = w * 0.6;
        g.fillStyle = 'rgba(255,240,200,.5)';
        g.beginPath();
        g.moveTo(tower.x, tower.y);
        g.lineTo(tower.x + Math.cos(a - 0.08) * len, tower.y + Math.sin(a - 0.08) * len * 0.5);
        g.lineTo(tower.x + Math.cos(a + 0.08) * len, tower.y + Math.sin(a + 0.08) * len * 0.5);
        g.closePath();
        g.fill();
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
      }
      // 노을 안개
      if (warm > 0.05 && dk < 0.9) {
        const hz = g.createLinearGradient(0, h * 0.3, 0, h);
        hz.addColorStop(0, 'rgba(255,170,110,0)');
        hz.addColorStop(1, `rgba(255,170,110,${(warm * 0.22 * (1 - dk)).toFixed(3)})`);
        g.fillStyle = hz;
        g.fillRect(0, 0, w, h);
      }
      // 시계
      const cr = 15 * u;
      const cx = w - cr - 8 * u;
      const cy = cr + 8 * u;
      g.fillStyle = 'rgba(15,20,50,.7)';
      g.beginPath();
      g.arc(cx, cy, cr + 3 * u, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 4 * u;
      for (let k = 0; k < 24; k++) {
        const kd = k < 5 || k >= 20 ? 1 : k < 7 || k >= 17 ? 0.5 : 0;
        g.strokeStyle = kd === 1 ? '#3a4a9a' : kd === 0.5 ? '#ff9a5a' : '#ffd84a';
        g.beginPath();
        g.arc(cx, cy, cr - 2 * u, (k / 24) * Math.PI * 2 - Math.PI / 2, ((k + 1) / 24) * Math.PI * 2 - Math.PI / 2);
        g.stroke();
      }
      const ha = (H / 24) * Math.PI * 2 - Math.PI / 2;
      g.strokeStyle = '#fff';
      g.lineWidth = 2 * u;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(ha) * cr * 0.8, cy + Math.sin(ha) * cr * 0.8);
      g.stroke();
      const hh2 = Math.floor(H);
      const mm = Math.floor((H - hh2) * 60);
      const name = dk > 0.85 ? '밤' : warm > 0.4 ? (H > 12 ? '노을' : '새벽') : dk > 0.2 ? (H > 12 ? '저녁' : '새벽') : '낮';
      txt(g, `${String(hh2).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${name}`, cx - cr - 8 * u, cy, 9 * u, '#fff', 'right', F, 800);
      pill(g, useBuffer ? '빛 버퍼 × 곱하기' : '그냥 어둡게', 8 * u, h - 11 * u, 8 * u, useBuffer ? '#ff6fa8' : 'rgba(15,20,50,.75)', '#fff', 'left');
    },
  };
}

/* ═════════════════════ i77 절차 음악 ═════════════════════ */
// 레 도리아: 레 미 파 솔 라 시 도 (반음 거리)
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const NOTE_NAMES = ['레', '미', '파', '솔', '라', '시', '도'];
interface MNote {
  step: number;
  deg: number; // 음계 칸 (0 = 레4)
  len: number;
}
function composeMelody(seed: number, steps: number): MNote[] {
  const r = rng(seed);
  const out: MNote[] = [];
  let deg = 4;
  let s = 0;
  while (s < steps) {
    const inPhrase = s % 16;
    // 쉼표 조금
    if (inPhrase !== 0 && r() < 0.12) {
      s += 1;
      continue;
    }
    // 걸음은 대개 한 칸 · 가끔 뛰기, 마디 끝은 으뜸음 쪽으로
    const jump = r() < 0.72 ? (r() < 0.5 ? -1 : 1) : Math.round((r() - 0.5) * 6);
    deg = clamp(deg + jump, 0, 11);
    let len = r() < 0.65 ? 1 : 2;
    if (inPhrase >= 14) {
      deg = r() < 0.6 ? 7 : 4;
      len = 16 - inPhrase;
    }
    out.push({ step: s, deg, len });
    s += len;
  }
  return out;
}
const degToMidi = (deg: number): number => 62 + Math.floor(deg / 7) * 12 + DORIAN[((deg % 7) + 7) % 7]!;
const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

function makeI77() {
  const STEPS = 256;
  const mel = composeMelody(7, STEPS);
  // 드론: 두 마디마다 레 ↔ 도 ↔ 솔 (낮은 5도와 함께)
  const DRONE = [50, 50, 48, 55];
  const droneAt = (step: number): number => DRONE[Math.floor(step / 32) % DRONE.length]!;
  let stepDur = 0.3;
  let pos = 0; // 지금 걸음 (소수)
  // ── 소리 (단추로만)
  let ac: AudioContext | null = null;
  let master: GainNode | null = null;
  let analyser: AnalyserNode | null = null;
  let droneOsc: OscillatorNode[] = [];
  let droneGain: GainNode | null = null;
  let timer = 0;
  let anchorT = 0;
  let anchorStep = 0;
  let scheduled = 0;
  let playing = false;
  let wave: Uint8Array<ArrayBuffer> | null = null;
  const pluck = (time: number, hz: number, dur: number): void => {
    if (!ac || !master) return;
    const o1 = ac.createOscillator();
    const o2 = ac.createOscillator();
    const f = ac.createBiquadFilter();
    const gn = ac.createGain();
    o1.type = 'triangle';
    o2.type = 'sine';
    o1.frequency.value = hz;
    o2.frequency.value = hz * 2.01;
    f.type = 'lowpass';
    f.frequency.setValueAtTime(hz * 8, time);
    f.frequency.exponentialRampToValueAtTime(hz * 1.5, time + 0.4);
    gn.gain.setValueAtTime(0.0001, time);
    gn.gain.exponentialRampToValueAtTime(0.28, time + 0.006);
    gn.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(0.6, dur * 2.2));
    const g2 = ac.createGain();
    g2.gain.value = 0.35;
    o1.connect(f);
    o2.connect(g2).connect(f);
    f.connect(gn).connect(master);
    o1.start(time);
    o2.start(time);
    o1.stop(time + dur * 2.4 + 0.7);
    o2.stop(time + dur * 2.4 + 0.7);
  };
  const audioPos = (): number => (ac ? anchorStep + (ac.currentTime - anchorT) / stepDur : pos);
  const schedule = (): void => {
    if (!ac || !playing) return;
    const ahead = audioPos() + 0.25 / stepDur + 1;
    while (scheduled < ahead) {
      const s = scheduled;
      const at = anchorT + (s - anchorStep) * stepDur;
      const wrapped = ((s % STEPS) + STEPS) % STEPS;
      for (const n of mel) if (n.step === wrapped && at > ac.currentTime - 0.01) pluck(at, midiHz(degToMidi(n.deg)), n.len * stepDur);
      if (wrapped % 32 === 0 && droneOsc.length) {
        const root = droneAt(wrapped);
        droneOsc[0]!.frequency.setTargetAtTime(midiHz(root - 12), at, 0.4);
        droneOsc[1]!.frequency.setTargetAtTime(midiHz(root - 5), at, 0.4);
      }
      scheduled++;
    }
  };
  const play = (): void => {
    if (playing) return;
    try {
      if (!ac) {
        ac = new AudioContext();
        master = ac.createGain();
        master.gain.value = 0.5;
        const delay = ac.createDelay(1);
        delay.delayTime.value = 0.33;
        const fb = ac.createGain();
        fb.gain.value = 0.32;
        const wet = ac.createGain();
        wet.gain.value = 0.35;
        master.connect(delay);
        delay.connect(fb).connect(delay);
        delay.connect(wet);
        analyser = ac.createAnalyser();
        analyser.fftSize = 1024;
        wave = new Uint8Array(new ArrayBuffer(analyser.fftSize));
        master.connect(analyser);
        wet.connect(analyser);
        analyser.connect(ac.destination);
      }
      void ac.resume();
      // 드론: 톱니 둘을 낮은 통과 필터로 · 느린 흔들림
      droneGain = ac.createGain();
      droneGain.gain.setValueAtTime(0.0001, ac.currentTime);
      droneGain.gain.exponentialRampToValueAtTime(0.06, ac.currentTime + 1.2);
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      const lfo = ac.createOscillator();
      const lfoG = ac.createGain();
      lfo.frequency.value = 0.13;
      lfoG.gain.value = 180;
      lfo.connect(lfoG).connect(lp.frequency);
      const root = droneAt(Math.floor(pos) % STEPS);
      droneOsc = [ac.createOscillator(), ac.createOscillator(), lfo];
      droneOsc[0]!.type = 'sawtooth';
      droneOsc[1]!.type = 'sawtooth';
      droneOsc[0]!.frequency.value = midiHz(root - 12);
      droneOsc[1]!.frequency.value = midiHz(root - 5);
      droneOsc[0]!.connect(lp);
      droneOsc[1]!.connect(lp);
      lp.connect(droneGain).connect(master!);
      for (const o of droneOsc) o.start();
      anchorT = ac.currentTime + 0.05;
      anchorStep = Math.ceil(pos);
      scheduled = anchorStep;
      playing = true;
      timer = window.setInterval(schedule, 50);
      schedule();
    } catch {
      playing = false;
    }
  };
  const stop = (): void => {
    if (!playing || !ac) return;
    pos = audioPos();
    playing = false;
    window.clearInterval(timer);
    const now = ac.currentTime;
    if (droneGain) droneGain.gain.setTargetAtTime(0.0001, now, 0.15);
    const os = droneOsc;
    for (const o of os) o.stop(now + 0.8);
    droneOsc = [];
  };
  const controls: Control[] = [
    { type: 'button', label: '▶ 소리 듣기', on: play },
    { type: 'button', label: '■ 멈춤', on: stop },
    {
      type: 'range',
      label: '빠르기',
      min: 0.14,
      max: 0.4,
      step: 0.01,
      value: 0.24,
      on: (v) => {
        if (playing && ac) {
          anchorStep = audioPos();
          anchorT = ac.currentTime;
          scheduled = Math.ceil(anchorStep);
        }
        stepDur = 0.54 - v;
      },
    },
  ];
  const NOTE_COL = ['#ff6f91', '#ff9f5a', '#ffd23f', '#7be07a', '#4fd1c5', '#5aa9ff', '#a98bff'];
  return {
    controls,
    dispose() {
      stop();
      window.clearInterval(timer);
      if (ac) void ac.close();
      ac = null;
    },
    draw(g: G, w: number, h: number, _t: number, dt: number) {
      reset(g);
      const u = scaleOf(w, h);
      if (playing && ac) pos = audioPos();
      else pos += Math.min(dt, 0.1) / stepDur;
      bg(g, w, h, '#2a2160', '#0e0c2a');
      // ── 피아노 롤
      const top = 26 * u;
      const rollH = h * 0.56;
      const rows = 12;
      const rowH = rollH / rows;
      const left = 26 * u;
      const pxPerStep = 9 * u;
      const playX = left + (w - left) * 0.28;
      for (let r = 0; r < rows; r++) {
        const y = top + rollH - (r + 1) * rowH;
        g.fillStyle = r % 7 === 0 ? 'rgba(255,255,255,.08)' : r % 2 ? 'rgba(255,255,255,.03)' : 'rgba(255,255,255,.015)';
        g.fillRect(left, y, w - left, rowH);
        if (rowH > 7 * u || r % 2 === 0) txt(g, NOTE_NAMES[r % 7]!, left - 4 * u, y + rowH / 2, Math.min(8 * u, rowH * 0.9), r % 7 === 0 ? '#ffd23f' : '#a99ee0', 'right', F, 800);
      }
      // 마디 줄
      const firstStep = Math.floor(pos - (playX - left) / pxPerStep);
      for (let s = firstStep; s < pos + (w - playX) / pxPerStep + 1; s++) {
        if (s % 8) continue;
        const x = playX + (s - pos) * pxPerStep;
        g.fillStyle = s % 16 ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.16)';
        g.fillRect(x, top, 1, rollH);
      }
      // 음표 (반복 곡이라 STEPS 로 감기)
      const base = Math.floor(pos / STEPS) * STEPS;
      const voices: { hz: number; age: number; deg: number }[] = [];
      for (const loop of [base - STEPS, base, base + STEPS])
        for (const n of mel) {
          const s = n.step + loop;
          const x = playX + (s - pos) * pxPerStep;
          if (x > w || x + n.len * pxPerStep < left) continue;
          const y = top + rollH - (n.deg + 1) * rowH;
          const on = pos >= s && pos < s + n.len;
          const age = (pos - s) * stepDur;
          if (age >= 0 && age < 1.2) voices.push({ hz: midiHz(degToMidi(n.deg)), age, deg: n.deg });
          rr(g, x + 1, y + 1, n.len * pxPerStep - 2, rowH - 2, 3 * u);
          g.fillStyle = NOTE_COL[n.deg % 7]!;
          g.globalAlpha = x + n.len * pxPerStep < playX ? 0.45 : 1;
          g.fill();
          g.globalAlpha = 1;
          if (on) {
            g.strokeStyle = '#fff';
            g.lineWidth = 2 * u;
            g.stroke();
            const k = clamp01(age / 0.5);
            g.strokeStyle = `rgba(255,255,255,${(1 - k).toFixed(2)})`;
            g.beginPath();
            g.arc(playX, y + rowH / 2, 4 * u + k * 16 * u, 0, Math.PI * 2);
            g.stroke();
          }
        }
      // 드론 띠
      const droneY = top + rollH + 3 * u;
      for (let s = Math.floor(firstStep / 32) * 32; s < pos + (w - playX) / pxPerStep; s += 32) {
        const x = playX + (s - pos) * pxPerStep;
        const root = droneAt(((s % STEPS) + STEPS) % STEPS);
        rr(g, x + 1, droneY, 32 * pxPerStep - 2, 8 * u, 4 * u);
        g.fillStyle = 'rgba(160,140,255,.35)';
        g.fill();
        txt(g, `드론 ${root === 50 ? '레' : root === 48 ? '도' : '솔'}`, Math.max(x + 18 * u, left + 18 * u), droneY + 4 * u, 6.5 * u, '#d8d0ff', 'center', F, 800);
      }
      g.fillStyle = '#ffd23f';
      g.fillRect(playX - 1 * u, top - 4 * u, 2 * u, rollH + 16 * u);
      // ── 파형
      const wy = droneY + 12 * u + (h - droneY - 12 * u) / 2;
      const amp = (h - droneY - 16 * u) / 2;
      g.strokeStyle = 'rgba(255,255,255,.12)';
      g.beginPath();
      g.moveTo(8 * u, wy);
      g.lineTo(w - 8 * u, wy);
      g.stroke();
      g.strokeStyle = '#7ff0d0';
      g.lineWidth = 1.8 * u;
      const N = 140;
      const vals: number[] = [];
      const real = playing && analyser && wave;
      if (real) analyser!.getByteTimeDomainData(wave!);
      const root = midiHz(droneAt(((Math.floor(pos) % STEPS) + STEPS) % STEPS) - 12);
      for (let k = 0; k <= N; k++) {
        let v: number;
        if (real) v = (wave![Math.floor((k / N) * (wave!.length - 1))]! - 128) / 128 * 2.2;
        else {
          // 소리 없이도 같은 합성식으로 그린 파형 (줄 뜯는 소리 = 세모파가 빨리 사라짐)
          const tt = k / N / 90;
          v = Math.sin(tt * root * Math.PI * 2 + _t * 2) * 0.12 + Math.sin(tt * root * 1.5 * Math.PI * 2) * 0.08;
          for (const vo of voices) {
            const ph = (tt * vo.hz + vo.age * 3) % 1;
            const tri = 4 * Math.abs(ph - 0.5) - 1;
            v += tri * Math.exp(-vo.age * 2.2) * 0.8 + Math.sin(tt * vo.hz * 2 * Math.PI * 2) * Math.exp(-vo.age * 4) * 0.3;
          }
        }
        vals.push(v);
      }
      // 크기 맞춤 (조용할 때도 모양이 보이게)
      let mx = 0.3;
      for (const v of vals) mx = Math.max(mx, Math.abs(v));
      g.beginPath();
      vals.forEach((v, k) => {
        const x = 8 * u + ((w - 16 * u) * k) / N;
        const y = wy - (v / mx) * amp * 0.85;
        if (k) g.lineTo(x, y);
        else g.moveTo(x, y);
      });
      g.stroke();
      pill(g, playing ? '♪ 지금 실시간 합성 중' : '소리 꺼짐 · 크게 보기의 ▶ 로 듣기', 8 * u, 12 * u, 7.5 * u, playing ? '#ff6fa8' : 'rgba(255,255,255,.14)', '#fff', 'left');
      txt(g, '파일 0개 · 레 도리아', w - 8 * u, 12 * u, 7.5 * u, '#a99ee0', 'right', F, 800);
    },
  };
}

/* ═════════════════════ i78 지형 조각 캐시 ═════════════════════ */
function makeI78() {
  const NT = 48;
  const HW = 32;
  const HH = 16;
  const CW = 512;
  const CH = 256;
  const WW = NT * HW * 2; // 3072
  const WH = NT * HH * 2; // 1536
  const GX = WW / CW;
  const GY = WH / CH;
  const RES = 0.25; // 조각 캔버스 해상도 (세상 화소의 1/4)
  const CAP = 12;
  const ter = new Uint8Array(NT * NT);
  for (let j = 0; j < NT; j++)
    for (let i = 0; i < NT; i++) {
      const v = fbm(i * 0.09, j * 0.09, 17);
      ter[j * NT + i] = v < 0.4 ? 0 : v < 0.45 ? 1 : v < 0.66 ? 2 : 3;
    }
  // 세상 좌표: 칸 (i,j) 의 위 꼭짓점 = (WW/2 + (i-j)HW, (i+j)HH)
  const hasWater = new Uint8Array(GX * GY);
  const inMap = new Uint8Array(GX * GY);
  for (let cy = 0; cy < GY; cy++)
    for (let cx = 0; cx < GX; cx++) {
      // 조각 사각형에 마름모 지도가 걸치나 (네 꼭짓점 + 가운데 검사로 충분)
      let any = false;
      let water = false;
      for (let sy = 0; sy <= 4; sy++)
        for (let sx = 0; sx <= 4; sx++) {
          const X = cx * CW + (sx / 4) * CW - WW / 2;
          const Y = cy * CH + (sy / 4) * CH;
          const i = Math.floor((Y / HH + X / HW) / 2);
          const j = Math.floor((Y / HH - X / HW) / 2);
          if (i < 0 || j < 0 || i >= NT || j >= NT) continue;
          any = true;
          if (ter[j * NT + i] === 0) water = true;
        }
      inMap[cy * GX + cx] = any ? 1 : 0;
      hasWater[cy * GX + cx] = water ? 1 : 0;
    }
  const TC = ['#4ea8dc', '#e6d394', '#82c65a', '#5aa548'];
  const bakeChunk = (cx: number, cy: number, frame: number): HTMLCanvasElement => {
    const c = mkCanvas(CW * RES, CH * RES);
    const q = c2(c);
    q.setTransform(RES, 0, 0, RES, -cx * CW * RES, -cy * CH * RES);
    const i0 = 0;
    for (let j = 0; j < NT; j++)
      for (let i = i0; i < NT; i++) {
        const x = WW / 2 + (i - j) * HW;
        const y = (i + j) * HH;
        if (x + HW < cx * CW || x - HW > (cx + 1) * CW || y + HH * 2 < cy * CH || y > (cy + 1) * CH) continue;
        const tt = ter[j * NT + i]!;
        q.beginPath();
        q.moveTo(x, y);
        q.lineTo(x + HW, y + HH);
        q.lineTo(x, y + HH * 2);
        q.lineTo(x - HW, y + HH);
        q.closePath();
        q.fillStyle = tt === 0 && (i + j + frame) % 4 === 0 ? '#6cc0ec' : TC[tt]!;
        q.fill();
        if (tt === 0) {
          q.strokeStyle = 'rgba(255,255,255,.7)';
          q.lineWidth = 4;
          const o = (frame / 4) * HW;
          q.beginPath();
          q.moveTo(x - HW * 0.4 + o * 0.5, y + HH);
          q.lineTo(x + o * 0.5, y + HH);
          q.stroke();
        } else if (tt === 3 && hash2(i, j, 2) < 0.35) {
          q.fillStyle = '#3f7f3a';
          q.beginPath();
          q.arc(x, y + HH * 0.6, HW * 0.35, 0, Math.PI * 2);
          q.fill();
        }
      }
    return c;
  };
  // 전체 지도 흐린 밑그림 (설명용)
  const whole = mkCanvas(WW / 16, WH / 16);
  {
    const q = c2(whole);
    q.setTransform(1 / 16, 0, 0, 1 / 16, 0, 0);
    for (let j = 0; j < NT; j++)
      for (let i = 0; i < NT; i++) {
        const x = WW / 2 + (i - j) * HW;
        const y = (i + j) * HH;
        q.beginPath();
        q.moveTo(x, y);
        q.lineTo(x + HW + 8, y + HH);
        q.lineTo(x, y + HH * 2 + 8);
        q.lineTo(x - HW - 8, y + HH);
        q.closePath();
        q.fillStyle = TC[ter[j * NT + i]!]!;
        q.fill();
      }
  }
  interface Ch {
    key: number;
    cv: HTMLCanvasElement[];
    used: number;
    baked: number;
    pre: boolean;
  }
  const cache = new Map<number, Ch>();
  const fading: { cx: number; cy: number; at: number }[] = [];
  let builds = 0;
  let evicts = 0;
  let prefetches = 0;
  // 카메라: 목표로 미끄러져 갔다가 잠깐 쉼 (쉴 때 둘레를 미리 굽기)
  const cam = { x: WW / 2, y: WH / 2, fx: WW / 2, fy: WH / 2, tx: WW / 2, ty: WH / 2, t0: 0, rest: 0 };
  const CAMW = 900;
  const CAMH = 560;
  const r = rng(5);
  const pickTarget = (): void => {
    for (let k = 0; k < 20; k++) {
      const i = 6 + r() * (NT - 12);
      const j = 6 + r() * (NT - 12);
      const x = WW / 2 + (i - j) * HW;
      const y = (i + j) * HH;
      if (Math.hypot(x - cam.x, y - cam.y) > 700) {
        cam.tx = x;
        cam.ty = y;
        return;
      }
    }
  };
  let cap = CAP;
  let lastPre = 0;
  let lastT = 0;
  const ensure = (cx: number, cy: number, t: number, pre: boolean): void => {
    const key = cy * GX + cx;
    let ch = cache.get(key);
    if (!ch) {
      const nf = hasWater[key] ? 4 : 1;
      ch = { key, cv: Array.from({ length: nf }, (_, f) => bakeChunk(cx, cy, f)), used: t, baked: t, pre };
      cache.set(key, ch);
      builds++;
      if (pre) prefetches++;
    }
    if (!pre) ch.used = t;
  };
  const controls: Control[] = [{ type: 'range', label: '캐시 크기 (조각 수)', min: 6, max: 24, step: 1, value: cap, on: (v) => (cap = v) }];
  return {
    controls,
    draw(g: G, w: number, h: number, t: number) {
      reset(g);
      const u = scaleOf(w, h);
      if (t < lastT) cam.t0 = t;
      lastT = t;
      // 카메라 움직임
      const MOVE = 2.6;
      const ph = t - cam.t0;
      let moving = true;
      if (ph < MOVE) {
        const k = smooth(0, 1, ph / MOVE);
        cam.x = lerp(cam.fx, cam.tx, k);
        cam.y = lerp(cam.fy, cam.ty, k);
      } else if (ph < MOVE + 1.6) moving = false;
      else {
        cam.fx = cam.x;
        cam.fy = cam.y;
        cam.t0 = t;
        pickTarget();
      }
      // 화면에 걸친 조각 = 쓰는 중
      const vx0 = Math.floor((cam.x - CAMW / 2) / CW);
      const vx1 = Math.floor((cam.x + CAMW / 2) / CW);
      const vy0 = Math.floor((cam.y - CAMH / 2) / CH);
      const vy1 = Math.floor((cam.y + CAMH / 2) / CH);
      const vis = new Set<number>();
      for (let cy = vy0; cy <= vy1; cy++)
        for (let cx = vx0; cx <= vx1; cx++) {
          if (cx < 0 || cy < 0 || cx >= GX || cy >= GY || !inMap[cy * GX + cx]) continue;
          vis.add(cy * GX + cx);
          ensure(cx, cy, t, false);
        }
      // 쉴 때: 한 칸 둘레를 하나씩 미리 굽기
      if (!moving && t - lastPre > 0.2) {
        for (let cy = vy0 - 1; cy <= vy1 + 1; cy++) {
          let done = false;
          for (let cx = vx0 - 1; cx <= vx1 + 1; cx++) {
            if (cx < 0 || cy < 0 || cx >= GX || cy >= GY || !inMap[cy * GX + cx] || cache.has(cy * GX + cx)) continue;
            ensure(cx, cy, t, true);
            lastPre = t;
            done = true;
            break;
          }
          if (done) break;
        }
      }
      // 넘치면 가장 오래 안 쓴 것부터 버림 (LRU)
      while (cache.size > cap) {
        let old: Ch | null = null;
        for (const c of cache.values()) if (!vis.has(c.key) && (!old || c.used < old.used)) old = c;
        if (!old) break;
        cache.delete(old.key);
        fading.push({ cx: old.key % GX, cy: Math.floor(old.key / GX), at: t });
        evicts++;
      }
      bg(g, w, h, '#1e2756', '#0b1030');
      // ── 왼쪽: 전체 지도 (조각 격자)
      const ovW = w * 0.6;
      const s = Math.min((ovW - 16 * u) / WW, (h - 44 * u) / WH);
      const ox = 8 * u;
      const oy = 26 * u + (h - 44 * u - WH * s) / 2;
      const wf = Math.floor(t * 4) % 4;
      g.globalAlpha = 0.22;
      g.drawImage(whole, ox, oy, WW * s, WH * s);
      g.globalAlpha = 1;
      for (let cy = 0; cy < GY; cy++)
        for (let cx = 0; cx < GX; cx++) {
          const key = cy * GX + cx;
          const x = ox + cx * CW * s;
          const y = oy + cy * CH * s;
          const cw = CW * s;
          const chh = CH * s;
          const ch = cache.get(key);
          if (ch) {
            g.drawImage(ch.cv[ch.cv.length > 1 ? wf : 0]!, x, y, cw, chh);
            const age = t - ch.baked;
            if (age < 0.5) {
              g.fillStyle = `rgba(255,255,255,${(0.8 * (1 - age / 0.5)).toFixed(2)})`;
              g.fillRect(x, y, cw, chh);
            }
            g.strokeStyle = vis.has(key) ? '#7dff9a' : ch.pre ? '#6fc8ff' : 'rgba(125,255,154,.55)';
            g.lineWidth = (vis.has(key) ? 2 : 1.2) * u;
            g.strokeRect(x + 1, y + 1, cw - 2, chh - 2);
            if (ch.cv.length > 1) txt(g, '×4', x + cw - 2.5 * u, y + 5 * u, 5.5 * u, '#ffffff', 'right', F, 900);
          } else {
            g.strokeStyle = 'rgba(255,255,255,.12)';
            g.lineWidth = 1;
            g.strokeRect(x + 0.5, y + 0.5, cw - 1, chh - 1);
          }
        }
      for (let k = fading.length - 1; k >= 0; k--) {
        const f = fading[k]!;
        const a = 1 - (t - f.at) / 0.8;
        if (a <= 0) {
          fading.splice(k, 1);
          continue;
        }
        g.fillStyle = `rgba(255,90,110,${(a * 0.55).toFixed(2)})`;
        g.fillRect(ox + f.cx * CW * s, oy + f.cy * CH * s, CW * s, CH * s);
      }
      // 카메라 네모
      g.strokeStyle = '#ffd23f';
      g.lineWidth = 2 * u;
      g.setLineDash([4 * u, 3 * u]);
      g.strokeRect(ox + (cam.x - CAMW / 2) * s, oy + (cam.y - CAMH / 2) * s, CAMW * s, CAMH * s);
      g.setLineDash([]);
      txt(g, moving ? '카메라 이동' : '쉬는 중 → 둘레 미리 굽기', ox, 13 * u, 8 * u, moving ? '#ffd23f' : '#6fc8ff', 'left', F, 800);
      // ── 오른쪽: 카메라 화면 = 구워 둔 조각 몇 장을 붙여 그리기만
      const vx = ovW + 4 * u;
      const vw = w - vx - 8 * u;
      const vh = vw * (CAMH / CAMW);
      const vy = 22 * u;
      const vs = vw / CAMW;
      g.save();
      rr(g, vx, vy, vw, vh, 5 * u);
      g.clip();
      g.fillStyle = '#0b1030';
      g.fillRect(vx, vy, vw, vh);
      for (const key of vis) {
        const ch = cache.get(key);
        if (!ch) continue;
        const cx = key % GX;
        const cy = Math.floor(key / GX);
        g.drawImage(ch.cv[ch.cv.length > 1 ? wf : 0]!, vx + (cx * CW - (cam.x - CAMW / 2)) * vs, vy + (cy * CH - (cam.y - CAMH / 2)) * vs, CW * vs + 0.5, CH * vs + 0.5);
        g.strokeStyle = 'rgba(125,255,154,.6)';
        g.lineWidth = 1;
        g.strokeRect(vx + (cx * CW - (cam.x - CAMW / 2)) * vs, vy + (cy * CH - (cam.y - CAMH / 2)) * vs, CW * vs, CH * vs);
      }
      g.restore();
      g.strokeStyle = '#ffd23f';
      g.lineWidth = 1.5 * u;
      rr(g, vx, vy, vw, vh, 5 * u);
      g.stroke();
      txt(g, `화면 = 조각 ${vis.size}장 붙이기`, vx + vw / 2, 12 * u, 7.5 * u, '#fff', 'center', F, 800);
      // 계수 + LRU 줄
      let y = vy + vh + 12 * u;
      const line = (label: string, v: string, c: string): void => {
        txt(g, label, vx, y, 7.5 * u, '#aab4e8', 'left', F, 700);
        txt(g, v, vx + vw, y, 8.5 * u, c, 'right', F, 800);
        y += 12 * u;
      };
      line('구움', String(builds), '#ffffff');
      line('캐시', `${cache.size} / ${cap}`, '#7dff9a');
      line('버림 (LRU)', String(evicts), '#ff7a8a');
      if (h > 200) line('미리 굽기', String(prefetches), '#6fc8ff');
      // 오래된 순서 띠
      const list = [...cache.values()].sort((a, b) => a.used - b.used);
      const bw = vw / Math.max(cap, 1);
      for (let k = 0; k < list.length && y + 8 * u < h; k++) {
        const c = list[k]!;
        g.fillStyle = vis.has(c.key) ? '#7dff9a' : `hsl(${lerp(0, 120, clamp01(1 - (t - c.used) / 12))},70%,55%)`;
        rr(g, vx + k * bw + 0.5, y - 3 * u, bw - 1, 7 * u, 2 * u);
        g.fill();
      }
      if (y + 8 * u < h) txt(g, '오래됨 ← → 최근', vx + vw / 2, y + 10 * u, 6.5 * u, '#8a94c8');
    },
  };
}

export const DEMOS: DemoMap = {
  i73: {
    kind: '2d',
    caption: '구 · 캡슐로 짠 인물을 화소마다 광선으로 구움 — 왼쪽 8방향 걷기(⇋ = 좌우 뒤집어 재사용), 오른쪽 3D 도형 ↔ 4단계 명암 · 디더 · 테두리 그림',
    make: makeI73,
  },
  i74: {
    kind: '2d',
    caption: '나무 · 바위를 깊이 · 법선 · 재질 버퍼에 쓰고 → 빛 한 번 계산 → 색 사다리 + 잡음 디더 (해가 천천히 움직임)',
    make: makeI74,
  },
  i75: {
    kind: '2d',
    caption: '아이가 걸어간 곳만 잡음 경계로 드러나고, 남은 곳엔 흐르는 구름 두 겹 · 경계엔 옅은 안개 띠 — 나무는 안 잘림',
    make: makeI75,
  },
  i76: {
    kind: '2d',
    caption: '하루가 돌며 화면 밖 빛 버퍼(등불 · 창 · 반딧불 · 등대 빛줄기)를 곱하기로 덮고 더하기 번짐 — 오른쪽 위 시계',
    make: makeI76,
  },
  i77: {
    kind: '2d',
    caption: '레 도리아 음계로 그때그때 짓는 수금 가락 + 드론 — 피아노 롤과 파형 (소리는 크게 보기의 ▶ 단추로만)',
    make: makeI77,
  },
  i78: {
    kind: '2d',
    caption: '큰 지도를 512×256 조각으로 구워 두고 카메라에 걸친 것만 붙여 그림 — 흰 번쩍 = 굽기, 빨강 = 오래된 것 버림, ×4 = 물 4장',
    make: makeI78,
  },
};

import type { Control, DemoMap } from './types';

/**
 * 2D 그림 효과 (i294 ~ i304) · 2D 의사 3D (i305 ~ i311) 견본.
 * 모두 캔버스 2D. 화소 연산이 필요한 것(모드 7 · 광선 투사 · 확대 · 녹기)은 작은 화면 밖 캔버스에서 하고
 * imageSmoothingEnabled=false 로 키워 그린다. 카드(280×175) 기준 u = min(w/280, h/175).
 */

type G = CanvasRenderingContext2D;
type V3 = [number, number, number];
const F = '"Pretendard Variable", Pretendard, system-ui, sans-serif';

const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
const clamp01 = (x: number): number => clamp(x, 0, 1);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const smooth = (x: number): number => {
  const v = clamp01(x);
  return v * v * (3 - 2 * v);
};
const TAU = Math.PI * 2;

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
  return c.getContext('2d', { willReadFrequently: false })!;
}
function reset(g: G): void {
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.imageSmoothingEnabled = true;
  g.lineWidth = 1;
  g.setLineDash([]);
  g.filter = 'none';
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
function pill(g: G, s: string, x: number, y: number, size: number, fill: string, fg = '#fff'): void {
  g.font = `800 ${size}px ${F}`;
  const tw = g.measureText(s).width;
  const ph = size * 1.6;
  const pw = tw + size * 1.2;
  rr(g, x - pw / 2, y - ph / 2, pw, ph, ph / 2);
  g.fillStyle = fill;
  g.fill();
  txt(g, s, x, y + size * 0.04, size, fg, 'center', 800);
}
function hexRgb(c: string): V3 {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgba = (c: V3, a = 1): string => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix3 = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const pack = (r: number, g: number, b: number): number => ((255 << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;

interface Frame {
  u: number;
  L: number;
  T: number;
  R: number;
  B: number;
}
/** 카드 좌표(280×175)로 맞추고 save — 끝에서 restore 할 것 */
function frame(g: G, w: number, h: number): Frame {
  const u = Math.min(w / 280, h / 175);
  const ox = (w - 280 * u) / 2;
  const oy = (h - 175 * u) / 2;
  g.save();
  g.translate(ox, oy);
  g.scale(u, u);
  return { u, L: -ox / u, T: -oy / u, R: (w - ox) / u, B: (h - oy) / u };
}
function vbg(g: G, f: Frame, a: string, b: string): void {
  const gr = g.createLinearGradient(0, f.T, 0, f.B);
  gr.addColorStop(0, a);
  gr.addColorStop(1, b);
  g.fillStyle = gr;
  g.fillRect(f.L, f.T, f.R - f.L, f.B - f.T);
}
function spot(g: G, x: number, y: number, r: number, col: V3, a: number): void {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgba(col, a));
  gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

/* ───────── 공용 그림: 말랑 새싹 친구 ───────── */
interface Pal {
  body: string;
  shade: string;
  dark: string;
  light: string;
  leaf: string;
}
const PALS: Record<string, Pal> = {
  mint: { body: '#6ee7b7', shade: '#22a383', dark: '#0b5e50', light: '#ecfdf5', leaf: '#4ade80' },
  pink: { body: '#f9a8d4', shade: '#e0609f', dark: '#831843', light: '#fff1f8', leaf: '#4ade80' },
  sky: { body: '#93c5fd', shade: '#4f8ae8', dark: '#1e3a8a', light: '#eff6ff', leaf: '#4ade80' },
  lemon: { body: '#fde68a', shade: '#f0b43c', dark: '#8a4b08', light: '#fffbeb', leaf: '#34c759' },
};
function leafShape(g: G, x: number, y: number, s: number, ang: number, fill: string, stroke: string, lw: number): void {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(s * 0.5, -s * 0.45, s, 0);
  g.quadraticCurveTo(s * 0.5, s * 0.45, 0, 0);
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = lw;
  g.strokeStyle = stroke;
  g.stroke();
  g.beginPath();
  g.moveTo(s * 0.12, 0);
  g.lineTo(s * 0.75, 0);
  g.lineWidth = lw * 0.6;
  g.strokeStyle = 'rgba(255,255,255,.55)';
  g.stroke();
  g.restore();
}
function drawBuddy(g: G, S: number, p: Pal): void {
  const cx = S / 2;
  const base = S * 0.9;
  const r = S * 0.36;
  const top = base - r * 1.9;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = p.dark;
  g.lineWidth = S * 0.03;
  g.beginPath();
  g.moveTo(cx, top + r * 0.12);
  g.quadraticCurveTo(cx - S * 0.015, top - S * 0.05, cx + S * 0.01, top - S * 0.085);
  g.stroke();
  leafShape(g, cx + S * 0.01, top - S * 0.085, S * 0.13, -0.45, p.leaf, p.dark, S * 0.022);
  leafShape(g, cx + S * 0.005, top - S * 0.075, S * 0.1, Math.PI + 0.55, p.leaf, p.dark, S * 0.022);
  g.beginPath();
  g.moveTo(cx - r * 1.08, base - r * 0.05);
  g.bezierCurveTo(cx - r * 1.16, base - r * 1.05, cx - r * 0.78, top, cx, top);
  g.bezierCurveTo(cx + r * 0.78, top, cx + r * 1.16, base - r * 1.05, cx + r * 1.08, base - r * 0.05);
  g.quadraticCurveTo(cx, base + r * 0.12, cx - r * 1.08, base - r * 0.05);
  g.closePath();
  const gr = g.createRadialGradient(cx - r * 0.35, top + r * 0.6, r * 0.1, cx, base - r * 0.8, r * 1.5);
  gr.addColorStop(0, p.light);
  gr.addColorStop(0.35, p.body);
  gr.addColorStop(1, p.shade);
  g.fillStyle = gr;
  g.fill();
  g.lineWidth = S * 0.032;
  g.strokeStyle = p.dark;
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,.8)';
  g.beginPath();
  g.ellipse(cx - r * 0.5, top + r * 0.45, r * 0.2, r * 0.11, -0.6, 0, TAU);
  g.fill();
  g.beginPath();
  g.arc(cx - r * 0.22, top + r * 0.3, r * 0.05, 0, TAU);
  g.fill();
  const ey = base - r * 0.82;
  for (const s of [-1, 1]) {
    const ex = cx + s * r * 0.38;
    g.fillStyle = '#1f2433';
    g.beginPath();
    g.ellipse(ex, ey, r * 0.12, r * 0.17, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(ex - r * 0.035, ey - r * 0.07, r * 0.05, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,110,150,.45)';
    g.beginPath();
    g.ellipse(cx + s * r * 0.68, ey + r * 0.24, r * 0.16, r * 0.09, 0, 0, TAU);
    g.fill();
  }
  g.strokeStyle = p.dark;
  g.lineWidth = S * 0.024;
  g.beginPath();
  g.arc(cx, ey + r * 0.1, r * 0.13, 0.2 * Math.PI, 0.8 * Math.PI);
  g.stroke();
}
const buddyCache = new Map<string, HTMLCanvasElement>();
function buddy(S: number, pal: string): HTMLCanvasElement {
  const k = pal + S;
  let c = buddyCache.get(k);
  if (!c) {
    c = mkCanvas(S, S);
    drawBuddy(c2(c), S, PALS[pal]!);
    buddyCache.set(k, c);
  }
  return c;
}
function tinted(src: HTMLCanvasElement, col: string, a = 1): HTMLCanvasElement {
  const c = mkCanvas(src.width, src.height);
  const x = c2(c);
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'source-atop';
  x.globalAlpha = a;
  x.fillStyle = col;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

/* ───────── 16×16 도트 슬라임 (색 번호 그림) ───────── */
const PN = 16;
function slimeIdx(): Uint8Array {
  const a = new Uint8Array(PN * PN);
  const inside = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= PN || y > 14) return false;
    const dx = (x + 0.5 - 8) / 6.9;
    const yy = y + 0.5 - 10.3;
    const dy = yy / (yy < 0 ? 6.3 : 4.7);
    return dx * dx + dy * dy <= 1;
  };
  for (let y = 0; y < PN; y++)
    for (let x = 0; x < PN; x++) {
      if (inside(x, y)) {
        const dx = (x + 0.5 - 8) / 6.9;
        const dy = (y + 0.5 - 10.3) / 5.5;
        a[y * PN + x] = dx * 0.55 + dy * 0.85 > 0.5 ? 3 : 2;
      } else if (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1)) a[y * PN + x] = 1;
    }
  const set = (x: number, y: number, v: number): void => {
    a[y * PN + x] = v;
  };
  set(4, 6, 4);
  set(5, 6, 4);
  set(4, 7, 4);
  for (const ex of [6, 10]) {
    set(ex, 9, 5);
    set(ex, 10, 1);
    set(ex, 11, 1);
  }
  set(4, 12, 7);
  set(12, 12, 7);
  set(8, 12, 1);
  set(8, 3, 1);
  set(8, 2, 1);
  set(6, 2, 6);
  set(7, 2, 6);
  set(6, 1, 1);
  set(5, 2, 1);
  set(9, 1, 6);
  set(10, 1, 6);
  set(10, 0, 1);
  set(11, 1, 1);
  set(9, 0, 1);
  return a;
}
const SLIME = slimeIdx();
type PalArr = (string | null)[];
const SL_PAL: Record<string, PalArr> = {
  orig: [null, '#1d3b2a', '#7ad65a', '#3f9c46', '#e4ffd2', '#ffffff', '#ffb43c', '#ff8fa8'],
  team: [null, '#16213e', '#5ea8ff', '#2f5fd0', '#dff0ff', '#ffffff', '#ffd43c', '#ff9ac0'],
  hit: [null, '#5a0f14', '#ff4d5e', '#c21f35', '#ffd0d6', '#ffffff', '#ffe0a0', '#ffffff'],
  white: [null, '#ffffff', '#ffffff', '#ffe9ec', '#ffffff', '#ffffff', '#ffffff', '#ffffff'],
  ice: [null, '#1c4b66', '#bdf4ff', '#7ccde8', '#ffffff', '#ffffff', '#9be7ff', '#ffc9e0'],
};
function pixCanvas(idx: Uint8Array, pal: PalArr): HTMLCanvasElement {
  const c = mkCanvas(PN, PN);
  const x = c2(c);
  const im = x.createImageData(PN, PN);
  for (let i = 0; i < PN * PN; i++) {
    const col = pal[idx[i]!];
    if (!col) continue;
    const v = hexRgb(col);
    im.data[i * 4] = v[0];
    im.data[i * 4 + 1] = v[1];
    im.data[i * 4 + 2] = v[2];
    im.data[i * 4 + 3] = 255;
  }
  x.putImageData(im, 0, 0);
  return c;
}
function hsl(h: number, s: number, l: number): string {
  return `hsl(${((h % 360) + 360) % 360},${s}%,${l}%)`;
}
function hslHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number): number => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (v: number): string => Math.round(v * 255).toString(16).padStart(2, '0');
  return '#' + to(f(0)) + to(f(8)) + to(f(4));
}

/* ═════════ i294 외곽선 · 빛 테 (알파 넓히기) ═════════ */
interface DF {
  d: Float32Array;
  W: number;
  H: number;
  c: HTMLCanvasElement;
}
function distField(src: HTMLCanvasElement, pad: number): DF {
  const W = src.width + pad * 2;
  const H = src.height + pad * 2;
  const c = mkCanvas(W, H);
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(src, pad, pad);
  const a = x.getImageData(0, 0, W, H).data;
  const d = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) d[i] = a[i * 4 + 3]! > 110 ? 0 : 1e6;
  const D = Math.SQRT2;
  for (let y = 0; y < H; y++)
    for (let xx = 0; xx < W; xx++) {
      const i = y * W + xx;
      let v = d[i]!;
      if (xx > 0) v = Math.min(v, d[i - 1]! + 1);
      if (y > 0) {
        v = Math.min(v, d[i - W]! + 1);
        if (xx > 0) v = Math.min(v, d[i - W - 1]! + D);
        if (xx < W - 1) v = Math.min(v, d[i - W + 1]! + D);
      }
      d[i] = v;
    }
  for (let y = H - 1; y >= 0; y--)
    for (let xx = W - 1; xx >= 0; xx--) {
      const i = y * W + xx;
      let v = d[i]!;
      if (xx < W - 1) v = Math.min(v, d[i + 1]! + 1);
      if (y < H - 1) {
        v = Math.min(v, d[i + W]! + 1);
        if (xx < W - 1) v = Math.min(v, d[i + W + 1]! + D);
        if (xx > 0) v = Math.min(v, d[i + W - 1]! + D);
      }
      d[i] = v;
    }
  return { d, W, H, c };
}
function fieldCanvas(f: DF, fn: (d: number) => number, col: V3): HTMLCanvasElement {
  const c = mkCanvas(f.W, f.H);
  const x = c2(c);
  const im = x.createImageData(f.W, f.H);
  for (let i = 0; i < f.W * f.H; i++) {
    const a = fn(f.d[i]!);
    if (a <= 0) continue;
    im.data[i * 4] = col[0];
    im.data[i * 4 + 1] = col[1];
    im.data[i * 4 + 2] = col[2];
    im.data[i * 4 + 3] = Math.round(clamp01(a) * 255);
  }
  x.putImageData(im, 0, 0);
  return c;
}
function mkI294() {
  const S = 128;
  const PAD = 26;
  const names = ['mint', 'pink', 'sky'];
  const fields = names.map((n) => distField(buddy(S, n), PAD));
  const COLS = ['#fff3a6', '#7df3ff', '#ff9be0'];
  let thick = 5;
  let glow = true;
  let ci = 0;
  const cache = new Map<string, HTMLCanvasElement>();
  const ring = (i: number): HTMLCanvasElement => {
    const k = `r${i}-${thick}-${ci}`;
    let c = cache.get(k);
    if (!c) {
      const r = thick;
      c = fieldCanvas(fields[i]!, (d) => (d <= 0 ? 1 : clamp01(r + 0.5 - d)), hexRgb(COLS[ci]!));
      cache.set(k, c);
    }
    return c;
  };
  const halo = (i: number): HTMLCanvasElement => {
    const k = `g${i}-${ci}`;
    let c = cache.get(k);
    if (!c) {
      c = fieldCanvas(fields[i]!, (d) => Math.exp(-d / 7) * 0.95, hexRgb(COLS[ci]!));
      cache.set(k, c);
    }
    return c;
  };
  const controls: Control[] = [
    { type: 'range', label: '테 두께 (넓히는 칸)', min: 1, max: 12, step: 1, value: thick, on: (v) => (thick = v) },
    { type: 'toggle', label: '빛 무리', value: glow, on: (v) => (glow = v) },
    { type: 'button', label: '테 색 바꾸기', on: () => (ci = (ci + 1) % COLS.length) },
  ];
  return {
    controls,
    draw(g: G, w: number, h: number, t: number) {
      reset(g);
      const f = frame(g, w, h);
      vbg(g, f, '#241a4a', '#120d27');
      spot(g, 140, 70, 170, [120, 90, 255], 0.18);
      // 바닥
      g.fillStyle = '#2e2560';
      g.beginPath();
      g.ellipse(140, 168, 190, 42, 0, 0, TAU);
      g.fill();
      const sel = Math.floor(t / 1.6) % 3;
      const D = 176 * (78 / 128);
      for (let i = 0; i < 3; i++) {
        const x = 55 + i * 85;
        const on = i === sel;
        const lt = (t % 1.6) / 1.6;
        const hop = on ? Math.abs(Math.sin(Math.min(1, lt * 2.2) * Math.PI)) * 9 * (1 - lt * 0.6) : 0;
        const base = 142;
        g.fillStyle = 'rgba(0,0,0,.35)';
        g.beginPath();
        g.ellipse(x, base, 26 - hop * 0.8, 6, 0, 0, TAU);
        g.fill();
        if (on) spot(g, x, base, 40, hexRgb(COLS[ci]!), 0.25);
        const dx = x - D / 2;
        const dy = base - hop - (PAD + S * 0.9) * (D / (S + PAD * 2));
        if (on && glow) {
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = 0.45 + 0.3 * Math.sin(t * 6);
          const gs = D * 1.06;
          g.drawImage(halo(i), x - gs / 2, dy - (gs - D) / 2, gs, gs);
          g.globalAlpha = 1;
          g.globalCompositeOperation = 'source-over';
        }
        if (on) g.drawImage(ring(i), dx, dy, D, D);
        g.drawImage(fields[i]!.c, dx, dy, D, D);
        if (on) {
          const ay = 34 + Math.sin(t * 7) * 3;
          g.fillStyle = COLS[ci]!;
          g.beginPath();
          g.moveTo(x - 7, ay - 6);
          g.lineTo(x + 7, ay - 6);
          g.lineTo(x, ay + 3);
          g.closePath();
          g.fill();
        }
      }
      pill(g, '고른 친구 = 알파를 ' + thick + '칸 넓힌 테' + (glow ? ' + 빛' : ''), 140, 14, 8.5, 'rgba(255,255,255,.12)', '#f3edff');
      g.restore();
    },
  };
}

/* ═════════ i295 잡음 디졸브 (녹기 · 나타나기) ═════════ */
function drawCrate(g: G, S: number): void {
  const m = S * 0.16;
  const s = S - m * 2;
  rr(g, m, m + S * 0.06, s, s * 0.92, S * 0.08);
  const gr = g.createLinearGradient(0, m, 0, S - m);
  gr.addColorStop(0, '#f1b866');
  gr.addColorStop(1, '#b8692b');
  g.fillStyle = gr;
  g.fill();
  g.lineWidth = S * 0.04;
  g.strokeStyle = '#5b2d10';
  g.stroke();
  g.strokeStyle = 'rgba(91,45,16,.45)';
  g.lineWidth = S * 0.02;
  for (let i = 1; i < 4; i++) {
    const y = m + S * 0.06 + (s * 0.92 * i) / 4;
    g.beginPath();
    g.moveTo(m + S * 0.04, y);
    g.lineTo(S - m - S * 0.04, y);
    g.stroke();
  }
  // 가운데 별
  const cx = S / 2;
  const cy = m + S * 0.06 + s * 0.46;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? S * 0.09 : S * 0.2;
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.closePath();
  g.fillStyle = '#ffe14d';
  g.fill();
  g.lineWidth = S * 0.03;
  g.strokeStyle = '#8a4b08';
  g.stroke();
}
function mkI295() {
  const S = 96;
  let edge = 0.08;
  let nscale = 0.075;
  let embers = true;
  const srcs = [mkCanvas(S, S), mkCanvas(S, S)];
  drawCrate(c2(srcs[0]!), S);
  c2(srcs[1]!).drawImage(buddy(S, 'sky'), 0, 0);
  const pix = srcs.map((c) => c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, S, S).data);
  const noise = [new Float32Array(S * S), new Float32Array(S * S)];
  const buildNoise = (): void => {
    for (let k = 0; k < 2; k++) {
      const n = noise[k]!;
      let mn = 9;
      let mx = -9;
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          const v = fbm(x * nscale, y * nscale, 11 + k * 5) * 0.8 + (1 - y / S) * 0.2;
          n[y * S + x] = v;
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
      for (let i = 0; i < S * S; i++) n[i] = (n[i]! - mn) / (mx - mn);
    }
  };
  buildNoise();
  const outs = [mkCanvas(S, S), mkCanvas(S, S)];
  const glows = [mkCanvas(S, S), mkCanvas(S, S)];
  const ims = outs.map((c) => c2(c).createImageData(S, S));
  const gims = glows.map((c) => c2(c).createImageData(S, S));
  const FIRE: V3[] = [
    [255, 255, 220],
    [255, 205, 70],
    [255, 110, 30],
    [190, 35, 20],
  ];
  const MAGIC: V3[] = [
    [240, 255, 255],
    [120, 230, 255],
    [90, 120, 255],
    [150, 60, 220],
  ];
  const ramp = (r: V3[], k: number): V3 => {
    const x = clamp01(k) * (r.length - 1);
    const i = Math.min(r.length - 2, Math.floor(x));
    return mix3(r[i]!, r[i + 1]!, x - i);
  };
  interface Em {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    k: number;
  }
  const ems: Em[] = [];
  const thAt = (t: number): number => {
    const c = t % 4.2;
    if (c < 0.5) return 0;
    if (c < 1.9) return smooth((c - 0.5) / 1.4) * 1.12;
    if (c < 2.4) return 1.2;
    if (c < 3.8) return (1 - smooth((c - 2.4) / 1.4)) * 1.12;
    return 0;
  };
  const controls: Control[] = [
    { type: 'range', label: '불빛 테두리 폭', min: 0.01, max: 0.2, step: 0.01, value: edge, on: (v) => (edge = v) },
    {
      type: 'range',
      label: '잡음 크기',
      min: 0.03,
      max: 0.2,
      step: 0.005,
      value: nscale,
      on: (v) => {
        nscale = v;
        buildNoise();
      },
    },
    { type: 'toggle', label: '불티 입자', value: embers, on: (v) => (embers = v) },
  ];
  return {
    controls,
    draw(g: G, w: number, h: number, t: number, dt: number) {
      reset(g);
      const f = frame(g, w, h);
      vbg(g, f, '#1d1530', '#0c0a18');
      g.fillStyle = '#231b3d';
      g.fillRect(f.L, 140, f.R - f.L, f.B - 140);
      for (let k = 0; k < 2; k++) {
        const th = thAt(t + k * 0.35);
        const fire = k === 0;
        const rmp = fire ? FIRE : MAGIC;
        const src = pix[k]!;
        const n = noise[k]!;
        const d = ims[k]!.data;
        const gd = gims[k]!.data;
        const cx = 80 + k * 120;
        const D = 104;
        const ox = cx - D / 2;
        const oy = 140 - D * 0.92;
        let cnt = 0;
        for (let i = 0; i < S * S; i++) {
          const a = src[i * 4 + 3]!;
          const j = i * 4;
          gd[j + 3] = 0;
          if (a === 0) {
            d[j + 3] = 0;
            continue;
          }
          const v = n[i]! - th + edge * (th > 0 ? 1 : 0) * 0;
          if (th > 0 && n[i]! < th) {
            d[j + 3] = 0;
            continue;
          }
          const kk = th > 0 ? (n[i]! - th) / edge : 9;
          if (kk < 1) {
            const c = ramp(rmp, kk);
            d[j] = c[0];
            d[j + 1] = c[1];
            d[j + 2] = c[2];
            d[j + 3] = a;
            gd[j] = c[0];
            gd[j + 1] = c[1];
            gd[j + 2] = c[2];
            gd[j + 3] = Math.round(a * (1 - kk * 0.6));
            if (embers && (i * 7919 + Math.floor(t * 60)) % 173 === 0 && ems.length < 90) {
              ems.push({ x: ox + ((i % S) / S) * D, y: oy + (Math.floor(i / S) / S) * D, vx: (Math.random() - 0.5) * 14, vy: -18 - Math.random() * 26, life: 0, k });
            }
            cnt++;
          } else {
            const dark = kk < 2 && th > 0 ? 0.55 + 0.45 * (kk - 1) : 1;
            d[j] = src[j]! * dark;
            d[j + 1] = src[j + 1]! * dark;
            d[j + 2] = src[j + 2]! * dark;
            d[j + 3] = a;
          }
          void v;
        }
        c2(outs[k]!).putImageData(ims[k]!, 0, 0);
        c2(glows[k]!).putImageData(gims[k]!, 0, 0);
        // 그림자
        g.fillStyle = 'rgba(0,0,0,.35)';
        const vis = clamp01(1 - th);
        g.beginPath();
        g.ellipse(cx, 141, 34 * (0.3 + 0.7 * vis), 6, 0, 0, TAU);
        g.fill();
        g.drawImage(outs[k]!, ox, oy, D, D);
        if (cnt) {
          g.globalCompositeOperation = 'lighter';
          g.drawImage(glows[k]!, ox, oy, D, D);
          g.globalAlpha = 0.5;
          g.drawImage(glows[k]!, ox - D * 0.04, oy - D * 0.04, D * 1.08, D * 1.08);
          g.globalAlpha = 1;
          g.globalCompositeOperation = 'source-over';
          spot(g, cx, oy + D * 0.5, 70, fire ? [255, 140, 40] : [90, 160, 255], 0.14);
        }
        // 문턱 막대
        const bx = cx - 40;
        rr(g, bx, 156, 80, 6, 3);
        g.fillStyle = 'rgba(255,255,255,.12)';
        g.fill();
        rr(g, bx, 156, 80 * clamp01(th), 6, 3);
        g.fillStyle = fire ? '#ff9b3d' : '#6fb6ff';
        g.fill();
        txt(g, (fire ? '불로 녹기' : '마법 나타나기') + ' · 문턱 ' + clamp01(th).toFixed(2), cx, 168, 7.5, '#d9d2f2');
      }
      g.globalCompositeOperation = 'lighter';
      for (let i = ems.length - 1; i >= 0; i--) {
        const e = ems[i]!;
        e.life += dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.vy -= 10 * dt;
        if (e.life > 1) {
          ems[i] = ems[ems.length - 1]!;
          ems.pop();
          continue;
        }
        const c: V3 = e.k === 0 ? [255, 170, 60] : [120, 200, 255];
        g.fillStyle = rgba(c, (1 - e.life) * 0.9);
        g.beginPath();
        g.arc(e.x, e.y, 1.4 * (1 - e.life) + 0.4, 0, TAU);
        g.fill();
      }
      g.globalCompositeOperation = 'source-over';
      pill(g, '잡음 값 < 문턱 → 지움 · 문턱 바로 위 = 불빛 테', 140, 14, 8, 'rgba(255,255,255,.1)', '#efe8ff');
      g.restore();
    },
  };
}

/* ═════════ i296 팔레트 교체 ═════════ */
function mkI296() {
  const base = {
    orig: pixCanvas(SLIME, SL_PAL.orig!),
    team: pixCanvas(SLIME, SL_PAL.team!),
    hit: pixCanvas(SLIME, SL_PAL.hit!),
    white: pixCanvas(SLIME, SL_PAL.white!),
    ice: pixCanvas(SLIME, SL_PAL.ice!),
  };
  const grayPal: PalArr = [null, '#202020', '#9a9a9a', '#6a6a6a', '#e6e6e6', '#ffffff', '#c4c4c4', '#b0b0b0'];
  const gray = pixCanvas(SLIME, grayPal);
  const rb = mkCanvas(PN, PN);
  let swatch = true;
  let speed = 1;
  let lastHue = -1;
  const controls: Control[] = [
    { type: 'toggle', label: '색 표 보기', value: swatch, on: (v) => (swatch = v) },
    { type: 'range', label: '무지개 돌리기 속도', min: 0, max: 3, step: 0.1, value: speed, on: (v) => (speed = v) },
  ];
  return {
    controls,
    draw(g: G, w: number, h: number, t: number) {
      reset(g);
      const f = frame(g, w, h);
      vbg(g, f, '#1c2340', '#0e1226');
      g.imageSmoothingEnabled = false;
      // 왼쪽: 색 번호 그림
      rr(g, 8, 24, 78, 110, 8);
      g.fillStyle = 'rgba(255,255,255,.06)';
      g.fill();
      g.drawImage(gray, 15, 38, 64, 64);
      g.strokeStyle = 'rgba(255,255,255,.08)';
      g.lineWidth = 0.4;
      for (let i = 0; i <= 16; i++) {
        g.beginPath();
        g.moveTo(15 + i * 4, 38);
        g.lineTo(15 + i * 4, 102);
        g.moveTo(15, 38 + i * 4);
        g.lineTo(79, 38 + i * 4);
        g.stroke();
      }
      txt(g, '색 번호 그림', 47, 31, 7.5, '#cfd8ff');
      txt(g, '(0~7 번호만)', 47, 112, 7, '#8f9ac4');
      txt(g, '1개 그림', 47, 124, 7, '#8f9ac4');
      // 화살표
      g.fillStyle = '#7f8cff';
      g.beginPath();
      g.moveTo(90, 66);
      g.lineTo(98, 70);
      g.lineTo(90, 74);
      g.fill();
      // 무지개 팔레트
      const hue = Math.floor(t * 120 * speed) % 360;
      if (hue !== lastHue) {
        lastHue = hue;
        const p: PalArr = [null, hslHex(hue + 200, 45, 18), hslHex(hue, 85, 62), hslHex(hue - 15, 70, 42), hslHex(hue, 90, 90), '#ffffff', hslHex(hue + 180, 85, 60), '#ff9ac0'];
        const nc = pixCanvas(SLIME, p);
        const x = c2(rb);
        x.clearRect(0, 0, PN, PN);
        x.drawImage(nc, 0, 0);
      }
      const hitT = t % 2.2;
      const hitting = hitT < 0.45;
      const flashPal = hitting ? (Math.floor(hitT / 0.07) % 2 ? 'hit' : 'white') : 'hit';
      const items: { c: HTMLCanvasElement; name: string; pal: PalArr }[] = [
        { c: base.orig, name: '원래', pal: SL_PAL.orig! },
        { c: base.team, name: '파랑 팀', pal: SL_PAL.team! },
        { c: hitting ? base[flashPal as 'hit' | 'white'] : base.hit, name: '피격', pal: SL_PAL.hit! },
        { c: base.ice, name: '얼음', pal: SL_PAL.ice! },
        { c: rb, name: '색 돌리기', pal: [] },
      ];
      for (let i = 0; i < items.length; i++) {
        const it = items[i]!;
        const cx = 120 + i * 36;
        const bounce = Math.abs(Math.sin(t * 3 + i * 0.7)) * 5;
        let sx = 0;
        if (i === 2 && hitting) sx = Math.sin(hitT * 90) * 2.5 * (1 - hitT / 0.45);
        g.fillStyle = 'rgba(0,0,0,.35)';
        g.beginPath();
        g.ellipse(cx, 99, 13 - bounce * 0.6, 3, 0, 0, TAU);
        g.fill();
        g.drawImage(it.c, Math.round(cx - 16 + sx), Math.round(98 - 32 - bounce), 32, 32);
        if (i === 2 && hitting) txt(g, '-3', cx + 10, 56 - hitT * 30, 10, '#ffde59', 'center', 900);
        txt(g, it.name, cx, 46, 7, '#e3e8ff');
        if (swatch) {
          const pal = i === 4 ? [null, hsl(hue + 200, 45, 18), hsl(hue, 85, 62), hsl(hue - 15, 70, 42), hsl(hue, 90, 90), '#fff', hsl(hue + 180, 85, 60), '#ff9ac0'] : it.pal;
          for (let k = 1; k < 8; k++) {
            const sy = 108 + (k - 1) * 7;
            g.fillStyle = pal[k] ?? '#000';
            g.fillRect(cx - 8, sy, 16, 6);
          }
          g.strokeStyle = 'rgba(255,255,255,.25)';
          g.lineWidth = 0.6;
          g.strokeRect(cx - 8, 108, 16, 49);
        }
      }
      if (swatch) for (let k = 1; k < 8; k++) txt(g, String(k), 98, 111 + (k - 1) * 7, 5.5, '#8f9ac4');
      pill(g, '같은 그림 · 색 표만 바꿈', 175, 14, 8.5, 'rgba(127,140,255,.22)', '#e8ebff');
      g.restore();
    },
  };
}

/* ═════════ i297 그림자 · 물 반사 ═════════ */
function drawMushroom(g: G, S: number): void {
  const cx = S / 2;
  rr(g, cx - S * 0.11, S * 0.48, S * 0.22, S * 0.42, S * 0.08);
  g.fillStyle = '#fff3dc';
  g.fill();
  g.lineWidth = S * 0.025;
  g.strokeStyle = '#7a4a2a';
  g.stroke();
  g.beginPath();
  g.moveTo(cx - S * 0.4, S * 0.52);
  g.bezierCurveTo(cx - S * 0.42, S * 0.1, cx + S * 0.42, S * 0.1, cx + S * 0.4, S * 0.52);
  g.quadraticCurveTo(cx, S * 0.6, cx - S * 0.4, S * 0.52);
  const gr = g.createLinearGradient(0, S * 0.15, 0, S * 0.55);
  gr.addColorStop(0, '#ff6b6b');
  gr.addColorStop(1, '#d6304a');
  g.fillStyle = gr;
  g.fill();
  g.stroke();
  g.fillStyle = '#fff';
  for (const [x, y, r] of [
    [-0.18, 0.3, 0.07],
    [0.14, 0.26, 0.09],
    [0.27, 0.42, 0.05],
    [-0.3, 0.45, 0.045],
  ] as const) {
    g.beginPath();
    g.arc(cx + x * S, y * S, r * S, 0, TAU);
    g.fill();
  }
}
function mkI297() {
  const S = 128;
  const bud = buddy(S, 'lemon');
  const mush = mkCanvas(S, S);
  drawMushroom(c2(mush), S);
  const shadowOf = (src: HTMLCanvasElement): HTMLCanvasElement => {
    const c = mkCanvas(S + 24, S + 24);
    const x = c2(c);
    x.filter = 'blur(3px)';
    x.drawImage(tinted(src, '#1a1030'), 12, 12);
    return c;
  };
  const shB = shadowOf(bud);
  const shM = shadowOf(mush);
  let doShadow = true;
  let doRefl = true;
  let wave = 1;
  const controls: Control[] = [
    { type: 'toggle', label: '그림자', value: doShadow, on: (v) => (doShadow = v) },
    { type: 'toggle', label: '물 반사', value: doRefl, on: (v) => (doRefl = v) },
    { type: 'range', label: '물결 세기', min: 0, max: 3, step: 0.1, value: wave, on: (v) => (wave = v) },
  ];
  const GROUND = 112;
  const WATER = 118;
  const putObj = (g: G, img: HTMLCanvasElement, sh: HTMLCanvasElement, x: number, D: number, hop: number, t: number, skew: number): void => {
    const fy = GROUND;
    if (doShadow) {
      g.save();
      g.translate(x, fy);
      g.transform(1, 0, skew, 0.32, 0, 0);
      g.globalAlpha = 0.45 * (1 - clamp01(hop / 40) * 0.6);
      const k = D / S;
      const sc = 1 - clamp01(hop / 40) * 0.2;
      g.drawImage(sh, (-(S + 24) / 2) * k * sc, -(12 + S * 0.9) * k * sc, (S + 24) * k * sc, (S + 24) * k * sc);
      g.restore();
    }
    if (doRefl) {
      g.save();
      g.beginPath();
      g.rect(x - D, WATER, D * 2, 200);
      g.clip();
      const strips = 22;
      const k = D / S;
      for (let i = 0; i < strips; i++) {
        const sy0 = S * 0.9 - (S * 0.9 * (i + 1)) / strips;
        const sh2 = (S * 0.9) / strips;
        const dy = fy + hop + (S * 0.9 - sy0 - sh2) * k;
        const off = Math.sin(t * 3 + i * 0.7) * wave * (0.4 + i * 0.06);
        g.globalAlpha = 0.5 * (1 - i / strips) + 0.1;
        g.save();
        g.translate(x - D / 2 + off, dy + sh2 * k);
        g.scale(1, -1);
        g.drawImage(img, 0, sy0, S, sh2, 0, 0, D, sh2 * k + 0.6);
        g.restore();
      }
      g.restore();
      g.globalAlpha = 1;
    }
    g.drawImage(img, x - D / 2, fy - hop - S * 0.9 * (D / S), D, D);
  };
  return {
    controls,
    draw(g: G, w: number, h: number, t: number) {
      reset(g);
      const f = frame(g, w, h);
      // 노을 하늘
      const sky = g.createLinearGradient(0, f.T, 0, GROUND);
      sky.addColorStop(0, '#3b2a6b');
      sky.addColorStop(0.55, '#e0789a');
      sky.addColorStop(1, '#ffc98a');
      g.fillStyle = sky;
      g.fillRect(f.L, f.T, f.R - f.L, GROUND - f.T);
      const sunX = 140 - Math.sin(t * 0.35) * 90;
      spot(g, sunX, 72, 60, [255, 240, 190], 0.6);
      g.fillStyle = '#fff1c4';
      g.beginPath();
      g.arc(sunX, 72, 11, 0, TAU);
      g.fill();
      // 먼 언덕
      g.fillStyle = '#9a5c8f';
      g.beginPath();
      g.moveTo(f.L, GROUND);
      for (let x = f.L; x <= f.R; x += 8) g.lineTo(x, 92 + Math.sin(x * 0.03) * 6 + Math.sin(x * 0.07) * 3);
      g.lineTo(f.R, GROUND);
      g.fill();
      // 둑
      g.fillStyle = '#6fbf5a';
      g.fillRect(f.L, 98, f.R - f.L, WATER - 98);
      g.fillStyle = '#4e9a45';
      g.fillRect(f.L, WATER - 3, f.R - f.L, 3);
      // 물
      const wg = g.createLinearGradient(0, WATER, 0, f.B);
      wg.addColorStop(0, '#5a7fd0');
      wg.addColorStop(1, '#203a7a');
      g.fillStyle = wg;
      g.fillRect(f.L, WATER, f.R - f.L, f.B - WATER);
      // 해 반사
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 10; i++) {
        const y = WATER + 4 + i * 5;
        const ww = 18 - i + Math.sin(t * 4 + i) * 4;
        g.fillStyle = `rgba(255,220,160,${0.25 - i * 0.02})`;
        g.fillRect(sunX - ww / 2 + Math.sin(t * 3 + i) * 2 * wave, y, ww, 1.4);
      }
      g.globalCompositeOperation = 'source-over';
      const skew = Math.sin(t * 0.35) * 1.4;
      // 버섯
      putObj(g, mush, shM, 205, 54, 0, t, skew);
      // 친구 — 좌우로 폴짝
      const ph = (t * 0.9) % 2;
      const bx = 60 + (ph < 1 ? ph : 2 - ph) * 80;
      const hop = Math.abs(Math.sin(t * 5.6)) * 14;
      putObj(g, bud, shB, bx, 62, hop, t, skew);
      // 물결 줄
      g.strokeStyle = 'rgba(255,255,255,.25)';
      g.lineWidth = 0.8;
      for (let i = 0; i < 7; i++) {
        const y = WATER + 10 + i * 8;
        const x0 = ((i * 53 + t * 8 * (i % 2 ? 1 : -1)) % 300) - 20;
        g.beginPath();
        g.moveTo(x0, y);
        g.lineTo(x0 + 14 + (i % 3) * 6, y);
        g.stroke();
      }
      pill(g, '그림자 = 눌러 기울인 그림 · 반사 = 거꾸로 + 줄마다 흔들기', 140, 12, 7.5, 'rgba(30,15,60,.45)', '#fff');
      g.restore();
    },
  };
}

/* ═════════ i298 대시 잔상 ═════════ */
function mkI298() {
  const S = 128;
  const bud = buddy(S, 'pink');
  const tints = ['#6ff6ff', '#8aa8ff', '#c08bff', '#ff8be0'].map((c) => tinted(bud, c, 0.75));
  let on = true;
  let count = 6;
  let color = true;
  const hist: { t: number; x: number; y: number; sx: number; sy: number }[] = [];
  const controls: Control[] = [
    { type: 'toggle', label: '잔상', value: on, on: (v) => (on = v) },
    { type: 'range', label: '잔상 개수', min: 2, max: 12, step: 1, value: count, on: (v) => (count = v) },
    { type: 'toggle', label: '색 입히기', value: color, on: (v) => (color = v) },
  ];
  const posAt = (t: number): { x: number; sx: number; sy: number; moving: number; dir: number } => {
    const c = t % 2.4;
    const A = 50;
    const B = 230;
    const dash = (k: number): number => 1 - Math.pow(2, -10 * k);
    if (c < 0.9) return { x: A, sx: 1, sy: 1, moving: 0, dir: 1 };
    if (c < 1.2) {
      const k = (c - 0.9) / 0.3;
      return { x: lerp(A, B, dash(k)), sx: 1.25 - k * 0.2, sy: 0.85 + k * 0.1, moving: 1 - k, dir: 1 };
    }
    if (c < 2.1) return { x: B, sx: 1, sy: 1, moving: 0, dir: -1 };
    const k = (c - 2.1) / 0.3;
    return { x: lerp(B, A, dash(k)), sx: 1.25 - k * 0.2, sy: 0.85 + k * 0.1, moving: 1 - k, dir: -1 };
  };
  return {
    controls,
    draw(g: G, w: number, h: number, t: number) {
      reset(g);
      const f = frame(g, w, h);
      vbg(g, f, '#1a1f3d', '#0b0e1f');
      // 바닥 줄
      g.fillStyle = '#262c55';
      g.fillRect(f.L, 128, f.R - f.L, f.B - 128);
      g.fillStyle = 'rgba(255,255,255,.07)';
      for (let x = -20; x < 300; x += 24) g.fillRect(x, 132, 12, 2);
      const p = posAt(t);
      hist.push({ t, x: p.x, y: 0, sx: p.sx, sy: p.sy });
      while (hist.length > 2 && hist[0]!.t < t - 0.6) hist.shift();
      while (hist.length > 2 && hist[0]!.t > t) hist.shift();
      const D = 70;
      // 속도선
      if (p.moving > 0.05) {
        g.strokeStyle = `rgba(200,230,255,${p.moving * 0.6})`;
        g.lineWidth = 1.2;
        for (let i = 0; i < 6; i++) {
          const y = 82 + i * 8 + Math.sin(i * 3.1) * 3;
          const len = 30 + (i % 3) * 14;
          g.beginPath();
          g.moveTo(p.x - p.dir * (30 + i * 3), y);
          g.lineTo(p.x - p.dir * (30 + len), y);
          g.stroke();
        }
      }
      const at = (tt: number): { x: number; sx: number; sy: number } | null => {
        for (let i = hist.length - 1; i > 0; i--) {
          const a = hist[i - 1]!;
          const b = hist[i]!;
          if (a.t <= tt && b.t >= tt) {
            const k = (tt - a.t) / Math.max(1e-6, b.t - a.t);
            return { x: lerp(a.x, b.x, k), sx: lerp(a.sx, b.sx, k), sy: lerp(a.sy, b.sy, k) };
          }
        }
        return null;
      };
      if (on) {
        for (let i = count; i >= 1; i--) {
          const q = at(t - i * 0.035);
          if (!q || Math.abs(q.x - p.x) < 2) continue;
          const k = i / count;
          g.globalAlpha = 0.6 * (1 - k) + 0.08;
          const img = color ? tints[Math.min(tints.length - 1, Math.floor(k * tints.length))]! : bud;
          const dw = D * q.sx;
          const dh = D * q.sy;
          if (color) g.globalCompositeOperation = 'lighter';
          g.drawImage(img, q.x - dw / 2, 128 - dh * 0.9, dw, dh);
          g.globalCompositeOperation = 'source-over';
        }
        g.globalAlpha = 1;
      }
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.beginPath();
      g.ellipse(p.x, 129, 24 * p.sx, 4, 0, 0, TAU);
      g.fill();
      const dw = D * p.sx;
      const dh = D * p.sy;
      g.save();
      g.translate(p.x, 0);
      if (p.dir < 0) g.scale(-1, 1);
      g.drawImage(bud, -dw / 2, 128 - dh * 0.9, dw, dh);
      g.restore();
      // 멈춘 순간 먼지
      const c = t % 1.2;
      if (c > 0.1 && c < 0.6 && Math.floor(t / 1.2) % 1 === 0) {
        const k = (c - 0.1) / 0.5;
        g.fillStyle = `rgba(220,225,255,${0.5 * (1 - k)})`;
        for (let i = 0; i < 4; i++) {
          g.beginPath();
          g.arc(p.x + p.dir * (14 + k * 16) + i * 3 * p.dir, 126 - i * 3 - k * 5, 3 + k * 4, 0, TAU);
          g.fill();
        }
      }
      pill(g, on ? `잔상 ${count}개 · 지난 위치를 반투명으로` : '잔상 끔', 140, 14, 8.5, 'rgba(111,246,255,.15)', '#dffcff');
      g.restore();
    },
  };
}

/* ═════════ i299 변형 메시 ═════════ */
function drawTri(g: G, img: HTMLCanvasElement, s0x: number, s0y: number, s1x: number, s1y: number, s2x: number, s2y: number, d0x: number, d0y: number, d1x: number, d1y: number, d2x: number, d2y: number, shade: number): void {
  const cx = (d0x + d1x + d2x) / 3;
  const cy = (d0y + d1y + d2y) / 3;
  const ex = (x: number, y: number): [number, number] => {
    const dx = x - cx;
    const dy = y - cy;
    const l = Math.hypot(dx, dy) || 1;
    return [x + (dx / l) * 0.7, y + (dy / l) * 0.7];
  };
  g.save();
  g.beginPath();
  const a = ex(d0x, d0y);
  const b = ex(d1x, d1y);
  const c = ex(d2x, d2y);
  g.moveTo(a[0], a[1]);
  g.lineTo(b[0], b[1]);
  g.lineTo(c[0], c[1]);
  g.closePath();
  g.clip();
  const S00 = s1x - s0x;
  const S01 = s2x - s0x;
  const S10 = s1y - s0y;
  const S11 = s2y - s0y;
  const det = S00 * S11 - S01 * S10;
  if (Math.abs(det) > 1e-9) {
    const i00 = S11 / det;
    const i01 = -S01 / det;
    const i10 = -S10 / det;
    const i11 = S00 / det;
    const D00 = d1x - d0x;
    const D01 = d2x - d0x;
    const D10 = d1y - d0y;
    const D11 = d2y - d0y;
    const ma = D00 * i00 + D01 * i10;
    const mc = D00 * i01 + D01 * i11;
    const mb = D10 * i00 + D11 * i10;
    const md = D10 * i01 + D11 * i11;
    const me = d0x - ma * s0x - mc * s0y;
    const mf = d0y - mb * s0x - md * s0y;
    g.save();
    g.transform(ma, mb, mc, md, me, mf);
    g.drawImage(img, 0, 0);
    g.restore();
  }
  if (shade) {
    g.fillStyle = shade > 0 ? `rgba(0,0,20,${shade})` : `rgba(255,255,255,${-shade})`;
    g.fill();
  }
  g.restore();
}
function mkI299() {
  const IS = 160;
  const pic = mkCanvas(IS, IS);
  {
    const x = c2(pic);
    const sky = x.createLinearGradient(0, 0, 0, IS);
    sky.addColorStop(0, '#8fd3ff');
    sky.addColorStop(1, '#e8f7ff');
    x.fillStyle = sky;
    x.fillRect(0, 0, IS, IS);
    x.fillStyle = '#fff6b0';
    x.beginPath();
    x.arc(128, 30, 14, 0, TAU);
    x.fill();
    x.fillStyle = '#fff';
    for (const [cx, cy] of [
      [30, 30],
      [50, 26],
      [42, 36],
    ] as const) {
      x.beginPath();
      x.arc(cx, cy, 10, 0, TAU);
      x.fill();
    }
    x.fillStyle = '#7fd36a';
    x.beginPath();
    x.moveTo(0, 120);
    x.quadraticCurveTo(50, 100, 90, 118);
    x.quadraticCurveTo(130, 104, 160, 116);
    x.lineTo(160, 160);
    x.lineTo(0, 160);
    x.fill();
    x.fillStyle = '#5bb04d';
    x.fillRect(0, 140, IS, 20);
    for (let i = 0; i < 9; i++) {
      x.fillStyle = ['#ff7eb6', '#ffd84d', '#fff'][i % 3]!;
      x.beginPath();
      x.arc(10 + i * 18, 132 + (i % 2) * 8, 3, 0, TAU);
      x.fill();
    }
    x.drawImage(buddy(128, 'mint'), 16, 20, 128, 128);
    x.lineWidth = 6;
    x.strokeStyle = '#ffffff';
    x.strokeRect(3, 3, IS - 6, IS - 6);
  }
  const N = 7;
  let grid = true;
  let auto = true;
  let mode = 0;
  const NAMES = ['숨쉬기', '깃발 출렁', '쭈욱 당기기', '말랑 흔들'];
  const controls: Control[] = [
    { type: 'toggle', label: '격자 보기', value: grid, on: (v) => (grid = v) },
    { type: 'toggle', label: '자동으로 바꾸기', value: auto, on: (v) => (auto = v) },
    {
      type: 'button',
      label: '다음 변형',
      on: () => {
        auto = false;
        mode = (mode + 1) % 4;
      },
    },
  ];
  const vx = new Float32Array((N + 1) * (N + 1));
  const vy = new Float32Array((N + 1) * (N + 1));
  return {
    controls,
    draw(g: G, w: number, h: number, t: number) {
      reset(g);
      const f = frame(g, w, h);
      vbg(g, f, '#22284a', '#10132a');
      const m = auto ? Math.floor(t / 3.2) % 4 : mode;
      const lt = auto ? t % 3.2 : t;
      const SZ = 118;
      const X0 = 140 - SZ / 2;
      const Y0 = 34;
      let grab: [number, number] | null = null;
      for (let j = 0; j <= N; j++)
        for (let i = 0; i <= N; i++) {
          const u = i / N;
          const v = j / N;
          let x = X0 + u * SZ;
          let y = Y0 + v * SZ;
          if (m === 0) {
            const s = Math.sin(lt * 3.2);
            const sy = 1 - 0.09 * s;
            const bul = 0.13 * s * Math.sin(Math.PI * v);
            x = 140 + (x - 140) * (1 + bul);
            y = Y0 + SZ - (Y0 + SZ - y) * sy;
          } else if (m === 1) {
            y += u * 12 * Math.sin(u * 5.5 - lt * 5);
            x += -u * 3 * (1 + Math.cos(u * 5.5 - lt * 5)) + u * 2;
          } else if (m === 2) {
            const k = lt % 3.2;
            const pull = k < 1.2 ? smooth(k / 1.2) : Math.exp(-(k - 1.2) * 2.5) * Math.cos((k - 1.2) * 11);
            const gx = 0.85;
            const gy = 0.2;
            const d2 = (u - gx) ** 2 + (v - gy) ** 2;
            const wgt = Math.exp(-d2 / 0.12);
            x += wgt * pull * 34;
            y -= wgt * pull * 22;
            grab = [X0 + gx * SZ + pull * 34, Y0 + gy * SZ - pull * 22];
          } else {
            const fixed = v;
            x += Math.sin(lt * 7 + v * 4) * 6 * (1 - fixed) * Math.sin(Math.PI * u + 0.2);
            y += Math.sin(lt * 9 + u * 5) * 3 * (1 - fixed);
          }
          vx[j * (N + 1) + i] = x;
          vy[j * (N + 1) + i] = y;
        }
      // 그림자
      g.fillStyle = 'rgba(0,0,0,.3)';
      g.beginPath();
      g.ellipse(140, Y0 + SZ + 6, SZ * 0.55, 6, 0, 0, TAU);
      g.fill();
      const cs = IS / N;
      for (let j = 0; j < N; j++)
        for (let i = 0; i < N; i++) {
          const a = j * (N + 1) + i;
          const b = a + 1;
          const c = a + N + 1;
          const d = c + 1;
          const sx = i * cs;
          const sy = j * cs;
          let sh = 0;
          if (m === 1) sh = Math.cos((i + 0.5) / N * 5.5 - lt * 5) * 0.16 * ((i + 0.5) / N);
          drawTri(g, pic, sx, sy, sx + cs, sy, sx, sy + cs, vx[a]!, vy[a]!, vx[b]!, vy[b]!, vx[c]!, vy[c]!, sh);
          drawTri(g, pic, sx + cs, sy, sx + cs, sy + cs, sx, sy + cs, vx[b]!, vy[b]!, vx[d]!, vy[d]!, vx[c]!, vy[c]!, sh);
        }
      if (grid) {
        g.strokeStyle = 'rgba(255,90,160,.75)';
        g.lineWidth = 0.6;
        g.beginPath();
        for (let j = 0; j <= N; j++)
          for (let i = 0; i <= N; i++) {
            const a = j * (N + 1) + i;
            if (i < N) {
              g.moveTo(vx[a]!, vy[a]!);
              g.lineTo(vx[a + 1]!, vy[a + 1]!);
            }
            if (j < N) {
              g.moveTo(vx[a]!, vy[a]!);
              g.lineTo(vx[a + N + 1]!, vy[a + N + 1]!);
            }
            if (i < N && j < N) {
              g.moveTo(vx[a + 1]!, vy[a + 1]!);
              g.lineTo(vx[a + N + 1]!, vy[a + N + 1]!);
            }
          }
        g.stroke();
        g.fillStyle = '#ff5aa0';
        for (let i = 0; i < vx.length; i++) {
          g.beginPath();
          g.arc(vx[i]!, vy[i]!, 1.3, 0, TAU);
          g.fill();
        }
      }
      if (grab) {
        const [gx, gy] = grab as [number, number];
        g.fillStyle = '#fff';
        g.strokeStyle = '#2a2a40';
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(gx, gy);
        g.lineTo(gx + 4, gy + 12);
        g.lineTo(gx + 7, gy + 8);
        g.lineTo(gx + 12, gy + 13);
        g.lineTo(gx + 14, gy + 11);
        g.lineTo(gx + 9, gy + 6);
        g.lineTo(gx + 13, gy + 4);
        g.closePath();
        g.fill();
        g.stroke();
      }
      pill(g, `그림 1장 · 격자 ${N}×${N} 꼭짓점만 움직임 — ${NAMES[m]}`, 140, 14, 8, 'rgba(255,90,160,.2)', '#ffe6f2');
      g.restore();
    },
  };
}

/* ═════════ i300 2D 뼈대 + 역운동학 ═════════ */
function mkI300() {
  let bones = true;
  let ik = true;
  let speed = 1;
  const controls: Control[] = [
    { type: 'toggle', label: '뼈 보기', value: bones, on: (v) => (bones = v) },
    { type: 'toggle', label: '역운동학 (손이 별 따라가기)', value: ik, on: (v) => (ik = v) },
    { type: 'range', label: '걷기 속도', min: 0, max: 2, step: 0.1, value: speed, on: (v) => (speed = v) },
  ];
  let phase = 0;
  let scroll = 0;
  return {
    controls,
    draw(g: G, w: number, h: number, t: number, dt: number) {
      reset(g);
      const f = frame(g, w, h);
      phase += dt * 6.5 * speed;
      scroll += dt * 44 * speed;
      const sky = g.createLinearGradient(0, f.T, 0, 150);
      sky.addColorStop(0, '#7ec8ff');
      sky.addColorStop(1, '#d9f1ff');
      g.fillStyle = sky;
      g.fillRect(f.L, f.T, f.R - f.L, 150 - f.T);
      // 구름 · 언덕 (시차)
      g.fillStyle = '#ffffff';
      for (let i = 0; i < 4; i++) {
        const x = ((((i * 97 - scroll * 0.15) % 360) + 360) % 360) - 40;
        g.beginPath();
        g.arc(x, 30 + (i % 2) * 14, 9, 0, TAU);
        g.arc(x + 11, 27 + (i % 2) * 14, 12, 0, TAU);
        g.arc(x + 24, 31 + (i % 2) * 14, 8, 0, TAU);
        g.fill();
      }
      g.fillStyle = '#9fdc8a';
      g.beginPath();
      g.moveTo(f.L, 150);
      for (let x = f.L; x <= f.R + 4; x += 6) g.lineTo(x, 126 + Math.sin((x + scroll * 0.4) * 0.035) * 8);
      g.lineTo(f.R, 150);
      g.fill();
      g.fillStyle = '#6cc35a';
      g.fillRect(f.L, 150, f.R - f.L, f.B - 150);
      g.fillStyle = '#58a84a';
      for (let x = -((scroll % 20) + 20); x < f.R + 20; x += 20) {
        g.beginPath();
        g.moveTo(x, 150);
        g.lineTo(x + 3, 145);
        g.lineTo(x + 6, 150);
        g.fill();
      }
      const p = phase;
      const hipX = 128;
      const hipY = 106 - Math.abs(Math.cos(p)) * 2.5;
      const L1 = 21;
      const L2 = 21;
      const leg = (off: number) => {
        const s = p + off;
        const th = 0.48 * Math.sin(s) * Math.min(1, speed + 0.001);
        const bend = 0.95 * Math.max(0, Math.cos(s)) * Math.min(1, speed);
        const a1 = Math.PI / 2 - th;
        const kx = hipX + Math.cos(a1) * L1;
        const ky = hipY + Math.sin(a1) * L1;
        const a2 = a1 + bend;
        return { k: [kx, ky] as [number, number], f: [kx + Math.cos(a2) * L2, ky + Math.sin(a2) * L2] as [number, number], a2 };
      };
      const lb = leg(Math.PI);
      const lf = leg(0);
      const lean = 0.08;
      const shX = hipX + Math.sin(lean) * 30;
      const shY = hipY - 30;
      const headX = shX + 3;
      const headY = shY - 20;
      const U1 = 17;
      const U2 = 16;
      // 뒷팔 (앞뒤로 흔들기 FK)
      const ba1 = Math.PI / 2 + 0.6 * Math.sin(p) * Math.min(1, speed);
      const be = [shX + Math.cos(ba1) * U1, shY + Math.sin(ba1) * U1] as [number, number];
      const ba2 = ba1 - 0.5;
      const bh = [be[0] + Math.cos(ba2) * U2, be[1] + Math.sin(ba2) * U2] as [number, number];
      // 별 목표
      const tx = shX + 30 + Math.cos(t * 1.1) * 18;
      const ty = shY - 12 + Math.sin(t * 1.7) * 30;
      let fe: [number, number];
      let fh: [number, number];
      if (ik) {
        let dx = tx - shX;
        let dy = ty - shY;
        let d = Math.hypot(dx, dy);
        const maxd = U1 + U2 - 0.01;
        if (d > maxd) {
          dx *= maxd / d;
          dy *= maxd / d;
          d = maxd;
        }
        const base = Math.atan2(dy, dx);
        const cosA = clamp((U1 * U1 + d * d - U2 * U2) / (2 * U1 * d), -1, 1);
        const a = base + Math.acos(cosA);
        fe = [shX + Math.cos(a) * U1, shY + Math.sin(a) * U1];
        fh = [shX + dx, shY + dy];
      } else {
        const a = -2.3 + 0.25 * Math.sin(t * 6);
        fe = [shX + Math.cos(a) * U1, shY + Math.sin(a) * U1];
        const a2 = a + 0.7 + 0.5 * Math.sin(t * 6);
        fh = [fe[0] + Math.cos(a2) * U2, fe[1] + Math.sin(a2) * U2];
      }
      // 그림자
      g.fillStyle = 'rgba(0,40,0,.25)';
      g.beginPath();
      g.ellipse(hipX + 4, 150, 26, 4, 0, 0, TAU);
      g.fill();
      const limb = (pts: [number, number][], col: string, wdt: number): void => {
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.beginPath();
        g.moveTo(pts[0]![0], pts[0]![1]);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]![0], pts[i]![1]);
        g.strokeStyle = '#2b2440';
        g.lineWidth = wdt + 2.4;
        g.stroke();
        g.strokeStyle = col;
        g.lineWidth = wdt;
        g.stroke();
      };
      const shoe = (ft: [number, number], col: string): void => {
        g.fillStyle = col;
        g.strokeStyle = '#2b2440';
        g.lineWidth = 1.2;
        g.beginPath();
        g.ellipse(ft[0] + 3, ft[1] + 1, 7, 4, 0, 0, TAU);
        g.fill();
        g.stroke();
      };
      const hand = (p2: [number, number]): void => {
        g.fillStyle = '#ffd9b3';
        g.strokeStyle = '#2b2440';
        g.lineWidth = 1.2;
        g.beginPath();
        g.arc(p2[0], p2[1], 4.2, 0, TAU);
        g.fill();
        g.stroke();
      };
      limb([[shX, shY], be, bh], '#e8794a', 7);
      hand(bh);
      limb([[hipX, hipY], lb.k, lb.f], '#3d63c9', 8.5);
      shoe(lb.f, '#c2354a');
      // 몸통
      g.save();
      g.translate(hipX, hipY);
      g.rotate(lean);
      rr(g, -11, -34, 22, 34, 9);
      g.fillStyle = '#ff9a5c';
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = '#2b2440';
      g.stroke();
      rr(g, -11, -8, 22, 10, 4);
      g.fillStyle = '#4f78e0';
      g.fill();
      g.stroke();
      g.fillStyle = '#ffe07a';
      g.beginPath();
      g.arc(0, -20, 3.5, 0, TAU);
      g.fill();
      g.restore();
      limb([[hipX, hipY], lf.k, lf.f], '#4f78e0', 8.5);
      shoe(lf.f, '#e04a60');
      // 머리
      g.fillStyle = '#ffd9b3';
      g.strokeStyle = '#2b2440';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(headX, headY, 17, 0, TAU);
      g.fill();
      g.stroke();
      g.fillStyle = '#6b3d22';
      g.beginPath();
      g.arc(headX, headY - 2, 17.5, Math.PI * 1.05, Math.PI * 1.95);
      g.quadraticCurveTo(headX + 4, headY - 8, headX - 16.5, headY - 4);
      g.fill();
      g.fillStyle = '#2b2440';
      g.beginPath();
      g.ellipse(headX + 8, headY + 2, 2.2, 3, 0, 0, TAU);
      g.ellipse(headX - 3, headY + 2, 2.2, 3, 0, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,110,140,.45)';
      g.beginPath();
      g.ellipse(headX + 12, headY + 8, 3, 1.8, 0, 0, TAU);
      g.ellipse(headX - 7, headY + 8, 3, 1.8, 0, 0, TAU);
      g.fill();
      g.strokeStyle = '#2b2440';
      g.lineWidth = 1.3;
      g.beginPath();
      g.arc(headX + 3, headY + 8, 3.2, 0.15 * Math.PI, 0.85 * Math.PI);
      g.stroke();
      limb([[shX, shY], fe, fh], '#ff9a5c', 7);
      hand(fh);
      // 별
      const star = (x: number, y: number, r: number): void => {
        g.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5 + t;
          const rr2 = i % 2 ? r * 0.45 : r;
          g.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2);
        }
        g.closePath();
      };
      if (ik) {
        spot(g, tx, ty, 18, [255, 230, 90], 0.5);
        star(tx, ty, 7);
        g.fillStyle = '#ffd93b';
        g.fill();
        g.strokeStyle = '#a86b00';
        g.lineWidth = 1;
        g.stroke();
      }
      if (bones) {
        g.lineCap = 'round';
        g.strokeStyle = 'rgba(40,255,230,.95)';
        g.lineWidth = 1.4;
        const segs: [number, number][][] = [
          [[hipX, hipY], [shX, shY], [headX, headY]],
          [[hipX, hipY], lb.k, lb.f],
          [[hipX, hipY], lf.k, lf.f],
          [[shX, shY], be, bh],
          [[shX, shY], fe, fh],
        ];
        for (const s of segs) {
          g.beginPath();
          g.moveTo(s[0]![0], s[0]![1]);
          for (let i = 1; i < s.length; i++) g.lineTo(s[i]![0], s[i]![1]);
          g.stroke();
        }
        for (const s of segs)
          for (const q of s) {
            g.fillStyle = '#ffffff';
            g.beginPath();
            g.arc(q[0], q[1], 2, 0, TAU);
            g.fill();
            g.strokeStyle = '#0aa';
            g.lineWidth = 0.8;
            g.stroke();
          }
        if (ik) {
          g.setLineDash([2, 2]);
          g.strokeStyle = 'rgba(255,230,90,.9)';
          g.beginPath();
          g.moveTo(shX, shY);
          g.lineTo(tx, ty);
          g.stroke();
          g.setLineDash([]);
        }
      }
      pill(g, ik ? '다리 = 각도 돌리기(FK) · 앞팔 = 별에 손 끝 맞추기(IK)' : '모든 뼈 = 각도만 돌리기 (FK)', 140, 13, 8, 'rgba(20,40,80,.55)', '#fff');
      g.restore();
    },
  };
}

/* ═════════ i301 반짝 쓸기 (sheen) ═════════ */
function mkI301() {
  const Q = 3;
  interface Obj {
    x: number;
    y: number;
    w: number;
    h: number;
    img: HTMLCanvasElement;
    scr: HTMLCanvasElement;
    ph: number;
  }
  const mk = (w: number, h: number, fn: (g: G, w: number, h: number) => void): HTMLCanvasElement => {
    const c = mkCanvas(w * Q, h * Q);
    const x = c2(c);
    x.scale(Q, Q);
    fn(x, w, h);
    return c;
  };
  const coin = mk(70, 70, (g) => {
    const gr = g.createRadialGradient(28, 26, 4, 35, 35, 34);
    gr.addColorStop(0, '#fff3a8');
    gr.addColorStop(0.5, '#ffc83a');
    gr.addColorStop(1, '#c9850e');
    g.fillStyle = '#9a5f05';
    g.beginPath();
    g.arc(35, 36.5, 32, 0, TAU);
    g.fill();
    g.fillStyle = gr;
    g.beginPath();
    g.arc(35, 35, 32, 0, TAU);
    g.fill();
    g.strokeStyle = '#a86b08';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(35, 35, 25, 0, TAU);
    g.stroke();
    g.strokeStyle = 'rgba(255,250,210,.7)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(35, 35, 23.5, Math.PI * 1.1, Math.PI * 1.7);
    g.stroke();
    const star = (ox: number, oy: number): void => {
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? 6.5 : 15;
        g.lineTo(ox + Math.cos(a) * r, oy + Math.sin(a) * r);
      }
      g.closePath();
    };
    star(35, 37.5);
    g.fillStyle = '#b07208';
    g.fill();
    star(35, 36);
    g.fillStyle = '#ffd95a';
    g.fill();
  });
  const card = mk(64, 88, (g) => {
    rr(g, 2, 2, 60, 84, 8);
    const gr = g.createLinearGradient(0, 0, 64, 88);
    gr.addColorStop(0, '#7a4cff');
    gr.addColorStop(1, '#3a1d9a');
    g.fillStyle = gr;
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = '#ffcf4d';
    g.stroke();
    rr(g, 8, 8, 48, 50, 5);
    g.fillStyle = 'rgba(255,255,255,.12)';
    g.fill();
    g.save();
    g.translate(32, 33);
    g.rotate(Math.PI / 4);
    g.fillStyle = '#5ef0ff';
    g.fillRect(-11, -11, 22, 22);
    g.fillStyle = '#c4fbff';
    g.fillRect(-11, -11, 10, 10);
    g.strokeStyle = '#1b6a8a';
    g.lineWidth = 1.5;
    g.strokeRect(-11, -11, 22, 22);
    g.restore();
    txt(g, '레어', 32, 71, 11, '#ffe08a', 'center', 900);
  });
  const word = mk(96, 40, (g) => {
    g.font = `900 30px ${F}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 6;
    g.strokeStyle = '#6b3a00';
    g.strokeText('보상!', 48, 21);
    const gr = g.createLinearGradient(0, 6, 0, 36);
    gr.addColorStop(0, '#fff6b0');
    gr.addColorStop(0.5, '#ffc93a');
    gr.addColorStop(0.52, '#f0a020');
    gr.addColorStop(1, '#ffd65a');
    g.fillStyle = gr;
    g.fillText('보상!', 48, 21);
  });
  const btn = mk(86, 34, (g) => {
    rr(g, 2, 4, 82, 28, 14);
    g.fillStyle = '#2d8a2a';
    g.fill();
    rr(g, 2, 2, 82, 27, 14);
    const gr = g.createLinearGradient(0, 2, 0, 29);
    gr.addColorStop(0, '#8ff07a');
    gr.addColorStop(1, '#3cb33a');
    g.fillStyle = gr;
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = '#1f6a1d';
    g.stroke();
    txt(g, '받기', 43, 16, 13, '#fff', 'center', 900);
  });
  const objs: Obj[] = [
    { x: 18, y: 50, w: 70, h: 70, img: coin, scr: mkCanvas(coin.width, coin.height), ph: 0 },
    { x: 104, y: 40, w: 64, h: 88, img: card, scr: mkCanvas(card.width, card.height), ph: 0.25 },
    { x: 182, y: 44, w: 96, h: 40, img: word, scr: mkCanvas(word.width, word.height), ph: 0.5 },
    { x: 187, y: 100, w: 86, h: 34, img: btn, scr: mkCanvas(btn.width, btn.height), ph: 0.7 },
  ];
  let on = true;
  let bw = 0.18;
  let spd = 1;
  const controls: Control[] = [
    { type: 'toggle', label: '빛 띠', value: on, on: (v) => (on = v) },
    { type: 'range', label: '띠 폭', min: 0.05, max: 0.4, step: 0.01, value: bw, on: (v) => (bw = v) },
    { type: 'range', label: '속도', min: 0.3, max: 3, step: 0.1, value: spd, on: (v) => (spd = v) },
  ];
  return {
    controls,
    draw(g: G, w: number, h: number, t: number) {
      reset(g);
      const f = frame(g, w, h);
      vbg(g, f, '#2b1a55', '#140b2c');
      // 뒤 빛살
      g.save();
      g.translate(140, 90);
      g.rotate(t * 0.15);
      g.fillStyle = 'rgba(255,220,120,.05)';
      for (let i = 0; i < 12; i++) {
        g.rotate(TAU / 12);
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(220, -18);
        g.lineTo(220, 18);
        g.fill();
      }
      g.restore();
      for (const o of objs) {
        const fl = Math.sin(t * 2 + o.ph * 6) * 2;
        const cyc = ((t * spd) / 2.4 + o.ph) % 1;
        const x = c2(o.scr);
        x.globalCompositeOperation = 'source-over';
        x.clearRect(0, 0, o.scr.width, o.scr.height);
        x.drawImage(o.img, 0, 0);
        if (on && cyc < 0.55) {
          const W = o.scr.width;
          const H = o.scr.height;
          const k = cyc / 0.55;
          const span = W + H;
          const c = -H * 0.6 + k * (span + H * 0.6);
          const half = bw * Math.max(W, H);
          x.globalCompositeOperation = 'source-atop';
          const gr = x.createLinearGradient(c - half, 0, c + half, half * 0.9);
          gr.addColorStop(0, 'rgba(255,255,255,0)');
          gr.addColorStop(0.42, 'rgba(255,255,255,.25)');
          gr.addColorStop(0.5, 'rgba(255,255,255,.95)');
          gr.addColorStop(0.58, 'rgba(255,255,255,.25)');
          gr.addColorStop(1, 'rgba(255,255,255,0)');
          x.fillStyle = gr;
          x.fillRect(0, 0, W, H);
          const gr2 = x.createLinearGradient(c - half * 1.9, 0, c - half * 1.5, half * 0.4);
          gr2.addColorStop(0, 'rgba(255,255,255,0)');
          gr2.addColorStop(0.5, 'rgba(255,255,255,.5)');
          gr2.addColorStop(1, 'rgba(255,255,255,0)');
          x.fillStyle = gr2;
          x.fillRect(0, 0, W, H);
        }
        g.fillStyle = 'rgba(0,0,0,.3)';
        g.beginPath();
        g.ellipse(o.x + o.w / 2, o.y + o.h + 8, o.w * 0.35, 3, 0, 0, TAU);
        g.fill();
        g.drawImage(o.scr, o.x, o.y + fl, o.w, o.h);
        if (on && cyc > 0.45 && cyc < 0.62) {
          const k = (cyc - 0.45) / 0.17;
          const sx = o.x + o.w * 0.82;
          const sy = o.y + o.h * 0.22 + fl;
          const s = Math.sin(k * Math.PI) * 7;
          g.fillStyle = '#fff';
          g.beginPath();
          g.moveTo(sx, sy - s);
          g.quadraticCurveTo(sx, sy, sx + s, sy);
          g.quadraticCurveTo(sx, sy, sx, sy + s);
          g.quadraticCurveTo(sx, sy, sx - s, sy);
          g.quadraticCurveTo(sx, sy, sx, sy - s);
          g.fill();
        }
      }
      pill(g, '그림 위에만(source-atop) 대각 빛 띠를 지나가게', 140, 14, 8, 'rgba(255,220,120,.16)', '#fff4d6');
      g.restore();
    },
  };
}

/* ═════════ i302 캔버스 입자 엔진 ═════════ */
function mkI302() {
  const dot = (col: V3, R = 32): HTMLCanvasElement => {
    const c = mkCanvas(R * 2, R * 2);
    const x = c2(c);
    const gr = x.createRadialGradient(R, R, 0, R, R, R);
    gr.addColorStop(0, rgba(col, 1));
    gr.addColorStop(0.4, rgba(col, 0.55));
    gr.addColorStop(1, rgba(col, 0));
    x.fillStyle = gr;
    x.fillRect(0, 0, R * 2, R * 2);
    return c;
  };
  const FIRE = [dot([255, 248, 200]), dot([255, 190, 60]), dot([255, 100, 30]), dot([200, 40, 30])];
  const SMOKE = dot([150, 150, 170]);
  const starC = (col: V3): HTMLCanvasElement => {
    const c = mkCanvas(48, 48);
    const x = c2(c);
    const gr = x.createRadialGradient(24, 24, 0, 24, 24, 24);
    gr.addColorStop(0, rgba(col, 0.6));
    gr.addColorStop(1, rgba(col, 0));
    x.fillStyle = gr;
    x.fillRect(0, 0, 48, 48);
    x.fillStyle = '#fff';
    x.beginPath();
    x.moveTo(24, 4);
    x.quadraticCurveTo(24, 24, 44, 24);
    x.quadraticCurveTo(24, 24, 24, 44);
    x.quadraticCurveTo(24, 24, 4, 24);
    x.quadraticCurveTo(24, 24, 24, 4);
    x.fill();
    return c;
  };
  const STARS = [starC([255, 230, 90]), starC([110, 230, 255]), starC([255, 120, 220])];
  const petal = mkCanvas(24, 24);
  {
    const x = c2(petal);
    x.translate(12, 12);
    x.beginPath();
    x.moveTo(0, -10);
    x.bezierCurveTo(8, -6, 7, 6, 0, 10);
    x.bezierCurveTo(-7, 6, -8, -6, 0, -10);
    const gr = x.createLinearGradient(0, -10, 0, 10);
    gr.addColorStop(0, '#ffe3ef');
    gr.addColorStop(1, '#ff8fbd');
    x.fillStyle = gr;
    x.fill();
    x.fillStyle = 'rgba(255,255,255,.6)';
    x.beginPath();
    x.ellipse(-2, -3, 1.5, 4, 0.2, 0, TAU);
    x.fill();
  }
  interface P {
    k: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    max: number;
    size: number;
    rot: number;
    vr: number;
    c: number;
  }
  const ps: P[] = [];
  let rate = 1;
  let add = true;
  const acc = [0, 0, 0, 0];
  const controls: Control[] = [
    { type: 'range', label: '방출량', min: 0.2, max: 2.5, step: 0.1, value: rate, on: (v) => (rate = v) },
    { type: 'toggle', label: '더하기 혼합 (불 · 반짝이)', value: add, on: (v) => (add = v) },
  ];
  const R = Math.random;
  const emit = (k: number, t: number): void => {
    if (k === 0) ps.push({ k, x: 40 + (R() - 0.5) * 16, y: 132, vx: (R() - 0.5) * 8, vy: -38 - R() * 30, life: 0, max: 0.6 + R() * 0.5, size: 9 + R() * 6, rot: 0, vr: 0, c: 0 });
    else if (k === 1) ps.push({ k, x: 108 + (R() - 0.5) * 6, y: 112, vx: (R() - 0.5) * 6, vy: -16 - R() * 10, life: 0, max: 2.2 + R(), size: 5, rot: 0, vr: 0, c: 0 });
    else if (k === 2) {
      const ax = 175 + Math.cos(t * 2.2) * 22;
      const ay = 82 + Math.sin(t * 3.1) * 22;
      const a = R() * TAU;
      const s = 6 + R() * 22;
      ps.push({ k, x: ax, y: ay, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 0.6 + R() * 0.6, size: 5 + R() * 6, rot: R() * TAU, vr: 0, c: Math.floor(R() * 3) });
    } else ps.push({ k, x: 220 + R() * 60, y: 18, vx: -6 - R() * 6, vy: 14 + R() * 10, life: 0, max: 4.5, size: 7 + R() * 4, rot: R() * TAU, vr: (R() - 0.5) * 4, c: R() * TAU });
  };
  const RATES = [70, 14, 40, 6];
  return {
    controls,
    draw(g: G, w: number, h: number, t: number, dt0: number) {
      const dt = Math.min(dt0, 0.05);
      reset(g);
      const f = frame(g, w, h);
      vbg(g, f, '#151a33', '#0a0c1a');
      for (let k = 0; k < 4; k++) {
        acc[k]! += RATES[k]! * rate * dt;
        while (acc[k]! >= 1 && ps.length < 900) {
          acc[k]! -= 1;
          emit(k, t);
        }
        if (acc[k]! > 5) acc[k] = 0;
      }
      // 소품
      spot(g, 40, 130, 50, [255, 130, 40], 0.25 + Math.sin(t * 13) * 0.04);
      g.fillStyle = '#6b3d22';
      g.save();
      g.translate(40, 138);
      g.rotate(0.25);
      rr(g, -16, -3, 32, 7, 3);
      g.fill();
      g.rotate(-0.5);
      rr(g, -16, -3, 32, 7, 3);
      g.fill();
      g.restore();
      // 굴뚝 냄비
      g.fillStyle = '#4b5068';
      rr(g, 98, 112, 20, 26, 3);
      g.fill();
      g.fillStyle = '#5d637f';
      rr(g, 95, 109, 26, 6, 2);
      g.fill();
      // 요술봉
      const ax = 175 + Math.cos(t * 2.2) * 22;
      const ay = 82 + Math.sin(t * 3.1) * 22;
      g.strokeStyle = '#c9a6ff';
      g.lineWidth = 2.4;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(175, 140);
      g.lineTo(ax, ay);
      g.stroke();
      // 나뭇가지
      g.strokeStyle = '#5a3a2a';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(f.R, 8);
      g.quadraticCurveTo(250, 12, 225, 4);
      g.stroke();
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i]!;
        p.life += dt;
        if (p.life >= p.max) {
          ps[i] = ps[ps.length - 1]!;
          ps.pop();
          continue;
        }
        if (p.k === 0) {
          p.vx += (40 - p.x) * 1.5 * dt;
          p.vy -= 10 * dt;
        } else if (p.k === 1) {
          p.vx += Math.sin(t * 0.8 + p.y * 0.05) * 6 * dt + 4 * dt;
          p.vy *= 1 - 0.3 * dt;
        } else if (p.k === 2) {
          p.vx *= 1 - 2 * dt;
          p.vy *= 1 - 2 * dt;
          p.vy += 8 * dt;
        } else {
          p.vx = -8 + Math.sin(t * 1.5 + p.c) * 14;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
      }
      // 연기 (보통 혼합) 먼저
      g.globalCompositeOperation = 'source-over';
      for (const p of ps) {
        if (p.k !== 1) continue;
        const k = p.life / p.max;
        const s = p.size + k * 22;
        g.globalAlpha = 0.45 * Math.sin(Math.min(1, k * 4) * Math.PI * 0.5) * (1 - k);
        g.drawImage(SMOKE, p.x - s, p.y - s, s * 2, s * 2);
      }
      for (const p of ps) {
        if (p.k !== 3) continue;
        const k = p.life / p.max;
        g.globalAlpha = k > 0.85 ? (1 - k) / 0.15 : 1;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.scale(Math.cos(p.life * 3 + p.c), 1);
        g.drawImage(petal, -p.size / 2, -p.size / 2, p.size, p.size);
        g.restore();
      }
      g.globalCompositeOperation = add ? 'lighter' : 'source-over';
      for (const p of ps) {
        const k = p.life / p.max;
        if (p.k === 0) {
          const img = FIRE[Math.min(3, Math.floor(k * 4))]!;
          const s = p.size * (1 - k * 0.7);
          g.globalAlpha = (1 - k) * 0.9;
          g.drawImage(img, p.x - s, p.y - s, s * 2, s * 2);
        } else if (p.k === 2) {
          const s = p.size * (1 - k) * (0.6 + 0.4 * Math.abs(Math.sin(p.life * 18 + p.rot)));
          g.globalAlpha = 1 - k;
          g.drawImage(STARS[p.c]!, p.x - s, p.y - s, s * 2, s * 2);
        }
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      const lab = ['불 · 더하기', '연기 · 보통', '반짝이 · 더하기', '꽃잎 · 돌기'];
      for (let k = 0; k < 4; k++) txt(g, lab[k]!, [40, 108, 175, 245][k]!, 158, 7.5, '#aab4dd');
      pill(g, `입자 ${ps.length}개 — 방출 · 수명 · 움직임 · 혼합`, 120, 14, 8, 'rgba(255,255,255,.1)', '#e8ecff');
      g.restore();
    },
  };
}

/* ═════════ i303 텍스처 아틀라스 꾸리기 ═════════ */
function mkI303() {
  const AW = 32;
  const COLS = ['#ffd84d', '#ff7aa8', '#6fd3ff', '#8be07a', '#c69bff', '#ffa45c'];
  interface It {
    w: number;
    h: number;
    x: number;
    y: number;
    sx: number;
    sy: number;
    rot: number;
    kind: number;
    col: string;
  }
  let items: It[] = [];
  let used = 0;
  let seed = 1;
  let stepT = 0.07;
  let showSky = true;
  let sky: number[] = [];
  const build = (): void => {
    const r = rng(seed++);
    // 판(AW × AW)을 넘치지 않을 때까지 장 수를 줄여 다시 꾸린다
    for (let n = 40; n >= 16; n -= 2) {
    items = [];
    for (let i = 0; i < n; i++) {
      const big = r() < 0.18;
      const w = big ? 7 + Math.floor(r() * 5) : 3 + Math.floor(r() * 5);
      const h = big ? 6 + Math.floor(r() * 5) : 3 + Math.floor(r() * 5);
      items.push({ w, h, x: 0, y: 0, sx: 8 + r() * 104, sy: 32 + r() * 120, rot: (r() - 0.5) * 0.6, kind: Math.floor(r() * 6), col: COLS[Math.floor(r() * COLS.length)]! });
    }
    items.sort((a, b) => b.h - a.h || b.w - a.w);
    const hs = new Array<number>(AW).fill(0);
    used = 0;
    for (const it of items) {
      let best = 1e9;
      let bx = 0;
      for (let x = 0; x + it.w <= AW; x++) {
        let m = 0;
        for (let k = x; k < x + it.w; k++) m = Math.max(m, hs[k]!);
        if (m < best) {
          best = m;
          bx = x;
        }
      }
      it.x = bx;
      it.y = best;
      for (let k = bx; k < bx + it.w; k++) hs[k] = best + it.h;
      used += it.w * it.h;
    }
    sky = hs;
    if (Math.max(...hs) <= AW) break;
    }
  };
  build();
  let cycleStart = 0;
  const controls: Control[] = [
    { type: 'range', label: '한 장 꾸리는 시간 (초)', min: 0.02, max: 0.2, step: 0.01, value: stepT, on: (v) => (stepT = v) },
    { type: 'toggle', label: '스카이라인(빈자리 높이) 선', value: showSky, on: (v) => (showSky = v) },
    {
      type: 'button',
      label: '새 그림 묶음',
      on: () => {
        build();
        cycleStart = -1;
      },
    },
  ];
  const icon = (g: G, kind: number, cx: number, cy: number, s: number): void => {
    g.fillStyle = 'rgba(40,30,70,.75)';
    g.strokeStyle = 'rgba(40,30,70,.75)';
    g.lineWidth = s * 0.12;
    g.beginPath();
    if (kind === 0) g.arc(cx, cy, s * 0.35, 0, TAU);
    else if (kind === 1) {
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? s * 0.17 : s * 0.4;
        g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
    } else if (kind === 2) {
      g.moveTo(cx, cy + s * 0.32);
      g.bezierCurveTo(cx - s * 0.55, cy - s * 0.05, cx - s * 0.2, cy - s * 0.45, cx, cy - s * 0.15);
      g.bezierCurveTo(cx + s * 0.2, cy - s * 0.45, cx + s * 0.55, cy - s * 0.05, cx, cy + s * 0.32);
    } else if (kind === 3) {
      g.moveTo(cx, cy - s * 0.38);
      g.lineTo(cx + s * 0.32, cy);
      g.lineTo(cx, cy + s * 0.38);
      g.lineTo(cx - s * 0.32, cy);
    } else if (kind === 4) g.ellipse(cx, cy, s * 0.38, s * 0.2, -0.7, 0, TAU);
    else {
      g.rect(cx - s * 0.25, cy - s * 0.25, s * 0.5, s * 0.5);
    }
    g.closePath();
    g.fill();
  };
  return {
    controls,
    draw(g: G, w: number, h: number, t: number) {
      reset(g);
      const f = frame(g, w, h);
      vbg(g, f, '#1d2142', '#0d1024');
      if (cycleStart < 0) cycleStart = t;
      const n = items.length;
      const total = n * stepT + 0.4 + 2.2;
      let lt = t - cycleStart;
      if (lt > total) {
        build();
        cycleStart = t;
        lt = 0;
      }
      const AX = 146;
      const AY = 30;
      const AS = 124;
      const cu = AS / AW;
      // 아틀라스 판
      rr(g, AX - 3, AY - 3, AS + 6, AS + 6, 4);
      g.fillStyle = '#272c55';
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,.08)';
      g.lineWidth = 0.4;
      for (let i = 0; i <= AW; i += 4) {
        g.beginPath();
        g.moveTo(AX + i * cu, AY);
        g.lineTo(AX + i * cu, AY + AS);
        g.moveTo(AX, AY + i * cu);
        g.lineTo(AX + AS, AY + i * cu);
        g.stroke();
      }
      txt(g, '흩어진 그림 ' + n + '장', 64, 24, 8, '#aeb6e0');
      txt(g, '아틀라스 1장', AX + AS / 2, 21, 8, '#aeb6e0');
      let placed = 0;
      let area = 0;
      for (let i = 0; i < n; i++) {
        const it = items[i]!;
        const k = clamp01((lt - i * stepT) / 0.4);
        const e = 1 - Math.pow(1 - k, 3);
        const tx = AX + it.x * cu;
        const ty = AY + it.y * cu;
        const ww = it.w * cu;
        const hh = it.h * cu;
        const x = lerp(it.sx, tx, e);
        const y = lerp(it.sy, ty, e);
        const rot = it.rot * (1 - e);
        if (k >= 1) {
          placed++;
          area += it.w * it.h;
        }
        g.save();
        g.translate(x + ww / 2, y + hh / 2);
        g.rotate(rot);
        if (k > 0 && k < 1) {
          g.shadowColor = 'rgba(0,0,0,.5)';
          g.shadowBlur = 6;
        }
        rr(g, -ww / 2 + 0.4, -hh / 2 + 0.4, ww - 0.8, hh - 0.8, Math.min(ww, hh) * 0.18);
        g.fillStyle = it.col;
        g.fill();
        g.shadowBlur = 0;
        g.shadowColor = 'transparent';
        icon(g, it.kind, 0, 0, Math.min(ww, hh));
        if (k > 0 && k < 1) {
          g.strokeStyle = '#fff';
          g.lineWidth = 1;
          g.stroke();
        }
        g.restore();
      }
      if (showSky && placed > 0) {
        const hs = new Array<number>(AW).fill(0);
        for (let i = 0; i < placed; i++) {
          const it = items[i]!;
          for (let k = it.x; k < it.x + it.w; k++) hs[k] = Math.max(hs[k]!, it.y + it.h);
        }
        g.strokeStyle = '#ff5a8a';
        g.lineWidth = 1.2;
        g.beginPath();
        for (let k = 0; k < AW; k++) {
          const y = AY + hs[k]! * cu;
          if (k === 0) g.moveTo(AX, y);
          else g.lineTo(AX + k * cu, y);
          g.lineTo(AX + (k + 1) * cu, y);
        }
        g.stroke();
      }
      void sky;
      const fill = Math.round((area / (AW * AW)) * 100);
      rr(g, 12, 148, 120, 18, 9);
      g.fillStyle = 'rgba(255,255,255,.08)';
      g.fill();
      txt(g, `그리기 호출 ${n - placed + (placed ? 1 : 0)}번 · 채움 ${fill}%`, 72, 157, 7.5, placed === n ? '#8bffb0' : '#e7eaff');
      void used;
      g.restore();
    },
  };
}

/* ═════════ i304 픽셀 아트 확대 ═════════ */
function epx(src: Uint32Array, W: number, H: number): Uint32Array {
  const o = new Uint32Array(W * 2 * H * 2);
  const at = (x: number, y: number): number => src[clamp(y, 0, H - 1) * W + clamp(x, 0, W - 1)]!;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const P = at(x, y);
      const A = at(x, y - 1);
      const B = at(x + 1, y);
      const C = at(x - 1, y);
      const D = at(x, y + 1);
      let p1 = P;
      let p2 = P;
      let p3 = P;
      let p4 = P;
      if (C === A && C !== D && A !== B) p1 = A;
      if (A === B && A !== C && B !== D) p2 = B;
      if (D === C && D !== B && C !== A) p3 = C;
      if (B === D && B !== A && D !== C) p4 = D;
      const W2 = W * 2;
      o[y * 2 * W2 + x * 2] = p1;
      o[y * 2 * W2 + x * 2 + 1] = p2;
      o[(y * 2 + 1) * W2 + x * 2] = p3;
      o[(y * 2 + 1) * W2 + x * 2 + 1] = p4;
    }
  return o;
}
function mkI304() {
  const base = pixCanvas(SLIME, SL_PAL.orig!);
  const d0 = new Uint32Array(c2(base).getImageData(0, 0, PN, PN).data.buffer.slice(0));
  const e1 = epx(d0, PN, PN);
  const e2 = epx(e1, PN * 2, PN * 2);
  const ep = mkCanvas(PN * 4, PN * 4);
  {
    const x = c2(ep);
    const im = x.createImageData(PN * 4, PN * 4);
    new Uint32Array(im.data.buffer).set(e2);
    x.putImageData(im, 0, 0);
  }
  const LW = 120;
  const LH = 18;
  const lanes = [mkCanvas(LW, LH), mkCanvas(LW, LH)];
  let gridOn = true;
  let spd = 1;
  let along = 0;
  const controls: Control[] = [
    { type: 'toggle', label: '원래 칸 격자', value: gridOn, on: (v) => (gridOn = v) },
    { type: 'range', label: '카메라 속도', min: 0, max: 3, step: 0.1, value: spd, on: (v) => (spd = v) },
  ];
  return {
    controls,
    draw(g: G, w: number, h: number, _t: number, dt: number) {
      reset(g);
      const f = frame(g, w, h);
      vbg(g, f, '#1b2040', '#0c0f22');
      along += dt * spd;
      const PS = 72;
      const xs = [14, 104, 194];
      const labs = ['가장 가까운 점 ×4', 'scale2x(EPX) ×4', '부드럽게 ×4'];
      for (let i = 0; i < 3; i++) {
        const x = xs[i]!;
        const y = 22;
        rr(g, x - 2, y - 2, PS + 4, PS + 4, 5);
        g.fillStyle = '#e9f2ff';
        g.fill();
        g.fillStyle = '#cfe0f5';
        for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) if ((a + b) % 2) g.fillRect(x + a * 9, y + b * 9, 9, 9);
        g.imageSmoothingEnabled = i === 2;
        if (i === 2) g.imageSmoothingQuality = 'high';
        g.drawImage(i === 1 ? ep : base, x, y, PS, PS);
        g.imageSmoothingEnabled = true;
        if (gridOn && i === 0) {
          g.strokeStyle = 'rgba(0,0,0,.12)';
          g.lineWidth = 0.4;
          for (let k = 0; k <= 16; k++) {
            g.beginPath();
            g.moveTo(x + k * 4.5, y);
            g.lineTo(x + k * 4.5, y + PS);
            g.moveTo(x, y + k * 4.5);
            g.lineTo(x + PS, y + k * 4.5);
            g.stroke();
          }
        }
        txt(g, labs[i]!, x + PS / 2, 103, 7.5, ['#9fe0ff', '#9fffc0', '#ffb3c8'][i]!);
      }
      txt(g, '계단 그대로', xs[0]! + PS / 2, 13, 6.5, '#7f88b8');
      txt(g, '대각선만 매끈', xs[1]! + PS / 2, 13, 6.5, '#7f88b8');
      txt(g, '흐릿해짐', xs[2]! + PS / 2, 13, 6.5, '#7f88b8');
      // 서브픽셀 줄
      const pos = 8 + (Math.sin(along * 0.9) * 0.5 + 0.5) * (LW - 34);
      for (let k = 0; k < 2; k++) {
        const c = lanes[k]!;
        const x = c2(c);
        x.imageSmoothingEnabled = k === 1;
        x.fillStyle = '#2d3566';
        x.fillRect(0, 0, LW, LH);
        x.fillStyle = '#3a4580';
        for (let i = 0; i < LW; i += 8) x.fillRect(i, LH - 2, 4, 2);
        const px = k === 0 ? Math.round(pos) : pos;
        x.drawImage(base, px, 1, 16, 16);
        const y = 114 + k * 30;
        g.imageSmoothingEnabled = false;
        g.drawImage(c, 78, y, LW * 1.6, LH * 1.6);
        g.imageSmoothingEnabled = true;
        txt(g, k === 0 ? '정수 칸에 맞춤' : '반 칸 위치', 40, y + 10, 7.5, k === 0 ? '#9fffc0' : '#ffb3c8');
        txt(g, k === 0 ? '또렷' : '번지고 떨림', 40, y + 20, 6.5, '#7f88b8');
      }
      g.restore();
    },
  };
}

/* ═════════ i305 모드 7 바닥 ═════════ */
function mkI305() {
  const TS = 256;
  const tex = new Uint32Array(TS * TS);
  const A = 92;
  const Bb = 80;
  const r = rng(7);
  const flowers: [number, number, number][] = [];
  for (let i = 0; i < 260; i++) flowers.push([Math.floor(r() * TS), Math.floor(r() * TS), Math.floor(r() * 3)]);
  for (let y = 0; y < TS; y++)
    for (let x = 0; x < TS; x++) {
      const dx = (x - 128) / A;
      const dy = (y - 128) / Bb;
      const d = Math.pow(dx ** 4 + dy ** 4, 0.25);
      const e = (d - 1) * 86;
      const ang = Math.atan2(dy, dx);
      const nz = hash2(x, y, 3) * 14 - 7;
      let c: number;
      if (Math.abs(e) < 11) {
        const v = 112 + nz;
        c = pack(v, v + 4, v + 16);
        if (Math.abs(e) < 0.9 && Math.floor((ang + Math.PI) * 18) % 2 === 0) c = pack(255, 255, 240);
        if (Math.abs(ang) < 0.06) c = (Math.floor(e / 3) + Math.floor(ang * 120)) & 1 ? pack(250, 250, 250) : pack(30, 30, 40);
      } else if (Math.abs(e) < 14.5) {
        c = Math.floor((ang + Math.PI) * 36) % 2 ? pack(240, 70, 80) : pack(250, 250, 250);
      } else {
        const dc = Math.hypot(x - 128, y - 128);
        if (dc < 30) {
          const wv = Math.sin(dc * 0.6) * 10;
          c = pack(70 + wv, 150 + wv, 235);
        } else if (dc < 34) c = pack(240, 220, 160);
        else {
          const ch = ((x >> 4) + (y >> 4)) & 1;
          const v = nz;
          c = ch ? pack(110 + v, 200 + v, 90 + v) : pack(95 + v, 182 + v, 78 + v);
        }
      }
      tex[y * TS + x] = c;
    }
  const FC = [pack(255, 120, 170), pack(255, 230, 90), pack(255, 255, 255)];
  for (const [fx, fy, k] of flowers) {
    const i = fy * TS + fx;
    const dx = (fx - 128) / A;
    const dy = (fy - 128) / Bb;
    const e = (Math.pow(dx ** 4 + dy ** 4, 0.25) - 1) * 86;
    if (Math.abs(e) > 18 && Math.hypot(fx - 128, fy - 128) > 36) {
      tex[i] = FC[k]!;
      if (fx + 1 < TS) tex[i + 1] = FC[k]!;
    }
  }
  const texC = mkCanvas(TS, TS);
  {
    const x = c2(texC);
    const im = x.createImageData(TS, TS);
    new Uint32Array(im.data.buffer).set(tex);
    x.putImageData(im, 0, 0);
  }
  const LW = 160;
  let LH = 100;
  let lr = mkCanvas(LW, LH);
  let lx = c2(lr);
  let im: ImageData | null = null;
  let buf: Uint32Array | null = null;
  let camH = 16;
  let mini = true;
  let spd = 1;
  let th = 0;
  const controls: Control[] = [
    { type: 'range', label: '카메라 높이', min: 5, max: 45, step: 1, value: camH, on: (v) => (camH = v) },
    { type: 'range', label: '속도', min: 0, max: 2.5, step: 0.1, value: spd, on: (v) => (spd = v) },
    { type: 'toggle', label: '평면 지도 보기', value: mini, on: (v) => (mini = v) },
  ];
  const posAt = (a: number): [number, number] => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [128 + A * Math.sign(c) * Math.sqrt(Math.abs(c)), 128 + Bb * Math.sign(s) * Math.sqrt(Math.abs(s))];
  };
  const SKY = [150, 210, 255] as V3;
  const mtn = mkCanvas(320, 40);
  {
    const x = c2(mtn);
    for (let layer = 0; layer < 2; layer++) {
      x.fillStyle = layer ? '#7aa0c8' : '#a8c4e2';
      x.beginPath();
      x.moveTo(0, 40);
      for (let i = 0; i <= 320; i += 4) {
        const yy = 22 - layer * -6 - (Math.sin((i / 320) * TAU * 3 + layer) * 6 + Math.sin((i / 320) * TAU * 7 + layer * 2) * 3 + (layer ? 0 : 6));
        x.lineTo(i, yy);
      }
      x.lineTo(320, 40);
      x.fill();
    }
  }
  return {
    controls,
    draw(g: G, w: number, h: number, _t: number, dt: number) {
      reset(g);
      const want = clamp(Math.round((LW * h) / w), 60, 150);
      if (want !== LH || !im) {
        LH = want;
        lr = mkCanvas(LW, LH);
        lx = c2(lr);
        im = null;
      }
      const hz = Math.round(LH * 0.36);
      if (!im) {
        im = lx.createImageData(LW, LH - hz - 1);
        buf = new Uint32Array(im.data.buffer);
      }
      th += dt * 0.32 * spd;
      const p0 = posAt(th);
      const p1 = posAt(th + 0.02);
      let fx = p1[0] - p0[0];
      let fy = p1[1] - p0[1];
      const fl = Math.hypot(fx, fy) || 1;
      fx /= fl;
      fy /= fl;
      const rx = -fy;
      const ry = fx;
      const cx = p0[0] - fx * 16;
      const cy = p0[1] - fy * 16;
      const heading = Math.atan2(fy, fx);
      // 하늘
      const sg = lx.createLinearGradient(0, 0, 0, hz);
      sg.addColorStop(0, '#5aa8ff');
      sg.addColorStop(1, '#cfeaff');
      lx.fillStyle = sg;
      lx.fillRect(0, 0, LW, hz + 1);
      const off = ((((heading / TAU) * 320) % 320) + 320) % 320;
      lx.drawImage(mtn, -off, hz - 38);
      lx.drawImage(mtn, 320 - off, hz - 38);
      lx.fillStyle = 'rgba(255,255,255,.9)';
      for (let i = 0; i < 4; i++) {
        const x = ((((i * 90 - off * 0.6) % 360) + 360) % 360) - 30;
        lx.beginPath();
        lx.ellipse(x, 8 + (i % 2) * 7, 10, 3, 0, 0, TAU);
        lx.fill();
      }
      const focal = 70;
      const b = buf!;
      const rows = LH - hz - 1;
      for (let row = 0; row < rows; row++) {
        const sy = row + 1;
        const z = (camH * focal) / sy;
        const fog = clamp01((z - 40) / 220);
        const step = z / focal;
        let wx = cx + fx * z + rx * (-LW / 2) * step;
        let wy = cy + fy * z + ry * (-LW / 2) * step;
        const dx = rx * step;
        const dy = ry * step;
        const o = row * LW;
        for (let x = 0; x < LW; x++) {
          const ix = Math.floor(wx);
          const iy = Math.floor(wy);
          let c: number;
          if (ix >= 0 && iy >= 0 && ix < TS && iy < TS) c = tex[iy * TS + ix]!;
          else c = ((ix >> 4) + (iy >> 4)) & 1 ? pack(110, 200, 90) : pack(95, 182, 78);
          if (fog > 0) {
            const R0 = c & 255;
            const G0 = (c >> 8) & 255;
            const B0 = (c >> 16) & 255;
            c = pack(R0 + (SKY[0] - R0) * fog, G0 + (SKY[1] - G0) * fog, B0 + (SKY[2] - B0) * fog);
          }
          b[o + x] = c;
          wx += dx;
          wy += dy;
        }
      }
      lx.putImageData(im!, 0, hz + 1);
      g.imageSmoothingEnabled = false;
      g.drawImage(lr, 0, 0, w, h);
      g.imageSmoothingEnabled = true;
      const f = frame(g, w, h);
      // 카트
      const kx = 140;
      const ky = f.B - 26;
      const bob = Math.sin(_t * 18) * 0.6;
      g.fillStyle = 'rgba(0,0,0,.3)';
      g.beginPath();
      g.ellipse(kx, ky + 15, 30, 5, 0, 0, TAU);
      g.fill();
      g.fillStyle = '#2b2b3a';
      rr(g, kx - 30, ky + 2, 13, 14, 4);
      g.fill();
      rr(g, kx + 17, ky + 2, 13, 14, 4);
      g.fill();
      rr(g, kx - 24, ky - 6 + bob, 48, 18, 7);
      g.fillStyle = '#ff4f5e';
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = '#7a1622';
      g.stroke();
      g.drawImage(buddy(64, 'mint'), kx - 18, ky - 36 + bob, 36, 36);
      g.fillStyle = '#ffd84d';
      rr(g, kx - 10, ky + 4 + bob, 20, 5, 2);
      g.fill();
      if (mini) {
        const M = 56;
        const mx = 216;
        const my = 6;
        rr(g, mx - 2, my - 2, M + 4, M + 4, 4);
        g.fillStyle = 'rgba(0,0,0,.45)';
        g.fill();
        g.drawImage(texC, mx, my, M, M);
        const k = M / TS;
        const pcx = mx + cx * k;
        const pcy = my + cy * k;
        const far = 220;
        const half = (LW / 2 / focal) * far;
        g.fillStyle = 'rgba(255,240,120,.35)';
        g.beginPath();
        g.moveTo(pcx, pcy);
        g.lineTo(pcx + (fx * far - rx * half) * k, pcy + (fy * far - ry * half) * k);
        g.lineTo(pcx + (fx * far + rx * half) * k, pcy + (fy * far + ry * half) * k);
        g.closePath();
        g.save();
        g.clip();
        g.fillRect(mx, my, M, M);
        g.restore();
        g.fillStyle = '#ff4f5e';
        g.beginPath();
        g.arc(pcx, pcy, 2.2, 0, TAU);
        g.fill();
        txt(g, '평면 지도', mx + M / 2, my + M + 7, 6.5, '#fff');
      }
      pill(g, `줄마다 거리 z = 높이 × 초점 ÷ 줄 번호 → 지도를 늘려 찍음 (${LW}×${LH})`, 104, 12, 7, 'rgba(0,30,70,.5)', '#fff');
      g.restore();
    },
  };
}

/* ═════════ i306 광선 투사 미로 ═════════ */
function mkI306() {
  const MAP = [
    '1111222211114441',
    '1..............1',
    '1..............1',
    '1..222...3.....2',
    '1..2.....3.....2',
    '1..2..4..3.4...2',
    '3..............1',
    '3..............1',
    '3..............1',
    '1..33.....222..1',
    '1...3.....2....4',
    '1...3.4...2..3.4',
    '1.........2....4',
    '1..............1',
    '1..............1',
    '1111333311112221',
  ].map((r) => r.split('').map((c) => (c === '.' ? 0 : +c)));
  const MW = 16;
  const T = 32;
  const texs: Uint32Array[] = [];
  const mkTex = (fn: (x: number, y: number) => V3): Uint32Array => {
    const a = new Uint32Array(T * T);
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const c = fn(x, y);
        a[y * T + x] = pack(c[0], c[1], c[2]);
      }
    return a;
  };
  texs[1] = mkTex((x, y) => {
    const row = Math.floor(y / 8);
    const bx = (x + (row % 2) * 8) % 16;
    const mortar = y % 8 === 0 || bx === 0;
    const n = hash2(x >> 1, y >> 1, 1) * 30;
    return mortar ? [235, 215, 200] : [222 - n, 112 - n * 0.5, 92 - n * 0.5];
  });
  texs[2] = mkTex((x, y) => {
    const n = vnoise(x * 0.25, y * 0.25, 4) * 40;
    const edge = x % 16 === 0 || y % 16 === 0;
    const moss = vnoise(x * 0.2, y * 0.3, 9) > 0.62 && y > 14;
    if (edge) return [70, 90, 130];
    return moss ? [110, 180, 110] : [140 + n, 168 + n, 210 + n * 0.5];
  });
  texs[3] = mkTex((x, y) => {
    const plank = x % 8 === 0;
    const n = vnoise(x * 0.6, y * 0.08, 2) * 40;
    if (plank) return [120, 70, 40];
    if ((y === 6 || y === 25) && x % 8 === 4) return [90, 60, 40];
    return [214 - n, 160 - n * 0.7, 102 - n * 0.5];
  });
  texs[4] = mkTex((x, y) => {
    const fx = (x % 16) - 8;
    const fy = (y % 16) - 8;
    const d = Math.hypot(fx, fy);
    if (d < 2) return [255, 220, 90];
    const a = Math.atan2(fy, fx);
    if (d < 5 + Math.cos(a * 5) * 1.5) return [255, 140, 180];
    return [150, 225, 190];
  });
  const path: [number, number][] = [
    [2, 2],
    [13.3, 2],
    [13.3, 7.5],
    [7.5, 7.5],
    [7.5, 13.3],
    [2, 13.3],
  ];
  const lens: number[] = [];
  let totalLen = 0;
  for (let i = 0; i < path.length; i++) {
    const a = path[i]!;
    const b = path[(i + 1) % path.length]!;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    lens.push(l);
    totalLen += l;
  }
  const at = (s: number): [number, number] => {
    s = ((s % totalLen) + totalLen) % totalLen;
    for (let i = 0; i < path.length; i++) {
      if (s <= lens[i]!) {
        const a = path[i]!;
        const b = path[(i + 1) % path.length]!;
        const k = s / lens[i]!;
        return [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
      }
      s -= lens[i]!;
    }
    return path[0]!;
  };
  const LW = 160;
  let LH = 100;
  let lr = mkCanvas(LW, LH);
  let lx = c2(lr);
  let im: ImageData | null = null;
  let buf: Uint32Array | null = null;
  let mini = true;
  let fishFix = true;
  let fov = 66;
  let s = 0;
  const hits = new Float32Array(LW * 2);
  const controls: Control[] = [
    { type: 'toggle', label: '미니 지도', value: mini, on: (v) => (mini = v) },
    { type: 'toggle', label: '어안 보정 (수직 거리)', value: fishFix, on: (v) => (fishFix = v) },
    { type: 'range', label: '시야각 (도)', min: 40, max: 110, step: 1, value: fov, on: (v) => (fov = v) },
  ];
  const FOG: V3 = [26, 22, 48];
  return {
    controls,
    draw(g: G, w: number, h: number, _t: number, dt: number) {
      reset(g);
      const want = clamp(Math.round((LW * h) / w), 60, 150);
      if (want !== LH || !im) {
        LH = want;
        lr = mkCanvas(LW, LH);
        lx = c2(lr);
        im = lx.createImageData(LW, LH);
        buf = new Uint32Array(im.data.buffer);
      }
      const b = buf!;
      s += dt * 1.6;
      const pos = at(s);
      const ahead = at(s + 1.1);
      const ang = Math.atan2(ahead[1] - pos[1], ahead[0] - pos[0]);
      const px = pos[0];
      const py = pos[1];
      const dirX = Math.cos(ang);
      const dirY = Math.sin(ang);
      const pl = Math.tan(((fov / 2) * Math.PI) / 180);
      const plX = -dirY * pl;
      const plY = dirX * pl;
      const H2 = LH / 2;
      // 천장 · 바닥
      for (let y = 0; y < LH; y++) {
        if (y < H2) {
          const k = y / H2;
          const c = pack(lerp(40, 70, k), lerp(30, 60, k), lerp(70, 110, k));
          b.fill(c, y * LW, y * LW + LW);
        } else {
          const p = y - H2 + 0.5;
          const rowD = (0.5 * LH) / p;
          const r0x = dirX - plX;
          const r0y = dirY - plY;
          let fxw = px + rowD * r0x;
          let fyw = py + rowD * r0y;
          const sx = (rowD * 2 * plX) / LW;
          const sy = (rowD * 2 * plY) / LW;
          const fog = clamp01(rowD / 10);
          for (let x = 0; x < LW; x++) {
            const cx = Math.floor(fxw);
            const cy = Math.floor(fyw);
            const fx2 = fxw - cx;
            const fy2 = fyw - cy;
            const chk = (cx + cy) & 1;
            let c: V3 = chk ? [236, 196, 150] : [214, 168, 124];
            if (fx2 < 0.05 || fy2 < 0.05) c = [180, 136, 100];
            b[y * LW + x] = pack(lerp(c[0], FOG[0], fog), lerp(c[1], FOG[1], fog), lerp(c[2], FOG[2], fog));
            fxw += sx;
            fyw += sy;
          }
        }
      }
      for (let x = 0; x < LW; x++) {
        const camX = (2 * x) / LW - 1;
        const rdx = dirX + plX * camX;
        const rdy = dirY + plY * camX;
        let mx = Math.floor(px);
        let my = Math.floor(py);
        const ddx = Math.abs(1 / rdx);
        const ddy = Math.abs(1 / rdy);
        let stx: number;
        let sty: number;
        let sdx: number;
        let sdy: number;
        if (rdx < 0) {
          stx = -1;
          sdx = (px - mx) * ddx;
        } else {
          stx = 1;
          sdx = (mx + 1 - px) * ddx;
        }
        if (rdy < 0) {
          sty = -1;
          sdy = (py - my) * ddy;
        } else {
          sty = 1;
          sdy = (my + 1 - py) * ddy;
        }
        let side = 0;
        let cell = 0;
        for (let k = 0; k < 64; k++) {
          if (sdx < sdy) {
            sdx += ddx;
            mx += stx;
            side = 0;
          } else {
            sdy += ddy;
            my += sty;
            side = 1;
          }
          cell = MAP[my]?.[mx] ?? 1;
          if (cell) break;
        }
        const perp = side === 0 ? sdx - ddx : sdy - ddy;
        const dist = fishFix ? perp : perp * Math.hypot(rdx, rdy);
        hits[x * 2] = px + rdx * perp;
        hits[x * 2 + 1] = py + rdy * perp;
        const lineH = LH / Math.max(0.05, dist);
        const y0 = Math.floor(H2 - lineH / 2);
        const y1 = Math.floor(H2 + lineH / 2);
        let wallX = side === 0 ? py + perp * rdy : px + perp * rdx;
        wallX -= Math.floor(wallX);
        let tx = Math.floor(wallX * T);
        if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) tx = T - 1 - tx;
        const tex = texs[cell] ?? texs[1]!;
        const shade = side ? 0.72 : 1;
        const fog = clamp01(dist / 11);
        for (let y = Math.max(0, y0); y < Math.min(LH, y1); y++) {
          const ty = Math.floor(((y - y0) / (y1 - y0)) * T) & (T - 1);
          const c = tex[ty * T + tx]!;
          const R0 = (c & 255) * shade;
          const G0 = ((c >> 8) & 255) * shade;
          const B0 = ((c >> 16) & 255) * shade;
          b[y * LW + x] = pack(lerp(R0, FOG[0], fog), lerp(G0, FOG[1], fog), lerp(B0, FOG[2], fog));
        }
      }
      lx.putImageData(im!, 0, 0);
      g.imageSmoothingEnabled = false;
      g.drawImage(lr, 0, 0, w, h);
      g.imageSmoothingEnabled = true;
      const f = frame(g, w, h);
      // 비네트
      const vg = g.createRadialGradient(140, 88, 60, 140, 88, 190);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,.45)');
      g.fillStyle = vg;
      g.fillRect(f.L, f.T, f.R - f.L, f.B - f.T);
      if (mini) {
        const cs = 4;
        const ox = 6;
        const oy = 6;
        rr(g, ox - 2, oy - 2, MW * cs + 4, MW * cs + 4, 3);
        g.fillStyle = 'rgba(10,8,25,.75)';
        g.fill();
        const MC = ['', '#e07a5f', '#8fa9d8', '#d4a373', '#86e0b3'];
        for (let y = 0; y < MW; y++)
          for (let x = 0; x < MW; x++) {
            const c = MAP[y]![x]!;
            if (c) {
              g.fillStyle = MC[c]!;
              g.fillRect(ox + x * cs, oy + y * cs, cs, cs);
            }
          }
        g.fillStyle = 'rgba(255,240,120,.35)';
        g.beginPath();
        g.moveTo(ox + px * cs, oy + py * cs);
        for (let x = 0; x < LW; x += 4) g.lineTo(ox + hits[x * 2]! * cs, oy + hits[x * 2 + 1]! * cs);
        g.lineTo(ox + hits[(LW - 1) * 2]! * cs, oy + hits[(LW - 1) * 2 + 1]! * cs);
        g.closePath();
        g.fill();
        g.fillStyle = '#ff4f6e';
        g.beginPath();
        g.arc(ox + px * cs, oy + py * cs, 2, 0, TAU);
        g.fill();
      }
      pill(g, fishFix ? `세로줄 ${LW}개 = 광선 ${LW}개 · 벽 높이 ∝ 1/거리` : '어안 보정 끔 → 벽이 둥글게 휨', 186, 12, 7, 'rgba(0,0,0,.5)', '#fff');
      g.restore();
    },
  };
}

/* ═════════ i307 의사 3D 도로 (아웃런) ═════════ */
function mkI307() {
  interface Seg {
    curve: number;
    y: number;
    i: number;
    tree: number;
    sign: number;
  }
  const SEGL = 200;
  const ROADW = 2000;
  const CAMH = 1000;
  const DEPTH = 1 / Math.tan((50 * Math.PI) / 180);
  const DRAW = 140;
  let segs: Seg[] = [];
  let hills = true;
  let curveK = 1;
  let spd = 1;
  const build = (): void => {
    segs = [];
    const secs: [number, number, number][] = [
      [60, 0, 0],
      [80, 3, 20],
      [50, 0, -20],
      [90, -4, 0],
      [40, 0, 30],
      [70, 2.5, -30],
      [60, -2, 10],
      [50, 0, -10],
      [70, 4, 0],
    ];
    let lastY = 0;
    const r = rng(3);
    for (const [len, curve, hill] of secs) {
      const y0 = lastY;
      const y1 = lastY + (hills ? hill * SEGL * 0.4 : 0);
      for (let n = 0; n < len; n++) {
        const k = n / len;
        const ease = k < 0.25 ? smooth(k / 0.25) : k > 0.75 ? smooth((1 - k) / 0.25) : 1;
        const y = y0 + (y1 - y0) * (0.5 - Math.cos(Math.PI * k) / 2);
        const i = segs.length;
        segs.push({ curve: curve * ease, y, i, tree: i % 7 === 0 ? (r() < 0.5 ? -1 : 1) * (1.6 + r() * 1.2) : 0, sign: curve !== 0 && ease > 0.9 && i % 9 === 0 ? (curve > 0 ? -1 : 1) : 0 });
      }
      lastY = y1;
    }
    // 끝을 처음 높이로
    const N = segs.length;
    const endY = segs[N - 1]!.y;
    for (let i = 0; i < N; i++) segs[i]!.y -= (endY * i) / N;
  };
  build();
  let pos = 0;
  let skyOff = 0;
  const controls: Control[] = [
    { type: 'range', label: '커브 세기', min: 0, max: 2, step: 0.1, value: curveK, on: (v) => (curveK = v) },
    {
      type: 'toggle',
      label: '언덕',
      value: hills,
      on: (v) => {
        hills = v;
        build();
      },
    },
    { type: 'range', label: '속도', min: 0, max: 2, step: 0.1, value: spd, on: (v) => (spd = v) },
  ];
  interface Pj {
    x1: number;
    y1: number;
    w1: number;
    x2: number;
    y2: number;
    w2: number;
    s1: number;
    clip: number;
    seg: Seg;
    fog: number;
  }
  const pj: Pj[] = [];
  const tree = (g: G, x: number, yb: number, s: number): void => {
    g.fillStyle = '#7a4a2a';
    g.fillRect(x - s * 0.08, yb - s * 0.45, s * 0.16, s * 0.45);
    g.fillStyle = '#2f9e44';
    g.beginPath();
    g.arc(x, yb - s * 0.62, s * 0.32, 0, TAU);
    g.arc(x - s * 0.22, yb - s * 0.5, s * 0.22, 0, TAU);
    g.arc(x + s * 0.22, yb - s * 0.5, s * 0.22, 0, TAU);
    g.fill();
    g.fillStyle = '#69d36e';
    g.beginPath();
    g.arc(x - s * 0.08, yb - s * 0.72, s * 0.14, 0, TAU);
    g.fill();
  };
  const mix = (a: V3, b: V3, k: number): string => rgba(mix3(a, b, k));
  const HAZE: V3 = [200, 225, 255];
  return {
    controls,
    draw(g: G, w: number, h: number, _t: number, dt: number) {
      reset(g);
      const N = segs.length;
      const total = N * SEGL;
      const speed = 5200 * spd;
      pos = (pos + speed * dt) % total;
      const baseI = Math.floor(pos / SEGL) % N;
      const base = segs[baseI]!;
      const basePct = (pos % SEGL) / SEGL;
      const playerZ = CAMH * DEPTH;
      const pI = Math.floor((pos + playerZ) / SEGL) % N;
      const pSeg = segs[pI]!;
      const pNext = segs[(pI + 1) % N]!;
      const pPct = ((pos + playerZ) % SEGL) / SEGL;
      const playerY = lerp(pSeg.y, pNext.y, pPct);
      const camY = CAMH + playerY;
      skyOff += pSeg.curve * curveK * spd * dt * 0.02;
      // 하늘
      const sg = g.createLinearGradient(0, 0, 0, h * 0.6);
      sg.addColorStop(0, '#4aa3ff');
      sg.addColorStop(1, '#d6ecff');
      g.fillStyle = sg;
      g.fillRect(0, 0, w, h);
      const sunX = w * 0.7 - skyOff * w * 0.3;
      const sx = ((sunX % (w * 1.4)) + w * 1.4) % (w * 1.4) - w * 0.2;
      g.fillStyle = 'rgba(255,250,210,.9)';
      g.beginPath();
      g.arc(sx, h * 0.18, h * 0.07, 0, TAU);
      g.fill();
      const hills2 = (k: number, col: string, amp: number, yb: number): void => {
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(0, h);
        for (let x = 0; x <= w + 8; x += 8) {
          const q = (x / w + skyOff * k) * TAU;
          g.lineTo(x, h * yb - (Math.sin(q * 1.5) * 0.5 + Math.sin(q * 3.7 + 1) * 0.3 + 0.8) * h * amp);
        }
        g.lineTo(w, h);
        g.fill();
      };
      hills2(0.3, '#a9c6ea', 0.12, 0.55);
      hills2(0.6, '#7cc47a', 0.07, 0.58);
      // 투영
      pj.length = 0;
      let x = 0;
      let dx = -(base.curve * curveK * basePct);
      let maxy = h;
      for (let n = 0; n < DRAW; n++) {
        const seg = segs[(baseI + n) % N]!;
        const nxt = segs[(baseI + n + 1) % N]!;
        const looped = seg.i < baseI;
        const z1 = seg.i * SEGL + (looped ? total : 0) - pos;
        const z2 = z1 + SEGL;
        const s1 = DEPTH / Math.max(1e-3, z1);
        const s2 = DEPTH / Math.max(1e-3, z2);
        const p: Pj = {
          x1: w / 2 + s1 * x * (w / 2),
          y1: h / 2 - s1 * (seg.y - camY) * (h / 2),
          w1: s1 * ROADW * (w / 2),
          x2: w / 2 + s2 * (x + dx) * (w / 2),
          y2: h / 2 - s2 * (nxt.y - camY) * (h / 2),
          w2: s2 * ROADW * (w / 2),
          s1,
          clip: maxy,
          seg,
          fog: clamp01(n / DRAW) ** 1.5,
        };
        x += dx;
        dx += seg.curve * curveK;
        pj.push(p);
        if (z1 <= DEPTH || p.y2 >= p.y1 || p.y2 >= maxy) {
          p.w1 = -1;
          continue;
        }
        const alt = Math.floor(seg.i / 3) % 2;
        g.fillStyle = mix(alt ? [126, 217, 87] : [96, 190, 64], HAZE, p.fog);
        g.fillRect(0, p.y2, w, p.y1 - p.y2 + 1);
        const quad = (xa: number, ya: number, wa: number, xb: number, yb: number, wb: number, col: string): void => {
          g.fillStyle = col;
          g.beginPath();
          g.moveTo(xa - wa, ya);
          g.lineTo(xa + wa, ya);
          g.lineTo(xb + wb, yb);
          g.lineTo(xb - wb, yb);
          g.closePath();
          g.fill();
        };
        const r1 = p.w1 * 1.15;
        const r2 = p.w2 * 1.15;
        quad(p.x1, p.y1 + 0.5, r1, p.x2, p.y2, r2, mix(alt ? [255, 90, 95] : [255, 255, 255], HAZE, p.fog));
        quad(p.x1, p.y1 + 0.5, p.w1, p.x2, p.y2, p.w2, mix(alt ? [110, 114, 130] : [102, 106, 122], HAZE, p.fog));
        if (alt) {
          const l1 = p.w1 * 0.03;
          const l2 = p.w2 * 0.03;
          for (const off of [-1 / 3, 1 / 3]) quad(p.x1 + p.w1 * off * 2, p.y1, l1, p.x2 + p.w2 * off * 2, p.y2, l2, mix([255, 255, 240], HAZE, p.fog));
        }
        maxy = p.y2;
      }
      // 나무 · 표지 (먼 것부터)
      for (let n = pj.length - 1; n >= 0; n--) {
        const p = pj[n]!;
        const seg = p.seg;
        if ((!seg.tree && !seg.sign) || p.s1 <= 0) continue;
        const z1 = DEPTH / p.s1;
        if (z1 <= DEPTH) continue;
        g.save();
        g.beginPath();
        g.rect(0, 0, w, p.clip);
        g.clip();
        g.globalAlpha = 1 - p.fog * 0.7;
        if (seg.tree) {
          const tx = p.x1 + p.s1 * seg.tree * ROADW * (w / 2);
          tree(g, tx, p.y1, p.s1 * 2600 * (w / 2));
        }
        if (seg.sign) {
          const sx2 = p.x1 + p.s1 * seg.sign * 1.35 * ROADW * (w / 2);
          const ss = p.s1 * 700 * (w / 2);
          g.fillStyle = '#555';
          g.fillRect(sx2 - ss * 0.05, p.y1 - ss * 0.9, ss * 0.1, ss * 0.9);
          g.fillStyle = '#ffd43c';
          g.fillRect(sx2 - ss * 0.5, p.y1 - ss * 1.4, ss, ss * 0.6);
          g.fillStyle = '#d6303a';
          const dir = -seg.sign;
          g.beginPath();
          g.moveTo(sx2 - ss * 0.25 * dir, p.y1 - ss * 1.3);
          g.lineTo(sx2 + ss * 0.25 * dir, p.y1 - ss * 1.1);
          g.lineTo(sx2 - ss * 0.25 * dir, p.y1 - ss * 0.9);
          g.lineTo(sx2 - ss * 0.08 * dir, p.y1 - ss * 1.1);
          g.closePath();
          g.fill();
        }
        g.restore();
      }
      g.globalAlpha = 1;
      // 차
      const f = frame(g, w, h);
      const steer = clamp(-pSeg.curve * curveK * 0.15, -0.2, 0.2);
      const cx = 140;
      const cy = f.B - 22 + Math.sin(_t * 30) * 0.4 * spd;
      g.save();
      g.translate(cx, cy);
      g.rotate(steer * 0.4);
      g.fillStyle = 'rgba(0,0,0,.3)';
      g.beginPath();
      g.ellipse(0, 12, 36, 6, 0, 0, TAU);
      g.fill();
      g.fillStyle = '#20202c';
      rr(g, -34, 0, 14, 12, 3);
      g.fill();
      rr(g, 20, 0, 14, 12, 3);
      g.fill();
      rr(g, -32, -12, 64, 20, 8);
      const cg = g.createLinearGradient(0, -12, 0, 8);
      cg.addColorStop(0, '#ff6b78');
      cg.addColorStop(1, '#c81e3a');
      g.fillStyle = cg;
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = '#5a0f1a';
      g.stroke();
      rr(g, -20, -26, 40, 16, 7);
      g.fillStyle = '#ff6b78';
      g.fill();
      g.stroke();
      rr(g, -16, -23, 32, 10, 4);
      g.fillStyle = '#9fdcff';
      g.fill();
      g.fillStyle = '#ffe680';
      g.fillRect(-28, -6, 9, 4);
      g.fillRect(19, -6, 9, 4);
      g.fillStyle = '#ffffff';
      g.fillRect(-4, -12, 8, 20);
      g.restore();
      pill(g, '줄마다 커브를 누적 → 굽이 · 높이를 투영 → 언덕', 140, 12, 7.5, 'rgba(0,40,90,.45)', '#fff');
      g.restore();
    },
  };
}

/* ═════════ i308 스프라이트 쌓기 ═════════ */
function mkI308() {
  type Slice = HTMLCanvasElement;
  const mkModel = (W: number, H: number, L: number, fn: (x: number, y: number, l: number) => string | null): Slice[] => {
    const out: Slice[] = [];
    for (let l = 0; l < L; l++) {
      const c = mkCanvas(W, H);
      const x = c2(c);
      const im = x.createImageData(W, H);
      const dk = 0.72 + 0.28 * (l / Math.max(1, L - 1));
      for (let yy = 0; yy < H; yy++)
        for (let xx = 0; xx < W; xx++) {
          const col = fn(xx, yy, l);
          if (!col) continue;
          const v = hexRgb(col);
          const i = (yy * W + xx) * 4;
          im.data[i] = v[0] * dk;
          im.data[i + 1] = v[1] * dk;
          im.data[i + 2] = v[2] * dk;
          im.data[i + 3] = 255;
        }
      x.putImageData(im, 0, 0);
      out.push(c);
    }
    return out;
  };
  const car = mkModel(12, 20, 10, (x, y, l) => {
    const wheel = (x <= 1 || x >= 10) && ((y >= 3 && y <= 6) || (y >= 13 && y <= 16));
    if (l <= 1) return wheel ? '#2a2a33' : x >= 2 && x <= 9 && y >= 1 && y <= 18 ? '#3a3a44' : null;
    if (l <= 4) {
      if (x < 1 || x > 10 || y < 0 || y > 19) return null;
      if (l === 3 && y === 0 && (x === 2 || x === 9)) return '#fff3a0';
      if (l === 3 && y === 19 && (x === 2 || x === 9)) return '#ff3048';
      if (l === 4 && (x === 5 || x === 6)) return '#ffffff';
      return '#ff4b5c';
    }
    if (l <= 7) {
      if (x < 2 || x > 9 || y < 6 || y > 14) return null;
      if (l === 7) return x === 5 || x === 6 ? '#ffffff' : '#ff6b78';
      const edge = x === 2 || x === 9 || y === 6 || y === 14;
      const pillar = (x === 2 || x === 9) && (y === 6 || y === 14 || y === 10);
      if (!edge) return '#ff4b5c';
      return pillar ? '#e0304a' : '#9fe4ff';
    }
    return null;
  });
  const house = mkModel(16, 16, 15, (x, y, l) => {
    if (l < 8) {
      if (x < 1 || x > 14 || y < 1 || y > 14) return null;
      const edge = x === 1 || x === 14 || y === 1 || y === 14;
      if (!edge) return '#fff1d6';
      if (y === 14 && x >= 6 && x <= 9 && l < 5) return '#8a5a3a';
      if (l >= 3 && l <= 5 && ((y === 14 || y === 1) && (x === 3 || x === 4 || x === 11 || x === 12))) return '#7fd0ff';
      if (l >= 3 && l <= 5 && ((x === 1 || x === 14) && (y === 5 || y === 6 || y === 10))) return '#7fd0ff';
      return l === 0 ? '#c9b48e' : '#ffe9c2';
    }
    const k = l - 8;
    if (x >= 11 && x <= 12 && y >= 3 && y <= 4 && l <= 14) return l === 14 ? '#555' : '#b0563a';
    if (y < k || y > 15 - k) return null;
    if (x < 0 || x > 15) return null;
    const ridge = y === k || y === 15 - k;
    return ridge ? '#c2410c' : (x + l) % 2 ? '#f97316' : '#fb923c';
  });
  const tr = mkModel(16, 16, 15, (x, y, l) => {
    const dx = x - 7.5;
    const dy = y - 7.5;
    const d = Math.hypot(dx, dy);
    if (l < 5) return d < 1.6 ? '#8a5a3a' : null;
    const k = (l - 4) / 10;
    const rad = 7.5 * Math.sin(Math.PI * Math.min(1, k * 0.95 + 0.05));
    if (d > rad) return null;
    if (d > rad - 1 && hash2(x, y, l) > 0.85) return '#ff4d5e';
    return hash2(x, y, l + 5) > 0.55 ? '#3fbf5a' : '#5ed36f';
  });
  let explode = false;
  let spd = 1;
  let ang = 0;
  let exK = 0;
  const controls: Control[] = [
    { type: 'toggle', label: '층 펼쳐 보기', value: explode, on: (v) => (explode = v) },
    { type: 'range', label: '회전 속도', min: 0, max: 3, step: 0.1, value: spd, on: (v) => (spd = v) },
  ];
  const drawStack = (g: G, sl: Slice[], x: number, y: number, s: number, a: number, gap: number): void => {
    g.fillStyle = 'rgba(0,0,0,.28)';
    g.beginPath();
    g.ellipse(x, y + 2, sl[0]!.width * s * 0.7, sl[0]!.width * s * 0.32, 0, 0, TAU);
    g.fill();
    for (let l = 0; l < sl.length; l++) {
      const c = sl[l]!;
      for (let k = 0; k < 2; k++) {
        g.save();
        g.translate(x, y - (l + k * 0.5) * s * gap);
        g.scale(1, 0.62);
        g.rotate(a);
        g.drawImage(c, (-c.width * s) / 2, (-c.height * s) / 2, c.width * s, c.height * s);
        g.restore();
        if (gap > 1.6) break;
      }
    }
  };
  return {
    controls,
    draw(g: G, w: number, h: number, t: number, dt: number) {
      reset(g);
      const f = frame(g, w, h);
      vbg(g, f, '#22305a', '#121a35');
      g.fillStyle = '#2e3f72';
      g.beginPath();
      g.ellipse(140, 130, 170, 40, 0, 0, TAU);
      g.fill();
      ang += dt * 0.9 * spd;
      const auto = (Math.sin(t * 0.8) * 0.5 + 0.5) > 0.82;
      exK = lerp(exK, explode || auto ? 1 : 0, Math.min(1, dt * 5));
      const gap = 1 + exK * 2.2;
      g.imageSmoothingEnabled = false;
      drawStack(g, car, 52, 128, 3, ang, gap);
      drawStack(g, house, 140, 132, 3.4, -ang * 0.7 + 0.5, gap);
      drawStack(g, tr, 228, 130, 3, ang * 0.5, gap);
      g.imageSmoothingEnabled = true;
      // 단면 띠
      const strip = (sl: Slice[], x0: number): void => {
        const n = sl.length;
        const cw = 7;
        for (let l = 0; l < n; l++) {
          g.imageSmoothingEnabled = false;
          g.drawImage(sl[l]!, x0 + l * (cw + 1), 156, cw, cw * (sl[l]!.height / sl[l]!.width));
          g.imageSmoothingEnabled = true;
        }
      };
      strip(car, 6);
      strip(house, 92);
      strip(tr, 166);
      pill(g, `가로 단면 그림을 층마다 위로 ${exK > 0.5 ? '(펼침)' : ''} 쌓고 돌림`, 140, 13, 8, 'rgba(255,255,255,.1)', '#eef');
      g.restore();
    },
  };
}

/* ═════════ i309 2.5D 시차 무대 ═════════ */
function mkI309() {
  let par = true;
  let depth = 1;
  let fx = true;
  let built = '';
  interface Lay {
    plain: HTMLCanvasElement;
    fx: HTMLCanvasElement;
    k: number;
  }
  let lays: Lay[] = [];
  const build = (W: number, H: number): void => {
    const per = (x: number, n: number, ph: number): number => Math.sin((x / W) * TAU * n + ph);
    const mk = (fn: (g: G, isFx: boolean) => void): { plain: HTMLCanvasElement; fx: HTMLCanvasElement } => {
      const a = mkCanvas(W, H);
      const b = mkCanvas(W, H);
      fn(c2(a), false);
      fn(c2(b), true);
      return { plain: a, fx: b };
    };
    const rnd = rng(5);
    const mtnSeed = [rnd() * 6, rnd() * 6, rnd() * 6];
    const far = mk((g, isFx) => {
      g.fillStyle = '#8f8fd8';
      g.beginPath();
      g.moveTo(0, H);
      for (let x = 0; x <= W; x += 3) g.lineTo(x, H * 0.48 - (per(x, 3, mtnSeed[0]!) * 0.5 + per(x, 7, mtnSeed[1]!) * 0.25 + per(x, 13, 1) * 0.08 + 0.4) * H * 0.18);
      g.lineTo(W, H);
      g.fill();
      if (isFx) {
        const gr = g.createLinearGradient(0, H * 0.3, 0, H * 0.7);
        gr.addColorStop(0, 'rgba(255,220,235,.55)');
        gr.addColorStop(1, 'rgba(255,220,235,.75)');
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = gr;
        g.fillRect(0, 0, W, H);
      }
    });
    const hill = mk((g, isFx) => {
      g.fillStyle = '#5fae8a';
      g.beginPath();
      g.moveTo(0, H);
      const hy = (x: number): number => H * 0.62 - (per(x, 2, 2) * 0.5 + per(x, 5, 1) * 0.3 + 0.5) * H * 0.1;
      for (let x = 0; x <= W; x += 3) g.lineTo(x, hy(x));
      g.lineTo(W, H);
      g.fill();
      const n = Math.max(6, Math.round(W / 40));
      for (let i = 0; i < n; i++) {
        const x = (i / n) * W + ((i * 37) % 17);
        const y = hy(x) + 4;
        const s = H * 0.035;
        for (const xx of [x, x - W, x + W]) {
          g.fillStyle = '#3f8f6a';
          g.beginPath();
          g.arc(xx, y - s, s, 0, TAU);
          g.fill();
        }
      }
      if (isFx) {
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = 'rgba(255,225,235,.32)';
        g.fillRect(0, 0, W, H);
      }
    });
    const mid = mk((g) => {
      const gy = H * 0.74;
      g.fillStyle = '#86d36a';
      g.fillRect(0, gy, W, H - gy);
      g.fillStyle = '#e8c98e';
      g.beginPath();
      g.moveTo(0, gy + H * 0.05);
      for (let x = 0; x <= W; x += 6) g.lineTo(x, gy + H * 0.05 + per(x, 3, 0) * H * 0.012);
      for (let x = W; x >= 0; x -= 6) g.lineTo(x, gy + H * 0.1 + per(x, 3, 0) * H * 0.012);
      g.fill();
      const n = Math.max(3, Math.round(W / 140));
      for (let i = 0; i < n; i++) {
        const x = ((i + 0.3) / n) * W;
        const s = H * 0.12;
        // 작은 집
        g.fillStyle = '#fff1d6';
        g.fillRect(x - s * 0.5, gy - s * 0.7, s, s * 0.7);
        g.fillStyle = i % 2 ? '#ff7a59' : '#5b8cff';
        g.beginPath();
        g.moveTo(x - s * 0.62, gy - s * 0.68);
        g.lineTo(x, gy - s * 1.15);
        g.lineTo(x + s * 0.62, gy - s * 0.68);
        g.fill();
        g.fillStyle = '#7fd0ff';
        g.fillRect(x - s * 0.3, gy - s * 0.5, s * 0.2, s * 0.18);
        g.fillStyle = '#8a5a3a';
        g.fillRect(x + s * 0.08, gy - s * 0.38, s * 0.2, s * 0.38);
        // 울타리
        g.fillStyle = '#fff';
        for (let k = 0; k < 6; k++) g.fillRect(x + s * 0.8 + k * s * 0.18, gy - s * 0.22, s * 0.06, s * 0.22);
        g.fillRect(x + s * 0.78, gy - s * 0.16, s * 1.05, s * 0.04);
      }
    });
    const near = mk((g) => {
      const gy = H * 0.9;
      g.fillStyle = '#4f9d3f';
      g.beginPath();
      g.moveTo(0, H);
      for (let x = 0; x <= W; x += 4) g.lineTo(x, gy + per(x, 6, 1) * H * 0.012);
      g.lineTo(W, H);
      g.fill();
      const n = Math.round(W / 10);
      for (let i = 0; i < n; i++) {
        const x = (i / n) * W;
        const hh = H * (0.03 + hash2(i, 1, 2) * 0.04);
        g.strokeStyle = '#3d8a33';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x, gy + 4);
        g.quadraticCurveTo(x + 2, gy - hh * 0.5, x + 4, gy - hh);
        g.stroke();
        if (i % 5 === 0) {
          g.fillStyle = ['#ffe14d', '#ff8fb8', '#ffffff'][i % 3]!;
          g.beginPath();
          g.arc(x + 4, gy - hh, H * 0.012, 0, TAU);
          g.fill();
        }
      }
    });
    const fore = mk((g, isFx) => {
      if (isFx) g.filter = `blur(${Math.max(2, H * 0.012)}px)`;
      const n = 3;
      for (let i = 0; i < n; i++) {
        const x = ((i + 0.15) / n) * W;
        g.fillStyle = '#1f4a2a';
        for (const xx of [x, x - W, x + W]) {
          for (let k = 0; k < 5; k++) {
            g.save();
            g.translate(xx + k * H * 0.04, H + H * 0.02);
            g.rotate(-0.9 + k * 0.4);
            g.beginPath();
            g.ellipse(0, -H * 0.16, H * 0.05, H * 0.17, 0, 0, TAU);
            g.fill();
            g.restore();
          }
        }
      }
    });
    lays = [
      { ...far, k: 0.12 },
      { ...hill, k: 0.3 },
      { ...mid, k: 0.6 },
      { ...near, k: 1.0 },
      { ...fore, k: 1.7 },
    ];
  };
  const controls: Control[] = [
    { type: 'toggle', label: '시차 (층마다 다른 속도)', value: par, on: (v) => (par = v) },
    { type: 'range', label: '깊이 차이', min: 0, max: 2, step: 0.1, value: depth, on: (v) => (depth = v) },
    { type: 'toggle', label: '안개 · 앞 흐림', value: fx, on: (v) => (fx = v) },
  ];
  return {
    controls,
    draw(g: G, w: number, h: number, t: number) {
      reset(g);
      const W = Math.max(64, Math.round(w));
      const H = Math.max(64, Math.round(h));
      const key = W + 'x' + H;
      if (key !== built) {
        build(W, H);
        built = key;
      }
      const sky = g.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#7db4ff');
      sky.addColorStop(0.55, '#ffd0e0');
      sky.addColorStop(1, '#ffe9c8');
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,250,220,.95)';
      g.beginPath();
      g.arc(w * 0.78, h * 0.2, h * 0.07, 0, TAU);
      g.fill();
      const cam = t * 0.09 * w + Math.sin(t * 0.6) * w * 0.05;
      for (let i = 0; i < 3; i++) {
        const cx = ((((i * w * 0.4 - cam * 0.05 * (par ? 1 : 12)) % (w * 1.3)) + w * 1.3) % (w * 1.3)) - w * 0.15;
        g.fillStyle = 'rgba(255,255,255,.85)';
        g.beginPath();
        g.ellipse(cx, h * (0.12 + i * 0.06), w * 0.06, h * 0.025, 0, 0, TAU);
        g.ellipse(cx + w * 0.03, h * (0.1 + i * 0.06), w * 0.04, h * 0.03, 0, 0, TAU);
        g.fill();
      }
      for (let i = 0; i < lays.length; i++) {
        const L = lays[i]!;
        const k = par ? 1 + (L.k - 1) * depth : 1;
        const off = ((((cam * k) % W) + W) % W) | 0;
        const img = fx ? L.fx : L.plain;
        g.drawImage(img, -off, 0, W, H);
        g.drawImage(img, W - off, 0, W, H);
        if (i === 2) {
          // 걷는 친구 (가운데 층과 함께)
          const b = buddy(96, 'pink');
          const s = h * 0.16;
          const hop = Math.abs(Math.sin(t * 7)) * h * 0.02;
          g.fillStyle = 'rgba(0,0,0,.2)';
          g.beginPath();
          g.ellipse(w * 0.42, h * 0.835, s * 0.3, s * 0.06, 0, 0, TAU);
          g.fill();
          g.drawImage(b, w * 0.42 - s / 2, h * 0.835 - s * 0.9 - hop, s, s);
        }
      }
      const f = frame(g, w, h);
      pill(g, par ? '먼 층 0.12 · 언덕 0.3 · 마을 0.6 · 풀 1 · 앞 잎 1.7 배 속도' : '시차 끔 → 한 장 그림처럼 납작', 140, 12, 7.5, 'rgba(60,40,90,.4)', '#fff');
      g.restore();
      void f;
    },
  };
}

/* ═════════ i310 등각 깊이 정렬 ═════════ */
function mkI310() {
  interface Obj {
    x: number;
    y: number;
    w: number;
    d: number;
    h: number;
    col: string;
    kind: string;
    name: string;
  }
  let auto = true;
  let topo = true;
  let nums = false;
  const controls: Control[] = [
    { type: 'toggle', label: '자동 비교 (3초마다)', value: auto, on: (v) => (auto = v) },
    { type: 'toggle', label: '위상 정렬 (자동 끌 때)', value: topo, on: (v) => (topo = v) },
    { type: 'toggle', label: '그리는 순서 번호', value: nums, on: (v) => (nums = v) },
  ];
  const TW = 30;
  const TH = 15;
  const HZ = 17;
  const OX = 140;
  const OY = 30;
  const sp = (x: number, y: number, z: number): [number, number] => [OX + ((x - y) * TW) / 2, OY + ((x + y) * TH) / 2 - z * HZ];
  const shadeC = (c: string, k: number): string => {
    const v = hexRgb(c);
    return rgba([v[0] * k, v[1] * k, v[2] * k]);
  };
  const poly = (g: G, pts: [number, number][], fill: string): void => {
    g.beginPath();
    g.moveTo(pts[0]![0], pts[0]![1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]![0], pts[i]![1]);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    g.strokeStyle = 'rgba(30,20,50,.55)';
    g.lineWidth = 0.7;
    g.stroke();
  };
  const box = (g: G, o: Obj, z0 = 0, hh = o.h, col = o.col): void => {
    const x0 = o.x;
    const y0 = o.y;
    const x1 = o.x + o.w;
    const y1 = o.y + o.d;
    const z1 = z0 + hh;
    poly(g, [sp(x0, y1, z0), sp(x1, y1, z0), sp(x1, y1, z1), sp(x0, y1, z1)], shadeC(col, 0.82));
    poly(g, [sp(x1, y0, z0), sp(x1, y1, z0), sp(x1, y1, z1), sp(x1, y0, z1)], shadeC(col, 0.64));
    poly(g, [sp(x0, y0, z1), sp(x1, y0, z1), sp(x1, y1, z1), sp(x0, y1, z1)], shadeC(col, 1.05));
  };
  const drawObj = (g: G, o: Obj): void => {
    if (o.kind === 'house') {
      box(g, o);
      // 창
      for (const k of [0.3, 0.7]) {
        const p = sp(o.x + o.w * k, o.y + o.d, o.h * 0.55);
        g.fillStyle = '#8fdcff';
        g.beginPath();
        g.moveTo(p[0] - 4, p[1] - 2);
        g.lineTo(p[0] + 4, p[1] - 2 + 0);
        g.lineTo(p[0] + 4, p[1] + 5);
        g.lineTo(p[0] - 4, p[1] + 5);
        g.fill();
      }
      const z = o.h;
      const a = sp(o.x, o.y, z);
      const b = sp(o.x + o.w, o.y, z);
      const c = sp(o.x + o.w, o.y + o.d, z);
      const d = sp(o.x, o.y + o.d, z);
      const top = sp(o.x + o.w / 2, o.y + o.d / 2, z + 1.1);
      poly(g, [a, b, top], '#ff8a5c');
      poly(g, [d, c, top], '#ff7a4a');
      poly(g, [b, c, top], '#d9552c');
    } else if (o.kind === 'tower') {
      box(g, o);
      for (let k = 1; k < 4; k++) {
        const p = sp(o.x + o.w, o.y + o.d, (o.h * k) / 4);
        const q = sp(o.x, o.y + o.d, (o.h * k) / 4);
        g.strokeStyle = 'rgba(255,255,255,.6)';
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(q[0], q[1]);
        g.lineTo(p[0], p[1]);
        g.stroke();
      }
      const t = sp(o.x + 0.5, o.y + 0.5, o.h);
      g.strokeStyle = '#444';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(t[0], t[1]);
      g.lineTo(t[0], t[1] - 16);
      g.stroke();
      g.fillStyle = '#ff4d6d';
      g.beginPath();
      g.moveTo(t[0], t[1] - 16);
      g.lineTo(t[0] + 9, t[1] - 13);
      g.lineTo(t[0], t[1] - 10);
      g.fill();
    } else if (o.kind === 'tree') {
      box(g, { ...o, x: o.x + 0.38, y: o.y + 0.38, w: 0.24, d: 0.24 }, 0, 0.7, '#8a5a3a');
      const c = sp(o.x + 0.5, o.y + 0.5, 1.25);
      g.fillStyle = '#3fae5a';
      g.strokeStyle = 'rgba(30,20,50,.55)';
      g.beginPath();
      g.arc(c[0], c[1], 13, 0, TAU);
      g.fill();
      g.stroke();
      g.fillStyle = '#7ee08a';
      g.beginPath();
      g.arc(c[0] - 4, c[1] - 4, 5, 0, TAU);
      g.fill();
    } else if (o.kind === 'bus') {
      box(g, o, 0.15, o.h - 0.15);
      for (let k = 0; k < 3; k++) {
        const p = sp(o.x + o.w, o.y + 0.3 + k * 0.55, o.h * 0.7);
        g.fillStyle = '#9fe4ff';
        g.beginPath();
        g.moveTo(p[0], p[1]);
        g.lineTo(p[0] + 6, p[1] - 3);
        g.lineTo(p[0] + 6, p[1] + 2);
        g.lineTo(p[0], p[1] + 5);
        g.fill();
      }
    } else box(g, o);
  };
  const statics: Obj[] = [
    { x: 1, y: 0, w: 2, d: 2, h: 1.2, col: '#fff1d6', kind: 'house', name: '집' },
    { x: 4, y: 0, w: 1, d: 1, h: 2.6, col: '#9aa7ff', kind: 'tower', name: '탑' },
    { x: 0, y: 4, w: 4, d: 1, h: 0.75, col: '#5fc96a', kind: 'hedge', name: '울타리' },
    { x: 5, y: 5, w: 1, d: 1, h: 1, col: '#3fae5a', kind: 'tree', name: '나무' },
    { x: 5, y: 3, w: 1, d: 1, h: 0.6, col: '#ffd84d', kind: 'crate', name: '상자' },
  ];
  const bus: Obj = { x: 0, y: 2, w: 1, d: 2, h: 1, col: '#ffcf3a', kind: 'bus', name: '버스' };
  const ov = (a0: number, a1: number, b0: number, b1: number): boolean => a0 < b1 - 1e-6 && b0 < a1 - 1e-6;
  const behind = (A: Obj, B: Obj): boolean => {
    const ax1 = A.x + A.w;
    const ay1 = A.y + A.d;
    if (ax1 <= B.x + 1e-6 && ov(A.y, ay1, B.y, B.y + B.d)) return true;
    if (ay1 <= B.y + 1e-6 && ov(A.x, ax1, B.x, B.x + B.w)) return true;
    return ax1 <= B.x + 1e-6 && ay1 <= B.y + 1e-6;
  };
  const topoSort = (os: Obj[]): Obj[] => {
    const out: Obj[] = [];
    const st = new Map<Obj, number>();
    const visit = (o: Obj): void => {
      if (st.get(o) === 2) return;
      if (st.get(o) === 1) return;
      st.set(o, 1);
      for (const p of os) if (p !== o && behind(p, o)) visit(p);
      st.set(o, 2);
      out.push(o);
    };
    for (const o of os) visit(o);
    return out;
  };
  return {
    controls,
    draw(g: G, w: number, h: number, t: number) {
      reset(g);
      const f = frame(g, w, h);
      vbg(g, f, '#2a2350', '#141030');
      const N = 7;
      // 바닥
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const road = y === 2 || y === 3;
          const col = road ? ((x + y) % 2 ? '#8b8fa8' : '#7f839c') : (x + y) % 2 ? '#9fe08a' : '#8fd47a';
          g.beginPath();
          const a = sp(x, y, 0);
          const b = sp(x + 1, y, 0);
          const c = sp(x + 1, y + 1, 0);
          const d = sp(x, y + 1, 0);
          g.moveTo(a[0], a[1]);
          g.lineTo(b[0], b[1]);
          g.lineTo(c[0], c[1]);
          g.lineTo(d[0], d[1]);
          g.closePath();
          g.fillStyle = col;
          g.fill();
        }
      const ph = (t * 0.22) % 2;
      bus.x = (ph < 1 ? smooth(ph) : smooth(2 - ph)) * 6;
      const all = [...statics, bus];
      const useTopo = auto ? Math.floor(t / 3) % 2 === 0 : topo;
      const naive = [...all].sort((a, b) => a.x + a.y - (b.x + b.y));
      const order = useTopo ? topoSort(all) : naive;
      // 틀린 곳 세기
      let bad = 0;
      const idx = new Map(naive.map((o, i) => [o, i] as [Obj, number]));
      for (const a of all)
        for (const b of all) if (a !== b && behind(a, b) && idx.get(a)! > idx.get(b)!) bad++;
      for (let i = 0; i < order.length; i++) {
        const o = order[i]!;
        drawObj(g, o);
        if (nums) {
          const p = sp(o.x + o.w / 2, o.y + o.d / 2, o.h + 0.3);
          g.fillStyle = '#1b1530';
          g.beginPath();
          g.arc(p[0], p[1], 6, 0, TAU);
          g.fill();
          txt(g, String(i + 1), p[0], p[1] + 0.5, 7, '#fff', 'center', 800);
        }
      }
      const okCol = useTopo ? '#8bffb0' : '#ff8a9a';
      pill(g, useTopo ? '위상 정렬: 「뒤에 있는 것 먼저」 규칙으로 줄 세움' : `칸 번호(x+y) 순서 → 잘못 겹친 쌍 ${bad}`, 140, 13, 8, 'rgba(0,0,0,.4)', okCol);
      g.restore();
    },
  };
}

/* ═════════ i311 2D 카드 뒤집기 ═════════ */
function mkI311() {
  const CW = 120;
  const CH = 168;
  const faceC = (n: string, col: string): HTMLCanvasElement => {
    const c = mkCanvas(CW, CH);
    const g = c2(c);
    rr(g, 3, 3, CW - 6, CH - 6, 14);
    g.fillStyle = '#fffaf0';
    g.fill();
    g.lineWidth = 5;
    g.strokeStyle = col;
    g.stroke();
    g.fillStyle = col;
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 9 : 20;
      g.lineTo(60 + Math.cos(a) * r, 120 + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    txt(g, n, 60, 62, 60, col, 'center', 900);
    txt(g, n, 18, 20, 16, col, 'center', 900);
    return c;
  };
  const back = mkCanvas(CW, CH);
  {
    const g = c2(back);
    rr(g, 3, 3, CW - 6, CH - 6, 14);
    const gr = g.createLinearGradient(0, 0, CW, CH);
    gr.addColorStop(0, '#7b5cff');
    gr.addColorStop(1, '#4a2fc0');
    g.fillStyle = gr;
    g.fill();
    g.save();
    g.clip();
    g.strokeStyle = 'rgba(255,255,255,.18)';
    g.lineWidth = 2;
    for (let i = -CH; i < CW + CH; i += 14) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + CH, CH);
      g.moveTo(i + CH, 0);
      g.lineTo(i, CH);
      g.stroke();
    }
    g.restore();
    rr(g, 3, 3, CW - 6, CH - 6, 14);
    g.lineWidth = 5;
    g.strokeStyle = '#ffd84d';
    g.stroke();
    g.fillStyle = '#ffd84d';
    g.beginPath();
    g.arc(60, 84, 20, 0, TAU);
    g.fill();
    txt(g, '?', 60, 86, 28, '#4a2fc0', 'center', 900);
  }
  const faces = [faceC('3', '#ff5a7a'), faceC('7', '#2f9e8a'), faceC('5', '#ff9a3c')];
  let shade = true;
  let persp = true;
  let spd = 1;
  const controls: Control[] = [
    { type: 'toggle', label: '그늘 · 들림', value: shade, on: (v) => (shade = v) },
    { type: 'toggle', label: '원근 흉내 (세로 조각)', value: persp, on: (v) => (persp = v) },
    { type: 'range', label: '속도', min: 0.3, max: 2, step: 0.1, value: spd, on: (v) => (spd = v) },
  ];
  let tt = 0;
  return {
    controls,
    draw(g: G, w: number, h: number, _t: number, dt: number) {
      reset(g);
      const f = frame(g, w, h);
      tt += dt * spd;
      vbg(g, f, '#1d3b3a', '#0e1f22');
      // 펠트 무늬
      g.fillStyle = 'rgba(255,255,255,.03)';
      for (let y = 0; y < 175; y += 6) for (let x = (y / 6) % 2 ? 0 : 3; x < 280; x += 6) g.fillRect(x, y, 1.2, 1.2);
      let meter = 1;
      for (let i = 0; i < 3; i++) {
        const cyc = (tt / 3.2 + i * 0.18) % 1;
        // 0~0.2 뒤집기 → 앞, 0.5~0.7 뒤집기 → 뒤
        let a: number;
        if (cyc < 0.2) a = smooth(cyc / 0.2) * Math.PI;
        else if (cyc < 0.5) a = Math.PI;
        else if (cyc < 0.7) a = Math.PI + smooth((cyc - 0.5) / 0.2) * Math.PI;
        else a = 0;
        const sx = Math.cos(a);
        if (i === 1) meter = sx;
        const showFace = sx < 0;
        const img = showFace ? faces[i]! : back;
        const lift = shade ? Math.abs(Math.sin(a)) : 0;
        const cx = 60 + i * 80;
        const cy = 82 - lift * 8;
        const dw = 56;
        const dh = 78;
        // 그림자
        g.fillStyle = `rgba(0,0,0,${0.35 - lift * 0.15})`;
        g.beginPath();
        g.ellipse(cx + lift * 5, 124 + lift * 2, (dw / 2) * Math.max(0.15, Math.abs(sx)) + lift * 6, 5 + lift * 2, 0, 0, TAU);
        g.fill();
        const k = Math.abs(sx);
        if (persp) {
          const n = 16;
          const sa = Math.sin(a);
          for (let s2 = 0; s2 < n; s2++) {
            const u0 = s2 / n;
            const u1 = (s2 + 1) / n;
            const xl = (u0 - 0.5) * 2;
            const xr = (u1 - 0.5) * 2;
            const zl = xl * sa * (showFace ? -1 : 1);
            const zr = xr * sa * (showFace ? -1 : 1);
            const pl = 1 / (1 + zl * 0.18);
            const pr = 1 / (1 + zr * 0.18);
            const X0 = cx + xl * (dw / 2) * k * (showFace ? -1 : 1) * pl * (showFace ? -1 : 1);
            const X1 = cx + xr * (dw / 2) * k * pr;
            const hh = dh * (pl + pr) * 0.5;
            const srcU = u0;
            g.drawImage(img, srcU * CW, 0, CW / n + 0.5, CH, Math.min(X0, X1), cy - hh / 2, Math.abs(X1 - X0) + 0.4, hh);
          }
        } else {
          g.drawImage(img, cx - (dw / 2) * k, cy - dh / 2, dw * k, dh);
        }
        if (shade && k < 0.98) {
          g.fillStyle = `rgba(0,0,0,${(1 - k) * 0.45})`;
          rr(g, cx - (dw / 2) * k, cy - dh / 2, dw * k, dh, 6 * k);
          g.fill();
          if (k > 0.05) {
            g.fillStyle = `rgba(255,255,255,${(1 - k) * 0.25})`;
            g.fillRect(cx - (dw / 2) * k, cy - dh / 2, Math.max(1, dw * k * 0.15), dh);
          }
        }
      }
      // scaleX 계기
      const mx = 140;
      rr(g, mx - 70, 142, 140, 14, 7);
      g.fillStyle = 'rgba(255,255,255,.08)';
      g.fill();
      g.fillStyle = meter >= 0 ? '#7b5cff' : '#2f9e8a';
      const bw = 66 * Math.abs(meter);
      if (meter >= 0) g.fillRect(mx, 145, bw, 8);
      else g.fillRect(mx - bw, 145, bw, 8);
      g.fillStyle = '#fff';
      g.fillRect(mx - 0.5, 143, 1, 12);
      txt(g, `가운데 카드 scaleX = ${meter.toFixed(2)}  (0 을 지나면 앞면으로 바꿔 그림)`, mx, 166, 7.5, '#cfeee8');
      pill(g, '3D 없이 가로 크기만 1 → 0 → −1', 140, 13, 8, 'rgba(255,255,255,.1)', '#e8fffb');
      g.restore();
    },
  };
}

export const DEMOS: DemoMap = {
  i294: { kind: '2d', caption: '그림 둘레를 거리 지도로 n칸 넓혀 테를 만들고, 더 멀리 옅게 퍼뜨려 빛 무리 — 고른 친구만 빛남', make: mkI294 },
  i295: { kind: '2d', caption: '화소마다 잡음 값 < 문턱이면 지우고, 문턱 바로 위 띠만 불빛(왼쪽) · 마법빛(오른쪽)으로 — 불티가 날림', make: mkI295 },
  i296: { kind: '2d', caption: '번호(0~7)로 칠한 도트 그림 하나에 색 표만 갈아 끼움 — 팀 색 · 피격 깜빡 · 얼음 · 색 돌리기', make: mkI296 },
  i297: { kind: '2d', caption: '같은 그림을 납작하게 눌러 해 쪽 반대로 기울인 그림자 + 거꾸로 뒤집어 줄마다 흔든 물 반사', make: mkI297 },
  i298: { kind: '2d', caption: '대시할 때 지난 위치들을 기억해 두었다가 색을 입힌 반투명 복제로 그림 — 뒤로 갈수록 옅게', make: mkI298 },
  i299: { kind: '2d', caption: '그림 한 장을 7×7 격자 삼각형으로 잘라 꼭짓점만 움직임 — 숨쉬기 · 깃발 · 당기기 · 말랑', make: mkI299 },
  i300: { kind: '2d', caption: '뼈마다 각도만 돌려 걷고(FK), 앞팔은 손 끝이 별에 닿도록 두 뼈 각도를 거꾸로 계산(IK)', make: mkI300 },
  i301: { kind: '2d', caption: '동전 · 카드 · 금 글씨 · 단추 위로 대각 빛 띠가 지나감 — 그림이 있는 화소에만 덧칠', make: mkI301 },
  i302: { kind: '2d', caption: '불 · 연기 · 반짝이 · 꽃잎 — 방출기마다 수명 · 힘 · 크기 · 색이 다른 입자, 불은 더하기 혼합', make: mkI302 },
  i303: { kind: '2d', caption: '흩어진 그림 수십 장을 큰 것부터 가장 낮은 빈자리(스카이라인)에 꾸려 넣어 한 장으로 — 그리기 한 번', make: mkI303 },
  i304: { kind: '2d', caption: '16×16 도트를 ×4: 가까운 점 · scale2x(대각선만 매끈) · 부드럽게(흐림) — 아래는 정수 칸 vs 반 칸 위치', make: mkI304 },
  i305: { kind: '2d', caption: '평면 경주 지도(오른쪽 위)를 줄마다 원근으로 늘려 깊이 있는 바닥 — 160폭 작은 화면에서 계산', make: mkI305 },
  i306: { kind: '2d', caption: '세로줄마다 광선 하나 — 벽까지 거리로 높이 · 어둡기 · 무늬 줄, 바닥도 줄마다 거리 계산 · 미니 지도', make: mkI306 },
  i307: { kind: '2d', caption: '도로 조각마다 커브를 누적하고 높이를 투영 — 굽이 · 언덕 · 빨강흰 연석 · 나무 스프라이트', make: mkI307 },
  i308: { kind: '2d', caption: '가로 단면 도트 그림(아래 띠)을 층층이 위로 쌓아 돌리면 차 · 집 · 나무가 입체처럼', make: mkI308 },
  i309: { kind: '2d', caption: '먼 산 · 언덕 · 마을 · 풀 · 앞 잎 층을 깊이만큼 다른 속도로 — 먼 층은 안개, 앞 잎은 흐림', make: mkI309 },
  i310: { kind: '2d', caption: '여러 칸 물체를 칸 번호 합으로 줄 세우면 버스가 울타리 위로 뚫고 나옴 ↔ 위상 정렬은 바름 (3초마다 비교)', make: mkI310 },
  i311: { kind: '2d', caption: '가로 크기만 1 → 0 → −1, 0 을 지날 때 앞면으로 바꾸고 그늘 · 들림 · 세로 조각 원근을 더함', make: mkI311 },
};

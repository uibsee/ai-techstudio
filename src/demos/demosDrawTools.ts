import type { Control, DemoMap } from './types';

/**
 * 그리기 도구 견본 (i312 ~ i322).
 * 카드(작게): 연필 손이 혼자 그리는 시연이 되풀이된다 — 보는 순간 도구가 무엇을 하는지.
 * 크게 보기(폭 > 500): 마우스 · 손가락으로 직접 그린다. 누르는 동안 시연은 멈추고, 8초 손대지 않으면 다시 시연.
 * 모든 견본은 kind 'dom' — box 안에 캔버스를 직접 만들고 pointer 이벤트를 단다.
 * 좌표는 「세계」 400 × 250 (짙은 책상 위 스케치북) 를 box 에 맞춰 넣는다. 그림 층은 세계 × R 화소.
 */

type G = CanvasRenderingContext2D;
type P = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };
const W = 400;
const H = 250;
const F = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
const IDLE = 8;

const pt = (x: number, y: number): P => ({ x, y });
const dist = (a: P, b: P): number => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;
const lerpP = (a: P, b: P, u: number): P => pt(lerp(a.x, b.x, u), lerp(a.y, b.y, u));
const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
const ease = (u: number): number => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
const easeBack = (u: number): number => {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2);
};
const PAPER: Rect = { x: 14, y: 16, w: 372, h: 220 };

function rng(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
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
function pathLen(p: P[]): number {
  let L = 0;
  for (let i = 1; i < p.length; i++) L += dist(p[i - 1]!, p[i]!);
  return L;
}
/** 고른 간격으로 다시 찍기 (간격 step) */
function resampleStep(p: P[], step: number): P[] {
  if (p.length < 2) return p.slice();
  const out: P[] = [p[0]!];
  let carry = 0;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1]!;
    const b = p[i]!;
    const d = dist(a, b);
    let s = step - carry;
    while (s <= d) {
      out.push(lerpP(a, b, s / d));
      s += step;
    }
    carry = d - (s - step);
  }
  const last = p[p.length - 1]!;
  if (dist(out[out.length - 1]!, last) > step * 0.3) out.push(last);
  return out;
}
/** n 개로 다시 찍기 */
function resampleN(p: P[], n: number): P[] {
  const L = pathLen(p);
  if (L < 1e-6) return Array.from({ length: n }, () => ({ ...p[0]! }));
  const r = resampleStep(p, L / (n - 1));
  while (r.length < n) r.push({ ...p[p.length - 1]! });
  return r.slice(0, n);
}
function arcPts(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 40): P[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    return pt(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
  });
}
/** 손 떨림 더하기 (낮은 물결 + 잔떨림) */
function shaky(p: P[], amp: number, seed: number): P[] {
  const r = rng(seed);
  const ph = r() * 10;
  return p.map((q, i) => pt(q.x + Math.sin(i * 0.21 + ph) * amp * 0.8 + (r() - 0.5) * amp, q.y + Math.cos(i * 0.17 + ph * 1.3) * amp * 0.8 + (r() - 0.5) * amp));
}
function rrect(g: G, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function poly(g: G, p: P[], close = false): void {
  g.beginPath();
  p.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
  if (close) g.closePath();
}
/** 점들을 2차 곡선(가운데 점)으로 매끈하게 */
function smoothPath(g: G, p: P[], close = false): void {
  g.beginPath();
  if (p.length < 3) {
    poly(g, p, close);
    return;
  }
  if (close) {
    const m0 = lerpP(p[p.length - 1]!, p[0]!, 0.5);
    g.moveTo(m0.x, m0.y);
    for (let i = 0; i < p.length; i++) {
      const c = p[i]!;
      const m = lerpP(c, p[(i + 1) % p.length]!, 0.5);
      g.quadraticCurveTo(c.x, c.y, m.x, m.y);
    }
    g.closePath();
    return;
  }
  g.moveTo(p[0]!.x, p[0]!.y);
  for (let i = 1; i < p.length - 1; i++) {
    const c = p[i]!;
    const m = lerpP(c, p[i + 1]!, 0.5);
    g.quadraticCurveTo(c.x, c.y, m.x, m.y);
  }
  const l = p[p.length - 1]!;
  g.lineTo(l.x, l.y);
}
function pill(g: G, x: number, y: number, text: string, size: number, bg: string, fg: string, align: 'center' | 'left' = 'center'): void {
  g.font = `700 ${size}px ${F}`;
  const tw = g.measureText(text).width;
  const pw = tw + size * 1.1;
  const ph = size * 1.65;
  const x0 = align === 'center' ? x - pw / 2 : x;
  g.fillStyle = bg;
  rrect(g, x0, y - ph / 2, pw, ph, ph / 2);
  g.fill();
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x0 + pw / 2, y + size * 0.05);
}

// ───────────────────────── 그림 층 ─────────────────────────
interface Layer {
  c: HTMLCanvasElement;
  g: G;
  R: number;
}
function mkLayer(R: number, read = false): Layer {
  const c = document.createElement('canvas');
  c.width = Math.round(W * R);
  c.height = Math.round(H * R);
  const g = c.getContext('2d', read ? { willReadFrequently: true } : undefined)!;
  g.setTransform(R, 0, 0, R, 0, 0);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  return { c, g, R };
}
function clearLayer(l: Layer): void {
  l.g.save();
  l.g.setTransform(1, 0, 0, 1, 0, 0);
  l.g.globalCompositeOperation = 'source-over';
  l.g.clearRect(0, 0, l.c.width, l.c.height);
  l.g.restore();
}
function clipPaper(g: G, r: Rect): void {
  g.beginPath();
  g.rect(r.x, r.y, r.w, r.h);
  g.clip();
}

// ───────────────────────── 커서 (화면 px) ─────────────────────────
type CursorKind = 'pencil' | 'brush' | 'bucket' | 'pen' | 'eraser';
function drawCursor(g: G, x: number, y: number, S: number, kind: CursorKind, down: boolean, color: string): void {
  g.save();
  g.translate(x, y);
  const lift = down ? S * 0.04 : S * 0.16;
  if (kind === 'bucket') {
    drawBucket(g, S, color, lift);
    g.restore();
    return;
  }
  const ang = -1.0;
  // 그림자
  g.save();
  g.translate(lift * 0.7, lift);
  g.rotate(ang);
  g.fillStyle = 'rgba(10,6,2,0.28)';
  if (kind === 'eraser') {
    rrect(g, -S * 0.05, -S * 0.17, S * 0.62, S * 0.34, S * 0.05);
  } else {
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(S * 0.2, -S * 0.075);
    g.lineTo(S, -S * 0.075);
    g.lineTo(S, S * 0.075);
    g.lineTo(S * 0.2, S * 0.075);
    g.closePath();
  }
  g.fill();
  g.restore();
  g.rotate(ang);
  const wd = S * 0.15;
  if (kind === 'pencil') {
    // 깎은 나무
    g.fillStyle = '#ecc89a';
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(S * 0.21, -wd / 2);
    for (let i = 0; i <= 4; i++) g.lineTo(S * (0.21 + (i % 2 ? 0.012 : 0)), -wd / 2 + (wd * i) / 4);
    g.lineTo(S * 0.21, wd / 2);
    g.closePath();
    g.fill();
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(S * 0.075, -wd * 0.19);
    g.lineTo(S * 0.075, wd * 0.19);
    g.closePath();
    g.fill();
    // 몸통
    const gr = g.createLinearGradient(0, -wd / 2, 0, wd / 2);
    gr.addColorStop(0, '#ffd85a');
    gr.addColorStop(0.33, '#ffd040');
    gr.addColorStop(0.34, '#f4b92a');
    gr.addColorStop(0.66, '#f4b92a');
    gr.addColorStop(0.67, '#d99a14');
    gr.addColorStop(1, '#c4860c');
    g.fillStyle = gr;
    g.fillRect(S * 0.21, -wd / 2, S * 0.62, wd);
    // 쇠 띠
    const gm = g.createLinearGradient(0, -wd / 2, 0, wd / 2);
    gm.addColorStop(0, '#e8ecf0');
    gm.addColorStop(0.5, '#a9b0b8');
    gm.addColorStop(1, '#7c838c');
    g.fillStyle = gm;
    g.fillRect(S * 0.83, -wd * 0.54, S * 0.075, wd * 1.08);
    g.strokeStyle = 'rgba(60,64,70,0.5)';
    g.lineWidth = Math.max(0.6, S * 0.008);
    for (let i = 1; i < 3; i++) {
      g.beginPath();
      g.moveTo(S * (0.83 + i * 0.025), -wd * 0.54);
      g.lineTo(S * (0.83 + i * 0.025), wd * 0.54);
      g.stroke();
    }
    // 지우개
    g.fillStyle = '#f08a9b';
    rrect(g, S * 0.905, -wd / 2, S * 0.095, wd, S * 0.03);
    g.fill();
  } else if (kind === 'brush') {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(S * 0.08, -wd * 0.55, S * 0.24, -wd * 0.42);
    g.lineTo(S * 0.24, wd * 0.42);
    g.quadraticCurveTo(S * 0.08, wd * 0.55, 0, 0);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(S * 0.1, -wd * 0.3, S * 0.12, wd * 0.12);
    const gm = g.createLinearGradient(0, -wd / 2, 0, wd / 2);
    gm.addColorStop(0, '#eef1f4');
    gm.addColorStop(0.5, '#a3abb4');
    gm.addColorStop(1, '#6d747c');
    g.fillStyle = gm;
    g.fillRect(S * 0.24, -wd * 0.45, S * 0.16, wd * 0.9);
    const gh = g.createLinearGradient(0, -wd / 2, 0, wd / 2);
    gh.addColorStop(0, '#d0563f');
    gh.addColorStop(1, '#8a2717');
    g.fillStyle = gh;
    g.beginPath();
    g.moveTo(S * 0.4, -wd * 0.42);
    g.lineTo(S * 0.95, -wd * 0.3);
    g.quadraticCurveTo(S * 1.02, 0, S * 0.95, wd * 0.3);
    g.lineTo(S * 0.4, wd * 0.42);
    g.closePath();
    g.fill();
  } else if (kind === 'pen') {
    // 펜촉
    const gn = g.createLinearGradient(0, -wd, 0, wd);
    gn.addColorStop(0, '#f2f4f7');
    gn.addColorStop(0.5, '#a4abb4');
    gn.addColorStop(1, '#5d646c');
    g.fillStyle = gn;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(S * 0.16, -wd * 0.9, S * 0.36, -wd * 0.6);
    g.lineTo(S * 0.36, wd * 0.6);
    g.quadraticCurveTo(S * 0.16, wd * 0.9, 0, 0);
    g.fill();
    g.strokeStyle = '#2a2e35';
    g.lineWidth = Math.max(0.8, S * 0.012);
    g.beginPath();
    g.moveTo(S * 0.02, 0);
    g.lineTo(S * 0.2, 0);
    g.stroke();
    g.fillStyle = '#2a2e35';
    g.beginPath();
    g.arc(S * 0.21, 0, S * 0.022, 0, Math.PI * 2);
    g.fill();
    const gb = g.createLinearGradient(0, -wd / 2, 0, wd / 2);
    gb.addColorStop(0, '#4a5262');
    gb.addColorStop(0.4, '#232832');
    gb.addColorStop(1, '#0f1217');
    g.fillStyle = gb;
    rrect(g, S * 0.36, -wd * 0.62, S * 0.64, wd * 1.24, wd * 0.5);
    g.fill();
    g.fillStyle = '#d8b25a';
    g.fillRect(S * 0.42, -wd * 0.62, S * 0.03, wd * 1.24);
  } else if (kind === 'eraser') {
    g.fillStyle = '#f4f1ec';
    rrect(g, 0, -S * 0.17, S * 0.24, S * 0.34, S * 0.04);
    g.fill();
    g.fillStyle = '#4f7fd8';
    rrect(g, S * 0.2, -S * 0.18, S * 0.36, S * 0.36, S * 0.04);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.font = `800 ${S * 0.12}px ${F}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('지우개', S * 0.38, 0);
  }
  g.restore();
}
function drawBucket(g: G, S: number, color: string, lift: number): void {
  const cx = S * 0.42;
  const cy = -S * 0.52;
  const rot = -1.95;
  const hgt = S * 0.42;
  const lip = pt(cx + Math.sin(-rot) * 0 + Math.sin(rot) * (hgt / 2) * -1, cy + Math.cos(rot) * (-hgt / 2));
  // 그림자
  g.fillStyle = 'rgba(10,6,2,0.25)';
  g.beginPath();
  g.ellipse(cx + lift, cy + lift + S * 0.05, S * 0.26, S * 0.18, 0.4, 0, Math.PI * 2);
  g.fill();
  // 쏟아지는 물감
  g.strokeStyle = color;
  g.lineWidth = S * 0.06;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(lip.x, lip.y);
  g.quadraticCurveTo(lip.x - S * 0.12, lip.y + S * 0.05, 0, -S * 0.06);
  g.stroke();
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, -S * 0.1);
  g.quadraticCurveTo(S * 0.06, 0, 0, S * 0.04);
  g.quadraticCurveTo(-S * 0.06, 0, 0, -S * 0.1);
  g.fill();
  g.save();
  g.translate(cx, cy);
  g.rotate(rot);
  const tw = S * 0.5;
  const bw = S * 0.36;
  const gm = g.createLinearGradient(-tw / 2, 0, tw / 2, 0);
  gm.addColorStop(0, '#7d8792');
  gm.addColorStop(0.35, '#e6ebf0');
  gm.addColorStop(0.7, '#a7b0ba');
  gm.addColorStop(1, '#6a737d');
  g.fillStyle = gm;
  g.beginPath();
  g.moveTo(-tw / 2, -hgt / 2);
  g.lineTo(tw / 2, -hgt / 2);
  g.lineTo(bw / 2, hgt / 2);
  g.lineTo(-bw / 2, hgt / 2);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(40,46,54,0.6)';
  g.lineWidth = Math.max(0.8, S * 0.015);
  g.stroke();
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(0, -hgt / 2, tw / 2, S * 0.06, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#59616b';
  g.stroke();
  g.strokeStyle = '#3d434a';
  g.lineWidth = S * 0.025;
  g.beginPath();
  g.arc(0, -hgt * 0.1, tw * 0.55, Math.PI * 0.95, Math.PI * 2.05, true);
  g.stroke();
  g.restore();
}

// ───────────────────────── 책상 · 스케치북 배경 (한 번 구워 둠) ─────────────────────────
function paintBackdrop(cw: number, ch: number, dpr: number, sc: number, ox: number, oy: number, paper: Rect, rings: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(cw * dpr));
  c.height = Math.max(1, Math.round(ch * dpr));
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const gr = g.createLinearGradient(0, 0, cw * 0.3, ch);
  gr.addColorStop(0, '#3b2a1d');
  gr.addColorStop(0.5, '#2c1f15');
  gr.addColorStop(1, '#1d140d');
  g.fillStyle = gr;
  g.fillRect(0, 0, cw, ch);
  // 나뭇결
  const r = rng(7);
  for (let i = 0; i < 70; i++) {
    const y0 = r() * ch * 1.1 - ch * 0.05;
    const amp = 2 + r() * 6;
    const f = 0.004 + r() * 0.01;
    const ph = r() * 9;
    g.strokeStyle = r() < 0.5 ? `rgba(255,214,160,${0.025 + r() * 0.045})` : `rgba(0,0,0,${0.06 + r() * 0.08})`;
    g.lineWidth = 0.5 + r() * 1.6;
    g.beginPath();
    for (let x = -10; x <= cw + 10; x += 8) {
      const y = y0 + Math.sin(x * f + ph) * amp + Math.sin(x * f * 3.1 + ph * 2) * amp * 0.3;
      if (x === -10) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  const vg = g.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.3, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = vg;
  g.fillRect(0, 0, cw, ch);
  // 스케치북 종이
  g.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * ox, dpr * oy);
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.5)';
  g.shadowBlur = 16 * sc * dpr;
  g.shadowOffsetY = 5 * sc * dpr;
  g.fillStyle = '#fbf7ee';
  rrect(g, paper.x, paper.y, paper.w, paper.h, 3);
  g.fill();
  g.restore();
  // 아래 겹친 종이
  g.fillStyle = 'rgba(232,224,208,1)';
  g.fillRect(paper.x + 3, paper.y + paper.h, paper.w - 6, 1.4);
  const pg = g.createLinearGradient(paper.x, paper.y, paper.x + paper.w, paper.y + paper.h);
  pg.addColorStop(0, 'rgba(255,255,255,0.5)');
  pg.addColorStop(0.6, 'rgba(255,255,255,0)');
  pg.addColorStop(1, 'rgba(160,130,90,0.10)');
  g.fillStyle = pg;
  rrect(g, paper.x, paper.y, paper.w, paper.h, 3);
  g.fill();
  // 종이 결
  const n = Math.round(paper.w * paper.h * 0.06);
  for (let i = 0; i < n; i++) {
    g.fillStyle = r() < 0.5 ? `rgba(120,96,60,${0.03 + r() * 0.05})` : `rgba(255,255,255,${0.3 + r() * 0.4})`;
    g.fillRect(paper.x + r() * paper.w, paper.y + r() * paper.h, 0.3 + r() * 0.8, 0.3 + r() * 0.5);
  }
  if (rings) {
    const cnt = Math.floor(paper.w / 17);
    const sp = paper.w / cnt;
    for (let i = 0; i < cnt; i++) {
      const hx = paper.x + sp * (i + 0.5);
      const hy = paper.y + 6;
      g.fillStyle = '#3a2f28';
      g.beginPath();
      g.ellipse(hx, hy, 2.1, 1.7, 0, 0, Math.PI * 2);
      g.fill();
      for (const [col, wd] of [
        ['#2b2622', 2.6],
        ['#c9ced6', 1.6],
      ] as [string, number][]) {
        g.strokeStyle = col;
        g.lineWidth = wd;
        g.beginPath();
        g.moveTo(hx + 0.5, hy);
        g.bezierCurveTo(hx - 3.5, hy - 5, hx - 3, paper.y - 9, hx + 1, paper.y - 9);
        g.bezierCurveTo(hx + 4.5, paper.y - 9, hx + 4.5, hy - 4, hx + 2.2, hy - 0.8);
        g.stroke();
      }
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.lineWidth = 0.5;
      g.beginPath();
      g.moveTo(hx - 1.6, paper.y - 4);
      g.quadraticCurveTo(hx - 1.4, paper.y - 8, hx + 0.6, paper.y - 8.2);
      g.stroke();
    }
  }
  return c;
}

// ───────────────────────── 시연 대본 · 연필 손 ─────────────────────────
type Act = { k: 'stroke'; pts: P[]; dur: number } | { k: 'tap'; at: P } | { k: 'move'; to: P; dur?: number } | { k: 'wait'; dur: number } | { k: 'do'; fn: () => void };
const S = (pts: P[], speed = 200, step = 2): Act => {
  const r = resampleStep(pts, step);
  return { k: 'stroke', pts: r, dur: Math.max(0.15, pathLen(r) / speed) };
};
const TAP = (x: number, y: number): Act => ({ k: 'tap', at: pt(x, y) });
const WAIT = (dur: number): Act => ({ k: 'wait', dur });
const DO = (fn: () => void): Act => ({ k: 'do', fn });

class Runner {
  acts: Act[] = [];
  i = 0;
  t = 0;
  started = false;
  phase = 0;
  from: P = pt(360, 230);
  pos: P = pt(360, 230);
  down = false;
  last = 0;
  press = 0;
  taps: { p: P; t: number }[] = [];
  reset(a: Act[]): void {
    this.acts = a;
    this.i = 0;
    this.started = false;
    this.down = false;
  }
  private next(): void {
    this.i++;
    this.started = false;
  }
  step(dt: number, tool: Tool): boolean {
    let budget = dt;
    this.press = Math.max(0, this.press - dt * 4);
    for (const tp of this.taps) tp.t += dt;
    this.taps = this.taps.filter((q) => q.t < 0.6);
    for (let guard = 0; guard < 60 && this.i < this.acts.length; guard++) {
      const a = this.acts[this.i]!;
      if (!this.started) {
        this.started = true;
        this.t = 0;
        this.phase = 0;
        this.from = { ...this.pos };
      }
      if (a.k === 'do') {
        a.fn();
        this.next();
        continue;
      }
      if (a.k === 'wait') {
        this.t += budget;
        if (this.t >= a.dur) {
          budget = this.t - a.dur;
          this.next();
          continue;
        }
        return false;
      }
      const target = a.k === 'tap' ? a.at : a.k === 'move' ? a.to : a.pts[0]!;
      if (this.phase === 0) {
        const d = dist(this.from, target);
        const dur = a.k === 'move' && a.dur !== undefined ? a.dur : d < 0.5 ? 0 : clamp(0.16 + d / 520, 0.18, 0.6);
        this.t += budget;
        const u = dur <= 0 ? 1 : Math.min(1, this.t / dur);
        this.pos = lerpP(this.from, target, ease(u));
        if (u < 1) return false;
        budget = Math.max(0, this.t - dur);
        this.t = 0;
        this.phase = 1;
        if (a.k === 'move') {
          this.next();
          continue;
        }
        if (a.k === 'tap') {
          tool.begin(a.at, false);
          tool.end();
          this.press = 1;
          this.taps.push({ p: { ...a.at }, t: 0 });
          this.next();
          continue;
        }
        tool.begin(a.pts[0]!, false);
        this.down = true;
        this.last = 0;
      }
      if (a.k !== 'stroke') {
        this.next();
        continue;
      }
      this.t += budget;
      budget = 0;
      const n = a.pts.length;
      const f = Math.min(1, this.t / a.dur) * (n - 1);
      const k = Math.floor(f);
      for (let j = this.last + 1; j <= k; j++) tool.drag(a.pts[j]!);
      this.last = Math.max(this.last, k);
      this.pos = k + 1 < n ? lerpP(a.pts[k]!, a.pts[k + 1]!, f - k) : a.pts[n - 1]!;
      if (f >= n - 1) {
        tool.end();
        this.down = false;
        this.next();
        continue;
      }
      return false;
    }
    return this.i >= this.acts.length;
  }
}

// ───────────────────────── 도구 규격 · 판 ─────────────────────────
interface Env {
  R: number;
  big: boolean;
}
interface Tool {
  paper?: Rect;
  rings?: boolean;
  cursor(): CursorKind;
  color?(): string;
  begin(p: P, user: boolean): void;
  drag(p: P): void;
  end(): void;
  hover?(p: P | null): void;
  step?(dt: number): void;
  draw(g: G): void;
  clear(): void;
  script(loop: number): Act[];
  controls?: Control[];
}

function makeBoard(box: HTMLElement, build: (env: Env) => Tool): { update(t: number, dt: number): void; controls: Control[]; dispose(): void } {
  const big0 = box.clientWidth > 500;
  const env: Env = { R: big0 ? 3 : 1.6, big: big0 };
  const tool = build(env);
  const paper = tool.paper ?? PAPER;
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
  box.appendChild(canvas);
  const g = canvas.getContext('2d')!;
  let cw = 1;
  let ch = 1;
  let dpr = 1;
  let sc = 1;
  let ox = 0;
  let oy = 0;
  let back: HTMLCanvasElement | null = null;
  let mode: 'demo' | 'user' = 'demo';
  let loop = 0;
  let idle = 0;
  let pressing = false;
  let pid = -1;
  const runner = new Runner();
  const interactive = (): boolean => box.clientWidth > 500;

  const fit = (): void => {
    cw = Math.max(1, box.clientWidth);
    ch = Math.max(1, box.clientHeight);
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    sc = Math.min(cw / W, ch / H);
    ox = (cw - W * sc) / 2;
    oy = (ch - H * sc) / 2;
    back = paintBackdrop(cw, ch, dpr, sc, ox, oy, paper, tool.rings !== false);
    canvas.style.touchAction = interactive() ? 'none' : 'auto';
    canvas.style.cursor = interactive() ? 'crosshair' : 'default';
  };
  fit();
  const ro = new ResizeObserver(() => fit());
  ro.observe(box);

  const startDemo = (): void => {
    mode = 'demo';
    tool.clear();
    runner.reset(tool.script(loop));
  };
  startDemo();

  const toWorld = (e: PointerEvent): P => {
    const b = canvas.getBoundingClientRect();
    return pt((e.clientX - b.left - ox) / sc, (e.clientY - b.top - oy) / sc);
  };
  const takeOver = (): void => {
    if (mode === 'demo') {
      if (runner.down) tool.end();
      runner.down = false;
      mode = 'user';
      tool.clear();
    }
  };
  const onDown = (e: PointerEvent): void => {
    if (!interactive() || pressing) return;
    e.preventDefault();
    takeOver();
    pressing = true;
    pid = e.pointerId;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* 무시 */
    }
    idle = 0;
    tool.begin(toWorld(e), true);
  };
  const onMove = (e: PointerEvent): void => {
    if (!interactive()) return;
    const p = toWorld(e);
    if (pressing && e.pointerId === pid) {
      e.preventDefault();
      idle = 0;
      tool.drag(p);
    } else if (mode === 'user') tool.hover?.(p);
  };
  const onUp = (e: PointerEvent): void => {
    if (!pressing || e.pointerId !== pid) return;
    pressing = false;
    idle = 0;
    tool.end();
  };
  const onLeave = (): void => {
    if (mode === 'user' && !pressing) tool.hover?.(null);
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onLeave);

  const controls: Control[] = [
    {
      type: 'button',
      label: '지우기',
      on: () => {
        takeOver();
        idle = 0;
        tool.clear();
      },
    },
    ...(tool.controls ?? []),
    {
      type: 'button',
      label: '▶ 시연 보기',
      on: () => {
        loop++;
        startDemo();
      },
    },
  ];

  const render = (): void => {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    if (back) g.drawImage(back, 0, 0);
    g.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * ox, dpr * oy);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.save();
    tool.draw(g);
    g.restore();
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    if (mode === 'demo') {
      for (const tp of runner.taps) {
        const u = tp.t / 0.6;
        g.strokeStyle = `rgba(47,123,224,${(1 - u) * 0.8})`;
        g.lineWidth = 1.6;
        g.beginPath();
        g.arc(tp.p.x, tp.p.y, 3 + u * 14, 0, Math.PI * 2);
        g.stroke();
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cs = env.big ? 50 : 30;
      drawCursor(g, ox + runner.pos.x * sc, oy + runner.pos.y * sc, cs, tool.cursor(), runner.down || runner.press > 0.5, tool.color?.() ?? '#333');
    }
    if (interactive()) {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const txt = mode === 'demo' ? '▶ 시연 중 — 직접 그려 보세요 (마우스 · 손가락)' : '✎ 직접 그리기 — 손을 떼고 8초 지나면 시연';
      pill(g, 14, ch - 18, txt, 12.5, mode === 'demo' ? 'rgba(20,24,34,0.78)' : 'rgba(47,123,224,0.9)', '#fff', 'left');
    }
  };

  return {
    controls,
    update(_t: number, dt0: number) {
      const dt = Math.min(Math.max(dt0, 0), 0.05);
      if (mode === 'demo') {
        if (runner.step(dt, tool)) {
          loop++;
          startDemo();
        }
        tool.hover?.(runner.pos);
      } else if (!pressing) {
        idle += dt;
        if (idle > IDLE) {
          loop++;
          startDemo();
        }
      }
      tool.step?.(dt);
      render();
    },
    dispose() {
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.remove();
      back = null;
    },
  };
}

// ═════════════════════════ i312 부드러운 붓 ═════════════════════════
function smoothBrush(): Tool {
  let strokes: P[][] = [];
  let cur: P[] | null = null;
  let win = 4;
  let showRaw = true;
  let on = true;
  const INK = '#1d2747';
  function smoothed(raw: P[]): { p: P; w: number }[] {
    const n = raw.length;
    if (n < 2) return raw.map((p) => ({ p, w: 3 }));
    const a: P[] = raw.map((_, i) => {
      let sx = 0;
      let sy = 0;
      let c = 0;
      const k = Math.min(win, i, n - 1 - i);
      for (let j = i - k; j <= i + k; j++) {
        sx += raw[j]!.x;
        sy += raw[j]!.y;
        c++;
      }
      return pt(sx / c, sy / c);
    });
    const ws: number[] = [];
    let w = 0;
    for (let i = 0; i < n; i++) {
      const sp = i ? dist(raw[i]!, raw[i - 1]!) : 2;
      const target = clamp(4.6 - sp * 0.5, 1.2, 4.6);
      w = i === 0 ? target : w + (target - w) * 0.22;
      const f = Math.min(1, (i + 1) / 6, (n - i) / 6);
      ws.push(w * (0.3 + 0.7 * f));
    }
    const out: { p: P; w: number }[] = [{ p: a[0]!, w: ws[0]! }];
    for (let i = 1; i < n - 1; i++) {
      const m0 = lerpP(a[i - 1]!, a[i]!, 0.5);
      const m1 = lerpP(a[i]!, a[i + 1]!, 0.5);
      const c = a[i]!;
      for (let s = 1; s <= 4; s++) {
        const u = s / 4;
        const x = (1 - u) * (1 - u) * m0.x + 2 * (1 - u) * u * c.x + u * u * m1.x;
        const y = (1 - u) * (1 - u) * m0.y + 2 * (1 - u) * u * c.y + u * u * m1.y;
        out.push({ p: pt(x, y), w: lerp((ws[i - 1]! + ws[i]!) / 2, (ws[i]! + ws[i + 1]!) / 2, u) });
      }
    }
    out.push({ p: a[n - 1]!, w: ws[n - 1]! });
    return out;
  }
  function drawStroke(g: G, raw: P[]): void {
    if (raw.length < 2) return;
    if (!on) {
      g.strokeStyle = INK;
      g.lineWidth = 2.8;
      poly(g, raw);
      g.stroke();
    } else {
      const s = smoothed(raw);
      g.strokeStyle = INK;
      for (let i = 1; i < s.length; i++) {
        g.lineWidth = (s[i - 1]!.w + s[i]!.w) / 2;
        g.beginPath();
        g.moveTo(s[i - 1]!.p.x, s[i - 1]!.p.y);
        g.lineTo(s[i]!.p.x, s[i]!.p.y);
        g.stroke();
      }
    }
    if (showRaw) {
      g.strokeStyle = 'rgba(226,72,58,0.45)';
      g.lineWidth = 0.6;
      poly(g, raw);
      g.stroke();
      g.fillStyle = 'rgba(226,72,58,0.8)';
      for (const q of raw) {
        g.beginPath();
        g.arc(q.x, q.y, 0.85, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  return {
    cursor: () => 'pencil',
    color: () => INK,
    begin(p) {
      cur = [p];
      strokes.push(cur);
    },
    drag(p) {
      if (cur && dist(cur[cur.length - 1]!, p) > 0.4) cur.push(p);
    },
    end() {
      cur = null;
    },
    clear() {
      strokes = [];
      cur = null;
    },
    draw(g) {
      clipPaper(g, PAPER);
      for (const s of strokes) drawStroke(g, s);
      g.font = `600 8px ${F}`;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      if (showRaw) {
        g.fillStyle = 'rgba(226,72,58,0.9)';
        g.beginPath();
        g.arc(26, 226, 1.6, 0, Math.PI * 2);
        g.fill();
        g.fillText('손이 찍은 점 (떨림)', 31, 226.5);
      }
      g.fillStyle = INK;
      g.fillRect(120, 225.5, 14, 2.2);
      g.fillText(on ? '보정한 선 — 빠르면 가늘게' : '보정 끔 — 점을 그대로 이음', 138, 226.5);
    },
    script(loop) {
      const r = rng(loop * 31 + 5);
      // 고리 글씨 (늘어진 사이클로이드) — 점 간격 = 빠르기
      const a: P[] = [];
      let t = 0;
      const ph = r() * 3;
      while (40 + 11 * t < 365) {
        a.push(pt(40 + 11 * t - 17 * Math.sin(t), 92 - 19 * Math.cos(t) + Math.sin(t * 0.3) * 4));
        t += 0.06 + 0.11 * (0.5 + 0.5 * Math.sin(t * 0.55 + ph));
      }
      const b: P[] = [];
      let x = 40;
      while (x < 362) {
        b.push(pt(x, 172 + 24 * Math.sin(x * 0.04 + ph) + 8 * Math.sin(x * 0.13)));
        x += 1.2 + 5.5 * (0.5 + 0.5 * Math.sin(x * 0.03 + ph * 2));
      }
      const sa = shaky(a, 2.4, loop + 1);
      const sb = shaky(b, 2.4, loop + 9);
      return [{ k: 'stroke', pts: sa, dur: sa.length / 130 }, WAIT(0.2), { k: 'stroke', pts: sb, dur: sb.length / 90 }, WAIT(1.8)];
    },
    controls: [
      { type: 'range', label: '보정 세기 (이동 평균 칸)', min: 0, max: 10, step: 1, value: 4, on: (v) => (win = v) },
      { type: 'toggle', label: '곡선 보정 · 굵기', value: true, on: (v) => (on = v) },
      { type: 'toggle', label: '손 점 보기', value: true, on: (v) => (showRaw = v) },
    ],
  };
}

// ═════════════════════════ i313 도장 붓 ═════════════════════════
type BrushKind = 'crayon' | 'water' | 'chalk';
function grainMask(R: number, kind: BrushKind): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.round(W * R);
  c.height = Math.round(H * R);
  const g = c.getContext('2d')!;
  const img = g.createImageData(c.width, c.height);
  const d = img.data;
  const cs = kind === 'chalk' ? 2.4 * R : kind === 'crayon' ? 1.4 * R : 3.2 * R;
  const r = rng(kind.length * 17);
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const v = vnoise(x / cs, y / cs, 3) * 0.6 + vnoise(x / (cs * 0.4), (y + x * 0.3) / (cs * 0.4), 9) * 0.25 + r() * 0.15;
      let a = 0;
      if (kind === 'crayon') a = clamp((v - 0.5) / 0.14, 0, 1);
      else if (kind === 'chalk') a = clamp((v - 0.4) / 0.16, 0, 1);
      else a = clamp((v - 0.45) / 0.4, 0, 1) * 0.4;
      const i = (y * c.width + x) * 4;
      d[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}
function stampBrush(env: Env): Tool {
  const base = mkLayer(env.R);
  const cur = mkLayer(env.R);
  const tmp = mkLayer(env.R);
  const masks: Record<BrushKind, HTMLCanvasElement> = { crayon: grainMask(env.R, 'crayon'), water: grainMask(env.R, 'water'), chalk: grainMask(env.R, 'chalk') };
  const COLORS: Record<BrushKind, string[]> = {
    crayon: ['#e2483a', '#2f6fe0', '#f29a16', '#36a85a', '#8e44ad'],
    water: ['#f2c230', '#2f8fd8', '#e8556d', '#33a67c'],
    chalk: ['#ffffff', '#ffe27a', '#9fe3ff', '#ffb3c7'],
  };
  const SLATE: Rect = { x: 24, y: 154, w: 352, h: 74 };
  let chosen: BrushKind | 'auto' = 'auto';
  let kind: BrushKind = 'crayon';
  let color = '#e2483a';
  let last: P | null = null;
  let stampIdx = 0;
  let drawing = false;
  const ci: Record<BrushKind, number> = { crayon: 0, water: 0, chalk: 0 };
  let waterStamp: HTMLCanvasElement | null = null;
  const r = rng(3);
  function mkWaterStamp(col: string): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, col + '55');
    gr.addColorStop(0.72, col + '99');
    gr.addColorStop(0.86, col + 'cc');
    gr.addColorStop(1, col + '00');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return c;
  }
  function stamp(a: P, b: P): void {
    const g = cur.g;
    if (kind === 'crayon') {
      g.strokeStyle = color;
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
      g.fillStyle = color;
      const L = dist(a, b);
      for (let i = 0; i < L * 1.2; i++) {
        const u = r();
        const q = lerpP(a, b, u);
        const an = r() * Math.PI * 2;
        const rr = 3 + r() * 1.6;
        g.fillRect(q.x + Math.cos(an) * rr, q.y + Math.sin(an) * rr, 0.7, 0.7);
      }
    } else if (kind === 'water') {
      const L = dist(a, b);
      const n = Math.max(1, Math.floor(L / 1.6));
      g.globalAlpha = 0.14;
      for (let i = 1; i <= n; i++) {
        const q = lerpP(a, b, i / n);
        const rr = 8 + Math.sin(stampIdx++ * 0.21) * 1.5 + r() * 1.5;
        g.drawImage(waterStamp!, q.x - rr + (r() - 0.5) * 1.2, q.y - rr + (r() - 0.5) * 1.2, rr * 2, rr * 2);
      }
      g.globalAlpha = 1;
    } else {
      const L = dist(a, b);
      const n = Math.max(1, Math.floor(L / 0.8));
      g.fillStyle = color;
      for (let i = 1; i <= n; i++) {
        const q = lerpP(a, b, i / n);
        for (let k = 0; k < 7; k++) {
          const an = r() * Math.PI * 2;
          const rr = Math.sqrt(r()) * 4.2;
          g.globalAlpha = 0.35 + r() * 0.6;
          g.fillRect(q.x + Math.cos(an) * rr, q.y + Math.sin(an) * rr, 0.6 + r() * 1.1, 0.5 + r() * 0.8);
        }
      }
      g.globalAlpha = 1;
    }
  }
  function composeTmp(): void {
    clearLayer(tmp);
    const t = tmp.g;
    t.save();
    t.setTransform(1, 0, 0, 1, 0, 0);
    t.drawImage(cur.c, 0, 0);
    t.globalCompositeOperation = 'destination-out';
    t.drawImage(masks[kind], 0, 0);
    t.restore();
  }
  const blend = (): GlobalCompositeOperation => (kind === 'water' ? 'multiply' : 'source-over');
  const laneOf = (p: P): BrushKind => (p.y < 86 ? 'crayon' : p.y < SLATE.y ? 'water' : 'chalk');
  return {
    cursor: () => (kind === 'crayon' ? 'pencil' : 'brush'),
    color: () => color,
    begin(p) {
      kind = chosen === 'auto' ? laneOf(p) : chosen;
      const list = COLORS[kind];
      color = list[ci[kind]++ % list.length]!;
      if (kind === 'water') waterStamp = mkWaterStamp(color);
      clearLayer(cur);
      last = p;
      drawing = true;
      stamp(p, pt(p.x + 0.01, p.y));
    },
    drag(p) {
      if (!last || !drawing) return;
      if (dist(last, p) < 0.8) return;
      stamp(last, p);
      last = p;
    },
    end() {
      if (!drawing) return;
      drawing = false;
      composeTmp();
      base.g.save();
      base.g.setTransform(1, 0, 0, 1, 0, 0);
      base.g.globalCompositeOperation = blend();
      base.g.drawImage(tmp.c, 0, 0);
      base.g.restore();
      clearLayer(cur);
      last = null;
    },
    clear() {
      clearLayer(base);
      clearLayer(cur);
      drawing = false;
      ci.crayon = ci.water = ci.chalk = 0;
    },
    draw(g) {
      clipPaper(g, PAPER);
      // 칠판 띠
      g.fillStyle = '#7a5434';
      rrect(g, SLATE.x - 4, SLATE.y - 4, SLATE.w + 8, SLATE.h + 8, 3);
      g.fill();
      g.fillStyle = '#9a6e45';
      rrect(g, SLATE.x - 4, SLATE.y - 4, SLATE.w + 8, 2.5, 1.5);
      g.fill();
      const sg = g.createLinearGradient(0, SLATE.y, 0, SLATE.y + SLATE.h);
      sg.addColorStop(0, '#2c3d35');
      sg.addColorStop(1, '#1f2c26');
      g.fillStyle = sg;
      g.fillRect(SLATE.x, SLATE.y, SLATE.w, SLATE.h);
      g.fillStyle = 'rgba(255,255,255,0.035)';
      for (let i = 0; i < 5; i++) {
        g.beginPath();
        g.ellipse(SLATE.x + 40 + i * 70, SLATE.y + 30 + (i % 2) * 14, 34, 9, -0.15, 0, Math.PI * 2);
        g.fill();
      }
      g.drawImage(base.c, 0, 0, W, H);
      if (drawing) {
        composeTmp();
        g.save();
        g.globalCompositeOperation = blend();
        g.drawImage(tmp.c, 0, 0, W, H);
        g.restore();
      }
      g.font = `700 8.5px ${F}`;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      const lab = (y: number, txt: string, col: string): void => {
        g.fillStyle = col;
        g.fillText(txt, 24, y);
      };
      lab(36, '크레파스', '#9a7f62');
      lab(98, '수채 물감', '#9a7f62');
      lab(SLATE.y + 10, '분필', 'rgba(255,255,255,0.55)');
    },
    script(loop) {
      const ph = loop * 1.3;
      const wave = (y: number, amp: number, f: number, p: number, x0 = 72, x1 = 365): P[] => {
        const o: P[] = [];
        for (let x = x0; x <= x1; x += 3) o.push(pt(x, y + Math.sin(x * f + p) * amp));
        return o;
      };
      return [
        S(wave(56, 14, 0.045, ph), 260),
        S(wave(60, 10, 0.07, ph + 2, 90, 350), 280),
        S(wave(116, 12, 0.035, ph + 1), 220),
        S(wave(122, 14, 0.05, ph + 4, 100, 360), 220),
        S(wave(184, 12, 0.05, ph + 3, 70, 365), 260),
        S(wave(204, 9, 0.08, ph, 110, 340), 280),
        WAIT(1.6),
      ];
    },
    controls: [
      { type: 'button', label: '붓: 줄 따라 자동', on: () => (chosen = 'auto') },
      { type: 'button', label: '크레파스', on: () => (chosen = 'crayon') },
      { type: 'button', label: '수채', on: () => (chosen = 'water') },
      { type: 'button', label: '분필', on: () => (chosen = 'chalk') },
    ],
  };
}

// ═════════════════════════ i314 페인트 통 ═════════════════════════
function paintBucket(env: Env): Tool {
  const R = env.R;
  const lines = mkLayer(R, true);
  const colorL = mkLayer(R, true);
  const PW = lines.c.width;
  const PH = lines.c.height;
  const N = PW * PH;
  const colorImg = colorL.g.createImageData(PW, PH);
  const col32 = new Uint32Array(colorImg.data.buffer);
  let la = new Uint8Array(N);
  const visited = new Uint8Array(N);
  const queue = new Int32Array(N);
  const PALETTE = ['#e8564a', '#ffd166', '#9c6b43', '#7cc6f2', '#ffb627', '#58b368', '#8a5a3b', '#a6d785', '#cfeaff', '#f7a1c4', '#b18cf0'];
  let pi = 0;
  let anims: { order: Int32Array; n: number; done: number; edges: number[]; c32: number; speed: number }[] = [];
  let ripples: { p: P; t: number; c: string }[] = [];
  let downP: P | null = null;
  let path: P[] = [];
  let moved = false;
  let dirty = false;
  const toC32 = (hex: string): number => {
    const v = parseInt(hex.slice(1), 16);
    return ((255 << 24) | ((v & 255) << 16) | (((v >> 8) & 255) << 8) | ((v >> 16) & 255)) >>> 0;
  };
  function wob(pts: P[], close: boolean, seed: number): void {
    const g = lines.g;
    const q = shaky(pts, 0.7, seed);
    smoothPath(g, q, close);
    g.stroke();
  }
  function art(): void {
    clearLayer(lines);
    const g = lines.g;
    g.strokeStyle = '#2b2b33';
    g.lineWidth = 2.4;
    g.strokeRect(22, 24, 356, 204);
    const rect = (x0: number, y0: number, x1: number, y1: number, s: number): void => {
      wob(resampleStep([pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1), pt(x0, y0)], 6), false, s);
    };
    // 땅
    g.beginPath();
    g.moveTo(22, 206);
    g.quadraticCurveTo(46, 200, 72, 205);
    g.stroke();
    g.beginPath();
    g.moveTo(168, 205);
    g.quadraticCurveTo(270, 190, 378, 203);
    g.stroke();
    // 집
    rect(72, 122, 168, 205, 3);
    wob(resampleStep([pt(60, 123), pt(120, 72), pt(180, 123), pt(60, 123)], 6), false, 4);
    rect(104, 160, 130, 205, 5);
    rect(140, 134, 162, 156, 6);
    g.beginPath();
    g.moveTo(151, 134);
    g.lineTo(151, 156);
    g.moveTo(140, 145);
    g.lineTo(162, 145);
    g.stroke();
    rect(80, 136, 97, 153, 7);
    // 해
    wob(arcPts(322, 64, 22, 22, 0, 360, 36), true, 8);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      g.beginPath();
      g.moveTo(322 + Math.cos(a) * 29, 64 + Math.sin(a) * 29);
      g.lineTo(322 + Math.cos(a) * 37, 64 + Math.sin(a) * 37);
      g.stroke();
    }
    // 나무
    const crown: P[] = [];
    for (let i = 0; i <= 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const rr = 30 + 4 * Math.abs(Math.sin(a * 3.5));
      crown.push(pt(253 + Math.cos(a) * rr * 1.05, 118 + Math.sin(a) * rr));
    }
    smoothPath(g, crown, true);
    g.stroke();
    g.beginPath();
    g.moveTo(246, 146);
    g.lineTo(245, 200);
    g.moveTo(261, 146);
    g.lineTo(262, 199);
    g.stroke();
    // 구름
    const cloud: P[] = [];
    for (let i = 0; i <= 50; i++) {
      const a = (i / 50) * Math.PI * 2;
      const rr = 1 + 0.18 * Math.abs(Math.sin(a * 2.5));
      cloud.push(pt(190 + Math.cos(a) * 34 * rr, 52 + Math.sin(a) * 15 * rr));
    }
    smoothPath(g, cloud, true);
    g.stroke();
    // 새
    g.lineWidth = 1.8;
    for (const [bx, by] of [
      [60, 60],
      [84, 48],
    ] as [number, number][]) {
      g.beginPath();
      g.moveTo(bx - 7, by - 3);
      g.quadraticCurveTo(bx - 3, by - 5, bx, by);
      g.quadraticCurveTo(bx + 3, by - 5, bx + 7, by - 3);
      g.stroke();
    }
    refreshLines();
  }
  function refreshLines(): void {
    const d = lines.g.getImageData(0, 0, PW, PH).data;
    if (la.length !== N) la = new Uint8Array(N);
    for (let i = 0; i < N; i++) la[i] = d[i * 4 + 3]!;
  }
  function fillAt(p: P, hex: string): void {
    const x = Math.floor(p.x * R);
    const y = Math.floor(p.y * R);
    if (x < 0 || y < 0 || x >= PW || y >= PH) return;
    const s = y * PW + x;
    if (la[s]! > 100) return;
    const c32 = toC32(hex);
    const seed = col32[s]!;
    if (seed === c32) return;
    visited.fill(0);
    let head = 0;
    let tail = 0;
    queue[tail++] = s;
    visited[s] = 1;
    const edges: number[] = [];
    while (head < tail) {
      const i = queue[head++]!;
      const ix = i % PW;
      const nb = [ix > 0 ? i - 1 : -1, ix < PW - 1 ? i + 1 : -1, i - PW, i + PW];
      for (const j of nb) {
        if (j < 0 || j >= N || visited[j]) continue;
        visited[j] = 1;
        if (la[j]! > 100) {
          edges.push(j);
          continue;
        }
        if (col32[j] !== seed) continue;
        queue[tail++] = j;
      }
    }
    // 바깥(종이 밖)으로 새면 무시
    const order = queue.slice(0, tail);
    anims.push({ order, n: tail, done: 0, edges, c32, speed: Math.max(tail / 0.55, 30000) });
    ripples.push({ p, t: 0, c: hex });
  }
  return {
    rings: true,
    cursor: () => (moved ? 'pencil' : 'bucket'),
    color: () => PALETTE[pi % PALETTE.length]!,
    begin(p) {
      downP = p;
      path = [p];
      moved = false;
    },
    drag(p) {
      if (!downP) return;
      path.push(p);
      if (!moved && dist(p, downP) > 4) moved = true;
      if (moved) {
        const g = lines.g;
        g.strokeStyle = '#2b2b33';
        g.lineWidth = 2.2;
        const a = path[path.length - 2]!;
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.lineTo(p.x, p.y);
        g.stroke();
        dirty = true;
      }
    },
    end() {
      if (!downP) return;
      if (moved) {
        if (dirty) refreshLines();
        dirty = false;
      } else {
        fillAt(downP, PALETTE[pi % PALETTE.length]!);
        pi++;
      }
      downP = null;
      moved = false;
    },
    step(dt) {
      let changed = false;
      for (const a of anims) {
        const to = Math.min(a.n, Math.floor(a.done + a.speed * dt));
        for (let k = Math.floor(a.done); k < to; k++) col32[a.order[k]!] = a.c32;
        a.done = to;
        if (a.done >= a.n) for (const e of a.edges) col32[e] = a.c32;
        changed = true;
      }
      anims = anims.filter((a) => a.done < a.n);
      if (changed) colorL.g.putImageData(colorImg, 0, 0);
      for (const rp of ripples) rp.t += dt;
      ripples = ripples.filter((q) => q.t < 0.7);
    },
    clear() {
      col32.fill(0);
      colorL.g.putImageData(colorImg, 0, 0);
      anims = [];
      ripples = [];
      pi = 0;
      art();
    },
    draw(g) {
      g.drawImage(colorL.c, 0, 0, W, H);
      g.drawImage(lines.c, 0, 0, W, H);
      for (const rp of ripples) {
        const u = rp.t / 0.7;
        g.strokeStyle = rp.c;
        g.globalAlpha = (1 - u) * 0.9;
        g.lineWidth = 2.2 * (1 - u) + 0.4;
        g.beginPath();
        g.arc(rp.p.x, rp.p.y, 4 + u * 22, 0, Math.PI * 2);
        g.stroke();
      }
      g.globalAlpha = 1;
      // 물감 접시
      const cur = PALETTE[pi % PALETTE.length]!;
      g.fillStyle = 'rgba(255,255,255,0.9)';
      rrect(g, 330, 210, 44, 14, 7);
      g.fill();
      for (let i = 0; i < 4; i++) {
        g.fillStyle = PALETTE[(pi + i) % PALETTE.length]!;
        g.beginPath();
        g.arc(338 + i * 9.5, 217, i ? 3 : 4.4, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = cur;
      g.lineWidth = 0.8;
    },
    script() {
      const order: [number, number, number][] = [
        [118, 108, 0],
        [88, 180, 1],
        [116, 186, 2],
        [145, 139, 3],
        [157, 150, 3],
        [88, 145, 3],
        [322, 64, 4],
        [253, 112, 5],
        [253, 180, 6],
        [200, 222, 7],
        [50, 100, 8],
      ];
      const acts: Act[] = [WAIT(0.3)];
      for (const [x, y, c] of order) acts.push(DO(() => (pi = c)), TAP(x, y), WAIT(0.3));
      acts.push(WAIT(1.6));
      return acts;
    },
    controls: [{ type: 'button', label: '색 바꾸기', on: () => pi++ }],
  };
}

// ═════════════════════════ i315 도형 알아보기 ═════════════════════════
type Shape = { kind: string; pts: P[]; score: number };
function rdp(p: P[], eps: number): P[] {
  if (p.length < 3) return p.slice();
  const a = p[0]!;
  const b = p[p.length - 1]!;
  let md = -1;
  let mi = 0;
  const L = dist(a, b) || 1e-6;
  for (let i = 1; i < p.length - 1; i++) {
    const q = p[i]!;
    const d = Math.abs((b.x - a.x) * (a.y - q.y) - (a.x - q.x) * (b.y - a.y)) / L;
    if (d > md) {
      md = d;
      mi = i;
    }
  }
  if (md > eps) {
    const l = rdp(p.slice(0, mi + 1), eps);
    const r = rdp(p.slice(mi), eps);
    return l.slice(0, -1).concat(r);
  }
  return [a, b];
}
function nearestOnSeg(q: P, a: P, b: P): P {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy || 1e-6;
  const u = clamp(((q.x - a.x) * dx + (q.y - a.y) * dy) / L2, 0, 1);
  return pt(a.x + dx * u, a.y + dy * u);
}
function nearestOnPoly(q: P, v: P[]): P {
  let best = v[0]!;
  let bd = Infinity;
  for (let i = 0; i < v.length; i++) {
    const c = nearestOnSeg(q, v[i]!, v[(i + 1) % v.length]!);
    const d = dist(c, q);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}
function recognize(raw: P[]): Shape {
  const r = resampleN(raw, 64);
  const L = pathLen(r);
  let minx = Infinity;
  let miny = Infinity;
  let maxx = -Infinity;
  let maxy = -Infinity;
  for (const q of r) {
    minx = Math.min(minx, q.x);
    maxx = Math.max(maxx, q.x);
    miny = Math.min(miny, q.y);
    maxy = Math.max(maxy, q.y);
  }
  const bw = maxx - minx;
  const bh = maxy - miny;
  const diag = Math.hypot(bw, bh) || 1;
  const closed = dist(r[0]!, r[r.length - 1]!) < Math.max(0.22 * L, 0) && L > 30;
  const conf = (dev: number): number => clamp(1 - dev / (diag * 0.12), 0.55, 0.99);
  if (!closed) {
    const a = r[0]!;
    const b = r[r.length - 1]!;
    if (dist(a, b) / (L || 1) > 0.9) {
      let dev = 0;
      for (const q of r) dev += dist(q, nearestOnSeg(q, a, b));
      return { kind: '직선', pts: [a, b], score: conf(dev / r.length) };
    }
    return { kind: '자유 곡선', pts: r, score: 0 };
  }
  // 닫힌 모양 — 꼭짓점 세기 (가장 먼 점에서 나눠 RDP)
  let cx = 0;
  let cy = 0;
  const ring = r.slice(0, -1);
  for (const q of ring) {
    cx += q.x;
    cy += q.y;
  }
  cx /= ring.length;
  cy /= ring.length;
  let fi = 0;
  let fd = -1;
  ring.forEach((q, i) => {
    const d = Math.hypot(q.x - cx, q.y - cy);
    if (d > fd) {
      fd = d;
      fi = i;
    }
  });
  const rot = ring.slice(fi).concat(ring.slice(0, fi));
  let fj = 0;
  let fjd = -1;
  rot.forEach((q, i) => {
    const d = dist(q, rot[0]!);
    if (d > fjd) {
      fjd = d;
      fj = i;
    }
  });
  const eps = diag * 0.085;
  const h1 = rdp(rot.slice(0, fj + 1), eps);
  const h2 = rdp(rot.slice(fj).concat([rot[0]!]), eps);
  let verts = h1.slice(0, -1).concat(h2.slice(0, -1));
  // 거의 곧은 꼭짓점 빼기
  for (let pass = 0; pass < 3 && verts.length > 3; pass++) {
    const keep: P[] = [];
    for (let i = 0; i < verts.length; i++) {
      const a = verts[(i - 1 + verts.length) % verts.length]!;
      const b = verts[i]!;
      const c = verts[(i + 1) % verts.length]!;
      const a1 = Math.atan2(b.y - a.y, b.x - a.x);
      const a2 = Math.atan2(c.y - b.y, c.x - b.x);
      let d = Math.abs(a2 - a1);
      if (d > Math.PI) d = Math.PI * 2 - d;
      if (d > 0.42 && dist(a, b) > diag * 0.08) keep.push(b);
    }
    if (keep.length === verts.length || keep.length < 3) break;
    verts = keep;
  }
  // 타원 맞춤 (상자 기준)
  const ex = (minx + maxx) / 2;
  const ey = (miny + maxy) / 2;
  const ax = bw / 2 || 1;
  const ay = bh / 2 || 1;
  let m = 0;
  let m2 = 0;
  for (const q of ring) {
    const v = Math.hypot((q.x - ex) / ax, (q.y - ey) / ay);
    m += v;
    m2 += v * v;
  }
  m /= ring.length;
  const cv = Math.sqrt(Math.max(0, m2 / ring.length - m * m)) / m;
  if ((cv < 0.075 && verts.length >= 4) || verts.length >= 6) {
    const ratio = ax / ay;
    const isCircle = ratio > 0.8 && ratio < 1.25;
    const rx = isCircle ? (ax + ay) / 2 : ax;
    const ry = isCircle ? rx : ay;
    const ps = arcPts(ex, ey, rx, ry, 0, 360, 72).slice(0, -1);
    return { kind: isCircle ? '원' : '타원', pts: ps, score: clamp(1 - cv * 3.2, 0.6, 0.99) };
  }
  let dev = 0;
  for (const q of ring) dev += dist(q, nearestOnPoly(q, verts));
  dev /= ring.length;
  if (verts.length === 3) return { kind: '삼각형', pts: verts, score: conf(dev) };
  if (verts.length === 4) {
    // 주축 방향의 직사각형으로 반듯하게
    const e = verts[1]!;
    const s0 = verts[0]!;
    let ang = Math.atan2(e.y - s0.y, e.x - s0.x);
    const q90 = Math.round(ang / (Math.PI / 2)) * (Math.PI / 2);
    if (Math.abs(ang - q90) < 0.16) ang = q90;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    let u0 = Infinity;
    let u1 = -Infinity;
    let v0 = Infinity;
    let v1 = -Infinity;
    for (const q of ring) {
      const u = (q.x - cx) * c + (q.y - cy) * s;
      const v = -(q.x - cx) * s + (q.y - cy) * c;
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
      v0 = Math.min(v0, v);
      v1 = Math.max(v1, v);
    }
    const sh = 0.06;
    const du = (u1 - u0) * sh;
    const dv = (v1 - v0) * sh;
    u0 += du;
    u1 -= du;
    v0 += dv;
    v1 -= dv;
    const P4 = [pt(u0, v0), pt(u1, v0), pt(u1, v1), pt(u0, v1)].map((q) => pt(cx + q.x * c - q.y * s, cy + q.x * s + q.y * c));
    const sq = Math.abs(u1 - u0) / Math.abs(v1 - v0);
    return { kind: sq > 0.88 && sq < 1.14 ? '정사각형' : '직사각형', pts: P4, score: conf(dev) };
  }
  return { kind: `${verts.length}각형`, pts: verts, score: conf(dev) };
}
function shapeRecog(): Tool {
  type Item = { raw: P[]; shape: Shape | null; from: P[]; to: P[]; t: number };
  let items: Item[] = [];
  let cur: P[] | null = null;
  function finish(raw: P[]): void {
    if (raw.length < 4 || pathLen(raw) < 14) {
      items.push({ raw, shape: null, from: [], to: [], t: 9 });
      return;
    }
    const sh = recognize(raw);
    const from = resampleN(raw, 80);
    const closed = sh.kind !== '직선' && sh.kind !== '자유 곡선';
    const to = sh.kind === '자유 곡선' ? from : from.map((q) => (closed ? nearestOnPoly(q, sh.pts) : nearestOnSeg(q, sh.pts[0]!, sh.pts[1]!)));
    items.push({ raw, shape: sh, from, to, t: 0 });
    if (items.length > 7) items.shift();
  }
  return {
    cursor: () => 'pencil',
    color: () => '#3b3b44',
    begin(p) {
      cur = [p];
    },
    drag(p) {
      if (cur && dist(cur[cur.length - 1]!, p) > 0.6) cur.push(p);
    },
    end() {
      if (cur) finish(cur);
      cur = null;
    },
    step(dt) {
      for (const it of items) it.t += dt;
    },
    clear() {
      items = [];
      cur = null;
    },
    draw(g) {
      clipPaper(g, PAPER);
      for (const it of items) {
        const sh = it.shape;
        if (!sh || sh.kind === '자유 곡선') {
          g.strokeStyle = '#4a4a55';
          g.lineWidth = 1.6;
          smoothPath(g, it.raw);
          g.stroke();
          if (sh && it.t < 1.5) {
            const c = it.raw[it.raw.length - 1]!;
            g.globalAlpha = 1 - it.t / 1.5;
            pill(g, c.x, c.y - 10, '모양 없음 — 그대로 둠', 7, 'rgba(60,60,70,0.85)', '#fff');
            g.globalAlpha = 1;
          }
          continue;
        }
        const hold = 0.28;
        const u = clamp((it.t - hold) / 0.38, 0, 1);
        const closed = sh.kind !== '직선';
        if (it.t < hold + 0.38) {
          // 손그림 → 반듯한 모양으로 착
          g.strokeStyle = 'rgba(74,74,85,0.35)';
          g.lineWidth = 1.4;
          smoothPath(g, it.raw);
          g.stroke();
          const k = easeBack(u);
          const m = it.from.map((q, i) => lerpP(q, it.to[i]!, k));
          g.strokeStyle = u > 0 ? '#2f6fe0' : '#4a4a55';
          g.lineWidth = 1.8;
          poly(g, m);
          g.stroke();
          continue;
        }
        const pop = clamp((it.t - hold - 0.38) / 0.25, 0, 1);
        g.fillStyle = 'rgba(47,111,224,0.12)';
        g.strokeStyle = '#2f6fe0';
        g.lineWidth = 2.2;
        poly(g, sh.pts, closed);
        if (closed) g.fill();
        g.stroke();
        if (sh.kind !== '원' && sh.kind !== '타원') {
          g.fillStyle = '#fff';
          for (const v of sh.pts) {
            g.beginPath();
            g.arc(v.x, v.y, 2, 0, Math.PI * 2);
            g.fill();
            g.stroke();
          }
        }
        // 이름표
        let minY = Infinity;
        let sx = 0;
        for (const q of sh.pts) {
          minY = Math.min(minY, q.y);
          sx += q.x;
        }
        sx /= sh.pts.length;
        g.save();
        g.globalAlpha = pop;
        g.translate(sx, minY - 11);
        g.scale(0.7 + 0.3 * easeBack(pop), 0.7 + 0.3 * easeBack(pop));
        pill(g, 0, 0, `${sh.kind} ✓ ${Math.round(sh.score * 100)}%`, 8, '#2f6fe0', '#fff');
        g.restore();
      }
      if (cur && cur.length > 1) {
        g.strokeStyle = '#4a4a55';
        g.lineWidth = 1.6;
        smoothPath(g, cur);
        g.stroke();
      }
    },
    script(loop) {
      const r = rng(loop * 13 + 2);
      const circle = (cx: number, cy: number, rr: number): P[] => {
        const a0 = r() * 360;
        return arcPts(cx, cy, rr * (1 + (r() - 0.5) * 0.12), rr * (1 + (r() - 0.5) * 0.12), a0, a0 + 372, 60);
      };
      const polyPts = (v: P[]): P[] => {
        const o: P[] = [];
        const vv = v.concat([v[0]!, lerpP(v[0]!, v[1]!, 0.12)]);
        for (let i = 0; i < vv.length - 1; i++) o.push(...resampleStep([vv[i]!, vv[i + 1]!], 3).slice(0, -1));
        o.push(vv[vv.length - 1]!);
        return o;
      };
      const tri = polyPts([pt(205, 84), pt(250, 168), pt(158, 162)]);
      const rect = polyPts([pt(282, 100), pt(370, 104), pt(367, 160), pt(284, 156)]);
      const shapes = [circle(88, 128, 44), tri, rect];
      const order = loop % 2 ? [2, 0, 1] : [0, 1, 2];
      const acts: Act[] = [WAIT(0.2)];
      for (const i of order) acts.push(S(shaky(shapes[i]!, 2.6, loop * 3 + i), 230), WAIT(0.75));
      acts.push(S(shaky(resampleStep([pt(60, 205), pt(340, 210)], 4), 1.6, loop), 300), WAIT(1.8));
      return acts;
    },
  };
}

// ═════════════════════════ i316 숫자 손글씨 ═════════════════════════
type Strokes = P[][];
function digitVariants(): Strokes[][] {
  const A = arcPts;
  const L = (...a: number[]): P[] => {
    const o: P[] = [];
    for (let i = 0; i < a.length; i += 2) o.push(pt(a[i]!, a[i + 1]!));
    return o;
  };
  return [
    [[A(0.5, 0.5, 0.3, 0.45, 270, -95, 40)], [A(0.5, 0.5, 0.26, 0.45, 260, -100, 40)]],
    [[L(0.36, 0.2, 0.55, 0.05, 0.55, 0.95)], [L(0.5, 0.05, 0.5, 0.95)], [L(0.36, 0.2, 0.55, 0.05, 0.55, 0.95), L(0.38, 0.95, 0.72, 0.95)]],
    [[A(0.5, 0.3, 0.28, 0.25, 195, 380, 20).concat(L(0.2, 0.95, 0.84, 0.95))], [A(0.5, 0.28, 0.27, 0.23, 190, 370, 20).concat(A(0.6, 0.98, 0.5, 0.45, 280, 220, 8).slice(1), L(0.86, 0.94))]],
    [[A(0.48, 0.27, 0.24, 0.22, 200, 450, 24).concat(A(0.48, 0.72, 0.27, 0.23, 270, 520, 24))]],
    [[L(0.64, 0.95, 0.64, 0.05, 0.13, 0.68, 0.88, 0.68)], [L(0.3, 0.05, 0.2, 0.6, 0.84, 0.6), L(0.66, 0.28, 0.66, 0.95)]],
    [[L(0.76, 0.06, 0.32, 0.06, 0.28, 0.45).concat(A(0.5, 0.68, 0.27, 0.27, 235, 500, 24))], [L(0.32, 0.06, 0.28, 0.45).concat(A(0.5, 0.68, 0.27, 0.27, 235, 500, 24)), L(0.32, 0.06, 0.78, 0.06)]],
    [[L(0.7, 0.05, 0.45, 0.22, 0.28, 0.55).concat(A(0.5, 0.72, 0.23, 0.23, 180, 540, 30))]],
    [[L(0.18, 0.06, 0.82, 0.06, 0.4, 0.95)], [L(0.18, 0.06, 0.82, 0.06, 0.4, 0.95), L(0.32, 0.52, 0.74, 0.52)], [L(0.18, 0.16, 0.18, 0.06, 0.82, 0.06, 0.45, 0.95)]],
    [[A(0.5, 0.27, 0.21, 0.21, 90, 450, 26), A(0.5, 0.71, 0.26, 0.24, 270, 630, 30)]],
    [[A(0.5, 0.3, 0.25, 0.25, 0, -360, 30).concat(L(0.74, 0.3, 0.72, 0.95))], [A(0.5, 0.3, 0.25, 0.25, 0, -360, 30).concat(A(0.42, 0.3, 0.33, 0.65, 0, 100, 10).slice(1))]],
  ];
}
function rasterize(st: Strokes, out: Float32Array, g28: G): void {
  let minx = Infinity;
  let miny = Infinity;
  let maxx = -Infinity;
  let maxy = -Infinity;
  for (const s of st)
    for (const q of s) {
      minx = Math.min(minx, q.x);
      maxx = Math.max(maxx, q.x);
      miny = Math.min(miny, q.y);
      maxy = Math.max(maxy, q.y);
    }
  const bw = maxx - minx;
  const bh = maxy - miny;
  const sc = 20 / Math.max(bw, bh, 1e-3);
  const cx = (minx + maxx) / 2;
  const cy = (miny + maxy) / 2;
  g28.setTransform(1, 0, 0, 1, 0, 0);
  g28.clearRect(0, 0, 28, 28);
  g28.strokeStyle = '#000';
  g28.fillStyle = '#000';
  g28.lineWidth = 2.3;
  g28.lineCap = 'round';
  g28.lineJoin = 'round';
  for (const s of st) {
    g28.beginPath();
    s.forEach((q, i) => {
      const x = 14 + (q.x - cx) * sc;
      const y = 14 + (q.y - cy) * sc;
      if (i) g28.lineTo(x, y);
      else g28.moveTo(x, y);
    });
    if (s.length === 1) g28.lineTo(14 + (s[0]!.x - cx) * sc + 0.1, 14 + (s[0]!.y - cy) * sc);
    g28.stroke();
  }
  const d = g28.getImageData(0, 0, 28, 28).data;
  for (let i = 0; i < 784; i++) out[i] = d[i * 4 + 3]! / 255;
}
function distField(gray: Float32Array): Float32Array {
  const D = new Float32Array(784);
  for (let i = 0; i < 784; i++) D[i] = gray[i]! > 0.3 ? 0 : 99;
  const at = (x: number, y: number): number => (x < 0 || y < 0 || x > 27 || y > 27 ? 99 : D[y * 28 + x]!);
  for (let y = 0; y < 28; y++)
    for (let x = 0; x < 28; x++) {
      const i = y * 28 + x;
      D[i] = Math.min(D[i]!, at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.414, at(x + 1, y - 1) + 1.414);
    }
  for (let y = 27; y >= 0; y--)
    for (let x = 27; x >= 0; x--) {
      const i = y * 28 + x;
      D[i] = Math.min(D[i]!, at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.414, at(x - 1, y + 1) + 1.414);
    }
  return D;
}
function chamfer(gu: Float32Array, du: Float32Array, gt: Float32Array, dt: Float32Array): number {
  let a = 0;
  let na = 0;
  let b = 0;
  let nb = 0;
  for (let i = 0; i < 784; i++) {
    if (gu[i]! > 0.3) {
      a += dt[i]!;
      na++;
    }
    if (gt[i]! > 0.3) {
      b += du[i]!;
      nb++;
    }
  }
  return a / Math.max(1, na) + b / Math.max(1, nb);
}
let TEMPLATES: { digit: number; gray: Float32Array; df: Float32Array }[] | null = null;
function getTemplates(g28: G): { digit: number; gray: Float32Array; df: Float32Array }[] {
  if (TEMPLATES) return TEMPLATES;
  const out: { digit: number; gray: Float32Array; df: Float32Array }[] = [];
  digitVariants().forEach((vs, d) =>
    vs.forEach((st) => {
      for (const sl of [-0.12, 0, 0.12]) {
        const sk = st.map((s) => s.map((q) => pt(q.x * 0.62 + (0.5 - q.y) * sl, q.y)));
        const gray = new Float32Array(784);
        rasterize(sk, gray, g28);
        out.push({ digit: d, gray, df: distField(gray) });
      }
    }),
  );
  TEMPLATES = out;
  return out;
}
function digitRecog(): Tool {
  const c28 = document.createElement('canvas');
  c28.width = c28.height = 28;
  const g28 = c28.getContext('2d', { willReadFrequently: true })!;
  const tpls = getTemplates(g28);
  const BOX: Rect = { x: 36, y: 34, w: 150, h: 188 };
  let strokes: Strokes = [];
  let cur: P[] | null = null;
  let wait = -1;
  let result: { d: number; probs: number[]; t: number } | null = null;
  const gray = new Float32Array(784);
  let hasGray = false;
  let showGrid = true;
  function classify(): void {
    if (!strokes.length) return;
    rasterize(strokes, gray, g28);
    hasGray = true;
    const df = distField(gray);
    const best = new Array(10).fill(99) as number[];
    for (const t of tpls) best[t.digit] = Math.min(best[t.digit]!, chamfer(gray, df, t.gray, t.df));
    const ex = best.map((s) => Math.exp(-s * 5));
    const sum = ex.reduce((a, b) => a + b, 0) || 1;
    const probs = ex.map((v) => v / sum);
    let d = 0;
    probs.forEach((p, i) => {
      if (p > probs[d]!) d = i;
    });
    result = { d, probs, t: 0 };
  }
  return {
    cursor: () => 'pencil',
    color: () => '#1d2747',
    begin(p) {
      if (result) {
        strokes = [];
        result = null;
        hasGray = false;
      }
      cur = [p];
      strokes.push(cur);
      wait = -1;
    },
    drag(p) {
      if (cur && dist(cur[cur.length - 1]!, p) > 0.6) cur.push(p);
    },
    end() {
      cur = null;
      wait = 0.65;
    },
    step(dt) {
      if (wait > 0) {
        wait -= dt;
        if (wait <= 0) classify();
      }
      if (result) result.t += dt;
    },
    clear() {
      strokes = [];
      cur = null;
      result = null;
      hasGray = false;
      wait = -1;
    },
    draw(g) {
      clipPaper(g, PAPER);
      // 쓰는 칸
      g.setLineDash([4, 3]);
      g.strokeStyle = 'rgba(47,111,224,0.45)';
      g.lineWidth = 1;
      rrect(g, BOX.x, BOX.y, BOX.w, BOX.h, 8);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = 'rgba(47,111,224,0.55)';
      g.font = `600 8px ${F}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('숫자 하나를 쓰세요 (0 ~ 9)', BOX.x + BOX.w / 2, BOX.y + BOX.h + 7);
      g.strokeStyle = '#1d2747';
      g.lineWidth = 7;
      for (const s of strokes) {
        if (s.length === 1) {
          g.beginPath();
          g.arc(s[0]!.x, s[0]!.y, 3, 0, Math.PI * 2);
          g.fillStyle = '#1d2747';
          g.fill();
          continue;
        }
        smoothPath(g, s);
        g.stroke();
      }
      // 28×28 격자
      const gx = 206;
      const gy = 36;
      const cs = 3.1;
      g.fillStyle = '#fff';
      g.fillRect(gx - 2, gy - 2, cs * 28 + 4, cs * 28 + 4);
      if (hasGray) {
        for (let i = 0; i < 784; i++) {
          const v = gray[i]!;
          if (v < 0.04) continue;
          g.fillStyle = `rgba(29,39,71,${v})`;
          g.fillRect(gx + (i % 28) * cs, gy + Math.floor(i / 28) * cs, cs, cs);
        }
      }
      if (showGrid) {
        g.strokeStyle = 'rgba(29,39,71,0.12)';
        g.lineWidth = 0.3;
        g.beginPath();
        for (let k = 0; k <= 28; k++) {
          g.moveTo(gx + k * cs, gy);
          g.lineTo(gx + k * cs, gy + 28 * cs);
          g.moveTo(gx, gy + k * cs);
          g.lineTo(gx + 28 * cs, gy + k * cs);
        }
        g.stroke();
      }
      g.strokeStyle = 'rgba(29,39,71,0.5)';
      g.lineWidth = 0.8;
      g.strokeRect(gx, gy, cs * 28, cs * 28);
      g.fillStyle = '#7a6f62';
      g.font = `700 7.5px ${F}`;
      g.fillText('28 × 28 로 줄임', gx + cs * 14, gy + cs * 28 + 8);
      // 결과
      const rx = 342;
      if (result) {
        const k = easeBack(clamp(result.t / 0.35, 0, 1));
        g.save();
        g.translate(rx, 78);
        g.scale(k, k);
        g.fillStyle = '#2f6fe0';
        g.beginPath();
        g.arc(0, 0, 30, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#fff';
        g.font = `800 40px ${F}`;
        g.fillText(String(result.d), 0, 2);
        g.restore();
        pill(g, rx, 122, `${result.d} — ${Math.round(Math.min(0.99, result.probs[result.d]!) * 100)}%`, 9, '#1d2747', '#fff');
      } else {
        g.strokeStyle = 'rgba(29,39,71,0.25)';
        g.setLineDash([3, 3]);
        g.lineWidth = 1.2;
        g.beginPath();
        g.arc(rx, 78, 30, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = 'rgba(29,39,71,0.35)';
        g.font = `800 28px ${F}`;
        g.fillText(strokes.length ? '…' : '?', rx, 80);
      }
      // 0 ~ 9 막대
      const bx = 206;
      const by = 206;
      for (let d = 0; d < 10; d++) {
        const p = result ? result.probs[d]! * clamp(result.t / 0.4, 0, 1) : 0;
        const x = bx + d * 17;
        g.fillStyle = 'rgba(29,39,71,0.08)';
        g.fillRect(x, by - 52, 12, 52);
        g.fillStyle = result && d === result.d ? '#2f6fe0' : '#9aa6c0';
        g.fillRect(x, by - 52 * p, 12, 52 * p);
        g.fillStyle = '#4a4a55';
        g.font = `700 7.5px ${F}`;
        g.fillText(String(d), x + 6, by + 7);
      }
    },
    script(loop) {
      const vs = digitVariants();
      const r = rng(loop * 7 + 1);
      const pick = [7, 3, 2, 8, 4, 0, 5, 9, 6, 1];
      const acts: Act[] = [];
      for (let k = 0; k < 3; k++) {
        const d = pick[(loop * 3 + k) % 10]!;
        const v = vs[d]!;
        const st = v[Math.floor(r() * v.length)]!;
        const slant = (r() - 0.5) * 0.25;
        const sx = 92 + (r() - 0.5) * 10;
        const sy = 38 + r() * 6;
        const sz = 150 + r() * 20;
        st.forEach((s) => {
          const pts = s.map((q) => pt(BOX.x + BOX.w / 2 + (q.x - 0.5) * sz * 0.62 + (0.5 - q.y) * slant * sz + (sx - 92), sy + q.y * sz * 0.98));
          acts.push(S(shaky(resampleStep(pts, 3), 1.6, loop * 11 + k), 260, 2.5), WAIT(0.08));
        });
        acts.push(WAIT(1.7));
      }
      return acts;
    },
    controls: [{ type: 'toggle', label: '28×28 격자선', value: true, on: (v) => (showGrid = v) }],
  };
}

// ═════════════════════════ i317 되돌리기 · 다시 하기 ═════════════════════════
function undoRedo(env: Env): Tool {
  type Cmd = { kind: 'pen' | 'erase'; pts: P[]; color: string; n: number };
  const paper: Rect = { x: 14, y: 16, w: 278, h: 220 };
  const layer = mkLayer(env.R);
  let stack: Cmd[] = [];
  let idx = 0;
  let cur: Cmd | null = null;
  let erase = false;
  let counter = 0;
  let dropped: { c: Cmd; t: number; slot: number }[] = [];
  let flash: { which: 'u' | 'r'; t: number } | null = null;
  const COLORS = ['#1d2747', '#e2483a', '#2f6fe0', '#36a85a', '#f29a16'];
  const BU = pt(326, 40);
  const BR = pt(366, 40);
  function drawCmd(g: G, c: Cmd, from = 1): void {
    g.save();
    clipPaper(g, paper);
    if (c.kind === 'erase') {
      g.globalCompositeOperation = 'destination-out';
      g.lineWidth = 15;
      g.strokeStyle = '#000';
    } else {
      g.lineWidth = 3.2;
      g.strokeStyle = c.color;
    }
    g.beginPath();
    const s = Math.max(0, from - 1);
    g.moveTo(c.pts[s]!.x, c.pts[s]!.y);
    for (let i = s + 1; i < c.pts.length; i++) g.lineTo(c.pts[i]!.x, c.pts[i]!.y);
    if (c.pts.length === 1) g.lineTo(c.pts[0]!.x + 0.01, c.pts[0]!.y);
    g.stroke();
    g.restore();
  }
  function rebuild(): void {
    clearLayer(layer);
    for (let i = 0; i < idx; i++) drawCmd(layer.g, stack[i]!);
  }
  const undo = (): void => {
    if (idx > 0) {
      idx--;
      rebuild();
    }
    flash = { which: 'u', t: 0 };
  };
  const redo = (): void => {
    if (idx < stack.length) {
      idx++;
      rebuild();
    }
    flash = { which: 'r', t: 0 };
  };
  return {
    paper,
    cursor: () => (erase ? 'eraser' : 'pencil'),
    color: () => COLORS[counter % COLORS.length]!,
    begin(p) {
      if (dist(p, BU) < 14) return undo();
      if (dist(p, BR) < 14) return redo();
      if (p.x > paper.x + paper.w) return;
      // 새 명령 → 다시 하기 갈래 잘림
      if (idx < stack.length) {
        stack.slice(idx).forEach((c, k) => dropped.push({ c, t: 0, slot: idx + k }));
        stack = stack.slice(0, idx);
      }
      counter++;
      cur = { kind: erase ? 'erase' : 'pen', pts: [p], color: COLORS[(counter - 1) % COLORS.length]!, n: counter };
      stack.push(cur);
      idx = stack.length;
      drawCmd(layer.g, cur);
    },
    drag(p) {
      if (!cur) return;
      if (dist(cur.pts[cur.pts.length - 1]!, p) < 0.6) return;
      cur.pts.push(p);
      drawCmd(layer.g, cur, cur.pts.length - 1);
    },
    end() {
      cur = null;
    },
    step(dt) {
      for (const d of dropped) d.t += dt;
      dropped = dropped.filter((d) => d.t < 1.4);
      if (flash) {
        flash.t += dt;
        if (flash.t > 0.4) flash = null;
      }
    },
    clear() {
      stack = [];
      idx = 0;
      counter = 0;
      cur = null;
      erase = false;
      dropped = [];
      clearLayer(layer);
    },
    draw(g) {
      g.drawImage(layer.c, 0, 0, W, H);
      // 기록 판
      const px = 300;
      g.fillStyle = 'rgba(16,20,30,0.88)';
      rrect(g, px, 16, 92, 220, 6);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.08)';
      g.lineWidth = 0.8;
      g.stroke();
      const btn = (c: P, label: string, active: boolean, fl: boolean): void => {
        g.fillStyle = fl ? '#ffd166' : active ? '#2f6fe0' : 'rgba(255,255,255,0.12)';
        g.beginPath();
        g.arc(c.x, c.y, fl ? 12.5 : 11, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = fl ? '#1d2747' : active ? '#fff' : 'rgba(255,255,255,0.35)';
        g.font = `800 13px ${F}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(label, c.x, c.y + 1);
      };
      btn(BU, '↶', idx > 0, flash?.which === 'u');
      btn(BR, '↷', idx < stack.length, flash?.which === 'r');
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.font = `700 7px ${F}`;
      g.fillText('되돌리기', BU.x, 59);
      g.fillText('다시', BR.x, 59);
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.fillRect(px + 8, 67, 76, 0.6);
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.font = `800 7.5px ${F}`;
      g.textAlign = 'left';
      g.fillText('명령 기록', px + 8, 76);
      const show = Math.max(0, stack.length - 8);
      const chip = (c: Cmd, slot: number, active: boolean, alpha: number, strike: boolean, slide = 0): void => {
        const y = 86 + (slot - show) * 17;
        if (y > 226) return;
        g.save();
        g.translate(slide, 0);
        g.globalAlpha = alpha;
        g.fillStyle = active ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.03)';
        rrect(g, px + 8, y, 76, 14, 4);
        g.fill();
        if (!active) {
          g.setLineDash([2, 2]);
          g.strokeStyle = 'rgba(255,255,255,0.3)';
          g.lineWidth = 0.6;
          g.stroke();
          g.setLineDash([]);
        }
        g.fillStyle = c.kind === 'erase' ? '#f4f1ec' : c.color;
        g.beginPath();
        g.arc(px + 16, y + 7, 3, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = active ? '#fff' : 'rgba(255,255,255,0.45)';
        g.font = `700 7px ${F}`;
        g.textAlign = 'left';
        g.fillText(c.kind === 'erase' ? `⌫ 지우개 ${c.n}` : `✎ 선 ${c.n}`, px + 23, y + 7.5);
        if (strike) {
          g.strokeStyle = '#ff7a6b';
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(px + 10, y + 7);
          g.lineTo(px + 82, y + 7);
          g.stroke();
        }
        g.restore();
      };
      for (const d of dropped) chip(d.c, d.slot + 1, false, 1 - d.t / 1.4, true, d.t * 30);
      stack.forEach((c, i) => chip(c, i, i < idx, 1, false));
      if (dropped.length) {
        const d = dropped[0]!;
        g.globalAlpha = 1 - d.t / 1.4;
        pill(g, 150, 30, '새 획 → 「다시 하기」 갈래가 잘려요', 7.5, '#e2483a', '#fff');
        g.globalAlpha = 1;
      }
      // 지금 위치 화살표
      const ay = 86 + (idx - show) * 17 - 1.5;
      if (ay >= 84 && ay < 232) {
        g.fillStyle = '#ffd166';
        g.beginPath();
        g.moveTo(px + 2, ay - 3);
        g.lineTo(px + 7, ay);
        g.lineTo(px + 2, ay + 3);
        g.fill();
        g.fillRect(px + 8, ay - 0.4, 76, 0.8);
      }
    },
    script() {
      const face = (cx: number, cy: number): Act[] => [
        S(shaky(arcPts(cx, cy, 58, 56, -90, 275, 50), 1.4, 1), 300),
        S(arcPts(cx - 20, cy - 14, 4, 6, 0, 360, 14), 120),
        S(arcPts(cx + 20, cy - 14, 4, 6, 0, 360, 14), 120),
        S(arcPts(cx, cy + 4, 28, 22, 20, 160, 20), 220),
      ];
      return [
        ...face(150, 124),
        DO(() => (erase = true)),
        S([pt(112, 150), pt(150, 158), pt(190, 148), pt(180, 136), pt(140, 146), pt(118, 140)], 200),
        DO(() => (erase = false)),
        WAIT(0.5),
        TAP(BU.x, BU.y),
        WAIT(0.6),
        TAP(BU.x, BU.y),
        WAIT(0.6),
        TAP(BR.x, BR.y),
        WAIT(0.7),
        S([pt(150, 116), pt(146, 132), pt(154, 133)], 90),
        WAIT(2),
      ];
    },
    controls: [
      { type: 'button', label: '↶ 되돌리기', on: () => undo() },
      { type: 'button', label: '↷ 다시 하기', on: () => redo() },
      { type: 'toggle', label: '지우개', value: false, on: (v) => (erase = v) },
    ],
  };
}

// ═════════════════════════ i318 대칭 그리기 ═════════════════════════
function symmetry(env: Env): Tool {
  const layer = mkLayer(env.R);
  const C = pt(PAPER.x + PAPER.w / 2, PAPER.y + PAPER.h / 2 + 2);
  type St = { pts: P[]; hue: number };
  let strokes: St[] = [];
  let cur: St | null = null;
  let N = 6;
  let mirror = true;
  let userN = false;
  let hue = 200;
  function seg(g: G, a: P, b: P, h: number): void {
    g.strokeStyle = `hsl(${h % 360},78%,50%)`;
    g.lineWidth = 2.2;
    g.beginPath();
    for (let k = 0; k < N; k++) {
      const an = (k / N) * Math.PI * 2;
      const c = Math.cos(an);
      const s = Math.sin(an);
      for (const m of mirror ? [1, -1] : [1]) {
        const ax = a.x - C.x;
        const ay = (a.y - C.y) * m;
        const bx = b.x - C.x;
        const by = (b.y - C.y) * m;
        g.moveTo(C.x + ax * c - ay * s, C.y + ax * s + ay * c);
        g.lineTo(C.x + bx * c - by * s, C.y + bx * s + by * c);
      }
    }
    g.stroke();
  }
  function rebuild(): void {
    clearLayer(layer);
    for (const st of strokes) for (let i = 1; i < st.pts.length; i++) seg(layer.g, st.pts[i - 1]!, st.pts[i]!, st.hue + i * 0.8);
  }
  return {
    cursor: () => 'pencil',
    color: () => `hsl(${hue % 360},78%,50%)`,
    begin(p) {
      hue += 47;
      cur = { pts: [p], hue };
      strokes.push(cur);
    },
    drag(p) {
      if (!cur) return;
      const l = cur.pts[cur.pts.length - 1]!;
      if (dist(l, p) < 0.8) return;
      cur.pts.push(p);
      seg(layer.g, l, p, cur.hue + cur.pts.length * 0.8);
    },
    end() {
      cur = null;
    },
    clear() {
      strokes = [];
      cur = null;
      clearLayer(layer);
    },
    draw(g) {
      clipPaper(g, PAPER);
      g.strokeStyle = 'rgba(47,111,224,0.18)';
      g.lineWidth = 0.7;
      g.setLineDash([3, 3]);
      const lines = mirror ? N : N;
      for (let k = 0; k < lines; k++) {
        const an = mirror ? (k / N) * Math.PI : (k / N) * Math.PI * 2;
        g.beginPath();
        g.moveTo(C.x, C.y);
        g.lineTo(C.x + Math.cos(an) * 200, C.y + Math.sin(an) * 200);
        if (mirror) {
          g.moveTo(C.x, C.y);
          g.lineTo(C.x - Math.cos(an) * 200, C.y - Math.sin(an) * 200);
        }
        g.stroke();
      }
      g.setLineDash([]);
      g.drawImage(layer.c, 0, 0, W, H);
      g.fillStyle = '#2f6fe0';
      g.beginPath();
      g.arc(C.x, C.y, 1.6, 0, Math.PI * 2);
      g.fill();
      pill(g, 344, 224, `대칭 ${N}${mirror ? ' · 거울' : ''}`, 7.5, 'rgba(29,39,71,0.85)', '#fff');
    },
    script(loop) {
      if (!userN) {
        const cyc = [6, 8, 5, 12];
        N = cyc[loop % cyc.length]!;
        mirror = loop % 4 !== 2;
        rebuild();
      }
      const r = rng(loop * 5 + 3);
      const acts: Act[] = [WAIT(0.2)];
      for (let k = 0; k < 3; k++) {
        const ph = r() * 6;
        const th0 = r() * Math.PI * 2;
        const base = 30 + k * 22;
        const o: P[] = [];
        for (let s = 0; s <= 2.6; s += 0.04) {
          const rr = base + 26 * Math.sin(s * 1.7 + ph);
          const th = th0 + 0.75 * s + 0.35 * Math.sin(2.3 * s + ph);
          o.push(pt(C.x + Math.cos(th) * rr, C.y + Math.sin(th) * rr));
        }
        acts.push(S(o, 150), WAIT(0.15));
      }
      acts.push(WAIT(1.6));
      return acts;
    },
    controls: [
      {
        type: 'range',
        label: '대칭 축 수',
        min: 1,
        max: 12,
        step: 1,
        value: 6,
        on: (v) => {
          N = v;
          userN = true;
          rebuild();
        },
      },
      {
        type: 'toggle',
        label: '거울 (뒤집기)',
        value: true,
        on: (v) => {
          mirror = v;
          userN = true;
          rebuild();
        },
      },
    ],
  };
}

// ═════════════════════════ i319 베지에 펜 ═════════════════════════
function bezierPen(): Tool {
  type A = { p: P; hin: P; hout: P };
  type Path = { a: A[]; closed: boolean; fill: string };
  let paths: Path[] = [];
  let cur: Path | null = null;
  let drag: { kind: 'new' | 'anchor' | 'in' | 'out'; a: A; start: P } | null = null;
  let hoverP: P | null = null;
  let showHandles = true;
  let fills = 0;
  const FILLS = ['rgba(232,86,109,0.22)', 'rgba(47,143,216,0.2)', 'rgba(54,168,90,0.2)', 'rgba(242,154,22,0.22)'];
  function trace(g: G, p: Path): void {
    const a = p.a;
    if (!a.length) return;
    g.beginPath();
    g.moveTo(a[0]!.p.x, a[0]!.p.y);
    const n = p.closed ? a.length : a.length - 1;
    for (let i = 0; i < n; i++) {
      const s = a[i]!;
      const e = a[(i + 1) % a.length]!;
      g.bezierCurveTo(s.hout.x, s.hout.y, e.hin.x, e.hin.y, e.p.x, e.p.y);
    }
    if (p.closed) g.closePath();
  }
  function hit(p: P): { kind: 'anchor' | 'in' | 'out'; a: A } | null {
    const list = cur ? [cur, ...paths] : paths;
    for (const ph of list)
      for (const a of ph.a) {
        if (showHandles && dist(a.hout, p) < 6 && dist(a.hout, a.p) > 1) return { kind: 'out', a };
        if (showHandles && dist(a.hin, p) < 6 && dist(a.hin, a.p) > 1) return { kind: 'in', a };
        if (dist(a.p, p) < 6) return { kind: 'anchor', a };
      }
    return null;
  }
  return {
    cursor: () => 'pen',
    color: () => '#1d2747',
    hover(p) {
      hoverP = p;
    },
    begin(p) {
      if (cur && cur.a.length >= 2 && dist(p, cur.a[0]!.p) < 7) {
        cur.closed = true;
        paths.push(cur);
        cur = null;
        return;
      }
      const h = hit(p);
      if (h && !(cur && h.a === cur.a[cur.a.length - 1] && h.kind === 'anchor')) {
        drag = { kind: h.kind, a: h.a, start: p };
        return;
      }
      if (!cur) {
        cur = { a: [], closed: false, fill: FILLS[fills++ % FILLS.length]! };
        if (paths.length > 4) paths.shift();
      }
      const a: A = { p: { ...p }, hin: { ...p }, hout: { ...p } };
      cur.a.push(a);
      drag = { kind: 'new', a, start: p };
    },
    drag(p) {
      if (!drag) return;
      const a = drag.a;
      if (drag.kind === 'new' || drag.kind === 'out') {
        a.hout = { ...p };
        a.hin = pt(2 * a.p.x - p.x, 2 * a.p.y - p.y);
      } else if (drag.kind === 'in') {
        a.hin = { ...p };
        a.hout = pt(2 * a.p.x - p.x, 2 * a.p.y - p.y);
      } else {
        const dx = p.x - a.p.x;
        const dy = p.y - a.p.y;
        a.p = pt(a.p.x + dx, a.p.y + dy);
        a.hin = pt(a.hin.x + dx, a.hin.y + dy);
        a.hout = pt(a.hout.x + dx, a.hout.y + dy);
      }
    },
    end() {
      drag = null;
    },
    clear() {
      paths = [];
      cur = null;
      drag = null;
    },
    draw(g) {
      clipPaper(g, PAPER);
      for (const p of paths) {
        trace(g, p);
        g.fillStyle = p.fill;
        g.fill();
        g.strokeStyle = '#1d2747';
        g.lineWidth = 2.2;
        g.stroke();
      }
      if (cur) {
        trace(g, cur);
        g.strokeStyle = '#1d2747';
        g.lineWidth = 2.2;
        g.stroke();
        const l = cur.a[cur.a.length - 1];
        if (l && hoverP && !drag) {
          g.strokeStyle = 'rgba(47,111,224,0.55)';
          g.lineWidth = 1;
          g.setLineDash([3, 3]);
          g.beginPath();
          g.moveTo(l.p.x, l.p.y);
          g.bezierCurveTo(l.hout.x, l.hout.y, hoverP.x, hoverP.y, hoverP.x, hoverP.y);
          g.stroke();
          g.setLineDash([]);
          if (cur.a.length >= 2 && dist(hoverP, cur.a[0]!.p) < 7) {
            g.strokeStyle = '#36a85a';
            g.lineWidth = 1.4;
            g.beginPath();
            g.arc(cur.a[0]!.p.x, cur.a[0]!.p.y, 6, 0, Math.PI * 2);
            g.stroke();
          }
        }
      }
      if (!showHandles) return;
      const list = cur ? [...paths, cur] : paths;
      for (const p of list)
        for (const a of p.a) {
          const has = dist(a.hout, a.p) > 1;
          if (has) {
            g.strokeStyle = 'rgba(47,111,224,0.8)';
            g.lineWidth = 0.8;
            g.beginPath();
            g.moveTo(a.hin.x, a.hin.y);
            g.lineTo(a.hout.x, a.hout.y);
            g.stroke();
            g.fillStyle = '#2f6fe0';
            for (const h of [a.hin, a.hout]) {
              g.beginPath();
              g.arc(h.x, h.y, 2.3, 0, Math.PI * 2);
              g.fill();
            }
          }
          g.fillStyle = '#fff';
          g.strokeStyle = '#2f6fe0';
          g.lineWidth = 1.2;
          g.fillRect(a.p.x - 2.6, a.p.y - 2.6, 5.2, 5.2);
          g.strokeRect(a.p.x - 2.6, a.p.y - 2.6, 5.2, 5.2);
        }
      g.font = `600 7.5px ${F}`;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillStyle = '#8a7f72';
      g.fillText('누르기 = 꼭짓점 · 누른 채 끌기 = 곡선 손잡이 · 첫 점 누르기 = 닫기 · 점 · 손잡이 끌어 고치기', 24, 228);
    },
    script(loop) {
      const dx = loop % 2 ? 40 : -10;
      const A0 = pt(200 + dx, 200);
      const B = pt(136 + dx, 112);
      const C = pt(200 + dx, 100);
      const D = pt(264 + dx, 112);
      const dr = (p: P, d: P): Act => S([p, pt(p.x + d.x, p.y + d.y)], 110, 1.5);
      return [
        WAIT(0.2),
        TAP(A0.x, A0.y),
        WAIT(0.25),
        dr(B, pt(0, -52)),
        WAIT(0.25),
        TAP(C.x, C.y),
        WAIT(0.25),
        dr(D, pt(0, 52)),
        WAIT(0.3),
        TAP(A0.x, A0.y),
        WAIT(0.6),
        S([pt(B.x, B.y - 52), pt(B.x - 24, B.y - 60)], 80, 1.2),
        WAIT(0.4),
        S([pt(D.x, D.y + 52), pt(D.x + 22, D.y + 58)], 80, 1.2),
        WAIT(1.6),
      ];
    },
    controls: [{ type: 'toggle', label: '손잡이 보기', value: true, on: (v) => (showHandles = v) }],
  };
}

// ═════════════════════════ i320 모눈 · 자석 맞춤 ═════════════════════════
function snapTool(): Tool {
  const GS = 20;
  const O = pt(30, 36);
  const COLS = 17;
  const ROWS = 9;
  type Poly = { pts: P[]; closed: boolean; t: number };
  let polys: Poly[] = [];
  let cur: Poly | null = null;
  let hoverP: P | null = null;
  let grid = true;
  let angle = true;
  let pulls: { from: P; to: P; t: number }[] = [];
  const gridSnap = (p: P): P => pt(O.x + clamp(Math.round((p.x - O.x) / GS), 0, COLS) * GS, O.y + clamp(Math.round((p.y - O.y) / GS), 0, ROWS) * GS);
  function snap(p: P): P {
    // 다른 점 자석
    const all = polys.flatMap((q) => q.pts).concat(cur?.pts ?? []);
    for (const q of all) if (dist(q, p) < 8) return { ...q };
    if (grid) return gridSnap(p);
    if (angle && cur && cur.pts.length) {
      const l = cur.pts[cur.pts.length - 1]!;
      const a = Math.atan2(p.y - l.y, p.x - l.x);
      const s = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
      const d = dist(p, l);
      return pt(l.x + Math.cos(s) * d, l.y + Math.sin(s) * d);
    }
    return p;
  }
  const fmtLen = (d: number): string => {
    const L = d / GS;
    return Math.abs(L - Math.round(L)) < 0.03 ? String(Math.round(L)) : L.toFixed(2);
  };
  function edgeLabel(g: G, a: P, b: P, cx: number, cy: number): void {
    const m = lerpP(a, b, 0.5);
    let nx = -(b.y - a.y);
    let ny = b.x - a.x;
    const L = Math.hypot(nx, ny) || 1;
    nx /= L;
    ny /= L;
    if ((m.x - cx) * nx + (m.y - cy) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    pill(g, m.x + nx * 9, m.y + ny * 9, fmtLen(dist(a, b)), 7, '#fff3c4', '#5a4300');
  }
  return {
    rings: true,
    cursor: () => 'pencil',
    color: () => '#2f6fe0',
    hover(p) {
      hoverP = p;
    },
    begin(raw) {
      const p0 = raw;
      if (!cur) {
        cur = { pts: [], closed: false, t: 0 };
        if (polys.length > 3) polys.shift();
      }
      if (cur.pts.length >= 3 && dist(snap(p0), cur.pts[0]!) < 1) {
        cur.closed = true;
        cur.t = 0;
        polys.push(cur);
        cur = null;
        return;
      }
      const p = snap(p0);
      if (dist(p, p0) > 0.5) pulls.push({ from: p0, to: p, t: 0 });
      cur.pts.push(p);
    },
    drag() {},
    end() {},
    step(dt) {
      for (const q of pulls) q.t += dt;
      pulls = pulls.filter((q) => q.t < 0.6);
      for (const q of polys) q.t += dt;
    },
    clear() {
      polys = [];
      cur = null;
      pulls = [];
    },
    draw(g) {
      clipPaper(g, PAPER);
      // 모눈
      g.strokeStyle = 'rgba(70,130,210,0.16)';
      g.lineWidth = 0.6;
      g.beginPath();
      for (let i = 0; i <= COLS; i++) {
        g.moveTo(O.x + i * GS, O.y);
        g.lineTo(O.x + i * GS, O.y + ROWS * GS);
      }
      for (let j = 0; j <= ROWS; j++) {
        g.moveTo(O.x, O.y + j * GS);
        g.lineTo(O.x + COLS * GS, O.y + j * GS);
      }
      g.stroke();
      g.fillStyle = 'rgba(70,130,210,0.35)';
      for (let i = 0; i <= COLS; i++)
        for (let j = 0; j <= ROWS; j++) {
          g.beginPath();
          g.arc(O.x + i * GS, O.y + j * GS, 0.9, 0, Math.PI * 2);
          g.fill();
        }
      const all = cur ? [...polys, cur] : polys;
      for (const pl of all) {
        const v = pl.pts;
        if (!v.length) continue;
        let cx = 0;
        let cy = 0;
        v.forEach((q) => {
          cx += q.x;
          cy += q.y;
        });
        cx /= v.length;
        cy /= v.length;
        if (pl.closed) {
          const k = clamp(pl.t / 0.3, 0, 1);
          g.fillStyle = `rgba(47,111,224,${0.16 * k})`;
          poly(g, v, true);
          g.fill();
        }
        g.strokeStyle = '#2f6fe0';
        g.lineWidth = 2;
        poly(g, v, pl.closed);
        g.stroke();
        const n = v.length;
        const ne = pl.closed ? n : n - 1;
        for (let i = 0; i < ne; i++) edgeLabel(g, v[i]!, v[(i + 1) % n]!, cx, cy);
        if (pl.closed) {
          for (let i = 0; i < n; i++) {
            const a = v[(i - 1 + n) % n]!;
            const b = v[i]!;
            const c = v[(i + 1) % n]!;
            const a1 = Math.atan2(a.y - b.y, a.x - b.x);
            const a2 = Math.atan2(c.y - b.y, c.x - b.x);
            let d = Math.abs(a2 - a1);
            if (d > Math.PI) d = Math.PI * 2 - d;
            const deg = (d * 180) / Math.PI;
            g.strokeStyle = '#e2483a';
            g.lineWidth = 1;
            if (Math.abs(deg - 90) < 0.6) {
              const ux = Math.cos(a1) * 6;
              const uy = Math.sin(a1) * 6;
              const vx = Math.cos(a2) * 6;
              const vy = Math.sin(a2) * 6;
              g.beginPath();
              g.moveTo(b.x + ux, b.y + uy);
              g.lineTo(b.x + ux + vx, b.y + uy + vy);
              g.lineTo(b.x + vx, b.y + vy);
              g.stroke();
            } else {
              const mid = Math.atan2(Math.sin(a1) + Math.sin(a2), Math.cos(a1) + Math.cos(a2));
              g.beginPath();
              let s0 = a1;
              let s1 = a2;
              if (((s1 - s0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI < 0) [s0, s1] = [s1, s0];
              g.arc(b.x, b.y, 8, s0, s1);
              g.stroke();
              g.fillStyle = '#c0392b';
              g.font = `700 6.5px ${F}`;
              g.textAlign = 'center';
              g.textBaseline = 'middle';
              g.fillText(`${Math.round(deg)}°`, b.x + Math.cos(mid) * 17, b.y + Math.sin(mid) * 17);
            }
          }
          let A = 0;
          for (let i = 0; i < n; i++) A += v[i]!.x * v[(i + 1) % n]!.y - v[(i + 1) % n]!.x * v[i]!.y;
          A = Math.abs(A) / 2 / (GS * GS);
          const k = easeBack(clamp((pl.t - 0.15) / 0.35, 0, 1));
          g.save();
          g.translate(cx, cy);
          g.scale(k, k);
          pill(g, 0, 0, `넓이 ${Math.abs(A - Math.round(A)) < 0.01 ? Math.round(A) : A.toFixed(1)}칸`, 8.5, '#2f6fe0', '#fff');
          g.restore();
        }
        g.fillStyle = '#fff';
        g.strokeStyle = '#2f6fe0';
        g.lineWidth = 1.3;
        for (const q of v) {
          g.beginPath();
          g.arc(q.x, q.y, 2.4, 0, Math.PI * 2);
          g.fill();
          g.stroke();
        }
      }
      // 끌려가는 자석 표시
      for (const q of pulls) {
        const u = q.t / 0.6;
        g.globalAlpha = 1 - u;
        g.strokeStyle = '#e2483a';
        g.lineWidth = 0.9;
        g.setLineDash([2, 2]);
        g.beginPath();
        g.moveTo(q.from.x, q.from.y);
        g.lineTo(q.to.x, q.to.y);
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = 'rgba(226,72,58,0.6)';
        g.beginPath();
        g.arc(q.from.x, q.from.y, 1.8, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#2f6fe0';
        g.beginPath();
        g.arc(q.to.x, q.to.y, 3 + u * 9, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
      }
      // 고무줄 미리 보기
      if (hoverP && hoverP.x > PAPER.x && hoverP.x < PAPER.x + PAPER.w && hoverP.y > PAPER.y && hoverP.y < PAPER.y + PAPER.h) {
        const s = snap(hoverP);
        if (cur && cur.pts.length) {
          const l = cur.pts[cur.pts.length - 1]!;
          g.strokeStyle = 'rgba(47,111,224,0.5)';
          g.lineWidth = 1.2;
          g.setLineDash([3, 3]);
          g.beginPath();
          g.moveTo(l.x, l.y);
          g.lineTo(s.x, s.y);
          g.stroke();
          g.setLineDash([]);
          if (dist(l, s) > 4) pill(g, (l.x + s.x) / 2, (l.y + s.y) / 2 - 8, fmtLen(dist(l, s)), 6.5, 'rgba(47,111,224,0.85)', '#fff');
        }
        g.strokeStyle = 'rgba(47,111,224,0.7)';
        g.lineWidth = 0.8;
        g.beginPath();
        g.moveTo(s.x - 5, s.y);
        g.lineTo(s.x + 5, s.y);
        g.moveTo(s.x, s.y - 5);
        g.lineTo(s.x, s.y + 5);
        g.stroke();
      }
      g.fillStyle = '#8a7f72';
      g.font = `600 7px ${F}`;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(`한 칸 = 1 · ${grid ? '모눈 맞춤' : angle ? '15° 각도 맞춤' : '맞춤 끔'} · 첫 점을 누르면 닫힘`, 24, 228);
    },
    script(loop) {
      const jr = rng(loop * 9 + 4);
      const P_ = (i: number, j: number): Act => TAP(O.x + i * GS + (jr() - 0.5) * 12, O.y + j * GS + (jr() - 0.5) * 12);
      const acts: Act[] = [WAIT(0.2), P_(1, 8), WAIT(0.25), P_(5, 8), WAIT(0.25), P_(1, 5), WAIT(0.25), P_(1, 8), WAIT(0.9)];
      if (loop % 2) acts.push(P_(8, 8), WAIT(0.2), P_(13, 8), WAIT(0.2), P_(16, 4), WAIT(0.2), P_(11, 4), WAIT(0.2), P_(8, 8));
      else acts.push(P_(8, 7), WAIT(0.2), P_(14, 7), WAIT(0.2), P_(14, 3), WAIT(0.2), P_(8, 3), WAIT(0.2), P_(8, 7));
      acts.push(WAIT(1.8));
      return acts;
    },
    controls: [
      { type: 'toggle', label: '모눈 맞춤 (스냅)', value: true, on: (v) => (grid = v) },
      { type: 'toggle', label: '15° 각도 맞춤 (모눈 끔일 때)', value: true, on: (v) => (angle = v) },
    ],
  };
}

// ═════════════════════════ i321 자 · 각도기 · 컴퍼스 ═════════════════════════
function instruments(): Tool {
  type Mode = 'ruler' | 'compass' | 'protractor';
  type Item = { k: 'line'; a: P; b: P } | { k: 'arc'; c: P; r: number; pts: P[] } | { k: 'angle'; v: P; deg: number; to: P } | { k: 'label'; p: P; text: string; t: number };
  let items: Item[] = [];
  let mode: Mode = 'ruler';
  let op: { a: P; p: P; sweep: number; lastAng: number; r: number; trail: P[]; locked: boolean } | null = null;
  let pose: { mode: Mode; a: P; p: P; r: number } | null = null;
  const CM = 20;
  function snapPt(p: P): P {
    for (const it of items) {
      const cands = it.k === 'line' ? [it.a, it.b] : it.k === 'arc' ? [it.c] : it.k === 'angle' ? [it.v] : [it.p];
      for (const q of cands) if (dist(q, p) < 7) return { ...q };
    }
    return p;
  }
  function drawRuler(g: G, a: P, p: P): void {
    const th = Math.atan2(p.y - a.y, p.x - a.x);
    g.save();
    g.translate(a.x, a.y);
    g.rotate(th);
    g.fillStyle = 'rgba(210,232,255,0.55)';
    g.strokeStyle = 'rgba(60,110,170,0.7)';
    g.lineWidth = 0.8;
    rrect(g, -10, 0.5, 224, 24, 2.5);
    g.fill();
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.fillRect(-8, 2, 220, 3);
    g.strokeStyle = 'rgba(30,60,100,0.85)';
    for (let mm = 0; mm <= 100; mm++) {
      const x = mm * 2;
      const L = mm % 10 === 0 ? 8 : mm % 5 === 0 ? 5.5 : 3.2;
      g.lineWidth = mm % 10 === 0 ? 0.6 : 0.35;
      g.beginPath();
      g.moveTo(x, 0.5);
      g.lineTo(x, 0.5 + L);
      g.stroke();
    }
    g.fillStyle = 'rgba(30,60,100,0.9)';
    g.font = `700 5.5px ${F}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let c = 0; c <= 10; c++) g.fillText(String(c), c * CM, 14);
    g.font = `600 4.5px ${F}`;
    g.fillText('cm', 210, 20);
    g.restore();
  }
  function drawCompass(g: G, c: P, p: P): void {
    const r = dist(c, p);
    const Lg = Math.max(66, r / 2 + 14);
    const m = lerpP(c, p, 0.5);
    const hgt = Math.sqrt(Math.max(0, Lg * Lg - (r / 2) * (r / 2)));
    let nx = r > 0.1 ? (p.y - c.y) / r : 0;
    let ny = r > 0.1 ? -(p.x - c.x) / r : -1;
    if (ny > 0.2) {
      nx = -nx;
      ny = -ny;
    }
    const hx = m.x + nx * hgt;
    const hy = m.y + ny * hgt;
    g.save();
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.beginPath();
    g.moveTo(c.x + 3, c.y + 3);
    g.lineTo(hx + 7, hy + 7);
    g.lineTo(p.x + 3, p.y + 3);
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    g.stroke();
    for (const [x, y, wd] of [
      [c.x, c.y, 3.2],
      [p.x, p.y, 3.6],
    ] as [number, number, number][]) {
      const gr = g.createLinearGradient(hx, hy, x, y);
      gr.addColorStop(0, '#eef1f5');
      gr.addColorStop(0.5, '#9aa3ad');
      gr.addColorStop(1, '#6c757f');
      g.strokeStyle = gr;
      g.lineWidth = wd;
      g.beginPath();
      g.moveTo(hx, hy);
      g.lineTo(lerp(hx, x, 0.88), lerp(hy, y, 0.88));
      g.stroke();
    }
    // 바늘 · 연필심
    g.strokeStyle = '#3b4048';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(lerp(hx, c.x, 0.88), lerp(hy, c.y, 0.88));
    g.lineTo(c.x, c.y);
    g.stroke();
    g.strokeStyle = '#e9c08f';
    g.lineWidth = 2.6;
    g.beginPath();
    g.moveTo(lerp(hx, p.x, 0.88), lerp(hy, p.y, 0.88));
    g.lineTo(lerp(hx, p.x, 0.96), lerp(hy, p.y, 0.96));
    g.stroke();
    g.strokeStyle = '#2b2b33';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(lerp(hx, p.x, 0.96), lerp(hy, p.y, 0.96));
    g.lineTo(p.x, p.y);
    g.stroke();
    // 손잡이
    g.fillStyle = '#c0392b';
    rrect(g, hx - 2.5, hy - 14, 5, 11, 2);
    g.fill();
    const gk = g.createRadialGradient(hx - 1, hy - 1, 0, hx, hy, 5);
    gk.addColorStop(0, '#fff');
    gk.addColorStop(1, '#7c858f');
    g.fillStyle = gk;
    g.beginPath();
    g.arc(hx, hy, 4.2, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  function drawProtractor(g: G, v: P, p: P): void {
    const R = 70;
    g.save();
    g.fillStyle = 'rgba(255,236,170,0.45)';
    g.strokeStyle = 'rgba(160,120,20,0.8)';
    g.lineWidth = 0.8;
    g.beginPath();
    g.arc(v.x, v.y, R, Math.PI, 0);
    g.lineTo(v.x + R, v.y + 4);
    g.lineTo(v.x - R, v.y + 4);
    g.closePath();
    g.fill();
    g.stroke();
    g.beginPath();
    g.arc(v.x, v.y, R * 0.45, Math.PI, 0);
    g.stroke();
    for (let d = 0; d <= 180; d += 5) {
      const a = (-d * Math.PI) / 180;
      const L = d % 10 === 0 ? 7 : 4;
      g.lineWidth = d % 30 === 0 ? 0.7 : 0.4;
      g.beginPath();
      g.moveTo(v.x + Math.cos(a) * R, v.y + Math.sin(a) * R);
      g.lineTo(v.x + Math.cos(a) * (R - L), v.y + Math.sin(a) * (R - L));
      g.stroke();
      if (d % 30 === 0) {
        g.fillStyle = 'rgba(110,80,10,0.95)';
        g.font = `700 5.5px ${F}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(d), v.x + Math.cos(a) * (R - 13), v.y + Math.sin(a) * (R - 13));
      }
    }
    g.fillStyle = '#a07814';
    g.beginPath();
    g.arc(v.x, v.y, 1.5, 0, Math.PI * 2);
    g.fill();
    g.restore();
    angleMark(g, v, p, true);
  }
  function angleOf(v: P, p: P): number {
    let d = (Math.atan2(-(p.y - v.y), p.x - v.x) * 180) / Math.PI;
    if (d < 0) d += 360;
    return Math.min(180, d > 270 ? 0 : d);
  }
  function angleMark(g: G, v: P, p: P, live: boolean): void {
    const deg = angleOf(v, p);
    const a = (-deg * Math.PI) / 180;
    g.strokeStyle = '#e2483a';
    g.lineWidth = 1.3;
    g.setLineDash([3, 2]);
    g.beginPath();
    g.moveTo(v.x, v.y);
    g.lineTo(v.x + 60, v.y);
    g.stroke();
    g.setLineDash([]);
    if (live) {
      g.beginPath();
      g.moveTo(v.x, v.y);
      g.lineTo(v.x + Math.cos(a) * 80, v.y + Math.sin(a) * 80);
      g.stroke();
    }
    g.fillStyle = 'rgba(226,72,58,0.18)';
    g.beginPath();
    g.moveTo(v.x, v.y);
    g.arc(v.x, v.y, 20, 0, a, true);
    g.closePath();
    g.fill();
    g.beginPath();
    g.arc(v.x, v.y, 20, 0, a, true);
    g.stroke();
    pill(g, v.x + Math.cos(a / 2) * 34, v.y + Math.sin(a / 2) * 34, `${Math.round(deg)}°`, 7.5, '#e2483a', '#fff');
  }
  return {
    cursor: () => 'pencil',
    color: () => '#2b2b33',
    begin(p0) {
      const p = snapPt(p0);
      op = { a: p, p, sweep: 0, lastAng: 0, r: 0, trail: [], locked: false };
      pose = { mode, a: p, p, r: 0 };
    },
    drag(p0) {
      if (!op) return;
      if (mode === 'compass') {
        const ang = Math.atan2(p0.y - op.a.y, p0.x - op.a.x);
        const d = dist(p0, op.a);
        if (!op.locked) {
          if (d < 6) return;
          if (op.r === 0) op.lastAng = ang;
          let da = ang - op.lastAng;
          if (da > Math.PI) da -= Math.PI * 2;
          if (da < -Math.PI) da += Math.PI * 2;
          op.sweep += da;
          op.lastAng = ang;
          op.r = d;
          op.p = p0;
          if (Math.abs(op.sweep) > 0.3) {
            op.locked = true;
            op.r = d;
            const a0 = ang - op.sweep;
            for (let k = 0; k <= 8; k++) {
              const a = a0 + (op.sweep * k) / 8;
              op.trail.push(pt(op.a.x + Math.cos(a) * op.r, op.a.y + Math.sin(a) * op.r));
            }
          }
        } else {
          const q = pt(op.a.x + Math.cos(ang) * op.r, op.a.y + Math.sin(ang) * op.r);
          op.trail.push(q);
          op.p = q;
        }
      } else {
        op.p = p0;
      }
      if (pose) {
        pose.p = op.p;
        pose.r = op.r;
      }
    },
    end() {
      if (!op) return;
      if (mode === 'ruler') {
        const b = snapPt(op.p);
        if (dist(op.a, b) > 3) items.push({ k: 'line', a: op.a, b });
        if (pose) pose.p = b;
      } else if (mode === 'compass') {
        if (op.trail.length > 1) items.push({ k: 'arc', c: op.a, r: op.r, pts: op.trail });
      } else if (dist(op.a, op.p) > 5) items.push({ k: 'angle', v: op.a, deg: angleOf(op.a, op.p), to: op.p });
      op = null;
    },
    step(dt) {
      for (const it of items) if (it.k === 'label') it.t += dt;
    },
    clear() {
      items = [];
      op = null;
      pose = null;
    },
    draw(g) {
      clipPaper(g, PAPER);
      for (const it of items) {
        if (it.k === 'line') {
          g.strokeStyle = '#2b2b33';
          g.lineWidth = 1.5;
          poly(g, [it.a, it.b]);
          g.stroke();
        } else if (it.k === 'arc') {
          g.strokeStyle = '#6b6b78';
          g.lineWidth = 1;
          poly(g, it.pts);
          g.stroke();
          g.fillStyle = '#6b6b78';
          g.beginPath();
          g.arc(it.c.x, it.c.y, 1.2, 0, Math.PI * 2);
          g.fill();
        } else if (it.k === 'angle') {
          angleMark(g, it.v, it.to, false);
        } else {
          const k = easeBack(clamp(it.t / 0.3, 0, 1));
          g.save();
          g.translate(it.p.x, it.p.y);
          g.scale(k, k);
          if (it.text.length <= 2) {
            g.fillStyle = '#1d2747';
            g.beginPath();
            g.arc(0, 0, 2.2, 0, Math.PI * 2);
            g.fill();
            g.font = `800 9px ${F}`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText(it.text, 0, it.text === 'C' ? -9 : 9);
          } else pill(g, 0, 0, it.text, 8.5, '#36a85a', '#fff');
          g.restore();
        }
      }
      if (op && mode === 'ruler') {
        g.strokeStyle = '#2b2b33';
        g.lineWidth = 1.5;
        poly(g, [op.a, op.p]);
        g.stroke();
      }
      if (op && mode === 'compass' && op.trail.length > 1) {
        g.strokeStyle = '#6b6b78';
        g.lineWidth = 1;
        poly(g, op.trail);
        g.stroke();
      }
      if (pose) {
        if (pose.mode === 'ruler') {
          drawRuler(g, pose.a, dist(pose.a, pose.p) > 2 ? pose.p : pt(pose.a.x + 10, pose.a.y));
          if (op && mode === 'ruler') pill(g, op.p.x, op.p.y - 12, `${(dist(op.a, op.p) / CM).toFixed(1)} cm`, 7.5, '#1d2747', '#fff');
        } else if (pose.mode === 'compass') {
          drawCompass(g, pose.a, op && mode === 'compass' ? op.p : pose.p);
          if (op && mode === 'compass' && op.r > 5) pill(g, pose.a.x, pose.a.y + 12, `반지름 ${(op.r / CM).toFixed(1)} cm`, 7, '#1d2747', '#fff');
        } else drawProtractor(g, pose.a, pose.p);
      }
      g.fillStyle = '#8a7f72';
      g.font = `600 7px ${F}`;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(`지금 도구: ${mode === 'ruler' ? '자 — 끌어서 곧은 선' : mode === 'compass' ? '컴퍼스 — 중심을 누르고 돌리기' : '각도기 — 꼭짓점을 누르고 끌기'}`, 24, 228);
    },
    script() {
      const A = pt(140, 176);
      const B = pt(260, 176);
      const r = dist(A, B);
      const Cp = pt(200, 176 - r * Math.sin(Math.PI / 3));
      const arc = (c: P, a0: number, a1: number): P[] => [c, ...arcPts(c.x, c.y, r, r, a0, a1, 40)];
      const setMode = (m: Mode): Act => DO(() => (mode = m));
      const label = (p: P, text: string): Act => DO(() => items.push({ k: 'label', p, text, t: 0 }));
      return [
        setMode('ruler'),
        S([A, B], 140),
        label(A, 'A'),
        label(B, 'B'),
        WAIT(0.4),
        setMode('compass'),
        { k: 'stroke', pts: arc(A, 0, -82), dur: 1.2 },
        WAIT(0.2),
        { k: 'stroke', pts: arc(B, 180, 262), dur: 1.2 },
        label(Cp, 'C'),
        WAIT(0.4),
        setMode('ruler'),
        S([A, Cp], 160),
        S([B, Cp], 160),
        WAIT(0.3),
        setMode('protractor'),
        S([A, lerpP(A, Cp, 0.75)], 90),
        label(pt(200, 205), '정삼각형 — 세 각 모두 60°'),
        WAIT(2.2),
      ];
    },
    controls: [
      { type: 'button', label: '자', on: () => (mode = 'ruler') },
      { type: 'button', label: '컴퍼스', on: () => (mode = 'compass') },
      { type: 'button', label: '각도기', on: () => (mode = 'protractor') },
    ],
  };
}

// ═════════════════════════ i322 선 → 물리 ═════════════════════════
function lineToPhysics(): Tool {
  type Body = { p: P[]; o: P[]; rest: P[]; closed: boolean; color: string; pop: number };
  const RAD = 2.6;
  const GRAV = 420;
  const RAMPS: [P, P][] = [
    [pt(30, 108), pt(232, 160)],
    [pt(384, 150), pt(262, 196)],
  ];
  const GROUND = PAPER.y + PAPER.h - 8;
  const COLORS = ['#e2483a', '#2f6fe0', '#36a85a', '#f29a16', '#8e44ad'];
  let bodies: Body[] = [];
  let cur: P[] | null = null;
  let ci = 0;
  const segs = (): [P, P][] => [...RAMPS, [pt(PAPER.x, GROUND), pt(PAPER.x + PAPER.w, GROUND)], [pt(PAPER.x + 2, PAPER.y - 200), pt(PAPER.x + 2, GROUND)], [pt(PAPER.x + PAPER.w - 2, PAPER.y - 200), pt(PAPER.x + PAPER.w - 2, GROUND)]];
  function make(raw: P[]): void {
    if (pathLen(raw) < 10) return;
    const closed = dist(raw[0]!, raw[raw.length - 1]!) < Math.max(12, pathLen(raw) * 0.15) && pathLen(raw) > 40;
    let p = resampleStep(raw, 5);
    if (closed && p.length > 3 && dist(p[0]!, p[p.length - 1]!) < 4) p = p.slice(0, -1);
    if (p.length < 2) return;
    let cx = 0;
    let cy = 0;
    p.forEach((q) => {
      cx += q.x;
      cy += q.y;
    });
    cx /= p.length;
    cy /= p.length;
    bodies.push({ p: p.map((q) => ({ ...q })), o: p.map((q) => ({ ...q })), rest: p.map((q) => pt(q.x - cx, q.y - cy)), closed, color: COLORS[ci++ % COLORS.length]!, pop: 0 });
    if (bodies.length > 6) bodies.shift();
  }
  function collideSeg(q: P, o: P, a: P, b: P): void {
    const c = nearestOnSeg(q, a, b);
    let dx = q.x - c.x;
    let dy = q.y - c.y;
    const d = Math.hypot(dx, dy);
    if (d >= RAD) return;
    if (d < 1e-6) {
      dx = -(b.y - a.y);
      dy = b.x - a.x;
      const L = Math.hypot(dx, dy) || 1;
      dx /= L;
      dy /= L;
      if (dy > 0) {
        dx = -dx;
        dy = -dy;
      }
    } else {
      dx /= d;
      dy /= d;
    }
    q.x = c.x + dx * RAD;
    q.y = c.y + dy * RAD;
    const vx = q.x - o.x;
    const vy = q.y - o.y;
    const vn = vx * dx + vy * dy;
    const tx = vx - vn * dx;
    const ty = vy - vn * dy;
    const fr = 0.1;
    const nvn = vn < 0 ? -vn * 0.15 : vn;
    o.x = q.x - (tx * (1 - fr) + dx * nvn);
    o.y = q.y - (ty * (1 - fr) + dy * nvn);
  }
  function shapeMatch(b: Body): void {
    const n = b.p.length;
    let cx = 0;
    let cy = 0;
    for (const q of b.p) {
      cx += q.x;
      cy += q.y;
    }
    cx /= n;
    cy /= n;
    let sc = 0;
    let ss = 0;
    for (let i = 0; i < n; i++) {
      const r = b.rest[i]!;
      const dx = b.p[i]!.x - cx;
      const dy = b.p[i]!.y - cy;
      sc += r.x * dx + r.y * dy;
      ss += r.x * dy - r.y * dx;
    }
    const a = Math.atan2(ss, sc);
    const c = Math.cos(a);
    const s = Math.sin(a);
    for (let i = 0; i < n; i++) {
      const r = b.rest[i]!;
      b.p[i]!.x = cx + r.x * c - r.y * s;
      b.p[i]!.y = cy + r.x * s + r.y * c;
    }
  }
  return {
    rings: true,
    cursor: () => 'pencil',
    color: () => COLORS[ci % COLORS.length]!,
    begin(p) {
      cur = [p];
    },
    drag(p) {
      if (cur && dist(cur[cur.length - 1]!, p) > 1) cur.push(p);
    },
    end() {
      if (cur) make(cur);
      cur = null;
    },
    step(dt0) {
      const SUB = 4;
      const dt = Math.min(dt0, 1 / 30) / SUB;
      const sg = segs();
      for (let s = 0; s < SUB; s++) {
        for (const b of bodies) {
          b.pop = Math.min(1, b.pop + dt * 4);
          for (let i = 0; i < b.p.length; i++) {
            const q = b.p[i]!;
            const o = b.o[i]!;
            let vx = (q.x - o.x) * 0.999;
            let vy = (q.y - o.y) * 0.999 + GRAV * dt * dt;
            const v = Math.hypot(vx, vy);
            if (v > 3.5) {
              vx *= 3.5 / v;
              vy *= 3.5 / v;
            }
            o.x = q.x;
            o.y = q.y;
            q.x += vx;
            q.y += vy;
          }
        }
        for (let pass = 0; pass < 2; pass++) {
          for (const b of bodies) for (let i = 0; i < b.p.length; i++) for (const [a, c] of sg) collideSeg(b.p[i]!, b.o[i]!, a, c);
          // 물체끼리
          for (let x = 0; x < bodies.length; x++)
            for (let y = x + 1; y < bodies.length; y++) {
              const A = bodies[x]!;
              const B = bodies[y]!;
              for (const qa of A.p)
                for (const qb of B.p) {
                  const dx = qb.x - qa.x;
                  const dy = qb.y - qa.y;
                  const d2 = dx * dx + dy * dy;
                  if (d2 >= RAD * RAD * 4 || d2 < 1e-8) continue;
                  const d = Math.sqrt(d2);
                  const k = (RAD * 2 - d) / d / 2;
                  qa.x -= dx * k;
                  qa.y -= dy * k;
                  qb.x += dx * k;
                  qb.y += dy * k;
                }
            }
          for (const b of bodies) shapeMatch(b);
        }
      }
      bodies = bodies.filter((b) => b.p[0]!.y < 400);
    },
    clear() {
      bodies = [];
      cur = null;
    },
    draw(g) {
      clipPaper(g, PAPER);
      // 경사판 · 땅
      for (const [a, b] of RAMPS) {
        const th = Math.atan2(b.y - a.y, b.x - a.x);
        const L = dist(a, b);
        g.save();
        g.translate(a.x, a.y);
        g.rotate(th);
        const wg = g.createLinearGradient(0, 0, 0, 7);
        wg.addColorStop(0, '#c8955e');
        wg.addColorStop(1, '#8c5d32');
        g.fillStyle = wg;
        g.fillRect(0, 0, L, 7);
        g.strokeStyle = 'rgba(80,48,20,0.5)';
        g.lineWidth = 0.5;
        for (let x = 22; x < L; x += 26) {
          g.beginPath();
          g.moveTo(x, 0);
          g.lineTo(x, 7);
          g.stroke();
        }
        g.strokeStyle = '#5c3a1c';
        g.lineWidth = 0.8;
        g.strokeRect(0, 0, L, 7);
        g.restore();
        // 받침 기둥
        const m = lerpP(a, b, 0.5);
        g.strokeStyle = '#7a5434';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(m.x, m.y + 6);
        g.lineTo(m.x, GROUND);
        g.stroke();
      }
      g.fillStyle = '#d8c7a6';
      g.fillRect(PAPER.x, GROUND, PAPER.w, 10);
      g.strokeStyle = '#8a7350';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(PAPER.x, GROUND);
      g.lineTo(PAPER.x + PAPER.w, GROUND);
      g.stroke();
      for (const b of bodies) {
        let cx = 0;
        let cy = 0;
        b.p.forEach((q) => {
          cx += q.x;
          cy += q.y;
        });
        cx /= b.p.length;
        cy /= b.p.length;
        const k = 1 + Math.sin(b.pop * Math.PI) * 0.12;
        const pts = b.p.map((q) => pt(cx + (q.x - cx) * k, cy + (q.y - cy) * k));
        g.strokeStyle = 'rgba(0,0,0,0.15)';
        g.lineWidth = RAD * 2;
        g.save();
        g.translate(1.2, 1.6);
        smoothPath(g, pts, b.closed);
        g.stroke();
        g.restore();
        g.strokeStyle = b.color;
        g.lineWidth = RAD * 2;
        smoothPath(g, pts, b.closed);
        g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.35)';
        g.lineWidth = 1;
        smoothPath(g, pts.map((q) => pt(q.x - 0.8, q.y - 0.8)), b.closed);
        g.stroke();
      }
      if (cur && cur.length > 1) {
        g.strokeStyle = '#4a4a55';
        g.lineWidth = 1.4;
        g.setLineDash([3, 2]);
        smoothPath(g, cur);
        g.stroke();
        g.setLineDash([]);
      }
      g.fillStyle = '#8a7f72';
      g.font = `600 7px ${F}`;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText('선을 그으면 손을 떼는 순간 물체가 돼요 — 동그라미는 굴러가요', 24, 34);
    },
    script(loop) {
      const r = rng(loop * 3 + 7);
      const wheel = arcPts(70 + r() * 20, 58, 15, 15, -90, 275, 40);
      const stick = [pt(276 + r() * 20, 64), pt(352, 92 + r() * 10)];
      const tri = [pt(180, 40), pt(204, 74), pt(160, 74), pt(180, 40)];
      return [S(shaky(wheel, 1, loop), 180), WAIT(0.9), S(stick, 160), WAIT(0.9), S(resampleStep(tri, 3), 160), WAIT(3.6)];
    },
  };
}

// ───────────────────────── 내보내기 ─────────────────────────
const dom = (caption: string, build: (env: Env) => Tool) => ({
  kind: 'dom' as const,
  caption,
  make: (box: HTMLElement) => makeBoard(box, build),
});

export const DEMOS: DemoMap = {
  i312: dom('흔들리는 손 점(빨강)을 이동 평균 · 2차 곡선으로 매끈하게 — 빠르게 그은 곳은 가늘게', () => smoothBrush()),
  i313: dom('결 무늬를 선 따라 찍기 — 크레파스(종이 결) · 수채(번짐 · 겹치면 섞임) · 분필(칠판)', (e) => stampBrush(e)),
  i314: dom('페인트 통 — 누른 곳과 이어진 같은 색 칸을 물결처럼 채움 (끌면 연필로 선 긋기)', (e) => paintBucket(e)),
  i315: dom('삐뚤한 손그림 → 원 · 삼각형 · 사각형 · 직선으로 알아보고 반듯하게 착', () => shapeRecog()),
  i316: dom('손으로 쓴 숫자를 28×28 로 줄여 0 ~ 9 기준 모양과 거리 비교 — 몇 % 로 맞힘', () => digitRecog()),
  i317: dom('획 하나 = 명령 하나 — 되돌리기 · 다시 하기, 새로 그으면 다시 하기 갈래가 잘림', (e) => undoRedo(e)),
  i318: dom('한 번 그으면 회전 · 거울 대칭으로 여러 개 — 대칭 축 수에 따라 만화경 무늬', (e) => symmetry(e)),
  i319: dom('펜 도구 — 누르면 꼭짓점, 끌면 곡선 손잡이, 첫 점을 누르면 닫힌 모양 · 손잡이 끌어 고치기', () => bezierPen()),
  i320: dom('찍은 점이 모눈에 착 (빨간 점선 = 원래 손 위치) — 변 길이 · 각도 · 넓이가 저절로', () => snapTool()),
  i321: dom('자 · 컴퍼스 · 각도기로 작도 — 두 원이 만나는 점으로 정삼각형 그리기', () => instruments()),
  i322: dom('그은 선이 손을 떼는 순간 단단한 물체가 되어 떨어지고 경사판을 굴러감', () => lineToPhysics()),
};

import * as THREE from 'three';
import type { Control, Demo, DemoMap } from './types';

/**
 * 견본 — 손맛 · 주스 (i197 ~ i220)
 * 「Juice it or lose it」 처럼, 되도록 **같은 작은 장면을 왼쪽 끔 / 오른쪽 켬** 으로 나란히 보여 준다.
 * 수학 놀이터 소품(숫자 블록 · 별 · 동전)으로. 2D 캔버스 · DOM(CSS) · 3D 를 기술에 맞게 섞었다.
 */

type G = CanvasRenderingContext2D;
const F = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
const FCSS = F.replace(/"/g, "'");
const TAU = Math.PI * 2;
const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
const clamp01 = (x: number): number => clamp(x, 0, 1);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const smooth = (e0: number, e1: number, x: number): number => {
  const v = clamp01((x - e0) / (e1 - e0));
  return v * v * (3 - 2 * v);
};
const easeOut = (k: number): number => 1 - Math.pow(1 - clamp01(k), 3);
const backOut = (k: number, s = 1.9): number => {
  const x = clamp01(k) - 1;
  return x * x * ((s + 1) * x + s) + 1;
};
const elasticOut = (k: number): number => (k <= 0 ? 0 : k >= 1 ? 1 : Math.pow(2, -10 * k) * Math.sin(((k * 10 - 0.75) * TAU) / 3) + 1);

function hash(i: number, s = 0): number {
  let h = Math.imul((i | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((s | 0) + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
/** 부드러운 1차원 값 잡음 (−1 ~ 1) */
function noise1(x: number, s = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash(i, s), hash(i + 1, s), u) * 2 - 1;
}
function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(hex: string, k: number): string {
  const f = (c: number): number => Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k));
  const [r, g, b] = rgb(hex);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function rgba(hex: string, a: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/* ───────── 2D 그리기 도구 ───────── */
function reset(g: G): void {
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.lineWidth = 1;
  g.setLineDash([]);
  g.shadowBlur = 0;
  g.lineCap = 'butt';
  g.lineJoin = 'miter';
}
function rr(g: G, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, Math.max(0, w), Math.max(0, h), Math.max(0, Math.min(r, w / 2, h / 2)));
}
function bg(g: G, w: number, h: number, a = '#1d2763', b = '#0b1030'): void {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, a);
  gr.addColorStop(1, b);
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  const rg = g.createRadialGradient(w / 2, h * 0.25, 0, w / 2, h * 0.25, Math.max(w, h) * 0.7);
  rg.addColorStop(0, 'rgba(140,160,255,.18)');
  rg.addColorStop(1, 'rgba(140,160,255,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, w, h);
}
function txt(g: G, s: string, x: number, y: number, size: number, color = '#fff', align: CanvasTextAlign = 'center', weight = 800): void {
  g.font = `${weight} ${size}px ${F}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(s, x, y);
}
/** 테두리 굵은 글씨 (게임 글씨) */
function otext(g: G, s: string, x: number, y: number, size: number, fill: string | CanvasGradient, stroke = '#1a1440', lw = size * 0.2, weight = 900): void {
  g.font = `${weight} ${size}px ${F}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.strokeStyle = stroke;
  g.lineWidth = lw;
  g.strokeText(s, x, y);
  g.fillStyle = fill;
  g.fillText(s, x, y);
}
function pill(g: G, s: string, x: number, y: number, size: number, fill: string, fg = '#fff'): void {
  g.font = `800 ${size}px ${F}`;
  const tw = g.measureText(s).width;
  const ph = size * 1.7;
  const pw = tw + size * 1.4;
  rr(g, x - pw / 2, y - ph / 2, pw, ph, ph / 2);
  g.fillStyle = fill;
  g.fill();
  txt(g, s, x, y + size * 0.05, size, fg, 'center', 800);
}
const BLK = ['#ff6b8a', '#ffa94d', '#ffd43b', '#69db7c', '#4dabf7', '#9775fa'];
interface BlockOpt {
  sx?: number;
  sy?: number;
  rot?: number;
  flash?: number;
  alpha?: number;
  ink?: string;
}
/** 숫자 블록 — (cx, by) 가 바닥 가운데 */
function block(g: G, cx: number, by: number, s: number, color: string, label: string, o: BlockOpt = {}): void {
  g.save();
  g.translate(cx, by);
  if (o.rot) g.rotate(o.rot);
  g.scale(o.sx ?? 1, o.sy ?? 1);
  if (o.alpha != null) g.globalAlpha *= o.alpha;
  const x = -s / 2;
  const y = -s;
  const r = s * 0.22;
  if (o.ink) {
    rr(g, x, y, s, s, r);
    g.fillStyle = o.ink;
    g.fill();
    g.restore();
    return;
  }
  rr(g, x, y + s * 0.06, s, s * 0.94, r);
  g.fillStyle = shade(color, -0.38);
  g.fill();
  const gr = g.createLinearGradient(0, y, 0, y + s * 0.88);
  gr.addColorStop(0, shade(color, 0.3));
  gr.addColorStop(1, color);
  rr(g, x, y, s, s * 0.88, r);
  g.fillStyle = gr;
  g.fill();
  rr(g, x + s * 0.12, y + s * 0.07, s * 0.76, s * 0.2, s * 0.1);
  g.fillStyle = 'rgba(255,255,255,.38)';
  g.fill();
  if (label) otext(g, label, 0, y + s * 0.5, s * 0.5, '#fff', shade(color, -0.5), s * 0.09);
  if (o.flash) {
    rr(g, x, y, s, s, r);
    g.fillStyle = `rgba(255,255,255,${clamp01(o.flash)})`;
    g.fill();
  }
  g.restore();
}
function starPath(g: G, x: number, y: number, r: number, rot = 0, inner = 0.5, n = 5): void {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + rot + (i * Math.PI) / n;
    const rad = i % 2 ? r * inner : r;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i) g.lineTo(px, py);
    else g.moveTo(px, py);
  }
  g.closePath();
}
/** 통통한 금별 */
function star(g: G, x: number, y: number, r: number, rot = 0, col = '#ffd43b', sx = 1, sy = 1): void {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.scale(sx, sy);
  g.lineJoin = 'round';
  starPath(g, 0, 0, r, 0, 0.52);
  g.fillStyle = shade(col, -0.45);
  g.strokeStyle = shade(col, -0.45);
  g.lineWidth = r * 0.28;
  g.stroke();
  const gr = g.createLinearGradient(0, -r, 0, r);
  gr.addColorStop(0, shade(col, 0.45));
  gr.addColorStop(0.6, col);
  gr.addColorStop(1, shade(col, -0.15));
  starPath(g, 0, 0, r, 0, 0.52);
  g.fillStyle = gr;
  g.fill();
  starPath(g, 0, -r * 0.08, r * 0.55, 0, 0.5);
  g.fillStyle = 'rgba(255,255,255,.28)';
  g.fill();
  g.restore();
}
/** 금화 — spin 은 앞면 폭 (cos) */
function coin(g: G, x: number, y: number, r: number, spin = 1): void {
  const sx = Math.max(0.12, Math.abs(spin));
  g.save();
  g.translate(x, y);
  g.scale(sx, 1);
  g.beginPath();
  g.arc(0, r * 0.12, r, 0, TAU);
  g.fillStyle = '#b7791f';
  g.fill();
  const gr = g.createLinearGradient(0, -r, 0, r);
  gr.addColorStop(0, '#fff3b0');
  gr.addColorStop(0.5, '#ffd43b');
  gr.addColorStop(1, '#f59f00');
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.fillStyle = gr;
  g.fill();
  g.beginPath();
  g.arc(0, 0, r * 0.72, 0, TAU);
  g.strokeStyle = 'rgba(183,121,31,.75)';
  g.lineWidth = r * 0.13;
  g.stroke();
  if (spin > 0.35) otext(g, '1', 0, r * 0.04, r * 0.95, '#fff8d6', '#c27c0e', r * 0.18);
  g.restore();
}
/** 둥근 공 (숫자) */
function ball(g: G, x: number, y: number, r: number, col: string, label: string, sx = 1, sy = 1): void {
  g.save();
  g.translate(x, y);
  g.scale(sx, sy);
  const gr = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
  gr.addColorStop(0, shade(col, 0.55));
  gr.addColorStop(0.55, col);
  gr.addColorStop(1, shade(col, -0.35));
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.fillStyle = gr;
  g.fill();
  if (label) otext(g, label, 0, r * 0.05, r * 1.05, '#fff', shade(col, -0.5), r * 0.18);
  g.restore();
}
/** 정해진 씨앗으로 퍼지는 불꽃 (상태 없음 — age 만으로 그림) */
function sparks(g: G, x: number, y: number, age: number, n: number, seed: number, dist: number, colors: string[], life = 0.55, grav = 0, size = 3): void {
  if (age < 0 || age > life) return;
  const k = age / life;
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a = hash(i, seed) * TAU;
    const sp = 0.45 + hash(i, seed + 1) * 0.75;
    const d = dist * sp * (1 - Math.pow(1 - k, 2.2));
    const d0 = dist * sp * (1 - Math.pow(1 - Math.max(0, k - 0.09), 2.2));
    const px = x + Math.cos(a) * d;
    const py = y + Math.sin(a) * d + grav * k * k;
    const qx = x + Math.cos(a) * d0;
    const qy = y + Math.sin(a) * d0 + grav * Math.max(0, k - 0.09) ** 2;
    g.strokeStyle = colors[i % colors.length]!;
    g.globalAlpha = 1 - k;
    g.lineWidth = size * (1 - k * 0.7);
    g.beginPath();
    g.moveTo(qx, qy);
    g.lineTo(px, py);
    g.stroke();
  }
  g.restore();
}
function ringFx(g: G, x: number, y: number, age: number, life: number, r0: number, r1: number, col: string, lw: number): void {
  if (age < 0 || age > life) return;
  const k = age / life;
  g.save();
  g.globalAlpha = (1 - k) * 0.9;
  g.strokeStyle = col;
  g.lineWidth = lw * (1 - k * 0.8);
  g.beginPath();
  g.arc(x, y, lerp(r0, r1, easeOut(k)), 0, TAU);
  g.stroke();
  g.restore();
}
/** 빛 번짐 점 */
function glow(g: G, x: number, y: number, r: number, col: string, a = 1): void {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgba(col, a));
  gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}
function ground(g: G, w: number, h: number, gy: number, u: number): void {
  const gr = g.createLinearGradient(0, gy, 0, h);
  gr.addColorStop(0, '#3a4a9a');
  gr.addColorStop(1, '#1a2257');
  g.fillStyle = gr;
  g.fillRect(0, gy, w, h - gy);
  g.fillStyle = 'rgba(255,255,255,.22)';
  g.fillRect(0, gy, w, 1.5 * u);
}
/** 반쪽 장면의 배율 (카드 반쪽 140 × 175 기준) */
const uh = (w: number, h: number): number => Math.min(w / 140, h / 175);
/** 같은 장면을 왼쪽 끔 · 오른쪽 켬 으로 나란히 */
function split(g: G, w: number, h: number, compare: boolean, draw: (g: G, w: number, h: number, on: boolean) => void, names: [string, string] = ['주스 끔', '주스 켬']): void {
  reset(g);
  if (!compare) {
    draw(g, w, h, true);
    reset(g);
    return;
  }
  const hw = w / 2;
  for (let s = 0; s < 2; s++) {
    g.save();
    g.beginPath();
    g.rect(s * hw, 0, hw, h);
    g.clip();
    g.translate(s * hw, 0);
    reset(g);
    draw(g, hw, h, s === 1);
    g.restore();
  }
  reset(g);
  const u = Math.min(w / 280, h / 175);
  g.fillStyle = 'rgba(255,255,255,.8)';
  g.fillRect(hw - u, 0, 2 * u, h);
  pill(g, names[0], hw / 2, 11 * u, 8 * u, 'rgba(14,18,44,.8)', '#a9b3dc');
  pill(g, names[1], hw * 1.5, 11 * u, 8 * u, 'rgba(255,205,60,.95)', '#2a1a00');
}
const tgl = (label: string, value: boolean, on: (v: boolean) => void): Control => ({ type: 'toggle', label, value, on });
const rng = (label: string, min: number, max: number, step: number, value: number, on: (v: number) => void): Control => ({ type: 'range', label, min, max, step, value, on });

/* ═════════════ i197 히트 스톱 ═════════════ */
const D197: Demo = {
  kind: '2d',
  caption: '공이 블록을 쾅 — 오른쪽만 맞는 순간 0.13초 멈칫: 같은 장면인데 훨씬 묵직하다',
  make() {
    let compare = true;
    let stopDur = 0.13;
    let jitter = true;
    const P = 2.3;
    const HIT = 0.62;
    let T = 0;
    const scene = (g: G, w: number, h: number, on: boolean): void => {
      const u = uh(w, h);
      bg(g, w, h);
      const ph = T % P;
      let gt = ph;
      let frozen = false;
      if (on && stopDur > 0) {
        if (ph >= HIT && ph < HIT + stopDur) {
          gt = HIT;
          frozen = true;
        } else if (ph >= HIT + stopDur) gt = ph - stopDur;
      }
      const gy = h * 0.74;
      ground(g, w, h, gy, u);
      const bs = 42 * u;
      const br = 13 * u;
      const bx0 = w * 0.68;
      const a = gt - HIT;
      let bx = bx0;
      let sx = 1;
      let sy = 1;
      let flash = 0;
      if (a >= 0) {
        bx = bx0 + 18 * u * (1 - Math.exp(-a * 7));
        const sq = Math.exp(-a * 9) * Math.cos(a * 34);
        sx = 1 - 0.2 * sq;
        sy = 1 + 0.15 * sq;
        flash = clamp01(1 - a / 0.07) * 0.7;
      }
      if (frozen) {
        sx = 0.78;
        sy = 1.17;
        flash = 0.9;
      }
      let jx = 0;
      let jy = 0;
      if (frozen && jitter) {
        const f = Math.floor(T * 60);
        jx = (hash(f, 3) - 0.5) * 5 * u;
        jy = (hash(f, 4) - 0.5) * 4 * u;
      }
      g.save();
      g.translate(jx, jy);
      // 그림자
      g.fillStyle = 'rgba(0,0,0,.28)';
      g.beginPath();
      g.ellipse(bx, gy + 2 * u, bs * 0.55 * sx, 4 * u, 0, 0, TAU);
      g.fill();
      block(g, bx, gy, bs, '#4dabf7', '7', { sx, sy, flash });
      const contactX = bx0 - (bs / 2) * 0.78 - br * 0.7;
      let x: number;
      let y = gy - br - 8 * u;
      let bsx = 1;
      let bsy = 1;
      if (a < 0) {
        const k = clamp01(gt / HIT);
        const px = (kk: number): number => lerp(-br * 2, contactX, kk * kk);
        for (let j = 3; j >= 1; j--) {
          const kk = clamp01((gt - j * 0.035) / HIT);
          g.globalAlpha = 0.12 * (4 - j);
          ball(g, px(kk), y - Math.sin(kk * Math.PI) * 16 * u, br, '#ff922b', '');
        }
        g.globalAlpha = 1;
        x = px(k);
        y -= Math.sin(k * Math.PI) * 16 * u;
        bsx = 1 + k * k * 0.15;
        bsy = 1 - k * k * 0.1;
      } else {
        x = contactX - 62 * u * (1 - Math.exp(-a * 2.6));
        y = gy - br - Math.abs(Math.sin(a * 5.5)) * 26 * u * Math.exp(-a * 1.4);
      }
      if (frozen) {
        bsx = 0.66;
        bsy = 1.3;
      }
      g.fillStyle = 'rgba(0,0,0,.25)';
      g.beginPath();
      g.ellipse(x, gy + 2 * u, br * 0.9, 3 * u, 0, 0, TAU);
      g.fill();
      ball(g, x, y, br, '#ff922b', '3', bsx, bsy);
      const ix = bx0 - bs / 2;
      const iy = gy - bs * 0.5;
      if (frozen) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        glow(g, ix, iy, 46 * u, '#fff3a0', 0.9);
        g.restore();
        starPath(g, ix, iy, 30 * u, T * 3, 0.32, 8);
        g.fillStyle = '#fffbe0';
        g.fill();
        starPath(g, ix, iy, 18 * u, -T * 2, 0.4, 6);
        g.fillStyle = '#ffd43b';
        g.fill();
      }
      if (a >= 0) {
        sparks(g, ix, iy, a, 16, 7, 54 * u, ['#fff3a0', '#ffd43b', '#ff922b'], 0.5, 20 * u, 3 * u);
        ringFx(g, ix, iy, a, 0.35, 8 * u, 40 * u, '#ffffff', 4 * u);
      }
      g.restore();
      if (frozen) pill(g, `멈칫 ${Math.round(stopDur * 1000)}ms`, w / 2, h * 0.88, 8.5 * u, '#ff4d6d', '#fff');
    };
    return {
      draw(g, w, h, t) {
        T = t;
        split(g, w, h, compare, scene);
      },
      controls: [
        tgl('나란히 비교 (끔 | 켬)', compare, (v) => (compare = v)),
        rng('멈추는 시간 (초)', 0, 0.3, 0.01, stopDur, (v) => (stopDur = v)),
        tgl('멈춘 동안 바르르', jitter, (v) => (jitter = v)),
      ],
    };
  },
};

/* ═════════════ i198 트라우마 흔들기 ═════════════ */
const D198: Demo = {
  kind: '2d',
  caption: '틀릴 때마다 trauma 가 쌓이고 흔들림은 trauma² × 잡음 — 연달아 틀리면 확 세지고 부드럽게 잦아든다',
  make() {
    let compare = true;
    let maxOff = 10;
    let squared = true;
    const P = 3.8;
    const HITS = [0.35, 1.0, 1.22, 1.44];
    const WRONG = [0, 2, 3, 0];
    const ANS = ['36', '42', '48', '49'];
    let T = 0;
    const trauma = (ph: number): number => {
      let tr = 0;
      let last = 0;
      for (const e of HITS) {
        if (e > ph) break;
        tr = Math.min(1, Math.max(0, tr - (e - last) * 0.75) + 0.38);
        last = e;
      }
      return Math.max(0, tr - (ph - last) * 0.75);
    };
    const scene = (g: G, w: number, h: number, on: boolean): void => {
      const u = uh(w, h);
      bg(g, w, h, '#2a1f5e', '#100b2c');
      const ph = T % P;
      const tr = trauma(ph);
      const sh = squared ? tr * tr : tr;
      g.save();
      if (on) {
        const n = T * 24;
        g.translate(w / 2 + maxOff * u * sh * noise1(n, 1), h * 0.45 + maxOff * u * sh * noise1(n, 2));
        g.rotate(0.07 * sh * noise1(n, 3));
        g.translate(-w / 2, -h * 0.45);
      }
      // 문제 카드
      const cw = 116 * u;
      const ch = 104 * u;
      const cx = w / 2 - cw / 2;
      const cy = h * 0.2;
      rr(g, cx, cy + 3 * u, cw, ch, 12 * u);
      g.fillStyle = '#0a0720';
      g.fill();
      rr(g, cx, cy, cw, ch, 12 * u);
      g.fillStyle = '#fff8ec';
      g.fill();
      otext(g, '6 × 7 = ?', w / 2, cy + 20 * u, 15 * u, '#3b2f8f', '#fff8ec', 0.1);
      const tw = 48 * u;
      const th = 28 * u;
      for (let i = 0; i < 4; i++) {
        const tx = w / 2 + (i % 2 ? 4 * u : -tw - 4 * u);
        const ty = cy + 38 * u + Math.floor(i / 2) * (th + 6 * u);
        let col = '#9775fa';
        let age = 99;
        for (let k = 0; k < HITS.length; k++) if (WRONG[k] === i && ph >= HITS[k]!) age = ph - HITS[k]!;
        const red = age < 0.35;
        const right = i === 1 && ph > 2.6;
        if (red) col = '#ff4d6d';
        if (right) col = '#40c057';
        rr(g, tx, ty + 3 * u, tw, th, 8 * u);
        g.fillStyle = shade(col, -0.4);
        g.fill();
        rr(g, tx, ty, tw, th, 8 * u);
        g.fillStyle = col;
        g.fill();
        otext(g, ANS[i]!, tx + tw / 2, ty + th / 2, 13 * u, '#fff', shade(col, -0.5), 2.4 * u);
        if (red) otext(g, '✗', tx + tw - 7 * u, ty + 5 * u, 11 * u, '#fff', '#c92a2a', 2 * u);
        if (right) otext(g, '✓', tx + tw - 7 * u, ty + 5 * u, 11 * u, '#fff', '#2b8a3e', 2 * u);
      }
      g.restore();
      // 붉은 가장자리 (켬)
      if (on && tr > 0.01) {
        const rg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
        rg.addColorStop(0, 'rgba(255,40,80,0)');
        rg.addColorStop(1, `rgba(255,40,80,${0.45 * sh})`);
        g.fillStyle = rg;
        g.fillRect(0, 0, w, h);
      }
      // 계기
      const by = h * 0.86;
      const bw = w - 34 * u;
      const bars: [string, number, string][] = [
        ['trauma', tr, '#ffa94d'],
        [squared ? '흔들림 ²' : '흔들림', on ? sh : 0, '#ff4d6d'],
      ];
      bars.forEach(([name, v, c], i) => {
        const yy = by + i * 11 * u;
        txt(g, name, 6 * u, yy, 7 * u, '#c9c3ff', 'left', 700);
        rr(g, 30 * u, yy - 3 * u, bw - 4 * u, 6 * u, 3 * u);
        g.fillStyle = 'rgba(255,255,255,.12)';
        g.fill();
        rr(g, 30 * u, yy - 3 * u, (bw - 4 * u) * v, 6 * u, 3 * u);
        g.fillStyle = c;
        g.fill();
      });
    };
    return {
      draw(g, w, h, t) {
        T = t;
        split(g, w, h, compare, scene);
      },
      controls: [
        tgl('나란히 비교 (끔 | 켬)', compare, (v) => (compare = v)),
        rng('최대 흔들림 (px)', 2, 24, 1, maxOff, (v) => (maxOff = v)),
        tgl('trauma² (제곱)', squared, (v) => (squared = v)),
      ],
    };
  },
};

/* ═════════════ i199 카메라 킥 · 펀치 줌 ═════════════ */
const D199: Demo = {
  kind: '2d',
  caption: '블록이 자리에 딱 — 오른쪽은 화면이 때린 쪽으로 툭 밀렸다 스프링처럼 돌아오고 순간 4% 확대',
  make() {
    let compare = true;
    let power = 1;
    const P = 2.1;
    const HIT = 0.72;
    let T = 0;
    const scene = (g: G, w: number, h: number, on: boolean): void => {
      const u = uh(w, h);
      const ph = T % P;
      const a = ph - HIT;
      const W = 13;
      const k = a >= 0 ? a * W * Math.E * Math.exp(-a * W) : 0;
      g.save();
      if (on) {
        const z = 1 + 0.045 * power * k;
        g.translate(w / 2 + 9 * u * power * k, h / 2 + 3 * u * power * k);
        g.scale(z, z);
        g.translate(-w / 2, -h / 2);
      }
      bg(g, w, h, '#18306a', '#0a1430');
      // 모눈 점 (움직임이 보이게)
      g.fillStyle = 'rgba(160,190,255,.25)';
      for (let y = 8 * u; y < h; y += 14 * u) for (let x = 6 * u; x < w; x += 14 * u) g.fillRect(x, y, 1.6 * u, 1.6 * u);
      // 판
      const bx = w / 2 - 60 * u;
      const by = h * 0.5;
      rr(g, bx, by, 120 * u, 50 * u, 10 * u);
      g.fillStyle = '#5c3d1e';
      g.fill();
      rr(g, bx + 3 * u, by + 3 * u, 114 * u, 44 * u, 8 * u);
      g.fillStyle = '#8b5a2b';
      g.fill();
      const slots = ['4', '5', '6'];
      const sx0 = [w / 2 - 36 * u, w / 2, w / 2 + 36 * u];
      const s = 28 * u;
      slots.forEach((n, i) => {
        const x = sx0[i]!;
        rr(g, x - s / 2 - 2 * u, by + 9 * u, s + 4 * u, s + 4 * u, 7 * u);
        g.fillStyle = i === 1 && a >= 0 ? '#2f9e44' : '#3d2410';
        g.fill();
        txt(g, n, x, by + 25 * u, 12 * u, 'rgba(255,230,190,.45)', 'center', 900);
      });
      if (a >= 0) {
        const gl = Math.exp(-a * 3);
        g.save();
        g.globalCompositeOperation = 'lighter';
        glow(g, w / 2, by + 25 * u, 40 * u, '#8ce99a', 0.7 * gl);
        g.restore();
      }
      // 블록: 위에서 미끄러져 와 쏙
      const tx = w / 2;
      const ty = by + 41 * u;
      let x: number;
      let y: number;
      let sq = 1;
      if (a < 0) {
        const kk = clamp01(ph / HIT);
        const e = kk * kk * kk;
        x = lerp(-30 * u, tx, e);
        y = lerp(h * 0.2, ty, e) - Math.sin(kk * Math.PI) * 30 * u;
      } else {
        x = tx;
        y = ty;
        sq = 1 - 0.18 * Math.exp(-a * 10) * Math.cos(a * 30);
      }
      block(g, x, y, s, '#ff6b8a', '5', { sx: 2 - sq, sy: sq });
      if (a >= 0) {
        sparks(g, tx, by + 25 * u, a, 14, 11, 44 * u, ['#fff', '#b2f2bb', '#ffe066'], 0.5, 0, 2.6 * u);
        const pk = backOut(a / 0.3);
        if (a < 1.1) {
          g.save();
          g.globalAlpha = 1 - smooth(0.8, 1.1, a);
          g.translate(w / 2, h * 0.3 - a * 8 * u);
          g.scale(pk, pk);
          otext(g, '딱!', 0, 0, 22 * u, '#ffe066', '#7a3b00', 4 * u);
          g.restore();
        }
      }
      g.restore();
    };
    return {
      draw(g, w, h, t) {
        T = t;
        split(g, w, h, compare, scene);
      },
      controls: [tgl('나란히 비교 (끔 | 켬)', compare, (v) => (compare = v)), rng('세기', 0, 3, 0.1, power, (v) => (power = v))],
    };
  },
};

/* ═════════════ i200 임팩트 프레임 ═════════════ */
const D200: Demo = {
  kind: '2d',
  caption: '필살 투구가 블록에 꽂히는 순간 두 프레임 — 흑백 반전 · 실루엣 + 집중선, 애니 필살기 느낌',
  make() {
    let compare = true;
    let frameMs = 70;
    let lines = true;
    const P = 2.4;
    const HIT = 0.85;
    let T = 0;
    const scene = (g: G, w: number, h: number, on: boolean): void => {
      const u = uh(w, h);
      const ph = T % P;
      const fd = frameMs / 1000;
      let mode = 0;
      let gt = ph;
      if (on) {
        if (ph >= HIT && ph < HIT + fd) mode = 1;
        else if (ph >= HIT + fd && ph < HIT + 2 * fd) mode = 2;
        if (ph >= HIT && ph < HIT + 2 * fd) gt = HIT;
        else if (ph >= HIT + 2 * fd) gt = ph - 2 * fd;
      }
      const C = (c: string): string => (mode === 0 ? c : mode === 1 ? '#000' : '#fff');
      if (mode === 0) bg(g, w, h, '#2b1650', '#0d0620');
      else {
        g.fillStyle = mode === 1 ? '#fff' : '#000';
        g.fillRect(0, 0, w, h);
      }
      const ix = w * 0.66;
      const iy = h * 0.52;
      if (mode === 0) {
        for (let i = 0; i < 18; i++) {
          g.fillStyle = `rgba(255,255,255,${0.25 + hash(i, 5) * 0.5})`;
          g.fillRect(hash(i, 1) * w, hash(i, 2) * h * 0.7, 1.4 * u, 1.4 * u);
        }
      }
      // 집중선
      if (mode > 0 && lines) {
        g.fillStyle = mode === 1 ? '#000' : '#fff';
        for (let i = 0; i < 40; i++) {
          const an = (i / 40) * TAU + hash(i, Math.floor(T * 30)) * 0.12;
          const r0 = (26 + hash(i, 9) * 30) * u;
          const R = 240 * u;
          const wd = 0.035 + hash(i, 4) * 0.03;
          g.beginPath();
          g.moveTo(ix + Math.cos(an) * r0, iy + Math.sin(an) * r0);
          g.lineTo(ix + Math.cos(an - wd) * R, iy + Math.sin(an - wd) * R);
          g.lineTo(ix + Math.cos(an + wd) * R, iy + Math.sin(an + wd) * R);
          g.fill();
        }
      }
      const gy = h * 0.8;
      g.fillStyle = mode === 0 ? '#22113f' : C('');
      if (mode === 0) g.fillRect(0, gy, w, h - gy);
      const a = gt - HIT;
      const bs = 40 * u;
      if (a <= 0) {
        block(g, ix, iy + bs / 2, bs, '#9775fa', '9', mode ? { ink: C('') } : {});
      } else {
        // 조각
        for (let i = 0; i < 9; i++) {
          const an = -Math.PI * 0.15 + (hash(i, 21) - 0.5) * 2.4;
          const sp = (50 + hash(i, 22) * 70) * u;
          const px = ix + Math.cos(an) * sp * a + 10 * u;
          const py = iy + Math.sin(an) * sp * a - 40 * u * a + 160 * u * a * a;
          const sz = (8 + hash(i, 23) * 8) * u;
          g.save();
          g.translate(px, py);
          g.rotate(a * (hash(i, 24) - 0.5) * 14);
          g.fillStyle = mode ? C('') : BLK[i % 6]!;
          g.globalAlpha = 1 - smooth(0.6, 1.0, a);
          rr(g, -sz / 2, -sz / 2, sz, sz, 2 * u);
          g.fill();
          g.restore();
        }
      }
      // 공 (불꽃 꼬리)
      const br = 11 * u;
      let bxp: number;
      let byp: number;
      if (a < 0) {
        const kk = clamp01(gt / HIT);
        const e = kk * kk;
        bxp = lerp(-20 * u, ix - bs / 2 - br * 0.3, e);
        byp = lerp(h * 0.85, iy, e) - Math.sin(kk * Math.PI) * 20 * u;
      } else {
        bxp = ix + a * 140 * u;
        byp = iy - a * 50 * u;
      }
      if (mode === 0 && a < 0.3) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        for (let j = 1; j < 9; j++) {
          const kk = clamp01((gt - j * 0.025) / HIT);
          const e = kk * kk;
          const px = lerp(-20 * u, ix - bs / 2 - br * 0.3, e);
          const py = lerp(h * 0.85, iy, e) - Math.sin(kk * Math.PI) * 20 * u;
          glow(g, px, py, br * (1.8 - j * 0.12), j < 3 ? '#ffe066' : '#ff6b2b', 0.55 - j * 0.05);
        }
        g.restore();
      }
      if (mode) {
        g.beginPath();
        g.arc(bxp, byp, br, 0, TAU);
        g.fillStyle = C('');
        g.fill();
      } else {
        g.beginPath();
        g.arc(bxp, byp, br, 0, TAU);
        g.fillStyle = '#fbfbf6';
        g.fill();
        g.strokeStyle = '#e03131';
        g.lineWidth = 1.6 * u;
        g.beginPath();
        g.arc(bxp - br * 1.25, byp, br, -0.8, 0.8);
        g.stroke();
        g.beginPath();
        g.arc(bxp + br * 1.25, byp, br, Math.PI - 0.8, Math.PI + 0.8);
        g.stroke();
      }
      if (a >= 0 && mode === 0) {
        sparks(g, ix - 10 * u, iy, a, 20, 31, 70 * u, ['#fff', '#ffe066', '#ff922b'], 0.5, 0, 3 * u);
        ringFx(g, ix - 10 * u, iy, a, 0.3, 10 * u, 60 * u, '#fff', 5 * u);
      }
      if (mode) otext(g, '쾅!', w * 0.36, h * 0.28, 26 * u, mode === 1 ? '#fff' : '#000', mode === 1 ? '#000' : '#fff', 5 * u);
    };
    return {
      draw(g, w, h, t) {
        T = t;
        split(g, w, h, compare, scene);
      },
      controls: [
        tgl('나란히 비교 (끔 | 켬)', compare, (v) => (compare = v)),
        rng('한 프레임 길이 (ms)', 16, 200, 2, frameMs, (v) => (frameMs = v)),
        tgl('집중선', lines, (v) => (lines = v)),
      ],
    };
  },
};

/* ═════════════ i202 튀어 오르는 숫자 ═════════════ */
const D202: Demo = {
  kind: '2d',
  caption: '+10 · ×2 · 크리티컬 +50 · −3 — 톡 튀어 커졌다 떠오르며 사라짐 (왼쪽은 그냥 글자가 떠오름)',
  make() {
    let compare = true;
    let big = 1;
    const P = 3.2;
    const EV: { t: number; i: number; s: string; kind: 'n' | 'crit' | 'neg' }[] = [
      { t: 0.2, i: 0, s: '+10', kind: 'n' },
      { t: 0.85, i: 1, s: '×2', kind: 'n' },
      { t: 1.5, i: 2, s: '+50', kind: 'crit' },
      { t: 2.3, i: 0, s: '−3', kind: 'neg' },
    ];
    const LIFE = 1.1;
    let T = 0;
    const scene = (g: G, w: number, h: number, on: boolean): void => {
      const u = uh(w, h);
      bg(g, w, h, '#123c5c', '#081a2c');
      const ph = T % P;
      const gy = h * 0.8;
      ground(g, w, h, gy, u);
      const s = 32 * u;
      const xs = [w * 0.2, w * 0.5, w * 0.8];
      const cols = ['#ffa94d', '#69db7c', '#ff6b8a'];
      const labels = ['5', '2', '8'];
      xs.forEach((x, i) => {
        let sq = 1;
        let fl = 0;
        for (const e of EV) {
          const a = ph - e.t;
          if (e.i === i && a >= 0 && a < 0.6) {
            if (on) sq = 1 - 0.22 * Math.exp(-a * 9) * Math.cos(a * 32);
            if (on) fl = clamp01(1 - a / 0.08) * 0.6;
          }
        }
        block(g, x, gy, s, cols[i]!, labels[i]!, { sx: 2 - sq, sy: sq, flash: fl });
      });
      for (const e of EV) {
        const a = ph - e.t;
        if (a < 0 || a > LIFE) continue;
        const x0 = xs[e.i]!;
        const y0 = gy - s - 6 * u;
        // 누른 자리 물결
        ringFx(g, x0, gy - s / 2, a, 0.35, 4 * u, 20 * u, '#ffffff', 2 * u);
        if (!on) {
          g.globalAlpha = 1 - a / LIFE;
          txt(g, e.s, x0, y0 - a * 22 * u, 11 * u, '#fff', 'center', 700);
          g.globalAlpha = 1;
          continue;
        }
        const crit = e.kind === 'crit';
        const neg = e.kind === 'neg';
        const sc = elasticOut(a / 0.45) * (crit ? 1.55 : 1) * big;
        const rise = neg ? 16 * u * easeOut(a / 0.4) - 18 * u * smooth(0.4, LIFE, a) : 36 * u * easeOut(a / LIFE);
        const alpha = 1 - smooth(0.75, LIFE, a);
        let jx = 0;
        let rot = 0;
        if (crit) {
          jx = Math.sin(a * 70) * 3 * u * Math.exp(-a * 5);
          rot = Math.sin(a * 40) * 0.18 * Math.exp(-a * 4);
        }
        if (neg) jx = Math.sin(a * 60) * 2.5 * u * Math.exp(-a * 6);
        g.save();
        g.globalAlpha = alpha;
        g.translate(x0 + jx, y0 - rise);
        g.rotate(rot);
        g.scale(sc, sc);
        const fill = g.createLinearGradient(0, -10 * u, 0, 10 * u);
        if (crit) {
          fill.addColorStop(0, '#fff9db');
          fill.addColorStop(1, '#ffb400');
        } else if (neg) {
          fill.addColorStop(0, '#ffc9d3');
          fill.addColorStop(1, '#ff3b5c');
        } else {
          fill.addColorStop(0, '#ffffff');
          fill.addColorStop(1, '#8ce99a');
        }
        if (crit) {
          g.save();
          g.globalCompositeOperation = 'lighter';
          glow(g, 0, 0, 26 * u, '#ffd43b', 0.55);
          g.restore();
          otext(g, '크리티컬!', 0, -14 * u, 6.5 * u, '#fff', '#c2410c', 1.6 * u);
        }
        otext(g, e.s, 0, 0, 15 * u, fill, neg ? '#5c0011' : crit ? '#7a3000' : '#0b3d1a', 3.4 * u);
        g.restore();
        if (crit) sparks(g, x0, y0 - 10 * u, a, 12, 41, 36 * u, ['#fff3a0', '#ffd43b'], 0.6, 0, 2.4 * u);
      }
    };
    return {
      draw(g, w, h, t) {
        T = t;
        split(g, w, h, compare, scene);
      },
      controls: [tgl('나란히 비교 (끔 | 켬)', compare, (v) => (compare = v)), rng('글자 크기', 0.6, 1.6, 0.05, big, (v) => (big = v))],
    };
  },
};

/* ═════════════ i204 슬로모션 · 시간 배율 곡선 ═════════════ */
const D204: Demo = {
  kind: '2d',
  caption: '마지막 블록이 닿기 직전 시간이 0.15배로 늘어졌다가 「쾅」 하는 순간 원래 속도 — 아래는 시간 배율 그래프',
  make() {
    let on = true;
    let minS = 0.15;
    let gtime = 0;
    let wait = 0;
    const N = 200;
    const hist = new Float32Array(N).fill(1);
    let hi = 0;
    let acc = 0;
    let curS = 1;
    const GC = 1.0;
    const sAt = (gt: number): number => {
      if (!on) return 1;
      if (gt >= GC) return 1;
      const d = GC - gt;
      return minS + (1 - minS) * smooth(0.06, 0.42, d);
    };
    return {
      draw(g, w, h, _t, dt0) {
        reset(g);
        const dt = Math.min(dt0, 0.05);
        const u = Math.min(w / 280, h / 175);
        if (wait > 0) {
          wait -= dt;
          curS = 1;
        } else {
          curS = sAt(gtime);
          gtime += dt * curS;
          if (gtime > GC + 1.3) {
            gtime = 0;
            wait = 0.25;
          }
        }
        acc += dt;
        while (acc > 1 / 50) {
          acc -= 1 / 50;
          hist[hi] = curS;
          hi = (hi + 1) % N;
        }
        const top = h * 0.74;
        const a = gtime - GC;
        // 흔들기
        g.save();
        if (a >= 0 && a < 0.4) {
          const k = Math.exp(-a * 9) * 4 * u;
          g.translate(noise1(a * 60, 1) * k, noise1(a * 60, 2) * k);
        }
        bg(g, w, top, '#1f3b73', '#0d1a3a');
        ground(g, w, top, top * 0.86, u);
        const gy = top * 0.86;
        const s = 26 * u;
        const cx = w * 0.5;
        const stack = ['1', '2', '3'];
        stack.forEach((n, i) => block(g, cx, gy - i * s * 0.94, s, BLK[i + 2]!, n));
        const landY = gy - 3 * s * 0.94;
        const y0 = -s * 0.3;
        const fy = (gt: number): number => lerp(y0, landY, clamp01(gt / GC) ** 2);
        const fx = (gt: number): number => cx + Math.sin(gt * 4) * 6 * u * (1 - clamp01(gt / GC));
        if (a < 0) {
          const slow = 1 - curS;
          if (slow > 0.05) {
            for (let j = 1; j <= 4; j++) {
              const gg = Math.max(0, gtime - j * 0.05);
              block(g, fx(gg), fy(gg), s, '#ff6b8a', '', { alpha: 0.13 * (5 - j) * slow, rot: Math.sin(gg * 3) * 0.25 * (1 - gg / GC) });
            }
          }
          block(g, fx(gtime), fy(gtime), s, '#ff6b8a', '4', { rot: Math.sin(gtime * 3) * 0.25 * (1 - gtime / GC) });
        } else {
          const sq = 1 - 0.2 * Math.exp(-a * 10) * Math.cos(a * 30);
          block(g, cx, landY, s, '#ff6b8a', '4', { sx: 2 - sq, sy: sq, flash: clamp01(1 - a / 0.1) * 0.7 });
          sparks(g, cx, landY - s, a, 18, 3, 60 * u, ['#fff', '#ffe066', '#ffa94d'], 0.6, 0, 2.6 * u);
          ringFx(g, cx, landY - s / 2, a, 0.4, 10 * u, 70 * u, '#ffffff', 3 * u);
          if (a < 1.2) {
            g.save();
            g.globalAlpha = 1 - smooth(0.9, 1.2, a);
            const k = backOut(a / 0.35);
            g.translate(cx + 62 * u, top * 0.32);
            g.scale(k, k);
            otext(g, '완성!', 0, 0, 20 * u, '#ffe066', '#6b2c00', 4 * u);
            g.restore();
          }
        }
        // 느려진 느낌: 푸른 막 + 가장자리
        const slow = a < 0 ? 1 - curS : 0;
        if (slow > 0.02) {
          g.fillStyle = `rgba(80,140,255,${0.16 * slow})`;
          g.fillRect(0, 0, w, top);
          const rg = g.createRadialGradient(w / 2, top / 2, top * 0.3, w / 2, top / 2, w * 0.7);
          rg.addColorStop(0, 'rgba(0,10,40,0)');
          rg.addColorStop(1, `rgba(0,10,40,${0.6 * slow})`);
          g.fillStyle = rg;
          g.fillRect(0, 0, w, top);
        }
        g.restore();
        pill(g, `시간 ×${curS.toFixed(2)}`, 38 * u, 13 * u, 8 * u, curS < 0.9 ? '#4c6ef5' : 'rgba(255,255,255,.18)', '#fff');
        if (curS < 0.6) pill(g, '♪ 소리도 낮게', 104 * u, 13 * u, 7 * u, 'rgba(76,110,245,.55)', '#dbe4ff');
        // 그래프
        const gx = 8 * u;
        const gyy = top + 6 * u;
        const gw = w - 16 * u;
        const gh = h - gyy - 6 * u;
        rr(g, gx, gyy, gw, gh, 6 * u);
        g.fillStyle = '#0a0f26';
        g.fill();
        txt(g, '시간 배율', gx + 6 * u, gyy + 7 * u, 6.5 * u, '#8f9bd6', 'left', 700);
        g.strokeStyle = 'rgba(255,255,255,.12)';
        g.setLineDash([3 * u, 3 * u]);
        g.beginPath();
        g.moveTo(gx + 40 * u, gyy + 6 * u);
        g.lineTo(gx + gw - 4 * u, gyy + 6 * u);
        g.stroke();
        g.setLineDash([]);
        g.beginPath();
        for (let i = 0; i < N; i++) {
          const v = hist[(hi + i) % N]!;
          const px = gx + 40 * u + ((gw - 46 * u) * i) / (N - 1);
          const py = gyy + 6 * u + (1 - v) * (gh - 12 * u);
          if (i) g.lineTo(px, py);
          else g.moveTo(px, py);
        }
        g.strokeStyle = '#74c0fc';
        g.lineWidth = 2 * u;
        g.lineJoin = 'round';
        g.stroke();
        txt(g, '1', gx + 36 * u, gyy + 6 * u, 6 * u, '#8f9bd6', 'right', 700);
        txt(g, '0', gx + 36 * u, gyy + gh - 6 * u, 6 * u, '#8f9bd6', 'right', 700);
        reset(g);
      },
      controls: [
        tgl('슬로모션 켜기', on, (v) => (on = v)),
        rng('가장 느릴 때 배율', 0.05, 0.8, 0.01, minS, (v) => (minS = v)),
        { type: 'button', label: '처음부터', on: () => ((gtime = 0), (wait = 0)) },
      ],
    };
  },
};

/* ═════════════ i205 따라가는 카메라 ═════════════ */
const D205: Demo = {
  kind: '2d',
  caption: '수직선을 걷는 친구 — 노란 창(데드존) 안에선 카메라가 가만, 달리면 가는 쪽을 더 보여 준다(앞보기)',
  make() {
    let dead = true;
    let look = true;
    let soft = true;
    let cam = 8;
    let focus = 8;
    let lead = 0;
    let prevX = 8;
    let vel = 0;
    const P = 11;
    const KEYS: [number, number][] = [
      [0, 8],
      [2.2, 8],
      [4.6, 25],
      [6.4, 25],
      [9.2, 9],
      [11, 8],
    ];
    const charX = (ph: number): number => {
      for (let i = 0; i < KEYS.length - 1; i++) {
        const [t0, x0] = KEYS[i]!;
        const [t1, x1] = KEYS[i + 1]!;
        if (ph >= t0 && ph <= t1) {
          const k = (ph - t0) / (t1 - t0);
          if (x0 === x1) return x0 + Math.sin(k * Math.PI * 4) * 0.75 * Math.sin(k * Math.PI);
          return lerp(x0, x1, (1 - Math.cos(k * Math.PI)) / 2);
        }
      }
      return 8;
    };
    const D = 1.8;
    const L = 3.2;
    const VW = 13;
    const WMAX = 34;
    return {
      draw(g, w, h, t, dt0) {
        reset(g);
        const dt = Math.max(1e-4, Math.min(dt0, 0.05));
        const u = Math.min(w / 280, h / 175);
        const x = charX(t % P);
        vel = lerp(vel, (x - prevX) / dt, 1 - Math.exp(-dt * 10));
        if (Math.abs(x - prevX) > 5) vel = 0;
        prevX = x;
        if (dead) {
          if (x > focus + D) focus = x - D;
          if (x < focus - D) focus = x + D;
        } else focus = x;
        lead = lerp(lead, look ? clamp(vel * 0.55, -L, L) : 0, 1 - Math.exp(-dt * 2.5));
        const target = clamp(focus + lead, VW / 2 - 1, WMAX - VW / 2 + 1);
        cam = soft ? lerp(cam, target, 1 - Math.exp(-dt * 5)) : target;
        const ppu = w / VW;
        const SX = (wx: number): number => (wx - cam) * ppu + w / 2;
        // 하늘 · 먼 언덕 (시차)
        bg(g, w, h, '#4b7bd8', '#a5d8ff');
        const gy = h * 0.72;
        g.fillStyle = '#7fb3e0';
        g.beginPath();
        g.moveTo(0, gy);
        for (let i = 0; i <= 40; i++) {
          const px = (i / 40) * w;
          const wx = (px - w / 2) / ppu + cam * 0.35;
          g.lineTo(px, gy - (18 + 14 * Math.sin(wx * 0.5) + 8 * Math.sin(wx * 1.3)) * u);
        }
        g.lineTo(w, gy);
        g.fill();
        g.fillStyle = '#5fa463';
        g.beginPath();
        g.moveTo(0, gy);
        for (let i = 0; i <= 40; i++) {
          const px = (i / 40) * w;
          const wx = (px - w / 2) / ppu + cam * 0.65;
          g.lineTo(px, gy - (8 + 7 * Math.sin(wx * 0.9 + 1) + 4 * Math.sin(wx * 2.1)) * u);
        }
        g.lineTo(w, gy);
        g.fill();
        // 땅 + 수직선
        g.fillStyle = '#7bc96f';
        g.fillRect(0, gy, w, h - gy);
        g.fillStyle = '#5aa84e';
        g.fillRect(0, gy, w, 3 * u);
        g.fillStyle = '#c99a5b';
        g.fillRect(0, gy + 10 * u, w, h);
        g.strokeStyle = '#fff';
        g.lineWidth = 2 * u;
        g.beginPath();
        g.moveTo(0, gy + 18 * u);
        g.lineTo(w, gy + 18 * u);
        g.stroke();
        for (let n = Math.floor(cam - VW / 2) - 1; n <= cam + VW / 2 + 1; n++) {
          if (n < 0 || n > WMAX) continue;
          const px = SX(n);
          g.fillStyle = '#fff';
          g.fillRect(px - u, gy + 13 * u, 2 * u, 10 * u);
          txt(g, String(n), px, gy + 32 * u, (n % 5 === 0 ? 11 : 8.5) * u, n % 5 === 0 ? '#fff' : 'rgba(255,255,255,.75)', 'center', 900);
          if (n % 5 === 0 && n > 0) {
            g.fillStyle = '#6b4b2a';
            g.fillRect(px - u, gy - 26 * u, 2 * u, 26 * u);
            g.fillStyle = n === 25 ? '#ffd43b' : '#ff6b8a';
            g.beginPath();
            g.moveTo(px + u, gy - 26 * u);
            g.lineTo(px + 14 * u, gy - 21 * u);
            g.lineTo(px + u, gy - 16 * u);
            g.fill();
          }
        }
        // 데드존 · 앞보기 표시
        if (dead) {
          const x0 = SX(focus - D);
          const x1 = SX(focus + D);
          g.fillStyle = 'rgba(255,212,59,.13)';
          g.fillRect(x0, gy - 62 * u, x1 - x0, 60 * u);
          g.strokeStyle = 'rgba(255,212,59,.9)';
          g.setLineDash([4 * u, 3 * u]);
          g.lineWidth = 1.4 * u;
          g.strokeRect(x0, gy - 62 * u, x1 - x0, 60 * u);
          g.setLineDash([]);
        }
        const px = SX(x);
        if (look && Math.abs(lead) > 0.15) {
          const ex = SX(x + lead);
          const ay = gy - 52 * u;
          g.strokeStyle = '#74f0ff';
          g.fillStyle = '#74f0ff';
          g.lineWidth = 2 * u;
          g.beginPath();
          g.moveTo(px, ay);
          g.lineTo(ex, ay);
          g.stroke();
          const dir = Math.sign(lead);
          g.beginPath();
          g.moveTo(ex + dir * 5 * u, ay);
          g.lineTo(ex - dir * 2 * u, ay - 4 * u);
          g.lineTo(ex - dir * 2 * u, ay + 4 * u);
          g.fill();
          txt(g, '앞보기', (px + ex) / 2, ay - 7 * u, 6.5 * u, '#74f0ff', 'center', 800);
        }
        // 친구
        const run = Math.abs(vel) > 0.6;
        const hop = run ? Math.abs(Math.sin(t * 14)) * 5 * u : Math.abs(Math.sin(t * 6)) * 1.5 * u;
        const face = vel >= -0.05 ? 1 : -1;
        g.fillStyle = 'rgba(0,0,0,.2)';
        g.beginPath();
        g.ellipse(px, gy + 1 * u, 10 * u, 2.6 * u, 0, 0, TAU);
        g.fill();
        g.save();
        g.translate(px, gy - hop);
        g.scale(1 + (run ? 0.06 : 0), 1 - (run ? 0.06 : 0));
        ball(g, 0, -13 * u, 13 * u, '#ff922b', '');
        g.fillStyle = '#fff';
        g.beginPath();
        g.ellipse(face * 4 * u, -16 * u, 3.2 * u, 4 * u, 0, 0, TAU);
        g.ellipse(face * 10 * u, -16 * u, 2.6 * u, 3.6 * u, 0, 0, TAU);
        g.fill();
        g.fillStyle = '#1a1033';
        g.beginPath();
        g.arc(face * 5 * u, -15.5 * u, 1.7 * u, 0, TAU);
        g.arc(face * 10.8 * u, -15.5 * u, 1.5 * u, 0, TAU);
        g.fill();
        g.restore();
        // 화면 가운데 (카메라)
        g.strokeStyle = 'rgba(255,255,255,.6)';
        g.lineWidth = 1.2 * u;
        g.beginPath();
        g.moveTo(w / 2 - 6 * u, h * 0.2);
        g.lineTo(w / 2 + 6 * u, h * 0.2);
        g.moveTo(w / 2, h * 0.2 - 6 * u);
        g.lineTo(w / 2, h * 0.2 + 6 * u);
        g.stroke();
        // 작은 지도
        const mx = 70 * u;
        const mw = w - 80 * u;
        const my = 7 * u;
        rr(g, mx - 4 * u, my - 3 * u, mw + 8 * u, 16 * u, 5 * u);
        g.fillStyle = 'rgba(10,20,50,.6)';
        g.fill();
        const MX = (wx: number): number => mx + (wx / WMAX) * mw;
        g.fillStyle = 'rgba(255,255,255,.35)';
        g.fillRect(mx, my + 5 * u, mw, 1.5 * u);
        g.strokeStyle = '#fff';
        g.lineWidth = 1.3 * u;
        g.strokeRect(MX(cam - VW / 2), my, MX(cam + VW / 2) - MX(cam - VW / 2), 11 * u);
        g.fillStyle = '#ff922b';
        g.beginPath();
        g.arc(MX(x), my + 5.5 * u, 2.6 * u, 0, TAU);
        g.fill();
        txt(g, '지도', 8 * u, my + 5 * u, 7 * u, '#fff', 'left', 800);
        reset(g);
      },
      controls: [
        tgl('데드존', dead, (v) => (dead = v)),
        tgl('앞보기', look, (v) => (look = v)),
        tgl('부드럽게 (지수 감쇠)', soft, (v) => (soft = v)),
      ],
    };
  },
};

/* ═════════════ i208 동전 빨려 들기 ═════════════ */
const D208: Demo = {
  kind: '2d',
  caption: '보상 동전 10개가 곡선을 그리며 점수 칸으로 쏙쏙 — 들어갈 때마다 칸이 통 튀고 숫자가 하나씩',
  make() {
    let compare = true;
    let gap = 0.055;
    const P = 3.4;
    const N = 10;
    const BREAK = 0.35;
    const FLY = 0.85;
    const DUR = 0.5;
    let T = 0;
    const scene = (g: G, w: number, h: number, on: boolean): void => {
      const u = uh(w, h);
      bg(g, w, h, '#2b1d5e', '#0e0a26');
      const ph = T % P;
      const gy = h * 0.82;
      ground(g, w, h, gy, u);
      const ox = w * 0.4;
      const oy = gy - 18 * u;
      const cx = w - 36 * u;
      const cy = 34 * u;
      // 상자
      if (ph < BREAK) {
        const shake = ph > BREAK - 0.2 ? Math.sin(ph * 90) * 2 * u : 0;
        block(g, ox + shake, gy, 34 * u, '#ffd43b', '10', { sy: 1 - 0.05 * Math.sin(ph * 40) * (ph > 0.15 ? 1 : 0) });
      } else {
        const a = ph - BREAK;
        if (a < 0.25) block(g, ox, gy, 34 * u, '#ffd43b', '10', { sx: 1 + a * 2, sy: 1 + a * 2, alpha: 1 - a / 0.25, flash: 0.6 });
        ringFx(g, ox, oy, a, 0.4, 8 * u, 50 * u, '#ffe066', 3 * u);
        const back = ph - (P - 0.55);
        if (back > 0) {
          const k = backOut(back / 0.35);
          block(g, ox, gy, 34 * u, '#ffd43b', '10', { sx: k, sy: k });
        }
      }
      // 칸
      let arrived = 0;
      let lastArr = 99;
      for (let i = 0; i < N; i++) {
        const ta = FLY + i * gap + DUR;
        if (ph >= ta) {
          arrived++;
          lastArr = Math.min(lastArr, ph - ta);
        }
      }
      let count = 20 + 10 * (Math.floor(T / P) % 7);
      if (on) count += arrived;
      else if (ph >= FLY) count += N;
      const bump = on && lastArr < 0.3 ? 1 + 0.35 * Math.exp(-lastArr * 14) : 1;
      g.save();
      g.translate(cx, cy);
      g.scale(bump, bump);
      rr(g, -24 * u, -11 * u, 50 * u, 22 * u, 11 * u);
      g.fillStyle = '#0a0620';
      g.fill();
      g.strokeStyle = on && lastArr < 0.15 ? '#ffe066' : 'rgba(255,255,255,.3)';
      g.lineWidth = 1.5 * u;
      g.stroke();
      coin(g, -13 * u, 0, 8 * u);
      txt(g, String(count), 9 * u, 0.5 * u, 11 * u, '#fff', 'center', 900);
      g.restore();
      if (on && lastArr < 0.3) sparks(g, cx - 13 * u, cy, lastArr, 8, arrived, 18 * u, ['#fff3a0', '#ffd43b'], 0.3, 0, 2 * u);
      if (on && arrived === N && ph < FLY + N * gap + DUR + 0.9) {
        const a = ph - (FLY + (N - 1) * gap + DUR);
        g.save();
        g.globalAlpha = 1 - smooth(0.6, 0.9, a);
        const k = backOut(a / 0.3);
        g.translate(cx, cy + 22 * u);
        g.scale(k, k);
        pill(g, '10개 = 1묶음!', 0, 0, 7.5 * u, '#40c057', '#fff');
        g.restore();
      }
      // 동전
      if (ph >= BREAK) {
        for (let i = 0; i < N; i++) {
          const an = -Math.PI / 2 + (hash(i, 3) - 0.5) * 2.2;
          const sp = (40 + hash(i, 4) * 40) * u;
          const pos = (tt: number): [number, number] => {
            const a = Math.max(0, tt - BREAK);
            const d = 1 - Math.exp(-a * 5);
            return [ox + Math.cos(an) * sp * d, oy + Math.sin(an) * sp * d + 30 * u * a * a];
          };
          const t0 = FLY + i * gap;
          if (ph < t0) {
            const [x, y] = pos(ph);
            coin(g, x, y, 7 * u, Math.cos(ph * 9 + i));
          } else if (on) {
            const k = (ph - t0) / DUR;
            if (k >= 1) continue;
            const [sx, sy] = pos(t0);
            const e = k * k * (2.2 - 1.2 * k);
            const c1x = sx - 40 * u * (i % 2 ? 1 : -0.4);
            const c1y = sy - 10 * u;
            const x = (1 - e) * (1 - e) * sx + 2 * (1 - e) * e * c1x + e * e * (cx - 13 * u);
            const y = (1 - e) * (1 - e) * sy + 2 * (1 - e) * e * c1y + e * e * cy;
            g.save();
            g.globalCompositeOperation = 'lighter';
            glow(g, x, y, 12 * u, '#ffd43b', 0.35);
            g.restore();
            coin(g, x, y, 7 * u * (1 - 0.3 * e), Math.cos(ph * 14 + i));
          } else {
            const a = ph - t0;
            if (a < 0.15) {
              const [x, y] = pos(t0);
              g.globalAlpha = 1 - a / 0.15;
              coin(g, x, y, 7 * u);
              g.globalAlpha = 1;
            }
          }
        }
      }
    };
    return {
      draw(g, w, h, t) {
        T = t;
        split(g, w, h, compare, scene);
      },
      controls: [tgl('나란히 비교 (끔 | 켬)', compare, (v) => (compare = v)), rng('동전 사이 간격 (초)', 0.02, 0.15, 0.005, gap, (v) => (gap = v))],
    };
  },
};

/* ═════════════ i211 별점 터짐 ═════════════ */
const D211: Demo = {
  kind: '2d',
  caption: '결과 창 별 셋이 하나씩 쾅 — 찌그러졌다 펴지고 빛 입자, 셋째 별은 더 크게 + 화면 흔들림',
  make() {
    let juice = true;
    let tOff = 0;
    let T = 0;
    const P = 3.8;
    const AT = [0.55, 0.95, 1.45];
    return {
      draw(g, w, h, t) {
        reset(g);
        T = t;
        const u = Math.min(w / 280, h / 175);
        const ph = (T - tOff) % P;
        bg(g, w, h, '#3b2a7a', '#120c2e');
        const cx = w / 2;
        const cy = h / 2;
        // 셋째 별 흔들림
        const a3 = ph - AT[2]!;
        g.save();
        if (juice && a3 >= 0 && a3 < 0.4) {
          const k = Math.exp(-a3 * 10) * 5 * u;
          g.translate(noise1(a3 * 70, 1) * k, noise1(a3 * 70, 2) * k);
        }
        // 빛살 (셋째 별 뒤)
        if (juice && a3 >= 0) {
          g.save();
          g.translate(cx, cy - 4 * u);
          g.rotate(T * 0.5);
          g.globalAlpha = 0.16 * smooth(0, 0.3, a3) * (1 - smooth(1.8, 2.3, ph));
          g.globalCompositeOperation = 'lighter';
          g.fillStyle = '#ffd43b';
          for (let i = 0; i < 12; i++) {
            g.rotate(TAU / 12);
            g.beginPath();
            g.moveTo(0, 0);
            g.lineTo(-14 * u, -150 * u);
            g.lineTo(14 * u, -150 * u);
            g.fill();
          }
          g.restore();
        }
        // 창
        const pw = 200 * u;
        const phh = 132 * u;
        rr(g, cx - pw / 2, cy - phh / 2 + 4 * u, pw, phh, 18 * u);
        g.fillStyle = '#1a0f45';
        g.fill();
        const pg = g.createLinearGradient(0, cy - phh / 2, 0, cy + phh / 2);
        pg.addColorStop(0, '#7b61ff');
        pg.addColorStop(1, '#4c3bc9');
        rr(g, cx - pw / 2, cy - phh / 2, pw, phh, 18 * u);
        g.fillStyle = pg;
        g.fill();
        rr(g, cx - pw / 2 + 6 * u, cy - phh / 2 + 6 * u, pw - 12 * u, phh - 12 * u, 13 * u);
        g.strokeStyle = 'rgba(255,255,255,.25)';
        g.lineWidth = 1.5 * u;
        g.stroke();
        otext(g, '단계 통과!', cx, cy - phh / 2 + 20 * u, 15 * u, '#fff', '#2b1a7a', 3.4 * u);
        const xs = [cx - 54 * u, cx, cx + 54 * u];
        const ys = [cy + 6 * u, cy - 4 * u, cy + 6 * u];
        const rs = [20 * u, 26 * u, 20 * u];
        // 빈 자리
        for (let i = 0; i < 3; i++) {
          starPath(g, xs[i]!, ys[i]!, rs[i]!, 0, 0.52);
          g.fillStyle = '#2a1d6e';
          g.fill();
          g.strokeStyle = '#1a1050';
          g.lineWidth = 3 * u;
          g.lineJoin = 'round';
          g.stroke();
        }
        // 별
        const order = [0, 2, 1];
        for (let k = 0; k < 3; k++) {
          const i = order[k]!;
          const a = ph - AT[k]!;
          if (a < 0) continue;
          const third = k === 2;
          if (!juice) {
            g.globalAlpha = clamp01(a / 0.3);
            star(g, xs[i]!, ys[i]!, rs[i]!);
            g.globalAlpha = 1;
            continue;
          }
          const fall = clamp01(a / 0.16);
          const sc = lerp(third ? 3.4 : 2.6, 1, fall * fall);
          const sq = a > 0.16 ? Math.exp(-(a - 0.16) * 9) * Math.cos((a - 0.16) * 34) : 0;
          const rot = lerp(-0.6, 0, fall * fall);
          g.globalAlpha = clamp01(a / 0.08);
          if (a > 0.16) {
            g.save();
            g.globalCompositeOperation = 'lighter';
            glow(g, xs[i]!, ys[i]!, rs[i]! * 2.6, '#ffd43b', 0.55 * Math.exp(-(a - 0.16) * 3) + 0.12);
            g.restore();
          }
          star(g, xs[i]!, ys[i]!, rs[i]! * sc, rot, '#ffd43b', 1 + 0.28 * sq, 1 - 0.28 * sq);
          g.globalAlpha = 1;
          const ia = a - 0.16;
          ringFx(g, xs[i]!, ys[i]!, ia, 0.45, rs[i]!, rs[i]! * (third ? 3.4 : 2.4), '#fff3a0', 3 * u);
          sparks(g, xs[i]!, ys[i]!, ia, third ? 22 : 12, 50 + k, (third ? 80 : 50) * u, ['#ffffff', '#ffe066', '#ffa94d'], 0.6, 20 * u, 2.6 * u);
        }
        // 점수
        const sc = Math.round(1240 * smooth(0.3, 1.9, ph));
        txt(g, `${sc.toLocaleString()}점`, cx, cy + phh / 2 - 18 * u, 13 * u, '#fff', 'center', 900);
        g.restore();
        reset(g);
      },
      controls: [
        tgl('주스 켜기', juice, (v) => (juice = v)),
        { type: 'button', label: '다시 보기', on: () => (tOff = T) },
      ],
    };
  },
};

/* ═════════════ i212 레벨 업 ═════════════ */
const D212: Demo = {
  kind: '2d',
  caption: '경험치 게이지가 꽉 → 번쩍 → 「LEVEL UP」 이 돌며 내려앉고 빛살 · 꽃가루, 배지가 Lv.4 → Lv.5 로 뒤집힘',
  make() {
    let juice = true;
    let T = 0;
    let tOff = 0;
    const P = 4.4;
    const FULL = 1.05;
    return {
      draw(g, w, h, t) {
        reset(g);
        T = t;
        const u = Math.min(w / 280, h / 175);
        const ph = (T - tOff) % P;
        const a = ph - FULL;
        const fade = 1 - smooth(4.0, 4.4, ph);
        bg(g, w, h, '#162a5c', '#07102a');
        g.save();
        if (juice && a >= 0 && a < 0.5) {
          const k = Math.exp(-a * 8) * 4 * u;
          g.translate(noise1(a * 60, 3) * k, noise1(a * 60, 4) * k);
        }
        const cx = w / 2;
        const cy = h * 0.42;
        // 빛살
        if (juice && a > 0.05) {
          g.save();
          g.translate(cx, cy);
          g.rotate(T * 0.6);
          g.globalAlpha = 0.3 * smooth(0.05, 0.4, a) * fade;
          const rg = g.createRadialGradient(0, 0, 0, 0, 0, 150 * u);
          rg.addColorStop(0, '#fff3a0');
          rg.addColorStop(1, 'rgba(255,212,59,0)');
          g.fillStyle = rg;
          for (let i = 0; i < 14; i++) {
            g.rotate(TAU / 14);
            g.beginPath();
            g.moveTo(0, 0);
            g.lineTo(-12 * u, -160 * u);
            g.lineTo(12 * u, -160 * u);
            g.fill();
          }
          g.restore();
        }
        // 배지
        const bx = 42 * u;
        const by = h * 0.8;
        const flip = juice ? clamp01((a - 0.55) / 0.35) : a >= 0.5 ? 1 : 0;
        const fs = Math.abs(Math.cos(flip * Math.PI));
        const lv = flip > 0.5 ? 5 : 4;
        g.save();
        g.translate(bx, by);
        g.scale(Math.max(0.05, fs) * (juice && flip > 0.5 ? 1 + 0.25 * Math.exp(-(a - 0.9) * 6) * (a > 0.9 ? 1 : 0) : 1), 1);
        g.beginPath();
        g.arc(0, 0, 19 * u, 0, TAU);
        g.fillStyle = lv === 5 ? '#ffd43b' : '#748ffc';
        g.fill();
        g.lineWidth = 3 * u;
        g.strokeStyle = '#fff';
        g.stroke();
        otext(g, `Lv.${lv}`, 0, 1 * u, 11 * u, '#fff', lv === 5 ? '#a05a00' : '#28308a', 2.6 * u);
        g.restore();
        // 게이지
        const gx = 70 * u;
        const gw = w - gx - 16 * u;
        const gy = by - 7 * u;
        const gh = 14 * u;
        let fill: number;
        if (a < 0) fill = lerp(0.55, 1, clamp01(ph / FULL) ** 2.2);
        else if (a < 0.9) fill = 1;
        else fill = 0.18 * easeOut((a - 0.9) / 0.8);
        rr(g, gx, gy, gw, gh, gh / 2);
        g.fillStyle = '#0a1230';
        g.fill();
        const fg = g.createLinearGradient(0, gy, 0, gy + gh);
        fg.addColorStop(0, '#9ef0ff');
        fg.addColorStop(1, '#3b8cff');
        rr(g, gx, gy, gw * fill, gh, gh / 2);
        g.fillStyle = fg;
        g.fill();
        if (juice && a < 0) {
          // 흐르는 빛
          g.save();
          rr(g, gx, gy, gw * fill, gh, gh / 2);
          g.clip();
          const sx = gx + ((ph * 1.6) % 1) * gw * 1.3 - 20 * u;
          const lg = g.createLinearGradient(sx - 16 * u, 0, sx + 16 * u, 0);
          lg.addColorStop(0, 'rgba(255,255,255,0)');
          lg.addColorStop(0.5, 'rgba(255,255,255,.55)');
          lg.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = lg;
          g.fillRect(sx - 16 * u, gy, 32 * u, gh);
          g.restore();
        }
        if (juice && a >= 0 && a < 0.9) {
          rr(g, gx, gy, gw, gh, gh / 2);
          g.fillStyle = `rgba(255,255,255,${0.9 * Math.exp(-a * 5)})`;
          g.fill();
        }
        txt(g, 'EXP', gx + 8 * u, gy - 7 * u, 7 * u, '#9fb4ff', 'left', 800);
        // 글씨
        if (a >= 0.1) {
          const k = (a - 0.1) / 0.4;
          g.save();
          g.globalAlpha = fade;
          if (juice) {
            const land = clamp01(k);
            const sc = lerp(3.2, 1, land * land) + (land >= 1 ? 0.12 * Math.exp(-(a - 0.5) * 8) * Math.cos((a - 0.5) * 30) : 0);
            g.translate(cx, cy);
            g.rotate(lerp(-1.1, -0.06, easeOut(land)));
            g.scale(sc, sc);
            g.globalAlpha *= clamp01(k * 3);
          } else g.translate(cx, cy);
          const tg = g.createLinearGradient(0, -16 * u, 0, 16 * u);
          tg.addColorStop(0, '#fffbe0');
          tg.addColorStop(0.5, '#ffd43b');
          tg.addColorStop(1, '#ff8a00');
          otext(g, 'LEVEL UP', 0, 0, 30 * u, juice ? tg : '#ffd43b', '#4a1d00', 6 * u);
          if (juice) {
            g.globalCompositeOperation = 'lighter';
            g.globalAlpha *= 0.35 * Math.exp(-Math.max(0, a - 0.5) * 3);
            otext(g, 'LEVEL UP', 0, 0, 30 * u, '#ffffff', 'rgba(0,0,0,0)', 0);
          }
          g.restore();
          if (juice) {
            const ia = a - 0.5;
            ringFx(g, cx, cy, ia, 0.5, 30 * u, 140 * u, '#fff3a0', 4 * u);
            sparks(g, cx, cy, ia, 24, 77, 110 * u, ['#ffffff', '#ffe066', '#74c0fc', '#ff8787'], 0.8, 30 * u, 3 * u);
            // 꽃가루
            if (ia > 0) {
              for (let i = 0; i < 26; i++) {
                const fx = (hash(i, 61) * 1.2 - 0.1) * w;
                const fy = -10 * u + (ia - hash(i, 62) * 0.5) * (60 + hash(i, 63) * 50) * u;
                if (fy < -10 * u || fy > h) continue;
                g.save();
                g.globalAlpha = fade;
                g.translate(fx + Math.sin(ia * 4 + i) * 6 * u, fy);
                g.rotate(ia * 6 + i);
                g.scale(Math.cos(ia * 8 + i), 1);
                g.fillStyle = BLK[i % 6]!;
                g.fillRect(-3 * u, -1.6 * u, 6 * u, 3.2 * u);
                g.restore();
              }
            }
          }
        }
        // 흰 번쩍
        if (juice && a >= 0 && a < 0.15) {
          g.fillStyle = `rgba(255,255,255,${0.75 * (1 - a / 0.15)})`;
          g.fillRect(-10, -10, w + 20, h + 20);
        }
        g.restore();
        reset(g);
      },
      controls: [
        tgl('주스 켜기', juice, (v) => (juice = v)),
        { type: 'button', label: '다시 보기', on: () => (tOff = T) },
      ],
    };
  },
};

/* ═════════════ i213 손가락 칼날 궤적 ═════════════ */
const D213: Demo = {
  kind: '2d',
  caption: '숫자 열매를 쓱 — 그은 자리에 굵어졌다 가늘어지는 빛 칼날 (캣멀-롬 띠), 열매는 반으로 갈라짐',
  make() {
    let juice = true;
    let keep = 0.16;
    const FR = ['8', '½', '12', '7', '¾', '3'];
    const FCOL: [string, string][] = [
      ['#2f9e44', '#ff6b6b'],
      ['#f08c00', '#ffd8a8'],
      ['#7048e8', '#e5dbff'],
      ['#e03131', '#fff5f5'],
      ['#1c7ed6', '#d0ebff'],
      ['#f59f00', '#fff3bf'],
    ];
    const cuts = new Map<number, { at: number; ang: number }>();
    const hist: { x: number; y: number; t: number }[] = [];
    let prev: { x: number; y: number } | null = null;
    let canvas: HTMLCanvasElement | null = null;
    let ptr = { x: 0, y: 0, at: -1 };
    const onMove = (e: PointerEvent): void => {
      ptr = { x: e.offsetX, y: e.offsetY, at: performance.now() };
    };
    const SPAWN = 0.85;
    const LIFE = 2.2;
    const fruitPos = (j: number, t: number, w: number, h: number, u: number): [number, number] => {
      const a = t - j * SPAWN;
      const x0 = w * (0.22 + hash(j, 1) * 0.56);
      const vx = (w / 2 - x0) * 0.3 + (hash(j, 2) - 0.5) * 24 * u;
      const H = h * (0.62 + hash(j, 3) * 0.16) + 20 * u;
      const tp = 1.05;
      const G = (2 * H) / (tp * tp);
      return [x0 + vx * a, h + 20 * u - (G * tp * a - 0.5 * G * a * a)];
    };
    return {
      draw(g, w, h, t) {
        reset(g);
        const u = Math.min(w / 280, h / 175);
        if (!canvas) {
          canvas = g.canvas as HTMLCanvasElement;
          canvas.addEventListener('pointermove', onMove);
        }
        bg(g, w, h, '#1b3a2e', '#08160f');
        // 나무 판 결
        g.globalAlpha = 0.18;
        for (let i = 0; i < 9; i++) {
          g.fillStyle = i % 2 ? '#2f5d3a' : '#173523';
          g.fillRect(0, (i * h) / 9, w, h / 9);
        }
        g.globalAlpha = 1;
        // 손가락 위치
        let fx = 0;
        let fy = 0;
        let down = false;
        const userLive = performance.now() - ptr.at < 90;
        if (userLive) {
          fx = ptr.x;
          fy = ptr.y;
          down = true;
        } else {
          const SW = 0.8;
          const k = Math.floor(t / SW);
          const lp = (t % SW) / 0.32;
          if (lp <= 1) {
            down = true;
            // 살아 있는 열매를 지나가게
            const tm = k * SW + 0.16;
            const j = Math.floor(tm / SPAWN);
            const [tx, ty] = fruitPos(j, tm, w, h, u);
            const ang = (hash(k, 9) - 0.5) * 1.6 + (k % 2 ? Math.PI : 0);
            const L = 90 * u;
            const ax = tx - Math.cos(ang) * L;
            const ay = ty - Math.sin(ang) * L;
            const bx = tx + Math.cos(ang) * L;
            const by = ty + Math.sin(ang) * L;
            const e = lp < 0.5 ? 2 * lp * lp : 1 - Math.pow(-2 * lp + 2, 2) / 2;
            const bend = Math.sin(e * Math.PI) * 18 * u * (hash(k, 5) > 0.5 ? 1 : -1);
            fx = lerp(ax, bx, e) - Math.sin(ang) * bend;
            fy = lerp(ay, by, e) + Math.cos(ang) * bend;
          }
        }
        if (down) hist.push({ x: fx, y: fy, t });
        while (hist.length && t - hist[0]!.t > keep) hist.shift();
        if (hist.length > 80) hist.splice(0, hist.length - 80);
        // 자르기
        const j0 = Math.max(0, Math.floor((t - LIFE) / SPAWN));
        const j1 = Math.floor(t / SPAWN);
        if (down && prev) {
          for (let j = j0; j <= j1; j++) {
            if (cuts.has(j)) continue;
            const [x, y] = fruitPos(j, t, w, h, u);
            const r = 17 * u;
            const dx = fx - prev.x;
            const dy = fy - prev.y;
            const L2 = dx * dx + dy * dy;
            if (L2 < 1) continue;
            const k = clamp01(((x - prev.x) * dx + (y - prev.y) * dy) / L2);
            const d = Math.hypot(prev.x + dx * k - x, prev.y + dy * k - y);
            if (d < r) cuts.set(j, { at: t, ang: Math.atan2(dy, dx) });
          }
        }
        prev = down ? { x: fx, y: fy } : null;
        for (const key of cuts.keys()) if (key < j0 - 2) cuts.delete(key);
        // 열매
        for (let j = j0; j <= j1; j++) {
          const [x, y] = fruitPos(j, t, w, h, u);
          const r = 17 * u;
          const [rind, flesh] = FCOL[j % 6]!;
          const c = cuts.get(j);
          if (!c) {
            ball(g, x, y, r, rind, FR[j % 6]!);
            continue;
          }
          const a = t - c.at;
          for (const side of [-1, 1]) {
            const nx = -Math.sin(c.ang) * side;
            const ny = Math.cos(c.ang) * side;
            const off = 26 * u * a;
            g.save();
            g.translate(x + nx * off, y + ny * off + 60 * u * a * a);
            g.rotate(c.ang + side * a * 3);
            g.beginPath();
            g.arc(0, 0, r, side > 0 ? 0 : Math.PI, side > 0 ? Math.PI : TAU);
            g.closePath();
            g.fillStyle = rind;
            g.fill();
            g.beginPath();
            g.arc(0, 0, r * 0.82, side > 0 ? 0 : Math.PI, side > 0 ? Math.PI : TAU);
            g.closePath();
            g.fillStyle = flesh;
            g.fill();
            g.restore();
          }
          if (juice) {
            sparks(g, x, y, a, 14, j, 46 * u, [flesh, '#ffffff'], 0.5, 40 * u, 3 * u);
            if (a < 0.6) {
              g.globalAlpha = 1 - a / 0.6;
              otext(g, '+1', x, y - 20 * u - a * 30 * u, 12 * u, '#fff', '#1b3a2e', 3 * u);
              g.globalAlpha = 1;
            }
          }
        }
        // 궤적
        if (hist.length >= 2) {
          if (!juice) {
            g.strokeStyle = 'rgba(255,255,255,.7)';
            g.lineWidth = 1.5 * u;
            g.beginPath();
            hist.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
            g.stroke();
          } else {
            // 캣멀-롬으로 촘촘히
            const pts: [number, number][] = [];
            for (let i = 0; i < hist.length - 1; i++) {
              const p0 = hist[Math.max(0, i - 1)]!;
              const p1 = hist[i]!;
              const p2 = hist[i + 1]!;
              const p3 = hist[Math.min(hist.length - 1, i + 2)]!;
              for (let s = 0; s < 4; s++) {
                const k = s / 4;
                const k2 = k * k;
                const k3 = k2 * k;
                const cr = (a0: number, a1: number, a2: number, a3: number): number => 0.5 * (2 * a1 + (-a0 + a2) * k + (2 * a0 - 5 * a1 + 4 * a2 - a3) * k2 + (-a0 + 3 * a1 - 3 * a2 + a3) * k3);
                pts.push([cr(p0.x, p1.x, p2.x, p3.x), cr(p0.y, p1.y, p2.y, p3.y)]);
              }
            }
            const last = hist[hist.length - 1]!;
            pts.push([last.x, last.y]);
            const ribbon = (W: number, col: string): void => {
              const L: [number, number][] = [];
              const R: [number, number][] = [];
              const n = pts.length;
              for (let i = 0; i < n; i++) {
                const f = i / (n - 1);
                const a = pts[Math.max(0, i - 1)]!;
                const b = pts[Math.min(n - 1, i + 1)]!;
                let tx = b[0] - a[0];
                let ty = b[1] - a[1];
                const tl = Math.hypot(tx, ty) || 1;
                tx /= tl;
                ty /= tl;
                const wd = W * Math.sin(Math.PI * Math.min(0.999, Math.pow(f, 1.6)));
                const p = pts[i]!;
                L.push([p[0] - ty * wd, p[1] + tx * wd]);
                R.push([p[0] + ty * wd, p[1] - tx * wd]);
              }
              g.beginPath();
              L.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
              for (let i = R.length - 1; i >= 0; i--) g.lineTo(R[i]![0], R[i]![1]);
              g.closePath();
              g.fillStyle = col;
              g.fill();
            };
            g.save();
            g.globalCompositeOperation = 'lighter';
            ribbon(11 * u, 'rgba(70,190,255,.25)');
            ribbon(6.5 * u, 'rgba(140,225,255,.55)');
            ribbon(2.6 * u, 'rgba(255,255,255,.95)');
            glow(g, last.x, last.y, 12 * u, '#bdf0ff', 0.6);
            g.restore();
          }
        }
        reset(g);
      },
      controls: [
        tgl('빛 칼날 (끄면 그냥 선)', juice, (v) => (juice = v)),
        rng('남는 시간 (초)', 0.05, 0.4, 0.01, keep, (v) => (keep = v)),
      ],
      dispose() {
        canvas?.removeEventListener('pointermove', onMove);
      },
    };
  },
};

/* ═════════════ i214 착지 먼지 ═════════════ */
const D214: Demo = {
  kind: '2d',
  caption: '블록이 툭, 친구가 폴짝 — 떨어지는 순간 발밑 좌우로 동글동글 먼지가 굴러 나간다',
  make() {
    let compare = true;
    let amount = 1;
    const P = 2.2;
    let T = 0;
    const puffs = (g: G, x: number, y: number, a: number, u: number, seed: number, scale: number): void => {
      if (a < 0 || a > 0.7) return;
      const n = Math.round(5 * amount) + 1;
      for (const side of [-1, 1]) {
        for (let i = 0; i < n; i++) {
          const sp = (24 + hash(i, seed + side) * 26) * u * scale;
          const d = sp * (1 - Math.exp(-a * 5));
          const px = x + side * (6 * u * scale + d);
          const py = y - (2 + hash(i, seed + 7) * 6) * u * scale * Math.min(1, a * 4) - a * 6 * u;
          const r = (4 + hash(i, seed + 3) * 5) * u * scale * (0.6 + a * 1.6);
          const al = (1 - a / 0.7) * 0.85;
          g.fillStyle = `rgba(255,248,235,${al})`;
          g.beginPath();
          g.arc(px, py, r, 0, TAU);
          g.fill();
          g.fillStyle = `rgba(200,180,160,${al * 0.5})`;
          g.beginPath();
          g.arc(px + r * 0.2, py + r * 0.3, r * 0.7, 0, TAU);
          g.fill();
        }
      }
    };
    const scene = (g: G, w: number, h: number, on: boolean): void => {
      const u = uh(w, h);
      bg(g, w, h, '#ffe8cc', '#ffc9a0');
      const gy = h * 0.76;
      g.fillStyle = '#d9a46a';
      g.fillRect(0, gy, w, h - gy);
      g.fillStyle = '#b97d43';
      g.fillRect(0, gy, w, 2.5 * u);
      const ph = T % P;
      // 블록
      const L1 = 0.5;
      const bx = w * 0.32;
      const s = 34 * u;
      const a1 = ph - L1;
      let shake = 0;
      if (on && a1 >= 0 && a1 < 0.15) shake = Math.sin(a1 * 120) * 2 * u * (1 - a1 / 0.15);
      g.save();
      g.translate(0, shake);
      if (a1 < 0) {
        const k = clamp01(ph / L1);
        block(g, bx, lerp(-10 * u, gy, k * k), s, '#4dabf7', '6', { sx: on ? 1 - k * k * 0.08 : 1, sy: on ? 1 + k * k * 0.1 : 1 });
      } else {
        const sq = on ? Math.exp(-a1 * 9) * Math.cos(a1 * 30) : 0;
        g.fillStyle = 'rgba(80,40,10,.25)';
        g.beginPath();
        g.ellipse(bx, gy + 1 * u, s * 0.6, 3 * u, 0, 0, TAU);
        g.fill();
        block(g, bx, gy, s, '#4dabf7', '6', { sx: 1 + 0.22 * sq, sy: 1 - 0.25 * sq });
        if (on) puffs(g, bx, gy, a1, u, 3, 1.1);
      }
      // 친구 폴짝
      const L2 = 1.35;
      const cx = w * 0.72;
      const jumpT = 0.55;
      const a2 = ph - L2;
      let cy = gy;
      let sx = 1;
      let sy = 1;
      if (ph > L2 - jumpT && a2 < 0) {
        const k = (ph - (L2 - jumpT)) / jumpT;
        cy = gy - Math.sin(k * Math.PI) * 44 * u;
        if (on) {
          sx = 0.9;
          sy = 1.12;
        }
      } else if (a2 >= 0) {
        const sq = on ? Math.exp(-a2 * 10) * Math.cos(a2 * 28) : 0;
        sx = 1 + 0.3 * sq;
        sy = 1 - 0.3 * sq;
      } else if (on && ph > L2 - jumpT - 0.12) {
        sx = 1.15;
        sy = 0.85;
      }
      g.fillStyle = 'rgba(80,40,10,.25)';
      g.beginPath();
      g.ellipse(cx, gy + 1 * u, 13 * u * (1 - (gy - cy) / (100 * u)), 3 * u, 0, 0, TAU);
      g.fill();
      g.save();
      g.translate(cx, cy);
      g.scale(sx, sy);
      ball(g, 0, -14 * u, 14 * u, '#ff6b8a', '');
      g.fillStyle = '#2b1030';
      g.beginPath();
      g.arc(-4.5 * u, -17 * u, 2 * u, 0, TAU);
      g.arc(4.5 * u, -17 * u, 2 * u, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,.5)';
      g.beginPath();
      g.ellipse(-7 * u, -22 * u, 3 * u, 2 * u, -0.5, 0, TAU);
      g.fill();
      g.restore();
      if (on) puffs(g, cx, gy, a2, u, 11, 0.85);
      g.restore();
    };
    return {
      draw(g, w, h, t) {
        T = t;
        split(g, w, h, compare, scene);
      },
      controls: [tgl('나란히 비교 (끔 | 켬)', compare, (v) => (compare = v)), rng('먼지 양', 0.3, 2.5, 0.1, amount, (v) => (amount = v))],
    };
  },
};

/* ═════════════ i217 액체 진행 막대 ═════════════ */
const D217: Demo = {
  kind: '2d',
  caption: '1/4 → 2/4 → 3/4 → 가득 — 물이 출렁이며 차오르고 살짝 넘쳤다 가라앉는 게이지 (아래는 그냥 막대)',
  make() {
    let compare = true;
    let wobble = 1;
    const TG = [0.25, 0.5, 0.75, 1.0, 0];
    const STEP = 1.4;
    let lv = 0;
    let vel = 0;
    let slosh = 0;
    let sv = 0;
    return {
      draw(g, w, h, t, dt0) {
        reset(g);
        const dt = Math.min(dt0, 0.05);
        const u = Math.min(w / 280, h / 175);
        const i = Math.floor(t / STEP) % TG.length;
        const target = TG[i]!;
        // 스프링 (넘쳤다 돌아옴)
        const acc = (target - lv) * 70 - vel * 8;
        vel += acc * dt;
        lv += vel * dt;
        if (target === 0 && lv < 0.02) {
          lv = Math.max(0, lv);
        }
        // 출렁임: 속도 변화가 물결을 흔든다
        const sa = -slosh * 60 - sv * 3 + acc * 0.02 * wobble;
        sv += sa * dt;
        slosh += sv * dt;
        bg(g, w, h, '#123a5a', '#06182a');
        const L = clamp01(lv);
        const amp = clamp(slosh, -0.6, 0.6);
        // 둥근 병
        const fx = 50 * u;
        const fy = h * 0.5;
        const fr = 34 * u;
        const flask = (): void => {
          g.beginPath();
          g.arc(fx, fy + 6 * u, fr, -Math.PI / 2 + 0.38, Math.PI * 1.5 - 0.38);
          g.lineTo(fx - 9 * u, fy - 48 * u);
          g.lineTo(fx + 9 * u, fy - 48 * u);
          g.closePath();
        };
        flask();
        g.fillStyle = 'rgba(200,235,255,.08)';
        g.fill();
        g.save();
        flask();
        g.clip();
        const top = fy + 6 * u + fr - L * (fr * 2 + 14 * u);
        const water = (yy: number, tilt: number, colA: string, colB: string, ph: number): void => {
          g.beginPath();
          g.moveTo(fx - fr - 4 * u, h);
          for (let k = 0; k <= 24; k++) {
            const x = fx - fr - 4 * u + ((fr * 2 + 8 * u) * k) / 24;
            const y = yy + Math.sin(x * 0.12 / u + t * 5 + ph) * 2 * u * (0.4 + Math.abs(amp) * 4) + (x - fx) * tilt;
            g.lineTo(x, y);
          }
          g.lineTo(fx + fr + 4 * u, h);
          g.closePath();
          const gr = g.createLinearGradient(0, yy, 0, fy + fr);
          gr.addColorStop(0, colA);
          gr.addColorStop(1, colB);
          g.fillStyle = gr;
          g.fill();
        };
        if (L > 0.005) {
          water(top - 2 * u, amp * 0.5, 'rgba(116,192,252,.6)', 'rgba(28,126,214,.6)', 1.3);
          water(top, -amp * 0.6, '#74c0fc', '#1864ab', 0);
          // 거품
          for (let k = 0; k < 7; k++) {
            const by = fy + fr - ((t * (14 + hash(k, 2) * 12) * u + hash(k, 3) * 60 * u) % (fr * 2));
            if (by < top + 4 * u) continue;
            g.beginPath();
            g.arc(fx + (hash(k, 1) - 0.5) * fr * 1.2 + Math.sin(t * 3 + k) * 2 * u, by, (1 + hash(k, 4) * 1.6) * u, 0, TAU);
            g.strokeStyle = 'rgba(255,255,255,.6)';
            g.lineWidth = 0.8 * u;
            g.stroke();
          }
        }
        g.restore();
        flask();
        g.strokeStyle = 'rgba(220,240,255,.85)';
        g.lineWidth = 2.4 * u;
        g.lineJoin = 'round';
        g.stroke();
        g.strokeStyle = 'rgba(255,255,255,.5)';
        g.lineWidth = 3 * u;
        g.lineCap = 'round';
        g.beginPath();
        g.arc(fx, fy + 6 * u, fr - 6 * u, Math.PI * 1.05, Math.PI * 1.35);
        g.stroke();
        // 가로 막대
        const bx = 100 * u;
        const bw = w - bx - 16 * u;
        const by = compare ? h * 0.36 : h * 0.5;
        const bh = 32 * u;
        const cap = (): void => rr(g, bx, by - bh / 2, bw, bh, bh / 2);
        cap();
        g.fillStyle = 'rgba(200,235,255,.08)';
        g.fill();
        g.save();
        cap();
        g.clip();
        if (L > 0.003) {
          const front = bx + bw * L;
          g.beginPath();
          g.moveTo(bx, by - bh / 2);
          for (let k = 0; k <= 16; k++) {
            const y = by - bh / 2 + (bh * k) / 16;
            const x = front + Math.sin(y * 0.25 / u + t * 7) * 2.4 * u * (0.5 + Math.abs(amp) * 5) + (y - by) * amp * 0.6;
            g.lineTo(x, y);
          }
          g.lineTo(bx, by + bh / 2);
          g.closePath();
          const gr = g.createLinearGradient(0, by - bh / 2, 0, by + bh / 2);
          gr.addColorStop(0, '#8ce0ff');
          gr.addColorStop(1, '#1c6fd0');
          g.fillStyle = gr;
          g.fill();
          for (let k = 0; k < 6; k++) {
            const px = bx + ((t * (20 + k * 7) * u + k * 40 * u) % Math.max(1, bw * L));
            g.beginPath();
            g.arc(px, by + (hash(k, 8) - 0.5) * bh * 0.6, (0.8 + hash(k, 9)) * u, 0, TAU);
            g.fillStyle = 'rgba(255,255,255,.55)';
            g.fill();
          }
        }
        g.restore();
        cap();
        g.strokeStyle = 'rgba(220,240,255,.85)';
        g.lineWidth = 2.2 * u;
        g.stroke();
        rr(g, bx + 8 * u, by - bh / 2 + 4 * u, bw - 16 * u, 5 * u, 3 * u);
        g.fillStyle = 'rgba(255,255,255,.35)';
        g.fill();
        for (let k = 1; k < 4; k++) {
          g.fillStyle = 'rgba(255,255,255,.4)';
          g.fillRect(bx + (bw * k) / 4 - 0.6 * u, by + bh / 2 - 7 * u, 1.2 * u, 7 * u);
        }
        const pct = Math.round(clamp01(lv) * 100);
        otext(g, `${pct}%`, bx + bw / 2, by, 13 * u, '#fff', '#0b3a66', 3 * u);
        const fr2 = ['1/4', '2/4', '3/4', '4/4', '0'][i]!;
        txt(g, fr2, fx, h * 0.12, 11 * u, '#bfe6ff', 'center', 900);
        if (target === 1 && lv > 0.97) {
          const a = (t % STEP) - 0.5;
          sparks(g, bx + bw - 10 * u, by, a, 10, 4, 34 * u, ['#fff', '#a5d8ff'], 0.5, 0, 2.4 * u);
          if (a > 0) pill(g, '가득!', bx + bw - 22 * u, by - bh / 2 - 9 * u, 7.5 * u, '#40c057', '#fff');
        }
        if (compare) {
          const py = h * 0.74;
          txt(g, '주스 끔 — 그냥 막대', bx, py - 12 * u, 7.5 * u, '#8fa6c8', 'left', 700);
          rr(g, bx, py - 5 * u, bw, 12 * u, 2 * u);
          g.fillStyle = 'rgba(255,255,255,.12)';
          g.fill();
          g.fillStyle = '#4dabf7';
          g.fillRect(bx, py - 5 * u, bw * target, 12 * u);
          txt(g, `${Math.round(target * 100)}%`, bx + bw / 2, py + 1 * u, 7.5 * u, '#fff', 'center', 800);
        }
        reset(g);
      },
      controls: [tgl('그냥 막대와 비교', compare, (v) => (compare = v)), rng('출렁임', 0, 3, 0.1, wobble, (v) => (wobble = v))],
    };
  },
};

/* ═════════════ i218 계기 바늘 물리 ═════════════ */
const D218: Demo = {
  kind: '2d',
  caption: '같은 무게를 올려도 — 왼쪽 바늘은 미끄러지듯 멈추고, 오른쪽은 목표를 지나쳤다 바르르 떨며 멈춘다 (감쇠 스프링)',
  make() {
    let k = 120;
    let c = 7;
    const TG = [3, 8.5, 5, 9.6, 1.5, 6.5];
    const STEP = 1.7;
    let a1 = 0;
    let a2 = 0;
    let v2 = 0;
    const dial = (g: G, cx: number, cy: number, r: number, val: number, title: string, u: number, col: string, tgt: number): void => {
      // 몸통
      g.beginPath();
      g.arc(cx, cy + 4 * u, r + 9 * u, 0, TAU);
      g.fillStyle = '#0a0d22';
      g.fill();
      const bg2 = g.createRadialGradient(cx, cy - r * 0.4, r * 0.1, cx, cy, r + 8 * u);
      bg2.addColorStop(0, '#fffdf5');
      bg2.addColorStop(1, '#e9dfc9');
      g.beginPath();
      g.arc(cx, cy, r + 8 * u, 0, TAU);
      g.fillStyle = col;
      g.fill();
      g.beginPath();
      g.arc(cx, cy, r + 3 * u, 0, TAU);
      g.fillStyle = bg2;
      g.fill();
      const A0 = Math.PI * 0.8;
      const A1 = Math.PI * 2.2;
      const ang = (v: number): number => lerp(A0, A1, v / 10);
      // 위험 구간
      g.beginPath();
      g.arc(cx, cy, r - 4 * u, ang(8), ang(10));
      g.strokeStyle = 'rgba(255,80,100,.5)';
      g.lineWidth = 5 * u;
      g.stroke();
      for (let i = 0; i <= 20; i++) {
        const a = ang(i / 2);
        const big = i % 2 === 0;
        const r0 = r - (big ? 10 : 6) * u;
        g.strokeStyle = '#3a2f4f';
        g.lineWidth = (big ? 1.8 : 1) * u;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        g.lineTo(cx + Math.cos(a) * (r - 1 * u), cy + Math.sin(a) * (r - 1 * u));
        g.stroke();
        if (big) txt(g, String(i / 2), cx + Math.cos(a) * (r - 17 * u), cy + Math.sin(a) * (r - 17 * u), 7 * u, '#3a2f4f', 'center', 800);
      }
      txt(g, 'kg', cx, cy + r * 0.45, 7.5 * u, '#8a7f9f', 'center', 800);
      // 목표 표시
      const ta = ang(tgt);
      g.fillStyle = '#20c997';
      g.beginPath();
      g.moveTo(cx + Math.cos(ta) * (r + 2 * u), cy + Math.sin(ta) * (r + 2 * u));
      g.lineTo(cx + Math.cos(ta - 0.08) * (r + 9 * u), cy + Math.sin(ta - 0.08) * (r + 9 * u));
      g.lineTo(cx + Math.cos(ta + 0.08) * (r + 9 * u), cy + Math.sin(ta + 0.08) * (r + 9 * u));
      g.fill();
      // 바늘
      const na = ang(clamp(val, -0.4, 10.4));
      g.save();
      g.translate(cx + 1.5 * u, cy + 2 * u);
      g.rotate(na);
      g.fillStyle = 'rgba(0,0,0,.18)';
      g.beginPath();
      g.moveTo(-8 * u, -2.4 * u);
      g.lineTo(r - 8 * u, 0);
      g.lineTo(-8 * u, 2.4 * u);
      g.fill();
      g.restore();
      g.save();
      g.translate(cx, cy);
      g.rotate(na);
      g.fillStyle = '#e8364a';
      g.beginPath();
      g.moveTo(-9 * u, -2.6 * u);
      g.lineTo(r - 8 * u, 0);
      g.lineTo(-9 * u, 2.6 * u);
      g.closePath();
      g.fill();
      g.restore();
      g.beginPath();
      g.arc(cx, cy, 5 * u, 0, TAU);
      g.fillStyle = '#3a2f4f';
      g.fill();
      g.beginPath();
      g.arc(cx - 1.2 * u, cy - 1.2 * u, 1.8 * u, 0, TAU);
      g.fillStyle = 'rgba(255,255,255,.6)';
      g.fill();
      // 유리 빛
      g.save();
      g.beginPath();
      g.arc(cx, cy, r + 3 * u, 0, TAU);
      g.clip();
      const gl = g.createLinearGradient(cx - r, cy - r, cx + r * 0.2, cy);
      gl.addColorStop(0, 'rgba(255,255,255,.45)');
      gl.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gl;
      g.beginPath();
      g.ellipse(cx - r * 0.3, cy - r * 0.45, r * 0.9, r * 0.5, -0.5, 0, TAU);
      g.fill();
      g.restore();
      txt(g, title, cx, cy + r + 20 * u, 8.5 * u, '#dfe3ff', 'center', 800);
      txt(g, val.toFixed(1), cx, cy + r * 0.72, 9 * u, '#3a2f4f', 'center', 900);
    };
    return {
      draw(g, w, h, t, dt0) {
        reset(g);
        const dt = Math.min(dt0, 0.04);
        const u = Math.min(w / 280, h / 175);
        const tgt = TG[Math.floor(t / STEP) % TG.length]!;
        a1 = lerp(a1, tgt, 1 - Math.exp(-dt * 6));
        // 반 걸음씩 두 번 (안정)
        for (let s = 0; s < 2; s++) {
          const h2 = dt / 2;
          v2 += ((tgt - a2) * k - v2 * c) * h2;
          a2 += v2 * h2;
        }
        bg(g, w, h, '#26215a', '#0c0a24');
        const r = Math.min(52 * u, h * 0.3);
        dial(g, w * 0.27, h * 0.44, r, a1, '그냥 따라가기', u, '#5c7cfa', tgt);
        dial(g, w * 0.73, h * 0.44, r, a2, '감쇠 스프링', u, '#ffa94d', tgt);
        pill(g, `목표 ${tgt} kg`, w / 2, 12 * u, 8 * u, '#20c997', '#062b20');
        reset(g);
      },
      controls: [rng('스프링 세기 k', 20, 400, 5, k, (v) => (k = v)), rng('감쇠 c', 1, 40, 0.5, c, (v) => (c = v))],
    };
  },
};

/* ═════════════ DOM 도구 ═════════════ */
function domRoot(box: HTMLElement, cls: string, css: string, html: string): HTMLElement {
  const outer = document.createElement('div');
  outer.style.cssText = 'position:absolute;inset:0;overflow:hidden;container-type:size';
  const root = document.createElement('div');
  root.className = cls;
  root.innerHTML = `<style>.${cls}{position:absolute;inset:0;overflow:hidden;font-family:${FCSS};color:#fff;user-select:none;-webkit-user-select:none}${css}</style>${html}`;
  outer.appendChild(root);
  box.appendChild(outer);
  return root;
}
const q = <T extends Element = HTMLElement>(root: Element, sel: string): T => root.querySelector(sel) as T;
const qa = <T extends Element = HTMLElement>(root: Element, sel: string): T[] => Array.from(root.querySelectorAll(sel)) as T[];
/** 감쇠 스프링 한 걸음 */
function spring(s: { x: number; v: number }, target: number, k: number, c: number, dt: number): void {
  const n = 3;
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    s.v += ((target - s.x) * k - s.v * c) * h;
    s.x += s.v * h;
  }
}

/* ═════════════ i206 젤리 단추 ═════════════ */
const D206: Demo = {
  kind: 'dom',
  caption: '숫자 키 — 위는 색만 바뀌는 단추, 아래는 그림자 위로 쑥 들어갔다 떼면 젤리처럼 출렁 (눌러 봐도 됨)',
  make(box) {
    const KEYS = ['1', '2', '3'];
    const COLS = ['#ff6b8a', '#ffa94d', '#4dabf7'];
    const btn = (on: boolean): string =>
      KEYS.map(
        (k, i) =>
          `<div class="b ${on ? 'jb' : 'pb'}" data-i="${i}" style="--c:${COLS[i]};--c2:${shade(COLS[i]!, -0.42)};--c3:${shade(COLS[i]!, 0.35)}">${on ? `<div class="base"></div><div class="face"><i></i><span>${k}</span></div>` : `<span>${k}</span>`}</div>`,
      ).join('');
    const root = domRoot(
      box,
      'jx-jelly',
      `.jx-jelly{background:radial-gradient(120% 90% at 50% 0%,#3d3a8f,#141235)}
       .jx-jelly .row{position:absolute;left:0;right:0;display:flex;align-items:center;justify-content:center;gap:6cqmin}
       .jx-jelly .r0{top:12%;height:36%}.jx-jelly .r1{top:54%;height:40%}
       .jx-jelly .tag{position:absolute;left:4cqmin;top:50%;transform:translateY(-50%);font-size:5.2cqmin;font-weight:800;padding:1cqmin 2.6cqmin;border-radius:9cqmin;background:rgba(10,12,40,.75);color:#a9b3dc}
       .jx-jelly .tag.on{background:#ffcd3c;color:#2a1a00}
       .jx-jelly .b{position:relative;width:24cqmin;height:22cqmin;cursor:pointer;touch-action:none}
       .jx-jelly .pb{border-radius:5cqmin;background:var(--c);display:grid;place-items:center;font-size:12cqmin;font-weight:900;color:#fff}
       .jx-jelly .pb.dn{background:var(--c2)}
       .jx-jelly .jb .base{position:absolute;left:0;right:0;top:3.6cqmin;bottom:-3.6cqmin;border-radius:6cqmin;background:var(--c2);box-shadow:0 2.4cqmin 3cqmin rgba(0,0,0,.45)}
       .jx-jelly .jb .face{position:absolute;inset:0;border-radius:6cqmin;background:linear-gradient(180deg,var(--c3),var(--c) 70%);display:grid;place-items:center;transform-origin:50% 100%;box-shadow:inset 0 -1cqmin 0 rgba(0,0,0,.12)}
       .jx-jelly .jb .face i{position:absolute;left:14%;right:14%;top:8%;height:24%;border-radius:9cqmin;background:rgba(255,255,255,.4)}
       .jx-jelly .jb span{position:relative;font-size:12cqmin;font-weight:900;color:#fff;-webkit-text-stroke:.7cqmin var(--c2);paint-order:stroke}
       .jx-jelly .tap{position:absolute;width:7cqmin;height:7cqmin;border-radius:50%;background:rgba(255,255,255,.75);box-shadow:0 0 0 1.4cqmin rgba(255,255,255,.25);pointer-events:none;transition:opacity .15s}`,
      `<div class="row r0"><span class="tag">끔</span>${btn(false)}<div class="tap"></div></div>
       <div class="row r1"><span class="tag on">켬</span>${btn(true)}<div class="tap"></div></div>`,
    );
    const flat = qa(root, '.pb');
    const jel = qa(root, '.jb');
    const faces = qa(root, '.jb .face');
    const taps = qa(root, '.tap');
    const st = jel.map(() => ({ d: { x: 0, v: 0 }, e: { x: 0, v: 0 }, down: false }));
    const manual = [false, false, false];
    let manualAt = -99;
    let now = 0;
    const press = (i: number, v: boolean): void => {
      manual[i] = v;
      manualAt = now;
    };
    const handlers: [HTMLElement, string, EventListener][] = [];
    [...flat, ...jel].forEach((el) => {
      const i = Number(el.dataset.i);
      const dn = (e: Event): void => {
        e.preventDefault();
        press(i, true);
      };
      const up = (): void => press(i, false);
      for (const [n, f] of [
        ['pointerdown', dn],
        ['pointerup', up],
        ['pointerleave', up],
      ] as [string, EventListener][]) {
        el.addEventListener(n, f);
        handlers.push([el, n, f]);
      }
      el.addEventListener('click', (e) => e.preventDefault());
    });
    let K = 900;
    return {
      update(t, dt0) {
        now = t;
        const dt = Math.min(dt0, 0.04);
        const auto = t - manualAt > 2;
        const ph = t % 2.4;
        let active = -1;
        for (let i = 0; i < 3; i++) {
          const a = ph - 0.2 - i * 0.7;
          const down = auto ? a >= 0 && a < 0.24 : manual[i]!;
          if (auto && a >= -0.3 && a < 0.5) active = i;
          flat[i]!.classList.toggle('dn', down);
          const s = st[i]!;
          if (s.down && !down) s.e.v += 1.6; // 떼는 순간 튀어 오름
          s.down = down;
          spring(s.d, down ? 3.6 : 0, 1500, 45, dt);
          spring(s.e, down ? -0.09 : 0, K, 13, dt);
          const e = s.e.x;
          faces[i]!.style.transform = `translateY(${s.d.x.toFixed(2)}cqmin) scale(${(1 - e * 0.9).toFixed(4)},${(1 + e).toFixed(4)})`;
        }
        taps.forEach((tp, r) => {
          if (active < 0 || !auto) {
            tp.style.opacity = '0';
            return;
          }
          const el = (r === 0 ? flat : jel)[active]!;
          const a = ph - 0.2 - active * 0.7;
          const dn = a >= 0 && a < 0.24;
          tp.style.opacity = '1';
          tp.style.left = `${el.offsetLeft + el.offsetWidth * 0.62}px`;
          tp.style.top = `${el.offsetTop + el.offsetHeight * 0.55}px`;
          tp.style.transform = `translate(-50%,-50%) scale(${dn ? 0.7 : 1})`;
        });
      },
      controls: [rng('출렁임 단단함', 300, 2000, 50, K, (v) => (K = v))],
      dispose() {
        for (const [el, n, f] of handlers) el.removeEventListener(n, f);
      },
    };
  },
};

/* ═════════════ i207 흔들흔들 거부 ═════════════ */
const D207: Demo = {
  kind: 'dom',
  caption: '이미 쓴 숫자 2 를 누르면 — 위는 아무 반응 없음(고장인가?), 아래는 고개 젓듯 부르르 + 붉은빛 + 까닭 말풍선',
  make(box) {
    const N = ['1', '2', '3', '4', '5'];
    const USED = new Set([1, 3]);
    const tiles = (): string => N.map((n, i) => `<div class="t ${USED.has(i) ? 'used' : ''}" data-i="${i}"><span>${n}</span></div>`).join('');
    const root = domRoot(
      box,
      'jx-nope',
      `.jx-nope{background:radial-gradient(120% 90% at 50% 0%,#2f4b7c,#0c1530)}
       .jx-nope .row{position:absolute;left:0;right:0;display:flex;align-items:center;justify-content:center;gap:3cqmin;padding-left:12cqmin}
       .jx-nope .r0{top:8%;height:38%}.jx-nope .r1{top:52%;height:44%}
       .jx-nope .tag{position:absolute;left:4cqmin;top:50%;transform:translateY(-50%);font-size:5.2cqmin;font-weight:800;padding:1cqmin 2.6cqmin;border-radius:9cqmin;background:rgba(10,12,40,.75);color:#a9b3dc}
       .jx-nope .tag.on{background:#ffcd3c;color:#2a1a00}
       .jx-nope .t{position:relative;width:17cqmin;height:20cqmin;border-radius:4.5cqmin;background:linear-gradient(#fff,#e6ecff);box-shadow:0 1.6cqmin 0 #8d9bd0;display:grid;place-items:center;font-size:11cqmin;font-weight:900;color:#3b4a8f;cursor:pointer}
       .jx-nope .t.used{background:linear-gradient(#c9cfe6,#aab2d2);color:#7d86ad;box-shadow:0 1.6cqmin 0 #6f799f}
       .jx-nope .t.used::after{content:'';position:absolute;left:18%;right:18%;top:50%;height:1.2cqmin;background:#7d86ad;transform:rotate(-30deg);border-radius:1cqmin}
       .jx-nope .t.sel{background:linear-gradient(#74c0fc,#339af0);color:#fff;box-shadow:0 1.6cqmin 0 #1864ab}
       .jx-nope .bub{position:absolute;bottom:calc(100% + 3cqmin);left:50%;white-space:nowrap;font-size:4.6cqmin;font-weight:800;padding:1.4cqmin 2.6cqmin;border-radius:3cqmin;background:#ff4d6d;color:#fff;transform:translateX(-50%) scale(0);transform-origin:50% 120%;pointer-events:none;z-index:2}
       .jx-nope .bub::after{content:'';position:absolute;left:50%;top:100%;border:1.6cqmin solid transparent;border-top-color:#ff4d6d;transform:translateX(-50%)}
       .jx-nope .tap{position:absolute;width:6.5cqmin;height:6.5cqmin;border-radius:50%;background:rgba(255,255,255,.8);box-shadow:0 0 0 1.4cqmin rgba(255,255,255,.25);pointer-events:none;z-index:3}`,
      `<div class="row r0"><span class="tag">끔</span>${tiles()}<div class="tap"></div></div>
       <div class="row r1"><span class="tag on">켬</span>${tiles()}<div class="tap"></div></div>`,
    );
    const rows = qa(root, '.row').map((r) => qa(r, '.t'));
    const taps = qa(root, '.tap');
    const onTiles = rows[1]!;
    const bub = document.createElement('div');
    bub.className = 'bub';
    bub.textContent = '이미 쓴 숫자예요';
    onTiles[1]!.appendChild(bub);
    const P = 2.9;
    const REJ = 0.55;
    const OK = 1.75;
    let amp = 1;
    // 직접 누르기 (켬 줄)
    let userRej = -99;
    let userIdx = 1;
    let now = 0;
    const handlers: [HTMLElement, EventListener][] = [];
    onTiles.forEach((el, i) => {
      const f = (e: Event): void => {
        e.preventDefault();
        if (USED.has(i)) {
          userRej = now;
          userIdx = i;
          el.appendChild(bub);
        } else el.classList.toggle('sel');
      };
      el.addEventListener('pointerdown', f);
      handlers.push([el, f]);
    });
    return {
      update(t) {
        now = t;
        const ph = t % P;
        const userMode = t - userRej < 1.2;
        rows.forEach((tl, r) => {
          const on = r === 1;
          // 손가락
          const target = ph < (REJ + OK) / 2 ? 1 : 2;
          const tAt = target === 1 ? REJ : OK;
          const el = tl[target]!;
          const tp = taps[r]!;
          const dn = ph >= tAt && ph < tAt + 0.15;
          tp.style.opacity = userMode && on ? '0' : ph > P - 0.3 ? '0' : '1';
          tp.style.left = `${el.offsetLeft + el.offsetWidth * 0.6}px`;
          tp.style.top = `${el.offsetTop + el.offsetHeight * 0.62}px`;
          tp.style.transition = 'left .35s ease, top .35s ease, opacity .2s';
          tp.style.transform = `translate(-50%,-50%) scale(${dn ? 0.7 : 1})`;
          // 고르기
          const okA = ph - OK;
          if (!(userMode && on)) tl[2]!.classList.toggle('sel', okA >= 0 && ph < P - 0.15);
          if (on) {
            const s = okA >= 0 && okA < 0.5 ? 1 + 0.16 * Math.exp(-okA * 9) * Math.cos(okA * 26) : 1;
            tl[2]!.style.transform = `scale(${s.toFixed(4)})`;
            const ra = userMode ? t - userRej : ph - REJ;
            const ri = userMode ? userIdx : 1;
            tl.forEach((x, i) => {
              if (i === 2) return;
              if (i === ri && ra >= 0 && ra < 0.9) {
                const sh = Math.sin(ra * 48) * 3.2 * amp * Math.exp(-ra * 5.5);
                const rot = Math.sin(ra * 48 + 0.6) * 4 * amp * Math.exp(-ra * 5.5);
                const glowA = Math.exp(-ra * 3.5);
                x.style.transform = `translateX(${sh.toFixed(2)}cqmin) rotate(${rot.toFixed(2)}deg)`;
                x.style.boxShadow = `0 1.6cqmin 0 #6f799f, 0 0 ${(4 * glowA).toFixed(2)}cqmin ${(1.6 * glowA).toFixed(2)}cqmin rgba(255,60,90,${(0.9 * glowA).toFixed(3)})`;
                x.style.background = `linear-gradient(rgba(255,${Math.round(201 - 120 * glowA)},${Math.round(207 - 120 * glowA)},1),#aab2d2)`;
              } else {
                x.style.transform = '';
                x.style.boxShadow = '';
                x.style.background = '';
              }
            });
            const ba = ra;
            const bs = ba >= 0 && ba < 1.1 ? backOut(ba / 0.25) * (1 - smooth(0.85, 1.1, ba)) : 0;
            bub.style.transform = `translateX(-50%) scale(${bs.toFixed(3)})`;
          }
        });
      },
      controls: [rng('흔들림 세기', 0.2, 2.5, 0.1, amp, (v) => (amp = v))],
      dispose() {
        for (const [el, f] of handlers) el.removeEventListener('pointerdown', f);
      },
    };
  },
};

/* ═════════════ 기울기 장치 (i219 · i220 공용) ═════════════ */
interface Tilt {
  nx: number;
  ny: number;
  step(t: number, dt: number): void;
  dispose(): void;
}
function tiltRig(root: HTMLElement): Tilt {
  let tx = 0;
  let ty = 0;
  let at = -1e9;
  const mv = (e: PointerEvent): void => {
    const r = root.getBoundingClientRect();
    tx = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
    ty = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
    at = performance.now();
  };
  const lv = (): void => {
    at = performance.now() - 900;
  };
  root.addEventListener('pointermove', mv);
  root.addEventListener('pointerleave', lv);
  const o: Tilt = {
    nx: 0,
    ny: 0,
    step(t, dt) {
      let gx = tx;
      let gy = ty;
      if (performance.now() - at > 1200) {
        gx = Math.sin(t * 1.25) * 0.85;
        gy = Math.sin(t * 1.7 + 1.2) * 0.65;
      }
      const k = 1 - Math.exp(-Math.min(dt, 0.05) * 9);
      o.nx = lerp(o.nx, gx, k);
      o.ny = lerp(o.ny, gy, k);
    },
    dispose() {
      root.removeEventListener('pointermove', mv);
      root.removeEventListener('pointerleave', lv);
    },
  };
  return o;
}

/* ═════════════ i219 마우스 따라 3D 카드 기울기 ═════════════ */
const D219: Demo = {
  kind: 'dom',
  caption: '단계 고르기 카드가 손끝 쪽으로 기울고 반사광이 따라온다 — 그림 · 글씨는 층마다 다른 깊이 (마우스를 올려 봐도 됨)',
  make(box) {
    const root = domRoot(
      box,
      'jx-tilt',
      `.jx-tilt{background:radial-gradient(110% 90% at 50% 10%,#33508f,#0d1633);perspective:110cqmin}
       .jx-tilt .stage{position:absolute;left:50%;top:50%;width:62cqmin;height:84cqmin;transform:translate(-50%,-50%);transform-style:preserve-3d}
       .jx-tilt .shadow{position:absolute;left:8%;right:8%;bottom:-6%;height:14%;border-radius:50%;background:rgba(0,0,0,.55);filter:blur(3cqmin)}
       .jx-tilt .card{position:absolute;inset:0;border-radius:6cqmin;transform-style:preserve-3d;background:linear-gradient(160deg,#ffffff,#e8eeff);box-shadow:0 0 0 1cqmin #ffd43b inset,0 2cqmin 0 #b9c3ea}
       .jx-tilt .art{position:absolute;left:6%;right:6%;top:5%;height:56%;border-radius:4cqmin;background:linear-gradient(#7ec8ff,#c8ecff)}
       .jx-tilt .art svg{position:absolute;inset:0;width:100%;height:100%}
       .jx-tilt .pop{position:absolute;left:6%;right:6%;top:5%;height:56%;pointer-events:none}
       .jx-tilt .pop svg{width:100%;height:100%;overflow:visible}
       .jx-tilt .ttl{position:absolute;left:0;right:0;top:64%;text-align:center;font-size:8.4cqmin;font-weight:900;color:#2b2f7a}
       .jx-tilt .sub{position:absolute;left:0;right:0;top:76%;text-align:center;font-size:4.6cqmin;font-weight:700;color:#7a80b8}
       .jx-tilt .st{position:absolute;left:0;right:0;top:85%;text-align:center;font-size:7cqmin;letter-spacing:1cqmin;color:#ffc107;text-shadow:0 .5cqmin 0 #c77c00}
       .jx-tilt .st b{color:#d3d8ee;text-shadow:0 .5cqmin 0 #aab2d2;font-weight:400}
       .jx-tilt .glare{position:absolute;inset:0;border-radius:6cqmin;pointer-events:none;mix-blend-mode:soft-light}`,
      `<div class="stage"><div class="shadow"></div><div class="card">
         <div class="art"><svg viewBox="0 0 100 70" preserveAspectRatio="xMidYMid slice">
           <circle cx="80" cy="14" r="7" fill="#fff6c2"/><ellipse cx="22" cy="18" rx="12" ry="4" fill="#fff" opacity=".8"/>
           <ellipse cx="50" cy="52" rx="36" ry="9" fill="#5fae4f"/><path d="M16 52 Q50 82 84 52 Z" fill="#a0703f"/>
           <ellipse cx="50" cy="50" rx="34" ry="7" fill="#79c868"/></svg></div>
         <div class="pop"><svg viewBox="0 0 100 70">
           <g transform="translate(40 26)"><rect x="0" y="4" width="20" height="20" rx="4" fill="#c2255c"/><rect x="0" y="0" width="20" height="20" rx="4" fill="#ff6b8a"/><text x="10" y="15.5" font-size="14" font-weight="900" text-anchor="middle" fill="#fff" font-family="${FCSS}">7</text></g>
           <path transform="translate(22 30) scale(.9)" d="M0-9 2.6-3 9-2.8 4-1.4 5.6 7 0 3 -5.6 7 -4 1.4 -9-2.8 -2.6-3Z" fill="#ffd43b" stroke="#c77c00" stroke-width="1.5" stroke-linejoin="round"/>
           <path transform="translate(80 34) scale(.7)" d="M0-9 2.6-3 9-2.8 4-1.4 5.6 7 0 3 -5.6 7 -4 1.4 -9-2.8 -2.6-3Z" fill="#ffd43b" stroke="#c77c00" stroke-width="1.5" stroke-linejoin="round"/>
         </svg></div>
         <div class="ttl">월드 2</div><div class="sub">별 둘 · 14단계</div><div class="st">★★<b>★</b></div>
         <div class="glare"></div></div></div>`,
    );
    const stage = q(root, '.stage');
    const card = q(root, '.card');
    const art = q(root, '.art');
    const pop = q(root, '.pop');
    const ttl = q(root, '.ttl');
    const glare = q(root, '.glare');
    const shadow = q(root, '.shadow');
    const rig = tiltRig(root);
    let tilt = true;
    let light = true;
    let depth = true;
    let maxDeg = 16;
    return {
      update(t, dt) {
        rig.step(t, dt);
        const nx = tilt ? rig.nx : 0;
        const ny = tilt ? rig.ny : 0;
        stage.style.transform = `translate(-50%,-50%) rotateX(${(-ny * maxDeg * 0.8).toFixed(2)}deg) rotateY(${(nx * maxDeg).toFixed(2)}deg)`;
        const z = depth ? 1 : 0;
        card.style.transform = 'translateZ(0)';
        art.style.transform = `translateZ(${2 * z}cqmin)`;
        pop.style.transform = `translateZ(${9 * z}cqmin) translate(${(nx * 1.5 * z).toFixed(2)}cqmin,${(ny * 1.5 * z).toFixed(2)}cqmin)`;
        ttl.style.transform = `translateZ(${6 * z}cqmin)`;
        shadow.style.transform = `translate(${(-nx * 5).toFixed(2)}cqmin,${(-ny * 2).toFixed(2)}cqmin) translateZ(-10cqmin)`;
        glare.style.background = light
          ? `radial-gradient(circle at ${(50 + rig.nx * 55).toFixed(1)}% ${(50 + rig.ny * 55).toFixed(1)}%, rgba(255,255,255,.95), rgba(255,255,255,.15) 38%, rgba(0,0,40,.35) 85%)`
          : 'none';
      },
      controls: [
        tgl('기울기', tilt, (v) => (tilt = v)),
        tgl('반사광 따라오기', light, (v) => (light = v)),
        tgl('층마다 깊이 (시차)', depth, (v) => (depth = v)),
        rng('최대 각도', 4, 30, 1, maxDeg, (v) => (maxDeg = v)),
      ],
      dispose() {
        rig.dispose();
      },
    };
  },
};

/* ═════════════ i220 홀로 포일 카드 ═════════════ */
const D220: Demo = {
  kind: 'dom',
  caption: '수학자 수집 카드 — 기울이면 무지개 빛 띠가 미끄러지고 반짝이가 빛 쪽에서만 반짝 (color-dodge 겹치기)',
  make(box) {
    const root = domRoot(
      box,
      'jx-holo',
      `.jx-holo{background:radial-gradient(110% 90% at 50% 10%,#3a2b6e,#0b0820);perspective:110cqmin}
       .jx-holo .stage{position:absolute;left:50%;top:50%;width:62cqmin;height:86cqmin;transform:translate(-50%,-50%)}
       .jx-holo .card{position:absolute;inset:0;border-radius:5cqmin;isolation:isolate;overflow:hidden;background:linear-gradient(160deg,#2a2f6e,#141640);box-shadow:0 3cqmin 6cqmin rgba(0,0,0,.6)}
       .jx-holo .frame{position:absolute;inset:2.4cqmin;border-radius:3.4cqmin;border:.8cqmin solid #c9a64a;box-shadow:inset 0 0 0 .5cqmin #fff3c4}
       .jx-holo .art{position:absolute;left:7%;right:7%;top:13%;height:50%;border-radius:2.4cqmin;background:linear-gradient(#1d2b6b,#3a4fb0);overflow:hidden}
       .jx-holo .art svg{width:100%;height:100%}
       .jx-holo .nm{position:absolute;left:8%;top:4%;font-size:5.6cqmin;font-weight:900;color:#fff3c4}
       .jx-holo .rk{position:absolute;right:8%;top:4.4%;font-size:4.6cqmin;color:#ffd43b;letter-spacing:.3cqmin}
       .jx-holo .eq{position:absolute;left:0;right:0;top:67%;text-align:center;font-size:7cqmin;font-weight:900;color:#fff}
       .jx-holo .tx{position:absolute;left:10%;right:10%;top:79%;text-align:center;font-size:3.9cqmin;line-height:1.35;color:#c7cbf2}
       .jx-holo .holo,.jx-holo .holo2,.jx-holo .spark,.jx-holo .glare{position:absolute;inset:0;pointer-events:none}
       .jx-holo .holo{mix-blend-mode:color-dodge;background-image:repeating-linear-gradient(115deg,#ff5fa2 0%,#ffcf5c 7%,#6dffb0 14%,#5cc8ff 21%,#b18cff 28%,#ff5fa2 35%),repeating-linear-gradient(25deg,rgba(255,255,255,.0) 0 1.2cqmin,rgba(255,255,255,.12) 1.2cqmin 1.6cqmin);background-size:300% 300%,100% 100%}
       .jx-holo .holo2{left:7%;right:7%;top:13%;height:50%;inset:auto;border-radius:2.4cqmin;mix-blend-mode:color-dodge;background-image:repeating-linear-gradient(115deg,#ff5fa2 0%,#ffcf5c 6%,#6dffb0 12%,#5cc8ff 18%,#b18cff 24%,#ff5fa2 30%);background-size:260% 260%}
       .jx-holo .spark{mix-blend-mode:color-dodge;background-image:radial-gradient(circle,#fff 0 .35cqmin,transparent .8cqmin),radial-gradient(circle,#fff 0 .25cqmin,transparent .6cqmin);background-size:7cqmin 7cqmin,4.6cqmin 4.6cqmin}
       .jx-holo .glare{mix-blend-mode:overlay}`,
      `<div class="stage"><div class="card">
         <div class="art"><svg viewBox="0 0 100 70">
           <g fill="none" stroke="rgba(255,255,255,.12)" stroke-width=".5">${Array.from({ length: 12 }, (_, i) => `<line x1="${i * 9}" y1="0" x2="${i * 9}" y2="70"/>`).join('')}</g>
           <polygon points="38,48 62,48 38,30" fill="#fff" stroke="#1d2b6b" stroke-width="1.2"/>
           <rect x="38" y="48" width="24" height="18" fill="#ff6b8a" stroke="#fff" stroke-width="1.2"/>
           <rect x="20" y="30" width="18" height="18" fill="#69db7c" stroke="#fff" stroke-width="1.2"/>
           <polygon points="38,30 62,48 80,24 56,6" fill="#ffd43b" stroke="#fff" stroke-width="1.2"/>
           <text x="50" y="60" font-size="7" font-weight="900" text-anchor="middle" fill="#fff" font-family="${FCSS}">a²</text>
           <text x="29" y="42" font-size="7" font-weight="900" text-anchor="middle" fill="#fff" font-family="${FCSS}">b²</text>
           <text x="59" y="30" font-size="8" font-weight="900" text-anchor="middle" fill="#7a4b00" font-family="${FCSS}">c²</text>
         </svg></div>
         <div class="holo2"></div>
         <div class="frame"></div>
         <div class="nm">피타고라스</div><div class="rk">★★★</div>
         <div class="eq">a² + b² = c²</div>
         <div class="tx">직각삼각형의 두 변 위 정사각형을 더하면 빗변 위 정사각형</div>
         <div class="holo"></div><div class="spark"></div><div class="glare"></div>
       </div></div>`,
    );
    const stage = q(root, '.stage');
    const holo = q(root, '.holo');
    const holo2 = q(root, '.holo2');
    const spark = q(root, '.spark');
    const glare = q(root, '.glare');
    const rig = tiltRig(root);
    let on = true;
    let power = 1;
    return {
      update(t, dt) {
        rig.step(t, dt);
        const { nx, ny } = rig;
        stage.style.transform = `translate(-50%,-50%) rotateX(${(-ny * 13).toFixed(2)}deg) rotateY(${(nx * 17).toFixed(2)}deg)`;
        const lx = 50 + nx * 50;
        const ly = 50 + ny * 50;
        const mag = Math.min(1, Math.hypot(nx, ny));
        if (!on) {
          holo.style.opacity = holo2.style.opacity = spark.style.opacity = '0';
          glare.style.background = `radial-gradient(circle at ${lx}% ${ly}%, rgba(255,255,255,.35), transparent 60%)`;
          return;
        }
        holo.style.opacity = String((0.28 + 0.3 * mag) * power);
        holo2.style.opacity = String((0.45 + 0.4 * mag) * power);
        holo.style.backgroundPosition = `${(50 + nx * 60).toFixed(1)}% ${(50 + ny * 60).toFixed(1)}%, 0 0`;
        holo2.style.backgroundPosition = `${(50 - nx * 80).toFixed(1)}% ${(50 - ny * 80).toFixed(1)}%`;
        const m = `radial-gradient(circle at ${lx.toFixed(1)}% ${ly.toFixed(1)}%, #000 0%, rgba(0,0,0,.35) 30%, transparent 55%)`;
        spark.style.maskImage = m;
        spark.style.webkitMaskImage = m;
        spark.style.backgroundPosition = `${(nx * 3).toFixed(2)}cqmin ${(ny * 3).toFixed(2)}cqmin, ${(-nx * 2).toFixed(2)}cqmin ${(-ny * 2).toFixed(2)}cqmin`;
        spark.style.opacity = String((0.6 + 0.4 * Math.sin(t * 9)) * power);
        glare.style.background = `radial-gradient(circle at ${lx.toFixed(1)}% ${ly.toFixed(1)}%, rgba(255,255,255,.8), rgba(255,255,255,.1) 35%, rgba(0,0,0,.3) 90%)`;
      },
      controls: [tgl('홀로 포일', on, (v) => (on = v)), rng('빛 세기', 0.2, 1.8, 0.05, power, (v) => (power = v))],
      dispose() {
        rig.dispose();
      },
    };
  },
};

/* ═════════════ 3D 도구 ═════════════ */
function canvasTex(w: number, h: number, draw: (g: G, w: number, h: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/** 숫자 블록 면 */
function faceTex(n: string, col: string): THREE.CanvasTexture {
  return canvasTex(256, 256, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, shade(col, 0.3));
    gr.addColorStop(1, col);
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    rr(g, 22, 22, 212, 212, 40);
    g.strokeStyle = 'rgba(255,255,255,.45)';
    g.lineWidth = 8;
    g.stroke();
    if (n) otext(g, n, 128, 136, 150, '#fff', shade(col, -0.5), 22);
  });
}
function dotTex(): THREE.CanvasTexture {
  return canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,.6)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
}
function pillTex(s: string, bgc: string, fg: string): { tex: THREE.CanvasTexture; aspect: number } {
  const H = 80;
  const c = document.createElement('canvas').getContext('2d')!;
  c.font = `800 44px ${F}`;
  const W = Math.ceil(c.measureText(s).width + 64);
  const tex = canvasTex(W, H, (g) => {
    rr(g, 2, 2, W - 4, H - 4, (H - 4) / 2);
    g.fillStyle = bgc;
    g.fill();
    txt(g, s, W / 2, H / 2 + 2, 44, fg, 'center', 800);
  });
  return { tex, aspect: W / H };
}
/** 화면 위 글씨 층 (픽셀 좌표) */
class Hud {
  scene = new THREE.Scene();
  cam = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10);
  private items: { spr: THREE.Sprite; fx: number; fy: number; hk: number; aspect: number; tex: THREE.Texture }[] = [];
  private div: THREE.Mesh;
  constructor() {
    this.div = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, toneMapped: false }));
    this.scene.add(this.div);
  }
  add(s: string, bgc: string, fg: string, fx: number, fy: number, hk = 0.075): THREE.Sprite {
    const { tex, aspect } = pillTex(s, bgc, fg);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, toneMapped: false, depthTest: false }));
    this.scene.add(spr);
    this.items.push({ spr, fx, fy, hk, aspect, tex });
    return spr;
  }
  addTex(tex: THREE.Texture, aspect: number, fx: number, fy: number, hk: number): THREE.Sprite {
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, toneMapped: false, depthTest: false }));
    this.scene.add(spr);
    this.items.push({ spr, fx, fy, hk, aspect, tex });
    return spr;
  }
  splitLabels(): void {
    this.add('주스 끔', 'rgba(14,18,44,.82)', '#a9b3dc', 0.25, 0.07);
    this.add('주스 켬', 'rgba(255,205,60,.96)', '#2a1a00', 0.75, 0.07);
  }
  render(r: THREE.WebGLRenderer, w: number, h: number, show: boolean, divider: boolean): void {
    if (!show) return;
    const pr = r.getPixelRatio();
    const W = w / pr;
    const H = h / pr;
    this.cam.right = W;
    this.cam.top = H;
    this.cam.updateProjectionMatrix();
    for (const it of this.items) {
      it.spr.position.set(it.fx * W, (1 - it.fy) * H, 0);
      it.spr.scale.set(it.hk * H * it.aspect, it.hk * H, 1);
    }
    this.div.visible = divider;
    this.div.position.set(W / 2, H / 2, -1);
    this.div.scale.set(Math.max(1.5, H / 170), H, 1);
    const ac = r.autoClear;
    r.autoClear = false;
    r.clearDepth();
    r.render(this.scene, this.cam);
    r.autoClear = ac;
  }
  dispose(): void {
    for (const it of this.items) {
      it.tex.dispose();
      it.spr.material.dispose();
    }
    this.div.geometry.dispose();
    (this.div.material as THREE.Material).dispose();
  }
}
/** 같은 장면을 왼쪽(끔) · 오른쪽(켬) 화면 칸에 두 번 그린다 */
function splitRender(r: THREE.WebGLRenderer, w: number, h: number, scene: THREE.Scene, cam: THREE.PerspectiveCamera, compare: boolean, apply: (on: boolean) => void, zoom = 0.8): void {
  if (!compare) {
    apply(true);
    r.render(scene, cam);
    return;
  }
  const pr = r.getPixelRatio();
  const W = w / pr;
  const H = h / pr;
  const a0 = cam.aspect;
  const z0 = cam.zoom;
  cam.aspect = W / 2 / H;
  cam.zoom = z0 * zoom;
  cam.updateProjectionMatrix();
  r.setScissorTest(true);
  for (let s = 0; s < 2; s++) {
    r.setViewport((s * W) / 2, 0, W / 2, H);
    r.setScissor((s * W) / 2, 0, W / 2, H);
    apply(s === 1);
    r.render(scene, cam);
  }
  r.setScissorTest(false);
  r.setViewport(0, 0, W, H);
  cam.aspect = a0;
  cam.zoom = z0;
  cam.updateProjectionMatrix();
}
/** 부드러운 빛 점 묶음 (가산 혼합) */
class Sparks {
  geo = new THREE.BufferGeometry();
  pos: Float32Array;
  col: Float32Array;
  size: Float32Array;
  mat: THREE.ShaderMaterial;
  obj: THREE.Points;
  constructor(public n: number) {
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aCol', new THREE.BufferAttribute(this.col, 3));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      vertexShader: `attribute vec3 aCol; attribute float aSize; uniform float uScale; varying vec3 vCol;
        void main(){ vCol=aCol; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=aSize*uScale/max(0.1,-mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vCol; void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d)*2.0; float a=smoothstep(1.0,0.0,r); a=a*a; float core=smoothstep(0.35,0.0,r); gl_FragColor=vec4(vCol*a+core*vCol*0.8,1.0); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.obj = new THREE.Points(this.geo, this.mat);
    this.obj.frustumCulled = false;
  }
  set(i: number, x: number, y: number, z: number, c: THREE.Color, s: number, a: number): void {
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.col[i * 3] = c.r * a;
    this.col[i * 3 + 1] = c.g * a;
    this.col[i * 3 + 2] = c.b * a;
    this.size[i] = a > 0 ? s : 0;
  }
  flush(): void {
    this.geo.attributes.position!.needsUpdate = true;
    this.geo.attributes.aCol!.needsUpdate = true;
    this.geo.attributes.aSize!.needsUpdate = true;
  }
  fit(h: number, fovDeg: number): void {
    this.mat.uniforms.uScale!.value = h / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }
  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
function pillarMat(col: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uA: { value: 0 }, uCol: { value: new THREE.Color(col) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform float uT; uniform float uA; uniform vec3 uCol;
      void main(){ float v=vUv.y; float fade=pow(1.0-v,1.5)*smoothstep(0.0,0.04,v);
        float s=0.6+0.4*sin(vUv.x*6.2831*6.0+uT*2.5)*sin(v*12.0-uT*9.0);
        vec3 c=mix(uCol,vec3(1.0),0.45*(1.0-v)); gl_FragColor=vec4(c*fade*s*uA,1.0); }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}
function starGeo(r = 0.5, depth = 0.2): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? r * 0.5 : r;
    if (i) s.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    else s.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.07, bevelSegments: 3 });
  g.center();
  return g;
}
function skyTex(a: string, b: string): THREE.CanvasTexture {
  return canvasTex(4, 256, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, a);
    gr.addColorStop(1, b);
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, 256);
  });
}
/** 장면의 기하 · 재질 · 텍스처 정리 */
function disposeScene(root: THREE.Object3D): void {
  const seen = new Set<unknown>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !seen.has(m.geometry)) {
      seen.add(m.geometry);
      m.geometry.dispose();
    }
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mt of mats) {
      if (seen.has(mt)) continue;
      seen.add(mt);
      for (const v of Object.values(mt as unknown as Record<string, unknown>)) if (v instanceof THREE.Texture) v.dispose();
      mt.dispose();
    }
  });
  const s = root as THREE.Scene;
  if (s.background instanceof THREE.Texture) s.background.dispose();
}
function roundBox(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const x = -w / 2 + r;
  const y = -h / 2 + r;
  const iw = w - 2 * r;
  const ih = h - 2 * r;
  shape.absarc(x, y, r, Math.PI, Math.PI * 1.5, false);
  shape.absarc(x + iw, y, r, Math.PI * 1.5, Math.PI * 2, false);
  shape.absarc(x + iw, y + ih, r, 0, Math.PI / 2, false);
  shape.absarc(x, y + ih, r, Math.PI / 2, Math.PI, false);
  const g = new THREE.ExtrudeGeometry(shape, { depth: d - 2 * r * 0.6, bevelEnabled: true, bevelThickness: r * 0.6, bevelSize: r * 0.6, bevelSegments: 4, curveSegments: 6 });
  g.center();
  // 앞면 UV 를 0..1 로 (숫자 그림이 앞면에 맞게)
  const p = g.attributes.position!;
  const uv = g.attributes.uv!;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + w / 2) / w, (p.getY(i) + h / 2) / h);
  return g;
}

/* ═════════════ i201 피격 흰 번쩍 ═════════════ */
const D201: Demo = {
  kind: '3d',
  caption: '잘못 누른 블록만 0.1초 하얗게 번쩍 (emissive 1 → 0) — 왼쪽은 톡 튀기만 해서 어느 것이 맞았는지 놓치기 쉽다',
  make() {
    const scene = new THREE.Scene();
    scene.background = skyTex('#26307a', '#0c1030');
    const cam = new THREE.PerspectiveCamera(36, 1.6, 0.1, 50);
    cam.position.set(0, 3.4, 6.6);
    cam.lookAt(0, 0.55, 0);
    scene.add(new THREE.HemisphereLight(0xc8d6ff, 0x2a2050, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(3, 6, 5);
    scene.add(sun);
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.75, 0.3, 64), new THREE.MeshStandardMaterial({ color: 0x4a57b8, roughness: 0.75 }));
    floor.position.y = -0.15;
    scene.add(floor);
    const floorTop = new THREE.Mesh(new THREE.RingGeometry(2.35, 2.5, 64), new THREE.MeshBasicMaterial({ color: 0x8fa0ff }));
    floorTop.rotation.x = -Math.PI / 2;
    floorTop.position.y = 0.005;
    scene.add(floorTop);
    const geo = roundBox(0.9, 0.9, 0.9, 0.16);
    const NUM = ['3', '8', '5'];
    const mats: THREE.MeshStandardMaterial[] = [];
    const cubes: THREE.Mesh[] = [];
    const shadows: THREE.Mesh[] = [];
    const dot = dotTex();
    for (let i = 0; i < 3; i++) {
      const m = new THREE.MeshStandardMaterial({ map: faceTex(NUM[i]!, BLK[[0, 4, 3][i]!]!), roughness: 0.42, emissive: 0xffffff, emissiveIntensity: 0 });
      mats.push(m);
      const c = new THREE.Mesh(geo, m);
      c.position.set((i - 1) * 1.4, 0.45, 0);
      scene.add(c);
      cubes.push(c);
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ map: dot, color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false }));
      sh.rotation.x = -Math.PI / 2;
      sh.position.set(c.position.x, 0.01, 0);
      scene.add(sh);
      shadows.push(sh);
    }
    const xTex = canvasTex(128, 128, (g) => {
      g.beginPath();
      g.arc(64, 64, 52, 0, TAU);
      g.fillStyle = '#ff3b5c';
      g.fill();
      g.strokeStyle = '#fff';
      g.lineWidth = 8;
      g.stroke();
      g.lineWidth = 14;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(42, 42);
      g.lineTo(86, 86);
      g.moveTo(86, 42);
      g.lineTo(42, 86);
      g.stroke();
    });
    const xs = new THREE.Sprite(new THREE.SpriteMaterial({ map: xTex, transparent: true, depthTest: false, toneMapped: false }));
    scene.add(xs);
    const hud = new Hud();
    hud.splitLabels();
    let compare = true;
    let dur = 0.1;
    let flash = 0;
    let idx = 0;
    const ORDER = [1, 0, 2, 1, 2, 0];
    return {
      scene,
      camera: cam,
      update(t) {
        const P = 1.0;
        const k = Math.floor(t / P);
        const a = t % P;
        idx = ORDER[k % ORDER.length]!;
        flash = clamp01(1 - a / dur);
        cubes.forEach((c, i) => {
          if (i === idx) {
            const hop = Math.sin(clamp01(a / 0.3) * Math.PI) * 0.22;
            const sq = 0.14 * Math.exp(-a * 10) * Math.cos(a * 30);
            c.position.y = 0.45 + hop;
            c.scale.set(1 + sq, 1 - sq, 1 + sq);
            c.rotation.z = Math.sin(a * 26) * 0.08 * Math.exp(-a * 6);
            shadows[i]!.scale.setScalar(1 - hop);
          } else {
            c.position.y = 0.45;
            c.scale.set(1, 1, 1);
            c.rotation.z = 0;
            shadows[i]!.scale.setScalar(1);
          }
          c.rotation.y = Math.sin(t * 0.8 + i) * 0.12;
        });
        xs.position.set(cubes[idx]!.position.x, 1.35 + a * 0.35, 0.2);
        const xsc = backOut(a / 0.2) * 0.55;
        xs.scale.set(xsc, xsc, 1);
        xs.material.opacity = 1 - smooth(0.45, 0.75, a);
      },
      render(r, w, h) {
        splitRender(r, w, h, scene, cam, compare, (on) => mats.forEach((m, i) => (m.emissiveIntensity = on && i === idx ? flash : 0)), 0.82);
        hud.render(r, w, h, compare, true);
      },
      controls: [tgl('나란히 비교 (끔 | 켬)', compare, (v) => (compare = v)), rng('번쩍 시간 (초)', 0.03, 0.4, 0.01, dur, (v) => (dur = v))],
      dispose() {
        disposeScene(scene);
        hud.dispose();
      },
    };
  },
};

/* ═════════════ i203 맞는 순간 색수차 맥박 ═════════════ */
const D203: Demo = {
  kind: '3d',
  caption: '두 블록이 쾅 부딪치는 순간에만 빨강 · 초록 · 파랑이 0.2초 갈라졌다 모인다 (늘 켜 두면 흐릿할 뿐)',
  make() {
    const scene = new THREE.Scene();
    scene.background = skyTex('#3a1f6e', '#0b0620');
    const cam = new THREE.PerspectiveCamera(40, 1.6, 0.1, 60);
    cam.position.set(0, 1.6, 6.5);
    cam.lookAt(0, 0.6, 0);
    scene.add(new THREE.HemisphereLight(0xd8c8ff, 0x201040, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(-3, 6, 5);
    scene.add(sun);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 48), new THREE.MeshStandardMaterial({ color: 0x2d1b5e, roughness: 0.85 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    // 별
    const stars = new Sparks(80);
    const wc = new THREE.Color(0xffffff);
    for (let i = 0; i < 80; i++) stars.set(i, (hash(i, 1) - 0.5) * 30, 2 + hash(i, 2) * 10, -10 - hash(i, 3) * 10, wc, 0.06 + hash(i, 4) * 0.08, 0.5 + hash(i, 5) * 0.5);
    stars.flush();
    scene.add(stars.obj);
    const geo = roundBox(1, 1, 1, 0.17);
    const A = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: faceTex('2', '#ff6b8a'), roughness: 0.4 }));
    const B = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: faceTex('5', '#4dabf7'), roughness: 0.4 }));
    scene.add(A, B);
    const sp = new Sparks(70);
    scene.add(sp.obj);
    const flashSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex(), color: 0xfff3c0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false }));
    flashSpr.position.set(0, 0.6, 0.3);
    scene.add(flashSpr);
    // 후처리
    const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType });
    const qMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: rt.texture }, uAmt: { value: 0 }, uSplit: { value: 1 }, uRes: { value: new THREE.Vector2(1, 1) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`,
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uAmt; uniform float uSplit; uniform vec2 uRes; varying vec2 vUv;
        void main(){
          float amt=uAmt; vec2 c=vec2(0.5); float lo=0.0; float hi=1.0;
          if(uSplit>0.5){ if(vUv.x<0.5){ amt=0.0; c.x=0.25; hi=0.5-1.0/uRes.x; } else { c.x=0.75; lo=0.5+1.0/uRes.x; } }
          vec2 d=vUv-c; d.x*=uSplit>0.5?2.0:1.0; vec2 off=d*amt*vec2(uSplit>0.5?0.5:1.0,1.0);
          vec2 ur=vUv+off; ur.x=clamp(ur.x,lo,hi); vec2 ub=vUv-off; ub.x=clamp(ub.x,lo,hi);
          vec3 col=vec3(texture2D(tDiffuse,ur).r, texture2D(tDiffuse,vUv).g, texture2D(tDiffuse,ub).b);
          gl_FragColor=vec4(col,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          if(uSplit>0.5 && abs(vUv.x-0.5)<1.2/uRes.x) gl_FragColor=vec4(1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), qMat);
    const qScene = new THREE.Scene();
    qScene.add(quad);
    const qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const hud = new Hud();
    hud.splitLabels();
    let compare = true;
    let power = 1;
    let amt = 0;
    const P = 2.2;
    const HIT = 0.8;
    const cc = new THREE.Color();
    return {
      scene,
      camera: cam,
      update(t) {
        const ph = t % P;
        const a = ph - HIT;
        if (a < 0) {
          const k = clamp01(ph / HIT);
          const x = lerp(2.3, 0.5, k * k);
          A.position.set(-x, 0.5, 0);
          B.position.set(x, 0.5, 0);
          A.rotation.set(0, 0.3, 0);
          B.rotation.set(0, -0.3, 0);
          A.scale.setScalar(1);
          B.scale.setScalar(1);
        } else {
          const d = 0.5 + 1.0 * (1 - Math.exp(-a * 2.5));
          const hop = Math.abs(Math.sin(a * 5)) * 0.6 * Math.exp(-a * 2);
          A.position.set(-d, 0.5 + hop, 0);
          B.position.set(d, 0.5 + hop, 0);
          A.rotation.set(0, 0.3 - a * 1.5 * Math.exp(-a), a * 2 * Math.exp(-a * 1.5));
          B.rotation.set(0, -0.3 + a * 1.5 * Math.exp(-a), -a * 2 * Math.exp(-a * 1.5));
          const sq = 0.18 * Math.exp(-a * 10) * Math.cos(a * 30);
          A.scale.set(1 - sq, 1 + sq, 1);
          B.scale.set(1 - sq, 1 + sq, 1);
        }
        amt = a >= 0 ? 0.13 * power * Math.pow(Math.max(0, 1 - a / 0.25), 2) : 0;
        const fl = a >= 0 ? Math.exp(-a * 9) : 0;
        flashSpr.scale.setScalar(0.5 + fl * 2.4);
        flashSpr.material.opacity = fl;
        for (let i = 0; i < 70; i++) {
          if (a < 0 || a > 0.9) {
            sp.set(i, 0, 0, 0, cc, 0, 0);
            continue;
          }
          const th = hash(i, 11) * TAU;
          const ph2 = (hash(i, 12) - 0.3) * 1.6;
          const v = 2 + hash(i, 13) * 3;
          const dd = v * (1 - Math.exp(-a * 3)) * 0.8;
          cc.setHSL(0.1 + hash(i, 14) * 0.06, 1, 0.65);
          sp.set(i, Math.cos(th) * Math.cos(ph2) * dd, 0.6 + Math.sin(ph2) * dd - a * a * 2, Math.sin(th) * Math.cos(ph2) * dd * 0.6, cc, 0.12 * (1 - a / 0.9), 1 - a / 0.9);
        }
        sp.flush();
      },
      resize(_w, h) {
        sp.fit(h * (compare ? 1 / 0.8 : 1), cam.fov);
        stars.fit(h, cam.fov);
      },
      render(r, w, h) {
        if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
        qMat.uniforms.uRes!.value.set(w, h);
        qMat.uniforms.uAmt!.value = amt;
        qMat.uniforms.uSplit!.value = compare ? 1 : 0;
        if (compare) {
          const a0 = cam.aspect;
          cam.aspect = w / 2 / h;
          cam.zoom = 0.74;
          cam.updateProjectionMatrix();
          for (let s = 0; s < 2; s++) {
            rt.viewport.set((s * w) / 2, 0, w / 2, h);
            rt.scissor.set((s * w) / 2, 0, w / 2, h);
            rt.scissorTest = true;
            r.setRenderTarget(rt);
            r.render(scene, cam);
          }
          rt.scissorTest = false;
          rt.viewport.set(0, 0, w, h);
          rt.scissor.set(0, 0, w, h);
          cam.aspect = a0;
          cam.zoom = 1;
          cam.updateProjectionMatrix();
        } else {
          r.setRenderTarget(rt);
          r.render(scene, cam);
        }
        r.setRenderTarget(null);
        r.render(qScene, qCam);
        hud.render(r, w, h, compare, false);
      },
      controls: [tgl('나란히 비교 (끔 | 켬)', compare, (v) => (compare = v)), rng('갈라짐 세기', 0, 3, 0.1, power, (v) => (power = v))],
      dispose() {
        disposeScene(scene);
        stars.dispose();
        sp.dispose();
        rt.dispose();
        qMat.dispose();
        quad.geometry.dispose();
        hud.dispose();
      },
    };
  },
};

/* ═════════════ i209 보물 상자 열기 ═════════════ */
const D209: Demo = {
  kind: '3d',
  caption: '보물 상자 — 덜컹덜컹 흔들 → 틈으로 빛이 샘 → 뚜껑 펑 → 빛기둥 → 금별이 솟아 빙글',
  make() {
    const scene = new THREE.Scene();
    scene.background = skyTex('#3b2a78', '#0d0824');
    const cam = new THREE.PerspectiveCamera(38, 1.6, 0.1, 60);
    cam.position.set(0, 2.5, 7.2);
    cam.lookAt(0, 1.15, 0);
    scene.add(new THREE.HemisphereLight(0xd6ccff, 0x2a1a40, 1.3));
    const key = new THREE.DirectionalLight(0xfff0dd, 2.4);
    key.position.set(3, 6, 5);
    scene.add(key);
    const inner = new THREE.PointLight(0xffc94a, 0, 6, 1.5);
    inner.position.set(0, 1.2, 0.3);
    scene.add(inner);
    // 받침
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.1, 0.35, 48), new THREE.MeshStandardMaterial({ color: 0x5a4a9a, roughness: 0.7 }));
    ped.position.y = -0.175;
    scene.add(ped);
    const pedTop = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 0.04, 48), new THREE.MeshStandardMaterial({ color: 0x7d6bc4, roughness: 0.6 }));
    pedTop.position.y = 0.02;
    scene.add(pedTop);
    // 상자
    const chest = new THREE.Group();
    scene.add(chest);
    const wood = new THREE.MeshStandardMaterial({ color: 0xa0612d, roughness: 0.72 });
    const woodD = new THREE.MeshStandardMaterial({ color: 0x7a4520, roughness: 0.8 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc23d, metalness: 0.35, roughness: 0.3, emissive: 0x5a3000, emissiveIntensity: 0.5 });
    const W = 1.7;
    const Hh = 0.95;
    const D = 1.05;
    const base = new THREE.Mesh(new THREE.BoxGeometry(W, Hh, D), wood);
    base.position.y = Hh / 2;
    chest.add(base);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.12, Hh + 0.02, 0.12), gold);
        band.position.set((sx * (W - 0.1)) / 2, Hh / 2, (sz * (D - 0.1)) / 2);
        chest.add(band);
      }
    const rim = new THREE.Mesh(new THREE.BoxGeometry(W + 0.04, 0.1, D + 0.04), gold);
    rim.position.y = Hh - 0.05;
    chest.add(rim);
    for (let i = 0; i < 4; i++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 0.025, 0.02), woodD);
      plank.position.set(0, 0.18 + i * 0.2, D / 2 + 0.005);
      chest.add(plank);
    }
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.36, 0.08), gold);
    lock.position.set(0, Hh - 0.12, D / 2 + 0.04);
    chest.add(lock);
    const keyhole = new THREE.Mesh(new THREE.CircleGeometry(0.05, 16), new THREE.MeshBasicMaterial({ color: 0x2a1500 }));
    keyhole.position.set(0, Hh - 0.12, D / 2 + 0.081);
    chest.add(keyhole);
    // 속 빛
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd35a, toneMapped: false });
    const innerPlane = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.16, D - 0.16), glowMat);
    innerPlane.rotation.x = -Math.PI / 2;
    innerPlane.position.y = Hh - 0.02;
    chest.add(innerPlane);
    // 뚜껑 (뒤쪽 경첩)
    const hinge = new THREE.Group();
    hinge.position.set(0, Hh, -D / 2);
    chest.add(hinge);
    const lid = new THREE.Group();
    lid.position.set(0, 0, D / 2);
    hinge.add(lid);
    const lidGeo = new THREE.CylinderGeometry(D / 2, D / 2, W, 32, 1, false, 0, Math.PI);
    lidGeo.rotateZ(Math.PI / 2);
    lidGeo.rotateX(Math.PI / 2);
    const lidM = new THREE.Mesh(lidGeo, wood);
    lid.add(lidM);
    for (const x of [-(W / 2 - 0.08), 0, W / 2 - 0.08]) {
      const bg2 = new THREE.CylinderGeometry(D / 2 + 0.025, D / 2 + 0.025, 0.13, 32, 1, false, 0, Math.PI);
      bg2.rotateZ(Math.PI / 2);
      bg2.rotateX(Math.PI / 2);
      const b = new THREE.Mesh(bg2, gold);
      b.position.x = x;
      lid.add(b);
    }
    // 틈 빛 (뚜껑과 몸통 사이)
    const seamMat = new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false });
    const seam = new THREE.Mesh(new THREE.BoxGeometry(W + 0.06, 0.05, D + 0.06), seamMat);
    seam.position.y = Hh + 0.01;
    chest.add(seam);
    const dot = dotTex();
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0xffc94a, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0 }));
    halo.position.set(0, Hh + 0.2, 0.2);
    scene.add(halo);
    // 빛기둥
    const pGeo = new THREE.CylinderGeometry(0.62, 0.78, 1, 40, 1, true);
    pGeo.translate(0, 0.5, 0);
    const pOut = pillarMat(0xffc94a);
    const pIn = pillarMat(0xfff6c8);
    const pil = new THREE.Mesh(pGeo, pOut);
    const pil2 = new THREE.Mesh(pGeo, pIn);
    pil2.scale.set(0.45, 1, 0.45);
    pil.position.y = pil2.position.y = Hh - 0.05;
    scene.add(pil, pil2);
    // 보상 별
    const star = new THREE.Mesh(starGeo(0.55, 0.22), new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: 0.3, roughness: 0.25, emissive: 0xffa000, emissiveIntensity: 0.55 }));
    scene.add(star);
    const sp = new Sparks(140);
    scene.add(sp.obj);
    let speed = 1;
    let pillarOn = true;
    let tOff = 0;
    let T = 0;
    const P = 5.2;
    const OPEN = 1.5;
    const cc = new THREE.Color();
    return {
      scene,
      camera: cam,
      update(t) {
        T = t;
        const ph = ((t - tOff) * speed) % P;
        const a = ph - OPEN;
        const end = smooth(4.5, 5.0, ph);
        // 흔들기
        if (a < 0) {
          const k = clamp01(ph / OPEN);
          const amp = k * k * 0.09;
          chest.rotation.z = Math.sin(ph * 38) * amp;
          chest.position.y = Math.max(0, Math.sin(ph * 19)) * amp * 1.2;
          chest.scale.set(1, 1, 1);
          hinge.rotation.x = -Math.max(0, Math.sin(ph * 38 + 1)) * k * k * 0.08;
          seamMat.opacity = smooth(0.4, OPEN, ph) * 0.9;
          halo.material.opacity = smooth(0.5, OPEN, ph) * 0.5;
          halo.scale.setScalar(1.5 + k * 1.5);
          inner.intensity = k * 6;
        } else {
          chest.rotation.z = 0;
          chest.position.y = 0;
          const sq = 0.12 * Math.exp(-a * 8) * Math.cos(a * 26);
          chest.scale.set(1 + sq, 1 - sq, 1 + sq);
          const open = -1.95 * (1 - Math.exp(-a * 7) * Math.cos(a * 13)) * (1 - end);
          hinge.rotation.x = open;
          seamMat.opacity = Math.exp(-a * 4) * 0.9;
          halo.material.opacity = (0.5 + Math.exp(-a * 4) * 0.5) * (1 - end);
          halo.scale.setScalar(3 + Math.exp(-a * 5) * 4);
          inner.intensity = (14 + Math.sin(t * 9) * 1.5) * (1 - end);
        }
        glowMat.color.setRGB(1, 0.83, 0.35).multiplyScalar(0.4 + 1.2 * clamp01(a >= 0 ? 1 - end : ph / OPEN));
        // 기둥
        const pa = a >= 0 && pillarOn ? clamp01(a / 0.3) * (1 - end) : 0;
        const ph2 = a >= 0 ? 0.6 + 5.4 * easeOut(a / 0.35) : 0;
        pil.scale.set(1 + Math.exp(-a * 6) * 0.6, Math.max(0.001, ph2), 1 + Math.exp(-a * 6) * 0.6);
        pil2.scale.set(0.45, Math.max(0.001, ph2), 0.45);
        pOut.uniforms.uA!.value = pa * 0.75;
        pIn.uniforms.uA!.value = pa * 0.9;
        pOut.uniforms.uT!.value = pIn.uniforms.uT!.value = t;
        pil.visible = pil2.visible = pa > 0.001;
        // 별
        if (a > 0.15) {
          const k = (a - 0.15) / 0.8;
          star.visible = true;
          star.position.set(0, lerp(Hh, 2.6, easeOut(k)) + Math.sin(t * 2.5) * 0.06 * clamp01(k - 1), 0.1);
          const s = backOut(k, 2.4) * (1 - end);
          star.scale.setScalar(Math.max(0.001, s));
          star.rotation.y = a * 4 * Math.exp(-a * 0.6) + t * 0.8;
        } else star.visible = false;
        // 입자
        for (let i = 0; i < 140; i++) {
          let x = 0;
          let y = 0;
          let z = 0;
          let al = 0;
          let s = 0;
          if (i < 30 && a < 0) {
            // 틈으로 새는 빛 알갱이
            const life = 0.6;
            const age = (ph + hash(i, 1) * life) % life;
            const th = hash(i, 2) * TAU;
            x = Math.cos(th) * (W / 2) * (0.6 + age);
            z = Math.sin(th) * (D / 2) * (0.6 + age);
            y = Hh + age * 0.8;
            al = smooth(0.3, OPEN, ph) * (1 - age / life);
            s = 0.07;
            cc.set(0xfff0a0);
          } else if (i >= 30 && a >= 0) {
            const j = i - 30;
            const th = hash(j, 3) * TAU;
            const v = 1.2 + hash(j, 4) * 2.4;
            const up = 2 + hash(j, 5) * 4;
            const age = a - hash(j, 6) * 0.25;
            if (age > 0 && age < 2.2) {
              const r = v * (1 - Math.exp(-age * 2));
              x = Math.cos(th) * r;
              z = Math.sin(th) * r * 0.7;
              y = Hh + up * (1 - Math.exp(-age * 1.6)) - age * age * 0.5;
              al = (1 - age / 2.2) * (1 - end) * (0.6 + 0.4 * Math.sin(t * 20 + j));
              s = 0.08 + hash(j, 7) * 0.08;
              cc.setHSL(0.11 + hash(j, 8) * 0.05, 1, 0.6 + hash(j, 9) * 0.3);
            }
          }
          sp.set(i, x, y, z, cc, s, al);
        }
        sp.flush();
      },
      resize(_w, h) {
        sp.fit(h, cam.fov);
      },
      controls: [
        { type: 'button', label: '다시 열기', on: () => (tOff = T) },
        tgl('빛기둥', pillarOn, (v) => (pillarOn = v)),
        rng('빠르기', 0.4, 2, 0.05, speed, (v) => (speed = v)),
      ],
      dispose() {
        disposeScene(scene);
        sp.dispose();
      },
    };
  },
};

/* ═════════════ i210 등급 빛기둥 ═════════════ */
const D210: Demo = {
  kind: '3d',
  caption: '별 하나 흰빛 · 둘 파랑 · 셋 보라 · 최소 수는 금빛 — 등급이 높을수록 굵고 높게 치솟고 바닥 고리가 퍼진다',
  make() {
    const scene = new THREE.Scene();
    scene.background = skyTex('#1a1f4f', '#05061a');
    const cam = new THREE.PerspectiveCamera(40, 1.6, 0.1, 80);
    cam.position.set(0, 3.0, 8.4);
    cam.lookAt(0, 1.4, 0);
    scene.add(new THREE.HemisphereLight(0xb8c4ff, 0x10102a, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(2, 6, 5);
    scene.add(key);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 64), new THREE.MeshStandardMaterial({ color: 0x1b2050, roughness: 0.6, metalness: 0.2 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    const COLS = [0xe9eefc, 0x4dabf7, 0xb36bff, 0xffc23a];
    const NAMES = ['★', '★★', '★★★', '최소 수!'];
    const XS = [-3.0, -1.0, 1.0, 3.0];
    const pGeo = new THREE.CylinderGeometry(0.5, 0.62, 1, 40, 1, true);
    pGeo.translate(0, 0.5, 0);
    const padGeo = new THREE.CylinderGeometry(0.7, 0.78, 0.18, 40);
    const ringGeo = new THREE.RingGeometry(0.86, 1, 64);
    const sGeo = starGeo(0.34, 0.14);
    const dot = dotTex();
    const sp = new Sparks(4 * 36);
    scene.add(sp.obj);
    interface Slot {
      pad: THREE.Mesh;
      outer: THREE.Mesh;
      core: THREE.Mesh;
      mo: THREE.ShaderMaterial;
      mc: THREE.ShaderMaterial;
      ring: THREE.Mesh;
      ring2: THREE.Mesh;
      halo: THREE.Sprite;
      item: THREE.Mesh;
      col: THREE.Color;
      lightM: THREE.MeshStandardMaterial;
    }
    const slots: Slot[] = [];
    const labels: THREE.Sprite[] = [];
    XS.forEach((x, i) => {
      const col = new THREE.Color(COLS[i]!);
      const lightM = new THREE.MeshStandardMaterial({ color: 0x3a3f7a, roughness: 0.4, metalness: 0.3, emissive: col, emissiveIntensity: 0 });
      const pad = new THREE.Mesh(padGeo, lightM);
      pad.position.set(x, 0.09, 0);
      scene.add(pad);
      const mo = pillarMat(COLS[i]!);
      const mc = pillarMat(0xffffff);
      const outer = new THREE.Mesh(pGeo, mo);
      const core = new THREE.Mesh(pGeo, mc);
      outer.position.set(x, 0.18, 0);
      core.position.set(x, 0.18, 0);
      scene.add(outer, core);
      const rm = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, rm);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.02, 0);
      const ring2 = new THREE.Mesh(ringGeo, rm.clone());
      ring2.rotation.x = -Math.PI / 2;
      ring2.position.set(x, 0.021, 0);
      scene.add(ring, ring2);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: col, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0 }));
      halo.position.set(x, 0.6, 0);
      scene.add(halo);
      const item = new THREE.Mesh(sGeo, new THREE.MeshStandardMaterial({ color: col, roughness: 0.3, metalness: 0.2, emissive: col, emissiveIntensity: 0.15 }));
      item.position.set(x, 0.7, 0);
      scene.add(item);
      const lt = pillTex(NAMES[i]!, 'rgba(10,12,40,.8)', '#' + col.getHexString());
      const lab = new THREE.Sprite(new THREE.SpriteMaterial({ map: lt.tex, toneMapped: false, depthWrite: false }));
      lab.scale.set(0.42 * lt.aspect, 0.42, 1);
      lab.position.set(x, 0.32, 1.25);
      lab.renderOrder = 5;
      lab.material.depthTest = false;
      scene.add(lab);
      labels.push(lab);
      slots.push({ pad, outer, core, mo, mc, ring, ring2, halo, item, col, lightM });
    });
    let speed = 1;
    const P = 4.8;
    const cc = new THREE.Color();
    return {
      scene,
      camera: cam,
      update(t) {
        const ph = (t * speed) % P;
        const end = smooth(4.2, 4.8, ph);
        slots.forEach((s, i) => {
          const at = 0.35 + i * 0.7;
          const a = ph - at;
          const gold = i === 3;
          const H = [2.6, 3.4, 4.3, 6.5][i]!;
          const Wd = [0.55, 0.7, 0.85, 1.15][i]!;
          const on = a >= 0;
          const A = on ? clamp01(a / 0.15) * (1 - end) : 0;
          const grow = on ? easeOut(a / 0.4) : 0;
          const burst = on ? Math.exp(-a * 6) : 0;
          s.outer.visible = s.core.visible = A > 0.001;
          s.outer.scale.set(Wd * (1 + burst * 0.8), Math.max(0.001, H * grow), Wd * (1 + burst * 0.8));
          s.core.scale.set(Wd * 0.4, Math.max(0.001, H * grow * 1.05), Wd * 0.4);
          s.mo.uniforms.uA!.value = A * (gold ? 0.95 : 0.7) * (0.9 + 0.1 * Math.sin(t * 8 + i));
          s.mc.uniforms.uA!.value = A * (gold ? 0.9 : 0.6);
          s.mo.uniforms.uT!.value = s.mc.uniforms.uT!.value = t + i;
          // 고리
          const ra = on ? a : -1;
          const r1 = ra >= 0 && ra < 0.9 ? ra / 0.9 : 1;
          s.ring.scale.setScalar(0.7 + easeOut(r1) * (gold ? 3.6 : 2.2));
          (s.ring.material as THREE.MeshBasicMaterial).opacity = ra >= 0 ? (1 - r1) * 0.9 : 0;
          const r2 = ((ra - 0.2) % 1.2) / 1.2;
          s.ring2.scale.setScalar(0.8 + r2 * (gold ? 1.6 : 1.0));
          (s.ring2.material as THREE.MeshBasicMaterial).opacity = ra > 0.2 ? (1 - r2) * 0.5 * (1 - end) : 0;
          s.halo.material.opacity = A * (0.55 + burst * 0.45);
          s.halo.scale.setScalar((gold ? 3.4 : 2.2) + burst * 3);
          s.lightM.emissiveIntensity = A * 0.8;
          s.item.position.y = 0.75 + (on ? easeOut(a / 0.6) * 0.55 * (1 - end) : 0) + Math.sin(t * 2.4 + i) * 0.05;
          s.item.rotation.y = t * (on ? 2.4 : 0.8) + i;
          (s.item.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.15 + A * 0.9;
          // 솟는 알갱이
          for (let k = 0; k < 36; k++) {
            const idx = i * 36 + k;
            if (!on) {
              sp.set(idx, 0, 0, 0, cc, 0, 0);
              continue;
            }
            const life = 1.3;
            const age = (a + hash(k, i + 1) * life) % life;
            const th = hash(k, i + 20) * TAU;
            const rad = Wd * (0.3 + hash(k, i + 40) * 0.6);
            cc.copy(s.col).lerp(new THREE.Color(1, 1, 1), 0.3);
            sp.set(idx, XS[i]! + Math.cos(th + age) * rad, 0.2 + age * (gold ? 4.5 : 3), Math.sin(th + age) * rad, cc, gold ? 0.13 : 0.09, A * (1 - age / life) * clamp01(a * 3));
          }
        });
        sp.flush();
        labels.forEach((l, i) => (l.material.opacity = 0.35 + 0.65 * clamp01((ph - 0.35 - i * 0.7) / 0.2) * (1 - end)));
      },
      resize(_w, h) {
        sp.fit(h, cam.fov);
      },
      controls: [rng('빠르기', 0.4, 2, 0.05, speed, (v) => (speed = v))],
      dispose() {
        disposeScene(scene);
        sp.dispose();
      },
    };
  },
};

/* ═════════════ i215 발자국 데칼 ═════════════ */
const D215: Demo = {
  kind: '3d',
  caption: '눈밭을 걷는 친구 — 지나간 자리에 발자국이 콕콕 남았다 천천히 사라진다 (걸음 수도 센다)',
  make() {
    const scene = new THREE.Scene();
    scene.background = skyTex('#9cc8ff', '#e8f3ff');
    scene.fog = new THREE.Fog(0xdcecff, 9, 20);
    const cam = new THREE.PerspectiveCamera(40, 1.6, 0.1, 60);
    cam.position.set(0, 4.6, 5.6);
    cam.lookAt(0, 0, 0.3);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9fb4d8, 1.7));
    const sun = new THREE.DirectionalLight(0xfff4e0, 2);
    sun.position.set(4, 8, 3);
    scene.add(sun);
    const snow = new THREE.Mesh(new THREE.CircleGeometry(14, 64), new THREE.MeshStandardMaterial({ color: 0xe3ecfb, roughness: 0.95 }));
    snow.rotation.x = -Math.PI / 2;
    scene.add(snow);
    // 눈 더미 · 나무
    const lump = new THREE.SphereGeometry(1, 20, 12);
    const snowM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    const coneG = new THREE.ConeGeometry(0.55, 1.3, 14);
    const pineM = new THREE.MeshStandardMaterial({ color: 0x2f7d5a, roughness: 0.8 });
    const capG = new THREE.ConeGeometry(0.42, 0.5, 14);
    for (let i = 0; i < 9; i++) {
      const an = (i / 9) * TAU + 0.3;
      const r = 4.6 + hash(i, 3) * 1.6;
      const x = Math.cos(an) * r;
      const z = Math.sin(an) * r * 0.75 - 0.5;
      if (i % 2) {
        const m = new THREE.Mesh(lump, snowM);
        m.scale.set(0.6 + hash(i, 4) * 0.5, 0.25, 0.5);
        m.position.set(x, 0, z);
        scene.add(m);
      } else {
        const t = new THREE.Mesh(coneG, pineM);
        t.position.set(x, 0.65, z);
        const c = new THREE.Mesh(capG, snowM);
        c.position.set(x, 1.15, z);
        scene.add(t, c);
      }
    }
    // 친구
    const kid = new THREE.Group();
    kid.scale.setScalar(1.2);
    scene.add(kid);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 28, 20), new THREE.MeshStandardMaterial({ color: 0xff8a3d, roughness: 0.55 }));
    body.position.y = 0.48;
    body.scale.set(1, 0.92, 1);
    kid.add(body);
    const knit = new THREE.MeshStandardMaterial({ color: 0xe8364a, roughness: 0.8 });
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.33, 24, 12, 0, TAU, 0, Math.PI / 2), knit);
    cap.position.y = 0.2;
    body.add(cap);
    const brim = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.065, 10, 28), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }));
    brim.rotation.x = Math.PI / 2;
    brim.position.y = 0.2;
    body.add(brim);
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), brim.material);
    pom.position.y = 0.55;
    body.add(pom);
    const eyeW = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const eyeB = new THREE.MeshStandardMaterial({ color: 0x1a1033, roughness: 0.2 });
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), eyeW);
      e.position.set(s * 0.14, 0.1, 0.36);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), eyeB);
      p.position.set(0, 0, 0.06);
      e.add(p);
      body.add(e);
    }
    const feet: THREE.Mesh[] = [];
    const footM = new THREE.MeshStandardMaterial({ color: 0x8a3b12, roughness: 0.6 });
    for (const s of [-1, 1]) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), footM);
      f.scale.set(0.9, 0.55, 1.3);
      f.position.set(s * 0.17, 0.07, 0);
      kid.add(f);
      feet.push(f);
    }
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: dotTex(), color: 0x34507a, transparent: true, opacity: 0.35, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012;
    scene.add(shadow);
    // 발자국
    const printTex = canvasTex(64, 96, (g) => {
      g.fillStyle = '#fff';
      g.beginPath();
      g.ellipse(32, 60, 17, 26, 0, 0, TAU);
      g.fill();
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.arc(17 + i * 15, 22 - (i === 1 ? 5 : 0), 7.5, 0, TAU);
        g.fill();
      }
    });
    const printGeo = new THREE.PlaneGeometry(0.2, 0.3);
    printGeo.rotateX(-Math.PI / 2);
    const NP = 60;
    const prints: { m: THREE.Mesh; mat: THREE.MeshBasicMaterial; born: number }[] = [];
    for (let i = 0; i < NP; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: printTex, color: 0x6f8fc8, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const m = new THREE.Mesh(printGeo, mat);
      m.position.y = 0.004 + i * 0.00002;
      m.visible = false;
      scene.add(m);
      prints.push({ m, mat, born: -99 });
    }
    let pi = 0;
    let dist = 0;
    let side = 1;
    let steps = 0;
    let prev: THREE.Vector3 | null = null;
    let s = 0;
    let fade = 4;
    let walk = 1;
    let decals = true;
    const hud = new Hud();
    const cnv = document.createElement('canvas');
    cnv.width = 300;
    cnv.height = 80;
    const cg = cnv.getContext('2d')!;
    const cTex = new THREE.CanvasTexture(cnv);
    cTex.colorSpace = THREE.SRGBColorSpace;
    hud.addTex(cTex, 300 / 80, 0.15, 0.1, 0.09);
    const drawCount = (n: number): void => {
      cg.clearRect(0, 0, 300, 80);
      rr(cg, 2, 2, 296, 76, 38);
      cg.fillStyle = 'rgba(30,50,110,.85)';
      cg.fill();
      txt(cg, `걸음 ${n}`, 150, 42, 42, '#fff', 'center', 800);
      cTex.needsUpdate = true;
    };
    let shownSteps = -1;
    const path = (u: number, o: THREE.Vector3): THREE.Vector3 => o.set(Math.sin(u) * 2.8, 0, Math.sin(2 * u) * 1.5 + 0.3);
    const p0 = new THREE.Vector3();
    const p1 = new THREE.Vector3();
    return {
      scene,
      camera: cam,
      update(t, dt0) {
        const dt = Math.min(dt0, 0.05);
        s += dt * 0.42 * walk;
        path(s, p0);
        path(s + 0.01, p1);
        const dir = p1.sub(p0).normalize();
        const head = Math.atan2(dir.x, dir.z);
        kid.position.copy(p0);
        kid.rotation.y = head;
        shadow.position.set(p0.x, 0.012, p0.z);
        const cyc = s * 18;
        body.position.y = 0.48 + Math.abs(Math.sin(cyc)) * 0.06;
        body.rotation.z = Math.sin(cyc) * 0.06;
        feet[0]!.position.z = Math.sin(cyc) * 0.17;
        feet[1]!.position.z = -Math.sin(cyc) * 0.17;
        feet[0]!.position.y = 0.07 + Math.max(0, Math.cos(cyc)) * 0.08;
        feet[1]!.position.y = 0.07 + Math.max(0, -Math.cos(cyc)) * 0.08;
        if (prev) dist += prev.distanceTo(p0);
        prev = (prev ?? new THREE.Vector3()).copy(p0);
        const stepLen = (Math.PI / 18) * 2.8 * 0.95;
        while (dist > stepLen * 0.5) {
          dist -= stepLen * 0.5;
          steps++;
          if (decals) {
            const pr = prints[pi]!;
            pi = (pi + 1) % NP;
            const rx = Math.cos(head) * 0.17 * side;
            const rz = -Math.sin(head) * 0.17 * side;
            pr.m.position.x = p0.x + rx;
            pr.m.position.z = p0.z + rz;
            pr.m.rotation.y = head + side * 0.08;
            pr.m.scale.x = side;
            pr.born = t;
            pr.m.visible = true;
          }
          side = -side;
        }
        for (const pr of prints) {
          if (!pr.m.visible) continue;
          const a = t - pr.born;
          const k = a / fade;
          if (k >= 1 || a < 0) {
            pr.m.visible = false;
            continue;
          }
          pr.mat.opacity = 0.75 * Math.min(1, a * 12) * (1 - k * k);
        }
        if (steps !== shownSteps) {
          shownSteps = steps;
          drawCount(steps);
        }
      },
      render(r, w, h) {
        r.render(scene, cam);
        hud.render(r, w, h, true, false);
      },
      controls: [
        tgl('발자국 남기기', decals, (v) => (decals = v)),
        rng('사라지는 시간 (초)', 1, 10, 0.5, fade, (v) => (fade = v)),
        rng('걷는 빠르기', 0.3, 2.5, 0.1, walk, (v) => (walk = v)),
      ],
      dispose() {
        disposeScene(scene);
        hud.dispose();
      },
    };
  },
};

/* ═════════════ i216 3D 속도선 ═════════════ */
const D216: Demo = {
  kind: '3d',
  caption: '부스터를 켜면 카메라 둘레로 가는 빛줄이 휙휙 — 속도에 비례해 길어지고 진해지며 시야도 살짝 넓어진다',
  make() {
    const scene = new THREE.Scene();
    scene.background = skyTex('#5fa8ff', '#d8ecff');
    scene.fog = new THREE.Fog(0xcfe6ff, 18, 48);
    const cam = new THREE.PerspectiveCamera(55, 1.6, 0.1, 80);
    cam.position.set(0, 1.55, 4.2);
    cam.lookAt(0, 0.7, -4);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x6a8a5a, 1.6));
    const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
    sun.position.set(-4, 8, 2);
    scene.add(sun);
    // 길
    const roadTex = canvasTex(128, 256, (g) => {
      g.fillStyle = '#5b6070';
      g.fillRect(0, 0, 128, 256);
      for (let i = 0; i < 400; i++) {
        g.fillStyle = `rgba(255,255,255,${hash(i, 1) * 0.06})`;
        g.fillRect(hash(i, 2) * 128, hash(i, 3) * 256, 2, 2);
      }
      g.fillStyle = '#ffe066';
      g.fillRect(62, 0, 4, 128);
      g.fillStyle = '#ffffff';
      g.fillRect(4, 0, 6, 256);
      g.fillRect(118, 0, 6, 256);
    });
    roadTex.wrapT = THREE.RepeatWrapping;
    roadTex.repeat.set(1, 12);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 80), new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.85 }));
    road.rotation.x = -Math.PI / 2;
    road.position.z = -30;
    scene.add(road);
    const grassTex = canvasTex(64, 64, (g) => {
      g.fillStyle = '#6cc463';
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = '#5ab352';
      g.fillRect(0, 0, 64, 32);
    });
    grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
    grassTex.repeat.set(10, 40);
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(60, 80), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }));
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(0, -0.01, -30);
    scene.add(grass);
    // 길가 숫자 말뚝
    const postGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.2, 8);
    const postM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    const signGeo = new THREE.CircleGeometry(0.34, 28);
    const posts: { g: THREE.Group; z0: number }[] = [];
    for (let i = 0; i < 10; i++) {
      const g = new THREE.Group();
      const p = new THREE.Mesh(postGeo, postM);
      p.position.y = 0.6;
      const sm = new THREE.Mesh(signGeo, new THREE.MeshStandardMaterial({ map: faceTex(String(i + 1), BLK[i % 6]!), roughness: 0.5 }));
      sm.position.y = 1.35;
      g.add(p, sm);
      g.position.x = i % 2 ? 2.7 : -2.7;
      scene.add(g);
      posts.push({ g, z0: -i * 4 });
    }
    // 나무 (멀리)
    const treeG = new THREE.SphereGeometry(0.9, 16, 12);
    const treeM = new THREE.MeshStandardMaterial({ color: 0x3f9b4f, roughness: 0.8 });
    const trees: { m: THREE.Mesh; z0: number }[] = [];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(treeG, treeM);
      m.position.set((i % 2 ? 1 : -1) * (5 + hash(i, 1) * 4), 0.8, 0);
      m.scale.set(1, 1.2, 1);
      scene.add(m);
      trees.push({ m, z0: -i * 3 });
    }
    // 차
    const car = new THREE.Group();
    const bodyM = new THREE.MeshStandardMaterial({ color: 0xff4d6d, roughness: 0.35 });
    const cb = new THREE.Mesh(roundBox(1.15, 0.42, 1.8, 0.14), bodyM);
    cb.position.y = 0.42;
    const cab = new THREE.Mesh(roundBox(0.9, 0.38, 0.9, 0.14), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
    cab.position.set(0, 0.78, 0.1);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.26), new THREE.MeshStandardMaterial({ color: 0x3b6bd8, roughness: 0.1, metalness: 0.4 }));
    win.position.set(0, 0.8, 0.56);
    car.add(cb, cab, win);
    const wheelG = new THREE.CylinderGeometry(0.22, 0.22, 0.18, 20);
    wheelG.rotateZ(Math.PI / 2);
    const wheelM = new THREE.MeshStandardMaterial({ color: 0x222233, roughness: 0.7 });
    const hubM = new THREE.MeshStandardMaterial({ color: 0xffd43b, roughness: 0.4 });
    const wheels: THREE.Group[] = [];
    for (const x of [-0.58, 0.58])
      for (const z of [-0.6, 0.6]) {
        const wg = new THREE.Group();
        const wm = new THREE.Mesh(wheelG, wheelM);
        const hb = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.3), hubM);
        wg.add(wm, hb);
        wg.position.set(x, 0.22, z);
        car.add(wg);
        wheels.push(wg);
      }
    car.position.set(0, 0, 0);
    scene.add(car);
    // 속도선
    const N = 110;
    const lineTex = canvasTex(8, 128, (g) => {
      const gr = g.createLinearGradient(0, 0, 0, 128);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.75, 'rgba(255,255,255,1)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 8, 128);
    });
    const lGeo = new THREE.PlaneGeometry(0.022, 1);
    lGeo.rotateX(Math.PI / 2);
    const lMat = new THREE.MeshBasicMaterial({ map: lineTex, color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
    const lines = new THREE.InstancedMesh(lGeo, lMat, N);
    lines.frustumCulled = false;
    scene.add(lines);
    const lz = new Float32Array(N);
    for (let i = 0; i < N; i++) lz[i] = -hash(i, 5) * 28;
    const m4 = new THREE.Matrix4();
    const qn = new THREE.Quaternion();
    const zAxis = new THREE.Vector3(0, 0, 1);
    const vp = new THREE.Vector3();
    const vs = new THREE.Vector3();
    const hud = new Hud();
    hud.splitLabels();
    let compare = true;
    let vmax = 1;
    let scroll = 0;
    let boost = 0;
    let lineLen = 1;
    let fovK = 0;
    return {
      scene,
      camera: cam,
      update(t, dt0) {
        const dt = Math.min(dt0, 0.05);
        const ph = t % 4.2;
        const want = ph > 1.2 && ph < 3.0 ? 1 : 0;
        boost = lerp(boost, want, 1 - Math.exp(-dt * (want ? 3 : 2)));
        const v = (6 + 30 * boost) * vmax;
        scroll += v * dt;
        roadTex.offset.y = (scroll / (80 / 12)) % 1;
        grassTex.offset.y = (scroll / 2) % 1;
        for (const p of posts) p.g.position.z = -36 + ((((p.z0 + scroll) % 40) + 40) % 40);
        for (const tr of trees) tr.m.position.z = -38 + ((((tr.z0 + scroll) % 42) + 42) % 42);
        for (const w of wheels) w.rotation.x -= v * dt * 2.2;
        car.position.y = Math.abs(Math.sin(t * 22)) * 0.012 * (0.4 + boost);
        car.rotation.x = -0.05 * boost;
        car.rotation.z = Math.sin(t * 1.3) * 0.02;
        car.position.x = Math.sin(t * 0.9) * 0.35;
        // 선
        lineLen = 0.6 + boost * 4.5;
        for (let i = 0; i < N; i++) {
          lz[i] = lz[i]! + v * dt * 1.35;
          if (lz[i]! > 6) lz[i] = -24 - hash(i, Math.floor(t)) * 6;
          const an = hash(i, 7) * TAU;
          const r = 1.6 + hash(i, 8) * 2.6;
          vp.set(Math.cos(an) * r, 1.4 + Math.sin(an) * r * 0.75, lz[i]!);
          qn.setFromAxisAngle(zAxis, an - Math.PI / 2);
          vs.set(1, 1, lineLen * (0.6 + hash(i, 9) * 0.8));
          m4.compose(vp, qn, vs);
          lines.setMatrixAt(i, m4);
        }
        lines.instanceMatrix.needsUpdate = true;
        lMat.opacity = clamp01((boost - 0.08) * 1.4) * 0.85;
        fovK = boost;
      },
      render(r, w, h) {
        splitRender(
          r,
          w,
          h,
          scene,
          cam,
          compare,
          (on) => {
            lines.visible = on;
            cam.fov = on ? 55 + fovK * 14 : 55;
            cam.updateProjectionMatrix();
          },
          1,
        );
        cam.fov = 55;
        cam.updateProjectionMatrix();
        hud.render(r, w, h, compare, true);
      },
      controls: [tgl('나란히 비교 (끔 | 켬)', compare, (v) => (compare = v)), rng('최고 속도', 0.3, 2, 0.05, vmax, (v) => (vmax = v))],
      dispose() {
        disposeScene(scene);
        hud.dispose();
      },
    };
  },
};

export const DEMOS: DemoMap = {
  i197: D197,
  i198: D198,
  i199: D199,
  i200: D200,
  i201: D201,
  i202: D202,
  i203: D203,
  i204: D204,
  i205: D205,
  i206: D206,
  i207: D207,
  i208: D208,
  i209: D209,
  i210: D210,
  i211: D211,
  i212: D212,
  i213: D213,
  i214: D214,
  i215: D215,
  i216: D216,
  i217: D217,
  i218: D218,
  i219: D219,
  i220: D220,
};

import type { Control, DemoMap } from './types';

/**
 * 2D 그리기 · CSS · 화면 맞춤 견본 (u52 ~ u71, i25 ~ i29).
 *  - 캔버스 2D 견본은 카드(280×175)를 기준으로 u = min(w/280, h/175) 배로 키워 그린다.
 *  - DOM 견본은 상자 하나(.d2-…)에 <style> 을 함께 넣고, 글자 크기는 cqmin(상자 크기) 으로.
 */

type G = CanvasRenderingContext2D;
const F = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
const TF = '"Black Han Sans", "Pretendard Variable", sans-serif';

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (x: number): number => {
  const v = clamp01(x);
  return v * v * (3 - 2 * v);
};
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
/** 0 ↔ 1 을 오가되 양 끝에서 잠깐 머무는 값 */
const swing = (t: number, speed = 0.8, hold = 1.5): number => ease(Math.sin(t * speed) * hold + 0.5);

function rng(seed: number): () => number {
  let s = Math.abs(Math.floor(seed * 9301 + 49297)) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
function scaleOf(w: number, h: number): number {
  return Math.min(w / 280, h / 175);
}
function bg(g: G, w: number, h: number, a = '#1d2558', b = '#0a0e25'): void {
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
function pill(g: G, s: string, x: number, y: number, size: number, fill: string, fg = '#fff'): void {
  g.font = `800 ${size}px ${F}`;
  const tw = g.measureText(s).width;
  const ph = size * 1.65;
  const pw = tw + size * 1.3;
  rr(g, x - pw / 2, y - ph / 2, pw, ph, ph / 2);
  g.fillStyle = fill;
  g.fill();
  txt(g, s, x, y + size * 0.04, size, fg, 'center', F, 800);
}
/** 화면 반씩 비교: 가운데 선 + 위 이름표 */
function splitLabels(g: G, w: number, h: number, u: number, left: string, right: string, rightOn = true): void {
  g.fillStyle = 'rgba(255,255,255,.55)';
  g.fillRect(w / 2 - 0.75, 0, 1.5, h);
  pill(g, left, w * 0.25, 13 * u, 9 * u, 'rgba(10,14,40,.7)', '#cfd6ff');
  pill(g, right, w * 0.75, 13 * u, 9 * u, rightOn ? '#ff6fa8' : 'rgba(10,14,40,.7)');
}
function mkCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}
function ctx(c: HTMLCanvasElement): G {
  return c.getContext('2d')!;
}

/* ───────── DOM 견본 도우미 ───────── */
let uid = 0;
function domRoot(box: HTMLElement, cls: string, css: string, html: string): HTMLElement {
  // 바깥 상자가 크기 기준(container) — 안쪽 루트의 cqmin 이 카드/큰 화면 크기를 따르게
  const outer = document.createElement('div');
  outer.style.cssText = 'position:absolute;inset:0;overflow:hidden;container-type:size';
  const root = document.createElement('div');
  root.className = cls;
  root.innerHTML = `<style>.${cls}{position:absolute;inset:0;overflow:hidden;font-family:${F};color:#fff;user-select:none}${css}</style>${html}`;
  outer.appendChild(root);
  box.appendChild(outer);
  return root;
}
const q = <T extends Element = HTMLElement>(root: Element, sel: string): T => root.querySelector(sel) as T;
const qa = <T extends Element = HTMLElement>(root: Element, sel: string): T[] => Array.from(root.querySelectorAll(sel)) as T[];

/* ───────── u53 도트 무늬 ───────── */
type Painter = (p: (x: number, y: number, c: string) => void, r: () => number) => void;
const pick = <T>(r: () => number, a: readonly T[]): T => a[Math.floor(r() * a.length)]!;
const PIX: [string, Painter][] = [
  [
    '마루',
    (p, r) => {
      const tone = ['#d9a066', '#cf9358', '#e3b07a', '#d39a5e'];
      const sh: string[] = [];
      for (let i = 0; i < 12; i++) sh.push(pick(r, tone));
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const row = Math.floor(y / 4);
          const off = (row % 2) * 5;
          const bx = Math.floor((x + off) / 8);
          const seam = (x + off) % 8 === 0;
          const edge = y % 4 === 3;
          p(x, y, edge ? '#8a5a2e' : seam ? '#a8703d' : r() < 0.1 ? '#c2844b' : sh[row * 3 + bx]!);
        }
    },
  ],
  [
    '돌담',
    (p, r) => {
      const tone = ['#a9adbb', '#9aa0b0', '#b8bcc8', '#8f95a6'];
      const sh: string[] = [];
      for (let i = 0; i < 12; i++) sh.push(pick(r, tone));
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const row = Math.floor(y / 4);
          const off = (row % 2) * 4;
          const bx = Math.floor((x + off) / 8);
          const mortar = y % 4 === 3 || (x + off) % 8 === 7;
          const hi = y % 4 === 0 && !mortar;
          p(x, y, mortar ? '#5d606c' : hi ? '#d3d6df' : r() < 0.14 ? '#7d8394' : sh[row * 3 + bx]!);
        }
    },
  ],
  [
    '상자',
    (p, r) => {
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const border = x < 2 || y < 2 || x > 13 || y > 13;
          const diag = Math.abs(x - y) <= 1 && !border;
          const nail = (x === 2 || x === 13) && (y === 2 || y === 13);
          let c = Math.floor(y / 3) % 2 ? '#c27d3c' : '#b56f31';
          if (r() < 0.08) c = '#a96528';
          if (diag) c = '#8d5426';
          if (border) c = x === 0 || y === 0 ? '#e0a160' : '#6b3e1c';
          if (nail) c = '#f1dfa5';
          p(x, y, c);
        }
    },
  ],
  [
    '잔디',
    (p, r) => {
      const tone = ['#5cb84a', '#6cc655', '#4fa540', '#78d062'];
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const v = r();
          p(x, y, v < 0.02 ? '#fff6c2' : v < 0.035 ? '#ff9ec4' : pick(r, tone));
        }
    },
  ],
];
function pixTile(kind: number, seed: number, cache: Map<string, HTMLCanvasElement>): HTMLCanvasElement {
  const key = `${kind}:${seed}`;
  let c = cache.get(key);
  if (c) return c;
  c = mkCanvas(16, 16);
  const g = ctx(c);
  const r = rng(seed * 31 + kind * 7);
  PIX[kind]![1]((x, y, col) => {
    g.fillStyle = col;
    g.fillRect(x, y, 1, 1);
  }, r);
  if (cache.size > 64) cache.clear();
  cache.set(key, c);
  return c;
}

/* ───────── u54 잡음 ───────── */
function hash2(x: number, y: number): number {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967295;
}
function vnoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, oct = 4): number {
  let s = 0;
  let a = 0.5;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x, y);
    x = x * 2.03 + 17.1;
    y = y * 2.01 + 3.7;
    a *= 0.5;
  }
  return s;
}

/* ───────── i28 손그림 ───────── */
function roughLine(g: G, x1: number, y1: number, x2: number, y2: number, r: () => number, k: number): void {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const off = Math.min(k, len * 0.08 + 1);
  for (let pass = 0; pass < 2; pass++) {
    const j = (): number => (r() - 0.5) * 2 * off;
    const mx = (x1 + x2) / 2 + j();
    const my = (y1 + y2) / 2 + j();
    g.beginPath();
    g.moveTo(x1 + j(), y1 + j());
    g.quadraticCurveTo(mx, my, x2 + j(), y2 + j());
    g.stroke();
  }
}
function roughEllipse(g: G, cx: number, cy: number, rx: number, ry: number, r: () => number, k: number): void {
  for (let pass = 0; pass < 2; pass++) {
    const start = r() * Math.PI * 2;
    const n = 18;
    g.beginPath();
    for (let i = 0; i <= n + 1; i++) {
      const a = start + (i / n) * Math.PI * 2 * 1.04;
      const d = 1 + (r() - 0.5) * (k / Math.max(rx, 1)) * 1.2;
      const x = cx + Math.cos(a) * rx * d;
      const y = cy + Math.sin(a) * ry * d;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
}
function hachure(g: G, path: () => void, x: number, y: number, w: number, h: number, gap: number, r: () => number, k: number): void {
  g.save();
  path();
  g.clip();
  const d = w + h;
  for (let s = -h; s < w; s += gap) {
    roughLine(g, x + s, y + h, x + s + h * 0.9, y - 0.0 * d, r, k * 0.6);
  }
  g.restore();
}

/* ───────── glossy 단추 (u60) ───────── */
const GLOSS = [
  ['#7fbcff', '#2f74e8', '#1d4fb8', '파랑'],
  ['#ffcb7a', '#ff8a1f', '#c95e00', '주황'],
  ['#ffa6c9', '#f2558f', '#b8306a', '분홍'],
  ['#7cf0b4', '#1fb868', '#138248', '초록'],
] as const;

export const DEMOS: DemoMap = {
  /* ───────────────────────── u52 ───────────────────────── */
  u52: {
    kind: '2d',
    caption: '왼쪽 단색 원 · 오른쪽 그러데이션 + 흐림 + 빛 섞기(lighter) — 겹친 곳이 환하게 빛나요',
    make() {
      let blur = 16;
      let lighter = true;
      const cols = ['#ff5fa2', '#ffd23f', '#3ee0ff', '#8b6bff', '#5dff9b'];
      const orbs = (g: G, ox: number, hw: number, h: number, t: number, u: number, fancy: boolean): void => {
        if (fancy) {
          // 흐린 배경 덩어리 (filter blur)
          g.filter = `blur(${10 * u}px)`;
          for (let i = 0; i < 3; i++) {
            g.fillStyle = ['#3b2a8f', '#16608f', '#7a2a7f'][i]!;
            g.beginPath();
            g.arc(ox + hw * (0.2 + 0.3 * i) + Math.sin(t * 0.4 + i) * 10 * u, h * (0.35 + 0.2 * (i % 2)), 34 * u, 0, Math.PI * 2);
            g.fill();
          }
          g.filter = 'none';
          g.globalCompositeOperation = lighter ? 'lighter' : 'source-over';
        }
        for (let i = 0; i < cols.length; i++) {
          const a = t * 0.7 + i * 1.257;
          const x = ox + hw / 2 + Math.cos(a) * hw * 0.24 * (1 + 0.25 * Math.sin(t * 0.5 + i));
          const y = h * 0.56 + Math.sin(a * 1.3) * h * 0.24;
          const r = 20 * u;
          const c = cols[i]!;
          if (!fancy) {
            g.fillStyle = c;
            g.beginPath();
            g.arc(x, y, r, 0, Math.PI * 2);
            g.fill();
          } else {
            const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r * 1.7);
            gr.addColorStop(0, '#ffffffcc');
            gr.addColorStop(0.18, c + 'cc');
            gr.addColorStop(0.55, c + '55');
            gr.addColorStop(1, c + '00');
            g.shadowColor = c;
            g.shadowBlur = blur * u;
            g.globalAlpha = 0.85;
            g.fillStyle = gr;
            g.beginPath();
            g.arc(x, y, r * 1.7, 0, Math.PI * 2);
            g.fill();
            g.globalAlpha = 1;
            g.shadowBlur = 0;
          }
        }
        g.globalCompositeOperation = 'source-over';
      };
      return {
        draw(g, w, h, t) {
          const u = scaleOf(w, h);
          g.save();
          g.beginPath();
          g.rect(0, 0, w / 2, h);
          g.clip();
          g.fillStyle = '#161b3d';
          g.fillRect(0, 0, w / 2, h);
          orbs(g, 0, w / 2, h, t, u, false);
          g.restore();
          g.save();
          g.beginPath();
          g.rect(w / 2, 0, w / 2, h);
          g.clip();
          const lg = g.createLinearGradient(0, 0, 0, h);
          lg.addColorStop(0, '#2b1d66');
          lg.addColorStop(1, '#070a20');
          g.fillStyle = lg;
          g.fillRect(w / 2, 0, w / 2, h);
          orbs(g, w / 2, w / 2, h, t, u, true);
          const vg = g.createRadialGradient(w * 0.75, h * 0.5, h * 0.2, w * 0.75, h * 0.5, h * 0.9);
          vg.addColorStop(0, 'rgba(0,0,0,0)');
          vg.addColorStop(1, 'rgba(0,0,0,.45)');
          g.fillStyle = vg;
          g.fillRect(w / 2, 0, w / 2, h);
          g.restore();
          splitLabels(g, w, h, u, '단색', '빛 섞기');
        },
        controls: [
          { type: 'range', label: '빛 번짐 (shadowBlur)', min: 0, max: 40, step: 1, value: 16, on: (v) => (blur = v) },
          { type: 'toggle', label: "겹치면 더하기 ('lighter')", value: true, on: (v) => (lighter = v) },
        ] as Control[],
      };
    },
  },

  /* ───────────────────────── u53 ───────────────────────── */
  u53: {
    kind: '2d',
    caption: '왼쪽 16×16 도트 한 장(씨앗 번호로 늘 같은 무늬) → 오른쪽 창고 바닥 · 담 · 상자에 깔기',
    make() {
      const cache = new Map<string, HTMLCanvasElement>();
      let auto = true;
      let fixedSeed = 3;
      const MAP = ['GGGGGGGGG', 'GWWWWWWWG', 'GWFFFFFWG', 'GWFFFFFWG', 'GWWWWWWWG', 'GGGGGGGGG'];
      const kindOf: Record<string, number> = { F: 0, W: 1, G: 3 };
      return {
        draw(g, w, h, t) {
          const u = scaleOf(w, h);
          bg(g, w, h, '#22305e', '#111733');
          g.imageSmoothingEnabled = false;
          const seed = auto ? 1 + (Math.floor(t / 4) % 9) : fixedSeed;
          const kind = Math.floor(t / 1.5) % 4;
          // 왼쪽 큰 한 장
          const S = Math.min(h * 0.6, w * 0.34);
          const lx = w * 0.06;
          const ly = (h - S) / 2 + 6 * u;
          g.drawImage(pixTile(kind, seed, cache), lx, ly, S, S);
          g.strokeStyle = 'rgba(0,0,0,.18)';
          g.lineWidth = 1;
          g.beginPath();
          for (let i = 1; i < 16; i++) {
            g.moveTo(lx + (i * S) / 16, ly);
            g.lineTo(lx + (i * S) / 16, ly + S);
            g.moveTo(lx, ly + (i * S) / 16);
            g.lineTo(lx + S, ly + (i * S) / 16);
          }
          g.stroke();
          g.strokeStyle = '#fff';
          g.lineWidth = 2 * u;
          g.strokeRect(lx, ly, S, S);
          txt(g, `${PIX[kind]![0]} · 16×16`, lx + S / 2, ly - 9 * u, 9 * u, '#fff');
          pill(g, `씨앗 ${seed}`, lx + S / 2, ly + S + 11 * u, 8 * u, '#ffb84d', '#3a2000');
          // 오른쪽 창고 방
          const cols = 9;
          const rows = 6;
          const rx0 = w * 0.47;
          const cs = Math.min((w * 0.5) / cols, (h * 0.8) / rows);
          const ry0 = (h - cs * rows) / 2;
          for (let y = 0; y < rows; y++)
            for (let x = 0; x < cols; x++) {
              const ch = MAP[y]![x]!;
              const k = kindOf[ch] ?? 0;
              g.drawImage(pixTile(k, seed, cache), rx0 + x * cs, ry0 + y * cs, cs + 0.5, cs + 0.5);
              if (k === kind) {
                g.fillStyle = `rgba(255,255,255,${0.12 + 0.1 * Math.sin(t * 6)})`;
                g.fillRect(rx0 + x * cs, ry0 + y * cs, cs, cs);
              }
            }
          // 미는 상자
          const cx = 2 + 4 * swing(t, 1.1, 1.3);
          const crate = pixTile(2, seed, cache);
          g.fillStyle = 'rgba(0,0,0,.3)';
          g.fillRect(rx0 + cx * cs + cs * 0.1, ry0 + 2 * cs + cs * 0.85, cs * 0.9, cs * 0.18);
          g.drawImage(crate, rx0 + cx * cs, ry0 + 2 * cs, cs, cs);
          g.drawImage(crate, rx0 + 5 * cs, ry0 + 3 * cs, cs, cs);
          if (kind === 2) {
            g.strokeStyle = `rgba(255,255,255,${0.6 + 0.3 * Math.sin(t * 6)})`;
            g.lineWidth = 2 * u;
            g.strokeRect(rx0 + cx * cs, ry0 + 2 * cs, cs, cs);
            g.strokeRect(rx0 + 5 * cs, ry0 + 3 * cs, cs, cs);
          }
          g.imageSmoothingEnabled = true;
          txt(g, '→', w * 0.43, h / 2 + 6 * u, 16 * u, '#ffd36b', 'center', F, 900);
        },
        controls: [
          { type: 'toggle', label: '씨앗 자동으로 바꾸기', value: true, on: (v) => (auto = v) },
          { type: 'range', label: '씨앗 (자동 끔일 때)', min: 1, max: 30, step: 1, value: 3, on: (v) => (fixedSeed = v) },
        ] as Control[],
      };
    },
  },

  /* ───────────────────────── u54 ───────────────────────── */
  u54: {
    kind: '2d',
    caption: '왼쪽 작은 캔버스(64×40)에 도메인 워프 잡음을 그리고 → 오른쪽처럼 크게 키워 별을 얹으면 성운',
    make() {
      const SW = 64;
      const SH = 40;
      const small = mkCanvas(SW, SH);
      const sg = ctx(small);
      const img = sg.createImageData(SW, SH);
      let warp = 2;
      let acc = 1;
      const stars: [number, number, number, number][] = [];
      const r = rng(7);
      for (let i = 0; i < 90; i++) stars.push([r(), r(), r() * 1.2 + 0.3, r() * 6]);
      const paint = (t: number): void => {
        const d = img.data;
        const tt = t * 0.06;
        for (let y = 0; y < SH; y++)
          for (let x = 0; x < SW; x++) {
            const px = x / 22;
            const py = y / 22;
            const qx = fbm(px + tt, py, 3);
            const qy = fbm(px + 5.2, py + 1.3 - tt, 3);
            const v = fbm(px + warp * qx, py + warp * qy, 4);
            const k = clamp01((v - 0.25) * 1.9);
            const i = (y * SW + x) * 4;
            // 남색 → 보라 → 분홍 → 하늘 (q 로 색이 갈림)
            const R = 12 + 230 * k * k * (0.4 + qx) + 40 * qy * k;
            const Gc = 14 + 120 * k * k * qy * 1.6 + 30 * k;
            const B = 40 + 190 * k * (0.5 + qy * 0.6);
            d[i] = Math.min(255, R);
            d[i + 1] = Math.min(255, Gc);
            d[i + 2] = Math.min(255, B);
            d[i + 3] = 255;
          }
        sg.putImageData(img, 0, 0);
      };
      return {
        draw(g, w, h, t, dt) {
          const u = scaleOf(w, h);
          acc += dt;
          if (acc > 0.06) {
            acc = 0;
            paint(t);
          }
          g.fillStyle = '#05060f';
          g.fillRect(0, 0, w, h);
          // 왼쪽: 그대로(도트)
          const lw = w * 0.3;
          const lh = (lw * SH) / SW;
          const lx = w * 0.04;
          const ly = (h - lh) / 2;
          g.imageSmoothingEnabled = false;
          g.drawImage(small, lx, ly, lw, lh);
          g.strokeStyle = 'rgba(255,255,255,.7)';
          g.lineWidth = 1;
          g.strokeRect(lx, ly, lw, lh);
          txt(g, '64 × 40', lx + lw / 2, ly - 9 * u, 8.5 * u, '#cfd6ff');
          txt(g, '작게 계산', lx + lw / 2, ly + lh + 10 * u, 8.5 * u, '#9aa6e0');
          txt(g, '→', w * 0.385, h / 2, 16 * u, '#ffd36b', 'center', F, 900);
          // 오른쪽: 부드럽게 키우기 + 별
          const rx = w * 0.43;
          const ry = h * 0.08;
          const rw = w * 0.54;
          const rh = h * 0.84;
          g.save();
          rr(g, rx, ry, rw, rh, 8 * u);
          g.clip();
          g.imageSmoothingEnabled = true;
          g.imageSmoothingQuality = 'high';
          g.filter = `blur(${1.2 * u}px)`;
          g.drawImage(small, rx - 4, ry - 4, rw + 8, rh + 8);
          g.filter = 'none';
          g.globalCompositeOperation = 'lighter';
          for (const [sx, sy, sz, ph] of stars) {
            const a = 0.45 + 0.55 * Math.sin(t * 2 + ph);
            g.fillStyle = `rgba(255,255,255,${a})`;
            g.beginPath();
            g.arc(rx + sx * rw, ry + sy * rh, sz * u, 0, Math.PI * 2);
            g.fill();
          }
          g.globalCompositeOperation = 'source-over';
          g.restore();
          g.strokeStyle = 'rgba(255,255,255,.35)';
          rr(g, rx, ry, rw, rh, 8 * u);
          g.stroke();
          pill(g, '크게 키움 + 별', rx + rw / 2, ry + rh - 11 * u, 8 * u, 'rgba(0,0,0,.5)');
        },
        controls: [{ type: 'range', label: '휘어짐 (워프)', min: 0, max: 5, step: 0.1, value: 2, on: (v) => (warp = v) }] as Control[],
      };
    },
  },

  /* ───────────────────────── u55 ───────────────────────── */
  u55: {
    kind: '2d',
    caption: '유니티 장면을 캔버스로: 층을 펼쳐 보면 정렬 순서 · 가리기(마스크) · 색 곱하기 · 글자 · 선이 차례로 쌓여요',
    make() {
      // 흰 별 그림 한 장 → 색 곱하기로 물들임
      const STAR = 96;
      const star = mkCanvas(STAR, STAR);
      {
        const s = ctx(star);
        s.translate(STAR / 2, STAR / 2);
        s.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const r = i % 2 ? 19 : 44;
          s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        s.closePath();
        const gr = s.createLinearGradient(0, -44, 0, 44);
        gr.addColorStop(0, '#ffffff');
        gr.addColorStop(1, '#9a9a9a');
        s.fillStyle = gr;
        s.lineJoin = 'round';
        s.strokeStyle = '#555';
        s.lineWidth = 4;
        s.fill();
        s.stroke();
        s.fillStyle = '#333';
        s.beginPath();
        s.arc(-8, -2, 4, 0, Math.PI * 2);
        s.arc(8, -2, 4, 0, Math.PI * 2);
        s.fill();
      }
      const tinted = mkCanvas(STAR, STAR);
      const tg = ctx(tinted);
      const tint = (col: string): HTMLCanvasElement => {
        tg.globalCompositeOperation = 'source-over';
        tg.clearRect(0, 0, STAR, STAR);
        tg.drawImage(star, 0, 0);
        tg.globalCompositeOperation = 'multiply';
        tg.fillStyle = col;
        tg.fillRect(0, 0, STAR, STAR);
        tg.globalCompositeOperation = 'destination-in';
        tg.drawImage(star, 0, 0);
        tg.globalCompositeOperation = 'source-over';
        return tinted;
      };
      let explodeAuto = true;
      const NAMES = ['배경 · 정렬 0', '가리기 (마스크)', '색 곱하기', '글자', '선'];
      const LCOL = ['#7aa8ff', '#5ee0c0', '#ffcf4d', '#ff8fb8', '#c49bff'];
      return {
        draw(g, w, h, t) {
          const u = scaleOf(w, h);
          bg(g, w, h, '#232a52', '#0e1230');
          const e = explodeAuto ? swing(t, 0.7, 1.6) : 1;
          const PH = h * 0.74;
          const PW = Math.min((PH * 9) / 16, w * 0.24);
          const cx = w * 0.36;
          const px = cx - PW / 2;
          const py = h * 0.14;
          const hl = Math.floor(t / 1.2) % 5;
          const layer = (i: number): void => {
            const k = i - 2;
            g.save();
            g.translate(px + k * e * PW * 0.36, py - k * e * PH * 0.07);
            g.transform(1, -0.22 * e, 0, 1, 0, 0);
            if (e > 0.02) {
              g.fillStyle = `rgba(255,255,255,${0.05 * e})`;
              g.fillRect(0, 0, PW, PH);
              g.strokeStyle = i === hl ? LCOL[i]! : `rgba(255,255,255,${0.45 * e})`;
              g.lineWidth = (i === hl ? 2 : 1) * u;
              g.strokeRect(0, 0, PW, PH);
            }
            if (i === 0) {
              const gr = g.createLinearGradient(0, 0, 0, PH);
              gr.addColorStop(0, '#8fd3ff');
              gr.addColorStop(1, '#ffe2f0');
              g.fillStyle = gr;
              g.fillRect(0, 0, PW, PH);
              g.fillStyle = 'rgba(255,255,255,.85)';
              for (let c = 0; c < 2; c++) {
                const x = ((t * 8 * u + c * PW * 0.6) % (PW * 1.4)) - PW * 0.2;
                g.beginPath();
                g.ellipse(x, PH * (0.12 + c * 0.1), PW * 0.14, PW * 0.06, 0, 0, Math.PI * 2);
                g.fill();
              }
            } else if (i === 1) {
              g.save();
              g.beginPath();
              g.arc(PW / 2, PH * 0.36, PW * 0.36, 0, Math.PI * 2);
              g.clip();
              for (let s = -4; s < 10; s++) {
                g.fillStyle = s % 2 ? '#2ec7a8' : '#a4f5dd';
                const x0 = s * PW * 0.12 + ((t * 14 * u) % (PW * 0.24));
                g.beginPath();
                g.moveTo(x0, 0);
                g.lineTo(x0 + PW * 0.12, 0);
                g.lineTo(x0 + PW * 0.12 - PW * 0.5, PH);
                g.lineTo(x0 - PW * 0.5, PH);
                g.fill();
              }
              g.restore();
            } else if (i === 2) {
              const hue = (t * 70) % 360;
              const im = tint(`hsl(${hue} 95% 60%)`);
              const sz = PW * 0.5;
              g.save();
              g.translate(PW / 2, PH * 0.36);
              g.rotate(Math.sin(t * 1.5) * 0.25);
              g.drawImage(im, -sz / 2, -sz / 2, sz, sz);
              g.restore();
            } else if (i === 3) {
              g.font = `${PW * 0.5}px ${TF}`;
              g.textAlign = 'center';
              g.textBaseline = 'middle';
              g.lineWidth = PW * 0.06;
              g.strokeStyle = '#2a2266';
              g.strokeText('7', PW / 2, PH * 0.68);
              g.fillStyle = '#fff';
              g.fillText('7', PW / 2, PH * 0.68);
            } else {
              g.strokeStyle = '#7b4dff';
              g.lineWidth = PW * 0.035;
              g.lineCap = 'round';
              g.lineJoin = 'round';
              g.beginPath();
              for (let j = 0; j <= 12; j++) {
                const x = PW * 0.1 + (j / 12) * PW * 0.8;
                const y = PH * 0.88 + Math.sin(j * 1.2 + t * 4) * PH * 0.03;
                if (j) g.lineTo(x, y);
                else g.moveTo(x, y);
              }
              g.stroke();
            }
            if (e > 0.35) {
              g.globalAlpha = clamp01((e - 0.35) * 3);
              g.fillStyle = LCOL[i]!;
              g.beginPath();
              g.arc(0, 0, 6 * u, 0, Math.PI * 2);
              g.fill();
              txt(g, String(i), 0, 0.5, 7.5 * u, '#10142e', 'center', F, 900);
              g.globalAlpha = 1;
            }
            g.restore();
          };
          for (let i = 0; i < 5; i++) layer(i);
          if (e < 0.98) {
            g.globalAlpha = 1 - e;
            g.strokeStyle = '#0b0d1c';
            g.lineWidth = 4 * u;
            rr(g, px - 2 * u, py - 2 * u, PW + 4 * u, PH + 4 * u, 6 * u);
            g.stroke();
            g.globalAlpha = 1;
          }
          // 오른쪽 범례
          const lx = w * 0.68;
          for (let i = 0; i < 5; i++) {
            const y = h * 0.2 + i * h * 0.15;
            g.fillStyle = i === hl ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,0)';
            rr(g, lx - 4 * u, y - 9 * u, w * 0.3, 18 * u, 5 * u);
            g.fill();
            g.fillStyle = LCOL[i]!;
            g.beginPath();
            g.arc(lx + 5 * u, y, 5.5 * u, 0, Math.PI * 2);
            g.fill();
            txt(g, String(i), lx + 5 * u, y + 0.5, 7 * u, '#10142e', 'center', F, 900);
            txt(g, NAMES[i]!, lx + 14 * u, y, 8.5 * u, i === hl ? '#fff' : '#b7bfe6', 'left');
          }
          pill(g, e > 0.5 ? '층 펼치기' : '한 장으로', cx, h * 0.08, 8 * u, e > 0.5 ? '#ff6fa8' : 'rgba(0,0,0,.45)');
        },
        controls: [{ type: 'toggle', label: '층 펼치기 자동 (끄면 펼친 채)', value: true, on: (v) => (explodeAuto = v) }] as Control[],
      };
    },
  },

  /* ───────────────────────── u56 ───────────────────────── */
  u56: {
    kind: '2d',
    caption: '왼쪽 그냥 늘리기(귀퉁이 장식이 찌그러짐) · 오른쪽 9분할(귀퉁이는 그대로, 변과 가운데만 늘어남)',
    make() {
      const N = 60;
      const C = 18;
      const RES = 4;
      const src = mkCanvas(N * RES, N * RES);
      {
        const s = ctx(src);
        s.scale(RES, RES);
        const gr = s.createLinearGradient(0, 0, 0, N);
        gr.addColorStop(0, '#ffe08a');
        gr.addColorStop(0.5, '#e0a93a');
        gr.addColorStop(1, '#a8701c');
        s.fillStyle = gr;
        s.beginPath();
        s.roundRect(1, 1, N - 2, N - 2, 12);
        s.fill();
        s.strokeStyle = '#6e4510';
        s.lineWidth = 2;
        s.stroke();
        s.fillStyle = '#fff7e4';
        s.beginPath();
        s.roundRect(12, 12, N - 24, N - 24, 4);
        s.fill();
        s.strokeStyle = '#b07a22';
        s.lineWidth = 1.5;
        s.stroke();
        s.strokeStyle = 'rgba(255,255,255,.7)';
        s.lineWidth = 1;
        s.beginPath();
        s.roundRect(5, 5, N - 10, N - 10, 8);
        s.stroke();
        for (const [x, y] of [
          [7, 7],
          [N - 7, 7],
          [7, N - 7],
          [N - 7, N - 7],
        ] as const) {
          s.fillStyle = '#d63a4a';
          s.beginPath();
          s.moveTo(x, y - 5);
          s.lineTo(x + 5, y);
          s.lineTo(x, y + 5);
          s.lineTo(x - 5, y);
          s.closePath();
          s.fill();
          s.fillStyle = '#ffd0d6';
          s.beginPath();
          s.arc(x - 1, y - 1.5, 1.3, 0, Math.PI * 2);
          s.fill();
        }
      }
      let guides = true;
      const nine = (g: G, x: number, y: number, W: number, H: number, c: number): void => {
        const sx = [0, C, N - C, N];
        const dx = [x, x + c, x + W - c, x + W];
        const dy = [y, y + c, y + H - c, y + H];
        for (let j = 0; j < 3; j++)
          for (let i = 0; i < 3; i++) {
            const sw = sx[i + 1]! - sx[i]!;
            const sh = sx[j + 1]! - sx[j]!;
            const ww = dx[i + 1]! - dx[i]!;
            const hh = dy[j + 1]! - dy[j]!;
            if (ww > 0 && hh > 0) g.drawImage(src, sx[i]! * RES, sx[j]! * RES, sw * RES, sh * RES, dx[i]! - 0.25, dy[j]! - 0.25, ww + 0.5, hh + 0.5);
          }
      };
      const lines = (g: G, x: number, y: number, W: number, c: number, u: number): void => {
        g.fillStyle = '#7a5a2a';
        txt(g, '근무 지시서', x + W / 2, y + c + 7 * u, 8 * u, '#6e4510');
        g.fillStyle = 'rgba(110,69,16,.25)';
        for (let i = 0; i < 2; i++) g.fillRect(x + c + 2 * u, y + c + (15 + i * 7) * u, W - 2 * c - 4 * u, 1.5 * u);
      };
      return {
        draw(g, w, h, t) {
          const u = scaleOf(w, h);
          bg(g, w, h, '#3a2a55', '#171026');
          const hw = w / 2;
          const W = hw * (0.42 + 0.42 * (0.5 + 0.5 * Math.sin(t * 0.9)));
          const H = h * (0.34 + 0.36 * (0.5 + 0.5 * Math.sin(t * 1.25 + 1)));
          const c = C * u * 1.15;
          const y = h * 0.56 - H / 2;
          g.imageSmoothingEnabled = true;
          // 왼쪽 그냥 늘리기
          const lx = hw / 2 - W / 2;
          g.drawImage(src, lx, y, W, H);
          // 오른쪽 9분할
          const rx = hw + hw / 2 - W / 2;
          nine(g, rx, y, W, H, c);
          if (W > 2 * c + 20 * u && H > 2 * c + 22 * u) lines(g, rx, y, W, c, u);
          if (guides) {
            g.save();
            g.setLineDash([3 * u, 3 * u]);
            g.strokeStyle = `rgba(80,220,255,${0.55 + 0.35 * Math.sin(t * 3)})`;
            g.lineWidth = 1.2 * u;
            g.beginPath();
            for (const xx of [rx + c, rx + W - c]) {
              g.moveTo(xx, y - 6 * u);
              g.lineTo(xx, y + H + 6 * u);
            }
            for (const yy of [y + c, y + H - c]) {
              g.moveTo(rx - 6 * u, yy);
              g.lineTo(rx + W + 6 * u, yy);
            }
            g.stroke();
            g.restore();
          }
          splitLabels(g, w, h, u, '그냥 늘리기', '9분할');
        },
        controls: [{ type: 'toggle', label: '자르는 선 보기', value: true, on: (v) => (guides = v) }] as Control[],
      };
    },
  },

  /* ───────────────────────── u57 ───────────────────────── */
  u57: {
    kind: 'dom',
    caption: '그림 파일 없이 코드로 만든 SVG — 눈 깜빡이는 마스코트 · 쾅 찍히는 도장 · 꼭짓점 수가 바뀌는 별 · 도는 톱니',
    make(box) {
      const root = domRoot(
        box,
        'd2-svg',
        `.d2-svg{background:radial-gradient(circle at 50% 30%,#2c3f86,#0d1230)}
         .d2-svg svg{width:100%;height:100%;display:block}
         .d2-svg text{font-family:${TF}}`,
        `<svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid meet">
          <g id="bot" transform="translate(70 104)">
            <line x1="0" y1="-52" x2="0" y2="-38" stroke="#cfd8ff" stroke-width="3"/>
            <circle class="ball" cx="0" cy="-56" r="6" fill="#ff6fa8"/>
            <rect x="-38" y="-40" width="76" height="62" rx="18" fill="#7fbcff" stroke="#fff" stroke-width="3"/>
            <rect x="-28" y="-28" width="56" height="34" rx="12" fill="#14204a"/>
            <ellipse class="eye" cx="-12" cy="-12" rx="6" ry="7" fill="#7cf0ff"/>
            <ellipse class="eye" cx="12" cy="-12" rx="6" ry="7" fill="#7cf0ff"/>
            <path class="mouth" d="M-9 0 Q0 7 9 0" stroke="#7cf0ff" stroke-width="3" fill="none" stroke-linecap="round"/>
            <circle cx="-30" cy="6" r="5" fill="#ff9ec4" opacity=".8"/><circle cx="30" cy="6" r="5" fill="#ff9ec4" opacity=".8"/>
            <rect x="-26" y="26" width="52" height="30" rx="10" fill="#5a9cf0" stroke="#fff" stroke-width="3"/>
          </g>
          <g id="stamp" transform="translate(170 100)">
            <g class="st">
              <circle r="40" fill="none" stroke="#e8364a" stroke-width="5"/>
              <circle r="32" fill="none" stroke="#e8364a" stroke-width="2"/>
              <text class="word" y="10" text-anchor="middle" font-size="28" fill="#e8364a">통과</text>
            </g>
          </g>
          <g transform="translate(262 62)"><polygon class="star" fill="#ffd23f" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>
            <text class="n" y="44" text-anchor="middle" font-size="13" fill="#ffd23f">n = 5</text></g>
          <g transform="translate(262 150)"><path class="gear" fill="#9ae6b4" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/><circle r="7" fill="#0d1230"/></g>
        </svg>`,
      );
      const eyes = qa<SVGEllipseElement>(root, '.eye');
      const ball = q<SVGCircleElement>(root, '.ball');
      const st = q<SVGGElement>(root, '.st');
      const word = q<SVGTextElement>(root, '.word');
      const stampCircles = qa<SVGCircleElement>(root, '.st circle');
      const starEl = q<SVGPolygonElement>(root, '.star');
      const nEl = q<SVGTextElement>(root, '.n');
      const gear = q<SVGPathElement>(root, '.gear');
      let lastN = 0;
      let lastWord = '';
      // 톱니 경로를 코드로
      {
        let d = '';
        const teeth = 8;
        for (let i = 0; i < teeth * 4; i++) {
          const a = (i / (teeth * 4)) * Math.PI * 2;
          const r = i % 4 < 2 ? 24 : 17;
          d += `${i ? 'L' : 'M'}${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
        }
        gear.setAttribute('d', d + 'Z');
      }
      return {
        update(t) {
          const blink = t % 3 < 0.14 ? 0.6 : 7;
          for (const e of eyes) e.setAttribute('ry', String(blink));
          ball.setAttribute('cy', String(-56 + Math.sin(t * 4) * 3));
          const ph = t % 2.4;
          const k = clamp01(ph / 0.22);
          const sc = 1.9 - 0.9 * (1 - (1 - k) * (1 - k));
          const shake = ph > 0.22 && ph < 0.4 ? Math.sin(ph * 120) * 2 : 0;
          st.setAttribute('transform', `translate(${shake} 0) rotate(-12) scale(${sc})`);
          st.setAttribute('opacity', String(ph > 2.1 ? clamp01((2.4 - ph) / 0.3) : clamp01(k * 1.5)));
          const w2 = Math.floor(t / 2.4) % 2 ? '반려' : '통과';
          if (w2 !== lastWord) {
            lastWord = w2;
            word.textContent = w2;
            const col = w2 === '통과' ? '#2fbf71' : '#e8364a';
            word.setAttribute('fill', col);
            for (const c of stampCircles) c.setAttribute('stroke', col);
          }
          const n = 5 + (Math.floor(t / 1.5) % 4);
          if (n !== lastN) {
            lastN = n;
            nEl.textContent = `n = ${n}`;
          }
          const pts: string[] = [];
          for (let i = 0; i < n * 2; i++) {
            const a = -Math.PI / 2 + (i * Math.PI) / n + t * 0.3;
            const r = i % 2 ? 13 : 30;
            pts.push(`${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`);
          }
          starEl.setAttribute('points', pts.join(' '));
          gear.setAttribute('transform', `rotate(${(t * 60) % 360})`);
        },
      };
    },
  },

  /* ───────────────────────── u58 ───────────────────────── */
  u58: {
    kind: 'dom',
    caption: '왼쪽 그냥 네모 · 오른쪽 feTurbulence 잡음으로 종이 섬유 + 찢긴 가장자리 (씨앗이 바뀌면 다른 종이)',
    make(box) {
      const id = `d2pf${++uid}`;
      const root = domRoot(
        box,
        'd2-paper',
        `.d2-paper{background:repeating-linear-gradient(90deg,#5a3a22 0 9cqmin,#4e321d 9cqmin 10cqmin,#63412a 10cqmin 18cqmin)}
         .d2-paper svg{width:100%;height:100%;display:block}
         .d2-paper .lb{position:absolute;top:3cqmin;padding:.4em .9em;border-radius:99px;font-size:5cqmin;font-weight:800;background:rgba(0,0,0,.55)}
         .d2-paper .lb.r{background:#ff6fa8}`,
        `<svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid meet">
          <defs>
            <filter id="${id}" x="-10%" y="-10%" width="120%" height="120%">
              <feTurbulence class="tb1" type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="2" result="n"/>
              <feDisplacementMap class="dm" in="SourceGraphic" in2="n" scale="12" xChannelSelector="R" yChannelSelector="G" result="torn"/>
              <feTurbulence class="tb2" type="fractalNoise" baseFrequency="0.9 0.05" numOctaves="2" seed="2" result="fib"/>
              <feColorMatrix in="fib" type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.33  0 0 0 0 0.16  0 0 0 0.7 -0.18" result="fibc"/>
              <feComposite in="fibc" in2="torn" operator="in" result="fibIn"/>
              <feTurbulence class="tb3" type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="5" result="blot"/>
              <feColorMatrix in="blot" type="matrix" values="0 0 0 0 0.6  0 0 0 0 0.45  0 0 0 0 0.2  0 0 0 0.6 -0.25" result="blotc"/>
              <feComposite in="blotc" in2="torn" operator="in" result="blotIn"/>
              <feMerge><feMergeNode in="torn"/><feMergeNode class="mf" in="fibIn"/><feMergeNode in="blotIn"/></feMerge>
            </filter>
            <filter id="${id}s"><feDropShadow dx="2" dy="4" stdDeviation="3" flood-opacity=".45"/></filter>
          </defs>
          <g class="pl" filter="url(#${id}s)"><rect x="18" y="34" width="124" height="148" fill="#f3e6c8"/></g>
          <g class="pr" filter="url(#${id}s)"><rect x="178" y="34" width="124" height="148" fill="#f3e6c8" filter="url(#${id})"/></g>
          <g font-family="'Black Han Sans', sans-serif" fill="#5b3b14" text-anchor="middle">
            <text x="80" y="64" font-size="14">검사 보고서</text><text x="240" y="64" font-size="14">검사 보고서</text>
          </g>
          <g stroke="#a88a5c" stroke-width="1.2">
            ${[0, 1, 2, 3, 4].map((i) => `<line x1="32" x2="128" y1="${86 + i * 18}" y2="${86 + i * 18}"/><line x1="192" x2="288" y1="${86 + i * 18}" y2="${86 + i * 18}"/>`).join('')}
          </g>
        </svg>
        <div class="lb" style="left:12%">그냥 네모</div><div class="lb r" style="left:62%">종이 결 필터</div>`,
      );
      const tbs = qa(root, '.tb1, .tb2, .tb3');
      const dm = q(root, '.dm');
      const mf = q(root, '.mf');
      const pl = q(root, '.pl');
      const pr = q(root, '.pr');
      let seed = -1;
      let auto = true;
      return {
        update(t) {
          const s = auto ? 1 + (Math.floor(t / 1.6) % 12) : 3;
          if (s !== seed) {
            seed = s;
            tbs.forEach((e, i) => e.setAttribute('seed', String(s + i * 3)));
          }
          pl.setAttribute('transform', `rotate(${Math.sin(t * 0.8) * 2} 80 108)`);
          pr.setAttribute('transform', `rotate(${Math.sin(t * 0.8 + 1) * 2} 240 108)`);
        },
        controls: [
          { type: 'range', label: '찢김 세기', min: 0, max: 30, step: 1, value: 12, on: (v) => dm.setAttribute('scale', String(v)) },
          { type: 'toggle', label: '섬유 결', value: true, on: (v) => mf.setAttribute('in', v ? 'fibIn' : 'torn') },
          { type: 'toggle', label: '씨앗 자동으로 바꾸기', value: true, on: (v) => (auto = v) },
        ] as Control[],
      };
    },
  },

  /* ───────────────────────── u59 ───────────────────────── */
  u59: {
    kind: '2d',
    caption: '같은 과일 둘이 떨어져(트윈) 닿으면 합쳐지며 번쩍 · 화면 흔들기 · 과즙 입자가 터져요',
    make() {
      const T = 3.4;
      let shakeAmp = 6;
      const fruit = (g: G, x: number, y: number, r: number, big: boolean): void => {
        g.save();
        g.translate(x, y);
        const gr = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
        if (big) {
          gr.addColorStop(0, '#b8f58a');
          gr.addColorStop(1, '#2f9a3a');
        } else {
          gr.addColorStop(0, '#ffd08a');
          gr.addColorStop(1, '#f07a12');
        }
        g.fillStyle = gr;
        g.beginPath();
        g.arc(0, 0, r, 0, Math.PI * 2);
        g.fill();
        if (big) {
          g.save();
          g.clip();
          g.strokeStyle = '#1e6e28';
          g.lineWidth = r * 0.14;
          for (let i = -2; i <= 2; i++) {
            g.beginPath();
            g.ellipse(i * r * 0.45, 0, r * 0.12, r * 1.1, 0, 0, Math.PI * 2);
            g.stroke();
          }
          g.restore();
        }
        g.strokeStyle = big ? '#165a20' : '#b04f00';
        g.lineWidth = r * 0.08;
        g.beginPath();
        g.arc(0, 0, r, 0, Math.PI * 2);
        g.stroke();
        g.fillStyle = 'rgba(255,255,255,.55)';
        g.beginPath();
        g.ellipse(-r * 0.4, -r * 0.45, r * 0.25, r * 0.14, -0.6, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#3d2410';
        g.beginPath();
        g.arc(-r * 0.28, r * 0.05, r * 0.09, 0, Math.PI * 2);
        g.arc(r * 0.28, r * 0.05, r * 0.09, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#3d2410';
        g.lineWidth = r * 0.07;
        g.beginPath();
        g.arc(0, r * 0.18, r * 0.16, 0.2, Math.PI - 0.2);
        g.stroke();
        g.fillStyle = '#4caf50';
        g.beginPath();
        g.ellipse(r * 0.2, -r * 1.02, r * 0.28, r * 0.12, -0.5, 0, Math.PI * 2);
        g.fill();
        g.restore();
      };
      const bounce = (x: number): number => {
        const n = 7.5625;
        const d = 2.75;
        if (x < 1 / d) return n * x * x;
        if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
        if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375;
        return n * (x -= 2.625 / d) * x + 0.984375;
      };
      const elastic = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1);
      return {
        draw(g, w, h, t) {
          const u = scaleOf(w, h);
          const cyc = Math.floor(t / T);
          const tt = t % T;
          const M = 1.25;
          const tau = tt - M;
          let sx = 0;
          let sy = 0;
          if (tau > 0) {
            const a = shakeAmp * u * Math.exp(-tau * 7);
            sx = Math.sin(tau * 95) * a;
            sy = Math.cos(tau * 77) * a;
          }
          bg(g, w, h, '#ffe9b8', '#ffc9a0');
          g.save();
          g.translate(sx, sy);
          const r1 = Math.min(w, h) * 0.105;
          const r2 = r1 * 1.55;
          const cx = w / 2;
          const bottom = h * 0.9;
          // 통
          g.fillStyle = 'rgba(255,255,255,.4)';
          rr(g, w * 0.22, h * 0.14, w * 0.56, bottom - h * 0.14 + 4 * u, 10 * u);
          g.fill();
          g.strokeStyle = '#c98a4a';
          g.lineWidth = 3 * u;
          g.beginPath();
          g.moveTo(w * 0.22, h * 0.14);
          g.lineTo(w * 0.22, bottom + 4 * u);
          g.lineTo(w * 0.78, bottom + 4 * u);
          g.lineTo(w * 0.78, h * 0.14);
          g.stroke();
          const fade = tt > 3.0 ? clamp01((T - tt) / 0.4) : 1;
          g.globalAlpha = fade;
          if (tau < 0) {
            const xs = [cx - r1 * 1.7, cx + r1 * 1.7];
            for (let i = 0; i < 2; i++) {
              const st = i * 0.25;
              const k = clamp01((tt - st) / 0.6);
              let y = lerp(-r1, bottom - r1, bounce(k));
              if (tt < st) y = -r1 * 3;
              let x = xs[i]!;
              if (tt > 1.0) x = lerp(x, cx + (i ? r1 * 0.6 : -r1 * 0.6), ease((tt - 1.0) / 0.25));
              fruit(g, x, y, r1, false);
            }
          } else {
            const s = elastic(tau / 0.55);
            fruit(g, cx, bottom - r2 * s, r2 * Math.max(0.01, s), true);
            // 입자
            const r = rng(cyc * 13 + 5);
            for (let i = 0; i < 28; i++) {
              const a = -Math.PI * (0.05 + 0.9 * r());
              const sp = (90 + 150 * r()) * u;
              const life = 0.7 + 0.6 * r();
              const k = tau / life;
              if (k >= 1) continue;
              const px = cx + Math.cos(a) * sp * tau;
              const py = bottom - r2 + Math.sin(a) * sp * tau + 0.5 * 420 * u * tau * tau;
              const sz = (2.5 + 3 * r()) * u * (1 - k);
              g.fillStyle = i % 4 === 0 ? '#fff6a8' : i % 2 ? '#ff7a2f' : '#ffb347';
              if (i % 5 === 0) {
                g.save();
                g.translate(px, py);
                g.rotate(tau * 8);
                g.fillRect(-sz, -sz, sz * 2, sz * 2);
                g.restore();
              } else {
                g.beginPath();
                g.arc(px, py, sz, 0, Math.PI * 2);
                g.fill();
              }
            }
            // 점수
            if (tau < 1.2) txt(g, '+20', cx, bottom - r2 * 2.2 - tau * 30 * u, 14 * u, `rgba(255,90,40,${1 - tau / 1.2})`, 'center', TF, 400);
          }
          g.globalAlpha = 1;
          g.restore();
          if (tau > 0 && tau < 0.3) {
            g.fillStyle = `rgba(255,255,255,${0.85 * (1 - tau / 0.3)})`;
            g.fillRect(0, 0, w, h);
          }
          const lab = tau < 0 ? '트윈 — 통통 떨어지기' : tau < 1 ? '번쩍 · 흔들기 · 입자!' : '새 과일 쏙 (탄성 트윈)';
          pill(g, lab, w / 2, 12 * u, 8.5 * u, tau < 0 ? '#5a7cff' : '#ff5a3c');
        },
        controls: [{ type: 'range', label: '흔들기 세기', min: 0, max: 16, step: 1, value: 6, on: (v) => (shakeAmp = v) }] as Control[],
      };
    },
  },

  /* ───────────────────────── u60 ───────────────────────── */
  u60: {
    kind: '2d',
    caption: '반짝 단추를 한 겹씩 쌓아 굽기: 두께 → 몸통 그러데이션 → 흰 테 → 윗빛 → 글자 (색만 바꿔 여러 벌)',
    make() {
      const STEPS = ['두께', '몸통', '흰 테', '윗빛', '글자'];
      let hold = -1;
      return {
        draw(g, w, h, t) {
          const u = scaleOf(w, h);
          bg(g, w, h, '#2a3570', '#121735');
          const cyc = 7;
          const tt = t % cyc;
          const stage = hold >= 0 ? hold : Math.min(5, Math.floor(tt / 1.0));
          const sk = GLOSS[Math.floor(t / cyc) % GLOSS.length]!;
          // 왼쪽 단계 목록
          const lx = w * 0.06;
          for (let i = 0; i < 5; i++) {
            const y = h * 0.2 + i * h * 0.15;
            const done = stage > i;
            const now = stage === i;
            g.fillStyle = now ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,0)';
            rr(g, lx - 4 * u, y - 9 * u, w * 0.3, 18 * u, 6 * u);
            g.fill();
            g.fillStyle = done || now ? sk[1] : 'rgba(255,255,255,.18)';
            g.beginPath();
            g.arc(lx + 6 * u, y, 6.5 * u, 0, Math.PI * 2);
            g.fill();
            txt(g, done ? '✓' : String(i + 1), lx + 6 * u, y + 0.5, 7.5 * u, '#fff', 'center', F, 900);
            txt(g, STEPS[i]!, lx + 17 * u, y, 9 * u, done || now ? '#fff' : '#8e97c7', 'left');
          }
          // 단추
          const bw = w * 0.42;
          const bh = h * 0.3;
          const edge = bh * 0.16;
          const bx = w * 0.72 - bw / 2;
          const press = stage >= 5 ? Math.max(0, Math.sin(((tt - 5) / 2) * Math.PI * 3)) : 0;
          const by = h * 0.42 - bh / 2 + press * edge * 0.8;
          const rad = bh * 0.38;
          // 바닥 그림자
          g.fillStyle = 'rgba(0,0,0,.3)';
          g.beginPath();
          g.ellipse(bx + bw / 2, h * 0.42 + bh / 2 + edge * 1.3, bw * 0.48, edge * 0.7, 0, 0, Math.PI * 2);
          g.fill();
          if (stage >= 0) {
            rr(g, bx, h * 0.42 - bh / 2 + edge, bw, bh, rad);
            g.fillStyle = sk[2];
            g.fill();
          }
          if (stage >= 1) {
            const gr = g.createLinearGradient(0, by, 0, by + bh);
            gr.addColorStop(0, sk[0]);
            gr.addColorStop(1, sk[1]);
            rr(g, bx, by, bw, bh, rad);
            g.fillStyle = gr;
            g.fill();
          } else {
            g.setLineDash([4 * u, 3 * u]);
            g.strokeStyle = 'rgba(255,255,255,.4)';
            g.lineWidth = 1.5 * u;
            rr(g, bx, by, bw, bh, rad);
            g.stroke();
            g.setLineDash([]);
          }
          if (stage >= 2) {
            g.strokeStyle = '#fff';
            g.lineWidth = bh * 0.06;
            rr(g, bx + bh * 0.03, by + bh * 0.03, bw - bh * 0.06, bh - bh * 0.06, rad - bh * 0.03);
            g.stroke();
          }
          if (stage >= 3) {
            const gl = g.createLinearGradient(0, by, 0, by + bh * 0.5);
            gl.addColorStop(0, 'rgba(255,255,255,.75)');
            gl.addColorStop(1, 'rgba(255,255,255,.08)');
            rr(g, bx + bh * 0.14, by + bh * 0.1, bw - bh * 0.28, bh * 0.36, bh * 0.18);
            g.fillStyle = gl;
            g.fill();
          }
          if (stage >= 4) {
            g.font = `${bh * 0.42}px ${TF}`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.lineJoin = 'round';
            g.lineWidth = bh * 0.1;
            g.strokeStyle = sk[2];
            g.strokeText('시작!', bx + bw / 2, by + bh * 0.54);
            g.fillStyle = '#fff';
            g.fillText('시작!', bx + bw / 2, by + bh * 0.54);
          }
          if (stage >= 5) {
            const sh = ((tt - 5) / 2) % 1;
            g.save();
            rr(g, bx, by, bw, bh, rad);
            g.clip();
            const x = bx - bw * 0.3 + sh * bw * 1.6;
            const gs = g.createLinearGradient(x - bw * 0.15, 0, x + bw * 0.15, 0);
            gs.addColorStop(0, 'rgba(255,255,255,0)');
            gs.addColorStop(0.5, 'rgba(255,255,255,.45)');
            gs.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = gs;
            g.fillRect(bx, by, bw, bh);
            g.restore();
          }
          txt(g, stage >= 5 ? `완성 · ${sk[3]} 옷` : `${STEPS[Math.min(stage, 4)]} 굽는 중`, bx + bw / 2, h * 0.84, 9.5 * u, '#ffe28a');
        },
        controls: [{ type: 'range', label: '단계 멈추기 (-1 = 자동)', min: -1, max: 5, step: 1, value: -1, on: (v) => (hold = v) }] as Control[],
      };
    },
  },

  /* ───────────────────────── u61 ───────────────────────── */
  u61: {
    kind: 'dom',
    caption: '같은 공통 틀(HUD · 미션 패널 · 단추)에 data-game 만 바꾸면 CSS 변수로 얼음 · 나무 · 별빛 옷이 갈아입혀져요',
    make(box) {
      const SK = [
        ['icestar', '얼음 별'],
        ['warehouse', '창고지기'],
        ['mirrorlab', '천문대'],
      ] as const;
      const root = domRoot(
        box,
        'd2-skin',
        `.d2-skin{--bg:#bfe6ff;--bg2:#eaf7ff;--pan:#ffffffd9;--edge:#7cc4f0;--ink:#1d4a74;--btn:#4fb3ff;--btn2:#1e7fd0;--acc:#ffffff;--rad:4cqmin;
            background:linear-gradient(var(--bg2),var(--bg));transition:background .6s}
         .d2-skin[data-game=warehouse]{--bg:#7cc25a;--bg2:#a9dc7a;--pan:#e9c58f;--edge:#7a4a22;--ink:#4a2a10;--btn:#e08a3a;--btn2:#9a4f18;--acc:#ffe9b8;--rad:1.5cqmin}
         .d2-skin[data-game=mirrorlab]{--bg:#0b1033;--bg2:#2a2f6e;--pan:#141a45e6;--edge:#e8c25a;--ink:#ffe7a6;--btn:#3a4fa8;--btn2:#e8c25a;--acc:#ffe7a6;--rad:3cqmin}
         .d2-skin *{transition:background .6s,border-color .6s,color .6s,border-radius .6s,box-shadow .6s}
         .d2-skin .hud{position:absolute;left:3%;right:3%;top:4%;height:15%;display:flex;gap:2%;align-items:center}
         .d2-skin .chip{height:100%;display:flex;align-items:center;padding:0 3cqmin;border-radius:var(--rad);background:var(--pan);border:.9cqmin solid var(--edge);color:var(--ink);font-weight:900;font-size:6cqmin;position:relative}
         .d2-skin .chip.sc{margin-left:auto}
         .d2-skin .board{position:absolute;left:4%;top:25%;width:52%;bottom:22%;border-radius:var(--rad);background:var(--pan);border:.9cqmin solid var(--edge);display:grid;grid-template-columns:repeat(5,1fr);gap:1.2cqmin;padding:2cqmin}
         .d2-skin .board i{border-radius:calc(var(--rad)*.5);background:var(--edge);opacity:.35}
         .d2-skin .board i.on{background:var(--btn);opacity:1}
         .d2-skin .side{position:absolute;right:3%;top:25%;width:36%;bottom:22%;border-radius:var(--rad);background:var(--pan);border:.9cqmin solid var(--edge);color:var(--ink);padding:2.5cqmin 3cqmin;font-size:5cqmin;font-weight:700;position:absolute}
         .d2-skin .side b{display:block;font-size:6cqmin;margin-bottom:1.5cqmin}
         .d2-skin .side p{margin:.6em 0}
         .d2-skin .btns{position:absolute;left:0;right:0;bottom:3.5%;height:14%;display:flex;justify-content:center;gap:3cqmin}
         .d2-skin .btns span{aspect-ratio:1;height:100%;border-radius:50%;display:grid;place-items:center;font-size:7cqmin;font-weight:900;color:#fff;
            background:linear-gradient(var(--btn),var(--btn2));border:.8cqmin solid var(--acc);box-shadow:0 1.2cqmin 0 var(--btn2)}
         .d2-skin .btns span.big{aspect-ratio:auto;border-radius:99px;padding:0 5cqmin;font-size:6cqmin}
         .d2-skin[data-game=icestar] .chip::before,.d2-skin[data-game=icestar] .side::before{content:'';position:absolute;left:8%;right:8%;top:-2.2cqmin;height:3.5cqmin;border-radius:99px;background:#fff;box-shadow:0 .6cqmin 0 #d6eefc}
         .d2-skin[data-game=warehouse] .chip,.d2-skin[data-game=warehouse] .side,.d2-skin[data-game=warehouse] .board{background-image:repeating-linear-gradient(0deg,#0000 0 3cqmin,#7a4a2218 3cqmin 3.5cqmin)}
         .d2-skin[data-game=mirrorlab] .chip,.d2-skin[data-game=mirrorlab] .side,.d2-skin[data-game=mirrorlab] .board{box-shadow:0 0 3cqmin #e8c25a55, inset 0 0 0 .4cqmin #0b1033}
         .d2-skin .stars{position:absolute;inset:0;opacity:0;transition:opacity .6s;background:radial-gradient(1px 1px at 20% 30%,#fff,#0000),radial-gradient(1.5px 1.5px at 70% 12%,#fff,#0000),radial-gradient(1px 1px at 85% 80%,#fff,#0000),radial-gradient(1.5px 1.5px at 40% 90%,#fff,#0000),radial-gradient(1px 1px at 60% 55%,#fff,#0000)}
         .d2-skin[data-game=mirrorlab] .stars{opacity:1}
         .d2-skin .tabs{position:absolute;left:50%;top:4%;transform:translateX(-50%);display:flex;gap:1cqmin;height:9%}
         .d2-skin .tabs button{all:unset;cursor:pointer;padding:0 2.2cqmin;border-radius:99px;font-size:4.2cqmin;font-weight:800;background:rgba(0,0,0,.35);color:#fff;display:flex;align-items:center}
         .d2-skin .tabs button.on{background:#ff6fa8}`,
        `<div class="stars"></div>
         <div class="hud"><div class="chip">3단계</div><div class="chip sc">★ 120</div></div>
         <div class="tabs">${SK.map(([k, n]) => `<button data-k="${k}">${n}</button>`).join('')}</div>
         <div class="board">${Array.from({ length: 15 }, () => '<i></i>').join('')}</div>
         <div class="side"><b>미션</b><p>○ 3수 안에</p><p>○ 별 모두</p></div>
         <div class="btns"><span>↺</span><span class="big">힌트</span><span>▶</span></div>`,
      );
      const cells = qa(root, '.board i');
      const tabs = qa<HTMLButtonElement>(root, '.tabs button');
      let manualUntil = -1;
      let now = 0;
      let cur = '';
      const set = (k: string): void => {
        if (k === cur) return;
        cur = k;
        root.dataset['game'] = k;
        tabs.forEach((b) => b.classList.toggle('on', b.dataset['k'] === k));
      };
      tabs.forEach((b) =>
        b.addEventListener('click', () => {
          manualUntil = now + 8;
          set(b.dataset['k']!);
        }),
      );
      set('icestar');
      return {
        update(t) {
          now = t;
          if (t > manualUntil) set(SK[Math.floor(t / 2.4) % 3]![0]);
          const k = Math.floor(t * 3);
          cells.forEach((c, i) => c.classList.toggle('on', (i * 7 + k) % 15 < 4));
        },
      };
    },
  },

  /* ───────────────────────── u62 ───────────────────────── */
  u62: {
    kind: 'dom',
    caption: '그림 파일 없이 CSS 그러데이션 · 데이터 SVG 만으로 — 나뭇결 · 종이 · 줄무늬 · 집중선 · 모눈 · 물방울',
    make(box) {
      const grid = encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20'><path d='M20 0H0V20' fill='none' stroke='#7fb2e6' stroke-width='1'/></svg>`);
      const root = domRoot(
        box,
        'd2-pat',
        `.d2-pat{background:#151a3a;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(2,1fr);gap:2cqmin;padding:2.5cqmin;box-sizing:border-box}
         .d2-pat .t{position:relative;border-radius:3cqmin;overflow:hidden;box-shadow:0 1cqmin 2cqmin #0006}
         .d2-pat .t span{position:absolute;left:50%;bottom:4%;transform:translateX(-50%);white-space:nowrap;font-size:5cqmin;font-weight:800;padding:.2em .7em;border-radius:99px;background:#000a;color:#fff}
         .d2-pat .wood{background:radial-gradient(ellipse 22% 7% at 32% 38%,#0000 45%,#5a301455 50%,#0000 58%),radial-gradient(ellipse 14% 5% at 72% 70%,#0000 40%,#5a301455 48%,#0000 56%),repeating-linear-gradient(1.5deg,#c8894f 0 1.6cqmin,#b6763e 1.6cqmin 2.2cqmin,#d69a62 2.2cqmin 3.6cqmin)}
         .d2-pat .paper{background:linear-gradient(90deg,#0000 16%,#ef7a7a 16% 17%,#0000 17%),repeating-linear-gradient(#fffdf4 0 4.6cqmin,#a9cdeb 4.6cqmin 5cqmin)}
         .d2-pat .stripe{background:repeating-linear-gradient(45deg,#ffd34d 0 4cqmin,#262626 4cqmin 8cqmin)}
         .d2-pat .burst{background:#ffe27a}
         .d2-pat .grid{background:#f6fbff url("data:image/svg+xml,${grid}")}
         .d2-pat .dots{background:radial-gradient(circle,#ff7fb0 28%,#0000 31%) 0 0/7cqmin 7cqmin,radial-gradient(circle,#ffd1e3 28%,#0000 31%) 3.5cqmin 3.5cqmin/7cqmin 7cqmin,#fff0f6}`,
        `<div class="t wood"><span>나뭇결</span></div><div class="t paper"><span>공책 종이</span></div><div class="t stripe"><span>줄무늬</span></div>
         <div class="t burst"><span>집중선</span></div><div class="t grid"><span>모눈 (데이터 SVG)</span></div><div class="t dots"><span>물방울</span></div>`,
      );
      const wood = q(root, '.wood');
      const stripe = q(root, '.stripe');
      const burst = q(root, '.burst');
      const grd = q(root, '.grid');
      const dots = q(root, '.dots');
      return {
        update(t) {
          stripe.style.backgroundPosition = `${(t * 30) % 1000}px 0`;
          const a = (t * 25) % 360;
          burst.style.background = `radial-gradient(circle at 50% 45%,#fff 0 12%,#fff0 34%),repeating-conic-gradient(from ${a}deg at 50% 45%,#ff9a3c 0 4deg,#ffe27a 4deg 10deg)`;
          wood.style.backgroundPosition = `0 0, 0 0, ${Math.sin(t * 0.5) * 20}px 0`;
          grd.style.backgroundPosition = `${(t * 8) % 20}px ${(t * 8) % 20}px`;
          const s = 1 + 0.08 * Math.sin(t * 2);
          dots.style.backgroundSize = `${7 * s}cqmin ${7 * s}cqmin`;
        },
      };
    },
  },

  /* ───────────────────────── u63 ───────────────────────── */
  u63: {
    kind: 'dom',
    caption: '마스크(xor 로 테만 남기기) · 섞기(mix-blend-mode) · 잘라내기(clip-path 별 ↔ 육각) · 뒤 흐림(backdrop-filter 유리)',
    make(box) {
      const root = domRoot(
        box,
        'd2-mask',
        `.d2-mask{background:#151a3a;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:2cqmin;padding:2.5cqmin;box-sizing:border-box}
         .d2-mask .t{position:relative;border-radius:3cqmin;overflow:hidden;background:#232a5a}
         .d2-mask .t>span{position:absolute;left:3cqmin;top:2.5cqmin;font-size:4.6cqmin;font-weight:800;padding:.2em .7em;border-radius:99px;background:#000a;z-index:5}
         .d2-mask .ring{position:absolute;left:50%;top:56%;width:52%;height:58%;transform:translate(-50%,-50%);border-radius:4cqmin;padding:1.6cqmin;
            -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}
         .d2-mask .inner{position:absolute;left:50%;top:56%;width:46%;height:46%;transform:translate(-50%,-50%);border-radius:3cqmin;background:#2f3a7a;display:grid;place-items:center;font-size:6cqmin;font-weight:900;color:#ffe7a6}
         .d2-mask .blend{background:#fff}
         .d2-mask .blend i{position:absolute;width:34%;aspect-ratio:1;border-radius:50%;mix-blend-mode:multiply;top:30%;left:33%}
         .d2-mask .clip{background:radial-gradient(circle at 50% 60%,#2b2f6e,#141838)}
         .d2-mask .shape{position:absolute;left:50%;top:58%;width:44%;aspect-ratio:1;transform:translate(-50%,-50%);background:linear-gradient(135deg,#ffd23f,#ff6fa8 60%,#8b6bff)}
         .d2-mask .glassbg{position:absolute;inset:0;background:#1d1f4a}
         .d2-mask .glassbg i{position:absolute;border-radius:50%;width:28%;aspect-ratio:1}
         .d2-mask .glass{position:absolute;top:30%;width:44%;height:58%;border-radius:3cqmin;background:#ffffff26;border:.4cqmin solid #ffffff80;
            backdrop-filter:blur(2.4cqmin) saturate(1.6);-webkit-backdrop-filter:blur(2.4cqmin) saturate(1.6);display:grid;place-items:center;font-size:5cqmin;font-weight:800}`,
        `<div class="t"><span>mask xor 테</span><div class="inner">카드</div><div class="ring"></div></div>
         <div class="t blend"><span>mix-blend-mode</span><i style="background:#00c8ff"></i><i style="background:#ff3fb4"></i><i style="background:#ffe600"></i></div>
         <div class="t clip"><span>clip-path</span><div class="shape"></div></div>
         <div class="t"><span>backdrop-filter</span><div class="glassbg"><i style="background:#ff6fa8;left:8%;top:30%"></i><i style="background:#ffd23f;left:38%;top:50%"></i><i style="background:#3ee0ff;left:66%;top:26%"></i></div><div class="glass">유리</div></div>`,
      );
      const ring = q(root, '.ring');
      const blobs = qa(root, '.blend i');
      const shape = q(root, '.shape');
      const glass = q(root, '.glass');
      const gb = qa(root, '.glassbg i');
      return {
        update(t) {
          ring.style.background = `conic-gradient(from ${(t * 120) % 360}deg,#ff6fa8,#ffd23f,#3ee0ff,#8b6bff,#ff6fa8)`;
          blobs.forEach((b, i) => {
            const a = t * 1.1 + (i * Math.PI * 2) / 3;
            b.style.transform = `translate(${Math.cos(a) * 32}%, ${Math.sin(a) * 26}%)`;
          });
          // 별(10점) ↔ 육각형 (같은 점 수로 섞기)
          const k = swing(t, 1.1, 1.4);
          const pts: string[] = [];
          for (let i = 0; i < 12; i++) {
            const a = -Math.PI / 2 + (i * Math.PI) / 6 + t * 0.4;
            const star = i % 2 ? 0.22 : 0.5;
            const hex = 0.5 / Math.cos(((((a + Math.PI / 2 - t * 0.4) % (Math.PI / 3)) + Math.PI / 3) % (Math.PI / 3)) - Math.PI / 6) * 0.866;
            const r = lerp(star, Math.min(0.5, hex), k);
            pts.push(`${(50 + Math.cos(a) * r * 100).toFixed(1)}% ${(50 + Math.sin(a) * r * 100).toFixed(1)}%`);
          }
          shape.style.clipPath = `polygon(${pts.join(',')})`;
          glass.style.left = `${28 + Math.sin(t * 0.9) * 24}%`;
          gb.forEach((b, i) => (b.style.transform = `translateY(${Math.sin(t * 1.3 + i * 2) * 25}%)`));
        },
      };
    },
  },

  /* ───────────────────────── u64 ───────────────────────── */
  u64: {
    kind: 'dom',
    caption: '위 보통 글자 · 아래 같은 글자에 굵은 테(text-stroke) + 그러데이션 글자(background-clip:text) + 흐르는 빛 = 만화 제목',
    make(box) {
      const root = domRoot(
        box,
        'd2-title',
        `.d2-title{background:radial-gradient(circle at 50% 62%,#fff4 0 10%,#0000 45%),repeating-conic-gradient(from 0deg at 50% 62%,#2a3a9a 0 5deg,#1c2766 5deg 10deg);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4cqmin}
         .d2-title .plain{font-family:${TF};font-size:12cqmin;color:#fff;position:relative}
         .d2-title .tag{font-family:${F};font-size:4.4cqmin;font-weight:800;padding:.2em .8em;border-radius:99px;background:#000a;margin-bottom:-2cqmin}
         .d2-title .tag.on{background:#ff6fa8}
         .d2-title .fancy{position:relative;font-family:${TF};font-size:19cqmin;line-height:1.1;white-space:nowrap}
         .d2-title .fancy .back{position:absolute;inset:0;color:#2a1600;-webkit-text-stroke:2.6cqmin #2a1600;text-shadow:0 1.6cqmin 0 #2a1600,0 2.4cqmin 3cqmin #0008}
         .d2-title .fancy .mid{position:absolute;inset:0;color:#fff;-webkit-text-stroke:1.2cqmin #fff}
         .d2-title .fancy .front{position:relative;background:linear-gradient(180deg,#fffbd0 0%,#ffe24a 42%,#ff9a1a 62%,#ff6a00 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
         .d2-title .fancy .shine{position:absolute;inset:0;background:linear-gradient(105deg,#0000 40%,#fffffff0 50%,#0000 60%) no-repeat;background-size:250% 100%;-webkit-background-clip:text;background-clip:text;color:transparent}`,
        `<div class="tag">보통</div><div class="plain">수학 검문소!</div>
         <div class="tag on">테 + 그러데이션</div>
         <div class="fancy"><span class="back">수학 검문소!</span><span class="mid">수학 검문소!</span><span class="front">수학 검문소!</span><span class="shine">수학 검문소!</span></div>`,
      );
      const fancy = q(root, '.fancy');
      const shine = q(root, '.shine');
      let speed = 1;
      return {
        update(t) {
          const tt = (t * speed) % 2.6;
          shine.style.backgroundPosition = `${120 - clamp01(tt / 1.2) * 140}% 0`;
          const pop = tt < 0.35 ? 1 + Math.sin((tt / 0.35) * Math.PI) * 0.08 : 1;
          fancy.style.transform = `rotate(${-3 + Math.sin(t * 1.5) * 1.5}deg) scale(${pop})`;
        },
        controls: [{ type: 'range', label: '빛 흐르는 빠르기', min: 0.2, max: 3, step: 0.1, value: 1, on: (v) => (speed = v) }] as Control[],
      };
    },
  },

  /* ───────────────────────── u65 ───────────────────────── */
  u65: {
    kind: 'dom',
    caption: '@keyframes 로만 움직여요 — 팝 · 쾅(도장) · 흔들 · 숨쉬기 · LED 깜빡임',
    make(box) {
      const root = domRoot(
        box,
        'd2-kf',
        `.d2-kf{background:linear-gradient(#2a3570,#121735);display:grid;grid-template-columns:repeat(5,1fr);align-items:center;padding:0 2cqmin;box-sizing:border-box}
         .d2-kf .c{display:flex;flex-direction:column;align-items:center;gap:6cqmin}
         .d2-kf .c b{font-size:5cqmin;font-weight:800;color:#cfd6ff}
         .d2-kf .o{width:16cqmin;height:16cqmin;display:grid;place-items:center;font-weight:900}
         .d2-kf .pop{border-radius:50%;background:radial-gradient(circle at 35% 30%,#ffe9a8,#ffb300);animation:d2kfPop 1.4s cubic-bezier(.3,1.6,.5,1) infinite;font-size:6cqmin;color:#7a4a00}
         @keyframes d2kfPop{0%{transform:scale(0)}35%{transform:scale(1)}80%{transform:scale(1);opacity:1}100%{transform:scale(1);opacity:0}}
         .d2-kf .bang{border:1.1cqmin solid #ff4d5e;border-radius:50%;color:#ff4d5e;font-size:5.4cqmin;font-family:${TF};animation:d2kfBang 1.8s ease-in infinite}
         @keyframes d2kfBang{0%{transform:scale(2.4) rotate(-14deg);opacity:0}18%{transform:scale(.92) rotate(-14deg);opacity:1}24%{transform:scale(1.05) rotate(-14deg) translateX(.6cqmin)}30%{transform:scale(1) rotate(-14deg) translateX(-.6cqmin)}36%,85%{transform:scale(1) rotate(-14deg);opacity:1}100%{opacity:0;transform:scale(1) rotate(-14deg)}}
         .d2-kf .shake{background:#7fbcff;border-radius:3cqmin;font-size:7cqmin;animation:d2kfShake 1.6s ease-in-out infinite;transform-origin:50% 90%}
         @keyframes d2kfShake{0%,50%,100%{transform:rotate(0)}10%{transform:rotate(-14deg)}20%{transform:rotate(12deg)}30%{transform:rotate(-8deg)}40%{transform:rotate(5deg)}}
         .d2-kf .breath{border-radius:50%;background:radial-gradient(circle at 40% 35%,#c8ffe0,#2fbf71);animation:d2kfBreath 2.4s ease-in-out infinite}
         @keyframes d2kfBreath{0%,100%{transform:scale(.88);box-shadow:0 0 0 #2fbf7100}50%{transform:scale(1.08);box-shadow:0 0 5cqmin #2fbf71cc}}
         .d2-kf .led{display:grid;grid-template-columns:repeat(3,1fr);gap:1.2cqmin;width:18cqmin;height:18cqmin}
         .d2-kf .led i{border-radius:50%;background:#3a0d14;animation:d2kfLed 1.2s steps(1) infinite}
         @keyframes d2kfLed{0%{background:#ff3b4f;box-shadow:0 0 2cqmin #ff3b4f}40%,100%{background:#3a0d14;box-shadow:none}}`,
        `<div class="c"><div class="o pop">+1</div><b>팝</b></div>
         <div class="c"><div class="o bang">쾅</div><b>쾅</b></div>
         <div class="c"><div class="o shake">?</div><b>흔들</b></div>
         <div class="c"><div class="o breath"></div><b>숨쉬기</b></div>
         <div class="c"><div class="led">${Array.from({ length: 9 }, (_, i) => `<i style="animation-delay:${(((i % 3) + Math.floor(i / 3)) * 0.13).toFixed(2)}s"></i>`).join('')}</div><b>LED</b></div>`,
      );
      let paused = false;
      return {
        controls: [
          {
            type: 'toggle',
            label: '멈추기',
            value: false,
            on: (v) => {
              paused = v;
              qa(root, '*').forEach((e) => (e.style.animationPlayState = paused ? 'paused' : 'running'));
            },
          },
        ] as Control[],
      };
    },
  },

  /* ───────────────────────── u66 ───────────────────────── */
  u66: {
    kind: 'dom',
    caption: 'perspective + preserve-3d — 카드가 차례로 뒤집혀 뒷면(숫자)이 나와요',
    make(box) {
      const root = domRoot(
        box,
        'd2-flip',
        `.d2-flip{background:radial-gradient(circle at 50% 40%,#2e7d4f,#123a24);display:flex;align-items:center;justify-content:center;gap:5cqmin;perspective:120cqmin}
         .d2-flip .card{width:22cqmin;height:32cqmin;position:relative;transform-style:preserve-3d}
         .d2-flip .face{position:absolute;inset:0;border-radius:3cqmin;backface-visibility:hidden;-webkit-backface-visibility:hidden;display:grid;place-items:center;box-shadow:0 1.5cqmin 3cqmin #0007}
         .d2-flip .front{background:repeating-linear-gradient(45deg,#2b3f9e 0 2cqmin,#3550b8 2cqmin 4cqmin);border:1.2cqmin solid #fff;box-sizing:border-box;font-family:${TF};font-size:12cqmin;color:#ffd23f}
         .d2-flip .back{transform:rotateY(180deg);background:linear-gradient(#fffdf2,#ffeec2);border:1.2cqmin solid #e8c25a;box-sizing:border-box;font-family:${TF};font-size:14cqmin;color:#d0342c}
         .d2-flip .tag{position:absolute;left:50%;bottom:5%;transform:translateX(-50%);font-size:4.6cqmin;font-weight:800;padding:.2em .8em;border-radius:99px;background:#000a}`,
        `${[7, 3, 9].map((n) => `<div class="card"><div class="face front">?</div><div class="face back">${n}</div></div>`).join('')}<div class="tag">rotateY · backface-visibility</div>`,
      );
      const cards = qa(root, '.card');
      let tilt = 12;
      return {
        update(t) {
          cards.forEach((c, i) => {
            const ph = (t - i * 0.35) % 4;
            const k = ph < 0.6 ? 0 : ph < 1.3 ? ease((ph - 0.6) / 0.7) : ph < 2.8 ? 1 : ph < 3.5 ? 1 - ease((ph - 2.8) / 0.7) : 0;
            const lift = Math.sin(k * Math.PI) * 4;
            c.style.transform = `translateY(${-lift}cqmin) rotateX(${tilt}deg) rotateY(${k * 180}deg)`;
          });
        },
        controls: [{ type: 'range', label: '내려다보는 각도', min: 0, max: 40, step: 1, value: 12, on: (v) => (tilt = v) }] as Control[],
      };
    },
  },

  /* ───────────────────────── u67 ───────────────────────── */
  u67: {
    kind: 'dom',
    caption: '위: 자리 폭이 좁아지면 @container 가 세로 배치로 · 왼쪽 아래: :has 로 고른 칸이 있으면 상자가 초록 · 오른쪽 아래: color-mix 색 섞기',
    make(box) {
      const root = domRoot(
        box,
        'd2-mod',
        `.d2-mod{background:#151a3a;padding:2.5cqmin;box-sizing:border-box;display:grid;grid-template-rows:1.15fr 1fr;grid-template-columns:1fr 1fr;gap:2.5cqmin;font-size:4.4cqmin}
         .d2-mod .lab{position:absolute;right:1.5cqmin;top:1.2cqmin;font-size:3.8cqmin;font-weight:800;color:#9aa6e0}
         .d2-mod .top{grid-column:1/3;position:relative;background:#232a5a;border-radius:3cqmin;padding:3cqmin}
         .d2-mod .cq{container-type:inline-size;container-name:d2cq;height:100%;border:.5cqmin dashed #7fbcff;border-radius:2cqmin;box-sizing:border-box;padding:1.2cqmin;overflow:hidden}
         .d2-mod .card{display:flex;flex-direction:column;align-items:center;gap:1cqmin;background:#fff;color:#1d2558;border-radius:2cqmin;padding:1.2cqmin;height:100%;box-sizing:border-box;justify-content:center}
         .d2-mod .card .ic{width:8cqmin;height:8cqmin;border-radius:50%;background:linear-gradient(#ffd23f,#ff8a1f);flex:none}
         .d2-mod .card .tx{font-weight:900;white-space:nowrap}
         .d2-mod .card .bt{background:#2f74e8;color:#fff;border-radius:99px;padding:.1em .8em;font-weight:800;white-space:nowrap}
         @container d2cq (min-width: 15em){.d2-mod .card{flex-direction:row;justify-content:space-between;padding:1.2cqmin 3cqmin}.d2-mod .card .tx{flex:1;margin-left:2cqmin}}
         .d2-mod .has{position:relative;background:#232a5a;border:.7cqmin solid #232a5a;border-radius:3cqmin;padding:6cqmin 3cqmin 2cqmin;display:flex;flex-direction:column;gap:1.4cqmin;transition:background .3s,border-color .3s}
         .d2-mod .has:has(.on){border-color:#2fbf71;background:#1d4a3a}
         .d2-mod .has i{font-style:normal;background:#ffffff1a;border-radius:1.5cqmin;padding:.2em .6em;font-weight:700}
         .d2-mod .has i.on{background:#2fbf71}
         .d2-mod .has i.on::after{content:' ✓'}
         .d2-mod .mix{position:relative;background:#232a5a;border-radius:3cqmin;padding:6cqmin 3cqmin 2cqmin;display:flex;align-items:center;justify-content:space-around}
         .d2-mod .mix i{width:13cqmin;aspect-ratio:1;border-radius:50%;box-shadow:0 1cqmin 2cqmin #0006}
         .d2-mod .mix .m{width:17cqmin;background:color-mix(in oklab,#2f74e8 var(--p),#ffd23f);display:grid;place-items:center;font-weight:900;color:#fff;text-shadow:0 0 1cqmin #0008}`,
        `<div class="top"><span class="lab">@container</span><div class="cq"><div class="card"><span class="ic"></span><span class="tx">자리에 맞춰요</span><span class="bt">열기</span></div></div></div>
         <div class="has"><span class="lab">:has()</span><i>사과</i><i>배</i><i>포도</i></div>
         <div class="mix"><span class="lab">color-mix</span><i style="background:#2f74e8"></i><i class="m">50%</i><i style="background:#ffd23f"></i></div>`,
      );
      const cq = q(root, '.cq');
      const items = qa(root, '.has i');
      const m = q(root, '.mix .m');
      let lastP = -1;
      return {
        update(t) {
          cq.style.width = `${lerp(38, 100, swing(t, 0.8, 1.4))}%`;
          const k = Math.floor(t / 0.9) % 6;
          items.forEach((it, i) => it.classList.toggle('on', k === i + 1 || (k === 4 && i === 2)));
          const p = Math.round(50 + 50 * Math.sin(t * 0.9));
          if (p !== lastP) {
            lastP = p;
            m.style.setProperty('--p', `${p}%`);
            m.textContent = `${p}%`;
          }
        },
      };
    },
  },

  /* ───────────────────────── u68 ───────────────────────── */
  u68: {
    kind: '2d',
    caption: '1600×900 판 하나를 PC · 태블릿 · 가로 폰 화면에 맞춰 통째로 확대/축소 (남는 곳은 검은 띠)',
    make() {
      const DEV: [string, number, number][] = [
        ['PC 1920×1200', 1920, 1200],
        ['태블릿 1180×820', 1180, 820],
        ['가로 폰 844×390', 844, 390],
      ];
      const board = (g: G): void => {
        const gr = g.createLinearGradient(0, 0, 0, 900);
        gr.addColorStop(0, '#6b4a2e');
        gr.addColorStop(1, '#3d2816');
        g.fillStyle = gr;
        g.fillRect(0, 0, 1600, 900);
        g.fillStyle = '#1c1430';
        g.fillRect(0, 0, 1600, 110);
        txt(g, '1600 × 900 판', 800, 58, 62, '#ffe28a', 'center', TF, 400);
        g.fillStyle = '#fff6e0';
        rr(g, 70, 170, 560, 650, 24);
        g.fill();
        g.fillStyle = '#c9b48a';
        for (let i = 0; i < 7; i++) g.fillRect(120, 260 + i * 70, 460, 14);
        txt(g, '자료', 350, 215, 46, '#6e4510', 'center', TF, 400);
        for (let i = 0; i < 3; i++) {
          g.fillStyle = ['#7fbcff', '#ffcb7a', '#ffa6c9'][i]!;
          rr(g, 700 + i * 290, 170, 250, 330, 22);
          g.fill();
        }
        g.fillStyle = '#e8c25a';
        rr(g, 1150, 640, 380, 150, 75);
        g.fill();
        txt(g, '판정', 1340, 717, 70, '#4a2a00', 'center', TF, 400);
      };
      return {
        draw(g, w, h, t) {
          const u = scaleOf(w, h);
          bg(g, w, h, '#2a3a6e', '#121a3a');
          const P = 2.6;
          const i0 = Math.floor(t / P) % 3;
          const i1 = (i0 + 1) % 3;
          const k = ease(((t % P) - 1.8) / 0.8);
          const d0 = DEV[i0]!;
          const d1 = DEV[i1]!;
          const rw = lerp(d0[1], d1[1], k);
          const rh = lerp(d0[2], d1[2], k);
          // 실제 크기 → 그림 크기 (모든 기기 같은 비율로 줄여 그림)
          const vs = Math.min((w * 0.86) / 1920, (h * 0.66) / 1200);
          const sw = rw * vs;
          const sh = rh * vs;
          const sx = (w - sw) / 2;
          const sy = h * 0.43 - sh / 2;
          const bez = 5 * u;
          g.fillStyle = '#0b0d18';
          rr(g, sx - bez, sy - bez, sw + bez * 2, sh + bez * 2, 7 * u);
          g.fill();
          g.strokeStyle = '#59607e';
          g.lineWidth = 1.5 * u;
          g.stroke();
          // 화면 + 판
          g.save();
          g.beginPath();
          g.rect(sx, sy, sw, sh);
          g.clip();
          g.fillStyle = '#000';
          g.fillRect(sx, sy, sw, sh);
          g.strokeStyle = 'rgba(255,255,255,.07)';
          g.lineWidth = 1;
          g.beginPath();
          for (let x = -sh; x < sw; x += 6 * u) {
            g.moveTo(sx + x, sy + sh);
            g.lineTo(sx + x + sh, sy);
          }
          g.stroke();
          const s = Math.min(sw / 1600, sh / 900);
          const bw = 1600 * s;
          const bh = 900 * s;
          g.translate(sx + (sw - bw) / 2, sy + (sh - bh) / 2);
          g.scale(s, s);
          board(g);
          g.restore();
          const real = Math.min(rw / 1600, rh / 900);
          txt(g, k < 0.5 ? d0[0] : d1[0], w / 2, h * 0.84, 10 * u, '#fff');
          pill(g, `× ${real.toFixed(2)}`, w / 2, h * 0.93, 8.5 * u, '#ff6fa8');
        },
      };
    },
  },

  /* ───────────────────────── u69 ───────────────────────── */
  u69: {
    kind: '2d',
    caption: '화면 높이가 줄어들 때 — 왼쪽 규칙 없음(아래가 잘림) · 오른쪽 max-height:500px 규칙으로 글씨 · 단추가 작아져 딱 맞음',
    make() {
      const VW = 844;
      const layout = (g: G, H: number, compact: boolean): number => {
        const hud = compact ? 46 : 84;
        g.fillStyle = '#1c2766';
        g.fillRect(0, 0, VW, hud);
        txt(g, '3단계  ★ 120', 24, hud / 2, compact ? 24 : 40, '#ffe28a', 'left', TF, 400);
        const bs = compact ? Math.min(H - hud - 22, 400) : 400;
        const bx = compact ? 22 : 36;
        const by = hud + (compact ? 11 : 24);
        g.fillStyle = '#7cc25a';
        rr(g, bx, by, bs, bs, 16);
        g.fill();
        g.strokeStyle = 'rgba(255,255,255,.5)';
        g.lineWidth = 3;
        g.beginPath();
        for (let i = 1; i < 4; i++) {
          g.moveTo(bx + (i * bs) / 4, by);
          g.lineTo(bx + (i * bs) / 4, by + bs);
          g.moveTo(bx, by + (i * bs) / 4);
          g.lineTo(bx + bs, by + (i * bs) / 4);
        }
        g.stroke();
        const bh = compact ? 62 : 100;
        const gap = compact ? 12 : 22;
        const names = ['다시', '힌트', '다음'];
        for (let i = 0; i < 3; i++) {
          const y = by + i * (bh + gap);
          g.fillStyle = ['#4fb3ff', '#ffb02e', '#ff6fa8'][i]!;
          rr(g, 560, y, 240, bh, bh / 2);
          g.fill();
          txt(g, names[i]!, 680, y + bh / 2, compact ? 28 : 44, '#fff', 'center', TF, 400);
        }
        return Math.max(by + bs, by + 3 * bh + 2 * gap);
      };
      return {
        draw(g, w, h, t) {
          const u = scaleOf(w, h);
          bg(g, w, h, '#2a3a6e', '#121a3a');
          const H = lerp(760, 390, swing(t, 0.7, 1.5));
          const hw = w / 2;
          const s = Math.min((hw * 0.84) / VW, (h * 0.62) / 760);
          for (let side = 0; side < 2; side++) {
            const compact = side === 1 && H <= 500;
            const ox = side * hw + (hw - VW * s) / 2;
            const oy = h * 0.2;
            g.fillStyle = '#0b0d18';
            rr(g, ox - 4 * u, oy - 4 * u, VW * s + 8 * u, H * s + 8 * u, 6 * u);
            g.fill();
            g.save();
            g.beginPath();
            g.rect(ox, oy, VW * s, H * s);
            g.clip();
            g.translate(ox, oy);
            g.scale(s, s);
            g.fillStyle = '#eaf3ff';
            g.fillRect(0, 0, VW, H);
            const bottom = layout(g, H, compact);
            g.restore();
            if (bottom > H + 2) {
              g.fillStyle = 'rgba(255,60,80,.85)';
              g.fillRect(ox, oy + H * s - 3 * u, VW * s, 3 * u);
              pill(g, '잘림!', ox + (VW * s) / 2, oy + H * s + 9 * u, 8 * u, '#ff3c50');
            } else if (side === 1 && compact) {
              pill(g, '규칙 켬', ox + (VW * s) / 2, oy + H * s + 9 * u, 8 * u, '#2fbf71');
            }
          }
          g.fillStyle = 'rgba(255,255,255,.4)';
          g.fillRect(hw - 0.75, h * 0.15, 1.5, h * 0.85);
          pill(g, '규칙 없음', w * 0.25, 11 * u, 8.5 * u, 'rgba(10,14,40,.7)', '#cfd6ff');
          pill(g, '@media (max-height:500px)', w * 0.75, 11 * u, 8 * u, H <= 500 ? '#ff6fa8' : 'rgba(10,14,40,.7)');
          txt(g, `높이 ${Math.round(H)}`, w / 2, 25 * u, 8 * u, '#ffe28a');
        },
      };
    },
  },

  /* ───────────────────────── u70 ───────────────────────── */
  u70: {
    kind: '2d',
    caption: '창 높이가 줄면 넘치는 패널만 필요한 만큼 줄여요 — 위 숫자가 패널마다 다른 축소 비율',
    make() {
      const VW = 900;
      const PAN: [number, number, string, string][] = [
        [20, 210, '#ffcb7a', '미션'],
        [250, 400, '#7cc25a', '판'],
        [670, 210, '#7fbcff', '정보'],
      ];
      const NEED = [560, 400, 300];
      let all = false;
      return {
        draw(g, w, h, t) {
          const u = scaleOf(w, h);
          bg(g, w, h, '#2a3a6e', '#121a3a');
          const H = lerp(640, 300, swing(t, 0.7, 1.5));
          const s = Math.min((w * 0.9) / VW, (h * 0.66) / 640);
          const ox = (w - VW * s) / 2;
          const oy = h * 0.24;
          g.fillStyle = '#0b0d18';
          rr(g, ox - 4 * u, oy - 4 * u, VW * s + 8 * u, H * s + 8 * u, 6 * u);
          g.fill();
          g.fillStyle = '#e9eefc';
          g.fillRect(ox, oy, VW * s, H * s);
          const A = H - 40;
          const minAll = Math.min(...NEED.map((n) => Math.min(1, A / n)));
          for (let i = 0; i < 3; i++) {
            const [px, pw, col, name] = PAN[i]!;
            const need = NEED[i]!;
            const k = all ? minAll : Math.min(1, A / need);
            g.save();
            g.beginPath();
            g.rect(ox, oy, VW * s, H * s);
            g.clip();
            g.translate(ox + px * s, oy + 20 * s);
            g.scale(s * k, s * k);
            g.fillStyle = '#fff';
            rr(g, 0, 0, pw, need, 18);
            g.fill();
            g.strokeStyle = col;
            g.lineWidth = 6;
            g.stroke();
            g.fillStyle = col;
            rr(g, 0, 0, pw, 60, 18);
            g.fill();
            txt(g, name, pw / 2, 32, 34, '#fff', 'center', TF, 400);
            g.fillStyle = '#d5dcf0';
            const rows = Math.floor((need - 90) / 56);
            for (let r = 0; r < rows; r++) {
              rr(g, 20, 84 + r * 56, pw - 40, 40, 10);
              g.fill();
            }
            g.restore();
            const lx = ox + (px + pw / 2) * s;
            const shrunk = k < 0.999;
            pill(g, shrunk ? `× ${k.toFixed(2)}` : '그대로', lx, oy - 13 * u, 8 * u, shrunk ? '#ff6fa8' : '#2fbf71');
          }
          txt(g, `창 높이 ${Math.round(H)}`, w / 2, h * 0.06, 8.5 * u, '#ffe28a');
        },
        controls: [{ type: 'toggle', label: '비교: 모두 같은 비율로 줄이기', value: false, on: (v) => (all = v) }] as Control[],
      };
    },
  },

  /* ───────────────────────── u71 ───────────────────────── */
  u71: {
    kind: '2d',
    caption: '① 폰을 눕히면 「세워 주세요」(세로 고정) ② 노치를 피해 HUD 내리기(safe-area) ③ 주소창이 생겨도 100dvh 는 딱 맞음',
    make() {
      const phone = (g: G, cx: number, cy: number, pw: number, ph: number, u: number, notch = true): void => {
        g.fillStyle = '#0b0d18';
        rr(g, cx - pw / 2 - 3 * u, cy - ph / 2 - 3 * u, pw + 6 * u, ph + 6 * u, 8 * u);
        g.fill();
        g.strokeStyle = '#59607e';
        g.lineWidth = 1.2 * u;
        g.stroke();
        if (notch) {
          g.fillStyle = '#0b0d18';
        }
      };
      return {
        draw(g, w, h, t) {
          const u = scaleOf(w, h);
          bg(g, w, h, '#2a3a6e', '#121a3a');
          const cw = w / 3;
          const ph = Math.min(h * 0.6, cw * 0.88);
          const pw = ph * 0.48;
          const cy = h * 0.46;
          const labels = ['방향 고정', '노치 피하기', '100dvh'];
          // ① 방향
          {
            const cx = cw / 2;
            const a = (Math.PI / 2) * swing(t, 0.8, 1.6);
            g.save();
            g.translate(cx, cy);
            g.rotate(-a);
            phone(g, 0, 0, pw, ph, u);
            g.save();
            rr(g, -pw / 2, -ph / 2, pw, ph, 5 * u);
            g.clip();
            const gr = g.createLinearGradient(0, -ph / 2, 0, ph / 2);
            gr.addColorStop(0, '#8fd3ff');
            gr.addColorStop(1, '#ffe2f0');
            g.fillStyle = gr;
            g.fillRect(-pw / 2, -ph / 2, pw, ph);
            g.font = `${pw * 0.6}px ${TF}`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillStyle = '#ff6fa8';
            g.fillText('7', 0, -ph * 0.05);
            g.fillStyle = '#7b4dff';
            for (let i = 0; i < 3; i++) g.fillRect(-pw * 0.35 + i * pw * 0.26, ph * 0.28, pw * 0.18, pw * 0.18);
            g.restore();
            g.restore();
            if (a > 1.1) {
              const al = clamp01((a - 1.1) / 0.4);
              g.globalAlpha = al;
              g.fillStyle = 'rgba(10,14,40,.82)';
              rr(g, cx - ph / 2, cy - pw / 2, ph, pw, 5 * u);
              g.fill();
              txt(g, '↻', cx, cy - pw * 0.14, 16 * u, '#ffd23f', 'center', F, 900);
              txt(g, '세워 주세요', cx, cy + pw * 0.22, 7.5 * u, '#fff');
              g.globalAlpha = 1;
            }
          }
          // ② 노치
          {
            const cx = cw * 1.5;
            const on = Math.floor(t / 2.2) % 2 === 1;
            phone(g, cx, cy, pw, ph, u);
            const x0 = cx - pw / 2;
            const y0 = cy - ph / 2;
            g.save();
            rr(g, x0, y0, pw, ph, 5 * u);
            g.clip();
            g.fillStyle = '#eaf3ff';
            g.fillRect(x0, y0, pw, ph);
            const safe = ph * 0.09;
            if (on) {
              g.fillStyle = 'rgba(47,191,113,.3)';
              g.fillRect(x0, y0, pw, safe);
              g.fillRect(x0, y0 + ph - safe * 0.6, pw, safe * 0.6);
            }
            const hy = on ? y0 + safe : y0;
            g.fillStyle = '#1c2766';
            g.fillRect(x0, hy, pw, ph * 0.1);
            txt(g, '★ 120', x0 + pw * 0.08, hy + ph * 0.05, 6 * u, '#ffe28a', 'left', F, 900);
            txt(g, '☰', x0 + pw * 0.86, hy + ph * 0.05, 6.5 * u, '#fff', 'center', F, 900);
            g.fillStyle = '#7cc25a';
            rr(g, x0 + pw * 0.1, y0 + ph * 0.3, pw * 0.8, pw * 0.8, 4 * u);
            g.fill();
            // 노치
            g.fillStyle = '#000';
            rr(g, cx - pw * 0.2, y0 - 2 * u, pw * 0.4, safe * 0.7 + 2 * u, safe * 0.35);
            g.fill();
            g.fillStyle = '#333';
            rr(g, cx - pw * 0.18, y0 + ph - safe * 0.32, pw * 0.36, 2 * u, u);
            g.fill();
            g.restore();
            if (!on) {
              g.strokeStyle = '#ff3c50';
              g.lineWidth = 1.6 * u;
              g.beginPath();
              g.arc(cx, y0 + safe * 0.35, pw * 0.3, 0, Math.PI * 2);
              g.stroke();
            }
            pill(g, on ? 'safe-area 켬' : '끔 — 가려짐', cx, cy - ph / 2 - 10 * u, 7 * u, on ? '#2fbf71' : '#ff3c50');
          }
          // ③ dvh
          {
            const cx = cw * 2.5;
            const dvh = Math.floor(t / 3) % 2 === 1;
            const bar = ph * 0.13 * swing(t, 1.3, 1.4);
            phone(g, cx, cy, pw, ph, u);
            const x0 = cx - pw / 2;
            const y0 = cy - ph / 2;
            const boxH = dvh ? ph - bar : ph;
            // 넘친 부분 (화면 밖 유령)
            if (!dvh && bar > 1) {
              g.fillStyle = 'rgba(255,60,80,.35)';
              g.fillRect(x0, y0 + ph, pw, bar);
              g.strokeStyle = '#ff3c50';
              g.setLineDash([3 * u, 2 * u]);
              g.lineWidth = 1.2 * u;
              g.strokeRect(x0, y0 + ph, pw, bar);
              g.setLineDash([]);
            }
            g.save();
            rr(g, x0, y0, pw, ph, 5 * u);
            g.clip();
            g.fillStyle = dvh ? '#d9f7e6' : '#ffe0e4';
            g.fillRect(x0, y0 + bar, pw, boxH);
            g.fillStyle = dvh ? '#2fbf71' : '#ff6fa8';
            const by = y0 + bar + boxH - ph * 0.12;
            rr(g, x0 + pw * 0.15, by, pw * 0.7, ph * 0.08, ph * 0.04);
            g.fill();
            txt(g, '시작', cx, by + ph * 0.04, 6 * u, '#fff', 'center', F, 900);
            // 주소창
            g.fillStyle = '#f2f2f2';
            g.fillRect(x0, y0, pw, bar);
            if (bar > 6 * u) {
              g.fillStyle = '#ccc';
              rr(g, x0 + pw * 0.08, y0 + bar * 0.25, pw * 0.84, bar * 0.5, bar * 0.25);
              g.fill();
            }
            g.restore();
            pill(g, dvh ? 'height: 100dvh' : 'height: 100vh', cx, cy - ph / 2 - 10 * u, 7 * u, dvh ? '#2fbf71' : '#ff3c50');
          }
          for (let i = 0; i < 3; i++) txt(g, labels[i]!, cw * (i + 0.5), Math.min(h * 0.92, cy + ph / 2 + 22 * u), 9 * u, '#fff');
        },
      };
    },
  },

  /* ───────────────────────── i25 ───────────────────────── */
  i25: {
    kind: '2d',
    caption: '디자이너가 만든 움직임(아래 타임라인 열쇠 칸)을 그대로 재생 + Rive 는 누르면 상태가 바뀌어 반응 (눌러 보세요)',
    make() {
      let tapAt = -10;
      let lastT = 0;
      let cv: HTMLCanvasElement | null = null;
      const onTap = (): void => {
        tapAt = lastT;
      };
      return {
        draw(g, w, h, t) {
          lastT = t;
          if (!cv) {
            cv = g.canvas;
            cv.addEventListener('pointerdown', onTap);
            cv.style.cursor = 'pointer';
          }
          const u = scaleOf(w, h);
          bg(g, w, h, '#ffeef6', '#ffd6e8');
          // 자동 누르기 (5초마다)
          const auto = t % 5;
          if (auto > 3.6 && auto - 3.6 < 0.05 && t - tapAt > 1.5) tapAt = t;
          const since = t - tapAt;
          const happy = since >= 0 && since < 1.6;
          const L = 2;
          const p = (t % L) / L;
          const cx = w * 0.5;
          const baseY = h * 0.5;
          const bounce = Math.abs(Math.sin(p * Math.PI * 2)) * 12 * u;
          const squash = 1 + (bounce < 2 * u ? 0.12 : 0) - 0.04 * Math.sin(p * Math.PI * 4);
          const rot = happy ? (since / 0.6) * Math.PI * 2 * (since < 0.6 ? 1 : 0) : Math.sin(p * Math.PI * 2) * 0.12;
          const R = Math.min(w, h) * 0.17;
          // 그림자
          g.fillStyle = 'rgba(160,60,110,.18)';
          g.beginPath();
          g.ellipse(cx, baseY + R * 1.05, R * (1 - bounce / (60 * u)), R * 0.18, 0, 0, Math.PI * 2);
          g.fill();
          g.save();
          g.translate(cx, baseY - bounce + R * 0.9);
          g.scale(squash, 1 / squash);
          g.translate(0, -R * 0.9);
          g.rotate(rot);
          // 별 몸
          g.beginPath();
          for (let i = 0; i < 10; i++) {
            const a = -Math.PI / 2 + (i * Math.PI) / 5;
            const r = i % 2 ? R * 0.55 : R;
            g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          g.closePath();
          g.fillStyle = happy ? '#ffcf3a' : '#ffd95e';
          g.lineJoin = 'round';
          g.lineWidth = R * 0.12;
          g.strokeStyle = '#e89a1a';
          g.stroke();
          g.fill();
          // 얼굴
          const blink = !happy && p > 0.78 && p < 0.84;
          g.strokeStyle = '#5a3200';
          g.fillStyle = '#5a3200';
          g.lineWidth = R * 0.07;
          g.lineCap = 'round';
          for (const s of [-1, 1]) {
            g.beginPath();
            if (happy) g.arc(s * R * 0.2, -R * 0.02, R * 0.08, Math.PI * 1.1, Math.PI * 1.9);
            else if (blink) {
              g.moveTo(s * R * 0.2 - R * 0.06, 0);
              g.lineTo(s * R * 0.2 + R * 0.06, 0);
            } else g.arc(s * R * 0.2, 0, R * 0.06, 0, Math.PI * 2);
            if (happy || blink) g.stroke();
            else g.fill();
          }
          g.beginPath();
          g.arc(0, R * 0.12, happy ? R * 0.14 : R * 0.08, 0.15, Math.PI - 0.15);
          g.stroke();
          g.fillStyle = 'rgba(255,120,150,.5)';
          g.beginPath();
          g.arc(-R * 0.36, R * 0.12, R * 0.07, 0, Math.PI * 2);
          g.arc(R * 0.36, R * 0.12, R * 0.07, 0, Math.PI * 2);
          g.fill();
          g.restore();
          // 하트
          if (happy) {
            for (let i = 0; i < 6; i++) {
              const a = -Math.PI / 2 + (i - 2.5) * 0.4;
              const d = since * 70 * u;
              const x = cx + Math.cos(a) * d;
              const y = baseY - R * 0.4 + Math.sin(a) * d;
              g.globalAlpha = clamp01(1 - since / 1.6);
              txt(g, '♥', x, y, (8 + 3 * (i % 2)) * u, '#ff4f8b', 'center', F, 900);
            }
            g.globalAlpha = 1;
          }
          // 손가락 (자동 누르기 안내)
          if (auto > 2.6 && auto < 4.2) {
            const k = ease((auto - 2.6) / 1);
            const fx = lerp(w * 0.85, cx + R * 0.3, k);
            const fy = lerp(h * 0.75, baseY + R * 0.2, k);
            if (auto > 3.6) {
              g.strokeStyle = `rgba(255,79,139,${1 - (auto - 3.6) / 0.6})`;
              g.lineWidth = 2 * u;
              g.beginPath();
              g.arc(fx, fy, (auto - 3.6) * 40 * u, 0, Math.PI * 2);
              g.stroke();
            }
            g.fillStyle = '#fff';
            g.strokeStyle = '#333';
            g.lineWidth = 1.2 * u;
            g.beginPath();
            g.arc(fx, fy, 5 * u, 0, Math.PI * 2);
            g.fill();
            g.stroke();
          }
          pill(g, happy ? '상태: 기쁨 (누름!)' : '상태: 대기', w * 0.2, 12 * u, 8 * u, happy ? '#ff4f8b' : '#8a6bd8');
          // 타임라인
          const tx = w * 0.12;
          const tw = w * 0.76;
          const ty = h * 0.78;
          const tracks = ['위치', '크기', '눈'];
          const keys = [
            [0, 0.25, 0.5, 0.75, 1],
            [0, 0.5, 1],
            [0.78, 0.84],
          ];
          for (let i = 0; i < 3; i++) {
            const y = ty + i * 8 * u;
            g.fillStyle = 'rgba(120,60,140,.18)';
            g.fillRect(tx, y - 1.5 * u, tw, 3 * u);
            txt(g, tracks[i]!, tx - 4 * u, y, 6 * u, '#7a4a8a', 'right');
            for (const kk of keys[i]!) {
              g.save();
              g.translate(tx + kk * tw, y);
              g.rotate(Math.PI / 4);
              g.fillStyle = Math.abs(kk - p) < 0.04 ? '#ff4f8b' : '#a070c8';
              g.fillRect(-2.5 * u, -2.5 * u, 5 * u, 5 * u);
              g.restore();
            }
          }
          g.fillStyle = '#ff4f8b';
          g.fillRect(tx + p * tw - u, ty - 6 * u, 2 * u, 26 * u);
        },
        dispose() {
          cv?.removeEventListener('pointerdown', onTap);
        },
      };
    },
  },

  /* ───────────────────────── i26 ───────────────────────── */
  i26: {
    kind: '2d',
    caption: '캐릭터 그림을 뼈대에 붙여 각도만 돌리면 손 흔들기 · 걷기가 부드럽게 — 뼈대가 보였다 숨었다 해요',
    make() {
      let showMode = 0; // 0 자동 1 늘 보기 2 숨김
      return {
        draw(g, w, h, t) {
          const u = scaleOf(w, h);
          bg(g, w, h, '#d9f1ff', '#b4e0ff');
          g.fillStyle = '#9fd38a';
          g.fillRect(0, h * 0.86, w, h * 0.14);
          const show = showMode === 1 ? 1 : showMode === 2 ? 0 : swing(t, 1.1, 1.6);
          const k = Math.min(w / 280, h / 175) * 1.0;
          const hx = w * 0.5;
          const hy = h * 0.58 - Math.abs(Math.sin(t * 4)) * 2 * k;
          type B = { x: number; y: number; a: number; l: number };
          const bones: [B, number][] = [];
          const end = (b: B): [number, number] => [b.x + Math.cos(b.a) * b.l, b.y + Math.sin(b.a) * b.l];
          const deg = Math.PI / 180;
          const spine: B = { x: hx, y: hy, a: -90 * deg + Math.sin(t * 2) * 0.05, l: 30 * k };
          const [chx, chy] = end(spine);
          const neck: B = { x: chx, y: chy, a: spine.a + Math.sin(t * 2 + 1) * 0.15, l: 9 * k };
          const [nx, ny] = end(neck);
          const ua: B = { x: chx + 9 * k, y: chy + 4 * k, a: -40 * deg + Math.sin(t * 5) * 0.4, l: 17 * k };
          const fa: B = { x: 0, y: 0, a: ua.a - 50 * deg + Math.sin(t * 5 + 0.7) * 0.6, l: 15 * k };
          [fa.x, fa.y] = end(ua);
          const ul: B = { x: chx - 9 * k, y: chy + 4 * k, a: 100 * deg + Math.sin(t * 2) * 0.2, l: 17 * k };
          const fl: B = { x: 0, y: 0, a: ul.a - 15 * deg, l: 15 * k };
          [fl.x, fl.y] = end(ul);
          const legs: B[] = [];
          for (const s of [-1, 1]) {
            const th: B = { x: hx + s * 6 * k, y: hy, a: 90 * deg + s * Math.sin(t * 4) * 0.35, l: 18 * k };
            const sh: B = { x: 0, y: 0, a: th.a + Math.max(0, -s * Math.sin(t * 4)) * 0.6, l: 17 * k };
            [sh.x, sh.y] = end(th);
            legs.push(th, sh);
          }
          bones.push([spine, 0], [neck, 0], [ua, 1], [fa, 1], [ul, 1], [fl, 1], ...legs.map((b): [B, number] => [b, 2]));
          // 살 (그림)
          g.globalAlpha = 1 - show * 0.6;
          g.lineCap = 'round';
          const limb = (b: B, col: string, wd: number): void => {
            const [ex, ey] = end(b);
            g.strokeStyle = col;
            g.lineWidth = wd;
            g.beginPath();
            g.moveTo(b.x, b.y);
            g.lineTo(ex, ey);
            g.stroke();
          };
          for (const b of legs) limb(b, '#3d5afe', 9 * k);
          for (const s of [-1, 1]) {
            const sh = legs[s < 0 ? 1 : 3]!;
            const [ex, ey] = end(sh);
            g.fillStyle = '#5a3a2a';
            g.beginPath();
            g.ellipse(ex + 3 * k, ey + 2 * k, 6 * k, 3.5 * k, 0, 0, Math.PI * 2);
            g.fill();
          }
          limb(ul, '#ff7a59', 8 * k);
          limb(fl, '#ffd2a8', 7 * k);
          g.save();
          g.translate(hx, hy);
          g.rotate(spine.a + Math.PI / 2);
          g.fillStyle = '#ff7a59';
          rr(g, -12 * k, -34 * k, 24 * k, 38 * k, 9 * k);
          g.fill();
          g.fillStyle = '#ffe28a';
          g.beginPath();
          g.arc(0, -18 * k, 4 * k, 0, Math.PI * 2);
          g.fill();
          g.restore();
          limb(ua, '#ff7a59', 8 * k);
          limb(fa, '#ffd2a8', 7 * k);
          // 머리
          g.save();
          g.translate(nx, ny);
          g.rotate(neck.a + Math.PI / 2);
          g.fillStyle = '#ffd2a8';
          g.beginPath();
          g.arc(0, -11 * k, 15 * k, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#4a2a1a';
          g.beginPath();
          g.arc(0, -14 * k, 15.5 * k, Math.PI * 1.05, Math.PI * 1.95);
          g.fill();
          g.fillStyle = '#2a1a10';
          g.beginPath();
          g.arc(-5 * k, -9 * k, 1.9 * k, 0, Math.PI * 2);
          g.arc(5 * k, -9 * k, 1.9 * k, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = '#2a1a10';
          g.lineWidth = 1.4 * k;
          g.beginPath();
          g.arc(0, -5 * k, 4 * k, 0.2, Math.PI - 0.2);
          g.stroke();
          g.restore();
          g.globalAlpha = 1;
          // 뼈대
          if (show > 0.02) {
            g.globalAlpha = show;
            for (const [b, grp] of bones) {
              const [ex, ey] = end(b);
              const nx2 = -Math.sin(b.a);
              const ny2 = Math.cos(b.a);
              const wd = 3.2 * k;
              const mx = b.x + Math.cos(b.a) * b.l * 0.22;
              const my = b.y + Math.sin(b.a) * b.l * 0.22;
              g.fillStyle = ['#00c2ff', '#ff4fa0', '#ffb300'][grp]!;
              g.strokeStyle = '#fff';
              g.lineWidth = 1 * k;
              g.beginPath();
              g.moveTo(b.x, b.y);
              g.lineTo(mx + nx2 * wd, my + ny2 * wd);
              g.lineTo(ex, ey);
              g.lineTo(mx - nx2 * wd, my - ny2 * wd);
              g.closePath();
              g.fill();
              g.stroke();
              g.fillStyle = '#fff';
              g.beginPath();
              g.arc(b.x, b.y, 2.2 * k, 0, Math.PI * 2);
              g.fill();
            }
            g.globalAlpha = 1;
          }
          pill(g, show > 0.5 ? '뼈대 보기' : '그림만', w * 0.5, 12 * u, 8.5 * u, show > 0.5 ? '#00a8e0' : 'rgba(30,60,110,.6)');
        },
        controls: [{ type: 'range', label: '뼈대 (0 자동 · 1 보기 · 2 숨김)', min: 0, max: 2, step: 1, value: 0, on: (v) => (showMode = v) }] as Control[],
      };
    },
  },

  /* ───────────────────────── i27 ───────────────────────── */
  i27: {
    kind: '2d',
    caption: '같은 수박 게임 화면에 효과만 얹기 — 원본 · 빛남(glow) · 도트화(pixelate) · 굴곡(barrel, 옛 TV)',
    make() {
      let scene: HTMLCanvasElement | null = null;
      let tiny: HTMLCanvasElement | null = null;
      let px = 0;
      const drawScene = (g: G, w: number, h: number, t: number): void => {
        const gr = g.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, '#ffe9b8');
        gr.addColorStop(1, '#ffbf8a');
        g.fillStyle = gr;
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#c98a4a';
        g.fillRect(0, h * 0.86, w, h * 0.14);
        const fr: [number, number, number, string][] = [
          [0.28, 0.66, 0.16, '#ff5a4a'],
          [0.56, 0.6, 0.22, '#5fcf4a'],
          [0.8, 0.7, 0.12, '#ffa62b'],
          [0.42, 0.3, 0.1, '#b26bff'],
        ];
        for (const [x, y, r, c] of fr) {
          const yy = (y + Math.sin(t * 2 + x * 9) * 0.03) * h;
          const R = r * h;
          g.fillStyle = c;
          g.beginPath();
          g.arc(x * w, yy, R, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = 'rgba(255,255,255,.6)';
          g.beginPath();
          g.ellipse(x * w - R * 0.35, yy - R * 0.4, R * 0.25, R * 0.14, -0.6, 0, Math.PI * 2);
          g.fill();
        }
        g.font = `${h * 0.13}px ${TF}`;
        g.textAlign = 'left';
        g.textBaseline = 'top';
        g.fillStyle = '#7a3a00';
        g.fillText('점수 128', w * 0.05, h * 0.05);
      };
      return {
        draw(g, w, h, t) {
          const u = scaleOf(w, h);
          const qw = Math.max(2, Math.floor(w / 2 - 3));
          const qh = Math.max(2, Math.floor(h / 2 - 3));
          if (!scene || scene.width !== qw || scene.height !== qh) scene = mkCanvas(qw, qh);
          const sg = ctx(scene);
          drawScene(sg, qw, qh, t);
          g.fillStyle = '#0b0d18';
          g.fillRect(0, 0, w, h);
          const P = [
            [2, 2],
            [w / 2 + 1, 2],
            [2, h / 2 + 1],
            [w / 2 + 1, h / 2 + 1],
          ] as const;
          // 원본
          g.drawImage(scene, P[0][0], P[0][1]);
          // 빛남
          {
            const [x, y] = P[1];
            g.drawImage(scene, x, y);
            g.save();
            g.beginPath();
            g.rect(x, y, qw, qh);
            g.clip();
            g.globalCompositeOperation = 'lighter';
            g.globalAlpha = 0.45 + 0.25 * Math.sin(t * 2.5);
            g.filter = `blur(${6 * u}px) brightness(1.1)`;
            g.drawImage(scene, x, y);
            g.filter = 'none';
            g.restore();
          }
          // 도트화
          {
            const [x, y] = P[2];
            px = Math.round(3 + 5 * (0.5 + 0.5 * Math.sin(t * 1.2))) * Math.max(1, u * 0.8);
            const tw = Math.max(2, Math.floor(qw / px));
            const th = Math.max(2, Math.floor(qh / px));
            if (!tiny || tiny.width !== tw || tiny.height !== th) tiny = mkCanvas(tw, th);
            const tg = ctx(tiny);
            tg.imageSmoothingEnabled = true;
            tg.drawImage(scene, 0, 0, tw, th);
            g.imageSmoothingEnabled = false;
            g.drawImage(tiny, x, y, qw, qh);
            g.imageSmoothingEnabled = true;
          }
          // 굴곡
          {
            const [x, y] = P[3];
            g.save();
            g.beginPath();
            g.rect(x, y, qw, qh);
            g.clip();
            g.fillStyle = '#111';
            g.fillRect(x, y, qw, qh);
            const amt = 0.12 + 0.06 * Math.sin(t * 1.5);
            const step = 2;
            for (let sy = 0; sy < qh; sy += step) {
              const v = (sy / qh) * 2 - 1;
              const sc = 1 - amt * v * v;
              const dw = qw * sc;
              const dy = y + qh / 2 + v * (qh / 2) * (1 - amt * 0.5 * (1 - v * v));
              g.drawImage(scene, 0, sy, qw, step, x + (qw - dw) / 2, dy, dw, step + 0.6);
            }
            g.fillStyle = 'rgba(0,0,0,.18)';
            for (let sy = 0; sy < qh; sy += 3) g.fillRect(x, y + sy, qw, 1);
            const vg = g.createRadialGradient(x + qw / 2, y + qh / 2, qh * 0.3, x + qw / 2, y + qh / 2, qw * 0.65);
            vg.addColorStop(0, 'rgba(0,0,0,0)');
            vg.addColorStop(1, 'rgba(0,0,0,.7)');
            g.fillStyle = vg;
            g.fillRect(x, y, qw, qh);
            g.restore();
          }
          const names = ['원본', '빛남 glow', '도트화 pixelate', '굴곡 barrel'];
          P.forEach(([x, y], i) => pill(g, names[i]!, x + qw / 2, y + qh - 10 * u, 7 * u, i ? '#ff6fa8' : 'rgba(0,0,0,.55)'));
        },
      };
    },
  },

  /* ───────────────────────── i28 ───────────────────────── */
  i28: {
    kind: '2d',
    caption: '왼쪽 반듯한 도형 · 오른쪽 같은 도형을 연필로 쓱쓱(rough) — 선이 두 번 겹치고 빗금으로 칠해져요',
    make() {
      let rough = 2.2;
      let boil = true;
      const shapes = (g: G, ox: number, hw: number, h: number, t: number, u: number, r: (() => number) | null): void => {
        const k = Math.min(hw / 140, h / 175);
        const b = Math.sin(t * 1.2) * 2 * k;
        // 직각삼각형 3·4·5
        const tx = ox + hw * 0.1;
        const ty = h * 0.84;
        const A: [number, number] = [tx, ty];
        const B: [number, number] = [tx + 4 * 14 * k, ty];
        const C: [number, number] = [tx, ty - 3 * 14 * k + b];
        const tri = (): void => {
          g.beginPath();
          g.moveTo(...A);
          g.lineTo(...B);
          g.lineTo(...C);
          g.closePath();
        };
        // 원
        const cx = ox + hw * 0.72;
        const cy = h * 0.35 - b;
        const cr = 20 * k;
        // 네모
        const rx = ox + hw * 0.56;
        const ry = h * 0.6 + b;
        const rw = 44 * k;
        const rh = 30 * k;
        if (!r) {
          g.fillStyle = '#ffb3c7';
          tri();
          g.fill();
          g.strokeStyle = '#334';
          g.lineWidth = 2 * u;
          g.stroke();
          g.fillStyle = '#ffe07a';
          g.beginPath();
          g.arc(cx, cy, cr, 0, Math.PI * 2);
          g.fill();
          g.stroke();
          g.fillStyle = '#9fd6ff';
          g.fillRect(rx, ry, rw, rh);
          g.strokeRect(rx, ry, rw, rh);
        } else {
          const kk = rough * u;
          g.lineWidth = 1.1 * u;
          g.strokeStyle = '#ff5c8a';
          hachure(g, tri, tx, ty - 3 * 14 * k, 4 * 14 * k, 3 * 14 * k, 5 * u, r, kk);
          g.strokeStyle = '#e8a800';
          hachure(
            g,
            () => {
              g.beginPath();
              g.arc(cx, cy, cr, 0, Math.PI * 2);
            },
            cx - cr,
            cy - cr,
            cr * 2,
            cr * 2,
            4.5 * u,
            r,
            kk,
          );
          g.strokeStyle = '#3a9be0';
          hachure(
            g,
            () => {
              g.beginPath();
              g.rect(rx, ry, rw, rh);
            },
            rx,
            ry,
            rw,
            rh,
            4.5 * u,
            r,
            kk,
          );
          g.strokeStyle = '#333';
          g.lineWidth = 1.5 * u;
          roughLine(g, A[0], A[1], B[0], B[1], r, kk);
          roughLine(g, B[0], B[1], C[0], C[1], r, kk);
          roughLine(g, C[0], C[1], A[0], A[1], r, kk);
          roughEllipse(g, cx, cy, cr, cr, r, kk);
          roughLine(g, rx, ry, rx + rw, ry, r, kk);
          roughLine(g, rx + rw, ry, rx + rw, ry + rh, r, kk);
          roughLine(g, rx + rw, ry + rh, rx, ry + rh, r, kk);
          roughLine(g, rx, ry + rh, rx, ry, r, kk);
        }
        const font = r ? '"Gowun Dodum", "Comic Sans MS", cursive' : F;
        txt(g, '4', (A[0] + B[0]) / 2, ty + 7 * u, 8 * u, '#334', 'center', font, 700);
        txt(g, '3', tx - 6 * u, (A[1] + C[1]) / 2, 8 * u, '#334', 'center', font, 700);
        txt(g, '5', (B[0] + C[0]) / 2 + 6 * u, (B[1] + C[1]) / 2 - 5 * u, 8 * u, '#334', 'center', font, 700);
      };
      return {
        draw(g, w, h, t) {
          const u = scaleOf(w, h);
          g.fillStyle = '#ffffff';
          g.fillRect(0, 0, w / 2, h);
          g.fillStyle = '#fbf6e9';
          g.fillRect(w / 2, 0, w / 2, h);
          g.strokeStyle = 'rgba(120,160,210,.25)';
          g.lineWidth = 1;
          g.beginPath();
          for (let y = 12 * u; y < h; y += 12 * u) {
            g.moveTo(w / 2, y);
            g.lineTo(w, y);
          }
          g.stroke();
          g.save();
          g.beginPath();
          g.rect(0, 0, w / 2, h);
          g.clip();
          shapes(g, 0, w / 2, h, t, u, null);
          g.restore();
          g.save();
          g.beginPath();
          g.rect(w / 2, 0, w / 2, h);
          g.clip();
          shapes(g, w / 2, w / 2, h, t, u, rng(boil ? Math.floor(t * 6) + 1 : 1));
          g.restore();
          g.fillStyle = 'rgba(0,0,0,.25)';
          g.fillRect(w / 2 - 0.75, 0, 1.5, h);
          pill(g, '반듯하게', w * 0.25, 12 * u, 8.5 * u, 'rgba(40,50,90,.75)');
          pill(g, '손그림', w * 0.75, 12 * u, 8.5 * u, '#ff6fa8');
        },
        controls: [
          { type: 'range', label: '삐뚤삐뚤 정도', min: 0, max: 6, step: 0.2, value: 2.2, on: (v) => (rough = v) },
          { type: 'toggle', label: '선 꿈틀대기 (다시 그리기)', value: true, on: (v) => (boil = v) },
        ] as Control[],
      };
    },
  },

  /* ───────────────────────── i29 ───────────────────────── */
  i29: {
    kind: '2d',
    caption: '왼쪽 그냥 원 겹치기 · 오른쪽 메타볼(거리 장의 합) — 가까워지면 물방울처럼 녹아 붙고 멀어지면 쭉 늘어나 떨어져요',
    make() {
      let field: HTMLCanvasElement | null = null;
      let img: ImageData | null = null;
      let thr = 1;
      const balls = (t: number): [number, number, number][] => {
        const out: [number, number, number][] = [];
        for (let i = 0; i < 5; i++) {
          const a = t * 0.55 * (i % 2 ? 1 : -1) + i * 1.26;
          const rr2 = 0.18 + 0.12 * Math.sin(t * 0.8 + i * 1.7);
          out.push([0.5 + Math.cos(a) * rr2, 0.5 + Math.sin(a) * rr2 * 1.1, [0.13, 0.1, 0.12, 0.085, 0.11][i]!]);
        }
        return out;
      };
      return {
        draw(g, w, h, t) {
          const u = scaleOf(w, h);
          const hw = w / 2;
          const m = Math.min(hw, h);
          const B = balls(t);
          for (let s = 0; s < 2; s++) {
            const ox = s * hw;
            const gr = g.createLinearGradient(0, 0, 0, h);
            gr.addColorStop(0, '#1a2a5c');
            gr.addColorStop(1, '#0b1230');
            g.fillStyle = gr;
            g.fillRect(ox, 0, hw, h);
          }
          // 왼쪽: 그냥 원
          for (const [x, y, r] of B) {
            g.fillStyle = 'rgba(60,220,160,.85)';
            g.strokeStyle = '#0d6a4a';
            g.lineWidth = 1.5 * u;
            g.beginPath();
            g.arc(x * hw, y * h, r * m, 0, Math.PI * 2);
            g.fill();
            g.stroke();
          }
          // 오른쪽: 메타볼
          const gw = 100;
          const gh = Math.max(10, Math.round((gw * h) / hw));
          if (!field || field.width !== gw || field.height !== gh) {
            field = mkCanvas(gw, gh);
            img = ctx(field).createImageData(gw, gh);
          }
          const d = img!.data;
          const sx = hw / gw;
          const sy = h / gh;
          const P = B.map(([x, y, r]) => [x * hw, y * h, (r * m) ** 2] as const);
          for (let j = 0; j < gh; j++)
            for (let i = 0; i < gw; i++) {
              const px = (i + 0.5) * sx;
              const py = (j + 0.5) * sy;
              let f = 0;
              for (const [bx, by, r2] of P) f += r2 / ((px - bx) ** 2 + (py - by) ** 2 + 1e-3);
              const a = clamp01((f - thr * 0.9) / (thr * 0.2));
              const c = clamp01((f - thr) / 2.2);
              const rim = clamp01(1 - Math.abs(f - thr * 1.15) / 0.25) * 0.35;
              const o = (j * gw + i) * 4;
              d[o] = 30 + 120 * c + 200 * rim;
              d[o + 1] = 170 + 75 * c + 80 * rim;
              d[o + 2] = 140 + 90 * c + 80 * rim;
              d[o + 3] = a * 255;
            }
          ctx(field).putImageData(img!, 0, 0);
          g.save();
          g.beginPath();
          g.rect(hw, 0, hw, h);
          g.clip();
          g.imageSmoothingEnabled = true;
          g.drawImage(field, hw, 0, hw, h);
          for (const [x, y, r] of B) {
            g.fillStyle = 'rgba(255,255,255,.55)';
            g.beginPath();
            g.ellipse(hw + x * hw - r * m * 0.35, y * h - r * m * 0.4, r * m * 0.22, r * m * 0.12, -0.6, 0, Math.PI * 2);
            g.fill();
          }
          g.restore();
          splitLabels(g, w, h, u, '원 겹치기', '메타볼');
        },
        controls: [{ type: 'range', label: '경계 값 (작을수록 더 잘 붙음)', min: 0.5, max: 2, step: 0.05, value: 1, on: (v) => (thr = v) }] as Control[],
      };
    },
  },
};

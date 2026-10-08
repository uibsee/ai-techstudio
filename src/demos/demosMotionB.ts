import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Control, DemoMap } from './types';

/**
 * 모션 그래픽 견본 (i109 ~ i127).
 *  - 캔버스 2D 견본은 카드(280×175)를 기준으로 u = min(w/280, h/175) 배로 키워 그린다.
 *  - DOM 견본은 상자 하나(.mb-…)에 <style> 을 함께 넣고, 글자 크기는 cqmin(상자 크기) 으로.
 *  - 모든 움직임은 주기 함수 · 고리 시간표라 끝없이 이어진다. 소리는 조절의 단추로만 (자동 재생 없음).
 */

type G = CanvasRenderingContext2D;
const F = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
const TF = '"Black Han Sans", "Pretendard Variable", sans-serif';
const TAU = Math.PI * 2;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (x: number): number => {
  const v = clamp01(x);
  return v * v * (3 - 2 * v);
};
const easeIO = (x: number): number => {
  const v = clamp01(x);
  return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
};
const easeOutBack = (x: number): number => {
  const v = clamp01(x);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2);
};
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const fract = (x: number): number => x - Math.floor(x);

function rng(seed: number): () => number {
  let s = Math.abs(Math.floor(seed * 9301 + 49297)) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
const scaleOf = (w: number, h: number): number => Math.min(w / 280, h / 175);
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
function pill(g: G, s: string, x: number, y: number, size: number, fill: string, fg = '#fff', align: 'center' | 'left' | 'right' = 'center'): void {
  g.font = `800 ${size}px ${F}`;
  const tw = g.measureText(s).width;
  const ph = size * 1.65;
  const pw = tw + size * 1.3;
  const x0 = align === 'center' ? x - pw / 2 : align === 'left' ? x : x - pw;
  rr(g, x0, y - ph / 2, pw, ph, ph / 2);
  g.fillStyle = fill;
  g.fill();
  txt(g, s, x0 + pw / 2, y + size * 0.04, size, fg, 'center', F, 800);
}
/** 화면 반씩 비교: 가운데 선 + 위 이름표 */
function splitLabels(g: G, w: number, h: number, u: number, left: string, right: string): void {
  g.fillStyle = 'rgba(255,255,255,.6)';
  g.fillRect(w / 2 - 1, 0, 2, h);
  pill(g, left, w * 0.25, 13 * u, 8.5 * u, 'rgba(10,14,40,.62)');
  pill(g, right, w * 0.75, 13 * u, 8.5 * u, 'rgba(255,90,150,.9)');
}
function star(g: G, x: number, y: number, r: number, rot = 0, n = 5, inner = 0.48): void {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + rot + (i * Math.PI) / n;
    const rad = i % 2 ? r * inner : r;
    if (i) g.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    else g.moveTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  g.closePath();
}
function domRoot(box: HTMLElement, cls: string, css: string, html: string): HTMLElement {
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
let uid = 0;

/** 짧은 소리 — 단추로 켰을 때만 (AudioContext 는 그때 만든다) */
class Blip {
  ctx: AudioContext | null = null;
  on = false;
  toggle(): void {
    this.on = !this.on;
    if (this.on && !this.ctx) this.ctx = new AudioContext();
    if (this.on) void this.ctx?.resume();
  }
  tone(freq: number, dur = 0.12, type: OscillatorType = 'triangle', vol = 0.25, slide = 0): void {
    if (!this.on || !this.ctx) return;
    const c = this.ctx;
    const o = c.createOscillator();
    const gn = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), c.currentTime + dur);
    gn.gain.setValueAtTime(0.0001, c.currentTime);
    gn.gain.exponentialRampToValueAtTime(vol, c.currentTime + 0.008);
    gn.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(gn).connect(c.destination);
    o.start();
    o.stop(c.currentTime + dur + 0.02);
  }
  noise(dur = 0.15, vol = 0.2, hp = 800): void {
    if (!this.on || !this.ctx) return;
    const c = this.ctx;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = c.createBufferSource();
    s.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const gn = c.createGain();
    gn.gain.value = vol;
    s.connect(f).connect(gn).connect(c.destination);
    s.start();
  }
  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
  }
}

/* ───────── i115 글자 모양 따기 (마칭 스퀘어) ───────── */
function traceGlyph(ch: string, font: string): THREE.Shape[] {
  const S = 168;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  c.fillStyle = '#fff';
  c.font = `${S * 0.8}px ${font}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(ch, S / 2, S / 2 + S * 0.05);
  const data = c.getImageData(0, 0, S, S).data;
  const step = 2;
  const n = S / step + 2;
  const f = (x: number, y: number): number => {
    if (x <= 0 || y <= 0 || x >= n - 1 || y >= n - 1) return 0;
    return data[(((y - 1) * step) * S + (x - 1) * step) * 4 + 3]! / 255;
  };
  const pt = new Map<string, [number, number]>();
  const adj = new Map<string, string[]>();
  const link = (a: string, b: string): void => {
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
  };
  const hk = (x: number, y: number): string => {
    const k = `h${x},${y}`;
    if (!pt.has(k)) {
      const a = f(x, y);
      const b = f(x + 1, y);
      pt.set(k, [x + (0.5 - a) / (b - a || 1e-6), y]);
    }
    return k;
  };
  const vk = (x: number, y: number): string => {
    const k = `v${x},${y}`;
    if (!pt.has(k)) {
      const a = f(x, y);
      const b = f(x, y + 1);
      pt.set(k, [x, y + (0.5 - a) / (b - a || 1e-6)]);
    }
    return k;
  };
  for (let y = 0; y < n - 1; y++)
    for (let x = 0; x < n - 1; x++) {
      const A = f(x, y) > 0.5;
      const B = f(x + 1, y) > 0.5;
      const C = f(x + 1, y + 1) > 0.5;
      const D = f(x, y + 1) > 0.5;
      const e: string[] = [];
      if (A !== B) e.push(hk(x, y));
      if (B !== C) e.push(vk(x + 1, y));
      if (D !== C) e.push(hk(x, y + 1));
      if (A !== D) e.push(vk(x, y));
      if (e.length === 2) link(e[0]!, e[1]!);
      else if (e.length === 4) {
        link(e[0]!, e[3]!);
        link(e[1]!, e[2]!);
      }
    }
  const seen = new Set<string>();
  const loops: [number, number][][] = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const loop: [number, number][] = [];
    let prev = '';
    let cur = start;
    for (let guard = 0; guard < 100000; guard++) {
      seen.add(cur);
      const p = pt.get(cur)!;
      const last = loop[loop.length - 1];
      if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.9) loop.push(p);
      const nb = adj.get(cur)!;
      const nx = nb[0] === prev ? nb[1] : nb[0];
      if (!nx || nx === start) break;
      prev = cur;
      cur = nx;
    }
    if (loop.length > 4) loops.push(loop.map(([x, y]) => [((x - 1) * step) / S - 0.5, -(((y - 1) * step) / S - 0.5)]));
  }
  const area = (l: [number, number][]): number => {
    let s = 0;
    for (let i = 0; i < l.length; i++) {
      const a = l[i]!;
      const b = l[(i + 1) % l.length]!;
      s += a[0] * b[1] - b[0] * a[1];
    }
    return s / 2;
  };
  const inside = (p: [number, number], l: [number, number][]): boolean => {
    let ins = false;
    for (let i = 0, j = l.length - 1; i < l.length; j = i++) {
      const a = l[i]!;
      const b = l[j]!;
      if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) ins = !ins;
    }
    return ins;
  };
  const L = loops.map((l) => ({ l, a: Math.abs(area(l)) })).filter((o) => o.a > 2e-4);
  L.sort((a, b) => b.a - a.a);
  const depth = L.map((o, i) => L.slice(0, i).filter((p) => inside(o.l[0]!, p.l)).length);
  const shapes = new Map<number, THREE.Shape>();
  L.forEach((o, i) => {
    const v = o.l.map(([x, y]) => new THREE.Vector2(x, y));
    if (depth[i]! % 2 === 0) shapes.set(i, new THREE.Shape(v));
    else {
      let best = -1;
      for (let j = i - 1; j >= 0; j--)
        if (depth[j]! % 2 === 0 && inside(o.l[0]!, L[j]!.l)) {
          best = j;
          break;
        }
      if (best >= 0) shapes.get(best)?.holes.push(new THREE.Path(v));
    }
  });
  return [...shapes.values()];
}

/* ───────── i122 보로노이: 사각형을 반평면으로 자르기 ───────── */
function clipHalf(poly: [number, number][], ax: number, ay: number, bx: number, by: number): [number, number][] {
  // a 에 더 가까운 쪽만 남김
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const nx = bx - ax;
  const ny = by - ay;
  const side = (p: [number, number]): number => (p[0] - mx) * nx + (p[1] - my) * ny;
  const out: [number, number][] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const qd = poly[(i + 1) % poly.length]!;
    const sp = side(p);
    const sq = side(qd);
    if (sp <= 0) out.push(p);
    if (sp <= 0 !== sq <= 0) {
      const k = sp / (sp - sq);
      out.push([p[0] + (qd[0] - p[0]) * k, p[1] + (qd[1] - p[1]) * k]);
    }
  }
  return out;
}

export const DEMOS: DemoMap = {
  /* ───────────────────────── i109 잡음 일렁임 ───────────────────────── */
  i109: {
    kind: 'dom',
    caption: '왼쪽 그대로 · 오른쪽 잡음 지도로 픽셀을 밀어냄 — 글자와 물결이 열기처럼 일렁여요',
    make(box) {
      const id = `mbw${++uid}`;
      const scene = (ox: number): string => `
        <g transform="translate(${ox} 0)">
          <rect width="160" height="200" fill="url(#${id}sky)"/>
          <circle cx="118" cy="46" r="20" fill="#ffe27a"/><circle cx="118" cy="46" r="28" fill="#ffe27a" opacity=".25"/>
          ${[0, 1, 2, 3, 4, 5, 6].map((i) => `<line x1="${20 + i * 20}" y1="20" x2="${20 + i * 20}" y2="118" stroke="#fff" stroke-opacity=".14" stroke-width="1"/>`).join('')}
          ${[0, 1, 2, 3, 4].map((i) => `<line x1="0" y1="${30 + i * 20}" x2="160" y2="${30 + i * 20}" stroke="#fff" stroke-opacity=".14" stroke-width="1"/>`).join('')}
          <text x="80" y="106" text-anchor="middle" font-size="64" font-family='${TF}' fill="#ff7ab6" stroke="#fff" stroke-width="3" paint-order="stroke">π</text>
          <rect y="120" width="160" height="80" fill="url(#${id}sea)"/>
          ${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${(i * 37) % 120 + 8}" y="${130 + i * 11}" width="${40 - i * 3}" height="3" rx="1.5" fill="#bff3ff" opacity="${0.75 - i * 0.08}"/>`).join('')}
          <text x="80" y="176" text-anchor="middle" font-size="22" font-family='${TF}' fill="#ffd23f" opacity=".85">3.14</text>
        </g>`;
      const root = domRoot(
        box,
        'mb-warp',
        `.mb-warp{background:#16205a}
         .mb-warp svg{width:100%;height:100%;display:block}
         .mb-warp .lb{position:absolute;top:4cqmin;padding:.5em 1em;border-radius:99px;font-weight:800;font-size:max(9px,4.6cqmin);background:rgba(10,14,40,.62)}
         .mb-warp .lb.r{background:rgba(255,90,150,.9)}`,
        `<svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id="${id}sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b2d8f"/><stop offset="1" stop-color="#ff8fb4"/></linearGradient>
            <linearGradient id="${id}sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f8fd8"/><stop offset="1" stop-color="#173d8a"/></linearGradient>
            <filter id="${id}f" x="-10%" y="-10%" width="120%" height="120%">
              <feTurbulence class="tb" type="fractalNoise" baseFrequency="0.02 0.06" numOctaves="2" seed="7" result="n"/>
              <feDisplacementMap class="dm" in="SourceGraphic" in2="n" scale="14" xChannelSelector="R" yChannelSelector="G"/>
            </filter>
            <clipPath id="${id}L"><rect width="160" height="200"/></clipPath>
            <clipPath id="${id}R"><rect x="160" width="160" height="200"/></clipPath>
          </defs>
          <g clip-path="url(#${id}L)">${scene(0)}</g>
          <g clip-path="url(#${id}R)"><g filter="url(#${id}f)">${scene(160)}</g></g>
          <rect x="159" width="2" height="200" fill="#fff" opacity=".7"/>
        </svg>
        <div class="lb" style="left:25%;transform:translateX(-50%)">그대로</div>
        <div class="lb r" style="left:75%;transform:translateX(-50%)">잡음 일렁임</div>`,
      );
      const tb = q<SVGElement>(root, '.tb');
      const dm = q<SVGElement>(root, '.dm');
      let power = 14;
      let size = 1;
      return {
        update(t) {
          const fx = (0.016 + 0.005 * Math.sin(t * 0.9)) * size;
          const fy = (0.055 + 0.018 * Math.sin(t * 1.3 + 1)) * size;
          tb.setAttribute('baseFrequency', `${fx.toFixed(4)} ${fy.toFixed(4)}`);
          dm.setAttribute('scale', (power * (0.75 + 0.25 * Math.sin(t * 2.1))).toFixed(2));
        },
        controls: [
          { type: 'range', label: '밀어내는 세기', min: 0, max: 40, step: 1, value: 14, on: (v) => (power = v) },
          { type: 'range', label: '물결 촘촘함', min: 0.4, max: 3, step: 0.1, value: 1, on: (v) => (size = v) },
        ] as Control[],
      };
    },
  },

  /* ───────────────────────── i110 오로라 그라디언트 ───────────────────────── */
  i110: {
    kind: '2d',
    caption: '왼쪽은 속 구조(색 원 6개) · 오른쪽은 그 원을 흐리게 섞은 결과 — 천천히 흐르는 오로라 배경',
    make() {
      const COL = ['#ff6fb5', '#8b5cff', '#3fd0ff', '#44f0a8', '#ffd166', '#ff8a5b'];
      const FR = [
        [1, 2],
        [2, 1],
        [1, 1],
        [3, 2],
        [2, 3],
        [1, 3],
      ];
      let speed = 1;
      let soft = 1;
      let ph = 0;
      const blobs = (p: number, cw: number, h: number): { x: number; y: number; r: number; c: string }[] =>
        COL.map((c, i) => {
          const [a, b] = FR[i]!;
          return {
            x: cw * (0.5 + 0.36 * Math.sin(TAU * p * a! + i * 1.7)),
            y: h * (0.5 + 0.34 * Math.cos(TAU * p * b! + i * 2.3)),
            r: Math.max(cw, h) * (0.32 + 0.07 * Math.sin(TAU * p * 2 + i)),
            c,
          };
        });
      return {
        draw(g, w, h, _t, dt) {
          const u = scaleOf(w, h);
          ph += (dt * speed) / 24;
          const p = fract(ph);
          const hw = w / 2;
          // 왼쪽: 속 구조
          g.save();
          g.beginPath();
          g.rect(0, 0, hw, h);
          g.clip();
          g.fillStyle = '#17123a';
          g.fillRect(0, 0, hw, h);
          for (const b of blobs(p, hw, h)) {
            g.beginPath();
            g.arc(b.x, b.y, b.r * 0.55, 0, TAU);
            g.fillStyle = b.c + '88';
            g.fill();
            g.lineWidth = 2 * u;
            g.strokeStyle = b.c;
            g.stroke();
            g.fillStyle = '#fff';
            g.beginPath();
            g.arc(b.x, b.y, 2.5 * u, 0, TAU);
            g.fill();
          }
          g.restore();
          // 오른쪽: 흐리게 섞기
          g.save();
          g.beginPath();
          g.rect(hw, 0, hw, h);
          g.clip();
          g.translate(hw, 0);
          g.fillStyle = '#1a1440';
          g.fillRect(0, 0, hw, h);
          g.globalCompositeOperation = 'screen';
          for (const b of blobs(p, hw, h)) {
            const R = b.r * (0.55 + 0.6 * soft);
            const gr = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, R);
            gr.addColorStop(0, b.c + 'ee');
            gr.addColorStop(0.45 / (0.4 + soft * 0.6), b.c + '77');
            gr.addColorStop(1, b.c + '00');
            g.fillStyle = gr;
            g.fillRect(0, 0, hw, h);
          }
          g.globalCompositeOperation = 'source-over';
          // 결과 화면처럼 글씨 · 별
          const cx = hw / 2;
          txt(g, '참 잘했어요!', cx, h * 0.5, 17 * u, '#fff', 'center', TF, 400);
          for (let i = 0; i < 3; i++) {
            const bob = Math.sin(TAU * p * 3 + i) * 2 * u;
            star(g, cx + (i - 1) * 20 * u, h * 0.66 + bob, 8 * u);
            g.fillStyle = '#ffe27a';
            g.fill();
            g.lineWidth = 1.5 * u;
            g.strokeStyle = '#fff';
            g.stroke();
          }
          g.restore();
          splitLabels(g, w, h, u, '속: 색 원 6개', '흐리게 섞기');
        },
        controls: [
          { type: 'range', label: '흐르는 빠르기', min: 0, max: 4, step: 0.1, value: 1, on: (v) => (speed = v) },
          { type: 'range', label: '부드러움', min: 0, max: 1.5, step: 0.05, value: 1, on: (v) => (soft = v) },
        ] as Control[],
      };
    },
  },

  /* ───────────────────────── i111 렌즈 플레어 ───────────────────────── */
  i111: {
    kind: '2d',
    caption: '별 빛에서 화면 가운데를 지나는 줄 위에 둥근 고스트 · 가로 빛줄 · 가장자리 주황 빛 새기 (켬 / 끔 번갈아)',
    make() {
      const R = rng(11);
      const STARS = Array.from({ length: 70 }, () => [R(), R(), R()] as const);
      let force: boolean | null = null;
      let strength = 1;
      return {
        draw(g, w, h, t) {
          const u = scaleOf(w, h);
          bg(g, w, h, '#0d1440', '#2a1450');
          for (const [x, y, s] of STARS) {
            g.fillStyle = `rgba(255,255,255,${0.3 + 0.5 * Math.abs(Math.sin(t * 1.5 + s * 20))})`;
            g.fillRect(x * w, y * h * 0.8, 1.4 * u * s + 0.4, 1.4 * u * s + 0.4);
          }
          // 언덕 · 홈런 공원 느낌
          g.fillStyle = '#132a3c';
          g.beginPath();
          g.moveTo(0, h);
          for (let x = 0; x <= w; x += 8) g.lineTo(x, h * 0.84 - Math.sin(x / w * 5 + 1) * 8 * u);
          g.lineTo(w, h);
          g.fill();
          const P = 8;
          const p = fract(t / P);
          const on = force ?? (p < 0.62);
          const a = TAU * p;
          const L = { x: w * (0.5 + 0.38 * Math.cos(a)), y: h * (0.42 + 0.26 * Math.sin(a * 2) * 0.6 - 0.12 * Math.sin(a)) };
          const C = { x: w / 2, y: h / 2 };
          // 별 (보상)
          g.save();
          g.translate(L.x, L.y);
          g.rotate(t * 0.8);
          star(g, 0, 0, 11 * u);
          g.fillStyle = '#ffe27a';
          g.fill();
          g.restore();
          if (on) {
            const k = strength;
            g.save();
            g.globalCompositeOperation = 'lighter';
            // 큰 빛무리
            let gr = g.createRadialGradient(L.x, L.y, 0, L.x, L.y, 60 * u);
            gr.addColorStop(0, `rgba(255,250,220,${0.9 * k})`);
            gr.addColorStop(0.25, `rgba(255,200,120,${0.35 * k})`);
            gr.addColorStop(1, 'rgba(255,120,60,0)');
            g.fillStyle = gr;
            g.fillRect(L.x - 60 * u, L.y - 60 * u, 120 * u, 120 * u);
            // 가로 빛줄 (아나모픽)
            gr = g.createLinearGradient(L.x - w * 0.6, 0, L.x + w * 0.6, 0);
            gr.addColorStop(0, 'rgba(120,180,255,0)');
            gr.addColorStop(0.5, `rgba(170,220,255,${0.75 * k})`);
            gr.addColorStop(1, 'rgba(120,180,255,0)');
            g.fillStyle = gr;
            g.fillRect(L.x - w * 0.6, L.y - 1.2 * u, w * 1.2, 2.4 * u);
            // 십자 빛살
            for (let i = 0; i < 4; i++) {
              g.save();
              g.translate(L.x, L.y);
              g.rotate((i * Math.PI) / 4 + t * 0.2);
              gr = g.createLinearGradient(-40 * u, 0, 40 * u, 0);
              gr.addColorStop(0, 'rgba(255,255,255,0)');
              gr.addColorStop(0.5, `rgba(255,255,240,${0.5 * k})`);
              gr.addColorStop(1, 'rgba(255,255,255,0)');
              g.fillStyle = gr;
              g.fillRect(-40 * u, -0.8 * u, 80 * u, 1.6 * u);
              g.restore();
            }
            // 고스트: L 에서 가운데를 지나 반대편으로
            const GH: [number, number, string, number][] = [
              [0.35, 7, '120,255,200', 0.35],
              [0.7, 14, '255,140,220', 0.22],
              [1.15, 5, '160,200,255', 0.5],
              [1.45, 24, '120,160,255', 0.14],
              [1.8, 10, '255,220,120', 0.3],
              [2.15, 34, '255,120,160', 0.1],
            ];
            for (const [s, r, c, al] of GH) {
              const x = L.x + (C.x - L.x) * s;
              const y = L.y + (C.y - L.y) * s;
              const rad = r * u;
              gr = g.createRadialGradient(x, y, rad * 0.2, x, y, rad);
              gr.addColorStop(0, `rgba(${c},${al * 0.4 * k})`);
              gr.addColorStop(0.85, `rgba(${c},${al * k})`);
              gr.addColorStop(1, `rgba(${c},0)`);
              g.fillStyle = gr;
              g.beginPath();
              if (r > 20) {
                for (let i = 0; i < 6; i++) {
                  const aa = (i * TAU) / 6 + 0.3;
                  g.lineTo(x + Math.cos(aa) * rad, y + Math.sin(aa) * rad);
                }
              } else g.arc(x, y, rad, 0, TAU);
              g.fill();
            }
            // 빛 새기: 별이 가까운 가장자리가 주황빛
            const edge = L.x < w / 2 ? 0 : w;
            const leak = (1 - Math.min(1, Math.abs(L.x - edge) / (w * 0.5))) * k;
            gr = g.createLinearGradient(edge, 0, w / 2, 0);
            gr.addColorStop(0, `rgba(255,130,40,${0.55 * leak})`);
            gr.addColorStop(0.5, `rgba(255,80,60,${0.15 * leak})`);
            gr.addColorStop(1, 'rgba(255,80,60,0)');
            g.fillStyle = gr;
            g.fillRect(0, 0, w, h);
            g.restore();
          }
          pill(g, on ? '플레어 켬' : '플레어 끔', 10 * u, 14 * u, 8.5 * u, on ? 'rgba(255,90,150,.9)' : 'rgba(10,14,40,.7)', '#fff', 'left');
        },
        controls: [
          { type: 'range', label: '플레어 세기', min: 0, max: 2, step: 0.05, value: 1, on: (v) => (strength = v) },
          { type: 'toggle', label: '늘 켜기', value: false, on: (v) => (force = v ? true : null) },
        ] as Control[],
      };
    },
  },

  /* ───────────────────────── i112 글리치 · CRT ───────────────────────── */
  i112: {
    kind: '2d',
    caption: '「모순 발견!」 화면이 순간 찢기고 빨강 · 초록 · 파랑이 어긋남 + 옛 TV 줄무늬 · 둥근 화면',
    make() {
      let chan: HTMLCanvasElement[] = [];
      let key = '';
      let crt = true;
      let power = 1;
      const paint = (c: CanvasRenderingContext2D, w: number, h: number, u: number): void => {
        bg(c, w, h, '#0e2a3a', '#071420');
        c.strokeStyle = 'rgba(80,255,200,.12)';
        c.lineWidth = 1;
        for (let x = 0; x < w; x += 14 * u) {
          c.beginPath();
          c.moveTo(x, 0);
          c.lineTo(x, h);
          c.stroke();
        }
        for (let y = 0; y < h; y += 14 * u) {
          c.beginPath();
          c.moveTo(0, y);
          c.lineTo(w, y);
          c.stroke();
        }
        c.save();
        c.translate(w / 2, h * 0.42);
        c.rotate(-0.06);
        rr(c, -86 * u, -24 * u, 172 * u, 48 * u, 10 * u);
        c.lineWidth = 4 * u;
        c.strokeStyle = '#ff3b5c';
        c.stroke();
        txt(c, '모순 발견!', 0, 2 * u, 30 * u, '#ff3b5c', 'center', TF, 400);
        c.restore();
        txt(c, '가격표 30% ≠ 영수증 20%', w / 2, h * 0.7, 11 * u, '#bff8ff', 'center', F, 800);
        txt(c, '▶ 따져 묻기', w / 2, h * 0.83, 10 * u, '#ffe27a', 'center', F, 800);
      };
      return {
        draw(g, w, h, t) {
          const u = scaleOf(w, h);
          const d = g.getTransform().a;
          const k2 = `${w}x${h}x${d}`;
          if (k2 !== key) {
            key = k2;
            const base = document.createElement('canvas');
            base.width = Math.round(w * d);
            base.height = Math.round(h * d);
            const bc = base.getContext('2d')!;
            bc.scale(d, d);
            paint(bc, w, h, u);
            chan = ['#ff0000', '#00ff00', '#0000ff'].map((col) => {
              const cv = document.createElement('canvas');
              cv.width = base.width;
              cv.height = base.height;
              const cc = cv.getContext('2d')!;
              cc.drawImage(base, 0, 0);
              cc.globalCompositeOperation = 'multiply';
              cc.fillStyle = col;
              cc.fillRect(0, 0, cv.width, cv.height);
              return cv;
            });
          }
          const P = 2.6;
          const ph = fract(t / P) * P;
          const burst = ph < 0.42 ? Math.sin((ph / 0.42) * Math.PI) * power : 0;
          const frame = Math.floor(t * 20);
          const R = rng(frame + 1);
          g.fillStyle = '#000';
          g.fillRect(0, 0, w, h);
          // 화면 안쪽 (둥근 CRT)
          const inset = crt ? 8 * u : 0;
          g.save();
          if (crt) {
            rr(g, inset, inset, w - inset * 2, h - inset * 2, 18 * u);
            g.clip();
          }
          g.globalCompositeOperation = 'lighter';
          const offs = [
            [-(1 + burst * 7) * u, 0],
            [0, 0],
            [(1 + burst * 7) * u, burst * 2 * u],
          ];
          // 띠 나누기: 터질 때만 가로 띠가 어긋남
          const bands: [number, number, number][] = [];
          if (burst > 0.05) {
            let y = 0;
            while (y < h) {
              const bh = (4 + R() * 26) * u;
              bands.push([y, bh, R() < 0.45 ? (R() - 0.5) * 40 * u * burst : 0]);
              y += bh;
            }
          } else bands.push([0, h, 0]);
          chan.forEach((cv, ci) => {
            const [ox, oy] = offs[ci]!;
            for (const [y, bh, sx] of bands)
              g.drawImage(cv, 0, y * d, cv.width, bh * d, ox! + sx * (ci === 1 ? 0.6 : 1), y + oy!, w, bh);
          });
          g.globalCompositeOperation = 'source-over';
          if (burst > 0.3)
            for (let i = 0; i < 6; i++) {
              g.fillStyle = ['#ff3b5c', '#3bffd8', '#ffffff'][i % 3]! + '99';
              g.fillRect(R() * w, R() * h, (10 + R() * 50) * u, (1 + R() * 4) * u);
            }
          if (crt) {
            // 주사선
            g.fillStyle = 'rgba(0,0,0,.28)';
            for (let y = (t * 18 * u) % (3 * u); y < h; y += 3 * u) g.fillRect(0, y, w, 1.2 * u);
            // 지나가는 밝은 띠
            const sy = fract(t / 3.2) * (h + 60 * u) - 30 * u;
            const gr = g.createLinearGradient(0, sy - 30 * u, 0, sy + 30 * u);
            gr.addColorStop(0, 'rgba(180,255,230,0)');
            gr.addColorStop(0.5, 'rgba(180,255,230,.08)');
            gr.addColorStop(1, 'rgba(180,255,230,0)');
            g.fillStyle = gr;
            g.fillRect(0, sy - 30 * u, w, 60 * u);
            // 가장자리 어둡게
            const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
            vg.addColorStop(0, 'rgba(0,0,0,0)');
            vg.addColorStop(1, 'rgba(0,0,0,.65)');
            g.fillStyle = vg;
            g.fillRect(0, 0, w, h);
            // 유리 반사
            g.fillStyle = 'rgba(255,255,255,.06)';
            g.beginPath();
            g.ellipse(w * 0.3, h * 0.2, w * 0.35, h * 0.12, -0.25, 0, TAU);
            g.fill();
          }
          g.restore();
          if (crt) {
            rr(g, inset, inset, w - inset * 2, h - inset * 2, 18 * u);
            g.lineWidth = 3 * u;
            g.strokeStyle = '#2a2f3a';
            g.stroke();
          }
        },
        controls: [
          { type: 'range', label: '글리치 세기', min: 0, max: 2, step: 0.05, value: 1, on: (v) => (power = v) },
          { type: 'toggle', label: 'CRT (줄무늬 · 둥근 화면)', value: true, on: (v) => (crt = v) },
        ] as Control[],
      };
    },
  },

  /* ───────────────────────── i113 하프톤 · 리소 ───────────────────────── */
  i113: {
    kind: '2d',
    caption: '왼쪽 부드러운 명암 · 오른쪽 같은 그림을 망점으로 — 어두울수록 점이 커지고, 분홍 · 파랑 두 잉크가 살짝 어긋나요',
    make() {
      let spacing = 7;
      let img: ImageData | null = null;
      let tmp: HTMLCanvasElement | null = null;
      const PAPER = [255, 246, 228];
      const PINK = [255, 72, 176];
      const BLUE = [0, 120, 191];
      let grain: CanvasPattern | null = null;
      // 잉크 양: (지역 좌표 0~1, 시간) → [분홍, 파랑]
      const ink = (x: number, y: number, t: number, asp: number): [number, number] => {
        const cx = 0.5 + 0.16 * Math.sin(t * 0.9);
        const cy = 0.5 + 0.08 * Math.abs(Math.sin(t * 1.8)) * -1 + 0.06;
        const rad = 0.3;
        const dx = ((x - cx) * asp) / rad;
        const dy = (y - cy) / rad;
        const r2 = dx * dx + dy * dy;
        let p = 0;
        let b = 0.12 + 0.3 * y;
        // 바닥 그림자
        const sx = (x - cx) * asp / (rad * 1.1);
        const sy = (y - 0.86) / 0.06;
        if (sx * sx + sy * sy < 1) b = Math.max(b, 0.6 * (1 - (sx * sx + sy * sy)) + 0.35);
        if (r2 < 1) {
          const nz = Math.sqrt(1 - r2);
          const la = t * 0.7;
          const lx = Math.cos(la) * 0.7;
          const ly = -0.55;
          const lz = 0.55;
          const lam = Math.max(0, (dx * lx + dy * ly + nz * lz) / Math.hypot(lx, ly, lz));
          p = 0.25 + 0.75 * (1 - lam * 0.85);
          b = 0.7 * Math.pow(1 - lam, 1.6);
          // 공 위 띠 (수학 공)
          if (Math.abs(dy - Math.sin(dx * 2 + t) * 0.15) < 0.12) p = Math.min(1, p * 0.25), (b = Math.max(b, 0.55));
        }
        return [p, b];
      };
      return {
        draw(g, w, h, t) {
          const u = scaleOf(w, h);
          const hw = w / 2;
          const asp = hw / h;
          // 왼쪽: 낮은 해상도로 계산해 키우기
          const gw = 150;
          const gh = Math.max(20, Math.round((gw * h) / hw));
          if (!img || img.width !== gw || img.height !== gh) {
            img = new ImageData(gw, gh);
            tmp = document.createElement('canvas');
            tmp.width = gw;
            tmp.height = gh;
          }
          for (let j = 0; j < gh; j++)
            for (let i = 0; i < gw; i++) {
              const [p, b] = ink((i + 0.5) / gw, (j + 0.5) / gh, t, asp);
              const o = (j * gw + i) * 4;
              for (let c = 0; c < 3; c++) img.data[o + c] = PAPER[c]! * (1 - p * (1 - PINK[c]! / 255)) * (1 - b * (1 - BLUE[c]! / 255));
              img.data[o + 3] = 255;
            }
          tmp!.getContext('2d')!.putImageData(img, 0, 0);
          g.imageSmoothingEnabled = true;
          g.drawImage(tmp!, 0, 0, hw, h);
          // 오른쪽: 종이 + 망점 두 판 (곱하기)
          g.save();
          g.beginPath();
          g.rect(hw, 0, hw, h);
          g.clip();
          g.fillStyle = `rgb(${PAPER.join(',')})`;
          g.fillRect(hw, 0, hw, h);
          g.globalCompositeOperation = 'multiply';
          const s = spacing * u;
          const layers: [number, string, number, number, number][] = [
            [0.26, `rgb(${PINK.join(',')})`, 0, 0, 0],
            [1.31, `rgb(${BLUE.join(',')})`, 1, (1.3 + Math.sin(t * 0.6) * 0.5) * u, 0.9 * u],
          ];
          for (const [ang, col, ch, mx, my] of layers) {
            g.fillStyle = col;
            const ca = Math.cos(ang);
            const sa = Math.sin(ang);
            const span = Math.hypot(hw, h);
            const n = Math.ceil(span / s) + 1;
            g.beginPath();
            for (let a = -n; a <= n; a++)
              for (let b = -n; b <= n; b++) {
                const x = hw * 1.5 + (a * ca - b * sa) * s;
                const y = h / 2 + (a * sa + b * ca) * s;
                if (x < hw - s || x > w + s || y < -s || y > h + s) continue;
                const v = ink((x - hw) / hw, y / h, t, asp)[ch]!;
                if (v < 0.03) continue;
                const r = s * 0.62 * Math.sqrt(v);
                g.moveTo(x + mx + r, y + my);
                g.arc(x + mx, y + my, r, 0, TAU);
              }
            g.fill();
          }
          g.globalCompositeOperation = 'source-over';
          if (!grain) {
            const gc = document.createElement('canvas');
            gc.width = gc.height = 64;
            const gx = gc.getContext('2d')!;
            const R = rng(5);
            for (let i = 0; i < 500; i++) {
              gx.fillStyle = `rgba(90,60,40,${R() * 0.18})`;
              gx.fillRect(R() * 64, R() * 64, 1, 1);
            }
            grain = g.createPattern(gc, 'repeat');
          }
          if (grain) {
            g.fillStyle = grain;
            g.fillRect(hw, 0, hw, h);
          }
          g.restore();
          splitLabels(g, w, h, u, '부드러운 명암', '하프톤 · 리소');
        },
        controls: [{ type: 'range', label: '망점 간격', min: 4, max: 16, step: 0.5, value: 7, on: (v) => (spacing = v) }] as Control[],
      };
    },
  },

  /* ───────────────────────── i114 와이어프레임 → 완성 ───────────────────────── */
  i114: {
    kind: '3d',
    caption: '빛나는 띠가 아래에서 위로 쓸고 지나가면 선 뼈대(정육면체 · 원기둥 · 원뿔)가 색 있는 입체로 차올라요',
    make(T) {
      const scene = new T.Scene();
      scene.background = new T.Color(0x141c4a);
      scene.add(new T.HemisphereLight(0xdfe8ff, 0x3a3060, 1.1));
      const sun = new T.DirectionalLight(0xffffff, 1.7);
      sun.position.set(-3, 5, 4);
      scene.add(sun);
      const cut = new T.Plane(new T.Vector3(0, -1, 0), 0);
      const cutW = new T.Plane(new T.Vector3(0, 1, 0), 0);
      const root = new T.Group();
      scene.add(root);
      const geos: THREE.BufferGeometry[] = [];
      const spin: THREE.Group[] = [];
      const mats: THREE.Material[] = [];
      const items: [THREE.BufferGeometry, number, number, number][] = [
        [new T.BoxGeometry(1, 1, 1, 3, 3, 3), 0xff7ab6, -1.55, 1],
        [new T.CylinderGeometry(0.55, 0.55, 1.15, 24, 4), 0x5ec8ff, 0, 1.15],
        [new T.ConeGeometry(0.64, 1.2, 24, 4), 0xffd166, 1.55, 1.2],
      ];
      for (const [geo, col, x, hh] of items) {
        geos.push(geo);
        const sm = new T.MeshStandardMaterial({ color: col, roughness: 0.45, clippingPlanes: [cut], side: T.DoubleSide });
        const mesh = new T.Mesh(geo, sm);
        const it = new T.Group();
        it.position.set(x, -0.6 + hh / 2, 0);
        spin.push(it);
        const wg = new T.WireframeGeometry(geo);
        geos.push(wg);
        const wm = new T.LineBasicMaterial({ color: 0x7cf0ff, transparent: true, opacity: 0.85, clippingPlanes: [cutW] });
        const wire = new T.LineSegments(wg, wm);
        // 완성된 쪽 위에 아주 옅은 선 (설계도 흔적)
        const ghost = new T.LineSegments(wg, new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12 }));
        ghost.scale.setScalar(1.002);
        mats.push(sm, wm, ghost.material as THREE.Material);
        it.add(mesh, wire, ghost);
        root.add(it);
      }
      const base = new T.Mesh(new T.CylinderGeometry(2.7, 2.8, 0.14, 48), new T.MeshStandardMaterial({ color: 0x2b3a7a, roughness: 0.8 }));
      base.position.y = -0.68;
      base.scale.z = 0.5;
      geos.push(base.geometry);
      mats.push(base.material as THREE.Material);
      root.add(base);
      // 쓸고 가는 빛 띠
      const scanGeo = new T.RingGeometry(0, 2.75, 48);
      const scanMat = new T.MeshBasicMaterial({ color: 0x7cf0ff, transparent: true, opacity: 0.18, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
      const scan = new T.Mesh(scanGeo, scanMat);
      scan.rotation.x = -Math.PI / 2;
      scan.scale.y = 0.5;
      const rimGeo = new T.TorusGeometry(2.75, 0.025, 6, 96);
      const rimMat = new T.MeshBasicMaterial({ color: 0xbffcff, transparent: true, blending: T.AdditiveBlending });
      const rim = new T.Mesh(rimGeo, rimMat);
      rim.rotation.x = Math.PI / 2;
      rim.scale.y = 0.5;
      geos.push(scanGeo, rimGeo);
      mats.push(scanMat, rimMat);
      scene.add(scan, rim);
      const cam = new T.PerspectiveCamera(34, 1, 0.1, 50);
      cam.position.set(0, 2.3, 7.4);
      cam.lookAt(0, -0.05, 0);
      let speed = 1;
      let tt = 0;
      return {
        scene,
        camera: cam,
        update(_t, dt) {
          tt += dt * speed;
          spin.forEach((s, i) => (s.rotation.y = tt * 0.5 + i * 0.7));
          const P = 7;
          const p = fract(tt / P) * P;
          // 0~0.8 선만 · 0.8~3.4 차오름 · 3.4~4.8 완성 · 4.8~6.4 내려감 · 6.4~7 선만
          const lo = -0.72;
          const hi = 0.75;
          const y =
            p < 0.8 ? lo : p < 3.4 ? lerp(lo, hi, easeIO((p - 0.8) / 2.6)) : p < 4.8 ? hi : p < 6.4 ? lerp(hi, lo, easeIO((p - 4.8) / 1.6)) : lo;
          cut.constant = y;
          cutW.constant = -y;
          const vis = y > lo + 0.01 && y < hi - 0.01 ? 1 : 0;
          scan.position.y = y;
          rim.position.y = y;
          scanMat.opacity = 0.2 * vis;
          rimMat.opacity = vis;
        },
        render(r) {
          const lc = r.localClippingEnabled;
          r.localClippingEnabled = true;
          r.render(scene, cam);
          r.localClippingEnabled = lc;
        },
        controls: [{ type: 'range', label: '빠르기', min: 0, max: 3, step: 0.1, value: 1, on: (v) => (speed = v) }] as Control[],
        dispose() {
          for (const g of geos) g.dispose();
          for (const m of mats) m.dispose();
        },
      };
    },
  },

  /* ───────────────────────── i115 3D 입체 글자 ───────────────────────── */
  i115: {
    kind: '3d',
    caption: '글꼴 모양을 따서 두께를 준 「수학!」 — 돌며 떨어져 통통 착지하고, 빛이 쓱 지나가며 반짝',
    make(T) {
      const scene = new T.Scene();
      const bgc = document.createElement('canvas');
      bgc.width = 4;
      bgc.height = 128;
      const bx = bgc.getContext('2d')!;
      const bgr = bx.createLinearGradient(0, 0, 0, 128);
      bgr.addColorStop(0, '#1b1f5e');
      bgr.addColorStop(0.65, '#3a1f6e');
      bgr.addColorStop(1, '#5a2a6a');
      bx.fillStyle = bgr;
      bx.fillRect(0, 0, 4, 128);
      const bgTex = new T.CanvasTexture(bgc);
      bgTex.colorSpace = T.SRGBColorSpace;
      scene.background = bgTex;
      scene.add(new T.HemisphereLight(0xffffff, 0x50306a, 0.7));
      const key = new T.DirectionalLight(0xffffff, 1.6);
      key.position.set(-2, 4, 5);
      scene.add(key);
      const glint = new T.PointLight(0xffffff, 0, 6, 1.2);
      scene.add(glint);
      const CH: [string, number][] = [
        ['수', 0xff6fae],
        ['학', 0x4fc3ff],
        ['!', 0xffd23f],
      ];
      const letters: { g: THREE.Group; mesh: THREE.Mesh; mats: THREE.MeshStandardMaterial[] }[] = [];
      const geos: THREE.BufferGeometry[] = [];
      const build = (): void => {
        CH.forEach(([ch, col], i) => {
          const shapes = traceGlyph(ch, TF);
          const geo = new T.ExtrudeGeometry(shapes, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.045, bevelSize: 0.022, bevelSegments: 3, curveSegments: 2 });
          geo.computeBoundingBox();
          const bb = geo.boundingBox!;
          geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -0.1);
          geos.push(geo);
          let L = letters[i];
          if (!L) {
            const c = new T.Color(col);
            const front = new T.MeshStandardMaterial({ color: c, roughness: 0.28, metalness: 0.25 });
            const side = new T.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.55), roughness: 0.4, metalness: 0.35 });
            const mesh = new T.Mesh(geo, [front, side]);
            const g = new T.Group();
            g.add(mesh);
            mesh.scale.setScalar(1.45);
            scene.add(g);
            L = { g, mesh, mats: [front, side] };
            letters.push(L);
          } else {
            L.mesh.geometry.dispose();
            L.mesh.geometry = geo;
          }
        });
        const widths = letters.map((l) => {
          l.mesh.geometry.computeBoundingBox();
          const b = l.mesh.geometry.boundingBox!;
          return (b.max.x - b.min.x) * 1.45;
        });
        const gap = 0.12;
        const total = widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1);
        let x = -total / 2;
        letters.forEach((l, i) => {
          l.g.userData['x'] = x + widths[i]! / 2;
          x += widths[i]! + gap;
        });
      };
      build();
      let alive = true;
      if (!document.fonts.check('100px "Black Han Sans"'))
        document.fonts
          .load('100px "Black Han Sans"')
          .then(() => {
            if (alive) build();
          })
          .catch(() => undefined);
      // 받침
      const stage = new T.Mesh(new T.CylinderGeometry(2.6, 2.6, 0.12, 64), new T.MeshStandardMaterial({ color: 0x2e2f7a, roughness: 0.6 }));
      stage.position.y = -0.62;
      stage.scale.z = 0.38;
      scene.add(stage);
      // 반짝이
      const sc = document.createElement('canvas');
      sc.width = sc.height = 64;
      const sx = sc.getContext('2d')!;
      const sg = sx.createRadialGradient(32, 32, 0, 32, 32, 32);
      sg.addColorStop(0, 'rgba(255,255,255,1)');
      sg.addColorStop(0.2, 'rgba(255,240,180,.7)');
      sg.addColorStop(1, 'rgba(255,200,100,0)');
      sx.fillStyle = sg;
      sx.fillRect(0, 0, 64, 64);
      sx.fillStyle = '#fff';
      sx.beginPath();
      sx.moveTo(32, 0);
      sx.quadraticCurveTo(34, 30, 64, 32);
      sx.quadraticCurveTo(34, 34, 32, 64);
      sx.quadraticCurveTo(30, 34, 0, 32);
      sx.quadraticCurveTo(30, 30, 32, 0);
      sx.fill();
      const sTex = new T.CanvasTexture(sc);
      const sMat = new T.SpriteMaterial({ map: sTex, blending: T.AdditiveBlending, depthWrite: false, transparent: true });
      const R = rng(3);
      const sparks = Array.from({ length: 9 }, () => {
        const s = new T.Sprite(sMat.clone());
        s.position.set((R() - 0.5) * 4.2, -0.3 + R() * 1.9, 0.35 + R() * 0.3);
        s.userData['d'] = R();
        scene.add(s);
        return s;
      });
      const cam = new T.PerspectiveCamera(32, 1, 0.1, 50);
      cam.position.set(0, 0.9, 6.6);
      cam.lookAt(0, 0.35, 0);
      let env: { r: THREE.WebGLRenderer; tex: THREE.Texture } | null = null;
      let speed = 1;
      let tt = 0;
      return {
        scene,
        camera: cam,
        update(_t, dt) {
          tt += dt * speed;
          const P = 6.4;
          const p = fract(tt / P) * P;
          const out = ease((p - 5.6) / 0.6);
          letters.forEach((l, i) => {
            const s = 0.25 + i * 0.32;
            const k = clamp01((p - s) / 0.62);
            const land = p - s - 0.62;
            let sq = 0;
            if (land > 0) sq = Math.sin(land * 17) * Math.exp(-land * 5.5) * 0.24;
            const y = k < 1 ? 3.4 * (1 - k * k) : 0;
            l.g.visible = p >= s && out < 0.999;
            l.g.position.set(l.g.userData['x'] as number, y + out * 1.6 - 0.55, 0);
            l.g.rotation.y = (1 - easeIO(k)) * TAU + Math.sin(tt * 1.2 + i) * 0.12 * (k >= 1 ? 1 : 0) + out * Math.PI;
            const sc2 = 1 - out;
            l.g.scale.set(sc2 * (1 + sq * 0.6), sc2 * (1 - sq), sc2 * (1 + sq * 0.6));
          });
          // 반짝 빛 쓸기
          const gk = clamp01((p - 2.0) / 1.3);
          glint.intensity = gk > 0 && gk < 1 ? 26 * Math.sin(gk * Math.PI) : 0;
          glint.position.set(lerp(-3.2, 3.2, gk), 0.9, 1.4);
          for (const s of sparks) {
            const d = s.userData['d'] as number;
            const k = clamp01((p - 1.6 - d * 1.8) / 0.7);
            const a = Math.sin(k * Math.PI);
            (s.material as THREE.SpriteMaterial).opacity = a;
            s.scale.setScalar(0.05 + a * 0.38);
            (s.material as THREE.SpriteMaterial).rotation = tt * 2 + d * 6;
          }
        },
        render(r) {
          if (!env || env.r !== r) {
            env?.tex.dispose();
            const pm = new T.PMREMGenerator(r);
            const room = new RoomEnvironment();
            env = { r, tex: pm.fromScene(room, 0.04).texture };
            room.dispose();
            pm.dispose();
            scene.environment = env.tex;
            scene.environmentIntensity = 0.7;
          }
          r.render(scene, cam);
        },
        controls: [{ type: 'range', label: '빠르기', min: 0, max: 2.5, step: 0.1, value: 1, on: (v) => (speed = v) }] as Control[],
        dispose() {
          alive = false;
          env?.tex.dispose();
          for (const g of geos) g.dispose();
          for (const l of letters) for (const m of l.mats) m.dispose();
          stage.geometry.dispose();
          (stage.material as THREE.Material).dispose();
          bgTex.dispose();
          sTex.dispose();
          sMat.dispose();
          for (const s of sparks) s.material.dispose();
        },
      };
    },
  },

  /* ───────────────────────── i116 데이터 애니 ───────────────────────── */
  i116: {
    kind: 'dom',
    caption: '주마다 막대가 자라고 순위가 바뀌면 줄이 미끄러지듯 자리를 바꿔요(FLIP) · 오른쪽 선 그래프는 한 주씩 그려짐',
    make(box) {
      const FRU: [string, string, string][] = [
        ['🍎', '사과', '#ff5c6c'],
        ['🍌', '바나나', '#ffd23f'],
        ['🍇', '포도', '#a77bff'],
        ['🍓', '딸기', '#ff8ac4'],
        ['🍊', '귤', '#ff9f43'],
      ];
      const N = 12;
      const F1 = [1, 1, 2, 1, 2];
      const F2 = [2, 1, 1, 3, 1];
      const val = (i: number, k: number): number =>
        Math.round(22 + 11 * Math.sin((TAU * k * F1[i]!) / N + i * 1.3) + 6 * Math.cos((TAU * k * F2[i]!) / N + i));
      const root = domRoot(
        box,
        'mb-race',
        `.mb-race{background:linear-gradient(#1d2558,#0a0e25);display:flex;gap:3cqmin;padding:4cqmin;box-sizing:border-box}
         .mb-race .L{flex:1.3;display:flex;flex-direction:column;min-width:0}
         .mb-race .ttl{font-weight:800;font-size:5.4cqmin;margin-bottom:1.5cqmin;white-space:nowrap}
         .mb-race .ttl b{color:#ffd23f}
         .mb-race .rows{flex:1;display:flex;flex-direction:column;justify-content:space-around}
         .mb-race .row{display:flex;align-items:center;gap:1.4cqmin;height:12.5cqmin}
         .mb-race .nm{width:8cqmin;font-size:7cqmin;text-align:center;line-height:1}
         .mb-race .trk{flex:1;height:100%;padding-right:10cqmin;position:relative}
         .mb-race .bar{height:100%;border-radius:2.4cqmin;transition:width .85s cubic-bezier(.2,.8,.2,1);position:relative;min-width:3cqmin;box-shadow:inset 0 -1.2cqmin 0 rgba(0,0,0,.16)}
         .mb-race .bar span{position:absolute;left:calc(100% + 1.4cqmin);top:50%;transform:translateY(-50%);font-weight:900;font-size:5cqmin;white-space:nowrap}
         .mb-race .bar i{position:absolute;left:2cqmin;top:50%;transform:translateY(-50%);font-style:normal;font-size:4.2cqmin;font-weight:800;color:rgba(0,0,0,.6);white-space:nowrap}
         .mb-race .rk{width:5cqmin;font-weight:900;font-size:4.6cqmin;color:#9fb0ff;text-align:center}
         .mb-race .R{flex:1;display:flex;flex-direction:column;min-width:0;background:rgba(255,255,255,.05);border-radius:3cqmin;padding:2.5cqmin;box-sizing:border-box}
         .mb-race .R .ttl{font-size:4.6cqmin;margin:0}
         .mb-race svg{flex:1;width:100%;min-height:0;display:block}`,
        `<div class="L"><div class="ttl">좋아하는 과일 투표 · <b class="wk">1주</b></div><div class="rows"></div></div>
         <div class="R"><div class="ttl">주별 득표 변화</div><svg></svg></div>`,
      );
      const rowsBox = q(root, '.rows');
      const wk = q(root, '.wk');
      const svg = q<SVGSVGElement>(root, 'svg');
      const rows = FRU.map(([em, nm, col]) => {
        const el = document.createElement('div');
        el.className = 'row';
        el.innerHTML = `<div class="rk"></div><div class="nm">${em}</div><div class="trk"><div class="bar" style="background:${col}"><i>${nm}</i><span>0</span></div></div>`;
        rowsBox.appendChild(el);
        return { el, bar: q(el, '.bar'), num: q(el, '.bar span'), rk: q(el, '.rk'), shown: 0, target: 0 };
      });
      const NS = 'http://www.w3.org/2000/svg';
      const grid = document.createElementNS(NS, 'g');
      const lines = FRU.map(([, , col]) => {
        const p = document.createElementNS(NS, 'polyline');
        p.setAttribute('fill', 'none');
        p.setAttribute('stroke', col);
        p.setAttribute('stroke-width', '2.5');
        p.setAttribute('stroke-linejoin', 'round');
        p.setAttribute('stroke-linecap', 'round');
        const c = document.createElementNS(NS, 'circle');
        c.setAttribute('fill', col);
        c.setAttribute('stroke', '#fff');
        c.setAttribute('stroke-width', '1.5');
        return { p, c };
      });
      const plot = document.createElementNS(NS, 'g');
      svg.append(grid, plot);
      for (const l of lines) plot.append(l.p, l.c);
      let lastK = -1;
      let sz = '';
      const STEP = 1.1;
      const apply = (k: number): void => {
        wk.textContent = `${k + 1}주`;
        const vals = FRU.map((_, i) => val(i, k));
        const first = rows.map((r) => r.el.offsetTop);
        const order = vals.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]);
        order.forEach(([, i], rank) => {
          rowsBox.appendChild(rows[i]!.el);
          rows[i]!.rk.textContent = String(rank + 1);
        });
        rows.forEach((r, i) => {
          r.target = vals[i]!;
          r.bar.style.width = `${(vals[i]! / 42) * 100}%`;
          const dy = first[i]! - r.el.offsetTop;
          if (dy) {
            r.el.style.transition = 'none';
            r.el.style.transform = `translateY(${dy}px)`;
            void r.el.offsetWidth;
            r.el.style.transition = 'transform .65s cubic-bezier(.2,.8,.2,1)';
            r.el.style.transform = '';
          }
        });
      };
      return {
        update(t, dt) {
          const k = Math.floor(t / STEP) % N;
          if (k !== lastK) {
            lastK = k;
            apply(k);
          }
          for (const r of rows) {
            r.shown += (r.target - r.shown) * Math.min(1, dt * 5);
            r.num.textContent = `${Math.round(r.shown)}표`;
          }
          const W = svg.clientWidth;
          const H = svg.clientHeight;
          if (`${W}x${H}` !== sz) {
            sz = `${W}x${H}`;
            svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
            grid.innerHTML = [0, 1, 2, 3].map((i) => `<line x1="0" x2="${W}" y1="${4 + (i * (H - 8)) / 3}" y2="${4 + (i * (H - 8)) / 3}" stroke="rgba(255,255,255,.12)"/>`).join('');
          }
          const X = (s: number): number => 5 + (s / (N - 1)) * (W - 10);
          const Y = (v: number): number => H - 4 - (v / 42) * (H - 8);
          const fr = easeIO(fract(t / STEP) / 0.75);
          const s = k + (k < N - 1 ? fr : 0);
          plot.setAttribute('opacity', String(k === N - 1 ? 1 - clamp01((fract(t / STEP) - 0.55) / 0.4) : 1));
          lines.forEach((l, i) => {
            const pts: string[] = [];
            for (let j = 0; j <= Math.floor(s); j++) pts.push(`${X(j).toFixed(1)},${Y(val(i, j)).toFixed(1)}`);
            const j0 = Math.floor(s);
            const hv = j0 < N - 1 ? lerp(val(i, j0), val(i, j0 + 1), s - j0) : val(i, j0);
            pts.push(`${X(s).toFixed(1)},${Y(hv).toFixed(1)}`);
            l.p.setAttribute('points', pts.join(' '));
            l.c.setAttribute('cx', X(s).toFixed(1));
            l.c.setAttribute('cy', Y(hv).toFixed(1));
            l.c.setAttribute('r', String(Math.max(2.5, H * 0.03)));
          });
        },
      };
    },
  },

  /* ───────────────────────── i117 Manim식 수식 변환 ───────────────────────── */
  i117: {
    kind: 'dom',
    caption: '2x + 3 = 11 → x = 4 — 같은 기호는 남아서 새 자리로 날아가고, 나머지는 녹아 사라지거나 하나로 합쳐져요',
    make(box) {
      const TK: Record<string, [string, string]> = {
        c2: ['2', 'n'],
        x: ['x', 'v'],
        plus: ['+', 'o'],
        t3: ['3', 'n'],
        eq: ['=', 'e'],
        n11: ['11', 'n'],
        minus: ['−', 'o'],
        n8: ['8', 'n'],
        div: ['÷', 'o'],
        n4: ['4', 'a'],
      };
      const ST: { ids: string[]; note: string; into?: Record<string, string> }[] = [
        { ids: ['c2', 'x', 'plus', 't3', 'eq', 'n11'], note: '처음 식' },
        { ids: ['c2', 'x', 'eq', 'n11', 'minus', 't3'], note: '+3 이 = 을 넘어가면 −3' },
        { ids: ['c2', 'x', 'eq', 'n8'], note: '11 − 3 = 8', into: { n11: 'n8', minus: 'n8', t3: 'n8' } },
        { ids: ['x', 'eq', 'n8', 'div', 'c2'], note: '곱한 2 가 넘어가면 ÷ 2' },
        { ids: ['x', 'eq', 'n4'], note: '8 ÷ 2 = 4 — 답!', into: { n8: 'n4', div: 'n4', c2: 'n4' } },
      ];
      const root = domRoot(
        box,
        'mb-eq',
        `.mb-eq{background:radial-gradient(circle at 50% 38%,#2a3a80,#0b0f2a 75%)}
         .mb-eq .tk,.mb-eq .meas{font-family:${TF};font-size:15cqmin;line-height:1}
         .mb-eq .meas .tight{margin-left:-.2em}
         .mb-eq .tk{position:absolute;left:50%;top:43%;white-space:pre;will-change:transform,opacity}
         .mb-eq .meas{position:absolute;left:0;top:0;display:flex;gap:.3em;visibility:hidden;white-space:pre}
         .mb-eq .n{color:#fff}.mb-eq .v{color:#ff7ab6}.mb-eq .o{color:#7cf0ff}.mb-eq .e{color:#c9d3ff}.mb-eq .a{color:#ffd23f}
         .mb-eq .tk.mv{color:#ffe27a;text-shadow:0 0 2cqmin rgba(255,226,122,.8)}
         .mb-eq .nt{position:absolute;left:0;right:0;top:70%;text-align:center;font-weight:800;font-size:6cqmin;color:#ffe9a8}
         .mb-eq .dots{position:absolute;left:50%;bottom:7%;transform:translateX(-50%);display:flex;gap:1.8cqmin}
         .mb-eq .dots i{width:2.4cqmin;height:2.4cqmin;border-radius:50%;background:rgba(255,255,255,.25);transition:background .3s}
         .mb-eq .dots i.on{background:#ffd23f}
         .mb-eq .ln{position:absolute;left:12%;right:12%;top:61%;height:.5cqmin;border-radius:1cqmin;background:rgba(255,255,255,.12)}`,
        `<div class="meas"></div><div class="ln"></div>${Object.entries(TK)
          .map(([id, [s, c]]) => `<span class="tk ${c}" data-id="${id}">${s}</span>`)
          .join('')}<div class="nt"></div><div class="dots">${ST.map(() => '<i></i>').join('')}</div>`,
      );
      const meas = q(root, '.meas');
      const note = q(root, '.nt');
      const dots = qa(root, '.dots i');
      const el: Record<string, HTMLElement> = {};
      for (const s of qa(root, '.tk')) el[s.dataset['id']!] = s;
      let pos: Record<string, number>[] = [];
      let fs = 20;
      let key = '';
      const measure = (): void => {
        fs = parseFloat(getComputedStyle(meas).fontSize) || 20;
        pos = ST.map((st) => {
          meas.innerHTML = st.ids.map((id, n) => `<span${id === 'x' && st.ids[n - 1] === 'c2' ? ' class="tight"' : ''}>${TK[id]![0]}</span>`).join('');
          const W = meas.offsetWidth;
          const out: Record<string, number> = {};
          Array.from(meas.children).forEach((c, i) => {
            const e = c as HTMLElement;
            out[st.ids[i]!] = e.offsetLeft + e.offsetWidth / 2 - W / 2;
          });
          return out;
        });
      };
      let speed = 1;
      let tt = 0;
      const H = 1.5;
      const M = 1.15;
      const SEG = H + M;
      return {
        update(_t, dt) {
          const k2 = `${root.clientWidth}x${root.clientHeight}x${document.fonts.check('20px "Black Han Sans"')}`;
          if (k2 !== key) {
            key = k2;
            measure();
          }
          tt += dt * speed;
          const tc = fract(tt / (SEG * ST.length)) * SEG * ST.length;
          const i = Math.floor(tc / SEG);
          const j = (i + 1) % ST.length;
          const local = tc - i * SEG;
          const k = local < H ? 0 : easeIO((local - H) / M);
          const A = pos[i]!;
          const B = pos[j]!;
          const into = ST[j]!.into ?? {};
          const targets = new Set(Object.values(into));
          for (const id of Object.keys(TK)) {
            const e = el[id]!;
            const a = A[id];
            const b = B[id];
            let x = 0;
            let y = 0;
            let o = 0;
            let s = 1;
            let mv = false;
            if (a !== undefined && b !== undefined) {
              x = lerp(a, b, k);
              const far = Math.abs(b - a) > fs * 0.9;
              y = far ? -Math.sin(k * Math.PI) * fs * 0.75 : 0;
              o = 1;
              mv = Math.abs(b - a) > 2 && k > 0 && k < 1;
            } else if (a !== undefined) {
              const tg = into[id];
              if (tg && B[tg] !== undefined) {
                x = lerp(a, B[tg]!, easeIO(k * 1.15));
                y = -Math.sin(Math.min(1, k * 1.15) * Math.PI) * fs * 0.35;
                o = 1 - ease((k - 0.55) / 0.4);
                s = 1 - 0.25 * k;
                mv = k > 0;
              } else {
                x = a;
                y = k * fs * 0.4;
                o = 1 - ease(k / 0.7);
                s = 1 - 0.3 * k;
              }
            } else if (b !== undefined) {
              x = b;
              if (targets.has(id)) {
                o = ease((k - 0.6) / 0.35);
                s = 0.5 + 0.5 * easeOutBack((k - 0.6) / 0.4);
              } else {
                o = ease((k - 0.3) / 0.7);
                y = -(1 - k) * fs * 0.4;
              }
            }
            e.style.opacity = o.toFixed(3);
            e.style.transform = `translate(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px)) scale(${s.toFixed(3)})`;
            e.classList.toggle('mv', mv);
          }
          const ni = k < 0.5 ? i : j;
          if (note.textContent !== ST[ni]!.note) note.textContent = ST[ni]!.note;
          note.style.opacity = String(Math.abs(1 - k * 2));
          dots.forEach((d, n) => d.classList.toggle('on', n === ni));
        },
        controls: [{ type: 'range', label: '빠르기', min: 0.3, max: 2.5, step: 0.1, value: 1, on: (v) => (speed = v) }] as Control[],
      };
    },
  },

  /* ───────────────────────── i118 그래프 + 따라가는 점 ───────────────────────── */
  i118: {
    kind: '2d',
    caption: 'x 값 하나가 움직이면 직선 위 점 · 값표의 줄 · 아래 넓이가 함께 바뀌어요 (크게 보기에서 그래프를 끌어 보기)',
    make() {
      let a = 2;
      let b = 1;
      let auto = true;
      let xv = 1.5;
      let ph = 0;
      let hold = 0;
      let drag = false;
      let cv: HTMLCanvasElement | null = null;
      let inv = (px: number): number => px;
      const pick = (e: PointerEvent): void => {
        if (!cv) return;
        const rc = cv.getBoundingClientRect();
        xv = Math.max(0, Math.min(4, inv(e.clientX - rc.left)));
        hold = 2.5;
      };
      const onDown = (e: PointerEvent): void => {
        drag = true;
        pick(e);
      };
      const onMove = (e: PointerEvent): void => {
        if (drag) pick(e);
      };
      const onUp = (): void => {
        drag = false;
      };
      const fmt = (v: number): string => (Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : v.toFixed(1));
      return {
        draw(g, w, h, _t, dt) {
          if (!cv) {
            cv = g.canvas;
            cv.addEventListener('pointerdown', onDown);
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
          }
          const u = scaleOf(w, h);
          hold -= dt;
          if (auto && hold <= 0 && !drag) {
            ph += dt;
            const target = 2 + 1.8 * Math.sin((TAU * ph) / 7);
            xv += (target - xv) * Math.min(1, dt * 3);
          }
          bg(g, w, h, '#1b2560', '#0b1030');
          const f = (x: number): number => a * x + b;
          const ymax = Math.ceil(Math.max(9, f(4.4)) + 1);
          const ymin = Math.min(-1.5, f(0) - 1);
          // 판 배치
          const tw = Math.min(w * 0.3, 120 * u);
          const px0 = 22 * u;
          const px1 = w - tw - 16 * u;
          const py0 = 30 * u;
          const py1 = h - 20 * u;
          const X = (x: number): number => px0 + ((x + 0.5) / 5) * (px1 - px0);
          const Y = (y: number): number => py1 - ((y - ymin) / (ymax - ymin)) * (py1 - py0);
          inv = (px) => ((px - px0) / (px1 - px0)) * 5 - 0.5;
          // 모눈
          g.lineWidth = 1;
          g.strokeStyle = 'rgba(255,255,255,.08)';
          for (let x = 0; x <= 4; x++) {
            g.beginPath();
            g.moveTo(X(x), py0);
            g.lineTo(X(x), py1);
            g.stroke();
          }
          const ys = ymax > 14 ? 4 : 2;
          for (let y = Math.ceil(ymin / ys) * ys; y <= ymax; y += ys) {
            g.beginPath();
            g.moveTo(px0, Y(y));
            g.lineTo(px1, Y(y));
            g.stroke();
            if (y !== 0) txt(g, String(y), X(0) - 5 * u, Y(y), 7 * u, 'rgba(255,255,255,.45)', 'right', F, 600);
          }
          for (let x = 1; x <= 4; x++) txt(g, String(x), X(x), Y(0) + 8 * u, 7 * u, 'rgba(255,255,255,.45)', 'center', F, 600);
          g.strokeStyle = 'rgba(255,255,255,.6)';
          g.lineWidth = 1.5 * u;
          g.beginPath();
          g.moveTo(px0, Y(0));
          g.lineTo(px1, Y(0));
          g.moveTo(X(0), py0);
          g.lineTo(X(0), py1);
          g.stroke();
          // 넓이
          const yv = f(xv);
          g.beginPath();
          g.moveTo(X(0), Y(0));
          g.lineTo(X(0), Y(f(0)));
          g.lineTo(X(xv), Y(yv));
          g.lineTo(X(xv), Y(0));
          g.closePath();
          g.fillStyle = 'rgba(255,210,63,.32)';
          g.fill();
          // 직선
          g.save();
          g.beginPath();
          g.rect(px0, py0 - 4 * u, px1 - px0, py1 - py0 + 8 * u);
          g.clip();
          g.strokeStyle = '#5fd6ff';
          g.lineWidth = 3 * u;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(X(-0.5), Y(f(-0.5)));
          g.lineTo(X(4.5), Y(f(4.5)));
          g.stroke();
          g.restore();
          // 투영 점선
          g.setLineDash([4 * u, 4 * u]);
          g.strokeStyle = 'rgba(255,122,182,.8)';
          g.lineWidth = 1.5 * u;
          g.beginPath();
          g.moveTo(X(xv), Y(0));
          g.lineTo(X(xv), Y(yv));
          g.lineTo(X(0), Y(yv));
          g.stroke();
          g.setLineDash([]);
          // 점
          const pulse = 1 + 0.25 * Math.sin(ph * 6);
          g.fillStyle = 'rgba(255,122,182,.25)';
          g.beginPath();
          g.arc(X(xv), Y(yv), 10 * u * pulse, 0, TAU);
          g.fill();
          g.fillStyle = '#ff7ab6';
          g.strokeStyle = '#fff';
          g.lineWidth = 2 * u;
          g.beginPath();
          g.arc(X(xv), Y(yv), 5.5 * u, 0, TAU);
          g.fill();
          g.stroke();
          pill(g, `x = ${xv.toFixed(2)}`, X(xv), Math.min(py1 + 9 * u, h - 8 * u), 7 * u, '#ff7ab6');
          pill(g, `y = ${yv.toFixed(2)}`, X(0) + 4 * u, Y(yv), 7 * u, 'rgba(255,122,182,.9)', '#fff', 'left');
          const bs = b === 0 ? '' : b > 0 ? ` + ${fmt(b)}` : ` − ${fmt(-b)}`;
          pill(g, `y = ${fmt(a)}x${bs}`, px0 + 4 * u, 14 * u, 8.5 * u, '#2b8fd6', '#fff', 'left');
          // 값표
          const tx = w - tw - 6 * u;
          const ty = 26 * u;
          const rh = Math.min(17 * u, (h - ty - 46 * u) / 6);
          rr(g, tx, ty - rh, tw, rh * 6 + 4 * u, 8 * u);
          g.fillStyle = 'rgba(255,255,255,.07)';
          g.fill();
          txt(g, 'x', tx + tw * 0.3, ty - rh / 2, 8 * u, '#ff7ab6', 'center', F, 800);
          txt(g, 'y', tx + tw * 0.7, ty - rh / 2, 8 * u, '#5fd6ff', 'center', F, 800);
          // 미끄러지는 강조 띠 (x 가 연속이면 띠도 연속)
          rr(g, tx + 3 * u, ty + xv * rh, tw - 6 * u, rh, 5 * u);
          g.fillStyle = 'rgba(255,210,63,.3)';
          g.fill();
          for (let x = 0; x <= 4; x++) {
            const yy = ty + x * rh + rh / 2;
            const near = 1 - Math.min(1, Math.abs(xv - x));
            const c = `rgba(255,255,255,${0.55 + 0.45 * near})`;
            txt(g, String(x), tx + tw * 0.3, yy, (7.5 + near * 1.5) * u, c);
            txt(g, fmt(f(x)), tx + tw * 0.7, yy, (7.5 + near * 1.5) * u, c);
          }
          const area = (a * xv * xv) / 2 + b * xv;
          txt(g, `넓이 = ${area.toFixed(2)}`, tx + tw / 2, ty + rh * 5 + 16 * u, 8 * u, '#ffd23f', 'center', F, 800);
          // 값 추적기 (수직선 손잡이)
          const sy = ty + rh * 5 + 32 * u;
          if (sy < h - 6 * u) {
            g.strokeStyle = 'rgba(255,255,255,.35)';
            g.lineWidth = 2 * u;
            g.beginPath();
            g.moveTo(tx + 8 * u, sy);
            g.lineTo(tx + tw - 8 * u, sy);
            g.stroke();
            g.fillStyle = '#ff7ab6';
            g.beginPath();
            g.arc(tx + 8 * u + (xv / 4) * (tw - 16 * u), sy, 4.5 * u, 0, TAU);
            g.fill();
          }
        },
        controls: [
          { type: 'range', label: '기울기 a', min: 0.5, max: 3, step: 0.5, value: 2, on: (v) => (a = v) },
          { type: 'range', label: '절편 b', min: -2, max: 3, step: 1, value: 1, on: (v) => (b = v) },
          { type: 'toggle', label: 'x 저절로 움직이기', value: true, on: (v) => (auto = v) },
        ] as Control[],
        dispose() {
          cv?.removeEventListener('pointerdown', onDown);
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        },
      };
    },
  },

  /* ───────────────────────── i119 기하 증명 ───────────────────────── */
  i119: {
    kind: '2d',
    caption: '원을 부채꼴로 잘라 엇갈려 늘어놓으면 가로 πr · 세로 r 인 평행사변형 — 그래서 원 넓이 = πr²',
    make() {
      let N = 16;
      return {
        draw(g, w, h, t) {
          const u = scaleOf(w, h);
          bg(g, w, h, '#1d2a6a', '#0c1236');
          const P = 10;
          const p = fract(t / P) * P;
          const al = TAU / N;
          const r = Math.min((w * 0.84) / (Math.PI + 0.45), h * 0.29);
          const c = 2 * r * Math.sin(al / 2);
          const half = N / 2;
          const total = half * c + c / 2;
          const cx = w / 2;
          const cy = h * 0.47;
          const Hb = cy + r / 2;
          const Ht = Hb - r * Math.cos(al / 2);
          const x0 = cx - total / 2;
          // 0~1 원 · 1~1.8 자르는 선 · 1.8~4.4 이동 · 4.4~7 완성 · 7~9.2 되돌아감 · 9.2~10 원
          const cutK = clamp01((p - 1) / 0.8) * (p < 9.2 ? 1 : 1 - clamp01((p - 9.2) / 0.5));
          const go = p < 1.8 ? 0 : p < 4.4 ? (p - 1.8) / 2.6 : p < 7 ? 1 : p < 9.2 ? 1 - (p - 7) / 2.2 : 0;
          const order: number[] = [];
          for (let i = 0; i < N; i++) order.push(i);
          for (const i of order) {
            const A = i < half;
            const j = A ? half - 1 - i : i - half;
            const phi = (i + 0.5) * al;
            const tgtA = A ? Math.PI / 2 : (3 * Math.PI) / 2;
            const fx = A ? x0 + j * c + c / 2 : x0 + j * c;
            const fy = A ? Ht : Hb;
            const delay = (j / half) * 0.45 + (A ? 0 : 0.08);
            const k = easeIO((go - delay) / 0.55);
            const lift = Math.sin(k * Math.PI) * (A ? -1 : 1) * r * 0.25;
            const push = Math.sin(clamp01(go * 3) * Math.PI) * 0;
            const ax = lerp(cx + Math.cos(phi) * push, fx, k);
            const ay = lerp(cy + Math.sin(phi) * push, fy, k) + lift;
            const ang = lerp(phi, tgtA, k);
            g.beginPath();
            g.moveTo(ax, ay);
            g.arc(ax, ay, r, ang - al / 2, ang + al / 2);
            g.closePath();
            g.fillStyle = A ? (i % 2 ? '#ff8fb8' : '#ff6fa3') : i % 2 ? '#6ec8ff' : '#4fb0f2';
            g.fill();
            g.strokeStyle = `rgba(255,255,255,${0.25 + 0.65 * cutK})`;
            g.lineWidth = (0.8 + cutK * 0.8) * u;
            g.stroke();
          }
          // 이름표
          const done = p > 4.6 && p < 7 ? ease((p - 4.6) / 0.5) * (1 - ease((p - 6.6) / 0.4)) : 0;
          if (go === 0) {
            const k0 = 1 - cutK;
            g.strokeStyle = `rgba(255,226,122,${0.9 * k0})`;
            g.lineWidth = 2 * u;
            g.beginPath();
            g.moveTo(cx, cy);
            g.lineTo(cx + r, cy);
            g.stroke();
            if (k0 > 0.05) txt(g, 'r', cx + r / 2, cy - 7 * u, 10 * u, `rgba(255,226,122,${k0})`, 'center', F, 800);
            txt(g, '원 넓이는?', cx, h - 14 * u, 10 * u, `rgba(255,255,255,${0.5 + 0.5 * k0})`, 'center', F, 800);
          }
          if (done > 0) {
            g.globalAlpha = done;
            const top = Hb - r - 6 * u;
            g.strokeStyle = '#ffe27a';
            g.lineWidth = 2 * u;
            g.beginPath();
            g.moveTo(x0, top + 4 * u);
            g.lineTo(x0, top);
            g.lineTo(x0 + half * c, top);
            g.lineTo(x0 + half * c, top + 4 * u);
            g.stroke();
            txt(g, 'πr  (원 둘레의 반)', x0 + (half * c) / 2, top - 8 * u, 9 * u, '#ffe27a', 'center', F, 800);
            const lx = x0 - 7 * u;
            g.beginPath();
            g.moveTo(lx + 4 * u, Hb - r);
            g.lineTo(lx, Hb - r);
            g.lineTo(lx, Hb);
            g.lineTo(lx + 4 * u, Hb);
            g.stroke();
            txt(g, 'r', lx - 7 * u, Hb - r / 2, 10 * u, '#ffe27a', 'center', F, 800);
            pill(g, '넓이 = πr × r = πr²', cx, h - 14 * u, 9.5 * u, '#ff5c8a');
            g.globalAlpha = 1;
          }
          pill(g, `조각 ${N}개`, 10 * u, 13 * u, 7.5 * u, 'rgba(10,14,40,.6)', '#fff', 'left');
        },
        controls: [{ type: 'range', label: '조각 수', min: 6, max: 40, step: 2, value: 16, on: (v) => (N = v) }] as Control[],
      };
    },
  },

  /* ───────────────────────── i120 이음새 없는 반복 ───────────────────────── */
  i120: {
    kind: '2d',
    caption: '왼쪽은 주기 함수만 써서 끝 = 처음 (이음새 없음) · 오른쪽은 박자가 안 맞아 한 바퀴마다 「툭」 튀어요',
    make() {
      let P = 3;
      const loader = (g: G, cx: number, cy: number, R: number, p: number, good: boolean, u: number): void => {
        // 점선 = 처음(p=0) 모습
        const shape = (pp: number, bad: boolean): ((th: number) => number) => {
          const m = bad ? 0.7 : 1;
          return (th) => R * (1 + 0.13 * Math.sin(3 * th + TAU * pp * m) + 0.07 * Math.sin(5 * th - 2 * TAU * pp * m));
        };
        const path = (fn: (th: number) => number): void => {
          g.beginPath();
          for (let i = 0; i <= 64; i++) {
            const th = (i / 64) * TAU;
            const rad = fn(th);
            if (i) g.lineTo(cx + Math.cos(th) * rad, cy + Math.sin(th) * rad);
            else g.moveTo(cx + Math.cos(th) * rad, cy + Math.sin(th) * rad);
          }
          g.closePath();
        };
        path(shape(0, !good));
        g.setLineDash([3 * u, 3 * u]);
        g.strokeStyle = 'rgba(255,255,255,.35)';
        g.lineWidth = 1.2 * u;
        g.stroke();
        g.setLineDash([]);
        path(shape(p, !good));
        const gr = g.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R * 1.2);
        gr.addColorStop(0, good ? '#9ff0d0' : '#ffd0a0');
        gr.addColorStop(1, good ? '#2fbf9f' : '#ff8a5b');
        g.fillStyle = gr;
        g.fill();
        // 얼굴
        g.fillStyle = '#1a2050';
        g.beginPath();
        g.arc(cx - R * 0.28, cy - R * 0.08, R * 0.08, 0, TAU);
        g.arc(cx + R * 0.28, cy - R * 0.08, R * 0.08, 0, TAU);
        g.fill();
        g.strokeStyle = '#1a2050';
        g.lineWidth = 1.8 * u;
        g.beginPath();
        g.arc(cx, cy + R * 0.08, R * 0.18, 0.2, Math.PI - 0.2);
        g.stroke();
        // 도는 점 6개 + 세모
        const rot = good ? TAU * p : TAU * p * 0.8;
        for (let i = 0; i < 6; i++) {
          const a = rot + (i * TAU) / 6;
          const s = 1 + 0.4 * Math.sin(TAU * p * 2 + i);
          g.fillStyle = ['#ff7ab6', '#ffd23f', '#7cf0ff'][i % 3]!;
          g.beginPath();
          g.arc(cx + Math.cos(a) * R * 1.55, cy + Math.sin(a) * R * 1.55, 3.4 * u * s, 0, TAU);
          g.fill();
        }
        const tri = good ? (TAU / 3) * p : (TAU / 3) * p * 1.35;
        g.save();
        g.translate(cx, cy - R * 1.95);
        g.rotate(tri);
        g.beginPath();
        for (let i = 0; i < 3; i++) g.lineTo(Math.cos(-Math.PI / 2 + (i * TAU) / 3) * 6 * u, Math.sin(-Math.PI / 2 + (i * TAU) / 3) * 6 * u);
        g.closePath();
        g.fillStyle = '#fff';
        g.fill();
        g.restore();
      };
      let ph = 0;
      return {
        draw(g, w, h, _t, dt) {
          const u = scaleOf(w, h);
          ph += dt / P;
          const p = fract(ph);
          bg(g, w, h, '#22205e', '#0d0c2c');
          const R = Math.min(w * 0.11, h * 0.2);
          for (const good of [true, false]) {
            const cx = good ? w * 0.25 : w * 0.75;
            const cy = h * 0.52;
            loader(g, cx, cy, R, p, good, u);
            // 진행 막대
            const bw = w * 0.34;
            const by = h - 13 * u;
            rr(g, cx - bw / 2, by - 2.5 * u, bw, 5 * u, 3 * u);
            g.fillStyle = 'rgba(255,255,255,.15)';
            g.fill();
            rr(g, cx - bw / 2, by - 2.5 * u, bw * p, 5 * u, 3 * u);
            g.fillStyle = good ? '#44f0a8' : '#ff8a5b';
            g.fill();
            const seam = p < 0.12 || p > 0.97 ? 1 : 0;
            if (seam) {
              if (good) pill(g, '이어짐 ✓', cx, cy - R * 2.45 + 4 * u, 7.5 * u, '#21a07a');
              else {
                txt(g, '툭!', cx + R * 1.3, cy - R * 1.1, 15 * u, '#ff5c6c', 'center', TF, 400);
                g.strokeStyle = 'rgba(255,92,108,.8)';
                g.lineWidth = 2.5 * u;
                g.beginPath();
                g.arc(cx, cy, R * 1.85, 0, TAU);
                g.stroke();
              }
            }
          }
          g.fillStyle = 'rgba(255,255,255,.5)';
          g.fillRect(w / 2 - 1, 0, 2, h);
          pill(g, '이음새 없음', w * 0.25, 13 * u, 8.5 * u, '#21a07a');
          pill(g, '이음새 있음', w * 0.75, 13 * u, 8.5 * u, 'rgba(255,92,108,.9)');
        },
        controls: [{ type: 'range', label: '한 바퀴 (초)', min: 1, max: 6, step: 0.5, value: 3, on: (v) => (P = v) }] as Control[],
      };
    },
  },

  /* ───────────────────────── i121 박자 맞춤 ───────────────────────── */
  i121: {
    kind: '2d',
    caption: '박자표(BPM)로 지금 몇 번째 박인지 계산 — 공이 박마다 착지하고, 2 · 3 · 4 의 배수 박에서 그 줄 북이 빛나요',
    make() {
      let bpm = 100;
      let beat = 0;
      let lastB = -1;
      const snd = new Blip();
      const flash = [0, 0, 0, 0];
      const COL = ['#7cf0ff', '#ffd23f', '#ff7ab6', '#9b8cff'];
      return {
        draw(g, w, h, _t, dt) {
          const u = scaleOf(w, h);
          beat += (dt * bpm) / 60;
          const bi = Math.floor(beat);
          const f = beat - bi;
          const n = (bi % 12) + 1; // 1 ~ 12
          if (bi !== lastB) {
            lastB = bi;
            for (let m = 1; m <= 4; m++) if (n % m === 0) flash[m - 1] = 1;
            if (n % 4 === 0) snd.tone(880, 0.12, 'triangle', 0.22);
            else if (n % 3 === 0) snd.tone(660, 0.12, 'triangle', 0.22);
            else if (n % 2 === 0) snd.tone(523, 0.1, 'triangle', 0.2);
            else snd.tone(392, 0.08, 'sine', 0.18);
            if (n === 12) snd.noise(0.2, 0.15, 400);
          }
          for (let m = 0; m < 4; m++) flash[m] = Math.max(0, flash[m]! - dt * 3.2);
          bg(g, w, h, '#241a5e', '#0c0a28');
          const left = 40 * u;
          const right = w - 10 * u;
          const cw = (right - left) / 12;
          const top = h * 0.36;
          const rowH = Math.min(cw * 1.05, (h - top - 8 * u) / 4);
          // 박 번호 줄 + 튀는 공
          for (let i = 0; i < 12; i++) {
            const x = left + cw * (i + 0.5);
            const cur = i === n - 1;
            txt(g, String(i + 1), x, top - 8 * u, (cur ? 9 : 7) * u, cur ? '#fff' : 'rgba(255,255,255,.45)', 'center', F, 800);
          }
          const bx = left + cw * (((bi % 12) + f) % 12 - 0.5 + 1);
          const wrap = n === 12;
          const fromX = left + cw * (n - 0.5);
          const toX = wrap ? left + cw * 0.5 : left + cw * (n + 0.5);
          const ballX = wrap ? lerp(fromX, toX, ease(f)) : bx;
          const hop = Math.sin(f * Math.PI) * (wrap ? 0.9 : 0.55) * (top - 30 * u);
          const ballY = top - 18 * u - hop;
          const squash = f < 0.12 ? 1 - (0.12 - f) * 2.2 : 1;
          g.fillStyle = 'rgba(0,0,0,.25)';
          g.beginPath();
          g.ellipse(ballX, top - 13 * u, 6 * u * (1 - hop / (top * 1.4)), 1.8 * u, 0, 0, TAU);
          g.fill();
          g.save();
          g.translate(ballX, ballY);
          g.scale(1 / squash, squash);
          g.fillStyle = '#ffd23f';
          g.beginPath();
          g.arc(0, 0, 6 * u, 0, TAU);
          g.fill();
          g.fillStyle = '#fff';
          g.beginPath();
          g.arc(-2 * u, -2 * u, 1.8 * u, 0, TAU);
          g.fill();
          g.restore();
          // 배수 줄
          for (let m = 1; m <= 4; m++) {
            const y = top + rowH * (m - 0.5) + 2 * u;
            const fl = flash[m - 1]!;
            const col = COL[m - 1]!;
            // 북
            const dr = 9 * u * (1 + fl * 0.25);
            g.fillStyle = col;
            g.globalAlpha = 0.35 + 0.65 * fl;
            g.beginPath();
            g.ellipse(left - 20 * u, y, dr, dr * 0.75, 0, 0, TAU);
            g.fill();
            g.globalAlpha = 1;
            txt(g, m === 1 ? '1박' : `×${m}`, left - 20 * u, y, 7 * u, '#0c0a28', 'center', F, 900);
            for (let i = 1; i <= 12; i++) {
              const x = left + cw * (i - 0.5);
              const lit = i % m === 0;
              const passed = i <= n;
              const isNow = i === n && lit;
              const rad = Math.min(cw, rowH) * (lit ? 0.32 : 0.12) * (isNow ? 1 + fl * 0.5 : 1);
              g.fillStyle = lit ? col : 'rgba(255,255,255,.15)';
              g.globalAlpha = lit ? (passed ? 1 : 0.3) : 1;
              g.beginPath();
              g.arc(x, y, rad, 0, TAU);
              g.fill();
              if (isNow) {
                g.globalAlpha = fl * 0.6;
                g.beginPath();
                g.arc(x, y, rad * 2, 0, TAU);
                g.fill();
              }
              g.globalAlpha = 1;
            }
          }
          // 지금 칸 세로 띠
          g.fillStyle = 'rgba(255,255,255,.07)';
          g.fillRect(left + cw * (n - 1), top - 14 * u, cw, rowH * 4 + 16 * u);
          pill(g, `${bpm} BPM`, 10 * u, 13 * u, 8 * u, 'rgba(10,14,40,.6)', '#fff', 'left');
          if (snd.on) pill(g, '♪ 소리 켬', w - 10 * u, 13 * u, 8 * u, '#ff5c8a', '#fff', 'right');
        },
        controls: [
          { type: 'range', label: 'BPM (1분에 몇 박)', min: 50, max: 180, step: 5, value: 100, on: (v) => (bpm = v) },
          { type: 'button', label: '♪ 소리 켜기 · 끄기', on: () => snd.toggle() },
        ] as Control[],
        dispose() {
          snd.dispose();
        },
      };
    },
  },

  /* ───────────────────────── i122 생성 패턴 ───────────────────────── */
  i122: {
    kind: '2d',
    caption: '규칙 몇 줄로 그리는 무늬 — 흐름장(털처럼 흐르는 선) → 보로노이(가장 가까운 점의 세포) → 트루쳇(뒤집히는 타일 미로)',
    make() {
      let mode = 0; // 0 = 자동
      let trail: HTMLCanvasElement | null = null;
      let tkey = '';
      const R = rng(9);
      const parts = Array.from({ length: 700 }, () => ({ x: R(), y: R(), life: R() * 200 }));
      const seeds = Array.from({ length: 15 }, (_, i) => ({ a: R() * TAU, b: R() * TAU, fx: 1 + (i % 3), fy: 1 + ((i * 2) % 3), c: `hsl(${(i * 47) % 360} 85% 70%)` }));
      const tiles = new Map<number, number>();
      const field = (x: number, y: number, t: number): number =>
        (Math.sin(x * 2.3 + Math.sin(y * 1.9 + t * 0.25) * 1.7) + Math.sin(y * 2.9 - t * 0.2 + Math.cos(x * 1.6) * 1.3)) * Math.PI * 0.6;
      const drawFlow = (g: G, w: number, h: number, t: number, dt: number, u: number, d: number): void => {
        const k = `${w}x${h}x${d}`;
        if (!trail || k !== tkey) {
          tkey = k;
          trail = document.createElement('canvas');
          trail.width = Math.round(w * d);
          trail.height = Math.round(h * d);
          const c = trail.getContext('2d')!;
          c.fillStyle = '#0d1030';
          c.fillRect(0, 0, trail.width, trail.height);
        }
        const c = trail.getContext('2d')!;
        c.setTransform(d, 0, 0, d, 0, 0);
        c.fillStyle = 'rgba(13,16,48,.06)';
        c.fillRect(0, 0, w, h);
        c.lineWidth = 1.3 * u;
        c.lineCap = 'round';
        const n = Math.min(parts.length, Math.round(220 * u * u + 60));
        const asp = w / h;
        for (let i = 0; i < n; i++) {
          const p = parts[i]!;
          const a = field(p.x * 3 * asp, p.y * 3, t);
          const sp = 0.0028 * Math.min(3, dt * 60);
          const nx = p.x + (Math.cos(a) * sp) / asp;
          const ny = p.y + Math.sin(a) * sp;
          c.strokeStyle = `hsl(${(a * 57 + 200 + t * 10) % 360} 90% 68%)`;
          c.beginPath();
          c.moveTo(p.x * w, p.y * h);
          c.lineTo(nx * w, ny * h);
          c.stroke();
          p.x = nx;
          p.y = ny;
          p.life -= 1;
          if (p.life < 0 || nx < 0 || nx > 1 || ny < 0 || ny > 1) {
            p.x = Math.random();
            p.y = Math.random();
            p.life = 80 + Math.random() * 160;
          }
        }
        g.drawImage(trail, 0, 0, w, h);
      };
      const drawVoronoi = (g: G, w: number, h: number, t: number, u: number): void => {
        g.fillStyle = '#fff6e8';
        g.fillRect(0, 0, w, h);
        const pts = seeds.map((s) => [w * (0.5 + 0.45 * Math.sin(s.a + t * 0.12 * s.fx)), h * (0.5 + 0.45 * Math.cos(s.b + t * 0.1 * s.fy))] as [number, number]);
        pts.forEach((pnt, i) => {
          let poly: [number, number][] = [
            [0, 0],
            [w, 0],
            [w, h],
            [0, h],
          ];
          pts.forEach((o, j) => {
            if (i !== j && poly.length) poly = clipHalf(poly, pnt[0], pnt[1], o[0], o[1]);
          });
          if (poly.length < 3) return;
          g.beginPath();
          poly.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
          g.closePath();
          g.fillStyle = seeds[i]!.c;
          g.fill();
          g.lineJoin = 'round';
          g.lineWidth = 3.5 * u;
          g.strokeStyle = '#fff6e8';
          g.stroke();
          g.fillStyle = '#2a2060';
          g.beginPath();
          g.arc(pnt[0], pnt[1], 2.6 * u, 0, TAU);
          g.fill();
        });
      };
      const drawTruchet = (g: G, w: number, h: number, t: number, u: number): void => {
        g.fillStyle = '#16205a';
        g.fillRect(0, 0, w, h);
        const s = 22 * u;
        const cols = Math.ceil(w / s) + 1;
        const rows = Math.ceil(h / s) + 1;
        g.lineCap = 'round';
        for (let j = 0; j < rows; j++)
          for (let i = 0; i < cols; i++) {
            const id = j * 997 + i;
            if (!tiles.has(id)) tiles.set(id, (i * 7 + j * 13 + ((i * j) % 5)) % 2);
            const base = tiles.get(id)!;
            // 물결: 가운데에서 거리만큼 늦게 뒤집힘 (4초마다)
            const dd = Math.hypot(i - cols / 2, j - rows / 2) * 0.12;
            const ph = (t / 4 - dd) % 2;
            const flips = Math.floor(t / 4 - dd);
            const fk = easeIO((fract(t / 4 - dd) - 0.75) / 0.25);
            const ty = (base + flips + (((i + j) % 3 === 0) ? 1 : 0) * 0) % 2;
            const x = i * s;
            const y = j * s;
            g.save();
            g.translate(x + s / 2, y + s / 2);
            g.rotate((ty + fk) * (Math.PI / 2) * (ph >= 0 ? 1 : 1));
            g.lineWidth = 4.5 * u;
            const hue = (200 + i * 6 + j * 9 + t * 12) % 360;
            g.strokeStyle = `hsl(${hue} 90% 68%)`;
            g.beginPath();
            g.arc(-s / 2, -s / 2, s / 2, 0, Math.PI / 2);
            g.stroke();
            g.strokeStyle = `hsl(${(hue + 60) % 360} 90% 70%)`;
            g.beginPath();
            g.arc(s / 2, s / 2, s / 2, Math.PI, Math.PI * 1.5);
            g.stroke();
            g.restore();
          }
      };
      const NAMES = ['흐름장', '보로노이', '트루쳇'];
      return {
        draw(g, w, h, t, dt) {
          const u = scaleOf(w, h);
          const d = g.getTransform().a;
          const SEG = 6;
          let cur: number;
          let nxt: number;
          let k = 0;
          if (mode > 0) {
            cur = nxt = mode - 1;
          } else {
            const tc = t / SEG;
            cur = Math.floor(tc) % 3;
            nxt = (cur + 1) % 3;
            k = ease((fract(tc) - 0.88) / 0.12);
          }
          const paint = (m: number): void => {
            if (m === 0) drawFlow(g, w, h, t, dt, u, d);
            else if (m === 1) drawVoronoi(g, w, h, t, u);
            else drawTruchet(g, w, h, t, u);
          };
          paint(cur);
          if (k > 0 && nxt !== cur) {
            g.save();
            g.beginPath();
            g.arc(w / 2, h / 2, k * Math.hypot(w, h) * 0.55, 0, TAU);
            g.clip();
            paint(nxt);
            g.restore();
          }
          if (cur !== 0 && nxt !== 0) trail = null;
          const show = k > 0.5 ? nxt : cur;
          pill(g, NAMES[show]!, 10 * u, 14 * u, 8.5 * u, 'rgba(10,14,40,.72)', '#fff', 'left');
          for (let i = 0; i < 3; i++) {
            g.fillStyle = i === show ? '#ffd23f' : 'rgba(255,255,255,.45)';
            g.beginPath();
            g.arc(w - 30 * u + i * 9 * u, 14 * u, 3 * u, 0, TAU);
            g.fill();
          }
        },
        controls: [{ type: 'range', label: '무늬 (0 = 차례로)', min: 0, max: 3, step: 1, value: 0, on: (v) => (mode = v) }] as Control[],
      };
    },
  },

  /* ───────────────────────── i123 스톱모션 ───────────────────────── */
  i123: {
    kind: '2d',
    caption: '같은 종이 오리기 장면 — 왼쪽 매끈한 60fps · 오른쪽 시간을 12fps 로 끊고 장마다 살짝 흔들어 뚝뚝 손맛',
    make() {
      let fps = 12;
      const paperScene = (g: G, ox: number, hw: number, h: number, tt: number, boil: number, u: number): void => {
        const R = rng(boil * 7 + 3);
        const j = (): number => (boil ? (R() - 0.5) * 1.6 * u : 0);
        g.save();
        g.beginPath();
        g.rect(ox, 0, hw, h);
        g.clip();
        g.translate(ox, 0);
        // 종이 하늘
        g.fillStyle = '#f6e3c4';
        g.fillRect(0, 0, hw, h);
        g.shadowColor = 'rgba(80,50,20,.3)';
        g.shadowOffsetX = 1.5 * u;
        g.shadowOffsetY = 2 * u;
        g.shadowBlur = 2 * u;
        // 해
        g.save();
        g.translate(hw * 0.78 + j(), h * 0.24 + j());
        g.rotate(tt * 0.4 + (boil ? (R() - 0.5) * 0.08 : 0));
        star(g, 0, 0, 15 * u, 0, 10, 0.72);
        g.fillStyle = '#ffb547';
        g.fill();
        g.restore();
        // 구름
        const cx = ((tt * 12 * u) % (hw + 60 * u)) - 30 * u;
        g.fillStyle = '#fffaf0';
        g.beginPath();
        g.arc(cx + j(), h * 0.2, 9 * u, 0, TAU);
        g.arc(cx + 10 * u + j(), h * 0.17, 11 * u, 0, TAU);
        g.arc(cx + 21 * u + j(), h * 0.21, 8 * u, 0, TAU);
        g.fill();
        // 언덕 두 겹 (가위로 자른 듯 들쭉날쭉)
        const hill = (y0: number, amp: number, col: string, ph: number): void => {
          g.fillStyle = col;
          g.beginPath();
          g.moveTo(0, h);
          for (let x = 0; x <= hw + 6; x += 6 * u) g.lineTo(x, y0 - Math.sin(x / (hw * 0.35) + ph) * amp + (boil ? (R() - 0.5) * 1.2 * u : Math.sin(x * 1.7) * 0.6 * u));
          g.lineTo(hw, h);
          g.closePath();
          g.fill();
        };
        hill(h * 0.68, 10 * u, '#9fd36a', 1);
        hill(h * 0.82, 7 * u, '#6dbb4f', 3);
        // 주인공: 종이 별이 폴짝폴짝
        const P = 3.2;
        const p = fract(tt / P);
        const x = -20 * u + p * (hw + 40 * u);
        const hp = fract(p * 4);
        const y = h * 0.74 - Math.sin(hp * Math.PI) * h * 0.26;
        const sq = hp < 0.1 || hp > 0.92 ? 0.8 : 1;
        g.save();
        g.translate(x + j(), y + j());
        g.rotate(Math.sin(hp * TAU) * 0.25 + (boil ? (R() - 0.5) * 0.1 : 0));
        g.scale(1 / sq, sq);
        star(g, 0, -13 * u, 15 * u, 0, 5, 0.5);
        g.fillStyle = '#ff6fa3';
        g.fill();
        g.shadowColor = 'transparent';
        g.fillStyle = '#3a2340';
        g.beginPath();
        g.arc(-4 * u, -14 * u, 1.6 * u, 0, TAU);
        g.arc(4 * u, -14 * u, 1.6 * u, 0, TAU);
        g.fill();
        g.strokeStyle = '#3a2340';
        g.lineWidth = 1.3 * u;
        g.beginPath();
        g.arc(0, -11.5 * u, 2.5 * u, 0.3, Math.PI - 0.3);
        g.stroke();
        g.restore();
        g.restore();
      };
      return {
        draw(g, w, h, t) {
          const u = scaleOf(w, h);
          const hw = w / 2;
          paperScene(g, 0, hw, h, t, 0, u);
          const fi = Math.floor(t * fps);
          paperScene(g, hw, hw, h, fi / fps, fi + 1, u);
          splitLabels(g, w, h, u, '매끈 60fps', `스톱모션 ${fps}fps`);
          // 필름 칸 표시
          g.fillStyle = 'rgba(40,20,10,.55)';
          for (let i = 0; i < 6; i++) g.fillRect(hw + 8 * u + i * 12 * u, h - 9 * u, 7 * u, 4 * u);
          g.fillStyle = '#ffd23f';
          g.fillRect(hw + 8 * u + (fi % 6) * 12 * u, h - 9 * u, 7 * u, 4 * u);
        },
        controls: [{ type: 'range', label: '오른쪽 초당 장 수', min: 4, max: 30, step: 1, value: 12, on: (v) => (fps = v) }] as Control[],
      };
    },
  },

  /* ───────────────────────── i124 오니언 스킨 · 모션 블러 ───────────────────────── */
  i124: {
    kind: '2d',
    caption: '같은 진자 — 왼쪽 0.08초마다 남긴 잔상(가운데일수록 간격이 넓음 = 빠름) · 오른쪽 셔터 동안 겹쳐 그린 모션 블러',
    make() {
      let ghosts = 8;
      let shutter = 0.12;
      const T0 = 2.4;
      const th = (t: number): number => 0.75 * Math.cos((TAU * t) / T0);
      const bob = (g: G, px: number, py: number, L: number, a: number, u: number, col: string, alpha: number, line = true): void => {
        const x = px + Math.sin(a) * L;
        const y = py + Math.cos(a) * L;
        g.globalAlpha = alpha;
        if (line) {
          g.strokeStyle = '#cfd8ff';
          g.lineWidth = 1.5 * u;
          g.beginPath();
          g.moveTo(px, py);
          g.lineTo(x, y);
          g.stroke();
        }
        g.fillStyle = col;
        g.beginPath();
        g.arc(x, y, 10 * u, 0, TAU);
        g.fill();
        g.globalAlpha = 1;
      };
      return {
        draw(g, w, h, t) {
          const u = scaleOf(w, h);
          bg(g, w, h, '#1d2a6a', '#0b1030');
          const hw = w / 2;
          const L = Math.min(h * 0.62, hw * 0.62);
          for (const side of [0, 1]) {
            const px = side ? w * 0.75 : w * 0.25;
            const py = h * 0.2;
            // 받침 · 호
            g.fillStyle = '#8a95c9';
            rr(g, px - 22 * u, py - 5 * u, 44 * u, 5 * u, 2 * u);
            g.fill();
            g.strokeStyle = 'rgba(255,255,255,.12)';
            g.lineWidth = 1.2 * u;
            g.beginPath();
            g.arc(px, py, L, Math.PI / 2 - 0.8, Math.PI / 2 + 0.8);
            g.stroke();
            g.save();
            g.beginPath();
            g.rect(side ? hw : 0, 0, hw, h);
            g.clip();
            if (side === 0) {
              const dtg = 0.08;
              for (let k = ghosts; k >= 1; k--) bob(g, px, py, L, th(t - k * dtg), u, '#7cf0ff', 0.08 + 0.45 * (1 - k / (ghosts + 1)), false);
              for (let k = ghosts; k >= 1; k--) {
                const a = th(t - k * dtg);
                g.fillStyle = 'rgba(255,255,255,.7)';
                g.beginPath();
                g.arc(px + Math.sin(a) * L, py + Math.cos(a) * L, 1.6 * u, 0, TAU);
                g.fill();
              }
              bob(g, px, py, L, th(t), u, '#ffd23f', 1);
            } else {
              const S = 18;
              for (let k = 0; k < S; k++) bob(g, px, py, L, th(t - (k / (S - 1)) * shutter), u, '#ffd23f', k === 0 ? 0.6 : 0.1);
            }
            g.restore();
            g.fillStyle = '#fff';
            g.beginPath();
            g.arc(px, py, 2.5 * u, 0, TAU);
            g.fill();
          }
          splitLabels(g, w, h, u, '오니언 스킨', '모션 블러');
        },
        controls: [
          { type: 'range', label: '잔상 수', min: 0, max: 16, step: 1, value: 8, on: (v) => (ghosts = v) },
          { type: 'range', label: '셔터 길이 (초)', min: 0, max: 0.4, step: 0.01, value: 0.12, on: (v) => (shutter = v) },
        ] as Control[],
      };
    },
  },

  /* ───────────────────────── i125 2D 피사계 심도 ───────────────────────── */
  i125: {
    kind: '2d',
    caption: '층마다 다른 속도로 흐르는 장면에서 초점이 먼 산 → 가운데 마을 → 가까운 숫자 풍선으로 옮겨 가요 — 초점 밖은 흐림',
    make() {
      let layers: HTMLCanvasElement[] = [];
      let key = '';
      let maxBlur = 3.5;
      const build = (w: number, h: number, d: number, u: number): void => {
        const mk = (paint: (c: CanvasRenderingContext2D, W: number) => void): HTMLCanvasElement => {
          const cv = document.createElement('canvas');
          const W = Math.round(w * 2);
          cv.width = Math.round(W * d);
          cv.height = Math.round(h * d);
          const c = cv.getContext('2d')!;
          c.scale(d, d);
          paint(c, W);
          return cv;
        };
        const R = rng(4);
        layers = [
          mk((c, W) => {
            // 먼 산 (주기 W 로 이어짐)
            const ridge = (y0: number, amp: number, col: string, f1: number, f2: number): void => {
              c.fillStyle = col;
              c.beginPath();
              c.moveTo(0, h);
              for (let x = 0; x <= W; x += 4) c.lineTo(x, y0 - amp * (0.6 * Math.sin((x / W) * TAU * f1) + 0.4 * Math.sin((x / W) * TAU * f2 + 1)));
              c.lineTo(W, h);
              c.fill();
            };
            ridge(h * 0.5, 22 * u, '#8e8be0', 3, 7);
            ridge(h * 0.58, 16 * u, '#6f73cf', 4, 9);
            c.fillStyle = '#fff';
            for (let i = 0; i < 6; i++) {
              const x = (i / 6) * W + 20 * u;
              c.globalAlpha = 0.85;
              c.beginPath();
              c.arc(x, h * 0.2 + (i % 2) * 10 * u, 8 * u, 0, TAU);
              c.arc(x + 10 * u, h * 0.18 + (i % 2) * 10 * u, 10 * u, 0, TAU);
              c.arc(x + 20 * u, h * 0.2 + (i % 2) * 10 * u, 7 * u, 0, TAU);
              c.fill();
            }
            c.globalAlpha = 1;
          }),
          mk((c, W) => {
            c.fillStyle = '#4caf6a';
            c.beginPath();
            c.moveTo(0, h);
            for (let x = 0; x <= W; x += 4) c.lineTo(x, h * 0.7 - 5 * u * Math.sin((x / W) * TAU * 5));
            c.lineTo(W, h);
            c.fill();
            const n = 9;
            for (let i = 0; i < n; i++) {
              const x = ((i + 0.3) / n) * W;
              const y = h * 0.7 - 5 * u * Math.sin((x / W) * TAU * 5);
              if (i % 3 === 1) {
                c.fillStyle = ['#ffd6a0', '#ffb3c8', '#bfe3ff'][i % 3]!;
                c.fillRect(x - 11 * u, y - 18 * u, 22 * u, 18 * u);
                c.fillStyle = '#e8545c';
                c.beginPath();
                c.moveTo(x - 14 * u, y - 18 * u);
                c.lineTo(x, y - 30 * u);
                c.lineTo(x + 14 * u, y - 18 * u);
                c.fill();
                c.fillStyle = '#5a3a2a';
                c.fillRect(x - 3 * u, y - 9 * u, 6 * u, 9 * u);
              } else {
                c.fillStyle = '#7a5236';
                c.fillRect(x - 2 * u, y - 14 * u, 4 * u, 14 * u);
                c.fillStyle = i % 2 ? '#2f9e5a' : '#3fbf6a';
                c.beginPath();
                c.arc(x, y - 22 * u, 11 * u, 0, TAU);
                c.fill();
              }
            }
          }),
          mk((c, W) => {
            const n = 5;
            for (let i = 0; i < n; i++) {
              const x = ((i + 0.5) / n) * W + (R() - 0.5) * 30 * u;
              const y = h * (0.42 + R() * 0.2);
              const col = ['#ff6fa3', '#ffd23f', '#5fd6ff', '#a77bff', '#ff9f43'][i]!;
              c.strokeStyle = 'rgba(255,255,255,.8)';
              c.lineWidth = 1.2 * u;
              c.beginPath();
              c.moveTo(x, y + 22 * u);
              c.quadraticCurveTo(x + 6 * u, y + 50 * u, x, h + 10);
              c.stroke();
              c.fillStyle = col;
              c.beginPath();
              c.ellipse(x, y, 19 * u, 23 * u, 0, 0, TAU);
              c.fill();
              c.fillStyle = 'rgba(255,255,255,.45)';
              c.beginPath();
              c.ellipse(x - 7 * u, y - 9 * u, 5 * u, 7 * u, -0.4, 0, TAU);
              c.fill();
              c.font = `400 ${22 * u}px ${TF}`;
              c.textAlign = 'center';
              c.textBaseline = 'middle';
              c.fillStyle = '#fff';
              c.fillText(String([2, 4, 6, 8, 10][i]), x, y + 2 * u);
            }
            // 앞 풀
            c.fillStyle = '#2d7d46';
            for (let x = 0; x < W; x += 5 * u) {
              c.beginPath();
              c.moveTo(x, h);
              c.lineTo(x + 2.5 * u, h - (8 + 6 * Math.abs(Math.sin(x * 0.37))) * u);
              c.lineTo(x + 5 * u, h);
              c.fill();
            }
          }),
        ];
      };
      const NAMES = ['먼 산', '가운데 마을', '가까운 풍선'];
      return {
        draw(g, w, h, t) {
          const u = scaleOf(w, h);
          const d = g.getTransform().a;
          const k = `${w}x${h}x${d}`;
          if (k !== key) {
            key = k;
            build(w, h, d, u);
          }
          const sky = g.createLinearGradient(0, 0, 0, h);
          sky.addColorStop(0, '#9fd8ff');
          sky.addColorStop(1, '#ffe0f0');
          g.fillStyle = sky;
          g.fillRect(0, 0, w, h);
          // 초점: 0 → 1 → 2 → 1 → 0 … 머무르며
          const P = 12;
          const p = fract(t / P) * 4;
          const seg = Math.floor(p);
          const fk = ease((p - seg - 0.6) / 0.4);
          const stops = [0, 1, 2, 1, 0];
          const focus = lerp(stops[seg]!, stops[seg + 1]!, fk);
          const speeds = [6, 16, 34];
          layers.forEach((cv, i) => {
            const W = w * 2;
            const off = (t * speeds[i]! * u) % W;
            const b = Math.abs(i - focus) * maxBlur * u;
            g.filter = b > 0.2 ? `blur(${b.toFixed(1)}px)` : 'none';
            g.drawImage(cv, -off, 0, W, h);
            g.drawImage(cv, W - off, 0, W, h);
          });
          g.filter = 'none';
          // 초점 눈금
          const sx = w - 14 * u;
          const top = h * 0.3;
          const bot = h * 0.78;
          rr(g, sx - 5 * u, top - 8 * u, 10 * u, bot - top + 16 * u, 5 * u);
          g.fillStyle = 'rgba(10,14,40,.5)';
          g.fill();
          for (let i = 0; i < 3; i++) {
            g.fillStyle = 'rgba(255,255,255,.6)';
            g.beginPath();
            g.arc(sx, lerp(top, bot, i / 2), 2 * u, 0, TAU);
            g.fill();
          }
          g.strokeStyle = '#ffd23f';
          g.lineWidth = 2 * u;
          g.beginPath();
          g.arc(sx, lerp(top, bot, focus / 2), 5 * u, 0, TAU);
          g.stroke();
          pill(g, `초점: ${NAMES[Math.round(focus)]}`, 10 * u, 14 * u, 8.5 * u, 'rgba(10,14,40,.72)', '#fff', 'left');
        },
        controls: [{ type: 'range', label: '최대 흐림', min: 0, max: 12, step: 0.5, value: 3.5, on: (v) => (maxBlur = v) }] as Control[],
      };
    },
  },

  /* ───────────────────────── i126 점 속으로 · 렌즈 포털 ───────────────────────── */
  i126: {
    kind: '2d',
    caption: '수직선의 1/3 자리로 끝없이 확대 — 원 창(포털)이 커지며 다음 세계로: 0.3 → 0.33 → 0.333 …',
    make() {
      const THEMES = [
        ['#1d2b6b', '#2f49b0'],
        ['#4a1f6b', '#8a3fb0'],
        ['#0f4d5c', '#1f8aa0'],
        ['#5c2a1f', '#b0563f'],
      ];
      let speed = 1;
      let ph = 0;
      return {
        draw(g, w, h, _t, dt) {
          const u = scaleOf(w, h);
          ph += (dt * speed) / 3.2;
          const lv = Math.floor(ph);
          const p = ph - lv;
          const level = lv % 5;
          const S = Math.pow(10, p);
          const x0 = w * 0.1;
          const L = w * 0.8;
          const Xs = x0 + L / 3;
          const Ly = h * 0.55;
          const theme = (k: number): string[] => THEMES[((k % 4) + 4) % 4]!;
          const paintBg = (k: number): void => {
            const [a, b] = theme(k);
            const gr = g.createRadialGradient(Xs, Ly, 0, Xs, Ly, Math.hypot(w, h));
            gr.addColorStop(0, b!);
            gr.addColorStop(1, a!);
            g.fillStyle = gr;
            g.fillRect(0, 0, w, h);
          };
          paintBg(lv);
          // 포털: 다음 세계가 원 창으로 커짐
          const D = Math.hypot(w, h);
          const r0 = 4 * u;
          const pr = r0 * Math.pow(D / r0, p);
          g.save();
          g.beginPath();
          g.arc(Xs, Ly, pr, 0, TAU);
          g.clip();
          paintBg(lv + 1);
          g.restore();
          g.strokeStyle = 'rgba(255,255,255,.75)';
          g.lineWidth = 2.5 * u;
          g.beginPath();
          g.arc(Xs, Ly, pr, 0, TAU);
          g.stroke();
          g.strokeStyle = 'rgba(255,230,140,.35)';
          g.lineWidth = 7 * u;
          g.stroke();
          // 수직선
          const X = (uu: number): number => Xs + (uu - 1 / 3) * L * S;
          g.strokeStyle = '#fff';
          g.lineWidth = 2.5 * u;
          g.beginPath();
          g.moveTo(0, Ly);
          g.lineTo(w, Ly);
          g.stroke();
          const labelA = lv % 5 === 4 && p > 0.85 ? 1 - (p - 0.85) / 0.15 : level === 0 && p < 0.15 && lv > 0 ? p / 0.15 : 1;
          const step = Math.pow(10, -level);
          const a0 = Math.floor(Math.pow(10, level) / 3) / Math.pow(10, level);
          const label = (v: number, dig: number): string => (dig === 0 ? String(Math.round(v)) : v.toFixed(dig));
          const tick = (uu: number, len: number, alpha: number, lab: string | null, size: number): void => {
            const x = X(uu);
            if (x < -40 || x > w + 40) return;
            g.globalAlpha = alpha;
            g.strokeStyle = '#fff';
            g.lineWidth = 2 * u;
            g.beginPath();
            g.moveTo(x, Ly - len);
            g.lineTo(x, Ly + len);
            g.stroke();
            if (lab) txt(g, lab, x, Ly + len + size * 0.9, size, '#fff', 'center', F, 800);
            g.globalAlpha = 1;
          };
          const busy = w < 500;
          for (let j = 0; j <= 10; j++) {
            const v = a0 + (j / 10) * step;
            const showLab = !busy || j % 5 === 0 || j === 3 || j === 4;
            const dig = level === 0 && (j === 0 || j === 10) ? 0 : level + 1;
            tick(j / 10, (j % 5 === 0 ? 9 : 6) * u, 1, showLab ? label(v, dig) : null, 8 * u * Math.min(1.3, 0.9 + p * 0.3));
          }
          const na = clamp01((S - 2) / 5);
          for (let j = 1; j < 10; j++) {
            const v = a0 + (0.3 + j / 100) * step;
            const showLab = !busy || j === 3 || j === 5;
            tick(0.3 + j / 100, 4 * u + na * 2 * u, na, showLab && na > 0.3 ? label(v, level + 2) : null, 7 * u);
          }
          g.globalAlpha = labelA;
          // 목표 점 1/3
          const pulse = 1 + 0.3 * Math.sin(ph * 9);
          g.fillStyle = '#ffd23f';
          g.beginPath();
          g.arc(Xs, Ly, 4 * u * pulse, 0, TAU);
          g.fill();
          g.globalAlpha = 1;
          const digits = '0.' + '3'.repeat(level + 1);
          pill(g, `1/3 = ${digits}…`, w / 2, 16 * u, 10 * u, 'rgba(10,14,40,.7)', '#ffe27a');
          pill(g, `×${Math.round(Math.pow(10, level) * S).toLocaleString()} 확대`, 10 * u, h - 13 * u, 7.5 * u, 'rgba(255,255,255,.18)', '#fff', 'left');
        },
        controls: [{ type: 'range', label: '빨려 드는 빠르기', min: 0.2, max: 3, step: 0.1, value: 1, on: (v) => (speed = v) }] as Control[],
      };
    },
  },

  /* ───────────────────────── i127 타임라인 연출 ───────────────────────── */
  i127: {
    kind: '2d',
    caption: '장면 · 키프레임 · 효과음을 한 시간표에 — 재생 막대가 지나는 프레임 번호로 그림을 「계산해서」 그리고, ♪ 표시에서 소리',
    make() {
      const FPS = 30;
      const TOTAL = 150;
      const snd = new Blip();
      const SFX: [number, string, () => void][] = [
        [2, '휙', () => snd.noise(0.25, 0.12, 1800)],
        [30, '뿅', () => snd.tone(520, 0.15, 'square', 0.12, 2)],
        [52, '뿅', () => snd.tone(620, 0.15, 'square', 0.12, 2)],
        [74, '뿅', () => snd.tone(720, 0.15, 'square', 0.12, 2)],
        [96, '쾅', () => (snd.tone(110, 0.3, 'sine', 0.4, 0.5), snd.noise(0.12, 0.2, 200))],
        [104, '딩동', () => (snd.tone(988, 0.25, 'triangle', 0.2), setTimeout(() => snd.tone(784, 0.35, 'triangle', 0.2), 150))],
      ];
      const SCENES: [number, number, string, string][] = [
        [0, 30, '등장', '#5fd6ff'],
        [30, 96, '문제', '#a77bff'],
        [96, 150, '정답', '#ff6fa3'],
      ];
      const KEYS = [0, 24, 30, 52, 74, 96, 104, 140];
      let lastF = -1;
      let speed = 1;
      let ph = 0;
      // 그림 = 프레임의 함수 (시간을 옮겨 놓고 찍기)
      const renderFrame = (g: G, f: number, x: number, y: number, w: number, h: number, u: number): void => {
        g.save();
        g.beginPath();
        rr(g, x, y, w, h, 8 * u);
        g.clip();
        const gr = g.createLinearGradient(0, y, 0, y + h);
        gr.addColorStop(0, '#2a3a8a');
        gr.addColorStop(1, '#141c4a');
        g.fillStyle = gr;
        g.fillRect(x, y, w, h);
        const cx = x + w / 2;
        const cy = y + h / 2;
        const fade = 1 - clamp01((f - 138) / 12);
        g.globalAlpha = fade;
        // 별이 날아와 자리 잡음 (0~24)
        const sk = easeOutBack(f / 24);
        const sx = lerp(x - 20 * u, x + 22 * u, sk);
        g.save();
        g.translate(sx, y + 20 * u);
        g.rotate((1 - clamp01(f / 24)) * -4 + Math.sin(f / 8) * 0.1);
        star(g, 0, 0, 10 * u);
        g.fillStyle = '#ffd23f';
        g.fill();
        g.restore();
        // 3 + 4 = ? 한 기호씩 (30 · 52 · 74)
        const parts: [string, number][] = [
          ['3 + 4', 30],
          ['=', 52],
          ['?', 74],
        ];
        const fs = Math.min(h * 0.3, w * 0.13);
        const xs = [cx - fs * 1.1, cx + fs * 0.55, cx + fs * 1.35];
        parts.forEach(([s, f0], i) => {
          const k = easeOutBack((f - f0) / 10);
          if (f < f0) return;
          const isQ = i === 2;
          if (isQ && f >= 96) return;
          g.save();
          g.translate(xs[i]!, cy);
          g.scale(k, k);
          txt(g, s, 0, 0, fs, isQ ? '#ffd23f' : '#fff', 'center', TF, 400);
          g.restore();
        });
        // 7 이 쾅 (96)
        if (f >= 96) {
          const k = clamp01((f - 96) / 6);
          const sc = lerp(2.4, 1, k);
          const shake = f < 104 ? Math.sin(f * 3) * 2 * u : 0;
          g.save();
          g.translate(xs[2]! + shake, cy);
          g.scale(sc, sc);
          g.globalAlpha = fade * k;
          txt(g, '7', 0, 0, fs, '#ff6fa3', 'center', TF, 400);
          g.restore();
          g.globalAlpha = fade;
          // 도장 원 + 꽃가루
          if (f >= 104) {
            const k2 = clamp01((f - 104) / 8);
            g.strokeStyle = `rgba(255,111,163,${1 - k2 * 0.4})`;
            g.lineWidth = 2.5 * u;
            g.beginPath();
            g.arc(xs[2]!, cy, fs * (0.55 + k2 * 0.1), 0, TAU);
            g.stroke();
            const R = rng(5);
            for (let i = 0; i < 24; i++) {
              const a = R() * TAU;
              const sp = (30 + R() * 60) * u;
              const tt = (f - 104) / FPS;
              const px = xs[2]! + Math.cos(a) * sp * tt;
              const py = cy + Math.sin(a) * sp * tt + 60 * u * tt * tt;
              g.fillStyle = ['#ffd23f', '#5fd6ff', '#ff6fa3', '#44f0a8'][i % 4]!;
              g.fillRect(px, py, 3 * u, 3 * u);
            }
          }
        }
        g.restore();
      };
      return {
        draw(g, w, h, _t, dt) {
          const u = scaleOf(w, h);
          ph += (dt * speed * FPS) / TOTAL;
          const f = Math.floor(fract(ph) * TOTAL);
          if (f !== lastF) {
            for (const [sf, , play] of SFX) if ((lastF < sf && f >= sf) || (lastF > f && f >= sf)) play();
            lastF = f;
          }
          bg(g, w, h, '#151a3a', '#0a0d22');
          const pad = 8 * u;
          const ph2 = h * 0.52;
          renderFrame(g, f, pad, pad, w - pad * 2, ph2 - pad, u);
          // 효과음 말풍선 (미리보기 위)
          for (const [sf, name] of SFX) {
            const k = (f - sf) / 12;
            if (k >= 0 && k < 1) {
              const a = 1 - k;
              g.globalAlpha = a;
              pill(g, `♪ ${name}!`, w - pad - 6 * u, pad + 12 * u + k * -6 * u, 8 * u, '#ff5c8a', '#fff', 'right');
              g.globalAlpha = 1;
            }
          }
          txt(g, `프레임 ${String(f).padStart(3, '0')} / ${TOTAL} · ${FPS}fps`, pad + 6 * u, ph2 - 8 * u, 7 * u, 'rgba(255,255,255,.75)', 'left', F, 700);
          // 시간표
          const tx = pad + 34 * u;
          const tw = w - pad - tx;
          const ty = ph2 + 8 * u;
          const th = (h - ty - pad) / 3;
          const X = (fr: number): number => tx + (fr / TOTAL) * tw;
          const rowsN = ['장면', '키', '소리'];
          rowsN.forEach((nm, i) => {
            const y = ty + th * i;
            rr(g, tx, y + 2 * u, tw, th - 4 * u, 4 * u);
            g.fillStyle = 'rgba(255,255,255,.06)';
            g.fill();
            txt(g, nm, pad + 2 * u, y + th / 2, 7.5 * u, 'rgba(255,255,255,.7)', 'left', F, 800);
          });
          for (const [a, b, nm, col] of SCENES) {
            const on = f >= a && f < b;
            rr(g, X(a) + 1, ty + 3 * u, X(b) - X(a) - 2, th - 6 * u, 4 * u);
            g.fillStyle = on ? col : col + '66';
            g.fill();
            txt(g, nm, (X(a) + X(b)) / 2, ty + th / 2, 7 * u, on ? '#0a0d22' : '#fff', 'center', F, 800);
          }
          for (const kf of KEYS) {
            const x = X(kf);
            const y = ty + th * 1.5;
            const near = Math.abs(f - kf) < 4;
            const s = (near ? 4.5 : 3.2) * u;
            g.fillStyle = near ? '#ffd23f' : '#cfd8ff';
            g.beginPath();
            g.moveTo(x, y - s);
            g.lineTo(x + s, y);
            g.lineTo(x, y + s);
            g.lineTo(x - s, y);
            g.closePath();
            g.fill();
          }
          for (const [sf, name] of SFX) {
            const x = X(sf);
            const y = ty + th * 2.5;
            const hit = f >= sf && f - sf < 10;
            const r = (hit ? 6 : 4) * u;
            g.fillStyle = hit ? '#ff5c8a' : 'rgba(255,92,138,.55)';
            g.beginPath();
            g.arc(x, y, r, 0, TAU);
            g.fill();
            if (!(w < 400 && name === '딩동')) txt(g, '♪', x, y, 6 * u, '#fff', 'center', F, 900);
          }
          // 재생 막대
          const px = X(f);
          g.fillStyle = '#ffd23f';
          g.fillRect(px - 1 * u, ty, 2 * u, th * 3);
          g.beginPath();
          g.moveTo(px - 4 * u, ty - 4 * u);
          g.lineTo(px + 4 * u, ty - 4 * u);
          g.lineTo(px, ty + 1 * u);
          g.fill();
          if (snd.on) pill(g, '♪ 소리 켬', pad + 6 * u, pad + 12 * u, 7 * u, '#ff5c8a', '#fff', 'left');
        },
        controls: [
          { type: 'range', label: '재생 빠르기', min: 0.25, max: 2, step: 0.25, value: 1, on: (v) => (speed = v) },
          { type: 'button', label: '♪ 효과음 켜기 · 끄기', on: () => snd.toggle() },
        ] as Control[],
        dispose() {
          snd.dispose();
        },
      };
    },
  },
};

import * as THREE from 'three';
import type { Control, Demo3D, DemoDom, DemoMap } from './types';

/**
 * 수학 원리 · 수와 변화 · 도형 (i408 ~ i417) — 「원리가 눈에 보이는」 견본 (demosMathA · B 와 같은 결).
 * 2D 는 kind 'dom' + 캔버스 하나: 280 × 175 설계 좌표로 그리고 화면에 맞춰 확대한다.
 * 큰 화면(폭 420 이상)에서만 직접 끌기 · 누르기가 된다. i415 공간 벡터만 3D (공유 renderer).
 * 확률 견본(i412)은 Math.random 으로 실제 시행하고, 화면의 모든 숫자는 그 순간의 실제 계산값이다.
 */

type G = CanvasRenderingContext2D;
type Tok = string | string[];

const F = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
const ACC = '#ffc04a';
const accA = (a: number): string => `rgba(255,192,74,${a})`;
const INK = '#f2f4ff';
const inkA = (a: number): string => `rgba(232,238,255,${a})`;
const COOL = '#9fc0ff';
const coolA = (a: number): string => `rgba(159,192,255,${a})`;
const DARK = '#160f04';
const RED = '#ff6f6f';
const BLUE = '#6aa7ff';
const TAU = Math.PI * 2;

const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const smooth = (e0: number, e1: number, x: number): number => {
  const v = clamp((x - e0) / (e1 - e0), 0, 1);
  return v * v * (3 - 2 * v);
};
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
/** 소수 한 자리까지 — 음수는 진짜 빼기 기호 */
const f1 = (v: number): string => {
  const r = Math.round(v * 10) / 10;
  const s = String(Math.abs(r) < 1e-9 ? 0 : Math.abs(r));
  return (r < -1e-9 ? '−' : '') + s;
};
const fN = (v: number, d: number): string => (v < -1e-9 ? '−' : '') + Math.abs(v).toFixed(d);
const font = (px: number, wt = 600, it = false): string => `${it ? 'italic ' : ''}${wt} ${px}px ${F}`;
const rint = (a: number, b: number): number => a + Math.floor(Math.random() * (b - a + 1));

/* ───────── 수식 글자: 위첨자 · 아래첨자 · 분수 · 기울임 · 색 ───────── */
function piece(g: G, tk: Tok, x: number, y: number, size: number, color: string, wt: number, draw: boolean): number {
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  if (typeof tk === 'string') {
    g.font = font(size, wt);
    const w = g.measureText(tk).width;
    if (draw) {
      g.fillStyle = color;
      g.fillText(tk, x, y);
    }
    return w;
  }
  const k = tk[0] ?? '';
  if (k === 'i' || k === 'ic' || k === 'c') {
    const s = (k === 'i' ? tk[1] : tk[2]) ?? '';
    const col = k === 'i' ? color : tk[1] ?? color;
    g.font = font(size, wt, k !== 'c');
    const w = g.measureText(s).width + (k !== 'c' ? size * 0.06 : 0);
    if (draw) {
      g.fillStyle = col;
      g.fillText(s, x, y);
    }
    return w;
  }
  if (k === '^' || k === '_') {
    const s = tk[1] ?? '';
    const col = tk[2] ?? color;
    const fs = size * 0.62;
    g.font = font(fs, wt);
    const w = g.measureText(s).width + size * 0.05;
    if (draw) {
      g.fillStyle = col;
      g.fillText(s, x + size * 0.02, y + (k === '^' ? -size * 0.36 : size * 0.27));
    }
    return w;
  }
  if (k === '/') {
    const a = tk[1] ?? '';
    const b = tk[2] ?? '';
    const col = tk[3] ?? color;
    const fs = size * 0.74;
    g.font = font(fs, wt);
    const wa = g.measureText(a).width;
    const wb = g.measureText(b).width;
    const W = Math.max(wa, wb) + size * 0.34;
    if (draw) {
      g.fillStyle = col;
      g.textAlign = 'center';
      g.fillText(a, x + size * 0.06 + W / 2, y - size * 0.44);
      g.fillText(b, x + size * 0.06 + W / 2, y + size * 0.5);
      g.fillRect(x + size * 0.1, y - size * 0.03, W - size * 0.08, Math.max(0.6, size * 0.075));
      g.textAlign = 'left';
    }
    return W + size * 0.14;
  }
  return 0;
}
function mtext(g: G, toks: Tok[], x: number, y: number, size: number, align: 'l' | 'c' | 'r' = 'l', color = INK, wt = 600): number {
  let total = 0;
  for (const tk of toks) total += piece(g, tk, 0, 0, size, color, wt, false);
  let cx = align === 'c' ? x - total / 2 : align === 'r' ? x - total : x;
  for (const tk of toks) cx += piece(g, tk, cx, y, size, color, wt, true);
  return total;
}
function text(g: G, s: string, x: number, y: number, size: number, color = INK, align: CanvasTextAlign = 'left', wt = 600): void {
  g.font = font(size, wt);
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(s, x, y);
}
function rr(g: G, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + k, y);
  g.arcTo(x + w, y, x + w, y + h, k);
  g.arcTo(x + w, y + h, x, y + h, k);
  g.arcTo(x, y + h, x, y, k);
  g.arcTo(x, y, x + w, y, k);
  g.closePath();
}
function pill(g: G, s: string, x: number, y: number, size: number, col = ACC, align: 'l' | 'c' = 'l'): number {
  g.font = font(size, 700);
  const w = g.measureText(s).width + size * 1.3;
  const x0 = align === 'c' ? x - w / 2 : x;
  rr(g, x0, y - size * 0.85, w, size * 1.7, size * 0.85);
  g.fillStyle = col === ACC ? accA(0.12) : inkA(0.06);
  g.fill();
  g.strokeStyle = col === ACC ? accA(0.55) : inkA(0.25);
  g.lineWidth = 0.7;
  g.stroke();
  text(g, s, x0 + size * 0.65, y + 0.3, size, col, 'left', 700);
  return w;
}
/** 식 상자 (짙은 바탕 둥근 띠 + 가운데 수식) */
function eqBox(g: G, toks: Tok[], cx: number, cy: number, size: number, minW = 60): void {
  const w = Math.max(minW, mtext(g, toks, -9999, -9999, size, 'l', INK, 700) + size * 1.6);
  rr(g, cx - w / 2, cy - size * 0.85, w, size * 1.7, size * 0.85);
  g.fillStyle = 'rgba(10,14,32,0.72)';
  g.fill();
  g.strokeStyle = inkA(0.13);
  g.lineWidth = 0.6;
  g.stroke();
  mtext(g, toks, cx, cy + 0.3, size, 'c', INK, 700);
}
function accFill(g: G, y0: number, y1: number, a = 1): CanvasGradient {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, `rgba(255,214,128,${a})`);
  gr.addColorStop(1, `rgba(240,160,40,${a})`);
  return gr;
}
function arrow(g: G, x0: number, y0: number, x1: number, y1: number, col: string, lw: number, head: number): void {
  const a = Math.atan2(y1 - y0, x1 - x0);
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 0.5) return;
  const hh = Math.min(head, len * 0.6);
  g.strokeStyle = col;
  g.fillStyle = col;
  g.lineWidth = lw;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1 - Math.cos(a) * hh * 0.7, y1 - Math.sin(a) * hh * 0.7);
  g.stroke();
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x1 - Math.cos(a - 0.42) * hh, y1 - Math.sin(a - 0.42) * hh);
  g.lineTo(x1 - Math.cos(a + 0.42) * hh, y1 - Math.sin(a + 0.42) * hh);
  g.closePath();
  g.fill();
}
function glowDot(g: G, x: number, y: number, r: number, col = ACC): void {
  const gr = g.createRadialGradient(x, y, 0, x, y, r * 3.2);
  gr.addColorStop(0, col === ACC ? accA(0.45) : coolA(0.45));
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, r * 3.2, 0, TAU);
  g.fill();
  g.fillStyle = col;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.beginPath();
  g.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, TAU);
  g.fill();
}
/** 색 공 (빨강 · 파랑 — 확률 나무) */
function ball(g: G, x: number, y: number, r: number, red: boolean, a = 1): void {
  g.globalAlpha = a;
  const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  gr.addColorStop(0, red ? '#ffc0b8' : '#cfe3ff');
  gr.addColorStop(0.45, red ? RED : BLUE);
  gr.addColorStop(1, red ? '#a3262e' : '#2a4f9c');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
  g.globalAlpha = 1;
}
function dashLine(g: G, x0: number, y0: number, x1: number, y1: number, col: string, lw = 0.7, dash: number[] = [2, 2]): void {
  g.setLineDash(dash);
  g.strokeStyle = col;
  g.lineWidth = lw;
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
  g.setLineDash([]);
}
function resetG(g: G): void {
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.lineWidth = 1;
  g.setLineDash([]);
  g.lineCap = 'butt';
  g.lineJoin = 'miter';
  g.shadowBlur = 0;
}
/** 분수 토큰 (약분한 꼴) */
function fracTok(a: number, b: number, col?: string): Tok {
  const d = gcd(a, b) || 1;
  const p = a / d;
  const q = b / d;
  if (q === 1) return col ? ['c', col, String(p)] : String(p);
  return col ? ['/', String(p), String(q), col] : ['/', String(p), String(q)];
}

/* ───────── 캔버스 틀 (설계 좌표 280 × 175) ───────── */
interface App {
  draw(g: G, t: number, dt: number, big: boolean): void;
  controls?: Control[];
  down?(x: number, y: number): void;
  move?(x: number, y: number, pressed: boolean): string | void;
  up?(): void;
  dispose?(): void;
}
function cv(caption: string, make: () => App): DemoDom {
  return {
    kind: 'dom',
    caption,
    make(box) {
      const c = document.createElement('canvas');
      c.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;';
      box.appendChild(c);
      const g = c.getContext('2d')!;
      const app = make();
      let big = false;
      let pressed = false;
      let ox = 0;
      let oy = 0;
      let u = 1;
      const toD = (e: PointerEvent): [number, number] => {
        const r = c.getBoundingClientRect();
        return [(e.clientX - r.left - ox) / u, (e.clientY - r.top - oy) / u];
      };
      const onDown = (e: PointerEvent): void => {
        if (!big || !app.down) return;
        pressed = true;
        try {
          c.setPointerCapture(e.pointerId);
        } catch {
          /* 무시 */
        }
        const [x, y] = toD(e);
        app.down(x, y);
      };
      const onMove = (e: PointerEvent): void => {
        if (!big || !app.move) return;
        const [x, y] = toD(e);
        const cur = app.move(x, y, pressed);
        c.style.cursor = cur || 'default';
      };
      const onUp = (): void => {
        if (!pressed) return;
        pressed = false;
        app.up?.();
      };
      c.addEventListener('pointerdown', onDown);
      c.addEventListener('pointermove', onMove);
      c.addEventListener('pointerup', onUp);
      c.addEventListener('pointercancel', onUp);
      return {
        controls: app.controls,
        update(t, dt) {
          const w = Math.max(1, box.clientWidth);
          const h = Math.max(1, box.clientHeight);
          big = w >= 420;
          const dpr = Math.min(devicePixelRatio || 1, big ? 2 : 1.5);
          const W = Math.round(w * dpr);
          const H = Math.round(h * dpr);
          if (c.width !== W || c.height !== H) {
            c.width = W;
            c.height = H;
          }
          u = Math.min(w / 280, h / 175);
          ox = (w - 280 * u) / 2;
          oy = (h - 175 * u) / 2;
          g.setTransform(dpr, 0, 0, dpr, 0, 0);
          resetG(g);
          const bg = g.createLinearGradient(0, 0, w * 0.3, h);
          bg.addColorStop(0, '#111a36');
          bg.addColorStop(1, '#070a17');
          g.fillStyle = bg;
          g.fillRect(0, 0, w, h);
          const rg = g.createRadialGradient(w * 0.22, -h * 0.1, 0, w * 0.22, -h * 0.1, Math.max(w, h) * 0.9);
          rg.addColorStop(0, 'rgba(110,130,230,0.16)');
          rg.addColorStop(1, 'rgba(110,130,230,0)');
          g.fillStyle = rg;
          g.fillRect(0, 0, w, h);
          g.setTransform(dpr * u, 0, 0, dpr * u, dpr * ox, dpr * oy);
          app.draw(g, t, Math.min(Math.max(dt, 0), 0.1), big);
          resetG(g);
        },
        dispose() {
          c.removeEventListener('pointerdown', onDown);
          c.removeEventListener('pointermove', onMove);
          c.removeEventListener('pointerup', onUp);
          c.removeEventListener('pointercancel', onUp);
          app.dispose?.();
          c.remove();
        },
      };
    },
  };
}

/* ═════════════════════════ i408 방정식 저울 ═════════════════════════ */
interface Pan {
  x: number;
  c: number;
}
const i408 = cv('양쪽에서 똑같이 빼고 똑같이 나누면 저울은 다시 수평 — 한쪽만 빼면 기운다, 끝에 x 혼자 (큰 화면: 상자 · 추를 끌어 올리고 내리기)', () => {
  interface Step {
    L: Pan;
    R: Pan;
    say: string;
  }
  interface Eq {
    L: Pan;
    R: Pan;
    sol: number;
  }
  function gen(): Eq {
    for (let n = 0; n < 500; n++) {
      const sol = rint(1, 4);
      const c = rint(0, 2);
      const k = rint(1, 3);
      const a = c + k;
      const b = rint(0, 4);
      const d = b + k * sol;
      if (a <= 4 && d <= 10 && (c > 0 || b > 0) && (c > 0 || k > 1)) return { L: { x: a, c: b }, R: { x: c, c: d }, sol };
    }
    return { L: { x: 3, c: 2 }, R: { x: 1, c: 8 }, sol: 3 };
  }
  function steps(e: Eq): Step[] {
    const out: Step[] = [{ L: { ...e.L }, R: { ...e.R }, say: '처음 식 — 저울이 수평' }];
    let L = { ...e.L };
    let R = { ...e.R };
    if (R.x > 0) {
      const n = R.x;
      L = { x: L.x - n, c: L.c };
      R = { x: 0, c: R.c };
      out.push({ L, R, say: `양쪽에서 x ${n}개씩 빼기` });
    }
    if (L.c > 0) {
      const n = L.c;
      L = { x: L.x, c: 0 };
      R = { x: R.x, c: R.c - n };
      out.push({ L, R, say: `양쪽에서 ${n}씩 빼기` });
    }
    if (L.x > 1) {
      const n = L.x;
      out.push({ L: { x: 1, c: 0 }, R: { x: 0, c: R.c / n }, say: `양쪽을 똑같이 ${n}묶음으로 나눠 하나만` });
    }
    return out;
  }
  const BOX = 13;
  const UNIT = 8.6;
  const PX = 140;
  const PY = 58;
  const ARM = 84;
  const STR = 42;
  type It = { k: 'x' | 'c'; dx: number; dy: number };
  function layout(p: Pan): It[] {
    const out: It[] = [];
    let y = 0;
    if (p.x > 0) {
      const w = p.x * (BOX + 1.5) - 1.5;
      for (let i = 0; i < p.x; i++) out.push({ k: 'x', dx: -w / 2 + i * (BOX + 1.5) + BOX / 2, dy: 0 });
      y = BOX + 1.5;
    }
    let left = p.c;
    let row = 0;
    while (left > 0) {
      const n = Math.min(7, left);
      const w = n * UNIT + (n - 1) * 0.8;
      for (let i = 0; i < n; i++) out.push({ k: 'c', dx: -w / 2 + i * (UNIT + 0.8) + UNIT / 2, dy: y + row * (UNIT + 0.8) });
      left -= n;
      row++;
    }
    return out;
  }
  function boxItem(g: G, cx: number, by: number, a: number, label: string): void {
    g.globalAlpha = a;
    const s = BOX;
    rr(g, cx - s / 2, by - s, s, s, 2.2);
    const gr = g.createLinearGradient(0, by - s, 0, by);
    gr.addColorStop(0, '#a9c9ff');
    gr.addColorStop(1, '#4870c4');
    g.fillStyle = gr;
    g.fill();
    g.strokeStyle = 'rgba(225,238,255,0.85)';
    g.lineWidth = 0.6;
    g.stroke();
    mtext(g, [['i', 'x']], cx, by - s / 2 + 0.2, 9, 'c', '#0d1733', 800);
    if (label) text(g, label, cx + s / 2 - 1.2, by - s + 2.6, 3.8, '#0d1733', 'right', 800);
    g.globalAlpha = 1;
  }
  function unitItem(g: G, cx: number, by: number, a: number): void {
    const w = UNIT - 0.6;
    const h = UNIT - 1.2;
    g.globalAlpha = a;
    g.beginPath();
    g.arc(cx, by - h - 0.4, 1.4, Math.PI, 0);
    g.strokeStyle = ACC;
    g.lineWidth = 0.8;
    g.stroke();
    rr(g, cx - w / 2, by - h, w, h, 1.6);
    g.fillStyle = accFill(g, by - h, by);
    g.fill();
    g.strokeStyle = 'rgba(255,240,200,0.7)';
    g.lineWidth = 0.45;
    g.stroke();
    text(g, '1', cx, by - h / 2 + 0.3, 5.4, DARK, 'center', 800);
    g.globalAlpha = 1;
  }
  function sideTok(p: Pan): Tok[] {
    const t: Tok[] = [];
    if (p.x > 0) {
      if (p.x !== 1) t.push(String(p.x));
      t.push(['ic', COOL, 'x']);
    }
    if (p.c > 0) {
      if (t.length) t.push(' + ');
      t.push(['c', ACC, String(p.c)]);
    }
    if (!t.length) t.push('0');
    return t;
  }

  let eq = gen();
  let st = steps(eq);
  let si = 0;
  let tm = 0;
  let moving = false;
  let ang = 0;
  let av = 0;
  let auto = true;
  let showX = false;
  let speed = 1;
  let mL: Pan = { x: 0, c: 0 };
  let mR: Pan = { x: 0, c: 0 };
  let shown: { L: Pan; R: Pan } = { L: eq.L, R: eq.R };
  let hold: null | { k: 'x' | 'c'; x: number; y: number } = null;
  let panL = { x: 0, y: 0 };
  let panR = { x: 0, y: 0 };
  const W = (p: Pan): number => p.x * eq.sol + p.c;

  function drawPan(g: G, cx: number, py: number, A: Pan, B: Pan, kRem: number, kMov: number): void {
    const la = layout(A);
    const lb = layout(B);
    const lbx = lb.filter((i) => i.k === 'x');
    const lbc = lb.filter((i) => i.k === 'c');
    let ix = 0;
    let ic = 0;
    for (const it of la) {
      const idx = it.k === 'x' ? ix++ : ic++;
      const keep = it.k === 'x' ? B.x : B.c;
      let x = cx + it.dx;
      let by = py - 1 - it.dy;
      let a = 1;
      if (idx < keep) {
        const tg = (it.k === 'x' ? lbx : lbc)[idx];
        if (tg) {
          x = cx + lerp(it.dx, tg.dx, kMov);
          by = py - 1 - lerp(it.dy, tg.dy, kMov);
        }
      } else {
        by -= kRem * 24;
        a = 1 - kRem;
      }
      if (a < 0.02) continue;
      if (it.k === 'x') boxItem(g, x, by, a, showX ? String(eq.sol) : '');
      else unitItem(g, x, by, a);
    }
  }
  function dish(g: G, ex: number, ey: number): { x: number; y: number } {
    const py = ey + STR;
    g.strokeStyle = inkA(0.45);
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(ex, ey);
    g.lineTo(ex - 34, py);
    g.moveTo(ex, ey);
    g.lineTo(ex + 34, py);
    g.stroke();
    g.beginPath();
    g.moveTo(ex - 37, py);
    g.quadraticCurveTo(ex, py + 15, ex + 37, py);
    g.closePath();
    const gr = g.createLinearGradient(0, py, 0, py + 9);
    gr.addColorStop(0, '#d6deef');
    gr.addColorStop(1, '#6d7894');
    g.fillStyle = gr;
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.fillRect(ex - 37, py - 0.6, 74, 1.2);
    return { x: ex, y: py };
  }
  return {
    draw(g, _t, dt0, big) {
      const dt = dt0 * speed;
      let A: { L: Pan; R: Pan };
      let B: { L: Pan; R: Pan };
      let u = 0;
      let say = '';
      const last = si >= st.length - 1;
      if (auto) {
        tm += dt;
        if (!moving) {
          if (tm > (last ? 3 : 1.5)) {
            tm = 0;
            if (last) {
              eq = gen();
              st = steps(eq);
              si = 0;
            } else moving = true;
          }
        } else if (tm > 2) {
          tm = 0;
          moving = false;
          si++;
        }
        A = st[si]!;
        B = moving ? st[si + 1]! : A;
        u = moving ? tm / 2 : 0;
        say = moving ? st[si + 1]!.say : st[si]!.say;
      } else {
        A = { L: mL, R: mR };
        B = A;
      }
      shown = u > 0.5 ? B : A;
      const kL = smooth(0, 0.4, u);
      const kR = smooth(0.5, 0.9, u);
      const WL = lerp(W(A.L), W(B.L), kL);
      const WR = lerp(W(A.R), W(B.R), kR);
      const target = clamp((WR - WL) * 0.045, -0.27, 0.27);
      av += (target - ang) * 95 * dt0;
      av *= Math.exp(-11 * dt0);
      ang += av * dt0;
      const co = Math.cos(ang);
      const sn = Math.sin(ang);
      // 받침
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath();
      g.ellipse(PX, 157, 34, 3.5, 0, 0, TAU);
      g.fill();
      const pg = g.createLinearGradient(PX - 4, 0, PX + 4, 0);
      pg.addColorStop(0, '#5d6a8c');
      pg.addColorStop(0.5, '#c9d3ea');
      pg.addColorStop(1, '#4b5675');
      g.fillStyle = pg;
      g.beginPath();
      g.moveTo(PX - 2.4, PY + 2);
      g.lineTo(PX + 2.4, PY + 2);
      g.lineTo(PX + 4.5, 150);
      g.lineTo(PX - 4.5, 150);
      g.closePath();
      g.fill();
      rr(g, PX - 26, 149, 52, 7, 3);
      g.fillStyle = pg;
      g.fill();
      // 수평 눈금
      g.strokeStyle = inkA(0.25);
      g.lineWidth = 0.6;
      g.beginPath();
      g.arc(PX, PY, 17, Math.PI / 2 - 0.4, Math.PI / 2 + 0.4);
      g.stroke();
      for (let i = -2; i <= 2; i++) {
        const a = Math.PI / 2 + i * 0.18;
        g.strokeStyle = i === 0 ? accA(0.9) : inkA(0.3);
        g.beginPath();
        g.moveTo(PX + Math.cos(a) * 15, PY + Math.sin(a) * 15);
        g.lineTo(PX + Math.cos(a) * 19, PY + Math.sin(a) * 19);
        g.stroke();
      }
      const na = Math.PI / 2 + ang;
      const level = Math.abs(ang) < 0.012;
      g.strokeStyle = level ? ACC : RED;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(PX, PY);
      g.lineTo(PX + Math.cos(na) * 19, PY + Math.sin(na) * 19);
      g.stroke();
      // 막대
      const eLx = PX - ARM * co;
      const eLy = PY - ARM * sn;
      const eRx = PX + ARM * co;
      const eRy = PY + ARM * sn;
      g.save();
      g.translate(PX, PY);
      g.rotate(ang);
      rr(g, -ARM - 3, -2.2, ARM * 2 + 6, 4.4, 2.2);
      const bgr = g.createLinearGradient(0, -2.2, 0, 2.2);
      bgr.addColorStop(0, '#f0d79c');
      bgr.addColorStop(1, '#a87a2c');
      g.fillStyle = bgr;
      g.fill();
      g.restore();
      glowDot(g, PX, PY, 2.6);
      panL = dish(g, eLx, eLy);
      panR = dish(g, eRx, eRy);
      drawPan(g, panL.x, panL.y, A.L, B.L, kL, smooth(0.3, 0.5, u));
      drawPan(g, panR.x, panR.y, A.R, B.R, kR, smooth(0.8, 1, u));
      // 식
      const cur = shown;
      eqBox(g, [...sideTok(cur.L), '  =  ', ...sideTok(cur.R)], PX, 13, 11, 120);
      const done = auto && last && !moving;
      if (auto) {
        if (done) {
          const e = eq;
          text(g, `확인: ${e.L.x}×${e.sol}${e.L.c ? ' + ' + e.L.c : ''} = ${W(e.L)}  ·  ${e.R.x ? e.R.x + '×' + e.sol + ' + ' : ''}${e.R.c} = ${W(e.R)}`, PX, 31, 7.2, ACC, 'center', 700);
        } else pill(g, say, PX, 31, 7, u > 0 ? ACC : INK, 'c');
      }
      // 아래 상태
      const diff = WR - WL;
      const stTxt = Math.abs(diff) < 1e-6 ? '수평 — 양쪽 무게가 같다' : diff > 0 ? '오른쪽이 무거워 기울었다' : '왼쪽이 무거워 기울었다';
      text(g, stTxt, 8, 167, 7.4, Math.abs(diff) < 1e-6 ? ACC : RED, 'left', 700);
      if (!auto) text(g, showX ? `왼쪽 ${f1(WL)} · 오른쪽 ${f1(WR)}` : `x 상자 하나 = ?  (무게는 숨김)`, 8, 157, 6.4, inkA(0.55), 'left');
      if (big) {
        text(g, '끌어 올리기', 248, 150, 6, inkA(0.5), 'center');
        boxItem(g, 237, 168, 1, '');
        unitItem(g, 259, 168, 1);
      }
      if (hold) {
        if (hold.k === 'x') boxItem(g, hold.x, hold.y + BOX / 2, 0.9, '');
        else unitItem(g, hold.x, hold.y + UNIT / 2, 0.9);
      }
    },
    down(x, y) {
      const startManual = (): void => {
        if (auto) {
          auto = false;
          mL = { ...shown.L };
          mR = { ...shown.R };
        }
      };
      if (Math.hypot(x - 237, y - 162) < 9) {
        startManual();
        hold = { k: 'x', x, y };
        return;
      }
      if (Math.hypot(x - 259, y - 164) < 8) {
        startManual();
        hold = { k: 'c', x, y };
        return;
      }
      const sides: [Pan, { x: number; y: number }, 'L' | 'R'][] = [
        [auto ? shown.L : mL, panL, 'L'],
        [auto ? shown.R : mR, panR, 'R'],
      ];
      for (const [p, pan, side] of sides) {
        for (const it of layout(p)) {
          const h = it.k === 'x' ? BOX : UNIT;
          const cx = pan.x + it.dx;
          const cy = pan.y - 1 - it.dy - h / 2;
          if (Math.abs(x - cx) < h / 2 + 1 && Math.abs(y - cy) < h / 2 + 1) {
            startManual();
            const tgt = side === 'L' ? mL : mR;
            if (it.k === 'x') tgt.x = Math.max(0, tgt.x - 1);
            else tgt.c = Math.max(0, tgt.c - 1);
            hold = { k: it.k, x, y };
            return;
          }
        }
      }
    },
    move(x, y, pressed) {
      if (hold && pressed) {
        hold.x = x;
        hold.y = y;
        return 'grabbing';
      }
      return Math.hypot(x - 237, y - 162) < 9 || Math.hypot(x - 259, y - 164) < 8 ? 'grab' : '';
    },
    up() {
      if (!hold) return;
      const onPan = (p: { x: number; y: number }): boolean => Math.abs(hold!.x - p.x) < 42 && hold!.y > p.y - 50 && hold!.y < p.y + 14;
      const tgt = onPan(panL) ? mL : onPan(panR) ? mR : null;
      if (tgt) {
        if (hold.k === 'x' && tgt.x < 4) tgt.x++;
        else if (hold.k === 'c' && tgt.c < 14) tgt.c++;
      }
      hold = null;
    },
    controls: [
      {
        type: 'button',
        label: '새 방정식 (자동 풀이)',
        on: () => {
          eq = gen();
          st = steps(eq);
          si = 0;
          tm = 0;
          moving = false;
          auto = true;
        },
      },
      { type: 'toggle', label: 'x 상자 무게 보이기', value: false, on: (v) => (showX = v) },
      { type: 'range', label: '빠르기', min: 0.4, max: 2.5, step: 0.1, value: 1, on: (v) => (speed = v) },
    ],
  };
});

/* ═════════════════════════ i409 정비례 · 반비례 ═════════════════════════ */
const i409 = cv('표 · 그래프 · 그림이 함께 — 정비례는 y ÷ x 가 늘 같은 직선, 반비례는 x × y 가 늘 같은 곡선 (넓이 그대로) (큰 화면: 점 끌기)', () => {
  let mode = 0;
  let a = 2;
  let k = 12;
  let autoMode = true;
  let autoX = true;
  let clock = 0;
  let modeClock = 0;
  let x = 1;
  let carP = 0;
  let drag = false;
  const GX = 24;
  const GY = 154;
  const SX = 16.5;
  const SY = 10;
  const X = (v: number): number => GX + v * SX;
  const Y = (v: number): number => GY - v * SY;
  const f = (v: number): number => (mode === 0 ? a * v : k / v);
  const xMin = (): number => (mode === 0 ? 0.3 : Math.max(0.6, k / 12));
  const xMax = (): number => (mode === 0 ? Math.min(8, 12 / a) : 8);
  const XS = [1, 2, 3, 4, 6];
  return {
    draw(g, _t, dt) {
      clock += dt;
      if (autoMode) {
        modeClock += dt;
        if (modeClock > 9) {
          modeClock = 0;
          mode = 1 - mode;
        }
      }
      if (autoX && !drag) {
        const lo = Math.max(1, xMin());
        const hi = Math.min(6, xMax());
        x = lo + (hi - lo) * (0.5 - 0.5 * Math.cos((TAU * clock) / 6));
      }
      x = clamp(x, xMin(), xMax());
      const y = f(x);
      // 모눈
      g.save();
      g.lineWidth = 0.5;
      for (let i = 0; i <= 8; i++) {
        g.strokeStyle = inkA(i === 0 ? 0.35 : 0.06);
        g.beginPath();
        g.moveTo(X(i), Y(0));
        g.lineTo(X(i), Y(12));
        g.stroke();
        if (i) text(g, String(i), X(i), GY + 6, 5.8, inkA(0.4), 'center');
      }
      for (let j = 0; j <= 12; j += 2) {
        g.strokeStyle = inkA(j === 0 ? 0.35 : 0.06);
        g.beginPath();
        g.moveTo(X(0), Y(j));
        g.lineTo(X(8), Y(j));
        g.stroke();
        if (j) text(g, String(j), GX - 4, Y(j), 5.8, inkA(0.4), 'right');
      }
      mtext(g, [['i', 'x'], mode === 0 ? ' 분' : ' 속력'], X(8), GY - 5, 6, 'r', inkA(0.55));
      mtext(g, [['i', 'y'], mode === 0 ? ' 물(L)' : ' 시간'], GX + 3, Y(12) - 4, 6, 'l', inkA(0.55));
      // 넓이(반비례) · 기울기 삼각형(정비례)
      if (mode === 1) {
        g.fillStyle = accA(0.13);
        g.fillRect(X(0), Y(y), x * SX, y * SY);
        g.strokeStyle = accA(0.5);
        g.lineWidth = 0.6;
        g.strokeRect(X(0), Y(y), x * SX, y * SY);
        if (x * SX > 34 && y * SY > 16) mtext(g, ['넓이 ', f1(x * y)], X(x / 2), Y(y / 2), 7, 'c', ACC, 700);
      } else {
        dashLine(g, X(x), Y(y), X(x), Y(0), inkA(0.35));
        dashLine(g, X(x), Y(y), X(0), Y(y), inkA(0.35));
        if (x > 1.05) {
          g.strokeStyle = COOL;
          g.lineWidth = 0.9;
          g.beginPath();
          g.moveTo(X(x - 1), Y(f(x - 1)));
          g.lineTo(X(x), Y(f(x - 1)));
          g.lineTo(X(x), Y(y));
          g.stroke();
          text(g, '1', X(x - 0.5), Y(f(x - 1)) + 5, 6, COOL, 'center', 700);
          text(g, f1(a), X(x) + 3, Y(y - a / 2), 6, COOL, 'left', 700);
        }
      }
      // 곡선
      g.beginPath();
      let on = false;
      for (let i = 0; i <= 200; i++) {
        const xv = lerp(mode === 0 ? 0 : 0.5, 8, i / 200);
        const yv = f(xv);
        if (yv > 12.6 || yv < 0) {
          on = false;
          continue;
        }
        if (!on) g.moveTo(X(xv), Y(yv));
        else g.lineTo(X(xv), Y(yv));
        on = true;
      }
      g.lineJoin = 'round';
      g.strokeStyle = accA(0.22);
      g.lineWidth = 5;
      g.stroke();
      g.strokeStyle = ACC;
      g.lineWidth = 1.6;
      g.stroke();
      for (const xv of XS) {
        const yv = f(xv);
        if (yv <= 12.2) {
          g.fillStyle = INK;
          g.beginPath();
          g.arc(X(xv), Y(yv), 1.5, 0, TAU);
          g.fill();
        }
      }
      glowDot(g, X(x), Y(y), drag ? 3.6 : 3);
      g.restore();
      // 표
      const TX = 168;
      const TW = 106;
      rr(g, TX, 22, TW, 36, 5);
      g.fillStyle = 'rgba(10,14,32,0.6)';
      g.fill();
      g.strokeStyle = inkA(0.12);
      g.lineWidth = 0.6;
      g.stroke();
      const cw = (TW - 16) / XS.length;
      g.strokeStyle = inkA(0.1);
      g.beginPath();
      g.moveTo(TX + 3, 40);
      g.lineTo(TX + TW - 3, 40);
      g.stroke();
      mtext(g, [['i', 'x']], TX + 8, 31, 7.5, 'c', COOL);
      mtext(g, [['i', 'y']], TX + 8, 49, 7.5, 'c', ACC);
      XS.forEach((xv, i) => {
        const cx = TX + 16 + cw * (i + 0.5);
        const near = Math.abs(xv - x) < 0.3;
        if (near) {
          rr(g, cx - cw / 2 + 0.5, 24, cw - 1, 32, 3);
          g.fillStyle = accA(0.16);
          g.fill();
        }
        text(g, String(xv), cx, 31, 7, near ? INK : inkA(0.75), 'center', 700);
        text(g, f1(f(xv)), cx, 49, 7, near ? ACC : inkA(0.75), 'center', 700);
      });
      // 관계
      if (mode === 0) {
        mtext(g, [['i', 'y'], ' ÷ ', ['i', 'x'], ' = ', f1(y), ' ÷ ', f1(x), ' = ', ['c', ACC, f1(y / x)]], TX + TW / 2, 65, 7.2, 'c', INK, 700);
        mtext(g, ['정비례  ', ['i', 'y'], ' = ', f1(a), ['i', 'x']], TX + TW / 2, 78, 8, 'c', ACC, 700);
      } else {
        mtext(g, [['i', 'x'], ' × ', ['i', 'y'], ' = ', f1(x), ' × ', f1(y), ' = ', ['c', ACC, f1(x * y)]], TX + TW / 2, 65, 7.2, 'c', INK, 700);
        mtext(g, ['반비례  ', ['i', 'y'], ' = ', ['/', f1(k), 'x'], ''], TX + TW / 2, 80, 8, 'c', ACC, 700);
      }
      // 그림
      if (mode === 0) {
        const bx = 196;
        const by = 104;
        const bw = 44;
        const bh = 50;
        // 수도꼭지 · 물줄기
        g.fillStyle = '#8f9ab8';
        rr(g, bx + bw / 2 - 16, by - 6, 18, 4, 1.5);
        g.fill();
        g.fillRect(bx + bw / 2 - 2, by - 6, 4, 6);
        const lvl = clamp(y / 12, 0, 1) * (bh - 4);
        const wg = g.createLinearGradient(0, by + bh - lvl, 0, by + bh);
        wg.addColorStop(0, 'rgba(120,180,255,0.85)');
        wg.addColorStop(1, 'rgba(50,100,210,0.95)');
        g.fillStyle = 'rgba(140,190,255,0.7)';
        g.fillRect(bx + bw / 2 - 1, by, 2, bh - 2 - lvl);
        g.fillStyle = wg;
        g.fillRect(bx + 2, by + bh - 2 - lvl, bw - 4, lvl);
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.fillRect(bx + 2, by + bh - 2 - lvl, bw - 4, 0.8);
        g.strokeStyle = inkA(0.55);
        g.lineWidth = 0.9;
        g.beginPath();
        g.moveTo(bx, by + 2);
        g.lineTo(bx, by + bh);
        g.lineTo(bx + bw, by + bh);
        g.lineTo(bx + bw, by + 2);
        g.stroke();
        for (let j = 2; j <= 12; j += 2) {
          const yy = by + bh - 2 - (j / 12) * (bh - 4);
          g.strokeStyle = inkA(0.3);
          g.beginPath();
          g.moveTo(bx + bw, yy);
          g.lineTo(bx + bw + 3, yy);
          g.stroke();
          text(g, String(j), bx + bw + 5, yy, 4.8, inkA(0.4), 'left');
        }
        text(g, `1분에 ${f1(a)}L`, bx + bw / 2, by + bh + 8, 6.4, COOL, 'center', 700);
        text(g, `${f1(x)}분 → ${f1(y)}L`, 220, 91, 6.6, INK, 'center', 700);
      } else {
        const rx0 = 176;
        const rx1 = 268;
        const ry = 132;
        carP += dt / (y * 0.32);
        if (carP > 1.25) carP = 0;
        const p = clamp(carP, 0, 1);
        g.fillStyle = '#2a3150';
        g.fillRect(rx0, ry - 5, rx1 - rx0, 10);
        g.setLineDash([4, 3]);
        g.strokeStyle = inkA(0.4);
        g.lineWidth = 0.6;
        g.beginPath();
        g.moveTo(rx0, ry);
        g.lineTo(rx1, ry);
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = ACC;
        g.fillRect(rx1 - 1, ry - 14, 1.2, 14);
        g.beginPath();
        g.moveTo(rx1, ry - 14);
        g.lineTo(rx1 + 6, ry - 11.5);
        g.lineTo(rx1, ry - 9);
        g.fill();
        const cx = lerp(rx0 + 6, rx1 - 8, p);
        rr(g, cx - 7, ry - 8, 14, 5, 2);
        g.fillStyle = COOL;
        g.fill();
        rr(g, cx - 4, ry - 11, 8, 4, 1.5);
        g.fill();
        g.fillStyle = '#10152a';
        g.beginPath();
        g.arc(cx - 4, ry - 3, 1.6, 0, TAU);
        g.arc(cx + 4, ry - 3, 1.6, 0, TAU);
        g.fill();
        text(g, `${f1(k)} km`, (rx0 + rx1) / 2, ry + 11, 6.4, inkA(0.6), 'center', 700);
        text(g, `속력 ${f1(x)} km/시`, 222, 104, 6.6, COOL, 'center', 700);
        text(g, `→ 걸리는 시간 ${f1(y)}시간`, 222, 115, 6.6, INK, 'center', 700);
        text(g, '빠를수록 시간은 짧게', 222, 160, 6, inkA(0.5), 'center');
      }
    },
    down(px, py) {
      if (Math.hypot(px - X(x), py - Y(f(x))) < 12 || (px > GX && px < X(8) && py > Y(12) && py < GY)) {
        drag = true;
        autoX = false;
        x = (px - GX) / SX;
      }
    },
    move(px, py, pressed) {
      if (drag && pressed) {
        x = clamp((px - GX) / SX, xMin(), xMax());
        return 'grabbing';
      }
      return Math.hypot(px - X(x), py - Y(f(x))) < 12 ? 'grab' : '';
    },
    up() {
      drag = false;
    },
    controls: [
      { type: 'range', label: '장면 (1 정비례 · 2 반비례)', min: 1, max: 2, step: 1, value: 1, on: (v) => ((autoMode = false), (mode = v - 1)) },
      { type: 'range', label: '정비례 a (1분에 나오는 물)', min: 0.5, max: 4, step: 0.5, value: 2, on: (v) => ((a = v), (autoMode = false), (mode = 0)) },
      { type: 'range', label: '반비례 k (거리 km)', min: 4, max: 24, step: 1, value: 12, on: (v) => ((k = v), (autoMode = false), (mode = 1)) },
      { type: 'toggle', label: '점 자동으로 움직이기', value: true, on: (v) => (autoX = v) },
    ],
  };
});

/* ═════════════════════════ i410 시계 각도 ═════════════════════════ */
const i410 = cv('분침은 1분에 6°, 시침은 1분에 0.5° — 두 바늘이 실제 속도로 돌고, 사이 각을 바로 계산 (큰 화면: 분침 끌기)', () => {
  let M = 4 * 60 + 25;
  let from = M;
  let to = M;
  let tm = 0;
  let auto = true;
  let drag = false;
  const CX = 78;
  const CY = 94;
  const R = 68;
  const cAng = (deg: number): number => ((deg - 90) * Math.PI) / 180;
  return {
    draw(g, _t, dt) {
      if (auto && !drag) {
        tm += dt;
        const TR = 1.4;
        const HOLD = 2.3;
        if (tm > TR + HOLD) {
          tm = 0;
          from = to;
          to = from + 5 * rint(4, 40);
        }
        M = lerp(from, to, smooth(0, TR, tm));
      }
      const Mm = ((M % 720) + 720) % 720;
      const hDeg = 0.5 * Mm;
      const mDeg = 6 * (Mm % 60);
      // 시계판
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath();
      g.arc(CX + 1.5, CY + 2.5, R + 4, 0, TAU);
      g.fill();
      const rim = g.createLinearGradient(CX - R, CY - R, CX + R, CY + R);
      rim.addColorStop(0, '#ffe2a0');
      rim.addColorStop(0.5, '#b8842c');
      rim.addColorStop(1, '#ffd27a');
      g.fillStyle = rim;
      g.beginPath();
      g.arc(CX, CY, R + 4, 0, TAU);
      g.fill();
      const face = g.createRadialGradient(CX - 15, CY - 20, 5, CX, CY, R);
      face.addColorStop(0, '#26315a');
      face.addColorStop(1, '#0d1226');
      g.fillStyle = face;
      g.beginPath();
      g.arc(CX, CY, R, 0, TAU);
      g.fill();
      for (let i = 0; i < 60; i++) {
        const a = cAng(i * 6);
        const big5 = i % 5 === 0;
        g.strokeStyle = big5 ? inkA(0.85) : inkA(0.3);
        g.lineWidth = big5 ? 1.2 : 0.5;
        g.beginPath();
        g.moveTo(CX + Math.cos(a) * (R - (big5 ? 6 : 3.5)), CY + Math.sin(a) * (R - (big5 ? 6 : 3.5)));
        g.lineTo(CX + Math.cos(a) * (R - 1.5), CY + Math.sin(a) * (R - 1.5));
        g.stroke();
      }
      for (let i = 1; i <= 12; i++) {
        const a = cAng(i * 30);
        text(g, String(i), CX + Math.cos(a) * (R - 13), CY + Math.sin(a) * (R - 13) + 0.4, 8.5, INK, 'center', 700);
      }
      // 사이 각 부채꼴
      let d = mDeg - hDeg;
      d = ((d % 360) + 360) % 360;
      const between = Math.min(d, 360 - d);
      const start = d <= 180 ? hDeg : mDeg;
      const end = start + between;
      g.beginPath();
      g.moveTo(CX, CY);
      g.arc(CX, CY, R * 0.62, cAng(start), cAng(end));
      g.closePath();
      g.fillStyle = accA(0.22);
      g.fill();
      g.strokeStyle = accA(0.75);
      g.lineWidth = 0.8;
      g.beginPath();
      g.arc(CX, CY, R * 0.62, cAng(start), cAng(end));
      g.stroke();
      const mid = cAng((start + end) / 2);
      const lr = between < 40 ? R * 0.75 : R * 0.42;
      if (between > 1) {
        g.font = font(8, 800);
        const lw = g.measureText(fN(between, between % 1 ? 1 : 0) + '°').width + 6;
        rr(g, CX + Math.cos(mid) * lr - lw / 2, CY + Math.sin(mid) * lr - 5.5, lw, 11, 5.5);
        g.fillStyle = 'rgba(10,14,32,0.8)';
        g.fill();
        text(g, fN(between, between % 1 ? 1 : 0) + '°', CX + Math.cos(mid) * lr, CY + Math.sin(mid) * lr + 0.4, 8, ACC, 'center', 800);
      }
      // 바늘
      const hand = (deg: number, len: number, w: number, col: string): void => {
        const a = cAng(deg);
        g.strokeStyle = 'rgba(0,0,0,0.35)';
        g.lineWidth = w;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(CX + 1, CY + 1.5);
        g.lineTo(CX + 1 + Math.cos(a) * len, CY + 1.5 + Math.sin(a) * len);
        g.stroke();
        g.strokeStyle = col;
        g.beginPath();
        g.moveTo(CX - Math.cos(a) * 6, CY - Math.sin(a) * 6);
        g.lineTo(CX + Math.cos(a) * len, CY + Math.sin(a) * len);
        g.stroke();
      };
      hand(hDeg, R * 0.5, 3.6, INK);
      hand(mDeg, R * 0.82, 2.2, COOL);
      glowDot(g, CX, CY, 2.6);
      // 오른쪽 계산
      const hh = Math.floor(Mm / 60);
      const mm = Math.round(Mm % 60) % 60;
      const hShow = hh === 0 ? 12 : hh;
      const x0 = 164;
      rr(g, x0, 10, 106, 30, 6);
      g.fillStyle = 'rgba(10,14,32,0.7)';
      g.fill();
      g.strokeStyle = accA(0.35);
      g.lineWidth = 0.7;
      g.stroke();
      text(g, `${hShow}시 ${mm}분`, x0 + 53, 25.5, 14, INK, 'center', 800);
      const mD = 6 * mm;
      const hD = 30 * hh + 0.5 * mm;
      mtext(g, [['c', COOL, '분침'], '  6° × ', String(mm), ' = ', ['c', COOL, f1(mD) + '°']], x0 + 2, 54, 7.4, 'l', INK, 600);
      mtext(g, [['c', INK, '시침'], '  30° × ', String(hh), ' + 0.5° × ', String(mm)], x0 + 2, 70, 7.4, 'l', INK, 600);
      mtext(g, ['        = ', f1(hD) + '°'], x0 + 2, 82, 7.4, 'l', INK, 600);
      let dd = Math.abs(mD - hD) % 360;
      const ans = Math.min(dd, 360 - dd);
      dd = Math.round(dd * 10) / 10;
      mtext(g, ['차이 |', f1(mD), ' − ', f1(hD), '| = ', f1(dd) + '°'], x0 + 2, 100, 7.2, 'l', inkA(0.75), 600);
      if (dd > 180) mtext(g, ['180° 넘으면 360° − ', f1(dd), '°'], x0 + 2, 112, 6.6, 'l', inkA(0.55), 600);
      rr(g, x0, 122, 106, 24, 6);
      g.fillStyle = accA(0.12);
      g.fill();
      g.strokeStyle = accA(0.5);
      g.stroke();
      text(g, `사이 각 ${f1(ans)}°`, x0 + 53, 134.5, 11, ACC, 'center', 800);
      text(g, '1시간 = 시침 30° · 분침 360°', x0 + 53, 160, 6.2, inkA(0.5), 'center');
    },
    down(x, y) {
      if (Math.hypot(x - CX, y - CY) < R + 6) {
        drag = true;
        auto = false;
      }
    },
    move(x, y, pressed) {
      if (drag && pressed) {
        let deg = (Math.atan2(y - CY, x - CX) * 180) / Math.PI + 90;
        deg = ((deg % 360) + 360) % 360;
        const mNew = Math.round(deg / 6) % 60;
        const mOld = ((Math.round(M) % 60) + 60) % 60;
        let delta = mNew - mOld;
        if (delta > 30) delta -= 60;
        if (delta < -30) delta += 60;
        M = Math.round(M) + delta;
        from = to = M;
        return 'grabbing';
      }
      return Math.hypot(x - CX, y - CY) < R + 6 ? 'grab' : '';
    },
    up() {
      drag = false;
    },
    controls: [
      { type: 'toggle', label: '자동으로 시각 바꾸기', value: true, on: (v) => ((auto = v), (from = to = M), (tm = 0)) },
      {
        type: 'range',
        label: '시',
        min: 1,
        max: 12,
        step: 1,
        value: 4,
        on: (v) => {
          auto = false;
          M = (v % 12) * 60 + (((Math.round(M) % 60) + 60) % 60);
          from = to = M;
        },
      },
      {
        type: 'range',
        label: '분',
        min: 0,
        max: 59,
        step: 1,
        value: 25,
        on: (v) => {
          auto = false;
          M = Math.floor((((Math.round(M) % 720) + 720) % 720) / 60) * 60 + v;
          from = to = M;
        },
      },
    ],
  };
});

/* ═════════════════════════ i411 벤 다이어그램 ═════════════════════════ */
const i411 = cv('수를 영역에 넣으면 개수가 바로 바뀐다 — n(A∪B) = n(A) + n(B) − n(A∩B), 겹친 곳은 두 번 세니까 한 번 뺀다 (큰 화면: 수 끌기)', () => {
  const PRESETS: { name: string; A: string; B: string; U: number[]; inA: (v: number) => boolean; inB: (v: number) => boolean }[] = [
    { name: '2의 배수 · 3의 배수', A: '2의 배수', B: '3의 배수', U: range(1, 15), inA: (v) => v % 2 === 0, inB: (v) => v % 3 === 0 },
    { name: '소수 · 홀수', A: '소수', B: '홀수', U: range(1, 15), inA: (v) => [2, 3, 5, 7, 11, 13].includes(v), inB: (v) => v % 2 === 1 },
    { name: '12의 약수 · 16의 약수', A: '12의 약수', B: '16의 약수', U: range(1, 16), inA: (v) => 12 % v === 0, inB: (v) => 16 % v === 0 },
  ];
  function range(a: number, b: number): number[] {
    const o: number[] = [];
    for (let i = a; i <= b; i++) o.push(i);
    return o;
  }
  const UX0 = 10;
  const UY0 = 28;
  const UX1 = 196;
  const UY1 = 166;
  const AX = 80;
  const BX = 126;
  const CY = 97;
  const RAD = 50;
  const ER = 5.6;
  interface El {
    v: number;
    x: number;
    y: number;
    sx: number;
    sy: number;
    tx: number;
    ty: number;
  }
  let pi = 0;
  let els: El[] = [];
  let clock = 0;
  let auto = true;
  let cycle = true;
  let drag: El | null = null;
  const regionOf = (x: number, y: number): number => (Math.hypot(x - AX, y - CY) < RAD ? 1 : 0) + (Math.hypot(x - BX, y - CY) < RAD ? 2 : 0);
  function build(): void {
    const P = PRESETS[pi]!;
    // 자리 후보
    const slots: { x: number; y: number; r: number }[] = [];
    for (let y = UY0 + 9; y <= UY1 - 7; y += 13.6) {
      for (let x = UX0 + 9; x <= UX1 - 7; x += 13.6) {
        const dA = Math.hypot(x - AX, y - CY);
        const dB = Math.hypot(x - BX, y - CY);
        if (Math.abs(dA - RAD) < 8 || Math.abs(dB - RAD) < 8) continue;
        slots.push({ x, y, r: (dA < RAD ? 1 : 0) + (dB < RAD ? 2 : 0) });
      }
    }
    const anchor = [
      [UX0 + 8, UY1 - 8],
      [50, CY],
      [156, CY],
      [103, CY],
    ];
    const used = new Set<number>();
    els = P.U.map((v, i) => {
      const r = (P.inA(v) ? 1 : 0) + (P.inB(v) ? 2 : 0);
      const an = anchor[r]!;
      let best = -1;
      let bd = 1e9;
      slots.forEach((s, si) => {
        if (s.r !== r || used.has(si)) return;
        const d = Math.hypot(s.x - an[0]!, s.y - an[1]!);
        if (d < bd) {
          bd = d;
          best = si;
        }
      });
      if (best < 0) best = 0;
      used.add(best);
      const s = slots[best]!;
      const sx = 16 + (i * (UX1 - 22)) / (P.U.length - 1);
      return { v, x: sx, y: 14, sx, sy: 14, tx: s.x, ty: s.y };
    });
    clock = 0;
  }
  build();
  return {
    draw(g, _t, dt) {
      const P = PRESETS[pi]!;
      const n = els.length;
      const T_LAND = 0.6 + n * 0.32 + 0.6;
      if (auto) {
        clock += dt;
        els.forEach((e, i) => {
          if (e === drag) return;
          const k = smooth(0.6 + i * 0.32, 0.6 + i * 0.32 + 0.5, clock);
          e.x = lerp(e.sx, e.tx, k);
          e.y = lerp(e.sy, e.ty, k) - Math.sin(k * Math.PI) * 14;
        });
        if (clock > T_LAND + 8) build();
      }
      // 하이라이트 단계
      let hi = '';
      if (cycle) {
        const c = (auto ? clock - T_LAND : clock) % 8;
        if (!auto) clock += dt;
        if (c >= 0) hi = c < 1.6 ? 'A' : c < 3.2 ? 'B' : c < 5 ? 'AB' : 'AuB';
      }
      // 전체 집합
      rr(g, UX0, UY0, UX1 - UX0, UY1 - UY0, 7);
      g.fillStyle = 'rgba(255,255,255,0.025)';
      g.fill();
      g.strokeStyle = inkA(0.3);
      g.lineWidth = 0.8;
      g.stroke();
      text(g, 'U', UX0 + 5, UY0 + 7, 7.5, inkA(0.55), 'left', 800);
      // 하이라이트 칠
      const circ = (x: number): void => {
        g.beginPath();
        g.arc(x, CY, RAD, 0, TAU);
      };
      g.save();
      if (hi === 'A') {
        circ(AX);
        g.fillStyle = accA(0.22);
        g.fill();
      } else if (hi === 'B') {
        circ(BX);
        g.fillStyle = coolA(0.22);
        g.fill();
      } else if (hi === 'AB') {
        circ(AX);
        g.clip();
        circ(BX);
        g.fillStyle = 'rgba(255,255,255,0.22)';
        g.fill();
      } else if (hi === 'AuB') {
        g.beginPath();
        g.arc(AX, CY, RAD, 0, TAU);
        g.moveTo(BX + RAD, CY);
        g.arc(BX, CY, RAD, 0, TAU);
        g.fillStyle = 'rgba(255,230,170,0.17)';
        g.fill('nonzero');
      }
      g.restore();
      circ(AX);
      g.fillStyle = accA(0.05);
      g.fill();
      g.strokeStyle = ACC;
      g.lineWidth = 1.3;
      g.stroke();
      circ(BX);
      g.fillStyle = coolA(0.05);
      g.fill();
      g.strokeStyle = COOL;
      g.stroke();
      text(g, 'A', AX - RAD + 6, CY - RAD + 8, 9, ACC, 'left', 800);
      text(g, 'B', BX + RAD - 6, CY - RAD + 8, 9, COOL, 'right', 800);
      // 원소
      let nA = 0;
      let nB = 0;
      let nAB = 0;
      let placed = 0;
      let wrong = 0;
      for (const e of els) {
        const inU = e.x > UX0 && e.x < UX1 && e.y > UY0 && e.y < UY1;
        const r = regionOf(e.x, e.y);
        if (inU) {
          placed++;
          if (r & 1) nA++;
          if (r & 2) nB++;
          if (r === 3) nAB++;
        }
        const truth = (P.inA(e.v) ? 1 : 0) + (P.inB(e.v) ? 2 : 0);
        const bad = inU && r !== truth;
        if (bad) wrong++;
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.beginPath();
        g.arc(e.x + 0.6, e.y + 1, ER, 0, TAU);
        g.fill();
        g.fillStyle = e === drag ? '#2e3b6b' : '#1b2448';
        g.beginPath();
        g.arc(e.x, e.y, ER, 0, TAU);
        g.fill();
        g.strokeStyle = bad ? RED : r === 3 ? '#e8e2c8' : r === 1 ? ACC : r === 2 ? COOL : inkA(0.4);
        g.lineWidth = bad ? 1.3 : 0.8;
        g.stroke();
        text(g, String(e.v), e.x, e.y + 0.3, 6.4, INK, 'center', 800);
      }
      // 오른쪽 셈
      const x0 = 202;
      text(g, 'A', x0, 34, 8, ACC, 'left', 800);
      text(g, P.A, x0 + 8, 34, 6.8, inkA(0.8), 'left', 600);
      text(g, 'B', x0, 46, 8, COOL, 'left', 800);
      text(g, P.B, x0 + 8, 46, 6.8, inkA(0.8), 'left', 600);
      const row = (lab: Tok[], v: number, y: number, on: boolean, col: string): void => {
        if (on) {
          rr(g, x0 - 3, y - 7, 76, 14, 4);
          g.fillStyle = accA(0.12);
          g.fill();
        }
        mtext(g, lab, x0, y, 7.6, 'l', on ? INK : inkA(0.75), 700);
        text(g, String(v), x0 + 70, y, 9, col, 'right', 800);
      };
      row(['n(A)'], nA, 64, hi === 'A', ACC);
      row(['n(B)'], nB, 80, hi === 'B', COOL);
      row(['n(A∩B)'], nAB, 96, hi === 'AB', INK);
      row(['n(A∪B)'], nA + nB - nAB, 112, hi === 'AuB', ACC);
      mtext(g, [['c', ACC, String(nA)], ' + ', ['c', COOL, String(nB)], ' − ', String(nAB), ' = ', ['c', ACC, String(nA + nB - nAB)]], x0 + 35, 132, 8.4, 'c', INK, 800);
      text(g, '겹친 곳은 한 번 빼기', x0 + 35, 144, 6, inkA(0.5), 'center');
      text(g, wrong ? `잘못 놓인 수 ${wrong}개` : placed === n ? '모두 제자리' : `넣은 수 ${placed}/${n}`, x0 + 35, 160, 6.6, wrong ? RED : inkA(0.6), 'center', 700);
    },
    down(x, y) {
      let best: El | null = null;
      let bd = 9;
      for (const e of els) {
        const d = Math.hypot(e.x - x, e.y - y);
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      if (best) {
        if (auto) {
          auto = false;
          clock = 0;
        }
        drag = best;
      }
    },
    move(x, y, pressed) {
      if (drag && pressed) {
        drag.x = clamp(x, 4, 276);
        drag.y = clamp(y, 6, 171);
        return 'grabbing';
      }
      return els.some((e) => Math.hypot(e.x - x, e.y - y) < 9) ? 'grab' : '';
    },
    up() {
      drag = null;
    },
    controls: [
      {
        type: 'button',
        label: '처음부터 다시 분류',
        on: () => {
          auto = true;
          build();
        },
      },
      {
        type: 'range',
        label: '집합 (1 배수 · 2 소수/홀수 · 3 약수)',
        min: 1,
        max: 3,
        step: 1,
        value: 1,
        on: (v) => {
          pi = v - 1;
          auto = true;
          build();
        },
      },
      { type: 'toggle', label: 'A · B · A∩B · A∪B 차례로 칠하기', value: true, on: (v) => (cycle = v) },
    ],
  };
});

/* ═════════════════════════ i412 확률 나무 ═════════════════════════ */
const i412 = cv('빨간 공 3 · 파란 공 2 에서 두 번 — 갈래마다 확률을 곱하고 끝을 더한다, 옆에서 실제로 꺼내 본 비율이 따라온다', () => {
  let replace = true;
  let rate = 2;
  let acc = 0;
  let n = 0;
  const cnt = [0, 0, 0, 0];
  let tp = 0;
  let cur: { a: number; b: number } | null = null;
  let lastLeaf = -1;
  const BAG = [true, true, true, false, false];
  function trial(): { a: number; b: number } {
    const a = Math.floor(Math.random() * 5);
    let b: number;
    if (replace) b = Math.floor(Math.random() * 5);
    else {
      b = Math.floor(Math.random() * 4);
      if (b >= a) b++;
    }
    return { a, b };
  }
  const leafOf = (t: { a: number; b: number }): number => (BAG[t.a] ? 0 : 2) + (BAG[t.b] ? 0 : 1);
  function probs(): { p1: [number, number][]; p2: [number, number][][] } {
    // [분자, 분모]
    const p1: [number, number][] = [
      [3, 5],
      [2, 5],
    ];
    const p2: [number, number][][] = replace
      ? [
          [
            [3, 5],
            [2, 5],
          ],
          [
            [3, 5],
            [2, 5],
          ],
        ]
      : [
          [
            [2, 4],
            [2, 4],
          ],
          [
            [3, 4],
            [1, 4],
          ],
        ];
    return { p1, p2 };
  }
  function reset(): void {
    n = 0;
    cnt.fill(0);
    cur = null;
    tp = 0;
    lastLeaf = -1;
  }
  const ROOT: [number, number] = [12, 96];
  const L1: [number, number][] = [
    [66, 58],
    [66, 134],
  ];
  const L2: [number, number][] = [
    [120, 36],
    [120, 80],
    [120, 112],
    [120, 156],
  ];
  return {
    draw(g, _t, dt) {
      const { p1, p2 } = probs();
      const animated = rate <= 4;
      let k1 = 1;
      let k2 = 1;
      if (animated) {
        tp += dt * rate;
        if (!cur) cur = trial();
        if (tp >= 1) {
          tp = 0;
          lastLeaf = leafOf(cur);
          cnt[lastLeaf]!++;
          n++;
          cur = trial();
        }
        k1 = smooth(0, 0.35, tp);
        k2 = smooth(0.45, 0.8, tp);
      } else {
        acc += dt * rate;
        while (acc >= 1) {
          acc -= 1;
          const t = trial();
          lastLeaf = leafOf(t);
          cnt[lastLeaf]!++;
          n++;
          cur = t;
        }
      }
      const pathFirst = cur ? (BAG[cur.a] ? 0 : 1) : -1;
      const pathLeaf = cur ? leafOf(cur) : -1;
      // 가지
      const edge = (a: [number, number], b: [number, number], on: number, lab: Tok, red: boolean): void => {
        g.strokeStyle = inkA(0.22);
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(a[0], a[1]);
        g.lineTo(b[0], b[1]);
        g.stroke();
        if (on > 0) {
          g.strokeStyle = accA(0.25);
          g.lineWidth = 4;
          g.beginPath();
          g.moveTo(a[0], a[1]);
          g.lineTo(lerp(a[0], b[0], on), lerp(a[1], b[1], on));
          g.stroke();
          g.strokeStyle = ACC;
          g.lineWidth = 1.4;
          g.stroke();
        }
        const mx = (a[0] + b[0]) / 2;
        const my = (a[1] + b[1]) / 2;
        const ex = b[0] - a[0];
        const ey = b[1] - a[1];
        const el = Math.hypot(ex, ey) || 1;
        let nx = ey / el;
        let ny = -ex / el;
        if (ny > 0) {
          nx = -nx;
          ny = -ny;
        }
        mtext(g, [lab], mx + nx * 8, my + ny * 8, 7.4, 'c', red ? '#ffb0a8' : '#b8d4ff', 700);
      };
      for (let i = 0; i < 2; i++) {
        edge(ROOT, L1[i]!, pathFirst === i ? k1 : 0, ['/', String(p1[i]![0]), String(p1[i]![1])], i === 0);
        for (let j = 0; j < 2; j++) {
          const leaf = i * 2 + j;
          edge(L1[i]!, L2[leaf]!, pathLeaf === leaf ? k2 : 0, ['/', String(p2[i]![j]![0]), String(p2[i]![j]![1])], j === 0);
        }
      }
      glowDot(g, ROOT[0], ROOT[1], 2.4);
      ball(g, L1[0]![0], L1[0]![1], 5, true);
      ball(g, L1[1]![0], L1[1]![1], 5, false);
      for (let leaf = 0; leaf < 4; leaf++) {
        const p = L2[leaf]!;
        const i = leaf >> 1;
        const j = leaf & 1;
        ball(g, p[0], p[1], 4.4, j === 0);
        const num = p1[i]![0] * p2[i]![j]![0];
        const den = p1[i]![1] * p2[i]![j]![1];
        ball(g, p[0] + 11, p[1], 2.6, i === 0);
        ball(g, p[0] + 17, p[1], 2.6, j === 0);
        mtext(g, ['= ', fracTok(num, den, pathLeaf === leaf && k2 > 0.99 ? ACC : undefined)], p[0] + 22, p[1], 8, 'l', INK, 700);
      }
      // 곱셈 식 (지금 길)
      if (cur && pathLeaf >= 0) {
        const i = pathLeaf >> 1;
        const j = pathLeaf & 1;
        const a = p1[i]!;
        const b = p2[i]![j]!;
        mtext(g, [['/', String(a[0]), String(a[1])], ' × ', ['/', String(b[0]), String(b[1])], ' = ', ['/', String(a[0] * b[0]), String(a[1] * b[1])], gcd(a[0] * b[0], a[1] * b[1]) > 1 ? ' = ' : '', gcd(a[0] * b[0], a[1] * b[1]) > 1 ? fracTok(a[0] * b[0], a[1] * b[1]) : ''], 12, 14, 8, 'l', ACC, 700);
      }
      // 주머니
      const bx = 208;
      const by = 30;
      g.save();
      g.translate(bx, by);
      g.scale(0.78, 0.78);
      g.translate(-bx, -by);
      g.fillStyle = '#5a4630';
      g.beginPath();
      g.moveTo(bx - 20, by - 14);
      g.quadraticCurveTo(bx - 30, by + 18, bx - 14, by + 22);
      g.lineTo(bx + 14, by + 22);
      g.quadraticCurveTo(bx + 30, by + 18, bx + 20, by - 14);
      g.closePath();
      const bagG = g.createLinearGradient(bx - 24, 0, bx + 24, 0);
      bagG.addColorStop(0, '#6e5434');
      bagG.addColorStop(0.5, '#a07c4c');
      bagG.addColorStop(1, '#5e4528');
      g.fillStyle = bagG;
      g.fill();
      g.fillStyle = '#2b2116';
      g.beginPath();
      g.ellipse(bx, by - 14, 20, 4, 0, 0, TAU);
      g.fill();
      const slotPos: [number, number][] = [
        [bx - 9, by - 2],
        [bx, by - 4],
        [bx + 9, by - 2],
        [bx - 5, by + 8],
        [bx + 5, by + 8],
      ];
      const outA = cur && animated ? cur.a : -1;
      const outB = cur && animated ? cur.b : -1;
      for (let i = 0; i < 5; i++) {
        let a = 1;
        if (i === outA) a = replace ? (tp > 0.35 && tp < 0.45 ? 0 : tp < 0.35 ? 1 - k1 : 1) : 1 - k1;
        if (i === outB && tp > 0.45) a = Math.min(a, 1 - k2);
        const sp = slotPos[i]!;
        ball(g, sp[0], sp[1], 4, BAG[i]!, clamp(a, 0, 1) * 0.95 + 0.05 * (a > 0 ? 1 : 0));
      }
      g.restore();
      const bagP = (i: number): [number, number] => [bx + (slotPos[i]![0] - bx) * 0.78, by + (slotPos[i]![1] - by) * 0.78];
      // 꺼낸 공
      const s1: [number, number] = [246, 28];
      const s2: [number, number] = [264, 28];
      text(g, '1번째', s1[0], 17, 5.4, inkA(0.5), 'center');
      text(g, '2번째', s2[0], 17, 5.4, inkA(0.5), 'center');
      g.strokeStyle = inkA(0.2);
      g.lineWidth = 0.6;
      g.beginPath();
      g.arc(s1[0], s1[1], 5, 0, TAU);
      g.moveTo(s2[0] + 5, s2[1]);
      g.arc(s2[0], s2[1], 5, 0, TAU);
      g.stroke();
      if (cur) {
        if (animated) {
          const sa = bagP(cur.a);
          ball(g, lerp(sa[0], s1[0], k1), lerp(sa[1], s1[1], k1) - Math.sin(k1 * Math.PI) * 12, 4.4, BAG[cur.a]!, k1 > 0.02 ? 1 : 0);
          const sb = bagP(cur.b);
          if (k2 > 0.02) ball(g, lerp(sb[0], s2[0], k2), lerp(sb[1], s2[1], k2) - Math.sin(k2 * Math.PI) * 12, 4.4, BAG[cur.b]!);
        } else {
          ball(g, s1[0], s1[1], 4.4, BAG[cur.a]!);
          ball(g, s2[0], s2[1], 4.4, BAG[cur.b]!);
        }
      }
      text(g, replace ? '꺼낸 공 다시 넣기' : '꺼낸 공 안 넣기', 255, 44, 5.8, replace ? COOL : '#ffb0a8', 'center', 700);
      // 실험 막대
      const x0 = 184;
      const bw = 70;
      for (let leaf = 0; leaf < 4; leaf++) {
        const i = leaf >> 1;
        const j = leaf & 1;
        const y = 66 + leaf * 18;
        ball(g, x0 + 2, y, 2.8, i === 0);
        ball(g, x0 + 9, y, 2.8, j === 0);
        const theory = (p1[i]![0] * p2[i]![j]![0]) / (p1[i]![1] * p2[i]![j]![1]);
        const emp = n ? cnt[leaf]! / n : 0;
        rr(g, x0 + 15, y - 4, bw, 8, 2);
        g.fillStyle = inkA(0.06);
        g.fill();
        rr(g, x0 + 15, y - 4, Math.max(0.01, Math.min(1, emp / 0.6) * bw), 8, 2);
        g.fillStyle = leaf === lastLeaf ? ACC : accA(0.6);
        g.fill();
        const tx = x0 + 15 + (theory / 0.6) * bw;
        g.fillStyle = INK;
        g.fillRect(tx - 0.5, y - 6, 1, 12);
        text(g, `${Math.round(emp * 100)}%`, x0 + 16 + bw + 1, y + 7.5, 5.2, inkA(0.55), 'right');
      }
      text(g, '막대 = 실험 · 흰 선 = 계산', x0 + 50, 140, 5.6, inkA(0.5), 'center');
      const same = n ? (cnt[0]! + cnt[3]!) / n : 0;
      const tS = (p1[0]![0] * p2[0]![0]![0]) / (p1[0]![1] * p2[0]![0]![1]) + (p1[1]![0] * p2[1]![1]![0]) / (p1[1]![1] * p2[1]![1]![1]);
      const den = replace ? 25 : 20;
      const num = Math.round(tS * den);
      mtext(g, ['같은 색 = ', fracTok(num, den, ACC), ' ≈ ', fN(tS, 2)], x0 - 2, 153, 7, 'l', INK, 700);
      text(g, `실험 ${n}번 → ${fN(same, 2)}`, x0 - 2, 166, 6.6, inkA(0.7), 'left', 700);
    },
    controls: [
      { type: 'toggle', label: '꺼낸 공 다시 넣기', value: true, on: (v) => ((replace = v), reset()) },
      { type: 'range', label: '1초에 꺼내는 횟수 (5 넘으면 빠르게)', min: 1, max: 80, step: 1, value: 2, on: (v) => (rate = v) },
      { type: 'button', label: '처음부터', on: () => reset() },
    ],
  };
});

/* ═════════════════════════ i413 통계 그래프 비교 ═════════════════════════ */
const i413 = cv('같은 자료 20개를 막대 · 띠 · 원 · 상자 수염으로 — 평균(무게 중심) · 중앙값(가운데) · 최빈값(가장 많은)이 어디에 보이나', () => {
  let data: number[] = [];
  let counts: number[] = [];
  let mean = 0;
  let median = 0;
  let modes: number[] = [];
  let q1 = 0;
  let q3 = 0;
  let mn = 0;
  let mx = 0;
  let clock = 0;
  let fixed = 0;
  let marks = true;
  function gen(): void {
    data = [];
    for (let i = 0; i < 20; i++) {
      const v = Math.floor((Math.random() + Math.random() + Math.random() * 0.8) * 3.4);
      data.push(clamp(v, 0, 8));
    }
    const s = [...data].sort((a, b) => a - b);
    counts = new Array(9).fill(0);
    for (const v of s) counts[v]!++;
    mean = s.reduce((a, b) => a + b, 0) / 20;
    median = (s[9]! + s[10]!) / 2;
    q1 = (s[4]! + s[5]!) / 2;
    q3 = (s[14]! + s[15]!) / 2;
    mn = s[0]!;
    mx = s[19]!;
    const top = Math.max(...counts);
    modes = counts.map((c, v) => (c === top ? v : -1)).filter((v) => v >= 0);
  }
  gen();
  const X = (v: number): number => 24 + v * 19;
  const catCol = (v: number): string => (modes.includes(v) ? ACC : `hsl(${218 - v * 4}, ${52 + v * 3}%, ${30 + v * 6.5}%)`);
  const NAMES = ['막대그래프', '띠그래프', '원그래프', '상자 수염 그림'];
  const TIPS = ['가장 높은 막대 = 최빈값', '띠의 50% 자리 = 중앙값이 든 칸', '가장 큰 조각 = 최빈값', '상자 가운데 선 = 중앙값, 상자 = 가운데 절반'];
  function meanMark(g: G, y: number): void {
    const x = X(mean);
    g.fillStyle = ACC;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x - 4, y + 6);
    g.lineTo(x + 4, y + 6);
    g.closePath();
    g.fill();
    text(g, `평균 ${fN(mean, 2)}`, x, y + 11, 6, ACC, 'center', 700);
  }
  function bars(g: G, al: number): void {
    g.globalAlpha = al;
    const base = 146;
    const top = Math.max(...counts);
    const sc = 96 / Math.max(top, 5);
    g.strokeStyle = inkA(0.35);
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(14, base);
    g.lineTo(192, base);
    g.stroke();
    for (let v = 0; v <= 8; v++) {
      const h = counts[v]! * sc;
      const x = X(v);
      if (h > 0) {
        rr(g, x - 6.5, base - h, 13, h, 1.5);
        g.fillStyle = modes.includes(v) ? accFill(g, base - h, base) : 'rgba(120,160,240,0.75)';
        g.fill();
        text(g, String(counts[v]), x, base - h - 5, 6.2, modes.includes(v) ? ACC : inkA(0.7), 'center', 700);
      }
      text(g, String(v), x, base + 5, 5.8, inkA(0.5), 'center');
    }
    if (marks) {
      dashLine(g, X(median), 40, X(median), base, inkA(0.7), 0.8, [2.5, 2]);
      text(g, `중앙값 ${f1(median)}`, X(median), 36, 6, INK, 'center', 700);
      meanMark(g, base + 9);
    }
    g.globalAlpha = 1;
  }
  function band(g: G, al: number): void {
    g.globalAlpha = al;
    const x0 = 14;
    const W = 176;
    const y0 = 74;
    const h = 30;
    let acc = 0;
    for (let v = 0; v <= 8; v++) {
      const c = counts[v]!;
      if (!c) continue;
      const x = x0 + (acc / 20) * W;
      const w = (c / 20) * W;
      g.fillStyle = catCol(v);
      g.fillRect(x, y0, w - 0.6, h);
      text(g, String(v), x + w / 2, y0 - 6, 6, inkA(0.7), 'center', 700);
      if (w > 13) text(g, `${c * 5}%`, x + w / 2, y0 + h / 2, 5.8, modes.includes(v) ? DARK : INK, 'center', 700);
      acc += c;
    }
    g.strokeStyle = inkA(0.3);
    g.lineWidth = 0.6;
    g.strokeRect(x0, y0, W, h);
    text(g, '읽은 책 수 (권)', x0, y0 - 16, 5.8, inkA(0.45), 'left');
    if (marks) {
      const mx2 = x0 + W / 2;
      arrow(g, mx2, y0 + h + 16, mx2, y0 + h + 2, INK, 0.9, 4);
      text(g, `50% 자리 → 중앙값 ${f1(median)}`, mx2, y0 + h + 22, 6.4, INK, 'center', 700);
    }
    for (let i = 0; i <= 10; i++) {
      const x = x0 + (i / 10) * W;
      g.fillStyle = inkA(0.3);
      g.fillRect(x - 0.3, y0 + h + 0.5, 0.6, 2.4);
    }
    text(g, '0%', x0, y0 + h + 7, 5, inkA(0.4), 'center');
    text(g, '100%', x0 + W, y0 + h + 7, 5, inkA(0.4), 'center');
    g.globalAlpha = 1;
  }
  function pie(g: G, al: number): void {
    g.globalAlpha = al;
    const cx = 100;
    const cy = 98;
    const r = 56;
    let a0 = -Math.PI / 2;
    for (let v = 0; v <= 8; v++) {
      const c = counts[v]!;
      if (!c) continue;
      const a1 = a0 + (c / 20) * TAU;
      const mid = (a0 + a1) / 2;
      const off = modes.includes(v) ? 4 : 0;
      const ox = Math.cos(mid) * off;
      const oy = Math.sin(mid) * off;
      g.beginPath();
      g.moveTo(cx + ox, cy + oy);
      g.arc(cx + ox, cy + oy, r, a0, a1);
      g.closePath();
      g.fillStyle = catCol(v);
      g.fill();
      g.strokeStyle = '#0b1022';
      g.lineWidth = 0.8;
      g.stroke();
      const lr = r * 0.66;
      if (c >= 2) {
        text(g, `${v}권`, cx + ox + Math.cos(mid) * lr, cy + oy + Math.sin(mid) * lr - 3.5, 5.8, modes.includes(v) ? DARK : INK, 'center', 800);
        text(g, `${c * 5}%`, cx + ox + Math.cos(mid) * lr, cy + oy + Math.sin(mid) * lr + 3.8, 5.2, modes.includes(v) ? DARK : inkA(0.8), 'center', 700);
      } else text(g, `${v}`, cx + ox + Math.cos(mid) * (r + 6), cy + oy + Math.sin(mid) * (r + 6), 5.6, inkA(0.6), 'center', 700);
      a0 = a1;
    }
    g.globalAlpha = 1;
  }
  function boxPlot(g: G, al: number): void {
    g.globalAlpha = al;
    const base = 150;
    g.strokeStyle = inkA(0.35);
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(14, base);
    g.lineTo(192, base);
    g.stroke();
    for (let v = 0; v <= 8; v++) {
      text(g, String(v), X(v), base + 5, 5.8, inkA(0.5), 'center');
      for (let i = 0; i < counts[v]!; i++) {
        g.fillStyle = modes.includes(v) ? ACC : 'rgba(150,185,255,0.85)';
        g.beginPath();
        g.arc(X(v), base - 4 - i * 6.6, 2.6, 0, TAU);
        g.fill();
      }
    }
    const y0 = 44;
    const y1 = 70;
    g.strokeStyle = INK;
    g.lineWidth = 0.9;
    g.beginPath();
    g.moveTo(X(mn), (y0 + y1) / 2);
    g.lineTo(X(q1), (y0 + y1) / 2);
    g.moveTo(X(q3), (y0 + y1) / 2);
    g.lineTo(X(mx), (y0 + y1) / 2);
    g.moveTo(X(mn), y0 + 6);
    g.lineTo(X(mn), y1 - 6);
    g.moveTo(X(mx), y0 + 6);
    g.lineTo(X(mx), y1 - 6);
    g.stroke();
    g.fillStyle = coolA(0.2);
    g.fillRect(X(q1), y0, Math.max(1, X(q3) - X(q1)), y1 - y0);
    g.strokeRect(X(q1), y0, Math.max(1, X(q3) - X(q1)), y1 - y0);
    g.strokeStyle = ACC;
    g.lineWidth = 1.8;
    g.beginPath();
    g.moveTo(X(median), y0 - 2);
    g.lineTo(X(median), y1 + 2);
    g.stroke();
    text(g, `중앙값 ${f1(median)}`, X(median), y0 - 7, 6, ACC, 'center', 700);
    text(g, `Q1 ${f1(q1)}`, X(q1), y1 + 6, 5.4, inkA(0.6), 'center');
    text(g, `Q3 ${f1(q3)}`, X(q3), y1 + 6, 5.4, inkA(0.6), 'center');
    if (marks) meanMark(g, base + 9);
    g.globalAlpha = 1;
  }
  const DRAW = [bars, band, pie, boxPlot];
  return {
    draw(g, _t, dt) {
      clock += dt;
      const PER = 3.6;
      let cur: number;
      let prev: number;
      let k = 1;
      if (fixed) {
        cur = fixed - 1;
        prev = cur;
      } else {
        const idx = Math.floor(clock / PER);
        cur = idx % 4;
        prev = (idx + 3) % 4;
        k = smooth(0, 0.5, clock - idx * PER);
        if (idx > 0 && idx % 4 === 0 && clock - idx * PER < dt) gen();
      }
      if (k < 1) DRAW[prev]!(g, 1 - k);
      DRAW[cur]!(g, k);
      // 제목
      text(g, NAMES[cur]!, 14, 13, 9, INK, 'left', 800);
      text(g, TIPS[cur]!, 14, 24, 6.2, accA(0.85), 'left', 600);
      // 오른쪽 셈
      const x0 = 200;
      rr(g, x0 - 4, 8, 78, 92, 6);
      g.fillStyle = 'rgba(10,14,32,0.6)';
      g.fill();
      g.strokeStyle = inkA(0.12);
      g.lineWidth = 0.6;
      g.stroke();
      text(g, '읽은 책 수 20명', x0, 18, 6.4, inkA(0.6), 'left', 700);
      const sum = data.reduce((a, b) => a + b, 0);
      mtext(g, ['평균 ', ['/', String(sum), '20'], ' = ', ['c', ACC, fN(mean, 2)]], x0, 36, 7.4, 'l', INK, 700);
      mtext(g, ['중앙값 ', ['/', `${[...data].sort((a, b) => a - b)[9]}+${[...data].sort((a, b) => a - b)[10]}`, '2'], ' = ', ['c', ACC, f1(median)]], x0, 58, 7.4, 'l', INK, 700);
      text(g, `최빈값 ${modes.join(', ')}`, x0, 78, 7.4, INK, 'left', 700);
      text(g, `(${Math.max(...counts)}명)`, x0, 89, 6, inkA(0.5), 'left');
      // 자료 줄
      const s = [...data].sort((a, b) => a - b);
      for (let i = 0; i < 20; i++) {
        const xx = x0 - 2 + (i % 10) * 7.6;
        const yy = 114 + Math.floor(i / 10) * 11;
        const mid = i === 9 || i === 10;
        rr(g, xx - 3.2, yy - 4.5, 6.4, 9, 1.5);
        g.fillStyle = mid ? accA(0.25) : inkA(0.05);
        g.fill();
        text(g, String(s[i]), xx, yy + 0.3, 5.8, mid ? ACC : inkA(0.75), 'center', 700);
      }
      text(g, '작은 수부터 · 10 · 11번째가 가운데', x0 + 34, 140, 5.2, inkA(0.45), 'center');
    },
    controls: [
      { type: 'button', label: '새 자료 (무작위 20명)', on: () => gen() },
      { type: 'range', label: '그래프 (0 자동 · 1 막대 · 2 띠 · 3 원 · 4 상자)', min: 0, max: 4, step: 1, value: 0, on: (v) => ((fixed = v), (clock = 0)) },
      { type: 'toggle', label: '평균 · 중앙값 표시', value: true, on: (v) => (marks = v) },
    ],
  };
});

/* ═════════════════════════ i414 리만 합 ═════════════════════════ */
const i414 = cv('곡선 아래를 막대 n 개로 — 막대를 둘로 쪼갤수록 왼쪽 · 오른쪽 · 가운데 합이 모두 정확한 넓이(적분값)로 모인다', () => {
  const FUNS: { f: (x: number) => number; exact: number; exactTok: Tok[]; name: Tok[] }[] = [
    { f: (x) => 1 + (x * x) / 4, exact: 28 / 3, exactTok: [['/', '28', '3']], name: [['i', 'y'], ' = 1 + ', ['/', 'x²', '4']] },
    { f: (x) => 1 + 2 * Math.sin((Math.PI * x) / 4), exact: 4 + 16 / Math.PI, exactTok: ['4 + ', ['/', '16', 'π']], name: [['i', 'y'], ' = 1 + 2 sin ', ['/', 'πx', '4']] },
    { f: (x) => 5 / (1 + x), exact: 5 * Math.log(5), exactTok: ['5 ln 5'], name: [['i', 'y'], ' = ', ['/', '5', '1 + x']] },
  ];
  const NS = [2, 4, 8, 16, 32, 64];
  let fi = 0;
  let mode = 0; // 0 왼쪽 1 가운데 2 오른쪽
  let autoAll = true;
  let manualN = 4;
  let clock = 0;
  const GX = 16;
  const GY = 156;
  const SX = 40;
  const SY = 23;
  const X = (v: number): number => GX + v * SX;
  const Y = (v: number): number => GY - v * SY;
  const MODE_NAME = ['왼쪽', '가운데', '오른쪽'];
  const MODE_COL = ['#7fb2ff', ACC, '#ff8f7a'];
  function sum(n: number, m: number): number {
    const F = FUNS[fi]!.f;
    const h = 4 / n;
    let s = 0;
    for (let i = 0; i < n; i++) s += F(h * (i + (m === 0 ? 0 : m === 1 ? 0.5 : 1))) * h;
    return s;
  }
  return {
    draw(g, _t, dt) {
      clock += dt;
      const F = FUNS[fi]!;
      const HOLD = 1.5;
      let n: number;
      let parentN: number;
      let k = 1;
      if (autoAll) {
        const per = HOLD * NS.length;
        const idx = Math.floor(clock / HOLD);
        if (clock > per * 3) clock -= per * 3;
        mode = Math.floor(clock / per) % 3;
        const si = idx % NS.length;
        n = NS[si]!;
        parentN = si === 0 ? n : NS[si - 1]!;
        k = si === 0 ? 1 : smooth(0, 0.55, clock - idx * HOLD);
      } else {
        n = manualN;
        parentN = n;
      }
      // 축
      g.strokeStyle = inkA(0.35);
      g.lineWidth = 0.7;
      g.beginPath();
      g.moveTo(GX, Y(0));
      g.lineTo(X(4.15), Y(0));
      g.moveTo(GX, Y(0));
      g.lineTo(GX, Y(5.2));
      g.stroke();
      for (let i = 1; i <= 4; i++) text(g, String(i), X(i), GY + 6, 5.8, inkA(0.45), 'center');
      for (let j = 1; j <= 5; j++) text(g, String(j), GX - 4, Y(j), 5.6, inkA(0.4), 'right');
      // 막대
      const h = 4 / n;
      const sm = mode === 0 ? 0 : mode === 1 ? 0.5 : 1;
      const col = MODE_COL[mode]!;
      for (let i = 0; i < n; i++) {
        const xs = h * (i + sm);
        let v = F.f(xs);
        if (k < 1) {
          const ph = 4 / parentN;
          const pi = Math.floor((h * i + 1e-9) / ph);
          const pv = F.f(ph * (pi + sm));
          v = lerp(pv, v, k);
        }
        const x0 = X(h * i);
        const w = h * SX;
        g.fillStyle = mode === 1 ? accA(0.32) : mode === 0 ? 'rgba(127,178,255,0.32)' : 'rgba(255,143,122,0.3)';
        g.fillRect(x0, Y(v), w, v * SY);
        if (n <= 32) {
          g.strokeStyle = col;
          g.lineWidth = n <= 8 ? 0.8 : 0.5;
          g.strokeRect(x0, Y(v), w, v * SY);
        }
        if (n <= 16) {
          g.fillStyle = INK;
          g.beginPath();
          g.arc(X(xs), Y(F.f(xs)), n <= 8 ? 1.5 : 1, 0, TAU);
          g.fill();
        }
      }
      // 곡선
      g.beginPath();
      for (let i = 0; i <= 160; i++) {
        const xv = (4 * i) / 160;
        const yv = F.f(xv);
        if (i) g.lineTo(X(xv), Y(yv));
        else g.moveTo(X(xv), Y(yv));
      }
      g.strokeStyle = 'rgba(255,255,255,0.25)';
      g.lineWidth = 4;
      g.stroke();
      g.strokeStyle = INK;
      g.lineWidth = 1.4;
      g.stroke();
      mtext(g, F.name, X(0.15), 16, 8.4, 'l', INK, 700);
      pill(g, `${MODE_NAME[mode]} 끝 높이 · n = ${n}`, X(0.15), 32, 7, col === ACC ? ACC : INK);
      // 오른쪽
      const x0 = 188;
      rr(g, x0 - 4, 8, 90, 84, 6);
      g.fillStyle = 'rgba(10,14,32,0.65)';
      g.fill();
      g.strokeStyle = inkA(0.12);
      g.lineWidth = 0.6;
      g.stroke();
      text(g, `막대 ${n}개의 넓이 합`, x0, 18, 6.6, inkA(0.6), 'left', 700);
      for (let m = 0; m < 3; m++) {
        const s = sum(n, m);
        const on = m === mode;
        const y = 32 + m * 13;
        if (on) {
          rr(g, x0 - 2, y - 6, 86, 12, 3);
          g.fillStyle = 'rgba(255,255,255,0.07)';
          g.fill();
        }
        text(g, MODE_NAME[m]!, x0 + 1, y, 6.8, MODE_COL[m]!, 'left', 700);
        text(g, fN(s, 3), x0 + 50, y, 7.2, on ? INK : inkA(0.75), 'right', 700);
        text(g, (s - F.exact >= 0 ? '+' : '') + fN(s - F.exact, 3), x0 + 81, y, 5.4, inkA(0.5), 'right');
      }
      mtext(g, ['정확 ', ...F.exactTok, ' = ', ['c', ACC, fN(F.exact, 3)]], x0, 82, 7, 'l', INK, 700);
      // 모이는 그래프
      const px0 = x0 + 4;
      const px1 = x0 + 82;
      const py0 = 104;
      const py1 = 160;
      let lo = Infinity;
      let hi = -Infinity;
      const all = [2, 4, 8, 16, 32, 64, 128].map((nn) => [sum(nn, 0), sum(nn, 1), sum(nn, 2)]);
      for (const r of all) for (const v of r) (lo = Math.min(lo, v)), (hi = Math.max(hi, v));
      const pad = (hi - lo) * 0.12 + 1e-6;
      lo -= pad;
      hi += pad;
      const PX = (i: number): number => lerp(px0, px1, i / 6);
      const PY = (v: number): number => lerp(py1, py0, (v - lo) / (hi - lo));
      dashLine(g, px0, PY(F.exact), px1, PY(F.exact), accA(0.7), 0.7, [2, 2]);
      for (let m = 0; m < 3; m++) {
        g.strokeStyle = MODE_COL[m]!;
        g.globalAlpha = m === mode ? 1 : 0.45;
        g.lineWidth = m === mode ? 1.1 : 0.7;
        g.beginPath();
        all.forEach((r, i) => (i ? g.lineTo(PX(i), PY(r[m]!)) : g.moveTo(PX(i), PY(r[m]!))));
        g.stroke();
      }
      g.globalAlpha = 1;
      const ci = Math.round(Math.log2(n)) - 1;
      if (ci >= 0 && ci <= 6) glowDot(g, PX(ci), PY(sum(n, mode)), 2);
      text(g, 'n = 2 → 128', (px0 + px1) / 2, 168, 5.6, inkA(0.5), 'center');
    },
    controls: [
      { type: 'toggle', label: '자동 (n 늘리기 · 방식 바꾸기)', value: true, on: (v) => ((autoAll = v), (clock = 0)) },
      { type: 'range', label: '막대 수 n', min: 1, max: 100, step: 1, value: 4, on: (v) => ((autoAll = false), (manualN = v)) },
      { type: 'range', label: '높이 (1 왼쪽 · 2 가운데 · 3 오른쪽)', min: 1, max: 3, step: 1, value: 1, on: (v) => ((autoAll = false), (mode = v - 1)) },
      { type: 'range', label: '함수 (1 · 2 · 3)', min: 1, max: 3, step: 1, value: 1, on: (v) => (fi = v - 1) },
    ],
  };
});

/* ═════════════════════════ i415 공간 좌표 · 벡터 (3D) ═════════════════════════ */
function disposeAll(o: THREE.Object3D): void {
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mats = (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) as THREE.Material[];
    for (const mt of mats) {
      for (const v of Object.values(mt)) if (v && (v as THREE.Texture).isTexture) (v as THREE.Texture).dispose();
      mt.dispose();
    }
  });
}
function gradTex(top: string, bot: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, top);
  gr.addColorStop(1, bot);
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** 화면 위 글씨 층 — 글이 바뀔 때만 다시 그린다 */
class Hud {
  readonly scene = new THREE.Scene();
  readonly cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  private cv = document.createElement('canvas');
  private tex: THREE.CanvasTexture;
  private key = '';
  constructor() {
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.generateMipmaps = false;
    this.tex.minFilter = THREE.LinearFilter;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }),
    );
    m.position.z = -1;
    this.scene.add(m);
  }
  draw(rw: number, rh: number, key: string, fn: (g: CanvasRenderingContext2D, w: number, h: number, u: number) => void): void {
    const k = rw > 1400 ? 2 : 1;
    const cw = Math.max(2, Math.round(rw / k));
    const ch = Math.max(2, Math.round(rh / k));
    const full = `${key}|${cw}x${ch}`;
    if (full === this.key) return;
    this.key = full;
    if (this.cv.width !== cw || this.cv.height !== ch) {
      this.cv.width = cw;
      this.cv.height = ch;
      this.tex.dispose();
    }
    const g = this.cv.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cw, ch);
    resetG(g);
    fn(g, cw, ch, Math.min(cw / 280, ch / 175));
    this.tex.needsUpdate = true;
  }
  render(r: THREE.WebGLRenderer): void {
    const ac = r.autoClear;
    r.autoClear = false;
    r.clearDepth();
    r.render(this.scene, this.cam);
    r.autoClear = ac;
  }
  dispose(): void {
    disposeAll(this.scene);
  }
}
function labelSprite(s: string, color: string, px = 64, italic = true): THREE.Sprite {
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  g.font = font(px, 800, italic);
  const w = Math.ceil(g.measureText(s).width + px * 0.6);
  c.width = w;
  c.height = Math.ceil(px * 1.4);
  const g2 = c.getContext('2d')!;
  g2.font = font(px, 800, italic);
  g2.textAlign = 'center';
  g2.textBaseline = 'middle';
  g2.lineWidth = px * 0.18;
  g2.strokeStyle = 'rgba(6,9,20,0.85)';
  g2.strokeText(s, w / 2, c.height / 2);
  g2.fillStyle = color;
  g2.fillText(s, w / 2, c.height / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, depthWrite: false, toneMapped: false, transparent: true }));
  sp.renderOrder = 4;
  sp.userData.aspect = w / c.height;
  return sp;
}

const i415: Demo3D = {
  kind: '3d',
  caption: '공간 좌표 위 두 벡터 a · b — 성분 · 길이 √(x²+y²+z²), 이어 붙이면 평행사변형의 대각선이 a + b',
  make() {
    const scene = new THREE.Scene();
    scene.background = gradTex('#18224a', '#05070f');
    const cam = new THREE.PerspectiveCamera(36, 1.6, 0.1, 200);
    const objs = new THREE.Group();
    scene.add(objs);
    scene.add(new THREE.HemisphereLight(0xe4ecff, 0x1a2030, 1.3));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(6, 12, 8);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x8fb4ff, 0.8);
    rim.position.set(-8, 4, -6);
    scene.add(rim);
    // 수학 (x, y, z) → three (x, z, −y)
    const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, z, -y);
    const LIM = 7;
    // 바닥 모눈 (xy 평면)
    const grid = new THREE.GridHelper(LIM, LIM, 0x3a4878, 0x26304f);
    grid.position.set(LIM / 2, 0, -LIM / 2);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.7;
    objs.add(grid);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(LIM, LIM), new THREE.MeshBasicMaterial({ color: 0x101836, transparent: true, opacity: 0.55, depthWrite: false }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(LIM / 2, -0.01, -LIM / 2);
    objs.add(floor);
    // 축
    const shaftGeo = new THREE.CylinderGeometry(1, 1, 1, 14);
    const headGeo = new THREE.ConeGeometry(1, 1, 18);
    const Y1 = new THREE.Vector3(0, 1, 0);
    interface Arrow {
      g: THREE.Group;
      set(a: THREE.Vector3, b: THREE.Vector3): void;
    }
    function makeArrow(color: number, r: number, emis = 0.3): Arrow {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.15, emissive: color, emissiveIntensity: emis });
      const shaft = new THREE.Mesh(shaftGeo, mat);
      const head = new THREE.Mesh(headGeo, mat);
      g.add(shaft, head);
      objs.add(g);
      const d = new THREE.Vector3();
      return {
        g,
        set(a, b) {
          d.subVectors(b, a);
          const L = d.length();
          if (L < 1e-3) {
            g.visible = false;
            return;
          }
          g.visible = true;
          g.position.copy(a);
          g.quaternion.setFromUnitVectors(Y1, d.normalize());
          const hl = Math.min(r * 6, L * 0.45);
          shaft.scale.set(r, L - hl, r);
          shaft.position.y = (L - hl) / 2;
          head.scale.set(r * 2.6, hl, r * 2.6);
          head.position.y = L - hl / 2;
        },
      };
    }
    const axCol = 0x8b97bd;
    const axes = [makeArrow(axCol, 0.022, 0.1), makeArrow(axCol, 0.022, 0.1), makeArrow(axCol, 0.022, 0.1)];
    axes[0]!.set(V(0, 0, 0), V(LIM + 0.4, 0, 0));
    axes[1]!.set(V(0, 0, 0), V(0, LIM + 0.4, 0));
    axes[2]!.set(V(0, 0, 0), V(0, 0, 5.2));
    const sprites: THREE.Sprite[] = [];
    const addLabel = (s: string, col: string, p: THREE.Vector3, h: number, it = true): THREE.Sprite => {
      const sp = labelSprite(s, col, 64, it);
      sp.position.copy(p);
      sp.scale.set(h * (sp.userData.aspect as number), h, 1);
      objs.add(sp);
      sprites.push(sp);
      return sp;
    };
    addLabel('x', '#dfe6ff', V(LIM + 0.9, 0, 0), 0.55);
    addLabel('y', '#dfe6ff', V(0, LIM + 0.9, 0), 0.55);
    addLabel('z', '#dfe6ff', V(0, 0, 5.7), 0.55);
    for (let i = 1; i <= 6; i++) {
      addLabel(String(i), '#8d99c2', V(i, -0.45, 0), 0.32, false);
      addLabel(String(i), '#8d99c2', V(-0.45, i, 0), 0.32, false);
      if (i <= 4) addLabel(String(i), '#8d99c2', V(-0.35, 0, i), 0.32, false);
    }
    // 벡터
    const arA = makeArrow(0xffc04a, 0.05, 0.35);
    const arB = makeArrow(0x7cb4ff, 0.05, 0.35);
    const arS = makeArrow(0xf4f6ff, 0.058, 0.3);
    const arB2 = makeArrow(0x7cb4ff, 0.03, 0.2);
    const arA2 = makeArrow(0xffc04a, 0.03, 0.2);
    const lblA = addLabel('a', '#ffc04a', V(0, 0, 0), 0.5);
    const lblB = addLabel('b', '#9cc6ff', V(0, 0, 0), 0.5);
    const lblS = addLabel('a+b', '#ffffff', V(0, 0, 0), 0.5);
    // 평행사변형
    const pgGeo = new THREE.BufferGeometry();
    pgGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    pgGeo.setIndex([0, 1, 2, 0, 2, 3]);
    const pg = new THREE.Mesh(pgGeo, new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
    objs.add(pg);
    // 성분 점선 (a · a+b 끝에서 바닥 · 축으로)
    const dashGeo = new THREE.BufferGeometry();
    dashGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12 * 3 * 2), 3));
    const dash = new THREE.LineSegments(dashGeo, new THREE.LineDashedMaterial({ color: 0xc8d2f0, dashSize: 0.14, gapSize: 0.1, transparent: true, opacity: 0.75 }));
    objs.add(dash);
    // 끝 점
    const tipGeo = new THREE.SphereGeometry(0.11, 20, 14);
    const tipA = new THREE.Mesh(tipGeo, new THREE.MeshStandardMaterial({ color: 0xffd88a, emissive: 0xffb030, emissiveIntensity: 0.7 }));
    const tipB = new THREE.Mesh(tipGeo, new THREE.MeshStandardMaterial({ color: 0xb8d6ff, emissive: 0x4a8cff, emissiveIntensity: 0.7 }));
    const tipS = new THREE.Mesh(tipGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xaab8ff, emissiveIntensity: 0.5 }));
    const shadowA = new THREE.Mesh(new THREE.CircleGeometry(0.12, 20), new THREE.MeshBasicMaterial({ color: 0xffc04a, transparent: true, opacity: 0.6, depthWrite: false }));
    shadowA.rotation.x = -Math.PI / 2;
    objs.add(tipA, tipB, tipS, shadowA);

    const hud = new Hud();
    let auto = true;
    const a = new THREE.Vector3(2, 1, 3);
    const b = new THREE.Vector3(1, 3, 1);
    const aT = a.clone();
    const bT = b.clone();
    let clock = 0;
    let camT = 0;
    const randVec = (): THREE.Vector3 => {
      for (;;) {
        const v = new THREE.Vector3(rint(0, 3), rint(0, 3), rint(0, 3));
        if (v.lengthSq() >= 2) return v;
      }
    };
    const fmtLen = (sq: number): string => {
      const r = Math.round(sq);
      if (Math.abs(sq - r) > 0.01) return fN(Math.sqrt(sq), 2);
      const s = Math.round(Math.sqrt(r));
      return s * s === r ? String(s) : `√${r} ≈ ${fN(Math.sqrt(r), 2)}`;
    };
    const comp = (v: THREE.Vector3): string => `(${f1(v.x)}, ${f1(v.y)}, ${f1(v.z)})`;
    return {
      scene,
      camera: cam,
      update(_t, dt) {
        clock += dt;
        camT += dt;
        if (auto && clock > 3.4) {
          clock = 0;
          if (Math.random() < 0.5) aT.copy(randVec());
          else bT.copy(randVec());
        }
        const k = 1 - Math.exp(-dt * 4);
        a.lerp(aT, k);
        b.lerp(bT, k);
        if (a.distanceTo(aT) < 0.004) a.copy(aT);
        if (b.distanceTo(bT) < 0.004) b.copy(bT);
        const s = a.clone().add(b);
        const O = V(0, 0, 0);
        const A3 = V(a.x, a.y, a.z);
        const B3 = V(b.x, b.y, b.z);
        const S3 = V(s.x, s.y, s.z);
        arA.set(O, A3);
        arB.set(O, B3);
        arS.set(O, S3);
        arB2.set(A3, S3);
        arA2.set(B3, S3);
        tipA.position.copy(A3);
        tipB.position.copy(B3);
        tipS.position.copy(S3);
        shadowA.position.copy(V(a.x, a.y, 0)).setY(0.005);
        lblA.position.copy(A3).add(new THREE.Vector3(0.25, 0.35, 0));
        lblB.position.copy(B3).add(new THREE.Vector3(0.25, 0.35, 0));
        lblS.position.copy(S3).add(new THREE.Vector3(0.3, 0.4, 0));
        const pp = pgGeo.attributes.position as THREE.BufferAttribute;
        [O, A3, S3, B3].forEach((p, i) => pp.setXYZ(i, p.x, p.y, p.z));
        pp.needsUpdate = true;
        pgGeo.computeBoundingSphere();
        const dp = dashGeo.attributes.position as THREE.BufferAttribute;
        let di = 0;
        const seg = (p: THREE.Vector3, q: THREE.Vector3): void => {
          dp.setXYZ(di++, p.x, p.y, p.z);
          dp.setXYZ(di++, q.x, q.y, q.z);
        };
        const proj = (v: THREE.Vector3): void => {
          const top = V(v.x, v.y, v.z);
          const foot = V(v.x, v.y, 0);
          seg(top, foot);
          seg(foot, V(v.x, 0, 0));
          seg(foot, V(0, v.y, 0));
          seg(top, V(0, 0, v.z));
        };
        proj(a);
        proj(s);
        while (di < dp.count) dp.setXYZ(di++, 0, 0, 0);
        dp.needsUpdate = true;
        dash.computeLineDistances();
        dashGeo.computeBoundingSphere();
        // 카메라
        const ang = -0.95 + Math.sin(camT * 0.25) * 0.42;
        const tgt = new THREE.Vector3(2.6, 1.5, -2.6);
        const R = 16.5;
        cam.position.set(tgt.x + Math.cos(ang) * R, 9.5, tgt.z - Math.sin(ang) * R);
        cam.lookAt(tgt);
      },
      render(r, w, h) {
        cam.setViewOffset(w, h, -w * 0.11, -h * 0.06, w, h);
        r.render(scene, cam);
        const s = a.clone().add(b);
        const key = `${comp(a)}${comp(b)}`;
        hud.draw(w, h, key, (g, cw, ch, u) => {
          const x0 = 10 * u;
          let y = 14 * u;
          const line = (toks: Tok[], size: number, col = INK): void => {
            g.save();
            g.shadowColor = 'rgba(0,0,0,0.8)';
            g.shadowBlur = 4 * u;
            mtext(g, toks, x0, y, size * u, 'l', col, 700);
            g.restore();
            y += size * 1.6 * u;
          };
          const sq = (v: THREE.Vector3): number => v.x * v.x + v.y * v.y + v.z * v.z;
          line([['ic', ACC, 'a'], ' = ', comp(a), '   |', ['ic', ACC, 'a'], '| = ', ['c', ACC, fmtLen(sq(a))]], 9);
          line([['ic', '#9cc6ff', 'b'], ' = ', comp(b), '   |', ['ic', '#9cc6ff', 'b'], '| = ', ['c', '#9cc6ff', fmtLen(sq(b))]], 9);
          line([['ic', INK, 'a + b'], ' = ', comp(s), '   |', ['ic', INK, 'a+b'], '| = ', fmtLen(sq(s))], 9);
          mtext(g, ['|', ['i', 'a'], '|', ['^', '2'], ' = ', `${f1(a.x)}`, ['^', '2'], ' + ', `${f1(a.y)}`, ['^', '2'], ' + ', `${f1(a.z)}`, ['^', '2'], ' = ', f1(sq(a))], x0, ch - 12 * u, 7.5 * u, 'l', inkA(0.75), 600);
          text(g, '성분끼리 더하면 a + b', cw - 10 * u, ch - 12 * u, 7 * u, inkA(0.6), 'right', 600);
        });
        hud.render(r);
      },
      controls: [
        { type: 'toggle', label: '자동으로 벡터 바꾸기', value: true, on: (v) => (auto = v) },
        { type: 'range', label: 'a 의 x 성분', min: 0, max: 4, step: 1, value: 2, on: (v) => ((auto = false), (aT.x = v)) },
        { type: 'range', label: 'a 의 y 성분', min: 0, max: 4, step: 1, value: 1, on: (v) => ((auto = false), (aT.y = v)) },
        { type: 'range', label: 'a 의 z 성분', min: 0, max: 4, step: 1, value: 3, on: (v) => ((auto = false), (aT.z = v)) },
      ],
      dispose() {
        disposeAll(scene);
        hud.dispose();
        (scene.background as THREE.Texture).dispose();
      },
    };
  },
};

/* ═════════════════════════ i416 원주각 · 중심각 ═════════════════════════ */
const i416 = cv('원 위 점 P 가 움직여도 같은 호 AB 의 원주각은 그대로, 중심각의 꼭 반 — AB 가 지름이면 90° (큰 화면: P · A · B 끌기)', () => {
  const CX = 88;
  const CY = 94;
  const R = 66;
  let central = 100; // 작은 호 AB 의 중심각 (도)
  let rot = 0;
  let pA = 0;
  let auto = true;
  let clock = 0;
  let drag: '' | 'P' | 'A' | 'B' = '';
  let aA = 0;
  let aB = 0;
  const trail: number[] = [];
  const SEQ = [100, 60, 180, 140, 80];
  const pt = (a: number): [number, number] => [CX + Math.cos(a) * R, CY + Math.sin(a) * R];
  const deg = (r: number): number => (r * 180) / Math.PI;
  function angAt(v: [number, number], p: [number, number], q: [number, number]): number {
    const ux = p[0] - v[0];
    const uy = p[1] - v[1];
    const wx = q[0] - v[0];
    const wy = q[1] - v[1];
    return Math.acos(clamp((ux * wx + uy * wy) / (Math.hypot(ux, uy) * Math.hypot(wx, wy)), -1, 1));
  }
  function arcWedge(g: G, v: [number, number], p: [number, number], q: [number, number], r: number, fill: string, stroke: string): void {
    let a0 = Math.atan2(p[1] - v[1], p[0] - v[0]);
    let a1 = Math.atan2(q[1] - v[1], q[0] - v[0]);
    let d = a1 - a0;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    if (d < 0) {
      const tmp = a0;
      a0 = a1;
      a1 = tmp;
      d = -d;
    }
    g.beginPath();
    g.moveTo(v[0], v[1]);
    g.arc(v[0], v[1], r, a0, a0 + d);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    g.strokeStyle = stroke;
    g.lineWidth = 0.8;
    g.beginPath();
    g.arc(v[0], v[1], r, a0, a0 + d);
    g.stroke();
  }
  return {
    draw(g, _t, dt) {
      if (auto) {
        clock += dt;
        const PER = 5;
        const idx = Math.floor(clock / PER);
        const k = (clock % PER) / PER;
        const tgt = SEQ[idx % SEQ.length]!;
        central = lerp(central, tgt, 1 - Math.exp(-dt * 3));
        if (Math.abs(central - tgt) < 0.05) central = tgt;
        rot = Math.PI / 2;
        aA = rot - (central * Math.PI) / 360;
        aB = rot + (central * Math.PI) / 360;
        // P 는 큰 호 위를 오간다
        const big0 = aB + 0.18;
        const big1 = aA + TAU - 0.18;
        pA = lerp(big0, big1, 0.5 - 0.5 * Math.cos(k * TAU));
        if (Math.floor(clock * 2.2) !== Math.floor((clock - dt) * 2.2)) {
          trail.push(pA);
          if (trail.length > 5) trail.shift();
        }
      }
      const A = pt(aA);
      const B = pt(aB);
      const P = pt(pA);
      const O: [number, number] = [CX, CY];
      // 원
      g.fillStyle = 'rgba(255,255,255,0.025)';
      g.beginPath();
      g.arc(CX, CY, R, 0, TAU);
      g.fill();
      g.strokeStyle = inkA(0.45);
      g.lineWidth = 1;
      g.stroke();
      // P 와 같은 쪽인지 → 원주각이 보는 호
      let cen = angAt(O, A, B); // 0..π
      // P 가 작은 호 쪽이면 원주각은 큰 호(중심각 360 − cen)를 본다
      const mid = Math.atan2(Math.sin(aA) + Math.sin(aB), Math.cos(aA) + Math.cos(aB));
      const pSide = Math.cos(pA - mid) > Math.cos((aB - aA) / 2) && central < 179.5;
      const insc = angAt(P, A, B);
      // 호 AB (P 가 보는 호) 강조
      let s0 = aA;
      let s1 = aB;
      let dd = s1 - s0;
      while (dd < 0) dd += TAU;
      while (dd >= TAU) dd -= TAU;
      if (dd > Math.PI !== pSide) {
        s0 = aB;
        s1 = aA;
      }
      g.strokeStyle = coolA(0.35);
      g.lineWidth = 5;
      g.beginPath();
      g.arc(CX, CY, R, s0, s1 + (s1 < s0 ? TAU : 0));
      g.stroke();
      g.strokeStyle = COOL;
      g.lineWidth = 1.8;
      g.stroke();
      // 지나간 P 자취
      if (auto) {
        trail.forEach((ta, i) => {
          const T = pt(ta);
          g.globalAlpha = 0.12 + i * 0.05;
          g.strokeStyle = ACC;
          g.lineWidth = 0.7;
          g.beginPath();
          g.moveTo(A[0], A[1]);
          g.lineTo(T[0], T[1]);
          g.lineTo(B[0], B[1]);
          g.stroke();
          g.globalAlpha = 1;
        });
      }
      // 중심각
      const reflex = pSide;
      if (!reflex) arcWedge(g, O, A, B, 14, coolA(0.22), COOL);
      else {
        // 큰 쪽 중심각
        let a0 = Math.atan2(A[1] - CY, A[0] - CX);
        let a1 = Math.atan2(B[1] - CY, B[0] - CX);
        if (Math.cos(pA - mid) > 0) {
          const t2 = a0;
          a0 = a1;
          a1 = t2;
        }
        g.beginPath();
        g.moveTo(CX, CY);
        g.arc(CX, CY, 12, a1, a0, true);
        g.closePath();
        g.fillStyle = coolA(0.18);
        g.fill();
      }
      g.strokeStyle = COOL;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(A[0], A[1]);
      g.lineTo(CX, CY);
      g.lineTo(B[0], B[1]);
      g.stroke();
      // 원주각
      arcWedge(g, P, A, B, 13, accA(0.28), ACC);
      g.strokeStyle = ACC;
      g.lineWidth = 1.4;
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(A[0], A[1]);
      g.lineTo(P[0], P[1]);
      g.lineTo(B[0], B[1]);
      g.stroke();
      if (central > 179.5 || Math.abs(deg(insc) - 90) < 0.3) {
        // 직각 표시
        const ux = (A[0] - P[0]) / Math.hypot(A[0] - P[0], A[1] - P[1]);
        const uy = (A[1] - P[1]) / Math.hypot(A[0] - P[0], A[1] - P[1]);
        const wx = (B[0] - P[0]) / Math.hypot(B[0] - P[0], B[1] - P[1]);
        const wy = (B[1] - P[1]) / Math.hypot(B[0] - P[0], B[1] - P[1]);
        g.strokeStyle = INK;
        g.lineWidth = 0.9;
        g.beginPath();
        g.moveTo(P[0] + ux * 7, P[1] + uy * 7);
        g.lineTo(P[0] + ux * 7 + wx * 7, P[1] + uy * 7 + wy * 7);
        g.lineTo(P[0] + wx * 7, P[1] + wy * 7);
        g.stroke();
      }
      // 점
      glowDot(g, CX, CY, 2, COOL);
      text(g, 'O', CX + 5, CY + 6, 7, COOL, 'left', 800);
      glowDot(g, A[0], A[1], drag === 'A' ? 3.4 : 2.6, COOL);
      glowDot(g, B[0], B[1], drag === 'B' ? 3.4 : 2.6, COOL);
      glowDot(g, P[0], P[1], drag === 'P' ? 3.8 : 3);
      const lab = (p: [number, number], s: string, col: string): void => {
        const dx = p[0] - CX;
        const dy = p[1] - CY;
        const l = Math.hypot(dx, dy) || 1;
        text(g, s, p[0] + (dx / l) * 9, p[1] + (dy / l) * 9, 8, col, 'center', 800);
      };
      lab(A, 'A', COOL);
      lab(B, 'B', COOL);
      lab(P, 'P', ACC);
      // 오른쪽 셈
      cen = reflex ? TAU - cen : cen;
      const x0 = 172;
      rr(g, x0 - 4, 14, 106, 30, 6);
      g.fillStyle = accA(0.1);
      g.fill();
      g.strokeStyle = accA(0.45);
      g.lineWidth = 0.7;
      g.stroke();
      mtext(g, ['원주각 ∠APB'], x0 + 2, 23, 7, 'l', inkA(0.7), 700);
      text(g, `${fN(deg(insc), 1)}°`, x0 + 98, 34, 13, ACC, 'right', 800);
      rr(g, x0 - 4, 50, 106, 30, 6);
      g.fillStyle = coolA(0.08);
      g.fill();
      g.strokeStyle = coolA(0.4);
      g.stroke();
      mtext(g, [reflex ? '중심각 (큰 호)' : '중심각 ∠AOB'], x0 + 2, 59, 7, 'l', inkA(0.7), 700);
      text(g, `${fN(deg(cen), 1)}°`, x0 + 98, 70, 13, COOL, 'right', 800);
      mtext(g, [['c', COOL, fN(deg(cen), 1) + '°'], ' ÷ 2 = ', ['c', ACC, fN(deg(cen) / 2, 1) + '°']], x0 + 49, 96, 8.4, 'c', INK, 700);
      const isDia = central > 179.5;
      text(g, isDia ? 'AB 가 지름 → 원주각 90°' : 'P 를 옮겨도 원주각은 그대로', x0 + 49, 114, 7, isDia ? ACC : inkA(0.65), 'center', 700);
      if (reflex) text(g, 'P 가 작은 호 쪽 → 큰 호를 본다', x0 + 49, 127, 6.2, inkA(0.55), 'center');
      text(g, '같은 호의 원주각 = 중심각의 반', x0 + 49, 160, 6.4, inkA(0.5), 'center');
    },
    down(x, y) {
      const near = (a: number, r: number): boolean => {
        const p = pt(a);
        return Math.hypot(p[0] - x, p[1] - y) < r;
      };
      if (near(pA, 11)) drag = 'P';
      else if (near(aA, 10)) drag = 'A';
      else if (near(aB, 10)) drag = 'B';
      if (drag) {
        auto = false;
        trail.length = 0;
      }
    },
    move(x, y, pressed) {
      if (drag && pressed) {
        const a = Math.atan2(y - CY, x - CX);
        if (drag === 'P') pA = a;
        else if (drag === 'A') aA = a;
        else aB = a;
        let d = aB - aA;
        while (d < 0) d += TAU;
        while (d >= TAU) d -= TAU;
        central = deg(Math.min(d, TAU - d));
        return 'grabbing';
      }
      const hit = [pA, aA, aB].some((a) => {
        const p = pt(a);
        return Math.hypot(p[0] - x, p[1] - y) < 11;
      });
      return hit ? 'grab' : '';
    },
    up() {
      drag = '';
    },
    controls: [
      { type: 'toggle', label: '자동 (P 움직이기 · 호 바꾸기)', value: true, on: (v) => ((auto = v), (trail.length = 0)) },
      {
        type: 'range',
        label: '호 AB 의 중심각 (°)',
        min: 20,
        max: 180,
        step: 1,
        value: 100,
        on: (v) => {
          auto = false;
          central = v;
          const m = (aA + aB) / 2;
          aA = m - (v * Math.PI) / 360;
          aB = m + (v * Math.PI) / 360;
        },
      },
      {
        type: 'button',
        label: 'AB 를 지름으로',
        on: () => {
          auto = false;
          central = 180;
          const m = (aA + aB) / 2;
          aA = m - Math.PI / 2;
          aB = m + Math.PI / 2;
          pA = m + Math.PI + 0.7;
        },
      },
    ],
  };
});

/* ═════════════════════════ i417 연산 원리 그림 ═════════════════════════ */
const i417 = cv('23 × 14 를 넓이 네 칸으로 쪼개면 세로셈의 부분곱 · 나눗셈은 묶어 나누기와 덜어 내기 두 그림이 같은 답', () => {
  let ma = 23;
  let mb = 14;
  let scene = 0; // 0 자동 1 곱셈 2 나눗셈
  const DIVS: [number, number][] = [
    [24, 4],
    [27, 4],
    [18, 3],
    [30, 6],
    [20, 6],
    [35, 5],
    [16, 8],
  ];
  let di = 0;
  let clock = 0;
  let autoIdx = 0;
  function mult(g: G, t: number): void {
    const a = ma;
    const b = mb;
    const aT = Math.floor(a / 10) * 10;
    const aO = a % 10;
    const bT = Math.floor(b / 10) * 10;
    const bO = b % 10;
    const cell = Math.min(150 / a, 112 / b);
    const W = a * cell;
    const H = b * cell;
    const x0 = 14 + (152 - W) / 2;
    const y0 = 40 + (114 - H) / 2;
    // 칸 (오른쪽 끝 · 아래 끝은 일의 자리)
    const parts = [
      { w: aO, h: bO, x: aT, y: bT, col: 'rgba(255,192,74,0.75)', lab: `${aO}×${bO}` },
      { w: aT, h: bO, x: 0, y: bT, col: 'rgba(120,170,255,0.55)', lab: `${aT}×${bO}` },
      { w: aO, h: bT, x: aT, y: 0, col: 'rgba(255,150,120,0.55)', lab: `${aO}×${bT}` },
      { w: aT, h: bT, x: 0, y: 0, col: 'rgba(140,220,180,0.45)', lab: `${aT}×${bT}` },
    ];
    const gridA = smooth(0, 0.8, t);
    const splitA = smooth(0.8, 1.4, t);
    // 모눈
    g.globalAlpha = gridA;
    g.fillStyle = 'rgba(255,255,255,0.04)';
    g.fillRect(x0, y0, W, H);
    g.strokeStyle = inkA(0.12);
    g.lineWidth = 0.4;
    g.beginPath();
    for (let i = 0; i <= a; i++) {
      g.moveTo(x0 + i * cell, y0);
      g.lineTo(x0 + i * cell, y0 + H);
    }
    for (let j = 0; j <= b; j++) {
      g.moveTo(x0, y0 + j * cell);
      g.lineTo(x0 + W, y0 + j * cell);
    }
    g.stroke();
    g.globalAlpha = 1;
    // 칠하기
    parts.forEach((p, i) => {
      if (p.w === 0 || p.h === 0) return;
      const k = smooth(1.5 + i * 0.75, 2.1 + i * 0.75, t);
      if (k <= 0) return;
      const px = x0 + p.x * cell;
      const py = y0 + p.y * cell;
      g.globalAlpha = k;
      g.fillStyle = p.col;
      g.fillRect(px, py, p.w * cell, p.h * cell);
      const val = p.w * p.h;
      const big = p.w * cell > 26 && p.h * cell > 14;
      if (big) {
        text(g, p.lab, px + (p.w * cell) / 2, py + (p.h * cell) / 2 - 4, 6.4, INK, 'center', 700);
        text(g, `= ${val}`, px + (p.w * cell) / 2, py + (p.h * cell) / 2 + 5, 7.6, INK, 'center', 800);
      } else if (p.w * cell > 9 && p.h * cell > 7) text(g, String(val), px + (p.w * cell) / 2, py + (p.h * cell) / 2, 6, INK, 'center', 800);
      g.globalAlpha = 1;
    });
    // 나누는 선
    g.globalAlpha = splitA;
    g.strokeStyle = ACC;
    g.lineWidth = 1.2;
    g.setLineDash([3, 2]);
    g.beginPath();
    if (aO) {
      g.moveTo(x0 + aT * cell, y0 - 4);
      g.lineTo(x0 + aT * cell, y0 + H + 2);
    }
    if (bO) {
      g.moveTo(x0 - 2, y0 + bT * cell);
      g.lineTo(x0 + W + 4, y0 + bT * cell);
    }
    g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 1;
    g.strokeStyle = inkA(0.6);
    g.lineWidth = 0.8;
    g.strokeRect(x0, y0, W, H);
    // 길이 표시
    text(g, String(aT), x0 + (aT * cell) / 2, y0 - 6, 7, inkA(0.7 * splitA + 0.001), 'center', 700);
    if (aO) text(g, String(aO), x0 + aT * cell + (aO * cell) / 2, y0 - 6, 7, accA(splitA), 'center', 700);
    text(g, String(bT), x0 - 4, y0 + (bT * cell) / 2, 7, inkA(0.7 * splitA + 0.001), 'right', 700);
    if (bO) text(g, String(bO), x0 - 4, y0 + bT * cell + (bO * cell) / 2, 7, accA(splitA), 'right', 700);
    if (splitA < 0.5) {
      text(g, String(a), x0 + W / 2, y0 - 6, 7, inkA(0.7 * (1 - splitA * 2)), 'center', 700);
      text(g, String(b), x0 - 4, y0 + H / 2, 7, inkA(0.7 * (1 - splitA * 2)), 'right', 700);
    }
    // 세로셈
    const cx = 252;
    let y = 24;
    const row = (s: string, col: string): void => {
      text(g, s, cx, y, 9, col, 'right', 700);
      y += 12;
    };
    row(String(a), INK);
    text(g, '×', cx - 32, y, 9, inkA(0.7), 'right', 700);
    row(String(b), INK);
    g.fillStyle = inkA(0.5);
    g.fillRect(cx - 38, y - 6, 40, 0.8);
    y += 2;
    const vals = parts.map((p) => p.w * p.h);
    parts.forEach((p, i) => {
      if (p.w === 0 || p.h === 0) return;
      const k = smooth(1.5 + i * 0.75, 2.1 + i * 0.75, t);
      g.globalAlpha = k;
      const col = p.col.replace(/[\d.]+\)$/, '1)');
      text(g, String(vals[i]), cx, y, 9, col, 'right', 800);
      text(g, p.lab, cx - 42, y, 5.6, inkA(0.5), 'right');
      g.globalAlpha = 1;
      y += 12;
    });
    const kSum = smooth(4.6, 5.1, t);
    g.globalAlpha = kSum;
    g.fillStyle = inkA(0.5);
    g.fillRect(cx - 38, y - 6, 40, 0.8);
    y += 3;
    text(g, String(a * b), cx, y, 11, ACC, 'right', 800);
    g.globalAlpha = 1;
    mtext(g, [String(a), ' × ', String(b), ' = ', ['c', ACC, kSum > 0.5 ? String(a * b) : '?']], 14, 14, 10, 'l', INK, 800);
    text(g, '넓이 = 가로 × 세로, 네 칸을 더하기', 14, 168, 6.4, inkA(0.55), 'left');
  }
  function divide(g: G, t: number): void {
    const [N, d] = DIVS[di]!;
    const q = Math.floor(N / d);
    const r = N % d;
    const GN = q + (r ? 1 : 0);
    // 묶어 나누기: 그룹 배치
    const c = Math.ceil(Math.sqrt(d));
    const rows = Math.ceil(d / c);
    let best = { s: 0, gc: 1 };
    for (let gc = 1; gc <= GN; gc++) {
      const gr = Math.ceil(GN / gc);
      const s = Math.min(118 / (gc * (c + 0.9)), 74 / (gr * (rows + 0.9)));
      if (s > best.s) best = { s, gc };
    }
    const s = Math.min(best.s, 9);
    const gc = best.gc;
    const gw = (c + 0.9) * s;
    const gh = (rows + 0.9) * s;
    const totW = gc * gw;
    const ox = 12 + (122 - totW) / 2;
    const oy = 40;
    const stepT = Math.min(0.55, 3.6 / q);
    const formed = (i: number): number => smooth(0.6 + i * stepT, 0.6 + i * stepT + 0.45, t);
    // 처음 자리: 한 줄 8개 바둑판
    const cols0 = 12;
    const s0 = 9.6;
    for (let k = 0; k < N; k++) {
      const gi = Math.floor(k / d);
      const kk = k % d;
      const sx = 14 + (k % cols0) * s0 + s0 / 2;
      const sy = 124 + Math.floor(k / cols0) * s0;
      const gx = ox + (gi % gc) * gw + 0.45 * s + (kk % c) * s + s / 2;
      const gy = oy + Math.floor(gi / gc) * gh + 0.45 * s + Math.floor(kk / c) * s + s / 2;
      const f = gi < q ? formed(gi) : smooth(0.6 + q * stepT, 0.6 + q * stepT + 0.45, t);
      const x = lerp(sx, gx, f);
      const y = lerp(sy, gy, f);
      g.fillStyle = gi < q ? (f > 0.99 ? ACC : '#d9b46a') : '#8a93ad';
      g.beginPath();
      g.arc(x, y, Math.max(1.6, s * 0.34), 0, TAU);
      g.fill();
    }
    for (let i = 0; i < q; i++) {
      const f = formed(i);
      if (f <= 0) continue;
      const gx = ox + (i % gc) * gw;
      const gy = oy + Math.floor(i / gc) * gh;
      g.globalAlpha = f;
      rr(g, gx + 0.15 * s, gy + 0.15 * s, gw - 0.3 * s, gh - 0.3 * s, s * 0.6);
      g.strokeStyle = accA(0.8);
      g.lineWidth = 0.8;
      g.stroke();
      g.globalAlpha = 1;
    }
    const doneG = Math.round(clamp((t - 0.6) / stepT, 0, q));
    text(g, '묶어 나누기', 14, 30, 7.6, INK, 'left', 800);
    text(g, `${d}개씩 묶음 → ${doneG}묶음`, 132, 30, 6.6, ACC, 'right', 700);
    // 덜어 내기: 수직선
    const lx0 = 152;
    const lx1 = 270;
    const ly = 112;
    const LX = (v: number): number => lerp(lx0, lx1, v / N);
    text(g, '덜어 내기', 152, 30, 7.6, INK, 'left', 800);
    g.strokeStyle = inkA(0.5);
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(lx0, ly);
    g.lineTo(lx1, ly);
    g.stroke();
    for (let v = 0; v <= N; v++) {
      const major = v % d === N % d || v === 0 || v === N;
      g.fillStyle = major ? inkA(0.6) : inkA(0.2);
      g.fillRect(LX(v) - 0.3, ly - (major ? 3 : 1.6), 0.6, major ? 6 : 3.2);
    }
    text(g, '0', LX(0), ly + 8, 6, inkA(0.6), 'center', 700);
    text(g, String(N), LX(N), ly + 8, 6, INK, 'center', 700);
    let pos = N;
    for (let i = 0; i < q; i++) {
      const f = formed(i);
      if (f <= 0) break;
      const from = N - i * d;
      const to = from - d;
      const xa = LX(from);
      const xb = LX(to);
      const mid = (xa + xb) / 2;
      const hgt = 10 + (xa - xb) * 0.25;
      g.strokeStyle = ACC;
      g.lineWidth = 1;
      g.beginPath();
      const steps = 20;
      for (let j = 0; j <= steps * f; j++) {
        const u = j / steps;
        const x = lerp(xa, xb, u);
        const y = ly - Math.sin(u * Math.PI) * hgt;
        if (j) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.stroke();
      if (f > 0.6) text(g, `−${d}`, mid, ly - hgt - 5, 5.8, ACC, 'center', 700);
      if (f > 0.95) {
        text(g, String(to), xb, ly + 8, 5.4, inkA(0.6), 'center');
        pos = to;
      }
    }
    glowDot(g, LX(pos), ly, 2.2);
    text(g, `${d}${'0136780'.includes(String(d % 10)) ? '을' : '를'} ${doneG}번 덜어 냄`, (lx0 + lx1) / 2, ly + 22, 6.6, ACC, 'center', 700);
    if (r && doneG === q) text(g, `남은 수 ${r} (${d}보다 작아 더 못 덜어 냄)`, (lx0 + lx1) / 2, ly + 33, 6, inkA(0.6), 'center');
    // 식
    const fin = t > 0.6 + q * stepT + 0.5;
    mtext(g, [String(N), ' ÷ ', String(d), ' = ', ['c', ACC, fin ? String(q) : '?'], fin && r ? ` … ${r}` : ''], 14, 14, 10, 'l', INK, 800);
    if (fin) mtext(g, [`검산  ${d} × ${q}${r ? ' + ' + r : ''} = ${N}`], 211, 160, 6.6, 'c', inkA(0.6), 600);
  }
  return {
    draw(g, _t, dt) {
      clock += dt;
      const LEN = 8;
      let which: number;
      if (scene === 0) {
        if (clock > LEN) {
          clock = 0;
          autoIdx++;
          if (autoIdx % 2 === 1) di = (di + 1) % DIVS.length;
        }
        which = autoIdx % 2;
      } else {
        which = scene - 1;
        if (clock > LEN + 1.5) clock = 0;
      }
      if (which === 0) mult(g, clock);
      else divide(g, clock);
    },
    controls: [
      { type: 'range', label: '장면 (0 자동 · 1 곱셈 · 2 나눗셈)', min: 0, max: 2, step: 1, value: 0, on: (v) => ((scene = v), (clock = 0)) },
      { type: 'range', label: '곱셈 앞 수', min: 11, max: 39, step: 1, value: 23, on: (v) => ((ma = v), (scene = 1), (clock = 0)) },
      { type: 'range', label: '곱셈 뒤 수', min: 11, max: 29, step: 1, value: 14, on: (v) => ((mb = v), (scene = 1), (clock = 0)) },
      { type: 'range', label: '나눗셈 (24÷4 · 27÷4 · 18÷3 · 30÷6 · 20÷6 · 35÷5 · 16÷8)', min: 1, max: 7, step: 1, value: 1, on: (v) => ((di = v - 1), (scene = 2), (clock = 0)) },
    ],
  };
});

export const DEMOS: DemoMap = { i408, i409, i410, i411, i412, i413, i414, i415, i416, i417 };

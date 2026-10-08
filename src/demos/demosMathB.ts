import type { Control, DemoDom, DemoMap } from './types';

/**
 * 수학 원리 · 수와 변화 (i372 ~ i383) — 「원리가 눈에 보이는」 견본.
 * 모두 kind 'dom' + 캔버스 하나: 280 × 175 설계 좌표로 그리고 화면에 맞춰 확대한다.
 * 큰 화면(폭 420 이상)에서만 직접 끌기 · 누르기가 된다.
 * 확률 견본(i379 · i380 · i381 · i382 카오스 게임)은 Math.random 으로 실제 시행한다.
 * 화면의 모든 숫자는 그 순간의 실제 계산값이다.
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

const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const smooth = (e0: number, e1: number, x: number): number => {
  const v = clamp((x - e0) / (e1 - e0), 0, 1);
  return v * v * (3 - 2 * v);
};
const backOut = (x: number): number => {
  const c = 1.7;
  const v = x - 1;
  return 1 + (c + 1) * v * v * v + c * v * v;
};
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
const lcm = (a: number, b: number): number => (a / gcd(a, b)) * b;
const comma = (n: number): string => Math.round(n).toLocaleString('en-US');
/** 소수 한 자리까지 — 음수는 진짜 빼기 기호 */
const f1 = (v: number): string => {
  const r = Math.round(v * 10) / 10;
  const s = String(Math.abs(r) < 1e-9 ? 0 : Math.abs(r));
  return (r < -1e-9 ? '−' : '') + s;
};
const fN = (v: number, d: number): string => (v < 0 ? '−' : '') + Math.abs(v).toFixed(d);
const font = (px: number, wt = 600, it = false): string => `${it ? 'italic ' : ''}${wt} ${px}px ${F}`;

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
function pill(g: G, s: string, x: number, y: number, size: number, col = ACC): number {
  g.font = font(size, 700);
  const w = g.measureText(s).width + size * 1.3;
  rr(g, x, y - size * 0.85, w, size * 1.7, size * 0.85);
  g.fillStyle = col === ACC ? accA(0.12) : inkA(0.06);
  g.fill();
  g.strokeStyle = col === ACC ? accA(0.55) : inkA(0.25);
  g.lineWidth = 0.7;
  g.stroke();
  text(g, s, x + size * 0.65, y + 0.3, size, col, 'left', 700);
  return w;
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
  g.arc(x, y, r * 3.2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = col;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.beginPath();
  g.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2);
  g.fill();
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

/** 점을 쌓아 두는 화면 밖 캔버스 (설계 좌표 영역 하나, 확대가 바뀌면 다시 그림) */
class Dots {
  c: HTMLCanvasElement | null = null;
  k = 0;
  drawn = 0;
  constructor(public w: number, public h: number) {}
  ctx(g: G): CanvasRenderingContext2D {
    const k = g.getTransform().a;
    if (!this.c || Math.abs(this.k - k) > 0.01) {
      this.c = document.createElement('canvas');
      this.c.width = Math.max(1, Math.ceil(this.w * k));
      this.c.height = Math.max(1, Math.ceil(this.h * k));
      this.k = k;
      this.drawn = 0;
    }
    return this.c.getContext('2d')!;
  }
  clear(): void {
    if (this.c) this.c.getContext('2d')!.clearRect(0, 0, this.c.width, this.c.height);
    this.drawn = 0;
  }
  blit(g: G, x: number, y: number): void {
    if (this.c) g.drawImage(this.c, x, y, this.w, this.h);
  }
}

/* ═════════════════════════ i372 분수 ═════════════════════════ */
function fracBar(g: G, x: number, y: number, w: number, h: number, n: number, oldN: number, cut: number, fills: { from: number; to: number; col: string | CanvasGradient }[]): void {
  rr(g, x, y, w, h, 3.5);
  g.fillStyle = 'rgba(255,255,255,0.045)';
  g.fill();
  g.save();
  rr(g, x, y, w, h, 3.5);
  g.clip();
  for (const f of fills) {
    g.fillStyle = f.col;
    g.fillRect(x + w * f.from, y, w * (f.to - f.from), h);
  }
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.fillRect(x, y, w, h * 0.22);
  for (let i = 1; i < n; i++) {
    const old = oldN > 0 && (i * oldN) % n === 0;
    const L = old ? h : h * cut;
    if (L <= 0.2) continue;
    const xx = x + (w * i) / n;
    g.fillStyle = 'rgba(8,11,26,0.85)';
    g.fillRect(xx - 0.7, y + (h - L) / 2, 1.4, L);
  }
  g.restore();
  rr(g, x, y, w, h, 3.5);
  g.strokeStyle = inkA(0.28);
  g.lineWidth = 0.8;
  g.stroke();
}
function fracPie(g: G, cx: number, cy: number, r: number, n: number, oldN: number, cut: number, filled: number): void {
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = 'rgba(255,255,255,0.045)';
  g.fill();
  if (filled > 0) {
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * filled);
    g.closePath();
    g.fillStyle = accFill(g, cy - r, cy + r);
    g.fill();
  }
  g.strokeStyle = 'rgba(8,11,26,0.85)';
  g.lineWidth = 1.4;
  for (let i = 0; i < n; i++) {
    const old = oldN > 0 && (i * oldN) % n === 0;
    const L = old ? r : r * cut;
    if (L <= 0.2) continue;
    const a = -Math.PI / 2 + (Math.PI * 2 * i) / n;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L);
    g.stroke();
  }
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.strokeStyle = inkA(0.28);
  g.lineWidth = 0.8;
  g.stroke();
}

const i372 = cv('막대 · 원을 다시 쪼개도 색칠한 양은 그대로 — 1/2 = 2/4 = 4/8, 분모를 맞추면 분수 덧셈은 칸 세기', () => {
  let P = 1;
  let Q = 2;
  let alt = true;
  let clock = 0;
  let drag = false;
  const MS = [1, 2, 4];
  const STEP = 2.3;
  const EQ_T = STEP * 3 + 1.4;
  const ADD_T = 7.2;
  const PAIRS = [
    [1, 2, 1, 3],
    [1, 4, 2, 3],
    [2, 5, 1, 2],
    [1, 6, 3, 4],
  ];
  const BX = 118;
  const BW = 150;
  const YS = [32, 66, 100];
  const BH = 22;

  function drawEq(g: G, tau: number): void {
    const k = Math.min(2, Math.floor(tau / STEP));
    const loc = tau - k * STEP;
    const m = MS[k]!;
    const oldM = k > 0 ? MS[k - 1]! : 0;
    const cut = k === 0 ? 1 : smooth(0.35, 1.0, loc);
    // 원
    const appear0 = k === 0 ? smooth(0, 0.4, loc) : 1;
    g.globalAlpha = appear0;
    fracPie(g, 58, 80, 40, Q * m, Q * oldM, cut, P / Q);
    g.globalAlpha = 1;
    mtext(g, [['/', String(P * m), String(Q * m), ACC]], 58, 136, 13, 'c');
    // 같은 길이 표시선
    if (k >= 1 || loc > 1.2) {
      const xx = BX + (BW * P) / Q;
      g.strokeStyle = accA(0.55);
      g.setLineDash([2.5, 2.5]);
      g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(xx, YS[0]! - 5);
      g.lineTo(xx, YS[Math.min(k, 2)]! + BH + 5);
      g.stroke();
      g.setLineDash([]);
    }
    for (let r = 0; r <= k; r++) {
      const mr = MS[r]!;
      const mo = r > 0 ? MS[r - 1]! : 0;
      let y = YS[r]!;
      let a = 1;
      let cutR = 1;
      if (r === k) {
        if (r === 0) a = smooth(0, 0.4, loc);
        else {
          const s = smooth(0, 0.35, loc);
          y = lerp(YS[r - 1]!, YS[r]!, s);
          a = s;
          cutR = cut;
        }
      }
      g.globalAlpha = a;
      fracBar(g, BX, y, BW, BH, Q * mr, Q * mo, cutR, [{ from: 0, to: P / Q, col: accFill(g, y, y + BH, r === k ? 1 : 0.6) }]);
      mtext(g, [['/', String(P * mr), String(Q * mr), r === k ? ACC : INK]], BX - 8, y + BH / 2, 11, 'r');
      g.globalAlpha = 1;
    }
    // 아래 등식
    const toks: Tok[] = [];
    for (let j = 0; j <= k; j++) {
      if (j) toks.push('  =  ');
      toks.push(['/', String(P * MS[j]!), String(Q * MS[j]!), j === k ? ACC : INK]);
    }
    mtext(g, toks, 193, 150, 15, 'c');
  }

  function drawAdd(g: G, tau: number, idx: number): void {
    const pr = PAIRS[idx % PAIRS.length]!;
    const a = pr[0]!;
    const b = pr[1]!;
    const c = pr[2]!;
    const d = pr[3]!;
    const L = lcm(b, d);
    const A = (a * L) / b;
    const C = (c * L) / d;
    const S = A + C;
    const gg = gcd(S, L);
    const cut = smooth(1.2, 2.4, tau);
    const mv = smooth(2.6, 4.0, tau);
    const sumOn = smooth(4.0, 4.5, tau);
    const fa = a / b;
    const fc = c / d;
    const pale = 'rgba(255,236,196,0.92)';
    g.globalAlpha = smooth(0, 0.5, tau);
    fracBar(g, BX, YS[0]!, BW, BH, cut > 0 ? L : b, b, cut, [{ from: 0, to: fa, col: accFill(g, YS[0]!, YS[0]! + BH) }]);
    fracBar(g, BX, YS[1]!, BW, BH, cut > 0 ? L : d, d, cut, [{ from: 0, to: fc, col: pale }]);
    const lab = (num: number, den: number, nn: number, dd: number): Tok => (cut > 0.5 ? ['/', String(nn), String(dd), ACC] : ['/', String(num), String(den)]);
    mtext(g, [lab(a, b, A, L)], BX - 8, YS[0]! + BH / 2, 11, 'r');
    mtext(g, [lab(c, d, C, L)], BX - 8, YS[1]! + BH / 2, 11, 'r');
    g.globalAlpha = 1;
    // 합 막대
    const y2 = YS[2]!;
    g.globalAlpha = smooth(2.3, 2.7, tau);
    fracBar(g, BX, y2, BW, BH, L, L, sumOn, []);
    g.globalAlpha = 1;
    if (mv > 0) {
      const ya = lerp(YS[0]!, y2, mv);
      const yc = lerp(YS[1]!, y2, mv);
      const xc = lerp(0, fa, mv);
      g.save();
      g.globalAlpha = 0.95;
      rr(g, BX, ya, BW * fa, BH, 3.5);
      g.fillStyle = accFill(g, ya, ya + BH);
      g.fill();
      rr(g, BX + BW * xc, yc, BW * fc, BH, 3.5);
      g.fillStyle = pale;
      g.fill();
      g.restore();
      if (sumOn > 0) fracBar(g, BX, y2, BW, BH, L, L, sumOn, [
        { from: 0, to: fa, col: accFill(g, y2, y2 + BH) },
        { from: fa, to: fa + fc, col: pale },
      ]);
    }
    if (sumOn > 0) {
      g.globalAlpha = sumOn;
      mtext(g, [['/', String(S), String(L), ACC]], BX - 8, y2 + BH / 2, 11, 'r');
      g.globalAlpha = 1;
    }
    // 왼쪽 안내
    text(g, '분수 덧셈', 22, 36, 9, inkA(0.55));
    mtext(g, [['/', String(a), String(b)], ' + ', ['/', String(c), String(d)]], 22, 62, 16);
    if (cut > 0.1) {
      g.globalAlpha = smooth(1.2, 1.6, tau);
      pill(g, `분모를 ${L}로 맞추기`, 20, 94, 8);
      g.globalAlpha = 1;
    }
    if (sumOn > 0) {
      g.globalAlpha = sumOn;
      text(g, `${L}등분 칸 ${A} + ${C} = ${S}칸`, 22, 118, 8.5, inkA(0.8));
      g.globalAlpha = 1;
    }
    const toks: Tok[] = [['/', String(a), String(b)], ' + ', ['/', String(c), String(d)]];
    if (cut > 0.5) toks.push('  =  ', ['/', String(A), String(L)], ' + ', ['/', String(C), String(L)]);
    if (sumOn > 0.5) {
      toks.push('  =  ', ['/', String(S), String(L), ACC]);
      if (gg > 1) toks.push('  =  ', ['/', String(S / gg), String(L / gg), ACC]);
    }
    mtext(g, toks, 140, 152, 13.5, 'c');
  }

  return {
    draw(g, _t, dt) {
      if (!drag) clock += dt;
      const period = EQ_T + (alt ? ADD_T : 0);
      const cyc = Math.floor(clock / period);
      const tau = clock - cyc * period;
      if (drag) drawEq(g, STEP * 2 + 2);
      else if (tau < EQ_T) drawEq(g, Math.min(tau, STEP * 3 - 0.01));
      else drawAdd(g, tau - EQ_T, cyc);
    },
    down(x, y) {
      if (x >= BX - 4 && x <= BX + BW + 4 && y >= 20 && y <= 130) {
        drag = true;
        P = clamp(Math.round(((x - BX) / BW) * Q), 1, Q);
      }
    },
    move(x, y, pressed) {
      if (drag && pressed) P = clamp(Math.round(((x - BX) / BW) * Q), 1, Q);
      return x >= BX - 4 && x <= BX + BW + 4 && y >= 20 && y <= 130 ? 'ew-resize' : '';
    },
    up() {
      drag = false;
      clock = STEP * 2 + 0.6;
    },
    controls: [
      { type: 'range', label: '분모', min: 2, max: 6, step: 1, value: 2, on: (v) => ((Q = v), (P = Math.min(P, Q)), (clock = 0)) },
      { type: 'range', label: '분자', min: 1, max: 6, step: 1, value: 1, on: (v) => ((P = Math.min(v, Q)), (clock = 0)) },
      { type: 'toggle', label: '분수 덧셈도 번갈아 보기', value: true, on: (v) => ((alt = v), (clock = 0)) },
    ],
  };
});

/* ═════════════════════════ i373 에라토스테네스의 체 ═════════════════════════ */
const i373 = cv('수판에서 2 · 3 · 5 · 7 의 배수를 차례로 지우면 소수만 남는다 — 약수는 직사각형 배열의 가로 · 세로', () => {
  let N = 100;
  let speed = 1;
  let showDiv = true;
  let clock = 0;
  let sel = -1;
  const D = 2.2;
  let sieveP: number[] = [];
  let cross = new Float32Array(1);
  let hits: number[][] = [];
  let isPrime = new Uint8Array(1);
  let glowT = new Float32Array(1);
  let primes: number[] = [];
  let Tf = 0;
  let Tdiv = 0;
  let period = 1;
  function build(): void {
    sieveP = [];
    isPrime = new Uint8Array(N + 1);
    for (let i = 2; i <= N; i++) isPrime[i] = 1;
    for (let i = 2; i * i <= N; i++) if (isPrime[i]) for (let j = i * i; j <= N; j += i) isPrime[j] = 0;
    primes = [];
    for (let i = 2; i <= N; i++) if (isPrime[i]) primes.push(i);
    for (const p of primes) if (p * p <= N) sieveP.push(p);
    cross = new Float32Array(N + 1).fill(Infinity);
    hits = Array.from({ length: N + 1 }, () => [] as number[]);
    sieveP.forEach((p, k) => {
      const cnt = Math.floor(N / p) - 1;
      for (let j = 0; j < cnt; j++) {
        const n = (j + 2) * p;
        const tm = k * D + 0.4 + (1.45 * j) / Math.max(1, cnt - 1);
        hits[n]!.push(tm);
        if (tm < cross[n]!) cross[n] = tm;
      }
    });
    Tf = sieveP.length * D;
    glowT = new Float32Array(N + 1).fill(Infinity);
    primes.forEach((p, r) => (glowT[p] = Tf + 0.15 + (1.5 * r) / primes.length));
    sieveP.forEach((p, k) => (glowT[p] = k * D));
    Tdiv = Tf + 2.9;
    period = Tdiv + (showDiv && N >= 13 ? 6.4 : 0.8);
  }
  build();
  let tileC: HTMLCanvasElement | null = null;
  let tileCs = 0;
  const primeTile = (cs: number): HTMLCanvasElement => {
    if (tileC && tileCs === cs) return tileC;
    tileC = document.createElement('canvas');
    tileC.width = 4;
    tileC.height = Math.max(1, Math.round(cs * 4));
    const t = tileC.getContext('2d')!;
    const gr = t.createLinearGradient(0, 0, 0, tileC.height);
    gr.addColorStop(0, 'rgb(255,214,128)');
    gr.addColorStop(1, 'rgb(240,160,40)');
    t.fillStyle = gr;
    t.fillRect(0, 0, 4, tileC.height);
    tileCs = cs;
    return tileC;
  };
  const geo = (): { cs: number; x0: number; y0: number; rows: number } => {
    const rows = Math.ceil(N / 10);
    const cs = Math.min(13.4, 136 / rows);
    return { cs, x0: 10, y0: 24 + (136 - rows * cs) / 2, rows };
  };
  const cellAt = (x: number, y: number): number => {
    const { cs, x0, y0 } = geo();
    const c = Math.floor((x - x0) / cs);
    const r = Math.floor((y - y0) / cs);
    if (c < 0 || c > 9 || r < 0) return -1;
    const n = r * 10 + c + 1;
    return n >= 1 && n <= N ? n : -1;
  };
  function divRects(g: G, s: number, x: number, y: number): void {
    const ds: number[] = [];
    for (let i = 1; i <= s; i++) if (s % i === 0) ds.push(i);
    mtext(g, [['c', ACC, String(s)], '의 약수'], x, y, 11);
    g.font = font(8.5, 600);
    const list = ds.join(', ');
    text(g, list.length > 26 ? list.slice(0, 25) + '…' : list, x, y + 15, 8.5, inkA(0.85));
    text(g, `${ds.length}개${ds.length === 2 ? ' → 소수' : ''}`, x, y + 28, 8.5, ds.length === 2 ? ACC : inkA(0.6), 'left', 700);
    let yy = y + 40;
    const pairs = ds.filter((a) => a * a <= s);
    const maxH = 120 + 24 - (yy - 24);
    const spAll = Math.min(5.2, 110 / s, maxH / pairs.reduce((m, a) => m + a + 1.6, 0));
    for (const a of pairs) {
      const b = s / a;
      const sp = Math.min(spAll, 96 / b);
      for (let r = 0; r < a; r++) for (let c = 0; c < b; c++) {
        g.fillStyle = a === 1 && b === s && ds.length === 2 ? ACC : accA(0.85);
        g.beginPath();
        g.arc(x + 2 + c * sp, yy + r * sp, Math.max(0.7, sp * 0.36), 0, Math.PI * 2);
        g.fill();
      }
      text(g, `${a}×${b}`, x + 2 + b * sp + 3, yy + ((a - 1) * sp) / 2, 7, inkA(0.6));
      yy += a * sp + 5;
    }
  }
  return {
    draw(g, _t, dt) {
      clock += dt * speed;
      if (clock > period) clock -= period;
      const tt = sel > 0 ? Tdiv - 0.01 : clock;
      let showS = sel;
      if (sel < 0 && tt >= Tdiv && showDiv && N >= 13) showS = tt < Tdiv + 3.2 ? 12 : 13;
      const { cs, x0, y0 } = geo();
      const fs = Math.max(4, cs * 0.46);
      const k = Math.min(sieveP.length - 1, Math.floor(tt / D));
      const sieving = tt < Tf;
      const curP = sieving ? sieveP[k]! : -1;
      let left = 0;
      const fBold = font(fs, 800);
      const fReg = font(fs, 600);
      // 한 칸 높이로 되풀이되는 세로 그러데이션 하나를 모든 소수 칸이 같이 쓴다
      const tile = primeTile(cs);
      const primeGrad = g.createPattern(tile, 'repeat')!;
      primeGrad.setTransform(new DOMMatrix([1 / 4, 0, 0, cs / tile.height, x0, y0]));
      // 같은 모양끼리 한 경로로 모아 한 번에 칠한다 (칸 100개를 하나씩 칠하면 느림)
      const bg = [new Path2D(), new Path2D(), new Path2D()]; // 소수 · 지운 수 · 남은 수
      const bgDim = [new Path2D(), new Path2D(), new Path2D()];
      const slash = new Path2D();
      const slashDim = new Path2D();
      const ring = new Path2D();
      const flashes: { x: number; y: number; a: number }[] = [];
      const labels: { n: number; x: number; y: number; st: number; dim: boolean }[] = [];
      let curXY: [number, number] | null = null;
      for (let n = 1; n <= N; n++) {
        const c = (n - 1) % 10;
        const r = Math.floor((n - 1) / 10);
        const x = x0 + c * cs;
        const y = y0 + r * cs;
        const crossed = n === 1 || tt >= cross[n]!;
        const prime = tt >= glowT[n]!;
        if (!crossed && n > 1) left++;
        const isDiv = showS > 0 && showS % n === 0;
        const dim = showS > 0 && !isDiv;
        const st = prime && !dim ? 0 : crossed ? 1 : 2;
        (dim ? bgDim : bg)[st]!.roundRect(x + 0.6, y + 0.6, cs - 1.2, cs - 1.2, cs * 0.18);
        if (isDiv) ring.roundRect(x + 0.6, y + 0.6, cs - 1.2, cs - 1.2, cs * 0.18);
        for (const ht of hits[n]!) {
          const age = tt - ht;
          if (age >= 0 && age < 0.4) flashes.push({ x, y, a: 0.55 * (1 - age / 0.4) });
        }
        if (crossed && n > 1 && !prime) {
          const sp = dim ? slashDim : slash;
          sp.moveTo(x + cs * 0.22, y + cs * 0.78);
          sp.lineTo(x + cs * 0.78, y + cs * 0.22);
        }
        if (cs >= 8) labels.push({ n, x: x + cs / 2, y: y + cs / 2 + 0.3, st: prime ? 0 : crossed ? 1 : 2, dim });
        if (n === curP) curXY = [x, y];
      }
      const fills: (string | CanvasPattern)[] = [primeGrad, 'rgba(255,255,255,0.025)', 'rgba(130,150,235,0.13)'];
      for (let i = 0; i < 3; i++) {
        g.fillStyle = fills[i]!;
        g.fill(bg[i]!);
        g.globalAlpha = 0.35;
        g.fill(bgDim[i]!);
        g.globalAlpha = 1;
      }
      for (const f of flashes) {
        g.fillStyle = accA(f.a);
        rr(g, f.x + 0.6, f.y + 0.6, cs - 1.2, cs - 1.2, cs * 0.18);
        g.fill();
      }
      if (showS > 0) {
        g.strokeStyle = ACC;
        g.lineWidth = 1.1;
        g.stroke(ring);
      }
      g.strokeStyle = inkA(0.16);
      g.lineWidth = 0.6;
      g.stroke(slash);
      g.globalAlpha = 0.35;
      g.stroke(slashDim);
      g.globalAlpha = 1;
      const LCOL = [DARK, 'rgba(232,238,255,0.2)', 'rgba(232,238,255,0.85)'];
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (let st = 0; st < 3; st++) {
        g.font = st === 0 ? fBold : fReg;
        g.fillStyle = LCOL[st]!;
        for (const L of labels) {
          if (L.st !== st) continue;
          g.globalAlpha = L.dim ? 0.35 : 1;
          g.fillText(String(L.n), L.x, L.y);
        }
      }
      g.globalAlpha = 1;
      if (curXY) {
        const pu = 0.5 + 0.5 * Math.sin(tt * 9);
        rr(g, curXY[0] - 0.8, curXY[1] - 0.8, cs + 1.6, cs + 1.6, cs * 0.25);
        g.strokeStyle = accA(0.6 + 0.4 * pu);
        g.lineWidth = 1.4;
        g.stroke();
      }
      // 오른쪽 판
      const px = 152;
      if (showS > 0) {
        divRects(g, showS, px, 30);
      } else if (sieving) {
        text(g, '배수 지우기', px, 32, 9, inkA(0.55));
        mtext(g, [['i', 'p'], ' = ', ['c', ACC, String(curP)]], px, 54, 22, 'l', INK, 700);
        text(g, `${curP}${curP === 2 || curP === 5 ? '는' : '은'} 남기고 ${curP * 2}, ${curP * 3}, ${curP * 4} … 지우기`, px, 78, 8, inkA(0.8));
        text(g, `남은 수 ${left}개`, px, 96, 9.5, INK, 'left', 700);
        const sq = Math.ceil(Math.sqrt(N + 1));
        text(g, `${sq}² > ${N} 이면 멈춰도 돼요`, px, 112, 7.5, inkA(0.5));
      } else {
        const q = primes.find((p) => p * p > N) ?? 0;
        text(g, '남은 수 = 소수', px, 32, 9, inkA(0.55));
        mtext(g, [['c', ACC, String(primes.length)], '개'], px, 54, 22, 'l', INK, 700);
        text(g, `${N} 이하의 소수`, px, 76, 8.5, inkA(0.8));
        mtext(g, [String(q), ['^', '2'], ` = ${q * q} > ${N}`], px, 96, 9);
        text(g, '→ 남은 수는 모두 소수', px, 110, 8, inkA(0.6));
      }
      if (sel < 0) {
        g.fillStyle = inkA(0.08);
        rr(g, px, 160, 116, 3, 1.5);
        g.fill();
        g.fillStyle = accA(0.7);
        rr(g, px, 160, 116 * (tt / period), 3, 1.5);
        g.fill();
      } else text(g, '수를 다시 누르면 닫혀요', px, 161, 7.5, inkA(0.5));
    },
    down(x, y) {
      const n = cellAt(x, y);
      if (n > 0) sel = sel === n ? -1 : n;
    },
    move(x, y) {
      return cellAt(x, y) > 0 ? 'pointer' : '';
    },
    controls: [
      { type: 'range', label: '수의 범위 (1 ~ N)', min: 30, max: 200, step: 10, value: 100, on: (v) => ((N = v), (sel = -1), (clock = 0), build()) },
      { type: 'range', label: '빠르기', min: 0.5, max: 3, step: 0.25, value: 1, on: (v) => (speed = v) },
      { type: 'toggle', label: '약수 직사각형도 보기 (12 · 13)', value: true, on: (v) => ((showDiv = v), build()) },
    ],
  };
});

/* ═════════════════════════ i374 자릿값 · 진법 ═════════════════════════ */
const i374 = cv('구슬이 진법 수만큼 모이면 한 묶음이 되어 한 자리 위로 — 10진 · 2진 · 5진을 같은 상자로', () => {
  let base = 10;
  let auto = true;
  let speed = 1;
  let scripted = true;
  let digits = [0, 0, 0, 0];
  let anim: null | { k: 'drop' | 'carry'; col: number; t: number; slot: number } = null;
  let wait = 0;
  let hold = 0;
  let seg = 0;
  const SEGS = [
    { b: 10, from: 6, to: 12 },
    { b: 2, from: 0, to: 8 },
    { b: 5, from: 3, to: 13 },
    { b: 3, from: 4, to: 10 },
  ];
  const DROP = 0.32;
  const CARRY = 0.9;
  const BOXW = 52;
  const BOXH = 92;
  const BY = 40;
  const bx = (col: number): number => 21 + (3 - col) * (BOXW + 10);
  const slot = (col: number, i: number): [number, number] => [bx(col) + 26 + (i % 2 ? 11 : -11), BY + BOXH - 11 - Math.floor(i / 2) * 16];
  const value = (): number => digits.reduce((s, d, i) => s + d * base ** i, 0);
  function setValue(v: number): void {
    digits = [0, 0, 0, 0];
    queued = 0;
    for (let i = 0; i < 4; i++) {
      digits[i] = v % base;
      v = Math.floor(v / base);
    }
    anim = null;
  }
  let queued = 0;
  function add(): void {
    if (anim) {
      queued = Math.min(queued + 1, 20);
      return;
    }
    if (value() >= base ** 4 - 1) {
      setValue(0);
      return;
    }
    anim = { k: 'drop', col: 0, t: 0, slot: digits[0]! };
    digits[0]!++;
  }
  setValue(SEGS[0]!.from);
  function step(dt: number): void {
    if (anim) {
      anim.t += dt;
      if (anim.k === 'drop' && anim.t >= DROP) {
        anim = null;
        if (digits[0]! >= base) anim = { k: 'carry', col: 0, t: 0, slot: digits[1]! };
      } else if (anim && anim.k === 'carry' && anim.t >= CARRY) {
        const col = anim.col;
        digits[col] = 0;
        anim = null;
        if (col + 1 < 4) {
          digits[col + 1]!++;
          if (digits[col + 1]! >= base) anim = { k: 'carry', col: col + 1, t: 0, slot: col + 2 < 4 ? digits[col + 2]! : 0 };
        }
      }
      return;
    }
    if (queued > 0) {
      queued--;
      add();
      return;
    }
    if (scripted) {
      const s = SEGS[seg]!;
      if (value() < s.to) {
        wait -= dt;
        if (wait <= 0) {
          add();
          wait = 0.42;
        }
      } else {
        hold += dt;
        if (hold > 1.5) {
          hold = 0;
          seg = (seg + 1) % SEGS.length;
          base = SEGS[seg]!.b;
          setValue(SEGS[seg]!.from);
          wait = 0.5;
        }
      }
    } else if (auto) {
      wait -= dt;
      if (wait <= 0) {
        add();
        wait = 0.45;
      }
    }
  }
  function bead(g: G, x: number, y: number, r: number, a = 1): void {
    g.globalAlpha = a;
    const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    gr.addColorStop(0, '#fff1c9');
    gr.addColorStop(0.45, '#ffc04a');
    gr.addColorStop(1, '#b8740f');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }
  return {
    draw(g, _t, dt) {
      step(dt * speed);
      const v = value();
      // 상자
      for (let col = 0; col < 4; col++) {
        const x = bx(col);
        rr(g, x, BY, BOXW, BOXH, 7);
        const gr = g.createLinearGradient(0, BY, 0, BY + BOXH);
        gr.addColorStop(0, 'rgba(255,255,255,0.025)');
        gr.addColorStop(1, 'rgba(255,255,255,0.07)');
        g.fillStyle = gr;
        g.fill();
        g.strokeStyle = anim?.k === 'carry' && anim.col + 1 === col ? accA(0.7) : inkA(0.15);
        g.lineWidth = 0.9;
        g.stroke();
        mtext(g, [String(base), ['^', String(col)], ` = ${base ** col}`], x + BOXW / 2, BY - 9, 8.5, 'c', inkA(0.6));
        let n = digits[col]!;
        const carrying = anim?.k === 'carry' && anim.col === col;
        const dropping = anim?.k === 'drop' && col === 0;
        if (carrying) {
          const k = anim!.t / CARRY;
          const m = smooth(0, 0.45, k);
          const cx = x + BOXW / 2;
          const cy = BY + BOXH / 2 + 8;
          if (k < 0.5) {
            for (let i = 0; i < n; i++) {
              const [sx, sy] = slot(col, i);
              bead(g, lerp(sx, cx, m), lerp(sy, cy, m), 7.2 * (1 - m * 0.35));
            }
            if (m > 0.6) {
              const gg = g.createRadialGradient(cx, cy, 0, cx, cy, 22);
              gg.addColorStop(0, accA(0.6 * (m - 0.6) * 2.5));
              gg.addColorStop(1, accA(0));
              g.fillStyle = gg;
              g.beginPath();
              g.arc(cx, cy, 22, 0, Math.PI * 2);
              g.fill();
            }
          } else if (col + 1 < 4) {
            const f = smooth(0.5, 1, k);
            const [tx, ty] = slot(col + 1, anim!.slot);
            const hx = lerp(cx, tx, f);
            const hy = lerp(cy, ty, f) - Math.sin(Math.PI * f) * 40;
            const gg = g.createRadialGradient(hx, hy, 0, hx, hy, 18);
            gg.addColorStop(0, accA(0.45));
            gg.addColorStop(1, accA(0));
            g.fillStyle = gg;
            g.beginPath();
            g.arc(hx, hy, 18, 0, Math.PI * 2);
            g.fill();
            bead(g, hx, hy, lerp(9.5, 7.2, f));
            g.globalAlpha = smooth(0.5, 0.6, k) * (1 - smooth(0.9, 1, k));
            pill(g, `${base}개 → 1묶음`, (cx + tx) / 2 - 26, BY - 24, 7.5);
            g.globalAlpha = 1;
          }
          n = 0;
        }
        for (let i = 0; i < n; i++) {
          const [sx, sy] = slot(col, i);
          if (dropping && i === n - 1) {
            const f = clamp(anim!.t / DROP, 0, 1);
            const yy = lerp(BY - 30, sy, f * f);
            bead(g, sx, f >= 1 ? sy : yy, 7.2, smooth(0, 0.3, f));
          } else bead(g, sx, sy, 7.2);
        }
        const dshow = carrying ? base : digits[col]!;
        const lead = digits.slice(col).every((d) => d === 0) && col > 0 && !carrying;
        text(g, carrying ? '' : String(dshow), x + BOXW / 2, 147, 17, lead ? inkA(0.22) : dshow ? ACC : INK, 'center', 800);
      }
      // 위: 진법 · 값
      pill(g, `${base}진법`, 21, 13, 8.5);
      let top = 3;
      while (top > 0 && digits[top] === 0) top--;
      let ds = '';
      for (let i = top; i >= 0; i--) ds += String(digits[i]! >= base ? base : digits[i]);
      const pending = digits.some((d) => d >= base);
      if (pending) ds = '';
      const toks: Tok[] = [];
      if (ds) toks.push(['c', ACC, ds], ['_', String(base), inkA(0.7)], '  =  ');
      toks.push(String(v));
      mtext(g, toks, 259, 13, 13, 'r', INK, 700);
      // 아래: 펼친 식
      const parts: string[] = [];
      for (let i = top; i >= 0; i--) parts.push(`${Math.min(digits[i]!, base)}×${base ** i}`);
      if (!pending) text(g, `${parts.join(' + ')} = ${v}`, 140, 166, 8.5, inkA(0.55), 'center');
    },
    down() {
      scripted = false;
      add();
    },
    move(_x, y) {
      return y > 20 && y < 160 ? 'pointer' : '';
    },
    controls: [
      { type: 'range', label: '진법', min: 2, max: 10, step: 1, value: 10, on: (v) => ((scripted = false), (base = v), setValue(0)) },
      { type: 'toggle', label: '자동으로 하나씩 넣기', value: true, on: (v) => ((auto = v), (scripted = false)) },
      { type: 'range', label: '빠르기', min: 0.5, max: 4, step: 0.5, value: 1, on: (v) => (speed = v) },
      { type: 'button', label: '구슬 하나 넣기 (화면을 눌러도 돼요)', on: () => ((scripted = false), add()) },
    ],
  };
});

/* ═════════════════════════ i375 식이 그림이 되다 ═════════════════════════ */
const i375 = cv('식이 그림이 된다 — 홀수를 ㄱ자로 쌓으면 n², (a+b)² 정사각형 쪼개기, 계단 두 개 = 직사각형', () => {
  let view = 0;
  let n = 5;
  let speed = 1;
  let clock = 0;
  const LEN = 5.8;
  function cell(g: G, x: number, y: number, s: number, col: string | CanvasGradient, sc = 1): void {
    const c = s * (1 - sc) * 0.5;
    rr(g, x + 0.5 + c, y + 0.5 + c, (s - 1) * sc, (s - 1) * sc, s * 0.18);
    g.fillStyle = col;
    g.fill();
  }
  function odd(g: G, tau: number): void {
    const N = n + 1;
    const c = Math.min(16, 112 / N);
    const ox = 34;
    const oy = 136;
    const per = 4.2 / N;
    const cur = Math.min(N, Math.floor(tau / per) + 1);
    for (let k = 1; k <= cur; k++) {
      const age = tau - (k - 1) * per;
      const colTop = k % 2 ? accFill(g, oy - k * c, oy) : 'rgba(255,236,196,0.9)';
      for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
        if (Math.max(i, j) !== k - 1) continue;
        const idx = i === k - 1 ? j : k + (k - 2 - i);
        const sc = backOut(clamp((age - idx * 0.035) / 0.3, 0, 1));
        if (sc <= 0) continue;
        cell(g, ox + j * c, oy - (i + 1) * c, c, colTop, sc);
      }
    }
    rr(g, ox - 1, oy - cur * c - 1, cur * c + 2, cur * c + 2, 3);
    g.strokeStyle = inkA(0.3);
    g.lineWidth = 0.7;
    g.stroke();
    text(g, String(cur), ox + (cur * c) / 2, oy + 9, 8.5, inkA(0.6), 'center');
    text(g, String(cur), ox - 8, oy - (cur * c) / 2, 8.5, inkA(0.6), 'center');
    // 오른쪽
    const rx = 168;
    text(g, '홀수를 차례로 더하면', rx, 34, 9, inkA(0.55));
    mtext(g, [String(cur), ['^', '2'], ' = ', ['c', ACC, String(cur * cur)]], rx, 60, 24, 'l', INK, 800);
    for (let k = 1; k <= cur; k++) {
      text(g, `${k}번째 ㄱ자: ${2 * k - 1}칸`, rx, 84 + (k - 1) * 10.5 * Math.min(1, 6 / cur), 7.5, k === cur ? ACC : inkA(0.55));
    }
    const toks: Tok[] = [];
    for (let k = 1; k <= cur; k++) toks.push((k > 1 ? ' + ' : '') + String(2 * k - 1));
    toks.push('  =  ', ['c', ACC, String(cur)], ['^', '2', ACC]);
    mtext(g, toks, 140, 160, cur > 7 ? 10 : 12.5, 'c');
  }
  function square(g: G, tau: number): void {
    const a = 3;
    const b = 2;
    const c = 17;
    const ox = 30;
    const oy = 32;
    const split = smooth(0.8, 1.6, tau);
    const ex = smooth(2.0, 3.0, tau) * 6;
    const pal = 'rgba(255,236,196,0.9)';
    const pieces: { x: number; y: number; w: number; h: number; col: string | CanvasGradient; lab: Tok[]; dx: number; dy: number }[] = [
      { x: 0, y: 0, w: a, h: a, col: accFill(g, oy, oy + a * c), lab: [['i', 'a'], ['^', '2']], dx: -1, dy: -1 },
      { x: a, y: 0, w: b, h: a, col: pal, lab: [['i', 'a'], ['i', 'b']], dx: 1, dy: -1 },
      { x: 0, y: a, w: a, h: b, col: pal, lab: [['i', 'a'], ['i', 'b']], dx: -1, dy: 1 },
      { x: a, y: a, w: b, h: b, col: 'rgba(159,192,255,0.85)', lab: [['i', 'b'], ['^', '2']], dx: 1, dy: 1 },
    ];
    g.globalAlpha = smooth(0, 0.5, tau);
    for (const p of pieces) {
      const x = ox + p.x * c + p.dx * ex;
      const y = oy + p.y * c + p.dy * ex;
      rr(g, x, y, p.w * c, p.h * c, 3);
      g.fillStyle = split > 0 ? p.col : accA(0.25);
      g.globalAlpha = smooth(0, 0.5, tau) * (split > 0 ? lerp(0.35, 1, split) : 1);
      g.fill();
      g.globalAlpha = 1;
      if (split > 0.6) mtext(g, p.lab, x + (p.w * c) / 2, y + (p.h * c) / 2, 13, 'c', DARK, 800);
    }
    g.globalAlpha = 1;
    // 변 이름
    mtext(g, [['i', 'a']], ox + (a * c) / 2 - ex, oy - 8 - ex, 10, 'c', inkA(0.7));
    mtext(g, [['i', 'b']], ox + a * c + (b * c) / 2 + ex, oy - 8 - ex, 10, 'c', inkA(0.7));
    mtext(g, [['i', 'a']], ox - 9 - ex, oy + (a * c) / 2 - ex, 10, 'c', inkA(0.7));
    mtext(g, [['i', 'b']], ox - 9 - ex, oy + a * c + (b * c) / 2 + ex, 10, 'c', inkA(0.7));
    const rx = 150;
    text(g, '한 변이 a + b 인 정사각형', rx, 38, 9, inkA(0.55));
    mtext(g, ['(', ['i', 'a'], ' + ', ['i', 'b'], ')', ['^', '2']], rx, 62, 20, 'l', INK, 800);
    g.globalAlpha = smooth(2.2, 3.0, tau);
    mtext(g, ['= ', ['ic', ACC, 'a'], ['^', '2', ACC], ' + 2', ['i', 'a'], ['i', 'b'], ' + ', ['ic', COOL, 'b'], ['^', '2', COOL]], rx, 90, 15, 'l', INK, 700);
    g.globalAlpha = smooth(3.4, 4.0, tau);
    text(g, `a = ${a}, b = ${b} 이면`, rx, 114, 8.5, inkA(0.6));
    mtext(g, [`${a + b}`, ['^', '2'], ` = ${a * a} + ${2 * a * b} + ${b * b} = ${(a + b) ** 2}`], rx, 130, 10);
    g.globalAlpha = 1;
  }
  function stairs(g: G, tau: number): void {
    const c = Math.min(14, 96 / (n + 1));
    const ox = 30;
    const oy = 140;
    const build = 1.6;
    const slide = smooth(1.9, 3.3, tau);
    const T = (n * (n + 1)) / 2;
    for (let j = 0; j < n; j++) for (let k = 0; k <= j; k++) {
      const idx = (j * (j + 1)) / 2 + k;
      const sc = backOut(clamp((tau - (idx / T) * build) / 0.25, 0, 1));
      if (sc > 0) cell(g, ox + j * c, oy - (k + 1) * c, c, accFill(g, oy - (j + 1) * c, oy), sc);
    }
    if (tau > build) {
      // 180° 돌린 복사본: 중심 C = (n/2, (n+1)/2) 둘레로
      const cx = ox + (n / 2) * c;
      const cy = oy - ((n + 1) / 2) * c;
      g.save();
      g.globalAlpha = smooth(build, build + 0.3, tau);
      g.translate((1 - slide) * (n + 2) * c, 0);
      g.translate(cx, cy);
      g.rotate(Math.PI * slide);
      g.translate(-cx, -cy);
      for (let j = 0; j < n; j++) for (let k = 0; k <= j; k++) cell(g, ox + j * c, oy - (k + 1) * c, c, 'rgba(255,236,196,0.9)');
      g.restore();
    }
    if (slide >= 1) {
      g.globalAlpha = smooth(3.3, 3.7, tau);
      rr(g, ox - 1, oy - (n + 1) * c - 1, n * c + 2, (n + 1) * c + 2, 3);
      g.strokeStyle = accA(0.8);
      g.lineWidth = 1;
      g.stroke();
      mtext(g, [['i', 'n'], ` = ${n}`], ox + (n * c) / 2, oy + 9, 8.5, 'c', inkA(0.7));
      mtext(g, [['i', 'n'], ` + 1 = ${n + 1}`], ox + n * c + 22, oy - ((n + 1) * c) / 2, 8.5, 'c', inkA(0.7));
      g.globalAlpha = 1;
    }
    const rx = 168;
    text(g, '계단 두 개를 맞붙이면', rx, 34, 9, inkA(0.55));
    mtext(g, ['1 + 2 + … + ', ['i', 'n']], rx, 56, 13, 'l', INK, 700);
    mtext(g, ['= ', ['/', 'n × (n + 1)', '2']], rx, 82, 13, 'l', INK, 700);
    g.globalAlpha = smooth(3.4, 4.0, tau);
    mtext(g, [`= `, ['/', `${n} × ${n + 1}`, '2'], ' = ', ['c', ACC, String(T)]], rx, 114, 13, 'l', INK, 800);
    g.globalAlpha = 1;
    const parts: string[] = [];
    for (let i = 1; i <= n; i++) parts.push(String(i));
    mtext(g, [parts.join(' + '), '  =  ', ['c', ACC, String(T)]], 140, 162, n > 7 ? 10 : 12, 'c');
  }
  return {
    draw(g, _t, dt) {
      clock += dt * speed;
      let which = view - 1;
      let tau = clock;
      if (view === 0) {
        which = Math.floor(clock / LEN) % 3;
        tau = clock % LEN;
      } else tau = clock % LEN;
      if (which === 0) odd(g, tau);
      else if (which === 1) square(g, tau);
      else stairs(g, tau);
      const xs = [118, 140, 162];
      for (let i = 0; i < 3; i++) {
        g.fillStyle = i === which ? ACC : inkA(0.2);
        g.beginPath();
        g.arc(xs[i]!, 9, i === which ? 2.4 : 1.8, 0, Math.PI * 2);
        g.fill();
      }
    },
    controls: [
      { type: 'range', label: '보기 (0 자동 · 1 홀수 합 · 2 (a+b)² · 3 삼각수)', min: 0, max: 3, step: 1, value: 0, on: (v) => ((view = v), (clock = 0)) },
      { type: 'range', label: 'n (홀수 · 계단 크기)', min: 2, max: 8, step: 1, value: 5, on: (v) => ((n = v), (clock = Math.floor(clock / LEN) * LEN)) },
      { type: 'range', label: '빠르기', min: 0.5, max: 2, step: 0.25, value: 1, on: (v) => (speed = v) },
    ],
  };
});

/* ═════════════════════════ i376 함수 그래프 변형 ═════════════════════════ */
const i376 = cv('y = a·f(x − p) + q — p 는 옆으로, q 는 위아래로, a 는 늘이고 뒤집기 (큰 화면: 꼭짓점 · a 점을 끌기)', () => {
  let a = 1;
  let p = 0;
  let q = 0;
  let fi = 0;
  let auto = true;
  let clock = 0;
  let drag: '' | 'v' | 'a' = '';
  let hi = '';
  const S = 22;
  const OX = 140;
  const OY = 100;
  const X = (x: number): number => OX + x * S;
  const Y = (y: number): number => OY - y * S;
  const FS: ((x: number) => number)[] = [(x) => x * x, (x) => Math.abs(x), (x) => (x >= 0 ? Math.sqrt(x) : NaN)];
  const NAMES: Tok[][] = [[['i', 'x'], ['^', '2']], ['|', ['i', 'x'], '|'], ['√', ['i', 'x']]];
  const KF: [number, number, number, string, string][] = [
    [1, 0, 0, '', '원래 그래프'],
    [1, 2, 0, 'p', 'p = 2 → 오른쪽으로 2'],
    [1, 2, 1.5, 'q', 'q = 1.5 → 위로 1.5'],
    [-1, 2, 1.5, 'a', 'a = −1 → 위아래 뒤집기'],
    [0.5, 2, 1.5, 'a', 'a = 0.5 → 납작하게'],
    [0.5, -1.5, 1.5, 'p', 'p = −1.5 → 왼쪽으로'],
    [0.5, -1.5, -1, 'q', 'q = −1 → 아래로'],
    [2, -1.5, -1, 'a', 'a = 2 → 2배로 늘이기'],
  ];
  const TR = 1.1;
  const HOLD = 1.2;
  let note = '';
  function eq(): Tok[] {
    const cA = hi.includes('a') ? ACC : INK;
    const cP = hi.includes('p') ? ACC : INK;
    const cQ = hi.includes('q') ? ACC : INK;
    const ra = Math.round(a * 10) / 10;
    const rp = Math.round(p * 10) / 10;
    const rq = Math.round(q * 10) / 10;
    const toks: Tok[] = [['i', 'y'], ' = '];
    if (ra === -1) toks.push(['c', cA, '−']);
    else if (ra !== 1) toks.push(['c', cA, f1(ra)]);
    const inner: Tok[] = [['i', 'x']];
    if (rp !== 0) inner.push(rp > 0 ? ' − ' : ' + ', ['c', cP, f1(Math.abs(rp))]);
    if (fi === 0) {
      if (rp !== 0) toks.push('(', ...inner, ')', ['^', '2']);
      else toks.push(...inner, ['^', '2']);
    } else if (fi === 1) toks.push('|', ...inner, '|');
    else toks.push('√', '(', ...inner, ')');
    if (rq !== 0) toks.push(rq > 0 ? ' + ' : ' − ', ['c', cQ, f1(Math.abs(rq))]);
    return toks;
  }
  function curve(g: G, A: number, Pp: number, Qq: number): void {
    const f = FS[fi]!;
    g.beginPath();
    let on = false;
    const x0 = fi === 2 ? Pp : -6.6;
    for (let i = 0; i <= 260; i++) {
      const x = lerp(x0, 6.6, i / 260);
      const y = A * f(x - Pp) + Qq;
      if (!isFinite(y)) {
        on = false;
        continue;
      }
      const yy = clamp(Y(y), -60, 260);
      if (!on) g.moveTo(X(x), yy);
      else g.lineTo(X(x), yy);
      on = true;
    }
  }
  return {
    draw(g, _t, dt) {
      if (auto && !drag) {
        clock += dt;
        const per = TR + HOLD;
        const loop = per * KF.length;
        if (clock >= loop * 3) clock -= loop * 3;
        fi = Math.floor(clock / loop) % 3;
        const tl = clock % loop;
        const i = Math.floor(tl / per);
        const k = smooth(0, TR, tl - i * per);
        const A = KF[i]!;
        const B = KF[(i + 1) % KF.length]!;
        a = lerp(A[0], B[0], k);
        p = lerp(A[1], B[1], k);
        q = lerp(A[2], B[2], k);
        hi = B[3];
        note = k > 0.5 ? B[4] : A[4];
      }
      // 모눈
      g.save();
      rr(g, 6, 24, 268, 146, 8);
      g.clip();
      g.fillStyle = 'rgba(255,255,255,0.02)';
      g.fillRect(6, 24, 268, 146);
      g.lineWidth = 0.5;
      for (let i = -7; i <= 7; i++) {
        g.strokeStyle = inkA(i === 0 ? 0 : 0.06);
        g.beginPath();
        g.moveTo(X(i), 24);
        g.lineTo(X(i), 170);
        g.stroke();
      }
      for (let j = -4; j <= 4; j++) {
        g.strokeStyle = inkA(j === 0 ? 0 : 0.06);
        g.beginPath();
        g.moveTo(6, Y(j));
        g.lineTo(274, Y(j));
        g.stroke();
      }
      g.strokeStyle = inkA(0.35);
      g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(6, OY);
      g.lineTo(274, OY);
      g.moveTo(OX, 24);
      g.lineTo(OX, 170);
      g.stroke();
      for (let i = -6; i <= 6; i += 2) if (i) text(g, String(i).replace('-', '−'), X(i), OY + 6, 6, inkA(0.35), 'center');
      for (let j = -2; j <= 3; j++) if (j) text(g, String(j).replace('-', '−'), OX - 4, Y(j), 6, inkA(0.35), 'right');
      // 원래 그래프
      g.setLineDash([3, 3]);
      g.strokeStyle = inkA(0.35);
      g.lineWidth = 1;
      curve(g, 1, 0, 0);
      g.stroke();
      g.setLineDash([]);
      // 옮긴 화살표
      if (Math.hypot(p, q) > 0.15) {
        g.setLineDash([2, 2.5]);
        arrow(g, X(0), Y(0), X(p), Y(q), inkA(0.45), 0.8, 5);
        g.setLineDash([]);
      }
      // 새 그래프
      g.lineJoin = 'round';
      g.strokeStyle = accA(0.22);
      g.lineWidth = 6;
      curve(g, a, p, q);
      g.stroke();
      g.strokeStyle = ACC;
      g.lineWidth = 2;
      curve(g, a, p, q);
      g.stroke();
      // a 점: (p+1, q+a) — f(1) = 1 이라 세로 거리가 곧 a
      g.setLineDash([1.5, 2]);
      g.strokeStyle = inkA(0.4);
      g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(X(p), Y(q));
      g.lineTo(X(p + 1), Y(q));
      g.lineTo(X(p + 1), Y(q + a));
      g.stroke();
      g.setLineDash([]);
      text(g, '1', X(p + 0.5), Y(q) + (a >= 0 ? 6 : -6), 6.5, inkA(0.55), 'center');
      mtext(g, [['i', 'a']], X(p + 1) + 6, Y(q + a / 2), 8, 'l', hi === 'a' ? ACC : inkA(0.7));
      glowDot(g, X(p + 1), Y(q + a), drag === 'a' ? 3.4 : 2.6, COOL);
      glowDot(g, X(p), Y(q), drag === 'v' ? 4.2 : 3.3);
      mtext(g, ['(', f1(p), ', ', f1(q), ')'], X(p) + (p > 3 ? -7 : 7), Y(q) + (a >= 0 ? 9 : -9), 7.5, p > 3 ? 'r' : 'l', ACC);
      g.restore();
      // 식
      rr(g, 70, 4, 140, 17, 8.5);
      g.fillStyle = 'rgba(10,14,32,0.7)';
      g.fill();
      g.strokeStyle = inkA(0.12);
      g.lineWidth = 0.6;
      g.stroke();
      mtext(g, eq(), 140, 13, 11.5, 'c', INK, 700);
      mtext(g, ['원래: ', ['i', 'y'], ' = ', ...NAMES[fi]!], 12, 162, 7.5, 'l', inkA(0.5));
      if (note) text(g, note, 268, 162, 8, hi ? ACC : inkA(0.6), 'right', 700);
    },
    down(x, y) {
      if (Math.hypot(x - X(p + 1), y - Y(q + a)) < 9) drag = 'a';
      else if (Math.hypot(x - X(p), y - Y(q)) < 11) drag = 'v';
      if (drag) {
        auto = false;
        note = '';
      }
    },
    move(x, y, pressed) {
      if (drag && pressed) {
        if (drag === 'v') {
          p = clamp(Math.round(((x - OX) / S) * 10) / 10, -5, 5);
          q = clamp(Math.round(((OY - y) / S) * 10) / 10, -3, 3);
          hi = 'pq';
          note = '꼭짓점 (p, q) 를 옮기는 중';
        } else {
          a = clamp(Math.round(((OY - y) / S - q) * 10) / 10, -4, 4);
          hi = 'a';
          note = a < 0 ? '음수 a → 뒤집힘' : Math.abs(a) < 1 ? '|a| < 1 → 납작' : '|a| > 1 → 홀쭉';
        }
        return 'grabbing';
      }
      return Math.hypot(x - X(p + 1), y - Y(q + a)) < 9 || Math.hypot(x - X(p), y - Y(q)) < 11 ? 'grab' : '';
    },
    up() {
      drag = '';
    },
    controls: [
      { type: 'range', label: 'a (늘이기 · 뒤집기)', min: -3, max: 3, step: 0.1, value: 1, on: (v) => ((auto = false), (a = v), (hi = 'a'), (note = '')) },
      { type: 'range', label: 'p (옆으로)', min: -4, max: 4, step: 0.1, value: 0, on: (v) => ((auto = false), (p = v), (hi = 'p'), (note = '')) },
      { type: 'range', label: 'q (위아래로)', min: -3, max: 3, step: 0.1, value: 0, on: (v) => ((auto = false), (q = v), (hi = 'q'), (note = '')) },
      { type: 'range', label: '원래 함수 (1 x² · 2 |x| · 3 √x)', min: 1, max: 3, step: 1, value: 1, on: (v) => ((auto = false), (fi = v - 1), (hi = ''), (note = '')) },
    ],
  };
});

/* ═════════════════════════ i377 할선 → 접선 ═════════════════════════ */
const i377 = cv('두 점 P · Q 를 가까이 할수록 할선이 접선이 된다 — 기울기 Δy/Δx 가 한 값으로 모임 (큰 화면: P · Q 끌기)', () => {
  const f = (x: number): number => 0.08 * x * x * x - 0.5 * x + 1.6;
  const df = (x: number): number => 0.24 * x * x - 0.5;
  let x0 = 2.5;
  let h = 1.6;
  let auto = true;
  let clock = 0;
  let drag: '' | 'P' | 'Q' = '';
  const XS = [2.5, 0, -2];
  const S = 23.5;
  const X = (x: number): number => 12 + (x + 3.4) * S;
  const Y = (y: number): number => 152 - y * S;
  const IX = (px: number): number => (px - 12) / S - 3.4;
  const slope = (hh: number): number => (f(x0 + hh) - f(x0)) / hh;
  return {
    draw(g, _t, dt) {
      let tang = 0;
      if (auto && !drag) {
        clock += dt;
        const per = 4.8;
        const cyc = Math.floor(clock / per);
        const tau = clock - cyc * per;
        x0 = XS[cyc % XS.length]!;
        h = 1.6 * Math.pow(0.01 / 1.6, Math.min(tau, 3) / 3);
        tang = smooth(2.9, 3.3, tau);
      } else tang = Math.abs(h) <= 0.02 ? 1 : 0;
      const xq = x0 + h;
      const yP = f(x0);
      const yQ = f(xq);
      const m = slope(h);
      const d = df(x0);
      g.save();
      rr(g, 6, 20, 190, 148, 8);
      g.clip();
      g.fillStyle = 'rgba(255,255,255,0.02)';
      g.fillRect(6, 20, 190, 148);
      g.lineWidth = 0.5;
      g.strokeStyle = inkA(0.06);
      for (let i = -3; i <= 4; i++) {
        g.beginPath();
        g.moveTo(X(i), 20);
        g.lineTo(X(i), 168);
        g.stroke();
      }
      for (let j = 1; j <= 5; j++) {
        g.beginPath();
        g.moveTo(6, Y(j));
        g.lineTo(196, Y(j));
        g.stroke();
      }
      g.strokeStyle = inkA(0.3);
      g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(6, Y(0));
      g.lineTo(196, Y(0));
      g.moveTo(X(0), 20);
      g.lineTo(X(0), 168);
      g.stroke();
      // 곡선
      g.beginPath();
      for (let i = 0; i <= 160; i++) {
        const x = lerp(-3.6, 4.7, i / 160);
        if (i) g.lineTo(X(x), Y(f(x)));
        else g.moveTo(X(x), Y(f(x)));
      }
      g.strokeStyle = inkA(0.85);
      g.lineWidth = 1.6;
      g.stroke();
      // 접선 (목표)
      const tl = (x: number): number => yP + d * (x - x0);
      g.setLineDash([3, 3]);
      g.strokeStyle = inkA(0.28 + 0.5 * tang);
      g.lineWidth = 0.9;
      g.beginPath();
      g.moveTo(X(-4), Y(tl(-4)));
      g.lineTo(X(5), Y(tl(5)));
      g.stroke();
      g.setLineDash([]);
      // 할선
      const sl = (x: number): number => yP + m * (x - x0);
      g.strokeStyle = accA(0.25);
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(X(-4), Y(sl(-4)));
      g.lineTo(X(5), Y(sl(5)));
      g.stroke();
      g.strokeStyle = ACC;
      g.lineWidth = 1.7;
      g.stroke();
      // Δ 삼각형
      if (Math.abs(h) * S > 6) {
        g.setLineDash([2, 2]);
        g.strokeStyle = inkA(0.55);
        g.lineWidth = 0.8;
        g.beginPath();
        g.moveTo(X(x0), Y(yP));
        g.lineTo(X(xq), Y(yP));
        g.lineTo(X(xq), Y(yQ));
        g.stroke();
        g.setLineDash([]);
        if (Math.abs(h) * S > 16) {
          mtext(g, ['Δ', ['i', 'x']], (X(x0) + X(xq)) / 2, Y(yP) + 7, 7.5, 'c', inkA(0.75));
          mtext(g, ['Δ', ['i', 'y']], X(xq) + 3, (Y(yP) + Y(yQ)) / 2, 7.5, 'l', inkA(0.75));
        }
      }
      glowDot(g, X(xq), Y(yQ), drag === 'Q' ? 3.4 : 2.7, COOL);
      glowDot(g, X(x0), Y(yP), drag === 'P' ? 3.6 : 3);
      text(g, 'P', X(x0) - 6, Y(yP) - 7, 8.5, ACC, 'center', 800);
      if (Math.abs(h) * S > 7) text(g, 'Q', X(xq) + 6, Y(yQ) - 7, 8.5, COOL, 'center', 800);
      g.restore();
      mtext(g, [['i', 'y'], ' = 0.08', ['i', 'x'], ['^', '3'], ' − 0.5', ['i', 'x'], ' + 1.6'], 12, 11, 8, 'l', inkA(0.55));
      // 오른쪽: h 가 줄 때 기울기
      const ix = 204;
      const iy = 26;
      const iw = 68;
      const ih = 66;
      rr(g, ix, iy, iw, ih, 5);
      g.fillStyle = 'rgba(255,255,255,0.03)';
      g.fill();
      let lo = Infinity;
      let hiV = -Infinity;
      for (let i = 0; i <= 40; i++) {
        const hh = 0.001 + (1.6 * i) / 40;
        const s = slope(hh);
        lo = Math.min(lo, s, d);
        hiV = Math.max(hiV, s, d);
      }
      const pad = Math.max(0.15, (hiV - lo) * 0.18);
      lo -= pad;
      hiV += pad;
      const IXh = (hh: number): number => ix + 6 + ((iw - 12) * hh) / 1.6;
      const IYs = (s: number): number => iy + ih - 8 - ((ih - 16) * (s - lo)) / (hiV - lo);
      g.setLineDash([2, 2]);
      g.strokeStyle = inkA(0.45);
      g.lineWidth = 0.7;
      g.beginPath();
      g.moveTo(ix + 4, IYs(d));
      g.lineTo(ix + iw - 4, IYs(d));
      g.stroke();
      g.setLineDash([]);
      g.beginPath();
      for (let i = 0; i <= 40; i++) {
        const hh = 0.001 + (1.6 * i) / 40;
        if (i) g.lineTo(IXh(hh), IYs(slope(hh)));
        else g.moveTo(IXh(hh), IYs(slope(hh)));
      }
      g.strokeStyle = accA(0.5);
      g.lineWidth = 1;
      g.stroke();
      const hc = clamp(h, 0, 1.6);
      glowDot(g, IXh(hc), IYs(slope(Math.max(hc, 0.001))), 2.2);
      text(g, 'h → 0', ix + iw / 2, iy + ih + 6, 7, inkA(0.5), 'center');
      text(g, '기울기', ix + 4, iy + 6, 6.5, inkA(0.5));
      // 숫자
      text(g, `h = ${fN(h, 3)}`, ix, 112, 9, COOL, 'left', 700);
      mtext(g, [['/', 'Δy', 'Δx'], ' = ', ['/', fN(yQ - yP, 3), fN(h, 3)]], ix, 132, 8.5);
      text(g, fN(m, 3), ix, 152, 15, ACC, 'left', 800);
      mtext(g, ['접선 ', ['i', 'f'], '′(', fN(x0, 1), ') = ', fN(d, 3)], ix, 167, 7, 'l', tang > 0.5 ? ACC : inkA(0.55), 700);
    },
    down(x, y) {
      if (Math.hypot(x - X(x0 + h), y - Y(f(x0 + h))) < 9) drag = 'Q';
      else if (Math.hypot(x - X(x0), y - Y(f(x0))) < 10) drag = 'P';
      if (drag) auto = false;
    },
    move(x, y, pressed) {
      if (drag && pressed) {
        if (drag === 'P') x0 = clamp(IX(x), -3.2, 3.0);
        else {
          let hh = clamp(IX(x) - x0, -2.5, 1.6);
          if (Math.abs(hh) < 0.01) hh = hh < 0 ? -0.01 : 0.01;
          h = hh;
        }
        return 'grabbing';
      }
      return Math.hypot(x - X(x0 + h), y - Y(f(x0 + h))) < 9 || Math.hypot(x - X(x0), y - Y(f(x0))) < 10 ? 'grab' : '';
    },
    up() {
      drag = '';
    },
    controls: [
      { type: 'range', label: 'P 의 x 좌표 (x₀)', min: -3, max: 3, step: 0.1, value: 2.5, on: (v) => ((auto = false), (x0 = v)) },
      { type: 'range', label: '두 점 사이 h', min: 0.01, max: 1.6, step: 0.01, value: 1.6, on: (v) => ((auto = false), (h = v)) },
      { type: 'toggle', label: '자동으로 h 줄이기', value: true, on: (v) => ((auto = v), (clock = 0)) },
    ],
  };
});

/* ═════════════════════════ i378 행렬 변환 ═════════════════════════ */
const i378 = cv('2×2 행렬이 모눈 전체를 늘이고 돌리고 기울인다 — (1,0) · (0,1) 이 가는 곳이 행렬의 두 열, 넓이 = 행렬식', () => {
  const r30 = Math.PI / 6;
  const PRE: { m: [number, number, number, number]; name: string }[] = [
    { m: [Math.cos(r30), -Math.sin(r30), Math.sin(r30), Math.cos(r30)], name: '30° 돌리기' },
    { m: [1, 1, 0, 1], name: '옆으로 밀기' },
    { m: [2, 0, 0, 1], name: '가로 2배' },
    { m: [-1, 0, 0, 1], name: '좌우 뒤집기' },
    { m: [1, -0.5, 0.5, 1.5], name: '늘이고 돌리기' },
    { m: [1, 2, 0.5, 1], name: '납작해짐' },
  ];
  let sel = 0;
  let auto = true;
  let ghost = true;
  let clock = 0;
  let M: [number, number, number, number] = [1, 0, 0, 1];
  let drag: '' | 'i' | 'j' = '';
  let name = '';
  const CX = 101;
  const CY = 90;
  const U = 24;
  const sx = (x: number, y: number): number => CX + (M[0] * x + M[1] * y) * U;
  const sy = (x: number, y: number): number => CY - (M[2] * x + M[3] * y) * U;
  const fm = (v: number): string => {
    const r = Math.round(v * 100) / 100;
    return (r < -1e-9 ? '−' : '') + String(Math.abs(r));
  };
  return {
    draw(g, _t, dt) {
      if (auto && !drag) {
        clock += dt;
        const per = 3.8;
        const cyc = Math.floor(clock / per);
        const tau = clock - cyc * per;
        sel = cyc % PRE.length;
        const T = PRE[sel]!.m;
        const k = tau < 1.2 ? smooth(0, 1.2, tau) : tau < 2.6 ? 1 : 1 - smooth(2.6, 3.4, tau);
        M = [lerp(1, T[0], k), lerp(0, T[1], k), lerp(0, T[2], k), lerp(1, T[3], k)];
        name = PRE[sel]!.name;
      }
      g.save();
      rr(g, 6, 6, 190, 163, 8);
      g.clip();
      g.fillStyle = 'rgba(255,255,255,0.02)';
      g.fillRect(6, 6, 190, 163);
      if (ghost) {
        g.strokeStyle = inkA(0.07);
        g.lineWidth = 0.5;
        g.setLineDash([2, 2]);
        g.beginPath();
        for (let i = -5; i <= 5; i++) {
          g.moveTo(CX + i * U, 6);
          g.lineTo(CX + i * U, 169);
        }
        for (let i = -4; i <= 4; i++) {
          g.moveTo(6, CY - i * U);
          g.lineTo(196, CY - i * U);
        }
        g.stroke();
        g.setLineDash([]);
      }
      const R = 10;
      g.strokeStyle = coolA(0.2);
      g.lineWidth = 0.6;
      g.beginPath();
      for (let i = -R; i <= R; i++) {
        if (!i) continue;
        g.moveTo(sx(i, -R), sy(i, -R));
        g.lineTo(sx(i, R), sy(i, R));
        g.moveTo(sx(-R, i), sy(-R, i));
        g.lineTo(sx(R, i), sy(R, i));
      }
      g.stroke();
      g.strokeStyle = inkA(0.45);
      g.lineWidth = 0.9;
      g.beginPath();
      g.moveTo(sx(-R, 0), sy(-R, 0));
      g.lineTo(sx(R, 0), sy(R, 0));
      g.moveTo(sx(0, -R), sy(0, -R));
      g.lineTo(sx(0, R), sy(0, R));
      g.stroke();
      // 단위 정사각형
      const det = M[0] * M[3] - M[1] * M[2];
      g.beginPath();
      g.moveTo(sx(0, 0), sy(0, 0));
      g.lineTo(sx(1, 0), sy(1, 0));
      g.lineTo(sx(1, 1), sy(1, 1));
      g.lineTo(sx(0, 1), sy(0, 1));
      g.closePath();
      g.fillStyle = det < 0 ? coolA(0.22) : accA(0.22);
      g.fill();
      g.strokeStyle = det < 0 ? coolA(0.7) : accA(0.7);
      g.lineWidth = 0.9;
      g.stroke();
      text(g, fm(Math.abs(det)), (sx(0, 0) + sx(1, 1)) / 2, (sy(0, 0) + sy(1, 1)) / 2, 7.5, INK, 'center', 700);
      arrow(g, sx(0, 0), sy(0, 0), sx(1, 0), sy(1, 0), ACC, 2.2, 7);
      arrow(g, sx(0, 0), sy(0, 0), sx(0, 1), sy(0, 1), COOL, 2.2, 7);
      glowDot(g, sx(1, 0), sy(1, 0), drag === 'i' ? 3 : 2.2);
      glowDot(g, sx(0, 1), sy(0, 1), drag === 'j' ? 3 : 2.2, COOL);
      mtext(g, ['(', fm(M[0]), ', ', fm(M[2]), ')'], sx(1, 0) + 5, sy(1, 0) + 8, 7, 'l', ACC);
      mtext(g, ['(', fm(M[1]), ', ', fm(M[3]), ')'], sx(0, 1) + 5, sy(0, 1) - 7, 7, 'l', COOL);
      g.restore();
      // 오른쪽: 행렬
      const rx = 206;
      text(g, name || '직접 끄는 중', rx, 18, 8.5, inkA(0.7), 'left', 700);
      const top = 32;
      const bh = 34;
      g.strokeStyle = inkA(0.75);
      g.lineWidth = 1.1;
      g.beginPath();
      g.moveTo(rx + 4, top);
      g.lineTo(rx, top);
      g.lineTo(rx, top + bh);
      g.lineTo(rx + 4, top + bh);
      g.moveTo(rx + 62, top);
      g.lineTo(rx + 66, top);
      g.lineTo(rx + 66, top + bh);
      g.lineTo(rx + 62, top + bh);
      g.stroke();
      text(g, fm(M[0]), rx + 18, top + 9, 10, ACC, 'center', 700);
      text(g, fm(M[2]), rx + 18, top + 25, 10, ACC, 'center', 700);
      text(g, fm(M[1]), rx + 48, top + 9, 10, COOL, 'center', 700);
      text(g, fm(M[3]), rx + 48, top + 25, 10, COOL, 'center', 700);
      text(g, '(1,0) 이 가는 곳', rx, 80, 6.5, accA(0.85));
      text(g, '(0,1) 이 가는 곳', rx, 90, 6.5, coolA(0.9));
      mtext(g, ['넓이 = ', ['i', 'a'], ['i', 'd'], ' − ', ['i', 'b'], ['i', 'c']], rx, 108, 8, 'l', inkA(0.65));
      text(g, `= ${fm(det)}`, rx, 126, 15, det < 0 ? COOL : ACC, 'left', 800);
      const msg = Math.abs(det) < 0.005 ? '넓이 0 — 한 줄로 납작' : det < 0 ? '음수 — 앞뒤가 뒤집힘' : `넓이 ${fm(det)}배`;
      text(g, msg, rx, 144, 7.5, inkA(0.6));
    },
    down(x, y) {
      if (Math.hypot(x - sx(1, 0), y - sy(1, 0)) < 9) drag = 'i';
      else if (Math.hypot(x - sx(0, 1), y - sy(0, 1)) < 9) drag = 'j';
      if (drag) {
        auto = false;
        name = '';
      }
    },
    move(x, y, pressed) {
      if (drag && pressed) {
        const vx = clamp(Math.round(((x - CX) / U) * 10) / 10, -3.5, 3.5);
        const vy = clamp(Math.round(((CY - y) / U) * 10) / 10, -3.2, 3.2);
        if (drag === 'i') M = [vx, M[1], vy, M[3]];
        else M = [M[0], vx, M[2], vy];
        return 'grabbing';
      }
      return Math.hypot(x - sx(1, 0), y - sy(1, 0)) < 9 || Math.hypot(x - sx(0, 1), y - sy(0, 1)) < 9 ? 'grab' : '';
    },
    up() {
      drag = '';
    },
    controls: [
      {
        type: 'range',
        label: '행렬 고르기 (1 돌리기 · 2 밀기 · 3 늘이기 · 4 뒤집기 · 5 섞기 · 6 납작)',
        min: 1,
        max: 6,
        step: 1,
        value: 1,
        on: (v) => {
          auto = false;
          sel = v - 1;
          M = [...PRE[sel]!.m];
          name = PRE[sel]!.name;
        },
      },
      { type: 'toggle', label: '자동으로 돌아가며 보기', value: true, on: (v) => ((auto = v), (clock = 0)) },
      { type: 'toggle', label: '원래 모눈 겹쳐 보기', value: true, on: (v) => (ghost = v) },
    ],
  };
});

/* ═════════════════════════ i379 큰 수의 법칙 ═════════════════════════ */
const i379 = cv('동전을 실제로 수천 번 — 처음엔 들쭉날쭉하던 앞면 비율 여러 줄이 모두 1/2 로 모여든다', () => {
  let lines = 6;
  let dice = false;
  let Nmax = 5000;
  let cum: Int32Array[] = [];
  let n = 0;
  let clock = 0;
  const GROW = 4.6;
  const HOLD = 1.6;
  function reset(): void {
    cum = Array.from({ length: lines }, () => new Int32Array(Nmax + 1));
    n = 0;
    clock = 0;
  }
  reset();
  return {
    draw(g, _t, dt) {
      const p = dice ? 1 / 6 : 0.5;
      clock += dt;
      if (clock > GROW + HOLD) reset();
      const target = Math.min(Nmax, Math.round(Math.pow(Nmax, Math.min(1, clock / GROW))));
      while (n < target) {
        n++;
        for (let l = 0; l < lines; l++) {
          const c = cum[l]!;
          c[n] = c[n - 1]! + (Math.random() < p ? 1 : 0);
        }
      }
      const x0 = 30;
      const x1 = 262;
      const y0 = 26;
      const y1 = 138;
      const ymax = dice ? 1 / 3 : 1;
      const LN = Math.log(Nmax);
      const X = (k: number): number => x0 + ((x1 - x0) * Math.log(k)) / LN;
      const Y = (v: number): number => y1 - ((y1 - y0) * v) / ymax;
      rr(g, x0 - 4, y0 - 4, x1 - x0 + 8, y1 - y0 + 8, 6);
      g.fillStyle = 'rgba(255,255,255,0.025)';
      g.fill();
      // 2σ 띠
      g.beginPath();
      for (let px = x0; px <= x1; px += 2) {
        const k = Math.exp(((px - x0) / (x1 - x0)) * LN);
        g.lineTo(px, Y(Math.min(ymax, p + 2 * Math.sqrt((p * (1 - p)) / k))));
      }
      for (let px = x1; px >= x0; px -= 2) {
        const k = Math.exp(((px - x0) / (x1 - x0)) * LN);
        g.lineTo(px, Y(Math.max(0, p - 2 * Math.sqrt((p * (1 - p)) / k))));
      }
      g.closePath();
      g.fillStyle = accA(0.07);
      g.fill();
      // 눈금
      g.lineWidth = 0.5;
      for (let k = 1; k <= Nmax; k *= 10) {
        g.strokeStyle = inkA(0.08);
        g.beginPath();
        g.moveTo(X(k), y0);
        g.lineTo(X(k), y1);
        g.stroke();
        text(g, comma(k), X(k), y1 + 8, 6.5, inkA(0.45), 'center');
      }
      text(g, '던진 횟수 (로그 눈금)', x1, y1 + 17, 6.5, inkA(0.4), 'right');
      g.strokeStyle = inkA(0.25);
      g.beginPath();
      g.moveTo(x0, y1);
      g.lineTo(x1, y1);
      g.stroke();
      text(g, '0', x0 - 6, Y(0), 7, inkA(0.45), 'right');
      mtext(g, [dice ? ['/', '1', '3'] : '1'], x0 - 4, Y(ymax), 7, 'r', inkA(0.45));
      // 이론 확률
      g.setLineDash([4, 3]);
      g.strokeStyle = accA(0.8);
      g.lineWidth = 0.9;
      g.beginPath();
      g.moveTo(x0, Y(p));
      g.lineTo(x1, Y(p));
      g.stroke();
      g.setLineDash([]);
      mtext(g, [['/', '1', dice ? '6' : '2', ACC]], x0 - 4, Y(p), 8, 'r');
      // 줄
      const xe = X(Math.max(1, n));
      g.lineJoin = 'round';
      for (let l = lines - 1; l >= 0; l--) {
        const c = cum[l]!;
        g.beginPath();
        let last = 0;
        for (let px = x0; px <= xe + 0.01; px += 1.5) {
          const k = clamp(Math.round(Math.exp(((px - x0) / (x1 - x0)) * LN)), 1, n);
          if (k === last && px > x0) continue;
          last = k;
          const yy = Y(c[k]! / k);
          if (px === x0) g.moveTo(X(k), yy);
          else g.lineTo(X(k), yy);
        }
        g.lineTo(xe, Y(c[n]! / n));
        g.strokeStyle = l === 0 ? ACC : inkA(0.3);
        g.lineWidth = l === 0 ? 1.5 : 0.85;
        g.stroke();
        if (l === 0) glowDot(g, xe, Y(c[n]! / n), 2.2);
      }
      // 위 · 아래 글
      text(g, dice ? '주사위에서 6이 나온 비율' : '동전 앞면이 나온 비율', 26, 12, 9, inkA(0.7), 'left', 700);
      mtext(g, [['i', 'n'], ` = ${comma(n)}`], 262, 12, 10, 'r', INK, 700);
      const dev = (k: number): number => {
        let mx = 0;
        for (let l = 0; l < lines; l++) mx = Math.max(mx, Math.abs(cum[l]![k]! / k - p));
        return mx;
      };
      if (n >= 10) {
        mtext(g, ['가장 먼 줄과의 차이   10번: ', ['c', inkA(0.9), dev(10).toFixed(3)], '   →   지금: ', ['c', ACC, dev(n).toFixed(3)]], 140, 166, 8, 'c', inkA(0.55));
      }
    },
    controls: [
      { type: 'range', label: '줄 수 (동시에 하는 실험)', min: 1, max: 12, step: 1, value: 6, on: (v) => ((lines = v), reset()) },
      { type: 'toggle', label: '주사위 (6이 나올 확률 1/6)', value: false, on: (v) => ((dice = v), reset()) },
      { type: 'range', label: '던지는 횟수', min: 1000, max: 20000, step: 1000, value: 5000, on: (v) => ((Nmax = v), reset()) },
      { type: 'button', label: '다시 던지기', on: () => reset() },
    ],
  };
});

/* ═════════════════════════ i380 갈톤 판 · 합의 분포 ═════════════════════════ */
const i380 = cv('공이 핀마다 왼쪽 · 오른쪽 반반 — 쌓인 막대가 이항 분포의 종 모양, 주사위 여러 개의 합도 같은 모양', () => {
  let mode = 0;
  let R = 10;
  let m = 4;
  let speed = 1;
  let clock = 0;
  interface Ball {
    age: number;
    ks: Uint8Array;
  }
  let balls: Ball[] = [];
  let bins: number[] = [];
  let landed = 0;
  let spawn = 0;
  let hold = 0;
  let dHist: number[] = [];
  let rolls = 0;
  let last: number[] = [];
  let rollAcc = 0;
  const RATE = 60;
  const ROWS_PER_S = 9;
  const NB = 500;
  const choose = (nn: number, k: number): number => {
    let r = 1;
    for (let i = 1; i <= k; i++) r = (r * (nn - k + i)) / i;
    return r;
  };
  function resetG(): void {
    balls = [];
    bins = new Array(R + 1).fill(0);
    landed = 0;
    hold = 0;
  }
  function resetD(): void {
    dHist = new Array(5 * m + 1).fill(0);
    rolls = 0;
    last = [];
  }
  resetG();
  resetD();
  let dist: number[] = [];
  let distM = 0;
  function diceDist(): number[] {
    if (distM === m) return dist;
    let d = [1];
    for (let k = 0; k < m; k++) {
      const nd = new Array(d.length + 5).fill(0);
      d.forEach((v, i) => {
        for (let f = 0; f < 6; f++) nd[i + f] += v / 6;
      });
      d = nd;
    }
    dist = d;
    distM = m;
    return d;
  }
  function galton(g: G, dt: number): void {
    const apex = 140;
    const dx = Math.min(19, 236 / (R + 1));
    const dy = Math.min(9, 74 / R);
    const top = 24;
    const hTop = top + R * dy + 4;
    const hBot = 162;
    if (landed + balls.length < NB) {
      spawn += dt * RATE;
      while (spawn >= 1 && landed + balls.length < NB) {
        spawn -= 1;
        const ks = new Uint8Array(R + 1);
        for (let r = 0; r < R; r++) ks[r + 1] = ks[r]! + (Math.random() < 0.5 ? 1 : 0);
        balls.push({ age: -Math.random() * 0.05, ks });
      }
    } else if (!balls.length) {
      hold += dt;
      if (hold > 1.4) resetG();
    }
    const px = (r: number, k: number): number => apex + (k - r / 2) * dx;
    // 깔때기
    g.strokeStyle = inkA(0.25);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(apex - 14, 6);
    g.lineTo(apex - 4, top - 6);
    g.moveTo(apex + 14, 6);
    g.lineTo(apex + 4, top - 6);
    g.stroke();
    // 핀
    const pr = Math.min(1.9, dx * 0.12);
    for (let r = 0; r < R; r++) for (let k = 0; k <= r; k++) {
      const x = px(r, k);
      const y = top + r * dy + 2.6;
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath();
      g.arc(x + 0.4, y + 0.6, pr, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#8f9cc8';
      g.beginPath();
      g.arc(x, y, pr, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.beginPath();
      g.arc(x - pr * 0.3, y - pr * 0.35, pr * 0.4, 0, Math.PI * 2);
      g.fill();
    }
    // 칸막이 · 막대
    const total = landed;
    const E = (k: number): number => (total * choose(R, k)) / 2 ** R;
    let mx = 1;
    for (let k = 0; k <= R; k++) mx = Math.max(mx, bins[k]!, E(k));
    const sc = (hBot - hTop - 6) / mx;
    for (let k = 0; k <= R; k++) {
      const x = apex + (k - R / 2) * dx;
      const hh = bins[k]! * sc;
      if (hh > 0) {
        rr(g, x - dx * 0.4, hBot - hh, dx * 0.8, hh, Math.min(2, dx * 0.2));
        g.fillStyle = accFill(g, hTop, hBot);
        g.fill();
      }
      g.strokeStyle = inkA(0.1);
      g.lineWidth = 0.5;
      g.beginPath();
      g.moveTo(x + dx / 2, hTop + 4);
      g.lineTo(x + dx / 2, hBot);
      g.stroke();
    }
    g.strokeStyle = inkA(0.3);
    g.beginPath();
    g.moveTo(apex - (R / 2 + 0.6) * dx, hBot);
    g.lineTo(apex + (R / 2 + 0.6) * dx, hBot);
    g.stroke();
    // 이론 (이항 분포)
    if (total > 0) {
      g.beginPath();
      for (let k = 0; k <= R; k++) {
        const x = apex + (k - R / 2) * dx;
        const y = hBot - E(k) * sc;
        if (k) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.lineWidth = 1;
      g.stroke();
      for (let k = 0; k <= R; k++) {
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(apex + (k - R / 2) * dx, hBot - E(k) * sc, 1.3, 0, Math.PI * 2);
        g.fill();
      }
    }
    // 공
    const keep: Ball[] = [];
    const br = Math.min(2.4, dx * 0.15);
    g.fillStyle = '#ffe2a0';
    for (const b of balls) {
      b.age += dt;
      const s = b.age * ROWS_PER_S - 1;
      let x: number;
      let y: number;
      if (s < 0) {
        x = apex;
        y = lerp(4, top, s + 1);
      } else if (s < R) {
        const r = Math.floor(s);
        const fr = s - r;
        x = lerp(px(r, b.ks[r]!), px(r + 1, b.ks[r + 1]!), fr);
        y = lerp(top + r * dy, top + (r + 1) * dy, fr) - Math.sin(Math.PI * fr) * dy * 0.55 - br;
      } else {
        const k = b.ks[R]!;
        x = apex + (k - R / 2) * dx;
        const fall = (s - R) / ROWS_PER_S;
        y = top + R * dy + fall * 140;
        if (y >= hBot - bins[k]! * sc - 1.5) {
          bins[k]!++;
          landed++;
          continue;
        }
      }
      keep.push(b);
      g.beginPath();
      g.arc(x, y, br, 0, Math.PI * 2);
      g.fill();
    }
    balls = keep;
    text(g, `공 ${comma(landed)}개`, 12, 16, 9, INK, 'left', 700);
    mtext(g, ['막대: 실제   선: ', ['i', 'B'], `(${R}, `, ['/', '1', '2'], ')'], 268, 16, 7.5, 'r', inkA(0.6));
  }
  function diceSum(g: G, dt: number): void {
    const total = 600;
    if (rolls < total) {
      rollAcc += dt * 45;
      while (rollAcc >= 1 && rolls < total) {
        rollAcc -= 1;
        last = [];
        let s = 0;
        for (let i = 0; i < m; i++) {
          const f = 1 + Math.floor(Math.random() * 6);
          last.push(f);
          s += f;
        }
        dHist[s - m]!++;
        rolls++;
      }
    } else {
      hold += dt;
      if (hold > 1.4) {
        hold = 0;
        resetD();
      }
    }
    // 주사위 그림
    const ds = 15;
    const gap = 5;
    const wAll = m * ds + (m - 1) * gap;
    const sx0 = 120 - wAll / 2;
    const PIPS: number[][][] = [[], [[0, 0]], [[-1, -1], [1, 1]], [[-1, -1], [0, 0], [1, 1]], [[-1, -1], [1, -1], [-1, 1], [1, 1]], [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]];
    last.forEach((f, i) => {
      const x = sx0 + i * (ds + gap);
      rr(g, x, 9, ds, ds, 3.5);
      g.fillStyle = '#f4f0e6';
      g.fill();
      g.fillStyle = DARK;
      for (const [a, b] of PIPS[f]!) {
        g.beginPath();
        g.arc(x + ds / 2 + a! * ds * 0.27, 9 + ds / 2 + b! * ds * 0.27, 1.45, 0, Math.PI * 2);
        g.fill();
      }
    });
    if (last.length) mtext(g, [' = ', ['c', ACC, String(last.reduce((a, b) => a + b, 0))]], sx0 + wAll + 2, 16.5, 12, 'l', INK, 800);
    text(g, `${comma(rolls)}번`, 268, 16, 9, INK, 'right', 700);
    // 막대
    const nb = 5 * m + 1;
    const x0 = 16;
    const x1 = 264;
    const bw = (x1 - x0) / nb;
    const hTop = 38;
    const hBot = 148;
    const d = diceDist();
    let mx = 1;
    for (let i = 0; i < nb; i++) mx = Math.max(mx, dHist[i]!, (d[i] ?? 0) * rolls);
    const sc = (hBot - hTop) / mx;
    for (let i = 0; i < nb; i++) {
      const hh = dHist[i]! * sc;
      if (hh > 0) {
        rr(g, x0 + i * bw + bw * 0.1, hBot - hh, bw * 0.8, hh, Math.min(2, bw * 0.2));
        g.fillStyle = accFill(g, hTop, hBot);
        g.fill();
      }
      const every = bw > 9 ? 1 : bw > 5 ? 2 : 5;
      if ((i + m) % every === 0) text(g, String(i + m), x0 + (i + 0.5) * bw, hBot + 7, Math.min(7, bw * 0.8), inkA(0.5), 'center');
    }
    if (rolls > 0) {
      g.beginPath();
      for (let i = 0; i < nb; i++) {
        const x = x0 + (i + 0.5) * bw;
        const y = hBot - (d[i] ?? 0) * rolls * sc;
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.lineWidth = 1;
      g.stroke();
    }
    text(g, `주사위 ${m}개의 합`, 16, 167, 7.5, inkA(0.6));
    text(g, '선: 정확한 확률 × 던진 횟수', 264, 167, 7, inkA(0.5), 'right');
  }
  return {
    draw(g, _t, dt0) {
      const dt = dt0 * speed;
      clock += dt;
      let which = mode;
      if (mode === 0) which = Math.floor(clock / 10) % 2 === 0 ? 1 : 2;
      if (which === 1) galton(g, dt);
      else diceSum(g, dt);
    },
    controls: [
      { type: 'range', label: '보기 (0 번갈아 · 1 갈톤 판 · 2 주사위 합)', min: 0, max: 2, step: 1, value: 0, on: (v) => ((mode = v), (clock = 0), resetG(), resetD()) },
      { type: 'range', label: '핀 줄 수', min: 4, max: 14, step: 1, value: 10, on: (v) => ((R = v), resetG()) },
      { type: 'range', label: '주사위 개수', min: 1, max: 6, step: 1, value: 4, on: (v) => ((m = v), resetD()) },
      { type: 'range', label: '빠르기', min: 0.5, max: 4, step: 0.5, value: 1, on: (v) => (speed = v) },
    ],
  };
});

/* ═════════════════════════ i381 몬테카를로 ═════════════════════════ */
const i381 = cv('정사각형에 점을 마구 찍으면 원 안 비율 × 4 → π — 점이 많을수록 오차가 1/√n 처럼 줄어든다', () => {
  let Nmax = 5000;
  let T = 5;
  let para = false;
  let pts = new Float32Array(Nmax * 2);
  let n = 0;
  let inside = 0;
  let clock = 0;
  let errs: [number, number][] = [];
  const SX = 14;
  const SY = 20;
  const SIDE = 140;
  const dots = new Dots(SIDE, SIDE);
  const isIn = (x: number, y: number): boolean => (para ? y < x * x : x * x + y * y < 1);
  function reset(): void {
    pts = new Float32Array(Nmax * 2);
    n = 0;
    inside = 0;
    clock = 0;
    errs = [];
    dots.clear();
  }
  return {
    draw(g, _t, dt) {
      clock += dt;
      if (clock > T + 1.6) reset();
      const truth = para ? 1 / 3 : Math.PI;
      const target = Math.min(Nmax, Math.round(Math.pow(Nmax, Math.min(1, clock / T))));
      while (n < target) {
        const x = Math.random();
        const y = Math.random();
        pts[n * 2] = x;
        pts[n * 2 + 1] = y;
        if (isIn(x, y)) inside++;
        n++;
      }
      const est = n ? (para ? inside / n : (4 * inside) / n) : 0;
      if (n >= 10 && (!errs.length || n > errs[errs.length - 1]![0] * 1.04)) errs.push([n, Math.abs(est - truth)]);
      // 판
      rr(g, SX, SY, SIDE, SIDE, 3);
      g.fillStyle = 'rgba(255,255,255,0.03)';
      g.fill();
      g.beginPath();
      if (para) {
        g.moveTo(SX, SY + SIDE);
        for (let i = 0; i <= 50; i++) {
          const x = i / 50;
          g.lineTo(SX + x * SIDE, SY + SIDE - x * x * SIDE);
        }
        g.lineTo(SX + SIDE, SY + SIDE);
      } else {
        g.moveTo(SX, SY + SIDE);
        g.arc(SX, SY + SIDE, SIDE, -Math.PI / 2, 0);
      }
      g.closePath();
      g.fillStyle = accA(0.06);
      g.fill();
      // 점 쌓기
      const oc = dots.ctx(g);
      const k = dots.k;
      const rad = Math.max(0.6, 0.8 * k);
      for (let i = dots.drawn; i < n; i++) {
        const x = pts[i * 2]!;
        const y = pts[i * 2 + 1]!;
        oc.fillStyle = isIn(x, y) ? 'rgba(255,192,74,0.9)' : 'rgba(170,192,255,0.8)';
        oc.fillRect(x * SIDE * k - rad, (1 - y) * SIDE * k - rad, rad * 2, rad * 2);
      }
      dots.drawn = n;
      dots.blit(g, SX, SY);
      g.beginPath();
      if (para) {
        for (let i = 0; i <= 50; i++) {
          const x = i / 50;
          if (i) g.lineTo(SX + x * SIDE, SY + SIDE - x * x * SIDE);
          else g.moveTo(SX, SY + SIDE);
        }
      } else g.arc(SX, SY + SIDE, SIDE, -Math.PI / 2, 0);
      g.strokeStyle = ACC;
      g.lineWidth = 1.2;
      g.stroke();
      rr(g, SX, SY, SIDE, SIDE, 3);
      g.strokeStyle = inkA(0.3);
      g.lineWidth = 0.8;
      g.stroke();
      for (let i = Math.max(0, n - 4); i < n; i++) glowDot(g, SX + pts[i * 2]! * SIDE, SY + (1 - pts[i * 2 + 1]!) * SIDE, 1.8, isIn(pts[i * 2]!, pts[i * 2 + 1]!) ? ACC : COOL);
      // 오른쪽
      const rx = 164;
      text(g, para ? 'y = x² 아래 넓이 재기' : '원주율 π 재기', rx, 22, 8.5, inkA(0.6), 'left', 700);
      if (para) mtext(g, [['/', comma(inside), comma(n), ACC]], rx, 46, 12);
      else mtext(g, ['4 × ', ['/', comma(inside), comma(n), ACC]], rx, 46, 12);
      text(g, `= ${est.toFixed(4)}`, rx, 72, 17, ACC, 'left', 800);
      if (para) mtext(g, ['실제 ', ['/', '1', '3'], ' = 0.3333…'], rx, 92, 7.5, 'l', inkA(0.55));
      else text(g, '실제 π = 3.14159…', rx, 92, 7.5, inkA(0.55));
      // 오차 그래프 (로그-로그)
      const gx = 166;
      const gy = 104;
      const gw = 104;
      const gh = 54;
      rr(g, gx, gy, gw, gh, 4);
      g.fillStyle = 'rgba(255,255,255,0.03)';
      g.fill();
      const L0 = Math.log(10);
      const L1 = Math.log(Math.max(100, Nmax));
      const EX = (nn: number): number => gx + 3 + ((gw - 6) * (Math.log(nn) - L0)) / (L1 - L0);
      const EY = (e: number): number => gy + 3 + ((gh - 6) * (Math.log(0.5) - Math.log(Math.max(e, 1e-4)))) / (Math.log(0.5) - Math.log(1e-4));
      const sig = para ? Math.sqrt((1 / 3) * (2 / 3)) : 4 * Math.sqrt((Math.PI / 4) * (1 - Math.PI / 4));
      g.setLineDash([2, 2]);
      g.strokeStyle = inkA(0.4);
      g.lineWidth = 0.7;
      g.beginPath();
      g.moveTo(EX(10), EY(sig / Math.sqrt(10)));
      g.lineTo(EX(Math.max(100, Nmax)), EY(sig / Math.sqrt(Math.max(100, Nmax))));
      g.stroke();
      g.setLineDash([]);
      g.beginPath();
      errs.forEach(([nn, e], i) => (i ? g.lineTo(EX(nn), EY(e)) : g.moveTo(EX(nn), EY(e))));
      g.strokeStyle = ACC;
      g.lineWidth = 0.9;
      g.stroke();
      mtext(g, [['/', '1', '√n']], gx + gw - 4, gy + 12, 6.5, 'r', inkA(0.5));
      text(g, `오차 ${n >= 10 ? Math.abs(est - truth).toFixed(4) : '—'}`, gx + 4, gy + gh + 7, 7, inkA(0.6));
      text(g, `점 ${comma(n)}개`, gx + gw, gy + gh + 7, 7, inkA(0.6), 'right');
    },
    controls: [
      { type: 'range', label: '찍을 점 수', min: 1000, max: 30000, step: 1000, value: 5000, on: (v) => ((Nmax = v), reset()) },
      { type: 'range', label: '한 바퀴 시간 (초)', min: 2, max: 12, step: 1, value: 5, on: (v) => ((T = v), reset()) },
      { type: 'toggle', label: '포물선 아래 넓이 재기 (답 1/3)', value: false, on: (v) => ((para = v), reset()) },
      { type: 'button', label: '다시 찍기', on: () => reset() },
    ],
  };
});

/* ═════════════════════════ i382 프랙탈 ═════════════════════════ */
const i382 = cv('같은 규칙을 거듭하면 — 시에르핀스키 삼각형(넓이 → 0), 코흐 눈송이(둘레 → 무한, 넓이 → 8/5배), 카오스 게임', () => {
  let view = 0;
  let autoLv = true;
  let lvSet = 4;
  let clock = 0;
  const A: [number, number] = [95, 24];
  const B: [number, number] = [20, 24 + 75 * Math.sqrt(3)];
  const C: [number, number] = [170, 24 + 75 * Math.sqrt(3)];
  const SIER = 7 * 1.25 + 1.2;
  const KOCH = 6 * 1.35 + 1.2;
  const CHAOS = 6.5;
  const dots = new Dots(156, 136);
  let cp: [number, number] = [95, 100];
  let cn = 0;
  let jumps: [number, number, number, number][] = [];
  let lastChaosCycle = -1;
  function tri(g: G, a: [number, number], b: [number, number], c: [number, number], n: number, holes: boolean): void {
    if (n === 0) {
      if (!holes) {
        g.moveTo(a[0], a[1]);
        g.lineTo(b[0], b[1]);
        g.lineTo(c[0], c[1]);
        g.closePath();
      }
      return;
    }
    const ab: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const bc: [number, number] = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2];
    const ca: [number, number] = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2];
    if (holes && n === 1) {
      g.moveTo(ab[0], ab[1]);
      g.lineTo(bc[0], bc[1]);
      g.lineTo(ca[0], ca[1]);
      g.closePath();
      return;
    }
    tri(g, a, ab, ca, n - 1, holes);
    tri(g, ab, b, bc, n - 1, holes);
    tri(g, ca, bc, c, n - 1, holes);
  }
  function koch(n: number, k: number): number[] {
    const cx = 95;
    const cy = 100;
    const R = 66;
    let pts: number[] = [];
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
      pts.push(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    }
    pts.push(pts[0]!, pts[1]!);
    for (let lv = 1; lv <= n; lv++) {
      const kk = lv === n ? k : 1;
      const np: number[] = [];
      for (let i = 0; i + 3 < pts.length; i += 2) {
        const x0 = pts[i]!;
        const y0 = pts[i + 1]!;
        const x1 = pts[i + 2]!;
        const y1 = pts[i + 3]!;
        const ax = x0 + (x1 - x0) / 3;
        const ay = y0 + (y1 - y0) / 3;
        const bx = x0 + ((x1 - x0) * 2) / 3;
        const by = y0 + ((y1 - y0) * 2) / 3;
        const vx = bx - ax;
        const vy = by - ay;
        const c = 0.5;
        const s = -Math.sqrt(3) / 2;
        const px = ax + vx * c - vy * s;
        const py = ay + vx * s + vy * c;
        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2;
        np.push(x0, y0, ax, ay, lerp(mx, px, kk), lerp(my, py, kk), bx, by);
      }
      np.push(pts[pts.length - 2]!, pts[pts.length - 1]!);
      pts = np;
    }
    return pts;
  }
  function drawSier(g: G, lv: number, k: number): void {
    g.beginPath();
    tri(g, A, B, C, lv, false);
    g.fillStyle = accFill(g, A[1], B[1]);
    g.fill();
    if (lv >= 1 && k < 1) {
      g.beginPath();
      tri(g, A, B, C, lv, true);
      g.fillStyle = accFill(g, A[1], B[1], 1 - k);
      g.fill();
    }
    const rx = 182;
    text(g, '시에르핀스키 삼각형', rx, 24, 8.5, inkA(0.6), 'left', 700);
    mtext(g, ['단계 ', ['c', ACC, String(lv)]], rx, 44, 14, 'l', INK, 800);
    mtext(g, ['삼각형 3', ['^', String(lv)], ` = ${comma(3 ** lv)}개`], rx, 68, 8.5);
    mtext(g, ['넓이 (', ['/', '3', '4'], ')', ['^', String(lv)], ` = ${(0.75 ** lv).toFixed(3)}`], rx, 90, 8.5);
    mtext(g, ['둘레 (', ['/', '3', '2'], ')', ['^', String(lv)], ` = ${(1.5 ** lv).toFixed(2)}배`], rx, 116, 8.5);
    text(g, '넓이 → 0, 둘레 → 무한', rx, 140, 7.5, ACC);
  }
  function drawKoch(g: G, lv: number, k: number): void {
    const p = koch(lv, k);
    g.beginPath();
    g.moveTo(p[0]!, p[1]!);
    for (let i = 2; i < p.length; i += 2) g.lineTo(p[i]!, p[i + 1]!);
    g.closePath();
    g.fillStyle = accA(0.14);
    g.fill();
    g.lineJoin = 'round';
    g.strokeStyle = ACC;
    g.lineWidth = 1.1;
    g.stroke();
    const rx = 182;
    text(g, '코흐 눈송이', rx, 24, 8.5, inkA(0.6), 'left', 700);
    mtext(g, ['단계 ', ['c', ACC, String(lv)]], rx, 44, 14, 'l', INK, 800);
    mtext(g, ['변 3·4', ['^', String(lv)], ` = ${comma(3 * 4 ** lv)}개`], rx, 66, 8.5);
    mtext(g, ['둘레 (', ['/', '4', '3'], ')', ['^', String(lv)], ` = ${((4 / 3) ** lv).toFixed(2)}배`], rx, 88, 8.5);
    const area = 1 + 0.6 * (1 - (4 / 9) ** lv);
    text(g, `넓이 ${area.toFixed(3)}배`, rx, 110, 8.5);
    mtext(g, ['둘레 → 무한, 넓이 → ', ['/', '8', '5'], '배'], rx, 132, 7.5, 'l', ACC);
  }
  function drawChaos(g: G, tau: number, cycle: number): void {
    if (cycle !== lastChaosCycle) {
      lastChaosCycle = cycle;
      dots.clear();
      cn = 0;
      jumps = [];
      cp = [lerp(40, 150, Math.random()), lerp(60, 140, Math.random())];
    }
    const V = [A, B, C];
    const target = tau < 1.8 ? Math.floor(tau / 0.2) : Math.min(14000, 9 + Math.round(Math.pow(14000, Math.min(1, (tau - 1.8) / 3.5))));
    const oc = dots.ctx(g);
    const kk = dots.k;
    oc.fillStyle = 'rgba(255,192,74,0.85)';
    const rad = Math.max(0.5, 0.45 * kk);
    while (cn < target) {
      const v = V[Math.floor(Math.random() * 3)]!;
      const nx = (cp[0] + v[0]) / 2;
      const ny = (cp[1] + v[1]) / 2;
      if (jumps.length < 9) jumps.push([cp[0], cp[1], nx, ny]);
      cp = [nx, ny];
      cn++;
      oc.fillRect((nx - 17) * kk - rad, (ny - 22) * kk - rad, rad * 2, rad * 2);
    }
    dots.blit(g, 17, 22);
    for (const v of V) glowDot(g, v[0], v[1], 2.6, COOL);
    if (tau < 2.6) {
      g.globalAlpha = 1 - smooth(1.9, 2.6, tau);
      jumps.forEach((j, i) => {
        g.setLineDash([2, 2]);
        g.strokeStyle = inkA(0.5);
        g.lineWidth = 0.7;
        g.beginPath();
        g.moveTo(j[0], j[1]);
        g.lineTo(j[2], j[3]);
        g.stroke();
        g.setLineDash([]);
        if (i === jumps.length - 1) glowDot(g, j[2], j[3], 2.2);
      });
      g.globalAlpha = 1;
    }
    const rx = 182;
    text(g, '카오스 게임', rx, 24, 8.5, inkA(0.6), 'left', 700);
    mtext(g, ['점 ', ['c', ACC, comma(cn)], '개'], rx, 44, 13, 'l', INK, 800);
    text(g, '꼭짓점 셋 중 하나를', rx, 68, 8, inkA(0.85));
    text(g, '무작위로 골라', rx, 80, 8, inkA(0.85));
    text(g, '그 중간으로 뛰기', rx, 92, 8, inkA(0.85));
    text(g, '무작위인데도', rx, 118, 7.5, ACC);
    text(g, '같은 삼각형 무늬!', rx, 130, 7.5, ACC);
  }
  return {
    draw(g, _t, dt) {
      clock += dt;
      if (view === 0) {
        const all = SIER + KOCH + CHAOS;
        const cyc = Math.floor(clock / all);
        const tt = clock - cyc * all;
        if (tt < SIER) {
          const lv = Math.min(6, Math.floor(tt / 1.25));
          drawSier(g, lv, smooth(0, 0.6, tt - lv * 1.25));
        } else if (tt < SIER + KOCH) {
          const s = tt - SIER;
          const lv = Math.min(5, Math.floor(s / 1.35));
          drawKoch(g, lv, smooth(0, 0.7, s - lv * 1.35));
        } else drawChaos(g, tt - SIER - KOCH, cyc);
      } else if (view === 3) {
        const cyc = Math.floor(clock / (CHAOS + 2));
        drawChaos(g, clock - cyc * (CHAOS + 2), cyc);
      } else {
        const maxL = view === 1 ? 7 : 6;
        let lv = Math.min(lvSet, maxL);
        let k = 1;
        if (autoLv) {
          const per = 1.3;
          const all = (maxL + 1) * per + 1;
          const tt = clock % all;
          lv = Math.min(maxL, Math.floor(tt / per));
          k = smooth(0, 0.6, tt - lv * per);
        }
        if (view === 1) drawSier(g, lv, k);
        else drawKoch(g, lv, k);
      }
    },
    controls: [
      { type: 'range', label: '보기 (0 자동 · 1 시에르핀스키 · 2 코흐 · 3 카오스 게임)', min: 0, max: 3, step: 1, value: 0, on: (v) => ((view = v), (clock = 0), (lastChaosCycle = -1)) },
      { type: 'toggle', label: '단계 자동으로 올리기', value: true, on: (v) => (autoLv = v) },
      { type: 'range', label: '단계 (자동을 끄면)', min: 0, max: 7, step: 1, value: 4, on: (v) => ((lvSet = v), (autoLv = false)) },
    ],
  };
});

/* ═════════════════════════ i383 피보나치 · 황금 비율 ═════════════════════════ */
const i383 = cv('1, 1, 2, 3, 5, 8, 13, 21 정사각형을 붙이면 황금 나선 — 해바라기 씨는 137.5° 씩 돌아 13 · 21 줄 나선', () => {
  const PHI = (1 + Math.sqrt(5)) / 2;
  const GOLD = 360 * (2 - PHI);
  let angle = 137.5;
  let seeds = 320;
  let arms = true;
  let clock = 0;
  const FIB = [1, 1, 2, 3, 5, 8, 13, 21];
  interface Sq {
    x: number;
    y: number;
    s: number;
    cx: number;
    cy: number;
    a0: number;
  }
  const sq: Sq[] = [];
  const boxes: { x: number; y: number; w: number; h: number }[] = [{ x: 0, y: 0, w: 1, h: 1 }];
  (() => {
    // y 위쪽이 + 인 수학 좌표로 쌓기: 첫 칸은 「아래」 다음 차례처럼 (오른쪽 → 위 → 왼쪽 → 아래)
    let rx = 0;
    let ry = 0;
    let rw = 1;
    let rh = 1;
    sq.push({ x: 0, y: 0, s: 1, cx: 1, cy: 1, a0: 180 });
    for (let i = 1; i < FIB.length; i++) {
      const d = (i - 1) % 4;
      if (d === 0) {
        const s = rh;
        sq.push({ x: rx + rw, y: ry, s, cx: rx + rw, cy: ry + s, a0: -90 });
        rw += s;
      } else if (d === 1) {
        const s = rw;
        sq.push({ x: rx, y: ry + rh, s, cx: rx, cy: ry + rh, a0: 0 });
        rh += s;
      } else if (d === 2) {
        const s = rh;
        sq.push({ x: rx - s, y: ry, s, cx: rx, cy: ry, a0: 90 });
        rx -= s;
        rw += s;
      } else {
        const s = rw;
        sq.push({ x: rx, y: ry - s, s, cx: rx + s, cy: ry, a0: 180 });
        ry -= s;
        rh += s;
      }
      boxes.push({ x: rx, y: ry, w: rw, h: rh });
    }
  })();
  // 지금 붙은 정사각형까지 화면에 꼭 맞게 — 붙을 때마다 부드럽게 뒤로 물러난다
  let sc = 1;
  let cxv = 0;
  let cyv = 0;
  const PX = (x: number): number => 78 + (x - cxv) * sc;
  const PY = (y: number): number => 80 - (y - cyv) * sc;
  const PER = 0.55;
  return {
    draw(g, _t, dt) {
      clock += dt;
      const all = FIB.length * PER + 2.2;
      const tt = clock % all;
      const cur = Math.min(FIB.length - 1, Math.floor(tt / PER));
      {
        const kz = smooth(0, 0.4, tt - cur * PER);
        const b0 = boxes[Math.max(0, cur - 1)]!;
        const b1 = boxes[cur]!;
        const fit = (b: { w: number; h: number }): number => Math.min(34, 122 / b.w, 104 / b.h);
        sc = lerp(fit(b0), fit(b1), kz);
        cxv = lerp(b0.x + b0.w / 2, b1.x + b1.w / 2, kz);
        cyv = lerp(b0.y + b0.h / 2, b1.y + b1.h / 2, kz);
      }
      // 정사각형
      for (let i = 0; i <= cur; i++) {
        const q = sq[i]!;
        const age = tt - i * PER;
        const a = smooth(0, 0.25, age);
        const x = PX(q.x);
        const y = PY(q.y + q.s);
        const w = q.s * sc;
        g.globalAlpha = a;
        rr(g, x + 0.4, y + 0.4, w - 0.8, w - 0.8, Math.min(3, w * 0.12));
        g.fillStyle = i === cur ? accA(0.2) : inkA(0.04 + (i % 2) * 0.03);
        g.fill();
        g.strokeStyle = i === cur ? accA(0.8) : inkA(0.25);
        g.lineWidth = 0.7;
        g.stroke();
        if (w >= 9) text(g, String(q.s), x + w / 2, y + w / 2, Math.min(15, w * 0.36), i === cur ? ACC : inkA(0.45), 'center', 700);
        g.globalAlpha = 1;
      }
      // 나선
      g.beginPath();
      let first = true;
      for (let i = 0; i <= cur; i++) {
        const q = sq[i]!;
        const pr = i < cur ? 1 : smooth(0.1, 0.5, tt - i * PER);
        const steps = 16;
        for (let j = 0; j <= steps * pr; j++) {
          const an = ((q.a0 + (90 * j) / steps) * Math.PI) / 180;
          const x = PX(q.cx + Math.cos(an) * q.s);
          const y = PY(q.cy + Math.sin(an) * q.s);
          if (first) g.moveTo(x, y);
          else g.lineTo(x, y);
          first = false;
        }
      }
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.strokeStyle = accA(0.25);
      g.lineWidth = 4;
      g.stroke();
      g.strokeStyle = ACC;
      g.lineWidth = 1.5;
      g.stroke();
      // 비율
      if (cur >= 1) {
        const a = FIB[cur]!;
        const b = FIB[cur - 1]!;
        mtext(g, [['/', String(a), String(b)], ` = ${(a / b).toFixed(4)}`], 14, 152, 10, 'l', INK, 700);
        mtext(g, ['→ φ = ', ['c', ACC, PHI.toFixed(4)], '…'], 14, 168, 7.5, 'l', inkA(0.55));
      }
      // 해바라기
      const cx = 220;
      const cy = 84;
      const R = 60;
      const useA = Math.abs(angle - 137.5) < 0.05 ? GOLD : angle;
      const showN = Math.floor(seeds * smooth(0, FIB.length * PER, tt));
      for (let i = 0; i < 34; i++) {
        const an = (i / 34) * Math.PI * 2 + 0.05;
        g.save();
        g.translate(cx + Math.cos(an) * (R + 6), cy + Math.sin(an) * (R + 6));
        g.rotate(an);
        g.beginPath();
        g.ellipse(0, 0, 7, 2.6, 0, 0, Math.PI * 2);
        g.fillStyle = accA(0.16);
        g.fill();
        g.restore();
      }
      g.beginPath();
      g.arc(cx, cy, R + 2, 0, Math.PI * 2);
      g.fillStyle = 'rgba(40,26,10,0.55)';
      g.fill();
      const dr = (0.88 * R) / Math.sqrt(seeds);
      const ra = (useA * Math.PI) / 180;
      for (let i = 0; i < showN; i++) {
        const r = R * Math.sqrt((i + 0.5) / seeds);
        const an = i * ra;
        const x = cx + Math.cos(an) * r;
        const y = cy + Math.sin(an) * r;
        const hiArm = arms && (i % 21 === 0 || i % 13 === 0);
        g.fillStyle = hiArm ? ACC : `rgba(${170 + Math.round(60 * (i / seeds))},${130 + Math.round(50 * (i / seeds))},80,0.9)`;
        g.beginPath();
        g.arc(x, y, dr * (0.75 + 0.25 * Math.sqrt(i / seeds)), 0, Math.PI * 2);
        g.fill();
      }
      mtext(g, [useA === GOLD ? '137.5° (황금각)' : `${angle.toFixed(1)}°`], cx, 162, 9, 'c', useA === GOLD ? ACC : INK, 700);
      if (arms) text(g, '나선 13줄 · 21줄', cx, 172, 6.5, inkA(0.5), 'center');
      text(g, '피보나치 직사각형', 14, 14, 8, inkA(0.55), 'left', 700);
    },
    controls: [
      { type: 'range', label: '씨앗 사이 각도 (137.5 = 황금각)', min: 130, max: 145, step: 0.1, value: 137.5, on: (v) => (angle = v) },
      { type: 'range', label: '씨앗 수', min: 100, max: 1200, step: 50, value: 320, on: (v) => (seeds = v) },
      { type: 'toggle', label: '나선 13줄 · 21줄 색칠', value: true, on: (v) => (arms = v) },
    ],
  };
});

export const DEMOS: DemoMap = { i372, i373, i374, i375, i376, i377, i378, i379, i380, i381, i382, i383 };

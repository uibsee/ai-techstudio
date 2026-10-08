import type { Control, DemoDom, DemoMap } from './types';

/**
 * 입력 기법 견본 (i418 ~ i425).
 * 카드: 왼쪽 「끔」 · 오른쪽 「켬」 두 판에 같은 손가락 시연을 흘려 차이가 바로 보이게.
 *       시연 손가락도 실제 입력 처리(down · move · up)를 그대로 거친다.
 * 크게 보기(폭 > 500): 한 판 + 오른쪽 판정 정보. 마우스 · 터치(Pointer Events)로 직접 해 보기,
 *       손을 떼고 8초 지나면 다시 시연.
 */

const VW = 300;
const VH = 340;
const TAU = Math.PI * 2;
const FONT = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
const COL = {
  bg0: '#141a30',
  bg1: '#090c18',
  panel: '#121831',
  panelLine: 'rgba(150,170,255,0.14)',
  board: '#0d1226',
  boardLine: 'rgba(160,180,255,0.16)',
  text: '#e4eaff',
  dim: '#8c96bd',
  on: '#3fe0c2',
  off: '#ff6b7d',
  warn: '#ffc350',
  blue: '#5aa9ff',
  gold: '#ffd166',
  violet: '#a98bff',
};
const EMU_ID = -77;

type V2 = { x: number; y: number };
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, f: number): number => a + (b - a) * f;
const smooth = (f: number): number => f * f * (3 - 2 * f);
const dist = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(ax - bx, ay - by);
const rgba = (hex: string, a: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const q = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + q, y);
  g.arcTo(x + w, y, x + w, y + h, q);
  g.arcTo(x + w, y + h, x, y + h, q);
  g.arcTo(x, y + h, x, y, q);
  g.arcTo(x, y, x + w, y, q);
  g.closePath();
}
function txt(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center', weight = 600): void {
  g.font = `${weight} ${size}px ${FONT}`;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillText(s, x, y);
}
function ring(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, lw: number, dash: number[] = []): void {
  g.beginPath();
  g.arc(x, y, Math.max(0.1, r), 0, TAU);
  g.setLineDash(dash);
  g.lineWidth = lw;
  g.strokeStyle = color;
  g.stroke();
  g.setLineDash([]);
}
function disc(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  g.beginPath();
  g.arc(x, y, Math.max(0.1, r), 0, TAU);
  g.fillStyle = color;
  g.fill();
}
function line(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, lw: number, dash: number[] = []): void {
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.setLineDash(dash);
  g.lineWidth = lw;
  g.strokeStyle = color;
  g.lineCap = 'round';
  g.stroke();
  g.setLineDash([]);
}
function cross(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, lw: number): void {
  line(g, x - r, y - r, x + r, y + r, color, lw);
  line(g, x + r, y - r, x - r, y + r, color, lw);
}
function arrow(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, lw: number): void {
  line(g, x1, y1, x2, y2, color, lw);
  const a = Math.atan2(y2 - y1, x2 - x1);
  const h = 4 + lw * 2;
  g.beginPath();
  g.moveTo(x2, y2);
  g.lineTo(x2 - Math.cos(a - 0.45) * h, y2 - Math.sin(a - 0.45) * h);
  g.lineTo(x2 - Math.cos(a + 0.45) * h, y2 - Math.sin(a + 0.45) * h);
  g.closePath();
  g.fillStyle = color;
  g.fill();
}
/** 판 바탕 (둥근 네모 + 안쪽 빛) */
function board(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 12): void {
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.45)';
  g.shadowBlur = 14;
  g.shadowOffsetY = 4;
  rr(g, x, y, w, h, r);
  const gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, '#141b36');
  gr.addColorStop(1, '#0b1022');
  g.fillStyle = gr;
  g.fill();
  g.restore();
  rr(g, x + 0.5, y + 0.5, w - 1, h - 1, r);
  g.lineWidth = 1;
  g.strokeStyle = COL.boardLine;
  g.stroke();
}

/* ───────── 손 아이콘 (선 아이콘: 검지 손) ───────── */
let HAND: Path2D | null = null;
let HAND_FILL: Path2D | null = null;
function handPaths(): [Path2D, Path2D] {
  HAND ??= new Path2D(
    'M22 14a8 8 0 0 1-8 8M18 11v-1a2 2 0 0 0-2-2a2 2 0 0 0-2 2M14 10V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1M10 9.5V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v10M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L6 15',
  );
  HAND_FILL ??= new Path2D('M6 14V4a2 2 0 0 1 4 0v5a2 2 0 0 1 4 0v1a2 2 0 0 1 4 0v1a2 2 0 0 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L6 14z');
  return [HAND, HAND_FILL];
}
function drawFinger(g: CanvasRenderingContext2D, x: number, y: number, down: boolean, mirror: boolean, hand = true): void {
  const R = 19;
  g.save();
  disc(g, x, y, down ? R * 0.84 : R, down ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.12)');
  ring(g, x, y, down ? R * 0.84 : R, down ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.45)', 1.5);
  disc(g, x, y, 2.2, '#ffffff');
  if (hand) {
    const [stroke, fill] = handPaths();
    g.translate(x, y);
    if (mirror) g.scale(-1, 1);
    g.scale(1.5, 1.5);
    g.translate(-8, down ? -1.2 : -3.2);
    g.shadowColor = 'rgba(0,0,0,0.5)';
    g.shadowBlur = 6;
    g.shadowOffsetY = down ? 1 : 4;
    g.fillStyle = 'rgba(22,27,50,0.86)';
    g.fill(fill);
    g.shadowColor = 'transparent';
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.lineWidth = 1.45;
    g.strokeStyle = '#ffffff';
    g.stroke(stroke);
  }
  g.restore();
}

/* ───────── 시연 대본 ───────── */
interface Finger {
  id: number;
  x: number;
  y: number;
  down: boolean;
}
/** [시각, x, y, 누름(1), 다음까지 직선(1)] */
type K = [number, number, number, 0 | 1, (0 | 1)?];
function path(u: number, keys: K[], id = 1): Finger {
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1]![0] <= u) i++;
  const a = keys[i]!;
  const b = keys[Math.min(i + 1, keys.length - 1)]!;
  const span = b[0] - a[0];
  const f = span > 0 ? clamp((u - a[0]) / span, 0, 1) : 0;
  const e = a[4] ? f : smooth(f);
  return { id, x: lerp(a[1], b[1], e), y: lerp(a[2], b[2], e), down: a[3] === 1 };
}

/* ───────── 틀 ───────── */
interface Verdict {
  text: string;
  color: string;
}
interface Sim {
  reset(loop: number): void;
  down(id: number, x: number, y: number): void;
  move(id: number, x: number, y: number): void;
  up(id: number, x: number, y: number): void;
  cancel(id: number): void;
  wheel?(x: number, y: number, dy: number, shift: boolean): void;
  step(dt: number): void;
  draw(g: CanvasRenderingContext2D): void;
  verdict(): Verdict;
  extra(): string[];
}
interface Env<P> {
  on(): boolean;
  now(): number;
  demo(): boolean;
  prm: P;
}
interface Spec<P> {
  caption: string;
  howto: string;
  onName: string;
  cycle: number;
  prm(): P;
  script(u: number, loop: number): Finger[];
  create(env: Env<P>): Sim;
  controls?(prm: P, reset: () => void): Control[];
  pinchEmu?: boolean;
}
interface Track {
  id: number;
  t0: number;
  x0: number;
  y0: number;
  maxD: number;
  dur: number;
  live: boolean;
}
interface Panel {
  sim: Sim;
  fixed: boolean | null;
  clock: number;
  dclock: number;
  loop: number;
  prev: Map<number, Finger>;
  shown: Finger[];
  ripples: { x: number; y: number; a: number }[];
  track: Track | null;
  rx: number;
  ry: number;
  rw: number;
  rh: number;
  s: number;
  ox: number;
  oy: number;
}

function wrap(g: CanvasRenderingContext2D, s: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of s.split('\n')) {
    const words = para.split(' ');
    let cur = '';
    for (const w of words) {
      const next = cur ? cur + ' ' + w : w;
      if (g.measureText(next).width > maxW && cur) {
        out.push(cur);
        cur = w;
      } else cur = next;
    }
    out.push(cur);
  }
  return out;
}
function chip(g: CanvasRenderingContext2D, x: number, y: number, s: string, color: string, size: number, align: 'left' | 'center' | 'right' = 'left'): number {
  g.font = `700 ${size}px ${FONT}`;
  const w = g.measureText(s).width + size * 1.3;
  const h = size * 1.75;
  const x0 = align === 'left' ? x : align === 'center' ? x - w / 2 : x - w;
  rr(g, x0, y, w, h, h / 2);
  g.fillStyle = 'rgba(9,12,28,0.88)';
  g.fill();
  g.fillStyle = rgba(color, 0.16);
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = rgba(color, 0.7);
  g.stroke();
  txt(g, s, x0 + w / 2, y + h / 2 + 0.5, size, color, 'center', 700);
  return w;
}

function runBoard<P>(box: HTMLElement, spec: Spec<P>): { update(t: number, dt: number): void; controls: Control[]; dispose(): void } {
  const prm = spec.prm();
  const st = { on: true };
  if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;user-select:none;-webkit-user-select:none;';
  box.appendChild(canvas);
  const g = canvas.getContext('2d')!;
  let cw = 1;
  let ch = 1;
  let dpr = 1;
  let big = false;
  let panels: Panel[] = [];
  let mode: 'demo' | 'user' = 'demo';
  let idle = 0;
  const users = new Map<number, { x: number; y: number; virt: boolean }>();
  let emu: { pid: number; px: number; py: number } | null = null;

  const mkPanel = (fixed: boolean | null): Panel => {
    const p = { fixed, clock: 0, dclock: 0, loop: 0, prev: new Map(), shown: [], ripples: [], track: null, rx: 0, ry: 0, rw: 1, rh: 1, s: 1, ox: 0, oy: 0 } as unknown as Panel;
    p.sim = spec.create({ on: () => p.fixed ?? st.on, now: () => p.clock, demo: () => !big || mode === 'demo', prm });
    p.sim.reset(0);
    return p;
  };
  const build = (): void => {
    panels = big ? [mkPanel(null)] : [mkPanel(false), mkPanel(true)];
    mode = 'demo';
    users.clear();
    emu = null;
  };
  const layout = (): void => {
    if (!big) {
      const pw = (cw - 18) / 2;
      panels.forEach((p, i) => {
        p.rx = 6 + i * (pw + 6);
        p.ry = 6;
        p.rw = pw;
        p.rh = ch - 12;
      });
    } else {
      const sb = clamp(cw * 0.28, 210, 290);
      const p = panels[0]!;
      p.rx = 12;
      p.ry = 12;
      p.rw = cw - sb - 36;
      p.rh = ch - 24;
    }
    for (const p of panels) {
      p.s = Math.min(p.rw / VW, p.rh / VH);
      p.ox = p.rx + (p.rw - VW * p.s) / 2;
      p.oy = p.ry + (p.rh - VH * p.s) / 2;
    }
  };
  const fit = (): void => {
    cw = Math.max(1, box.clientWidth);
    ch = Math.max(1, box.clientHeight);
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    const nb = cw > 500;
    if (nb !== big || panels.length === 0) {
      big = nb;
      build();
    }
    layout();
    canvas.style.touchAction = big ? 'none' : 'auto';
    canvas.style.cursor = big ? 'pointer' : 'default';
  };
  fit();
  const ro = new ResizeObserver(() => fit());
  ro.observe(box);

  const send = (p: Panel, kind: 'down' | 'move' | 'up' | 'cancel', id: number, x: number, y: number): void => {
    const tr = p.track;
    if (kind === 'down') {
      p.sim.down(id, x, y);
      p.ripples.push({ x, y, a: 0 });
      if (!tr || !tr.live) p.track = { id, t0: p.clock, x0: x, y0: y, maxD: 0, dur: 0, live: true };
    } else if (kind === 'move') {
      p.sim.move(id, x, y);
      if (tr && tr.live && tr.id === id) tr.maxD = Math.max(tr.maxD, dist(x, y, tr.x0, tr.y0));
    } else {
      if (kind === 'up') p.sim.up(id, x, y);
      else p.sim.cancel(id);
      if (tr && tr.live && tr.id === id) {
        tr.live = false;
        tr.dur = p.clock - tr.t0;
      }
    }
  };
  const dropDemo = (p: Panel): void => {
    for (const f of p.prev.values()) if (f.down) send(p, 'cancel', f.id, f.x, f.y);
    p.prev.clear();
    p.shown = [];
  };
  const restart = (p: Panel): void => {
    dropDemo(p);
    p.dclock = 0;
    p.track = null;
    p.ripples = [];
    p.sim.reset(p.loop);
  };
  const runDemo = (p: Panel, dt: number): void => {
    p.dclock += dt;
    if (p.dclock >= spec.cycle) {
      dropDemo(p);
      p.dclock -= spec.cycle;
      p.loop++;
      p.track = null;
      p.sim.reset(p.loop);
    }
    const fs = spec.script(p.dclock, p.loop);
    for (const f of fs) {
      const q = p.prev.get(f.id);
      if (f.down && !q?.down) send(p, 'down', f.id, f.x, f.y);
      else if (f.down && q?.down) {
        if (q.x !== f.x || q.y !== f.y) send(p, 'move', f.id, f.x, f.y);
      } else if (!f.down && q?.down) send(p, 'up', f.id, f.x, f.y);
      p.prev.set(f.id, { ...f });
    }
    p.shown = fs;
  };

  /* 직접 해 보기 */
  const toStage = (e: PointerEvent | WheelEvent, p: Panel): V2 => {
    const b = canvas.getBoundingClientRect();
    return { x: (e.clientX - b.left - p.ox) / p.s, y: (e.clientY - b.top - p.oy) / p.s };
  };
  const takeOver = (): void => {
    idle = 0;
    if (mode === 'demo') {
      const p = panels[0]!;
      dropDemo(p);
      p.loop = 0;
      p.track = null;
      p.ripples = [];
      p.sim.reset(0);
      mode = 'user';
    }
  };
  const onDown = (e: PointerEvent): void => {
    if (!big || e.button > 0) return;
    e.preventDefault();
    takeOver();
    const p = panels[0]!;
    const q = toStage(e, p);
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* 무시 */
    }
    users.set(e.pointerId, { x: q.x, y: q.y, virt: false });
    send(p, 'down', e.pointerId, q.x, q.y);
    if (spec.pinchEmu && e.shiftKey && !emu) {
      emu = { pid: e.pointerId, px: q.x - 55, py: q.y + 10 };
      const vx = 2 * emu.px - q.x;
      const vy = 2 * emu.py - q.y;
      users.set(EMU_ID, { x: vx, y: vy, virt: true });
      send(p, 'down', EMU_ID, vx, vy);
    }
  };
  const onMove = (e: PointerEvent): void => {
    if (!big || !users.has(e.pointerId)) return;
    e.preventDefault();
    idle = 0;
    const p = panels[0]!;
    const q = toStage(e, p);
    users.set(e.pointerId, { x: q.x, y: q.y, virt: false });
    send(p, 'move', e.pointerId, q.x, q.y);
    if (emu && emu.pid === e.pointerId) {
      const vx = 2 * emu.px - q.x;
      const vy = 2 * emu.py - q.y;
      users.set(EMU_ID, { x: vx, y: vy, virt: true });
      send(p, 'move', EMU_ID, vx, vy);
    }
  };
  const finish = (e: PointerEvent, kind: 'up' | 'cancel'): void => {
    if (!users.has(e.pointerId)) return;
    const p = panels[0]!;
    const q = toStage(e, p);
    send(p, kind, e.pointerId, q.x, q.y);
    users.delete(e.pointerId);
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* 무시 */
    }
    if (emu && emu.pid === e.pointerId) {
      const u = users.get(EMU_ID);
      if (u) send(p, kind, EMU_ID, u.x, u.y);
      users.delete(EMU_ID);
      emu = null;
    }
    idle = 0;
  };
  const onUp = (e: PointerEvent): void => finish(e, 'up');
  const onCancel = (e: PointerEvent): void => finish(e, 'cancel');
  const onWheel = (e: WheelEvent): void => {
    const p = panels[0];
    if (!big || !p || !p.sim.wheel) return;
    e.preventDefault();
    takeOver();
    const q = toStage(e, p);
    p.sim.wheel(q.x, q.y, e.deltaY, e.shiftKey);
  };
  const onCtx = (e: Event): void => {
    if (big) e.preventDefault();
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onCtx);

  /* 그리기 */
  const drawPanel = (p: Panel): void => {
    const on = p.fixed ?? st.on;
    const rad = big ? 14 : 9;
    g.save();
    rr(g, p.rx, p.ry, p.rw, p.rh, rad);
    const gr = g.createLinearGradient(0, p.ry, 0, p.ry + p.rh);
    gr.addColorStop(0, '#161d3a');
    gr.addColorStop(1, '#0d1228');
    g.fillStyle = gr;
    g.fill();
    g.lineWidth = 1;
    g.strokeStyle = on ? rgba(COL.on, 0.28) : rgba(COL.off, 0.22);
    g.stroke();
    g.clip();
    // 은은한 점 무늬
    g.fillStyle = 'rgba(160,180,255,0.05)';
    const stepD = big ? 22 : 14;
    for (let y = p.ry + 8; y < p.ry + p.rh; y += stepD) for (let x = p.rx + 8; x < p.rx + p.rw; x += stepD) g.fillRect(x, y, 1.2, 1.2);
    g.translate(p.ox, p.oy);
    g.scale(p.s, p.s);
    p.sim.draw(g);
    for (const r of p.ripples) {
      const f = r.a / 0.5;
      ring(g, r.x, r.y, 10 + f * 26, `rgba(255,255,255,${0.5 * (1 - f)})`, 2);
    }
    if (!big || mode === 'demo') {
      p.shown.forEach((f, i) => drawFinger(g, f.x, f.y, f.down, i === 1));
    } else {
      for (const u of users.values()) {
        disc(g, u.x, u.y, 18, u.virt ? 'rgba(169,139,255,0.16)' : 'rgba(255,255,255,0.16)');
        ring(g, u.x, u.y, 18, u.virt ? rgba(COL.violet, 0.9) : 'rgba(255,255,255,0.85)', 1.5, u.virt ? [4, 3] : []);
        disc(g, u.x, u.y, 2.2, '#fff');
        if (u.virt) txt(g, '가상 손가락', u.x, u.y + 30, 10, COL.violet);
      }
    }
    g.restore();
    // 머리표 (화면 픽셀)
    const fs = big ? 12 : 9;
    chip(g, p.rx + (big ? 12 : 6), p.ry + (big ? 12 : 6), big ? (on ? `켬 · ${spec.onName}` : '끔 · 그냥 처리') : on ? '켬' : '끔', on ? COL.on : COL.off, fs);
    const v = p.sim.verdict();
    chip(g, p.rx + p.rw / 2, p.ry + p.rh - fs * 1.75 - (big ? 12 : 5), v.text, v.color, fs, 'center');
    if (!big) {
      const tr = p.track;
      if (tr) {
        const d = tr.live ? p.clock - tr.t0 : tr.dur;
        txt(g, `${d.toFixed(2)}초 · ${Math.round(tr.maxD)}px`, p.rx + p.rw - 6, p.ry + 13, 8.5, COL.dim, 'right', 600);
      }
    }
  };
  const drawSide = (p: Panel): void => {
    const x0 = p.rx + p.rw + 12;
    const w = cw - x0 - 12;
    const y0 = 12;
    const h = ch - 24;
    rr(g, x0, y0, w, h, 14);
    g.fillStyle = 'rgba(14,19,40,0.92)';
    g.fill();
    g.lineWidth = 1;
    g.strokeStyle = COL.panelLine;
    g.stroke();
    const px = x0 + 16;
    let y = y0 + 24;
    txt(g, '판정 정보', px, y, 13, COL.text, 'left', 800);
    // 실시간 점
    const live = !!p.track?.live;
    disc(g, x0 + w - 20, y, 4, live ? COL.on : 'rgba(140,150,190,0.4)');
    y += 26;
    const tr = p.track;
    const rows: [string, string, string][] = [
      ['누른 시간', tr ? `${(tr.live ? p.clock - tr.t0 : tr.dur).toFixed(2)}초` : '—', COL.text],
      ['움직인 거리', tr ? `${Math.round(tr.maxD)}px` : '—', COL.text],
    ];
    const v = p.sim.verdict();
    for (const [k, val, c] of rows) {
      txt(g, k, px, y, 12, COL.dim, 'left', 600);
      txt(g, val, x0 + w - 16, y, 13, c, 'right', 700);
      y += 22;
    }
    txt(g, '판정', px, y, 12, COL.dim, 'left', 600);
    y += 20;
    g.font = `800 14px ${FONT}`;
    for (const l of wrap(g, v.text, w - 32)) {
      txt(g, l, px, y, 14, v.color, 'left', 800);
      y += 19;
    }
    y += 6;
    line(g, px, y, x0 + w - 16, y, 'rgba(160,180,255,0.14)', 1);
    y += 16;
    g.font = `600 11.5px ${FONT}`;
    for (const e of p.sim.extra()) {
      for (const l of wrap(g, e, w - 32)) {
        txt(g, l, px, y, 11.5, '#b9c3e6', 'left', 600);
        y += 17;
      }
      y += 3;
    }
    // 아래: 하는 법
    g.font = `600 11.5px ${FONT}`;
    const how = wrap(g, spec.howto, w - 32);
    let yb = y0 + h - 16 - how.length * 17 - 30;
    yb = Math.max(yb, y + 8);
    line(g, px, yb, x0 + w - 16, yb, 'rgba(160,180,255,0.14)', 1);
    yb += 16;
    const md = mode === 'demo' ? '자동 시연 중 · 눌러서 직접 해 보기' : '직접 해 보는 중';
    txt(g, md, px, yb, 11.5, mode === 'demo' ? COL.warn : COL.on, 'left', 700);
    yb += 20;
    for (const l of how) {
      txt(g, l, px, yb, 11.5, COL.dim, 'left', 600);
      yb += 17;
    }
  };
  const draw = (): void => {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    const bg = g.createLinearGradient(0, 0, 0, ch);
    bg.addColorStop(0, COL.bg0);
    bg.addColorStop(1, COL.bg1);
    g.fillStyle = bg;
    g.fillRect(0, 0, cw, ch);
    for (const p of panels) drawPanel(p);
    if (big && panels[0]) drawSide(panels[0]);
  };

  const resetAll = (): void => {
    mode = 'demo';
    users.clear();
    emu = null;
    for (const p of panels) {
      p.loop = 0;
      restart(p);
    }
  };
  const controls: Control[] = [
    {
      type: 'toggle',
      label: `켬 — ${spec.onName}`,
      value: true,
      on: (v) => {
        st.on = v;
        for (const p of panels) restart(p);
      },
    },
    ...(spec.controls ? spec.controls(prm, () => panels.forEach((p) => restart(p))) : []),
    { type: 'button', label: '처음부터 다시', on: resetAll },
  ];

  return {
    update(_t: number, dt0: number): void {
      const dt = clamp(dt0, 0, 0.05);
      if (big && mode === 'user') {
        idle += dt;
        if (idle > 8 && users.size === 0) resetAll();
      }
      for (const p of panels) {
        p.clock += dt;
        if (!big || mode === 'demo') runDemo(p, dt);
        else p.shown = [];
        p.sim.step(dt);
        for (const r of p.ripples) r.a += dt;
        p.ripples = p.ripples.filter((r) => r.a < 0.5);
      }
      draw();
    },
    controls,
    dispose(): void {
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onCtx);
      users.clear();
      canvas.remove();
    },
  };
}

function demo<P>(spec: Spec<P>): DemoDom {
  return { kind: 'dom', caption: spec.caption, make: (box: HTMLElement) => runBoard(box, spec) };
}

/* ═════════ i418 손가락 크기 누름 영역 ═════════ */
interface P418 {
  pad: number;
  rings: boolean;
}
const B418: V2[] = [];
for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) B418.push({ x: 60 + c * 60, y: 72 + r * 50 });
const i418 = demo<P418>({
  caption: '작은 단추 사이를 눌러도 — 끔: 놓침 ✕ · 켬: 넓힌 누름 영역(점선)에서 가장 가까운 단추가 잡힘',
  howto: '작은 단추 둘레(점선 테두리 안)를 눌러 보세요. 끄면 단추 그림 안을 정확히 눌러야만 잡힙니다.',
  onName: '넓힌 누름 영역',
  cycle: 4.4,
  prm: () => ({ pad: 14, rings: true }),
  script: (u) =>
    [
      path(u, [
        [0, 210, 318, 0],
        [0.45, 133, 129, 0],
        [0.7, 133, 129, 1],
        [0.9, 133, 129, 0],
        [1.55, 176, 238, 0],
        [1.8, 176, 238, 1],
        [2.0, 176, 238, 0],
        [2.65, 257, 64, 0],
        [2.9, 257, 64, 1],
        [3.1, 257, 64, 0],
        [4.4, 210, 318, 0],
      ]),
    ],
  create: (env) => {
    const R = 11;
    let sel = new Set<number>();
    let pulse: { i: number; a: number }[] = [];
    let miss: { x: number; y: number; a: number }[] = [];
    let link: { x: number; y: number; i: number; a: number } | null = null;
    let pressed = -1;
    let pid = -1;
    let v: Verdict = { text: '단추를 눌러 보세요', color: COL.dim };
    let ex: string[] = [];
    const reach = (): number => (env.on() ? R + env.prm.pad : R);
    const pick = (x: number, y: number): { i: number; d: number } => {
      let best = -1;
      let bd = 1e9;
      B418.forEach((b, i) => {
        const d = dist(x, y, b.x, b.y);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      return { i: bd <= reach() ? best : -1, d: bd };
    };
    return {
      reset() {
        sel = new Set();
        pulse = [];
        miss = [];
        link = null;
        pressed = -1;
        pid = -1;
        v = { text: '단추를 눌러 보세요', color: COL.dim };
        ex = [];
      },
      down(id, x, y) {
        if (pid !== -1) return;
        pid = id;
        const r = pick(x, y);
        pressed = r.i;
        ex = [`가장 가까운 단추 가운데까지 ${Math.round(r.d)}px`, `보이는 단추 반지름 ${R}px → 누름 영역 반지름 ${reach()}px`];
      },
      move() {},
      up(id, x, y) {
        if (id !== pid) return;
        pid = -1;
        if (pressed >= 0) {
          if (sel.has(pressed)) sel.delete(pressed);
          else sel.add(pressed);
          pulse.push({ i: pressed, a: 0 });
          link = { x, y, i: pressed, a: 0 };
          v = { text: `잡음 · ${pressed + 1}번 단추`, color: COL.on };
        } else {
          miss.push({ x, y, a: 0 });
          v = { text: '놓침 — 단추 밖', color: COL.off };
        }
        pressed = -1;
      },
      cancel(id) {
        if (id === pid) {
          pid = -1;
          pressed = -1;
        }
      },
      step(dt) {
        for (const p of pulse) p.a += dt;
        pulse = pulse.filter((p) => p.a < 0.6);
        for (const m of miss) m.a += dt;
        miss = miss.filter((m) => m.a < 1.4);
        if (link) {
          link.a += dt;
          if (link.a > 1.2) link = null;
        }
      },
      draw(g) {
        board(g, 26, 40, 248, 262);
        const on = env.on();
        B418.forEach((b, i) => {
          if (on && env.prm.rings && env.prm.pad > 0) {
            disc(g, b.x, b.y, R + env.prm.pad, rgba(COL.on, i === pressed ? 0.16 : 0.045));
            ring(g, b.x, b.y, R + env.prm.pad, rgba(COL.on, i === pressed ? 0.95 : 0.32), i === pressed ? 1.6 : 1, [3, 3]);
          }
          const isSel = sel.has(i);
          const rr0 = i === pressed ? R * 0.86 : R;
          g.save();
          if (isSel) {
            g.shadowColor = rgba(COL.gold, 0.8);
            g.shadowBlur = 12;
          }
          const gr = g.createRadialGradient(b.x - 3, b.y - 4, 1, b.x, b.y, rr0);
          if (isSel) {
            gr.addColorStop(0, '#fff3c4');
            gr.addColorStop(1, '#e8a93a');
          } else {
            gr.addColorStop(0, '#5a6796');
            gr.addColorStop(1, '#2a3359');
          }
          disc(g, b.x, b.y, rr0, gr as unknown as string);
          g.restore();
          ring(g, b.x, b.y, rr0, isSel ? 'rgba(255,240,200,0.9)' : 'rgba(170,190,255,0.45)', 1);
        });
        for (const p of pulse) {
          const b = B418[p.i]!;
          const f = p.a / 0.6;
          ring(g, b.x, b.y, R + 4 + f * 18, rgba(COL.gold, 0.8 * (1 - f)), 2.2);
        }
        if (link) {
          const b = B418[link.i]!;
          const al = 1 - link.a / 1.2;
          line(g, link.x, link.y, b.x, b.y, rgba(COL.on, al), 2, [4, 3]);
          disc(g, link.x, link.y, 3, rgba(COL.on, al));
        }
        for (const m of miss) {
          const al = 1 - m.a / 1.4;
          const sc = 1 + Math.max(0, 0.25 - m.a) * 2;
          ring(g, m.x, m.y, 12 * sc, rgba(COL.off, al * 0.7), 1.5);
          cross(g, m.x, m.y, 6 * sc, rgba(COL.off, al), 3);
        }
      },
      verdict: () => v,
      extra: () => [...ex, env.on() ? '여러 단추가 가까우면 가장 가까운 것 하나만' : '단추 그림 안만 정확히 맞아야 함'],
    };
  },
  controls: (p) => [
    { type: 'range', label: '누름 영역 넓히기 (px)', min: 0, max: 30, step: 1, value: p.pad, on: (v) => (p.pad = v) },
    { type: 'toggle', label: '누름 영역 테두리 보이기', value: p.rings, on: (v) => (p.rings = v) },
  ],
});

/* ═════════ i419 끌기 축 잠금 ═════════ */
interface P419 {
  lock: number;
}
const i419 = demo<P419>({
  caption: '오른쪽으로 끄는데 손이 아래로 휨 — 끔: 블록이 비스듬히 다른 줄로 · 켬: 처음 움직인 쪽(가로)으로 잠금',
  howto: '주황 블록을 잡고 옆으로 끌어 보세요. 일부러 비스듬히 끌어도 켜면 처음 정한 축으로만 움직입니다.',
  onName: '처음 움직인 축으로 잠금',
  cycle: 3.6,
  prm: () => ({ lock: 8 }),
  script: (u) => [
    path(u, [
      [0, 120, 300, 0],
      [0.3, 60, 152, 0],
      [0.5, 60, 152, 1],
      [0.85, 112, 160, 1],
      [1.35, 186, 178, 1],
      [1.75, 243, 192, 1],
      [1.95, 243, 192, 0],
      [3.6, 120, 300, 0],
    ]),
  ],
  create: (env) => {
    const GX = 30;
    const GY = 60;
    const CS = 60;
    const N = 4;
    const cx = (c: number): number => GX + CS / 2 + c * CS;
    const cy = (r: number): number => GY + CS / 2 + r * CS;
    let b = { x: cx(0), y: cy(1) };
    let vel = { x: 0, y: 0 };
    let target: V2 | null = null;
    let drag: { id: number; sx: number; sy: number; bx0: number; by0: number; axis: 'x' | 'y' | null; fdx: number; fdy: number } | null = null;
    let trail: V2[] = [];
    let startRow = 1;
    let startCol = 0;
    let v: Verdict = { text: '블록을 옆으로 끌어요', color: COL.dim };
    let ex: string[] = [];
    const lim = (vv: number, lo: number, hi: number): number => clamp(vv, lo, hi);
    return {
      reset() {
        b = { x: cx(0), y: cy(1) };
        vel = { x: 0, y: 0 };
        target = null;
        drag = null;
        trail = [];
        v = { text: '블록을 옆으로 끌어요', color: COL.dim };
        ex = [];
      },
      down(id, x, y) {
        if (drag) return;
        if (Math.abs(x - b.x) < 34 && Math.abs(y - b.y) < 34) {
          drag = { id, sx: x, sy: y, bx0: b.x, by0: b.y, axis: null, fdx: 0, fdy: 0 };
          startRow = Math.round((b.y - cy(0)) / CS);
          startCol = Math.round((b.x - cx(0)) / CS);
          target = null;
          trail = [{ x, y }];
          v = { text: '끄는 중…', color: COL.blue };
        } else v = { text: '블록을 잡아야 해요', color: COL.warn };
      },
      move(id, x, y) {
        if (!drag || drag.id !== id) return;
        trail.push({ x, y });
        if (trail.length > 80) trail.shift();
        const dx = x - drag.sx;
        const dy = y - drag.sy;
        let nx: number;
        let ny: number;
        if (env.on()) {
          if (!drag.axis && Math.hypot(dx, dy) > env.prm.lock) {
            drag.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
            drag.fdx = dx;
            drag.fdy = dy;
          }
          nx = drag.axis === 'x' ? drag.bx0 + dx : drag.bx0;
          ny = drag.axis === 'y' ? drag.by0 + dy : drag.by0;
        } else {
          nx = drag.bx0 + dx;
          ny = drag.by0 + dy;
          if (!drag.fdx && !drag.fdy && Math.hypot(dx, dy) > 8) {
            drag.fdx = dx;
            drag.fdy = dy;
          }
        }
        b = { x: lim(nx, cx(0), cx(N - 1)), y: lim(ny, cy(0), cy(N - 1)) };
      },
      up(id) {
        if (!drag || drag.id !== id) return;
        const col = clamp(Math.round((b.x - cx(0)) / CS), 0, N - 1);
        const row = clamp(Math.round((b.y - cy(0)) / CS), 0, N - 1);
        target = { x: cx(col), y: cy(row) };
        const ax = drag.axis;
        if (row !== startRow && col !== startCol) v = { text: '엇나감 — 다른 줄로', color: COL.off };
        else if (row === startRow && col === startCol) v = { text: '제자리', color: COL.dim };
        else v = { text: ax ? `${ax === 'x' ? '가로' : '세로'} 줄 그대로 착` : '줄 그대로 착', color: COL.on };
        ex = [`처음 움직임 dx ${Math.round(drag.fdx)} · dy ${Math.round(drag.fdy)}`, env.on() ? `정한 축: ${ax === 'x' ? '가로 →' : ax === 'y' ? '세로 ↓' : '아직 (문턱 전)'}` : '축 없음 — dx · dy 둘 다 따라감'];
        drag = null;
      },
      cancel(id) {
        if (drag && drag.id === id) {
          target = { x: drag.bx0, y: drag.by0 };
          drag = null;
        }
      },
      step(dt) {
        if (drag) {
          const dx = (trail[trail.length - 1]?.x ?? drag.sx) - drag.sx;
          const dy = (trail[trail.length - 1]?.y ?? drag.sy) - drag.sy;
          ex = [
            `움직임 dx ${Math.round(dx)} · dy ${Math.round(dy)}`,
            env.on() ? (drag.axis ? `축 잠금: ${drag.axis === 'x' ? '가로 →' : '세로 ↓'} (문턱 ${env.prm.lock}px 넘음)` : `축 정하는 중 — ${env.prm.lock}px 움직이면`) : '축 없음 — 손 가는 대로',
          ];
        }
        if (target && !drag) {
          const k = 260;
          const c = 2 * Math.sqrt(k) * 0.72;
          vel.x += (k * (target.x - b.x) - c * vel.x) * dt;
          vel.y += (k * (target.y - b.y) - c * vel.y) * dt;
          b = { x: b.x + vel.x * dt, y: b.y + vel.y * dt };
          if (Math.hypot(target.x - b.x, target.y - b.y) < 0.3 && Math.hypot(vel.x, vel.y) < 2) {
            b = { ...target };
            target = null;
            vel = { x: 0, y: 0 };
          }
        }
      },
      draw(g) {
        board(g, GX - 8, GY - 8, CS * N + 16, CS * N + 16);
        for (let r = 0; r < N; r++)
          for (let c = 0; c < N; c++) {
            rr(g, GX + c * CS + 3, GY + r * CS + 3, CS - 6, CS - 6, 8);
            g.fillStyle = (r + c) % 2 ? 'rgba(120,140,220,0.07)' : 'rgba(120,140,220,0.12)';
            g.fill();
          }
        const on = env.on();
        // 잠긴 축 띠
        if (on && drag?.axis) {
          if (drag.axis === 'x') {
            rr(g, GX + 2, drag.by0 - CS / 2 + 4, CS * N - 4, CS - 8, 10);
            g.fillStyle = rgba(COL.on, 0.1);
            g.fill();
            line(g, GX + 8, drag.by0, GX + CS * N - 8, drag.by0, rgba(COL.on, 0.8), 1.6, [6, 5]);
          } else {
            rr(g, drag.bx0 - CS / 2 + 4, GY + 2, CS - 8, CS * N - 4, 10);
            g.fillStyle = rgba(COL.on, 0.1);
            g.fill();
            line(g, drag.bx0, GY + 8, drag.bx0, GY + CS * N - 8, rgba(COL.on, 0.8), 1.6, [6, 5]);
          }
        }
        if (on && drag && !drag.axis) ring(g, drag.sx, drag.sy, env.prm.lock, rgba(COL.on, 0.8), 1.2, [3, 3]);
        // 손 자취
        if (trail.length > 1) {
          g.beginPath();
          trail.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
          g.setLineDash([2, 4]);
          g.lineWidth = 2;
          g.strokeStyle = 'rgba(255,255,255,0.45)';
          g.stroke();
          g.setLineDash([]);
        }
        // 블록
        const rowC = cy(Math.round((b.y - cy(0)) / CS));
        const off = b.y - (drag ? drag.by0 : rowC);
        const bad = !on && drag && Math.abs(off) > 6;
        const tilt = bad ? clamp(off / 60, -1, 1) * 0.28 : 0;
        g.save();
        g.translate(b.x, b.y);
        g.rotate(tilt);
        const S = 50;
        g.shadowColor = 'rgba(0,0,0,0.5)';
        g.shadowBlur = drag ? 16 : 8;
        g.shadowOffsetY = drag ? 8 : 4;
        rr(g, -S / 2, -S / 2, S, S, 10);
        const gr = g.createLinearGradient(0, -S / 2, 0, S / 2);
        gr.addColorStop(0, '#ffb35c');
        gr.addColorStop(1, '#e46a2e');
        g.fillStyle = gr;
        g.fill();
        g.shadowColor = 'transparent';
        rr(g, -S / 2 + 4, -S / 2 + 3, S - 8, S / 2 - 4, 7);
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.fill();
        rr(g, -S / 2, -S / 2, S, S, 10);
        g.lineWidth = bad ? 2.5 : 1.2;
        g.strokeStyle = bad ? COL.off : 'rgba(255,230,200,0.8)';
        g.stroke();
        // 양쪽 화살 무늬
        const ac = 'rgba(90,40,10,0.75)';
        arrow(g, -4, 0, -16, 0, ac, 2.4);
        arrow(g, 4, 0, 16, 0, ac, 2.4);
        g.restore();
        if (bad) txt(g, '비스듬히!', b.x, b.y - 40, 11, COL.off, 'center', 800);
        if (on && drag?.axis) txt(g, drag.axis === 'x' ? '가로 잠금 →' : '세로 잠금 ↓', b.x, b.y - 40, 11, COL.on, 'center', 800);
        if (target) {
          rr(g, target.x - 27, target.y - 27, 54, 54, 11);
          g.setLineDash([4, 3]);
          g.lineWidth = 1.4;
          g.strokeStyle = 'rgba(255,255,255,0.4)';
          g.stroke();
          g.setLineDash([]);
        }
      },
      verdict: () => v,
      extra: () => ex,
    };
  },
  controls: (p) => [{ type: 'range', label: '축을 정하는 문턱 (px)', min: 2, max: 30, step: 1, value: p.lock, on: (v) => (p.lock = v) }],
});

/* ═════════ i420 착 붙기 · 관성 ═════════ */
interface P420 {
  fr: number;
  k: number;
}
const SX = [70, 150, 230];
const SY = [90, 170, 250];
const i420 = demo<P420>({
  caption: '카드를 툭 던지면 — 끔: 놓은 자리에 그냥 멈춤 · 켬: 속도대로 미끄러지다 가까운 칸에 스프링으로 착',
  howto: '카드를 잡고 빠르게 던지듯 놓아 보세요. 마찰이 작을수록 멀리 미끄러지고, 점선 칸은 미리 계산한 도착 자리입니다.',
  onName: '관성 + 칸에 착',
  cycle: 3.2,
  prm: () => ({ fr: 4, k: 170 }),
  script: (u, loop) => {
    const f = path(u, [
      [0, 200, 318, 0],
      [0.35, 70, 92, 0],
      [0.5, 70, 92, 1],
      [0.62, 78, 100, 1, 1],
      [0.74, 124, 150, 0],
      [1.5, 190, 318, 0],
      [3.2, 200, 318, 0],
    ]);
    if (loop % 2) {
      f.x = 300 - f.x;
      f.y = 340 - f.y;
    }
    return [f];
  },
  create: (env) => {
    let pos: V2 = { x: SX[0]!, y: SY[0]! };
    let vel: V2 = { x: 0, y: 0 };
    let phase: 'rest' | 'drag' | 'glide' | 'spring' = 'rest';
    let target: V2 | null = null;
    let grab: { id: number; ox: number; oy: number } | null = null;
    let samples: { x: number; y: number; t: number }[] = [];
    let trail: V2[] = [];
    let rel: { x: number; y: number; vx: number; vy: number; a: number } | null = null;
    let v: Verdict = { text: '카드를 던져 보세요', color: COL.dim };
    let ex: string[] = [];
    const nearest = (p: V2): V2 => {
      let best: V2 = { x: SX[0]!, y: SY[0]! };
      let bd = 1e9;
      for (const x of SX)
        for (const y of SY) {
          const d = dist(p.x, p.y, x, y);
          if (d < bd) {
            bd = d;
            best = { x, y };
          }
        }
      return best;
    };
    const slotName = (p: V2): string => `${SY.indexOf(p.y) + 1}줄 ${SX.indexOf(p.x) + 1}칸`;
    return {
      reset(loop) {
        pos = loop % 2 ? { x: SX[2]!, y: SY[2]! } : { x: SX[0]!, y: SY[0]! };
        vel = { x: 0, y: 0 };
        phase = 'rest';
        target = null;
        grab = null;
        samples = [];
        trail = [];
        rel = null;
        v = { text: '카드를 던져 보세요', color: COL.dim };
        ex = [];
      },
      down(id, x, y) {
        if (grab) return;
        if (Math.abs(x - pos.x) < 36 && Math.abs(y - pos.y) < 42) {
          grab = { id, ox: pos.x - x, oy: pos.y - y };
          phase = 'drag';
          target = null;
          vel = { x: 0, y: 0 };
          samples = [{ x, y, t: env.now() }];
          v = { text: '잡음', color: COL.blue };
        }
      },
      move(id, x, y) {
        if (!grab || grab.id !== id) return;
        pos = { x: x + grab.ox, y: y + grab.oy };
        const t = env.now();
        samples.push({ x, y, t });
        while (samples.length > 2 && t - samples[0]!.t > 0.09) samples.shift();
      },
      up(id) {
        if (!grab || grab.id !== id) return;
        grab = null;
        let vx = 0;
        let vy = 0;
        const a = samples[0];
        const b = samples[samples.length - 1];
        if (a && b && b.t - a.t > 0.005 && env.now() - b.t < 0.08) {
          vx = (b.x - a.x) / (b.t - a.t);
          vy = (b.y - a.y) / (b.t - a.t);
        }
        const raw = Math.hypot(vx, vy);
        if (raw > 1300) {
          vx *= 1300 / raw;
          vy *= 1300 / raw;
        }
        const sp = Math.hypot(vx, vy);
        rel = { x: pos.x, y: pos.y, vx, vy, a: 0 };
        if (env.on()) {
          const fr = env.prm.fr;
          const proj = { x: pos.x + vx / fr, y: pos.y + vy / fr };
          target = nearest(proj);
          vel = { x: vx, y: vy };
          phase = sp > 140 ? 'glide' : 'spring';
          v = { text: `${slotName(target)}에 착`, color: COL.on };
          ex = [`놓을 때 속도 ${Math.round(sp)}px/초`, `미끄러질 거리 ≈ 속도 ÷ 마찰 = ${Math.round(sp / fr)}px`, '예상 도착점에서 가장 가까운 칸으로'];
        } else {
          phase = 'rest';
          vel = { x: 0, y: 0 };
          const n = nearest(pos);
          const d = dist(pos.x, pos.y, n.x, n.y);
          v = d < 8 ? { text: '칸에 놓임', color: COL.on } : { text: '칸 사이에 멈춤', color: COL.off };
          ex = [`놓을 때 속도 ${Math.round(sp)}px/초 — 버림`, `가장 가까운 칸에서 ${Math.round(d)}px 어긋남`];
        }
      },
      cancel(id) {
        if (grab && grab.id === id) {
          grab = null;
          target = nearest(pos);
          phase = 'spring';
        }
      },
      step(dt) {
        if (rel) {
          rel.a += dt;
          if (rel.a > 1.1) rel = null;
        }
        if (phase === 'glide') {
          const k = Math.exp(-env.prm.fr * dt);
          vel = { x: vel.x * k, y: vel.y * k };
          pos = { x: pos.x + vel.x * dt, y: pos.y + vel.y * dt };
          // 판 벽에 닿으면 살짝 튕김
          if (pos.x < 44 || pos.x > 256) {
            pos.x = clamp(pos.x, 44, 256);
            vel.x *= -0.4;
          }
          if (pos.y < 72 || pos.y > 268) {
            pos.y = clamp(pos.y, 72, 268);
            vel.y *= -0.4;
          }
          if (Math.hypot(vel.x, vel.y) < 140) phase = 'spring';
        } else if (phase === 'spring' && target) {
          const k = env.prm.k;
          const c = 2 * Math.sqrt(k) * 0.55;
          vel.x += (k * (target.x - pos.x) - c * vel.x) * dt;
          vel.y += (k * (target.y - pos.y) - c * vel.y) * dt;
          pos = { x: pos.x + vel.x * dt, y: pos.y + vel.y * dt };
          if (dist(pos.x, pos.y, target.x, target.y) < 0.3 && Math.hypot(vel.x, vel.y) < 3) {
            pos = { ...target };
            phase = 'rest';
          }
        }
        if (phase !== 'rest') trail.push({ ...pos });
        else if (trail.length) trail.shift();
        while (trail.length > 16) trail.shift();
      },
      draw(g) {
        board(g, 22, 40, 256, 262);
        SY.forEach((y) =>
          SX.forEach((x) => {
            rr(g, x - 30, y - 36, 60, 72, 9);
            g.fillStyle = 'rgba(120,140,220,0.07)';
            g.fill();
            g.setLineDash([4, 4]);
            g.lineWidth = 1;
            g.strokeStyle = 'rgba(160,180,255,0.28)';
            g.stroke();
            g.setLineDash([]);
          }),
        );
        if (target && env.on() && phase !== 'rest') {
          g.save();
          g.shadowColor = rgba(COL.on, 0.9);
          g.shadowBlur = 12;
          rr(g, target.x - 30, target.y - 36, 60, 72, 9);
          g.lineWidth = 2;
          g.strokeStyle = COL.on;
          g.setLineDash([6, 4]);
          g.stroke();
          g.restore();
        }
        // 잔상
        trail.forEach((p, i) => {
          const al = (i / trail.length) * 0.22;
          rr(g, p.x - 26, p.y - 32, 52, 64, 8);
          g.fillStyle = `rgba(255,236,200,${al})`;
          g.fill();
        });
        if (rel) {
          const al = 1 - rel.a / 1.1;
          arrow(g, rel.x, rel.y, rel.x + rel.vx * 0.16, rel.y + rel.vy * 0.16, rgba(COL.warn, al), 2.4);
        }
        // 카드
        const lift = phase === 'drag' ? 1.07 : 1;
        g.save();
        g.translate(pos.x, pos.y);
        g.rotate(clamp(vel.x * 0.00025, -0.12, 0.12));
        g.scale(lift, lift);
        g.shadowColor = 'rgba(0,0,0,0.55)';
        g.shadowBlur = phase === 'drag' ? 18 : 8;
        g.shadowOffsetY = phase === 'drag' ? 10 : 3;
        rr(g, -26, -32, 52, 64, 8);
        const gr = g.createLinearGradient(0, -32, 0, 32);
        gr.addColorStop(0, '#fffaf0');
        gr.addColorStop(1, '#ecdcc0');
        g.fillStyle = gr;
        g.fill();
        g.shadowColor = 'transparent';
        rr(g, -22, -28, 44, 56, 6);
        g.lineWidth = 1;
        g.strokeStyle = 'rgba(200,150,60,0.5)';
        g.stroke();
        // 별
        g.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 5 : 12;
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const px = Math.cos(a) * r;
          const py = Math.sin(a) * r + 2;
          if (i) g.lineTo(px, py);
          else g.moveTo(px, py);
        }
        g.closePath();
        g.fillStyle = '#f2a516';
        g.fill();
        txt(g, '7', -14, -18, 11, '#b8540f', 'center', 800);
        g.restore();
      },
      verdict: () => v,
      extra: () => ex,
    };
  },
  controls: (p) => [
    { type: 'range', label: '마찰 (클수록 빨리 멈춤)', min: 1, max: 12, step: 0.5, value: p.fr, on: (v) => (p.fr = v) },
    { type: 'range', label: '스프링 단단함', min: 40, max: 400, step: 10, value: p.k, on: (v) => (p.k = v) },
  ],
});

/* ═════════ i421 길게 · 두 번 누르기 구별 ═════════ */
interface P421 {
  long: number;
  dbl: number;
}
const i421 = demo<P421>({
  caption: '한 번 · 두 번 · 길게 — 끔: 전부 「누름」으로 뒤죽박죽 · 켬: 시간 · 간격으로 열기 / ✕ / 깃발 구별 (길게는 원 진행)',
  howto: '칸을 한 번 누르면 열기, 빠르게 두 번 누르면 ✕ 표시, 꾹 누르고 있으면 깃발. 아래 시간 띠에 누른 구간이 그려집니다.',
  onName: '누름 시간 · 간격으로 몸짓 구별',
  cycle: 5.2,
  prm: () => ({ long: 500, dbl: 300 }),
  script: (u) => [
    path(u, [
      [0, 150, 300, 0],
      [0.4, 150, 136, 0],
      [0.55, 150, 136, 1],
      [0.67, 150, 136, 0],
      [1.7, 153, 139, 1],
      [1.8, 153, 139, 0],
      [1.92, 153, 139, 1],
      [2.02, 153, 139, 0],
      [3.0, 148, 137, 1],
      [3.95, 148, 137, 0],
      [4.5, 150, 300, 0],
    ]),
  ],
  create: (env) => {
    let open = false;
    let mark: 'none' | 'x' | 'flag' = 'none';
    let held: { id: number; t0: number; x0: number; y0: number; fired: boolean; moved: boolean } | null = null;
    let pendingT: number | null = null;
    let lastUp = -9;
    let gap = 0;
    let presses: { t0: number; t1: number | null }[] = [];
    let log: { text: string; color: string; t: number }[] = [];
    let flash = 0;
    let menuA = 0;
    let v: Verdict = { text: '칸을 눌러 보세요', color: COL.dim };
    const fire = (k: 'tap' | 'double' | 'long' | 'raw'): void => {
      flash = 0.35;
      const now = env.now();
      if (k === 'tap' || k === 'raw') {
        open = !open;
        if (k === 'raw') {
          v = { text: '누름 (구별 없음)', color: COL.off };
          log.push({ text: '누름', color: COL.off, t: now });
        } else {
          v = { text: '한 번 누르기 → 열기', color: COL.on };
          log.push({ text: '한 번', color: COL.on, t: now });
        }
      } else if (k === 'double') {
        mark = mark === 'x' ? 'none' : 'x';
        v = { text: '두 번 누르기 → ✕', color: COL.gold };
        log.push({ text: '두 번', color: COL.gold, t: now });
      } else {
        mark = 'flag';
        menuA = 0.001;
        v = { text: '길게 누르기 → 깃발', color: COL.violet };
        log.push({ text: '길게', color: COL.violet, t: now });
      }
      while (log.length > 5) log.shift();
    };
    const inTile = (x: number, y: number): boolean => Math.abs(x - 150) < 66 && Math.abs(y - 136) < 66;
    return {
      reset() {
        open = false;
        mark = 'none';
        held = null;
        pendingT = null;
        lastUp = -9;
        gap = 0;
        presses = [];
        log = [];
        flash = 0;
        menuA = 0;
        v = { text: '칸을 눌러 보세요', color: COL.dim };
      },
      down(id, x, y) {
        if (held || !inTile(x, y)) return;
        const now = env.now();
        held = { id, t0: now, x0: x, y0: y, fired: false, moved: false };
        gap = now - lastUp;
        presses.push({ t0: now, t1: null });
        if (!env.on()) fire('raw');
      },
      move(id, x, y) {
        if (held && held.id === id && dist(x, y, held.x0, held.y0) > 14) held.moved = true;
      },
      up(id) {
        if (!held || held.id !== id) return;
        const now = env.now();
        const last = presses[presses.length - 1];
        if (last) last.t1 = now;
        lastUp = now;
        const h = held;
        held = null;
        if (!env.on() || h.fired) return;
        if (h.moved) {
          v = { text: '움직여서 취소', color: COL.dim };
          pendingT = null;
          return;
        }
        if (pendingT !== null && h.t0 - pendingT <= env.prm.dbl / 1000) {
          pendingT = null;
          fire('double');
        } else pendingT = now;
      },
      cancel(id) {
        if (held && held.id === id) {
          const last = presses[presses.length - 1];
          if (last) last.t1 = env.now();
          held = null;
        }
      },
      step(dt) {
        const now = env.now();
        flash = Math.max(0, flash - dt);
        if (menuA > 0) menuA = Math.min(1, menuA + dt * 4);
        if (env.on()) {
          if (held && !held.fired && !held.moved && now - held.t0 >= env.prm.long / 1000) {
            held.fired = true;
            pendingT = null;
            fire('long');
          }
          if (pendingT !== null && !held && now - pendingT > env.prm.dbl / 1000) {
            pendingT = null;
            fire('tap');
          }
          if (held && !held.fired && pendingT === null) v = { text: '기다리는 중… (길게?)', color: COL.blue };
          else if (pendingT !== null && !held) v = { text: '기다리는 중… (두 번?)', color: COL.blue };
        }
        presses = presses.filter((p) => p.t1 === null || now - p.t1 < 3.4);
      },
      draw(g) {
        const on = env.on();
        const now = env.now();
        const T = 112;
        const press = held ? 0.94 : 1;
        // 칸
        g.save();
        g.translate(150, 136);
        g.scale(press, press);
        g.shadowColor = 'rgba(0,0,0,0.5)';
        g.shadowBlur = 16;
        g.shadowOffsetY = 6;
        rr(g, -T / 2, -T / 2, T, T, 16);
        const gr = g.createLinearGradient(0, -T / 2, 0, T / 2);
        if (open) {
          gr.addColorStop(0, '#e9eefc');
          gr.addColorStop(1, '#c4cde8');
        } else {
          gr.addColorStop(0, '#4c5ea8');
          gr.addColorStop(1, '#27336c');
        }
        g.fillStyle = gr;
        g.fill();
        g.shadowColor = 'transparent';
        if (!open) {
          rr(g, -T / 2 + 6, -T / 2 + 5, T - 12, T / 2 - 8, 11);
          g.fillStyle = 'rgba(255,255,255,0.12)';
          g.fill();
        } else txt(g, '3', 0, 2, 54, '#3a5bd9', 'center', 800);
        if (flash > 0) {
          rr(g, -T / 2, -T / 2, T, T, 16);
          g.fillStyle = `rgba(255,255,255,${flash})`;
          g.fill();
        }
        if (mark === 'x') {
          cross(g, 0, 0, 30, '#ff5068', 9);
        } else if (mark === 'flag') {
          line(g, -14, 34, -14, -32, '#e7e9f5', 4);
          g.beginPath();
          g.moveTo(-12, -32);
          g.lineTo(28, -20);
          g.lineTo(-12, -6);
          g.closePath();
          g.fillStyle = '#ff4d63';
          g.fill();
        }
        g.restore();
        // 길게 누르기 진행 원
        if (on && held && !held.moved) {
          const f = clamp((now - held.t0) / (env.prm.long / 1000), 0, 1);
          ring(g, held.x0, held.y0, 30, 'rgba(255,255,255,0.15)', 5);
          g.beginPath();
          g.arc(held.x0, held.y0, 30, -Math.PI / 2, -Math.PI / 2 + f * TAU);
          g.lineWidth = 5;
          g.lineCap = 'round';
          g.strokeStyle = f >= 1 ? COL.violet : COL.on;
          g.stroke();
        }
        // 길게 → 둥근 메뉴
        if (menuA > 0 && mark === 'flag') {
          const e = 1 - Math.pow(1 - menuA, 3);
          [-0.5, 0, 0.5].forEach((da, i) => {
            const a = -Math.PI / 2 + da * 1.6;
            const x = 150 + Math.cos(a) * 82 * e;
            const y = 136 + Math.sin(a) * 82 * e;
            disc(g, x, y, 13 * e, 'rgba(25,30,60,0.95)');
            ring(g, x, y, 13 * e, rgba(COL.violet, 0.9), 1.5);
            const lb = ['깃발', '물음', '지움'][i]!;
            if (e > 0.6) txt(g, lb, x, y, 8, COL.text, 'center', 700);
          });
        }
        // 몸짓 기록
        let lx = 26;
        for (const l of log) {
          g.font = `700 10px ${FONT}`;
          const w = g.measureText(l.text).width + 12;
          rr(g, lx, 213, w, 18, 9);
          g.fillStyle = rgba(l.color, 0.16);
          g.fill();
          g.strokeStyle = rgba(l.color, 0.6);
          g.lineWidth = 1;
          g.stroke();
          txt(g, l.text, lx + w / 2, 222.5, 10, l.color, 'center', 700);
          lx += w + 4;
        }
        // 시간 띠 (최근 3.2초)
        const X0 = 22;
        const X1 = 278;
        const Y = 248;
        const H = 26;
        const win = 3.2;
        const tx = (t: number): number => X1 - ((now - t) / win) * (X1 - X0);
        rr(g, X0, Y, X1 - X0, H, 6);
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.fill();
        g.strokeStyle = 'rgba(160,180,255,0.18)';
        g.stroke();
        g.save();
        rr(g, X0, Y, X1 - X0, H, 6);
        g.clip();
        for (let s = Math.ceil(now - win); s <= now; s += 0.5) line(g, tx(s), Y + 2, tx(s), Y + H - 2, 'rgba(160,180,255,0.08)', 1);
        if (on && pendingT !== null) {
          const a = tx(pendingT);
          const b = tx(pendingT + env.prm.dbl / 1000);
          g.fillStyle = rgba(COL.gold, 0.14);
          g.fillRect(a, Y, b - a, H);
          line(g, b, Y, b, Y + H, rgba(COL.gold, 0.8), 1, [2, 2]);
        }
        for (const p of presses) {
          const a = tx(p.t0);
          const b = tx(p.t1 ?? now);
          rr(g, a, Y + 6, Math.max(3, b - a), H - 12, 4);
          g.fillStyle = on ? COL.on : COL.off;
          g.fill();
        }
        if (on && held) {
          const lt = tx(held.t0 + env.prm.long / 1000);
          line(g, lt, Y, lt, Y + H, rgba(COL.violet, 0.9), 1.4, [3, 2]);
        }
        g.restore();
        txt(g, '누른 구간 · 최근 3초', X0, Y + H + 10, 9, COL.dim, 'left', 600);
        if (on) txt(g, '노랑 = 두 번 기다림', X1, Y + H + 10, 9, rgba(COL.gold, 0.8), 'right', 600);
      },
      verdict: () => v,
      extra: () => [
        `직전 누름과의 간격 ${gap > 5 ? '—' : gap.toFixed(2) + '초'} (두 번 기준 ${(env.prm.dbl / 1000).toFixed(2)}초)`,
        `길게 기준 ${(env.prm.long / 1000).toFixed(2)}초 · 14px 넘게 움직이면 취소`,
        env.on() ? '한 번은 두 번 기다림이 끝나야 확정 (조금 늦음)' : '누르는 즉시 「누름」 — 두 번 · 길게를 모름',
      ],
    };
  },
  controls: (p) => [
    { type: 'range', label: '길게 누르기 기준 (ms)', min: 250, max: 1000, step: 50, value: p.long, on: (v) => (p.long = v) },
    { type: 'range', label: '두 번 누르기 간격 (ms)', min: 150, max: 500, step: 10, value: p.dbl, on: (v) => (p.dbl = v) },
  ],
});

/* ═════════ i422 두 손가락 몸짓 ═════════ */
type P422 = Record<string, never>;
const rot = (p: V2, a: number): V2 => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) });
const i422 = demo<P422>({
  caption: '두 손가락 벌리며 돌리기 — 끔: 그림 가운데 기준이라 손가락 밑 점이 빠져나감(빨강) · 켬: 두 손가락 가운데 기준, 점이 그대로',
  howto: '두 손가락으로 벌리고 돌려 보세요. PC: Shift + 끌기 = 두 손가락(보라 = 가상 손가락), 휠 = 확대, Shift + 휠 = 회전.',
  onName: '두 손가락 가운데를 중심으로',
  cycle: 3.8,
  pinchEmu: true,
  prm: () => ({}),
  script: (u) => [
    path(u, [
      [0, 182, 262, 0],
      [0.3, 175, 205, 0],
      [0.45, 175, 205, 1],
      [1.5, 170, 238, 1],
      [2.0, 170, 238, 1],
      [3.0, 175, 205, 1],
      [3.15, 175, 205, 0],
      [3.8, 182, 262, 0],
    ]),
    path(
      u,
      [
        [0, 246, 236, 0],
        [0.3, 225, 185, 0],
        [0.45, 225, 185, 1],
        [1.5, 234, 167, 1],
        [2.0, 234, 167, 1],
        [3.0, 225, 185, 1],
        [3.15, 225, 185, 0],
        [3.8, 246, 236, 0],
      ],
      2,
    ),
  ],
  create: (env) => {
    const HOME = { x: 150, y: 172, s: 0.74, r: 0 };
    let pic = { ...HOME };
    const touches = new Map<number, V2>();
    let gest: { a: number; b: number; m0: V2; d0: number; a0: number; pic0: typeof pic; pins: V2[] } | null = null;
    let pan: { id: number; x0: number; y0: number; pic0: typeof pic } | null = null;
    let v: Verdict = { text: '두 손가락으로 벌려요', color: COL.dim };
    let maxOff = 0;
    const toLocal = (p: V2): V2 => {
      const q = rot({ x: p.x - pic.x, y: p.y - pic.y }, -pic.r);
      return { x: q.x / pic.s, y: q.y / pic.s };
    };
    const toWorld = (l: V2): V2 => {
      const q = rot({ x: l.x * pic.s, y: l.y * pic.s }, pic.r);
      return { x: pic.x + q.x, y: pic.y + q.y };
    };
    const startGest = (): void => {
      const ids = [...touches.keys()];
      const a = ids[0]!;
      const b = ids[1]!;
      const pa = touches.get(a)!;
      const pb = touches.get(b)!;
      gest = { a, b, m0: { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 }, d0: Math.max(4, dist(pa.x, pa.y, pb.x, pb.y)), a0: Math.atan2(pb.y - pa.y, pb.x - pa.x), pic0: { ...pic }, pins: [toLocal(pa), toLocal(pb)] };
      pan = null;
      maxOff = 0;
    };
    const startPan = (id: number): void => {
      const p = touches.get(id);
      if (p) pan = { id, x0: p.x, y0: p.y, pic0: { ...pic } };
    };
    const apply = (): void => {
      if (gest) {
        const pa = touches.get(gest.a);
        const pb = touches.get(gest.b);
        if (!pa || !pb) return;
        const m = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
        const k = Math.max(4, dist(pa.x, pa.y, pb.x, pb.y)) / gest.d0;
        const da = Math.atan2(pb.y - pa.y, pb.x - pa.x) - gest.a0;
        const s = clamp(gest.pic0.s * k, 0.3, 4);
        const kk = s / gest.pic0.s;
        if (env.on()) {
          const q = rot({ x: (gest.pic0.x - gest.m0.x) * kk, y: (gest.pic0.y - gest.m0.y) * kk }, da);
          pic = { x: m.x + q.x, y: m.y + q.y, s, r: gest.pic0.r + da };
        } else pic = { x: gest.pic0.x, y: gest.pic0.y, s, r: gest.pic0.r + da };
        const w0 = toWorld(gest.pins[0]!);
        const w1 = toWorld(gest.pins[1]!);
        const off = Math.max(dist(w0.x, w0.y, pa.x, pa.y), dist(w1.x, w1.y, pb.x, pb.y));
        maxOff = Math.max(maxOff, off);
        v = off > 6 ? { text: `손가락 밑 점이 ${Math.round(off)}px 어긋남`, color: COL.off } : { text: '손가락 밑 점 그대로', color: COL.on };
      } else if (pan) {
        const p = touches.get(pan.id);
        if (p) pic = { ...pan.pic0, x: pan.pic0.x + p.x - pan.x0, y: pan.pic0.y + p.y - pan.y0 };
      }
    };
    const zoomAt = (cx: number, cy: number, k: number, da: number): void => {
      const s = clamp(pic.s * k, 0.3, 4);
      const kk = s / pic.s;
      const c = env.on() ? { x: cx, y: cy } : { x: pic.x, y: pic.y };
      const q = rot({ x: (pic.x - c.x) * kk, y: (pic.y - c.y) * kk }, da);
      pic = { x: c.x + q.x, y: c.y + q.y, s, r: pic.r + da };
    };
    return {
      reset() {
        pic = { ...HOME };
        touches.clear();
        gest = null;
        pan = null;
        maxOff = 0;
        v = { text: '두 손가락으로 벌려요', color: COL.dim };
      },
      down(id, x, y) {
        touches.set(id, { x, y });
        if (touches.size === 2) startGest();
        else if (touches.size === 1) startPan(id);
      },
      move(id, x, y) {
        if (!touches.has(id)) return;
        touches.set(id, { x, y });
        apply();
      },
      up(id) {
        touches.delete(id);
        if (gest && (gest.a === id || gest.b === id)) {
          gest = null;
          const rest = [...touches.keys()];
          if (rest.length >= 2) startGest();
          else if (rest.length === 1) startPan(rest[0]!);
        } else if (pan && pan.id === id) pan = null;
      },
      cancel(id) {
        touches.delete(id);
        if (gest && (gest.a === id || gest.b === id)) gest = null;
        if (pan && pan.id === id) pan = null;
      },
      wheel(x, y, dy, shift) {
        if (shift) zoomAt(x, y, 1, clamp(dy, -100, 100) * 0.004);
        else zoomAt(x, y, Math.exp(-clamp(dy, -100, 100) * 0.0018), 0);
        v = { text: shift ? `휠 회전 · ${env.on() ? '마우스 자리 중심' : '그림 가운데 중심'}` : `휠 확대 · ${env.on() ? '마우스 자리 중심' : '그림 가운데 중심'}`, color: env.on() ? COL.on : COL.warn };
      },
      step() {},
      draw(g) {
        // 그림 (보물 지도)
        g.save();
        g.translate(pic.x, pic.y);
        g.rotate(pic.r);
        g.scale(pic.s, pic.s);
        g.shadowColor = 'rgba(0,0,0,0.55)';
        g.shadowBlur = 18;
        g.shadowOffsetY = 8;
        rr(g, -90, -90, 180, 180, 14);
        const gr = g.createLinearGradient(-90, -90, 90, 90);
        gr.addColorStop(0, '#f6e7c3');
        gr.addColorStop(1, '#dcc08a');
        g.fillStyle = gr;
        g.fill();
        g.shadowColor = 'transparent';
        g.save();
        rr(g, -90, -90, 180, 180, 14);
        g.clip();
        g.fillStyle = '#7fc6d9';
        g.fillRect(-90, -90, 180, 180);
        for (let i = -90; i <= 90; i += 15) {
          line(g, i, -90, i, 90, 'rgba(255,255,255,0.18)', 0.7);
          line(g, -90, i, 90, i, 'rgba(255,255,255,0.18)', 0.7);
        }
        g.beginPath();
        g.moveTo(-58, -20);
        g.bezierCurveTo(-60, -66, 10, -72, 34, -48);
        g.bezierCurveTo(70, -30, 66, 22, 44, 44);
        g.bezierCurveTo(20, 70, -40, 64, -52, 32);
        g.bezierCurveTo(-66, 10, -56, 0, -58, -20);
        g.closePath();
        g.fillStyle = '#efd79c';
        g.fill();
        g.lineWidth = 3;
        g.strokeStyle = '#c9a463';
        g.stroke();
        g.beginPath();
        g.ellipse(-8, -6, 30, 22, 0.3, 0, TAU);
        g.fillStyle = '#7dbb5a';
        g.fill();
        g.beginPath();
        g.moveTo(-40, 34);
        g.bezierCurveTo(-20, 10, 0, 40, 18, 18);
        g.bezierCurveTo(30, 4, 26, -10, 34, -24);
        g.setLineDash([4, 4]);
        g.lineWidth = 2;
        g.strokeStyle = '#9b3b2a';
        g.stroke();
        g.setLineDash([]);
        cross(g, 36, -28, 7, '#c4242f', 3.5);
        // 나무 셋
        for (const [tx, ty] of [
          [-20, -16],
          [0, -2],
          [-30, 4],
        ] as [number, number][]) {
          disc(g, tx, ty, 6, '#3d8a3a');
          disc(g, tx - 1.5, ty - 2, 2.5, 'rgba(255,255,255,0.25)');
        }
        // 나침반
        g.save();
        g.translate(62, 62);
        ring(g, 0, 0, 13, '#5d4a2c', 1.5);
        g.beginPath();
        g.moveTo(0, -12);
        g.lineTo(3.5, 0);
        g.lineTo(0, 12);
        g.lineTo(-3.5, 0);
        g.closePath();
        g.fillStyle = '#5d4a2c';
        g.fill();
        txt(g, 'N', 0, -19, 8, '#5d4a2c', 'center', 800);
        g.restore();
        g.restore();
        rr(g, -90, -90, 180, 180, 14);
        g.lineWidth = 3;
        g.strokeStyle = '#8a6a3a';
        g.stroke();
        g.restore();
        // 중심 표시
        if (gest) {
          const pa = touches.get(gest.a);
          const pb = touches.get(gest.b);
          if (pa && pb) {
            line(g, pa.x, pa.y, pb.x, pb.y, 'rgba(255,255,255,0.35)', 1.2, [3, 4]);
            const c = env.on() ? { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 } : { x: pic.x, y: pic.y };
            const cc = env.on() ? COL.on : COL.off;
            ring(g, c.x, c.y, 7, cc, 2);
            line(g, c.x - 11, c.y, c.x + 11, c.y, cc, 1.5);
            line(g, c.x, c.y - 11, c.x, c.y + 11, cc, 1.5);
            txt(g, env.on() ? '중심: 손가락 가운데' : '중심: 그림 가운데', c.x, c.y + 20, 9.5, cc, 'center', 700);
            gest.pins.forEach((pl, i) => {
              const w = toWorld(pl);
              const f = i === 0 ? pa : pb;
              const off = dist(w.x, w.y, f.x, f.y);
              if (off > 4) line(g, f.x, f.y, w.x, w.y, COL.off, 2, [4, 3]);
              g.save();
              g.translate(w.x, w.y);
              g.rotate(Math.PI / 4);
              g.fillStyle = off > 6 ? COL.off : COL.on;
              g.fillRect(-4.5, -4.5, 9, 9);
              g.strokeStyle = '#fff';
              g.lineWidth = 1.2;
              g.strokeRect(-4.5, -4.5, 9, 9);
              g.restore();
            });
          }
        }
      },
      verdict: () => v,
      extra: () => [
        `배율 ×${(pic.s / HOME.s).toFixed(2)} · 회전 ${Math.round((pic.r * 180) / Math.PI)}°`,
        gest ? `두 점 거리 비 = 배율, 두 점 각도 차 = 회전` : '한 손가락 = 옮기기, 두 손가락 = 확대 · 회전',
        `가장 크게 어긋난 거리 ${Math.round(maxOff)}px`,
        '네모 점 = 처음 손가락이 짚은 그림 위 자리',
      ],
    };
  },
  controls: () => [],
});

/* ═════════ i423 놓친 누르기 알려 주기 ═════════ */
interface P423 {
  shake: boolean;
  hold: number;
}
const i423 = demo<P423>({
  caption: '못 놓는 칸을 누르면 — 끔: 아무 반응 없음(왜 안 되지?) · 켬: 그 칸이 흔들리고 까닭을 그 자리에 짧게',
  howto: '파란 돌 옆 빈칸에만 돌을 놓을 수 있어요. 자물쇠 칸 · 이미 놓은 칸 · 떨어진 칸을 눌러 보세요.',
  onName: '그 자리에 까닭 알려 주기',
  cycle: 5.4,
  prm: () => ({ shake: true, hold: 1.5 }),
  script: (u) => {
    const c = (col: number, row: number): [number, number] => [42 + 27 + col * 54, 64 + 27 + row * 54];
    const [ax, ay] = c(2, 1);
    const [bx, by] = c(3, 0);
    const [vx, vy] = c(1, 2);
    const [sx, sy] = c(1, 1);
    return [
      path(u, [
        [0, 160, 318, 0],
        [0.35, ax + 3, ay + 4, 0],
        [0.55, ax + 3, ay + 4, 1],
        [0.72, ax + 3, ay + 4, 0],
        [1.65, bx + 2, by + 5, 0],
        [1.85, bx + 2, by + 5, 1],
        [2.0, bx + 2, by + 5, 0],
        [2.95, vx + 3, vy + 3, 0],
        [3.15, vx + 3, vy + 3, 1],
        [3.3, vx + 3, vy + 3, 0],
        [4.1, sx + 4, sy + 4, 0],
        [4.3, sx + 4, sy + 4, 1],
        [4.45, sx + 4, sy + 4, 0],
        [5.4, 160, 318, 0],
      ]),
    ];
  },
  create: (env) => {
    const GX = 42;
    const GY = 64;
    const CS = 54;
    const N = 4;
    const LOCK = new Set(['2,1', '3,3', '0,3']);
    let stones = new Set<string>();
    let pops = new Map<string, number>();
    let shakes = new Map<string, number>();
    let bubbles: { x: number; y: number; text: string; a: number }[] = [];
    let quiz: { x: number; y: number; a: number }[] = [];
    let downCell: string | null = null;
    let pid = -1;
    let v: Verdict = { text: '돌 옆 빈칸에 놓아요', color: COL.dim };
    let reason = '';
    const cellAt = (x: number, y: number): [number, number] | null => {
      const c = Math.floor((x - GX) / CS);
      const r = Math.floor((y - GY) / CS);
      return c >= 0 && c < N && r >= 0 && r < N ? [c, r] : null;
    };
    const why = (c: number, r: number): string | null => {
      const k = `${c},${r}`;
      if (stones.has(k)) return '이미 놓은 칸이에요';
      if (LOCK.has(k)) return '잠긴 칸 — 열쇠가 있어야 해요';
      const adj = [
        [c + 1, r],
        [c - 1, r],
        [c, r + 1],
        [c, r - 1],
      ].some(([a, b]) => stones.has(`${a},${b}`));
      return adj ? null : '돌 옆 칸에만 놓을 수 있어요';
    };
    return {
      reset() {
        stones = new Set(['0,0', '1,1']);
        pops = new Map();
        shakes = new Map();
        bubbles = [];
        quiz = [];
        downCell = null;
        pid = -1;
        v = { text: '돌 옆 빈칸에 놓아요', color: COL.dim };
        reason = '';
      },
      down(id, x, y) {
        if (pid !== -1) return;
        pid = id;
        const c = cellAt(x, y);
        downCell = c ? `${c[0]},${c[1]}` : null;
      },
      move() {},
      up(id, x, y) {
        if (id !== pid) return;
        pid = -1;
        const c = cellAt(x, y);
        const k = c ? `${c[0]},${c[1]}` : null;
        if (k !== downCell) return;
        const w = c ? why(c[0], c[1]) : '판 밖이에요';
        if (!w && c && k) {
          stones.add(k);
          pops.set(k, 0);
          v = { text: '놓았어요!', color: COL.on };
          reason = '돌 옆 빈칸 — 놓을 수 있음';
          return;
        }
        reason = w ?? '';
        if (env.on()) {
          if (k && env.prm.shake) shakes.set(k, 0);
          const bx = c ? GX + CS / 2 + c[0] * CS : x;
          const by = c ? GY + c[1] * CS + 4 : y - 20;
          bubbles = bubbles.filter((b) => b.a > 0.3 && Math.abs(b.y - by) > 2);
          bubbles.push({ x: bx, y: by, text: w ?? '', a: 0 });
          v = { text: `까닭: ${w}`, color: COL.warn };
        } else {
          quiz.push({ x, y, a: 0 });
          v = { text: '반응 없음 — 왜 안 되지?', color: COL.off };
        }
      },
      cancel(id) {
        if (id === pid) pid = -1;
      },
      step(dt) {
        for (const [k, a] of pops) pops.set(k, a + dt);
        for (const [k, a] of shakes) {
          if (a + dt > 0.45) shakes.delete(k);
          else shakes.set(k, a + dt);
        }
        for (const b of bubbles) b.a += dt;
        bubbles = bubbles.filter((b) => b.a < env.prm.hold + 0.25);
        for (const q of quiz) q.a += dt;
        quiz = quiz.filter((q) => q.a < 1.2);
      },
      draw(g) {
        board(g, GX - 10, GY - 10, CS * N + 20, CS * N + 20);
        for (let r = 0; r < N; r++)
          for (let c = 0; c < N; c++) {
            const k = `${c},${r}`;
            const sa = shakes.get(k);
            const ox = sa !== undefined ? Math.sin(sa * 55) * 6 * (1 - sa / 0.45) : 0;
            const x = GX + c * CS + ox;
            const y = GY + r * CS;
            rr(g, x + 3, y + 3, CS - 6, CS - 6, 9);
            const lock = LOCK.has(k);
            g.fillStyle = lock ? 'rgba(80,90,130,0.35)' : 'rgba(120,140,220,0.11)';
            g.fill();
            if (sa !== undefined) {
              g.lineWidth = 2;
              g.strokeStyle = rgba(COL.off, 1 - sa / 0.45);
              g.stroke();
            }
            const mx = x + CS / 2;
            const my = y + CS / 2;
            if (lock) {
              g.lineWidth = 2;
              g.strokeStyle = 'rgba(200,210,240,0.7)';
              g.beginPath();
              g.arc(mx, my - 4, 6, Math.PI, 0);
              g.stroke();
              rr(g, mx - 9, my - 4, 18, 14, 3);
              g.stroke();
              disc(g, mx, my + 3, 1.8, 'rgba(200,210,240,0.8)');
            }
            if (stones.has(k)) {
              const pa = pops.get(k);
              const sc = pa !== undefined ? 1 + Math.sin(Math.min(1, pa / 0.3) * Math.PI) * 0.25 : 1;
              const R = 17 * sc;
              g.save();
              g.shadowColor = 'rgba(0,0,0,0.5)';
              g.shadowBlur = 8;
              g.shadowOffsetY = 3;
              const gr = g.createRadialGradient(mx - 5, my - 6, 2, mx, my, R);
              gr.addColorStop(0, '#bfe0ff');
              gr.addColorStop(0.5, '#4f93f0');
              gr.addColorStop(1, '#1d4fae');
              disc(g, mx, my, R, gr as unknown as string);
              g.restore();
            }
          }
        for (const q of quiz) {
          const al = 1 - q.a / 1.2;
          txt(g, '?', q.x + 16, q.y - 18 - q.a * 10, 18, `rgba(170,180,210,${al})`, 'center', 800);
        }
        for (const b of bubbles) {
          const inA = Math.min(1, b.a / 0.15);
          const outA = clamp((env.prm.hold + 0.25 - b.a) / 0.25, 0, 1);
          const al = Math.min(inA, outA);
          g.save();
          g.globalAlpha = al;
          g.font = `700 11px ${FONT}`;
          const w = g.measureText(b.text).width + 18;
          const h = 24;
          const x0 = clamp(b.x - w / 2, 6, VW - 6 - w);
          const y0 = b.y - h - 10 - (1 - inA) * 6;
          g.shadowColor = 'rgba(0,0,0,0.4)';
          g.shadowBlur = 10;
          g.shadowOffsetY = 3;
          rr(g, x0, y0, w, h, 8);
          g.fillStyle = '#fff6e4';
          g.fill();
          g.shadowColor = 'transparent';
          g.beginPath();
          g.moveTo(b.x - 6, y0 + h - 0.5);
          g.lineTo(b.x, y0 + h + 7);
          g.lineTo(b.x + 6, y0 + h - 0.5);
          g.closePath();
          g.fill();
          rr(g, x0, y0, w, h, 8);
          g.lineWidth = 1.2;
          g.strokeStyle = COL.warn;
          g.stroke();
          txt(g, b.text, x0 + w / 2, y0 + h / 2 + 0.5, 11, '#6b3b00', 'center', 700);
          g.restore();
        }
      },
      verdict: () => v,
      extra: () => [reason ? `규칙 검사: ${reason}` : '규칙: 파란 돌과 맞닿은 빈칸만', env.on() ? '까닭은 누른 자리 바로 위에 — 눈을 옮기지 않아도 됨' : '막힌 입력을 조용히 무시 — 아이는 고장인 줄 앎'],
    };
  },
  controls: (p) => [
    { type: 'toggle', label: '칸 흔들기', value: p.shake, on: (v) => (p.shake = v) },
    { type: 'range', label: '글 보이는 시간 (초)', min: 0.6, max: 3, step: 0.1, value: p.hold, on: (v) => (p.hold = v) },
  ],
});

/* ═════════ i424 끌어다 놓기 미리 보기 ═════════ */
interface P424 {
  alpha: number;
}
const i424 = demo<P424>({
  caption: 'L 조각을 끄는 동안 — 끔: 어디 놓일지 모름 · 켬: 놓일 자리를 그림자로 미리 (겹치면 빨강, 되면 초록)',
  howto: '아래 보라 조각을 판 위로 끌어 보세요. 그림자가 초록일 때 놓으면 착, 빨강에서 놓으면 제자리로 돌아갑니다.',
  onName: '놓일 자리 그림자',
  cycle: 4.8,
  prm: () => ({ alpha: 0.5 }),
  script: (u) => [
    path(u, [
      [0, 210, 318, 0],
      [0.3, 129, 243, 0],
      [0.45, 129, 243, 1],
      [1.2, 150, 64, 1],
      [1.8, 152, 62, 1],
      [2.4, 150, 148, 1],
      [3.0, 151, 148, 1],
      [3.05, 151, 148, 0],
      [3.8, 210, 318, 0],
      [4.8, 210, 318, 0],
    ]),
  ],
  create: (env) => {
    const GX = 45;
    const GY = 40;
    const CS = 42;
    const NC = 5;
    const NR = 4;
    const SHAPE: [number, number][] = [
      [0, 0],
      [0, 1],
      [1, 1],
    ];
    const HOME = { x: 108, y: 222 };
    const INIT = ['1,1', '2,1', '3,2', '0,3', '4,0'];
    let occ = new Map<string, string>();
    let pos = { ...HOME };
    let vel = { x: 0, y: 0 };
    let target: V2 | null = null;
    let grab: { id: number; ox: number; oy: number } | null = null;
    let anchor: { c: number; r: number; ok: boolean; bad: Set<string> } | null = null;
    let pending: { c: number; r: number } | null = null;
    let shake = 0;
    let fresh = 1;
    let v: Verdict = { text: '조각을 판으로 끌어요', color: COL.dim };
    let ex: string[] = [];
    const evalAt = (x: number, y: number): { c: number; r: number; ok: boolean; bad: Set<string> } => {
      const c = Math.round((x - GX) / CS);
      const r = Math.round((y - GY) / CS);
      const bad = new Set<string>();
      for (const [dc, dr] of SHAPE) {
        const cc = c + dc;
        const rr0 = r + dr;
        if (cc < 0 || cc >= NC || rr0 < 0 || rr0 >= NR || occ.has(`${cc},${rr0}`)) bad.add(`${dc},${dr}`);
      }
      return { c, r, ok: bad.size === 0, bad };
    };
    const onBoard = (x: number, y: number): boolean => x > GX - CS && x < GX + CS * NC && y > GY - CS && y < GY + CS * NR;
    const block = (g: CanvasRenderingContext2D, x: number, y: number, c1: string, c2: string, s = CS): void => {
      rr(g, x + 2, y + 2, s - 4, s - 4, 7);
      const gr = g.createLinearGradient(0, y, 0, y + s);
      gr.addColorStop(0, c1);
      gr.addColorStop(1, c2);
      g.fillStyle = gr;
      g.fill();
      rr(g, x + 6, y + 5, s - 12, s / 2 - 6, 5);
      g.fillStyle = 'rgba(255,255,255,0.2)';
      g.fill();
    };
    return {
      reset() {
        occ = new Map(INIT.map((k) => [k, 'stone']));
        pos = { ...HOME };
        vel = { x: 0, y: 0 };
        target = null;
        grab = null;
        anchor = null;
        pending = null;
        shake = 0;
        fresh = 1;
        v = { text: '조각을 판으로 끌어요', color: COL.dim };
        ex = [];
      },
      down(id, x, y) {
        if (grab || target) return;
        const inside = SHAPE.some(([dc, dr]) => x > pos.x + dc * CS && x < pos.x + (dc + 1) * CS && y > pos.y + dr * CS && y < pos.y + (dr + 1) * CS);
        if (!inside) return;
        grab = { id, ox: pos.x - x, oy: pos.y - y };
        v = { text: '끄는 중…', color: COL.blue };
      },
      move(id, x, y) {
        if (!grab || grab.id !== id) return;
        pos = { x: x + grab.ox, y: y + grab.oy };
        const a = evalAt(pos.x, pos.y);
        anchor = onBoard(pos.x + CS / 2, pos.y + CS / 2) ? a : null;
        if (anchor) {
          v = env.on() ? (anchor.ok ? { text: '여기 놓을 수 있어요', color: COL.on } : { text: '겹쳐요 — 못 놓아요', color: COL.off }) : { text: '끄는 중… (어디 놓일까?)', color: COL.dim };
          ex = [`놓일 자리: ${anchor.c + 1}칸 ${anchor.r + 1}줄`, anchor.ok ? '세 칸 모두 비어 있음' : `막힌 칸 ${anchor.bad.size}개 (겹침 · 판 밖)`];
        }
      },
      up(id) {
        if (!grab || grab.id !== id) return;
        grab = null;
        const a = onBoard(pos.x + CS / 2, pos.y + CS / 2) ? evalAt(pos.x, pos.y) : null;
        if (a && a.ok) {
          target = { x: GX + a.c * CS, y: GY + a.r * CS };
          pending = { c: a.c, r: a.r };
          v = { text: '착 — 놓았어요', color: COL.on };
        } else {
          target = { ...HOME };
          shake = 0.4;
          v = a ? { text: env.on() ? '빨강에서 놓아 돌아감' : '갑자기 돌아감 — 왜?', color: COL.off } : { text: '판 밖 — 돌아감', color: COL.warn };
        }
        anchor = null;
      },
      cancel(id) {
        if (grab && grab.id === id) {
          grab = null;
          anchor = null;
          target = { ...HOME };
        }
      },
      step(dt) {
        shake = Math.max(0, shake - dt);
        fresh = Math.min(1, fresh + dt * 3);
        if (target && !grab) {
          const k = 320;
          const c = 2 * Math.sqrt(k) * 0.7;
          vel.x += (k * (target.x - pos.x) - c * vel.x) * dt;
          vel.y += (k * (target.y - pos.y) - c * vel.y) * dt;
          pos = { x: pos.x + vel.x * dt, y: pos.y + vel.y * dt };
          if (dist(pos.x, pos.y, target.x, target.y) < 0.4 && Math.hypot(vel.x, vel.y) < 3) {
            pos = { ...target };
            vel = { x: 0, y: 0 };
            target = null;
            if (pending) {
              for (const [dc, dr] of SHAPE) occ.set(`${pending.c + dc},${pending.r + dr}`, 'piece');
              pending = null;
              pos = { ...HOME };
              fresh = 0;
            }
          }
        }
      },
      draw(g) {
        board(g, GX - 10, GY - 10, CS * NC + 20, CS * NR + 20);
        for (let r = 0; r < NR; r++)
          for (let c = 0; c < NC; c++) {
            const k = `${c},${r}`;
            const x = GX + c * CS;
            const y = GY + r * CS;
            const o = occ.get(k);
            if (o === 'stone') block(g, x, y, '#5c6788', '#3a4362');
            else if (o === 'piece') block(g, x, y, '#b59cff', '#7652e0');
            else {
              rr(g, x + 3, y + 3, CS - 6, CS - 6, 7);
              g.fillStyle = 'rgba(120,140,220,0.1)';
              g.fill();
            }
          }
        // 조각 받침
        rr(g, HOME.x - 10, HOME.y - 8, CS * 2 + 20, CS * 2 + 14, 12);
        g.setLineDash([4, 4]);
        g.lineWidth = 1;
        g.strokeStyle = 'rgba(160,180,255,0.25)';
        g.stroke();
        g.setLineDash([]);
        // 조각
        const sx = shake > 0 ? Math.sin(shake * 60) * 5 * (shake / 0.4) : 0;
        const lifted = !!grab;
        g.save();
        g.globalAlpha = fresh * (lifted && env.on() && anchor ? 0.6 : 1);
        g.translate(pos.x + sx, pos.y - (lifted ? 6 : 0));
        if (lifted) {
          g.fillStyle = 'rgba(0,0,0,0.35)';
          for (const [dc, dr] of SHAPE) {
            rr(g, dc * CS + 6, dr * CS + 12, CS - 4, CS - 4, 7);
            g.fill();
          }
        }
        for (const [dc, dr] of SHAPE) block(g, dc * CS, dr * CS, '#c8b4ff', '#8060ec');
        g.restore();
        // 그림자 미리 보기
        if (env.on() && grab && anchor) {
          const al = env.prm.alpha;
          const col = anchor.ok ? COL.on : COL.off;
          for (const [dc, dr] of SHAPE) {
            const x = GX + (anchor.c + dc) * CS;
            const y = GY + (anchor.r + dr) * CS;
            rr(g, x + 3, y + 3, CS - 6, CS - 6, 7);
            g.fillStyle = rgba(col, al * 0.55);
            g.fill();
            g.lineWidth = 2;
            g.setLineDash([5, 3]);
            g.strokeStyle = rgba(col, Math.min(1, al + 0.35));
            g.stroke();
            g.setLineDash([]);
            if (anchor.bad.has(`${dc},${dr}`)) cross(g, x + CS / 2, y + CS / 2, 8, '#ffffff', 3);
          }
        }
      },
      verdict: () => v,
      extra: () => [...ex, env.on() ? '판 칸에 맞춰 반올림한 자리를 미리 계산해 그림' : '놓아 봐야 결과를 앎'],
    };
  },
  controls: (p) => [{ type: 'range', label: '그림자 진하기', min: 0.15, max: 1, step: 0.05, value: p.alpha, on: (v) => (p.alpha = v) }],
});

/* ═════════ i425 손 떨림 걸러내기 ═════════ */
interface P425 {
  slop: number;
  jit: number;
}
const jx = (u: number): number => 3.2 * Math.sin(u * 57) + 1.8 * Math.sin(u * 131);
const jy = (u: number): number => 2.6 * Math.sin(u * 71 + 1) + 1.5 * Math.cos(u * 113);
const i425 = demo<P425>({
  caption: '떨리는 손으로 누르기 — 끔: 조금만 움직여도 「끌기」라 선택이 사라짐 · 켬: 문턱 원 안이면 누름 (크게 끌면 넘기기)',
  howto: '칸을 눌러 고르거나 옆으로 끌어 넘겨 보세요. 「손 떨림 흉내」를 올리면 누르고 있는 동안 손이 떨립니다.',
  onName: '문턱 안 움직임은 누름으로',
  cycle: 4.6,
  prm: () => ({ slop: 10, jit: 3 }),
  script: (u) => {
    const f = path(u, [
      [0, 150, 312, 0],
      [0.25, 149, 160, 0],
      [0.4, 149, 160, 1],
      [0.8, 149, 160, 0],
      [1.35, 235, 160, 0],
      [1.5, 235, 160, 1],
      [1.9, 235, 160, 0],
      [2.45, 230, 166, 0],
      [2.6, 230, 166, 1],
      [3.5, 110, 160, 1],
      [3.6, 110, 160, 0],
      [4.6, 150, 312, 0],
    ]);
    if (f.down) {
      f.x += jx(u);
      f.y += jy(u);
    }
    return [f];
  },
  create: (env) => {
    const VX = 20;
    const VWd = 260;
    const TY = 116;
    const TH = 88;
    const TW = 76;
    const GAP = 10;
    const NT = 6;
    const minS = -(NT * (TW + GAP) + GAP - VWd);
    const HUES = ['#ff8a5c', '#ffcf4a', '#7ed86a', '#4fc3f7', '#a98bff', '#ff7aa8'];
    let sx = 0;
    let sel = -1;
    let pulse = 0;
    let press: { id: number; x0: number; y0: number; raw: V2; path: V2[]; drag: boolean; ox: number; sx0: number; maxD: number } | null = null;
    let lastPath: V2[] = [];
    let lastStart: V2 | null = null;
    let v: Verdict = { text: '칸을 눌러 골라요', color: COL.dim };
    let ex: string[] = [];
    const thr = (): number => (env.on() ? env.prm.slop : 0.5);
    const tileAt = (x: number): number => {
      const lx = x - VX - sx - GAP;
      const i = Math.floor(lx / (TW + GAP));
      const inT = lx - i * (TW + GAP) <= TW;
      return i >= 0 && i < NT && inT ? i : -1;
    };
    const handle = (x: number, y: number): void => {
      if (!press) return;
      press.path.push({ x, y });
      if (press.path.length > 240) press.path.shift();
      const d = dist(x, y, press.x0, press.y0);
      press.maxD = Math.max(press.maxD, d);
      if (!press.drag && d > thr()) {
        press.drag = true;
        press.ox = env.on() ? x : press.x0;
        press.sx0 = sx;
      }
      if (press.drag) sx = clamp(press.sx0 + (x - press.ox), minS, 0);
      ex = [`최대 움직임 ${press.maxD.toFixed(1)}px (문턱 ${env.on() ? env.prm.slop : 0}px)`, press.drag ? '문턱을 넘어 끌기로 바뀜' : '아직 누름 후보'];
    };
    return {
      reset() {
        sx = 0;
        sel = -1;
        pulse = 0;
        press = null;
        lastPath = [];
        lastStart = null;
        v = { text: '칸을 눌러 골라요', color: COL.dim };
        ex = [];
      },
      down(id, x, y) {
        if (press) return;
        if (y < TY - 10 || y > TY + TH + 10) return;
        press = { id, x0: x, y0: y, raw: { x, y }, path: [{ x, y }], drag: false, ox: x, sx0: sx, maxD: 0 };
        lastStart = { x, y };
        v = { text: '누르는 중…', color: COL.blue };
      },
      move(id, x, y) {
        if (!press || press.id !== id) return;
        press.raw = { x, y };
        if (env.demo() || env.prm.jit <= 0) handle(x, y);
      },
      up(id) {
        if (!press || press.id !== id) return;
        const p = press;
        press = null;
        lastPath = p.path;
        if (!p.drag) {
          const i = tileAt(p.x0);
          if (i >= 0) {
            sel = i;
            pulse = 0.5;
            v = { text: `누름 → ${i + 1}번 고름`, color: COL.on };
          } else v = { text: '누름 (빈 곳)', color: COL.dim };
        } else if (p.maxD < 14) v = { text: '끌기로 판정 — 누름 사라짐', color: COL.off };
        else v = { text: '끌기 → 넘기기', color: COL.blue };
        ex = [`최대 움직임 ${p.maxD.toFixed(1)}px (문턱 ${env.on() ? env.prm.slop : 0}px)`, p.drag ? (p.maxD < 14 ? '손 떨림인데 끌기로 오해' : '일부러 끈 것 — 넘기기') : '문턱 안 — 누름으로 인정'];
      },
      cancel(id) {
        if (press && press.id === id) press = null;
      },
      step(dt) {
        pulse = Math.max(0, pulse - dt);
        if (press && !env.demo() && env.prm.jit > 0) {
          const t = env.now();
          const a = env.prm.jit / 5;
          handle(press.raw.x + jx(t) * a, press.raw.y + jy(t) * a);
        }
      },
      draw(g) {
        const on = env.on();
        txt(g, '고르기 · 옆으로 끌면 넘기기', 150, 92, 11, COL.dim, 'center', 600);
        board(g, VX - 6, TY - 8, VWd + 12, TH + 16);
        g.save();
        rr(g, VX, TY - 4, VWd, TH + 8, 9);
        g.clip();
        for (let i = 0; i < NT; i++) {
          const x = VX + sx + GAP + i * (TW + GAP);
          const isSel = i === sel;
          const sc = isSel && pulse > 0 ? 1 + Math.sin((pulse / 0.5) * Math.PI) * 0.06 : 1;
          g.save();
          g.translate(x + TW / 2, TY + TH / 2);
          g.scale(sc, sc);
          rr(g, -TW / 2, -TH / 2 + 4, TW, TH - 8, 12);
          const gr = g.createLinearGradient(0, -TH / 2, 0, TH / 2);
          gr.addColorStop(0, HUES[i]!);
          gr.addColorStop(1, 'rgba(20,24,50,0.9)');
          g.fillStyle = gr;
          g.fill();
          if (isSel) {
            g.lineWidth = 3;
            g.strokeStyle = COL.gold;
            g.stroke();
          }
          disc(g, 0, -4, 18, 'rgba(255,255,255,0.92)');
          txt(g, String(i + 1), 0, -3, 18, '#1d2346', 'center', 800);
          if (isSel) {
            disc(g, TW / 2 - 12, -TH / 2 + 16, 8, COL.gold);
            g.beginPath();
            g.moveTo(TW / 2 - 16, -TH / 2 + 16);
            g.lineTo(TW / 2 - 13, -TH / 2 + 19);
            g.lineTo(TW / 2 - 8, -TH / 2 + 13);
            g.lineWidth = 2;
            g.strokeStyle = '#3b2a00';
            g.stroke();
          }
          g.restore();
        }
        g.restore();
        // 문턱 원 + 자취
        const start = press ? { x: press.x0, y: press.y0 } : lastStart;
        const pts = press ? press.path : lastPath;
        if (start) {
          if (on) {
            disc(g, start.x, start.y, env.prm.slop, rgba(COL.on, 0.1));
            ring(g, start.x, start.y, env.prm.slop, COL.on, 1.4, [3, 2]);
          } else disc(g, start.x, start.y, 2.5, COL.off);
        }
        // 확대 창 (×5)
        const IX = 92;
        const IY = 226;
        const IW = 116;
        const IH = 66;
        const Z = 3;
        rr(g, IX, IY, IW, IH, 9);
        g.fillStyle = 'rgba(5,8,20,0.75)';
        g.fill();
        g.lineWidth = 1;
        g.strokeStyle = 'rgba(160,180,255,0.25)';
        g.stroke();
        txt(g, `확대 ×${Z}`, IX + 6, IY + 9, 8.5, COL.dim, 'left', 700);
        if (start) {
          g.save();
          rr(g, IX, IY, IW, IH, 9);
          g.clip();
          const cx = IX + IW / 2;
          const cy = IY + IH / 2 + 4;
          if (on) ring(g, cx, cy, env.prm.slop * Z, COL.on, 1.4, [4, 3]);
          else disc(g, cx, cy, 2.5, COL.off);
          if (pts.length > 1) {
            g.beginPath();
            pts.forEach((p, i) => {
              const x = cx + (p.x - start.x) * Z;
              const y = cy + (p.y - start.y) * Z;
              if (i) g.lineTo(x, y);
              else g.moveTo(x, y);
            });
            g.lineWidth = 1.6;
            g.lineJoin = 'round';
            g.strokeStyle = '#ffb35c';
            g.stroke();
          }
          g.restore();
        }
      },
      verdict: () => v,
      extra: () => [...(ex.length ? ex : ['누른 점에서 문턱 거리 안이면 누름']), env.on() ? '문턱을 넘은 순간부터 끌기 (튀지 않게 그 자리 기준)' : '1px만 움직여도 끌기 — 아이 손 · 폰에서 실수'],
    };
  },
  controls: (p) => [
    { type: 'range', label: '누름 문턱 (px)', min: 2, max: 30, step: 1, value: p.slop, on: (v) => (p.slop = v) },
    { type: 'range', label: '손 떨림 흉내 (직접 해 볼 때, px)', min: 0, max: 8, step: 0.5, value: p.jit, on: (v) => (p.jit = v) },
  ],
});

export const DEMOS: DemoMap = { i418, i419, i420, i421, i422, i423, i424, i425 };

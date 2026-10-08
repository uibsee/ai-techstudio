import type { Control, Demo2D, DemoMap } from './types';

/**
 * 2D 움직임 · 충돌 견본 (i282 ~ i293).
 * 모두 캔버스 2D 에서 진짜 물리를 고정 간격(fixed timestep)으로 돌린다. 카드에서는 스스로 움직이고(대본 · 꼬마 AI),
 * 자세히 보기(폭 500 넘음)에서는 손 · 글쇠로 만질 수 있다. 「충돌 모양 보기」 같은 디버그 겹침은 조절판에서 켠다.
 * 좌표: 280 × 175 세계를 화면에 맞춰 키워 가운데 둔다 (u = min(w/280, h/175)).
 */

type G = CanvasRenderingContext2D;
const F = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
const TAU = Math.PI * 2;

const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
const clamp01 = (x: number): number => clamp(x, 0, 1);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

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
function reset(g: G): void {
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.lineWidth = 1;
  g.setLineDash([]);
  g.lineCap = 'butt';
  g.lineJoin = 'miter';
  g.shadowBlur = 0;
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
function pill(g: G, s: string, x: number, y: number, size: number, fill: string, fg = '#fff', align: 'center' | 'left' | 'right' = 'center'): number {
  g.font = `800 ${size}px ${F}`;
  const tw = g.measureText(s).width;
  const ph = size * 1.6;
  const pw = tw + size * 1.2;
  const x0 = align === 'center' ? x - pw / 2 : align === 'left' ? x : x - pw;
  rr(g, x0, y - ph / 2, pw, ph, ph / 2);
  g.fillStyle = fill;
  g.fill();
  txt(g, s, x0 + pw / 2, y + size * 0.05, size, fg, 'center', 800);
  return pw;
}
function arrow(g: G, x0: number, y0: number, x1: number, y1: number, color: string, wdt = 1.4, head = 4): void {
  const a = Math.atan2(y1 - y0, x1 - x0);
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = wdt;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1 - Math.cos(a) * head * 0.6, y1 - Math.sin(a) * head * 0.6);
  g.stroke();
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x1 - Math.cos(a - 0.5) * head, y1 - Math.sin(a - 0.5) * head);
  g.lineTo(x1 - Math.cos(a + 0.5) * head, y1 - Math.sin(a + 0.5) * head);
  g.closePath();
  g.fill();
}

/* ───────── 화면 맞추기 · 입력 · 고정 간격 ───────── */

interface View {
  u: number;
  ox: number;
  oy: number;
  big: boolean;
}
function viewOf(w: number, h: number): View {
  const u = Math.min(w / 280, h / 175);
  return { u, ox: (w - 280 * u) / 2, oy: (h - 175 * u) / 2, big: w > 500 };
}
function enter(g: G, v: View): void {
  g.save();
  g.translate(v.ox, v.oy);
  g.scale(v.u, v.u);
}
function fillBg(g: G, w: number, h: number, a: string, b: string): void {
  reset(g);
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, a);
  gr.addColorStop(1, b);
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
}

interface PEvt {
  k: 'down' | 'up';
  x: number;
  y: number;
}
/** 자세히 보기에서만 붙는 포인터 · 글쇠 (세계 좌표로 바꿔 준다) */
class Input {
  el: HTMLCanvasElement | null = null;
  v: View = { u: 1, ox: 0, oy: 0, big: false };
  x = -999;
  y = -999;
  down = false;
  inside = false;
  ev: PEvt[] = [];
  keys = new Set<string>();
  hits = new Set<string>();
  lastKey = -1e9;
  constructor(private wantKeys: string[] = []) {}
  sync(g: G, v: View): void {
    this.v = v;
    if (!v.big) return;
    const c = g.canvas as HTMLCanvasElement;
    if (this.el === c) return;
    this.dispose();
    this.el = c;
    c.addEventListener('pointerdown', this.pd);
    c.addEventListener('pointermove', this.pm);
    c.addEventListener('pointerleave', this.pl);
    window.addEventListener('pointerup', this.pu);
    if (this.wantKeys.length) {
      window.addEventListener('keydown', this.kd);
      window.addEventListener('keyup', this.ku);
    }
  }
  private pos(e: PointerEvent): void {
    const r = this.el!.getBoundingClientRect();
    this.x = (e.clientX - r.left - this.v.ox) / this.v.u;
    this.y = (e.clientY - r.top - this.v.oy) / this.v.u;
    this.inside = true;
  }
  private pd = (e: PointerEvent): void => {
    this.pos(e);
    this.down = true;
    this.ev.push({ k: 'down', x: this.x, y: this.y });
    e.preventDefault();
  };
  private pm = (e: PointerEvent): void => this.pos(e);
  private pl = (): void => {
    this.inside = false;
  };
  private pu = (): void => {
    if (!this.down) return;
    this.down = false;
    this.ev.push({ k: 'up', x: this.x, y: this.y });
  };
  private kd = (e: KeyboardEvent): void => {
    if (!this.wantKeys.includes(e.code)) return;
    const tgt = e.target as HTMLElement | null;
    if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA')) return;
    e.preventDefault();
    if (!this.keys.has(e.code)) this.hits.add(e.code);
    this.keys.add(e.code);
    this.lastKey = performance.now();
  };
  private ku = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };
  take(): PEvt[] {
    const e = this.ev;
    this.ev = [];
    return e;
  }
  key(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }
  /** 마지막 글쇠 뒤 몇 초 */
  idle(): number {
    return (performance.now() - this.lastKey) / 1000;
  }
  dispose(): void {
    if (!this.el) return;
    const c = this.el;
    c.removeEventListener('pointerdown', this.pd);
    c.removeEventListener('pointermove', this.pm);
    c.removeEventListener('pointerleave', this.pl);
    window.removeEventListener('pointerup', this.pu);
    window.removeEventListener('keydown', this.kd);
    window.removeEventListener('keyup', this.ku);
    this.el = null;
  }
}

/** 고정 간격 물리: 화면 프레임이 들쭉날쭉해도 h 초씩 똑같이 */
function fixed(h: number): (dt: number, f: (h: number) => void) => number {
  let acc = 0;
  return (dt, f) => {
    acc += Math.min(Math.max(dt, 0), 0.1);
    let n = 0;
    while (acc >= h && n < 40) {
      f(h);
      acc -= h;
      n++;
    }
    if (n >= 40) acc = 0;
    return acc / h;
  };
}

/* 작은 알갱이 */
interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  grav: number;
  drag?: number;
}
function stepParts(ps: Part[], h: number): void {
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i]!;
    p.life -= h;
    if (p.life <= 0) {
      ps.splice(i, 1);
      continue;
    }
    const d = p.drag ?? 0.985;
    p.vx *= Math.pow(d, h * 60);
    p.vy = p.vy * Math.pow(d, h * 60) + p.grav * h;
    p.x += p.vx * h;
    p.y += p.vy * h;
  }
}
function drawParts(g: G, ps: Part[], add = false): void {
  if (add) g.globalCompositeOperation = 'lighter';
  for (const p of ps) {
    const k = p.life / p.max;
    g.globalAlpha = clamp01(k * 1.6);
    g.fillStyle = p.color;
    g.beginPath();
    g.arc(p.x, p.y, Math.max(0.2, p.size * (0.4 + 0.6 * k)), 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}

/** 동글 캐릭터 몸 (발 = x,y 아래 가운데) */
function blob(g: G, x: number, y: number, w: number, hgt: number, face: number, c1: string, c2: string, mood: 'ok' | 'hurt' | 'happy' = 'ok', ears = false): void {
  g.save();
  g.translate(x, y);
  // 그림자
  g.fillStyle = 'rgba(0,0,0,.18)';
  g.beginPath();
  g.ellipse(0, 0.4, w * 0.55, 1.3, 0, 0, TAU);
  g.fill();
  if (ears) {
    g.fillStyle = c2;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * w * 0.42, -hgt * 0.78);
      g.lineTo(s * w * 0.3, -hgt * 1.12);
      g.lineTo(s * w * 0.06, -hgt * 0.9);
      g.closePath();
      g.fill();
    }
  }
  const gr = g.createLinearGradient(0, -hgt, 0, 0);
  gr.addColorStop(0, c1);
  gr.addColorStop(1, c2);
  rr(g, -w / 2, -hgt, w, hgt, Math.min(w, hgt) * 0.48);
  g.fillStyle = gr;
  g.fill();
  g.lineWidth = 0.8;
  g.strokeStyle = 'rgba(40,20,40,.55)';
  g.stroke();
  // 빛
  g.fillStyle = 'rgba(255,255,255,.55)';
  g.beginPath();
  g.ellipse(-w * 0.2, -hgt * 0.76, w * 0.12, hgt * 0.09, -0.5, 0, TAU);
  g.fill();
  // 눈
  const ex = face * w * 0.12;
  const ey = -hgt * 0.56;
  if (mood === 'hurt') {
    g.strokeStyle = '#2a1830';
    g.lineWidth = 0.8;
    for (const s of [-1, 1]) {
      const cx = ex + s * w * 0.18;
      g.beginPath();
      g.moveTo(cx - 1.1, ey - 1.1);
      g.lineTo(cx + 1.1, ey + 1.1);
      g.moveTo(cx + 1.1, ey - 1.1);
      g.lineTo(cx - 1.1, ey + 1.1);
      g.stroke();
    }
  } else {
    for (const s of [-1, 1]) {
      const cx = ex + s * w * 0.18;
      g.fillStyle = '#fff';
      g.beginPath();
      g.ellipse(cx, ey, w * 0.11, hgt * 0.13, 0, 0, TAU);
      g.fill();
      g.fillStyle = '#2a1830';
      g.beginPath();
      g.arc(cx + face * w * 0.03, ey + (mood === 'happy' ? -0.2 : 0.2), w * 0.065, 0, TAU);
      g.fill();
    }
  }
  g.fillStyle = 'rgba(255,120,150,.55)';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(ex + s * w * 0.3, -hgt * 0.36, w * 0.08, hgt * 0.045, 0, 0, TAU);
    g.fill();
  }
  g.restore();
}

/* ═══════════ i282 플랫폼 점프 손맛 ═══════════ */

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Feel {
  coyote: boolean;
  buffer: boolean;
  variable: boolean;
}
interface PLevel {
  solids: Rect[];
  spikes: Rect[];
  pitY: number;
  goalX: number;
}
interface Hero {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  ground: boolean;
  coy: number;
  buf: number;
  pressT: number;
  held: boolean;
  jumping: boolean;
  dead: '' | 'pit' | 'spike';
  deadT: number;
  squash: number;
  face: number;
  blocked: number;
  win: boolean;
  trail: { x: number; y: number }[];
  pops: { s: string; x: number; y: number; t: number; c: string }[];
  dust: Part[];
}
const PF = { G: 900, JUMP: 300, RUN: 100, COY: 0.1, BUF: 0.12, CUT: 0.4, HW: 6, HH: 14 };
function newHero(x: number, y: number): Hero {
  return { x, y, vx: 0, vy: 0, t: 0, ground: false, coy: 0, buf: 0, pressT: -9, held: false, jumping: false, dead: '', deadT: 0, squash: 0, face: 1, blocked: 0, win: false, trail: [], pops: [], dust: [] };
}
function hit(s: Hero, r: Rect): boolean {
  return s.x - PF.HW < r.x + r.w && s.x + PF.HW > r.x && s.y - PF.HH < r.y + r.h && s.y > r.y;
}
function puff(s: Hero, n: number, sp: number): void {
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (i / (n - 1 || 1)) * Math.PI;
    s.dust.push({ x: s.x, y: s.y - 1, vx: Math.cos(a) * sp * (0.6 + Math.random() * 0.5), vy: Math.sin(a) * sp * 0.25 - 8, life: 0.35, max: 0.35, size: 2.2, color: 'rgba(255,255,255,.9)', grav: 20 });
  }
}
function heroStep(s: Hero, h: number, l: boolean, r: boolean, j: boolean, feel: Feel, lv: PLevel): void {
  stepParts(s.dust, h);
  for (const p of s.pops) p.t += h;
  s.pops = s.pops.filter((p) => p.t < 0.9);
  s.squash *= Math.pow(0.0005, h);
  if (s.dead) {
    s.deadT += h;
    if (s.dead === 'pit') s.y += 25 * h;
    return;
  }
  s.t += h;
  const edge = j && !s.held;
  s.held = j;
  const tv = ((r ? 1 : 0) - (l ? 1 : 0)) * PF.RUN;
  s.vx = lerp(s.vx, tv, 1 - Math.pow(0.0001, h));
  if (Math.abs(tv - s.vx) < 2) s.vx = tv;
  if (tv) s.face = tv > 0 ? 1 : -1;
  if (edge) {
    s.buf = feel.buffer ? PF.BUF : h * 0.5;
    s.pressT = s.t;
  }
  if (s.ground) s.coy = feel.coyote ? PF.COY : 0;
  else s.coy -= h;
  if (s.buf > 0 && (s.ground || s.coy > 0)) {
    if (!s.ground) s.pops.push({ s: '코요테!', x: s.x, y: s.y - 18, t: 0, c: '#ffb020' });
    else if (s.t - s.pressT > h * 1.5) s.pops.push({ s: '버퍼!', x: s.x, y: s.y - 18, t: 0, c: '#25c2ff' });
    s.vy = -PF.JUMP;
    s.ground = false;
    s.coy = 0;
    s.buf = 0;
    s.jumping = true;
    s.squash = -0.35;
    puff(s, 4, 40);
  }
  s.buf -= h;
  if (s.jumping && !s.held && s.vy < 0) {
    if (feel.variable) {
      s.vy *= PF.CUT;
      s.pops.push({ s: '짧게!', x: s.x, y: s.y - 18, t: 0, c: '#ff5fa2' });
    }
    s.jumping = false;
  }
  if (s.vy >= 0) s.jumping = false;
  s.vy = Math.min(s.vy + PF.G * h, 520);
  // 가로
  s.x += s.vx * h;
  for (const q of lv.solids) {
    if (!hit(s, q)) continue;
    if (s.vx > 0) s.x = q.x - PF.HW;
    else if (s.vx < 0) s.x = q.x + q.w + PF.HW;
    s.blocked += h;
  }
  // 세로
  const was = s.ground;
  const vy0 = s.vy;
  s.ground = false;
  s.y += s.vy * h;
  for (const q of lv.solids) {
    if (!hit(s, q)) continue;
    if (s.vy > 0) {
      s.y = q.y;
      s.ground = true;
      s.vy = 0;
      if (!was) {
        s.squash = clamp(vy0 / 450, 0.15, 0.6);
        puff(s, 5, 30 + vy0 * 0.08);
      }
    } else if (s.vy < 0) {
      s.y = q.y + q.h + PF.HH;
      s.vy = 0;
    }
  }
  for (const q of lv.spikes) if (hit(s, q)) s.dead = 'spike';
  if (s.y > lv.pitY) s.dead = 'pit';
  if (s.dead) {
    s.deadT = 0;
    s.pops.push({ s: s.dead === 'pit' ? '풍덩!' : '아야!', x: s.x, y: s.y - 20, t: 0, c: '#ff4d6d' });
  }
  if (!s.win && s.x > lv.goalX && s.ground) s.win = true;
  if (Math.floor(s.t * 30) !== Math.floor((s.t - h) * 30)) {
    s.trail.push({ x: s.x, y: s.y - PF.HH / 2 });
    if (s.trail.length > 40) s.trail.shift();
  }
}

interface Scn {
  name: string;
  tip: string;
  lv: PLevel;
  sx: number;
  sy: number;
  dur: number;
  press: number;
  hold: number;
}
function scnLevels(): Scn[] {
  const coy: Scn = {
    name: '① 코요테 타임',
    tip: '발판을 막 벗어난 뒤 눌러도 점프',
    lv: { solids: [{ x: -20, y: 110, w: 220, h: 40 }, { x: 262, y: 110, w: 160, h: 40 }], spikes: [], pitY: 140, goalX: 268 },
    sx: 60,
    sy: 110,
    dur: 3.1,
    press: 0,
    hold: 0.3,
  };
  const buf: Scn = {
    name: '② 점프 버퍼',
    tip: '땅에 닿기 직전에 누른 점프를 기억',
    lv: { solids: [{ x: -20, y: 22, w: 56, h: 88 }, { x: -20, y: 110, w: 150, h: 40 }, { x: 130, y: 84, w: 290, h: 66 }], spikes: [], pitY: 140, goalX: 140 },
    sx: 26,
    sy: 22,
    dur: 2.9,
    press: 0,
    hold: 0.3,
  };
  const vari: Scn = {
    name: '③ 가변 점프',
    tip: '짧게 누르면 낮게 — 가시 천장 밑 통과',
    lv: {
      solids: [{ x: -20, y: 110, w: 440, h: 40 }, { x: 150, y: 100, w: 10, h: 10 }, { x: 104, y: 36, w: 100, h: 18 }],
      spikes: [{ x: 106, y: 54, w: 96, h: 9 }],
      pitY: 140,
      goalX: 176,
    },
    sx: 40,
    sy: 110,
    dur: 2.8,
    press: 0,
    hold: 0.07,
  };
  const off: Feel = { coyote: false, buffer: false, variable: false };
  const H = 1 / 120;
  // 대본 시각을 실제로 굴려서 찾는다
  {
    const s = newHero(coy.sx, coy.sy);
    s.ground = true;
    for (let i = 0; i < 600 && s.ground; i++) heroStep(s, H, false, true, false, off, coy.lv);
    coy.press = s.t + 0.07;
  }
  {
    const s = newHero(buf.sx, buf.sy);
    s.ground = true;
    let left = false;
    for (let i = 0; i < 600; i++) {
      heroStep(s, H, false, true, false, off, buf.lv);
      if (!s.ground) left = true;
      if (left && s.ground) break;
    }
    buf.press = s.t - 0.09;
  }
  {
    const s = newHero(vari.sx, vari.sy);
    s.ground = true;
    for (let i = 0; i < 600 && s.x < 136; i++) heroStep(s, H, false, true, false, off, vari.lv);
    vari.press = s.t;
  }
  return [coy, buf, vari];
}
const PLAY: PLevel = {
  solids: [
    { x: -40, y: 110, w: 160, h: 40 },
    { x: 165, y: 110, w: 90, h: 40 },
    { x: 255, y: 86, w: 60, h: 64 },
    { x: 315, y: 110, w: 125, h: 40 },
    { x: 26, y: 34, w: 74, h: 14 },
  ],
  spikes: [{ x: 28, y: 48, w: 70, h: 8 }],
  pitY: 140,
  goalX: 9999,
};

function drawWorldLane(g: G, lv: PLevel, t: number, seed: number): void {
  // 하늘
  const sk = g.createLinearGradient(0, 0, 0, 130);
  sk.addColorStop(0, '#7cc8ff');
  sk.addColorStop(1, '#dff4ff');
  g.fillStyle = sk;
  g.fillRect(0, 0, 400, 130);
  // 구름
  g.fillStyle = 'rgba(255,255,255,.85)';
  for (let i = 0; i < 3; i++) {
    const cx = ((i * 157 + seed * 40 + t * 6) % 480) - 40;
    const cy = 18 + i * 13;
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      g.arc(cx + k * 9, cy - (k === 1 ? 4 : 0), 7 + (k === 1 ? 2 : 0), 0, TAU);
      g.fill();
    }
  }
  // 언덕
  for (let layer = 0; layer < 2; layer++) {
    g.fillStyle = layer ? '#9fe0a8' : '#c6efc9';
    g.beginPath();
    g.moveTo(0, 130);
    for (let x = 0; x <= 400; x += 10) g.lineTo(x, 84 + layer * 12 - Math.sin(x * 0.02 + layer * 2 + seed) * 10 - Math.sin(x * 0.047) * 5);
    g.lineTo(400, 130);
    g.fill();
  }
  // 물 (구덩이 바닥)
  const wg = g.createLinearGradient(0, 118, 0, 130);
  wg.addColorStop(0, '#4fb3ff');
  wg.addColorStop(1, '#2a74d8');
  g.fillStyle = wg;
  g.beginPath();
  g.moveTo(0, 130);
  for (let x = 0; x <= 400; x += 8) g.lineTo(x, 121 + Math.sin(x * 0.15 + t * 3) * 1.2);
  g.lineTo(400, 130);
  g.fill();
  // 천장 · 가시
  for (const s of lv.spikes) {
    g.fillStyle = '#e9eef6';
    g.strokeStyle = '#7a8496';
    g.lineWidth = 0.7;
    const n = Math.max(1, Math.round(s.w / 8));
    const sw = s.w / n;
    for (let i = 0; i < n; i++) {
      g.beginPath();
      g.moveTo(s.x + i * sw, s.y);
      g.lineTo(s.x + i * sw + sw / 2, s.y + s.h);
      g.lineTo(s.x + (i + 1) * sw, s.y);
      g.closePath();
      g.fill();
      g.stroke();
    }
  }
  // 땅
  for (const q of lv.solids) {
    const floating = q.h < 30 && q.y < 60;
    const body = g.createLinearGradient(0, q.y, 0, q.y + q.h);
    body.addColorStop(0, floating ? '#a3a9b8' : '#c98a55');
    body.addColorStop(1, floating ? '#6e7586' : '#8a5530');
    rr(g, q.x, q.y, q.w, q.h + (floating ? 0 : 6), floating ? 3 : 4);
    g.fillStyle = body;
    g.fill();
    g.strokeStyle = floating ? '#525868' : '#6a3d22';
    g.lineWidth = 0.8;
    g.stroke();
    if (floating) {
      g.strokeStyle = 'rgba(0,0,0,.18)';
      for (let x = q.x + 10; x < q.x + q.w; x += 14) {
        g.beginPath();
        g.moveTo(x, q.y + 1);
        g.lineTo(x, q.y + q.h - 1);
        g.stroke();
      }
      continue;
    }
    // 돌 점
    const R = rng(q.x * 7 + q.y);
    g.fillStyle = 'rgba(90,50,25,.35)';
    for (let i = 0; i < q.w / 9; i++) {
      g.beginPath();
      g.ellipse(q.x + 4 + R() * (q.w - 8), q.y + 10 + R() * (q.h - 12), 1.6, 1, 0, 0, TAU);
      g.fill();
    }
    // 풀
    g.fillStyle = '#5fcf5a';
    rr(g, q.x - 0.5, q.y - 1, q.w + 1, 6, 3);
    g.fill();
    for (let x = q.x + 2; x < q.x + q.w - 1; x += 5) {
      g.beginPath();
      g.arc(x, q.y + 4.5, 2.2, 0, Math.PI);
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,.45)';
    g.fillRect(q.x + 2, q.y, q.w - 4, 1);
  }
}

function drawHeroLane(g: G, s: Hero, c1: string, c2: string, debug: boolean): void {
  // 자취
  for (let i = 0; i < s.trail.length; i++) {
    const p = s.trail[i]!;
    g.fillStyle = `rgba(255,255,255,${(0.08 + (i / s.trail.length) * 0.4).toFixed(3)})`;
    g.beginPath();
    g.arc(p.x, p.y, 1.1, 0, TAU);
    g.fill();
  }
  drawParts(g, s.dust);
  const sq = s.squash;
  const sx = 1 + sq * 0.5;
  const sy = 1 - sq * 0.45;
  const stretch = s.ground ? 0 : clamp(-s.vy / 900, -0.12, 0.25);
  blob(g, s.x, s.y + (s.dead === 'pit' ? 2 : 0), 12 * sx * (1 - stretch * 0.5), 14 * sy * (1 + stretch), s.face, c1, c2, s.dead ? 'hurt' : s.win ? 'happy' : 'ok');
  if (s.dead === 'pit') {
    g.fillStyle = 'rgba(80,170,255,.8)';
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.45;
      const k = Math.min(1, s.deadT * 3);
      g.beginPath();
      g.arc(s.x + Math.cos(a) * 9 * k, 120 + Math.sin(a) * 10 * k + s.deadT * s.deadT * 30, 1.6, 0, TAU);
      g.fill();
    }
  }
  for (const p of s.pops) {
    const k = p.t / 0.9;
    g.globalAlpha = clamp01(1.4 - k * 1.4);
    pill(g, p.s, p.x, p.y - k * 10, 7, p.c, '#fff');
    g.globalAlpha = 1;
  }
  if (debug) {
    g.strokeStyle = '#00e5ff';
    g.lineWidth = 0.8;
    g.strokeRect(s.x - PF.HW, s.y - PF.HH, PF.HW * 2, PF.HH);
    const bar = (v: number, max: number, y: number, c: string, lab: string): void => {
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(s.x - 12, y, 24, 3);
      g.fillStyle = c;
      g.fillRect(s.x - 12, y, 24 * clamp01(v / max), 3);
      txt(g, lab, s.x - 14, y + 1.5, 4.5, c, 'right', 800);
    };
    bar(s.coy, PF.COY, s.y - 26, '#ffb020', '코요테');
    bar(s.buf, PF.BUF, s.y - 31, '#25c2ff', '버퍼');
  }
}

const i282: Demo2D = {
  kind: '2d',
  caption: '같은 입력, 위는 손맛 켬 · 아래는 끔 — 코요테 · 버퍼 · 가변 점프가 성공과 실패를 가른다',
  make() {
    const inp = new Input(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space', 'KeyZ', 'KeyA', 'KeyD', 'KeyW']);
    const feel: Feel = { coyote: true, buffer: true, variable: true };
    const OFF: Feel = { coyote: false, buffer: false, variable: false };
    let debug = false;
    const scns = scnLevels();
    let si = 0;
    let st = 0;
    let heroes: [Hero, Hero] = [newHero(0, 0), newHero(0, 0)];
    const start = (): void => {
      const s = scns[si]!;
      st = 0;
      heroes = [newHero(s.sx, s.sy), newHero(s.sx, s.sy)];
      heroes[0].ground = heroes[1].ground = true;
    };
    start();
    let me = newHero(40, 110);
    let manual = false;
    const step = fixed(1 / 120);
    let time = 0;
    const controls: Control[] = [
      { type: 'toggle', label: '코요테 타임', value: true, on: (v) => (feel.coyote = v) },
      { type: 'toggle', label: '점프 버퍼', value: true, on: (v) => (feel.buffer = v) },
      { type: 'toggle', label: '가변 점프', value: true, on: (v) => (feel.variable = v) },
      { type: 'toggle', label: '충돌 상자 · 타이머 보기', value: false, on: (v) => (debug = v) },
    ];
    const lane = (y0: number, s: Hero, lv: PLevel, label: string, on: boolean, keyOn: boolean, sc: number, x0: number): void => {
      g0!.save();
      g0!.translate(x0, y0);
      g0!.scale(sc, sc);
      rr(g0!, 0, 0, 400, 130, 9);
      g0!.save();
      g0!.clip();
      drawWorldLane(g0!, lv, time, on ? 0 : 3);
      drawHeroLane(g0!, s, on ? '#ffd27a' : '#d9c8ff', on ? '#ff8a3d' : '#8f7ad8', debug);
      g0!.restore();
      g0!.lineWidth = 1.6;
      g0!.strokeStyle = on ? 'rgba(255,200,90,.9)' : 'rgba(180,170,220,.7)';
      rr(g0!, 0, 0, 400, 130, 9);
      g0!.stroke();
      pill(g0!, label, 8, 12, 9, on ? '#ff8a3d' : '#6f6a8f', '#fff', 'left');
      // 점프 글쇠
      rr(g0!, 352, 5, 40, 15, 4);
      g0!.fillStyle = keyOn ? '#ffe066' : 'rgba(255,255,255,.75)';
      g0!.fill();
      g0!.strokeStyle = keyOn ? '#c79200' : 'rgba(60,60,90,.5)';
      g0!.stroke();
      txt(g0!, '점프', 372, 12.8, 8, keyOn ? '#5a3c00' : '#5a5a78', 'center', 800);
      // 결과
      const fail = s.dead !== '' || (!manual && st > scns[si]!.dur - 0.7 && !s.win);
      if (!manual && (s.win || fail)) {
        g0!.globalAlpha = 0.95;
        pill(g0!, s.win ? '성공!' : '실패', 200, 66, 16, s.win ? '#2fbf71' : '#ff4d6d');
        g0!.globalAlpha = 1;
      }
      g0!.restore();
    };
    let g0: G | null = null;
    return {
      controls,
      draw(g, w, h, _t, dt) {
        g0 = g;
        const v = viewOf(w, h);
        inp.sync(g, v);
        time += dt;
        if (v.big && inp.idle() < 0.05 && !manual) {
          manual = true;
          me = newHero(40, 110);
          me.ground = true;
        }
        if (manual && inp.idle() > 8) {
          manual = false;
          start();
        }
        step(dt, (H) => {
          if (manual) {
            heroStep(me, H, inp.key('ArrowLeft', 'KeyA'), inp.key('ArrowRight', 'KeyD'), inp.key('Space', 'ArrowUp', 'KeyZ', 'KeyW'), feel, PLAY);
            if (me.x > 410) me.x = -8;
            if (me.x < -10) me.x = 408;
            if (me.dead && me.deadT > 0.8) {
              me = newHero(40, 110);
              me.ground = true;
            }
            return;
          }
          st += H;
          const s = scns[si]!;
          const j = st >= s.press && st < s.press + s.hold;
          heroStep(heroes[0], H, false, true, j, feel, s.lv);
          heroStep(heroes[1], H, false, true, j, OFF, s.lv);
          if (st > s.dur + 0.5) {
            si = (si + 1) % scns.length;
            start();
          }
        });
        fillBg(g, w, h, '#1d2240', '#2b2f57');
        enter(g, v);
        if (manual) {
          lane(22, me, PLAY, '직접 하기 · ← → 스페이스', true, me.held, 0.66, 8);
          txt(g, '켠 손맛: ' + [feel.coyote ? '코요테' : '', feel.buffer ? '버퍼' : '', feel.variable ? '가변' : ''].filter(Boolean).join(' · ') || '없음', 140, 9, 8, '#ffe8b0');
          txt(g, '구덩이 끝에서 늦게 · 착지 전에 미리 · 가시 밑에서 짧게 눌러 보세요', 140, 117, 7, 'rgba(255,255,255,.75)', 'center', 600);
        } else {
          const s = scns[si]!;
          const j = st >= s.press && st < s.press + s.hold;
          txt(g, s.name, 12, 8.5, 9, '#ffe08a', 'left', 800);
          txt(g, s.tip, 270, 8.5, 7.5, 'rgba(255,255,255,.8)', 'right', 600);
          lane(17, heroes[0], s.lv, '손맛 켬', true, j, 0.6, 20);
          lane(96, heroes[1], s.lv, '손맛 끔', false, j, 0.6, 20);
        }
        g.restore();
      },
      dispose() {
        inp.dispose();
      },
    };
  },
};

/* ═══════════ i283 타일 충돌 ═══════════ */

const T3 = 14;
const MAP3 = [
  '####################',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..-----......-----#',
  '#..................#',
  '#..................#',
  '#....../##\\........#',
  '#...../####\\....####',
  '####################',
  '####################',
  '####################',
];
const tile3 = (c: number, r: number): string => (c < 0 || c >= 20 || r < 0 || r >= 12 ? '#' : MAP3[r]![c]!);
const slope3 = (ch: string): boolean => ch === '/' || ch === '\\';
function surf3(ch: string, c: number, r: number, x: number): number {
  const fx = clamp01((x - c * T3) / T3);
  return r * T3 + T3 * (ch === '/' ? 1 - fx : fx);
}

const i283: Demo2D = {
  kind: '2d',
  caption: '가로로 먼저 움직여 벽에서 밀고(①), 그다음 세로로 움직여 바닥에서 민다(②) — 경사 · 한쪽 발판까지',
  make() {
    const inp = new Input(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyA', 'KeyD', 'KeyW', 'KeyS']);
    const HW = 5;
    const HH = 12;
    const GR = 700;
    const JV = 340;
    const RUN = 72;
    let debug = true;
    let slow = 1;
    const p = { x: 30, y: 126, vx: 0, vy: 0, ground: false, drop: 0, face: 1, sq: 0, onSlope: '' as string, slopeC: 0, slopeR: 0 };
    const ai = { dir: 1, cd: 1, stuck: 0, R: rng(7) };
    let chkX: [number, number, boolean][] = [];
    let chkY: [number, number, boolean][] = [];
    const pushes: { x: number; y: number; dx: number; dy: number; ax: 0 | 1; t: number }[] = [];
    let litX = 0;
    let litY = 0;
    const dust: Part[] = [];
    let mapC: HTMLCanvasElement | null = null;
    const step = fixed(1 / 120);
    const buildMap = (): HTMLCanvasElement => {
      const S = 3;
      const c = mkCanvas(280 * S, 168 * S);
      const g = c.getContext('2d')!;
      g.scale(S, S);
      const R = rng(11);
      const solidish = (ch: string): boolean => ch === '#' || slope3(ch);
      for (let r = 0; r < 12; r++)
        for (let cc = 0; cc < 20; cc++) {
          const ch = tile3(cc, r);
          const x = cc * T3;
          const y = r * T3;
          if (ch === '#') {
            const top = !solidish(tile3(cc, r - 1)) && r > 0;
            const edge = cc === 0 || cc === 19 || r === 0;
            g.fillStyle = edge ? '#4a3a5e' : r >= 9 && !top ? '#7a4c2e' : '#8c5a36';
            g.fillRect(x, y, T3, T3);
            g.fillStyle = edge ? '#574670' : '#9c6840';
            g.fillRect(x + 1, y + 1, T3 - 2, T3 - 2);
            g.fillStyle = 'rgba(0,0,0,.12)';
            g.fillRect(x + 1 + R() * 9, y + 3 + R() * 8, 3, 2);
            g.fillRect(x + 2 + R() * 9, y + 2 + R() * 8, 2, 2);
            if (edge) {
              g.fillStyle = 'rgba(255,255,255,.06)';
              g.fillRect(x + 1, y + 1, T3 - 2, 2);
            }
            if (top) {
              g.fillStyle = '#63d16a';
              g.fillRect(x, y, T3, 4);
              for (let k = 0; k < 4; k++) {
                g.beginPath();
                g.arc(x + 2 + k * 3.4, y + 4, 1.7, 0, Math.PI);
                g.fill();
              }
              g.fillStyle = '#a6f0a0';
              g.fillRect(x, y, T3, 1);
            }
          } else if (slope3(ch)) {
            g.fillStyle = '#9c6840';
            g.beginPath();
            if (ch === '/') {
              g.moveTo(x, y + T3);
              g.lineTo(x + T3, y);
              g.lineTo(x + T3, y + T3);
            } else {
              g.moveTo(x, y);
              g.lineTo(x + T3, y + T3);
              g.lineTo(x, y + T3);
            }
            g.closePath();
            g.fill();
            g.strokeStyle = '#63d16a';
            g.lineWidth = 4;
            g.lineCap = 'round';
            g.beginPath();
            if (ch === '/') {
              g.moveTo(x, y + T3 + 1);
              g.lineTo(x + T3, y + 1);
            } else {
              g.moveTo(x, y + 1);
              g.lineTo(x + T3, y + T3 + 1);
            }
            g.stroke();
            g.lineCap = 'butt';
          } else if (ch === '-') {
            g.fillStyle = '#c98f52';
            rr(g, x, y, T3, 5, 1.5);
            g.fill();
            g.fillStyle = '#e8b878';
            g.fillRect(x + 1, y + 0.7, T3 - 2, 1.2);
            g.strokeStyle = '#7a4f28';
            g.lineWidth = 0.6;
            g.strokeRect(x + 0.3, y + 0.3, T3 - 0.6, 4.4);
            if (tile3(cc - 1, r) !== '-' || tile3(cc + 1, r) !== '-') {
              g.fillStyle = '#7a4f28';
              g.fillRect(x + (tile3(cc - 1, r) !== '-' ? 3 : T3 - 5), y + 5, 2, 5);
            }
          }
        }
      return c;
    };
    const jump = (): void => {
      p.vy = -JV;
      p.ground = false;
      p.sq = -0.3;
    };
    const physics = (H: number, L: boolean, Rr: boolean, J: boolean, D: boolean): void => {
      const dir = (Rr ? 1 : 0) - (L ? 1 : 0);
      if (dir) p.face = dir;
      p.vx = dir * RUN;
      if (J && p.ground) jump();
      if (D && p.ground && tile3(Math.floor(p.x / T3), Math.floor((p.y + 1) / T3)) === '-') p.drop = 0.25;
      p.drop -= H;
      p.sq *= Math.pow(0.002, H);
      // ① 가로
      chkX = [];
      let blocked = false;
      if (p.vx !== 0) {
        p.x += p.vx * H;
        const top = p.y - HH;
        const bot = p.y - (p.ground ? 6 : 0.5);
        const lead = p.vx > 0 ? p.x + HW : p.x - HW;
        const c = Math.floor(lead / T3);
        for (let r = Math.floor(top / T3); r <= Math.floor(bot / T3); r++) {
          const s = tile3(c, r) === '#';
          chkX.push([c, r, s]);
          if (s && !blocked) {
            const nx = p.vx > 0 ? c * T3 - HW : (c + 1) * T3 + HW;
            pushes.push({ x: p.x + (p.vx > 0 ? HW : -HW), y: p.y - HH / 2, dx: nx - p.x - p.vx * 0.06, dy: 0, ax: 0, t: 0 });
            p.x = nx;
            blocked = true;
            litX = 0.35;
          }
        }
      }
      // ② 세로
      chkY = [];
      p.vy = Math.min(p.vy + GR * H, 480);
      const prev = p.y;
      p.y += p.vy * H;
      const was = p.ground;
      p.ground = false;
      p.onSlope = '';
      if (p.vy >= 0) {
        const cc = Math.floor(p.x / T3);
        const r = Math.floor((p.y - 0.001) / T3);
        let best = Infinity;
        for (let rr2 = r - 1; rr2 <= r + 1; rr2++) {
          const ch = tile3(cc, rr2);
          if (!slope3(ch)) continue;
          const s = surf3(ch, cc, rr2, p.x);
          const d = s - p.y;
          if ((d <= 0 && d > -T3) || (was && d < 7)) {
            if (Math.abs(d) < Math.abs(best - p.y)) {
              best = s;
              p.onSlope = ch;
              p.slopeC = cc;
              p.slopeR = rr2;
            }
          }
        }
        if (best !== Infinity) {
          chkY.push([p.slopeC, p.slopeR, true]);
          p.y = best;
          p.vy = 0;
          p.ground = true;
        } else {
          const cL = Math.floor((p.x - HW + 0.01) / T3);
          const cR = Math.floor((p.x + HW - 0.01) / T3);
          for (let c = cL; c <= cR; c++) {
            const ch = tile3(c, r);
            const one = ch === '-' && prev <= r * T3 + 0.5 && p.drop <= 0;
            const s = ch === '#' || one;
            chkY.push([c, r, s]);
            if (s && !p.ground) {
              if (p.y - r * T3 > 0.6) pushes.push({ x: p.x, y: p.y, dx: 0, dy: r * T3 - p.y - 4, ax: 1, t: 0 });
              if (p.y - r * T3 > 0.6) litY = 0.35;
              if (!was && p.vy > 200) {
                p.sq = 0.4;
                for (let k = 0; k < 4; k++) dust.push({ x: p.x, y: r * T3, vx: (k - 1.5) * 18, vy: -10, life: 0.3, max: 0.3, size: 1.8, color: 'rgba(255,255,255,.85)', grav: 20 });
              }
              p.y = r * T3;
              p.vy = 0;
              p.ground = true;
            }
          }
        }
      } else {
        const r = Math.floor((p.y - HH) / T3);
        const cL = Math.floor((p.x - HW + 0.01) / T3);
        const cR = Math.floor((p.x + HW - 0.01) / T3);
        for (let c = cL; c <= cR; c++) {
          const s = tile3(c, r) === '#';
          chkY.push([c, r, s]);
          if (s && p.vy < 0) {
            const ny = (r + 1) * T3 + HH;
            pushes.push({ x: p.x, y: p.y - HH, dx: 0, dy: ny - p.y + 4, ax: 1, t: 0 });
            p.y = ny;
            p.vy = 0;
            litY = 0.35;
          }
        }
      }
      return void blocked;
    };
    const aiStep = (H: number): [boolean, boolean, boolean, boolean] => {
      let J = false;
      let D = false;
      if (p.ground) {
        const ahead = tile3(Math.floor((p.x + ai.dir * (HW + 3)) / T3), Math.floor((p.y - 5) / T3));
        if (ahead === '#') J = true;
        ai.cd -= H;
        if (ai.cd < 0) {
          J = true;
          ai.cd = 1.1 + ai.R() * 1.6;
        }
        if (tile3(Math.floor(p.x / T3), Math.floor((p.y + 1) / T3)) === '-' && ai.R() < 0.006) D = true;
      }
      if (Math.abs(p.vx) < 1 && p.ground) ai.stuck += H;
      else ai.stuck = 0;
      if (p.x < 26) ai.dir = 1;
      if (p.x > 254) ai.dir = -1;
      if (ai.stuck > 0.5) {
        ai.dir = -ai.dir;
        ai.stuck = 0;
      }
      return [ai.dir < 0, ai.dir > 0, J, D];
    };
    let manualT = -1;
    return {
      controls: [
        { type: 'toggle', label: '검사한 칸 · 밀어낸 화살표', value: true, on: (v) => (debug = v) },
        { type: 'range', label: '느리게 보기', min: 0.15, max: 1, step: 0.05, value: 1, on: (v) => (slow = v) },
      ] as Control[],
      draw(g, w, h, _t, dt) {
        const v = viewOf(w, h);
        inp.sync(g, v);
        if (!mapC) mapC = buildMap();
        if (v.big && inp.idle() < 6) manualT = 1;
        else manualT = -1;
        step(dt * slow, (H) => {
          const a = manualT > 0 ? ([inp.key('ArrowLeft', 'KeyA'), inp.key('ArrowRight', 'KeyD'), inp.key('ArrowUp', 'Space', 'KeyW'), inp.key('ArrowDown', 'KeyS')] as [boolean, boolean, boolean, boolean]) : aiStep(H);
          physics(H, a[0], a[1], a[2], a[3]);
          for (const q of pushes) q.t += H;
          while (pushes.length && pushes[0]!.t > 0.45) pushes.shift();
          litX -= H;
          litY -= H;
          stepParts(dust, H);
        });
        // 배경
        fillBg(g, w, h, '#2a1f4e', '#5a3e7a');
        enter(g, v);
        const R = rng(3);
        g.fillStyle = 'rgba(255,255,255,.7)';
        for (let i = 0; i < 40; i++) {
          const s = 0.3 + R() * 0.7;
          g.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(_t * (0.5 + R()) + i));
          g.fillRect(R() * 280, R() * 110, s, s);
        }
        g.globalAlpha = 1;
        g.fillStyle = '#3d2c63';
        g.beginPath();
        g.moveTo(0, 130);
        for (let x = 0; x <= 280; x += 10) g.lineTo(x, 92 - Math.abs(Math.sin(x * 0.03)) * 30 - Math.sin(x * 0.11) * 4);
        g.lineTo(280, 175);
        g.lineTo(0, 175);
        g.fill();
        g.save();
        g.translate(0, 4);
        g.drawImage(mapC, 0, 0, 280, 168);
        if (debug) {
          for (const [c, r, s] of chkX) {
            g.fillStyle = s ? 'rgba(255,140,40,.45)' : 'rgba(255,140,40,.12)';
            g.fillRect(c * T3, r * T3, T3, T3);
            g.strokeStyle = 'rgba(255,160,60,.9)';
            g.lineWidth = 0.7;
            g.strokeRect(c * T3 + 0.4, r * T3 + 0.4, T3 - 0.8, T3 - 0.8);
          }
          for (const [c, r, s] of chkY) {
            g.fillStyle = s ? 'rgba(40,210,255,.42)' : 'rgba(40,210,255,.1)';
            g.fillRect(c * T3, r * T3, T3, T3);
            g.strokeStyle = 'rgba(80,220,255,.9)';
            g.lineWidth = 0.7;
            g.strokeRect(c * T3 + 0.4, r * T3 + 0.4, T3 - 0.8, T3 - 0.8);
          }
          // 한쪽 발판 표시
          g.fillStyle = 'rgba(255,240,180,.75)';
          for (let r = 0; r < 12; r++)
            for (let c = 0; c < 20; c++)
              if (tile3(c, r) === '-' && (c + r) % 2 === 0) {
                const x = c * T3 + 7;
                const y = r * T3 + 11 + ((_t * 6) % 3);
                g.beginPath();
                g.moveTo(x, y - 3);
                g.lineTo(x + 2, y);
                g.lineTo(x - 2, y);
                g.fill();
              }
        }
        drawParts(g, dust);
        // 캐릭터
        const sq = p.sq;
        blob(g, p.x, p.y, 11 * (1 + sq * 0.5), 12 * (1 - sq * 0.45), p.face, '#ffc58a', '#ff7b54', 'ok', true);
        if (debug) {
          g.strokeStyle = '#fff';
          g.lineWidth = 0.8;
          g.setLineDash([2, 1.5]);
          g.strokeRect(p.x - HW, p.y - HH, HW * 2, HH);
          g.setLineDash([]);
          for (const q of pushes) {
            const k = 1 - q.t / 0.45;
            g.globalAlpha = k;
            if (q.ax === 0) arrow(g, q.x, q.y, q.x + Math.sign(q.dx) * 9, q.y, '#ffa040', 1.6, 4);
            else arrow(g, q.x, q.y, q.x, q.y + Math.sign(q.dy) * 9, '#40d8ff', 1.6, 4);
            g.globalAlpha = 1;
          }
          if (p.onSlope) {
            const n = p.onSlope === '/' ? [-1, -1] : [1, -1];
            const l = Math.SQRT1_2 * 12;
            arrow(g, p.x, p.y, p.x + n[0]! * l, p.y + n[1]! * l, '#b6ff6a', 1.3, 3.5);
          }
        }
        g.restore();
        // 범례
        const chip = (x: number, s: string, on: boolean, c: string): void => {
          g.globalAlpha = on ? 1 : 0.55;
          pill(g, s, x, 10, 7, on ? c : 'rgba(20,14,40,.75)', '#fff', 'left');
          g.globalAlpha = 1;
        };
        chip(18, '① 가로 이동 → 밀기', litX > 0, '#ff8a2a');
        chip(98, '② 세로 이동 → 밀기', litY > 0, '#16b6e8');
        chip(178, p.onSlope ? '경사: 발 높이 맞춤' : '경사 · 한쪽 발판', !!p.onSlope, '#5fbf3a');
        if (v.big) txt(g, manualT > 0 ? '← → 걷기 · ↑ 점프 · ↓ 발판 내려가기' : '글쇠(← → ↑ ↓)로 직접 움직여 보세요', 140, 171, 6, 'rgba(255,255,255,.7)', 'center', 600);
        g.restore();
      },
      dispose() {
        inp.dispose();
      },
    };
  },
};

/* ═══════════ i284 분리축 충돌 (SAT) ═══════════ */

type Pt = [number, number];
function regular(n: number, r: number, rot = 0, sx = 1, sy = 1): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU;
    out.push([Math.cos(a) * r * sx, Math.sin(a) * r * sy]);
  }
  return out;
}
function place(loc: Pt[], x: number, y: number, a: number): Pt[] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return loc.map(([px, py]) => [x + px * c - py * s, y + px * s + py * c] as Pt);
}
function axesOf(P: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[i]!;
    const b = P[(i + 1) % P.length]!;
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const l = Math.hypot(ex, ey) || 1;
    out.push([ey / l, -ex / l]);
  }
  return out;
}
function proj(P: Pt[], n: Pt): [number, number, number, number] {
  let mn = Infinity;
  let mx = -Infinity;
  let imn = 0;
  let imx = 0;
  P.forEach((p, i) => {
    const d = p[0] * n[0] + p[1] * n[1];
    if (d < mn) {
      mn = d;
      imn = i;
    }
    if (d > mx) {
      mx = d;
      imx = i;
    }
  });
  return [mn, mx, imn, imx];
}
interface AxisR {
  n: Pt;
  a: [number, number, number, number];
  b: [number, number, number, number];
  ov: number;
  own: 0 | 1;
}
function sat(A: Pt[], B: Pt[]): { hit: boolean; depth: number; n: Pt; mi: number; axes: AxisR[] } {
  const axes: AxisR[] = [];
  const cen = (P: Pt[]): Pt => [P.reduce((s, p) => s + p[0], 0) / P.length, P.reduce((s, p) => s + p[1], 0) / P.length];
  const ca = cen(A);
  const cb = cen(B);
  let hitAll = true;
  let depth = Infinity;
  let best: Pt = [1, 0];
  let mi = -1;
  const add = (n: Pt, own: 0 | 1): void => {
    const a = proj(A, n);
    const b = proj(B, n);
    const ov = Math.min(a[1], b[1]) - Math.max(a[0], b[0]);
    axes.push({ n, a, b, ov, own });
    if (ov <= 0) hitAll = false;
    else if (ov < depth) {
      depth = ov;
      const s = (ca[0] - cb[0]) * n[0] + (ca[1] - cb[1]) * n[1] < 0 ? -1 : 1;
      best = [n[0] * s, n[1] * s];
      mi = axes.length - 1;
    }
  };
  axesOf(A).forEach((n) => add(n, 0));
  axesOf(B).forEach((n) => add(n, 1));
  return { hit: hitAll, depth, n: best, mi, axes };
}
function drawPoly(g: G, P: Pt[], c1: string, c2: string, dashed = false, face = true): void {
  const cx = P.reduce((s, p) => s + p[0], 0) / P.length;
  const cy = P.reduce((s, p) => s + p[1], 0) / P.length;
  g.beginPath();
  P.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
  g.closePath();
  g.lineJoin = 'round';
  if (dashed) {
    g.setLineDash([3, 2]);
    g.strokeStyle = c1;
    g.lineWidth = 1;
    g.stroke();
    g.setLineDash([]);
    return;
  }
  const gr = g.createLinearGradient(cx - 20, cy - 25, cx + 15, cy + 25);
  gr.addColorStop(0, c1);
  gr.addColorStop(1, c2);
  g.fillStyle = gr;
  g.fill();
  g.strokeStyle = 'rgba(20,10,40,.7)';
  g.lineWidth = 1.6;
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.35)';
  g.lineWidth = 0.8;
  g.stroke();
  if (face) {
    for (const s of [-1, 1]) {
      g.fillStyle = '#fff';
      g.beginPath();
      g.ellipse(cx + s * 4, cy - 1, 2.4, 3, 0, 0, TAU);
      g.fill();
      g.fillStyle = '#23153a';
      g.beginPath();
      g.arc(cx + s * 4 + 0.4, cy - 0.6, 1.3, 0, TAU);
      g.fill();
    }
    g.strokeStyle = '#23153a';
    g.lineWidth = 0.8;
    g.beginPath();
    g.arc(cx, cy + 2.5, 2, 0.2, Math.PI - 0.2);
    g.stroke();
  }
  g.lineJoin = 'miter';
}

const i284: Demo2D = {
  kind: '2d',
  caption: '축마다 두 도형의 그림자를 비춰 본다 — 하나라도 틈이 있으면 안 겹침, 다 겹치면 가장 얕은 축으로 밀어내기',
  make() {
    const inp = new Input();
    const SETS: { a: Pt[]; b: Pt[]; ca: [string, string]; cb: [string, string] }[] = [
      { a: regular(5, 20, -Math.PI / 2), b: regular(4, 34, Math.PI / 4, 1.35, 0.62), ca: ['#ffd36e', '#ff7a45'], cb: ['#7ef0d0', '#21a5a0'] },
      { a: regular(3, 22, -Math.PI / 2), b: regular(6, 28), ca: ['#ff9fd0', '#e0457f'], cb: ['#a8c8ff', '#4a6fe0'] },
      { a: regular(4, 19, Math.PI / 4, 1.2, 1), b: regular(5, 29, 0.3, 1, 0.8), ca: ['#c6ff8a', '#3fb45a'], cb: ['#ffc2a1', '#e8644a'] },
    ];
    let set = 0;
    let push = true;
    let guides = true;
    let spin = 1;
    let ang = 0;
    let angB = 0;
    let drag = false;
    let ax = 70;
    let ay = 90;
    const BX = 100;
    const BY = 92;
    return {
      controls: [
        { type: 'toggle', label: '밀어내기', value: true, on: (v) => (push = v) },
        { type: 'toggle', label: '그림자 비추는 선', value: true, on: (v) => (guides = v) },
        { type: 'range', label: '도는 빠르기', min: 0, max: 2, step: 0.1, value: 1, on: (v) => (spin = v) },
        { type: 'button', label: '다른 모양', on: () => (set = (set + 1) % SETS.length) },
      ] as Control[],
      draw(g, w, h, t, dt) {
        const v = viewOf(w, h);
        inp.sync(g, v);
        for (const e of inp.take()) drag = e.k === 'down' && e.x < 196;
        ang += dt * 0.9 * spin;
        angB += dt * 0.25 * spin;
        if (drag && inp.down) {
          ax = lerp(ax, clamp(inp.x, 10, 190), 0.35);
          ay = lerp(ay, clamp(inp.y, 22, 165), 0.35);
        } else {
          drag = false;
          const k = t * 0.55;
          ax = lerp(ax, BX + Math.cos(k) * 62, 0.2);
          ay = lerp(ay, BY + Math.sin(k * 2.1) * 30, 0.2);
        }
        const S = SETS[set]!;
        const B = place(S.b, BX, BY, angB);
        let A = place(S.a, ax, ay, ang);
        const r = sat(A, B);
        const ghost = A;
        if (r.hit && push) A = place(S.a, ax + r.n[0] * r.depth, ay + r.n[1] * r.depth, ang);
        const showHit = r.hit && !push;

        fillBg(g, w, h, '#151a33', '#232a4f');
        enter(g, v);
        // 모눈
        g.strokeStyle = 'rgba(120,140,220,.08)';
        g.lineWidth = 0.5;
        for (let x = 0; x <= 196; x += 14) {
          g.beginPath();
          g.moveTo(x, 16);
          g.lineTo(x, 175);
          g.stroke();
        }
        for (let y = 16; y <= 175; y += 14) {
          g.beginPath();
          g.moveTo(0, y);
          g.lineTo(196, y);
          g.stroke();
        }
        const fi = r.axes.length ? Math.floor(t / 0.9) % r.axes.length : 0;
        const show = r.hit && push && Math.floor(t / 0.9) % 2 === 1 ? r.mi : fi;
        const fa = r.axes[show];
        // 비추는 축 선 + 그림자
        if (fa && guides) {
          const n = fa.n;
          const pn: Pt = [-n[1], n[0]];
          const O: Pt = [98 + pn[0] * 0, 95];
          // 선을 도형 아래 · 옆쪽으로 비킨다
          const off = 58;
          const o: Pt = [O[0] + pn[0] * off * (pn[1] > 0 ? 1 : -1), O[1] + pn[1] * off * (pn[1] > 0 ? 1 : -1)];
          const base = o[0] * n[0] + o[1] * n[1];
          const at = (s: number): Pt => [o[0] + n[0] * (s - base), o[1] + n[1] * (s - base)];
          g.save();
          rr(g, 0, 16, 196, 159, 0);
          g.clip();
          const e0 = at(base - 200);
          const e1 = at(base + 200);
          g.strokeStyle = 'rgba(255,255,255,.35)';
          g.lineWidth = 0.8;
          g.beginPath();
          g.moveTo(e0[0], e0[1]);
          g.lineTo(e1[0], e1[1]);
          g.stroke();
          const shade = (P: Pt[], pr: [number, number, number, number], col: string, k: number): void => {
            g.setLineDash([2, 2]);
            g.strokeStyle = col;
            g.globalAlpha = 0.55;
            g.lineWidth = 0.7;
            for (const idx of [pr[2], pr[3]]) {
              const v0 = P[idx]!;
              const q = at(v0[0] * n[0] + v0[1] * n[1]);
              g.beginPath();
              g.moveTo(v0[0], v0[1]);
              g.lineTo(q[0], q[1]);
              g.stroke();
            }
            g.setLineDash([]);
            g.globalAlpha = 1;
            const a0 = at(pr[0]);
            const a1 = at(pr[1]);
            g.strokeStyle = col;
            g.lineCap = 'round';
            g.lineWidth = 4;
            g.beginPath();
            g.moveTo(a0[0] + pn[0] * k, a0[1] + pn[1] * k);
            g.lineTo(a1[0] + pn[0] * k, a1[1] + pn[1] * k);
            g.stroke();
            g.lineCap = 'butt';
          };
          shade(A, proj(A, n), S.ca[1], -3);
          shade(B, proj(B, n), S.cb[1], 3);
          const pa = proj(A, n);
          const lo = Math.max(pa[0], fa.b[0]);
          const hi = Math.min(pa[1], fa.b[1]);
          const q0 = at(lo);
          const q1 = at(hi);
          g.lineWidth = 2;
          g.strokeStyle = hi > lo ? '#ff3d6e' : '#45ff9a';
          g.beginPath();
          g.moveTo(q0[0], q0[1]);
          g.lineTo(q1[0], q1[1]);
          g.stroke();
          const mid: Pt = [(q0[0] + q1[0]) / 2, (q0[1] + q1[1]) / 2];
          pill(g, hi > lo ? `겹침 ${(hi - lo).toFixed(0)}` : '틈!', mid[0] + pn[0] * 10, mid[1] + pn[1] * 10, 6, hi > lo ? '#ff3d6e' : '#22c06e');
          g.restore();
        }
        drawPoly(g, B, S.cb[0], S.cb[1]);
        if (r.hit && push) drawPoly(g, ghost, 'rgba(255,255,255,.55)', '', true);
        drawPoly(g, A, showHit ? '#ff8a9a' : S.ca[0], showHit ? '#e02a4a' : S.ca[1]);
        if (r.hit && push) {
          const c0 = ghost.reduce((s, p) => [s[0] + p[0] / ghost.length, s[1] + p[1] / ghost.length] as Pt, [0, 0] as Pt);
          arrow(g, c0[0], c0[1], c0[0] + r.n[0] * Math.max(r.depth, 8), c0[1] + r.n[1] * Math.max(r.depth, 8), '#fff', 1.4, 4);
        }
        // 위 상태 띠
        const msg = r.hit ? (push ? '모든 축에서 겹침 → 가장 얕은 축으로 밀어냄' : '모든 축에서 겹침 → 부딪힘!') : '틈이 있는 축 발견 → 안 겹침';
        pill(g, msg, 98, 9, 7, r.hit ? '#e2365b' : '#1f9e5c');
        // 오른쪽: 축 목록
        rr(g, 199, 3, 78, 169, 6);
        g.fillStyle = 'rgba(8,10,28,.65)';
        g.fill();
        txt(g, '축마다 그림자', 238, 11, 7, '#cfd6ff', 'center', 800);
        const n = r.axes.length;
        const rowH = Math.min(17, 152 / n);
        r.axes.forEach((q, i) => {
          const y = 22 + i * rowH + rowH / 2;
          if (i === show) {
            rr(g, 201, y - rowH / 2 + 0.5, 74, rowH - 1, 3);
            g.fillStyle = 'rgba(255,255,255,.1)';
            g.fill();
          }
          // 방향 표시
          g.save();
          g.translate(209, y);
          g.rotate(Math.atan2(q.n[1], q.n[0]));
          g.strokeStyle = q.own ? S.cb[0] : S.ca[0];
          g.lineWidth = 1.3;
          g.beginPath();
          g.moveTo(-4, 0);
          g.lineTo(4, 0);
          g.stroke();
          g.restore();
          const lo = Math.min(q.a[0], q.b[0]);
          const hi = Math.max(q.a[1], q.b[1]);
          const mid = (lo + hi) / 2;
          const k = 52 / Math.max(90, hi - lo);
          const X = (s: number): number => 245 + (s - mid) * k;
          const bh = Math.max(2, rowH * 0.22);
          g.fillStyle = S.ca[1];
          g.fillRect(X(q.a[0]), y - bh - 0.5, X(q.a[1]) - X(q.a[0]), bh);
          g.fillStyle = S.cb[1];
          g.fillRect(X(q.b[0]), y + 0.5, X(q.b[1]) - X(q.b[0]), bh);
          if (q.ov > 0) {
            g.fillStyle = 'rgba(255,61,110,.55)';
            g.fillRect(X(Math.max(q.a[0], q.b[0])), y - bh - 1, X(Math.min(q.a[1], q.b[1])) - X(Math.max(q.a[0], q.b[0])), bh * 2 + 2);
          } else txt(g, '틈', 272, y, 6, '#45ff9a', 'right', 800);
          if (i === r.mi && r.hit) txt(g, '★', 273, y, 6, '#ffe066', 'right', 800);
        });
        if (v.big) txt(g, '노란 도형을 끌어 보세요', 98, 170, 6.5, 'rgba(255,255,255,.65)', 'center', 600);
        g.restore();
      },
      dispose() {
        inp.dispose();
      },
    };
  },
};

/* ═══════════ i285 쓸고 지나는 충돌 ═══════════ */

const i285: Demo2D = {
  kind: '2d',
  caption: '1/20초마다 한 번 보는 총알 — 위는 그 순간만 검사해 벽을 뚫고, 아래는 지나온 선을 쓸어 닿는 순간을 찾는다',
  make() {
    let speed = 560;
    let hz = 20;
    let showBox = false;
    const WX = 168;
    const WW = 4;
    const WH = 44;
    const RAD = 3;
    const PH = [0.15, 0.6, 0.85, 0.35, 0.05, 0.72, 0.5, 0.95];
    let shot = 0;
    let shotT = 0;
    let acc = 0;
    let tick = 0;
    interface B {
      x: number;
      vx: number;
      prev: number[];
      hit: boolean;
      hitX: number;
      through: boolean;
      pop: number;
      vy: number;
      y: number;
    }
    const mk = (x0: number): B => ({ x: x0, vx: speed, prev: [x0], hit: false, hitX: 0, through: false, pop: -1, vy: 0, y: 0 });
    let lanes: [B, B] = [mk(30), mk(30)];
    const tally = [
      [0, 0],
      [0, 0],
    ];
    const sparks: Part[] = [];
    const fire = (): void => {
      shot++;
      shotT = 0;
      acc = 0;
      tick = 0;
      const step = speed / hz;
      const x0 = 30 + PH[shot % PH.length]! * step;
      lanes = [mk(x0), mk(x0)];
    };
    fire();
    const LY = [46, 128];
    const physTick = (h: number): void => {
      tick++;
      lanes.forEach((b, li) => {
        if (b.pop >= 0) return;
        if (b.hit) {
          b.prev.push(b.x);
          b.vy += 600 * h;
          b.x += b.vx * h;
          b.y += b.vy * h;
          return;
        }
        const x0 = b.x;
        const x1 = b.x + b.vx * h;
        const L = WX - RAD;
        const Rr = WX + WW + RAD;
        if (li === 0) {
          b.x = x1;
          if (b.x > L && b.x < Rr) {
            b.hit = true;
            b.hitX = b.x;
          }
        } else if (x0 <= L && x1 >= L) {
          const tt = (L - x0) / (x1 - x0);
          b.x = L;
          b.hit = true;
          b.hitX = b.x;
          b.prev.push(x0 + (x1 - x0) * tt);
          void tt;
        } else b.x = x1;
        if (b.hit) {
          b.vx = -b.vx * 0.25;
          b.vy = -120;
          tally[li]![1]!++;
          for (let i = 0; i < 12; i++) {
            const a = Math.PI + (Math.random() - 0.5) * 2.2;
            const sp = 40 + Math.random() * 90;
            sparks.push({ x: WX, y: LY[li]!, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.4, max: 0.4, size: 1.3, color: i % 2 ? '#ffe27a' : '#ff9a3d', grav: 160 });
          }
        }
        if (!b.hit && x0 < Rr && b.x >= Rr) b.through = true;
        if (!b.hit && b.x > 232) {
          b.pop = 0;
          tally[li]![0]!++;
          for (let i = 0; i < 14; i++) {
            const a = (i / 14) * TAU;
            sparks.push({ x: 238, y: LY[li]!, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, life: 0.45, max: 0.45, size: 1.6, color: '#ff6f9a', grav: 80 });
          }
        }
        b.prev.push(b.x);
      });
    };
    return {
      controls: [
        { type: 'range', label: '총알 빠르기', min: 60, max: 1200, step: 20, value: 560, on: (v) => (speed = v) },
        { type: 'range', label: '1초에 검사 횟수', min: 8, max: 60, step: 1, value: 20, on: (v) => (hz = v) },
        { type: 'toggle', label: '넓힌 벽(민코프스키) 보기', value: false, on: (v) => (showBox = v) },
        { type: 'button', label: '쏘기', on: () => fire() },
      ] as Control[],
      draw(g, w, h, t, dt) {
        const v = viewOf(w, h);
        shotT += dt;
        acc += Math.min(dt, 0.1);
        const H = 1 / hz;
        while (acc >= H) {
          acc -= H;
          physTick(H);
        }
        stepParts(sparks, dt);
        for (const b of lanes) if (b.pop >= 0) b.pop += dt;
        if (shotT > 2.1) fire();

        fillBg(g, w, h, '#0f1630', '#1b2447');
        enter(g, v);
        const name = ['순간만 검사', '쓸고 지나는 검사'];
        const col = ['#ff6b8b', '#4be3a0'];
        lanes.forEach((b, li) => {
          const cy = LY[li]!;
          const top = cy - 34;
          rr(g, 8, top, 264, 72, 8);
          const lg = g.createLinearGradient(0, top, 0, top + 72);
          lg.addColorStop(0, li ? '#16324a' : '#2f1c3f');
          lg.addColorStop(1, li ? '#0e2034' : '#1d1230');
          g.fillStyle = lg;
          g.fill();
          g.strokeStyle = 'rgba(255,255,255,.12)';
          g.lineWidth = 1;
          g.stroke();
          pill(g, name[li]!, 14, top + 9, 7, col[li]!, '#14102a', 'left');
          txt(g, `뚫림 ${tally[li]![0]} · 막힘 ${tally[li]![1]}`, 266, top + 9, 6.5, 'rgba(255,255,255,.75)', 'right', 700);
          // 대포
          g.fillStyle = '#5d6b9a';
          rr(g, 14, cy - 5, 18, 10, 4);
          g.fill();
          g.fillStyle = '#8796c8';
          rr(g, 16, cy - 3.5, 14, 3, 1.5);
          g.fill();
          g.fillStyle = '#3c466e';
          g.beginPath();
          g.arc(18, cy + 6, 5, 0, TAU);
          g.fill();
          // 벽
          if (showBox) {
            g.setLineDash([2, 2]);
            g.strokeStyle = '#ffe066';
            g.lineWidth = 0.8;
            g.strokeRect(WX - RAD, cy - WH / 2 - RAD, WW + RAD * 2, WH + RAD * 2);
            g.setLineDash([]);
          }
          const flash = b.hit && b.prev.length < 4 ? 1 : 0;
          const wg = g.createLinearGradient(WX, 0, WX + WW, 0);
          wg.addColorStop(0, flash ? '#fff4c0' : '#bfe7ff');
          wg.addColorStop(1, flash ? '#ffd24a' : '#6aa8e0');
          g.fillStyle = wg;
          rr(g, WX, cy - WH / 2, WW, WH, 1.5);
          g.fill();
          g.fillStyle = 'rgba(255,255,255,.6)';
          g.fillRect(WX + 0.6, cy - WH / 2 + 2, 0.8, WH - 4);
          // 풍선 (과녁)
          if (b.pop < 0) {
            const by = cy + Math.sin(t * 2 + li) * 2;
            g.strokeStyle = 'rgba(255,255,255,.5)';
            g.lineWidth = 0.5;
            g.beginPath();
            g.moveTo(240, by + 9);
            g.quadraticCurveTo(243, by + 18, 238, by + 26);
            g.stroke();
            const bg2 = g.createRadialGradient(236, by - 3, 1, 240, by, 10);
            bg2.addColorStop(0, '#ffc1d6');
            bg2.addColorStop(1, '#ff4d7e');
            g.fillStyle = bg2;
            g.beginPath();
            g.ellipse(240, by, 7.5, 9, 0, 0, TAU);
            g.fill();
          } else if (b.pop < 1.2) {
            txt(g, '펑! 뚫렸다', 240, cy, 8, '#ff7a9c', 'center', 800);
          }
          // 프레임 자국
          const stepPx = speed / hz;
          b.prev.forEach((x, i) => {
            const yy = cy + (b.hit ? 0 : 0);
            if (li === 1 && i > 0 && !b.hit) {
              const x0 = b.prev[i - 1]!;
              g.fillStyle = 'rgba(75,227,160,.16)';
              rr(g, Math.min(x0, x) - RAD, yy - RAD, Math.abs(x - x0) + RAD * 2, RAD * 2, RAD);
              g.fill();
            }
            if (i < b.prev.length - 1 && !(b.hit && x < WX - 10 && i > 0 && b.prev[i - 1]! > x)) {
              g.strokeStyle = li ? 'rgba(75,227,160,.55)' : 'rgba(255,107,139,.55)';
              g.lineWidth = 0.8;
              g.beginPath();
              g.arc(x, yy, RAD, 0, TAU);
              g.stroke();
              if (stepPx > 12) txt(g, String(i + 1), x, yy - 7, 4.5, 'rgba(255,255,255,.45)', 'center', 700);
            }
          });
          if (b.pop < 0) {
            const yy = cy + b.y;
            g.globalCompositeOperation = 'lighter';
            const gl = g.createRadialGradient(b.x, yy, 0, b.x, yy, 8);
            gl.addColorStop(0, li ? 'rgba(120,255,200,.7)' : 'rgba(255,150,170,.7)');
            gl.addColorStop(1, 'rgba(0,0,0,0)');
            g.fillStyle = gl;
            g.beginPath();
            g.arc(b.x, yy, 8, 0, TAU);
            g.fill();
            g.globalCompositeOperation = 'source-over';
            g.fillStyle = '#fff';
            g.beginPath();
            g.arc(b.x, yy, RAD, 0, TAU);
            g.fill();
          }
          if (b.through && li === 0) txt(g, '한 걸음에 벽을 건너뜀!', WX, cy + 28, 6.5, '#ff9ab0', 'center', 800);
          if (b.hit && li === 1) txt(g, '닿는 순간에서 멈춤', WX - 30, cy + 28, 6.5, '#8ff5c8', 'center', 800);
        });
        drawParts(g, sparks, true);
        txt(g, `한 번에 ${(speed / hz).toFixed(0)}칸 이동 · 벽 두께 ${WW}`, 140, 86.5, 6.5, 'rgba(255,255,255,.55)', 'center', 600);
        g.restore();
      },
    };
  },
};

/* ═══════════ i286 베를레 밧줄 · 사슬 ═══════════ */

const i286: Demo2D = {
  kind: '2d',
  caption: '점들을 「길이 지키기」로 여러 번 풀어 밧줄 · 다리가 된다 — 가위로 자르면 사탕이 출렁 다리로',
  make() {
    const inp = new Input();
    let iters = 12;
    let debug = false;
    // 점
    let px: number[] = [];
    let py: number[] = [];
    let ox: number[] = [];
    let oy: number[] = [];
    let inv: number[] = [];
    interface Con {
      a: number;
      b: number;
      len: number;
      kind: 0 | 1;
      alive: boolean;
    }
    let cons: Con[] = [];
    let candy = 0;
    let bridge: number[] = [];
    let spin = 0;
    let T = 0;
    let cuts = 0;
    let grab = false;
    const flares: Part[] = [];
    const slashes: { x0: number; y0: number; x1: number; y1: number; t: number }[] = [];
    const add = (x: number, y: number, w: number): number => {
      px.push(x);
      py.push(y);
      ox.push(x);
      oy.push(y);
      inv.push(w);
      return px.length - 1;
    };
    const chain = (a: number, b: number, n: number, slack: number, kind: 0 | 1): number[] => {
      const ids = [a];
      for (let i = 1; i < n; i++) ids.push(add(lerp(px[a]!, px[b]!, i / n), lerp(py[a]!, py[b]!, i / n), 1));
      ids.push(b);
      const d = Math.hypot(px[b]! - px[a]!, py[b]! - py[a]!) / n;
      for (let i = 0; i < n; i++) cons.push({ a: ids[i]!, b: ids[i + 1]!, len: d * slack, kind, alive: true });
      return ids;
    };
    const build = (): void => {
      px = [];
      py = [];
      ox = [];
      oy = [];
      inv = [];
      cons = [];
      const p1 = add(92, 14, 0);
      const p2 = add(204, 24, 0);
      candy = add(150, 80, 0.2);
      chain(p1, candy, 13, 1.02, 0);
      chain(p2, candy, 12, 1.02, 0);
      const b0 = add(34, 138, 0);
      const b1 = add(246, 138, 0);
      bridge = chain(b0, b1, 16, 1.07, 1);
      ox[candy] = px[candy]! - 1.4;
      T = 0;
      cuts = 0;
      spin = 0;
    };
    build();
    const cutCrossing = (x0: number, y0: number, x1: number, y1: number): boolean => {
      let any = false;
      for (const c of cons) {
        if (!c.alive || c.kind === 1) continue;
        const ax = px[c.a]!;
        const ay = py[c.a]!;
        const bx = px[c.b]!;
        const by = py[c.b]!;
        const d = (x1 - x0) * (by - ay) - (y1 - y0) * (bx - ax);
        if (Math.abs(d) < 1e-6) continue;
        const s = ((ax - x0) * (by - ay) - (ay - y0) * (bx - ax)) / d;
        const u2 = ((ax - x0) * (y1 - y0) - (ay - y0) * (x1 - x0)) / d;
        if (s >= 0 && s <= 1 && u2 >= 0 && u2 <= 1) {
          c.alive = false;
          any = true;
          const cx = (ax + bx) / 2;
          const cy = (ay + by) / 2;
          for (let i = 0; i < 10; i++) {
            const a = Math.random() * TAU;
            flares.push({ x: cx, y: cy, vx: Math.cos(a) * 50, vy: Math.sin(a) * 50, life: 0.35, max: 0.35, size: 1.3, color: i % 2 ? '#fff6c4' : '#ffb347', grav: 60 });
          }
        }
      }
      return any;
    };
    const scriptCut = (k: number): void => {
      // 줄 k(0/1) 의 5번째 마디를 가로지르는 선
      const list = cons.filter((c) => c.kind === 0);
      const c = k === 0 ? list[5] : list[13 + 6];
      if (!c) return;
      const cx = (px[c.a]! + px[c.b]!) / 2;
      const cy = (py[c.a]! + py[c.b]!) / 2;
      const ang = Math.atan2(py[c.b]! - py[c.a]!, px[c.b]! - px[c.a]!) + Math.PI / 2;
      const x0 = cx - Math.cos(ang) * 14;
      const y0 = cy - Math.sin(ang) * 14;
      const x1 = cx + Math.cos(ang) * 14;
      const y1 = cy + Math.sin(ang) * 14;
      slashes.push({ x0, y0, x1, y1, t: 0 });
      cutCrossing(x0, y0, x1, y1);
    };
    const RC = 9;
    const physics = (h: number): void => {
      const G = 520;
      for (let i = 0; i < px.length; i++) {
        if (inv[i] === 0) continue;
        const vx = (px[i]! - ox[i]!) * 0.997;
        const vy = (py[i]! - oy[i]!) * 0.997;
        ox[i] = px[i]!;
        oy[i] = py[i]!;
        px[i] = px[i]! + vx;
        py[i] = py[i]! + vy + G * h * h;
      }
      if (grab) {
        px[candy] = lerp(px[candy]!, clamp(inp.x, 10, 270), 0.4);
        py[candy] = lerp(py[candy]!, clamp(inp.y, 10, 165), 0.4);
      }
      for (let it = 0; it < iters; it++) {
        for (const c of cons) {
          if (!c.alive) continue;
          const wa = inv[c.a]!;
          const wb = inv[c.b]!;
          const ws = wa + wb;
          if (ws === 0) continue;
          const dx = px[c.b]! - px[c.a]!;
          const dy = py[c.b]! - py[c.a]!;
          const d = Math.hypot(dx, dy) || 1e-6;
          const diff = (d - c.len) / d;
          px[c.a] = px[c.a]! + dx * diff * (wa / ws);
          py[c.a] = py[c.a]! + dy * diff * (wa / ws);
          px[c.b] = px[c.b]! - dx * diff * (wb / ws);
          py[c.b] = py[c.b]! - dy * diff * (wb / ws);
        }
        // 사탕 ↔ 다리
        for (let i = 0; i + 1 < bridge.length; i++) {
          const a = bridge[i]!;
          const b = bridge[i + 1]!;
          const ex = px[b]! - px[a]!;
          const ey = py[b]! - py[a]!;
          const L2 = ex * ex + ey * ey || 1;
          const u = clamp01(((px[candy]! - px[a]!) * ex + (py[candy]! - py[a]!) * ey) / L2);
          const qx = px[a]! + ex * u;
          const qy = py[a]! + ey * u;
          let nx = px[candy]! - qx;
          let ny = py[candy]! - qy;
          const d = Math.hypot(nx, ny);
          const R = RC + 2.5;
          if (d < R && d > 1e-6) {
            nx /= d;
            ny /= d;
            const pen = R - d;
            const wc = inv[candy]!;
            const wa = inv[a]! * (1 - u);
            const wb = inv[b]! * u;
            const ws = wc + wa + wb || 1;
            px[candy] = px[candy]! + nx * pen * (wc / ws);
            py[candy] = py[candy]! + ny * pen * (wc / ws);
            px[a] = px[a]! - nx * pen * (wa / ws);
            py[a] = py[a]! - ny * pen * (wa / ws);
            px[b] = px[b]! - nx * pen * (wb / ws);
            py[b] = py[b]! - ny * pen * (wb / ws);
            // 마찰
            ox[candy] = lerp(ox[candy]!, px[candy]!, 0.02);
          }
        }
      }
      if (py[candy]! > 168) py[candy] = 168;
      spin += (px[candy]! - ox[candy]!) * 0.12;
    };
    const step = fixed(1 / 120);
    let last = { x: 0, y: 0 };
    return {
      controls: [
        { type: 'range', label: '길이 맞추기 반복 횟수', min: 1, max: 30, step: 1, value: 12, on: (v) => (iters = v) },
        { type: 'toggle', label: '점 · 막대 보기', value: false, on: (v) => (debug = v) },
        { type: 'button', label: '다시 매달기', on: () => build() },
      ] as Control[],
      draw(g, w, h, t, dt) {
        const v = viewOf(w, h);
        inp.sync(g, v);
        for (const e of inp.take()) {
          if (e.k === 'down') {
            grab = Math.hypot(e.x - px[candy]!, e.y - py[candy]!) < RC + 6;
            last = { x: e.x, y: e.y };
            cuts = 99;
          } else grab = false;
        }
        if (inp.down && !grab && (inp.x !== last.x || inp.y !== last.y)) {
          if (cutCrossing(last.x, last.y, inp.x, inp.y)) slashes.push({ x0: last.x, y0: last.y, x1: inp.x, y1: inp.y, t: 0 });
          last = { x: inp.x, y: inp.y };
        }
        step(dt, (H) => {
          T += H;
          physics(H);
        });
        if (cuts < 99) {
          if (cuts === 0 && T > 1.4) {
            scriptCut(0);
            cuts = 1;
          } else if (cuts === 1 && T > 2.5) {
            scriptCut(1);
            cuts = 2;
          } else if (cuts === 2 && T > 5.6) build();
        } else if (T > 4 && !inp.down && cons.every((c) => c.kind === 1 || !c.alive) && T > 9) build();
        stepParts(flares, dt);
        for (const s of slashes) s.t += dt;
        while (slashes.length && slashes[0]!.t > 0.5) slashes.shift();

        fillBg(g, w, h, '#2a1f45', '#45305c');
        enter(g, v);
        // 벽지 점
        g.fillStyle = 'rgba(255,220,255,.05)';
        for (let y = 6; y < 175; y += 12)
          for (let x = (y / 12) % 2 ? 6 : 0; x < 280; x += 12) {
            g.beginPath();
            g.arc(x, y, 1.6, 0, TAU);
            g.fill();
          }
        const lamp = g.createRadialGradient(150, 40, 0, 150, 40, 140);
        lamp.addColorStop(0, 'rgba(255,210,150,.16)');
        lamp.addColorStop(1, 'rgba(255,210,150,0)');
        g.fillStyle = lamp;
        g.fillRect(0, 0, 280, 175);
        // 다리 기둥
        for (const bx of [px[bridge[0]!]!, px[bridge[bridge.length - 1]!]!]) {
          g.fillStyle = '#8a5a34';
          rr(g, bx - 4, 132, 8, 45, 2);
          g.fill();
          g.fillStyle = '#b07a48';
          rr(g, bx - 5, 128, 10, 6, 2);
          g.fill();
        }
        // 다리 널빤지
        g.lineCap = 'round';
        for (let i = 0; i + 1 < bridge.length; i++) {
          const a = bridge[i]!;
          const b = bridge[i + 1]!;
          const ang = Math.atan2(py[b]! - py[a]!, px[b]! - px[a]!);
          const L = Math.hypot(px[b]! - px[a]!, py[b]! - py[a]!);
          g.save();
          g.translate((px[a]! + px[b]!) / 2, (py[a]! + py[b]!) / 2);
          g.rotate(ang);
          g.fillStyle = i % 2 ? '#c88a52' : '#d79a5f';
          rr(g, -L / 2 + 0.4, -1, L - 0.8, 5, 1.2);
          g.fill();
          g.fillStyle = 'rgba(255,255,255,.25)';
          g.fillRect(-L / 2 + 1, -0.6, L - 2, 0.8);
          g.strokeStyle = 'rgba(90,50,20,.6)';
          g.lineWidth = 0.5;
          g.strokeRect(-L / 2 + 0.4, -1, L - 0.8, 5);
          g.restore();
        }
        g.strokeStyle = '#e8d2a6';
        g.lineWidth = 1;
        g.beginPath();
        bridge.forEach((id, i) => (i ? g.lineTo(px[id]!, py[id]! - 1) : g.moveTo(px[id]!, py[id]! - 1)));
        g.stroke();
        // 밧줄
        for (const c of cons) {
          if (!c.alive || c.kind === 1) continue;
          const ax = px[c.a]!;
          const ay = py[c.a]!;
          const bx = px[c.b]!;
          const by = py[c.b]!;
          const st = Math.hypot(bx - ax, by - ay) / c.len;
          g.strokeStyle = st > 1.25 ? '#ff8a6a' : '#6b4320';
          g.lineWidth = 3;
          g.beginPath();
          g.moveTo(ax, ay);
          g.lineTo(bx, by);
          g.stroke();
          g.strokeStyle = st > 1.25 ? '#ffc0a0' : '#c99559';
          g.lineWidth = 1.8;
          g.stroke();
          g.strokeStyle = 'rgba(80,45,15,.7)';
          g.lineWidth = 0.6;
          const mx = (ax + bx) / 2;
          const my = (ay + by) / 2;
          g.beginPath();
          g.moveTo(mx - 0.8, my - 1);
          g.lineTo(mx + 0.8, my + 1);
          g.stroke();
        }
        // 못
        for (let i = 0; i < 2; i++) {
          const x = px[i]!;
          const y = py[i]!;
          const ng = g.createRadialGradient(x - 1, y - 1, 0, x, y, 4);
          ng.addColorStop(0, '#fff2b8');
          ng.addColorStop(1, '#b8862a');
          g.fillStyle = ng;
          g.beginPath();
          g.arc(x, y, 3.6, 0, TAU);
          g.fill();
          g.strokeStyle = 'rgba(60,40,10,.6)';
          g.lineWidth = 0.6;
          g.stroke();
        }
        // 사탕
        const cx = px[candy]!;
        const cy = py[candy]!;
        g.save();
        g.translate(cx, cy);
        g.rotate(spin);
        g.fillStyle = '#ff6fa8';
        for (const s of [-1, 1]) {
          g.beginPath();
          g.moveTo(s * RC * 0.8, 0);
          g.lineTo(s * RC * 1.75, -5);
          g.quadraticCurveTo(s * RC * 1.55, 0, s * RC * 1.75, 5);
          g.closePath();
          g.fill();
          g.strokeStyle = '#c23a72';
          g.lineWidth = 0.6;
          g.stroke();
        }
        g.beginPath();
        g.arc(0, 0, RC, 0, TAU);
        const cg = g.createRadialGradient(-3, -3, 1, 0, 0, RC);
        cg.addColorStop(0, '#fff');
        cg.addColorStop(0.35, '#ffd1e4');
        cg.addColorStop(1, '#ff5d9a');
        g.fillStyle = cg;
        g.fill();
        g.save();
        g.clip();
        g.strokeStyle = 'rgba(255,255,255,.85)';
        g.lineWidth = 2.2;
        for (let k = -2; k <= 2; k++) {
          g.beginPath();
          g.moveTo(k * 5 - 10, -10);
          g.lineTo(k * 5 + 10, 10);
          g.stroke();
        }
        g.restore();
        g.strokeStyle = '#c23a72';
        g.lineWidth = 0.9;
        g.beginPath();
        g.arc(0, 0, RC, 0, TAU);
        g.stroke();
        g.restore();
        // 자르기 칼선
        for (const s of slashes) {
          const k = s.t / 0.5;
          g.globalAlpha = 1 - k;
          g.strokeStyle = '#fff';
          g.lineWidth = 2.2 * (1 - k);
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(s.x0, s.y0);
          g.lineTo(s.x1, s.y1);
          g.stroke();
          if (k < 0.6) txt(g, '✂', s.x1 + 4, s.y1 - 4, 9, '#fff', 'center', 800);
          g.globalAlpha = 1;
        }
        g.lineCap = 'butt';
        drawParts(g, flares, true);
        if (debug) {
          g.strokeStyle = 'rgba(0,230,255,.6)';
          g.lineWidth = 0.5;
          for (const c of cons) {
            if (!c.alive) continue;
            g.beginPath();
            g.moveTo(px[c.a]!, py[c.a]!);
            g.lineTo(px[c.b]!, py[c.b]!);
            g.stroke();
          }
          for (let i = 0; i < px.length; i++) {
            g.fillStyle = inv[i] === 0 ? '#ffe066' : '#00e5ff';
            g.beginPath();
            g.arc(px[i]!, py[i]!, inv[i] === 0 ? 2 : 1.1, 0, TAU);
            g.fill();
          }
          g.strokeStyle = 'rgba(255,230,100,.8)';
          g.setLineDash([2, 2]);
          g.beginPath();
          g.arc(cx, cy, RC + 2.5, 0, TAU);
          g.stroke();
          g.setLineDash([]);
        }
        txt(g, `반복 ${iters}번`, 272, 9, 7, 'rgba(255,255,255,.65)', 'right', 700);
        if (v.big) txt(g, '긋기 = 자르기 · 사탕 끌기', 8, 9, 7, 'rgba(255,255,255,.65)', 'left', 700);
        void t;
        g.restore();
      },
      dispose() {
        inp.dispose();
      },
    };
  },
};

/* ═══════════ i287 말랑한 몸 ═══════════ */

const i287: Demo2D = {
  kind: '2d',
  caption: '둘레 점을 스프링으로 잇고 안쪽 넓이를 지키는 압력 — 떨어지면 찌그러졌다 통 돌아오는 슬라임',
  make() {
    const inp = new Input();
    const N = 22;
    const R0 = 23;
    let kP = 1;
    let kS = 1;
    let debug = false;
    const x = new Float64Array(N);
    const y = new Float64Array(N);
    const vx = new Float64Array(N);
    const vy = new Float64Array(N);
    let A0 = 0;
    let L0 = 0;
    let L2 = 0;
    const FLOOR = 160;
    const BUMP = { x: 140, y: 166, r: 15 };
    let jumpT = 1.2;
    let dir = 1;
    let blink = 0;
    let grabI = -1;
    const area = (): number => {
      let s = 0;
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        s += x[i]! * y[j]! - x[j]! * y[i]!;
      }
      return s / 2;
    };
    const init = (cx: number, cy: number): void => {
      for (let i = 0; i < N; i++) {
        const a = (i / N) * TAU;
        x[i] = cx + Math.cos(a) * R0;
        y[i] = cy + Math.sin(a) * R0;
        vx[i] = 0;
        vy[i] = 0;
      }
      A0 = Math.abs(area());
      L0 = Math.hypot(x[1]! - x[0]!, y[1]! - y[0]!);
      L2 = Math.hypot(x[2]! - x[0]!, y[2]! - y[0]!);
    };
    init(70, 60);
    const fx = new Float64Array(N);
    const fy = new Float64Array(N);
    let lastP = 0;
    const spring = (i: number, j: number, rest: number, k: number, c: number): void => {
      const dx = x[j]! - x[i]!;
      const dy = y[j]! - y[i]!;
      const d = Math.hypot(dx, dy) || 1e-6;
      const nx = dx / d;
      const ny = dy / d;
      const rv = (vx[j]! - vx[i]!) * nx + (vy[j]! - vy[i]!) * ny;
      const f = k * (d - rest) + c * rv;
      fx[i] = fx[i]! + f * nx;
      fy[i] = fy[i]! + f * ny;
      fx[j] = fx[j]! - f * nx;
      fy[j] = fy[j]! - f * ny;
    };
    const physics = (h: number): void => {
      fx.fill(0);
      fy.fill(0);
      for (let i = 0; i < N; i++) {
        spring(i, (i + 1) % N, L0, 2200 * kS, 10);
        spring(i, (i + 2) % N, L2, 500 * kS, 4);
      }
      const A = area();
      const sgn = A > 0 ? 1 : -1;
      const P = 9000 * kP * (A0 - Math.abs(A)) / A0 + (kP > 0 ? 0 : 0);
      lastP = P;
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        const ex = x[j]! - x[i]!;
        const ey = y[j]! - y[i]!;
        // 바깥 법선 (y 아래 좌표, 넓이 부호로 방향 맞춤)
        const nx = ey * sgn;
        const ny = -ex * sgn;
        const f = P * 0.5;
        fx[i] = fx[i]! + nx * f * 0.5;
        fy[i] = fy[i]! + ny * f * 0.5;
        fx[j] = fx[j]! + nx * f * 0.5;
        fy[j] = fy[j]! + ny * f * 0.5;
      }
      if (grabI >= 0) {
        fx[grabI] = fx[grabI]! + (inp.x - x[grabI]!) * 600 - vx[grabI]! * 20;
        fy[grabI] = fy[grabI]! + (inp.y - y[grabI]!) * 600 - vy[grabI]! * 20;
      }
      for (let i = 0; i < N; i++) {
        vx[i] = (vx[i]! + fx[i]! * h) * 0.9995;
        vy[i] = (vy[i]! + (fy[i]! + 520) * h) * 0.9995;
        x[i] = x[i]! + vx[i]! * h;
        y[i] = y[i]! + vy[i]! * h;
        if (y[i]! > FLOOR) {
          y[i] = FLOOR;
          if (vy[i]! > 0) vy[i] = -vy[i]! * 0.1;
          vx[i] = vx[i]! * 0.96;
        }
        if (x[i]! < 6) {
          x[i] = 6;
          vx[i] = Math.abs(vx[i]!) * 0.3;
        }
        if (x[i]! > 274) {
          x[i] = 274;
          vx[i] = -Math.abs(vx[i]!) * 0.3;
        }
        if (y[i]! < 4) {
          y[i] = 4;
          vy[i] = Math.abs(vy[i]!) * 0.3;
        }
        const bx = x[i]! - BUMP.x;
        const by = y[i]! - BUMP.y;
        const bd = Math.hypot(bx, by);
        if (bd < BUMP.r) {
          const nx = bx / bd;
          const ny = by / bd;
          x[i] = BUMP.x + nx * BUMP.r;
          y[i] = BUMP.y + ny * BUMP.r;
          const vn = vx[i]! * nx + vy[i]! * ny;
          if (vn < 0) {
            vx[i] = vx[i]! - vn * nx * 1.1;
            vy[i] = vy[i]! - vn * ny * 1.1;
          }
        }
      }
    };
    const center = (): [number, number] => {
      let sx = 0;
      let sy = 0;
      for (let i = 0; i < N; i++) {
        sx += x[i]!;
        sy += y[i]!;
      }
      return [sx / N, sy / N];
    };
    const jump = (): void => {
      const [cx] = center();
      dir = cx < 140 ? 1 : -1;
      for (let i = 0; i < N; i++) {
        vy[i] = vy[i]! - 330;
        vx[i] = vx[i]! + dir * 95;
      }
    };
    const step = fixed(1 / 360);
    return {
      controls: [
        { type: 'range', label: '안쪽 압력', min: 0, max: 2, step: 0.05, value: 1, on: (v) => (kP = v) },
        { type: 'range', label: '스프링 단단함', min: 0.2, max: 2.5, step: 0.05, value: 1, on: (v) => (kS = v) },
        { type: 'toggle', label: '점 · 스프링 · 압력 보기', value: false, on: (v) => (debug = v) },
        { type: 'button', label: '점프!', on: () => jump() },
      ] as Control[],
      draw(g, w, h, t, dt) {
        const v = viewOf(w, h);
        inp.sync(g, v);
        for (const e of inp.take()) {
          if (e.k === 'down') {
            let bi = -1;
            let bd = 30;
            for (let i = 0; i < N; i++) {
              const d = Math.hypot(x[i]! - e.x, y[i]! - e.y);
              if (d < bd) {
                bd = d;
                bi = i;
              }
            }
            grabI = bi;
          } else grabI = -1;
        }
        step(dt, (H) => physics(H));
        jumpT -= dt;
        if (jumpT < 0 && grabI < 0) {
          jump();
          jumpT = 2.3;
        }
        blink -= dt;
        if (blink < -3) blink = 0.12;
        // 터지면 되살리기
        const [cx, cy] = center();
        if (!isFinite(cx) || !isFinite(cy)) init(70, 60);

        fillBg(g, w, h, '#1d2a3f', '#2c4058');
        enter(g, v);
        // 뒤 장식
        g.fillStyle = 'rgba(160,255,200,.05)';
        for (let i = 0; i < 6; i++) {
          g.beginPath();
          g.arc(30 + i * 48, 40 + Math.sin(i * 2.3) * 20, 18 + (i % 3) * 6, 0, TAU);
          g.fill();
        }
        // 바닥
        const fg = g.createLinearGradient(0, FLOOR, 0, 175);
        fg.addColorStop(0, '#6d8aa6');
        fg.addColorStop(1, '#3d546d');
        g.fillStyle = fg;
        g.fillRect(-60, FLOOR, 400, 20);
        g.fillStyle = 'rgba(255,255,255,.25)';
        g.fillRect(-60, FLOOR, 400, 1);
        // 혹 (돌)
        const bg2 = g.createRadialGradient(BUMP.x - 5, BUMP.y - 10, 1, BUMP.x, BUMP.y, BUMP.r);
        bg2.addColorStop(0, '#c9d6e6');
        bg2.addColorStop(1, '#7c8da3');
        g.fillStyle = bg2;
        g.beginPath();
        g.arc(BUMP.x, BUMP.y, BUMP.r - 0.5, Math.PI, TAU);
        g.fill();
        // 그림자
        const hgt = FLOOR - cy;
        g.fillStyle = `rgba(0,0,0,${(0.3 * clamp01(1 - hgt / 140)).toFixed(3)})`;
        g.beginPath();
        g.ellipse(cx, FLOOR + 1, 24 * (1 - hgt / 300), 3, 0, 0, TAU);
        g.fill();
        // 몸 (중점을 잇는 부드러운 곡선)
        const path = (): void => {
          g.beginPath();
          const mx0 = (x[N - 1]! + x[0]!) / 2;
          const my0 = (y[N - 1]! + y[0]!) / 2;
          g.moveTo(mx0, my0);
          for (let i = 0; i < N; i++) {
            const j = (i + 1) % N;
            g.quadraticCurveTo(x[i]!, y[i]!, (x[i]! + x[j]!) / 2, (y[i]! + y[j]!) / 2);
          }
          g.closePath();
        };
        let minX = 1e9;
        let maxX = -1e9;
        let minY = 1e9;
        let maxY = -1e9;
        for (let i = 0; i < N; i++) {
          minX = Math.min(minX, x[i]!);
          maxX = Math.max(maxX, x[i]!);
          minY = Math.min(minY, y[i]!);
          maxY = Math.max(maxY, y[i]!);
        }
        const bw = maxX - minX;
        const bh = maxY - minY;
        path();
        const sg = g.createRadialGradient(cx - bw * 0.2, cy - bh * 0.3, 2, cx, cy, Math.max(bw, bh) * 0.7);
        sg.addColorStop(0, '#c8ffd6');
        sg.addColorStop(0.45, '#5fe08f');
        sg.addColorStop(1, '#1f9e5c');
        g.fillStyle = sg;
        g.globalAlpha = 0.95;
        g.fill();
        g.globalAlpha = 1;
        g.lineWidth = 1.6;
        g.strokeStyle = '#13724a';
        g.stroke();
        // 속 거품
        g.save();
        path();
        g.clip();
        g.fillStyle = 'rgba(255,255,255,.25)';
        for (let i = 0; i < 4; i++) {
          g.beginPath();
          g.arc(cx + Math.sin(t * 0.9 + i * 2) * bw * 0.25, cy + Math.cos(t * 0.7 + i) * bh * 0.2 + 4, 1.2 + (i % 2), 0, TAU);
          g.fill();
        }
        g.fillStyle = 'rgba(255,255,255,.6)';
        g.beginPath();
        g.ellipse(cx - bw * 0.22, cy - bh * 0.28, bw * 0.12, bh * 0.07, -0.6, 0, TAU);
        g.fill();
        g.restore();
        // 얼굴 (가로 · 세로 비율로 찌그러짐)
        const sx = clamp(bw / (R0 * 2), 0.6, 1.8);
        const sy = clamp(bh / (R0 * 2), 0.5, 1.6);
        const vxm = vx.reduce((s, q) => s + q, 0) / N;
        const look = clamp(vxm / 200, -1, 1) * 2;
        for (const s of [-1, 1]) {
          const ex = cx + s * 7 * sx + look;
          const ey = cy - 3 * sy;
          g.fillStyle = '#fff';
          g.beginPath();
          g.ellipse(ex, ey, 3.6 * sx, (blink > 0 ? 0.6 : 4.4) * sy, 0, 0, TAU);
          g.fill();
          if (blink <= 0) {
            g.fillStyle = '#123828';
            g.beginPath();
            g.arc(ex + look * 0.4, ey + 0.6, 2.1 * Math.min(sx, sy), 0, TAU);
            g.fill();
            g.fillStyle = '#fff';
            g.beginPath();
            g.arc(ex + look * 0.4 - 0.7, ey - 0.5, 0.7, 0, TAU);
            g.fill();
          }
        }
        g.strokeStyle = '#123828';
        g.lineWidth = 1;
        g.beginPath();
        g.arc(cx + look, cy + 4 * sy, 3 * sx, 0.15, Math.PI - 0.15);
        g.stroke();
        g.fillStyle = 'rgba(255,140,170,.5)';
        for (const s of [-1, 1]) {
          g.beginPath();
          g.ellipse(cx + s * 12 * sx, cy + 3 * sy, 2.6, 1.4, 0, 0, TAU);
          g.fill();
        }
        if (debug) {
          g.strokeStyle = 'rgba(0,230,255,.4)';
          g.lineWidth = 0.5;
          for (let i = 0; i < N; i++) {
            const j = (i + 2) % N;
            g.beginPath();
            g.moveTo(x[i]!, y[i]!);
            g.lineTo(x[j]!, y[j]!);
            g.stroke();
          }
          const A = area();
          const sgn = A > 0 ? 1 : -1;
          for (let i = 0; i < N; i++) {
            const j = (i + 1) % N;
            const mx = (x[i]! + x[j]!) / 2;
            const my = (y[i]! + y[j]!) / 2;
            const ex = x[j]! - x[i]!;
            const ey = y[j]! - y[i]!;
            const l = Math.hypot(ex, ey) || 1;
            const k = clamp(lastP / 900, -1.2, 1.2) * 8;
            if (Math.abs(k) > 0.6) arrow(g, mx, my, mx + (ey / l) * sgn * k, my + (-ex / l) * sgn * k, k > 0 ? '#ffd166' : '#ff6b8b', 0.8, 2.4);
            g.fillStyle = '#00e5ff';
            g.beginPath();
            g.arc(x[i]!, y[i]!, 1.2, 0, TAU);
            g.fill();
          }
        }
        const ratio = Math.abs(area()) / A0;
        pill(g, `넓이 ${(ratio * 100).toFixed(0)}%`, 272, 10, 7, ratio < 0.85 ? '#e2365b' : 'rgba(10,20,30,.6)', '#fff', 'right');
        if (kP === 0) pill(g, '압력 0 → 납작', 8, 10, 7, '#e2365b', '#fff', 'left');
        else if (v.big) txt(g, '슬라임을 잡아 끌어 던져 보세요', 8, 10, 7, 'rgba(255,255,255,.65)', 'left', 600);
        g.restore();
      },
      dispose() {
        inp.dispose();
      },
    };
  },
};

/* ═══════════ i288 2D 물 표면 ═══════════ */

const i288: Demo2D = {
  kind: '2d',
  caption: '수면 점마다 스프링 하나 + 이웃으로 퍼지기 — 떨어진 물건이 첨벙, 물결이 양옆으로 번진다',
  make() {
    const inp = new Input();
    const N = 72;
    const REST = 104;
    const DX = 280 / (N - 1);
    const hgt = new Float64Array(N);
    const vel = new Float64Array(N);
    const lD = new Float64Array(N);
    const rD = new Float64Array(N);
    let spread = 0.28;
    let damp = 0.04;
    let debug = false;
    interface Obj {
      kind: 0 | 1 | 2;
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      ang: number;
      inW: boolean;
      life: number;
    }
    const objs: Obj[] = [{ kind: 2, x: 200, y: REST - 4, vx: 0, vy: 0, r: 8, ang: 0, inW: true, life: 1e9 }];
    const drops: Part[] = [];
    const bubbles: Part[] = [];
    const R = rng(5);
    let spawnT = 0.6;
    let k = 0;
    const surfAt = (x: number): number => {
      const f = clamp(x / DX, 0, N - 1.001);
      const i = Math.floor(f);
      return REST + lerp(hgt[i]!, hgt[i + 1]!, f - i);
    };
    const splash = (x: number, force: number, wide: number): void => {
      const c = Math.round(x / DX);
      for (let i = -wide; i <= wide; i++) {
        const j = c + i;
        if (j < 0 || j >= N) continue;
        vel[j] = vel[j]! + force * (1 - Math.abs(i) / (wide + 1));
      }
      const n = Math.min(26, Math.round(Math.abs(force) / 8));
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (R() - 0.5) * 1.6;
        const sp = Math.abs(force) * (0.25 + R() * 0.5);
        drops.push({ x: x + (R() - 0.5) * 8, y: surfAt(x) - 1, vx: Math.cos(a) * sp * 0.6, vy: Math.sin(a) * sp, life: 1.2, max: 1.2, size: 1 + R() * 1.4, color: R() < 0.5 ? '#e8f8ff' : '#9edcff', grav: 420, drag: 0.995 });
      }
    };
    const drop = (x: number, kind: 0 | 1): void => {
      objs.push({ kind, x, y: -12, vx: (R() - 0.5) * 20, vy: 40, r: kind === 0 ? 6 : 7, ang: R() * TAU, inW: false, life: 6 });
    };
    const physics = (h: number): void => {
      const K = 0.025 * 3600;
      for (let i = 0; i < N; i++) {
        const a = -K * hgt[i]! - damp * 60 * vel[i]!;
        vel[i] = vel[i]! + a * h;
        hgt[i] = hgt[i]! + vel[i]! * h;
      }
      for (let pass = 0; pass < 6; pass++) {
        for (let i = 0; i < N; i++) {
          lD[i] = i > 0 ? spread * (hgt[i]! - hgt[i - 1]!) : 0;
          rD[i] = i < N - 1 ? spread * (hgt[i]! - hgt[i + 1]!) : 0;
        }
        for (let i = 0; i < N; i++) {
          if (i > 0) {
            hgt[i - 1] = hgt[i - 1]! + lD[i]! * h * 8;
            vel[i - 1] = vel[i - 1]! + lD[i]! * 60 * h * 8;
          }
          if (i < N - 1) {
            hgt[i + 1] = hgt[i + 1]! + rD[i]! * h * 8;
            vel[i + 1] = vel[i + 1]! + rD[i]! * 60 * h * 8;
          }
        }
      }
      for (const o of objs) {
        const s = surfAt(o.x);
        const depth = o.y + o.r - s;
        if (!o.inW && depth > 0) {
          o.inW = true;
          splash(o.x, o.vy * (o.kind === 0 ? 0.5 : 0.38), 2);
        }
        if (o.inW && depth < -o.r * 2) o.inW = false;
        let ay = 300;
        if (depth > 0) {
          const sub = clamp01(depth / (o.r * 2));
          const dens = o.kind === 0 ? 0.55 : o.kind === 1 ? 2.2 : 2.6;
          ay -= sub * dens * 300;
          o.vy *= Math.pow(o.kind === 0 ? 0.7 : 0.08, h);
          o.vx *= Math.pow(0.3, h);
          const slope = (surfAt(o.x + 4) - surfAt(o.x - 4)) / 8;
          o.vx -= slope * 120 * h;
          if (o.kind !== 0) o.ang = lerp(o.ang, Math.atan(slope), 1 - Math.pow(0.02, h));
          const ci = Math.round(o.x / DX);
          if (ci >= 0 && ci < N && Math.abs(o.vy) > 15) vel[ci] = vel[ci]! + o.vy * 0.02;
          if (o.kind === 0 && R() < 0.15) bubbles.push({ x: o.x + (R() - 0.5) * 6, y: o.y, vx: 0, vy: -30, life: 1, max: 1, size: 0.8 + R(), color: 'rgba(220,245,255,.7)', grav: -10 });
        }
        o.vy += ay * h;
        o.x += o.vx * h;
        o.y += o.vy * h;
        if (o.kind === 0) o.ang += o.vx * h * 0.1;
        if (o.kind === 2) {
          o.vx += (200 - o.x) * 0.3 * h;
          o.ang = clamp(o.ang, -0.6, 0.6);
        }
        if (o.x < 8) o.vx = Math.abs(o.vx);
        if (o.x > 272) o.vx = -Math.abs(o.vx);
        o.life -= h;
      }
      for (let i = objs.length - 1; i >= 0; i--) if (objs[i]!.y > 190 || objs[i]!.life < 0) objs.splice(i, 1);
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i]!;
        if (d.vy > 0 && d.y > surfAt(d.x)) {
          const ci = Math.round(d.x / DX);
          if (ci >= 0 && ci < N) vel[ci] = vel[ci]! + d.vy * 0.04 * d.size;
          drops.splice(i, 1);
        }
      }
      stepParts(drops, h);
      stepParts(bubbles, h);
      for (let i = bubbles.length - 1; i >= 0; i--) if (bubbles[i]!.y < surfAt(bubbles[i]!.x)) bubbles.splice(i, 1);
    };
    const step = fixed(1 / 120);
    return {
      controls: [
        { type: 'range', label: '퍼지는 정도', min: 0, max: 0.45, step: 0.01, value: 0.28, on: (v) => (spread = v) },
        { type: 'range', label: '잦아드는 정도', min: 0.005, max: 0.15, step: 0.005, value: 0.04, on: (v) => (damp = v) },
        { type: 'toggle', label: '스프링 기둥 보기', value: false, on: (v) => (debug = v) },
        { type: 'button', label: '돌 던지기', on: () => drop(40 + R() * 200, 1) },
      ] as Control[],
      draw(g, w, h, t, dt) {
        const v = viewOf(w, h);
        inp.sync(g, v);
        for (const e of inp.take()) if (e.k === 'down') objs.push({ kind: 1, x: clamp(e.x, 10, 270), y: Math.min(e.y, surfAt(e.x) - 14), vx: 0, vy: 160, r: 6, ang: 0, inW: false, life: 6 });
        spawnT -= dt;
        if (spawnT < 0) {
          drop(30 + R() * 140, k % 3 === 2 ? 0 : 1);
          k++;
          spawnT = 1.5 + R() * 0.6;
        }
        step(dt, (H) => physics(H));

        fillBg(g, w, h, '#ff9a7a', '#ffd9a8');
        enter(g, v);
        // 해 · 산
        const sun = g.createRadialGradient(70, 70, 2, 70, 70, 40);
        sun.addColorStop(0, 'rgba(255,250,220,1)');
        sun.addColorStop(0.3, 'rgba(255,230,170,.8)');
        sun.addColorStop(1, 'rgba(255,200,150,0)');
        g.fillStyle = sun;
        g.fillRect(20, 20, 100, 100);
        g.fillStyle = '#c87a8a';
        g.beginPath();
        g.moveTo(-20, REST);
        for (let x = -20; x <= 300; x += 10) g.lineTo(x, REST - 18 - Math.abs(Math.sin(x * 0.018 + 1)) * 26);
        g.lineTo(300, REST);
        g.fill();
        g.fillStyle = '#a8607a';
        g.beginPath();
        g.moveTo(-20, REST);
        for (let x = -20; x <= 300; x += 10) g.lineTo(x, REST - 6 - Math.abs(Math.sin(x * 0.03 + 3)) * 12);
        g.lineTo(300, REST);
        g.fill();
        // 물 몸
        const wpath = (): void => {
          g.beginPath();
          g.moveTo(-40, 200);
          g.lineTo(-40, REST + hgt[0]!);
          for (let i = 0; i < N; i++) g.lineTo(i * DX, REST + hgt[i]!);
          g.lineTo(320, REST + hgt[N - 1]!);
          g.lineTo(320, 200);
          g.closePath();
        };
        // 물 아래 물건 먼저(돌) — 물 위에 반투명 물을 덮는다
        const drawObj = (o: Obj): void => {
          g.save();
          g.translate(o.x, o.y);
          g.rotate(o.ang);
          if (o.kind === 1) {
            const rg = g.createRadialGradient(-2, -2, 1, 0, 0, o.r);
            rg.addColorStop(0, '#c8c3d0');
            rg.addColorStop(1, '#6a6478');
            g.fillStyle = rg;
            g.beginPath();
            g.ellipse(0, 0, o.r * 1.1, o.r * 0.85, 0, 0, TAU);
            g.fill();
            g.strokeStyle = 'rgba(40,30,50,.6)';
            g.lineWidth = 0.7;
            g.stroke();
          } else if (o.kind === 0) {
            const cols = ['#ff5a5a', '#fff', '#3fa9ff', '#ffd23f'];
            for (let s = 0; s < 4; s++) {
              g.fillStyle = cols[s]!;
              g.beginPath();
              g.moveTo(0, 0);
              g.arc(0, 0, o.r, (s / 4) * TAU, ((s + 1) / 4) * TAU);
              g.fill();
            }
            g.fillStyle = 'rgba(255,255,255,.55)';
            g.beginPath();
            g.arc(-2, -2.5, 2, 0, TAU);
            g.fill();
            g.strokeStyle = 'rgba(40,30,50,.5)';
            g.lineWidth = 0.6;
            g.beginPath();
            g.arc(0, 0, o.r, 0, TAU);
            g.stroke();
          } else {
            // 오리
            g.fillStyle = '#ffd23f';
            g.beginPath();
            g.ellipse(0, 1, 10, 6, 0, 0, TAU);
            g.fill();
            g.beginPath();
            g.moveTo(-10, 0);
            g.lineTo(-14, -4);
            g.lineTo(-8, -2);
            g.fill();
            g.beginPath();
            g.arc(5, -6, 5, 0, TAU);
            g.fill();
            g.fillStyle = '#ff8a2a';
            g.beginPath();
            g.ellipse(10.5, -5, 3, 1.5, 0, 0, TAU);
            g.fill();
            g.fillStyle = '#2a1830';
            g.beginPath();
            g.arc(6.5, -7, 1, 0, TAU);
            g.fill();
            g.fillStyle = '#f0b020';
            g.beginPath();
            g.ellipse(-2, 0, 5, 3, 0.3, 0, TAU);
            g.fill();
          }
          g.restore();
        };
        for (const o of objs) if (o.kind !== 2) drawObj(o);
        wpath();
        const wg = g.createLinearGradient(0, REST - 10, 0, 175);
        wg.addColorStop(0, 'rgba(70,170,230,.82)');
        wg.addColorStop(1, 'rgba(25,70,150,.95)');
        g.fillStyle = wg;
        g.fill();
        // 빛 줄
        g.save();
        wpath();
        g.clip();
        g.globalCompositeOperation = 'lighter';
        g.strokeStyle = 'rgba(140,220,255,.1)';
        g.lineWidth = 6;
        for (let i = 0; i < 7; i++) {
          const x0 = ((i * 53 + t * 8) % 340) - 30;
          g.beginPath();
          g.moveTo(x0, REST);
          g.lineTo(x0 - 30, 180);
          g.stroke();
        }
        g.globalCompositeOperation = 'source-over';
        // 반사된 해
        g.fillStyle = 'rgba(255,240,200,.25)';
        for (let i = 0; i < 6; i++) g.fillRect(70 - 12 + Math.sin(t * 2 + i) * 4 - i, REST + 4 + i * 4, 24 - i * 2, 1.2);
        g.restore();
        // 수면 선
        g.strokeStyle = 'rgba(230,250,255,.95)';
        g.lineWidth = 1.4;
        g.beginPath();
        for (let i = 0; i < N; i++) (i ? g.lineTo(i * DX, REST + hgt[i]!) : g.moveTo(0, REST + hgt[i]!));
        g.stroke();
        // 거품
        g.fillStyle = 'rgba(255,255,255,.8)';
        for (let i = 1; i < N - 1; i++) {
          const steep = Math.abs(hgt[i + 1]! - hgt[i - 1]!);
          if (steep > 1.6) {
            g.beginPath();
            g.arc(i * DX, REST + hgt[i]! + 0.5, Math.min(1.8, steep * 0.35), 0, TAU);
            g.fill();
          }
        }
        drawParts(g, bubbles);
        for (const o of objs) if (o.kind === 2) drawObj(o);
        drawParts(g, drops);
        if (debug) {
          for (let i = 0; i < N; i += 1) {
            const yy = REST + hgt[i]!;
            g.strokeStyle = hgt[i]! < 0 ? 'rgba(255,230,90,.8)' : 'rgba(255,120,160,.8)';
            g.lineWidth = 0.7;
            g.beginPath();
            g.moveTo(i * DX, REST);
            g.lineTo(i * DX, yy);
            g.stroke();
            g.fillStyle = '#fff';
            g.beginPath();
            g.arc(i * DX, yy, 0.9, 0, TAU);
            g.fill();
          }
          g.setLineDash([2, 2]);
          g.strokeStyle = 'rgba(255,255,255,.5)';
          g.beginPath();
          g.moveTo(0, REST);
          g.lineTo(280, REST);
          g.stroke();
          g.setLineDash([]);
        }
        if (v.big) txt(g, '물 위를 눌러 돌을 떨어뜨리세요', 140, 10, 7, 'rgba(80,30,40,.7)', 'center', 700);
        g.restore();
      },
      dispose() {
        inp.dispose();
      },
    };
  },
};

/* ═══════════ i289 부서지는 땅 ═══════════ */

const i289: Demo2D = {
  kind: '2d',
  caption: '땅을 칸 지도(비트맵)로 들고 폭발 자리를 동그랗게 지운다 — 남은 땅 위를 꼬마가 걷고 떨어진다',
  make() {
    const inp = new Input();
    const W = 280;
    const H = 175;
    const S = 2;
    const mask = new Uint8Array(W * H);
    let art: HTMLCanvasElement | null = null;
    let boomR = 15;
    let debug = false;
    let seed = 1;
    let shots = 0;
    const solid = (x: number, y: number): boolean => {
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      if (xi < 0 || xi >= W) return false;
      if (yi >= H) return true;
      if (yi < 0) return false;
      return mask[yi * W + xi] === 1;
    };
    const build = (): void => {
      seed++;
      const Rn = rng(seed * 13);
      const p1 = Rn() * TAU;
      const p2 = Rn() * TAU;
      const hs: number[] = [];
      for (let x = 0; x < W; x++) hs.push(108 - Math.sin(x * 0.022 + p1) * 18 - Math.sin(x * 0.061 + p2) * 7 - (x < 50 ? (50 - x) * 0.3 : 0));
      mask.fill(0);
      for (let x = 0; x < W; x++) for (let y = Math.floor(hs[x]!); y < H; y++) mask[y * W + x] = 1;
      // 떠 있는 섬
      const ix = 150 + Rn() * 60;
      for (let y = 46; y < 62; y++) for (let x = Math.floor(ix - 26); x < ix + 26; x++) if (((x - ix) / 26) ** 2 + ((y - 50) / 13) ** 2 < 1 && y > 44) mask[y * W + x] = 1;
      if (!art) art = mkCanvas(W * S, H * S);
      const g = art.getContext('2d')!;
      g.setTransform(S, 0, 0, S, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.clearRect(0, 0, W, H);
      // 흙 층
      const shape = (): void => {
        g.beginPath();
        g.moveTo(0, H);
        for (let x = 0; x < W; x++) g.lineTo(x, hs[x]!);
        g.lineTo(W, H);
        g.closePath();
        g.moveTo(ix + 26, 50);
        g.ellipse(ix, 50, 26, 13, 0, 0, Math.PI);
        g.lineTo(ix - 26, 50);
        g.closePath();
      };
      shape();
      const dg = g.createLinearGradient(0, 40, 0, H);
      dg.addColorStop(0, '#b97a4a');
      dg.addColorStop(0.5, '#8f5432');
      dg.addColorStop(1, '#5e3420');
      g.fillStyle = dg;
      g.fill();
      g.save();
      shape();
      g.clip();
      for (let i = 0; i < 6; i++) {
        g.strokeStyle = i % 2 ? 'rgba(255,220,170,.08)' : 'rgba(50,20,10,.15)';
        g.lineWidth = 3;
        g.beginPath();
        for (let x = 0; x <= W; x += 6) g.lineTo(x, 118 + i * 10 + Math.sin(x * 0.04 + i) * 3);
        g.stroke();
      }
      for (let i = 0; i < 140; i++) {
        g.fillStyle = Rn() < 0.5 ? 'rgba(60,30,15,.35)' : 'rgba(230,190,140,.25)';
        g.beginPath();
        g.ellipse(Rn() * W, 50 + Rn() * 125, 1 + Rn() * 2, 0.7 + Rn(), Rn() * 3, 0, TAU);
        g.fill();
      }
      g.restore();
      // 풀 윗면
      g.strokeStyle = '#59c94f';
      g.lineWidth = 4;
      g.lineJoin = 'round';
      g.beginPath();
      for (let x = 0; x < W; x++) (x ? g.lineTo(x, hs[x]! + 1.2) : g.moveTo(x, hs[x]! + 1.2));
      g.stroke();
      g.beginPath();
      g.ellipse(ix, 50.5, 25, 1, 0, Math.PI, TAU);
      g.stroke();
      g.strokeStyle = '#a6ef8c';
      g.lineWidth = 1;
      g.beginPath();
      for (let x = 0; x < W; x++) (x ? g.lineTo(x, hs[x]!) : g.moveTo(x, hs[x]!));
      g.stroke();
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(255,255,255,.04)';
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'source-over';
      shots = 0;
      tank.y = 0;
      walker.y = 0;
      walker.x = 230;
    };
    const tank = { x: 26, y: 0, vy: 0, ang: -0.9 };
    const walker = { x: 230, y: 0, vy: 0, dir: -1, t: 0, hurt: 0 };
    const debris: Part[] = [];
    const smoke: Part[] = [];
    const rings: { x: number; y: number; r: number; t: number }[] = [];
    let shake = 0;
    let shell: { x: number; y: number; vx: number; vy: number; tr: { x: number; y: number }[] } | null = null;
    let cool = 0.6;
    const R = rng(77);
    const explode = (ex: number, ey: number, r: number): void => {
      for (let y = Math.max(0, Math.floor(ey - r)); y < Math.min(H, ey + r + 1); y++)
        for (let x = Math.max(0, Math.floor(ex - r)); x < Math.min(W, ex + r + 1); x++) if ((x - ex) ** 2 + (y - ey) ** 2 <= r * r) mask[y * W + x] = 0;
      const g = art!.getContext('2d')!;
      g.setTransform(S, 0, 0, S, 0, 0);
      // 그을음 테두리
      g.globalCompositeOperation = 'source-atop';
      const sg = g.createRadialGradient(ex, ey, r * 0.9, ex, ey, r + 4);
      sg.addColorStop(0, 'rgba(30,12,5,.85)');
      sg.addColorStop(0.5, 'rgba(60,25,10,.45)');
      sg.addColorStop(1, 'rgba(60,25,10,0)');
      g.fillStyle = sg;
      g.beginPath();
      g.arc(ex, ey, r + 4, 0, TAU);
      g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.beginPath();
      g.arc(ex, ey, r, 0, TAU);
      g.fill();
      g.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 22; i++) {
        const a = R() * TAU;
        const sp = 40 + R() * 110;
        debris.push({ x: ex + Math.cos(a) * r * 0.6, y: ey + Math.sin(a) * r * 0.6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 1 + R() * 0.6, max: 1.6, size: 1 + R() * 1.6, color: R() < 0.3 ? '#59c94f' : R() < 0.6 ? '#9b603a' : '#6e4127', grav: 380, drag: 0.99 });
      }
      for (let i = 0; i < 10; i++) {
        const a = R() * TAU;
        smoke.push({ x: ex, y: ey, vx: Math.cos(a) * 25, vy: Math.sin(a) * 25 - 15, life: 1.1, max: 1.1, size: 5 + R() * 5, color: 'rgba(80,70,90,.4)', grav: -20, drag: 0.95 });
      }
      rings.push({ x: ex, y: ey, r, t: 0 });
      shake = 0.25;
      if (Math.hypot(walker.x - ex, walker.y - 6 - ey) < r + 10) {
        walker.vy = -140;
        walker.hurt = 0.8;
      }
    };
    const ground = (x: number, y: number): number => {
      // y 부근에서 위로 올라갈 땅 높이 (발 놓을 곳)
      let yy = Math.floor(y);
      while (yy > 0 && solid(x, yy - 1)) yy--;
      return yy;
    };
    const physics = (h: number): void => {
      // 대포
      if (!solid(tank.x, tank.y + 1)) {
        tank.vy += 400 * h;
        tank.y += tank.vy * h;
        if (solid(tank.x, tank.y)) {
          tank.y = ground(tank.x, tank.y);
          tank.vy = 0;
        }
        if (tank.y > H + 20) tank.y = 0;
      } else tank.y = ground(tank.x, tank.y);
      // 꼬마
      walker.t += h;
      walker.hurt -= h;
      if (solid(walker.x, walker.y + 1) && walker.vy >= 0) {
        walker.vy = 0;
        const nx = walker.x + walker.dir * 18 * h;
        const gy = ground(nx, walker.y);
        if (walker.y - gy > 4 || nx < 150 || nx > 272) walker.dir *= -1;
        else {
          walker.x = nx;
          walker.y = solid(nx, walker.y + 1) ? gy : walker.y;
        }
      } else {
        walker.vy += 400 * h;
        walker.y += walker.vy * h;
        if (walker.vy > 0 && solid(walker.x, walker.y)) {
          walker.y = ground(walker.x, walker.y);
          walker.vy = 0;
        }
        if (walker.y > H + 10) {
          walker.y = 0;
          walker.x = 200 + R() * 60;
        }
      }
      // 포탄
      if (shell) {
        const s = shell;
        const n = 4;
        for (let i = 0; i < n && shell; i++) {
          s.vy += (280 * h) / n;
          s.x += (s.vx * h) / n;
          s.y += (s.vy * h) / n;
          if (solid(s.x, s.y) || Math.hypot(walker.x - s.x, walker.y - 6 - s.y) < 6) {
            explode(s.x, s.y, boomR);
            shell = null;
            shots++;
          } else if (s.x > W + 10 || s.y > H + 10) shell = null;
        }
        if (shell) {
          s.tr.push({ x: s.x, y: s.y });
          if (s.tr.length > 14) s.tr.shift();
        }
      } else {
        cool -= h;
        if (cool < 0) {
          if (shots >= 7) build();
          const tx = 120 + R() * 140;
          const vx = 95 + R() * 25;
          const tFly = (tx - tank.x) / vx;
          const ty = 90 + R() * 30;
          const vy = (ty - (tank.y - 8) - 0.5 * 280 * tFly * tFly) / tFly;
          tank.ang = Math.atan2(vy, vx);
          shell = { x: tank.x + Math.cos(tank.ang) * 10, y: tank.y - 8 + Math.sin(tank.ang) * 10, vx, vy, tr: [] };
          cool = 1.1;
        }
      }
      stepParts(debris, h);
      stepParts(smoke, h);
      for (const r of rings) r.t += h;
      while (rings.length && rings[0]!.t > 0.4) rings.shift();
      shake = Math.max(0, shake - h);
    };
    build();
    const step = fixed(1 / 120);
    return {
      controls: [
        { type: 'range', label: '폭발 크기', min: 6, max: 30, step: 1, value: 15, on: (v) => (boomR = v) },
        { type: 'toggle', label: '칸 지도 보기', value: false, on: (v) => (debug = v) },
        { type: 'button', label: '땅 다시 만들기', on: () => build() },
      ] as Control[],
      draw(g, w, h, t, dt) {
        const v = viewOf(w, h);
        inp.sync(g, v);
        for (const e of inp.take()) if (e.k === 'down') explode(e.x, e.y, boomR);
        step(dt, (H2) => physics(H2));
        fillBg(g, w, h, '#3b2f6b', '#f39a7a');
        enter(g, v);
        if (shake > 0) g.translate((R() - 0.5) * shake * 12, (R() - 0.5) * shake * 12);
        // 먼 산 · 구름
        g.fillStyle = 'rgba(120,80,140,.55)';
        g.beginPath();
        g.moveTo(0, 175);
        for (let x = 0; x <= 280; x += 8) g.lineTo(x, 84 - Math.abs(Math.sin(x * 0.025 + 2)) * 34);
        g.lineTo(280, 175);
        g.fill();
        g.fillStyle = 'rgba(255,230,240,.35)';
        for (let i = 0; i < 3; i++) {
          const cx = ((i * 110 + t * 5) % 340) - 30;
          g.beginPath();
          g.ellipse(cx, 22 + i * 9, 20, 5, 0, 0, TAU);
          g.fill();
        }
        g.drawImage(art!, 0, 0, W, H);
        if (debug) {
          const c = 4;
          for (let y = 0; y < H; y += c)
            for (let x = 0; x < W; x += c) {
              const s = mask[(y + 2) * W + x + 2] === 1;
              g.fillStyle = s ? 'rgba(0,229,255,.18)' : 'rgba(0,0,0,0)';
              if (s) g.fillRect(x + 0.3, y + 0.3, c - 0.6, c - 0.6);
            }
          for (const r of rings) {
            g.strokeStyle = '#ff4d6d';
            g.setLineDash([2, 1.5]);
            g.beginPath();
            g.arc(r.x, r.y, r.r, 0, TAU);
            g.stroke();
            g.setLineDash([]);
          }
        }
        // 대포 (탱크)
        g.save();
        g.translate(tank.x, tank.y);
        g.fillStyle = '#4a5a8a';
        g.save();
        g.translate(0, -8);
        g.rotate(tank.ang);
        rr(g, 0, -2, 13, 4, 2);
        g.fill();
        g.restore();
        const tg = g.createLinearGradient(0, -12, 0, 0);
        tg.addColorStop(0, '#9fb4ff');
        tg.addColorStop(1, '#5469b8');
        g.fillStyle = tg;
        rr(g, -9, -9, 18, 8, 4);
        g.fill();
        g.fillStyle = '#2d3558';
        rr(g, -10, -3, 20, 4, 2);
        g.fill();
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(2, -6, 1.6, 0, TAU);
        g.fill();
        g.fillStyle = '#1a1a33';
        g.beginPath();
        g.arc(2.5, -6, 0.9, 0, TAU);
        g.fill();
        g.restore();
        // 꼬마
        blob(g, walker.x, walker.y, 9, 11, walker.dir, '#fff2a8', '#ffb547', walker.hurt > 0 ? 'hurt' : 'ok');
        // 포탄
        if (shell) {
          shell.tr.forEach((p, i) => {
            g.fillStyle = `rgba(255,220,150,${((i / shell!.tr.length) * 0.5).toFixed(3)})`;
            g.beginPath();
            g.arc(p.x, p.y, 1 + i * 0.08, 0, TAU);
            g.fill();
          });
          g.fillStyle = '#2b2b3a';
          g.beginPath();
          g.arc(shell.x, shell.y, 2.4, 0, TAU);
          g.fill();
          g.fillStyle = '#ffcf6a';
          g.beginPath();
          g.arc(shell.x - 0.7, shell.y - 0.7, 0.8, 0, TAU);
          g.fill();
        }
        // 폭발 빛
        for (const r of rings) {
          const k = r.t / 0.4;
          g.globalCompositeOperation = 'lighter';
          const fg = g.createRadialGradient(r.x, r.y, 0, r.x, r.y, r.r * (1 + k));
          fg.addColorStop(0, `rgba(255,240,180,${(0.9 * (1 - k)).toFixed(3)})`);
          fg.addColorStop(0.5, `rgba(255,140,60,${(0.6 * (1 - k)).toFixed(3)})`);
          fg.addColorStop(1, 'rgba(255,80,40,0)');
          g.fillStyle = fg;
          g.beginPath();
          g.arc(r.x, r.y, r.r * (1 + k), 0, TAU);
          g.fill();
          g.globalCompositeOperation = 'source-over';
          g.strokeStyle = `rgba(255,255,255,${(0.8 * (1 - k)).toFixed(3)})`;
          g.lineWidth = 1.2;
          g.beginPath();
          g.arc(r.x, r.y, r.r * (0.6 + k * 1.2), 0, TAU);
          g.stroke();
        }
        drawParts(g, smoke);
        drawParts(g, debris);
        if (v.big) txt(g, '아무 곳이나 눌러 터뜨리기', 272, 9, 7, 'rgba(255,255,255,.8)', 'right', 700);
        g.restore();
      },
      dispose() {
        inp.dispose();
      },
    };
  },
};

/* ═══════════ i290 궤도 · 중력 우물 ═══════════ */

const i290: Demo2D = {
  kind: '2d',
  caption: '행성 중력으로 휘는 길을 미리 계산해 점선으로 — 조준이 바뀌면 궤적이 바로 따라 바뀐다',
  make() {
    const inp = new Input();
    let mass = 1;
    let preview = true;
    let grid = true;
    const PL = [
      { x: 150, y: 96, gm: 3.6e5, r: 17, c1: '#ffcf8a', c2: '#e2603a', ring: true },
      { x: 222, y: 50, gm: 0.9e5, r: 8, c1: '#d6f0ff', c2: '#6c8fd8', ring: false },
    ];
    const LA = { x: 28, y: 146 };
    const GOAL = { x: 256, y: 128, r: 10 };
    const H = 1 / 120;
    const acc = (x: number, y: number): [number, number] => {
      let ax = 0;
      let ay = 0;
      for (const p of PL) {
        const dx = p.x - x;
        const dy = p.y - y;
        const d2 = dx * dx + dy * dy + 30;
        const f = (p.gm * mass) / (d2 * Math.sqrt(d2));
        ax += dx * f;
        ay += dy * f;
      }
      return [ax, ay];
    };
    type End = 'hit' | 'goal' | 'out' | 'none';
    const sim = (vx: number, vy: number, steps: number, keep: boolean): { pts: number[]; end: End } => {
      let x = LA.x;
      let y = LA.y;
      const pts: number[] = [];
      for (let i = 0; i < steps; i++) {
        const [ax, ay] = acc(x, y);
        vx += ax * H;
        vy += ay * H;
        x += vx * H;
        y += vy * H;
        if (keep && i % 3 === 0) pts.push(x, y);
        for (const p of PL) if (Math.hypot(p.x - x, p.y - y) < p.r) return { pts, end: 'hit' };
        if (Math.hypot(GOAL.x - x, GOAL.y - y) < GOAL.r) return { pts, end: 'goal' };
        if (x < -40 || x > 320 || y < -60 || y > 215) return { pts, end: 'out' };
      }
      return { pts, end: 'none' };
    };
    let good: [number, number][] = [];
    let bad: [number, number][] = [];
    const search = (): void => {
      good = [];
      bad = [];
      for (let sp = 120; sp <= 200; sp += 20)
        for (let a = -1.45; a <= -0.05; a += 0.02) {
          const r = sim(Math.cos(a) * sp, Math.sin(a) * sp, 900, false);
          if (r.end === 'goal') good.push([a, sp]);
          else if (r.end === 'hit') bad.push([a, sp]);
        }
    };
    search();
    let phase = 0;
    let cyc = 0;
    let aimA = -0.8;
    let aimS = 150;
    let plan: [number, number] = [-0.8, 150];
    const pickPlan = (): void => {
      const list = cyc % 2 === 0 && good.length ? good : bad.length ? bad : good;
      const R = rng(cyc * 31 + 5);
      plan = list.length ? list[Math.floor(R() * list.length)]! : [-0.8, 150];
    };
    pickPlan();
    let ship: { x: number; y: number; vx: number; vy: number; tr: number[]; t: number } | null = null;
    let result: { s: string; t: number; x: number; y: number; ok: boolean } | null = null;
    const boom: Part[] = [];
    let aiming = false;
    const stars: number[] = [];
    {
      const R = rng(9);
      for (let i = 0; i < 90; i++) stars.push(R() * 280, R() * 175, R() * 0.9 + 0.2, R() * 6);
    }
    const fire = (vx: number, vy: number): void => {
      ship = { x: LA.x, y: LA.y, vx, vy, tr: [], t: 0 };
      result = null;
    };
    const step = fixed(H);
    return {
      controls: [
        { type: 'range', label: '행성 질량', min: 0.3, max: 2, step: 0.05, value: 1, on: (v) => ((mass = v), search(), pickPlan()) },
        { type: 'toggle', label: '미리 보는 궤적 점선', value: true, on: (v) => (preview = v) },
        { type: 'toggle', label: '중력 우물 격자', value: true, on: (v) => (grid = v) },
      ] as Control[],
      draw(g, w, h, t, dt) {
        const v = viewOf(w, h);
        inp.sync(g, v);
        for (const e of inp.take()) {
          if (e.k === 'down' && Math.hypot(e.x - LA.x, e.y - LA.y) < 40) {
            aiming = true;
            cyc = -1;
          } else if (e.k === 'up' && aiming) {
            aiming = false;
            fire(Math.cos(aimA) * aimS, Math.sin(aimA) * aimS);
            phase = 99;
          }
        }
        if (aiming) {
          const dx = LA.x - inp.x;
          const dy = LA.y - inp.y;
          aimA = Math.atan2(dy, dx);
          aimS = clamp(Math.hypot(dx, dy) * 4, 40, 260);
        } else if (cyc >= 0) {
          phase += dt;
          if (phase < 1.8) {
            const k = phase / 1.8;
            const e = 1 - Math.pow(1 - k, 3);
            aimA = plan[0] + Math.sin(k * 7) * 0.35 * (1 - e);
            aimS = plan[1];
          } else if (!ship && phase < 2) fire(Math.cos(plan[0]) * plan[1], Math.sin(plan[0]) * plan[1]);
          if (phase > 7) {
            cyc++;
            phase = 0;
            ship = null;
            result = null;
            pickPlan();
          }
        } else if (!ship && !aiming) {
          // 손으로 쏜 뒤 다시 자동으로
          phase += dt;
          if (phase > 103) {
            cyc = 0;
            phase = 0;
            pickPlan();
          }
        }
        step(dt, (H2) => {
          if (!ship) return;
          const s = ship;
          const [ax, ay] = acc(s.x, s.y);
          s.vx += ax * H2;
          s.vy += ay * H2;
          s.x += s.vx * H2;
          s.y += s.vy * H2;
          s.t += H2;
          if (Math.floor(s.t * 60) % 2 === 0) {
            s.tr.push(s.x, s.y);
            if (s.tr.length > 160) s.tr.splice(0, 2);
          }
          for (const p of PL)
            if (Math.hypot(p.x - s.x, p.y - s.y) < p.r) {
              for (let i = 0; i < 26; i++) {
                const a = Math.random() * TAU;
                const sp = 30 + Math.random() * 80;
                boom.push({ x: s.x, y: s.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.7, max: 0.7, size: 1.4, color: i % 3 ? '#ffb347' : '#fff1a8', grav: 0 });
              }
              result = { s: '쾅!', t: 0, x: s.x, y: s.y, ok: false };
              ship = null;
              return;
            }
          if (Math.hypot(GOAL.x - s.x, GOAL.y - s.y) < GOAL.r) {
            for (let i = 0; i < 24; i++) {
              const a = (i / 24) * TAU;
              boom.push({ x: GOAL.x, y: GOAL.y, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, life: 0.8, max: 0.8, size: 1.3, color: '#fff6a8', grav: 0 });
            }
            result = { s: '도착!', t: 0, x: GOAL.x, y: GOAL.y - 16, ok: true };
            ship = null;
            return;
          }
          if (s.x < -40 || s.x > 320 || s.y < -60 || s.y > 215) ship = null;
        });
        stepParts(boom, dt);
        if (result) result.t += dt;

        fillBg(g, w, h, '#070a1e', '#141a3d');
        enter(g, v);
        for (let i = 0; i < stars.length; i += 4) {
          g.globalAlpha = 0.35 + 0.5 * Math.abs(Math.sin(t * 0.8 + stars[i + 3]!));
          g.fillStyle = '#fff';
          g.fillRect(stars[i]!, stars[i + 1]!, stars[i + 2]!, stars[i + 2]!);
        }
        g.globalAlpha = 1;
        // 중력 우물 격자
        if (grid) {
          const warp = (x: number, y: number): [number, number] => {
            let wx = x;
            let wy = y;
            for (const p of PL) {
              const dx = p.x - x;
              const dy = p.y - y;
              const d = Math.hypot(dx, dy) || 1;
              const pull = Math.min(d * 0.85, (p.gm * mass) / 9000 / (d + 10));
              wx += (dx / d) * pull;
              wy += (dy / d) * pull;
            }
            return [wx, wy];
          };
          g.strokeStyle = 'rgba(110,140,255,.17)';
          g.lineWidth = 0.6;
          for (let x = 0; x <= 280; x += 14) {
            g.beginPath();
            for (let y = 0; y <= 175; y += 7) {
              const [a, b] = warp(x, y);
              if (y) g.lineTo(a, b);
              else g.moveTo(a, b);
            }
            g.stroke();
          }
          for (let y = 0; y <= 175; y += 14) {
            g.beginPath();
            for (let x = 0; x <= 280; x += 7) {
              const [a, b] = warp(x, y);
              if (x) g.lineTo(a, b);
              else g.moveTo(a, b);
            }
            g.stroke();
          }
        }
        // 목표 별
        g.save();
        g.translate(GOAL.x, GOAL.y);
        g.rotate(t * 0.8);
        g.globalCompositeOperation = 'lighter';
        const gg = g.createRadialGradient(0, 0, 0, 0, 0, 16);
        gg.addColorStop(0, 'rgba(255,240,150,.7)');
        gg.addColorStop(1, 'rgba(255,200,80,0)');
        g.fillStyle = gg;
        g.beginPath();
        g.arc(0, 0, 16, 0, TAU);
        g.fill();
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = '#ffe066';
        g.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 3.2 : 7.5;
          const a = (i / 10) * TAU - Math.PI / 2;
          if (i) g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          else g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        g.closePath();
        g.fill();
        g.strokeStyle = '#c98a00';
        g.lineWidth = 0.6;
        g.stroke();
        g.restore();
        // 행성
        for (const p of PL) {
          g.globalCompositeOperation = 'lighter';
          const halo = g.createRadialGradient(p.x, p.y, p.r * 0.8, p.x, p.y, p.r * 2.2);
          halo.addColorStop(0, 'rgba(255,170,120,.25)');
          halo.addColorStop(1, 'rgba(255,170,120,0)');
          g.fillStyle = halo;
          g.beginPath();
          g.arc(p.x, p.y, p.r * 2.2, 0, TAU);
          g.fill();
          g.globalCompositeOperation = 'source-over';
          if (p.ring) {
            g.strokeStyle = 'rgba(255,220,170,.55)';
            g.lineWidth = 2;
            g.beginPath();
            g.ellipse(p.x, p.y, p.r * 1.8, p.r * 0.45, -0.3, Math.PI, TAU);
            g.stroke();
          }
          const pg = g.createRadialGradient(p.x - p.r * 0.4, p.y - p.r * 0.4, 1, p.x, p.y, p.r);
          pg.addColorStop(0, p.c1);
          pg.addColorStop(1, p.c2);
          g.fillStyle = pg;
          g.beginPath();
          g.arc(p.x, p.y, p.r * Math.sqrt(mass) ** 0.3, 0, TAU);
          g.fill();
          g.save();
          g.clip();
          g.strokeStyle = 'rgba(255,255,255,.15)';
          g.lineWidth = 2;
          for (let k = -2; k <= 2; k++) {
            g.beginPath();
            g.moveTo(p.x - p.r, p.y + k * p.r * 0.35);
            g.lineTo(p.x + p.r, p.y + k * p.r * 0.35 - 3);
            g.stroke();
          }
          g.fillStyle = 'rgba(0,0,30,.3)';
          g.beginPath();
          g.arc(p.x + p.r * 0.5, p.y + p.r * 0.5, p.r, 0, TAU);
          g.fill();
          g.restore();
          if (p.ring) {
            g.strokeStyle = 'rgba(255,220,170,.75)';
            g.lineWidth = 2;
            g.beginPath();
            g.ellipse(p.x, p.y, p.r * 1.8, p.r * 0.45, -0.3, 0, Math.PI);
            g.stroke();
          }
        }
        // 미리 보기 점선
        const aimV: [number, number] = [Math.cos(aimA) * aimS, Math.sin(aimA) * aimS];
        if (preview && !ship && (aiming || (cyc >= 0 && phase < 2))) {
          const r = sim(aimV[0], aimV[1], 700, true);
          const n = r.pts.length / 2;
          for (let i = 0; i < n; i += 2) {
            const k = 1 - i / n;
            g.fillStyle = r.end === 'goal' ? `rgba(140,255,190,${(0.25 + 0.7 * k).toFixed(3)})` : r.end === 'hit' ? `rgba(255,130,130,${(0.25 + 0.7 * k).toFixed(3)})` : `rgba(200,220,255,${(0.2 + 0.7 * k).toFixed(3)})`;
            g.beginPath();
            g.arc(r.pts[i * 2]!, r.pts[i * 2 + 1]!, 1.1, 0, TAU);
            g.fill();
          }
          if (r.pts.length) {
            const ex = r.pts[r.pts.length - 2]!;
            const ey = r.pts[r.pts.length - 1]!;
            pill(g, r.end === 'goal' ? '도착 예상' : r.end === 'hit' ? '충돌 예상' : '날아감', ex, ey - 9, 5.5, r.end === 'goal' ? '#22b36b' : r.end === 'hit' ? '#e2365b' : '#55608f');
          }
        }
        // 지나온 길
        if (ship) {
          const s = ship;
          for (let i = 0; i < s.tr.length; i += 2) {
            g.fillStyle = `rgba(120,220,255,${((i / s.tr.length) * 0.8).toFixed(3)})`;
            g.beginPath();
            g.arc(s.tr[i]!, s.tr[i + 1]!, 0.9, 0, TAU);
            g.fill();
          }
        }
        // 발사대
        g.fillStyle = '#3c4470';
        rr(g, LA.x - 10, LA.y + 4, 20, 8, 3);
        g.fill();
        g.strokeStyle = '#8c6a48';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(LA.x - 6, LA.y + 6);
        g.lineTo(LA.x - 7, LA.y - 6);
        g.moveTo(LA.x + 6, LA.y + 6);
        g.lineTo(LA.x + 7, LA.y - 6);
        g.stroke();
        if (aiming) {
          g.strokeStyle = '#ffcf6a';
          g.lineWidth = 0.8;
          g.beginPath();
          g.moveTo(LA.x - 7, LA.y - 6);
          g.lineTo(inp.x, inp.y);
          g.lineTo(LA.x + 7, LA.y - 6);
          g.stroke();
        }
        // 우주선
        const drawShip = (x: number, y: number, a: number, flame: boolean): void => {
          g.save();
          g.translate(x, y);
          g.rotate(a);
          if (flame) {
            g.globalCompositeOperation = 'lighter';
            g.fillStyle = 'rgba(255,170,60,.9)';
            g.beginPath();
            g.moveTo(-5, -2);
            g.lineTo(-10 - Math.random() * 4, 0);
            g.lineTo(-5, 2);
            g.fill();
            g.globalCompositeOperation = 'source-over';
          }
          g.fillStyle = '#f2f4ff';
          g.beginPath();
          g.moveTo(7, 0);
          g.quadraticCurveTo(2, -4.5, -5, -3.5);
          g.lineTo(-5, 3.5);
          g.quadraticCurveTo(2, 4.5, 7, 0);
          g.fill();
          g.fillStyle = '#ff5d6c';
          g.beginPath();
          g.moveTo(-3, -3.5);
          g.lineTo(-6.5, -6);
          g.lineTo(-5, -1.5);
          g.moveTo(-3, 3.5);
          g.lineTo(-6.5, 6);
          g.lineTo(-5, 1.5);
          g.fill();
          g.fillStyle = '#5bc8ff';
          g.beginPath();
          g.arc(1.5, 0, 1.6, 0, TAU);
          g.fill();
          g.restore();
        };
        if (ship) drawShip(ship.x, ship.y, Math.atan2(ship.vy, ship.vx), true);
        else if (!result || result.t > 1.2) drawShip(LA.x, LA.y - 2, aimA, false);
        drawParts(g, boom, true);
        if (result && result.t < 1.6) pill(g, result.s, result.x, result.y - result.t * 6, 8, result.ok ? '#22b36b' : '#e2365b');
        txt(g, v.big ? '발사대를 뒤로 당겼다 놓기' : '조준 → 궤적 미리 보기 → 발사', 8, 9, 7, 'rgba(220,230,255,.7)', 'left', 700);
        g.restore();
      },
      dispose() {
        inp.dispose();
      },
    };
  },
};

/* ═══════════ i291 탄막 무늬 ═══════════ */

const i291: Demo2D = {
  kind: '2d',
  caption: '각도를 조금씩 돌려 가며 쏘기만 했는데 — 나선 · 꽃 · 물결이 된다 (수식 = 무늬)',
  make() {
    const inp = new Input(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
    const COLS = ['#ff5fa2', '#ffd23f', '#4be3ff', '#9b7bff', '#5cff9a'];
    const spr = COLS.map((c) => {
      const cv = mkCanvas(32, 32);
      const g = cv.getContext('2d')!;
      const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.28, '#ffffff');
      gr.addColorStop(0.42, c);
      gr.addColorStop(0.7, c + '55');
      gr.addColorStop(1, c + '00');
      g.fillStyle = gr;
      g.fillRect(0, 0, 32, 32);
      return cv;
    });
    let pat = 0;
    let patT = 0;
    let alpha = 13;
    let speedK = 1;
    let showForm = true;
    let debug = false;
    interface Bul {
      x: number;
      y: number;
      vx: number;
      vy: number;
      c: number;
      ax: number;
    }
    const bs: Bul[] = [];
    let n = 0;
    let em = 0;
    let lastAng = 0;
    const boss = { x: 140, y: 46 };
    const pl = { x: 140, y: 152, hit: 0, graze: 0 };
    const sparks: Part[] = [];
    const NAMES = ['나선', '꽃', '물결', '맞도는 나선'];
    const shoot = (a: number, sp: number, c: number, ax = 0): void => {
      if (bs.length > 900) return;
      bs.push({ x: boss.x + Math.cos(a) * 8, y: boss.y + Math.sin(a) * 8, vx: Math.cos(a) * sp * speedK, vy: Math.sin(a) * sp * speedK, c, ax });
      lastAng = a;
    };
    const D = Math.PI / 180;
    const emit = (h: number, t: number): void => {
      em -= h;
      if (em > 0) return;
      if (pat === 0) {
        for (let k = 0; k < 3; k++) shoot(n * alpha * D + (k * TAU) / 3, 62, k % 2 ? 0 : 3);
        n++;
        em += 0.04;
      } else if (pat === 1) {
        const rot = n * 7 * D;
        for (let i = 0; i < 40; i++) {
          const a = (i / 40) * TAU + rot;
          shoot(a, 46 * (1 + 0.5 * Math.cos(5 * (a - rot))), n % 2 ? 0 : 1);
        }
        n++;
        em += 0.42;
      } else if (pat === 2) {
        const base = 90 * D + 55 * D * Math.sin(2.2 * t);
        for (const o of [-20, 0, 20]) shoot(base + o * D, 78, 2);
        n++;
        em += 0.045;
      } else {
        const a = n * alpha * 0.9 * D;
        for (let k = 0; k < 4; k++) {
          shoot(a + (k * TAU) / 4, 58, 4);
          shoot(-a + (k * TAU) / 4 + 0.4, 58, 3);
        }
        n++;
        em += 0.07;
      }
    };
    const FORM = ['θ = n × α  (세 갈래: +120°)', '속도 = v · (1 + ½ cos 5θ)', 'θ = 90° + 55° · sin(2.2t)', 'θ₁ = +n·α ,  θ₂ = −n·α'];
    const next = (): void => {
      pat = (pat + 1) % 4;
      patT = 0;
      n = 0;
      em = 0.3;
    };
    let time = 0;
    const step = fixed(1 / 120);
    return {
      controls: [
        { type: 'button', label: '다음 무늬', on: () => next() },
        { type: 'range', label: '한 발마다 도는 각 α (°)', min: 1, max: 60, step: 0.5, value: 13, on: (v) => (alpha = v) },
        { type: 'range', label: '탄 빠르기', min: 0.4, max: 2, step: 0.05, value: 1, on: (v) => (speedK = v) },
        { type: 'toggle', label: '수식 보기', value: true, on: (v) => (showForm = v) },
        { type: 'toggle', label: '맞는 원 보기', value: false, on: (v) => (debug = v) },
      ] as Control[],
      draw(g, w, h, _t, dt) {
        const v = viewOf(w, h);
        inp.sync(g, v);
        const manual = v.big && inp.idle() < 5;
        step(dt, (H) => {
          time += H;
          patT += H;
          if (patT > 5.5 && !v.big) next();
          else if (patT > 8) next();
          boss.x = 140 + Math.sin(time * 0.6) * 18;
          boss.y = 46 + Math.sin(time * 1.3) * 4;
          if (patT > 0.3) emit(H, time);
          for (let i = bs.length - 1; i >= 0; i--) {
            const b = bs[i]!;
            b.x += b.vx * H;
            b.y += b.vy * H;
            if (b.x < -10 || b.x > 290 || b.y < -10 || b.y > 185) bs.splice(i, 1);
          }
          // 플레이어
          if (manual) {
            const sp = 85;
            pl.x += ((inp.key('ArrowRight') ? 1 : 0) - (inp.key('ArrowLeft') ? 1 : 0)) * sp * H;
            pl.y += ((inp.key('ArrowDown') ? 1 : 0) - (inp.key('ArrowUp') ? 1 : 0)) * sp * H;
          } else {
            let best = pl.x;
            let by = pl.y;
            let bestS = Infinity;
            for (let dx = -12; dx <= 12; dx += 4)
              for (let dy = -8; dy <= 8; dy += 8) {
                const cx = pl.x + dx;
                const cy = pl.y + dy;
                let s = Math.abs(cx - 140) * 0.002 + Math.abs(cy - 150) * 0.004;
                for (const b of bs) {
                  const fx = b.x + b.vx * 0.15;
                  const fy = b.y + b.vy * 0.15;
                  const d2 = (fx - cx) ** 2 + (fy - cy) ** 2;
                  if (d2 < 900) s += 1 / (d2 + 6);
                  const d3 = (b.x - cx) ** 2 + (b.y - cy) ** 2;
                  if (d3 < 400) s += 1 / (d3 + 4);
                }
                if (s < bestS) {
                  bestS = s;
                  best = cx;
                  by = cy;
                }
              }
            pl.x += clamp(best - pl.x, -90 * H, 90 * H);
            pl.y += clamp(by - pl.y, -60 * H, 60 * H);
          }
          pl.x = clamp(pl.x, 10, 270);
          pl.y = clamp(pl.y, 100, 168);
          pl.hit -= H;
          for (const b of bs) {
            const d = Math.hypot(b.x - pl.x, b.y - pl.y);
            if (d < 3.6 && pl.hit < 0) {
              pl.hit = 0.6;
              for (let i = 0; i < 10; i++) {
                const a = Math.random() * TAU;
                sparks.push({ x: pl.x, y: pl.y, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, life: 0.4, max: 0.4, size: 1.2, color: '#fff', grav: 0 });
              }
            } else if (d < 9 && Math.random() < 0.05) {
              pl.graze++;
              sparks.push({ x: (b.x + pl.x) / 2, y: (b.y + pl.y) / 2, vx: (Math.random() - 0.5) * 30, vy: -20, life: 0.25, max: 0.25, size: 0.8, color: '#fff6a8', grav: 0 });
            }
          }
          stepParts(sparks, H);
        });

        fillBg(g, w, h, '#0b0820', '#1c1240');
        enter(g, v);
        // 극좌표 눈금
        g.strokeStyle = 'rgba(160,140,255,.12)';
        g.lineWidth = 0.6;
        for (let r = 20; r < 200; r += 20) {
          g.beginPath();
          g.arc(boss.x, boss.y, r, 0, TAU);
          g.stroke();
        }
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * TAU;
          g.beginPath();
          g.moveTo(boss.x, boss.y);
          g.lineTo(boss.x + Math.cos(a) * 300, boss.y + Math.sin(a) * 300);
          g.stroke();
        }
        // 지금 쏘는 각
        g.strokeStyle = 'rgba(255,255,255,.45)';
        g.setLineDash([2, 2]);
        g.beginPath();
        g.moveTo(boss.x, boss.y);
        g.lineTo(boss.x + Math.cos(lastAng) * 28, boss.y + Math.sin(lastAng) * 28);
        g.stroke();
        g.setLineDash([]);
        // 탄
        g.globalCompositeOperation = 'lighter';
        for (const b of bs) g.drawImage(spr[b.c]!, b.x - 5, b.y - 5, 10, 10);
        g.globalCompositeOperation = 'source-over';
        // 보스 (구름 유령)
        g.save();
        g.translate(boss.x, boss.y);
        const bgr = g.createRadialGradient(-4, -5, 1, 0, 0, 15);
        bgr.addColorStop(0, '#fff');
        bgr.addColorStop(1, '#c9b8ff');
        g.fillStyle = bgr;
        g.beginPath();
        g.arc(0, -2, 11, Math.PI, 0);
        for (let k = 0; k <= 4; k++) g.lineTo(11 - k * 5.5, 7 + (k % 2 ? -3 : 0) + Math.sin(time * 6 + k) * 0.8);
        g.closePath();
        g.fill();
        g.strokeStyle = '#6a52c8';
        g.lineWidth = 0.9;
        g.stroke();
        for (const s of [-1, 1]) {
          g.fillStyle = '#2a1850';
          g.beginPath();
          g.ellipse(s * 4, -3, 1.7, 2.4, 0, 0, TAU);
          g.fill();
        }
        g.fillStyle = 'rgba(255,120,170,.6)';
        g.beginPath();
        g.ellipse(-7, 1, 2, 1.1, 0, 0, TAU);
        g.ellipse(7, 1, 2, 1.1, 0, 0, TAU);
        g.fill();
        g.restore();
        // 플레이어
        g.save();
        g.translate(pl.x, pl.y);
        if (pl.hit > 0 && Math.floor(pl.hit * 20) % 2) g.globalAlpha = 0.35;
        g.fillStyle = '#7ef0ff';
        g.beginPath();
        g.moveTo(0, -7);
        g.lineTo(5, 5);
        g.lineTo(0, 3);
        g.lineTo(-5, 5);
        g.closePath();
        g.fill();
        g.strokeStyle = '#1a6c8a';
        g.lineWidth = 0.7;
        g.stroke();
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(0, 0, 1.4, 0, TAU);
        g.fill();
        g.globalAlpha = 1;
        g.restore();
        drawParts(g, sparks, true);
        if (debug) {
          g.strokeStyle = 'rgba(255,80,120,.8)';
          g.lineWidth = 0.5;
          for (const b of bs) {
            g.beginPath();
            g.arc(b.x, b.y, 2.2, 0, TAU);
            g.stroke();
          }
          g.strokeStyle = '#5cff9a';
          g.beginPath();
          g.arc(pl.x, pl.y, 1.4, 0, TAU);
          g.stroke();
          g.strokeStyle = 'rgba(255,240,140,.4)';
          g.beginPath();
          g.arc(pl.x, pl.y, 9, 0, TAU);
          g.stroke();
        }
        pill(g, NAMES[pat]!, 8, 10, 7.5, COLS[pat === 3 ? 4 : pat]! + 'cc', '#14102a', 'left');
        txt(g, `탄 ${bs.length}`, 272, 10, 6.5, 'rgba(255,255,255,.6)', 'right', 700);
        if (showForm) {
          g.font = `800 7.5px ${F}`;
          const s = FORM[pat]!.replace('α', `α(${alpha}°)`);
          const tw = g.measureText(s).width;
          rr(g, 140 - tw / 2 - 7, 157, tw + 14, 13, 6.5);
          g.fillStyle = 'rgba(10,6,30,.78)';
          g.fill();
          g.strokeStyle = 'rgba(200,180,255,.35)';
          g.lineWidth = 0.6;
          g.stroke();
          txt(g, s, 140, 163.8, 7.5, '#e6dcff', 'center', 800);
        }
        if (v.big) txt(g, manual ? '방향키로 피하는 중' : '방향키로 직접 피해 보기', 272, 20, 6.5, 'rgba(255,255,255,.55)', 'right', 600);
        g.restore();
      },
      dispose() {
        inp.dispose();
      },
    };
  },
};

/* ═══════════ i292 이징 곡선 모음 ═══════════ */

const EASE: { name: string; sub: string; f: (x: number) => number; c: string }[] = [
  { name: 'linear', sub: '일정하게', f: (x) => x, c: '#a8b4d8' },
  { name: 'easeInOut', sub: '살살 · 빠르게 · 살살', f: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2), c: '#7ad7ff' },
  { name: 'easeOut', sub: '빠르게 출발 · 감속', f: (x) => 1 - Math.pow(1 - x, 3), c: '#5cf0a8' },
  {
    name: 'back',
    sub: '살짝 넘쳤다 돌아옴',
    f: (x) => {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    },
    c: '#ffd23f',
  },
  {
    name: 'elastic',
    sub: '고무줄처럼 통통',
    f: (x) => (x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
    c: '#ff8a5c',
  },
  {
    name: 'bounce',
    sub: '바닥에 튀며 멈춤',
    f: (x) => {
      const n1 = 7.5625;
      const d1 = 2.75;
      if (x < 1 / d1) return n1 * x * x;
      if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
      if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
      return n1 * (x -= 2.625 / d1) * x + 0.984375;
    },
    c: '#ff6fb1',
  },
];

const i292: Demo2D = {
  kind: '2d',
  caption: '같은 거리 · 같은 시간인데 움직임 맛이 다르다 — 왼쪽 그래프(시간 → 위치)와 같은 간격 점으로 비교',
  make() {
    let dur = 1.2;
    let dots = true;
    let scale = false;
    return {
      controls: [
        { type: 'range', label: '걸리는 시간(초)', min: 0.4, max: 3, step: 0.1, value: 1.2, on: (v) => (dur = v) },
        { type: 'toggle', label: '같은 시간 간격 점', value: true, on: (v) => (dots = v) },
        { type: 'toggle', label: '크기에도 적용', value: false, on: (v) => (scale = v) },
      ] as Control[],
      draw(g, w, h, t) {
        const v = viewOf(w, h);
        const cyc = 2 * (dur + 0.45);
        const tt = t % cyc;
        let p: number;
        let back = false;
        if (tt < dur) p = tt / dur;
        else if (tt < dur + 0.45) p = 1;
        else if (tt < 2 * dur + 0.45) {
          p = (tt - dur - 0.45) / dur;
          back = true;
        } else {
          p = 1;
          back = true;
        }
        fillBg(g, w, h, '#141833', '#1f2650');
        enter(g, v);
        txt(g, '시간 → 위치', 25, 8, 6, 'rgba(255,255,255,.5)', 'center', 700);
        txt(g, '같은 거리를 같은 시간에', 185, 8, 6, 'rgba(255,255,255,.5)', 'center', 700);
        const X0 = 104;
        const X1 = 266;
        EASE.forEach((e, i) => {
          const cy = 26 + i * 25.4;
          // 줄 바탕
          rr(g, 3, cy - 11.5, 274, 23, 5);
          g.fillStyle = i % 2 ? 'rgba(255,255,255,.03)' : 'rgba(255,255,255,.055)';
          g.fill();
          // 그래프
          const gx = 7;
          const gw = 36;
          const gy0 = cy + 8;
          const gh = 15;
          const Y = (val: number): number => gy0 - val * gh;
          g.strokeStyle = 'rgba(255,255,255,.15)';
          g.lineWidth = 0.5;
          g.strokeRect(gx, Y(1), gw, gh);
          g.strokeStyle = e.c;
          g.lineWidth = 1.2;
          g.beginPath();
          for (let k = 0; k <= 40; k++) {
            const x = k / 40;
            const yy = Y(e.f(x));
            if (k) g.lineTo(gx + x * gw, yy);
            else g.moveTo(gx + x * gw, yy);
          }
          g.stroke();
          const ev = e.f(p);
          g.fillStyle = '#fff';
          g.beginPath();
          g.arc(gx + p * gw, Y(ev), 1.6, 0, TAU);
          g.fill();
          txt(g, e.name, 48, cy - 4, 7, e.c, 'left', 800);
          txt(g, e.sub, 48, cy + 5, 5.5, 'rgba(255,255,255,.6)', 'left', 600);
          // 길
          g.strokeStyle = 'rgba(255,255,255,.18)';
          g.lineWidth = 1;
          g.setLineDash([1.5, 2]);
          g.beginPath();
          g.moveTo(X0, cy);
          g.lineTo(X1, cy);
          g.stroke();
          g.setLineDash([]);
          for (const xx of [X0, X1]) {
            g.fillStyle = 'rgba(255,255,255,.3)';
            g.fillRect(xx - 0.5, cy - 5, 1, 10);
          }
          if (dots) {
            for (let k = 0; k <= 12; k++) {
              const q = e.f(k / 12);
              g.fillStyle = e.c;
              g.globalAlpha = 0.35;
              g.beginPath();
              g.arc(lerp(X0, X1, q), cy + 7.5, 1.1, 0, TAU);
              g.fill();
            }
            g.globalAlpha = 1;
          }
          const val = back ? 1 - ev : ev;
          const x = lerp(X0, X1, val);
          // 잔상
          for (let k = 1; k <= 4; k++) {
            const pp = clamp01(p - k * 0.025);
            const vv = back ? 1 - e.f(pp) : e.f(pp);
            g.fillStyle = e.c;
            g.globalAlpha = 0.12 * (5 - k) * (p > 0 && p < 1 ? 1 : 0);
            g.beginPath();
            g.arc(lerp(X0, X1, vv), cy - 1, 5, 0, TAU);
            g.fill();
          }
          g.globalAlpha = 1;
          const s = scale ? 0.6 + 0.6 * clamp(back ? 1 - ev : ev, -0.3, 1.4) : 1;
          const bg2 = g.createRadialGradient(x - 1.6, cy - 3, 0.5, x, cy - 1, 6 * s);
          bg2.addColorStop(0, '#fff');
          bg2.addColorStop(1, e.c);
          g.fillStyle = bg2;
          g.beginPath();
          g.arc(x, cy - 1, 5.5 * s, 0, TAU);
          g.fill();
          g.fillStyle = '#1a1433';
          g.beginPath();
          g.arc(x - 1.6 * s, cy - 1.8, 0.8 * s, 0, TAU);
          g.arc(x + 1.6 * s, cy - 1.8, 0.8 * s, 0, TAU);
          g.fill();
        });
        g.restore();
      },
    };
  },
};

/* ═══════════ i293 스프링 · 감쇠 ═══════════ */

const i293: Demo2D = {
  kind: '2d',
  caption: '목표를 따라가는 스프링 셋 — 덜 감쇠는 출렁, 임계 감쇠는 가장 빨리 딱, 과감쇠는 느릿느릿',
  make() {
    const inp = new Input();
    let freq = 1.6;
    let z0 = 0.15;
    let graph = true;
    const rows = [
      { z: 0.15, name: '덜 감쇠', tag: '출렁출렁', c: '#ff8a5c' },
      { z: 1, name: '임계 감쇠', tag: '딱 맞게', c: '#5cf0a8' },
      { z: 2.6, name: '과감쇠', tag: '느릿느릿', c: '#7ad7ff' },
    ];
    const X0 = 22;
    const X1 = 150;
    let target = X0;
    const st = rows.map(() => ({ x: X0, v: 0, hist: [] as number[], tHist: [] as number[] }));
    let tt = 1.4;
    let side = 0;
    let acc = 0;
    let settle = [0, 0, 0];
    let lastJump = 0;
    let time = 0;
    const step = fixed(1 / 240);
    return {
      controls: [
        { type: 'range', label: '단단함 (진동수 Hz)', min: 0.4, max: 3, step: 0.1, value: 1.6, on: (v) => (freq = v) },
        { type: 'range', label: '첫 줄 감쇠비 ζ', min: 0.02, max: 0.95, step: 0.01, value: 0.15, on: (v) => (z0 = v) },
        { type: 'toggle', label: '시간 그래프', value: true, on: (v) => (graph = v) },
      ] as Control[],
      draw(g, w, h, _t, dt) {
        const v = viewOf(w, h);
        inp.sync(g, v);
        rows[0]!.z = z0;
        for (const e of inp.take())
          if (e.k === 'down') {
            target = clamp(e.x, X0, X1);
            tt = 4;
            lastJump = time;
            settle = [0, 0, 0];
          }
        tt -= dt;
        if (tt < 0) {
          side = 1 - side;
          target = side ? X1 : X0;
          tt = 2.4;
          lastJump = time;
          settle = [0, 0, 0];
        }
        step(dt, (H) => {
          time += H;
          const om = TAU * freq;
          st.forEach((s, i) => {
            const a = om * om * (target - s.x) - 2 * rows[i]!.z * om * s.v;
            s.v += a * H;
            s.x += s.v * H;
            if (!settle[i] && Math.abs(target - s.x) < 1.2 && Math.abs(s.v) < 8 && time - lastJump > 0.02) settle[i] = time - lastJump;
            if (settle[i] && (Math.abs(target - s.x) > 1.5 || Math.abs(s.v) > 10)) settle[i] = 0;
          });
          acc += H;
          if (acc >= 1 / 60) {
            acc -= 1 / 60;
            st.forEach((s) => {
              s.hist.push(s.x);
              s.tHist.push(target);
              if (s.hist.length > 150) {
                s.hist.shift();
                s.tHist.shift();
              }
            });
          }
        });
        fillBg(g, w, h, '#131a30', '#1e2a4a');
        enter(g, v);
        rows.forEach((r, i) => {
          const s = st[i]!;
          const top = 4 + i * 57;
          const cy = top + 31;
          rr(g, 4, top, 272, 53, 7);
          g.fillStyle = 'rgba(255,255,255,.045)';
          g.fill();
          txt(g, `${r.name}  ζ = ${r.z.toFixed(2)}`, 10, top + 8, 7, r.c, 'left', 800);
          txt(g, r.tag, 150, top + 8, 6, 'rgba(255,255,255,.55)', 'right', 700);
          // 길
          g.fillStyle = 'rgba(255,255,255,.08)';
          rr(g, X0 - 10, cy - 1, X1 - X0 + 20, 2, 1);
          g.fill();
          // 목표 깃발
          g.strokeStyle = 'rgba(255,255,255,.6)';
          g.lineWidth = 0.8;
          g.setLineDash([2, 2]);
          g.beginPath();
          g.moveTo(target, cy - 16);
          g.lineTo(target, cy + 15);
          g.stroke();
          g.setLineDash([]);
          g.fillStyle = '#ffe066';
          g.beginPath();
          g.moveTo(target, cy - 17);
          g.lineTo(target + 7, cy - 14.5);
          g.lineTo(target, cy - 12);
          g.fill();
          // 따라가는 카드 (속도로 늘어남)
          const sq = clamp(Math.abs(s.v) / 500, 0, 0.35);
          const cw = 18 * (1 + sq);
          const ch = 16 * (1 - sq * 0.5);
          g.save();
          g.translate(s.x, cy);
          g.fillStyle = 'rgba(0,0,0,.25)';
          rr(g, -cw / 2 + 1, -ch / 2 + 2, cw, ch, 4);
          g.fill();
          const cg = g.createLinearGradient(0, -ch / 2, 0, ch / 2);
          cg.addColorStop(0, '#ffffff');
          cg.addColorStop(1, r.c);
          g.fillStyle = cg;
          rr(g, -cw / 2, -ch / 2, cw, ch, 4);
          g.fill();
          g.strokeStyle = 'rgba(20,20,40,.5)';
          g.lineWidth = 0.7;
          g.stroke();
          const look = clamp(s.v / 200, -1.5, 1.5);
          g.fillStyle = '#1a1433';
          g.beginPath();
          g.arc(-3 + look, -1, 1.1, 0, TAU);
          g.arc(3 + look, -1, 1.1, 0, TAU);
          g.fill();
          g.strokeStyle = '#1a1433';
          g.beginPath();
          g.arc(look, 2, 1.8, 0.2, Math.PI - 0.2);
          g.stroke();
          g.restore();
          if (settle[i]) pill(g, `${settle[i]!.toFixed(2)}초에 멈춤`, s.x, cy + 16, 5.5, 'rgba(10,14,30,.8)', r.c);
          // 그래프
          if (graph) {
            const gx = 160;
            const gw = 110;
            const gy = top + 6;
            const gh = 42;
            rr(g, gx, gy, gw, gh, 4);
            g.fillStyle = 'rgba(0,0,0,.25)';
            g.fill();
            const Y = (x: number): number => gy + gh - 6 - ((x - X0) / (X1 - X0)) * (gh - 12);
            g.strokeStyle = 'rgba(255,224,102,.6)';
            g.lineWidth = 0.7;
            g.setLineDash([2, 1.5]);
            g.beginPath();
            s.tHist.forEach((q, k) => (k ? g.lineTo(gx + (k / 150) * gw, Y(q)) : g.moveTo(gx, Y(q))));
            g.stroke();
            g.setLineDash([]);
            g.save();
            rr(g, gx, gy, gw, gh, 4);
            g.clip();
            g.strokeStyle = r.c;
            g.lineWidth = 1.3;
            g.beginPath();
            s.hist.forEach((q, k) => (k ? g.lineTo(gx + (k / 150) * gw, Y(q)) : g.moveTo(gx, Y(q))));
            g.stroke();
            g.restore();
            txt(g, '시간 →', gx + gw - 3, gy + gh - 3.5, 4.5, 'rgba(255,255,255,.4)', 'right', 600);
          }
        });
        if (v.big) txt(g, '길 위를 눌러 목표 옮기기', 140, 172, 6, 'rgba(255,255,255,.55)', 'center', 600);
        g.restore();
      },
      dispose() {
        inp.dispose();
      },
    };
  },
};

export const DEMOS: DemoMap = { i282, i283, i284, i285, i286, i287, i288, i289, i290, i291, i292, i293 };

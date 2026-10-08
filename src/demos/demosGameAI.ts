import type { Control, DemoMap } from './types';

/**
 * 게임 AI 견본 (i340 ~ i359) — 미니맥스 · 알파베타 · MCTS · 기대값 · 후퇴 분석 · 님합 · 퍼즐 풀이기 등.
 * 알고리즘은 이 파일 안에 작게 직접 짰다 (게임 코드 · core/ai 를 import 하지 않는다 — 배포 빌드 보호).
 * 모든 견본은 「한 걸음씩」 돌아간다: 먼저 탐색을 끝까지 돌려 사건 목록(events)을 만들고, 그 목록을 시간에 맞춰 재생한다.
 */

type G = CanvasRenderingContext2D;
const F = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
const FS = '"Segoe UI Symbol", "Noto Sans Symbols 2", "Apple Symbols", serif';
const TAU = Math.PI * 2;

const C = {
  bg0: '#151c31',
  bg1: '#0a0f1f',
  line: 'rgba(160,180,255,0.16)',
  dim: '#4a5373',
  dim2: '#323a57',
  text: '#e8ecff',
  sub: '#9aa6d6',
  x: '#ff6b8b',
  o: '#5cc8ff',
  gold: '#ffd166',
  green: '#6fe3a0',
  red: '#ff5d6c',
  violet: '#b892ff',
  teal: '#4fe0d0',
  orange: '#ff9f43',
};

const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
const clamp01 = (x: number): number => clamp(x, 0, 1);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const ease = (x: number): number => {
  const v = clamp01(x);
  return v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2;
};
const easeOut = (x: number): number => 1 - Math.pow(1 - clamp01(x), 3);
const back = (x: number): number => {
  const v = clamp01(x);
  const c1 = 1.70158;
  return 1 + (c1 + 1) * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2);
};
const scaleOf = (w: number, h: number): number => Math.min(w / 280, h / 175);

function rng(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const newSeed = (): number => 1 + Math.floor(Math.random() * 99998);
function shuffle<T>(a: T[], r: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a;
}

function reset(g: G): void {
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.lineWidth = 1;
  g.setLineDash([]);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.shadowBlur = 0;
  g.shadowColor = 'transparent';
}
function bg(g: G, w: number, h: number, a = C.bg0, b = C.bg1): void {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, a);
  gr.addColorStop(1, b);
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  const rg = g.createRadialGradient(w * 0.5, h * 0.35, 0, w * 0.5, h * 0.35, Math.max(w, h) * 0.75);
  rg.addColorStop(0, 'rgba(120,140,255,0.07)');
  rg.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = rg;
  g.fillRect(0, 0, w, h);
}
function txt(g: G, s: string, x: number, y: number, size: number, color = C.text, align: CanvasTextAlign = 'center', weight = 700): void {
  g.font = `${weight} ${size}px ${F}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(s, x, y);
}
function tw(g: G, s: string, size: number, weight = 700): number {
  g.font = `${weight} ${size}px ${F}`;
  return g.measureText(s).width;
}
function rr(g: G, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, Math.max(0, w), Math.max(0, h), Math.max(0, Math.min(r, w / 2, h / 2)));
}
function pill(g: G, s: string, x: number, y: number, size: number, fill: string, fg = '#0b1020', align: 'center' | 'left' | 'right' = 'center'): number {
  g.font = `800 ${size}px ${F}`;
  const w0 = g.measureText(s).width;
  const ph = size * 1.65;
  const pw = w0 + size * 1.2;
  const x0 = align === 'center' ? x - pw / 2 : align === 'right' ? x - pw : x;
  rr(g, x0, y - ph / 2, pw, ph, ph / 2);
  g.fillStyle = fill;
  g.fill();
  txt(g, s, x0 + pw / 2, y + size * 0.04, size, fg, 'center', 800);
  return pw;
}
function glow(g: G, x: number, y: number, r: number, color: string, a = 0.5): void {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, color);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalAlpha = a;
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
  g.globalAlpha = 1;
}
function arrow(g: G, x0: number, y0: number, x1: number, y1: number, color: string, lw: number, head = lw * 3.2): void {
  const a = Math.atan2(y1 - y0, x1 - x0);
  g.strokeStyle = color;
  g.lineWidth = lw;
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1 - Math.cos(a) * head * 0.6, y1 - Math.sin(a) * head * 0.6);
  g.stroke();
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x1 - Math.cos(a - 0.45) * head, y1 - Math.sin(a - 0.45) * head);
  g.lineTo(x1 - Math.cos(a + 0.45) * head, y1 - Math.sin(a + 0.45) * head);
  g.closePath();
  g.fill();
}
/** 제목 줄 — 왼쪽 큰 이름 + 오른쪽 작은 정보 */
function header(g: G, w: number, u: number, title: string, color = C.text, right = '', rightColor = C.sub): void {
  txt(g, title, 8 * u, 11 * u, 10.5 * u, color, 'left', 900);
  if (right) txt(g, right, w - 8 * u, 11 * u, 8 * u, rightColor, 'right', 700);
}
function glyph(g: G, s: string, x: number, y: number, size: number, fill: string, stroke: string): void {
  g.font = `${size}px ${FS}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = Math.max(1, size * 0.09);
  g.strokeStyle = stroke;
  g.strokeText(s, x, y + size * 0.04);
  g.fillStyle = fill;
  g.fillText(s, x, y + size * 0.04);
}

/* ───────────── 사건 재생기 ───────────── */
/** 사건(step)을 1초에 rate 개씩 · 끝나면 hold 초 쉬고 다시 (restart) */
class Seq {
  pos = 0;
  holdT = 0;
  speed = 1;
  constructor(public len: number, public rate: number, public hold = 1.8, public onEnd: () => void = () => {}) {}
  get i(): number {
    return Math.min(this.len, Math.floor(this.pos));
  }
  get frac(): number {
    return this.pos >= this.len ? 1 : this.pos - Math.floor(this.pos);
  }
  get done(): boolean {
    return this.pos >= this.len;
  }
  tick(dt: number): void {
    const d = Math.min(dt, 0.1) * this.speed;
    if (this.pos < this.len) this.pos = Math.min(this.len, this.pos + d * this.rate);
    else {
      this.holdT += d;
      if (this.holdT > this.hold) this.onEnd();
    }
  }
  restart(len: number): void {
    this.len = len;
    this.pos = 0;
    this.holdT = 0;
  }
}
const speedCtl = (s: { speed: number }, max = 4): Control => ({ type: 'range', label: '속도', min: 0.25, max, step: 0.25, value: 1, on: (v) => { s.speed = v; } });

/* ───────────── 틱택토 ───────────── */
const LINES3 = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
/** 이긴 사람 1 · 2, 무승부 3, 진행 중 0 */
function tttWin(b: number[]): number {
  for (const [a, c, d] of LINES3) {
    const v = b[a!]!;
    if (v && v === b[c!] && v === b[d!]) return v;
  }
  return b.every((v) => v) ? 3 : 0;
}
function tttLine(b: number[]): number[] | null {
  for (const l of LINES3) {
    const v = b[l[0]!]!;
    if (v && v === b[l[1]!] && v === b[l[2]!]) return l;
  }
  return null;
}
function drawX(g: G, cx: number, cy: number, r: number, lw: number, color = C.x): void {
  g.strokeStyle = color;
  g.lineWidth = lw;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(cx - r, cy - r);
  g.lineTo(cx + r, cy + r);
  g.moveTo(cx + r, cy - r);
  g.lineTo(cx - r, cy + r);
  g.stroke();
}
function drawO(g: G, cx: number, cy: number, r: number, lw: number, color = C.o): void {
  g.strokeStyle = color;
  g.lineWidth = lw;
  g.beginPath();
  g.arc(cx, cy, r, 0, TAU);
  g.stroke();
}
/** 작은 틱택토 판 (가운데 cx, cy · 한 변 s) */
function miniTTT(g: G, b: number[], cx: number, cy: number, s: number, o: { hi?: number; frame?: string; alpha?: number; heat?: number[]; line?: boolean } = {}): void {
  const x0 = cx - s / 2;
  const y0 = cy - s / 2;
  const c = s / 3;
  g.globalAlpha = o.alpha ?? 1;
  rr(g, x0 - s * 0.06, y0 - s * 0.06, s * 1.12, s * 1.12, s * 0.14);
  g.fillStyle = 'rgba(14,20,40,0.92)';
  g.fill();
  g.strokeStyle = o.frame ?? 'rgba(150,170,255,0.35)';
  g.lineWidth = Math.max(1, s * 0.04);
  g.stroke();
  if (o.heat) {
    const mx = Math.max(1, ...o.heat);
    for (let i = 0; i < 9; i++) {
      const v = o.heat[i]!;
      if (!v) continue;
      g.fillStyle = `rgba(255,209,102,${(0.12 + 0.6 * (v / mx)).toFixed(3)})`;
      g.fillRect(x0 + (i % 3) * c + 1, y0 + Math.floor(i / 3) * c + 1, c - 2, c - 2);
    }
  }
  g.strokeStyle = 'rgba(170,185,255,0.3)';
  g.lineWidth = Math.max(0.6, s * 0.025);
  g.beginPath();
  for (let k = 1; k < 3; k++) {
    g.moveTo(x0 + k * c, y0 + s * 0.04);
    g.lineTo(x0 + k * c, y0 + s * 0.96);
    g.moveTo(x0 + s * 0.04, y0 + k * c);
    g.lineTo(x0 + s * 0.96, y0 + k * c);
  }
  g.stroke();
  for (let i = 0; i < 9; i++) {
    const v = b[i]!;
    const px = x0 + (i % 3) * c + c / 2;
    const py = y0 + Math.floor(i / 3) * c + c / 2;
    if (o.hi === i) {
      g.fillStyle = 'rgba(255,209,102,0.28)';
      g.fillRect(px - c / 2 + 1, py - c / 2 + 1, c - 2, c - 2);
    }
    if (v === 1) drawX(g, px, py, c * 0.27, Math.max(1, c * 0.13));
    else if (v === 2) drawO(g, px, py, c * 0.29, Math.max(1, c * 0.12));
  }
  if (o.line !== false) {
    const l = tttLine(b);
    if (l) {
      const p = (i: number): [number, number] => [x0 + (i % 3) * c + c / 2, y0 + Math.floor(i / 3) * c + c / 2];
      const [ax, ay] = p(l[0]!);
      const [bx, by] = p(l[2]!);
      g.strokeStyle = b[l[0]!] === 1 ? 'rgba(255,107,139,0.85)' : 'rgba(92,200,255,0.85)';
      g.lineWidth = Math.max(1, c * 0.12);
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.stroke();
    }
  }
  g.globalAlpha = 1;
}
/** 값 배지: +1 승 · 0 무 · -1 패 */
function valCol(v: number): string {
  return v > 0 ? C.green : v < 0 ? C.red : '#aab3d6';
}
function valStr(v: number): string {
  return v > 0 ? '+1' : v < 0 ? '−1' : '0';
}

/* ───────────── 나무 배치 ───────────── */
interface TN {
  kids: this[];
  depth: number;
  x: number;
  y: number;
  leaves: number;
}
/** 잎을 고르게 펼치고 부모는 자식 가운데 */
function layoutTree<N extends TN>(root: N, x0: number, x1: number, y0: number, dy: number): void {
  const count = (n: TN): number => (n.leaves = n.kids.length ? n.kids.reduce((s, k) => s + count(k), 0) : 1);
  count(root);
  let k = 0;
  const total = root.leaves;
  const place = (n: TN): void => {
    n.y = y0 + n.depth * dy;
    if (!n.kids.length) {
      n.x = x0 + ((k + 0.5) / total) * (x1 - x0);
      k++;
      return;
    }
    for (const c of n.kids) place(c);
    n.x = (n.kids[0]!.x + n.kids[n.kids.length - 1]!.x) / 2;
  };
  place(root);
}

/* ═════════ i340 미니맥스 게임 나무 (틱택토) ═════════ */
interface MNode extends TN {
  id: number;
  b: number[];
  mover: number;
  move: number;
  val: number;
  term: number;
}
interface MPos {
  root: MNode;
  R: number;
  ev: { k: 'in' | 'leaf' | 'up'; n: MNode }[];
  nodes: MNode[];
}
function buildMinimax(empties: number, seed: number): MPos {
  const r = rng(seed);
  for (let tries = 0; tries < 4000; tries++) {
    const b = Array<number>(9).fill(0);
    const pcs = 9 - empties;
    const nx = Math.ceil(pcs / 2);
    const cells = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8], r);
    for (let i = 0; i < pcs; i++) b[cells[i]!] = i < nx ? 1 : 2;
    if (tttWin(b)) continue;
    const R = nx === pcs - nx ? 1 : 2;
    const nodes: MNode[] = [];
    const mk = (bb: number[], mover: number, move: number, depth: number): MNode => {
      const n: MNode = { id: nodes.length, b: bb, mover, move, val: 0, term: tttWin(bb), kids: [], depth, x: 0, y: 0, leaves: 1 };
      nodes.push(n);
      if (n.term) n.val = n.term === 3 ? 0 : n.term === R ? 1 : -1;
      else {
        for (let i = 0; i < 9; i++)
          if (!bb[i]) {
            const nb = bb.slice();
            nb[i] = mover;
            n.kids.push(mk(nb, 3 - mover, i, depth + 1));
          }
        const vs = n.kids.map((k) => k.val);
        n.val = mover === R ? Math.max(...vs) : Math.min(...vs);
      }
      return n;
    };
    const root = mk(b, R, -1, 0);
    const kv = root.kids.map((k) => k.val);
    if (kv.every((v) => v === kv[0])) continue;
    if (root.kids.some((k) => k.term && k.term !== 3)) continue; // 바로 이기는 수가 있으면 너무 쉬움
    const ev: MPos['ev'] = [];
    const walk = (n: MNode): void => {
      ev.push({ k: 'in', n });
      if (!n.kids.length) ev.push({ k: 'leaf', n });
      else {
        for (const c of n.kids) walk(c);
        ev.push({ k: 'up', n });
      }
    };
    walk(root);
    return { root, R, ev, nodes };
  }
  // 못 찾으면 (거의 없음) 아무 판
  return buildMinimax(empties, seed + 1);
}

const I340: DemoMap = {
  i340: {
    kind: '2d',
    caption: '틱택토 끝판을 끝까지 다 둬 보고(잎 = 승 +1 · 무 0 · 패 −1), 내 차례엔 가장 큰 값 · 상대 차례엔 가장 작은 값을 위로 올려요',
    make() {
      let empties = 3;
      let P = buildMinimax(empties, newSeed());
      const seq = new Seq(P.ev.length, 6, 2.2, () => regen());
      const regen = (): void => {
        P = buildMinimax(empties, newSeed());
        seq.restart(P.ev.length);
        seq.rate = empties === 3 ? 6 : 16;
      };
      return {
        draw(g, w, h, t, dt) {
          reset(g);
          seq.tick(dt);
          const u = scaleOf(w, h);
          bg(g, w, h);
          // 지금까지의 사건 되짚기
          const vis = new Set<number>();
          const valued = new Map<number, number>();
          const path: number[] = [];
          const n0 = seq.i;
          for (let i = 0; i < n0; i++) {
            const e = P.ev[i]!;
            if (e.k === 'in') {
              vis.add(e.n.id);
              path.push(e.n.id);
            } else if (e.k === 'leaf') {
              valued.set(e.n.id, e.n.val);
              path.pop();
            } else {
              valued.set(e.n.id, e.n.val);
              path.pop();
            }
          }
          const onPath = new Set(path);
          const cur = path[path.length - 1];
          const levels = empties + 1;
          const left = 30 * u;
          const dy = (h - 22 * u - 16 * u) / Math.max(1, levels - 1 + 0.62);
          const top = 22 * u + dy * 0.31 - 2 * u;
          layoutTree(P.root, left, w - 6 * u, top + 2 * u, dy);
          // 깊이별 간격 → 판 크기
          const byDepth: MNode[][] = [];
          for (const n of P.nodes) (byDepth[n.depth] ??= []).push(n);
          const sizeAt = byDepth.map((arr) => {
            let gap = w;
            const xs = arr.map((n) => n.x).sort((a, b) => a - b);
            for (let i = 1; i < xs.length; i++) gap = Math.min(gap, xs[i]! - xs[i - 1]!);
            return Math.min(dy * 0.56, gap * 0.8, 34 * u);
          });
          const done = seq.done;
          const best = done ? P.root.kids.find((k) => k.val === P.root.val) : undefined;
          // 왼쪽 층 이름
          for (let d = 0; d < levels; d++) {
            const mover = d % 2 === 0 ? P.R : 3 - P.R;
            const y = top + 2 * u + d * dy;
            const isMax = mover === P.R;
            txt(g, isMax ? 'MAX' : 'MIN', 4 * u, y - 4 * u, 7.5 * u, isMax ? C.green : C.red, 'left', 900);
            if (d < levels - 1) {
              const col = mover === 1 ? C.x : C.o;
              txt(g, mover === 1 ? 'X 차례' : 'O 차례', 4 * u, y + 5 * u, 6.5 * u, col, 'left', 700);
            } else txt(g, '끝', 4 * u, y + 5 * u, 6.5 * u, C.sub, 'left', 700);
          }
          // 줄
          for (const n of P.nodes) {
            for (const c of n.kids) {
              const s0 = sizeAt[n.depth]!;
              const s1 = sizeAt[c.depth]!;
              const seen = vis.has(c.id);
              const isBest = done && c === best;
              g.strokeStyle = isBest ? C.gold : onPath.has(c.id) ? C.gold : seen ? (valued.has(c.id) ? valCol(c.val) : '#8d97c4') : C.dim2;
              g.globalAlpha = isBest || onPath.has(c.id) ? 1 : seen ? 0.55 : 0.5;
              g.lineWidth = (isBest || onPath.has(c.id) ? 2.2 : 1.1) * u;
              g.beginPath();
              g.moveTo(n.x, n.y + s0 * 0.62);
              g.lineTo(c.x, c.y - s1 * 0.62);
              g.stroke();
              g.globalAlpha = 1;
            }
          }
          // 마디
          for (const n of P.nodes) {
            const s = sizeAt[n.depth]!;
            const seen = vis.has(n.id);
            const isCur = n.id === cur;
            if (isCur) glow(g, n.x, n.y, s * 1.3, C.gold, 0.45);
            if (done && n === best) glow(g, n.x, n.y, s * 1.4, C.gold, 0.55 + 0.2 * Math.sin(t * 5));
            if (s >= 11 * u) {
              miniTTT(g, n.b, n.x, n.y, s, {
                alpha: seen ? 1 : 0.28,
                frame: isCur || (done && n === best) ? C.gold : onPath.has(n.id) ? 'rgba(255,209,102,0.7)' : undefined,
                hi: n.move >= 0 && seen ? n.move : undefined,
              });
            } else {
              g.globalAlpha = seen ? 1 : 0.3;
              g.fillStyle = valued.has(n.id) ? valCol(n.val) : '#56608a';
              g.beginPath();
              g.arc(n.x, n.y, Math.max(2 * u, s * 0.45), 0, TAU);
              g.fill();
              g.globalAlpha = 1;
            }
            if (valued.has(n.id)) {
              const v = valued.get(n.id)!;
              const by = n.y + s * 0.5 + 5.5 * u;
              if (s >= 11 * u || n.depth < 2) pill(g, valStr(v), n.x, by, 6.2 * u, valCol(v));
            }
          }
          // 위 정보
          const leavesSeen = P.ev.slice(0, n0).filter((e) => e.k === 'leaf').length;
          const totalLeaves = P.ev.filter((e) => e.k === 'leaf').length;
          if (done && best) {
            const msg = best.val > 0 ? '이기는 수 찾음!' : best.val === 0 ? '최선은 비기기' : '어떻게 해도 짐';
            header(g, w, u, '미니맥스', C.text);
            pill(g, `최선의 수 → ${msg}`, w - 8 * u, 11 * u, 7.5 * u, C.gold, '#1a1405', 'right');
          } else header(g, w, u, '미니맥스', C.text, `끝까지 본 판 ${leavesSeen} / ${totalLeaves}`);
        },
        controls: [
          speedCtl(seq),
          { type: 'range', label: '남은 빈칸 (나무 깊이)', min: 3, max: 4, step: 1, value: 3, on: (v) => { empties = v; regen(); } },
          { type: 'button', label: '다른 판', on: () => regen() },
        ] as Control[],
      };
    },
  },
};

/* ═════════ 알파베타 공통 (숫자 나무) ═════════ */
interface ANode extends TN {
  id: number;
  v: number;
  mm: number;
  max: boolean;
  parent: ANode | null;
}
interface AEv {
  k: 'in' | 'leaf' | 'up' | 'ab' | 'cut';
  n: ANode;
  a?: number;
  b?: number;
  v?: number;
  from?: number;
}
function buildNumTree(depth: number, branch: number, seed: number): ANode {
  const r = rng(seed);
  let id = 0;
  const mk = (d: number, max: boolean, parent: ANode | null): ANode => {
    const n: ANode = { id: id++, v: 0, mm: 0, max, parent, kids: [], depth: d, x: 0, y: 0, leaves: 1 };
    if (d === depth) n.v = n.mm = 1 + Math.floor(r() * 9);
    else {
      for (let i = 0; i < branch; i++) n.kids.push(mk(d + 1, !max, n));
      const vs = n.kids.map((k) => k.mm);
      n.mm = max ? Math.max(...vs) : Math.min(...vs);
    }
    return n;
  };
  return mk(0, true, null);
}
function cloneOrdered(n: ANode, mode: 'raw' | 'best' | 'worst', parent: ANode | null = null): ANode {
  const c: ANode = { ...n, parent, kids: [] };
  c.kids = n.kids.map((k) => cloneOrdered(k, mode, c));
  if (mode !== 'raw' && c.kids.length) {
    const desc = (mode === 'best') === c.max;
    c.kids.sort((a, b) => (desc ? b.mm - a.mm : a.mm - b.mm));
  }
  return c;
}
function allNodes(n: ANode, out: ANode[] = []): ANode[] {
  out.push(n);
  for (const k of n.kids) allNodes(k, out);
  return out;
}
function alphaBetaEvents(root: ANode, prune: boolean): AEv[] {
  const ev: AEv[] = [];
  const ab = (n: ANode, a: number, b: number): number => {
    ev.push({ k: 'in', n, a, b });
    if (!n.kids.length) {
      ev.push({ k: 'leaf', n });
      return n.v;
    }
    let v = n.max ? -Infinity : Infinity;
    for (let i = 0; i < n.kids.length; i++) {
      const cv = ab(n.kids[i]!, a, b);
      if (n.max) {
        v = Math.max(v, cv);
        a = Math.max(a, v);
      } else {
        v = Math.min(v, cv);
        b = Math.min(b, v);
      }
      ev.push({ k: 'ab', n, a, b, v });
      if (prune && a >= b && i < n.kids.length - 1) {
        ev.push({ k: 'cut', n, from: i + 1 });
        break;
      }
    }
    ev.push({ k: 'up', n, v });
    return v;
  };
  ab(root, -Infinity, Infinity);
  return ev;
}
interface AState {
  vis: Set<number>;
  val: Map<number, number>;
  win: Map<number, [number, number]>;
  pruned: Set<number>;
  cuts: { n: ANode; from: number }[];
  path: ANode[];
  leaves: number;
  last: AEv | undefined;
}
function replayAB(ev: AEv[], upto: number): AState {
  const s: AState = { vis: new Set(), val: new Map(), win: new Map(), pruned: new Set(), cuts: [], path: [], leaves: 0, last: undefined };
  const markPruned = (n: ANode): void => {
    s.pruned.add(n.id);
    for (const k of n.kids) markPruned(k);
  };
  for (let i = 0; i < Math.min(upto, ev.length); i++) {
    const e = ev[i]!;
    s.last = e;
    if (e.k === 'in') {
      s.vis.add(e.n.id);
      s.path.push(e.n);
      s.win.set(e.n.id, [e.a!, e.b!]);
    } else if (e.k === 'leaf') {
      s.val.set(e.n.id, e.n.v);
      s.leaves++;
      s.path.pop();
    } else if (e.k === 'ab') {
      s.win.set(e.n.id, [e.a!, e.b!]);
      s.val.set(e.n.id, e.v!);
    } else if (e.k === 'cut') {
      s.cuts.push({ n: e.n, from: e.from! });
      for (let j = e.from!; j < e.n.kids.length; j++) markPruned(e.n.kids[j]!);
    } else {
      s.val.set(e.n.id, e.v!);
      s.path.pop();
    }
  }
  return s;
}
const fmtAB = (v: number): string => (v === Infinity ? '∞' : v === -Infinity ? '−∞' : String(v));
/** 숫자 나무 그리기 (배치는 이미 됨) */
function drawABTree(g: G, root: ANode, nodes: ANode[], s: AState, u: number, t: number, showWin: boolean, finished: boolean): void {
  const leafN = nodes.filter((n) => !n.kids.length).length;
  const xs = nodes.filter((n) => !n.kids.length).map((n) => n.x);
  const gap = leafN > 1 ? Math.abs(xs[1]! - xs[0]!) : 30 * u;
  const dyGap = root.kids[0] ? root.kids[0].y - root.y : 30 * u;
  const r = Math.max(2.4 * u, Math.min(gap * 0.42, dyGap * 0.3, 9 * u));
  const pathIds = new Set(s.path.map((n) => n.id));
  const cur = s.path[s.path.length - 1];
  // 줄
  for (const n of nodes) {
    n.kids.forEach((c) => {
      const pr = s.pruned.has(c.id);
      const seen = s.vis.has(c.id);
      g.setLineDash(pr ? [2 * u, 2.4 * u] : []);
      g.strokeStyle = pr ? '#5a617e' : pathIds.has(c.id) ? C.gold : seen ? '#8f9ad0' : C.dim2;
      g.globalAlpha = pr ? 0.55 : seen ? 0.85 : 0.6;
      g.lineWidth = (pathIds.has(c.id) ? 2 : 1) * u;
      g.beginPath();
      g.moveTo(n.x, n.y + r * 0.8);
      g.lineTo(c.x, c.y - r * 0.8);
      g.stroke();
    });
  }
  g.setLineDash([]);
  g.globalAlpha = 1;
  // 가위 표시
  for (const cut of s.cuts) {
    const a = cut.n.kids[cut.from]!;
    const mx = lerp(cut.n.x, a.x, 0.45);
    const my = lerp(cut.n.y, a.y, 0.45);
    glow(g, mx, my, 9 * u, C.red, 0.35);
    glyph(g, '✂', mx, my, 11 * u, '#ffd0d6', 'rgba(60,0,10,0.8)');
  }
  // 마디
  for (const n of nodes) {
    const pr = s.pruned.has(n.id);
    const seen = s.vis.has(n.id);
    const has = s.val.has(n.id);
    const isCur = n === cur;
    if (isCur) glow(g, n.x, n.y, r * 3.2, C.gold, 0.5);
    g.globalAlpha = pr ? 0.35 : seen ? 1 : 0.45;
    if (!n.kids.length) {
      rr(g, n.x - r, n.y - r, r * 2, r * 2, r * 0.35);
      g.fillStyle = pr ? '#2a2f44' : seen ? '#f1f4ff' : '#2b3352';
      g.fill();
      if (isCur) {
        g.strokeStyle = C.gold;
        g.lineWidth = 1.6 * u;
        g.stroke();
      }
      if (r > 3.4 * u) txt(g, String(n.v), n.x, n.y + 0.3 * u, r * 1.25, pr ? '#666d88' : seen ? '#101628' : '#7d86ad', 'center', 900);
    } else {
      g.beginPath();
      if (n.max) {
        g.moveTo(n.x, n.y - r * 1.05);
        g.lineTo(n.x + r * 1.1, n.y + r * 0.8);
        g.lineTo(n.x - r * 1.1, n.y + r * 0.8);
      } else {
        g.moveTo(n.x, n.y + r * 1.05);
        g.lineTo(n.x + r * 1.1, n.y - r * 0.8);
        g.lineTo(n.x - r * 1.1, n.y - r * 0.8);
      }
      g.closePath();
      g.fillStyle = pr ? '#2a2f44' : n.max ? (seen ? '#3b9a74' : '#24453c') : seen ? '#b84a62' : '#4a2633';
      g.fill();
      g.strokeStyle = isCur ? C.gold : 'rgba(255,255,255,0.35)';
      g.lineWidth = (isCur ? 1.8 : 0.8) * u;
      g.stroke();
      if (has && r > 3.4 * u) {
        const v = s.val.get(n.id)!;
        txt(g, Number.isFinite(v) ? String(v) : '', n.x, n.y + (n.max ? r * 0.15 : -r * 0.15), r * 1.05, '#fff', 'center', 900);
      }
    }
    g.globalAlpha = 1;
  }
  // 지금 마디의 α β 창
  if (showWin && cur && cur.kids.length && !finished) {
    const wv = s.win.get(cur.id);
    if (wv) {
      const label = `α ${fmtAB(wv[0])}   β ${fmtAB(wv[1])}`;
      const bw = tw(g, label, 7 * u, 800) + 10 * u;
      let bx = cur.x + r * 1.6;
      if (bx + bw > g.canvas.width / (g.getTransform().a || 1) - 4 * u) bx = cur.x - r * 1.6 - bw;
      rr(g, bx, cur.y - 7 * u, bw, 14 * u, 4 * u);
      g.fillStyle = 'rgba(10,14,30,0.92)';
      g.fill();
      g.strokeStyle = 'rgba(255,209,102,0.7)';
      g.lineWidth = 1 * u;
      g.stroke();
      txt(g, label, bx + bw / 2, cur.y + 0.3 * u, 7 * u, C.gold, 'center', 800);
    }
  }
  if (finished) {
    const best = root.kids.find((k) => s.val.get(k.id) === root.mm && !s.pruned.has(k.id));
    if (best) {
      glow(g, best.x, best.y, r * 3.4, C.gold, 0.35 + 0.2 * Math.sin(t * 5));
    }
  }
}

/* ═════════ i341 알파베타 가지치기 ═════════ */
const I341: DemoMap = {
  i341: {
    kind: '2d',
    caption: '▲ 내 차례(큰 값) · ▼ 상대 차례(작은 값) — α ≥ β 가 되면 「더 봐도 안 고를 가지」라 가위로 잘라요 (회색 = 안 본 잎)',
    make() {
      let depth = 3;
      let prune = true;
      let seed = newSeed();
      let root = buildNumTree(depth, 3, seed);
      let nodes = allNodes(root);
      let ev = alphaBetaEvents(root, prune);
      const seq = new Seq(ev.length, 7, 2.4, () => regen(true));
      const regen = (fresh: boolean): void => {
        if (fresh) seed = newSeed();
        root = buildNumTree(depth, 3, seed);
        nodes = allNodes(root);
        ev = alphaBetaEvents(root, prune);
        seq.restart(ev.length);
        seq.rate = depth === 2 ? 4 : depth === 3 ? 8 : 18;
      };
      return {
        draw(g, w, h, t, dt) {
          reset(g);
          seq.tick(dt);
          const u = scaleOf(w, h);
          bg(g, w, h);
          const top = 32 * u;
          layoutTree(root, 8 * u, w - 8 * u, top, (h - top - 14 * u) / depth);
          const s = replayAB(ev, seq.i);
          drawABTree(g, root, nodes, s, u, t, true, seq.done);
          const total = nodes.filter((n) => !n.kids.length).length;
          const cut = s.pruned.size ? nodes.filter((n) => !n.kids.length && s.pruned.has(n.id)).length : 0;
          header(g, w, u, prune ? '알파베타 가지치기' : '가지치기 없음 (미니맥스)', prune ? C.text : C.sub);
          let x = w - 8 * u;
          x -= pill(g, `잘린 잎 ${cut}`, x, 11 * u, 7 * u, cut ? C.red : 'rgba(255,255,255,0.12)', cut ? '#1a0610' : C.sub, 'right') + 4 * u;
          pill(g, `본 잎 ${s.leaves} / ${total}`, x, 11 * u, 7 * u, C.gold, '#1a1405', 'right');
          if (seq.done) pill(g, `뿌리 값 ${root.mm} — 잎 ${total - cut}개만 보고 같은 답`, w / 2, h - 7 * u, 7 * u, 'rgba(255,209,102,0.95)');
        },
        controls: [
          speedCtl(seq),
          { type: 'toggle', label: '가지치기', value: true, on: (v) => { prune = v; regen(false); } },
          { type: 'range', label: '깊이', min: 2, max: 4, step: 1, value: 3, on: (v) => { depth = v; regen(false); } },
          { type: 'button', label: '새 나무', on: () => regen(true) },
        ] as Control[],
      };
    },
  },
};

/* ═════════ i342 수 순서 정렬 효과 ═════════ */
const I342: DemoMap = {
  i342: {
    kind: '2d',
    caption: '같은 나무 · 같은 알파베타 — 좋은 수부터 보면(아래) 일찍 잘려서 본 잎이 훨씬 적어요 (최선이면 약 b^(d/2))',
    make() {
      let depth = 3;
      let seed = newSeed();
      let A = cloneOrdered(buildNumTree(depth, 3, seed), 'worst');
      let B = cloneOrdered(buildNumTree(depth, 3, seed), 'best');
      let nA = allNodes(A);
      let nB = allNodes(B);
      let eA = alphaBetaEvents(A, true);
      let eB = alphaBetaEvents(B, true);
      const seq = new Seq(Math.max(eA.length, eB.length), 8, 2.8, () => regen(true));
      const regen = (fresh: boolean): void => {
        if (fresh) seed = newSeed();
        const base = buildNumTree(depth, 3, seed);
        A = cloneOrdered(base, 'worst');
        B = cloneOrdered(base, 'best');
        nA = allNodes(A);
        nB = allNodes(B);
        eA = alphaBetaEvents(A, true);
        eB = alphaBetaEvents(B, true);
        seq.restart(Math.max(eA.length, eB.length));
        seq.rate = depth === 2 ? 5 : depth === 3 ? 9 : 22;
      };
      return {
        draw(g, w, h, t, dt) {
          reset(g);
          seq.tick(dt);
          const u = scaleOf(w, h);
          bg(g, w, h);
          header(g, w, u, '수 순서 정렬', C.text, '같은 나무 · 같은 속도');
          const total = nA.filter((n) => !n.kids.length).length;
          const barH = 20 * u;
          const ph = (h - 22 * u - barH) / 2;
          const panels: [ANode, ANode[], AEv[], string, string][] = [
            [A, nA, eA, '나쁜 순서', C.red],
            [B, nB, eB, '좋은 순서', C.green],
          ];
          const counts: number[] = [];
          panels.forEach(([root, nodes, ev, label, col], k) => {
            const y0 = 22 * u + k * ph;
            g.fillStyle = k ? 'rgba(111,227,160,0.05)' : 'rgba(255,93,108,0.05)';
            rr(g, 4 * u, y0 + 1 * u, w - 8 * u, ph - 3 * u, 6 * u);
            g.fill();
            layoutTree(root, 52 * u, w - 8 * u, y0 + 8 * u, (ph - 16 * u) / depth);
            const s = replayAB(ev, seq.i);
            drawABTree(g, root, nodes, s, u, t, false, seq.i >= ev.length);
            counts.push(s.leaves);
            txt(g, label, 9 * u, y0 + ph * 0.38, 9.5 * u, col, 'left', 900);
            txt(g, `잎 ${s.leaves}`, 9 * u, y0 + ph * 0.38 + 12 * u, 8.5 * u, C.text, 'left', 800);
            if (seq.i >= ev.length) txt(g, '끝 ✓', 9 * u, y0 + ph * 0.38 + 23 * u, 7.5 * u, C.sub, 'left', 700);
          });
          // 아래 막대
          const by = h - barH + 3 * u;
          const bx = 52 * u;
          const bw = w - bx - 10 * u;
          txt(g, '본 잎', 9 * u, by + 6 * u, 7.5 * u, C.sub, 'left', 700);
          [0, 1].forEach((k) => {
            const yy = by + k * 7 * u;
            rr(g, bx, yy, bw, 5 * u, 2.5 * u);
            g.fillStyle = 'rgba(255,255,255,0.07)';
            g.fill();
            rr(g, bx, yy, (bw * counts[k]!) / total, 5 * u, 2.5 * u);
            g.fillStyle = k ? C.green : C.red;
            g.fill();
          });
          txt(g, `(전체 ${total})`, 9 * u, by + 14 * u, 6 * u, C.sub, "left", 700);
        },
        controls: [
          speedCtl(seq),
          { type: 'range', label: '깊이', min: 2, max: 4, step: 1, value: 3, on: (v) => { depth = v; regen(false); } },
          { type: 'button', label: '새 나무', on: () => regen(true) },
        ] as Control[],
      };
    },
  },
};

/* ═════════ i343 반복 심화 + 시간 예산 ═════════ */
function goBoard(g: G, x0: number, y0: number, s: number, n: number): number {
  const c = s / n;
  const gr = g.createLinearGradient(x0, y0, x0 + s, y0 + s);
  gr.addColorStop(0, '#d9b072');
  gr.addColorStop(1, '#b98a4c');
  rr(g, x0, y0, s, s, c * 0.4);
  g.fillStyle = gr;
  g.fill();
  g.strokeStyle = 'rgba(60,35,10,0.55)';
  g.lineWidth = Math.max(0.6, c * 0.06);
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const p = x0 + c / 2 + i * c;
    const q = y0 + c / 2 + i * c;
    g.moveTo(p, y0 + c / 2);
    g.lineTo(p, y0 + s - c / 2);
    g.moveTo(x0 + c / 2, q);
    g.lineTo(x0 + s - c / 2, q);
  }
  g.stroke();
  return c;
}
function stone(g: G, x: number, y: number, r: number, black: boolean, alpha = 1): void {
  g.globalAlpha = alpha;
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.arc(x + r * 0.12, y + r * 0.16, r, 0, TAU);
  g.fill();
  const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  if (black) {
    gr.addColorStop(0, '#6b7084');
    gr.addColorStop(1, '#0d0f16');
  } else {
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(1, '#c9ccd8');
  }
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
  g.globalAlpha = 1;
}

const I343: DemoMap = {
  i343: {
    kind: '2d',
    caption: '깊이 1 → 2 → 3 … 차례로 끝까지 — 끝난 깊이의 최선 수를 늘 들고 있다가, 시간이 다 되면 하던 깊이는 버리고 그 수를 둬요',
    make() {
      const presets = [2.0, 0.7, 4.6];
      let pi = 0;
      let budget = presets[0]!;
      let auto = true;
      let tau = 0;
      const st = { speed: 1 };
      const BASE = 0.045;
      const cost = (d: number): number => BASE * Math.pow(3, d - 1);
      let seed = newSeed();
      let stones: [number, number, boolean][] = [];
      let cands: number[] = [];
      let bestOf: number[] = [];
      const N = 9;
      const setup = (): void => {
        const r = rng(seed);
        stones = [];
        const used = new Set<number>();
        for (let k = 0; k < 12; k++) {
          const x = 2 + Math.floor(r() * 5);
          const y = 2 + Math.floor(r() * 5);
          if (used.has(y * N + x)) continue;
          used.add(y * N + x);
          stones.push([x, y, k % 2 === 0]);
        }
        cands = [];
        while (cands.length < 4) {
          const x = 1 + Math.floor(r() * 7);
          const y = 1 + Math.floor(r() * 7);
          if (!used.has(y * N + x) && !cands.includes(y * N + x)) cands.push(y * N + x);
        }
        bestOf = [0];
        for (let d = 1; d <= 8; d++) bestOf.push(r() < 0.55 && d > 1 ? bestOf[d - 1]! : Math.floor(r() * 4));
      };
      setup();
      const restart = (): void => {
        tau = 0;
        seed = newSeed();
        setup();
      };
      return {
        draw(g, w, h, _t, dt) {
          reset(g);
          tau += Math.min(dt, 0.1) * st.speed;
          if (tau > budget + 2.4) {
            if (auto) {
              pi = (pi + 1) % presets.length;
              budget = presets[pi]!;
            }
            restart();
          }
          const u = scaleOf(w, h);
          bg(g, w, h);
          const now = Math.min(tau, budget);
          // 깊이별 시작 · 끝
          const starts: number[] = [];
          const ends: number[] = [];
          let cum = 0;
          let doneD = 0;
          let curD = 1;
          for (let d = 1; d <= 8; d++) {
            starts[d] = cum;
            cum += cost(d);
            ends[d] = cum;
            if (ends[d]! <= now) doneD = d;
            else if (starts[d]! <= now) curD = d;
          }
          const timeUp = tau >= budget;
          header(g, w, u, '반복 심화', C.text, `시간 예산 ${budget.toFixed(1)}초`, C.gold);
          // 왼쪽 판
          const bs = Math.min(h - 32 * u, w * 0.4);
          const bx = 8 * u;
          const by = 24 * u;
          const c = goBoard(g, bx, by, bs, N);
          for (const [x, y, bl] of stones) stone(g, bx + c / 2 + x * c, by + c / 2 + y * c, c * 0.43, bl);
          cands.forEach((cell, k) => {
            const x = bx + c / 2 + (cell % N) * c;
            const y = by + c / 2 + Math.floor(cell / N) * c;
            g.strokeStyle = 'rgba(30,20,10,0.5)';
            g.setLineDash([1.5 * u, 1.5 * u]);
            g.lineWidth = 1 * u;
            g.beginPath();
            g.arc(x, y, c * 0.36, 0, TAU);
            g.stroke();
            g.setLineDash([]);
            txt(g, 'ABCD'[k]!, x, y + 0.3 * u, c * 0.42, 'rgba(40,25,10,0.75)', 'center', 900);
          });
          if (doneD > 0) {
            const cell = cands[bestOf[doneD]!]!;
            const x = bx + c / 2 + (cell % N) * c;
            const y = by + c / 2 + Math.floor(cell / N) * c;
            const lastEnd = ends[doneD]!;
            const pop = back((now - lastEnd) / 0.25);
            glow(g, x, y, c * 1.6, C.gold, 0.7);
            stone(g, x, y, c * 0.43 * (timeUp ? 1 : 0.85 + 0.15 * pop), true, timeUp ? 1 : 0.55);
            g.strokeStyle = C.gold;
            g.lineWidth = 1.8 * u;
            g.beginPath();
            g.arc(x, y, c * 0.55, 0, TAU);
            g.stroke();
          }
          const cap = timeUp ? `깊이 ${doneD} 의 수를 둔다` : doneD ? `들고 있는 수: 깊이 ${doneD}` : '생각 중…';
          pill(g, cap, bx + bs / 2, by + bs + 7 * u, 7 * u, timeUp ? C.gold : 'rgba(255,255,255,0.14)', timeUp ? '#1a1405' : C.text);
          // 오른쪽 시간 줄
          const rx = bx + bs + 14 * u;
          const rw = w - rx - 8 * u;
          const maxT = Math.max(budget * 1.18, 0.5);
          const X = (tt: number): number => rx + 26 * u + (tt / maxT) * (rw - 26 * u);
          const showD = Math.min(8, Math.max(doneD + 1, curD) + (timeUp ? 0 : 0));
          const rowH = Math.min(15 * u, (h - 50 * u) / Math.max(4, showD));
          const ry = 30 * u;
          // 예산 선
          const bxl = X(budget);
          g.fillStyle = 'rgba(255,93,108,0.08)';
          g.fillRect(bxl, ry - 6 * u, X(maxT) - bxl, rowH * showD + 8 * u);
          g.strokeStyle = C.red;
          g.lineWidth = 1.4 * u;
          g.setLineDash([3 * u, 2 * u]);
          g.beginPath();
          g.moveTo(bxl, ry - 6 * u);
          g.lineTo(bxl, ry + rowH * showD + 2 * u);
          g.stroke();
          g.setLineDash([]);
          txt(g, '시간 끝', bxl, ry - 9 * u, 6.5 * u, C.red, 'center', 800);
          for (let d = 1; d <= showD; d++) {
            const y = ry + (d - 1) * rowH;
            txt(g, `깊이 ${d}`, rx, y + rowH / 2, 7 * u, d <= doneD ? C.text : C.sub, 'left', 800);
            const s0 = starts[d]!;
            const e0 = ends[d]!;
            const e1 = Math.min(e0, now);
            if (e1 <= s0) continue;
            const abandoned = timeUp && e0 > budget;
            const x0 = X(s0);
            const x1 = Math.max(x0 + 1.5 * u, X(e1));
            rr(g, x0, y + rowH * 0.18, x1 - x0, rowH * 0.64, 2 * u);
            g.fillStyle = abandoned ? 'rgba(120,128,160,0.35)' : d <= doneD ? C.green : C.o;
            g.fill();
            if (abandoned) {
              g.save();
              g.clip();
              g.strokeStyle = 'rgba(255,93,108,0.6)';
              g.lineWidth = 1 * u;
              for (let k = -20; k < 60; k++) {
                g.beginPath();
                g.moveTo(x0 + k * 4 * u, y);
                g.lineTo(x0 + k * 4 * u + rowH, y + rowH);
                g.stroke();
              }
              g.restore();
              txt(g, '버림', Math.min(x1, X(maxT)) - 3 * u, y + rowH / 2, 6.5 * u, C.red, 'right', 900);
            } else if (d <= doneD) {
              txt(g, `★${'ABCD'[bestOf[d]!]}`, x1 + 2 * u, y + rowH / 2, 6.5 * u, C.gold, 'left', 900);
            }
          }
          // 지금 시각 바늘
          const nx = X(now);
          g.strokeStyle = '#fff';
          g.lineWidth = 1 * u;
          g.beginPath();
          g.moveTo(nx, ry - 4 * u);
          g.lineTo(nx, ry + rowH * showD);
          g.stroke();
          txt(g, `${now.toFixed(2)}초`, rx + rw, h - 9 * u, 7 * u, C.sub, 'right', 700);
          txt(g, '깊이 +1 → 시간 ×3', rx, h - 9 * u, 7 * u, C.sub, 'left', 700);
        },
        controls: [
          speedCtl(st),
          { type: 'range', label: '시간 예산 (초)', min: 0.3, max: 5, step: 0.1, value: 2, on: (v) => { budget = v; auto = false; restart(); } },
          { type: 'toggle', label: '예산 자동으로 바꾸기', value: true, on: (v) => { auto = v; } },
          { type: 'button', label: '다시', on: () => restart() },
        ] as Control[],
      };
    },
  },
};

/* ═════════ i344 같은 판 기억 (전치표 · 조브리스트 해시) ═════════ */
const I344: DemoMap = {
  i344: {
    kind: '2d',
    caption: '칸 · 돌마다 정해 둔 무작위 비트를 XOR 로 모은 값이 판의 이름표(해시) — 순서가 달라도 같은 판이면 같은 이름이라 표에서 바로 꺼내요',
    make() {
      const BITS = 12;
      let tt = true;
      let seed = newSeed();
      let codes: number[][] = [];
      let mv: [number, number][] = [];
      let saved = 0;
      const setup = (): void => {
        const r = rng(seed);
        codes = [];
        for (let i = 0; i < 9; i++) codes.push([0, 1 + Math.floor(r() * 4095), 1 + Math.floor(r() * 4095)]);
        const cells = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8], r);
        mv = [[cells[0]!, 1], [cells[1]!, 2], [cells[2]!, 1]];
        saved = 30 + Math.floor(r() * 90);
      };
      setup();
      // 사건: 0 시작 · 1~3 A 경로 · 4 저장 · 5~7 B 경로 · 8 찾기
      const seq = new Seq(9, 0.85, 2.6, () => {
        seed = newSeed();
        setup();
        seq.restart(9);
      });
      const pathMoves = (p: number): [number, number][] => (p === 0 ? mv : [mv[2]!, mv[1]!, mv[0]!]);
      const hashAfter = (p: number, k: number): number => {
        let hv = 0;
        for (let i = 0; i < k; i++) {
          const [cell, pc] = pathMoves(p)[i]!;
          hv ^= codes[cell]![pc]!;
        }
        return hv;
      };
      const boardAfter = (p: number, k: number): number[] => {
        const b = Array<number>(9).fill(0);
        for (let i = 0; i < k; i++) {
          const [cell, pc] = pathMoves(p)[i]!;
          b[cell] = pc;
        }
        return b;
      };
      const bitsRow = (g: G, v: number, x: number, y: number, bw: number, u: number, col: string, lowHi = false, label = ''): void => {
        if (label) txt(g, label, x - 3 * u, y + bw / 2, 6.5 * u, C.sub, 'right', 800);
        for (let k = 0; k < BITS; k++) {
          const bit = (v >> (BITS - 1 - k)) & 1;
          const bx = x + k * bw + (k >= 4 ? 1.5 * u : 0) + (k >= 8 ? 1.5 * u : 0);
          rr(g, bx, y, bw - 1 * u, bw, 1.5 * u);
          const low = lowHi && k >= BITS - 3;
          g.fillStyle = bit ? (low ? C.gold : col) : 'rgba(255,255,255,0.07)';
          g.fill();
          if (bw > 6 * u) txt(g, String(bit), bx + (bw - 1 * u) / 2, y + bw / 2 + 0.3 * u, bw * 0.62, bit ? '#0b1020' : 'rgba(255,255,255,0.3)', 'center', 800);
        }
      };
      return {
        draw(g, w, h, t, dt) {
          reset(g);
          seq.tick(dt);
          const u = scaleOf(w, h);
          bg(g, w, h);
          const ev = seq.i;
          const fr = seq.frac;
          header(g, w, u, '전치표 · 조브리스트', C.text, tt ? '표 켬' : '표 끔', tt ? C.green : C.red);
          // 왼쪽: 두 길
          const lw = Math.min(w * 0.5, 150 * u);
          const bs = Math.min(29 * u, (h - 74 * u) / 2);
          const gapX = (lw - 14 * u) / 3;
          const rows = [0, 1];
          const progress = (p: number): number => (p === 0 ? clamp(ev, 0, 3) : clamp(ev - 4, 0, 3));
          rows.forEach((p) => {
            const y = 40 * u + p * (bs + 34 * u);
            txt(g, p === 0 ? '길 ①' : '길 ②', 8 * u, y - bs / 2 - 7 * u, 7.5 * u, p === 0 ? C.violet : C.teal, 'left', 900);
            const k = progress(p);
            for (let i = 0; i < 3; i++) {
              const x = 8 * u + bs / 2 + 3 * u + i * gapX;
              const shown = i < k;
              const [cell, pc] = pathMoves(p)[i]!;
              miniTTT(g, boardAfter(p, i + 1), x, y, bs, { alpha: shown ? 1 : 0.22, hi: shown ? cell : undefined, frame: shown && i === k - 1 ? (p === 0 ? C.violet : C.teal) : undefined });
              txt(g, `${pc === 1 ? 'X' : 'O'}→${cell + 1}`, x, y + bs / 2 + 6 * u, 6.5 * u, shown ? (pc === 1 ? C.x : C.o) : C.dim, 'center', 800);
              if (i < 2) arrow(g, x + bs / 2 + 2 * u, y, x + gapX - bs / 2 - 2 * u, y, shown ? 'rgba(200,210,255,0.6)' : C.dim2, 1 * u, 3.5 * u);
            }
          });
          // 같은 판 표시
          if (ev >= 8) {
            const x = 8 * u + bs / 2 + 3 * u + 2 * gapX + bs / 2 + 4 * u;
            const y1 = 40 * u;
            const y2 = 40 * u + bs + 34 * u;
            g.strokeStyle = C.gold;
            g.lineWidth = 1.4 * u;
            g.beginPath();
            g.moveTo(x, y1);
            g.quadraticCurveTo(x + 10 * u, (y1 + y2) / 2, x, y2);
            g.stroke();
            pill(g, '같은 판!', x + 6 * u, (y1 + y2) / 2, 6.5 * u, C.gold, '#1a1405', 'left');
          }
          // 오른쪽: 해시 계산
          const rx = lw + 22 * u;
          const bw = Math.min(8.2 * u, (w - rx - 8 * u) / 12.6);
          const inA = ev >= 1 && ev <= 3;
          const inB = ev >= 5 && ev <= 7;
          const p = inB || ev >= 8 ? 1 : 0;
          const k = p === 0 ? clamp(ev, 0, 3) : clamp(ev - 4, 0, 3);
          const hy = 26 * u;
          if (inA || inB) {
            const [cell, pc] = pathMoves(p)[k - 1]!;
            const prev = hashAfter(p, k - 1);
            const code = codes[cell]![pc]!;
            const showRes = fr > 0.45;
            bitsRow(g, prev, rx, hy, bw, u, '#8f9ad0', false, '해시');
            bitsRow(g, code, rx, hy + bw + 3 * u, bw, u, pc === 1 ? C.x : C.o, false, `⊕${pc === 1 ? 'X' : 'O'}${cell + 1}`);
            g.strokeStyle = 'rgba(255,255,255,0.4)';
            g.lineWidth = 1 * u;
            g.beginPath();
            g.moveTo(rx, hy + 2 * bw + 5.5 * u);
            g.lineTo(rx + 12 * bw + 3 * u, hy + 2 * bw + 5.5 * u);
            g.stroke();
            if (showRes) bitsRow(g, prev ^ code, rx, hy + 2 * bw + 8 * u, bw, u, p === 0 ? C.violet : C.teal, true, '=');
          } else {
            const hv = hashAfter(p, k);
            bitsRow(g, hv, rx, hy + bw + 3 * u, bw, u, p === 0 ? C.violet : C.teal, true, '해시');
            if (ev === 0) txt(g, '빈 판 = 0', rx + 6 * bw, hy + bw * 0.2, 7 * u, C.sub, 'center', 700);
          }
          // 표
          const ty = hy + 3 * bw + 24 * u;
          const slotH = Math.min(11 * u, (h - ty - 6 * u) / 8);
          const finalHash = hashAfter(0, 3);
          const slot = finalHash & 7;
          txt(g, '전치표 (해시 끝 3비트 = 칸 번호)', rx, ty - 6 * u, 6.5 * u, C.sub, 'left', 700);
          for (let i = 0; i < 8; i++) {
            const y = ty + i * slotH;
            const has = ev >= 4 && i === slot && tt;
            const hit = ev >= 8 && i === slot;
            rr(g, rx, y, w - rx - 8 * u, slotH - 1.5 * u, 2 * u);
            g.fillStyle = hit && tt ? `rgba(111,227,160,${0.25 + 0.15 * Math.sin(t * 8)})` : has ? 'rgba(184,146,255,0.22)' : 'rgba(255,255,255,0.04)';
            g.fill();
            txt(g, String(i), rx + 5 * u, y + slotH / 2 - 0.5 * u, 6.5 * u, has ? C.gold : C.dim, 'center', 800);
            if (has) {
              const a = ev === 4 ? easeOut(fr * 2) : 1;
              g.globalAlpha = a;
              txt(g, `판 값 저장 · 계산 ${saved}노드`, rx + 12 * u, y + slotH / 2 - 0.5 * u, 6.5 * u, C.text, 'left', 700);
              g.globalAlpha = 1;
            }
          }
          if (ev >= 8) {
            if (tt) pill(g, `찾았다! 계산 0 (아낀 ${saved}노드)`, w - 8 * u, h - 8 * u, 7 * u, C.green, '#06180e', 'right');
            else {
              const k2 = clamp(seq.holdT / 2, 0, 1);
              pill(g, `다시 계산 … ${Math.round(saved * k2)} / ${saved}노드`, w - 8 * u, h - 8 * u, 7 * u, C.red, '#1a0610', 'right');
            }
          } else if (ev === 4) pill(g, '표에 저장', w - 8 * u, h - 8 * u, 7 * u, C.violet, '#140a26', 'right');
        },
        controls: [
          speedCtl(seq),
          { type: 'toggle', label: '전치표 쓰기', value: true, on: (v) => { tt = v; } },
          { type: 'button', label: '다른 수 · 다른 비트', on: () => { seed = newSeed(); setup(); seq.restart(9); } },
        ] as Control[],
      };
    },
  },
};

/* ═════════ i345 정지 탐색 (수평선 효과) ═════════ */
type Pc = { k: string; white: boolean; c: number; r: number };
const I345: DemoMap = {
  i345: {
    kind: '2d',
    caption: '왼쪽은 한 수만 보고 멈춰 「룩 공짜!」라 착각 → 다음 수에 퀸을 잃어요. 오른쪽은 잡기가 끝날 때까지 더 보고(정지 탐색) 안전한 나이트를 골라요',
    make() {
      const st = { speed: 1 };
      let T = 0;
      const CYCLE = 8.5;
      const VAL: Record<string, number> = { Q: 9, R: 5, N: 3, P: 1, K: 0 };
      const base = (): Pc[] => [
        { k: 'K', white: true, c: 0, r: 4 },
        { k: 'Q', white: true, c: 2, r: 4 },
        { k: 'R', white: false, c: 2, r: 1 },
        { k: 'P', white: false, c: 1, r: 0 },
        { k: 'N', white: false, c: 4, r: 2 },
        { k: 'K', white: false, c: 4, r: 0 },
      ];
      const GL: Record<string, [string, string]> = { K: ['♚', '♚'], Q: ['♛', '♛'], R: ['♜', '♜'], N: ['♞', '♞'], P: ['♟', '♟'] };
      const drawBoard = (g: G, x0: number, y0: number, s: number, pcs: Pc[], ghost: Pc[], u: number): number => {
        const c = s / 5;
        for (let r = 0; r < 5; r++)
          for (let q = 0; q < 5; q++) {
            g.fillStyle = (r + q) % 2 ? '#7a6a8f' : '#cfc3dc';
            g.fillRect(x0 + q * c, y0 + r * c, c, c);
          }
        g.strokeStyle = 'rgba(0,0,0,0.5)';
        g.lineWidth = 1 * u;
        g.strokeRect(x0, y0, s, s);
        const put = (p: Pc, a: number): void => {
          g.globalAlpha = a;
          const px = x0 + p.c * c + c / 2;
          const py = y0 + p.r * c + c / 2;
          g.fillStyle = 'rgba(0,0,0,0.35)';
          g.beginPath();
          g.arc(px + c * 0.04, py + c * 0.06, c * 0.4, 0, TAU);
          g.fill();
          const gr = g.createRadialGradient(px - c * 0.12, py - c * 0.14, c * 0.04, px, py, c * 0.4);
          gr.addColorStop(0, p.white ? '#fffaf0' : '#4a3f63');
          gr.addColorStop(1, p.white ? '#e2d6bd' : '#191427');
          g.fillStyle = gr;
          g.beginPath();
          g.arc(px, py, c * 0.39, 0, TAU);
          g.fill();
          g.strokeStyle = p.white ? '#a8915f' : '#b7a6e6';
          g.lineWidth = Math.max(1, c * 0.035);
          g.stroke();
          g.font = `${c * 0.56}px ${FS}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillStyle = p.white ? '#3a2c14' : '#f1ebff';
          g.fillText(GL[p.k]![0], px, py + c * 0.03);
          g.globalAlpha = 1;
        };
        for (const p of pcs) put(p, 1);
        for (const p of ghost) put(p, 0.45);
        return c;
      };
      const sq = (x0: number, y0: number, c: number, q: number, r: number): [number, number] => [x0 + q * c + c / 2, y0 + r * c + c / 2];
      return {
        draw(g, w, h, _t, dt) {
          reset(g);
          T += Math.min(dt, 0.1) * st.speed;
          if (T > CYCLE) T = 0;
          const u = scaleOf(w, h);
          bg(g, w, h);
          const pw = w / 2;
          const s = Math.min(pw - 34 * u, h - 52 * u);
          [0, 1].forEach((side) => {
            const px = side * pw;
            const x0 = px + (pw - s - 14 * u) / 2;
            const y0 = 30 * u;
            txt(g, side ? '정지 탐색 (잡기 끝까지)' : '깊이 1 에서 멈춤', px + pw / 2, 11 * u, 8.5 * u, side ? C.green : C.red, 'center', 900);
            let pcs = base();
            let ghost: Pc[] = [];
            const arrows: [number, number, number, number, string, string][] = [];
            let evalV = 0;
            let msg = '';
            let msgCol = C.text;
            const Q = (): Pc => pcs.find((p) => p.k === 'Q')!;
            const take = (k: string, white: boolean): void => {
              pcs = pcs.filter((p) => !(p.k === k && p.white === white));
            };
            if (T < 1.4) {
              arrows.push([2, 4, 2, 1, 'rgba(255,255,255,0.75)', `+${VAL.R}`]);
              arrows.push([2, 4, 4, 2, 'rgba(255,255,255,0.75)', `+${VAL.N}`]);
              msg = '잡을 수 있는 것 둘';
            } else if (side === 0) {
              if (T < 2.4) {
                arrows.push([2, 4, 2, 1, C.gold, `+${VAL.R}`]);
                msg = '룩이 더 크다!';
                evalV = 5 * ease((T - 1.4) / 1);
              } else {
                take('R', false);
                const q = Q();
                q.c = 2;
                q.r = 1;
                evalV = 5;
                msg = '평가 +5 → 이 수로 결정';
                msgCol = C.gold;
                if (T > 3.6) {
                  // 수평선 너머: 폰이 퀸을 잡음
                  const k = ease((T - 3.6) / 0.7);
                  const p = pcs.find((x) => x.k === 'P')!;
                  p.c = lerp(1, 2, k);
                  p.r = lerp(0, 1, k);
                  if (k >= 1) take('Q', true);
                  evalV = lerp(5, -4, k);
                  msg = k >= 1 ? '다음 수: 폰이 퀸을 잡음 → −4' : '그런데 다음 수에…';
                  msgCol = C.red;
                }
              }
            } else {
              if (T < 3.2) {
                // 룩 줄을 끝까지
                const k = clamp((T - 1.4) / 0.6, 0, 1);
                ghost = [{ k: 'Q', white: true, c: 2, r: 1 }];
                arrows.push([2, 4, 2, 1, 'rgba(255,209,102,0.8)', '+5']);
                if (k >= 1) {
                  arrows.push([1, 0, 2, 1, C.red, '−9']);
                  msg = '룩 잡으면 → 폰이 다시 잡음: −4';
                  msgCol = C.red;
                  evalV = -4;
                } else msg = '룩 줄 더 보기…';
              } else if (T < 4.8) {
                ghost = [{ k: 'Q', white: true, c: 4, r: 2 }];
                arrows.push([2, 4, 4, 2, 'rgba(255,209,102,0.8)', '+3']);
                msg = '나이트 잡으면 → 다시 잡을 것 없음: +3';
                msgCol = C.green;
                evalV = 3;
              } else {
                const k = ease((T - 4.8) / 0.6);
                take('N', false);
                const q = Q();
                q.c = lerp(2, 4, k);
                q.r = lerp(4, 2, k);
                evalV = 3;
                msg = '안전한 +3 을 고름 ✓';
                msgCol = C.green;
              }
            }
            const c = drawBoard(g, x0, y0, s, pcs, ghost, u);
            for (const [a, b, cc, d, col, lab] of arrows) {
              const [ax, ay] = sq(x0, y0, c, a, b);
              const [bx2, by2] = sq(x0, y0, c, cc, d);
              arrow(g, ax, ay, bx2, by2, col, 2 * u, 7 * u);
              pill(g, lab, (ax + bx2) / 2 + 6 * u, (ay + by2) / 2, 6.5 * u, col === C.red ? C.red : 'rgba(255,240,200,0.95)', '#140f05');
            }
            // 평가 막대
            const mx = x0 + s + 7 * u;
            const mh = s;
            g.fillStyle = 'rgba(255,255,255,0.08)';
            rr(g, mx, y0, 6 * u, mh, 3 * u);
            g.fill();
            const mid = y0 + mh / 2;
            const yv = mid - (evalV / 10) * (mh / 2);
            g.fillStyle = evalV >= 0 ? C.green : C.red;
            g.fillRect(mx, Math.min(mid, yv), 6 * u, Math.abs(yv - mid));
            g.strokeStyle = 'rgba(255,255,255,0.5)';
            g.lineWidth = 0.8 * u;
            g.beginPath();
            g.moveTo(mx - 1 * u, mid);
            g.lineTo(mx + 7 * u, mid);
            g.stroke();
            txt(g, `${evalV >= 0 ? '+' : ''}${evalV.toFixed(0)}`, mx + 3 * u, y0 - 5 * u, 6.5 * u, evalV >= 0 ? C.green : C.red, 'center', 900);
            // 수평선 (왼쪽만)
            if (side === 0 && T > 2.4) {
              const hy = y0 + s + 6 * u;
              g.strokeStyle = 'rgba(255,93,108,0.8)';
              g.setLineDash([3 * u, 2 * u]);
              g.lineWidth = 1 * u;
              g.beginPath();
              g.moveTo(x0, hy);
              g.lineTo(x0 + s, hy);
              g.stroke();
              g.setLineDash([]);
            }
            pill(g, msg, px + pw / 2, h - 9 * u, 6.8 * u, 'rgba(10,14,30,0.85)', msgCol);
          });
          g.strokeStyle = 'rgba(255,255,255,0.08)';
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(pw, 20 * u);
          g.lineTo(pw, h - 20 * u);
          g.stroke();
        },
        controls: [speedCtl(st), { type: 'button', label: '처음부터', on: () => { T = 0; } }] as Control[],
      };
    },
  },
};

/* ═════════ i346 평가 함수 설계 (가중치 → 수 선택) ═════════ */
const I346: DemoMap = {
  i346: {
    kind: '2d',
    caption: '점수 = 가운데 × w₁ + 내 3줄 × w₂ − 상대 3줄 × w₃ — 가중치만 바꿔도 AI 가 고르는 칸(금빛)이 달라져요',
    make() {
      // 7 × 6 (r = 0 아래). 1 빨강(나) · 2 노랑
      const B: number[][] = Array.from({ length: 7 }, () => Array<number>(6).fill(0));
      for (const [c, r] of [[2, 0], [4, 0], [5, 0], [4, 1]] as [number, number][]) B[c]![r] = 1;
      for (const [c, r] of [[3, 0], [6, 0], [6, 1], [6, 2]] as [number, number][]) B[c]![r] = 2;
      const colW = [0, 1, 2, 3, 2, 1, 0];
      const windows: [number, number][][] = [];
      for (let c = 0; c < 7; c++)
        for (let r = 0; r < 6; r++)
          for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]] as [number, number][]) {
            const wv: [number, number][] = [];
            for (let k = 0; k < 4; k++) wv.push([c + dc * k, r + dr * k]);
            if (wv.every(([a, b]) => a >= 0 && a < 7 && b >= 0 && b < 6)) windows.push(wv);
          }
      const count3 = (bb: number[][], who: number): number => {
        let n = 0;
        for (const wv of windows) {
          let m = 0;
          let e = 0;
          for (const [a, b] of wv) {
            const v = bb[a]![b]!;
            if (v === who) m++;
            else if (v === 0) e++;
          }
          if (m === 3 && e === 1) n++;
        }
        return n;
      };
      const feats: ({ center: number; own: number; opp: number; row: number } | null)[] = [];
      for (let c = 0; c < 7; c++) {
        const row = B[c]!.indexOf(0);
        if (row < 0) {
          feats.push(null);
          continue;
        }
        const nb = B.map((col) => col.slice());
        nb[c]![row] = 1;
        feats.push({ center: colW[c]!, own: count3(nb, 1), opp: count3(nb, 2), row });
      }
      const presets: [number, number, number][] = [
        [1, 0.15, 0.1],
        [0.25, 1, 0.1],
        [0.2, 0.3, 1],
      ];
      let auto = true;
      let pi = 0;
      let pt = 0;
      const wv: [number, number, number] = [1, 0.15, 0.1];
      let from: [number, number, number] = [...wv];
      let lastBest = -1;
      let dropT = 0;
      const st = { speed: 1 };
      const names = ['가운데', '내 3줄', '상대 3줄'];
      const cols = [C.violet, C.x, C.gold];
      return {
        draw(g, w, h, t, dt) {
          reset(g);
          const d = Math.min(dt, 0.1) * st.speed;
          if (auto) {
            pt += d;
            if (pt > 3.2) {
              pt = 0;
              from = [...wv];
              pi = (pi + 1) % presets.length;
            }
            const k = ease(pt / 0.9);
            const tg = presets[pi]!;
            for (let i = 0; i < 3; i++) wv[i] = lerp(from[i]!, tg[i]!, k);
          }
          const u = scaleOf(w, h);
          bg(g, w, h);
          header(g, w, u, '평가 함수', C.text);
          const scores = feats.map((f) => (f ? f.center * wv[0] + f.own * 3 * wv[1] - f.opp * 3 * wv[2] : -Infinity));
          let best = 0;
          scores.forEach((s, i) => {
            if (s > scores[best]!) best = i;
          });
          if (best !== lastBest) {
            lastBest = best;
            dropT = 0;
          }
          dropT += d;
          // 판
          const bwid = Math.min(w * 0.52, (h - 86 * u) * (7 / 6));
          const cs = bwid / 7;
          const bx = 8 * u;
          const by = h - cs * 6 - 8 * u;
          // 점수 막대 (판 위)
          const barTop = 24 * u;
          const barMid = barTop + (by - barTop - 6 * u) * 0.5;
          const maxAbs = Math.max(1, ...scores.filter((s) => Number.isFinite(s)).map((s) => Math.abs(s)));
          const up = barMid - barTop - 8 * u;
          const down = by - 11 * u - barMid;
          for (let c = 0; c < 7; c++) {
            const s = scores[c]!;
            if (!Number.isFinite(s)) continue;
            const x = bx + c * cs + cs * 0.2;
            const hgt = (s / maxAbs) * (s >= 0 ? up : down);
            g.fillStyle = c === best ? C.gold : s >= 0 ? 'rgba(111,227,160,0.75)' : 'rgba(255,93,108,0.7)';
            rr(g, x, s >= 0 ? barMid - hgt : barMid, cs * 0.6, Math.abs(hgt), 1.5 * u);
            g.fill();
            txt(g, s.toFixed(1), x + cs * 0.3, s >= 0 ? barMid - hgt - 4.5 * u : barMid + Math.abs(hgt) + 4 * u, 5.8 * u, c === best ? C.gold : C.sub, 'center', 800);
          }
          g.strokeStyle = 'rgba(255,255,255,0.3)';
          g.lineWidth = 0.8 * u;
          g.beginPath();
          g.moveTo(bx, barMid);
          g.lineTo(bx + bwid, barMid);
          g.stroke();
          // 판 몸
          rr(g, bx - 2 * u, by - 2 * u, bwid + 4 * u, cs * 6 + 4 * u, 4 * u);
          g.fillStyle = '#2346b8';
          g.fill();
          const disc = (x: number, y: number, v: number, a = 1): void => {
            g.globalAlpha = a;
            const gr = g.createRadialGradient(x - cs * 0.12, y - cs * 0.14, cs * 0.05, x, y, cs * 0.4);
            if (v === 1) {
              gr.addColorStop(0, '#ff8a9c');
              gr.addColorStop(1, '#d62845');
            } else {
              gr.addColorStop(0, '#ffe68a');
              gr.addColorStop(1, '#e0a812');
            }
            g.fillStyle = gr;
            g.beginPath();
            g.arc(x, y, cs * 0.38, 0, TAU);
            g.fill();
            g.globalAlpha = 1;
          };
          for (let c = 0; c < 7; c++)
            for (let r = 0; r < 6; r++) {
              const x = bx + c * cs + cs / 2;
              const y = by + (5 - r) * cs + cs / 2;
              const v = B[c]![r]!;
              if (v) disc(x, y, v);
              else {
                g.fillStyle = '#0d1430';
                g.beginPath();
                g.arc(x, y, cs * 0.38, 0, TAU);
                g.fill();
              }
            }
          // 떨어지는 말
          const f = feats[best];
          if (f) {
            const x = bx + best * cs + cs / 2;
            const yEnd = by + (5 - f.row) * cs + cs / 2;
            const k = clamp(dropT / 0.45, 0, 1);
            const y = lerp(by - cs * 0.6, yEnd, k * k);
            glow(g, x, yEnd, cs * 0.9, C.gold, 0.5 + 0.2 * Math.sin(t * 6));
            disc(x, y, 1, 0.92);
          }
          // 오른쪽: 가중치 · 특징
          const rx = bx + bwid + 14 * u;
          const rw = w - rx - 8 * u;
          txt(g, '가중치', rx, 26 * u, 7.5 * u, C.sub, 'left', 800);
          for (let i = 0; i < 3; i++) {
            const y = 38 * u + i * 20 * u;
            txt(g, names[i]!, rx, y, 7.5 * u, cols[i]!, 'left', 800);
            txt(g, `w${'₁₂₃'[i]} ${wv[i]!.toFixed(2)}`, rx + rw, y, 7 * u, C.text, 'right', 700);
            rr(g, rx, y + 5 * u, rw, 4 * u, 2 * u);
            g.fillStyle = 'rgba(255,255,255,0.08)';
            g.fill();
            rr(g, rx, y + 5 * u, rw * wv[i]!, 4 * u, 2 * u);
            g.fillStyle = cols[i]!;
            g.fill();
            g.fillStyle = '#fff';
            g.beginPath();
            g.arc(rx + rw * wv[i]!, y + 7 * u, 3 * u, 0, TAU);
            g.fill();
          }
          if (f) {
            const y = 38 * u + 3 * 20 * u;
            txt(g, `고른 칸 ${best + 1}번 줄`, rx, y, 7.5 * u, C.gold, 'left', 900);
            txt(g, `가운데 ${f.center} · 내 3줄 ${f.own} · 상대 3줄 ${f.opp}`, rx, y + 11 * u, 6.2 * u, C.sub, 'left', 700);
            const why = f.opp === 0 && feats.some((q) => q && q.opp > 0) && wv[2] >= wv[0] && wv[2] >= wv[1] ? '상대 4줄 막기' : f.own > 0 && wv[1] >= wv[0] ? '내 3줄 만들기' : '가운데 차지';
            pill(g, why, rx, y + 23 * u, 6.8 * u, 'rgba(255,209,102,0.92)', '#1a1405', 'left');
          }
        },
        controls: [
          { type: 'toggle', label: '가중치 자동으로 바꾸기', value: true, on: (v) => { auto = v; } },
          { type: 'range', label: 'w₁ 가운데', min: 0, max: 1, step: 0.05, value: 1, on: (v) => { auto = false; wv[0] = v; } },
          { type: 'range', label: 'w₂ 내 3줄', min: 0, max: 1, step: 0.05, value: 0.15, on: (v) => { auto = false; wv[1] = v; } },
          { type: 'range', label: 'w₃ 상대 3줄 막기', min: 0, max: 1, step: 0.05, value: 0.1, on: (v) => { auto = false; wv[2] = v; } },
        ] as Control[],
      };
    },
  },
};

/* ═════════ i347 몬테카를로 트리 탐색 (UCT) ═════════ */
interface MC {
  b: number[];
  mover: number;
  move: number;
  parent: MC | null;
  kids: MC[];
  untried: number[];
  legal: number[];
  N: number;
  W: number;
  x0: number;
  x1: number;
  depth: number;
  born: number;
}
function winColor(q: number, a = 1): string {
  // 빨강 → 노랑 → 초록
  const r = q < 0.5 ? 255 : Math.round(lerp(255, 111, (q - 0.5) * 2));
  const gg = q < 0.5 ? Math.round(lerp(93, 209, q * 2)) : Math.round(lerp(209, 227, (q - 0.5) * 2));
  const b = q < 0.5 ? Math.round(lerp(108, 102, q * 2)) : Math.round(lerp(102, 160, (q - 0.5) * 2));
  return `rgba(${r},${gg},${b},${a})`;
}
const I347: DemoMap = {
  i347: {
    kind: '2d',
    caption: '고르기(금빛 길) → 새 마디 펼치기 → 끝까지 아무렇게나 둬 보기(점선) → 결과를 길 따라 올리기 — 많이 이긴 쪽 가지가 굵고 크게 자라요',
    make() {
      const st = { speed: 1 };
      let Cexp = 1.2;
      let root!: MC;
      let it = 0;
      let acc = 0;
      let r = rng(newSeed());
      let last: { path: MC[]; leaf: MC; result: number; len: number } | null = null;
      let lastT = 0;
      let holdT = 0;
      let clock = 0;
      const MAXIT = 700;
      const legalOf = (b: number[]): number[] => (tttWin(b) ? [] : b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0));
      const mkNode = (b: number[], mover: number, move: number, parent: MC | null, x0: number, x1: number): MC => {
        const legal = legalOf(b);
        return { b, mover, move, parent, kids: [], untried: shuffle(legal.slice(), r), legal, N: 0, W: 0, x0, x1, depth: parent ? parent.depth + 1 : 0, born: clock };
      };
      const reset0 = (): void => {
        r = rng(newSeed());
        const b = Array<number>(9).fill(0);
        const cells = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8], r);
        b[cells[0]!] = 1;
        b[cells[1]!] = 2;
        root = mkNode(b, 1, -1, null, 0, 1);
        it = 0;
        acc = 0;
        last = null;
        holdT = 0;
      };
      reset0();
      const iterate = (): void => {
        let n = root;
        const path: MC[] = [root];
        while (!n.untried.length && n.kids.length) {
          let best = n.kids[0]!;
          let bv = -Infinity;
          for (const k of n.kids) {
            const v = k.W / k.N + Cexp * Math.sqrt(Math.log(n.N) / k.N);
            if (v > bv) {
              bv = v;
              best = k;
            }
          }
          n = best;
          path.push(n);
        }
        if (n.untried.length) {
          const m = n.untried.pop()!;
          const nb = n.b.slice();
          nb[m] = n.mover;
          const idx = n.legal.indexOf(m);
          const span = (n.x1 - n.x0) / n.legal.length;
          const c = mkNode(nb, 3 - n.mover, m, n, n.x0 + idx * span, n.x0 + (idx + 1) * span);
          n.kids.push(c);
          n = c;
          path.push(n);
        }
        // 끝까지 아무렇게나
        const b = n.b.slice();
        let mover = n.mover;
        let len = 0;
        let res = tttWin(b);
        while (!res) {
          const em = legalOf(b);
          b[em[Math.floor(r() * em.length)]!] = mover;
          mover = 3 - mover;
          len++;
          res = tttWin(b);
        }
        for (const p of path) {
          p.N++;
          const justMoved = 3 - p.mover;
          p.W += res === 3 ? 0.5 : res === justMoved ? 1 : 0;
        }
        last = { path, leaf: n, result: res, len };
        lastT = clock;
        it++;
      };
      return {
        draw(g, w, h, _t, dt) {
          reset(g);
          const d = Math.min(dt, 0.1) * st.speed;
          clock += d;
          const ivl = Math.max(0.035, 0.75 / (1 + it * 0.16));
          if (it < MAXIT) {
            acc += d;
            let guard = 0;
            while (acc >= ivl && guard++ < 40 && it < MAXIT) {
              acc -= ivl;
              iterate();
            }
          } else {
            holdT += d;
            if (holdT > 2.5) reset0();
          }
          const u = scaleOf(w, h);
          bg(g, w, h);
          header(g, w, u, '몬테카를로 트리 탐색', C.text, `반복 ${it}`, C.gold);
          // 왼쪽: 뿌리 판 + 방문 수
          const bs = Math.min(h * 0.46, w * 0.25);
          const bx = 8 * u + bs / 2 + 2 * u;
          const by = 36 * u + bs / 2;
          const heat = Array<number>(9).fill(0);
          for (const k of root.kids) heat[k.move] = k.N;
          let bestK: MC | null = null;
          for (const k of root.kids) if (!bestK || k.N > bestK.N) bestK = k;
          miniTTT(g, root.b, bx, by, bs, { heat, frame: 'rgba(255,209,102,0.5)' });
          const c = bs / 3;
          for (const k of root.kids) {
            const px = bx - bs / 2 + (k.move % 3) * c + c / 2;
            const py = by - bs / 2 + Math.floor(k.move / 3) * c + c / 2;
            txt(g, String(k.N), px, py + 0.3 * u, Math.min(c * 0.36, 9 * u), k === bestK ? '#1a1405' : '#fff', 'center', 900);
          }
          txt(g, '칸 = 방문 수', bx, by + bs / 2 + 8 * u, 6.5 * u, C.sub, 'center', 700);
          if (bestK && it > 30) {
            const q = bestK.W / bestK.N;
            pill(g, `고를 칸 승률 ${Math.round(q * 100)}%`, bx, by + bs / 2 + 21 * u, 6.5 * u, winColor(q), '#0b1020');
          }
          txt(g, 'X 차례', bx, 27 * u, 7 * u, C.x, 'center', 800);
          // 오른쪽: 나무
          const L = bx + bs / 2 + 14 * u;
          const R = w - 6 * u;
          const top = 26 * u;
          const DMAX = 5;
          const dy = (h - top - 10 * u) / DMAX;
          const X = (n: MC): number => L + ((n.x0 + n.x1) / 2) * (R - L);
          const Y = (n: MC): number => top + n.depth * dy;
          const onPath = new Set<MC>();
          const phase = last ? clamp((clock - lastT) / Math.max(ivl, 0.0001), 0, 1) : 1;
          const slow = ivl > 0.22;
          if (last) for (const p of last.path) onPath.add(p);
          const stack: MC[] = [root];
          // 줄 먼저
          while (stack.length) {
            const n = stack.pop()!;
            if (n.depth >= DMAX) continue;
            for (const k of n.kids) {
              const lw = (0.4 + Math.sqrt(k.N) * 0.22) * u;
              const hot = onPath.has(k) && (!slow || phase < 0.9);
              g.strokeStyle = hot ? C.gold : winColor(k.W / Math.max(1, k.N), 0.55);
              g.lineWidth = hot ? Math.max(lw, 1.6 * u) : lw;
              g.beginPath();
              g.moveTo(X(n), Y(n));
              g.lineTo(X(k), Y(k));
              g.stroke();
              stack.push(k);
            }
          }
          // 마디
          stack.push(root);
          while (stack.length) {
            const n = stack.pop()!;
            if (n.depth > DMAX) continue;
            const pop = back((clock - n.born) / 0.3);
            const rad = Math.min(7.5 * u, (1.2 + Math.sqrt(n.N) * 0.42) * u) * pop;
            const x = X(n);
            const y = Y(n);
            if (onPath.has(n) && slow) glow(g, x, y, rad * 3, C.gold, 0.45 * (1 - phase * 0.5));
            g.fillStyle = n === root ? '#e8ecff' : winColor(n.W / Math.max(1, n.N));
            g.beginPath();
            g.arc(x, y, Math.max(1 * u, rad), 0, TAU);
            g.fill();
            if (n.depth < DMAX) for (const k of n.kids) stack.push(k);
          }
          // 끝까지 둬 보기 (점선)
          if (last && slow && last.leaf.depth <= DMAX) {
            const x = X(last.leaf);
            const y = Y(last.leaf);
            const k = clamp((phase - 0.3) / 0.45, 0, 1);
            const yEnd = Math.min(h - 6 * u, y + dy * Math.max(1, last.len) * 0.75);
            g.strokeStyle = 'rgba(200,210,255,0.75)';
            g.setLineDash([2 * u, 2 * u]);
            g.lineWidth = 1 * u;
            g.beginPath();
            g.moveTo(x, y);
            const steps = 8;
            for (let i = 1; i <= Math.round(steps * k); i++) g.lineTo(x + Math.sin(i * 2.1) * 4 * u, lerp(y, yEnd, i / steps));
            g.stroke();
            g.setLineDash([]);
            if (k >= 1) {
              const res = last.result;
              pill(g, res === 3 ? '무' : res === 1 ? 'X 승' : 'O 승', x, yEnd, 6 * u, res === 3 ? '#aab3d6' : res === 1 ? C.x : C.o, '#0b1020');
            }
          }
          if (it >= MAXIT) pill(g, '가장 많이 가 본 칸을 둔다', (L + R) / 2, h - 8 * u, 7 * u, C.gold);
        },
        controls: [
          speedCtl(st),
          { type: 'range', label: '탐험 상수 C (클수록 넓게)', min: 0.2, max: 3, step: 0.1, value: 1.2, on: (v) => { Cexp = v; reset0(); } },
          { type: 'button', label: '다시', on: () => reset0() },
        ] as Control[],
      };
    },
  },
};

/* ═════════ i348 기대값 탐색 (주사위 — 확률 마디) ═════════ */
function die(g: G, x: number, y: number, s: number, face: number, lit: boolean, a = 1): void {
  g.globalAlpha = a;
  rr(g, x - s / 2, y - s / 2, s, s, s * 0.2);
  const gr = g.createLinearGradient(x, y - s / 2, x, y + s / 2);
  gr.addColorStop(0, lit ? '#ffffff' : '#4c5578');
  gr.addColorStop(1, lit ? '#d9def0' : '#353c5a');
  g.fillStyle = gr;
  g.fill();
  const P: Record<number, [number, number][]> = {
    1: [[0, 0]],
    2: [[-1, -1], [1, 1]],
    3: [[-1, -1], [0, 0], [1, 1]],
    4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
  };
  g.fillStyle = face === 1 ? '#e8364f' : lit ? '#1b2036' : '#8a93b8';
  for (const [px, py] of P[face]!) {
    g.beginPath();
    g.arc(x + px * s * 0.26, y + py * s * 0.26, s * (face === 1 ? 0.13 : 0.085), 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;
}
const I348: DemoMap = {
  i348: {
    kind: '2d',
    caption: '돼지 주사위: 「굴리기」는 확률 마디 — 여섯 눈의 결과를 1/6 씩 평균 내서 「멈추기」와 비교해요 (1이 나오면 이번 판 점수 0)',
    make() {
      const st = { speed: 1 };
      const Ts = [6, 14, 26, 18, 32];
      let ti = 0;
      let Tv = Ts[0]!;
      let auto = true;
      let ph = 0;
      const CYC = 4.6;
      return {
        draw(g, w, h, t, dt) {
          reset(g);
          ph += Math.min(dt, 0.1) * st.speed;
          if (ph > CYC) {
            ph = 0;
            if (auto) {
              ti = (ti + 1) % Ts.length;
              Tv = Ts[ti]!;
            }
          }
          const u = scaleOf(w, h);
          bg(g, w, h);
          header(g, w, u, '기대값 탐색', C.text, `이번 판 쌓은 점수 T = ${Tv}`, C.gold);
          const vals = [0, Tv + 2, Tv + 3, Tv + 4, Tv + 5, Tv + 6];
          const roll = vals.reduce((a, b) => a + b, 0) / 6;
          const hold = Tv;
          const litN = clamp(Math.floor((ph - 0.6) / 0.3) + 1, 0, 6);
          const partial = vals.slice(0, litN).reduce((a, b) => a + b, 0);
          const showAvg = ph > 2.5;
          const decide = ph > 3.1;
          const rollWins = roll > hold;
          // 나무 (왼쪽 60%)
          const TW = w * 0.6;
          const rootX = TW * 0.42;
          const rootY = 34 * u;
          const holdX = TW * 0.12;
          const chX = TW * 0.6;
          const midY = 34 * u + (h - 70 * u) * 0.45;
          const leafY = h - 30 * u;
          // 줄
          const edge = (x0: number, y0: number, x1: number, y1: number, hot: boolean): void => {
            g.strokeStyle = hot ? C.gold : 'rgba(160,175,230,0.45)';
            g.lineWidth = (hot ? 2.2 : 1.1) * u;
            g.beginPath();
            g.moveTo(x0, y0);
            g.lineTo(x1, y1);
            g.stroke();
          };
          edge(rootX, rootY, holdX, midY, decide && !rollWins);
          edge(rootX, rootY, chX, midY, decide && rollWins);
          const dieS = Math.min(16 * u, (TW - 16 * u) / 7.2);
          const leafX = (i: number): number => chX + (i - 2.5) * dieS * 1.28 - 0 * u;
          for (let i = 0; i < 6; i++) {
            const lx = clamp(leafX(i), 8 * u + dieS / 2, TW - dieS / 2);
            g.strokeStyle = i < litN ? 'rgba(92,200,255,0.8)' : 'rgba(160,175,230,0.25)';
            g.lineWidth = 1 * u;
            g.beginPath();
            g.moveTo(chX, midY);
            g.lineTo(lx, leafY - dieS / 2);
            g.stroke();
            if (i < 6) txt(g, '1/6', lerp(chX, lx, 0.8), lerp(midY, leafY - dieS / 2, 0.8) - 3 * u, 5.5 * u, 'rgba(160,190,255,0.7)', 'center', 700);
          }
          // 뿌리
          rr(g, rootX - 15 * u, rootY - 8 * u, 30 * u, 16 * u, 3 * u);
          g.fillStyle = '#2f8a66';
          g.fill();
          txt(g, 'MAX', rootX, rootY + 0.3 * u, 7.5 * u, '#fff', 'center', 900);
          txt(g, '나의 선택', rootX + 19 * u, rootY, 6.5 * u, C.sub, 'left', 700);
          // 멈추기 잎
          rr(g, holdX - 17 * u, midY - 11 * u, 34 * u, 22 * u, 4 * u);
          g.fillStyle = decide && !rollWins ? 'rgba(255,209,102,0.25)' : 'rgba(184,146,255,0.18)';
          g.fill();
          g.strokeStyle = C.violet;
          g.lineWidth = 1 * u;
          g.stroke();
          txt(g, '멈추기', holdX, midY - 4 * u, 7 * u, C.violet, 'center', 900);
          txt(g, `${hold}점`, holdX, midY + 5 * u, 7.5 * u, '#fff', 'center', 900);
          // 확률 마디
          const pulse = litN > 0 && litN < 6 ? 0.5 + 0.5 * Math.sin(t * 10) : 0;
          glow(g, chX, midY, 20 * u, C.o, 0.25 + 0.2 * pulse);
          g.fillStyle = '#1d5d86';
          g.beginPath();
          g.arc(chX, midY, 11 * u, 0, TAU);
          g.fill();
          g.strokeStyle = C.o;
          g.lineWidth = 1.2 * u;
          g.stroke();
          txt(g, showAvg ? roll.toFixed(1) : 'Σ', chX, midY + 0.3 * u, 8 * u, '#fff', 'center', 900);
          txt(g, '굴리기 (확률)', chX + 14 * u, midY - 8 * u, 6.5 * u, C.o, 'left', 800);
          txt(g, showAvg ? `(${vals.join('+')}) ÷ 6` : litN ? `합 ${partial}` : '', chX + 14 * u, midY + 4 * u, 6 * u, C.sub, 'left', 700);
          // 주사위 잎
          for (let i = 0; i < 6; i++) {
            const lx = clamp(leafX(i), 8 * u + dieS / 2, TW - dieS / 2);
            const lit = i < litN;
            const bounce = lit && i === litN - 1 ? back(((ph - 0.6) % 0.3) / 0.15) : 1;
            die(g, lx, leafY - (1 - bounce) * 3 * u, dieS, i + 1, lit);
            txt(g, i === 0 ? '0' : `${vals[i]}`, lx, leafY + dieS / 2 + 6 * u, 6.5 * u, i === 0 ? C.red : lit ? '#fff' : C.dim, 'center', 900);
          }
          if (decide) pill(g, rollWins ? `굴리기! ${roll.toFixed(1)} > ${hold}` : roll === hold ? '똑같음' : `멈추기! ${hold} ≥ ${roll.toFixed(1)}`, rootX, rootY + 17 * u, 7 * u, C.gold);
          // 오른쪽 그래프
          const gx = TW + 10 * u;
          const gw = w - gx - 10 * u;
          const gy = 30 * u;
          const gh = h - gy - 24 * u;
          const MX = 36;
          const PX = (v: number): number => gx + (v / MX) * gw;
          const PY = (v: number): number => gy + gh - (v / MX) * gh;
          g.strokeStyle = 'rgba(255,255,255,0.15)';
          g.lineWidth = 0.8 * u;
          g.strokeRect(gx, gy, gw, gh);
          g.lineWidth = 1.6 * u;
          g.strokeStyle = C.violet;
          g.beginPath();
          g.moveTo(PX(0), PY(0));
          g.lineTo(PX(MX), PY(MX));
          g.stroke();
          g.strokeStyle = C.o;
          g.beginPath();
          g.moveTo(PX(0), PY(20 / 6));
          g.lineTo(PX(MX), PY((5 * MX + 20) / 6));
          g.stroke();
          g.setLineDash([2 * u, 2 * u]);
          g.strokeStyle = 'rgba(255,209,102,0.6)';
          g.lineWidth = 1 * u;
          g.beginPath();
          g.moveTo(PX(20), gy);
          g.lineTo(PX(20), gy + gh);
          g.stroke();
          g.setLineDash([]);
          txt(g, '20', PX(20), gy + gh + 6 * u, 6.5 * u, C.gold, 'center', 800);
          txt(g, 'T', gx + gw, gy + gh + 6 * u, 6.5 * u, C.sub, 'right', 700);
          txt(g, '멈추기', PX(MX) - 2 * u, PY(MX) + 7 * u, 6 * u, C.violet, 'right', 800);
          txt(g, '굴리기', PX(4), PY((5 * 4 + 20) / 6) - 7 * u, 6 * u, C.o, 'left', 800);
          const cx = PX(Tv);
          g.strokeStyle = '#fff';
          g.lineWidth = 0.8 * u;
          g.beginPath();
          g.moveTo(cx, gy);
          g.lineTo(cx, gy + gh);
          g.stroke();
          g.fillStyle = C.violet;
          g.beginPath();
          g.arc(cx, PY(hold), 2.8 * u, 0, TAU);
          g.fill();
          g.fillStyle = C.o;
          g.beginPath();
          g.arc(cx, PY(roll), 2.8 * u, 0, TAU);
          g.fill();
          txt(g, 'T < 20 이면 굴리기', gx + gw / 2, h - 8 * u, 6.5 * u, C.sub, 'center', 700);
        },
        controls: [
          speedCtl(st),
          { type: 'range', label: '쌓은 점수 T', min: 0, max: 35, step: 1, value: 6, on: (v) => { Tv = v; auto = false; ph = 0; } },
          { type: 'toggle', label: 'T 자동으로 바꾸기', value: true, on: (v) => { auto = v; } },
        ] as Control[],
      };
    },
  },
};

/* ═════════ i349 끝에서 거꾸로 푸는 완전 해법 (후퇴 분석) ═════════ */
const I349: DemoMap = {
  i349: {
    kind: '2d',
    caption: '퀸을 왼쪽 · 아래 · 왼아래로 옮겨 구석(⌂)에 넣으면 승 — 구석부터 거꾸로: 「지는 칸(금빛)으로 갈 수 있으면 이기는 칸」, 지는 칸은 황금비 선 위에 늘어서요',
    make() {
      let W = 18;
      let H = 11;
      let order: number[] = [];
      let stat: Int8Array = new Int8Array(0);
      let target: Int32Array = new Int32Array(0);
      let rays = true;
      const build = (): void => {
        order = [];
        for (let s = 0; s < W + H; s++) for (let x = 0; x < W; x++) {
          const y = s - x;
          if (y >= 0 && y < H) order.push(y * W + x);
        }
        stat = new Int8Array(W * H);
        target = new Int32Array(W * H).fill(-1);
        for (const id of order) {
          const x = id % W;
          const y = Math.floor(id / W);
          let tg = -1;
          for (let k = 1; k <= Math.max(x, y) && tg < 0; k++) {
            if (x - k >= 0 && stat[y * W + x - k] === 2) tg = y * W + x - k;
            else if (y - k >= 0 && stat[(y - k) * W + x] === 2) tg = (y - k) * W + x;
            else if (x - k >= 0 && y - k >= 0 && stat[(y - k) * W + x - k] === 2) tg = (y - k) * W + x - k;
          }
          stat[id] = tg >= 0 ? 1 : 2;
          target[id] = tg;
        }
      };
      build();
      const seq = new Seq(order.length, 38, 3.4, () => seq.restart(order.length));
      let demoCell = -1;
      return {
        draw(g, w, h, _t, dt) {
          reset(g);
          seq.tick(dt);
          const u = scaleOf(w, h);
          bg(g, w, h);
          const done = seq.done;
          const n = seq.i;
          header(g, w, u, '후퇴 분석', C.text, done ? '다 풀었다 — 모든 칸의 승패' : `푼 칸 ${n} / ${order.length}`, done ? C.gold : C.sub);
          const cs = Math.min((w - 16 * u) / W, (h - 30 * u) / H);
          const ox = (w - cs * W) / 2;
          const oy = 22 * u + (h - 26 * u - cs * H) / 2;
          const P = (x: number, y: number): [number, number] => [ox + x * cs + cs / 2, oy + (H - 1 - y) * cs + cs / 2];
          const known = new Int8Array(W * H);
          for (let i = 0; i < n; i++) known[order[i]!] = stat[order[i]!]!;
          for (let y = 0; y < H; y++)
            for (let x = 0; x < W; x++) {
              const id = y * W + x;
              const k = known[id]!;
              const [px, py] = P(x, y);
              rr(g, px - cs / 2 + 0.6 * u, py - cs / 2 + 0.6 * u, cs - 1.2 * u, cs - 1.2 * u, cs * 0.18);
              g.fillStyle = k === 2 ? C.gold : k === 1 ? '#22533f' : (x + y) % 2 ? '#1a2136' : '#1e263e';
              g.fill();
              if (k === 2) {
                const idx = order.indexOf(id);
                const age = n - idx;
                if (age < 12) glow(g, px, py, cs * 1.6, C.gold, 0.5 * (1 - age / 12));
              }
            }
          const [hx, hy] = P(0, 0);
          txt(g, '⌂', hx, hy + 0.3 * u, cs * 0.7, '#3a2a00', 'center', 900);
          // 지금 칸
          if (!done && n < order.length) {
            const id = order[n]!;
            const x = id % W;
            const y = Math.floor(id / W);
            const [px, py] = P(x, y);
            if (rays) {
              g.strokeStyle = 'rgba(255,255,255,0.28)';
              g.lineWidth = 1.2 * u;
              g.beginPath();
              g.moveTo(px, py);
              g.lineTo(...P(0, y));
              g.moveTo(px, py);
              g.lineTo(...P(x, 0));
              const m = Math.min(x, y);
              g.moveTo(px, py);
              g.lineTo(...P(x - m, y - m));
              g.stroke();
            }
            const tg = target[id]!;
            if (tg >= 0 && seq.frac > 0.2) {
              const [tx, ty] = P(tg % W, Math.floor(tg / W));
              arrow(g, px, py, tx, ty, C.green, 1.6 * u, 5 * u);
            }
            g.strokeStyle = '#fff';
            g.lineWidth = 1.5 * u;
            g.strokeRect(px - cs / 2, py - cs / 2, cs, cs);
          }
          if (done) {
            const phi = (1 + Math.sqrt(5)) / 2;
            g.setLineDash([3 * u, 2.5 * u]);
            g.strokeStyle = 'rgba(255,240,190,0.75)';
            g.lineWidth = 1.2 * u;
            g.beginPath();
            g.moveTo(...P(0, 0));
            g.lineTo(...P(Math.min(W - 1, (H - 1) / phi), Math.min(H - 1, (W - 1) * phi)));
            g.moveTo(...P(0, 0));
            g.lineTo(...P(Math.min(W - 1, (H - 1) * phi), Math.min(H - 1, (W - 1) / phi)));
            g.stroke();
            g.setLineDash([]);
            // 이기는 수 보여 주기
            const k = Math.floor(seq.holdT / 1.1);
            const rr0 = rng(k + 7);
            if (demoCell < 0 || seq.holdT % 1.1 < 0.03) {
              let c0 = -1;
              for (let tries = 0; tries < 50 && c0 < 0; tries++) {
                const c1 = Math.floor(rr0() * W * H);
                if (stat[c1] === 1) c0 = c1;
              }
              demoCell = c0;
            }
            if (demoCell >= 0) {
              const [px, py] = P(demoCell % W, Math.floor(demoCell / W));
              const tg = target[demoCell]!;
              const [tx, ty] = P(tg % W, Math.floor(tg / W));
              arrow(g, px, py, tx, ty, '#fff', 1.6 * u, 5 * u);
              glyph(g, '♛', px, py, cs * 0.95, '#fff', '#1a1430');
            }
            pill(g, '금빛 = 지는 칸 · 기울기 φ ≈ 1.618', w - 8 * u, h - 8 * u, 6.8 * u, 'rgba(255,209,102,0.95)', '#1a1405', 'right');
          }
        },
        controls: [
          speedCtl(seq, 6),
          { type: 'toggle', label: '퀸이 갈 수 있는 길 보기', value: true, on: (v) => { rays = v; } },
          { type: 'range', label: '판 가로 크기', min: 10, max: 34, step: 1, value: 18, on: (v) => { W = v; H = Math.round(v * 0.6); build(); seq.restart(order.length); } },
          { type: 'button', label: '다시', on: () => seq.restart(order.length) },
        ] as Control[],
      };
    },
  },
};

/* ═════════ i350 님합 (이진수 XOR) ═════════ */
interface NimMove {
  who: 0 | 1;
  heap: number;
  from: number;
  to: number;
  before: number[];
}
const I350: DemoMap = {
  i350: {
    kind: '2d',
    caption: '더미 크기를 이진수로 쓰고 자리마다 1 의 개수를 세요 — AI 는 늘 모든 자리를 짝수(님합 0)로 맞추는 수를 둬서 마지막 돌을 가져가요',
    make() {
      const st = { speed: 1 };
      let bits = true;
      let moves: NimMove[] = [];
      let start: number[] = [];
      const gen = (): void => {
        const r = rng(newSeed());
        let hs: number[];
        do hs = [0, 0, 0, 0].map(() => 1 + Math.floor(r() * 7));
        while ((hs[0]! ^ hs[1]! ^ hs[2]! ^ hs[3]!) === 0);
        start = hs.slice();
        moves = [];
        let who: 0 | 1 = 0;
        while (hs.some((v) => v > 0)) {
          const before = hs.slice();
          const X = hs.reduce((a, b) => a ^ b, 0);
          let heap = -1;
          let to = 0;
          if (who === 0 && X) {
            heap = hs.findIndex((v) => (v ^ X) < v);
            to = hs[heap]! ^ X;
          } else {
            const ne = hs.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
            heap = ne[Math.floor(r() * ne.length)]!;
            to = Math.floor(r() * hs[heap]!);
          }
          moves.push({ who, heap, from: hs[heap]!, to, before });
          hs[heap] = to;
          who = (1 - who) as 0 | 1;
        }
      };
      gen();
      const DUR = [2.4, 1.5];
      let T = 0;
      const stateAt = (): { mi: number; k: number } => {
        let tt = T;
        for (let i = 0; i < moves.length; i++) {
          const d = DUR[moves[i]!.who]!;
          if (tt < d) return { mi: i, k: tt / d };
          tt -= d;
        }
        return { mi: moves.length, k: tt };
      };
      return {
        draw(g, w, h, _t, dt) {
          reset(g);
          T += Math.min(dt, 0.1) * st.speed;
          const u = scaleOf(w, h);
          bg(g, w, h);
          const { mi, k } = stateAt();
          if (mi >= moves.length && k > 2.6) {
            gen();
            T = 0;
          }
          const m = moves[mi];
          const cur = m ? m.before.slice() : moves.length ? moves[moves.length - 1]!.before.map((v, i) => (i === moves[moves.length - 1]!.heap ? moves[moves.length - 1]!.to : v)) : start;
          const think = m && m.who === 0 ? 0.45 : 0.15;
          const moving = m && k > think;
          const mk = m ? clamp((k - think) / 0.35, 0, 1) : 0;
          const after = cur.slice();
          if (m && moving) after[m.heap] = m.to;
          const X = after.reduce((a, b) => a ^ b, 0);
          const showX = m && k > think + 0.35 ? X : cur.reduce((a, b) => a ^ b, 0);
          header(g, w, u, '님 — 님합', C.text, m ? (m.who === 0 ? 'AI 차례 (님합 계산)' : '상대 차례 (아무렇게나)') : 'AI 승!', m ? (m.who === 0 ? C.gold : C.x) : C.gold);
          // 더미
          const HW = bits ? w * 0.5 : w - 16 * u;
          const colW = HW / 4;
          const sr = Math.min(colW * 0.3, (h - 52 * u) / 15);
          const baseY = h - 22 * u;
          for (let i = 0; i < 4; i++) {
            const cx = 8 * u + colW * i + colW / 2;
            const isHeap = m && m.heap === i;
            if (isHeap && k > 0.05) glow(g, cx, baseY - sr * 6, colW * 0.7, m!.who === 0 ? C.gold : C.x, 0.18);
            g.fillStyle = 'rgba(255,255,255,0.08)';
            rr(g, cx - colW * 0.38, baseY + sr * 0.9, colW * 0.76, 3 * u, 1.5 * u);
            g.fill();
            const n0 = cur[i]!;
            for (let s = 0; s < n0; s++) {
              let x = cx;
              let y = baseY - s * sr * 1.85;
              let a = 1;
              const leaving = isHeap && s >= m!.to && moving;
              if (leaving) {
                const e = easeOut(mk);
                x += (s % 2 ? 1 : -1) * e * 14 * u;
                y -= e * 22 * u;
                a = 1 - e;
              }
              g.globalAlpha = a;
              const gr = g.createRadialGradient(x - sr * 0.35, y - sr * 0.4, sr * 0.1, x, y, sr);
              gr.addColorStop(0, '#f6e7c8');
              gr.addColorStop(1, isHeap && s >= m!.to && k > 0.05 ? (m!.who === 0 ? '#c89316' : '#c2415a') : '#8a7a62');
              g.fillStyle = gr;
              g.beginPath();
              g.ellipse(x, y, sr, sr * 0.8, 0, 0, TAU);
              g.fill();
              g.globalAlpha = 1;
            }
            txt(g, String(moving && isHeap ? m!.to : n0), cx, baseY + sr + 9 * u, 8.5 * u, isHeap ? (m!.who === 0 ? C.gold : C.x) : C.text, 'center', 900);
          }
          // 이진수 표
          if (bits) {
            const tx = w * 0.5 + 12 * u;
            const cw = Math.min(18 * u, (w - tx - 10 * u) / 4.2);
            const rh = Math.min(17 * u, (h - 50 * u) / 5.6);
            const ty = 32 * u;
            ['4', '2', '1'].forEach((s, j) => txt(g, s, tx + cw * (1.2 + j) + cw / 2, ty - 4 * u, 7 * u, C.sub, 'center', 800));
            for (let i = 0; i < 4; i++) {
              const v = moving ? after[i]! : cur[i]!;
              const y = ty + 3 * u + i * rh;
              txt(g, String(v), tx + cw * 0.5, y + rh / 2, 8 * u, m && m.heap === i ? C.gold : C.text, 'center', 900);
              for (let j = 0; j < 3; j++) {
                const bit = (v >> (2 - j)) & 1;
                const bx = tx + cw * (1.2 + j) + cw / 2;
                g.fillStyle = bit ? '#e8ecff' : 'rgba(255,255,255,0.07)';
                g.beginPath();
                g.arc(bx, y + rh / 2, Math.min(cw, rh) * 0.3, 0, TAU);
                g.fill();
                if (bit) txt(g, '1', bx, y + rh / 2 + 0.3 * u, Math.min(cw, rh) * 0.38, '#0b1020', 'center', 900);
              }
            }
            const yx = ty + 6 * u + 4 * rh;
            g.strokeStyle = 'rgba(255,255,255,0.4)';
            g.lineWidth = 1 * u;
            g.beginPath();
            g.moveTo(tx, yx - 2 * u);
            g.lineTo(tx + cw * 4.2, yx - 2 * u);
            g.stroke();
            txt(g, '⊕', tx + cw * 0.5, yx + rh / 2, 8 * u, C.sub, 'center', 900);
            for (let j = 0; j < 3; j++) {
              const bit = (showX >> (2 - j)) & 1;
              const bx = tx + cw * (1.2 + j) + cw / 2;
              rr(g, bx - cw * 0.42, yx + 1 * u, cw * 0.84, rh - 2 * u, 3 * u);
              g.fillStyle = bit ? 'rgba(255,93,108,0.85)' : 'rgba(111,227,160,0.75)';
              g.fill();
              txt(g, String(bit), bx, yx + rh / 2, 8 * u, '#0b1020', 'center', 900);
            }
            pill(g, showX ? `님합 ${showX} → 두는 쪽이 이김` : '님합 0 → 상대가 짐', tx + cw * 2.1, h - 10 * u, 6.8 * u, showX ? C.red : C.green, '#0b1020');
          }
        },
        controls: [
          speedCtl(st),
          { type: 'toggle', label: '이진수 표 보기', value: true, on: (v) => { bits = v; } },
          { type: 'button', label: '새 판', on: () => { gen(); T = 0; } },
        ] as Control[],
      };
    },
  },
};

/* ═════════ i351 짝짓기 전략 (5 × 5 줄 막기) ═════════ */
const PAIRING = ((): { pairs: [number, number, number][]; partner: Int8Array } => {
  const lines: number[][] = [];
  lines.push([0, 6, 12, 18, 24], [4, 8, 12, 16, 20]);
  for (let r = 0; r < 5; r++) lines.push([0, 1, 2, 3, 4].map((c) => r * 5 + c));
  for (let c = 0; c < 5; c++) lines.push([0, 1, 2, 3, 4].map((r) => r * 5 + c));
  const used = new Uint8Array(25);
  used[12] = 1;
  const pick: [number, number, number][] = [];
  const go = (li: number): boolean => {
    if (li === lines.length) return true;
    const L = lines[li]!;
    for (let a = 0; a < 5; a++)
      for (let b = a + 1; b < 5; b++) {
        const p = L[a]!;
        const q = L[b]!;
        if (used[p] || used[q]) continue;
        used[p] = used[q] = 1;
        pick.push([p, q, li]);
        if (go(li + 1)) return true;
        pick.pop();
        used[p] = used[q] = 0;
      }
    return false;
  };
  go(0);
  const partner = new Int8Array(25).fill(-1);
  for (const [p, q] of pick) {
    partner[p] = q;
    partner[q] = p;
  }
  return { pairs: pick, partner };
})();
const LINES5 = ((): number[][] => {
  const L: number[][] = [[0, 6, 12, 18, 24], [4, 8, 12, 16, 20]];
  for (let r = 0; r < 5; r++) L.push([0, 1, 2, 3, 4].map((c) => r * 5 + c));
  for (let c = 0; c < 5; c++) L.push([0, 1, 2, 3, 4].map((r) => r * 5 + c));
  return L;
})();
const I351: DemoMap = {
  i351: {
    kind: '2d',
    caption: '줄 12개마다 칸 두 개를 짝(캡슐)으로 묶어 두고 — X 가 짝의 한쪽에 두면 O 는 바로 다른 쪽에. 그러면 어떤 줄도 X 로 다 채워지지 않아요',
    make() {
      let showPairs = true;
      let moves: { cell: number; who: number; reply: boolean }[] = [];
      const gen = (): void => {
        const r = rng(newSeed());
        const b = Array<number>(25).fill(0);
        moves = [];
        let turn = 1;
        while (b.some((v) => !v)) {
          if (turn === 1) {
            const em = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
            const c = em[Math.floor(r() * em.length)]!;
            b[c] = 1;
            moves.push({ cell: c, who: 1, reply: false });
          } else {
            const last = moves[moves.length - 1]!.cell;
            const pt = PAIRING.partner[last]!;
            let c = pt >= 0 && !b[pt] ? pt : -1;
            const reply = c >= 0;
            if (c < 0) {
              const em = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
              c = em[Math.floor(r() * em.length)]!;
            }
            b[c] = 2;
            moves.push({ cell: c, who: 2, reply });
          }
          turn = 3 - turn;
        }
      };
      gen();
      const seq = new Seq(moves.length, 2.2, 2.6, () => {
        gen();
        seq.restart(moves.length);
      });
      const LCOL = (li: number): string => (li < 2 ? C.gold : li < 7 ? C.teal : C.violet);
      return {
        draw(g, w, h, t, dt) {
          reset(g);
          seq.tick(dt);
          const u = scaleOf(w, h);
          bg(g, w, h);
          const n = seq.i;
          const b = Array<number>(25).fill(0);
          for (let i = 0; i < n; i++) b[moves[i]!.cell] = moves[i]!.who;
          const replies = moves.slice(0, n).filter((m) => m.reply).length;
          const blocked = LINES5.filter((L) => L.some((c) => b[c] === 2)).length;
          const xLines = LINES5.filter((L) => L.every((c) => b[c] === 1)).length;
          header(g, w, u, '짝짓기 전략', C.text, `막힌 줄 ${blocked} / 12`, blocked === 12 ? C.green : C.sub);
          const s = Math.min(h - 34 * u, w * 0.58);
          const cs = s / 5;
          const ox = 14 * u;
          const oy = 24 * u;
          const P = (c: number): [number, number] => [ox + (c % 5) * cs + cs / 2, oy + Math.floor(c / 5) * cs + cs / 2];
          rr(g, ox - 3 * u, oy - 3 * u, s + 6 * u, s + 6 * u, 6 * u);
          g.fillStyle = 'rgba(20,28,52,0.95)';
          g.fill();
          for (let c = 0; c < 25; c++) {
            const [x, y] = P(c);
            rr(g, x - cs / 2 + 1.5 * u, y - cs / 2 + 1.5 * u, cs - 3 * u, cs - 3 * u, cs * 0.16);
            g.fillStyle = c === 12 ? '#262d48' : '#1c2440';
            g.fill();
          }
          if (showPairs)
            for (const [p, q, li] of PAIRING.pairs) {
              const [x0, y0] = P(p);
              const [x1, y1] = P(q);
              const done = b[p] === 2 || b[q] === 2;
              g.strokeStyle = LCOL(li);
              g.globalAlpha = done ? 0.55 : 0.28;
              g.lineWidth = cs * 0.5;
              g.beginPath();
              g.moveTo(x0, y0);
              g.lineTo(x1, y1);
              g.stroke();
              g.globalAlpha = 1;
            }
          for (let i = 0; i < n; i++) {
            const m = moves[i]!;
            const [x, y] = P(m.cell);
            const pop = i === n - 1 ? back(seq.frac * 3) : 1;
            if (m.who === 1) drawX(g, x, y, cs * 0.24 * pop, cs * 0.1);
            else drawO(g, x, y, cs * 0.26 * pop, cs * 0.09);
          }
          // 응수 화살표
          if (n >= 2) {
            const m = moves[n - 1]!;
            if (m.who === 2 && m.reply && seq.frac < 0.8) {
              const [x0, y0] = P(moves[n - 2]!.cell);
              const [x1, y1] = P(m.cell);
              const mx = (x0 + x1) / 2 + (y1 - y0) * 0.25;
              const my = (y0 + y1) / 2 - (x1 - x0) * 0.25;
              g.strokeStyle = '#fff';
              g.lineWidth = 1.6 * u;
              g.beginPath();
              g.moveTo(x0, y0);
              g.quadraticCurveTo(mx, my, x1, y1);
              g.stroke();
              pill(g, '짝!', mx, my, 6.5 * u, '#fff', '#0b1020');
            }
          }
          // 줄 상태 점
          LINES5.forEach((L, li) => {
            let x: number;
            let y: number;
            if (li === 0) [x, y] = [ox + s + 6 * u, oy + s + 6 * u];
            else if (li === 1) [x, y] = [ox - 7 * u, oy + s + 6 * u];
            else if (li < 7) [x, y] = [ox + s + 7 * u, oy + (li - 2) * cs + cs / 2];
            else [x, y] = [ox + (li - 7) * cs + cs / 2, oy + s + 7 * u];
            const blk = L.some((c) => b[c] === 2);
            g.fillStyle = blk ? C.green : L.some((c) => b[c] === 1) ? 'rgba(255,107,139,0.8)' : C.dim;
            g.beginPath();
            g.arc(x, y, 2.3 * u, 0, TAU);
            g.fill();
          });
          // 오른쪽 설명
          const rx = ox + s + 18 * u;
          const legend: [string, string][] = [
            [C.teal, '가로 줄의 짝'],
            [C.violet, '세로 줄의 짝'],
            [C.gold, '대각선의 짝'],
          ];
          legend.forEach(([col, s2], i) => {
            const y = 34 * u + i * 13 * u;
            g.strokeStyle = col;
            g.globalAlpha = 0.6;
            g.lineWidth = 6 * u;
            g.beginPath();
            g.moveTo(rx, y);
            g.lineTo(rx + 12 * u, y);
            g.stroke();
            g.globalAlpha = 1;
            txt(g, s2, rx + 18 * u, y, 7 * u, C.text, 'left', 700);
          });
          txt(g, `짝으로 응수 ${replies}번`, rx, 34 * u + 46 * u, 7.5 * u, C.sub, 'left', 800);
          txt(g, '가운데 칸은 짝 없음', rx, 34 * u + 58 * u, 6.5 * u, C.dim, 'left', 700);
          if (seq.done) pill(g, `X 가 채운 줄 ${xLines}개 — 무승부 확보`, rx, h - 12 * u, 7 * u, C.green, '#06180e', 'left');
          void t;
        },
        controls: [speedCtl(seq), { type: 'toggle', label: '짝 보기', value: true, on: (v) => { showPairs = v; } }, { type: 'button', label: '새 판', on: () => { gen(); seq.restart(moves.length); } }] as Control[],
      };
    },
  },
};

/* ═════════ i352 사슬 짝홀 (도트 앤 박스 긴 사슬) ═════════ */
const I352: DemoMap = {
  i352: {
    kind: '2d',
    caption: '긴 사슬을 받으면 다 먹지 말고 끝 두 칸을 남겨 줘요(두 칸 남기기) — 그러면 상대가 늘 다음 사슬을 열어야 해서 주도권을 계속 쥐어요',
    make() {
      const R = 4;
      const Cc = 5;
      type E = string;
      const chains: { cells: [number, number][]; s: E; e: E }[] = [
        { cells: [[0, 0], [0, 1], [0, 2]], s: 'v0,0', e: 'h0,2' },
        { cells: [[0, 3], [0, 4], [1, 4], [2, 4], [3, 4]], s: 'h0,3', e: 'h4,4' },
        { cells: [[1, 0], [1, 1], [1, 2], [1, 3], [2, 3], [3, 3]], s: 'v1,0', e: 'h4,3' },
        { cells: [[2, 0], [2, 1], [2, 2], [3, 2], [3, 1], [3, 0]], s: 'v2,0', e: 'v3,0' },
      ];
      const link = (a: [number, number], b: [number, number]): E => (a[0] === b[0] ? `v${a[0]},${Math.max(a[1], b[1])}` : `h${Math.max(a[0], b[0])},${a[1]}`);
      const chainEdges = chains.map((ch) => {
        const es: E[] = [ch.s];
        for (let i = 1; i < ch.cells.length; i++) es.push(link(ch.cells[i - 1]!, ch.cells[i]!));
        es.push(ch.e);
        return es;
      });
      const missing = new Set(chainEdges.flat());
      type Ev = { e: E; who: number; boxes: [number, number][]; note?: string };
      const script = (smart: boolean): Ev[] => {
        const ev: Ev[] = [];
        let opener = 0;
        chains.forEach((ch, ci) => {
          const es = chainEdges[ci]!;
          const n = ch.cells.length;
          const taker = 1 - opener;
          const last = ci === chains.length - 1;
          ev.push({ e: es[0]!, who: opener, boxes: [], note: '사슬을 열 수밖에 없음' });
          if (!smart || last) {
            for (let k = 1; k <= n; k++) ev.push({ e: es[k]!, who: taker, boxes: [ch.cells[k - 1]!], note: k === 1 ? '받아 먹기' : undefined });
            opener = taker;
          } else {
            for (let k = 1; k <= n - 2; k++) ev.push({ e: es[k]!, who: taker, boxes: [ch.cells[k - 1]!], note: k === 1 ? '받아 먹기' : undefined });
            ev.push({ e: es[n]!, who: taker, boxes: [], note: '두 칸 남기기!' });
            ev.push({ e: es[n - 1]!, who: opener, boxes: [ch.cells[n - 2]!, ch.cells[n - 1]!], note: '두 칸 받고 또 열어야 함' });
          }
        });
        return ev;
      };
      let smart = true;
      let auto = true;
      let ev = script(smart);
      const seq = new Seq(ev.length, 2.4, 2.8, () => {
        if (auto) smart = !smart;
        ev = script(smart);
        seq.restart(ev.length);
      });
      const PC = [C.x, C.o];
      const NAME = ['A', 'B'];
      return {
        draw(g, w, h, t, dt) {
          reset(g);
          seq.tick(dt);
          const u = scaleOf(w, h);
          bg(g, w, h);
          const n = seq.i;
          const played = new Map<E, number>();
          const owner = new Map<string, number>();
          const score = [0, 0];
          for (let i = 0; i < n; i++) {
            const e = ev[i]!;
            played.set(e.e, e.who);
            for (const [r, c] of e.boxes) {
              owner.set(`${r},${c}`, e.who);
              score[e.who]!++;
            }
          }
          header(g, w, u, smart ? '두 칸 남기기 (B)' : '욕심껏 다 먹기 (B)', smart ? C.green : C.red);
          // 점수
          const sx = w - 8 * u;
          const pw = pill(g, `B ${score[1]}`, sx, 11 * u, 8 * u, C.o, '#06121c', 'right');
          pill(g, `A ${score[0]}`, sx - pw - 4 * u, 11 * u, 8 * u, C.x, '#1c0610', 'right');
          const cs = Math.min((w * 0.66 - 16 * u) / Cc, (h - 46 * u) / R);
          const ox = 14 * u;
          const oy = 26 * u;
          // 상자
          for (let r = 0; r < R; r++)
            for (let c = 0; c < Cc; c++) {
              const o = owner.get(`${r},${c}`);
              if (o === undefined) continue;
              rr(g, ox + c * cs + 2 * u, oy + r * cs + 2 * u, cs - 4 * u, cs - 4 * u, 3 * u);
              g.fillStyle = o ? 'rgba(92,200,255,0.35)' : 'rgba(255,107,139,0.35)';
              g.fill();
              txt(g, NAME[o]!, ox + c * cs + cs / 2, oy + r * cs + cs / 2, cs * 0.4, PC[o]!, 'center', 900);
            }
          // 사슬 길이 표
          chains.forEach((ch, ci) => {
            const opened = chainEdges[ci]!.some((e) => played.has(e));
            if (opened) return;
            const [r, c] = ch.cells[Math.floor(ch.cells.length / 2)]!;
            pill(g, `${ch.cells.length}`, ox + c * cs + cs / 2, oy + r * cs + cs / 2, 7 * u, 'rgba(255,209,102,0.85)', '#1a1405');
          });
          // 선
          const seg = (key: E): [number, number, number, number] => {
            const typ = key[0];
            const [a, b] = key.slice(1).split(',').map(Number) as [number, number];
            return typ === 'h' ? [ox + b * cs, oy + a * cs, ox + (b + 1) * cs, oy + a * cs] : [ox + b * cs, oy + a * cs, ox + b * cs, oy + (a + 1) * cs];
          };
          for (let r = 0; r <= R; r++)
            for (let c = 0; c < Cc; c++) {
              const k = `h${r},${c}`;
              if (!missing.has(k)) {
                const [a, b, cc, d] = seg(k);
                g.strokeStyle = 'rgba(200,210,240,0.55)';
                g.lineWidth = 2 * u;
                g.beginPath();
                g.moveTo(a, b);
                g.lineTo(cc, d);
                g.stroke();
              }
            }
          for (let r = 0; r < R; r++)
            for (let c = 0; c <= Cc; c++) {
              const k = `v${r},${c}`;
              if (!missing.has(k)) {
                const [a, b, cc, d] = seg(k);
                g.strokeStyle = 'rgba(200,210,240,0.55)';
                g.lineWidth = 2 * u;
                g.beginPath();
                g.moveTo(a, b);
                g.lineTo(cc, d);
                g.stroke();
              }
            }
          for (const k of missing) {
            const [a, b, cc, d] = seg(k);
            const who = played.get(k);
            if (who === undefined) {
              g.strokeStyle = 'rgba(160,175,230,0.25)';
              g.setLineDash([1.5 * u, 2.5 * u]);
              g.lineWidth = 1.2 * u;
            } else {
              g.strokeStyle = PC[who]!;
              g.lineWidth = 3 * u;
            }
            g.beginPath();
            g.moveTo(a, b);
            g.lineTo(cc, d);
            g.stroke();
            g.setLineDash([]);
          }
          if (n > 0) {
            const e = ev[n - 1]!;
            const [a, b, cc, d] = seg(e.e);
            glow(g, (a + cc) / 2, (b + d) / 2, cs * 0.7, PC[e.who]!, 0.6 * (1 - seq.frac));
          }
          for (let r = 0; r <= R; r++)
            for (let c = 0; c <= Cc; c++) {
              g.fillStyle = '#f2f4ff';
              g.beginPath();
              g.arc(ox + c * cs, oy + r * cs, 2.2 * u, 0, TAU);
              g.fill();
            }
          // 오른쪽 설명
          const rx = ox + Cc * cs + 16 * u;
          const cur = n > 0 ? ev[n - 1]! : null;
          let note = '';
          for (let i = n - 1; i >= 0 && i >= n - 3; i--)
            if (ev[i]!.note) {
              note = ev[i]!.note!;
              break;
            }
          if (cur) {
            txt(g, `${NAME[cur.who]} 의 수`, rx, 34 * u, 8.5 * u, PC[cur.who]!, 'left', 900);
            if (note) txt(g, note, rx, 47 * u, 7 * u, note.includes('남기기') ? C.gold : C.text, 'left', 800);
          }
          txt(g, '사슬 3 · 5 · 6 · 6', rx, 66 * u, 6.8 * u, C.sub, 'left', 700);
          txt(g, 'A 가 먼저 열어야 하는 끝판', rx, 77 * u, 6.5 * u, C.dim, 'left', 700);
          if (seq.done) {
            const bw = score[1]! > score[0]!;
            pill(g, bw ? `B 승 ${score[1]} : ${score[0]}` : `A 승 ${score[0]} : ${score[1]}`, rx, h - 14 * u, 8 * u, bw ? C.o : C.x, '#0b1020', 'left');
          }
          void t;
        },
        controls: [
          speedCtl(seq),
          { type: 'toggle', label: 'B 가 두 칸 남기기', value: true, on: (v) => { smart = v; auto = false; ev = script(smart); seq.restart(ev.length); } },
          { type: 'toggle', label: '두 방식 번갈아 보기', value: true, on: (v) => { auto = v; } },
          { type: 'button', label: '처음부터', on: () => seq.restart(ev.length) },
        ] as Control[],
      };
    },
  },
};

/* ═════════ i353 오목 위협 수읽기 (VCF) ═════════ */
const VCF_POS = [
  '0000000000000000000000000201000000021112000000001100100002002220000000010000000220110000000201000000000000000000000000000',
  '0000000000000000000000002210010000000010010000020002000002100001000000012000000000200100000020100000000000000000000000000',
  '0000000000000000000000000002100000000000000000020000200000201210000001001100000020102000000002011000000000000000000000000',
  '0000000000000000000000001012000000011210200000212000000000000001000010200200000020110000000002000000000000000000000000000',
  '0000000000000000000000000002020000000100120000012021000000220000000010000000000210201100001200011000000000000000000000000',
  '0000000000000000000000001200001000020001010000200002100002010202000000001100000011022000000002001000000000000000000000000',
];
const VN = 11;
const VD: [number, number][] = [[1, 0], [0, 1], [1, 1], [1, -1]];
function vAt(b: number[], x: number, y: number): number {
  return x < 0 || y < 0 || x >= VN || y >= VN ? 3 : b[y * VN + x]!;
}
function vFivePts(b: number[], c: number): number[] {
  const pts = new Set<number>();
  for (let y = 0; y < VN; y++)
    for (let x = 0; x < VN; x++)
      for (const [dx, dy] of VD) {
        let cnt = 0;
        let emp = -1;
        let ok = true;
        for (let k = 0; k < 5; k++) {
          const v = vAt(b, x + dx * k, y + dy * k);
          if (v === c) cnt++;
          else if (v === 0) {
            if (emp >= 0) {
              ok = false;
              break;
            }
            emp = (y + dy * k) * VN + x + dx * k;
          } else {
            ok = false;
            break;
          }
        }
        if (ok && cnt === 4 && emp >= 0) pts.add(emp);
      }
  return [...pts];
}
function vFive(b: number[], c: number): number[] | null {
  for (let y = 0; y < VN; y++)
    for (let x = 0; x < VN; x++)
      for (const [dx, dy] of VD) {
        let k = 0;
        while (k < 5 && vAt(b, x + dx * k, y + dy * k) === c) k++;
        if (k === 5) return [0, 1, 2, 3, 4].map((q) => (y + dy * q) * VN + x + dx * q);
      }
  return null;
}
type VEv = { k: 'try' | 'block' | 'undo' | 'win'; i: number; j?: number };
function vcfEvents(b: number[], depth: number, ev: VEv[]): boolean {
  if (depth <= 0) return false;
  for (let i = 0; i < VN * VN; i++) {
    if (b[i]) continue;
    b[i] = 1;
    if (vFive(b, 1)) {
      ev.push({ k: 'try', i }, { k: 'win', i });
      return true;
    }
    const p = vFivePts(b, 1);
    if (p.length >= 2) {
      ev.push({ k: 'try', i }, { k: 'win', i });
      return true;
    }
    if (p.length === 1) {
      const blk = p[0]!;
      ev.push({ k: 'try', i });
      b[blk] = 2;
      ev.push({ k: 'block', i: blk });
      if (vFivePts(b, 2).length === 0 && vcfEvents(b, depth - 1, ev)) return true;
      b[blk] = 0;
      ev.push({ k: 'undo', i, j: blk });
    }
    b[i] = 0;
  }
  return false;
}
const I353: DemoMap = {
  i353: {
    kind: '2d',
    caption: '흑이 「4」를 만들면 백은 그 자리를 막을 수밖에 없어요 — 막힌 수들만 따라 읽어 마지막에 막을 곳이 둘(쌍사)이 되는 길을 찾아요 (× = 읽다 막힌 수)',
    make() {
      let pi = 0;
      let showFail = true;
      let b0: number[] = [];
      let ev: VEv[] = [];
      const load = (): void => {
        b0 = VCF_POS[pi]!.split('').map(Number);
        ev = [];
        vcfEvents(b0.slice(), 6, ev);
      };
      load();
      const seq = new Seq(ev.length, 2.2, 3.2, () => {
        pi = (pi + 1) % VCF_POS.length;
        load();
        seq.restart(ev.length);
      });
      return {
        draw(g, w, h, t, dt) {
          reset(g);
          seq.tick(dt);
          const u = scaleOf(w, h);
          bg(g, w, h, '#1b1a2a', '#0c0b16');
          const b = b0.slice();
          const num = new Map<number, number>();
          const fails = new Map<number, number>();
          const stack: number[] = [];
          let won = false;
          let tries = 0;
          for (let i = 0; i < seq.i; i++) {
            const e = ev[i]!;
            if (e.k === 'try') {
              b[e.i] = 1;
              stack.push(e.i);
              num.set(e.i, stack.length);
              tries++;
            } else if (e.k === 'block') {
              b[e.i] = 2;
              stack.push(e.i);
              num.set(e.i, stack.length);
            } else if (e.k === 'undo') {
              b[e.i] = 0;
              b[e.j!] = 0;
              stack.pop();
              stack.pop();
              num.delete(e.i);
              num.delete(e.j!);
              fails.set(e.i, i);
            } else won = true;
          }
          header(g, w, u, 'VCF — 연속 4 로 이기기', C.text, `읽은 4 ${tries}개`, C.sub);
          const s = Math.min(h - 28 * u, w * 0.6);
          const ox = 8 * u;
          const oy = 22 * u;
          const c = goBoard(g, ox, oy, s, VN);
          const P = (i: number): [number, number] => [ox + c / 2 + (i % VN) * c, oy + c / 2 + Math.floor(i / VN) * c];
          if (showFail)
            for (const [i] of fails) {
              if (b[i]) continue;
              const [x, y] = P(i);
              drawX(g, x, y, c * 0.2, 1.4 * u, 'rgba(160,30,50,0.7)');
            }
          for (let i = 0; i < VN * VN; i++) {
            if (!b[i]) continue;
            const [x, y] = P(i);
            const isNew = num.has(i);
            stone(g, x, y, c * 0.44, b[i] === 1);
            if (isNew) {
              txt(g, String(num.get(i)), x, y + 0.4 * u, c * 0.48, b[i] === 1 ? '#fff' : '#111', 'center', 900);
              if (b[i] === 1) {
                g.strokeStyle = 'rgba(255,209,102,0.9)';
                g.lineWidth = 1.2 * u;
                g.beginPath();
                g.arc(x, y, c * 0.5, 0, TAU);
                g.stroke();
              }
            }
          }
          // 지금 4 의 막을 자리
          if (!won && seq.i > 0) {
            const e = ev[seq.i - 1]!;
            if (e.k === 'try') {
              const p = vFivePts(b, 1);
              for (const q of p) {
                const [x, y] = P(q);
                glow(g, x, y, c * 1.2, C.red, 0.6);
              }
            }
          }
          if (won) {
            const five = vFive(b, 1);
            const pts = five ? [] : vFivePts(b, 1);
            const pulse = 0.5 + 0.5 * Math.sin(t * 6);
            if (five) {
              const [x0, y0] = P(five[0]!);
              const [x1, y1] = P(five[4]!);
              g.strokeStyle = `rgba(255,209,102,${0.6 + 0.4 * pulse})`;
              g.lineWidth = 3 * u;
              g.beginPath();
              g.moveTo(x0, y0);
              g.lineTo(x1, y1);
              g.stroke();
            }
            for (const q of pts) {
              const [x, y] = P(q);
              glow(g, x, y, c * 1.4, C.gold, 0.5 + 0.3 * pulse);
              g.strokeStyle = C.gold;
              g.lineWidth = 1.6 * u;
              g.beginPath();
              g.arc(x, y, c * 0.42, 0, TAU);
              g.stroke();
            }
          }
          // 오른쪽 수순
          const rx = ox + s + 12 * u;
          txt(g, '수순', rx, 30 * u, 7.5 * u, C.sub, 'left', 800);
          const seqCells = stack.slice(0, 12);
          const colA = (i: number): string => `${'ABCDEFGHJKL'[i % VN]}${VN - Math.floor(i / VN)}`;
          seqCells.forEach((cell, k) => {
            const y = 42 * u + k * 10 * u;
            if (y > h - 24 * u) return;
            const black = k % 2 === 0;
            g.fillStyle = black ? '#111' : '#eee';
            g.beginPath();
            g.arc(rx + 4 * u, y, 3.5 * u, 0, TAU);
            g.fill();
            txt(g, String(k + 1), rx + 4 * u, y + 0.3 * u, 4.5 * u, black ? '#fff' : '#111', 'center', 900);
            txt(g, black ? `${colA(cell)} 4 만들기` : `${colA(cell)} 막기`, rx + 11 * u, y, 6.5 * u, black ? C.text : C.sub, 'left', 700);
          });
          if (won) pill(g, '막을 곳이 둘 → 흑 승!', rx, h - 10 * u, 7 * u, C.gold, '#1a1405', 'left');
        },
        controls: [
          speedCtl(seq),
          { type: 'toggle', label: '읽다 막힌 수 (×) 보기', value: true, on: (v) => { showFail = v; } },
          { type: 'button', label: '다음 판', on: () => { pi = (pi + 1) % VCF_POS.length; load(); seq.restart(ev.length); } },
        ] as Control[],
      };
    },
  },
};

/* ═════════ i354 너비 우선 퍼즐 풀이 (상태 공간 겹 수) ═════════ */
const SL_GOAL = '123450';
function slNext(s: string): string[] {
  const z = s.indexOf('0');
  const r = Math.floor(z / 3);
  const c = z % 3;
  const out: string[] = [];
  for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as [number, number][]) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr < 0 || nr > 1 || nc < 0 || nc > 2) continue;
    const j = nr * 3 + nc;
    const a = s.split('');
    a[z] = a[j]!;
    a[j] = '0';
    out.push(a.join(''));
  }
  return out;
}
const SL_DIST = ((): Map<string, number> => {
  const d = new Map<string, number>([[SL_GOAL, 0]]);
  const q = [SL_GOAL];
  for (let i = 0; i < q.length; i++) for (const n of slNext(q[i]!)) if (!d.has(n)) {
    d.set(n, d.get(q[i]!)! + 1);
    q.push(n);
  }
  return d;
})();
interface SNode {
  s: string;
  depth: number;
  parent: SNode | null;
  kids: SNode[];
  a0: number;
  a1: number;
  leaves: number;
}
const I354: DemoMap = {
  i354: {
    kind: '2d',
    caption: '처음 판(가운데)에서 한 번 밀어 갈 수 있는 판 → 두 번 … 겹겹이 퍼져요. 처음 닿은 겹이 가장 짧은 풀이 — 금빛 길을 따라 퍼즐이 풀려요',
    make() {
      let order: SNode[] = [];
      let goalIdx = 0;
      let path: string[] = [];
      let layers: number[] = [];
      let showBars = true;
      const gen = (): void => {
        const cands = [...SL_DIST.entries()].filter(([, d]) => d >= 13 && d <= 16).map(([s]) => s);
        const start = cands[Math.floor(Math.random() * cands.length)]!;
        const root: SNode = { s: start, depth: 0, parent: null, kids: [], a0: 0, a1: TAU, leaves: 1 };
        order = [root];
        const seen = new Set([start]);
        goalIdx = -1;
        for (let i = 0; i < order.length && goalIdx < 0; i++) {
          const n = order[i]!;
          for (const s of slNext(n.s)) {
            if (seen.has(s)) continue;
            seen.add(s);
            const c: SNode = { s, depth: n.depth + 1, parent: n, kids: [], a0: 0, a1: 0, leaves: 1 };
            n.kids.push(c);
            order.push(c);
            if (s === SL_GOAL) {
              goalIdx = order.length - 1;
              break;
            }
          }
        }
        const cnt = (n: SNode): number => (n.leaves = n.kids.length ? n.kids.reduce((a, k) => a + cnt(k), 0) : 1);
        cnt(root);
        const place = (n: SNode): void => {
          let a = n.a0;
          for (const k of n.kids) {
            const span = ((n.a1 - n.a0) * k.leaves) / n.leaves;
            k.a0 = a;
            k.a1 = a + span;
            a += span;
            place(k);
          }
        };
        place(root);
        path = [];
        for (let n: SNode | null = order[goalIdx]!; n; n = n.parent) path.unshift(n.s);
        layers = [];
        for (const n of order) layers[n.depth] = (layers[n.depth] ?? 0) + 1;
      };
      gen();
      const seq = new Seq(order.length, order.length / 5.5, 0.1, () => {});
      let solveT = 0;
      return {
        draw(g, w, h, t, dt) {
          reset(g);
          seq.tick(dt);
          const u = scaleOf(w, h);
          bg(g, w, h);
          const shown = seq.i;
          const found = shown >= order.length;
          if (found) solveT += Math.min(dt, 0.1) * seq.speed;
          const stepIdx = Math.min(path.length - 1, Math.floor(Math.max(0, solveT - 0.6) / 0.38));
          if (found && solveT > 0.6 + path.length * 0.38 + 2.2) {
            gen();
            seq.rate = order.length / 5.5;
            seq.restart(order.length);
            solveT = 0;
          }
          const curDepth = shown > 0 ? order[shown - 1]!.depth : 0;
          header(g, w, u, '너비 우선 탐색', C.text, found ? `${path.length - 1}번 밀기가 가장 짧음` : `${curDepth}겹 · 판 ${shown}개`, found ? C.gold : C.sub);
          // 고리
          const cx = w * 0.6;
          const cy = 22 * u + (h - 22 * u) / 2;
          const maxR = Math.min(w * 0.36, (h - 30 * u) / 2);
          const D = order[order.length - 1]!.depth;
          const ring = maxR / Math.max(1, D);
          const pos = (n: SNode): [number, number] => {
            const a = (n.a0 + n.a1) / 2 - Math.PI / 2;
            const r = n.depth * ring;
            return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
          };
          g.strokeStyle = 'rgba(160,180,255,0.07)';
          g.lineWidth = 1;
          for (let d = 1; d <= D; d++) {
            g.beginPath();
            g.arc(cx, cy, d * ring, 0, TAU);
            g.stroke();
          }
          const onPath = new Set(found ? path : []);
          g.lineWidth = 0.8 * u;
          for (let i = 1; i < shown; i++) {
            const n = order[i]!;
            const [x0, y0] = pos(n.parent!);
            const [x1, y1] = pos(n);
            g.strokeStyle = onPath.has(n.s) ? C.gold : n.depth === curDepth && !found ? 'rgba(92,200,255,0.8)' : 'rgba(140,155,210,0.32)';
            g.lineWidth = (onPath.has(n.s) ? 2 : 0.8) * u;
            g.beginPath();
            g.moveTo(x0, y0);
            g.lineTo(x1, y1);
            g.stroke();
          }
          for (let i = 0; i < shown; i++) {
            const n = order[i]!;
            const [x, y] = pos(n);
            const front = n.depth === curDepth && !found;
            const age = shown - i;
            const r0 = (onPath.has(n.s) ? 2.2 : front ? 1.6 : 1.1) * u * (age < 6 ? 1 + (6 - age) * 0.15 : 1);
            g.fillStyle = onPath.has(n.s) ? C.gold : front ? C.o : '#8d97c4';
            g.beginPath();
            g.arc(x, y, r0, 0, TAU);
            g.fill();
          }
          glow(g, cx, cy, 8 * u, '#fff', 0.5);
          if (found) {
            const [gx, gy] = pos(order[goalIdx]!);
            glow(g, gx, gy, 12 * u, C.gold, 0.7);
          }
          // 퍼즐 판
          const st = found ? path[stepIdx]! : order[0]!.s;
          const ts = Math.min(w * 0.09, (h - 70 * u) / 2.4);
          const px = 10 * u;
          const py = 30 * u;
          rr(g, px - 3 * u, py - 3 * u, ts * 3 + 6 * u, ts * 2 + 6 * u, 4 * u);
          g.fillStyle = '#2a2140';
          g.fill();
          for (let i = 0; i < 6; i++) {
            const v = st[i]!;
            if (v === '0') continue;
            const x = px + (i % 3) * ts;
            const y = py + Math.floor(i / 3) * ts;
            rr(g, x + 1.2 * u, y + 1.2 * u, ts - 2.4 * u, ts - 2.4 * u, ts * 0.18);
            const gr = g.createLinearGradient(x, y, x, y + ts);
            gr.addColorStop(0, '#ffe7a8');
            gr.addColorStop(1, '#e0a84a');
            g.fillStyle = gr;
            g.fill();
            txt(g, v, x + ts / 2, y + ts / 2 + 0.5 * u, ts * 0.5, '#4a2a08', 'center', 900);
          }
          txt(g, found ? `${stepIdx} / ${path.length - 1}번째` : '처음 판', px + ts * 1.5, py + ts * 2 + 9 * u, 6.8 * u, found ? C.gold : C.sub, 'center', 800);
          // 겹 막대
          if (showBars) {
            const bx = px;
            const bw = ts * 3;
            const by = h - 8 * u;
            const bh = Math.max(14 * u, h - (py + ts * 2 + 22 * u) - 10 * u);
            const mx = Math.max(...layers);
            const n = layers.length;
            const cw = bw / n;
            for (let d = 0; d < n; d++) {
              const cntShown = order.slice(0, shown).filter((q) => q.depth === d).length;
              const hh = (cntShown / mx) * bh;
              g.fillStyle = d === curDepth && !found ? C.o : found && d === D ? C.gold : 'rgba(141,151,196,0.7)';
              g.fillRect(bx + d * cw + 0.3 * u, by - hh, Math.max(0.8 * u, cw - 0.6 * u), hh);
            }
            txt(g, '겹마다 판 수', bx, by - bh - 4 * u, 6 * u, C.sub, 'left', 700);
          }
          void t;
        },
        controls: [
          speedCtl(seq),
          { type: 'toggle', label: '겹마다 판 수 막대', value: true, on: (v) => { showBars = v; } },
          { type: 'button', label: '새 문제', on: () => { gen(); seq.rate = order.length / 5.5; seq.restart(order.length); solveT = 0; } },
        ] as Control[],
      };
    },
  },
};

/* ═════════ i355 백트래킹 (8 여왕) ═════════ */
type QEv = { k: 'place' | 'remove' | 'sol'; r: number; c: number };
function queensEvents(n: number, maxSol: number): QEv[] {
  const ev: QEv[] = [];
  const cols: number[] = [];
  let sols = 0;
  const safe = (r: number, c: number): boolean => cols.every((cc, rr0) => cc !== c && Math.abs(cc - c) !== r - rr0);
  const go = (r: number): boolean => {
    if (r === n) {
      sols++;
      for (let k = 0; k < 10; k++) ev.push({ k: 'sol', r: -1, c: -1 });
      return sols >= maxSol;
    }
    for (let c = 0; c < n; c++) {
      if (!safe(r, c)) continue;
      cols.push(c);
      ev.push({ k: 'place', r, c });
      if (go(r + 1)) return true;
      cols.pop();
      ev.push({ k: 'remove', r, c });
    }
    return false;
  };
  go(0);
  return ev;
}
const I355: DemoMap = {
  i355: {
    kind: '2d',
    caption: '한 줄씩 안전한 칸에 여왕을 놓다가, 놓을 곳이 없으면 바로 윗줄로 돌아가 다음 칸을 시도해요 (빨강 = 이미 노려지는 칸)',
    make() {
      let n = 8;
      let rays = true;
      let ev = queensEvents(n, 3);
      const seq = new Seq(ev.length, 20, 2, () => {
        ev = queensEvents(n, 3);
        seq.restart(ev.length);
      });
      return {
        draw(g, w, h, t, dt) {
          reset(g);
          seq.tick(dt);
          const u = scaleOf(w, h);
          bg(g, w, h);
          const cols: number[] = [];
          let places = 0;
          let backs = 0;
          let sols = 0;
          let inSol = false;
          let lastRemoved: { r: number; c: number } | null = null;
          for (let i = 0; i < seq.i; i++) {
            const e = ev[i]!;
            if (e.k === 'place') {
              cols.push(e.c);
              places++;
              lastRemoved = null;
              inSol = false;
            } else if (e.k === 'remove') {
              cols.pop();
              backs++;
              lastRemoved = { r: e.r, c: e.c };
              inSol = false;
            } else {
              if (!inSol) sols++;
              inSol = true;
            }
          }
          header(g, w, u, `${n} 여왕 백트래킹`, C.text, `해 ${sols}개`, sols ? C.gold : C.sub);
          const s = Math.min(h - 28 * u, w * 0.62);
          const cs = s / n;
          const ox = 10 * u;
          const oy = 22 * u;
          const row = cols.length;
          for (let r = 0; r < n; r++)
            for (let c = 0; c < n; c++) {
              g.fillStyle = (r + c) % 2 ? '#3a3352' : '#4d4569';
              g.fillRect(ox + c * cs, oy + r * cs, cs, cs);
              if (rays && r === row && !inSol) {
                const hit = cols.some((cc, rr0) => cc === c || Math.abs(cc - c) === r - rr0);
                if (hit) {
                  g.fillStyle = 'rgba(255,93,108,0.42)';
                  g.fillRect(ox + c * cs, oy + r * cs, cs, cs);
                }
              }
            }
          if (row < n && !inSol) {
            g.strokeStyle = 'rgba(92,200,255,0.9)';
            g.lineWidth = 1.5 * u;
            g.strokeRect(ox, oy + row * cs, s, cs);
          }
          if (rays && !inSol && row < n && cols.length) {
            // 마지막 여왕의 공격선
            const lr = cols.length - 1;
            const lc = cols[lr]!;
            g.save();
            g.beginPath();
            g.rect(ox, oy, s, s);
            g.clip();
            g.strokeStyle = 'rgba(255,93,108,0.35)';
            g.lineWidth = 1 * u;
            const qx = ox + lc * cs + cs / 2;
            const qy = oy + lr * cs + cs / 2;
            g.beginPath();
            g.moveTo(qx, qy);
            g.lineTo(qx, oy + s);
            g.moveTo(qx, qy);
            g.lineTo(qx + (n - lr) * cs, qy + (n - lr) * cs);
            g.moveTo(qx, qy);
            g.lineTo(qx - (n - lr) * cs, qy + (n - lr) * cs);
            g.stroke();
            g.restore();
          }
          if (lastRemoved) {
            const x = ox + lastRemoved.c * cs + cs / 2;
            const y = oy + lastRemoved.r * cs + cs / 2;
            drawX(g, x, y, cs * 0.22, 1.6 * u, `rgba(255,93,108,${1 - seq.frac})`);
          }
          cols.forEach((c, r) => {
            const x = ox + c * cs + cs / 2;
            const y = oy + r * cs + cs / 2;
            if (inSol) glow(g, x, y, cs * 0.9, C.gold, 0.5 + 0.25 * Math.sin(t * 6 + r));
            const pop = r === cols.length - 1 && !inSol ? back(seq.frac * 2.5) : 1;
            glyph(g, '♛', x, y, cs * 0.8 * pop, inSol ? '#ffe9a8' : '#ffd166', '#3a2400');
          });
          // 오른쪽 숫자
          const rx = ox + s + 14 * u;
          const items: [string, string, string][] = [
            ['놓기', String(places), C.o],
            ['되돌리기', String(backs), C.red],
            ['찾은 해', String(sols), C.gold],
          ];
          items.forEach(([a, b, col], i) => {
            const y = 34 * u + i * 22 * u;
            txt(g, a, rx, y, 7 * u, C.sub, 'left', 700);
            txt(g, b, rx, y + 10 * u, 11 * u, col, 'left', 900);
          });
          // 깊이 막대 (지금 몇 줄까지)
          const by = 34 * u + 3 * 22 * u + 4 * u;
          txt(g, '놓은 줄', rx, by, 6.5 * u, C.sub, 'left', 700);
          for (let r = 0; r < n; r++) {
            rr(g, rx + r * ((w - rx - 10 * u) / n), by + 6 * u, (w - rx - 10 * u) / n - 1.5 * u, 5 * u, 1.5 * u);
            g.fillStyle = r < cols.length ? (inSol ? C.gold : C.o) : 'rgba(255,255,255,0.08)';
            g.fill();
          }
          if (inSol) pill(g, '해 찾음!', rx, h - 12 * u, 8 * u, C.gold, '#1a1405', 'left');
        },
        controls: [
          speedCtl(seq, 8),
          { type: 'range', label: '판 크기 n', min: 4, max: 10, step: 1, value: 8, on: (v) => { n = v; ev = queensEvents(n, 3); seq.restart(ev.length); } },
          { type: 'toggle', label: '노려지는 칸 보기', value: true, on: (v) => { rays = v; } },
          { type: 'button', label: '다시', on: () => seq.restart(ev.length) },
        ] as Control[],
      };
    },
  },
};

/* ═════════ i356 2 를 법으로 가우스 소거 (불 끄기) ═════════ */
type GEv = { k: 'pivot' | 'swap' | 'xor' | 'free' | 'press'; a: number; b: number; col: number; M: Uint8Array[] };
function lightsPlan(n: number, seed: number): { start: Uint8Array; ev: GEv[]; x: Uint8Array } {
  const N = n * n;
  const r = rng(seed);
  const start = new Uint8Array(N);
  const press = (b: Uint8Array, i: number): void => {
    const y = Math.floor(i / n);
    const x = i % n;
    b[i] = b[i]! ^ 1;
    if (x > 0) b[i - 1] = b[i - 1]! ^ 1;
    if (x < n - 1) b[i + 1] = b[i + 1]! ^ 1;
    if (y > 0) b[i - n] = b[i - n]! ^ 1;
    if (y < n - 1) b[i + n] = b[i + n]! ^ 1;
  };
  do {
    start.fill(0);
    for (let k = 0; k < N; k++) if (r() < 0.45) press(start, k);
  } while (start.every((v) => !v));
  const M: Uint8Array[] = [];
  for (let i = 0; i < N; i++) {
    const row = new Uint8Array(N + 1);
    const e = new Uint8Array(N);
    press(e, i);
    // 행 i = 칸 i 의 불을 바꾸는 누름들 (대칭이라 같은 꼴)
    for (let j = 0; j < N; j++) row[j] = e[j]!;
    row[N] = start[i]!;
    M.push(row);
  }
  const snap = (): Uint8Array[] => M.map((rw) => rw.slice());
  const ev: GEv[] = [];
  let row = 0;
  const pivRow: number[] = Array<number>(N).fill(-1);
  for (let col = 0; col < N && row < N; col++) {
    let p = -1;
    for (let i = row; i < N; i++) if (M[i]![col]) {
      p = i;
      break;
    }
    if (p < 0) {
      ev.push({ k: 'free', a: -1, b: -1, col, M: snap() });
      continue;
    }
    if (p !== row) {
      const t = M[p]!;
      M[p] = M[row]!;
      M[row] = t;
      ev.push({ k: 'swap', a: p, b: row, col, M: snap() });
    }
    ev.push({ k: 'pivot', a: row, b: row, col, M: snap() });
    for (let i = 0; i < N; i++) {
      if (i === row || !M[i]![col]) continue;
      for (let j = 0; j <= N; j++) M[i]![j] = M[i]![j]! ^ M[row]![j]!;
      ev.push({ k: 'xor', a: row, b: i, col, M: snap() });
    }
    pivRow[col] = row;
    row++;
  }
  const x = new Uint8Array(N);
  for (let col = 0; col < N; col++) if (pivRow[col]! >= 0) x[col] = M[pivRow[col]!]![N]!;
  for (let i = 0; i < N; i++) if (x[i]) for (let k = 0; k < 3; k++) ev.push({ k: 'press', a: i, b: k, col: -1, M: snap() });
  return { start, ev, x };
}
const I356: DemoMap = {
  i356: {
    kind: '2d',
    caption: '「칸 i 를 누르면 어느 불이 바뀌나」를 0 · 1 표로 쓰고, 덧셈 대신 XOR(1+1=0)로 줄을 지워 가면 오른쪽 끝 열이 바로 「누를 칸」이에요',
    make() {
      let n = 3;
      let P = lightsPlan(n, newSeed());
      const seq = new Seq(P.ev.length, 5, 2.4, () => regen());
      const regen = (): void => {
        P = lightsPlan(n, newSeed());
        seq.restart(P.ev.length);
        seq.rate = n === 3 ? 5 : n === 4 ? 9 : 16;
      };
      return {
        draw(g, w, h, t, dt) {
          reset(g);
          seq.tick(dt);
          const u = scaleOf(w, h);
          bg(g, w, h);
          const N = n * n;
          const i0 = seq.i;
          const e = i0 > 0 ? P.ev[i0 - 1]! : null;
          const M = e ? e.M : P.ev[0]!.M;
          const inPress = e?.k === 'press';
          // 판 상태
          const lights = P.start.slice();
          const pressed = new Set<number>();
          for (let k = 0; k < i0; k++) {
            const q = P.ev[k]!;
            if (q.k === 'press' && q.b === 2) {
              pressed.add(q.a);
              const y = Math.floor(q.a / n);
              const x = q.a % n;
              const tg = [q.a];
              if (x > 0) tg.push(q.a - 1);
              if (x < n - 1) tg.push(q.a + 1);
              if (y > 0) tg.push(q.a - n);
              if (y < n - 1) tg.push(q.a + n);
              for (const c of tg) lights[c] = lights[c]! ^ 1;
            }
          }
          const elimDone = P.ev.findIndex((q) => q.k === 'press');
          const solved = elimDone >= 0 ? i0 > elimDone : seq.done;
          header(g, w, u, '불 끄기 — 2 를 법으로 소거', C.text, inPress || seq.done ? `누른 칸 ${pressed.size} / ${P.x.reduce((a, b) => a + b, 0)}` : e ? (e.k === 'xor' ? `줄 ${e.b + 1} ⊕= 줄 ${e.a + 1}` : e.k === 'swap' ? `줄 ${e.a + 1} ↔ 줄 ${e.b + 1}` : e.k === 'free' ? `열 ${e.col + 1}: 고를 수 있음` : `열 ${e.col + 1} 기준 줄`) : '표 만들기', C.gold);
          // 판
          const bs = Math.min(h - 46 * u, w * 0.34);
          const cs = bs / n;
          const bx = 10 * u;
          const by = 26 * u;
          for (let i = 0; i < N; i++) {
            const x = bx + (i % n) * cs;
            const y = by + Math.floor(i / n) * cs;
            const on = lights[i]!;
            if (on) glow(g, x + cs / 2, y + cs / 2, cs * 0.9, '#ffd36b', 0.45);
            rr(g, x + 1.5 * u, y + 1.5 * u, cs - 3 * u, cs - 3 * u, cs * 0.2);
            const gr = g.createLinearGradient(x, y, x, y + cs);
            if (on) {
              gr.addColorStop(0, '#fff2b8');
              gr.addColorStop(1, '#ffb83f');
            } else {
              gr.addColorStop(0, '#2c3456');
              gr.addColorStop(1, '#1b2140');
            }
            g.fillStyle = gr;
            g.fill();
            if (solved && P.x[i]) {
              const now = inPress && e!.a === i;
              g.strokeStyle = now ? '#fff' : pressed.has(i) ? 'rgba(111,227,160,0.9)' : C.gold;
              g.lineWidth = (now ? 2.4 : 1.6) * u;
              g.beginPath();
              g.arc(x + cs / 2, y + cs / 2, cs * 0.28, 0, TAU);
              g.stroke();
            }
            if (cs > 14 * u) txt(g, String(i + 1), x + 5 * u, y + 6 * u, 5.5 * u, on ? 'rgba(80,50,0,0.6)' : 'rgba(255,255,255,0.3)', 'center', 700);
          }
          txt(g, solved ? (seq.done ? '모두 꺼짐!' : '○ = 누를 칸') : '불 켜진 판', bx + bs / 2, by + bs + 9 * u, 7 * u, solved ? C.gold : C.sub, 'center', 800);
          // 행렬
          const mx = bx + bs + 14 * u;
          const m = Math.min((w - mx - 8 * u) / (N + 1.8), (h - 34 * u) / N);
          const my = 26 * u;
          for (let i = 0; i < N; i++) {
            const row = M[i]!;
            const isA = e && (e.k === 'xor' || e.k === 'pivot' || e.k === 'swap') && e.a === i;
            const isB = e && (e.k === 'xor' || e.k === 'swap') && e.b === i;
            if (isA || isB) {
              g.fillStyle = isA ? 'rgba(255,209,102,0.2)' : `rgba(92,200,255,${0.35 * (1 - seq.frac) + 0.1})`;
              g.fillRect(mx - 1 * u, my + i * m, (N + 1.5) * m + 2 * u, m);
            }
            for (let j = 0; j <= N; j++) {
              const x = mx + j * m + (j === N ? m * 0.5 : 0);
              const v = row[j]!;
              const isPivCol = e && e.k !== 'press' && j === e.col;
              g.fillStyle = v ? (j === N ? C.gold : isPivCol ? C.o : '#c9d1f5') : 'rgba(255,255,255,0.05)';
              g.fillRect(x + 0.4 * u, my + i * m + 0.4 * u, m - 0.8 * u, m - 0.8 * u);
              if (m > 7 * u) txt(g, String(v), x + m / 2, my + i * m + m / 2 + 0.3 * u, m * 0.55, v ? '#0b1020' : 'rgba(255,255,255,0.25)', 'center', 800);
            }
          }
          g.strokeStyle = 'rgba(255,255,255,0.4)';
          g.lineWidth = 1 * u;
          g.beginPath();
          g.moveTo(mx + N * m + m * 0.25, my - 2 * u);
          g.lineTo(mx + N * m + m * 0.25, my + N * m + 2 * u);
          g.stroke();
          if (e && e.k !== 'press' && e.col >= 0) {
            g.strokeStyle = 'rgba(92,200,255,0.8)';
            g.lineWidth = 1.2 * u;
            g.strokeRect(mx + e.col * m, my - 1 * u, m, N * m + 2 * u);
          }
          void t;
        },
        controls: [
          speedCtl(seq),
          { type: 'range', label: '판 크기', min: 3, max: 5, step: 1, value: 3, on: (v) => { n = v; regen(); } },
          { type: 'button', label: '새 판', on: () => regen() },
        ] as Control[],
      };
    },
  },
};

/* ═════════ i357 미니맥스 추측 (숫자 야구) ═════════ */
const BB_CODES = ((): number[][] => {
  const out: number[][] = [];
  for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) for (let c = 1; c <= 9; c++) if (a !== b && b !== c && a !== c) out.push([a, b, c]);
  return out;
})();
function bbScore(x: number[], y: number[]): number {
  let s = 0;
  let b = 0;
  for (let i = 0; i < 3; i++) {
    if (x[i] === y[i]) s++;
    else if (y.includes(x[i]!)) b++;
  }
  return s * 4 + b;
}
const BB_KEYS = [0, 1, 2, 3, 4, 5, 6, 8, 12];
const bbLabel = (k: number): string => (k === 12 ? '3S' : `${k >> 2}S${k & 3}B`);
function bbBuckets(guess: number, cands: number[]): Map<number, number> {
  const m = new Map<number, number>();
  const gc = BB_CODES[guess]!;
  for (const c of cands) {
    const k = bbScore(gc, BB_CODES[c]!);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}
const worstOf = (m: Map<number, number>): number => Math.max(0, ...m.values());
const I357: DemoMap = {
  i357: {
    kind: '2d',
    caption: '504개 후보 중 무엇을 부를까? — 대답(○S○B)마다 남는 후보 수를 세어 「가장 나쁜 대답이어도 가장 적게 남는」 수를 불러요 (미니맥스)',
    make() {
      let mini = true;
      let secret = 0;
      let cands: number[] = [];
      let turn = 0;
      let guess = 0;
      let trial: [number, number][] = [];
      let buckets = new Map<number, number>();
      let resp = 0;
      let phase = 0;
      let pT = 0;
      const st = { speed: 1 };
      let r = rng(newSeed());
      let fadeFrom: number[] = [];
      const choose = (): void => {
        const pool = cands.length > 1 ? (cands.length > 120 ? Array.from({ length: 140 }, () => Math.floor(r() * 504)) : Array.from({ length: 504 }, (_, i) => i)) : cands;
        trial = [];
        if (!mini) {
          guess = cands[Math.floor(r() * cands.length)]!;
          for (let k = 0; k < 6; k++) {
            const gq = Math.floor(r() * 504);
            trial.push([gq, worstOf(bbBuckets(gq, cands))]);
          }
        } else {
          const candSet = new Set(cands);
          let best = cands[0]!;
          let bw = Infinity;
          for (const gq of pool) {
            const wv = worstOf(bbBuckets(gq, cands)) - (candSet.has(gq) ? 0.5 : 0);
            if (wv < bw) {
              bw = wv;
              best = gq;
            }
          }
          for (let k = 0; k < 6; k++) {
            const gq = pool[Math.floor(r() * pool.length)]!;
            trial.push([gq, worstOf(bbBuckets(gq, cands))]);
          }
          guess = best;
        }
        trial.push([guess, worstOf(bbBuckets(guess, cands))]);
        buckets = bbBuckets(guess, cands);
        resp = bbScore(BB_CODES[guess]!, BB_CODES[secret]!);
      };
      const restart = (): void => {
        r = rng(newSeed());
        secret = Math.floor(r() * 504);
        cands = Array.from({ length: 504 }, (_, i) => i);
        fadeFrom = cands.slice();
        turn = 1;
        phase = 0;
        pT = 0;
        choose();
      };
      restart();
      const DUR = [1.7, 0.7, 0.8, 1.0, 2.6];
      return {
        draw(g, w, h, t, dt) {
          reset(g);
          pT += Math.min(dt, 0.1) * st.speed;
          if (pT > DUR[phase]!) {
            pT = 0;
            if (phase === 3) {
              fadeFrom = cands;
              if (resp === 12) phase = 4;
              else {
                cands = cands.filter((c) => bbScore(BB_CODES[guess]!, BB_CODES[c]!) === resp);
                turn++;
                phase = 0;
                choose();
              }
            } else if (phase === 4) restart();
            else phase++;
            if (phase === 3 && resp !== 12) {
              // 걸러질 후보 미리
            }
          }
          const u = scaleOf(w, h);
          bg(g, w, h);
          const alive = new Set(phase >= 3 ? cands.filter((c) => bbScore(BB_CODES[guess]!, BB_CODES[c]!) === resp) : cands);
          const prev = new Set(fadeFrom);
          header(g, w, u, mini ? '미니맥스 추측' : '아무 후보나 부르기', mini ? C.text : C.sub, `${turn}번째 · 후보 ${phase >= 3 ? alive.size : cands.length}`, C.gold);
          // 점 격자 28 × 18
          const gw = w * 0.47;
          const cs = Math.min((gw - 10 * u) / 28, (h - 30 * u) / 18);
          const gx = 8 * u;
          const gy = 24 * u;
          const fk = phase === 3 ? easeOut(pT / DUR[3]!) : 1;
          for (let i = 0; i < 504; i++) {
            const x = gx + (i % 28) * cs + cs / 2;
            const y = gy + Math.floor(i / 28) * cs + cs / 2;
            let col = 'rgba(90,100,140,0.25)';
            let rad = cs * 0.22;
            if (alive.has(i)) {
              col = phase === 4 ? C.gold : C.o;
              rad = cs * 0.34;
            } else if (prev.has(i) && phase === 3) {
              col = `rgba(255,93,108,${(1 - fk) * 0.9 + 0.1})`;
              rad = cs * lerp(0.34, 0.22, fk);
            }
            if (i === guess && phase >= 1) {
              g.strokeStyle = '#fff';
              g.lineWidth = 1 * u;
              g.beginPath();
              g.arc(x, y, cs * 0.5, 0, TAU);
              g.stroke();
            }
            g.fillStyle = col;
            g.beginPath();
            g.arc(x, y, rad, 0, TAU);
            g.fill();
          }
          // 오른쪽 위: 부를 수 고르기
          const rx = gx + 28 * cs + 14 * u;
          const rw = w - rx - 8 * u;
          if (phase === 0) {
            txt(g, '이 수를 부르면 최악엔 몇 개 남나?', rx, 28 * u, 6.8 * u, C.sub, 'left', 700);
            const shownN = Math.min(trial.length, 1 + Math.floor((pT / DUR[0]!) * trial.length));
            for (let k = 0; k < shownN; k++) {
              const [gq, wv] = trial[k]!;
              const y = 40 * u + k * 10.5 * u;
              const isBest = k === trial.length - 1;
              txt(g, BB_CODES[gq]!.join(''), rx + 2 * u, y, 8 * u, isBest ? C.gold : C.text, 'left', 900);
              const bw = (rw - 52 * u) * (wv / Math.max(...trial.map((q) => q[1])));
              rr(g, rx + 26 * u, y - 3 * u, Math.max(1, bw), 6 * u, 2 * u);
              g.fillStyle = isBest ? C.gold : 'rgba(255,93,108,0.7)';
              g.fill();
              txt(g, String(wv), rx + 30 * u + bw, y, 6.5 * u, isBest ? C.gold : C.sub, 'left', 800);
            }
          } else {
            // 부른 수 · 대답 칸
            const digits = BB_CODES[guess]!;
            const bs = Math.min(18 * u, rw / 4.5);
            digits.forEach((dgt, k) => {
              const x = rx + bs / 2 + k * (bs * 1.15);
              const y = 34 * u;
              const gr = g.createRadialGradient(x - bs * 0.15, y - bs * 0.18, bs * 0.05, x, y, bs * 0.5);
              gr.addColorStop(0, '#ffffff');
              gr.addColorStop(1, '#d8dbe6');
              g.fillStyle = gr;
              g.beginPath();
              g.arc(x, y, bs * 0.46, 0, TAU);
              g.fill();
              g.strokeStyle = 'rgba(214,40,69,0.75)';
              g.lineWidth = 0.9 * u;
              g.beginPath();
              g.arc(x - bs * 0.52, y, bs * 0.38, -0.7, 0.7);
              g.arc(x + bs * 0.52, y, bs * 0.38, Math.PI - 0.7, Math.PI + 0.7);
              g.stroke();
              txt(g, String(dgt), x, y + 0.5 * u, bs * 0.5, '#1b2036', 'center', 900);
            });
            if (phase >= 2) pill(g, phase === 4 ? '3S 정답!' : bbLabel(resp), rx + bs * 3.6 + 6 * u, 34 * u, 8 * u, phase === 4 ? C.gold : C.green, '#0b1020', 'left');
            // 대답별 남는 수 막대
            const by = 54 * u;
            const bh = h - by - 18 * u;
            const mxv = Math.max(1, ...buckets.values());
            const cw = rw / BB_KEYS.length;
            const worst = worstOf(buckets);
            BB_KEYS.forEach((k, i) => {
              const v = buckets.get(k) ?? 0;
              const x = rx + i * cw;
              const hh = (v / mxv) * (bh - 10 * u);
              const isResp = phase >= 2 && k === resp;
              g.fillStyle = isResp ? C.green : v === worst ? C.red : 'rgba(141,151,196,0.6)';
              rr(g, x + cw * 0.15, by + bh - hh, cw * 0.7, hh, 1.5 * u);
              g.fill();
              if (v) txt(g, String(v), x + cw / 2, by + bh - hh - 4 * u, 5.5 * u, isResp ? C.green : C.sub, 'center', 800);
              txt(g, bbLabel(k), x + cw / 2, by + bh + 6 * u, Math.min(5.2 * u, cw * 0.32), isResp ? C.green : C.dim, 'center', 700);
            });
            txt(g, `최악 ${worst}개 남음`, rx, by - 4 * u, 6.5 * u, C.red, 'left', 800);
          }
          void t;
        },
        controls: [
          speedCtl(st),
          { type: 'toggle', label: '미니맥스로 고르기 (끄면 아무 후보나)', value: true, on: (v) => { mini = v; restart(); } },
          { type: 'button', label: '새 비밀 수', on: () => restart() },
        ] as Control[],
      };
    },
  },
};

/* ═════════ i358 난이도 = 사람 같은 실수 (온도 소프트맥스) ═════════ */
const I358: DemoMap = {
  i358: {
    kind: '2d',
    caption: '수마다 점수를 매긴 뒤 온도 T 로 확률을 만들어요 — T 가 낮으면 늘 최선(고수), 높으면 엉뚱한 수도 가끔(유아). 공이 그 확률대로 칸을 골라요',
    make() {
      const vals = [-0.7, 0.1, 0.55, 0.9, 0.6, -0.15, -0.9];
      const best = 3;
      let Tv = 0.3;
      let auto = true;
      let eps = false;
      let ph = 0;
      const st = { speed: 1 };
      let r = rng(7);
      const hist: number[] = [];
      let pick = -1;
      let pickT = 0;
      const LO = Math.log(0.03);
      const HI = Math.log(3);
      const probs = (T: number): number[] => {
        if (eps) {
          const e = clamp(T / 2, 0, 1);
          return vals.map((_, i) => (i === best ? 1 - e : 0) + e / vals.length);
        }
        const ex = vals.map((v) => Math.exp((v - vals[best]!) / T));
        const s = ex.reduce((a, b) => a + b, 0);
        return ex.map((v) => v / s);
      };
      return {
        draw(g, w, h, t, dt) {
          reset(g);
          const d = Math.min(dt, 0.1) * st.speed;
          ph += d;
          if (auto) Tv = Math.exp(lerp(LO, HI, (1 - Math.cos(ph * 0.55)) / 2));
          const p = probs(Tv);
          pickT += d;
          if (pickT > 0.55) {
            pickT = 0;
            let x = r();
            pick = p.length - 1;
            for (let i = 0; i < p.length; i++) {
              x -= p[i]!;
              if (x <= 0) {
                pick = i;
                break;
              }
            }
            hist.push(pick);
            if (hist.length > 30) hist.shift();
          }
          const u = scaleOf(w, h);
          bg(g, w, h);
          const level = Tv < 0.08 ? '고수' : Tv < 0.4 ? '중수' : Tv < 1.2 ? '초보' : '유아';
          header(g, w, u, eps ? 'ε-무작위 실수' : '소프트맥스 온도', C.text, `T = ${Tv.toFixed(2)} · ${level}`, C.gold);
          // 왼쪽: 확률 막대
          const LW = w * 0.56;
          const n = vals.length;
          const cw = (LW - 16 * u) / n;
          const baseY = h - 46 * u;
          const topY = 30 * u;
          for (let i = 0; i < n; i++) {
            const x = 10 * u + i * cw;
            const hh = p[i]! * (baseY - topY);
            const col = i === best ? C.gold : vals[i]! > 0.3 ? C.green : vals[i]! > 0 ? '#aab3d6' : C.red;
            rr(g, x + cw * 0.14, baseY - hh, cw * 0.72, hh, 2 * u);
            g.fillStyle = col;
            g.globalAlpha = 0.85;
            g.fill();
            g.globalAlpha = 1;
            txt(g, `${Math.round(p[i]! * 100)}%`, x + cw / 2, baseY - hh - 5 * u, 6 * u, col, 'center', 800);
            txt(g, `${vals[i]! > 0 ? '+' : ''}${vals[i]!.toFixed(1)}`, x + cw / 2, baseY + 7 * u, 6 * u, C.sub, 'center', 700);
            if (i === pick) {
              const k = clamp(pickT / 0.25, 0, 1);
              const by = lerp(topY - 4 * u, baseY - hh - 12 * u, easeOut(k));
              glow(g, x + cw / 2, by, cw * 0.7, '#fff', 0.35);
              g.fillStyle = '#fff';
              g.beginPath();
              g.arc(x + cw / 2, by, Math.min(4 * u, cw * 0.22), 0, TAU);
              g.fill();
            }
          }
          // 고른 기록
          const hy = h - 18 * u;
          txt(g, '고른 수', 10 * u, hy - 9 * u, 6 * u, C.sub, 'left', 700);
          const dw = (LW - 16 * u) / 30;
          hist.forEach((q, i) => {
            g.fillStyle = q === best ? C.gold : vals[q]! > 0.3 ? C.green : vals[q]! > 0 ? '#aab3d6' : C.red;
            g.beginPath();
            g.arc(10 * u + i * dw + dw / 2, hy, Math.min(dw * 0.38, 3 * u), 0, TAU);
            g.fill();
          });
          const bestRate = hist.length ? hist.filter((q) => q === best).length / hist.length : 0;
          txt(g, `최선 ${Math.round(bestRate * 100)}%`, LW - 6 * u, hy - 9 * u, 6 * u, C.gold, 'right', 800);
          // 오른쪽: 곡선 (최선 수 확률 · 평균 점수)
          const gx = LW + 10 * u;
          const gw = w - gx - 10 * u;
          const gy = 30 * u;
          const gh = h - gy - 32 * u;
          g.strokeStyle = 'rgba(255,255,255,0.15)';
          g.lineWidth = 0.8 * u;
          g.strokeRect(gx, gy, gw, gh);
          const X = (T: number): number => gx + ((Math.log(T) - LO) / (HI - LO)) * gw;
          const curve = (f: (pp: number[]) => number, col: string): void => {
            g.strokeStyle = col;
            g.lineWidth = 1.6 * u;
            g.beginPath();
            for (let k = 0; k <= 60; k++) {
              const T = Math.exp(lerp(LO, HI, k / 60));
              const y = gy + gh - f(probs(T)) * gh;
              if (k) g.lineTo(X(T), y);
              else g.moveTo(X(T), y);
            }
            g.stroke();
          };
          curve((pp) => pp[best]!, C.gold);
          curve((pp) => (pp.reduce((a, q, i) => a + q * vals[i]!, 0) + 1) / 2, C.teal);
          const cx = X(Tv);
          g.strokeStyle = '#fff';
          g.lineWidth = 0.8 * u;
          g.beginPath();
          g.moveTo(cx, gy);
          g.lineTo(cx, gy + gh);
          g.stroke();
          g.fillStyle = C.gold;
          g.beginPath();
          g.arc(cx, gy + gh - p[best]! * gh, 2.6 * u, 0, TAU);
          g.fill();
          (['고수', '중수', '초보', '유아'] as const).forEach((s, i) => txt(g, s, X([0.04, 0.18, 0.7, 2.2][i]!), gy + gh + 7 * u, 5.8 * u, s === level ? C.gold : C.dim, 'center', 800));
          txt(g, '최선 수 확률', gx + 3 * u, gy + gh - 15 * u, 5.8 * u, C.gold, 'left', 800);
          txt(g, '평균 수 점수', gx + 3 * u, gy + gh - 6 * u, 5.8 * u, C.teal, 'left', 800);
          txt(g, '온도 T (로그) →', gx + gw, h - 9 * u, 5.8 * u, C.sub, 'right', 700);
          void t;
        },
        controls: [
          speedCtl(st),
          { type: 'range', label: '온도 T', min: 0.03, max: 3, step: 0.01, value: 0.3, on: (v) => { Tv = v; auto = false; } },
          { type: 'toggle', label: 'T 자동으로 오르내리기', value: true, on: (v) => { auto = v; } },
          { type: 'toggle', label: 'ε-무작위 방식 (끄면 소프트맥스)', value: false, on: (v) => { eps = v; r = rng(7); } },
        ] as Control[],
      };
    },
  },
};

/* ═════════ i359 화면 안 멈추는 계산 (메인 스레드 vs Web Worker) ═════════ */
const I359: DemoMap = {
  i359: {
    kind: '2d',
    caption: '무거운 AI 계산을 화면 그리는 줄(메인)에서 하면 그동안 공이 멈추고(빨강), Web Worker 에 맡기면 공은 계속 돌고 결과만 나중에 받아요',
    make() {
      const st = { speed: 1 };
      let T = 0;
      const P = 4;
      const T0 = 1.0;
      const T1 = 2.1;
      let angL = 0;
      let angR = 0;
      const gaps: number[] = [];
      let worker: Worker | null = null;
      let wUrl = '';
      let realMain = 0;
      let wState: '' | 'run' | 'done' = '';
      let wMsg = '';
      let wStart = 0;
      let pendingMain = false;
      const busy = (ms: number): number => {
        const t0 = performance.now();
        let x = 0;
        while (performance.now() - t0 < ms) for (let i = 0; i < 2000; i++) x += Math.sqrt(i * x + 1) % 7;
        return x;
      };
      const runWorker = (): void => {
        if (!worker) {
          const src = 'onmessage=function(e){var t0=performance.now(),x=0;while(performance.now()-t0<e.data){for(var i=0;i<2000;i++)x+=Math.sqrt(i*x+1)%7;}postMessage(performance.now()-t0);}';
          wUrl = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
          worker = new Worker(wUrl);
          worker.onmessage = (e: MessageEvent<number>) => {
            wState = 'done';
            wMsg = `워커가 ${Math.round(e.data)}ms 계산 → 결과 받음 (화면은 안 멈춤)`;
          };
        }
        wState = 'run';
        wStart = performance.now();
        wMsg = '워커 계산 중… 공은 계속 돌아요';
        worker.postMessage(700);
      };
      const spinner = (g: G, cx: number, cy: number, r: number, ang: number, col: string, frozen: boolean): void => {
        g.strokeStyle = 'rgba(255,255,255,0.08)';
        g.lineWidth = r * 0.16;
        g.beginPath();
        g.arc(cx, cy, r, 0, TAU);
        g.stroke();
        for (let k = 0; k < 14; k++) {
          const a = ang - k * 0.13;
          g.globalAlpha = (1 - k / 14) * 0.6;
          g.fillStyle = col;
          g.beginPath();
          g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, r * 0.16 * (1 - k / 20), 0, TAU);
          g.fill();
        }
        g.globalAlpha = 1;
        glow(g, cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, r * 0.6, col, 0.5);
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, r * 0.17, 0, TAU);
        g.fill();
        if (frozen) {
          txt(g, '멈춤!', cx, cy, r * 0.5, C.red, 'center', 900);
        }
      };
      return {
        draw(g, w, h, _t, dt) {
          if (pendingMain) {
            pendingMain = false;
            const t0 = performance.now();
            busy(600);
            realMain = performance.now() - t0;
          }
          reset(g);
          gaps.push(dt * 1000);
          if (gaps.length > 150) gaps.shift();
          const d = Math.min(dt, 0.1) * st.speed;
          T = (T + d) % P;
          const blocked = T > T0 && T < T1;
          if (!blocked) angL += d * 5;
          if (T >= T1 && T - d < T1) angL += (T1 - T0) * 5; // 늦게 한꺼번에 튐
          angR += d * 5;
          const u = scaleOf(w, h);
          bg(g, w, h);
          header(g, w, u, '화면 안 멈추는 계산', C.text, 'AI 생각 1.1초', C.sub);
          const pw = w / 2;
          const ph = h * 0.56;
          const lanes = (side: number): void => {
            const px = side * pw;
            const cx = px + pw * 0.24;
            const cy = 22 * u + ph * 0.45;
            const r = Math.min(pw * 0.15, ph * 0.3);
            spinner(g, cx, cy, r, side ? angR : angL, side ? C.green : C.o, !side && blocked);
            txt(g, side ? 'Web Worker 에서' : '메인 스레드에서', px + pw * 0.24, 22 * u + ph * 0.92, 7.5 * u, side ? C.green : C.red, 'center', 900);
            // 시간 줄 (최근 3초)
            const lx = px + pw * 0.46;
            const lw = pw * 0.5;
            const ly = 30 * u;
            const rowH = Math.min(14 * u, ph * 0.22);
            const W3 = 3;
            const X = (tt: number): number => lx + ((tt - (T - W3)) / W3) * lw;
            const names = side ? ['메인', '워커'] : ['메인'];
            names.forEach((nm, li) => {
              const y = ly + li * (rowH + 8 * u);
              txt(g, nm, lx - 3 * u, y + rowH / 2, 6 * u, C.sub, 'right', 700);
              g.fillStyle = 'rgba(255,255,255,0.04)';
              g.fillRect(lx, y, lw, rowH);
              g.save();
              g.beginPath();
              g.rect(lx, y, lw, rowH);
              g.clip();
              for (const off of [-P, 0]) {
                const a0 = T0 + off;
                const a1 = T1 + off;
                if (li === 0 && !side) {
                  g.fillStyle = 'rgba(255,93,108,0.85)';
                  g.fillRect(X(a0), y, X(Math.min(a1, T)) - X(a0), rowH);
                }
                if (li === 1) {
                  g.fillStyle = 'rgba(184,146,255,0.85)';
                  g.fillRect(X(a0), y, X(Math.min(a1, T)) - X(a0), rowH);
                }
              }
              if (li === 0) {
                // 그리기 틱
                g.fillStyle = C.green;
                for (let k = 0; k < 36; k++) {
                  const tt = T - k / 12;
                  const tm = ((tt % P) + P) % P;
                  if (!side && tm > T0 && tm < T1) continue;
                  g.fillRect(X(tt) - 0.5 * u, y + rowH * 0.2, 1 * u, rowH * 0.6);
                }
              }
              g.restore();
            });
            if (side) {
              for (const off of [-P, 0]) {
                const a0 = T0 + off;
                const a1 = T1 + off;
                const y0 = ly + rowH;
                const y1 = ly + rowH + 8 * u;
                if (X(a0) > lx && a0 <= T) arrow(g, X(a0), y0, X(a0), y1, '#fff', 0.9 * u, 3 * u);
                if (X(a1) > lx && a1 <= T) arrow(g, X(a1), y1, X(a1), y0, C.gold, 0.9 * u, 3 * u);
              }
              txt(g, '↓ 일 보내기 · ↑ 결과 받기', lx, ly + 2 * rowH + 15 * u, 5.8 * u, C.sub, 'left', 700);
            } else txt(g, blocked ? '그리기 못 함 — 화면 얼어붙음' : '초록 = 화면 그린 순간', lx, ly + rowH + 9 * u, 5.8 * u, blocked ? C.red : C.sub, 'left', 700);
          };
          lanes(0);
          lanes(1);
          g.strokeStyle = 'rgba(255,255,255,0.08)';
          g.beginPath();
          g.moveTo(pw, 22 * u);
          g.lineTo(pw, 22 * u + ph);
          g.stroke();
          // 아래: 이 화면의 진짜 프레임 간격
          const gy = 26 * u + ph;
          const gh = h - gy - 8 * u;
          const gx = 10 * u;
          const gw = w - 20 * u;
          rr(g, gx - 2 * u, gy - 2 * u, gw + 4 * u, gh + 4 * u, 4 * u);
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.fill();
          const Y = (ms: number): number => gy + gh - (Math.min(ms, 800) / 800) * gh;
          const Ylog = (ms: number): number => gy + gh - (Math.log(1 + Math.min(ms, 1000)) / Math.log(1001)) * gh;
          g.strokeStyle = 'rgba(111,227,160,0.35)';
          g.setLineDash([2 * u, 2 * u]);
          g.lineWidth = 0.8 * u;
          g.beginPath();
          g.moveTo(gx, Ylog(16.7));
          g.lineTo(gx + gw, Ylog(16.7));
          g.stroke();
          g.setLineDash([]);
          g.strokeStyle = C.o;
          g.lineWidth = 1.2 * u;
          g.beginPath();
          gaps.forEach((ms, i) => {
            const x = gx + (i / 149) * gw;
            if (i) g.lineTo(x, Ylog(ms));
            else g.moveTo(x, Ylog(ms));
          });
          g.stroke();
          void Y;
          const maxGap = Math.max(...gaps);
          txt(g, '이 화면의 진짜 프레임 간격', gx + 3 * u, gy + 5 * u, 5.8 * u, C.sub, 'left', 700);
          txt(g, `가장 긴 틈 ${Math.round(maxGap)}ms`, gx + gw - 3 * u, gy + 5 * u, 5.8 * u, maxGap > 100 ? C.red : C.green, 'right', 800);
          if (realMain) txt(g, `방금 메인에서 ${Math.round(realMain)}ms 계산 — 그동안 페이지 전체가 멈췄어요`, gx + gw / 2, gy + gh - 5 * u, 6 * u, C.red, 'center', 800);
          else if (wState) {
            const el = wState === 'run' ? ` (${Math.round(performance.now() - wStart)}ms)` : '';
            txt(g, wMsg + el, gx + gw / 2, gy + gh - 5 * u, 6 * u, wState === 'run' ? C.violet : C.green, 'center', 800);
          }
        },
        controls: [
          speedCtl(st),
          { type: 'button', label: '진짜로: 메인에서 0.6초 계산', on: () => { pendingMain = true; wState = ''; } },
          { type: 'button', label: '진짜로: 워커에서 0.7초 계산', on: () => { realMain = 0; runWorker(); } },
        ] as Control[],
        dispose() {
          if (worker) worker.terminate();
          if (wUrl) URL.revokeObjectURL(wUrl);
          worker = null;
        },
      };
    },
  },
};

export const DEMOS: DemoMap = {
  ...I340,
  ...I341,
  ...I342,
  ...I343,
  ...I344,
  ...I345,
  ...I346,
  ...I347,
  ...I348,
  ...I349,
  ...I350,
  ...I351,
  ...I352,
  ...I353,
  ...I354,
  ...I355,
  ...I356,
  ...I357,
  ...I358,
  ...I359,
};

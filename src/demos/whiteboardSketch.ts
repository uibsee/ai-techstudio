/**
 * 손그림 일러스트 화이트보드 (i79, 2026-10-07 다시) — 「낙서 같지만 성의 있는」 마커 그림.
 *  - 마커 선: 굵기가 변하는 선(시작은 가늘게 · 펜 누름 흔들림 · 끝은 빠짐) + 한 번 더 긋는 겹선(스케치 느낌)
 *  - 색 채우기: 도형 안을 지그재그 형광펜 빗금으로 칠하기 (살짝 삐져나옴)
 *  - 선 살랑임(line boil): 다 그린 그림도 0.14초마다 아주 조금 다시 떨려서 살아 있는 낙서처럼
 *  - 캐릭터: 얼굴 있는 물방울(눈 깜빡 · 볼 터치 · 춤)
 *  - 지우개: 마지막에 지우개가 지그재그로 쓱쓱 (잉크 층만 지우고 흔적이 살짝 남음)
 * 종이 층(한 번 그림)과 잉크 층(매 장면 다시 그림) 두 캔버스.
 */

type P = [number, number];
type XF = { x?: number; y?: number; r?: number; sx?: number; sy?: number };

interface Line {
  k: 'line';
  pts: P[];
  color: string;
  w: number;
  t0: number;
  dur: number;
  seed: number;
  g?: string;
  /** 겹선 안 함 (작은 점 · 얼굴) */
  single?: boolean;
  /** 곡선 대신 꺾인 선 (지그재그 · 별) */
  sharp?: boolean;
}
interface Fill {
  k: 'fill';
  poly: P[];
  color: string;
  t0: number;
  dur: number;
  seed: number;
  g?: string;
  sp: number;
  alpha: number;
}
interface Text {
  k: 'text';
  x: number;
  y: number;
  text: string;
  size: number;
  color: string;
  t0: number;
  dur: number;
  anchor: CanvasTextAlign;
  rot: number;
  g?: string;
  /** 형광펜 밑줄 색 (글씨가 다 써진 뒤 쓱) */
  hl?: string;
}
interface Dot {
  k: 'dot';
  x: number;
  y: number;
  rx: number;
  ry: number;
  color: string;
  t0: number;
  g?: string;
  blink?: boolean;
  alpha?: number;
}
type El = Line | Fill | Text | Dot;
interface Scene {
  dur: number;
  say: string;
  els: El[];
  /** 무리 이름 → 다 그린 뒤 움직임 (장면 안 시간) · 기준점 */
  anim?: Record<string, { at: P; f: (lt: number) => XF }>;
}

const INK = '#22252b';
const RED = '#e04a3b';
const BLUE = '#2d74d6';
const SKY = '#7fc4f2';
const ORANGE = '#ff9a3c';
const YELLOW = '#ffd84a';
const PINK = '#ff8fa3';
const GREY = '#9aa3ad';

/* ── 모양 도우미 ── */
function rng(seed: number): () => number {
  let s = (seed * 9301 + 49297) % 233280 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}
const lineP = (a: P, b: P, n = 4): P[] => Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n] as P);
const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 24): P[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as P;
  });
/** 물방울 (위가 뾰족, 바닥 y = by) */
function dropShape(cx: number, by: number, r: number): P[] {
  return Array.from({ length: 41 }, (_, i) => {
    const t = (i / 40) * Math.PI * 2;
    const s = Math.sin(t / 2);
    return [cx + r * Math.sin(t) * Math.pow(s, 1.25) * 1.05, by - r - r * Math.cos(t) * 1.25] as P;
  });
}
/** 불꽃 하나 (아래 가운데 x, y · 높이 h · 끝이 휘는 쪽 lean) — 아래는 둥글고 위는 S 자로 휘며 뾰족 */
function flame(x: number, y: number, h: number, lean: number): P[] {
  const w = h * 0.3;
  return [
    [x + lean * 0.6, y - h],
    [x + w * 0.35 + lean * 0.2, y - h * 0.72],
    [x + w * 0.95, y - h * 0.48],
    [x + w * 1.05, y - h * 0.2],
    [x + w * 0.6, y - h * 0.02],
    [x, y + h * 0.02],
    [x - w * 0.6, y - h * 0.02],
    [x - w * 1.05, y - h * 0.2],
    [x - w * 0.9, y - h * 0.5],
    [x - w * 0.55, y - h * 0.62],
    [x - w * 0.5, y - h * 0.42],
    [x - w * 0.1, y - h * 0.7],
    [x + lean * 0.6, y - h],
  ];
}
const curl = (x: number, y: number, h: number): P[] => Array.from({ length: 13 }, (_, i) => [x + Math.sin(i * 0.9) * h * 0.13, y - (h * i) / 12] as P);
function sparkle(x: number, y: number, r: number): P[][] {
  return [lineP([x, y - r], [x, y + r], 2), lineP([x - r, y], [x + r, y], 2), lineP([x - r * 0.45, y - r * 0.45], [x + r * 0.45, y + r * 0.45], 1), lineP([x + r * 0.45, y - r * 0.45], [x - r * 0.45, y + r * 0.45], 1)];
}

/* ── 장면 짓기 ── */
class B {
  els: El[] = [];
  private sd = 7;
  line(pts: P[], color: string, w: number, t0: number, dur: number, o: Partial<Line> = {}): this {
    this.els.push({ k: 'line', pts, color, w, t0, dur, seed: this.sd++, ...o });
    return this;
  }
  fill(poly: P[], color: string, t0: number, dur: number, o: Partial<Fill> = {}): this {
    this.els.push({ k: 'fill', poly, color, t0, dur, seed: this.sd++, sp: 7, alpha: 0.5, ...o });
    return this;
  }
  text(x: number, y: number, text: string, size: number, color: string, t0: number, dur: number, o: Partial<Text> = {}): this {
    this.els.push({ k: 'text', x, y, text, size, color, t0, dur, anchor: 'left', rot: 0, ...o });
    return this;
  }
  dot(x: number, y: number, rx: number, color: string, t0: number, o: Partial<Dot> = {}): this {
    this.els.push({ k: 'dot', x, y, rx, ry: o.ry ?? rx, color, t0, ...o });
    return this;
  }
  arrow(a: P, b: P, color: string, w: number, t0: number, dur: number, bend = 0.2, g?: string): this {
    const mx = (a[0] + b[0]) / 2 - (b[1] - a[1]) * bend;
    const my = (a[1] + b[1]) / 2 + (b[0] - a[0]) * bend;
    const pts: P[] = Array.from({ length: 9 }, (_, i) => {
      const t = i / 8;
      return [(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * mx + t * t * b[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * my + t * t * b[1]] as P;
    });
    const ang = Math.atan2(b[1] - my, b[0] - mx);
    const hd = 13 + w * 1.5;
    this.line(pts, color, w, t0, dur, { g });
    for (const s of [-1, 1]) {
      const q: P = [b[0] - Math.cos(ang + s * 0.5) * hd, b[1] - Math.sin(ang + s * 0.5) * hd];
      this.line([b, [(b[0] + q[0]) / 2, (b[1] + q[1]) / 2], q], color, w, t0 + dur, 0.12, { single: true, g });
    }
    return this;
  }
  /** 얼굴 있는 물방울 — 무리 g 로 함께 움직인다 */
  drop(cx: number, by: number, r: number, t0: number, g: string, mood: 'happy' | 'wow' | 'calm' = 'happy'): this {
    const shp = dropShape(cx, by, r);
    this.fill(shp, SKY, t0 + 0.9, 0.6, { g, sp: Math.max(5, r * 0.16), alpha: 0.55 });
    this.line(shp, BLUE, Math.max(3, r * 0.075), t0, 0.9, { g });
    // 반짝 (흰 빛)
    this.line(arc(cx - r * 0.42, by - r * 1.15, r * 0.3, r * 0.42, Math.PI * 1.05, Math.PI * 1.45, 6), '#ffffff', r * 0.09, t0 + 1.1, 0.2, { g, single: true });
    const ey = by - r * 0.95;
    const ex = r * 0.32;
    const eye = mood === 'wow' ? r * 0.1 : r * 0.085;
    this.dot(cx - ex, ey, eye * 0.85, INK, t0 + 1.25, { g, ry: eye * 1.15, blink: true });
    this.dot(cx + ex, ey, eye * 0.85, INK, t0 + 1.3, { g, ry: eye * 1.15, blink: true });
    this.dot(cx - ex - r * 0.17, ey + r * 0.3, r * 0.15, PINK, t0 + 1.45, { g, ry: r * 0.08, alpha: 0.7 });
    this.dot(cx + ex + r * 0.17, ey + r * 0.3, r * 0.15, PINK, t0 + 1.45, { g, ry: r * 0.08, alpha: 0.7 });
    if (mood === 'wow') this.line(arc(cx, ey + r * 0.32, r * 0.1, r * 0.13, 0, Math.PI * 2, 12), INK, r * 0.06, t0 + 1.4, 0.25, { g, single: true });
    else this.line(arc(cx, ey + r * 0.16, r * (mood === 'calm' ? 0.14 : 0.2), r * (mood === 'calm' ? 0.08 : 0.16), Math.PI * 0.15, Math.PI * 0.85, 10), INK, r * 0.06, t0 + 1.4, 0.25, { g, single: true });
    return this;
  }
}

function scenes(): Scene[] {
  // ① 질문 — 뜨거운 팬과 춤추는 물방울
  const a = new B();
  a.text(62, 78, '왜 물방울이 뜨거운 팬 위에서', 36, INK, 0.2, 1.6, { rot: -0.02 });
  a.text(62, 124, '춤출까?', 44, RED, 1.8, 0.6, { rot: -0.03, hl: YELLOW });
  // 팬 (옆에서) — 몸통 · 두께 · 손잡이
  const pan: P[] = [[238, 318], [562, 318], [540, 352], [260, 352], [238, 318]];
  a.fill(pan, GREY, 3.5, 0.6, { sp: 6, alpha: 0.45 });
  a.line(pan, INK, 4.2, 2.6, 1.1);
  a.line([[562, 326], [640, 312], [716, 300]], INK, 9, 3.6, 0.4);
  a.line([[680, 306], [716, 300]], '#6b4b33', 12, 4.0, 0.2, { single: true });
  a.line(lineP([270, 330], [530, 330], 6), '#ffffff', 2.4, 3.7, 0.4, { single: true });
  // 불꽃 — 바깥 주황 · 안쪽 노랑
  [300, 352, 404, 456, 506].forEach((x, i) => {
    const hh = i % 2 ? 56 : 66;
    const ln = i % 2 ? 7 : -8;
    const f = flame(x, 398, hh, ln);
    const inner = flame(x, 396, hh * 0.52, ln * 0.5);
    a.fill(f, ORANGE, 4.5 + i * 0.16, 0.3, { g: 'fire', sp: 5, alpha: 0.6 });
    a.fill(inner, YELLOW, 4.7 + i * 0.16, 0.2, { g: 'fire', sp: 4, alpha: 0.85 });
    a.line(f, RED, 3, 4.15 + i * 0.16, 0.4, { g: 'fire' });
  });
  a.line(lineP([270, 404], [540, 404], 6), INK, 3, 4.0, 0.5);
  // 물방울 등장
  a.drop(400, 316, 34, 5.0, 'hero', 'wow');
  // 춤 표시 — 움직임 선 · 땀 · ?!
  a.line(arc(400, 268, 58, 20, Math.PI * 1.1, Math.PI * 1.4, 6), INK, 2.4, 7.0, 0.25, { g: 'hero' });
  a.line(arc(400, 268, 58, 20, Math.PI * 1.6, Math.PI * 1.9, 6), INK, 2.4, 7.15, 0.25, { g: 'hero' });
  a.text(470, 238, '?!', 40, RED, 7.3, 0.4, { rot: 0.15 });
  for (const s of sparkle(310, 230, 11)) a.line(s, YELLOW, 3.4, 7.6, 0.12, { single: true, sharp: true });
  for (const s of sparkle(540, 200, 8)) a.line(s, YELLOW, 3, 7.75, 0.12, { single: true, sharp: true });
  const A: Scene = {
    dur: 10,
    say: '아주 뜨거운 팬에 물을 떨어뜨리면, 물방울이 바로 끓어 없어지지 않고 이리저리 굴러다녀요.',
    els: a.els,
    anim: {
      hero: { at: [400, 316], f: (lt) => (lt < 6.6 ? {} : { x: Math.sin((lt - 6.6) * 2.6) * 70, y: -Math.abs(Math.sin((lt - 6.6) * 5.2)) * 22, r: Math.sin((lt - 6.6) * 2.6) * 0.12, sy: 1 - Math.max(0, Math.cos((lt - 6.6) * 5.2 * 2)) * 0.05 }) },
      fire: { at: [404, 400], f: (lt) => ({ sy: 1 + Math.sin(lt * 9) * 0.05, sx: 1 + Math.sin(lt * 7 + 1) * 0.02 }) },
    },
  };

  // ② 확대 — 수증기 쿠션 위에 떠 있는 물방울
  const b = new B();
  b.text(62, 78, '확대해 보면…', 36, INK, 0.1, 0.9, { rot: -0.02 });
  // 돋보기 표시
  b.line(arc(700, 70, 26, 26, 0, Math.PI * 2.05, 20), INK, 3.4, 0.4, 0.5);
  b.line([[719, 89], [745, 116]], INK, 7, 0.9, 0.2);
  // 뜨거운 팬 면 (두꺼운 띠)
  const hot: P[] = [[90, 372], [710, 372], [710, 404], [90, 404], [90, 372]];
  b.fill(hot, ORANGE, 2.0, 0.5, { sp: 7, alpha: 0.5 });
  b.line(lineP([86, 372], [714, 372], 10), INK, 4.5, 1.2, 0.9);
  b.line(lineP([90, 404], [710, 404], 10), INK, 2.6, 1.6, 0.6);
  // 큰 물방울 (떠 있음)
  b.drop(400, 320, 96, 2.2, 'big', 'calm');
  // 수증기 쿠션 — 위로 오르는 김
  [292, 340, 388, 436, 484].forEach((x, i) => b.line(curl(x + 12, 366, 38), BLUE, 2.6, 4.2 + i * 0.18, 0.35, { g: 'steam' }));
  b.arrow([606, 222], [510, 336], BLUE, 3, 6.2, 0.45, -0.25);
  b.text(560, 206, '수증기 쿠션', 32, BLUE, 6.6, 0.9, { rot: -0.03, hl: '#bfe3ff' });
  b.text(84, 330, '팬 ≈ 200°C', 30, RED, 7.6, 0.8, { rot: -0.03 });
  b.arrow([150, 338], [196, 384], RED, 3, 8.4, 0.3, -0.3);
  b.text(150, 236, '둥실~', 30, INK, 8.8, 0.5, { rot: -0.12 });
  for (const s of sparkle(128, 200, 9)) b.line(s, YELLOW, 3, 9.2, 0.12, { single: true, sharp: true });
  const Bs: Scene = {
    dur: 11,
    say: '바닥이 닿는 순간 아래쪽 물이 곧바로 수증기가 되어, 얇은 수증기 쿠션 위에 물방울이 떠 있어요.',
    els: b.els,
    anim: {
      big: { at: [400, 320], f: (lt) => (lt < 4 ? {} : { y: Math.sin((lt - 4) * 2.2) * 5 - 3 }) },
      steam: { at: [400, 366], f: (lt) => ({ x: Math.sin(lt * 3) * 2.5, sy: 1 + Math.sin(lt * 4) * 0.08 }) },
    },
  };

  // ③ 그래프 — 라이덴프로스트 점
  const c = new B();
  const X0 = 110;
  const Y0 = 372;
  c.arrow([X0, Y0 + 6], [X0, 92], INK, 3.4, 0, 0.6, 0);
  c.arrow([X0 - 6, Y0], [712, Y0], INK, 3.4, 0.5, 0.7, 0);
  c.text(X0 + 14, 104, '물방울이 사라지는 시간', 26, INK, 1.0, 1, { rot: -0.01 });
  c.text(712, 410, '팬 온도', 26, INK, 1.6, 0.6, { anchor: 'right' });
  c.line(lineP([250, Y0 - 7], [250, Y0 + 7], 1), INK, 3, 2.1, 0.1, { single: true });
  c.text(250, 404, '100°C', 22, INK, 2.2, 0.4, { anchor: 'center' });
  const curve: P[] = [[124, 330], [180, 322], [228, 306], [256, 340], [300, 350], [360, 346], [404, 330], [424, 300], [440, 158], [470, 178], [540, 238], [620, 276], [700, 292]];
  c.line(curve, BLUE, 4.6, 2.6, 2.4);
  for (let i = 0; i < 9; i++) c.line(lineP([440, Y0 - 4 - i * 22], [440, Y0 - 16 - i * 22], 1), RED, 2.6, 5.1 + i * 0.05, 0.06, { single: true });
  c.text(440, 404, '≈ 190°C', 22, RED, 5.3, 0.5, { anchor: 'center' });
  // 꼭대기 동그라미 + 별 + 이름
  c.line(arc(442, 154, 30, 24, -Math.PI * 0.6, Math.PI * 1.55, 20), RED, 3.2, 5.8, 0.5);
  c.text(488, 120, '라이덴프로스트 점!', 32, RED, 6.4, 1.2, { rot: -0.03, hl: YELLOW });
  for (const s of sparkle(404, 120, 10)) c.line(s, YELLOW, 3.4, 7.7, 0.12, { single: true, sharp: true });
  for (const s of sparkle(476, 82, 7)) c.line(s, YELLOW, 3, 7.85, 0.12, { single: true, sharp: true });
  // 꼭대기에 앉은 꼬마 물방울
  c.drop(600, 262, 24, 8.0, 'mini', 'happy');
  c.text(630, 210, '오래 버텨요!', 22, BLUE, 9.6, 0.6, { rot: -0.05 });
  const C: Scene = {
    dur: 12,
    say: '그래서 온도가 더 높을 때 오히려 물방울이 더 오래 살아남아요. 이 온도를 라이덴프로스트 점이라고 해요.',
    els: c.els,
    anim: { mini: { at: [600, 262], f: (lt) => (lt < 9.7 ? {} : { y: -Math.abs(Math.sin((lt - 9.7) * 4)) * 8, r: Math.sin((lt - 9.7) * 4) * 0.06 }) } },
  };
  return [A, Bs, C];
}

/* ── 선 계산 ── */
interface Poly {
  p: P[];
  /** 누적 길이 */
  L: number[];
}
function catmull(q: P[], step: number, sharp: boolean): P[] {
  if (sharp || q.length < 3) {
    const out: P[] = [];
    for (let i = 0; i < q.length - 1; i++) {
      const [ax, ay] = q[i]!;
      const [bx, by] = q[i + 1]!;
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
      for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
    }
    out.push(q[q.length - 1]!);
    return out;
  }
  const out: P[] = [];
  for (let i = 0; i < q.length - 1; i++) {
    const p0 = q[Math.max(0, i - 1)]!;
    const p1 = q[i]!;
    const p2 = q[i + 1]!;
    const p3 = q[Math.min(q.length - 1, i + 2)]!;
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number): number => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(q[q.length - 1]!);
  return out;
}
function withLen(p: P[]): Poly {
  const L = [0];
  for (let i = 1; i < p.length; i++) L.push(L[i - 1]! + Math.hypot(p[i]![0] - p[i - 1]![0], p[i]![1] - p[i - 1]![1]));
  return { p, L };
}
/** 손떨림 + 살랑임을 얹은 부드러운 선 */
function rough(pts: P[], wob: number, seed: number, boil: number, sharp: boolean): Poly {
  const r = rng(seed);
  const r2 = rng(seed * 31 + boil * 977 + 5);
  const q = pts.map(([x, y]) => [x + (r() - 0.5) * wob + (r2() - 0.5) * (boil ? 1.6 : 0), y + (r() - 0.5) * wob + (r2() - 0.5) * (boil ? 1.6 : 0)] as P);
  return withLen(catmull(q, 2.5, sharp));
}
/** 지그재그 빗금으로 도형 채우기 */
function hatch(poly: P[], sp: number, seed: number, boil: number): Poly {
  const r = rng(seed + 101 + boil * 13);
  const ang = -0.7 + (r() - 0.5) * 0.3;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const rot = poly.map(([x, y]) => [x * ca + y * sa, -x * sa + y * ca] as P);
  const ys = rot.map((p) => p[1]);
  const y0 = Math.min(...ys) + sp * 0.5;
  const y1 = Math.max(...ys);
  const out: P[] = [];
  let flip = false;
  for (let y = y0; y < y1; y += sp) {
    const xs: number[] = [];
    for (let i = 0; i < rot.length - 1; i++) {
      const [ax, ay] = rot[i]!;
      const [bx, by] = rot[i + 1]!;
      if ((ay <= y && by > y) || (by <= y && ay > y)) xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
    }
    if (xs.length < 2) continue;
    let a = Math.min(...xs) + 2 + (r() - 0.5) * 4;
    let b = Math.max(...xs) - 2 + (r() - 0.5) * 4;
    if (b < a) continue;
    if (flip) [a, b] = [b, a];
    flip = !flip;
    out.push([a, y + (r() - 0.5) * 1.5], [b, y + (r() - 0.5) * 1.5]);
  }
  return withLen(out.map(([x, y]) => [x * ca - y * sa, x * sa + y * ca] as P));
}
/** 길이 비율까지 자른 점들과 끝점 */
function upTo(pl: Poly, frac: number): { n: number; end: P } {
  const total = pl.L[pl.L.length - 1]!;
  const want = total * frac;
  let i = 1;
  while (i < pl.L.length && pl.L[i]! < want) i++;
  if (i >= pl.L.length) return { n: pl.p.length, end: pl.p[pl.p.length - 1]! };
  const a = pl.p[i - 1]!;
  const b = pl.p[i]!;
  const k = (want - pl.L[i - 1]!) / Math.max(1e-6, pl.L[i]! - pl.L[i - 1]!);
  return { n: i, end: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k] };
}

export interface SketchOpts {
  wob: number;
  dbl: boolean;
  fill: boolean;
  boil: boolean;
  hand: boolean;
  captions: boolean;
  speak: boolean;
}

export function sketchBoard(box: HTMLElement, o: SketchOpts) {
  const FONT = 'https://fonts.googleapis.com/css2?family=Gaegu:wght@400;700&display=swap';
  if (!document.querySelector(`link[href="${FONT}"]`)) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = FONT;
    document.head.appendChild(l);
  }
  void document.fonts?.load('700 30px Gaegu').catch(() => undefined);
  const root = document.createElement('div');
  root.style.cssText = 'position:absolute;inset:0;overflow:hidden;background:#fdfcf8';
  const paper = document.createElement('canvas');
  const ink = document.createElement('canvas');
  for (const c of [paper, ink]) c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  const capBox = document.createElement('div');
  capBox.style.cssText =
    "position:absolute;left:4%;right:4%;bottom:3%;text-align:center;font-family:'Pretendard Variable',system-ui;font-weight:600;color:#fff;font-size:clamp(10px,2.1vw,16px);line-height:1.45;pointer-events:none";
  const cap = document.createElement('span');
  cap.style.cssText = 'background:rgba(20,20,24,.78);padding:.25em .6em;border-radius:6px;box-decoration-break:clone;-webkit-box-decoration-break:clone';
  capBox.appendChild(cap);
  root.append(paper, ink, capBox);
  box.appendChild(root);
  const pg = paper.getContext('2d')!;
  const g = ink.getContext('2d')!;
  const SC = scenes();
  const LOOP = SC.reduce((s, x) => s + x.dur, 0);
  const ERASE = 0.9;
  let W = 0;
  let H = 0;
  let k = 1;
  let ox = 0;
  let oy = 0;
  let dpr = 1;
  const cache = new Map<string, Poly>();

  function drawPaper(): void {
    pg.setTransform(1, 0, 0, 1, 0, 0);
    pg.fillStyle = '#fdfcf8';
    pg.fillRect(0, 0, paper.width, paper.height);
    // 종이 결 — 고정 점 얼룩
    const r = rng(3);
    for (let i = 0; i < (paper.width * paper.height) / 900; i++) {
      pg.fillStyle = r() < 0.5 ? 'rgba(120,110,90,0.035)' : 'rgba(255,255,255,0.5)';
      pg.fillRect(r() * paper.width, r() * paper.height, 1 + r() * 2 * dpr, 1 + r() * 2 * dpr);
    }
    // 아주 옅은 모눈
    pg.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy);
    pg.strokeStyle = 'rgba(70,110,160,0.07)';
    pg.lineWidth = 1 / k;
    pg.beginPath();
    for (let x = 0; x <= 800; x += 40) pg.moveTo(x, 0), pg.lineTo(x, 500);
    for (let y = 0; y <= 500; y += 40) pg.moveTo(0, y), pg.lineTo(800, y);
    pg.stroke();
  }
  function fit(): void {
    const w = box.clientWidth;
    const h = box.clientHeight;
    const d = Math.min(2, window.devicePixelRatio || 1);
    if (w === W && h === H && d === dpr) return;
    W = w;
    H = h;
    dpr = d;
    for (const c of [paper, ink]) {
      c.width = Math.max(1, Math.round(w * d));
      c.height = Math.max(1, Math.round(h * d));
    }
    k = Math.min(w / 800, h / 500);
    ox = (w - 800 * k) / 2;
    oy = (h - 500 * k) / 2;
    drawPaper();
  }

  const getLine = (e: Line, idx: number, pass: number, boil: number): Poly => {
    const key = `${idx}:${pass}:${boil}:${o.wob}`;
    let pl = cache.get(key);
    if (!pl) {
      pl = rough(e.pts, o.wob * (pass ? 1.4 : 1), e.seed + pass * 57, boil, !!e.sharp);
      cache.set(key, pl);
    }
    return pl;
  };
  const getFill = (e: Fill, idx: number, boil: number): Poly => {
    const key = `f${idx}:${boil}`;
    let pl = cache.get(key);
    if (!pl) {
      pl = hatch(e.poly, e.sp, e.seed, boil);
      cache.set(key, pl);
    }
    return pl;
  };

  /** 굵기가 변하는 마커 선 */
  function marker(pl: Poly, frac: number, color: string, w: number, seed: number): P | null {
    if (frac <= 0) return null;
    const { n, end } = upTo(pl, frac);
    const len = pl.L[pl.L.length - 1]!;
    g.strokeStyle = color;
    g.lineCap = 'round';
    const ph = seed * 1.7;
    let prev = pl.p[0]!;
    for (let i = 1; i <= n; i++) {
      const p = i === n ? end : pl.p[i]!;
      const s = pl.L[Math.min(i, pl.L.length - 1)]!;
      const t0 = Math.min(1, s / Math.min(14, len * 0.3));
      const t1 = frac >= 1 ? Math.min(1, (len - s) / Math.min(18, len * 0.3)) : 1;
      const press = 0.86 + 0.14 * Math.sin(s * 0.045 + ph) * Math.sin(s * 0.011 + ph * 2);
      g.lineWidth = Math.max(0.6, w * (0.35 + 0.65 * Math.sqrt(t0)) * (0.3 + 0.7 * Math.sqrt(Math.max(0, t1))) * press);
      g.beginPath();
      g.moveTo(prev[0], prev[1]);
      g.lineTo(p[0], p[1]);
      g.stroke();
      prev = p;
    }
    return end;
  }

  let speakIdx = -1;
  let cur = -1;
  function speak(text: string): void {
    if (!o.speak || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    u.rate = 1.05;
    speechSynthesis.speak(u);
  }

  function xfOf(sc: Scene, grp: string | undefined, lt: number): DOMMatrix {
    const m = new DOMMatrix();
    if (!grp || !sc.anim?.[grp]) return m;
    const { at, f } = sc.anim[grp];
    const x = f(lt);
    return m
      .translate(at[0] + (x.x ?? 0), at[1] + (x.y ?? 0))
      .rotate(((x.r ?? 0) * 180) / Math.PI)
      .scale(x.sx ?? 1, x.sy ?? 1)
      .translate(-at[0], -at[1]);
  }

  /** 요소의 시작 · 끝 점 (장면 좌표, 무리 움직임 반영 전) 과 끝나는 시각 */
  function ends(e: El, idx: number): { a: P; b: P; te: number; color: string } | null {
    if (e.k === 'line') {
      const pl = getLine(e, idx, 0, 0);
      return { a: pl.p[0]!, b: pl.p[pl.p.length - 1]!, te: e.t0 + e.dur, color: e.color };
    }
    if (e.k === 'fill') {
      if (!o.fill) return null;
      const pl = getFill(e, idx, 0);
      return { a: pl.p[0]!, b: pl.p[pl.p.length - 1]!, te: e.t0 + e.dur, color: e.color };
    }
    if (e.k === 'text') return { a: [e.x, e.y - e.size * 0.35], b: [e.x, e.y - e.size * 0.35], te: e.t0 + e.dur + (e.hl ? 0.35 : 0), color: e.color };
    return { a: [e.x, e.y], b: [e.x, e.y], te: e.t0 + 0.15, color: INK };
  }
  function travel(sc: Scene, lt: number): { p: P; m: DOMMatrix; color: string } | null {
    let prev: { p: P; te: number; g?: string } | null = null;
    let next: { p: P; t0: number; g?: string; color: string } | null = null;
    sc.els.forEach((e, idx) => {
      const r = ends(e, idx);
      if (!r) return;
      // 글씨 끝은 마지막 글자 오른쪽
      let b = r.b;
      if (e.k === 'text') {
        g.save();
        g.font = `700 ${e.size}px Gaegu, "Pretendard Variable", system-ui`;
        const full = g.measureText(e.text).width;
        g.restore();
        const x1 = e.anchor === 'center' ? full / 2 : e.anchor === 'right' ? 0 : full;
        b = [e.x + Math.cos(e.rot) * x1, e.y + Math.sin(e.rot) * x1 - e.size * 0.35];
      }
      if (r.te <= lt && (!prev || r.te > prev.te)) prev = { p: b, te: r.te, g: e.g };
      if (e.t0 > lt && (!next || e.t0 < next.t0)) {
        let a = r.a;
        if (e.k === 'text') {
          g.save();
          g.font = `700 ${e.size}px Gaegu, "Pretendard Variable", system-ui`;
          const full = g.measureText(e.text).width;
          g.restore();
          const x0 = e.anchor === 'center' ? -full / 2 : e.anchor === 'right' ? -full : 0;
          a = [e.x + Math.cos(e.rot) * x0, e.y + Math.sin(e.rot) * x0 - e.size * 0.35];
        }
        next = { p: a, t0: e.t0, g: e.g, color: r.color };
      }
    });
    const pv = prev as { p: P; te: number; g?: string } | null;
    const nx = next as { p: P; t0: number; g?: string; color: string } | null;
    if (!pv) return null;
    const pa = xfOf(sc, pv.g, lt).transformPoint(new DOMPoint(pv.p[0], pv.p[1]));
    if (nx && nx.t0 - pv.te < 1.6) {
      const nb = xfOf(sc, nx.g, lt).transformPoint(new DOMPoint(nx.p[0], nx.p[1]));
      const k = Math.max(0, Math.min(1, (lt - pv.te) / Math.max(0.01, nx.t0 - pv.te)));
      const s = k * k * (3 - 2 * k);
      const lift = Math.sin(Math.PI * s) * Math.min(30, Math.hypot(nb.x - pa.x, nb.y - pa.y) * 0.25);
      return { p: [pa.x + (nb.x - pa.x) * s, pa.y + (nb.y - pa.y) * s - lift], m: new DOMMatrix(), color: nx.color };
    }
    // 다음 획이 멀면 끝난 자리에 잠깐 머물다 사라짐
    return lt - pv.te < 0.5 ? { p: [pa.x, pa.y], m: new DOMMatrix(), color: INK } : null;
  }

  function frame(t: number): void {
    fit();
    let T = ((t % LOOP) + LOOP) % LOOP;
    let si = 0;
    while (si < SC.length - 1 && T >= SC[si]!.dur) T -= SC[si++]!.dur;
    const sc = SC[si]!;
    const lt = T;
    if (si !== cur) {
      cur = si;
      cache.clear();
      if (speakIdx !== si) speak(sc.say);
      speakIdx = si;
    }
    const boil = o.boil ? Math.floor(t / 0.14) % 3 : 0;
    const base = new DOMMatrix([dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy]);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, ink.width, ink.height);
    let pen: { p: P; m: DOMMatrix; color: string } | null = null;
    sc.els.forEach((e, idx) => {
      const m = xfOf(sc, e.g, lt);
      g.setTransform(base.multiply(m));
      g.globalAlpha = 1;
      if (e.k === 'line') {
        const f = Math.max(0, Math.min(1, (lt - e.t0) / e.dur));
        if (f <= 0) return;
        const ease = f < 1 ? 1 - Math.pow(1 - f, 1.5) : 1;
        const done = f >= 1 ? 1 : 0;
        const end = marker(getLine(e, idx, 0, done ? boil : 0), ease, e.color, e.w, e.seed);
        if (o.dbl && !e.single) {
          // 겹선 — 같은 펜이 한 번에 긋는 두 가닥처럼, 펜 바로 뒤를 따라가고 펜과 함께 끝난다
          g.globalAlpha = 0.55;
          marker(getLine(e, idx, 1, done ? boil : 0), f < 1 ? Math.max(0, ease - 0.04) : 1, e.color, e.w * 0.5, e.seed + 9);
          g.globalAlpha = 1;
        }
        if (f < 1 && end) pen = { p: end, m, color: e.color };
      } else if (e.k === 'fill') {
        if (!o.fill) return;
        const f = Math.max(0, Math.min(1, (lt - e.t0) / e.dur));
        if (f <= 0) return;
        const pl = getFill(e, idx, f >= 1 ? boil : 0);
        const { n, end } = upTo(pl, f);
        g.globalAlpha = e.alpha;
        g.strokeStyle = e.color;
        g.lineWidth = e.sp * 1.35;
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.beginPath();
        g.moveTo(pl.p[0]![0], pl.p[0]![1]);
        for (let i = 1; i < n; i++) g.lineTo(pl.p[i]![0], pl.p[i]![1]);
        g.lineTo(end[0], end[1]);
        g.stroke();
        g.globalAlpha = 1;
        if (f < 1) pen = { p: end, m, color: e.color };
      } else if (e.k === 'text') {
        const f = Math.max(0, Math.min(1, (lt - e.t0) / e.dur));
        if (f <= 0) return;
        const nF = e.text.length * f;
        const nCh = Math.min(e.text.length, Math.floor(nF) + (f > 0 ? 1 : 0));
        const s = e.text.slice(0, nCh);
        g.save();
        g.translate(e.x, e.y);
        g.rotate(e.rot + (done(f) && o.boil ? (boil - 1) * 0.004 : 0));
        g.font = `700 ${e.size}px Gaegu, "Pretendard Variable", system-ui`;
        g.textAlign = 'left';
        const full = g.measureText(e.text).width;
        const x0 = e.anchor === 'center' ? -full / 2 : e.anchor === 'right' ? -full : 0;
        // 형광펜 밑줄 (글씨를 다 쓴 뒤 0.35초)
        if (e.hl) {
          const hf = Math.max(0, Math.min(1, (lt - e.t0 - e.dur) / 0.35));
          if (hf > 0) {
            g.globalAlpha = 0.6;
            g.strokeStyle = e.hl;
            g.lineCap = 'round';
            g.lineWidth = e.size * 0.42;
            g.beginPath();
            g.moveTo(x0 - 6, -e.size * 0.12);
            g.quadraticCurveTo(x0 + full * 0.5, -e.size * 0.22, x0 - 6 + (full + 12) * hf, -e.size * 0.16);
            g.stroke();
            g.globalAlpha = 1;
          }
        }
        g.fillStyle = e.color;
        g.fillText(s, x0, 0);
        g.restore();
        if (f < 1) {
          // 지금 쓰는 글자 안에서 펜이 왼쪽 → 오른쪽으로 스르륵 (위아래는 아주 살짝)
          g.save();
          g.font = `700 ${e.size}px Gaegu, "Pretendard Variable", system-ui`;
          const wa = g.measureText(e.text.slice(0, Math.floor(nF))).width;
          const wb = g.measureText(e.text.slice(0, Math.floor(nF) + 1)).width;
          g.restore();
          const fr = nF - Math.floor(nF);
          const lx = (e.anchor === 'center' ? -full / 2 : e.anchor === 'right' ? -full : 0) + wa + (wb - wa) * fr;
          const ly = -e.size * (0.32 + 0.05 * Math.sin(fr * Math.PI * 2));
          pen = { p: [e.x + Math.cos(e.rot) * lx - Math.sin(e.rot) * ly, e.y + Math.sin(e.rot) * lx + Math.cos(e.rot) * ly], m, color: e.color };
        }
      } else {
        if (lt < e.t0) return;
        const pop = Math.min(1, (lt - e.t0) / 0.15);
        if (pop < 1) pen = { p: [e.x, e.y], m, color: e.color === PINK ? PINK : INK };
        const bl = e.blink && (lt + e.x * 0.01) % 3.2 > 3.05 ? 0.15 : 1;
        g.globalAlpha = e.alpha ?? 1;
        g.fillStyle = e.color;
        g.beginPath();
        g.ellipse(e.x, e.y, e.rx * pop, e.ry * pop * bl, 0, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
      }
    });

    // 획과 획 사이 — 펜을 살짝 들고 다음 획 시작점으로 옮긴다 (사라졌다 나타나지 않게)
    if (!pen) pen = travel(sc, lt);

    // 지우개 — 장면 끝에 지그재그로 쓱쓱
    const ef = (lt - (sc.dur - ERASE)) / ERASE;
    if (ef > 0) {
      const zz: P[] = [];
      for (let i = 0; i <= 6; i++) zz.push([60 + (680 * i) / 6, i % 2 ? 470 : 30]);
      const pl = withLen(catmull(zz, 4, true));
      const { n, end } = upTo(pl, Math.min(1, ef));
      g.setTransform(base);
      g.globalCompositeOperation = 'destination-out';
      g.globalAlpha = 0.92;
      g.lineWidth = 150;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(pl.p[0]![0], pl.p[0]![1]);
      for (let i = 1; i < n; i++) g.lineTo(pl.p[i]![0], pl.p[i]![1]);
      g.lineTo(end[0], end[1]);
      g.stroke();
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      // 지우개 몸
      g.save();
      g.translate(end[0], end[1]);
      g.rotate(-0.25);
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(-58, -18, 124, 46);
      g.fillStyle = '#3a5fa8';
      g.beginPath();
      g.roundRect(-62, -26, 124, 30, 8);
      g.fill();
      g.fillStyle = '#d9d4c7';
      g.fillRect(-60, 2, 120, 16);
      g.strokeStyle = INK;
      g.lineWidth = 2.5;
      g.beginPath();
      g.roundRect(-62, -26, 124, 44, 8);
      g.stroke();
      g.restore();
      pen = null;
    }

    // 마커 펜 — 지금 긋는 끝을 따라
    if (o.hand && pen) {
      const pp: { p: P; m: DOMMatrix; color: string } = pen;
      const q = pp.m.transformPoint(new DOMPoint(pp.p[0], pp.p[1]));
      g.setTransform(base);
      g.save();
      g.translate(q.x, q.y);
      g.rotate(-0.55 + Math.sin(t * 5) * 0.015);
      g.fillStyle = 'rgba(40,30,20,0.12)';
      g.beginPath();
      g.roundRect(-2, -80, 14, 72, 5);
      g.fill();
      g.fillStyle = pp.color === '#ffffff' ? INK : pp.color;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(-4, -10);
      g.lineTo(4, -10);
      g.closePath();
      g.fill();
      g.fillStyle = '#f2f2ee';
      g.beginPath();
      g.roundRect(-8, -86, 16, 76, 4);
      g.fill();
      g.fillStyle = pp.color === '#ffffff' ? INK : pp.color;
      g.fillRect(-8, -30, 16, 8);
      g.beginPath();
      g.roundRect(-9, -96, 18, 22, 4);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = 2;
      g.beginPath();
      g.roundRect(-8, -86, 16, 76, 4);
      g.stroke();
      g.restore();
    }

    // 자막 — 낱말이 말 속도로
    capBox.style.display = o.captions ? '' : 'none';
    const words = sc.say.split(' ');
    const shown = Math.min(words.length, Math.ceil((lt / Math.max(1, sc.dur - 1.5)) * words.length));
    const txt = words.slice(0, Math.max(1, shown)).join(' ');
    if (cap.textContent !== txt) cap.textContent = txt;
  }
  const done = (f: number): boolean => f >= 1;

  return {
    set(p: Partial<SketchOpts>): void {
      if (p.speak === false && 'speechSynthesis' in window) speechSynthesis.cancel();
      if (p.speak) speakIdx = -1;
      if (p.wob !== undefined) cache.clear();
      Object.assign(o, p);
      if (p.speak) cur = -1;
    },
    update: frame,
    dispose(): void {
      if ('speechSynthesis' in window) speechSynthesis.cancel();
      root.remove();
    },
  };
}

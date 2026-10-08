import type { Control, DemoMap } from './types';

/**
 * 「System」 묶음 견본 — 눈에 안 보이는 기술(언어 · 글꼴 · 그림 자리 · 소리 · 입력 · 일꾼 · 서비스 워커 · 온라인 ·
 * 접근성 · FrameGate · 게임 AI · 풀이기 · 게임 이론 · 라이브러리)을 움직이는 2D 도식으로 보여 준다.
 * 모든 그림은 320 × 200 가상 화면에 그리고 stage() 가 카드 · 큰 화면 크기에 맞춰 가운데 놓는다.
 * 소리는 자세히 보기의 단추로만 낸다 (자동 재생 없음).
 */

type G = CanvasRenderingContext2D;
type BG = [string, string];

const F = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
/** 제목 글꼴 — 캔버스에서는 웹 글꼴이 늦게 와 깨질 수 있어 시스템 글꼴 굵게 */
const TF = F;
const MONO = 'ui-monospace, Consolas, "Courier New", monospace';
const VW = 320;
const VH = 200;

const NAVY: BG = ['#1a2152', '#2e3d80'];
const SKY: BG = ['#b8e1ff', '#effaff'];
const MINT: BG = ['#c9f3e4', '#f4fff9'];
const PEACH: BG = ['#ffe1c8', '#fff8ef'];

// ───────── 그리기 도구 ─────────
function stage(g: G, w: number, h: number, bg: BG): void {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, bg[0]);
  gr.addColorStop(1, bg[1]);
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  const s = Math.min(w / VW, h / VH);
  g.translate((w - VW * s) / 2, (h - VH * s) / 2);
  g.scale(s, s);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.textBaseline = 'middle';
  g.globalAlpha = 1;
}
const clamp = (x: number, a = 0, b = 1): number => (x < a ? a : x > b ? b : x);
const ease = (x: number): number => {
  const k = clamp(x);
  return k * k * (3 - 2 * k);
};
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

function rr(g: G, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}
function box(g: G, x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient | null, stroke?: string, lw = 1.5): void {
  rr(g, x, y, w, h, r);
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = lw;
    g.stroke();
  }
}
function txt(g: G, s: string, x: number, y: number, size: number, col: string, align: CanvasTextAlign = 'center', weight = 700, font = F): void {
  g.font = `${weight} ${size}px ${font}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillStyle = col;
  g.fillText(s, x, y);
}
/** 폭에 맞춰 줄인 글씨 */
function txtFit(g: G, s: string, x: number, y: number, size: number, maxW: number, col: string, weight = 700, font = F): void {
  g.font = `${weight} ${size}px ${font}`;
  const m = g.measureText(s).width;
  const sz = m > maxW ? (size * maxW) / m : size;
  txt(g, s, x, y, sz, col, 'center', weight, font);
}
function circle(g: G, x: number, y: number, r: number, fill: string | CanvasGradient | null, stroke?: string, lw = 1.5): void {
  g.beginPath();
  g.arc(x, y, Math.max(0.01, r), 0, Math.PI * 2);
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = lw;
    g.stroke();
  }
}
function line(g: G, x1: number, y1: number, x2: number, y2: number, col: string, lw = 1.5, dash?: number[]): void {
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.strokeStyle = col;
  g.lineWidth = lw;
  g.setLineDash(dash ?? []);
  g.stroke();
  g.setLineDash([]);
}
function arrow(g: G, x1: number, y1: number, x2: number, y2: number, col: string, lw = 2, dash?: number[]): void {
  line(g, x1, y1, x2, y2, col, lw, dash);
  const a = Math.atan2(y2 - y1, x2 - x1);
  const s = 4 + lw;
  g.beginPath();
  g.moveTo(x2, y2);
  g.lineTo(x2 - s * Math.cos(a - 0.45), y2 - s * Math.sin(a - 0.45));
  g.lineTo(x2 - s * Math.cos(a + 0.45), y2 - s * Math.sin(a + 0.45));
  g.closePath();
  g.fillStyle = col;
  g.fill();
}
function pill(g: G, s: string, x: number, y: number, bg: string, col = '#fff', size = 8): void {
  g.font = `800 ${size}px ${F}`;
  const w = g.measureText(s).width + size * 1.4;
  box(g, x - w / 2, y - size * 0.95, w, size * 1.9, size * 0.95, bg);
  txt(g, s, x, y + 0.5, size, col, 'center', 800);
}
function check(g: G, x: number, y: number, s: number, col = '#2bb673'): void {
  g.beginPath();
  g.moveTo(x - s, y);
  g.lineTo(x - s * 0.3, y + s * 0.7);
  g.lineTo(x + s, y - s * 0.7);
  g.strokeStyle = col;
  g.lineWidth = s * 0.45;
  g.stroke();
}
function cross(g: G, x: number, y: number, s: number, col = '#ff5a5a'): void {
  line(g, x - s, y - s, x + s, y + s, col, s * 0.45);
  line(g, x + s, y - s, x - s, y + s, col, s * 0.45);
}
function cloud(g: G, x: number, y: number, s: number, fill: string, stroke?: string): void {
  g.beginPath();
  g.arc(x - s * 0.55, y + s * 0.1, s * 0.42, Math.PI * 0.5, Math.PI * 1.5);
  g.arc(x - s * 0.15, y - s * 0.25, s * 0.5, Math.PI, Math.PI * 1.85);
  g.arc(x + s * 0.45, y - s * 0.05, s * 0.45, Math.PI * 1.3, Math.PI * 0.5);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = 1.5;
    g.stroke();
  }
}
function gear(g: G, x: number, y: number, r: number, a: number, col: string): void {
  g.beginPath();
  for (let i = 0; i < 16; i++) {
    const rr2 = i % 2 ? r : r * 0.78;
    const an = a + (i / 16) * Math.PI * 2;
    g.lineTo(x + Math.cos(an) * rr2, y + Math.sin(an) * rr2);
  }
  g.closePath();
  g.fillStyle = col;
  g.fill();
  circle(g, x, y, r * 0.35, '#fff');
}
function phone(g: G, x: number, y: number, w: number, h: number, body = '#2a2f45'): void {
  box(g, x, y, w, h, w * 0.16, body);
  box(g, x + 3, y + 7, w - 6, h - 14, w * 0.08, '#fdfdff');
  box(g, x + w / 2 - 6, y + 2.5, 12, 2, 1, '#555b78');
}
function speaker(g: G, x: number, y: number, s: number, col: string, waves: number, t: number): void {
  g.beginPath();
  g.moveTo(x - s, y - s * 0.4);
  g.lineTo(x - s * 0.4, y - s * 0.4);
  g.lineTo(x + s * 0.2, y - s);
  g.lineTo(x + s * 0.2, y + s);
  g.lineTo(x - s * 0.4, y + s * 0.4);
  g.lineTo(x - s, y + s * 0.4);
  g.closePath();
  g.fillStyle = col;
  g.fill();
  for (let i = 0; i < waves; i++) {
    const k = (t * 1.5 + i / waves) % 1;
    g.beginPath();
    g.arc(x + s * 0.3, y, s * (0.6 + k * 1.4), -0.7, 0.7);
    g.strokeStyle = col;
    g.globalAlpha = 1 - k;
    g.lineWidth = s * 0.22;
    g.stroke();
    g.globalAlpha = 1;
  }
}
function star(g: G, x: number, y: number, r: number, fill: string, rot = 0, stroke?: string): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot - Math.PI / 2 + (i * Math.PI) / 5;
    const k = i % 2 ? r * 0.5 : r;
    g.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k);
  }
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = 1.4;
    g.stroke();
  }
}
/** 동글 얼굴 (눈 · 볼 · 입) */
function face(g: G, x: number, y: number, s: number, happy = true): void {
  circle(g, x - s * 0.35, y - s * 0.05, s * 0.11, '#2a2238');
  circle(g, x + s * 0.35, y - s * 0.05, s * 0.11, '#2a2238');
  circle(g, x - s * 0.55, y + s * 0.22, s * 0.13, 'rgba(255,120,140,0.55)');
  circle(g, x + s * 0.55, y + s * 0.22, s * 0.13, 'rgba(255,120,140,0.55)');
  g.beginPath();
  if (happy) g.arc(x, y + s * 0.12, s * 0.2, 0.15 * Math.PI, 0.85 * Math.PI);
  else g.arc(x, y + s * 0.38, s * 0.16, 1.15 * Math.PI, 1.85 * Math.PI);
  g.strokeStyle = '#2a2238';
  g.lineWidth = s * 0.08;
  g.stroke();
}
function battery(g: G, x: number, y: number, w: number, h: number, lvl: number): void {
  box(g, x, y, w, h, 3, '#fff', '#3a4266', 1.6);
  box(g, x + w, y + h * 0.3, 3, h * 0.4, 1, '#3a4266');
  const c = lvl > 0.5 ? '#3ccf7a' : lvl > 0.25 ? '#ffc23d' : '#ff5a5a';
  box(g, x + 2, y + 2, Math.max(0, (w - 4) * lvl), h - 4, 2, c);
}
/** 0 ~ 1 사이 왕복 */
const pingpong = (t: number, p: number): number => {
  const k = (t % p) / p;
  return k < 0.5 ? k * 2 : 2 - k * 2;
};
function rnd(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

// ───────── 소리 도구 (단추를 누를 때만) ─────────
let AC: AudioContext | null = null;
function ac(): AudioContext {
  if (!AC) AC = new AudioContext();
  if (AC.state === 'suspended') void AC.resume();
  return AC;
}
interface ToneOpt {
  freq: number;
  to?: number;
  dur: number;
  type?: OscillatorType;
  vol?: number;
  delay?: number;
}
function tone(o: ToneOpt, dest?: AudioNode): void {
  const c = ac();
  const t0 = c.currentTime + (o.delay ?? 0);
  const osc = c.createOscillator();
  const gn = c.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + o.dur);
  gn.gain.setValueAtTime(0.0001, t0);
  gn.gain.exponentialRampToValueAtTime(o.vol ?? 0.15, t0 + 0.01);
  gn.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(gn).connect(dest ?? c.destination);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.05);
}
function noise(dur: number, freq: number, q: number, vol: number): void {
  const c = ac();
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = q;
  const gn = c.createGain();
  gn.gain.value = vol;
  src.connect(bp).connect(gn).connect(c.destination);
  src.start();
}
const SFX: [string, string, string][] = [
  ['pop', '팡', 'triangle'],
  ['merge', '합치기', 'triangle'],
  ['thud', '쿵', 'sine'],
  ['combo', '콤보', 'square'],
  ['fanfare', '팡파르', 'square'],
  ['wrong', '틀림', 'sawtooth'],
  ['click', '딸깍', 'square'],
  ['stone', '돌 놓기', 'noise'],
  ['hint', '힌트', 'sine'],
  ['lose', '짐', 'triangle'],
  ['flip', '넘김', 'noise'],
  ['correct', '정답', 'triangle'],
];
/** core/Sfx.ts 의 합성 소리와 같은 값 */
function playSfx(name: string): void {
  switch (name) {
    case 'pop':
      tone({ freq: 520, to: 880, dur: 0.09, type: 'triangle', vol: 0.18 });
      break;
    case 'merge':
      tone({ freq: 495, to: 990, dur: 0.12, type: 'triangle', vol: 0.22 });
      tone({ freq: 742, to: 1485, dur: 0.1, type: 'sine', vol: 0.12, delay: 0.05 });
      break;
    case 'thud':
      tone({ freq: 180, to: 80, dur: 0.09, type: 'sine', vol: 0.16 });
      break;
    case 'combo':
      [1, 1.26, 1.5, 2].forEach((m, i) => tone({ freq: 523 * m, dur: 0.12, type: 'square', vol: 0.07, delay: i * 0.06 }));
      break;
    case 'fanfare':
      [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone({ freq: f, dur: i === 5 ? 0.5 : 0.14, type: 'square', vol: 0.08, delay: i * 0.12 }));
      [262, 330, 392].forEach((f) => tone({ freq: f, dur: 0.8, type: 'triangle', vol: 0.1, delay: 0.6 }));
      break;
    case 'wrong':
      tone({ freq: 220, to: 150, dur: 0.22, type: 'sawtooth', vol: 0.08 });
      break;
    case 'click':
      tone({ freq: 900, dur: 0.04, type: 'square', vol: 0.05 });
      break;
    case 'stone':
      noise(0.05, 2600, 1.2, 0.5);
      tone({ freq: 240, to: 140, dur: 0.07, type: 'sine', vol: 0.18 });
      break;
    case 'hint':
      [784, 988, 1175].forEach((f, i) => tone({ freq: f, dur: 0.18, type: 'sine', vol: 0.1, delay: i * 0.07 }));
      break;
    case 'lose':
      [392, 349, 311, 262].forEach((f, i) => tone({ freq: f, dur: i === 3 ? 0.45 : 0.18, type: 'triangle', vol: 0.12, delay: i * 0.16 }));
      break;
    case 'flip':
      noise(0.07, 1500, 0.7, 0.28);
      break;
    case 'correct':
      tone({ freq: 660, dur: 0.1, type: 'triangle', vol: 0.16 });
      tone({ freq: 990, dur: 0.16, type: 'triangle', vol: 0.14, delay: 0.07 });
      break;
  }
}
function waveY(type: string, x: number, seed: number): number {
  const p = x - Math.floor(x);
  switch (type) {
    case 'sine':
      return Math.sin(x * Math.PI * 2);
    case 'square':
      return p < 0.5 ? 0.8 : -0.8;
    case 'sawtooth':
      return p * 2 - 1;
    case 'noise':
      return Math.sin(x * 37.1 + seed) * Math.sin(x * 91.7 + seed * 3) * 0.9;
    default:
      return p < 0.5 ? p * 4 - 1 : 3 - p * 4;
  }
}

// ───────── 언어 ─────────
const LANGS: [string, string][] = [
  ['ko', '시작하기'],
  ['en', 'Start'],
  ['ja', 'はじめる'],
  ['zh', '开始'],
  ['es', 'Empezar'],
  ['pt', 'Começar'],
  ['fr', 'Commencer'],
  ['de', 'Starten'],
  ['vi', 'Bắt đầu'],
  ['id', 'Mulai'],
];
function loadFonts(): void {
  if (document.getElementById('demo-sys-fonts')) return;
  const l = document.createElement('link');
  l.id = 'demo-sys-fonts';
  l.rel = 'stylesheet';
  l.href =
    'https://fonts.googleapis.com/css2?family=Jua&family=Gowun+Dodum&family=Noto+Sans+JP:wght@700&family=Noto+Sans+TC:wght@700&family=Noto+Sans+SC:wght@700&family=Be+Vietnam+Pro:wght@700&display=swap';
  document.head.appendChild(l);
}

// ───────── 견본 ─────────
export const DEMOS: DemoMap = {
  // ── 그림 자리 ──
  u72: {
    kind: '2d',
    caption: '그림 파일이 들어오면 그 그림, 빠지면 코드로 그린 자리표시 — 2.5초마다 바뀌어요',
    make() {
      const R = rnd(7);
      const cols = ['#ff9a8a', '#ffc46b', '#ff7a6b', '#ffd9a8', '#ffb3c7'];
      const strokes = Array.from({ length: 46 }, () => ({ a: R() * 6.28, r: R() * 30, l: 5 + R() * 10, rot: R() * 6.28, c: cols[Math.floor(R() * 5)]! }));
      let force: boolean | null = null;
      return {
        draw(g, w, h, t) {
          stage(g, w, h, SKY);
          const cyc = t % 5;
          const k = force === null ? ease(cyc / 0.4) - ease((cyc - 2.1) / 0.4) : force ? 1 : 0;
          // 부르는 코드
          box(g, 12, 12, 146, 24, 7, '#22305e');
          txt(g, "artUrl('hero')", 85, 24.5, 10.5, '#ffe28a', 'center', 700, MONO);
          // 폴더
          g.beginPath();
          g.moveTo(12, 52);
          g.lineTo(12, 46);
          g.quadraticCurveTo(12, 44, 16, 44);
          g.lineTo(52, 44);
          g.lineTo(58, 52);
          g.closePath();
          g.fillStyle = '#ffcf5a';
          g.fill();
          box(g, 12, 50, 146, 112, 8, '#ffe08f', '#e2ae3c');
          txt(g, 'games/mygame/', 85, 61, 8.5, '#8a5b10', 'center', 800);
          const files: [string, number][] = [
            ['bg.jpg', 1],
            ['hero.webp', k],
            ['emblem.webp', 1],
          ];
          files.forEach(([n, a], i) => {
            const y = 76 + i * 26;
            g.globalAlpha = a;
            const off = (1 - a) * 26;
            box(g, 22 + off, y, 126, 20, 5, i === 1 ? '#fffdf2' : '#fff8e2', i === 1 ? '#ff8a3d' : '#efcf86', i === 1 ? 2 : 1);
            box(g, 28 + off, y + 4, 10, 12, 2, i === 1 ? '#ff9a6b' : '#9ac4ff');
            txt(g, n, 44 + off, y + 10.5, 9, '#5a4210', 'left', 700);
            g.globalAlpha = 1;
          });
          if (k < 0.5) {
            g.setLineDash([3, 3]);
            box(g, 22, 102, 126, 20, 5, null, '#c9a24a', 1.2);
            g.setLineDash([]);
            txt(g, 'hero.webp 없음', 85, 112.5, 8.5, '#b08a3a', 'center', 700);
          }
          pill(g, k > 0.5 ? '찾았다 ✓ → 그 그림' : '없다 → 코드 그림', 85, 177, k > 0.5 ? '#2bb673' : '#7a86a8', '#fff', 9);
          arrow(g, 160, 112, 176, 102, '#3a4f8c', 2);
          // 액자
          const fx = 180;
          const fy = 16;
          const fw = 128;
          const fh = 150;
          box(g, fx - 6, fy - 6, fw + 12, fh + 12, 10, '#c98a3a', '#8a5a1e', 2);
          box(g, fx, fy, fw, fh, 5, '#fff');
          g.save();
          rr(g, fx, fy, fw, fh, 5);
          g.clip();
          const cx = fx + fw / 2;
          const cy = fy + fh / 2 - 4;
          // 코드 그림 (자리표시)
          g.globalAlpha = 1 - k;
          g.fillStyle = '#e8edf5';
          g.fillRect(fx, fy, fw, fh);
          g.strokeStyle = '#d5dcea';
          g.lineWidth = 6;
          for (let i = -fh; i < fw; i += 16) line(g, fx + i, fy + fh, fx + i + fh, fy, '#d8dfec', 5);
          circle(g, cx, cy, 30, '#a9b7cf');
          circle(g, cx - 10, cy - 3, 3.5, '#fff');
          circle(g, cx + 10, cy - 3, 3.5, '#fff');
          line(g, cx - 8, cy + 11, cx + 8, cy + 11, '#fff', 3);
          g.setLineDash([5, 4]);
          box(g, fx + 5, fy + 5, fw - 10, fh - 10, 4, null, '#8c9ab8', 1.4);
          g.setLineDash([]);
          txt(g, '코드 그림', cx, fy + fh - 28, 11, '#55627f', 'center', 800);
          txt(g, 'hero · 400×300', cx, fy + fh - 15, 8, '#7e8aa6', 'center', 600);
          // 사용자 그림
          g.globalAlpha = k;
          g.fillStyle = '#fff3df';
          g.fillRect(fx, fy, fw, fh);
          for (let i = 0; i < 9; i++) circle(g, fx + 10 + i * 15, fy + fh - 6 + Math.sin(i) * 3, 12, '#bfe6a8');
          for (const s of strokes) {
            const x = cx + Math.cos(s.a) * s.r;
            const y = cy + 4 + Math.sin(s.a) * s.r * 0.9;
            g.save();
            g.translate(x, y);
            g.rotate(s.rot);
            g.globalAlpha = k * 0.85;
            box(g, -s.l / 2, -3, s.l, 6, 3, s.c);
            g.restore();
          }
          g.globalAlpha = k;
          circle(g, cx, cy + 4, 26, 'rgba(255,200,150,0.55)');
          face(g, cx, cy + 4, 22);
          // 모자
          g.beginPath();
          g.moveTo(cx - 22, cy - 18);
          g.quadraticCurveTo(cx, cy - 50, cx + 22, cy - 18);
          g.closePath();
          g.fillStyle = '#6b8cff';
          g.fill();
          circle(g, cx, cy - 40, 5, '#ffe066');
          star(g, fx + 20, fy + 20, 7, '#ffd23f', t);
          star(g, fx + fw - 18, fy + 30, 5, '#ffd23f', -t);
          txt(g, '사용자 그림', cx, fy + fh - 15, 10, '#b25a1c', 'center', 800);
          g.globalAlpha = 1;
          g.restore();
          pill(g, k > 0.5 ? '사용자 그림 ✓' : '자리표시', fx + fw / 2, 186, k > 0.5 ? '#ff8a3d' : '#7a86a8', '#fff', 8.5);
        },
        controls: [
          {
            type: 'button',
            label: '자동 → 그림 있음 → 그림 없음',
            on: () => {
              force = force === null ? true : force ? false : null;
            },
          },
        ],
      };
    },
  },

  // ── 언어별 글꼴 ──
  u73: {
    kind: '2d',
    caption: '언어마다 그 글자에 맞는 글꼴 — 제목 · 귀여운 · 손글씨 · 일본어 · 번체 · 간체 · 베트남어',
    make() {
      loadFonts();
      const L: [string, string, string, string][] = [
        ['한국어 · 제목', '"Black Han Sans"', '수학 놀이터', 'Black Han Sans'],
        ['한국어 · 귀여운', 'Jua', '수학 놀이터', 'Jua'],
        ['한국어 · 손글씨', '"Gowun Dodum"', '수학 검문소', 'Gowun Dodum'],
        ['日本語', '"Pretendard JP Variable", "Noto Sans JP"', 'すうがくひろば', 'Pretendard JP'],
        ['繁體中文', '"Noto Sans TC"', '數學遊樂場', 'Noto Sans TC'],
        ['简体中文', '"Noto Sans SC"', '数学游乐场', 'Noto Sans SC'],
        ['Tiếng Việt', '"Be Vietnam Pro"', 'Sân chơi Toán', 'Be Vietnam Pro'],
      ];
      const P = 2;
      return {
        draw(g, w, h, t) {
          stage(g, w, h, NAVY);
          const i = Math.floor(t / P) % L.length;
          const k = (t % P) / P;
          for (let s = 0; s < 30; s++) circle(g, (s * 53) % 320, (s * 37) % 200, 0.8 + (s % 3) * 0.4, `rgba(255,255,255,${0.2 + 0.2 * Math.sin(t * 2 + s)})`);
          const card = (j: number, dy: number, a: number): void => {
            const it = L[j]!;
            g.globalAlpha = a;
            box(g, 30, 34 + dy, 260, 104, 16, '#fffaf0', '#ffd36b', 3);
            txt(g, it[0], 160, 52 + dy, 10, '#8a6a2a', 'center', 800);
            txtFit(g, it[2], 160, 92 + dy, 40, 230, '#2a2f6a', j < 3 ? 400 : 700, `${it[1]}, system-ui, sans-serif`);
            pill(g, it[3], 160, 124 + dy, '#5b6cff', '#fff', 9);
            g.globalAlpha = 1;
          };
          const out = ease((k - 0.85) / 0.15);
          card(i, -out * 24, 1 - out);
          if (out > 0) card((i + 1) % L.length, (1 - out) * 24, out);
          L.forEach((_, j) => circle(g, 160 + (j - 3) * 14, 160, j === i ? 4.5 : 3, j === i ? '#ffd23f' : 'rgba(255,255,255,0.4)'));
          txt(g, '같은 화면, 언어마다 다른 글꼴', 160, 182, 10, '#cdd6ff', 'center', 700);
        },
      };
    },
  },

  // ── 10개 언어 ──
  u74: {
    kind: '2d',
    caption: "한국어 글 '시작하기' 가 열쇠 — 사전을 거쳐 같은 단추가 10개 언어로 바뀌어요",
    make() {
      let auto = true;
      let idx = 0;
      let last = 0;
      let bump = 0;
      return {
        draw(g, w, h, t, dt) {
          stage(g, w, h, SKY);
          if (auto && t - last > 1.4) {
            last = t;
            idx = (idx + 1) % LANGS.length;
            bump = 1;
          }
          bump = Math.max(0, bump - dt * 3);
          const [code, word] = LANGS[idx]!;
          // 열쇠
          box(g, 14, 16, 128, 26, 8, '#22305e');
          txt(g, "$t('시작하기')", 78, 29.5, 11, '#ffe28a', 'center', 700, MONO);
          arrow(g, 144, 29, 170, 29, '#3a4f8c', 2);
          // 사전 책
          box(g, 174, 12, 132, 36, 6, '#ff8a6b', '#c95a3a', 2);
          box(g, 180, 16, 120, 28, 4, '#fff6ec');
          txt(g, `사전 ko → ${code}`, 240, 25, 8.5, '#a04a2a', 'center', 800);
          txt(g, `'시작하기': '${word}'`, 240, 37, 8.5, '#3a2a1a', 'center', 700, F);
          arrow(g, 240, 50, 200, 66, '#3a4f8c', 2);
          // 큰 단추
          const s = 1 + bump * 0.12;
          g.save();
          g.translate(160, 96);
          g.scale(s, s);
          const gr = g.createLinearGradient(0, -24, 0, 24);
          gr.addColorStop(0, '#ffe066');
          gr.addColorStop(1, '#ffb22e');
          box(g, -88, -22, 176, 48, 24, '#d98a10');
          box(g, -88, -26, 176, 48, 24, gr, '#d98a10', 2);
          txtFit(g, word, 0, -1, 24, 150, '#5a3200', 800, `${F}`);
          g.restore();
          // 언어 칸
          LANGS.forEach(([c], j) => {
            const x = 16 + j * 29.2;
            const on = j === idx;
            box(g, x, 140, 25, 22, 6, on ? '#5b6cff' : '#ffffff', on ? '#3a49d8' : '#c8d6ee', 1.5);
            txt(g, c, x + 12.5, 151.5, 9.5, on ? '#fff' : '#5a6890', 'center', 800);
          });
          txt(g, '한국어 글 = 번역 열쇠 · 게임별 사전 · 일꾼 안에서도', 160, 182, 9.5, '#3a4f8c', 'center', 700);
        },
        controls: [
          {
            type: 'button',
            label: '다음 언어',
            on: () => {
              idx = (idx + 1) % LANGS.length;
              bump = 1;
            },
          },
          { type: 'toggle', label: '저절로 넘기기', value: true, on: (v) => (auto = v) },
        ],
      };
    },
  },

  // ── 언어별 링크 미리보기 ──
  u75: {
    kind: '2d',
    caption: '링크를 보내면 Cloudflare Worker 가 ?lang 에 맞는 제목 · 그림 태그를 붙여 미리보기 카드가 그 언어로',
    make() {
      const T: [string, string, string][] = [
        ['ko', '수학 놀이터', '놀면서 배우는 수학 게임'],
        ['en', 'Math Playground', 'Learn math by playing'],
        ['ja', 'すうがくひろば', 'あそんで学ぶ算数ゲーム'],
        ['zh', '数学乐园', '边玩边学的数学游戏'],
        ['es', 'Patio de Mates', 'Aprende jugando'],
        ['vi', 'Sân chơi Toán', 'Vừa chơi vừa học'],
      ];
      const P = 3;
      return {
        draw(g, w, h, t) {
          stage(g, w, h, MINT);
          const i = Math.floor(t / P) % T.length;
          const k = (t % P) / P;
          const [code, title, desc] = T[i]!;
          // 주소 쪽지
          const url = `mathmiri.com/?lang=${code}`;
          const typed = url.slice(0, Math.ceil(clamp(k / 0.25) * url.length));
          box(g, 10, 20, 132, 24, 12, '#fff', '#8ad0b4', 1.5);
          txt(g, typed, 20, 32.5, 8.5, '#1d6a52', 'left', 700, MONO);
          // 워커
          cloud(g, 76, 98, 34, '#ff9e3d');
          gear(g, 76, 96, 11, t * 2 * (k > 0.25 && k < 0.55 ? 1 : 0.2), '#fff4e2');
          txt(g, 'Cloudflare Worker', 76, 128, 8.5, '#a0520a', 'center', 800);
          const pk = clamp((k - 0.2) / 0.15);
          if (pk > 0 && pk < 1) circle(g, lerp(76, 76, pk), lerp(46, 80, pk), 4, '#1d6a52');
          line(g, 76, 46, 76, 74, '#1d6a52', 1.4, [3, 3]);
          if (k > 0.4) {
            g.globalAlpha = ease((k - 0.4) / 0.1);
            box(g, 14, 140, 124, 40, 6, '#22305e');
            txt(g, `<meta og:title`, 22, 152, 8, '#9ad0ff', 'left', 700, MONO);
            txtFit(g, `="${title}">`, 76, 168, 8.5, 110, '#ffe28a', 700, MONO);
            g.globalAlpha = 1;
          }
          arrow(g, 112, 98, 150, 98, '#1d6a52', 2, [4, 3]);
          // 대화 창
          phone(g, 158, 8, 150, 186, '#30364f');
          box(g, 166, 20, 90, 18, 9, '#e4e8f2');
          txt(g, '이 게임 해 봐!', 211, 29.5, 8.5, '#3a3f58', 'center', 700);
          const ck = ease((k - 0.5) / 0.15);
          if (ck > 0) {
            g.save();
            g.translate(233, 110);
            g.scale(0.8 + 0.2 * ck, 0.8 + 0.2 * ck);
            g.globalAlpha = ck;
            box(g, -66, -62, 132, 128, 10, '#fff', '#c9d4ea', 1.5);
            g.save();
            rr(g, -66, -62, 132, 64, 10);
            g.clip();
            const gr = g.createLinearGradient(0, -62, 0, 2);
            gr.addColorStop(0, '#6b8cff');
            gr.addColorStop(1, '#b8a2ff');
            g.fillStyle = gr;
            g.fillRect(-66, -62, 132, 64);
            circle(g, -36, -20, 14, '#ffd23f');
            box(g, 10, -36, 26, 26, 5, '#ff7a8a');
            star(g, 46, -10, 10, '#fff');
            g.restore();
            txtFit(g, title, 0, 14, 13, 120, '#22264a', 800);
            txtFit(g, desc, 0, 32, 9, 120, '#5a6080', 600);
            txt(g, 'mathmiri.com', 0, 50, 8, '#8a90a8', 'center', 600);
            g.restore();
            g.globalAlpha = 1;
          }
        },
      };
    },
  },

  // ── 효과음 12종 ──
  u76: {
    kind: '2d',
    caption: '효과음 12종 — 파일이 있으면 파일, 없으면 Web Audio 로 그 자리에서 합성 (자세히 보기 단추로 듣기)',
    make() {
      let active = 0;
      let flash = 0;
      let lastT = -1;
      const timers: number[] = [];
      return {
        draw(g, w, h, t, dt) {
          stage(g, w, h, NAVY);
          const ai = Math.floor(t / 0.9) % 12;
          if (ai !== lastT) {
            lastT = ai;
            active = ai;
            flash = 1;
          }
          flash = Math.max(0, flash - dt * 2);
          const synth = Math.floor(t / 5.4) % 2 === 1;
          SFX.forEach(([, label], i) => {
            const c = i % 4;
            const r = Math.floor(i / 4);
            const x = 10 + c * 46;
            const y = 22 + r * 56;
            const on = i === active;
            const s = on ? 1 + flash * 0.1 : 1;
            g.save();
            g.translate(x + 21, y + 24);
            g.scale(s, s);
            box(g, -21, -24, 42, 48, 9, on ? '#ffd23f' : '#38468c', on ? '#fff3b0' : '#4c5bab', 1.5);
            const type = SFX[i]![2];
            g.beginPath();
            for (let q = 0; q <= 24; q++) {
              const xx = -14 + q * (28 / 24);
              const yy = -6 + waveY(type, q / 8 + (on ? t * 2 : 0), i) * 7;
              if (q) g.lineTo(xx, yy);
              else g.moveTo(xx, yy);
            }
            g.strokeStyle = on ? '#7a3a00' : '#9ab0ff';
            g.lineWidth = 1.6;
            g.stroke();
            txt(g, label, 0, 13, 8.5, on ? '#4a2a00' : '#dfe6ff', 'center', 800);
            g.restore();
          });
          // 오른쪽: 지금 소리
          const [name, label, type] = SFX[active]!;
          box(g, 200, 14, 112, 172, 12, '#25306a', '#4c5bab', 1.5);
          txt(g, label, 256, 32, 15, '#ffd23f', 'center', 800, TF);
          // 파일 상자
          box(g, 212, 50, 88, 24, 6, synth ? '#3a4270' : '#2bb673');
          txt(g, `${name}.mp3`, 252, 62.5, 8.5, synth ? '#8a92b8' : '#fff', 'center', 700, MONO);
          if (synth) cross(g, 296, 52, 5);
          else check(g, 296, 52, 5, '#fff');
          arrow(g, 256, 78, 256, 92, synth ? '#ff9e3d' : '#2bb673', 2);
          box(g, 212, 96, 88, 22, 6, synth ? '#ff9e3d' : '#3a4270');
          txt(g, synth ? 'Web Audio 합성' : '파일 재생', 256, 107.5, 9, '#fff', 'center', 800);
          // 파형
          const amp = 0.3 + 0.7 * Math.exp(-((t % 0.9) / 0.3));
          g.beginPath();
          for (let q = 0; q <= 60; q++) {
            const xx = 208 + q * 1.6;
            const yy = 150 + waveY(type, q / 10 - t * 3, active) * 20 * amp * Math.sin((q / 60) * Math.PI);
            if (q) g.lineTo(xx, yy);
            else g.moveTo(xx, yy);
          }
          g.strokeStyle = '#7af0c8';
          g.lineWidth = 2;
          g.stroke();
          txt(g, synth ? `파형 ${type}` : '파일 소리', 256, 176, 8, '#9ab0ff', 'center', 700);
        },
        controls: [
          { type: 'button', label: '지금 소리 듣기', on: () => playSfx(SFX[active]![0]) },
          {
            type: 'button',
            label: '12종 차례로 듣기',
            on: () => {
              SFX.forEach(([n], i) =>
                timers.push(
                  window.setTimeout(() => {
                    active = i;
                    flash = 1;
                    playSfx(n);
                  }, i * 700),
                ),
              );
            },
          },
        ],
        dispose() {
          timers.forEach((x) => clearTimeout(x));
        },
      };
    },
  },

  // ── 배경음악 ──
  u77: {
    kind: '2d',
    caption: '게임을 열면 그 게임의 곡이 서서히 · 장면 신호에 곡 갈아 끼우기 · 탭을 숨기면 멈춤',
    make() {
      const P = 12;
      const vA = (x: number): number => (x < 1 ? 0 : x < 2 ? x - 1 : x < 4 ? 1 : x < 5 ? 5 - x : 0);
      const vB = (x: number): number => {
        let v = x < 4 ? 0 : x < 5 ? x - 4 : 1;
        if (x >= 7 && x < 9) v = Math.max(0, 1 - (x - 7) * 2);
        if (x >= 9 && x < 10) v = x - 9;
        if (x >= 11) v = Math.max(0, 1 - (x - 11) * 2);
        return v;
      };
      const EV: [number, string][] = [
        [1, '게임 열기'],
        [4, '장면 신호'],
        [7, '탭 숨김'],
        [9, '탭 보임'],
        [11, '닫기'],
      ];
      let rot = 0;
      return {
        draw(g, w, h, t, dt) {
          stage(g, w, h, PEACH);
          const x = t % P;
          const a = vA(x);
          const b = vB(x);
          const hidden = x >= 7 && x < 9;
          rot += dt * 3 * Math.max(a, b);
          // 게임 → 곡
          box(g, 12, 12, 92, 30, 8, '#fff', '#ffb27a', 1.5);
          txt(g, '수학 검문소', 58, 21, 9, '#8a4a1a', 'center', 800);
          txt(g, x < 4 ? '' : '· 3일차', 58, 33, 8, '#b06a2a', 'center', 700);
          arrow(g, 108, 27, 130, 27, '#c96a2a', 2);
          // 판
          const cur = b > a ? 'mystery' : 'quirky-fun';
          const col = b > a ? '#5b6cff' : '#ff7a3d';
          g.save();
          g.translate(170, 46);
          g.rotate(rot);
          circle(g, 0, 0, 30, '#2a2230');
          for (let r = 12; r < 29; r += 4) circle(g, 0, 0, r, null, 'rgba(255,255,255,0.12)', 1);
          circle(g, 0, 0, 11, col);
          circle(g, 0, -6, 2, '#fff');
          circle(g, 0, 0, 2, '#2a2230');
          g.restore();
          txt(g, cur, 170, 86, 9, col, 'center', 800, MONO);
          // 음표
          if (Math.max(a, b) > 0.05)
            for (let i = 0; i < 3; i++) {
              const k = (t * 0.6 + i / 3) % 1;
              g.globalAlpha = (1 - k) * Math.max(a, b);
              txt(g, '♪', 210 + k * 30, 40 - k * 26 + Math.sin(k * 8 + i) * 4, 13, col, 'center', 800);
              g.globalAlpha = 1;
            }
          // 탭
          box(g, 246, 14, 64, 44, 6, hidden ? '#d6d0cc' : '#fff', '#c9a88a', 1.5);
          box(g, 246, 14, 64, 10, 3, hidden ? '#b8b0aa' : '#ffcf9e');
          txt(g, hidden ? '탭 숨김' : '탭 보임', 278, 42, 9, hidden ? '#7a6f6a' : '#8a4a1a', 'center', 800);
          // 음량 그래프
          const gx = 18;
          const gy = 108;
          const gw = 286;
          const gh = 58;
          box(g, gx - 6, gy - 8, gw + 12, gh + 30, 8, '#fffaf4', '#f0c9a0', 1.2);
          for (const [fn, c] of [
            [vA, '#ff7a3d'],
            [vB, '#5b6cff'],
          ] as [(x: number) => number, string][]) {
            g.beginPath();
            for (let q = 0; q <= 120; q++) {
              const xx = (q / 120) * P;
              const yy = gy + gh - fn(xx) * gh;
              if (q) g.lineTo(gx + (xx / P) * gw, yy);
              else g.moveTo(gx, yy);
            }
            g.strokeStyle = c;
            g.lineWidth = 2.2;
            g.stroke();
          }
          for (const [ex, lab] of EV) {
            const px = gx + (ex / P) * gw;
            line(g, px, gy, px, gy + gh, 'rgba(120,80,40,0.3)', 1, [2, 2]);
            txt(g, lab, px, gy + gh + 11, 7.5, Math.abs(x - ex) < 0.8 ? '#c0400a' : '#9a7a5a', 'center', 800);
          }
          const px = gx + (x / P) * gw;
          line(g, px, gy - 4, px, gy + gh, '#2a2230', 2);
          circle(g, px, gy + gh - Math.max(a, b) * gh, 3.5, '#2a2230');
          txt(g, '음량', gx, gy - 1, 7.5, '#9a7a5a', 'left', 800);
        },
        controls: [
          {
            type: 'button',
            label: '곡 맛보기 (마림바)',
            on: () => {
              const notes = [523, 659, 784, 659, 880, 784, 659, 587, 523, 587, 659, 523];
              notes.forEach((f, i) => tone({ freq: f, dur: 0.35, type: 'sine', vol: 0.14, delay: i * 0.22 }));
              [262, 330, 220, 262].forEach((f, i) => tone({ freq: f, dur: 0.8, type: 'triangle', vol: 0.08, delay: i * 0.66 }));
            },
          },
        ],
      };
    },
  },

  // ── 읽어 주기 ──
  u78: {
    kind: '2d',
    caption: '게임 방법 책을 소리 내어 — 읽는 낱말이 차례로 밝아져요 (자세히 보기에서 「읽어 주기」)',
    make() {
      const LINES = ['주사위를 굴려요.', '나온 수만큼 앞으로 가요.', '먼저 도착하면 이겨요!'];
      const words: { s: string; li: number; ci: number }[] = [];
      let ci = 0;
      LINES.forEach((l, li) => {
        for (const s of l.split(' ')) {
          words.push({ s, li, ci });
          ci += s.length + 1;
        }
      });
      const full = LINES.join(' ');
      let spoken = -1;
      let speaking = false;
      const speak = (): void => {
        const ss = window.speechSynthesis;
        if (!ss) return;
        ss.cancel();
        const u = new SpeechSynthesisUtterance(full);
        u.lang = 'ko-KR';
        u.rate = 0.95;
        u.onstart = () => (speaking = true);
        u.onend = () => {
          speaking = false;
          spoken = -1;
        };
        u.onboundary = (e) => {
          let wi = 0;
          words.forEach((wd, i) => {
            if (wd.ci <= e.charIndex) wi = i;
          });
          spoken = wi;
        };
        ss.speak(u);
      };
      return {
        draw(g, w, h, t) {
          stage(g, w, h, PEACH);
          const n = words.length;
          const cyc = t % (n * 0.45 + 1.5);
          const cur = speaking && spoken >= 0 ? spoken : cyc < n * 0.45 ? Math.floor(cyc / 0.45) : -1;
          // 책
          box(g, 18, 34, 284, 150, 10, '#c9733a');
          box(g, 24, 38, 134, 140, 6, '#fffaf0');
          box(g, 162, 38, 134, 140, 6, '#fffaf0');
          line(g, 160, 38, 160, 178, '#d9b48a', 2);
          // 왼쪽 쪽 그림: 주사위 · 말
          g.save();
          g.translate(70, 104);
          g.rotate(Math.sin(t * 2) * 0.15);
          box(g, -20, -20, 40, 40, 8, '#fff', '#3a2a1a', 2);
          for (const [dx, dy] of [
            [-9, -9],
            [9, 9],
            [0, 0],
            [9, -9],
            [-9, 9],
          ] as [number, number][])
            circle(g, dx, dy, 3.2, '#e8453c');
          g.restore();
          circle(g, 120, 130, 13, '#7ac8ff', '#3a6a9a', 1.5);
          face(g, 120, 130, 11);
          txt(g, '게임 방법', 91, 56, 11, '#a0520a', 'center', 800, TF);
          // 오른쪽 쪽 글
          g.font = `700 11px ${F}`;
          let li = -1;
          let x = 0;
          words.forEach((wd, i) => {
            if (wd.li !== li) {
              li = wd.li;
              x = 172;
            }
            const y = 70 + wd.li * 30;
            g.font = `700 11px ${F}`;
            const ww = g.measureText(wd.s).width;
            if (x + ww > 290) {
              x = 172;
            }
            if (i === cur) box(g, x - 2, y - 9, ww + 4, 18, 5, '#ffd23f');
            txt(g, wd.s, x, y, 11, i < cur || cur < 0 ? '#3a2a1a' : i === cur ? '#5a2a00' : '#a89a8a', 'left', 700);
            x += ww + 5;
          });
          // 스피커
          box(g, 120, 6, 80, 24, 12, '#ff7a3d');
          speaker(g, 138, 18, 6, '#fff', cur >= 0 ? 3 : 0, t);
          txt(g, '읽어 주기', 170, 18.5, 9, '#fff', 'center', 800);
        },
        controls: [
          { type: 'button', label: '읽어 주기 (소리)', on: speak },
          {
            type: 'button',
            label: '멈추기',
            on: () => {
              window.speechSynthesis?.cancel();
              speaking = false;
            },
          },
        ],
        dispose() {
          if (speaking) window.speechSynthesis?.cancel();
        },
      };
    },
  },

  // ── 포인터 끌기 · 3D 고르기 ──
  u79: {
    kind: '2d',
    caption: '카메라에서 손가락 쪽으로 광선(Raycaster)을 쏘아 맞은 말을 고르고, 판 밖으로 나가도 끌기가 이어져요(setPointerCapture)',
    make() {
      const P = 6;
      const iso = (i: number, j: number): [number, number] => [170 + (i - j) * 22, 64 + (i + j) * 11];
      return {
        draw(g, w, h, t) {
          stage(g, w, h, SKY);
          const k = (t % P) / P;
          // 판 영역 (캔버스)
          box(g, 72, 40, 200, 140, 10, 'rgba(255,255,255,0.45)', '#7ab0e0', 1.5);
          txt(g, '게임 화면', 254, 50, 7.5, '#5a86b8', 'center', 800);
          for (let i = 0; i < 4; i++)
            for (let j = 0; j < 4; j++) {
              const [x, y] = iso(i, j);
              g.beginPath();
              g.moveTo(x, y - 11);
              g.lineTo(x + 22, y);
              g.lineTo(x, y + 11);
              g.lineTo(x - 22, y);
              g.closePath();
              g.fillStyle = (i + j) % 2 ? '#f4d9a8' : '#e6bf82';
              g.fill();
              g.strokeStyle = '#c9985a';
              g.lineWidth = 1;
              g.stroke();
            }
          // 말 위치: 0~0.25 다가감, 0.25~0.75 끌기, 0.75~ 놓음
          const from = iso(0.5, 1.5);
          const to = iso(2.5, 2.5);
          const outPt: [number, number] = [292, 120];
          let cur: [number, number];
          let piece: [number, number] = from;
          const dragK = clamp((k - 0.28) / 0.5);
          if (k < 0.25) cur = [lerp(30, from[0], ease(k / 0.25)), lerp(180, from[1] - 14, ease(k / 0.25))];
          else if (k < 0.78) {
            // 판 밖으로 한 번 나갔다가 돌아옴
            const p = dragK;
            const mid: [number, number] = p < 0.5 ? [lerp(from[0], outPt[0], ease(p * 2)), lerp(from[1], outPt[1], ease(p * 2))] : [lerp(outPt[0], to[0], ease(p * 2 - 1)), lerp(outPt[1], to[1], ease(p * 2 - 1))];
            cur = [mid[0], mid[1] - 14];
            piece = [clamp(mid[0], 120, 230), clamp(mid[1], 70, 150)];
          } else {
            cur = [to[0], to[1] - 14 - (k - 0.78) * 60];
            piece = to;
          }
          const held = k > 0.25 && k < 0.78;
          // 카메라와 광선
          box(g, 10, 14, 34, 22, 5, '#3a4266');
          circle(g, 34, 25, 7, '#7ab0ff', '#fff', 1.5);
          txt(g, '카메라', 27, 44, 8, '#3a4266', 'center', 800);
          if (k > 0.2 && k < 0.8) {
            g.globalAlpha = 0.9;
            line(g, 40, 26, piece[0], piece[1] - 8, '#ff5a8a', 2, [5, 3]);
            g.globalAlpha = 1;
            circle(g, piece[0], piece[1] - 8, 4, '#ff5a8a');
          }
          // 말
          circle(g, piece[0], piece[1] + 2, 12, 'rgba(0,0,0,0.15)');
          const lift = held ? 6 : 0;
          circle(g, piece[0], piece[1] - 6 - lift, 12, held ? '#ffd23f' : '#ff7a6b', '#a0402a', 2);
          face(g, piece[0], piece[1] - 6 - lift, 9);
          // 손가락
          g.save();
          g.translate(cur[0], cur[1]);
          if (held) circle(g, 0, 0, 10 + Math.sin(t * 10) * 2, 'rgba(255,90,138,0.25)');
          box(g, -4, 0, 8, 16, 4, '#ffd9c0', '#c9895a', 1.2);
          box(g, -7, 10, 14, 14, 5, '#ffd9c0', '#c9895a', 1.2);
          g.restore();
          if (held && cur[0] > 272) pill(g, '판 밖이어도 계속 잡힘', 250, 182, '#ff5a8a', '#fff', 8);
          else pill(g, held ? '끌기 중 · pointer capture' : k < 0.25 ? '광선으로 고르기' : '놓기 → 칸에 착', 172, 190, '#3a4f8c', '#fff', 8);
        },
      };
    },
  },

  // ── 키보드 · 휠 ──
  u80: {
    kind: '2d',
    caption: '방향키 · WASD 로 걷고 휠로 확대 — 자세히 보기에서 실제 키를 눌러 봐도 돼요',
    make() {
      const path = ['R', 'R', 'D', 'D', 'L', 'U', 'R', 'D', 'L', 'L', 'U', 'U'];
      let px = 1;
      let py = 1;
      let fx = 1;
      let fy = 1;
      let lastStep = 0;
      let step = 0;
      let lit = '';
      let litT = 0;
      let manualUntil = 0;
      let now = 0;
      const move = (d: string): void => {
        const nx = px + (d === 'R' ? 1 : d === 'L' ? -1 : 0);
        const ny = py + (d === 'D' ? 1 : d === 'U' ? -1 : 0);
        if (nx >= 0 && nx < 5 && ny >= 0 && ny < 4) {
          px = nx;
          py = ny;
        }
        lit = d;
        litT = 0.35;
      };
      const onKey = (e: KeyboardEvent): void => {
        const m: Record<string, string> = { ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R', w: 'U', s: 'D', a: 'L', d: 'R', W: 'U', S: 'D', A: 'L', D: 'R' };
        const d = m[e.key];
        if (!d) return;
        move(d);
        manualUntil = now + 3;
      };
      window.addEventListener('keydown', onKey);
      return {
        draw(g, w, h, t, dt) {
          now = t;
          stage(g, w, h, MINT);
          if (t > manualUntil && t - lastStep > 0.6) {
            lastStep = t;
            move(path[step % path.length]!);
            step++;
          }
          litT = Math.max(0, litT - dt);
          fx += (px - fx) * Math.min(1, dt * 12);
          fy += (py - fy) * Math.min(1, dt * 12);
          // 키
          const key = (x: number, y: number, s: string, d: string): void => {
            const on = litT > 0 && lit === d;
            box(g, x, y + 3, 26, 24, 6, '#9ab8a8');
            box(g, x, y + (on ? 3 : 0), 26, 24, 6, on ? '#ffd23f' : '#fff', '#7aa894', 1.5);
            txt(g, s, x + 13, y + 12.5 + (on ? 3 : 0), 11, '#2a5a48', 'center', 800);
          };
          key(44, 32, '↑', 'U');
          key(14, 60, '←', 'L');
          key(44, 60, '↓', 'D');
          key(74, 60, '→', 'R');
          key(44, 104, 'W', 'U');
          key(14, 132, 'A', 'L');
          key(44, 132, 'S', 'D');
          key(74, 132, 'D', 'R');
          txt(g, '또는', 57, 96, 8, '#5a8a78', 'center', 700);
          // 휠 확대
          const zoom = 0.85 + 0.25 * (0.5 + 0.5 * Math.sin(t * 0.8));
          const wheelOn = Math.cos(t * 0.8);
          box(g, 112, 132, 22, 34, 11, '#fff', '#7aa894', 1.5);
          box(g, 120, 138, 6, 10, 3, Math.abs(wheelOn) > 0.3 ? '#ff7a3d' : '#cfe0d8');
          txt(g, wheelOn > 0 ? '확대' : '축소', 123, 176, 8, '#2a5a48', 'center', 800);
          // 판
          g.save();
          g.translate(228, 96);
          g.scale(zoom, zoom);
          const S = 30;
          const ox = -S * 2.5;
          const oy = -S * 2;
          box(g, ox - 6, oy - 6, S * 5 + 12, S * 4 + 12, 10, '#7ac87a');
          for (let i = 0; i < 5; i++)
            for (let j = 0; j < 4; j++) box(g, ox + i * S + 1, oy + j * S + 1, S - 2, S - 2, 5, (i + j) % 2 ? '#bfeab0' : '#d4f5c4');
          const cx = ox + fx * S + S / 2;
          const cy = oy + fy * S + S / 2;
          const hop = Math.abs(Math.sin((t - lastStep) * 8)) * (litT > 0 ? 4 : 0);
          circle(g, cx, cy + 9, 9, 'rgba(0,0,0,0.15)');
          circle(g, cx, cy - hop, 11, '#ff7a6b', '#a0402a', 1.6);
          box(g, cx - 12, cy - 14 - hop, 24, 6, 3, '#e8453c');
          face(g, cx, cy + 1 - hop, 8);
          g.restore();
        },
        dispose() {
          window.removeEventListener('keydown', onKey);
        },
      };
    },
  },

  // ── FrameGate ──
  u81: {
    kind: '2d',
    caption: '위: 늘 그리기 — 칸마다 그림 · 아래: FrameGate — 말이 움직일 때만 그려서 배터리가 덜 닳아요',
    make() {
      const moving = (x: number): boolean => x % 1.8 < 0.55;
      return {
        draw(g, w, h, t) {
          stage(g, w, h, NAVY);
          // 미니 판
          box(g, 12, 12, 96, 96, 8, '#e6bf82');
          for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) box(g, 16 + i * 22, 16 + j * 22, 20, 20, 3, (i + j) % 2 ? '#f4d9a8' : '#d7a868');
          const hop = Math.floor(t / 1.8);
          const k = clamp((t % 1.8) / 0.55);
          const a = hop % 4;
          const b = (hop + 1) % 4;
          const px = lerp(a, b, ease(k));
          circle(g, 27 + px * 22, 82 - Math.sin(ease(k) * Math.PI) * 10, 8, '#ff7a6b', '#a0402a', 1.5);
          txt(g, moving(t) ? '움직이는 중' : '가만히', 60, 118, 9, moving(t) ? '#ffd23f' : '#9ab0ff', 'center', 800);
          // 줄
          const N = 22;
          const fps = 12;
          const f0 = Math.floor(t * fps);
          const lanes: [string, number, boolean][] = [
            ['늘 그리기', 30, false],
            ['FrameGate', 106, true],
          ];
          let drawnGate = 0;
          for (let i = 0; i < 60; i++) if (moving((f0 - i) / fps)) drawnGate++;
          for (const [name, y, gate] of lanes) {
            txt(g, name, 120, y - 6, 9.5, gate ? '#7af0c8' : '#ffb2a8', 'left', 800);
            for (let i = 0; i < N; i++) {
              const fi = f0 - (N - 1 - i);
              const draw = !gate || moving(fi / fps);
              const x = 120 + i * 8.5;
              box(g, x, y + 2, 7, 26, 2, draw ? (gate ? '#3ccf7a' : '#ff7a6b') : 'rgba(255,255,255,0.12)');
              if (i === N - 1) box(g, x - 1, y + 1, 9, 28, 2, null, '#fff', 1.2);
            }
            const lvl = gate ? 1 - ((t % 24) / 24) * 0.3 : 1 - ((t % 24) / 24) * 0.92;
            battery(g, 120, y + 40, 46, 16, lvl);
            txt(g, gate ? `최근 60칸 중 ${drawnGate}번 그림` : '최근 60칸 중 60번 그림', 172, y + 48, 8.5, '#cdd6ff', 'left', 700);
          }
          txt(g, '값이 바뀔 때만 그린다', 60, 150, 9.5, '#fff', 'center', 800);
          txt(g, '말 위치 · 카메라 ·', 60, 166, 8, '#9ab0ff', 'center', 700);
          txt(g, '애니메이션을 지켜봐요', 60, 178, 8, '#9ab0ff', 'center', 700);
        },
      };
    },
  },

  // ── Web Worker ──
  u82: {
    kind: '2d',
    caption: '왼쪽: AI 가 화면 줄에서 생각하면 화면이 멈춤 · 오른쪽: 일꾼 줄로 보내면 화면은 계속 부드럽게',
    make() {
      const P = 5;
      let angA = 0;
      let angB = 0;
      return {
        draw(g, w, h, t, dt) {
          stage(g, w, h, NAVY);
          const x = t % P;
          const busy = x > 1.2 && x < 3.2;
          if (!busy) angA += dt * 5;
          angB += dt * 5;
          const panel = (ox: number, worker: boolean): void => {
            box(g, ox, 10, 150, 180, 12, worker ? '#26406a' : '#3a2a5a', worker ? '#3ccf7a' : '#ff7a6b', 1.5);
            txt(g, worker ? '일꾼과 함께' : '일꾼 없이', ox + 75, 24, 11, worker ? '#7af0c8' : '#ffb2a8', 'center', 800, TF);
            // 화면
            box(g, ox + 40, 36, 70, 56, 8, '#fdfbff');
            const ang = worker ? angB : angA;
            for (let i = 0; i < 8; i++) {
              const a = ang + (i / 8) * Math.PI * 2;
              circle(g, ox + 75 + Math.cos(a) * 14, 64 + Math.sin(a) * 14, 2 + (i / 8) * 2.5, `hsl(${(i * 40) % 360},80%,60%)`);
            }
            if (!worker && busy) {
              g.globalAlpha = 0.85;
              box(g, ox + 40, 36, 70, 56, 8, 'rgba(60,60,80,0.35)');
              txt(g, '멈춤!', ox + 75, 64, 12, '#ff4a4a', 'center', 900);
              g.globalAlpha = 1;
            }
            // 줄
            const lane = (ly: number, label: string): void => {
              txt(g, label, ox + 8, ly + 8, 8, '#cdd6ff', 'left', 700);
              box(g, ox + 40, ly, 104, 16, 4, 'rgba(255,255,255,0.08)');
            };
            const tx = (s: number): number => ox + 40 + (s / P) * 104;
            lane(104, '화면 줄');
            lane(134, '일꾼 줄');
            for (let s = 0; s < P; s += 0.25) {
              const inBusy = s > 1.2 && s < 3.2;
              if (worker || !inBusy) box(g, tx(s) + 0.5, 106, 4, 12, 1.5, '#3ccf7a');
            }
            if (!worker) {
              box(g, tx(1.2), 105, tx(3.2) - tx(1.2), 14, 3, '#ff7a6b');
              txt(g, 'AI 생각', (tx(1.2) + tx(3.2)) / 2, 112.5, 8, '#fff', 'center', 800);
              txt(g, '(비어 있음)', ox + 92, 142.5, 7.5, '#6a76a8', 'center', 700);
            } else {
              box(g, tx(1.2), 135, tx(3.2) - tx(1.2), 14, 3, '#a87aff');
              txt(g, 'AI 생각', (tx(1.2) + tx(3.2)) / 2, 142.5, 8, '#fff', 'center', 800);
              arrow(g, tx(1.2), 119, tx(1.2), 134, '#ffd23f', 1.4);
              arrow(g, tx(3.2), 134, tx(3.2), 119, '#ffd23f', 1.4);
            }
            line(g, tx(x), 100, tx(x), 154, '#fff', 1.5);
            txt(g, worker ? 'postMessage 로 주고받기' : '그동안 손가락도 안 먹힘', ox + 75, 170, 8, worker ? '#7af0c8' : '#ffb2a8', 'center', 700);
          };
          panel(8, false);
          panel(162, true);
        },
      };
    },
  },

  // ── Capacitor · 진동 ──
  u83: {
    kind: '2d',
    caption: '같은 웹 게임을 앱 껍데기(Capacitor)가 감싸 진동 · 저장 · 광고(앱만) 같은 폰 기능을 이어 줘요',
    make() {
      const P = 7.5;
      const ITEMS: [string, string][] = [
        ['진동', '#ff7a6b'],
        ['저장', '#5b6cff'],
        ['광고 (앱만)', '#ffb22e'],
      ];
      return {
        draw(g, w, h, t) {
          stage(g, w, h, MINT);
          const x = t % P;
          const cur = Math.floor(x / 2.5);
          const k = (x % 2.5) / 2.5;
          // 웹판
          box(g, 10, 30, 76, 120, 8, '#fff', '#9ac4b4', 1.5);
          box(g, 10, 30, 76, 14, 4, '#d4eee4');
          txt(g, 'mathmiri.com', 48, 37.5, 7, '#3a6a5a', 'center', 700);
          box(g, 20, 54, 56, 56, 6, '#ffe8b8');
          circle(g, 48, 82, 14, '#ff9a6b');
          face(g, 48, 82, 10);
          txt(g, '웹판', 48, 132, 10, '#2a5a48', 'center', 800);
          txt(g, '같은 코드', 48, 162, 8.5, '#2a5a48', 'center', 700);
          arrow(g, 90, 90, 112, 90, '#2a5a48', 2);
          // 껍데기
          box(g, 116, 8, 110, 184, 22, 'rgba(91,108,255,0.12)', '#5b6cff', 2);
          txt(g, 'Capacitor 껍데기', 171, 18, 8, '#3a49d8', 'center', 800);
          const shake = cur === 0 && k > 0.35 && k < 0.8 ? Math.sin(t * 70) * 2.5 : 0;
          g.save();
          g.translate(shake, 0);
          phone(g, 130, 26, 82, 156);
          box(g, 140, 50, 62, 62, 6, '#ffe8b8');
          circle(g, 171, 81, 15, '#ff9a6b');
          face(g, 171, 81, 11);
          if (cur === 2) {
            const s = ease((k - 0.35) / 0.15);
            box(g, 136, 176 - s * 24, 70, 18, 4, '#ffb22e');
            txt(g, '광고', 171, 185 - s * 24, 8, '#fff', 'center', 800);
          }
          g.restore();
          if (shake) {
            for (const sd of [-1, 1]) for (let i = 0; i < 2; i++) line(g, 171 + sd * (48 + i * 6), 70, 171 + sd * (48 + i * 6), 110, '#ff7a6b', 2);
          }
          // 기능
          ITEMS.forEach(([n, c], i) => {
            const y = 40 + i * 48;
            const on = i === cur;
            box(g, 238, y, 74, 34, 9, on ? c : '#fff', c, 1.8);
            txt(g, n, 275, y + 17.5, 10, on ? '#fff' : c, 'center', 800);
            if (on && k < 0.4) {
              const p = ease(k / 0.35);
              circle(g, lerp(216, 238, 1 - p), y + 17, 4, c);
            }
          });
          if (cur === 1 && k > 0.35) {
            const p = ease((k - 0.35) / 0.3);
            box(g, 152, 120, 38, 14, 3, '#e4e8ff', '#5b6cff', 1);
            box(g, 153, 121, 36 * p, 12, 2, '#5b6cff');
            txt(g, '기록', 171, 140, 7.5, '#3a49d8', 'center', 800);
          }
        },
      };
    },
  },

  // ── 서비스 워커 ──
  u84: {
    kind: '2d',
    caption: '처음 한 번 목록대로 미리 받아 두면(위) 인터넷이 끊겨도 서비스 워커가 창고에서 꺼내 줘요(아래)',
    make() {
      const P = 10;
      const FILES = ['index.html', 'app.js', 'style.css', 'logo.png', 'sfx.mp3'];
      return {
        draw(g, w, h, t) {
          stage(g, w, h, SKY);
          const x = t % P;
          const online = x < 5;
          // 화면
          box(g, 8, 40, 70, 90, 8, '#fff', '#7ab0e0', 1.5);
          box(g, 8, 40, 70, 12, 4, '#d8eaff');
          const ok = online ? x > 3.4 : true;
          if (ok) {
            circle(g, 43, 86, 16, '#ffd23f');
            face(g, 43, 86, 12);
          } else txt(g, '불러오는 중', 43, 86, 8, '#7a8ab0', 'center', 700);
          txt(g, '게임 화면', 43, 140, 9, '#2a4a7a', 'center', 800);
          // 워커
          gear(g, 140, 60, 18, t * (online ? 1 : 2), '#5b6cff');
          txt(g, '서비스 워커', 140, 87, 9, '#3a49d8', 'center', 800);
          // 창고
          box(g, 104, 112, 74, 76, 8, '#fff6e0', '#e2ae3c', 1.5);
          txt(g, '창고 (캐시)', 141, 122, 8.5, '#8a5b10', 'center', 800);
          const stored = online ? Math.min(FILES.length, Math.floor(x / 0.6)) : FILES.length;
          for (let i = 0; i < stored; i++) {
            box(g, 110, 130 + i * 11, 62, 9, 3, '#ffe08f');
            txt(g, FILES[i]!, 141, 135 + i * 11, 6.5, '#6a4a10', 'center', 700, MONO);
          }
          // 인터넷
          cloud(g, 266, 64, 34, online ? '#9ad0ff' : '#cfd6e2');
          txt(g, '인터넷', 266, 70, 9, online ? '#1a4a8a' : '#8a92a8', 'center', 800);
          if (!online) cross(g, 266, 44, 8);
          // 와이파이 표시
          pill(g, online ? '와이파이 켬 · 미리 받기' : '와이파이 끔 · 오프라인', 160, 14, online ? '#2bb673' : '#ff5a5a', '#fff', 9);
          line(g, 80, 70, 120, 62, '#7ab0e0', 2);
          line(g, 160, 60, 230, 62, online ? '#7ab0e0' : '#cfd6e2', 2, online ? undefined : [3, 4]);
          line(g, 140, 95, 140, 111, '#e2ae3c', 2);
          // 흐르는 짐
          if (online && stored < FILES.length) {
            const p = (x % 0.6) / 0.6;
            const px = p < 0.6 ? lerp(240, 150, p / 0.6) : 150 - 10 * 0;
            const py = p < 0.6 ? 62 : lerp(70, 128 + stored * 11, (p - 0.6) / 0.4);
            box(g, px - 14, py - 5, 28, 10, 3, '#ffe08f', '#e2ae3c', 1);
          }
          if (!online) {
            const p = (x % 1.25) / 1.25;
            const pts: [number, number][] = [
              [78, 70],
              [140, 60],
              [140, 130],
              [140, 60],
              [78, 70],
            ];
            const seg = Math.min(3, Math.floor(p * 4));
            const q = p * 4 - seg;
            const a = pts[seg]!;
            const b = pts[seg + 1]!;
            circle(g, lerp(a[0], b[0], q), lerp(a[1], b[1], q), 4.5, seg < 2 ? '#5b6cff' : '#2bb673');
            if (seg >= 2) check(g, 96, 52, 5);
          }
        },
      };
    },
  },

  // ── Firebase ──
  u85: {
    kind: '2d',
    caption: '익명 로그인한 두 사람의 수가 실시간 DB 를 거쳐 서로의 판에 바로 — 앱 체크가 진짜 앱인지 확인',
    make() {
      const MOVES = [4, 0, 2, 6, 3, 5, 1, 7, 8];
      const P = 1.1;
      return {
        draw(g, w, h, t) {
          stage(g, w, h, PEACH);
          const total = MOVES.length * P + 2.5;
          const x = t % total;
          const n = Math.min(MOVES.length, Math.floor(x / P));
          const k = (x % P) / P;
          const board = (ox: number, label: string, id: string, col: string, upto: number): void => {
            phone(g, ox, 26, 78, 150);
            txt(g, label, ox + 39, 44, 9, col, 'center', 800);
            pill(g, id, ox + 39, 58, '#eef0f8', '#5a6080', 7);
            for (let i = 0; i < 9; i++) {
              const bx = ox + 9 + (i % 3) * 21;
              const by = 72 + Math.floor(i / 3) * 21;
              box(g, bx, by, 19, 19, 4, '#f2f4fa');
              const mi = MOVES.indexOf(i);
              if (mi >= 0 && mi < upto) {
                if (mi % 2 === 0) circle(g, bx + 9.5, by + 9.5, 6, null, '#ff7a6b', 2.6);
                else cross(g, bx + 9.5, by + 9.5, 4.5, '#5b6cff');
              }
            }
          };
          // 각 판은 자기 수를 바로, 상대 수는 DB 를 거친 뒤
          const mover = n % 2; // 0 = 왼쪽
          const arrived = n < MOVES.length && k > 0.7 ? 1 : 0;
          const leftUp = n + (mover === 1 ? arrived : 0) + (mover === 0 && n < MOVES.length ? 1 : 0);
          const rightUp = n + (mover === 0 ? arrived : 0) + (mover === 1 && n < MOVES.length ? 1 : 0);
          board(8, '나', '익명 #7f3a', '#ff7a6b', Math.min(MOVES.length, leftUp));
          board(234, '친구', '익명 #c21e', '#5b6cff', Math.min(MOVES.length, rightUp));
          // DB
          cloud(g, 160, 76, 40, '#ffcf5a', '#e2ae3c');
          txt(g, '실시간 DB', 160, 80, 10, '#7a4a00', 'center', 800);
          // 방패
          g.beginPath();
          g.moveTo(160, 120);
          g.lineTo(176, 126);
          g.quadraticCurveTo(176, 146, 160, 154);
          g.quadraticCurveTo(144, 146, 144, 126);
          g.closePath();
          g.fillStyle = '#2bb673';
          g.fill();
          check(g, 160, 136, 5, '#fff');
          txt(g, '앱 체크', 160, 166, 8.5, '#1a7a4a', 'center', 800);
          if (n < MOVES.length) {
            const fromX = mover === 0 ? 86 : 234;
            const toX = mover === 0 ? 234 : 86;
            const p = k < 0.35 ? k / 0.35 : k < 0.45 ? 1 : (k - 0.45) / 0.3;
            const [ax, ay, bx, by] = k < 0.45 ? [fromX, 100, 160, 76] : [160, 76, toX, 100];
            if (k < 0.75) circle(g, lerp(ax, bx, clamp(p)), lerp(ay, by, clamp(p)) - Math.sin(clamp(p) * Math.PI) * 14, 5, mover === 0 ? '#ff7a6b' : '#5b6cff', '#fff', 1.5);
          } else {
            box(g, 112, 22, 96, 30, 8, '#fff', '#e2ae3c', 1.5);
            txt(g, '순위 1 · 나 1,240점', 160, 37, 8.5, '#7a4a00', 'center', 800);
          }
          pill(g, '두 폰이 같은 판을 봐요', 160, 188, '#ff7a3d', '#fff', 8);
        },
      };
    },
  },

  // ── 접근성 ──
  u86: {
    kind: '2d',
    caption: '왼쪽 보통 · 오른쪽 「움직임 줄이기」 켠 기기 — 튀고 도는 대신 살짝 나타나기만, 단추 이름은 화면 읽기가 소리로',
    make() {
      return {
        draw(g, w, h, t) {
          stage(g, w, h, SKY);
          const half = (ox: number, reduce: boolean): void => {
            box(g, ox, 10, 148, 134, 12, '#fff', reduce ? '#2bb673' : '#ff9e3d', 2);
            txt(g, reduce ? '움직임 줄이기' : '보통', ox + 74, 24, 10, reduce ? '#1a7a4a' : '#c0600a', 'center', 800, TF);
            // 공
            const by = reduce ? 66 : 66 - Math.abs(Math.sin(t * 4)) * 22;
            const ba = reduce ? 0.5 + 0.5 * pingpong(t, 3) : 1;
            g.globalAlpha = ba;
            circle(g, ox + 34, by, 13, '#ff7a6b');
            face(g, ox + 34, by, 9);
            g.globalAlpha = 1;
            // 별
            star(g, ox + 76, 60, 13, '#ffd23f', reduce ? 0 : t * 3, '#d9a010');
            // 카드
            const cx = reduce ? 0 : Math.sin(t * 2.5) * 10;
            g.globalAlpha = reduce ? 0.6 + 0.4 * pingpong(t + 1, 3) : 1;
            box(g, ox + 104 + cx, 46, 30, 38, 5, '#9ac4ff', '#5b6cff', 1.5);
            g.globalAlpha = 1;
            txt(g, reduce ? '살짝 흐려졌다 또렷하게' : '통통 · 빙글 · 흔들', ox + 74, 98, 8.5, '#5a6080', 'center', 700);
            // 단추 셋 + 초점
            const fi = Math.floor(t / 1.2) % 3;
            ['시작', '규칙', '소리'].forEach((s, i) => {
              const bx = ox + 10 + i * 45;
              box(g, bx, 110, 40, 22, 8, '#5b6cff');
              txt(g, s, bx + 20, 121.5, 9, '#fff', 'center', 800);
              if (i === fi) box(g, bx - 3, 107, 46, 28, 10, null, '#ffb22e', 2.5);
            });
          };
          half(8, false);
          half(164, true);
          // 화면 읽기
          const fi = Math.floor(t / 1.2) % 3;
          const names = ['시작하기', '게임 방법 보기', '소리 켜기'];
          box(g, 40, 152, 240, 34, 17, '#22305e');
          speaker(g, 62, 169, 6, '#ffd23f', 2, t);
          txt(g, `화면 읽기: 「${names[fi]}, 단추」`, 172, 169.5, 10, '#fff', 'center', 700);
          txt(g, 'aria-label', 244, 147, 7.5, '#3a4f8c', 'center', 700, MONO);
        },
      };
    },
  },

  // ── 기술 스튜디오 ──
  u87: {
    kind: '2d',
    caption: '이 페이지 자체 — 카드마다 견본이 움직이고, 누르면 크게 보며 조절판으로 값을 바꿔 비교',
    make() {
      const P = 8;
      const mini = (g: G, x: number, y: number, w: number, h: number, kind: number, t: number, amp = 1): void => {
        g.save();
        rr(g, x, y, w, h, 4);
        g.clip();
        const bgc = ['#2e3d80', '#ffe1c8', '#c9f3e4', '#b8e1ff', '#3a2a5a', '#fff2b8', '#ffd0e0', '#d8d0ff'][kind]!;
        g.fillStyle = bgc;
        g.fillRect(x, y, w, h);
        const cx = x + w / 2;
        const cy = y + h / 2;
        const s = Math.min(w, h);
        switch (kind) {
          case 0:
            for (let i = 0; i < 6; i++) circle(g, cx + Math.cos(t + i) * s * 0.3, cy + Math.sin(t * 1.3 + i) * s * 0.25, s * 0.06, '#ffd23f');
            break;
          case 1:
            g.beginPath();
            for (let q = 0; q <= 20; q++) g.lineTo(x + (q / 20) * w, cy + Math.sin(q / 3 + t * 3) * s * 0.25 * amp);
            g.strokeStyle = '#ff7a3d';
            g.lineWidth = s * 0.06;
            g.stroke();
            break;
          case 2:
            for (let i = 0; i < 4; i++) {
              const bh = (0.3 + 0.5 * pingpong(t + i * 0.3, 2)) * h * 0.7;
              g.fillStyle = '#2bb673';
              g.fillRect(x + w * (0.15 + i * 0.19), y + h * 0.9 - bh, w * 0.13, bh);
            }
            break;
          case 3:
            g.save();
            g.translate(cx, cy);
            g.rotate(t);
            box(g, -s * 0.22, -s * 0.22, s * 0.44, s * 0.44, s * 0.06, '#5b6cff');
            g.restore();
            break;
          case 4:
            circle(g, cx, cy, s * (0.15 + 0.12 * pingpong(t, 1.5)), '#ff7af0');
            break;
          case 5:
            star(g, cx, cy, s * 0.3, '#ffb22e', t);
            break;
          case 6:
            circle(g, cx, cy, s * 0.28, '#ff7a8a');
            face(g, cx, cy, s * 0.22);
            break;
          default:
            for (let i = 0; i < 3; i++) circle(g, cx, cy, s * (0.1 + ((t * 0.5 + i / 3) % 1) * 0.35), null, '#7a5af5', 1.5);
        }
        g.restore();
      };
      return {
        draw(g, w, h, t) {
          stage(g, w, h, ['#f2f4fb', '#e4e8f4']);
          const x = t % P;
          txt(g, '기술 스튜디오', 14, 14, 11, '#2a2f6a', 'left', 800, TF);
          ['전체', '빛', '재질', '시스템'].forEach((s, i) => pill(g, s, 140 + i * 38, 14, i === 3 ? '#5b6cff' : '#fff', i === 3 ? '#fff' : '#5a6080', 7.5));
          const pick = 5;
          for (let i = 0; i < 8; i++) {
            const cx = 12 + (i % 4) * 76;
            const cy = 30 + Math.floor(i / 4) * 82;
            box(g, cx, cy, 70, 76, 7, '#fff', i === pick && x > 1.4 && x < 2 ? '#5b6cff' : '#d5dbea', i === pick && x > 1.4 ? 2 : 1);
            mini(g, cx + 4, cy + 4, 62, 48, i, t + i);
            box(g, cx + 6, cy + 58, 40, 5, 2, '#c9cfe2');
            box(g, cx + 6, cy + 66, 26, 4, 2, '#dde2ef');
          }
          // 손가락이 다가가 누른다
          const target: [number, number] = [12 + 1 * 76 + 35, 30 + 82 + 30];
          const pz = ease((x - 2) / 0.6);
          if (x < 2.2) {
            const p = ease(x / 1.4);
            const fx = lerp(290, target[0], p);
            const fy = lerp(190, target[1], p);
            if (x > 1.4) circle(g, target[0], target[1], 6 + (x - 1.4) * 20, `rgba(91,108,255,${0.5 - (x - 1.4) * 0.6})`);
            box(g, fx - 4, fy, 8, 14, 4, '#ffd9c0', '#c9895a', 1.2);
            box(g, fx - 7, fy + 9, 14, 12, 5, '#ffd9c0', '#c9895a', 1.2);
          }
          // 크게 보기
          const out = x > P - 0.6 ? ease((x - (P - 0.6)) / 0.5) : 0;
          const a = pz * (1 - out);
          if (a > 0.01) {
            g.globalAlpha = a;
            g.fillStyle = 'rgba(30,36,70,0.55)';
            g.fillRect(-2000, -2000, 4000, 4000);
            const s = lerp(0.3, 1, a);
            g.save();
            g.translate(160, 104);
            g.scale(s, s);
            box(g, -140, -86, 280, 172, 12, '#fff');
            const amp = 0.3 + 0.7 * pingpong(t * 0.6, 2);
            mini(g, -130, -76, 170, 152, 1, t, amp);
            txt(g, '조절', 75, -66, 10, '#2a2f6a', 'center', 800);
            ['물결 높이', '빠르기'].forEach((lab, i) => {
              const yy = -40 + i * 40;
              txt(g, lab, 52, yy, 8.5, '#5a6080', 'left', 700);
              box(g, 52, yy + 10, 76, 5, 2.5, '#dde2ef');
              const v = i === 0 ? amp : 0.6;
              box(g, 52, yy + 10, 76 * v, 5, 2.5, '#5b6cff');
              circle(g, 52 + 76 * v, yy + 12.5, 5, '#fff', '#5b6cff', 2);
            });
            box(g, 52, 50, 76, 20, 6, '#eef0f8');
            txt(g, '켜기 ◯ 끄기', 90, 60, 8, '#5a6080', 'center', 700);
            g.restore();
            g.globalAlpha = 1;
          }
        },
      };
    },
  },

  // ── 게임 AI ──
  u88: {
    kind: '2d',
    caption: '미니맥스 — 끝 점수에서 위로: 내 차례(▲)는 큰 값, 상대(▼)는 작은 값. 알파베타는 볼 필요 없는 가지를 잘라요(✂)',
    make() {
      let ab = true;
      let speed = 1;
      let leaves: number[] = [];
      type Ev = { n: number; v?: number; prune?: boolean };
      let events: Ev[] = [];
      let start = -100;
      let seed = 3;
      const kids = (n: number): [number, number] => [2 * n + 1, 2 * n + 2];
      const depthOf = (n: number): number => Math.floor(Math.log2(n + 1));
      const sub = (n: number, out: number[]): void => {
        out.push(n);
        if (depthOf(n) < 3) for (const c of kids(n)) sub(c, out);
      };
      const run = (n: number, a: number, b: number, ev: Ev[]): number => {
        const d = depthOf(n);
        if (d === 3) {
          const v = leaves[n - 7]!;
          ev.push({ n, v });
          return v;
        }
        const max = d % 2 === 0;
        let v = max ? -99 : 99;
        const [c1, c2] = kids(n);
        for (const c of [c1, c2]) {
          if (ab && a >= b) {
            const all: number[] = [];
            sub(c, all);
            for (const q of all) ev.push({ n: q, prune: true });
            continue;
          }
          const cv = run(c, a, b, ev);
          if (max) {
            v = Math.max(v, cv);
            a = Math.max(a, v);
          } else {
            v = Math.min(v, cv);
            b = Math.min(b, v);
          }
        }
        ev.push({ n, v });
        return v;
      };
      const reset = (t: number): void => {
        const R = rnd(seed++ * 7919);
        leaves = Array.from({ length: 8 }, () => 1 + Math.floor(R() * 9));
        events = [];
        run(0, -99, 99, events);
        start = t;
      };
      const pos = (n: number): [number, number] => {
        const d = depthOf(n);
        const i = n - (2 ** d - 1);
        const cnt = 2 ** d;
        return [20 + ((i + 0.5) / cnt) * 280, 30 + d * 44];
      };
      return {
        draw(g, w, h, t) {
          stage(g, w, h, NAVY);
          const step = 0.42 / speed;
          if (t - start > events.length * step + 2.5 || t < start) reset(t);
          const shown = Math.floor((t - start) / step);
          const val = new Map<number, number>();
          const pruned = new Set<number>();
          events.slice(0, shown).forEach((e) => {
            if (e.prune) pruned.add(e.n);
            else if (e.v !== undefined) val.set(e.n, e.v);
          });
          const curE = events[Math.min(shown, events.length - 1)];
          const done = shown >= events.length;
          // 최선 길
          const best = new Set<number>();
          if (done) {
            let n = 0;
            best.add(0);
            while (depthOf(n) < 3) {
              const [c1, c2] = kids(n);
              n = val.get(c1) === val.get(n) && !pruned.has(c1) ? c1 : c2;
              best.add(n);
            }
          }
          for (let n = 0; n < 7; n++)
            for (const c of kids(n)) {
              const [x1, y1] = pos(n);
              const [x2, y2] = pos(c);
              const on = best.has(n) && best.has(c);
              line(g, x1, y1, x2, y2, pruned.has(c) ? 'rgba(255,255,255,0.12)' : on ? '#ffd23f' : 'rgba(180,195,255,0.5)', on ? 3 : 1.6, pruned.has(c) ? [3, 3] : undefined);
              if (pruned.has(c) && !pruned.has(n)) txt(g, '✂', (x1 + x2) / 2, (y1 + y2) / 2, 11, '#ff7a8a', 'center', 800);
            }
          for (let n = 0; n < 15; n++) {
            const [x, y] = pos(n);
            const d = depthOf(n);
            const pr = pruned.has(n);
            const v = val.get(n);
            const isCur = curE && !done && curE.n === n;
            const r = d === 3 ? 11 : 13;
            if (isCur) circle(g, x, y, r + 5, 'rgba(255,210,63,0.35)');
            const fill = pr ? 'rgba(255,255,255,0.08)' : d === 3 ? '#fff2c8' : d % 2 === 0 ? '#ff8a6b' : '#7a9aff';
            if (d < 3) {
              g.beginPath();
              if (d % 2 === 0) {
                g.moveTo(x, y - r);
                g.lineTo(x + r, y + r * 0.75);
                g.lineTo(x - r, y + r * 0.75);
              } else {
                g.moveTo(x, y + r);
                g.lineTo(x + r, y - r * 0.75);
                g.lineTo(x - r, y - r * 0.75);
              }
              g.closePath();
              g.fillStyle = fill;
              g.fill();
              if (best.has(n)) {
                g.strokeStyle = '#ffd23f';
                g.lineWidth = 2.5;
                g.stroke();
              }
            } else box(g, x - r, y - r, r * 2, r * 2, 5, fill, best.has(n) ? '#ffd23f' : undefined, 2.5);
            if (v !== undefined && !pr) txt(g, String(v), x, y + (d < 3 ? (d % 2 === 0 ? 3 : -3) : 0.5), d === 3 ? 11 : 11, d === 3 ? '#5a3a00' : '#fff', 'center', 900);
            else if (d === 3 && !pr) txt(g, '?', x, y + 0.5, 10, '#c9b07a', 'center', 800);
          }
          txt(g, '▲ 나: 큰 값', 18, 186, 8.5, '#ffb2a8', 'left', 800);
          txt(g, '▼ 상대: 작은 값', 84, 186, 8.5, '#b8c6ff', 'left', 800);
          const cut = new Set([...pruned].filter((n) => depthOf(n) === 3)).size;
          txt(g, ab ? `알파베타: 끝 ${8 - cut}/8 개만 봄` : '전부 보기: 끝 8/8', 302, 186, 8.5, '#ffd23f', 'right', 800);
        },
        controls: [
          { type: 'toggle', label: '알파베타 가지치기', value: true, on: (v) => ((ab = v), (start = -100)) },
          { type: 'range', label: '빠르기', min: 0.4, max: 3, step: 0.1, value: 1, on: (v) => (speed = v) },
        ] as Control[],
      };
    },
  },

  // ── 퍼즐 풀이기 · 판 만들기 ──
  u89: {
    kind: '2d',
    caption: '너비 우선 탐색 — 출발점에서 한 걸음 · 두 걸음 … 겹겹이 퍼져 도착하면 가장 짧은 길(금빛)',
    make() {
      const W = 11;
      const H = 7;
      let walls: boolean[] = [];
      let dist: number[] = [];
      let prev: number[] = [];
      let S = 0;
      let E = 0;
      let start = -100;
      let seed = 11;
      let speed = 1;
      const gen = (t: number): void => {
        for (let tries = 0; tries < 40; tries++) {
          const R = rnd(seed++ * 977);
          walls = Array.from({ length: W * H }, () => R() < 0.28);
          S = 3 * W + 0;
          E = Math.floor(R() * H) * W + (W - 1);
          walls[S] = false;
          walls[E] = false;
          dist = new Array<number>(W * H).fill(-1);
          prev = new Array<number>(W * H).fill(-1);
          dist[S] = 0;
          const q = [S];
          while (q.length) {
            const c = q.shift()!;
            const cx = c % W;
            const cy = Math.floor(c / W);
            for (const [dx, dy] of [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ] as [number, number][]) {
              const nx = cx + dx;
              const ny = cy + dy;
              if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
              const n = ny * W + nx;
              if (walls[n] || dist[n]! >= 0) continue;
              dist[n] = dist[c]! + 1;
              prev[n] = c;
              q.push(n);
            }
          }
          if (dist[E]! >= 10) break;
        }
        start = t;
      };
      return {
        draw(g, w, h, t) {
          stage(g, w, h, ['#cdeeff', '#f2fbff']);
          const lay = 0.32 / speed;
          const goal = dist[E] ?? -1;
          if (t < start || goal < 0 || t - start > (goal + 1) * lay + 3.2) gen(t);
          const el = t - start;
          const layer = Math.floor(el / lay);
          const found = layer >= dist[E]!;
          const S2 = 22;
          const ox = (VW - W * S2) / 2;
          const oy = 24;
          const path = new Set<number>();
          if (found) {
            let c = E;
            while (c >= 0) {
              path.add(c);
              c = prev[c]!;
            }
          }
          for (let i = 0; i < W * H; i++) {
            const x = ox + (i % W) * S2;
            const y = oy + Math.floor(i / W) * S2;
            if (walls[i]) {
              box(g, x + 1, y + 1, S2 - 2, S2 - 2, 6, '#ffffff', '#b8d4ea', 1.2);
              circle(g, x + S2 / 2, y + 8, 5, '#e8f4ff');
              continue;
            }
            const d = dist[i]!;
            const seen = d >= 0 && d <= layer;
            const front = d === layer && !found;
            const hue = 200 - Math.min(d, 20) * 8;
            box(g, x + 1, y + 1, S2 - 2, S2 - 2, 5, seen ? `hsl(${hue},85%,${front ? 62 : 78}%)` : 'rgba(150,200,240,0.35)', front ? '#fff' : undefined, 2);
            if (path.has(i)) box(g, x + 3, y + 3, S2 - 6, S2 - 6, 4, '#ffd23f');
            if (seen && i !== S && i !== E) txt(g, String(d), x + S2 / 2, y + S2 / 2 + 0.5, 9.5, path.has(i) ? '#6a4a00' : '#1a3a6a', 'center', 800);
          }
          // 출발 별 · 도착 깃발
          const sx = ox + (S % W) * S2 + S2 / 2;
          const sy = oy + Math.floor(S / W) * S2 + S2 / 2;
          let px = sx;
          let py = sy;
          if (found) {
            const arr: number[] = [];
            let c = E;
            while (c >= 0) {
              arr.unshift(c);
              c = prev[c]!;
            }
            const wk = clamp((el - (dist[E]! + 0.5) * lay) / 2.2) * (arr.length - 1);
            const a = arr[Math.floor(wk)]!;
            const b = arr[Math.min(arr.length - 1, Math.floor(wk) + 1)]!;
            const f = wk - Math.floor(wk);
            px = ox + lerp(a % W, b % W, f) * S2 + S2 / 2;
            py = oy + lerp(Math.floor(a / W), Math.floor(b / W), f) * S2 + S2 / 2;
          }
          const ex = ox + (E % W) * S2 + S2 / 2;
          const ey = oy + Math.floor(E / W) * S2 + S2 / 2;
          line(g, ex - 4, ey + 9, ex - 4, ey - 9, '#7a4a20', 2);
          g.beginPath();
          g.moveTo(ex - 4, ey - 9);
          g.lineTo(ex + 8, ey - 5);
          g.lineTo(ex - 4, ey - 1);
          g.closePath();
          g.fillStyle = '#ff5a6a';
          g.fill();
          star(g, px, py, 10, '#ffd23f', Math.sin(t * 3) * 0.2, '#d99a10');
          circle(g, px - 2.5, py - 0.5, 1.2, '#3a2a10');
          circle(g, px + 2.5, py - 0.5, 1.2, '#3a2a10');
          const tag = found ? `가장 짧은 길 ${dist[E]}걸음 — 찾았다!` : `${layer}겹째 퍼지는 중 …`;
          pill(g, tag, 160, 11, found ? '#ff8a3d' : '#3a7ac8', '#fff', 8.5);
          txt(g, '같은 방법으로 거꾸로 당겨 판을 만들고, 다시 풀어 확인해요', 160, 190, 8, '#3a6a9a', 'center', 700);
        },
        controls: [{ type: 'range', label: '빠르기', min: 0.4, max: 3, step: 0.1, value: 1, on: (v) => (speed = v) }],
      };
    },
  },

  // ── 게임 이론 ──
  u90: {
    kind: '2d',
    caption: '님 게임 — 더미 수를 2진수로 XOR(님 합). 0 이 아니면 이기는 자리: 님 합이 0 이 되게 가져가면 반드시 이겨요',
    make() {
      let heaps: number[] = [3, 5, 6];
      let turn = 0;
      let phaseStart = 0;
      let plan: [number, number] | null = null;
      let msg = '';
      let seed = 5;
      const xor = (hs: number[]): number => hs.reduce((a, b) => a ^ b, 0);
      const choose = (): [number, number] => {
        const x = xor(heaps);
        if (turn === 0 && x !== 0) {
          for (let i = 0; i < heaps.length; i++) {
            const hh = heaps[i]!;
            if ((hh ^ x) < hh) return [i, hh - (hh ^ x)];
          }
        }
        const R = rnd(seed++ * 31);
        const nz = heaps.map((v, i) => [v, i] as [number, number]).filter(([v]) => v > 0);
        const [v, i] = nz[Math.floor(R() * nz.length)]!;
        return [i, 1 + Math.floor(R() * Math.min(v, 3))];
      };
      return {
        draw(g, w, h, t) {
          stage(g, w, h, MINT);
          const el = t - phaseStart;
          if (el < 0) phaseStart = t;
          if (!plan && heaps.some((v) => v > 0) && el > 0.6) plan = choose();
          if (plan && el > 2.2) {
            heaps[plan[0]] = heaps[plan[0]]! - plan[1];
            plan = null;
            turn = 1 - turn;
            phaseStart = t;
            if (heaps.every((v) => v === 0)) msg = turn === 1 ? '내가 마지막 돌을 가져가 이겼다!' : '친구가 이겼다';
          }
          if (heaps.every((v) => v === 0) && el > 2.4) {
            const R = rnd(seed++ * 13);
            heaps = [2 + Math.floor(R() * 4), 3 + Math.floor(R() * 4), 4 + Math.floor(R() * 4)];
            turn = 0;
            msg = '';
            phaseStart = t;
          }
          const x = xor(heaps);
          // 더미
          const C = ['#ff7a6b', '#5b6cff', '#ffb22e'];
          heaps.forEach((v, i) => {
            const y = 34 + i * 40;
            txt(g, `더미 ${i + 1}`, 14, y, 8.5, '#2a5a48', 'left', 800);
            for (let s = 0; s < v; s++) {
              const takeIt = plan && plan[0] === i && s >= v - plan[1];
              const bob = takeIt ? Math.sin(t * 12) * 2 - clamp((el - 1.4) / 0.8) * 16 : 0;
              g.globalAlpha = takeIt ? 1 - clamp((el - 1.6) / 0.6) : 1;
              circle(g, 62 + s * 17, y + bob, 7.5, C[i]!, takeIt ? '#2a2238' : 'rgba(0,0,0,0.25)', takeIt ? 2 : 1);
              circle(g, 59.5 + s * 17, y - 2.5 + bob, 2, 'rgba(255,255,255,0.6)');
              g.globalAlpha = 1;
            }
            // 2진수
            const bits = v.toString(2).padStart(3, '0');
            for (let b = 0; b < 3; b++) {
              box(g, 222 + b * 22, y - 9, 18, 18, 4, bits[b] === '1' ? C[i]! : '#fff', '#9ac4b4', 1);
              txt(g, bits[b]!, 231 + b * 22, y + 0.5, 10, bits[b] === '1' ? '#fff' : '#9ab0a8', 'center', 800, MONO);
            }
            txt(g, String(v), 300, y, 11, '#2a5a48', 'center', 800);
          });
          line(g, 216, 148, 306, 148, '#2a5a48', 1.5);
          txt(g, '님 합', 196, 162, 9, '#2a5a48', 'center', 800);
          const xb = x.toString(2).padStart(3, '0');
          for (let b = 0; b < 3; b++) {
            box(g, 222 + b * 22, 153, 18, 18, 4, xb[b] === '1' ? '#2a2238' : '#fff', '#2a2238', 1.2);
            txt(g, xb[b]!, 231 + b * 22, 162.5, 10, xb[b] === '1' ? '#fff' : '#9ab0a8', 'center', 800, MONO);
          }
          txt(g, String(x), 300, 162, 12, x ? '#ff5a6a' : '#2bb673', 'center', 900);
          txt(g, 'XOR', 204, 30, 8, '#5a8a78', 'center', 800);
          // 상태
          const who = turn === 0 ? '내 차례' : '친구 차례';
          const tip = msg || (turn === 0 ? (x ? '님 합 ≠ 0 → 이기는 자리! 0 으로 만들기' : '님 합 = 0 → 지는 자리') : '친구는 아무렇게나');
          pill(g, who, 50, 178, turn === 0 ? '#ff7a3d' : '#5b6cff', '#fff', 9);
          txtFit(g, tip, 138, 178, 8.5, 140, '#2a5a48', 800);
          txt(g, '같은 셈: 그런디 수 · 기댓값 판단 · 후퇴 분석', 160, 194, 7.5, '#5a8a78', 'center', 700);
        },
      };
    },
  },

  // ── 진동 패턴 ──
  i30: {
    kind: '2d',
    caption: 'navigator.vibrate([ms…]) — 충돌 · 정답 · 홈런마다 다른 떨림 무늬 (폰에서 자세히 보기 단추로 느껴 보기)',
    make() {
      const PAT: [string, number[], string][] = [
        ['충돌', [220], '#ff7a6b'],
        ['정답', [60, 70, 60, 70, 60], '#2bb673'],
        ['홈런', [80, 40, 120, 40, 360], '#ffb22e'],
      ];
      let sel = 0;
      return {
        draw(g, w, h, t) {
          stage(g, w, h, PEACH);
          const cur = Math.floor(t / 2) % 3;
          const el = (t % 2) * 1000;
          const [, pat] = PAT[cur]!;
          let on = false;
          let acc = 0;
          pat.forEach((ms, i) => {
            if (el >= acc && el < acc + ms && i % 2 === 0) on = true;
            acc += ms;
          });
          // 폰
          const sh = on ? Math.sin(t * 90) * 3 : 0;
          g.save();
          g.translate(56 + sh, 100);
          g.rotate(on ? Math.sin(t * 70) * 0.04 : 0);
          phone(g, -30, -60, 60, 120);
          circle(g, 0, -4, 16, PAT[cur]![2]);
          face(g, 0, -4, 12, cur !== 0);
          g.restore();
          if (on)
            for (const s of [-1, 1])
              for (let i = 0; i < 2; i++) {
                g.beginPath();
                g.arc(56, 100, 40 + i * 7, s > 0 ? -0.5 : Math.PI - 0.5, s > 0 ? 0.5 : Math.PI + 0.5);
                g.strokeStyle = PAT[cur]![2];
                g.lineWidth = 2;
                g.stroke();
              }
          // 무늬 줄
          PAT.forEach(([n, p, c], i) => {
            const y = 30 + i * 52;
            const act = i === cur;
            box(g, 112, y - 6, 200, 42, 9, act ? '#fff' : 'rgba(255,255,255,0.5)', act ? c : '#f0d0b8', act ? 2 : 1);
            txt(g, n, 124, y + 6, 10, c, 'left', 800);
            txt(g, `[${p.join(', ')}]`, 300, y + 6, 7.5, '#8a6a5a', 'right', 700, MONO);
            let x = 124;
            const sc = 160 / 640;
            p.forEach((ms, j) => {
              const ww = ms * sc;
              if (j % 2 === 0) box(g, x, y + 16, Math.max(2, ww), 12, 3, c);
              x += ww;
            });
            if (act) line(g, 124 + el * sc, y + 13, 124 + el * sc, y + 31, '#2a2238', 1.5);
          });
        },
        controls: [
          {
            type: 'range',
            label: '고르기: 충돌 · 정답 · 홈런',
            min: 0,
            max: 2,
            step: 1,
            value: 0,
            on: (v) => (sel = v),
          },
          {
            type: 'button',
            label: '진동하기 (폰에서만 느껴져요)',
            on: () => {
              navigator.vibrate?.(PAT[sel]![1]);
            },
          },
        ],
      };
    },
  },

  // ── 공간 소리 ──
  i31: {
    kind: '2d',
    caption: 'PannerNode — 공이 왼쪽에서 오른쪽으로 날면 소리도 왼쪽 귀 → 오른쪽 귀로 (이어폰 끼고 단추로 듣기)',
    make() {
      return {
        draw(g, w, h, t) {
          stage(g, w, h, SKY);
          const p = pingpong(t, 4);
          const pan = p * 2 - 1;
          const bx = 40 + p * 240;
          const by = 60 - Math.sin(p * Math.PI) * 30;
          // 공 자국
          for (let i = 1; i < 8; i++) {
            const q = clamp(p - (i * 0.02 * (Math.floor(t / 2) % 2 ? -1 : 1)));
            circle(g, 40 + q * 240, 60 - Math.sin(q * Math.PI) * 30, 8 - i * 0.6, `rgba(255,255,255,${0.5 - i * 0.06})`);
          }
          circle(g, bx, by, 11, '#fff', '#c94a3a', 1.5);
          g.beginPath();
          g.arc(bx - 9, by, 9, -0.9, 0.9);
          g.strokeStyle = '#e8453c';
          g.lineWidth = 1.4;
          g.stroke();
          g.beginPath();
          g.arc(bx + 9, by, 9, Math.PI - 0.9, Math.PI + 0.9);
          g.stroke();
          // 소리 고리
          for (let i = 0; i < 3; i++) {
            const k = (t * 1.6 + i / 3) % 1;
            circle(g, bx, by, 12 + k * 30, null, `rgba(91,108,255,${0.6 * (1 - k)})`, 1.5);
          }
          // 머리 (위에서)
          circle(g, 160, 150, 24, '#ffd9c0', '#c9895a', 1.8);
          g.beginPath();
          g.arc(160, 150, 24, Math.PI * 1.05, Math.PI * 1.95);
          g.fillStyle = '#5a3a2a';
          g.fill();
          const L = clamp(0.5 - pan * 0.5 + 0.1);
          const R = clamp(0.5 + pan * 0.5 + 0.1);
          circle(g, 134, 152, 6 + L * 4, '#7ab0ff');
          circle(g, 186, 152, 6 + R * 4, '#ff7a9a');
          txt(g, '듣는 사람', 160, 186, 8.5, '#3a4f8c', 'center', 800);
          // 음량 막대
          const bar = (x: number, v: number, c: string, lab: string): void => {
            box(g, x, 110, 16, 70, 5, '#fff', '#c8d6ee', 1.2);
            box(g, x + 2, 178 - v * 66, 12, v * 66, 4, c);
            txt(g, lab, x + 8, 102, 9, c, 'center', 800);
          };
          bar(70, L, '#5b8cff', '왼쪽');
          bar(234, R, '#ff5a8a', '오른쪽');
          pill(g, `pan ${pan >= 0 ? '+' : ''}${pan.toFixed(2)}`, 160, 106, '#3a4f8c', '#fff', 8.5);
        },
        controls: [
          {
            type: 'button',
            label: '들어 보기 (이어폰)',
            on: () => {
              const c = ac();
              const pn = c.createPanner();
              pn.panningModel = 'HRTF';
              const t0 = c.currentTime;
              pn.positionX.setValueAtTime(-3, t0);
              pn.positionX.linearRampToValueAtTime(3, t0 + 2.4);
              pn.positionZ.setValueAtTime(-1, t0);
              pn.connect(c.destination);
              for (let i = 0; i < 12; i++) tone({ freq: 660 + (i % 2) * 220, dur: 0.16, type: 'triangle', vol: 0.18, delay: i * 0.2 }, pn);
            },
          },
        ],
      };
    },
  },

  // ── OffscreenCanvas ──
  i32: {
    kind: '2d',
    caption: '위: 화면 줄에서 무늬를 구우면 시작이 늦음 · 아래: 일꾼의 화면 밖 캔버스가 굽는 동안 게임이 먼저 열려요',
    make() {
      const P = 5;
      const pat = (g: G, x: number, y: number, s: number, prog: number): void => {
        const n = 6;
        const c = s / n;
        for (let i = 0; i < n * n; i++) {
          if (i / (n * n) > prog) break;
          const cx = i % n;
          const cy = Math.floor(i / n);
          g.fillStyle = ['#ff9ab0', '#ffd23f', '#7ad0ff', '#9af0b8'][(cx + cy * 2) % 4]!;
          g.fillRect(x + cx * c, y + cy * c, c, c);
        }
      };
      return {
        draw(g, w, h, t) {
          stage(g, w, h, NAVY);
          const x = t % P;
          const tx = (s: number): number => 70 + (s / 4) * 150;
          const row = (oy: number, off: boolean): void => {
            txt(g, off ? 'OffscreenCanvas' : '보통 캔버스', 10, oy + 6, 10, off ? '#7af0c8' : '#ffb2a8', 'left', 800, TF);
            txt(g, '화면 줄', 12, oy + 28, 8, '#cdd6ff', 'left', 700);
            box(g, 70, oy + 20, 150, 16, 4, 'rgba(255,255,255,0.08)');
            if (off) {
              txt(g, '일꾼 줄', 12, oy + 52, 8, '#cdd6ff', 'left', 700);
              box(g, 70, oy + 44, 150, 16, 4, 'rgba(255,255,255,0.08)');
              box(g, tx(0.2), oy + 45, tx(2.2) - tx(0.2), 14, 3, '#a87aff');
              txt(g, '무늬 굽기', (tx(0.2) + tx(2.2)) / 2, oy + 52.5, 8, '#fff', 'center', 800);
              for (let s = 0; s < 4; s += 0.2) box(g, tx(s) + 0.5, oy + 22, 4, 12, 1.5, s < 0.6 ? '#9ab0ff' : '#3ccf7a');
              arrow(g, tx(2.2), oy + 44, tx(2.2), oy + 36, '#ffd23f', 1.4);
            } else {
              box(g, tx(0.2), oy + 21, tx(2.2) - tx(0.2), 14, 3, '#ff7a6b');
              txt(g, '무늬 굽기 (멈춤)', (tx(0.2) + tx(2.2)) / 2, oy + 28.5, 8, '#fff', 'center', 800);
              for (let s = 2.2; s < 4; s += 0.2) box(g, tx(s) + 0.5, oy + 22, 4, 12, 1.5, '#3ccf7a');
            }
            line(g, tx(Math.min(x, 4)), oy + 16, tx(Math.min(x, 4)), oy + (off ? 62 : 38), '#fff', 1.5);
            // 화면
            box(g, 236, oy, 74, 62, 8, '#fdfbff');
            const prog = clamp((x - 0.2) / 2);
            const ready = off ? x > 0.6 : x > 2.2;
            if (!ready) {
              if (off || x < 0.2) {
                for (let i = 0; i < 6; i++) {
                  const a = t * 5 + i;
                  circle(g, 273 + Math.cos(a) * 10, oy + 31 + Math.sin(a) * 10, 2, '#9ab0ff');
                }
              } else txt(g, '하얀 화면…', 273, oy + 31, 8.5, '#a0a8c8', 'center', 700);
            } else {
              if (off && prog < 1) {
                g.fillStyle = '#e8ecf8';
                g.fillRect(244, oy + 8, 46, 46);
              } else pat(g, 244, oy + 8, 46, 1);
              circle(g, 297, oy + 48, 9, '#ff7a6b');
              face(g, 297, oy + 48, 6);
            }
          };
          row(10, false);
          row(96, true);
          // 일꾼 안에서 구워지는 무늬
          box(g, 236, 168, 74, 26, 6, 'rgba(168,122,255,0.25)');
          pat(g, 240, 171, 20, clamp((x - 0.2) / 2));
          txt(g, '일꾼이 굽는 중', 284, 181, 7.5, '#d8c8ff', 'center', 700);
          txt(g, '시작이 빨라져요 →', 120, 182, 8.5, '#7af0c8', 'center', 800);
        },
      };
    },
  },

  // ── WebGPU · TSL ──
  i33: {
    kind: '2d',
    caption: '같은 시간에 WebGL 은 입자 1,000 개, WebGPU 계산 셰이더는 몇 배 더 — 입자 · 물리 계산을 그래픽 칩이 직접',
    make() {
      let mult = 4;
      return {
        draw(g, w, h, t) {
          stage(g, w, h, ['#0d1030', '#22285a']);
          const half = (ox: number, n: number, label: string, col: string): void => {
            box(g, ox, 26, 150, 140, 12, 'rgba(255,255,255,0.04)', col, 1.5);
            g.globalCompositeOperation = 'lighter';
            for (let i = 0; i < n; i++) {
              const a = i * 2.39996 + t * (0.25 + (i % 7) * 0.03);
              const r = Math.sqrt((i + 0.5) / n) * 62;
              const wob = Math.sin(t * 1.7 + i * 0.37) * 4;
              const x = ox + 75 + Math.cos(a) * (r + wob);
              const y = 96 + Math.sin(a) * (r + wob) * 0.92;
              g.fillStyle = `hsla(${(i * 0.37 + t * 40) % 360},90%,65%,0.75)`;
              g.fillRect(x, y, 1.6, 1.6);
            }
            g.globalCompositeOperation = 'source-over';
            txt(g, label, ox + 75, 14, 10, col, 'center', 800, TF);
            pill(g, `입자 ${n.toLocaleString()}개`, ox + 75, 178, col, '#10142e', 8.5);
          };
          half(8, 1000, 'WebGL', '#9ab0ff');
          half(162, Math.round(1000 * mult), 'WebGPU · TSL', '#7af0c8');
          txt(g, '브라우저 지원을 확인한 뒤 도입', 160, 195, 7.5, '#8a92c8', 'center', 700);
        },
        controls: [{ type: 'range', label: 'WebGPU 쪽 배수', min: 1, max: 8, step: 0.5, value: 4, on: (v) => (mult = v) }],
      };
    },
  },

  // ── BatchedMesh ──
  i34: {
    kind: '2d',
    caption: '왼쪽: 소품을 하나씩 그리면 그리기 호출 40번 · 오른쪽 BatchedMesh: 모양이 달라도 한 묶음으로 1번',
    make() {
      const R = rnd(42);
      const props = Array.from({ length: 40 }, () => ({ x: R(), y: R(), k: Math.floor(R() * 4), s: 0.7 + R() * 0.6 }));
      const prop = (g: G, x: number, y: number, k: number, s: number): void => {
        if (k === 0) {
          box(g, x - 1.5 * s, y, 3 * s, 6 * s, 1, '#8a5a2a');
          circle(g, x, y - 2 * s, 6 * s, '#3ccf7a');
        } else if (k === 1) {
          circle(g, x, y + 2, 5 * s, '#a8b0c0');
        } else if (k === 2) {
          circle(g, x, y, 3.5 * s, '#ff7ab0');
          circle(g, x, y, 1.4 * s, '#ffd23f');
        } else {
          g.beginPath();
          g.moveTo(x, y - 7 * s);
          g.lineTo(x + 5 * s, y + 4 * s);
          g.lineTo(x - 5 * s, y + 4 * s);
          g.closePath();
          g.fillStyle = '#ffb22e';
          g.fill();
        }
      };
      return {
        draw(g, w, h, t) {
          stage(g, w, h, MINT);
          const P = 4.5;
          const x = t % P;
          const half = (ox: number, batch: boolean): void => {
            box(g, ox, 12, 148, 118, 10, '#e8f8d8', batch ? '#2bb673' : '#ff9e3d', 2);
            const shown = batch ? (x > 1.4 ? 40 : 0) : Math.min(40, Math.floor(x / 0.08));
            props.slice(0, shown).forEach((p, i) => {
              const fresh = !batch && i === shown - 1;
              prop(g, ox + 12 + p.x * 124, 26 + p.y * 92, p.k, p.s * (fresh ? 1.5 : 1));
            });
            // 보내는 짐
            if (batch) {
              if (x < 1.4) {
                const p = ease(x / 1.4);
                const by = lerp(186, 70, p);
                box(g, ox + 50, by - 14, 48, 28, 6, '#2bb673', '#1a7a4a', 1.5);
                for (let k = 0; k < 4; k++) prop(g, ox + 60 + k * 10, by, k, 0.6);
              }
            } else if (shown < 40) {
              const p = (x % 0.08) / 0.08;
              const it = props[shown]!;
              prop(g, lerp(ox + 74, ox + 12 + it.x * 124, p), lerp(186, 26 + it.y * 92, p), it.k, it.s);
            }
            const calls = batch ? (x > 1.4 ? 1 : 0) : shown;
            box(g, ox + 14, 138, 120, 26, 8, '#fff', batch ? '#2bb673' : '#ff9e3d', 1.5);
            txt(g, `그리기 호출 ${calls}번`, ox + 74, 151.5, 10, batch ? '#1a7a4a' : '#c0600a', 'center', 800);
            txt(g, batch ? 'BatchedMesh 한 묶음' : '따로따로', ox + 74, 178, 9.5, batch ? '#1a7a4a' : '#c0600a', 'center', 800, TF);
          };
          half(8, false);
          half(164, true);
        },
      };
    },
  },

  // ── pmndrs postprocessing ──
  i66: {
    kind: '2d',
    caption: '위: 효과마다 화면 전체를 한 번씩 다시 그림(3번) · 아래 pmndrs: 세 효과를 한 패스로 묶어 1번',
    make() {
      const P = 3;
      const shot = (g: G, x: number, y: number, s: number, t: number, fx: number): void => {
        g.save();
        rr(g, x, y, s * 1.4, s, 4);
        g.clip();
        g.fillStyle = '#141a3a';
        g.fillRect(x, y, s * 1.4, s);
        const cx = x + s * 0.7;
        const cy = y + s * 0.5;
        if (fx >= 1) {
          const gr = g.createRadialGradient(cx, cy, 0, cx, cy, s * 0.5);
          gr.addColorStop(0, 'rgba(255,200,90,0.9)');
          gr.addColorStop(1, 'rgba(255,200,90,0)');
          g.fillStyle = gr;
          g.fillRect(x, y, s * 1.4, s);
        }
        circle(g, cx, cy, s * 0.16, '#ffd23f');
        if (fx >= 2) {
          g.globalAlpha = 0.5;
          circle(g, x + s * 0.2, y + s * 0.75, s * 0.12, '#7ab0ff');
          circle(g, x + s * 1.2, y + s * 0.25, s * 0.1, '#ff7ab0');
          g.globalAlpha = 1;
        } else {
          circle(g, x + s * 0.2, y + s * 0.75, s * 0.06, '#7ab0ff');
          circle(g, x + s * 1.2, y + s * 0.25, s * 0.05, '#ff7ab0');
        }
        if (fx >= 3) circle(g, cx, cy, s * (0.2 + ((t * 0.7) % 1) * 0.5), null, `rgba(255,255,255,${0.8 - ((t * 0.7) % 1) * 0.8})`, 2);
        g.restore();
      };
      return {
        draw(g, w, h, t) {
          stage(g, w, h, NAVY);
          const x = (t % P) / P;
          // 위 줄
          txt(g, 'EffectComposer (지금)', 10, 14, 9.5, '#ffb2a8', 'left', 800);
          const names = ['빛 번짐', '심도', '충격파'];
          shot(g, 10, 26, 30, t, 0);
          names.forEach((n, i) => {
            const bx = 70 + i * 66;
            const on = Math.floor(x * 3) === i;
            box(g, bx, 28, 54, 26, 7, on ? '#ff7a6b' : '#3a2a5a', '#ff7a6b', 1.5);
            txt(g, n, bx + 27, 41.5, 9, '#fff', 'center', 800);
            arrow(g, bx - 14, 41, bx - 2, 41, '#ff7a6b', 1.5);
          });
          arrow(g, 266, 41, 278, 41, '#ff7a6b', 1.5);
          shot(g, 280, 26, 26, t, 3);
          // 오가는 화면 한 장
          const seg = Math.floor(x * 3);
          const q = (x * 3) % 1;
          box(g, lerp(46 + seg * 66, 70 + seg * 66, q), 62, 16, 11, 2, '#ffd9a8');
          txt(g, '화면 전체 읽고 쓰기 3번', 160, 84, 9, '#ffb2a8', 'center', 800);
          // 아래 줄
          txt(g, 'pmndrs postprocessing', 10, 108, 9.5, '#7af0c8', 'left', 800);
          shot(g, 10, 120, 30, t, 0);
          arrow(g, 56, 135, 70, 135, '#3ccf7a', 1.5);
          box(g, 72, 120, 186, 30, 8, '#26406a', '#3ccf7a', 1.8);
          names.forEach((_, i) => box(g, 80 + i * 59, 126, 52, 18, 5, '#3ccf7a'));
          names.forEach((n, i) => txt(g, n, 106 + i * 59, 135.5, 8.5, '#0a3a24', 'center', 800));
          arrow(g, 260, 135, 278, 135, '#3ccf7a', 1.5);
          shot(g, 280, 122, 26, t, 3);
          box(g, lerp(46, 260, x), 156, 16, 11, 2, '#c8ffe0');
          txt(g, 'EffectPass 하나 = 화면 읽고 쓰기 1번 → 가볍게', 160, 182, 9, '#7af0c8', 'center', 800);
        },
      };
    },
  },

  // ── three-mesh-bvh ──
  i67: {
    kind: '2d',
    caption: '광선이 맞는 삼각형 찾기 — 왼쪽은 전부 검사, 오른쪽 BVH 는 상자 나무로 맞을 만한 곳만 골라 검사',
    make() {
      type Tri = [number, number, number, number, number, number];
      const R = rnd(9);
      const tris: Tri[] = [];
      while (tris.length < 110) {
        const a = R() * Math.PI * 2;
        const rad = 74 * (0.72 + 0.28 * Math.cos(5 * a)) * Math.sqrt(R());
        const cx = Math.cos(a) * rad;
        const cy = Math.sin(a) * rad * 0.85;
        const s = 6;
        const r0 = R() * 6.28;
        tris.push([cx + Math.cos(r0) * s, cy + Math.sin(r0) * s, cx + Math.cos(r0 + 2.1) * s, cy + Math.sin(r0 + 2.1) * s, cx + Math.cos(r0 + 4.2) * s, cy + Math.sin(r0 + 4.2) * s]);
      }
      interface Node {
        b: [number, number, number, number];
        items: number[];
        kids: Node[];
        depth: number;
      }
      const bounds = (ids: number[]): [number, number, number, number] => {
        let x0 = 1e9;
        let y0 = 1e9;
        let x1 = -1e9;
        let y1 = -1e9;
        for (const i of ids) {
          const tr = tris[i]!;
          for (let k = 0; k < 6; k += 2) {
            x0 = Math.min(x0, tr[k]!);
            x1 = Math.max(x1, tr[k]!);
            y0 = Math.min(y0, tr[k + 1]!);
            y1 = Math.max(y1, tr[k + 1]!);
          }
        }
        return [x0, y0, x1, y1];
      };
      const build = (ids: number[], depth: number): Node => {
        const b = bounds(ids);
        if (ids.length <= 6) return { b, items: ids, kids: [], depth };
        const ax = b[2] - b[0] > b[3] - b[1] ? 0 : 1;
        const sorted = [...ids].sort((p, q) => tris[p]![ax]! + tris[p]![ax + 2]! - (tris[q]![ax]! + tris[q]![ax + 2]!));
        const m = sorted.length >> 1;
        return { b, items: [], kids: [build(sorted.slice(0, m), depth + 1), build(sorted.slice(m), depth + 1)], depth };
      };
      const root = build(tris.map((_, i) => i), 0);
      const segHit = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean => {
        const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
        if (Math.abs(d) < 1e-9) return false;
        const u = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d;
        const v = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
        return u >= 0 && u <= 1 && v >= 0 && v <= 1;
      };
      const triHit = (tr: Tri, ax: number, ay: number, bx: number, by: number): boolean =>
        segHit(ax, ay, bx, by, tr[0], tr[1], tr[2], tr[3]) || segHit(ax, ay, bx, by, tr[2], tr[3], tr[4], tr[5]) || segHit(ax, ay, bx, by, tr[4], tr[5], tr[0], tr[1]);
      const boxHit = (b: [number, number, number, number], ax: number, ay: number, bx: number, by: number): boolean => {
        let t0 = 0;
        let t1 = 1;
        const d = [bx - ax, by - ay];
        const o = [ax, ay];
        for (let k = 0; k < 2; k++) {
          const dk = d[k]!;
          const lo = b[k]!;
          const hi = b[k + 2]!;
          if (Math.abs(dk) < 1e-9) {
            if (o[k]! < lo || o[k]! > hi) return false;
          } else {
            let a1 = (lo - o[k]!) / dk;
            let a2 = (hi - o[k]!) / dk;
            if (a1 > a2) [a1, a2] = [a2, a1];
            t0 = Math.max(t0, a1);
            t1 = Math.min(t1, a2);
            if (t0 > t1) return false;
          }
        }
        return true;
      };
      return {
        draw(g, w, h, t) {
          stage(g, w, h, NAVY);
          const ax = -88;
          const ay = Math.sin(t * 0.37) * 45;
          const bx = 88;
          const by = -ay * 0.5 + Math.sin(t * 0.61 + 1) * 35;
          const ang = Math.atan2(by - ay, bx - ax);
          const panel = (ox: number, bvh: boolean): void => {
            box(g, ox, 22, 150, 140, 12, 'rgba(255,255,255,0.05)', bvh ? '#7af0c8' : '#ffb2a8', 1.5);
            g.save();
            rr(g, ox, 22, 150, 140, 12);
            g.clip();
            g.translate(ox + 75, 92);
            g.scale(0.82, 0.82);
            const tested = new Set<number>();
            const boxesOn: Node[] = [];
            const boxesOff: Node[] = [];
            if (bvh) {
              const walk = (n: Node): void => {
                if (!boxHit(n.b, ax, ay, bx, by)) {
                  boxesOff.push(n);
                  return;
                }
                boxesOn.push(n);
                n.items.forEach((i) => tested.add(i));
                n.kids.forEach(walk);
              };
              walk(root);
            } else tris.forEach((_, i) => tested.add(i));
            if (bvh) {
              for (const n of boxesOff) if (n.depth <= 3) box(g, n.b[0], n.b[1], n.b[2] - n.b[0], n.b[3] - n.b[1], 2, null, 'rgba(154,176,255,0.25)', 1);
              for (const n of boxesOn) box(g, n.b[0], n.b[1], n.b[2] - n.b[0], n.b[3] - n.b[1], 2, null, `hsla(${150 + n.depth * 20},90%,65%,0.9)`, 1.4);
            }
            let hits = 0;
            tris.forEach((tr, i) => {
              const tt = tested.has(i);
              const hit = tt && triHit(tr, ax, ay, bx, by);
              if (hit) hits++;
              g.beginPath();
              g.moveTo(tr[0], tr[1]);
              g.lineTo(tr[2], tr[3]);
              g.lineTo(tr[4], tr[5]);
              g.closePath();
              g.fillStyle = hit ? '#ff5a6a' : tt ? (bvh ? '#ffd23f' : 'rgba(255,178,168,0.75)') : 'rgba(154,176,255,0.3)';
              g.fill();
            });
            line(g, ax - 10, ay - Math.tan(ang) * 10, bx + 10, by + Math.tan(ang) * 10, '#fff', 1.8);
            circle(g, ax, ay, 3.5, '#fff');
            g.restore();
            txt(g, bvh ? 'three-mesh-bvh' : '전부 검사', ox + 75, 12, 10, bvh ? '#7af0c8' : '#ffb2a8', 'center', 800, TF);
            pill(g, `삼각형 검사 ${tested.size}개 · 맞음 ${hits}`, ox + 75, 176, bvh ? '#3ccf7a' : '#ff7a6b', '#10142e', 8);
          };
          panel(8, false);
          panel(162, true);
        },
      };
    },
  },

  // ── GSAP · Theatre.js ──
  i68: {
    kind: '2d',
    caption: '타임라인의 열쇠 칸(◆)과 부드러운 곡선(이징)대로 별이 움직여요 — 연출을 눈으로 보며 다듬기',
    make() {
      const D = 4;
      const backOut = (k: number): number => {
        const c = 1.70158;
        const x = k - 1;
        return 1 + (c + 1) * x * x * x + c * x * x;
      };
      const tracks: [string, [number, number][], string][] = [
        ['x', [
          [0, 0],
          [1.5, 1],
          [3, 0.3],
          [4, 0],
        ], '#ff7a6b'],
        ['높이', [
          [0, 0],
          [0.75, 1],
          [1.5, 0],
          [2.25, 0.6],
          [3, 0],
          [4, 0],
        ], '#5b6cff'],
        ['크기', [
          [0, 0.4],
          [1.5, 1],
          [3, 0.6],
          [4, 0.4],
        ], '#ffb22e'],
      ];
      const valAt = (keys: [number, number][], s: number): [number, number] => {
        for (let i = 0; i < keys.length - 1; i++) {
          const a = keys[i]!;
          const b = keys[i + 1]!;
          if (s >= a[0] && s <= b[0]) {
            const k = (s - a[0]) / (b[0] - a[0]);
            return [lerp(a[1], b[1], backOut(k)), k];
          }
        }
        return [keys[keys.length - 1]![1], 1];
      };
      return {
        draw(g, w, h, t) {
          stage(g, w, h, ['#fff2e0', '#ffe4f0']);
          const s = t % D;
          const [vx, k] = valAt(tracks[0]![1], s);
          const [vy] = valAt(tracks[1]![1], s);
          const [vs] = valAt(tracks[2]![1], s);
          // 무대
          box(g, 10, 8, 214, 96, 10, '#fff', '#f0c9d8', 1.5);
          line(g, 18, 90, 216, 90, '#e8c0d0', 2);
          const sx = 34 + vx * 160;
          const sy = 82 - vy * 50;
          circle(g, sx, 92, 10 * vs + 4, 'rgba(0,0,0,0.08)');
          star(g, sx, sy - 10 * vs, 8 + 12 * vs, '#ffd23f', vx * 2, '#d99a10');
          circle(g, sx - 3, sy - 10 * vs, 1.6, '#3a2a10');
          circle(g, sx + 3, sy - 10 * vs, 1.6, '#3a2a10');
          // 이징 그래프
          box(g, 232, 8, 80, 96, 10, '#fff', '#f0c9d8', 1.5);
          txt(g, 'back.out', 272, 20, 8.5, '#a04a7a', 'center', 800, MONO);
          g.beginPath();
          for (let q = 0; q <= 30; q++) {
            const kk = q / 30;
            const yy = 92 - backOut(kk) * 56;
            if (q) g.lineTo(242 + kk * 60, yy);
            else g.moveTo(242, yy);
          }
          g.strokeStyle = '#ff7ab0';
          g.lineWidth = 2;
          g.stroke();
          circle(g, 242 + k * 60, 92 - backOut(k) * 56, 3.5, '#a04a7a');
          // 타임라인
          box(g, 10, 112, 302, 82, 10, '#2a2240');
          const tx = (x: number): number => 62 + (x / D) * 240;
          for (let q = 0; q <= 4; q++) {
            line(g, tx(q), 116, tx(q), 190, 'rgba(255,255,255,0.1)', 1);
            txt(g, `${q}초`, tx(q), 120, 6.5, '#a89ac8', 'center', 700);
          }
          tracks.forEach(([n, keys, c], i) => {
            const y = 136 + i * 19;
            txt(g, n, 18, y, 8.5, c, 'left', 800);
            line(g, tx(0), y, tx(D), y, 'rgba(255,255,255,0.15)', 1);
            for (const [kt] of keys) {
              g.save();
              g.translate(tx(kt), y);
              g.rotate(Math.PI / 4);
              const near = Math.abs(kt - s) < 0.12;
              g.fillStyle = near ? '#fff' : c;
              g.fillRect(-3.5, -3.5, 7, 7);
              g.restore();
            }
          });
          line(g, tx(s), 114, tx(s), 192, '#ffd23f', 2);
          g.beginPath();
          g.moveTo(tx(s) - 4, 114);
          g.lineTo(tx(s) + 4, 114);
          g.lineTo(tx(s), 119);
          g.closePath();
          g.fillStyle = '#ffd23f';
          g.fill();
        },
      };
    },
  },

  // ── lil-gui · d3 · KaTeX ──
  i69: {
    kind: '2d',
    caption: '조절판(lil-gui)의 a · b 를 움직이면 d3 축 위 그래프와 KaTeX 수식이 함께 바뀌어요',
    make() {
      let auto = true;
      let A = 1;
      let B = 0;
      return {
        draw(g, w, h, t) {
          stage(g, w, h, ['#f4f6fb', '#e6ebf6']);
          if (auto) {
            A = Math.round((Math.sin(t * 0.7) * 1.5 + 0.2) * 10) / 10;
            B = Math.round(Math.sin(t * 0.43 + 1) * 2 * 10) / 10;
          }
          // lil-gui
          box(g, 8, 10, 106, 92, 6, '#1f1f1f');
          box(g, 8, 10, 106, 14, 3, '#111');
          txt(g, 'Controls', 14, 17.5, 7.5, '#ebebeb', 'left', 700);
          const row = (y: number, lab: string, v: number, lo: number, hi: number): void => {
            txt(g, lab, 14, y, 8.5, '#ebebeb', 'left', 700);
            box(g, 30, y - 6, 52, 12, 2, '#424242');
            box(g, 30, y - 6, 52 * clamp((v - lo) / (hi - lo)), 12, 2, '#2cc9ff');
            box(g, 86, y - 6, 24, 12, 2, '#424242');
            txt(g, v.toFixed(1), 98, y + 0.5, 7.5, '#2cc9ff', 'center', 700, MONO);
          };
          row(36, 'a', A, -2, 2);
          row(54, 'b', B, -2, 2);
          box(g, 14, 66, 96, 12, 2, '#424242');
          txt(g, '그래프 보기 ✓', 62, 72.5, 7.5, '#ebebeb', 'center', 700);
          txt(g, 'lil-gui', 61, 92, 8.5, '#8a8a8a', 'center', 800);
          // KaTeX
          box(g, 8, 110, 106, 82, 6, '#fff', '#d0d6e6', 1.2);
          txt(g, 'KaTeX', 61, 182, 8.5, '#8a92a8', 'center', 800);
          const SERIF = '"KaTeX_Main", "Times New Roman", serif';
                    const parts: [string, string, boolean][] = [
            ['y', '#222', true],
            [' = ', '#222', false],
            [A.toFixed(1), '#e8453c', false],
            ['x', '#222', true],
          ];
          let x = 15;
          for (const [s, c, it] of parts) {
            g.font = `${it ? 'italic ' : ''}400 14px ${SERIF}`;
            g.fillStyle = c;
            g.textAlign = 'left';
            g.fillText(s, x, 146);
            x += g.measureText(s).width;
          }
          g.font = `400 9px ${SERIF}`;
          g.fillText('2', x, 139);
          x += 6;
          g.font = `400 14px ${SERIF}`;
          g.fillStyle = '#222';
          const bs = B >= 0 ? ` + ${B.toFixed(1)}` : ` − ${Math.abs(B).toFixed(1)}`;
          g.fillStyle = '#2a6ad8';
          g.fillText(bs, x, 146);
          // d3 그래프
          const gx = 140;
          const gy = 14;
          const gw = 170;
          const gh = 168;
          box(g, gx - 10, gy - 6, gw + 16, gh + 18, 6, '#fff', '#d0d6e6', 1.2);
          const X = (v: number): number => gx + ((v + 3) / 6) * gw;
          const Y = (v: number): number => gy + gh - ((v + 4) / 8) * gh;
          for (let v = -3; v <= 3; v++) {
            line(g, X(v), Y(0) - 3, X(v), Y(0) + 3, '#333', 1);
            if (v) txt(g, String(v), X(v), Y(0) + 9, 7, '#555', 'center', 600);
            line(g, X(v), gy, X(v), gy + gh, 'rgba(0,0,0,0.05)', 1);
          }
          for (let v = -4; v <= 4; v += 2) {
            line(g, X(0) - 3, Y(v), X(0) + 3, Y(v), '#333', 1);
            if (v) txt(g, String(v), X(0) - 6, Y(v), 7, '#555', 'right', 600);
            line(g, gx, Y(v), gx + gw, Y(v), 'rgba(0,0,0,0.05)', 1);
          }
          line(g, gx, Y(0), gx + gw, Y(0), '#333', 1.2);
          line(g, X(0), gy, X(0), gy + gh, '#333', 1.2);
          g.save();
          g.beginPath();
          g.rect(gx, gy, gw, gh);
          g.clip();
          g.beginPath();
          for (let q = 0; q <= 80; q++) {
            const xv = -3 + (q / 80) * 6;
            const yv = A * xv * xv + B;
            if (q) g.lineTo(X(xv), Y(yv));
            else g.moveTo(X(xv), Y(yv));
          }
          g.strokeStyle = '#5b6cff';
          g.lineWidth = 2.4;
          g.stroke();
          circle(g, X(0), Y(B), 3.5, '#2a6ad8');
          g.restore();
          txt(g, 'd3 축', gx + gw - 12, gy + 6, 8.5, '#8a92a8', 'center', 800);
        },
        controls: [
          { type: 'toggle', label: '저절로 움직이기', value: true, on: (v) => (auto = v) },
          { type: 'range', label: 'a', min: -2, max: 2, step: 0.1, value: 1, on: (v) => ((A = v), (auto = false)) },
          { type: 'range', label: 'b', min: -2, max: 2, step: 0.1, value: 0, on: (v) => ((B = v), (auto = false)) },
        ],
      };
    },
  },
};

import type { Demo2D } from './types';
import {
  blob,
  chain,
  circ,
  clamp,
  easeOut,
  envG,
  eyes,
  filt,
  gainN,
  ground,
  hash,
  makeIR,
  noise,
  on01,
  osc,
  rgba,
  rr,
  shadow,
  shaper,
  shotDemo,
  sparkle,
  st2,
  star,
  TAU,
  tone,
  txt,
  waves,
  type Rec,
  type Shot,
} from './demosSfx';

/**
 * 효과음 합성 견본판(i499) 추가 묶음 (2026-10-07) — 같은 엔진(파일 없이 Web Audio)으로 만든 소리 48가지.
 * 분류: 게임 · 화면(UI) · 전투 · 마법 · 자연 · 생활. 각 소리는 조리법(rec) 하나 + 작은 그림(icon) 하나.
 * 목록에 따로 나오지 않고 견본판 안에서 골라 듣는다 (기술은 「코드로 효과음 합성」 하나).
 */

type BA = BaseAudioContext;
type G = CanvasRenderingContext2D;

/* ── 조리 도우미 ── */
/** 걸러진 잡음 한 덩이 */
function nz(c: BA, out: AudioNode, t: number, type: BiquadFilterType, f: number, q: number, a: number, hold: number, d: number, peak: number, r: () => number, brown = false): BiquadFilterNode {
  const n = noise(c, t, a + hold + d, r, brown);
  const b = filt(c, type, f, q);
  chain(n, b, envG(c, out, t, a, hold, d, peak));
  return b;
}
/** 내려가는 사인 「쿵」 */
function thump(c: BA, out: AudioNode, t: number, f0: number, f1: number, d: number, peak: number): void {
  const o = osc(c, 'sine', f0, t, d);
  o.frequency.exponentialRampToValueAtTime(f1, t + d * 0.9);
  o.connect(envG(c, out, t, 0.002, 0.01, d, peak));
}
/** 쇠 울림 — 어긋난 배음(비조화)의 합 */
function metal(c: BA, out: AudioNode, t: number, f: number, d: number, peak: number, ratios = [1, 2.32, 4.25, 6.63, 9.38]): void {
  ratios.forEach((k, i) => tone(c, out, t, f * k, d / (1 + i * 0.6), peak / (1 + i * 0.8), 'sine', 0.001));
}
/** 잔향을 거친 출력 */
function wet(c: BA, out: AudioNode, sec: number, mix: number): AudioNode {
  const inG = gainN(c, 1);
  const cv = c.createConvolver();
  cv.buffer = makeIR(c, sec);
  chain(inG, cv, gainN(c, mix), out);
  inG.connect(out);
  return inG;
}
const PENTA = [0, 2, 4, 7, 9];

/* ── 그림 도우미 ── */
function glow(g: G, x: number, y: number, r: number, color: string, a: number): void {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgba(color, a));
  gr.addColorStop(1, rgba(color, 0));
  g.fillStyle = gr;
  circ(g, x, y, r);
  g.fill();
}
function burst(g: G, x: number, y: number, r: number, n: number, color: string, a: number, w = 2.5): void {
  g.strokeStyle = rgba(color, a);
  g.lineWidth = w;
  for (let i = 0; i < n; i++) {
    const an = (i / n) * TAU;
    g.beginPath();
    g.moveTo(x + Math.cos(an) * r * 0.55, y + Math.sin(an) * r * 0.55);
    g.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r);
    g.stroke();
  }
}
function note(g: G, x: number, y: number, s: number, color: string, a = 1): void {
  g.globalAlpha = a;
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(x, y, s * 0.55, s * 0.4, -0.4, 0, TAU);
  g.fill();
  g.fillRect(x + s * 0.4, y - s * 1.6, s * 0.16, s * 1.6);
  g.fillRect(x + s * 0.4, y - s * 1.6, s * 0.6, s * 0.22);
  g.globalAlpha = 1;
}
const fade = (k: number): number => (on01(k) ? 1 - clamp(k) : 0);
const pulse = (k: number, at: number, w = 0.12): number => (k >= at && k < at + w ? Math.sin(((k - at) / w) * Math.PI) : 0);

/* ── 소리 ── */
const S: Record<string, Shot & { name: string; cat: string }> = {};
function add(id: string, cat: string, name: string, s: Shot): void {
  S[id] = { ...s, name, cat };
}

/* ═════ 게임 ═════ */
add('sx01', '게임', '목숨 하나 더', {
  caption: '네모파로 빠르게 올라가는 다섯 음 — 「띠리리링!」 보너스 느낌',
  title: '띠리리링!',
  color: '#5be08a',
  dur: 0.6,
  rec: (c, out, t0) => {
    [0, 4, 7, 12, 16].forEach((n, i) => tone(c, out, t0 + i * 0.075, 1046.5 * st2(n), i === 4 ? 0.3 : 0.07, 0.18, 'square', 0.002));
  },
  icon(g, k, t) {
    const up = on01(k) ? easeOut(k) : 0;
    g.save();
    g.translate(0, 10 - up * 22);
    // 버섯 대신 하트 목숨
    g.fillStyle = '#ff5c7a';
    g.beginPath();
    g.moveTo(0, 14);
    g.bezierCurveTo(-30, -6, -16, -30, 0, -14);
    g.bezierCurveTo(16, -30, 30, -6, 0, 14);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.beginPath();
    g.ellipse(-9, -12, 5, 3, -0.6, 0, TAU);
    g.fill();
    g.restore();
    if (on01(k)) {
      g.globalAlpha = 1 - clamp(k);
      txt(g, '1UP', 0, -34 - k * 10, 15, '#bfffcf', 'center', 900);
      g.globalAlpha = 1;
      for (let i = 0; i < 4; i++) sparkle(g, Math.cos(i * 1.6 + t) * 30, -6 + Math.sin(i * 1.6 + t) * 18, 4 * (1 - k), '#d8ffe2');
    }
  },
});
add('sx02', '게임', '게임 오버', {
  caption: '세모파가 반음씩 천천히 내려가다 마지막 음이 떨리며 사라짐 — 슬픈 「뚜 뚜 뚜 뚜우~」',
  title: '뚜뚜뚜…',
  color: '#8a8fb8',
  dur: 2.0,
  rec: (c, out, t0) => {
    [7, 6, 5].forEach((n, i) => tone(c, out, t0 + i * 0.32, 392 * st2(n - 7), 0.28, 0.25, 'triangle', 0.01));
    const o = osc(c, 'triangle', 392 * st2(-3), t0 + 0.96, 1.0);
    const lfo = osc(c, 'sine', 6, t0 + 0.96, 1.0);
    const lg = gainN(c, 9);
    chain(lfo, lg);
    lg.connect(o.frequency);
    o.frequency.linearRampToValueAtTime(392 * st2(-5), t0 + 1.9);
    o.connect(envG(c, out, t0 + 0.96, 0.02, 0.4, 0.6, 0.28));
  },
  icon(g, k) {
    ground(g, 32);
    const sad = on01(k) ? clamp(k * 1.4) : 0;
    shadow(g, 0, 33, 18);
    blob(g, 0, 16 + sad * 6, 16, '#8a8fb8', 1 + sad * 0.12, 1 - sad * 0.18, 'calm');
    // 눈물
    if (sad > 0.4) {
      g.fillStyle = '#9fd4ff';
      g.beginPath();
      g.ellipse(-9, 22 + (sad - 0.4) * 20, 2.5, 4, 0, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 0.25 + sad * 0.75;
    txt(g, 'GAME OVER', 0, -26, 12, '#d6d9f5', 'center', 900);
    g.globalAlpha = 1;
  },
});
add('sx03', '게임', '단계 통과 팡파르', {
  caption: '톱니파 두 개를 살짝 어긋나게 겹쳐 금관처럼 — 도 · 미 · 솔 · 높은 도 화음으로 「빠밤!」',
  title: '빠바밤!',
  color: '#ffcf4a',
  dur: 1.5,
  rec: (c, out, t0) => {
    const brass = (t: number, f: number, d: number, v: number): void => {
      const lp = filt(c, 'lowpass', 600, 2);
      lp.frequency.setValueAtTime(600, t);
      lp.frequency.exponentialRampToValueAtTime(3500, t + 0.06);
      lp.frequency.exponentialRampToValueAtTime(1400, t + d);
      lp.connect(envG(c, out, t, 0.02, d * 0.6, d * 0.4, v));
      for (const det of [-6, 6]) {
        const o = osc(c, 'sawtooth', f, t, d + 0.05);
        o.detune.value = det;
        o.connect(lp);
      }
    };
    brass(t0, 523.25, 0.12, 0.16);
    brass(t0 + 0.14, 659.25, 0.12, 0.16);
    brass(t0 + 0.28, 783.99, 0.12, 0.16);
    for (const f of [523.25, 659.25, 783.99, 1046.5]) brass(t0 + 0.44, f, 1.0, 0.1);
  },
  icon(g, k, t) {
    const a = on01(k) ? 1 : 0;
    // 깃발
    g.strokeStyle = '#d9dcf5';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(-10, 32);
    g.lineTo(-10, -30);
    g.stroke();
    g.fillStyle = '#ffcf4a';
    g.beginPath();
    g.moveTo(-10, -30);
    for (let i = 0; i <= 8; i++) g.lineTo(-10 + i * 4.5, -30 + Math.sin(i * 0.8 + t * 6) * 3);
    for (let i = 8; i >= 0; i--) g.lineTo(-10 + i * 4.5, -12 + Math.sin(i * 0.8 + t * 6) * 3);
    g.fill();
    star(g, 6, -21, 5);
    g.fillStyle = '#fff6c8';
    g.fill();
    if (a) {
      for (let i = 0; i < 14; i++) {
        const an = hash(i) * TAU;
        const d = 10 + k * 46 * (0.5 + hash(i + 3));
        g.fillStyle = ['#ff6b8a', '#5bd0ff', '#ffe36a', '#7be08a'][i % 4]!;
        g.globalAlpha = 1 - clamp(k);
        g.fillRect(Math.cos(an) * d, -20 + Math.sin(an) * d + k * k * 30, 4, 6);
      }
      g.globalAlpha = 1;
    }
  },
});
add('sx04', '게임', '카운트다운', {
  caption: '같은 음 「삑 · 삑 · 삑」 뒤에 한 옥타브 위 긴 「삐ー」 — 출발 신호',
  title: '삑삑삑 삐ー',
  color: '#ff6b5c',
  dur: 2.3,
  rec: (c, out, t0) => {
    for (let i = 0; i < 3; i++) tone(c, out, t0 + i * 0.5, 880, 0.14, 0.25, 'square', 0.003);
    const o = osc(c, 'square', 1760, t0 + 1.5, 0.7);
    chain(o, filt(c, 'lowpass', 4000), envG(c, out, t0 + 1.5, 0.003, 0.5, 0.2, 0.22));
  },
  icon(g, k) {
    const n = !on01(k) ? 3 : k < 0.22 ? 3 : k < 0.43 ? 2 : k < 0.65 ? 1 : 0;
    const lights = [n <= 2, n <= 1, n === 0];
    rr(g, -36, -20, 72, 30, 10);
    g.fillStyle = '#26223f';
    g.fill();
    lights.forEach((on, i) => {
      circ(g, -22 + i * 22, -5, 9);
      g.fillStyle = on ? (i === 2 ? '#5be08a' : '#ff6b5c') : '#3a355c';
      g.fill();
      if (on) glow(g, -22 + i * 22, -5, 18, i === 2 ? '#5be08a' : '#ff6b5c', 0.35);
    });
    txt(g, n ? String(n) : 'GO!', 0, 32, 18, n ? '#ffd0c8' : '#bfffcf', 'center', 900);
  },
});
add('sx05', '게임', '경고 사이렌', {
  caption: '네모파 음 높이를 느린 세모 모양으로 600 ↔ 1200Hz 오르내림 — 「왜애앵 왜애앵」',
  title: '왜애앵',
  color: '#ff4d4d',
  dur: 2.0,
  rec: (c, out, t0) => {
    const o = osc(c, 'square', 900, t0, 2);
    const lfo = osc(c, 'triangle', 1.5, t0, 2);
    const lg = gainN(c, 300);
    chain(lfo, lg);
    lg.connect(o.frequency);
    chain(o, filt(c, 'lowpass', 2500), envG(c, out, t0, 0.05, 1.7, 0.2, 0.18));
  },
  icon(g, k, t) {
    const a = on01(k);
    rr(g, -18, 14, 36, 10, 3);
    g.fillStyle = '#4a456e';
    g.fill();
    g.fillStyle = a ? '#ff4d4d' : '#8a3a4a';
    g.beginPath();
    g.moveTo(-16, 14);
    g.lineTo(-14, -12);
    g.quadraticCurveTo(0, -24, 14, -12);
    g.lineTo(16, 14);
    g.fill();
    if (a) {
      const s = Math.sin(t * 9);
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = 'rgba(255,90,90,0.35)';
      g.beginPath();
      g.moveTo(0, -4);
      g.lineTo(-50, -30 + s * 30);
      g.lineTo(-50, -4 + s * 30);
      g.fill();
      g.beginPath();
      g.moveTo(0, -4);
      g.lineTo(50, -30 - s * 30);
      g.lineTo(50, -4 - s * 30);
      g.fill();
      g.restore();
    }
  },
});
add('sx06', '게임', '순간 이동', {
  caption: '사인파가 빠르게 떨리며 200 → 2400Hz 로 솟고, 높은 잡음이 반짝 — 「뾰로로롱」 사라짐',
  title: '뾰로롱',
  color: '#6fd8ff',
  dur: 0.9,
  rec: (c, out, t0, _p, r) => {
    const o = osc(c, 'sine', 200, t0, 0.85);
    o.frequency.exponentialRampToValueAtTime(2400, t0 + 0.7);
    const lfo = osc(c, 'sine', 28, t0, 0.85);
    const lg = gainN(c, 120);
    chain(lfo, lg);
    lg.connect(o.frequency);
    o.connect(envG(c, out, t0, 0.01, 0.5, 0.3, 0.25));
    nz(c, out, t0 + 0.2, 'highpass', 6000, 0.7, 0.2, 0.2, 0.3, 0.12, r);
  },
  icon(g, k, t) {
    ground(g, 32);
    const a = on01(k) ? clamp(k * 1.3) : 0;
    g.save();
    g.globalAlpha = 1 - a;
    shadow(g, 0, 33, 16);
    blob(g, 0, 16, 15, '#6fd8ff', 1 - a * 0.6, 1 + a * 1.6, 'happy');
    g.restore();
    if (on01(k)) {
      for (let i = 0; i < 4; i++) {
        g.strokeStyle = rgba('#bff0ff', (1 - k) * 0.8);
        g.lineWidth = 2;
        g.beginPath();
        g.ellipse(0, 30 - i * 14 - k * 30, 22 - i * 3, 5, 0, 0, TAU);
        g.stroke();
      }
      for (let i = 0; i < 6; i++) sparkle(g, Math.sin(i * 2 + t * 3) * 16, 20 - k * 70 - i * 6, 4, '#e0f8ff');
    }
  },
});
add('sx07', '게임', '보석 줍기', {
  caption: 'FM(소리로 소리를 흔들기) 종소리 두 음이 위로 — 맑고 반짝이는 「띠링」',
  title: '띠링✦',
  color: '#ff7ae0',
  dur: 0.9,
  rec: (c, out, t0) => {
    const fm = (t: number, f: number, v: number): void => {
      const car = osc(c, 'sine', f, t, 0.8);
      const mod = osc(c, 'sine', f * 1.41, t, 0.8);
      const mg = c.createGain();
      mg.gain.setValueAtTime(f * 2, t);
      mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 0.5);
      chain(mod, mg);
      mg.connect(car.frequency);
      car.connect(envG(c, out, t, 0.002, 0.02, 0.7, v));
    };
    fm(t0, 1568, 0.22);
    fm(t0 + 0.07, 2093, 0.2);
  },
  icon(g, k, t) {
    const a = on01(k);
    const y = a ? -easeOut(k) * 26 : Math.sin(t * 3) * 3;
    g.save();
    g.translate(0, y);
    g.fillStyle = '#ff7ae0';
    g.beginPath();
    g.moveTo(-16, -6);
    g.lineTo(-8, -16);
    g.lineTo(8, -16);
    g.lineTo(16, -6);
    g.lineTo(0, 16);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.4)';
    g.beginPath();
    g.moveTo(-8, -16);
    g.lineTo(-3, -6);
    g.lineTo(-16, -6);
    g.fill();
    g.strokeStyle = 'rgba(120,20,90,0.6)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(-16, -6);
    g.lineTo(16, -6);
    g.moveTo(-3, -6);
    g.lineTo(0, 16);
    g.lineTo(3, -6);
    g.stroke();
    g.restore();
    if (a) for (let i = 0; i < 5; i++) sparkle(g, Math.cos(i * 1.3) * (14 + k * 26), y + Math.sin(i * 1.3) * (10 + k * 20), 5 * (1 - k), '#ffe0f8');
  },
});
add('sx08', '게임', '벽돌 깨기', {
  caption: '짧은 잡음 조각 여러 개(높이 · 크기 제각각) + 낮은 쿵 — 「와장창」',
  title: '와장창',
  color: '#e08a4a',
  dur: 0.6,
  rec: (c, out, t0, _p, r) => {
    thump(c, out, t0, 160, 50, 0.18, 0.6);
    for (let i = 0; i < 9; i++) nz(c, out, t0 + r() * 0.25, 'bandpass', 800 + r() * 3500, 3, 0.001, 0.005, 0.05 + r() * 0.08, 0.5 * (1 - i / 12), r);
  },
  icon(g, k) {
    ground(g, 34);
    if (!on01(k)) {
      for (let y = 0; y < 2; y++)
        for (let x = 0; x < 3; x++) {
          rr(g, -30 + x * 20 + (y % 2) * 10 - 5, -4 + y * 14, 19, 13, 2);
          g.fillStyle = '#c86a3a';
          g.fill();
          g.strokeStyle = '#6a2f12';
          g.lineWidth = 1.5;
          g.stroke();
        }
      return;
    }
    for (let i = 0; i < 9; i++) {
      const an = -Math.PI / 2 + (hash(i) - 0.5) * 2.4;
      const sp = 30 + hash(i + 5) * 40;
      const x = Math.cos(an) * sp * k;
      const y = 4 + Math.sin(an) * sp * k + k * k * 60;
      g.save();
      g.translate(x, Math.min(30, y));
      g.rotate(k * 8 * (hash(i + 2) - 0.5));
      rr(g, -6, -4, 12, 8, 1.5);
      g.fillStyle = '#c86a3a';
      g.fill();
      g.restore();
    }
    g.globalAlpha = fade(k);
    burst(g, 0, 4, 34, 10, '#ffd59a', 1);
    g.globalAlpha = 1;
  },
});
add('sx09', '게임', '스프링 통통', {
  caption: '사인파 음 높이를 빠르게 떨리게(12Hz) 하고 떨림이 점점 잦아들게 — 「뾰요요용」',
  title: '뾰요요용',
  color: '#9be05b',
  dur: 0.8,
  rec: (c, out, t0) => {
    const o = osc(c, 'sine', 220, t0, 0.75);
    o.frequency.exponentialRampToValueAtTime(330, t0 + 0.7);
    const lfo = osc(c, 'sine', 12, t0, 0.75);
    const lg = c.createGain();
    lg.gain.setValueAtTime(110, t0);
    lg.gain.exponentialRampToValueAtTime(4, t0 + 0.7);
    chain(lfo, lg);
    lg.connect(o.frequency);
    const tri = osc(c, 'triangle', 220, t0, 0.75);
    lg.connect(tri.frequency);
    const g = envG(c, out, t0, 0.003, 0.1, 0.6, 0.3);
    o.connect(g);
    chain(tri, gainN(c, 0.4), g);
  },
  icon(g, k) {
    ground(g, 34);
    const a = on01(k);
    const wob = a ? Math.sin(k * 30) * (1 - k) : 0;
    const top = 6 - wob * 10;
    g.strokeStyle = '#c8d0e8';
    g.lineWidth = 2.5;
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const y = 34 - (34 - top) * (i / 40);
      g.lineTo(Math.sin(i * 0.94) * 10, y);
    }
    g.stroke();
    blob(g, 0, top - 12, 12, '#9be05b', 1 - wob * 0.15, 1 + wob * 0.2, 'happy');
  },
});
add('sx10', '게임', '보물 상자 열기', {
  caption: '낮은 톱니파를 흔들어 「끼이익」 경첩 소리 → 이어서 반짝이는 아르페지오',
  title: '끼익… 짠!',
  color: '#ffc14a',
  dur: 1.7,
  rec: (c, out, t0, _p, r) => {
    const o = osc(c, 'sawtooth', 90, t0, 0.6);
    o.frequency.linearRampToValueAtTime(140, t0 + 0.55);
    const lfo = osc(c, 'square', 22, t0, 0.6);
    const lg = gainN(c, 25);
    chain(lfo, lg);
    lg.connect(o.frequency);
    chain(o, filt(c, 'bandpass', 1200, 4), envG(c, out, t0, 0.05, 0.35, 0.15, 0.4));
    nz(c, out, t0, 'bandpass', 2500, 2, 0.05, 0.3, 0.2, 0.05, r);
    [0, 4, 7, 12, 16, 19].forEach((n, i) => tone(c, out, t0 + 0.65 + i * 0.06, 1046.5 * st2(n), 0.6, 0.12, 'triangle', 0.002));
  },
  icon(g, k, t) {
    const open = on01(k) ? clamp(k / 0.35) : 0;
    const shine = on01(k) && k > 0.38 ? 1 - clamp((k - 0.38) / 0.62) : 0;
    if (shine) glow(g, 0, -4, 50, '#ffe27a', shine * 0.7);
    rr(g, -28, 0, 56, 28, 4);
    g.fillStyle = '#9a5a2a';
    g.fill();
    g.fillStyle = '#e0b040';
    g.fillRect(-28, 10, 56, 4);
    g.save();
    g.translate(0, 0);
    g.scale(1, 1 - open * 1.6);
    rr(g, -28, -14, 56, 14, 6);
    g.fillStyle = '#b06a32';
    g.fill();
    g.restore();
    rr(g, -4, -2, 8, 10, 2);
    g.fillStyle = '#ffe27a';
    g.fill();
    if (shine) for (let i = 0; i < 6; i++) sparkle(g, Math.cos(i + t * 2) * 26, -16 - Math.abs(Math.sin(i * 1.7 + t)) * 24, 5 * shine, '#fff4c0');
  },
});

/* ═════ 화면 (UI) ═════ */
add('sx11', '화면', '알림 딩동', {
  caption: '부드러운 종소리 두 음(높은 미 → 도)이 길게 울림 — 메시지 · 차례 알림',
  title: '딩동',
  color: '#5bb6ff',
  dur: 1.4,
  rec: (c, out, t0) => {
    const bell = (t: number, f: number): void => {
      tone(c, out, t, f, 1.0, 0.22, 'sine', 0.003);
      tone(c, out, t, f * 2, 0.4, 0.06, 'sine', 0.002);
      tone(c, out, t, f * 3.01, 0.2, 0.03, 'sine', 0.001);
    };
    bell(t0, 1318.5);
    bell(t0 + 0.28, 1046.5);
  },
  icon(g, k) {
    const sw = on01(k) ? Math.sin(k * 26) * (1 - k) * 0.5 : 0;
    g.save();
    g.translate(0, -24);
    g.rotate(sw);
    g.fillStyle = '#ffd24a';
    g.beginPath();
    g.moveTo(-18, 34);
    g.quadraticCurveTo(-18, 4, 0, 2);
    g.quadraticCurveTo(18, 4, 18, 34);
    g.lineTo(22, 40);
    g.lineTo(-22, 40);
    g.closePath();
    g.fill();
    circ(g, 0, 44, 5);
    g.fill();
    g.restore();
    rr(g, 10, -32, 20, 14, 7);
    g.fillStyle = '#ff5c6c';
    g.fill();
    txt(g, '1', 20, -25, 10, '#fff', 'center', 900);
    if (on01(k)) {
      waves(g, -26, -4, 6, 3, k * 2, '#9fd4ff', 0.6, Math.PI);
      waves(g, 26, -4, 6, 3, k * 2, '#9fd4ff', 0.6, 0);
    }
  },
});
add('sx12', '화면', '뽁 (팝업)', {
  caption: '사인파가 0.04초 만에 400 → 1300Hz 로 튀어 오르는 아주 짧은 「뽁」 — 창이 열릴 때',
  title: '뽁!',
  color: '#ff9f5b',
  dur: 0.15,
  rec: (c, out, t0) => {
    const o = osc(c, 'sine', 400, t0, 0.1);
    o.frequency.exponentialRampToValueAtTime(1300, t0 + 0.04);
    o.connect(envG(c, out, t0, 0.001, 0.02, 0.06, 0.5));
  },
  icon(g, k) {
    const s = on01(k) ? easeOut(k * 2) * (1 + Math.sin(clamp(k * 2) * Math.PI) * 0.2) : 0.0;
    g.save();
    g.scale(Math.max(0.05, s), Math.max(0.05, s));
    rr(g, -32, -22, 64, 40, 10);
    g.fillStyle = '#fff4e8';
    g.fill();
    g.beginPath();
    g.moveTo(-6, 18);
    g.lineTo(0, 28);
    g.lineTo(6, 18);
    g.fill();
    for (let i = 0; i < 3; i++) {
      rr(g, -22, -12 + i * 9, i === 2 ? 26 : 44, 5, 2.5);
      g.fillStyle = '#ffbf8a';
      g.fill();
    }
    g.restore();
  },
});
add('sx13', '화면', '보내기 슉', {
  caption: '잡음 띠를 위로 쓸고 끝에 짧은 올림음 — 메시지 · 편지가 날아가는 「슉」',
  title: '슈욱',
  color: '#5bd8c8',
  dur: 0.45,
  rec: (c, out, t0, _p, r) => {
    const b = nz(c, out, t0, 'bandpass', 600, 2, 0.08, 0.05, 0.2, 0.6, r);
    b.frequency.setValueAtTime(600, t0);
    b.frequency.exponentialRampToValueAtTime(5000, t0 + 0.3);
    const o = osc(c, 'sine', 700, t0 + 0.18, 0.15);
    o.frequency.exponentialRampToValueAtTime(1800, t0 + 0.3);
    o.connect(envG(c, out, t0 + 0.18, 0.005, 0.03, 0.1, 0.15));
  },
  icon(g, k) {
    const a = on01(k) ? easeOut(k) : 0;
    g.save();
    g.translate(-20 + a * 70, 10 - a * 50);
    g.rotate(-0.6);
    g.fillStyle = '#e8fffb';
    g.beginPath();
    g.moveTo(-16, 0);
    g.lineTo(18, -10);
    g.lineTo(0, 12);
    g.closePath();
    g.fill();
    g.fillStyle = '#9fe8de';
    g.beginPath();
    g.moveTo(18, -10);
    g.lineTo(-2, 4);
    g.lineTo(0, 12);
    g.fill();
    g.restore();
    if (on01(k)) {
      g.strokeStyle = rgba('#9fe8de', 1 - k);
      g.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.moveTo(-40 + a * 50 - i * 6, 26 - a * 40 + i * 8);
        g.lineTo(-24 + a * 50 - i * 6, 18 - a * 40 + i * 8);
        g.stroke();
      }
    }
  },
});
add('sx14', '화면', '타자기', {
  caption: '높은 잡음 「탁」 + 낮은 「톡」을 고르지 않은 간격으로, 끝에 맑은 종 「땡」',
  title: '타닥타닥 땡',
  color: '#c8b08a',
  dur: 1.5,
  rec: (c, out, t0, _p, r) => {
    let t = t0;
    for (let i = 0; i < 9; i++) {
      nz(c, out, t, 'highpass', 2500, 0.8, 0.0008, 0.004, 0.03, 0.55, r);
      thump(c, out, t, 300 + r() * 80, 120, 0.04, 0.35);
      t += 0.07 + r() * 0.08;
    }
    tone(c, out, t + 0.1, 2637, 0.5, 0.18, 'sine', 0.001);
    tone(c, out, t + 0.1, 2637 * 2.7, 0.2, 0.05, 'sine', 0.001);
  },
  icon(g, k) {
    rr(g, -34, 0, 68, 26, 6);
    g.fillStyle = '#3d3a52';
    g.fill();
    for (let r0 = 0; r0 < 2; r0++)
      for (let i = 0; i < 6; i++) {
        const hit = on01(k) && k < 0.75 && Math.floor(k * 12) % 6 === i && r0 === Math.floor(k * 12) % 2;
        circ(g, -25 + i * 10 + r0 * 4, 8 + r0 * 9 + (hit ? 2 : 0), 3.6);
        g.fillStyle = hit ? '#ffe9b8' : '#cfc6b0';
        g.fill();
      }
    rr(g, -24, -24, 48, 24, 2);
    g.fillStyle = '#fbf6ea';
    g.fill();
    const lines = on01(k) ? Math.floor(clamp(k / 0.75) * 9) : 9;
    g.fillStyle = '#7a7060';
    g.fillRect(-18, -18, Math.min(9, lines) * 3.8, 2.5);
    if (on01(k) && k > 0.78) {
      g.globalAlpha = 1 - clamp((k - 0.78) * 4);
      txt(g, '땡!', 26, -30, 12, '#ffe27a', 'center', 900);
      g.globalAlpha = 1;
    }
  },
});
add('sx15', '화면', '카메라 셔터', {
  caption: '짧은 「찰」 두 번(0.06초 간격, 잡음 띠) + 아주 짧은 기계음 — 사진 저장 · 화면 찍기',
  title: '찰칵',
  color: '#d0d6e8',
  dur: 0.35,
  rec: (c, out, t0, _p, r) => {
    nz(c, out, t0, 'bandpass', 2200, 1.2, 0.001, 0.01, 0.04, 0.8, r);
    nz(c, out, t0 + 0.07, 'bandpass', 1600, 1.2, 0.001, 0.015, 0.06, 0.7, r);
    thump(c, out, t0 + 0.07, 220, 90, 0.06, 0.3);
    const o = osc(c, 'sawtooth', 120, t0 + 0.12, 0.15);
    chain(o, filt(c, 'bandpass', 900, 3), envG(c, out, t0 + 0.12, 0.01, 0.08, 0.05, 0.05));
  },
  icon(g, k) {
    const fl = on01(k) ? fade(k * 2) : 0;
    rr(g, -32, -16, 64, 40, 7);
    g.fillStyle = '#3a3a52';
    g.fill();
    rr(g, -14, -24, 22, 10, 3);
    g.fill();
    circ(g, 0, 4, 15);
    g.fillStyle = '#1a1a2a';
    g.fill();
    circ(g, 0, 4, 9);
    g.fillStyle = '#4a6aa8';
    g.fill();
    circ(g, -3, 1, 3);
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.fill();
    if (fl) {
      g.fillStyle = `rgba(255,255,255,${fl * 0.85})`;
      g.fillRect(-50, -50, 100, 100);
    }
  },
});
add('sx16', '화면', '구겨서 버리기', {
  caption: '아주 짧은 높은 잡음 알갱이 수십 개를 흩뿌려 종이 구기는 소리 → 휴지통에 「툭」',
  title: '바스락 툭',
  color: '#c8c0a8',
  dur: 0.9,
  rec: (c, out, t0, _p, r) => {
    for (let i = 0; i < 38; i++) nz(c, out, t0 + r() * 0.55, 'bandpass', 1500 + r() * 5000, 2.5, 0.0005, 0.002, 0.01 + r() * 0.02, 0.15 + r() * 0.35, r);
    thump(c, out, t0 + 0.68, 200, 80, 0.1, 0.4);
  },
  icon(g, k) {
    // 휴지통
    rr(g, 8, 4, 30, 30, 3);
    g.fillStyle = '#5a6a8a';
    g.fill();
    g.fillRect(4, 0, 38, 5);
    const a = on01(k) ? k : 0;
    const crumple = clamp(a / 0.6);
    const fly = clamp((a - 0.6) / 0.15);
    const x = -22 + fly * 45;
    const y = -6 - Math.sin(fly * Math.PI) * 26 + fly * 12;
    if (a < 0.76) {
      g.save();
      g.translate(x, y);
      g.fillStyle = '#f3eedc';
      g.beginPath();
      const n = 10;
      for (let i = 0; i < n; i++) {
        const an = (i / n) * TAU;
        const rad = (16 - crumple * 7) * (1 + (hash(i) - 0.5) * crumple * 0.7);
        g.lineTo(Math.cos(an) * rad, Math.sin(an) * rad);
      }
      g.fill();
      g.strokeStyle = 'rgba(120,110,80,0.5)';
      g.lineWidth = 1;
      g.stroke();
      g.restore();
    }
  },
});
add('sx17', '화면', '잠금 해제', {
  caption: '두 번 「딸깍」 뒤 올라가는 두 음 — 새 단계 · 새 아이템 열림',
  title: '딸깍 띠링',
  color: '#7be08a',
  dur: 0.55,
  rec: (c, out, t0, _p, r) => {
    nz(c, out, t0, 'bandpass', 3000, 2, 0.0006, 0.003, 0.02, 0.8, r);
    nz(c, out, t0 + 0.07, 'bandpass', 2200, 2, 0.0006, 0.003, 0.025, 0.8, r);
    tone(c, out, t0 + 0.16, 880, 0.12, 0.2, 'triangle', 0.002);
    tone(c, out, t0 + 0.25, 1318.5, 0.28, 0.2, 'triangle', 0.002);
  },
  icon(g, k) {
    const up = on01(k) ? clamp((k - 0.1) / 0.2) : 0;
    g.strokeStyle = '#c8d0e8';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(0, -8 - up * 10, 12, Math.PI, 0);
    g.lineTo(12, 4 - up * 10 + (up ? 0 : 0));
    g.stroke();
    g.beginPath();
    g.moveTo(-12, -8 - up * 10);
    g.lineTo(-12, 0);
    g.stroke();
    rr(g, -20, 0, 40, 30, 5);
    g.fillStyle = up ? '#7be08a' : '#ffc14a';
    g.fill();
    circ(g, 0, 12, 4);
    g.fillStyle = '#3a3a52';
    g.fill();
    g.fillRect(-1.5, 12, 3, 8);
    if (up) for (let i = 0; i < 4; i++) sparkle(g, Math.cos(i * 1.6) * 30, -10 + Math.sin(i * 1.6) * 20, 4 * (1 - clamp(k)), '#d8ffe2');
  },
});
add('sx18', '화면', '눈금 다이얼', {
  caption: '돌릴수록 「틱틱틱」 간격이 좁아지고 음이 올라감 — 값 바꾸기 · 슬라이더',
  title: '틱틱틱틱',
  color: '#ffb84a',
  dur: 0.8,
  rec: (c, out, t0, _p, r) => {
    let t = t0;
    for (let i = 0; i < 12; i++) {
      tone(c, out, t, 1800 + i * 120, 0.012, 0.25, 'triangle', 0.0005);
      nz(c, out, t, 'highpass', 4000, 1, 0.0005, 0.001, 0.008, 0.2, r);
      t += 0.09 * Math.pow(0.88, i);
    }
  },
  icon(g, k) {
    const a = on01(k) ? easeOut(k) : 0;
    circ(g, 0, 4, 28);
    g.fillStyle = '#2a2744';
    g.fill();
    for (let i = 0; i < 12; i++) {
      const an = Math.PI * 0.75 + (i / 11) * Math.PI * 1.5;
      g.strokeStyle = i / 11 <= a ? '#ffb84a' : '#4a456e';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(Math.cos(an) * 22, 4 + Math.sin(an) * 22);
      g.lineTo(Math.cos(an) * 27, 4 + Math.sin(an) * 27);
      g.stroke();
    }
    const an = Math.PI * 0.75 + a * Math.PI * 1.5;
    circ(g, 0, 4, 16);
    g.fillStyle = '#4a456e';
    g.fill();
    g.strokeStyle = '#fff';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, 4);
    g.lineTo(Math.cos(an) * 13, 4 + Math.sin(an) * 13);
    g.stroke();
  },
});

/* ═════ 전투 ═════ */
add('sx19', '전투', '칼 휘두르기', {
  caption: '좁은 잡음 띠가 빠르게 위로 쓸리고 왼쪽 → 오른쪽으로 — 「쉭」',
  title: '쉬익',
  color: '#c8e0ff',
  dur: 0.3,
  rec: (c, out, t0, _p, r) => {
    const n = noise(c, t0, 0.28, r);
    const b = filt(c, 'bandpass', 1200, 6);
    b.frequency.setValueAtTime(1200, t0);
    b.frequency.exponentialRampToValueAtTime(6000, t0 + 0.16);
    b.frequency.exponentialRampToValueAtTime(2500, t0 + 0.26);
    const p = c.createStereoPanner();
    p.pan.setValueAtTime(-0.8, t0);
    p.pan.linearRampToValueAtTime(0.8, t0 + 0.25);
    const e = c.createGain();
    e.gain.setValueAtTime(0.0001, t0);
    e.gain.exponentialRampToValueAtTime(1, t0 + 0.12);
    e.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.27);
    chain(n, b, e, p, out);
  },
  icon(g, k) {
    const a = on01(k) ? easeOut(k * 1.2) : 0;
    const an = -2.2 + a * 2.6;
    if (on01(k)) {
      g.strokeStyle = rgba('#c8e0ff', 0.6 * (1 - k));
      g.lineWidth = 12;
      g.beginPath();
      g.arc(-10, 20, 40, -2.2, an);
      g.stroke();
    }
    g.save();
    g.translate(-10, 20);
    g.rotate(an + Math.PI / 2);
    g.fillStyle = '#e8eef8';
    g.beginPath();
    g.moveTo(-3, -6);
    g.lineTo(0, -46);
    g.lineTo(3, -6);
    g.fill();
    g.fillStyle = '#ffc14a';
    g.fillRect(-9, -7, 18, 4);
    g.fillStyle = '#7a4a2a';
    g.fillRect(-2.5, -3, 5, 12);
    g.restore();
  },
});
add('sx20', '전투', '칼 부딪힘', {
  caption: '어긋난 배음(1 · 2.32 · 4.25 · 6.63배)의 쇠 울림 + 짧은 잡음 — 「챙!」',
  title: '챙!',
  color: '#9fd4ff',
  dur: 1.3,
  rec: (c, out, t0, _p, r) => {
    const w = wet(c, out, 0.8, 0.3);
    nz(c, w, t0, 'highpass', 3000, 0.7, 0.0005, 0.005, 0.05, 0.7, r);
    metal(c, w, t0, 1150, 1.1, 0.25);
    metal(c, w, t0 + 0.004, 1380, 0.6, 0.1);
  },
  icon(g, k) {
    const a = on01(k);
    const sh = a ? Math.sin(k * 80) * 3 * (1 - k) : 0;
    for (const s of [-1, 1]) {
      g.save();
      g.translate(s * 16 + sh * s, 18);
      g.rotate(s * 0.7);
      g.fillStyle = '#e8eef8';
      g.beginPath();
      g.moveTo(-3, 0);
      g.lineTo(0, -46);
      g.lineTo(3, 0);
      g.fill();
      g.fillStyle = '#ffc14a';
      g.fillRect(-8, -1, 16, 4);
      g.restore();
    }
    if (a) {
      const f = 1 - clamp(k * 1.5);
      star(g, 0, -16, 6 + 14 * f, 8, 0.35, k);
      g.fillStyle = rgba('#fff6c0', f);
      g.fill();
      for (let i = 0; i < 8; i++) {
        const an = hash(i) * TAU;
        sparkle(g, Math.cos(an) * k * 40, -16 + Math.sin(an) * k * 30 + k * k * 20, 3.5 * f, '#ffe9a0');
      }
    }
  },
});
add('sx21', '전투', '화살 슝 탁', {
  caption: '짧은 바람 소리가 지나간 뒤 나무 과녁에 「탁」(낮은 쿵 + 띠 잡음) — 날아가서 꽂히기',
  title: '슝… 탁!',
  color: '#c8a070',
  dur: 0.7,
  rec: (c, out, t0, _p, r) => {
    const b = nz(c, out, t0, 'bandpass', 2000, 3, 0.05, 0.1, 0.15, 0.5, r);
    b.frequency.exponentialRampToValueAtTime(900, t0 + 0.3);
    thump(c, out, t0 + 0.33, 260, 90, 0.12, 0.7);
    nz(c, out, t0 + 0.33, 'bandpass', 900, 2, 0.001, 0.01, 0.08, 0.6, r);
    const o = osc(c, 'triangle', 180, t0 + 0.34, 0.3);
    const lfo = osc(c, 'sine', 30, t0 + 0.34, 0.3);
    const lg = gainN(c, 20);
    chain(lfo, lg);
    lg.connect(o.frequency);
    o.connect(envG(c, out, t0 + 0.34, 0.002, 0.02, 0.25, 0.12));
  },
  icon(g, k) {
    // 과녁
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.ellipse(34, 0, 8 - i * 1.6, 26 - i * 6, 0, 0, TAU);
      g.fillStyle = i % 2 ? '#fff' : '#ff5c5c';
      g.fill();
    }
    const fly = on01(k) ? clamp(k / 0.47) : k > 1 ? 1 : 0;
    const x = -44 + fly * 72;
    const quiver = on01(k) && k > 0.47 ? Math.sin(k * 90) * 0.12 * (1 - k) : 0;
    g.save();
    g.translate(x, 0);
    g.rotate(quiver);
    g.strokeStyle = '#a07a50';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(-30, 0);
    g.lineTo(0, 0);
    g.stroke();
    g.fillStyle = '#d0d6e8';
    g.beginPath();
    g.moveTo(6, 0);
    g.lineTo(-2, -4);
    g.lineTo(-2, 4);
    g.fill();
    g.fillStyle = '#ff7a5c';
    g.beginPath();
    g.moveTo(-30, 0);
    g.lineTo(-36, -6);
    g.lineTo(-24, 0);
    g.lineTo(-36, 6);
    g.fill();
    g.restore();
  },
});
add('sx22', '전투', '펀치 퍽', {
  caption: '낮은 사인 150 → 45Hz 「쿵」 + 저역 잡음 덩이 + 찌그러짐 — 묵직한 「퍽」',
  title: '퍽!',
  color: '#ff7a5c',
  dur: 0.3,
  rec: (c, out, t0, _p, r) => {
    const sh = shaper(c, 8);
    sh.connect(out);
    thump(c, sh, t0, 150, 45, 0.2, 0.9);
    nz(c, sh, t0, 'lowpass', 1800, 0.8, 0.001, 0.01, 0.08, 0.7, r);
    nz(c, out, t0, 'bandpass', 3500, 1.5, 0.0005, 0.002, 0.02, 0.4, r);
  },
  icon(g, k) {
    ground(g, 34);
    const a = on01(k);
    const hit = a ? 1 - clamp(k * 2) : 0;
    const x = a ? -8 + Math.min(1, k * 6) * 14 : -26;
    blob(g, 22 + hit * 6, 18, 14, '#8fb6ff', 1 - hit * 0.25, 1 + hit * 0.1, a && k < 0.7 ? 'ouch' : 'calm');
    // 주먹
    rr(g, x - 16, 0, 22, 18, 7);
    g.fillStyle = '#ff9a7a';
    g.fill();
    g.fillStyle = '#d06a4a';
    for (let i = 0; i < 3; i++) g.fillRect(x - 2, 3 + i * 5, 6, 1.6);
    if (hit > 0) {
      star(g, 10, 8, 10 + (1 - hit) * 10, 8, 0.4, k);
      g.fillStyle = rgba('#ffe36a', hit);
      g.fill();
    }
  },
});
add('sx23', '전투', '방패 막기', {
  caption: '낮은 쇠 울림(300Hz 비조화) + 둔한 쿵 — 「텅!」, 칼보다 무겁고 짧게',
  title: '텅!',
  color: '#b8c4d8',
  dur: 0.7,
  rec: (c, out, t0, _p, r) => {
    thump(c, out, t0, 180, 70, 0.15, 0.7);
    metal(c, out, t0, 310, 0.55, 0.3, [1, 1.59, 2.14, 2.83, 3.9]);
    nz(c, out, t0, 'bandpass', 1500, 1, 0.001, 0.01, 0.06, 0.5, r);
  },
  icon(g, k) {
    const a = on01(k);
    const push = a ? Math.sin(clamp(k * 3) * Math.PI) * 4 : 0;
    g.save();
    g.translate(-push, 0);
    g.fillStyle = '#7a8aa8';
    g.beginPath();
    g.moveTo(-6, -30);
    g.quadraticCurveTo(18, -28, 22, -24);
    g.quadraticCurveTo(22, 14, -6, 32);
    g.quadraticCurveTo(-34, 14, -34, -24);
    g.quadraticCurveTo(-30, -28, -6, -30);
    g.fill();
    g.strokeStyle = '#d8e0f0';
    g.lineWidth = 3;
    g.stroke();
    star(g, -6, -2, 9);
    g.fillStyle = '#ffc14a';
    g.fill();
    g.restore();
    if (a) {
      g.globalAlpha = fade(k * 1.5);
      burst(g, 26, -10, 18, 6, '#ffffff', 1, 3);
      g.globalAlpha = 1;
    }
  },
});
add('sx24', '전투', '광선총 뿅뿅', {
  caption: '네모파가 0.08초 만에 1400 → 280Hz 로 떨어지는 「뿅」 세 번',
  title: '뿅뿅뿅',
  color: '#7af0a8',
  dur: 0.55,
  rec: (c, out, t0) => {
    for (let i = 0; i < 3; i++) {
      const t = t0 + i * 0.15;
      const o = osc(c, 'square', 1400, t, 0.1);
      o.frequency.exponentialRampToValueAtTime(280, t + 0.09);
      chain(o, filt(c, 'lowpass', 5000), envG(c, out, t, 0.001, 0.02, 0.07, 0.2));
    }
  },
  icon(g, k, t) {
    rr(g, -42, -6, 26, 12, 4);
    g.fillStyle = '#5a5a7a';
    g.fill();
    rr(g, -36, 4, 8, 12, 2);
    g.fill();
    if (on01(k))
      for (let i = 0; i < 3; i++) {
        const kk = (k * 0.55 - i * 0.15) / 0.3;
        if (kk < 0 || kk > 1) continue;
        const x = -14 + kk * 64;
        g.save();
        g.shadowColor = '#7af0a8';
        g.shadowBlur = 10;
        rr(g, x, -2.5, 14, 5, 2.5);
        g.fillStyle = '#d8ffe6';
        g.fill();
        g.restore();
      }
    circ(g, -14, 0, 3 + (on01(k) ? Math.abs(Math.sin(t * 40)) * 3 : 0));
    g.fillStyle = '#7af0a8';
    g.fill();
  },
});
add('sx25', '전투', '대포', {
  caption: '낮은 사인 60 → 25Hz + 닫히는 저역 잡음 1.2초 + 앞머리 「딱」 — 멀리까지 울리는 「쾅ー」',
  title: '쿠웅!',
  color: '#ff9a4a',
  dur: 1.6,
  lo: 30,
  rec: (c, out, t0, _p, r) => {
    nz(c, out, t0, 'highpass', 2000, 0.7, 0.0005, 0.005, 0.04, 0.6, r);
    thump(c, out, t0, 70, 25, 0.9, 1);
    const b = nz(c, out, t0, 'lowpass', 1200, 0.7, 0.005, 0.05, 1.3, 0.8, r, true);
    b.frequency.exponentialRampToValueAtTime(150, t0 + 1.2);
  },
  icon(g, k) {
    ground(g, 32);
    const rec = on01(k) ? Math.sin(clamp(k * 4) * Math.PI) * 5 : 0;
    g.save();
    g.translate(-rec, 0);
    g.save();
    g.translate(-8, 8);
    g.rotate(-0.35);
    rr(g, -8, -9, 44, 18, 8);
    g.fillStyle = '#3a3a4e';
    g.fill();
    g.restore();
    circ(g, -12, 22, 10);
    g.fillStyle = '#7a4a2a';
    g.fill();
    circ(g, -12, 22, 3);
    g.fillStyle = '#c8a070';
    g.fill();
    g.restore();
    if (on01(k)) {
      const e = easeOut(k * 2);
      for (let i = 0; i < 4; i++) {
        circ(g, 30 + e * (10 + i * 8), -6 - e * i * 4, 8 + e * 10 - i);
        g.fillStyle = `rgba(200,190,200,${0.5 * (1 - clamp(k))})`;
        g.fill();
      }
      g.globalAlpha = fade(k * 3);
      star(g, 30, -6, 14, 8, 0.45);
      g.fillStyle = '#ffd36a';
      g.fill();
      g.globalAlpha = 1;
    }
  },
});
add('sx26', '전투', '전기 지지직', {
  caption: '60Hz 톱니파 웅웅 소리를 마구잡이로 켰다 껐다 + 높은 잡음 「틱」 — 감전 · 전기 함정',
  title: '지지직',
  color: '#ffe84a',
  dur: 1.1,
  rec: (c, out, t0, _p, r) => {
    const o = osc(c, 'sawtooth', 60, t0, 1.05);
    const gate = c.createGain();
    gate.gain.setValueAtTime(0, t0);
    for (let t = 0; t < 1; t += 0.02) gate.gain.setValueAtTime(r() < 0.55 ? 0.2 + r() * 0.3 : 0, t0 + t);
    gate.gain.setValueAtTime(0, t0 + 1.0);
    chain(o, filt(c, 'highpass', 200), gate, out);
    for (let i = 0; i < 18; i++) nz(c, out, t0 + r() * 0.95, 'highpass', 5000, 0.7, 0.0003, 0.002, 0.01, 0.3, r);
  },
  icon(g, k, t) {
    const a = on01(k);
    ground(g, 32);
    blob(g, 0, 16, 15, a ? (Math.floor(t * 30) % 2 ? '#ffffff' : '#ffe84a') : '#8fb6ff', 1, 1, a ? 'ouch' : 'calm');
    if (a) {
      g.strokeStyle = '#fff6a0';
      g.lineWidth = 2.5;
      for (let j = 0; j < 3; j++) {
        g.beginPath();
        let x = -30 + j * 30;
        let y = -40;
        g.moveTo(x, y);
        for (let i = 0; i < 5; i++) {
          x += (hash(i + j * 7 + Math.floor(t * 20)) - 0.5) * 16;
          y += 10;
          g.lineTo(x, y);
        }
        g.stroke();
      }
    }
  },
});

/* ═════ 마법 ═════ */
add('sx27', '마법', '마법 반짝', {
  caption: '높은 5음계 사인 「핑」 여러 개를 흩뿌리고 아주 높은 잡음으로 반짝임 — 요정 가루',
  title: '반짝반짝',
  color: '#c8a0ff',
  dur: 1.3,
  rec: (c, out, t0, _p, r) => {
    const w = wet(c, out, 1.2, 0.4);
    for (let i = 0; i < 14; i++) {
      const n = PENTA[Math.floor(r() * 5)]! + 12 * Math.floor(r() * 2);
      tone(c, w, t0 + i * 0.06 + r() * 0.03, 1567.98 * st2(n), 0.35, 0.08, 'sine', 0.002);
    }
    nz(c, w, t0, 'highpass', 8000, 0.7, 0.1, 0.5, 0.5, 0.06, r);
  },
  icon(g, k, t) {
    // 지팡이
    g.save();
    g.translate(-20, 28);
    g.rotate(0.6 + (on01(k) ? Math.sin(k * 8) * 0.3 : 0));
    g.fillStyle = '#7a5aa8';
    g.fillRect(-2, -40, 4, 40);
    star(g, 0, -44, 9);
    g.fillStyle = '#ffe36a';
    g.fill();
    g.restore();
    if (on01(k))
      for (let i = 0; i < 14; i++) {
        const kk = clamp((k - i * 0.05) * 2);
        if (kk <= 0 || kk >= 1) continue;
        const x = -4 + hash(i) * 50 * kk;
        const y = -24 - hash(i + 4) * 30 * kk + kk * kk * 20;
        sparkle(g, x, y, 5 * (1 - kk), ['#ffe0ff', '#d8c8ff', '#fff6c8'][i % 3]);
      }
    else sparkle(g, 6 + Math.sin(t * 3) * 2, -20, 3, '#ffe0ff');
  },
});
add('sx28', '마법', '회복 힐', {
  caption: '세모파 화음(도 · 미 · 솔)이 천천히 부풀고 위로 오르는 반짝 아르페지오 — 따뜻한 「샤라랑」',
  title: '샤라랑',
  color: '#7be0a0',
  dur: 1.9,
  rec: (c, out, t0) => {
    const w = wet(c, out, 1.5, 0.35);
    for (const n of [0, 4, 7]) {
      for (const det of [-7, 7]) {
        const o = osc(c, 'triangle', 523.25 * st2(n), t0, 1.8);
        o.detune.value = det;
        o.connect(envG(c, w, t0, 0.5, 0.5, 0.7, 0.05));
      }
    }
    [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => tone(c, w, t0 + 0.3 + i * 0.1, 1046.5 * st2(n), 0.4, 0.07, 'sine', 0.003));
  },
  icon(g, k, t) {
    ground(g, 34);
    const a = on01(k) ? Math.sin(clamp(k) * Math.PI) : 0;
    glow(g, 0, 14, 40, '#7be0a0', a * 0.6);
    blob(g, 0, 18, 14, '#ffb0c8', 1, 1, a > 0.3 ? 'happy' : 'calm');
    if (on01(k))
      for (let i = 0; i < 6; i++) {
        const y = 30 - ((k * 60 + i * 12) % 70);
        g.globalAlpha = a;
        txt(g, '+', Math.sin(i * 2.1) * 24, y, 12 + (i % 2) * 4, '#c8ffd8', 'center', 900);
        g.globalAlpha = 1;
      }
    void t;
  },
});
add('sx29', '마법', '얼음 마법', {
  caption: '높은 유리 같은 FM 음(비율 1.41)이 흩어지고 끝에 「쩍」 금 가는 잡음 — 얼어붙기',
  title: '쨍그랑',
  color: '#9fe8ff',
  dur: 1.2,
  rec: (c, out, t0, _p, r) => {
    const w = wet(c, out, 1.0, 0.35);
    for (let i = 0; i < 7; i++) {
      const t = t0 + i * 0.07;
      const f = 2400 + r() * 2400;
      const car = osc(c, 'sine', f, t, 0.5);
      const mod = osc(c, 'sine', f * 1.41, t, 0.5);
      const mg = gainN(c, f * 0.6);
      chain(mod, mg);
      mg.connect(car.frequency);
      car.connect(envG(c, w, t, 0.001, 0.01, 0.4, 0.07));
    }
    nz(c, w, t0 + 0.55, 'highpass', 2500, 0.7, 0.0005, 0.01, 0.12, 0.5, r);
  },
  icon(g, k) {
    const a = on01(k) ? clamp(k / 0.5) : k > 1 ? 1 : 0;
    blob(g, 0, 14, 15, '#8fb6ff', 1, 1, 'calm');
    if (a > 0) {
      g.fillStyle = `rgba(190,240,255,${0.65 * a})`;
      g.beginPath();
      const n = 8;
      for (let i = 0; i < n; i++) {
        const an = (i / n) * TAU;
        const rad = 24 * a * (i % 2 ? 0.8 : 1.1);
        g.lineTo(Math.cos(an) * rad, 14 + Math.sin(an) * rad);
      }
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.lineWidth = 1.5;
      g.stroke();
    }
    if (on01(k) && k > 0.46) {
      g.strokeStyle = '#ffffff';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(-8, -6);
      g.lineTo(-2, 8);
      g.lineTo(-10, 18);
      g.moveTo(-2, 8);
      g.lineTo(8, 14);
      g.stroke();
    }
    for (let i = 0; i < 3; i++) {
      const an = i * 2.1 + (on01(k) ? k * 3 : 0);
      g.save();
      g.translate(Math.cos(an) * 34, -14 + Math.sin(an) * 12);
      g.strokeStyle = '#d8f6ff';
      g.lineWidth = 1.6;
      for (let j = 0; j < 3; j++) {
        g.rotate(Math.PI / 3);
        g.beginPath();
        g.moveTo(-5, 0);
        g.lineTo(5, 0);
        g.stroke();
      }
      g.restore();
    }
  },
});
add('sx30', '마법', '불꽃 화르륵', {
  caption: '갈색 잡음 띠를 위로 열었다 닫고, 장작 튀는 「탁」 알갱이를 흩뿌림 — 불 마법 · 횃불 켜기',
  title: '화르륵',
  color: '#ff7a3a',
  dur: 1.4,
  rec: (c, out, t0, _p, r) => {
    const n = noise(c, t0, 1.35, r, true);
    const b = filt(c, 'bandpass', 300, 0.8);
    b.frequency.setValueAtTime(300, t0);
    b.frequency.exponentialRampToValueAtTime(1800, t0 + 0.35);
    b.frequency.exponentialRampToValueAtTime(500, t0 + 1.3);
    chain(n, b, envG(c, out, t0, 0.15, 0.4, 0.8, 1.0));
    for (let i = 0; i < 16; i++) nz(c, out, t0 + 0.1 + r() * 1.1, 'bandpass', 2000 + r() * 3000, 2, 0.0005, 0.002, 0.015, 0.25, r);
  },
  icon(g, k, t) {
    const a = on01(k) ? Math.sin(clamp(k) * Math.PI) : 0;
    g.fillStyle = '#6a4a2a';
    g.save();
    g.translate(0, 28);
    g.rotate(0.3);
    rr(g, -24, -4, 48, 8, 4);
    g.fill();
    g.rotate(-0.6);
    rr(g, -24, -4, 48, 8, 4);
    g.fill();
    g.restore();
    const h = 14 + a * 34;
    for (const [col, s] of [
      ['#ff5a2a', 1],
      ['#ffb03a', 0.7],
      ['#fff2a0', 0.4],
    ] as const) {
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(-16 * s, 26);
      g.quadraticCurveTo(-18 * s, 26 - h * 0.5, Math.sin(t * 9) * 4 * s, 26 - h * s - 6);
      g.quadraticCurveTo(18 * s, 26 - h * 0.5, 16 * s, 26);
      g.fill();
    }
    if (a > 0) for (let i = 0; i < 5; i++) sparkle(g, Math.sin(i * 2 + t * 4) * 18, 10 - ((t * 40 + i * 13) % 50), 2.5, '#ffd08a');
  },
});
add('sx31', '마법', '기 모으기', {
  caption: '톱니파가 1.2초 동안 100 → 900Hz 로 오르며 떨림이 빨라지고, 다 모이면 「팅」 — 차지 공격',
  title: '우우웅… 팅!',
  color: '#5bd0ff',
  dur: 1.6,
  rec: (c, out, t0, _p, r) => {
    const o = osc(c, 'sawtooth', 100, t0, 1.25);
    o.frequency.exponentialRampToValueAtTime(900, t0 + 1.2);
    const trem = c.createGain();
    trem.gain.value = 0.5;
    const lfo = osc(c, 'sine', 4, t0, 1.25);
    lfo.frequency.exponentialRampToValueAtTime(30, t0 + 1.2);
    const lg = gainN(c, 0.5);
    chain(lfo, lg);
    lg.connect(trem.gain);
    chain(o, filt(c, 'lowpass', 2500), trem, envG(c, out, t0, 0.6, 0.55, 0.06, 0.18));
    nz(c, out, t0, 'bandpass', 3000, 1, 1.0, 0.15, 0.05, 0.1, r);
    tone(c, out, t0 + 1.22, 1760, 0.35, 0.25, 'triangle', 0.001);
    tone(c, out, t0 + 1.22, 3520, 0.2, 0.08, 'sine', 0.001);
  },
  icon(g, k, t) {
    ground(g, 34);
    const a = on01(k) ? clamp(k / 0.76) : 0;
    glow(g, 0, 14, 20 + a * 30, '#5bd0ff', 0.25 + a * 0.5);
    blob(g, 0, 18, 14, '#5bd0ff', 1, 1, a > 0.95 ? 'happy' : 'calm');
    if (on01(k) && a < 1)
      for (let i = 0; i < 8; i++) {
        const an = (i / 8) * TAU + t * 2;
        const rad = 44 * (1 - ((t * 1.5 + i * 0.13) % 1));
        sparkle(g, Math.cos(an) * rad, 14 + Math.sin(an) * rad, 3, '#d8f4ff');
      }
    if (on01(k) && k > 0.76) {
      g.globalAlpha = 1 - clamp((k - 0.76) * 4);
      burst(g, 0, 14, 40, 12, '#ffffff', 1, 3);
      g.globalAlpha = 1;
    }
  },
});
add('sx32', '마법', '어둠 · 저주', {
  caption: '아주 낮은 톱니파 두 개(55 · 58Hz)가 맥놀이로 울렁이고 저역 필터가 천천히 열림 — 「우우웅」 불길함',
  title: '우우웅…',
  color: '#a05bff',
  dur: 2.0,
  lo: 30,
  rec: (c, out, t0) => {
    const lp = filt(c, 'lowpass', 200, 3);
    lp.frequency.setValueAtTime(150, t0);
    lp.frequency.exponentialRampToValueAtTime(900, t0 + 1.2);
    lp.frequency.exponentialRampToValueAtTime(200, t0 + 1.95);
    lp.connect(envG(c, out, t0, 0.6, 0.6, 0.7, 0.35));
    for (const f of [55, 58.3, 110.5]) osc(c, 'sawtooth', f, t0, 1.95).connect(lp);
  },
  icon(g, k, t) {
    const a = on01(k) ? Math.sin(clamp(k) * Math.PI) : 0;
    for (let i = 0; i < 6; i++) {
      const an = i * 1.1 + t * 0.8;
      circ(g, Math.cos(an) * (16 + a * 12), 4 + Math.sin(an) * (10 + a * 8), 10 + a * 6);
      g.fillStyle = `rgba(80,30,140,${0.25 + a * 0.35})`;
      g.fill();
    }
    // 눈 둘
    for (const s of [-1, 1]) {
      g.fillStyle = rgba('#ff4dff', 0.4 + a * 0.6);
      g.beginPath();
      g.ellipse(s * 8, 2, 4, 2 + a * 1.5, s * 0.3, 0, TAU);
      g.fill();
    }
  },
});

/* ═════ 자연 ═════ */
add('sx33', '자연', '천둥', {
  caption: '높은 잡음 「쩍」 뒤로 갈색 잡음 우르릉이 덩어리져 2.5초 — 멀어질수록 낮게',
  title: '우르릉 쾅',
  color: '#c8d0ff',
  dur: 3.0,
  lo: 30,
  rec: (c, out, t0, _p, r) => {
    nz(c, out, t0, 'highpass', 1500, 0.7, 0.001, 0.02, 0.15, 0.8, r);
    const n = noise(c, t0, 2.9, r, true);
    const lp = filt(c, 'lowpass', 600, 0.7);
    lp.frequency.setValueAtTime(900, t0);
    lp.frequency.exponentialRampToValueAtTime(120, t0 + 2.8);
    const e = c.createGain();
    e.gain.setValueAtTime(0.0001, t0);
    let t = 0.03;
    while (t < 2.6) {
      const v = (1 - t / 2.8) * (0.4 + r() * 0.6);
      e.gain.exponentialRampToValueAtTime(Math.max(0.001, v), t0 + t);
      t += 0.08 + r() * 0.22;
    }
    e.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.9);
    chain(n, lp, e, out);
  },
  icon(g, k, t) {
    const fl = on01(k) ? fade(k * 6) : 0;
    if (fl) {
      g.fillStyle = `rgba(230,235,255,${fl * 0.5})`;
      g.fillRect(-50, -50, 100, 100);
    }
    for (let i = 0; i < 4; i++) {
      circ(g, -24 + i * 16, -18 + (i % 2) * 4, 14);
      g.fillStyle = '#5a5f80';
      g.fill();
    }
    if (on01(k) && k < 0.25) {
      g.fillStyle = '#fff6a0';
      g.beginPath();
      g.moveTo(2, -6);
      g.lineTo(-10, 14);
      g.lineTo(0, 14);
      g.lineTo(-8, 36);
      g.lineTo(12, 8);
      g.lineTo(2, 8);
      g.lineTo(10, -6);
      g.fill();
    }
    g.strokeStyle = 'rgba(160,190,255,0.6)';
    g.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      const x = -30 + i * 12;
      const y = ((t * 60 + i * 17) % 30) + 4;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x - 2, y + 6);
      g.stroke();
    }
  },
});
add('sx34', '자연', '새 지저귐', {
  caption: '사인파가 아주 빠르게 3 → 5kHz 로 휘는 「찌」 여러 번 + 살짝 FM — 숲 · 아침',
  title: '찌르르 짹',
  color: '#ffd24a',
  dur: 1.4,
  rec: (c, out, t0, _p, r) => {
    const chirp = (t: number, f0: number, f1: number, d: number, v: number): void => {
      const o = osc(c, 'sine', f0, t, d);
      o.frequency.exponentialRampToValueAtTime(f1, t + d);
      const m = osc(c, 'sine', 60, t, d);
      const mg = gainN(c, 300);
      chain(m, mg);
      mg.connect(o.frequency);
      o.connect(envG(c, out, t, 0.005, d * 0.3, d * 0.6, v));
    };
    let t = t0;
    for (let i = 0; i < 5; i++) {
      chirp(t, 3000 + r() * 400, 4800 + r() * 600, 0.05, 0.15);
      t += 0.07;
    }
    chirp(t + 0.15, 4200, 2600, 0.18, 0.18);
    chirp(t + 0.45, 3400, 5200, 0.08, 0.15);
    chirp(t + 0.56, 3400, 5200, 0.08, 0.15);
  },
  icon(g, k, t) {
    // 나뭇가지
    g.strokeStyle = '#8a5a3a';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(-48, 26);
    g.lineTo(48, 20);
    g.stroke();
    const sing = on01(k) ? Math.abs(Math.sin(k * 30)) : 0;
    g.save();
    g.translate(0, 8 + Math.sin(t * 4) * 1);
    circ(g, 0, 0, 14);
    g.fillStyle = '#ffd24a';
    g.fill();
    circ(g, 9, -10, 9);
    g.fill();
    eyes(g, 9, -12, 9);
    g.fillStyle = '#ff8a3a';
    g.beginPath();
    g.moveTo(17, -11 - sing * 2);
    g.lineTo(26, -9);
    g.lineTo(17, -7 + sing * 2);
    g.fill();
    g.fillStyle = '#e0a830';
    g.beginPath();
    g.ellipse(-4, 2, 9, 5, -0.4, 0, TAU);
    g.fill();
    g.restore();
    if (on01(k)) {
      note(g, 30, -22 - k * 10, 5, '#fff2b8', 1 - k);
      note(g, 40, -34 - k * 8, 4, '#fff2b8', clamp(1.3 - k * 1.5));
    }
  },
});
add('sx35', '자연', '귀뚜라미', {
  caption: '4.5kHz 사인을 30Hz 로 끊어 「찌르르르」 묶음을 되풀이 — 밤 · 풀밭',
  title: '찌르르르',
  color: '#9be05b',
  dur: 1.6,
  rec: (c, out, t0) => {
    const o = osc(c, 'sine', 4500, t0, 1.6);
    const gate = c.createGain();
    gate.gain.setValueAtTime(0, t0);
    for (let b = 0; b < 4; b++)
      for (let i = 0; i < 4; i++) {
        const t = t0 + b * 0.38 + i * 0.033;
        gate.gain.setValueAtTime(0, t);
        gate.gain.linearRampToValueAtTime(0.18, t + 0.006);
        gate.gain.linearRampToValueAtTime(0, t + 0.026);
      }
    chain(o, gate, out);
  },
  icon(g, k, t) {
    // 달 + 풀
    circ(g, 30, -28, 10);
    g.fillStyle = '#fff4c0';
    g.fill();
    g.strokeStyle = '#5a9a4a';
    g.lineWidth = 2.5;
    for (let i = 0; i < 9; i++) {
      const x = -44 + i * 11;
      g.beginPath();
      g.moveTo(x, 34);
      g.quadraticCurveTo(x + 4, 18, x + 2 + Math.sin(t * 2 + i) * 3, 6 + (i % 3) * 5);
      g.stroke();
    }
    const vib = on01(k) ? Math.sin(t * 120) * 1.5 : 0;
    g.fillStyle = '#4a7a2a';
    g.beginPath();
    g.ellipse(-4, 20, 13, 5, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#7ab04a';
    g.beginPath();
    g.ellipse(-2, 17 + vib, 11, 4, -0.15, 0, TAU);
    g.fill();
    g.strokeStyle = '#4a7a2a';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(8, 18);
    g.quadraticCurveTo(20, 4, 28, 6);
    g.stroke();
    if (on01(k)) waves(g, -2, 12, 4, 3, t * 2, '#d8ffb8', 0.6, -Math.PI / 2);
  },
});
add('sx36', '자연', '파도', {
  caption: '잡음의 저역 필터가 300 → 2200Hz 로 열렸다 닫히며 소리도 부풀었다 빠짐 — 「쏴아아…」',
  title: '쏴아아',
  color: '#5bb6ff',
  dur: 3.0,
  rec: (c, out, t0, _p, r) => {
    const n = noise(c, t0, 2.95, r);
    const lp = filt(c, 'lowpass', 300, 0.6);
    lp.frequency.setValueAtTime(300, t0);
    lp.frequency.exponentialRampToValueAtTime(2200, t0 + 1.1);
    lp.frequency.exponentialRampToValueAtTime(400, t0 + 2.9);
    chain(n, lp, envG(c, out, t0, 1.0, 0.2, 1.7, 0.7));
    const b = noise(c, t0, 2.95, r, true);
    chain(b, filt(c, 'lowpass', 250), envG(c, out, t0, 0.9, 0.3, 1.6, 0.5));
  },
  icon(g, k, t) {
    const a = on01(k) ? Math.sin(clamp(k) * Math.PI) : 0;
    g.fillStyle = '#f0d8a0';
    g.fillRect(-50, 22, 100, 30);
    for (let j = 0; j < 3; j++) {
      g.fillStyle = ['#2a6ab8', '#3a8ad0', '#6ab8f0'][j]!;
      g.beginPath();
      g.moveTo(-50, 50);
      const reach = j === 2 ? a * 18 : 0;
      for (let x = -50; x <= 50; x += 4) g.lineTo(x, -8 + j * 10 + Math.sin(x * 0.12 + t * 2 + j) * 3 + reach);
      g.lineTo(50, 50);
      g.fill();
    }
    if (a > 0.2)
      for (let i = 0; i < 6; i++) {
        circ(g, -40 + i * 16, 14 + a * 10 + Math.sin(i + t * 3) * 2, 3);
        g.fillStyle = 'rgba(255,255,255,0.8)';
        g.fill();
      }
  },
});
add('sx37', '자연', '개구리 개굴', {
  caption: '140Hz 네모파를 18Hz 로 떨게 하고 띠 필터로 「개」 → 「굴」 입 모양 — 두 번 울음',
  title: '개굴개굴',
  color: '#5be07a',
  dur: 1.0,
  rec: (c, out, t0) => {
    const croak = (t: number): void => {
      const o = osc(c, 'square', 140, t, 0.32);
      o.frequency.linearRampToValueAtTime(110, t + 0.3);
      const am = c.createGain();
      am.gain.value = 0.5;
      const lfo = osc(c, 'square', 18, t, 0.32);
      const lg = gainN(c, 0.5);
      chain(lfo, lg);
      lg.connect(am.gain);
      const bp = filt(c, 'bandpass', 900, 3);
      bp.frequency.setValueAtTime(1100, t);
      bp.frequency.exponentialRampToValueAtTime(500, t + 0.3);
      chain(o, am, bp, envG(c, out, t, 0.01, 0.2, 0.1, 0.6));
    };
    croak(t0);
    croak(t0 + 0.45);
  },
  icon(g, k) {
    ground(g, 34);
    const puff = on01(k) ? Math.max(pulse(k, 0, 0.32), pulse(k, 0.45, 0.32)) : 0;
    g.fillStyle = '#4ac06a';
    g.beginPath();
    g.ellipse(0, 20, 24, 14, 0, 0, TAU);
    g.fill();
    // 울음주머니
    g.fillStyle = '#c8f0b0';
    g.beginPath();
    g.ellipse(0, 24 + puff * 3, 10 + puff * 8, 6 + puff * 7, 0, 0, TAU);
    g.fill();
    for (const s of [-1, 1]) {
      circ(g, s * 10, 4, 8);
      g.fillStyle = '#4ac06a';
      g.fill();
      circ(g, s * 10, 3, 4.5);
      g.fillStyle = '#fff';
      g.fill();
      circ(g, s * 10, 3, 2.4);
      g.fillStyle = '#1b1530';
      g.fill();
    }
  },
});
add('sx38', '자연', '고양이 야옹', {
  caption: '톱니파 음이 오르내리고(500 → 750 → 420Hz) 띠 필터가 「이 → 아 → 오」 입 모양으로 — 「냐아옹」',
  title: '냐아옹',
  color: '#ffb07a',
  dur: 0.9,
  rec: (c, out, t0) => {
    const o = osc(c, 'sawtooth', 500, t0, 0.8);
    o.frequency.linearRampToValueAtTime(750, t0 + 0.25);
    o.frequency.exponentialRampToValueAtTime(420, t0 + 0.75);
    const lfo = osc(c, 'sine', 7, t0, 0.8);
    const lg = gainN(c, 10);
    chain(lfo, lg);
    lg.connect(o.frequency);
    const f1 = filt(c, 'bandpass', 2400, 5);
    f1.frequency.setValueAtTime(2600, t0);
    f1.frequency.linearRampToValueAtTime(1300, t0 + 0.35);
    f1.frequency.linearRampToValueAtTime(800, t0 + 0.75);
    const f2 = filt(c, 'bandpass', 700, 4);
    const e = envG(c, out, t0, 0.06, 0.4, 0.3, 0.7);
    chain(o, f1, e);
    chain(o, f2, gainN(c, 0.5), e);
  },
  icon(g, k) {
    const m = on01(k) ? Math.sin(clamp(k) * Math.PI) : 0;
    g.fillStyle = '#ffb07a';
    circ(g, 0, 8, 24);
    g.fill();
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * 22, -4);
      g.lineTo(s * 18, -26);
      g.lineTo(s * 4, -14);
      g.fill();
    }
    eyes(g, 0, 2, 20, m > 0.2);
    g.fillStyle = '#ff7a8a';
    g.beginPath();
    g.moveTo(-3, 10);
    g.lineTo(3, 10);
    g.lineTo(0, 13);
    g.fill();
    g.fillStyle = '#7a2a3a';
    g.beginPath();
    g.ellipse(0, 18, 4 + m * 2, 1 + m * 6, 0, 0, TAU);
    g.fill();
    g.strokeStyle = '#7a4a3a';
    g.lineWidth = 1;
    for (const s of [-1, 1])
      for (let i = 0; i < 2; i++) {
        g.beginPath();
        g.moveTo(s * 10, 12 + i * 3);
        g.lineTo(s * 30, 9 + i * 6);
        g.stroke();
      }
  },
});

/* ═════ 생활 ═════ */
add('sx39', '생활', '문 두드리기', {
  caption: '낮은 「쿵」(180 → 90Hz) + 나무 띠 잡음을 똑똑똑 세 번 — 간격을 조금씩 다르게',
  title: '똑똑똑',
  color: '#c8a070',
  dur: 0.8,
  rec: (c, out, t0, _p, r) => {
    [0, 0.16, 0.3].forEach((dt, i) => {
      thump(c, out, t0 + dt, 190 - i * 8, 90, 0.08, 0.7);
      nz(c, out, t0 + dt, 'bandpass', 900, 2.5, 0.001, 0.005, 0.05, 0.5, r);
    });
  },
  icon(g, k) {
    rr(g, -26, -36, 40, 72, 3);
    g.fillStyle = '#9a6a3a';
    g.fill();
    g.strokeStyle = '#6a4220';
    g.lineWidth = 2;
    g.strokeRect(-20, -30, 28, 26);
    g.strokeRect(-20, 0, 28, 30);
    circ(g, 8, 4, 3);
    g.fillStyle = '#ffc14a';
    g.fill();
    const hit = on01(k) ? Math.max(pulse(k, 0, 0.1), pulse(k, 0.2, 0.1), pulse(k, 0.37, 0.1)) : 0;
    rr(g, 22 - hit * 6, -10, 16, 14, 6);
    g.fillStyle = '#ffb08a';
    g.fill();
    if (hit > 0.5) burst(g, 16, -3, 12, 5, '#fff2c8', 0.9, 2);
  },
});
add('sx40', '생활', '초인종 띵동', {
  caption: '세모파 미 → 도 두 음이 맑게 오래 — 손님 · 새 친구 도착',
  title: '띵ー동',
  color: '#ffd24a',
  dur: 2.0,
  rec: (c, out, t0) => {
    const w = wet(c, out, 0.8, 0.25);
    const ding = (t: number, f: number): void => {
      tone(c, w, t, f, 1.4, 0.25, 'triangle', 0.002);
      tone(c, w, t, f * 2, 0.6, 0.06, 'sine', 0.002);
      tone(c, w, t, f * 4.07, 0.25, 0.03, 'sine', 0.001);
    };
    ding(t0, 659.25);
    ding(t0 + 0.55, 523.25);
  },
  icon(g, k) {
    rr(g, -20, -30, 40, 60, 8);
    g.fillStyle = '#e8e0d0';
    g.fill();
    const press = on01(k) && k < 0.2 ? 1 : 0;
    circ(g, 0, 0, 11 - press * 1.5);
    g.fillStyle = press ? '#ffc14a' : '#ffd24a';
    g.fill();
    circ(g, 0, 0, 5);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fill();
    if (on01(k)) {
      note(g, 30, -14 - k * 10, 5, '#fff2b8', 1 - k);
      if (k > 0.28) note(g, 38, -26 - k * 6, 4, '#fff2b8', 1 - k);
    }
  },
});
add('sx41', '생활', '시계 째깍', {
  caption: '높은 「째」 · 낮은 「깍」 짧은 딸깍을 0.5초마다 번갈아 — 시간 제한 · 긴장',
  title: '째깍째깍',
  color: '#d0d6e8',
  dur: 2.1,
  rec: (c, out, t0, _p, r) => {
    for (let i = 0; i < 4; i++) {
      const hi = i % 2 === 0;
      nz(c, out, t0 + i * 0.5, 'bandpass', hi ? 4200 : 2600, 4, 0.0005, 0.002, 0.02, 0.7, r);
      tone(c, out, t0 + i * 0.5, hi ? 2100 : 1500, 0.015, 0.1, 'triangle', 0.0005);
    }
  },
  icon(g, k) {
    circ(g, 0, 4, 30);
    g.fillStyle = '#f4f0e6';
    g.fill();
    g.strokeStyle = '#5a5a7a';
    g.lineWidth = 4;
    g.stroke();
    for (let i = 0; i < 12; i++) {
      const an = (i / 12) * TAU;
      g.fillStyle = '#5a5a7a';
      g.fillRect(Math.cos(an) * 24 - 1, 4 + Math.sin(an) * 24 - 1, 2, 2);
    }
    const step = on01(k) ? Math.min(3, Math.floor(k * 4 * (2.1 / 2))) : 0;
    const an = -Math.PI / 2 + step * (TAU / 60) * 5;
    g.strokeStyle = '#ff5c5c';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, 4);
    g.lineTo(Math.cos(an) * 22, 4 + Math.sin(an) * 22);
    g.stroke();
    g.strokeStyle = '#3a3a52';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, 4);
    g.lineTo(10, -6);
    g.stroke();
    circ(g, 0, 4, 3);
    g.fillStyle = '#3a3a52';
    g.fill();
  },
});
add('sx42', '생활', '전화벨', {
  caption: '440 + 480Hz 두 사인을 초당 25번 켰다 껐다 — 옛날 전화 「따르릉」',
  title: '따르릉',
  color: '#ff6b6b',
  dur: 1.6,
  rec: (c, out, t0) => {
    const gate = c.createGain();
    gate.gain.setValueAtTime(0, t0);
    const ring = (t: number, d: number): void => {
      for (let x = 0; x < d; x += 0.04) {
        gate.gain.setValueAtTime(0.2, t + x);
        gate.gain.setValueAtTime(0, t + x + 0.02);
      }
    };
    ring(t0, 0.55);
    ring(t0 + 0.8, 0.55);
    gate.connect(out);
    for (const f of [440, 480, 1320]) chain(osc(c, f > 1000 ? 'triangle' : 'sine', f, t0, 1.5), gainN(c, f > 1000 ? 0.3 : 1), gate);
  },
  icon(g, k, t) {
    const ringing = on01(k) && (k < 0.36 || (k > 0.5 && k < 0.86));
    g.save();
    if (ringing) g.translate(Math.sin(t * 60) * 2, 0);
    rr(g, -26, -6, 52, 34, 8);
    g.fillStyle = '#ff6b6b';
    g.fill();
    rr(g, -30, -18, 60, 12, 6);
    g.fillStyle = '#d04a4a';
    g.fill();
    circ(g, 0, 12, 10);
    g.fillStyle = '#f4f0e6';
    g.fill();
    for (let i = 0; i < 8; i++) {
      circ(g, Math.cos((i / 8) * TAU) * 6.5, 12 + Math.sin((i / 8) * TAU) * 6.5, 1.6);
      g.fillStyle = '#3a3a52';
      g.fill();
    }
    g.restore();
    if (ringing) {
      waves(g, -32, -12, 5, 3, t * 3, '#ffd0d0', 0.6, Math.PI + 0.3);
      waves(g, 32, -12, 5, 3, t * 3, '#ffd0d0', 0.6, -0.3);
    }
  },
});
add('sx43', '생활', '자동차 경적', {
  caption: '400 · 500Hz 톱니파 두 개를 겹쳐 저역 필터로 — 「빵빵!」 (어긋난 두 음이 시끄러운 비결)',
  title: '빵빵!',
  color: '#ffc14a',
  dur: 0.9,
  rec: (c, out, t0) => {
    const honk = (t: number, d: number): void => {
      const lp = filt(c, 'lowpass', 2200, 1);
      lp.connect(envG(c, out, t, 0.01, d, 0.04, 0.2));
      for (const f of [400, 503]) osc(c, 'sawtooth', f, t, d + 0.06).connect(lp);
    };
    honk(t0, 0.12);
    honk(t0 + 0.25, 0.45);
  },
  icon(g, k) {
    ground(g, 34);
    const b = on01(k) ? Math.max(pulse(k, 0, 0.18), clamp((k - 0.28) * 4) * (k < 0.85 ? 1 : 0)) : 0;
    g.save();
    g.translate(0, -b * 1.5);
    rr(g, -36, 4, 72, 20, 7);
    g.fillStyle = '#ffc14a';
    g.fill();
    rr(g, -20, -10, 40, 18, 8);
    g.fill();
    rr(g, -14, -6, 13, 10, 3);
    g.fillStyle = '#9fd4ff';
    g.fill();
    rr(g, 2, -6, 13, 10, 3);
    g.fill();
    g.restore();
    for (const x of [-20, 20]) {
      circ(g, x, 26, 8);
      g.fillStyle = '#2a2a3a';
      g.fill();
    }
    if (b > 0.3) {
      g.globalAlpha = b;
      txt(g, '빵!', 44, -14, 14, '#fff2b8', 'center', 900);
      g.globalAlpha = 1;
    }
  },
});
add('sx44', '생활', '풍선 터짐', {
  caption: '0.03초짜리 아주 날카로운 높은 잡음 + 작은 쿵 — 「팡!」',
  title: '팡!',
  color: '#ff6b9a',
  dur: 0.3,
  rec: (c, out, t0, _p, r) => {
    nz(c, out, t0, 'highpass', 1200, 0.7, 0.0003, 0.004, 0.035, 1.0, r);
    thump(c, out, t0, 120, 50, 0.08, 0.4);
  },
  icon(g, k, t) {
    if (!on01(k)) {
      g.strokeStyle = '#d8d0e0';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(0, 14);
      g.quadraticCurveTo(6, 26, 0, 40);
      g.stroke();
      g.fillStyle = '#ff6b9a';
      g.beginPath();
      g.ellipse(Math.sin(t * 2) * 1, -6, 20, 24, 0, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.45)';
      g.beginPath();
      g.ellipse(-7, -16, 4, 7, -0.4, 0, TAU);
      g.fill();
      return;
    }
    for (let i = 0; i < 8; i++) {
      const an = (i / 8) * TAU + 0.2;
      const d = 6 + easeOut(k * 2) * 34;
      g.fillStyle = rgba('#ff6b9a', 1 - clamp(k));
      g.save();
      g.translate(Math.cos(an) * d, -6 + Math.sin(an) * d + k * k * 20);
      g.rotate(an + k * 5);
      g.fillRect(-4, -2, 8, 4);
      g.restore();
    }
    g.globalAlpha = fade(k * 2.5);
    burst(g, 0, -6, 34, 12, '#ffffff', 1, 2.5);
    g.globalAlpha = 1;
  },
});
add('sx45', '생활', '박수', {
  caption: '박수 한 번 = 아주 짧은 띠 잡음 세 조각(1ms 간격) + 꼬리. 여섯 번을 사람처럼 조금씩 어긋나게',
  title: '짝짝짝',
  color: '#ffc8a0',
  dur: 1.6,
  rec: (c, out, t0, _p, r) => {
    for (let i = 0; i < 6; i++) {
      const t = t0 + i * 0.23 + (r() - 0.5) * 0.03;
      const f = 1100 + r() * 400;
      for (let j = 0; j < 3; j++) nz(c, out, t + j * 0.009, 'bandpass', f, 1.8, 0.0003, 0.001, 0.008, 0.6, r);
      nz(c, out, t + 0.027, 'bandpass', f, 1.5, 0.001, 0.005, 0.08, 0.4, r);
    }
  },
  icon(g, k) {
    const ph = on01(k) ? (k * 6.9) % 1 : 0.5;
    const close = on01(k) ? Math.max(0, 1 - Math.abs(ph - 0.1) * 6) : 0;
    const gap = 4 + (1 - close) * 14;
    for (const s of [-1, 1]) {
      g.save();
      g.translate(s * gap, 4);
      g.rotate(s * (0.25 - close * 0.2));
      rr(g, -9, -24, 18, 40, 8);
      g.fillStyle = '#ffc8a0';
      g.fill();
      for (let i = 0; i < 3; i++) {
        rr(g, -9 + i * 6, -34, 5.5, 14, 2.75);
        g.fill();
      }
      g.restore();
    }
    if (close > 0.6) {
      burst(g, 0, -10, 24, 6, '#fff2c8', close, 2.5);
    }
  },
});
add('sx46', '생활', '휘파람', {
  caption: '사인파에 느린 떨림 + 숨소리 잡음, 음이 미끄러지듯 오르내림 — 「휘ー휘익」',
  title: '휘ー휘익',
  color: '#9fe8ff',
  dur: 1.4,
  rec: (c, out, t0, _p, r) => {
    const o = osc(c, 'sine', 1200, t0, 1.35);
    o.frequency.setValueAtTime(1200, t0);
    o.frequency.exponentialRampToValueAtTime(1800, t0 + 0.4);
    o.frequency.exponentialRampToValueAtTime(1500, t0 + 0.7);
    o.frequency.setValueAtTime(1500, t0 + 0.8);
    o.frequency.exponentialRampToValueAtTime(2100, t0 + 1.2);
    const lfo = osc(c, 'sine', 5.5, t0, 1.35);
    const lg = gainN(c, 18);
    chain(lfo, lg);
    lg.connect(o.frequency);
    const e = c.createGain();
    e.gain.setValueAtTime(0.0001, t0);
    e.gain.exponentialRampToValueAtTime(0.25, t0 + 0.08);
    e.gain.setValueAtTime(0.25, t0 + 0.68);
    e.gain.exponentialRampToValueAtTime(0.02, t0 + 0.76);
    e.gain.exponentialRampToValueAtTime(0.25, t0 + 0.84);
    e.gain.setValueAtTime(0.25, t0 + 1.15);
    e.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.33);
    chain(o, e, out);
    nz(c, out, t0, 'bandpass', 2000, 1, 0.1, 1.0, 0.2, 0.04, r);
  },
  icon(g, k) {
    circ(g, -6, 6, 24);
    g.fillStyle = '#ffd0a8';
    g.fill();
    eyes(g, -8, 0, 18, on01(k) === 1);
    circ(g, 8, 14, 4);
    g.fillStyle = '#c86a5a';
    g.fill();
    if (on01(k)) {
      note(g, 26 + k * 8, 2 - k * 20, 5, '#d8f6ff', 1 - k);
      if (k > 0.55) note(g, 34 + k * 6, -6 - k * 14, 4, '#d8f6ff', 1 - k);
    }
  },
});
add('sx47', '생활', '종이 넘김', {
  caption: '잡음 띠를 800 → 4000Hz 로 올리며 크기를 팔랑팔랑 떨게 — 책장 · 카드 넘기기',
  title: '팔랑',
  color: '#f0e0c0',
  dur: 0.55,
  rec: (c, out, t0, _p, r) => {
    const n = noise(c, t0, 0.5, r);
    const b = filt(c, 'bandpass', 800, 1.2);
    b.frequency.setValueAtTime(800, t0);
    b.frequency.exponentialRampToValueAtTime(4000, t0 + 0.3);
    const fl = c.createGain();
    fl.gain.setValueAtTime(0, t0);
    for (let t = 0; t < 0.45; t += 0.025) fl.gain.setValueAtTime(0.25 + r() * 0.5, t0 + t);
    chain(n, b, fl, envG(c, out, t0, 0.05, 0.15, 0.25, 0.8));
  },
  icon(g, k) {
    rr(g, -40, -24, 80, 50, 3);
    g.fillStyle = '#8a5a3a';
    g.fill();
    g.fillStyle = '#fbf6ea';
    g.fillRect(-36, -20, 34, 42);
    g.fillRect(2, -20, 34, 42);
    const a = on01(k) ? easeOut(k) : 0;
    const w = 34 * Math.cos(a * Math.PI);
    g.fillStyle = '#fffaf0';
    g.beginPath();
    g.moveTo(0, -20);
    g.quadraticCurveTo(w * 0.6, -26 - Math.sin(a * Math.PI) * 8, w, -20);
    g.lineTo(w, 22);
    g.quadraticCurveTo(w * 0.6, 16, 0, 22);
    g.fill();
    g.strokeStyle = 'rgba(120,100,70,0.4)';
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = 'rgba(120,100,70,0.35)';
    for (let i = 0; i < 4; i++) {
      g.fillRect(-32, -12 + i * 8, 26, 2);
      g.fillRect(6, -12 + i * 8, 26, 2);
    }
  },
});
add('sx48', '생활', '물 따르기', {
  caption: '잡음이 좁은 띠 필터를 지나며 공명이 300 → 1400Hz 로 올라감 — 병이 찰수록 높아지는 「쪼르륵」',
  title: '쪼르르륵',
  color: '#5bb6ff',
  dur: 2.0,
  rec: (c, out, t0, _p, r) => {
    const n = noise(c, t0, 1.95, r);
    const b = filt(c, 'bandpass', 300, 12);
    b.frequency.setValueAtTime(300, t0);
    b.frequency.exponentialRampToValueAtTime(1400, t0 + 1.8);
    const fl = c.createGain();
    fl.gain.setValueAtTime(0.6, t0);
    for (let t = 0; t < 1.8; t += 0.03) fl.gain.setValueAtTime(0.4 + r() * 0.6, t0 + t);
    chain(n, b, fl, envG(c, out, t0, 0.08, 1.6, 0.2, 2.0));
    for (let i = 0; i < 10; i++) {
      const t = t0 + 0.1 + r() * 1.7;
      const o = osc(c, 'sine', 500 + r() * 600, t, 0.05);
      o.frequency.exponentialRampToValueAtTime(1200 + r() * 800, t + 0.04);
      o.connect(envG(c, out, t, 0.002, 0.01, 0.03, 0.06));
    }
  },
  icon(g, k, t) {
    const fill = on01(k) ? clamp(k / 0.9) : k > 1 ? 1 : 0;
    // 주전자에서 컵으로
    g.save();
    g.translate(-22, -26);
    g.rotate(0.5);
    rr(g, -12, -10, 24, 20, 5);
    g.fillStyle = '#7a8aa8';
    g.fill();
    g.fillRect(10, -6, 12, 4);
    g.restore();
    if (on01(k) && k < 0.92) {
      g.strokeStyle = '#7ac8ff';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-6, -18);
      g.quadraticCurveTo(4 + Math.sin(t * 20) * 0.6, -6, 4, 30 - fill * 26);
      g.stroke();
    }
    // 유리컵
    g.fillStyle = 'rgba(200,230,255,0.18)';
    g.beginPath();
    g.moveTo(-14, -4);
    g.lineTo(22, -4);
    g.lineTo(18, 32);
    g.lineTo(-10, 32);
    g.fill();
    const top = 32 - fill * 32;
    g.fillStyle = '#4a9ae8';
    g.beginPath();
    g.moveTo(-10 - (32 - top) * 0.11, top);
    g.lineTo(18 + (32 - top) * 0.11, top);
    g.lineTo(18, 32);
    g.lineTo(-10, 32);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-14, -4);
    g.lineTo(-10, 32);
    g.lineTo(18, 32);
    g.lineTo(22, -4);
    g.stroke();
  },
});

/** 견본판이 쓰는 목록: [분류, id, 이름, 견본] */
export const SFX_PACK: { cat: string; id: string; name: string; demo: Demo2D }[] = Object.entries(S).map(([id, s]) => ({ cat: s.cat, id, name: s.name, demo: shotDemo(id, s) }));
export type { Rec };

import * as THREE from 'three';
import type { Control, DemoMap, Scene3D } from './types';

/**
 * 견본 — 스킬 VFX (마법 · 미사일)  i170 ~ i183
 * 디아블로 같은 ARPG 마법 효과: 어두운 돌바닥 위 3/4 내려다보기, 더하기 혼합 빛 입자 · HDR 하얀 핵 · 빛무리 · 불티 · 연기 · 바닥 빛.
 *
 * 공통 입자 통(Pool): 사각형 하나를 인스턴스로 그리는 빌보드 입자 (InstancedBufferGeometry + ShaderMaterial).
 *  - 입자마다 위치 · 속도 · 크기 · 색(HDR) · 투명도 · 회전 · 모양 · 「더하기 정도」를 CPU 에서 매 프레임 올린다.
 *  - 혼합은 premultiplied (ONE, ONE_MINUS_SRC_ALPHA) — 더하기 정도 1 = 빛(더하기), 0 = 연기(덮기). 한 입자가 수명 중 빛 → 연기로 바뀔 수 있다.
 *  - 속도 방향으로 늘이기(stretch) · 부드러운 입자(SOFT, 깊이 텍스처) 지원.
 */

const FONT = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const easeOut = (k: number): number => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const R = (a: number, b: number): number => a + Math.random() * (b - a);
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
const D = { x: 0, y: 0, z: 0 };
function sphereDir(): typeof D {
  const u = Math.random() * 2 - 1;
  const a = Math.random() * TAU;
  const s = Math.sqrt(1 - u * u);
  D.x = s * Math.cos(a);
  D.y = u;
  D.z = s * Math.sin(a);
  return D;
}
/** +Y 둘레 원뿔 안 방향 */
function coneDir(ang: number): typeof D {
  const c = Math.cos(ang);
  const u = c + Math.random() * (1 - c);
  const s = Math.sqrt(1 - u * u);
  const a = Math.random() * TAU;
  D.x = s * Math.cos(a);
  D.y = u;
  D.z = s * Math.sin(a);
  return D;
}

/* ───────────── 캔버스 그림 (한 번만 그려 두고 텍스처는 견본마다) ───────────── */

const canvasCache = new Map<string, HTMLCanvasElement>();
function cachedCanvas(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): HTMLCanvasElement {
  let c = canvasCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d')!, w, h);
    canvasCache.set(key, c);
  }
  return c;
}
function texFrom(c: HTMLCanvasElement, srgb = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** 연기 뭉게 (빨강 채널 = 진하기, 불투명 바탕이라 값이 그대로) */
function puffCanvas(): HTMLCanvasElement {
  return cachedCanvas('puff', 128, 128, (g, s) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, s, s);
    const r = rng(11);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 46; i++) {
      const a = r() * TAU;
      const d = Math.pow(r(), 0.75) * s * 0.26;
      const cx = s / 2 + Math.cos(a) * d;
      const cy = s / 2 + Math.sin(a) * d;
      const rr = s * (0.08 + r() * 0.16);
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rr);
      gr.addColorStop(0, 'rgba(255,255,255,0.2)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
    }
    g.globalCompositeOperation = 'multiply';
    const m = g.createRadialGradient(s / 2, s / 2, s * 0.12, s / 2, s / 2, s * 0.5);
    m.addColorStop(0, '#fff');
    m.addColorStop(1, '#000');
    g.fillStyle = m;
    g.fillRect(0, 0, s, s);
    g.globalCompositeOperation = 'source-over';
  });
}

/** 어두운 돌바닥 (판석 · 줄눈 · 금 · 얼룩) — 위아래 · 옆이 이어진다 */
function stoneCanvas(): HTMLCanvasElement {
  return cachedCanvas('stone', 512, 512, (g, s) => {
    const r = rng(7);
    g.fillStyle = '#0d0e11';
    g.fillRect(0, 0, s, s);
    const rows = 4;
    const rh = s / rows;
    const tile = (x: number, y: number, w: number, h: number, L: number, seed: number): void => {
      const q = rng(seed);
      const gap = 3;
      const x0 = x + gap;
      const y0 = y + gap;
      const ww = w - gap * 2;
      const hh = h - gap * 2;
      g.fillStyle = `hsl(${215 + q() * 20}, ${6 + q() * 6}%, ${L}%)`;
      g.beginPath();
      g.roundRect(x0, y0, ww, hh, 5);
      g.fill();
      g.save();
      g.clip();
      for (let i = 0; i < 70; i++) {
        const cx = x0 + q() * ww;
        const cy = y0 + q() * hh;
        const rr = 6 + q() * 34;
        const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rr);
        const dark = q() < 0.55;
        gr.addColorStop(0, dark ? 'rgba(0,0,0,0.13)' : 'rgba(255,255,255,0.06)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
      }
      // 빗각: 위 · 왼쪽 밝게, 아래 · 오른쪽 어둡게
      const lg = g.createLinearGradient(x0, y0, x0 + ww, y0 + hh);
      lg.addColorStop(0, 'rgba(255,255,255,0.07)');
      lg.addColorStop(0.5, 'rgba(0,0,0,0)');
      lg.addColorStop(1, 'rgba(0,0,0,0.22)');
      g.fillStyle = lg;
      g.fillRect(x0, y0, ww, hh);
      // 금
      if (q() < 0.6) {
        g.strokeStyle = 'rgba(0,0,0,0.55)';
        g.lineWidth = 1.2;
        g.beginPath();
        let px = x0 + q() * ww;
        let py = y0;
        g.moveTo(px, py);
        for (let k = 0; k < 7; k++) {
          px += (q() - 0.5) * 22;
          py += hh / 7;
          g.lineTo(px, py);
        }
        g.stroke();
      }
      g.restore();
      g.strokeStyle = 'rgba(255,255,255,0.05)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x0 + 4, y0 + 1.5);
      g.lineTo(x0 + ww - 4, y0 + 1.5);
      g.stroke();
    };
    let seed = 100;
    for (let row = 0; row < rows; row++) {
      let x = -r() * rh * 0.9;
      const start = x;
      while (x < start + s) {
        const w = rh * (0.85 + r() * 0.9);
        const L = 17 + r() * 9;
        const sd = seed++;
        tile(x, row * rh, w, rh, L, sd);
        tile(x + s, row * rh, w, rh, L, sd);
        tile(x - s, row * rh, w, rh, L, sd);
        x += w;
      }
    }
    // 고운 얼룩
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.035)';
      g.fillRect(r() * s, r() * s, 1 + r() * 1.5, 1 + r() * 1.5);
    }
  });
}

/** 그을음: 빨강 = 탄 자국, 초록 = 남은 불씨 금 */
function scorchCanvas(): HTMLCanvasElement {
  return cachedCanvas('scorch', 256, 256, (g, s) => {
    const r = rng(31);
    g.fillStyle = '#000';
    g.fillRect(0, 0, s, s);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 70; i++) {
      const a = r() * TAU;
      const d = Math.pow(r(), 1.3) * s * 0.3;
      const cx = s / 2 + Math.cos(a) * d;
      const cy = s / 2 + Math.sin(a) * d;
      const rr = s * (0.05 + r() * 0.13);
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rr);
      gr.addColorStop(0, 'rgba(255,0,0,0.25)');
      gr.addColorStop(1, 'rgba(255,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
    }
    // 밖으로 뻗는 그을음 줄
    for (let i = 0; i < 26; i++) {
      const a = r() * TAU;
      const len = s * (0.3 + r() * 0.18);
      g.strokeStyle = 'rgba(255,0,0,0.18)';
      g.lineWidth = 3 + r() * 6;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(s / 2, s / 2);
      g.lineTo(s / 2 + Math.cos(a) * len, s / 2 + Math.sin(a) * len);
      g.stroke();
    }
    // 불씨 금 (초록)
    g.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      let a = r() * TAU;
      const d0 = s * (0.02 + r() * 0.2);
      let px = s / 2 + Math.cos(a) * d0;
      let py = s / 2 + Math.sin(a) * d0;
      a += (r() - 0.5) * 2.2;
      g.beginPath();
      g.moveTo(px, py);
      const n = 2 + Math.floor(r() * 4);
      for (let k = 0; k < n; k++) {
        a += (r() - 0.5) * 1.6;
        const st = s * (0.015 + r() * 0.025);
        px += Math.cos(a) * st;
        py += Math.sin(a) * st;
        g.lineTo(px, py);
      }
      g.strokeStyle = 'rgba(0,255,0,0.25)';
      g.lineWidth = 4;
      g.stroke();
      g.strokeStyle = 'rgba(0,255,0,0.75)';
      g.lineWidth = 1.2;
      g.stroke();
    }
    for (let i = 0; i < 60; i++) {
      const a = r() * TAU;
      const d = s * (0.06 + r() * 0.2);
      g.fillStyle = 'rgba(0,255,0,0.8)';
      g.beginPath();
      g.arc(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, 0.8 + r() * 1.6, 0, TAU);
      g.fill();
    }
    g.globalCompositeOperation = 'multiply';
    const m = g.createRadialGradient(s / 2, s / 2, s * 0.2, s / 2, s / 2, s * 0.5);
    m.addColorStop(0, '#fff');
    m.addColorStop(1, '#000');
    g.fillStyle = m;
    g.fillRect(0, 0, s, s);
    g.globalCompositeOperation = 'source-over';
  });
}

/** 서리꽃: 빨강 = 하얀 서리, 초록 = 푸른 빛 */
function frostCanvas(): HTMLCanvasElement {
  return cachedCanvas('frost', 512, 512, (g, s) => {
    const r = rng(53);
    g.fillStyle = '#000';
    g.fillRect(0, 0, s, s);
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    const branch = (x: number, y: number, a: number, len: number, w: number, depth: number): void => {
      const x2 = x + Math.cos(a) * len;
      const y2 = y + Math.sin(a) * len;
      g.strokeStyle = 'rgba(0,255,0,0.22)';
      g.lineWidth = w * 4;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x2, y2);
      g.stroke();
      g.strokeStyle = 'rgba(255,0,0,0.85)';
      g.lineWidth = w;
      g.stroke();
      if (depth <= 0) return;
      const n = 3 + Math.floor(r() * 3);
      for (let k = 1; k <= n; k++) {
        const f = k / (n + 1);
        const bx = x + (x2 - x) * f;
        const by = y + (y2 - y) * f;
        const bl = len * (0.42 - f * 0.25) * (0.7 + r() * 0.5);
        branch(bx, by, a + 1.05, bl, w * 0.6, depth - 1);
        branch(bx, by, a - 1.05, bl, w * 0.6, depth - 1);
      }
    };
    const arms = 8;
    for (let i = 0; i < arms; i++) {
      const a = (i / arms) * TAU + r() * 0.2;
      branch(s / 2, s / 2, a, s * (0.36 + r() * 0.1), 4.5, 2);
    }
    for (let i = 0; i < 900; i++) {
      const a = r() * TAU;
      const d = Math.pow(r(), 0.8) * s * 0.46;
      g.fillStyle = `rgba(255,${r() < 0.3 ? 255 : 0},0,${0.2 + r() * 0.5})`;
      g.beginPath();
      g.arc(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, 0.6 + r() * 1.8, 0, TAU);
      g.fill();
    }
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.22);
    gr.addColorStop(0, 'rgba(255,255,0,0.7)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
    g.globalCompositeOperation = 'multiply';
    const m = g.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s * 0.5);
    m.addColorStop(0, '#fff');
    m.addColorStop(1, '#000');
    g.fillStyle = m;
    g.fillRect(0, 0, s, s);
    g.globalCompositeOperation = 'source-over';
  });
}

/** 마법진 세 겹 (흰 선, 빛 번짐 구워 넣음) — 수학 기호 룬 */
function runeCanvas(layer: 0 | 1 | 2): HTMLCanvasElement {
  return cachedCanvas('rune' + layer, 512, 512, (g, s) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, s, s);
    const c = s / 2;
    g.translate(c, c);
    g.strokeStyle = '#fff';
    g.fillStyle = '#fff';
    g.shadowColor = 'rgba(255,255,255,0.9)';
    g.shadowBlur = 10;
    const circ = (rr: number, w: number): void => {
      g.lineWidth = w;
      g.beginPath();
      g.arc(0, 0, rr * c, 0, TAU);
      g.stroke();
    };
    if (layer === 0) {
      circ(0.95, 5);
      circ(0.9, 2);
      circ(0.72, 3);
      const syms = ['π', '∑', '√', '∞', 'Δ', 'θ', '∫', '÷', '×', '±', 'φ', 'λ', 'Ω', '≠', '∠', '%'];
      g.font = `700 ${Math.round(s * 0.07)}px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      syms.forEach((sy, i) => {
        const a = (i / syms.length) * TAU;
        g.save();
        g.rotate(a);
        g.translate(0, -0.81 * c);
        g.fillText(sy, 0, 0);
        g.restore();
        g.save();
        g.rotate(a + TAU / syms.length / 2);
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(0, -0.74 * c);
        g.lineTo(0, -0.88 * c);
        g.stroke();
        g.restore();
      });
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * TAU;
        g.lineWidth = i % 4 === 0 ? 3 : 1.5;
        g.beginPath();
        g.moveTo(Math.cos(a) * 0.9 * c, Math.sin(a) * 0.9 * c);
        g.lineTo(Math.cos(a) * (i % 4 === 0 ? 0.95 : 0.925) * c, Math.sin(a) * (i % 4 === 0 ? 0.95 : 0.925) * c);
        g.stroke();
      }
    } else if (layer === 1) {
      circ(0.93, 3);
      const tri = (off: number): void => {
        g.lineWidth = 4;
        g.beginPath();
        for (let i = 0; i <= 3; i++) {
          const a = off + (i / 3) * TAU;
          const x = Math.cos(a) * 0.93 * c;
          const y = Math.sin(a) * 0.93 * c;
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      };
      tri(-Math.PI / 2);
      tri(Math.PI / 2);
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i / 6) * TAU;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(Math.cos(a) * 0.93 * c, Math.sin(a) * 0.93 * c, 0.065 * c, 0, TAU);
        g.stroke();
        g.beginPath();
        g.arc(Math.cos(a) * 0.93 * c, Math.sin(a) * 0.93 * c, 0.025 * c, 0, TAU);
        g.fill();
      }
      circ(0.53, 2.5);
    } else {
      circ(0.95, 4);
      circ(0.8, 2);
      g.lineWidth = 3.5;
      g.beginPath();
      for (let i = 0; i <= 5; i++) {
        const a = -Math.PI / 2 + ((i * 2) / 5) * TAU;
        const x = Math.cos(a) * 0.8 * c;
        const y = Math.sin(a) * 0.8 * c;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      g.font = `800 ${Math.round(s * 0.3)}px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('π', 0, s * 0.01);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
  });
}

/* ───────────── 색 사다리 (수명 0 → 1) ───────────── */

const RN = 32;
/** [수명, 색, 밝기(HDR), 투명도, 더하기 정도] */
type Stop = [number, number, number, number, number];
function ramp(stops: Stop[]): Float32Array {
  const out = new Float32Array(RN * 5);
  const c = new THREE.Color();
  const cols = stops.map((s) => {
    c.setHex(s[1]);
    return [c.r * s[2], c.g * s[2], c.b * s[2], s[3], s[4]];
  });
  for (let i = 0; i < RN; i++) {
    const k = i / (RN - 1);
    let j = 0;
    while (j < stops.length - 2 && k > stops[j + 1]![0]) j++;
    const a = stops[j]!;
    const b = stops[j + 1] ?? a;
    const f = clamp((k - a[0]) / Math.max(1e-6, b[0] - a[0]), 0, 1);
    const ca = cols[j]!;
    const cb = cols[j + 1] ?? ca;
    for (let q = 0; q < 5; q++) out[i * 5 + q] = lerp(ca[q]!, cb[q]!, f);
  }
  return out;
}
const flat = (hex: number, I: number, a: number, add = 1): Float32Array => ramp([[0, hex, I, a, add], [1, hex, I, a, add]]);
/** HDR 끄기: 색을 1 이하로 */
function ldr(r: Float32Array): Float32Array {
  const o = r.slice();
  for (let i = 0; i < RN; i++) {
    const m = Math.max(o[i * 5]!, o[i * 5 + 1]!, o[i * 5 + 2]!);
    if (m > 0.85) for (let q = 0; q < 3; q++) o[i * 5 + q] = (o[i * 5 + q]! / m) * 0.85;
  }
  return o;
}

const RAMP = {
  fire: ramp([[0, 0xffffff, 7, 1, 1], [0.1, 0xfff0b0, 4.5, 1, 1], [0.3, 0xffa030, 2.6, 0.95, 1], [0.55, 0xe0400c, 1.3, 0.75, 0.8], [0.75, 0x3a1a10, 0.6, 0.55, 0.15], [1, 0x100c0a, 0.4, 0, 0]]),
  spark: ramp([[0, 0xffffff, 9, 1, 1], [0.25, 0xffd070, 5, 1, 1], [0.7, 0xff5010, 2.5, 0.8, 1], [1, 0x801000, 1, 0, 1]]),
  ember: ramp([[0, 0xffe0a0, 5, 1, 1], [0.5, 0xff6a10, 3, 0.85, 1], [1, 0x501000, 1, 0, 1]]),
  smoke: ramp([[0, 0x6a3a20, 1.3, 0, 0.35], [0.1, 0x4a2c20, 1, 0.55, 0.1], [0.5, 0x2a2624, 1, 0.42, 0], [1, 0x1a1a1a, 1, 0, 0]]),
  dust: ramp([[0, 0x8a7a6a, 1, 0, 0], [0.15, 0x6a5e52, 1, 0.5, 0], [1, 0x3a3632, 1, 0, 0]]),
  flash: ramp([[0, 0xffffff, 12, 1, 1], [0.3, 0xfff0c0, 6, 0.8, 1], [1, 0xff8030, 1, 0, 1]]),
  magic: ramp([[0, 0xffffff, 6, 0, 1], [0.08, 0xf0e0ff, 5, 1, 1], [0.35, 0xb080ff, 3, 0.9, 1], [0.7, 0x6038e0, 1.6, 0.5, 1], [1, 0x201060, 0.6, 0, 1]]),
  magicSpark: ramp([[0, 0xffffff, 8, 1, 1], [0.3, 0xe0b0ff, 4.5, 1, 1], [1, 0x7020d0, 1.5, 0, 1]]),
  magicSmoke: ramp([[0, 0xa070ff, 2.2, 0, 0.85], [0.15, 0x7a48e0, 1.5, 0.55, 0.6], [0.6, 0x45307a, 1.1, 0.42, 0.3], [1, 0x1c1430, 1, 0, 0]]),
  gold: ramp([[0, 0xffffff, 8, 0, 1], [0.1, 0xfff0c0, 6, 1, 1], [0.4, 0xffc040, 3.5, 0.9, 1], [1, 0xc06010, 1, 0, 1]]),
  heal: ramp([[0, 0xe0fff0, 4, 0, 1], [0.15, 0x9affc8, 3.2, 1, 1], [0.6, 0x30d090, 1.8, 0.7, 1], [1, 0x106040, 0.6, 0, 1]]),
  ice: ramp([[0, 0xffffff, 7, 1, 1], [0.15, 0xd8f4ff, 4.5, 1, 1], [0.5, 0x6ac8ff, 2.4, 0.8, 1], [1, 0x1a4ab0, 0.8, 0, 1]]),
  frostMist: ramp([[0, 0xd0ecff, 1.3, 0, 0.45], [0.2, 0xb8e0ff, 1.2, 0.38, 0.4], [1, 0x7aa8d8, 1, 0, 0.3]]),
  emit: ramp([[0, 0xffffff, 6, 0, 1], [0.06, 0xffffff, 5, 1, 1], [0.3, 0x70e8ff, 3, 1, 1], [0.7, 0x8a5cff, 2, 0.6, 1], [1, 0x3a1a90, 0.8, 0, 1]]),
  emitFlat: flat(0x70e8ff, 2.2, 0.8),
  poison: ramp([[0, 0xf0ffe0, 6, 1, 1], [0.12, 0xc8ff60, 4, 1, 1], [0.35, 0x58e030, 2.4, 0.9, 1], [0.6, 0x2a7a20, 1.2, 0.7, 0.6], [0.8, 0x2a1a38, 0.8, 0.5, 0.1], [1, 0x120c18, 0.5, 0, 0]]),
  arcane: ramp([[0, 0xffffff, 7, 1, 1], [0.12, 0xf0d8ff, 4.5, 1, 1], [0.35, 0xb070ff, 2.8, 0.95, 1], [0.6, 0x5a28d0, 1.4, 0.75, 0.8], [0.8, 0x24143a, 0.7, 0.5, 0.15], [1, 0x0e0a14, 0.4, 0, 0]]),
  frostLadder: ramp([[0, 0xffffff, 7, 1, 1], [0.12, 0xe0f8ff, 4.5, 1, 1], [0.35, 0x80d8ff, 2.6, 0.95, 1], [0.6, 0x2a78d0, 1.4, 0.7, 0.7], [0.8, 0x9ab0c8, 0.8, 0.45, 0.1], [1, 0x8090a0, 0.6, 0, 0]]),
};

/* ───────────── 입자 통 ───────────── */

interface Emit {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life: number;
  s0: number;
  s1?: number;
  ramp: Float32Array;
  br?: number;
  /** 속도로 늘이기 (0 = 둥근 빌보드) */
  st?: number;
  /** 0 빛 · 1 연기 뭉게 · 2 불티 · 3 결정 조각 · 4 반짝 별 */
  shape?: number;
  rot?: number;
  rv?: number;
  drag?: number;
  grav?: number;
  /** 바닥에서 튀기 (음수 = 바닥 없음) */
  bnc?: number;
  curl?: number;
  tag?: number;
  delay?: number;
}

const POOL_VS = /* glsl */ `
attribute vec3 iPos; attribute vec3 iVel; attribute vec4 iCol; attribute vec4 iMisc; attribute float iAdd;
varying vec2 vUv; varying vec4 vCol; varying float vShape; varying float vAdd; varying float vStr; varying float vViewZ;
void main(){
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  vec2 c = position.xy;
  float s = iMisc.x;
  vec2 off;
  vStr = 0.0;
  if (iMisc.y > 0.0) {
    vec3 vv = mat3(modelViewMatrix) * iVel;
    float L = length(vv.xy);
    vec2 dir = L > 1e-4 ? vv.xy / L : vec2(0.0, 1.0);
    vec2 nrm = vec2(-dir.y, dir.x);
    float len = s + L * iMisc.y;
    off = dir * (c.x * len - (len - s) * 0.5) + nrm * c.y * s;
    vStr = 1.0;
  } else {
    float cr = cos(iMisc.z), sr = sin(iMisc.z);
    off = vec2(c.x * cr - c.y * sr, c.x * sr + c.y * cr) * s;
  }
  mv.xy += off;
  vViewZ = mv.z;
  gl_Position = projectionMatrix * mv;
  vUv = c + 0.5; vCol = iCol; vShape = iMisc.w; vAdd = iAdd;
}`;
const POOL_FS = /* glsl */ `
#include <packing>
uniform sampler2D uPuff;
#ifdef SOFT
uniform sampler2D uDepth; uniform vec2 uRes; uniform float uNear; uniform float uFar; uniform float uSoft; uniform float uSoftOn;
#endif
varying vec2 vUv; varying vec4 vCol; varying float vShape; varying float vAdd; varying float vStr; varying float vViewZ;
void main(){
  vec2 p = vUv * 2.0 - 1.0;
  float r2 = dot(p, p);
  float a; float hot = 0.0;
  if (vShape < 0.5) { a = exp(-r2 * 3.2) * (1.0 - smoothstep(0.55, 1.0, r2)); hot = exp(-r2 * 16.0); }
  else if (vShape < 1.5) { a = texture2D(uPuff, vUv).r; }
  else if (vShape < 2.5) { float r = sqrt(r2); a = pow(max(0.0, 1.0 - r), 2.0); hot = exp(-r2 * 30.0); }
  else if (vShape < 3.5) {
    float d = abs(p.x) + abs(p.y);
    a = (1.0 - smoothstep(0.82, 1.0, d)) * (0.55 + 0.45 * step(0.0, p.x * p.y)) + exp(-d * 6.0) * 0.5;
    hot = (1.0 - smoothstep(0.0, 0.5, d)) * 0.6;
  } else {
    float x = abs(p.x), y = abs(p.y);
    a = max(exp(-x * 16.0) * exp(-y * 2.4), exp(-y * 16.0) * exp(-x * 2.4)) + exp(-r2 * 9.0) * 0.7;
    a = min(a, 1.0) * (1.0 - smoothstep(0.8, 1.0, max(x, y)));
    hot = exp(-r2 * 25.0);
  }
  if (vStr > 0.5) a *= smoothstep(0.0, 0.8, vUv.x);
  a *= vCol.a;
#ifdef SOFT
  float sd = texture2D(uDepth, gl_FragCoord.xy / uRes).x;
  float sz = perspectiveDepthToViewZ(sd, uNear, uFar);
  a *= mix(1.0, clamp((vViewZ - sz) / uSoft, 0.0, 1.0), uSoftOn);
#endif
  if (a < 0.002) discard;
  vec3 col = vCol.rgb * (1.0 + hot * 2.5);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * a, a * (1.0 - vAdd));
}`;

const QUAD = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]);

class Pool {
  n = 0;
  readonly cap: number;
  readonly mesh: THREE.Mesh;
  readonly mat: THREE.ShaderMaterial;
  private readonly geo: THREE.InstancedBufferGeometry;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly vz: Float32Array;
  readonly age: Float32Array;
  readonly life: Float32Array;
  readonly s0: Float32Array;
  readonly s1: Float32Array;
  readonly br: Float32Array;
  readonly st: Float32Array;
  readonly sh: Float32Array;
  readonly rot: Float32Array;
  readonly rv: Float32Array;
  readonly drag: Float32Array;
  readonly grav: Float32Array;
  readonly bnc: Float32Array;
  readonly curl: Float32Array;
  readonly tag: Int16Array;
  readonly rp: Float32Array[];
  private readonly all: Float32Array[];
  private readonly aPos: THREE.InstancedBufferAttribute;
  private readonly aVel: THREE.InstancedBufferAttribute;
  private readonly aCol: THREE.InstancedBufferAttribute;
  private readonly aMisc: THREE.InstancedBufferAttribute;
  private readonly aAdd: THREE.InstancedBufferAttribute;
  floorY = 0.02;
  curlScale = 0.9;
  time = 0;
  /** 입자 크기 · 밝기 전체 배율 */
  sizeMul = 1;
  onStep: ((p: Pool, i: number, dt: number) => void) | null = null;
  onDie: ((tag: number, x: number, y: number, z: number, vx: number, vy: number, vz: number) => void) | null = null;

  constructor(cap: number, puff: THREE.Texture, soft = false) {
    this.cap = cap;
    const F = (): Float32Array => new Float32Array(cap);
    this.x = F();
    this.y = F();
    this.z = F();
    this.vx = F();
    this.vy = F();
    this.vz = F();
    this.age = F();
    this.life = F();
    this.s0 = F();
    this.s1 = F();
    this.br = F();
    this.st = F();
    this.sh = F();
    this.rot = F();
    this.rv = F();
    this.drag = F();
    this.grav = F();
    this.bnc = F();
    this.curl = F();
    this.tag = new Int16Array(cap);
    this.rp = new Array<Float32Array>(cap).fill(RAMP.spark);
    this.all = [this.x, this.y, this.z, this.vx, this.vy, this.vz, this.age, this.life, this.s0, this.s1, this.br, this.st, this.sh, this.rot, this.rv, this.drag, this.grav, this.bnc, this.curl];
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(QUAD, 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const mk = (k: number): THREE.InstancedBufferAttribute => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * k), k);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.aPos = mk(3);
    this.aVel = mk(3);
    this.aCol = mk(4);
    this.aMisc = mk(4);
    this.aAdd = mk(1);
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iVel', this.aVel);
    geo.setAttribute('iCol', this.aCol);
    geo.setAttribute('iMisc', this.aMisc);
    geo.setAttribute('iAdd', this.aAdd);
    geo.instanceCount = 0;
    this.geo = geo;
    const uniforms: Record<string, THREE.IUniform> = { uPuff: { value: puff } };
    if (soft) {
      uniforms.uDepth = { value: null };
      uniforms.uRes = { value: new THREE.Vector2(1, 1) };
      uniforms.uNear = { value: 0.1 };
      uniforms.uFar = { value: 60 };
      uniforms.uSoft = { value: 0.6 };
      uniforms.uSoftOn = { value: 1 };
    }
    this.mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: POOL_VS,
      fragmentShader: POOL_FS,
      defines: soft ? { SOFT: '' } : {},
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
  }
  spawn(o: Emit): number {
    if (this.n >= this.cap) return -1;
    const i = this.n++;
    this.x[i] = o.x;
    this.y[i] = o.y;
    this.z[i] = o.z;
    this.vx[i] = o.vx ?? 0;
    this.vy[i] = o.vy ?? 0;
    this.vz[i] = o.vz ?? 0;
    this.age[i] = -(o.delay ?? 0);
    this.life[i] = o.life;
    this.s0[i] = o.s0;
    this.s1[i] = o.s1 ?? o.s0;
    this.br[i] = o.br ?? 1;
    this.st[i] = o.st ?? 0;
    this.sh[i] = o.shape ?? 0;
    this.rot[i] = o.rot ?? 0;
    this.rv[i] = o.rv ?? 0;
    this.drag[i] = o.drag ?? 0;
    this.grav[i] = o.grav ?? 0;
    this.bnc[i] = o.bnc ?? -1;
    this.curl[i] = o.curl ?? 0;
    this.tag[i] = o.tag ?? 0;
    this.rp[i] = o.ramp;
    return i;
  }
  clear(): void {
    this.n = 0;
  }
  private kill(i: number): void {
    const last = --this.n;
    if (i === last) return;
    for (const a of this.all) a[i] = a[last]!;
    this.tag[i] = this.tag[last]!;
    this.rp[i] = this.rp[last]!;
  }
  step(dt: number): void {
    this.time += dt;
    const t = this.time;
    const { x, y, z, vx, vy, vz, age, life } = this;
    for (let i = 0; i < this.n; ) {
      const ag = age[i]! + dt;
      age[i] = ag;
      if (ag >= life[i]!) {
        const tg = this.tag[i]!;
        const px = x[i]!;
        const py = y[i]!;
        const pz = z[i]!;
        const qx = vx[i]!;
        const qy = vy[i]!;
        const qz = vz[i]!;
        this.kill(i);
        if (tg && this.onDie) this.onDie(tg, px, py, pz, qx, qy, qz);
        continue;
      }
      if (ag < 0) {
        i++;
        continue;
      }
      let ux = vx[i]!;
      let uy = vy[i]! - this.grav[i]! * dt;
      let uz = vz[i]!;
      const dr = this.drag[i]!;
      if (dr) {
        const f = Math.exp(-dr * dt);
        ux *= f;
        uy *= f;
        uz *= f;
      }
      let nx = x[i]! + ux * dt;
      let ny = y[i]! + uy * dt;
      let nz = z[i]! + uz * dt;
      const cu = this.curl[i]!;
      if (cu) {
        curlAt(nx, ny, nz, t, this.curlScale);
        nx += CV.x * cu * dt;
        ny += CV.y * cu * dt;
        nz += CV.z * cu * dt;
      }
      const b = this.bnc[i]!;
      if (b >= 0 && ny < this.floorY) {
        ny = this.floorY;
        if (uy < 0) {
          uy = -uy * b;
          ux *= 0.72;
          uz *= 0.72;
        }
      }
      x[i] = nx;
      y[i] = ny;
      z[i] = nz;
      vx[i] = ux;
      vy[i] = uy;
      vz[i] = uz;
      this.rot[i] = this.rot[i]! + this.rv[i]! * dt;
      if (this.tag[i] && this.onStep) this.onStep(this, i, dt);
      i++;
    }
  }
  upload(): void {
    const P = this.aPos.array as Float32Array;
    const Vv = this.aVel.array as Float32Array;
    const C = this.aCol.array as Float32Array;
    const M = this.aMisc.array as Float32Array;
    const A = this.aAdd.array as Float32Array;
    const sm = this.sizeMul;
    for (let i = 0; i < this.n; i++) {
      const ag = this.age[i]!;
      const k = clamp(ag / this.life[i]!, 0, 1);
      const rp = this.rp[i]!;
      const f = k * (RN - 1);
      const j = Math.min(RN - 2, f | 0);
      const u = f - j;
      const o = j * 5;
      const br = this.br[i]!;
      P[i * 3] = this.x[i]!;
      P[i * 3 + 1] = this.y[i]!;
      P[i * 3 + 2] = this.z[i]!;
      Vv[i * 3] = this.vx[i]!;
      Vv[i * 3 + 1] = this.vy[i]!;
      Vv[i * 3 + 2] = this.vz[i]!;
      C[i * 4] = lerp(rp[o]!, rp[o + 5]!, u) * br;
      C[i * 4 + 1] = lerp(rp[o + 1]!, rp[o + 6]!, u) * br;
      C[i * 4 + 2] = lerp(rp[o + 2]!, rp[o + 7]!, u) * br;
      C[i * 4 + 3] = lerp(rp[o + 3]!, rp[o + 8]!, u);
      A[i] = lerp(rp[o + 4]!, rp[o + 9]!, u);
      const s0 = this.s0[i]!;
      M[i * 4] = ag < 0 ? 0 : (s0 + (this.s1[i]! - s0) * easeOut(k)) * sm;
      M[i * 4 + 1] = this.st[i]!;
      M[i * 4 + 2] = this.rot[i]!;
      M[i * 4 + 3] = this.sh[i]!;
    }
    this.geo.instanceCount = this.n;
    this.aPos.needsUpdate = true;
    this.aVel.needsUpdate = true;
    this.aCol.needsUpdate = true;
    this.aMisc.needsUpdate = true;
    this.aAdd.needsUpdate = true;
  }
}

/** 컬 잡음 (사인 퍼텐셜의 컬 — 발산 없음, 부드럽게 휘감김) */
const CV = { x: 0, y: 0, z: 0 };
function curlOct(x: number, y: number, z: number, t: number, s: number, amp: number): void {
  x *= s;
  y *= s;
  z *= s;
  const a1 = 1.3 * y + 0.7 * t;
  const a2 = 1.7 * z + 0.4 * t;
  const b1 = 1.5 * z + 0.6 * t;
  const b2 = 1.1 * x - 0.5 * t;
  const c1 = 1.2 * x + 0.8 * t;
  const c2 = 1.9 * y + 0.3 * t;
  const dAxdy = 1.3 * Math.cos(a1);
  const dAxdz = -1.7 * Math.sin(a2);
  const dAydz = 1.5 * Math.cos(b1);
  const dAydx = -1.1 * Math.sin(b2);
  const dAzdx = 1.2 * Math.cos(c1);
  const dAzdy = -1.9 * Math.sin(c2);
  CV.x += (dAzdy - dAydz) * amp;
  CV.y += (dAxdz - dAzdx) * amp;
  CV.z += (dAydx - dAxdy) * amp;
}
function curlAt(x: number, y: number, z: number, t: number, s: number): void {
  CV.x = CV.y = CV.z = 0;
  curlOct(x, y, z, t, s, 1);
  curlOct(x + 3.1, y - 1.7, z + 5.3, t * 1.3, s * 2.3, 0.45);
}

/* ───────────── 화면 위 글씨 (카메라에 붙인 스프라이트) ───────────── */

type Corner = 'tl' | 'tr' | 'bl' | 'br' | 'tc' | 'bc';
interface HudItem {
  spr: THREE.Sprite;
  aspect: number;
  corner: Corner | 'mid';
  hfrac: number;
}
interface HudLabel {
  set(text: string, accent?: string): void;
  spr: THREE.Sprite;
}
class Hud {
  private items: HudItem[] = [];
  constructor(private cam: THREE.PerspectiveCamera) {}
  private add(spr: THREE.Sprite, aspect: number, corner: Corner | 'mid', hfrac: number): void {
    spr.renderOrder = 1000;
    this.cam.add(spr);
    this.items.push({ spr, aspect, corner, hfrac });
  }
  label(corner: Corner): HudLabel {
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = 80;
    const g = c.getContext('2d')!;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    this.add(spr, c.width / c.height, corner, 0);
    let last = '';
    return {
      spr,
      set(text: string, accent = '#ffcf6a') {
        if (text + accent === last) return;
        last = text + accent;
        g.clearRect(0, 0, c.width, c.height);
        g.font = `800 40px ${FONT}`;
        const tw = Math.min(c.width - 70, g.measureText(text).width);
        const pw = tw + 64;
        const x0 = corner[1] === 'l' ? 2 : corner[1] === 'r' ? c.width - pw - 2 : (c.width - pw) / 2;
        g.fillStyle = 'rgba(8,10,18,0.66)';
        g.beginPath();
        g.roundRect(x0, 6, pw, 68, 34);
        g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.14)';
        g.lineWidth = 2;
        g.stroke();
        g.fillStyle = accent;
        g.beginPath();
        g.arc(x0 + 28, 40, 8, 0, TAU);
        g.fill();
        g.fillStyle = '#f4f1ea';
        g.textBaseline = 'middle';
        g.textAlign = 'left';
        g.fillText(text, x0 + 46, 42, tw);
        tex.needsUpdate = true;
      },
    };
  }
  /** 임의 그림 (예: 색 사다리 막대) */
  picture(tex: THREE.Texture, aspect: number, corner: Corner | 'mid', hfrac: number): THREE.Sprite {
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    this.add(spr, aspect, corner, hfrac);
    return spr;
  }
  resize(w: number, h: number): void {
    const dist = 3;
    const halfH = dist * Math.tan(THREE.MathUtils.degToRad(this.cam.fov / 2));
    const halfW = halfH * (w / h);
    const k = (2 * halfH) / h;
    const lab = clamp(h * 0.075 + 8, 22, 40);
    const m = clamp(h * 0.035, 6, 18) * k;
    for (const it of this.items) {
      const hh = it.hfrac ? it.hfrac * 2 * halfH : lab * k;
      const ww = hh * it.aspect;
      it.spr.scale.set(ww, hh, 1);
      let x = 0;
      let y = 0;
      if (it.corner !== 'mid') {
        const v = it.corner[0];
        const hz = it.corner[1];
        y = v === 't' ? halfH - m - hh / 2 : -halfH + m + hh / 2;
        x = hz === 'l' ? -halfW + m + ww / 2 : hz === 'r' ? halfW - m - ww / 2 : 0;
      }
      it.spr.position.set(x, y, -dist);
    }
  }
}

/* ───────────── 무대: 어두운 돌바닥 · 3/4 내려다보기 ───────────── */

type V3 = [number, number, number];
interface Stage {
  scene: THREE.Scene;
  cam: THREE.PerspectiveCamera;
  hud: Hud;
  puff: THREE.Texture;
  hemi: THREE.HemisphereLight;
  moon: THREE.DirectionalLight;
  spot: THREE.SpotLight;
  floorMat: THREE.MeshStandardMaterial;
  shake: number;
  tick(dt: number): void;
  resize(w: number, h: number): void;
  dispose(): void;
}
function disposeAll(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mats = (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) as THREE.Material[];
    for (const mt of mats) {
      for (const v of Object.values(mt)) if (v && (v as THREE.Texture).isTexture) (v as THREE.Texture).dispose();
      const u = (mt as THREE.ShaderMaterial).uniforms;
      if (u) for (const k of Object.keys(u)) {
        const v = u[k]!.value as THREE.Texture | null;
        if (v && v.isTexture) v.dispose();
      }
      mt.dispose();
    }
  });
}
function makeStage(o: { cam?: V3; look?: V3; fov?: number; light?: number } = {}): Stage {
  const scene = new THREE.Scene();
  const bg = new THREE.Color(0x05060a);
  scene.background = bg;
  scene.fog = new THREE.Fog(0x05060a, 9, 20);
  const cam = new THREE.PerspectiveCamera(o.fov ?? 40, 1.6, 0.1, 60);
  const base = new THREE.Vector3(...(o.cam ?? [0, 6.2, 7.4]));
  const look = new THREE.Vector3(...(o.look ?? [0, 0.4, 0]));
  cam.position.copy(base);
  cam.lookAt(look);
  scene.add(cam);
  const L = o.light ?? 1;
  const hemi = new THREE.HemisphereLight(0x5a6a90, 0x0b0907, 0.7 * L);
  const moon = new THREE.DirectionalLight(0x8aa0d0, 0.55 * L);
  moon.position.set(-4, 8, 3);
  const spot = new THREE.SpotLight(0xffd8a8, 48 * L, 22, 0.6, 0.9, 1.6);
  spot.position.set(0.5, 9, 1);
  spot.target.position.set(0, 0, 0);
  scene.add(hemi, moon, spot, spot.target);
  const stone = texFrom(stoneCanvas(), true);
  stone.wrapS = stone.wrapT = THREE.RepeatWrapping;
  stone.repeat.set(3.2, 3.2);
  const floorMat = new THREE.MeshStandardMaterial({ map: stone, bumpMap: stone, bumpScale: 2.2, roughness: 0.86, metalness: 0, color: 0xc2c6ce });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const puff = texFrom(puffCanvas());
  const hud = new Hud(cam);
  let tt = 0;
  const st: Stage = {
    scene,
    cam,
    hud,
    puff,
    hemi,
    moon,
    spot,
    floorMat,
    shake: 0,
    tick(dt: number) {
      tt += dt;
      const s = st.shake;
      cam.position.set(base.x + Math.sin(tt * 61) * s, base.y + Math.sin(tt * 53 + 1) * s * 0.8, base.z + Math.cos(tt * 47) * s * 0.6);
      cam.lookAt(look.x + Math.sin(tt * 43 + 2) * s * 0.5, look.y, look.z);
      st.shake *= Math.exp(-dt * 7);
    },
    resize(w: number, h: number) {
      hud.resize(w, h);
    },
    dispose() {
      disposeAll(scene);
      puff.dispose();
    },
  };
  return st;
}

/* ───────────── 바닥 원판 · 충격 고리 · 그을음 · 서리꽃 ───────────── */

const FLAT_VS = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const TONE = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

/** 바닥에 번지는 빛 (점광과 짝) */
function glowDisc(hex: number, I: number, size: number): { mesh: THREE.Mesh; set(I: number, hex?: number): void } {
  const col = new THREE.Color(hex).multiplyScalar(I);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: col } },
    vertexShader: FLAT_VS,
    fragmentShader: /* glsl */ `uniform vec3 uCol; varying vec2 vUv;
      void main(){ vec2 p = vUv*2.0-1.0; float r2 = dot(p,p);
        float a = exp(-r2*4.5) * (1.0 - smoothstep(0.7, 1.0, r2));
        gl_FragColor = vec4(uCol, 1.0); ${TONE}
        gl_FragColor.a = a; }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.015;
  mesh.renderOrder = 0;
  let base = hex;
  return {
    mesh,
    set(I: number, h?: number) {
      if (h !== undefined) base = h;
      col.setHex(base).multiplyScalar(I);
    },
  };
}

class Shock {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private age = 99;
  private dur = 0.5;
  private I = 1;
  constructor(geo: THREE.PlaneGeometry) {
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uR: { value: 0 }, uW: { value: 0.05 }, uA: { value: 0 }, uCol: { value: new THREE.Color() } },
      vertexShader: FLAT_VS,
      fragmentShader: /* glsl */ `uniform float uR, uW, uA; uniform vec3 uCol; varying vec2 vUv;
        void main(){ vec2 p = vUv*2.0-1.0; float r = length(p); float ang = atan(p.y, p.x);
          float d = (r - uR) / uW;
          float band = exp(-d*d) + exp(-pow((r - uR*0.82)/(uW*0.6), 2.0))*0.35;
          float inner = (1.0 - smoothstep(0.0, uR, r)) * step(r, uR) * 0.12;
          float brk = 0.72 + 0.28 * sin(ang*13.0 + r*30.0) * sin(ang*7.0 - 2.0);
          float a = (band*brk + inner) * uA * (1.0 - smoothstep(0.95, 1.0, r));
          gl_FragColor = vec4(uCol, 1.0); ${TONE}
          gl_FragColor.a = clamp(a, 0.0, 1.0); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.visible = false;
    this.mesh.renderOrder = 1;
  }
  fire(x: number, y: number, z: number, maxR: number, dur: number, hex: number, I: number): void {
    this.mesh.position.set(x, y, z);
    this.mesh.scale.setScalar(maxR);
    (this.mat.uniforms.uCol!.value as THREE.Color).setHex(hex).multiplyScalar(I);
    this.age = 0;
    this.dur = dur;
    this.I = 1;
    this.mesh.visible = true;
  }
  update(dt: number): void {
    if (this.age > this.dur) {
      this.mesh.visible = false;
      return;
    }
    this.age += dt;
    const k = clamp(this.age / this.dur, 0, 1);
    const u = this.mat.uniforms;
    u.uR!.value = easeOut(k) * 0.9;
    u.uW!.value = 0.035 + 0.06 * k;
    u.uA!.value = Math.pow(1 - k, 1.4) * this.I;
  }
}

/** 그을음 데칼 (탄 자국은 덮고, 불씨 금은 빛난다) */
class Scorch {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private age = 99;
  hold = 2.2;
  constructor(geo: THREE.PlaneGeometry, tex: THREE.Texture) {
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: tex }, uA: { value: 0 }, uHeat: { value: 0 }, uEmb: { value: new THREE.Color(0xff5a10).multiplyScalar(4) } },
      vertexShader: FLAT_VS,
      fragmentShader: /* glsl */ `uniform sampler2D uTex; uniform float uA, uHeat; uniform vec3 uEmb; varying vec2 vUv;
        void main(){ vec4 t = texture2D(uTex, vUv); float ch = t.r * uA; float em = t.g * uHeat * uA;
          gl_FragColor = vec4(uEmb * em, 1.0); ${TONE}
          gl_FragColor = vec4(gl_FragColor.rgb * min(em * 3.0, 1.0), min(ch * 0.95, 0.92)); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.012;
    this.mesh.visible = false;
    this.mesh.renderOrder = 0;
  }
  fire(x: number, z: number, size: number): void {
    this.mesh.position.x = x;
    this.mesh.position.z = z;
    this.mesh.scale.setScalar(size);
    this.mesh.rotation.z = Math.random() * TAU;
    this.age = 0;
    this.mesh.visible = true;
  }
  update(dt: number): void {
    if (!this.mesh.visible) return;
    this.age += dt;
    const a = this.age;
    const u = this.mat.uniforms;
    u.uA!.value = clamp(a / 0.08, 0, 1) * (1 - clamp((a - this.hold) / 1.4, 0, 1));
    u.uHeat!.value = Math.exp(-a * 1.1) * (0.85 + 0.15 * Math.sin(a * 23));
    if (a > this.hold + 1.4) this.mesh.visible = false;
  }
}

/* ───────────── 효과 묶음: 연기 · 불 · 핵 통 + 고리 · 그을음 · 번쩍 빛 ───────────── */

class Fx {
  readonly smoke: Pool;
  readonly fire: Pool;
  readonly orb: Pool;
  readonly shocks: Shock[] = [];
  readonly scorches: Scorch[] = [];
  readonly light: THREE.PointLight;
  private lightAge = 99;
  private lightPeak = 0;
  lightOn = true;
  private si = 0;
  private ci = 0;
  /** 데모가 덧붙이는 하위 방출 */
  extraStep: ((p: Pool, i: number, dt: number) => void) | null = null;
  constructor(
    private S: Stage,
    cap = 1600,
  ) {
    this.smoke = new Pool(Math.round(cap * 0.5), S.puff);
    this.fire = new Pool(cap, S.puff);
    this.orb = new Pool(64, S.puff);
    this.smoke.mesh.renderOrder = 2;
    this.fire.mesh.renderOrder = 3;
    this.orb.mesh.renderOrder = 4;
    S.scene.add(this.smoke.mesh, this.fire.mesh, this.orb.mesh);
    const ring = new THREE.PlaneGeometry(2, 2);
    for (let i = 0; i < 4; i++) {
      const s = new Shock(ring);
      this.shocks.push(s);
      S.scene.add(s.mesh);
    }
    const tex = texFrom(scorchCanvas());
    const sg = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < 3; i++) {
      const s = new Scorch(sg, tex);
      this.scorches.push(s);
      S.scene.add(s.mesh);
    }
    this.light = new THREE.PointLight(0xffa050, 0, 14, 1.6);
    S.scene.add(this.light);
    this.fire.onStep = (p, i, dt) => {
      if (p.tag[i] === 7 && Math.random() < dt * 45) {
        // 날아가는 파편 → 꼬리 연기 · 불씨 (하위 방출)
        this.smoke.spawn({ x: p.x[i]!, y: p.y[i]!, z: p.z[i]!, vy: 0.4, life: R(0.6, 1.0), s0: 0.12, s1: 0.45, ramp: RAMP.smoke, shape: 1, rot: R(0, TAU), rv: R(-1, 1), drag: 1 });
        this.fire.spawn({ x: p.x[i]!, y: p.y[i]!, z: p.z[i]!, vx: R(-0.3, 0.3), vy: R(0, 0.5), vz: R(-0.3, 0.3), life: R(0.25, 0.45), s0: 0.09, s1: 0.02, ramp: RAMP.ember, shape: 0 });
      }
      this.extraStep?.(p, i, dt);
    };
  }
  ring(x: number, z: number, maxR: number, dur: number, hex: number, I: number): void {
    const s = this.shocks[this.si++ % this.shocks.length]!;
    s.fire(x, 0.03, z, maxR, dur, hex, I);
  }
  scorch(x: number, z: number, size: number): void {
    this.scorches[this.ci++ % this.scorches.length]!.fire(x, z, size);
  }
  flash(x: number, y: number, z: number, peak: number, hex: number): void {
    this.light.position.set(x, y, z);
    this.light.color.setHex(hex);
    this.lightAge = 0;
    this.lightPeak = peak;
  }
  shake(v: number): void {
    this.S.shake = Math.max(this.S.shake, v);
  }
  /** 불 폭발 — 번쩍 · 불덩이 · 불티 · 파편(꼬리) · 연기 · 먼지 고리 · 충격 고리 · 그을음 · 빛 */
  boom(x: number, y: number, z: number, o: { k?: number; sc?: number; ring?: boolean; scorch?: boolean; light?: boolean; debris?: boolean; shake?: number } = {}): void {
    const k = o.k ?? 1;
    const sc = o.sc ?? 1;
    const F = this.fire;
    const S = this.smoke;
    F.spawn({ x, y: y + 0.35 * sc, z, life: 0.24, s0: 2.4 * sc, s1: 4.4 * sc, ramp: RAMP.flash, shape: 0 });
    for (let i = 0; i < 8; i++) {
      const d = sphereDir();
      F.spawn({ x: x + d.x * 0.2, y: y + 0.3 + Math.abs(d.y) * 0.2, z: z + d.z * 0.2, vx: d.x * 1.5, vy: Math.abs(d.y) * 1.5, vz: d.z * 1.5, life: R(0.3, 0.45), s0: 0.9 * sc, s1: 1.7 * sc, ramp: RAMP.flash, br: 0.5, shape: 0, drag: 4 });
    }
    const nf = Math.round(28 * k);
    for (let i = 0; i < nf; i++) {
      const d = sphereDir();
      const dy = Math.abs(d.y) * 0.9 + 0.1;
      const sp = R(1.5, 4.8) * sc;
      F.spawn({ x: x + d.x * 0.2, y: y + 0.15 + dy * 0.2, z: z + d.z * 0.2, vx: d.x * sp, vy: dy * sp, vz: d.z * sp, life: R(0.55, 1.05), s0: R(0.5, 0.8) * sc, s1: R(1.2, 1.9) * sc, ramp: RAMP.fire, shape: 1, rot: R(0, TAU), rv: R(-2, 2), drag: 3.2, grav: -1.6 });
    }
    const ns = Math.round(70 * k);
    for (let i = 0; i < ns; i++) {
      const d = sphereDir();
      const dy = Math.abs(d.y) * 0.8 + 0.2;
      const sp = R(4, 11) * sc;
      F.spawn({ x, y: y + 0.2, z, vx: d.x * sp, vy: dy * sp, vz: d.z * sp, life: R(0.5, 1.3), s0: 0.08, s1: 0.03, ramp: RAMP.spark, st: 0.05, shape: 2, drag: 0.9, grav: 9, bnc: 0.35 });
    }
    if (o.debris !== false) {
      const nd = Math.round(9 * k);
      for (let i = 0; i < nd; i++) {
        const d = coneDir(1.0);
        const sp = R(4, 7.5) * sc;
        F.spawn({ x, y: y + 0.2, z, vx: d.x * sp, vy: d.y * sp, vz: d.z * sp, life: R(1.0, 1.7), s0: 0.15, s1: 0.08, ramp: RAMP.ember, shape: 2, drag: 0.3, grav: 9, bnc: 0.3, tag: 7 });
      }
    }
    const nm = Math.round(16 * k);
    for (let i = 0; i < nm; i++) {
      const d = sphereDir();
      S.spawn({ x: x + d.x * 0.4, y: y + 0.4 + Math.abs(d.y) * 0.4, z: z + d.z * 0.4, vx: d.x * 1.2, vy: Math.abs(d.y) * 1.2 + 0.7, vz: d.z * 1.2, life: R(1.6, 2.6), s0: 0.7 * sc, s1: 2.3 * sc, ramp: RAMP.smoke, shape: 1, rot: R(0, TAU), rv: R(-0.6, 0.6), drag: 1.2, grav: -0.5, delay: R(0.05, 0.3), curl: 0.25 });
    }
    const nr = Math.round(22 * k);
    for (let i = 0; i < nr; i++) {
      const a = (i / nr) * TAU + R(0, 0.2);
      const sp = R(3.5, 5.2) * sc;
      S.spawn({ x: x + Math.cos(a) * 0.3, y: 0.18, z: z + Math.sin(a) * 0.3, vx: Math.cos(a) * sp, vy: 0.25, vz: Math.sin(a) * sp, life: R(0.9, 1.4), s0: 0.35 * sc, s1: 1.3 * sc, ramp: RAMP.dust, shape: 1, rot: R(0, TAU), rv: R(-1, 1), drag: 2.6 });
    }
    if (o.ring !== false) {
      this.ring(x, z, 3.4 * sc, 0.6, 0xffa850, 3);
      this.ring(x, z, 2.2 * sc, 0.4, 0xfff4e0, 2.2);
    }
    if (o.scorch !== false) this.scorch(x, z, 2.0 * sc);
    if (o.light !== false) this.flash(x, y + 0.7, z, 110 * sc, 0xffa050);
    this.shake(o.shake ?? 0.1 * sc);
  }
  update(dt: number, t: number): void {
    this.smoke.step(dt);
    this.fire.step(dt);
    this.orb.step(dt);
    this.smoke.upload();
    this.fire.upload();
    this.orb.upload();
    for (const s of this.shocks) s.update(dt);
    for (const s of this.scorches) s.update(dt);
    this.lightAge += dt;
    this.light.intensity = this.lightOn ? this.lightPeak * Math.exp(-this.lightAge * 6.5) * (0.85 + 0.15 * Math.sin(t * 90)) : 0;
  }
}

/* ───────────── 흐르는 무늬 셰이더 (UV 스크롤) ───────────── */

const NOISE_GLSL = /* glsl */ `
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float pn(vec2 p, float per){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  float a = h21(vec2(mod(i.x, per), i.y)), b = h21(vec2(mod(i.x+1.0, per), i.y));
  float c = h21(vec2(mod(i.x, per), i.y+1.0)), d = h21(vec2(mod(i.x+1.0, per), i.y+1.0));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
float fbm(vec2 p, float per){ float s = 0.0, a = 0.5; for (int k = 0; k < 4; k++){ s += a*pn(p, per); p *= 2.0; per *= 2.0; a *= 0.5; } return s; }`;

function scrollMat(colA: number, colB: number, o: { per?: number; sy?: number; twist?: number; bright?: number; polar?: boolean; speed?: number; core?: boolean } = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSpeed: { value: o.speed ?? 1 },
      uTwist: { value: o.twist ?? 1.5 },
      uPer: { value: o.per ?? 6 },
      uSy: { value: o.sy ?? 3 },
      uOn: { value: 1 },
      uA: { value: 1 },
      uBright: { value: o.bright ?? 1 },
      uColA: { value: new THREE.Color(colA) },
      uColB: { value: new THREE.Color(colB) },
      uCore: { value: o.core ? 1 : 0 },
    },
    defines: o.polar ? { POLAR: '' } : {},
    vertexShader: /* glsl */ `varying vec2 vUv; varying float vF;
      void main(){
      #ifdef POLAR
        vUv = position.xy;
        vF = 0.0;
      #else
        vUv = uv;
        vec3 n = normalize(normalMatrix * normal);
        vec4 mv0 = modelViewMatrix * vec4(position, 1.0);
        vF = abs(dot(n, normalize(-mv0.xyz)));
      #endif
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform float uTime, uSpeed, uTwist, uPer, uSy, uOn, uA, uBright, uCore; uniform vec3 uColA, uColB;
      varying vec2 vUv; varying float vF; ${NOISE_GLSL}
      void main(){
        float T = uTime * uSpeed;
      #ifdef POLAR
        float r = length(vUv);
        float ax = atan(vUv.y, vUv.x) / 6.2831853 + 0.5;
        vec2 p = vec2(ax * uPer + r * uTwist + T * 0.25, r * uSy + T * 0.9);
        float fade = smoothstep(0.05, 0.3, r) * (1.0 - smoothstep(0.75, 1.0, r));
        float rim = 1.0;
      #else
        vec2 p = vec2(vUv.x * uPer + vUv.y * uTwist + T * 0.35, vUv.y * uSy - T);
        float fade = smoothstep(0.0, 0.14, vUv.y) * (1.0 - smoothstep(0.72, 1.0, vUv.y));
        float rim = mix(mix(0.35, 1.0, pow(1.0 - vF, 1.3)), mix(0.15, 1.3, pow(vF, 1.5)), uCore);
      #endif
        float n = fbm(p, uPer);
        float n2 = fbm(vec2(p.x * 2.0, p.y * 1.7 - T * 0.8), uPer * 2.0);
        float m = smoothstep(0.36, 0.86, n * 0.62 + n2 * 0.55);
        m = mix(0.42, m, uOn);
        vec3 col = mix(uColB, uColA, m) * uBright * (0.35 + 2.6 * m * m);
        gl_FragColor = vec4(col, 1.0); ${TONE}
        gl_FragColor.a = clamp(m * fade * rim * uA, 0.0, 1.0); }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

/** 마법진 한 겹 (룬 그림 + 각도로 그려지는 띠) */
function runeMat(layer: 0 | 1 | 2, hex: number, I: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTex: { value: texFrom(runeCanvas(layer)) }, uCol: { value: new THREE.Color(hex).multiplyScalar(I) }, uA: { value: 1 }, uRev: { value: 1 }, uTime: { value: 0 } },
    vertexShader: FLAT_VS,
    fragmentShader: /* glsl */ `uniform sampler2D uTex; uniform vec3 uCol; uniform float uA, uRev, uTime; varying vec2 vUv;
      void main(){ vec2 p = vUv*2.0-1.0; float r = length(p);
        float ang = atan(p.x, p.y) / 6.2831853 + 0.5;
        float vis = step(ang, uRev);
        float edge = exp(-pow((uRev - ang) * 30.0, 2.0)) * step(ang, uRev) * step(uRev, 0.999);
        float t = texture2D(uTex, vUv).r;
        float pulse = 0.85 + 0.15 * sin(uTime * 5.0 - r * 14.0);
        vec3 col = uCol * pulse * (1.0 + edge * 5.0);
        gl_FragColor = vec4(col, 1.0); ${TONE}
        gl_FragColor.a = clamp(t * vis * uA, 0.0, 1.0); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/* ───────────── 소품 ───────────── */

function stoneMat(hex = 0x5a5e68): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: hex, roughness: 0.92, metalness: 0, flatShading: true });
}
function pillar(h = 2.8): THREE.Group {
  const g = new THREE.Group();
  const m = stoneMat();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, h, 10), m);
  body.position.y = h / 2;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.22, 0.85), m);
  cap.position.y = h + 0.11;
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.24, 0.85), m);
  foot.position.y = 0.12;
  g.add(body, cap, foot);
  return g;
}
function rock(s: number, seed: number): THREE.Mesh {
  const geo = new THREE.DodecahedronGeometry(s, 0);
  const r = rng(seed);
  const p = geo.attributes.position!;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.8 + r() * 0.4), p.getY(i) * (0.55 + r() * 0.3), p.getZ(i) * (0.8 + r() * 0.4));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, stoneMat(0x4c5058));
  m.position.y = s * 0.3;
  return m;
}

/* ───────────── 보조 ───────────── */

const ctrlBtn = (label: string, on: () => void): Control => ({ type: 'button', label, on });
const ctrlTog = (label: string, value: boolean, on: (v: boolean) => void): Control => ({ type: 'toggle', label, value, on });
const ctrlRange = (label: string, min: number, max: number, step: number, value: number, on: (v: number) => void): Control => ({ type: 'range', label, min, max, step, value, on });

/** 이차 베지어 */
function bez(a: THREE.Vector3, c: THREE.Vector3, b: THREE.Vector3, k: number, out: THREE.Vector3): THREE.Vector3 {
  const u = 1 - k;
  return out.set(u * u * a.x + 2 * u * k * c.x + k * k * b.x, u * u * a.y + 2 * u * k * c.y + k * k * b.y, u * u * a.z + 2 * u * k * c.z + k * k * b.z);
}

/* ───────────── 견본 ───────────── */

export const DEMOS: DemoMap = {
  /* i170 입자 방출기 (수명 곡선) */
  i170: {
    kind: '3d',
    caption: '방출 모양(점 · 원 · 원뿔 · 구)이 바뀌고, 입자는 수명 곡선대로 커졌다 식으며 사라진다',
    make(): Scene3D {
      const S = makeStage();
      const P = new Pool(2200, S.puff);
      P.mesh.renderOrder = 3;
      S.scene.add(P.mesh);
      const lab = S.hud.label('tl');
      const gz = new THREE.Group();
      S.scene.add(gz);
      const lineMat = new THREE.LineBasicMaterial({ color: 0x6fdcff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
      const circle = (pts: number[], r: number, cy: number, axis: 'y' | 'x' | 'z', cx = 0, cz = 0): void => {
        const n = 64;
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * TAU;
          const a1 = ((i + 1) / n) * TAU;
          for (const a of [a0, a1]) {
            if (axis === 'y') pts.push(cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r);
            else if (axis === 'x') pts.push(cx, cy + Math.cos(a) * r, cz + Math.sin(a) * r);
            else pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r, cz);
          }
        }
      };
      const mkLines = (pts: number[]): THREE.LineSegments => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        const l = new THREE.LineSegments(g, lineMat);
        gz.add(l);
        return l;
      };
      const CONE = (24 * Math.PI) / 180;
      const giz: THREE.LineSegments[] = [];
      {
        const p: number[] = [];
        circle(p, 0.12, 1.0, 'y');
        p.push(-0.25, 1, 0, 0.25, 1, 0, 0, 0.75, 0, 0, 1.25, 0, 0, 1, -0.25, 0, 1, 0.25);
        giz.push(mkLines(p));
      }
      {
        const p: number[] = [];
        circle(p, 1.4, 0.06, 'y');
        circle(p, 1.32, 0.06, 'y');
        giz.push(mkLines(p));
      }
      {
        const p: number[] = [];
        const top = 1.7;
        const rr = Math.tan(CONE) * top;
        circle(p, rr, top, 'y');
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          p.push(0, 0.05, 0, Math.cos(a) * rr, top, Math.sin(a) * rr);
        }
        giz.push(mkLines(p));
      }
      {
        const p: number[] = [];
        circle(p, 0.95, 1.25, 'y');
        circle(p, 0.95, 1.25, 'x');
        circle(p, 0.95, 1.25, 'z');
        giz.push(mkLines(p));
      }
      const disc = glowDisc(0x58c8ff, 1.4, 5);
      S.scene.add(disc.mesh);
      const pl = new THREE.PointLight(0x60d0ff, 9, 8, 1.6);
      pl.position.set(0, 0.9, 0);
      S.scene.add(pl);
      let mode = -1;
      let rate = 1;
      let curves = true;
      let acc = 0;
      const NAMES = ['점에서 방출', '원 둘레에서 방출', '원뿔 안으로 방출', '구 겉면에서 방출'];
      const emit = (m: number): void => {
        let x = 0;
        let y = 1;
        let z = 0;
        let vx = 0;
        let vy = 0;
        let vz = 0;
        let grav = 0;
        if (m === 0) {
          const d = sphereDir();
          const sp = R(1.1, 2.0);
          vx = d.x * sp;
          vy = d.y * sp;
          vz = d.z * sp;
        } else if (m === 1) {
          const a = Math.random() * TAU;
          x = Math.cos(a) * 1.36;
          z = Math.sin(a) * 1.36;
          y = 0.08;
          vx = Math.cos(a) * 0.3;
          vz = Math.sin(a) * 0.3;
          vy = R(1.0, 1.8);
        } else if (m === 2) {
          const d = coneDir(CONE);
          const sp = R(2.8, 3.8);
          y = 0.05;
          vx = d.x * sp;
          vy = d.y * sp;
          vz = d.z * sp;
          grav = 1.6;
        } else {
          const d = sphereDir();
          x = d.x * 0.95;
          y = 1.25 + d.y * 0.95;
          z = d.z * 0.95;
          vx = d.x * 0.55;
          vy = d.y * 0.55;
          vz = d.z * 0.55;
        }
        const big = Math.random() < 0.15;
        P.spawn({
          x,
          y,
          z,
          vx,
          vy,
          vz,
          life: R(1.2, 1.8),
          s0: curves ? (big ? 0.1 : 0.03) : big ? 0.3 : 0.12,
          s1: curves ? (big ? 0.55 : 0.2) : big ? 0.3 : 0.12,
          ramp: curves ? RAMP.emit : RAMP.emitFlat,
          br: big ? 0.35 : 1,
          shape: big ? 0 : 2,
          drag: curves ? 0.7 : 0,
          grav,
        });
      };
      const controls: Control[] = [
        ctrlRange('방출 모양 (-1 = 자동, 0 점 · 1 원 · 2 원뿔 · 3 구)', -1, 3, 1, -1, (v) => (mode = v)),
        ctrlTog('수명 곡선 (크기 · 색 · 투명도)', true, (v) => (curves = v)),
        ctrlRange('입자 수 (배)', 0.3, 3, 0.1, 1, (v) => (rate = v)),
      ];
      return {
        scene: S.scene,
        camera: S.cam,
        controls,
        update(t, dt0) {
          const dt = Math.min(dt0, 0.05);
          const m = mode < 0 ? Math.floor(t / 3) % 4 : mode;
          giz.forEach((g, i) => (g.visible = i === m));
          lab.set(NAMES[m]! + (curves ? ' · 수명 곡선' : ' · 곡선 없음'), curves ? '#7fe6ff' : '#888');
          acc += dt * 170 * rate;
          while (acc >= 1) {
            acc--;
            emit(m);
          }
          gz.rotation.y = t * 0.2;
          lineMat.opacity = 0.35 + 0.15 * Math.sin(t * 4);
          P.step(dt);
          P.upload();
          S.tick(dt);
        },
        resize: (w, h) => S.resize(w, h),
        dispose: () => S.dispose(),
      };
    },
  },

  /* i171 층 쌓기 */
  i171: {
    kind: '3d',
    caption: '마법 구슬 하나 = 핵 + 빛무리 + 불티 + 연기 + 바닥 빛 — 층이 하나씩 쌓이며 풍성해진다',
    make(): Scene3D {
      const S = makeStage();
      const smoke = new Pool(700, S.puff);
      const sparks = new Pool(700, S.puff);
      const orb = new Pool(16, S.puff);
      smoke.mesh.renderOrder = 2;
      sparks.mesh.renderOrder = 3;
      orb.mesh.renderOrder = 4;
      smoke.curlScale = 0.8;
      S.scene.add(smoke.mesh, sparks.mesh, orb.mesh);
      const disc = glowDisc(0xa060ff, 2.2, 4.4);
      S.scene.add(disc.mesh);
      const pl = new THREE.PointLight(0xb070ff, 0, 7, 1.5);
      S.scene.add(pl);
      const lab = S.hud.label('tl');
      const on = [true, true, true, true, true];
      let manual = false;
      const NAMES = ['핵', '빛무리', '불티', '연기', '바닥 빛'];
      const CORE = flat(0xfff4ff, 9, 1);
      const CORE2 = flat(0xd8a0ff, 4, 0.9);
      const HALO = flat(0x9a50ff, 2.6, 0.7);
      const HALO2 = flat(0x6a30ff, 1.1, 0.5);
      const pos = new THREE.Vector3();
      const prev = new THREE.Vector3();
      let accS = 0;
      let accM = 0;
      const controls: Control[] = NAMES.map((n, i) =>
        ctrlTog(n, true, (v) => {
          manual = true;
          on[i] = v;
        }),
      );
      return {
        scene: S.scene,
        camera: S.cam,
        controls,
        update(t, dt0) {
          const dt = Math.min(dt0, 0.05);
          let L = 5;
          if (!manual) {
            const k = Math.floor(t / 1.5) % 8;
            L = Math.min(k + 1, 5);
            for (let i = 0; i < 5; i++) on[i] = i < L;
            lab.set(k < 5 ? `+ ${NAMES[k]!}  (${L}층)` : '다섯 층 모두', k < 5 ? '#c08cff' : '#ffcf6a');
          } else {
            lab.set(NAMES.filter((_, i) => on[i]).join(' + ') || '아무 층도 없음', '#c08cff');
          }
          prev.copy(pos);
          const a = t * 1.15;
          pos.set(Math.cos(a) * 2.3, 1.15 + Math.sin(t * 2.3) * 0.15, Math.sin(a) * 1.5);
          const vx = (pos.x - prev.x) / Math.max(dt, 1e-3);
          const vz = (pos.z - prev.z) / Math.max(dt, 1e-3);
          orb.clear();
          if (on[0]) {
            orb.spawn({ x: pos.x, y: pos.y, z: pos.z, life: 1, s0: 0.3 + Math.sin(t * 30) * 0.02, ramp: CORE, shape: 0 });
            orb.spawn({ x: pos.x, y: pos.y, z: pos.z, life: 1, s0: 0.55, ramp: CORE2, shape: 0 });
          }
          if (on[1]) {
            orb.spawn({ x: pos.x, y: pos.y, z: pos.z, life: 1, s0: 1.5 + Math.sin(t * 7) * 0.08, ramp: HALO, shape: 0 });
            orb.spawn({ x: pos.x, y: pos.y, z: pos.z, life: 1, s0: 2.8, ramp: HALO2, shape: 0 });
            orb.spawn({ x: pos.x, y: pos.y, z: pos.z, life: 1, s0: 1.0, ramp: flat(0xc090ff, 1.2, 0.8), shape: 4, rot: t * 0.6 });
          }
          if (on[2]) {
            accS += dt * 70;
            while (accS >= 1) {
              accS--;
              const d = sphereDir();
              const sp = R(1.2, 3.2);
              sparks.spawn({ x: pos.x + d.x * 0.1, y: pos.y + d.y * 0.1, z: pos.z + d.z * 0.1, vx: d.x * sp - vx * 0.25, vy: d.y * sp + 0.6, vz: d.z * sp - vz * 0.25, life: R(0.45, 0.9), s0: 0.07, s1: 0.02, ramp: RAMP.magicSpark, st: 0.06, shape: 2, drag: 1.2, grav: 3, bnc: 0.4 });
            }
          }
          if (on[3]) {
            accM += dt * 34;
            while (accM >= 1) {
              accM--;
              smoke.spawn({ x: pos.x + R(-0.1, 0.1), y: pos.y + R(-0.1, 0.1), z: pos.z + R(-0.1, 0.1), vx: -vx * 0.1, vy: R(0.2, 0.5), vz: -vz * 0.1, life: R(1.3, 2.0), s0: 0.35, s1: 1.25, ramp: RAMP.magicSmoke, shape: 1, rot: R(0, TAU), rv: R(-1, 1), drag: 1.5, curl: 0.35 });
            }
          }
          const gl = on[4] ? 1 : 0;
          pl.position.set(pos.x, pos.y - 0.3, pos.z);
          pl.intensity = gl * (13 + Math.sin(t * 17) * 1.5);
          disc.mesh.visible = !!gl;
          disc.mesh.position.set(pos.x, 0.015, pos.z);
          smoke.step(dt);
          sparks.step(dt);
          smoke.upload();
          sparks.upload();
          orb.upload();
          S.tick(dt);
        },
        resize: (w, h) => S.resize(w, h),
        dispose: () => S.dispose(),
      };
    },
  },

  /* i172 흐르는 무늬 메시 (UV 스크롤) */
  i172: {
    kind: '3d',
    caption: '입자 없이 원뿔 · 원통 · 원판 메시에 잡음 무늬를 흘려 만든 소용돌이 기둥',
    make(): Scene3D {
      const S = makeStage({ cam: [0, 5.4, 7.6], look: [0, 1.2, 0] });
      const lab = S.hud.label('tl');
      const swirl = new THREE.Group();
      const mOuter = scrollMat(0xd8b0ff, 0x4020c0, { per: 5, sy: 2.4, twist: 2.2, bright: 1.2 });
      const mInner = scrollMat(0xffffff, 0x60a0ff, { per: 4, sy: 3.5, twist: 3.0, bright: 1.6, speed: 1.6 });
      const mDisc = scrollMat(0xe0c0ff, 0x5030d0, { per: 7, sy: 3, twist: 3, bright: 1.2, polar: true });
      const outer = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 0.3, 3.4, 64, 1, true), mOuter);
      outer.position.y = 1.7;
      const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.18, 3.8, 48, 1, true), mInner);
      inner.position.y = 1.9;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(2.4, 96, 0, TAU), mDisc);
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.03;
      disc.scale.setScalar(1);
      // 원판 극좌표: 위치 길이가 0..1 이 되게 반지름 1 로 만들고 크기로 키움
      disc.geometry.dispose();
      disc.geometry = new THREE.CircleGeometry(1, 96);
      disc.scale.setScalar(2.4);
      swirl.add(disc, outer, inner);
      S.scene.add(swirl);
      const beam = new THREE.Group();
      const mBeam = scrollMat(0xffffff, 0xffa040, { per: 4, sy: 6, twist: 0.6, bright: 2.2, speed: 2.4, core: true });
      const mBeam2 = scrollMat(0xffb040, 0xff3000, { per: 5, sy: 4, twist: -1.0, bright: 1.3, speed: 1.4, core: true });
      const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 7.5, 32, 1, true), mBeam);
      const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.42, 7.5, 32, 1, true), mBeam2);
      for (const b of [b1, b2]) {
        b.rotation.z = Math.PI / 2;
        b.position.y = 1.1;
      }
      beam.add(b2, b1);
      S.scene.add(beam);
      const gd = glowDisc(0x9060ff, 2.2, 6);
      S.scene.add(gd.mesh);
      const pl = new THREE.PointLight(0x9a70ff, 14, 9, 1.4);
      pl.position.set(0, 1.0, 0);
      S.scene.add(pl);
      let mode = -1;
      let speed = 1;
      let pattern = true;
      const mats = [mOuter, mInner, mDisc, mBeam, mBeam2];
      const controls: Control[] = [
        ctrlTog('잡음 무늬 흘리기', true, (v) => (pattern = v)),
        ctrlRange('흐름 속도', 0, 3, 0.1, 1, (v) => (speed = v)),
        ctrlRange('모양 (-1 자동 · 0 소용돌이 · 1 빔)', -1, 1, 1, -1, (v) => (mode = v)),
      ];
      let time = 0;
      return {
        scene: S.scene,
        camera: S.cam,
        controls,
        update(t, dt0) {
          const dt = Math.min(dt0, 0.05);
          time += dt * speed;
          const m = mode < 0 ? Math.floor(t / 5) % 2 : mode;
          swirl.visible = m === 0;
          beam.visible = m === 1;
          for (const mt of mats) {
            mt.uniforms.uTime!.value = time;
            mt.uniforms.uOn!.value = pattern ? 1 : 0;
          }
          swirl.rotation.y = time * 0.6;
          if (m === 0) {
            gd.mesh.scale.set(1, 1, 1);
            gd.set(2.2, 0x9060ff);
            pl.color.setHex(0x9a70ff);
            pl.position.set(0, 1, 0);
          } else {
            gd.mesh.scale.set(1.5, 0.45, 1);
            gd.set(1.6, 0xff7020);
            pl.color.setHex(0xff8030);
            pl.position.set(0, 0.8, 0);
          }
          pl.intensity = 14 + Math.sin(t * 13) * 2;
          lab.set((m === 0 ? '소용돌이 (원뿔 + 원통 + 원판)' : '빔 (원통 두 겹)') + (pattern ? ' · 무늬 흐름' : ' · 무늬 없음'), m === 0 ? '#c08cff' : '#ffa050');
          S.tick(dt);
        },
        resize: (w, h) => S.resize(w, h),
        dispose: () => S.dispose(),
      };
    },
  },

  /* i173 속도 방향으로 늘어나는 입자 */
  i173: {
    kind: '3d',
    caption: '튀는 불티를 속도 방향으로 길게 늘이면 빠르게 보인다 — 늘이기 켬/끔을 번갈아',
    make(): Scene3D {
      const S = makeStage();
      const fx = new Fx(S, 1400);
      const lab = S.hud.label('tl');
      let auto = true;
      let stretch = true;
      let amount = 1;
      let timer = 0.3;
      let shot = 0;
      let cur = true;
      const fire = (): void => {
        shot++;
        cur = auto ? shot % 2 === 1 : stretch;
        const x = R(-0.6, 0.6);
        const z = R(-0.4, 0.4);
        const st = cur ? 0.05 * amount : 0;
        fx.fire.spawn({ x, y: 0.3, z, life: 0.25, s0: 1.6, s1: 2.6, ramp: RAMP.flash, shape: 0 });
        for (let i = 0; i < 170; i++) {
          const d = coneDir(1.1);
          const sp = R(4, 10);
          fx.fire.spawn({ x, y: 0.15, z, vx: d.x * sp, vy: d.y * sp, vz: d.z * sp, life: R(1.0, 1.9), s0: 0.12, s1: 0.05, ramp: RAMP.spark, st, shape: 2, drag: 0.35, grav: 9.8, bnc: 0.42 });
        }
        fx.ring(x, z, 2.2, 0.45, 0xffb060, 2);
        fx.flash(x, 0.8, z, 70, 0xffa050);
      };
      const controls: Control[] = [
        ctrlTog('속도로 늘이기', true, (v) => {
          auto = false;
          stretch = v;
        }),
        ctrlRange('늘이는 정도', 0.2, 3, 0.1, 1, (v) => (amount = v)),
        ctrlBtn('다시 쏘기', () => {
          timer = 2;
          fire();
        }),
      ];
      return {
        scene: S.scene,
        camera: S.cam,
        controls,
        update(t, dt0) {
          const dt = Math.min(dt0, 0.05);
          timer -= dt;
          if (timer <= 0) {
            timer = 2.1;
            fire();
          }
          lab.set(cur ? '속도 방향으로 늘임 → 빠르다' : '둥근 점 그대로 → 느려 보인다', cur ? '#ffb050' : '#888');
          fx.update(dt, t);
          S.tick(dt);
        },
        resize: (w, h) => S.resize(w, h),
        dispose: () => S.dispose(),
      };
    },
  },

  /* i174 컬 잡음 소용돌이 */
  i174: {
    kind: '3d',
    caption: '치유 오라: 컬 잡음을 따라 부드럽게 휘감기는 입자 ↔ 그냥 무작위로 흔들리는 입자',
    make(): Scene3D {
      const S = makeStage({ cam: [0, 5.2, 7.2], look: [0, 1.1, 0] });
      const P = new Pool(2400, S.puff);
      P.mesh.renderOrder = 3;
      P.curlScale = 0.85;
      S.scene.add(P.mesh);
      const lab = S.hud.label('tl');
      const gd = glowDisc(0x40ffb0, 1.6, 5);
      S.scene.add(gd.mesh);
      const ringM = new THREE.Mesh(new THREE.RingGeometry(1.08, 1.16, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x60ffc0).multiplyScalar(2), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
      ringM.rotation.x = -Math.PI / 2;
      ringM.position.y = 0.02;
      S.scene.add(ringM);
      const pl = new THREE.PointLight(0x50ffb0, 10, 8, 1.5);
      pl.position.set(0, 1, 0);
      S.scene.add(pl);
      let auto = true;
      let curlOn = true;
      let amt = 1.3;
      let rate = 1;
      let acc = 0;
      P.onStep = (p, i, dt) => {
        // 무작위 흔들기 (비교용): 매 프레임 마구 바뀌는 방향
        const j = 7 * dt;
        p.vx[i] = p.vx[i]! * 0.9 + R(-1, 1) * j * 6;
        p.vz[i] = p.vz[i]! * 0.9 + R(-1, 1) * j * 6;
        p.vy[i] = p.vy[i]! + R(-1, 1) * j;
      };
      const controls: Control[] = [
        ctrlTog('컬 잡음 (끄면 무작위)', true, (v) => {
          auto = false;
          curlOn = v;
        }),
        ctrlRange('소용돌이 세기', 0, 3, 0.1, 1.3, (v) => (amt = v)),
        ctrlRange('입자 수 (배)', 0.3, 2.5, 0.1, 1, (v) => (rate = v)),
      ];
      return {
        scene: S.scene,
        camera: S.cam,
        controls,
        update(t, dt0) {
          const dt = Math.min(dt0, 0.05);
          const c = auto ? Math.floor(t / 4.5) % 2 === 0 : curlOn;
          lab.set(c ? '컬 잡음 — 부드럽게 휘감김' : '무작위 흔들기 — 지글지글', c ? '#60ffc0' : '#888');
          acc += dt * 190 * rate;
          while (acc >= 1) {
            acc--;
            const a = Math.random() * TAU;
            const r = R(0.2, 1.1);
            const big = Math.random() < 0.06;
            P.spawn({
              x: Math.cos(a) * r,
              y: R(0.02, 0.3),
              z: Math.sin(a) * r,
              vy: R(0.5, 0.9),
              life: R(2.4, 3.4),
              s0: big ? 0.25 : 0.05,
              s1: big ? 0.5 : 0.1,
              br: big ? 0.3 : 1,
              ramp: RAMP.heal,
              shape: big ? 0 : Math.random() < 0.2 ? 4 : 2,
              curl: c ? amt : 0,
              tag: c ? 0 : 1,
            });
          }
          ringM.rotation.z = t * 0.4;
          pl.intensity = 10 + Math.sin(t * 3) * 2;
          P.step(dt);
          P.upload();
          S.tick(dt);
        },
        resize: (w, h) => S.resize(w, h),
        dispose: () => S.dispose(),
      };
    },
  },

  /* i175 부드러운 입자 */
  i175: {
    kind: '3d',
    caption: '안개 입자가 바닥 · 기둥과 만나는 곳: 왼쪽은 딱 잘린 선, 오른쪽은 깊이로 부드럽게',
    make(): Scene3D {
      const S = makeStage({ cam: [0, 4.2, 7.6], look: [0, 0.6, 0] });
      const P = new Pool(220, S.puff, true);
      P.mesh.renderOrder = 3;
      S.scene.add(P.mesh);
      const p1 = pillar(3);
      p1.position.set(-0.9, 0, -0.4);
      const p2 = pillar(2.4);
      p2.position.set(1.6, 0, -1.2);
      const r1 = rock(0.7, 3);
      r1.position.set(0.7, 0.2, 0.9);
      S.scene.add(p1, p2, r1);
      const pl = new THREE.PointLight(0x9a80ff, 10, 9, 1.4);
      pl.position.set(0.2, 1.2, 0.6);
      S.scene.add(pl);
      const labL = S.hud.label('bl');
      const labR = S.hud.label('br');
      labL.set('딱딱한 입자 (잘린 선)', '#888');
      labR.set('부드러운 입자', '#b8a0ff');
      const lab = S.hud.label('tl');
      const divC = document.createElement('canvas');
      divC.width = 4;
      divC.height = 64;
      const dg = divC.getContext('2d')!;
      dg.fillStyle = 'rgba(255,255,255,0.75)';
      dg.fillRect(1, 0, 2, 64);
      const divider = S.hud.picture(texFrom(divC), 0.004, 'mid', 1);
      const MIST = ramp([[0, 0x9a7cff, 1.0, 0, 0.4], [0.2, 0x8f8cff, 1.0, 0.6, 0.4], [0.8, 0x6fb0ff, 0.9, 0.55, 0.4], [1, 0x6fb0ff, 0.9, 0, 0.4]]);
      const spawnMist = (age0: number): void => {
        const i = P.spawn({ x: R(-3, 3), y: R(0.1, 0.9), z: R(-2.2, 1.6), vx: R(-0.15, 0.15), vy: R(-0.02, 0.05), vz: R(-0.1, 0.1), life: R(6, 9), s0: R(1.6, 2.4), s1: R(2.4, 3.2), ramp: MIST, shape: 1, rot: R(0, TAU), rv: R(-0.15, 0.15) });
        if (i >= 0) P.age[i] = age0 * P.life[i]!;
      };
      for (let i = 0; i < 34; i++) spawnMist(Math.random());
      const motes = (): void => {
        P.spawn({ x: R(-2.5, 2.5), y: R(0.1, 1.6), z: R(-2, 1.5), vy: R(0.05, 0.2), life: R(2, 4), s0: 0.06, s1: 0.1, ramp: RAMP.magic, shape: 4, curl: 0.3 });
      };
      const rt = new THREE.WebGLRenderTarget(1, 1);
      rt.depthTexture = new THREE.DepthTexture(1, 1);
      const U = P.mat.uniforms;
      U.uDepth!.value = rt.depthTexture;
      let split = true;
      const controls: Control[] = [
        ctrlTog('나눠 비교 (끄면 전부 부드럽게)', true, (v) => (split = v)),
        ctrlRange('부드러운 거리', 0.1, 2.5, 0.05, 0.7, (v) => (U.uSoft!.value = v)),
      ];
      U.uSoft!.value = 0.7;
      let acc = 0;
      return {
        scene: S.scene,
        camera: S.cam,
        controls,
        update(t, dt0) {
          const dt = Math.min(dt0, 0.05);
          let mist = 0;
          for (let i = 0; i < P.n; i++) if (P.sh[i] === 1) mist++;
          while (mist++ < 34) spawnMist(0);
          acc += dt * 12;
          while (acc >= 1) {
            acc--;
            motes();
          }
          labL.spr.visible = labR.spr.visible = divider.visible = split;
          lab.spr.visible = !split;
          lab.set('부드러운 입자 (깊이 비교)', '#b8a0ff');
          pl.intensity = 10 + Math.sin(t * 2) * 1.5;
          P.step(dt);
          P.upload();
          S.tick(dt);
        },
        render(r, w, h) {
          if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
          U.uRes!.value.set(w, h);
          U.uNear!.value = S.cam.near;
          U.uFar!.value = S.cam.far;
          P.mesh.visible = false;
          r.setRenderTarget(rt);
          r.render(S.scene, S.cam);
          r.setRenderTarget(null);
          P.mesh.visible = true;
          if (!split) {
            U.uSoftOn!.value = 1;
            r.render(S.scene, S.cam);
            return;
          }
          r.setScissorTest(true);
          const half = Math.floor(w / 2);
          U.uSoftOn!.value = 0;
          r.setScissor(0, 0, half, h);
          r.render(S.scene, S.cam);
          U.uSoftOn!.value = 1;
          r.setScissor(half, 0, w - half, h);
          r.render(S.scene, S.cam);
          r.setScissorTest(false);
        },
        resize: (w, h) => S.resize(w, h),
        dispose: () => {
          rt.dispose();
          S.dispose();
        },
      };
    },
  },

  /* i176 하위 방출 */
  i176: {
    kind: '3d',
    caption: '보라 미사일이 닿으면 파편이 새로 방출되고, 그 파편이 또 터진다 (하위 방출 두 단계)',
    make(): Scene3D {
      const S = makeStage();
      const fx = new Fx(S, 2400);
      const lab = S.hud.label('tl');
      let sub = true;
      let count = 3;
      let timer = 0.2;
      let since = 99;
      const MCORE = flat(0xfff0ff, 8, 1);
      const MHALO = flat(0xa050ff, 1.4, 0.6);
      interface Missile {
        a: THREE.Vector3;
        c: THREE.Vector3;
        b: THREE.Vector3;
        k: number;
        dur: number;
        delay: number;
        live: boolean;
      }
      const ms: Missile[] = [];
      const p = new THREE.Vector3();
      const q = new THREE.Vector3();
      const caster = new THREE.Vector3(-3.4, 1.2, -1.4);
      const launch = (): void => {
        ms.length = 0;
        for (let i = 0; i < count; i++) {
          const b = new THREE.Vector3(1.6 + R(-0.9, 0.9), 0.05, 0.8 + R(-0.9, 0.9));
          const c = new THREE.Vector3(R(-1.5, 0.5), R(2.5, 3.8), R(-2.5, 1.5));
          ms.push({ a: caster.clone(), c, b, k: 0, dur: R(0.75, 0.95), delay: i * 0.16, live: true });
        }
        since = 0;
        timer = 2.6;
      };
      // 2차: 파편(tag 1)이 날며 꼬리, 죽을 때 또 터짐(3차)
      fx.extraStep = (pl, i, dt) => {
        if (pl.tag[i] === 1 && Math.random() < dt * 60) {
          fx.fire.spawn({ x: pl.x[i]!, y: pl.y[i]!, z: pl.z[i]!, life: R(0.25, 0.4), s0: 0.1, s1: 0.02, ramp: RAMP.gold, shape: 0 });
        }
      };
      fx.fire.onDie = (tag, x, y, z) => {
        if (tag !== 1) return;
        fx.fire.spawn({ x, y, z, life: 0.2, s0: 0.5, s1: 1.1, ramp: RAMP.flash, br: 0.6, shape: 0 });
        for (let i = 0; i < 16; i++) {
          const d = sphereDir();
          const sp = R(1.5, 3.5);
          fx.fire.spawn({ x, y, z, vx: d.x * sp, vy: d.y * sp, vz: d.z * sp, life: R(0.35, 0.7), s0: 0.06, s1: 0.02, ramp: RAMP.gold, st: 0.06, shape: 2, drag: 1.5, grav: 4 });
        }
        fx.smoke.spawn({ x, y, z, vy: 0.3, life: 1.2, s0: 0.2, s1: 0.7, ramp: RAMP.magicSmoke, shape: 1, rot: R(0, TAU) });
      };
      const hit = (x: number, z: number): void => {
        if (!sub) {
          fx.fire.spawn({ x, y: 0.2, z, life: 0.15, s0: 0.5, s1: 0.2, ramp: RAMP.magic, shape: 0 });
          return;
        }
        fx.fire.spawn({ x, y: 0.3, z, life: 0.25, s0: 1.4, s1: 2.6, ramp: flat(0xe0b0ff, 6, 1), shape: 0 });
        for (let i = 0; i < 40; i++) {
          const d = sphereDir();
          const sp = R(2, 6);
          fx.fire.spawn({ x, y: 0.2, z, vx: d.x * sp, vy: Math.abs(d.y) * sp, vz: d.z * sp, life: R(0.3, 0.6), s0: 0.08, s1: 0.02, ramp: RAMP.magicSpark, st: 0.05, shape: 2, drag: 2, grav: 4 });
        }
        for (let i = 0; i < 9; i++) {
          const d = coneDir(0.75);
          const sp = R(3.5, 5.5);
          fx.fire.spawn({ x, y: 0.2, z, vx: d.x * sp, vy: d.y * sp, vz: d.z * sp, life: R(0.5, 0.75), s0: 0.16, s1: 0.12, ramp: RAMP.gold, shape: 0, grav: 6, tag: 1 });
        }
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * TAU;
          fx.smoke.spawn({ x, y: 0.15, z, vx: Math.cos(a) * 3, vy: 0.2, vz: Math.sin(a) * 3, life: R(0.8, 1.2), s0: 0.25, s1: 0.9, ramp: RAMP.magicSmoke, shape: 1, rot: R(0, TAU), drag: 3 });
        }
        fx.ring(x, z, 1.6, 0.4, 0xc080ff, 3);
        fx.flash(x, 0.6, z, 60, 0xb070ff);
        fx.shake(0.04);
      };
      const controls: Control[] = [
        ctrlTog('하위 방출', true, (v) => (sub = v)),
        ctrlRange('미사일 수', 1, 6, 1, 3, (v) => (count = v)),
        ctrlBtn('다시 쏘기', launch),
      ];
      return {
        scene: S.scene,
        camera: S.cam,
        controls,
        update(t, dt0) {
          const dt = Math.min(dt0, 0.05);
          timer -= dt;
          since += dt;
          if (timer <= 0) launch();
          fx.orb.clear();
          // 시전자 표시
          fx.orb.spawn({ x: caster.x, y: caster.y, z: caster.z, life: 1, s0: 0.5 + Math.sin(t * 8) * 0.05, ramp: MHALO, shape: 0 });
          for (const m of ms) {
            if (!m.live) continue;
            if (m.delay > 0) {
              m.delay -= dt;
              continue;
            }
            q.copy(bez(m.a, m.c, m.b, m.k, p));
            m.k += dt / m.dur;
            if (m.k >= 1) {
              m.live = false;
              hit(m.b.x, m.b.z);
              continue;
            }
            bez(m.a, m.c, m.b, m.k, p);
            const vx = (p.x - q.x) / dt;
            const vy = (p.y - q.y) / dt;
            const vz = (p.z - q.z) / dt;
            fx.orb.spawn({ x: p.x, y: p.y, z: p.z, life: 1, s0: 0.28, ramp: MCORE, shape: 0 });
            fx.orb.spawn({ x: p.x, y: p.y, z: p.z, life: 1, s0: 0.9, ramp: MHALO, shape: 0 });
            fx.orb.spawn({ x: p.x, y: p.y, z: p.z, vx, vy, vz, life: 1, s0: 0.22, ramp: flat(0xd090ff, 3, 0.8), st: 0.06, shape: 2 });
            for (let j = 0; j < 3; j++) fx.fire.spawn({ x: p.x + R(-0.05, 0.05), y: p.y + R(-0.05, 0.05), z: p.z + R(-0.05, 0.05), vx: R(-0.4, 0.4), vy: R(-0.4, 0.4), vz: R(-0.4, 0.4), life: R(0.25, 0.45), s0: 0.22, s1: 0.04, ramp: RAMP.magic, shape: 0 });
          }
          const live = ms.some((m) => m.live);
          lab.set(!sub ? '하위 방출 끔 — 닿으면 그냥 사라짐' : live ? '① 미사일 날아감' : since < 1.6 ? '② 명중 → 파편 방출 → ③ 파편이 또 터짐' : '하위 방출 켬', sub ? '#c08cff' : '#888');
          fx.update(dt, t);
          S.tick(dt);
        },
        resize: (w, h) => S.resize(w, h),
        dispose: () => S.dispose(),
      };
    },
  },

  /* i177 색 사다리 */
  i177: {
    kind: '3d',
    caption: '불꽃 입자가 수명 따라 흰 → 노랑 → 주황 → 빨강 → 연기로 식는다 (아래 막대 = 사다리)',
    make(): Scene3D {
      const S = makeStage({ cam: [0, 4.4, 7.2], look: [0, 1.5, 0] });
      const P = new Pool(1800, S.puff);
      P.mesh.renderOrder = 3;
      P.curlScale = 1.1;
      S.scene.add(P.mesh);
      // 화로
      const bowl = new THREE.Mesh(
        new THREE.LatheGeometry([new THREE.Vector2(0.0, 0.0), new THREE.Vector2(0.45, 0.0), new THREE.Vector2(0.5, 0.35), new THREE.Vector2(0.75, 0.55), new THREE.Vector2(0.9, 0.85), new THREE.Vector2(0.82, 0.88), new THREE.Vector2(0.0, 0.7)], 20),
        stoneMat(0x4a4e58),
      );
      S.scene.add(bowl);
      const coal = glowDisc(0xff7020, 3, 1.6);
      coal.mesh.position.y = 0.72;
      S.scene.add(coal.mesh);
      const gd = glowDisc(0xff8030, 1.4, 6);
      S.scene.add(gd.mesh);
      const pl = new THREE.PointLight(0xff8030, 16, 9, 1.4);
      pl.position.set(0, 1.4, 0);
      S.scene.add(pl);
      const LADDERS = [
        { name: '불: 흰 → 노랑 → 주황 → 빨강 → 연기', r: RAMP.fire, light: 0xff8030 },
        { name: '마법: 흰 → 연보라 → 보라 → 짙은 연기', r: RAMP.arcane, light: 0xa060ff },
        { name: '독: 흰 → 연두 → 초록 → 보랏빛 연기', r: RAMP.poison, light: 0x70ff40 },
        { name: '얼음: 흰 → 하늘 → 파랑 → 서리 김', r: RAMP.frostLadder, light: 0x60c0ff },
      ];
      const LDR = LADDERS.map((l) => ldr(l.r));
      const lab = S.hud.label('tl');
      const barC = document.createElement('canvas');
      barC.width = 512;
      barC.height = 72;
      const barTex = texFrom(barC, true);
      S.hud.picture(barTex, 512 / 72, 'bc', 0.13);
      const drawBar = (r: Float32Array): void => {
        const g = barC.getContext('2d')!;
        g.clearRect(0, 0, 512, 72);
        g.fillStyle = 'rgba(8,10,18,0.7)';
        g.beginPath();
        g.roundRect(0, 0, 512, 72, 14);
        g.fill();
        const x0 = 20;
        const w = 472;
        // 체크 무늬 (투명도가 보이게)
        for (let i = 0; i < 59; i++) {
          g.fillStyle = i % 2 ? '#2a2c34' : '#1a1c22';
          g.fillRect(x0 + i * 8, 10, 8, 14);
          g.fillStyle = i % 2 ? '#1a1c22' : '#2a2c34';
          g.fillRect(x0 + i * 8, 24, 8, 14);
        }
        for (let i = 0; i < w; i++) {
          const k = i / (w - 1);
          const f = k * (RN - 1);
          const j = Math.min(RN - 2, f | 0);
          const u = f - j;
          const o = j * 5;
          const c = [0, 1, 2].map((q) => lerp(r[o + q]!, r[o + 5 + q]!, u));
          const a = lerp(r[o + 3]!, r[o + 8]!, u);
          // HDR → 밝은 값은 하얗게 (네이티브 톤 매핑 흉내)
          const mx = Math.max(c[0]!, c[1]!, c[2]!);
          const wht = clamp((mx - 1) / 5, 0, 1);
          const col = c.map((v) => Math.pow(clamp(lerp(v / Math.max(mx, 1), 1, wht), 0, 1), 1 / 2.2) * 255);
          g.fillStyle = `rgba(${col[0]!|0},${col[1]!|0},${col[2]!|0},${clamp(a * 1.2, 0.08, 1)})`;
          g.fillRect(x0 + i, 10, 1.2, 28);
        }
        g.fillStyle = '#d8d4cc';
        g.font = `700 22px ${FONT}`;
        g.textBaseline = 'middle';
        g.textAlign = 'left';
        g.fillText('태어남', x0, 56);
        g.textAlign = 'right';
        g.fillText('사라짐', x0 + w, 56);
        g.textAlign = 'center';
        g.fillText('수명 →', x0 + w / 2, 56);
        barTex.needsUpdate = true;
      };
      let sel = -1;
      let hdr = true;
      let rate = 1;
      let shown = -2;
      let acc = 0;
      let accS = 0;
      const controls: Control[] = [
        ctrlRange('사다리 (-1 자동 · 0 불 · 1 마법 · 2 독 · 3 얼음)', -1, 3, 1, -1, (v) => (sel = v)),
        ctrlTog('HDR 핵 (하얗게 빛남)', true, (v) => {
          hdr = v;
          shown = -2;
        }),
        ctrlRange('입자 수 (배)', 0.3, 2, 0.1, 1, (v) => (rate = v)),
      ];
      return {
        scene: S.scene,
        camera: S.cam,
        controls,
        update(t, dt0) {
          const dt = Math.min(dt0, 0.05);
          const li = sel < 0 ? Math.floor(t / 4) % 4 : sel;
          const L = LADDERS[li]!;
          const rp = hdr ? L.r : LDR[li]!;
          if (shown !== li) {
            shown = li;
            drawBar(rp);
            pl.color.setHex(L.light);
            coal.set(3, L.light);
            gd.set(1.4, L.light);
          }
          lab.set(L.name + (hdr ? '' : ' (HDR 끔)'), '#' + L.light.toString(16).padStart(6, '0'));
          acc += dt * 90 * rate;
          while (acc >= 1) {
            acc--;
            const a = Math.random() * TAU;
            const r = Math.sqrt(Math.random()) * 0.55;
            P.spawn({ x: Math.cos(a) * r, y: 0.8, z: Math.sin(a) * r, vx: -Math.cos(a) * r * 0.6, vy: R(1.8, 2.8), vz: -Math.sin(a) * r * 0.6, life: R(1.1, 1.8), s0: R(0.22, 0.32), s1: R(0.55, 0.85), ramp: rp, br: 0.3, shape: 1, rot: R(0, TAU), rv: R(-1.5, 1.5), drag: 0.6, curl: 0.45 });
          }
          accS += dt * 22 * rate;
          while (accS >= 1) {
            accS--;
            const d = coneDir(0.5);
            const sp = R(2, 4);
            P.spawn({ x: R(-0.3, 0.3), y: 0.85, z: R(-0.3, 0.3), vx: d.x * sp, vy: d.y * sp, vz: d.z * sp, life: R(0.8, 1.4), s0: 0.06, s1: 0.02, ramp: rp, st: 0.04, shape: 2, drag: 0.6, curl: 0.8 });
          }
          pl.intensity = (hdr ? 16 : 9) * (0.85 + 0.15 * Math.sin(t * 19) * Math.sin(t * 7));
          P.step(dt);
          P.upload();
          S.tick(dt);
        },
        resize: (w, h) => S.resize(w, h),
        dispose: () => S.dispose(),
      };
    },
  },

  /* i178 충격 고리 · 땅 파동 */
  i178: {
    kind: '3d',
    caption: '떨어진 자리에서 빛 고리가 퍼지고 먼지가 바닥을 쓸며, 그을음 자국이 식어 간다',
    make(): Scene3D {
      const S = makeStage();
      const fx = new Fx(S, 1600);
      const lab = S.hud.label('tl');
      let ringOn = true;
      let scorchOn = true;
      let timer = 0.2;
      let shot = 0;
      let fall = -1;
      const from = new THREE.Vector3();
      const to = new THREE.Vector3();
      const p = new THREE.Vector3();
      const SPOTS: V3[] = [[-1.4, 0, 0.2], [1.3, 0, -0.6], [0.2, 0, 1.1]];
      const start = (): void => {
        const s = SPOTS[shot++ % SPOTS.length]!;
        to.set(s[0], 0.05, s[2]);
        from.set(s[0] + 2.2, 7.5, s[2] - 2.5);
        fall = 0;
        timer = 2.3;
      };
      const controls: Control[] = [ctrlTog('충격 고리', true, (v) => (ringOn = v)), ctrlTog('그을음 데칼', true, (v) => (scorchOn = v)), ctrlBtn('다시 떨어뜨리기', start)];
      return {
        scene: S.scene,
        camera: S.cam,
        controls,
        update(t, dt0) {
          const dt = Math.min(dt0, 0.05);
          timer -= dt;
          if (timer <= 0) start();
          fx.orb.clear();
          if (fall >= 0) {
            fall += dt / 0.38;
            if (fall >= 1) {
              fall = -1;
              fx.boom(to.x, 0.05, to.z, { k: 0.7, sc: 0.9, ring: ringOn, scorch: scorchOn, debris: true });
            } else {
              p.lerpVectors(from, to, fall * fall);
              const vx = (to.x - from.x) * 2 * fall / 0.38;
              const vy = (to.y - from.y) * 2 * fall / 0.38;
              const vz = (to.z - from.z) * 2 * fall / 0.38;
              fx.orb.spawn({ x: p.x, y: p.y, z: p.z, life: 1, s0: 0.35, ramp: flat(0xfff0d0, 8, 1), shape: 0 });
              fx.orb.spawn({ x: p.x, y: p.y, z: p.z, vx, vy, vz, life: 1, s0: 0.4, ramp: flat(0xff9030, 3, 0.8), st: 0.05, shape: 2 });
              const pk = Math.max(0, fall - dt / 0.38);
              for (let j = 0; j < 8; j++) {
                const f = lerp(pk, fall, j / 8);
                const f2 = f * f;
                fx.fire.spawn({ x: lerp(from.x, to.x, f2), y: lerp(from.y, to.y, f2), z: lerp(from.z, to.z, f2), vx: R(-0.3, 0.3), vy: R(0, 0.5), vz: R(-0.3, 0.3), life: R(0.25, 0.45), s0: 0.3, s1: 0.04, ramp: RAMP.fire, br: 0.6, shape: 1, rot: R(0, TAU) });
              }
            }
          }
          lab.set([ringOn ? '충격 고리' : '', scorchOn ? '그을음 데칼' : '', '먼지 고리'].filter(Boolean).join(' + '), '#ffb050');
          fx.update(dt, t);
          S.tick(dt);
        },
        resize: (w, h) => S.resize(w, h),
        dispose: () => S.dispose(),
      };
    },
  },

  /* i179 순간 빛 */
  i179: {
    kind: '3d',
    caption: '터지는 순간 점광이 0.2초 번쩍 — 기둥 · 바위 · 바닥이 함께 밝아진다 (켬/끔 번갈아)',
    make(): Scene3D {
      const S = makeStage({ light: 0.7 });
      const fx = new Fx(S, 1200);
      const lab = S.hud.label('tl');
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + 0.3;
        const p = pillar(2.2 + (i % 2) * 0.6);
        p.position.set(Math.cos(a) * 2.8, 0, Math.sin(a) * 2.1);
        S.scene.add(p);
      }
      for (let i = 0; i < 5; i++) {
        const r = rock(R(0.25, 0.5), 20 + i);
        const a = R(0, TAU);
        r.position.set(Math.cos(a) * R(1.2, 2.2), r.position.y, Math.sin(a) * R(1, 1.8));
        S.scene.add(r);
      }
      let auto = true;
      let lightOn = true;
      let peak = 1;
      let hue = 0;
      const HUES = [0xa8d8ff, 0xffa050, 0xc080ff];
      let timer = 0.3;
      let shot = 0;
      let cur = true;
      const fire = (force = false): void => {
        shot++;
        if (force && auto && shot % 2 === 0) shot++;
        cur = auto ? shot % 2 === 1 : lightOn;
        fx.lightOn = cur;
        const col = HUES[hue]!;
        const rp = hue === 0 ? RAMP.ice : hue === 1 ? RAMP.spark : RAMP.magicSpark;
        fx.fire.spawn({ x: 0, y: 0.8, z: 0, life: 0.22, s0: 2.2, s1: 3.6, ramp: hue === 0 ? flat(0xe0f0ff, 9, 1) : RAMP.flash, shape: 0 });
        for (let i = 0; i < 90; i++) {
          const d = sphereDir();
          const sp = R(3, 9);
          fx.fire.spawn({ x: 0, y: 0.8, z: 0, vx: d.x * sp, vy: d.y * sp, vz: d.z * sp, life: R(0.4, 1.0), s0: 0.08, s1: 0.02, ramp: rp, st: 0.05, shape: 2, drag: 1.2, grav: 5, bnc: 0.3 });
        }
        fx.ring(0, 0, 2.6, 0.45, col, 2.5);
        fx.flash(0, 1.0, 0, 160 * peak, col);
      };
      const controls: Control[] = [
        ctrlTog('순간 빛 (점광)', true, (v) => {
          auto = false;
          lightOn = v;
        }),
        ctrlRange('빛 세기', 0.2, 2.5, 0.1, 1, (v) => (peak = v)),
        ctrlRange('빛 색 (0 번개 · 1 불 · 2 마법)', 0, 2, 1, 0, (v) => (hue = v)),
        ctrlBtn('다시 터뜨리기', () => {
          timer = 2.4;
          fire(true);
        }),
      ];
      return {
        scene: S.scene,
        camera: S.cam,
        controls,
        update(t, dt0) {
          const dt = Math.min(dt0, 0.05);
          timer -= dt;
          if (timer <= 0) {
            timer = 2.2;
            fire();
          }
          lab.set(cur ? '점광 번쩍 켬 — 장면이 반응' : '점광 없음 — 입자만 빛남', cur ? '#a8d8ff' : '#888');
          fx.update(dt, t);
          S.tick(dt);
        },
        resize: (w, h) => S.resize(w, h),
        dispose: () => S.dispose(),
      };
    },
  },

  /* i180 마법진 */
  i180: {
    kind: '3d',
    caption: '바닥에 세 겹 룬 고리가 그려지며 반대로 돌고, 차오르면 빛기둥이 솟는다 (수학 기호 룬)',
    make(): Scene3D {
      const S = makeStage({ cam: [0, 6.0, 6.4], look: [0, 0.6, 0] });
      const P = new Pool(900, S.puff);
      P.mesh.renderOrder = 3;
      S.scene.add(P.mesh);
      const lab = S.hud.label('tl');
      const GOLD = 0xffc860;
      const layers = ([0, 1, 2] as const).map((l, i) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), runeMat(l, i === 1 ? 0xffa0ff : GOLD, i === 1 ? 2.2 : 2.6));
        m.rotation.x = -Math.PI / 2;
        m.position.y = 0.02 + i * 0.004;
        m.scale.setScalar([4.4, 3.0, 1.6][i]!);
        S.scene.add(m);
        return m;
      });
      const gd = glowDisc(GOLD, 1.2, 6);
      S.scene.add(gd.mesh);
      const pillarM = scrollMat(0xfff0c0, 0xffa020, { per: 6, sy: 2.5, twist: 1.2, bright: 1.3, speed: 1.6 });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 6, 48, 1, true), pillarM);
      beam.position.y = 3;
      const beamCore = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 6, 32, 1, true), scrollMat(0xffffff, 0xffd080, { per: 4, sy: 3, twist: 2, bright: 1.6, speed: 2.4 }));
      beamCore.position.y = 3;
      S.scene.add(beam, beamCore);
      const pl = new THREE.PointLight(GOLD, 0, 9, 1.4);
      pl.position.set(0, 0.8, 0);
      S.scene.add(pl);
      let spd = 1;
      let nLayers = 3;
      let pillarOn = true;
      let rot = 0;
      const controls: Control[] = [
        ctrlRange('회전 속도', 0, 3, 0.1, 1, (v) => (spd = v)),
        ctrlRange('겹 수', 1, 3, 1, 3, (v) => (nLayers = v)),
        ctrlTog('빛기둥', true, (v) => (pillarOn = v)),
      ];
      let acc = 0;
      return {
        scene: S.scene,
        camera: S.cam,
        controls,
        update(t, dt0) {
          const dt = Math.min(dt0, 0.05);
          rot += dt * spd;
          const C = 5;
          const k = t % C;
          const reveal = clamp(k / 1.3, 0, 1);
          const fade = 1 - clamp((k - 4.1) / 0.8, 0, 1);
          const charge = clamp((k - 1.3) / 1.2, 0, 1);
          const burst = k > 2.5 && k < 4.3 ? Math.sin(clamp((k - 2.5) / 1.8, 0, 1) * Math.PI) : 0;
          layers.forEach((m, i) => {
            const u = (m.material as THREE.ShaderMaterial).uniforms;
            u.uRev!.value = clamp(reveal * 1.15 - i * 0.08, 0, 1);
            u.uA!.value = fade * (0.75 + 0.5 * charge + 0.6 * burst);
            u.uTime!.value = t;
            m.visible = i < nLayers;
            m.rotation.z = [0.25, -0.45, 0.8][i]! * rot;
          });
          gd.set(0.4 + charge * 1.2 + burst * 1.5);
          gd.mesh.visible = fade > 0.01;
          pillarM.uniforms.uTime!.value = t;
          (beamCore.material as THREE.ShaderMaterial).uniforms.uTime!.value = t;
          const bA = pillarOn ? burst : 0;
          pillarM.uniforms.uA!.value = bA;
          (beamCore.material as THREE.ShaderMaterial).uniforms.uA!.value = bA;
          beam.visible = beamCore.visible = bA > 0.01;
          beam.scale.set(0.6 + bA * 0.4, 1, 0.6 + bA * 0.4);
          pl.intensity = fade * (3 + charge * 10 + burst * 26);
          // 그려지는 끝의 불꽃 + 차오를 때 떠오르는 빛 알갱이
          if (reveal < 1) {
            const a = reveal * TAU;
            for (let j = 0; j < 3; j++) {
              const rr = [2.1, 1.4, 0.75][j]!;
              P.spawn({ x: Math.sin(a + rot * 0.25) * rr, y: 0.05, z: -Math.cos(a + rot * 0.25) * rr * -1, vy: R(0.3, 0.9), life: R(0.4, 0.7), s0: 0.12, s1: 0.03, ramp: RAMP.gold, shape: 2 });
            }
          }
          acc += dt * (charge * 60 + burst * 100) * fade;
          while (acc >= 1) {
            acc--;
            const a = Math.random() * TAU;
            const r = Math.sqrt(Math.random()) * 2.1;
            P.spawn({ x: Math.cos(a) * r, y: 0.05, z: Math.sin(a) * r, vy: R(0.8, 2.6) * (1 + burst), life: R(0.9, 1.6), s0: 0.06, s1: 0.03, ramp: RAMP.gold, st: burst > 0.2 ? 0.05 : 0, shape: Math.random() < 0.25 ? 4 : 2, curl: 0.3 });
          }
          lab.set(k < 1.3 ? '마법진 그리기' : k < 2.5 ? '룬 고리가 반대로 돌며 차오름' : k < 4.2 ? (pillarOn ? '빛기둥!' : '발동') : '사라짐', '#ffc860');
          P.step(dt);
          P.upload();
          S.tick(dt);
        },
        resize: (w, h) => S.resize(w, h),
        dispose: () => S.dispose(),
      };
    },
  },

  /* i181 광역 표시 */
  i181: {
    kind: '3d',
    caption: '떨어질 곳을 바닥 원 · 부채꼴이 차오르며 미리 알려 주고, 다 차면 그 범위에 터진다',
    make(): Scene3D {
      const S = makeStage();
      const fx = new Fx(S, 2000);
      const lab = S.hud.label('tl');
      const teleMat = (sector: boolean): THREE.ShaderMaterial =>
        new THREE.ShaderMaterial({
          uniforms: { uFill: { value: 0 }, uHalf: { value: 0.6 }, uA: { value: 0 }, uTime: { value: 0 }, uCol: { value: new THREE.Color(0xff4020).multiplyScalar(2.6) } },
          defines: sector ? { SECTOR: '' } : {},
          vertexShader: FLAT_VS,
          fragmentShader: /* glsl */ `uniform float uFill, uHalf, uA, uTime; uniform vec3 uCol; varying vec2 vUv;
            void main(){ vec2 p = vUv*2.0-1.0; float r = length(p);
              float inside = step(r, 1.0);
              float edge = exp(-pow((r - 0.975)/0.022, 2.0));
            #ifdef SECTOR
              float ang = abs(atan(p.x, p.y));
              inside *= step(ang, uHalf);
              float side = exp(-pow(r * sin(uHalf - ang) / 0.022, 2.0)) * step(ang, uHalf + 0.05);
              edge = max(edge * step(ang, uHalf), side * step(r, 1.0));
              float fr = r;
            #else
              float fr = r;
            #endif
              float filled = step(fr, uFill) * inside;
              float front = exp(-pow((fr - uFill)/0.035, 2.0)) * inside;
              float stripes = 0.5 + 0.5 * sin((p.x + p.y) * 26.0 - uTime * 5.0);
              float a = inside * (0.09 + 0.06 * stripes) + filled * 0.32 + front * 1.1 + edge;
              gl_FragColor = vec4(uCol * (1.0 + front * 1.5 + edge), 1.0); ${TONE}
              gl_FragColor.a = clamp(a * uA, 0.0, 1.0); }`,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
      const circ = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), teleMat(false));
      circ.rotation.x = -Math.PI / 2;
      circ.position.set(-1.5, 0.025, 0.1);
      circ.scale.setScalar(1.5);
      const secM = teleMat(true);
      secM.uniforms.uHalf!.value = 0.55;
      const sec = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), secM);
      sec.rotation.x = -Math.PI / 2;
      sec.position.set(1.4, 0.026, 1.9);
      sec.scale.setScalar(2.9);
      S.scene.add(circ, sec);
      let mode = 2;
      let fillT = 1.6;
      let k = 0;
      let state = 0; // 0 채우기 1 터짐 대기
      let wait = 0;
      let meteor = -1;
      const pA = new THREE.Vector3();
      const meteorFrom = new THREE.Vector3();
      const controls: Control[] = [
        ctrlRange('모양 (0 원 · 1 부채꼴 · 2 둘 다)', 0, 2, 1, 2, (v) => (mode = v)),
        ctrlRange('차오르는 시간 (초)', 0.6, 3, 0.1, 1.6, (v) => (fillT = v)),
        ctrlBtn('처음부터', () => {
          k = 0;
          state = 0;
        }),
      ];
      const breath = (): void => {
        const ox = sec.position.x;
        const oz = sec.position.z;
        for (let i = 0; i < 70; i++) {
          const a = R(-0.5, 0.5);
          const sp = R(4, 7.5);
          // 부채꼴은 -z 쪽(화면 안쪽)을 본다
          fx.fire.spawn({ x: ox, y: 0.35, z: oz, vx: Math.sin(a) * sp, vy: R(0.2, 0.9), vz: -Math.cos(a) * sp, life: R(0.45, 0.6), s0: 0.3, s1: 1.1, ramp: RAMP.fire, shape: 1, rot: R(0, TAU), rv: R(-2, 2), drag: 1.2, delay: R(0, 0.25) });
        }
        for (let i = 0; i < 50; i++) {
          const a = R(-0.5, 0.5);
          const sp = R(5, 9);
          fx.fire.spawn({ x: ox, y: 0.3, z: oz, vx: Math.sin(a) * sp, vy: R(0.5, 2), vz: -Math.cos(a) * sp, life: R(0.4, 0.8), s0: 0.07, s1: 0.02, ramp: RAMP.spark, st: 0.05, shape: 2, drag: 0.8, grav: 5, delay: R(0, 0.25) });
        }
        fx.flash(ox, 0.8, oz - 1.2, 70, 0xff8030);
        fx.shake(0.05);
      };
      return {
        scene: S.scene,
        camera: S.cam,
        controls,
        update(t, dt0) {
          const dt = Math.min(dt0, 0.05);
          circ.visible = mode !== 1;
          sec.visible = mode !== 0;
          const cm = circ.material as THREE.ShaderMaterial;
          if (state === 0) {
            k += dt / fillT;
            if (k >= 1) {
              k = 1;
              state = 1;
              wait = 0;
              if (mode !== 1) {
                meteor = 0;
                meteorFrom.set(circ.position.x + 2, 7, circ.position.z - 2.5);
              }
              if (mode !== 0) breath();
            }
          } else {
            wait += dt;
            if (wait > 2.0) {
              state = 0;
              k = 0;
            }
          }
          const blink = state === 0 && k > 0.75 ? 0.75 + 0.25 * Math.sin(t * 40) : 1;
          const A = state === 0 ? clamp(k * 6, 0, 1) * blink : Math.max(0, 1 - wait * 4);
          for (const m of [cm, secM]) {
            m.uniforms.uFill!.value = easeOut(k) * 1.0;
            m.uniforms.uA!.value = A;
            m.uniforms.uTime!.value = t;
          }
          fx.orb.clear();
          if (meteor >= 0) {
            meteor += dt / 0.25;
            if (meteor >= 1) {
              meteor = -1;
              fx.boom(circ.position.x, 0.05, circ.position.z, { k: 0.8, sc: 0.95 });
            } else {
              pA.lerpVectors(meteorFrom, circ.position, meteor);
              fx.orb.spawn({ x: pA.x, y: pA.y, z: pA.z, life: 1, s0: 0.4, ramp: flat(0xfff0d0, 8, 1), shape: 0 });
              fx.orb.spawn({ x: pA.x, y: pA.y, z: pA.z, vx: -8, vy: -28, vz: 10, life: 1, s0: 0.45, ramp: flat(0xff9030, 3, 0.8), st: 0.04, shape: 2 });
            }
          }
          lab.set(state === 0 ? `범위 표시 차오르는 중 ${Math.round(k * 100)}%` : '쾅! 표시한 범위에', '#ff6040');
          fx.update(dt, t);
          S.tick(dt);
        },
        resize: (w, h) => S.resize(w, h),
        dispose: () => S.dispose(),
      };
    },
  },

  /* i182 불덩이 */
  i182: {
    kind: '3d',
    caption: '빛나는 핵 + 일렁이는 불꽃 껍질 + 연기 꼬리 + 불티 → 명중 폭발 · 파편 · 충격 고리 · 그을음 · 번쩍',
    make(): Scene3D {
      const S = makeStage();
      const fx = new Fx(S, 2600);
      const lab = S.hud.label('tl');
      // 과녁 돌기둥
      const totem = pillar(1.8);
      totem.position.set(3.1, 0, 0.2);
      S.scene.add(totem);
      const shellMat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uA: { value: 1 } },
        vertexShader: /* glsl */ `uniform float uTime; varying vec3 vN; varying vec3 vV; varying vec3 vP;
          float h3(vec3 p){ return sin(p.x*4.1 + uTime*7.0) * sin(p.y*3.7 - uTime*9.0) * sin(p.z*4.3 + uTime*6.0); }
          void main(){ vec3 p = position; float d = h3(p*3.0)*0.5 + h3(p*6.0 + 2.0)*0.3; p += normal * d * 0.13; vP = position;
            vec4 mv = modelViewMatrix * vec4(p, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv; }`,
        fragmentShader: /* glsl */ `uniform float uTime, uA; varying vec3 vN; varying vec3 vV; varying vec3 vP;
          void main(){ float f = abs(dot(vN, vV));
            float n = 0.5 + 0.5 * sin(vP.x*18.0 + uTime*20.0) * sin(vP.y*16.0 - uTime*25.0) * sin(vP.z*17.0 + uTime*15.0);
            vec3 hot = vec3(1.0, 0.95, 0.8) * 6.0; vec3 mid = vec3(1.0, 0.42, 0.06) * 3.0; vec3 edge = vec3(0.8, 0.1, 0.02) * 1.6;
            vec3 col = mix(edge, mid, smoothstep(0.1, 0.5, f)); col = mix(col, hot, smoothstep(0.6, 0.98, f));
            float a = (0.4 + 0.6 * n) * smoothstep(0.0, 0.4, f) * uA;
            gl_FragColor = vec4(col, 1.0); ${TONE}
            gl_FragColor.a = clamp(a, 0.0, 1.0); }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 4), shellMat);
      S.scene.add(shell);
      const carry = new THREE.PointLight(0xff8a30, 0, 7, 1.5);
      S.scene.add(carry);
      const castC = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), runeMat(2, 0xff9040, 2.4));
      castC.rotation.x = -Math.PI / 2;
      castC.scale.setScalar(1.6);
      S.scene.add(castC);
      const A = new THREE.Vector3(-3.6, 1.5, -1.5);
      castC.position.set(A.x, 0.02, A.z);
      const B = new THREE.Vector3(2.4, 0.15, 0.9);
      const C = new THREE.Vector3(-0.6, 2.6, -0.5);
      const p = new THREE.Vector3();
      const q = new THREE.Vector3();
      let k = -1;
      let wait = 0.4;
      let slow = false;
      let shakeOn = true;
      let mult = 1;
      let phase = '';
      const CORE = flat(0xfff6e0, 9, 1);
      const HALO = flat(0xff7a20, 1.6, 0.6);
      const HALO2 = flat(0xff4a10, 0.6, 0.4);
      const controls: Control[] = [
        ctrlBtn('다시 쏘기', () => {
          k = 0;
        }),
        ctrlTog('느리게 보기', false, (v) => (slow = v)),
        ctrlTog('화면 흔들림', true, (v) => (shakeOn = v)),
        ctrlRange('입자 양 (배)', 0.3, 2, 0.1, 1, (v) => (mult = v)),
      ];
      const FLY = 0.9;
      return {
        scene: S.scene,
        camera: S.cam,
        controls,
        update(t, dt0) {
          const dt = Math.min(dt0, 0.05) * (slow ? 0.3 : 1);
          fx.orb.clear();
          shellMat.uniforms.uTime!.value = t;
          const cu = (castC.material as THREE.ShaderMaterial).uniforms;
          cu.uTime!.value = t;
          castC.rotation.z += dt * 1.5;
          if (k < 0) {
            wait -= dt;
            if (wait <= 0) k = 0;
            shell.visible = false;
            carry.intensity = 0;
            cu.uA!.value = clamp(1 - wait, 0, 1) * 0.8;
            cu.uRev!.value = clamp(1 - wait / 0.6, 0, 1);
            if (wait < 0.6) phase = '시전';
          } else {
            q.copy(bez(A, C, B, k, p));
            k += dt / FLY;
            cu.uA!.value = Math.max(0, 1 - k * 2);
            if (k >= 1) {
              k = -1;
              wait = 2.0;
              shell.visible = false;
              carry.intensity = 0;
              fx.boom(B.x, B.y, B.z, { k: mult, sc: 1.05, shake: shakeOn ? 0.16 : 0 });
              phase = '명중 — 폭발 · 파편 · 충격 고리 · 그을음';
            } else {
              bez(A, C, B, k, p);
              const vx = (p.x - q.x) / dt;
              const vy = (p.y - q.y) / dt;
              const vz = (p.z - q.z) / dt;
              shell.visible = true;
              shell.position.copy(p);
              shell.rotation.set(t * 3, t * 4, 0);
              carry.position.copy(p);
              carry.intensity = 22 + Math.sin(t * 40) * 4;
              fx.orb.spawn({ x: p.x, y: p.y, z: p.z, life: 1, s0: 0.42, ramp: CORE, shape: 0 });
              fx.orb.spawn({ x: p.x, y: p.y, z: p.z, life: 1, s0: 1.5, ramp: HALO, shape: 0 });
              fx.orb.spawn({ x: p.x, y: p.y, z: p.z, life: 1, s0: 3.0, ramp: HALO2, shape: 0 });
              const n = Math.max(1, Math.round(4 * mult * (slow ? 0.5 : 1)));
              for (let j = 0; j < n; j++) {
                const o = R(0, 1);
                fx.fire.spawn({ x: p.x - vx * dt * o + R(-0.08, 0.08), y: p.y - vy * dt * o + R(-0.08, 0.08), z: p.z - vz * dt * o + R(-0.08, 0.08), vx: vx * 0.08 + R(-0.4, 0.4), vy: R(0, 0.8), vz: vz * 0.08 + R(-0.4, 0.4), life: R(0.35, 0.6), s0: R(0.4, 0.55), s1: 0.08, ramp: RAMP.fire, shape: 1, rot: R(0, TAU), rv: R(-3, 3), drag: 2 });
              }
              if (Math.random() < mult * 0.9) fx.smoke.spawn({ x: p.x, y: p.y, z: p.z, vy: 0.5, life: R(1.0, 1.6), s0: 0.25, s1: 1.0, ramp: RAMP.smoke, shape: 1, rot: R(0, TAU), rv: R(-1, 1), drag: 1, curl: 0.3, delay: 0.12 });
              const ns = Math.round(3 * mult);
              for (let j = 0; j < ns; j++) {
                const d = sphereDir();
                const sp = R(0.8, 2.5);
                fx.fire.spawn({ x: p.x, y: p.y, z: p.z, vx: d.x * sp - vx * 0.15, vy: d.y * sp + 0.5, vz: d.z * sp - vz * 0.15, life: R(0.4, 0.9), s0: 0.06, s1: 0.02, ramp: RAMP.spark, st: 0.06, shape: 2, drag: 1.2, grav: 4, bnc: 0.3 });
              }
              phase = '날아감 — 핵 · 불꽃 껍질 · 연기 꼬리 · 불티';
            }
          }
          lab.set(phase || '시전', '#ffa050');
          fx.update(dt, t);
          S.tick(dt);
        },
        resize: (w, h) => S.resize(w, h),
        dispose: () => S.dispose(),
      };
    },
  },

  /* i183 얼음 창 · 서리 폭발 */
  i183: {
    kind: '3d',
    caption: '푸른 결정 창이 서리 꼬리를 끌고 날아와 깨지며, 얼음 파편 · 솟는 가시 · 바닥 서리꽃',
    make(): Scene3D {
      const S = makeStage();
      const fx = new Fx(S, 2200);
      const lab = S.hud.label('tl');
      const iceMat = new THREE.MeshStandardMaterial({ color: 0xc8ecff, emissive: 0x2a86d8, emissiveIntensity: 0.7, roughness: 0.12, metalness: 0.05, flatShading: true, transparent: true, opacity: 0.92 });
      const rimMat = new THREE.ShaderMaterial({
        uniforms: { uA: { value: 1 } },
        vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: /* glsl */ `uniform float uA; varying vec3 vN; varying vec3 vV;
          void main(){ float f = 1.0 - abs(dot(vN, vV)); vec3 col = vec3(0.45, 0.85, 1.0) * 4.0;
            gl_FragColor = vec4(col, 1.0); ${TONE}
            gl_FragColor.a = clamp(pow(f, 2.0) * uA, 0.0, 1.0); }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const crystalGeo = new THREE.OctahedronGeometry(1, 0);
      const lance = new THREE.Group();
      const main = new THREE.Mesh(crystalGeo, iceMat);
      main.scale.set(0.16, 0.16, 0.95);
      const mainRim = new THREE.Mesh(crystalGeo, rimMat);
      mainRim.scale.set(0.2, 0.2, 1.05);
      lance.add(main, mainRim);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU;
        const s = new THREE.Mesh(crystalGeo, iceMat);
        s.scale.set(0.07, 0.07, 0.42);
        s.position.set(Math.cos(a) * 0.12, Math.sin(a) * 0.12, -0.45);
        s.rotation.set(Math.sin(a) * 0.35, -Math.cos(a) * 0.35, 0);
        lance.add(s);
      }
      S.scene.add(lance);
      const carry = new THREE.PointLight(0x70c8ff, 0, 7, 1.5);
      S.scene.add(carry);
      // 파편
      const MAXS = 70;
      const shards = new THREE.InstancedMesh(crystalGeo, iceMat, MAXS);
      shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      shards.count = 0;
      shards.frustumCulled = false;
      S.scene.add(shards);
      interface Shard {
        p: THREE.Vector3;
        v: THREE.Vector3;
        r: THREE.Euler;
        w: THREE.Vector3;
        s: number;
        age: number;
      }
      const SH: Shard[] = [];
      // 솟는 가시
      const spikeGeo = new THREE.ConeGeometry(0.16, 1, 5);
      spikeGeo.translate(0, 0.5, 0);
      const spikes: { m: THREE.Mesh; h: number; tilt: THREE.Euler }[] = [];
      for (let i = 0; i < 8; i++) {
        const m = new THREE.Mesh(spikeGeo, iceMat);
        m.visible = false;
        S.scene.add(m);
        spikes.push({ m, h: 1, tilt: new THREE.Euler() });
      }
      // 서리꽃 데칼
      const frostMat = new THREE.ShaderMaterial({
        uniforms: { uTex: { value: texFrom(frostCanvas()) }, uA: { value: 0 }, uGrow: { value: 0 }, uGlow: { value: 0 } },
        vertexShader: FLAT_VS,
        fragmentShader: /* glsl */ `uniform sampler2D uTex; uniform float uA, uGrow, uGlow; varying vec2 vUv;
          void main(){ vec4 t = texture2D(uTex, vUv); float r = length(vUv*2.0-1.0);
            float g = 1.0 - smoothstep(uGrow - 0.08, uGrow, r);
            float fr = t.r * g * uA; float gl = t.g * g * uA;
            vec3 col = vec3(0.85, 0.95, 1.0) * fr * 1.1 + vec3(0.3, 0.75, 1.0) * gl * (0.8 + uGlow * 4.0);
            float lead = exp(-pow((r - uGrow) / 0.04, 2.0)) * t.r * uA * 3.0;
            col += vec3(0.6, 0.9, 1.0) * lead;
            gl_FragColor = vec4(col, 1.0); ${TONE}
            gl_FragColor.a = clamp(fr * 0.75, 0.0, 0.9); }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const frost = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), frostMat);
      frost.rotation.x = -Math.PI / 2;
      frost.position.y = 0.013;
      frost.visible = false;
      S.scene.add(frost);
      const A = new THREE.Vector3(-3.8, 1.6, -1.5);
      const B = new THREE.Vector3(2.2, 0.1, 1.0);
      const p = new THREE.Vector3();
      const prev = new THREE.Vector3();
      const dir = new THREE.Vector3();
      const m4 = new THREE.Matrix4();
      const qq = new THREE.Quaternion();
      const sc = new THREE.Vector3();
      let k = -1;
      let wait = 0.3;
      let since = 99;
      let nShards = 40;
      let frostOn = true;
      let slow = false;
      const FLY = 0.62;
      const shatter = (): void => {
        since = 0;
        SH.length = 0;
        for (let i = 0; i < nShards; i++) {
          const d = coneDir(1.2);
          const sp = R(2.5, 6.5);
          SH.push({ p: new THREE.Vector3(B.x, 0.25, B.z), v: new THREE.Vector3(d.x * sp - 1.2, d.y * sp, d.z * sp - 0.6), r: new THREE.Euler(R(0, TAU), R(0, TAU), 0), w: new THREE.Vector3(R(-12, 12), R(-12, 12), R(-12, 12)), s: R(0.05, 0.13), age: 0 });
        }
        fx.fire.spawn({ x: B.x, y: 0.4, z: B.z, life: 0.25, s0: 2.2, s1: 3.6, ramp: flat(0xe8f8ff, 9, 1), shape: 0 });
        for (let i = 0; i < 80; i++) {
          const d = sphereDir();
          const sp = R(2, 7);
          fx.fire.spawn({ x: B.x, y: 0.3, z: B.z, vx: d.x * sp, vy: Math.abs(d.y) * sp, vz: d.z * sp, life: R(0.5, 1.1), s0: 0.09, s1: 0.03, ramp: RAMP.ice, st: 0.04, shape: Math.random() < 0.4 ? 4 : 3, drag: 1.4, grav: 3, rot: R(0, TAU) });
        }
        for (let i = 0; i < 26; i++) {
          const a = (i / 26) * TAU;
          const sp = R(2.5, 4);
          fx.smoke.spawn({ x: B.x, y: 0.2, z: B.z, vx: Math.cos(a) * sp, vy: R(0.1, 0.5), vz: Math.sin(a) * sp, life: R(1.2, 1.9), s0: 0.4, s1: 1.5, ramp: RAMP.frostMist, shape: 1, rot: R(0, TAU), rv: R(-0.8, 0.8), drag: 2.4 });
        }
        fx.ring(B.x, B.z, 2.8, 0.5, 0x8ad8ff, 3);
        fx.ring(B.x, B.z, 1.8, 0.35, 0xffffff, 2);
        fx.flash(B.x, 0.9, B.z, 120, 0x80c8ff);
        fx.shake(0.1);
        spikes.forEach((s, i) => {
          const a = (i / spikes.length) * TAU + R(-0.2, 0.2);
          const r = R(0.35, 0.95);
          s.m.position.set(B.x + Math.cos(a) * r, 0, B.z + Math.sin(a) * r);
          s.tilt.set(Math.sin(a) * R(0.3, 0.6), 0, -Math.cos(a) * R(0.3, 0.6));
          s.m.rotation.set(Math.sin(a) * 0.5, R(0, TAU), -Math.cos(a) * 0.5);
          s.m.rotation.x = Math.sin(a) * 0.45;
          s.m.rotation.z = -Math.cos(a) * 0.45;
          s.h = R(0.5, 1.1);
          s.m.visible = true;
        });
        if (frostOn) {
          frost.position.x = B.x;
          frost.position.z = B.z;
          frost.scale.setScalar(4.2);
          frost.rotation.z = R(0, TAU);
          frost.visible = true;
        }
      };
      const controls: Control[] = [
        ctrlBtn('다시 쏘기', () => {
          k = 0;
        }),
        ctrlRange('얼음 파편 수', 10, 70, 5, 40, (v) => (nShards = v)),
        ctrlTog('바닥 서리꽃', true, (v) => (frostOn = v)),
        ctrlTog('느리게 보기', false, (v) => (slow = v)),
      ];
      return {
        scene: S.scene,
        camera: S.cam,
        controls,
        update(t, dt0) {
          const dt = Math.min(dt0, 0.05) * (slow ? 0.3 : 1);
          since += dt;
          fx.orb.clear();
          if (k < 0) {
            wait -= dt;
            lance.visible = false;
            carry.intensity = 0;
            if (wait <= 0) {
              k = 0;
              prev.copy(A);
            }
          } else {
            k += dt / FLY;
            if (k >= 1) {
              k = -1;
              wait = 2.2;
              lance.visible = false;
              shatter();
            } else {
              prev.copy(p);
              p.lerpVectors(A, B, k);
              p.y += Math.sin(k * Math.PI) * 0.5;
              if (k * FLY < dt * 1.5) prev.copy(A);
              dir.subVectors(p, prev);
              lance.visible = true;
              lance.position.copy(p);
              if (dir.lengthSq() > 1e-8) lance.lookAt(p.x + dir.x, p.y + dir.y, p.z + dir.z);
              lance.rotateZ(t * 6);
              carry.position.copy(p);
              carry.intensity = 18;
              const vx = dir.x / dt;
              const vy = dir.y / dt;
              const vz = dir.z / dt;
              fx.orb.spawn({ x: p.x, y: p.y, z: p.z, life: 1, s0: 1.4, ramp: flat(0x60b8ff, 0.9, 0.5), shape: 0 });
              for (let j = 0; j < 3; j++) {
                const o = R(0.2, 1.2);
                fx.smoke.spawn({ x: p.x - vx * dt * o * 2, y: p.y - vy * dt * o * 2, z: p.z - vz * dt * o * 2, vx: R(-0.3, 0.3), vy: R(-0.2, 0.2), vz: R(-0.3, 0.3), life: R(0.7, 1.2), s0: 0.22, s1: 0.75, ramp: RAMP.frostMist, shape: 1, rot: R(0, TAU), rv: R(-1, 1), drag: 1.5 });
                fx.fire.spawn({ x: p.x - vx * dt * o * 3 + R(-0.12, 0.12), y: p.y - vy * dt * o * 3 + R(-0.12, 0.12), z: p.z - vz * dt * o * 3 + R(-0.12, 0.12), vx: R(-0.5, 0.5), vy: R(-0.6, 0.2), vz: R(-0.5, 0.5), life: R(0.5, 0.9), s0: 0.08, s1: 0.03, ramp: RAMP.ice, shape: Math.random() < 0.5 ? 4 : 3, rot: R(0, TAU), rv: R(-4, 4), grav: 1 });
              }
            }
          }
          // 파편 물리
          let n = 0;
          for (const s of SH) {
            s.age += dt;
            if (s.age > 1.9) continue;
            s.v.y -= 9.8 * dt;
            s.p.addScaledVector(s.v, dt);
            if (s.p.y < s.s * 0.5) {
              s.p.y = s.s * 0.5;
              if (s.v.y < 0) s.v.y *= -0.3;
              s.v.x *= 0.6;
              s.v.z *= 0.6;
              s.w.multiplyScalar(0.7);
            }
            s.r.x += s.w.x * dt;
            s.r.y += s.w.y * dt;
            s.r.z += s.w.z * dt;
            const shrink = 1 - clamp((s.age - 1.4) / 0.5, 0, 1);
            qq.setFromEuler(s.r);
            sc.set(s.s, s.s, s.s * 2.4).multiplyScalar(shrink);
            m4.compose(s.p, qq, sc);
            shards.setMatrixAt(n++, m4);
          }
          shards.count = n;
          shards.instanceMatrix.needsUpdate = true;
          // 가시 · 서리꽃
          const grow = clamp(since / 0.14, 0, 1);
          const sink = clamp((since - 1.3) / 0.6, 0, 1);
          for (const s of spikes) {
            if (!s.m.visible) continue;
            const hh = s.h * easeOut(grow) * (1 - sink);
            s.m.scale.set(1 - sink * 0.5, Math.max(hh, 0.001), 1 - sink * 0.5);
            if (sink >= 1) s.m.visible = false;
          }
          if (frost.visible) {
            frostMat.uniforms.uGrow!.value = easeOut(since / 0.45) * 1.02;
            frostMat.uniforms.uA!.value = 1 - clamp((since - 2.0) / 0.7, 0, 1);
            frostMat.uniforms.uGlow!.value = Math.exp(-since * 2.5);
            if (since > 2.7) frost.visible = false;
          }
          lab.set(k >= 0 ? '얼음 창 — 결정 + 서리 꼬리 + 반짝임' : since < 2 ? '깨짐 — 파편 · 가시 · 서리 김 · 서리꽃' : '시전 준비', '#8ad8ff');
          fx.update(dt, t);
          S.tick(dt);
        },
        resize: (w, h) => S.resize(w, h),
        dispose: () => {
          S.dispose();
        },
      };
    },
  },
};

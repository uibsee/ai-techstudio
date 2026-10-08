import * as THREE from 'three';
import type { Control, DemoMap } from './types';

/**
 * 속도 기법 견본 (i384 ~ i395) — 2026-10-06 이 사이트에서 실제로 고친 속도 문제들.
 * 모두 「옛 방식(끔) / 고친 방식(켬)」을 위 · 아래 두 칸(또는 좌우)으로 나란히 놓는다.
 * 카드는 기록된 값을 되풀이해 보여 주고, 진짜로 재는 일(셰이더 컴파일 · AudioContext · 그리기 호출 ·
 * longtask · 화면 멈춤)은 큰 보기의 단추에서만 한다 (멈춤은 0.5초 이하).
 * 그리기는 280 × VH 가상 판에 하고 화면에 맞춰 키운다.
 */

type G = CanvasRenderingContext2D;
const F = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
const C = {
  bg0: '#0c1020',
  bg1: '#141a30',
  panel: '#1a2140',
  line: '#2a3358',
  text: '#e9edf9',
  dim: '#8c95b4',
  faint: '#4a5378',
  red: '#ff5d6c',
  redD: '#5a2030',
  green: '#3ddc97',
  greenD: '#173f35',
  blue: '#5ab0ff',
  amber: '#ffc04d',
  violet: '#a98bff',
  cyan: '#4fe3ff',
};

const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
const clamp01 = (x: number): number => clamp(x, 0, 1);
const ease = (x: number): number => {
  const v = clamp01(x);
  return v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2;
};
const now = (): number => performance.now();
const isBig = (w: number): boolean => w >= 420;

function reset(g: G): void {
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.lineWidth = 1;
  g.setLineDash([]);
  g.shadowBlur = 0;
}
/** 바탕을 칠하고 280 × vh 가상 판으로 맞춘다. 끝에 g.restore() */
function view(g: G, w: number, h: number, vh = 175): void {
  reset(g);
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, C.bg1);
  gr.addColorStop(1, C.bg0);
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  const u = Math.min(w / 280, h / vh);
  g.save();
  g.translate((w - 280 * u) / 2, (h - vh * u) / 2);
  g.scale(u, u);
}
function txt(g: G, s: string, x: number, y: number, size: number, color: string = C.text, align: CanvasTextAlign = 'left', weight = 700): void {
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
function pill(g: G, s: string, x: number, y: number, size: number, fill: string, fg = '#fff', align: 'left' | 'center' | 'right' = 'left'): number {
  g.font = `800 ${size}px ${F}`;
  const pw = g.measureText(s).width + size * 1.2;
  const ph = size * 1.6;
  const x0 = align === 'left' ? x : align === 'center' ? x - pw / 2 : x - pw;
  rr(g, x0, y - ph / 2, pw, ph, ph / 2);
  g.fillStyle = fill;
  g.fill();
  txt(g, s, x0 + pw / 2, y + size * 0.05, size, fg, 'center', 800);
  return pw;
}
type Kind = 'bad' | 'good' | 'none';
function panel(g: G, x: number, y: number, w: number, h: number, kind: Kind): void {
  rr(g, x, y, w, h, 7);
  g.fillStyle = C.panel;
  g.fill();
  if (kind !== 'none') {
    const gr = g.createLinearGradient(x, 0, x + w, 0);
    gr.addColorStop(0, kind === 'bad' ? 'rgba(255,93,108,0.13)' : 'rgba(61,220,151,0.13)');
    gr.addColorStop(0.5, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fill();
  }
  g.strokeStyle = kind === 'bad' ? 'rgba(255,93,108,0.35)' : kind === 'good' ? 'rgba(61,220,151,0.35)' : C.line;
  g.lineWidth = 0.8;
  g.stroke();
}
function tag(g: G, x: number, y: number, s: string, kind: Kind): number {
  return pill(g, s, x, y, 6.4, kind === 'bad' ? C.red : kind === 'good' ? '#22b07a' : C.faint, '#fff');
}
/** 둥근 막대 + 안쪽 글씨(들어가면) */
function block(g: G, x: number, y: number, w: number, h: number, color: string, label = '', alpha = 1): void {
  if (w <= 0.2) return;
  g.globalAlpha = alpha;
  rr(g, x, y, w, h, Math.min(3, h / 2));
  const gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, color);
  gr.addColorStop(1, shade(color, 0.72));
  g.fillStyle = gr;
  g.fill();
  g.globalAlpha = 1;
  if (label) {
    g.font = `800 ${Math.min(6.4, h * 0.62)}px ${F}`;
    if (g.measureText(label).width < w - 4) txt(g, label, x + w / 2, y + h / 2 + 0.3, Math.min(6.4, h * 0.62), '#0b0f1e', 'center', 800);
  }
}
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const gg = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return `rgb(${r},${gg},${b})`;
}
function hatch(g: G, x: number, y: number, w: number, h: number, color: string): void {
  g.save();
  rr(g, x, y, w, h, 2);
  g.clip();
  g.fillStyle = 'rgba(140,149,180,0.12)';
  g.fillRect(x, y, w, h);
  g.strokeStyle = color;
  g.lineWidth = 0.8;
  for (let k = -h; k < w; k += 3.5) {
    g.beginPath();
    g.moveTo(x + k, y + h);
    g.lineTo(x + k + h, y);
    g.stroke();
  }
  g.restore();
}
/** 시간 축 */
function axis(g: G, x0: number, x1: number, y: number, maxT: number, step: number): void {
  g.strokeStyle = C.line;
  g.lineWidth = 0.6;
  g.beginPath();
  g.moveTo(x0, y);
  g.lineTo(x1, y);
  g.stroke();
  for (let s = 0; s <= maxT + 1e-6; s += step) {
    const x = x0 + ((x1 - x0) * s) / maxT;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x, y + 2);
    g.stroke();
    txt(g, s === 0 ? '0' : `${+s.toFixed(2)}초`, x, y + 5.4, 5, C.dim, 'center', 600);
  }
}
function playhead(g: G, x: number, y0: number, y1: number): void {
  g.strokeStyle = 'rgba(255,255,255,0.75)';
  g.lineWidth = 0.8;
  g.beginPath();
  g.moveTo(x, y0);
  g.lineTo(x, y1);
  g.stroke();
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(x - 2.4, y0 - 2.6);
  g.lineTo(x + 2.4, y0 - 2.6);
  g.lineTo(x, y0);
  g.closePath();
  g.fill();
}
function dashV(g: G, x: number, y0: number, y1: number, color: string): void {
  g.strokeStyle = color;
  g.lineWidth = 0.8;
  g.setLineDash([2, 2]);
  g.beginPath();
  g.moveTo(x, y0);
  g.lineTo(x, y1);
  g.stroke();
  g.setLineDash([]);
}
function glowBall(g: G, x: number, y: number, r: number, color: string): void {
  const gr = g.createRadialGradient(x, y, 0, x, y, r * 2.6);
  gr.addColorStop(0, color);
  gr.addColorStop(0.35, color + '55');
  gr.addColorStop(1, color + '00');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, r * 2.6, 0, Math.PI * 2);
  g.fill();
  const g2 = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g2.addColorStop(0, '#ffffff');
  g2.addColorStop(0.3, color);
  g2.addColorStop(1, shade(color, 0.55));
  g.fillStyle = g2;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}
function spinner(g: G, cx: number, cy: number, r: number, ang: number, color: string): void {
  for (let i = 0; i < 10; i++) {
    const a = ang + (i / 10) * Math.PI * 2;
    g.globalAlpha = 0.15 + (i / 10) * 0.85;
    g.strokeStyle = color;
    g.lineWidth = r * 0.28;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5);
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    g.stroke();
  }
  g.globalAlpha = 1;
  g.lineCap = 'butt';
}
function finger(g: G, x: number, y: number, s: number, color = '#ffd9b8'): void {
  g.fillStyle = color;
  g.strokeStyle = '#3a2a20';
  g.lineWidth = 0.6;
  rr(g, x - s * 0.22, y - s * 0.05, s * 0.44, s * 0.9, s * 0.22);
  g.fill();
  g.stroke();
  rr(g, x - s * 0.42, y + s * 0.42, s * 0.84, s * 0.7, s * 0.25);
  g.fill();
  g.stroke();
}
function ripple(g: G, x: number, y: number, k: number, color: string): void {
  if (k < 0 || k > 1) return;
  g.strokeStyle = color;
  g.globalAlpha = 1 - k;
  g.lineWidth = 1.2;
  g.beginPath();
  g.arc(x, y, 2 + k * 9, 0, Math.PI * 2);
  g.stroke();
  g.globalAlpha = 1;
}
function speaker(g: G, x: number, y: number, s: number, on: number, color: string): void {
  g.fillStyle = on > 0 ? color : C.faint;
  g.beginPath();
  g.moveTo(x - s * 0.5, y - s * 0.22);
  g.lineTo(x - s * 0.22, y - s * 0.22);
  g.lineTo(x + s * 0.12, y - s * 0.52);
  g.lineTo(x + s * 0.12, y + s * 0.52);
  g.lineTo(x - s * 0.22, y + s * 0.22);
  g.lineTo(x - s * 0.5, y + s * 0.22);
  g.closePath();
  g.fill();
  if (on <= 0) return;
  g.strokeStyle = color;
  g.lineWidth = s * 0.1;
  for (let i = 0; i < 3; i++) {
    const k = (on * 2 + i * 0.33) % 1;
    g.globalAlpha = (1 - k) * Math.min(1, on * 3);
    g.beginPath();
    g.arc(x + s * 0.15, y, s * (0.35 + k * 0.6), -0.8, 0.8);
    g.stroke();
  }
  g.globalAlpha = 1;
}
/** 프레임 막대 그래프 — ms 배열, 50ms 넘으면 빨강 */
function frameBars(g: G, x: number, y: number, w: number, h: number, ms: number[], maxMs: number, slotW: number): void {
  g.fillStyle = 'rgba(0,0,0,0.25)';
  rr(g, x, y, w, h, 3);
  g.fill();
  const yb = y + h;
  const yl = yb - (h * 16.7) / maxMs;
  g.strokeStyle = 'rgba(61,220,151,0.5)';
  g.setLineDash([2, 2]);
  g.lineWidth = 0.6;
  g.beginPath();
  g.moveTo(x, yl);
  g.lineTo(x + w, yl);
  g.stroke();
  g.setLineDash([]);
  for (let i = 0; i < ms.length; i++) {
    const v = ms[i]!;
    const bh = Math.min(h - 1, (h * v) / maxMs);
    const color = v >= 50 ? C.red : v >= 20 ? C.amber : C.green;
    g.fillStyle = color;
    g.fillRect(x + i * slotW + 0.3, yb - bh, Math.max(0.6, slotW - 0.6), bh);
  }
}
/** 큰 보기 아래 실측 띠 (y 174 ~ 191) */
function resultStrip(g: G, s: string, ok: boolean): void {
  panel(g, 6, 174, 268, 17, ok ? 'good' : 'none');
  let size = 6.2;
  g.font = `700 ${size}px ${F}`;
  const tw = g.measureText(s).width;
  if (tw > 256) size *= 256 / tw;
  txt(g, s, 140, 182.8, size, ok ? '#bdf7df' : C.dim, 'center', 700);
}
function busy(ms: number): void {
  const t0 = now();
  let s = 0;
  while (now() - t0 < ms) s += Math.sqrt(s + 1);
  if (s < 0) console.log(s);
}

/* ─────────────── i384 시간 조각 나누기 ─────────────── */
function demo384() {
  let fps = 12;
  let fix = true;
  const DUR = 2;
  let acc = 0;
  let real = 0;
  let gOld = 0;
  let gNew = 0;
  let lastSteps = 0;
  let trailO: number[] = [];
  let trailN: number[] = [];
  let hold = 0;
  const restart = (): void => {
    acc = 0;
    real = 0;
    gOld = 0;
    gNew = 0;
    trailO = [];
    trailN = [];
    hold = 0;
  };
  const stepNew = (dt: number): void => {
    if (!fix) {
      gNew += Math.min(dt, 0.05);
      lastSteps = 1;
      return;
    }
    let rem = Math.min(dt, 0.25);
    let n = 0;
    while (rem > 1e-6) {
      const s = Math.min(0.05, rem);
      gNew += s;
      rem -= s;
      n++;
    }
    lastSteps = n;
  };
  const xOf = (gt: number): number => 30 + (Math.min(gt, DUR) / DUR) * 214;
  const lane = (g: G, y: number, kind: Kind, title: string, gt: number, trail: number[], sub: string): void => {
    panel(g, 6, y, 268, 66, kind);
    tag(g, 11, y + 8, kind === 'bad' ? '끔' : '켬', kind);
    txt(g, title, 25, y + 8.3, 6.4, C.text, 'left', 700);
    const ty = y + 34;
    // 길
    g.strokeStyle = C.line;
    g.lineWidth = 5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(30, ty);
    g.lineTo(244, ty);
    g.stroke();
    g.lineCap = 'butt';
    for (let k = 0; k <= 4; k++) {
      const x = 30 + k * 53.5;
      txt(g, `${(k * 0.5).toFixed(1)}`, x, ty + 10, 4.8, C.faint, 'center', 600);
    }
    // 결승 깃발
    g.fillStyle = '#cfd6ee';
    g.fillRect(250, ty - 14, 1, 18);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      g.fillStyle = (r + c) % 2 ? '#fff' : '#20263f';
      g.fillRect(251 + c * 2.6, ty - 14 + r * 2.6, 2.6, 2.6);
    }
    // 제시간 자리(유령)
    const gx = xOf(real);
    g.strokeStyle = 'rgba(255,255,255,0.45)';
    g.setLineDash([1.6, 1.6]);
    g.lineWidth = 0.9;
    g.beginPath();
    g.arc(gx, ty, 6, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    // 지나온 자리(프레임마다 한 번씩 그린 것)
    for (let i = 0; i < trail.length; i++) {
      g.globalAlpha = 0.12 + (i / trail.length) * 0.3;
      g.fillStyle = kind === 'bad' ? C.red : C.green;
      g.beginPath();
      g.arc(xOf(trail[i]!), ty, 3.2, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    glowBall(g, xOf(gt), ty, 5, kind === 'bad' ? '#ff7a86' : '#5cf0b0');
    const pct = real > 0 ? Math.round((Math.min(gt, DUR) / Math.min(real, DUR)) * 100) : 100;
    txt(g, `게임 시계 ${Math.min(gt, 9).toFixed(2)}초 / 실제 ${real.toFixed(2)}초`, 268, y + 8.3, 5.6, C.dim, 'right', 600);
    txt(g, sub, 12, y + 58, 5.6, C.dim, 'left', 600);
    const done = gt >= DUR;
    pill(g, done ? '도착 ✓ 제시간' : `${Math.min(100, pct)}% 속도${pct < 95 ? ' — 슬로모션' : ''}`, 268, y + 58, 5.6, done || pct >= 95 ? '#1d6b52' : C.redD, done || pct >= 95 ? '#bdf7df' : '#ffc2c8', 'right');
  };
  return {
    draw(g: G, w: number, h: number, _t: number, dt: number) {
      const d = Math.min(dt, 0.05);
      if (hold > 0) {
        hold -= d;
        if (hold <= 0) restart();
      } else {
        acc += d;
        if (acc >= 1 / fps) {
          const fd = acc;
          acc = 0;
          real += fd;
          gOld += Math.min(fd, 0.05);
          stepNew(fd);
          trailO.push(gOld);
          trailN.push(gNew);
          if (trailO.length > 8) trailO.shift();
          if (trailN.length > 8) trailN.shift();
          if (real >= DUR) hold = 0.9;
        }
      }
      view(g, w, h);
      txt(g, '같은 공 · 같은 2초 길', 8, 10, 7.2, C.text, 'left', 800);
      pill(g, `흉내 ${fps} fps · 한 프레임 ${(1000 / fps).toFixed(0)}ms`, 272, 10, 6, '#2b3560', C.cyan, 'right');
      lane(g, 21, 'bad', '프레임 시간 상한 0.05초 → 그만큼만 진행', gOld, trailO, '느린 프레임에서 남는 시간을 버림');
      lane(g, 103, fix ? 'good' : 'bad', fix ? '0.25초까지 받아 0.05초 조각으로 여러 번' : '(꺼 둠) 위와 같은 옛 방식', gNew, trailN, fix ? `이번 프레임: 갱신 ${lastSteps}번 · 그리기 1번` : '느린 프레임에서 남는 시간을 버림');
      // 조각 점
      if (fix) {
        g.font = `600 5.6px ${F}`;
        const px0 = 12 + g.measureText(`이번 프레임: 갱신 ${lastSteps}번 · 그리기 1번`).width + 4;
        for (let i = 0; i < lastSteps; i++) {
          g.fillStyle = C.green;
          g.fillRect(px0 + i * 5, 159.3, 3.4, 3.4);
        }
      }
      g.restore();
    },
    controls: [
      { type: 'range', label: '흉내 fps', min: 5, max: 60, step: 1, value: fps, on: (v) => { fps = v; restart(); } },
      { type: 'toggle', label: '시간 조각 나누기 (아래 칸)', value: fix, on: (v) => { fix = v; restart(); } },
      { type: 'button', label: '다시', on: () => restart() },
    ] as Control[],
  };
}

/* ─────────────── i385 셰이더 미리 데우기 ─────────────── */
interface ShaderMeasure { cold: number; warm: number; pre: number; after: number }
async function measureShader(): Promise<ShaderMeasure> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const r = new THREE.WebGLRenderer({ canvas, antialias: false });
  r.setSize(128, 128, false);
  const gl = r.getContext();
  const px = new Uint8Array(4);
  const sync = (): void => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1));
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(2, 3, 2);
  scene.add(sun);
  const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
  cam.position.z = 3;
  const geo = new THREE.IcosahedronGeometry(1, 3);
  const mats: THREE.Material[] = [];
  const mk = (): THREE.MeshPhysicalMaterial => {
    const key = Math.random().toString(36).slice(2);
    const m = new THREE.MeshPhysicalMaterial({ color: 0xff8844, roughness: 0.3, clearcoat: 1, sheen: 1, iridescence: 1, transmission: 0.4, thickness: 0.5 });
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = `#define FX_${key} 1\n` + sh.fragmentShader;
    };
    m.customProgramCacheKey = () => key;
    mats.push(m);
    return m;
  };
  const base = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
  mats.push(base.material);
  scene.add(base);
  r.render(scene, cam);
  sync();
  scene.remove(base);
  const m1 = new THREE.Mesh(geo, mk());
  scene.add(m1);
  let t0 = now();
  r.render(scene, cam);
  sync();
  const cold = now() - t0;
  t0 = now();
  r.render(scene, cam);
  sync();
  const warm = now() - t0;
  scene.remove(m1);
  const m2 = new THREE.Mesh(geo, mk());
  scene.add(m2);
  t0 = now();
  await r.compileAsync(scene, cam);
  const pre = now() - t0;
  t0 = now();
  r.render(scene, cam);
  sync();
  const after = now() - t0;
  geo.dispose();
  for (const m of mats) m.dispose();
  r.dispose();
  r.forceContextLoss();
  return { cold, warm, pre, after };
}
function demo385() {
  let rec: ShaderMeasure = { cold: 180, warm: 0.6, pre: 190, after: 0.7 };
  let measured = false;
  let busyMsg = '';
  const CYC = 3.4;
  const LOAD = 0.75;
  const FX = 1.7;
  const lane = (g: G, y: number, kind: Kind, t: number): void => {
    panel(g, 6, y, 268, 66, kind);
    const bad = kind === 'bad';
    tag(g, 11, y + 8, bad ? '끔' : '켬', kind);
    txt(g, bad ? '효과가 처음 보이는 순간 컴파일' : '판을 열 때 화면 밖에서 한 번 그려 둠', 25, y + 8.3, 6.4, C.text, 'left', 700);
    const freeze = rec.cold / 1000;
    // 미니 장면
    const sx = 12;
    const sy = y + 16;
    const sw = 78;
    const sh = 45;
    rr(g, sx, sy, sw, sh, 4);
    g.fillStyle = '#0a0e1c';
    g.fill();
    g.save();
    rr(g, sx, sy, sw, sh, 4);
    g.clip();
    if (t < LOAD) {
      txt(g, '불러오는 중', sx + sw / 2, sy + sh / 2 - 6, 6, C.dim, 'center', 700);
      rr(g, sx + 12, sy + sh / 2 + 2, sw - 24, 4, 2);
      g.fillStyle = C.line;
      g.fill();
      rr(g, sx + 12, sy + sh / 2 + 2, (sw - 24) * clamp01(t / LOAD), 4, 2);
      g.fillStyle = bad ? C.blue : C.violet;
      g.fill();
      if (!bad) txt(g, '+ 효과 미리 데우기', sx + sw / 2, sy + sh / 2 + 13, 5.4, C.violet, 'center', 700);
    } else {
      // 멈춘 시간(옛 방식)만큼 장면 시계가 서 있다
      let st = t;
      const stalled = bad && t >= FX && t < FX + freeze;
      if (bad && t >= FX) st = t < FX + freeze ? FX : t - freeze;
      const k = clamp01((st - LOAD) / (FX - LOAD));
      g.fillStyle = '#1b2440';
      g.fillRect(sx, sy + sh - 8, sw, 8);
      if (st < FX) {
        const bx = sx + 10 + k * (sw - 26);
        const by = sy + sh - 12 - Math.sin(k * Math.PI) * 22;
        glowBall(g, bx, by, 3.4, C.amber);
      } else {
        const e = clamp01((st - FX) / 0.8);
        const cx = sx + sw - 16;
        const cy = sy + sh - 12;
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          const rr2 = 3 + e * 16;
          g.globalAlpha = 1 - e;
          glowBall(g, cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2 * 0.7, 1.6, i % 2 ? '#ff9a4d' : '#ffe27a');
        }
        g.globalAlpha = 1;
        if (e < 0.5) glowBall(g, cx, cy, 6 * (1 - e * 2), '#fff3c4');
      }
      if (stalled || (bad && t >= FX && t < FX + freeze + 0.5)) {
        g.fillStyle = 'rgba(255,93,108,0.18)';
        g.fillRect(sx, sy, sw, sh);
        txt(g, '멈칫!', sx + sw / 2, sy + 10, 8, C.red, 'center', 900);
      }
    }
    g.restore();
    // 프레임 그래프 (1/30초 칸)
    const gx = 98;
    const gw = 170;
    const slot = gw / (CYC * 30);
    const ms: number[] = [];
    const n = Math.floor(t * 30);
    for (let i = 0; i <= n; i++) {
      const ti = i / 30;
      let v = 14 + ((i * 37) % 5);
      if (!bad && Math.abs(ti - LOAD * 0.5) < 1 / 60) v = rec.pre;
      if (bad && Math.abs(ti - FX) < 1 / 60) v = rec.cold + 16;
      ms.push(v);
    }
    frameBars(g, gx, y + 17, gw, 34, ms, 200, slot);
    if (!bad && t >= LOAD * 0.5) {
      const i = Math.round(LOAD * 0.5 * 30);
      const bh = Math.min(33, (34 * rec.pre) / 200);
      g.fillStyle = C.violet;
      g.fillRect(gx + i * slot + 0.3, y + 51 - bh, Math.max(0.6, slot - 0.6), bh);
    }
    // 불러오는 구간 그늘
    g.fillStyle = 'rgba(169,139,255,0.08)';
    g.fillRect(gx, y + 17, LOAD * 30 * slot, 34);
    txt(g, '불러오기', gx + 2, y + 21, 4.8, C.violet, 'left', 700);
    const spikeX = gx + (bad ? FX : LOAD * 0.5) * 30 * slot;
    if (t >= (bad ? FX : LOAD * 0.5)) {
      const v = bad ? rec.cold : rec.pre;
      txt(g, `${v.toFixed(0)}ms`, spikeX + 3, y + 22, 5.6, bad ? C.red : C.violet, 'left', 800);
    }
    txt(g, '프레임 시간', gx, y + 58, 5.2, C.dim, 'left', 600);
    txt(g, bad ? '놀이 중에 큰 막대 = 화면 멈춤' : '놀이 중엔 모두 16ms 근처 — 큰 막대는 로딩 화면 뒤에 숨음', 268, y + 58, 5.2, bad ? '#ffb0b8' : '#a9f2d2', 'right', 700);
    playhead(g, gx + t * 30 * slot, y + 17, y + 51);
  };
  return {
    draw(g: G, w: number, h: number, tt: number) {
      const t = tt % CYC;
      view(g, w, h, isBig(w) ? 194 : 175);
      txt(g, '첫 폭발 효과 = 새 재질 = 새 셰이더', 8, 10, 7.2, C.text, 'left', 800);
      pill(g, measured ? `실측 ${rec.cold.toFixed(0)}ms` : `기록 ${rec.cold.toFixed(0)}ms`, 272, 10, 6, measured ? '#1d6b52' : '#2b3560', measured ? '#bdf7df' : C.cyan, 'right');
      lane(g, 21, 'bad', t);
      lane(g, 103, 'good', t);
      if (busyMsg) {
        rr(g, 70, 78, 140, 22, 6);
        g.fillStyle = 'rgba(10,14,28,0.92)';
        g.fill();
        txt(g, busyMsg, 140, 89, 6.6, C.cyan, 'center', 800);
      }
      if (isBig(w)) resultStrip(g, measured ? `실측 — 첫 그리기 ${rec.cold.toFixed(1)}ms · 두 번째 ${rec.warm.toFixed(1)}ms · 미리 데우기(비동기, 화면 안 멈춤) ${rec.pre.toFixed(0)}ms 뒤 첫 그리기 ${rec.after.toFixed(1)}ms` : '「진짜로 재기」 단추 → 이 기기에서 실제로 잰 값이 여기에 나와요', measured);
      g.restore();
    },
    controls: [
      {
        type: 'button', label: '진짜로 재기 (새 셰이더 컴파일)', on: () => {
          if (busyMsg) return;
          busyMsg = '재는 중… (새 물리 재질)';
          setTimeout(() => {
            measureShader().then((m) => { rec = m; measured = true; busyMsg = ''; }).catch(() => { busyMsg = '잴 수 없음 (WebGL)'; setTimeout(() => (busyMsg = ''), 1500); });
          }, 60);
        },
      },
    ] as Control[],
  };
}

/* ─────────────── 공용: 위 · 아래 타임라인 칸 ─────────────── */
interface Bar { t0: number; t1: number; row: number; color: string; label: string; hatch?: boolean }
function ganttLane(g: G, y: number, kind: Kind, title: string, bars: Bar[], t: number, maxT: number, x0 = 74, x1 = 266): (tt: number) => number {
  panel(g, 6, y, 268, 66, kind);
  tag(g, 11, y + 8, kind === 'bad' ? '끔' : '켬', kind);
  txt(g, title, 25, y + 8.3, 6.4, C.text, 'left', 700);
  const X = (tt: number): number => x0 + ((x1 - x0) * tt) / maxT;
  for (const b of bars) {
    const by = y + 17 + b.row * 12;
    const te = Math.min(b.t1, Math.max(b.t0, t));
    if (b.hatch) {
      if (t > b.t0) hatch(g, X(b.t0), by, X(te) - X(b.t0), 10, 'rgba(140,149,180,0.45)');
    } else {
      rr(g, X(b.t0), by, X(b.t1) - X(b.t0), 10, 3);
      g.strokeStyle = b.color + '55';
      g.lineWidth = 0.6;
      g.stroke();
      block(g, X(b.t0), by, X(te) - X(b.t0), 10, b.color);
      const mid = (X(b.t0) + X(b.t1)) / 2;
      g.font = `800 6.2px ${F}`;
      if (b.label && g.measureText(b.label).width < X(b.t1) - X(b.t0) - 4) txt(g, b.label, mid, by + 5.3, 6.2, X(te) >= mid ? '#0b0f1e' : b.color, 'center', 800);
    }
  }
  axis(g, x0, x1, y + 50, maxT, maxT > 1.2 ? 0.5 : 0.25);
  playhead(g, X(Math.min(t, maxT)), y + 16, y + 50);
  return X;
}
/** 3 × 3 미니 판 — 사람 말이 미끄러지고, 컴퓨터 말이 쏙 */
function miniBoard(g: G, x: number, y: number, s: number, moveK: number, aiK: number, thinking: boolean, t: number, humanPop = -1): void {
  const c = s / 3;
  rr(g, x - 2, y - 2, s + 4, s + 4, 4);
  g.fillStyle = '#2a2116';
  g.fill();
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    g.fillStyle = (i + j) % 2 ? '#c9a46a' : '#dcbb84';
    g.fillRect(x + i * c, y + j * c, c, c);
  }
  const cell = (i: number, j: number): [number, number] => [x + (i + 0.5) * c, y + (j + 0.5) * c];
  const disk = (px: number, py: number, color: string, k: number): void => {
    if (k <= 0) return;
    const r = c * 0.34 * (k < 1 ? 1 + Math.sin(k * Math.PI) * 0.25 : 1) * Math.min(1, k * 3);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath();
    g.ellipse(px, py + r * 0.35, r, r * 0.6, 0, 0, Math.PI * 2);
    g.fill();
    glowBall(g, px, py, r, color);
  };
  if (humanPop < 0) {
    const [ax, ay] = cell(0, 2);
    const [bx, by] = cell(1, 1);
    const e = ease(moveK);
    disk(ax + (bx - ax) * e, ay + (by - ay) * e - Math.sin(e * Math.PI) * c * 0.5, C.blue, 1);
  } else disk(...cell(1, 1), C.blue, humanPop);
  const [cx2, cy2] = cell(2, 0);
  disk(cx2, cy2, C.red, aiK);
  if (thinking) {
    const bx = x + s - 12;
    const by = y + 6;
    rr(g, bx - 10, by - 5, 20, 9, 4.5);
    g.fillStyle = '#ffffff';
    g.fill();
    for (let i = 0; i < 3; i++) {
      g.fillStyle = Math.floor(t * 6) % 3 === i ? C.red : '#9aa3c0';
      g.beginPath();
      g.arc(bx - 5 + i * 5, by - 0.5, 1.3, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/* ─────────────── i386 소리 장치 미리 깨우기 ─────────────── */
function demo386() {
  let rec = { create: 150, resume: 20 };
  let measured = false;
  let msg = '';
  const CYC = 3.4;
  const MAXT = 2.4;
  const CARD = 0.2;
  const OPEN = 0.85;
  const TAP = 1.35;
  const lane = (g: G, y: number, kind: Kind, t: number): void => {
    const bad = kind === 'bad';
    const fr = rec.create / 1000;
    const bars: Bar[] = [
      { t0: CARD, t1: OPEN, row: 0, color: '#6c7aa8', label: '화면 열림' },
    ];
    if (bad) bars.push({ t0: TAP, t1: TAP + fr, row: 1, color: C.red, label: '' });
    else bars.push({ t0: CARD, t1: CARD + fr, row: 1, color: C.violet, label: '' });
    const X = ganttLane(g, y, kind, bad ? '첫 터치 때 AudioContext 를 만든다' : '게임 카드를 누를 때 깨워 둔다', bars, t, MAXT);
    txt(g, bad ? `소리 장치 만들기 ${rec.create.toFixed(0)}ms` : `깨우기 ${rec.create.toFixed(0)}ms (화면 넘김에 숨음)`, bad ? X(TAP + fr) + 3 : X(CARD + fr) + 3, y + 34, 5.4, bad ? C.red : C.violet, 'left', 700);
    // 손가락 표시
    for (const [tt, s] of [[CARD, '카드 누름'], [TAP, '첫 터치']] as [number, string][]) {
      g.fillStyle = C.amber;
      g.beginPath();
      g.arc(X(tt), y + 47, 1.6, 0, Math.PI * 2);
      g.fill();
      txt(g, s, X(tt) + 3, y + 44.5, 5, C.amber, 'left', 700);
    }
    const sound = bad ? TAP + fr : TAP;
    dashV(g, X(sound), y + 16, y + 50, bad ? C.red : C.green);
    // 미니 폰
    const px = 14;
    const py = y + 16;
    rr(g, px, py, 52, 44, 5);
    g.fillStyle = '#05070f';
    g.fill();
    g.strokeStyle = '#3b4470';
    g.lineWidth = 1;
    g.stroke();
    if (t < OPEN) {
      for (let i = 0; i < 4; i++) {
        const cx = px + 5 + (i % 2) * 22;
        const cy = py + 5 + Math.floor(i / 2) * 18;
        rr(g, cx, cy, 20, 15, 2.5);
        g.fillStyle = i === 1 ? '#3a4a8a' : '#1f2747';
        g.fill();
      }
      ripple(g, px + 38, py + 12, (t - CARD) / 0.4, C.amber);
    } else {
      g.fillStyle = '#1d3a2e';
      rr(g, px + 4, py + 4, 44, 36, 3);
      g.fill();
      g.strokeStyle = 'rgba(160,230,190,0.25)';
      g.lineWidth = 0.6;
      for (let k = 1; k < 4; k++) {
        g.beginPath();
        g.moveTo(px + 4 + k * 11, py + 4);
        g.lineTo(px + 4 + k * 11, py + 40);
        g.moveTo(px + 4, py + 4 + k * 9);
        g.lineTo(px + 48, py + 4 + k * 9);
        g.stroke();
      }
      const stall = bad && t >= TAP && t < TAP + fr + 0.25;
      ripple(g, px + 22, py + 22, stall ? 0.15 : (t - TAP) / 0.4, C.amber);
      if (t >= TAP - 0.3 && t < TAP + 0.4) finger(g, px + 22, py + 22, 9);
      if (stall) txt(g, '멈칫', px + 26, py + 8, 6.5, C.red, 'center', 900);
    }
    const son = t >= sound ? (t - sound) : 0;
    speaker(g, px + 44, py + 38, 8, son > 0 && son < 0.9 ? son : 0, bad ? '#ffb0b8' : C.green);
    txt(g, bad ? `첫 소리 ${(fr * 1000).toFixed(0)}ms 늦음` : '첫 소리 바로', 268, y + 8.3, 5.8, bad ? '#ffb0b8' : '#a9f2d2', 'right', 700);
  };
  return {
    draw(g: G, w: number, h: number, tt: number) {
      const t = Math.min(tt % CYC, MAXT);
      view(g, w, h, isBig(w) ? 194 : 175);
      txt(g, '소리 장치는 사용자 몸짓 안에서만 켜진다', 8, 10, 7.2, C.text, 'left', 800);
      pill(g, measured ? `실측 ${rec.create.toFixed(0)}ms` : `기록 ${rec.create.toFixed(0)}ms`, 272, 10, 6, measured ? '#1d6b52' : '#2b3560', measured ? '#bdf7df' : C.cyan, 'right');
      lane(g, 21, 'bad', t);
      lane(g, 103, 'good', t);
      if (isBig(w)) resultStrip(g, msg || (measured ? `실측 — new AudioContext() ${rec.create.toFixed(1)}ms (화면이 멈춘 시간) · resume() ${rec.resume.toFixed(1)}ms` : '「진짜로 재기」 단추 → 이 기기에서 실제로 잰 값이 여기에 나와요'), measured && !msg);
      g.restore();
    },
    controls: [
      {
        type: 'button', label: '진짜로 재기 (짧은 삑 소리)', on: () => {
          const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (!AC) { msg = '이 브라우저엔 AudioContext 가 없음'; return; }
          const t0 = now();
          const ac = new AC();
          const t1 = now();
          ac.resume().then(() => {
            const t2 = now();
            rec = { create: t1 - t0, resume: t2 - t1 };
            measured = true;
            msg = '';
            const o = ac.createOscillator();
            const gn = ac.createGain();
            o.frequency.value = 880;
            gn.gain.setValueAtTime(0.06, ac.currentTime);
            gn.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.12);
            o.connect(gn).connect(ac.destination);
            o.start();
            o.stop(ac.currentTime + 0.13);
            setTimeout(() => void ac.close(), 400);
          }).catch(() => { msg = '소리 장치를 켤 수 없음'; });
        },
      },
    ] as Control[],
  };
}

/* ─────────────── i387 무거운 표 나눠 만들기 ─────────────── */
function demo387() {
  let total = 400;
  const CYC = 3.2;
  const START = 0.45;
  // 실측
  const frames: { t: number; d: number }[] = [];
  let lastNow = 0;
  let real = '';
  let chunkLeft = 0;
  let chunkTotal = 0;
  let worst = 0;
  let measuring = false;
  const lane = (g: G, y: number, kind: Kind, t: number): void => {
    const bad = kind === 'bad';
    panel(g, 6, y, 268, 66, kind);
    tag(g, 11, y + 8, bad ? '끔' : '켬', kind);
    txt(g, bad ? `풀이표를 한 번에 (${total}ms 쉬지 않고)` : '10ms 조각으로 나눠 프레임 사이 쉬는 틈에', 25, y + 8.3, 6.4, C.text, 'left', 700);
    const T = total / 1000;
    const nFrames = Math.ceil(total / 10);
    const chunkEnd = START + nFrames / 60;
    // 진행도
    let prog = 0;
    if (bad) prog = t >= START + T ? 1 : 0;
    else prog = clamp01((t - START) / (chunkEnd - START));
    // 화면 시계 (멈춘 동안 서 있음)
    let st = t;
    if (bad && t > START) st = t < START + T ? START : t - T;
    const frozen = bad && t > START && t < START + T;
    // 살아 있는 표시
    rr(g, 12, y + 16, 50, 44, 5);
    g.fillStyle = '#0a0e1c';
    g.fill();
    spinner(g, 37, y + 33, 9, st * 7, frozen ? C.red : C.cyan);
    txt(g, frozen ? '멈춤!' : '움직임 OK', 37, y + 53, 5.6, frozen ? C.red : '#a9f2d2', 'center', 800);
    // 표 칸 (채워지는 격자)
    const gx = 70;
    const gy = y + 17;
    const cols = 24;
    const rows = 4;
    const cw = 4.6;
    const filled = Math.floor(prog * cols * rows);
    for (let i = 0; i < cols * rows; i++) {
      const cx = gx + (i % cols) * cw;
      const cy = gy + Math.floor(i / cols) * cw;
      g.fillStyle = i < filled ? (bad ? '#7c8bd6' : C.green) : '#232b4c';
      g.fillRect(cx, cy, cw - 0.8, cw - 0.8);
    }
    txt(g, `풀이표 ${Math.round(prog * 100)}%`, gx + cols * cw + 4, gy + 9, 6, C.text, 'left', 800);
    // 프레임 그래프
    const fx = 70;
    const fw = 196;
    const slot = fw / (CYC * 30);
    const ms: number[] = [];
    const n = Math.floor(t * 30);
    for (let i = 0; i <= n; i++) {
      const ti = i / 30;
      let v = 14 + ((i * 29) % 4);
      if (bad && ti >= START && ti < START + 1 / 30) v = total;
      else if (bad && ti > START && ti < START + T) continue;
      if (!bad && ti >= START && ti < chunkEnd) v = 16.7 + 3;
      ms.push(v);
    }
    // 멈춘 동안은 막대가 없다(프레임이 안 나옴) → 큰 막대 하나 뒤 빈칸
    const msFull: number[] = [];
    let k = 0;
    for (let i = 0; i <= n; i++) {
      const ti = i / 30;
      if (bad && ti > START + 1 / 30 && ti < START + T) { msFull.push(0); continue; }
      msFull.push(ms[k++] ?? 0);
    }
    frameBars(g, fx, y + 38, fw, 15, msFull, 120, slot);
    if (bad && t >= START) {
      g.fillStyle = 'rgba(255,93,108,0.16)';
      g.fillRect(fx + START * 30 * slot, y + 38, T * 30 * slot, 15);
      txt(g, `${total}ms 동안 프레임 0장`, fx + (START + T) * 30 * slot + 3, y + 43, 5.2, C.red, 'left', 800);
    }
    if (!bad && t >= START) txt(g, '프레임마다 +10ms — 60fps 그대로', fx + chunkEnd * 30 * slot + 3, y + 43, 5.2, '#a9f2d2', 'left', 700);
    playhead(g, fx + t * 30 * slot, y + 37, y + 53);
    txt(g, '프레임 시간', fx, y + 59, 5, C.dim, 'left', 600);
  };
  const runChunks = (): void => {
    if (chunkLeft <= 0) { measuring = false; real = `실측 — 나눠서: 가장 긴 프레임 ${worst.toFixed(0)}ms (일은 똑같이 ${chunkTotal}ms)`; return; }
    busy(Math.min(10, chunkLeft));
    chunkLeft -= 10;
    requestAnimationFrame(runChunks);
  };
  return {
    draw(g: G, w: number, h: number, tt: number) {
      const tn = now();
      if (lastNow) {
        const d = tn - lastNow;
        frames.push({ t: tn, d });
        if (measuring) worst = Math.max(worst, d);
      }
      lastNow = tn;
      while (frames.length && frames[0]!.t < tn - 4000) frames.shift();
      const big = isBig(w);
      const t = tt % CYC;
      view(g, w, h, big ? 218 : 175);
      txt(g, '해법 표 만들기 — 같은 일, 다른 나눔', 8, 10, 7.2, C.text, 'left', 800);
      pill(g, '피그 · 피카리아 · 고누', 272, 10, 6, '#2b3560', C.cyan, 'right');
      lane(g, 21, 'bad', t);
      lane(g, 103, 'good', t);
      if (big) {
        panel(g, 6, 174, 268, 40, 'none');
        txt(g, '이 브라우저 실측 (최근 4초 프레임)', 12, 181, 6, C.text, 'left', 800);
        txt(g, real || '단추로 진짜 멈춤 / 나눠서를 눌러 보세요', 268, 181, 5.6, real ? '#bdf7df' : C.dim, 'right', 700);
        const ms = frames.map((f) => f.d);
        const fw = 256;
        const slot = fw / 240;
        frameBars(g, 12, 187, fw, 23, ms.slice(-240), 450, slot);
      }
      g.restore();
    },
    controls: [
      { type: 'range', label: '표 만드는 일 (ms)', min: 100, max: 500, step: 50, value: total, on: (v) => { total = v; } },
      { type: 'button', label: '진짜로 한 번에 (0.4초 멈춤)', on: () => { if (measuring) return; const t0 = now(); busy(400); real = `실측 — 한 번에: 화면이 ${(now() - t0).toFixed(0)}ms 멈춤`; } },
      { type: 'button', label: '진짜로 나눠서 (10ms 조각)', on: () => { if (measuring) return; measuring = true; worst = 0; chunkTotal = 400; chunkLeft = 400; requestAnimationFrame(runChunks); } },
    ] as Control[],
  };
}

/* ─────────────── i388 기다림을 연출과 겹치기 ─────────────── */
function demo388() {
  let move = 0.6;
  let think = 0.7;
  let start = 0;
  let again = false;
  return {
    draw(g: G, w: number, h: number, tt: number) {
      if (again) { start = tt; again = false; }
      const maxT = Math.max(1.6, move + think + 0.25);
      const cyc = maxT + 1.1;
      const t = Math.min((tt - start + cyc * 100) % cyc, maxT);
      view(g, w, h);
      txt(g, '컴퓨터 차례 — 말이 움직이는 동안 기다림도 센다', 8, 10, 7.2, C.text, 'left', 800);
      const lanes: [number, Kind][] = [[21, 'bad'], [103, 'good']];
      for (const [y, kind] of lanes) {
        const bad = kind === 'bad';
        const done = bad ? move + think : Math.max(move, think);
        const bars: Bar[] = bad
          ? [{ t0: 0, t1: move, row: 0, color: C.blue, label: `말 이동 ${move.toFixed(1)}` }, { t0: move, t1: move + think, row: 0, color: C.amber, label: `생각하는 척 ${think.toFixed(1)}` }]
          : [{ t0: 0, t1: move, row: 0, color: C.blue, label: `말 이동 ${move.toFixed(1)}` }, { t0: 0, t1: think, row: 1, color: C.amber, label: `생각하는 척 ${think.toFixed(1)}` }];
        const X = ganttLane(g, y, kind, bad ? '차례로 쌓기: 이동 끝나고 대기 시작' : '동시에 세기: 늦게 끝나는 쪽에 바로', bars, t, maxT);
        dashV(g, X(done), y + 15, y + 50, bad ? C.red : C.green);
        txt(g, `컴퓨터 둠 ${done.toFixed(1)}초`, X(done) + 2, y + 44, 5.6, bad ? '#ffb0b8' : '#a9f2d2', 'left', 800);
        miniBoard(g, 16, y + 18, 42, t / move, t >= done ? Math.min(1, (t - done) / 0.25) : 0, t >= (bad ? move : 0) && t < done, tt);
        txt(g, bad ? `${(move + think).toFixed(1)}초` : `${Math.max(move, think).toFixed(1)}초`, 268, y + 8.3, 7, bad ? C.red : C.green, 'right', 900);
      }
      g.restore();
    },
    controls: [
      { type: 'range', label: '말 이동 (초)', min: 0.2, max: 1.2, step: 0.1, value: move, on: (v) => { move = v; } },
      { type: 'range', label: '생각하는 척 대기 (초)', min: 0.2, max: 1.2, step: 0.1, value: think, on: (v) => { think = v; } },
      { type: 'button', label: '다시', on: () => { again = true; } },
    ] as Control[],
  };
}

/* ─────────────── i389 미리 생각하기 ─────────────── */
function demo389() {
  let anim = 0.6;
  let comp = 0.9;
  let t0s = -1;
  return {
    draw(g: G, w: number, h: number, tt: number) {
      if (t0s < 0) t0s = tt;
      const maxT = Math.max(1.8, anim + comp + 0.25);
      const cyc = maxT + 1.1;
      const t = Math.min((tt - t0s + cyc * 100) % cyc, maxT);
      view(g, w, h);
      txt(g, '사람 말이 움직이기 시작하면 바로 계산 시작', 8, 10, 7.2, C.text, 'left', 800);
      const lanes: [number, Kind][] = [[21, 'bad'], [103, 'good']];
      for (const [y, kind] of lanes) {
        const bad = kind === 'bad';
        const cs = bad ? anim : 0;
        const done = cs + comp;
        const wait = Math.max(0, done - anim);
        const bars: Bar[] = [
          { t0: 0, t1: anim, row: 0, color: C.blue, label: `내 말 이동 ${anim.toFixed(1)}` },
          { t0: cs, t1: done, row: 1, color: C.violet, label: `컴퓨터 계산 ${comp.toFixed(1)}` },
        ];
        const X = ganttLane(g, y, kind, bad ? '이동이 끝난 뒤에야 계산' : '이동과 동시에 계산 (워커)', bars, t, maxT);
        // 체감 대기 괄호
        if (wait > 0.01 && t > anim) {
          const xa = X(anim);
          const xb = X(Math.min(t, done));
          g.fillStyle = bad ? 'rgba(255,93,108,0.22)' : 'rgba(61,220,151,0.2)';
          g.fillRect(xa, y + 41, xb - xa, 5);
        }
        txt(g, `체감 대기 ${wait.toFixed(1)}초`, 268, y + 8.3, 7, bad ? C.red : C.green, 'right', 900);
        dashV(g, X(done), y + 15, y + 50, bad ? C.red : C.green);
        miniBoard(g, 16, y + 18, 42, t / anim, t >= done ? Math.min(1, (t - done) / 0.25) : 0, t >= cs && t < done, tt);
      }
      g.restore();
    },
    controls: [
      { type: 'range', label: '내 말 이동 (초)', min: 0.2, max: 1.2, step: 0.1, value: anim, on: (v) => { anim = v; } },
      { type: 'range', label: '컴퓨터 계산 (초)', min: 0.2, max: 1.5, step: 0.1, value: comp, on: (v) => { comp = v; } },
      { type: 'button', label: '다시', on: () => { t0s = -1; } },
    ] as Control[],
  };
}

/* ─────────────── i390 벽시계로 생각 끊기 ─────────────── */
function demo390() {
  let limit = 0.5;
  let slow = 6;
  const MAXT = 2.6;
  const CYC = 3.6;
  const base = 0.4 / 500; // 빠른 PC 에서 깊이 6 까지 0.4초
  const costs = (mult: number): number[] => {
    const a: number[] = [];
    for (let d = 1; d <= 8; d++) a.push(base * Math.pow(2.6, d) * mult);
    return a;
  };
  const depthCol = (d: number): string => ['#4f6bd8', '#5a7ee6', '#5f94f0', '#57aef2', '#4fc6e6', '#4fdcc6', '#62e6a2', '#9ae67a'][d - 1] ?? '#9ae67a';
  const row = (g: G, y: number, label: string, mult: number, mode: 'fixed' | 'limit', t: number, X: (s: number) => number): void => {
    txt(g, label, 12, y + 5, 5.8, C.text, 'left', 700);
    const cs = costs(mult);
    let acc = 0;
    let got = 0;
    let endT = 0;
    for (let d = 1; d <= 8; d++) {
      const c = cs[d - 1]!;
      if (mode === 'fixed' && d > 6) break;
      const s = acc;
      const e = acc + c;
      if (mode === 'limit' && s >= limit) break;
      if (mode === 'limit' && e > limit) {
        // 다 못 읽은 깊이 → 버림
        if (t > s) hatch(g, X(s), y, X(Math.min(limit, t)) - X(s), 10, 'rgba(160,170,200,0.6)');
        if (t >= limit) txt(g, `깊이 ${d} 버림`, X(limit) + 2, y + 5, 5, C.dim, 'left', 700);
        endT = limit;
        break;
      }
      const te = Math.min(e, t);
      if (te > s) block(g, X(s), y, X(te) - X(s), 10, depthCol(d), `${d}`);
      if (t >= e) got = d;
      acc = e;
      endT = e;
    }
    const finished = t >= endT;
    if (finished) {
      const late = endT > 1;
      const s = `${got}수 앞 · ${endT.toFixed(2)}초`;
      if (mode === 'fixed' || !(endT === limit)) {
        if (X(endT) + 52 < 268) pill(g, s, X(endT) + 3, y + 5, 5.4, late ? C.redD : '#1d6b52', late ? '#ffc2c8' : '#bdf7df');
        else pill(g, s, X(endT) - 2, y + 5, 5.4, late ? C.red : '#1d6b52', late ? '#fff' : '#bdf7df', 'right');
      }
      else pill(g, s, 268, y + 5, 5.4, '#1d6b52', '#bdf7df', 'right');
    }
  };
  return {
    draw(g: G, w: number, h: number, tt: number) {
      const t = Math.min(tt % CYC, MAXT);
      view(g, w, h);
      txt(g, '깊이 1 → 2 → 3 … 점점 깊게 읽기 (칸 = 깊이)', 8, 10, 7.2, C.text, 'left', 800);
      const sections: [number, Kind, 'fixed' | 'limit', string][] = [
        [21, 'bad', 'fixed', '깊이 고정 6수 — 느린 폰은 그만큼 오래'],
        [103, 'good', 'limit', `시간 상한 ${limit.toFixed(1)}초 — 느린 폰은 조금 얕게`],
      ];
      for (const [y, kind, mode, title] of sections) {
        panel(g, 6, y, 268, 66, kind);
        tag(g, 11, y + 8, kind === 'bad' ? '끔' : '켬', kind);
        txt(g, title, 25, y + 8.3, 6.4, C.text, 'left', 700);
        const x0 = 62;
        const x1 = 266;
        const X = (s: number): number => x0 + ((x1 - x0) * s) / MAXT;
        if (mode === 'limit') {
          g.fillStyle = 'rgba(61,220,151,0.07)';
          g.fillRect(x0, y + 15, X(limit) - x0, 33);
          dashV(g, X(limit), y + 14, y + 49, C.green);
          txt(g, '상한', X(limit) + 2, y + 46, 4.8, C.green, 'left', 800);
        }
        row(g, y + 17, '빠른 PC', 1, mode, t, X);
        row(g, y + 32, `느린 폰 ${slow}×`, slow, mode, t, X);
        axis(g, x0, x1, y + 50, MAXT, 0.5);
        playhead(g, X(t), y + 16, y + 50);
      }
      g.restore();
    },
    controls: [
      { type: 'range', label: '시간 상한 (초)', min: 0.2, max: 1.5, step: 0.1, value: limit, on: (v) => { limit = v; } },
      { type: 'range', label: '느린 폰 배수', min: 2, max: 8, step: 1, value: slow, on: (v) => { slow = v; } },
    ] as Control[],
  };
}

/* ─────────────── i391 고정 물체 합치기 ─────────────── */
interface MergeMeasure { callsA: number; callsB: number; msA: number; msB: number; objA: number; objB: number }
function mergeMeshes(meshes: THREE.Mesh[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  let off = 0;
  const v = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  for (const m of meshes) {
    m.updateMatrixWorld(true);
    nm.getNormalMatrix(m.matrixWorld);
    const geo = m.geometry;
    const p = geo.getAttribute('position');
    const n = geo.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
      pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      nor.push(v.x, v.y, v.z);
    }
    const ix = geo.getIndex();
    if (ix) for (let j = 0; j < ix.count; j++) idx.push(ix.getX(j) + off);
    off += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}
function measureMerge(): MergeMeasure {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const r = new THREE.WebGLRenderer({ canvas });
  r.setSize(256, 256, false);
  const gl = r.getContext();
  const px = new Uint8Array(4);
  const sync = (): void => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.2));
  const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  cam.position.set(0, 40, 40);
  cam.lookAt(0, 0, 0);
  const box = new THREE.BoxGeometry(0.8, 0.8, 0.8);
  const mats = Array.from({ length: 8 }, (_, i) => new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(i / 8, 0.6, 0.55) }));
  const meshes: THREE.Mesh[] = [];
  for (let i = 0; i < 1500; i++) {
    const m = new THREE.Mesh(box, mats[i % 8]!);
    m.position.set((i % 50) - 25, 0, Math.floor(i / 50) - 15);
    m.rotation.y = i * 0.3;
    meshes.push(m);
    scene.add(m);
  }
  const time = (): number => {
    r.render(scene, cam);
    sync();
    const t0 = now();
    for (let k = 0; k < 10; k++) r.render(scene, cam);
    sync();
    return (now() - t0) / 10;
  };
  const msA = time();
  r.render(scene, cam);
  const callsA = r.info.render.calls;
  for (const m of meshes) scene.remove(m);
  const merged: THREE.Mesh[] = [];
  for (let k = 0; k < 8; k++) {
    const mm = new THREE.Mesh(mergeMeshes(meshes.filter((_, i) => i % 8 === k)), mats[k]!);
    merged.push(mm);
    scene.add(mm);
  }
  const msB = time();
  r.render(scene, cam);
  const callsB = r.info.render.calls;
  box.dispose();
  for (const m of merged) m.geometry.dispose();
  for (const m of mats) m.dispose();
  r.dispose();
  r.forceContextLoss();
  return { callsA, callsB, msA, msB, objA: 1500, objB: 8 };
}
function demo391() {
  let res: MergeMeasure | null = null;
  let msg = '';
  const CYC = 3;
  const COLS = 20;
  const ROWS = 14;
  const N = COLS * ROWS;
  const matOf = (i: number): number => {
    const c = i % COLS;
    const r = Math.floor(i / COLS);
    return (Math.floor(c / 5) + Math.floor(r / 7) * 2) % 5;
  };
  const MC = ['#e8b36a', '#7fb4e8', '#86d68a', '#d98ac0', '#c9c2b0'];
  const grid = (g: G, x: number, y: number, cw: number, lit: (i: number) => number): void => {
    for (let i = 0; i < N; i++) {
      const cx = x + (i % COLS) * cw;
      const cy = y + Math.floor(i / COLS) * cw;
      const L = lit(i);
      const col = MC[matOf(i)]!;
      g.fillStyle = shade(col, 0.55 + L * 0.45);
      g.fillRect(cx, cy, cw - 0.7, cw - 0.7);
      g.fillStyle = 'rgba(255,255,255,0.16)';
      g.fillRect(cx, cy, cw - 0.7, 0.8);
      if (L > 0.6) {
        g.fillStyle = `rgba(255,255,255,${(L - 0.6) * 1.6})`;
        g.fillRect(cx, cy, cw - 0.7, cw - 0.7);
      }
    }
  };
  return {
    draw(g: G, w: number, h: number, tt: number) {
      const t = tt % CYC;
      const k = t / CYC;
      view(g, w, h, isBig(w) ? 194 : 175);
      txt(g, '움직이지 않는 메시를 같은 재질끼리 한 덩어리로', 8, 10, 7.2, C.text, 'left', 800);
      const cw = 5.6;
      const cols: [number, Kind][] = [[6, 'bad'], [142, 'good']];
      for (const [x, kind] of cols) {
        const bad = kind === 'bad';
        panel(g, x, 20, 132, 150, kind);
        tag(g, x + 5, 28, bad ? '끔' : '켬', kind);
        txt(g, bad ? '물체마다 따로 그리기' : '재질끼리 합쳐 그리기', x + 19, 28.3, 6.2, C.text, 'left', 700);
        const gx = x + (132 - COLS * cw) / 2;
        const gy = 38;
        if (bad) {
          const cur = Math.floor(k * N * 1.15);
          grid(g, gx, gy, cw, (i) => (i === cur ? 1 : i < cur ? 0.55 : 0.25 + 0.1 * Math.max(0, 1 - (cur - i) / 30)));
        } else {
          const groups = 5;
          const cur = Math.floor(k * groups * 1.4);
          grid(g, gx, gy, cw, (i) => (matOf(i) === cur ? 0.95 : matOf(i) < cur ? 0.6 : 0.3));
        }
        const tot0 = res ? (bad ? res.callsA : res.callsB) : bad ? 1500 : 80;
        const calls = Math.min(tot0, Math.floor(k * (bad ? 1.15 : 1.4) * tot0));
        const total = res ? (bad ? res.callsA : res.callsB) : bad ? 1500 : 80;
        txt(g, '그리기 호출', x + 8, 128, 6, C.dim, 'left', 700);
        txt(g, calls.toLocaleString(), x + 8, 142, 15, bad ? C.red : C.green, 'left', 900);
        txt(g, `/ ${total.toLocaleString()}`, x + 124, 144, 7, C.dim, 'right', 700);
        // CPU 막대
        rr(g, x + 8, 152, 116, 6, 3);
        g.fillStyle = '#232b4c';
        g.fill();
        rr(g, x + 8, 152, 116 * (bad ? 0.82 : 0.08), 6, 3);
        g.fillStyle = bad ? C.red : C.green;
        g.fill();
        const cpu = res ? `${(bad ? res.msA : res.msB).toFixed(2)}ms` : bad ? '약 7ms' : '약 0.6ms';
        txt(g, bad ? `장면 하나 CPU ${cpu}` : `CPU ${cpu} · 화질 그대로`, x + 8, 164, 5.4, bad ? '#ffb0b8' : '#a9f2d2', 'left', 700);
      }
      if (isBig(w)) resultStrip(g, msg || (res ? `실측 (상자 1,500개 · 재질 8) — 그리기 호출 ${res.callsA} → ${res.callsB} · 한 장면 CPU ${res.msA.toFixed(2)}ms → ${res.msB.toFixed(2)}ms` : '「진짜로 재기」 단추 → 이 기기에서 실제로 잰 값이 여기에 나와요'), !!res && !msg);
      g.restore();
    },
    controls: [
      {
        type: 'button', label: '진짜로 재기 (상자 1,500개)', on: () => {
          msg = '재는 중…';
          setTimeout(() => {
            try { res = measureMerge(); msg = ''; } catch { msg = '잴 수 없음 (WebGL)'; }
          }, 50);
        },
      },
    ] as Control[],
  };
}

/* ─────────────── i392 안 바뀌면 다시 그리지 않기 ─────────────── */
function demo392() {
  let every = 1.2;
  let cntA = 0;
  let cntB = 0;
  let stripA: number[] = [];
  let stripB: number[] = [];
  let score = 1240;
  let lastChange = 0;
  let lastKey = '';
  let flashB = 0;
  let clock = 0;
  const resetCnt = (): void => {
    cntA = 0;
    cntB = 0;
    stripA = [];
    stripB = [];
  };
  const hud = (g: G, x: number, y: number, flash: number): void => {
    rr(g, x, y, 112, 44, 6);
    g.fillStyle = '#0d1328';
    g.fill();
    txt(g, '점수', x + 8, y + 10, 6, C.dim, 'left', 700);
    txt(g, score.toLocaleString(), x + 8, y + 26, 15, '#fff', 'left', 900);
    for (let i = 0; i < 3; i++) {
      g.fillStyle = '#ff6b8a';
      const hx = x + 80 + i * 10;
      const hy = y + 12;
      g.beginPath();
      g.moveTo(hx, hy + 3);
      g.bezierCurveTo(hx - 4, hy - 1, hx - 1, hy - 4, hx, hy - 1);
      g.bezierCurveTo(hx + 1, hy - 4, hx + 4, hy - 1, hx, hy + 3);
      g.fill();
    }
    txt(g, '별 ★ 3', x + 8, y + 38, 6, C.amber, 'left', 700);
    if (flash > 0) {
      rr(g, x, y, 112, 44, 6);
      g.strokeStyle = `rgba(79,227,255,${flash})`;
      g.lineWidth = 1.6;
      g.stroke();
    }
  };
  return {
    draw(g: G, w: number, h: number, _t: number, dt: number) {
      clock += dt;
      if (clock - lastChange >= every) {
        lastChange = clock;
        score += 10 * (1 + Math.floor(Math.random() * 9));
      }
      // 왼쪽: 매 프레임 그림
      cntA++;
      stripA.push(1);
      // 오른쪽: 내용 열쇠가 바뀔 때만
      const key = String(score);
      const changed = key !== lastKey;
      if (changed) {
        lastKey = key;
        cntB++;
        flashB = 1;
      }
      stripB.push(changed ? 1 : 0);
      if (stripA.length > 120) stripA.shift();
      if (stripB.length > 120) stripB.shift();
      flashB = Math.max(0, flashB - dt * 2.5);
      view(g, w, h);
      txt(g, '같은 점수판 — 그릴 일이 있을 때만 그리기', 8, 10, 7.2, C.text, 'left', 800);
      const cols: [number, Kind][] = [[6, 'bad'], [142, 'good']];
      for (const [x, kind] of cols) {
        const bad = kind === 'bad';
        panel(g, x, 20, 132, 150, kind);
        tag(g, x + 5, 28, bad ? '끔' : '켬', kind);
        txt(g, bad ? '매 프레임 다시 그리기' : '바뀔 때만 (같은 HTML 이면 건너뜀)', x + 19, 28.3, 5.8, C.text, 'left', 700);
        hud(g, x + 10, 38, bad ? 0.55 + 0.25 * Math.sin(clock * 40) : flashB);
        txt(g, '최근 2초 — 칸마다 한 프레임', x + 10, 92, 5.4, C.dim, 'left', 600);
        const st = bad ? stripA : stripB;
        const sw = 112 / 60;
        for (let i = 0; i < 120; i++) {
          const v = st[st.length - 120 + i] ?? 0;
          const cx = x + 10 + (i % 60) * sw;
          const cy = 97 + Math.floor(i / 60) * 7;
          g.fillStyle = v ? (bad ? C.red : C.cyan) : '#232b4c';
          g.fillRect(cx, cy, sw - 0.4, 6);
        }
        txt(g, '다시 그린 횟수', x + 10, 121, 6, C.dim, 'left', 700);
        txt(g, (bad ? cntA : cntB).toLocaleString(), x + 10, 136, 15, bad ? C.red : C.green, 'left', 900);
        // 배터리
        const bx = x + 92;
        const by = 128;
        rr(g, bx, by, 26, 12, 2);
        g.strokeStyle = '#9aa3c0';
        g.lineWidth = 1;
        g.stroke();
        g.fillStyle = '#9aa3c0';
        g.fillRect(bx + 26, by + 4, 2, 4);
        const lvl = bad ? 0.35 + 0.1 * Math.sin(clock) : 0.9;
        g.fillStyle = bad ? C.red : C.green;
        g.fillRect(bx + 2, by + 2, 22 * lvl, 8);
        txt(g, bad ? 'CPU 늘 바쁨 · 배터리 닳음' : '가만히 있으면 쉬는 중 zZ', x + 10, 157, 5.8, bad ? '#ffb0b8' : '#a9f2d2', 'left', 700);
      }
      g.restore();
    },
    controls: [
      { type: 'range', label: '점수 바뀌는 간격 (초)', min: 0.3, max: 3, step: 0.1, value: every, on: (v) => { every = v; } },
      { type: 'button', label: '횟수 다시', on: () => resetCnt() },
    ] as Control[],
  };
}

/* ─────────────── i393 입력 줄 세우기 ─────────────── */
function demo393() {
  let think = 1.2;
  let tap = 0.6;
  const MAXT = 2.4;
  const CYC = 3.3;
  return {
    draw(g: G, w: number, h: number, tt: number) {
      const t = Math.min(tt % CYC, MAXT);
      view(g, w, h);
      txt(g, '컴퓨터가 생각하는 동안 누른 것을 버리지 않기', 8, 10, 7.2, C.text, 'left', 800);
      const lanes: [number, Kind][] = [[21, 'bad'], [103, 'good']];
      for (const [y, kind] of lanes) {
        const bad = kind === 'bad';
        const retap = Math.max(think + 0.65, tap + 0.6);
        const moveAt = bad ? retap : think + 0.05;
        const bars: Bar[] = [{ t0: 0, t1: think, row: 0, color: C.amber, label: '상대가 생각 중' }];
        if (!bad) bars.push({ t0: tap, t1: think, row: 1, color: C.cyan, label: '기억해 둠' });
        const X = ganttLane(g, y, kind, bad ? '잠긴 동안 누르면 무시' : '눌러 둔 것을 줄에 세워 두고 차례가 오면 바로', bars, t, MAXT);
        const taps = bad ? [tap, retap] : [tap];
        for (const tp of taps) {
          if (t < tp) continue;
          finger(g, X(tp), y + 40, 6);
        }
        if (bad && t >= tap) {
          txt(g, '✕ 무시됨', X(tap) + 5, y + 34, 6, C.red, 'left', 900);
          if (t >= retap) txt(g, '다시 누름', X(retap) - 4, y + 34, 5.4, '#ffb0b8', 'right', 700);
        }
        if (!bad && t >= tap && t < think) {
          pill(g, '상대가 생각 중이에요', X(tap) + 4, y + 43, 5.2, '#2b3560', '#cfe9ff');
        }
        dashV(g, X(moveAt), y + 15, y + 50, bad ? C.red : C.green);
        txt(g, `내 수 ${moveAt.toFixed(2)}초`, 268, y + 8.3, 7, bad ? C.red : C.green, 'right', 900);
        miniBoard(g, 16, y + 18, 42, 0, t >= think ? Math.min(1, (t - think) / 0.2) : 0, t < think, tt, t >= moveAt ? Math.min(1, (t - moveAt) / 0.2) : 0);
      }
      g.restore();
    },
    controls: [
      { type: 'range', label: '컴퓨터 생각 (초)', min: 0.6, max: 1.8, step: 0.1, value: think, on: (v) => { think = v; } },
      { type: 'range', label: '내가 누르는 때 (초)', min: 0.1, max: 1.0, step: 0.1, value: tap, on: (v) => { tap = v; } },
    ] as Control[],
  };
}

/* ─────────────── i394 긴 작업 찾기 (진짜 longtask) ─────────────── */
function demo394() {
  const frames: { t: number; d: number }[] = [];
  const longs: { s: number; d: number; real: boolean }[] = [];
  let lastNow = 0;
  let supported = false;
  let obs: PerformanceObserver | null = null;
  try {
    supported = (PerformanceObserver.supportedEntryTypes ?? []).includes('longtask');
    if (supported) {
      obs = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) longs.push({ s: e.startTime, d: e.duration, real: true });
      });
      obs.observe({ type: 'longtask', buffered: false });
    }
  } catch { supported = false; }
  const WIN = 5000;
  // 카드용 기록 재생 (실제 긴 작업이 없을 때)
  const REC = [{ at: 1.1, d: 180, why: '셰이더 컴파일' }, { at: 2.9, d: 70, why: '풀이표' }, { at: 3.9, d: 320, why: 'AI 생각 (메인)' }];
  const draw = (g: G, w: number, h: number, tt: number): void => {
    const tn = now();
    if (lastNow) frames.push({ t: tn, d: tn - lastNow });
    lastNow = tn;
    while (frames.length && frames[0]!.t < tn - WIN) frames.shift();
    while (longs.length && longs[0]!.s + longs[0]!.d < tn - WIN) longs.shift();
    const big = isBig(w);
    const realAny = longs.some((l) => l.real);
    const replay = !big && !realAny;
    view(g, w, h);
    txt(g, replay ? '프레임 그래프 + 긴 작업 (기록 재생)' : '이 브라우저 실측 — 최근 5초', 8, 10, 7.2, C.text, 'left', 800);
    pill(g, supported ? 'PerformanceObserver longtask' : 'longtask 지원 안 됨', 272, 10, 5.6, supported ? '#2b3560' : C.redD, supported ? C.cyan : '#ffc2c8', 'right');
    const x0 = 30;
    const x1 = 270;
    const X = (ms: number): number => x0 + ((x1 - x0) * (ms - (tn - WIN))) / WIN;
    // 프레임 그래프
    panel(g, 6, 20, 268, 92, 'none');
    txt(g, '프레임 시간', 12, 27, 6, C.text, 'left', 800);
    const gy = 34;
    const gh = 70;
    const maxMs = 400;
    const Y = (ms: number): number => gy + gh - (gh * Math.min(maxMs, ms)) / maxMs;
    for (const v of [16.7, 50, 200]) {
      g.strokeStyle = v === 50 ? 'rgba(255,93,108,0.5)' : 'rgba(140,149,180,0.25)';
      g.setLineDash([2, 2]);
      g.lineWidth = 0.6;
      g.beginPath();
      g.moveTo(x0, Y(v));
      g.lineTo(x1, Y(v));
      g.stroke();
      g.setLineDash([]);
      txt(g, `${v === 16.7 ? '16.7' : v}ms`, x0 - 2, Y(v), 4.8, v === 50 ? C.red : C.dim, 'right', 600);
    }
    let fl: { t: number; d: number }[] = frames;
    if (replay) {
      // 기록 재생: 5초짜리 흉내 흐름
      const cyc = 5;
      const ph = tt % cyc;
      fl = [];
      for (let s = 0; s < ph; s += 1 / 60) {
        let d = 16.7 + ((s * 977) % 3);
        let skip = false;
        for (const r of REC) {
          if (s >= r.at && s < r.at + 1 / 60) d = r.d;
          else if (s > r.at && s < r.at + r.d / 1000) skip = true;
        }
        if (!skip) fl.push({ t: tn - WIN + s * 1000 + (WIN - cyc * 1000), d });
      }
    }
    for (const f of fl) {
      const x = X(f.t);
      if (x < x0) continue;
      const bw = Math.max(0.6, ((x1 - x0) * Math.min(f.d, 100)) / WIN);
      g.fillStyle = f.d >= 50 ? C.red : f.d >= 20 ? C.amber : C.green;
      g.fillRect(x - bw, Y(f.d), bw, gy + gh - Y(f.d));
      if (f.d >= 50) txt(g, `${f.d.toFixed(0)}ms`, x, Y(f.d) - 3, 5.2, C.red, 'center', 800);
    }
    // 긴 작업 칸
    panel(g, 6, 116, 268, big ? 54 : 54, 'none');
    txt(g, '긴 작업 (50ms 넘는 일)', 12, 123, 6, C.text, 'left', 800);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    rr(g, x0, 130, x1 - x0, 14, 3);
    g.fill();
    let shown = 0;
    if (replay) {
      const ph = tt % 5;
      for (const r of REC) {
        if (ph < r.at) continue;
        const s = tn - WIN + r.at * 1000;
        const xa = X(s);
        const xb = Math.max(xa + 1.5, X(s + r.d));
        block(g, xa, 131, xb - xa, 12, C.red);
        txt(g, `${r.why} ${r.d}ms`, xa, 150, 5.2, '#ffb0b8', 'left', 700);
        shown++;
      }
    } else {
      for (const l of longs) {
        const xa = Math.max(x0, X(l.s));
        const xb = Math.max(xa + 1.5, X(l.s + l.d));
        block(g, xa, 131, xb - xa, 12, C.red);
        txt(g, `${l.d.toFixed(0)}ms`, xa, 150, 5.4, '#ffb0b8', 'left', 800);
        shown++;
      }
    }
    const worst = frames.reduce((m, f) => Math.max(m, f.d), 0);
    txt(g, replay ? '진짜로 재 보려면 크게 보기에서 「멈추기」 단추' : `잡힌 긴 작업 ${shown}개 · 가장 긴 프레임 ${worst.toFixed(0)}ms`, 12, 162, 5.8, replay ? C.dim : '#a9f2d2', 'left', 700);
    g.restore();
  };
  return {
    draw,
    controls: [
      { type: 'button', label: '0.3초 멈추기 (진짜 긴 작업)', on: () => busy(300) },
      { type: 'button', label: '0.08초 멈추기', on: () => busy(80) },
      { type: 'button', label: '40ms 열 번 (긴 작업 아님)', on: () => { let n = 0; const f = (): void => { busy(40); if (++n < 10) setTimeout(f, 30); }; f(); } },
    ] as Control[],
    dispose() { obs?.disconnect(); },
  };
}

/* ─────────────── i395 CPU 느리게 흉내 ─────────────── */
function demo395() {
  let work = 7;
  let fixed = 2;
  let auto = true;
  let showFix = false;
  const rows = [1, 4, 6];
  return {
    draw(g: G, w: number, h: number, tt: number) {
      const after = auto ? Math.floor(tt / 3.2) % 2 === 1 : showFix;
      const wk = after ? fixed : work;
      view(g, w, h);
      txt(g, '같은 장면을 CPU 1× · 4× · 6× 로', 8, 10, 7.2, C.text, 'left', 800);
      pill(g, after ? '고친 뒤 (물체 합치기 등)' : '고치기 전', 272, 10, 6.4, after ? '#22b07a' : C.red, '#fff', 'right');
      panel(g, 6, 20, 268, 150, after ? 'good' : 'bad');
      txt(g, '배수', 14, 29, 5.6, C.dim, 'left', 700);
      txt(g, '장면 (실제 프레임 수로 움직임)', 44, 29, 5.6, C.dim, 'left', 700);
      txt(g, '한 프레임 시간 (초록 선 = 16.7ms)', 128, 29, 5.6, C.dim, 'left', 700);
      for (let r = 0; r < rows.length; r++) {
        const mult = rows[r]!;
        const y = 36 + r * 44;
        const ms = Math.max(16.7, wk * mult + 2);
        const fps = Math.min(60, 1000 / ms);
        txt(g, `${mult}×`, 14, y + 18, 12, mult === 1 ? C.text : mult === 4 ? C.amber : C.red, 'left', 900);
        txt(g, mult === 1 ? 'PC' : mult === 4 ? '보통 폰' : '느린 폰', 14, y + 31, 5, C.dim, 'left', 600);
        // 장면: 풍차 + 튀는 공, fps 만큼 끊겨 움직임
        const sx = 44;
        rr(g, sx, y, 76, 38, 4);
        g.fillStyle = '#0a0e1c';
        g.fill();
        const tq = Math.floor(tt * fps) / fps;
        const cx = sx + 22;
        const cy = y + 19;
        g.fillStyle = '#3a4470';
        g.fillRect(cx - 1, cy, 2, 16);
        for (let b = 0; b < 4; b++) {
          const a = tq * 4 + (b * Math.PI) / 2;
          g.fillStyle = b % 2 ? C.amber : '#ffe1a0';
          g.beginPath();
          g.moveTo(cx, cy);
          g.lineTo(cx + Math.cos(a) * 12 - Math.sin(a) * 3, cy + Math.sin(a) * 12 + Math.cos(a) * 3);
          g.lineTo(cx + Math.cos(a) * 12, cy + Math.sin(a) * 12);
          g.closePath();
          g.fill();
        }
        const bp = (tq * 0.9) % 1;
        glowBall(g, sx + 46 + bp * 22, y + 32 - Math.abs(Math.sin(bp * Math.PI * 2)) * 20, 2.8, after ? C.green : mult === 1 ? C.green : C.red);
        // 프레임 시간 막대
        const bx = 128;
        const bw = 106;
        const full = 120;
        rr(g, bx, y + 6, bw, 12, 3);
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.fill();
        const wpx = (bw * Math.min(full, wk * mult)) / full;
        block(g, bx, y + 6, wpx, 12, after ? C.green : ms > 17 ? (ms > 33 ? C.red : C.amber) : C.green, `일 ${(wk * mult).toFixed(0)}ms`);
        const lx = bx + (bw * 16.7) / full;
        dashV(g, lx, y + 3, y + 21, C.green);
        txt(g, `${fps.toFixed(0)} fps`, 268, y + 12, 9, fps >= 59 ? C.green : fps >= 30 ? C.amber : C.red, 'right', 900);
        // 연속 프레임 띠
        const sw = 84 / 24;
        for (let i = 0; i < 24; i++) {
          const fx = bx + i * sw;
          const lit = Math.floor((tt * fps) % 24) === i;
          g.fillStyle = lit ? '#fff' : fps >= 59 ? '#1d6b52' : fps >= 30 ? '#6b5320' : C.redD;
          g.fillRect(fx, y + 24, sw - 0.8, 6);
        }
        txt(g, `대기 ${(ms).toFixed(0)}ms/프레임`, 268, y + 27, 5.2, C.dim, 'right', 600);
      }
      g.restore();
    },
    controls: [
      { type: 'toggle', label: '저절로 바꿔 보기', value: auto, on: (v) => { auto = v; } },
      { type: 'toggle', label: '고친 뒤 (자동 끄면)', value: showFix, on: (v) => { showFix = v; } },
      { type: 'range', label: '고치기 전 장면 일 (PC ms)', min: 2, max: 16, step: 1, value: work, on: (v) => { work = v; } },
      { type: 'range', label: '고친 뒤 장면 일 (PC ms)', min: 0.5, max: 6, step: 0.5, value: fixed, on: (v) => { fixed = v; } },
    ] as Control[],
  };
}

export const DEMOS: DemoMap = {
  i384: { kind: '2d', caption: '흉내 12fps — 위(옛 방식)는 공이 느려져 슬로모션, 아래(시간 조각)는 제시간에 도착', make: demo384 },
  i385: { kind: '2d', caption: '첫 폭발 때 셰이더 컴파일로 멈칫 vs 불러오는 동안 미리 그려 두기 — 프레임 그래프의 빨간 막대 위치', make: demo385 },
  i386: { kind: '2d', caption: '첫 터치 때 소리 장치를 만들면 멈칫 · 소리 늦음 vs 카드 누를 때 미리 깨우기', make: demo386 },
  i387: { kind: '2d', caption: '풀이표 한 번에 = 0.4초 프레임 0장(멈춤) vs 10ms 조각 = 60fps 그대로 진행', make: demo387 },
  i388: { kind: '2d', caption: '말 이동 0.6 + 대기 0.7 = 1.3초 vs 겹쳐 세면 0.7초', make: demo388 },
  i389: { kind: '2d', caption: '이동 끝난 뒤 계산하면 체감 대기 0.9초 vs 이동과 동시에 계산하면 0.3초', make: demo389 },
  i390: { kind: '2d', caption: '깊이 고정이면 느린 폰은 2.4초 기다림 vs 시간 상한이면 0.5초에 조금 얕게', make: demo390 },
  i391: { kind: '2d', caption: '물체 하나씩 그리기 1,500번 vs 재질끼리 합쳐 80번 — 화질은 그대로', make: demo391 },
  i392: { kind: '2d', caption: '매 프레임 다시 그리기 vs 점수가 바뀔 때만 — 아래 띠가 그린 프레임', make: demo392 },
  i393: { kind: '2d', caption: '컴퓨터 차례에 누르면 무시되어 다시 눌러야 함 vs 기억해 두었다가 차례가 오자마자', make: demo393 },
  i394: { kind: '2d', caption: '프레임 시간 그래프 + PerformanceObserver 로 잡은 50ms 넘는 긴 작업', make: demo394 },
  i395: { kind: '2d', caption: '같은 장면을 CPU 1× · 4× · 6× 로 — 고치기 전/후 fps 비교', make: demo395 },
};

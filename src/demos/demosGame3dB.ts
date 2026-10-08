import * as THREE from 'three';
import type { Control, DemoMap, Scene3D } from './types';

/**
 * 견본 — 3D 게임 기본기 (B)
 *  i484 전투 판정 (휘두르기 궤적 쓸기 · 히트스톱 · 넉백 · 숫자)
 *  i485 천 시뮬레이션 (베를레 망토 · 성벽 깃발)
 *  i486 부서지는 물체 (보로노이 조각 — 볼록 다면체 자르기)
 *  i487 시야와 안개 (지금 보임 · 가 본 곳 · 모름)
 * 모두 쿼터뷰 던전 + 따뜻한 횃불 빛 + 그림자. 셰이더는 compileAsync 로 미리 굽고 나서 그린다.
 * 그림 캔버스(돌 · 벽돌 · 나무 …)는 모듈에 한 번만 그려 두고 돌려 쓴다 (make 를 빠르게).
 */

const FONT = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const ease = (k: number): number => {
  const x = clamp(k, 0, 1);
  return x * x * (3 - 2 * x);
};
const easeOut = (k: number): number => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/* ───────────── 그림 캔버스 (모듈 캐시) ───────────── */

type Paint = (g: CanvasRenderingContext2D, w: number, h: number, R: () => number) => void;
const CANVAS = new Map<string, HTMLCanvasElement>();
function canvasOf(key: string, w: number, h: number, paint: Paint): HTMLCanvasElement {
  let c = CANVAS.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    paint(c.getContext('2d')!, w, h, rng(key.length * 7919 + key.charCodeAt(0) * 31));
    CANVAS.set(key, c);
  }
  return c;
}
function texOf(key: string, w: number, h: number, paint: Paint, rx = 1, ry = 1): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvasOf(key, w, h, paint));
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.repeat.set(rx, ry);
  return t;
}
const hsl = (h: number, s: number, l: number, a = 1): string => `hsla(${h},${s}%,${l}%,${a})`;

const paintFloor: Paint = (g, w, h, R) => {
  g.fillStyle = '#16130f';
  g.fillRect(0, 0, w, h);
  const n = 4;
  const s = w / n;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const x0 = x * s + 3;
      const y0 = y * s + 3;
      const ss = s - 6;
      const l = 24 + R() * 9;
      g.fillStyle = hsl(28 + R() * 14, 9 + R() * 6, l);
      g.beginPath();
      g.roundRect(x0, y0, ss, ss, 5);
      g.fill();
      // 윗면 볕 · 아래 그늘
      const gr = g.createLinearGradient(x0, y0, x0 + ss, y0 + ss);
      gr.addColorStop(0, 'rgba(255,240,215,0.10)');
      gr.addColorStop(0.5, 'rgba(0,0,0,0)');
      gr.addColorStop(1, 'rgba(0,0,0,0.22)');
      g.fillStyle = gr;
      g.fill();
      for (let i = 0; i < 70; i++) {
        g.fillStyle = R() < 0.5 ? 'rgba(0,0,0,0.16)' : 'rgba(255,235,200,0.07)';
        const r = 0.6 + R() * 1.8;
        g.fillRect(x0 + R() * ss, y0 + R() * ss, r, r);
      }
      if (R() < 0.35) {
        g.strokeStyle = 'rgba(0,0,0,0.35)';
        g.lineWidth = 1.2;
        g.beginPath();
        let px = x0 + R() * ss;
        let py = y0 + R() * ss;
        g.moveTo(px, py);
        for (let k = 0; k < 4; k++) {
          px += (R() - 0.5) * 22;
          py += (R() - 0.5) * 22;
          g.lineTo(clamp(px, x0, x0 + ss), clamp(py, y0, y0 + ss));
        }
        g.stroke();
      }
    }
};
const paintBrick: Paint = (g, w, h, R) => {
  g.fillStyle = '#141110';
  g.fillRect(0, 0, w, h);
  const rows = 6;
  const rh = h / rows;
  for (let r = 0; r < rows; r++) {
    const cols = 3;
    const cw = w / cols;
    const off = r % 2 ? cw / 2 : 0;
    for (let c = -1; c < cols + 1; c++) {
      const x0 = c * cw + off + 3;
      const y0 = r * rh + 3;
      const ww = cw - 6;
      const hh = rh - 6;
      g.fillStyle = hsl(24 + R() * 16, 8 + R() * 8, 22 + R() * 10);
      g.beginPath();
      g.roundRect(x0, y0, ww, hh, 4);
      g.fill();
      const gr = g.createLinearGradient(0, y0, 0, y0 + hh);
      gr.addColorStop(0, 'rgba(255,235,210,0.12)');
      gr.addColorStop(1, 'rgba(0,0,0,0.25)');
      g.fillStyle = gr;
      g.fill();
      for (let i = 0; i < 16; i++) {
        g.fillStyle = R() < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,230,200,0.06)';
        g.fillRect(x0 + R() * ww, y0 + R() * hh, 1 + R() * 2, 1 + R() * 2);
      }
    }
  }
};
const paintCrate: Paint = (g, w, h, R) => {
  const planks = 5;
  const pw = w / planks;
  for (let i = 0; i < planks; i++) {
    g.fillStyle = hsl(27 + R() * 6, 48 + R() * 10, 34 + R() * 8);
    g.fillRect(i * pw, 0, pw, h);
    for (let k = 0; k < 9; k++) {
      g.strokeStyle = R() < 0.5 ? 'rgba(60,30,10,0.35)' : 'rgba(255,220,170,0.12)';
      g.lineWidth = 1 + R() * 1.5;
      g.beginPath();
      const x = i * pw + 4 + R() * (pw - 8);
      g.moveTo(x, 0);
      for (let y = 0; y <= h; y += 16) g.lineTo(x + Math.sin(y * 0.05 + k) * 2.5, y);
      g.stroke();
    }
    g.fillStyle = 'rgba(30,14,4,0.6)';
    g.fillRect(i * pw, 0, 2.5, h);
  }
  // 테 (두꺼운 판)
  const b = w * 0.13;
  g.fillStyle = '#5a3417';
  g.fillRect(0, 0, w, b);
  g.fillRect(0, h - b, w, b);
  g.fillRect(0, 0, b, h);
  g.fillRect(w - b, 0, b, h);
  g.strokeStyle = 'rgba(255,210,150,0.18)';
  g.lineWidth = 2;
  g.strokeRect(b, b, w - 2 * b, h - 2 * b);
  g.strokeStyle = 'rgba(20,8,2,0.6)';
  g.strokeRect(1, 1, w - 2, h - 2);
  // 대각 버팀
  g.save();
  g.translate(w / 2, h / 2);
  g.rotate(-Math.PI / 4);
  g.fillStyle = '#6b3f1d';
  g.fillRect(-w * 0.62, -b * 0.42, w * 1.24, b * 0.84);
  g.restore();
  g.fillStyle = '#c9c4b8';
  for (const [x, y] of [
    [b / 2, b / 2],
    [w - b / 2, b / 2],
    [b / 2, h - b / 2],
    [w - b / 2, h - b / 2],
  ] as const) {
    g.beginPath();
    g.arc(x, y, 4, 0, TAU);
    g.fill();
  }
};
const paintPot: Paint = (g, w, h, R) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#c97848');
  gr.addColorStop(1, '#9e4f2b');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 400; i++) {
    g.fillStyle = R() < 0.5 ? 'rgba(80,30,10,0.12)' : 'rgba(255,210,170,0.08)';
    g.fillRect(R() * w, R() * h, 1 + R() * 2, 1 + R() * 2);
  }
  // 띠 무늬 (위 · 아래) + 지그재그
  const band = (y: number, hh: number): void => {
    g.fillStyle = '#3b1d10';
    g.fillRect(0, y, w, hh);
    g.strokeStyle = '#e9b778';
    g.lineWidth = 3;
    g.beginPath();
    const n = 12;
    for (let i = 0; i <= n * 2; i++) g.lineTo((i / (n * 2)) * w, y + (i % 2 ? hh * 0.2 : hh * 0.8));
    g.stroke();
  };
  band(h * 0.22, h * 0.1);
  band(h * 0.66, h * 0.07);
  g.fillStyle = '#3b1d10';
  for (let i = 0; i < 8; i++) {
    g.beginPath();
    g.arc((i + 0.5) * (w / 8), h * 0.47, 6, 0, TAU);
    g.fill();
  }
};
const paintPillar: Paint = (g, w, h, R) => {
  g.fillStyle = '#25262b';
  g.fillRect(0, 0, w, h);
  const rows = 6;
  const rh = h / rows;
  for (let r = 0; r < rows; r++) {
    const cols = 2;
    const cw = w / cols;
    const off = r % 2 ? cw / 2 : 0;
    for (let c = -1; c <= cols; c++) {
      const x0 = c * cw + off + 2;
      const y0 = r * rh + 2;
      g.fillStyle = hsl(215 + R() * 25, 7 + R() * 8, 55 + R() * 12);
      g.fillRect(x0, y0, cw - 4, rh - 4);
      const gg = g.createLinearGradient(0, y0, 0, y0 + rh);
      gg.addColorStop(0, 'rgba(255,255,255,0.10)');
      gg.addColorStop(1, 'rgba(0,0,0,0.22)');
      g.fillStyle = gg;
      g.fillRect(x0, y0, cw - 4, rh - 4);
      for (let i = 0; i < 30; i++) {
        g.fillStyle = R() < 0.5 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.07)';
        g.fillRect(x0 + R() * (cw - 4), y0 + R() * (rh - 4), 1 + R() * 2, 1 + R() * 2);
      }
    }
  }
};
/** 쪼갠 안쪽 면 — 회색 결 (재질 색이 곱해진다) */
const paintChip: Paint = (g, w, h, R) => {
  g.fillStyle = '#d8d4cc';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) {
    const l = 60 + R() * 40;
    g.fillStyle = `hsla(30,6%,${l}%,0.5)`;
    const r = 0.8 + R() * 2.6;
    g.fillRect(R() * w, R() * h, r, r);
  }
};
const paintFlame: Paint = (g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h * 0.68, 0, w / 2, h * 0.62, w * 0.5);
  gr.addColorStop(0, 'rgba(255,255,235,1)');
  gr.addColorStop(0.18, 'rgba(255,220,120,0.95)');
  gr.addColorStop(0.45, 'rgba(255,120,30,0.55)');
  gr.addColorStop(1, 'rgba(255,60,0,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(w / 2, 0);
  g.bezierCurveTo(w * 0.82, h * 0.4, w * 0.95, h * 0.95, w / 2, h);
  g.bezierCurveTo(w * 0.05, h * 0.95, w * 0.18, h * 0.4, w / 2, 0);
  g.fill();
};
const paintGlow: Paint = (g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
};
/** 네 갈래 반짝 (맞은 자리 번쩍) */
const paintStar: Paint = (g, w, h) => {
  const cx = w / 2;
  const cy = h / 2;
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, w / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.15, 'rgba(255,250,220,0.8)');
  gr.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = gr;
  for (let k = 0; k < 4; k++) {
    g.save();
    g.translate(cx, cy);
    g.rotate((k * Math.PI) / 4);
    g.beginPath();
    const L = k % 2 ? w * 0.32 : w * 0.5;
    g.moveTo(-L, 0);
    g.quadraticCurveTo(0, w * 0.035, L, 0);
    g.quadraticCurveTo(0, -w * 0.035, -L, 0);
    g.fill();
    g.restore();
  }
  g.beginPath();
  g.arc(cx, cy, w * 0.12, 0, TAU);
  g.fill();
};
const paintCapeFront: Paint = (g, w, h, R) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#8c1622');
  gr.addColorStop(1, '#a8222c');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = R() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,200,200,0.05)';
    g.fillRect(R() * w, R() * h, 1, 2 + R() * 3);
  }
  // 금실 테두리
  g.fillStyle = '#d9a441';
  g.fillRect(0, h - 26, w, 12);
  g.fillRect(0, 0, 9, h);
  g.fillRect(w - 9, 0, 9, h);
  g.fillStyle = '#f2cf7a';
  g.fillRect(0, h - 22, w, 3);
  for (let x = 6; x < w; x += 18) {
    g.beginPath();
    g.moveTo(x, h - 14);
    g.lineTo(x + 6, h - 4);
    g.lineTo(x + 12, h - 14);
    g.fill();
  }
  // 문장 (방패 + 별)
  const cx = w / 2;
  const cy = h * 0.42;
  g.fillStyle = '#d9a441';
  g.beginPath();
  g.moveTo(cx - 42, cy - 44);
  g.lineTo(cx + 42, cy - 44);
  g.lineTo(cx + 42, cy + 4);
  g.quadraticCurveTo(cx + 40, cy + 40, cx, cy + 58);
  g.quadraticCurveTo(cx - 40, cy + 40, cx - 42, cy + 4);
  g.closePath();
  g.fill();
  g.fillStyle = '#1f2f6b';
  g.beginPath();
  g.moveTo(cx - 34, cy - 36);
  g.lineTo(cx + 34, cy - 36);
  g.lineTo(cx + 34, cy + 2);
  g.quadraticCurveTo(cx + 32, cy + 33, cx, cy + 48);
  g.quadraticCurveTo(cx - 32, cy + 33, cx - 34, cy + 2);
  g.closePath();
  g.fill();
  g.fillStyle = '#f2cf7a';
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 9 : 22;
    g.lineTo(cx + Math.cos(a) * r, cy + 2 + Math.sin(a) * r);
  }
  g.fill();
};
const paintCapeBack: Paint = (g, w, h) => {
  g.fillStyle = '#1b2348';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(160,180,255,0.16)';
  g.lineWidth = 2;
  for (let i = -h; i < w + h; i += 28) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + h, h);
    g.stroke();
    g.beginPath();
    g.moveTo(i, h);
    g.lineTo(i + h, 0);
    g.stroke();
  }
  g.fillStyle = '#c8962f';
  g.fillRect(0, h - 22, w, 8);
};
const paintFlag: Paint = (g, w, h) => {
  g.fillStyle = '#1e4fa8';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#f4f0e4';
  g.beginPath();
  g.moveTo(0, h * 0.34);
  g.lineTo(w * 0.55, h * 0.5);
  g.lineTo(0, h * 0.66);
  g.fill();
  g.fillStyle = '#e8b54a';
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? h * 0.08 : h * 0.19;
    g.lineTo(w * 0.72 + Math.cos(a) * r, h * 0.5 + Math.sin(a) * r);
  }
  g.fill();
  g.fillStyle = '#e8b54a';
  g.fillRect(0, 0, w, h * 0.06);
  g.fillRect(0, h * 0.94, w, h * 0.06);
};

/* ───────────── 정리 묶음 · 그리기 · 글씨 층 ───────────── */

class Bin {
  private list: { dispose(): void }[] = [];
  add<T extends { dispose(): void }>(x: T): T {
    this.list.push(x);
    return x;
  }
  dispose(): void {
    for (const x of this.list) x.dispose();
    this.list.length = 0;
  }
}

const TMP_C = new THREE.Color();
/** 그림자를 켜고 그린다. 처음엔 compileAsync 로 셰이더를 다 굽고 나서부터 그린다 (멈춤 없음) */
class Painter {
  compiled = false;
  private compiling = false;
  constructor(private bg: number) {}
  draw(r: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.Camera, hud?: Hud): void {
    const se = r.shadowMap.enabled;
    const st = r.shadowMap.type;
    const ac = r.autoClear;
    r.getClearColor(TMP_C);
    const cc = TMP_C.getHex();
    const ca = r.getClearAlpha();
    try {
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFShadowMap;
      r.setClearColor(this.bg, 1);
      if (!this.compiled) {
        if (!this.compiling) {
          this.compiling = true;
          const all: Promise<unknown>[] = [r.compileAsync(scene, cam)];
          if (hud) all.push(r.compileAsync(hud.scene, hud.cam));
          Promise.all(all)
            .catch(() => undefined)
            .finally(() => {
              this.compiled = true;
            });
        }
        r.clear();
        return;
      }
      r.render(scene, cam);
      if (hud) hud.render(r);
    } finally {
      r.shadowMap.enabled = se;
      r.shadowMap.type = st;
      r.autoClear = ac;
      r.setClearColor(cc, ca);
    }
  }
}

const TMP_V2 = new THREE.Vector2();
/** 화면 위 글씨 층 — 캔버스 한 장을 바뀔 때만 다시 그려 올린다. 픽셀 좌표 메시(minimap 등)도 scene 에 넣을 수 있다 */
class Hud {
  readonly scene = new THREE.Scene();
  readonly cam = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10);
  private cv = document.createElement('canvas');
  private g = this.cv.getContext('2d')!;
  private tex: THREE.CanvasTexture;
  private mat: THREE.MeshBasicMaterial;
  private quad: THREE.Mesh;
  private geo = new THREE.PlaneGeometry(1, 1);
  w = 0;
  h = 0;
  dirty = true;
  onResize?: (w: number, h: number) => void;
  constructor(private paint: (g: CanvasRenderingContext2D, w: number, h: number, u: number) => void) {
    this.cv.width = this.cv.height = 2;
    this.tex = this.makeTex();
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    this.quad = new THREE.Mesh(this.geo, this.mat);
    this.quad.renderOrder = 20;
    this.scene.add(this.quad);
  }
  private makeTex(): THREE.CanvasTexture {
    const t = new THREE.CanvasTexture(this.cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    return t;
  }
  render(r: THREE.WebGLRenderer): void {
    r.getSize(TMP_V2);
    const w = Math.max(2, Math.round(TMP_V2.x));
    const h = Math.max(2, Math.round(TMP_V2.y));
    if (w !== this.w || h !== this.h) {
      this.w = w;
      this.h = h;
      this.cv.width = w;
      this.cv.height = h;
      this.tex.dispose();
      this.tex = this.makeTex();
      this.mat.map = this.tex;
      this.cam.right = w;
      this.cam.top = h;
      this.cam.updateProjectionMatrix();
      this.quad.scale.set(w, h, 1);
      this.quad.position.set(w / 2, h / 2, 0);
      this.onResize?.(w, h);
      this.dirty = true;
    }
    if (this.dirty) {
      this.g.setTransform(1, 0, 0, 1, 0, 0);
      this.g.clearRect(0, 0, w, h);
      const u0 = Math.min(w / 280, h / 175);
      this.paint(this.g, w, h, u0 <= 1 ? u0 : 1 + (u0 - 1) * 0.4);
      this.tex.needsUpdate = true;
      this.dirty = false;
    }
    r.autoClear = false;
    r.clearDepth();
    r.render(this.scene, this.cam);
  }
  dispose(): void {
    this.tex.dispose();
    this.mat.dispose();
    this.geo.dispose();
  }
}
/** 둥근 판 글씨 */
function tag(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left', bg = 'rgba(12,10,18,0.62)'): number {
  g.font = `800 ${size}px ${FONT}`;
  const tw = g.measureText(s).width;
  const pw = tw + size * 1.1;
  const ph = size * 1.65;
  const x0 = align === 'center' ? x - pw / 2 : align === 'right' ? x - pw : x;
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(x0, y - ph / 2, pw, ph, ph / 2);
  g.fill();
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(s, x0 + pw / 2, y + size * 0.05);
  return pw;
}

/* ───────────── 던전 무대 ───────────── */

interface Torch {
  flame: THREE.Sprite;
  halo: THREE.Sprite;
  light: THREE.PointLight;
  ph: number;
  base: number;
}
interface Stage {
  scene: THREE.Scene;
  cam: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  torches: Torch[];
  bin: Bin;
  flameMat: THREE.SpriteMaterial;
  haloMat: THREE.SpriteMaterial;
  tick(t: number): void;
}
interface StageOpt {
  w: number;
  d: number;
  wallH: number;
  torches: [number, number][]; // 벽 앞 x 자리 (높이 · 세기)
  cam: [number, number, number];
  look: [number, number, number];
  fov: number;
  shadow: number;
  crenel?: boolean;
  noWall?: boolean;
  noFloor?: boolean;
}
function torchAt(st: Stage, x: number, y: number, z: number, base: number, ph: number, iron: THREE.Material, wood: THREE.Material, geos: THREE.BufferGeometry[]): Torch {
  const grp = new THREE.Group();
  grp.position.set(x, y, z);
  const br = new THREE.Mesh(geos[0], iron);
  br.position.set(0, -0.12, -0.08);
  br.castShadow = true;
  const stick = new THREE.Mesh(geos[1], wood);
  stick.rotation.x = 0.35;
  stick.position.set(0, -0.02, 0.02);
  stick.castShadow = true;
  const cup = new THREE.Mesh(geos[2], iron);
  cup.position.set(0, 0.17, 0.08);
  grp.add(br, stick, cup);
  const flame = new THREE.Sprite(st.flameMat);
  flame.position.set(0, 0.36, 0.1);
  flame.scale.set(0.26, 0.4, 1);
  const halo = new THREE.Sprite(st.haloMat);
  halo.position.set(0, 0.33, 0.1);
  halo.scale.set(1.1, 1.1, 1);
  grp.add(halo, flame);
  const light = new THREE.PointLight(0xff9a48, base, 9, 1.6);
  light.position.set(0, 0.4, 0.45);
  grp.add(light);
  st.scene.add(grp);
  return { flame, halo, light, ph, base };
}
function makeStage(o: StageOpt): Stage {
  const bin = new Bin();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b090e);
  const cam = new THREE.PerspectiveCamera(o.fov, 1.6, 0.1, 80);
  cam.position.set(...o.cam);
  cam.lookAt(...o.look);
  const floorTex = bin.add(texOf('floor', 512, 512, paintFloor, o.w / 3, o.d / 3));
  const floor = new THREE.Mesh(bin.add(new THREE.PlaneGeometry(o.w, o.d)), bin.add(new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.92 })));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  if (!o.noFloor) scene.add(floor);
  const flameMat = bin.add(new THREE.SpriteMaterial({ map: bin.add(texOf('flame', 64, 96, paintFlame)), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
  const haloMat = bin.add(new THREE.SpriteMaterial({ map: bin.add(texOf('glow', 64, 64, paintGlow)), color: 0xff8a30, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
  const hemi = new THREE.HemisphereLight(0x9aa2c8, 0x2c2118, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffdcb8, 1.9);
  sun.position.set(-4, 10, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -o.shadow;
  sc.right = sc.top = o.shadow;
  sc.near = 1;
  sc.far = 30;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 2.5;
  scene.add(sun, sun.target);
  const st: Stage = { scene, cam, sun, torches: [], bin, flameMat, haloMat, tick: () => undefined };
  if (!o.noWall) {
    const bt = bin.add(texOf('brick', 512, 512, paintBrick, o.w / 2.4, o.wallH / 1.2));
    const wm = bin.add(new THREE.MeshStandardMaterial({ map: bt, roughness: 0.9 }));
    const wall = new THREE.Mesh(bin.add(new THREE.BoxGeometry(o.w, o.wallH, 0.7)), wm);
    wall.position.set(0, o.wallH / 2, -o.d / 2 + 0.35);
    wall.receiveShadow = wall.castShadow = true;
    scene.add(wall);
    // 걸레받이 돌 띠
    const cap = new THREE.Mesh(bin.add(new THREE.BoxGeometry(o.w, 0.16, 0.86)), bin.add(new THREE.MeshStandardMaterial({ color: 0x4a443e, roughness: 0.85 })));
    cap.position.set(0, o.wallH + 0.08, -o.d / 2 + 0.35);
    cap.receiveShadow = cap.castShadow = true;
    scene.add(cap);
    if (o.crenel) {
      const mg = bin.add(new THREE.BoxGeometry(0.62, 0.5, 0.7));
      for (let x = -o.w / 2 + 0.5; x < o.w / 2; x += 1.3) {
        const m = new THREE.Mesh(mg, wm);
        m.position.set(x, o.wallH + 0.41, -o.d / 2 + 0.35);
        m.castShadow = m.receiveShadow = true;
        scene.add(m);
      }
    }
    const iron = bin.add(new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.5, metalness: 0.6 }));
    const wood = bin.add(new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.8 }));
    const geos = [bin.add(new THREE.BoxGeometry(0.1, 0.22, 0.12)), bin.add(new THREE.CylinderGeometry(0.035, 0.03, 0.42, 8)), bin.add(new THREE.CylinderGeometry(0.09, 0.05, 0.1, 10))];
    o.torches.forEach(([x, base], i) => {
      st.torches.push(torchAt(st, x, Math.min(1.5, o.wallH * 0.62), -o.d / 2 + 0.78, base, i * 1.7, iron, wood, geos));
    });
  }
  st.tick = (t: number) => {
    for (const tc of st.torches) {
      const f = 0.86 + 0.09 * Math.sin(t * 13 + tc.ph) + 0.06 * Math.sin(t * 31 + tc.ph * 2.3) + 0.04 * Math.sin(t * 5.3 + tc.ph);
      tc.light.intensity = tc.base * f;
      tc.flame.scale.set(0.24 + 0.03 * Math.sin(t * 17 + tc.ph), 0.36 * f + 0.05, 1);
      tc.halo.material.opacity = 0.3;
    }
  };
  return st;
}

/* ───────────── 점토 기사 · 슬라임 ───────────── */

interface Knight {
  g: THREE.Group;
  body: THREE.Group;
  /** 칼 휘두르는 축 (기사 안 좌표 PIVOT) — rotation.order 'YZX', y = 수평 각, z = 칼 들기 */
  pivot: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
}
const PIVOT = new THREE.Vector3(0, 0.95, 0.1);
const BLADE0 = 0.58;
const BLADE1 = 1.6;
function makeKnight(bin: Bin, tunic = 0x2f5fb8, plume = 0xd8313b): Knight {
  const M = (c: number, rough = 0.6, metal = 0): THREE.MeshStandardMaterial => bin.add(new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal }));
  const steel = M(0xc5ccd8, 0.34, 0.45);
  const dark = M(0x1b1d24, 0.6);
  const cloth = M(tunic, 0.75);
  const gold = M(0xe2b04a, 0.32, 0.6);
  const leather = M(0x5b3a22, 0.72);
  const red = M(plume, 0.7);
  const blade = M(0xeef3fa, 0.16, 0.5);
  const G = <T extends THREE.BufferGeometry>(x: T): T => bin.add(x);
  const put = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const leg = (z: number): THREE.Group => {
    const hip = new THREE.Group();
    hip.position.set(0, 0.5, z);
    put(G(new THREE.CapsuleGeometry(0.1, 0.22, 4, 10)), steel, 0, -0.2, 0, hip);
    put(G(new THREE.BoxGeometry(0.27, 0.12, 0.16)), leather, 0.04, -0.43, 0, hip);
    body.add(hip);
    return hip;
  };
  const legL = leg(-0.13);
  const legR = leg(0.13);
  put(G(new THREE.CapsuleGeometry(0.25, 0.28, 6, 14)), cloth, 0, 0.86, 0, body);
  put(G(new THREE.CylinderGeometry(0.26, 0.32, 0.24, 16)), cloth, 0, 0.6, 0, body);
  put(G(new THREE.SphereGeometry(0.24, 18, 12)), steel, 0.06, 0.94, 0, body).scale.set(0.78, 1, 1.06);
  put(G(new THREE.CylinderGeometry(0.268, 0.268, 0.06, 18)), leather, 0, 0.71, 0, body);
  put(G(new THREE.BoxGeometry(0.05, 0.08, 0.09)), gold, 0.27, 0.71, 0, body);
  // 투구
  put(G(new THREE.SphereGeometry(0.22, 22, 16)), steel, 0, 1.33, 0, body);
  put(G(new THREE.CylinderGeometry(0.235, 0.235, 0.05, 22)), steel, 0, 1.24, 0, body);
  put(G(new THREE.BoxGeometry(0.05, 0.035, 0.27)), dark, 0.205, 1.32, 0, body);
  put(G(new THREE.BoxGeometry(0.035, 0.13, 0.035)), steel, 0.222, 1.3, 0, body);
  const crest = put(G(new THREE.TorusGeometry(0.17, 0.05, 8, 18, Math.PI)), red, 0, 1.4, 0, body);
  crest.scale.set(1, 1.15, 0.8);
  // 어깨 · 왼팔 · 방패
  for (const z of [-0.28, 0.28]) put(G(new THREE.SphereGeometry(0.13, 14, 10)), steel, 0, 1.08, z, body).scale.set(1, 0.75, 1);
  put(G(new THREE.CapsuleGeometry(0.075, 0.22, 4, 10)), steel, 0.03, 0.85, -0.31, body);
  const shield = put(G(new THREE.CylinderGeometry(0.27, 0.27, 0.05, 26)), cloth, 0.07, 0.84, -0.39, body);
  shield.rotation.x = Math.PI / 2;
  const rim = put(G(new THREE.TorusGeometry(0.27, 0.025, 8, 30)), gold, 0.07, 0.84, -0.39, body);
  rim.rotation.y = 0;
  put(G(new THREE.SphereGeometry(0.06, 12, 8)), gold, 0.07, 0.84, -0.42, body);
  // 오른팔 + 칼 (축)
  const pivot = new THREE.Group();
  pivot.rotation.order = 'YZX';
  pivot.position.copy(PIVOT);
  body.add(pivot);
  const arm = put(G(new THREE.CapsuleGeometry(0.075, 0.26, 4, 10)), steel, 0.2, 0, 0, pivot);
  arm.rotation.z = -Math.PI / 2;
  put(G(new THREE.SphereGeometry(0.088, 12, 10)), steel, 0.4, 0, 0, pivot);
  put(G(new THREE.SphereGeometry(0.048, 10, 8)), gold, 0.33, 0, 0, pivot);
  const grip = put(G(new THREE.CylinderGeometry(0.03, 0.03, 0.17, 8)), leather, 0.45, 0, 0, pivot);
  grip.rotation.z = Math.PI / 2;
  put(G(new THREE.BoxGeometry(0.05, 0.06, 0.32)), gold, 0.54, 0, 0, pivot);
  put(G(new THREE.BoxGeometry(BLADE1 - BLADE0 - 0.06, 0.1, 0.03)), blade, (BLADE0 + BLADE1 - 0.06) / 2, 0, 0, pivot);
  const tip = put(G(new THREE.BoxGeometry(0.071, 0.071, 0.028)), blade, BLADE1 - 0.06, 0, 0, pivot);
  tip.rotation.z = Math.PI / 4;
  g.traverse((o) => {
    o.castShadow = true;
  });
  return { g, body, pivot, legL, legR };
}

interface Slime {
  g: THREE.Group;
  blob: THREE.Group;
  flashMats: THREE.MeshStandardMaterial[];
}
function makeSlime(bin: Bin, col = 0x62cc74): Slime {
  const g = new THREE.Group();
  const blob = new THREE.Group();
  g.add(blob);
  const bodyMat = bin.add(new THREE.MeshStandardMaterial({ color: col, roughness: 0.28 }));
  const white = bin.add(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
  const black = bin.add(new THREE.MeshStandardMaterial({ color: 0x15151c, roughness: 0.2 }));
  const body = new THREE.Mesh(bin.add(new THREE.SphereGeometry(0.42, 32, 20)), bodyMat);
  body.scale.set(1, 0.8, 1);
  body.position.y = 0.33;
  body.castShadow = body.receiveShadow = true;
  blob.add(body);
  const eyeG = bin.add(new THREE.SphereGeometry(0.085, 14, 10));
  const pupG = bin.add(new THREE.SphereGeometry(0.048, 10, 8));
  for (const z of [-0.14, 0.14]) {
    const e = new THREE.Mesh(eyeG, white);
    e.position.set(-0.33, 0.44, z);
    e.scale.set(0.7, 1.15, 1);
    const p = new THREE.Mesh(pupG, black);
    p.position.set(-0.385, 0.45, z * 0.95);
    p.scale.set(0.6, 1.2, 1);
    blob.add(e, p);
  }
  const shine = new THREE.Mesh(eyeG, white);
  shine.position.set(-0.12, 0.6, 0.18);
  shine.scale.set(0.9, 0.45, 0.7);
  blob.add(shine);
  return { g, blob, flashMats: [bodyMat, white] };
}

/* ───────────── 칼 궤적 리본 ───────────── */

const RIB_N = 32;
class Ribbon {
  readonly mesh: THREE.Mesh;
  private pos: Float32Array;
  private geo: THREE.BufferGeometry;
  readonly mat: THREE.ShaderMaterial;
  private v = new THREE.Vector3();
  constructor(bin: Bin, core = new THREE.Color(1, 1, 0.95), edge = new THREE.Color(0.35, 0.65, 1.0)) {
    const n = (RIB_N + 1) * 2;
    this.pos = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    const idx: number[] = [];
    for (let i = 0; i <= RIB_N; i++) {
      uv.set([i / RIB_N, 0, i / RIB_N, 1], i * 4);
      if (i < RIB_N) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    this.geo = bin.add(new THREE.BufferGeometry());
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geo.setIndex(idx);
    this.mat = bin.add(
      new THREE.ShaderMaterial({
        uniforms: { uA: { value: 0 }, uCore: { value: core }, uEdge: { value: edge } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `
          varying vec2 vUv; uniform float uA; uniform vec3 uCore; uniform vec3 uEdge;
          void main(){
            float head = 1.0 - vUv.x;
            float a = pow(head, 1.5);
            float body = smoothstep(0.0, 0.7, vUv.y);
            float rim = smoothstep(0.80, 0.98, vUv.y) * (1.0 - smoothstep(0.985, 1.0, vUv.y) * 0.5);
            float streak = 0.82 + 0.18 * sin(vUv.y * 38.0 + head * 9.0);
            vec3 c = mix(uEdge, uCore, clamp(rim + a * 0.35, 0.0, 1.0));
            float al = a * (body * 0.42 * streak + rim * 0.95) * uA;
            gl_FragColor = vec4(c, al);
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }
  /** 기사 g 의 세계 행렬로 head → tail 각도 사이를 쓸어 리본을 만든다 (각은 수평 yaw) */
  sweep(g: THREE.Object3D, head: number, tail: number, alpha: number): void {
    const m = g.matrixWorld;
    for (let i = 0; i <= RIB_N; i++) {
      const a = lerp(head, tail, i / RIB_N);
      const c = Math.cos(a);
      const s = -Math.sin(a);
      for (let e = 0; e < 2; e++) {
        const r = e ? BLADE1 + 0.02 : BLADE0 + 0.12;
        this.v.set(PIVOT.x + r * c, PIVOT.y, PIVOT.z + r * s).applyMatrix4(m);
        this.pos.set([this.v.x, this.v.y, this.v.z], (i * 2 + e) * 3);
      }
    }
    this.geo.attributes.position!.needsUpdate = true;
    this.mat.uniforms.uA!.value = alpha;
  }
}

/* ───────────── 휘두르기 자세 (기사 기준 수평 각) ───────────── */

const REST = -0.5;
const SW_A0 = 2.05;
const SW_A1 = -2.05;
const SW_T0 = 0.45;
const SW_T1 = 0.63;
const TRAIL = 0.075;
interface Pose {
  yaw: number;
  tilt: number;
  lean: number;
}
function swingPose(c: number, out: Pose): Pose {
  if (c < SW_T0) {
    const k = ease(c / SW_T0);
    out.yaw = lerp(REST, SW_A0, k);
    out.tilt = lerp(-0.7, 0.3, k);
    out.lean = -0.14 * k;
  } else if (c < SW_T1) {
    const k = (c - SW_T0) / (SW_T1 - SW_T0);
    const e = k * k * (3 - 2 * k);
    out.yaw = lerp(SW_A0, SW_A1, e);
    out.tilt = lerp(0.3, 0, Math.min(1, k * 3));
    out.lean = lerp(-0.14, 0.2, e);
  } else if (c < 1.25) {
    const k = ease((c - SW_T1) / 0.62);
    out.yaw = SW_A1 + 0.12 * k;
    out.tilt = lerp(0, -0.35, k);
    out.lean = lerp(0.2, 0.04, k);
  } else {
    const k = ease((c - 1.25) / 0.85);
    out.yaw = lerp(SW_A1 + 0.12, REST, k);
    out.tilt = lerp(-0.35, -0.7, k);
    out.lean = lerp(0.04, 0, k);
  }
  return out;
}
function applyPose(k: Knight, p: Pose): void {
  k.pivot.rotation.set(0, p.yaw, p.tilt);
  k.body.rotation.z = -p.lean * 0.6;
  k.body.rotation.y = p.lean * 0.25;
}
/** 쓸기 부채꼴 [cur, prev] 가 원(중심 d · φ, 반지름 rr)과 겹치나 */
function sweepHits(cur: number, prev: number, d: number, phi: number, rr: number): boolean {
  if (d - rr > BLADE1 || d + rr < BLADE0) return false;
  const del = Math.asin(Math.min(1, rr / Math.max(d, 1e-3)));
  return phi + del >= Math.min(cur, prev) && phi - del <= Math.max(cur, prev);
}

/** 데미지 숫자 (캔버스 한 장 + 스프라이트) */
class Pop {
  readonly spr: THREE.Sprite;
  private cv = document.createElement('canvas');
  private tex: THREE.CanvasTexture;
  age = 99;
  juicy = true;
  x = 0;
  y = 0;
  z = 0;
  constructor(bin: Bin) {
    this.cv.width = 256;
    this.cv.height = 128;
    this.tex = bin.add(new THREE.CanvasTexture(this.cv));
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const m = bin.add(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    this.spr = new THREE.Sprite(m);
    this.spr.renderOrder = 12;
    this.spr.scale.set(0.0001, 0.0001, 1);
  }
  show(n: number, juicy: boolean, x: number, y: number, z: number): void {
    const g = this.cv.getContext('2d')!;
    g.clearRect(0, 0, 256, 128);
    g.font = `900 92px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 14;
    g.strokeStyle = juicy ? '#3a0d06' : '#202020';
    g.strokeText(String(n), 128, 68);
    if (juicy) {
      const gr = g.createLinearGradient(0, 24, 0, 110);
      gr.addColorStop(0, '#fff6b8');
      gr.addColorStop(0.5, '#ffc23a');
      gr.addColorStop(1, '#ff5a1f');
      g.fillStyle = gr;
    } else g.fillStyle = '#d8d8d8';
    g.fillText(String(n), 128, 68);
    this.tex.needsUpdate = true;
    this.age = 0;
    this.juicy = juicy;
    this.x = x;
    this.y = y;
    this.z = z;
  }
  tick(dt: number): void {
    this.age += dt;
    const a = this.age;
    const m = this.spr.material;
    if (a > 1.1) {
      m.opacity = 0;
      this.spr.scale.set(0.0001, 0.0001, 1);
      return;
    }
    let s: number;
    let rise: number;
    if (this.juicy) {
      // 크게 튀었다가 제자리 (튀는 맛)
      s = a < 0.08 ? lerp(0.3, 1.55, a / 0.08) : a < 0.22 ? lerp(1.55, 1, ease((a - 0.08) / 0.14)) : 1;
      rise = easeOut(a / 0.5) * 0.75;
      this.spr.position.set(this.x + a * 0.35, this.y + rise - Math.max(0, a - 0.5) * 0.25, this.z);
    } else {
      s = 0.85;
      rise = a * 0.6;
      this.spr.position.set(this.x, this.y + rise, this.z);
    }
    m.opacity = a < 0.75 ? 1 : 1 - (a - 0.75) / 0.35;
    this.spr.scale.set(0.9 * s, 0.45 * s, 1);
  }
}

/** 불꽃 튐 (점 입자) */
class Sparks {
  readonly pts: THREE.Points;
  private n = 22;
  private p: Float32Array;
  private col: Float32Array;
  private v: Float32Array;
  private life: Float32Array;
  private geo: THREE.BufferGeometry;
  constructor(bin: Bin, glow: THREE.Texture) {
    this.p = new Float32Array(this.n * 3);
    this.col = new Float32Array(this.n * 3);
    this.v = new Float32Array(this.n * 3);
    this.life = new Float32Array(this.n);
    this.geo = bin.add(new THREE.BufferGeometry());
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const m = bin.add(new THREE.PointsMaterial({ size: 0.2, map: glow, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.pts = new THREE.Points(this.geo, m);
    this.pts.frustumCulled = false;
  }
  burst(x: number, y: number, z: number, R: () => number): void {
    for (let i = 0; i < this.n; i++) {
      const a = R() * TAU;
      const up = R() * 2 - 0.6;
      const sp = 2.5 + R() * 4.5;
      this.p.set([x, y, z], i * 3);
      this.v.set([Math.cos(a) * sp * 0.8 + 1.5, up * sp * 0.6, Math.sin(a) * sp * 0.8], i * 3);
      this.life[i] = 0.18 + R() * 0.25;
    }
  }
  tick(dt: number): void {
    for (let i = 0; i < this.n; i++) {
      const l = (this.life[i] = Math.max(0, this.life[i]! - dt));
      const j = i * 3;
      this.v[j + 1] = this.v[j + 1]! - 9 * dt;
      for (let k = 0; k < 3; k++) {
        this.v[j + k] = this.v[j + k]! * (1 - 3 * dt);
        this.p[j + k] = this.p[j + k]! + this.v[j + k]! * dt;
      }
      const b = Math.min(1, l * 5);
      this.col.set([b * 1.6, b * 1.1, b * 0.45], j);
    }
    this.geo.attributes.position!.needsUpdate = true;
    this.geo.attributes.color!.needsUpdate = true;
  }
}

/* ───────────── i484 전투 판정 ───────────── */

const SWEEP_VS = 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
const SWEEP_FS = `
  varying vec2 vP; uniform float uCur, uPrev, uStart, uOn, uHit;
  void main(){
    float th = atan(vP.y, vP.x);
    float r = length(vP);
    float full = 0.07;
    float swept = step(uCur, th) * step(th, uStart) * 0.2;
    float slice = step(uCur - 0.02, th) * step(th, uPrev + 0.02) * 0.75;
    float edge = (1.0 - smoothstep(0.0, 0.03, abs(r - ${BLADE0.toFixed(2)}))) + (1.0 - smoothstep(0.0, 0.03, abs(r - ${BLADE1.toFixed(2)})));
    vec3 base = vec3(0.35, 0.8, 1.0);
    vec3 hot = mix(vec3(1.0, 0.62, 0.18), vec3(1.0, 0.18, 0.12), uHit);
    vec3 c = mix(base, hot, step(0.01, slice));
    float a = clamp(full + swept + slice + edge * 0.45, 0.0, 0.85) * uOn;
    gl_FragColor = vec4(c, a);
  }`;

interface Lane {
  g: THREE.Group;
  juice: boolean;
  knight: Knight;
  slime: Slime;
  ribbon: Ribbon;
  sweep: THREE.Mesh;
  sweepU: Record<string, THREE.IUniform<number>>;
  hurt: THREE.Mesh;
  hurtMat: THREE.MeshBasicMaterial;
  pop: Pop;
  sparks: Sparks;
  star: THREE.Sprite;
  starAge: number;
  lastCyc: number;
  stopAcc: number;
  stop: number;
  lastC: number;
  prevYaw: number;
  hit: boolean;
  kb: number;
  kbv: number;
  squash: number;
  flash: number;
  shake: number;
  hitGlow: number;
}

function demoCombat(): Scene3D {
  const st = makeStage({ w: 18, d: 11, wallH: 2.6, torches: [[-4.2, 9], [0, 9], [4.2, 9]], cam: [-0.2, 5.0, 6.0], look: [-0.2, 0.55, -0.45], fov: 38, shadow: 6 });
  const { scene, cam, bin } = st;
  const painter = new Painter(0x0b090e);
  const R = rng(484);
  const glowTex = bin.add(texOf('glow', 64, 64, paintGlow));
  const starTex = bin.add(texOf('star', 128, 128, paintStar));
  const ringG = bin.add(new THREE.RingGeometry(BLADE0, BLADE1, 56, 1, SW_A1, SW_A0 - SW_A1));
  const hurtG = bin.add(new THREE.RingGeometry(0.42, 0.5, 40));
  const opt = { compare: true, showSweep: true, stopLen: 0.06, knock: 1 };
  const pose: Pose = { yaw: REST, tilt: -0.7, lean: 0 };
  const lanes: Lane[] = [];
  const mkLane = (juice: boolean): Lane => {
    const g = new THREE.Group();
    scene.add(g);
    const knight = makeKnight(bin, juice ? 0x2f5fb8 : 0x6a6f7c, juice ? 0xd8313b : 0x8a8f98);
    knight.g.position.set(-0.85, 0, 0);
    g.add(knight.g);
    const slime = makeSlime(bin, juice ? 0x62cc74 : 0x7fae86);
    slime.g.position.set(0.75, 0, 0);
    g.add(slime.g);
    const ribbon = new Ribbon(bin, juice ? new THREE.Color(1, 0.98, 0.9) : new THREE.Color(0.75, 0.75, 0.75), juice ? new THREE.Color(0.3, 0.62, 1.0) : new THREE.Color(0.35, 0.35, 0.4));
    scene.add(ribbon.mesh);
    const sweepU = { uCur: { value: SW_A0 }, uPrev: { value: SW_A0 }, uStart: { value: SW_A0 }, uOn: { value: 1 }, uHit: { value: 0 } };
    const sweep = new THREE.Mesh(ringG, bin.add(new THREE.ShaderMaterial({ uniforms: sweepU, vertexShader: SWEEP_VS, fragmentShader: SWEEP_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide })));
    sweep.rotation.x = -Math.PI / 2;
    sweep.position.copy(knight.g.position).add(PIVOT);
    sweep.position.y = 0.04;
    sweep.renderOrder = 3;
    g.add(sweep);
    const hurtMat = bin.add(new THREE.MeshBasicMaterial({ color: 0xffd34a, transparent: true, opacity: 0.8, depthWrite: false }));
    const hurt = new THREE.Mesh(hurtG, hurtMat);
    hurt.rotation.x = -Math.PI / 2;
    hurt.position.y = 0.035;
    slime.g.add(hurt);
    const pop = new Pop(bin);
    scene.add(pop.spr);
    const sparks = new Sparks(bin, glowTex);
    scene.add(sparks.pts);
    const star = new THREE.Sprite(bin.add(new THREE.SpriteMaterial({ map: starTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0 })));
    star.renderOrder = 8;
    scene.add(star);
    return { g, juice, knight, slime, ribbon, sweep, sweepU, hurt, hurtMat, pop, sparks, star, starAge: 9, lastCyc: -1, stopAcc: 0, stop: 0, lastC: 0, prevYaw: REST, hit: false, kb: 0, kbv: 0, squash: 0, flash: 0, shake: 0, hitGlow: 0 };
  };
  const plain = mkLane(false);
  const juicy = mkLane(true);
  lanes.push(plain, juicy);
  const layout = (): void => {
    plain.g.visible = opt.compare;
    plain.ribbon.mesh.visible = opt.compare;
    plain.g.position.x = -2.45;
    juicy.g.position.x = opt.compare ? 0.95 : -0.35;
    hud.dirty = true;
  };
  const hud = new Hud((g, w, h, u) => {
    const s = 11 * u;
    if (opt.compare) {
      tag(g, '효과 끔 — 숫자만', w * 0.2, 16 * u, s, '#c9ccd4', 'center');
      tag(g, '효과 켬 — 멈춤 · 번쩍 · 밀림', w * 0.66, 16 * u, s, '#ffd27a', 'center');
    } else tag(g, `히트스톱 ${opt.stopLen.toFixed(2)}초 · 번쩍 · 넉백 · 흔들림`, w / 2, 16 * u, s, '#ffd27a', 'center');
    if (opt.showSweep) tag(g, '파랑 부채꼴 = 칼이 쓸고 간 판정 영역', 8 * u, h - 14 * u, 9.5 * u, '#9fdcff');
  });
  layout();
  const tmp = new THREE.Vector3();
  const pv = new THREE.Vector3();
  const update = (t: number, dt: number): void => {
    st.tick(t);
    let camShake = 0;
    for (const L of lanes) {
      const dtl = L.stop > 0 ? 0 : dt;
      if (L.stop > 0) L.stop -= dt;
      // 두 줄을 같은 박자로: 이번 판에서 멈춘 만큼만 늦는다 (판이 바뀌면 다시 맞춘다)
      const cyc = Math.floor(t / 2.4);
      if (cyc !== L.lastCyc) {
        L.lastCyc = cyc;
        L.stopAcc = 0;
        L.hit = false;
        L.prevYaw = REST;
      }
      L.stopAcc += dt - dtl;
      const c = Math.max(0, t - cyc * 2.4 - L.stopAcc);
      L.lastC = c;
      swingPose(c, pose);
      applyPose(L.knight, pose);
      const yaw = pose.yaw;
      // 슬라임: 넉백 · 되돌아오기 · 숨쉬기
      L.kb += L.kbv * dtl;
      L.kbv *= Math.exp(-dtl * 7.5);
      if (c > 1.3) L.kb -= L.kb * Math.min(1, dtl * 2.6);
      L.squash = Math.max(0, L.squash - dtl * 5);
      const breath = Math.sin(t * 3.2 + (L.juice ? 0 : 1)) * 0.04;
      const hop = c > 1.3 && L.kb > 0.08 ? Math.abs(Math.sin(c * 12)) * 0.12 : 0;
      L.slime.g.position.set(0.75 + L.kb, hop, 0);
      const sq = L.squash;
      L.slime.blob.scale.set(1 + 0.3 * sq - breath * 0.5, 1 - 0.35 * sq + breath, 1 + 0.3 * sq - breath * 0.5);
      // 맞음 판정 (휘두르는 동안만)
      L.g.updateMatrixWorld(true);
      L.knight.g.localToWorld(pv.copy(PIVOT));
      L.slime.g.getWorldPosition(tmp);
      const dx = tmp.x - pv.x;
      const dz = tmp.z - pv.z;
      const d = Math.hypot(dx, dz);
      const phi = Math.atan2(-dz, dx);
      const swinging = c >= SW_T0 && c <= SW_T1 + 0.01;
      if (swinging && !L.hit && dtl > 0 && sweepHits(yaw, L.prevYaw, d, phi, 0.42)) {
        L.hit = true;
        const n = 18 + Math.floor(R() * 30);
        L.pop.show(n, L.juice, tmp.x, 1.25, tmp.z + 0.1);
        L.hitGlow = 1;
        if (L.juice) {
          L.stop = opt.stopLen;
          L.flash = 1;
          L.kbv = 5.2 * opt.knock;
          L.squash = 1;
          L.shake = 1;
          L.sparks.burst(tmp.x - 0.3, 0.6, tmp.z + 0.05, R);
          L.star.position.set(tmp.x - 0.32, 0.62, tmp.z + 0.1);
          L.starAge = 0;
        }
      }
      // 쓸기 볼륨 보기
      const u = L.sweepU;
      u.uOn!.value = opt.showSweep ? 1 : 0;
      L.hurt.visible = opt.showSweep;
      if (swinging || (c > SW_T1 && c < SW_T1 + 0.25)) {
        u.uCur!.value = yaw;
        u.uPrev!.value = swinging ? L.prevYaw : yaw;
        u.uStart!.value = SW_A0;
      } else {
        u.uCur!.value = u.uPrev!.value = u.uStart!.value = SW_A0 + 1;
      }
      L.hitGlow = Math.max(0, L.hitGlow - dt * 3);
      u.uHit!.value = L.hitGlow;
      L.hurtMat.color.setHex(L.hitGlow > 0.05 ? 0xff4a3a : 0xffd34a);
      if (dtl > 0) L.prevYaw = yaw;
      // 궤적 리본: 머리 = 지금 각, 꼬리 = 조금 전 각
      if (c >= SW_T0 && c < SW_T1 + TRAIL + 0.02) {
        const tail = swingPose(Math.max(SW_T0, Math.min(c, SW_T1) - TRAIL), { yaw: 0, tilt: 0, lean: 0 }).yaw;
        const head = c > SW_T1 ? lerp(yaw, tail, 0) : yaw;
        const fade = c > SW_T1 ? 1 - (c - SW_T1) / (TRAIL + 0.02) : 1;
        const tl = c > SW_T1 ? lerp(tail, head, clamp((c - SW_T1) / TRAIL, 0, 1)) : tail;
        L.ribbon.sweep(L.knight.body, head, tl, fade * (L.juice ? 1 : 0.6));
      } else L.ribbon.mat.uniforms.uA!.value = 0;
      // 번쩍 (진짜 시간) · 숫자 · 불꽃
      L.flash = Math.max(0, L.flash - dt / 0.13);
      for (const m of L.slime.flashMats) m.emissive.setScalar(L.flash * 1.6);
      L.pop.tick(dt);
      L.sparks.tick(dt);
      L.starAge += dt;
      const sa = L.starAge;
      L.star.material.opacity = sa < 0.16 ? 1 - sa / 0.16 : 0;
      const ss = 0.5 + easeOut(sa / 0.16) * 1.3;
      L.star.scale.set(ss, ss, 1);
      L.shake = Math.max(0, L.shake - dt / 0.22);
      if (L.juice) camShake = L.shake;
    }
    // 흔들림 — 비교 중엔 켠 쪽 무대만, 혼자면 카메라
    const sx = Math.sin(t * 91) * 0.07 * camShake;
    const sy = Math.cos(t * 77) * 0.05 * camShake;
    if (opt.compare) {
      juicy.g.position.y = sy;
      juicy.g.position.z = sx * 0.5;
      cam.position.set(-0.2, 5.0, 6.0);
      cam.lookAt(-0.2, 0.55, -0.45);
    } else {
      juicy.g.position.y = 0;
      juicy.g.position.z = 0;
      cam.position.set(0.1 + sx, 4.6 + sy, 5.6);
      cam.lookAt(0.1 + sx * 0.6, 0.75 + sy * 0.6, 0);
    }
  };
  const controls: Control[] = [
    { type: 'toggle', label: '나란히 비교 (끔 / 켬)', value: true, on: (v) => ((opt.compare = v), layout()) },
    { type: 'toggle', label: '판정 영역(쓸기 부채꼴) 보기', value: true, on: (v) => ((opt.showSweep = v), (hud.dirty = true)) },
    { type: 'range', label: '히트스톱 (초)', min: 0, max: 0.25, step: 0.01, value: 0.06, on: (v) => ((opt.stopLen = v), (hud.dirty = true)) },
    { type: 'range', label: '넉백 세기', min: 0, max: 2.5, step: 0.1, value: 1, on: (v) => (opt.knock = v) },
  ];
  return {
    scene,
    camera: cam,
    update,
    render: (r) => painter.draw(r, scene, cam, hud),
    controls,
    dispose: () => {
      bin.dispose();
      hud.dispose();
    },
  };
}

/* ───────────── i485 천 시뮬레이션 ───────────── */

interface Capsule {
  a: THREE.Vector3;
  b: THREE.Vector3;
  r: number;
}
/** 베를레 점 격자 천 — 위치 배열을 그대로 BufferGeometry 에 쓴다 */
class Cloth {
  readonly geo: THREE.BufferGeometry;
  readonly n: number;
  readonly p: Float32Array;
  private o: Float32Array;
  readonly pin: Uint8Array;
  readonly target: Float32Array;
  private ca: Uint16Array;
  private cb: Uint16Array;
  private rest: Float32Array;
  private stiff: Float32Array;
  readonly cons: number;
  constructor(
    readonly nx: number,
    readonly ny: number,
    init: (i: number, j: number, out: THREE.Vector3) => void,
    pinned: (i: number, j: number) => boolean,
  ) {
    const n = (this.n = nx * ny);
    this.p = new Float32Array(n * 3);
    this.o = new Float32Array(n * 3);
    this.target = new Float32Array(n * 3);
    this.pin = new Uint8Array(n);
    const v = new THREE.Vector3();
    const uv = new Float32Array(n * 2);
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        init(i, j, v);
        this.p.set([v.x, v.y, v.z], k * 3);
        this.pin[k] = pinned(i, j) ? 1 : 0;
        uv.set([i / (nx - 1), 1 - j / (ny - 1)], k * 2);
      }
    this.o.set(this.p);
    this.target.set(this.p);
    const A: number[] = [];
    const B: number[] = [];
    const S: number[] = [];
    const add = (a: number, b: number, s: number): void => {
      A.push(a);
      B.push(b);
      S.push(s);
    };
    const id = (i: number, j: number): number => j * nx + i;
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        if (i + 1 < nx) add(id(i, j), id(i + 1, j), 1);
        if (j + 1 < ny) add(id(i, j), id(i, j + 1), 1);
        if (i + 1 < nx && j + 1 < ny) {
          add(id(i, j), id(i + 1, j + 1), 0.6);
          add(id(i + 1, j), id(i, j + 1), 0.6);
        }
        if (i + 2 < nx) add(id(i, j), id(i + 2, j), 0.25);
        if (j + 2 < ny) add(id(i, j), id(i, j + 2), 0.25);
      }
    this.cons = A.length;
    this.ca = Uint16Array.from(A);
    this.cb = Uint16Array.from(B);
    this.stiff = Float32Array.from(S);
    this.rest = new Float32Array(A.length);
    for (let c = 0; c < A.length; c++) {
      const a = A[c]! * 3;
      const b = B[c]! * 3;
      this.rest[c] = Math.hypot(this.p[b]! - this.p[a]!, this.p[b + 1]! - this.p[a + 1]!, this.p[b + 2]! - this.p[a + 2]!);
    }
    const idx: number[] = [];
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const a = id(i, j);
        const b = id(i + 1, j);
        const c = id(i, j + 1);
        const d = id(i + 1, j + 1);
        idx.push(a, c, b, b, c, d);
      }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geo.setIndex(idx);
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
  }
  /** h 초 한 걸음. wind = 바람 (세계), caps = 몸 캡슐 */
  step(h: number, iters: number, wind: THREE.Vector3, windK: number, drag: number, caps: Capsule[]): void {
    const p = this.p;
    const o = this.o;
    const nrm = this.geo.attributes.normal!.array as Float32Array;
    const h2 = h * h;
    const damp = 0.988;
    for (let k = 0; k < this.n; k++) {
      const j = k * 3;
      if (this.pin[k]) {
        o[j] = p[j]!;
        o[j + 1] = p[j + 1]!;
        o[j + 2] = p[j + 2]!;
        p[j] = this.target[j]!;
        p[j + 1] = this.target[j + 1]!;
        p[j + 2] = this.target[j + 2]!;
        continue;
      }
      const vx = (p[j]! - o[j]!) * damp;
      const vy = (p[j + 1]! - o[j + 1]!) * damp;
      const vz = (p[j + 2]! - o[j + 2]!) * damp;
      // 바람: 상대 기류를 천 법선 방향으로 받는다
      const rx = wind.x - vx / h;
      const ry = wind.y - vy / h;
      const rz = wind.z - vz / h;
      const nx = nrm[j]!;
      const ny = nrm[j + 1]!;
      const nz = nrm[j + 2]!;
      const dn = (nx * rx + ny * ry + nz * rz) * windK;
      const ax = nx * dn + rx * drag;
      const ay = ny * dn + ry * drag - 9.8;
      const az = nz * dn + rz * drag;
      o[j] = p[j]!;
      o[j + 1] = p[j + 1]!;
      o[j + 2] = p[j + 2]!;
      p[j] = p[j]! + vx + ax * h2;
      p[j + 1] = p[j + 1]! + vy + ay * h2;
      p[j + 2] = p[j + 2]! + vz + az * h2;
    }
    const ca = this.ca;
    const cb = this.cb;
    const rest = this.rest;
    const sf = this.stiff;
    const pin = this.pin;
    for (let it = 0; it < iters; it++) {
      for (let c = 0; c < this.cons; c++) {
        const ia = ca[c]!;
        const ib = cb[c]!;
        const a = ia * 3;
        const b = ib * 3;
        const dx = p[b]! - p[a]!;
        const dy = p[b + 1]! - p[a + 1]!;
        const dz = p[b + 2]! - p[a + 2]!;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const wa = pin[ia] ? 0 : 1;
        const wb = pin[ib] ? 0 : 1;
        const ws = wa + wb;
        if (!ws) continue;
        const f = ((d - rest[c]!) / d) * sf[c]!;
        const fa = (f * wa) / ws;
        const fb = (f * wb) / ws;
        p[a] = p[a]! + dx * fa;
        p[a + 1] = p[a + 1]! + dy * fa;
        p[a + 2] = p[a + 2]! + dz * fa;
        p[b] = p[b]! - dx * fb;
        p[b + 1] = p[b + 1]! - dy * fb;
        p[b + 2] = p[b + 2]! - dz * fb;
      }
      // 몸 캡슐 · 바닥
      for (let k = 0; k < this.n; k++) {
        if (pin[k]) continue;
        const j = k * 3;
        for (const cp of caps) {
          const abx = cp.b.x - cp.a.x;
          const aby = cp.b.y - cp.a.y;
          const abz = cp.b.z - cp.a.z;
          const t = clamp(((p[j]! - cp.a.x) * abx + (p[j + 1]! - cp.a.y) * aby + (p[j + 2]! - cp.a.z) * abz) / (abx * abx + aby * aby + abz * abz), 0, 1);
          const qx = p[j]! - (cp.a.x + abx * t);
          const qy = p[j + 1]! - (cp.a.y + aby * t);
          const qz = p[j + 2]! - (cp.a.z + abz * t);
          const d2 = qx * qx + qy * qy + qz * qz;
          if (d2 < cp.r * cp.r) {
            const d = Math.sqrt(d2) || 1e-6;
            const s = (cp.r - d) / d;
            p[j] = p[j]! + qx * s;
            p[j + 1] = p[j + 1]! + qy * s;
            p[j + 2] = p[j + 2]! + qz * s;
          }
        }
        if (p[j + 1]! < 0.02) {
          p[j + 1] = 0.02;
          o[j] = lerp(o[j]!, p[j]!, 0.5);
          o[j + 2] = lerp(o[j + 2]!, p[j + 2]!, 0.5);
        }
      }
    }
  }
  finish(): void {
    this.geo.attributes.position!.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
  }
  dispose(): void {
    this.geo.dispose();
  }
}

function demoCloth(): Scene3D {
  const st = makeStage({ w: 18, d: 10, wallH: 2.2, crenel: true, torches: [[-3.6, 8], [0.4, 8]], cam: [0.4, 3.7, 5.9], look: [0.4, 1.45, -0.9], fov: 42, shadow: 6 });
  const { scene, cam, bin } = st;
  scene.background = new THREE.Color(0x0c1022);
  const painter = new Painter(0x0c1022);
  const knight = makeKnight(bin, 0x2f5fb8, 0xd8313b);
  scene.add(knight.g);
  // 망토 · 깃발 재질 (앞뒤 색이 다른 천 — 두 메시가 같은 모양을 나눠 쓴다)
  const capeF = bin.add(new THREE.MeshStandardMaterial({ map: bin.add(texOf('capeF', 256, 384, paintCapeFront)), roughness: 0.82, side: THREE.FrontSide, shadowSide: THREE.DoubleSide }));
  const capeB = bin.add(new THREE.MeshStandardMaterial({ map: bin.add(texOf('capeB', 256, 384, paintCapeBack)), roughness: 0.9, side: THREE.BackSide }));
  const flagM = bin.add(new THREE.MeshStandardMaterial({ map: bin.add(texOf('flag', 384, 256, paintFlag)), roughness: 0.85, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide }));
  const wireM = bin.add(new THREE.MeshBasicMaterial({ color: 0xffd36a, wireframe: true, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }));
  // 깃대
  const wallZ = -10 / 2 + 0.35;
  const poleX = 2.7;
  const pole = new THREE.Mesh(bin.add(new THREE.CylinderGeometry(0.045, 0.055, 1.7, 10)), bin.add(new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.6 })));
  pole.position.set(poleX, 2.2 + 0.85, wallZ);
  pole.castShadow = true;
  const knob = new THREE.Mesh(bin.add(new THREE.SphereGeometry(0.09, 12, 8)), bin.add(new THREE.MeshStandardMaterial({ color: 0xe2b04a, roughness: 0.3, metalness: 0.6 })));
  knob.position.set(poleX, 3.94, wallZ);
  scene.add(pole, knob);
  // 밤하늘 별 (벽 너머)
  const starG = bin.add(new THREE.BufferGeometry());
  const sp: number[] = [];
  const R = rng(485);
  for (let i = 0; i < 260; i++) sp.push((R() - 0.5) * 40, 3 + R() * 14, -9 - R() * 6);
  starG.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  scene.add(new THREE.Points(starG, bin.add(new THREE.PointsMaterial({ size: 0.07, color: 0xcfd8ff, transparent: true, opacity: 0.8, depthWrite: false }))));
  const opt = { grid: 12, wind: 1.2, iters: 8, wire: false };
  const caps: Capsule[] = [{ a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.31 }];
  const capeLocal: THREE.Vector3[] = [];
  let cape: Cloth;
  let flag: Cloth;
  const meshes: THREE.Mesh[] = [];
  const v = new THREE.Vector3();
  const build = (): void => {
    for (const m of meshes) scene.remove(m);
    meshes.length = 0;
    cape?.dispose();
    flag?.dispose();
    knight.g.updateMatrixWorld(true);
    const nx = opt.grid;
    const ny = Math.round(nx * 1.45);
    capeLocal.length = 0;
    cape = new Cloth(
      nx,
      ny,
      (i, j, out) => {
        const kj = j / (ny - 1);
        const w = lerp(0.54, 0.95, kj);
        out.set(-0.24 - kj * 0.12, 1.17 - kj * 1.04, (i / (nx - 1) - 0.5) * w);
        if (j === 0) capeLocal.push(out.clone());
        knight.g.localToWorld(out);
      },
      (_i, j) => j === 0,
    );
    const fx = Math.round(nx * 1.3);
    const fy = Math.round(nx * 0.85);
    flag = new Cloth(
      fx,
      fy,
      (i, j, out) => out.set(poleX + 0.05 + (i / (fx - 1)) * 1.4, 3.82 - (j / (fy - 1)) * 0.9, wallZ + i * 0.002),
      (i) => i === 0,
    );
    for (const [geo, mats] of [
      [cape.geo, [capeF, capeB]],
      [flag.geo, [flagM]],
    ] as const) {
      for (const m of mats) {
        const me = new THREE.Mesh(geo, m);
        me.castShadow = m !== capeB;
        me.receiveShadow = true;
        me.frustumCulled = false;
        meshes.push(me);
        scene.add(me);
      }
      const wf = new THREE.Mesh(geo, wireM);
      wf.visible = opt.wire;
      wf.renderOrder = 4;
      wf.frustumCulled = false;
      meshes.push(wf);
      scene.add(wf);
    }
    hud.dirty = true;
  };
  let costMs = 0;
  let costAcc = 0;
  let costN = 0;
  let costT = 0;
  const hud = new Hud((g, _w, h, u) => {
    tag(g, '망토 = 베를레 점 격자 (윗줄은 어깨에 고정)', 8 * u, 14 * u, 9.5 * u, '#ffd9a0');
    tag(g, `천 계산 ${costMs.toFixed(2)}ms · 점 ${cape.n + flag.n}개 · 제약 ${cape.cons + flag.cons}개 · 반복 ${opt.iters}번`, 8 * u, h - 13 * u, 9 * u, '#bfe3ff');
  });
  build();
  let acc = 0;
  let walkT = 0;
  const wind = new THREE.Vector3();
  const flagWind = new THREE.Vector3();
  const update = (t: number, dt: number): void => {
    st.tick(t);
    // 기사: 큰 원을 걷다가 잠깐 멈췄다 다시 (망토가 따라 펄럭)
    const pace = 0.75 + 0.25 * Math.sin(t * 0.45);
    walkT += dt * pace;
    const th = walkT * 0.62;
    const cx = 0.2;
    const cz = -0.35;
    const Rr = 1.5;
    knight.g.position.set(cx + Math.cos(th) * Rr, 0, cz + Math.sin(th) * Rr);
    // 앞 = +x, 원을 따라 도는 방향
    knight.g.rotation.y = Math.atan2(-Math.cos(th), -Math.sin(th));
    const step = Math.sin(walkT * 7.2);
    knight.legL.rotation.z = step * 0.5;
    knight.legR.rotation.z = -step * 0.5;
    knight.body.position.y = Math.abs(Math.cos(walkT * 7.2)) * 0.05;
    knight.pivot.rotation.set(0, -0.25 - step * 0.15, -1.25);
    knight.g.updateMatrixWorld(true);
    // 고정점 (어깨) · 몸 캡슐
    for (let i = 0; i < cape.nx; i++) {
      v.copy(capeLocal[i]!);
      v.y += knight.body.position.y;
      knight.g.localToWorld(v);
      cape.target.set([v.x, v.y, v.z], i * 3);
    }
    knight.g.localToWorld(caps[0]!.a.set(0.0, 0.42, 0));
    knight.g.localToWorld(caps[0]!.b.set(0.0, 1.12 + knight.body.position.y, 0));
    const gust = 0.7 + 0.3 * Math.sin(t * 1.7) + 0.2 * Math.sin(t * 4.3 + 1);
    wind.set(1, 0.05, 0.35).normalize().multiplyScalar(opt.wind * 3.2 * gust);
    const t0 = performance.now();
    acc = Math.min(acc + dt, 3 / 60);
    const H = 1 / 60;
    let steps = 0;
    while (acc >= H) {
      acc -= H;
      cape.step(H, opt.iters, wind, 0.9, 0.12, caps);
      flag.step(H, opt.iters, flagWind.copy(wind).multiplyScalar(1.5), 0.7, 0.9, []);
      steps++;
    }
    if (steps) {
      cape.finish();
      flag.finish();
    }
    costAcc += performance.now() - t0;
    costN++;
    if (t - costT > 0.5) {
      costMs = costAcc / Math.max(1, costN);
      costAcc = 0;
      costN = 0;
      costT = t;
      hud.dirty = true;
    }
  };
  const controls: Control[] = [
    { type: 'range', label: '격자 크기 (가로 점 수)', min: 6, max: 22, step: 1, value: 12, on: (x) => ((opt.grid = x), build()) },
    { type: 'range', label: '바람', min: 0, max: 3, step: 0.1, value: 1.2, on: (x) => (opt.wind = x) },
    { type: 'range', label: '반복 횟수 (제약 풀기)', min: 1, max: 20, step: 1, value: 8, on: (x) => ((opt.iters = x), (hud.dirty = true)) },
    {
      type: 'toggle',
      label: '격자 선 보기',
      value: false,
      on: (x) => {
        opt.wire = x;
        for (const m of meshes) if (m.material === wireM) m.visible = x;
      },
    },
  ];
  return {
    scene,
    camera: cam,
    update,
    render: (r) => painter.draw(r, scene, cam, hud),
    controls,
    dispose: () => {
      cape.dispose();
      flag.dispose();
      bin.dispose();
      hud.dispose();
    },
  };
}

/* ───────────── i486 부서지는 물체 — 볼록 다면체를 보로노이 평면으로 자르기 ───────────── */

interface Face {
  p: THREE.Vector3[];
  n: THREE.Vector3;
  inner: boolean;
}
function faceOf(p: THREE.Vector3[], center: THREE.Vector3): Face {
  // Newell 법선 → 밖을 보게
  const n = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!;
    const b = p[(i + 1) % p.length]!;
    n.x += (a.y - b.y) * (a.z + b.z);
    n.y += (a.z - b.z) * (a.x + b.x);
    n.z += (a.x - b.x) * (a.y + b.y);
    c.add(a);
  }
  n.normalize();
  c.divideScalar(p.length).sub(center);
  if (n.dot(c) < 0) {
    p.reverse();
    n.negate();
  }
  return { p, n, inner: false };
}
function boxPoly(s: number): Face[] {
  const h = s / 2;
  const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x * h, y * h + h, z * h);
  const ctr = new THREE.Vector3(0, h, 0);
  const q = (a: number[][]): Face => faceOf(a.map(([x, y, z]) => V(x!, y!, z!)), ctr);
  return [
    q([[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]),
    q([[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]),
    q([[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]]),
    q([[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]),
    q([[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]),
    q([[-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1]]),
  ];
}
/** 돌림체 (반지름 함수가 오목 = 볼록 입체) */
function lathePoly(prof: [number, number][], seg: number): Face[] {
  const ymid = (prof[0]![1] + prof[prof.length - 1]![1]) / 2;
  const ctr = new THREE.Vector3(0, ymid, 0);
  const ring = (r: number, y: number): THREE.Vector3[] => Array.from({ length: seg }, (_, k) => new THREE.Vector3(Math.cos((k / seg) * TAU) * r, y, Math.sin((k / seg) * TAU) * r));
  const rings = prof.map(([r, y]) => ring(r, y));
  const out: Face[] = [];
  for (let i = 0; i + 1 < rings.length; i++)
    for (let k = 0; k < seg; k++) {
      const a = rings[i]!;
      const b = rings[i + 1]!;
      const k2 = (k + 1) % seg;
      out.push(faceOf([a[k]!.clone(), a[k2]!.clone(), b[k2]!.clone(), b[k]!.clone()], ctr));
    }
  out.push(faceOf(rings[0]!.map((v) => v.clone()), ctr));
  out.push(faceOf(rings[rings.length - 1]!.map((v) => v.clone()), ctr));
  return out;
}
const TV = new THREE.Vector3();
/** n·x <= d 쪽만 남긴다. 잘린 자리에 「안쪽 면」 하나가 생긴다 */
function clipPoly(faces: Face[], n: THREE.Vector3, d: number): Face[] {
  const out: Face[] = [];
  const cap: THREE.Vector3[] = [];
  const E = 1e-7;
  for (const f of faces) {
    const np: THREE.Vector3[] = [];
    const L = f.p.length;
    for (let i = 0; i < L; i++) {
      const a = f.p[i]!;
      const b = f.p[(i + 1) % L]!;
      const da = n.dot(a) - d;
      const db = n.dot(b) - d;
      if (da <= E) np.push(a);
      if (Math.abs(da) <= E) cap.push(a);
      if ((da < -E && db > E) || (da > E && db < -E)) {
        const q = a.clone().lerp(b, da / (da - db));
        np.push(q);
        cap.push(q);
      }
    }
    if (np.length >= 3) out.push({ p: np, n: f.n, inner: f.inner });
  }
  // 잘린 면: 점을 모아 평면 위에서 각도 순으로
  const uniq: THREE.Vector3[] = [];
  for (const q of cap) if (!uniq.some((u) => u.distanceToSquared(q) < 1e-10)) uniq.push(q);
  if (uniq.length >= 3) {
    const c = new THREE.Vector3();
    for (const q of uniq) c.add(q);
    c.divideScalar(uniq.length);
    const u = Math.abs(n.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    u.cross(n).normalize();
    const w = new THREE.Vector3().crossVectors(n, u);
    const ang = (q: THREE.Vector3): number => {
      TV.subVectors(q, c);
      return Math.atan2(TV.dot(w), TV.dot(u));
    };
    uniq.sort((a, b) => ang(a) - ang(b));
    out.push({ p: uniq, n: n.clone(), inner: true });
  }
  return out;
}
type UvFn = (p: THREE.Vector3, n: THREE.Vector3, fc: THREE.Vector3) => [number, number];
/** 면 목록 → 메시 모양 (가운데 c 기준, shrink 로 금 틈). 그룹 0 = 겉면, 1 = 안쪽 면 */
function facesToGeo(faces: Face[], c: THREE.Vector3, shrink: number, uvFn: UvFn): { geo: THREE.BufferGeometry; verts: number[] } {
  const P: number[] = [];
  const N: number[] = [];
  const U: number[] = [];
  const verts: number[] = [];
  const geo = new THREE.BufferGeometry();
  const fc = new THREE.Vector3();
  const bu = new THREE.Vector3();
  const bw = new THREE.Vector3();
  let start = 0;
  for (const inner of [false, true]) {
    for (const f of faces) {
      if (f.inner !== inner) continue;
      fc.set(0, 0, 0);
      for (const q of f.p) fc.add(q);
      fc.divideScalar(f.p.length);
      if (inner) {
        bu.set(Math.abs(f.n.x) < 0.9 ? 1 : 0, Math.abs(f.n.x) < 0.9 ? 0 : 1, 0).cross(f.n).normalize();
        bw.crossVectors(f.n, bu);
      }
      const push = (q: THREE.Vector3): void => {
        const x = (q.x - c.x) * shrink;
        const y = (q.y - c.y) * shrink;
        const z = (q.z - c.z) * shrink;
        P.push(x, y, z);
        N.push(f.n.x, f.n.y, f.n.z);
        if (inner) U.push(q.dot(bu) * 1.4, q.dot(bw) * 1.4);
        else U.push(...uvFn(q, f.n, fc));
      };
      for (let i = 1; i + 1 < f.p.length; i++) {
        push(f.p[0]!);
        push(f.p[i]!);
        push(f.p[i + 1]!);
      }
      for (const q of f.p) verts.push((q.x - c.x) * shrink, (q.y - c.y) * shrink, (q.z - c.z) * shrink);
    }
    const cnt = P.length / 3;
    if (cnt > start) geo.addGroup(start, cnt - start, inner ? 1 : 0);
    start = cnt;
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  geo.computeBoundingSphere();
  return { geo, verts };
}
function polyCenter(faces: Face[]): THREE.Vector3 {
  const c = new THREE.Vector3();
  let k = 0;
  for (const f of faces)
    for (const q of f.p) {
      c.add(q);
      k++;
    }
  return c.divideScalar(Math.max(1, k));
}
function insidePoly(faces: Face[], x: THREE.Vector3): boolean {
  for (const f of faces) if (f.n.dot(TV.subVectors(x, f.p[0]!)) > -0.01) return false;
  return true;
}

interface Frag {
  mesh: THREE.Mesh;
  c0: THREE.Vector3;
  verts: number[];
  r: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  q: THREE.Quaternion;
  w: THREE.Vector3;
}
interface Breakable {
  g: THREE.Group;
  intact: THREE.Group;
  faces: Face[];
  uv: UvFn;
  mats: THREE.Material[];
  angle: number;
  rad: number;
  seeds: THREE.Vector3[];
  frags: Frag[];
  broken: boolean;
  next: number;
}

function demoFracture(): Scene3D {
  const st = makeStage({ w: 18, d: 9, wallH: 2.4, torches: [[-3.2, 9], [1.4, 9]], cam: [2.2, 4.7, 5.6], look: [-0.25, 0.55, 0.05], fov: 38, shadow: 5 });
  const { scene, cam, bin } = st;
  const painter = new Painter(0x0b090e);
  const knight = makeKnight(bin, 0x7a3fb0, 0xe8b13a);
  knight.g.position.set(-1.15, 0, 0.25);
  scene.add(knight.g);
  const ribbon = new Ribbon(bin, new THREE.Color(1, 0.97, 0.88), new THREE.Color(1.0, 0.55, 0.2));
  scene.add(ribbon.mesh);
  const glowTex = bin.add(texOf('glow', 64, 64, paintGlow));
  const sparks = new Sparks(bin, glowTex);
  scene.add(sparks.pts);
  const chip = bin.add(texOf('chip', 256, 256, paintChip));
  const innerMats: THREE.MeshStandardMaterial[] = [];
  const inner = (c: number): THREE.MeshStandardMaterial => {
    const m = bin.add(new THREE.MeshStandardMaterial({ color: c, map: chip, roughness: 0.95 }));
    innerMats.push(m);
    return m;
  };
  const opt = { pieces: 12, power: 1, glowInner: false };
  const objs: Breakable[] = [];
  const pivotW = knight.g.position.clone().add(PIVOT);
  const mk = (angle: number, faces: Face[], uv: UvFn, outer: THREE.MeshStandardMaterial, inMat: THREE.MeshStandardMaterial, rad: number, rotY: number): Breakable => {
    const g = new THREE.Group();
    g.position.set(pivotW.x + Math.cos(angle) * 1.55, 0, pivotW.z - Math.sin(angle) * 1.55);
    g.rotation.y = rotY;
    scene.add(g);
    const intact = new THREE.Group();
    const { geo } = facesToGeo(faces, new THREE.Vector3(), 1, uv);
    bin.add(geo);
    const m = new THREE.Mesh(geo, [outer, inMat]);
    m.castShadow = m.receiveShadow = true;
    intact.add(m);
    g.add(intact);
    return { g, intact, faces, uv, mats: [outer, inMat], angle, rad, seeds: [], frags: [], broken: false, next: 0 };
  };
  // 돌기둥 (뒤) · 항아리 (가운데) · 나무 상자 (앞)
  const stoneM = bin.add(new THREE.MeshStandardMaterial({ map: bin.add(texOf('pillar', 256, 256, paintPillar, 1.5, 2)), roughness: 0.85 }));
  const pillarFaces = lathePoly(
    [
      [0.29, 0.18],
      [0.29, 1.85],
    ],
    10,
  );
  const cylUv =
    (rep: number, h0: number, h: number): UvFn =>
    (p, n, fc) => {
      if (Math.abs(n.y) > 0.6) return [p.x * 0.8 + 0.5, p.z * 0.8 + 0.5];
      const a0 = Math.atan2(fc.z, fc.x);
      let a = Math.atan2(p.z, p.x);
      if (a - a0 > Math.PI) a -= TAU;
      if (a0 - a > Math.PI) a += TAU;
      return [(a / TAU) * rep, (p.y - h0) / h];
    };
  const pillar = mk(0.95, pillarFaces, cylUv(1, 0.18, 1.67), stoneM, inner(0xb9b4aa), 0.32, 0.2);
  const plinth = new THREE.Mesh(bin.add(new THREE.BoxGeometry(0.82, 0.18, 0.82)), bin.add(new THREE.MeshStandardMaterial({ color: 0x5c5d63, roughness: 0.85 })));
  plinth.position.y = 0.09;
  plinth.castShadow = plinth.receiveShadow = true;
  pillar.g.add(plinth);
  const potM = bin.add(new THREE.MeshStandardMaterial({ map: bin.add(texOf('pot', 512, 256, paintPot)), roughness: 0.6 }));
  const potFaces = lathePoly(
    [
      [0.2, 0],
      [0.36, 0.18],
      [0.42, 0.42],
      [0.37, 0.7],
      [0.26, 0.86],
      [0.2, 0.92],
    ],
    14,
  );
  const pot = mk(0, potFaces, cylUv(2, 0, 0.92), potM, inner(0xe39a68), 0.42, 0);
  const mouth = new THREE.Mesh(bin.add(new THREE.CircleGeometry(0.15, 20)), bin.add(new THREE.MeshStandardMaterial({ color: 0x1a0d08, roughness: 1 })));
  mouth.rotation.x = -Math.PI / 2;
  mouth.position.y = 0.925;
  pot.intact.add(mouth);
  const crateM = bin.add(new THREE.MeshStandardMaterial({ map: bin.add(texOf('crate', 256, 256, paintCrate)), roughness: 0.78 }));
  const S = 0.82;
  const boxUv: UvFn = (p, n) => {
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);
    if (ax >= ay && ax >= az) return [p.z / S + 0.5, p.y / S];
    if (ay >= az) return [p.x / S + 0.5, p.z / S + 0.5];
    return [p.x / S + 0.5, p.y / S];
  };
  const crate = mk(-0.95, boxPoly(S), boxUv, crateM, inner(0xe6c38c), 0.5, 0.35);
  objs.push(pillar, pot, crate);

  // 조각 굽기 — 한 프레임에 1.5ms 까지만 (make 는 가볍게)
  const R = rng(486);
  let bakeQ: { o: Breakable; i: number }[] = [];
  const seedAll = (): void => {
    bakeQ = [];
    for (const o of objs) {
      for (const f of o.frags) {
        scene.remove(f.mesh);
        f.mesh.geometry.dispose();
      }
      o.frags = [];
      o.seeds = [];
      let ymax = 0;
      let rmax = 0;
      for (const f of o.faces)
        for (const q of f.p) {
          ymax = Math.max(ymax, q.y);
          rmax = Math.max(rmax, Math.hypot(q.x, q.z));
        }
      // 맞는 쪽(기사 쪽) 가까이에 잘게 — 진짜로 깨지는 모양
      const hitDir = new THREE.Vector3(pivotW.x - o.g.position.x, 0, pivotW.z - o.g.position.z).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), -o.g.rotation.y);
      let guard = 0;
      while (o.seeds.length < opt.pieces && guard++ < 4000) {
        const near = o.seeds.length < opt.pieces * 0.4;
        const v = near
          ? new THREE.Vector3(hitDir.x * rmax * 0.7 + (R() - 0.5) * rmax * 0.7, Math.min(ymax * 0.9, 0.95) + (R() - 0.5) * 0.35, hitDir.z * rmax * 0.7 + (R() - 0.5) * rmax * 0.7)
          : new THREE.Vector3((R() * 2 - 1) * rmax, R() * ymax, (R() * 2 - 1) * rmax);
        if (insidePoly(o.faces, v)) o.seeds.push(v);
      }
      o.seeds.forEach((_s, i) => bakeQ.push({ o, i }));
    }
  };
  const bakeOne = (o: Breakable, i: number): void => {
    const si = o.seeds[i]!;
    let faces = o.faces;
    const n = new THREE.Vector3();
    for (let j = 0; j < o.seeds.length && faces.length; j++) {
      if (j === i) continue;
      const sj = o.seeds[j]!;
      n.subVectors(sj, si).normalize();
      faces = clipPoly(faces, n.clone(), n.dot(TV.addVectors(si, sj).multiplyScalar(0.5)));
    }
    if (faces.length < 4) return;
    const c = polyCenter(faces);
    const { geo, verts } = facesToGeo(faces, c, 0.965, o.uv);
    let r = 0;
    for (let k = 0; k < verts.length; k += 3) r = Math.max(r, Math.hypot(verts[k]!, verts[k + 1]!, verts[k + 2]!));
    const mesh = new THREE.Mesh(geo, o.mats);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.visible = false;
    scene.add(mesh);
    o.frags.push({ mesh, c0: c, verts, r, pos: new THREE.Vector3(), vel: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3() });
  };
  seedAll();
  let L = 0;
  let stop = 0;
  let prevYaw = REST;
  const pose: Pose = { yaw: REST, tilt: -0.7, lean: 0 };
  const CYC = 5.2;
  const reset = (): void => {
    L = 0;
    prevYaw = REST;
    for (const o of objs) {
      o.broken = false;
      o.intact.visible = true;
      for (const f of o.frags) f.mesh.visible = false;
    }
  };
  const shatter = (o: Breakable): void => {
    o.broken = true;
    o.intact.visible = false;
    const a = o.angle;
    const radial = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
    const tang = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const ctr = o.g.localToWorld(polyCenter(o.faces));
    for (const f of o.frags) {
      o.g.localToWorld(f.pos.copy(f.c0));
      f.q.copy(o.g.quaternion);
      const out = TV.subVectors(f.pos, ctr);
      const p = opt.power;
      f.vel
        .copy(radial)
        .multiplyScalar((0.9 + R() * 0.9) * p)
        .addScaledVector(tang, (0.7 + R() * 1.0) * p)
        .addScaledVector(out, 2.4 * p);
      f.vel.y = (1.2 + R() * 2.0) * p + out.y * 1.5;
      f.w.set(R() - 0.5, R() - 0.5, R() - 0.5).normalize().multiplyScalar((5 + R() * 9) * p);
      f.mesh.visible = true;
      f.mesh.position.copy(f.pos);
      f.mesh.quaternion.copy(f.q);
      f.mesh.scale.setScalar(1);
    }
    sparks.burst(ctr.x - radial.x * 0.3, Math.min(1, ctr.y + 0.1), ctr.z - radial.z * 0.3, R);
    stop = 0.05;
  };
  const dq = new THREE.Quaternion();
  const ax = new THREE.Vector3();
  const vv = new THREE.Vector3();
  const stepFrag = (f: Frag, dt: number, sink: number): void => {
    f.vel.y -= 9.8 * dt;
    f.pos.addScaledVector(f.vel, dt);
    const wl = f.w.length();
    if (wl > 1e-4) {
      dq.setFromAxisAngle(ax.copy(f.w).divideScalar(wl), wl * dt);
      f.q.premultiply(dq).normalize();
    }
    if (sink <= 0) {
      let minY = 1e9;
      for (let k = 0; k < f.verts.length; k += 3) {
        vv.set(f.verts[k]!, f.verts[k + 1]!, f.verts[k + 2]!).applyQuaternion(f.q);
        if (vv.y < minY) minY = vv.y;
      }
      const pen = f.pos.y + minY;
      if (pen < 0) {
        f.pos.y -= pen;
        if (f.vel.y < 0) f.vel.y = f.vel.y < -0.8 ? -f.vel.y * 0.32 : 0;
        const fr = Math.max(0, 1 - 5 * dt);
        f.vel.x *= fr;
        f.vel.z *= fr;
        // 구르기: 바닥에 닿은 조각은 미끄러지는 방향으로 돈다
        const r = Math.max(0.05, f.r * 0.6);
        f.w.lerp(ax.set(f.vel.z / r, 0, -f.vel.x / r), 0.25);
        f.w.multiplyScalar(Math.max(0, 1 - 2.5 * dt));
      }
    } else {
      f.vel.set(0, 0, 0);
      f.w.multiplyScalar(0.9);
      f.pos.y -= dt * 0.35;
    }
    f.mesh.position.copy(f.pos);
    f.mesh.quaternion.copy(f.q);
  };
  const hud = new Hud((g, w, _h, u) => {
    tag(g, `보로노이 조각 ${opt.pieces}개 · 안쪽 면은 다른 색`, 8 * u, 14 * u, 9.5 * u, '#ffd9a0');
    const left = bakeQ.length;
    if (left) tag(g, `조각 미리 굽는 중… ${left}개 남음`, w - 8 * u, 14 * u, 9 * u, '#bfe3ff', 'right');
  });
  const update = (t: number, dt: number): void => {
    st.tick(t);
    // 나눠 굽기
    if (bakeQ.length) {
      const t0 = performance.now();
      while (bakeQ.length && performance.now() - t0 < 1.5) {
        const j = bakeQ.shift()!;
        bakeOne(j.o, j.i);
      }
      hud.dirty = true;
      if (!bakeQ.length) reset();
    }
    const ready = !bakeQ.length;
    const dtl = stop > 0 ? 0 : dt;
    if (stop > 0) stop -= dt;
    if (ready) L += dtl;
    if (L >= CYC) reset();
    // 물체 다시 나타나기 (톡 솟음)
    for (const o of objs) {
      if (!o.broken) {
        const k = clamp(L / 0.45, 0, 1);
        const s = Math.max(0.02, easeOut(k) + Math.sin(k * Math.PI) * 0.14);
        const sx = 1 + (1 - Math.min(1, s)) * 0.25;
        o.intact.scale.set(sx, s, sx);
      }
    }
    // 기사 휘두르기 (자세는 i484 와 같은 함수)
    const c = clamp(L - 0.6, 0, 2.39);
    swingPose(c, pose);
    applyPose(knight, pose);
    knight.g.updateMatrixWorld(true);
    const swinging = c >= SW_T0 && c <= SW_T1 + 0.01;
    if (swinging && dtl > 0) {
      for (const o of objs) {
        if (o.broken) continue;
        const dx = o.g.position.x - pivotW.x;
        const dz = o.g.position.z - pivotW.z;
        if (sweepHits(pose.yaw, prevYaw, Math.hypot(dx, dz), Math.atan2(-dz, dx), o.rad)) shatter(o);
      }
    }
    if (dtl > 0) prevYaw = pose.yaw;
    if (c >= SW_T0 && c < SW_T1 + TRAIL) {
      const tail = swingPose(Math.max(SW_T0, Math.min(c, SW_T1) - TRAIL), { yaw: 0, tilt: 0, lean: 0 }).yaw;
      const k = c > SW_T1 ? clamp((c - SW_T1) / TRAIL, 0, 1) : 0;
      ribbon.sweep(knight.body, pose.yaw, lerp(tail, pose.yaw, k), 1 - k);
    } else ribbon.mat.uniforms.uA!.value = 0;
    // 조각 움직임
    const sink = L > CYC - 1.0 ? L - (CYC - 1.0) : 0;
    for (const o of objs) if (o.broken) for (const f of o.frags) stepFrag(f, dtl, sink);
    sparks.tick(dt);
    for (const m of innerMats) m.emissive.setHex(opt.glowInner ? 0x8a3a10 : 0x000000);
  };
  const controls: Control[] = [
    { type: 'range', label: '조각 수', min: 4, max: 30, step: 1, value: 12, on: (v) => ((opt.pieces = v), seedAll(), reset(), (hud.dirty = true)) },
    { type: 'range', label: '부수는 힘', min: 0.4, max: 2, step: 0.1, value: 1, on: (v) => (opt.power = v) },
    { type: 'toggle', label: '안쪽 면 강조', value: false, on: (v) => (opt.glowInner = v) },
    { type: 'button', label: '다시 부수기', on: () => reset() },
  ];
  return {
    scene,
    camera: cam,
    update,
    render: (r) => painter.draw(r, scene, cam, hud),
    controls,
    dispose: () => {
      for (const o of objs) for (const f of o.frags) f.mesh.geometry.dispose();
      bin.dispose();
      hud.dispose();
    },
  };
}

/* ───────────── i487 시야와 안개 ───────────── */

const MW = 28;
const MH = 18;
/** 방 9개 + 문 — 1 = 벽 */
function buildDungeon(): { grid: Uint8Array; rooms: [number, number, number, number][] } {
  const grid = new Uint8Array(MW * MH).fill(1);
  const rooms: [number, number, number, number][] = [
    [1, 1, 6, 4],
    [8, 1, 7, 5],
    [16, 1, 11, 6],
    [1, 6, 6, 4],
    [8, 7, 11, 4],
    [20, 8, 7, 4],
    [1, 11, 6, 6],
    [8, 12, 11, 5],
    [20, 13, 7, 4],
  ];
  for (const [x, y, w, h] of rooms) for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) grid[j * MW + i] = 0;
  const doors = [
    [7, 3],
    [3, 5],
    [15, 3],
    [11, 6],
    [23, 7],
    [7, 8],
    [4, 10],
    [12, 11],
    [19, 9],
    [23, 12],
    [7, 14],
    [19, 14],
  ];
  for (const [x, y] of doors) grid[y! * MW + x!] = 0;
  const pillars = [
    [19, 3], [20, 3], [19, 4], [20, 4], [23, 2], [24, 5],
    [3, 13], [4, 13], [3, 14], [4, 14],
    [13, 14], [14, 14], [10, 8], [16, 9],
  ];
  for (const [x, y] of pillars) grid[y! * MW + x!] = 1;
  return { grid, rooms };
}
function bfsPath(grid: Uint8Array, from: number, to: number): number[] {
  const prev = new Int32Array(MW * MH).fill(-1);
  const q = [from];
  prev[from] = from;
  for (let h = 0; h < q.length; h++) {
    const c = q[h]!;
    if (c === to) break;
    const x = c % MW;
    const y = (c / MW) | 0;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
      const n = ny * MW + nx;
      if (grid[n] || prev[n]! >= 0) continue;
      prev[n] = c;
      q.push(n);
    }
  }
  const out: number[] = [];
  for (let c = to; c !== from && c >= 0; c = prev[c]!) out.push(c);
  return out.reverse();
}
const FOG_VS_HEAD = 'varying vec3 vFogW;\nvarying vec3 vFogN;\n';
const FOG_VS = `#include <project_vertex>
  vec4 fogP = vec4(transformed, 1.0);
  vec3 fogN = objectNormal;
  #ifdef USE_INSTANCING
    fogP = instanceMatrix * fogP;
    fogN = mat3(instanceMatrix) * fogN;
  #endif
  vFogW = (modelMatrix * fogP).xyz;
  vFogN = normalize(mat3(modelMatrix) * fogN);`;
const FOG_FS_HEAD = 'uniform sampler2D uFogT;\nuniform vec2 uGrid;\nvarying vec3 vFogW;\nvarying vec3 vFogN;\n';
const FOG_FS = `#include <opaque_fragment>
  {
    vec2 fp = vFogW.xz - vFogN.xz * 0.3;
    vec4 fg = texture2D(uFogT, (fp + uGrid * 0.5) / uGrid);
    vec3 lit = gl_FragColor.rgb;
    float lum = dot(lit, vec3(0.299, 0.587, 0.114));
    vec3 mem = mix(vec3(lum), lit, 0.3) * vec3(0.62, 0.72, 1.0) * 1.15 + vec3(0.010, 0.012, 0.022);
    vec3 col = mem * fg.g;
    gl_FragColor.rgb = mix(col, lit, fg.r);
  }`;
/** 바닥 · 벽 · 소품 재질에 시야 텍스처를 입힌다 (빛 계산 뒤 · 톤 매핑 앞) */
function fogPatch(m: THREE.MeshStandardMaterial, fog: THREE.Texture): THREE.MeshStandardMaterial {
  const grid = new THREE.Vector2(MW, MH);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFogT = { value: fog };
    sh.uniforms.uGrid = { value: grid };
    sh.vertexShader = FOG_VS_HEAD + sh.vertexShader.replace('#include <project_vertex>', FOG_VS);
    sh.fragmentShader = FOG_FS_HEAD + sh.fragmentShader.replace('#include <opaque_fragment>', FOG_FS);
  };
  m.customProgramCacheKey = () => 'fog487';
  return m;
}
const MINI_FS = `
  varying vec2 vUv; uniform sampler2D uMap; uniform sampler2D uFog; uniform vec2 uHero;
  void main(){
    vec2 t = vec2(vUv.x, 1.0 - vUv.y);
    float wall = texture2D(uMap, t).r;
    vec4 f = texture2D(uFog, t);
    vec3 base = mix(vec3(0.42, 0.35, 0.27), vec3(0.93, 0.8, 0.56), wall);
    vec3 col = mix(vec3(0.015, 0.015, 0.03), base * 0.38 * vec3(0.7, 0.8, 1.0), f.g);
    col = mix(col, base * 1.08 + vec3(0.07, 0.04, 0.0), f.r);
    float d = length((t - uHero) * vec2(${MW}.0, ${MH}.0));
    col = mix(col, vec3(1.0, 0.86, 0.3), 1.0 - smoothstep(0.42, 0.7, d));
    gl_FragColor = vec4(col, 0.94);
  }`;

function demoFog(): Scene3D {
  const st = makeStage({ w: MW + 10, d: MH + 10, wallH: 1, noWall: true, noFloor: true, torches: [], cam: [0, 9, 6.5], look: [0, 0, 0], fov: 40, shadow: 10 });
  const { scene, cam, bin } = st;
  scene.background = new THREE.Color(0x020203);
  st.sun.intensity = 0.55;
  st.sun.castShadow = false;
  const painter = new Painter(0x020203);
  const { grid, rooms } = buildDungeon();
  // 시야 텍스처: R = 지금 보임, G = 가 본 곳
  const fogData = new Uint8Array(MW * MH * 4);
  const fogTex = bin.add(new THREE.DataTexture(fogData, MW, MH, THREE.RGBAFormat));
  fogTex.magFilter = fogTex.minFilter = THREE.LinearFilter;
  fogTex.needsUpdate = true;
  const mapData = new Uint8Array(MW * MH * 4);
  for (let i = 0; i < MW * MH; i++) mapData[i * 4] = grid[i] ? 255 : 0;
  const mapTex = bin.add(new THREE.DataTexture(mapData, MW, MH, THREE.RGBAFormat));
  mapTex.needsUpdate = true;
  const W2 = (x: number): number => x - MW / 2 + 0.5;
  const H2 = (y: number): number => y - MH / 2 + 0.5;
  // 바닥
  const floorM = fogPatch(bin.add(new THREE.MeshStandardMaterial({ map: bin.add(texOf('floor', 512, 512, paintFloor, MW / 4, MH / 4)), roughness: 0.92 })), fogTex);
  const floor = new THREE.Mesh(bin.add(new THREE.PlaneGeometry(MW, MH)), floorM);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  // 벽 (바닥에 닿은 것만 인스턴스)
  const wallM = fogPatch(bin.add(new THREE.MeshStandardMaterial({ map: bin.add(texOf('brick', 512, 512, paintBrick, 0.5, 0.5)), roughness: 0.9 })), fogTex);
  const wallG = bin.add(new THREE.BoxGeometry(1, 1.25, 1));
  wallG.translate(0, 0.625, 0);
  const wallCells: number[] = [];
  for (let y = 0; y < MH; y++)
    for (let x = 0; x < MW; x++) {
      if (!grid[y * MW + x]) continue;
      let edge = false;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < MW && ny < MH && !grid[ny * MW + nx]) edge = true;
        }
      if (edge) wallCells.push(y * MW + x);
    }
  const walls = new THREE.InstancedMesh(wallG, wallM, wallCells.length);
  const mtx = new THREE.Matrix4();
  wallCells.forEach((c, i) => walls.setMatrixAt(i, mtx.makeTranslation(W2(c % MW), 0, H2((c / MW) | 0))));
  walls.castShadow = walls.receiveShadow = true;
  scene.add(walls);
  // 소품: 통 · 보물 상자 (안개에 같이 덮인다)
  const barrelM = fogPatch(bin.add(new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.75 })), fogTex);
  const chestM = fogPatch(bin.add(new THREE.MeshStandardMaterial({ color: 0x9a4f2a, roughness: 0.6 })), fogTex);
  const goldM = fogPatch(bin.add(new THREE.MeshStandardMaterial({ color: 0xf0c050, roughness: 0.3, metalness: 0.6 })), fogTex);
  const barrelG = bin.add(new THREE.CylinderGeometry(0.22, 0.2, 0.5, 14));
  const chestG = bin.add(new THREE.BoxGeometry(0.55, 0.36, 0.38));
  const lidG = bin.add(new THREE.CylinderGeometry(0.19, 0.19, 0.55, 12, 1, false, 0, Math.PI));
  const props: [number, number, number][] = [
    [1, 1, 0], [2, 1, 0], [6, 4, 1], [13, 1, 0], [26, 1, 1], [26, 6, 0], [16, 6, 0],
    [1, 16, 1], [6, 11, 0], [18, 12, 0], [26, 16, 1], [20, 13, 0], [8, 10, 0], [26, 8, 0],
  ];
  for (const [x, y, k] of props) {
    if (grid[y * MW + x]) continue;
    const g = new THREE.Group();
    g.position.set(W2(x), 0, H2(y));
    if (k === 0) {
      const b = new THREE.Mesh(barrelG, barrelM);
      b.position.y = 0.25;
      g.add(b);
    } else {
      const c = new THREE.Mesh(chestG, chestM);
      c.position.y = 0.18;
      const l = new THREE.Mesh(lidG, goldM);
      l.rotation.z = Math.PI / 2;
      l.rotation.x = Math.PI / 2;
      l.position.y = 0.36;
      g.add(c, l);
    }
    g.traverse((o) => {
      o.castShadow = o.receiveShadow = true;
    });
    scene.add(g);
  }
  // 주인공 (작은 기사 + 횃불)
  const hero = makeKnight(bin, 0x2f7f5f, 0xe8b13a);
  hero.g.scale.setScalar(0.7);
  scene.add(hero.g);
  const torchL = new THREE.PointLight(0xffa050, 9, 11, 1.4);
  torchL.castShadow = true;
  torchL.shadow.mapSize.set(512, 512);
  torchL.shadow.bias = -0.002;
  torchL.shadow.radius = 2;
  torchL.position.set(0, 1.25, 0);
  scene.add(torchL);
  const flame = new THREE.Sprite(st.flameMat);
  flame.scale.set(0.2, 0.32, 1);
  const halo = new THREE.Sprite(st.haloMat);
  halo.scale.set(0.9, 0.9, 1);
  scene.add(flame, halo);
  // 시야 부채 (광선 끝을 이은 다각형)
  const RAYS = 160;
  const fanPos = new Float32Array((RAYS + 2) * 3);
  const fanG = bin.add(new THREE.BufferGeometry());
  fanG.setAttribute('position', new THREE.BufferAttribute(fanPos, 3).setUsage(THREE.DynamicDrawUsage));
  const fi: number[] = [];
  for (let i = 0; i < RAYS; i++) fi.push(0, i + 1, i + 2);
  fanG.setIndex(fi);
  const fan = new THREE.Mesh(fanG, bin.add(new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })));
  fan.frustumCulled = false;
  fan.renderOrder = 2;
  const edgeG = bin.add(new THREE.BufferGeometry());
  edgeG.setAttribute('position', new THREE.BufferAttribute(fanPos, 3, false));
  edgeG.setDrawRange(1, RAYS + 1);
  const edge = new THREE.Line(edgeG, bin.add(new THREE.LineBasicMaterial({ color: 0xffd890, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false })));
  edge.frustumCulled = false;
  scene.add(fan, edge);

  // 순회 길: 방 가운데를 차례로
  const order = [0, 1, 2, 5, 8, 7, 4, 3, 6, 3, 0];
  const centers = order.map((r) => {
    const [x, y, w, h] = rooms[r]!;
    let cx = x + (w >> 1);
    let cy = y + (h >> 1);
    if (grid[cy * MW + cx]) cx = x;
    if (grid[cy * MW + cx]) cy = y;
    return cy * MW + cx;
  });
  const path: number[] = [centers[0]!];
  for (let i = 0; i + 1 < centers.length; i++) path.push(...bfsPath(grid, centers[i]!, centers[i + 1]!));
  const opt = { radius: 6.5, rays: true, mini: true };
  const vis = new Float32Array(MW * MH);
  const seen = new Float32Array(MW * MH);
  let walk = 0;
  const hp = new THREE.Vector2();
  let face = 0;
  const camT = new THREE.Vector3();
  let camInit = false;
  const blocked = (x: number, y: number): boolean => {
    const cx = Math.floor(x + MW / 2);
    const cy = Math.floor(y + MH / 2);
    return cx < 0 || cy < 0 || cx >= MW || cy >= MH || grid[cy * MW + cx] === 1;
  };
  /** 주인공 → 칸까지 직선이 벽에 막히나 (벽 칸은 주인공 쪽 면까지만) */
  const sees = (tx: number, ty: number, target: number): boolean => {
    const dx = tx - hp.x;
    const dy = ty - hp.y;
    const L = Math.hypot(dx, dy);
    const n = Math.ceil(L / 0.18);
    for (let s = 1; s < n; s++) {
      const x = hp.x + (dx * s) / n;
      const y = hp.y + (dy * s) / n;
      const cx = Math.floor(x + MW / 2);
      const cy = Math.floor(y + MH / 2);
      const c = cy * MW + cx;
      if (c !== target && grid[c] === 1) return false;
    }
    return true;
  };
  const mm = { x: 0, y: 0, w: 0, h: 0 };
  const miniU = { uMap: { value: mapTex as THREE.Texture }, uFog: { value: fogTex as THREE.Texture }, uHero: { value: new THREE.Vector2() } };
  const mini = new THREE.Mesh(
    bin.add(new THREE.PlaneGeometry(1, 1)),
    bin.add(new THREE.ShaderMaterial({ uniforms: miniU, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }', fragmentShader: MINI_FS, transparent: true, depthTest: false, depthWrite: false })),
  );
  mini.renderOrder = 30;
  const hud = new Hud((g, _w, h, u) => {
    tag(g, `시야 = 벽에 가리는 광선 · 반지름 ${opt.radius}칸`, 8 * u, 14 * u, 9.5 * u, '#ffd9a0');
    // 범례
    const items: [string, string][] = [
      ['#ffd27a', '지금 보임'],
      ['#56607a', '가 본 곳'],
      ['#08080c', '모름'],
    ];
    let x = 8 * u;
    const y = h - 13 * u;
    g.font = `800 ${9 * u}px ${FONT}`;
    for (const [c, s] of items) {
      const tw = g.measureText(s).width;
      g.fillStyle = 'rgba(12,10,18,0.66)';
      g.beginPath();
      g.roundRect(x, y - 8 * u, tw + 22 * u, 16 * u, 8 * u);
      g.fill();
      g.fillStyle = c;
      g.strokeStyle = 'rgba(255,255,255,0.5)';
      g.lineWidth = 1;
      g.beginPath();
      g.roundRect(x + 5 * u, y - 4 * u, 8 * u, 8 * u, 2 * u);
      g.fill();
      g.stroke();
      g.fillStyle = '#e8e8f0';
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(s, x + 16 * u, y + 0.5 * u);
      x += tw + 26 * u;
    }
    if (opt.mini) {
      g.fillStyle = 'rgba(12,10,18,0.7)';
      g.strokeStyle = 'rgba(255,214,140,0.8)';
      g.lineWidth = Math.max(1, 1.5 * u);
      g.beginPath();
      g.roundRect(mm.x - 4 * u, h - mm.y - mm.h - 4 * u, mm.w + 8 * u, mm.h + 8 * u, 5 * u);
      g.fill();
      g.stroke();
    }
  });
  hud.onResize = (w, h) => {
    const u0 = Math.min(w / 280, h / 175);
    const u = u0 <= 1 ? u0 : 1 + (u0 - 1) * 0.55;
    mm.w = Math.round(84 * u);
    mm.h = Math.round((mm.w * MH) / MW);
    mm.x = w - mm.w - 8 * u;
    mm.y = h - mm.h - 8 * u;
    mini.scale.set(mm.w, mm.h, 1);
    mini.position.set(mm.x + mm.w / 2, mm.y + mm.h / 2, 0);
  };
  hud.scene.add(mini);
  const resetMap = (): void => {
    seen.fill(0);
    vis.fill(0);
  };
  const update = (t: number, dt: number): void => {
    st.tick(t);
    // 걷기
    walk = Math.max(0, walk + dt * 2.4);
    const segs = path.length - 1;
    if (walk >= segs) {
      walk -= segs;
      resetMap();
    }
    const i0 = Math.floor(walk);
    const k = walk - i0;
    const a = path[i0]!;
    const b = path[Math.min(segs, i0 + 1)]!;
    const ax0 = W2(a % MW);
    const ay0 = H2((a / MW) | 0);
    const bx0 = W2(b % MW);
    const by0 = H2((b / MW) | 0);
    // 모서리를 부드럽게: 다음 칸 쪽으로 살짝 당김
    hp.set(lerp(ax0, bx0, k), lerp(ay0, by0, k));
    const want = Math.atan2(-(by0 - ay0), bx0 - ax0);
    let dA = want - face;
    while (dA > Math.PI) dA -= TAU;
    while (dA < -Math.PI) dA += TAU;
    face += dA * Math.min(1, dt * 10);
    hero.g.position.set(hp.x, 0, hp.y);
    hero.g.rotation.y = face;
    const stp = Math.sin(walk * Math.PI * 2);
    hero.legL.rotation.z = stp * 0.55;
    hero.legR.rotation.z = -stp * 0.55;
    hero.body.position.y = Math.abs(Math.cos(walk * Math.PI * 2)) * 0.05;
    hero.pivot.rotation.set(0, -0.3, -1.2);
    // 왼손 횃불
    const lx = Math.cos(face + 1.2) * 0.3;
    const lz = -Math.sin(face + 1.2) * 0.3;
    const fl = 0.86 + 0.1 * Math.sin(t * 13) + 0.05 * Math.sin(t * 29);
    torchL.position.set(hp.x + lx, 1.1, hp.y + lz);
    torchL.intensity = 9 * fl;
    flame.position.set(hp.x + lx, 0.95, hp.y + lz);
    flame.scale.set(0.18, 0.3 * fl, 1);
    halo.position.copy(flame.position);
    // 시야 계산 (칸마다 광선)
    const R2 = opt.radius;
    for (let y = 0; y < MH; y++)
      for (let x = 0; x < MW; x++) {
        const c = y * MW + x;
        let tx = W2(x);
        let ty = H2(y);
        const d = Math.hypot(tx - hp.x, ty - hp.y);
        let tgt = 0;
        if (d < R2 + 0.5) {
          if (grid[c]) {
            // 벽은 주인공 쪽 면을 본다
            const s = Math.min(0.48, d) / Math.max(d, 1e-3);
            tx += (hp.x - tx) * s;
            ty += (hp.y - ty) * s;
          }
          if (sees(tx, ty, c)) tgt = clamp((R2 + 0.5 - d) / 1.6, 0, 1);
        }
        vis[c] = vis[c]! + (tgt - vis[c]!) * Math.min(1, dt * 9);
        if (tgt > 0.2) seen[c] = Math.min(1, seen[c]! + dt * 3);
        fogData[c * 4] = Math.round(vis[c]! * 255);
        fogData[c * 4 + 1] = Math.round(seen[c]! * 255);
      }
    fogTex.needsUpdate = true;
    // 광선 부채
    fan.visible = edge.visible = opt.rays;
    if (opt.rays) {
      fanPos[0] = hp.x;
      fanPos[1] = 0.04;
      fanPos[2] = hp.y;
      for (let r = 0; r <= RAYS; r++) {
        const an = (r / RAYS) * TAU;
        const cx = Math.cos(an);
        const cz = Math.sin(an);
        let L = 0;
        while (L < R2 && !blocked(hp.x + cx * L, hp.y + cz * L)) L += 0.06;
        fanPos.set([hp.x + cx * L, 0.04, hp.y + cz * L], (r + 1) * 3);
      }
      fanG.attributes.position!.needsUpdate = true;
      edgeG.attributes.position!.needsUpdate = true;
    }
    miniU.uHero.value.set((hp.x + MW / 2) / MW, (hp.y + MH / 2) / MH);
    mini.visible = opt.mini;
    // 카메라는 주인공을 따라
    camT.set(hp.x, 0, hp.y + 0.3);
    if (!camInit) {
      cam.position.set(camT.x, 7.2, camT.z + 5.4);
      camInit = true;
    }
    cam.position.lerp(TV.set(camT.x, 7.2, camT.z + 5.4), Math.min(1, dt * 3));
    cam.lookAt(cam.position.x, 0, cam.position.z - 5.4);
  };
  const controls: Control[] = [
    { type: 'range', label: '시야 반지름 (칸)', min: 2, max: 12, step: 0.5, value: 6.5, on: (v) => ((opt.radius = v), (hud.dirty = true)) },
    { type: 'toggle', label: '광선(시야 부채) 보기', value: true, on: (v) => (opt.rays = v) },
    { type: 'toggle', label: '미니맵', value: true, on: (v) => ((opt.mini = v), (hud.dirty = true)) },
    { type: 'button', label: '지도 지우기 (처음부터)', on: () => resetMap() },
  ];
  return {
    scene,
    camera: cam,
    update,
    render: (r) => painter.draw(r, scene, cam, hud),
    controls,
    dispose: () => {
      bin.dispose();
      hud.dispose();
      walls.dispose();
    },
  };
}

// @@END

export const DEMOS: DemoMap = {
  i484: { kind: '3d', caption: '칼 궤적이 쓸고 간 부채꼴로 맞음 판정 — 왼쪽은 숫자만, 오른쪽은 히트스톱 · 번쩍 · 넉백 · 흔들림', make: () => demoCombat() },
  i485: { kind: '3d', caption: '베를레 점 격자 망토가 걸음 · 바람에 펄럭이고 몸 캡슐에 부딪힘 — 성벽 위 깃발도 같은 천', make: () => demoCloth() },
  i486: { kind: '3d', caption: '보로노이로 미리 잘라 둔 조각 — 맞으면 튕겨 흩어지고 구르다 사라짐, 잘린 안쪽 면은 다른 색', make: () => demoFracture() },
  i487: { kind: '3d', caption: '주인공 시야를 격자에 기록 — 지금 보이는 곳은 밝게, 가 본 곳은 어둡게, 모르는 곳은 검게 (미니맵도 같은 텍스처)', make: () => demoFog() },
};

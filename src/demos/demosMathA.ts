import * as THREE from 'three';
import type { Control, DemoMap } from './types';

/**
 * 견본 — 수학 원리 · 도형 (i360 ~ i371)
 *  원리가 눈에 보이게: 잘라 옮기기 · 펼치기 · 접기 · 자르기 · 돌리기 · 비추기 · 작도.
 *  숫자는 모두 실제 계산값 (넓이 · 각 · 길이 · 단면 · 겹침). 2D 는 캔버스, 3D 는 공유 renderer.
 */

const FONT = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const ease = (k: number): number => {
  k = clamp(k, 0, 1);
  return k * k * (3 - 2 * k);
};
const easeIO = (k: number): number => {
  k = clamp(k, 0, 1);
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
};
const easeOut = (k: number): number => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const backOut = (k: number): number => {
  k = clamp(k, 0, 1);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
};
const seg = (t: number, a: number, b: number): number => clamp((t - a) / (b - a), 0, 1);
type P2 = [number, number];

/** 숫자 → 글 (끝 0 지우기, 음수는 − 기호) */
function fmt(v: number, d = 1): string {
  const m = Math.pow(10, d);
  let s = (Math.round(v * m) / m).toFixed(d);
  if (s.includes('.')) s = s.replace(/\.?0+$/, '');
  if (s === '-0') s = '0';
  return s.replace('-', '−');
}
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
const add = (a: P2, b: P2): P2 => [a[0] + b[0], a[1] + b[1]];
const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const mul = (a: P2, k: number): P2 => [a[0] * k, a[1] * k];
const dot = (a: P2, b: P2): number => a[0] * b[0] + a[1] * b[1];
const len = (a: P2): number => Math.hypot(a[0], a[1]);
const norm = (a: P2): P2 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l];
};
const lerpP = (a: P2, b: P2, k: number): P2 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
function rotAbout(p: P2, c: P2, a: number): P2 {
  const s = Math.sin(a);
  const co = Math.cos(a);
  const x = p[0] - c[0];
  const y = p[1] - c[1];
  return [c[0] + x * co - y * s, c[1] + x * s + y * co];
}
function centroid(pts: P2[]): P2 {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p[0];
    y += p[1];
  }
  return [x / pts.length, y / pts.length];
}
function areaOf(pts: P2[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}
/** 각을 a 에 가장 가까운 같은 값으로 */
function nearAngle(a: number, b: number): number {
  while (b - a > Math.PI) b -= TAU;
  while (b - a < -Math.PI) b += TAU;
  return b;
}
/** 반평면 자르기 (f(p) ≥ 0 쪽만 남김) */
function clipHalf(poly: P2[], f: (p: P2) => number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i]!;
    const prev = poly[(i + poly.length - 1) % poly.length]!;
    const fc = f(cur);
    const fp = f(prev);
    if (fc >= 0) {
      if (fp < 0) out.push(lerpP(prev, cur, fp / (fp - fc)));
      out.push(cur);
    } else if (fp >= 0) out.push(lerpP(prev, cur, fp / (fp - fc)));
  }
  return out;
}

/* ───────────── 2D 그리기 도구 ───────────── */

const DK = { ink: '#eef3ff', dim: 'rgba(214,226,255,0.6)', acc: '#ffc44d', sky: '#7cc4ff', blue: '#4f74c4', red: '#ff5d5d' };
const PA = { ink: '#1f2a44', dim: 'rgba(31,42,68,0.58)', acc: '#ef5b3c', accD: '#b8371f', blue: '#2f6fd6', soft: 'rgba(47,111,214,0.13)' };

function reset(g: CanvasRenderingContext2D): void {
  g.globalAlpha = 1;
  g.setLineDash([]);
  g.shadowBlur = 0;
  g.shadowColor = 'transparent';
  g.globalCompositeOperation = 'source-over';
  g.lineCap = 'round';
  g.lineJoin = 'round';
}
function darkBg(g: CanvasRenderingContext2D, w: number, h: number, cell = 0, ox = 0, oy = 0): void {
  const gr = g.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.5, Math.hypot(w, h) * 0.62);
  gr.addColorStop(0, '#1d2949');
  gr.addColorStop(1, '#0a0e1b');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  if (cell > 2) grid(g, w, h, cell, ox, oy, 'rgba(150,180,255,0.05)', 'rgba(150,180,255,0.1)');
}
function paperBg(g: CanvasRenderingContext2D, w: number, h: number, cell: number, ox: number, oy: number): void {
  g.fillStyle = '#f8f4ea';
  g.fillRect(0, 0, w, h);
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(236,226,204,0.35)');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  grid(g, w, h, cell, ox, oy, 'rgba(52,104,190,0.11)', 'rgba(52,104,190,0.24)');
}
function grid(g: CanvasRenderingContext2D, w: number, h: number, cell: number, ox: number, oy: number, minor: string, major: string): void {
  g.lineWidth = 1;
  const i0 = -Math.floor(ox / cell);
  for (let i = i0, x = ox + i0 * cell; x <= w; i++, x += cell) {
    g.strokeStyle = i % 5 === 0 ? major : minor;
    g.beginPath();
    g.moveTo(Math.round(x) + 0.5, 0);
    g.lineTo(Math.round(x) + 0.5, h);
    g.stroke();
  }
  const j0 = -Math.floor(oy / cell);
  for (let j = j0, y = oy + j0 * cell; y <= h; j++, y += cell) {
    g.strokeStyle = j % 5 === 0 ? major : minor;
    g.beginPath();
    g.moveTo(0, Math.round(y) + 0.5);
    g.lineTo(w, Math.round(y) + 0.5);
    g.stroke();
  }
}
function txt(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center', weight = 700): void {
  g.font = `${weight} ${size}px ${FONT}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(s, x, y);
}
/** 폭에 맞춰 줄이는 글씨 */
function fitTxt(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, maxW: number, color: string, align: CanvasTextAlign = 'left', weight = 700): void {
  g.font = `${weight} ${size}px ${FONT}`;
  const mw = g.measureText(s).width;
  txt(g, s, x, y, mw > maxW ? (size * maxW) / mw : size, color, align, weight);
}
/** 바탕 있는 글씨 (흰 테두리) */
function txtHalo(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, halo: string, align: CanvasTextAlign = 'center', weight = 800): void {
  g.font = `${weight} ${size}px ${FONT}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.lineWidth = size * 0.28;
  g.strokeStyle = halo;
  g.strokeText(s, x, y);
  g.fillStyle = color;
  g.fillText(s, x, y);
}
function pill(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, fill: string, color: string, align: CanvasTextAlign = 'center'): void {
  g.font = `800 ${size}px ${FONT}`;
  const tw = g.measureText(s).width;
  const pw = tw + size * 1.2;
  const ph = size * 1.75;
  const x0 = align === 'center' ? x - pw / 2 : align === 'right' ? x - pw : x;
  g.fillStyle = fill;
  g.beginPath();
  g.roundRect(x0, y - ph / 2, pw, ph, ph / 2);
  g.fill();
  txt(g, s, x0 + pw / 2, y + size * 0.04, size, color, 'center', 800);
}
function poly(g: CanvasRenderingContext2D, pts: P2[], close = true): void {
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
  if (close) g.closePath();
}
function fillStroke(g: CanvasRenderingContext2D, pts: P2[], fill: string | null, stroke: string | null, lw = 1.5): void {
  poly(g, pts);
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
function line(g: CanvasRenderingContext2D, a: P2, b: P2, color: string, lw: number, dash: number[] = []): void {
  g.setLineDash(dash);
  g.strokeStyle = color;
  g.lineWidth = lw;
  g.beginPath();
  g.moveTo(a[0], a[1]);
  g.lineTo(b[0], b[1]);
  g.stroke();
  g.setLineDash([]);
}
function dotP(g: CanvasRenderingContext2D, p: P2, r: number, fill: string, stroke?: string): void {
  g.beginPath();
  g.arc(p[0], p[1], r, 0, TAU);
  g.fillStyle = fill;
  g.fill();
  if (stroke) {
    g.lineWidth = Math.max(1, r * 0.45);
    g.strokeStyle = stroke;
    g.stroke();
  }
}
/** 직각 표시 (화면 좌표, d1 · d2 는 단위 방향) */
function rightMark(g: CanvasRenderingContext2D, c: P2, d1: P2, d2: P2, sz: number, color: string, lw: number): void {
  const a = add(c, mul(d1, sz));
  const b = add(a, mul(d2, sz));
  const e = add(c, mul(d2, sz));
  g.setLineDash([]);
  g.strokeStyle = color;
  g.lineWidth = lw;
  g.beginPath();
  g.moveTo(a[0], a[1]);
  g.lineTo(b[0], b[1]);
  g.lineTo(e[0], e[1]);
  g.stroke();
}
/** 치수선 (a→b 를 off 만큼 옮겨 긋고 가운데 글씨) */
function dim(g: CanvasRenderingContext2D, a: P2, b: P2, off: P2, label: string, color: string, fs: number, lw: number, halo?: string): void {
  const A = add(a, off);
  const B = add(b, off);
  const n = norm(off);
  const tk = fs * 0.35;
  line(g, A, B, color, lw);
  line(g, add(A, mul(n, -tk)), add(A, mul(n, tk)), color, lw);
  line(g, add(B, mul(n, -tk)), add(B, mul(n, tk)), color, lw);
  const m = lerpP(A, B, 0.5);
  const tp = add(m, mul(n, fs * 0.85));
  if (halo) txtHalo(g, label, tp[0], tp[1], fs, color, halo);
  else txt(g, label, tp[0], tp[1], fs, color, 'center', 800);
}
/** 부채꼴 칠하기 (화면 각) */
function wedge(g: CanvasRenderingContext2D, c: P2, r: number, a0: number, a1: number, fill: string, stroke?: string, lw = 1): void {
  g.beginPath();
  g.moveTo(c[0], c[1]);
  g.arc(c[0], c[1], r, a0, a1);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = lw;
    g.stroke();
  }
}
/** 캔버스 포인터 (큰 화면에서 끌기) */
function pointer(): { attach(c: HTMLCanvasElement): void; x: number; y: number; down: boolean; pressed: boolean; dispose(): void } {
  let el: HTMLCanvasElement | null = null;
  const st = {
    x: -1,
    y: -1,
    down: false,
    pressed: false,
    attach(c: HTMLCanvasElement) {
      if (el === c) return;
      st.dispose();
      el = c;
      c.addEventListener('pointermove', mv);
      c.addEventListener('pointerdown', dn);
      window.addEventListener('pointerup', up);
    },
    dispose() {
      if (!el) return;
      el.removeEventListener('pointermove', mv);
      el.removeEventListener('pointerdown', dn);
      window.removeEventListener('pointerup', up);
      el = null;
    },
  };
  function pos(e: PointerEvent): void {
    const r = el!.getBoundingClientRect();
    st.x = e.clientX - r.left;
    st.y = e.clientY - r.top;
  }
  function mv(e: PointerEvent): void {
    pos(e);
  }
  function dn(e: PointerEvent): void {
    pos(e);
    st.down = true;
    st.pressed = true;
  }
  function up(): void {
    st.down = false;
  }
  return st;
}

/* ───────────── 3D 도구 ───────────── */

function disposeAll(o: THREE.Object3D): void {
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mats = (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) as THREE.Material[];
    for (const mt of mats) {
      for (const v of Object.values(mt)) if (v && (v as THREE.Texture).isTexture) (v as THREE.Texture).dispose();
      mt.dispose();
    }
  });
}
function gradTex(top: string, bot: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, top);
  gr.addColorStop(1, bot);
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** 화면 위 글씨 층 — 글이 바뀔 때만 다시 그린다 */
class Hud {
  readonly scene = new THREE.Scene();
  readonly cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  private cv = document.createElement('canvas');
  private tex: THREE.CanvasTexture;
  private key = '';
  constructor() {
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.generateMipmaps = false;
    this.tex.minFilter = THREE.LinearFilter;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }),
    );
    m.position.z = -1;
    m.renderOrder = 5;
    this.scene.add(m);
  }
  draw(rw: number, rh: number, key: string, fn: (g: CanvasRenderingContext2D, w: number, h: number, u: number) => void): void {
    const k = rw > 1400 ? 2 : 1;
    const cw = Math.max(2, Math.round(rw / k));
    const ch = Math.max(2, Math.round(rh / k));
    const full = `${key}|${cw}x${ch}`;
    if (full === this.key) return;
    this.key = full;
    if (this.cv.width !== cw || this.cv.height !== ch) {
      this.cv.width = cw;
      this.cv.height = ch;
      this.tex.dispose();
    }
    const g = this.cv.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cw, ch);
    reset(g);
    fn(g, cw, ch, Math.min(cw / 280, ch / 175));
    this.tex.needsUpdate = true;
  }
  render(r: THREE.WebGLRenderer): void {
    const ac = r.autoClear;
    r.autoClear = false;
    r.clearDepth();
    r.render(this.scene, this.cam);
    r.autoClear = ac;
  }
  dispose(): void {
    disposeAll(this.scene);
  }
}
/** 그림자 · 단면 자르기를 그릴 때만 켜고 돌려 놓기 */
function render3d(r: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.Camera, hud: Hud | null, o: { shadow?: boolean; clip?: boolean }): void {
  const se = r.shadowMap.enabled;
  const st = r.shadowMap.type;
  const lc = r.localClippingEnabled;
  if (o.shadow) {
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
  }
  if (o.clip) r.localClippingEnabled = true;
  r.render(scene, cam);
  if (hud) hud.render(r);
  r.shadowMap.enabled = se;
  r.shadowMap.type = st;
  r.localClippingEnabled = lc;
}
/** 짙은 무대 (하늘 그러데이션 · 바닥 · 모눈 · 빛) */
function studio(scene: THREE.Scene, opt: { floorY?: number; grid?: boolean; shadowBox?: number } = {}): THREE.DirectionalLight {
  scene.background = gradTex('#1d2848', '#080c18');
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a2030, 1.0));
  const sun = new THREE.DirectionalLight(0xffffff, 2.3);
  sun.position.set(3.5, 7, 4.5);
  sun.castShadow = true;
  const sb = opt.shadowBox ?? 5;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -sb;
  sun.shadow.camera.right = sb;
  sun.shadow.camera.top = sb;
  sun.shadow.camera.bottom = -sb;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 30;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x8fb4ff, 0.7);
  rim.position.set(-5, 3, -4);
  scene.add(rim);
  const fy = opt.floorY ?? 0;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(16, 64), new THREE.MeshStandardMaterial({ color: 0x141c31, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = fy - 0.002;
  floor.receiveShadow = true;
  scene.add(floor);
  if (opt.grid !== false) {
    const gh = new THREE.GridHelper(16, 32, 0x34416a, 0x222c4a);
    gh.position.y = fy;
    (gh.material as THREE.Material).transparent = true;
    (gh.material as THREE.Material).opacity = 0.55;
    scene.add(gh);
  }
  return sun;
}
function hudTitle(g: CanvasRenderingContext2D, u: number, title: string, sub: string, subColor = DK.dim): void {
  txtHalo(g, title, 14 * u, 17 * u, 14 * u, DK.ink, 'rgba(8,12,24,0.75)', 'left');
  if (sub) txtHalo(g, sub, 14 * u, 35 * u, 10.5 * u, subColor, 'rgba(8,12,24,0.75)', 'left', 700);
}

const POLY_NAME = ['', '', '', '삼각형', '사각형', '오각형', '육각형', '칠각형', '팔각형', '구각형', '십각형'];

/* ═════════════ i362 전개도 자료 ═════════════ */

interface NetFace {
  pts: P2[];
  parent: number;
  angle: number;
}
interface NetDef {
  name: string;
  solid: string;
  faces: NetFace[];
}
function sqCell(c: P2): P2[] {
  return [
    [c[0], c[1]],
    [c[0] + 1, c[1]],
    [c[0] + 1, c[1] + 1],
    [c[0], c[1] + 1],
  ];
}
function cubeNet(name: string, cells: P2[], parents: number[]): NetDef {
  return { name, solid: '정육면체', faces: cells.map((c, i) => ({ pts: sqCell(c), parent: parents[i]!, angle: Math.PI / 2 })) };
}
const S32 = Math.sqrt(3) / 2;
const FACE_COL = [0x5aa9ff, 0xffd58f, 0xffb9a6, 0xbfe3ad, 0xcfc0ff, 0xa6e3e3];
const NETS: NetDef[] = [
  cubeNet('정육면체 전개도 ①', [[1, 1], [1, 0], [0, 1], [2, 1], [1, 2], [3, 1]], [-1, 0, 0, 0, 0, 3]),
  cubeNet('정육면체 전개도 ② (계단)', [[1, 1], [1, 0], [0, 0], [2, 1], [2, 2], [3, 2]], [-1, 0, 1, 0, 3, 4]),
  cubeNet('안 되는 전개도 ① (같은 쪽 두 장)', [[1, 1], [0, 1], [2, 1], [3, 1], [1, 0], [0, 0]], [-1, 0, 0, 2, 0, 1]),
  {
    name: '삼각기둥 전개도',
    solid: '삼각기둥',
    faces: [
      { pts: [[0, 0], [1.6, 0], [1.6, 1], [0, 1]], parent: -1, angle: 0 },
      { pts: [[0, 1], [1.6, 1], [1.6, 2], [0, 2]], parent: 0, angle: (Math.PI * 2) / 3 },
      { pts: [[0, -1], [1.6, -1], [1.6, 0], [0, 0]], parent: 0, angle: (Math.PI * 2) / 3 },
      { pts: [[0, 0], [0, 1], [-S32, 0.5]], parent: 0, angle: Math.PI / 2 },
      { pts: [[1.6, 0], [1.6, 1], [1.6 + S32, 0.5]], parent: 0, angle: Math.PI / 2 },
    ],
  },
  {
    name: '사각뿔 전개도',
    solid: '사각뿔',
    faces: [
      { pts: [[0, 0], [1, 0], [1, 1], [0, 1]], parent: -1, angle: 0 },
      { pts: [[0, 0], [1, 0], [0.5, -S32]], parent: 0, angle: Math.PI - Math.acos(1 / Math.sqrt(3)) },
      { pts: [[1, 0], [1, 1], [1 + S32, 0.5]], parent: 0, angle: Math.PI - Math.acos(1 / Math.sqrt(3)) },
      { pts: [[1, 1], [0, 1], [0.5, 1 + S32]], parent: 0, angle: Math.PI - Math.acos(1 / Math.sqrt(3)) },
      { pts: [[0, 1], [0, 0], [-S32, 0.5]], parent: 0, angle: Math.PI - Math.acos(1 / Math.sqrt(3)) },
    ],
  },
  cubeNet('안 되는 전개도 ② (2 × 3 직사각형)', [[1, 0], [0, 0], [2, 0], [1, 1], [0, 1], [2, 1]], [-1, 0, 0, 0, 3, 3]),
];

/* ═════════════ 견본들 ═════════════ */

export const DEMOS: DemoMap = {
  /* ───── i360 넓이 바꾸기 (등적 변형) ───── */
  i360: {
    kind: '2d',
    caption: '평행사변형의 삼각형 조각을 오려 옮기면 직사각형, 삼각형 두 장은 평행사변형 — 넓이는 그대로',
    make() {
      const B = 6;
      const H = 4;
      const D = 4.8;
      let s = 2;
      let mode = 0;
      let t0 = 0;
      let req = false;
      const controls: Control[] = [
        { type: 'range', label: '장면 (0 자동 · 1 평행사변형 · 2 삼각형)', min: 0, max: 2, step: 1, value: 0, on: (v) => ((mode = v), (req = true)) },
        { type: 'range', label: '기울기 (윗변을 민 칸)', min: 1, max: 4, step: 0.5, value: 2, on: (v) => (s = v) },
        { type: 'button', label: '다시', on: () => (req = true) },
      ];
      return {
        controls,
        draw(g, w, h, t) {
          reset(g);
          if (req) {
            t0 = t;
            req = false;
          }
          const tt = Math.max(0, t - t0);
          const u = Math.min(w / 280, h / 175);
          let scene: number;
          let lt: number;
          if (mode === 0) {
            const k = tt % (D * 2);
            scene = k < D ? 0 : 1;
            lt = k - scene * D;
          } else {
            scene = mode - 1;
            lt = tt % D;
          }
          const cell = Math.min((w * 0.86) / 10.4, (h * 0.47) / H);
          const ox = Math.round(w / 2 - ((B + s) * cell) / 2);
          const oy = Math.round(h * 0.79);
          paperBg(g, w, h, cell, ox, oy);
          const S = (p: P2): P2 => [ox + p[0] * cell, oy - p[1] * cell];
          const lw = Math.max(1.6, 2 * u);
          const fs = 11 * u;
          g.globalAlpha = 1 - ease(seg(lt, D - 0.4, D));
          if (scene === 0) {
            const cut = seg(lt, 0.45, 1.05);
            const mv = easeIO(seg(lt, 1.2, 2.45));
            const done = ease(seg(lt, 2.45, 2.85));
            const rest: P2[] = [[s, 0], [B, 0], [B + s, H], [s, H]];
            const lift = Math.sin(mv * Math.PI) * 0.6;
            const tri = ([[0, 0], [s, 0], [s, H]] as P2[]).map((p) => [p[0] + B * mv, p[1] + lift] as P2);
            // 빈 자리
            if (mv > 0) {
              g.setLineDash([4 * u, 4 * u]);
              fillStroke(g, ([[0, 0], [s, 0], [s, H]] as P2[]).map(S), 'rgba(239,91,60,0.06)', 'rgba(239,91,60,0.55)', lw * 0.7);
              g.setLineDash([]);
            }
            fillStroke(g, rest.map(S), PA.soft, null);
            // 조각
            g.save();
            g.shadowColor = 'rgba(80,40,20,0.35)';
            g.shadowBlur = 12 * u * Math.sin(mv * Math.PI);
            g.shadowOffsetY = 5 * u * Math.sin(mv * Math.PI);
            fillStroke(g, tri.map(S), 'rgba(239,91,60,0.86)', null);
            g.restore();
            if (cut < 1) fillStroke(g, ([[0, 0], [B, 0], [B + s, H], [s, H]] as P2[]).map(S), null, PA.ink, lw);
            else {
              fillStroke(g, rest.map(S), null, PA.ink, lw);
              fillStroke(g, tri.map(S), null, PA.accD, lw);
            }
            // 자르는 선 · 높이
            if (cut > 0 && mv < 1) {
              const a = S([s, H]);
              const b = S([s, H - H * cut]);
              line(g, a, b, PA.acc, lw, [5 * u, 4 * u]);
              if (cut >= 1 && mv === 0) rightMark(g, S([s, 0]), [1, 0], [0, -1], 7 * u, PA.acc, lw * 0.7);
              txtHalo(g, `높이 ${H}`, S([s, H / 2])[0] + 22 * u, S([s, H / 2])[1], fs, PA.accD, '#f8f4ea');
            }
            // 이름 · 치수
            dim(g, S([0, 0]), S([B, 0]), [0, 9 * u], `밑변 ${B}`, PA.ink, fs * 0.95, lw * 0.55, '#f8f4ea');
            if (done > 0) {
              g.globalAlpha *= done;
              const rc: P2[] = [[s, 0], [B + s, 0], [B + s, H], [s, H]];
              fillStroke(g, rc.map(S), null, PA.accD, lw * 1.3);
              dim(g, S([B + s, 0]), S([B + s, H]), [11 * u, 0], `${H}`, PA.ink, fs, lw * 0.55, '#f8f4ea');
              const c = S([s + B / 2, H / 2]);
              txtHalo(g, `${B * H}칸`, c[0], c[1] - 7 * u, 17 * u, PA.ink, 'rgba(248,244,234,0.85)');
              pill(g, '넓이 같음 ✓', c[0], c[1] + 13 * u, 9.5 * u, PA.acc, '#fff');
              g.globalAlpha = 1 - ease(seg(lt, D - 0.4, D));
            }
            txt(g, done > 0.5 ? '직사각형으로 바꾸어도 넓이 그대로' : '평행사변형 → 직사각형', w / 2, 15 * u, 13 * u, PA.ink, 'center', 800);
            txt(g, `넓이 = 밑변 × 높이 = ${B} × ${H} = ${B * H}`, w / 2, 32 * u, 10.5 * u, done > 0.5 ? PA.accD : PA.dim, 'center', 700);
          } else {
            const tri: P2[] = [[0, 0], [B, 0], [s, H]];
            const M: P2 = [(B + s) / 2, H / 2];
            const rot = easeIO(seg(lt, 0.8, 2.3));
            const lifting = Math.sin(rot * Math.PI);
            const done = ease(seg(lt, 2.3, 2.7));
            const copy = tri.map((p) => rotAbout(p, M, Math.PI * rot));
            fillStroke(g, tri.map(S), PA.soft, PA.ink, lw);
            const show = ease(seg(lt, 0.35, 0.8));
            if (show > 0) {
              g.save();
              g.globalAlpha *= show;
              g.shadowColor = 'rgba(80,40,20,0.35)';
              g.shadowBlur = 12 * u * lifting;
              g.shadowOffsetY = 5 * u * lifting;
              fillStroke(g, copy.map(S), 'rgba(239,91,60,0.8)', null);
              g.restore();
              g.save();
              g.globalAlpha *= show;
              fillStroke(g, copy.map(S), null, PA.accD, lw);
              g.restore();
            }
            if (rot > 0 && rot < 1) {
              const m = S(M);
              dotP(g, m, 3.5 * u, PA.accD, '#fff');
              g.strokeStyle = PA.accD;
              g.lineWidth = lw * 0.7;
              g.beginPath();
              g.arc(m[0], m[1], 12 * u, Math.PI, Math.PI + Math.PI * rot, false);
              g.stroke();
            }
            dim(g, S([0, 0]), S([B, 0]), [0, 9 * u], `밑변 ${B}`, PA.ink, fs * 0.95, lw * 0.55, '#f8f4ea');
            if (done > 0) {
              g.globalAlpha *= done;
              fillStroke(g, ([[0, 0], [B, 0], [B + s, H], [s, H]] as P2[]).map(S), null, PA.ink, lw * 1.3);
              line(g, S([s, H]), S([s, 0]), PA.blue, lw * 0.8, [4 * u, 3 * u]);
              rightMark(g, S([s, 0]), [1, 0], [0, -1], 6 * u, PA.blue, lw * 0.6);
              txtHalo(g, `높이 ${H}`, S([s, H * 0.3])[0] - 4 * u, S([s, H * 0.3])[1], fs * 0.9, PA.blue, '#f8f4ea', 'right');
              const c1 = S(centroid(tri));
              const c2 = S(centroid(copy));
              txtHalo(g, `${(B * H) / 2}`, c1[0], c1[1], 14 * u, PA.ink, 'rgba(248,244,234,0.8)');
              txtHalo(g, `${(B * H) / 2}`, c2[0], c2[1], 14 * u, '#fff', 'rgba(184,55,31,0.6)');
              g.globalAlpha = 1 - ease(seg(lt, D - 0.4, D));
            }
            txt(g, done > 0.5 ? '삼각형 두 장 = 평행사변형 하나' : '삼각형을 돌려 붙이면?', w / 2, 15 * u, 13 * u, PA.ink, 'center', 800);
            txt(g, `삼각형 넓이 = ${B} × ${H} ÷ 2 = ${(B * H) / 2}`, w / 2, 32 * u, 10.5 * u, done > 0.5 ? PA.accD : PA.dim, 'center', 700);
          }
          reset(g);
        },
      };
    },
  },

  /* ───── i361 원 넓이 (부채꼴 재배열) ───── */
  i361: {
    kind: '2d',
    caption: '원을 부채꼴로 잘라 엇갈려 늘어놓으면 가로 πr · 세로 r 인 직사각형에 가까워짐 → 넓이 πr²',
    make() {
      let n = 12;
      let ideal = true;
      let t0 = 0;
      let req = false;
      const PER = 6.6;
      const controls: Control[] = [
        { type: 'range', label: '조각 수 n', min: 4, max: 48, step: 2, value: 12, on: (v) => ((n = v), (req = true)) },
        { type: 'toggle', label: '직사각형 테두리', value: true, on: (v) => (ideal = v) },
        { type: 'button', label: '다시', on: () => (req = true) },
      ];
      return {
        controls,
        draw(g, w, h, t) {
          reset(g);
          if (req) {
            t0 = t;
            req = false;
          }
          const lt = Math.max(0, t - t0) % PER;
          const u = Math.min(w / 280, h / 175);
          darkBg(g, w, h);
          const a = TAU / n;
          const R = Math.min(w * 0.245, h * 0.33);
          const hs = R * Math.sin(a / 2);
          const Rc = R * Math.cos(a / 2);
          const cx = w / 2;
          const cyC = h * 0.56;
          const bulge = R - Rc;
          const yTop = Rc - R;
          const xm = ((n - 1) * hs) / 2;
          const ym = (yTop + R) / 2;
          const org: P2 = [cx - xm, h * 0.6 - ym];
          const half = n / 2;
          const cutP = seg(lt, 0.2, 0.9);
          const lbl = ease(seg(lt, 3.0, 3.4)) * (1 - ease(seg(lt, 5.0, 5.3)));
          // 칼금 (원 상태)
          type Sec = { apex: P2; th: number; top: boolean };
          const secs: Sec[] = [];
          for (let k = 0; k < n; k++) {
            const top = k % 2 === 1;
            const j = top ? (k - 1) / 2 : k / 2;
            const thC = top ? Math.PI + (j + 0.5) * a : Math.PI - (j + 0.5) * a;
            const thR = top ? Math.PI * 1.5 : Math.PI / 2;
            const apexR: P2 = [org[0] + k * hs, org[1] + (top ? Rc : 0)];
            const st = 0.95 + (k / n) * 0.75;
            const goP = easeIO(seg(lt, st, st + 1.15));
            const backP = easeIO(seg(lt, 5.3 + (1 - k / n) * 0.35, 5.3 + (1 - k / n) * 0.35 + 0.85));
            const p = goP * (1 - backP);
            const lift = Math.sin(p * Math.PI) * R * 0.18;
            const apex: P2 = [lerp(cx, apexR[0], p), lerp(cyC, apexR[1], p) - lift];
            secs.push({ apex, th: lerp(thC, nearAngle(thC, thR), p), top });
            void half;
          }
          for (const sc of secs) {
            wedge(g, sc.apex, R, sc.th - a / 2, sc.th + a / 2, sc.top ? DK.acc : '#5d82cf', 'rgba(10,14,27,0.9)', Math.max(1, 1.2 * u));
          }
          // 칼금 그리기 (처음)
          if (lt < 1.0 && cutP > 0) {
            g.strokeStyle = 'rgba(10,14,27,0.95)';
            g.lineWidth = Math.max(1, 1.4 * u);
            const m = Math.ceil(n * cutP);
            for (let k = 0; k < m; k++) {
              const th = Math.PI + k * a;
              g.beginPath();
              g.moveTo(cx, cyC);
              g.lineTo(cx + Math.cos(th) * R, cyC + Math.sin(th) * R);
              g.stroke();
            }
          }
          const circ = 1 - ease(seg(lt, 0.9, 1.3)) + ease(seg(lt, 6.1, 6.5));
          if (circ > 0.01) {
            g.globalAlpha = clamp(circ, 0, 1);
            line(g, [cx, cyC], [cx + R, cyC], '#fff', 1.6 * u);
            dotP(g, [cx, cyC], 2.6 * u, '#fff');
            txtHalo(g, 'r', cx + R / 2, cyC - 8 * u, 12 * u, '#fff', 'rgba(10,14,27,0.8)');
            g.globalAlpha = 1;
          }
          if (lbl > 0) {
            g.globalAlpha = lbl;
            const x0 = org[0];
            const x1 = org[0] + n * hs;
            const ty = org[1] + yTop - 9 * u;
            // 위 반둘레
            g.strokeStyle = DK.acc;
            g.lineWidth = 1.4 * u;
            g.beginPath();
            g.moveTo(x0, ty + 4 * u);
            g.quadraticCurveTo(x0, ty, x0 + 6 * u, ty);
            g.lineTo(x1 - 6 * u, ty);
            g.quadraticCurveTo(x1, ty, x1, ty + 4 * u);
            g.stroke();
            txtHalo(g, 'πr  (원둘레의 반)', (x0 + x1) / 2, ty - 9 * u, 11 * u, DK.acc, 'rgba(10,14,27,0.85)');
            // 높이 r
            const lx = org[0] - hs - 8 * u;
            line(g, [lx, org[1] - bulge / 2], [lx, org[1] + R - bulge / 2], '#fff', 1.3 * u);
            txtHalo(g, 'r', lx - 8 * u, org[1] + R / 2 - bulge / 2, 12 * u, '#fff', 'rgba(10,14,27,0.85)');
            if (ideal) {
              const rw = Math.PI * R;
              g.setLineDash([5 * u, 4 * u]);
              g.strokeStyle = 'rgba(255,255,255,0.75)';
              g.lineWidth = 1.2 * u;
              g.strokeRect(cx - rw / 2, org[1] - bulge / 2, rw, R);
              g.setLineDash([]);
            }
            g.globalAlpha = 1;
          }
          // 글씨
          txt(g, lbl > 0.4 ? '넓이 ≈ r × πr = πr²' : '원 넓이 = ?', w / 2, 15 * u, 13.5 * u, lbl > 0.4 ? DK.acc : DK.ink, 'center', 800);
          txt(g, `부채꼴 ${n}조각`, 12 * u, h - 12 * u, 10 * u, DK.dim, 'left', 700);
          if (lbl > 0.4) txt(g, `예) r = 5 → 5 × ${fmt(Math.PI * 5, 1)} ≈ ${fmt(Math.PI * 25, 1)}`, w - 12 * u, h - 12 * u, 10 * u, DK.dim, 'right', 700);
          reset(g);
        },
      };
    },
  },

  /* ───── i362 전개도 접기 · 펴기 ───── */
  i362: {
    kind: '3d',
    caption: '전개도가 경첩처럼 접혀 정육면체 · 삼각기둥 · 사각뿔이 됨 — 안 되는 전개도는 겹치는 면이 빨갛게',
    make(T) {
      const scene = new T.Scene();
      const sun = studio(scene, { shadowBox: 4 });
      void sun;
      const cam = new T.PerspectiveCamera(40, 1.6, 0.1, 100);
      const hud = new Hud();
      const UP = new T.Vector3(0, 1, 0);
      type Built = {
        def: NetDef;
        group: THREE.Group;
        meshes: THREE.Mesh[];
        mats: THREE.MeshStandardMaterial[];
        P: THREE.Vector3[];
        axis: THREE.Vector3[];
        sign: number[];
        depth: number[];
        overlap: boolean[];
        center: THREE.Vector3;
        solidC: THREE.Vector3;
        bad: boolean;
        M: THREE.Matrix4[];
        ghosts: THREE.Object3D[];
        nOver: number;
      };
      const tmpA = new T.Matrix4();
      const tmpB = new T.Matrix4();
      const tmpC = new T.Matrix4();
      const built: Built[] = NETS.map((def, ni) => {
        const group = new T.Group();
        const meshes: THREE.Mesh[] = [];
        const mats: THREE.MeshStandardMaterial[] = [];
        const P: THREE.Vector3[] = [];
        const axis: THREE.Vector3[] = [];
        const sign: number[] = [];
        const depth: number[] = [];
        let mnx = 1e9;
        let mxx = -1e9;
        let mnz = 1e9;
        let mxz = -1e9;
        def.faces.forEach((f, i) => {
          const pos: number[] = [];
          for (let k = 1; k < f.pts.length - 1; k++) {
            for (const p of [f.pts[0]!, f.pts[k]!, f.pts[k + 1]!]) pos.push(p[0], 0, p[1]);
          }
          for (const p of f.pts) {
            mnx = Math.min(mnx, p[0]);
            mxx = Math.max(mxx, p[0]);
            mnz = Math.min(mnz, p[1]);
            mxz = Math.max(mxz, p[1]);
          }
          const geo = new T.BufferGeometry();
          geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
          geo.computeVertexNormals();
          const mat = new T.MeshStandardMaterial({
            color: FACE_COL[i % FACE_COL.length]!,
            roughness: 0.55,
            emissive: 0x000000,
            side: T.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -(1 + i * 0.6),
            polygonOffsetUnits: -(1 + i),
          });
          const mesh = new T.Mesh(geo, mat);
          mesh.castShadow = true;
          mesh.matrixAutoUpdate = false;
          const lp: number[] = [];
          for (let k = 0; k < f.pts.length; k++) {
            const a = f.pts[k]!;
            const b = f.pts[(k + 1) % f.pts.length]!;
            lp.push(a[0], 0, a[1], b[0], 0, b[1]);
          }
          const lg = new T.BufferGeometry();
          lg.setAttribute('position', new T.Float32BufferAttribute(lp, 3));
          const edges = new T.LineSegments(lg, new T.LineBasicMaterial({ color: 0x24345e }));
          mesh.add(edges);
          group.add(mesh);
          meshes.push(mesh);
          mats.push(mat);
          // 경첩
          if (f.parent < 0) {
            P.push(new T.Vector3());
            axis.push(new T.Vector3(1, 0, 0));
            sign.push(1);
            depth.push(0);
          } else {
            const par = def.faces[f.parent]!;
            const sh = f.pts.filter((p) => par.pts.some((q) => Math.abs(q[0] - p[0]) < 1e-6 && Math.abs(q[1] - p[1]) < 1e-6));
            const a = new T.Vector3(sh[0]![0], 0, sh[0]![1]);
            const b = new T.Vector3(sh[1]![0], 0, sh[1]![1]);
            const ax = b.clone().sub(a).normalize();
            const c = centroid(f.pts);
            const cc = new T.Vector3(c[0], 0, c[1]).sub(a).applyAxisAngle(ax, 0.1);
            P.push(a);
            axis.push(ax);
            sign.push(cc.y > 0 ? 1 : -1);
            depth.push(depth[f.parent]! + 1);
          }
        });
        const M = def.faces.map(() => new T.Matrix4());
        const b: Built = {
          def,
          group,
          meshes,
          mats,
          P,
          axis,
          sign,
          depth,
          overlap: def.faces.map(() => false),
          center: new T.Vector3((mnx + mxx) / 2, 0, (mnz + mxz) / 2),
          solidC: new T.Vector3(),
          bad: false,
          M,
          ghosts: [],
          nOver: 0,
        };
        // 다 접었을 때 — 겹침 계산
        fold(b, def.faces.map(() => 1));
        const cs = def.faces.map((f, i) => {
          const c = centroid(f.pts);
          return new T.Vector3(c[0], 0, c[1]).applyMatrix4(M[i]!);
        });
        const ns = def.faces.map((_f, i) => UP.clone().transformDirection(M[i]!));
        for (let i = 0; i < cs.length; i++)
          for (let j = i + 1; j < cs.length; j++)
            if (cs[i]!.distanceTo(cs[j]!) < 0.03 && Math.abs(ns[i]!.dot(ns[j]!)) > 0.99) {
              b.overlap[i] = true;
              b.overlap[j] = true;
              b.bad = true;
            }
        b.nOver = b.overlap.filter((v) => v).length;
        if (b.bad && def.solid === '정육면체') {
          const c0 = centroid(def.faces[0]!.pts);
          const cc = new T.Vector3(c0[0], 0.5, c0[1]);
          for (const d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1]] as [number, number, number][]) {
            const dv = new T.Vector3(...d);
            const at = cc.clone().addScaledVector(dv, 0.5);
            if (cs.some((c) => c.distanceTo(at) < 0.03)) continue;
            const gm = new T.Mesh(
              new T.PlaneGeometry(0.96, 0.96),
              new T.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.18, side: T.DoubleSide, depthWrite: false }),
            );
            gm.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), dv);
            gm.position.copy(at);
            const ol = new T.LineSegments(new T.EdgesGeometry(new T.PlaneGeometry(0.96, 0.96)), new T.LineDashedMaterial({ color: 0xff7070, dashSize: 0.08, gapSize: 0.06 }));
            ol.computeLineDistances();
            gm.add(ol);
            gm.visible = false;
            group.add(gm);
            b.ghosts.push(gm);
          }
        }
        for (const c of cs) b.solidC.add(c);
        b.solidC.multiplyScalar(1 / cs.length);
        group.position.set(-b.center.x, 0.025, -b.center.z);
        group.visible = ni === 0;
        scene.add(group);
        return b;
      });
      function fold(b: Built, ks: number[]): void {
        b.def.faces.forEach((f, i) => {
          const m = b.M[i]!;
          if (f.parent < 0) {
            m.identity();
            return;
          }
          const p = b.P[i]!;
          tmpA.makeTranslation(p.x, p.y, p.z);
          tmpB.makeRotationAxis(b.axis[i]!, b.sign[i]! * f.angle * ks[i]!);
          tmpC.makeTranslation(-p.x, -p.y, -p.z);
          m.copy(b.M[f.parent]!).multiply(tmpA).multiply(tmpB).multiply(tmpC);
        });
      }
      let pick = 0;
      let auto = true;
      let amount = 100;
      let t0 = 0;
      let req = false;
      const PER = 5.6;
      let cur = 0;
      let rw = 280;
      let rh = 175;
      const target = new T.Vector3();
      return {
        scene,
        camera: cam,
        controls: [
          { type: 'range', label: '전개도 (0 자동 · 1 ~ 6)', min: 0, max: 6, step: 1, value: 0, on: (v) => ((pick = v), (req = true)) },
          { type: 'toggle', label: '저절로 접기', value: true, on: (v) => (auto = v) },
          { type: 'range', label: '접은 정도 % (저절로 끄면)', min: 0, max: 100, step: 1, value: 100, on: (v) => (amount = v) },
          { type: 'button', label: '다시 접기', on: () => (req = true) },
        ],
        resize(w, h) {
          rw = w;
          rh = h;
        },
        update(t) {
          if (req) {
            t0 = t;
            req = false;
          }
          const tt = Math.max(0, t - t0);
          const ni = pick > 0 ? pick - 1 : Math.floor(tt / PER) % NETS.length;
          const lt = tt % PER;
          if (ni !== cur) {
            built[cur]!.group.visible = false;
            cur = ni;
          }
          const b = built[cur]!;
          b.group.visible = true;
          const back = auto ? easeIO(seg(lt, 4.65, 5.45)) : 0;
          const ks = b.def.faces.map((_f, i) => {
            if (!auto) return amount / 100;
            const d = b.depth[i]!;
            return easeIO(seg(lt, 0.45 + (d - 1) * 0.38, 1.55 + (d - 1) * 0.38)) * (1 - back);
          });
          fold(b, ks);
          b.meshes.forEach((m, i) => m.matrix.copy(b.M[i]!));
          const all = Math.min(...ks.slice(1));
          const red = b.bad && all > 0.985;
          const pulse = 0.5 + 0.5 * Math.sin(t * 9);
          for (const gm of b.ghosts) gm.visible = red;
          b.mats.forEach((m, i) => {
            if (red && b.overlap[i]) {
              m.color.setHex(0xff4d4d);
              m.emissive.setHex(0x661010).multiplyScalar(pulse);
            } else {
              m.color.setHex(FACE_COL[i % FACE_COL.length]!);
              m.emissive.setHex(FACE_COL[i % FACE_COL.length]!).multiplyScalar(0.16);
            }
          });
          const avg = ks.slice(1).reduce((s, v) => s + v, 0) / Math.max(1, ks.length - 1);
          target.set(0, 0, 0).lerp(b.solidC.clone().sub(b.center).setY(b.solidC.y * 0.9), avg);
          const az = 0.7 + t * 0.16;
          const el = 0.72;
          const r = lerp(7.4, 4.9, avg);
          cam.position.set(target.x + Math.sin(az) * Math.cos(el) * r, target.y + Math.sin(el) * r, target.z + Math.cos(az) * Math.cos(el) * r);
          cam.lookAt(target);
          const deg = (b.def.faces[1]!.angle * 180) / Math.PI;
          const degs = [...new Set(b.def.faces.slice(1).map((f) => fmt((f.angle * 180) / Math.PI, 1)))].join('° · ');
          void deg;
          const status = all > 0.985 ? (b.bad ? 'bad' : 'ok') : 'fold';
          hud.draw(rw, rh, `${cur}|${status}`, (g, _w, h, u) => {
            hudTitle(g, u, b.def.name, `접는 각 ${degs}° · 면 ${b.def.faces.length}개`);
            if (status === 'ok') pill(g, `✓ ${b.def.solid} 완성`, 14 * u, h - 18 * u, 11 * u, 'rgba(90,169,255,0.92)', '#08101f', 'left');
            else if (status === 'bad')
              pill(g, `✕ 겹치는 면 ${b.nOver}장 · 빈 곳 ${b.ghosts.length}곳 — 정육면체가 안 돼요`, 14 * u, h - 18 * u, 10.5 * u, 'rgba(255,77,77,0.95)', '#fff', 'left');
          });
        },
        render(r) {
          render3d(r, scene, cam, hud, { shadow: true });
        },
        dispose() {
          disposeAll(scene);
          hud.dispose();
        },
      };
    },
  },

  /* ───── i363 입체 단면 자르기 ───── */
  i363: {
    kind: '3d',
    caption: '평면을 기울이고 옮기면 정육면체 단면이 삼각형 → 사각형 → 오각형 → 육각형 (실제 평면 교차 계산)',
    make(T) {
      const scene = new T.Scene();
      studio(scene, { floorY: -1, shadowBox: 4 });
      const cam = new T.PerspectiveCamera(36, 1.6, 0.1, 100);
      const hud = new Hud();
      const plLow = new T.Plane(new T.Vector3(0, -1, 0), 0);
      const plUp = new T.Plane(new T.Vector3(0, 1, 0), 0);
      const box = new T.BoxGeometry(2, 2, 2);
      const solid = new T.Mesh(box, new T.MeshStandardMaterial({ color: 0xdfe7f5, roughness: 0.5, clippingPlanes: [plLow], clipShadows: true }));
      solid.castShadow = true;
      solid.receiveShadow = true;
      scene.add(solid);
      const ghost = new T.Mesh(
        box,
        new T.MeshStandardMaterial({ color: 0x9fc2ff, roughness: 0.3, transparent: true, opacity: 0.12, depthWrite: false, clippingPlanes: [plUp] }),
      );
      scene.add(ghost);
      const edges = new T.LineSegments(new T.EdgesGeometry(box), new T.LineBasicMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0.85 }));
      scene.add(edges);
      // 단면 (뚜껑)
      const capGeo = new T.BufferGeometry();
      const capPos = new Float32Array(12 * 3);
      const capNor = new Float32Array(12 * 3);
      capGeo.setAttribute('position', new T.BufferAttribute(capPos, 3));
      capGeo.setAttribute('normal', new T.BufferAttribute(capNor, 3));
      const cap = new T.Mesh(capGeo, new T.MeshStandardMaterial({ color: 0xff7a45, roughness: 0.45, emissive: 0x3a1206, side: T.DoubleSide }));
      scene.add(cap);
      const outGeo = new T.BufferGeometry();
      const outPos = new Float32Array(7 * 3);
      outGeo.setAttribute('position', new T.BufferAttribute(outPos, 3));
      const outline = new T.Line(outGeo, new T.LineBasicMaterial({ color: 0xffffff }));
      scene.add(outline);
      // 자르는 평면
      const planeM = new T.Mesh(
        new T.PlaneGeometry(3.6, 3.6),
        new T.MeshBasicMaterial({ color: 0xffb08a, transparent: true, opacity: 0.12, side: T.DoubleSide, depthWrite: false }),
      );
      const pe = new T.LineLoop(
        new T.BufferGeometry().setFromPoints([new T.Vector3(-1.8, -1.8, 0), new T.Vector3(1.8, -1.8, 0), new T.Vector3(1.8, 1.8, 0), new T.Vector3(-1.8, 1.8, 0)]),
        new T.LineBasicMaterial({ color: 0xffb08a, transparent: true, opacity: 0.6 }),
      );
      planeM.add(pe);
      scene.add(planeM);
      // 단면 모양 그림 (오른쪽 위)
      const icv = document.createElement('canvas');
      icv.width = icv.height = 256;
      const itex = new T.CanvasTexture(icv);
      itex.colorSpace = T.SRGBColorSpace;
      const inset = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: itex, transparent: true, depthTest: false, toneMapped: false }));
      inset.position.z = -0.5;
      inset.renderOrder = 6;
      hud.scene.add(inset);
      const V: THREE.Vector3[] = [];
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) V.push(new T.Vector3(x, y, z));
      const E: [THREE.Vector3, THREE.Vector3][] = [];
      for (let i = 0; i < 8; i++)
        for (let j = i + 1; j < 8; j++) if (Math.abs(V[i]!.distanceTo(V[j]!) - 2) < 1e-6) E.push([V[i]!, V[j]!]);
      const SEGS = [new T.Vector3(1, 1, 1).normalize(), new T.Vector3(1, 0.75, 0.35).normalize(), new T.Vector3(0, 0.5, 1).normalize()];
      let auto = true;
      let tilt = 55;
      let az = 45;
      let pos = 0;
      let rw = 280;
      let rh = 175;
      const n = new T.Vector3();
      const tq = new T.Quaternion();
      function section(nn: THREE.Vector3, d: number): THREE.Vector3[] {
        const out: THREE.Vector3[] = [];
        for (const [p, q] of E) {
          const sp = nn.dot(p) - d;
          const sq = nn.dot(q) - d;
          let x: THREE.Vector3 | null = null;
          if (Math.abs(sp) < 1e-9) x = p.clone();
          else if (Math.abs(sq) < 1e-9) x = q.clone();
          else if (sp * sq < 0) x = p.clone().lerp(q, sp / (sp - sq));
          if (x && !out.some((o) => o.distanceTo(x!) < 1e-6)) out.push(x);
        }
        if (out.length < 3) return out;
        const c = new T.Vector3();
        for (const o of out) c.add(o);
        c.multiplyScalar(1 / out.length);
        const ua = Math.abs(nn.x) < 0.9 ? new T.Vector3(1, 0, 0) : new T.Vector3(0, 1, 0);
        const uu = ua.sub(nn.clone().multiplyScalar(ua.dot(nn))).normalize();
        const vv = nn.clone().cross(uu);
        out.sort((A, B) => {
          const a = A.clone().sub(c);
          const b = B.clone().sub(c);
          return Math.atan2(a.dot(vv), a.dot(uu)) - Math.atan2(b.dot(vv), b.dot(uu));
        });
        return out;
      }
      function classify(p: THREE.Vector3[]): string {
        const k = p.length;
        const L = p.map((a, i) => a.distanceTo(p[(i + 1) % k]!));
        const eqAll = L.every((l) => Math.abs(l - L[0]!) < 1e-3 * Math.max(1, L[0]!));
        const ed = p.map((a, i) => p[(i + 1) % k]!.clone().sub(a).normalize());
        if (k === 3) {
          if (eqAll) return '정삼각형';
          const iso = Math.abs(L[0]! - L[1]!) < 1e-3 || Math.abs(L[1]! - L[2]!) < 1e-3 || Math.abs(L[0]! - L[2]!) < 1e-3;
          return iso ? '이등변삼각형' : '삼각형';
        }
        if (k === 4) {
          const right = ed.every((e, i) => Math.abs(e.dot(ed[(i + 1) % 4]!)) < 1e-3);
          if (right) return eqAll ? '정사각형' : '직사각형';
          const par1 = Math.abs(Math.abs(ed[0]!.dot(ed[2]!)) - 1) < 1e-4;
          const par2 = Math.abs(Math.abs(ed[1]!.dot(ed[3]!)) - 1) < 1e-4;
          if (par1 && par2) return eqAll ? '마름모' : '평행사변형';
          if (par1 || par2) return '사다리꼴';
          return '사각형';
        }
        if (k === 5) return '오각형';
        if (k === 6) return eqAll ? '정육각형' : '육각형';
        return '';
      }
      return {
        scene,
        camera: cam,
        controls: [
          { type: 'toggle', label: '저절로 움직이기', value: true, on: (v) => (auto = v) },
          { type: 'range', label: '기울기 (°)', min: 0, max: 90, step: 1, value: 55, on: (v) => (tilt = v) },
          { type: 'range', label: '돌림 (°)', min: 0, max: 90, step: 1, value: 45, on: (v) => (az = v) },
          { type: 'range', label: '평면 위치', min: -1, max: 1, step: 0.01, value: 0, on: (v) => (pos = v) },
        ],
        resize(w, h) {
          rw = w;
          rh = h;
        },
        update(t) {
          let p: number;
          if (auto) {
            const D = 4.6;
            const si = Math.floor(t / D);
            const lt = t - si * D;
            const a = SEGS[si % SEGS.length]!;
            const pre = SEGS[(si + SEGS.length - 1) % SEGS.length]!;
            n.copy(pre).lerp(a, ease(seg(lt, 0, 0.6))).normalize();
            const dir = si % 2 === 0 ? 1 : -1;
            p = dir * -0.96 * Math.cos(Math.PI * ease(seg(lt, 0.6, D)));
          } else {
            const tr = (tilt * Math.PI) / 180;
            const ar = (az * Math.PI) / 180;
            n.set(Math.sin(tr) * Math.cos(ar), Math.cos(tr), Math.sin(tr) * Math.sin(ar)).normalize();
            p = pos * 0.98;
          }
          const dmax = Math.abs(n.x) + Math.abs(n.y) + Math.abs(n.z);
          const d = p * dmax;
          plLow.normal.copy(n).negate();
          plLow.constant = d;
          plUp.normal.copy(n);
          plUp.constant = -d;
          tq.setFromUnitVectors(new T.Vector3(0, 0, 1), n);
          planeM.quaternion.copy(tq);
          planeM.position.copy(n).multiplyScalar(d);
          const pts = section(n, d);
          const k = pts.length;
          let tri = 0;
          if (k >= 3) {
            for (let i = 1; i < k - 1; i++) {
              for (const q of [pts[0]!, pts[i]!, pts[i + 1]!]) {
                capPos[tri * 3] = q.x + n.x * 0.002;
                capPos[tri * 3 + 1] = q.y + n.y * 0.002;
                capPos[tri * 3 + 2] = q.z + n.z * 0.002;
                capNor[tri * 3] = n.x;
                capNor[tri * 3 + 1] = n.y;
                capNor[tri * 3 + 2] = n.z;
                tri++;
              }
            }
            for (let i = 0; i <= k; i++) {
              const q = pts[i % k]!;
              outPos[i * 3] = q.x + n.x * 0.004;
              outPos[i * 3 + 1] = q.y + n.y * 0.004;
              outPos[i * 3 + 2] = q.z + n.z * 0.004;
            }
          }
          capGeo.setDrawRange(0, tri);
          capGeo.attributes.position!.needsUpdate = true;
          capGeo.attributes.normal!.needsUpdate = true;
          capGeo.computeBoundingSphere();
          outGeo.setDrawRange(0, k >= 3 ? k + 1 : 0);
          outGeo.attributes.position!.needsUpdate = true;
          outGeo.computeBoundingSphere();
          // 카메라
          const ca = 0.62 + Math.sin(t * 0.25) * 0.22;
          cam.position.set(Math.sin(ca) * 6.4, 3.6, Math.cos(ca) * 6.4);
          cam.lookAt(0, -0.1, 0);
          // 그림 · 글
          const name = k >= 3 ? classify(pts) : '';
          let area = 0;
          const flat: P2[] = [];
          if (k >= 3) {
            const c = new T.Vector3();
            for (const q of pts) c.add(q);
            c.multiplyScalar(1 / k);
            const ua = Math.abs(n.x) < 0.9 ? new T.Vector3(1, 0, 0) : new T.Vector3(0, 1, 0);
            const uu = ua.sub(n.clone().multiplyScalar(ua.dot(n))).normalize();
            const vv = n.clone().cross(uu);
            for (const q of pts) {
              const r = q.clone().sub(c);
              flat.push([r.dot(uu) / 2, r.dot(vv) / 2]);
            }
            area = areaOf(flat);
          }
          const g = icv.getContext('2d')!;
          g.clearRect(0, 0, 256, 256);
          reset(g);
          g.fillStyle = 'rgba(10,14,28,0.72)';
          g.beginPath();
          g.roundRect(4, 4, 248, 248, 26);
          g.fill();
          g.strokeStyle = 'rgba(255,176,138,0.45)';
          g.lineWidth = 2;
          g.stroke();
          if (flat.length >= 3) {
            const mr = Math.max(...flat.map((q) => len(q)));
            const sc = Math.min(170, 92 / Math.max(1e-3, mr));
            const pp = flat.map((q) => [128 + q[0] * sc, 120 - q[1] * sc] as P2);
            fillStroke(g, pp, '#ff7a45', '#fff', 4);
            for (const q of pp) dotP(g, q, 6, '#fff');
            txt(g, `꼭짓점 ${k}개`, 128, 232, 22, '#ffd2bd', 'center', 800);
          }
          itex.needsUpdate = true;
          const S = Math.min(rw, rh) * 0.34;
          inset.scale.set((S * 2) / rw, (S * 2) / rh, 1);
          inset.position.x = 1 - ((S / 2 + Math.min(rw, rh) * 0.04) * 2) / rw;
          inset.position.y = 1 - ((S / 2 + Math.min(rw, rh) * 0.04) * 2) / rh;
          hud.draw(rw, rh, `${name}|${fmt(area, 2)}`, (g2, _w, _h, u) => {
            if (!name) {
              hudTitle(g2, u, '평면이 닿지 않아요', '');
              return;
            }
            txtHalo(g2, name, 14 * u, 19 * u, 17 * u, '#ffb08a', 'rgba(8,12,24,0.8)', 'left');
            txtHalo(g2, `${POLY_NAME[k] ?? ''} · 단면 넓이 ${fmt(area, 2)} (모서리 1)`, 14 * u, 39 * u, 10 * u, DK.dim, 'rgba(8,12,24,0.8)', 'left', 700);
          });
        },
        render(r) {
          render3d(r, scene, cam, hud, { shadow: true, clip: true });
        },
        dispose() {
          disposeAll(scene);
          hud.dispose();
        },
      };
    },
  },

  /* ───── i364 피타고라스 증명 ───── */
  i364: {
    kind: '2d',
    caption: 'a² 와 b² 의 조각이 미끄러져 c² 를 빈틈없이 채움 — 페리갈 · 재배열 · 바스카라 세 가지 증명',
    make() {
      let pick = 0;
      let A = 3;
      const Bv = 4;
      let t0 = 0;
      let req = false;
      const PER = 7.6;
      const controls: Control[] = [
        { type: 'range', label: '증명 (0 자동 · 1 조각 옮기기 · 2 재배열 · 3 바스카라)', min: 0, max: 3, step: 1, value: 0, on: (v) => ((pick = v), (req = true)) },
        { type: 'range', label: '짧은 변 a (b = 4)', min: 2, max: 3.6, step: 0.2, value: 3, on: (v) => (A = v) },
        { type: 'button', label: '다시', on: () => (req = true) },
      ];
      type Piece = { poly: P2[]; mv: P2; fill: string };
      function build(pr: number, a: number, b: number): { pieces: Piece[]; bounds: [number, number, number, number] } {
        const c = Math.hypot(a, b);
        if (pr === 0) {
          const d1: P2 = [-b / c, a / c];
          const d2: P2 = [a / c, b / c];
          const M: P2 = [b / 2, -b / 2];
          const sq: P2[] = [[0, 0], [b, 0], [b, -b], [0, -b]];
          const K: Record<string, P2> = { '1,1': [b, 0], '-1,1': [0, a], '-1,-1': [a, a + b], '1,-1': [a + b, b] };
          const pieces: Piece[] = [];
          const shades = ['#ffc44d', '#ffb43a', '#ffd06e', '#f7a92e'];
          let si = 0;
          for (const s1 of [1, -1])
            for (const s2 of [1, -1]) {
              let p = clipHalf(sq, (q) => s1 * dot(sub(q, M), d1));
              p = clipHalf(p, (q) => s2 * dot(sub(q, M), d2));
              pieces.push({ poly: p, mv: sub(K[`${s1},${s2}`]!, M), fill: shades[si++]! });
            }
          pieces.push({ poly: [[-a, 0], [0, 0], [0, a], [-a, a]], mv: [b / 2 + a, b / 2], fill: DK.sky });
          return { pieces, bounds: [-a, -b, a + b, a + b] };
        }
        if (pr === 1) {
          const tri = (r: P2, aa: P2, bb: P2, m: P2): Piece => ({ poly: [r, aa, bb], mv: m, fill: '#5d82cf' });
          return {
            pieces: [
              tri([0, 0], [a, 0], [0, b], [0, a]),
              tri([a + b, a + b], [b, a + b], [a + b, a], [-b, 0]),
              tri([0, a + b], [0, b], [b, a + b], [a, -b]),
              tri([a + b, 0], [a + b, a], [a, 0], [0, 0]),
            ],
            bounds: [0, 0, a + b, a + b],
          };
        }
        const tri = (r: P2, aa: P2, bb: P2, m: P2): Piece => ({ poly: [r, aa, bb], mv: m, fill: '#ffc44d' });
        return {
          pieces: [
            tri([a, b], [0, b], [a, 0], [b, 0]),
            tri([a, a], [a, 0], [a + b, a], [-a, 0]),
            tri([b, a], [a + b, a], [b, a + b], [0, -a]),
            tri([b, b], [b, a + b], [0, b], [0, -b]),
            { poly: [[a, a], [b, a], [b, b], [a, b]], mv: [0, 0], fill: DK.sky },
          ],
          bounds: [0, 0, a + b, a + b],
        };
      }
      const NAMES = ['① 조각 옮기기 (페리갈)', '② 두 정사각형 재배열', '③ 바스카라의 증명'];
      const SUBS = ['b² 를 네 조각으로 잘라 a² 와 함께 c² 로', '큰 정사각형에서 삼각형 4개를 빼면', 'c² 조각을 옮기면 a² + b² 의자 모양'];
      return {
        controls,
        draw(g, w, h, t) {
          reset(g);
          if (req) {
            t0 = t;
            req = false;
          }
          const tt = Math.max(0, t - t0);
          const pr = pick > 0 ? pick - 1 : Math.floor(tt / PER) % 3;
          const lt = tt % PER;
          const u = Math.min(w / 280, h / 175);
          darkBg(g, w, h);
          const a = A;
          const b = Bv;
          const c = Math.hypot(a, b);
          const { pieces, bounds } = build(pr, a, b);
          const regW = w * 0.6;
          const regH = h * 0.84;
          const sc = Math.min(regW / (bounds[2] - bounds[0]), regH / (bounds[3] - bounds[1]));
          const ox = w * 0.04 + (regW - (bounds[2] - bounds[0]) * sc) / 2 - bounds[0] * sc;
          const oy = h * 0.08 + (regH + (bounds[3] - bounds[1]) * sc) / 2 + bounds[1] * sc;
          const S = (p: P2): P2 => [ox + p[0] * sc, oy - p[1] * sc];
          const lw = Math.max(1.2, 1.5 * u);
          const n = pieces.filter((p) => p.mv[0] !== 0 || p.mv[1] !== 0).length;
          const moveEnd = 1.1 + Math.max(0, n - 1) * 0.5 + 0.9;
          const done = ease(seg(lt, moveEnd, moveEnd + 0.4)) * (1 - ease(seg(lt, 6.3, 6.6)));
          const pre = 1 - ease(seg(lt, 1.0, 1.4));
          const glob = ease(seg(lt, 0, 0.35));
          g.globalAlpha = glob;
          // 바탕 그림
          if (pr === 0) {
            fillStroke(g, ([[0, 0], [b, 0], [0, a]] as P2[]).map(S), 'rgba(255,255,255,0.14)', 'rgba(255,255,255,0.85)', lw);
            g.setLineDash([4 * u, 3 * u]);
            fillStroke(g, ([[b, 0], [0, a], [a, a + b], [a + b, b]] as P2[]).map(S), null, 'rgba(255,255,255,0.55)', lw);
            fillStroke(g, ([[0, 0], [b, 0], [b, -b], [0, -b]] as P2[]).map(S), null, 'rgba(255,196,77,0.45)', lw);
            fillStroke(g, ([[-a, 0], [0, 0], [0, a], [-a, a]] as P2[]).map(S), null, 'rgba(124,196,255,0.45)', lw);
            g.setLineDash([]);
          } else if (pr === 1) {
            const back = 1 - done;
            g.globalAlpha = glob * clamp(pre + 0, 0, 1);
            fillStroke(g, ([[a, 0], [a + b, a], [b, a + b], [0, b]] as P2[]).map(S), 'rgba(255,196,77,0.9)', null);
            g.globalAlpha = glob * done;
            fillStroke(g, ([[0, 0], [a, 0], [a, a], [0, a]] as P2[]).map(S), 'rgba(255,196,77,0.9)', null);
            fillStroke(g, ([[a, a], [a + b, a], [a + b, a + b], [a, a + b]] as P2[]).map(S), 'rgba(255,196,77,0.9)', null);
            g.globalAlpha = glob;
            void back;
          } else {
            g.globalAlpha = glob * (1 - done * 0.8);
            g.setLineDash([4 * u, 3 * u]);
            fillStroke(g, ([[a, 0], [a + b, a], [b, a + b], [0, b]] as P2[]).map(S), null, 'rgba(255,255,255,0.7)', lw);
            g.setLineDash([]);
            g.globalAlpha = glob;
          }
          // 칼금 (페리갈)
          if (pr === 0) {
            const k = seg(lt, 0.45, 1.0) * (1 - done);
            if (k > 0) {
              const d1: P2 = [-b / c, a / c];
              const d2: P2 = [a / c, b / c];
              const M: P2 = [b / 2, -b / 2];
              g.save();
              poly(g, ([[0, 0], [b, 0], [b, -b], [0, -b]] as P2[]).map(S));
              g.clip();
              for (const d of [d1, d2]) line(g, S(add(M, mul(d, -b * k))), S(add(M, mul(d, b * k))), '#fff', lw);
              g.restore();
            }
          }
          // 조각
          let mi = 0;
          for (const pc of pieces) {
            const moving = pc.mv[0] !== 0 || pc.mv[1] !== 0;
            let p = 0;
            if (moving) {
              const st = 1.1 + mi * 0.5;
              p = easeIO(seg(lt, st, st + 0.9)) * (1 - easeIO(seg(lt, 6.5, 7.3)));
              mi++;
            }
            const lift = Math.sin(p * Math.PI);
            const off = mul(pc.mv, p);
            const pts = pc.poly.map((q) => S(add(q, off)));
            g.save();
            if (lift > 0.01) {
              g.shadowColor = 'rgba(0,0,0,0.55)';
              g.shadowBlur = 14 * u * lift;
              g.shadowOffsetY = 6 * u * lift;
            }
            fillStroke(g, pts, pc.fill, null);
            g.restore();
            fillStroke(g, pts, null, 'rgba(10,14,27,0.85)', lw);
          }
          // 이름표
          const fsL = 13 * u;
          if (pr === 0) {
            g.globalAlpha = glob * pre;
            const cb = S([b / 2, -b / 2]);
            const ca = S([-a / 2, a / 2]);
            txtHalo(g, 'b²', cb[0], cb[1], fsL, '#1b1405', 'rgba(255,220,140,0.7)');
            txtHalo(g, 'a²', ca[0], ca[1], fsL, '#05121f', 'rgba(170,215,255,0.7)');
            const cc = S([(a + b) / 2, (a + b) / 2]);
            txtHalo(g, 'c² ?', cc[0], cc[1], fsL, '#fff', 'rgba(10,14,27,0.7)');
            g.globalAlpha = glob;
          } else if (pr === 1) {
            g.globalAlpha = glob * pre;
            const cc = S([(a + b) / 2, (a + b) / 2]);
            txtHalo(g, 'c²', cc[0], cc[1], fsL * 1.2, '#1b1405', 'rgba(255,230,170,0.6)');
            g.globalAlpha = glob * done;
            const c1 = S([a / 2, a / 2]);
            const c2 = S([a + b / 2, a + b / 2]);
            txtHalo(g, 'a²', c1[0], c1[1], fsL * 1.1, '#1b1405', 'rgba(255,230,170,0.6)');
            txtHalo(g, 'b²', c2[0], c2[1], fsL * 1.2, '#1b1405', 'rgba(255,230,170,0.6)');
            g.globalAlpha = glob;
          } else {
            g.globalAlpha = glob * pre;
            const cc = S([(a + b) / 2, (a + b) / 2]);
            txtHalo(g, 'c²', cc[0], cc[1] - 0.9 * sc, fsL * 1.2, '#fff', 'rgba(10,14,27,0.7)');
            g.globalAlpha = glob * done;
            line(g, S([a, 0]), S([a, a]), 'rgba(255,255,255,0.9)', lw, [4 * u, 3 * u]);
            fillStroke(g, ([[0, 0], [a + b, 0], [a + b, b], [a, b], [a, a], [0, a]] as P2[]).map(S), null, '#fff', lw * 1.3);
            const c1 = S([a / 2, a * 0.5]);
            const c2 = S([a + b * 0.72, b * 0.5]);
            txtHalo(g, 'a²', c1[0], c1[1], fsL, '#fff', 'rgba(10,14,27,0.75)');
            txtHalo(g, 'b²', c2[0], c2[1], fsL, '#fff', 'rgba(10,14,27,0.75)');
            g.globalAlpha = glob;
          }
          g.globalAlpha = 1;
          // 오른쪽 글
          const tx = w * 0.66;
          const tw = w - tx - 8 * u;
          fitTxt(g, NAMES[pr]!, tx, h * 0.15, 11 * u, tw, DK.ink, 'left', 800);
          fitTxt(g, SUBS[pr]!, tx, h * 0.15 + 15 * u, 8.6 * u, tw, DK.dim, 'left', 600);
          fitTxt(g, `a = ${fmt(a)} · b = ${b} · c = ${fmt(c, 2)}`, tx, h * 0.46, 9.5 * u, tw, DK.dim, 'left', 700);
          const k = done;
          txt(g, 'a² + b² = c²', tx, h * 0.62, 15 * u, k > 0.3 ? DK.acc : 'rgba(255,196,77,0.45)', 'left', 900);
          fitTxt(g, `${fmt(a * a, 2)} + ${b * b} = ${fmt(c * c, 2)}`, tx, h * 0.62 + 19 * u, 11 * u, tw, k > 0.3 ? DK.ink : DK.dim, 'left', 800);
          if (k > 0.3) pill(g, '빈틈없이 꼭 맞음 ✓', tx, h * 0.88, 9 * u, 'rgba(255,196,77,0.95)', '#1b1405', 'left');
          reset(g);
        },
      };
    },
  },

  /* ───── i365 테셀레이션 ───── */
  i365: {
    kind: '2d',
    caption: '정다각형 · 변형 타일이 빈틈없이 평면을 덮음 — 한 꼭짓점에 모인 각의 합이 꼭 360° 일 때만',
    make() {
      let pick = 0;
      let t0 = 0;
      let req = false;
      const PER = 4.4;
      const controls: Control[] = [
        { type: 'range', label: '모양 (0 자동 · 1 삼각형 · 2 사각형 · 3 육각형 · 4 오각형 · 5 팔각+사각 · 6 변형 타일)', min: 0, max: 6, step: 1, value: 0, on: (v) => ((pick = v), (req = true)) },
        { type: 'button', label: '다시 깔기', on: () => (req = true) },
      ];
      type Tile = { pts: P2[]; shade: number; c: P2 };
      const R3 = Math.sqrt(3);
      function bez(p0: P2, c1: P2, c2: P2, p3: P2, k: number): P2 {
        const m = 1 - k;
        return [
          m * m * m * p0[0] + 3 * m * m * k * c1[0] + 3 * m * k * k * c2[0] + k * k * k * p3[0],
          m * m * m * p0[1] + 3 * m * m * k * c1[1] + 3 * m * k * k * c2[1] + k * k * k * p3[1],
        ];
      }
      function tiles(mode: number, e: number, R: number, morph: number): Tile[] {
        const out: Tile[] = [];
        const push = (pts: P2[], shade: number): void => {
          const c = centroid(pts);
          if (len(c) < R) out.push({ pts, shade, c });
        };
        const N = Math.ceil(R / e) + 2;
        if (mode === 0) {
          const p = (i: number, j: number): P2 => [e * (i + j / 2), e * ((j * R3) / 2)];
          for (let i = -N * 2; i <= N * 2; i++)
            for (let j = -N; j <= N; j++) {
              push([p(i, j), p(i + 1, j), p(i, j + 1)], 0);
              push([p(i + 1, j), p(i + 1, j + 1), p(i, j + 1)], 1);
            }
        } else if (mode === 1) {
          for (let i = -N; i <= N; i++)
            for (let j = -N; j <= N; j++)
              push(
                [
                  [i * e, j * e],
                  [(i + 1) * e, j * e],
                  [(i + 1) * e, (j + 1) * e],
                  [i * e, (j + 1) * e],
                ],
                (((i + j) % 2) + 2) % 2,
              );
        } else if (mode === 2) {
          for (let i = -N; i <= N; i++)
            for (let j = -N; j <= N; j++) {
              const c: P2 = [e + 1.5 * e * i, ((R3 / 2) * i + R3 * j) * e];
              const pts: P2[] = [];
              for (let k = 0; k < 6; k++) pts.push([c[0] + e * Math.cos((k * Math.PI) / 3), c[1] + e * Math.sin((k * Math.PI) / 3)]);
              push(pts, (((i - j) % 3) + 3) % 3);
            }
        } else if (mode === 3) {
          for (let k = 0; k < 3; k++) {
            const th = (k * 108 * Math.PI) / 180;
            const pts: P2[] = [[0, 0]];
            let cur: P2 = [0, 0];
            for (let m = 0; m < 4; m++) {
              const d = th + (m * 72 * Math.PI) / 180;
              cur = [cur[0] + e * 1.25 * Math.cos(d), cur[1] + e * 1.25 * Math.sin(d)];
              pts.push(cur);
            }
            out.push({ pts, shade: k, c: centroid(pts) });
          }
        } else if (mode === 4) {
          const s = e * (1 + Math.SQRT2);
          const Ro = e / (2 * Math.sin(Math.PI / 8));
          const V: P2 = [s / 2, e / 2];
          const M = Math.ceil(R / s) + 2;
          for (let i = -M; i <= M; i++)
            for (let j = -M; j <= M; j++) {
              const pts: P2[] = [];
              for (let k = 0; k < 8; k++) {
                const a = Math.PI / 8 + (k * Math.PI) / 4;
                pts.push([i * s + Ro * Math.cos(a) - V[0], j * s + Ro * Math.sin(a) - V[1]]);
              }
              push(pts, (((i + j) % 2) + 2) % 2);
              const q: P2[] = [];
              for (let k = 0; k < 4; k++) {
                const a = (k * Math.PI) / 2;
                q.push([(i + 0.5) * s + (e / Math.SQRT2) * Math.cos(a) - V[0], (j + 0.5) * s + (e / Math.SQRT2) * Math.sin(a) - V[1]]);
              }
              push(q, 2);
            }
        } else {
          const m = morph;
          const bot = (x: number, y: number): P2[] => {
            const r: P2[] = [];
            for (let k = 0; k < 10; k++)
              r.push(bez([x, y], [x + 0.3 * e, y - 0.32 * e * m], [x + 0.7 * e, y + 0.26 * e * m], [x + e, y], k / 10));
            return r;
          };
          const lef = (x: number, y: number): P2[] => {
            const r: P2[] = [];
            for (let k = 0; k < 10; k++)
              r.push(bez([x, y], [x - 0.28 * e * m, y + 0.3 * e], [x + 0.26 * e * m, y + 0.7 * e], [x, y + e], k / 10));
            return r;
          };
          for (let i = -N; i <= N; i++)
            for (let j = -N; j <= N; j++) {
              const x = i * e;
              const y = j * e;
              const b = bot(x, y);
              const r = lef(x + e, y);
              const tp = bot(x, y + e).reverse();
              const l = lef(x, y).reverse();
              const pts: P2[] = [...b, [x + e, y], ...r.slice(1), [x + e, y + e], ...tp.slice(0, -1), [x, y + e], ...l.slice(0, -1)];
              push(pts, (((i + j) % 2) + 2) % 2);
            }
        }
        return out;
      }
      const NM = ['정삼각형', '정사각형', '정육각형', '정오각형', '정팔각형 + 정사각형', '변형 타일 (밀어서 잇기)'];
      const SH = [
        ['#203a66', '#2c5291', '#3b68ad'],
        ['#203a66', '#2c5291', '#3b68ad'],
        ['#203a66', '#2c5291', '#3b68ad'],
        ['#203a66', '#2c5291', '#3b68ad'],
        ['#26457a', '#2f5594', '#7cc4ff'],
        ['#2a4c86', '#ffc44d', '#3b68ad'],
      ];
      return {
        controls,
        draw(g, w, h, t) {
          reset(g);
          if (req) {
            t0 = t;
            req = false;
          }
          const tt = Math.max(0, t - t0);
          const mode = pick > 0 ? pick - 1 : Math.floor(tt / PER) % 6;
          const lt = tt % PER;
          const u = Math.min(w / 280, h / 175);
          darkBg(g, w, h);
          const cx = w * 0.5;
          const cy = h * 0.56;
          const e = (mode === 4 ? 17 : mode === 5 ? 30 : mode === 2 ? 22 : 30) * u;
          const R = Math.hypot(w, h) * 0.62;
          const morph = mode === 5 ? easeIO(seg(lt, 1.5, 2.4)) : 0;
          const ts = tiles(mode, e, R, morph);
          const maxD = Math.hypot(w / 2, h / 2);
          const fadeOut = 1 - ease(seg(lt, PER - 0.35, PER));
          g.globalAlpha = fadeOut;
          const S = (p: P2): P2 => [cx + p[0], cy - p[1]];
          const shades = SH[mode]!;
          for (const tl of ts) {
            const d = len(tl.c);
            const st = 0.05 + (d / maxD) * 1.2;
            const k = backOut(seg(lt, st, st + 0.42));
            if (k <= 0.001) continue;
            const pts = tl.pts.map((p) => S(add(tl.c, mul(sub(p, tl.c), k))));
            fillStroke(g, pts, shades[tl.shade] ?? shades[0]!, 'rgba(190,215,255,0.55)', Math.max(1, 1.1 * u));
          }
          // 가운데 꼭짓점의 각
          const wv = ease(seg(lt, 1.6, 2.2));
          const lines: number[] = [];
          if (mode !== 5 && wv > 0) {
            const O = S([0, 0]);
            const rr = 15 * u;
            let tot = 0;
            for (const tl of ts) {
              const i = tl.pts.findIndex((p) => len(p) < 1e-6 * e + 0.01);
              if (i < 0) continue;
              const pv = tl.pts[(i + tl.pts.length - 1) % tl.pts.length]!;
              const nx = tl.pts[(i + 1) % tl.pts.length]!;
              const a1 = Math.atan2(-pv[1], pv[0]);
              const a2 = Math.atan2(-nx[1], nx[0]);
              let d = a2 - a1;
              while (d <= -Math.PI) d += TAU;
              while (d > Math.PI) d -= TAU;
              const s0 = d > 0 ? a1 : a2;
              const sw = Math.abs(d);
              const deg = (sw * 180) / Math.PI;
              tot += deg;
              lines.push(deg);
              g.globalAlpha = fadeOut * wv;
              wedge(g, O, rr * (0.6 + 0.4 * wv), s0, s0 + sw * wv, 'rgba(255,196,77,0.92)', 'rgba(10,14,27,0.9)', 1.2 * u);
              const mid = s0 + sw / 2;
              const lp: P2 = [O[0] + Math.cos(mid) * rr * 1.75, O[1] + Math.sin(mid) * rr * 1.75];
              txtHalo(g, `${fmt(deg, 0)}°`, lp[0], lp[1], 9 * u, '#ffe2a0', 'rgba(10,14,27,0.85)');
            }
            if (mode === 3) {
              const gap = 360 - tot;
              const a0 = -((324 * Math.PI) / 180);
              wedge(g, O, rr * 1.15, a0 - (gap * Math.PI) / 180, a0, 'rgba(255,93,93,0.95)', '#fff', 1.2 * u);
              const mid = a0 - (gap * Math.PI) / 360;
              txtHalo(g, `빈틈 ${fmt(gap, 0)}°`, O[0] + Math.cos(mid) * rr * 3.1, O[1] + Math.sin(mid) * rr * 3.1, 10 * u, '#ffb3b3', 'rgba(10,14,27,0.9)');
            }
            dotP(g, O, 2.5 * u, '#fff');
            g.globalAlpha = fadeOut;
          }
          // 글
          g.globalAlpha = fadeOut;
          g.fillStyle = 'rgba(8,12,24,0.72)';
          g.beginPath();
          g.roundRect(8 * u, 7 * u, w - 16 * u, 34 * u, 10 * u);
          g.fill();
          txt(g, NM[mode]!, 16 * u, 17 * u, 12 * u, DK.ink, 'left', 800);
          let eq = '';
          if (mode === 5) eq = morph > 0.5 ? '한 변을 바꾼 만큼 맞은편도 똑같이 → 밀기만으로 빈틈없이' : '정사각형에서 시작';
          else if (lines.length) {
            const sum = lines.reduce((s, v) => s + v, 0);
            const allEq = lines.every((v) => Math.abs(v - lines[0]!) < 0.01);
            eq = (allEq ? `${fmt(lines[0]!, 0)}° × ${lines.length}` : lines.map((v) => `${fmt(v, 0)}°`).join(' + ')) + ` = ${fmt(sum, 0)}°`;
            if (mode === 3) eq += '  → 덮을 수 없어요';
          }
          txt(g, eq || '한 꼭짓점에 모인 각을 보세요', 16 * u, 32 * u, 9.5 * u, mode === 3 && wv > 0.5 ? '#ffb3b3' : DK.acc, 'left', 700);
          reset(g);
        },
      };
    },
  },

  /* ───── i366 회전체 ───── */
  i366: {
    kind: '3d',
    caption: '평면 도형을 축으로 한 바퀴 돌리면 원기둥 · 원뿔 · 구 · 원뿔대 · 원환 — 반을 잘라 축 단면까지',
    make(T) {
      const scene = new T.Scene();
      studio(scene, { shadowBox: 4 });
      const cam = new T.PerspectiveCamera(36, 1.6, 0.1, 100);
      const hud = new Hud();
      const clip = new T.Plane(new T.Vector3(-1, 0, 0), 10);
      type Shape = { name: string; prof: string; axial: string; perp: string; parts: P2[][]; outline: P2[]; vol: string };
      const semi: P2[] = [];
      for (let k = 0; k <= 32; k++) semi.push([Math.sin((k / 32) * Math.PI), 0.9 - Math.cos((k / 32) * Math.PI)]);
      const ring: P2[] = [];
      for (let k = 0; k <= 48; k++) ring.push([1.05 + 0.45 * Math.cos((k / 48) * TAU), 0.9 + 0.45 * Math.sin((k / 48) * TAU)]);
      const vFr = ((Math.PI * 1.4) / 3) * (1.1 * 1.1 + 1.1 * 0.6 + 0.6 * 0.6);
      const SH: Shape[] = [
        { name: '원기둥', prof: '직사각형', axial: '직사각형', perp: '원', parts: [[[0, 0], [1, 0]], [[1, 0], [1, 1.7]], [[1, 1.7], [0, 1.7]]], outline: [[0, 0], [1, 0], [1, 1.7], [0, 1.7]], vol: `π × 1² × 1.7 ≈ ${fmt(Math.PI * 1.7, 2)}` },
        { name: '원뿔', prof: '직각삼각형', axial: '이등변삼각형', perp: '원', parts: [[[0, 0], [1.05, 0]], [[1.05, 0], [0, 1.8]]], outline: [[0, 0], [1.05, 0], [0, 1.8]], vol: `⅓ × π × 1.05² × 1.8 ≈ ${fmt((Math.PI * 1.05 * 1.05 * 1.8) / 3, 2)}` },
        { name: '구', prof: '반원', axial: '원', perp: '원', parts: [semi], outline: semi, vol: `4/3 × π × 1³ ≈ ${fmt((4 / 3) * Math.PI, 2)}` },
        { name: '원뿔대', prof: '사다리꼴', axial: '사다리꼴', perp: '원', parts: [[[0, 0], [1.1, 0]], [[1.1, 0], [0.6, 1.4]], [[0.6, 1.4], [0, 1.4]]], outline: [[0, 0], [1.1, 0], [0.6, 1.4], [0, 1.4]], vol: `π × 1.4 ÷ 3 × (1.1² + 1.1×0.6 + 0.6²) ≈ ${fmt(vFr, 2)}` },
        { name: '원환 (도넛)', prof: '원 (축에서 떨어진)', axial: '원 두 개', perp: '고리 모양', parts: [ring], outline: ring, vol: `2π² × 1.05 × 0.45² ≈ ${fmt(2 * Math.PI * Math.PI * 1.05 * 0.45 * 0.45, 2)}` },
      ];
      const SEG = 96;
      const solidMat = new T.MeshStandardMaterial({ color: 0xe3ebf8, roughness: 0.38, metalness: 0.05, side: T.DoubleSide, clippingPlanes: [clip], clipShadows: true });
      const profMat = new T.MeshStandardMaterial({ color: 0xff7a45, roughness: 0.45, emissive: 0x401406, side: T.DoubleSide, transparent: true });
      const capMat = new T.MeshStandardMaterial({ color: 0xff7a45, roughness: 0.45, emissive: 0x401406, side: T.DoubleSide, transparent: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      type Built = { group: THREE.Group; lathes: THREE.LatheGeometry[]; per: number[]; prof: THREE.Mesh; cap0: THREE.Mesh; cap1: THREE.Mesh };
      const built: Built[] = SH.map((s, i) => {
        const group = new T.Group();
        const lathes: THREE.LatheGeometry[] = [];
        const per: number[] = [];
        for (const pt of s.parts) {
          const lg = new T.LatheGeometry(pt.map((p) => new T.Vector2(p[0], p[1])), SEG);
          const m = new T.Mesh(lg, solidMat);
          m.castShadow = true;
          m.receiveShadow = true;
          group.add(m);
          lathes.push(lg);
          per.push((pt.length - 1) * 6);
        }
        const shp = new T.Shape(s.outline.map((p) => new T.Vector2(p[0], p[1])));
        const sg = new T.ShapeGeometry(shp, 24);
        sg.rotateY(-Math.PI / 2);
        const ol = new T.LineLoop(new T.BufferGeometry().setFromPoints(s.outline.map((p) => new T.Vector3(0, p[1], p[0]))), new T.LineBasicMaterial({ color: 0xffffff }));
        const prof = new T.Mesh(sg, profMat);
        prof.add(ol);
        prof.castShadow = true;
        group.add(prof);
        const cap0 = new T.Mesh(sg, capMat);
        const cap1 = new T.Mesh(sg, capMat);
        cap1.rotation.y = Math.PI;
        group.add(cap0, cap1);
        group.visible = i === 0;
        scene.add(group);
        return { group, lathes, per, prof, cap0, cap1 };
      });
      const axis = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(0, -0.4, 0), new T.Vector3(0, 2.5, 0)]), new T.LineDashedMaterial({ color: 0xffc44d, dashSize: 0.12, gapSize: 0.08 }));
      axis.computeLineDistances();
      scene.add(axis);
      let pick = 0;
      let auto = true;
      let angle = 360;
      let t0 = 0;
      let req = false;
      let cur = 0;
      let rw = 280;
      let rh = 175;
      const PER = 6.2;
      return {
        scene,
        camera: cam,
        controls: [
          { type: 'range', label: '도형 (0 자동 · 1 ~ 5)', min: 0, max: 5, step: 1, value: 0, on: (v) => ((pick = v), (req = true)) },
          { type: 'toggle', label: '저절로 돌리기', value: true, on: (v) => (auto = v) },
          { type: 'range', label: '돌린 각 ° (저절로 끄면)', min: 0, max: 360, step: 1, value: 360, on: (v) => (angle = v) },
          { type: 'button', label: '다시', on: () => (req = true) },
        ],
        resize(w, h) {
          rw = w;
          rh = h;
        },
        update(t) {
          if (req) {
            t0 = t;
            req = false;
          }
          const tt = Math.max(0, t - t0);
          const si = pick > 0 ? pick - 1 : Math.floor(tt / PER) % SH.length;
          const lt = tt % PER;
          if (si !== cur) {
            built[cur]!.group.visible = false;
            cur = si;
          }
          const b = built[cur]!;
          const s = SH[cur]!;
          b.group.visible = true;
          let phi: number;
          let cutK = 0;
          let appear = 1;
          if (auto) {
            appear = ease(seg(lt, 0, 0.45)) * (1 - ease(seg(lt, PER - 0.4, PER)));
            phi = TAU * easeIO(seg(lt, 0.5, 2.9));
            cutK = easeIO(seg(lt, 3.2, 3.9));
          } else phi = (angle / 360) * TAU;
          const frac = phi / TAU;
          b.lathes.forEach((lg, i) => lg.setDrawRange(0, Math.floor(SEG * frac + 1e-6) * b.per[i]!));
          b.prof.rotation.y = phi;
          const pDone = frac >= 0.999;
          b.prof.visible = !pDone && frac > 0.001;
          clip.constant = lerp(10, 0, cutK);
          if (!pDone) {
            capMat.opacity = 1;
            b.cap0.visible = frac > 0.001;
            b.cap1.visible = false;
          } else {
            capMat.opacity = ease(seg(cutK, 0.85, 1));
            b.cap0.visible = b.cap1.visible = cutK > 0.85;
          }
          b.group.scale.setScalar(lerp(0.6, 1, appear));
          solidMat.opacity = 1;
          // 카메라
          const ca = 0.6 + Math.sin(t * 0.3) * 0.1;
          cam.position.set(Math.sin(ca) * 6.8, 3.1, Math.cos(ca) * 6.8);
          cam.lookAt(0, 0.7, 0);
          const stage = !auto ? 'm' : cutK > 0.9 ? 'cut' : pDone ? 'full' : 'sweep';
          hud.draw(rw, rh, `${cur}|${stage}`, (g, w, h, u) => {
            hudTitle(g, u, `${s.prof}을 돌리면 → ${s.name}`, '노란 점선 = 회전축');
            if (stage === 'cut' || stage === 'full') {
              g.fillStyle = 'rgba(8,12,24,0.72)';
              g.beginPath();
              g.roundRect(10 * u, h - 46 * u, w - 20 * u, 38 * u, 10 * u);
              g.fill();
              txt(g, `축을 품은 단면: ${s.axial} · 축에 수직인 단면: ${s.perp}`, 18 * u, h - 35 * u, 9.6 * u, '#ffb08a', 'left', 800);
              txt(g, `부피 = ${s.vol}`, 18 * u, h - 19 * u, 9.4 * u, DK.ink, 'left', 700);
            }
          });
        },
        render(r) {
          render3d(r, scene, cam, hud, { shadow: true, clip: true });
        },
        dispose() {
          disposeAll(scene);
          hud.dispose();
        },
      };
    },
  },

  /* ───── i367 다각형 각의 합 ───── */
  i367: {
    kind: '2d',
    caption: 'n각형을 한 꼭짓점에서 삼각형 n − 2 개로 — 각을 오려 모으면 삼각형마다 180°',
    make() {
      let n = 5;
      let t0 = 0;
      let req = false;
      const PER = 7.4;
      const controls: Control[] = [
        { type: 'range', label: '꼭짓점 수 n', min: 3, max: 9, step: 1, value: 5, on: (v) => ((n = v), (req = true)) },
        { type: 'button', label: '다시', on: () => (req = true) },
      ];
      function polyOf(k: number): P2[] {
        const r = rng(k * 7919 + 3);
        for (let tries = 0; tries < 20; tries++) {
          const pts: P2[] = [];
          for (let i = 0; i < k; i++) {
            const a = -Math.PI / 2 + (i * TAU) / k + (r() - 0.5) * (TAU / k) * 0.45;
            const rad = 0.86 + r() * 0.14;
            pts.push([Math.cos(a) * rad, Math.sin(a) * rad]);
          }
          let ok = true;
          for (let i = 0; i < k; i++) {
            const a = pts[i]!;
            const b = pts[(i + 1) % k]!;
            const c = pts[(i + 2) % k]!;
            const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
            if (cr <= 0.02) ok = false;
          }
          if (ok) return pts;
        }
        return Array.from({ length: k }, (_v, i) => [Math.cos(-Math.PI / 2 + (i * TAU) / k), Math.sin(-Math.PI / 2 + (i * TAU) / k)] as P2);
      }
      const WC = ['#ffc44d', '#ff8f5a', '#7cc4ff'];
      return {
        controls,
        draw(g, w, h, t) {
          reset(g);
          if (req) {
            t0 = t;
            req = false;
          }
          const lt = Math.max(0, t - t0) % PER;
          const u = Math.min(w / 280, h / 175);
          darkBg(g, w, h);
          const R = Math.min(w * 0.24, h * 0.34);
          const C: P2 = [w * 0.27, h * 0.57];
          const P = polyOf(n).map((p) => [C[0] + p[0] * R, C[1] + p[1] * R] as P2);
          const m = n - 2;
          const lw = Math.max(1.2, 1.6 * u);
          const fadeOut = 1 - ease(seg(lt, PER - 0.35, PER));
          g.globalAlpha = fadeOut;
          // 삼각형 칠하기
          const diagEnd = 0.6 + Math.max(1, m - 1) * 0.3;
          for (let i = 0; i < m; i++) {
            const k = ease(seg(lt, 0.5 + i * 0.3, 0.8 + i * 0.3));
            if (k <= 0) continue;
            g.globalAlpha = fadeOut * k;
            fillStroke(g, [P[0]!, P[i + 1]!, P[i + 2]!], i % 2 ? 'rgba(93,130,207,0.42)' : 'rgba(93,130,207,0.24)', null);
          }
          g.globalAlpha = fadeOut;
          fillStroke(g, P, null, DK.ink, lw * 1.2);
          for (let i = 2; i < n - 1; i++) {
            const k = ease(seg(lt, 0.5 + (i - 1) * 0.3, 0.8 + (i - 1) * 0.3));
            if (k > 0) line(g, P[0]!, lerpP(P[0]!, P[i]!, k), 'rgba(238,243,255,0.8)', lw, [5 * u, 3.5 * u]);
          }
          dotP(g, P[0]!, 3 * u, DK.acc);
          // 오른쪽: 반원 자리
          const cols = m <= 3 ? m : Math.ceil(m / 2);
          const rows = m <= 3 ? 1 : 2;
          const rx0 = w * 0.55;
          const rW = w * 0.42;
          const ry0 = rows === 1 ? h * 0.3 : h * 0.2;
          const rH = rows === 1 ? h * 0.5 : h * 0.47;
          const rr = Math.min(rW / cols / 2.35, rH / rows / 1.45);
          const slot = (i: number): P2 => {
            const row = rows === 1 ? 0 : Math.floor(i / cols);
            const col = rows === 1 ? i : i % cols;
            const inRow = rows === 1 ? m : row === 0 ? cols : m - cols;
            const cxx = rx0 + rW / 2 + (col - (inRow - 1) / 2) * (rW / cols);
            const cyy = ry0 + (rows === 1 ? rH * 0.68 : (row + 0.82) * (rH / rows));
            return [cxx, cyy];
          };
          // 각 조각
          const wr0 = Math.min(R * 0.24, 15 * u);
          let measured = 0;
          for (let i = 0; i < n; i++) {
            const a = P[(i + n - 1) % n]!;
            const b = P[i]!;
            const c = P[(i + 1) % n]!;
            measured += (Math.acos(clamp(dot(norm(sub(a, b)), norm(sub(c, b))), -1, 1)) * 180) / Math.PI;
          }
          for (let i = 0; i < m; i++) {
            const tri = [P[0]!, P[i + 1]!, P[i + 2]!];
            const base = slot(i);
            const st = diagEnd + 0.55 + i * 0.22;
            const fly = easeIO(seg(lt, st, st + 1.0)) * (1 - easeIO(seg(lt, 6.4, 7.0)));
            const show = ease(seg(lt, diagEnd, diagEnd + 0.4));
            let acc = Math.PI;
            if (fly > 0.95) {
              g.globalAlpha = fadeOut * ease(seg(fly, 0.95, 1));
              g.beginPath();
              g.arc(base[0], base[1], rr * 1.12, Math.PI, TAU);
              g.strokeStyle = 'rgba(255,196,77,0.6)';
              g.lineWidth = 1.2 * u;
              g.stroke();
              line(g, [base[0] - rr * 1.25, base[1]], [base[0] + rr * 1.25, base[1]], 'rgba(238,243,255,0.75)', 1.2 * u);
              g.globalAlpha = fadeOut;
            }
            for (let j = 0; j < 3; j++) {
              const V = tri[j]!;
              const Pp = tri[(j + 1) % 3]!;
              const Q = tri[(j + 2) % 3]!;
              const aP = Math.atan2(Pp[1] - V[1], Pp[0] - V[0]);
              const aQ = Math.atan2(Q[1] - V[1], Q[0] - V[0]);
              let d = aQ - aP;
              while (d <= -Math.PI) d += TAU;
              while (d > Math.PI) d -= TAU;
              const s0 = d > 0 ? aP : aQ;
              const sw = Math.abs(d);
              const ts = acc;
              acc += sw;
              const apex = lerpP(V, base, fly);
              const r = lerp(wr0, rr, fly);
              const lift = Math.sin(fly * Math.PI) * 10 * u;
              g.globalAlpha = fadeOut * show;
              g.save();
              if (lift > 0.5) {
                g.shadowColor = 'rgba(0,0,0,0.5)';
                g.shadowBlur = lift;
              }
              wedge(g, [apex[0], apex[1] - lift], r, lerp(s0, nearAngle(s0, ts), fly), lerp(s0, nearAngle(s0, ts), fly) + sw, WC[j]!, 'rgba(10,14,27,0.9)', 1 * u);
              g.restore();
            }
            g.globalAlpha = fadeOut;
            // 번호
            const cc = centroid(tri);
            const k = ease(seg(lt, 0.5 + i * 0.3, 0.8 + i * 0.3));
            if (k > 0) {
              g.globalAlpha = fadeOut * k;
              dotP(g, cc, 7 * u, 'rgba(10,14,27,0.75)');
              txt(g, `${i + 1}`, cc[0], cc[1] + 0.5 * u, 8.5 * u, DK.ink, 'center', 800);
            }
            const lb = ease(seg(lt, st + 1.0, st + 1.3)) * (1 - ease(seg(lt, 6.3, 6.5)));
            if (lb > 0) {
              g.globalAlpha = fadeOut * lb;
              txt(g, '180°', base[0], base[1] + 8 * u, 9 * u, DK.acc, 'center', 800);
            }
            g.globalAlpha = fadeOut;
          }
          const fin = ease(seg(lt, diagEnd + 0.55 + (m - 1) * 0.22 + 1.2, diagEnd + 0.55 + (m - 1) * 0.22 + 1.6)) * (1 - ease(seg(lt, 6.3, 6.6)));
          txt(g, `${POLY_NAME[n]} → 삼각형 ${m}개`, w / 2, 14 * u, 12.5 * u, DK.ink, 'center', 800);
          g.globalAlpha = fadeOut * (0.35 + 0.65 * fin);
          txt(g, `180° × (${n} − 2) = ${180 * m}°`, w * 0.76, h - 24 * u, 12 * u, DK.acc, 'center', 900);
          txt(g, `재어 본 각의 합 ${fmt(measured, 1)}°`, w * 0.76, h - 9 * u, 8.5 * u, DK.dim, 'center', 700);
          reset(g);
        },
      };
    },
  },

  /* ───── i368 닮음 · 확대 ───── */
  i368: {
    kind: '2d',
    caption: '닮음 중심에서 광선으로 늘이고 줄이기 — 길이가 k 배면 넓이 k² 배 · 부피 k³ 배 (중심은 끌어 옮길 수 있음)',
    make() {
      let auto = true;
      let kMan = 2;
      let O: P2 = [0, 0];
      let drag = false;
      const ptr = pointer();
      const BASE: P2[] = [[1, 1], [3, 1], [1, 2]];
      const PER = 7.6;
      const controls: Control[] = [
        { type: 'toggle', label: '저절로 k 바꾸기', value: true, on: (v) => (auto = v) },
        { type: 'range', label: '닮음비 k', min: 0.5, max: 3, step: 0.1, value: 2, on: (v) => (kMan = v) },
        { type: 'button', label: '중심 처음 자리로', on: () => (O = [0, 0]) },
      ];
      function kAt(t: number): number {
        const x = t % PER;
        if (x < 0.8) return 1;
        if (x < 1.8) return lerp(1, 2, easeIO(seg(x, 0.8, 1.8)));
        if (x < 2.8) return 2;
        if (x < 3.8) return lerp(2, 3, easeIO(seg(x, 2.8, 3.8)));
        if (x < 4.8) return 3;
        if (x < 5.8) return lerp(3, 0.5, easeIO(seg(x, 4.8, 5.8)));
        if (x < 6.6) return 0.5;
        return lerp(0.5, 1, easeIO(seg(x, 6.6, 7.6)));
      }
      return {
        controls,
        dispose() {
          ptr.dispose();
        },
        draw(g, w, h, t) {
          reset(g);
          const u = Math.min(w / 280, h / 175);
          const k = auto ? kAt(t) : kMan;
          const cell = Math.min((w * 0.58) / 9.8, (h * 0.8) / 6.6);
          const ox = Math.round(w * 0.05 + cell * 0.6);
          const oy = Math.round(h * 0.9);
          paperBg(g, w, h, cell, ox, oy);
          const S = (p: P2): P2 => [ox + p[0] * cell, oy - p[1] * cell];
          if (w > 420) {
            ptr.attach(g.canvas as HTMLCanvasElement);
            const so = S(O);
            if (ptr.pressed) {
              ptr.pressed = false;
              if (Math.hypot(ptr.x - so[0], ptr.y - so[1]) < 18 * u) drag = true;
            }
            if (!ptr.down) drag = false;
            if (drag) O = [clamp(Math.round(((ptr.x - ox) / cell) * 2) / 2, -0.5, 4), clamp(Math.round(((oy - ptr.y) / cell) * 2) / 2, -0.5, 4)];
          }
          const img = BASE.map((p) => add(O, mul(sub(p, O), k)));
          const lw = Math.max(1.4, 1.8 * u);
          // 광선
          for (let i = 0; i < 3; i++) {
            const far = add(O, mul(sub(BASE[i]!, O), Math.max(k, 1) * 1.08));
            line(g, S(O), S(far), 'rgba(47,111,214,0.45)', 1.1 * u, [4 * u, 3 * u]);
          }
          fillStroke(g, BASE.map(S), 'rgba(47,111,214,0.18)', PA.blue, lw);
          fillStroke(g, img.map(S), 'rgba(239,91,60,0.2)', PA.acc, lw * 1.2);
          const nm = ['A', 'B', 'C'];
          for (let i = 0; i < 3; i++) {
            const p = S(BASE[i]!);
            dotP(g, p, 2.6 * u, PA.blue);
            const q = S(img[i]!);
            dotP(g, q, 3 * u, PA.acc);
            txtHalo(g, `${nm[i]}′`, q[0] + 9 * u, q[1] - 7 * u, 9.5 * u, PA.accD, '#f8f4ea');
          }
          dotP(g, S(O), 5 * u, PA.ink, '#fff');
          txtHalo(g, 'O', S(O)[0] - 9 * u, S(O)[1] + 8 * u, 10 * u, PA.ink, '#f8f4ea');
          // 오른쪽 판
          const px = w * 0.66;
          g.fillStyle = 'rgba(255,255,255,0.86)';
          g.beginPath();
          g.roundRect(px - 6 * u, 8 * u, w - px, h - 16 * u, 12 * u);
          g.fill();
          g.strokeStyle = 'rgba(31,42,68,0.12)';
          g.lineWidth = 1;
          g.stroke();
          const kTxt = Math.abs(k - Math.round(k * 10) / 10) < 0.005 ? fmt(k, 1) : fmt(k, 2);
          txt(g, `k = ${kTxt}`, px + 4 * u, 24 * u, 16 * u, PA.accD, 'left', 900);
          const a0 = areaOf(BASE);
          const a1 = areaOf(img);
          txt(g, `밑변  2 → ${fmt(2 * k, 2)}`, px + 4 * u, 46 * u, 9.5 * u, PA.ink, 'left', 700);
          txt(g, `× ${kTxt}`, w - 12 * u, 46 * u, 9.5 * u, PA.dim, 'right', 700);
          txt(g, `넓이  ${fmt(a0, 2)} → ${fmt(a1, 2)}`, px + 4 * u, 62 * u, 9.5 * u, PA.ink, 'left', 700);
          txt(g, `× ${fmt(k * k, 2)}`, w - 12 * u, 62 * u, 9.5 * u, PA.accD, 'right', 800);
          txt(g, `부피  1 → ${fmt(k * k * k, 2)}`, px + 4 * u, 78 * u, 9.5 * u, PA.ink, 'left', 700);
          txt(g, `× ${fmt(k * k * k, 2)}`, w - 12 * u, 78 * u, 9.5 * u, PA.accD, 'right', 800);
          // 등각 정육면체 (k 배)
          const cs = 9 * u;
          const L = k * cs;
          const anchor: P2 = [px + (w - px) / 2 - 3 * u, h - 24 * u];
          const ix: P2 = [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)];
          const iz: P2 = [-Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)];
          const P0 = (x: number, y: number, z: number): P2 => [anchor[0] + ix[0] * (x - L) + iz[0] * (z - L), anchor[1] + ix[1] * (x - L) + iz[1] * (z - L) - y];
          const fx: P2[] = [P0(L, 0, 0), P0(L, 0, L), P0(L, L, L), P0(L, L, 0)];
          const fz: P2[] = [P0(0, 0, L), P0(L, 0, L), P0(L, L, L), P0(0, L, L)];
          const ft: P2[] = [P0(0, L, 0), P0(L, L, 0), P0(L, L, L), P0(0, L, L)];
          fillStroke(g, fx, '#e8704f', null);
          fillStroke(g, fz, '#f4927a', null);
          fillStroke(g, ft, '#ffc2b0', null);
          g.strokeStyle = 'rgba(120,30,15,0.4)';
          g.lineWidth = 0.8 * u;
          for (let q = 1; q < k - 1e-6; q++) {
            const v = q * cs;
            poly(g, [P0(L, 0, v), P0(L, L, v), P0(0, L, v)], false);
            g.stroke();
            poly(g, [P0(v, 0, L), P0(v, L, L), P0(v, L, 0)], false);
            g.stroke();
            poly(g, [P0(L, v, 0), P0(L, v, L), P0(0, v, L)], false);
            g.stroke();
          }
          for (const f of [fx, fz, ft]) fillStroke(g, f, null, PA.accD, 1.2 * u);
          txt(g, `작은 정육면체 ${fmt(k * k * k, 2)}개 분량`, px + (w - px) / 2 - 3 * u, h - 14 * u, 7.6 * u, PA.dim, 'center', 700);
          if (w > 420) txt(g, '점 O 를 끌어 옮겨 보세요', 12 * u, 12 * u, 9 * u, PA.dim, 'left', 700);
          reset(g);
        },
      };
    },
  },

  /* ───── i369 도형 변환 ───── */
  i369: {
    kind: '2d',
    caption: '같은 삼각형에 평행 이동 · 회전 · 반사 — 두 번 반사하면 회전이 됨, 좌표 변화까지',
    make() {
      let pick = 0;
      let t0 = 0;
      let req = false;
      const PER = 4.6;
      const controls: Control[] = [
        { type: 'range', label: '변환 (0 자동 · 1 이동 · 2 회전 · 3 반사 · 4 두 번 반사)', min: 0, max: 4, step: 1, value: 0, on: (v) => ((pick = v), (req = true)) },
        { type: 'button', label: '다시', on: () => (req = true) },
      ];
      const T0: P2[] = [[1, 1], [4, 1], [1, 3]];
      const NM = ['A', 'B', 'C'];
      const refl = (p: P2, f: P2, d: P2, k: number): P2 => {
        const nn: P2 = [-d[1], d[0]];
        const dist = dot(sub(p, f), nn);
        return sub(p, mul(nn, dist * (1 - Math.cos(Math.PI * k))));
      };
      return {
        controls,
        draw(g, w, h, t) {
          reset(g);
          if (req) {
            t0 = t;
            req = false;
          }
          const tt = Math.max(0, t - t0);
          const mode = pick > 0 ? pick - 1 : Math.floor(tt / PER) % 4;
          const lt = tt % PER;
          const u = Math.min(w / 280, h / 175);
          const cell = Math.min((w * 0.94) / 13.4, (h * 0.74) / 9.4);
          const ox = Math.round(w / 2);
          const oy = Math.round(h * 0.25 + 4.8 * cell);
          darkBg(g, w, h, cell, ox, oy);
          const S = (p: P2): P2 => [ox + p[0] * cell, oy - p[1] * cell];
          // 축
          line(g, [0, oy], [w, oy], 'rgba(200,215,255,0.5)', 1.2 * u);
          line(g, [ox, h * 0.18], [ox, h], 'rgba(200,215,255,0.5)', 1.2 * u);
          txt(g, 'x', w - 8 * u, oy - 7 * u, 9 * u, DK.dim);
          txt(g, 'y', ox + 7 * u, h * 0.21, 9 * u, DK.dim);
          for (const v of [-6, -4, -2, 2, 4, 6]) txt(g, fmt(v, 0), S([v, 0])[0], oy + 7 * u, 7 * u, 'rgba(200,215,255,0.45)', 'center', 600);
          const lw = Math.max(1.3, 1.6 * u);
          const p = easeIO(seg(lt, 0.6, 2.2));
          const hold = ease(seg(lt, 2.2, 2.5));
          const fade = 1 - ease(seg(lt, PER - 0.4, PER));
          let cur: P2[] = T0;
          let ghost: P2[] | null = null;
          let sub1 = '';
          if (mode === 0) {
            cur = T0.map((q) => add(q, mul([-6, 1], p)));
            sub1 = '평행 이동 (x − 6, y + 1)';
            if (p > 0) {
              const a = S(T0[0]!);
              const b = S(cur[0]!);
              line(g, a, b, DK.acc, 1.4 * u, [4 * u, 3 * u]);
            }
          } else if (mode === 1) {
            cur = T0.map((q) => rotAbout(q, [0, 0], (Math.PI / 2) * p));
            sub1 = '원점을 중심으로 90° 돌리기';
            if (p > 0) {
              const o = S([0, 0]);
              g.strokeStyle = DK.acc;
              g.lineWidth = 1.4 * u;
              g.beginPath();
              const a0 = -Math.atan2(1, 1);
              g.arc(o[0], o[1], Math.hypot(1, 1) * cell, a0 - (Math.PI / 2) * p, a0, false);
              g.stroke();
              line(g, o, S(cur[0]!), 'rgba(255,196,77,0.6)', 1 * u, [3 * u, 3 * u]);
              line(g, o, S(T0[0]!), 'rgba(255,196,77,0.6)', 1 * u, [3 * u, 3 * u]);
            }
          } else if (mode === 2) {
            line(g, [ox, h * 0.18], [ox, h], DK.sky, 2 * u);
            cur = T0.map((q) => refl(q, [0, 0], [0, 1], p));
            sub1 = 'y축에 대하여 대칭 (반사)';
          } else {
            const p1 = easeIO(seg(lt, 0.5, 1.4));
            const p2 = easeIO(seg(lt, 1.5, 2.4));
            line(g, [0, oy], [w, oy], DK.sky, 2 * u);
            line(g, S([-5, -5]), S([5, 5]), DK.sky, 2 * u);
            txtHalo(g, 'y = x', S([3.6, 3.6])[0] + 14 * u, S([3.6, 3.6])[1], 8.5 * u, DK.sky, 'rgba(10,14,27,0.8)');
            const m1 = T0.map((q) => refl(q, [0, 0], [1, 0], p1));
            if (p2 > 0) {
              ghost = T0.map((q) => [q[0], -q[1]] as P2);
              const d: P2 = [Math.SQRT1_2, Math.SQRT1_2];
              cur = ghost.map((q) => refl(q, [0, 0], d, p2));
            } else cur = m1;
            sub1 = 'x축 → 직선 y = x 로 두 번 반사';
          }
          const done = mode === 3 ? ease(seg(lt, 2.4, 2.7)) : hold;
          g.globalAlpha = fade;
          // 원래
          fillStroke(g, T0.map(S), 'rgba(124,196,255,0.16)', 'rgba(124,196,255,0.75)', lw);
          const c0 = S(centroid(T0));
          T0.forEach((q, i) => {
            const o = add(S(q), mul(norm(sub(S(q), c0)), 10 * u));
            txtHalo(g, NM[i]!, o[0], o[1], 8.5 * u, DK.sky, 'rgba(10,14,27,0.8)');
          });
          if (ghost) {
            g.setLineDash([4 * u, 3 * u]);
            fillStroke(g, ghost.map(S), 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.55)', lw);
            g.setLineDash([]);
          }
          fillStroke(g, cur.map(S), 'rgba(255,196,77,0.82)', '#fff3cf', lw);
          // 방향 표시 (A → B → C 화살)
          const cc = centroid(cur);
          const orient = (cur[1]![0] - cur[0]![0]) * (cur[2]![1] - cur[0]![1]) - (cur[1]![1] - cur[0]![1]) * (cur[2]![0] - cur[0]![0]);
          const sc = S(cc);
          g.strokeStyle = 'rgba(30,20,0,0.85)';
          g.lineWidth = 1.3 * u;
          g.beginPath();
          const r0 = 5.5 * u;
          const ccw = orient > 0;
          g.arc(sc[0], sc[1], r0, 0, Math.PI * 1.4, ccw);
          g.stroke();
          const ea = ccw ? -Math.PI * 1.4 : Math.PI * 1.4;
          const tip: P2 = [sc[0] + Math.cos(ea) * r0, sc[1] + Math.sin(ea) * r0];
          dotP(g, tip, 1.8 * u, 'rgba(30,20,0,0.85)');
          cur.forEach((q, i) => {
            const s = S(q);
            dotP(g, s, 2.4 * u, '#fff');
            const o = add(s, mul(norm(sub(s, sc)), 11 * u));
            txtHalo(g, `${NM[i]}′`, o[0], o[1], 8.5 * u, DK.acc, 'rgba(10,14,27,0.85)');
          });
          if (mode === 3 && done > 0) {
            g.globalAlpha = fade * done;
            const o = S([0, 0]);
            g.strokeStyle = '#ff9a6a';
            g.lineWidth = 2 * u;
            g.beginPath();
            const a0 = -Math.atan2(1, 1);
            g.arc(o[0], o[1], Math.SQRT2 * cell, a0 - Math.PI / 2, a0, false);
            g.stroke();
            txtHalo(g, '45° × 2 = 90° 회전', o[0] - 6.3 * cell, o[1] + 2.4 * cell, 9.5 * u, '#ffb08a', 'rgba(10,14,27,0.85)', 'left');
            g.globalAlpha = fade;
          }
          // 글
          g.fillStyle = 'rgba(8,12,24,0.78)';
          g.beginPath();
          g.roundRect(8 * u, 6 * u, w - 16 * u, 30 * u, 9 * u);
          g.fill();
          txt(g, sub1, 15 * u, 15 * u, 11 * u, DK.ink, 'left', 800);
          const fA = cur[0]!;
          const coords = done > 0.5 ? T0.map((q, i) => `${NM[i]}(${fmt(q[0], 0)}, ${fmt(q[1], 0)}) → ${NM[i]}′(${fmt(cur[i]![0], 0)}, ${fmt(cur[i]![1], 0)})`).join('   ') : `A′(${fmt(fA[0], 1)}, ${fmt(fA[1], 1)})`;
          g.font = `700 ${8.6 * u}px ${FONT}`;
          let fs = 8.6 * u;
          const maxW = w - 30 * u;
          const mw = g.measureText(coords).width;
          if (mw > maxW) fs *= maxW / mw;
          txt(g, coords, 15 * u, 28 * u, fs, DK.acc, 'left', 700);
          reset(g);
        },
      };
    },
  },

  /* ───── i370 겨냥도 · 투영 ───── */
  i370: {
    kind: '3d',
    caption: '쌓기나무를 앞 · 옆 · 위에서 비춘 모양을 벽과 바닥에 — 그 세 그림으로 다시 쌓으면 최소 · 최대 몇 개?',
    make(T) {
      const scene = new T.Scene();
      scene.background = gradTex('#1d2848', '#080c18');
      scene.add(new T.HemisphereLight(0xe6eeff, 0x1a2030, 1.1));
      const sun = new T.DirectionalLight(0xffffff, 2.0);
      sun.position.set(4, 8, 6);
      scene.add(sun);
      const fill = new T.DirectionalLight(0x9fbfff, 0.6);
      fill.position.set(-5, 2, 3);
      scene.add(fill);
      const cam = new T.PerspectiveCamera(34, 1.6, 0.1, 100);
      const hud = new Hud();
      const LIFT = 1.0;
      const W = 2.9;
      // 벽 · 바닥
      const panelMat = new T.MeshStandardMaterial({ color: 0x1b2440, roughness: 0.9, side: T.DoubleSide });
      const gridMat = new T.LineBasicMaterial({ color: 0x3a4a78 });
      function panel(kind: 'back' | 'side' | 'floor'): THREE.Group {
        const gp = new T.Group();
        const m = new T.Mesh(new T.PlaneGeometry(3.4, kind === 'floor' ? 3.4 : 3.6), panelMat);
        gp.add(m);
        const pts: THREE.Vector3[] = [];
        const hh = kind === 'floor' ? 1.5 : 0;
        for (let i = -1.5; i <= 1.51; i += 1) {
          pts.push(new T.Vector3(i, -1.5 + hh * 0 - (kind === 'floor' ? 0 : 0.1), 0.005), new T.Vector3(i, kind === 'floor' ? 1.5 : 1.9, 0.005));
        }
        for (let j = 0; j <= 3; j++) {
          const y = kind === 'floor' ? -1.5 + j : -1.6 + j;
          pts.push(new T.Vector3(-1.5, y, 0.005), new T.Vector3(1.5, y, 0.005));
        }
        gp.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(pts), gridMat));
        return gp;
      }
      const back = panel('back');
      back.position.set(0, LIFT + 1.6, -W);
      scene.add(back);
      const side = panel('side');
      side.rotation.y = Math.PI / 2;
      side.position.set(-W, LIFT + 1.6, 0);
      scene.add(side);
      const floorP = panel('floor');
      floorP.rotation.x = -Math.PI / 2;
      floorP.position.set(0, 0, 0);
      scene.add(floorP);
      function label(s: string): THREE.Mesh {
        const c = document.createElement('canvas');
        c.width = 512;
        c.height = 96;
        const g = c.getContext('2d')!;
        txt(g, s, 256, 50, 54, '#cfe0ff', 'center', 800);
        const tx = new T.CanvasTexture(c);
        tx.colorSpace = T.SRGBColorSpace;
        const m = new T.Mesh(new T.PlaneGeometry(2.4, 0.45), new T.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false, toneMapped: false }));
        return m;
      }
      const lb1 = label('앞에서 본 모양');
      lb1.position.set(0, LIFT + 3.75, -W + 0.01);
      scene.add(lb1);
      const lb2 = label('옆에서 본 모양');
      lb2.rotation.y = Math.PI / 2;
      lb2.position.set(-W + 0.01, LIFT + 3.75, 0);
      scene.add(lb2);
      const lb3 = label('위에서 본 모양');
      lb3.rotation.x = -Math.PI / 2;
      lb3.rotation.z = -Math.PI / 4;
      lb3.position.set(1.75, 0.01, 1.75);
      scene.add(lb3);
      // 쌓기나무
      const cubeG = new T.BoxGeometry(0.98, 0.98, 0.98);
      const edgeG = new T.EdgesGeometry(cubeG);
      const blockMat = new T.MeshStandardMaterial({ color: 0xf2e6cf, roughness: 0.55, transparent: true });
      const edgeMat = new T.LineBasicMaterial({ color: 0x5a4630, transparent: true });
      const recMat = new T.MeshStandardMaterial({ color: 0xffc44d, roughness: 0.4, transparent: true, opacity: 0.5, depthWrite: false });
      const recEdge = new T.LineBasicMaterial({ color: 0xffe2a0, transparent: true });
      const cellG = new T.PlaneGeometry(0.94, 0.94);
      const cellMat = new T.MeshBasicMaterial({ color: 0x7cc4ff, transparent: true, side: T.DoubleSide, toneMapped: false });
      const slabMat = new T.MeshBasicMaterial({ color: 0x7cc4ff, transparent: true, opacity: 0.25, side: T.DoubleSide, depthWrite: false, toneMapped: false });
      const STACKS = [
        [[1, 0, 0], [2, 1, 0], [3, 2, 1]],
        [[2, 1, 1], [1, 0, 1], [1, 0, 2]],
        [[0, 1, 0], [1, 3, 1], [0, 1, 0]],
      ];
      type Item = { obj: THREE.Object3D; from: THREE.Vector3; to: THREE.Vector3; t: number };
      type Built = { group: THREE.Group; blocks: Item[]; cells: Item[]; slabs: THREE.Mesh[]; rec: Item[]; count: number; mn: number; mx: number };
      const built: Built[] = STACKS.map((H, si) => {
        const group = new T.Group();
        const blocks: Item[] = [];
        const cells: Item[] = [];
        const slabs: THREE.Mesh[] = [];
        const rec: Item[] = [];
        let count = 0;
        const F = [0, 0, 0];
        const Sd = [0, 0, 0];
        for (let z = 0; z < 3; z++)
          for (let x = 0; x < 3; x++) {
            const hgt = H[z]![x]!;
            count += hgt;
            F[x] = Math.max(F[x]!, hgt);
            Sd[z] = Math.max(Sd[z]!, hgt);
            for (let y = 0; y < hgt; y++) {
              const m = new T.Mesh(cubeG, blockMat);
              m.add(new T.LineSegments(edgeG, edgeMat));
              const to = new T.Vector3(x - 1, LIFT + y + 0.5, z - 1);
              group.add(m);
              blocks.push({ obj: m, from: to.clone().add(new T.Vector3(0, 2.2, 0)), to, t: 0.1 + y * 0.28 + (x + z) * 0.06 });
            }
          }
        let k = 0;
        for (let x = 0; x < 3; x++)
          for (let y = 0; y < F[x]!; y++) {
            const m = new T.Mesh(cellG, cellMat);
            const to = new T.Vector3(x - 1, LIFT + y + 0.5, -W + 0.02);
            m.position.copy(to);
            group.add(m);
            cells.push({ obj: m, from: new T.Vector3(x - 1, LIFT + y + 0.5, 0), to, t: 1.5 + k++ * 0.05 });
          }
        k = 0;
        for (let z = 0; z < 3; z++)
          for (let y = 0; y < Sd[z]!; y++) {
            const m = new T.Mesh(cellG, cellMat);
            m.rotation.y = Math.PI / 2;
            const to = new T.Vector3(-W + 0.02, LIFT + y + 0.5, z - 1);
            group.add(m);
            cells.push({ obj: m, from: new T.Vector3(0, LIFT + y + 0.5, z - 1), to, t: 1.75 + k++ * 0.05 });
          }
        k = 0;
        for (let z = 0; z < 3; z++)
          for (let x = 0; x < 3; x++)
            if (H[z]![x]! > 0) {
              const m = new T.Mesh(cellG, cellMat);
              m.rotation.x = -Math.PI / 2;
              const to = new T.Vector3(x - 1, 0.02, z - 1);
              group.add(m);
              cells.push({ obj: m, from: new T.Vector3(x - 1, LIFT, z - 1), to, t: 2.0 + k++ * 0.05 });
            }
        for (const c of cells) {
          const s = new T.Mesh(cellG, slabMat);
          s.rotation.copy(c.obj.rotation);
          group.add(s);
          slabs.push(s);
        }
        // 세 그림으로 다시 쌓기: 가능한 높이를 모두 따져 최소 · 최대
        const occ: [number, number][] = [];
        for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) if (H[z]![x]! > 0) occ.push([x, z]);
        let mn = 1e9;
        let mx = 0;
        let best: number[] = [];
        const hs = occ.map(() => 1);
        const total = Math.pow(3, occ.length);
        for (let code = 0; code < total; code++) {
          let c = code;
          for (let i = 0; i < occ.length; i++) {
            hs[i] = (c % 3) + 1;
            c = Math.floor(c / 3);
          }
          const f = [0, 0, 0];
          const sd = [0, 0, 0];
          occ.forEach(([x, z], i) => {
            f[x] = Math.max(f[x]!, hs[i]!);
            sd[z] = Math.max(sd[z]!, hs[i]!);
          });
          if (f.every((v, i) => v === F[i]) && sd.every((v, i) => v === Sd[i])) {
            const sum = hs.reduce((s, v) => s + v, 0);
            mn = Math.min(mn, sum);
            if (sum > mx) {
              mx = sum;
              best = hs.slice();
            }
          }
        }
        occ.forEach(([x, z], i) => {
          for (let y = 0; y < best[i]!; y++) {
            const m = new T.Mesh(cubeG, recMat);
            m.add(new T.LineSegments(edgeG, recEdge));
            const to = new T.Vector3(x - 1, LIFT + y + 0.5, z - 1);
            group.add(m);
            rec.push({ obj: m, from: new T.Vector3(x - 1, 0.5, z - 1), to, t: 5.0 + y * 0.25 + (x + z) * 0.05 });
          }
        });
        group.visible = si === 0;
        scene.add(group);
        return { group, blocks, cells, slabs, rec, count, mn, mx };
      });
      let pick = 0;
      let spin = true;
      let t0 = 0;
      let req = false;
      let cur = 0;
      let rw = 280;
      let rh = 175;
      const PER = 8.4;
      return {
        scene,
        camera: cam,
        controls: [
          { type: 'range', label: '쌓기 (0 자동 · 1 ~ 3)', min: 0, max: 3, step: 1, value: 0, on: (v) => ((pick = v), (req = true)) },
          { type: 'toggle', label: '카메라 살짝 돌기', value: true, on: (v) => (spin = v) },
          { type: 'button', label: '다시', on: () => (req = true) },
        ],
        resize(w, h) {
          rw = w;
          rh = h;
        },
        update(t) {
          if (req) {
            t0 = t;
            req = false;
          }
          const tt = Math.max(0, t - t0);
          const si = pick > 0 ? pick - 1 : Math.floor(tt / PER) % STACKS.length;
          const lt = tt % PER;
          if (si !== cur) {
            built[cur]!.group.visible = false;
            cur = si;
          }
          const b = built[cur]!;
          b.group.visible = true;
          const endFade = 1 - ease(seg(lt, PER - 0.5, PER));
          const orig = 1 - ease(seg(lt, 4.5, 5.0));
          for (const it of b.blocks) {
            const k = easeOut(seg(lt, it.t, it.t + 0.45));
            it.obj.visible = k > 0 && orig > 0.01;
            it.obj.position.lerpVectors(it.from, it.to, k);
            const sq = 1 + Math.max(0, Math.sin(seg(lt, it.t + 0.35, it.t + 0.6) * Math.PI)) * 0.06;
            it.obj.scale.set(sq, 1 / sq, sq);
          }
          blockMat.opacity = orig;
          edgeMat.opacity = orig;
          b.cells.forEach((c, i) => {
            const k = easeIO(seg(lt, c.t, c.t + 0.7));
            c.obj.visible = k >= 1 && endFade > 0;
            const s = b.slabs[i]!;
            s.visible = k > 0 && k < 1;
            s.position.lerpVectors(c.from, c.to, k);
          });
          cellMat.opacity = 0.9 * endFade;
          for (const it of b.rec) {
            const k = easeOut(seg(lt, it.t, it.t + 0.5));
            it.obj.visible = k > 0 && endFade > 0;
            it.obj.position.lerpVectors(it.from, it.to, k);
          }
          recMat.opacity = 0.55 * endFade;
          recEdge.opacity = endFade;
          const ca = spin ? 0.72 + Math.sin(t * 0.3) * 0.12 : 0.72;
          cam.position.set(Math.sin(ca) * 10.8, 8.8, Math.cos(ca) * 10.8);
          cam.lookAt(-0.75, 1.25, -0.75);
          const stage = lt < 1.5 ? 0 : lt < 4.5 ? 1 : lt < 5.0 ? 1 : 2;
          hud.draw(rw, rh, `${cur}|${stage}`, (g, _w, h, u) => {
            if (stage === 0) hudTitle(g, u, `쌓기나무 ${b.count}개`, '앞 · 옆 · 위에서 보면?');
            else if (stage === 1) hudTitle(g, u, `쌓기나무 ${b.count}개`, '앞 · 옆 · 위에서 비춘 모양 (정사영)', '#9fd3ff');
            else {
              hudTitle(g, u, '세 그림만 보고 다시 쌓기', '');
              pill(g, `최소 ${b.mn}개 · 최대 ${b.mx}개 (처음은 ${b.count}개)`, 14 * u, h - 18 * u, 10.5 * u, 'rgba(255,196,77,0.95)', '#1b1405', 'left');
            }
          });
        },
        render(r) {
          render3d(r, scene, cam, hud, {});
        },
        dispose() {
          disposeAll(scene);
          hud.dispose();
        },
      };
    },
  },

  /* ───── i371 작도 원리 ───── */
  i371: {
    kind: '2d',
    caption: '컴퍼스 원 두 개가 만나는 점 = 두 점에서 같은 거리 — 수직이등분선 · 각의 이등분선 · 외심 (점은 끌어 옮길 수 있음)',
    make() {
      let pick = 0;
      let t0 = 0;
      let req = false;
      const PER = [6.8, 6.8, 7.4];
      const ptr = pointer();
      let dragI = -1;
      const pts: P2[][] = [
        [[-3.4, -0.7], [3.1, 0.9]],
        [[-3.6, -1.9], [3.6, -1.1], [0.6, 2.9]],
        [[-3.3, -1.6], [3.4, -1.4], [-0.6, 2.4]],
      ];
      const controls: Control[] = [
        { type: 'range', label: '작도 (0 자동 · 1 수직이등분선 · 2 각의 이등분선 · 3 외심)', min: 0, max: 3, step: 1, value: 0, on: (v) => ((pick = v), (req = true)) },
        { type: 'button', label: '다시', on: () => (req = true) },
      ];
      const C2 = (A: P2, ra: number, B: P2, rb: number): [P2, P2] | null => {
        const d = len(sub(B, A));
        if (d < 1e-6 || d > ra + rb || d < Math.abs(ra - rb)) return null;
        const a = (ra * ra - rb * rb + d * d) / (2 * d);
        const hh = Math.sqrt(Math.max(0, ra * ra - a * a));
        const ex = norm(sub(B, A));
        const M = add(A, mul(ex, a));
        const pp: P2 = [-ex[1], ex[0]];
        return [add(M, mul(pp, hh)), sub(M, mul(pp, hh))];
      };
      function compass(g: CanvasRenderingContext2D, c: P2, p: P2, u: number): void {
        const d = len(sub(p, c));
        const Lg = Math.max(d * 0.62, 34 * u);
        const m = lerpP(c, p, 0.5);
        let nn: P2 = norm([-(p[1] - c[1]), p[0] - c[0]]);
        if (nn[1] > 0) nn = mul(nn, -1);
        const hgt = Math.sqrt(Math.max(4, Lg * Lg - (d / 2) * (d / 2)));
        const hinge = add(m, mul(nn, hgt));
        g.save();
        g.shadowColor = 'rgba(30,40,60,0.3)';
        g.shadowBlur = 6 * u;
        g.shadowOffsetY = 3 * u;
        line(g, hinge, c, '#6b7690', 3 * u);
        line(g, hinge, p, '#6b7690', 3 * u);
        g.restore();
        line(g, hinge, c, '#aab4c8', 1.3 * u);
        line(g, hinge, p, '#aab4c8', 1.3 * u);
        line(g, lerpP(hinge, p, 0.82), p, PA.acc, 3 * u);
        dotP(g, hinge, 3.5 * u, '#46506a', '#cfd6e4');
        line(g, hinge, add(hinge, mul(nn, 9 * u)), '#46506a', 2.4 * u);
      }
      return {
        controls,
        dispose() {
          ptr.dispose();
        },
        draw(g, w, h, t) {
          reset(g);
          if (req) {
            t0 = t;
            req = false;
          }
          const u = Math.min(w / 280, h / 175);
          const total = PER[0]! + PER[1]! + PER[2]!;
          const where = (): [number, number, number] => {
            const tt = Math.max(0, t - t0);
            if (pick > 0) return [pick - 1, tt % PER[pick - 1]!, 0];
            let x = tt % total;
            let m = 0;
            let off = 0;
            while (x >= PER[m]!) {
              x -= PER[m]!;
              off += PER[m]!;
              m++;
            }
            return [m, x, off];
          };
          let [mode, lt, off] = where();
          const cell = Math.min(w / 16, h / 10.2);
          const ox = w / 2;
          const oy = h * 0.58;
          paperBg(g, w, h, cell, ox, oy);
          const S = (p: P2): P2 => [ox + p[0] * cell, oy - p[1] * cell];
          const Mth = (p: P2): P2 => [(p[0] - ox) / cell, (oy - p[1]) / cell];
          const P = pts[mode]!;
          // 끌기 (큰 화면)
          const HOLD = mode === 2 ? 5.0 : 4.6;
          if (w > 420) {
            ptr.attach(g.canvas as HTMLCanvasElement);
            if (ptr.pressed) {
              ptr.pressed = false;
              dragI = P.findIndex((q) => Math.hypot(S(q)[0] - ptr.x, S(q)[1] - ptr.y) < 16 * u);
            }
            if (!ptr.down) dragI = -1;
            if (dragI >= 0) {
              const m = Mth([ptr.x, ptr.y]);
              P[dragI] = [clamp(m[0], -7, 7), clamp(m[1], -4.2, 3.6)];
              if (lt < HOLD || lt > PER[mode]! - 0.6) {
                t0 = t - off - HOLD;
                [mode, lt, off] = where();
              }
            }
          }
          const lw = Math.max(1.3, 1.6 * u);
          const pencil = 'rgba(52,62,86,0.85)';
          const fade = 1 - ease(seg(lt, PER[mode]! - 0.4, PER[mode]!));
          g.globalAlpha = fade;
          const drawArc = (c: P2, r: number, a0: number, a1: number, k: number, withC: boolean, col = pencil): void => {
            if (k <= 0) return;
            const sc = S(c);
            const ae = a0 + (a1 - a0) * k;
            g.strokeStyle = col;
            g.lineWidth = lw * 0.85;
            g.beginPath();
            g.arc(sc[0], sc[1], r * cell, a0, ae);
            g.stroke();
            if (withC && k < 1) compass(g, sc, [sc[0] + Math.cos(ae) * r * cell, sc[1] + Math.sin(ae) * r * cell], u);
          };
          const sAng = (from: P2, to: P2): number => Math.atan2(-(to[1] - from[1]), to[0] - from[0]);
          let title = '';
          let note = '';
          const later: (() => void)[] = [];
          if (mode === 0) {
            title = '선분의 수직이등분선';
            const [A, B] = [P[0]!, P[1]!];
            const d = len(sub(B, A));
            const r = d * 0.68;
            const X = C2(A, r, B, r);
            line(g, S(A), S(B), PA.ink, lw);
            if (X) {
              const [p1, p2] = X;
              const al = Math.acos(clamp(d / 2 / r, -1, 1));
              const aB = sAng(A, B);
              const aA = sAng(B, A);
              drawArc(A, r, aB - al - 0.32, aB + al + 0.32, seg(lt, 0.4, 1.6), true);
              drawArc(B, r, aA - al - 0.32, aA + al + 0.32, seg(lt, 1.6, 2.8), true);
              const pk = backOut(seg(lt, 2.8, 3.1));
              if (pk > 0) {
                dotP(g, S(p1), 3.4 * u * pk, PA.acc);
                dotP(g, S(p2), 3.4 * u * pk, PA.acc);
              }
              const lk = ease(seg(lt, 3.1, 3.7));
              if (lk > 0) {
                const dir = norm(sub(p1, p2));
                const M = lerpP(A, B, 0.5);
                const ext = len(sub(p1, p2)) * 0.5 + 1.2;
                line(g, S(add(M, mul(dir, -ext * lk))), S(add(M, mul(dir, ext * lk))), PA.acc, lw * 1.2);
                if (lk >= 1) rightMark(g, S(M), norm(sub(S(B), S(A))), norm(sub(S(p1), S(M))), 6 * u, PA.acc, lw * 0.7);
              }
              const xk = ease(seg(lt, 3.7, 4.1));
              if (xk > 0) {
                const dir = norm(sub(p1, p2));
                const M = lerpP(A, B, 0.5);
                const s = Math.sin((lt - 3.7) * 1.4) * (len(sub(p1, p2)) * 0.5 + 0.6);
                const Xp = add(M, mul(dir, s));
                later.push(() => {
                  g.globalAlpha = fade * xk;
                  line(g, S(Xp), S(A), PA.blue, lw, [4 * u, 3 * u]);
                  line(g, S(Xp), S(B), PA.blue, lw, [4 * u, 3 * u]);
                  dotP(g, S(Xp), 4.2 * u, PA.blue, '#fff');
                  const la = lerpP(S(Xp), S(A), 0.5);
                  const lb = lerpP(S(Xp), S(B), 0.5);
                  txtHalo(g, fmt(len(sub(Xp, A)), 1), la[0], la[1] - 6 * u, 10 * u, PA.blue, '#f8f4ea');
                  txtHalo(g, fmt(len(sub(Xp, B)), 1), lb[0], lb[1] - 6 * u, 10 * u, PA.blue, '#f8f4ea');
                  g.globalAlpha = fade;
                });
                note = 'XA = XB — 이 직선 위의 점은 A, B 에서 거리가 같아요';
              }
            }
            later.push(() => {
              dotP(g, S(A), 3.6 * u, PA.ink, '#fff');
              dotP(g, S(B), 3.6 * u, PA.ink, '#fff');
              txtHalo(g, 'A', S(A)[0] - 10 * u, S(A)[1] + 4 * u, 10 * u, PA.ink, '#f8f4ea');
              txtHalo(g, 'B', S(B)[0] + 10 * u, S(B)[1] + 4 * u, 10 * u, PA.ink, '#f8f4ea');
            });
          } else if (mode === 1) {
            title = '각의 이등분선';
            const [O, R1, R2] = [P[0]!, P[1]!, P[2]!];
            const u1 = norm(sub(R1, O));
            const u2 = norm(sub(R2, O));
            line(g, S(O), S(add(O, mul(u1, 9))), PA.ink, lw);
            line(g, S(O), S(add(O, mul(u2, 9))), PA.ink, lw);
            const r1 = Math.min(len(sub(R1, O)), len(sub(R2, O))) * 0.42;
            const D = add(O, mul(u1, r1));
            const E = add(O, mul(u2, r1));
            const a1 = sAng(O, D);
            const a2 = sAng(O, E);
            let dd = a2 - a1;
            while (dd <= -Math.PI) dd += TAU;
            while (dd > Math.PI) dd -= TAU;
            const s0 = dd > 0 ? a1 : a2;
            const sw = Math.abs(dd);
            drawArc(O, r1, s0 - 0.25, s0 + sw + 0.25, seg(lt, 0.4, 1.4), true);
            const pk = backOut(seg(lt, 1.4, 1.65));
            if (pk > 0) {
              dotP(g, S(D), 3 * u * pk, PA.acc);
              dotP(g, S(E), 3 * u * pk, PA.acc);
            }
            const r2 = len(sub(E, D)) * 0.85;
            const X = C2(D, r2, E, r2);
            if (X) {
              const F = len(sub(X[0], O)) > len(sub(X[1], O)) ? X[0] : X[1];
              const aF1 = sAng(D, F);
              const aF2 = sAng(E, F);
              drawArc(D, r2, aF1 - 0.35, aF1 + 0.35, seg(lt, 1.7, 2.5), true);
              drawArc(E, r2, aF2 - 0.35, aF2 + 0.35, seg(lt, 2.5, 3.3), true);
              const fk = backOut(seg(lt, 3.3, 3.55));
              if (fk > 0) dotP(g, S(F), 3.4 * u * fk, PA.acc);
              const lk = ease(seg(lt, 3.55, 4.1));
              const bd = norm(sub(F, O));
              if (lk > 0) line(g, S(O), S(add(O, mul(bd, 9 * lk))), PA.acc, lw * 1.2);
              const xk = ease(seg(lt, 4.1, 4.5));
              if (xk > 0) {
                const s = 2.2 + Math.sin((lt - 4.1) * 1.3) * 1.2;
                const Xp = add(O, mul(bd, s));
                const f1 = add(O, mul(u1, dot(sub(Xp, O), u1)));
                const f2 = add(O, mul(u2, dot(sub(Xp, O), u2)));
                later.push(() => {
                  g.globalAlpha = fade * xk;
                  line(g, S(Xp), S(f1), PA.blue, lw, [4 * u, 3 * u]);
                  line(g, S(Xp), S(f2), PA.blue, lw, [4 * u, 3 * u]);
                  rightMark(g, S(f1), norm(sub(S(O), S(f1))), norm(sub(S(Xp), S(f1))), 5 * u, PA.blue, lw * 0.6);
                  rightMark(g, S(f2), norm(sub(S(O), S(f2))), norm(sub(S(Xp), S(f2))), 5 * u, PA.blue, lw * 0.6);
                  dotP(g, S(Xp), 4.2 * u, PA.blue, '#fff');
                  const la = lerpP(S(Xp), S(f1), 0.5);
                  const lb = lerpP(S(Xp), S(f2), 0.5);
                  txtHalo(g, fmt(len(sub(Xp, f1)), 1), la[0] + 9 * u, la[1], 10 * u, PA.blue, '#f8f4ea');
                  txtHalo(g, fmt(len(sub(Xp, f2)), 1), lb[0] - 9 * u, lb[1], 10 * u, PA.blue, '#f8f4ea');
                  g.globalAlpha = fade;
                });
                const ang = (Math.acos(clamp(dot(u1, u2), -1, 1)) * 180) / Math.PI;
                note = `두 변까지 거리가 같아요 — ${fmt(ang, 1)}° 를 ${fmt(ang / 2, 1)}° 씩`;
              }
            }
            later.push(() => {
              for (const q of P) dotP(g, S(q), q === O ? 3.6 * u : 3 * u, PA.ink, '#fff');
              txtHalo(g, 'O', S(O)[0] - 9 * u, S(O)[1] + 6 * u, 10 * u, PA.ink, '#f8f4ea');
            });
          } else {
            title = '삼각형의 외심';
            const [A, B, C] = [P[0]!, P[1]!, P[2]!];
            fillStroke(g, [A, B, C].map(S), 'rgba(47,111,214,0.08)', PA.ink, lw);
            const sides: [P2, P2, number][] = [
              [A, B, 0.4],
              [B, C, 1.5],
              [C, A, 2.6],
            ];
            const D2 = 2 * (A[0] * (B[1] - C[1]) + B[0] * (C[1] - A[1]) + C[0] * (A[1] - B[1]));
            let O: P2 | null = null;
            if (Math.abs(D2) > 1e-6) {
              const a2 = dot(A, A);
              const b2 = dot(B, B);
              const c2 = dot(C, C);
              O = [(a2 * (B[1] - C[1]) + b2 * (C[1] - A[1]) + c2 * (A[1] - B[1])) / D2, (a2 * (C[0] - B[0]) + b2 * (A[0] - C[0]) + c2 * (B[0] - A[0])) / D2];
            }
            for (const [p, q, st] of sides) {
              const d = len(sub(q, p));
              const r = d * 0.66;
              const X = C2(p, r, q, r);
              if (!X) continue;
              const al = Math.acos(clamp(d / 2 / r, -1, 1));
              const aq = sAng(p, q);
              const ap = sAng(q, p);
              drawArc(p, r, aq - al - 0.18, aq - al + 0.18, seg(lt, st, st + 0.3), false);
              drawArc(p, r, aq + al - 0.18, aq + al + 0.18, seg(lt, st, st + 0.3), false);
              drawArc(q, r, ap - al - 0.18, ap - al + 0.18, seg(lt, st + 0.3, st + 0.6), false);
              drawArc(q, r, ap + al - 0.18, ap + al + 0.18, seg(lt, st + 0.3, st + 0.6), false);
              const lk = ease(seg(lt, st + 0.6, st + 1.0));
              if (lk > 0) {
                const dir = norm(sub(X[0], X[1]));
                const M = lerpP(p, q, 0.5);
                const ext = 5.2;
                line(g, S(add(M, mul(dir, -ext * lk))), S(add(M, mul(dir, ext * lk))), 'rgba(239,91,60,0.7)', lw);
              }
            }
            if (O) {
              const ok = backOut(seg(lt, 3.6, 3.9));
              const R = len(sub(A, O));
              const ck = seg(lt, 3.9, 5.0);
              if (ck > 0) {
                const a0 = sAng(O, A);
                drawArc(O, R, a0, a0 + TAU, ck, true, PA.acc);
              }
              const hk = ease(seg(lt, 5.0, 5.3));
              if (hk > 0) {
                const O2 = O;
                later.push(() => {
                  g.globalAlpha = fade * hk;
                  for (const q of [A, B, C]) {
                    line(g, S(O2), S(q), PA.blue, lw, [4 * u, 3 * u]);
                    const m = lerpP(S(O2), S(q), 0.5);
                    txtHalo(g, fmt(len(sub(q, O2)), 1), m[0], m[1], 9.5 * u, PA.blue, '#f8f4ea');
                  }
                  g.globalAlpha = fade;
                });
                note = `OA = OB = OC = ${fmt(R, 1)} — 세 꼭짓점을 지나는 원의 중심`;
              }
              if (ok > 0) {
                const O3 = O;
                later.push(() => {
                  dotP(g, S(O3), 4 * u * ok, PA.acc, '#fff');
                  txtHalo(g, 'O', S(O3)[0] + 9 * u, S(O3)[1] - 7 * u, 10 * u, PA.accD, '#f8f4ea');
                });
              }
            }
            later.push(() => {
              ['A', 'B', 'C'].forEach((nm, i) => {
                const q = S(P[i]!);
                dotP(g, q, 3.4 * u, PA.ink, '#fff');
                txtHalo(g, nm, q[0] + (i === 0 ? -10 : i === 1 ? 10 : 0) * u, q[1] + (i === 2 ? -10 : 6) * u, 10 * u, PA.ink, '#f8f4ea');
              });
            });
          }
          for (const f of later) f();
          // 글
          g.globalAlpha = fade;
          txt(g, title, 12 * u, 14 * u, 12.5 * u, PA.ink, 'left', 800);
          if (note) txtHalo(g, note, w / 2, h - 11 * u, 9.6 * u, PA.accD, '#f8f4ea', 'center', 800);
          else txt(g, '컴퍼스로 같은 거리의 점 찾기', 12 * u, 29 * u, 9 * u, PA.dim, 'left', 700);
          if (w > 420) txt(g, '점을 끌어 옮겨 보세요', w - 12 * u, 14 * u, 9 * u, PA.dim, 'right', 700);
          reset(g);
        },
      };
    },
  },
};

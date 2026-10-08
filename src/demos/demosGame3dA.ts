import * as THREE from 'three';
import type { Control, DemoMap, Scene3D } from './types';

/**
 * 「3D 게임 기본기」 견본 앞 넷 (i480 ~ i483) — 작은 유적 시험장(경사로 · 계단 · 벽 · 기둥 · 다리 · 구덩이)을 코드로 짓고
 *  i480 캐릭터 조작기 : 캡슐(구 둘 + 원기둥) ↔ 삼각형 충돌을 직접 — 바닥 붙기 · 경사 한계 · 계단 · 벽 미끄러지기 · 코요테 · 점프 버퍼
 *  i481 카메라 벽 충돌 : 주인공 → 카메라를 구로 쓸어 당겨 오기 (켬 · 끔 나란히) + 위에서 본 작은 지도
 *  i482 내비메시 길찾기 : 바닥 삼각형 그물 → A* 삼각형 통로 → 깔때기로 곧은 길, 괴물 여럿이 각자
 *  i483 적 AI : 상태 기계(순찰 · 의심 · 추격 · 공격 · 귀환) + 행동 나무 그림 · 시야 원뿔(광선 검사) · 발소리 반경
 * 무대 · 캐릭터는 첫 프레임들에 3ms 씩 나눠 짓고, compileAsync 로 셰이더를 미리 구운 뒤 그린다.
 * 3D 견본은 포인터 · 키를 받지 않는 구조라 크게 보기에서만 화면 캔버스 · window 를 직접 듣고 dispose 에서 뗀다.
 */

type R = THREE.WebGLRenderer;
type G = CanvasRenderingContext2D;
type P3 = [number, number, number];
const FONT = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const damp = (a: number, b: number, k: number, dt: number): number => lerp(a, b, 1 - Math.exp(-k * dt));
const ss = (a: number, b: number, x: number): number => {
  const k = clamp((x - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};
const hash = (i: number): number => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const angWrap = (a: number): number => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};

/* ═════════════ 렌더러 상태 (그림자 켜고, 끝나면 원래대로) ═════════════ */

function withState(r: R, fn: () => void): void {
  const ac = r.autoClear;
  const sc = r.getScissorTest();
  const vp = r.getViewport(new THREE.Vector4());
  const sb = r.getScissor(new THREE.Vector4());
  const cc = r.getClearColor(new THREE.Color());
  const ca = r.getClearAlpha();
  const se = r.shadowMap.enabled;
  const st = r.shadowMap.type;
  try {
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    fn();
  } finally {
    r.autoClear = ac;
    r.setScissorTest(sc);
    r.setViewport(vp);
    r.setScissor(sb);
    r.setClearColor(cc, ca);
    r.shadowMap.enabled = se;
    r.shadowMap.type = st;
  }
}

function disposeTree(o: THREE.Object3D): void {
  const seen = new Set<unknown>();
  o.traverse((m) => {
    const mm = m as THREE.Mesh;
    if (mm.geometry && !seen.has(mm.geometry)) {
      seen.add(mm.geometry);
      mm.geometry.dispose();
    }
    const mat = mm.material as THREE.Material | THREE.Material[] | undefined;
    for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) {
      if (seen.has(x)) continue;
      seen.add(x);
      const mp = (x as THREE.MeshBasicMaterial).map;
      if (mp) mp.dispose();
      x.dispose();
    }
  });
}

/* ═════════════ 화면 위 2D 판 (HUD) — 캔버스 한 장씩, 내용이 바뀔 때만 다시 그림 ═════════════ */

class Panel {
  readonly cv = document.createElement('canvas');
  readonly g = this.cv.getContext('2d')!;
  tex: THREE.CanvasTexture;
  readonly mat: THREE.MeshBasicMaterial;
  readonly mesh: THREE.Mesh;
  private key = '';
  private pw = 0;
  private ph = 0;
  constructor(geo: THREE.PlaneGeometry) {
    this.tex = this.newTex();
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
  }
  private newTex(): THREE.CanvasTexture {
    const t = new THREE.CanvasTexture(this.cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    return t;
  }
  /** 화면 픽셀 (왼쪽 위 기준) */
  place(x: number, y: number, w: number, h: number): void {
    this.mesh.position.set(x + w / 2, -(y + h / 2), 0);
    this.mesh.scale.set(w, h, 1);
    this.mesh.visible = true;
  }
  paint(w: number, h: number, key: string, fn: (g: G, w: number, h: number) => void): void {
    w = Math.max(2, Math.ceil(w));
    h = Math.max(2, Math.ceil(h));
    if (w !== this.pw || h !== this.ph) {
      this.pw = w;
      this.ph = h;
      this.cv.width = w;
      this.cv.height = h;
      this.tex.dispose();
      this.tex = this.newTex();
      this.mat.map = this.tex;
      this.key = '';
    }
    if (key === this.key) return;
    this.key = key;
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, w, h);
    fn(g, w, h);
    this.tex.needsUpdate = true;
  }
  dispose(): void {
    this.tex.dispose();
    this.mat.dispose();
  }
}

class Hud {
  readonly scene = new THREE.Scene();
  readonly cam = new THREE.OrthographicCamera(0, 1, 0, -1, -10, 10);
  private geo = new THREE.PlaneGeometry(1, 1);
  private panels = new Map<string, Panel>();
  w = 1;
  h = 1;
  /** 글씨 크기 단위 (카드 ≈ 1.5, 큰 화면 ≈ 2.5~4) */
  u = 1;
  size(w: number, h: number): void {
    if (w !== this.w || h !== this.h) {
      this.w = w;
      this.h = h;
      this.cam.right = w;
      this.cam.bottom = -h;
      this.cam.updateProjectionMatrix();
    }
    this.u = Math.min(w / 280, h / 175) * (w >= 700 ? 0.6 : 1);
    for (const p of this.panels.values()) p.mesh.visible = false;
  }
  get(id: string): Panel {
    let p = this.panels.get(id);
    if (!p) {
      p = new Panel(this.geo);
      this.panels.set(id, p);
      this.scene.add(p.mesh);
    }
    return p;
  }
  render(r: R): void {
    r.autoClear = false;
    r.clearDepth();
    r.render(this.scene, this.cam);
  }
  dispose(): void {
    for (const p of this.panels.values()) p.dispose();
    this.geo.dispose();
  }
}

/** 둥근 네모 */
function rr(g: G, x: number, y: number, w: number, h: number, r: number): void {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
/** 알약 글씨표 — 크기만 재고 싶으면 draw=false */
function pill(g: G, text: string, x: number, y: number, size: number, bg: string, fg: string, align: 'l' | 'c' | 'r' = 'l', draw = true): number {
  g.font = `700 ${size}px ${FONT}`;
  const tw = g.measureText(text).width;
  const pw = tw + size * 1.1;
  const ph = size * 1.55;
  const x0 = align === 'l' ? x : align === 'c' ? x - pw / 2 : x - pw;
  if (!draw) return pw;
  rr(g, x0, y, pw, ph, ph / 2);
  g.fillStyle = bg;
  g.fill();
  g.fillStyle = fg;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.fillText(text, x0 + size * 0.55, y + ph / 2 + size * 0.04);
  return pw;
}

/** 크게 보기 화면 캔버스 찾기 (같은 크기의 hub 캔버스) */
function findBigCanvas(w: number, h: number): HTMLCanvasElement | null {
  if (w < 700) return null;
  for (const c of Array.from(document.querySelectorAll<HTMLCanvasElement>('canvas.hub-canvas'))) if (c.width === w && c.height === h) return c;
  return null;
}

/* ═════════════ 유적 시험장 짓기 — 면마다 정점 색(아래일수록 어둡게 = 구석 그늘 느낌) · 외곽선 · 충돌 삼각형 ═════════════ */

interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}
interface FaceOpt {
  col?: boolean;
  vis?: boolean;
  edge?: boolean;
  ao?: number;
}
const _c = new THREE.Color();

class Builder {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  line: number[] = [];
  private lineKeys = new Set<string>();
  tris: number[] = [];
  /** 바닥 위로 솟은 것들의 발자국 (구석 그늘 · 2D 시야 · 길찾기 구멍) */
  foot: (Rect & { h: number })[] = [];
  face(pts: P3[], cen: P3, color: number, o: FaceOpt = {}): void {
    const a = pts[0]!;
    const b = pts[1]!;
    const c = pts[2]!;
    let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    let ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    let nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    let mx = 0;
    let my = 0;
    let mz = 0;
    for (const p of pts) {
      mx += p[0] / pts.length;
      my += p[1] / pts.length;
      mz += p[2] / pts.length;
    }
    if (nx * (mx - cen[0]) + ny * (my - cen[1]) + nz * (mz - cen[2]) < 0) {
      pts = pts.slice().reverse();
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    const n = pts.length;
    if (o.vis !== false) {
      const base = this.pos.length / 3;
      const ao = o.ao ?? 0;
      for (const p of pts) {
        this.pos.push(p[0], p[1], p[2]);
        this.nrm.push(nx, ny, nz);
        if (Math.abs(ny) > 0.5) this.uv.push(p[0] / 2, p[2] / 2);
        else if (Math.abs(nx) > Math.abs(nz)) this.uv.push(p[2] / 2, p[1]);
        else this.uv.push(p[0] / 2, p[1]);
        const f = (0.46 + 0.54 * ss(ao - 0.05, ao + 1.5, p[1])) * (ny > 0.5 ? 1 : ny < -0.5 ? 0.6 : 0.9);
        _c.setHex(color);
        this.col.push(_c.r * f, _c.g * f, _c.b * f);
      }
      for (let i = 1; i < n - 1; i++) this.idx.push(base, base + i, base + i + 1);
      if (o.edge !== false)
        for (let i = 0; i < n; i++) {
          const p = pts[i]!;
          const q = pts[(i + 1) % n]!;
          const k1 = p.map((v) => v.toFixed(2)).join(',');
          const k2 = q.map((v) => v.toFixed(2)).join(',');
          const k = k1 < k2 ? k1 + '|' + k2 : k2 + '|' + k1;
          if (this.lineKeys.has(k)) continue;
          this.lineKeys.add(k);
          this.line.push(p[0], p[1], p[2], q[0], q[1], q[2]);
        }
    }
    if (o.col !== false) for (let i = 1; i < n - 1; i++) this.tris.push(...pts[0]!, ...pts[i]!, ...pts[i + 1]!);
  }
  /** 상자. top/bottom 은 보이기만 끔 (충돌은 남김) */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, o: FaceOpt & { top?: boolean; bottom?: boolean; topColor?: number; foot?: boolean } = {}): void {
    const cen: P3 = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
    const ao = o.ao ?? 0;
    const f = { col: o.col, edge: o.edge, ao, vis: o.vis };
    this.face([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], cen, o.topColor ?? color, { ...f, vis: o.vis !== false && o.top !== false });
    this.face([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], cen, color, { ...f, vis: o.vis !== false && o.bottom === true });
    this.face([[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], cen, color, f);
    this.face([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], cen, color, f);
    this.face([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], cen, color, f);
    this.face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], cen, color, f);
    if (o.foot !== false && y0 <= 0.05 && y1 > 0.1) this.foot.push({ x0, z0, x1, z1, h: y1 });
  }
  /** 경사로 (쐐기) — dir 쪽으로 높이 h 만큼 오름 */
  wedge(x0: number, z0: number, x1: number, z1: number, yb: number, h: number, dir: '+x' | '-x' | '+z' | '-z', color: number, o: FaceOpt = {}): void {
    const P = (u: number, v: number, top: boolean): P3 => {
      const y = yb + (top ? h * u : 0);
      if (dir === '+x') return [lerp(x0, x1, u), y, lerp(z0, z1, v)];
      if (dir === '-x') return [lerp(x1, x0, u), y, lerp(z0, z1, v)];
      if (dir === '+z') return [lerp(x0, x1, v), y, lerp(z0, z1, u)];
      return [lerp(x0, x1, v), y, lerp(z1, z0, u)];
    };
    const cen: P3 = [(x0 + x1) / 2, yb + h * 0.3, (z0 + z1) / 2];
    const f = { ...o, ao: o.ao ?? 0 };
    this.face([P(0, 0, false), P(1, 0, false), P(1, 1, false), P(0, 1, false)], cen, color, { ...f, vis: false });
    this.face([P(0, 0, false), P(0, 1, false), P(1, 1, true), P(1, 0, true)], cen, color, f);
    this.face([P(1, 0, false), P(1, 1, false), P(1, 1, true), P(1, 0, true)], cen, color, f);
    this.face([P(0, 0, false), P(1, 0, false), P(1, 0, true)], cen, color, f);
    this.face([P(0, 1, false), P(1, 1, false), P(1, 1, true)], cen, color, f);
    if (yb <= 0.05) this.foot.push({ x0, z0, x1, z1, h });
  }
  /** 돌 바닥 타일 — 가운데 살짝 솟고 둘레는 비스듬히 (줄눈), 벽 가까이일수록 어둡게 */
  tiles(x0: number, z0: number, x1: number, z1: number, base: number, skip: (cx: number, cz: number) => boolean, seed = 0): void {
    const g = 0.07;
    // 구석 그늘은 격자 꼭짓점마다 한 번만 재서 타일끼리 나눠 씀
    const cache = new Map<number, number>();
    const aoAt = (x: number, z: number): number => {
      const k = x * 1000 + z;
      let v = cache.get(k);
      if (v === undefined) {
        v = 0.5 + 0.5 * ss(0, 1.25, this.footDist(x, z));
        cache.set(k, v);
      }
      return v;
    };
    for (let cx = x0; cx < x1 - 0.01; cx++)
      for (let cz = z0; cz < z1 - 0.01; cz++) {
        if (skip(cx + 0.5, cz + 0.5)) continue;
        const k = hash(cx * 31.7 + cz * 7.3 + seed);
        const moss = hash(cx * 3.1 - cz * 11.7 + seed) > 0.95;
        _c.setHex(moss ? 0x9a9670 : base);
        const v = 0.86 + k * 0.22;
        const cr = _c.r * v;
        const cg = _c.g * v * (moss ? 1 : 0.98 + k * 0.03);
        const cb = _c.b * v * (0.94 + k * 0.08);
        const ix0 = cx + g;
        const iz0 = cz + g;
        const ix1 = cx + 1 - g;
        const iz1 = cz + 1 - g;
        const ao = (x: number, z: number): number => aoAt(Math.round(x), Math.round(z));
        const quad = (pts: P3[], dark: number): void => {
          const b = this.pos.length / 3;
          const a = pts[0]!;
          const p1 = pts[1]!;
          const p2 = pts[2]!;
          const ux = p1[0] - a[0];
          const uy = p1[1] - a[1];
          const uz = p1[2] - a[2];
          const vx = p2[0] - a[0];
          const vy = p2[1] - a[1];
          const vz = p2[2] - a[2];
          let nx = uy * vz - uz * vy;
          let ny = uz * vx - ux * vz;
          let nz = ux * vy - uy * vx;
          const l = Math.hypot(nx, ny, nz) || 1;
          nx /= l;
          ny /= l;
          nz /= l;
          const flip = ny < 0;
          const order = flip ? [3, 2, 1, 0] : [0, 1, 2, 3];
          for (const i of order) {
            const p = pts[i]!;
            this.pos.push(p[0], p[1], p[2]);
            this.nrm.push(flip ? -nx : nx, flip ? -ny : ny, flip ? -nz : nz);
            const f = ao(p[0], p[2]) * dark;
            this.col.push(cr * f, cg * f, cb * f);
            this.uv.push(0.27, 0.1);
          }
          this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
        };
        const t = 0.0;
        const lo = -0.045;
        quad([[ix0, t, iz0], [ix1, t, iz0], [ix1, t, iz1], [ix0, t, iz1]], 1);
        quad([[cx, lo, cz], [cx + 1, lo, cz], [ix1, t, iz0], [ix0, t, iz0]], 0.62);
        quad([[cx + 1, lo, cz], [cx + 1, lo, cz + 1], [ix1, t, iz1], [ix1, t, iz0]], 0.78);
        quad([[cx + 1, lo, cz + 1], [cx, lo, cz + 1], [ix0, t, iz1], [ix1, t, iz1]], 0.85);
        quad([[cx, lo, cz + 1], [cx, lo, cz], [ix0, t, iz0], [ix0, t, iz1]], 0.7);
      }
  }
  footDist(x: number, z: number): number {
    let d = 9;
    for (const f of this.foot) {
      if (f.h < 0.25) continue;
      const dx = Math.max(f.x0 - x, 0, x - f.x1);
      const dz = Math.max(f.z0 - z, 0, z - f.z1);
      d = Math.min(d, Math.hypot(dx, dz));
    }
    return d;
  }
  /** 다 지은 것 → 메시 + 외곽선 */
  finish(mat: THREE.Material, lineMat: THREE.Material): THREE.Group {
    const grp = new THREE.Group();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geo.setIndex(this.idx);
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    grp.add(m);
    if (this.line.length) {
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(this.line, 3));
      const ls = new THREE.LineSegments(lg, lineMat);
      grp.add(ls);
    }
    return grp;
  }
}

/* ═════════════ 충돌 — 삼각형 격자 + 캡슐 · 구 · 아래 광선 (직접 짠 것) ═════════════ */

type V = [number, number, number];
const v3 = (): V => [0, 0, 0];

class Col {
  readonly t: Float32Array;
  readonly n: number;
  readonly nr: Float32Array;
  private yMin: Float32Array;
  private yMax: Float32Array;
  private cells: number[][];
  private stamp: Uint32Array;
  private sid = 1;
  private readonly X0 = -12;
  private readonly Z0 = -10;
  private readonly NX = 24;
  private readonly NZ = 20;
  constructor(tris: number[]) {
    this.t = new Float32Array(tris);
    this.n = tris.length / 9;
    this.nr = new Float32Array(this.n * 3);
    this.yMin = new Float32Array(this.n);
    this.yMax = new Float32Array(this.n);
    this.stamp = new Uint32Array(this.n);
    this.cells = Array.from({ length: this.NX * this.NZ }, () => [] as number[]);
    const t = this.t;
    for (let i = 0; i < this.n; i++) {
      const o = i * 9;
      const ux = t[o + 3]! - t[o]!;
      const uy = t[o + 4]! - t[o + 1]!;
      const uz = t[o + 5]! - t[o + 2]!;
      const vx = t[o + 6]! - t[o]!;
      const vy = t[o + 7]! - t[o + 1]!;
      const vz = t[o + 8]! - t[o + 2]!;
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l;
      ny /= l;
      nz /= l;
      this.nr[i * 3] = nx;
      this.nr[i * 3 + 1] = ny;
      this.nr[i * 3 + 2] = nz;
      const xs = [t[o]!, t[o + 3]!, t[o + 6]!];
      const ys = [t[o + 1]!, t[o + 4]!, t[o + 7]!];
      const zs = [t[o + 2]!, t[o + 5]!, t[o + 8]!];
      this.yMin[i] = Math.min(...ys);
      this.yMax[i] = Math.max(...ys);
      const cx0 = clamp(Math.floor(Math.min(...xs) - this.X0 - 0.01), 0, this.NX - 1);
      const cx1 = clamp(Math.floor(Math.max(...xs) - this.X0 + 0.01), 0, this.NX - 1);
      const cz0 = clamp(Math.floor(Math.min(...zs) - this.Z0 - 0.01), 0, this.NZ - 1);
      const cz1 = clamp(Math.floor(Math.max(...zs) - this.Z0 + 0.01), 0, this.NZ - 1);
      for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) this.cells[cz * this.NX + cx]!.push(i);
    }
  }
  /** 이 상자에 걸치는 삼각형 번호 */
  near(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, out: number[]): number {
    out.length = 0;
    this.sid++;
    const cx0 = clamp(Math.floor(x0 - this.X0), 0, this.NX - 1);
    const cx1 = clamp(Math.floor(x1 - this.X0), 0, this.NX - 1);
    const cz0 = clamp(Math.floor(z0 - this.Z0), 0, this.NZ - 1);
    const cz1 = clamp(Math.floor(z1 - this.Z0), 0, this.NZ - 1);
    for (let cx = cx0; cx <= cx1; cx++)
      for (let cz = cz0; cz <= cz1; cz++)
        for (const i of this.cells[cz * this.NX + cx]!) {
          if (this.stamp[i] === this.sid) continue;
          this.stamp[i] = this.sid;
          if (this.yMax[i]! < y0 || this.yMin[i]! > y1) continue;
          out.push(i);
        }
    return out.length;
  }
  /** 점 → 삼각형 위 가장 가까운 점 (Ericson) */
  cp(i: number, p: V, out: V): void {
    const t = this.t;
    const o = i * 9;
    const ax = t[o]!;
    const ay = t[o + 1]!;
    const az = t[o + 2]!;
    const abx = t[o + 3]! - ax;
    const aby = t[o + 4]! - ay;
    const abz = t[o + 5]! - az;
    const acx = t[o + 6]! - ax;
    const acy = t[o + 7]! - ay;
    const acz = t[o + 8]! - az;
    const apx = p[0] - ax;
    const apy = p[1] - ay;
    const apz = p[2] - az;
    const d1 = abx * apx + aby * apy + abz * apz;
    const d2 = acx * apx + acy * apy + acz * apz;
    const set = (v: number, w: number): void => {
      out[0] = ax + abx * v + acx * w;
      out[1] = ay + aby * v + acy * w;
      out[2] = az + abz * v + acz * w;
    };
    if (d1 <= 0 && d2 <= 0) return set(0, 0);
    const bpx = apx - abx;
    const bpy = apy - aby;
    const bpz = apz - abz;
    const d3 = abx * bpx + aby * bpy + abz * bpz;
    const d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) return set(1, 0);
    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) return set(d1 / (d1 - d3), 0);
    const cpx = apx - acx;
    const cpy = apy - acy;
    const cpz = apz - acz;
    const d5 = abx * cpx + aby * cpy + abz * cpz;
    const d6 = acx * cpx + acy * cpy + acz * cpz;
    if (d6 >= 0 && d5 <= d6) return set(0, 1);
    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) return set(0, d2 / (d2 - d6));
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
      const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
      return set(1 - w, w);
    }
    const den = 1 / (va + vb + vc);
    return set(vb * den, vc * den);
  }
  /** 선분(캡슐 뼈대) ↔ 삼각형 가장 가까운 두 점, 거리² */
  segTri(i: number, A: V, B: V, oS: V, oT: V): number {
    const t = this.t;
    const o = i * 9;
    const nx = this.nr[i * 3]!;
    const ny = this.nr[i * 3 + 1]!;
    const nz = this.nr[i * 3 + 2]!;
    const da = (A[0] - t[o]!) * nx + (A[1] - t[o + 1]!) * ny + (A[2] - t[o + 2]!) * nz;
    const db = (B[0] - t[o]!) * nx + (B[1] - t[o + 1]!) * ny + (B[2] - t[o + 2]!) * nz;
    if (da * db <= 0 && da !== db) {
      const k = da / (da - db);
      _p[0] = lerp(A[0], B[0], k);
      _p[1] = lerp(A[1], B[1], k);
      _p[2] = lerp(A[2], B[2], k);
      this.cp(i, _p, _q);
      if (Math.abs(_q[0] - _p[0]) + Math.abs(_q[1] - _p[1]) + Math.abs(_q[2] - _p[2]) < 1e-6) {
        oS[0] = oT[0] = _p[0];
        oS[1] = oT[1] = _p[1];
        oS[2] = oT[2] = _p[2];
        return 0;
      }
    }
    let best = Infinity;
    const take = (s: V, q: V): void => {
      const d = (s[0] - q[0]) ** 2 + (s[1] - q[1]) ** 2 + (s[2] - q[2]) ** 2;
      if (d < best) {
        best = d;
        oS[0] = s[0];
        oS[1] = s[1];
        oS[2] = s[2];
        oT[0] = q[0];
        oT[1] = q[1];
        oT[2] = q[2];
      }
    };
    this.cp(i, A, _q);
    take(A, _q);
    this.cp(i, B, _q);
    take(B, _q);
    for (let e = 0; e < 3; e++) {
      const e0 = o + e * 3;
      const e1 = o + ((e + 1) % 3) * 3;
      _e0[0] = t[e0]!;
      _e0[1] = t[e0 + 1]!;
      _e0[2] = t[e0 + 2]!;
      _e1[0] = t[e1]!;
      _e1[1] = t[e1 + 1]!;
      _e1[2] = t[e1 + 2]!;
      segSeg(A, B, _e0, _e1, _s1, _s2);
      take(_s1, _s2);
    }
    return best;
  }
  /** 아래로 광선 — 발밑 바닥 높이와 그 면 기울기 (ny) */
  down(x: number, y: number, z: number, maxD: number, out: { y: number; ny: number }): boolean {
    this.near(x - 0.01, y - maxD, z - 0.01, x + 0.01, y + 0.01, z + 0.01, _near2);
    let hit = false;
    let by = -Infinity;
    const t = this.t;
    for (const i of _near2) {
      const ny = this.nr[i * 3 + 1]!;
      if (ny < 0.05) continue;
      const o = i * 9;
      const ax = t[o]!;
      const az = t[o + 2]!;
      const bx = t[o + 3]!;
      const bz = t[o + 5]!;
      const cx = t[o + 6]!;
      const cz = t[o + 8]!;
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(d) < 1e-9) continue;
      const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
      const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
      const l3 = 1 - l1 - l2;
      if (l1 < -1e-5 || l2 < -1e-5 || l3 < -1e-5) continue;
      const hy = l1 * t[o + 1]! + l2 * t[o + 4]! + l3 * t[o + 7]!;
      if (hy > y + 0.01 || hy < y - maxD || hy <= by) continue;
      by = hy;
      out.y = hy;
      out.ny = ny;
      hit = true;
    }
    return hit;
  }
  /** 구가 무엇과 겹치나 */
  sphereHit(p: V, r: number): boolean {
    this.near(p[0] - r, p[1] - r, p[2] - r, p[0] + r, p[1] + r, p[2] + r, _near2);
    for (const i of _near2) {
      this.cp(i, p, _q);
      if ((p[0] - _q[0]) ** 2 + (p[1] - _q[1]) ** 2 + (p[2] - _q[2]) ** 2 < r * r) return true;
    }
    return false;
  }
}
const _p = v3();
const _q = v3();
const _e0 = v3();
const _e1 = v3();
const _s1 = v3();
const _s2 = v3();
const _near2: number[] = [];

/** 두 선분 사이 가장 가까운 두 점 (Ericson) */
function segSeg(p1: V, q1: V, p2: V, q2: V, c1: V, c2: V): void {
  const d1x = q1[0] - p1[0];
  const d1y = q1[1] - p1[1];
  const d1z = q1[2] - p1[2];
  const d2x = q2[0] - p2[0];
  const d2y = q2[1] - p2[1];
  const d2z = q2[2] - p2[2];
  const rx = p1[0] - p2[0];
  const ry = p1[1] - p2[1];
  const rz = p1[2] - p2[2];
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s = 0;
  let t = 0;
  if (a <= 1e-9 && e <= 1e-9) {
    s = t = 0;
  } else if (a <= 1e-9) {
    t = clamp(f / e, 0, 1);
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-9) {
      s = clamp(-c / a, 0, 1);
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const den = a * e - b * b;
      s = den > 1e-9 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a, 0, 1);
      }
    }
  }
  c1[0] = p1[0] + d1x * s;
  c1[1] = p1[1] + d1y * s;
  c1[2] = p1[2] + d1z * s;
  c2[0] = p2[0] + d2x * t;
  c2[1] = p2[1] + d2y * t;
  c2[2] = p2[2] + d2z * t;
}

/* 2D (위에서 본) 벽 선분 — 시야 · 작은 지도 */
interface Seg2 {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}
function rectSegs(rs: Rect[]): Seg2[] {
  const out: Seg2[] = [];
  for (const r of rs) out.push({ ax: r.x0, az: r.z0, bx: r.x1, bz: r.z0 }, { ax: r.x1, az: r.z0, bx: r.x1, bz: r.z1 }, { ax: r.x1, az: r.z1, bx: r.x0, bz: r.z1 }, { ax: r.x0, az: r.z1, bx: r.x0, bz: r.z0 });
  return out;
}
/** 광선 (ox,oz)+(dx,dz)·k 가 처음 닿는 k (없으면 maxK) */
function ray2(segs: Seg2[], ox: number, oz: number, dx: number, dz: number, maxK: number): number {
  let best = maxK;
  for (const s of segs) {
    const ex = s.bx - s.ax;
    const ez = s.bz - s.az;
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const wx = s.ax - ox;
    const wz = s.az - oz;
    const k = (wx * ez - wz * ex) / den;
    const u = (wx * dz - wz * dx) / den;
    if (k > 1e-4 && k < best && u >= 0 && u <= 1) best = k;
  }
  return best;
}

/* ═════════════ 캐릭터 — 점토 블록 기사 · 고블린 경비 · 슬라임 (외곽선은 뒤집은 껍데기) ═════════════ */

interface Rig {
  root: THREE.Group;
  yaw: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  phase: number;
}
function inked(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, ink: THREE.Material, x: number, y: number, z: number, s: [number, number, number] = [1, 1, 1], k = 1.08): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(s[0], s[1], s[2]);
  m.castShadow = true;
  const sh = new THREE.Mesh(geo, ink);
  sh.scale.setScalar(k);
  m.add(sh);
  parent.add(m);
  return m;
}
const clay = (c: number, rough = 0.58, metal = 0): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal });

function makeKnight(kind: 'knight' | 'goblin', ink: THREE.Material): Rig {
  const gob = kind === 'goblin';
  const root = new THREE.Group();
  const yaw = new THREE.Group();
  const body = new THREE.Group();
  root.add(yaw);
  yaw.add(body);
  const sph = new THREE.SphereGeometry(1, 20, 14);
  const cap = new THREE.CapsuleGeometry(1, 1.6, 4, 10);
  const armor = clay(gob ? 0x5d5650 : 0xd8dee8, 0.42, 0.12);
  const cloth = clay(gob ? 0x7a4f2c : 0x3a6bd4, 0.7);
  const dark = clay(gob ? 0x3d2b1e : 0x4a5266, 0.6);
  const skin = clay(gob ? 0x8dbb4c : 0xffd2b0, 0.65);
  const red = clay(0xe0453a, 0.6);
  const gold = clay(0xe8b64a, 0.35, 0.25);
  const eye = new THREE.MeshBasicMaterial({ color: gob ? 0xffd03a : 0x2a1a14 });
  const legs: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const lg = new THREE.Group();
    lg.position.set(sx * 0.12, 0.3, 0);
    body.add(lg);
    inked(lg, cap, dark, ink, 0, -0.13, 0, [0.085, 0.085, 0.085]);
    inked(lg, sph, gob ? dark : clay(0x6b4329, 0.7), ink, 0, -0.25, 0.04, [0.1, 0.07, 0.13]);
    legs.push(lg);
  }
  inked(body, sph, cloth, ink, 0, 0.53, 0, [0.29, 0.27, 0.25]);
  if (!gob) inked(body, sph, armor, ink, 0, 0.6, 0.05, [0.26, 0.21, 0.19], 1.04);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.255, 0.035, 8, 24), clay(0x5a3820, 0.7));
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.43;
  body.add(belt);
  inked(body, sph, gold, ink, 0, 0.43, 0.25, [0.045, 0.045, 0.03], 1.1);
  const head = new THREE.Group();
  head.position.y = 0.94;
  body.add(head);
  inked(head, sph, skin, ink, 0, 0, 0, gob ? [0.29, 0.26, 0.27] : [0.25, 0.25, 0.25]);
  if (gob) {
    for (const sx of [-1, 1]) {
      const ear = inked(head, new THREE.ConeGeometry(0.075, 0.3, 10), skin, ink, sx * 0.3, 0.04, -0.02);
      ear.rotation.z = -sx * 1.25;
      ear.rotation.x = -0.2;
      inked(head, sph, eye, ink, sx * 0.1, 0.0, 0.245, [0.05, 0.06, 0.03], 1.25);
    }
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 10, 0, TAU, 0, Math.PI * 0.42), armor);
    helm.position.y = 0.03;
    helm.castShadow = true;
    head.add(helm);
    inked(head, new THREE.ConeGeometry(0.05, 0.2, 8), clay(0xeae0c8, 0.5), ink, 0, 0.34, 0);
    for (const sx of [-1, 1]) {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.06, 6), clay(0xfff6e0, 0.5));
      tooth.position.set(sx * 0.07, -0.11, 0.24);
      tooth.rotation.x = Math.PI;
      head.add(tooth);
    }
  } else {
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.275, 20, 12, 0, TAU, 0, Math.PI * 0.5), armor);
    helm.position.y = 0.02;
    helm.rotation.x = -0.32;
    helm.castShadow = true;
    const hs = new THREE.Mesh(helm.geometry, ink);
    hs.scale.setScalar(1.06);
    helm.add(hs);
    head.add(helm);
    const brim = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.028, 8, 28), armor);
    brim.rotation.x = Math.PI / 2 - 0.32;
    brim.position.y = 0.02;
    head.add(brim);
    inked(head, new THREE.BoxGeometry(0.04, 0.16, 0.04), armor, ink, 0, 0.0, 0.27);
    for (const sx of [-1, 1]) {
      inked(head, sph, eye, ink, sx * 0.09, -0.03, 0.225, [0.035, 0.045, 0.02], 1.0);
      const bl = new THREE.Mesh(sph, clay(0xff9a8a, 0.8));
      bl.position.set(sx * 0.15, -0.09, 0.19);
      bl.scale.set(0.045, 0.025, 0.02);
      head.add(bl);
    }
    inked(head, sph, red, ink, 0, 0.3, -0.04, [0.07, 0.16, 0.17]);
    inked(head, sph, red, ink, 0, 0.22, -0.2, [0.06, 0.12, 0.1]);
  }
  const arms: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const ag = new THREE.Group();
    ag.position.set(sx * 0.29, 0.66, 0);
    body.add(ag);
    inked(ag, sph, gob ? cloth : armor, ink, 0, 0, 0, [0.11, 0.1, 0.11]);
    inked(ag, cap, gob ? skin : cloth, ink, sx * 0.02, -0.13, 0, [0.06, 0.06, 0.06]);
    inked(ag, sph, gob ? skin : dark, ink, sx * 0.02, -0.25, 0.02, [0.075, 0.075, 0.075]);
    arms.push(ag);
  }
  const armL = arms[0]!;
  const armR = arms[1]!;
  if (gob) {
    const club = inked(armR, new THREE.CylinderGeometry(0.07, 0.035, 0.5, 10), clay(0x7b5131, 0.8), ink, 0.02, -0.3, 0.2);
    club.rotation.x = 1.25;
  } else {
    const sw = new THREE.Group();
    sw.position.set(0.03, -0.27, 0.05);
    sw.rotation.x = 1.15;
    armR.add(sw);
    inked(sw, new THREE.BoxGeometry(0.055, 0.46, 0.02), clay(0xeef2f8, 0.25, 0.4), ink, 0, 0.3, 0);
    inked(sw, new THREE.BoxGeometry(0.18, 0.035, 0.05), gold, ink, 0, 0.06, 0);
    const sh = inked(armL, new THREE.CylinderGeometry(0.19, 0.19, 0.05, 20), cloth, ink, -0.07, -0.16, 0.05);
    sh.rotation.z = Math.PI / 2;
    inked(armL, sph, gold, ink, -0.1, -0.16, 0.05, [0.03, 0.07, 0.07]);
  }
  return { root, yaw, body, head, legL: legs[0]!, legR: legs[1]!, armL, armR, phase: 0 };
}

/** 걷기 · 뛰기 · 공중 자세 */
function animRig(rig: Rig, dt: number, speed: number, air: boolean, t: number): void {
  rig.phase += dt * (2.2 + speed * 2.4);
  const amt = clamp(speed / 3.2, 0, 1);
  const s = Math.sin(rig.phase);
  if (air) {
    rig.legL.rotation.x = damp(rig.legL.rotation.x, -0.7, 14, dt);
    rig.legR.rotation.x = damp(rig.legR.rotation.x, 0.45, 14, dt);
    rig.armL.rotation.x = damp(rig.armL.rotation.x, -1.2, 14, dt);
    rig.armL.rotation.z = damp(rig.armL.rotation.z, 0.5, 14, dt);
    rig.body.position.y = damp(rig.body.position.y, 0, 14, dt);
  } else {
    rig.legL.rotation.x = s * 0.85 * amt;
    rig.legR.rotation.x = -s * 0.85 * amt;
    rig.armL.rotation.x = -s * 0.6 * amt;
    rig.armL.rotation.z = damp(rig.armL.rotation.z, 0, 10, dt);
    rig.body.position.y = Math.abs(s) * 0.05 * amt + Math.sin(t * 2.4) * 0.008;
  }
  rig.body.rotation.x = damp(rig.body.rotation.x, amt * 0.12, 8, dt);
}

interface Slime {
  root: THREE.Group;
  body: THREE.Mesh;
  phase: number;
}
function makeSlime(color: number, ink: THREE.Material, sph: THREE.BufferGeometry): Slime {
  const root = new THREE.Group();
  const holder = new THREE.Group();
  root.add(holder);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.28, emissive: color, emissiveIntensity: 0.12 });
  const body = inked(holder, sph, mat, ink, 0, 0.27, 0, [0.36, 0.29, 0.36], 1.07);
  const eye = new THREE.MeshBasicMaterial({ color: 0x1c1410 });
  const wh = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(sph, eye);
    e.position.set(sx * 0.3, 0.12, 0.85);
    e.scale.set(0.12, 0.17, 0.08);
    body.add(e);
    const w = new THREE.Mesh(sph, wh);
    w.position.set(sx * 0.3 - 0.03, 0.18, 0.92);
    w.scale.set(0.04, 0.05, 0.03);
    body.add(w);
  }
  const sh = new THREE.Mesh(sph, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
  sh.position.set(-0.35, 0.55, 0.45);
  sh.scale.set(0.16, 0.1, 0.1);
  body.add(sh);
  return { root, body, phase: hash(color) * TAU };
}

/* ═════════════ 횃불 (불꽃 빛 판 겹치기 + 점광) ═════════════ */

function glowTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,240,200,0.75)');
  gr.addColorStop(0.6, 'rgba(255,170,80,0.18)');
  gr.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
interface Torch {
  core: THREE.Sprite;
  halo: THREE.Sprite;
  light: THREE.PointLight;
  seed: number;
}

/* ═════════════ 크게 보기 입력 (화면 캔버스 누르기 · 키) ═════════════ */

class BigInput {
  el: HTMLCanvasElement | null = null;
  keys = new Set<string>();
  lastKey = -1e9;
  clicks: { x: number; y: number }[] = [];
  private wantKeys: boolean;
  constructor(wantKeys: boolean) {
    this.wantKeys = wantKeys;
  }
  attach(w: number, h: number): void {
    if (this.el) return;
    const c = findBigCanvas(w, h);
    if (!c) return;
    this.el = c;
    c.addEventListener('pointerdown', this.pd);
    c.style.cursor = 'crosshair';
    if (this.wantKeys) {
      window.addEventListener('keydown', this.kd);
      window.addEventListener('keyup', this.ku);
      window.addEventListener('blur', this.bl);
    }
  }
  private pd = (e: PointerEvent): void => {
    const r = this.el!.getBoundingClientRect();
    this.clicks.push({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 });
  };
  private kd = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', ' '].includes(k)) {
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA') && (tgt as HTMLInputElement).type !== 'range' && (tgt as HTMLInputElement).type !== 'checkbox') return;
      e.preventDefault();
      if (!this.keys.has(k)) this.keys.add(k);
      this.lastKey = performance.now();
    }
  };
  private ku = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());
  };
  private bl = (): void => {
    this.keys.clear();
  };
  dispose(): void {
    if (this.el) {
      this.el.removeEventListener('pointerdown', this.pd);
      this.el.style.cursor = '';
      this.el = null;
    }
    if (this.wantKeys) {
      window.removeEventListener('keydown', this.kd);
      window.removeEventListener('keyup', this.ku);
      window.removeEventListener('blur', this.bl);
    }
    this.keys.clear();
  }
}

/* ═════════════ 무대 틀 — 장면 · 빛 · 횃불 · 나눠 짓기 · 셰이더 미리 굽기 · HUD ═════════════ */

const STONE = 0xa8917a;
const WALL = 0x947c63;
const WALL_TOP = 0xb8a084;
const SLAB = 0x6c5746;
const WOOD = 0x8d5c35;

abstract class Stage implements Scene3D {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1.6, 0.5, 90);
  readonly hud = new Hud();
  readonly ink = new THREE.MeshBasicMaterial({ color: 0x1d120b, side: THREE.BackSide });
  readonly arenaMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, map: brickTex() });
  readonly lineMat = new THREE.LineBasicMaterial({ color: 0x2b1a0e, transparent: true, opacity: 0.5 });
  readonly root = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  readonly torches: Torch[] = [];
  readonly glow = glowTex();
  protected phases: (() => void)[] = [];
  ready = false;
  private compiling = false;
  big = false;
  w = 1;
  h = 1;
  controls: Control[] = [];
  protected bg: number;
  constructor(bg = 0x1c1410) {
    this.bg = bg;
    this.scene.background = new THREE.Color(bg);
    this.scene.fog = new THREE.Fog(bg, 30, 60);
    this.scene.add(this.root);
    this.scene.add(new THREE.HemisphereLight(0xffe4c0, 0x3b271a, 1.15));
    const sun = new THREE.DirectionalLight(0xffd9a8, 2.3);
    sun.position.set(7, 13, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -12;
    sc.right = 12;
    sc.top = 12;
    sc.bottom = -12;
    sc.near = 1;
    sc.far = 40;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun, sun.target);
    this.sun = sun;
    const rim = new THREE.DirectionalLight(0x9db8ff, 0.45);
    rim.position.set(-8, 6, -9);
    this.scene.add(rim);
  }
  protected addTorch(x: number, y: number, z: number): void {
    const bm = clay(0x3b2a1e, 0.7);
    const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.32, 8), bm);
    holder.position.set(x, y - 0.12, z);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.07, 0.12, 10), bm);
    cup.position.set(x, y + 0.06, z);
    this.root.add(holder, cup);
    const mk = (col: number, s: number, op: number): THREE.Sprite => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }));
      sp.scale.setScalar(s);
      sp.position.set(x, y + 0.24, z);
      this.root.add(sp);
      return sp;
    };
    const halo = mk(0xff8a3a, 1.9, 0.38);
    const core = mk(0xffe2a0, 0.42, 1);
    const light = new THREE.PointLight(0xff9a4a, 5, 7, 1.6);
    light.position.set(x, y + 0.35, z);
    this.root.add(light);
    this.torches.push({ core, halo, light, seed: x * 3.1 + z });
  }
  /** 시험장 한 판 짓기 (단계 하나) */
  protected buildArena(fn: (b: Builder) => void | (() => void), done: (b: Builder) => void): void {
    const b = new Builder();
    this.phases.push(() => {
      const more = fn(b);
      if (more) this.phases.unshift(more);
    });
    this.phases.push(() => this.root.add(b.finish(this.arenaMat, this.lineMat)));
    this.phases.push(() => done(b));
  }
  update(t: number, dt: number): void {
    if (!this.ready) return;
    const d = Math.min(dt, 0.05);
    for (const tc of this.torches) {
      const f = 0.85 + 0.1 * Math.sin(t * 13 + tc.seed) + 0.06 * Math.sin(t * 27.3 + tc.seed * 2);
      tc.core.scale.set(0.36 * f, 0.5 * f, 1);
      tc.halo.scale.setScalar(1.9 * f);
      tc.light.intensity = 5 * f;
    }
    this.tick(t, d);
  }
  protected abstract tick(t: number, dt: number): void;
  /** 장면 그리기 (나란히 보기 등은 덮어씀) */
  protected draw(r: R, _w: number, _h: number): void {
    r.autoClear = true;
    r.render(this.scene, this.camera);
  }
  /** HUD 판 배치 */
  protected overlay(_w: number, _h: number): void {}
  protected onBig(_w: number, _h: number): void {}
  render(r: R, w: number, h: number): void {
    withState(r, () => {
      this.w = w;
      this.h = h;
      this.big = w >= 700;
      if (this.big) this.onBig(w, h);
      this.hud.size(w, h);
      if (!this.ready) {
        const t0 = performance.now();
        while (this.phases.length && performance.now() - t0 < 3) this.phases.shift()!();
        if (!this.phases.length && !this.compiling) {
          this.compiling = true;
          r.compileAsync(this.scene, this.camera)
            .catch(() => undefined)
            .finally(() => {
              this.ready = true;
            });
        }
        r.setClearColor(this.bg, 1);
        r.autoClear = true;
        r.clear();
        const u = this.hud.u;
        const p = this.hud.get('wait');
        const pw = 150 * u;
        const ph = 22 * u;
        p.place((w - pw) / 2, (h - ph) / 2, pw, ph);
        p.paint(pw, ph, 'wait', (g) => pill(g, '유적 시험장 짓는 중…', pw / 2, 2 * u, 11 * u, 'rgba(255,220,170,0.14)', '#f3dcc0', 'c'));
        this.hud.render(r);
        return;
      }
      this.draw(r, w, h);
      this.overlay(w, h);
      this.hud.render(r);
    });
  }
  /** 3D 점 → 화면 픽셀 */
  protected toScreen(p: THREE.Vector3, cam: THREE.Camera = this.camera, vx = 0, vw = this.w): { x: number; y: number; ok: boolean } {
    _sv.copy(p).project(cam);
    return { x: vx + (_sv.x * 0.5 + 0.5) * vw, y: (-_sv.y * 0.5 + 0.5) * this.h, ok: _sv.z < 1 };
  }
  protected onDispose(): void {}
  dispose(): void {
    this.onDispose();
    disposeTree(this.scene);
    this.hud.dispose();
    this.glow.dispose();
  }
}
const _sv = new THREE.Vector3();

/** 돌 쌓은 무늬 (회색조, 정점 색에 곱함) — 줄눈 · 돌마다 밝기 · 잔 얼룩 */
function brickTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#6d6a66';
  g.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? 64 : 0;
    for (let k = -1; k < 3; k++) {
      const x = k * 128 + off;
      const v = 222 + Math.floor(hash(row * 7.1 + k * 3.3) * 33);
      g.fillStyle = `rgb(${v},${v},${v})`;
      rr(g, x + 3, row * 64 + 3, 122, 58, 6);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.16)';
      g.fillRect(x + 6, row * 64 + 4, 116, 5);
      g.fillStyle = 'rgba(0,0,0,0.1)';
      g.fillRect(x + 6, row * 64 + 55, 116, 5);
    }
  }
  for (let i = 0; i < 900; i++) {
    const a = hash(i * 1.37) * 0.09;
    g.fillStyle = hash(i * 2.9) > 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`;
    const s = 1 + hash(i * 5.1) * 3;
    g.fillRect(hash(i * 3.7) * 256, hash(i * 7.3) * 256, s, s);
  }
  // 바닥 타일이 쓰는 칸 (uv 0.27, 0.1 둘레) 은 깨끗한 흰색
  g.fillStyle = '#ffffff';
  g.fillRect(60, 220, 24, 20);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** 바닥 판 (속은 비고 둘레만 보임) + 충돌 윗면 */
function slab(b: Builder, x0: number, z0: number, x1: number, z1: number): void {
  b.box(x0, -2, z0, x1, -0.045, z1, SLAB, { col: false, top: false, ao: -2.2, foot: false, edge: false });
  b.box(x0, -2, z0, x1, 0, z1, SLAB, { vis: false, foot: false });
}
/** 기둥 (받침 · 몸 · 머리) */
function pillar(b: Builder, x: number, z: number, s: number, h: number): void {
  const hs = s / 2;
  b.box(x - hs - 0.08, 0, z - hs - 0.08, x + hs + 0.08, 0.22, z + hs + 0.08, WALL, { topColor: WALL_TOP });
  b.box(x - hs, 0.22, z - hs, x + hs, h - 0.2, z + hs, 0x9f876c, { foot: false });
  b.box(x - hs - 0.1, h - 0.2, z - hs - 0.1, x + hs + 0.1, h, z + hs + 0.1, WALL, { topColor: WALL_TOP, foot: false });
  b.foot.push({ x0: x - hs - 0.08, z0: z - hs - 0.08, x1: x + hs + 0.08, z1: z + hs + 0.08, h });
}
/** 벽 — 위에 돌 머리 한 줄 */
function wall(b: Builder, x0: number, z0: number, x1: number, z1: number, h: number): void {
  b.box(x0, 0, z0, x1, h, z1, WALL, { topColor: WALL_TOP });
}
/** 나무 다리 (판자 여러 장) */
function bridge(b: Builder, x0: number, x1: number, z0: number, z1: number): void {
  const n = Math.round((x1 - x0) / 0.36);
  const pw = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const k = hash(i * 9.1);
    b.box(x0 + i * pw + 0.02, -0.14, z0 + (k - 0.5) * 0.06, x0 + (i + 1) * pw - 0.02, -0.01 - k * 0.02, z1 + (k - 0.5) * 0.06, WOOD, { col: false, foot: false, ao: -1 });
  }
  b.box(x0, -0.2, z0, x1, 0, z1, WOOD, { vis: false, foot: false });
  for (const z of [z0 - 0.06, z1 + 0.06]) b.box(x0, -0.2, z - 0.05, x1, -0.08, z + 0.05, 0x5e3c22, { col: false, foot: false, ao: -1 });
  for (const x of [x0 - 0.1, x1 + 0.1]) for (const z of [z0 - 0.14, z1 + 0.14]) b.box(x - 0.07, 0, z - 0.07, x + 0.07, 0.55, z + 0.07, 0x6a4428, { foot: false, col: false });
}
/** 구덩이 바닥 (흙 + 돌 부스러기) */
function pitFloor(b: Builder, x0: number, z0: number, x1: number, z1: number): void {
  b.box(x0, -2.2, z0, x1, -1.8, z1, 0x3a2a1f, { ao: -1.8, foot: false });
  for (let i = 0; i < 7; i++) {
    const x = lerp(x0 + 0.3, x1 - 0.3, hash(i * 3.7));
    const z = lerp(z0 + 0.3, z1 - 0.3, hash(i * 5.3 + 1));
    const s = 0.12 + hash(i * 1.9) * 0.18;
    b.box(x - s, -1.8, z - s, x + s, -1.8 + s * 1.2, z + s, 0x5a4636, { col: false, foot: false, ao: -1.8 });
  }
}

/* ═════════════ i480 캐릭터 조작기 ═════════════ */

type Kind = 'ground' | 'steep' | 'wall' | 'ceil';
interface Contact {
  p: V;
  n: V;
  kind: Kind;
}
interface WP {
  x: number;
  z: number;
  tmax?: number;
  label?: string;
  act?: 'coyote';
}
const ROUTE_A: WP[] = [
  { x: 1.7, z: -4.6, label: '계단으로' },
  { x: -3.0, z: -4.6, label: '계단 오르기 (한 칸 0.25 ≤ 0.30)' },
  { x: -4.3, z: -3.3, label: '가파른 경사로 위로' },
  { x: -4.3, z: 0.9, label: '가파른 경사 51° — 서 있지 못하고 미끄러짐' },
  { x: -4.3, z: -3.0, tmax: 1.8, label: '다시 오르기 — 한계 45° 를 넘어 막힘' },
  { x: -6.6, z: 1.9, label: '완만한 경사로 앞' },
  { x: -6.6, z: -3.4, label: '완만한 경사 24° — 걸어 오름' },
  { x: -3.0, z: -4.6, label: '단 위' },
  { x: 1.6, z: -4.6, label: '계단 내려가기 — 바닥 붙기' },
  { x: -5.5, z: 2.6, label: '벽 쪽으로' },
  { x: -0.2, z: 4.9, tmax: 3.6, label: '벽에 비스듬히 — 벽 따라 미끄러지기' },
  { x: 1.0, z: 1.9, label: '구덩이 앞' },
  { x: 7.3, z: 1.9, act: 'coyote', label: '모서리를 지나서 점프 — 코요테 · 점프 버퍼' },
  { x: 6.4, z: 0.0, label: '다리로' },
  { x: 0.8, z: 0.0, label: '나무 다리 건너기' },
  { x: 0.5, z: 4.0, label: '처음 자리' },
];
const KIND_COL: Record<Kind, number> = { ground: 0x6ee07a, steep: 0xffa43a, wall: 0x5cc8ff, ceil: 0xff6a8a };

class CtrlDemo extends Stage {
  private col: Col | null = null;
  private rig!: Rig;
  private readonly R = 0.32;
  private readonly H = 1.25;
  private pos = new THREE.Vector3(0.5, 0, 4);
  private vel = new THREE.Vector3();
  private yaw = 0;
  private maxSlope = 45;
  private stepH = 0.3;
  private coyote = 0.12;
  private buffer = 0.15;
  private grounded = false;
  private groundNy = 1;
  private sinceGround = 0;
  private bufT = 0;
  private bufAir = false;
  private jumped = false;
  private kindNow: 'ground' | 'steep' | 'wall' | 'air' = 'air';
  private stepFlash = 0;
  private contacts: Contact[] = [];
  private toasts: { text: string; col: string; t0: number; p: THREE.Vector3 }[] = [];
  private wp = 0;
  private wpT = 0;
  private pendingBuffer = false;
  private pitT = 0;
  private acc = 0;
  private time = 0;
  private input = new BigInput(true);
  private prevSpace = false;
  private capLines!: THREE.LineSegments;
  private arrows: THREE.ArrowHelper[] = [];
  private near: number[] = [];
  private A = v3();
  private B = v3();
  private cs = v3();
  private ct = v3();
  private hit = { y: 0, ny: 1 };
  constructor() {
    super();
    this.camera.fov = 30;
    this.followCam(1);
    this.buildArena(
      (b) => {
        slab(b, -8, -6, 2, 6);
        slab(b, 5, -6, 8, 6);
        slab(b, 2, -6, 5, -3);
        slab(b, 2, 3, 5, 6);
        pitFloor(b, 2, -3, 5, 3);
        wall(b, -8.6, -6.6, 8.6, -6, 2.4);
        wall(b, -8.6, -6, -8, 6.4, 2.4);
        wall(b, -8, 6, 8.4, 6.4, 0.35);
        wall(b, 8, -6, 8.4, 6, 0.35);
        b.box(-7.6, 0, -5.6, -2.4, 1.5, -2.5, WALL, { topColor: STONE });
        b.wedge(-7.6, -2.5, -5.6, 0.9, 0, 1.5, '-z', 0xb09878);
        b.wedge(-5.0, -2.5, -3.6, -1.3, 0, 1.5, '-z', 0xc08a62);
        for (let i = 0; i < 6; i++) b.box(-2.4 + i * 0.5, 0, -5.6, -1.9 + i * 0.5, 1.25 - i * 0.25, -3.6, WALL, { topColor: WALL_TOP });
        wall(b, -6, 3.3, -1, 3.7, 1.1);
        pillar(b, 6.7, -4.5, 0.8, 2.2);
        pillar(b, 7.0, 4.7, 0.7, 0.95);
        bridge(b, 1.9, 5.1, -0.55, 0.55);
        return () => b.tiles(-8, -6, 8, 6, STONE, (x, z) => x > 2 && x < 5 && z > -3 && z < 3, 1);
      },
      (b) => {
        this.col = new Col(b.tris);
      },
    );
    this.phases.push(() => {
      this.addTorch(-1.2, 1.75, -5.88);
      this.addTorch(4.4, 1.75, -5.88);
      this.rig = makeKnight('knight', this.ink);
      this.root.add(this.rig.root);
      this.capLines = this.makeCapsule();
      this.root.add(this.capLines);
      for (let i = 0; i < 4; i++) {
        const a = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 0.7, 0xffffff, 0.2, 0.12);
        for (const m of [a.line.material, a.cone.material] as THREE.Material[]) {
          m.depthTest = false;
          m.transparent = true;
        }
        a.renderOrder = 10;
        a.visible = false;
        this.root.add(a);
        this.arrows.push(a);
      }
    });
    this.controls = [
      { type: 'range', label: '오를 수 있는 경사 한계 (°)', min: 20, max: 70, step: 1, value: 45, on: (v) => (this.maxSlope = v) },
      { type: 'range', label: '계단 오르기 높이', min: 0, max: 0.5, step: 0.01, value: 0.3, on: (v) => (this.stepH = v) },
      { type: 'range', label: '코요테 시간 (초)', min: 0, max: 0.25, step: 0.01, value: 0.12, on: (v) => (this.coyote = v) },
      { type: 'range', label: '점프 버퍼 (초)', min: 0, max: 0.25, step: 0.01, value: 0.15, on: (v) => (this.buffer = v) },
    ];
  }
  private camTgt = new THREE.Vector3(0.5, 0, 3);
  private vis = new THREE.Vector3(0.5, 0, 4);
  /** 쿼터뷰 — 주인공을 부드럽게 따라감 (판 밖은 덜 보이게 가둠) */
  private followCam(k: number): void {
    this.camTgt.x = lerp(this.camTgt.x, clamp(this.pos.x, -4.2, 4.6), k);
    this.camTgt.z = lerp(this.camTgt.z, clamp(this.pos.z, -3.2, 2.8), k);
    this.camTgt.y = lerp(this.camTgt.y, clamp(this.pos.y, 0, 1.5) * 0.5, k);
    const z = this.big ? 1 : 0.8;
    this.camera.position.set(this.camTgt.x + 5.6 * z, this.camTgt.y + 10.8 * z, this.camTgt.z + 9.6 * z);
    this.camera.lookAt(this.camTgt);
  }
  private makeCapsule(): THREE.LineSegments {
    const R = this.R;
    const H = this.H;
    const p: number[] = [];
    const N = 28;
    for (const y of [R, H - R])
      for (let i = 0; i < N; i++) {
        const a0 = (i / N) * TAU;
        const a1 = ((i + 1) / N) * TAU;
        p.push(Math.cos(a0) * R, y, Math.sin(a0) * R, Math.cos(a1) * R, y, Math.sin(a1) * R);
      }
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU;
      p.push(Math.cos(a) * R, R, Math.sin(a) * R, Math.cos(a) * R, H - R, Math.sin(a) * R);
    }
    for (const rot of [0, Math.PI / 2])
      for (const [cy, s] of [
        [R, -1],
        [H - R, 1],
      ] as const)
        for (let i = 0; i < 14; i++) {
          const a0 = (i / 14) * Math.PI;
          const a1 = ((i + 1) / 14) * Math.PI;
          const f = (a: number): P3 => {
            const h = Math.cos(a) * R;
            return [h * Math.cos(rot), cy + s * Math.sin(a) * R, h * Math.sin(rot)];
          };
          p.push(...f(a0), ...f(a1));
        }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    const ls = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x6ee07a, transparent: true, opacity: 0.95, depthTest: false }));
    ls.renderOrder = 9;
    return ls;
  }
  private toast(text: string, col: string): void {
    this.toasts.push({ text, col, t0: this.time, p: this.pos.clone().add(new THREE.Vector3(0, this.H + 0.9, 0)) });
    if (this.toasts.length > 3) this.toasts.shift();
  }
  private respawn(): void {
    this.pos.set(0.5, 0, 4);
    this.vel.set(0, 0, 0);
    this.wp = 0;
    this.wpT = 0;
    this.grounded = false;
  }
  private seg(p: THREE.Vector3): void {
    this.A[0] = this.B[0] = p.x;
    this.A[2] = this.B[2] = p.z;
    this.A[1] = p.y + this.R;
    this.B[1] = p.y + this.H - this.R;
  }
  /** 이 자리에 캡슐을 두면 무엇과 겹치나 */
  private overlaps(p: THREE.Vector3): boolean {
    const col = this.col!;
    this.seg(p);
    const R = this.R - 0.02;
    col.near(p.x - R, p.y, p.z - R, p.x + R, p.y + this.H, p.z + R, this.near);
    for (const i of this.near) if (col.segTri(i, this.A, this.B, this.cs, this.ct) < R * R) return true;
    return false;
  }
  /** 한 걸음 (고정 1/60 초) */
  private stepSim(dt: number, wish: THREE.Vector3, jumpPress: boolean): void {
    const col = this.col!;
    const cosMax = Math.cos((this.maxSlope * Math.PI) / 180);
    const wasGrounded = this.grounded;
    // 1) 입력 → 속도
    const sp = 4.2;
    const a = wasGrounded ? 28 : 9;
    this.vel.x = damp(this.vel.x, wish.x * sp, a * 0.35, dt);
    this.vel.z = damp(this.vel.z, wish.z * sp, a * 0.35, dt);
    // 2) 점프 — 버퍼 · 코요테
    if (jumpPress) {
      this.bufT = this.buffer + 1e-4;
      this.bufAir = !wasGrounded;
    }
    if (wasGrounded) {
      this.sinceGround = 0;
      this.jumped = false;
    } else this.sinceGround += dt;
    let jumpedNow = false;
    if (this.bufT > 0 && !this.jumped && (wasGrounded || this.sinceGround <= this.coyote)) {
      this.vel.y = 6.8;
      jumpedNow = true;
      this.jumped = true;
      if (!wasGrounded) this.toast(`코요테 점프! 떨어진 뒤 ${this.sinceGround.toFixed(2)}초`, '#ffd25a');
      else if (this.bufAir) this.toast('점프 버퍼! 땅 닿기 전에 누른 점프', '#8fe0ff');
      this.bufT = 0;
      this.grounded = false;
    }
    this.bufT = Math.max(0, this.bufT - dt);
    // 3) 중력 (바닥이면 살짝 눌러 붙임)
    if (this.grounded && !jumpedNow) this.vel.y = -0.6;
    else this.vel.y -= 18 * dt;
    this.vel.y = Math.max(this.vel.y, -16);
    this.pos.addScaledVector(this.vel, dt);
    // 4) 밀어내기
    this.contacts.length = 0;
    let ground = false;
    let gny = 1;
    let wallHit = false;
    let steepHit = false;
    let lowBlock = false;
    for (let it = 0; it < 4; it++) {
      this.seg(this.pos);
      const R = this.R;
      col.near(this.pos.x - R, this.pos.y - 0.05, this.pos.z - R, this.pos.x + R, this.pos.y + this.H, this.pos.z + R, this.near);
      let moved = false;
      for (const i of this.near) {
        this.seg(this.pos);
        const d2 = col.segTri(i, this.A, this.B, this.cs, this.ct);
        if (d2 >= R * R - 1e-6) continue;
        const d = Math.sqrt(d2);
        let nx: number;
        let ny: number;
        let nz: number;
        if (d > 1e-5) {
          nx = (this.cs[0] - this.ct[0]) / d;
          ny = (this.cs[1] - this.ct[1]) / d;
          nz = (this.cs[2] - this.ct[2]) / d;
        } else {
          nx = col.nr[i * 3]!;
          ny = col.nr[i * 3 + 1]!;
          nz = col.nr[i * 3 + 2]!;
        }
        const depth = R - d;
        let kind: Kind;
        if (ny >= cosMax) {
          kind = 'ground';
          this.pos.y += depth / ny;
          if (this.vel.y < 0) this.vel.y = 0;
          ground = true;
          gny = Math.min(gny, ny);
        } else if (ny > 0.08) {
          kind = 'steep';
          const hl = Math.hypot(nx, nz) || 1;
          const hx = nx / hl;
          const hz = nz / hl;
          this.pos.x += hx * depth * 1.02;
          this.pos.z += hz * depth * 1.02;
          const vn = this.vel.x * hx + this.vel.z * hz;
          if (vn < 0) {
            this.vel.x -= hx * vn;
            this.vel.z -= hz * vn;
          }
          steepHit = true;
        } else if (ny > -0.3) {
          kind = 'wall';
          this.pos.x += nx * depth;
          this.pos.y += ny * depth;
          this.pos.z += nz * depth;
          const vn = this.vel.x * nx + this.vel.z * nz;
          if (vn < 0) {
            this.vel.x -= nx * vn;
            this.vel.z -= nz * vn;
          }
          wallHit = true;
        } else {
          kind = 'ceil';
          this.pos.x += nx * depth;
          this.pos.y += ny * depth;
          this.pos.z += nz * depth;
          if (this.vel.y > 0) this.vel.y = 0;
        }
        if (kind !== 'ground' && kind !== 'ceil' && this.ct[1] - this.pos.y <= this.stepH + 0.03) lowBlock = true;
        moved = true;
        if (this.contacts.length < 4 && !this.contacts.some((c) => c.kind === kind && Math.abs(c.n[0] - nx) + Math.abs(c.n[1] - ny) + Math.abs(c.n[2] - nz) < 0.2))
          this.contacts.push({ p: [this.ct[0], this.ct[1], this.ct[2]], n: [nx, ny, nz], kind });
      }
      if (!moved) break;
    }
    // 5) 계단 오르기 — 벽에 막혔고 그 턱이 계단 높이 이하면 올라섬
    if (lowBlock && wasGrounded && !jumpedNow && wish.lengthSq() > 0.01 && this.stepH > 0.01) {
      const up = this.stepH + 0.02;
      const test = this.pos.clone().add(new THREE.Vector3(wish.x * 0.12, up, wish.z * 0.12));
      if (!this.overlaps(test)) {
        const fx = test.x + wish.x * this.R * 0.75;
        const fz = test.z + wish.z * this.R * 0.75;
        if (col.down(fx, test.y, fz, up + 0.05, this.hit) && this.hit.ny >= cosMax && this.hit.y > this.pos.y + 0.03 && this.hit.y - this.pos.y <= up) {
          const rise = this.hit.y - this.pos.y;
          this.pos.set(fx, this.hit.y + 0.005, fz);
          if (this.overlaps(this.pos)) this.pos.set(test.x, this.hit.y + 0.005, test.z);
          ground = true;
          gny = 1;
          wallHit = false;
          steepHit = false;
          if (this.time - this.stepFlash > 0.35) this.toast(`계단 +${rise.toFixed(2)}`, '#bff0a8');
          this.stepFlash = this.time;
        }
      }
    }
    // 6) 바닥 붙기 — 내리막 · 계단 내려갈 때 붕 뜨지 않게
    if (!ground && wasGrounded && !jumpedNow && this.vel.y <= 0.01) {
      if (col.down(this.pos.x, this.pos.y + 0.05, this.pos.z, this.stepH + 0.12, this.hit) && this.hit.ny >= cosMax) {
        this.pos.y = this.hit.y;
        ground = true;
        gny = this.hit.ny;
        this.vel.y = 0;
      }
    }
    this.grounded = ground;
    if (ground) this.groundNy = gny;
    this.kindNow = ground ? 'ground' : steepHit ? 'steep' : wallHit ? 'wall' : 'air';
    if (ground && wallHit) this.kindNow = 'wall';
  }
  protected tick(t: number, dt: number): void {
    if (!this.col) return;
    this.time = t;
    if (this.big) this.input.attach(this.w, this.h);
    const manual = performance.now() - this.input.lastKey < 4000;
    const wish = new THREE.Vector3();
    let press = false;
    if (manual) {
      const k = this.input.keys;
      const f = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
      const s = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
      const fw = new THREE.Vector3();
      this.camera.getWorldDirection(fw);
      fw.y = 0;
      fw.normalize();
      const rt = new THREE.Vector3(-fw.z, 0, fw.x);
      wish.addScaledVector(fw, f).addScaledVector(rt, s);
      if (wish.lengthSq() > 1) wish.normalize();
      const sp = k.has(' ');
      press = sp && !this.prevSpace;
      this.prevSpace = sp;
    }
    this.acc = Math.min(this.acc + dt, 0.07);
    while (this.acc >= 1 / 60) {
      this.acc -= 1 / 60;
      if (!manual) press = this.autopilot(wish, 1 / 60) || press;
      this.stepSim(1 / 60, wish, press);
      press = false;
    }
    // 구덩이에 빠지면 처음으로
    if (this.pos.y < -1.2) {
      this.pitT += dt;
      if (this.pitT > 1.3) {
        this.toast('구덩이에 빠짐 — 처음 자리로', '#ff9a8a');
        this.respawn();
        this.pitT = 0;
      }
    } else this.pitT = 0;
    // 보이는 것
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.3) this.yaw = this.yaw + angWrap(Math.atan2(this.vel.x, this.vel.z) - this.yaw) * (1 - Math.exp(-14 * dt));
    const rig = this.rig;
    this.vis.x = this.pos.x;
    this.vis.z = this.pos.z;
    this.vis.y = Math.abs(this.vis.y - this.pos.y) > 0.6 ? this.pos.y : damp(this.vis.y, this.pos.y, 22, dt);
    rig.root.position.copy(this.vis);
    rig.yaw.rotation.y = this.yaw;
    animRig(rig, dt, hs, !this.grounded, t);
    this.capLines.position.copy(this.vis);
    this.followCam(1 - Math.exp(-2.5 * dt));
    const kc = this.kindNow === 'air' ? 0xf4ead8 : KIND_COL[this.kindNow];
    (this.capLines.material as THREE.LineBasicMaterial).color.setHex(kc);
    for (let i = 0; i < 4; i++) {
      const a = this.arrows[i]!;
      const c = this.contacts[i];
      a.visible = !!c;
      if (!c) continue;
      a.position.set(c.p[0], c.p[1], c.p[2]);
      a.setDirection(new THREE.Vector3(c.n[0], c.n[1], c.n[2]));
      a.setColor(KIND_COL[c.kind]);
    }
  }
  /** 자동 시연 — 길 따라 걷고, 정해진 곳에서 점프 */
  private autopilot(wish: THREE.Vector3, dt: number): boolean {
    const w = ROUTE_A[this.wp]!;
    this.wpT += dt;
    const dx = w.x - this.pos.x;
    const dz = w.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.01) wish.set(dx / d, 0, dz / d);
    let press = false;
    if (w.act === 'coyote') {
      if (!this.grounded && !this.jumped && this.sinceGround > 0.06 && this.pos.x > 1.9) {
        press = true;
        this.pendingBuffer = true;
      } else if (this.pendingBuffer && !this.grounded && this.vel.y < -1 && this.pos.x > 4.6) {
        if (this.col!.down(this.pos.x, this.pos.y + 0.02, this.pos.z, 0.45, this.hit) && this.pos.y - this.hit.y > 0.12) {
          press = true;
          this.pendingBuffer = false;
        }
      }
    }
    if (d < 0.35 || this.wpT > (w.tmax ?? 9)) {
      this.wp = (this.wp + 1) % ROUTE_A.length;
      this.wpT = 0;
      this.pendingBuffer = false;
    }
    return press;
  }
  protected overlay(w: number, h: number): void {
    const u = this.hud.u;
    const hp = this.hud;
    // 상태 글자 (머리 위)
    const label = { ground: '바닥', steep: '경사 — 미끄러짐', wall: '벽 — 따라 미끄러지기', air: '공중' }[this.kindNow];
    const lc = { ground: '#6ee07a', steep: '#ffa43a', wall: '#5cc8ff', air: '#f4ead8' }[this.kindNow];
    const sp = this.toScreen(_tv.copy(this.pos).setY(this.pos.y + this.H + 0.35));
    const st = hp.get('state');
    const sw = 150 * u;
    const sh = 18 * u;
    st.place(sp.x - sw / 2, sp.y - sh, sw, sh);
    st.paint(sw, sh, label, (g) => pill(g, label, sw / 2, 1, 10 * u, 'rgba(20,12,8,0.82)', lc, 'c'));
    // 떠오르는 알림
    this.toasts = this.toasts.filter((x) => this.time - x.t0 < 1.6);
    this.toasts.forEach((x, i) => {
      const k = (this.time - x.t0) / 1.6;
      const p = this.toScreen(_tv.copy(x.p).setY(x.p.y + k * 0.8));
      const pn = hp.get('toast' + i);
      const tw = 200 * u;
      const th = 20 * u;
      pn.place(p.x - tw / 2, p.y - th * (1.6 + (this.toasts.length - 1 - i) * 1.1), tw, th);
      pn.mat.opacity = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
      pn.paint(tw, th, x.text + x.col, (g) => pill(g, x.text, tw / 2, 1, 10.5 * u, 'rgba(25,14,8,0.88)', x.col, 'c'));
    });
    // 왼쪽 위 계기판
    const deg = Math.round((Math.acos(clamp(this.groundNy, -1, 1)) * 180) / Math.PI);
    const coy = this.grounded ? 1 : clamp(1 - this.sinceGround / Math.max(1e-3, this.coyote), 0, 1);
    const buf = clamp(this.bufT / Math.max(1e-3, this.buffer), 0, 1);
    const pw = 112 * u * (this.big ? 1.2 : 1);
    const ph = 62 * u * (this.big ? 1.2 : 1);
    const panel = hp.get('meter');
    panel.place(6 * u, 6 * u, pw, ph);
    const key = [deg, this.grounded ? 1 : 0, Math.round(coy * 20), Math.round(buf * 20), this.maxSlope, this.stepH.toFixed(2)].join('|');
    panel.paint(pw, ph, key, (g, W, Hh) => {
      const s = W / 112;
      rr(g, 0, 0, W, Hh, 7 * s);
      g.fillStyle = 'rgba(20,13,9,0.78)';
      g.fill();
      g.font = `700 ${8.6 * s}px ${FONT}`;
      g.textBaseline = 'middle';
      g.fillStyle = '#f3dcc0';
      g.fillText('캡슐 조작기', 7 * s, 9 * s);
      g.font = `600 ${7.4 * s}px ${FONT}`;
      g.fillStyle = deg > this.maxSlope ? '#ffa43a' : '#cfe8c0';
      g.fillText(`바닥 기울기 ${this.grounded ? deg + '°' : '—'}  /  한계 ${this.maxSlope}°`, 7 * s, 20 * s);
      const bar = (y: number, k: number, name: string, col: string): void => {
        g.fillStyle = '#d9c7b0';
        g.fillText(name, 7 * s, y);
        rr(g, 44 * s, y - 3 * s, 60 * s, 6 * s, 3 * s);
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fill();
        if (k > 0) {
          rr(g, 44 * s, y - 3 * s, 60 * s * k, 6 * s, 3 * s);
          g.fillStyle = col;
          g.fill();
        }
      };
      bar(32 * s, coy, '코요테', '#ffd25a');
      bar(43 * s, buf, '점프 버퍼', '#8fe0ff');
      g.fillStyle = '#bfae98';
      g.fillText(`계단 높이 ${this.stepH.toFixed(2)} m`, 7 * s, 54 * s);
    });
    // 아래: 화살표 색 · 지금 시연
    const manual = performance.now() - this.input.lastKey < 4000;
    const what = manual ? '직접 조작 중 — 손 떼면 4초 뒤 자동' : '자동 시연: ' + (ROUTE_A[this.wp]!.label ?? '');
    const bw = Math.min(w - 12 * u, 268 * u);
    const bh = 16 * u;
    const bp = hp.get('bottom');
    bp.place(6 * u, h - bh - 5 * u, bw, bh);
    bp.paint(bw, bh, what + this.big, (g, _W, Hh) => {
      const s = Hh / 16;
      let x = 0;
      for (const [k, name] of [
        ['ground', '바닥'],
        ['steep', '경사'],
        ['wall', '벽'],
      ] as const) {
        g.fillStyle = '#' + KIND_COL[k].toString(16).padStart(6, '0');
        g.beginPath();
        g.arc(x + 5 * s, Hh / 2, 3.2 * s, 0, TAU);
        g.fill();
        g.font = `700 ${8 * s}px ${FONT}`;
        g.textBaseline = 'middle';
        g.fillText(name, x + 10 * s, Hh / 2 + 0.5 * s);
        x += g.measureText(name).width + 17 * s;
      }
      g.fillStyle = 'rgba(255,240,220,0.92)';
      g.font = `600 ${8 * s}px ${FONT}`;
      g.fillText(what, x + 2 * s, Hh / 2 + 0.5 * s);
    });
    if (this.big) {
      const hint = hp.get('hint');
      const tw = 220 * u;
      const th = 18 * u;
      hint.place(w - tw - 8 * u, 8 * u, tw, th);
      hint.paint(tw, th, 'hint', (g, W, Hh) => pill(g, '방향키 · WASD 이동  ·  스페이스 점프', W, 1, Hh * 0.55, 'rgba(20,12,8,0.75)', '#ffe2b8', 'r'));
    }
  }
  protected onDispose(): void {
    this.input.dispose();
  }
}
const _tv = new THREE.Vector3();

/* ═════════════ i481 카메라가 벽을 뚫지 않게 ═════════════ */

const ROUTE_B: [number, number][] = [
  [-6.1, -4.1],
  [6.1, -0.6],
  [-6.1, 4.1],
  [5.9, 3.2],
  [6.1, -4.2],
];

class CamDemo extends Stage {
  private col: Col | null = null;
  private rig!: Rig;
  private pos = new THREE.Vector3(-6.1, 0, -4.1);
  private heading = Math.PI / 2;
  private camYaw = Math.PI / 2;
  private wp = 1;
  private pause = 0;
  private moving = 0;
  private dist = 4.6;
  private back = 2.2;
  private compare = true;
  private enabled = true;
  private curD = 4.6;
  private hitD = 4.6;
  private readonly sr = 0.28;
  private camOff = new THREE.PerspectiveCamera(55, 1, 0.1, 80);
  private camOn = new THREE.PerspectiveCamera(55, 1, 0.1, 80);
  private pivot = new THREE.Vector3();
  private desired = new THREE.Vector3();
  private offHidden = false;
  private mapAt = -1;
  private time = 0;
  private sp = v3();
  constructor() {
    super();
    this.camera.position.set(0, 16, 12);
    this.camera.lookAt(0, 0, 0);
    this.buildArena(
      (b) => {
        slab(b, -7.6, -5.6, 7.6, 5.6);
        wall(b, -7.6, -5.6, 7.6, -5, 2.8);
        wall(b, -7.6, 5, 7.6, 5.6, 2.8);
        wall(b, -7.6, -5, -7, 5, 2.8);
        wall(b, 7, -5, 7.6, 5, 2.8);
        wall(b, -1.5, 0.55, 1.5, 1.0, 2.4);
        pillar(b, -3, -1.5, 0.9, 2.7);
        pillar(b, 2.5, 1.9, 0.9, 2.7);
        pillar(b, 3.6, -3.4, 0.9, 2.7);
        pillar(b, -3.6, 2.6, 0.8, 2.7);
        b.box(4.6, 0, 3.7, 5.5, 0.8, 4.6, WOOD, { topColor: 0xa36d40 });
        b.box(-6.6, 0, -1.2, -5.8, 0.7, -0.4, WOOD, { topColor: 0xa36d40 });
        return () => b.tiles(-7, -5, 7, 5, STONE, () => false, 4);
      },
      (b) => {
        this.col = new Col(b.tris);
        this.footRects = b.foot.filter((f) => f.h > 0.5);
      },
    );
    this.phases.push(() => {
      this.addTorch(-3.5, 1.9, -4.88);
      this.addTorch(3.5, 1.9, -4.88);
      this.addTorch(-6.88, 1.9, 1.5);
      this.rig = makeKnight('knight', this.ink);
      this.root.add(this.rig.root);
      this.rig.root.position.copy(this.pos);
    });
    this.controls = [
      { type: 'toggle', label: '켬 · 끔 나란히 비교', value: true, on: (v) => (this.compare = v) },
      { type: 'toggle', label: '카메라 벽 충돌 (한 화면일 때)', value: true, on: (v) => (this.enabled = v) },
      { type: 'range', label: '카메라 거리', min: 2.5, max: 7, step: 0.1, value: 4.6, on: (v) => (this.dist = v) },
      { type: 'range', label: '되돌아가는 빠르기', min: 0.5, max: 8, step: 0.1, value: 2.2, on: (v) => (this.back = v) },
    ];
  }
  /** 주인공 → 바라는 카메라 자리를 구로 쓸어 처음 닿는 거리 */
  private sweep(from: THREE.Vector3, to: THREE.Vector3): number {
    const col = this.col!;
    const len = from.distanceTo(to);
    const N = 22;
    let free = 0;
    for (let i = 1; i <= N; i++) {
      const k = i / N;
      this.sp[0] = lerp(from.x, to.x, k);
      this.sp[1] = lerp(from.y, to.y, k);
      this.sp[2] = lerp(from.z, to.z, k);
      if (col.sphereHit(this.sp, this.sr)) {
        let lo = free;
        let hi = k;
        for (let j = 0; j < 6; j++) {
          const m = (lo + hi) / 2;
          this.sp[0] = lerp(from.x, to.x, m);
          this.sp[1] = lerp(from.y, to.y, m);
          this.sp[2] = lerp(from.z, to.z, m);
          if (col.sphereHit(this.sp, this.sr)) hi = m;
          else lo = m;
        }
        return lo * len;
      }
      free = k;
    }
    return len;
  }
  protected tick(t: number, dt: number): void {
    if (!this.col) return;
    this.time = t;
    // 주인공: 벽 가까이에서 출발해 방을 가로지르는 길 (돌아서면 카메라가 벽 쪽으로 감)
    const [tx, tz] = ROUTE_B[this.wp]!;
    const dx = tx - this.pos.x;
    const dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (this.pause > 0) {
      this.pause -= dt;
      this.moving = damp(this.moving, 0, 10, dt);
    } else if (d < 0.2) {
      this.wp = (this.wp + 1) % ROUTE_B.length;
      this.pause = 0.5;
    } else {
      const want = Math.atan2(dx, dz);
      this.heading += angWrap(want - this.heading) * (1 - Math.exp(-7 * dt));
      this.moving = damp(this.moving, 1, 6, dt);
      const sp = 2.5 * this.moving * clamp(1 - Math.abs(angWrap(want - this.heading)) / 1.6, 0.15, 1);
      this.pos.x += Math.sin(this.heading) * sp * dt;
      this.pos.z += Math.cos(this.heading) * sp * dt;
    }
    this.rig.root.position.copy(this.pos);
    this.rig.yaw.rotation.y = this.heading;
    animRig(this.rig, dt, 2.5 * this.moving, false, t);
    // 카메라: 등 뒤를 늦게 따라감
    this.camYaw += angWrap(this.heading - this.camYaw) * (1 - Math.exp(-1.8 * dt));
    this.pivot.set(this.pos.x, 1.35, this.pos.z);
    this.desired.set(this.pos.x - Math.sin(this.camYaw) * this.dist, 2.45, this.pos.z - Math.cos(this.camYaw) * this.dist);
    // 바라는 자리까지 구 쓸기
    this.hitD = this.sweep(this.pivot, this.desired);
    const full = this.pivot.distanceTo(this.desired);
    this.offHidden = this.hitD < full - 0.05;
    const tgt = Math.max(0.55, this.hitD);
    this.curD = tgt < this.curD ? damp(this.curD, tgt, 30, dt) : damp(this.curD, tgt, this.back, dt);
    this.curD = Math.min(this.curD, full);
    const look = new THREE.Vector3(this.pos.x + Math.sin(this.camYaw) * 2.2, 0.9, this.pos.z + Math.cos(this.camYaw) * 2.2);
    this.camOff.position.copy(this.desired);
    this.camOff.lookAt(look);
    this.camOn.position.copy(this.pivot).lerp(this.desired, this.curD / full);
    this.camOn.lookAt(look);
  }
  protected draw(r: R, w: number, h: number): void {
    r.autoClear = false;
    r.setScissorTest(true);
    r.setClearColor(this.bg, 1);
    const views: [THREE.PerspectiveCamera, number, number][] = this.compare
      ? [
          [this.camOff, 0, Math.floor(w / 2)],
          [this.camOn, Math.floor(w / 2), w - Math.floor(w / 2)],
        ]
      : [[this.enabled ? this.camOn : this.camOff, 0, w]];
    const au = r.shadowMap.autoUpdate;
    let first = true;
    for (const [cam, x, vw] of views) {
      r.shadowMap.autoUpdate = first;
      first = false;
      r.setViewport(x, 0, vw, h);
      r.setScissor(x, 0, vw, h);
      if (Math.abs(cam.aspect - vw / h) > 1e-3) {
        cam.aspect = vw / h;
        cam.updateProjectionMatrix();
      }
      r.clear();
      r.render(this.scene, cam);
    }
    r.shadowMap.autoUpdate = au;
    r.setScissorTest(false);
    r.setViewport(0, 0, w, h);
  }
  protected overlay(w: number, h: number): void {
    const u = this.hud.u;
    const hp = this.hud;
    const half = this.compare ? Math.floor(w / 2) : w;
    const lab = (id: string, x: number, on: boolean): void => {
      const p = hp.get(id);
      const pw = Math.min(half - 10 * u, 170 * u);
      const ph = 34 * u;
      p.place(x + 5 * u, 5 * u, pw, ph);
      const hidden = !on && this.offHidden;
      const pulled = on && this.curD < this.pivot.distanceTo(this.desired) - 0.1;
      p.paint(pw, ph, `${on}|${hidden}|${pulled}`, (g) => {
        pill(g, on ? '충돌 켬' : '충돌 끔', 0, 0, 10 * u, on ? 'rgba(40,120,70,0.92)' : 'rgba(150,50,40,0.92)', '#fff');
        const sub = on ? (pulled ? '구로 쓸어 벽 앞까지 당겨 옴' : '부딪힌 것 없음 — 제자리') : hidden ? '벽 뒤로 감 — 주인공이 가려짐!' : '그냥 정해진 거리';
        pill(g, sub, 0, 17 * u, 8.2 * u, 'rgba(18,11,8,0.8)', on ? '#c8f5cf' : hidden ? '#ffb3a6' : '#e8dccb');
      });
    };
    if (this.compare) {
      lab('l0', 0, false);
      lab('l1', half, true);
      const dv = hp.get('div');
      dv.place(half - 1.5 * u, 0, 3 * u, h);
      dv.paint(4, 4, 'div', (g) => {
        g.fillStyle = '#120c08';
        g.fillRect(0, 0, 4, 4);
      });
    } else lab('l0', 0, this.enabled);
    // 작은 지도 (위에서 본 방)
    const mh = Math.min(h * 0.4, (this.compare ? half : w) * 0.42 / 1.36);
    const mw = mh * 1.36;
    const mp = hp.get('map');
    mp.place(w - mw - 6 * u, h - mh - 6 * u, mw, mh);
    const bucket = Math.floor(this.time * 15);
    if (bucket !== this.mapAt) {
      this.mapAt = bucket;
      mp.paint(mw, mh, 'm' + bucket, (g, W, Hh) => this.drawMap(g, W, Hh));
    }
  }
  private drawMap(g: G, W: number, Hh: number): void {
    const s = W / 15.6;
    const X = (x: number): number => (x + 7.8) * s;
    const Z = (z: number): number => (z + 5.7) * s;
    rr(g, 0, 0, W, Hh, 6 * (W / 120));
    g.fillStyle = 'rgba(16,10,7,0.86)';
    g.fill();
    g.fillStyle = '#8a735c';
    g.fillRect(X(-7.6), Z(-5.6), 15.2 * s, 11.2 * s);
    g.fillStyle = '#3d2f25';
    g.fillRect(X(-7), Z(-5), 14 * s, 10 * s);
    g.fillStyle = '#b89c7c';
    for (const r of this.footRects) g.fillRect(X(r.x0), Z(r.z0), (r.x1 - r.x0) * s, (r.z1 - r.z0) * s);
    const px = X(this.pos.x);
    const pz = Z(this.pos.z);
    // 쓸기 선: 닿기 전 초록, 그 뒤 빨강
    const full = this.pivot.distanceTo(this.desired);
    const k = clamp(this.hitD / full, 0, 1);
    const dx = X(this.desired.x);
    const dz = Z(this.desired.z);
    const hx = lerp(px, dx, k);
    const hz = lerp(pz, dz, k);
    g.lineWidth = 2 * (W / 120);
    g.strokeStyle = '#6ee07a';
    g.beginPath();
    g.moveTo(px, pz);
    g.lineTo(hx, hz);
    g.stroke();
    if (k < 0.999) {
      g.setLineDash([3 * (W / 120), 3 * (W / 120)]);
      g.strokeStyle = '#ff6a5a';
      g.beginPath();
      g.moveTo(hx, hz);
      g.lineTo(dx, dz);
      g.stroke();
      g.setLineDash([]);
      g.strokeStyle = 'rgba(255,210,90,0.9)';
      g.beginPath();
      g.arc(hx, hz, this.sr * s, 0, TAU);
      g.stroke();
    }
    // 끈 카메라 (빨강 ×), 켠 카메라 (초록 점)
    const cr = 3.2 * (W / 120);
    g.strokeStyle = '#ff6a5a';
    g.lineWidth = 2 * (W / 120);
    g.beginPath();
    g.moveTo(dx - cr, dz - cr);
    g.lineTo(dx + cr, dz + cr);
    g.moveTo(dx + cr, dz - cr);
    g.lineTo(dx - cr, dz + cr);
    g.stroke();
    const ox = X(this.camOn.position.x);
    const oz = Z(this.camOn.position.z);
    g.fillStyle = '#6ee07a';
    g.beginPath();
    g.arc(ox, oz, cr * 0.9, 0, TAU);
    g.fill();
    // 주인공 + 바라보는 쪽
    g.fillStyle = '#5aa2ff';
    g.beginPath();
    g.arc(px, pz, 3.6 * (W / 120), 0, TAU);
    g.fill();
    g.strokeStyle = '#fff';
    g.lineWidth = 1.2 * (W / 120);
    g.stroke();
    g.beginPath();
    g.moveTo(px, pz);
    g.lineTo(px + Math.sin(this.heading) * 7 * (W / 120), pz + Math.cos(this.heading) * 7 * (W / 120));
    g.stroke();
    g.font = `700 ${8 * (W / 120)}px ${FONT}`;
    g.fillStyle = '#f3dcc0';
    g.textBaseline = 'top';
    g.fillText('위에서 본 지도', 4 * (W / 120), 3 * (W / 120));
  }
  private footRects: Rect[] = [];
}

/* ═════════════ i482 내비메시 — 삼각형 그물 · A* · 깔때기 ═════════════ */

type P2 = { x: number; z: number };
class NavMesh {
  v: P2[] = [];
  tri: [number, number, number][] = [];
  /** 이웃 삼각형 (변 0: a-b, 1: b-c, 2: c-a), 없으면 -1 */
  nb: [number, number, number][] = [];
  cen: P2[] = [];
  area: number[] = [];
  constructor(outer: Rect, holes: Rect[], step = 2.2) {
    const cont: THREE.Vector2[] = [];
    const edge = (x0: number, z0: number, x1: number, z1: number): void => {
      const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / step));
      for (let i = 0; i < n; i++) cont.push(new THREE.Vector2(lerp(x0, x1, i / n), lerp(z0, z1, i / n)));
    };
    edge(outer.x0, outer.z0, outer.x1, outer.z0);
    edge(outer.x1, outer.z0, outer.x1, outer.z1);
    edge(outer.x1, outer.z1, outer.x0, outer.z1);
    edge(outer.x0, outer.z1, outer.x0, outer.z0);
    const hs = holes.map((h) => [new THREE.Vector2(h.x0, h.z0), new THREE.Vector2(h.x0, h.z1), new THREE.Vector2(h.x1, h.z1), new THREE.Vector2(h.x1, h.z0)]);
    const faces = THREE.ShapeUtils.triangulateShape(cont, hs);
    for (const p of cont) this.v.push({ x: p.x, z: p.y });
    for (const h of hs) for (const p of h) this.v.push({ x: p.x, z: p.y });
    for (const f of faces) {
      const [a, b, c] = f as [number, number, number];
      this.tri.push(this.ccw(a, b, c) ? [a, b, c] : [a, c, b]);
    }
    this.flips();
    this.link();
  }
  private cross(a: P2, b: P2, c: P2): number {
    return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  }
  private ccw(a: number, b: number, c: number): boolean {
    return this.cross(this.v[a]!, this.v[b]!, this.v[c]!) > 0;
  }
  /** 가는 삼각형을 줄이는 변 뒤집기 (들로네 쪽으로) — 바깥 · 구멍 변은 그대로 */
  private flips(): void {
    const key = (u: number, v: number): number => u * 65536 + v;
    const map = new Map<number, [number, number]>();
    const add = (ti: number): void => {
      const t = this.tri[ti]!;
      for (let e = 0; e < 3; e++) map.set(key(t[e]!, t[(e + 1) % 3]!), [ti, e]);
    };
    const del = (ti: number): void => {
      const t = this.tri[ti]!;
      for (let e = 0; e < 3; e++) map.delete(key(t[e]!, t[(e + 1) % 3]!));
    };
    for (let ti = 0; ti < this.tri.length; ti++) add(ti);
    for (let pass = 0; pass < 40; pass++) {
      let changed = false;
      for (let ti = 0; ti < this.tri.length; ti++) {
        const t = this.tri[ti]!;
        for (let e = 0; e < 3; e++) {
          const a = t[e]!;
          const b = t[(e + 1) % 3]!;
          const c = t[(e + 2) % 3]!;
          const o = map.get(key(b, a));
          if (!o) continue;
          const u = this.tri[o[0]]!;
          const d = u[(o[1] + 2) % 3]!;
          const A = this.v[a]!;
          const B = this.v[b]!;
          const C = this.v[c]!;
          const D = this.v[d]!;
          // D 가 abc 의 외접원 안이면 뒤집기 (네모가 볼록할 때만)
          const adx = A.x - D.x;
          const adz = A.z - D.z;
          const bdx = B.x - D.x;
          const bdz = B.z - D.z;
          const cdx = C.x - D.x;
          const cdz = C.z - D.z;
          const det = (adx * adx + adz * adz) * (bdx * cdz - cdx * bdz) - (bdx * bdx + bdz * bdz) * (adx * cdz - cdx * adz) + (cdx * cdx + cdz * cdz) * (adx * bdz - bdx * adz);
          if (det <= 1e-6) continue;
          if (this.cross(C, D, B) <= 1e-6 || this.cross(D, C, A) <= 1e-6) continue;
          del(ti);
          del(o[0]);
          this.tri[ti] = [c, a, d];
          this.tri[o[0]] = [d, b, c];
          add(ti);
          add(o[0]);
          changed = true;
          break;
        }
      }
      if (!changed) break;
    }
  }
  private link(): void {
    const map = new Map<string, number>();
    this.tri.forEach((t, ti) => {
      for (let e = 0; e < 3; e++) map.set(t[e] + ',' + t[(e + 1) % 3], ti);
    });
    this.nb = this.tri.map((t) => [0, 1, 2].map((e) => map.get(t[(e + 1) % 3] + ',' + t[e]) ?? -1) as [number, number, number]);
    this.cen = this.tri.map((t) => ({ x: (this.v[t[0]]!.x + this.v[t[1]]!.x + this.v[t[2]]!.x) / 3, z: (this.v[t[0]]!.z + this.v[t[1]]!.z + this.v[t[2]]!.z) / 3 }));
    this.area = this.tri.map((t) => this.cross(this.v[t[0]]!, this.v[t[1]]!, this.v[t[2]]!) / 2);
  }
  find(x: number, z: number): number {
    const p = { x, z };
    for (let i = 0; i < this.tri.length; i++) {
      const t = this.tri[i]!;
      const a = this.v[t[0]]!;
      const b = this.v[t[1]]!;
      const c = this.v[t[2]]!;
      if (this.cross(a, b, p) >= -1e-6 && this.cross(b, c, p) >= -1e-6 && this.cross(c, a, p) >= -1e-6) return i;
    }
    return -1;
  }
  /** 가장 가까운 삼각형 가운데 (그물 밖을 눌렀을 때) */
  nearest(x: number, z: number): number {
    let best = 0;
    let bd = Infinity;
    this.cen.forEach((c, i) => {
      const d = (c.x - x) ** 2 + (c.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }
  randomPoint(rnd: () => number): P2 {
    const tot = this.area.reduce((s, a) => s + a, 0);
    let r = rnd() * tot;
    let i = 0;
    for (; i < this.area.length - 1; i++) {
      r -= this.area[i]!;
      if (r <= 0) break;
    }
    const t = this.tri[i]!;
    let u = rnd();
    let w = rnd();
    if (u + w > 1) {
      u = 1 - u;
      w = 1 - w;
    }
    const a = this.v[t[0]]!;
    const b = this.v[t[1]]!;
    const c = this.v[t[2]]!;
    return { x: a.x + (b.x - a.x) * u + (c.x - a.x) * w, z: a.z + (b.z - a.z) * u + (c.z - a.z) * w };
  }
  /** A* (삼각형 가운데끼리) → 통로 삼각형 목록 · 살펴본 삼각형 */
  astar(s: number, g: number, goal: P2): { path: number[]; seen: Set<number> } {
    const N = this.tri.length;
    const gs = new Float64Array(N).fill(Infinity);
    const from = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const open: number[] = [s];
    const fs = new Float64Array(N).fill(Infinity);
    const seen = new Set<number>([s]);
    gs[s] = 0;
    fs[s] = Math.hypot(this.cen[s]!.x - goal.x, this.cen[s]!.z - goal.z);
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (fs[open[i]!]! < fs[open[bi]!]!) bi = i;
      const cur = open.splice(bi, 1)[0]!;
      if (cur === g) break;
      closed[cur] = 1;
      for (const n of this.nb[cur]!) {
        if (n < 0 || closed[n]) continue;
        const c0 = this.cen[cur]!;
        const c1 = this.cen[n]!;
        const ng = gs[cur]! + Math.hypot(c1.x - c0.x, c1.z - c0.z);
        if (ng < gs[n]!) {
          gs[n] = ng;
          from[n] = cur;
          fs[n] = ng + Math.hypot(c1.x - goal.x, c1.z - goal.z);
          if (!open.includes(n)) open.push(n);
          seen.add(n);
        }
      }
    }
    const path: number[] = [];
    if (from[g]! < 0 && g !== s) return { path, seen };
    for (let c = g; c >= 0; c = from[c]!) {
      path.unshift(c);
      if (c === s) break;
    }
    return { path, seen };
  }
  /** 통로 → 문(왼 · 오른 점) 목록 */
  portals(path: number[], start: P2, goal: P2): [P2, P2][] {
    const out: [P2, P2][] = [[start, start]];
    for (let i = 0; i < path.length - 1; i++) {
      const t = this.tri[path[i]!]!;
      const e = this.nb[path[i]!]!.indexOf(path[i + 1]!);
      const p = this.v[t[e]!]!;
      const q = this.v[t[(e + 1) % 3]!]!;
      const c0 = this.cen[path[i]!]!;
      const c1 = this.cen[path[i + 1]!]!;
      const dx = c1.x - c0.x;
      const dz = c1.z - c0.z;
      const cp = dx * (p.z - c0.z) - dz * (p.x - c0.x);
      const cq = dx * (q.z - c0.z) - dz * (q.x - c0.x);
      out.push(cp > cq ? [p, q] : [q, p]);
    }
    out.push([goal, goal]);
    return out;
  }
}
const tri2 = (a: P2, b: P2, c: P2): number => (c.x - a.x) * (b.z - a.z) - (b.x - a.x) * (c.z - a.z);
const same = (a: P2, b: P2): boolean => (a.x - b.x) ** 2 + (a.z - b.z) ** 2 < 1e-8;
/** 깔때기 (Simple Stupid Funnel) — 문들 사이로 줄을 팽팽히 당긴 곧은 길 */
function funnel(portals: [P2, P2][]): P2[] {
  const pts: P2[] = [];
  let apex = portals[0]![0];
  let left = portals[0]![0];
  let right = portals[0]![1];
  let ai = 0;
  let li = 0;
  let ri = 0;
  pts.push(apex);
  for (let i = 1; i < portals.length; i++) {
    const [l, r] = portals[i]!;
    if (tri2(apex, right, r) <= 0) {
      if (same(apex, right) || tri2(apex, left, r) > 0) {
        right = r;
        ri = i;
      } else {
        pts.push(left);
        apex = left;
        ai = li;
        left = right = apex;
        li = ri = ai;
        i = ai;
        continue;
      }
    }
    if (tri2(apex, left, l) >= 0) {
      if (same(apex, left) || tri2(apex, right, l) < 0) {
        left = l;
        li = i;
      } else {
        pts.push(right);
        apex = right;
        ai = ri;
        left = right = apex;
        li = ri = ai;
        i = ai;
        continue;
      }
    }
  }
  const end = portals[portals.length - 1]![0];
  if (!same(pts[pts.length - 1]!, end)) pts.push(end);
  return pts;
}

const SLIME_COL = [0xff5a6a, 0x5ab8ff, 0x7ee06a, 0xffc040, 0xc07aff, 0x4ae0c8];
interface Mon {
  s: Slime;
  x: number;
  z: number;
  yaw: number;
  goal: P2;
  path: P2[];
  at: number;
  pause: number;
  speed: number;
  life: number;
  flash: number;
  ribbon: THREE.Mesh;
  flag: THREE.Group;
}

class NavDemo extends Stage {
  private nav: NavMesh | null = null;
  private mons: Mon[] = [];
  private count = 4;
  private showTri = true;
  private showPath = true;
  private fill!: THREE.Mesh;
  private wire!: THREE.LineSegments;
  private portalLines!: THREE.LineSegments;
  private seenN = 0;
  private corrN = 0;
  private bends = 0;
  private rndS = 7;
  private input = new BigInput(false);
  private sph = new THREE.SphereGeometry(1, 22, 16);
  private replanAt = 0;
  private raycaster = new THREE.Raycaster();
  constructor() {
    super();
    this.camera.position.set(5.0, 17.2, 13.6);
    this.camera.lookAt(-0.1, -0.5, 0.2);
    this.camera.fov = 37;
    const holes: Rect[] = [];
    const ex = (x0: number, z0: number, x1: number, z1: number): void => {
      holes.push({ x0: x0 - 0.35, z0: z0 - 0.35, x1: x1 + 0.35, z1: z1 + 0.35 });
    };
    this.buildArena(
      (b) => {
        slab(b, -7.5, -5.5, 2.6, 5.5);
        slab(b, 6.2, -5.5, 7.5, 5.5);
        slab(b, 2.6, -5.5, 6.2, -4.6);
        slab(b, 2.6, 0.6, 6.2, 5.5);
        pitFloor(b, 2.6, -4.6, 6.2, 0.6);
        bridge(b, 2.5, 6.3, -2.75, -1.45);
        wall(b, -8.1, -6.1, 8.1, -5.5, 2.2);
        wall(b, -8.1, -5.5, -7.5, 6.0, 2.2);
        wall(b, -7.5, 5.5, 8.1, 6.0, 0.35);
        wall(b, 7.5, -5.5, 8.1, 5.5, 0.35);
        pillar(b, -4.2, -2.6, 0.9, 2.0);
        pillar(b, -4.0, 2.4, 0.9, 2.0);
        pillar(b, 0.6, -0.8, 1.0, 2.0);
        pillar(b, 4.6, 3.4, 0.9, 2.0);
        wall(b, -1.6, -4.6, -1.2, -1.2, 1.4);
        wall(b, -2.0, 2.6, 2.4, 3.0, 0.9);
        b.box(-6.5, 0, 3.5, -5.5, 0.9, 4.5, WOOD, { topColor: 0xa36d40 });
        b.box(-0.25, 0, -4.65, 0.65, 0.8, -3.75, WOOD, { topColor: 0xa36d40 });
        ex(-4.65, -3.05, -3.75, -2.15);
        ex(-4.45, 1.95, -3.55, 2.85);
        ex(0.1, -1.3, 1.1, -0.3);
        ex(4.15, 2.95, 5.05, 3.85);
        ex(-1.6, -4.6, -1.2, -1.2);
        ex(-2.0, 2.6, 2.4, 3.0);
        ex(-6.5, 3.5, -5.5, 4.5);
        ex(-0.25, -4.65, 0.65, -3.75);
        ex(2.6, -4.6, 6.2, -2.75);
        ex(2.6, -1.45, 6.2, 0.6);
        return () => b.tiles(-7.5, -5.5, 7.5, 5.5, STONE, (x, z) => x > 2.6 && x < 6.2 && z > -4.6 && z < 0.6, 9);
      },
      () => undefined,
    );
    this.phases.push(() => {
      this.nav = new NavMesh({ x0: -7.15, z0: -5.15, x1: 7.15, z1: 5.15 }, holes);
      this.buildNavVis();
    });
    this.phases.push(() => {
      this.addTorch(-3.0, 1.6, -5.38);
      this.addTorch(3.6, 1.6, -5.38);
      for (let i = 0; i < 6; i++) this.addMon(i);
    });
    this.controls = [
      { type: 'toggle', label: '삼각형 그물 보기', value: true, on: (v) => (this.showTri = v) },
      { type: 'toggle', label: '통로 · 곧은 길 보기', value: true, on: (v) => (this.showPath = v) },
      { type: 'range', label: '괴물 수', min: 1, max: 6, step: 1, value: 4, on: (v) => (this.count = v) },
      { type: 'button', label: '새 목표 (빨간 슬라임)', on: () => this.newGoal(this.mons[0], this.rpt()) },
    ];
  }
  private rnd(): number {
    this.rndS = (this.rndS * 16807) % 2147483647;
    return this.rndS / 2147483647;
  }
  private rpt(): P2 {
    return this.nav!.randomPoint(() => this.rnd());
  }
  private buildNavVis(): void {
    const nav = this.nav!;
    const pos: number[] = [];
    const col: number[] = [];
    for (const t of nav.tri)
      for (const i of t) {
        pos.push(nav.v[i]!.x, 0.025, nav.v[i]!.z);
        col.push(0.2, 0.75, 0.85);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.fill = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.38, depthWrite: false, toneMapped: false }));
    this.fill.renderOrder = 2;
    this.root.add(this.fill);
    const lp: number[] = [];
    nav.tri.forEach((t, ti) => {
      for (let e = 0; e < 3; e++) {
        const n = nav.nb[ti]![e]!;
        if (n >= 0 && n < ti) continue;
        const a = nav.v[t[e]!]!;
        const b = nav.v[t[(e + 1) % 3]!]!;
        lp.push(a.x, 0.035, a.z, b.x, 0.035, b.z);
      }
    });
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    this.wire = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x7fe8ff, transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false }));
    this.wire.renderOrder = 3;
    this.root.add(this.wire);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(600 * 3), 3));
    pg.setDrawRange(0, 0);
    this.portalLines = new THREE.LineSegments(pg, new THREE.LineBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }));
    this.portalLines.renderOrder = 4;
    this.root.add(this.portalLines);
  }
  private addMon(i: number): void {
    const c = SLIME_COL[i]!;
    const s = makeSlime(c, this.ink, this.sph);
    s.root.scale.setScalar(i === 0 ? 1.45 : 1.25);
    this.root.add(s.root);
    const ribbon = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: i === 0 ? 0.95 : 0.7, depthWrite: false, toneMapped: false }));
    ribbon.renderOrder = 5;
    this.root.add(ribbon);
    const flag = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 6), clay(0x4a3020));
    pole.position.y = 0.45;
    const cloth = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.88, 0), new THREE.Vector3(0.42, 0.75, 0), new THREE.Vector3(0, 0.6, 0)]), new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide, roughness: 0.6 }));
    cloth.geometry.computeVertexNormals();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.32, 28), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    pole.castShadow = true;
    flag.add(pole, cloth, ring);
    this.root.add(flag);
    const st = this.rpt();
    const m: Mon = { s, x: st.x, z: st.z, yaw: 0, goal: st, path: [], at: 0, pause: 0.3 + i * 0.35, speed: 1.7 + this.rnd() * 0.7, life: 0, flash: 0, ribbon, flag };
    this.mons.push(m);
  }
  /** 목표를 정하고 다시 길 찾기 */
  private newGoal(m: Mon | undefined, p: P2): void {
    if (!m || !this.nav) return;
    const nav = this.nav;
    let gt = nav.find(p.x, p.z);
    if (gt < 0) {
      gt = nav.nearest(p.x, p.z);
      p = { ...nav.cen[gt]! };
    }
    let stt = nav.find(m.x, m.z);
    if (stt < 0) stt = nav.nearest(m.x, m.z);
    const { path, seen } = nav.astar(stt, gt, p);
    if (!path.length) return;
    const ports = nav.portals(path, { x: m.x, z: m.z }, p);
    m.path = funnel(ports);
    m.goal = p;
    m.at = 1;
    m.life = 0;
    m.flash = 1;
    this.ribbonOf(m);
    if (m === this.mons[0]) {
      this.seenN = seen.size;
      this.corrN = path.length;
      this.bends = Math.max(0, m.path.length - 2);
      // 삼각형 색: 통로 노랑 · 살펴본 것 옅은 파랑 · 나머지 청록
      const ca = this.fill.geometry.getAttribute('color') as THREE.BufferAttribute;
      const on = new Set(path);
      for (let i = 0; i < nav.tri.length; i++) {
        const [r, g, b] = on.has(i) ? [1, 0.82, 0.25] : seen.has(i) ? [0.45, 0.6, 1] : [0.2, 0.75, 0.85];
        for (let k = 0; k < 3; k++) ca.setXYZ(i * 3 + k, r, g, b);
      }
      ca.needsUpdate = true;
      const pa = this.portalLines.geometry.getAttribute('position') as THREE.BufferAttribute;
      let n = 0;
      for (const [l, r] of ports.slice(1, -1)) {
        if (n >= 598) break;
        pa.setXYZ(n++, l.x, 0.05, l.z);
        pa.setXYZ(n++, r.x, 0.05, r.z);
      }
      pa.needsUpdate = true;
      this.portalLines.geometry.setDrawRange(0, n);
    }
  }
  /** 길 → 납작한 띠 (모서리마다 둥근 점) */
  private ribbonOf(m: Mon): void {
    const main = m === this.mons[0];
    const wd = main ? 0.085 : 0.05;
    const pos: number[] = [];
    const y = main ? 0.07 : 0.06;
    const pts = m.path;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const l = Math.hypot(dx, dz) || 1;
      const nx = (-dz / l) * wd;
      const nz = (dx / l) * wd;
      pos.push(a.x + nx, y, a.z + nz, b.x + nx, y, b.z + nz, b.x - nx, y, b.z - nz);
      pos.push(a.x + nx, y, a.z + nz, b.x - nx, y, b.z - nz, a.x - nx, y, a.z - nz);
    }
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      const r = i === 0 || i === pts.length - 1 ? wd * 1.2 : wd * 2.1;
      for (let k = 0; k < 12; k++) {
        const a0 = (k / 12) * TAU;
        const a1 = ((k + 1) / 12) * TAU;
        pos.push(p.x, y + 0.002, p.z, p.x + Math.cos(a1) * r, y + 0.002, p.z + Math.sin(a1) * r, p.x + Math.cos(a0) * r, y + 0.002, p.z + Math.sin(a0) * r);
      }
    }
    m.ribbon.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    m.ribbon.geometry = g;
  }
  protected tick(t: number, dt: number): void {
    if (!this.nav) return;
    // 크게 보기: 바닥 누르면 빨간 슬라임 목표
    if (this.big) this.input.attach(this.w, this.h);
    for (const c of this.input.clicks.splice(0)) {
      this.raycaster.setFromCamera(new THREE.Vector2(c.x, c.y), this.camera);
      const hit = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) {
        this.newGoal(this.mons[0], { x: hit.x, z: hit.z });
        this.replanAt = t + 6;
      }
    }
    // 빨간 슬라임은 3.5초마다 길 가는 도중에도 목표가 바뀜 → 다시 찾기
    if (t > this.replanAt) {
      this.replanAt = t + 3.6;
      this.newGoal(this.mons[0], this.rpt());
    }
    this.fill.visible = this.showTri;
    this.wire.visible = this.showTri;
    this.portalLines.visible = this.showPath;
    this.mons.forEach((m, i) => {
      const on = i < this.count;
      m.s.root.visible = on;
      m.ribbon.visible = on && this.showPath;
      m.flag.visible = on;
      if (!on) return;
      m.life += dt;
      m.flash = Math.max(0, m.flash - dt * 1.8);
      let sp = 0;
      if (m.pause > 0) {
        m.pause -= dt;
        if (m.pause <= 0 && i !== 0) this.newGoal(m, this.rpt());
        else if (m.pause <= 0 && !m.path.length) this.newGoal(m, this.rpt());
      } else if (m.path.length && m.at < m.path.length) {
        const p = m.path[m.at]!;
        const dx = p.x - m.x;
        const dz = p.z - m.z;
        const d = Math.hypot(dx, dz);
        const step = m.speed * dt;
        if (d <= step) {
          m.x = p.x;
          m.z = p.z;
          m.at++;
          if (m.at >= m.path.length) m.pause = 0.7 + this.rnd() * 0.6;
        } else {
          m.x += (dx / d) * step;
          m.z += (dz / d) * step;
          m.yaw += angWrap(Math.atan2(dx, dz) - m.yaw) * (1 - Math.exp(-12 * dt));
        }
        sp = m.speed;
      }
      // 통통 뛰기
      m.s.phase += dt * (sp > 0 ? 9 : 3);
      const hop = sp > 0 ? Math.abs(Math.sin(m.s.phase)) : 0;
      const sq = sp > 0 ? 1 - Math.abs(Math.cos(m.s.phase)) * 0.18 : 1 + Math.sin(m.s.phase) * 0.04;
      m.s.root.position.set(m.x, hop * 0.18, m.z);
      m.s.root.rotation.y = m.yaw;
      m.s.body.scale.set(0.36 / Math.sqrt(sq), 0.29 * sq, 0.36 / Math.sqrt(sq));
      m.flag.position.set(m.goal.x, 0, m.goal.z);
      const fl = 1 + m.flash * 0.6;
      m.flag.scale.set(fl, 1 + Math.sin(t * 5 + i) * 0.03 + m.flash * 0.4, fl);
      (m.ribbon.material as THREE.MeshBasicMaterial).opacity = (i === 0 ? 0.92 : 0.65) * (0.6 + 0.4 * Math.min(1, m.life * 3));
    });
  }
  protected overlay(w: number, h: number): void {
    const u = this.hud.u;
    const p = this.hud.get('legend');
    const pw = 128 * u;
    const ph = 64 * u;
    p.place(6 * u, 6 * u, pw, ph);
    const key = `${this.seenN}|${this.corrN}|${this.bends}|${this.nav?.tri.length}`;
    p.paint(pw, ph, key, (g, W, Hh) => {
      const s = W / 128;
      rr(g, 0, 0, W, Hh, 7 * s);
      g.fillStyle = 'rgba(16,11,8,0.8)';
      g.fill();
      g.textBaseline = 'middle';
      g.font = `700 ${8.6 * s}px ${FONT}`;
      g.fillStyle = '#f3dcc0';
      g.fillText('내비메시 길찾기', 7 * s, 9 * s);
      const row = (y: number, col: string, text: string, line = false): void => {
        g.fillStyle = col;
        if (line) g.fillRect(7 * s, y - 1.3 * s, 9 * s, 2.6 * s);
        else g.fillRect(7 * s, y - 3.5 * s, 9 * s, 7 * s);
        g.fillStyle = '#e8dccb';
        g.font = `600 ${7.3 * s}px ${FONT}`;
        g.fillText(text, 20 * s, y);
      };
      row(21 * s, '#33bfd9', `걸을 수 있는 삼각형 ${this.nav?.tri.length ?? 0}개`);
      row(32 * s, '#7398ff', `A* 가 살펴본 삼각형 ${this.seenN}개`);
      row(43 * s, '#ffd140', `통로 삼각형 ${this.corrN}개 (주황 = 문)`);
      row(54 * s, '#ff5a6a', `깔때기로 편 곧은 길 · 꺾임 ${this.bends}번`, true);
    });
    if (this.big) {
      const hp = this.hud.get('hint');
      const tw = 220 * u;
      const th = 18 * u;
      hp.place(w - tw - 8 * u, h - th - 8 * u, tw, th);
      hp.paint(tw, th, 'h', (g, W, Hh) => pill(g, '바닥을 누르면 빨간 슬라임의 목표', W, 1, Hh * 0.55, 'rgba(18,11,8,0.8)', '#ffe2b8', 'r'));
    }
  }
  protected onDispose(): void {
    this.input.dispose();
    this.sph.dispose();
  }
}

/* ═════════════ i483 적 AI — 상태 기계 · 행동 나무 · 시야 원뿔 · 발소리 ═════════════ */

type AState = 'patrol' | 'suspect' | 'chase' | 'attack' | 'return';
const ST_INFO: Record<AState, { ko: string; col: string; hex: number }> = {
  patrol: { ko: '순찰', col: '#7be08a', hex: 0x7be08a },
  suspect: { ko: '의심', col: '#ffd24a', hex: 0xffd24a },
  chase: { ko: '추격', col: '#ff5a4a', hex: 0xff5a4a },
  attack: { ko: '공격', col: '#ff8a2a', hex: 0xff8a2a },
  return: { ko: '귀환', col: '#6ab4ff', hex: 0x6ab4ff },
};
const ST_ORDER: AState[] = ['patrol', 'suspect', 'chase', 'attack', 'return'];
const PATROL: P2[] = [
  { x: 0.4, z: -4.0 },
  { x: 6.0, z: -4.0 },
  { x: 6.0, z: 0.4 },
  { x: 0.4, z: 0.4 },
];
interface PStep {
  x: number;
  z: number;
  sp: number;
  wait?: number;
  run?: boolean;
  /** 적이 이 조건일 때까지 기다렸다 출발 (시연이 늘 보이게) */
  sync?: 'near' | 'patrol' | 'bottom';
}
/** 주인공 길: 몰래 → 뛰어서 소리 → 숨기 → 들판으로 나감 (들킴) */
const SCRIPT: PStep[] = [
  { x: -5.6, z: -3.6, sp: 1.6, wait: 0.6 },
  { x: -5.6, z: -0.4, sp: 1.6 },
  { x: -0.9, z: -0.5, sp: 3.6, run: true, sync: 'near' },
  { x: -3.0, z: 1.0, sp: 2.2 },
  { x: -5.3, z: 2.7, sp: 2.2, wait: 3.2 },
  { x: -3.2, z: 4.0, sp: 1.6 },
  { x: -0.6, z: 1.0, sp: 1.6, wait: 0.8, sync: 'patrol' },
  { x: 0.8, z: 0.9, sp: 1.4 },
  { x: 0.6, z: 1.0, sp: 1.0, wait: 1.4, sync: 'bottom' },
];
/** 숨을 기둥 (쫓기면 적 반대쪽 기둥 뒤로) */
const PILLARS: P2[] = [
  { x: -4.4, z: 1.8 },
  { x: 2.8, z: -2.0 },
  { x: -0.4, z: 3.2 },
];
type NodeSt = 0 | 1 | 2 | 3; // 0 안 봄 · 1 실패 · 2 성공 · 3 실행 중

class AIDemo extends Stage {
  private ready2 = false;
  private segs: Seg2[] = [];
  private foots: Rect[] = [];
  private hero!: Rig;
  private gob!: Rig;
  // 주인공
  private px = -5.6;
  private pz = -3.6;
  private pyaw = 0;
  private pstep = 0;
  private pwait = 0;
  private hidePil: P2 | null = null;
  private patrolT = 0;
  private fleeFrom = 0;
  private freeze = 0;
  private boost = 0;
  private hitFlash = 0;
  private stepT = 0;
  private pmove = 0;
  private prun = false;
  // 적
  private ex = 6.0;
  private ez = 0.4;
  private eyaw = -Math.PI / 2;
  private st: AState = 'patrol';
  private pi = 3;
  private seen = false;
  private seenT = 0;
  private memory: P2 | null = null;
  private memT = 0;
  private lookT = 0;
  private crumbs: P2[] = [];
  private atkT = 0;
  private hitDone = false;
  private emove = 0;
  private bt: NodeSt[] = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  // 시각화
  private fan!: THREE.Mesh;
  private fanEdge!: THREE.Line;
  private los!: THREE.Line;
  private rings: { m: THREE.Mesh; t: number; x: number; z: number }[] = [];
  private toasts: { text: string; col: string; t0: number; x: number; z: number }[] = [];
  private time = 0;
  private fov = 36;
  private range = 6.2;
  private noiseR = 3.6;
  private quiet = false;
  private readonly N = 40;
  private pw = 0;
  constructor() {
    super();
    this.camera.fov = 40;
    this.camera.position.set(0.8, 18.6, 10.6);
    this.camera.lookAt(0, -0.4, -0.3);
    this.buildArena(
      (b) => {
        slab(b, -7.6, -5.6, 7.6, 5.6);
        wall(b, -7.6, -5.6, 7.6, -5, 2.2);
        wall(b, -7.6, -5, -7, 5.6, 2.2);
        wall(b, -7, 5, 7.6, 5.6, 0.35);
        wall(b, 7, -5, 7.6, 5, 0.35);
        wall(b, -2.2, -5, -1.8, -1.3, 1.8);
        wall(b, 1.5, 1.6, 5.0, 2.0, 1.8);
        pillar(b, -4.4, 1.8, 0.9, 2.0);
        pillar(b, 2.8, -2.0, 0.9, 2.0);
        pillar(b, -0.4, 3.2, 0.8, 2.0);
        b.box(5.6, 0, 3.4, 6.5, 0.7, 4.3, WOOD, { topColor: 0xa36d40 });
        b.box(-6.6, 0, 4.0, -5.8, 0.6, 4.6, WOOD, { topColor: 0xa36d40 });
        return () => b.tiles(-7, -5, 7, 5, STONE, () => false, 13);
      },
      (b) => {
        this.foots = b.foot.filter((f) => f.h > 0.3);
        this.segs = rectSegs(b.foot.filter((f) => f.h > 1.2));
        this.segs.push({ ax: -7, az: -5, bx: 7, bz: -5 }, { ax: 7, az: -5, bx: 7, bz: 5 }, { ax: 7, az: 5, bx: -7, bz: 5 }, { ax: -7, az: 5, bx: -7, bz: -5 });
      },
    );
    this.phases.push(() => {
      this.addTorch(-4.6, 1.6, -4.88);
      this.addTorch(3.6, 1.6, -4.88);
      this.hero = makeKnight('knight', this.ink);
      this.gob = makeKnight('goblin', this.ink);
      this.gob.root.scale.setScalar(1.08);
      this.root.add(this.hero.root, this.gob.root);
      // 시야 부채꼴
      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((this.N + 2) * 3), 3));
      const idx: number[] = [];
      for (let i = 0; i < this.N; i++) idx.push(0, i + 2, i + 1);
      fg.setIndex(idx);
      this.fan = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: 0x7be08a, transparent: true, opacity: 0.26, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
      this.fan.renderOrder = 3;
      this.fan.frustumCulled = false;
      const eg = new THREE.BufferGeometry();
      eg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((this.N + 3) * 3), 3));
      this.fanEdge = new THREE.Line(eg, new THREE.LineBasicMaterial({ color: 0x7be08a, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
      this.fanEdge.renderOrder = 4;
      this.fanEdge.frustumCulled = false;
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
      this.los = new THREE.Line(lg, new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.18, gapSize: 0.12, transparent: true, depthWrite: false, toneMapped: false }));
      this.los.renderOrder = 5;
      this.los.frustumCulled = false;
      this.root.add(this.fan, this.fanEdge, this.los);
      const rg = new THREE.RingGeometry(0.93, 1, 48);
      for (let i = 0; i < 5; i++) {
        const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xfff0d0, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
        m.rotation.x = -Math.PI / 2;
        m.position.y = 0.06;
        m.renderOrder = 4;
        m.visible = false;
        this.root.add(m);
        this.rings.push({ m, t: 9, x: 0, z: 0 });
      }
      this.ready2 = true;
    });
    this.controls = [
      { type: 'range', label: '시야 반각 (°)', min: 15, max: 70, step: 1, value: 36, on: (v) => (this.fov = v) },
      { type: 'range', label: '시야 거리', min: 3, max: 10, step: 0.1, value: 6.2, on: (v) => (this.range = v) },
      { type: 'range', label: '발소리 반경', min: 1, max: 6, step: 0.1, value: 3.6, on: (v) => (this.noiseR = v) },
      { type: 'toggle', label: '살금살금 (뛰어도 소리 없음)', value: false, on: (v) => (this.quiet = v) },
    ];
  }
  private toast(text: string, col: string, x: number, z: number): void {
    this.toasts.push({ text, col, t0: this.time, x, z });
    if (this.toasts.length > 3) this.toasts.shift();
  }
  /** 원(반지름 r)을 벽 · 기둥 밖으로 밀어내기 */
  private pushOut(p: P2, r: number): void {
    for (const f of this.foots) {
      const cx = clamp(p.x, f.x0, f.x1);
      const cz = clamp(p.z, f.z0, f.z1);
      const dx = p.x - cx;
      const dz = p.z - cz;
      const d = Math.hypot(dx, dz);
      if (d < r && d > 1e-6) {
        p.x = cx + (dx / d) * r;
        p.z = cz + (dz / d) * r;
      }
    }
    p.x = clamp(p.x, -7 + r, 7 - r);
    p.z = clamp(p.z, -5 + r, 5 - r);
  }
  private moveEnemy(tx: number, tz: number, sp: number, dt: number): number {
    const dx = tx - this.ex;
    const dz = tz - this.ez;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return d;
    const s = Math.min(d, sp * dt);
    const p = { x: this.ex + (dx / d) * s, z: this.ez + (dz / d) * s };
    this.pushOut(p, 0.35);
    this.ex = p.x;
    this.ez = p.z;
    this.eyaw += angWrap(Math.atan2(dx, dz) - this.eyaw) * (1 - Math.exp(-10 * dt));
    this.emove = sp;
    if (this.st !== 'patrol' && this.st !== 'return') {
      const last = this.crumbs[this.crumbs.length - 1];
      if (!last || Math.hypot(last.x - this.ex, last.z - this.ez) > 0.45) this.crumbs.push({ x: this.ex, z: this.ez });
    }
    return d;
  }
  private patrolDist(): number {
    let best = Infinity;
    for (let i = 0; i < 4; i++) {
      const a = PATROL[i]!;
      const b = PATROL[(i + 1) % 4]!;
      const ux = b.x - a.x;
      const uz = b.z - a.z;
      const k = clamp(((this.ex - a.x) * ux + (this.ez - a.z) * uz) / (ux * ux + uz * uz), 0, 1);
      best = Math.min(best, Math.hypot(this.ex - (a.x + ux * k), this.ez - (a.z + uz * k)));
    }
    return best;
  }

  protected tick(t: number, dt: number): void {
    if (!this.ready2) return;
    this.time = t;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.boost = Math.max(0, this.boost - dt);
    this.emove = 0;
    // ── 주인공 (정해진 길 · 쫓기면 도망)
    if ((this.st === 'chase' || this.st === 'attack') && !this.hidePil) {
      // 적보다 내가 더 가까운 기둥 가운데 가장 가까운 것
      let best: P2 | null = null;
      for (const pl of PILLARS) {
        const dm = Math.hypot(pl.x - this.px, pl.z - this.pz);
        if (Math.hypot(pl.x - this.ex, pl.z - this.ez) < dm) continue;
        if (!best || dm < Math.hypot(best.x - this.px, best.z - this.pz)) best = pl;
      }
      this.hidePil = best ?? PILLARS[0]!;
      this.fleeFrom = this.pstep;
      this.pwait = 0;
      this.freeze = 1.5;
    }
    this.patrolT = this.st === 'patrol' ? this.patrolT + dt : 0;
    let tx = this.px;
    let tz = this.pz;
    let sp = 0;
    let run = false;
    if (this.hidePil) {
      // 기둥을 사이에 두고 적의 반대쪽에 숨기
      const pl = this.hidePil;
      const ax = pl.x - this.ex;
      const az = pl.z - this.ez;
      const al = Math.hypot(ax, az) || 1;
      tx = pl.x + (ax / al) * 1.05;
      tz = pl.z + (az / al) * 1.05;
      const far = Math.hypot(tx - this.px, tz - this.pz) > 0.6;
      sp = this.boost > 0 ? 5 : far ? 2.4 : 1.8;
      run = far;
      if (this.freeze > 0 && this.boost <= 0) {
        // 들킨 순간 얼어붙음 (깜짝)
        this.freeze -= dt;
        tx = this.px;
        tz = this.pz;
        sp = 0;
        run = false;
        this.pyaw += angWrap(Math.atan2(this.ex - this.px, this.ez - this.pz) - this.pyaw) * (1 - Math.exp(-10 * dt));
      }
      if (this.patrolT > 1.2) {
        this.hidePil = null;
        this.pstep = this.fleeFrom >= 5 || this.fleeFrom === 0 ? 0 : 5;
        this.pwait = 0.4;
      }
    } else if (this.pwait > 0) {
      this.pwait -= dt;
    } else {
      const s = SCRIPT[this.pstep]!;
      const hold = (s.sync === 'near' && !(this.st === 'patrol' && this.ez > -0.5 && this.ex < 4.6)) || (s.sync === 'patrol' && this.st !== 'patrol') || (s.sync === 'bottom' && !(this.st === 'patrol' && this.ez > -0.5 && this.ex < 5.8));
      tx = hold ? this.px : s.x;
      tz = hold ? this.pz : s.z;
      sp = hold ? 0 : s.sp;
      run = !!s.run;
      if (!hold && Math.hypot(tx - this.px, tz - this.pz) < 0.15) {
        this.pwait = s.wait ?? 0;
        this.pstep = (this.pstep + 1) % SCRIPT.length;
      }
    }
    const pdx = tx - this.px;
    const pdz = tz - this.pz;
    const pd = Math.hypot(pdx, pdz);
    this.pmove = damp(this.pmove, pd > 0.05 ? sp : 0, 10, dt);
    if (pd > 0.05) {
      const s = Math.min(pd, this.pmove * dt);
      const p = { x: this.px + (pdx / pd) * s, z: this.pz + (pdz / pd) * s };
      this.pushOut(p, 0.3);
      this.px = p.x;
      this.pz = p.z;
      this.pyaw += angWrap(Math.atan2(pdx, pdz) - this.pyaw) * (1 - Math.exp(-12 * dt));
    }
    this.prun = run && this.pmove > 2.5;
    // 발소리 — 뛰면 0.33초마다 소리 고리, 반경 안이면 적이 들음
    if (this.prun && !this.quiet) {
      this.stepT += dt;
      if (this.stepT > 0.33) {
        this.stepT = 0;
        const r = this.rings.find((x) => x.t > 0.75) ?? this.rings[0]!;
        r.t = 0;
        r.x = this.px;
        r.z = this.pz;
        if (Math.hypot(this.px - this.ex, this.pz - this.ez) <= this.noiseR && this.st !== 'chase' && this.st !== 'attack') {
          if (!this.memory || this.memT < 3.5) this.toast('발소리를 들음!', '#ffd24a', this.ex, this.ez);
          this.memory = { x: this.px, z: this.pz };
          this.memT = 4.5;
          this.lookT = 0;
        }
      }
    }
    // ── 적: 보기 (시야 원뿔 + 벽 광선 검사)
    const dx = this.px - this.ex;
    const dz = this.pz - this.ez;
    const d = Math.hypot(dx, dz) || 1e-6;
    const ca = (Math.sin(this.eyaw) * dx + Math.cos(this.eyaw) * dz) / d;
    const inCone = d < this.range && ca > Math.cos((this.fov * Math.PI) / 180);
    const block = ray2(this.segs, this.ex, this.ez, dx / d, dz / d, d);
    this.seen = inCone && block >= d - 0.05;
    if (this.seen) {
      this.seenT = Math.min(1, this.seenT + dt);
      this.memory = { x: this.px, z: this.pz };
      this.memT = 3;
      this.lookT = 0;
    } else this.seenT = Math.max(0, this.seenT - dt * 0.6);
    this.memT -= dt;
    if (this.memT <= 0) this.memory = null;
    // ── 행동 나무 (위에서부터 처음 성공하는 가지)
    const bt = this.bt;
    bt.fill(0);
    bt[0] = 3;
    let pick: AState;
    const swinging = this.st === 'attack' && this.atkT < 0.85;
    if (swinging || (this.seen && d < 1.15)) {
      bt[1] = 2;
      bt[2] = 3;
      pick = 'attack';
    } else {
      bt[1] = 1;
      if (this.seen && (this.seenT > 0.3 || this.st === 'chase' || this.st === 'attack')) {
        bt[3] = 2;
        bt[4] = 3;
        pick = 'chase';
      } else {
        bt[3] = 1;
        if (this.memory) {
          bt[5] = 2;
          bt[6] = 3;
          pick = 'suspect';
        } else {
          bt[5] = 1;
          if (this.crumbs.length || this.patrolDist() > 0.3) {
            bt[7] = 2;
            bt[8] = 3;
            pick = 'return';
          } else {
            bt[7] = 1;
            bt[9] = 3;
            pick = 'patrol';
          }
        }
      }
    }
    if (pick !== this.st) {
      if (pick === 'chase' && this.st !== 'attack') this.toast('들켰다! 추격', '#ff6a5a', this.ex, this.ez);
      if (pick === 'return' && (this.st === 'suspect' || this.st === 'chase')) this.toast('놓쳤다… 돌아감', '#9cc8ff', this.ex, this.ez);
      if (pick === 'attack') {
        this.atkT = 0;
        this.hitDone = false;
      }
      if (pick === 'patrol') {
        let bi = 0;
        PATROL.forEach((p, i) => {
          if (Math.hypot(p.x - this.ex, p.z - this.ez) < Math.hypot(PATROL[bi]!.x - this.ex, PATROL[bi]!.z - this.ez)) bi = i;
        });
        this.pi = bi;
        this.crumbs.length = 0;
      }
      this.st = pick;
    }
    // ── 행동
    const gob = this.gob;
    gob.armR.rotation.x = damp(gob.armR.rotation.x, 0, 8, dt);
    if (this.st === 'patrol') {
      const p = PATROL[this.pi]!;
      if (this.moveEnemy(p.x, p.z, 1.3, dt) < 0.15) this.pi = (this.pi + 1) % 4;
    } else if (this.st === 'suspect' && this.memory) {
      const m = this.memory;
      if (Math.hypot(m.x - this.ex, m.z - this.ez) > 0.35 && this.lookT === 0) this.moveEnemy(m.x, m.z, 1.9, dt);
      else {
        this.lookT += dt;
        this.eyaw += Math.sin(this.lookT * 2.6) * dt * 2.4;
        if (this.lookT > 2.6) {
          this.memory = null;
          this.memT = 0;
        }
      }
    } else if (this.st === 'chase') {
      this.moveEnemy(this.px, this.pz, 2.9, dt);
    } else if (this.st === 'attack') {
      this.atkT += dt;
      this.eyaw += angWrap(Math.atan2(dx, dz) - this.eyaw) * (1 - Math.exp(-14 * dt));
      const k = this.atkT;
      gob.armR.rotation.x = k < 0.35 ? lerp(0, -2.5, k / 0.35) : k < 0.5 ? lerp(-2.5, 0.9, (k - 0.35) / 0.15) : lerp(0.9, 0, clamp((k - 0.5) / 0.35, 0, 1));
      if (k > 0.45 && !this.hitDone) {
        this.hitDone = true;
        if (d < 1.5) {
          const p = { x: this.px + (dx / d) * 0.9, z: this.pz + (dz / d) * 0.9 };
          this.pushOut(p, 0.3);
          this.px = p.x;
          this.pz = p.z;
          this.hitFlash = 0.5;
          this.boost = 1.8;
          this.toast('쿵!', '#ffb070', this.px, this.pz);
        }
      }
    } else if (this.st === 'return') {
      const c = this.crumbs[this.crumbs.length - 1];
      if (c) {
        if (this.moveEnemy(c.x, c.z, 1.6, dt) < 0.2) this.crumbs.pop();
      } else {
        const p = PATROL[this.pi]!;
        this.moveEnemy(p.x, p.z, 1.6, dt);
      }
    }
    // ── 보이는 것
    const hero = this.hero;
    hero.root.position.set(this.px, 0, this.pz);
    hero.yaw.rotation.y = this.pyaw;
    animRig(hero, dt, this.pmove, false, t);
    hero.body.rotation.z = Math.sin(this.hitFlash * 40) * this.hitFlash * 0.5;
    gob.root.position.set(this.ex, 0, this.ez);
    gob.yaw.rotation.y = this.eyaw;
    animRig(gob, dt, this.emove, false, t);
    if (this.st === 'attack') gob.body.rotation.x = -0.15;
    const col = ST_INFO[this.st].hex;
    (this.fan.material as THREE.MeshBasicMaterial).color.setHex(col);
    (this.fan.material as THREE.MeshBasicMaterial).opacity = this.seen ? 0.36 : 0.24;
    (this.fanEdge.material as THREE.LineBasicMaterial).color.setHex(col);
    const fp = this.fan.geometry.getAttribute('position') as THREE.BufferAttribute;
    const ep = this.fanEdge.geometry.getAttribute('position') as THREE.BufferAttribute;
    const half = (this.fov * Math.PI) / 180;
    const y = 0.07;
    fp.setXYZ(0, this.ex, y, this.ez);
    ep.setXYZ(0, this.ex, y, this.ez);
    for (let i = 0; i <= this.N; i++) {
      const a = this.eyaw - half + (2 * half * i) / this.N;
      const rx = Math.sin(a);
      const rz = Math.cos(a);
      const k = ray2(this.segs, this.ex, this.ez, rx, rz, this.range);
      fp.setXYZ(i + 1, this.ex + rx * k, y, this.ez + rz * k);
      ep.setXYZ(i + 1, this.ex + rx * k, y, this.ez + rz * k);
    }
    ep.setXYZ(this.N + 2, this.ex, y, this.ez);
    fp.needsUpdate = true;
    ep.needsUpdate = true;
    this.fan.geometry.computeBoundingSphere();
    // 눈 → 주인공 광선 (시야 안일 때만)
    this.los.visible = inCone;
    if (inCone) {
      const lp = this.los.geometry.getAttribute('position') as THREE.BufferAttribute;
      const k = Math.min(block, d);
      lp.setXYZ(0, this.ex, 0.95, this.ez);
      lp.setXYZ(1, this.ex + (dx / d) * k, this.seen ? 0.75 : 0.95, this.ez + (dz / d) * k);
      lp.needsUpdate = true;
      this.los.computeLineDistances();
      (this.los.material as THREE.LineDashedMaterial).color.setHex(this.seen ? 0xff4a3a : 0xb8a898);
    }
    for (const r of this.rings) {
      r.t += dt;
      const k = r.t / 0.75;
      r.m.visible = k < 1;
      if (k >= 1) continue;
      const rad = Math.max(0.05, this.noiseR * (1 - (1 - k) * (1 - k)));
      r.m.position.set(r.x, 0.06, r.z);
      r.m.scale.setScalar(rad);
      (r.m.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k);
    }
  }
  protected draw(r: R, w: number, h: number): void {
    const pw = Math.round(Math.min(w * 0.4, 150 * this.hud.u));
    if (pw !== this.pw || this.camera.view?.fullWidth !== w || this.camera.view?.fullHeight !== h) {
      this.pw = pw;
      this.camera.setViewOffset(w, h, pw / 2, 0, w, h);
    }
    super.draw(r, w, h);
  }
  protected overlay(w: number, h: number): void {
    const u = this.hud.u;
    const hp = this.hud;
    // 머리 위 상태 아이콘
    const sp = this.toScreen(_tv.set(this.ex, 2.0, this.ez));
    const iw = 64 * u;
    const ih = 46 * u;
    const ic = hp.get('icon');
    ic.place(sp.x - iw / 2, sp.y - ih, iw, ih);
    const meter = this.st === 'suspect' ? Math.round((this.lookT > 0 ? this.lookT / 2.6 : this.seenT / 0.3) * 12) : 0;
    ic.paint(iw, ih, this.st + meter, (g, W) => this.drawIcon(g, W, this.st, meter / 12));
    // 알림
    this.toasts = this.toasts.filter((x) => this.time - x.t0 < 1.5);
    this.toasts.forEach((x, i) => {
      const k = (this.time - x.t0) / 1.5;
      const p = this.toScreen(_tv.set(x.x, 3.3 + k * 0.8, x.z));
      const pn = hp.get('toast' + i);
      const tw = 120 * u;
      const th = 18 * u;
      pn.place(p.x - tw / 2, p.y - th, tw, th);
      pn.mat.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      pn.paint(tw, th, x.text + x.col, (g) => pill(g, x.text, tw / 2, 1, 9.5 * u, 'rgba(24,13,8,0.9)', x.col, 'c'));
    });
    // 오른쪽: 상태 기계 + 행동 나무
    const pw = this.pw || Math.round(w * 0.4);
    const bp = hp.get('bt');
    bp.place(w - pw, 0, pw, h);
    const pulse = Math.floor(this.time * 6) % 6;
    bp.paint(pw, h, this.st + this.bt.join('') + pulse, (g, W, Hh) => this.drawTree(g, W, Hh, pulse));
  }
  private drawIcon(g: G, W: number, st: AState, meter: number): void {
    const s = W / 64;
    const info = ST_INFO[st];
    const cx = W / 2;
    const cy = 15 * s;
    const R0 = 12 * s;
    g.fillStyle = 'rgba(20,12,8,0.9)';
    g.beginPath();
    g.arc(cx, cy, R0 + 2 * s, 0, TAU);
    g.fill();
    g.fillStyle = info.col;
    g.beginPath();
    g.arc(cx, cy, R0, 0, TAU);
    g.fill();
    if (meter > 0) {
      g.strokeStyle = '#fff';
      g.lineWidth = 2.2 * s;
      g.beginPath();
      g.arc(cx, cy, R0 + 1 * s, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(meter, 0, 1));
      g.stroke();
    }
    g.fillStyle = '#1d120b';
    g.strokeStyle = '#1d120b';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = 2.6 * s;
    if (st === 'patrol') {
      for (const k of [-1, 0, 1]) {
        g.beginPath();
        g.arc(cx + k * 5 * s, cy + 1 * s, 1.9 * s, 0, TAU);
        g.fill();
      }
    } else if (st === 'suspect' || st === 'chase') {
      g.font = `900 ${17 * s}px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(st === 'suspect' ? '?' : '!', cx, cy + 1.2 * s);
      g.textAlign = 'left';
    } else if (st === 'attack') {
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.moveTo(cx - sx * 6 * s, cy - 6 * s);
        g.lineTo(cx + sx * 6 * s, cy + 6 * s);
        g.stroke();
        const gx = cx + sx * 2.6 * s;
        const gy = cy + 2.6 * s;
        g.beginPath();
        g.moveTo(gx - 2.6 * s, gy + sx * 2.6 * s);
        g.lineTo(gx + 2.6 * s, gy - sx * 2.6 * s);
        g.stroke();
      }
    } else {
      g.beginPath();
      g.arc(cx, cy + 1 * s, 5.5 * s, Math.PI * 1.1, Math.PI * 0.35, false);
      g.stroke();
      g.beginPath();
      g.moveTo(cx - 8.5 * s, cy - 3.5 * s);
      g.lineTo(cx - 5 * s, cy - 2.5 * s);
      g.lineTo(cx - 4.4 * s, cy - 6.4 * s);
      g.stroke();
    }
    pill(g, info.ko, cx, 30 * s, 9 * s, 'rgba(20,12,8,0.88)', info.col, 'c');
  }
  private drawTree(g: G, W: number, Hh: number, pulse: number): void {
    const s = W / 112;
    g.fillStyle = 'rgba(18,12,9,0.93)';
    g.fillRect(0, 0, W, Hh);
    g.fillStyle = 'rgba(255,220,170,0.08)';
    g.fillRect(0, 0, 1.2 * s, Hh);
    const fit = (text: string, maxW: number, size: number, weight = 700): void => {
      let f = size;
      g.font = `${weight} ${f}px ${FONT}`;
      while (g.measureText(text).width > maxW && f > 4) {
        f -= 0.5;
        g.font = `${weight} ${f}px ${FONT}`;
      }
    };
    g.textBaseline = 'middle';
    // 상태 기계
    g.fillStyle = '#bfae98';
    g.font = `700 ${7 * s}px ${FONT}`;
    g.fillText('상태 기계', 6 * s, 8 * s);
    const cw = (W - 12 * s - 4 * 2 * s) / 5;
    ST_ORDER.forEach((k, i) => {
      const x = 6 * s + i * (cw + 2 * s);
      const on = k === this.st;
      const inf = ST_INFO[k];
      rr(g, x, 14 * s, cw, 13 * s, 3.5 * s);
      g.fillStyle = on ? inf.col : 'rgba(255,255,255,0.05)';
      g.fill();
      g.strokeStyle = on ? '#fff' : inf.col + '88';
      g.lineWidth = (on ? 1.4 : 0.9) * s;
      g.stroke();
      g.fillStyle = on ? '#1d120b' : inf.col;
      fit(inf.ko, cw - 2 * s, 7 * s, 800);
      g.textAlign = 'center';
      g.fillText(inf.ko, x + cw / 2, 20.8 * s);
      g.textAlign = 'left';
    });
    // 행동 나무
    const top = 36 * s;
    g.fillStyle = '#bfae98';
    g.font = `700 ${7 * s}px ${FONT}`;
    fit('행동 나무 — 위에서부터 처음 되는 가지', W - 10 * s, 7 * s);
    g.fillText('행동 나무 — 위에서부터 처음 되는 가지', 6 * s, top);
    const rootY = top + 11 * s;
    rr(g, 6 * s, rootY - 6 * s, 30 * s, 12 * s, 3 * s);
    g.fillStyle = '#3a2c22';
    g.fill();
    g.strokeStyle = '#e8c89a';
    g.lineWidth = 1 * s;
    g.stroke();
    g.fillStyle = '#f3dcc0';
    fit('선택 ?', 26 * s, 7 * s);
    g.fillText('선택 ?', 9.5 * s, rootY + 0.5 * s);
    const rows: [AState, string, string][] = [
      ['attack', '가까이?', '휘두르기'],
      ['chase', '보이나?', '쫓아가기'],
      ['suspect', '소리·흔적?', '살피러 가기'],
      ['return', '자리 떠남?', '돌아가기'],
      ['patrol', '', '순찰 길 걷기'],
    ];
    const y0 = rootY + 12 * s;
    const rh = Math.min(22 * s, (Hh - y0 - 4 * s) / 5);
    const bh = Math.min(13 * s, rh * 0.72);
    const glow = 0.55 + 0.45 * Math.sin((pulse / 6) * TAU);
    rows.forEach(([k, cond, act], i) => {
      const cy = y0 + rh * (i + 0.5);
      const inf = ST_INFO[k];
      const cs = i < 4 ? this.bt[1 + i * 2]! : 2;
      const as = i < 4 ? this.bt[2 + i * 2]! : this.bt[9]!;
      // 줄기
      g.strokeStyle = 'rgba(232,200,154,0.55)';
      g.lineWidth = 1 * s;
      g.beginPath();
      g.moveTo(11 * s, rootY + 6 * s);
      g.lineTo(11 * s, cy);
      g.lineTo(16 * s, cy);
      g.stroke();
      // 가지 이름 (순서)
      const dim = cs === 0 && as === 0;
      g.globalAlpha = dim ? 0.38 : 1;
      rr(g, 16 * s, cy - bh / 2, 22 * s, bh, 3 * s);
      g.fillStyle = 'rgba(255,255,255,0.06)';
      g.fill();
      g.strokeStyle = inf.col;
      g.lineWidth = 1 * s;
      g.stroke();
      g.fillStyle = inf.col;
      fit(inf.ko, 19 * s, 7 * s, 800);
      g.textAlign = 'center';
      g.fillText(inf.ko, 27 * s, cy + 0.4 * s);
      g.textAlign = 'left';
      // 조건
      let ax = 40 * s;
      if (cond) {
        const cw2 = 34 * s;
        rr(g, ax, cy - bh / 2, cw2, bh, bh / 2);
        g.fillStyle = cs === 2 ? 'rgba(110,224,122,0.22)' : cs === 1 ? 'rgba(255,90,74,0.16)' : 'rgba(255,255,255,0.04)';
        g.fill();
        g.strokeStyle = cs === 2 ? '#6ee07a' : cs === 1 ? '#ff6a5a' : 'rgba(255,255,255,0.25)';
        g.stroke();
        g.fillStyle = cs === 2 ? '#c8f5cf' : cs === 1 ? '#ffb3a6' : '#bfae98';
        const mark = cs === 2 ? '✓ ' : cs === 1 ? '✗ ' : '';
        fit(mark + cond, cw2 - 5 * s, 6.6 * s);
        g.fillText(mark + cond, ax + 3 * s, cy + 0.4 * s);
        g.strokeStyle = 'rgba(232,200,154,0.45)';
        g.beginPath();
        g.moveTo(ax + cw2, cy);
        g.lineTo(ax + cw2 + 3 * s, cy);
        g.stroke();
        ax += cw2 + 3 * s;
      }
      // 행동
      const aw = W - ax - 5 * s;
      rr(g, ax, cy - bh / 2, aw, bh, 3 * s);
      if (as === 3) {
        g.save();
        g.shadowColor = inf.col;
        g.shadowBlur = 8 * s * glow;
        g.fillStyle = inf.col;
        g.fill();
        g.restore();
        g.strokeStyle = '#fff';
        g.lineWidth = 1.3 * s;
        g.stroke();
        g.fillStyle = '#1d120b';
      } else {
        g.fillStyle = 'rgba(255,255,255,0.04)';
        g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.22)';
        g.lineWidth = 1 * s;
        g.stroke();
        g.fillStyle = '#d9c7b0';
      }
      const lab = (as === 3 ? '▶ ' : '') + act;
      fit(lab, aw - 5 * s, 7 * s, 800);
      g.fillText(lab, ax + 3 * s, cy + 0.4 * s);
      g.globalAlpha = 1;
    });
  }
}


export const DEMOS: DemoMap = {
  i480: { kind: '3d', caption: '캡슐이 경사 · 계단 · 벽과 부딪혀 밀려나는 법 — 화살표 = 닿은 면의 법선', make: () => new CtrlDemo() },
  i481: { kind: '3d', caption: '왼쪽 끔: 카메라가 벽 뒤로 가 주인공이 가려짐 · 오른쪽 켬: 구로 쓸어 벽 앞까지 당겨 옴', make: () => new CamDemo() },
  i482: { kind: '3d', caption: '바닥 삼각형 그물에서 A* 로 통로를 찾고(노랑) 깔때기로 곧게 편 길(띠)을 괴물마다 따라감', make: () => new NavDemo() },
  i483: { kind: '3d', caption: '고블린 경비의 머리 위 = 지금 상태 · 바닥 부채꼴 = 시야(벽에 가림) · 고리 = 발소리 · 오른쪽 = 행동 나무에서 지금 실행 중인 마디', make: () => new AIDemo() },
};

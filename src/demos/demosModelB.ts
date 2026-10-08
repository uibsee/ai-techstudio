import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Control, DemoMap, Scene3D } from './types';

/**
 * 3D 모델링 · 절차 (2) — 블렌더 없이 코드로 디테일 있는 모델 만들기.
 * i450 선반 회전체 · i451 CSG 불리언 · i452 바위 절차 생성 · i453 정점 AO 굽기 · i454 높이 → 법선 맵 · i455 표면 흩뿌리기.
 * 무거운 계산(CSG · AO 광선 · 법선 맵)은 make() 에서 한 번만 — 매 프레임은 보여 주기만.
 */

/* ───────────── 공용 도우미 ───────────── */

const PI = Math.PI;
const TAU = PI * 2;
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const sat = (v: number): number => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (a: number, b: number, x: number): number => {
  const t = sat((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeIO = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeBack = (t: number): number => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c1 = 1.9;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const fmt = (n: number): string => Math.round(n).toLocaleString('ko-KR');

/**
 * 나눠 굽기 — 무거운 만들기는 생성기 함수로 쓰고, 그 안에서 `if (late()) yield;` 로 틈틈이 쉰다.
 * Job.step() 이 프레임마다 한 조각(기본 3ms)만 돌린다. make() 는 바로 돌아오고 화면은 멈추지 않는다.
 */
type G<T = void> = Generator<void, T, void>;
let DEADLINE = Infinity;
const late = (): boolean => performance.now() > DEADLINE;
class Job {
  private it: G | null = null;
  /** 지금까지 쓴 계산 시간(ms) */
  spent = 0;
  start(g: G): void {
    this.it = g;
    this.spent = 0;
  }
  get busy(): boolean {
    return this.it !== null;
  }
  /** 한 조각 돌리기 — 끝났으면 true */
  step(budget = 3): boolean {
    if (!this.it) return true;
    const t0 = performance.now();
    DEADLINE = t0 + budget;
    try {
      if (this.it.next().done) this.it = null;
    } finally {
      DEADLINE = Infinity;
      this.spent += performance.now() - t0;
    }
    return this.it === null;
  }
}

function rngOf(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash3(x: number, y: number, z: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177 + s * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function noise3(x: number, y: number, z: number, s: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash3(ix, iy, iz, s);
  const b = hash3(ix + 1, iy, iz, s);
  const c = hash3(ix, iy + 1, iz, s);
  const d = hash3(ix + 1, iy + 1, iz, s);
  const e = hash3(ix, iy, iz + 1, s);
  const f = hash3(ix + 1, iy, iz + 1, s);
  const g = hash3(ix, iy + 1, iz + 1, s);
  const h = hash3(ix + 1, iy + 1, iz + 1, s);
  return lerp(lerp(lerp(a, b, ux), lerp(c, d, ux), uy), lerp(lerp(e, f, ux), lerp(g, h, ux), uy), uz);
}
function fbm3(x: number, y: number, z: number, s: number, oct = 4): number {
  let v = 0;
  let a = 0.5;
  let n = 0;
  for (let o = 0; o < oct; o++) {
    v += a * noise3(x, y, z, s + o * 17);
    n += a;
    x *= 2.03;
    y *= 2.03;
    z *= 2.03;
    a *= 0.5;
  }
  return v / n;
}
function noise2(x: number, y: number, s: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return lerp(lerp(hash3(ix, iy, 0, s), hash3(ix + 1, iy, 0, s), ux), lerp(hash3(ix, iy + 1, 0, s), hash3(ix + 1, iy + 1, 0, s), ux), uy);
}
function fbm2(x: number, y: number, s: number, oct = 4): number {
  let v = 0;
  let a = 0.5;
  let n = 0;
  for (let o = 0; o < oct; o++) {
    v += a * noise2(x, y, s + o * 31);
    n += a;
    x *= 2.03;
    y *= 2.03;
    a *= 0.5;
  }
  return v / n;
}

function bgTex(top: string, bottom: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, top);
  gr.addColorStop(1, bottom);
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 반구광 + 해(부드러운 그림자) */
function addLights(
  scene: THREE.Scene,
  o: { sky?: number; ground?: number; hemi?: number; sun?: number; dir?: [number, number, number]; ext?: number } = {},
): { hemi: THREE.HemisphereLight; sun: THREE.DirectionalLight } {
  const hemi = new THREE.HemisphereLight(o.sky ?? 0xdfe8ff, o.ground ?? 0x6a5848, o.hemi ?? 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, o.sun ?? 2.2);
  const d = o.dir ?? [-3, 6, 4];
  sun.position.set(d[0], d[1], d[2]);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const e = o.ext ?? 3;
  const c = sun.shadow.camera;
  c.left = -e;
  c.right = e;
  c.top = e;
  c.bottom = -e;
  c.near = 0.5;
  c.far = 30;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 4;
  scene.add(sun, sun.target);
  return { hemi, sun };
}

function shadowed(r: THREE.WebGLRenderer, fn: () => void): void {
  const se = r.shadowMap.enabled;
  const st = r.shadowMap.type;
  const au = r.shadowMap.autoUpdate;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFShadowMap;
  try {
    fn();
  } finally {
    r.shadowMap.enabled = se;
    r.shadowMap.type = st;
    r.shadowMap.autoUpdate = au;
  }
}

/** 환경 반사(방 조명) — 렌더러가 처음 들어올 때 한 번 */
/* 이 파일의 견본들이 렌더러 하나당 한 번만 만들어 함께 쓴다 (PMREM 은 비싸다) */
const ENV_CACHE = new WeakMap<THREE.WebGLRenderer, { rt: THREE.WebGLRenderTarget; users: number }>();
class Env {
  private r: THREE.WebGLRenderer | null = null;
  apply(r: THREE.WebGLRenderer, scene: THREE.Scene, intensity: number): void {
    if (this.r) return;
    this.r = r;
    let e = ENV_CACHE.get(r);
    if (!e) {
      const pm = new THREE.PMREMGenerator(r);
      const room = new RoomEnvironment();
      e = { rt: pm.fromScene(room, 0.04), users: 0 };
      (room as unknown as { dispose?: () => void }).dispose?.();
      pm.dispose();
      ENV_CACHE.set(r, e);
    }
    e.users++;
    scene.environment = e.rt.texture;
    scene.environmentIntensity = intensity;
  }
  dispose(): void {
    if (!this.r) return;
    const e = ENV_CACHE.get(this.r);
    if (e && --e.users <= 0) {
      e.rt.dispose();
      ENV_CACHE.delete(this.r);
    }
  }
}

/**
 * 셰이더 미리 굽기 — 처음 그릴 때 · 새 물체가 생길 때 셰이더 컴파일이 화면을 막지 않게
 * compileAsync(병렬 컴파일)로 먼저 굽고, 끝난 뒤에 그리거나 붙인다.
 */
class Warm {
  ready = false;
  private started = false;
  private busy = false;
  private queue: { obj: THREE.Object3D; parent: THREE.Object3D; alive?: () => boolean }[] = [];
  /** 물체를 바로 붙이지 않고, 셰이더를 구운 뒤 parent 에 붙인다 */
  add(obj: THREE.Object3D, parent: THREE.Object3D, alive?: () => boolean): void {
    this.queue.push({ obj, parent, alive });
  }
  get pending(): boolean {
    return this.queue.length > 0 || this.busy;
  }
  /** 준비됐으면 true. 아니면 배경색만 칠한다 */
  tick(r: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, clear = 0x1a2030): boolean {
    if (!this.started) {
      this.started = true;
      this.compile(r, scene, scene, camera, () => (this.ready = true));
    }
    if (this.ready && !this.busy && this.queue.length) {
      const batch = this.queue.splice(0);
      const stage = new THREE.Scene();
      stage.environment = scene.environment;
      stage.environmentIntensity = scene.environmentIntensity;
      for (const b of batch) stage.add(b.obj);
      this.busy = true;
      this.compile(r, stage, scene, camera, () => {
        this.busy = false;
        for (const b of batch) {
          let root: THREE.Object3D = b.parent;
          while (root.parent) root = root.parent;
          if (root === scene && (!b.alive || b.alive())) b.parent.add(b.obj);
          else {
            stage.remove(b.obj);
            freeAll(b.obj);
          }
        }
      });
    }
    if (!this.ready) {
      const cc = r.getClearColor(new THREE.Color());
      const ca = r.getClearAlpha();
      r.setClearColor(clear, 1);
      r.clear(true, true, false);
      r.setClearColor(cc, ca);
    }
    return this.ready;
  }
  private compile(r: THREE.WebGLRenderer, what: THREE.Scene, target: THREE.Scene, camera: THREE.Camera, done: () => void): void {
    let pr: Promise<unknown> = Promise.resolve();
    shadowed(r, () => {
      pr = r.compileAsync(what, camera, target);
    });
    pr.then(done, done);
  }
}
const TINY = new THREE.BufferGeometry()
  .setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3))
  .setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3))
  .setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1], 3))
  .setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
/** 지금은 안 붙어 있지만 나중에 바꿔 끼울 재질 — 숨은 물체로 달아 두어 미리 굽기에 들어가게 */
function hiddenUsers(parent: THREE.Object3D, mats: THREE.Material[], geo: THREE.BufferGeometry = TINY): void {
  for (const m of mats) {
    const h = new THREE.Mesh(geo, m);
    h.visible = false;
    h.userData.keepGeo = true;
    parent.add(h);
  }
}

type Disp = { dispose(): void };
function freeAll(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !o.userData.keepGeo) m.geometry.dispose();
    const raw = (m as unknown as { material?: THREE.Material | THREE.Material[] }).material;
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const x of list) {
      const mm = x as unknown as Record<string, unknown>;
      for (const k of ['map', 'normalMap', 'emissiveMap', 'roughnessMap']) (mm[k] as Disp | undefined)?.dispose();
      x.dispose();
    }
  });
}

/** 화면 위 이름표. pos = [x, y, 정렬(-1 왼쪽 · 0 가운데 · 1 오른쪽)] (화면 비율, 왼쪽 위 0,0) */
type TagPos = [number, number, number] | null;
class Tags {
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
  private items: { spr: THREE.Sprite; mat: THREE.SpriteMaterial; tex: THREE.CanvasTexture | null; text: string; aspect: number; tone: string }[] = [];
  private alive = true;
  constructor(n: number, tones: string[] = []) {
    for (let i = 0; i < n; i++) {
      const mat = new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
      const spr = new THREE.Sprite(mat);
      this.items.push({ spr, mat, tex: null, text: '', aspect: 1, tone: tones[i] ?? 'rgba(12,16,34,0.7)' });
      this.scene.add(spr);
    }
    void document.fonts?.ready.then(() => {
      if (!this.alive) return;
      for (const it of this.items) {
        const s = it.text;
        it.text = '';
        if (s) this.paint(it, s);
      }
    });
  }
  private paint(it: Tags['items'][number], text: string): void {
    if (it.text === text) return;
    it.text = text;
    if (!text) return;
    const fs = 40;
    const H = 66;
    const font = `700 ${fs}px "Pretendard Variable", Pretendard, system-ui, sans-serif`;
    const cv = document.createElement('canvas');
    let g = cv.getContext('2d')!;
    g.font = font;
    const tw = Math.ceil(g.measureText(text).width);
    cv.width = tw + 48;
    cv.height = H;
    g = cv.getContext('2d')!;
    g.font = font;
    g.fillStyle = it.tone;
    g.beginPath();
    g.roundRect(2, 2, cv.width - 4, H - 4, (H - 4) / 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.3)';
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, cv.width / 2, H / 2 + 2);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    it.tex?.dispose();
    it.tex = tex;
    it.mat.map = tex;
    it.mat.needsUpdate = true;
    it.aspect = cv.width / H;
  }
  set(i: number, text: string): void {
    const it = this.items[i];
    if (it) this.paint(it, text);
  }
  draw(r: THREE.WebGLRenderer, w: number, h: number, pos: TagPos[]): void {
    this.cam.right = w;
    this.cam.top = h;
    this.cam.updateProjectionMatrix();
    const hp = clamp(h * 0.072, 15, 30);
    this.items.forEach((it, i) => {
      const p = pos[i];
      if (!p || !it.text) {
        it.spr.visible = false;
        return;
      }
      it.spr.visible = true;
      const wp = hp * it.aspect;
      let x = p[0] * w + (p[2] < 0 ? wp / 2 : p[2] > 0 ? -wp / 2 : 0);
      x = clamp(x, wp / 2 + 4, w - wp / 2 - 4);
      const y = clamp((1 - p[1]) * h, hp / 2 + 4, h - hp / 2 - 4);
      it.spr.position.set(x, y, 0);
      it.spr.scale.set(wp, hp, 1);
    });
    const ac = r.autoClear;
    r.autoClear = false;
    r.setScissorTest(false);
    r.setViewport(0, 0, w, h);
    r.render(this.scene, this.cam);
    r.autoClear = ac;
  }
  dispose(): void {
    this.alive = false;
    for (const it of this.items) {
      it.tex?.dispose();
      it.mat.dispose();
    }
  }
}

/** 전/후 밀대: 왼쪽은 a(), 오른쪽은 b() — 같은 카메라, 가위로 나눔 */
function slider(r: THREE.WebGLRenderer, w: number, h: number, frac: number, a: () => void, b: () => void): void {
  const xs = Math.round(w * frac);
  r.setViewport(0, 0, w, h);
  r.setScissorTest(true);
  if (xs > 0) {
    r.setScissor(0, 0, xs, h);
    a();
    r.shadowMap.autoUpdate = false;
  }
  if (xs < w) {
    r.setScissor(xs, 0, w - xs, h);
    b();
  }
  r.shadowMap.autoUpdate = true;
  const cc = r.getClearColor(new THREE.Color());
  const ca = r.getClearAlpha();
  r.setScissor(xs - 1, 0, 3, h);
  r.setClearColor(0xffffff, 1);
  r.clear(true, false, false);
  r.setClearColor(cc, ca);
  r.setScissorTest(false);
}

function toScreen(v: THREE.Vector3, cam: THREE.Camera): [number, number] {
  const p = v.clone().project(cam);
  return [(p.x + 1) / 2, (1 - p.y) / 2];
}
function triCount(g: THREE.BufferGeometry): number {
  return (g.index ? g.index.count : g.getAttribute('position').count) / 3;
}

/* ───────────── i450 선반 회전체 + 장식 ───────────── */

type PNode = { x: number; y: number; r: number; c: number };
/** 윤곽 만들기: L = 모서리(둥글림 반지름), A = 원호(구슬 · 머리), S = 매끈한 곡선 */
class Prof {
  nodes: PNode[] = [];
  private c = 0;
  col(c: number): this {
    this.c = c;
    return this;
  }
  L(x: number, y: number, r = 0.02): this {
    this.nodes.push({ x, y, r, c: this.c });
    return this;
  }
  A(cx: number, cy: number, rad: number, a0: number, a1: number, n = 12): this {
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      this.nodes.push({ x: Math.max(0, cx + rad * Math.cos(a)), y: cy + rad * Math.sin(a), r: 0, c: this.c });
    }
    return this;
  }
  S(pts: [number, number][], n = 8, colAt?: (y: number) => number): this {
    const P = [pts[0]!, ...pts, pts[pts.length - 1]!];
    for (let i = 1; i < P.length - 2; i++) {
      const p0 = P[i - 1]!;
      const p1 = P[i]!;
      const p2 = P[i + 1]!;
      const p3 = P[i + 2]!;
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const t2 = t * t;
        const t3 = t2 * t;
        const f = (a: number, b: number, c: number, d: number): number => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        const y = f(p0[1], p1[1], p2[1], p3[1]);
        this.nodes.push({ x: f(p0[0], p1[0], p2[0], p3[0]), y, r: 0, c: colAt ? colAt(y) : this.c });
      }
    }
    const l = pts[pts.length - 1]!;
    this.nodes.push({ x: l[0], y: l[1], r: 0, c: colAt ? colAt(l[1]) : this.c });
    return this;
  }
  build(sx = 1, sy = 1): { pts: THREE.Vector2[]; cols: number[] } {
    const N = this.nodes;
    const pts: THREE.Vector2[] = [];
    const cols: number[] = [];
    const push = (x: number, y: number, c: number): void => {
      x *= sx;
      y *= sy;
      const l = pts[pts.length - 1];
      if (l && Math.hypot(l.x - x, l.y - y) < 1e-4) return;
      pts.push(new THREE.Vector2(Math.max(0, x), y));
      cols.push(c);
    };
    for (let i = 0; i < N.length; i++) {
      const n = N[i]!;
      if (n.r > 0 && i > 0 && i < N.length - 1) {
        const pr = N[i - 1]!;
        const nx = N[i + 1]!;
        const l0 = Math.hypot(pr.x - n.x, pr.y - n.y);
        const l1 = Math.hypot(nx.x - n.x, nx.y - n.y);
        const rr = Math.min(n.r, 0.45 * l0, 0.45 * l1);
        if (rr < 1e-5) {
          push(n.x, n.y, n.c);
          continue;
        }
        const ax = n.x + ((pr.x - n.x) / l0) * rr;
        const ay = n.y + ((pr.y - n.y) / l0) * rr;
        const bx = n.x + ((nx.x - n.x) / l1) * rr;
        const by = n.y + ((nx.y - n.y) / l1) * rr;
        for (let k = 0; k <= 6; k++) {
          const s = k / 6;
          const u = 1 - s;
          push(u * u * ax + 2 * u * s * n.x + s * s * bx, u * u * ay + 2 * u * s * n.y + s * s * by, n.c);
        }
      } else push(n.x, n.y, n.c);
    }
    return { pts, cols };
  }
}
function radiusAt(pts: THREE.Vector2[], y: number): number {
  for (let j = 0; j < pts.length - 1; j++) {
    const a = pts[j]!;
    const b = pts[j + 1]!;
    if ((a.y - y) * (b.y - y) <= 0 && a.y !== b.y) return lerp(a.x, b.x, (y - a.y) / (b.y - a.y));
  }
  return 0;
}

type PieceSpec = {
  prof: Prof;
  palette: number[];
  rough: number;
  coat: number;
  deco: (pts: THREE.Vector2[], gold: THREE.Material, rng: () => number) => THREE.Object3D[];
};
const ACOS = (x: number, r: number): number => -Math.acos(clamp(x / r, -1, 1));

function goldRing(n: number, rad: number, y: number, size: number, mat: THREE.Material): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const g = new THREE.SphereGeometry(size, 14, 10);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const m = new THREE.Mesh(i === 0 ? g : g.clone(), mat);
    m.position.set(Math.sin(a) * rad, y, Math.cos(a) * rad);
    m.castShadow = true;
    out.push(m);
  }
  return out;
}

function chessSpec(rng: () => number): PieceSpec {
  const pals = [
    [0xf1e4cc, 0xe9b949],
    [0x2d3c6e, 0xe9b949],
    [0xb8434d, 0xf6e7c8],
    [0x8fd3bf, 0xe9b949],
  ];
  const palette = pals[Math.floor(rng() * pals.length)]!;
  const kind = Math.floor(rng() * 3);
  const p = new Prof();
  // 받침 · 홈 · 구슬 테 (세 말 공통)
  const base = (s: number): void => {
    p.L(0, 0, 0).L(0.5 * s, 0, 0.02).L(0.5 * s, 0.09, 0.03).L(0.43 * s, 0.12, 0.015).L(0.45 * s, 0.17, 0.02);
    p.col(1).A(0.41 * s, 0.225, 0.06, -PI / 2, PI / 2, 10).col(0);
    p.L(0.35 * s, 0.29, 0.02).L(0.29 * s, 0.34, 0.06);
  };
  if (kind === 0) {
    base(1);
    p.L(0.17, 0.66, 0.1).L(0.16, 0.72, 0.02);
    p.col(1).L(0.29, 0.74, 0.02).L(0.3, 0.79, 0.02).L(0.15, 0.82, 0.02).col(0);
    p.A(0, 1.02, 0.23, ACOS(0.13, 0.23), PI / 2, 18);
  } else {
    base(1.1);
    p.L(0.2, 0.95, 0.14).L(0.18, 1.05, 0.03);
    p.col(1).L(0.32, 1.08, 0.02).L(0.33, 1.13, 0.02).L(0.2, 1.16, 0.02).col(0);
    if (kind === 1) {
      p.L(0.17, 1.22, 0.03).L(0.3, 1.42, 0.04).L(0.33, 1.46, 0.02).col(1).L(0.31, 1.5, 0.02).col(0).L(0.2, 1.47, 0.03).L(0.1, 1.5, 0.03);
      p.col(1).A(0, 1.6, 0.09, ACOS(0.08, 0.09), PI / 2, 14);
    } else {
      p.L(0.17, 1.22, 0.03).L(0.27, 1.4, 0.04).L(0.29, 1.44, 0.02).col(1).L(0.27, 1.48, 0.02).col(0).L(0.14, 1.5, 0.03).L(0.12, 1.53, 0.02);
      p.col(1).A(0, 1.6, 0.09, ACOS(0.08, 0.09), PI / 2, 14);
    }
  }
  return {
    prof: p,
    palette,
    rough: 0.32,
    coat: 0.8,
    deco: (pts, gold) => {
      const H = pts[pts.length - 1]!.y;
      if (kind === 0) return goldRing(14, radiusAt(pts, 0.045 * (H / 1.25)) + 0.008, 0.045 * (H / 1.25), 0.022, gold);
      if (kind === 1) {
        const yc = pts.find((q) => q.y > H * 0.88)?.y ?? H * 0.9;
        return goldRing(8, radiusAt(pts, yc) * 0.97, yc + 0.02, 0.045, gold);
      }
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.26, 0.07), gold);
      v.position.y = H + 0.1;
      const hz = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.07), gold);
      hz.position.y = H + 0.13;
      v.castShadow = hz.castShadow = true;
      return [v, hz];
    },
  };
}

function potSpec(rng: () => number): PieceSpec {
  const pals = [
    [0xc8643c, 0xf3e2c4, 0x4a3222],
    [0xf2a0a8, 0xfff3e6, 0x4a3222],
    [0x6fa8dc, 0xfdf3d8, 0x4a3222],
  ];
  const palette = pals[Math.floor(rng() * pals.length)]!;
  const p = new Prof();
  p.L(0, 0, 0).L(0.33, 0, 0.02).L(0.35, 0.04, 0.02).L(0.33, 0.07, 0.01).L(0.36, 0.09, 0.01);
  p.L(0.42, 0.3, 0.02).col(1).L(0.455, 0.32, 0.01).L(0.455, 0.36, 0.01).col(0).L(0.435, 0.38, 0.01);
  p.L(0.5, 0.62, 0.02).L(0.6, 0.65, 0.03).L(0.61, 0.78, 0.03).L(0.55, 0.8, 0.02).L(0.52, 0.74, 0.01).L(0.5, 0.69, 0.02);
  p.col(2).L(0.49, 0.67, 0.02).L(0, 0.67, 0);
  return {
    prof: p,
    palette,
    rough: palette[0] === 0xc8643c ? 0.75 : 0.4,
    coat: palette[0] === 0xc8643c ? 0 : 0.6,
    deco: (pts, gold, rng2) => {
      const out: THREE.Object3D[] = [];
      const yd = pts[pts.length - 1]!.y * 0.66;
      const cream = new THREE.MeshStandardMaterial({ color: palette[1]!, roughness: 0.5 });
      out.push(...goldRing(12, radiusAt(pts, yd) + 0.006, yd, 0.024, cream));
      const top = pts[pts.length - 1]!.y;
      const green = new THREE.MeshStandardMaterial({ color: 0x5fae4a, roughness: 0.6 });
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.26, 8), green);
      stem.position.y = top + 0.13;
      out.push(stem);
      for (const s of [-1, 1]) {
        const lf = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), green);
        lf.scale.set(0.13, 0.022, 0.06);
        lf.position.set(s * 0.1, top + 0.1 + (s > 0 ? 0.05 : 0), 0);
        lf.rotation.z = s * 0.45;
        lf.castShadow = true;
        out.push(lf);
      }
      const petal = new THREE.MeshStandardMaterial({ color: [0xfff6e8, 0xffd84d, 0xff9ec0][Math.floor(rng2() * 3)]!, roughness: 0.5 });
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU;
        const pm = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), petal);
        pm.scale.set(0.05, 0.014, 0.026);
        pm.position.set(Math.cos(a) * 0.05, top + 0.27, Math.sin(a) * 0.05);
        pm.rotation.y = -a;
        out.push(pm);
      }
      const ctr = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 8), gold);
      ctr.position.y = top + 0.28;
      out.push(ctr);
      return out;
    },
  };
}

function vaseSpec(rng: () => number): PieceSpec {
  const pals = [
    [0x3d6fb6, 0xe9b949, 0xf4f1ea, 0x1a2338],
    [0x8fc7ad, 0xe9b949, 0xfdf8ec, 0x1f3328],
    [0xa98bd9, 0xf6d36b, 0xfaf4ff, 0x2a2140],
  ];
  const palette = pals[Math.floor(rng() * pals.length)]!;
  const p = new Prof();
  p.L(0, 0, 0).L(0.28, 0, 0.02).L(0.3, 0.05, 0.02).col(1).L(0.26, 0.08, 0.01).col(0).L(0.25, 0.1, 0.01);
  const band = (y: number): number => (y > 0.5 && y < 0.55 ? 1 : y > 0.3 && y < 0.37 ? 2 : y > 0.68 && y < 0.73 ? 2 : 0);
  p.S(
    [
      [0.25, 0.1],
      [0.34, 0.25],
      [0.46, 0.5],
      [0.43, 0.72],
      [0.3, 0.9],
      [0.19, 1.05],
      [0.18, 1.15],
      [0.24, 1.28],
    ],
    10,
    band,
  );
  p.col(1).L(0.29, 1.32, 0.02).L(0.27, 1.36, 0.02).col(0).L(0.21, 1.33, 0.02).L(0.17, 1.2, 0.03).col(3).L(0, 1.18, 0);
  return {
    prof: p,
    palette,
    rough: 0.22,
    coat: 1,
    deco: (pts, gold) => {
      const out: THREE.Object3D[] = [];
      const sy = pts[pts.length - 1]!.y / 1.18;
      for (const s of [-1, 1]) {
        const r1 = radiusAt(pts, 1.02 * sy);
        const r2 = radiusAt(pts, 0.68 * sy);
        const cv = new THREE.CatmullRomCurve3([
          new THREE.Vector3(s * (r1 - 0.01), 1.02 * sy, 0),
          new THREE.Vector3(s * (r1 + 0.16), 1.0 * sy, 0),
          new THREE.Vector3(s * (r2 + 0.16), 0.82 * sy, 0),
          new THREE.Vector3(s * (r2 - 0.01), 0.66 * sy, 0),
        ]);
        const hm = new THREE.Mesh(new THREE.TubeGeometry(cv, 32, 0.028, 10), gold);
        hm.castShadow = true;
        out.push(hm);
      }
      // 꽃병에 꽂힌 튤립 — 꽃 머리도 작은 회전체
      const green = new THREE.MeshStandardMaterial({ color: 0x4f9e44, roughness: 0.6 });
      const top = 1.2 * sy;
      const sc = new THREE.CatmullRomCurve3([new THREE.Vector3(0, top - 0.05, 0), new THREE.Vector3(0.03, top + 0.25, 0.02), new THREE.Vector3(0.08, top + 0.5, 0)]);
      out.push(new THREE.Mesh(new THREE.TubeGeometry(sc, 20, 0.012, 6), green));
      const tp = new Prof().L(0, 0, 0).L(0.06, 0.01, 0.03).L(0.1, 0.08, 0.04).L(0.09, 0.17, 0.02).L(0.065, 0.2, 0).build();
      const tm = new THREE.Mesh(new THREE.LatheGeometry(tp.pts, 24), new THREE.MeshPhysicalMaterial({ color: 0xff6f91, roughness: 0.4, clearcoat: 0.6, side: THREE.DoubleSide }));
      tm.position.set(0.08, top + 0.48, 0);
      tm.castShadow = true;
      out.push(tm);
      const lf = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), green);
      lf.scale.set(0.11, 0.02, 0.04);
      lf.position.set(0.06, top + 0.2, 0.02);
      lf.rotation.z = 0.8;
      out.push(lf);
      return out;
    },
  };
}

type Piece = {
  root: THREE.Group;
  mesh: THREE.Mesh;
  line: THREE.Group;
  tube: THREE.Mesh;
  tip: THREE.Mesh;
  axis: THREE.Mesh;
  decos: THREE.Object3D[];
  perSeg: number;
  segs: number;
  tubeSegs: number;
  tris: number;
  npts: number;
  mat: THREE.MeshPhysicalMaterial;
};

function latheDemo(): Scene3D {
  const scene = new THREE.Scene();
  const bg = bgTex('#1b2140', '#3c4a7a');
  scene.background = bg;
  addLights(scene, { sky: 0xe4ecff, ground: 0x5a4a40, hemi: 1.0, sun: 2.4, dir: [-3, 6, 4], ext: 3 });
  const env = new Env();
  const camera = new THREE.PerspectiveCamera(36, 1.6, 0.1, 50);
  // 체스판 바닥
  const cc = document.createElement('canvas');
  cc.width = cc.height = 128;
  const g2 = cc.getContext('2d')!;
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++) {
      g2.fillStyle = (i + j) % 2 ? '#93b3a0' : '#efe4cf';
      g2.fillRect(i * 64, j * 64, 64, 64);
    }
  const ct = new THREE.CanvasTexture(cc);
  ct.colorSpace = THREE.SRGBColorSpace;
  ct.wrapS = ct.wrapT = THREE.RepeatWrapping;
  ct.repeat.set(6, 3);
  ct.anisotropy = 4;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 2.4), new THREE.MeshStandardMaterial({ map: ct, roughness: 0.55 }));
  board.rotation.x = -PI / 2;
  board.receiveShadow = true;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(5.04, 0.14, 2.64), new THREE.MeshStandardMaterial({ color: 0x7a4e33, roughness: 0.5 }));
  frame.position.y = -0.071;
  frame.receiveShadow = true;
  scene.add(board, frame);

  const gold = new THREE.MeshPhysicalMaterial({ color: 0xf0c050, metalness: 0.7, roughness: 0.28, clearcoat: 0.5 });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffd84a, toneMapped: false, transparent: true });
  const tipMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true });
  const axisMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, toneMapped: false });

  let pieces: Piece[] = [];
  let seed = 7;
  let segs = 64;
  let anim = true;
  let showLine = true;
  let wire = false;
  let deco = true;
  let buildMs = 0;
  const tags = new Tags(2, ['rgba(12,16,34,0.72)', 'rgba(70,40,120,0.78)']);

  const job = new Job();
  const warm = new Warm();
  function build(): void {
    for (const p of pieces) {
      scene.remove(p.root);
      freeAll(p.root);
    }
    pieces = [];
    job.start(buildG(pieces));
  }
  // 말 하나씩 나눠 만든다 (프레임마다 3ms)
  function* buildG(list: Piece[]): G {
    const rng = rngOf(seed);
    const specs = [chessSpec(rng), potSpec(rng), vaseSpec(rng)];
    for (let k = 0; k < specs.length; k++) {
      const sp = specs[k]!;
      const sx = 0.92 + rng() * 0.16;
      const sy = 0.92 + rng() * 0.16;
      const { pts, cols } = sp.prof.build(sx, sy);
      const geo = new THREE.LatheGeometry(pts, segs);
      if (late()) yield;
      const n = pts.length;
      const pal = sp.palette.map((c) => new THREE.Color(c));
      const col = new Float32Array((segs + 1) * n * 3);
      for (let i = 0; i <= segs; i++)
        for (let j = 0; j < n; j++) {
          const c = pal[cols[j]!] ?? pal[0]!;
          const o = (i * n + j) * 3;
          col[o] = c.r;
          col[o + 1] = c.g;
          col[o + 2] = c.b;
        }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      if (late()) yield;
      const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: sp.rough, clearcoat: sp.coat, clearcoatRoughness: 0.2, side: THREE.DoubleSide, wireframe: wire });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const root = new THREE.Group();
      root.position.set((k - 1) * 1.45, 0, k === 1 ? 0.15 : 0);
      root.add(mesh);
      // 윤곽선 (phi = 0 자리) — 그려지고, 돌아간다
      const line = new THREE.Group();
      const curve = new THREE.CatmullRomCurve3(
        pts.map((q) => new THREE.Vector3(0, q.y, q.x)),
        false,
        'centripetal',
      );
      const tubeSegs = 240;
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, tubeSegs, 0.018, 6), lineMat);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), tipMat);
      line.add(tube, tip);
      if (late()) yield;
      const H = pts[n - 1]!.y;
      const axis = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, H + 0.3, 6), axisMat);
      axis.position.y = (H + 0.3) / 2 - 0.05;
      root.add(line, axis);
      if (late()) yield;
      const decos = sp.deco(pts, gold, rng);
      for (const d of decos) {
        d.userData.s = d.scale.clone();
        root.add(d);
      }
      if (list !== pieces) {
        freeAll(root);
        return;
      }
      warm.add(root, scene, () => list === pieces);
      pieces.push({ root, mesh, line, tube, tip, axis, decos, perSeg: (n - 1) * 6, segs, tubeSegs, tris: segs * (n - 1) * 2, npts: n, mat });
      (tube.userData as { curve?: THREE.Curve<THREE.Vector3> }).curve = curve;
      if (late()) yield;
    }
    buildMs = job.spent;
  }
  build();

  const CYC = 6.6;
  let stage = 0;
  return {
    scene,
    camera,
    update(t) {
      if (job.busy) job.step();
      camera.position.set(Math.sin(t * 0.2) * 0.6, 1.95, 5.0);
      camera.lookAt(0, 0.68, 0);
      pieces.forEach((p, k) => {
        const lt = anim ? (t + 100 * CYC - k * 0.35) % CYC : 4.5;
        if (k === 0) stage = lt < 1.45 ? 0 : lt < 3.05 ? 1 : 2;
        const drawP = smooth(0.1, 1.4, lt);
        const sweep = easeIO(sat((lt - 1.5) / 1.5));
        const g = p.mesh.geometry;
        const cnt = Math.ceil(sweep * p.segs) * p.perSeg;
        g.setDrawRange(0, cnt);
        p.mesh.visible = cnt > 0;
        const tg = p.tube.geometry;
        tg.setDrawRange(0, Math.floor(drawP * p.tubeSegs) * 36);
        p.line.rotation.y = sweep * TAU;
        const lineA = 1 - smooth(3.0, 3.5, lt);
        p.line.visible = showLine && lineA > 0.01;
        p.axis.visible = showLine && lineA > 0.01;
        lineMat.opacity = 1;
        p.tip.visible = drawP > 0 && drawP < 1;
        const curve = (p.tube.userData as { curve?: THREE.Curve<THREE.Vector3> }).curve;
        if (curve && p.tip.visible) p.tip.position.copy(curve.getPointAt(Math.min(drawP, 1)));
        p.decos.forEach((d, i) => {
          const s = deco ? easeBack(sat((lt - 3.1 - i * 0.05) / 0.35)) : 0;
          const b = d.userData.s as THREE.Vector3;
          d.scale.set(b.x * s + 1e-4, b.y * s + 1e-4, b.z * s + 1e-4);
          d.visible = s > 0.001;
        });
        const sh = lt > CYC - 0.45 ? 1 - easeIO((lt - (CYC - 0.45)) / 0.45) : 1;
        p.root.scale.setScalar(Math.max(0.001, sh));
        p.root.rotation.y = t * 0.25 + k;
      });
      tags.set(0, `삼각형 ${fmt(pieces.reduce((a, p) => a + p.tris, 0))} · 윤곽 점 ${pieces.reduce((a, p) => a + p.npts, 0)}개 · 만들기 ${buildMs.toFixed(1)}ms`);
      tags.set(1, ['① 윤곽선 한 줄 그리기', '② 축을 따라 360° 돌리기', '③ 장식 달기 — 테 · 홈 · 받침은 윤곽에서'][stage]!);
    },
    render(r, w, h) {
      env.apply(r, scene, 0.45);
      if (warm.tick(r, scene, camera, 0x2a3358)) shadowed(r, () => r.render(scene, camera));
      tags.draw(r, w, h, [
        [0.02, 0.06, -1],
        [0.5, 0.92, 0],
      ]);
    },
    controls: [
      { type: 'toggle', label: '과정 보기 (그리기 → 돌리기)', value: true, on: (v) => (anim = v) },
      { type: 'toggle', label: '윤곽선 보기', value: true, on: (v) => (showLine = v) },
      { type: 'toggle', label: '장식 달기', value: true, on: (v) => (deco = v) },
      {
        type: 'toggle',
        label: '와이어프레임',
        value: false,
        on: (v) => {
          wire = v;
          for (const p of pieces) p.mat.wireframe = v;
        },
      },
      {
        type: 'range',
        label: '둘레 조각 수',
        min: 6,
        max: 96,
        step: 2,
        value: 64,
        on: (v) => {
          segs = v;
          build();
        },
      },
      {
        type: 'button',
        label: '새로 만들기',
        on: () => {
          seed = (seed * 7919 + 13) % 100000;
          build();
        },
      },
    ] as Control[],
    dispose() {
      for (const p of pieces) freeAll(p.root);
      freeAll(board);
      freeAll(frame);
      ct.dispose();
      gold.dispose();
      lineMat.dispose();
      tipMat.dispose();
      axisMat.dispose();
      bg.dispose();
      env.dispose();
      tags.dispose();
    },
  };
}

/* ───────────── i451 CSG 불리언 (작은 BSP — csg.js 방식) ───────────── */

interface CV {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
}
interface CPoly {
  v: CV[];
  c: number;
  nx: number;
  ny: number;
  nz: number;
  w: number;
}
interface CPlane {
  nx: number;
  ny: number;
  nz: number;
  w: number;
}
const CEPS = 1e-5;
function makePoly(v: CV[], c: number): CPoly | null {
  const a = v[0]!;
  const b = v[1]!;
  const d = v[2]!;
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const uz = b.z - a.z;
  const vx = d.x - a.x;
  const vy = d.y - a.y;
  const vz = d.z - a.z;
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz);
  if (l < 1e-12) return null;
  nx /= l;
  ny /= l;
  nz /= l;
  return { v, c, nx, ny, nz, w: nx * a.x + ny * a.y + nz * a.z };
}
function flipPoly(p: CPoly): CPoly {
  return {
    v: p.v
      .slice()
      .reverse()
      .map((q) => ({ x: q.x, y: q.y, z: q.z, nx: -q.nx, ny: -q.ny, nz: -q.nz })),
    c: p.c,
    nx: -p.nx,
    ny: -p.ny,
    nz: -p.nz,
    w: -p.w,
  };
}
function lerpV(a: CV, b: CV, t: number): CV {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, nx: a.nx + (b.nx - a.nx) * t, ny: a.ny + (b.ny - a.ny) * t, nz: a.nz + (b.nz - a.nz) * t };
}
function splitPoly(pl: CPlane, p: CPoly, cf: CPoly[], cb: CPoly[], f: CPoly[], b: CPoly[]): void {
  let type = 0;
  const types: number[] = [];
  for (const v of p.v) {
    const t = pl.nx * v.x + pl.ny * v.y + pl.nz * v.z - pl.w;
    const tt = t < -CEPS ? 2 : t > CEPS ? 1 : 0;
    type |= tt;
    types.push(tt);
  }
  if (type === 0) (pl.nx * p.nx + pl.ny * p.ny + pl.nz * p.nz > 0 ? cf : cb).push(p);
  else if (type === 1) f.push(p);
  else if (type === 2) b.push(p);
  else {
    const fv: CV[] = [];
    const bv: CV[] = [];
    const n = p.v.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ti = types[i]!;
      const tj = types[j]!;
      const vi = p.v[i]!;
      const vj = p.v[j]!;
      if (ti !== 2) fv.push(vi);
      if (ti !== 1) bv.push(vi);
      if ((ti | tj) === 3) {
        const den = pl.nx * (vj.x - vi.x) + pl.ny * (vj.y - vi.y) + pl.nz * (vj.z - vi.z);
        const t = (pl.w - (pl.nx * vi.x + pl.ny * vi.y + pl.nz * vi.z)) / den;
        const v = lerpV(vi, vj, t);
        fv.push(v);
        bv.push(v);
      }
    }
    if (fv.length >= 3) f.push({ v: fv, c: p.c, nx: p.nx, ny: p.ny, nz: p.nz, w: p.w });
    if (bv.length >= 3) b.push({ v: bv, c: p.c, nx: p.nx, ny: p.ny, nz: p.nz, w: p.w });
  }
}
class CNode {
  plane: CPlane | null = null;
  front: CNode | null = null;
  back: CNode | null = null;
  polys: CPoly[] = [];
  invert(): void {
    this.polys = this.polys.map(flipPoly);
    if (this.plane) this.plane = { nx: -this.plane.nx, ny: -this.plane.ny, nz: -this.plane.nz, w: -this.plane.w };
    this.front?.invert();
    this.back?.invert();
    const t = this.front;
    this.front = this.back;
    this.back = t;
  }
  all(out: CPoly[] = []): CPoly[] {
    for (const p of this.polys) out.push(p);
    this.front?.all(out);
    this.back?.all(out);
    return out;
  }
}
/* 작은 덩어리는 보통 함수로 (생성기 부담 줄이기) */
function buildSync(n: CNode, polys: CPoly[]): void {
  if (!polys.length) return;
  if (!n.plane) {
    const p = polys[0]!;
    n.plane = { nx: p.nx, ny: p.ny, nz: p.nz, w: p.w };
  }
  const f: CPoly[] = [];
  const b: CPoly[] = [];
  for (const p of polys) splitPoly(n.plane, p, n.polys, n.polys, f, b);
  if (f.length) buildSync((n.front ??= new CNode()), f);
  if (b.length) buildSync((n.back ??= new CNode()), b);
}
function clipSync(n: CNode, polys: CPoly[]): CPoly[] {
  if (!n.plane) return polys.slice();
  let f: CPoly[] = [];
  let b: CPoly[] = [];
  for (const p of polys) splitPoly(n.plane, p, f, b, f, b);
  if (n.front) f = clipSync(n.front, f);
  b = n.back ? clipSync(n.back, b) : [];
  for (const p of b) f.push(p);
  return f;
}
const SMALL = 48;
/* BSP 연산은 생성기 — 깊은 재귀 안에서도 시간이 다 되면 쉰다 */
function* gBuild(n: CNode, polys: CPoly[]): G {
  if (polys.length < SMALL) {
    buildSync(n, polys);
    return;
  }
  if (late()) yield;
  if (!n.plane) {
    const p = polys[0]!;
    n.plane = { nx: p.nx, ny: p.ny, nz: p.nz, w: p.w };
  }
  const f: CPoly[] = [];
  const b: CPoly[] = [];
  for (let i = 0; i < polys.length; i++) {
    splitPoly(n.plane, polys[i]!, n.polys, n.polys, f, b);
    if ((i & 63) === 63 && late()) yield;
  }
  if (f.length) yield* gBuild((n.front ??= new CNode()), f);
  if (b.length) yield* gBuild((n.back ??= new CNode()), b);
}
function* gClipPolys(n: CNode, polys: CPoly[]): G<CPoly[]> {
  if (!n.plane || polys.length < SMALL) return clipSync(n, polys);
  if (late()) yield;
  let f: CPoly[] = [];
  let b: CPoly[] = [];
  for (let i = 0; i < polys.length; i++) {
    splitPoly(n.plane, polys[i]!, f, b, f, b);
    if ((i & 63) === 63 && late()) yield;
  }
  if (n.front) f = yield* gClipPolys(n.front, f);
  b = n.back ? yield* gClipPolys(n.back, b) : [];
  for (const p of b) f.push(p);
  return f;
}
function* gClipTo(n: CNode, bsp: CNode): G {
  n.polys = yield* gClipPolys(bsp, n.polys);
  if (late()) yield;
  if (n.front) yield* gClipTo(n.front, bsp);
  if (n.back) yield* gClipTo(n.back, bsp);
}
function* gNode(polys: CPoly[]): G<CNode> {
  const n = new CNode();
  yield* gBuild(n, polys);
  return n;
}
function* csgUnion(a: CPoly[], b: CPoly[]): G<CPoly[]> {
  const A = yield* gNode(a);
  const B = yield* gNode(b);
  yield* gClipTo(A, B);
  yield* gClipTo(B, A);
  B.invert();
  yield* gClipTo(B, A);
  B.invert();
  yield* gBuild(A, B.all());
  return A.all();
}
function* csgSub(a: CPoly[], b: CPoly[]): G<CPoly[]> {
  const A = yield* gNode(a);
  const B = yield* gNode(b);
  A.invert();
  yield* gClipTo(A, B);
  yield* gClipTo(B, A);
  B.invert();
  yield* gClipTo(B, A);
  B.invert();
  yield* gBuild(A, B.all());
  A.invert();
  return A.all();
}
function* csgInt(a: CPoly[], b: CPoly[]): G<CPoly[]> {
  const A = yield* gNode(a);
  const B = yield* gNode(b);
  A.invert();
  yield* gClipTo(B, A);
  B.invert();
  yield* gClipTo(A, B);
  yield* gClipTo(B, A);
  yield* gBuild(A, B.all());
  A.invert();
  return A.all();
}
function polysFrom(geo: THREE.BufferGeometry, m: THREE.Matrix4, c: number): CPoly[] {
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const idx = geo.getIndex();
  const nm = new THREE.Matrix3().getNormalMatrix(m);
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const vert = (i: number): CV => {
    v.fromBufferAttribute(pos, i).applyMatrix4(m);
    n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
    return { x: v.x, y: v.y, z: v.z, nx: n.x, ny: n.y, nz: n.z };
  };
  const out: CPoly[] = [];
  const cnt = idx ? idx.count : pos.count;
  for (let k = 0; k < cnt; k += 3) {
    const i0 = idx ? idx.getX(k) : k;
    const i1 = idx ? idx.getX(k + 1) : k + 1;
    const i2 = idx ? idx.getX(k + 2) : k + 2;
    const p = makePoly([vert(i0), vert(i1), vert(i2)], c);
    if (p) out.push(p);
  }
  return out;
}
function* geoFrom(polys: CPoly[], pal: THREE.Color[]): G<THREE.BufferGeometry> {
  const P: number[] = [];
  const N: number[] = [];
  const C: number[] = [];
  for (let pi = 0; pi < polys.length; pi++) {
    const p = polys[pi]!;
    if ((pi & 255) === 255 && late()) yield;
    const col = pal[p.c] ?? pal[0]!;
    for (let i = 1; i < p.v.length - 1; i++)
      for (const q of [p.v[0]!, p.v[i]!, p.v[i + 1]!]) {
        P.push(q.x, q.y, q.z);
        const l = Math.hypot(q.nx, q.ny, q.nz) || 1;
        N.push(q.nx / l, q.ny / l, q.nz / l);
        C.push(col.r, col.g, col.b);
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  return g;
}

type Op = { geo: THREE.BufferGeometry; pos: THREE.Vector3; ry: number; c: number; from: THREE.Vector3; ghost: THREE.Mesh; solid: THREE.Material; glass: THREE.Material };

function csgDemo(): Scene3D {
  const scene = new THREE.Scene();
  const bg = bgTex('#1a2a44', '#456b8a');
  scene.background = bg;
  addLights(scene, { sky: 0xe8f0ff, ground: 0x4f6a3a, hemi: 0.75, sun: 3.0, dir: [-4, 6, 4.5], ext: 3.2 });
  const env = new Env();
  const camera = new THREE.PerspectiveCamera(38, 1.6, 0.1, 50);
  const turf = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.8, 0.16, 72), new THREE.MeshStandardMaterial({ color: 0x8cc66a, roughness: 0.95 }));
  turf.position.set(0.1, -0.08, 0);
  turf.receiveShadow = true;
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.6, 0.3, 72), new THREE.MeshStandardMaterial({ color: 0x7a5236, roughness: 1 }));
  soil.position.set(0.1, -0.31, 0);
  scene.add(turf, soil);
  const world = new THREE.Group();
  scene.add(world);
  const resMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, emissive: 0xffffff, emissiveIntensity: 0 });
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  const tags = new Tags(2, ['rgba(12,16,34,0.72)', 'rgba(150,40,70,0.82)']);

  let seed = 3;
  let nWin = 3;
  let opOn = true;
  let wire = false;
  let ms = 0;
  let tris = 0;
  let group = new THREE.Group();
  let houseOps: Op[] = [];
  let cutOps: Op[] = [];
  let diceOps: Op[] = [];
  let pipOps: Op[] = [];
  let resU: THREE.Mesh | null = null;
  let resS: THREE.Mesh | null = null;
  let resI: THREE.Mesh | null = null;
  let resF: THREE.Mesh | null = null;
  let cone: THREE.Mesh | null = null;
  let dice = new THREE.Group();
  const job = new Job();
  const warm = new Warm();
  let t00 = -1;

  function build(): void {
    job.start(buildG());
  }
  // 재료 모양 → (셰이더 미리 굽기) → 불리언 연산, 모두 나눠서
  function* buildG(): G {
    for (const o of [...houseOps, ...cutOps, ...diceOps, ...pipOps]) {
      o.solid.dispose();
      o.glass.dispose();
    }
    world.remove(group);
    freeAll(group);
    group = new THREE.Group();
    dice = new THREE.Group();
    cone = null;
    resU = resS = resI = resF = null;
    houseOps = cutOps = diceOps = pipOps = [];
    const rng = rngOf(seed);
    const pick = <T,>(a: T[]): T => a[Math.floor(rng() * a.length)]!;
    const roofC = pick([0xe46a5e, 0x4fa3a5, 0x5b7fd6, 0x9a5fb5]);
    const pal = [pick([0xf7ead0, 0xfbe3a8, 0xf9d6d0, 0xd6f0e0]), roofC, 0xb8644a, 0xe6dcf5, 0x3a2a22, 0xd8b98a, 0x2f4f7a, 0xfdf8ef, 0x2b3a67, 0xe0443e].map((c) => new THREE.Color(c));
    const mk = (geo: THREE.BufferGeometry, x: number, y: number, z: number, c: number, from: [number, number, number], glassC: number, ry = 0): Op => {
      const glass = new THREE.MeshStandardMaterial({ color: glassC, transparent: true, opacity: 0.4, depthWrite: false, roughness: 0.3 });
      const solid = new THREE.MeshStandardMaterial({ color: pal[c]!.getHex(), roughness: 0.6 });
      const ghost = new THREE.Mesh(geo, glass);
      ghost.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), edgeMat));
      ghost.rotation.y = ry;
      return { geo, pos: new THREE.Vector3(x, y, z), ry, c, from: new THREE.Vector3(...from), ghost, solid, glass };
    };
    const M = (o: Op): THREE.Matrix4 => new THREE.Matrix4().compose(o.pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, o.ry, 0)), new THREE.Vector3(1, 1, 1));
    const roofShape = new THREE.Shape([new THREE.Vector2(-0.68, 0), new THREE.Vector2(0.68, 0), new THREE.Vector2(0, 0.62)]);
    const roofG = new THREE.ExtrudeGeometry(roofShape, { depth: 1.72, bevelEnabled: false }).translate(0, 0, -0.86).rotateY(PI / 2);
    houseOps = [
      mk(new THREE.BoxGeometry(1.5, 1.0, 1.1), -0.7, 0.5, 0, 0, [0, 0, 0], pal[0]!.getHex()),
      mk(roofG, -0.7, 0.98, 0, 1, [0, 0.9, 0], roofC),
      mk(new THREE.BoxGeometry(0.2, 0.55, 0.2), -1.1, 1.38, -0.18, 2, [0, 1.4, 0], 0xb8644a),
      mk(new THREE.CylinderGeometry(0.36, 0.36, 1.6, 40), 0.1, 0.8, 0.12, 3, [1.0, 0, 0], 0xe6dcf5),
    ];
    // 빼는 모양: 속 비우기 · 아치 문 · 창
    const archBox = (w: number, h: number): THREE.BufferGeometry => new THREE.BoxGeometry(w, h, 0.4);
    const archCyl = (r: number): THREE.BufferGeometry => new THREE.CylinderGeometry(r, r, 0.4, 28).rotateX(PI / 2);
    const red = 0xff5a6a;
    cutOps = [mk(new THREE.BoxGeometry(1.3, 0.8, 0.9), -0.7, 0.5, 0, 4, [0, 0, 0], 0xffb0b0)];
    cutOps.push(mk(archBox(0.3, 0.36), -0.95, 0.17, 0.55, 5, [0, 0, 0.9], red), mk(archCyl(0.15), -0.95, 0.35, 0.55, 5, [0, 0, 0.9], red));
    const wins: (() => Op[])[] = [
      () => [mk(archBox(0.22, 0.2), -0.42, 0.48, 0.55, 5, [0, 0, 0.9], red), mk(archCyl(0.11), -0.42, 0.58, 0.55, 5, [0, 0, 0.9], red)],
      () => [mk(archBox(0.2, 0.18), -1.25, 0.5, 0.55, 5, [0, 0, 0.9], red), mk(archCyl(0.1), -1.25, 0.59, 0.55, 5, [0, 0, 0.9], red)],
      () => [mk(new THREE.CylinderGeometry(0.14, 0.14, 0.4, 28).rotateZ(PI / 2), -1.45, 0.55, 0, 5, [-0.9, 0, 0], red)],
      () => [mk(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 28).rotateX(PI / 2), 0.1, 1.22, 0.48, 6, [0, 0, 0.9], red)],
    ];
    yield;
    const order = [0, 1, 2, 3].sort(() => rng() - 0.5);
    for (let i = 0; i < nWin; i++) cutOps.push(...wins[order[i]!]!());
    yield;
    const dcube = mk(new THREE.BoxGeometry(0.7, 0.7, 0.7, 1, 1, 1), 0, 0, 0, 7, [0, 0, 0], 0x7fb2ff);
    const dsph = mk(new THREE.SphereGeometry(0.485, 30, 20), 0, 0, 0, 7, [0, 0, 0], 0xffd36e);
    diceOps = [dcube, dsph];
    const pipAt: [number, number, number, number][] = [
      [0, 0.37, 0, 9],
      [-0.15, 0.15, 0.37, 8],
      [0.15, -0.15, 0.37, 8],
      [0.37, 0.17, -0.17, 8],
      [0.37, 0, 0, 8],
      [0.37, -0.17, 0.17, 8],
    ];
    pipOps = pipAt.map(([x, y, z, c]) => {
      const n = new THREE.Vector3(Math.abs(x) > 0.3 ? 1 : 0, Math.abs(y) > 0.3 ? 1 : 0, Math.abs(z) > 0.3 ? 1 : 0).multiplyScalar(0.4);
      return mk(new THREE.SphereGeometry(0.08, 18, 12), x, y, z, c, [n.x, n.y, n.z], red);
    });
    yield;
    dice.position.set(1.35, 0.35, 0.25);
    dice.rotation.y = 0.6;
    group.add(dice);
    resU = resS = resI = resF = null;
    cone = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.62, 40), new THREE.MeshStandardMaterial({ color: new THREE.Color(roofC).multiplyScalar(0.85), roughness: 0.5 }));
    cone.position.set(0.1, 1.91, 0.12);
    cone.castShadow = true;
    group.add(cone);
    for (const o of [...houseOps, ...cutOps]) group.add(o.ghost);
    for (const o of [...diceOps, ...pipOps]) dice.add(o.ghost);
    hiddenUsers(group, [resMat, ...[...houseOps, ...cutOps, ...diceOps, ...pipOps].flatMap((o) => [o.solid, o.glass])]);
    const g0 = group;
    warm.add(group, world, () => group === g0);
    // 연산은 나눠서 (프레임마다 3ms)
    yield* (function* (): G {
        let A = polysFrom(houseOps[0]!.geo, M(houseOps[0]!), 0);
        for (let i = 1; i < houseOps.length; i++) A = yield* csgUnion(A, polysFrom(houseOps[i]!.geo, M(houseOps[i]!), houseOps[i]!.c));
        let cut = polysFrom(cutOps[0]!.geo, M(cutOps[0]!), cutOps[0]!.c);
        for (let i = 1; i < cutOps.length; i++) cut = yield* csgUnion(cut, polysFrom(cutOps[i]!.geo, M(cutOps[i]!), cutOps[i]!.c));
        const S = yield* csgSub(A, cut);
        const I = yield* csgInt(polysFrom(dcube.geo, M(dcube), 7), polysFrom(dsph.geo, M(dsph), 7));
        let pips = polysFrom(pipOps[0]!.geo, M(pipOps[0]!), pipOps[0]!.c);
        for (let i = 1; i < pipOps.length; i++) pips = yield* csgUnion(pips, polysFrom(pipOps[i]!.geo, M(pipOps[i]!), pipOps[i]!.c));
        const F = yield* csgSub(I, pips);
        if (group !== g0) return;
        const mesh = function* (polys: CPoly[], parent: THREE.Object3D): G<THREE.Mesh> {
          const m = new THREE.Mesh(yield* geoFrom(polys, pal), resMat);
          m.castShadow = m.receiveShadow = true;
          warm.add(m, parent);
          return m;
        };
        const mU = yield* mesh(A, group);
        const mS = yield* mesh(S, group);
        const mI = yield* mesh(I, dice);
        const mF = yield* mesh(F, dice);
        resU = mU;
        resS = mS;
        resI = mI;
        resF = mF;
        tris = triCount(resS.geometry) + triCount(resF.geometry);
        ms = job.spent;
        t00 = -1;
      })();
    resMat.wireframe = wire;
  }
  build();

  const CYC = 11;
  let lastSwitch = 0;
  let lastState = -1;
  function place(o: Op, k: number, show: boolean, solid: boolean, scale = 1): void {
    o.ghost.visible = show;
    if (!show) return;
    o.ghost.position.copy(o.pos).addScaledVector(o.from, 1 - k);
    o.ghost.scale.setScalar(scale);
    o.ghost.material = solid ? o.solid : o.glass;
    (o.ghost.children[0] as THREE.Object3D).visible = !solid;
    o.ghost.castShadow = solid;
  }
  let label = '';
  return {
    scene,
    camera,
    update(t) {
      camera.position.set(0.35 + Math.sin(t * 0.18) * 0.6, 2.5, 5.8);
      camera.lookAt(0.2, 0.7, 0);
      world.rotation.y = Math.sin(t * 0.3) * 0.18;
      if (job.busy) job.step();
      if (!cone || !group.parent) {
        label = '재료 모양 만드는 중…';
        return;
      }
      const ready = !!(resU && resS && resI && resF) && !warm.pending;
      if (!opOn || !ready) {
        for (const o of houseOps) place(o, 1, true, true);
        for (const o of cutOps) place(o, 1, o !== cutOps[0], true);
        for (const o of diceOps) place(o, 1, true, true);
        for (const o of pipOps) place(o, 1, true, true);
        if (resU) resU.visible = false;
        if (resS) resS.visible = false;
        if (resI) resI.visible = false;
        if (resF) resF.visible = false;
        cone!.visible = true;
        label = ready ? '불리언 끔 — 그냥 겹쳐 놓기 (구멍이 안 뚫림)' : `모양 연산 중… 나눠서 굽는 중 (${job.spent.toFixed(0)}ms)`;
        return;
      }
      if (t00 < 0) t00 = t;
      const p = (t - t00) % CYC;
      const uK = easeIO(sat((p - 0.3) / 1.5));
      for (const o of houseOps) place(o, uK, p < 2.2, false);
      const cK = easeIO(sat((p - 2.8) / 1.4));
      for (const o of cutOps) place(o, cK, p >= 2.6 && p < 4.9, false);
      const sK = lerp(0.3, 1, easeIO(sat((p - 5.6) / 1.2)));
      place(diceOps[0]!, 1, p >= 5.4 && p < 7.2, false);
      place(diceOps[1]!, 1, p >= 5.4 && p < 7.2, false, sK);
      const pK = easeIO(sat((p - 8.2) / 0.7));
      pipOps.forEach((o, i) => place(o, pK, p >= 8.0 + i * 0.05 && p < 9.0, false, easeBack(sat((p - 8.0 - i * 0.05) / 0.4))));
      resU!.visible = p >= 2.2 && p < 4.6;
      resS!.visible = p >= 4.6;
      resI!.visible = p >= 7.2 && p < 9.0;
      resF!.visible = p >= 9.0;
      cone!.visible = p >= 2.2;
      const st = p < 2.2 ? 0 : p < 4.6 ? 1 : p < 7.2 ? 2 : p < 9 ? 3 : 4;
      if (st !== lastState) {
        if (st > 0) lastSwitch = t;
        lastState = st;
      }
      resMat.emissiveIntensity = st > 0 ? 0.3 * Math.exp(-(t - lastSwitch) * 5) : 0;
      label =
        p < 2.4
          ? '① 합치기  A ∪ B — 벽 · 지붕 · 굴뚝 · 탑'
          : p < 5.2
            ? '② 빼기  A − B — 문 · 창 구멍 · 속 비우기'
            : p < 7.9
              ? '③ 겹친 곳만  A ∩ B — 상자 ∩ 공 = 둥근 주사위'
              : p < 9.6
                ? '④ 빼기 — 주사위 눈 파기'
                : '완성 — 모양끼리 연산만으로';
    },
    render(r, w, h) {
      env.apply(r, scene, 0.35);
      if (warm.tick(r, scene, camera, 0x2c4462)) shadowed(r, () => r.render(scene, camera));
      tags.set(0, `삼각형 ${fmt(tris)} · 연산 ${ms.toFixed(0)}ms (나눠서)`);
      tags.set(1, label);
      tags.draw(r, w, h, [
        [0.02, 0.06, -1],
        [0.5, 0.92, 0],
      ]);
    },
    controls: [
      { type: 'toggle', label: '불리언 연산 (끄면 그냥 겹쳐 놓기)', value: true, on: (v) => (opOn = v) },
      {
        type: 'toggle',
        label: '와이어프레임 (잘린 면 보기)',
        value: false,
        on: (v) => {
          wire = v;
          resMat.wireframe = v;
        },
      },
      {
        type: 'range',
        label: '창문 수',
        min: 0,
        max: 4,
        step: 1,
        value: 3,
        on: (v) => {
          nWin = v;
          build();
        },
      },
      {
        type: 'button',
        label: '새로 만들기',
        on: () => {
          seed = (seed * 7919 + 13) % 100000;
          build();
        },
      },
    ] as Control[],
    dispose() {
      freeAll(group);
      freeAll(turf);
      freeAll(soil);
      resMat.dispose();
      edgeMat.dispose();
      bg.dispose();
      env.dispose();
      tags.dispose();
    },
  };
}

/* ───────────── i452 바위 · 돌 절차 생성 ───────────── */

type RockOpts = { cuts: number; noise: number; moss: number };
type RockData = {
  geo: THREE.BufferGeometry;
  stages: Float32Array[]; // 0 구 · 1 찌그리기 · 2 깎기 · 3 잡음
  normals: Float32Array[];
  base: Float32Array; // 이끼 없는 색
  final: Float32Array; // 이끼 색
  minY: number[];
};
/** 정점을 함께 쓰는 측지 구 (면마다 n 등분) — 나눠서 만든다 */
const ICO_V = [-1, PHI(), 0, 1, PHI(), 0, -1, -PHI(), 0, 1, -PHI(), 0, 0, -1, PHI(), 0, 1, PHI(), 0, -1, -PHI(), 0, 1, -PHI(), PHI(), 0, -1, PHI(), 0, 1, -PHI(), 0, -1, -PHI(), 0, 1];
function PHI(): number {
  return (1 + Math.sqrt(5)) / 2;
}
const ICO_F = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
function* icoSphere(n: number): G<THREE.BufferGeometry> {
  const pos: number[] = [];
  const idx: number[] = [];
  const key = new Map<string, number>();
  const vi = (x: number, y: number, z: number): number => {
    const l = Math.hypot(x, y, z);
    x /= l;
    y /= l;
    z /= l;
    const k = `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`;
    let i = key.get(k);
    if (i === undefined) {
      i = pos.length / 3;
      pos.push(x, y, z);
      key.set(k, i);
    }
    return i;
  };
  const V = (i: number): [number, number, number] => [ICO_V[i * 3]!, ICO_V[i * 3 + 1]!, ICO_V[i * 3 + 2]!];
  for (let f = 0; f < 20; f++) {
    const A = V(ICO_F[f * 3]!);
    const B = V(ICO_F[f * 3 + 1]!);
    const C = V(ICO_F[f * 3 + 2]!);
    const grid: number[][] = [];
    for (let i = 0; i <= n; i++) {
      const row: number[] = [];
      for (let j = 0; j <= n - i; j++) {
        const u = i / n;
        const v = j / n;
        row.push(vi(A[0] + (B[0] - A[0]) * u + (C[0] - A[0]) * v, A[1] + (B[1] - A[1]) * u + (C[1] - A[1]) * v, A[2] + (B[2] - A[2]) * u + (C[2] - A[2]) * v));
      }
      grid.push(row);
    }
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n - i; j++) {
        idx.push(grid[i]![j]!, grid[i + 1]![j]!, grid[i]![j + 1]!);
        if (j < n - i - 1) idx.push(grid[i + 1]![j]!, grid[i + 1]![j + 1]!, grid[i]![j + 1]!);
      }
    if (late()) yield;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}
const ROCK_PAL = [0x9a948c, 0x8790a0, 0xc2a27a, 0x6a676c, 0xb49a92, 0xa7a08e];
function* makeRock(seed: number, detail: number, o: RockOpts): G<RockData> {
  const rng = rngOf(seed);
  const g = yield* icoSphere(detail);
  const P0 = (g.getAttribute('position').array as Float32Array).slice();
  const n = P0.length / 3;
  const s = Math.floor(rng() * 9999);
  // 1 찌그리기: 아무렇게나 돌리고 늘이기 + 큰 혹
  const rot = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rng() * TAU, rng() * TAU, rng() * TAU));
  const sx = 0.85 + rng() * 0.4;
  const sy = 0.55 + rng() * 0.3;
  const sz = 0.75 + rng() * 0.35;
  const P1 = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    if ((i & 255) === 255 && late()) yield;
    v.set(P0[i * 3]!, P0[i * 3 + 1]!, P0[i * 3 + 2]!);
    const lump = 1 + (fbm3(v.x * 1.3, v.y * 1.3, v.z * 1.3, s, 3) - 0.5) * 0.5;
    v.multiplyScalar(lump).applyMatrix4(rot);
    P1[i * 3] = v.x * sx;
    P1[i * 3 + 1] = v.y * sy;
    P1[i * 3 + 2] = v.z * sz;
  }
  // 2 깎기: 평면으로 잘라 낸 면 (모서리는 살짝 둥글게)
  const P2 = P1.slice();
  const cutAmt = new Float32Array(n);
  const planes: THREE.Vector3[] = [new THREE.Vector3(0, -1, 0)];
  for (let k = 0; k < o.cuts; k++) planes.push(new THREE.Vector3(rng() * 2 - 1, rng() * 1.1 - 0.3, rng() * 2 - 1).normalize());
  for (let k = 0; k < planes.length; k++) {
    const pn = planes[k]!;
    let ext = 0;
    for (let i = 0; i < n; i++) ext = Math.max(ext, pn.x * P2[i * 3]! + pn.y * P2[i * 3 + 1]! + pn.z * P2[i * 3 + 2]!);
    const d = ext * (k === 0 ? 0.62 : 0.66 + rng() * 0.2);
    const b = 0.05;
    for (let i = 0; i < n; i++) {
      if ((i & 255) === 255 && late()) yield;
      const e = pn.x * P2[i * 3]! + pn.y * P2[i * 3 + 1]! + pn.z * P2[i * 3 + 2]! - d;
      if (e <= -b) continue;
      const sh = e < b ? ((e + b) * (e + b)) / (4 * b) : e;
      P2[i * 3] = P2[i * 3]! - pn.x * sh;
      P2[i * 3 + 1] = P2[i * 3 + 1]! - pn.y * sh;
      P2[i * 3 + 2] = P2[i * 3 + 2]! - pn.z * sh;
      if (sh > 0.01) cutAmt[i] = 1;
    }
  }
  // 3 잡음 변위 (깎인 면은 약하게)
  const P3 = P2.slice();
  const disp = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if ((i & 255) === 255 && late()) yield;
    const x = P0[i * 3]!;
    const y = P0[i * 3 + 1]!;
    const z = P0[i * 3 + 2]!;
    const px = P2[i * 3]!;
    const py = P2[i * 3 + 1]!;
    const pz = P2[i * 3 + 2]!;
    const d = ((fbm3(px * 2.4, py * 2.4, pz * 2.4, s + 5, 4) - 0.5) * 0.3 + (fbm3(px * 8, py * 8, pz * 8, s + 9, 3) - 0.5) * 0.09) * o.noise * (cutAmt[i] ? 0.4 : 1);
    disp[i] = d;
    P3[i * 3] = px + x * d;
    P3[i * 3 + 1] = py + y * d;
    P3[i * 3 + 2] = pz + z * d;
  }
  const stages = [P0, P1, P2, P3];
  const normals: Float32Array[] = [];
  const minY: number[] = [];
  const pa = g.getAttribute('position') as THREE.BufferAttribute;
  for (const st of stages) {
    (pa.array as Float32Array).set(st);
    pa.needsUpdate = true;
    g.computeVertexNormals();
    normals.push((g.getAttribute('normal').array as Float32Array).slice());
    let m = 9;
    for (let i = 0; i < n; i++) m = Math.min(m, st[i * 3 + 1]!);
    minY.push(m);
    if (late()) yield;
  }
  // 색: 바탕 · 얼룩 · 틈 그늘 · 깎인 면은 밝게, 그리고 위를 보는 곳에 이끼
  const bc = new THREE.Color(ROCK_PAL[Math.floor(rng() * ROCK_PAL.length)]!);
  const moss1 = new THREE.Color(0x5f8f2e);
  const moss2 = new THREE.Color(0x9cbf4c);
  const base = new Float32Array(n * 3);
  const fin = new Float32Array(n * 3);
  const N3 = normals[3]!;
  const c = new THREE.Color();
  const mc = new THREE.Color();
  for (let i = 0; i < n; i++) {
    if ((i & 255) === 255 && late()) yield;
    const px = P3[i * 3]!;
    const py = P3[i * 3 + 1]!;
    const pz = P3[i * 3 + 2]!;
    const sp = 0.82 + 0.3 * noise3(px * 16, py * 16, pz * 16, s + 3);
    const crev = 0.62 + 0.38 * sat(0.5 + disp[i]! * 7);
    const band = 0.92 + 0.12 * Math.sin(py * 9 + fbm3(px * 2, py * 2, pz * 2, s + 1, 2) * 6);
    const k = sp * crev * band * (cutAmt[i] ? 1.1 : 1);
    c.copy(bc).multiplyScalar(k);
    base[i * 3] = c.r;
    base[i * 3 + 1] = c.g;
    base[i * 3 + 2] = c.b;
    const m = smooth(0.55, 0.85, N3[i * 3 + 1]! + (fbm3(px * 3, py * 3, pz * 3, s + 7, 3) - 0.5) * 0.9) * o.moss;
    mc.copy(moss1).lerp(moss2, noise3(px * 6, py * 6, pz * 6, s + 11)).multiplyScalar(0.8 + 0.25 * sp);
    c.lerp(mc, m);
    fin[i * 3] = c.r;
    fin[i * 3 + 1] = c.g;
    fin[i * 3 + 2] = c.b;
  }
  return { geo: g, stages, normals, base, final: fin, minY };
}

function rocksDemo(): Scene3D {
  const scene = new THREE.Scene();
  const bg = bgTex('#14262a', '#3a5a52');
  scene.background = bg;
  addLights(scene, { sky: 0xdff0ff, ground: 0x4a4030, hemi: 1.15, sun: 3.0, dir: [-3, 6, 3.5], ext: 3.4 });
  const camera = new THREE.PerspectiveCamera(36, 1.6, 0.1, 50);
  // 디오라마 받침: 흙 · 이끼 얼룩
  const gc = document.createElement('canvas');
  gc.width = gc.height = 1024;
  const gctx = gc.getContext('2d')!;
  gctx.fillStyle = '#5c5638';
  gctx.fillRect(0, 0, 1024, 1024);
  const gt = new THREE.CanvasTexture(gc);
  // 흙 무늬는 돌을 다 만든 뒤 나눠서 칠한다
  const groundJob = new Job();
  groundJob.start(
    (function* (): G {
    const g = gctx;
    const im = g.createImageData(1024, 1024);
    for (let y = 0; y < 1024; y++) {
      if ((y & 3) === 3 && late()) yield;
      for (let x = 0; x < 1024; x++) {
        const m = smooth(0.48, 0.58, fbm2(x / 90, y / 90, 3, 3) + (noise2(x / 6, y / 6, 4) - 0.5) * 0.12);
        const d = 0.55 * noise2(x / 3, y / 3, 8) + 0.45 * noise2(x / 11, y / 11, 9);
        const k = 0.75 + 0.45 * d;
        const o = (y * 1024 + x) * 4;
        im.data[o] = lerp(116, 74, m) * k;
        im.data[o + 1] = lerp(88, 122, m) * k;
        im.data[o + 2] = lerp(62, 46, m) * k;
        im.data[o + 3] = 255;
      }
    }
    g.putImageData(im, 0, 0);
    gt.needsUpdate = true;
    })(),
  );
  gt.colorSpace = THREE.SRGBColorSpace;
  const ground = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.2, 0.3, 80), [
    new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 1 }),
    new THREE.MeshStandardMaterial({ map: gt, roughness: 1 }),
    new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 1 }),
  ]);
  ground.position.y = -0.15;
  ground.receiveShadow = true;
  scene.add(ground);

  const opts: RockOpts = { cuts: 5, noise: 1, moss: 0.6 };
  let seed = 11;
  let wire = false;
  let ms = 0;
  let tris = 0;
  let field = new THREE.Group();
  let heroes: { mesh: THREE.Mesh; d: RockData; col: THREE.BufferAttribute }[] = [];
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const tags = new Tags(2, ['rgba(12,16,34,0.72)', 'rgba(40,90,60,0.85)']);
  const HS = 0.78;
  const job = new Job();
  const warm = new Warm();
  let total = 1;
  let made = 0;
  let t00 = -1;

  function build(): void {
    scene.remove(field);
    freeAll(field);
    field = new THREE.Group();
    scene.add(field);
    const rng = rngOf(seed);
    tris = 0;
    const spots: [number, number, number][] = [];
    let tries = 0;
    while (spots.length < 26 && tries++ < 600) {
      const a = rng() * TAU;
      const r = 0.9 + Math.sqrt(rng()) * 1.9;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r * 0.85 - 0.2;
      if (Math.abs(x) < 1.0 && z > 0.1) continue;
      const s = 0.16 + rng() * rng() * 0.42;
      if (spots.some(([px, pz, ps]) => Math.hypot(px - x, pz - z) < (ps + s) * 1.05)) continue;
      spots.push([x, z, s]);
    }
    heroes = [];
    t00 = -1;
    total = spots.length + 3;
    made = 0;
    const seeds = spots.map(() => Math.floor(rng() * 1e6));
    const hseeds = [0, 1, 2].map(() => Math.floor(rng() * 1e6));
    const yaws = spots.map(() => rng() * TAU);
    const f0 = field;
    // 돌은 하나씩 나눠 굽는다 — 큰 돌 먼저, 그다음 둘레 돌이 하나씩 생긴다
    const hero = function* (k: number): G {
      const d = yield* makeRock(hseeds[k]!, 24, opts);
      if (field !== f0) return;
      const g = d.geo;
      (g.getAttribute('position').array as Float32Array).set(d.stages[0]!);
      (g.getAttribute('normal').array as Float32Array).set(d.normals[0]!);
      g.morphAttributes.position = [1, 2, 3].map((i) => new THREE.BufferAttribute(d.stages[i]!, 3));
      g.morphAttributes.normal = [1, 2, 3].map((i) => new THREE.BufferAttribute(d.normals[i]!, 3));
      const col = new THREE.BufferAttribute(d.base.slice(), 3);
      g.setAttribute('color', col);
      const m = new THREE.Mesh(g, mat);
      m.updateMorphTargets();
      m.scale.setScalar(HS);
      m.position.set(0, 0, 1.05);
      m.castShadow = m.receiveShadow = true;
      m.visible = false;
      warm.add(m, field);
      heroes.push({ mesh: m, d, col });
      made++;
      if (k === 0) tris += triCount(g);
    };
    job.start(
      (function* (): G {
        yield* hero(0);
        for (let i = 0; i < spots.length; i++) {
          const [x, z, s] = spots[i]!;
          const d = yield* makeRock(seeds[i]!, 13, opts);
          if (field !== f0) return;
          const g = d.geo;
          (g.getAttribute('position').array as Float32Array).set(d.stages[3]!);
          (g.getAttribute('normal').array as Float32Array).set(d.normals[3]!);
          g.setAttribute('color', new THREE.BufferAttribute(d.final, 3));
          const m = new THREE.Mesh(g, mat);
          m.scale.setScalar(s);
          m.position.set(x, -d.minY[3]! * s - 0.02, z);
          m.rotation.y = yaws[i]!;
          m.castShadow = m.receiveShadow = true;
          warm.add(m, field);
          tris += triCount(g);
          made++;
        }
        yield* hero(1);
        yield* hero(2);
        ms = job.spent;
      })(),
    );
    mat.wireframe = wire;
  }
  build();

  const CYC = 7.2;
  let stage = 0;
  let lastMoss = -1;
  let lastHero = -1;
  return {
    scene,
    camera,
    update(t) {
      camera.position.set(Math.sin(t * 0.15) * 0.7, 2.35, 5.2);
      camera.lookAt(0, 0.3, 0.3);
      if (job.busy) job.step();
      else if (groundJob.busy) groundJob.step();
      if (!heroes.length || !heroes[0]!.mesh.parent) {
        stage = -1;
        return;
      }
      if (t00 < 0) t00 = t;
      const cyc = Math.floor((t - t00) / CYC);
      const p = (t - t00) % CYC;
      const hi = cyc % heroes.length;
      // 단계 값 s: 0 → 1 → 2 → 3, 이끼 m
      const seg = (a: number): number => easeIO(sat((p - a) / 0.8));
      let s = seg(0.5) + seg(1.9) + seg(3.3);
      const back = easeIO(sat((p - (CYC - 0.5)) / 0.5));
      s *= 1 - back;
      const m = smooth(4.6, 5.4, p) * (1 - back);
      stage = p < 0.5 ? 0 : p < 1.9 ? 1 : p < 3.3 ? 2 : p < 4.6 ? 3 : 4;
      heroes.forEach((h, k) => (h.mesh.visible = k === hi));
      const h = heroes[hi]!;
      const inf = h.mesh.morphTargetInfluences!;
      inf[0] = s <= 1 ? s : s <= 2 ? 2 - s : 0;
      inf[1] = s <= 1 ? 0 : s <= 2 ? s - 1 : 3 - s;
      inf[2] = s <= 2 ? 0 : s - 2;
      const my = h.d.minY;
      const w0 = 1 - inf[0]! - inf[1]! - inf[2]!;
      const minY = w0 * my[0]! + inf[0]! * my[1]! + inf[1]! * my[2]! + inf[2]! * my[3]!;
      h.mesh.position.y = -minY * HS - 0.02;
      h.mesh.rotation.y = t * 0.3;
      const mq = Math.round(m * 40) / 40;
      if (mq !== lastMoss || hi !== lastHero) {
        lastMoss = mq;
        lastHero = hi;
        const a = h.col.array as Float32Array;
        const b0 = h.d.base;
        const f = h.d.final;
        for (let i = 0; i < a.length; i++) a[i] = b0[i]! + (f[i]! - b0[i]!) * mq;
        h.col.needsUpdate = true;
      }
    },
    render(r, w, h) {
      tags.set(0, job.busy ? `돌 만드는 중 ${made} / ${total} · 나눠 굽기 ${job.spent.toFixed(0)}ms` : `돌 ${total - 2}개 · 삼각형 ${fmt(tris)} · 만들기 ${ms.toFixed(0)}ms (나눠서)`);
      tags.set(1, stage < 0 ? '큰 돌 만드는 중…' : ['① 둥근 공 (다면체)', '② 찌그리기 — 늘이고 돌리고 혹', '③ 깎기 — 평면으로 잘라 낸 면', '④ 잡음 변위 — 울퉁불퉁 결', '⑤ 이끼 — 위를 보는 곳만 정점 색'][stage]!);
      if (warm.tick(r, scene, camera, 0x22383a)) shadowed(r, () => r.render(scene, camera));
      tags.draw(r, w, h, [
        [0.02, 0.06, -1],
        [0.5, 0.92, 0],
      ]);
    },
    controls: [
      {
        type: 'range',
        label: '깎는 면 수',
        min: 0,
        max: 8,
        step: 1,
        value: 5,
        on: (v) => {
          opts.cuts = v;
          build();
        },
      },
      {
        type: 'range',
        label: '잡음 세기',
        min: 0,
        max: 2,
        step: 0.1,
        value: 1,
        on: (v) => {
          opts.noise = v;
          build();
        },
      },
      {
        type: 'range',
        label: '이끼',
        min: 0,
        max: 1,
        step: 0.1,
        value: 0.6,
        on: (v) => {
          opts.moss = v;
          build();
        },
      },
      {
        type: 'toggle',
        label: '와이어프레임',
        value: false,
        on: (v) => {
          wire = v;
          mat.wireframe = v;
        },
      },
      {
        type: 'button',
        label: '새로 만들기',
        on: () => {
          seed = (seed * 7919 + 13) % 100000;
          build();
        },
      },
    ] as Control[],
    dispose() {
      freeAll(field);
      freeAll(ground);
      gt.dispose();
      mat.dispose();
      bg.dispose();
      tags.dispose();
    },
  };
}

/* ───────────── i453 정점 AO 굽기 ───────────── */

type Prim = { kind: 0 | 1 | 2; inv: THREE.Matrix4; a: number; b: number; c: number; cx: number; cy: number; cz: number; br: number };
/** 국소 좌표 광선이 기본 도형에 맞는 거리 (없으면 Infinity). kind 0 상자(a,b,c 반 크기) · 1 원기둥(a 반지름, b 반 높이) · 2 공(a 반지름) */
function hitPrim(p: Prim, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): number {
  if (p.kind === 0) {
    let t0 = -1e9;
    let t1 = 1e9;
    const sl = (o: number, d: number, h: number): boolean => {
      if (Math.abs(d) < 1e-9) return Math.abs(o) <= h;
      let a = (-h - o) / d;
      let b = (h - o) / d;
      if (a > b) {
        const t = a;
        a = b;
        b = t;
      }
      if (a > t0) t0 = a;
      if (b < t1) t1 = b;
      return t0 <= t1;
    };
    if (!sl(ox, dx, p.a) || !sl(oy, dy, p.b) || !sl(oz, dz, p.c)) return Infinity;
    return t1 > 0 ? Math.max(t0, 0) : Infinity;
  }
  if (p.kind === 2) {
    const b = ox * dx + oy * dy + oz * dz;
    const c = ox * ox + oy * oy + oz * oz - p.a * p.a;
    const disc = b * b - c;
    if (disc < 0) return Infinity;
    const t = -b - Math.sqrt(disc);
    return t > 0 ? t : c < 0 ? 0 : Infinity;
  }
  let best = Infinity;
  const a = dx * dx + dz * dz;
  if (a > 1e-9) {
    const b = ox * dx + oz * dz;
    const c = ox * ox + oz * oz - p.a * p.a;
    const disc = b * b - a * c;
    if (disc >= 0) {
      const t = (-b - Math.sqrt(disc)) / a;
      if (t > 0 && Math.abs(oy + t * dy) <= p.b) best = t;
    }
  }
  if (Math.abs(dy) > 1e-9)
    for (const hy of [p.b, -p.b]) {
      const t = (hy - oy) / dy;
      if (t > 0 && t < best) {
        const x = ox + t * dx;
        const z = oz + t * dz;
        if (x * x + z * z <= p.a * p.a) best = t;
      }
    }
  return best;
}

function aoDemo(): Scene3D {
  const scene = new THREE.Scene();
  const bg = bgTex('#1d2338', '#4a4f72');
  scene.background = bg;
  addLights(scene, { sky: 0xeef2ff, ground: 0x8a7a68, hemi: 1.9, sun: 1.1, dir: [-3, 6, 4], ext: 3.4 });
  const camera = new THREE.PerspectiveCamera(36, 1.6, 0.1, 50);
  const tags = new Tags(3, ['rgba(12,16,34,0.72)', 'rgba(60,60,80,0.8)', 'rgba(110,60,150,0.85)']);
  let seed = 5;
  let rays = 48;
  let maxD = 0.9;
  let strength = 1;
  let auto = true;
  let frac = 0.5;
  let aoOnly = false;
  let wire = false;
  let ms = 0;
  let verts = 0;
  let group = new THREE.Group();
  const job = new Job();
  const warm = new Warm();
  let done = 0;
  type Obj = { mesh: THREE.Mesh; plain: THREE.MeshStandardMaterial; ao: THREE.MeshStandardMaterial; aoArr: Float32Array; prim: Prim | null; col: THREE.Color };
  let objs: Obj[] = [];
  const PAL = [0xf28b82, 0xffd36e, 0x8cc8f0, 0x8fd9b6, 0xc3a6f0, 0xffb38a];

  function build(): void {
    job.start(buildG());
  }
  function* buildG(): G {
    for (const o of objs) {
      o.plain.dispose();
      o.ao.dispose();
    }
    scene.remove(group);
    freeAll(group);
    group = new THREE.Group();
    const g0 = group;
    objs = [];
    const rng = rngOf(seed);
    const j = (s: number): number => (rng() - 0.5) * s;
    const pick = (): number => PAL[Math.floor(rng() * PAL.length)]!;
    const seg = (s: number): number => Math.max(2, Math.ceil(s / 0.05));
    const add = (kind: 0 | 1 | 2, a: number, b: number, c: number, x: number, y: number, z: number, ry: number, color: number): void => {
      const geo =
        kind === 0
          ? new THREE.BoxGeometry(a * 2, b * 2, c * 2, seg(a * 2), seg(b * 2), seg(c * 2))
          : kind === 1
            ? new THREE.CylinderGeometry(a, a, b * 2, 40, seg(b * 2))
            : new THREE.SphereGeometry(a, 40, 28);
      const col = new THREE.Color(color);
      const plain = new THREE.MeshStandardMaterial({ color: col, roughness: 0.7 });
      const ao = new THREE.MeshStandardMaterial({ color: col, roughness: 0.7, vertexColors: true });
      const mesh = new THREE.Mesh(geo, plain);
      mesh.position.set(x, y, z);
      mesh.rotation.y = ry;
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
      mesh.updateMatrixWorld(true);
      const br = kind === 0 ? Math.hypot(a, b, c) : kind === 1 ? Math.hypot(a, b) : a;
      objs.push({ mesh, plain, ao, aoArr: new Float32Array(0), prim: { kind, inv: mesh.matrixWorld.clone().invert(), a, b, c, cx: x, cy: y, cz: z, br }, col });
    };
    // 바닥 (잘게 나눈 판)
    {
      const geo = new THREE.PlaneGeometry(6, 3.6, 120, 72).rotateX(-PI / 2);
      const col = new THREE.Color(0xf1e6d2);
      const plain = new THREE.MeshStandardMaterial({ color: col, roughness: 0.85 });
      const ao = new THREE.MeshStandardMaterial({ color: col, roughness: 0.85, vertexColors: true });
      const mesh = new THREE.Mesh(geo, plain);
      mesh.receiveShadow = true;
      group.add(mesh);
      objs.push({ mesh, plain, ao, aoArr: new Float32Array(0), prim: null, col });
    }
    yield;
    // 아치
    const ax = -1.6 + j(0.2);
    const ac = pick();
    add(0, 0.15, 0.45, 0.15, ax - 0.45, 0.45, 0, 0, ac);
    add(0, 0.15, 0.45, 0.15, ax + 0.45, 0.45, 0, 0, ac);
    add(0, 0.68, 0.13, 0.2, ax, 1.03, 0, 0, pick());
    add(2, 0.2, 0, 0, ax + j(0.2), 0.2, 0.05, 0, pick());
    if (late()) yield;
    // 쌓은 상자
    const cx = -0.25 + j(0.2);
    add(0, 0.3, 0.3, 0.3, cx, 0.3, -0.35, j(0.3), pick());
    add(0, 0.22, 0.22, 0.22, cx + j(0.12), 0.82, -0.35 + j(0.1), 0.4 + j(0.5), pick());
    add(0, 0.2, 0.2, 0.2, cx + 0.42, 0.2, 0.3, -0.3 + j(0.5), pick());
    if (late()) yield;
    // 계단
    const sx = 0.85 + j(0.2);
    const sc = pick();
    for (let k = 0; k < 4; k++) add(0, 0.28, 0.1 * (k + 1), 0.13, sx, 0.1 * (k + 1), 0.4 - k * 0.26, 0, sc);
    if (late()) yield;
    // 탑 + 공
    const tx = 1.85 + j(0.15);
    add(1, 0.28, 0.5, 0, tx, 0.5, -0.1, 0, pick());
    add(2, 0.28, 0, 0, tx, 1.28, -0.1, 0, pick());
    add(2, 0.17 + rng() * 0.06, 0, 0, tx - 0.45, 0.2, 0.5, 0, pick());
    // 뒤 담
    add(0, 2.6, 0.22, 0.08, 0, 0.22, -1.15, 0, 0xe7d9c0);
    hiddenUsers(group, objs.map((o) => o.ao));
    verts = 0;
    for (const o of objs) {
      o.aoArr = new Float32Array(o.mesh.geometry.getAttribute('position').count).fill(1);
      verts += o.aoArr.length;
    }
    done = 0;
    applyAO();
    warm.add(group, scene, () => group === g0);
    yield;
    yield* bakeG(objs);
  }

  function bake(): void {
    verts = 0;
    for (const o of objs) {
      o.aoArr = new Float32Array(o.mesh.geometry.getAttribute('position').count).fill(1);
      verts += o.aoArr.length;
    }
    done = 0;
    applyAO();
    job.start(bakeG(objs));
  }
  // 정점마다 반구 광선 — 나눠서 (프레임마다 3ms), 물체 하나 끝날 때마다 바로 색을 바꾼다
  function* bakeG(list: Obj[]): G {
    const prims = list.map((o) => o.prim);
    // 코사인 가중 반구 표본 (나선)
    const K = rays;
    const sdir: number[] = [];
    for (let k = 0; k < K; k++) {
      const u = (k + 0.5) / K;
      const ph = k * 2.399963;
      const r = Math.sqrt(u);
      sdir.push(r * Math.cos(ph), r * Math.sin(ph), Math.sqrt(1 - u));
    }
    const v = new THREE.Vector3();
    const n = new THREE.Vector3();
    const tA = new THREE.Vector3();
    const tB = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const ex = new THREE.Vector3(1, 0, 0);
    for (const o of list) {
      const g = o.mesh.geometry;
      const pos = g.getAttribute('position');
      const nor = g.getAttribute('normal');
      const m = o.mesh.matrixWorld;
      const nm = new THREE.Matrix3().getNormalMatrix(m);
      const cnt = pos.count;
      const ao = new Float32Array(cnt);
      for (let i = 0; i < cnt; i++) {
        if ((i & 15) === 15 && late()) yield;
        v.fromBufferAttribute(pos, i).applyMatrix4(m);
        n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
        const near: Prim[] = [];
        for (const p of prims) if (p && p !== o.prim && Math.hypot(p.cx - v.x, p.cy - v.y, p.cz - v.z) < maxD + p.br) near.push(p);
        const onGround = o.prim === null;
        if (!near.length && onGround) {
          ao[i] = 1;
          continue;
        }
        tA.crossVectors(Math.abs(n.y) < 0.99 ? up : ex, n).normalize();
        tB.crossVectors(n, tA);
        const rot = hash3(i, cnt, 7, 1) * TAU;
        const cr = Math.cos(rot);
        const sr = Math.sin(rot);
        const ox = v.x + n.x * 0.003;
        const oy = v.y + n.y * 0.003;
        const oz = v.z + n.z * 0.003;
        let occ = 0;
        for (let k = 0; k < K; k++) {
          const lx = sdir[k * 3]! * cr - sdir[k * 3 + 1]! * sr;
          const ly = sdir[k * 3]! * sr + sdir[k * 3 + 1]! * cr;
          const lz = sdir[k * 3 + 2]!;
          const dx = tA.x * lx + tB.x * ly + n.x * lz;
          const dy = tA.y * lx + tB.y * ly + n.y * lz;
          const dz = tA.z * lx + tB.z * ly + n.z * lz;
          let tmin = !onGround && dy < -1e-6 ? -oy / dy : Infinity;
          for (const p of near) {
            const e = p.inv.elements;
            const qx = e[0]! * ox + e[4]! * oy + e[8]! * oz + e[12]!;
            const qy = e[1]! * ox + e[5]! * oy + e[9]! * oz + e[13]!;
            const qz = e[2]! * ox + e[6]! * oy + e[10]! * oz + e[14]!;
            const t = hitPrim(p, qx, qy, qz, e[0]! * dx + e[4]! * dy + e[8]! * dz, e[1]! * dx + e[5]! * dy + e[9]! * dz, e[2]! * dx + e[6]! * dy + e[10]! * dz);
            if (t < tmin) tmin = t;
          }
          if (tmin < maxD) occ += 1 - smooth(0.35, 1, tmin / maxD);
        }
        ao[i] = 1 - occ / K;
      }
      // 이웃 정점과 두 번 고르게 (광선 잡음 줄이기)
      const idx = g.getIndex();
      if (idx) {
        for (let it = 0; it < 2; it++) {
          const sum = new Float32Array(cnt);
          const num = new Float32Array(cnt);
          for (let k = 0; k < idx.count; k += 3) {
            if ((k & 4095) === 4095 && late()) yield;
            const a = idx.getX(k);
            const b = idx.getX(k + 1);
            const c = idx.getX(k + 2);
            const s3 = ao[a]! + ao[b]! + ao[c]!;
            sum[a] = sum[a]! + s3;
            sum[b] = sum[b]! + s3;
            sum[c] = sum[c]! + s3;
            num[a] = num[a]! + 3;
            num[b] = num[b]! + 3;
            num[c] = num[c]! + 3;
          }
          for (let i = 0; i < cnt; i++) if (num[i]! > 0) ao[i] = sum[i]! / num[i]!;
          if (late()) yield;
        }
      }
      if (list !== objs) return;
      if (late()) yield;
      o.aoArr = ao;
      applyOne(o);
      done += cnt;
    }
    ms = job.spent;
  }
  function applyAO(): void {
    for (const o of objs) applyOne(o);
  }
  function applyOne(o: Obj): void {
    {
      const g = o.mesh.geometry;
      const cnt = o.aoArr.length;
      const col = new Float32Array(cnt * 3);
      for (let i = 0; i < cnt; i++) {
        const a = lerp(1, Math.pow(o.aoArr[i]!, 2.2), strength);
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = a;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      o.ao.color.copy(aoOnly ? new THREE.Color(0xf4f4f4) : o.col);
      o.ao.wireframe = o.plain.wireframe = wire;
    }
  }
  build();

  const setMat = (useAO: boolean): void => {
    for (const o of objs) o.mesh.material = useAO ? o.ao : o.plain;
  };
  return {
    scene,
    camera,
    update(t) {
      camera.position.set(Math.sin(t * 0.17) * 0.5, 2.65, 5.3);
      camera.lookAt(0, 0.45, -0.1);
      if (auto) frac = 0.5 + 0.36 * Math.sin(t * 0.8);
      if (job.busy) job.step();
    },
    render(r, w, h) {
      tags.set(0, job.busy ? `AO 굽는 중 ${Math.round((done / Math.max(1, verts)) * 100)}% · 나눠서 ${job.spent.toFixed(0)}ms` : `정점 ${fmt(verts)} · 광선 ${rays}개씩 · 굽기 ${ms.toFixed(0)}ms (나눠서)`);
      tags.set(1, '굽기 전');
      tags.set(2, aoOnly ? 'AO 만 보기' : '정점 AO 굽기 후');
      if (warm.tick(r, scene, camera, 0x2c3150))
      shadowed(r, () =>
        slider(
          r,
          w,
          h,
          frac,
          () => {
            setMat(false);
            r.render(scene, camera);
          },
          () => {
            setMat(true);
            r.render(scene, camera);
          },
        ),
      );
      tags.draw(r, w, h, [
        [0.02, 0.06, -1],
        [frac - 0.015, 0.92, 1],
        [frac + 0.015, 0.92, -1],
      ]);
    },
    controls: [
      { type: 'toggle', label: '비교 막대 자동', value: true, on: (v) => (auto = v) },
      { type: 'range', label: '나눔 위치', min: 0, max: 1, step: 0.01, value: 0.5, on: (v) => ((auto = false), (frac = v)) },
      {
        type: 'range',
        label: 'AO 세기',
        min: 0,
        max: 1.5,
        step: 0.05,
        value: 1,
        on: (v) => {
          strength = v;
          applyAO();
        },
      },
      {
        type: 'range',
        label: '광선 거리',
        min: 0.2,
        max: 2,
        step: 0.1,
        value: 0.9,
        on: (v) => {
          maxD = v;
          bake();
        },
      },
      {
        type: 'range',
        label: '광선 수 (다시 굽기)',
        min: 8,
        max: 96,
        step: 8,
        value: 48,
        on: (v) => {
          rays = v;
          bake();
        },
      },
      {
        type: 'toggle',
        label: 'AO 만 보기 (흰 재질)',
        value: false,
        on: (v) => {
          aoOnly = v;
          applyAO();
        },
      },
      {
        type: 'toggle',
        label: '와이어프레임',
        value: false,
        on: (v) => {
          wire = v;
          applyAO();
        },
      },
      {
        type: 'button',
        label: '새로 만들기',
        on: () => {
          seed = (seed * 7919 + 13) % 100000;
          build();
        },
      },
    ] as Control[],
    dispose() {
      for (const o of objs) {
        o.plain.dispose();
        o.ao.dispose();
      }
      freeAll(group);
      bg.dispose();
      tags.dispose();
    },
  };
}

/* ───────────── i454 높이 → 법선 맵 굽기 ───────────── */

const NM = 512;
type Pat = { h: Float32Array; col: Uint8Array };
function* patWood(s: number): G<Pat> {
  const h = new Float32Array(NM * NM);
  const col = new Uint8Array(NM * NM * 4);
  const rng = rngOf(s);
  const planks = 4;
  const pw = NM / planks;
  const joint = Array.from({ length: planks }, () => rng() * NM);
  const tint = Array.from({ length: planks }, () => 0.88 + rng() * 0.22);
  const knot = Array.from({ length: planks }, () => [rng() * NM, pw * (0.3 + rng() * 0.4)] as [number, number]);
  for (let y = 0; y < NM; y++) {
    if (late()) yield;
    const k = Math.floor(y / pw);
    const ly = y - k * pw;
    for (let x = 0; x < NM; x++) {
      const [kx, ky] = knot[k]!;
      const dxk = x - kx;
      const dyk = ly - ky;
      const dk = Math.hypot(dxk * 0.5, dyk);
      const sw = 26 * Math.exp(-dk / 18);
      const ring = (ly + (fbm2(x / 170, y / 40 + k * 7, s, 3) - 0.5) * 70 + k * 37 + (dyk >= 0 ? sw : -sw)) * 0.33;
      const g = 0.5 + 0.5 * Math.sin(ring + Math.sin(ring * 0.5) * 0.6);
      const fib = noise2(x / 30, y / 1.4, s + 3);
      let hv = 0.55 + 0.18 * g + 0.1 * fib;
      const seam = Math.min(ly, pw - ly);
      const jd = Math.abs(((x - joint[k]! + NM * 1.5) % NM) - NM / 2) > NM / 2 - 3 ? 0 : 1;
      hv *= smooth(0, 4, seam) * (jd ? 1 : 0.3);
      const knotD = smooth(9, 4, dk);
      hv -= knotD * 0.15;
      h[y * NM + x] = hv;
      const t = tint[k]! * (0.75 + 0.3 * g + 0.12 * fib) * (1 - knotD * 0.45) * (0.35 + 0.65 * smooth(0, 3, seam));
      const o = (y * NM + x) * 4;
      col[o] = clamp(196 * t, 0, 255);
      col[o + 1] = clamp(136 * t, 0, 255);
      col[o + 2] = clamp(84 * t, 0, 255);
      col[o + 3] = 255;
    }
  }
  return { h, col };
}
function* patBrick(s: number): G<Pat> {
  const h = new Float32Array(NM * NM);
  const col = new Uint8Array(NM * NM * 4);
  const bh = NM / 8;
  const bw = NM / 4;
  const mort = 6;
  const reds = [
    [181, 82, 59],
    [166, 70, 50],
    [196, 106, 74],
    [143, 61, 44],
    [176, 96, 70],
  ];
  for (let y = 0; y < NM; y++) {
    if (late()) yield;
    const row = Math.floor(y / bh);
    const ly = y - row * bh;
    for (let x = 0; x < NM; x++) {
      const xx = x + (row % 2) * (bw / 2);
      const ci = Math.floor(xx / bw);
      const lx = xx - ci * bw;
      const id = hash3(ci % 4, row, 0, s);
      const e = Math.min(lx - mort / 2, bw - mort / 2 - lx, ly - mort / 2, bh - mort / 2 - ly);
      const n = fbm2(x / 24, y / 24, s + 1, 3);
      const chip = noise2(x / 7, y / 7, s + 2);
      const edge = e + (chip - 0.5) * 5;
      const inB = edge > 0;
      const o = (y * NM + x) * 4;
      if (inB) {
        h[y * NM + x] = 0.5 + 0.38 * smooth(0, 7, edge) + (n - 0.5) * 0.14 + id * 0.05;
        const c = reds[Math.floor(id * reds.length)]!;
        const k = (0.78 + 0.32 * n) * (0.85 + 0.15 * smooth(0, 6, edge));
        col[o] = clamp(c[0]! * k, 0, 255);
        col[o + 1] = clamp(c[1]! * k, 0, 255);
        col[o + 2] = clamp(c[2]! * k, 0, 255);
      } else {
        h[y * NM + x] = 0.22 + (noise2(x / 3, y / 3, s + 4) - 0.5) * 0.06;
        const k = 0.8 + 0.25 * noise2(x / 3, y / 3, s + 5);
        col[o] = 205 * k;
        col[o + 1] = 196 * k;
        col[o + 2] = 182 * k;
      }
      col[o + 3] = 255;
    }
  }
  return { h, col };
}
function* patScales(s: number): G<Pat> {
  const h = new Float32Array(NM * NM);
  const col = new Uint8Array(NM * NM * 4);
  const S = NM / 8;
  const R = S * 0.62;
  const hue = hash3(s, 1, 2, 3);
  for (let y = 0; y < NM; y++) {
    if (late()) yield;
    for (let x = 0; x < NM; x++) {
      const jr = Math.floor(y / (S / 2));
      let hv = 0.2;
      let d = 1;
      let cid = 0;
      for (let j = jr + 2; j >= jr - 2; j--) {
        const cy = j * (S / 2);
        const off = (((j % 2) + 2) % 2) * 0.5;
        const i = Math.round(x / S - off);
        let found = false;
        for (const ii of [i - 1, i, i + 1]) {
          const cx = (ii + off) * S;
          const dd = Math.hypot(x - cx, (y - cy) * 1.05) / R;
          if (dd < 1) {
            d = dd;
            cid = hash3(ii & 7, j & 15, 3, s);
            // 비늘은 아래쪽(자유 끝)으로 갈수록 솟는다
            hv = 0.3 + 0.55 * Math.sqrt(1 - dd * dd) * (0.55 + 0.45 * sat((y - cy) / R + 0.5)) + 0.05 * Math.cos(((x - cx) / R) * 3);
            found = true;
            break;
          }
        }
        if (found) break;
      }
      h[y * NM + x] = hv;
      const o = (y * NM + x) * 4;
      const rim = smooth(0.78, 1, d);
      const c = new THREE.Color().setHSL((0.42 + hue * 0.2 + cid * 0.06) % 1, 0.55, 0.38 + 0.18 * (1 - d) - rim * 0.18);
      col[o] = c.r * 255;
      col[o + 1] = c.g * 255;
      col[o + 2] = c.b * 255;
      col[o + 3] = 255;
    }
  }
  return { h, col };
}
function* normalFrom(h: Float32Array, k: number): G<Uint8Array> {
  const out = new Uint8Array(NM * NM * 4);
  for (let y = 0; y < NM; y++) {
    if (late()) yield;
    for (let x = 0; x < NM; x++) {
      const xl = Math.max(0, x - 1);
      const xr = Math.min(NM - 1, x + 1);
      const yd = Math.max(0, y - 1);
      const yu = Math.min(NM - 1, y + 1);
      const dx = (h[y * NM + xr]! - h[y * NM + xl]!) * k;
      const dy = (h[yu * NM + x]! - h[yd * NM + x]!) * k;
      const l = Math.hypot(dx, dy, 1);
      const o = (y * NM + x) * 4;
      out[o] = ((-dx / l) * 0.5 + 0.5) * 255;
      out[o + 1] = ((-dy / l) * 0.5 + 0.5) * 255;
      out[o + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      out[o + 3] = 255;
    }
  }
  return out;
}
function dataTex(d: Uint8Array, srgb: boolean): THREE.DataTexture {
  const t = new THREE.DataTexture(d, NM, NM, THREE.RGBAFormat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

function normalMapDemo(): Scene3D {
  const scene = new THREE.Scene();
  const bg = bgTex('#141822', '#2c3346');
  scene.background = bg;
  const { hemi, sun } = addLights(scene, { sky: 0xd8e2ff, ground: 0x3a3028, hemi: 0.35, sun: 3.2, dir: [3, 1.6, 0], ext: 3 });
  const env = new Env();
  const camera = new THREE.PerspectiveCamera(38, 1.6, 0.1, 50);
  const table = new THREE.Mesh(new THREE.PlaneGeometry(12, 8), new THREE.MeshStandardMaterial({ color: 0x262a36, roughness: 0.9 }));
  table.rotation.x = -PI / 2;
  table.receiveShadow = true;
  scene.add(table);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff1c8, toneMapped: false }));
  scene.add(bulb);
  const tags = new Tags(6, ['rgba(12,16,34,0.72)', 'rgba(60,60,80,0.8)', 'rgba(110,60,150,0.85)', 'rgba(12,16,34,0.6)', 'rgba(12,16,34,0.6)', 'rgba(12,16,34,0.6)']);
  type Tile = { mesh: THREE.Mesh; plain: THREE.MeshStandardMaterial; nm: THREE.MeshStandardMaterial; hview: THREE.MeshBasicMaterial; nview: THREE.MeshBasicMaterial; texs: THREE.Texture[] };
  let tiles: Tile[] = [];
  const frames: THREE.Mesh[] = [];
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x4b3426, roughness: 0.5 });
  const tileGeo = new THREE.PlaneGeometry(1.5, 1.5).rotateX(-PI / 2);
  for (let k = 0; k < 3; k++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.08, 1.66), frameMat);
    f.position.set((k - 1) * 1.8, 0.04, 0);
    f.castShadow = f.receiveShadow = true;
    scene.add(f);
    frames.push(f);
  }
  let seed = 9;
  let ms = 0;
  let strength = 1.8;
  let auto = true;
  let split = true;
  let bakeView = false;
  let lightSpeed = 0.6;
  let wire = false;
  let frac = 0.5;
  let ang = 0;
  const job = new Job();
  const warm = new Warm();
  // 굽는 동안 자리에 놓는 회색 판
  const holdMat = new THREE.MeshStandardMaterial({ color: 0x5a5f6e, roughness: 0.9 });
  const holders = [0, 1, 2].map((k) => {
    const m = new THREE.Mesh(tileGeo, holdMat);
    m.position.set((k - 1) * 1.8, 0.081, 0);
    scene.add(m);
    return m;
  });

  function build(): void {
    for (const t of tiles) {
      scene.remove(t.mesh);
      for (const x of t.texs) x.dispose();
      t.plain.dispose();
      t.nm.dispose();
      t.hview.dispose();
      t.nview.dispose();
    }
    tiles = [];
    for (const ph of holders) ph.visible = true;
    const t0 = tiles;
    // 높이 그림 → 법선 맵, 한 장씩 나눠 굽는다 (프레임마다 3ms)
    job.start(
      (function* (): G {
        const makers = [() => patWood(seed), () => patBrick(seed + 1), () => patScales(seed + 2)];
        for (let k = 0; k < 3; k++) {
          const p = yield* makers[k]!();
          const nrm = yield* normalFrom(p.h, 9);
          const hb = new Uint8Array(NM * NM * 4);
          for (let i = 0; i < NM * NM; i++) {
            if ((i & 16383) === 16383 && late()) yield;
            const v = clamp(p.h[i]! * 255, 0, 255);
            hb[i * 4] = hb[i * 4 + 1] = hb[i * 4 + 2] = v;
            hb[i * 4 + 3] = 255;
          }
          yield;
          if (tiles !== t0) return;
          const ntex = dataTex(nrm, false);
          const ctex = dataTex(p.col, true);
          const htex = dataTex(hb, true);
          const rough = k === 2 ? 0.35 : k === 0 ? 0.6 : 0.85;
          const plain = new THREE.MeshStandardMaterial({ map: ctex, roughness: rough });
          const nm = new THREE.MeshStandardMaterial({ map: ctex, normalMap: ntex, normalScale: new THREE.Vector2(strength, strength), roughness: rough });
          const hview = new THREE.MeshBasicMaterial({ map: htex });
          const nview = new THREE.MeshBasicMaterial({ map: ntex });
          const mesh = new THREE.Mesh(tileGeo, nm);
          mesh.position.set((k - 1) * 1.8, 0.081, 0);
          mesh.receiveShadow = true;
          hiddenUsers(mesh, [plain, hview, nview]);
          const tile = { mesh, plain, nm, hview, nview, texs: [ntex, ctex, htex] };
          const hk = holders[k]!;
          mesh.onBeforeRender = () => {
            hk.visible = false;
            mesh.onBeforeRender = () => {};
          };
          warm.add(mesh, scene, () => tiles.includes(tile));
          tiles.push(tile);
          setWire();
        }
        ms = job.spent;
      })(),
    );
    setWire();
  }
  function setWire(): void {
    for (const t of tiles) t.plain.wireframe = t.nm.wireframe = t.hview.wireframe = t.nview.wireframe = wire;
  }
  build();
  void hemi;

  return {
    scene,
    camera,
    update(t, dt) {
      camera.position.set(Math.sin(t * 0.13) * 0.3, 3.85, 3.8);
      camera.lookAt(0, -0.1, 0.05);
      ang += dt * lightSpeed * 1.4;
      const el = 0.42;
      sun.position.set(Math.cos(ang) * 3 * Math.cos(el), 3 * Math.sin(el), Math.sin(ang) * 3 * Math.cos(el));
      bulb.position.copy(sun.position).setLength(1.9);
      bulb.position.y = 0.55;
      if (auto) frac = 0.5 + 0.38 * Math.sin(t * 0.7);
      if (job.busy) job.step();
    },
    render(r, w, h) {
      env.apply(r, scene, 0.25);
      tags.set(0, job.busy ? `법선 맵 굽는 중 ${tiles.length} / 3 · 나눠서 ${job.spent.toFixed(0)}ms` : `판 하나 = 삼각형 2개 · 굽기 512² × 3장 · ${ms.toFixed(0)}ms (나눠서)`);
      tags.set(1, bakeView ? '높이 그림' : '법선 맵 없음');
      tags.set(2, bakeView ? '구운 법선 맵' : '법선 맵 붙임');
      tags.set(3, '나무결');
      tags.set(4, '벽돌');
      tags.set(5, '비늘');
      const use = (m: 'a' | 'b'): void => {
        for (const t of tiles) t.mesh.material = bakeView ? (m === 'a' ? t.hview : t.nview) : m === 'a' ? t.plain : t.nm;
      };
      const f = split || bakeView ? frac : 0;
      if (warm.tick(r, scene, camera, 0x1c2130))
      shadowed(r, () =>
        f > 0
          ? slider(
              r,
              w,
              h,
              f,
              () => {
                use('a');
                r.render(scene, camera);
              },
              () => {
                use('b');
                r.render(scene, camera);
              },
            )
          : (use('b'), r.render(scene, camera)),
      );
      const lab = [-1, 0, 1].map((k) => toScreen(new THREE.Vector3(k * 1.8, 0.1, 0.95), camera));
      tags.draw(r, w, h, [
        [0.02, 0.06, -1],
        f > 0 ? [f - 0.015, 0.06 + 0.07, 1] : null,
        f > 0 ? [f + 0.015, 0.06 + 0.07, -1] : null,
        [lab[0]![0], lab[0]![1], 0],
        [lab[1]![0], lab[1]![1], 0],
        [lab[2]![0], lab[2]![1], 0],
      ]);
    },
    controls: [
      { type: 'toggle', label: '전/후 비교 막대', value: true, on: (v) => (split = v) },
      { type: 'toggle', label: '비교 막대 자동', value: true, on: (v) => (auto = v) },
      { type: 'range', label: '나눔 위치', min: 0, max: 1, step: 0.01, value: 0.5, on: (v) => ((auto = false), (frac = v)) },
      {
        type: 'range',
        label: '요철 세기',
        min: 0,
        max: 3,
        step: 0.1,
        value: 1.8,
        on: (v) => {
          strength = v;
          for (const t of tiles) t.nm.normalScale.set(v, v);
        },
      },
      { type: 'range', label: '빛 돌리기 빠르기', min: 0, max: 2, step: 0.1, value: 0.6, on: (v) => (lightSpeed = v) },
      { type: 'toggle', label: '구운 그림 보기 (높이 → 법선)', value: false, on: (v) => (bakeView = v) },
      {
        type: 'toggle',
        label: '와이어프레임 (판은 삼각형 2개)',
        value: false,
        on: (v) => {
          wire = v;
          setWire();
        },
      },
      {
        type: 'button',
        label: '새로 만들기',
        on: () => {
          seed = (seed * 7919 + 13) % 100000;
          build();
        },
      },
    ] as Control[],
    dispose() {
      for (const t of tiles) {
        for (const x of t.texs) x.dispose();
        t.plain.dispose();
        t.nm.dispose();
        t.hview.dispose();
        t.nview.dispose();
      }
      tileGeo.dispose();
      holdMat.dispose();
      for (const f of frames) f.geometry.dispose();
      frameMat.dispose();
      freeAll(table);
      freeAll(bulb);
      bg.dispose();
      env.dispose();
      tags.dispose();
    },
  };
}

/* ───────────── i455 표면에 디테일 흩뿌리기 ───────────── */

function bladeGeo(): THREE.BufferGeometry {
  const P: number[] = [];
  const C: number[] = [];
  const I: number[] = [];
  const seg = 4;
  for (let i = 0; i <= seg; i++) {
    const v = i / seg;
    const w = 0.024 * Math.pow(1 - v, 0.8) + 0.0015;
    const z = 0.28 * v * v;
    P.push(-w, v, z, w, v, z);
    const c = lerp(0.42, 1.05, v);
    C.push(c, c, c, c, c, c);
    if (i < seg) {
      const a = i * 2;
      I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setIndex(I);
  g.computeVertexNormals();
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) {
    const v = new THREE.Vector3(n.getX(i), n.getY(i), n.getZ(i)).multiplyScalar(0.35).add(new THREE.Vector3(0, 0.8, 0)).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

/**
 * 넓이 비례 표면 표본 (MeshSurfaceSampler 와 같은 방식) — 누적 넓이 표를 나눠서 만든다.
 * 삼각형을 넓이에 비례해 고르고, 그 안의 점은 균일한 무게중심 좌표로.
 */
function* areaSampler(geo: THREE.BufferGeometry, rng: () => number): G<{ sample(p: THREE.Vector3, n: THREE.Vector3): void }> {
  const P = geo.getAttribute('position').array as Float32Array;
  const Nn = geo.getAttribute('normal').array as Float32Array;
  const I = geo.getIndex()!.array as ArrayLike<number>;
  const T = I.length / 3;
  const cum = new Float32Array(T);
  let tot = 0;
  for (let t = 0; t < T; t++) {
    if ((t & 2047) === 2047 && late()) yield;
    const a = I[t * 3]! * 3;
    const b = I[t * 3 + 1]! * 3;
    const c = I[t * 3 + 2]! * 3;
    const ux = P[b]! - P[a]!;
    const uy = P[b + 1]! - P[a + 1]!;
    const uz = P[b + 2]! - P[a + 2]!;
    const vx = P[c]! - P[a]!;
    const vy = P[c + 1]! - P[a + 1]!;
    const vz = P[c + 2]! - P[a + 2]!;
    tot += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    cum[t] = tot;
  }
  return {
    sample(p, n) {
      const r = rng() * tot;
      let lo = 0;
      let hi = T - 1;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (cum[m]! < r) lo = m + 1;
        else hi = m;
      }
      let u = rng();
      let v = rng();
      if (u + v > 1) {
        u = 1 - u;
        v = 1 - v;
      }
      const w = 1 - u - v;
      const a = I[lo * 3]! * 3;
      const b = I[lo * 3 + 1]! * 3;
      const c = I[lo * 3 + 2]! * 3;
      p.set(P[a]! * w + P[b]! * u + P[c]! * v, P[a + 1]! * w + P[b + 1]! * u + P[c + 1]! * v, P[a + 2]! * w + P[b + 2]! * u + P[c + 2]! * v);
      n.set(Nn[a]! * w + Nn[b]! * u + Nn[c]! * v, Nn[a + 1]! * w + Nn[b + 1]! * u + Nn[c + 1]! * v, Nn[a + 2]! * w + Nn[b + 2]! * u + Nn[c + 2]! * v).normalize();
    },
  };
}

type Inst = { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3; birth: number };

function scatterDemo(): Scene3D {
  const scene = new THREE.Scene();
  const bg = bgTex('#16304a', '#4f8fa8');
  scene.background = bg;
  addLights(scene, { sky: 0xe6f4ff, ground: 0x4a5a3a, hemi: 1.0, sun: 2.8, dir: [-3, 6, 3], ext: 2.8 });
  const env = new Env();
  const camera = new THREE.PerspectiveCamera(36, 1.6, 0.1, 50);
  const tags = new Tags(2, ['rgba(12,16,34,0.72)', 'rgba(40,90,60,0.85)']);
  // 디오라마 바다
  const water = new THREE.Mesh(new THREE.CircleGeometry(3.3, 96).rotateX(-PI / 2), new THREE.MeshPhysicalMaterial({ color: 0x2c8fb0, transparent: true, opacity: 0.74, roughness: 0.2, envMapIntensity: 0.35 }));
  water.position.y = 0.0;
  const seabed = new THREE.Mesh(new THREE.CircleGeometry(3.3, 96).rotateX(-PI / 2), new THREE.MeshStandardMaterial({ color: 0x8fae9a, roughness: 1 }));
  seabed.position.y = -0.43;
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.3, 0.46, 96, 1, true), new THREE.MeshStandardMaterial({ color: 0x1f5f7a, roughness: 0.6 }));
  wall.position.y = -0.22;
  seabed.receiveShadow = true;
  scene.add(water, seabed, wall);

  const blade = bladeGeo();
  const bladeMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.75 });
  const stemG = new THREE.CylinderGeometry(0.0035, 0.005, 0.1, 5).translate(0, 0.05, 0);
  const petals: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 5; k++) {
    const g = new THREE.SphereGeometry(1, 10, 6).scale(0.026, 0.006, 0.015).translate(0.022, 0, 0).rotateY((k / 5) * TAU).translate(0, 0.1, 0);
    petals.push(g);
  }
  const petalG = mergeGeometries(petals)!;
  for (const g of petals) g.dispose();
  const centerG = new THREE.SphereGeometry(0.011, 10, 6).translate(0, 0.104, 0);
  const pebbleG = new THREE.IcosahedronGeometry(1, 1);
  const green = new THREE.MeshStandardMaterial({ color: 0x4f9a3a, roughness: 0.7 });
  const petalMat = new THREE.MeshStandardMaterial({ roughness: 0.55 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xffc83d, roughness: 0.5 });
  const pebbleMat = new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true });
  const islandMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });

  let seed = 21;
  let density = 1;
  let th = 0.82;
  let on = true;
  let ms = 0;
  let island: THREE.Mesh | null = null;
  let meshes: THREE.InstancedMesh[] = [];
  let groups: { list: Inst[]; meshes: THREE.InstancedMesh[]; delay: number }[] = [];
  const counts = [0, 0, 0];

  function height(x: number, z: number, s: number, hill: [number, number], mound: [number, number]): number {
    const ang = Math.atan2(z, x);
    const warp = 1 + 0.36 * (fbm2(Math.cos(ang) * 1.3 + 5, Math.sin(ang) * 1.3, s, 3) - 0.5);
    const r = Math.hypot(x, z) / (1.6 * warp);
    let h = lerp(0.3, -0.42, smooth(0.5, 1.12, r));
    h += 0.06 * smooth(0.8, 0.3, r);
    const hd = Math.hypot(x - hill[0], z - hill[1]) + (fbm2(x * 2, z * 2, s + 3, 3) - 0.5) * 0.3;
    h += 0.4 * smooth(0.52, 0.36, hd);
    h += 0.13 * Math.exp(-((x - mound[0]) ** 2 + (z - mound[1]) ** 2) / 0.14);
    h += (fbm2(x * 1.8, z * 1.8, s + 7, 3) - 0.5) * 0.12 * smooth(1.15, 0.6, r);
    return h;
  }

  const job = new Job();
  const warm = new Warm();
  function build(): void {
    job.start(buildG());
  }
  function* buildG(): G {
    if (island) {
      scene.remove(island);
      island.geometry.dispose();
    }
    for (const m of meshes) {
      scene.remove(m);
      m.dispose();
    }
    meshes = [];
    groups = [];
    const rng = rngOf(seed);
    const s = Math.floor(rng() * 9999);
    const ha = rng() * TAU;
    const hill: [number, number] = [Math.cos(ha) * 0.55, Math.sin(ha) * 0.45];
    const mound: [number, number] = [-hill[0] * 0.9 + (rng() - 0.5) * 0.4, -hill[1] * 0.9 + (rng() - 0.5) * 0.4];
    const g = new THREE.PlaneGeometry(4.4, 4.4, 150, 150);
    yield;
    g.rotateX(-PI / 2);
    yield;
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      if ((i & 511) === 511 && late()) yield;
      pos.setY(i, height(pos.getX(i), pos.getZ(i), s, hill, mound));
    }
    yield;
    g.computeVertexNormals();
    yield;
    const nor = g.getAttribute('normal');
    const col = new Float32Array(pos.count * 3);
    const sand = new THREE.Color(0xe8d49a);
    const deep = new THREE.Color(0x8fae9a);
    const dirt = new THREE.Color(0x9b7b5b);
    const rock = new THREE.Color(0x8c8a86);
    const g1 = new THREE.Color(0x5fa840);
    const g2 = new THREE.Color(0x9ccc5a);
    const c = new THREE.Color();
    const c2 = new THREE.Color();
    yield;
    for (let i = 0; i < pos.count; i++) {
      if ((i & 511) === 511 && late()) yield;
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const ny = nor.getY(i);
      const nz = fbm2(x * 3, z * 3, s + 9, 3);
      c.copy(g1).lerp(g2, smooth(0.35, 0.7, nz));
      c2.copy(dirt).lerp(rock, smooth(0.4, 0.6, fbm2(x * 6, z * 6, s + 2, 2)));
      c.lerp(c2, smooth(th - 0.02, th - 0.12, ny));
      c.lerp(sand, smooth(0.09, 0.03, y));
      c.lerp(deep, smooth(-0.05, -0.4, y));
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    island = new THREE.Mesh(g, islandMat);
    island.receiveShadow = true;
    island.castShadow = true;
    const isl = island;
    warm.add(isl, scene, () => island === isl);

    // 넓이 비례 표본 → 규칙
    yield;
    const sampler = yield* areaSampler(g, rng);
    yield;
    const N = Math.round(26000 * density);
    const grass: Inst[] = [];
    const flowers: Inst[] = [];
    const flowerC: THREE.Color[] = [];
    const pebbles: Inst[] = [];
    const pebC: THREE.Color[] = [];
    const grassC: THREE.Color[] = [];
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const origin = new THREE.Vector3(hill[0], 0, hill[1]);
    const FC = [0xff8fb1, 0xfff6e8, 0xffd84d, 0xc39bff, 0x8fd0ff];
    const birth = (q: THREE.Vector3): number => Math.hypot(q.x - origin.x, q.z - origin.z) * 0.55 + rng() * 0.25;
    const orient = (nn: THREE.Vector3, lean: number): THREE.Quaternion => {
      const dir = up.clone().lerp(nn, lean).normalize();
      return new THREE.Quaternion().setFromUnitVectors(up, dir).multiply(new THREE.Quaternion().setFromAxisAngle(up, rng() * TAU));
    };
    for (let i = 0; i < N; i++) {
      if ((i & 255) === 255 && late()) yield;
      sampler.sample(p, n);
      const y = p.y;
      const r = rng();
      if (y < -0.03) {
        if (r < 0.03) {
          const sc = 0.02 + rng() * 0.03;
          pebbles.push({ p: p.clone(), q: orient(n, 1), s: new THREE.Vector3(sc, sc * 0.55, sc * 0.8), birth: birth(p) });
          pebC.push(new THREE.Color().setHSL(0.08, 0.15, 0.5 + rng() * 0.25));
        }
      } else if (y < 0.075) {
        if (r < 0.12) {
          const sc = 0.018 + rng() * 0.03;
          pebbles.push({ p: p.clone(), q: orient(n, 1), s: new THREE.Vector3(sc, sc * 0.55, sc * 0.8), birth: birth(p) });
          pebC.push(new THREE.Color().setHSL(0.08, 0.12, 0.55 + rng() * 0.3));
        }
      } else if (n.y < th) {
        if (r < 0.06) {
          const big = rng() < 0.12;
          const sc = big ? 0.06 + rng() * 0.07 : 0.02 + rng() * 0.03;
          pebbles.push({ p: p.clone(), q: orient(n, 1), s: new THREE.Vector3(sc, sc * 0.6, sc * 0.85), birth: birth(p) });
          pebC.push(new THREE.Color().setHSL(0.07, 0.1, 0.38 + rng() * 0.25));
        }
      } else {
        const patch = fbm2(p.x * 2.4, p.z * 2.4, s + 11, 3);
        if (patch > 0.52 && r < 0.22 && n.y > th + 0.05) {
          const sc = 0.8 + rng() * 0.5;
          flowers.push({ p: p.clone(), q: orient(n, 0.2), s: new THREE.Vector3(sc, sc, sc), birth: birth(p) + 0.5 });
          flowerC.push(new THREE.Color(FC[Math.floor(fbm2(p.x * 1.3, p.z * 1.3, s + 13, 2) * 10) % FC.length]!));
        } else if (r < 0.8 * smooth(0.3, 0.55, patch + 0.25)) {
          const hh = 0.06 + rng() * 0.07;
          grass.push({ p: p.clone(), q: orient(n, 0.3), s: new THREE.Vector3(1, hh, hh), birth: birth(p) + 0.2 });
          grassC.push(new THREE.Color(0x6bb24a).lerp(new THREE.Color(0xb7d65a), rng() * 0.6 + (patch - 0.5)));
        }
      }
    }
    ms = job.spent;
    counts[0] = grass.length;
    counts[1] = flowers.length;
    counts[2] = pebbles.length;
    const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, list: Inst[], cols: THREE.Color[] | null, shadow: boolean): THREE.InstancedMesh => {
      const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
      m.count = list.length;
      if (cols) cols.forEach((cc, i) => m.setColorAt(i, cc));
      m.castShadow = shadow;
      m.receiveShadow = true;
      warm.add(m, scene, () => meshes.includes(m));
      meshes.push(m);
      return m;
    };
    groups.push({ list: pebbles, meshes: [inst(pebbleG, pebbleMat, pebbles, pebC, true)], delay: 0 });
    groups.push({ list: grass, meshes: [inst(blade, bladeMat, grass, grassC, false)], delay: 0 });
    groups.push({ list: flowers, meshes: [inst(stemG, green, flowers, null, false), inst(petalG, petalMat, flowers, flowerC, true), inst(centerG, yellow, flowers, null, false)], delay: 0 });
    islandMat.wireframe = wireOn;
    lastK = -1;
  }
  let wireOn = false;
  let lastK = -1;
  build();

  const CYC = 6.5;
  const mtx = new THREE.Matrix4();
  const sv = new THREE.Vector3();
  return {
    scene,
    camera,
    update(t) {
      const a = t * 0.12 + 0.6;
      camera.position.set(Math.sin(a) * 3.5, 2.3, Math.cos(a) * 3.5);
      camera.lookAt(0, 0.12, 0);
      if (job.busy) job.step();
      const p = t % CYC;
      const grow = p - 0.3;
      const shrink = easeIO(sat((p - 5.7) / 0.5));
      const k = on ? Math.round((grow < 3.2 ? grow : 3.2) * 60) / 60 + shrink * 10 : -5;
      if (k === lastK) return;
      lastK = k;
      for (const gr of groups) {
        gr.list.forEach((it, i) => {
          const s0 = on ? easeBack(sat((grow - it.birth) / 0.45)) * (1 - shrink) : 0;
          sv.copy(it.s).multiplyScalar(s0 + 1e-4);
          mtx.compose(it.p, it.q, sv);
          for (const m of gr.meshes) m.setMatrixAt(i, mtx);
        });
        for (const m of gr.meshes) m.instanceMatrix.needsUpdate = true;
      }
    },
    render(r, w, h) {
      env.apply(r, scene, 0.35);
      tags.set(0, job.busy ? `섬 만들고 흩뿌리는 중 · 나눠서 ${job.spent.toFixed(0)}ms` : `풀 ${fmt(counts[0]!)} · 꽃 ${fmt(counts[1]!)} · 자갈 ${fmt(counts[2]!)} · 표본 ${fmt(26000 * density)}개 · ${ms.toFixed(0)}ms`);
      tags.set(1, on ? '완만한 곳 → 풀 · 꽃 / 가파른 곳 · 물가 → 자갈' : '흩뿌리기 끔 — 맨 땅');
      if (warm.tick(r, scene, camera, 0x24506a)) shadowed(r, () => r.render(scene, camera));
      tags.draw(r, w, h, [
        [0.02, 0.06, -1],
        [0.5, 0.92, 0],
      ]);
    },
    controls: [
      { type: 'toggle', label: '흩뿌리기', value: true, on: (v) => ((on = v), (lastK = -99)) },
      {
        type: 'range',
        label: '밀도',
        min: 0.2,
        max: 2,
        step: 0.1,
        value: 1,
        on: (v) => {
          density = v;
          build();
        },
      },
      {
        type: 'range',
        label: '경사 문턱 (풀이 자라는 기울기)',
        min: 0.5,
        max: 0.97,
        step: 0.01,
        value: 0.82,
        on: (v) => {
          th = v;
          build();
        },
      },
      {
        type: 'toggle',
        label: '와이어프레임 (섬)',
        value: false,
        on: (v) => {
          wireOn = v;
          islandMat.wireframe = v;
        },
      },
      {
        type: 'button',
        label: '새로 만들기',
        on: () => {
          seed = (seed * 7919 + 13) % 100000;
          build();
        },
      },
    ] as Control[],
    dispose() {
      island?.geometry.dispose();
      for (const m of meshes) m.dispose();
      for (const x of [blade, stemG, petalG, centerG, pebbleG]) x.dispose();
      for (const x of [bladeMat, green, petalMat, yellow, pebbleMat, islandMat]) x.dispose();
      freeAll(water);
      freeAll(seabed);
      freeAll(wall);
      bg.dispose();
      env.dispose();
      tags.dispose();
    },
  };
}

export const DEMOS: DemoMap = {
  i455: { kind: '3d', caption: '섬 표면을 넓이 비례로 뽑아 경사 · 높이 규칙대로 풀잎 · 꽃 · 자갈 인스턴스가 피어남', make: () => scatterDemo() },
  i454: { kind: '3d', caption: '삼각형 2개짜리 평평한 판에 높이 그림을 법선 맵으로 구워 붙이면 — 빛이 돌 때 나무결 · 벽돌 · 비늘 요철', make: () => normalMapDemo() },
  i453: { kind: '3d', caption: '같은 무대를 반씩 — 정점마다 반구 광선으로 가려진 정도를 미리 구워 구석 · 맞닿은 곳이 어두워짐', make: () => aoDemo() },
  i452: { kind: '3d', caption: '공 → 찌그리기 → 평면 깎기 → 잡음 → 이끼 — 같은 규칙, 씨앗만 바꿔 수십 가지 돌', make: () => rocksDemo() },
  i451: { kind: '3d', caption: '합치기 → 빼기 → 겹친 곳만: 모양끼리 연산해 창 · 문 구멍 난 집과 둥근 주사위', make: () => csgDemo() },
  i450: { kind: '3d', caption: '윤곽선 한 줄을 그려 축으로 돌리면 체스 말 · 화분 · 꽃병 — 장식은 윤곽에서', make: () => latheDemo() },
};

import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TessellateModifier } from 'three/examples/jsm/modifiers/TessellateModifier.js';
import type { Control, DemoMap, Scene3D } from './types';

/**
 * 「던전 · 액션 연출」 견본 넷 (i488 ~ i491) — 디아블로풍 쿼터뷰 던전.
 *  i488 가리는 벽 투명 처리 · i489 갑옷 기사 (점토 몸 + 하드서피스 갑옷 + 리깅) · i490 던전 스킬 연출 · i491 쿼터뷰 화면 정보.
 *
 * 공용 주인공 「갑옷 기사」: 몸은 거리 함수(SDF)를 표면 그물로 뽑은 한 덩어리 점토 메시 + 뼈 18개 자동 가중치(SkinnedMesh),
 * 갑옷은 회전체 · 돌출 · 리벳으로 짠 하드서피스 부품을 뼈마다 · 재질마다 한 메시로 합쳐 뼈에 붙인다 (그리기 호출 ~25).
 * 망토 · 앞뒤 천은 베를레 천 (몸 · 다리 캡슐과 충돌). 모양 · 가중치는 모듈에 한 번만, 프레임당 3ms 씩 나눠 굽는다.
 * 던전 재질은 Poly Haven CC0 스캔 (돌바닥 · 성벽 벽돌 · 낡은 나무).
 */

type R = THREE.WebGLRenderer;
type P3 = [number, number, number];
type Gen = Generator<void, void, void>;
const FONT = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const sstep = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const damp = (dt: number, tau: number): number => 1 - Math.exp(-dt / Math.max(1e-4, tau));
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ───────────── 나눠 굽기 — 모든 카드가 한 프레임에 합쳐 3ms ───────────── */

let DEADLINE = Infinity;
const late = (): boolean => performance.now() > DEADLINE;
let frameT0 = -1e9;
let spent = 0;
/** 이번 프레임에 남은 굽기 시간 (ms) */
function budget(max = 3): number {
  const now = performance.now();
  if (now - frameT0 > 10) {
    frameT0 = now;
    spent = 0;
  }
  return max - spent;
}
/** 생성기를 ms 만큼 돌린다 — 끝났으면 true */
function runGen(it: Gen, ms: number): boolean {
  if (ms <= 0.25) return false;
  const t0 = performance.now();
  DEADLINE = t0 + ms;
  let done = false;
  try {
    done = !!it.next().done;
  } finally {
    DEADLINE = Infinity;
    spent += performance.now() - t0;
  }
  return done;
}
class Job {
  private it: Gen | null = null;
  start(g: Gen): void {
    this.it = g;
  }
  get busy(): boolean {
    return this.it !== null;
  }
  step(): void {
    if (this.it && runGen(this.it, budget())) this.it = null;
  }
}

/* ───────────── 무료 재질 (Poly Haven CC0) — 한 번만 받아 같이 쓴다 ───────────── */

type SetId = 'rock' | 'brick' | 'planks';
type Kind = 'diff' | 'nor' | 'arm';
const PH = (f: string): string => new URL(`../assets/polyhaven/${f}`, import.meta.url).href;
const SRC: Record<SetId, Record<Kind, string>> = {
  rock: { diff: PH('rock_tile_floor_diff_1k.jpg'), nor: PH('rock_tile_floor_nor_gl_1k.jpg'), arm: PH('rock_tile_floor_arm_1k.jpg') },
  brick: { diff: PH('castle_brick_07_diff_1k.jpg'), nor: PH('castle_brick_07_nor_gl_1k.jpg'), arm: PH('castle_brick_07_arm_1k.jpg') },
  planks: { diff: PH('worn_planks_diff_1k.jpg'), nor: PH('worn_planks_nor_gl_1k.jpg'), arm: PH('worn_planks_arm_1k.jpg') },
};
interface PBR {
  map: THREE.Texture;
  normal: THREE.Texture;
  arm: THREE.Texture;
}
function texFrom(img: ImageBitmap | null, kind: Kind): THREE.Texture {
  let t: THREE.Texture;
  if (img) t = new THREE.Texture(img);
  else {
    const px = kind === 'diff' ? [110, 100, 92, 255] : kind === 'nor' ? [128, 128, 255, 255] : [255, 200, 0, 255];
    t = new THREE.DataTexture(new Uint8Array(px), 1, 1);
  }
  t.flipY = false;
  t.colorSpace = kind === 'diff' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 16;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}
function bitmap(url: string): Promise<ImageBitmap | null> {
  return fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.blob();
    })
    .then((b) => createImageBitmap(b, { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' }))
    .catch((e) => {
      console.warn('[studio] 재질을 못 받았어요', url, e);
      return null;
    });
}
const HDR_URL = PH('studio_small_09_1k.hdr');
interface Kit {
  pbr: Record<SetId, PBR>;
  hdr: THREE.DataTexture | null;
}
let kitP: Promise<Kit> | null = null;
function loadKit(): Promise<Kit> {
  if (kitP) return kitP;
  const one = (s: SetId): Promise<PBR> =>
    Promise.all([bitmap(SRC[s].diff), bitmap(SRC[s].nor), bitmap(SRC[s].arm)]).then(([d, n, a]) => ({ map: texFrom(d, 'diff'), normal: texFrom(n, 'nor'), arm: texFrom(a, 'arm') }));
  const hdr = new HDRLoader()
    .loadAsync(HDR_URL)
    .then((t) => {
      t.mapping = THREE.EquirectangularReflectionMapping;
      return t as THREE.DataTexture | null;
    })
    .catch(() => null);
  kitP = Promise.all([one('rock'), one('brick'), one('planks'), hdr]).then(([rock, brick, planks, h]) => ({ pbr: { rock, brick, planks }, hdr: h }));
  return kitP;
}
/** 같은 그림을 반복만 다르게 — GPU 에 다시 안 올린다 */
function rep(t: THREE.Texture, x: number, y = x): THREE.Texture {
  const c = new THREE.Texture();
  c.source = t.source;
  c.flipY = t.flipY;
  c.colorSpace = t.colorSpace;
  c.wrapS = c.wrapT = THREE.RepeatWrapping;
  c.anisotropy = t.anisotropy;
  c.generateMipmaps = t.generateMipmaps;
  c.minFilter = t.minFilter;
  c.repeat.set(x, y);
  c.version = Math.max(1, t.version);
  return c;
}
function pbrMat(p: PBR, rx: number, ry = rx, o: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const arm = rep(p.arm, rx, ry);
  return new THREE.MeshStandardMaterial({ map: rep(p.map, rx, ry), normalMap: rep(p.normal, rx, ry), aoMap: arm, roughnessMap: arm, metalnessMap: arm, roughness: 1, metalness: 1, ...o });
}

/** HDRI → PMREM 은 렌더러마다 한 번 (셰이더는 compileAsync 로 미리 병렬 컴파일) */
interface PmremPriv {
  _setSize(n: number): void;
  _allocateTargets(): THREE.WebGLRenderTarget;
  _compileMaterial(m: THREE.Material): void;
  _blurMaterial: THREE.Material | null;
  _ggxMaterial: THREE.Material | null;
  _equirectMaterial: THREE.Material | null;
  compileEquirectangularShader(): void;
}
const pmrems = new WeakMap<R, THREE.Texture | 'busy'>();
function envFor(r: R, hdr: THREE.DataTexture): THREE.Texture | null {
  const e = pmrems.get(r);
  if (e === 'busy') return null;
  if (e) return e;
  pmrems.set(r, 'busy');
  const pm = new THREE.PMREMGenerator(r);
  const pv = pm as unknown as PmremPriv;
  let target: THREE.WebGLRenderTarget | null = null;
  let warm: Promise<unknown> = Promise.resolve();
  try {
    pv._setSize(hdr.image.width / 4);
    target = pv._allocateTargets();
    const real = pv._compileMaterial;
    pv._compileMaterial = () => {};
    pv.compileEquirectangularShader();
    pv._compileMaterial = real;
    const sc = new THREE.Scene();
    const geo = new THREE.BufferGeometry();
    for (const m of [pv._equirectMaterial, pv._blurMaterial, pv._ggxMaterial]) if (m) sc.add(new THREE.Mesh(geo, m));
    const old = r.getRenderTarget();
    r.setRenderTarget(target);
    warm = r.compileAsync(sc, new THREE.OrthographicCamera());
    r.setRenderTarget(old);
  } catch {
    target = null;
  }
  const bake = (): void => {
    const tex = target ? pm.fromEquirectangular(hdr, target).texture : pm.fromEquirectangular(hdr).texture;
    pm.dispose();
    pmrems.set(r, tex);
  };
  warm.then(bake, bake);
  return null;
}
const uploaded = new WeakMap<R, WeakSet<object>>();
/** 텍스처를 프레임당 3ms 까지만 GPU 에 올린다 — 다 올렸으면 true */
function pump(r: R, list: THREE.Texture[], ms = 3): boolean {
  let done = uploaded.get(r);
  if (!done) uploaded.set(r, (done = new WeakSet()));
  const t0 = performance.now();
  for (const t of list) {
    if (done.has(t.source)) continue;
    if (performance.now() - t0 > ms) return false;
    r.initTexture(t);
    done.add(t.source);
  }
  return true;
}
function sceneTex(root: THREE.Object3D): THREE.Texture[] {
  const out: THREE.Texture[] = [];
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (!m) return;
    for (const x of Array.isArray(m) ? m : [m]) {
      const s = x as THREE.MeshStandardMaterial;
      for (const t of [s.map, s.normalMap, s.aoMap, s.roughnessMap, s.metalnessMap, s.emissiveMap, s.alphaMap]) if (t) out.push(t);
    }
  });
  return out;
}
/** 렌더러마다 한 번 compileAsync */
class Warm {
  private st = new WeakMap<R, 1 | 2>();
  ready(r: R, go: (r: R) => Promise<unknown>): boolean {
    const s = this.st.get(r);
    if (s === 2) return true;
    if (s === 1) return false;
    this.st.set(r, 1);
    const fin = (): void => void this.st.set(r, 2);
    go(r).then(fin, fin);
    return false;
  }
  reset(): void {
    this.st = new WeakMap();
  }
}
function withShadows<X>(r: R, fn: () => X): X {
  const en = r.shadowMap.enabled;
  const ty = r.shadowMap.type;
  const ck = r.debug.checkShaderErrors;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFShadowMap;
  r.debug.checkShaderErrors = false;
  try {
    return fn();
  } finally {
    r.shadowMap.enabled = en;
    r.shadowMap.type = ty;
    r.debug.checkShaderErrors = ck;
  }
}

/* ───────────── 글씨 (장면 위 정사영 층) ───────────── */

class Label {
  readonly canvas = document.createElement('canvas');
  readonly tex: THREE.CanvasTexture;
  readonly spr: THREE.Sprite;
  aspect = 1;
  text = '';
  bg = '';
  fg = '';
  visible = true;
  constructor(
    text: string,
    public fx: number,
    public fy: number,
    ax: number,
    ay: number,
    public size: number,
    bg = 'rgba(10,8,14,0.74)',
    fg = '#ffffff',
  ) {
    this.canvas.width = 512;
    this.canvas.height = 80;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, depthTest: false, depthWrite: false, toneMapped: false, transparent: true }));
    this.spr.center.set(ax, ay);
    this.spr.renderOrder = 50;
    this.set(text, bg, fg, true);
  }
  set(text: string, bg = this.bg, fg = this.fg, force = false): void {
    if (!force && text === this.text && bg === this.bg && fg === this.fg) return;
    this.text = text;
    this.bg = bg;
    this.fg = fg;
    const W = 512;
    const H = 80;
    const g = this.canvas.getContext('2d')!;
    g.clearRect(0, 0, W, H);
    g.font = `700 40px ${FONT}`;
    const tw = Math.min(W - 40, g.measureText(text).width);
    const used = Math.min(W, Math.ceil(tw + 40));
    const x0 = (W - used) / 2;
    if (bg !== 'none') {
      g.fillStyle = bg;
      g.beginPath();
      g.roundRect(x0 + 2, 8, used - 4, H - 16, 28);
      g.fill();
    } else {
      g.lineWidth = 7;
      g.strokeStyle = 'rgba(0,0,0,0.85)';
      g.lineJoin = 'round';
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (bg === 'none') g.strokeText(text, W / 2, H / 2 + 2, W - 40);
    g.fillStyle = fg;
    g.fillText(text, W / 2, H / 2 + 2, W - 40);
    this.tex.repeat.set(used / W, 1);
    this.tex.offset.set(x0 / W, 0);
    this.tex.needsUpdate = true;
    this.aspect = used / H;
  }
  dispose(): void {
    this.tex.dispose();
    this.spr.material.dispose();
  }
}
class Hud {
  readonly scene = new THREE.Scene();
  readonly cam = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10);
  readonly labels: Label[] = [];
  private warm = new Warm();
  private alive = true;
  constructor() {
    document.fonts?.ready.then(() => {
      if (this.alive) for (const l of this.labels) l.set(l.text, l.bg, l.fg, true);
    });
  }
  label(text: string, fx: number, fy: number, ax = 0.5, ay = 0.5, size = 1, bg?: string, fg?: string): Label {
    const l = new Label(text, fx, fy, ax, ay, size, bg, fg);
    this.labels.push(l);
    this.scene.add(l.spr);
    return l;
  }
  /** 장면 위에 덧그리기 (extra = 같은 정사영 층에 더 그릴 것) */
  draw(r: R, w: number, h: number, extra?: (w: number, h: number) => void): void {
    if (!this.warm.ready(r, (rr) => rr.compileAsync(this.scene, this.cam))) return;
    this.cam.right = w;
    this.cam.top = h;
    this.cam.updateProjectionMatrix();
    const px = clamp(h * 0.1, 15, 40);
    for (const l of this.labels) {
      l.spr.visible = l.visible;
      const s = Math.min(px * l.size, (w * 0.92) / l.aspect);
      l.spr.scale.set(s * l.aspect, s, 1);
      l.spr.position.set(l.fx * w, l.fy * h, 0);
    }
    extra?.(w, h);
    const ac = r.autoClear;
    r.autoClear = false;
    r.setViewport(0, 0, w, h);
    r.render(this.scene, this.cam);
    r.autoClear = ac;
  }
  dispose(): void {
    this.alive = false;
    for (const l of this.labels) l.dispose();
  }
}

/* ───────────── 빛 무리 · 접촉 그늘 ───────────── */

let glowTex: THREE.CanvasTexture | null = null;
function glow(): THREE.CanvasTexture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  rg.addColorStop(0.5, 'rgba(255,255,255,0.12)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}
function glowSprite(color: number, scale: number, opacity = 1): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  s.scale.setScalar(scale);
  return s;
}
let blobT: THREE.CanvasTexture | null = null;
function blobTex(): THREE.CanvasTexture {
  if (blobT) return blobT;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, 'rgba(0,0,0,0.85)');
  rg.addColorStop(0.45, 'rgba(0,0,0,0.42)');
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 128, 128);
  blobT = new THREE.CanvasTexture(c);
  return blobT;
}
function blob(size: number, opacity = 0.7): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false, opacity, color: 0x000000, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}
function disposeTree(root: THREE.Object3D, keepGeo?: Set<THREE.BufferGeometry>): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !keepGeo?.has(m.geometry)) m.geometry.dispose();
    const mat = m.material;
    if (mat) for (const x of Array.isArray(mat) ? mat : [mat]) x.dispose();
  });
}

/* ───────────── 잡음 텍스처 (한 번 굽기 — 셰이더는 읽기만, 반복문 없음) ───────────── */

function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** 주기 fx × fy 로 이어지는 값 잡음 (u, v ∈ [0,1)) */
function vnoise(u: number, v: number, fx: number, fy: number, seed: number): number {
  const x = u * fx;
  const y = v * fy;
  const X = Math.floor(x);
  const Y = Math.floor(y);
  const tx = x - X;
  const ty = y - Y;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const x0 = ((X % fx) + fx) % fx;
  const y0 = ((Y % fy) + fy) % fy;
  const x1 = (x0 + 1) % fx;
  const y1 = (y0 + 1) % fy;
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
}
let NOISE: THREE.DataTexture | null = null;
function* bakeNoise(): Gen {
  if (NOISE) return;
  const N = 128;
  const d = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    const v = y / N;
    for (let x = 0; x < N; x++) {
      const u = x / N;
      let f = 0;
      let a = 0.5;
      let fr = 4;
      for (let o = 0; o < 4; o++) {
        f += vnoise(u, v, fr, fr, 11 + o) * a;
        a *= 0.5;
        fr *= 2;
      }
      const blot = vnoise(u, v, 3, 3, 41) * 0.65 + vnoise(u, v, 6, 6, 42) * 0.35;
      const st = vnoise(u, v, 64, 4, 57);
      const scr = Math.pow(1 - Math.abs(2 * st - 1), 9);
      const f2 = vnoise(u, v, 8, 8, 77) * 0.6 + vnoise(u, v, 16, 16, 78) * 0.4;
      const i = (y * N + x) * 4;
      d[i] = Math.round(clamp(f / 0.9375, 0, 1) * 255);
      d[i + 1] = Math.round(blot * 255);
      d[i + 2] = Math.round(scr * 255);
      d[i + 3] = Math.round(f2 * 255);
    }
    if ((y & 7) === 7 && late()) yield;
  }
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  NOISE = t;
}

/* ───────────── 닳은 금속 재질 (모서리 윤 · 얼룩 · 긁힘 · 칠 벗겨짐) ───────────── */

const WEAR_VH = /* glsl */ `
attribute float aEdge;
varying float vEdge; varying vec3 vOP; varying vec3 vON;`;
const WEAR_VB = /* glsl */ `
vEdge = aEdge; vOP = position; vON = normal;`;
const WEAR_FH = /* glsl */ `
uniform sampler2D uNoise; uniform vec3 uBare; uniform float uPaint, uTarnish, uNScale;
varying float vEdge; varying vec3 vOP; varying vec3 vON;
float wDirt = 0.0; float wChip = 0.0; float wScr = 0.0; float wN = 0.5; float wEdge = 0.0;`;
const WEAR_FC = /* glsl */ `
{
  vec3 bw = abs(normalize(vON)); bw = bw * bw; bw /= (bw.x + bw.y + bw.z);
  vec3 p = vOP * uNScale;
  vec4 n1 = texture2D(uNoise, p.xy) * bw.z + texture2D(uNoise, p.zy) * bw.x + texture2D(uNoise, p.xz) * bw.y;
  vec3 q = vOP * uNScale * 3.3 + 0.37;
  vec4 n2 = texture2D(uNoise, q.xy) * bw.z + texture2D(uNoise, q.zy) * bw.x + texture2D(uNoise, q.xz) * bw.y;
  wEdge = clamp(vEdge, 0.0, 1.0);
  wN = n1.a;
  wDirt = smoothstep(0.42, 0.82, n1.g) * uTarnish * (1.0 - wEdge);
  wScr = n2.b;
  if (uPaint > 0.5) {
    float c = wEdge * 1.25 + (n1.r - 0.5) * 1.1 + (n2.r - 0.5) * 0.6;
    wChip = smoothstep(0.62, 0.7, c) + smoothstep(0.55, 0.9, n2.b) * 0.6;
    wChip = clamp(wChip, 0.0, 1.0);
    diffuseColor.rgb *= 0.88 + 0.24 * n1.r;
    diffuseColor.rgb = mix(diffuseColor.rgb, uBare * (0.8 + 0.4 * n2.r), wChip);
  } else {
    diffuseColor.rgb *= 0.84 + 0.3 * n1.r;
    diffuseColor.rgb = mix(diffuseColor.rgb, uBare, wEdge * 0.6);
    diffuseColor.rgb += wScr * 0.045;
  }
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.42, 0.36, 0.3), wDirt);
}`;
const WEAR_FR = /* glsl */ `
roughnessFactor = clamp(roughnessFactor * (0.78 + 0.5 * wN) - wEdge * 0.1 * (1.0 - uPaint) + wDirt * 0.3 + wScr * 0.12, 0.05, 1.0);
roughnessFactor = mix(roughnessFactor, 0.32, wChip);`;
const WEAR_FM = /* glsl */ `
metalnessFactor = mix(metalnessFactor, 1.0, wChip);`;
interface WearOpt {
  bare: number;
  paint?: boolean;
  tarnish?: number;
  scale?: number;
}
function wear<M extends THREE.MeshStandardMaterial>(m: M, o: WearOpt): M {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      uNoise: { value: NOISE },
      uBare: { value: new THREE.Color(o.bare) },
      uPaint: { value: o.paint ? 1 : 0 },
      uTarnish: { value: o.tarnish ?? 0.6 },
      uNScale: { value: o.scale ?? 3.2 },
    });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>' + WEAR_VH).replace('#include <begin_vertex>', '#include <begin_vertex>' + WEAR_VB);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>' + WEAR_FH)
      .replace('#include <color_fragment>', '#include <color_fragment>' + WEAR_FC)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>' + WEAR_FR)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>' + WEAR_FM);
  };
  m.customProgramCacheKey = () => 'dia-wear-1';
  return m;
}

/* ───────────── 하드서피스 모양 도우미 (모서리 값 aEdge 포함) ───────────── */

/** 같은 자리 정점들의 법선이 갈라진 정도 = 날카로운 모서리 (기존 aEdge 와 큰 쪽) */
function edgeAttr(g: THREE.BufferGeometry): void {
  const pos = g.getAttribute('position').array as ArrayLike<number>;
  const nor = g.getAttribute('normal').array as ArrayLike<number>;
  const old = g.getAttribute('aEdge') as THREE.BufferAttribute | undefined;
  const n = pos.length / 3;
  let size = 1;
  while (size < n * 2) size <<= 1;
  const table = new Int32Array(size).fill(-1);
  const keys: number[] = [];
  const gid = new Int32Array(n);
  const sum = new Float32Array(n * 4);
  let groups = 0;
  for (let i = 0; i < n; i++) {
    const qx = Math.round(pos[i * 3]! * 20000);
    const qy = Math.round(pos[i * 3 + 1]! * 20000);
    const qz = Math.round(pos[i * 3 + 2]! * 20000);
    let s = (Math.imul(qx, 73856093) ^ Math.imul(qy, 19349663) ^ Math.imul(qz, 83492791)) & (size - 1);
    for (;;) {
      const id = table[s]!;
      if (id < 0) {
        table[s] = groups;
        keys.push(qx, qy, qz);
        gid[i] = groups++;
        break;
      }
      if (keys[id * 3] === qx && keys[id * 3 + 1] === qy && keys[id * 3 + 2] === qz) {
        gid[i] = id;
        break;
      }
      s = (s + 1) & (size - 1);
    }
    const o = gid[i]! * 4;
    sum[o] = sum[o]! + nor[i * 3]!;
    sum[o + 1] = sum[o + 1]! + nor[i * 3 + 1]!;
    sum[o + 2] = sum[o + 2]! + nor[i * 3 + 2]!;
    sum[o + 3] = sum[o + 3]! + 1;
  }
  const e = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = gid[i]! * 4;
    const spread = 1 - Math.hypot(sum[o]!, sum[o + 1]!, sum[o + 2]!) / sum[o + 3]!;
    e[i] = Math.max(clamp(spread * 3.2, 0, 1), old ? old.getX(i) : 0);
  }
  g.setAttribute('aEdge', new THREE.BufferAttribute(e, 1));
}
/** 날 세운 법선 + 모서리 값 + 위치 · 법선 · aEdge 만 남김 (합치기 쉽게) */
function prep(g: THREE.BufferGeometry, crease = 0.55, keepUV = false): THREE.BufferGeometry {
  if (!g.getAttribute('aEdge')) g.setAttribute('aEdge', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count), 1));
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'aEdge' && !(keepUV && k === 'uv')) g.deleteAttribute(k);
  g.scale(100, 100, 100); // toCreasedNormals 는 1/100 단위로 같은 자리를 묶는다 — cm 로 바꿔 넘긴다
  const r = toCreasedNormals(g, crease);
  if (r !== g) g.dispose();
  r.scale(0.01, 0.01, 0.01);
  edgeAttr(r);
  return r;
}
/** 회전체 [반지름, 높이] — rim: 양 끝 줄을 모서리로 (말아 붙인 테두리처럼 윤이 남) */
function latheG(prof: [number, number][], segs: number, phiStart = 0, phiLen = TAU, rim = true): THREE.LatheGeometry {
  const g = new THREE.LatheGeometry(
    prof.map(([r, y]) => new THREE.Vector2(Math.max(0.0005, r), y)),
    segs,
    phiStart,
    phiLen,
  );
  const np = prof.length;
  const cnt = g.getAttribute('position').count;
  const e = new Float32Array(cnt);
  if (rim)
    for (let i = 0; i < cnt; i++) {
      const j = i % np;
      e[i] = j === 0 || j === np - 1 ? 0.9 : j === 1 || j === np - 2 ? 0.25 : 0;
    }
  g.setAttribute('aEdge', new THREE.BufferAttribute(e, 1));
  return g;
}
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const UPV = new THREE.Vector3(0, 1, 0);
/** +Y 로 만든 모양을 dir 쪽으로 세워 pos 에 */
function orient(g: THREE.BufferGeometry, dir: THREE.Vector3 | P3, pos: THREE.Vector3 | P3, twist = 0): THREE.BufferGeometry {
  const d = Array.isArray(dir) ? new THREE.Vector3(...dir) : dir.clone();
  if (twist) g.rotateY(twist);
  _q.setFromUnitVectors(UPV, d.normalize());
  g.applyQuaternion(_q);
  const p = Array.isArray(pos) ? pos : [pos.x, pos.y, pos.z];
  g.translate(p[0]!, p[1]!, p[2]!);
  return g;
}
function tubeG(pts: THREE.Vector3[], r: number, closed = false, seg = 48, radial = 8): THREE.BufferGeometry {
  const c = new THREE.CatmullRomCurve3(pts, closed, 'centripetal');
  const g = new THREE.TubeGeometry(c, seg, r, radial, closed);
  g.setAttribute('aEdge', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(0.55), 1));
  return g;
}
/** 타원 고리 (y 높이, 반지름 rx · rz) — 금테 · 말아 붙인 가장자리. 각도 0 = 앞(+Z) */
function ringG(rx: number, rz: number, y: number, tube: number, a0 = 0, a1 = TAU, seg = 64): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const closed = a1 - a0 >= TAU - 1e-6;
  const n = closed ? seg : Math.max(8, Math.round((seg * (a1 - a0)) / TAU));
  for (let i = 0; i < (closed ? n : n + 1); i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push(new THREE.Vector3(Math.sin(a) * rx, y, Math.cos(a) * rz));
  }
  return tubeG(pts, tube, closed, n, 8);
}
let RIVET: THREE.BufferGeometry | null = null;
type Spot = { p: THREE.Vector3; n: THREE.Vector3 };
/** 리벳 (둥근 머리) — 자리 · 바깥 방향 목록 */
function rivetsG(list: Spot[], size = 0.0075): THREE.BufferGeometry {
  RIVET ??= prep(new THREE.SphereGeometry(1, 10, 5, 0, TAU, 0, Math.PI / 2), 1.2);
  const out: THREE.BufferGeometry[] = [];
  const sc = new THREE.Vector3(size, size * 0.7, size);
  for (const { p, n } of list) {
    const g = RIVET.clone();
    _q.setFromUnitVectors(UPV, _v.copy(n).normalize());
    _m.compose(p, _q, sc);
    g.applyMatrix4(_m);
    out.push(g);
  }
  const m = mergeGeometries(out)!;
  for (const g of out) g.dispose();
  return m;
}
/** 타원 둘레 리벳 자리 (y, rx, rz, 각도 목록) */
function ringSpots(rx: number, rz: number, y: number, angles: number[], push = 0): Spot[] {
  return angles.map((a) => {
    const n = new THREE.Vector3(Math.sin(a) / rx, 0, Math.cos(a) / rz).normalize();
    return { p: new THREE.Vector3(Math.sin(a) * rx, y, Math.cos(a) * rz).addScaledVector(n, push), n };
  });
}
const range = (a: number, b: number, n: number): number[] => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / Math.max(1, n - 1));
/** 모양 전체에 4×4 행렬 */
function xf(g: THREE.BufferGeometry, pos: P3, rot: P3 = [0, 0, 0], scl: P3 = [1, 1, 1]): THREE.BufferGeometry {
  _m.compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scl));
  g.applyMatrix4(_m);
  return g;
}

/* ═════════════ 갑옷 기사 — 점토 몸 (거리 함수 → 표면 그물) ═════════════ */

// 쉬는 자세 관절 (m). +Z = 앞, +X = 기사의 왼쪽
const SH: P3 = [0.2, 1.44, 0];
const EL: P3 = [0.255, 1.15, -0.01];
const WR: P3 = [0.3, 0.895, 0.01];
const HC: P3 = [0.312, 0.83, 0.025];
const HP: P3 = [0.11, 0.95, 0];
const KN: P3 = [0.12, 0.52, 0.015];
const AN: P3 = [0.12, 0.1, -0.01];
const TO: P3 = [0.12, 0.03, 0.17];
const mx = (p: P3): P3 => [-p[0], p[1], p[2]];
interface BoneDef {
  name: string;
  parent: number;
  head: P3;
  tail: P3;
  r: number;
}
const KB: BoneDef[] = [
  { name: 'root', parent: -1, head: [0, 0, 0], tail: [0, 0.98, 0], r: 0 },
  { name: 'hips', parent: 0, head: [0, 0.98, 0], tail: [0, 1.12, 0], r: 0.17 },
  { name: 'spine', parent: 1, head: [0, 1.12, 0], tail: [0, 1.28, 0], r: 0.18 },
  { name: 'chest', parent: 2, head: [0, 1.28, 0], tail: [0, 1.5, 0], r: 0.19 },
  { name: 'neck', parent: 3, head: [0, 1.5, 0], tail: [0, 1.6, 0], r: 0.06 },
  { name: 'head', parent: 4, head: [0, 1.6, 0], tail: [0, 1.9, 0], r: 0.11 },
  { name: 'armU.L', parent: 3, head: SH, tail: EL, r: 0.06 },
  { name: 'armF.L', parent: 6, head: EL, tail: WR, r: 0.048 },
  { name: 'hand.L', parent: 7, head: WR, tail: HC, r: 0.045 },
  { name: 'armU.R', parent: 3, head: mx(SH), tail: mx(EL), r: 0.06 },
  { name: 'armF.R', parent: 9, head: mx(EL), tail: mx(WR), r: 0.048 },
  { name: 'hand.R', parent: 10, head: mx(WR), tail: mx(HC), r: 0.045 },
  { name: 'thigh.L', parent: 1, head: HP, tail: KN, r: 0.09 },
  { name: 'shin.L', parent: 12, head: KN, tail: AN, r: 0.062 },
  { name: 'foot.L', parent: 13, head: AN, tail: TO, r: 0.055 },
  { name: 'thigh.R', parent: 1, head: mx(HP), tail: mx(KN), r: 0.09 },
  { name: 'shin.R', parent: 15, head: mx(KN), tail: mx(AN), r: 0.062 },
  { name: 'foot.R', parent: 16, head: mx(AN), tail: mx(TO), r: 0.055 },
];
const NB = KB.length;
const BI: Record<string, number> = {};
KB.forEach((b, i) => (BI[b.name] = i));

const h3 = (x: number, y: number, z: number): number => Math.sqrt(x * x + y * y + z * z);
function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
function sph(x: number, y: number, z: number, c: P3, r: number): number {
  return h3(x - c[0], y - c[1], z - c[2]) - r;
}
function ell(x: number, y: number, z: number, c: P3, r: P3): number {
  const px = (x - c[0]) / r[0];
  const py = (y - c[1]) / r[1];
  const pz = (z - c[2]) / r[2];
  const k0 = h3(px, py, pz);
  const k1 = h3(px / r[0], py / r[1], pz / r[2]);
  return k1 < 1e-9 ? -Math.min(r[0], r[1], r[2]) : (k0 * (k0 - 1)) / k1;
}
function cone(x: number, y: number, z: number, a: P3, ra: number, b: P3, rb: number): number {
  const bx = b[0] - a[0];
  const by = b[1] - a[1];
  const bz = b[2] - a[2];
  const px = x - a[0];
  const py = y - a[1];
  const pz = z - a[2];
  const h = clamp((px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz), 0, 1);
  return h3(px - bx * h, py - by * h, pz - bz * h) - (ra + (rb - ra) * h);
}
const FOOT_C: P3 = [0.12, 0.058, 0.055];
function knightSdf(x: number, y: number, z: number): number {
  const ax = Math.abs(x);
  const zt = z * 1.32; // 몸통은 납작한 타원
  let d = cone(x, y, zt, [0, 0.9, 0], 0.16, [0, 1.17, 0], 0.18);
  d = smin(d, cone(x, y, zt, [0, 1.17, 0], 0.18, [0, 1.38, 0], 0.185), 0.08);
  d = smin(d, sph(ax, y, zt, [0.165, 1.41, 0], 0.085), 0.08);
  d = smin(d, sph(ax, y, z, [0.085, 0.9, -0.05], 0.095), 0.06); // 엉덩이
  d = smin(d, cone(x, y, z, [0, 1.4, 0], 0.064, [0, 1.62, 0.005], 0.058), 0.05);
  // 머리 + 코 · 턱
  let hd = ell(x, y, z, [0, 1.715, 0.012], [0.102, 0.122, 0.112]);
  hd = smin(hd, ell(x, y, z, [0, 1.69, 0.112], [0.018, 0.03, 0.022]), 0.02);
  hd = smin(hd, ell(x, y, z, [0, 1.625, 0.06], [0.06, 0.04, 0.05]), 0.05);
  d = smin(d, hd, 0.05);
  // 팔 (|x| 대칭)
  let arm = cone(ax, y, z, SH, 0.064, EL, 0.053);
  arm = smin(arm, cone(ax, y, z, EL, 0.052, WR, 0.041), 0.03);
  arm = smin(arm, ell(ax, y, z, [HC[0], HC[1], HC[2]], [0.042, 0.058, 0.05]), 0.035);
  d = smin(d, arm, 0.06);
  // 다리
  let leg = cone(ax, y, z, HP, 0.098, KN, 0.068);
  leg = smin(leg, cone(ax, y, z, KN, 0.066, AN, 0.047), 0.03);
  leg = smin(leg, ell(ax, y, z, FOOT_C, [0.058, 0.055, 0.128]), 0.05);
  d = smin(d, leg, 0.05);
  return d;
}
/** 점토 색 — 누빈 겉옷(빨강) · 가죽 바지 · 장화 · 얼굴 */
function knightColor(x: number, y: number, z: number, out: THREE.Color): void {
  const ax = Math.abs(x);
  const quilt = 0.86 + 0.14 * Math.abs(Math.sin(y * 70)) * Math.abs(Math.sin((x + z) * 55));
  if (y > 1.58 && ax < 0.13) {
    out.setRGB(0.66, 0.42, 0.3, THREE.SRGBColorSpace); // 얼굴
    const eye = 1 - sstep(0.6, 1, h3((ax - 0.04) / 0.018, (y - 1.735) / 0.012, Math.max(0, 0.1 - z) / 0.02));
    out.multiplyScalar(1 - eye * 0.85);
    if (y > 1.78) out.setRGB(0.18, 0.11, 0.07, THREE.SRGBColorSpace); // 머리카락
    return;
  }
  if (y > 1.48 && ax < 0.08) {
    out.setRGB(0.2, 0.14, 0.1, THREE.SRGBColorSpace);
    return;
  }
  if (y < 0.24) {
    out.setRGB(0.1, 0.07, 0.05, THREE.SRGBColorSpace); // 장화
    if (y < 0.03) out.setRGB(0.05, 0.035, 0.03, THREE.SRGBColorSpace);
    return;
  }
  if (y < 0.9 && ax > 0.03) {
    out.setRGB(0.22, 0.15, 0.1, THREE.SRGBColorSpace); // 가죽 바지
    out.multiplyScalar(0.9 + 0.1 * Math.sin(y * 40));
    return;
  }
  if (ax > 0.27 && y < 0.92) {
    out.setRGB(0.24, 0.15, 0.1, THREE.SRGBColorSpace); // 장갑 속
    return;
  }
  out.setRGB(0.42, 0.07, 0.07, THREE.SRGBColorSpace).multiplyScalar(quilt); // 누빈 겉옷
}
function segDist(p: THREE.Vector3, a: P3, b: P3): number {
  const bx = b[0] - a[0];
  const by = b[1] - a[1];
  const bz = b[2] - a[2];
  const px = p.x - a[0];
  const py = p.y - a[1];
  const pz = p.z - a[2];
  const h = clamp((px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz), 0, 1);
  return h3(px - bx * h, py - by * h, pz - bz * h);
}

type MatKey = 'steel' | 'gold' | 'leather' | 'dark' | 'bright' | 'plume' | 'paint';
interface KBase {
  pos: Float32Array;
  nrm: Float32Array;
  col: Float32Array;
  idx: Uint32Array;
  si: Uint16Array;
  sw: Float32Array;
  /** 뼈 번호 · 재질 → 뼈 기준 좌표로 합친 갑옷 */
  parts: { bone: number; key: MatKey; geo: THREE.BufferGeometry }[];
  shieldTex: THREE.CanvasTexture;
}
let KBASE: KBase | null = null;
let KBUILD: Gen | null = null;
let KPROG = 0;
let kLast = -1e9;
/** 기사가 다 만들어졌나 — 아니면 이번 프레임 몫만큼 더 (여러 카드가 불러도 프레임마다 한 번) */
function knightReady(): boolean {
  if (KBASE) return true;
  const now = performance.now();
  if (now - kLast < 8) return false;
  kLast = now;
  KBUILD ??= buildKnight();
  if (runGen(KBUILD, budget())) KBUILD = null;
  return !!KBASE;
}

function* buildKnight(): Gen {
  yield* bakeNoise();
  KPROG = 0.05;
  // 1) 거리 값 격자 (몸에 꼭 맞는 상자만)
  const S = 0.019;
  const X0 = -0.44;
  const Y0 = -0.03;
  const Z0 = -0.22;
  const nx = Math.ceil(0.88 / S) + 1;
  const ny = Math.ceil(1.96 / S) + 1;
  const nz = Math.ceil(0.52 / S) + 1;
  const sxy = nx * ny;
  const F = new Float32Array(sxy * nz);
  for (let iz = 0; iz < nz; iz++) {
    const z = Z0 + iz * S;
    for (let iy = 0; iy < ny; iy++) {
      const y = Y0 + iy * S;
      for (let ix = 0; ix < nx; ix++) F[ix + iy * nx + iz * sxy] = knightSdf(X0 + ix * S, y, z);
      if ((iy & 7) === 7 && late()) yield;
    }
    KPROG = 0.05 + 0.25 * (iz / nz);
  }
  // 2) 칸마다 점 (부호가 바뀌는 칸)
  const cell = new Int32Array(sxy * nz).fill(-1);
  const P: number[] = [];
  const EDG = [
    [0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7],
  ] as const;
  const cv = new Float64Array(8);
  for (let iz = 0; iz < nz - 1; iz++) {
    for (let iy = 0; iy < ny - 1; iy++) {
      for (let ix = 0; ix < nx - 1; ix++) {
        let neg = 0;
        for (let k = 0; k < 8; k++) {
          const v = F[ix + (k & 1) + (iy + ((k >> 1) & 1)) * nx + (iz + (k >> 2)) * sxy]!;
          cv[k] = v;
          if (v < 0) neg++;
        }
        if (neg === 0 || neg === 8) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let m = 0;
        for (const [a, b] of EDG) {
          const va = cv[a]!;
          const vb = cv[b]!;
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          sx += (a & 1) + ((b & 1) - (a & 1)) * t;
          sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
          sz += (a >> 2) + ((b >> 2) - (a >> 2)) * t;
          m++;
        }
        cell[ix + iy * nx + iz * sxy] = P.length / 3;
        P.push(X0 + (ix + sx / m) * S, Y0 + (iy + sy / m) * S, Z0 + (iz + sz / m) * S);
      }
      if ((iy & 15) === 15 && late()) yield;
    }
    KPROG = 0.3 + 0.1 * (iz / nz);
  }
  // 3) 부호가 바뀌는 모서리마다 네모
  const I: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean): void => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) I.push(a, c, b, a, d, c);
    else I.push(a, b, c, a, c, d);
  };
  const ci = (x: number, y: number, z: number): number => cell[x + y * nx + z * sxy]!;
  for (let iz = 1; iz < nz - 1; iz++) {
    for (let iy = 1; iy < ny - 1; iy++)
      for (let ix = 1; ix < nx - 1; ix++) {
        const v0 = F[ix + iy * nx + iz * sxy]! < 0;
        if (v0 !== F[ix + 1 + iy * nx + iz * sxy]! < 0) quad(ci(ix, iy - 1, iz - 1), ci(ix, iy, iz - 1), ci(ix, iy, iz), ci(ix, iy - 1, iz), !v0);
        if (v0 !== F[ix + (iy + 1) * nx + iz * sxy]! < 0) quad(ci(ix - 1, iy, iz - 1), ci(ix - 1, iy, iz), ci(ix, iy, iz), ci(ix, iy, iz - 1), !v0);
        if (v0 !== F[ix + iy * nx + (iz + 1) * sxy]! < 0) quad(ci(ix - 1, iy - 1, iz), ci(ix, iy - 1, iz), ci(ix, iy, iz), ci(ix - 1, iy, iz), !v0);
      }
    if (late()) yield;
  }
  KPROG = 0.45;
  const n = P.length / 3;
  const pos = new Float32Array(P);
  const idx = new Uint32Array(I);
  // 4) 표면 위로 끌어 붙이기 · 법선 = 기울기 · 색
  const nrm = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const tc = new THREE.Color();
  const e = 0.003;
  for (let i = 0; i < n; i++) {
    let x = pos[i * 3]!;
    let y = pos[i * 3 + 1]!;
    let z = pos[i * 3 + 2]!;
    let gx = 0;
    let gy = 1;
    let gz = 0;
    for (let it = 0; it < 2; it++) {
      const d = knightSdf(x, y, z);
      const dx = (knightSdf(x + e, y, z) - knightSdf(x - e, y, z)) / (2 * e);
      const dy = (knightSdf(x, y + e, z) - knightSdf(x, y - e, z)) / (2 * e);
      const dz = (knightSdf(x, y, z + e) - knightSdf(x, y, z - e)) / (2 * e);
      const g2 = dx * dx + dy * dy + dz * dz || 1;
      const k = clamp(d / g2, -S, S);
      x -= dx * k;
      y -= dy * k;
      z -= dz * k;
      const gl = Math.sqrt(g2);
      gx = dx / gl;
      gy = dy / gl;
      gz = dz / gl;
    }
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    nrm[i * 3] = gx;
    nrm[i * 3 + 1] = gy;
    nrm[i * 3 + 2] = gz;
    knightColor(x, y, z, tc);
    col[i * 3] = tc.r;
    col[i * 3 + 1] = tc.g;
    col[i * 3 + 2] = tc.b;
    if ((i & 63) === 63 && late()) yield;
  }
  KPROG = 0.6;
  // 감기 방향 (면 법선 vs 기울기 다수결)
  let votes = 0;
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const vc = new THREE.Vector3();
  for (let t = 0; t < Math.min(idx.length, 6000); t += 3) {
    va.fromArray(pos, idx[t]! * 3);
    vb.fromArray(pos, idx[t + 1]! * 3).sub(va);
    vc.fromArray(pos, idx[t + 2]! * 3).sub(va);
    vb.cross(vc);
    const j = idx[t]! * 3;
    votes += Math.sign(vb.x * nrm[j]! + vb.y * nrm[j + 1]! + vb.z * nrm[j + 2]!);
  }
  if (votes < 0)
    for (let t = 0; t < idx.length; t += 3) {
      const s = idx[t + 1]!;
      idx[t + 1] = idx[t + 2]!;
      idx[t + 2] = s;
    }
  yield;
  // 5) 이웃 목록
  const deg = new Int32Array(n + 1);
  for (let t = 0; t < idx.length; t++) deg[idx[t]! + 1]! += 2;
  for (let i = 0; i < n; i++) deg[i + 1]! += deg[i]!;
  const nbr = new Int32Array(deg[n]!);
  const fill = deg.slice(0, n);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t]!;
    const b = idx[t + 1]!;
    const c = idx[t + 2]!;
    nbr[fill[a]!++] = b;
    nbr[fill[a]!++] = c;
    nbr[fill[b]!++] = a;
    nbr[fill[b]!++] = c;
    nbr[fill[c]!++] = a;
    nbr[fill[c]!++] = b;
  }
  yield;
  // 6) 가중치: 뼈 막대까지 거리(살 두께 뺌)⁻⁴ → 표면 따라 이웃 평균 4번
  let full = new Float32Array(n * NB);
  const p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    p.fromArray(pos, i * 3);
    let sum = 0;
    for (let b = 1; b < NB; b++) {
      const bd = KB[b]!;
      const d = Math.max(segDist(p, bd.head, bd.tail) - bd.r * 0.85, 0) + 0.02;
      const w = 1 / (d * d * d * d);
      full[i * NB + b] = w;
      sum += w;
    }
    for (let b = 1; b < NB; b++) full[i * NB + b] = full[i * NB + b]! / sum;
    if ((i & 127) === 127 && late()) yield;
  }
  let next = new Float32Array(n * NB);
  for (let it = 0; it < 4; it++) {
    for (let i = 0; i < n; i++) {
      const s0 = deg[i]!;
      const s1 = deg[i + 1]!;
      const inv = s1 > s0 ? 0.6 / (s1 - s0) : 0;
      const o = i * NB;
      for (let b = 1; b < NB; b++) {
        let s = 0;
        for (let k = s0; k < s1; k++) s += full[nbr[k]! * NB + b]!;
        next[o + b] = s1 > s0 ? full[o + b]! * 0.4 + s * inv : full[o + b]!;
      }
      if ((i & 127) === 127 && late()) yield;
    }
    const sw = full;
    full = next;
    next = sw;
    KPROG = 0.65 + 0.15 * ((it + 1) / 4);
  }
  // 7) 큰 넷만, 합 1
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  const top = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const o = i * NB;
    top.fill(-1);
    for (let b = 1; b < NB; b++) {
      const w = full[o + b]!;
      for (let k = 0; k < 4; k++) {
        const tk = top[k]!;
        if (tk < 0 || w > full[o + tk]!) {
          for (let m = 3; m > k; m--) top[m] = top[m - 1]!;
          top[k] = b;
          break;
        }
      }
    }
    let s = 0;
    for (let k = 0; k < 4; k++) s += top[k]! >= 0 ? full[o + top[k]!]! : 0;
    for (let k = 0; k < 4; k++) {
      const b = Math.max(0, top[k]!);
      si[i * 4 + k] = b;
      sw[i * 4 + k] = top[k]! >= 0 && s > 0 ? full[o + b]! / s : 0;
    }
    if ((i & 511) === 511 && late()) yield;
  }
  KPROG = 0.82;
  // 8) 갑옷
  const parts: KBase['parts'] = [];
  yield* buildArmor(parts);
  const shieldTex = shieldTexture();
  KBASE = { pos, nrm, col, idx, si, sw, parts, shieldTex };
  KPROG = 1;
}

/* ═════════════ 하드서피스 갑옷 (투구 · 어깨 · 흉갑 · 장갑 · 칼 · 방패) ═════════════ */

/** 둥근 모서리 상자 (가운데 원점, w × h × d, 모서리 r) */
function rbox(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(
    (() => {
      const q = new THREE.Shape();
      const rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4) * 0.6;
      q.moveTo(-w / 2 + rr, -h / 2);
      q.lineTo(w / 2 - rr, -h / 2);
      q.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + rr);
      q.lineTo(w / 2, h / 2 - rr);
      q.quadraticCurveTo(w / 2, h / 2, w / 2 - rr, h / 2);
      q.lineTo(-w / 2 + rr, h / 2);
      q.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - rr);
      q.lineTo(-w / 2, -h / 2 + rr);
      q.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + rr, -h / 2);
      return q;
    })(),
    { depth: Math.max(0.001, d - 2 * r * 0.5), bevelEnabled: true, bevelThickness: r * 0.5, bevelSize: r * 0.4, bevelOffset: -r * 0.4, bevelSegments: 2, curveSegments: 4 },
  );
  g.translate(0, 0, -Math.max(0.001, d - 2 * r * 0.5) / 2);
  return g;
}
/** 깃털 장식 (투구 꼭대기 뒤로 휘어 늘어짐) — 정점색 빨강 그러데이션 · 깃 가장자리 톱니 */
function plumeG(base: P3): THREE.BufferGeometry {
  const list: THREE.BufferGeometry[] = [];
  const defs = [
    { yaw: 0, len: 0.46, w: 0.07, rise: 0.5 },
    { yaw: 0.32, len: 0.4, w: 0.06, rise: 0.42 },
    { yaw: -0.32, len: 0.4, w: 0.06, rise: 0.42 },
    { yaw: 0.14, len: 0.34, w: 0.05, rise: 0.62 },
    { yaw: -0.14, len: 0.34, w: 0.05, rise: 0.62 },
  ];
  const cDeep = new THREE.Color(0x4a0508);
  const cMid = new THREE.Color(0xb3121c);
  const cTip = new THREE.Color(0xe8473a);
  const cRach = new THREE.Color(0xf0d8c0);
  const tc = new THREE.Color();
  defs.forEach((d, fi) => {
    const N = 34;
    const M = 6;
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const cy = Math.cos(d.yaw);
    const syw = Math.sin(d.yaw);
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const fwd = -d.len * 0.95 * t;
      const up = d.len * (d.rise * t - 0.95 * t * t);
      const sx = fwd * syw;
      const sz = fwd * cy;
      const w = d.w * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.02 + 0.03)), 0.6) * (1 - 0.3 * t);
      for (let j = 0; j <= M; j++) {
        const s = (j / M) * 2 - 1;
        const notch = Math.abs(s) > 0.7 ? 0.82 + 0.18 * Math.abs(Math.sin(i * 1.9 + fi * 3 + j)) : 1;
        const off = s * w * notch;
        // 옆 방향 (수평, 깃 줄기에 수직) + 끝으로 처짐
        const x = sx + off * cy;
        const z = sz - off * syw;
        const y = up - Math.abs(s) * w * 0.55 - Math.abs(s) * Math.abs(s) * w * 0.25 + Math.abs(s) * 0.012 * Math.sin(i * 2.3);
        pos.push(base[0] + x, base[1] + y, base[2] + z);
        tc.copy(cDeep).lerp(cMid, sstep(0.0, 0.35, t)).lerp(cTip, sstep(0.55, 1.0, t) * 0.7);
        tc.multiplyScalar((i & 1 ? 0.9 : 1) * (0.85 + 0.15 * (1 - Math.abs(s))));
        if (Math.abs(s) < 0.2) tc.lerp(cRach, 0.35 * (1 - t));
        col.push(tc.r, tc.g, tc.b);
      }
    }
    for (let i = 0; i < N; i++)
      for (let j = 0; j < M; j++) {
        const a = i * (M + 1) + j;
        const b = a + M + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    list.push(g);
  });
  const m = mergeGeometries(list)!;
  for (const g of list) g.dispose();
  return m;
}
/** 방패 문장 (금 테두리 · 금 십자 · 칠 결) — 글씨 없음 */
function shieldTexture(): THREE.CanvasTexture {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const lg = g.createLinearGradient(0, 0, S, S);
  lg.addColorStop(0, '#1d2f6a');
  lg.addColorStop(1, '#0f1a40');
  g.fillStyle = lg;
  g.fillRect(0, 0, S, S);
  const rnd = rng(9);
  for (let i = 0; i < 2400; i++) {
    g.fillStyle = `rgba(255,255,255,${rnd() * 0.03})`;
    g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 3, 1 + rnd() * 3);
  }
  const gold = g.createLinearGradient(0, 0, 0, S);
  gold.addColorStop(0, '#f7d77a');
  gold.addColorStop(0.5, '#c8902e');
  gold.addColorStop(1, '#8a5a18');
  // 십자 (끝이 넓어지는 꼴)
  g.fillStyle = gold;
  const cx = S / 2;
  const cyy = S * 0.46;
  g.beginPath();
  const arm = (ang: number): void => {
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const P = (u: number, v: number): [number, number] => [cx + ca * u - sa * v, cyy + sa * u + ca * v];
    const a = P(18, -14);
    const b = P(150, -46);
    const d = P(150, 46);
    const e = P(18, 14);
    g.moveTo(...a);
    g.lineTo(...b);
    g.quadraticCurveTo(...P(140, 0), ...d);
    g.lineTo(...e);
  };
  for (let k = 0; k < 4; k++) arm((k * Math.PI) / 2);
  g.fill();
  g.beginPath();
  g.arc(cx, cyy, 30, 0, TAU);
  g.fill();
  g.strokeStyle = 'rgba(60,30,6,0.8)';
  g.lineWidth = 4;
  g.stroke();
  g.fillStyle = '#a41824';
  g.beginPath();
  g.arc(cx, cyy, 16, 0, TAU);
  g.fill();
  // 안쪽 금줄 테
  g.strokeStyle = gold;
  g.lineWidth = 14;
  g.strokeRect(22, 22, S - 44, S - 44);
  // 긁힌 자국
  for (let i = 0; i < 70; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const a = rnd() * TAU;
    const l = 8 + rnd() * 40;
    g.strokeStyle = `rgba(230,220,200,${0.08 + rnd() * 0.18})`;
    g.lineWidth = 1 + rnd();
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** 프로필 [반지름, 높이] 에서 높이 y 의 반지름 (선형) */
function rAt(prof: [number, number][], y: number): number {
  for (let i = 0; i < prof.length - 1; i++) {
    const [r0, y0] = prof[i]!;
    const [r1, y1] = prof[i + 1]!;
    if ((y >= y0 && y <= y1) || (y <= y0 && y >= y1)) return lerp(r0, r1, (y - y0) / (y1 - y0 || 1));
  }
  return prof[prof.length - 1]![0];
}
/** 회전체 정점을 반지름 방향으로 밀기 (가운데 능선 · 부리 모양) */
function bulge(g: THREE.BufferGeometry, f: (a: number, y: number) => number): THREE.BufferGeometry {
  const pa = g.getAttribute('position');
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i);
    const y = pa.getY(i);
    const z = pa.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-5) continue;
    const k = (r + f(Math.atan2(x, z), y)) / r;
    pa.setXYZ(i, x * k, y, z * k);
  }
  return g;
}
const V3 = (x = 0, y = 0, z = 0): THREE.Vector3 => new THREE.Vector3(x, y, z);
const vp = (p: P3): THREE.Vector3 => new THREE.Vector3(p[0], p[1], p[2]);

function* buildArmor(out: KBase['parts']): Gen {
  const acc = new Map<string, { bone: number; key: MatKey; geos: THREE.BufferGeometry[] }>();
  const add = (bone: string, key: MatKey, g: THREE.BufferGeometry): void => {
    const b = BI[bone]!;
    const k = b + '|' + key;
    let e = acc.get(k);
    if (!e) acc.set(k, (e = { bone: b, key, geos: [] }));
    e.geos.push(g);
  };

  /* ── 투구 (바이저 · 눈 틈 · 금 띠 · 볏 · 깃털) ── */
  const C: P3 = [0, 1.715, 0.012];
  const HZ = 1.1;
  const hsh = (g: THREE.BufferGeometry): THREE.BufferGeometry => {
    g.scale(1, 1, HZ);
    g.translate(C[0], C[1], C[2]);
    return g;
  };
  add('head', 'steel', prep(hsh(latheG([[0.153, 0.022], [0.152, 0.045], [0.146, 0.085], [0.13, 0.125], [0.1, 0.16], [0.06, 0.185], [0.001, 0.196]], 56))));
  add('head', 'steel', prep(hsh(latheG([[0.128, -0.15], [0.14, -0.125], [0.149, -0.07], [0.153, -0.02], [0.153, 0.024]], 44, 0.95, TAU - 1.9))));
  const VP: [number, number][] = [[0.137, -0.145], [0.149, -0.12], [0.158, -0.065], [0.162, -0.02], [0.162, -0.004]];
  const beak = (a: number, y: number): number => 0.03 * Math.exp((-a * a) / 0.08) * clamp(1 - ((y + 0.07) / 0.085) ** 2, 0, 1);
  add('head', 'steel', prep(hsh(bulge(latheG(VP, 40, -1.12, 2.24), beak))));
  const visorPt = (a: number, y: number, off: number): THREE.Vector3 => {
    const r = rAt(VP, y) + beak(a, y) + off;
    return V3(Math.sin(a) * r + C[0], y + C[1], Math.cos(a) * r * HZ + C[2]);
  };
  for (const y of [-0.004, -0.143]) {
    const pts = range(-1.12, 1.12, 40).map((a) => visorPt(a, y, 0.001));
    add('head', 'steel', prep(tubeG(pts, 0.0045, false, 60, 6)));
  }
  add('head', 'dark', prep(xf(new THREE.SphereGeometry(0.143, 28, 18), C, [0, 0, 0], [1, 1, 1.08]), 1.5));
  const holes: Spot[] = [];
  for (const a of [-0.42, -0.56, -0.7]) for (const y of [-0.105, -0.085, -0.065, -0.045]) holes.push({ p: visorPt(a, y, 0), n: V3(Math.sin(a), 0, Math.cos(a)) });
  add('head', 'dark', rivetsG(holes, 0.0042));
  add('head', 'gold', prep(xf(ringG(0.157, 0.157 * HZ, 0.026, 0.0085), C)));
  const band = ringSpots(0.157, 0.157 * HZ, 0.026, range(0, TAU, 13).slice(0, 12), 0.008);
  for (const s of band) s.p.add(vp(C));
  add('head', 'gold', rivetsG(band, 0.0055));
  add('head', 'gold', rivetsG([1, -1].map((s) => ({ p: visorPt(s * 1.04, -0.012, 0.004), n: V3(s, 0, 0.3) })), 0.012));
  {
    const outer: [number, number][] = [];
    const inner: [number, number][] = [];
    for (let i = 0; i <= 28; i++) {
      const th = -1.0 + (2.35 * i) / 28;
      const hg = 0.004 + 0.02 * Math.max(0, 1 - ((th - 0.17) / 1.2) ** 2);
      outer.push([(0.155 + hg) * Math.sin(th) * HZ, 0.04 + (0.155 + hg) * Math.cos(th)]);
      inner.push([0.136 * Math.sin(th) * HZ, 0.04 + 0.136 * Math.cos(th)]);
    }
    const cs = new THREE.Shape();
    cs.moveTo(...outer[0]!);
    for (const p of outer) cs.lineTo(...p);
    for (const p of inner.reverse()) cs.lineTo(...p);
    const cg = new THREE.ExtrudeGeometry(cs, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 4 });
    cg.translate(0, 0, -0.004);
    cg.rotateY(-Math.PI / 2);
    cg.translate(C[0], C[1], C[2]);
    add('head', 'steel', prep(cg, 0.5));
  }
  const plumeBase: P3 = [C[0], C[1] + 0.168, C[2] - 0.085];
  add('head', 'gold', prep(orient(new THREE.CylinderGeometry(0.011, 0.017, 0.05, 14), [0, 0.6, -0.8], [plumeBase[0], plumeBase[1] - 0.01, plumeBase[2] + 0.012])));
  add('head', 'plume', plumeG(plumeBase));
  if (late()) yield;

  /* ── 목가리개 · 흉갑 (가운데 능선 · V 금테 · 리벳) ── */
  add('chest', 'steel', prep(latheG([[0.162, 1.452], [0.152, 1.49], [0.128, 1.522], [0.1, 1.548], [0.094, 1.565]], 44).scale(1, 1, 0.86) as THREE.BufferGeometry));
  const BP: [number, number][] = [[0.198, 0.985], [0.212, 1.04], [0.232, 1.15], [0.238, 1.25], [0.226, 1.35], [0.2, 1.42], [0.168, 1.462], [0.155, 1.47]];
  const BZ = 0.8;
  const keel = (a: number, y: number): number => 0.016 * Math.exp((-a * a) / 0.05) * sstep(0.99, 1.1, y) * (1 - sstep(1.36, 1.46, y));
  const chestP = (a: number, y: number, off = 0): THREE.Vector3 => {
    const r = rAt(BP, y) + keel(a, y) + off;
    return V3(Math.sin(a) * r, y, Math.cos(a) * r * BZ);
  };
  const chestN = (a: number): THREE.Vector3 => V3(Math.sin(a), 0, Math.cos(a) / BZ).normalize();
  add('chest', 'steel', prep(bulge(latheG(BP, 64), keel).scale(1, 1, BZ) as THREE.BufferGeometry));
  add('chest', 'gold', prep(ringG(0.157, 0.157 * BZ, 1.469, 0.0095)));
  add('chest', 'gold', prep(ringG(0.2, 0.2 * BZ, 0.987, 0.011)));
  const vPts = range(-1.15, 1.15, 31).map((a) => chestP(a, 1.05 + 0.14 * Math.pow(1 - Math.abs(a) / 1.15, 1.25), 0.004));
  add('chest', 'gold', prep(tubeG(vPts, 0.0058, false, 80, 6)));
  const cr: Spot[] = [];
  for (const s of [1, -1]) for (const y of [1.06, 1.16, 1.26, 1.36]) cr.push({ p: chestP(s * 1.45, y, 0.002), n: chestN(s * 1.45) });
  for (const a of [-0.75, -0.4, 0.4, 0.75]) cr.push({ p: chestP(a, 1.05 + 0.14 * Math.pow(1 - Math.abs(a) / 1.15, 1.25) - 0.03, 0.002), n: chestN(a) });
  add('chest', 'gold', rivetsG(cr, 0.0065));
  if (late()) yield;

  /* ── 허리띠 · 허리 갑옷 비늘 ── */
  add('hips', 'leather', prep(latheG([[0.212, 0.955], [0.218, 0.962], [0.218, 0.992], [0.212, 0.999]], 48).scale(1, 1, 0.82) as THREE.BufferGeometry, 0.5));
  add('hips', 'gold', prep(xf(rbox(0.056, 0.046, 0.014, 0.006), [0, 0.977, 0.186])));
  add('hips', 'dark', prep(xf(rbox(0.03, 0.022, 0.006, 0.003), [0, 0.977, 0.194])));
  add('hips', 'leather', prep(xf(rbox(0.075, 0.085, 0.04, 0.014), [-0.165, 0.9, 0.1], [0, -0.75, 0])));
  for (let k = 0; k < 3; k++) {
    const yt = 0.952 - 0.056 * k;
    const yb = yt - 0.07;
    const rt = 0.214 + 0.013 * k;
    const rb = rt + 0.012;
    add('hips', 'steel', prep(latheG([[rt, yt], [rt + 0.004, yt - 0.01], [rb, yb]], 52).scale(1, 1, 0.82) as THREE.BufferGeometry));
    add('hips', 'steel', prep(ringG(rb, rb * 0.82, yb, 0.0042)));
    add('hips', 'gold', rivetsG(ringSpots(rt + 0.006, (rt + 0.006) * 0.82, yt - 0.022, [-2.4, -1.45, -0.6, 0.6, 1.45, 2.4], 0.002), 0.0055));
  }
  if (late()) yield;

  /* ── 팔다리 (s = 1 왼쪽, -1 오른쪽) ── */
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    const ms = (p: P3): P3 => [p[0] * s, p[1], p[2]];
    // 어깨 갑옷: 둥근 덮개 + 금테 + 능선 + 리벳 + 위팔 비늘 셋
    const P: P3 = [s * 0.218, 1.468, 0];
    const M = new THREE.Matrix4().compose(vp(P), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -s * 0.42)), V3(1, 0.8, 1.06));
    const R3 = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationZ(-s * 0.42));
    const PR = 0.13;
    add(`armU.${L}`, 'steel', prep(new THREE.SphereGeometry(PR, 40, 14, 0, TAU, 0, 1.22).applyMatrix4(M)));
    add(`armU.${L}`, 'gold', prep(ringG(PR * Math.sin(1.22), PR * Math.sin(1.22), PR * Math.cos(1.22), 0.0072).applyMatrix4(M)));
    add(`armU.${L}`, 'steel', prep(tubeG(range(-1.05, 1.05, 15).map((th) => V3(0, (PR + 0.0015) * Math.cos(th), (PR + 0.0015) * Math.sin(th))), 0.006, false, 40, 6).applyMatrix4(M)));
    const ps: Spot[] = [];
    for (const a of [-0.9, -0.3, 0.3, 0.9]) {
      const d = V3(s * Math.sin(1.02) * Math.cos(a), Math.cos(1.02), Math.sin(1.02) * Math.sin(a));
      ps.push({ p: d.clone().multiplyScalar(PR + 0.001).applyMatrix4(M), n: d.applyMatrix3(R3) });
    }
    add(`armU.${L}`, 'gold', rivetsG(ps, 0.0068));
    const upA = vp(SH).sub(vp(EL)).normalize();
    upA.x *= s;
    for (let k = 0; k < 3; k++) {
      const t0 = 0.085 + 0.052 * k;
      const r = 0.084 - 0.004 * k;
      const ph0 = (s * Math.PI) / 2 - 1.65;
      add(`armU.${L}`, 'steel', prep(orient(latheG([[r, -t0], [r + 0.003, -t0 - 0.012], [r - 0.004, -t0 - 0.062]], 30, ph0, 3.3), upA, ms(SH))));
      add(`armU.${L}`, 'steel', prep(orient(ringG(r - 0.004, r - 0.004, -t0 - 0.062, 0.0034, ph0 + Math.PI / 2 - Math.PI / 2, ph0 + 3.3), upA, ms(SH))));
    }
    // 팔꿈치 덮개 + 날개 · 아래팔 통 갑옷
    const elD = V3(s * 0.3, 0.1, -1).normalize();
    const ELs = vp(ms(EL));
    add(`armF.${L}`, 'steel', prep(orient(new THREE.SphereGeometry(0.056, 28, 10, 0, TAU, 0, 1.15), elD, ELs.clone().addScaledVector(elD, 0.012))));
    add(`armF.${L}`, 'steel', prep(orient(new THREE.CylinderGeometry(0.043, 0.043, 0.006, 24), V3(s, 0, -0.25), ELs.clone().add(V3(s * 0.054, 0, -0.012)))));
    add(`armF.${L}`, 'gold', rivetsG([{ p: ELs.clone().addScaledVector(elD, 0.068), n: elD }, { p: ELs.clone().add(V3(s * 0.058, 0, -0.012)), n: V3(s, 0, -0.25) }], 0.008));
    const upF = vp(EL).sub(vp(WR)).normalize();
    upF.x *= s;
    add(`armF.${L}`, 'steel', prep(orient(latheG([[0.058, -0.03], [0.056, -0.045], [0.052, -0.15], [0.048, -0.23], [0.054, -0.25]], 36), upF, ELs)));
    add(`armF.${L}`, 'gold', prep(orient(ringG(0.0545, 0.0545, -0.248, 0.0045), upF, ELs)));
    add(`armF.${L}`, 'gold', prep(orient(ringG(0.057, 0.057, -0.034, 0.0042), upF, ELs)));
    // 장갑: 소매 · 손등 · 마디 · 손가락 · 엄지
    const upH = vp(WR).sub(vp(HC)).normalize();
    upH.x *= s;
    const WRs = vp(ms(WR));
    const HCs = vp(ms(HC));
    add(`hand.${L}`, 'steel', prep(orient(latheG([[0.05, -0.012], [0.056, 0.0], [0.066, 0.04], [0.069, 0.05]], 30), upH, WRs)));
    add(`hand.${L}`, 'steel', prep(orient(rbox(0.03, 0.08, 0.072, 0.012), upH, HCs.clone().add(V3(s * 0.026, 0.006, 0)))));
    add(`hand.${L}`, 'steel', prep(orient(rbox(0.032, 0.022, 0.078, 0.008), upH, HCs.clone().add(V3(s * 0.02, -0.046, 0.004)))));
    add(`hand.${L}`, 'steel', prep(orient(rbox(0.05, 0.036, 0.074, 0.013), upH, HCs.clone().add(V3(-s * 0.008, -0.062, 0.006)))));
    add(`hand.${L}`, 'steel', prep(xf(rbox(0.022, 0.05, 0.024, 0.009), [HCs.x - s * 0.018, HCs.y - 0.012, HCs.z + 0.044], [0.35, 0, s * 0.3])));
    add(`hand.${L}`, 'gold', rivetsG(range(-0.026, 0.03, 4).map((dz) => ({ p: HCs.clone().add(V3(s * 0.037, -0.046, dz + 0.004)), n: V3(s, -0.2, 0) })), 0.0055));
    // 다리: 허벅지 판 · 무릎 · 정강이 · 발등
    const upT = vp(HP).sub(vp(KN)).normalize();
    upT.x *= s;
    const HPs = vp(ms(HP));
    add(`thigh.${L}`, 'steel', prep(orient(latheG([[0.112, -0.12], [0.115, -0.135], [0.107, -0.29]], 30, -1.3, 2.6), upT, HPs)));
    add(`thigh.${L}`, 'gold', prep(orient(ringG(0.107, 0.107, -0.29, 0.004, -1.3, 1.3), upT, HPs)));
    add(`thigh.${L}`, 'steel', prep(orient(latheG([[0.104, -0.27], [0.1, -0.3], [0.084, -0.405]], 30, -1.65, 3.3), upT, HPs)));
    add(`thigh.${L}`, 'gold', rivetsG([-0.9, 0, 0.9].map((a) => ({ p: HPs.clone().add(V3(Math.sin(a) * 0.118, -0.135, Math.cos(a) * 0.118)), n: V3(Math.sin(a), 0, Math.cos(a)) })), 0.006));
    const KNs = vp(ms(KN));
    const kD = V3(0, 0.15, 1).normalize();
    add(`shin.${L}`, 'steel', prep(orient(new THREE.SphereGeometry(0.058, 28, 10, 0, TAU, 0, 1.2), kD, KNs.clone().add(V3(0, 0, 0.045)))));
    add(`shin.${L}`, 'steel', prep(orient(new THREE.CylinderGeometry(0.044, 0.044, 0.006, 24), V3(s, 0, 0.35), KNs.clone().add(V3(s * 0.088, 0, 0.02)))));
    add(`shin.${L}`, 'gold', rivetsG([{ p: KNs.clone().add(V3(0, 0.009, 0.104)), n: kD }], 0.009));
    const upS = vp(KN).sub(vp(AN)).normalize();
    upS.x *= s;
    add(`shin.${L}`, 'steel', prep(orient(bulge(latheG([[0.074, -0.06], [0.076, -0.11], [0.068, -0.25], [0.056, -0.37], [0.06, -0.4]], 36), (a) => 0.008 * Math.exp((-a * a) / 0.08)), upS, KNs)));
    add(`shin.${L}`, 'gold', prep(orient(ringG(0.061, 0.061, -0.4, 0.0042), upS, KNs)));
    const FC = V3(FOOT_C[0] * s, FOOT_C[1] + 0.002, FOOT_C[2] + 0.006);
    add(`foot.${L}`, 'steel', prep(new THREE.SphereGeometry(1, 28, 12, 0, TAU, 0, Math.PI / 2).scale(0.068, 0.062, 0.138).translate(FC.x, FC.y, FC.z)));
    for (const dz of [-0.04, 0.0, 0.04, 0.08]) {
      const f = Math.sqrt(Math.max(0.05, 1 - ((dz - 0.0) / 0.138) ** 2));
      add(`foot.${L}`, 'steel', prep(tubeG(range(0, Math.PI, 14).map((u) => V3(FC.x + 0.0695 * f * Math.cos(u), FC.y + 0.0635 * f * Math.sin(u), FC.z + dz)), 0.0032, false, 24, 5)));
    }
    if (late()) yield;
  }

  /* ── 방패 (왼 아래팔) — 휜 칠 판 · 쇠 테 · 가운데 돌기 · 리벳 ── */
  {
    const sh = new THREE.Shape();
    sh.moveTo(-0.22, 0.2);
    sh.quadraticCurveTo(0, 0.228, 0.22, 0.2);
    sh.bezierCurveTo(0.226, -0.02, 0.15, -0.22, 0, -0.36);
    sh.bezierCurveTo(-0.15, -0.22, -0.226, -0.02, -0.22, 0.2);
    const bend = (x: number): number => -x * x * 0.9;
    let face: THREE.BufferGeometry = new THREE.ExtrudeGeometry(sh, { depth: 0.014, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 28 });
    face.translate(0, 0, -0.007);
    face = new TessellateModifier(0.035, 6).modify(face);
    const pa = face.getAttribute('position');
    const uv = face.getAttribute('uv');
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i);
      pa.setZ(i, pa.getZ(i) + bend(x));
      uv.setXY(i, (x + 0.24) / 0.48, (pa.getY(i) + 0.38) / 0.62);
    }
    const parts: { g: THREE.BufferGeometry; key: MatKey }[] = [];
    parts.push({ g: prep(face, 0.5, true), key: 'paint' });
    const outline = sh.getSpacedPoints(90).map((p) => V3(p.x * 0.985, p.y * 0.985 - 0.002, bend(p.x) + 0.012));
    outline.pop();
    parts.push({ g: prep(tubeG(outline, 0.011, true, 140, 8)), key: 'steel' });
    parts.push({ g: prep(new THREE.SphereGeometry(0.052, 28, 10, 0, TAU, 0, 1.0).rotateX(Math.PI / 2).translate(0, 0.04, 0.0)), key: 'steel' });
    parts.push({ g: prep(new THREE.TorusGeometry(0.05, 0.006, 8, 32).translate(0, 0.04, 0.03)), key: 'gold' });
    const rs: Spot[] = sh.getSpacedPoints(16).slice(0, 16).map((p) => ({ p: V3(p.x * 0.9, p.y * 0.9 - 0.006, bend(p.x * 0.9) + 0.012), n: V3(-p.x * 1.8, 0, 1).normalize() }));
    parts.push({ g: rivetsG(rs, 0.0075), key: 'steel' });
    // 왼 아래팔에: 앞면 = 바깥(+X), 위쪽 = 팔꿈치 쪽을 비스듬히
    const N = V3(1, 0, 0);
    const D = vp(WR).sub(vp(EL)).normalize();
    const U = D.clone().negate().addScaledVector(N, D.dot(N)).normalize().applyAxisAngle(N, -0.75);
    const X = U.clone().cross(N);
    const B = new THREE.Matrix4().makeBasis(X, U, N).setPosition(vp(EL).add(vp(WR)).multiplyScalar(0.5).addScaledVector(N, 0.075).addScaledVector(U, -0.02));
    for (const p of parts) add('armF.L', p.key, p.g.applyMatrix4(B));
  }
  if (late()) yield;

  /* ── 칼 (오른손) — 마름모 날 · 십자 날밑 · 감은 손잡이 · 금 머리 ── */
  {
    const sw: { g: THREE.BufferGeometry; key: MatKey }[] = [];
    const blade = latheG([[0.0005, 0.118], [0.031, 0.124], [0.031, 0.18], [0.027, 0.5], [0.021, 0.78], [0.0005, 0.905]], 4, 0, TAU, false).scale(1, 1, 0.17) as THREE.BufferGeometry;
    sw.push({ g: prep(blade, 0.35), key: 'bright' });
    sw.push({ g: prep(new THREE.BoxGeometry(0.006, 0.42, 0.012).translate(0, 0.4, 0)), key: 'steel' });
    sw.push({ g: prep(xf(rbox(0.22, 0.024, 0.034, 0.008), [0, 0.106, 0])), key: 'steel' });
    for (const x of [-0.113, 0.113]) sw.push({ g: prep(new THREE.SphereGeometry(0.017, 16, 10).translate(x, 0.106, 0), 1.2), key: 'gold' });
    sw.push({ g: prep(xf(rbox(0.05, 0.05, 0.042, 0.01), [0, 0.108, 0]), 0.6), key: 'gold' });
    sw.push({ g: prep(new THREE.CylinderGeometry(0.0155, 0.0168, 0.17, 18).translate(0, 0.01, 0), 0.6), key: 'leather' });
    for (const y of range(-0.064, 0.082, 9)) sw.push({ g: prep(new THREE.TorusGeometry(0.0168, 0.0022, 6, 18).rotateX(Math.PI / 2).translate(0, y, 0), 1.2), key: 'steel' });
    sw.push({ g: prep(new THREE.CylinderGeometry(0.02, 0.016, 0.018, 18).translate(0, -0.083, 0)), key: 'gold' });
    sw.push({ g: prep(new THREE.SphereGeometry(0.029, 22, 14).scale(1, 0.85, 1).translate(0, -0.106, 0), 1.2), key: 'gold' });
    const B = new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(-HC[0] + 0.004, HC[1] - 0.06, HC[2] + 0.004);
    for (const p of sw) add('hand.R', p.key, p.g.applyMatrix4(B));
  }
  yield;

  /* ── 뼈마다 · 재질마다 한 메시로 (뼈 기준 좌표) ── */
  for (const e of acc.values()) {
    const g = e.geos.length === 1 ? e.geos[0]! : mergeGeometries(e.geos)!;
    if (e.geos.length > 1) for (const x of e.geos) x.dispose();
    const h = KB[e.bone]!.head;
    g.translate(-h[0], -h[1], -h[2]);
    g.computeBoundingSphere();
    out.push({ bone: e.bone, key: e.key, geo: g });
    if (late()) yield;
  }
}

/* ═════════════ 천 (베를레 점 격자 — 망토 · 앞뒤 자락) ═════════════ */

interface Cap {
  a: THREE.Vector3;
  b: THREE.Vector3;
  r: number;
}
const _ca = new THREE.Vector3();
const _cb = new THREE.Vector3();
class Cloth {
  readonly mesh: THREE.Mesh;
  private geo: THREE.BufferGeometry;
  private p: Float32Array;
  private o: Float32Array;
  private cons: number[] = [];
  private rest: number[] = [];
  private anc: THREE.Vector3[];
  private inited = false;
  private acc = 0;
  constructor(
    private bone: THREE.Object3D,
    boneHead: P3,
    anchorsWorld: THREE.Vector3[],
    private H: number,
    len: number,
    grow: number,
    base: number,
    hem: number,
    mat: THREE.Material,
    private stiff = 1,
    side = true,
  ) {
    const W = anchorsWorld.length;
    this.anc = anchorsWorld.map((v) => v.clone().sub(vp(boneHead)));
    const n = W * H;
    this.p = new Float32Array(n * 3);
    this.o = new Float32Array(n * 3);
    const dv = len / (H - 1);
    const id = (r: number, c: number): number => r * W + c;
    const link = (a: number, b: number, l: number): void => {
      this.cons.push(a, b);
      this.rest.push(l);
    };
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++) {
        const k = 1 + (grow * r) / (H - 1);
        const dx = c < W - 1 ? anchorsWorld[c]!.distanceTo(anchorsWorld[c + 1]!) * k : 0;
        if (c < W - 1) link(id(r, c), id(r, c + 1), dx);
        if (r < H - 1) link(id(r, c), id(r + 1, c), dv);
        if (r < H - 1 && c < W - 1) {
          const d = Math.hypot(dx, dv);
          link(id(r, c), id(r + 1, c + 1), d);
          link(id(r, c + 1), id(r + 1, c), d);
        }
        if (r < H - 2) link(id(r, c), id(r + 2, c), dv * 2);
      }
    const idx: number[] = [];
    for (let r = 0; r < H - 1; r++)
      for (let c = 0; c < W - 1; c++) {
        const a = id(r, c);
        idx.push(a, id(r + 1, c), a + 1, a + 1, id(r + 1, c), id(r + 1, c + 1));
      }
    const col = new Float32Array(n * 3);
    const cb = new THREE.Color(base);
    const ch = new THREE.Color(hem);
    const tc = new THREE.Color();
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++) {
        const edge = r === H - 1 || (side && (c === 0 || c === W - 1));
        tc.copy(edge ? ch : cb).multiplyScalar(r === H - 2 && !edge ? 0.72 : 0.8 + 0.2 * (r / (H - 1)));
        tc.toArray(col, id(r, c) * 3);
      }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.p, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
  }
  private W(): number {
    return this.anc.length;
  }
  /** 고정 줄을 지금 뼈 자리로, 처음이면 아래로 늘어뜨린 채 시작 */
  private pin(): void {
    const W = this.W();
    for (let c = 0; c < W; c++) {
      _ca.copy(this.anc[c]!).applyMatrix4(this.bone.matrixWorld);
      _ca.toArray(this.p, c * 3);
      _ca.toArray(this.o, c * 3);
    }
  }
  reset(): void {
    this.inited = false;
  }
  update(dt: number, caps: Cap[], wind = 0): void {
    const W = this.W();
    const H = this.H;
    const p = this.p;
    const o = this.o;
    if (!this.inited) {
      this.inited = true;
      this.pin();
      for (let r = 1; r < H; r++)
        for (let c = 0; c < W; c++) {
          const i = (r * W + c) * 3;
          p[i] = p[c * 3]!;
          p[i + 1] = p[c * 3 + 1]! - r * 0.08;
          p[i + 2] = p[c * 3 + 2]! - r * 0.02;
          o[i] = p[i]!;
          o[i + 1] = p[i + 1]!;
          o[i + 2] = p[i + 2]!;
        }
    }
    this.acc = Math.min(this.acc + dt, 1 / 20);
    const h = 1 / 60;
    let steps = 0;
    while (this.acc >= h && steps < 3) {
      this.acc -= h;
      steps++;
      this.pin();
      const g = -9.8 * h * h;
      for (let i = W * 3; i < p.length; i += 3) {
        const vx = (p[i]! - o[i]!) * 0.985;
        const vy = (p[i + 1]! - o[i + 1]!) * 0.985;
        const vz = (p[i + 2]! - o[i + 2]!) * 0.985;
        o[i] = p[i]!;
        o[i + 1] = p[i + 1]!;
        o[i + 2] = p[i + 2]!;
        p[i] = p[i]! + vx + wind * h * h * 6;
        p[i + 1] = p[i + 1]! + vy + g;
        p[i + 2] = p[i + 2]! + vz - Math.abs(wind) * h * h * 3;
      }
      for (let it = 0; it < 6; it++) {
        const cn = this.cons;
        for (let k = 0; k < cn.length; k += 2) {
          const a = cn[k]! * 3;
          const b = cn[k + 1]! * 3;
          const dx = p[b]! - p[a]!;
          const dy = p[b + 1]! - p[a + 1]!;
          const dz = p[b + 2]! - p[a + 2]!;
          const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
          const diff = ((l - this.rest[k >> 1]!) / l) * this.stiff;
          const pa = a < W * 3;
          const pb = b < W * 3;
          if (pa && pb) continue;
          const wa = pa ? 0 : pb ? 1 : 0.5;
          const wb = pb ? 0 : pa ? 1 : 0.5;
          p[a] = p[a]! + dx * diff * wa;
          p[a + 1] = p[a + 1]! + dy * diff * wa;
          p[a + 2] = p[a + 2]! + dz * diff * wa;
          p[b] = p[b]! - dx * diff * wb;
          p[b + 1] = p[b + 1]! - dy * diff * wb;
          p[b + 2] = p[b + 2]! - dz * diff * wb;
        }
        // 몸 · 다리 캡슐 밖으로
        for (let i = W * 3; i < p.length; i += 3) {
          for (const cp of caps) {
            _cb.subVectors(cp.b, cp.a);
            const L2 = _cb.lengthSq() || 1e-6;
            const t = clamp(((p[i]! - cp.a.x) * _cb.x + (p[i + 1]! - cp.a.y) * _cb.y + (p[i + 2]! - cp.a.z) * _cb.z) / L2, 0, 1);
            const qx = p[i]! - (cp.a.x + _cb.x * t);
            const qy = p[i + 1]! - (cp.a.y + _cb.y * t);
            const qz = p[i + 2]! - (cp.a.z + _cb.z * t);
            const d = Math.sqrt(qx * qx + qy * qy + qz * qz);
            if (d < cp.r && d > 1e-6) {
              const k = (cp.r - d) / d;
              p[i] = p[i]! + qx * k;
              p[i + 1] = p[i + 1]! + qy * k;
              p[i + 2] = p[i + 2]! + qz * k;
            }
          }
        }
      }
    }
    if (steps) {
      (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      this.geo.computeVertexNormals();
    }
  }
  dispose(): void {
    this.geo.dispose();
  }
}

/* ═════════════ 기사 하나 (모양은 같이 쓰고 재질 · 뼈 · 천은 따로) ═════════════ */

interface Pose {
  t: number;
  /** 걸음 위상 · 세기 (0 서 있기 ~ 1 걷기) */
  ph: number;
  walk: number;
  /** 휘두르기 진행 0~1 (음수 = 안 함) */
  swing: number;
  /** 주문 자세 세기 0~1 · 종류 0 앞으로 · 1 하늘로 · 2 돌리기 */
  cast: number;
  castKind: number;
  /** 방패 들기 0~1 */
  guard: number;
}
interface Knight {
  root: THREE.Group;
  mesh: THREE.SkinnedMesh;
  bones: THREE.Bone[];
  armor: THREE.Mesh[];
  cloths: Cloth[];
  mats: THREE.Material[];
  b(name: string): THREE.Bone;
  setArmor(on: boolean): void;
  pose(p: Pose): void;
  /** 망토 · 자락 (root 를 옮긴 뒤) */
  cloth(dt: number, wind?: number): void;
  /** 칼 밑동 · 끝 (월드) */
  blade(base: THREE.Vector3, tip: THREE.Vector3): void;
  dispose(): void;
}
const SW_KEYS = [
  // p,  ux,   uy,    uz,   fx,   날 각, 가슴 비틀기, 가슴 숙임, 내딛기
  [0, -0.25, 0, -0.12, -0.5, -0.6, 0, 0, 0],
  [0.32, -2.55, 0.35, -0.5, -1.25, -2.6, 0.55, -0.08, 0.2],
  [0.5, -1.05, -0.25, 0.4, -0.25, -0.05, -0.6, 0.15, 1],
  [0.7, -0.45, -0.35, 0.62, -0.2, 0.7, -0.78, 0.18, 1],
  [1, -0.25, 0, -0.12, -0.5, -0.6, 0, 0, 0],
];
function keys(K: number[][], p: number, out: number[]): number[] {
  let i = 0;
  while (i < K.length - 2 && p > K[i + 1]![0]!) i++;
  const a = K[i]!;
  const b = K[i + 1]!;
  let t = clamp((p - a[0]!) / (b[0]! - a[0]! || 1), 0, 1);
  t = t * t * t * (t * (t * 6 - 15) + 10);
  for (let k = 1; k < a.length; k++) out[k - 1] = lerp(a[k]!, b[k]!, t);
  return out;
}
const _sw: number[] = [];

function makeKnight(parent: THREE.Object3D, opts: { cloth?: boolean } = {}): Knight {
  const B = KBASE!;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(B.pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(B.nrm, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(B.col, 3));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(B.si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(B.sw, 4));
  geo.setIndex(new THREE.BufferAttribute(B.idx, 1));
  const D = THREE.DoubleSide;
  const S = THREE.MeshStandardMaterial;
  const mats: Record<MatKey, THREE.Material> = {
    steel: wear(new S({ color: 0x8b9199, metalness: 1, roughness: 0.34, side: D }), { bare: 0xe8ebee, tarnish: 0.75 }),
    gold: wear(new S({ color: 0xc6963f, metalness: 1, roughness: 0.3, side: D }), { bare: 0xffe0a0, tarnish: 0.5 }),
    leather: wear(new S({ color: 0x3d2618, metalness: 0, roughness: 0.72, side: D }), { bare: 0x6e4c34, tarnish: 0.4 }),
    dark: new S({ color: 0x030303, metalness: 0, roughness: 1, side: D }),
    bright: wear(new S({ color: 0xdce1e7, metalness: 1, roughness: 0.15, side: D }), { bare: 0xffffff, tarnish: 0.25, scale: 5 }),
    plume: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.75, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xff6a50), side: D }),
    paint: wear(new S({ map: B.shieldTex, metalness: 0.05, roughness: 0.5, side: D }), { bare: 0xb9bdc3, paint: true, tarnish: 0.5 }),
  };
  const body = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.84, sheen: 0.45, sheenRoughness: 0.65, sheenColor: new THREE.Color(0xb05048) });
  const capeMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.86, sheen: 0.8, sheenRoughness: 0.55, sheenColor: new THREE.Color(0xd04848), side: D });
  const mesh = new THREE.SkinnedMesh(geo, body);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  const bones: THREE.Bone[] = [];
  KB.forEach((d, i) => {
    const bn = new THREE.Bone();
    bn.name = d.name;
    const ph = d.parent >= 0 ? KB[d.parent]!.head : ([0, 0, 0] as P3);
    bn.position.set(d.head[0] - ph[0], d.head[1] - ph[1], d.head[2] - ph[2]);
    if (d.parent >= 0) bones[d.parent]!.add(bn);
    bones[i] = bn;
  });
  mesh.add(bones[0]!);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  const root = new THREE.Group();
  root.add(mesh);
  const armor: THREE.Mesh[] = [];
  for (const pt of B.parts) {
    const m = new THREE.Mesh(pt.geo, mats[pt.key]);
    m.castShadow = m.receiveShadow = true;
    bones[pt.bone]!.add(m);
    armor.push(m);
  }
  parent.add(root);
  const b = (name: string): THREE.Bone => bones[BI[name]!]!;
  const restPos = bones.map((bn) => bn.position.clone());
  root.updateMatrixWorld(true);
  // 천: 망토 (등) · 앞 자락 · 뒤 자락
  const cloths: Cloth[] = [];
  if (opts.cloth !== false) {
    const capeA = range(-0.17, 0.17, 11).map((x) => V3(x, 1.435 + 0.025 * (1 - (x / 0.17) ** 2), -0.188 - 0.012 * (1 - (x / 0.17) ** 2)));
    cloths.push(new Cloth(b('chest'), KB[BI['chest']!]!.head, capeA, 15, 1.0, 0.75, 0x6a0c12, 0xa8823a, capeMat));
    const frontA = range(-0.095, 0.095, 5).map((x) => V3(x, 0.958, 0.214));
    cloths.push(new Cloth(b('hips'), KB[BI['hips']!]!.head, frontA, 7, 0.4, 0.15, 0x5e0a10, 0xa8823a, capeMat, 0.9, false));
    const backA = range(-0.095, 0.095, 5).map((x) => V3(x, 0.958, -0.214));
    cloths.push(new Cloth(b('hips'), KB[BI['hips']!]!.head, backA, 7, 0.4, 0.15, 0x5e0a10, 0xa8823a, capeMat, 0.9, false));
    for (const c of cloths) parent.add(c.mesh);
  }
  const caps: Cap[] = [
    { a: V3(0, 0, 0), b: V3(0, 0, 0), r: 0.205 },
    { a: V3(0, 0, 0), b: V3(0, 0, 0), r: 0.232 },
    { a: V3(0, 0, 0), b: V3(0, 0, 0), r: 0.13 },
    { a: V3(0, 0, 0), b: V3(0, 0, 0), r: 0.13 },
    { a: V3(0, 0, 0), b: V3(0, 0, 0), r: 0.095 },
    { a: V3(0, 0, 0), b: V3(0, 0, 0), r: 0.095 },
  ];
  const swordM = new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(-HC[0] + 0.004, HC[1] - 0.06, HC[2] + 0.004);
  const handHead = vp(mx(WR));
  const baseLocal = V3(0, 0.13, 0).applyMatrix4(swordM).sub(handHead);
  const tipLocal = V3(0, 0.9, 0).applyMatrix4(swordM).sub(handHead);
  const R = (bn: THREE.Bone, x: number, y: number, z: number): void => void bn.rotation.set(x, y, z, 'XZY');
  return {
    root,
    mesh,
    bones,
    armor,
    cloths,
    mats: [...Object.values(mats), body, capeMat],
    b,
    setArmor(on) {
      for (const m of armor) m.visible = on;
      for (const c of cloths) c.mesh.visible = on;
    },
    pose(P) {
      bones.forEach((bn, i) => {
        bn.position.copy(restPos[i]!);
        bn.rotation.set(0, 0, 0);
      });
      const a = P.walk;
      const s = Math.sin(P.ph);
      const c = Math.cos(P.ph);
      const br = Math.sin(P.t * 1.8);
      const sw = P.swing >= 0 ? keys(SW_KEYS, P.swing, _sw) : null;
      const lunge = sw ? sw[7]! : 0;
      // 다리
      R(b('thigh.L'), -0.5 * s * a - 0.42 * lunge, 0, 0.04);
      R(b('thigh.R'), 0.5 * s * a + 0.22 * lunge, 0, -0.04);
      R(b('shin.L'), a * (0.06 + 0.75 * Math.max(0, c)) + 0.32 * lunge, 0, 0);
      R(b('shin.R'), a * (0.06 + 0.75 * Math.max(0, -c)) + 0.1 * lunge, 0, 0);
      R(b('foot.L'), -0.8 * (b('thigh.L').rotation.x + b('shin.L').rotation.x), 0, -0.04);
      R(b('foot.R'), -0.8 * (b('thigh.R').rotation.x + b('shin.R').rotation.x), 0, 0.04);
      const hips = b('hips');
      hips.position.y += 0.022 * a * c * c - 0.018 * a - 0.06 * lunge - 0.004 * br;
      hips.position.z += 0.06 * lunge;
      R(hips, 0.04 * a, 0.1 * s * a, 0);
      // 몸통 · 머리
      const ch = b('chest');
      R(b('spine'), 0.03 * a + (sw ? sw[6]! * 0.5 : 0) - (P.castKind === 1 ? 0.1 * P.cast : 0), (sw ? sw[5]! * 0.4 : 0), 0);
      R(ch, 0.025 * br + (sw ? sw[6]! * 0.5 : 0) - (P.castKind === 1 ? 0.08 * P.cast : 0), -0.14 * s * a + (sw ? sw[5]! * 0.6 : 0) - (P.castKind === 0 ? 0.3 * P.cast : 0), 0);
      R(b('head'), -0.02 * br - (sw ? sw[6]! * 0.4 : 0) + (P.castKind === 1 ? -0.25 * P.cast : 0), -(sw ? sw[5]! * 0.5 : 0), 0);
      // 왼팔 (방패)
      const g = P.guard;
      R(b('armU.L'), 0.32 * s * a * (1 - g) + 0.04 - 0.42 * g, -1.0 * g, 0.12 + 0.05 * g);
      R(b('armF.L'), -0.32 - 0.98 * g - 0.1 * a, 0, 0);
      R(b('hand.L'), -0.1, 0, 0);
      // 오른팔 (칼): 서기 → 걷기 · 주문 · 휘두르기
      let ux = -0.12 - 0.22 * s * a;
      let uy = 0;
      let uz = -0.1;
      let fx = -0.55;
      let bp = 0.35;
      const k = P.cast;
      if (k > 0) {
        let cx = -1.45;
        let cy = 0;
        let cz = 0.1;
        let cf = -0.05;
        let cb = 0;
        if (P.castKind === 1) {
          cx = -2.95;
          cz = -0.15;
          cf = -0.1;
          cb = -1.57;
        } else if (P.castKind === 2) {
          cx = -2.3 + 0.25 * Math.sin(P.t * 9);
          cy = 0.4;
          cz = -0.6 + 0.25 * Math.cos(P.t * 9);
          cf = -0.6;
          cb = -1.9;
        }
        ux = lerp(ux, cx, k);
        uy = lerp(uy, cy, k);
        uz = lerp(uz, cz, k);
        fx = lerp(fx, cf, k);
        bp = lerp(bp, cb, k);
      }
      if (sw) {
        const e = Math.min(1, P.swing * 8, (1 - P.swing) * 8);
        ux = lerp(ux, sw[0]!, e);
        uy = lerp(uy, sw[1]!, e);
        uz = lerp(uz, sw[2]!, e);
        fx = lerp(fx, sw[3]!, e);
        bp = lerp(bp, sw[4]!, e);
      }
      R(b('armU.R'), ux, uy, uz);
      R(b('armF.R'), fx, 0, 0);
      R(b('hand.R'), bp - (ux + fx), 0, 0);
      root.updateMatrixWorld(true);
    },
    cloth(dt, wind = 0) {
      if (!cloths.length || !cloths[0]!.mesh.visible) return;
      const wp = (n: string, o: THREE.Vector3): THREE.Vector3 => o.setFromMatrixPosition(b(n).matrixWorld);
      wp('hips', caps[0]!.a).y -= 0.12;
      wp('neck', caps[0]!.b).y -= 0.05;
      wp('hips', caps[1]!.a).y -= 0.2;
      wp('hips', caps[1]!.b);
      wp('thigh.L', caps[2]!.a);
      wp('shin.L', caps[2]!.b);
      wp('thigh.R', caps[3]!.a);
      wp('shin.R', caps[3]!.b);
      wp('shin.L', caps[4]!.a);
      wp('foot.L', caps[4]!.b);
      wp('shin.R', caps[5]!.a);
      wp('foot.R', caps[5]!.b);
      for (const cl of cloths) cl.update(dt, caps, wind);
    },
    blade(base, tip) {
      const m = b('hand.R').matrixWorld;
      base.copy(baseLocal).applyMatrix4(m);
      tip.copy(tipLocal).applyMatrix4(m);
    },
    dispose() {
      geo.dispose();
      mesh.skeleton.dispose();
      for (const m of Object.values(mats)) m.dispose();
      body.dispose();
      capeMat.dispose();
      for (const c of cloths) {
        c.mesh.removeFromParent();
        c.dispose();
      }
      root.removeFromParent();
    },
  };
}

/* ───────────── 칼 궤적 (최근 칼날 자리를 이은 띠) ───────────── */

class Trail {
  readonly mesh: THREE.Mesh;
  private pos: Float32Array;
  private age: Float32Array;
  private geo = new THREE.BufferGeometry();
  private mat: THREE.ShaderMaterial;
  private n = 0;
  constructor(
    private N = 18,
    color = new THREE.Color(1.0, 0.9, 0.7),
  ) {
    this.pos = new Float32Array(N * 2 * 3);
    this.age = new Float32Array(N * 2);
    const side = new Float32Array(N * 2);
    const idx: number[] = [];
    for (let i = 0; i < N; i++) {
      side[i * 2] = 0;
      side[i * 2 + 1] = 1;
      if (i < N - 1) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aAge', new THREE.BufferAttribute(this.age, 1));
    this.geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    this.geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: color }, uOn: { value: 0 } },
      vertexShader: `attribute float aAge; attribute float aSide; varying float vA; varying float vS;
        void main(){ vA = aAge; vS = aSide; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uColor; uniform float uOn; varying float vA; varying float vS;
        void main(){ float a = pow(clamp(1.0 - vA, 0.0, 1.0), 1.6) * smoothstep(0.0, 0.9, vS) * uOn;
          vec3 c = mix(uColor, vec3(1.0), smoothstep(0.75, 1.0, vS) * (1.0 - vA));
          gl_FragColor = vec4(c * a, a); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
  }
  push(base: THREE.Vector3, tip: THREE.Vector3, on: number): void {
    this.pos.copyWithin(6, 0, (this.N - 1) * 6);
    base.toArray(this.pos, 0);
    tip.toArray(this.pos, 3);
    this.n = Math.min(this.N, this.n + 1);
    for (let i = 0; i < this.N; i++) this.age[i * 2] = this.age[i * 2 + 1] = i < this.n ? i / (this.N - 1) : 1;
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aAge') as THREE.BufferAttribute).needsUpdate = true;
    this.mat.uniforms.uOn!.value = on;
  }
  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

/** 만드는 중 화면 */
function waiting(r: R, w: number, h: number, hud: Hud, msg: Label, text: string): void {
  r.setClearColor(0x0b0a10, 1);
  r.setViewport(0, 0, w, h);
  r.clear();
  msg.visible = true;
  msg.set(text);
  hud.draw(r, w, h);
}
const pct = (): string => `${Math.round(KPROG * 100)}%`;

/* ═════════════ i489 갑옷 기사 ═════════════ */

function makeKnightShow(): Scene3D {
  const BG = 0x0d0b12;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const cam = new THREE.PerspectiveCamera(30, 1.6, 0.05, 40);
  const hud = new Hud();
  const msg = hud.label('갑옷 기사 빚는 중 …', 0.5, 0.5, 0.5, 0.5, 0.8);
  const tag = hud.label('대기', 0.03, 0.95, 0, 1, 0.62, '#ffcf4a', '#22180a');
  const note = hud.label('점토 몸 + 갑옷 부품 · 뼈 18개', 0.03, 0.04, 0, 0, 0.5, 'rgba(255,255,255,0.14)', 'rgba(255,255,255,0.85)');
  tag.visible = note.visible = false;
  // 빛 — 따뜻한 주광 (그림자) · 양옆 뒤 테두리 빛 · 낮은 반구광
  scene.add(new THREE.HemisphereLight(0x8090b8, 0x1a1210, 0.35));
  const key = new THREE.SpotLight(0xffe2c0, 42, 14, 0.5, 0.6, 1.6);
  key.position.set(2.2, 4.2, 3.2);
  key.target.position.set(0, 0.9, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 10;
  scene.add(key, key.target);
  const rimA = new THREE.DirectionalLight(0x7fb0ff, 2.4);
  rimA.position.set(-3, 2.5, -3);
  const rimB = new THREE.DirectionalLight(0xffb070, 1.6);
  rimB.position.set(3.2, 1.6, -2.4);
  scene.add(rimA, rimB);
  // 뒤 빛 번짐 판 · 바닥 원판 (돌)
  const backG = new THREE.Mesh(new THREE.PlaneGeometry(9, 6), new THREE.MeshBasicMaterial({ map: glow(), color: 0x3a2c48, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }));
  backG.position.set(0, 1.4, -3.5);
  scene.add(backG);
  const world = new THREE.Group();
  scene.add(world);
  let floor: THREE.Mesh | null = null;
  let rim: THREE.Mesh | null = null;
  let K: Knight | null = null;
  let kit: Kit | null = null;
  let dead = false;
  let texs: THREE.Texture[] = [];
  const trail = new Trail(20);
  scene.add(trail.mesh);
  const blobM = blob(1.3, 0.6);
  blobM.position.y = 0.012;
  scene.add(blobM);
  loadKit().then((k) => {
    if (dead) return;
    kit = k;
    const fm = pbrMat(k.pbr.rock, 1.3, 1.3, { color: 0xb8aea0 });
    floor = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.75, 0.12, 64), fm);
    floor.position.y = -0.06;
    floor.receiveShadow = true;
    rim = new THREE.Mesh(new THREE.TorusGeometry(1.72, 0.035, 10, 96), wear(new THREE.MeshStandardMaterial({ color: 0x6a5232, metalness: 1, roughness: 0.4 }), { bare: 0xd8b070 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = -0.005;
    world.add(floor, rim);
    texs = sceneTex(world);
  });
  const warm = new Warm();
  let mode = 0; // 0 자동 · 1 대기 · 2 걷기 · 3 휘두르기 · 4 방패
  let zoom = 0;
  let armorOn = true;
  let spin = true;
  let yaw = -0.3;
  let yawT = 0;
  const P: Pose = { t: 0, ph: 0, walk: 0, swing: -1, cast: 0, castKind: 0, guard: 0 };
  const bA = new THREE.Vector3();
  const bB = new THREE.Vector3();
  const tgt = new THREE.Vector3();
  const NAMES = ['대기', '걷기', '휘두르기', '방패 막기'];
  let shown = 0;
  return {
    scene,
    camera: cam,
    update(t, dt) {
      if (!K && knightReady()) {
        K = makeKnight(world);
        warm.reset();
      }
      if (!K) return;
      dt = Math.min(dt, 0.05);
      // 동작 고르기 (자동 = 11초 돌기)
      let act = mode - 1;
      let lt = t;
      if (mode === 0) {
        const c = t % 11;
        act = c < 2.6 ? 0 : c < 6.6 ? 1 : c < 8.6 ? 2 : 3;
        lt = c;
      }
      shown = act;
      const wTarget = act === 1 ? 1 : 0;
      P.walk += (wTarget - P.walk) * damp(dt, 0.25);
      P.ph += dt * 6.2 * P.walk;
      P.t = t;
      const gT = act === 3 ? 1 : 0;
      P.guard += (gT - P.guard) * damp(dt, 0.18);
      if (act === 2) {
        const st = mode === 0 ? lt - 6.6 : t % 1.8;
        P.swing = st < 1.6 ? clamp(st / 1.3, 0, 1) : -1;
      } else P.swing = -1;
      K.pose(P);
      if (spin) yawT += dt;
      yaw = -0.3 + 0.95 * Math.sin(yawT * 0.3);
      K.root.rotation.y = yaw;
      K.root.updateMatrixWorld(true);
      K.cloth(dt, Math.sin(t * 0.7) * 0.6);
      K.blade(bA, bB);
      trail.push(bA, bB, P.swing > 0.18 && P.swing < 0.85 ? 1 : 0);
    },
    render(r, w, h) {
      if (!K) return waiting(r, w, h, hud, msg, `갑옷 기사 빚는 중 … ${pct()}`);
      if (!kit) return waiting(r, w, h, hud, msg, '재질 받는 중 …');
      if (!pump(r, [...texs, ...sceneTex(K.root)])) return waiting(r, w, h, hud, msg, 'GPU 에 텍스처 올리는 중 …');
      if (kit.hdr) {
        const env = envFor(r, kit.hdr);
        if (!env) return waiting(r, w, h, hud, msg, '환경 빛 굽는 중 …');
        scene.environment = env;
        scene.environmentIntensity = 0.7;
      }
      if (!warm.ready(r, (rr) => withShadows(rr, () => rr.compileAsync(scene, cam)))) return waiting(r, w, h, hud, msg, '셰이더 굽는 중 …');
      msg.visible = false;
      tag.visible = note.visible = true;
      tag.set(mode === 0 ? `자동 · ${NAMES[shown]}` : NAMES[shown]!);
      note.set(armorOn ? '점토 몸 + 하드서피스 갑옷 · 뼈 18개' : '점토 몸 (거리 함수 → 표면 그물) · 자동 가중치');
      // 틀 — 확대하면 투구 쪽으로
      cam.aspect = w / h;
      const z = zoom;
      const half = lerp(1.08, 0.38, z);
      tgt.set(0, lerp(0.95, 1.56, z), 0);
      const vh = THREE.MathUtils.degToRad(cam.fov / 2);
      const d = Math.max(half / Math.tan(vh), (half * 0.62) / Math.tan(Math.atan(Math.tan(vh) * cam.aspect)));
      cam.position.set(tgt.x + d * 0.42, tgt.y + d * 0.2 + 0.1, tgt.z + d * 0.9);
      cam.near = Math.max(0.02, d * 0.2);
      cam.updateProjectionMatrix();
      cam.lookAt(tgt);
      r.setClearColor(BG, 1);
      withShadows(r, () => r.render(scene, cam));
      hud.draw(r, w, h);
    },
    controls: [
      { type: 'button', label: '동작 바꾸기 (자동 → 대기 → 걷기 → 휘두르기 → 방패)', on: () => (mode = (mode + 1) % 5) },
      { type: 'range', label: '가까이 (투구까지)', min: 0, max: 1, step: 0.01, value: 0, on: (v) => (zoom = v) },
      {
        type: 'toggle',
        label: '갑옷 입히기',
        value: true,
        on: (v) => {
          armorOn = v;
          K?.setArmor(v);
        },
      },
      { type: 'toggle', label: '천천히 돌리기', value: true, on: (v) => (spin = v) },
    ] as Control[],
    dispose() {
      dead = true;
      K?.dispose();
      trail.dispose();
      disposeTree(world);
      backG.geometry.dispose();
      (backG.material as THREE.Material).dispose();
      blobM.geometry.dispose();
      (blobM.material as THREE.Material).dispose();
      hud.dispose();
      void floor;
      void rim;
    },
  };
}

/* ═════════════ 던전 짓기 (글자 지도 → 벽 · 기둥 · 바닥 · 횃불) ═════════════ */

/** 가리는 벽 비우기 — 주인공 화면 자리(px) · 시야 깊이 · 반경 · 방식 */
interface CutU {
  uHero: { value: THREE.Vector3 };
  uRad: { value: number };
  uMode: { value: number };
}
const CUT_VH = /* glsl */ `
attribute float aFade;
varying float vFade;`;
const CUT_FH = /* glsl */ `
uniform vec3 uHero; uniform float uRad; uniform float uMode;
varying float vFade;
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }`;
const CUT_FB = /* glsl */ `
if (uMode > 0.5 && vFade > 0.002) {
  vec2 d = (gl_FragCoord.xy - uHero.xy) / uRad;
  float rr = length(d * vec2(1.0, 0.78));
  float inside = 1.0 - smoothstep(0.62, 1.0, rr);
  float front = step(vViewPosition.z, uHero.z);
  float k = vFade * inside * front;
  float keep = uMode < 1.5 ? 1.0 - k * 0.66 : 1.0 - k;
  if (bayer4(gl_FragCoord.xy) >= keep - 0.001) discard;
}`;
function cutify<M extends THREE.MeshStandardMaterial>(m: M, U: CutU): M {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>' + CUT_VH).replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>' + CUT_FH).replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>' + CUT_FB);
  };
  m.customProgramCacheKey = () => 'dia-cut-1';
  return m;
}
/** 횃불 불꽃 · 불티 (점 셰이더, 반복문 없음) */
const FIRE_VS = /* glsl */ `
attribute float seed;
attribute float tid;
uniform float uTime;
uniform float uScale;
uniform vec3 uO[4];
uniform float uMode;
varying float vLife;
varying float vSeed;
void main() {
  vec3 o = tid < 0.5 ? uO[0] : (tid < 1.5 ? uO[1] : (tid < 2.5 ? uO[2] : uO[3]));
  float ang = seed * 43.7;
  vec3 p;
  float sz;
  if (uMode < 0.5) {
    float life = fract(uTime * 1.7 + seed * 7.31);
    float rad = 0.075 * (1.0 - life) * (0.3 + 0.7 * fract(seed * 91.3));
    p = o + vec3(cos(ang) * rad, life * 0.5, sin(ang) * rad);
    p.x += sin(uTime * 9.0 + seed * 20.0) * 0.025 * life;
    p.z += cos(uTime * 7.0 + seed * 13.0) * 0.02 * life;
    sz = 0.26 * (1.0 - life * 0.75) * (0.6 + 0.4 * fract(seed * 13.1));
    vLife = life;
  } else {
    float life = fract(uTime * 0.32 + seed * 3.77);
    p = o + vec3(sin(ang + uTime * 1.3) * 0.3 * life, life * 1.8, cos(ang * 1.7 + uTime) * 0.3 * life);
    sz = 0.032 * (1.0 - life * 0.5);
    vLife = life;
  }
  vSeed = seed;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = sz * uScale / -mv.z;
}`;
const FIRE_FS = /* glsl */ `
uniform float uMode;
uniform float uTime;
varying float vLife;
varying float vSeed;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  if (r > 1.0) discard;
  if (uMode < 0.5) {
    float a = (1.0 - r) * (1.0 - r) * (1.0 - vLife * 0.9);
    vec3 c = mix(vec3(1.0, 0.93, 0.62), vec3(1.0, 0.48, 0.1), smoothstep(0.05, 0.45, vLife));
    c = mix(c, vec3(0.55, 0.08, 0.02), smoothstep(0.45, 1.0, vLife));
    gl_FragColor = vec4(c, a * 0.85);
  } else {
    float tw = 0.6 + 0.4 * sin(uTime * 17.0 + vSeed * 50.0);
    float a = smoothstep(1.0, 0.0, r) * (1.0 - vLife) * tw;
    gl_FragColor = vec4(1.0, 0.62, 0.22, a);
  }
}`;
const flick = (t: number, ph: number): number => 0.84 + 0.08 * Math.sin(t * 11 + ph) + 0.05 * Math.sin(t * 23.7 + ph * 1.7) + 0.03 * Math.sin(t * 5.3 + ph * 0.3);
/** 돌기둥 단면 (받침 · 몸통 · 머리) */
function columnProfile(h: number, r: number, rows: number): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [new THREE.Vector2(0.001, 0)];
  for (const [x, y] of [[r * 1.45, 0], [r * 1.45, 0.07], [r * 1.25, 0.1], [r * 1.18, 0.16], [r * 1.02, 0.2]] as const) pts.push(new THREE.Vector2(x, y * h * 0.5));
  const y0 = 0.1 * h;
  const y1 = 0.88 * h;
  for (let i = 0; i <= rows; i++) {
    const k = i / rows;
    pts.push(new THREE.Vector2(r * (1 + 0.06 * Math.sin(k * Math.PI) - 0.08 * k), y0 + (y1 - y0) * k));
  }
  for (const [x, y] of [[r, 0.9], [r * 1.2, 0.93], [r * 1.42, 0.96], [r * 1.42, 1.0]] as const) pts.push(new THREE.Vector2(x, y * h));
  pts.push(new THREE.Vector2(0.001, h));
  return pts;
}

interface DungeonOpt {
  map: string[];
  C: number;
  WH: number;
  /** 횃불: 바닥 칸 [i, j] 와 벽 쪽 [di, dj] */
  torches: [number, number, number, number][];
  /** 가리는 벽 비우기 재질 */
  cut?: CutU;
  /** 앞(남쪽) 줄 벽은 낮게 */
  lowSouth?: boolean;
}
interface Occ {
  box: THREE.Box3[];
  fade: Float32Array;
  attr: THREE.InstancedBufferAttribute;
}
interface Dungeon {
  group: THREE.Group;
  W: number;
  H: number;
  C: number;
  x(i: number): number;
  z(j: number): number;
  wall(i: number, j: number): boolean;
  occ: Occ[];
  flames: THREE.Vector3[];
  geos: THREE.BufferGeometry[];
}
function* buildDungeon(k: Kit, o: DungeonOpt, out: { d?: Dungeon }): Gen {
  const { map, C, WH } = o;
  const H = map.length;
  const W = map[0]!.length;
  const cx = (i: number): number => (i - (W - 1) / 2) * C;
  const cz = (j: number): number => (j - (H - 1) / 2) * C;
  const ch = (i: number, j: number): string => (i < 0 || j < 0 || i >= W || j >= H ? '#' : map[j]![i]!);
  const isWall = (i: number, j: number): boolean => ch(i, j) === '#';
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const G = <X extends THREE.BufferGeometry>(x: X): X => (geos.push(x), x);
  const cut = (m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial => (o.cut ? cutify(m, o.cut) : m);
  const mWall = cut(pbrMat(k.pbr.brick, 1, WH / C));
  const mCap = cut(pbrMat(k.pbr.rock, 0.6, 0.6, { color: 0x6e665c }));
  const mPil = cut(pbrMat(k.pbr.brick, 1, 1.6));
  const mBase = cut(pbrMat(k.pbr.rock, 0.5, 0.5, { color: 0x8a8174 }));
  const mFloor = pbrMat(k.pbr.rock, (W * C) / 2.4, (H * C) / 2.4, { color: 0xb4aa9c });
  const mIron = new THREE.MeshStandardMaterial({ color: 0x2c2826, metalness: 0.8, roughness: 0.55 });
  const mStick = new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.9 });
  const mRub = pbrMat(k.pbr.rock, 1.3, 1.3, { color: 0x857c70 });
  if (late()) yield;
  const fl = new THREE.Mesh(G(new THREE.PlaneGeometry(W * C, H * C)), mFloor);
  fl.rotation.x = -Math.PI / 2;
  fl.receiveShadow = true;
  group.add(fl);
  // 벽 (바닥과 닿는 칸만) + 위 덮개 돌
  const walls: [number, number, number][] = [];
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      if (!isWall(i, j)) continue;
      let near = false;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (!isWall(i + di, j + dj)) near = true;
      if (!near) continue;
      const low = o.lowSouth && j === H - 1;
      walls.push([i, j, low ? 0.55 : WH]);
    }
  const occ: Occ[] = [];
  const instGroup = (geo: THREE.BufferGeometry, mats: THREE.Material[], list: { p: P3; s: P3 }[], boxes: THREE.Box3[], capGeo?: THREE.BufferGeometry, capList?: { p: P3; s: P3 }[]): void => {
    const fade = new Float32Array(list.length);
    const attr = new THREE.InstancedBufferAttribute(fade, 1);
    attr.setUsage(THREE.DynamicDrawUsage);
    const mk = (g: THREE.BufferGeometry, m: THREE.Material, L: { p: P3; s: P3 }[]): void => {
      g.setAttribute('aFade', attr);
      const im = new THREE.InstancedMesh(g, m, L.length);
      const ob = new THREE.Object3D();
      L.forEach((it, i) => {
        ob.position.set(...it.p);
        ob.scale.set(...it.s);
        ob.updateMatrix();
        im.setMatrixAt(i, ob.matrix);
      });
      im.castShadow = im.receiveShadow = true;
      im.computeBoundingSphere();
      group.add(im);
    };
    mk(geo, mats[0]!, list);
    if (capGeo && capList) mk(capGeo, mats[1]!, capList);
    occ.push({ box: boxes, fade, attr });
  };
  if (walls.length) {
    const wl = walls.map(([i, j, h]) => ({ p: [cx(i), h / 2, cz(j)] as P3, s: [1, h / WH, 1] as P3 }));
    const cl = walls.map(([i, j, h]) => ({ p: [cx(i), h + 0.05, cz(j)] as P3, s: [1, 1, 1] as P3 }));
    const boxes = walls.map(([i, j, h]) => new THREE.Box3(V3(cx(i) - C / 2, 0, cz(j) - C / 2), V3(cx(i) + C / 2, h + 0.1, cz(j) + C / 2)));
    instGroup(G(new THREE.BoxGeometry(C, WH, C)), [mWall, mCap], wl, boxes, G(new THREE.BoxGeometry(C + 0.06, 0.1, C + 0.06)), cl);
  }
  if (late()) yield;
  // 기둥
  const pil: [number, number][] = [];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (ch(i, j) === 'o') pil.push([i, j]);
  if (pil.length) {
    const ph = WH * 1.0;
    const geo = G(new THREE.LatheGeometry(columnProfile(ph, 0.24, 10), 28));
    geo.translate(0, 0.12, 0);
    const boxes = pil.map(([i, j]) => new THREE.Box3(V3(cx(i) - 0.42, 0, cz(j) - 0.42), V3(cx(i) + 0.42, ph + 0.12, cz(j) + 0.42)));
    instGroup(
      geo,
      [mPil, mBase],
      pil.map(([i, j]) => ({ p: [cx(i), 0, cz(j)] as P3, s: [1, 1, 1] as P3 })),
      boxes,
      G(new THREE.BoxGeometry(0.84, 0.24, 0.84)),
      pil.map(([i, j]) => ({ p: [cx(i), 0.12, cz(j)] as P3, s: [1, 1, 1] as P3 })),
    );
  }
  if (late()) yield;
  // 벽 밑 그늘 (캔버스로 한 장 — 벽 칸을 흐리게)
  {
    const S = 24;
    const cv = document.createElement('canvas');
    cv.width = W * S;
    cv.height = H * S;
    const g = cv.getContext('2d')!;
    g.filter = `blur(${S * 0.32}px)`;
    g.fillStyle = 'rgba(0,0,0,0.9)';
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (isWall(i, j)) g.fillRect(i * S - 2, j * S - 2, S + 4, S + 4);
    for (const [i, j] of pil) {
      g.beginPath();
      g.arc((i + 0.5) * S, (j + 0.5) * S, S * 0.45, 0, TAU);
      g.fill();
    }
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    const ao = new THREE.Mesh(G(new THREE.PlaneGeometry(W * C, H * C)), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0.72, polygonOffset: true, polygonOffsetFactor: -2 }));
    ao.rotation.x = -Math.PI / 2;
    ao.position.y = 0.004;
    ao.renderOrder = 1;
    group.add(ao);
  }
  if (late()) yield;
  // 돌 부스러기 (벽 밑)
  {
    const rnd = rng(31);
    const list: { p: P3; r: P3; s: number }[] = [];
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        if (isWall(i, j) || ch(i, j) === 'o') continue;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          if (!isWall(i + di, j + dj) || rnd() > 0.45) continue;
          const u = (rnd() - 0.5) * C * 0.8;
          const v = C / 2 - 0.08 - rnd() * 0.15;
          list.push({ p: [cx(i) + (di ? di * v : u), 0, cz(j) + (dj ? dj * v : u)], r: [rnd() * 3, rnd() * 3, rnd() * 3], s: 0.6 + rnd() * 1.1 });
        }
      }
    if (list.length) {
      const im = new THREE.InstancedMesh(G(new THREE.IcosahedronGeometry(0.12, 1)), mRub, list.length);
      const ob = new THREE.Object3D();
      list.forEach((it, n) => {
        ob.position.set(it.p[0], 0.04 * it.s, it.p[2]);
        ob.rotation.set(...it.r);
        ob.scale.set(it.s, it.s * 0.6, it.s * 0.8);
        ob.updateMatrix();
        im.setMatrixAt(n, ob.matrix);
      });
      im.castShadow = im.receiveShadow = true;
      group.add(im);
    }
  }
  // 횃불 받침
  const flames: THREE.Vector3[] = [];
  for (const [i, j, di, dj] of o.torches) {
    const tg = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
      const m = new THREE.Mesh(G(geo), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      tg.add(m);
      return m;
    };
    add(new THREE.BoxGeometry(0.2, 0.34, 0.05), mIron, 0, 0, 0.025);
    add(new THREE.CylinderGeometry(0.022, 0.022, 0.32, 8), mIron, 0, 0.02, 0.17).rotation.x = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.085, 0.04, 0.13, 12, 1, true), mIron, 0, 0.1, 0.3);
    add(new THREE.CylinderGeometry(0.03, 0.035, 0.28, 8), mStick, 0, 0.19, 0.3);
    // 벽면에 붙이기: 바닥 칸에서 벽 쪽으로 반 칸
    tg.position.set(cx(i) + di * (C / 2), WH * 0.62, cz(j) + dj * (C / 2));
    tg.rotation.y = Math.atan2(-di, -dj);
    group.add(tg);
    tg.updateMatrixWorld(true);
    flames.push(V3(0, 0.36, 0.3).applyMatrix4(tg.matrixWorld));
  }
  out.d = {
    group,
    W,
    H,
    C,
    x: cx,
    z: cz,
    wall: isWall,
    occ,
    flames,
    geos,
  };
}
const _ray = new THREE.Ray();
const _bx = new THREE.Box3();
const _hit = new THREE.Vector3();
/** 카메라 → 주인공 (발 · 가슴 · 머리) 사이 상자면 비울 대상 — 부드럽게 다가감 */
function updateOcc(d: Dungeon, from: THREE.Vector3, hero: THREE.Vector3, dt: number): number {
  let n = 0;
  const tg = [0.3, 1.1, 1.75];
  for (const oc of d.occ) {
    let any = false;
    for (let i = 0; i < oc.box.length; i++) {
      _bx.copy(oc.box[i]!).expandByScalar(0.16);
      let want = 0;
      for (const hy of tg) {
        _hit.set(hero.x, hero.y + hy, hero.z);
        const len = _hit.distanceTo(from);
        _ray.origin.copy(from);
        _ray.direction.subVectors(_hit, from).normalize();
        const p = _ray.intersectBox(_bx, _v);
        if (p && p.distanceTo(from) < len - 0.06) {
          want = 1;
          break;
        }
      }
      if (want) n++;
      const f = oc.fade[i]!;
      const nf = f + (want - f) * damp(dt, 0.11);
      if (Math.abs(nf - f) > 1e-4) {
        oc.fade[i] = Math.abs(nf - want) < 0.003 ? want : nf;
        any = true;
      }
    }
    if (any) oc.attr.needsUpdate = true;
  }
  return n;
}
/** 길 (칸 목록) → 닫힌 매끈한 곡선 */
function pathCurve(d: Dungeon, cells: [number, number][]): THREE.CatmullRomCurve3 {
  return new THREE.CatmullRomCurve3(
    cells.map(([i, j]) => V3(d.x(i), 0, d.z(j))),
    true,
    'catmullrom',
    0.2,
  );
}
/** 횃불 불꽃 묶음 (최대 4) — 점 셰이더 + 빛 무리, 점광원은 따로 */
class Torches {
  readonly group = new THREE.Group();
  readonly fp: THREE.Vector3[] = [V3(0, -50, 0), V3(0, -50, 0), V3(0, -50, 0), V3(0, -50, 0)];
  private mats: THREE.ShaderMaterial[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private halos: THREE.Sprite[][] = [];
  readonly uScale = { value: 400 };
  private uTime = { value: 0 };
  constructor(flames: THREE.Vector3[]) {
    flames.slice(0, 4).forEach((f, i) => this.fp[i]!.copy(f));
    const mk = (n: number, mode: number, seedK: number): void => {
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array(n * 3);
      const seed = new Float32Array(n);
      const tid = new Float32Array(n);
      const rnd = rng(seedK);
      for (let i = 0; i < n; i++) {
        seed[i] = rnd();
        tid[i] = i % Math.max(1, Math.min(4, flames.length));
      }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
      g.setAttribute('tid', new THREE.BufferAttribute(tid, 1));
      const m = new THREE.ShaderMaterial({
        vertexShader: FIRE_VS,
        fragmentShader: FIRE_FS,
        uniforms: { uTime: this.uTime, uScale: this.uScale, uO: { value: this.fp }, uMode: { value: mode } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const p = new THREE.Points(g, m);
      p.frustumCulled = false;
      p.renderOrder = 3;
      this.group.add(p);
      this.mats.push(m);
      this.geos.push(g);
    };
    const nf = Math.max(1, Math.min(4, flames.length));
    mk(nf * 36, 0, 11);
    mk(nf * 14, 1, 23);
    for (let i = 0; i < nf; i++) {
      const a = glowSprite(0xffb060, 0.5, 0.9);
      const b = glowSprite(0xff7a20, 2.0, 0.2);
      this.group.add(a, b);
      this.halos.push([a, b]);
    }
  }
  update(t: number): void {
    this.uTime.value = t;
    this.halos.forEach(([a, b], i) => {
      const f = flick(t, i * 2.1);
      a!.position.copy(this.fp[i]!).y += 0.1;
      b!.position.copy(this.fp[i]!).y += 0.1;
      a!.scale.setScalar(0.5 * (0.85 + 0.3 * f));
      b!.scale.setScalar(2.1 * f);
    });
  }
  dispose(): void {
    for (const m of this.mats) m.dispose();
    for (const g of this.geos) g.dispose();
    for (const h of this.halos) for (const s of h) s.material.dispose();
  }
}

/* ═════════════ 쿼터뷰 던전 무대 (i488 · i491 같이 씀) ═════════════ */

const MAZE = [
  '###########',
  '#....#....#',
  '#.o..#..o.#',
  '#.........#',
  '###.###.###',
  '#.........#',
  '#..o...o..#',
  '#....#....#',
  '###########',
];
const MAZE_PATH: [number, number][] = [
  [1, 3], [2, 3], [3, 3], [3, 5], [5, 5], [5, 6], [6, 6], [6, 7], [8, 7], [8, 5], [7, 5], [7, 3], [4, 3], [4, 1], [1, 1], [1, 2],
];
const MAZE_TORCH: [number, number, number, number][] = [
  [2, 1, 0, -1],
  [9, 3, 1, 0],
  [1, 6, -1, 0],
  [8, 7, 0, 1],
];
const LAYER_WORLD = 2;
const LAYER_HERO = 1;
function onlyLayer(root: THREE.Object3D, keep: number, drop: number): void {
  root.traverse((o) => {
    o.layers.enable(keep);
    o.layers.disable(drop);
  });
}

interface Stage {
  scene: THREE.Scene;
  cam: THREE.PerspectiveCamera;
  hud: Hud;
  msg: Label;
  U: CutU;
  d: Dungeon | null;
  K: Knight | null;
  torch: Torches | null;
  hero: THREE.Vector3;
  heroDir: number;
  heroLight: THREE.PointLight;
  lights: THREE.PointLight[];
  moon: THREE.DirectionalLight;
  sil: THREE.MeshBasicMaterial;
  curve: THREE.CatmullRomCurve3 | null;
  s: number;
  P: Pose;
  /** 렌더 준비 (재질 · 기사 · 컴파일) — 안 되면 기다림 화면을 그리고 false */
  ready(r: R, w: number, h: number): boolean;
  /** 주인공 걷기 · 카메라 · 빛 · 가림 판정 */
  step(t: number, dt: number, walk: boolean): number;
  /** 세 번 나눠 그리기 (벽 → 벽 너머 윤곽 → 주인공) */
  draw(r: R, x: number, y: number, w: number, h: number, mode: number, sil: boolean, rad: number): void;
  dispose(): void;
}
function makeStage(opt: { speed?: number; cut?: boolean } = {}): Stage {
  const BG = 0x050407;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, 13, 26);
  const cam = new THREE.PerspectiveCamera(34, 1.6, 0.5, 60);
  const hud = new Hud();
  const msg = hud.label('던전 짓는 중 …', 0.5, 0.5, 0.5, 0.5, 0.8);
  const U: CutU = { uHero: { value: new THREE.Vector3() }, uRad: { value: 100 }, uMode: { value: 2 } };
  scene.add(new THREE.HemisphereLight(0x46557a, 0x0e0907, 0.5));
  const moon = new THREE.DirectionalLight(0x8098d0, 0.9);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  Object.assign(moon.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
  moon.shadow.bias = -0.0006;
  moon.shadow.normalBias = 0.03;
  scene.add(moon, moon.target);
  const heroLight = new THREE.PointLight(0xffd2a0, 16, 8, 1.5);
  scene.add(heroLight);
  const lights = [0, 1, 2, 3].map(() => {
    const l = new THREE.PointLight(0xff9c58, 8, 6, 2);
    l.position.set(0, -40, 0);
    scene.add(l);
    return l;
  });
  const sil = new THREE.MeshBasicMaterial({ color: 0x2f7cff, depthFunc: THREE.GreaterDepth, depthWrite: false, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, toneMapped: false, fog: false });
  const world = new THREE.Group();
  scene.add(world);
  const job = new Job();
  let kit: Kit | null = null;
  let dead = false;
  let texs: THREE.Texture[] = [];
  const warm = new Warm();
  const blobM = blob(1.1, 0.65);
  scene.add(blobM);
  scene.traverse((o) => o.layers.enableAll()); // 빛 · 그늘은 모든 층에서 보이게
  const st: Stage = {
    scene,
    cam,
    hud,
    msg,
    U,
    d: null,
    K: null,
    torch: null,
    hero: V3(0, 0, 0),
    heroDir: 0,
    heroLight,
    lights,
    moon,
    sil,
    curve: null,
    s: 0,
    P: { t: 0, ph: 0, walk: 1, swing: -1, cast: 0, castKind: 0, guard: 0 },
    ready(r, w, h) {
      if (!st.d) {
        waiting(r, w, h, hud, msg, kit ? '던전 짓는 중 …' : '실사 재질 받는 중 …');
        return false;
      }
      if (!st.K) {
        waiting(r, w, h, hud, msg, `갑옷 기사 빚는 중 … ${pct()}`);
        return false;
      }
      if (!pump(r, texs)) {
        waiting(r, w, h, hud, msg, 'GPU 에 텍스처 올리는 중 …');
        return false;
      }
      if (kit?.hdr) {
        const env = envFor(r, kit.hdr);
        if (!env) {
          waiting(r, w, h, hud, msg, '환경 빛 굽는 중 …');
          return false;
        }
        scene.environment = env;
        scene.environmentIntensity = 0.12;
      }
      const ok = warm.ready(r, (rr) =>
        withShadows(rr, () => {
          // 윤곽선 재질(겹쳐 그리기용)도 같은 조건으로 미리 컴파일 — 쌍둥이를 잠깐 붙였다 뗀다
          const twins: THREE.Object3D[] = [];
          const sk = new THREE.SkinnedMesh(st.K!.mesh.geometry, sil);
          sk.bind(st.K!.mesh.skeleton, st.K!.mesh.bindMatrix);
          const pm = new THREE.Mesh(st.K!.armor[0]!.geometry, sil);
          twins.push(sk, pm);
          for (const tw of twins) scene.add(tw);
          const p = rr.compileAsync(scene, cam);
          for (const tw of twins) scene.remove(tw);
          return p;
        }),
      );
      if (!ok) {
        waiting(r, w, h, hud, msg, '셰이더 굽는 중 …');
        return false;
      }
      msg.visible = false;
      return true;
    },
    step(t, dt, walk) {
      if (job.busy) job.step();
      if (st.d && !st.K && knightReady()) {
        st.K = makeKnight(world);
        onlyLayer(st.K.root, LAYER_HERO, LAYER_WORLD);
        for (const c of st.K.cloths) onlyLayer(c.mesh, LAYER_HERO, LAYER_WORLD);
        texs = sceneTex(scene);
        warm.reset();
      }
      if (!st.d || !st.K || !st.curve) return 0;
      dt = Math.min(dt, 0.05);
      const sp = opt.speed ?? 1.25;
      const L = st.curve.getLength();
      if (walk) st.s = (st.s + (dt * sp) / L) % 1;
      st.curve.getPointAt(st.s, st.hero);
      const tan = st.curve.getTangentAt(st.s, _v);
      const want = Math.atan2(tan.x, tan.z);
      let dy = want - st.heroDir;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      st.heroDir += dy * damp(dt, 0.12);
      st.P.t = t;
      st.P.walk += ((walk ? 1 : 0) - st.P.walk) * damp(dt, 0.2);
      st.P.ph += dt * 7.6 * st.P.walk;
      const K = st.K;
      K.pose(st.P);
      K.root.position.copy(st.hero);
      K.root.rotation.y = st.heroDir;
      K.root.updateMatrixWorld(true);
      K.cloth(dt, 0);
      blobM.position.set(st.hero.x, 0.009, st.hero.z);
      // 카메라 · 달빛 그림자 · 손전등 · 가까운 횃불
      const tg = _v.set(st.hero.x, 0.8, st.hero.z);
      cam.position.set(tg.x + 3.7, tg.y + 6.9, tg.z + 5.0);
      cam.lookAt(tg);
      moon.position.set(tg.x - 3, 10, tg.z + 2.5);
      moon.target.position.copy(tg);
      heroLight.position.set(st.hero.x + 0.3, 2.6, st.hero.z + 0.6);
      st.torch!.update(t);
      st.d.flames.forEach((f, i) => {
        const l = lights[i];
        if (!l) return;
        l.position.copy(f).y += 0.12;
        l.intensity = 8 * flick(t, i * 2.1);
      });
      return opt.cut === false ? 0 : updateOcc(st.d, cam.position, st.hero, dt);
    },
    draw(r, x, y, w, h, mode, silOn, rad) {
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
      st.torch!.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
      r.setViewport(x, y, w, h);
      r.setScissor(x, y, w, h);
      r.setScissorTest(true);
      // 주인공 화면 자리 (실제 픽셀) · 시야 깊이
      const vp = r.getCurrentViewport(new THREE.Vector4());
      const pc = _v.set(st.hero.x, 1.0, st.hero.z).project(cam);
      const hv = V3(st.hero.x, 1.0, st.hero.z).applyMatrix4(cam.matrixWorldInverse);
      U.uHero.value.set(vp.x + (pc.x * 0.5 + 0.5) * vp.z, vp.y + (pc.y * 0.5 + 0.5) * vp.w, -hv.z - 0.3);
      U.uRad.value = rad * vp.w;
      U.uMode.value = mode;
      const ac = r.autoClear;
      const au = r.shadowMap.autoUpdate;
      r.setClearColor(BG, 1);
      withShadows(r, () => {
        cam.layers.set(LAYER_WORLD);
        r.render(scene, cam);
        r.autoClear = false;
        r.shadowMap.autoUpdate = false;
        const bg = scene.background;
        scene.background = null;
        cam.layers.set(LAYER_HERO);
        if (silOn) {
          scene.overrideMaterial = sil;
          r.render(scene, cam);
          scene.overrideMaterial = null;
        }
        r.render(scene, cam);
        scene.background = bg;
      });
      cam.layers.set(0);
      r.autoClear = ac;
      r.shadowMap.autoUpdate = au;
      r.setScissorTest(false);
    },
    dispose() {
      dead = true;
      st.K?.dispose();
      st.torch?.dispose();
      if (st.d) for (const g of st.d.geos) g.dispose();
      disposeTree(world, new Set(st.d?.geos ?? []));
      blobM.geometry.dispose();
      (blobM.material as THREE.Material).dispose();
      sil.dispose();
      hud.dispose();
    },
  };
  loadKit().then((k) => {
    if (dead) return;
    kit = k;
    const out: { d?: Dungeon } = {};
    job.start(
      (function* (): Gen {
        yield* buildDungeon(k, { map: MAZE, C: 1.3, WH: 2.3, torches: MAZE_TORCH, cut: opt.cut === false ? undefined : U }, out);
        const d = out.d!;
        onlyLayer(d.group, LAYER_WORLD, LAYER_HERO);
        world.add(d.group);
        st.torch = new Torches(d.flames);
        onlyLayer(st.torch.group, LAYER_WORLD, LAYER_HERO);
        world.add(st.torch.group);
        st.curve = pathCurve(d, MAZE_PATH);
        st.d = d;
      })(),
    );
  });
  return st;
}

/* ═════════════ i488 가리는 벽 투명 처리 ═════════════ */

const CUT_NAME = ['끔', '점무늬 반투명', '둥글게 비우기'];
function makeOccluder(): Scene3D {
  const st = makeStage();
  const hud = st.hud;
  const tag = hud.label('', 0.03, 0.95, 0, 1, 0.6, '#ffcf4a', '#22180a');
  const foot = hud.label('', 0.5, 0.04, 0.5, 0, 0.52, 'rgba(10,8,14,0.7)', '#ffffff');
  const la = hud.label('끔', 0.25, 0.95, 0.5, 1, 0.6, 'rgba(255,255,255,0.16)', 'rgba(255,255,255,0.85)');
  const lb = hud.label('켬', 0.75, 0.95, 0.5, 1, 0.6, '#ffcf4a', '#22180a');
  tag.visible = foot.visible = la.visible = lb.visible = false;
  let mode = 2;
  let sil = true;
  let rad = 0.22;
  let split = false;
  let walk = true;
  let hidden = 0;
  return {
    scene: st.scene,
    camera: st.cam,
    update(t, dt) {
      hidden = st.step(t, dt, walk);
    },
    render(r, w, h) {
      if (!st.ready(r, w, h)) return;
      if (split) {
        const hw = Math.floor(w / 2);
        st.draw(r, 0, 0, hw, h, 0, false, rad);
        st.draw(r, hw, 0, w - hw, h, mode || 2, sil, rad);
        r.setViewport(0, 0, w, h);
      } else st.draw(r, 0, 0, w, h, mode, sil && mode > 0, rad);
      tag.visible = !split;
      la.visible = lb.visible = split;
      foot.visible = true;
      tag.set(`가리는 벽: ${CUT_NAME[mode]}${sil && mode > 0 ? ' + 윤곽선' : ''}`);
      foot.set(hidden ? `카메라 → 기사 사이 ${hidden}칸 · 기사 둘레만 비움` : '가리는 것 없음 — 벽 그대로');
      hud.draw(r, w, h);
    },
    controls: [
      { type: 'button', label: '방식 바꾸기 (끔 → 점무늬 반투명 → 둥글게 비우기)', on: () => (mode = (mode + 1) % 3) },
      { type: 'toggle', label: '벽 너머 기사 윤곽선', value: true, on: (v) => (sil = v) },
      { type: 'range', label: '비우는 화면 반경', min: 0.1, max: 0.42, step: 0.01, value: rad, on: (v) => (rad = v) },
      { type: 'toggle', label: '끔 · 켬 나란히', value: false, on: (v) => (split = v) },
      { type: 'toggle', label: '기사 걷기', value: true, on: (v) => (walk = v) },
    ] as Control[],
    dispose() {
      st.dispose();
    },
  };
}

/* ═════════════ i490 던전 스킬 연출 — 입자 · 데칼 · 회오리 · 번개 ═════════════ */

const PARTS_VS = /* glsl */ `
attribute vec3 aCol; attribute float aSize; attribute float aAlpha;
uniform float uScale;
varying vec3 vC; varying float vA;
void main() {
  vC = aCol; vA = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / -mv.z;
}`;
const PARTS_FS = /* glsl */ `
uniform float uSoft;
varying vec3 vC; varying float vA;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  if (r > 1.0) discard;
  float a = uSoft > 0.5 ? smoothstep(1.0, 0.1, r) * vA : pow(1.0 - r, 1.7) * vA;
  gl_FragColor = vec4(vC, a);
}`;
interface Spawn {
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
  s0: number;
  s1: number;
  c0: THREE.Color;
  c1: THREE.Color;
  drag?: number;
  grav?: number;
  a?: number;
}
/** CPU 입자 묶음 (가산 = 불 · 불꽃 · 번개, 보통 = 연기 · 먼지) */
class Parts {
  readonly points: THREE.Points;
  private n = 0;
  private p: Float32Array;
  private v: Float32Array;
  private c0: Float32Array;
  private c1: Float32Array;
  private age: Float32Array;
  private life: Float32Array;
  private s0: Float32Array;
  private s1: Float32Array;
  private dr: Float32Array;
  private gr: Float32Array;
  private a0: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private geo = new THREE.BufferGeometry();
  readonly mat: THREE.ShaderMaterial;
  constructor(
    private max: number,
    additive: boolean,
    uScale: { value: number },
  ) {
    const f = (k: number): Float32Array => new Float32Array(max * k);
    this.p = f(3);
    this.v = f(3);
    this.c0 = f(3);
    this.c1 = f(3);
    this.age = f(1);
    this.life = f(1);
    this.s0 = f(1);
    this.s1 = f(1);
    this.dr = f(1);
    this.gr = f(1);
    this.a0 = f(1);
    this.col = f(3);
    this.size = f(1);
    this.alpha = f(1);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aCol', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: PARTS_VS,
      fragmentShader: PARTS_FS,
      uniforms: { uScale, uSoft: { value: additive ? 0 : 1 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 6 : 5;
  }
  spawn(o: Spawn): void {
    if (this.n >= this.max) return;
    const i = this.n++;
    o.p.toArray(this.p, i * 3);
    o.v.toArray(this.v, i * 3);
    o.c0.toArray(this.c0, i * 3);
    o.c1.toArray(this.c1, i * 3);
    this.age[i] = 0;
    this.life[i] = o.life;
    this.s0[i] = o.s0;
    this.s1[i] = o.s1;
    this.dr[i] = o.drag ?? 0;
    this.gr[i] = o.grav ?? 0;
    this.a0[i] = o.a ?? 1;
  }
  clear(): void {
    this.n = 0;
    this.geo.setDrawRange(0, 0);
  }
  update(dt: number): void {
    let i = 0;
    while (i < this.n) {
      this.age[i] = this.age[i]! + dt;
      if (this.age[i]! >= this.life[i]!) {
        const j = --this.n;
        if (i !== j) {
          for (const [arr, k] of [[this.p, 3], [this.v, 3], [this.c0, 3], [this.c1, 3], [this.age, 1], [this.life, 1], [this.s0, 1], [this.s1, 1], [this.dr, 1], [this.gr, 1], [this.a0, 1]] as const)
            for (let q = 0; q < k; q++) arr[i * k + q] = arr[j * k + q]!;
        }
        continue;
      }
      const t = this.age[i]! / this.life[i]!;
      const d = Math.max(0, 1 - this.dr[i]! * dt);
      for (let q = 0; q < 3; q++) {
        const k = i * 3 + q;
        this.v[k] = this.v[k]! * d + (q === 1 ? this.gr[i]! * dt : 0);
        this.p[k] = this.p[k]! + this.v[k]! * dt;
        this.col[k] = lerp(this.c0[k]!, this.c1[k]!, t);
      }
      this.size[i] = lerp(this.s0[i]!, this.s1[i]!, t);
      this.alpha[i] = this.a0[i]! * Math.min(1, t * 8) * (1 - t) * (1 - t * 0.3);
      i++;
    }
    this.geo.setDrawRange(0, this.n);
    for (const k of ['position', 'aCol', 'aSize', 'aAlpha']) (this.geo.getAttribute(k) as THREE.BufferAttribute).needsUpdate = true;
  }
  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
/** 바닥 그을음 데칼 (울퉁불퉁한 가장자리 · 금 간 숯) */
function scorchTex(seed: number, tint: [number, number, number]): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const rnd = rng(seed);
  for (let i = 0; i < 26; i++) {
    const a = rnd() * TAU;
    const rr = rnd() * S * 0.22;
    const x = S / 2 + Math.cos(a) * rr;
    const y = S / 2 + Math.sin(a) * rr;
    const R = S * (0.14 + rnd() * 0.18);
    const rg = g.createRadialGradient(x, y, 0, x, y, R);
    rg.addColorStop(0, `rgba(${tint[0]},${tint[1]},${tint[2]},0.5)`);
    rg.addColorStop(1, `rgba(${tint[0]},${tint[1]},${tint[2]},0)`);
    g.fillStyle = rg;
    g.fillRect(0, 0, S, S);
  }
  // 갈라진 금
  g.strokeStyle = 'rgba(0,0,0,0.6)';
  g.lineWidth = 2;
  for (let k = 0; k < 9; k++) {
    let x = S / 2;
    let y = S / 2;
    let a = (k / 9) * TAU + rnd() * 0.5;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 8; s++) {
      a += (rnd() - 0.5) * 0.9;
      x += Math.cos(a) * S * 0.04;
      y += Math.sin(a) * S * 0.04;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** 삼베 무늬 (허수아비 자루) */
function burlapTex(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#9a8264';
  g.fillRect(0, 0, S, S);
  const rnd = rng(5);
  for (let y = 0; y < S; y += 4) {
    g.fillStyle = `rgba(60,40,20,${0.12 + rnd() * 0.12})`;
    g.fillRect(0, y, S, 1.5);
  }
  for (let x = 0; x < S; x += 4) {
    g.fillStyle = `rgba(255,240,200,${0.06 + rnd() * 0.08})`;
    g.fillRect(x, 0, 1.5, S);
  }
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(40,25,10,${rnd() * 0.12})`;
    g.fillRect(rnd() * S, rnd() * S, 2 + rnd() * 6, 1 + rnd() * 2);
  }
  // 바늘땀 (세로 줄)
  g.strokeStyle = 'rgba(50,30,15,0.8)';
  g.lineWidth = 3;
  for (let y = 8; y < S; y += 22) {
    g.beginPath();
    g.moveTo(S / 2 - 6, y);
    g.lineTo(S / 2 + 6, y + 10);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
/** 번개 줄기 — 가운데 점 흔들어 나누기 + 곁가지 */
function boltLines(a: THREE.Vector3, b: THREE.Vector3, rnd: () => number): THREE.Vector3[][] {
  const split = (s: THREE.Vector3, e: THREE.Vector3, lv: number, amp: number): THREE.Vector3[] => {
    let pts = [s.clone(), e.clone()];
    let k = amp;
    for (let l = 0; l < lv; l++) {
      const np: THREE.Vector3[] = [pts[0]!];
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i]!;
        const q = pts[i + 1]!;
        const m = p.clone().add(q).multiplyScalar(0.5);
        const len = p.distanceTo(q);
        m.x += (rnd() - 0.5) * len * k;
        m.z += (rnd() - 0.5) * len * k;
        m.y += (rnd() - 0.5) * len * k * 0.3;
        np.push(m, q);
      }
      pts = np;
      k *= 0.92;
    }
    return pts;
  };
  const main = split(a, b, 6, 0.55);
  const out = [main];
  for (let k = 0; k < 4; k++) {
    const i = Math.floor(main.length * (0.2 + rnd() * 0.55));
    const s = main[i]!;
    const dir = V3((rnd() - 0.5) * 2, -0.8 - rnd(), (rnd() - 0.5) * 2).normalize();
    const e = s.clone().addScaledVector(dir, 0.8 + rnd() * 1.3);
    out.push(split(s, e, 4, 0.6));
  }
  return out;
}
const BOLT_VS = /* glsl */ `
attribute float aS; attribute float aW;
varying float vS; varying float vW;
void main() { vS = aS; vW = aW; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const BOLT_FS = /* glsl */ `
uniform vec3 uCol; uniform float uA; uniform float uCore;
varying float vS; varying float vW;
void main() {
  float x = abs(vS);
  float a = uCore > 0.5 ? smoothstep(1.0, 0.2, x) : pow(1.0 - x, 2.2);
  a *= uA * vW;
  vec3 c = mix(uCol, vec3(1.0), uCore);
  gl_FragColor = vec4(c, a);
}`;
class Bolt {
  readonly glowM: THREE.Mesh;
  readonly coreM: THREE.Mesh;
  private geoG = new THREE.BufferGeometry();
  private geoC = new THREE.BufferGeometry();
  readonly uA = { value: 0 };
  private mats: THREE.ShaderMaterial[];
  constructor() {
    const mk = (core: boolean): THREE.ShaderMaterial =>
      new THREE.ShaderMaterial({
        vertexShader: BOLT_VS,
        fragmentShader: BOLT_FS,
        uniforms: { uCol: { value: new THREE.Color(0.45, 0.62, 1.0) }, uA: this.uA, uCore: { value: core ? 1 : 0 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
    this.mats = [mk(false), mk(true)];
    this.glowM = new THREE.Mesh(this.geoG, this.mats[0]);
    this.coreM = new THREE.Mesh(this.geoC, this.mats[1]);
    for (const m of [this.glowM, this.coreM]) {
      m.frustumCulled = false;
      m.renderOrder = 7;
    }
  }
  build(lines: THREE.Vector3[][], cam: THREE.Vector3): void {
    const make = (geo: THREE.BufferGeometry, width: number): void => {
      const pos: number[] = [];
      const s: number[] = [];
      const w: number[] = [];
      const side = new THREE.Vector3();
      const dir = new THREE.Vector3();
      const view = new THREE.Vector3();
      lines.forEach((pts, li) => {
        const wk = li === 0 ? 1 : 0.55;
        for (let i = 0; i < pts.length - 1; i++) {
          const p = pts[i]!;
          const q = pts[i + 1]!;
          dir.subVectors(q, p).normalize();
          view.subVectors(cam, p).normalize();
          side.crossVectors(dir, view).normalize().multiplyScalar(width * wk);
          const fa = li === 0 ? 1 : 1 - i / (pts.length - 1);
          const fb = li === 0 ? 1 : 1 - (i + 1) / (pts.length - 1);
          const P = [p.x - side.x, p.y - side.y, p.z - side.z, p.x + side.x, p.y + side.y, p.z + side.z, q.x - side.x, q.y - side.y, q.z - side.z, q.x + side.x, q.y + side.y, q.z + side.z];
          const order = [0, 1, 2, 1, 3, 2];
          for (const o of order) {
            pos.push(P[o * 3]!, P[o * 3 + 1]!, P[o * 3 + 2]!);
            s.push(o & 1 ? 1 : -1);
            w.push(o < 2 ? fa : fb);
          }
        }
      });
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('aS', new THREE.Float32BufferAttribute(s, 1));
      geo.setAttribute('aW', new THREE.Float32BufferAttribute(w, 1));
    };
    make(this.geoG, 0.42);
    make(this.geoC, 0.065);
  }
  dispose(): void {
    this.geoG.dispose();
    this.geoC.dispose();
    for (const m of this.mats) m.dispose();
  }
}
const TORN_VS = /* glsl */ `
uniform float uT;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 p = position;
  float h = uv.y;
  p.x += sin(h * 3.0 + uT * 3.1) * 0.16 * h;
  p.z += cos(h * 2.6 + uT * 2.7) * 0.12 * h;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const TORN_FS = /* glsl */ `
uniform float uT; uniform float uA; uniform vec3 uCol; uniform float uSpd;
uniform sampler2D uNoise;
varying vec2 vUv;
void main() {
  float y = vUv.y;
  vec2 q = vec2(vUv.x * 3.0 + uT * uSpd - y * 1.7, y * 0.85 - uT * 0.75);
  float n = texture2D(uNoise, q).r;
  float n2 = texture2D(uNoise, q * vec2(2.0, 1.4) + 0.37).a;
  float streak = smoothstep(0.42, 0.86, n * 0.62 + n2 * 0.55);
  float fade = smoothstep(0.0, 0.14, y) * (1.0 - smoothstep(0.7, 1.0, y));
  float a = streak * fade * uA;
  gl_FragColor = vec4(uCol, a);
}`;

const ROOM = ['#########', '#o.....o#', '#.......#', '#.......#', '#.......#', '.........'];
interface Dummy {
  g: THREE.Group;
  mats: THREE.MeshStandardMaterial[];
  geos: THREE.BufferGeometry[];
}
/** 훈련용 허수아비 — 나무 기둥 · 받침 · 팔대 · 삼베 몸 · 자루 머리(× 눈) · 밧줄 */
function makeDummy(k: Kit): Dummy {
  const g = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const bt = burlapTex();
  const wood = pbrMat(k.pbr.planks, 0.5, 1.2, { color: 0x9a7a58 });
  const sack = new THREE.MeshStandardMaterial({ map: bt, roughness: 0.95, metalness: 0 });
  const rope = new THREE.MeshStandardMaterial({ color: 0x8a6c44, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.8 });
  const mats = [wood, sack, rope, dark];
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.Mesh => {
    geos.push(geo);
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.rotation.set(rx, ry, rz);
    o.castShadow = o.receiveShadow = true;
    g.add(o);
    return o;
  };
  add(new THREE.BoxGeometry(0.9, 0.09, 0.14), wood, 0, 0.045, 0);
  add(new THREE.BoxGeometry(0.14, 0.09, 0.9), wood, 0, 0.045, 0);
  add(new THREE.CylinderGeometry(0.055, 0.065, 1.55, 12), wood, 0, 0.8, 0);
  add(new THREE.CylinderGeometry(0.04, 0.04, 0.95, 10), wood, 0, 1.22, 0, 0, 0, Math.PI / 2);
  const body = new THREE.LatheGeometry(
    [
      [0.001, 0.72],
      [0.17, 0.74],
      [0.23, 0.86],
      [0.25, 1.02],
      [0.22, 1.18],
      [0.14, 1.3],
      [0.001, 1.32],
    ].map(([x, y]) => new THREE.Vector2(x, y)),
    24,
  );
  add(body, sack, 0, 0, 0);
  for (const y of [0.8, 1.24]) add(new THREE.TorusGeometry(y < 1 ? 0.2 : 0.16, 0.014, 6, 24), rope, 0, y, 0, Math.PI / 2);
  for (const x of [-0.44, 0.44]) add(new THREE.CylinderGeometry(0.07, 0.065, 0.16, 12), sack, x, 1.22, 0, 0, 0, Math.PI / 2);
  add(new THREE.SphereGeometry(0.17, 20, 14).scale(1, 1.1, 0.95), sack, 0, 1.5, 0);
  add(new THREE.TorusGeometry(0.075, 0.014, 6, 18), rope, 0, 1.36, 0, Math.PI / 2);
  for (const s of [-1, 1])
    for (const r of [0.7, -0.7]) add(new THREE.BoxGeometry(0.075, 0.016, 0.012), dark, s * 0.06, 1.53, 0.158, 0, 0, r);
  add(new THREE.BoxGeometry(0.09, 0.012, 0.012), dark, 0, 1.44, 0.16, 0, 0, 0.1);
  return { g, mats, geos };
}

function makeSkills(): Scene3D {
  const BG = 0x050407;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, 14, 30);
  const cam = new THREE.PerspectiveCamera(34, 1.6, 0.5, 60);
  const hud = new Hud();
  const msg = hud.label('던전 짓는 중 …', 0.5, 0.5, 0.5, 0.5, 0.8);
  const tag = hud.label('', 0.03, 0.95, 0, 1, 0.62, '#ffcf4a', '#22180a');
  const dmg = hud.label('', 0.5, 0.5, 0.5, 0, 0.9, 'none', '#ffd25a');
  tag.visible = dmg.visible = false;
  const flashM = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false }));
  flashM.renderOrder = 40;
  hud.scene.add(flashM);
  const hemi = new THREE.HemisphereLight(0x46557a, 0x0e0907, 0.55);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x8ea4d8, 1.1);
  moon.position.set(2.5, 10, 7);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  Object.assign(moon.shadow.camera, { left: -7, right: 7, top: 6, bottom: -6, near: 1, far: 30 });
  moon.shadow.bias = -0.0006;
  moon.shadow.normalBias = 0.03;
  scene.add(moon);
  const tl = [0, 1].map(() => {
    const l = new THREE.PointLight(0xff9c58, 9, 7, 2);
    scene.add(l);
    return l;
  });
  const fx = new THREE.PointLight(0xff8a3a, 0, 9, 1.8);
  fx.position.set(0, -20, 0);
  scene.add(fx);
  const world = new THREE.Group();
  scene.add(world);
  const uScale = { value: 400 };
  const fire = new Parts(1100, true, uScale);
  const smoke = new Parts(260, false, uScale);
  scene.add(fire.points, smoke.points);
  const orb = [glowSprite(0xffffff, 0.3, 1), glowSprite(0xffa040, 0.75, 0.9), glowSprite(0xff4a10, 1.9, 0.45)];
  for (const s of orb) {
    s.visible = false;
    s.renderOrder = 8;
    scene.add(s);
  }
  // 충격파 고리
  const ringMat = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(1, 0.55, 0.2) }, uA: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 uCol; uniform float uA; varying vec2 vUv; void main(){ float r = length(vUv - 0.5) * 2.0; float a = smoothstep(0.62, 0.92, r) * (1.0 - smoothstep(0.92, 1.0, r)) * uA; gl_FragColor = vec4(uCol, a); }',
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 4;
  scene.add(ring);
  // 그을음 · 숯불 데칼
  const decal = (tex: THREE.Texture, add: boolean, color: number): THREE.Mesh => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 2.4),
      new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: !add }),
    );
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 2;
    scene.add(m);
    return m;
  };
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  blank.needsUpdate = true;
  const scorchA = decal(blank, false, 0xffffff);
  const emberA = decal(blank, true, 0xff8a40);
  const scorchB = decal(blank, false, 0xffffff);
  emberA.scale.setScalar(0.75);
  // 회오리 (안 · 밖 원뿔) + 먼지 고리 + 돌 조각
  const uT = { value: 0 };
  const torn = [
    { col: new THREE.Color(0.6, 0.5, 0.4), spd: 1.6, r0: 0.34, r1: 1.15, a: 0.45 },
    { col: new THREE.Color(0.55, 0.78, 1.0), spd: 2.6, r0: 0.18, r1: 0.8, a: 0.5 },
  ].map((o) => {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(o.r1, o.r0, 2.7, 48, 14, true).translate(0, 1.35, 0),
      new THREE.ShaderMaterial({
        vertexShader: TORN_VS,
        fragmentShader: TORN_FS,
        uniforms: { uT, uA: { value: 0 }, uCol: { value: o.col }, uSpd: { value: o.spd }, uNoise: { value: null } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    m.renderOrder = 6;
    m.visible = false;
    scene.add(m);
    return { m, a: o.a };
  });
  const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.045, 0), new THREE.MeshStandardMaterial({ color: 0x9a8a76, roughness: 0.85, emissive: 0x3a3026 }), 34);
  rocks.visible = false;
  rocks.castShadow = true;
  scene.add(rocks);
  const bolt = new Bolt();
  scene.add(bolt.glowM, bolt.coreM);
  const blobK = blob(1.1, 0.6);
  const blobD = blob(1.0, 0.55);
  scene.add(blobK, blobD);

  const KP = V3(-2.0, 0, 0.6);
  const DP = V3(1.95, 0, 0.35);
  let d: Dungeon | null = null;
  let torch: Torches | null = null;
  let dummy: Dummy | null = null;
  let K: Knight | null = null;
  let kit: Kit | null = null;
  let dead = false;
  let texs: THREE.Texture[] = [];
  const job = new Job();
  const warm = new Warm();
  loadKit().then((k) => {
    if (dead) return;
    kit = k;
    const out: { d?: Dungeon } = {};
    job.start(
      (function* (): Gen {
        yield* buildDungeon(k, { map: ROOM, C: 1.3, WH: 2.3, torches: [[3, 1, 0, -1], [5, 1, 0, -1]] }, out);
        d = out.d!;
        world.add(d.group);
        torch = new Torches(d.flames);
        world.add(torch.group);
        (scorchA.material as THREE.MeshBasicMaterial).map = scorchTex(3, [14, 8, 4]);
        yield;
        (emberA.material as THREE.MeshBasicMaterial).map = scorchTex(4, [255, 120, 30]);
        yield;
        (scorchB.material as THREE.MeshBasicMaterial).map = scorchTex(8, [8, 8, 14]);
        yield;
        dummy = makeDummy(k);
        dummy.g.position.copy(DP);
        dummy.g.rotation.y = -Math.PI / 2;
        world.add(dummy.g);
      })(),
    );
  });
  // 상태
  const P: Pose = { t: 0, ph: 0, walk: 0, swing: -1, cast: 0, castKind: 0, guard: 0 };
  let t0 = 0;
  let prevT = -1;
  let only = -1;
  let restart = false;
  let showScorch = true;
  let showFlash = true;
  let tilt = 0;
  let tiltV = 0;
  let hit = 0;
  let lift = 0;
  let spin = 0;
  let flash = 0;
  let boltAge = 9;
  let dmgAge = 9;
  let dmgText = '';
  let dmgCol = '#ffd25a';
  let orbFrom = V3();
  let ringAge = 9;
  let ringK = 1;
  const rnd = rng(77);
  const tip = V3();
  const base = V3();
  const tmp = V3();
  const C = (r: number, g: number, b: number): THREE.Color => new THREE.Color(r, g, b);
  const sph = (k: number): THREE.Vector3 => V3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(k);
  const hitDummy = (push: number, text: string, col: string): void => {
    hit = 1;
    tiltV -= push;
    dmgAge = 0;
    dmgText = text;
    dmgCol = col;
  };
  const NAMES = ['① 불덩이 — 빛 · 불씨 · 그을음', '② 회오리 — 먼지 · 돌 조각 · 띄우기', '③ 번개 — 갈래 · 번쩍 · 불꽃'];
  return {
    scene,
    camera: cam,
    update(t, dt) {
      if (job.busy) job.step();
      if (d && !K && knightReady()) {
        K = makeKnight(world);
        K.root.position.copy(KP);
        K.root.rotation.y = Math.PI / 2 - 0.12;
        texs = sceneTex(scene);
        for (const tw of torn) (tw.m.material as THREE.ShaderMaterial).uniforms.uNoise!.value = NOISE;
        warm.reset();
        t0 = t;
      }
      if (!K || !d || !dummy) return;
      dt = Math.min(dt, 0.05);
      if (restart) {
        restart = false;
        t0 = t;
        prevT = -1;
      }
      const tt = t - t0;
      const T = only >= 0 ? (tt % 3.2) + only * 3.2 : tt % 9.6;
      if (prevT < 0 || T < prevT) {
        // 처음으로 — 남은 효과 정리
        fire.clear();
        smoke.clear();
        prevT = T - 1e-4;
      }
      const ph = Math.floor(T / 3.2);
      const lt = T - ph * 3.2;
      const plt = prevT - ph * 3.2;
      const cross = (a: number): boolean => plt < a && lt >= a;
      tag.set(NAMES[ph]!);
      // 기사 자세
      const castOn = sstep(0.0, 0.4, lt) * (1 - sstep(ph === 0 ? 1.3 : ph === 1 ? 2.6 : 1.6, (ph === 0 ? 1.3 : ph === 1 ? 2.6 : 1.6) + 0.5, lt));
      P.t = t;
      P.cast = castOn;
      P.castKind = ph === 0 ? 0 : ph === 1 ? 2 : 1;
      P.guard = 0.35;
      K.pose(P);
      K.cloth(dt, ph === 1 ? Math.sin(t * 3) * 3 * castOn : Math.sin(t * 0.7) * 0.4);
      K.blade(base, tip);
      blobK.position.set(KP.x, 0.009, KP.z);
      const head = V3(DP.x, 1.45 + lift, DP.z);
      const chest = V3(DP.x, 1.05 + lift, DP.z);
      // ── ① 불덩이 ──
      for (const s of orb) s.visible = false;
      if (ph === 0) {
        if (lt > 0.12 && lt < 0.58) {
          const k = (lt - 0.12) / 0.46;
          for (let i = 0; i < 3; i++) {
            const p = tip.clone().add(sph(0.5 + rnd() * 0.4));
            fire.spawn({ p, v: tip.clone().sub(p).multiplyScalar(1 / 0.28), life: 0.28, s0: 0.05, s1: 0.12, c0: C(1, 0.8, 0.45), c1: C(1, 0.4, 0.1) });
          }
          orb.forEach((s, i) => {
            s.visible = true;
            s.position.copy(tip);
            s.scale.setScalar([0.3, 0.75, 1.9][i]! * k * (0.9 + 0.1 * Math.sin(t * 40)));
          });
        }
        if (cross(0.58)) orbFrom = tip.clone();
        if (lt >= 0.58 && lt < 1.05) {
          const u = (lt - 0.58) / 0.47;
          const p = orbFrom.clone().lerp(chest, u);
          p.y += Math.sin(Math.PI * u) * 0.45;
          orb.forEach((s, i) => {
            s.visible = true;
            s.position.copy(p);
            s.scale.setScalar([0.32, 0.8, 2.0][i]! * (0.92 + 0.12 * Math.sin(t * 50 + i)));
          });
          for (let i = 0; i < 9; i++)
            fire.spawn({ p: p.clone().add(sph(0.09)), v: sph(0.5).add(V3(-1.2, 0.6, 0)), life: 0.3 + rnd() * 0.3, s0: 0.42, s1: 0.06, c0: C(1, 0.86, 0.5), c1: C(0.7, 0.12, 0.02), drag: 2, grav: 1.2 });
          if (rnd() < 0.5) smoke.spawn({ p: p.clone(), v: V3(-0.4, 0.5, 0), life: 1.1, s0: 0.2, s1: 0.7, c0: C(0.16, 0.13, 0.11), c1: C(0.05, 0.05, 0.05), a: 0.45, drag: 1 });
          fx.color.setHex(0xff8a3a);
          fx.position.copy(p);
          fx.intensity = 30;
        }
        if (cross(1.05)) {
          for (let i = 0; i < 110; i++) {
            const v = sph(2 + rnd() * 3.5);
            v.y = Math.abs(v.y) * 0.9 + 0.6;
            fire.spawn({ p: chest.clone().add(sph(0.15)), v, life: 0.45 + rnd() * 0.5, s0: 0.5, s1: 0.08, c0: C(1, 0.9, 0.6), c1: C(0.6, 0.08, 0.02), drag: 3.2, grav: 1.6 });
          }
          for (let i = 0; i < 60; i++) {
            const v = sph(5 + rnd() * 5);
            v.y = Math.abs(v.y) + 1;
            fire.spawn({ p: chest.clone(), v, life: 0.5 + rnd() * 0.6, s0: 0.07, s1: 0.02, c0: C(1, 0.95, 0.75), c1: C(1, 0.4, 0.05), drag: 0.6, grav: -9 });
          }
          for (let i = 0; i < 26; i++) smoke.spawn({ p: chest.clone().add(sph(0.3)), v: sph(0.8).add(V3(0, 0.9, 0)), life: 1.4 + rnd() * 0.9, s0: 0.45, s1: 1.4, c0: C(0.2, 0.16, 0.13), c1: C(0.06, 0.06, 0.06), a: 0.55, drag: 1.4 });
          ringAge = 0;
          ringK = 1;
          ringMat.uniforms.uCol!.value.setRGB(1, 0.55, 0.2);
          ring.position.set(DP.x, 0.02, DP.z);
          scorchA.position.set(DP.x, 0.006, DP.z);
          emberA.position.set(DP.x, 0.007, DP.z);
          hitDummy(5.5, '−248', '#ffb347');
        }
        if (lt >= 1.05) fx.intensity = 90 * Math.exp(-(lt - 1.05) * 5) + 6 * Math.exp(-(lt - 1.05) * 1.5) * flick(t, 3);
        const sc = lt >= 1.05 ? (1 - sstep(2.5, 3.15, lt)) * (showScorch ? 1 : 0) : 0;
        (scorchA.material as THREE.MeshBasicMaterial).opacity = 0.9 * sc;
        (emberA.material as THREE.MeshBasicMaterial).opacity = lt >= 1.05 ? 1.4 * Math.exp(-(lt - 1.05) * 1.6) * (showScorch ? 1 : 0) : 0;
        if (lt > 1.2 && lt < 2.6 && rnd() < 0.35)
          fire.spawn({ p: V3(DP.x + (rnd() - 0.5) * 1.2, 0.05, DP.z + (rnd() - 0.5) * 1.2), v: V3(0, 0.5 + rnd(), 0), life: 0.8, s0: 0.04, s1: 0.01, c0: C(1, 0.6, 0.2), c1: C(0.8, 0.2, 0.05) });
      } else {
        (scorchA.material as THREE.MeshBasicMaterial).opacity = 0;
        (emberA.material as THREE.MeshBasicMaterial).opacity = 0;
      }
      // ── ② 회오리 ──
      const A = ph === 1 ? sstep(0.35, 0.8, lt) * (1 - sstep(2.35, 2.8, lt)) : 0;
      uT.value = t;
      for (const tw of torn) {
        tw.m.visible = A > 0.001;
        tw.m.position.set(DP.x, 0, DP.z);
        tw.m.scale.set(0.5 + 0.5 * A, 0.4 + 0.6 * A, 0.5 + 0.5 * A);
        (tw.m.material as THREE.ShaderMaterial).uniforms.uA!.value = A * tw.a;
      }
      rocks.visible = A > 0.001;
      if (rocks.visible) {
        const ob = new THREE.Object3D();
        for (let i = 0; i < 34; i++) {
          const k = (i * 0.618034) % 1;
          const yy = ((t * (0.35 + k * 0.3) + k) % 1) * 2.4 * A;
          const r = (0.35 + yy * 0.32) * (0.8 + 0.4 * k);
          const a = t * (5 + k * 3) + i * 2.4;
          ob.position.set(DP.x + Math.cos(a) * r, yy + 0.05, DP.z + Math.sin(a) * r);
          ob.rotation.set(a, a * 1.3, k * 6);
          ob.scale.setScalar((0.6 + k) * A);
          ob.updateMatrix();
          rocks.setMatrixAt(i, ob.matrix);
        }
        rocks.instanceMatrix.needsUpdate = true;
        for (let i = 0; i < 3; i++) {
          const a = rnd() * TAU;
          const r = 0.3 + rnd() * 0.6;
          const y = rnd() * 2.2;
          tmp.set(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(4 + rnd() * 2);
          fire.spawn({ p: V3(DP.x + Math.cos(a) * r, y, DP.z + Math.sin(a) * r), v: tmp.clone().add(V3(0, 1.5, 0)), life: 0.35, s0: 0.05, s1: 0.02, c0: C(0.8, 0.95, 1), c1: C(0.3, 0.5, 0.8), a: A });
        }
        if (rnd() < 0.6) {
          const a = rnd() * TAU;
          smoke.spawn({ p: V3(DP.x + Math.cos(a) * 0.9, 0.08, DP.z + Math.sin(a) * 0.9), v: V3(-Math.sin(a) * 2.5, 0.4, Math.cos(a) * 2.5), life: 0.9, s0: 0.3, s1: 0.8, c0: C(0.36, 0.3, 0.24), c1: C(0.2, 0.18, 0.15), a: 0.4 * A, drag: 1.2 });
        }
        fx.color.setHex(0xa8d8ff);
        fx.position.set(DP.x, 1.3, DP.z);
        fx.intensity = 16 * A * (0.85 + 0.15 * Math.sin(t * 20));
      }
      if (ph === 1) {
        if (cross(0.55)) hitDummy(1.5, '−38', '#bfe6ff');
        if (cross(1.3)) hitDummy(1.0, '−41', '#bfe6ff');
        if (cross(2.05)) hitDummy(1.0, '−44', '#bfe6ff');
        if (cross(2.75)) hitDummy(6, '−130', '#bfe6ff');
        lift = 0.32 * A * (1 + 0.25 * Math.sin(t * 6));
        spin += dt * 10 * A;
      } else {
        lift *= 1 - damp(dt, 0.12);
      }
      // ── ③ 번개 ──
      if (ph === 2) {
        if (lt > 0.15 && lt < 0.62 && rnd() < 0.8)
          fire.spawn({ p: tip.clone().add(sph(0.12)), v: sph(2.5), life: 0.18, s0: 0.05, s1: 0.01, c0: C(0.8, 0.9, 1), c1: C(0.3, 0.45, 1) });
        for (const at of [0.62, 0.88, 1.08]) {
          if (!cross(at)) continue;
          const from = V3(DP.x - 0.6 + (rnd() - 0.5) * 1.6, 6.2, DP.z - 2.6 - rnd());
          bolt.build(boltLines(from, head, rnd), cam.position);
          boltAge = 0;
          flash = 1;
          for (let i = 0; i < 45; i++) {
            const v = sph(3 + rnd() * 5);
            v.y = Math.abs(v.y) + 1.5;
            fire.spawn({ p: head.clone(), v, life: 0.35 + rnd() * 0.5, s0: 0.06, s1: 0.015, c0: C(0.9, 0.95, 1), c1: C(0.3, 0.5, 1), drag: 0.5, grav: -9 });
          }
          ringAge = 0;
          ringK = 0.42;
          ringMat.uniforms.uCol!.value.setRGB(0.55, 0.7, 1);
          ring.position.set(DP.x, 0.02, DP.z);
          scorchB.position.set(DP.x, 0.006, DP.z);
          hitDummy(3.2, at < 0.7 ? '−87' : at < 1 ? '−92' : '−105', '#d8e8ff');
        }
        (scorchB.material as THREE.MeshBasicMaterial).opacity = lt >= 0.62 ? 0.85 * (1 - sstep(2.5, 3.15, lt)) * (showScorch ? 1 : 0) : 0;
        if (boltAge < 0.5) {
          fx.color.setHex(0xb8d0ff);
          fx.position.copy(head).y += 0.6;
          fx.intensity = 90 * flash;
        } else if (fx.color.getHex() === 0xb8d0ff) fx.intensity *= 0.8;
      } else (scorchB.material as THREE.MeshBasicMaterial).opacity = 0;
      boltAge += dt;
      bolt.uA.value = boltAge < 0.22 ? (1 - boltAge / 0.22) * (0.7 + 0.3 * Math.sin(boltAge * 120)) : 0;
      bolt.glowM.visible = bolt.coreM.visible = bolt.uA.value > 0.001;
      flash *= 1 - damp(dt, 0.06);
      hemi.intensity = 0.55 + (showFlash ? 1.5 * flash : 0);
      (flashM.material as THREE.MeshBasicMaterial).opacity = showFlash ? 0.18 * flash : 0;
      if (ph !== 1 && ph !== 0 && boltAge > 0.5) fx.intensity *= 1 - damp(dt, 0.2);
      if (ph === 1 && A <= 0.001) fx.intensity *= 1 - damp(dt, 0.1);
      // 충격파
      ringAge += dt;
      const rk = clamp(ringAge / 0.45, 0, 1);
      ring.scale.setScalar(0.2 + 3.0 * ringK * (1 - (1 - rk) * (1 - rk)));
      ringMat.uniforms.uA!.value = ringAge < 0.45 ? (1 - rk) * 1.6 : 0;
      // 허수아비 반응 — 번쩍 · 밀려남 (용수철)
      tiltV += (-70 * tilt - 7 * tiltV) * dt;
      tilt += tiltV * dt;
      hit *= 1 - damp(dt, 0.07);
      dummy.g.position.set(DP.x, lift, DP.z);
      dummy.g.rotation.set(0, -Math.PI / 2 + spin, 0);
      dummy.g.rotateOnWorldAxis(V3(0, 0, 1), tilt * 0.12);
      for (const m of dummy.mats) {
        m.emissive.setRGB(1, 0.95, 0.85);
        m.emissiveIntensity = hit * 1.05;
      }
      blobD.position.set(DP.x, 0.009, DP.z);
      blobD.scale.setScalar(1 - lift * 0.8);
      dmgAge += dt;
      prevT = T;
      // 빛 · 횃불
      torch!.update(t);
      d.flames.slice(0, 2).forEach((f, i) => {
        tl[i]!.position.copy(f).y += 0.12;
        tl[i]!.intensity = 9 * flick(t, i * 2.1);
      });
      fire.update(dt);
      smoke.update(dt);
      cam.position.set(0.2, 4.7, 6.6);
      cam.lookAt(-0.05, 0.85, 0.3);
      // 피해 숫자 (머리 위로 떠오름)
      dmg.visible = dmgAge < 0.9;
      if (dmg.visible) {
        const p = head.clone();
        p.y += 0.3 + dmgAge * 0.7;
        p.project(cam);
        dmg.fx = p.x * 0.5 + 0.5;
        dmg.fy = p.y * 0.5 + 0.5;
        dmg.set(dmgText, 'none', dmgCol);
        dmg.size = 0.9 + 0.5 * Math.exp(-dmgAge * 10);
        dmg.spr.material.opacity = 1 - sstep(0.55, 0.9, dmgAge);
      }
    },
    render(r, w, h) {
      if (!d || !dummy) return waiting(r, w, h, hud, msg, kit ? '던전 짓는 중 …' : '실사 재질 받는 중 …');
      if (!K) return waiting(r, w, h, hud, msg, `갑옷 기사 빚는 중 … ${pct()}`);
      if (!pump(r, texs)) return waiting(r, w, h, hud, msg, 'GPU 에 텍스처 올리는 중 …');
      if (kit?.hdr) {
        const env = envFor(r, kit.hdr);
        if (!env) return waiting(r, w, h, hud, msg, '환경 빛 굽는 중 …');
        scene.environment = env;
        scene.environmentIntensity = 0.12;
      }
      if (!warm.ready(r, (rr) => withShadows(rr, () => rr.compileAsync(scene, cam)))) return waiting(r, w, h, hud, msg, '셰이더 굽는 중 …');
      msg.visible = false;
      tag.visible = true;
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
      uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
      torch!.uScale.value = uScale.value;
      r.setClearColor(BG, 1);
      withShadows(r, () => r.render(scene, cam));
      hud.draw(r, w, h, (ww, hh) => {
        flashM.scale.set(ww, hh, 1);
        flashM.position.set(ww / 2, hh / 2, -1);
      });
    },
    controls: [
      {
        type: 'button',
        label: '기술 고르기 (차례로 → 불덩이 → 회오리 → 번개)',
        on: () => {
          only = only >= 2 ? -1 : only + 1;
          restart = true;
        },
      },
      { type: 'button', label: '다시 쏘기', on: () => (restart = true) },
      { type: 'toggle', label: '바닥 그을음 데칼', value: true, on: (v) => (showScorch = v) },
      { type: 'toggle', label: '번개 번쩍임', value: true, on: (v) => (showFlash = v) },
    ] as Control[],
    dispose() {
      dead = true;
      K?.dispose();
      torch?.dispose();
      if (d) for (const g of d.geos) g.dispose();
      if (dummy) {
        for (const g of dummy.geos) g.dispose();
        for (const m of dummy.mats) {
          m.map?.dispose();
          m.dispose();
        }
        dummy.g.removeFromParent();
      }
      disposeTree(world, new Set(d?.geos ?? []));
      fire.dispose();
      smoke.dispose();
      bolt.dispose();
      for (const s of orb) s.material.dispose();
      blank.dispose();
      for (const m of [ring, scorchA, emberA, scorchB, blobK, blobD, rocks, flashM, ...torn.map((x) => x.m)]) {
        m.geometry.dispose();
        const mm = m.material as THREE.Material & { map?: THREE.Texture | null };
        mm.map?.dispose();
        mm.dispose();
      }
      hud.dispose();
    },
  };
}

/* ═════════════ i491 쿼터뷰 화면 정보 — 구슬 · 기술 칸 · 미니맵 ═════════════ */

const ORB_FS = /* glsl */ `
uniform float uLevel, uT, uSlosh, uFlash;
uniform vec3 uDeep, uHi;
uniform sampler2D uNoise;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float R = 0.84;
  // 출렁이는 수면 (사인 셋 + 줄어들 때 크게 출렁)
  float wave = sin(p.x * 5.0 + uT * 2.6) * 0.03 + sin(p.x * 9.0 - uT * 3.7) * 0.018 + uSlosh * sin(p.x * 3.2 + uT * 7.5) * 0.09;
  float lv = (uLevel * 2.0 - 1.0) * R + wave * (1.0 - abs(uLevel * 2.0 - 1.0) * 0.6);
  float inL = smoothstep(lv + 0.014, lv - 0.014, p.y);
  vec2 q = p * 0.55 + vec2(uT * 0.04, -uT * 0.07);
  float n = texture2D(uNoise, q).r * 0.6 + texture2D(uNoise, q * 2.3 + vec2(-uT * 0.09, uT * 0.05)).a * 0.4;
  vec3 liq = mix(uDeep * 0.55, uHi, clamp(smoothstep(-R, lv + 0.2, p.y) * 0.55 + (n - 0.35) * 0.9, 0.0, 1.0));
  float bub = texture2D(uNoise, vec2(p.x * 1.3 + 0.2, p.y * 1.3 - uT * 0.22)).b;
  liq += smoothstep(0.7, 0.95, bub) * 0.35 * uHi * step(p.y, lv - 0.03);
  float surf = exp(-pow((p.y - lv) / 0.022, 2.0));
  liq += surf * (uHi * 0.9 + 0.15) * inL;
  liq += uFlash * uHi * 0.6;
  vec3 empty = vec3(0.025, 0.02, 0.025) + uDeep * 0.06;
  vec3 col = mix(empty, liq, inL);
  float inner = smoothstep(R, R * 0.35, r);
  col *= mix(0.35, 1.0, inner);
  // 유리: 왼쪽 위 반짝 · 가장자리 반사
  float spec = smoothstep(0.32, 0.0, length((p - vec2(-0.3, 0.42)) * vec2(1.0, 1.7)));
  col += spec * 0.5;
  col += smoothstep(R * 0.8, R, r) * smoothstep(-0.2, 0.9, p.y) * 0.1;
  // 놋쇠 테 (빗각 음영 · 눈금 새김)
  float ring = smoothstep(R, R + 0.02, r);
  float a = atan(p.y, p.x);
  float tr = (r - R) / (1.0 - R);
  vec2 dn = normalize(p + 1e-5);
  float bev = dot(dn, normalize(vec2(-0.55, 0.83))) * (1.0 - 2.0 * tr);
  vec3 brass = vec3(0.62, 0.45, 0.2) * (0.75 + 0.55 * bev) + vec3(0.35, 0.3, 0.2) * pow(max(0.0, bev), 6.0);
  brass *= 0.82 + 0.18 * step(0.5, fract(a * 9.549));
  brass *= smoothstep(1.0, 0.94, r) * 0.6 + 0.4;
  col = mix(col, brass, ring);
  float alpha = smoothstep(1.0, 0.975, r);
  gl_FragColor = vec4(col, alpha);
}`;
const CD_FS = /* glsl */ `
uniform sampler2D uMap; uniform float uCd; uniform float uFlash; uniform float uLow;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uMap, vUv);
  vec2 p = vUv * 2.0 - 1.0;
  float a = atan(p.x, p.y);            // 위에서 시계 방향
  float f = (a < 0.0 ? a + 6.2831853 : a) / 6.2831853;
  float cov = step(f, uCd) * step(0.001, uCd);
  float inside = step(max(abs(p.x), abs(p.y)), 0.8);
  c.rgb *= 1.0 - cov * inside * 0.68;
  float edge = (1.0 - smoothstep(0.0, 0.02, abs(f - uCd))) * step(0.001, uCd) * inside;
  c.rgb += edge * vec3(1.0, 0.85, 0.5);
  c.rgb *= 1.0 - uLow * 0.45 * inside;
  c.rgb += uFlash * vec3(1.0, 0.9, 0.6) * (0.35 + 0.65 * (1.0 - smoothstep(0.6, 1.0, max(abs(p.x), abs(p.y)))));
  gl_FragColor = c;
}`;
const UV_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
/** 기술 그림 (128² · 그린 그림 — 숫자 단축키만 글자) */
function skillIcon(kind: number, key: string): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const bg = g.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S * 0.7);
  const cols = [
    ['#5a1a08', '#120402'],
    ['#123a4a', '#03090d'],
    ['#1a2460', '#05061a'],
    ['#4a3a14', '#0d0a04'],
    ['#4a0c10', '#0e0203'],
  ][kind]!;
  bg.addColorStop(0, cols[0]!);
  bg.addColorStop(1, cols[1]!);
  g.fillStyle = bg;
  g.fillRect(0, 0, S, S);
  g.save();
  g.translate(S / 2, S / 2);
  g.shadowBlur = 14;
  if (kind === 0) {
    // 불덩이: 소용돌이 불꽃
    g.shadowColor = '#ff8a20';
    for (let i = 0; i < 3; i++) {
      const gr = g.createRadialGradient(0, 4, 2, 0, 4, 40 - i * 10);
      gr.addColorStop(0, '#fff6c0');
      gr.addColorStop(0.4, i === 0 ? '#ffb030' : '#ff7a10');
      gr.addColorStop(1, 'rgba(200,40,0,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(0, -44 + i * 8);
      g.bezierCurveTo(30 - i * 6, -10, 34 - i * 8, 34, 0, 36);
      g.bezierCurveTo(-34 + i * 8, 34, -30 + i * 6, -6, -6, -18 + i * 6);
      g.bezierCurveTo(-2, -24, -2, -34, 0, -44 + i * 8);
      g.fill();
    }
  } else if (kind === 1) {
    // 회오리: 겹친 나선
    g.shadowColor = '#8ad8ff';
    g.lineCap = 'round';
    for (let k = 0; k < 6; k++) {
      const y = -34 + k * 13;
      const rx = 34 - k * 5;
      g.strokeStyle = `rgba(${170 + k * 12},${225},255,${0.9 - k * 0.08})`;
      g.lineWidth = 7 - k * 0.6;
      g.beginPath();
      g.ellipse((k % 2 ? 4 : -4) * (k / 5), y, rx, 6, 0, Math.PI * 0.1, Math.PI * 1.75);
      g.stroke();
    }
  } else if (kind === 2) {
    // 번개
    g.shadowColor = '#9ab8ff';
    g.fillStyle = '#eef4ff';
    g.beginPath();
    g.moveTo(10, -48);
    g.lineTo(-22, 4);
    g.lineTo(-2, 4);
    g.lineTo(-14, 48);
    g.lineTo(24, -10);
    g.lineTo(4, -10);
    g.lineTo(20, -48);
    g.closePath();
    g.fill();
    g.strokeStyle = '#7aa0ff';
    g.lineWidth = 3;
    g.stroke();
  } else if (kind === 3) {
    // 방패
    g.shadowColor = '#ffd070';
    const gr = g.createLinearGradient(-30, -40, 30, 40);
    gr.addColorStop(0, '#ffe7a0');
    gr.addColorStop(1, '#8a5a18');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(-32, -36);
    g.quadraticCurveTo(0, -42, 32, -36);
    g.bezierCurveTo(34, 0, 20, 26, 0, 44);
    g.bezierCurveTo(-20, 26, -34, 0, -32, -36);
    g.fill();
    g.fillStyle = '#2a3a80';
    g.beginPath();
    g.moveTo(-22, -27);
    g.quadraticCurveTo(0, -31, 22, -27);
    g.bezierCurveTo(23, 0, 13, 18, 0, 32);
    g.bezierCurveTo(-13, 18, -23, 0, -22, -27);
    g.fill();
  } else {
    // 물약 병
    g.shadowColor = '#ff3040';
    g.fillStyle = '#c8a070';
    g.fillRect(-7, -44, 14, 12);
    const gr = g.createRadialGradient(-8, 6, 2, 0, 12, 30);
    gr.addColorStop(0, '#ff8890');
    gr.addColorStop(0.5, '#d01828');
    gr.addColorStop(1, '#4a0408');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(-8, -32);
    g.lineTo(8, -32);
    g.lineTo(8, -16);
    g.arc(0, 12, 28, -Math.PI / 2 + 0.3, Math.PI * 1.5 - 0.3);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.beginPath();
    g.ellipse(-12, 2, 5, 9, 0.4, 0, TAU);
    g.fill();
  }
  g.restore();
  // 금 테 + 단축키
  g.lineWidth = 8;
  const fr = g.createLinearGradient(0, 0, S, S);
  fr.addColorStop(0, '#f2d38a');
  fr.addColorStop(0.5, '#8a6424');
  fr.addColorStop(1, '#d8b060');
  g.strokeStyle = fr;
  g.strokeRect(4, 4, S - 8, S - 8);
  g.strokeStyle = 'rgba(0,0,0,0.7)';
  g.lineWidth = 2;
  g.strokeRect(9, 9, S - 18, S - 18);
  g.font = `800 26px ${FONT}`;
  g.fillStyle = '#fff2d0';
  g.strokeStyle = 'rgba(0,0,0,0.9)';
  g.lineWidth = 5;
  g.strokeText(key, 14, 34);
  g.fillText(key, 14, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** 아래 돌 판 (새긴 금줄 · 리벳 · 구슬 받침) */
function barTexture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#3a332c');
  gr.addColorStop(0.5, '#211d19');
  gr.addColorStop(1, '#100e0c');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(0, H);
  g.lineTo(0, 30);
  g.quadraticCurveTo(40, 8, 120, 8);
  g.lineTo(W - 120, 8);
  g.quadraticCurveTo(W - 40, 8, W, 30);
  g.lineTo(W, H);
  g.closePath();
  g.fill();
  const rnd = rng(21);
  for (let i = 0; i < 1600; i++) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? '255,240,220' : '0,0,0'},${rnd() * 0.06})`;
    g.fillRect(rnd() * W, 8 + rnd() * (H - 8), 2 + rnd() * 5, 1 + rnd() * 3);
  }
  const gold = g.createLinearGradient(0, 0, 0, 20);
  gold.addColorStop(0, '#f4d88c');
  gold.addColorStop(1, '#7a5418');
  g.strokeStyle = gold;
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(0, 32);
  g.quadraticCurveTo(40, 10, 120, 10);
  g.lineTo(W - 120, 10);
  g.quadraticCurveTo(W - 40, 10, W, 32);
  g.stroke();
  g.strokeStyle = 'rgba(200,160,80,0.35)';
  g.lineWidth = 2;
  g.strokeRect(14, 24, W - 28, H - 34);
  for (let x = 30; x < W; x += 60) {
    const rg = g.createRadialGradient(x - 1, 21, 0, x, 22, 5);
    rg.addColorStop(0, '#ffe6a8');
    rg.addColorStop(1, '#5a3a10');
    g.fillStyle = rg;
    g.beginPath();
    g.arc(x, 22, 4, 0, TAU);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeHudDemo(): Scene3D {
  const st = makeStage({ speed: 1.35 });
  const hud = st.hud;
  const HS = hud.scene;
  const tex: THREE.Texture[] = [];
  const mats: THREE.Material[] = [];
  const geoQ = new THREE.PlaneGeometry(1, 1);
  const quad = (m: THREE.Material, order: number): THREE.Mesh => {
    const q = new THREE.Mesh(geoQ, m);
    q.renderOrder = order;
    q.visible = false;
    HS.add(q);
    mats.push(m);
    return q;
  };
  const basic = (map: THREE.Texture | null, o: THREE.MeshBasicMaterialParameters = {}): THREE.MeshBasicMaterial =>
    new THREE.MeshBasicMaterial({ map, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, ...o });
  // 구슬 둘
  const orbU = (deep: number, hi: number): Record<string, THREE.IUniform> => ({
    uLevel: { value: 1 },
    uT: { value: 0 },
    uSlosh: { value: 0 },
    uFlash: { value: 0 },
    uDeep: { value: new THREE.Color(deep) },
    uHi: { value: new THREE.Color(hi) },
    uNoise: { value: null },
  });
  const orbMat = (u: Record<string, THREE.IUniform>): THREE.ShaderMaterial =>
    new THREE.ShaderMaterial({ uniforms: u, vertexShader: UV_VS, fragmentShader: ORB_FS, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  const uHp = orbU(0x6a0408, 0xff3a2a);
  const uMp = orbU(0x061458, 0x3a7aff);
  const orbH = quad(orbMat(uHp), 22);
  const orbM = quad(orbMat(uMp), 22);
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  blank.needsUpdate = true;
  tex.push(blank);
  const bar = quad(basic(blank), 20);
  let lazyI = 0;
  const backs = [0, 1].map(() => quad(basic(glow(), { color: 0x000000, opacity: 0.85 }), 19));
  // 기술 칸 다섯 (물약 · 1 · 2 · 3 · 4)
  const KINDS = [4, 0, 1, 2, 3];
  const KEYS = ['Q', '1', '2', '3', '4'];
  const CD = [6, 1.6, 4.5, 6.5, 3.2];
  const COST = [0, 0.09, 0.13, 0.17, 0.07];
  const slots = KINDS.map(() => {
    const u = { uMap: { value: blank as THREE.Texture }, uCd: { value: 0 }, uFlash: { value: 0 }, uLow: { value: 0 } };
    const m = quad(new THREE.ShaderMaterial({ uniforms: u, vertexShader: UV_VS, fragmentShader: CD_FS, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }), 24);
    const lab = hud.label('', 0, 0, 0.5, 0.5, 0.5, 'none', '#ffffff');
    lab.visible = false;
    return { m, u, cd: 0, lab, bump: 0 };
  });
  const xpBack = quad(basic(null, { color: 0x0a0806, opacity: 0.85 }), 21);
  const xpFill = quad(basic(null, { color: 0xd8a640 }), 22);
  // 미니맵 (가 본 곳만) + 주인공 화살표
  const MC = 256;
  const mapCv = document.createElement('canvas');
  mapCv.width = mapCv.height = MC;
  const mapT = new THREE.CanvasTexture(mapCv);
  mapT.colorSpace = THREE.SRGBColorSpace;
  tex.push(mapT);
  const mini = quad(basic(mapT), 25);
  const arrowG = new THREE.ShapeGeometry(
    (() => {
      const s = new THREE.Shape();
      s.moveTo(0, 0.6);
      s.lineTo(0.42, -0.45);
      s.lineTo(0, -0.22);
      s.lineTo(-0.42, -0.45);
      s.closePath();
      return s;
    })(),
  );
  const arrowM = basic(null, { color: 0xfff0b0 });
  mats.push(arrowM);
  const arrow = new THREE.Mesh(arrowG, arrowM);
  arrow.renderOrder = 27;
  arrow.visible = false;
  HS.add(arrow);
  const pulse = quad(basic(glow(), { color: 0xffe08a, blending: THREE.AdditiveBlending, opacity: 0.8 }), 26);
  const hpLab = hud.label('', 0, 0, 0.5, 0.5, 0.48, 'none', '#ffe0d8');
  const mpLab = hud.label('', 0, 0, 0.5, 0.5, 0.48, 'none', '#d8e4ff');
  const tag = hud.label('미니맵 · 체력 구슬 · 마나 구슬 · 기술 칸', 0.03, 0.95, 0, 1, 0.56, '#ffcf4a', '#22180a');
  hpLab.visible = mpLab.visible = tag.visible = false;
  let seen: Uint8Array | null = null;
  let mapDirty = true;
  let loops = 0;
  let lastS = 0;
  // 상태
  let hp = 0.86;
  let mp = 0.9;
  let hpShow = hp;
  let mpShow = mp;
  let slH = 0;
  let slM = 0;
  let xp = 0.35;
  let nextHit = 2.2;
  let nextCast = 1.2;
  let castI = 1;
  let flashH = 0;
  let showMap = true;
  let showOrbs = true;
  let sim = true;
  let fillTo = -1;
  const drawMap = (): void => {
    const d = st.d!;
    const g = mapCv.getContext('2d')!;
    g.clearRect(0, 0, MC, MC);
    g.fillStyle = 'rgba(8,7,10,0.72)';
    g.beginPath();
    g.roundRect(4, 4, MC - 8, MC - 8, 18);
    g.fill();
    const cs = (MC - 40) / Math.max(d.W, d.H);
    const ox = (MC - cs * d.W) / 2;
    const oy = (MC - cs * d.H) / 2;
    const S = seen!;
    for (let j = 0; j < d.H; j++)
      for (let i = 0; i < d.W; i++) {
        if (!S[j * d.W + i] || d.wall(i, j)) continue;
        g.fillStyle = 'rgba(196,164,116,0.28)';
        g.fillRect(ox + i * cs, oy + j * cs, cs + 0.5, cs + 0.5);
      }
    g.strokeStyle = '#d8b878';
    g.lineWidth = Math.max(2, cs * 0.16);
    g.lineCap = 'round';
    g.beginPath();
    for (let j = 0; j < d.H; j++)
      for (let i = 0; i < d.W; i++) {
        if (!S[j * d.W + i] || d.wall(i, j)) continue;
        const x = ox + i * cs;
        const y = oy + j * cs;
        if (d.wall(i, j - 1)) (g.moveTo(x, y), g.lineTo(x + cs, y));
        if (d.wall(i, j + 1)) (g.moveTo(x, y + cs), g.lineTo(x + cs, y + cs));
        if (d.wall(i - 1, j)) (g.moveTo(x, y), g.lineTo(x, y + cs));
        if (d.wall(i + 1, j)) (g.moveTo(x + cs, y), g.lineTo(x + cs, y + cs));
      }
    g.stroke();
    for (let j = 0; j < d.H; j++)
      for (let i = 0; i < d.W; i++)
        if (S[j * d.W + i] && MAZE[j]![i] === 'o') {
          g.fillStyle = '#b89868';
          g.beginPath();
          g.arc(ox + (i + 0.5) * cs, oy + (j + 0.5) * cs, cs * 0.2, 0, TAU);
          g.fill();
        }
    for (const [i, j] of MAZE_TORCH.map(([a, b]) => [a, b] as const))
      if (S[j * d.W + i]) {
        g.fillStyle = '#ff9a3a';
        g.shadowColor = '#ff7a20';
        g.shadowBlur = 8;
        g.beginPath();
        g.arc(ox + (i + 0.5) * cs, oy + (j + 0.5) * cs, cs * 0.14, 0, TAU);
        g.fill();
        g.shadowBlur = 0;
      }
    // 금 테
    g.strokeStyle = '#c9a052';
    g.lineWidth = 5;
    g.beginPath();
    g.roundRect(5, 5, MC - 10, MC - 10, 17);
    g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.lineWidth = 2;
    g.beginPath();
    g.roundRect(10, 10, MC - 20, MC - 20, 13);
    g.stroke();
    mapT.needsUpdate = true;
  };
  return {
    scene: st.scene,
    camera: st.cam,
    update(t, dt) {
      st.step(t, dt, true);
      const d = st.d;
      if (!d || !st.K) return;
      dt = Math.min(dt, 0.05);
      uHp.uNoise!.value = uMp.uNoise!.value = NOISE;
      // 그림은 프레임마다 하나씩 (만들기를 가볍게)
      if (lazyI < 6) {
        if (lazyI === 0) {
          const bt = barTexture();
          tex.push(bt);
          (bar.material as THREE.MeshBasicMaterial).map = bt;
        } else {
          const it = skillIcon(KINDS[lazyI - 1]!, KEYS[lazyI - 1]!);
          tex.push(it);
          slots[lazyI - 1]!.u.uMap.value = it;
        }
        lazyI++;
      }
      // 가 본 곳 기록 (반지름 2.2칸)
      if (!seen) seen = new Uint8Array(d.W * d.H);
      if (st.s < lastS) {
        loops++;
        if (loops % 1 === 0) {
          seen.fill(0);
          mapDirty = true;
        }
      }
      lastS = st.s;
      const ci = Math.round(st.hero.x / d.C + (d.W - 1) / 2);
      const cj = Math.round(st.hero.z / d.C + (d.H - 1) / 2);
      for (let j = cj - 3; j <= cj + 3; j++)
        for (let i = ci - 3; i <= ci + 3; i++) {
          if (i < 0 || j < 0 || i >= d.W || j >= d.H) continue;
          if (Math.hypot(i - ci, j - cj) > 1.9 || seen[j * d.W + i]) continue;
          seen[j * d.W + i] = 1;
          mapDirty = true;
        }
      if (mapDirty) {
        drawMap();
        mapDirty = false;
      }
      // 싸움 흉내: 맞으면 체력 ↓ (출렁), 기술 쓰면 마나 ↓ + 쿨다운
      if (sim) {
        nextHit -= dt;
        if (nextHit <= 0) {
          hp = Math.max(0.04, hp - (0.11 + Math.random() * 0.12));
          slH = 1;
          flashH = 1;
          nextHit = 1.6 + Math.random() * 1.8;
        }
        nextCast -= dt;
        if (nextCast <= 0) {
          const s = slots[castI]!;
          if (s.cd <= 0 && mp >= COST[castI]!) {
            mp -= COST[castI]!;
            s.cd = CD[castI]!;
            s.bump = 1;
            s.u.uFlash.value = 1;
            slM = 0.8;
            st.heroLight.color.setHex([0xffd2a0, 0xff8a40, 0x9adfff, 0x9ab4ff, 0xffd870][castI]!);
          }
          castI = (castI % 4) + 1;
          nextCast = 0.9 + Math.random() * 0.8;
        }
        if (hp < 0.32 && slots[0]!.cd <= 0) {
          fillTo = Math.min(1, hp + 0.55);
          slots[0]!.cd = CD[0]!;
          slots[0]!.bump = 1;
          slots[0]!.u.uFlash.value = 1;
        }
        if (fillTo > 0) {
          hp = Math.min(fillTo, hp + dt * 0.5);
          if (hp >= fillTo) fillTo = -1;
        }
        hp = Math.min(1, hp + dt * 0.02);
        mp = Math.min(1, mp + dt * 0.085);
        xp += dt * 0.025;
        if (xp > 1) xp = 0;
      }
      st.heroLight.color.lerp(new THREE.Color(0xffd2a0), damp(dt, 0.5));
      hpShow += (hp - hpShow) * damp(dt, 0.18);
      mpShow += (mp - mpShow) * damp(dt, 0.18);
      slH *= 1 - damp(dt, 0.9);
      slM *= 1 - damp(dt, 0.9);
      flashH *= 1 - damp(dt, 0.12);
      uHp.uLevel!.value = hpShow;
      uMp.uLevel!.value = mpShow;
      uHp.uSlosh!.value = slH;
      uMp.uSlosh!.value = slM;
      uHp.uFlash!.value = flashH * 0.5;
      uHp.uT!.value = uMp.uT!.value = t;
      slots.forEach((s, i) => {
        s.cd = Math.max(0, s.cd - dt);
        s.u.uCd.value = s.cd / CD[i]!;
        s.u.uFlash.value *= 1 - damp(dt, 0.1);
        s.u.uLow.value = mp < COST[i]! ? 1 : 0;
        s.bump *= 1 - damp(dt, 0.08);
      });
      hpLab.set(`${Math.round(hp * 240)} / 240`);
      mpLab.set(`${Math.round(mp * 180)} / 180`);
    },
    render(r, w, h) {
      if (!st.ready(r, w, h)) return;
      st.draw(r, 0, 0, w, h, 2, true, 0.2);
      r.setViewport(0, 0, w, h);
      tag.visible = true;
      hud.draw(r, w, h, (W, H) => {
        // 배치 — 아래 양쪽 구슬, 그 사이 돌 판 · 기술 칸, 오른쪽 위 미니맵
        const D = clamp(Math.min(H * 0.3, W * 0.17), 46, 230);
        const pad = D * 0.12;
        const yO = D * 0.5 + pad * 0.6;
        const xL = D * 0.5 + pad;
        const xR = W - D * 0.5 - pad;
        for (const [o, x] of [[orbH, xL], [orbM, xR]] as const) {
          o.visible = showOrbs;
          o.scale.set(D, D, 1);
          o.position.set(x, yO, 0);
        }
        backs.forEach((b, i) => {
          b.visible = showOrbs;
          b.scale.set(D * 1.5, D * 1.5, 1);
          b.position.set(i ? xR : xL, yO, 0);
        });
        const bw = xR - xL;
        const bh = D * 0.48;
        bar.visible = showOrbs;
        bar.scale.set(bw, bh, 1);
        bar.position.set(W / 2, bh / 2, 0);
        const ss = Math.min(bh * 0.84, (bw * 0.78) / 5.8);
        slots.forEach((s, i) => {
          s.m.visible = showOrbs;
          const k = ss * (1 + 0.12 * s.bump);
          s.m.scale.set(k, k, 1);
          const x = W / 2 + (i - 2) * ss * 1.12 + (i === 0 ? -ss * 0.25 : 0);
          const y = bh * 0.5;
          s.m.position.set(x, y, 0);
          s.lab.visible = showOrbs && s.cd > 0.05;
          s.lab.set(s.cd >= 1 ? String(Math.ceil(s.cd)) : s.cd.toFixed(1));
          s.lab.fx = x / W;
          s.lab.fy = y / H;
        });
        xpBack.visible = xpFill.visible = showOrbs;
        xpBack.scale.set(bw * 0.86, Math.max(3, bh * 0.08), 1);
        xpBack.position.set(W / 2, bh + Math.max(3, bh * 0.08), 0);
        xpFill.scale.set(bw * 0.86 * xp, Math.max(2, bh * 0.05), 1);
        xpFill.position.set(W / 2 - (bw * 0.86 * (1 - xp)) / 2, bh + Math.max(3, bh * 0.08), 0);
        hpLab.visible = mpLab.visible = showOrbs && H > 220;
        hpLab.fx = xL / W;
        mpLab.fx = xR / W;
        hpLab.fy = mpLab.fy = (yO + D * 0.62) / H;
        // 미니맵
        const M = clamp(Math.min(H * 0.38, W * 0.26), 60, 300);
        const mx0 = W - M / 2 - pad * 0.5;
        const my0 = H - M / 2 - pad * 0.5;
        mini.visible = showMap;
        mini.scale.set(M, M, 1);
        mini.position.set(mx0, my0, 0);
        const d = st.d!;
        const cs = (M * (MC - 40)) / MC / Math.max(d.W, d.H);
        const ax = mx0 + (st.hero.x / d.C) * cs;
        const ay = my0 - (st.hero.z / d.C) * cs;
        arrow.visible = showMap;
        arrow.position.set(ax, ay, 0);
        arrow.rotation.z = Math.PI + st.heroDir;
        arrow.scale.setScalar(Math.max(7, cs * 0.75));
        pulse.visible = showMap;
        const pp = ((performance.now() / 1000) % 1.2) / 1.2;
        pulse.scale.setScalar(cs * (1 + pp * 2.2));
        pulse.position.set(ax, ay, 0);
        (pulse.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - pp);
      });
    },
    controls: [
      { type: 'toggle', label: '체력 · 마나 구슬 + 기술 칸', value: true, on: (v) => (showOrbs = v) },
      { type: 'toggle', label: '미니맵 (가 본 곳만)', value: true, on: (v) => (showMap = v) },
      { type: 'toggle', label: '싸움 흉내 (맞기 · 기술 쓰기)', value: true, on: (v) => (sim = v) },
      {
        type: 'button',
        label: '세게 맞기 (체력 −40%)',
        on: () => {
          hp = Math.max(0.04, hp - 0.4);
          slH = 1.4;
          flashH = 1;
        },
      },
    ] as Control[],
    dispose() {
      st.dispose();
      for (const m of mats) m.dispose();
      for (const t of tex) t.dispose();
      geoQ.dispose();
      arrowG.dispose();
    },
  };
}

export const DEMOS: DemoMap = {
  i491: { kind: '3d', caption: '쿼터뷰 화면 정보 — 출렁이는 체력 · 마나 구슬, 쿨다운이 도는 기술 칸, 가 본 곳만 그려지는 미니맵', make: makeHudDemo },
  i490: { kind: '3d', caption: '던전 바닥 위 불덩이 · 회오리 · 번개 — 빛 · 입자 · 그을음 데칼, 맞은 허수아비가 번쩍이며 밀려남', make: makeSkills },
  i488: { kind: '3d', caption: '쿼터뷰 던전 — 카메라와 기사 사이를 가리는 벽 · 기둥만 기사 둘레를 점무늬로 비우고, 벽 너머엔 윤곽선', make: makeOccluder },
  i489: { kind: '3d', caption: '코드만으로 빚은 갑옷 기사 — 점토 몸에 투구 · 어깨 · 흉갑 · 칼 · 방패를 뼈에 붙이고 망토는 천', make: makeKnightShow },
};

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Control, DemoMap, Scene3D } from './types';

/**
 * i492 작은 던전 체험판 (모두 합치기) — 디아블로풍 한 판.
 * 방 셋 · 복도 · 문, 실사 돌바닥 · 벽돌(Poly Haven CC0), 횃불 · 영웅 등불(그림자는 이것 하나) · 안개,
 * 누른 곳으로 걷기(격자 A* + 줄 당기기), 괴물 5(순찰 → 발견 → 추격 → 공격), 휘두르기 · 히트스톱 · 번쩍 · 넉백 · 숫자,
 * 항아리 · 나무 상자 부수기(조각 · 금화), 보물 상자 = 수학 자물쇠(보기 셋), 가 본 곳만 밝아지는 시야 안개, 미니맵 · 체력 · 마나 구슬.
 * 카드 = 자동 플레이 반복, 크게 보기 = 직접 플레이 (화면 캔버스에 포인터 · 키보드 1~3 기술).
 *
 * 속도: make() 는 장면 틀만 (수 ms), 던전 · 캐릭터는 프레임당 3ms 나눠 짓기 → 텍스처 3ms 씩 올리기 → compileAsync.
 * 프레임: 괴물 생각은 몇 번에 한 번, 길찾기는 작은 격자(30×24) A* — 1ms 안쪽.
 */

type R = THREE.WebGLRenderer;
const FONT = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const damp = (a: number, b: number, rate: number, dt: number): number => lerp(a, b, 1 - Math.exp(-rate * dt));

/* ───────────── 나눠 만들기 (프레임당 3ms) ───────────── */

type Gen = Generator<void, void, void>;
const SEG: number[] = [];
if (import.meta.env.DEV) (globalThis as Record<string, unknown>).__seg = SEG;
class Job {
  private it: Gen | null = null;
  start(g: Gen): void {
    this.it = g;
  }
  get busy(): boolean {
    return this.it !== null;
  }
  step(budget = 3): void {
    if (!this.it) return;
    const end = performance.now() + budget;
    for (;;) {
      const a = performance.now();
      const dn = this.it.next().done;
      const seg = performance.now() - a;
      if (SEG.length < 200) SEG.push(seg);
      if (dn) {
        this.it = null;
        break;
      }
      // 다음 조각도 이만큼 걸린다고 보고 — 넘치면 다음 프레임에
      if (performance.now() + seg > end) break;
    }
  }
}
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
const flick = (t: number, ph: number): number => 0.84 + 0.08 * Math.sin(t * 11 + ph) + 0.05 * Math.sin(t * 23.7 + ph * 1.7) + 0.03 * Math.sin(t * 5.3 + ph * 0.3);

/* ───────────── 무료 실사 재질 (한 번만 받아 모두 같이) ───────────── */

type SetId = 'rock' | 'brick' | 'planks';
type Kind = 'diff' | 'nor' | 'arm';
const SETS: SetId[] = ['rock', 'brick', 'planks'];
const SRC: Record<SetId, Record<Kind, string>> = {
  rock: {
    diff: new URL('../assets/polyhaven/rock_tile_floor_diff_1k.jpg', import.meta.url).href,
    nor: new URL('../assets/polyhaven/rock_tile_floor_nor_gl_1k.jpg', import.meta.url).href,
    arm: new URL('../assets/polyhaven/rock_tile_floor_arm_1k.jpg', import.meta.url).href,
  },
  brick: {
    diff: new URL('../assets/polyhaven/castle_brick_07_diff_1k.jpg', import.meta.url).href,
    nor: new URL('../assets/polyhaven/castle_brick_07_nor_gl_1k.jpg', import.meta.url).href,
    arm: new URL('../assets/polyhaven/castle_brick_07_arm_1k.jpg', import.meta.url).href,
  },
  planks: {
    diff: new URL('../assets/polyhaven/worn_planks_diff_1k.jpg', import.meta.url).href,
    nor: new URL('../assets/polyhaven/worn_planks_nor_gl_1k.jpg', import.meta.url).href,
    arm: new URL('../assets/polyhaven/worn_planks_arm_1k.jpg', import.meta.url).href,
  },
};
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
interface PBR {
  map: THREE.Texture;
  normal: THREE.Texture;
  arm: THREE.Texture;
}
function texFrom(img: ImageBitmap | null, kind: Kind): THREE.Texture {
  let t: THREE.Texture;
  if (img) t = new THREE.Texture(img);
  else {
    const px = kind === 'diff' ? [128, 120, 110, 255] : kind === 'nor' ? [128, 128, 255, 255] : [255, 190, 0, 255];
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
type Kit = Record<SetId, PBR>;
let kitP: Promise<Kit> | null = null;
function loadKit(): Promise<Kit> {
  kitP ??= Promise.all(SETS.map((s) => Promise.all([bitmap(SRC[s].diff), bitmap(SRC[s].nor), bitmap(SRC[s].arm)]))).then((all) => {
    const k = {} as Kit;
    SETS.forEach((s, i) => {
      const [d, n, a] = all[i]!;
      k[s] = { map: texFrom(d, 'diff'), normal: texFrom(n, 'nor'), arm: texFrom(a, 'arm') };
    });
    return k;
  });
  return kitP;
}
/** 같은 그림(Source)을 쓰는 반복만 다른 복사본 — GPU 에 다시 올리지 않는다 */
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
  return new THREE.MeshStandardMaterial({
    map: rep(p.map, rx, ry),
    normalMap: rep(p.normal, rx, ry),
    aoMap: arm,
    roughnessMap: arm,
    metalnessMap: arm,
    roughness: 1,
    metalness: 1,
    ...o,
  });
}

/* ───────────── 준비: 텍스처 올리기 → 병렬 컴파일 ───────────── */

const uploaded = new WeakMap<R, WeakSet<object>>();
function pump(r: R, list: THREE.Texture[], budget = 3): boolean {
  let done = uploaded.get(r);
  if (!done) uploaded.set(r, (done = new WeakSet()));
  const t0 = performance.now();
  for (const t of list) {
    if (done.has(t.source)) continue;
    if (performance.now() - t0 > budget) return false;
    r.initTexture(t);
    done.add(t.source);
  }
  return true;
}
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
}
/** 그림자를 켜고 — 다른 카드와 나눠 쓰는 렌더러라 끝나면 되돌린다 */
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
function sceneTex(root: THREE.Object3D): THREE.Texture[] {
  const out: THREE.Texture[] = [];
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (!m) return;
    for (const x of Array.isArray(m) ? m : [m]) {
      const s = x as THREE.MeshStandardMaterial;
      for (const t of [s.map, s.normalMap, s.aoMap, s.roughnessMap, s.metalnessMap, s.emissiveMap]) if (t) out.push(t);
    }
  });
  return out;
}

/* ───────────── 캔버스 그림 (한 번만) ───────────── */

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let glowT: THREE.CanvasTexture | null = null;
function glowTex(): THREE.CanvasTexture {
  return (glowT ??= canvasTex(128, 128, (g) => {
    const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.18, 'rgba(255,255,255,0.55)');
    rg.addColorStop(0.5, 'rgba(255,255,255,0.12)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 128, 128);
  }));
}
let blobT: THREE.CanvasTexture | null = null;
function blobTex(): THREE.CanvasTexture {
  return (blobT ??= canvasTex(128, 128, (g) => {
    const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    rg.addColorStop(0, 'rgba(0,0,0,0.85)');
    rg.addColorStop(0.45, 'rgba(0,0,0,0.42)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 128, 128);
  }));
}
let ringT: THREE.CanvasTexture | null = null;
function ringTex(): THREE.CanvasTexture {
  return (ringT ??= canvasTex(128, 128, (g) => {
    const rg = g.createRadialGradient(64, 64, 30, 64, 64, 62);
    rg.addColorStop(0, 'rgba(255,255,255,0)');
    rg.addColorStop(0.55, 'rgba(255,255,255,0.15)');
    rg.addColorStop(0.8, 'rgba(255,255,255,1)');
    rg.addColorStop(0.9, 'rgba(255,255,255,0.5)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 128, 128);
  }));
}
/** 도깨비 호랑이 가죽 옷 — 노랑 바탕 검은 줄무늬 */
let tigerT: THREE.CanvasTexture | null = null;
function tigerTex(): THREE.CanvasTexture {
  return (tigerT ??= canvasTex(256, 64, (g) => {
    g.fillStyle = '#e0a42a';
    g.fillRect(0, 0, 256, 64);
    const r = rng(7);
    g.fillStyle = '#1c1208';
    for (let i = 0; i < 14; i++) {
      const x = i * 18 + r() * 6;
      g.beginPath();
      g.moveTo(x, 0);
      g.quadraticCurveTo(x + 9 + r() * 6, 32, x + 2, 64);
      g.lineTo(x + 7, 64);
      g.quadraticCurveTo(x + 15 + r() * 4, 30, x + 6, 0);
      g.fill();
    }
  }));
}
function blobMesh(size: number, opacity = 0.7): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false, opacity, color: 0x000000, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}
function glowSprite(color: number, scale: number, opacity = 1): THREE.Sprite {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  );
  s.scale.setScalar(scale);
  return s;
}

/* ───────────── 점 셰이더 (불꽃 · 먼지 · 입자) — 반복문 없음 ───────────── */

const NT = 4; // 벽 횃불 수
const FIRE_VS = /* glsl */ `
attribute float seed;
attribute float tid;
uniform float uTime;
uniform float uScale;
uniform vec3 uO[${NT}];
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
    p = o + vec3(cos(ang) * rad, life * 0.56, sin(ang) * rad);
    p.x += sin(uTime * 9.0 + seed * 20.0) * 0.025 * life;
    p.z += cos(uTime * 7.0 + seed * 13.0) * 0.02 * life;
    sz = 0.28 * (1.0 - life * 0.75) * (0.6 + 0.4 * fract(seed * 13.1));
    vLife = life;
  } else {
    float life = fract(uTime * 0.32 + seed * 3.77);
    p = o + vec3(sin(ang + uTime * 1.3) * 0.35 * life, life * 2.1, cos(ang * 1.7 + uTime) * 0.35 * life);
    sz = 0.035 * (1.0 - life * 0.5);
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
/** 떠다니는 먼지 — 가까운 빛(영웅 등불 + 횃불)에 비칠 때만 보인다 */
const DUST_VS = /* glsl */ `
attribute float seed;
uniform float uTime;
uniform float uScale;
uniform vec3 uL[${NT + 1}];
varying float vB;
void main() {
  vec3 p = position;
  p += vec3(sin(uTime * 0.13 + seed * 6.0) * 0.45, sin(uTime * 0.09 + seed * 3.0) * 0.3, cos(uTime * 0.11 + seed * 5.0) * 0.45);
  vec3 d0 = p - uL[0]; vec3 d1 = p - uL[1]; vec3 d2 = p - uL[2]; vec3 d3 = p - uL[3]; vec3 d4 = p - uL[4];
  vB = 1.3 / (1.0 + dot(d0, d0) * 0.5) + 1.0 / (1.0 + dot(d1, d1) * 0.9) + 1.0 / (1.0 + dot(d2, d2) * 0.9)
     + 1.0 / (1.0 + dot(d3, d3) * 0.9) + 1.0 / (1.0 + dot(d4, d4) * 0.9);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (0.028 + 0.02 * fract(seed * 7.7)) * uScale / -mv.z;
}`;
const DUST_FS = /* glsl */ `
varying float vB;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  if (r > 1.0) discard;
  float a = smoothstep(1.0, 0.0, r) * clamp(vB, 0.0, 1.0) * 0.7;
  gl_FragColor = vec4(1.0, 0.8, 0.55, a);
}`;
/** 효과 입자 (불티 · 불꽃 · 치유 빛 · 금화 반짝 · 먼지 연기) — CPU 가 위치 · 색 · 크기를 채운다 */
const PART_VS = /* glsl */ `
attribute vec3 aCol;
attribute float aSize;
attribute float aAlpha;
uniform float uScale;
varying vec3 vCol;
varying float vA;
void main() {
  vCol = aCol;
  vA = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / -mv.z;
}`;
const PART_FS = /* glsl */ `
varying vec3 vCol;
varying float vA;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  if (r > 1.0) discard;
  float a = 1.0 - r;
  a *= a;
  gl_FragColor = vec4(vCol * (0.7 + 0.9 * a), a * vA);
}`;
function pointsMat(vs: string, fs: string, uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
}

/* ───────────── 시야 안개 (가 본 곳만) — 모든 재질에 한 줄 덧붙이기 ───────────── */

/** R = 가 본 적 있음, G = 지금 보임 (부드럽게). 격자 칸 하나 = 텍셀 하나, 선형 보간으로 경계가 부드럽다 */
interface FowU {
  tex: { value: THREE.Texture };
  map: { value: THREE.Vector4 };
}
/** 견본마다 제 안개 텍스처 — 셰이더 글은 같아 프로그램은 함께 쓴다 */
function fowPatch(shader: THREE.WebGLProgramParametersWithUniforms, U: FowU): void {
  shader.uniforms.uFow = U.tex;
  shader.uniforms.uFowM = U.map;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec2 vFowXZ;')
    .replace(
      '#include <project_vertex>',
      `#include <project_vertex>
  vec4 fowW = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  fowW = instanceMatrix * fowW;
  #endif
  vFowXZ = (modelMatrix * fowW).xz;`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform sampler2D uFow;\nuniform vec4 uFowM;\nvarying vec2 vFowXZ;')
    .replace(
      '#include <fog_fragment>',
      `vec4 fwS = texture2D(uFow, (vFowXZ - uFowM.xy) * uFowM.zw);
  gl_FragColor.rgb *= max(fwS.g, fwS.r * 0.36);
  #include <fog_fragment>`,
    );
}

/* ───────────── 던전 지도 (30 × 24 칸, 칸 하나 = 1m) ───────────── */

const MW = 30;
const MH = 24;
const VOID = 0;
const FLOOR = 1;
const WALL = 2;
const PILLAR = 3;
interface DoorDef {
  cells: [number, number][];
  /** 'x' = 복도가 x 로 뻗어 문짝이 x 방향을 막는다 */
  axis: 'x' | 'z';
  cx: number;
  cz: number;
}
const DOORS: DoorDef[] = [
  { cells: [[13, 5], [13, 6]], axis: 'x', cx: 13.5, cz: 6 },
  { cells: [[20, 13], [21, 13]], axis: 'z', cx: 21, cz: 13.5 },
  { cells: [[5, 14], [6, 14]], axis: 'z', cx: 6, cz: 14.5 },
];
const PILLARS: [number, number][] = [
  [18, 3],
  [24, 3],
  [18, 8],
  [24, 8],
];
/** 횃불 — 벽 칸(x, z) 의 방 쪽 면에 (d = 방 쪽 방향, 늘 + 쪽) */
const TORCHES: { x: number; z: number; d: 'z' | 'x' }[] = [
  { x: 5, z: 1, d: 'z' },
  { x: 21, z: 0, d: 'z' },
  { x: 17, z: 15, d: 'z' },
  { x: 13, z: 20, d: 'x' },
];
const START: [number, number] = [5, 6];
const idx = (x: number, z: number): number => z * MW + x;
const inside = (x: number, z: number): boolean => x >= 0 && z >= 0 && x < MW && z < MH;

function buildGrid(): Uint8Array {
  const g = new Uint8Array(MW * MH);
  const carve = (x0: number, z0: number, x1: number, z1: number): void => {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) g[idx(x, z)] = FLOOR;
  };
  carve(2, 2, 9, 9); // 방 A (처음 자리)
  carve(10, 5, 15, 6); // 복도 A → B
  carve(16, 1, 26, 10); // 방 B (기둥 넷)
  carve(20, 11, 21, 15); // 복도 B → C
  carve(14, 16, 28, 22); // 방 C (보물 방)
  carve(5, 10, 6, 18); // 복도 A → C (아래로 돌아가는 길)
  carve(7, 17, 13, 18);
  for (const [x, z] of PILLARS) g[idx(x, z)] = PILLAR;
  for (let z = 0; z < MH; z++)
    for (let x = 0; x < MW; x++) {
      if (g[idx(x, z)] !== VOID) continue;
      let near = false;
      for (let dz = -1; dz <= 1 && !near; dz++)
        for (let dx = -1; dx <= 1; dx++) if (inside(x + dx, z + dz) && g[idx(x + dx, z + dz)] === FLOOR) near = true;
      if (near) g[idx(x, z)] = WALL;
    }
  return g;
}
/** 앞쪽(카메라 쪽) 벽은 낮게 — 안쪽이 가려지지 않게 (쿼터뷰 게임들이 쓰는 방법) */
function wallShort(g: Uint8Array, x: number, z: number): boolean {
  const f = (a: number, b: number): boolean => inside(a, b) && g[idx(a, b)] === FLOOR;
  return f(x, z - 1) || f(x - 1, z) || f(x - 1, z - 1);
}

/* ───────────── 길찾기 (격자 A* + 줄 당기기) ───────────── */

class Nav {
  readonly g: Uint8Array;
  /** 칸을 막는 것 (상자 · 항아리 · 보물 상자) */
  readonly block = new Uint8Array(MW * MH);
  /** 칸 → 문 번호 + 1 (0 = 문 아님) */
  readonly doorAt = new Uint8Array(MW * MH);
  doorOpen: boolean[] = DOORS.map(() => false);
  private gs = new Float32Array(MW * MH);
  private fs = new Float32Array(MW * MH);
  private from = new Int32Array(MW * MH);
  private stamp = new Uint32Array(MW * MH);
  private closed = new Uint32Array(MW * MH);
  private heap = new Int32Array(MW * MH * 8);
  private gen = 1;
  constructor(g: Uint8Array) {
    this.g = g;
    DOORS.forEach((d, i) => {
      for (const [x, z] of d.cells) this.doorAt[idx(x, z)] = i + 1;
    });
  }
  walk(x: number, z: number, mon: boolean): boolean {
    if (!inside(x, z)) return false;
    const i = idx(x, z);
    if (this.g[i] !== FLOOR || this.block[i]) return false;
    const d = this.doorAt[i]!;
    return !(mon && d && !this.doorOpen[d - 1]);
  }
  /** 세계 좌표 점이 걸을 수 있는 곳인가 (몸 반지름 r 만큼 네 귀퉁이도) */
  free(px: number, pz: number, r: number, mon: boolean): boolean {
    return (
      this.walk(Math.floor(px - r), Math.floor(pz - r), mon) &&
      this.walk(Math.floor(px + r), Math.floor(pz - r), mon) &&
      this.walk(Math.floor(px - r), Math.floor(pz + r), mon) &&
      this.walk(Math.floor(px + r), Math.floor(pz + r), mon)
    );
  }
  /** 두 점 사이가 트였나 — 0.2m 씩 몸 반지름으로 */
  clear(ax: number, az: number, bx: number, bz: number, r: number, mon: boolean): boolean {
    const dx = bx - ax;
    const dz = bz - az;
    const n = Math.ceil(Math.hypot(dx, dz) / 0.2);
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      if (!this.free(ax + dx * t, az + dz * t, r, mon)) return false;
    }
    return true;
  }
  /** 눈길 — 벽 · 닫힌 문만 막는다 */
  sight(ax: number, az: number, bx: number, bz: number): boolean {
    const dx = bx - ax;
    const dz = bz - az;
    const n = Math.ceil(Math.hypot(dx, dz) / 0.25);
    for (let k = 1; k < n; k++) {
      const x = Math.floor(ax + (dx * k) / n);
      const z = Math.floor(az + (dz * k) / n);
      if (!inside(x, z)) return false;
      const i = idx(x, z);
      if (this.g[i] !== FLOOR && this.g[i] !== PILLAR) return false;
      const d = this.doorAt[i]!;
      if (d && !this.doorOpen[d - 1]) return false;
    }
    return true;
  }
  /** 가장 가까운 걸을 수 있는 칸 (막힌 곳을 눌렀을 때) */
  nearest(x: number, z: number, mon: boolean): [number, number] | null {
    for (let r = 0; r < 6; r++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (this.walk(x + dx, z + dz, mon)) return [x + dx, z + dz];
        }
    return null;
  }
  /** A* — 8 방향, 귀퉁이 자르기 금지. 칸 중심 점 목록(출발 칸 뺌)을 돌려준다 */
  path(sx: number, sz: number, tx: number, tz: number, mon: boolean): [number, number][] | null {
    if (!this.walk(tx, tz, mon)) return null;
    const gen = ++this.gen;
    const s = idx(sx, sz);
    const t = idx(tx, tz);
    const hh = (i: number): number => {
      const dx = Math.abs((i % MW) - tx);
      const dz = Math.abs(((i / MW) | 0) - tz);
      return dx + dz - 0.586 * Math.min(dx, dz);
    };
    let n = 0;
    const heap = this.heap;
    const fs = this.fs;
    const push = (i: number): void => {
      let k = n++;
      heap[k] = i;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (fs[heap[p]!]! <= fs[heap[k]!]!) break;
        const tmp = heap[p]!;
        heap[p] = heap[k]!;
        heap[k] = tmp;
        k = p;
      }
    };
    const pop = (): number => {
      const top = heap[0]!;
      heap[0] = heap[--n]!;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1;
        const r = l + 1;
        let m = k;
        if (l < n && fs[heap[l]!]! < fs[heap[m]!]!) m = l;
        if (r < n && fs[heap[r]!]! < fs[heap[m]!]!) m = r;
        if (m === k) break;
        const tmp = heap[m]!;
        heap[m] = heap[k]!;
        heap[k] = tmp;
        k = m;
      }
      return top;
    };
    this.stamp[s] = gen;
    this.gs[s] = 0;
    fs[s] = hh(s);
    this.from[s] = -1;
    push(s);
    let found = false;
    while (n > 0 && n < heap.length - 8) {
      const c = pop();
      if (this.closed[c] === gen) continue;
      this.closed[c] = gen;
      if (c === t) {
        found = true;
        break;
      }
      const cx = c % MW;
      const cz = (c / MW) | 0;
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (!this.walk(nx, nz, mon)) continue;
          if (dx && dz && (!this.walk(cx + dx, cz, mon) || !this.walk(cx, cz + dz, mon))) continue;
          const ni = idx(nx, nz);
          if (this.closed[ni] === gen) continue;
          const ng = this.gs[c]! + (dx && dz ? 1.414 : 1);
          if (this.stamp[ni] === gen && ng >= this.gs[ni]!) continue;
          this.stamp[ni] = gen;
          this.gs[ni] = ng;
          fs[ni] = ng + hh(ni);
          this.from[ni] = c;
          push(ni);
        }
    }
    if (!found) return null;
    const out: [number, number][] = [];
    for (let c = t; c !== s && c >= 0; c = this.from[c]!) out.push([(c % MW) + 0.5, ((c / MW) | 0) + 0.5]);
    return out.reverse();
  }
  /** 줄 당기기 — 트인 곳은 곧장 */
  smooth(ax: number, az: number, pts: [number, number][], r: number, mon: boolean): [number, number][] {
    const out: [number, number][] = [];
    let cx = ax;
    let cz = az;
    let i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !this.clear(cx, cz, pts[j]![0], pts[j]![1], r, mon)) j--;
      out.push(pts[j]!);
      cx = pts[j]![0];
      cz = pts[j]![1];
      i = j + 1;
    }
    return out;
  }
}

/* ───────────── 재질 · 모델 ───────────── */

interface Mats {
  floor: THREE.MeshStandardMaterial;
  wall: THREE.MeshStandardMaterial;
  cap: THREE.MeshStandardMaterial;
  pillar: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  door: THREE.MeshStandardMaterial;
  iron: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  blade: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
  leather: THREE.MeshStandardMaterial;
  cloth: THREE.MeshPhysicalMaterial;
  dark: THREE.MeshStandardMaterial;
  red: THREE.MeshStandardMaterial;
  stick: THREE.MeshStandardMaterial;
  clay: THREE.MeshStandardMaterial;
  clayBand: THREE.MeshStandardMaterial;
  ivory: THREE.MeshStandardMaterial;
  white: THREE.MeshStandardMaterial;
  rug: THREE.MeshStandardMaterial;
}
function makeMats(k: Kit): Mats {
  return {
    floor: pbrMat(k.rock, 1, 1, { color: 0xcfc4b4, vertexColors: true }),
    wall: pbrMat(k.brick, 1, 1, { vertexColors: true }),
    cap: pbrMat(k.rock, 0.5, 0.5, { color: 0x6a625a }),
    pillar: pbrMat(k.brick, 0.8, 1.4),
    stone: pbrMat(k.rock, 0.5, 0.5, { color: 0x9a9184 }),
    wood: pbrMat(k.planks, 0.7, 0.7),
    door: pbrMat(k.planks, 0.6, 0.6, { color: 0xb09070 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x3e3a36, metalness: 0.7, roughness: 0.48 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x9ca3ae, metalness: 0.6, roughness: 0.36 }),
    blade: new THREE.MeshStandardMaterial({ color: 0xeef3fa, metalness: 0.6, roughness: 0.2, emissive: 0x141a24 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xffc040, metalness: 0.8, roughness: 0.3, emissive: 0x3a2000 }),
    leather: new THREE.MeshStandardMaterial({ color: 0x4a2f1c, roughness: 0.8 }),
    cloth: new THREE.MeshPhysicalMaterial({ color: 0x7a121c, roughness: 0.8, sheen: 0.6, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x9a3a3a), side: THREE.DoubleSide }),
    dark: new THREE.MeshStandardMaterial({ color: 0x080605, roughness: 1 }),
    red: new THREE.MeshStandardMaterial({ color: 0xb0161e, roughness: 0.5 }),
    stick: new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.85 }),
    clay: new THREE.MeshStandardMaterial({ color: 0xa8643c, roughness: 0.62 }),
    clayBand: new THREE.MeshStandardMaterial({ color: 0x4e2814, roughness: 0.7 }),
    ivory: new THREE.MeshStandardMaterial({ color: 0xf4ead2, roughness: 0.45 }),
    white: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }),
    rug: new THREE.MeshStandardMaterial({ map: rugTex(), roughness: 0.92 }),
  };
}
/** 보물 방 양탄자 — 붉은 바탕 금 테 무늬 */
function rugTex(): THREE.CanvasTexture {
  return canvasTex(256, 512, (g) => {
    g.fillStyle = '#5a0d12';
    g.fillRect(0, 0, 256, 512);
    g.strokeStyle = '#d8a440';
    g.lineWidth = 10;
    g.strokeRect(14, 14, 228, 484);
    g.lineWidth = 3;
    g.strokeRect(30, 30, 196, 452);
    g.fillStyle = '#8a1a20';
    g.fillRect(36, 36, 184, 440);
    g.fillStyle = '#d8a440';
    for (let i = 0; i < 5; i++) {
      const y = 80 + i * 88;
      g.beginPath();
      g.moveTo(128, y - 30);
      g.lineTo(158, y);
      g.lineTo(128, y + 30);
      g.lineTo(98, y);
      g.closePath();
      g.fill();
      g.fillStyle = '#5a0d12';
      g.beginPath();
      g.arc(128, y, 9, 0, TAU);
      g.fill();
      g.fillStyle = '#d8a440';
    }
    const r = rng(3);
    g.globalAlpha = 0.1;
    for (let i = 0; i < 900; i++) {
      g.fillStyle = r() < 0.5 ? '#000' : '#fff';
      g.fillRect(r() * 256, r() * 512, 2, 2);
    }
  });
}

/**
 * 한 묶음 안에서 같은 재질 · 같은 그림자 설정인 조각들을 한 메시로 합친다 (그리기 횟수 줄이기, 모양은 그대로).
 * 움직이는 마디(자식이 있는 묶음)는 그 안에서 따로 합친다. userData.keep 은 건드리지 않는다.
 */
function mergeStatic(root: THREE.Object3D): void {
  const groups = new Map<string, THREE.Mesh[]>();
  for (const c of [...root.children]) {
    const m = c as THREE.Mesh;
    if (m.isMesh && !Array.isArray(m.material) && !m.userData.keep && !(m as THREE.InstancedMesh).isInstancedMesh && !m.children.length) {
      const key = `${m.material.uuid}|${m.castShadow ? 1 : 0}|${m.receiveShadow ? 1 : 0}|${m.renderOrder}`;
      const l = groups.get(key);
      if (l) l.push(m);
      else groups.set(key, [m]);
    } else if (c.children.length) mergeStatic(c);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const geos = list.map((m) => {
      m.updateMatrix();
      const g = m.geometry.clone();
      g.applyMatrix4(m.matrix);
      return g;
    });
    const ni = geos.some((g) => !g.index);
    const norm = geos.map((g) => {
      const x = ni && g.index ? g.toNonIndexed() : g;
      for (const k of Object.keys(x.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') x.deleteAttribute(k);
      x.morphAttributes = {};
      x.clearGroups();
      return x;
    });
    if (norm.some((g) => !g.attributes.uv) && norm.some((g) => g.attributes.uv)) continue;
    const merged = mergeGeometries(norm, false);
    if (!merged) continue;
    const first = list[0]!;
    const mm = new THREE.Mesh(merged, first.material);
    mm.castShadow = first.castShadow;
    mm.receiveShadow = first.receiveShadow;
    mm.renderOrder = first.renderOrder;
    for (const m of list) root.remove(m);
    root.add(mm);
  }
}

type MeshFn = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, par?: THREE.Object3D) => THREE.Mesh;
function mesher(root: THREE.Object3D, cast: boolean): MeshFn {
  return (geo, mat, x, y, z, par = root) => {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(x, y, z);
    o.castShadow = cast;
    o.receiveShadow = true;
    par.add(o);
    return o;
  };
}
const V2 = (pts: number[][]): THREE.Vector2[] => pts.map(([x, y]) => new THREE.Vector2(x!, y!));

interface HeroModel {
  root: THREE.Group;
  body: THREE.Group;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  armR: THREE.Object3D;
  armL: THREE.Object3D;
  cape: THREE.Mesh;
  capeBase: Float32Array;
  tip: THREE.Object3D;
  hilt: THREE.Object3D;
  steel: THREE.MeshStandardMaterial;
}
/** 망토 두른 꼬마 기사 — 오른손 칼 · 왼손 방패 */
function* buildHero(m: Mats): Generator<void, HeroModel, void> {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const steel = m.steel.clone();
  const mesh = mesher(body, false);
  const leg = (sx: number): THREE.Object3D => {
    const piv = new THREE.Group();
    piv.position.set(sx, 0.62, 0);
    body.add(piv);
    mesh(new THREE.CapsuleGeometry(0.07, 0.42, 4, 10), m.leather, 0, -0.29, 0, piv);
    mesh(new THREE.CylinderGeometry(0.085, 0.08, 0.2, 12), steel, 0, -0.18, 0.005, piv);
    mesh(new THREE.BoxGeometry(0.15, 0.1, 0.24), m.leather, 0, -0.57, 0.035, piv);
    return piv;
  };
  const legL = leg(-0.1);
  const legR = leg(0.1);
  yield;
  mesh(new THREE.LatheGeometry(V2([[0.001, 0.56], [0.2, 0.57], [0.25, 0.7], [0.24, 0.82], [0.27, 1.0], [0.23, 1.11], [0.1, 1.17], [0.001, 1.18]]), 28), steel, 0, 0, 0);
  mesh(new THREE.TorusGeometry(0.245, 0.03, 8, 28), m.leather, 0, 0.72, 0).rotation.x = Math.PI / 2;
  mesh(new THREE.BoxGeometry(0.08, 0.07, 0.03), m.gold, 0, 0.72, 0.25);
  mesh(new THREE.CylinderGeometry(0.24, 0.29, 0.2, 20, 1, true), m.leather, 0, 0.6, 0);
  for (const sx of [-1, 1]) mesh(new THREE.SphereGeometry(0.12, 18, 12), steel, sx * 0.25, 1.1, 0).scale.set(1, 0.75, 1.05);
  mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.24, 24), steel, 0, 1.31, 0);
  mesh(new THREE.SphereGeometry(0.15, 24, 12, 0, TAU, 0, Math.PI / 2), steel, 0, 1.43, 0);
  mesh(new THREE.BoxGeometry(0.22, 0.03, 0.03), m.dark, 0, 1.34, 0.152);
  mesh(new THREE.BoxGeometry(0.03, 0.12, 0.03), m.dark, 0, 1.29, 0.155);
  mesh(new THREE.ConeGeometry(0.05, 0.3, 10), m.red, 0, 1.6, -0.06).rotation.x = -0.6;
  yield;
  // 오른팔 + 칼 (팔 회전 x 가 음수면 앞으로 든다)
  const armR = new THREE.Group();
  armR.position.set(0.28, 1.06, 0);
  body.add(armR);
  mesh(new THREE.CapsuleGeometry(0.055, 0.36, 4, 10), steel, 0, -0.24, 0, armR);
  const sword = new THREE.Group();
  sword.position.set(0, -0.48, 0.02);
  armR.add(sword);
  const bs = new THREE.Shape();
  bs.moveTo(-0.036, 0);
  bs.lineTo(0.036, 0);
  bs.lineTo(0.03, 0.62);
  bs.lineTo(0, 0.74);
  bs.lineTo(-0.03, 0.62);
  bs.closePath();
  const bg = new THREE.ExtrudeGeometry(bs, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1 });
  bg.translate(0, 0.07, -0.006);
  bg.rotateX(Math.PI / 2);
  bg.rotateZ(Math.PI / 2);
  mesh(bg, m.blade, 0, 0, 0, sword);
  mesh(new THREE.BoxGeometry(0.05, 0.24, 0.045), m.gold, 0, 0, 0.06, sword);
  mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.16, 8), m.leather, 0, 0, -0.03, sword).rotation.x = Math.PI / 2;
  mesh(new THREE.SphereGeometry(0.035, 10, 8), m.gold, 0, 0, -0.12, sword);
  const hilt = new THREE.Object3D();
  hilt.position.set(0, 0, 0.12);
  sword.add(hilt);
  const tip = new THREE.Object3D();
  tip.position.set(0, 0, 0.84);
  sword.add(tip);
  armR.rotation.x = -0.5;
  yield;
  // 왼팔 + 방패
  const armL = new THREE.Group();
  armL.position.set(-0.28, 1.06, 0);
  body.add(armL);
  mesh(new THREE.CapsuleGeometry(0.055, 0.36, 4, 10), steel, 0, -0.24, 0, armL);
  const shield = new THREE.Group();
  shield.position.set(-0.08, -0.32, 0.08);
  armL.add(shield);
  mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.04, 32), steel, 0, 0, 0, shield).rotation.z = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.045, 32), m.red, -0.004, 0, 0, shield).rotation.z = Math.PI / 2;
  mesh(new THREE.BoxGeometry(0.05, 0.3, 0.05), m.gold, -0.012, 0, 0, shield);
  mesh(new THREE.BoxGeometry(0.05, 0.05, 0.3), m.gold, -0.012, 0.03, 0, shield);
  // 망토
  const cg = new THREE.PlaneGeometry(0.46, 0.9, 6, 10);
  cg.translate(0, -0.45, 0);
  const cape = mesh(cg, m.cloth, 0, 1.16, -0.2);
  cape.userData.keep = true;
  mergeStatic(root);
  const capeBase = Float32Array.from(cg.attributes.position!.array as Float32Array);
  return { root, body, legL, legR, armR, armL, cape, capeBase, tip, hilt, steel };
}

type MonKind = 'slime' | 'goblin' | 'boss';
interface MonModel {
  root: THREE.Group;
  body: THREE.Group;
  legL: THREE.Object3D | null;
  legR: THREE.Object3D | null;
  armL: THREE.Object3D | null;
  armR: THREE.Object3D | null;
  /** 번쩍일 재질 (괴물마다 따로) */
  flash: THREE.MeshStandardMaterial[];
}
/** 말랑 젤리 — 반들반들 */
function buildSlime(m: Mats, color: number): MonModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const mesh = mesher(body, true);
  const geo = new THREE.SphereGeometry(0.42, 36, 24);
  const p = geo.attributes.position!;
  for (let i = 0; i < p.count; i++) {
    let y = p.getY(i);
    if (y < -0.1) y = -0.1 + (y + 0.1) * 0.35;
    const k = 1 + 0.06 * Math.max(0, -y);
    p.setXYZ(i, p.getX(i) * k, y + 0.212, p.getZ(i) * k);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.16,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    sheen: 0.4,
    sheenColor: new THREE.Color(color).multiplyScalar(1.4),
    emissive: new THREE.Color(color).multiplyScalar(0.12),
  });
  mesh(geo, mat, 0, 0, 0);
  mesh(new THREE.SphereGeometry(0.1, 16, 12), mat, 0.02, 0.62, -0.02).scale.set(1, 1.4, 1);
  const eyeW = new THREE.SphereGeometry(0.085, 16, 12);
  const pup = new THREE.SphereGeometry(0.048, 12, 10);
  const hl = new THREE.SphereGeometry(0.018, 8, 6);
  for (const sx of [-1, 1]) {
    mesh(eyeW, m.white, sx * 0.13, 0.42, 0.31).castShadow = false;
    mesh(pup, m.dark, sx * 0.13, 0.42, 0.375).castShadow = false;
    mesh(hl, m.white, sx * 0.13 + 0.02, 0.44, 0.415).castShadow = false;
  }
  const smile = mesh(new THREE.TorusGeometry(0.06, 0.014, 6, 14, Math.PI), m.dark, 0, 0.32, 0.38);
  smile.rotation.z = Math.PI;
  smile.castShadow = false;
  mergeStatic(root);
  return { root, body, legL: null, legR: null, armL: null, armR: null, flash: [mat] };
}
/** 도깨비 — 뿔 하나 · 호랑이 가죽 옷 · 혹 달린 방망이 */
function* buildGoblin(m: Mats, skin: number, boss: boolean): Generator<void, MonModel, void> {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const mesh = mesher(body, true);
  const skinM = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.62, emissive: new THREE.Color(skin).multiplyScalar(0.05) });
  const eyeM = new THREE.MeshStandardMaterial({ color: 0xffd040, emissive: boss ? 0xff5020 : 0xffb020, emissiveIntensity: 1.6, roughness: 0.3 });
  const tiger = new THREE.MeshStandardMaterial({ map: tigerTex(), roughness: 0.85, side: THREE.DoubleSide });
  const leg = (sx: number): THREE.Object3D => {
    const piv = new THREE.Group();
    piv.position.set(sx, 0.46, 0);
    body.add(piv);
    mesh(new THREE.CapsuleGeometry(0.085, 0.26, 4, 10), skinM, 0, -0.2, 0, piv);
    mesh(new THREE.SphereGeometry(0.11, 14, 10), skinM, 0, -0.4, 0.05, piv).scale.set(1, 0.55, 1.4);
    return piv;
  };
  const legL = leg(-0.13);
  const legR = leg(0.13);
  mesh(new THREE.LatheGeometry(V2([[0.001, 0.4], [0.24, 0.42], [0.33, 0.58], [0.34, 0.72], [0.29, 0.9], [0.18, 1.0], [0.001, 1.02]]), 26), skinM, 0, 0, 0);
  mesh(new THREE.CylinderGeometry(0.335, 0.35, 0.22, 26, 1, true), tiger, 0, 0.52, 0);
  mesh(new THREE.TorusGeometry(0.335, 0.022, 6, 26), m.leather, 0, 0.62, 0).rotation.x = Math.PI / 2;
  yield;
  // 머리
  mesh(new THREE.SphereGeometry(0.27, 26, 18), skinM, 0, 1.2, 0.02).scale.set(1, 0.95, 0.95);
  const horn = mesh(new THREE.ConeGeometry(0.065, 0.24, 14), m.ivory, 0, 1.52, 0.02);
  horn.rotation.x = -0.15;
  if (boss) {
    for (const sx of [-1, 1]) {
      const h2 = mesh(new THREE.ConeGeometry(0.05, 0.2, 12), m.ivory, sx * 0.17, 1.42, 0);
      h2.rotation.z = -sx * 0.6;
    }
    mesh(new THREE.TorusGeometry(0.07, 0.018, 6, 16), m.gold, 0, 1.43, 0.02).rotation.x = Math.PI / 2;
  }
  for (const sx of [-1, 1]) {
    const ear = mesh(new THREE.ConeGeometry(0.06, 0.18, 10), skinM, sx * 0.28, 1.24, 0);
    ear.rotation.z = -sx * 1.2;
    mesh(new THREE.SphereGeometry(0.075, 14, 10), m.white, sx * 0.1, 1.24, 0.21).castShadow = false;
    mesh(new THREE.SphereGeometry(0.042, 12, 8), eyeM, sx * 0.1, 1.24, 0.262).castShadow = false;
    mesh(new THREE.SphereGeometry(0.02, 8, 6), m.dark, sx * 0.1, 1.24, 0.297).castShadow = false;
    const brow = mesh(new THREE.BoxGeometry(0.12, 0.03, 0.04), m.dark, sx * 0.1, 1.33, 0.22);
    brow.rotation.z = sx * 0.35;
    brow.castShadow = false;
    const tusk = mesh(new THREE.ConeGeometry(0.022, 0.08, 8), m.ivory, sx * 0.07, 1.1, 0.23);
    tusk.castShadow = false;
  }
  mesh(new THREE.SphereGeometry(0.05, 12, 8), skinM, 0, 1.17, 0.27).castShadow = false;
  const mouth = mesh(new THREE.TorusGeometry(0.07, 0.016, 6, 14, Math.PI), m.dark, 0, 1.08, 0.235);
  mouth.rotation.z = Math.PI;
  mouth.castShadow = false;
  yield;
  // 팔 + 방망이
  const arm = (sx: number): THREE.Group => {
    const a = new THREE.Group();
    a.position.set(sx * 0.33, 0.9, 0);
    body.add(a);
    mesh(new THREE.CapsuleGeometry(0.075, 0.28, 4, 10), skinM, 0, -0.2, 0, a);
    mesh(new THREE.SphereGeometry(0.085, 12, 10), skinM, 0, -0.42, 0, a);
    return a;
  };
  const armL = arm(-1);
  const armR = arm(1);
  const club = new THREE.Group();
  club.position.set(0, -0.42, 0.02);
  armR.add(club);
  const cg = new THREE.CylinderGeometry(0.1, 0.035, 0.62, 14);
  cg.rotateX(Math.PI / 2);
  mesh(cg, m.wood, 0, 0, 0.28, club);
  const stud = new THREE.ConeGeometry(0.025, 0.07, 8);
  for (let i = 0; i < 7; i++) {
    const a = i * 2.1;
    const zz = 0.36 + (i % 3) * 0.08;
    const rr = 0.03 + ((zz + 0.03) / 0.62) * 0.065;
    const s = mesh(stud, m.iron, Math.cos(a) * rr, Math.sin(a) * rr, zz, club);
    s.rotation.z = a - Math.PI / 2;
    s.castShadow = false;
  }
  armR.rotation.x = -0.6;
  armL.rotation.x = -0.2;
  if (boss) body.scale.setScalar(1.45);
  mergeStatic(root);
  return { root, body, legL, legR, armL, armR, flash: [skinM] };
}
/* ───────────── 소품 ───────────── */

function buildPot(m: Mats): THREE.Group {
  const g = new THREE.Group();
  const mesh = mesher(g, true);
  mesh(new THREE.LatheGeometry(V2([[0.001, 0], [0.15, 0], [0.24, 0.08], [0.27, 0.22], [0.25, 0.34], [0.15, 0.44], [0.11, 0.49], [0.14, 0.54], [0.12, 0.56], [0.001, 0.53]]), 24), m.clay, 0, 0, 0);
  mesh(new THREE.TorusGeometry(0.262, 0.016, 6, 28), m.clayBand, 0, 0.27, 0).rotation.x = Math.PI / 2;
  mesh(new THREE.TorusGeometry(0.2, 0.012, 6, 28), m.clayBand, 0, 0.385, 0).rotation.x = Math.PI / 2;
  mergeStatic(g);
  return g;
}
function buildCrate(m: Mats): THREE.Group {
  const g = new THREE.Group();
  const mesh = mesher(g, true);
  const S = 0.74;
  mesh(new THREE.BoxGeometry(S, S, S), m.wood, 0, S / 2, 0);
  const e = 0.05;
  const vb = new THREE.BoxGeometry(e, S + 0.01, e);
  const hb = new THREE.BoxGeometry(S + 0.01, e, e);
  const db = new THREE.BoxGeometry(e, e, S + 0.01);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      mesh(vb, m.iron, (sx * S) / 2, S / 2, (sz * S) / 2);
      mesh(hb, m.iron, 0, sz > 0 ? S : 0.02, (sx * S) / 2);
      mesh(db, m.iron, (sx * S) / 2, sz > 0 ? S : 0.02, 0);
    }
  mergeStatic(g);
  return g;
}
interface ChestModel {
  g: THREE.Group;
  lid: THREE.Group;
}
function buildChest(m: Mats): ChestModel {
  const g = new THREE.Group();
  const mesh = mesher(g, true);
  mesh(new THREE.BoxGeometry(1.0, 0.52, 0.64), m.wood, 0, 0.26, 0);
  for (const x of [-0.36, 0, 0.36]) mesh(new THREE.BoxGeometry(0.06, 0.54, 0.66), m.iron, x, 0.26, 0);
  mesh(new THREE.BoxGeometry(1.02, 0.05, 0.66), m.gold, 0, 0.03, 0);
  const lid = new THREE.Group();
  lid.position.set(0, 0.52, -0.32);
  g.add(lid);
  const lm = mesher(lid, true);
  lm(new THREE.CylinderGeometry(0.32, 0.32, 1.0, 24, 1, false, 0, Math.PI), m.wood, 0, 0, 0.32).rotation.z = Math.PI / 2;
  for (const x of [-0.36, 0, 0.36]) lm(new THREE.TorusGeometry(0.326, 0.022, 6, 20, Math.PI), m.iron, x, 0, 0.32).rotation.y = Math.PI / 2;
  lm(new THREE.BoxGeometry(0.14, 0.16, 0.05), m.gold, 0, -0.02, 0.655);
  lm(new THREE.TorusGeometry(0.035, 0.012, 6, 14), m.dark, 0, -0.03, 0.685);
  mergeStatic(g);
  return { g, lid };
}
interface DoorModel {
  g: THREE.Group;
  leaves: THREE.Object3D[];
  k: number;
}
function buildDoor(m: Mats, d: DoorDef): DoorModel {
  const g = new THREE.Group();
  const mesh = mesher(g, true);
  const H = 2.1;
  const leaves: THREE.Object3D[] = [];
  const xs = d.cells.map((c) => c[0]);
  const zs = d.cells.map((c) => c[1]);
  const band = new THREE.BoxGeometry(1, 1, 1);
  if (d.axis === 'x') {
    const x = d.cx;
    const z0 = Math.min(...zs);
    const z1 = Math.max(...zs) + 1;
    for (const [hz, dir] of [[z0, 1], [z1, -1]] as const) {
      const piv = new THREE.Group();
      piv.position.set(x, 0, hz);
      g.add(piv);
      const lg = new THREE.BoxGeometry(0.09, H, 0.98);
      lg.translate(0, H / 2, dir * 0.5);
      mesh(lg, m.door, 0, 0, 0, piv);
      for (const y of [0.45, 1.6]) mesh(band, m.iron, 0, y, dir * 0.5, piv).scale.set(0.12, 0.08, 0.96);
      mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 14), m.iron, 0.07, 1.05, dir * 0.85, piv).rotation.y = Math.PI / 2;
      leaves.push(piv);
    }
    for (const z of [z0, z1]) mesh(new THREE.BoxGeometry(0.34, 2.5, 0.3), m.stone, x, 1.25, z);
    mesh(new THREE.BoxGeometry(0.4, 0.36, z1 - z0 + 0.5), m.stone, x, 2.42, (z0 + z1) / 2);
  } else {
    const z = d.cz;
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs) + 1;
    for (const [hx, dir] of [[x0, 1], [x1, -1]] as const) {
      const piv = new THREE.Group();
      piv.position.set(hx, 0, z);
      g.add(piv);
      const lg = new THREE.BoxGeometry(0.98, H, 0.09);
      lg.translate(dir * 0.5, H / 2, 0);
      mesh(lg, m.door, 0, 0, 0, piv);
      for (const y of [0.45, 1.6]) mesh(band, m.iron, dir * 0.5, y, 0, piv).scale.set(0.96, 0.08, 0.12);
      mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 14), m.iron, dir * 0.85, 1.05, 0.07, piv);
      leaves.push(piv);
    }
    for (const x of [x0, x1]) mesh(new THREE.BoxGeometry(0.3, 2.5, 0.34), m.stone, x, 1.25, z);
    mesh(new THREE.BoxGeometry(x1 - x0 + 0.5, 0.36, 0.4), m.stone, (x0 + x1) / 2, 2.42, z);
  }
  mergeStatic(g);
  return { g, leaves, k: 0 };
}
/** 벽 횃불 받침 — +z 쪽으로 나온다. 불꽃 자리를 돌려준다 */
function torchBracket(m: Mats): { g: THREE.Group; flame: THREE.Object3D } {
  const g = new THREE.Group();
  const mesh = mesher(g, false);
  mesh(new THREE.BoxGeometry(0.22, 0.36, 0.05), m.iron, 0, 0, 0.025);
  mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.34, 8), m.iron, 0, 0.02, 0.18).rotation.x = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(0.09, 0.04, 0.14, 12, 1, true), m.iron, 0, 0.1, 0.32);
  mesh(new THREE.TorusGeometry(0.09, 0.012, 6, 16), m.iron, 0, 0.17, 0.32).rotation.x = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.3, 8), m.stick, 0, 0.2, 0.32);
  const flame = new THREE.Object3D();
  flame.position.set(0, 0.38, 0.32);
  g.add(flame);
  mergeStatic(g);
  return { g, flame };
}
function pillarProfile(h: number, r: number): THREE.Vector2[] {
  const pts: number[][] = [[0.001, 0], [r * 1.45, 0], [r * 1.45, 0.1], [r * 1.22, 0.16], [r * 1.05, 0.26]];
  for (let i = 0; i <= 8; i++) {
    const k = i / 8;
    pts.push([r * (1 + 0.05 * Math.sin(k * Math.PI) - 0.07 * k), 0.26 + (h - 0.6) * k]);
  }
  pts.push([r * 1.05, h - 0.26], [r * 1.25, h - 0.16], [r * 1.45, h - 0.1], [r * 1.45, h], [0.001, h]);
  return V2(pts);
}

/* ───────────── 던전 모양 (바닥 · 벽을 한 덩어리씩) ───────────── */

/** 바닥 — 칸마다 2×2 조각, 벽 가까이 어둡게(정점 색 그늘), UV 는 세계 크기 */
function floorGeometry(g: Uint8Array, z0: number, z1: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const ind: number[] = [];
  const ao = (px: number, pz: number): number => {
    let v = 1;
    const cx = Math.floor(px);
    const cz = Math.floor(pz);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx;
        const z = cz + dz;
        const w = inside(x, z) ? g[idx(x, z)]! : WALL;
        if (w !== WALL && w !== VOID) continue;
        const ex = Math.max(x - px, 0, px - (x + 1));
        const ez = Math.max(z - pz, 0, pz - (z + 1));
        v *= 1 - 0.42 * Math.exp(-Math.hypot(ex, ez) * 3.2);
      }
    return Math.max(0.3, v);
  };
  for (let z = z0; z < z1; z++)
    for (let x = 0; x < MW; x++) {
      const c = g[idx(x, z)];
      if (c !== FLOOR && c !== PILLAR) continue;
      const b = pos.length / 3;
      for (let j = 0; j <= 2; j++)
        for (let i = 0; i <= 2; i++) {
          const px = x + i / 2;
          const pz = z + j / 2;
          pos.push(px, 0, pz);
          uv.push(px / 2.4, -pz / 2.4);
          const a = ao(px, pz);
          col.push(a, a, a);
        }
      for (let j = 0; j < 2; j++)
        for (let i = 0; i < 2; i++) {
          const a = b + j * 3 + i;
          ind.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
        }
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(ind);
  geo.computeVertexNormals();
  return geo;
}
const WALL_H = 2.4;
const SHORT_H = 0.55;
/** 벽 — 보이는 면만, 아래쪽 어둡게, 앞(카메라 쪽) 벽은 낮게. 묶음 0 = 벽돌 면, 1 = 윗면 */
function wallGeometry(g: Uint8Array): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const faces: number[] = [];
  const caps: number[] = [];
  const hOf = (x: number, z: number): number => {
    if (!inside(x, z) || g[idx(x, z)] !== WALL) return -1;
    return wallShort(g, x, z) ? SHORT_H : WALL_H;
  };
  const vert = (x: number, y: number, z: number, nx: number, nz: number, u: number, v: number, c: number): number => {
    pos.push(x, y, z);
    nor.push(nx, 0, nz);
    uv.push(u, v);
    col.push(c, c, c);
    return pos.length / 3 - 1;
  };
  const shade = (y: number): number => (y <= 0.001 ? 0.42 : y < 0.7 ? lerp(0.42, 0.9, y / 0.65) : 1);
  for (let z = 0; z < MH; z++)
    for (let x = 0; x < MW; x++) {
      const h = hOf(x, z);
      if (h < 0) continue;
      const sides: [number, number, number, number][] = [
        [1, 0, 1, 0],
        [-1, 0, 0, 0],
        [0, 1, 0, 1],
        [0, -1, 0, 0],
      ];
      for (const [dx, dz] of sides) {
        const nx = x + dx;
        const nz = z + dz;
        const nc = inside(nx, nz) ? g[idx(nx, nz)]! : VOID;
        let y0 = 0;
        if (nc === WALL) {
          const nh = hOf(nx, nz);
          if (nh >= h) continue;
          y0 = nh;
        } else if (nc === VOID && dx + dz < 0) continue;
        // 면의 두 아래 귀퉁이 (밖에서 볼 때 반시계)
        let ax: number, az: number, bx: number, bz: number;
        if (dx === 1) [ax, az, bx, bz] = [x + 1, z + 1, x + 1, z];
        else if (dx === -1) [ax, az, bx, bz] = [x, z, x, z + 1];
        else if (dz === 1) [ax, az, bx, bz] = [x, z + 1, x + 1, z + 1];
        else [ax, az, bx, bz] = [x + 1, z, x, z];
        const ua = (dx !== 0 ? az : ax) / 2;
        const ub = (dx !== 0 ? bz : bx) / 2;
        const ys = y0 < 0.01 && h > 1 ? [0, 0.65, h] : [y0, h];
        const base = pos.length / 3;
        for (const y of ys) {
          const c = y0 > 0.01 && y === y0 ? 0.7 : shade(y);
          vert(ax, y, az, dx, dz, ua, y / 2, c);
          vert(bx, y, bz, dx, dz, ub, y / 2, c);
        }
        for (let r = 0; r < ys.length - 1; r++) {
          const a = base + r * 2;
          faces.push(a, a + 1, a + 3, a, a + 3, a + 2);
        }
      }
      // 윗면
      const b = pos.length / 3;
      for (const [px, pz] of [[x, z], [x + 1, z], [x + 1, z + 1], [x, z + 1]] as const) {
        pos.push(px, h, pz);
        nor.push(0, 1, 0);
        uv.push(px / 2, -pz / 2);
        col.push(1, 1, 1);
      }
      caps.push(b, b + 3, b + 2, b, b + 2, b + 1);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex([...faces, ...caps]);
  geo.addGroup(0, faces.length, 0);
  geo.addGroup(faces.length, caps.length, 1);
  return geo;
}
/* ───────────── 화면 정보 (HUD) — 캔버스 판을 직교 카메라로 겹쳐 그린다 ───────────── */

class Panel {
  readonly canvas = document.createElement('canvas');
  readonly g: CanvasRenderingContext2D;
  readonly tex: THREE.CanvasTexture;
  readonly spr: THREE.Sprite;
  constructor(
    readonly cw: number,
    readonly ch: number,
  ) {
    this.canvas.width = cw;
    this.canvas.height = ch;
    this.g = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
    this.spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, depthTest: false, depthWrite: false, toneMapped: false, transparent: true }));
  }
  /** 화면 픽셀 자리 (왼쪽 아래 0,0) — 높이 h 로, 너비는 캔버스 비율대로 */
  place(x: number, y: number, h: number, ax = 0.5, ay = 0.5): void {
    this.spr.center.set(ax, ay);
    this.spr.position.set(x, y, 0);
    this.spr.scale.set((h * this.cw) / this.ch, h, 1);
  }
  get w(): number {
    return this.spr.scale.x;
  }
  get h(): number {
    return this.spr.scale.y;
  }
  /** 화면 점(왼쪽 아래 0,0)을 캔버스 좌표로 */
  toCanvas(px: number, py: number): [number, number] {
    const s = this.spr;
    const x0 = s.position.x - s.center.x * s.scale.x;
    const y0 = s.position.y - s.center.y * s.scale.y;
    return [((px - x0) / s.scale.x) * this.cw, (1 - (py - y0) / s.scale.y) * this.ch];
  }
  up(): void {
    this.tex.needsUpdate = true;
  }
}
class Hud {
  readonly scene = new THREE.Scene();
  readonly cam = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10);
  private list: Panel[] = [];
  private warm = new Warm();
  panel(cw: number, ch: number): Panel {
    const p = new Panel(cw, ch);
    this.list.push(p);
    this.scene.add(p.spr);
    return p;
  }
  draw(r: R, w: number, h: number): void {
    if (!this.warm.ready(r, (rr) => rr.compileAsync(this.scene, this.cam))) return;
    this.cam.right = w;
    this.cam.top = h;
    this.cam.updateProjectionMatrix();
    const ac = r.autoClear;
    r.autoClear = false;
    r.setViewport(0, 0, w, h);
    r.render(this.scene, this.cam);
    r.autoClear = ac;
  }
  dispose(): void {
    for (const p of this.list) {
      p.tex.dispose();
      p.spr.material.dispose();
    }
  }
}
function txt(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, stroke = 0, align: CanvasTextAlign = 'center', weight = 800): void {
  g.font = `${weight} ${size}px ${FONT}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  if (stroke > 0) {
    g.lineJoin = 'round';
    g.lineWidth = stroke;
    g.strokeStyle = 'rgba(8,4,2,0.92)';
    g.strokeText(s, x, y);
  }
  g.fillStyle = color;
  g.fillText(s, x, y);
}
function pill(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient, line?: string, lw = 3): void {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fillStyle = fill;
  g.fill();
  if (line) {
    g.strokeStyle = line;
    g.lineWidth = lw;
    g.stroke();
  }
}
/** 체력 · 마나 구슬 — 금속 테 · 출렁이는 액체 · 유리 반짝 */
function drawOrb(p: Panel, frac: number, hp: boolean, t: number, label: string, hurt: number): void {
  const g = p.g;
  const S = p.cw;
  const c = S / 2;
  const R = S * 0.41;
  g.clearRect(0, 0, S, S);
  const ring = g.createLinearGradient(0, 0, S, S);
  ring.addColorStop(0, '#f2d68a');
  ring.addColorStop(0.35, '#7a5520');
  ring.addColorStop(0.65, '#e0b866');
  ring.addColorStop(1, '#3a2408');
  g.fillStyle = ring;
  g.beginPath();
  g.arc(c, c, R + S * 0.07, 0, TAU);
  g.fill();
  g.strokeStyle = 'rgba(20,10,2,0.9)';
  g.lineWidth = S * 0.012;
  g.stroke();
  g.fillStyle = hp ? '#140606' : '#04060f';
  g.beginPath();
  g.arc(c, c, R, 0, TAU);
  g.fill();
  g.save();
  g.beginPath();
  g.arc(c, c, R, 0, TAU);
  g.clip();
  const top = c + R - clamp(frac, 0, 1) * 2 * R;
  g.beginPath();
  g.moveTo(c - R, S);
  for (let x = c - R; x <= c + R + 1; x += 4) {
    const y = top + Math.sin(x * 0.055 + t * 3.1) * S * 0.013 + Math.sin(x * 0.11 - t * 2.3) * S * 0.007;
    g.lineTo(x, y);
  }
  g.lineTo(c + R, S);
  g.closePath();
  const lg = g.createLinearGradient(0, top, 0, c + R);
  if (hp) {
    lg.addColorStop(0, hurt > 0 ? '#ffd0c0' : '#ff7058');
    lg.addColorStop(0.35, '#d01818');
    lg.addColorStop(1, '#4a0404');
  } else {
    lg.addColorStop(0, '#9cc4ff');
    lg.addColorStop(0.35, '#2a5ae0');
    lg.addColorStop(1, '#0a1250');
  }
  g.fillStyle = lg;
  g.fill();
  // 떠오르는 거품
  g.fillStyle = 'rgba(255,255,255,0.22)';
  for (let i = 0; i < 6; i++) {
    const bx = c - R * 0.6 + ((i * 37) % 100) / 100 * R * 1.2;
    const by = c + R - ((t * 0.25 + i * 0.17) % 1) * (c + R - top);
    if (by > top + 6) {
      g.beginPath();
      g.arc(bx, by, S * (0.008 + (i % 3) * 0.004), 0, TAU);
      g.fill();
    }
  }
  const sh = g.createRadialGradient(c, c, R * 0.55, c, c, R);
  sh.addColorStop(0, 'rgba(0,0,0,0)');
  sh.addColorStop(1, 'rgba(0,0,0,0.6)');
  g.fillStyle = sh;
  g.fillRect(0, 0, S, S);
  g.restore();
  const hl = g.createRadialGradient(c - R * 0.35, c - R * 0.45, 0, c - R * 0.35, c - R * 0.45, R * 0.6);
  hl.addColorStop(0, 'rgba(255,255,255,0.55)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hl;
  g.beginPath();
  g.ellipse(c - R * 0.3, c - R * 0.42, R * 0.48, R * 0.3, -0.6, 0, TAU);
  g.fill();
  txt(g, label, c, c + R * 0.62, S * 0.13, '#fff4e0', S * 0.03);
  p.up();
}
/** 기술 칸 셋 — 그림 · 단축키 · 다시 쓰기 시간 */
const SKILLS = [
  { name: '불덩이', mp: 15, cd: 0.7 },
  { name: '회오리 베기', mp: 20, cd: 2.2 },
  { name: '치유', mp: 25, cd: 5 },
];
function skillIcon(g: CanvasRenderingContext2D, i: number, x: number, y: number, s: number): void {
  const c = s / 2;
  g.save();
  g.translate(x, y);
  const bg = g.createRadialGradient(c, c * 0.8, 0, c, c, s * 0.7);
  if (i === 0) {
    bg.addColorStop(0, '#ffe080');
    bg.addColorStop(0.35, '#ff7a1a');
    bg.addColorStop(1, '#3a0800');
  } else if (i === 1) {
    bg.addColorStop(0, '#d8f0ff');
    bg.addColorStop(0.4, '#3a8ad8');
    bg.addColorStop(1, '#06143a');
  } else {
    bg.addColorStop(0, '#e0ffd8');
    bg.addColorStop(0.4, '#36b84a');
    bg.addColorStop(1, '#042a0a');
  }
  g.fillStyle = bg;
  g.fillRect(0, 0, s, s);
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.lineCap = 'round';
  if (i === 0) {
    g.beginPath();
    g.moveTo(c, s * 0.14);
    g.bezierCurveTo(s * 0.86, s * 0.42, s * 0.82, s * 0.86, c, s * 0.86);
    g.bezierCurveTo(s * 0.18, s * 0.86, s * 0.14, s * 0.5, s * 0.38, s * 0.36);
    g.bezierCurveTo(s * 0.4, s * 0.5, s * 0.46, s * 0.54, s * 0.5, s * 0.5);
    g.bezierCurveTo(s * 0.44, s * 0.36, s * 0.48, s * 0.24, c, s * 0.14);
    g.fillStyle = 'rgba(255,248,210,0.95)';
    g.fill();
  } else if (i === 1) {
    g.lineWidth = s * 0.07;
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      g.arc(c, c, s * (0.14 + k * 0.11), k * 2.1, k * 2.1 + 3.6);
      g.stroke();
    }
  } else {
    g.fillRect(c - s * 0.09, s * 0.2, s * 0.18, s * 0.6);
    g.fillRect(s * 0.2, c - s * 0.09, s * 0.6, s * 0.18);
  }
  g.restore();
}
function drawSkills(p: Panel, cds: number[], mp: number, flash: number[]): void {
  const g = p.g;
  g.clearRect(0, 0, p.cw, p.ch);
  pill(g, 4, 4, p.cw - 8, p.ch - 8, 26, 'rgba(10,8,6,0.72)', 'rgba(216,170,90,0.55)', 3);
  const s = 104;
  SKILLS.forEach((sk, i) => {
    const x = 26 + i * 150;
    const y = 20;
    skillIcon(g, i, x, y, s);
    if (mp < sk.mp) {
      g.fillStyle = 'rgba(0,0,40,0.55)';
      g.fillRect(x, y, s, s);
    }
    const k = cds[i]! / sk.cd;
    if (k > 0) {
      g.fillStyle = 'rgba(0,0,0,0.62)';
      g.beginPath();
      g.moveTo(x + s / 2, y + s / 2);
      g.arc(x + s / 2, y + s / 2, s, -Math.PI / 2, -Math.PI / 2 + k * TAU);
      g.closePath();
      g.save();
      g.beginPath();
      g.rect(x, y, s, s);
      g.clip();
      g.beginPath();
      g.moveTo(x + s / 2, y + s / 2);
      g.arc(x + s / 2, y + s / 2, s, -Math.PI / 2, -Math.PI / 2 + k * TAU);
      g.closePath();
      g.fill();
      g.restore();
    }
    g.strokeStyle = flash[i]! > 0 ? `rgba(255,240,180,${0.5 + flash[i]! * 0.5})` : '#c8a050';
    g.lineWidth = flash[i]! > 0 ? 6 : 4;
    g.strokeRect(x, y, s, s);
    pill(g, x - 8, y - 8, 36, 36, 10, '#2a1c0c', '#e8c070', 2);
    txt(g, String(i + 1), x + 10, y + 10, 24, '#ffe8b0');
    txt(g, sk.name, x + s / 2, y + s + 22, 21, '#f0e0c0', 4, 'center', 700);
  });
  p.up();
}
/** 맞은 숫자 그림 (같은 숫자는 다시 그리지 않는다) */
const numCache = new Map<string, THREE.CanvasTexture>();
function numTex(s: string, kind: 'hit' | 'crit' | 'hurt' | 'heal' | 'gold'): THREE.CanvasTexture {
  const key = kind + s;
  let t = numCache.get(key);
  if (t) return t;
  t = canvasTex(320, 120, (g) => {
    const col = kind === 'crit' ? '#ffd23a' : kind === 'hurt' ? '#ff5a4a' : kind === 'heal' ? '#7aff8a' : kind === 'gold' ? '#ffe070' : '#ffffff';
    txt(g, s, 160, 62, kind === 'crit' ? 76 : 62, col, 12, 'center', 900);
  });
  numCache.set(key, t);
  return t;
}
/* ───────────── 크게 보기 입력 — 화면 캔버스(.hub-canvas)를 크기로 찾아 듣는다 ───────────── */

class Pointer {
  el: HTMLCanvasElement | null = null;
  readonly ndc = new THREE.Vector2();
  /** 캔버스 픽셀 (왼쪽 아래 0,0) */
  px = 0;
  py = 0;
  has = false;
  down = false;
  clicks = 0;
  keys: string[] = [];
  private w = 0;
  private h = 0;
  attach(w: number, h: number): boolean {
    if (this.el) return true;
    if (w < 700) return false;
    for (const c of Array.from(document.querySelectorAll<HTMLCanvasElement>('canvas.hub-canvas')))
      if (c.width === w && c.height === h) {
        this.el = c;
        c.addEventListener('pointerdown', this.onDown);
        c.addEventListener('pointermove', this.onMove);
        c.addEventListener('pointerleave', this.onLeave);
        window.addEventListener('pointerup', this.onUp);
        window.addEventListener('keydown', this.onKey);
        c.style.cursor = 'default';
        c.style.touchAction = 'none';
        return true;
      }
    return false;
  }
  size(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }
  private set(e: PointerEvent): void {
    const r = this.el!.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    this.ndc.set(fx * 2 - 1, -fy * 2 + 1);
    this.px = fx * this.w;
    this.py = (1 - fy) * this.h;
    this.has = true;
  }
  private onDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    this.set(e);
    this.down = true;
    this.clicks++;
    e.preventDefault();
  };
  private onMove = (e: PointerEvent): void => this.set(e);
  private onLeave = (): void => {
    this.has = false;
  };
  private onUp = (): void => {
    this.down = false;
  };
  private onKey = (e: KeyboardEvent): void => {
    const tg = e.target as HTMLElement | null;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
    if (e.key === '1' || e.key === '2' || e.key === '3') {
      this.keys.push(e.key);
      e.preventDefault();
    }
  };
  cursor(c: string): void {
    if (this.el && this.el.style.cursor !== c) this.el.style.cursor = c;
  }
  dispose(): void {
    if (!this.el) return;
    this.el.removeEventListener('pointerdown', this.onDown);
    this.el.removeEventListener('pointermove', this.onMove);
    this.el.removeEventListener('pointerleave', this.onLeave);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('keydown', this.onKey);
    this.el.style.cursor = '';
    this.el = null;
  }
}

/* ───────────── 수학 자물쇠 ───────────── */

interface Quiz {
  q: string;
  ans: number;
  choices: number[];
  wrong: Set<number>;
  ok: number;
  okT: number;
  shake: number;
  autoT: number;
  hover: number;
}
function makeQuiz(r: () => number): Quiz {
  const kind = Math.floor(r() * 3);
  let q: string;
  let ans: number;
  let near: number[];
  if (kind === 0) {
    const a = 3 + Math.floor(r() * 7);
    const b = 3 + Math.floor(r() * 7);
    q = `${a} × ${b} = ?`;
    ans = a * b;
    near = [ans + a, ans - b, ans + 1, ans - 1, a * (b + 1) + 1, ans + 10];
  } else if (kind === 1) {
    const a = 18 + Math.floor(r() * 60);
    const b = 6 + Math.floor(r() * 9);
    q = `${a} + ${b} = ?`;
    ans = a + b;
    near = [ans + 10, ans - 10, ans + 1, ans - 1, ans + 2];
  } else {
    const b = 2 + Math.floor(r() * 8);
    const ans0 = 2 + Math.floor(r() * 8);
    q = `${b * ans0} ÷ ${b} = ?`;
    ans = ans0;
    near = [ans + 1, ans - 1, ans + 2, b, ans * 2];
  }
  const set = new Set<number>([ans]);
  const pool = near.filter((v) => v > 0 && v !== ans);
  while (set.size < 3 && pool.length) set.add(pool.splice(Math.floor(r() * pool.length), 1)[0]!);
  while (set.size < 3) set.add(ans + set.size * 3);
  const choices = [...set];
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [choices[i], choices[j]] = [choices[j]!, choices[i]!];
  }
  return { q, ans, choices, wrong: new Set(), ok: -1, okT: 0, shake: 0, autoT: 0, hover: -1 };
}
const QBTN: [number, number, number, number][] = [
  [70, 330, 260, 130],
  [370, 330, 260, 130],
  [670, 330, 260, 130],
];
function drawQuiz(p: Panel, z: Quiz, auto: boolean): void {
  const g = p.g;
  const W = p.cw;
  const H = p.ch;
  g.clearRect(0, 0, W, H);
  g.save();
  g.translate(Math.sin(z.shake * 40) * z.shake * 18, 0);
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, 'rgba(46,30,16,0.96)');
  bg.addColorStop(1, 'rgba(18,10,6,0.96)');
  pill(g, 10, 10, W - 20, H - 20, 34, bg, '#d8aa5a', 6);
  g.strokeStyle = 'rgba(216,170,90,0.35)';
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect(28, 28, W - 56, H - 56, 24);
  g.stroke();
  txt(g, '보물 상자의 수학 자물쇠', W / 2, 82, 40, '#ffd27a', 6);
  txt(g, z.q, W / 2, 196, 104, '#fff6e2', 12, 'center', 900);
  QBTN.forEach(([x, y, w, h], i) => {
    const v = z.choices[i]!;
    const bad = z.wrong.has(i);
    const good = z.ok === i;
    const hov = z.hover === i && !bad && z.ok < 0;
    const gr = g.createLinearGradient(0, y, 0, y + h);
    if (good) {
      gr.addColorStop(0, '#9af07a');
      gr.addColorStop(1, '#2a8a2a');
    } else if (bad) {
      gr.addColorStop(0, '#5a2420');
      gr.addColorStop(1, '#2a0e0c');
    } else {
      gr.addColorStop(0, hov ? '#f8d890' : '#d8a850');
      gr.addColorStop(1, hov ? '#a86a20' : '#7a4a14');
    }
    pill(g, x, y, w, h, 24, gr, good ? '#eaffd0' : '#2a1606', 5);
    txt(g, String(v), x + w / 2, y + h / 2 + 4, 70, bad ? '#a07060' : '#fff8ea', 8, 'center', 900);
    txt(g, String(i + 1), x + 24, y + 24, 24, 'rgba(255,240,200,0.8)', 4);
    if (bad) {
      g.strokeStyle = '#ff6a50';
      g.lineWidth = 8;
      g.beginPath();
      g.moveTo(x + 40, y + 30);
      g.lineTo(x + w - 40, y + h - 30);
      g.stroke();
    }
  });
  const foot = z.ok >= 0 ? '정답! 자물쇠가 철컥 열려요' : z.wrong.size ? '앗, 다시 생각해 봐요' : auto ? '영웅이 생각하는 중 …' : '알맞은 답을 누르세요 (숫자 1 · 2 · 3)';
  txt(g, foot, W / 2, H - 52, 30, z.ok >= 0 ? '#aaffa0' : z.wrong.size ? '#ffb0a0' : '#e8d8b8', 5, 'center', 700);
  g.restore();
  p.up();
}
/* ═════════════ 한 판 ═════════════ */

const WHITE = new THREE.Color(1, 1, 1);

type MonState = 'idle' | 'alert' | 'chase' | 'attack' | 'back' | 'dead';
interface Mon {
  kind: MonKind;
  md: MonModel;
  hp: number;
  max: number;
  r: number;
  sp: number;
  dmg: [number, number];
  top: number;
  home: THREE.Vector3;
  state: MonState;
  st: number;
  wp: THREE.Vector3 | null;
  wait: number;
  path: [number, number][];
  pathT: number;
  atk: number;
  struck: boolean;
  kb: THREE.Vector3;
  flash: number;
  ph: number;
  yaw: number;
  vis: number;
  bg: THREE.Sprite;
  fill: THREE.Sprite;
  excl: THREE.Sprite;
  exT: number;
  blob: THREE.Mesh;
  deadT: number;
  barShow: number;
}
interface Prop {
  kind: 'pot' | 'crate';
  g: THREE.Group;
  x: number;
  z: number;
  broken: boolean;
  shake: number;
}
interface Chest {
  m: ChestModel;
  x: number;
  z: number;
  solved: boolean;
  open: number;
  glow: THREE.Sprite;
}
type Goal = { k: 'move'; x: number; z: number } | { k: 'mon'; m: Mon } | { k: 'prop'; p: Prop } | { k: 'chest'; c: Chest };
const MON_DEF: { kind: MonKind; x: number; z: number }[] = [
  { kind: 'slime', x: 9.5, z: 17.5 },
  { kind: 'goblin', x: 21.5, z: 5.5 },
  { kind: 'slime', x: 17.2, z: 5.6 },
  { kind: 'goblin', x: 25.2, z: 8.6 },
  { kind: 'boss', x: 24.5, z: 19.5 },
];
const STAT: Record<MonKind, { hp: number; sp: number; r: number; dmg: [number, number]; top: number }> = {
  slime: { hp: 34, sp: 1.8, r: 0.4, dmg: [5, 8], top: 0.95 },
  goblin: { hp: 60, sp: 2.3, r: 0.42, dmg: [7, 11], top: 1.78 },
  boss: { hp: 150, sp: 2.0, r: 0.62, dmg: [11, 16], top: 2.55 },
};
const PROP_DEF: { kind: 'pot' | 'crate'; x: number; z: number }[] = [
  { kind: 'pot', x: 9, z: 2 },
  { kind: 'pot', x: 9, z: 3 },
  { kind: 'crate', x: 2, z: 9 },
  { kind: 'crate', x: 26, z: 1 },
  { kind: 'crate', x: 25, z: 1 },
  { kind: 'pot', x: 16, z: 10 },
  { kind: 'pot', x: 26, z: 10 },
  { kind: 'pot', x: 14, z: 22 },
  { kind: 'pot', x: 15, z: 22 },
  { kind: 'crate', x: 28, z: 22 },
];
const CHEST_DEF: [number, number][] = [
  [2, 2],
  [27, 16],
];
const NP = 700; // 효과 입자 수
const NSH = 48; // 조각 수 (재질마다)
const NCOIN = 90;
const NNUM = 14;
const NRING = 5;
const TRAIL = 12;

function makePlay(T: typeof THREE): Scene3D {
  const t00 = performance.now();
  const perf = { make: 0, upd: 0, n: 0, max: 0, build: 0, ren: 0, rn: 0, calls: 0, tris: 0 };
  const BG = 0x030204;
  const scene = new T.Scene();
  scene.background = new T.Color(BG);
  const fog = new T.Fog(BG, 16, 34);
  scene.fog = fog;
  const cam = new T.PerspectiveCamera(34, 1.6, 0.5, 80);
  const OFF = new T.Vector3(6.3, 11.2, 6.3);
  cam.position.set(START[0] + 0.5, 0, START[1] + 0.5).add(OFF);
  cam.lookAt(START[0] + 0.5, 0, START[1] + 0.5);
  const world = new T.Group();
  scene.add(world);
  const hud = new Hud();
  type PK = 'msg' | 'top' | 'toast' | 'banner' | 'quiz' | 'hp' | 'mp' | 'map' | 'skills' | 'hint';
  /** 처음엔 「만드는 중」 글 판만 — 나머지 판(캔버스)은 짓기 단계에서 */
  const P = { msg: hud.panel(900, 90) } as Record<PK, Panel>;
  const PANELS: [PK, number, number][] = [
    ['top', 900, 84],
    ['toast', 1100, 100],
    ['banner', 1024, 320],
    ['quiz', 1000, 560],
    ['hp', 256, 256],
    ['mp', 256, 256],
    ['map', 300, 300],
    ['skills', 456, 160],
    ['hint', 1400, 64],
  ];
  const setMsg = (s: string): void => {
    const g = P.msg.g;
    g.clearRect(0, 0, 900, 90);
    pill(g, 120, 8, 660, 74, 37, 'rgba(10,8,6,0.8)', 'rgba(216,170,90,0.6)', 3);
    txt(g, s, 450, 46, 38, '#f4e2c0', 0, 'center', 700);
    P.msg.up();
  };

  // 빛 — 어둠은 아주 어둡게, 영웅 등불 · 횃불만 따뜻하게
  scene.add(new T.HemisphereLight(0x2c3858, 0x0a0605, 0.3));
  const moon = new T.DirectionalLight(0x6c88c8, 0.3);
  moon.position.set(-4, 10, 3);
  scene.add(moon);
  const lamp = new T.PointLight(0xffc890, 30, 12.5, 2);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(512, 512);
  lamp.shadow.camera.near = 0.1;
  lamp.shadow.camera.far = 12;
  lamp.shadow.bias = -0.004;
  lamp.shadow.normalBias = 0.03;
  scene.add(lamp);
  const torchL = TORCHES.map(() => {
    const l = new T.PointLight(0xff8a3a, 14, 9, 2);
    scene.add(l);
    return l;
  });

  // 불꽃 · 불티 · 먼지
  const uTime = { value: 0 };
  const uScale = { value: 400 };
  const fp = TORCHES.map(() => new T.Vector3(0, -100, 0));
  const fpReal = TORCHES.map(() => new T.Vector3());
  const lp = [new T.Vector3(), ...TORCHES.map(() => new T.Vector3(0, -100, 0))];
  const geos: THREE.BufferGeometry[] = [];
  const G = <X extends THREE.BufferGeometry>(x: X): X => (geos.push(x), x);
  const pts = (n: number, seedK: number, spread?: (i: number, p: Float32Array) => void): THREE.BufferGeometry => {
    const g = G(new T.BufferGeometry());
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    const tid = new Float32Array(n);
    const rnd = rng(seedK);
    for (let i = 0; i < n; i++) {
      seed[i] = rnd();
      tid[i] = i % NT;
      spread?.(i, pos);
    }
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('seed', new T.BufferAttribute(seed, 1));
    g.setAttribute('tid', new T.BufferAttribute(tid, 1));
    return g;
  };
  const flameMat = pointsMat(FIRE_VS, FIRE_FS, { uTime, uScale, uO: { value: fp }, uMode: { value: 0 } });
  const emberMat = pointsMat(FIRE_VS, FIRE_FS, { uTime, uScale, uO: { value: fp }, uMode: { value: 1 } });
  const dustMat = pointsMat(DUST_VS, DUST_FS, { uTime, uScale, uL: { value: lp } });
  const drnd = rng(77);
  const fx: THREE.Points[] = [
    new T.Points(pts(NT * 40, 11), flameMat),
    new T.Points(pts(NT * 16, 23), emberMat),
    new T.Points(
      pts(520, 37, (i, p) => {
        p[i * 3] = 1 + drnd() * 28;
        p[i * 3 + 1] = 0.2 + drnd() * 2.6;
        p[i * 3 + 2] = 0.5 + drnd() * 23;
      }),
      dustMat,
    ),
  ];
  for (const p of fx) {
    p.frustumCulled = false;
    p.renderOrder = 3;
    scene.add(p);
  }
  const halos = TORCHES.map(() => {
    const a = glowSprite(0xffb060, 0.5, 0.9);
    const b = glowSprite(0xff7a20, 2.2, 0.22);
    scene.add(a, b);
    return [a, b] as const;
  });

  // 효과 입자 (CPU 가 채움)
  const pGeo = G(new T.BufferGeometry());
  const pPos = new Float32Array(NP * 3);
  const pCol = new Float32Array(NP * 3);
  const pSize = new Float32Array(NP);
  const pAlpha = new Float32Array(NP);
  pGeo.setAttribute('position', new T.BufferAttribute(pPos, 3).setUsage(T.DynamicDrawUsage));
  pGeo.setAttribute('aCol', new T.BufferAttribute(pCol, 3).setUsage(T.DynamicDrawUsage));
  pGeo.setAttribute('aSize', new T.BufferAttribute(pSize, 1).setUsage(T.DynamicDrawUsage));
  pGeo.setAttribute('aAlpha', new T.BufferAttribute(pAlpha, 1).setUsage(T.DynamicDrawUsage));
  const partMat = pointsMat(PART_VS, PART_FS, { uScale });
  const partPts = new T.Points(pGeo, partMat);
  partPts.frustumCulled = false;
  partPts.renderOrder = 4;
  scene.add(partPts);
  const pv = new Float32Array(NP * 3);
  const pLife = new Float32Array(NP);
  const pMax = new Float32Array(NP);
  const pS0 = new Float32Array(NP);
  const pGrav = new Float32Array(NP);
  const pDrag = new Float32Array(NP);
  let pNext = 0;
  /** 입자 하나 — 색(r,g,b), 크기, 수명, 중력 */
  const emit = (x: number, y: number, z: number, vx: number, vy: number, vz: number, r: number, g: number, b: number, size: number, life: number, grav = 0, drag = 1.5): void => {
    const i = pNext;
    pNext = (pNext + 1) % NP;
    pPos[i * 3] = x;
    pPos[i * 3 + 1] = y;
    pPos[i * 3 + 2] = z;
    pv[i * 3] = vx;
    pv[i * 3 + 1] = vy;
    pv[i * 3 + 2] = vz;
    pCol[i * 3] = r;
    pCol[i * 3 + 1] = g;
    pCol[i * 3 + 2] = b;
    pS0[i] = size;
    pLife[i] = life;
    pMax[i] = life;
    pGrav[i] = grav;
    pDrag[i] = drag;
  };
  const prnd = rng(999);
  const burst = (x: number, y: number, z: number, n: number, sp: number, col: [number, number, number], size: number, life: number, grav = 6, up = 0.4): void => {
    for (let k = 0; k < n; k++) {
      const a = prnd() * TAU;
      const u = prnd() * 2 - 1 + up;
      const s = sp * (0.35 + prnd() * 0.65);
      const c = Math.sqrt(Math.max(0, 1 - u * u));
      emit(x, y, z, Math.cos(a) * c * s, u * s, Math.sin(a) * c * s, col[0], col[1], col[2], size * (0.6 + prnd() * 0.6), life * (0.6 + prnd() * 0.6), grav, 2);
    }
  };

  // 조각 · 금화 (인스턴스 묶음)
  const shardGeo = G(new T.TetrahedronGeometry(0.11, 0));
  const plankGeo = G(new T.BoxGeometry(0.06, 0.05, 0.3));
  const coinGeo = G(new T.CylinderGeometry(0.075, 0.075, 0.018, 18));
  const shardMat = new T.MeshStandardMaterial({ color: 0xa8643c, roughness: 0.62 });
  const plankMat = new T.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.8 });
  const coinMat = new T.MeshStandardMaterial({ color: 0xffc23a, metalness: 0.8, roughness: 0.28, emissive: 0x5a3400 });
  const mkInst = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number): THREE.InstancedMesh => {
    const im = new T.InstancedMesh(geo, mat, n);
    im.instanceMatrix.setUsage(T.DynamicDrawUsage);
    im.count = 0;
    im.frustumCulled = false;
    im.castShadow = false;
    world.add(im);
    return im;
  };
  interface Bit {
    p: THREE.Vector3;
    v: THREE.Vector3;
    r: THREE.Euler;
    w: THREE.Vector3;
    life: number;
    s: number;
  }
  let shards!: THREE.InstancedMesh[];
  const bits: Bit[][] = [[], []];
  interface Coin {
    p: THREE.Vector3;
    v: THREE.Vector3;
    t: number;
    fly: number;
    spin: number;
  }
  let coinIM!: THREE.InstancedMesh;
  const coins: Coin[] = [];
  const tmpO = new T.Object3D();

  // 숫자 · 느낌표 · 고리 · 칼 자취
  const nums: { s: THREE.Sprite; life: number; max: number; vy: number; k: number }[] = [];
  let numNext = 0;
  let exclTex: THREE.CanvasTexture | null = null;
  let barBgTex: THREE.CanvasTexture | null = null;
  const ringGeo = G(new T.PlaneGeometry(1, 1));
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = (c: number): THREE.MeshBasicMaterial =>
    new T.MeshBasicMaterial({ map: ringTex(), color: c, transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false, opacity: 0 });
  const rings: { m: THREE.Mesh; life: number; max: number; s0: number; s1: number }[] = [];
  let ringNext = 0;
  const ring = (x: number, z: number, col: number, s0: number, s1: number, life: number): void => {
    const r = rings[ringNext]!;
    ringNext = (ringNext + 1) % NRING;
    r.m.position.set(x, 0.05, z);
    (r.m.material as THREE.MeshBasicMaterial).color.setHex(col);
    r.life = r.max = life;
    r.s0 = s0;
    r.s1 = s1;
  };
  let marker!: THREE.Mesh;
  let markerT = 0;
  let hoverRing!: THREE.Mesh;
  const trailGeo = G(new T.BufferGeometry());
  const trPos = new Float32Array(TRAIL * 2 * 3);
  const trA = new Float32Array(TRAIL * 2);
  trailGeo.setAttribute('position', new T.BufferAttribute(trPos, 3).setUsage(T.DynamicDrawUsage));
  trailGeo.setAttribute('aA', new T.BufferAttribute(trA, 1).setUsage(T.DynamicDrawUsage));
  const trIdx: number[] = [];
  for (let i = 0; i < TRAIL - 1; i++) trIdx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  trailGeo.setIndex(trIdx);
  const trailMat = new T.ShaderMaterial({
    vertexShader: 'attribute float aA; varying float vA; void main(){ vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uC; varying float vA; void main(){ gl_FragColor = vec4(uC * vA, vA); }',
    uniforms: { uC: { value: new T.Color(0.75, 0.9, 1.2) } },
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    side: T.DoubleSide,
  });
  let trail!: THREE.Mesh;
  const trailPts: { a: THREE.Vector3; b: THREE.Vector3; age: number }[] = [];
  const fireballs: { core: THREE.Sprite; halo: THREE.Sprite; p: THREE.Vector3; v: THREE.Vector3; life: number }[] = [];
  /** 효과 묶음 — 짓기 단계에서 한 번 */
  function makePools(): void {
    shards = [mkInst(shardGeo, shardMat, NSH), mkInst(plankGeo, plankMat, NSH)];
    coinIM = mkInst(coinGeo, coinMat, NCOIN);
    for (let i = 0; i < NRING; i++) {
      const m = new T.Mesh(ringGeo, ringMat(0xffffff));
      m.renderOrder = 2;
      m.frustumCulled = false;
      scene.add(m);
      rings.push({ m, life: 0, max: 1, s0: 0, s1: 1 });
    }
    marker = new T.Mesh(ringGeo, ringMat(0xffd27a));
    marker.renderOrder = 2;
    hoverRing = new T.Mesh(ringGeo, ringMat(0xff4a3a));
    hoverRing.renderOrder = 2;
    trail = new T.Mesh(trailGeo, trailMat);
    trail.frustumCulled = false;
    trail.renderOrder = 5;
    scene.add(marker, hoverRing, trail);
    for (let i = 0; i < 4; i++) {
      const core = glowSprite(0xfff0b0, 0.55, 1);
      const halo = glowSprite(0xff6a10, 1.9, 0.55);
      scene.add(core, halo);
      fireballs.push({ core, halo, p: new T.Vector3(), v: new T.Vector3(), life: -1 });
    }
  }

  // 시야 안개 텍스처 (R 가 본 곳 · G 지금 보임)
  const fowData = new Uint8Array(MW * MH * 4);
  const fowTex = new T.DataTexture(fowData, MW, MH);
  fowTex.magFilter = fowTex.minFilter = T.LinearFilter;
  fowTex.needsUpdate = true;
  const fowU: FowU = { tex: { value: fowTex }, map: { value: new T.Vector4(0, 0, 1 / MW, 1 / MH) } };
  const patch = (sh: THREE.WebGLProgramParametersWithUniforms): void => fowPatch(sh, fowU);
  const explored = new Float32Array(MW * MH);
  const vis = new Float32Array(MW * MH);
  const visT = new Float32Array(MW * MH);
  let fowOn = true;

  // 판 상태
  const grid = buildGrid();
  const nav = new Nav(grid);
  let HM: HeroModel | null = null;
  let heroBlob: THREE.Mesh | null = null;
  const mons: Mon[] = [];
  const props: Prop[] = [];
  const chests: Chest[] = [];
  const doors: DoorModel[] = [];
  let built = false;
  let live = false;
  let dead = false;
  let texs: THREE.Texture[] = [];
  const job = new Job();
  const warm = new Warm();
  const ptr = new Pointer();
  let big = false;
  let autoToggle = false;
  let torchMul = 1;
  const hero = {
    hp: 120,
    max: 120,
    mp: 60,
    maxMp: 60,
    yaw: 0.8,
    path: [] as [number, number][],
    goal: null as Goal | null,
    pathT: 0,
    swing: -1,
    swingHit: false,
    spin: -1,
    spinHit: false,
    cast: -1,
    hurt: 0,
    deadT: -1,
    walkPh: 0,
    moving: 0,
    cds: [0, 0, 0],
    cdFlash: [0, 0, 0],
  };
  let gold = 0;
  let solved = 0;
  let quiz: Quiz | null = null;
  let quizChest: Chest | null = null;
  let win = false;
  let winT = 0;
  let hitstop = 0;
  let shake = 0;
  let toastT = 0;
  let hudT = 0;
  let thinkT = 0;
  let stuckT = 0;
  const grnd = rng(4242);
  const ignore = new Set<object>();

  /* ── 짓기 (프레임당 3ms) ── */
  function* build(k: Kit): Gen {
    for (const [key, cw, ch] of PANELS) {
      P[key] = hud.panel(cw, ch);
      P[key].spr.visible = false;
    }
    yield;
    for (let i = 0; i < NNUM; i++) {
      const s = new T.Sprite(new T.SpriteMaterial({ map: numTex('0', 'hit'), transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
      s.renderOrder = 20;
      scene.add(s);
      nums.push({ s, life: 0, max: 1, vy: 1, k: 1 });
    }
    exclTex = canvasTex(64, 96, (g) => txt(g, '!', 32, 50, 84, '#ffd23a', 12, 'center', 900));
    barBgTex = canvasTex(128, 20, (g) => pill(g, 1, 1, 126, 18, 6, 'rgba(10,4,4,0.85)', 'rgba(240,200,120,0.85)', 2));
    yield;
    makePools();
    yield;
    const m = makeMats(k);
    mats = m;
    yield;
    for (let z = 0; z < MH; z += 6) {
      const floor = new T.Mesh(floorGeometry(grid, z, Math.min(MH, z + 6)), m.floor);
      floor.receiveShadow = true;
      world.add(floor);
      yield;
    }
    const walls = new T.Mesh(wallGeometry(grid), [m.wall, m.cap]);
    walls.castShadow = walls.receiveShadow = true;
    world.add(walls);
    yield;
    const colG = new T.LatheGeometry(pillarProfile(WALL_H, 0.26), 24);
    for (const [x, z] of PILLARS) {
      const c = new T.Mesh(colG, m.pillar);
      c.position.set(x + 0.5, 0, z + 0.5);
      c.castShadow = c.receiveShadow = true;
      world.add(c);
      const b = blobMesh(1.5, 0.75);
      b.position.set(x + 0.5, 0.01, z + 0.5);
      world.add(b);
    }
    const rug = new T.Mesh(new T.PlaneGeometry(4, 6), m.rug);
    rug.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    rug.position.set(21.5, 0.012, 19.5);
    rug.receiveShadow = true;
    world.add(rug);
    yield;
    // 돌 부스러기 — 벽 가까운 바닥에
    const rr = rng(55);
    const near: [number, number][] = [];
    for (let z = 0; z < MH; z++)
      for (let x = 0; x < MW; x++) {
        if (grid[idx(x, z)] !== FLOOR || nav.doorAt[idx(x, z)]) continue;
        let w = 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inside(x + dx!, z + dz!) && grid[idx(x + dx!, z + dz!)] === WALL) w++;
        if (w) near.push([x, z]);
      }
    yield;
    const rubG = new T.IcosahedronGeometry(0.11, 1);
    const rub = new T.InstancedMesh(rubG, m.stone, 70);
    for (let i = 0; i < 70; i++) {
      const [cx, cz] = near[Math.floor(rr() * near.length)]!;
      const s = 0.5 + rr() * 1.2;
      tmpO.position.set(cx + 0.15 + rr() * 0.7, 0.04 * s, cz + 0.15 + rr() * 0.7);
      tmpO.rotation.set(rr() * 3, rr() * 3, rr() * 3);
      tmpO.scale.set(s, s * 0.6, s * (0.7 + rr() * 0.5));
      tmpO.updateMatrix();
      rub.setMatrixAt(i, tmpO.matrix);
    }
    rub.castShadow = rub.receiveShadow = true;
    rub.computeBoundingSphere();
    world.add(rub);
    yield;
    for (const d of DOORS) {
      const dm = buildDoor(m, d);
      world.add(dm.g);
      doors.push(dm);
      yield;
    }
    TORCHES.forEach((t, i) => {
      const tb = torchBracket(m);
      if (t.d === 'z') tb.g.position.set(t.x + 0.5, 1.85, t.z + 1);
      else {
        tb.g.position.set(t.x + 1, 1.85, t.z + 0.5);
        tb.g.rotation.y = Math.PI / 2;
      }
      world.add(tb.g);
      tb.g.updateMatrixWorld(true);
      tb.flame.getWorldPosition(fpReal[i]!);
    });
    yield;
    const pr = rng(31);
    for (const d of PROP_DEF) {
      const g = d.kind === 'pot' ? buildPot(m) : buildCrate(m);
      g.position.set(d.x + 0.5, 0, d.z + 0.5);
      g.rotation.y = pr() * TAU;
      world.add(g);
      const b = blobMesh(d.kind === 'pot' ? 0.9 : 1.25, 0.7);
      b.position.set(d.x + 0.5, 0.01, d.z + 0.5);
      g.userData.blob = b;
      world.add(b);
      props.push({ kind: d.kind, g, x: d.x, z: d.z, broken: false, shake: 0 });
      yield;
    }
    for (const [x, z] of CHEST_DEF) {
      const cm = buildChest(m);
      cm.g.position.set(x + 0.5, 0, z + 0.5);
      world.add(cm.g);
      const b = blobMesh(1.5, 0.75);
      b.position.set(x + 0.5, 0.01, z + 0.5);
      world.add(b);
      const glow = glowSprite(0xffc040, 1.6, 0.0);
      glow.position.set(x + 0.5, 0.9, z + 0.6);
      scene.add(glow);
      chests.push({ m: cm, x, z, solved: false, open: 0, glow });
      yield;
    }
    HM = yield* buildHero(m);
    HM.root.scale.setScalar(1.15);
    world.add(HM.root);
    heroBlob = blobMesh(1.0, 0.7);
    world.add(heroBlob);
    yield;
    for (const d of MON_DEF) {
      const st = STAT[d.kind];
      const md = d.kind === 'slime' ? buildSlime(m, mons.length === 0 ? 0x5ad86a : 0x46b8e8) : yield* buildGoblin(m, d.kind === 'boss' ? 0x3a62c8 : 0xc4483a, d.kind === 'boss');
      md.root.position.set(d.x, 0, d.z);
      world.add(md.root);
      const blob = blobMesh(st.r * 2.6, 0.72);
      world.add(blob);
      const bg = new T.Sprite(new T.SpriteMaterial({ map: barBgTex!, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
      bg.center.set(0, 0.5);
      bg.renderOrder = 18;
      const fill = new T.Sprite(new T.SpriteMaterial({ color: 0xe8302a, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
      fill.center.set(0, 0.5);
      fill.renderOrder = 19;
      const excl = new T.Sprite(new T.SpriteMaterial({ map: exclTex!, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
      excl.renderOrder = 19;
      scene.add(bg, fill, excl);
      mons.push({
        kind: d.kind,
        md,
        hp: st.hp,
        max: st.hp,
        r: st.r,
        sp: st.sp,
        dmg: st.dmg,
        top: st.top,
        home: new T.Vector3(d.x, 0, d.z),
        state: 'idle',
        st: 0,
        wp: null,
        wait: grnd() * 2,
        path: [],
        pathT: 0,
        atk: -1,
        struck: false,
        kb: new T.Vector3(),
        flash: 0,
        ph: grnd() * 10,
        yaw: grnd() * TAU,
        vis: 0,
        bg,
        fill,
        excl,
        exT: 0,
        blob,
        deadT: 0,
        barShow: 0,
      });
      yield;
    }
    world.traverse((o) => {
      const mm = (o as THREE.Mesh).material;
      if (!mm) return;
      for (const x of Array.isArray(mm) ? mm : [mm]) {
        const s = x as THREE.MeshStandardMaterial & THREE.MeshBasicMaterial;
        if (s.isMeshStandardMaterial || s.isMeshBasicMaterial) s.onBeforeCompile = patch;
      }
    });
    texs = sceneTex(world);
    built = true;
  }
  let kitAsked = false;
  /** 첫 프레임에 받기 시작 (만들기 시간을 짧게) */
  const askKit = (): void => {
    if (kitAsked) return;
    kitAsked = true;
    loadKit().then((k) => {
      if (!dead) job.start(build(k));
    });
  };

  /* ── 작은 도우미 ── */
  const toast = (s: string, col = '#fff0d0'): void => {
    const g = P.toast.g;
    g.clearRect(0, 0, 1100, 100);
    g.font = `800 46px ${FONT}`;
    const tw = Math.min(1060, g.measureText(s).width + 80);
    pill(g, 550 - tw / 2, 10, tw, 80, 40, 'rgba(12,8,6,0.82)', 'rgba(230,190,110,0.7)', 3);
    txt(g, s, 550, 52, 46, col, 0);
    P.toast.up();
    toastT = 2.4;
  };
  const num = (s: string, kind: 'hit' | 'crit' | 'hurt' | 'heal' | 'gold', x: number, y: number, z: number): void => {
    const n = nums[numNext]!;
    numNext = (numNext + 1) % NNUM;
    n.s.material.map = numTex(s, kind);
    n.s.position.set(x + (grnd() - 0.5) * 0.3, y, z + (grnd() - 0.5) * 0.3);
    n.life = n.max = kind === 'crit' ? 1.15 : 0.95;
    n.k = kind === 'crit' ? 1.4 : kind === 'gold' ? 0.8 : 1;
    n.vy = kind === 'hurt' ? 0.8 : 1.3;
    n.s.visible = true;
  };
  const hpos = (): THREE.Vector3 => HM!.root.position;
  const cellOf = (v: THREE.Vector3): number => idx(Math.floor(v.x), Math.floor(v.z));
  /** 지금 보이는 정도 (0~1) */
  const seenAt = (x: number, z: number): number => (fowOn ? vis[idx(Math.floor(x), Math.floor(z))] ?? 0 : 1);

  /* ── 시야 (영웅 칸이 바뀔 때만 다시) ── */
  let visCell = -1;
  let visDirty = true;
  const bfsQ = new Int32Array(MW * MH);
  const seenG = new Uint32Array(MW * MH);
  let seenGen = 1;
  function computeVis(hx: number, hz: number): void {
    visT.fill(0);
    const gen = ++seenGen;
    let qh = 0;
    let qt = 0;
    const s = idx(Math.floor(hx), Math.floor(hz));
    bfsQ[qt++] = s;
    seenG[s] = gen;
    while (qh < qt) {
      const c = bfsQ[qh++]!;
      const cx = c % MW;
      const cz = (c / MW) | 0;
      const v = clamp(1 - (Math.hypot(cx + 0.5 - hx, cz + 0.5 - hz) - 4.8) / 2.6, 0, 1);
      if (v <= 0) continue;
      if (v > visT[c]!) visT[c] = v;
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!inside(cx + dx, cz + dz)) continue;
          const n = idx(cx + dx, cz + dz);
          if (grid[n] === WALL && v > visT[n]!) visT[n] = v;
        }
      const d = nav.doorAt[c]!;
      if (d && !nav.doorOpen[d - 1] && c !== s) continue;
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (!inside(nx, nz)) continue;
          const n = idx(nx, nz);
          if (seenG[n] === gen) continue;
          const gn = grid[n];
          if (gn !== FLOOR && gn !== PILLAR) continue;
          if (dx && dz) {
            const a = grid[idx(cx + dx, cz)];
            const b = grid[idx(cx, cz + dz)];
            if (a === WALL || b === WALL) continue;
          }
          seenG[n] = gen;
          bfsQ[qt++] = n;
        }
    }
  }
  function updateFow(dt: number): void {
    const hp = hpos();
    const hc = cellOf(hp);
    if (hc !== visCell || visDirty) {
      computeVis(hp.x, hp.z);
      visCell = hc;
      visDirty = false;
    }
    const k = 1 - Math.exp(-7 * dt);
    for (let i = 0; i < MW * MH; i++) {
      const v = (vis[i]! += (visT[i]! - vis[i]!) * k);
      const e = Math.max(explored[i]!, Math.min(1, v * 1.6));
      explored[i] = e;
      fowData[i * 4] = fowOn ? e * 255 : 255;
      fowData[i * 4 + 1] = fowOn ? v * 255 : 255;
    }
    fowTex.needsUpdate = true;
  }

  /* ── 처음 상태로 ── */
  const camT = new T.Vector3(START[0] + 0.5, 0, START[1] + 0.5);
  function reset(): void {
    const H = HM!;
    const hp = hpos();
    hp.set(START[0] + 0.5, 0, START[1] + 0.5);
    Object.assign(hero, { hp: hero.max, mp: hero.maxMp, yaw: Math.PI / 4, path: [], goal: null, swing: -1, spin: -1, cast: -1, hurt: 0, deadT: -1, cds: [0, 0, 0] });
    H.root.rotation.set(0, hero.yaw, 0);
    H.body.rotation.set(0, 0, 0);
    for (const m of mons) {
      Object.assign(m, { hp: m.max, state: 'idle', st: 0, wp: null, wait: grnd() * 2, path: [], atk: -1, flash: 0, deadT: 0, barShow: 0, exT: 0 });
      m.kb.set(0, 0, 0);
      m.md.root.position.copy(m.home);
      m.md.root.scale.setScalar(1);
      m.md.root.visible = true;
      m.md.body.rotation.set(0, 0, 0);
      m.md.body.position.set(0, 0, 0);
    }
    for (const p of props) {
      p.broken = false;
      p.g.visible = true;
      (p.g.userData.blob as THREE.Mesh).visible = true;
      nav.block[idx(p.x, p.z)] = 1;
    }
    for (const c of chests) {
      c.solved = false;
      c.open = 0;
      c.m.lid.rotation.x = 0;
      nav.block[idx(c.x, c.z)] = 1;
    }
    for (const d of doors) {
      d.k = 0;
      for (const l of d.leaves) l.rotation.y = 0;
    }
    nav.doorOpen = DOORS.map(() => false);
    explored.fill(0);
    vis.fill(0);
    visT.fill(0);
    visDirty = true;
    coins.length = 0;
    coinIM.count = 0;
    bits[0]!.length = bits[1]!.length = 0;
    shards[0]!.count = shards[1]!.count = 0;
    pLife.fill(0);
    pSize.fill(0);
    for (const f of fireballs) {
      f.life = -1;
      f.core.visible = f.halo.visible = false;
    }
    for (const n of nums) n.s.visible = false;
    for (const r of rings) r.life = 0;
    trailPts.length = 0;
    quiz = null;
    quizChest = null;
    win = false;
    winT = 0;
    gold = 0;
    solved = 0;
    hitstop = shake = 0;
    toastT = 0;
    ignore.clear();
    P.banner.spr.visible = false;
    P.quiz.spr.visible = false;
    camT.copy(hp);
  }

  /* ── 걷기 ── */
  const tryMove = (p: THREE.Vector3, dx: number, dz: number, r: number, mon: boolean): void => {
    if (nav.free(p.x + dx, p.z + dz, r, mon)) {
      p.x += dx;
      p.z += dz;
    } else if (nav.free(p.x + dx, p.z, r, mon)) p.x += dx;
    else if (nav.free(p.x, p.z + dz, r, mon)) p.z += dz;
  };
  /** 한 걸음 — 실제로 움직인 거리 */
  const stepTo = (p: THREE.Vector3, x: number, z: number, sp: number, dt: number, r: number, mon: boolean, out: { yaw: number }): number => {
    const dx = x - p.x;
    const dz = z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) return 0;
    const s = Math.min(d, sp * dt);
    const ox = p.x;
    const oz = p.z;
    tryMove(p, (dx / d) * s, (dz / d) * s, r, mon);
    out.yaw = Math.atan2(dx, dz);
    return Math.hypot(p.x - ox, p.z - oz);
  };
  const follow = (p: THREE.Vector3, path: [number, number][], sp: number, dt: number, r: number, mon: boolean, out: { yaw: number }): number => {
    let moved = 0;
    let rem = sp * dt;
    while (path.length && rem > 1e-5) {
      const [x, z] = path[0]!;
      const dx = x - p.x;
      const dz = z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.06) {
        path.shift();
        continue;
      }
      const s = Math.min(d, rem);
      const ox = p.x;
      const oz = p.z;
      tryMove(p, (dx / d) * s, (dz / d) * s, r, mon);
      out.yaw = Math.atan2(dx, dz);
      const m = Math.hypot(p.x - ox, p.z - oz);
      moved += m;
      rem -= s;
      if (m < s * 0.3) {
        if (m < 1e-4) path.shift();
        break;
      }
    }
    return moved;
  };
  const angTo = (a: number, b: number, rate: number, dt: number): number => {
    let d = b - a;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    return a + d * (1 - Math.exp(-rate * dt));
  };
  /** 막힌 칸(상자 등) 둘레에서 영웅에게 가장 가까운 걸을 칸 */
  const approach = (x: number, z: number): [number, number] | null => {
    const hp = hpos();
    let best: [number, number] | null = null;
    let bd = 1e9;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dz) || !nav.walk(x + dx, z + dz, false)) continue;
        const d = Math.hypot(x + dx + 0.5 - hp.x, z + dz + 0.5 - hp.z) + (dx && dz ? 0.3 : 0);
        if (d < bd) {
          bd = d;
          best = [x + dx, z + dz];
        }
      }
    return best;
  };
  function heroPathTo(x: number, z: number): boolean {
    const hp = hpos();
    let tx = Math.floor(x);
    let tz = Math.floor(z);
    if (!nav.walk(tx, tz, false)) {
      const n = nav.nearest(tx, tz, false);
      if (!n) return false;
      [tx, tz] = n;
      x = tx + 0.5;
      z = tz + 0.5;
    }
    if (nav.clear(hp.x, hp.z, x, z, 0.28, false)) {
      hero.path = [[x, z]];
      return true;
    }
    const p = nav.path(Math.floor(hp.x), Math.floor(hp.z), tx, tz, false);
    if (!p) return false;
    if (p.length) p[p.length - 1] = [x, z];
    hero.path = nav.smooth(hp.x, hp.z, p, 0.28, false);
    return true;
  }

  /* ── 싸움 ── */
  const hdist = (a: THREE.Vector3, x: number, z: number): number => Math.hypot(a.x - x, a.z - z);
  const front = (x: number, z: number): number => {
    const hp = hpos();
    const a = Math.atan2(x - hp.x, z - hp.z) - hero.yaw;
    return Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
  };
  function dropCoins(x: number, y: number, z: number, n: number): void {
    for (let i = 0; i < n && coins.length < NCOIN; i++)
      coins.push({ p: new T.Vector3(x, y, z), v: new T.Vector3((grnd() - 0.5) * 3.4, 3 + grnd() * 2.6, (grnd() - 0.5) * 3.4), t: 0, fly: 0.8 + grnd() * 0.35, spin: grnd() * TAU });
  }
  function hitMon(m: Mon, dmg: number, crit: boolean, fx: number, fz: number, kb: number): void {
    if (m.state === 'dead') return;
    const p = m.md.root.position;
    m.hp -= dmg;
    m.flash = 1;
    m.barShow = 3;
    let dx = p.x - fx;
    let dz = p.z - fz;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    const kk = kb * (m.kind === 'boss' ? 0.35 : 1);
    m.kb.x += dx * kk;
    m.kb.z += dz * kk;
    num(crit ? `${dmg}!` : String(dmg), crit ? 'crit' : 'hit', p.x, m.top + 0.35, p.z);
    burst(p.x - dx * m.r * 0.6, m.top * 0.55, p.z - dz * m.r * 0.6, crit ? 26 : 14, crit ? 7 : 5, [1, 0.86, 0.5], 0.1, 0.38, 9, 0.5);
    if (m.state === 'idle' || m.state === 'back' || m.state === 'alert') {
      m.state = 'chase';
      m.st = 0;
    }
    if (m.hp <= 0) {
      m.hp = 0;
      m.state = 'dead';
      m.deadT = 0;
      const col: [number, number, number] = m.kind === 'slime' ? [0.4, 1, 0.55] : m.kind === 'boss' ? [0.5, 0.6, 1] : [1, 0.5, 0.35];
      burst(p.x, m.top * 0.5, p.z, m.kind === 'boss' ? 70 : 36, 3.2, col, 0.3, 0.9, -0.6, 0.6);
      dropCoins(p.x, m.top * 0.5, p.z, m.kind === 'boss' ? 14 : 4 + Math.floor(grnd() * 3));
      if (m.kind === 'boss') toast('대장 도깨비를 물리쳤어요!', '#ffd27a');
    }
  }
  function breakProp(p: Prop): void {
    if (p.broken) return;
    p.broken = true;
    p.g.visible = false;
    (p.g.userData.blob as THREE.Mesh).visible = false;
    nav.block[idx(p.x, p.z)] = 0;
    const ti = p.kind === 'pot' ? 0 : 1;
    const cx = p.x + 0.5;
    const cz = p.z + 0.5;
    for (let i = 0; i < 13 && bits[ti]!.length < NSH; i++)
      bits[ti]!.push({
        p: new T.Vector3(cx + (grnd() - 0.5) * 0.4, 0.15 + grnd() * 0.45, cz + (grnd() - 0.5) * 0.4),
        v: new T.Vector3((grnd() - 0.5) * 4.6, 2 + grnd() * 3.2, (grnd() - 0.5) * 4.6),
        r: new T.Euler(grnd() * 3, grnd() * 3, grnd() * 3),
        w: new T.Vector3((grnd() - 0.5) * 18, (grnd() - 0.5) * 18, (grnd() - 0.5) * 18),
        life: 1.8 + grnd() * 0.8,
        s: 0.7 + grnd() * 0.8,
      });
    burst(cx, 0.3, cz, 14, 1.6, [0.42, 0.34, 0.26], 0.4, 0.7, -0.4, 0.8);
    if (grnd() < 0.75) dropCoins(cx, 0.4, cz, 1 + Math.floor(grnd() * (p.kind === 'pot' ? 3 : 4)));
    shake = Math.max(shake, 0.1);
    hitstop = Math.max(hitstop, 0.04);
  }
  /** 칼이 닿는 순간 — 앞쪽 부채꼴 안의 괴물 · 소품 */
  function strike(): void {
    const hp = hpos();
    let any = false;
    let crit = false;
    for (const m of mons) {
      if (m.state === 'dead') continue;
      const p = m.md.root.position;
      const d = hdist(hp, p.x, p.z);
      if (d > 1.35 + m.r || front(p.x, p.z) > 1.15) continue;
      const c = grnd() < 0.18;
      const dmg = Math.round((14 + grnd() * 8) * (c ? 2 : 1));
      hitMon(m, dmg, c, hp.x, hp.z, c ? 5.5 : 3.6);
      any = true;
      crit ||= c;
    }
    for (const p of props) if (!p.broken && hdist(hp, p.x + 0.5, p.z + 0.5) < 1.65 && front(p.x + 0.5, p.z + 0.5) < 1.3) breakProp(p);
    if (any) {
      hitstop = Math.max(hitstop, crit ? 0.12 : 0.07);
      shake = Math.max(shake, crit ? 0.24 : 0.13);
    }
  }
  function whirlHit(): void {
    const hp = hpos();
    let any = false;
    for (const m of mons) {
      if (m.state === 'dead') continue;
      const p = m.md.root.position;
      if (hdist(hp, p.x, p.z) > 2.4 + m.r * 0.5) continue;
      const c = grnd() < 0.12;
      hitMon(m, Math.round((16 + grnd() * 8) * (c ? 2 : 1)), c, hp.x, hp.z, 5.2);
      any = true;
    }
    for (const p of props) if (!p.broken && hdist(hp, p.x + 0.5, p.z + 0.5) < 2.0) breakProp(p);
    if (any) hitstop = Math.max(hitstop, 0.07);
    shake = Math.max(shake, 0.16);
  }
  function hurtHero(dmg: number): void {
    if (hero.deadT >= 0) return;
    const hp = hpos();
    hero.hp -= dmg;
    hero.hurt = 1;
    num(String(dmg), 'hurt', hp.x, 2.3, hp.z);
    burst(hp.x, 1.2, hp.z, 10, 3, [1, 0.3, 0.2], 0.09, 0.35, 8, 0.4);
    shake = Math.max(shake, 0.14);
    if (hero.hp <= 0) {
      hero.hp = 0;
      hero.deadT = 0;
      hero.goal = null;
      hero.path = [];
      hero.swing = hero.spin = hero.cast = -1;
      toast('영웅이 쓰러졌어요 … 다시 일어날게요', '#ffb0a0');
    }
  }
  function useSkill(i: number, tx?: number, tz?: number): boolean {
    if (hero.deadT >= 0 || quiz || win || hero.spin >= 0) return false;
    const sk = SKILLS[i]!;
    if (hero.cds[i]! > 0) return false;
    if (hero.mp < sk.mp) {
      if (!autoPlay()) toast('마나가 모자라요', '#a8c8ff');
      return false;
    }
    hero.mp -= sk.mp;
    hero.cds[i] = sk.cd;
    hero.cdFlash[i] = 1;
    const hp = hpos();
    if (i === 0) {
      let dx = Math.sin(hero.yaw);
      let dz = Math.cos(hero.yaw);
      if (tx !== undefined && tz !== undefined) {
        const d = Math.hypot(tx - hp.x, tz - hp.z);
        if (d > 0.1) {
          dx = (tx - hp.x) / d;
          dz = (tz - hp.z) / d;
        }
      }
      hero.yaw = Math.atan2(dx, dz);
      HM!.root.rotation.y = hero.yaw;
      hero.cast = 0;
      hero.swing = -1;
      const f = fireballs.find((q) => q.life < 0);
      if (f) {
        f.p.set(hp.x + dx * 0.6, 1.2, hp.z + dz * 0.6);
        f.v.set(dx * 10, 0, dz * 10);
        f.life = 0;
        f.core.visible = f.halo.visible = true;
      }
    } else if (i === 1) {
      hero.spin = 0;
      hero.spinHit = false;
      hero.swing = -1;
      ring(hp.x, hp.z, 0x6ab8ff, 0.6, 5.4, 0.5);
    } else {
      const add = Math.min(45, hero.max - hero.hp);
      hero.hp += add;
      num(`+${Math.round(add)}`, 'heal', hp.x, 2.4, hp.z);
      ring(hp.x, hp.z, 0x5aff7a, 0.4, 3.2, 0.7);
      for (let k = 0; k < 44; k++) {
        const a = grnd() * TAU;
        const r = 0.2 + grnd() * 0.7;
        emit(hp.x + Math.cos(a) * r, 0.1 + grnd() * 0.6, hp.z + Math.sin(a) * r, 0, 1.2 + grnd() * 1.6, 0, 0.45, 1, 0.55, 0.14, 0.9 + grnd() * 0.5, -0.6, 0.8);
      }
    }
    return true;
  }
  function explode(f: (typeof fireballs)[number]): void {
    const { x, z } = f.p;
    f.life = -1;
    f.core.visible = f.halo.visible = false;
    burst(x, 1.0, z, 46, 6.2, [1, 0.55, 0.16], 0.32, 0.55, 3, 0.3);
    burst(x, 1.0, z, 18, 3.4, [1, 0.92, 0.6], 0.2, 0.32, 1, 0.2);
    ring(x, z, 0xff8a30, 0.3, 4.4, 0.45);
    shake = Math.max(shake, 0.22);
    let any = false;
    for (const m of mons) {
      if (m.state === 'dead') continue;
      const p = m.md.root.position;
      if (hdist(p, x, z) > 2.0 + m.r * 0.5) continue;
      hitMon(m, Math.round(22 + grnd() * 10), false, x, z, 4.4);
      any = true;
    }
    for (const p of props) if (!p.broken && hdist(f.p, p.x + 0.5, p.z + 0.5) < 1.6) breakProp(p);
    if (any) hitstop = Math.max(hitstop, 0.05);
  }

  /* ── 영웅 ── */
  const face = { yaw: 0 };
  const lookAt = (x: number, z: number): void => {
    const hp = hpos();
    hero.yaw = Math.atan2(x - hp.x, z - hp.z);
  };
  const startSwing = (): void => {
    hero.swing = 0;
    hero.swingHit = false;
  };
  function openQuiz(c: Chest): void {
    quiz = makeQuiz(grnd);
    quizChest = c;
    hero.goal = null;
    hero.path = [];
    quizDirty = true;
  }
  let quizDirty = false;
  function heroUpdate(dt: number, t: number): void {
    const H = HM!;
    const hp = hpos();
    hero.hurt = Math.max(0, hero.hurt - dt * 3);
    for (let i = 0; i < 3; i++) {
      hero.cds[i] = Math.max(0, hero.cds[i]! - dt);
      hero.cdFlash[i] = Math.max(0, hero.cdFlash[i]! - dt * 3);
    }
    if (hero.deadT >= 0) {
      hero.deadT += dt;
      H.body.rotation.x = -Math.min(1, hero.deadT * 2.6) * 1.4;
      H.body.position.y = Math.min(1, hero.deadT * 2.6) * 0.15;
      if (hero.deadT > 2.6) {
        hero.deadT = -1;
        hero.hp = hero.max;
        hero.mp = hero.maxMp;
        H.body.rotation.set(0, 0, 0);
        H.body.position.y = 0;
        hp.set(START[0] + 0.5, 0, START[1] + 0.5);
        for (const m of mons) if (m.state !== 'dead') ((m.state = 'back'), (m.path = []));
        burst(hp.x, 0.4, hp.z, 40, 2.4, [1, 0.9, 0.6], 0.16, 1, -1, 0.9);
        toast('다시 일어섰어요!', '#fff0b0');
      }
    } else {
      hero.hp = Math.min(hero.max, hero.hp + 1.6 * dt);
      hero.mp = Math.min(hero.maxMp, hero.mp + 7 * dt);
    }
    if (hero.swing >= 0) {
      hero.swing += dt;
      if (!hero.swingHit && hero.swing >= 0.17) {
        hero.swingHit = true;
        strike();
      }
      if (hero.swing >= 0.42) hero.swing = -1;
    }
    if (hero.spin >= 0) {
      hero.spin += dt;
      if (!hero.spinHit && hero.spin >= 0.16) {
        hero.spinHit = true;
        whirlHit();
      }
      if (hero.spin >= 0.55) hero.spin = -1;
    }
    if (hero.cast >= 0) {
      hero.cast += dt;
      if (hero.cast >= 0.32) hero.cast = -1;
    }
    const busy = hero.swing >= 0 || hero.spin >= 0 || hero.cast >= 0 || hero.deadT >= 0;
    hero.pathT -= dt;
    const g = hero.goal;
    if (g && hero.deadT < 0) {
      if (g.k === 'mon') {
        const m = g.m;
        const p = m.md.root.position;
        if (m.state === 'dead') {
          hero.goal = null;
          hero.path = [];
        } else if (hdist(hp, p.x, p.z) <= 1.0 + m.r) {
          hero.path = [];
          lookAt(p.x, p.z);
          if (!busy && front(p.x, p.z) < 0.6) startSwing();
        } else if (hero.pathT <= 0 || !hero.path.length) {
          hero.pathT = 0.3;
          if (!heroPathTo(p.x, p.z)) hero.goal = null;
        }
      } else if (g.k === 'prop' || g.k === 'chest') {
        const o = g.k === 'prop' ? g.p : g.c;
        const done = g.k === 'prop' ? g.p.broken : g.c.solved;
        const d = hdist(hp, o.x + 0.5, o.z + 0.5);
        if (done) hero.goal = null;
        else if (d <= (g.k === 'prop' ? 1.55 : 1.65)) {
          hero.path = [];
          lookAt(o.x + 0.5, o.z + 0.5);
          if (g.k === 'chest') openQuiz(g.c);
          else if (!busy && front(o.x + 0.5, o.z + 0.5) < 0.6) startSwing();
        } else if (!hero.path.length) {
          const c = approach(o.x, o.z);
          if (!c || !heroPathTo(c[0] + 0.5, c[1] + 0.5)) {
            ignore.add(o);
            hero.goal = null;
          }
        }
      } else if (!hero.path.length) hero.goal = null;
    }
    let moved = 0;
    if (!busy && hero.path.length) {
      moved = follow(hp, hero.path, 3.7, dt, 0.28, false, face);
      hero.yaw = face.yaw;
    }
    // 문 — 가까이 가면 열린다
    DOORS.forEach((d, i) => {
      if (!nav.doorOpen[i] && hdist(hp, d.cx, d.cz) < 2.3) {
        nav.doorOpen[i] = true;
        visDirty = true;
      }
    });
    // 움직임
    hero.moving = damp(hero.moving, moved > 0 ? 1 : 0, 12, dt);
    const sw = hero.moving;
    hero.walkPh += moved * 6.2;
    const ph = hero.walkPh;
    H.root.rotation.y = angTo(H.root.rotation.y, hero.yaw, 16, dt);
    if (hero.deadT < 0) {
      H.legL.rotation.x = Math.sin(ph) * 0.6 * sw;
      H.legR.rotation.x = -Math.sin(ph) * 0.6 * sw;
      H.body.position.y = Math.abs(Math.sin(ph)) * 0.03 * sw;
      let ax = -0.5 + Math.sin(ph) * 0.12 * sw;
      let az = 0;
      let by = 0;
      let alx = -Math.sin(ph) * 0.3 * sw - 0.15;
      if (hero.swing >= 0) {
        const s = hero.swing;
        if (s < 0.17) {
          const k = 1 - Math.pow(1 - s / 0.17, 2);
          ax = lerp(-0.5, -2.75, k);
          by = lerp(0, -0.45, k);
        } else if (s < 0.25) {
          const k = (s - 0.17) / 0.08;
          ax = lerp(-2.75, -0.1, k);
          by = lerp(-0.45, 0.5, k);
        } else {
          const k = (s - 0.25) / 0.17;
          ax = lerp(-0.1, -0.5, k);
          by = lerp(0.5, 0, k);
        }
      } else if (hero.spin >= 0) {
        const k = hero.spin / 0.55;
        by = (1 - Math.pow(1 - k, 2)) * TAU * 2;
        ax = -1.45;
        az = 1.0;
      } else if (hero.cast >= 0) {
        const k = Math.sin((hero.cast / 0.32) * Math.PI);
        ax = lerp(-0.5, -1.7, k);
        alx = lerp(alx, -1.5, k);
      }
      H.armR.rotation.x = ax;
      H.armR.rotation.z = az;
      H.armL.rotation.x = alx;
      H.body.rotation.y = by;
    }
    H.steel.emissive.setRGB(hero.hurt * 0.9, hero.hurt * 0.12, hero.hurt * 0.05);
    // 망토
    const pa = H.cape.geometry.attributes.position!;
    const arr = pa.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const bx = H.capeBase[i]!;
      const by = H.capeBase[i + 1]!;
      const k = Math.max(0, -by / 0.9);
      const pleat = Math.sin(bx * 34 + 0.6) * 0.022 * (0.3 + k);
      arr[i + 2] = -Math.pow(k, 1.4) * (0.1 + 0.2 * sw) + Math.sin(t * 6.5 + k * 4.2 + bx * 3) * 0.045 * k - bx * bx * 1.6 * (1 - k * 0.5) + pleat;
      arr[i] = bx * (0.72 + k * 0.5);
      arr[i + 1] = by - bx * bx * 0.9 * k;
    }
    pa.needsUpdate = true;
    H.cape.geometry.computeVertexNormals();
    heroBlob!.position.set(hp.x, 0.012, hp.z);
    // 칼 자취
    const slashing = (hero.swing > 0.1 && hero.swing < 0.3) || hero.spin >= 0;
    for (const s of trailPts) s.age += dt;
    while (trailPts.length && trailPts[0]!.age > 0.14) trailPts.shift();
    if (slashing && dt > 0) {
      H.root.updateMatrixWorld(true);
      const a = new T.Vector3();
      const b = new T.Vector3();
      H.hilt.getWorldPosition(a);
      H.tip.getWorldPosition(b);
      trailPts.push({ a, b, age: 0 });
      while (trailPts.length > TRAIL) trailPts.shift();
    }
    trailMat.uniforms.uC!.value.setRGB(hero.spin >= 0 ? 0.5 : 0.85, hero.spin >= 0 ? 0.8 : 0.92, 1.25);
  }

  /* ── 괴물 ── */
  const mface = { yaw: 0 };
  function chase(m: Mon, tx: number, tz: number, sp: number, dt: number): number {
    const p = m.md.root.position;
    const r = m.r * 0.7;
    if (nav.clear(p.x, p.z, tx, tz, r, true)) {
      m.path = [];
      const mv = stepTo(p, tx, tz, sp, dt, r, true, mface);
      m.yaw = mface.yaw;
      return mv;
    }
    if (m.pathT <= 0 || !m.path.length) {
      m.pathT = 0.5 + grnd() * 0.2;
      const pth = nav.path(Math.floor(p.x), Math.floor(p.z), Math.floor(tx), Math.floor(tz), true);
      m.path = pth ? nav.smooth(p.x, p.z, pth, r, true) : [];
    }
    const mv = follow(p, m.path, sp, dt, r, true, mface);
    m.yaw = mface.yaw;
    return mv;
  }
  function monUpdate(m: Mon, dt: number): void {
    const md = m.md;
    const p = md.root.position;
    const hp = hpos();
    m.flash = Math.max(0, m.flash - dt * 5);
    m.exT = Math.max(0, m.exT - dt);
    m.barShow = Math.max(0, m.barShow - dt);
    for (const fm of md.flash) {
      const base = (fm.userData.base ??= fm.emissive.clone()) as THREE.Color;
      fm.emissive.copy(base).lerp(WHITE, m.flash * 0.9);
    }
    if (m.state === 'dead') {
      m.deadT += dt;
      const k = Math.min(1, m.deadT / 0.55);
      md.root.scale.setScalar(1 - k * 0.92);
      md.body.rotation.z = k * 1.3;
      md.root.visible = m.deadT < 0.55;
      m.blob.visible = md.root.visible;
      m.bg.visible = m.fill.visible = m.excl.visible = false;
      return;
    }
    if (m.kb.lengthSq() > 1e-4) {
      tryMove(p, m.kb.x * dt, m.kb.z * dt, m.r * 0.7, true);
      m.kb.multiplyScalar(Math.exp(-9 * dt));
    }
    const d = hdist(p, hp.x, hp.z);
    const reach = m.r + 0.75;
    const heroOk = hero.deadT < 0;
    let mv = 0;
    m.st += dt;
    m.pathT -= dt;
    switch (m.state) {
      case 'idle': {
        if (heroOk && d < 6.2 && nav.sight(p.x, p.z, hp.x, hp.z)) {
          m.state = 'alert';
          m.st = 0;
          m.exT = 0.9;
          m.path = [];
          break;
        }
        if (m.wait > 0) {
          m.wait -= dt;
          break;
        }
        if (!m.wp) {
          for (let k = 0; k < 6 && !m.wp; k++) {
            const a = grnd() * TAU;
            const rr = 0.8 + grnd() * 2;
            const x = m.home.x + Math.cos(a) * rr;
            const z = m.home.z + Math.sin(a) * rr;
            if (nav.free(x, z, m.r * 0.7, true) && nav.clear(p.x, p.z, x, z, m.r * 0.7, true)) m.wp = new T.Vector3(x, 0, z);
          }
          if (!m.wp) m.wait = 1;
        } else {
          mv = stepTo(p, m.wp.x, m.wp.z, m.sp * 0.4, dt, m.r * 0.7, true, mface);
          m.yaw = mface.yaw;
          if (hdist(p, m.wp.x, m.wp.z) < 0.1 || mv < 1e-4) {
            m.wp = null;
            m.wait = 1 + grnd() * 2;
          }
        }
        break;
      }
      case 'alert':
        m.yaw = Math.atan2(hp.x - p.x, hp.z - p.z);
        if (m.st > 0.5) ((m.state = 'chase'), (m.st = 0));
        break;
      case 'chase':
        if (!heroOk || d > 12 || hdist(p, m.home.x, m.home.z) > 15) {
          m.state = 'back';
          m.path = [];
        } else if (d <= reach) {
          m.state = 'attack';
          m.atk = 0;
          m.struck = false;
        } else mv = chase(m, hp.x, hp.z, m.sp, dt);
        break;
      case 'attack':
        m.yaw = Math.atan2(hp.x - p.x, hp.z - p.z);
        m.atk += dt;
        if (!m.struck && m.atk >= 0.5) {
          m.struck = true;
          if (heroOk && d <= reach + 0.45) hurtHero(Math.round(m.dmg[0] + grnd() * (m.dmg[1] - m.dmg[0])));
        }
        if (m.atk >= 1.0) {
          m.state = 'chase';
          m.atk = -1;
          m.st = 0;
        }
        break;
      case 'back':
        m.hp = Math.min(m.max, m.hp + 12 * dt);
        if (heroOk && d < 5 && nav.sight(p.x, p.z, hp.x, hp.z)) m.state = 'chase';
        else {
          mv = chase(m, m.home.x, m.home.z, m.sp * 0.8, dt);
          if (hdist(p, m.home.x, m.home.z) < 0.35) ((m.state = 'idle'), (m.wait = 1));
        }
        break;
    }
    // 서로 밀어내기
    for (const o of mons) {
      if (o === m || o.state === 'dead') continue;
      const op = o.md.root.position;
      const dx = p.x - op.x;
      const dz = p.z - op.z;
      const dd = Math.hypot(dx, dz);
      const min = (m.r + o.r) * 0.95;
      if (dd > 1e-3 && dd < min) tryMove(p, (dx / dd) * (min - dd) * 0.5, (dz / dd) * (min - dd) * 0.5, m.r * 0.7, true);
    }
    if (heroOk && d > 1e-3 && d < m.r + 0.32) tryMove(p, ((p.x - hp.x) / d) * (m.r + 0.32 - d), ((p.z - hp.z) / d) * (m.r + 0.32 - d), m.r * 0.7, true);
    // 모습
    md.root.rotation.y = angTo(md.root.rotation.y, m.yaw, 10, dt);
    md.body.rotation.x = -m.flash * 0.3;
    const atkK = m.atk >= 0 ? m.atk : -1;
    if (m.kind === 'slime') {
      m.ph += dt * (mv > 0 ? 10 : 3.2);
      const s = Math.sin(m.ph);
      let sy = 1 + s * (mv > 0 ? 0.12 : 0.05);
      let lift = mv > 0 ? Math.max(0, Math.sin(m.ph * 0.5)) * 0.2 : 0;
      let fwd = 0;
      if (atkK >= 0) {
        if (atkK < 0.5) sy = lerp(1, 0.66, atkK / 0.5);
        else if (atkK < 0.62) {
          const k = (atkK - 0.5) / 0.12;
          sy = lerp(0.66, 1.25, k);
          fwd = k * 0.45;
          lift = k * 0.18;
        } else {
          const k = Math.min(1, (atkK - 0.62) / 0.3);
          sy = lerp(1.25, 1, k);
          fwd = (1 - k) * 0.45;
          lift = (1 - k) * 0.18;
        }
      }
      md.body.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
      md.body.position.set(0, lift, fwd);
    } else {
      m.ph += mv * 7;
      const sw = mv > 0 ? 1 : 0;
      md.legL!.rotation.x = Math.sin(m.ph) * 0.65 * sw;
      md.legR!.rotation.x = -Math.sin(m.ph) * 0.65 * sw;
      md.armL!.rotation.x = -0.2 - Math.sin(m.ph) * 0.35 * sw;
      md.body.position.y = Math.abs(Math.sin(m.ph)) * 0.04 * sw;
      let ax = -0.6 + Math.sin(m.ph) * 0.2 * sw;
      if (atkK >= 0) {
        if (atkK < 0.5) ax = lerp(-0.6, -2.8, 1 - Math.pow(1 - atkK / 0.5, 2));
        else if (atkK < 0.6) ax = lerp(-2.8, -0.1, (atkK - 0.5) / 0.1);
        else ax = lerp(-0.1, -0.6, Math.min(1, (atkK - 0.6) / 0.35));
      } else if (m.state === 'alert') ax = -2.2;
      md.armR!.rotation.x = ax;
    }
    m.blob.position.set(p.x, 0.012, p.z);
    // 보이기 · 체력 막대
    m.vis = seenAt(p.x, p.z);
    const show = m.vis > 0.3;
    md.root.visible = m.blob.visible = show;
    const barOn = show && (m.barShow > 0 || m.state === 'chase' || m.state === 'attack' || m.state === 'alert' || m.hp < m.max);
    m.bg.visible = m.fill.visible = barOn;
    const W = m.kind === 'boss' ? 1.4 : 0.95;
    const y = m.top + 0.12;
    if (barOn) {
      m.bg.position.set(p.x - camR.x * W * 0.5, y, p.z - camR.z * W * 0.5);
      m.bg.scale.set(W, 0.15, 1);
      const f = clamp(m.hp / m.max, 0, 1);
      m.fill.position.set(p.x - camR.x * (W * 0.5 - 0.035), y, p.z - camR.z * (W * 0.5 - 0.035));
      m.fill.scale.set(Math.max(0.001, (W - 0.07) * f), 0.075, 1);
      m.fill.material.color.setHex(f > 0.5 ? 0xe8302a : f > 0.25 ? 0xf07a1a : 0xffc020);
    }
    m.excl.visible = show && m.exT > 0;
    if (m.excl.visible) {
      const k = m.exT > 0.72 ? 1 + ((m.exT - 0.72) / 0.18) * 0.8 : 1;
      m.excl.position.set(p.x, y + 0.5 + (0.9 - m.exT) * 0.15, p.z);
      m.excl.scale.set(0.3 * k, 0.45 * k, 1);
    }
  }

  /* ── 효과 (불덩이 · 금화 · 조각 · 입자 · 숫자 · 고리) ── */
  function effects(dt: number, rdt: number, t: number): void {
    for (const f of fireballs) {
      if (f.life < 0) continue;
      f.life += dt;
      const ox = f.p.x;
      const oz = f.p.z;
      f.p.addScaledVector(f.v, dt);
      for (let k = 0; k < 3 && dt > 0; k++)
        emit(f.p.x + (grnd() - 0.5) * 0.15, f.p.y + (grnd() - 0.5) * 0.15, f.p.z + (grnd() - 0.5) * 0.15, -f.v.x * 0.05, 0.5 + grnd() * 0.6, -f.v.z * 0.05, 1, 0.5 + grnd() * 0.3, 0.12, 0.26, 0.45, -0.5, 2);
      f.core.position.copy(f.p);
      f.halo.position.copy(f.p);
      const fl = 0.9 + Math.sin(t * 40) * 0.1;
      f.core.scale.setScalar(0.6 * fl);
      f.halo.scale.setScalar(2.0 * fl);
      let hit = f.life > 1.4;
      for (const m of mons) if (m.state !== 'dead' && hdist(f.p, m.md.root.position.x, m.md.root.position.z) < m.r + 0.35) hit = true;
      const c = cellOf(f.p);
      const gc = grid[c];
      const dr = nav.doorAt[c]!;
      if (gc !== FLOOR && gc !== PILLAR) ((hit = true), f.p.set(ox, f.p.y, oz));
      if (dr && !nav.doorOpen[dr - 1]) hit = true;
      const ci = props.find((p) => !p.broken && p.x === Math.floor(f.p.x) && p.z === Math.floor(f.p.z));
      if (ci) hit = true;
      if (hit) explode(f);
    }
    // 금화 — 튀어 올랐다가 영웅에게 끌려온다
    const hp = hpos();
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i]!;
      c.t += dt;
      if (c.t < c.fly) {
        c.v.y -= 14 * dt;
        c.p.addScaledVector(c.v, dt);
        if (c.p.y < 0.05) {
          c.p.y = 0.05;
          c.v.y *= -0.45;
          c.v.x *= 0.7;
          c.v.z *= 0.7;
        }
      } else if (dt > 0) {
        const dx = hp.x - c.p.x;
        const dy = 0.9 - c.p.y;
        const dz = hp.z - c.p.z;
        const d = Math.hypot(dx, dy, dz);
        const sp = Math.min(d / dt, 3 + (c.t - c.fly) * 16);
        if (d < 0.3) {
          gold++;
          emit(hp.x, 1.0, hp.z, (grnd() - 0.5) * 2, 1.5, (grnd() - 0.5) * 2, 1, 0.85, 0.3, 0.18, 0.4, 2, 2);
          coins.splice(i, 1);
          continue;
        }
        c.p.x += (dx / d) * sp * dt;
        c.p.y += (dy / d) * sp * dt;
        c.p.z += (dz / d) * sp * dt;
      }
      tmpO.position.copy(c.p);
      tmpO.rotation.set(c.t < c.fly ? c.t * 9 : Math.PI / 2, c.spin + c.t * 6, 0);
      tmpO.scale.setScalar(1);
      tmpO.updateMatrix();
      coinIM.setMatrixAt(i, tmpO.matrix);
    }
    coinIM.count = coins.length;
    coinIM.instanceMatrix.needsUpdate = true;
    // 조각
    bits.forEach((list, ti) => {
      for (let i = list.length - 1; i >= 0; i--) {
        const b = list[i]!;
        b.life -= dt;
        if (b.life <= 0) {
          list.splice(i, 1);
          continue;
        }
        b.v.y -= 12 * dt;
        b.p.addScaledVector(b.v, dt);
        if (b.p.y < 0.04 * b.s) {
          b.p.y = 0.04 * b.s;
          b.v.y *= -0.3;
          b.v.x *= 0.55;
          b.v.z *= 0.55;
          b.w.multiplyScalar(0.55);
        }
        b.r.x += b.w.x * dt;
        b.r.y += b.w.y * dt;
        b.r.z += b.w.z * dt;
      }
      const im = shards[ti]!;
      list.forEach((b, i) => {
        tmpO.position.copy(b.p);
        tmpO.rotation.copy(b.r);
        tmpO.scale.setScalar(b.s * Math.min(1, b.life / 0.4));
        tmpO.updateMatrix();
        im.setMatrixAt(i, tmpO.matrix);
      });
      im.count = list.length;
      im.instanceMatrix.needsUpdate = true;
    });
    // 입자
    for (let i = 0; i < NP; i++) {
      if (pLife[i]! <= 0) {
        pSize[i] = 0;
        continue;
      }
      pLife[i]! -= dt;
      const k = Math.max(0, pLife[i]! / pMax[i]!);
      const dr = Math.exp(-pDrag[i]! * dt);
      pv[i * 3]! *= dr;
      pv[i * 3 + 1] = pv[i * 3 + 1]! * dr - pGrav[i]! * dt;
      pv[i * 3 + 2]! *= dr;
      pPos[i * 3]! += pv[i * 3]! * dt;
      pPos[i * 3 + 1]! += pv[i * 3 + 1]! * dt;
      pPos[i * 3 + 2]! += pv[i * 3 + 2]! * dt;
      if (pPos[i * 3 + 1]! < 0.02) {
        pPos[i * 3 + 1] = 0.02;
        pv[i * 3 + 1] = Math.abs(pv[i * 3 + 1]!) * 0.3;
      }
      pSize[i] = pS0[i]! * (0.4 + 0.6 * k);
      pAlpha[i] = Math.min(1, k * 1.6);
    }
    for (const a of ['position', 'aCol', 'aSize', 'aAlpha']) pGeo.attributes[a]!.needsUpdate = true;
    // 숫자
    for (const n of nums) {
      if (!n.s.visible) continue;
      n.life -= rdt;
      if (n.life <= 0) {
        n.s.visible = false;
        continue;
      }
      const age = n.max - n.life;
      n.s.position.y += n.vy * rdt * (age < 0.15 ? 2.2 : 0.7);
      const pop = age < 0.1 ? 1 + (1 - age / 0.1) * 0.7 : 1;
      n.s.scale.set(1.15 * n.k * pop, 0.43 * n.k * pop, 1);
      n.s.material.opacity = Math.min(1, n.life / 0.3);
    }
    for (const r of rings) {
      const mat = r.m.material as THREE.MeshBasicMaterial;
      if (r.life <= 0) {
        mat.opacity = 0;
        r.m.visible = false;
        continue;
      }
      r.m.visible = true;
      r.life -= rdt;
      const k = 1 - Math.max(0, r.life) / r.max;
      const s = lerp(r.s0, r.s1, 1 - Math.pow(1 - k, 3));
      r.m.scale.set(s, 1, s);
      mat.opacity = (1 - k) * 0.95;
    }
    // 칼 자취 띠
    const n = trailPts.length;
    trail.visible = n >= 2;
    if (n >= 2) {
      for (let i = 0; i < TRAIL; i++) {
        const s = trailPts[Math.min(n - 1, Math.max(0, n - TRAIL + i))]!;
        trPos.set([s.a.x, s.a.y, s.a.z], i * 6);
        trPos.set([s.b.x, s.b.y, s.b.z], i * 6 + 3);
        const al = i < TRAIL - n ? 0 : Math.max(0, 1 - s.age / 0.14) * ((i - (TRAIL - n)) / Math.max(1, n - 1));
        trA[i * 2] = al * 0.15;
        trA[i * 2 + 1] = al * 0.95;
      }
      trailGeo.attributes.position!.needsUpdate = true;
      trailGeo.attributes.aA!.needsUpdate = true;
    }
    // 보물 상자 뚜껑 · 빛
    for (const c of chests) {
      if (c.solved && c.open < 1) c.open = Math.min(1, c.open + dt * 1.8);
      const e = c.open;
      c.m.lid.rotation.x = -(1 - Math.pow(1 - e, 3)) * 1.95;
      const sh = c.solved ? 0 : 1;
      c.glow.material.opacity = c.solved ? e * (0.55 + 0.15 * Math.sin(t * 4)) : sh * (0.12 + 0.08 * Math.sin(t * 3)) * (explored[idx(c.x, c.z)] ?? 0);
    }
    // 문
    doors.forEach((d, i) => {
      if (nav.doorOpen[i] && d.k < 1) d.k = Math.min(1, d.k + dt * 1.6);
      const a = (1 - Math.pow(1 - d.k, 2)) * 1.5;
      const sx = DOORS[i]!.axis === 'x' ? 1 : -1;
      d.leaves[0]!.rotation.y = sx * a;
      d.leaves[1]!.rotation.y = -sx * a;
    });
    // 누른 곳 표시 · 겨눈 괴물 고리
    markerT = Math.max(0, markerT - rdt);
    marker.visible = markerT > 0;
    if (marker.visible) {
      const k = markerT / 0.6;
      marker.scale.setScalar(0.35 + k * 0.6);
      (marker.material as THREE.MeshBasicMaterial).opacity = k;
    }
  }

  /* ── 수학 자물쇠 ── */
  function answer(i: number): void {
    if (!quiz || quiz.ok >= 0 || quiz.wrong.has(i) || i < 0 || i > 2) return;
    if (quiz.choices[i] === quiz.ans) {
      quiz.ok = i;
      quiz.okT = 0;
      toast('정답! 자물쇠가 열려요', '#aaffa0');
    } else {
      quiz.wrong.add(i);
      quiz.shake = 1;
      toast('앗, 다시 생각해 봐요', '#ffb0a0');
    }
    quizDirty = true;
  }
  function quizStep(rdt: number): void {
    if (!quiz) return;
    if (quiz.shake > 0) {
      quiz.shake = Math.max(0, quiz.shake - rdt * 2.4);
      quizDirty = true;
    }
    if (quiz.ok >= 0) {
      quiz.okT += rdt;
      if (quiz.okT > 0.9) {
        const c = quizChest!;
        c.solved = true;
        solved++;
        const cx = c.x + 0.5;
        const cz = c.z + 0.5;
        dropCoins(cx, 0.7, cz, 16);
        burst(cx, 0.8, cz, 50, 4, [1, 0.85, 0.35], 0.16, 1.1, 3, 1.2);
        hero.hp = hero.max;
        hero.mp = hero.maxMp;
        toast('보물 획득! 체력 · 마나가 가득 찼어요', '#ffe08a');
        quiz = null;
        quizChest = null;
        P.quiz.spr.visible = false;
        return;
      }
    } else if (autoPlay()) {
      quiz.autoT += rdt;
      if (quiz.autoT > 1.7) answer(quiz.choices.indexOf(quiz.ans));
    }
  }

  /* ── 자동 플레이 (카드) ── */
  const autoPlay = (): boolean => !big || autoToggle;
  function frontier(): [number, number] | null {
    const hp = hpos();
    const gen = ++seenGen;
    let qh = 0;
    let qt = 0;
    const s = cellOf(hp);
    bfsQ[qt++] = s;
    seenG[s] = gen;
    while (qh < qt) {
      const c = bfsQ[qh++]!;
      if (explored[c]! < 0.25) return [c % MW, (c / MW) | 0];
      const cx = c % MW;
      const cz = (c / MW) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (!nav.walk(nx, nz, false)) continue;
        const n = idx(nx, nz);
        if (seenG[n] === gen) continue;
        seenG[n] = gen;
        bfsQ[qt++] = n;
      }
    }
    return null;
  }
  function think(): void {
    if (hero.deadT >= 0 || quiz || win) return;
    const hp = hpos();
    let best: Mon | null = null;
    let bd = 1e9;
    let close = 0;
    for (const m of mons) {
      if (m.state === 'dead') continue;
      const p = m.md.root.position;
      const d = hdist(hp, p.x, p.z);
      if (d < 2.4) close++;
      const engaged = m.state === 'chase' || m.state === 'attack' || m.state === 'alert';
      if (((engaged && d < 9) || (seenAt(p.x, p.z) > 0.35 && d < 7.5 && nav.sight(hp.x, hp.z, p.x, p.z))) && d < bd) {
        bd = d;
        best = m;
      }
    }
    if (hero.hp < hero.max * 0.45) useSkill(2);
    if (close >= 2) useSkill(1);
    if (best) {
      const p = best.md.root.position;
      if (bd > 3.2 && nav.sight(hp.x, hp.z, p.x, p.z) && grnd() < 0.45) useSkill(0, p.x, p.z);
      if (!(hero.goal?.k === 'mon' && hero.goal.m === best)) {
        hero.goal = { k: 'mon', m: best };
        hero.path = [];
        hero.pathT = 0;
      }
      return;
    }
    if (hero.goal && (hero.goal.k !== 'move' || hero.path.length)) return;
    let tgt: Goal | null = null;
    bd = 10;
    for (const c of chests) {
      if (c.solved || ignore.has(c) || explored[idx(c.x, c.z)]! < 0.5) continue;
      const d = hdist(hp, c.x + 0.5, c.z + 0.5);
      if (d < bd) ((bd = d), (tgt = { k: 'chest', c }));
    }
    for (const p of props) {
      if (p.broken || ignore.has(p) || explored[idx(p.x, p.z)]! < 0.5) continue;
      const d = hdist(hp, p.x + 0.5, p.z + 0.5);
      if (d < bd) ((bd = d), (tgt = { k: 'prop', p }));
    }
    if (tgt) {
      hero.goal = tgt;
      hero.path = [];
      return;
    }
    const f = frontier();
    if (f) {
      hero.goal = { k: 'move', x: f[0] + 0.5, z: f[1] + 0.5 };
      if (!heroPathTo(f[0] + 0.5, f[1] + 0.5)) hero.goal = null;
      return;
    }
    for (const m of mons) if (m.state !== 'dead') return void (hero.goal = { k: 'mon', m });
  }

  /* ── 직접 플레이 입력 (크게 보기) ── */
  let mats: Mats | null = null;
  const camR = new T.Vector3(1, 0, 0);
  const ray = new T.Raycaster();
  const plane = new T.Plane(new T.Vector3(0, 1, 0), 0);
  const gp = new T.Vector3();
  const cen = new T.Vector3();
  let heldT = 0;
  let repathT = 0;
  const ground = (): boolean => {
    ray.setFromCamera(ptr.ndc, cam);
    return !!ray.ray.intersectPlane(plane, gp);
  };
  function pick(): Mon | Prop | Chest | null {
    ray.setFromCamera(ptr.ndc, cam);
    let best: Mon | Prop | Chest | null = null;
    let bt = 1e9;
    const test = (o: Mon | Prop | Chest, x: number, y: number, z: number, r: number): void => {
      cen.set(x, y, z);
      if (ray.ray.distanceSqToPoint(cen) > r * r) return;
      const d = ray.ray.origin.distanceTo(cen);
      if (d < bt) ((bt = d), (best = o));
    };
    for (const m of mons) if (m.state !== 'dead' && m.vis > 0.3) test(m, m.md.root.position.x, m.top * 0.5, m.md.root.position.z, m.r + 0.3 + m.top * 0.15);
    for (const p of props) if (!p.broken && explored[idx(p.x, p.z)]! > 0.3) test(p, p.x + 0.5, 0.35, p.z + 0.5, 0.55);
    for (const c of chests) if (!c.solved && explored[idx(c.x, c.z)]! > 0.3) test(c, c.x + 0.5, 0.45, c.z + 0.5, 0.75);
    return best;
  }
  const isMon = (o: unknown): o is Mon => !!o && (o as Mon).md !== undefined;
  const isChest = (o: unknown): o is Chest => !!o && (o as Chest).m !== undefined && (o as Chest).glow !== undefined;
  function click(): void {
    if (quiz) {
      const [cx, cy] = P.quiz.toCanvas(ptr.px, ptr.py);
      QBTN.forEach(([x, y, w, h], i) => {
        if (cx >= x && cx <= x + w && cy >= y && cy <= y + h) answer(i);
      });
      return;
    }
    if (win) {
      if (winT > 1.2) reset();
      return;
    }
    if (hero.deadT >= 0) return;
    const o = pick();
    if (isMon(o)) {
      hero.goal = { k: 'mon', m: o };
      hero.path = [];
      hero.pathT = 0;
    } else if (isChest(o)) {
      hero.goal = { k: 'chest', c: o };
      hero.path = [];
    } else if (o) {
      hero.goal = { k: 'prop', p: o as Prop };
      hero.path = [];
    } else if (ground()) {
      if (heroPathTo(gp.x, gp.z)) {
        hero.goal = { k: 'move', x: gp.x, z: gp.z };
        marker.position.set(gp.x, 0.04, gp.z);
        markerT = 0.6;
      }
    }
    heldT = 0;
  }
  let hovered: Mon | Prop | Chest | null = null;
  function input(rdt: number): void {
    const manual = !autoPlay();
    if (!manual) {
      ptr.clicks = 0;
      ptr.keys.length = 0;
      hovered = null;
    } else {
      hovered = ptr.has && !quiz ? pick() : null;
      ptr.cursor(quiz ? 'pointer' : hovered ? 'pointer' : 'default');
      if (quiz && ptr.has) {
        const [cx, cy] = P.quiz.toCanvas(ptr.px, ptr.py);
        let hv = -1;
        QBTN.forEach(([x, y, w, h], i) => {
          if (cx >= x && cx <= x + w && cy >= y && cy <= y + h) hv = i;
        });
        if (hv !== quiz.hover) ((quiz.hover = hv), (quizDirty = true));
      }
      while (ptr.clicks > 0) {
        ptr.clicks--;
        click();
      }
      if (ptr.down && hero.goal?.k === 'move' && !quiz) {
        heldT += rdt;
        repathT -= rdt;
        if (heldT > 0.25 && repathT <= 0 && ground()) {
          repathT = 0.15;
          if (heroPathTo(gp.x, gp.z)) hero.goal = { k: 'move', x: gp.x, z: gp.z };
        }
      }
      for (const k of ptr.keys.splice(0)) {
        const i = Number(k) - 1;
        if (quiz) answer(i);
        else if (isMon(hovered)) useSkill(i, hovered.md.root.position.x, hovered.md.root.position.z);
        else if (ptr.has && ground()) useSkill(i, gp.x, gp.z);
        else useSkill(i);
      }
    }
    // 겨눈 괴물 고리
    const tm = isMon(hovered) ? hovered : hero.goal?.k === 'mon' ? hero.goal.m : null;
    hoverRing.visible = !!tm && tm.state !== 'dead' && tm.vis > 0.3;
    if (tm && hoverRing.visible) {
      const p = tm.md.root.position;
      hoverRing.position.set(p.x, 0.03, p.z);
      hoverRing.scale.setScalar(tm.r * 3.4);
      (hoverRing.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.25 * Math.sin(performance.now() / 120);
    }
  }

  /* ── 화면 정보 ── */
  let topKey = '';
  let mapT = 0;
  function drawMap(): void {
    const g = P.map.g;
    const W = P.map.cw;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, W);
    pill(g, 3, 3, W - 6, W - 6, 26, 'rgba(8,6,4,0.55)', 'rgba(216,170,90,0.5)', 3);
    g.save();
    g.beginPath();
    g.roundRect(8, 8, W - 16, W - 16, 22);
    g.clip();
    // 화면과 같은 방향으로 (쿼터뷰 45° 돌린 지도), 영웅이 가운데
    const hp0 = hpos();
    const s = W / 24;
    g.translate(W / 2, W / 2);
    g.rotate(Math.PI / 4);
    g.scale(s, s);
    g.translate(-hp0.x, -hp0.z);
    for (let z = 0; z < MH; z++)
      for (let x = 0; x < MW; x++) {
        const i = idx(x, z);
        const e = fowOn ? explored[i]! : 1;
        if (e < 0.05) continue;
        const gc = grid[i];
        const v = fowOn ? vis[i]! : 0.5;
        if (gc === FLOOR || gc === PILLAR) {
          g.fillStyle = `rgba(${(120 + v * 70) | 0},${(102 + v * 60) | 0},${(80 + v * 40) | 0},${0.35 + 0.5 * e})`;
          g.fillRect(x, z, 1.02, 1.02);
        } else if (gc === WALL) {
          g.fillStyle = `rgba(236,206,146,${0.9 * e})`;
          g.fillRect(x, z, 1.02, 1.02);
        }
      }
    DOORS.forEach((d, i) => {
      if (nav.doorOpen[i] || explored[idx(d.cells[0]![0], d.cells[0]![1])]! < 0.3) return;
      g.fillStyle = '#c07a3a';
      if (d.axis === 'x') g.fillRect(d.cx - 0.15, d.cz - 1, 0.3, 2);
      else g.fillRect(d.cx - 1, d.cz - 0.15, 2, 0.3);
    });
    for (const p of props)
      if (!p.broken && explored[idx(p.x, p.z)]! > 0.3) {
        g.fillStyle = '#d8b888';
        g.fillRect(p.x + 0.3, p.z + 0.3, 0.4, 0.4);
      }
    for (const c of chests)
      if (!c.solved && explored[idx(c.x, c.z)]! > 0.3) {
        g.fillStyle = '#ffd040';
        g.fillRect(c.x + 0.15, c.z + 0.15, 0.7, 0.7);
      }
    for (const m of mons) {
      if (m.state === 'dead' || m.vis < 0.3) continue;
      const p = m.md.root.position;
      g.fillStyle = '#ff4a3a';
      g.beginPath();
      g.arc(p.x, p.z, m.kind === 'boss' ? 0.6 : 0.42, 0, TAU);
      g.fill();
    }
    const hp = hpos();
    const dx = Math.sin(hero.yaw);
    const dz = Math.cos(hero.yaw);
    g.fillStyle = '#fff2b0';
    g.strokeStyle = '#3a2408';
    g.lineWidth = 0.15;
    g.beginPath();
    g.moveTo(hp.x + dx * 0.9, hp.z + dz * 0.9);
    g.lineTo(hp.x - dx * 0.5 + dz * 0.55, hp.z - dz * 0.5 - dx * 0.55);
    g.lineTo(hp.x - dx * 0.5 - dz * 0.55, hp.z - dz * 0.5 + dx * 0.55);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    g.setTransform(1, 0, 0, 1, 0, 0);
    P.map.up();
  }
  function drawBanner(): void {
    const g = P.banner.g;
    const W = P.banner.cw;
    const H = P.banner.ch;
    g.clearRect(0, 0, W, H);
    const rib = g.createLinearGradient(0, 0, W, 0);
    rib.addColorStop(0, 'rgba(20,10,4,0)');
    rib.addColorStop(0.18, 'rgba(30,16,6,0.88)');
    rib.addColorStop(0.82, 'rgba(30,16,6,0.88)');
    rib.addColorStop(1, 'rgba(20,10,4,0)');
    g.fillStyle = rib;
    g.fillRect(0, 40, W, H - 80);
    g.fillStyle = 'rgba(216,170,90,0.8)';
    g.fillRect(W * 0.12, 44, W * 0.76, 3);
    g.fillRect(W * 0.12, H - 47, W * 0.76, 3);
    g.font = `900 132px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 16;
    g.strokeStyle = '#1a0c02';
    g.strokeText('던전 정복!', W / 2, 140);
    const gold2 = g.createLinearGradient(0, 80, 0, 200);
    gold2.addColorStop(0, '#fff6c8');
    gold2.addColorStop(0.5, '#ffc83a');
    gold2.addColorStop(1, '#c47a10');
    g.fillStyle = gold2;
    g.fillText('던전 정복!', W / 2, 140);
    txt(g, `괴물 ${mons.length} 모두 · 금화 ${gold} · 수학 자물쇠 ${solved}/${chests.length}`, W / 2, 240, 40, '#f4e2c0', 6, 'center', 700);
    P.banner.up();
  }
  function hudUpdate(rdt: number, t: number): void {
    hudT += rdt;
    if (hudT >= 0.05) {
      hudT = 0;
      drawOrb(P.hp, hero.hp / hero.max, true, t, String(Math.ceil(hero.hp)), hero.hurt);
      drawOrb(P.mp, hero.mp / hero.maxMp, false, t + 1.3, String(Math.floor(hero.mp)), 0);
      if (big) drawSkills(P.skills, hero.cds, hero.mp, hero.cdFlash);
      if (++mapT % 2 === 0) drawMap();
    }
    const alive = mons.filter((m) => m.state !== 'dead').length;
    const key = `${alive}|${gold}|${solved}`;
    if (key !== topKey) {
      topKey = key;
      const g = P.top.g;
      g.clearRect(0, 0, 900, 84);
      pill(g, 4, 6, 892, 72, 36, 'rgba(10,8,6,0.72)', 'rgba(216,170,90,0.55)', 3);
      g.font = `800 38px ${FONT}`;
      const parts: [string, string][] = [
        [`괴물 ${alive}/${mons.length}`, '#ff8a7a'],
        [`금화 ${gold}`, '#ffd85a'],
        [`수학 자물쇠 ${solved}/${chests.length}`, '#9ae0ff'],
      ];
      let x = 40;
      for (const [s, c] of parts) {
        txt(g, s, x, 43, 38, c, 0, 'left');
        x += g.measureText(s).width + 52;
      }
      P.top.up();
    }
    toastT = Math.max(0, toastT - rdt);
    P.toast.spr.visible = toastT > 0;
    P.toast.spr.material.opacity = clamp(toastT / 0.4, 0, 1);
    P.quiz.spr.visible = !!quiz;
    if (quiz && quizDirty) {
      quizDirty = false;
      drawQuiz(P.quiz, quiz, autoPlay());
    }
    P.skills.spr.visible = P.hint.spr.visible = big;
  }
  let hintDone = false;
  function drawHint(): void {
    if (hintDone) return;
    hintDone = true;
    const g = P.hint.g;
    g.clearRect(0, 0, 1400, 64);
    pill(g, 60, 4, 1280, 56, 28, 'rgba(10,8,6,0.6)');
    txt(g, '땅 누르기 = 걷기 (누른 채 끌기)  ·  괴물 = 공격  ·  항아리 · 나무 상자 = 부수기  ·  보물 상자 = 수학 자물쇠  ·  1 2 3 = 기술', 700, 33, 28, '#e8d8b8', 0, 'center', 600);
    P.hint.up();
  }
  function layout(w: number, h: number): void {
    if (!P.hp) {
      P.msg.place(w / 2, h / 2, clamp(h * 0.08, 18, 48));
      return;
    }
    const S = clamp(h * (big ? 0.19 : 0.17), 48, 176);
    const m = S * 0.12;
    P.hp.place(m + S / 2, m + S / 2, S);
    P.mp.place(w - m - S / 2, m + S / 2, S);
    P.map.place(w - m * 0.6, h - m * 0.6, clamp(h * (big ? 0.34 : 0.28), 64, 300), 1, 1);
    P.top.place(m * 0.8, h - m * 0.8, clamp(h * 0.06, 15, 40), 0, 1);
    P.toast.place(w / 2, h * 0.77, clamp(h * 0.075, 16, 50));
    const pop = win ? 1 + Math.max(0, 1 - winT / 0.25) * 0.4 : 1;
    P.banner.place(w / 2, h * 0.57, clamp(h * 0.3, 50, 260) * pop);
    P.quiz.place(w / 2, h * 0.52, Math.min(h * 0.62, w * 0.62 * 0.56));
    const sh = clamp(h * 0.13, 40, 108);
    P.skills.place(w / 2, m * 0.5, sh, 0.5, 0);
    P.hint.place(w / 2, m * 0.5 + sh + 6, Math.min(clamp(h * 0.045, 14, 34), (w * 0.8 * 64) / 1400), 0.5, 0);
    P.msg.place(w / 2, h / 2, clamp(h * 0.08, 18, 48));
  }
  let msgKey = '';
  let hudH = 1;
  function wait(r: R, w: number, h: number, s: string): void {
    if (s !== msgKey) ((msgKey = s), setMsg(s));
    r.setClearColor(0x0b0a0c, 1);
    r.setViewport(0, 0, w, h);
    r.clear();
    hud.draw(r, w, h);
  }

  perf.make = performance.now() - t00;
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__dp = {
    perf,
    hero,
    mons,
    props,
    nav,
    proj: (x: number, y: number, z: number): number[] => {
      const v = new T.Vector3(x, y, z).project(cam);
      return [(v.x + 1) / 2, (1 - v.y) / 2];
    },
    qbtn: (i: number): number[] => {
      const s = P.quiz.spr;
      const [x, y, w, h] = QBTN[i]!;
      const x0 = s.position.x - s.center.x * s.scale.x;
      const y0 = s.position.y - s.center.y * s.scale.y;
      const cw = cam.aspect;
      const px = x0 + ((x + w / 2) / P.quiz.cw) * s.scale.x;
      const py = y0 + (1 - (y + h / 2) / P.quiz.ch) * s.scale.y;
      return [px / (hudH * cw), 1 - py / hudH];
    },
    st: () => ({ big, autoToggle, live, built, quiz: !!quiz, qa: quiz ? quiz.choices.indexOf(quiz.ans) : -1, gold, solved, win, goal: hero.goal?.k, path: hero.path.length, pos: HM?.root.position.toArray() }),
  };
  return {
    scene,
    camera: cam,
    update(t, dt) {
      const tu0 = performance.now();
      askKit();
      if (job.busy) {
        job.step(3);
        perf.build = Math.max(perf.build, performance.now() - tu0);
      }
      uTime.value = t;
      if (!live || !HM) return;
      const rdt = Math.min(dt, 0.05);
      let gdt = rdt;
      if (hitstop > 0) {
        hitstop -= rdt;
        gdt = 0;
      }
      const wdt = quiz ? 0 : gdt;
      input(rdt);
      if (autoPlay()) {
        thinkT -= rdt;
        if (thinkT <= 0) {
          thinkT = 0.2;
          think();
        }
      }
      quizStep(rdt);
      heroUpdate(wdt, t);
      const hp = hpos();
      // 막힘 풀기 (자동) — 길이 있는데 3초 동안 못 움직이면 다른 일을
      const busy = hero.swing >= 0 || hero.spin >= 0 || hero.cast >= 0;
      if (autoPlay() && hero.goal && hero.path.length && !busy && hero.moving < 0.05 && wdt > 0) stuckT += rdt;
      else stuckT = 0;
      if (stuckT > 2.5) {
        const g = hero.goal!;
        if (g.k === 'prop') ignore.add(g.p);
        if (g.k === 'chest') ignore.add(g.c);
        hero.goal = null;
        hero.path = [];
        stuckT = 0;
      }
      // 카메라 — 영웅을 부드럽게 따라간다
      camT.x = damp(camT.x, hp.x, 5, rdt);
      camT.z = damp(camT.z, hp.z, 5, rdt);
      shake = Math.max(0, shake - rdt * 0.9);
      const sk = shake * shake * 2.2;
      const jx = (grnd() - 0.5) * sk;
      const jy = (grnd() - 0.5) * sk;
      const k = big ? 0.86 : 0.8;
      cam.position.set(camT.x + OFF.x * k + jx, OFF.y * k + jy, camT.z + OFF.z * k - jx);
      cam.lookAt(camT.x + jx * 0.4, 0.4, camT.z);
      cam.updateMatrixWorld();
      camR.setFromMatrixColumn(cam.matrixWorld, 0);
      for (const m of mons) monUpdate(m, wdt);
      effects(wdt, rdt, t);
      // 다 잡았나
      if (!win && mons.every((m) => m.state === 'dead' && m.deadT > 0.55)) {
        win = true;
        winT = 0;
        drawBanner();
        P.banner.spr.visible = true;
        hero.goal = null;
        hero.path = [];
      }
      if (win) {
        winT += rdt;
        if (Math.floor(winT * 4) !== Math.floor((winT - rdt) * 4)) {
          const cols: [number, number, number][] = [
            [1, 0.85, 0.3],
            [0.5, 0.8, 1],
            [1, 0.5, 0.7],
            [0.6, 1, 0.6],
          ];
          burst(hp.x + (grnd() - 0.5) * 5, 2.6 + grnd(), hp.z + (grnd() - 0.5) * 5, 34, 4.2, cols[Math.floor(grnd() * 4)]!, 0.14, 1.3, 2.5, 0);
        }
        if (autoPlay() && winT > 6) reset();
      }
      updateFow(rdt);
      // 빛 — 영웅 등불(그림자) · 횃불 (가 보지 않은 방은 숨김)
      lamp.position.set(hp.x + 0.7, 3.3, hp.z + 0.7);
      lamp.intensity = 34 * (0.96 + 0.04 * Math.sin(t * 8));
      lp[0]!.copy(lamp.position);
      TORCHES.forEach((tc, i) => {
        const fx = tc.d === 'z' ? tc.x : tc.x + 1;
        const fz = tc.d === 'z' ? tc.z + 1 : tc.z;
        const on = !fowOn || explored[idx(fx, fz)]! > 0.05;
        const f = flick(t, i * 2.1);
        const l = torchL[i]!;
        l.position.copy(fpReal[i]!).y += 0.14;
        l.intensity = on ? 14 * f * torchMul : 0;
        fp[i]!.copy(on ? fpReal[i]! : FAR);
        lp[i + 1]!.copy(on ? l.position : FAR);
        const [a, b] = halos[i]!;
        a.visible = b.visible = on;
        a.position.copy(fpReal[i]!).y += 0.1;
        b.position.copy(fpReal[i]!).y += 0.1;
        a.scale.setScalar(0.5 * (0.85 + 0.3 * f) * Math.sqrt(torchMul));
        b.scale.setScalar(2.3 * f * Math.sqrt(torchMul));
      });
      hudUpdate(rdt, t);
      const du = performance.now() - tu0;
      perf.upd += du;
      perf.n++;
      perf.max = Math.max(perf.max, du);
    },
    render(r, w, h) {
      ptr.size(w, h);
      hudH = h;
      if (!big && ptr.attach(w, h)) big = true;
      layout(w, h);
      if (!built) return wait(r, w, h, job.busy ? '던전 만드는 중 …' : '실사 재질 받는 중 …');
      if (!pump(r, texs)) return wait(r, w, h, '텍스처 올리는 중 …');
      uScale.value = h / (2 * Math.tan(T.MathUtils.degToRad(cam.fov) / 2));
      if (!warm.ready(r, (rr) => withShadows(rr, () => rr.compileAsync(scene, cam)))) return wait(r, w, h, '셰이더 굽는 중 …');
      if (!live) {
        live = true;
        reset();
        P.msg.spr.visible = false;
        P.top.spr.visible = P.hp.spr.visible = P.mp.spr.visible = P.map.spr.visible = true;
        marker.visible = hoverRing.visible = trail.visible = false;
        drawHint();
        drawMap();
      }
      const tr0 = performance.now();
      r.setClearColor(BG, 1);
      withShadows(r, () => r.render(scene, cam));
      perf.calls = r.info.render.calls;
      perf.tris = r.info.render.triangles;
      hud.draw(r, w, h);
      perf.ren += performance.now() - tr0;
      perf.rn++;
    },
    controls: [
      { type: 'toggle', label: '자동 플레이 (영웅이 알아서)', value: false, on: (v) => (autoToggle = v) },
      { type: 'button', label: '처음부터 다시', on: () => void (live && reset()) },
      { type: 'toggle', label: '시야 안개 (가 본 곳만 밝게)', value: true, on: (v) => (fowOn = v) },
      { type: 'range', label: '횃불 세기', min: 0.3, max: 2, step: 0.05, value: 1, on: (v) => (torchMul = v) },
    ] satisfies Control[],
    dispose() {
      dead = true;
      ptr.dispose();
      for (const g of geos) g.dispose();
      scene.traverse((o) => {
        const s = o as THREE.Sprite;
        if (s.isSprite) {
          s.material.dispose();
          return;
        }
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material;
        if (mat) for (const x of Array.isArray(mat) ? mat : [mat]) x.dispose();
        if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
      });
      mats?.rug.map?.dispose();
      hud.dispose();
      fowTex.dispose();
      exclTex?.dispose();
      barBgTex?.dispose();
    },
  };
}
const FAR = new THREE.Vector3(0, -100, 0);

export const DEMOS: DemoMap = {
  i492: {
    kind: '3d',
    caption: '작은 던전 한 판 — 누른 곳으로 걷기 · 괴물 추격 · 휘두르기 · 상자 부수기 · 수학 자물쇠 · 시야 안개 · 미니맵',
    make: makePlay,
  },
};

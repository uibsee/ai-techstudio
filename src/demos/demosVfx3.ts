import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';
import type { Control, DemoMap, Scene3D } from './types';

/**
 * 견본 — 다양한 VFX 셋째 묶음  i502 ~ i517
 * 물 튀김 · 불꽃놀이 · 연기와 증기 · 플라즈마 구 · 물감 튀김 · 복셀 분해 · 모래성 무너짐 · 그라인더 불똥 ·
 * 오라 불꽃 · 신성 강림 · 토네이도 · 화염 방사 · 크리스탈 성장 · 꽃잎 바람 · 투명 은신 · 블랙홀.
 *
 * 공용: 빌보드 입자 통(Pool — 인스턴스 사각형, 수명 색 사다리, premultiplied 혼합으로 빛 ↔ 연기),
 *       미리 구운 잡음 텍스처(셰이더 반복문 잡음 없음 — 윈도 D3D 컴파일 멈춤 방지), 하늘 돔, 화면 글씨.
 */

const FONT = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const easeOut = (k: number): number => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const smooth = (k: number): number => {
  const x = clamp(k, 0, 1);
  return x * x * (3 - 2 * x);
};
const backOut = (k: number): number => {
  const x = clamp(k, 0, 1) - 1;
  return 1 + 2.4 * x * x * x + 1.4 * x * x;
};
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
const ctrlBtn = (label: string, on: () => void): Control => ({ type: 'button', label, on });
const ctrlTog = (label: string, value: boolean, on: (v: boolean) => void): Control => ({ type: 'toggle', label, value, on });
const ctrlRange = (label: string, min: number, max: number, step: number, value: number, on: (v: number) => void): Control => ({ type: 'range', label, min, max, step, value, on });

/* ───────────── 캔버스 · 텍스처 ───────────── */

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
function texFrom(c: HTMLCanvasElement, srgb = false, rep = 0): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (rep) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rep, rep);
  }
  return t;
}

/** 연기 뭉게: 빨강 = 진하기, 초록 = 왼쪽 위에서 비친 밝기 (덩어리 입체감) */
function puffCanvas(): HTMLCanvasElement {
  return cachedCanvas('v3puff', 128, 128, (g, N) => {
    const r = rng(17);
    const blobs: [number, number, number, number][] = [];
    for (let i = 0; i < 34; i++) {
      const a = r() * TAU;
      const d = Math.pow(r(), 0.7) * N * 0.24;
      blobs.push([N / 2 + Math.cos(a) * d, N / 2 + Math.sin(a) * d, N * (0.07 + r() * 0.13), 0.35 + r() * 0.5]);
    }
    const den = new Float32Array(N * N);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        let s = 0;
        for (const b of blobs) {
          const dx = x - b[0];
          const dy = y - b[1];
          s += b[3] * Math.exp(-(dx * dx + dy * dy) / (b[2] * b[2]));
        }
        const rr = Math.hypot(x - N / 2, y - N / 2) / (N / 2);
        den[y * N + x] = Math.pow(Math.min(1, s * 0.55), 1.4) * (1 - smooth((rr - 0.25) / 0.75));
      }
    const id = g.createImageData(N, N);
    const at = (x: number, y: number): number => den[clamp(y, 0, N - 1) * N + clamp(x, 0, N - 1)]!;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const d = at(x, y);
        const q = at(x - 6, y - 7);
        const lit = clamp(0.62 + (d - q) * 2.6 - d * 0.28 + (0.5 - y / N) * 0.35, 0, 1);
        const o = (y * N + x) * 4;
        id.data[o] = Math.round(d * 255);
        id.data[o + 1] = Math.round(lit * 255);
        id.data[o + 2] = 0;
        id.data[o + 3] = 255;
      }
    g.putImageData(id, 0, 0);
  });
}

/** 미리 구운 이어지는 잡음 (R · G = 서로 다른 fbm 4옥타브, B = 굵은 잡음) — 셰이더에서는 읽기만 */
let noiseBytes: Uint8Array | null = null;
function noiseTex(): THREE.DataTexture {
  const N = 128;
  if (!noiseBytes) {
    const out = new Uint8Array(N * N * 4);
    const layer = (seed: number, octs: number[], amps: number[]): Float32Array => {
      const r = rng(seed);
      const f = new Float32Array(N * N);
      octs.forEach((p, oi) => {
        const grid = new Float32Array(p * p);
        for (let i = 0; i < p * p; i++) grid[i] = r();
        for (let y = 0; y < N; y++)
          for (let x = 0; x < N; x++) {
            const gx = (x / N) * p;
            const gy = (y / N) * p;
            const ix = Math.floor(gx);
            const iy = Math.floor(gy);
            const fx = smooth(gx - ix);
            const fy = smooth(gy - iy);
            const g00 = grid[(iy % p) * p + (ix % p)]!;
            const g10 = grid[(iy % p) * p + ((ix + 1) % p)]!;
            const g01 = grid[((iy + 1) % p) * p + (ix % p)]!;
            const g11 = grid[((iy + 1) % p) * p + ((ix + 1) % p)]!;
            f[y * N + x] = f[y * N + x]! + amps[oi]! * lerp(lerp(g00, g10, fx), lerp(g01, g11, fx), fy);
          }
      });
      let mn = 9;
      let mx = -9;
      for (const v of f) {
        mn = Math.min(mn, v);
        mx = Math.max(mx, v);
      }
      for (let i = 0; i < f.length; i++) f[i] = (f[i]! - mn) / (mx - mn);
      return f;
    };
    const a = layer(3, [4, 8, 16, 32], [0.5, 0.25, 0.125, 0.0625]);
    const b = layer(9, [4, 8, 16, 32], [0.5, 0.25, 0.125, 0.0625]);
    const c = layer(21, [2, 4], [0.7, 0.3]);
    for (let i = 0; i < N * N; i++) {
      out[i * 4] = Math.round(a[i]! * 255);
      out[i * 4 + 1] = Math.round(b[i]! * 255);
      out[i * 4 + 2] = Math.round(c[i]! * 255);
      out[i * 4 + 3] = 255;
    }
    noiseBytes = out;
  }
  const t = new THREE.DataTexture(noiseBytes, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/* ───────────── 색 사다리 (수명 0 → 1) ───────────── */

const RN = 32;
/** [수명, 색, 밝기(HDR), 투명도, 더하기 정도(1 빛 · 0 덮기)] */
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
/** 빛 → 색 → 어두운 색으로 식는 사다리 (불꽃놀이 별 등) */
function starRamp(hex: number, I = 5): Float32Array {
  return ramp([[0, 0xffffff, I * 1.6, 1, 1], [0.12, hex, I, 1, 1], [0.7, hex, I * 0.55, 0.85, 1], [1, hex, I * 0.12, 0, 1]]);
}

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
  /** 0 빛 · 1 연기(입체) · 2 불티 · 3 조각 · 4 반짝 별 · 5 물방울 · 6 불 뭉게 */
  shape?: number;
  rot?: number;
  rv?: number;
  drag?: number;
  grav?: number;
  /** 바닥에서 튀기 (음수 = 바닥 없음) */
  bnc?: number;
  tag?: number;
  delay?: number;
  /** 아무 값 (효과마다 씀) */
  u?: number;
}

const POOL_VS = /* glsl */ `
attribute vec3 iPos; attribute vec3 iVel; attribute vec4 iCol; attribute vec4 iMisc; attribute float iAdd;
varying vec2 vUv; varying vec4 vCol; varying float vShape; varying float vAdd; varying float vStr;
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
  gl_Position = projectionMatrix * mv;
  vUv = c + 0.5; vCol = iCol; vShape = iMisc.w; vAdd = iAdd;
}`;
const POOL_FS = /* glsl */ `
uniform sampler2D uPuff;
varying vec2 vUv; varying vec4 vCol; varying float vShape; varying float vAdd; varying float vStr;
void main(){
  vec2 p = vUv * 2.0 - 1.0;
  float r2 = dot(p, p);
  float a; float hot = 0.0; float lit = 1.0;
  if (vShape < 0.5) { a = exp(-r2 * 3.2) * (1.0 - smoothstep(0.55, 1.0, r2)); hot = exp(-r2 * 16.0); }
  else if (vShape < 1.5) { vec4 tx = texture2D(uPuff, vUv); a = tx.r; lit = mix(0.3, 1.25, tx.g); }
  else if (vShape < 2.5) { float r = sqrt(r2); a = pow(max(0.0, 1.0 - r), 2.0); hot = exp(-r2 * 30.0); }
  else if (vShape < 3.5) {
    float d = abs(p.x) + abs(p.y);
    a = (1.0 - smoothstep(0.82, 1.0, d)) * (0.55 + 0.45 * step(0.0, p.x * p.y)) + exp(-d * 6.0) * 0.5;
    hot = (1.0 - smoothstep(0.0, 0.5, d)) * 0.6;
  } else if (vShape < 4.5) {
    float x = abs(p.x), y = abs(p.y);
    a = max(exp(-x * 16.0) * exp(-y * 2.4), exp(-y * 16.0) * exp(-x * 2.4)) + exp(-r2 * 9.0) * 0.7;
    a = min(a, 1.0) * (1.0 - smoothstep(0.8, 1.0, max(x, y)));
    hot = exp(-r2 * 25.0);
  } else if (vShape < 5.5) {
    float r = sqrt(r2);
    a = (1.0 - smoothstep(0.72, 1.0, r)) * (0.45 + 0.55 * r);
    vec2 q = p - vec2(-0.32, 0.36);
    hot = exp(-dot(q, q) * 20.0) * 1.6;
  } else { vec4 tx = texture2D(uPuff, vUv); a = tx.r; hot = tx.r * tx.r * 0.7; }
  if (vStr > 0.5) a *= smoothstep(0.0, 0.8, vUv.x);
  a *= vCol.a;
  if (a < 0.002) discard;
  vec3 col = vCol.rgb * lit * (1.0 + hot * 2.5);
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
  readonly u: Float32Array;
  readonly tag: Int16Array;
  readonly rp: Float32Array[];
  private readonly all: Float32Array[];
  private readonly aPos: THREE.InstancedBufferAttribute;
  private readonly aVel: THREE.InstancedBufferAttribute;
  private readonly aCol: THREE.InstancedBufferAttribute;
  private readonly aMisc: THREE.InstancedBufferAttribute;
  private readonly aAdd: THREE.InstancedBufferAttribute;
  floorY = 0.02;
  sizeMul = 1;
  onStep: ((p: Pool, i: number, dt: number) => void) | null = null;
  onDie: ((tag: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, u: number) => void) | null = null;

  constructor(cap: number, puff: THREE.Texture) {
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
    this.u = F();
    this.tag = new Int16Array(cap);
    this.rp = new Array<Float32Array>(cap);
    this.all = [this.x, this.y, this.z, this.vx, this.vy, this.vz, this.age, this.life, this.s0, this.s1, this.br, this.st, this.sh, this.rot, this.rv, this.drag, this.grav, this.bnc, this.u];
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
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uPuff: { value: puff } },
      vertexShader: POOL_VS,
      fragmentShader: POOL_FS,
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
    this.u[i] = o.u ?? 0;
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
        const uu = this.u[i]!;
        this.kill(i);
        if (tg && this.onDie) this.onDie(tg, px, py, pz, qx, qy, qz, uu);
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
      const nx = x[i]! + ux * dt;
      let ny = y[i]! + uy * dt;
      const nz = z[i]! + uz * dt;
      const b = this.bnc[i]!;
      if (b >= 0 && ny < this.floorY) {
        ny = this.floorY;
        if (uy < 0) {
          uy = -uy * b;
          ux *= 0.7;
          uz *= 0.7;
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
  /** 다음 step 에서 죽게 */
  end(i: number): void {
    this.age[i] = this.life[i]!;
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
  tick(dt: number): void {
    this.step(dt);
    this.upload();
  }
}

/* ───────────── 화면 위 글씨 ───────────── */

type Corner = 'tl' | 'tr' | 'bl' | 'br' | 'tc' | 'bc';
interface HudLabel {
  set(text: string, accent?: string): void;
}
class Hud {
  private items: { spr: THREE.Sprite; aspect: number; corner: Corner }[] = [];
  constructor(private cam: THREE.PerspectiveCamera) {}
  label(corner: Corner): HudLabel {
    const c = document.createElement('canvas');
    c.width = 760;
    c.height = 80;
    const g = c.getContext('2d')!;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false }));
    spr.renderOrder = 1000;
    this.cam.add(spr);
    this.items.push({ spr, aspect: c.width / c.height, corner });
    let last = '';
    return {
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
  resize(w: number, h: number): void {
    const dist = 3;
    const halfH = dist * Math.tan(THREE.MathUtils.degToRad(this.cam.fov / 2));
    const halfW = halfH * (w / h);
    const k = (2 * halfH) / h;
    const lab = clamp(h * 0.07 + 8, 22, 40);
    const m = clamp(h * 0.035, 6, 18) * k;
    for (const it of this.items) {
      const hh = lab * k;
      const ww = hh * it.aspect;
      it.spr.scale.set(ww, hh, 1);
      const v = it.corner[0];
      const hz = it.corner[1];
      const y = v === 't' ? halfH - m - hh / 2 : -halfH + m + hh / 2;
      const x = hz === 'l' ? -halfW + m + ww / 2 : hz === 'r' ? halfW - m - ww / 2 : 0;
      it.spr.position.set(x, y, -dist);
    }
  }
}

/* ───────────── 무대 ───────────── */

type V3 = [number, number, number];
interface Stage {
  scene: THREE.Scene;
  cam: THREE.PerspectiveCamera;
  hud: Hud;
  puff: THREE.Texture;
  noise: THREE.DataTexture;
  base: THREE.Vector3;
  look: THREE.Vector3;
  shake: number;
  pool(cap: number, order?: number): Pool;
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
      if (u)
        for (const k of Object.keys(u)) {
          const v = u[k]!.value as THREE.Texture | null;
          if (v && v.isTexture) v.dispose();
        }
      mt.dispose();
    }
  });
}
function makeStage(o: { bg: number; cam: V3; look: V3; fov?: number; fog?: [number, number] }): Stage {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(o.bg);
  if (o.fog) scene.fog = new THREE.Fog(o.bg, o.fog[0], o.fog[1]);
  const cam = new THREE.PerspectiveCamera(o.fov ?? 42, 1.6, 0.1, 120);
  const base = new THREE.Vector3(...o.cam);
  const look = new THREE.Vector3(...o.look);
  cam.position.copy(base);
  cam.lookAt(look);
  scene.add(cam);
  const puff = texFrom(puffCanvas());
  const noise = noiseTex();
  const hud = new Hud(cam);
  let tt = 0;
  const st: Stage = {
    scene,
    cam,
    hud,
    puff,
    noise,
    base,
    look,
    shake: 0,
    pool(cap: number, order = 3) {
      const p = new Pool(cap, puff);
      p.mesh.renderOrder = order;
      scene.add(p.mesh);
      return p;
    },
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
      noise.dispose();
    },
  };
  return st;
}

const FLAT_VS = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const WORLD_VS = /* glsl */ `varying vec3 vW; varying vec3 vN; varying vec2 vUv;
  void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * w; }`;
const TONE = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

/** 하늘 돔 (위 · 지평선 · 아래 색 + 별) */
function skyDome(top: number, hor: number, bottom: number, stars = 0, glow?: { dir: V3; col: number; pow: number; I: number }): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(top) },
      uHor: { value: new THREE.Color(hor) },
      uBot: { value: new THREE.Color(bottom) },
      uStars: { value: stars },
      uGDir: { value: new THREE.Vector3(...(glow?.dir ?? [0, 1, 0])).normalize() },
      uGCol: { value: new THREE.Color(glow?.col ?? 0).multiplyScalar(glow?.I ?? 0) },
      uGPow: { value: glow?.pow ?? 8 },
    },
    vertexShader: /* glsl */ `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */ `uniform vec3 uTop, uHor, uBot, uGCol, uGDir; uniform float uStars, uGPow; varying vec3 vD;
      float h31(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      void main(){ vec3 d = normalize(vD); float y = d.y;
        vec3 col = y > 0.0 ? mix(uHor, uTop, pow(clamp(y, 0.0, 1.0), 0.55)) : mix(uHor, uBot, pow(clamp(-y, 0.0, 1.0), 0.4));
        col += uGCol * pow(max(dot(d, uGDir), 0.0), uGPow);
        if (uStars > 0.0) {
          vec3 q = d * 220.0; vec3 c = floor(q); float h = h31(c);
          vec3 f = fract(q) - 0.5; float s = step(0.986, h) * exp(-dot(f, f) * 30.0) * smoothstep(0.02, 0.25, y);
          col += vec3(0.85, 0.9, 1.0) * s * uStars * (0.5 + 1.5 * fract(h * 37.0));
        }
        gl_FragColor = vec4(col, 1.0); ${TONE} }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(80, 32, 16), mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

/** 바닥에 번지는 빛 */
function glowDisc(hex: number, I: number, size: number, sharp = 4.5): { mesh: THREE.Mesh; set(I: number, hex?: number): void } {
  const col = new THREE.Color(hex).multiplyScalar(I);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: col }, uSharp: { value: sharp } },
    vertexShader: FLAT_VS,
    fragmentShader: /* glsl */ `uniform vec3 uCol; uniform float uSharp; varying vec2 vUv;
      void main(){ vec2 p = vUv*2.0-1.0; float r2 = dot(p,p);
        float a = exp(-r2*uSharp) * (1.0 - smoothstep(0.7, 1.0, r2));
        gl_FragColor = vec4(uCol, 1.0); ${TONE}
        gl_FragColor.a = a; }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.015;
  let base = hex;
  return {
    mesh,
    set(I: number, h?: number) {
      if (h !== undefined) base = h;
      col.setHex(base).multiplyScalar(I);
    },
  };
}

/** 퍼지는 고리 (바닥 · 수면) */
class Ring {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private age = 99;
  private dur = 0.5;
  constructor() {
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uR: { value: 0 }, uW: { value: 0.05 }, uA: { value: 0 }, uCol: { value: new THREE.Color() } },
      vertexShader: FLAT_VS,
      fragmentShader: /* glsl */ `uniform float uR, uW, uA; uniform vec3 uCol; varying vec2 vUv;
        void main(){ vec2 p = vUv*2.0-1.0; float r = length(p); float ang = atan(p.y, p.x);
          float d = (r - uR) / uW;
          float band = exp(-d*d) + exp(-pow((r - uR*0.8)/(uW*0.7), 2.0))*0.3;
          float brk = 0.75 + 0.25 * sin(ang*11.0 + r*25.0) * sin(ang*5.0 - 2.0);
          float a = band * brk * uA * (1.0 - smoothstep(0.95, 1.0, r));
          gl_FragColor = vec4(uCol, 1.0); ${TONE}
          gl_FragColor.a = clamp(a, 0.0, 1.0); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
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
    u.uW!.value = 0.03 + 0.06 * k;
    u.uA!.value = Math.pow(1 - k, 1.4);
  }
}

/** 사람 모양 (다리 · 몸 · 팔 · 머리를 한 모양으로) — 키 약 1.8 */
function figureGeo(pose: 'stand' | 'power' = 'stand'): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const put = (g: THREE.BufferGeometry, x: number, y: number, z: number, rz = 0, rx = 0, sx = 1, sz = 1): void => {
    g.scale(sx, 1, sz);
    g.rotateX(rx);
    g.rotateZ(rz);
    g.translate(x, y, z);
    parts.push(g);
  };
  const legA = pose === 'power' ? 0.12 : 0.04;
  put(new THREE.CapsuleGeometry(0.1, 0.66, 4, 12), -0.13, 0.46, 0, -legA);
  put(new THREE.CapsuleGeometry(0.1, 0.66, 4, 12), 0.13, 0.46, 0, legA);
  put(new THREE.CapsuleGeometry(0.2, 0.4, 6, 16), 0, 1.13, 0, 0, 0, 1, 0.72);
  put(new THREE.SphereGeometry(0.17, 16, 12), 0, 0.88, 0, 0, 0, 1.15, 0.8);
  const armA = pose === 'power' ? 0.42 : 0.14;
  put(new THREE.CapsuleGeometry(0.068, 0.52, 4, 10), -0.33, 1.02, 0, -armA);
  put(new THREE.CapsuleGeometry(0.068, 0.52, 4, 10), 0.33, 1.02, 0, armA);
  put(new THREE.SphereGeometry(0.085, 10, 8), -0.33 - Math.sin(armA) * 0.33, 1.02 - Math.cos(armA) * 0.33, 0);
  put(new THREE.SphereGeometry(0.085, 10, 8), 0.33 + Math.sin(armA) * 0.33, 1.02 - Math.cos(armA) * 0.33, 0);
  put(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 10), 0, 1.47, 0);
  put(new THREE.SphereGeometry(0.15, 20, 16), 0, 1.64, 0, 0, 0, 0.92, 1);
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return g;
}
/** 겉면에서 점 고르기 (위 → 아래로 정렬) */
function surfacePoints(geo: THREE.BufferGeometry, n: number): Float32Array {
  const m = new THREE.Mesh(geo);
  const s = new MeshSurfaceSampler(m).build();
  const v = new THREE.Vector3();
  const nn = new THREE.Vector3();
  const out = new Float32Array(n * 6);
  for (let i = 0; i < n; i++) {
    s.sample(v, nn);
    out.set([v.x, v.y, v.z, nn.x, nn.y, nn.z], i * 6);
  }
  return out;
}

/** 간단한 빛 계산 (셰이더 안 — 장면 조명 없이도 입체) */
const SHADE_GLSL = /* glsl */ `
vec3 shade(vec3 base, vec3 N, vec3 V, vec3 L, vec3 lc){
  float d = max(dot(N, L), 0.0); float hemi = 0.5 + 0.5 * N.y;
  vec3 H = normalize(L + V); float s = pow(max(dot(N, H), 0.0), 48.0);
  return base * (0.22 * hemi + 0.95 * d * lc) + lc * s * 0.45;
}`;

/** 잔디 · 흙 · 돌 등 바닥 그림 */
function groundCanvas(key: string, base: string, dots: [string, number, number][], seed: number, extra?: (g: CanvasRenderingContext2D, s: number, r: () => number) => void): HTMLCanvasElement {
  return cachedCanvas(key, 512, 512, (g, s) => {
    const r = rng(seed);
    g.fillStyle = base;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 260; i++) {
      const cx = r() * s;
      const cy = r() * s;
      const rr = 10 + r() * 50;
      const dark = r() < 0.5;
      for (const ox of [-s, 0, s])
        for (const oy of [-s, 0, s]) {
          const gr = g.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, rr);
          gr.addColorStop(0, dark ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.04)');
          gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr;
          g.fillRect(cx + ox - rr, cy + oy - rr, rr * 2, rr * 2);
        }
    }
    for (const [col, n, sz] of dots) {
      g.fillStyle = col;
      for (let i = 0; i < n; i++) g.fillRect(r() * s, r() * s, sz * (0.5 + r()), sz * (0.5 + r()));
    }
    extra?.(g, s, r);
  });
}

/* ───────────── 견본 ───────────── */

export const DEMOS: DemoMap = {
  /* i502 물 튀김 — 왕관 스플래시 · 물기둥 · 파문 */
  i502: {
    kind: '3d',
    caption: '물방울이 떨어지면 얇은 물벽 왕관 + 튀는 방울 → 되튀는 물기둥 → 방울이 다시 떨어지며 작은 파문',
    make(): Scene3D {
      const S = makeStage({ bg: 0x9fc4dc, cam: [0, 0.95, 2.7], look: [0, 0.32, 0], fov: 40 });
      S.scene.add(skyDome(0x4f86c0, 0xd8e8f0, 0x5a7d90, 0, { dir: [0.75, 0.3, -0.6], col: 0xfff2d8, pow: 24, I: 0.9 }));
      const lab = S.hud.label('tl');
      const SUN = new THREE.Vector3(0.75, 0.3, -0.6).normalize();
      const MAXR = 10;
      const drops = Array.from({ length: MAXR }, () => new THREE.Vector4(0, 0, -99, 0));
      let rSlot = 1;
      const ripple = (x: number, z: number, amp: number, now: number, slot?: number): void => {
        const i = slot ?? rSlot;
        if (slot === undefined) rSlot = 1 + (rSlot % (MAXR - 1));
        drops[i]!.set(x, z, now, amp);
      };
      const waterMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uDrops: { value: drops },
          uSun: { value: SUN },
          uAmp: { value: 1 },
        },
        vertexShader: WORLD_VS,
        fragmentShader: /* glsl */ `uniform float uTime, uAmp; uniform vec4 uDrops[${MAXR}]; uniform vec3 uSun; varying vec3 vW;
          void main(){
            vec2 p = vW.xz; vec2 g = vec2(0.0); float foam = 0.0;
            g += vec2(0.6, 0.3) * 0.010 * cos(dot(p, vec2(2.1, 1.0)) + uTime * 1.3);
            g += vec2(-0.3, 0.8) * 0.008 * cos(dot(p, vec2(-1.2, 3.1)) + uTime * 1.7);
            for (int i = 0; i < ${MAXR}; i++) {
              vec4 d = uDrops[i]; float age = uTime - d.z;
              if (age < 0.0 || age > 4.0) continue;
              vec2 q = p - d.xy; float r = length(q) + 1e-4;
              float r0 = age * 1.05;
              float env = exp(-pow((r - r0) * (2.6 / (0.4 + age * 0.6)), 2.0)) * d.w * exp(-age * 0.8) / (1.0 + r * 2.0);
              float k = 15.0 / (0.6 + age * 0.5);
              g += (q / r) * env * cos((r - r0) * k) * 0.09 * k * uAmp;
              foam += exp(-pow((r - r0 * 0.75) * 9.0, 2.0)) * exp(-age * 2.2) * d.w;
            }
            vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
            vec3 V = normalize(cameraPosition - vW);
            vec3 Rf = reflect(-V, N);
            float ry = clamp(Rf.y, 0.0, 1.0);
            vec3 sky = mix(vec3(0.85, 0.91, 0.94), vec3(0.3, 0.52, 0.78), pow(ry, 0.6));
            float fr = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
            vec3 body = vec3(0.04, 0.2, 0.26) * (0.7 + 0.6 * N.y);
            body += vec3(0.05, 0.22, 0.2) * smoothstep(0.98, 0.9, N.y);
            vec3 col = mix(body, sky, fr);
            col += vec3(1.0, 0.95, 0.85) * pow(max(dot(Rf, uSun), 0.0), 900.0) * 3.0;
            col += vec3(0.9, 0.97, 1.0) * clamp(foam, 0.0, 1.0) * 0.55;
            float far = smoothstep(9.0, 26.0, length(vW.xz));
            col = mix(col, vec3(0.78, 0.86, 0.9), far);
            gl_FragColor = vec4(col, 1.0); ${TONE} }`,
      });
      const water = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), waterMat);
      water.rotation.x = -Math.PI / 2;
      S.scene.add(water);
      // 물 셰이더 (방울 · 왕관 · 기둥)
      const liquid = (): THREE.ShaderMaterial =>
        new THREE.ShaderMaterial({
          uniforms: { uSun: { value: SUN }, uA: { value: 1 } },
          vertexShader: WORLD_VS,
          fragmentShader: /* glsl */ `uniform vec3 uSun; uniform float uA; varying vec3 vW; varying vec3 vN;
            void main(){ vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vW); if (dot(N, V) < 0.0) N = -N;
              float ndv = max(dot(N, V), 0.0); float fr = 0.06 + 0.94 * pow(1.0 - ndv, 4.0);
              vec3 Rf = reflect(-V, N);
              vec3 sky = mix(vec3(0.82, 0.9, 0.95), vec3(0.32, 0.55, 0.8), pow(clamp(Rf.y, 0.0, 1.0), 0.6));
              sky = Rf.y < 0.0 ? vec3(0.08, 0.26, 0.3) : sky;
              vec3 inner = vec3(0.1, 0.32, 0.36);
              vec3 col = mix(inner, sky, fr) + vec3(1.0, 0.96, 0.88) * pow(max(dot(Rf, uSun), 0.0), 90.0) * 6.0;
              gl_FragColor = vec4(col, 1.0); ${TONE}
              gl_FragColor.a = clamp((0.45 + 0.55 * fr) * uA, 0.0, 1.0); }`,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
      const dropMat = liquid();
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.085, 24, 16), dropMat);
      S.scene.add(drop);
      // 왕관: 위가 벌어지고 톱니 모양으로 찢어진 얇은 물벽
      const crownMat = liquid();
      crownMat.uniforms.uK = { value: 0 };
      crownMat.vertexShader = /* glsl */ `uniform float uK; varying vec3 vW; varying vec3 vN; varying vec2 vUv;
        void main(){ vec3 p = position; float h = uv.y; float ang = atan(p.z, p.x);
          float flare = 1.0 + h * h * (0.55 + 0.35 * uK);
          float lip = 1.0 + 0.05 * sin(ang * 9.0) * h;
          p.xz *= flare * lip; vUv = uv;
          vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz;
          vec3 n = normal; n.y -= h * 0.9; vN = normalize(mat3(modelMatrix) * n);
          gl_Position = projectionMatrix * viewMatrix * w; }`;
      crownMat.fragmentShader = crownMat.fragmentShader
        .replace('varying vec3 vN;', 'varying vec3 vN; varying vec2 vUv; uniform float uK;')
        .replace(
          'void main(){',
          `void main(){ float ang = atan(vW.z, vW.x);
            float teeth = 0.7 + 0.22 * pow(abs(sin(ang * 8.0 + 0.6)), 3.0) + 0.08 * sin(ang * 23.0);
            if (vUv.y > teeth * (1.0 - uK * 0.35)) discard;`,
        );
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 64, 6, true).translate(0, 0.5, 0), crownMat);
      crown.visible = false;
      S.scene.add(crown);
      const jetMat = liquid();
      const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.07, 1, 20, 4, true).translate(0, 0.5, 0), jetMat);
      const jetTop = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), jetMat);
      jet.visible = jetTop.visible = false;
      S.scene.add(jet, jetTop);
      const P = S.pool(900, 4);
      const MIST = ramp([[0, 0xffffff, 1.3, 0, 0.4], [0.15, 0xf0f8ff, 1.2, 0.16, 0.4], [1, 0xd8ecf4, 1, 0, 0.3]]);
      const DROPR = ramp([[0, 0xffffff, 2.2, 0.95, 0.5], [0.8, 0xe8f6ff, 1.6, 0.85, 0.45], [1, 0xc8e8f8, 1.2, 0.6, 0.4]]);
      const SPRAY = ramp([[0, 0xffffff, 2.6, 1, 0.7], [1, 0xd8f0ff, 1.4, 0, 0.6]]);
      P.floorY = -10;
      P.onStep = (p, i) => {
        if (p.y[i]! < 0 && p.vy[i]! < 0) {
          const big = p.tag[i] === 2;
          ripple(p.x[i]!, p.z[i]!, big ? 0.55 : 0.16 + p.s0[i]! * 2, time);
          const n = big ? 7 : 2;
          for (let j = 0; j < n; j++) {
            const a = R(0, TAU);
            const sp = R(0.4, big ? 1.2 : 0.7);
            P.spawn({ x: p.x[i]!, y: 0.01, z: p.z[i]!, vx: Math.cos(a) * sp, vy: R(0.8, big ? 2.2 : 1.3), vz: Math.sin(a) * sp, life: 0.35, s0: big ? 0.035 : 0.022, ramp: DROPR, shape: 5, st: 0.03, grav: 9.8 });
          }
          p.end(i);
        }
      };
      let time = 0;
      let cyc = 0;
      let slow = true;
      let size = 1;
      const CYC = 3.4;
      const T_HIT = 0.82;
      let hit = false;
      let pinched = false;
      const controls: Control[] = [
        ctrlTog('느리게 보기 (고속 촬영)', true, (v) => (slow = v)),
        ctrlRange('물방울 크기', 0.6, 1.6, 0.05, 1, (v) => (size = v)),
        ctrlRange('파문 세기', 0, 2, 0.05, 1, (v) => (waterMat.uniforms.uAmp!.value = v)),
        ctrlBtn('다시 떨어뜨리기', () => (cyc = 0)),
      ];
      return {
        scene: S.scene,
        camera: S.cam,
        controls,
        update(_t, dt0) {
          const dt = Math.min(dt0, 0.05) * (slow ? 0.35 : 1);
          time += dt;
          const prev = cyc;
          cyc += dt;
          if (cyc >= CYC) {
            cyc = 0;
            hit = false;
            pinched = false;
          }
          if (prev > cyc) {
            hit = false;
            pinched = false;
          }
          waterMat.uniforms.uTime!.value = time;
          // 떨어지는 방울
          if (cyc < T_HIT) {
            const k = cyc / T_HIT;
            const y = 3.2 * (1 - k * k) + 0.02;
            drop.visible = true;
            drop.position.set(0, y, 0);
            drop.scale.set(size, size * (1 + k * 0.45), size);
            lab.set('물방울 낙하', '#7ac8ff');
          } else drop.visible = false;
          const a = cyc - T_HIT;
          if (a >= 0 && !hit) {
            hit = true;
            ripple(0, 0, 1.3 * size, time, 0);
            // 바깥으로 낮게 튀는 물보라
            for (let i = 0; i < 46 * size; i++) {
              const an = R(0, TAU);
              const sp = R(1.4, 3.4) * size;
              P.spawn({ x: Math.cos(an) * 0.08, y: 0.03, z: Math.sin(an) * 0.08, vx: Math.cos(an) * sp, vy: R(0.6, 1.8), vz: Math.sin(an) * sp, life: 1.2, s0: R(0.012, 0.026), ramp: SPRAY, shape: 5, st: 0.04, grav: 9.8, tag: 1 });
            }
            // 왕관 끝에서 떨어져 나가는 방울 (톱니 끝마다)
            for (let i = 0; i < 16; i++) {
              const an = (i / 16) * TAU + 0.2 + R(-0.05, 0.05);
              const sp = R(0.9, 1.3) * size;
              P.spawn({ x: Math.cos(an) * 0.3 * size, y: 0.32 * size, z: Math.sin(an) * 0.3 * size, vx: Math.cos(an) * sp, vy: R(2.0, 2.6) * Math.sqrt(size), vz: Math.sin(an) * sp, life: 2.0, s0: R(0.03, 0.045) * size, ramp: DROPR, shape: 5, st: 0.02, grav: 9.8, tag: 1, delay: 0.13 });
            }
            for (let i = 0; i < 16; i++) {
              const an = R(0, TAU);
              P.spawn({ x: Math.cos(an) * 0.2, y: 0.1, z: Math.sin(an) * 0.2, vx: Math.cos(an) * 0.9, vy: R(0.3, 0.8), vz: Math.sin(an) * 0.9, life: R(0.9, 1.4), s0: 0.15, s1: 0.6, ramp: MIST, shape: 1, rot: R(0, TAU), rv: R(-0.5, 0.5), drag: 2 });
            }
          }
          // 왕관
          if (a >= 0 && a < 0.55) {
            const k = a / 0.55;
            crown.visible = true;
            const rr = (0.1 + 0.26 * easeOut(k * 1.3)) * size;
            const hh = 0.42 * Math.sin(Math.PI * Math.pow(k, 0.6)) * size;
            crown.scale.set(rr, Math.max(0.001, hh), rr);
            crownMat.uniforms.uK!.value = k;
            crownMat.uniforms.uA!.value = 1 - smooth((k - 0.6) / 0.4);
            lab.set('왕관 — 얇은 물벽이 솟고 톱니 끝에서 방울이 떨어져 나감', '#7ac8ff');
          } else crown.visible = false;
          // 되튀는 물기둥 (워딩턴 제트)
          const ja = a - 0.32;
          if (ja >= 0 && ja < 0.75) {
            const k = ja / 0.75;
            const h = 0.95 * Math.sin(Math.PI * Math.pow(k, 0.7)) * size;
            jet.visible = jetTop.visible = true;
            jet.scale.set(size, Math.max(0.001, h), size);
            jetTop.scale.setScalar(size * (1 + (pinched ? 0 : 0.4 * k)));
            jetTop.position.set(0, h, 0);
            jetTop.visible = !pinched;
            if (!pinched && k > 0.38) {
              pinched = true;
              P.spawn({ x: 0, y: h, z: 0, vx: R(-0.05, 0.05), vy: 1.6 * size, vz: R(-0.05, 0.05), life: 3, s0: 0.11 * size, ramp: DROPR, shape: 5, st: 0.015, grav: 9.8, tag: 2 });
            }
            lab.set('물기둥 — 가운데가 되튀어 오르고 꼭대기 방울이 끊어짐', '#7ac8ff');
          } else {
            jet.visible = jetTop.visible = false;
            if (a > 1.1) lab.set('파문 — 다시 떨어진 방울마다 작은 고리 물결', '#7ac8ff');
          }
          P.tick(dt);
          S.tick(dt);
        },
        resize: (w, h) => S.resize(w, h),
        dispose: () => S.dispose(),
      };
    },
  },

  /* i503 불꽃놀이 — 국화 · 버드나무 · 고리 */
  i503: {
    kind: '3d',
    caption: '로켓이 꼬리를 끌고 올라가 터짐 — 국화(색 별이 꼬리 남김) · 버드나무(금빛이 길게 처짐) · 고리(평면 원 + 탁탁 반짝)',
    make(): Scene3D {
      const S = makeStage({ bg: 0x060814, cam: [0, 2.6, 13.5], look: [0, 7.6, 0], fov: 52 });
      S.scene.add(skyDome(0x03040c, 0x1a1636, 0x05060a, 1.4));
      const lab = S.hud.label('tl');
      // 도시 실루엣 (창 불빛)
      const win = cachedCanvas('v3win', 256, 256, (g, s) => {
        const r = rng(5);
        g.fillStyle = '#0a0c18';
        g.fillRect(0, 0, s, s);
        for (let y = 6; y < s; y += 14)
          for (let x = 5; x < s; x += 12) {
            if (r() < 0.07) {
              g.fillStyle = r() < 0.75 ? `rgba(255,${190 + r() * 50},${110 + r() * 60},${0.25 + r() * 0.45})` : 'rgba(170,210,255,0.8)';
              g.fillRect(x, y, 6, 8);
            }
          }
      });
      const winTex = texFrom(win, true);
      winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
      const city = new THREE.Group();
      const rr = rng(77);
      for (let i = 0; i < 34; i++) {
        const w = 1 + rr() * 2.2;
        const h = 0.8 + Math.pow(rr(), 1.8) * 4;
        const tex = winTex.clone();
        tex.repeat.set(w / 2, h / 2);
        tex.offset.set(rr(), rr());
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.5), new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff, fog: false }));
        b.position.set(-30 + i * 1.8 + rr() * 0.6, h / 2 - 0.5, -8 - rr() * 3);
        city.add(b);
      }
      S.scene.add(city);
      // 물 (도시 · 불꽃이 비침)
      const lake = new THREE.Mesh(new THREE.PlaneGeometry(120, 40), new THREE.MeshBasicMaterial({ color: 0x04050b }));
      lake.rotation.x = -Math.PI / 2;
      lake.position.set(0, -0.5, 10);
      S.scene.add(lake);
      const skyGlow = glowDisc(0xffffff, 0, 46, 2.6);
      skyGlow.mesh.rotation.x = 0;
      skyGlow.mesh.position.set(0, 9, -14);
      S.scene.add(skyGlow.mesh);
      const smoke = S.pool(400, 2);
      const P = S.pool(7000, 4);
      const TRAILR = ramp([[0, 0xffe0a0, 3.2, 1, 1], [0.4, 0xff8a30, 1.4, 0.7, 1], [1, 0x601000, 0.3, 0, 1]]);
      const GOLD = ramp([[0, 0xffffff, 7, 1, 1], [0.1, 0xffd890, 4, 1, 1], [0.6, 0xff9a30, 2, 0.9, 1], [1, 0x803000, 0.5, 0, 1]]);
      const WTRAIL = ramp([[0, 0xffd080, 2.4, 0.9, 1], [0.5, 0xff8a20, 1.1, 0.6, 1], [1, 0x401000, 0.2, 0, 1]]);
      const CRACK = ramp([[0, 0xffffff, 9, 1, 1], [1, 0xfff0d0, 3, 0, 1]]);
      const SMK = ramp([[0, 0x8a8ca0, 0.6, 0, 0], [0.2, 0x6a6c80, 0.55, 0.1, 0], [1, 0x3a3c4a, 0.4, 0, 0]]);
      const COLS = [0xff3050, 0x40ff80, 0x4aa0ff, 0xc060ff, 0xffd040, 0x30f0ff, 0xff60c0];
      const RAMPS = COLS.map((c) => starRamp(c, 4.5));
      const TRAILS = COLS.map((c) => ramp([[0, c, 2.4, 0.8, 1], [1, c, 0.3, 0, 1]]));
      let trails = true;
      let scale = 1;
      let pick = 0;
      let flashI = 0;
      const flashCol = new THREE.Color();
      interface Rocket {
        x: number;
        y: number;
        z: number;
        vx: number;
        vy: number;
        type: number;
        col: number;
      }
      const rockets: Rocket[] = [];
      const NAMES = ['국화 — 공 모양으로 퍼진 색 별이 꼬리를 남김', '버드나무 — 금빛 별이 무겁게 처지며 길게 늘어짐', '고리 — 한 평면 위의 원 + 끝에서 탁탁 반짝'];
      const ACC = ['#ff5070', '#ffc040', '#40e8ff'];
      let order = 0;
      let next = 0.3;
      P.onStep = (p, i, dt) => {
        if (!trails) return;
        const tg = p.tag[i]!;
        const k = p.age[i]! / p.life[i]!;
        if (tg === 1 && Math.random() < dt * 34) P.spawn({ x: p.x[i]!, y: p.y[i]!, z: p.z[i]!, vy: -0.2, life: R(0.35, 0.6), s0: 0.16, s1: 0.05, ramp: TRAILS[p.u[i]!]!, shape: 0, br: 1 - k });
        else if (tg === 2 && Math.random() < dt * 40) P.spawn({ x: p.x[i]!, y: p.y[i]!, z: p.z[i]!, vy: -0.5, life: R(1.5, 2.3), s0: 0.12, s1: 0.04, ramp: WTRAIL, shape: 2, grav: 0.6, br: 1 - k * 0.6 });
        else if (tg === 3 && Math.random() < dt * 18) P.spawn({ x: p.x[i]!, y: p.y[i]!, z: p.z[i]!, life: 0.4, s0: 0.13, s1: 0.04, ramp: TRAILS[p.u[i]!]!, shape: 0 });
      };
      P.onDie = (tg, x, y, z) => {
        if (tg === 3)
          for (let j = 0; j < 3; j++) P.spawn({ x: x + R(-0.15, 0.15), y: y + R(-0.15, 0.15), z: z + R(-0.15, 0.15), life: R(0.08, 0.16), s0: R(0.25, 0.4), ramp: CRACK, shape: 4, rot: R(0, TAU), delay: R(0, 0.25) });
      };
      const burst = (r: Rocket): void => {
        const { x, y, z } = r;
        const sc = scale;
        const ci = r.col;
        P.spawn({ x, y, z, life: 0.28, s0: 3.6 * sc, s1: 5.5 * sc, ramp: ramp([[0, 0xffffff, 5, 1, 1], [1, COLS[ci]!, 1, 0, 1]]), shape: 0 });
        flashI = 1;
        flashCol.setHex(r.type === 1 ? 0xffb050 : COLS[ci]!);
        skyGlow.mesh.position.set(x * 0.8, y, -14);
        if (r.type === 0) {
          const n = Math.round(130 * sc);
          for (let i = 0; i < n; i++) {
            const d = sphereDir();
            const sp = R(5.6, 6.4) * sc;
            P.spawn({ x, y, z, vx: d.x * sp, vy: d.y * sp, vz: d.z * sp, life: R(1.6, 2.0), s0: 0.3, s1: 0.12, ramp: RAMPS[ci]!, shape: 0, drag: 1.25, grav: 1.6, tag: 1, u: ci });
          }
          // 가운데 다른 색 작은 핵 (두 겹 국화)
          const c2 = (ci + 3) % COLS.length;
          for (let i = 0; i < 40 * sc; i++) {
            const d = sphereDir();
            const sp = R(2.3, 2.7) * sc;
            P.spawn({ x, y, z, vx: d.x * sp, vy: d.y * sp, vz: d.z * sp, life: R(1.2, 1.5), s0: 0.26, s1: 0.1, ramp: RAMPS[c2]!, shape: 0, drag: 1.2, grav: 1.4 });
          }
        } else if (r.type === 1) {
          const n = Math.round(62 * sc);
          for (let i = 0; i < n; i++) {
            const d = sphereDir();
            const sp = R(4.2, 5.0) * sc;
            P.spawn({ x, y, z, vx: d.x * sp, vy: d.y * sp + 1, vz: d.z * sp, life: R(2.8, 3.4), s0: 0.28, s1: 0.1, ramp: GOLD, shape: 0, drag: 1.4, grav: 2.4, tag: 2 });
          }
        } else {
          const nrm = new THREE.Vector3(R(-0.5, 0.5), R(0.5, 0.9), 1).normalize();
          const t1 = new THREE.Vector3(1, 0, 0).cross(nrm).normalize();
          const t2 = nrm.clone().cross(t1);
          const n = Math.round(72 * sc);
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU;
            const sp = 6 * sc;
            const vx = (Math.cos(a) * t1.x + Math.sin(a) * t2.x) * sp;
            const vy = (Math.cos(a) * t1.y + Math.sin(a) * t2.y) * sp;
            const vz = (Math.cos(a) * t1.z + Math.sin(a) * t2.z) * sp;
            P.spawn({ x, y, z, vx, vy, vz, life: R(1.45, 1.6), s0: 0.3, s1: 0.12, ramp: RAMPS[ci]!, shape: 0, drag: 1.3, grav: 1.2, tag: 3, u: ci });
          }
          // 가운데 반짝 별 몇 개
          for (let i = 0; i < 18; i++) {
            const d = sphereDir();
            P.spawn({ x, y, z, vx: d.x * 1.2, vy: d.y * 1.2, vz: d.z * 1.2, life: R(0.8, 1.2), s0: 0.3, ramp: CRACK, shape: 4, rot: R(0, TAU), drag: 1.5 });
          }
        }
        for (let i = 0; i < 10; i++) {
          const d = sphereDir();
          smoke.spawn({ x: x + d.x * 1.2 * sc, y: y + d.y * 1.2 * sc, z: z + d.z * 1.2 * sc, vx: d.x * 0.5 + 0.25, vy: d.y * 0.5, vz: d.z * 0.5, life: R(3.5, 5), s0: 1.2 * sc, s1: 3.2 * sc, ramp: SMK, shape: 1, rot: R(0, TAU), rv: R(-0.2, 0.2), drag: 0.5, delay: R(0.2, 0.6) });
        }
        lab.set(NAMES[r.type]!, ACC[r.type]!);
      };
      const launch = (): void => {
        const type = pick > 0 ? pick - 1 : order++ % 3;
        rockets.push({ x: R(-5, 5), y: 0, z: R(-2, 1), vx: R(-0.6, 0.6), vy: R(10.8, 11.8), type, col: Math.floor(Math.random() * COLS.length) });
      };
      const controls: Control[] = [
        ctrlRange('종류 (0 번갈아 · 1 국화 · 2 버드나무 · 3 고리)', 0, 3, 1, 0, (v) => (pick = v)),
        ctrlTog('별 꼬리', true, (v) => (trails = v)),
        ctrlRange('터짐 크기', 0.6, 1.5, 0.05, 1, (v) => (scale = v)),
        ctrlBtn('한 발 쏘기', launch),
      ];
      return {
        scene: S.scene,
        camera: S.cam,
        controls,
        update(_t, dt0) {
          const dt = Math.min(dt0, 0.05);
          next -= dt;
          if (next <= 0) {
            launch();
            next = R(1.3, 1.8);
          }
          for (let i = rockets.length - 1; i >= 0; i--) {
            const r = rockets[i]!;
            r.vy -= 9.8 * 0.62 * dt;
            r.x += r.vx * dt;
            r.y += r.vy * dt;
            P.spawn({ x: r.x, y: r.y, z: r.z, life: 0.08, s0: 0.35, ramp: flat(0xfff0c0, 4, 1), shape: 0 });
            for (let j = 0; j < 3; j++) P.spawn({ x: r.x + R(-0.03, 0.03), y: r.y - R(0, 0.2), z: r.z, vx: R(-0.5, 0.5), vy: R(-2.5, -0.5), vz: R(-0.5, 0.5), life: R(0.35, 0.7), s0: 0.06, s1: 0.02, ramp: TRAILR, shape: 2, st: 0.04, grav: 4 });
            if (r.vy < 1.5) {
              burst(r);
              rockets.splice(i, 1);
            }
          }
          flashI *= Math.exp(-dt * 5);
          skyGlow.set(flashI * 0.13, flashCol.getHex());
          for (const b of city.children) ((b as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setScalar(1).lerp(flashCol, flashI * 0.5).multiplyScalar(1 + flashI * 1.4);
          smoke.tick(dt);
          P.tick(dt);
          S.tick(dt);
        },
        resize: (w, h) => S.resize(w, h),
        dispose: () => S.dispose(),
      };
    },
  },

  /* i504 연기 기둥 · 증기 분출 */
  i504: {
    kind: '3d',
    caption: '굴뚝 연기는 짙고 무겁게 오래 남아 바람에 휘고, 관에서 뿜는 증기는 하얗게 빠르게 퍼지다 금방 사라진다',
    make(): Scene3D {
      const S = makeStage({ bg: 0xc87a56, cam: [1.6, 2.1, 10.5], look: [0.2, 3.2, 0], fov: 50, fog: [12, 34] });
      S.scene.add(skyDome(0x1c2240, 0xe8905a, 0x1a1410, 0, { dir: [-0.9, 0.1, -0.45], col: 0xffb070, pow: 5, I: 0.7 }));
      const lab = S.hud.label('tl');
      S.scene.add(new THREE.HemisphereLight(0xffc8a0, 0x201810, 0.7));
      const sun = new THREE.DirectionalLight(0xffa060, 2.2);
      sun.position.set(-6, 4, -2);
      S.scene.add(sun);
      const con = groundCanvas('v3con', '#5a544e', [['rgba(0,0,0,0.25)', 5000, 1.5], ['rgba(255,255,255,0.06)', 3000, 1.2]], 41, (g, s) => {
        g.strokeStyle = 'rgba(0,0,0,0.35)';
        g.lineWidth = 2;
        for (let i = 0; i <= 4; i++) {
          g.beginPath();
          g.moveTo((i * s) / 4, 0);
          g.lineTo((i * s) / 4, s);
          g.moveTo(0, (i * s) / 4);
          g.lineTo(s, (i * s) / 4);
          g.stroke();
        }
      });
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ map: texFrom(con, true, 8), roughness: 0.95, color: 0x8a7a70 }));
      ground.rotation.x = -Math.PI / 2;
      S.scene.add(ground);
      const brick = cachedCanvas('v3brick', 256, 256, (g, s) => {
        const r = rng(8);
        g.fillStyle = '#3a2620';
        g.fillRect(0, 0, s, s);
        const bh = s / 12;
        for (let row = 0; row < 12; row++) {
          const off = (row % 2) * (s / 12);
          for (let x = -s / 6; x < s; x += s / 6) {
            g.fillStyle = `hsl(${10 + r() * 12}, ${35 + r() * 15}%, ${26 + r() * 12}%)`;
            g.fillRect(x + off + 2, row * bh + 2, s / 6 - 4, bh - 4);
          }
        }
        const gr = g.createLinearGradient(0, 0, 0, s * 0.25);
        gr.addColorStop(0, 'rgba(10,8,8,0.7)');
        gr.addColorStop(1, 'rgba(10,8,8,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, s, s * 0.25);
      });
      const bt = texFrom(brick, true);
      bt.wrapS = bt.wrapT = THREE.RepeatWrapping;
      bt.repeat.set(3, 4);
      const CH = new THREE.Vector3(-2.2, 3.4, -1.4);
      const chim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 3.4, 24), new THREE.MeshStandardMaterial({ map: bt, roughness: 0.9 }));
      chim.position.set(CH.x, 1.7, CH.z);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.5, 0.22, 24), new THREE.MeshStandardMaterial({ color: 0x2a2624, roughness: 0.8 }));
      rim.position.set(CH.x, 3.4, CH.z);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.4, 24), new THREE.MeshBasicMaterial({ color: 0x050403 }));
      hole.rotation.x = -Math.PI / 2;
      hole.position.set(CH.x, 3.515, CH.z);
      const shed = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.7, 2.2), new THREE.MeshStandardMaterial({ color: 0x3c3a3e, roughness: 0.85 }));
      shed.position.set(-3.6, 0.85, -2.6);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 2.4), new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.6 }));
      roof.position.set(-3.6, 1.76, -2.6);
      S.scene.add(chim, rim, hole, shed, roof);
      // 증기 관
      const metal = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.32, metalness: 0.85 });
      const pipe = new THREE.Group();
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 18), metal);
      tube.rotation.z = Math.PI / 2;
      tube.position.x = 1.3;
      const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.08, 18), metal);
      fl.rotation.z = Math.PI / 2;
      fl.position.x = 0.02;
      const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.18, 16), metal);
      noz.rotation.z = Math.PI / 2;
      noz.position.x = -0.1;
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 8, 24), new THREE.MeshStandardMaterial({ color: 0xc03020, roughness: 0.5, metalness: 0.3 }));
      wheel.position.set(0.9, 0.32, 0);
      wheel.rotation.x = Math.PI / 2;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 8), metal);
      stem.position.set(0.9, 0.2, 0);
      for (const px of [0.6, 2.2]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), metal);
        leg.position.set(px, -0.45, 0);
        pipe.add(leg);
      }
      pipe.add(tube, fl, noz, wheel, stem);
      pipe.position.set(1.4, 0.9, 0.8);
      S.scene.add(pipe);
      const grate = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.6, metalness: 0.6 }));
      grate.rotation.x = -Math.PI / 2;
      grate.position.set(-0.3, 0.01, 2.4);
      S.scene.add(grate);
      const smoke = S.pool(900, 2);
      const steam = S.pool(900, 3);
      const sparks = S.pool(200, 4);
      const SMOKE = ramp([[0, 0x2a2622, 1, 0, 0], [0.05, 0x2c2826, 1, 0.9, 0], [0.35, 0x4c4642, 1.05, 0.72, 0], [0.75, 0x7a7470, 1.1, 0.32, 0], [1, 0x9a9490, 1.1, 0, 0]]);
      const STEAM = ramp([[0, 0xffffff, 1.7, 0, 0.12], [0.05, 0xf6f8fa, 1.5, 0.7, 0.1], [0.4, 0xeef2f6, 1.4, 0.36, 0.06], [1, 0xe4e8ee, 1.4, 0, 0]]);
      const GSTEAM = ramp([[0, 0xffffff, 1.5, 0, 0.1], [0.2, 0xf0f4f8, 1.3, 0.2, 0.08], [1, 0xe0e6ec, 1.3, 0, 0]]);
      const JET = ramp([[0, 0xffffff, 2.4, 0.7, 0.3], [1, 0xffffff, 1.6, 0, 0.2]]);
      const EMB = ramp([[0, 0xffe0a0, 5, 1, 1], [0.5, 0xff6a10, 3, 0.85, 1], [1, 0x501000, 1, 0, 1]]);
      let wind = 1.1;
      let amount = 1;
      let burst = 99;
      let nextBurst = 2.2;
      let acc = 0;
      let accS = 0;
      let accG = 0;
      smoke.onStep = (p, i, dt) => {
        const lift = clamp((p.y[i]! - 3.5) * 0.4, 0, 1.6);
        p.x[i] = p.x[i]! + wind * dt * lift;
        p.z[i] = p.z[i]! - wind * dt * lift * 0.25;
      };
      // 처음부터 기둥이 서 있게 미리 돌리기
      const emitSmoke = (dt: number): void => {
        acc += dt * 13 * amount;
        while (acc >= 1) {
          acc -= 1;
          smoke.spawn({ x: CH.x + R(-0.15, 0.15), y: CH.y + 0.15, z: CH.z + R(-0.15, 0.15), vx: R(-0.15, 0.15), vy: R(1.0, 1.4), vz: R(-0.15, 0.15), life: R(5, 6.5), s0: R(0.45, 0.6), s1: R(2.6, 3.4), ramp: SMOKE, shape: 1, rot: R(-0.35, 0.35), rv: R(-0.06, 0.06), drag: 0.32, grav: -0.12, tag: 1 });
        }
      };
      for (let k = 0; k < 140; k++) {
        emitSmoke(0.05);
        smoke.step(0.05);
      }
      const controls: Control[] = [
        ctrlRange('바람', -1.5, 1.5, 0.05, 1.1, (v) => (wind = v)),
        ctrlRange('연기 양', 0.3, 2, 0.05, 1, (v) => (amount = v)),
        ctrlBtn('증기 뿜기', () => (burst = 0)),
      ];
      const NZ = new THREE.Vector3();
      return {
        scene: S.scene,
        camera: S.cam,
        controls,
        update(t, dt0) {
          const dt = Math.min(dt0, 0.05);
          emitSmoke(dt);
          if (Math.random() < dt * 2.5) sparks.spawn({ x: CH.x + R(-0.2, 0.2), y: CH.y + 0.2, z: CH.z, vx: R(-0.4, 0.4) + wind * 0.3, vy: R(1.5, 2.5), vz: R(-0.4, 0.4), life: R(0.6, 1.2), s0: 0.05, s1: 0.02, ramp: EMB, shape: 2, st: 0.05, grav: 0.8 });
          nextBurst -= dt;
          if (nextBurst <= 0) {
            burst = 0;
            nextBurst = 4.2;
          }
          burst += dt;
          noz.getWorldPosition(NZ);
          NZ.x -= 0.1;
          const on = burst < 1.4;
          if (on) {
            const k = burst / 1.4;
            const rate = 75 * (k < 0.15 ? 1.4 : 1 - k * 0.5);
            accS += dt * rate;
            while (accS >= 1) {
              accS -= 1;
              steam.spawn({ x: NZ.x, y: NZ.y + R(-0.03, 0.03), z: NZ.z + R(-0.03, 0.03), vx: -R(5, 7.5), vy: R(-0.3, 0.6), vz: R(-0.6, 0.6), life: R(1.0, 1.5), s0: 0.1, s1: R(1.0, 1.5), ramp: STEAM, shape: 1, rot: R(-0.4, 0.4), rv: R(-0.3, 0.3), drag: 2.7, grav: -1.1 });
            }
            if (burst < 0.35) for (let j = 0; j < 3; j++) steam.spawn({ x: NZ.x, y: NZ.y, z: NZ.z, vx: -R(9, 13), vy: R(-0.4, 0.4), vz: R(-0.6, 0.6), life: R(0.25, 0.4), s0: 0.05, ramp: JET, shape: 2, st: 0.05, drag: 3 });
            wheel.rotation.z += dt * 9;
            pipe.position.y = 0.9 + Math.sin(t * 90) * 0.006;
            lab.set('증기 — 하얗고 빠르게 퍼지다 금방 사라짐', '#e8f4ff');
          } else lab.set('연기 — 짙고 무겁게 오래 남아 바람에 휨', '#a89a90');
          accG += dt * 7;
          while (accG >= 1) {
            accG -= 1;
            steam.spawn({ x: -0.3 + R(-0.3, 0.3), y: 0.05, z: 2.4 + R(-0.3, 0.3), vx: wind * 0.2, vy: R(0.3, 0.5), life: R(2.5, 3.5), s0: 0.25, s1: 1.1, ramp: GSTEAM, shape: 1, rot: R(-0.4, 0.4), drag: 0.4, grav: -0.1 });
          }
          smoke.tick(dt);
          steam.tick(dt);
          sparks.tick(dt);
          S.tick(dt);
        },
        resize: (w, h) => S.resize(w, h),
        dispose: () => S.dispose(),
      };
    },
  },

  /* i505 플라즈마 구 */
  i505: {
    kind: '3d',
    caption: '유리 구 가운데 전극에서 흔들리며 갈라지는 빛 줄기 — 손가락을 대면 줄기가 그쪽으로 모여 굵고 밝아진다',
    make(): Scene3D {
      const S = makeStage({ bg: 0x040308, cam: [0, 1.85, 4.4], look: [0, 1.32, 0], fov: 40, fog: [6, 14] });
      const lab = S.hud.label('tl');
      const wood = groundCanvas('v3wood', '#2a1a12', [], 12, (g, s, r) => {
        for (let y = 0; y < s; y += 2) {
          g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,200,150'},${0.03 + r() * 0.05})`;
          g.fillRect(0, y + Math.sin(y * 0.05) * 3, s, 1 + r() * 2);
        }
      });
      S.scene.add(new THREE.HemisphereLight(0x302040, 0x080406, 0.5));
      const table = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ map: texFrom(wood, true, 4), roughness: 0.45 }));
      table.rotation.x = -Math.PI / 2;
      S.scene.add(table);
      const baseMat = new THREE.MeshStandardMaterial({ color: 0x141418, roughness: 0.28, metalness: 0.6 });
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.6, 0.5, 48), baseMat);
      base.position.y = 0.25;
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.1, 40), new THREE.MeshStandardMaterial({ color: 0x6a6a74, roughness: 0.25, metalness: 0.9 }));
      collar.position.y = 0.55;
      S.scene.add(base, collar);
      const C = new THREE.Vector3(0, 1.4, 0);
      const RG = 0.82;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, C.y - 0.6, 10), new THREE.MeshStandardMaterial({ color: 0x222228, roughness: 0.4, metalness: 0.8 }));
      stem.position.y = (C.y + 0.6) / 2;
      S.scene.add(stem);
      const glass = new THREE.Mesh(
        new THREE.SphereGeometry(RG, 64, 48),
        new THREE.ShaderMaterial({
          uniforms: { uCol: { value: new THREE.Color(0xd070ff) } },
          vertexShader: WORLD_VS,
          fragmentShader: /* glsl */ `uniform vec3 uCol; varying vec3 vW; varying vec3 vN;
            void main(){ vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vW); float ndv = max(dot(N, V), 0.0);
              float rim = pow(1.0 - ndv, 3.0);
              vec3 R1 = reflect(-V, N);
              float s1 = pow(max(dot(R1, normalize(vec3(-0.5, 0.8, 0.4))), 0.0), 60.0);
              float s2 = pow(max(dot(R1, normalize(vec3(0.7, 0.3, 0.6))), 0.0), 18.0) * 0.25;
              vec3 col = uCol * rim * 0.9 + vec3(1.0) * (s1 * 1.3 + s2) + uCol * 0.025;
              gl_FragColor = vec4(col, 1.0); ${TONE}
              gl_FragColor.a = 1.0; }`,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      glass.position.copy(C);
      glass.renderOrder = 6;
      S.scene.add(glass);
      const elecMat = new THREE.ShaderMaterial({
        uniforms: { uCol: { value: new THREE.Color(0xffc0ff).multiplyScalar(3) } },
        vertexShader: WORLD_VS,
        fragmentShader: /* glsl */ `uniform vec3 uCol; varying vec3 vW; varying vec3 vN;
          void main(){ vec3 V = normalize(cameraPosition - vW); float f = max(dot(normalize(vN), V), 0.0);
            gl_FragColor = vec4(uCol * (0.5 + 1.2 * f * f), 1.0); ${TONE} }`,
      });
      const elec = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 16), elecMat);
      elec.position.copy(C);
      S.scene.add(elec);
      const fill = new THREE.DirectionalLight(0xffe0d0, 0.5);
      fill.position.set(2, 3, 5);
      S.scene.add(fill);
      const light = new THREE.PointLight(0xc060ff, 3, 8, 1.6);
      light.position.copy(C);
      S.scene.add(light);
      const pad = glowDisc(0xa040ff, 0.9, 2.6, 3.5);
      S.scene.add(pad.mesh);
      // 손가락
      const skin = new THREE.MeshStandardMaterial({ color: 0xd8a080, roughness: 0.6 });
      const finger = new THREE.Group();
      const f1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.55, 6, 14), skin);
      f1.rotation.x = Math.PI / 2;
      f1.position.z = 0.33;
      const nail = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshStandardMaterial({ color: 0xf0c8b8, roughness: 0.3 }));
      nail.scale.set(1, 0.4, 1.3);
      nail.position.set(0, 0.06, 0.1);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 12), skin);
      hand.scale.set(1.1, 0.7, 1.4);
      hand.position.set(0, -0.05, 0.85);
      finger.add(f1, nail, hand);
      S.scene.add(finger);
      const P = S.pool(4000, 5);
      const COLS = [
        [0xffd8ff, 0xc040ff, 0xff60e0],
        [0xd8f0ff, 0x3a70ff, 0x60c0ff],
        [0xe0ffe8, 0x20d060, 0x80ffb0],
      ];
      let pal = 0;
      let CORE = flat(COLS[0]![0]!, 3.2, 1);
      let HALO = flat(COLS[0]![1]!, 0.9, 0.45);
      let TIP = flat(COLS[0]![2]!, 4, 1);
      const setPal = (i: number): void => {
        pal = i;
        const c = COLS[i]!;
        CORE = flat(c[0]!, 3.2, 1);
        HALO = flat(c[1]!, 0.9, 0.45);
        TIP = flat(c[2]!, 4, 1);
        (glass.material as THREE.ShaderMaterial).uniforms.uCol!.value.setHex(c[2]!);
        light.color.setHex(c[1]!);
        pad.set(0.9, c[1]!);
      };
      let NT = 8;
      let autoTouch = true;
      const phase = Array.from({ length: 14 }, () => [R(0, TAU), R(0, TAU), R(0, TAU), R(0, TAU), R(0, TAU)]);
      const baseDir = Array.from({ length: 14 }, (_, i) => {
        const y = 1 - ((i + 0.5) / 14) * 1.5;
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        const a = i * 2.39996;
        return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
      });
      const ends = baseDir.map((v) => v.clone());
      const e = new THREE.Vector3();
      const u = new THREE.Vector3();
      const w = new THREE.Vector3();
      const p = new THREE.Vector3();
      const q = new THREE.Vector3();
      const tan = new THREE.Vector3();
      const T = new THREE.Vector3();
      const UP = new THREE.Vector3(0, 1, 0);
      const strand = (from: THREE.Vector3, dir: THREE.Vector3, len: number, n: number, ph: number[], t: number, thick: number, bright: number, wob: number): void => {
        u.crossVectors(dir, Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP).normalize();
        w.crossVectors(dir, u);
        const bend = Math.sin(t * 0.9 + ph[0]!) * 0.1;
        q.copy(from);
        for (let k = 1; k <= n; k++) {
          const s = k / n;
          const env = Math.pow(Math.sin(Math.PI * Math.min(s, 0.98)), 0.7) * wob;
          const a1 = Math.sin(s * 9 + t * 5.3 + ph[1]!) * 0.05 + Math.sin(s * 23 + t * 11 + ph[2]!) * 0.016 + bend * Math.sin(Math.PI * s);
          const a2 = Math.sin(s * 13 - t * 6.1 + ph[3]!) * 0.04 + Math.sin(s * 29 - t * 13 + ph[4]!) * 0.012;
          p.copy(from).addScaledVector(dir, len * s).addScaledVector(u, a1 * env).addScaledVector(w, a2 * env);
          tan.subVectors(p, q);
          const L = tan.length();
          tan.normalize().multiplyScalar(L * 1.25);
          const mx = (p.x + q.x) / 2;
          const my = (p.y + q.y) / 2;
          const mz = (p.z + q.z) / 2;
          P.spawn({ x: mx, y: my, z: mz, vx: tan.x, vy: tan.y, vz: tan.z, life: 1, s0: 0.022 * thick, ramp: CORE, br: bright, st: 1, shape: 0 });
          if (k % 2 === 0) P.spawn({ x: mx, y: my, z: mz, life: 1, s0: 0.12 * thick, ramp: HALO, br: bright, shape: 0 });
          q.copy(p);
        }
      };
      const controls: Control[] = [
        ctrlRange('줄기 수', 3, 14, 1, 8, (v) => (NT = v)),
        ctrlTog('손가락 대기 (자동)', true, (v) => (autoTouch = v)),
        ctrlRange('색 (0 보라 · 1 파랑 · 2 초록)', 0, 2, 1, 0, (v) => setPal(v)),
      ];
      let tc = 0;
      return {
        scene: S.scene,
        camera: S.cam,
        controls,
        update(t, dt0) {
          const dt = Math.min(dt0, 0.05);
          tc = (tc + dt) % 7;
          P.clear();
          // 손가락: 3초 ~ 6초 사이 유리에 닿음
          let touch = 0;
          if (autoTouch) {
            if (tc > 2.6 && tc < 6.4) touch = smooth((tc - 2.6) / 0.6) * (1 - smooth((tc - 5.8) / 0.6));
          }
          T.set(0.75, 0.32 + 0.15 * Math.sin(t * 0.5), 0.6 + 0.2 * Math.sin(t * 0.37)).normalize();
          finger.visible = touch > 0.001;
          finger.position.copy(C).addScaledVector(T, RG + 0.04 + (1 - touch) * 0.8);
          finger.lookAt(C.x + T.x * 10, C.y + T.y * 10, C.z + T.z * 10);
          const contact = touch > 0.95;
          let tot = 0;
          for (let i = 0; i < NT; i++) {
            const ph = phase[i]!;
            e.copy(baseDir[i]!).addScaledVector(new THREE.Vector3(Math.sin(t * 0.7 + ph[0]!), Math.sin(t * 0.53 + ph[1]!) * 0.7, Math.sin(t * 0.61 + ph[2]!)), 0.55);
            if (e.y < -0.45) e.y = -0.45;
            e.normalize();
            const pull = contact ? (i < 2 ? 0.96 : 0.28) : 0;
            e.lerp(T, pull).normalize();
            ends[i]!.lerp(e, 1 - Math.exp(-dt * (contact ? 14 : 6)));
            ends[i]!.normalize();
            const d = ends[i]!;
            const fl = 0.78 + 0.22 * Math.sin(t * 17 + ph[3]! * 3) * Math.sin(t * 7.3 + ph[4]!);
            const main = contact && i < 2;
            const thick = main ? 2.1 : 1;
            const bright = fl * (main ? 1.7 : 1);
            tot += bright;
            const from = new THREE.Vector3().copy(C).addScaledVector(d, 0.12);
            strand(from, d, RG - 0.14, 30, ph, t, thick, bright, 1);
            // 갈래
            for (const fs of [0.55, 0.78]) {
              const bp = new THREE.Vector3().copy(C).addScaledVector(d, 0.12 + (RG - 0.14) * fs);
              const bd = new THREE.Vector3(Math.sin(t * 1.3 + ph[1]! + fs * 7), Math.cos(t * 1.1 + ph[2]!), Math.sin(t * 0.9 + ph[0]! - fs * 5)).multiplyScalar(0.8).add(d).normalize();
              strand(bp, bd, (RG - 0.14) * (1 - fs) * 0.8, 8, ph, t * 1.3, thick * 0.6, bright * 0.7, 0.6);
            }
            const tip = new THREE.Vector3().copy(C).addScaledVector(d, RG - 0.015);
            P.spawn({ x: tip.x, y: tip.y, z: tip.z, life: 1, s0: 0.1 * thick, ramp: TIP, br: bright, shape: 0 });
            P.spawn({ x: tip.x, y: tip.y, z: tip.z, life: 1, s0: 0.34 * thick, ramp: HALO, br: bright * 0.8, shape: 0 });
          }
          P.spawn({ x: C.x, y: C.y, z: C.z, life: 1, s0: 0.55, ramp: HALO, br: 1.2, shape: 0 });
          P.upload();
          light.intensity = 1.2 + tot * 0.25;
          lab.set(contact ? '손가락을 대면 — 빛 줄기가 한 곳으로 모여 굵고 밝아짐' : '빛 줄기 — 전극에서 유리까지 흔들리며 갈라짐', ['#e070ff', '#60a0ff', '#40e090'][pal]!);
          S.tick(dt);
        },
        resize: (w0, h0) => S.resize(w0, h0),
        dispose: () => S.dispose(),
      };
    },
  },

  /* i506 물감 · 잉크 튀김 */
  i506: {
    kind: '3d',
    caption: '날아온 물감 덩이가 벽에 철퍽 — 가운데 덩이 · 가시 · 위성 방울 자국이 남고, 아래로 흘러내리며 튄 방울은 바닥에 작은 자국',
    make(): Scene3D {
      const S = makeStage({ bg: 0xd6dbe2, cam: [-0.6, 1.7, 5.6], look: [0, 1.45, -1.2], fov: 44 });
      const lab = S.hud.label('tl');
      S.scene.add(new THREE.HemisphereLight(0xffffff, 0xb8b0a4, 1.3));
      const sunL = new THREE.DirectionalLight(0xffffff, 1.9);
      sunL.position.set(3, 5, 5);
      S.scene.add(sunL);
      const WW = 7;
      const WH = 3.6;
      const CW = 700;
      const CHh = 360;
      const mk = (w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        return [c, c.getContext('2d')!];
      };
      // 벽: 색 · 높이(볼록) · 거칠기(물감은 반들) 세 장
      const [wc, wg] = mk(CW, CHh);
      const [hc, hg] = mk(CW, CHh);
      const [rc, rgc] = mk(CW, CHh);
      const [bc, bg] = mk(CW, CHh);
      {
        const r = rng(4);
        bg.fillStyle = '#e9e6e0';
        bg.fillRect(0, 0, CW, CHh);
        for (let i = 0; i < 4000; i++) {
          bg.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.05)';
          bg.fillRect(r() * CW, r() * CHh, 2, 2);
        }
        bg.strokeStyle = 'rgba(0,0,0,0.08)';
        bg.lineWidth = 2;
        for (let x = 0; x <= CW; x += CW / 7) {
          bg.beginPath();
          bg.moveTo(x, 0);
          bg.lineTo(x, CHh);
          bg.stroke();
        }
      }
      const resetWall = (): void => {
        wg.globalAlpha = 1;
        wg.drawImage(bc, 0, 0);
        hg.fillStyle = '#000';
        hg.fillRect(0, 0, CW, CHh);
        rgc.fillStyle = '#e0e0e0';
        rgc.fillRect(0, 0, CW, CHh);
      };
      resetWall();
      const wTex = new THREE.CanvasTexture(wc);
      wTex.colorSpace = THREE.SRGBColorSpace;
      const hTex = new THREE.CanvasTexture(hc);
      const rTex = new THREE.CanvasTexture(rc);
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(WW, WH), new THREE.MeshStandardMaterial({ map: wTex, bumpMap: hTex, bumpScale: 4, roughnessMap: rTex, roughness: 1, metalness: 0 }));
      wall.position.set(0, WH / 2, -1.5);
      S.scene.add(wall);
      const FW = 9;
      const FD = 6;
      const [fc, fg] = mk(540, 360);
      const [fhc, fhg] = mk(540, 360);
      const [fbc, fbg] = mk(540, 360);
      {
        fbg.fillStyle = '#cfcac2';
        fbg.fillRect(0, 0, 540, 360);
        fbg.strokeStyle = 'rgba(0,0,0,0.12)';
        fbg.lineWidth = 2;
        for (let x = 0; x <= 540; x += 60) {
          fbg.beginPath();
          fbg.moveTo(x, 0);
          fbg.lineTo(x, 360);
          fbg.stroke();
        }
        for (let y = 0; y <= 360; y += 60) {
          fbg.beginPath();
          fbg.moveTo(0, y);
          fbg.lineTo(540, y);
          fbg.stroke();
        }
      }
      const resetFloor = (): void => {
        fg.globalAlpha = 1;
        fg.drawImage(fbc, 0, 0);
        fhg.fillStyle = '#000';
        fhg.fillRect(0, 0, 540, 360);
      };
      resetFloor();
      const fTex = new THREE.CanvasTexture(fc);
      fTex.colorSpace = THREE.SRGBColorSpace;
      const fhTex = new THREE.CanvasTexture(fhc);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(FW, FD), new THREE.MeshStandardMaterial({ map: fTex, bumpMap: fhTex, bumpScale: 3, roughness: 0.75 }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(0, 0, -1.5 + FD / 2);
      S.scene.add(floor);
      const COLS = ['#ff7a1a', '#14c4e6', '#e82a8c', '#8ee020', '#7a44ff'];
      const splat = (g: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, dirA: number, seed: number, blur: number): void => {
        const q = rng(seed);
        g.save();
        g.fillStyle = col;
        g.strokeStyle = col;
        if (blur) g.filter = `blur(${blur}px)`;
        const el = (a: number): number => 1 + 0.45 * Math.max(0, Math.cos(a - dirA));
        g.beginPath();
        const p1 = q() * 6;
        const p2 = q() * 6;
        for (let k = 0; k <= 56; k++) {
          const a = (k / 56) * TAU;
          const rr = r * (0.86 + 0.16 * Math.sin(a * 3 + p1) + 0.09 * Math.sin(a * 7 + p2) + 0.05 * Math.sin(a * 13)) * el(a);
          const px = x + Math.cos(a) * rr;
          const py = y + Math.sin(a) * rr;
          if (k) g.lineTo(px, py);
          else g.moveTo(px, py);
        }
        g.fill();
        const ns = 11 + Math.floor(q() * 6);
        for (let i = 0; i < ns; i++) {
          const a = q() < 0.5 ? dirA + (q() - 0.5) * 2.2 : q() * TAU;
          const L = r * (1.15 + q() * 1.3) * el(a);
          const w0 = r * (0.14 + q() * 0.16);
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          g.beginPath();
          g.moveTo(x - sa * w0, y + ca * w0);
          g.quadraticCurveTo(x + ca * L * 0.6 - sa * w0 * 0.25, y + sa * L * 0.6 + ca * w0 * 0.25, x + ca * L, y + sa * L);
          g.quadraticCurveTo(x + ca * L * 0.6 + sa * w0 * 0.25, y + sa * L * 0.6 - ca * w0 * 0.25, x + sa * w0, y - ca * w0);
          g.fill();
          g.beginPath();
          g.arc(x + ca * L, y + sa * L, w0 * 0.55, 0, TAU);
          g.fill();
        }
        const nd = 22 + Math.floor(q() * 10);
        for (let i = 0; i < nd; i++) {
          const a = q() < 0.6 ? dirA + (q() - 0.5) * 2.0 : q() * TAU;
          const dd = r * (1.4 + Math.pow(q(), 0.8) * 2.2) * el(a);
          const rr = r * (0.16 - (dd / (r * 4)) * 0.11) * (0.5 + q());
          g.beginPath();
          g.ellipse(x + Math.cos(a) * dd, y + Math.sin(a) * dd, Math.max(0.8, rr * 1.5), Math.max(0.8, rr), a, 0, TAU);
          g.fill();
        }
        g.restore();
      };
      interface Drip {
        x: number;
        y: number;
        len: number;
        max: number;
        w: number;
        col: string;
        sp: number;
      }
      const drips: Drip[] = [];
      interface Blob {
        p: THREE.Vector3;
        v: THREE.Vector3;
        r: number;
        col: number;
        main: boolean;
        alive: boolean;
      }
      const blobs: Blob[] = [];
      const MAXB = 80;
      const im = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshStandardMaterial({ roughness: 0.2, metalness: 0 }), MAXB);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      for (let i = 0; i < MAXB; i++) im.setColorAt(i, new THREE.Color(1, 1, 1));
      S.scene.add(im);
      const START = new THREE.Vector3(-4.8, 1.0, 1.6);
      let ci = 0;
      let size = 1;
      let dripOn = true;
      let count = 0;
      let next = 0.3;
      let fade = 0;
      const throwBlob = (): void => {
        const tx = R(-2.6, 2.6);
        const ty = R(0.9, 2.9);
        const T = 0.55;
        const v = new THREE.Vector3((tx - START.x) / T, (ty - START.y) / T + 0.5 * 9.8 * T, (-1.5 - START.z) / T);
        blobs.push({ p: START.clone(), v, r: 0.13 * size, col: ci, main: true, alive: true });
        ci = (ci + 1) % COLS.length;
      };
      let dirty = 0;
      const hit = (b: Blob): void => {
        const u = (b.p.x + WW / 2) / WW;
        const vv = 1 - b.p.y / WH;
        const px = u * CW;
        const py = vv * CHh;
        const dirA = Math.atan2(-b.v.y, b.v.x);
        const rpx = (b.r / WW) * CW * 2.1;
        const seed = Math.floor(Math.random() * 1e6);
        const col = COLS[b.col]!;
        splat(wg, px, py, rpx, col, dirA, seed, 0);
        splat(hg, px, py, rpx, '#ffffff', dirA, seed, 2);
        splat(rgc, px, py, rpx, '#303030', dirA, seed, 0);
        if (dripOn)
          for (let k = 0; k < 3 + Math.floor(Math.random() * 3); k++) drips.push({ x: px + R(-0.7, 0.7) * rpx, y: py + rpx * 0.5, len: 0, max: R(25, 95) * size, w: R(2.5, 5) * size, col, sp: R(30, 60) });
        // 되튀는 방울
        for (let k = 0; k < 12; k++) {
          const a = R(0, TAU);
          blobs.push({ p: new THREE.Vector3(b.p.x, b.p.y, -1.42), v: new THREE.Vector3(Math.cos(a) * R(0.5, 2.2), Math.sin(a) * R(0.5, 2.2) + 1, R(0.6, 2.4)), r: R(0.018, 0.04) * size, col: b.col, main: false, alive: true });
        }
        S.shake = Math.max(S.shake, 0.025);
        dirty = 1;
        lab.set('철퍽! — 덩이 · 가시 · 위성 방울 자국이 벽에 남음', COLS[b.col]!);
      };
      const floorHit = (b: Blob): void => {
        const px = ((b.p.x + FW / 2) / FW) * 540;
        const py = ((b.p.z - (-1.5)) / FD) * 360;
        const seed = Math.floor(Math.random() * 1e6);
        const rr = (b.r / FW) * 540 * 2.2;
        const a = Math.atan2(b.v.z, b.v.x);
        splat(fg, px, py, rr, COLS[b.col]!, a, seed, 0);
        splat(fhg, px, py, rr, '#ffffff', a, seed, 1.5);
        dirty = 1;
      };
      const M = new THREE.Matrix4();
      const Q = new THREE.Quaternion();
      const SC = new THREE.Vector3();
      const Z = new THREE.Vector3(0, 1, 0);
      const tmpC = new THREE.Color();
      const controls: Control[] = [
        ctrlRange('덩이 크기', 0.6, 1.8, 0.05, 1, (v) => (size = v)),
        ctrlTog('흘러내림', true, (v) => (dripOn = v)),
        ctrlBtn('벽 닦기', () => (fade = 1)),
      ];
      let dripAcc = 0;
      return {
        scene: S.scene,
        camera: S.cam,
        controls,
        update(t, dt0) {
          const dt = Math.min(dt0, 0.05);
          next -= dt;
          if (next <= 0 && fade <= 0) {
            throwBlob();
            count++;
            next = count % 7 === 0 ? 2.2 : 0.75;
            if (count % 7 === 0) fade = 2.0;
            lab.set('물감 덩이 날아감', COLS[(ci + COLS.length - 1) % COLS.length]!);
          }
          for (const b of blobs) {
            if (!b.alive) continue;
            b.v.y -= 9.8 * dt;
            b.p.addScaledVector(b.v, dt);
            if (b.main && b.p.z <= -1.5) {
              b.p.z = -1.5;
              b.alive = false;
              hit(b);
            } else if (!b.main && b.p.y <= 0.02) {
              b.alive = false;
              floorHit(b);
            }
          }
          for (let i = blobs.length - 1; i >= 0; i--) if (!blobs[i]!.alive) blobs.splice(i, 1);
          let n = 0;
          for (const b of blobs) {
            if (n >= MAXB) break;
            const sp = b.v.length();
            const st = b.main ? 1 + Math.min(0.3, sp * 0.02) : 1 + Math.min(1.5, sp * 0.25);
            const wob = b.main ? 1 + Math.sin(t * 30) * 0.08 : 1;
            Q.setFromUnitVectors(Z, SC.copy(b.v).normalize());
            M.compose(b.p, Q, SC.set(b.r * wob / Math.sqrt(st), b.r * st, b.r * wob / Math.sqrt(st)));
            im.setMatrixAt(n, M);
            im.setColorAt(n, tmpC.set(COLS[b.col]!).convertSRGBToLinear());
            n++;
          }
          im.count = n;
          im.instanceMatrix.needsUpdate = true;
          if (im.instanceColor) im.instanceColor.needsUpdate = true;
          // 흘러내림
          dripAcc += dt;
          if (dripAcc > 1 / 30) {
            const st = dripAcc;
            dripAcc = 0;
            for (const d of drips) {
              if (d.len >= d.max) continue;
              const k = d.len / d.max;
              d.len = Math.min(d.max, d.len + d.sp * st * (1 - k * 0.8));
              const w = d.w * (1 - k * 0.35);
              const y = d.y + d.len;
              wg.fillStyle = d.col;
              wg.beginPath();
              wg.arc(d.x, y, w, 0, TAU);
              wg.fill();
              hg.fillStyle = '#ffffff';
              hg.beginPath();
              hg.arc(d.x, y, w * 0.9, 0, TAU);
              hg.fill();
              rgc.fillStyle = '#303030';
              rgc.beginPath();
              rgc.arc(d.x, y, w, 0, TAU);
              rgc.fill();
              dirty = 1;
            }
            for (let i = drips.length - 1; i >= 0; i--) if (drips[i]!.len >= drips[i]!.max) drips.splice(i, 1);
            if (fade > 0) {
              wg.globalAlpha = 0.12;
              wg.drawImage(bc, 0, 0);
              wg.globalAlpha = 1;
              hg.fillStyle = 'rgba(0,0,0,0.12)';
              hg.fillRect(0, 0, CW, CHh);
              rgc.fillStyle = 'rgba(224,224,224,0.12)';
              rgc.fillRect(0, 0, CW, CHh);
              fg.globalAlpha = 0.12;
              fg.drawImage(fbc, 0, 0);
              fg.globalAlpha = 1;
              fhg.fillStyle = 'rgba(0,0,0,0.12)';
              fhg.fillRect(0, 0, 540, 360);
              dirty = 1;
            }
            if (dirty) {
              wTex.needsUpdate = hTex.needsUpdate = rTex.needsUpdate = true;
              fTex.needsUpdate = fhTex.needsUpdate = true;
              dirty = 0;
            }
          }
          if (fade > 0) {
            fade -= dt;
            if (fade <= 0) {
              resetWall();
              resetFloor();
              drips.length = 0;
              dirty = 1;
            }
            if (fade < 1.8) lab.set('벽 닦는 중 — 다시 던지기', '#8a96a8');
          } else if (drips.length) lab.set('흘러내림 — 물감이 아래로 줄을 그으며 흐름', '#e8a040');
          S.tick(dt);
        },
        resize: (w, h) => S.resize(w, h),
        dispose: () => {
          S.dispose();
          wTex.dispose();
          hTex.dispose();
          rTex.dispose();
          fTex.dispose();
          fhTex.dispose();
        },
      };
    },
  },

  /* i507 데이터 분해 · 전송 (복셀 디졸브) */
  i507: {
    kind: '3d',
    caption: '칸 단위로 잘린 경계가 위에서 아래로 내려가며 몸이 정육면체 조각으로 떠올라 흩어지고, 다시 날아와 아래부터 조립된다',
    make(): Scene3D {
      const S = makeStage({ bg: 0x04060b, cam: [0.3, 1.55, 4.3], look: [0, 0.95, 0], fov: 40, fog: [7, 16] });
      const lab = S.hud.label('tl');
      const CYAN = new THREE.Color(0x30e0ff);
      const ORANGE = new THREE.Color(0xff8a20);
      const col = CYAN.clone();
      const floorMat = new THREE.ShaderMaterial({
        uniforms: { uCol: { value: col }, uTime: { value: 0 } },
        vertexShader: WORLD_VS,
        fragmentShader: /* glsl */ `uniform vec3 uCol; uniform float uTime; varying vec3 vW;
          void main(){ vec2 p = vW.xz; vec2 g = abs(fract(p * 2.0) - 0.5); float line = 1.0 - smoothstep(0.0, 0.025, min(g.x, g.y));
            vec2 g2 = abs(fract(p * 0.5) - 0.5); float line2 = 1.0 - smoothstep(0.0, 0.012, min(g2.x, g2.y));
            float d = length(p); float fade = 1.0 - smoothstep(2.0, 9.0, d);
            float pulse = exp(-pow(d - mod(uTime * 1.5, 9.0), 2.0) * 3.0);
            vec3 col = vec3(0.015, 0.02, 0.03) + uCol * (line * 0.12 + line2 * 0.25) * fade * (1.0 + pulse * 2.0);
            gl_FragColor = vec4(col, 1.0); ${TONE} }`,
      });
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), floorMat);
      floor.rotation.x = -Math.PI / 2;
      S.scene.add(floor);
      const padM = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.06, 48), new THREE.MeshStandardMaterial({ color: 0x1a1e26, roughness: 0.35, metalness: 0.8 }));
      padM.position.y = 0.03;
      const ringMat = new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(3) });
      const padRing = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.012, 8, 64), ringMat);
      padRing.rotation.x = Math.PI / 2;
      padRing.position.y = 0.065;
      S.scene.add(padM, padRing, new THREE.HemisphereLight(0x8090b0, 0x101010, 0.8));
      const geo = figureGeo('stand');
      const figMat = new THREE.ShaderMaterial({
        uniforms: { uCut: { value: 2 }, uCol: { value: col }, uTime: { value: 0 }, uCell: { value: 14 } },
        vertexShader: WORLD_VS,
        fragmentShader: /* glsl */ `uniform float uCut, uTime, uCell; uniform vec3 uCol; varying vec3 vW; varying vec3 vN;
          ${SHADE_GLSL}
          float h31(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
          void main(){ vec3 cell = floor(vW * uCell); float h = h31(cell);
            float d = uCut + (h - 0.5) * 0.24 - vW.y;
            if (d < 0.0) discard;
            vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vW);
            vec3 base = vec3(0.34, 0.37, 0.43);
            float band = step(0.5, fract(vW.y * 6.0 + 0.25)) * 0.06;
            vec3 c = shade(base - band, N, V, normalize(vec3(-0.5, 0.8, 0.6)), vec3(1.0, 0.97, 0.92));
            vec3 Rf = reflect(-V, N); c += mix(vec3(0.02, 0.03, 0.05), vec3(0.25, 0.3, 0.38), smoothstep(-0.2, 0.8, Rf.y)) * 0.6;
            c += uCol * pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.5;
            float edge = 1.0 - smoothstep(0.0, 0.06, d);
            vec3 f = fract(vW * uCell); float grid = max(max(step(0.88, f.x), step(0.88, f.y)), step(0.88, f.z));
            float near = exp(-d * 9.0);
            c = mix(c, uCol * 0.6, near * 0.5);
            c += uCol * (edge * 5.0 + grid * near * 1.6) + uCol * (1.0 - smoothstep(0.0, 0.035, abs(fract(vW.y * 6.0) - 0.5))) * 0.7;
            gl_FragColor = vec4(c, 1.0); ${TONE} }`,
      });
      const fig = new THREE.Mesh(geo, figMat);
      fig.position.y = 0.06;
      S.scene.add(fig);
      const NS = 3200;
      const samp = surfacePoints(geo, NS);
      const idx = Array.from({ length: NS }, (_, i) => i).sort((a, b) => samp[b * 6 + 1]! - samp[a * 6 + 1]!);
      // 훑는 고리 · 판
      const scanMat = new THREE.ShaderMaterial({
        uniforms: { uCol: { value: col }, uA: { value: 0 } },
        vertexShader: FLAT_VS,
        fragmentShader: /* glsl */ `uniform vec3 uCol; uniform float uA; varying vec2 vUv;
          void main(){ vec2 p = vUv * 2.0 - 1.0; float r = length(p);
            vec2 g = abs(fract(p * 6.0) - 0.5); float grid = 1.0 - smoothstep(0.0, 0.05, min(g.x, g.y));
            float ring = exp(-pow((r - 0.92) * 30.0, 2.0));
            float a = (ring * 1.2 + grid * 0.18 * (1.0 - r)) * (1.0 - smoothstep(0.95, 1.0, r)) * uA;
            gl_FragColor = vec4(uCol * 3.0, 1.0); ${TONE} gl_FragColor.a = a; }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const scan = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), scanMat);
      scan.rotation.x = -Math.PI / 2;
      S.scene.add(scan);
      // 조각
      const MAXV = 1600;
      const vox = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAXV);
      vox.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      vox.frustumCulled = false;
      for (let i = 0; i < MAXV; i++) vox.setColorAt(i, new THREE.Color(1, 1, 1));
      S.scene.add(vox);
      interface Vx {
        x: number;
        y: number;
        z: number;
        vx: number;
        vy: number;
        vz: number;
        age: number;
        life: number;
        s: number;
        mode: number;
        tx: number;
        ty: number;
        tz: number;
        sx: number;
        sy: number;
        sz: number;
      }
      const V: Vx[] = [];
      const glow = S.pool(600, 5);
      const SPARK = ramp([[0, 0xffffff, 6, 1, 1], [1, 0x30e0ff, 2, 0, 1]]);
      let speed = 1;
      let vsz = 1;
      let orange = false;
      let ptrD = 0;
      let ptrA = NS - 1;
      let cyc = 0;
      const CY = 8;
      const M = new THREE.Matrix4();
      const tc = new THREE.Color();
      const controls: Control[] = [
        ctrlRange('속도', 0.4, 1.6, 0.05, 1, (v) => (speed = v)),
        ctrlRange('조각 크기', 0.6, 1.8, 0.05, 1, (v) => (vsz = v)),
        ctrlTog('주황 (다른 색)', false, (v) => {
          orange = v;
          col.copy(v ? ORANGE : CYAN);
          ringMat.color.copy(col).multiplyScalar(3);
        }),
      ];
      return {
        scene: S.scene,
        camera: S.cam,
        controls,
        update(t, dt0) {
          const dt = Math.min(dt0, 0.05) * speed;
          const prev = cyc;
          cyc = (cyc + dt) % CY;
          if (cyc < prev) {
            ptrD = 0;
            ptrA = NS - 1;
          }
          figMat.uniforms.uTime!.value = t;
          floorMat.uniforms.uTime!.value = t;
          figMat.uniforms.uCell!.value = 14 / vsz;
          const TOP = 1.95;
          const BOT = -0.05;
          let cut = TOP;
          let mode = 0;
          if (cyc < 1) {
            cut = TOP;
            lab.set('대기', orange ? '#ff9a40' : '#40e0ff');
          } else if (cyc < 3.2) {
            cut = lerp(TOP, BOT, smooth((cyc - 1) / 2.2));
            mode = 1;
            lab.set('분해 — 경계가 내려가며 조각으로 떠오름', orange ? '#ff9a40' : '#40e0ff');
          } else if (cyc < 4.6) {
            cut = BOT;
            mode = 2;
            lab.set('전송 중 — 데이터 기둥', orange ? '#ff9a40' : '#40e0ff');
          } else if (cyc < 6.8) {
            cut = lerp(BOT, TOP, smooth((cyc - 4.6) / 2.2));
            mode = 3;
            lab.set('조립 — 조각이 날아와 아래부터 맞춰짐', orange ? '#ff9a40' : '#40e0ff');
          } else lab.set('완료', orange ? '#ff9a40' : '#40e0ff');
          figMat.uniforms.uCut!.value = cut;
          const wy = cut - 0.06;
          const sc = mode === 1 || mode === 3;
          scan.visible = sc;
          scan.position.y = cut + 0.06;
          scanMat.uniforms.uA!.value = sc ? 1 : 0;
          const cell = 0.072 * vsz;
          if (mode === 1) {
            while (ptrD < NS) {
              const i = idx[ptrD]!;
              if (samp[i * 6 + 1]! < wy + 0.1) break;
              ptrD++;
              if (Math.random() < 0.55 && V.length < MAXV) {
                const nx = samp[i * 6 + 3]!;
                const nz = samp[i * 6 + 5]!;
                V.push({ x: samp[i * 6]!, y: samp[i * 6 + 1]! + 0.06, z: samp[i * 6 + 2]!, vx: nx * R(0.15, 0.5) + R(-0.1, 0.1), vy: R(0.5, 1.3), vz: nz * R(0.15, 0.5) + R(-0.1, 0.1), age: 0, life: R(0.9, 1.7), s: cell * R(0.45, 1), mode: 0, tx: 0, ty: 0, tz: 0, sx: 0, sy: 0, sz: 0 });
                if (Math.random() < 0.08) glow.spawn({ x: samp[i * 6]!, y: samp[i * 6 + 1]! + 0.06, z: samp[i * 6 + 2]!, life: 0.3, s0: 0.1, ramp: SPARK, shape: 4 });
              }
            }
          } else if (mode === 2) {
            for (let k = 0; k < 6; k++) {
              if (V.length >= MAXV) break;
              const a = R(0, TAU);
              const rr = Math.sqrt(Math.random()) * 0.45;
              V.push({ x: Math.cos(a) * rr, y: 0.1, z: Math.sin(a) * rr, vx: 0, vy: R(2.5, 4.5), vz: 0, age: 0, life: R(0.5, 0.9), s: cell * R(0.3, 0.6), mode: 0, tx: 0, ty: 0, tz: 0, sx: 0, sy: 0, sz: 0 });
            }
          } else if (mode === 3) {
            while (ptrA >= 0) {
              const i = idx[ptrA]!;
              if (samp[i * 6 + 1]! > wy + 0.32) break;
              ptrA--;
              if (Math.random() < 0.5 && V.length < MAXV) {
                const tx = samp[i * 6]!;
                const ty = samp[i * 6 + 1]! + 0.06;
                const tz = samp[i * 6 + 2]!;
                const sx = tx + samp[i * 6 + 3]! * R(0.5, 1.2) + R(-0.4, 0.4);
                const sy = ty + R(0.6, 1.4);
                const sz = tz + samp[i * 6 + 5]! * R(0.5, 1.2) + R(-0.4, 0.4);
                V.push({ x: sx, y: sy, z: sz, vx: 0, vy: 0, vz: 0, age: 0, life: R(0.4, 0.55), s: cell * R(0.45, 1), mode: 1, tx, ty, tz, sx, sy, sz });
              }
            }
          }
          let n = 0;
          for (let i = V.length - 1; i >= 0; i--) {
            const v = V[i]!;
            v.age += dt;
            const k = v.age / v.life;
            if (k >= 1) {
              if (v.mode === 1 && Math.random() < 0.15) glow.spawn({ x: v.tx, y: v.ty, z: v.tz, life: 0.25, s0: 0.12, ramp: SPARK, shape: 4 });
              V[i] = V[V.length - 1]!;
              V.pop();
              continue;
            }
            let x: number;
            let y: number;
            let z: number;
            let s: number;
            let bright: number;
            if (v.mode === 0) {
              v.x += v.vx * dt;
              v.y += v.vy * dt;
              v.z += v.vz * dt;
              if (Math.random() < dt * 4) v.x += (Math.random() < 0.5 ? -1 : 1) * cell;
              x = v.x;
              y = v.y;
              z = v.z;
              s = v.s * (1 - k * k);
              bright = 1 - k;
            } else {
              const e = k * k;
              x = lerp(v.sx, v.tx, e);
              y = lerp(v.sy, v.ty, e);
              z = lerp(v.sz, v.tz, e);
              s = v.s * (0.4 + 0.6 * k);
              bright = 0.4 + k;
            }
            // 칸에 맞춰 계단식으로
            const g = cell * 0.5;
            x = Math.round(x / g) * g;
            y = Math.round(y / g) * g;
            z = Math.round(z / g) * g;
            M.makeScale(s, s, s).setPosition(x, y, z);
            vox.setMatrixAt(n, M);
            const fl = Math.random() < 0.06 ? 2.2 : 1;
            tc.copy(col).lerp(orange ? new THREE.Color(1, 0.2, 0.4) : new THREE.Color(0.8, 0.2, 1.0), v.mode === 0 ? k : 0).multiplyScalar((0.8 + bright * 2.4) * fl);
            vox.setColorAt(n, tc);
            n++;
          }
          vox.count = n;
          vox.instanceMatrix.needsUpdate = true;
          if (vox.instanceColor) vox.instanceColor.needsUpdate = true;
          ringMat.color.copy(col).multiplyScalar(2 + Math.sin(t * 6) * 0.8 + (mode === 2 ? 3 : 0));
          glow.tick(dt);
          S.tick(dt);
        },
        resize: (w, h) => S.resize(w, h),
        dispose: () => S.dispose(),
      };
    },
  },

  /* i508 모래성 무너짐 */
  i508: {
    kind: '3d',
    caption: '모래가 흘러내리다(예고) 아래부터 덩이가 떨어져 구르고, 덩이마다 모래 줄기 · 땅에 닿으면 먼지 뭉게 · 모래 더미 → 다시 솟아 쌓임',
    make(): Scene3D {
      const S = makeStage({ bg: 0xd9e4ec, cam: [0.4, 1.9, 6.4], look: [0, 0.95, 0], fov: 42, fog: [12, 40] });
      S.scene.add(skyDome(0x5a9ad8, 0xe6ecf0, 0xd8c8a8, 0, { dir: [0.6, 0.5, -0.6], col: 0xfff4d8, pow: 12, I: 0.6 }));
      const lab = S.hud.label('tl');
      S.scene.add(new THREE.HemisphereLight(0xe0f0ff, 0xb08a60, 1.0));
      const sunL = new THREE.DirectionalLight(0xfff0d8, 2.6);
      sunL.position.set(4, 6, 3);
      S.scene.add(sunL);
      const sandC = groundCanvas('v3sand', '#d6b685', [['rgba(120,80,40,0.25)', 9000, 1.2], ['rgba(255,240,210,0.35)', 6000, 1.1]], 61, (g, s) => {
        g.strokeStyle = 'rgba(150,110,60,0.12)';
        g.lineWidth = 3;
        for (let y = 0; y < s; y += 16) {
          g.beginPath();
          for (let x = 0; x <= s; x += 8) g.lineTo(x, y + Math.sin((x / s) * TAU * 3 + y) * 4);
          g.stroke();
        }
      });
      const sandT = texFrom(sandC, true, 6);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ map: sandT, bumpMap: sandT, bumpScale: 1.5, roughness: 1 }));
      ground.rotation.x = -Math.PI / 2;
      S.scene.add(ground);
      const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(2.4, 2.4),
        new THREE.ShaderMaterial({
          uniforms: { uA: { value: 0.35 } },
          vertexShader: FLAT_VS,
          fragmentShader: /* glsl */ `uniform float uA; varying vec2 vUv; void main(){ float r = length(vUv * 2.0 - 1.0); gl_FragColor = vec4(0.18, 0.12, 0.06, (1.0 - smoothstep(0.3, 1.0, r)) * uA); }`,
          transparent: true,
          depthWrite: false,
        }),
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(0.15, 0.01, -0.1);
      S.scene.add(shadow);
      // 덩이 모양 (울퉁불퉁 상자 — 같은 자리 꼭짓점은 같이 움직여 틈 없음)
      const lumpGeo = (seed: number): THREE.BufferGeometry => {
        const g = new THREE.BoxGeometry(1, 1, 1, 2, 2, 2);
        const p = g.attributes.position!;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i);
          const y = p.getY(i);
          const z = p.getZ(i);
          const h = Math.sin(x * 12.9 + y * 78.2 + z * 37.7 + seed * 3.1) * 43758.5;
          const j = (h - Math.floor(h) - 0.5) * 0.22;
          const h2 = Math.sin(x * 39.3 + y * 11.1 + z * 71.7 + seed) * 12345.6;
          const j2 = (h2 - Math.floor(h2) - 0.5) * 0.22;
          p.setXYZ(i, x * (1 + j), y * (1 + j2 * 0.6), z * (1 + j2));
        }
        g.computeVertexNormals();
        return g;
      };
      const geos = [0, 1, 2, 3].map(lumpGeo);
      const mats = [0xffffff, 0xf2e8dc, 0xfff6ea].map((c) => new THREE.MeshStandardMaterial({ color: c, map: sandT, roughness: 1, flatShading: true }));
      interface Chunk {
        m: THREE.Mesh;
        p0: THREE.Vector3;
        q0: THREE.Quaternion;
        v: THREE.Vector3;
        ax: THREE.Vector3;
        w: number;
        delay: number;
        st: number;
        layer: number;
        hs: number;
      }
      const chunks: Chunk[] = [];
      const L = 7;
      const SEG = 9;
      const LH = 0.26;
      const RAD = 0.52;
      const add = (x: number, y: number, z: number, sx: number, sy: number, sz: number, ry: number, layer: number): void => {
        const m = new THREE.Mesh(geos[chunks.length % 4]!, mats[chunks.length % 3]!);
        m.scale.set(sx, sy, sz);
        m.position.set(x, y, z);
        m.rotation.y = ry;
        S.scene.add(m);
        chunks.push({ m, p0: m.position.clone(), q0: m.quaternion.clone(), v: new THREE.Vector3(), ax: new THREE.Vector3(1, 0, 0), w: 0, delay: 0, st: 0, layer, hs: sy / 2 });
      };
      for (let l = 0; l < L; l++) {
        const rr = RAD * (1 - l * 0.035);
        const off = (l % 2) * (Math.PI / SEG);
        for (let s = 0; s < SEG; s++) {
          const a = (s / SEG) * TAU + off;
          add(Math.cos(a) * rr, LH / 2 + l * LH, Math.sin(a) * rr, ((TAU * rr) / SEG) * 1.02, LH * 1.02, 0.3, -a + Math.PI / 2, l);
        }
        add(0, LH / 2 + l * LH, 0, rr * 1.15, LH, rr * 1.15, l * 0.4, l);
      }
      for (let s = 0; s < 6; s++) {
        const a = (s / 6) * TAU;
        const rr = RAD * (1 - L * 0.035);
        add(Math.cos(a) * rr, L * LH + 0.1, Math.sin(a) * rr, 0.2, 0.2, 0.22, -a, L);
      }
      const pileMat = new THREE.MeshStandardMaterial({ color: 0xf6eee2, map: sandT, roughness: 1 });
      const pile = new THREE.Mesh(new THREE.LatheGeometry(Array.from({ length: 18 }, (_, i) => new THREE.Vector2((i / 17) * 1.4, Math.exp(-Math.pow((i / 17) * 1.4, 2) * 2.2) - Math.exp(-4.3))).reverse(), 48), pileMat);
      pile.scale.set(0.001, 0.001, 0.001);
      S.scene.add(pile);
      const grains = S.pool(2600, 3);
      const dust = S.pool(700, 4);
      const GRAIN = ramp([[0, 0xc8a06a, 1.1, 1, 0], [0.8, 0xc09a64, 1.1, 1, 0], [1, 0xb89060, 1, 0, 0]]);
      const DUST = ramp([[0, 0xe0c8a0, 1.15, 0, 0], [0.1, 0xd8c09a, 1.15, 0.55, 0], [0.6, 0xd0bc9c, 1.1, 0.3, 0], [1, 0xc8b8a0, 1.05, 0, 0]]);
      let cyc = 0;
      let slow = false;
      let dustAmt = 1;
      const CY = 7.5;
      const T_FALL = 1.5;
      const controls: Control[] = [
        ctrlBtn('다시 무너뜨리기', () => (cyc = T_FALL - 0.6)),
        ctrlTog('느리게 보기', false, (v) => (slow = v)),
        ctrlRange('먼지 양', 0, 2, 0.05, 1, (v) => (dustAmt = v)),
      ];
      const q = new THREE.Quaternion();
      const dustPuff = (x: number, z: number, n: number, sp: number): void => {
        for (let i = 0; i < n * dustAmt; i++) {
          const a = R(0, TAU);
          const s = R(0.3, 1) * sp;
          dust.spawn({ x: x + Math.cos(a) * 0.1, y: 0.12, z: z + Math.sin(a) * 0.1, vx: Math.cos(a) * s, vy: R(0.2, 0.7), vz: Math.sin(a) * s, life: R(1.6, 2.8), s0: 0.25, s1: R(0.9, 1.5), ramp: DUST, shape: 1, rot: R(-0.4, 0.4), rv: R(-0.3, 0.3), drag: 1.8, grav: -0.1 });
        }
      };
      let started = false;
      return {
        scene: S.scene,
        camera: S.cam,
        controls,
        update(t, dt0) {
          const dt = Math.min(dt0, 0.05) * (slow ? 0.35 : 1);
          const prev = cyc;
          cyc = (cyc + dt) % CY;
          if (cyc < prev || !started) {
            started = true;
            for (const c of chunks) {
              c.st = 0;
              c.m.position.copy(c.p0);
              c.m.quaternion.copy(c.q0);
            }
          }
          if (cyc < T_FALL) {
            // 예고: 흔들림 + 모래 흘러내림
            const k = clamp((cyc - 0.5) / (T_FALL - 0.5), 0, 1);
            for (const c of chunks) {
              if (c.st !== 0) continue;
              c.m.position.set(c.p0.x + Math.sin(t * 47 + c.layer) * 0.006 * k, c.p0.y, c.p0.z + Math.cos(t * 53 + c.layer) * 0.006 * k);
            }
            if (k > 0 && Math.random() < dt * 70 * k) {
              const a = R(0, TAU);
              grains.spawn({ x: Math.cos(a) * RAD, y: R(0.6, 1.8), z: Math.sin(a) * RAD, vx: Math.cos(a) * 0.3, vz: Math.sin(a) * 0.3, life: 0.8, s0: R(0.035, 0.055), ramp: GRAIN, shape: 0, grav: 9.8, bnc: 0 });
            }
            pile.scale.setScalar(0.001);
            lab.set(cyc > 0.5 ? '금 가며 모래가 흘러내림 (예고)' : '모래성', '#d8a860');
          } else if (cyc < 5.4) {
            const a = cyc - T_FALL;
            lab.set('무너짐 — 덩이 · 모래 줄기 · 먼지 구름 · 모래 더미', '#d8a860');
            for (const c of chunks) {
              if (c.st === 0) {
                c.st = 1;
                c.delay = R(0, 0.18) + c.layer * 0.045;
                const ang = Math.atan2(c.p0.z, c.p0.x) + R(-0.4, 0.4);
                const out = R(0.4, 1.4) * (1.2 - (c.layer / L) * 0.5) * (c.p0.length() < 0.1 ? 0.3 : 1);
                c.v.set(Math.cos(ang) * out, R(-0.3, 0.8), Math.sin(ang) * out);
                c.ax.set(R(-1, 1), R(-0.3, 0.3), R(-1, 1)).normalize();
                c.w = R(1.5, 6);
              }
              if (c.st === 1) {
                if (a < c.delay) continue;
                c.v.y -= 9.8 * dt;
                c.m.position.addScaledVector(c.v, dt);
                q.setFromAxisAngle(c.ax, c.w * dt);
                c.m.quaternion.premultiply(q);
                if (Math.random() < dt * 22) grains.spawn({ x: c.m.position.x + R(-0.08, 0.08), y: c.m.position.y, z: c.m.position.z + R(-0.08, 0.08), vx: c.v.x * 0.3, vy: c.v.y * 0.3, vz: c.v.z * 0.3, life: 0.7, s0: R(0.018, 0.032), ramp: GRAIN, shape: 0, grav: 9.8, bnc: 0 });
                const floorY = c.hs * 0.8;
                if (c.m.position.y < floorY) {
                  c.m.position.y = floorY;
                  const sp = Math.abs(c.v.y);
                  if (sp > 1.2) {
                    dustPuff(c.m.position.x, c.m.position.z, 3, 1.2);
                    for (let j = 0; j < 8; j++) {
                      const an = R(0, TAU);
                      grains.spawn({ x: c.m.position.x, y: 0.05, z: c.m.position.z, vx: Math.cos(an) * R(0.5, 1.5), vy: R(1, 2.5), vz: Math.sin(an) * R(0.5, 1.5), life: 0.6, s0: R(0.02, 0.03), ramp: GRAIN, shape: 0, grav: 9.8, bnc: 0 });
                    }
                  }
                  c.v.y = sp * 0.18;
                  c.v.x *= 0.55;
                  c.v.z *= 0.55;
                  c.w *= 0.5;
                  if (sp < 0.6 && c.v.lengthSq() < 0.05) c.st = 2;
                }
              }
            }
            if (a > 0.25 && a - dt <= 0.25) dustPuff(0, 0, 22, 2.6);
            const pk = smooth((a - 0.2) / 1.6);
            pile.scale.set(0.3 + 0.75 * pk, 0.75 * pk + 0.001, 0.3 + 0.75 * pk);
          } else if (cyc < 6.3) {
            const k = (cyc - 5.4) / 0.9;
            for (const c of chunks) c.m.position.y -= dt * 0.5;
            pile.scale.y = Math.max(0.001, 0.75 * (1 - k));
            lab.set('모래 속으로 가라앉음', '#d8a860');
          } else {
            const k = (cyc - 6.3) / 1.0;
            for (const c of chunks) {
              const kk = smooth((k - c.layer * 0.06) / 0.5);
              c.m.position.set(c.p0.x, lerp(-0.6, c.p0.y, kk), c.p0.z);
              c.m.quaternion.copy(c.q0);
              c.st = 0;
            }
            pile.scale.setScalar(0.001);
            if (Math.random() < dt * 20) dustPuff(R(-0.5, 0.5), R(-0.5, 0.5), 1, 0.6);
            lab.set('다시 쌓기 — 아래부터 솟아오름', '#d8a860');
          }
          grains.tick(dt);
          dust.tick(dt);
          S.tick(dt);
        },
        resize: (w, h) => S.resize(w, h),
        dispose: () => {
          S.dispose();
          for (const g of geos) g.dispose();
        },
      };
    },
  },

  /* i509 그라인더 불똥 소나기 */
  i509: {
    kind: '3d',
    caption: '닿는 곳에서 늘어난 불똥 수백 개 — 하얗게 뜨겁다 빨갛게 식고, 바닥에 튀며 쪼개짐 · 쇠판에 지나간 자리가 달아올랐다 식음',
    make(): Scene3D {
      const S = makeStage({ bg: 0x0a0b0e, cam: [0.9, 1.5, 3.3], look: [-0.55, 0.78, 0], fov: 44, fog: [7, 18] });
      const lab = S.hud.label('tl');
      S.scene.add(new THREE.HemisphereLight(0x8090a8, 0x101010, 0.6));
      const key = new THREE.DirectionalLight(0xa0b4d0, 0.9);
      key.position.set(-2, 4, 3);
      S.scene.add(key);
      const con = groundCanvas('v3con', '#5a544e', [['rgba(0,0,0,0.25)', 5000, 1.5], ['rgba(255,255,255,0.06)', 3000, 1.2]], 41);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ map: texFrom(con, true, 8), roughness: 0.75, color: 0x6a6a6a }));
      floor.rotation.x = -Math.PI / 2;
      S.scene.add(floor);
      const steel = new THREE.MeshStandardMaterial({ color: 0x5a5e66, roughness: 0.45, metalness: 0.8 });
      for (const x of [-0.95, 0.95]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.78, 0.5), steel);
        leg.position.set(x, 0.39, 0);
        S.scene.add(leg);
      }
      const HW = 128;
      const heat = new Float32Array(HW);
      const heatData = new Uint8Array(HW * 4);
      const heatTex = new THREE.DataTexture(heatData, HW, 1, THREE.RGBAFormat);
      heatTex.magFilter = THREE.LinearFilter;
      heatTex.needsUpdate = true;
      const plateMat = new THREE.ShaderMaterial({
        uniforms: { uHeat: { value: heatTex } },
        vertexShader: WORLD_VS,
        fragmentShader: /* glsl */ `uniform sampler2D uHeat; varying vec3 vW; varying vec3 vN;
          ${SHADE_GLSL}
          void main(){ vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vW);
            float u = (vW.x + 1.2) / 2.4;
            float h = texture2D(uHeat, vec2(u, 0.5)).r * 1.3;
            float groove = exp(-pow(vW.z / 0.035, 2.0));
            float brushed = 0.92 + 0.08 * sin(vW.x * 300.0 + sin(vW.z * 40.0) * 2.0);
            vec3 base = vec3(0.42, 0.44, 0.48) * brushed;
            base = mix(base, vec3(0.12, 0.1, 0.1), groove * 0.6);
            vec3 c = shade(base, N, V, normalize(vec3(0.3, 0.9, 0.4)), vec3(0.7, 0.72, 0.8));
            vec3 Rf = reflect(-V, N); c += vec3(0.05, 0.06, 0.08) * smoothstep(0.0, 1.0, Rf.y);
            float hh = h * (groove * 1.0 + exp(-pow(vW.z / 0.12, 2.0)) * 0.35);
            vec3 hc = mix(vec3(0.6, 0.04, 0.0), vec3(1.0, 0.35, 0.02), smoothstep(0.25, 0.6, hh));
            hc = mix(hc, vec3(1.0, 0.85, 0.5) * 2.5, smoothstep(0.65, 1.0, hh));
            c += hc * smoothstep(0.05, 0.4, hh) * 2.0;
            gl_FragColor = vec4(c, 1.0); ${TONE} }`,
      });
      const plate = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.05, 0.55), plateMat);
      plate.position.set(0, 0.8, 0);
      S.scene.add(plate);
      // 그라인더
      const disk = cachedCanvas('v3disk', 256, 256, (g, s) => {
        const r = rng(3);
        g.fillStyle = '#3a3a40';
        g.beginPath();
        g.arc(s / 2, s / 2, s / 2, 0, TAU);
        g.fill();
        for (let i = 0; i < 400; i++) {
          g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.3)' : 'rgba(200,200,210,0.2)';
          const a = r() * TAU;
          const d = r() * s * 0.48;
          g.fillRect(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, 2, 2);
        }
        g.strokeStyle = 'rgba(220,220,230,0.35)';
        g.lineWidth = 6;
        g.beginPath();
        g.arc(s / 2, s / 2, s * 0.2, 0, TAU);
        g.stroke();
        g.fillStyle = '#c0a040';
        g.font = 'bold 22px sans-serif';
        g.fillText('A60', s * 0.58, s * 0.5);
      });
      const grinder = new THREE.Group();
      const diskM = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 48), [new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.8 }), new THREE.MeshStandardMaterial({ map: texFrom(disk, true), roughness: 0.9, color: 0x9a9aa0 }), new THREE.MeshStandardMaterial({ map: texFrom(disk, true), roughness: 0.9, color: 0x9a9aa0 })]);
      diskM.rotation.x = Math.PI / 2;
      const spin = new THREE.Group();
      spin.add(diskM);
      const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.06, 32, 1, true, -0.2, Math.PI + 0.4), new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.4, metalness: 0.8, side: THREE.DoubleSide }));
      guard.rotation.x = Math.PI / 2;
      guard.rotation.y = Math.PI;
      guard.position.z = -0.03;
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.14, 20), steel);
      head.rotation.x = Math.PI / 2;
      head.position.z = -0.1;
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.42, 6, 16), new THREE.MeshStandardMaterial({ color: 0x1a7ac8, roughness: 0.45 }));
      body.rotation.z = Math.PI / 2;
      body.position.set(0.32, 0, -0.14);
      const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.16, 4, 10), new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.8 }));
      grip.position.set(0.05, 0.12, -0.14);
      grinder.add(spin, guard, head, body, grip);
      grinder.rotation.z = -0.25;
      grinder.scale.setScalar(1.25);
      S.scene.add(grinder);
      const light = new THREE.PointLight(0xffa040, 0, 7, 1.5);
      S.scene.add(light);
      const floorGlow = glowDisc(0xff7020, 0, 3, 3);
      S.scene.add(floorGlow.mesh);
      const sparks = S.pool(3600, 4);
      const orb = S.pool(16, 5);
      const smoke = S.pool(200, 2);
      sparks.floorY = -10;
      const SPARK = ramp([[0, 0xffffff, 9, 1, 1], [0.15, 0xfff0b0, 6, 1, 1], [0.45, 0xffa030, 3.5, 1, 1], [0.8, 0xe03a08, 1.6, 0.8, 1], [1, 0x601000, 0.6, 0, 1]]);
      const CORE = flat(0xfff4d8, 8, 1);
      const HALO = flat(0xff8a30, 1.4, 0.5);
      const SMK = ramp([[0, 0x6a6460, 1, 0, 0], [0.2, 0x5a5654, 1, 0.25, 0], [1, 0x3a3836, 1, 0, 0]]);
      let amt = 1;
      let split = true;
      let rpm = 1;
      sparks.onStep = (p, i) => {
        if (p.y[i]! < 0.015 && p.vy[i]! < 0) {
          p.y[i] = 0.015;
          p.vy[i] = -p.vy[i]! * 0.42;
          p.vx[i] = p.vx[i]! * 0.62;
          p.vz[i] = p.vz[i]! * 0.62;
          if (split && p.u[i]! < 1 && sparks.n < sparks.cap - 2) {
            p.u[i] = 1;
            const k = sparks.spawn({ x: p.x[i]!, y: 0.02, z: p.z[i]!, vx: p.vx[i]! * R(0.6, 1.1) + R(-0.8, 0.8), vy: p.vy[i]! * R(0.6, 1.2), vz: p.vz[i]! + R(-1, 1), life: (p.life[i]! - p.age[i]!) * 0.8, s0: p.s0[i]! * 0.7, ramp: SPARK, st: 0.04, shape: 2, drag: 0.8, grav: 9.8, tag: 1, u: 1 });
            if (k >= 0) sparks.age[k] = p.age[i]!;
          }
        }
      };
      const controls: Control[] = [
        ctrlRange('불똥 양', 0.2, 2, 0.05, 1, (v) => (amt = v)),
        ctrlTog('바닥에 튀며 쪼개짐', true, (v) => (split = v)),
        ctrlRange('회전 세기', 0.5, 1.6, 0.05, 1, (v) => (rpm = v)),
      ];
      let cyc = 0;
      let acc = 0;
      const CP = new THREE.Vector3();
      return {
        scene: S.scene,
        camera: S.cam,
        controls,
        update(t, dt0) {
          const dt = Math.min(dt0, 0.05);
          cyc = (cyc + dt) % 5;
          let gx: number;
          let lift = 0;
          if (cyc < 3.4) gx = lerp(-0.75, 0.75, smooth(cyc / 3.4));
          else {
            const k = (cyc - 3.4) / 1.6;
            gx = lerp(0.75, -0.75, smooth(k));
            lift = Math.sin(Math.PI * k) * 0.35 + 0.02;
          }
          const on = lift < 0.025;
          CP.set(gx, 0.826, 0);
          grinder.position.set(gx + Math.sin(0.25) * 0.275, 0.826 + Math.cos(0.25) * 0.275 + lift + (on ? Math.sin(t * 80) * 0.002 : 0), 0);
          spin.rotation.z -= dt * 60 * rpm;
          orb.clear();
          if (on) {
            acc += dt * 280 * amt;
            while (acc >= 1) {
              acc -= 1;
              const sp = R(5, 10) * rpm;
              const a = R(-0.15, 0.55);
              sparks.spawn({ x: CP.x, y: CP.y + 0.005, z: CP.z + R(-0.01, 0.01), vx: -Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: R(-1.6, 1.6), life: R(0.6, 1.5), s0: R(0.022, 0.04), ramp: SPARK, st: 0.06, shape: 2, drag: 0.6, grav: 9.8, tag: 1 });
            }
            if (Math.random() < dt * 8) smoke.spawn({ x: CP.x, y: CP.y + 0.05, z: CP.z, vx: R(-0.1, 0.1), vy: R(0.3, 0.6), life: R(1.2, 2), s0: 0.08, s1: 0.5, ramp: SMK, shape: 1, rot: R(-0.4, 0.4), drag: 0.5 });
            orb.spawn({ x: CP.x, y: CP.y + 0.01, z: CP.z + 0.02, life: 1, s0: 0.09, ramp: CORE, shape: 0, br: 0.8 + Math.random() * 0.4 });
            orb.spawn({ x: CP.x, y: CP.y + 0.01, z: CP.z + 0.02, life: 1, s0: 0.55, ramp: HALO, shape: 0, br: 0.8 + Math.random() * 0.4 });
            const ix = ((gx + 1.2) / 2.4) * HW;
            for (let k = Math.floor(ix - 3); k <= Math.ceil(ix + 3); k++) if (k >= 0 && k < HW) heat[k] = Math.min(1, heat[k]! + dt * 3.2 * Math.exp(-Math.pow((k - ix) / 1.6, 2)));
            lab.set('갈기 — 불똥이 하얗게 튀어 빨갛게 식으며 바닥에서 쪼개짐', '#ffb050');
          } else lab.set('들어 올림 — 지나간 자리가 노랗게 달았다가 식음', '#ff7030');
          const decay = Math.exp(-dt * 0.5);
          for (let k = 0; k < HW; k++) {
            heat[k] = heat[k]! * decay;
            heatData[k * 4] = Math.round(clamp(heat[k]!, 0, 1) * 255);
            heatData[k * 4 + 3] = 255;
          }
          heatTex.needsUpdate = true;
          light.position.set(CP.x - 0.3, CP.y + 0.03, CP.z - 0.12);
          light.intensity = on ? (5 + Math.random() * 3) * Math.min(1.4, amt) : 0;
          floorGlow.mesh.position.set(gx - 1.0, 0.015, 0);
          floorGlow.set(on ? 0.35 * amt : 0);
          sparks.tick(dt);
          orb.upload();
          smoke.tick(dt);
          S.tick(dt);
        },
        resize: (w, h) => S.resize(w, h),
        dispose: () => {
          S.dispose();
          heatTex.dispose();
        },
      };
    },
  },

  /* i510 오라 불꽃 */
  i510: {
    kind: '3d',
    caption: '몸을 부풀린 껍질 두 겹에 위로 흐르는 불꽃 + 솟는 불꽃 혀 · 떠오르는 돌 · 바닥 갈라진 빛 — 모으기 → 폭발 → 유지 → 가라앉음',
    make(): Scene3D {
      const S = makeStage({ bg: 0x07060a, cam: [0, 1.45, 4.6], look: [0, 1.0, 0], fov: 42, fog: [8, 18] });
      const lab = S.hud.label('tl');
      S.scene.add(new THREE.HemisphereLight(0x405070, 0x0a0806, 0.35));
      const rock = groundCanvas('v3rock', '#2c2824', [['rgba(0,0,0,0.3)', 6000, 2], ['rgba(255,255,255,0.05)', 3000, 1.5]], 71);
      const rockT = texFrom(rock, true, 5);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ map: rockT, bumpMap: rockT, bumpScale: 2, roughness: 0.95, color: 0x8a8076 }));
      ground.rotation.x = -Math.PI / 2;
      S.scene.add(ground);
      const crack = cachedCanvas('v3crack', 512, 512, (g, s) => {
        const r = rng(19);
        g.fillStyle = '#000';
        g.fillRect(0, 0, s, s);
        g.lineCap = 'round';
        const br = (x: number, y: number, a: number, len: number, w: number, d: number): void => {
          let px = x;
          let py = y;
          g.strokeStyle = '#fff';
          g.lineWidth = w;
          g.beginPath();
          g.moveTo(px, py);
          const n = 6;
          for (let k = 0; k < n; k++) {
            a += (r() - 0.5) * 0.7;
            px += (Math.cos(a) * len) / n;
            py += (Math.sin(a) * len) / n;
            g.lineTo(px, py);
          }
          g.stroke();
          if (d > 0) {
            br(px, py, a + 0.5, len * 0.6, w * 0.6, d - 1);
            br(px, py, a - 0.5, len * 0.6, w * 0.6, d - 1);
          }
        };
        for (let i = 0; i < 9; i++) br(s / 2, s / 2, (i / 9) * TAU + r() * 0.3, s * 0.2, 5, 2);
        const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.14);
        gr.addColorStop(0, 'rgba(255,255,255,0.8)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, s, s);
      });
      const auraCol1 = new THREE.Color(0xfff2c0);
      const auraCol2 = new THREE.Color(0xff9a20);
      const crackMat = new THREE.ShaderMaterial({
        uniforms: { uTex: { value: texFrom(crack) }, uCol: { value: auraCol2 }, uP: { value: 0 }, uTime: { value: 0 } },
        vertexShader: FLAT_VS,
        fragmentShader: /* glsl */ `uniform sampler2D uTex; uniform vec3 uCol; uniform float uP, uTime; varying vec2 vUv;
          void main(){ float c = texture2D(uTex, vUv).r; float r = length(vUv * 2.0 - 1.0);
            float reveal = 1.0 - smoothstep(uP * 0.9, uP * 0.9 + 0.08, r);
            float pulse = 0.8 + 0.2 * sin(uTime * 9.0 - r * 12.0);
            gl_FragColor = vec4(uCol * 3.0 * pulse, 1.0); ${TONE} gl_FragColor.a = c * reveal * smoothstep(0.0, 0.2, uP); }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const crackM = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), crackMat);
      crackM.rotation.x = -Math.PI / 2;
      crackM.position.y = 0.012;
      S.scene.add(crackM);
      const pad = glowDisc(0xffa040, 0, 4, 3);
      S.scene.add(pad.mesh);
      const geo = figureGeo('power');
      const fig = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x2a2a32, roughness: 0.45, metalness: 0.35 }));
      S.scene.add(fig);
      const light = new THREE.PointLight(0xffa040, 0, 7, 1.4);
      light.position.set(0, 1.1, 0.5);
      S.scene.add(light);
      const auraMat = (push: number, lift: number, freq: number, A: number): THREE.ShaderMaterial =>
        new THREE.ShaderMaterial({
          uniforms: { uTime: { value: 0 }, uNoise: { value: S.noise }, uPush: { value: push }, uLift: { value: lift }, uFreq: { value: freq }, uA: { value: A }, uP: { value: 0 }, uC1: { value: auraCol1 }, uC2: { value: auraCol2 } },
          vertexShader: /* glsl */ `uniform sampler2D uNoise; uniform float uTime, uPush, uLift, uFreq, uP; varying vec3 vW; varying vec3 vN;
            void main(){ vec3 p = position + normal * uPush * (0.6 + 0.4 * uP);
              vec4 w = modelMatrix * vec4(p, 1.0);
              float n = texture2D(uNoise, vec2(w.x * 0.6 + w.z * 0.45, w.y * 0.35 - uTime * 0.9) * uFreq).r;
              float up = smoothstep(-0.3, 1.0, normal.y);
              w.y += n * uLift * uP * (0.35 + up);
              w.xz += normal.xz * n * uLift * uP * 0.35;
              vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
              gl_Position = projectionMatrix * viewMatrix * w; }`,
          fragmentShader: /* glsl */ `uniform sampler2D uNoise; uniform float uTime, uA, uP, uFreq; uniform vec3 uC1, uC2; varying vec3 vW; varying vec3 vN;
            void main(){ vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vW); float rim = 1.0 - abs(dot(N, V));
              float n1 = texture2D(uNoise, vec2(vW.x * 5.0 + vW.z * 3.5, vW.y * 0.55 - uTime * 1.7) * uFreq).r;
              float n2 = texture2D(uNoise, vec2(vW.x * 9.0 - vW.z * 6.0, vW.y * 1.1 - uTime * 2.9) * uFreq).g;
              float f = n1 * 0.6 + n2 * 0.55;
              float flame = smoothstep(0.56, 0.86, f + rim * 0.12);
              float a = flame * pow(rim, 1.3) * uA * uP;
              vec3 col = mix(uC2, uC1, smoothstep(0.7, 1.05, f + (1.0 - rim) * 0.2)) * (0.6 + 0.7 * uP);
              gl_FragColor = vec4(col, 1.0); ${TONE} gl_FragColor.a = clamp(a, 0.0, 1.0); }`,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        });
      const a1 = auraMat(0.035, 0.07, 1.2, 0.9);
      const a2 = auraMat(0.09, 0.3, 1.0, 0.35);
      const sh1 = new THREE.Mesh(geo, a1);
      const sh2 = new THREE.Mesh(geo, a2);
      sh1.renderOrder = 5;
      sh2.renderOrder = 6;
      S.scene.add(sh1, sh2);
      const samp = surfacePoints(geo, 900);
      // 떠오르는 돌
      const rocks: { m: THREE.Mesh; base: THREE.Vector3; h: number; ph: number; y: number; vy: number }[] = [];
      for (let i = 0; i < 11; i++) {
        const g = new THREE.DodecahedronGeometry(R(0.05, 0.12), 0);
        const p = g.attributes.position!;
        for (let k = 0; k < p.count; k++) p.setXYZ(k, p.getX(k) * R(0.8, 1.2), p.getY(k) * R(0.6, 1), p.getZ(k) * R(0.8, 1.2));
        g.computeVertexNormals();
        const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x4a4440, roughness: 0.9, flatShading: true }));
        const a = (i / 11) * TAU + R(-0.2, 0.2);
        const r = R(0.7, 1.5);
        const base = new THREE.Vector3(Math.cos(a) * r, 0.05, Math.sin(a) * r * 0.8);
        m.position.copy(base);
        S.scene.add(m);
        rocks.push({ m, base, h: R(0.3, 1.5), ph: R(0, TAU), y: 0.05, vy: 0 });
      }
      const fire = S.pool(1600, 7);
      const dust = S.pool(500, 4);
      const ring = new Ring();
      S.scene.add(ring.mesh);
      let FIRE = ramp([[0, 0xffe8a0, 2.2, 0, 1], [0.15, 0xffd070, 2.2, 0.9, 1], [0.55, 0xff8a20, 1.6, 0.6, 1], [1, 0xb02800, 0.6, 0, 1]]);
      let SUCK = ramp([[0, 0xffd080, 2, 0, 1], [0.5, 0xffe0a0, 3, 1, 1], [1, 0xffffff, 5, 1, 1]]);
      const DUST = ramp([[0, 0x8a7a6a, 1, 0, 0], [0.12, 0x6a5e52, 1, 0.45, 0], [1, 0x3a3632, 1, 0, 0]]);
      const ZAP = ramp([[0, 0xffffff, 8, 1, 1], [1, 0x80c0ff, 3, 0, 1]]);
      let blue = false;
      let size = 1;
      let shakeOn = true;
      const setCol = (b: boolean): void => {
        blue = b;
        auraCol1.setHex(b ? 0xe8f6ff : 0xfff2c0);
        auraCol2.setHex(b ? 0x3a80ff : 0xff9a20);
        light.color.setHex(b ? 0x60a0ff : 0xffa040);
        pad.set(0, b ? 0x4090ff : 0xffa040);
        FIRE = b ? ramp([[0, 0xc0e0ff, 2.2, 0, 1], [0.15, 0x90c8ff, 2.2, 0.9, 1], [0.55, 0x4080ff, 1.6, 0.6, 1], [1, 0x1030c0, 0.6, 0, 1]]) : ramp([[0, 0xffe8a0, 2.2, 0, 1], [0.15, 0xffd070, 2.2, 0.9, 1], [0.55, 0xff8a20, 1.6, 0.6, 1], [1, 0xb02800, 0.6, 0, 1]]);
        SUCK = b ? ramp([[0, 0x80c0ff, 2, 0, 1], [0.5, 0xc0e0ff, 3, 1, 1], [1, 0xffffff, 5, 1, 1]]) : ramp([[0, 0xffd080, 2, 0, 1], [0.5, 0xffe0a0, 3, 1, 1], [1, 0xffffff, 5, 1, 1]]);
      };
      const controls: Control[] = [
        ctrlTog('푸른 오라', false, setCol),
        ctrlRange('오라 크기', 0.5, 1.8, 0.05, 1, (v) => (size = v)),
        ctrlTog('화면 흔들림', true, (v) => (shakeOn = v)),
      ];
      let cyc = 0;
      let power = 0;
      let burst = false;
      return {
        scene: S.scene,
        camera: S.cam,
        controls,
        update(t, dt0) {
          const dt = Math.min(dt0, 0.05);
          const prev = cyc;
          cyc = (cyc + dt) % 7.5;
          if (cyc < prev) burst = false;
          let target: number;
          const acc = blue ? '#60a8ff' : '#ffb040';
          if (cyc < 0.8) {
            target = 0.08;
            lab.set('평소', acc);
          } else if (cyc < 2.7) {
            target = lerp(0.12, 0.55, (cyc - 0.8) / 1.9);
            lab.set('기 모으는 중 — 빛이 빨려 들고 땅이 흔들림', acc);
            if (shakeOn) S.shake = Math.max(S.shake, 0.012 * (cyc - 0.8));
            for (let k = 0; k < 3; k++) {
              const d = sphereDir();
              const r = R(1.2, 2.0);
              const sx = d.x * r;
              const sy = 1 + d.y * r * 0.6;
              const sz = d.z * r;
              const T = R(0.45, 0.7);
              fire.spawn({ x: sx, y: sy, z: sz, vx: -sx / T, vy: (1.05 - sy) / T, vz: -sz / T, life: T, s0: 0.05, s1: 0.03, ramp: SUCK, shape: 2, st: 0.06 });
            }
          } else if (cyc < 5.6) {
            target = 1;
            if (!burst) {
              burst = true;
              power = 1.25;
              ring.fire(0, 0.03, 0, 3.6, 0.7, blue ? 0x80c0ff : 0xffc060, 3);
              fire.spawn({ x: 0, y: 1, z: 0, life: 0.3, s0: 2, s1: 5, ramp: ramp([[0, 0xffffff, 6, 1, 1], [1, auraCol2.getHex(), 1, 0, 1]]), shape: 0 });
              for (let k = 0; k < 30; k++) {
                const a = (k / 30) * TAU;
                const sp = R(3, 4.5);
                dust.spawn({ x: Math.cos(a) * 0.3, y: 0.15, z: Math.sin(a) * 0.3, vx: Math.cos(a) * sp, vy: R(0.1, 0.5), vz: Math.sin(a) * sp, life: R(1.2, 1.8), s0: 0.3, s1: 1.3, ramp: DUST, shape: 1, rot: R(-0.4, 0.4), drag: 2.4 });
              }
              if (shakeOn) S.shake = 0.12;
            }
            lab.set('폭발 → 오라 불꽃 — 실루엣 둘레가 위로 타오름', acc);
          } else {
            target = lerp(1, 0.08, smooth((cyc - 5.6) / 1.5));
            lab.set('가라앉음', acc);
          }
          power += (target - power) * (1 - Math.exp(-dt * (burst ? 5 : 2.5)));
          const P = power * (target >= 1 ? 0.92 + 0.08 * Math.sin(t * 23) : 1);
          for (const m of [a1, a2]) {
            m.uniforms.uTime!.value = t;
            m.uniforms.uP!.value = clamp(P, 0, 1.3) * size;
          }
          crackMat.uniforms.uP!.value = clamp(P, 0, 1);
          crackMat.uniforms.uTime!.value = t;
          light.intensity = 2 + P * 14;
          pad.set(P * 1.1);
          // 불꽃 혀
          const rate = 420 * P * size;
          let nn = rate * dt;
          while (nn > 0) {
            if (Math.random() < nn) {
              const i = Math.floor(Math.random() * 900);
              const nx = samp[i * 6 + 3]!;
              const ny = samp[i * 6 + 4]!;
              const nz = samp[i * 6 + 5]!;
              fire.spawn({ x: samp[i * 6]! + nx * 0.07, y: samp[i * 6 + 1]! + ny * 0.07, z: samp[i * 6 + 2]! + nz * 0.07, vx: nx * 0.25, vy: R(1.4, 2.4) * size, vz: nz * 0.25, life: R(0.3, 0.55), s0: R(0.09, 0.15) * size, s1: 0.03, ramp: FIRE, shape: 0, st: 0.13 });
            }
            nn -= 1;
          }
          if (P > 0.3 && Math.random() < dt * 25 * P) {
            const a = R(0, TAU);
            dust.spawn({ x: Math.cos(a) * 0.4, y: 0.08, z: Math.sin(a) * 0.4, vx: Math.cos(a) * R(1, 2), vy: R(0.1, 0.4), vz: Math.sin(a) * R(1, 2), life: R(1, 1.6), s0: 0.15, s1: 0.7, ramp: DUST, shape: 1, rot: R(-0.4, 0.4), drag: 1.8 });
          }
          if (P > 0.9 && Math.random() < dt * 7) {
            const i = Math.floor(Math.random() * 900);
            const d = sphereDir();
            fire.spawn({ x: samp[i * 6]! + d.x * 0.15, y: samp[i * 6 + 1]! + d.y * 0.15, z: samp[i * 6 + 2]! + d.z * 0.15, vx: d.x * 4, vy: d.y * 4, vz: d.z * 4, life: 0.07, s0: 0.03, ramp: ZAP, shape: 2, st: 0.06 });
          }
          for (const r of rocks) {
            const want = P > 0.45 ? r.h + Math.sin(t * 1.3 + r.ph) * 0.06 : 0.05;
            if (P > 0.45) {
              r.y += (want - r.y) * (1 - Math.exp(-dt * 1.2));
              r.vy = 0;
            } else {
              r.vy -= 9.8 * dt;
              r.y += r.vy * dt;
              if (r.y < 0.05) {
                if (r.vy < -2) dust.spawn({ x: r.base.x, y: 0.1, z: r.base.z, vy: 0.3, life: 1, s0: 0.1, s1: 0.4, ramp: DUST, shape: 1, drag: 1 });
                r.y = 0.05;
                r.vy = 0;
              }
            }
            r.m.position.set(r.base.x, r.y, r.base.z);
            r.m.rotation.set(t * 0.4 + r.ph, t * 0.6, 0);
          }
          ring.update(dt);
          fire.tick(dt);
          dust.tick(dt);
          S.tick(dt);
        },
        resize: (w, h) => S.resize(w, h),
        dispose: () => S.dispose(),
      };
    },
  },

  /* i511 신성 강림 */
  i511: {
    kind: '3d',
    caption: '구름 틈이 열리고 빛 기둥이 내리꽂힘 → 엇도는 빛살(갓레이) · 흔들리며 내려오는 깃털 · 떠도는 빛 먼지 · 바닥 빛 웅덩이',
    make(): Scene3D {
      const S = makeStage({ bg: 0x0a0c16, cam: [0, 2.0, 8.6], look: [0, 2.7, 0], fov: 50, fog: [10, 28] });
      const lab = S.hud.label('tl');
      S.scene.add(new THREE.HemisphereLight(0x405080, 0x0a0a10, 0.4));
      const tile = cachedCanvas('v3tile', 512, 512, (g, s) => {
        const r = rng(23);
        g.fillStyle = '#1a1c22';
        g.fillRect(0, 0, s, s);
        const n = 4;
        const ts = s / n;
        for (let y = 0; y < n; y++)
          for (let x = 0; x < n; x++) {
            const L = 34 + r() * 14;
            g.fillStyle = `hsl(220, 8%, ${L}%)`;
            g.fillRect(x * ts + 3, y * ts + 3, ts - 6, ts - 6);
            for (let k = 0; k < 40; k++) {
              const cx = x * ts + r() * ts;
              const cy = y * ts + r() * ts;
              const rr = 5 + r() * 25;
              const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rr);
              gr.addColorStop(0, r() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.06)');
              gr.addColorStop(1, 'rgba(0,0,0,0)');
              g.fillStyle = gr;
              g.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
            }
          }
      });
      const tt = texFrom(tile, true, 6);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ map: tt, bumpMap: tt, bumpScale: 1.5, roughness: 0.55, color: 0x9aa0b0 }));
      floor.rotation.x = -Math.PI / 2;
      S.scene.add(floor);
      const stoneM = new THREE.MeshStandardMaterial({ color: 0x5a5e6a, roughness: 0.85 });
      for (const x of [-3.4, 3.4]) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 6, 16), stoneM);
        col.position.set(x, 3, -2.2);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.9), stoneM);
        cap.position.set(x, 6.1, -2.2);
        const ft = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.9), stoneM);
        ft.position.set(x, 0.15, -2.2);
        S.scene.add(col, cap, ft);
      }
      const spot = new THREE.SpotLight(0xffe8b0, 0, 16, 0.32, 0.7, 1.2);
      spot.position.set(0, 12, 0);
      spot.target.position.set(0, 0, 0);
      S.scene.add(spot, spot.target);
      const gold = new THREE.Color(0xffe2a0);
      const beamMat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uNoise: { value: S.noise }, uFront: { value: 1 }, uA: { value: 0 }, uCol: { value: gold }, uCore: { value: 1 } },
        vertexShader: /* glsl */ `varying vec2 vUv; varying float vF; void main(){ vUv = uv; vec3 n = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vF = abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: /* glsl */ `uniform sampler2D uNoise; uniform float uTime, uFront, uA, uCore; uniform vec3 uCol; varying vec2 vUv; varying float vF;
          void main(){ float n = texture2D(uNoise, vec2(vUv.x * 3.0, vUv.y * 1.5 + uTime * 0.25)).r;
            float n2 = texture2D(uNoise, vec2(vUv.x * 7.0, vUv.y * 4.0 + uTime * 0.6)).g;
            float streak = 0.55 + 0.6 * n * n2;
            float vis = smoothstep(uFront, uFront + 0.03, vUv.y);
            float edge = exp(-pow((vUv.y - uFront) * 60.0, 2.0)) * step(0.01, uFront);
            float bottom = smoothstep(0.0, 0.03, vUv.y);
            float body = mix(pow(1.0 - vF, 1.5) * 0.8, pow(vF, 2.0) * 1.4, uCore);
            vec3 col = uCol * (2.0 + 4.0 * body) * streak + vec3(1.0) * edge * 10.0;
            gl_FragColor = vec4(col, 1.0); ${TONE}
            gl_FragColor.a = clamp((body * streak * vis + edge) * bottom * uA, 0.0, 1.0); }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const BH = 14;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, BH, 40, 1, true), beamMat);
      beam.position.y = BH / 2;
      const outerMat = beamMat.clone();
      outerMat.uniforms.uNoise!.value = S.noise;
      outerMat.uniforms.uCol!.value = gold;
      outerMat.uniforms.uCore!.value = 0;
      const outer = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, BH, 40, 1, true), outerMat);
      outer.position.y = BH / 2;
      beam.renderOrder = 6;
      outer.renderOrder = 5;
      S.scene.add(beam, outer);
      const rayMat = (dens: number, sp: number): THREE.ShaderMaterial =>
        new THREE.ShaderMaterial({
          uniforms: { uTime: { value: 0 }, uNoise: { value: S.noise }, uA: { value: 0 }, uCol: { value: gold }, uDens: { value: dens }, uSp: { value: sp } },
          vertexShader: FLAT_VS,
          fragmentShader: /* glsl */ `uniform sampler2D uNoise; uniform float uTime, uA, uDens, uSp; uniform vec3 uCol; varying vec2 vUv;
            void main(){ float n = texture2D(uNoise, vec2(vUv.x * uDens + uTime * uSp, 0.37)).r;
              float rays = smoothstep(0.52, 0.85, n);
              float v = pow(vUv.y, 0.7) * smoothstep(0.0, 0.25, vUv.y);
              gl_FragColor = vec4(uCol * 1.6, 1.0); ${TONE}
              gl_FragColor.a = clamp(rays * v * uA * 0.55, 0.0, 1.0); }`,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        });
      const r1 = rayMat(9, 0.02);
      const r2 = rayMat(14, -0.015);
      const cone1 = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 2.9, 12, 72, 1, true), r1);
      const cone2 = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 2.2, 12, 72, 1, true), r2);
      cone1.position.y = cone2.position.y = 6;
      cone1.renderOrder = cone2.renderOrder = 4;
      S.scene.add(cone1, cone2);
      // 구름 고리
      const clouds = S.pool(100, 2);
      const CLOUD = flat(0x9a94a4, 1, 0.6, 0);
      const cloudA: number[] = [];
      for (let i = 0; i < 90; i++) {
        const a = R(0, TAU);
        cloudA.push(a, R(1.6, 6), R(8.2, 9.2));
        clouds.spawn({ x: 0, y: 8.6, z: 0, life: 1e9, s0: R(3, 4.6), ramp: CLOUD, shape: 1, rot: R(-0.4, 0.4) });
      }
      const pool = glowDisc(0xffe2a0, 0, 5, 3.2);
      S.scene.add(pool.mesh);
      const haloMat = new THREE.ShaderMaterial({
        uniforms: { uA: { value: 0 }, uCol: { value: gold }, uTime: { value: 0 } },
        vertexShader: FLAT_VS,
        fragmentShader: /* glsl */ `uniform float uA, uTime; uniform vec3 uCol; varying vec2 vUv;
          void main(){ vec2 p = vUv * 2.0 - 1.0; float r = length(p); float ang = atan(p.y, p.x);
            float r1 = exp(-pow((r - 0.92) * 70.0, 2.0)); float r2 = exp(-pow((r - 0.8) * 90.0, 2.0)) * step(0.0, sin(ang * 24.0 + uTime));
            float r3 = exp(-pow((r - 0.55) * 80.0, 2.0)) * (0.5 + 0.5 * step(0.3, sin(ang * 6.0 - uTime * 0.7)));
            gl_FragColor = vec4(uCol * 3.0, 1.0); ${TONE} gl_FragColor.a = clamp((r1 + r2 * 0.7 + r3 * 0.6) * uA, 0.0, 1.0); }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), haloMat);
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = 0.02;
      S.scene.add(halo);
      const ring = new Ring();
      S.scene.add(ring.mesh);
      // 깃털
      const feather = cachedCanvas('v3feather', 64, 160, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.strokeStyle = 'rgba(255,255,255,0.95)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(w / 2, h);
        g.quadraticCurveTo(w / 2 + 3, h / 2, w / 2 - 2, 4);
        g.stroke();
        for (let i = 0; i < 46; i++) {
          const y = 10 + (i / 46) * (h - 30);
          const k = Math.sin((i / 46) * Math.PI);
          const len = (w / 2 - 4) * (0.35 + 0.65 * k);
          g.strokeStyle = `rgba(255,255,255,${0.55 + 0.4 * k})`;
          g.lineWidth = 1.6;
          for (const sd of [-1, 1]) {
            g.beginPath();
            g.moveTo(w / 2, y);
            g.quadraticCurveTo(w / 2 + sd * len * 0.6, y - 2, w / 2 + sd * len, y - 8 - k * 4);
            g.stroke();
          }
        }
      });
      const NF = 40;
      const fm = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.17, 0.42), new THREE.MeshBasicMaterial({ map: texFrom(feather, true), color: new THREE.Color(1.6, 1.5, 1.3), transparent: true, depthWrite: false, side: THREE.DoubleSide, alphaTest: 0.02 }), NF);
      fm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      fm.frustumCulled = false;
      fm.renderOrder = 7;
      S.scene.add(fm);
      const FE = Array.from({ length: NF }, () => ({ x: 0, y: -9, z: 0, x0: 0, ph: R(0, TAU), sp: R(0.3, 0.5), ry: R(0, TAU), rest: 0, on: false }));
      const motes = S.pool(400, 8);
      const MOTE = ramp([[0, 0xfff4d0, 4, 0, 1], [0.3, 0xffe8b0, 5, 1, 1], [1, 0xffd080, 2, 0, 1]]);
      const BURST = ramp([[0, 0xffffff, 7, 1, 1], [0.4, 0xfff0c0, 4, 0.8, 1], [1, 0xffc060, 1, 0, 1]]);
      let rayI = 1;
      let nFe = 26;
      let white = false;
      const setWhite = (v: boolean): void => {
        white = v;
        gold.setHex(v ? 0xd8ecff : 0xffe2a0);
        spot.color.setHex(v ? 0xd8ecff : 0xffe8b0);
      };
      const controls: Control[] = [
        ctrlRange('빛살 세기', 0, 2, 0.05, 1, (v) => (rayI = v)),
        ctrlRange('깃털 수', 0, 40, 1, 26, (v) => (nFe = v)),
        ctrlTog('흰빛 (푸른 하늘빛)', false, setWhite),
      ];
      let cyc = 0;
      let struck = false;
      const M = new THREE.Matrix4();
      const E = new THREE.Euler();
      const Q = new THREE.Quaternion();
      const Pv = new THREE.Vector3();
      const Sv = new THREE.Vector3(1, 1, 1);
      return {
        scene: S.scene,
        camera: S.cam,
        controls,
        update(t, dt0) {
          const dt = Math.min(dt0, 0.05);
          const prev = cyc;
          cyc = (cyc + dt) % 8.5;
          if (cyc < prev) struck = false;
          const acc = white ? '#bfe0ff' : '#ffd890';
          let A = 0;
          let front = 1;
          let rad = 1;
          let open = 0;
          if (cyc < 1.0) {
            open = smooth(cyc / 1.0);
            lab.set('하늘이 열림', acc);
          } else if (cyc < 1.35) {
            open = 1;
            front = 1 - easeOut((cyc - 1.0) / 0.35);
            A = 1;
            lab.set('빛 기둥이 내리꽂힘', acc);
          } else if (cyc < 6.4) {
            open = 1;
            front = 0;
            A = 1;
            if (!struck) {
              struck = true;
              ring.fire(0, 0.03, 0, 3.4, 0.8, white ? 0xd8ecff : 0xffe0a0, 3);
              motes.spawn({ x: 0, y: 0.5, z: 0, life: 0.35, s0: 3, s1: 5, ramp: BURST, shape: 0 });
              for (let k = 0; k < 50; k++) {
                const a = R(0, TAU);
                const sp = R(0.8, 2.5);
                motes.spawn({ x: Math.cos(a) * 0.3, y: 0.1, z: Math.sin(a) * 0.3, vx: Math.cos(a) * sp, vy: R(0.5, 2.5), vz: Math.sin(a) * sp, life: R(0.8, 1.6), s0: R(0.06, 0.12), ramp: MOTE, shape: 4, rot: R(0, TAU), drag: 1.5 });
              }
              S.shake = 0.05;
              for (let i = 0; i < NF; i++) {
                const f = FE[i]!;
                f.on = i < nFe;
                f.x0 = R(-1.8, 1.8);
                f.z = R(-1.2, 1.2);
                f.y = R(4, 8.5);
                f.rest = 0;
              }
            }
            lab.set('빛살 · 깃털 · 빛 먼지 — 바닥에 빛 웅덩이', acc);
          } else if (cyc < 7.6) {
            open = 1 - smooth((cyc - 6.4) / 1.2);
            front = 0;
            const k = smooth((cyc - 6.4) / 1.0);
            rad = 1 - k;
            A = 1 - k;
            lab.set('빛이 거둬짐', acc);
          } else lab.set('어둠', acc);
          for (const m of [beamMat, outerMat]) {
            m.uniforms.uTime!.value = t;
            m.uniforms.uFront!.value = front;
            m.uniforms.uA!.value = A * (m === outerMat ? 0.5 : 1);
          }
          beam.scale.set(Math.max(0.001, rad), 1, Math.max(0.001, rad));
          outer.scale.set(Math.max(0.001, rad * (1 + 0.04 * Math.sin(t * 3))), 1, Math.max(0.001, rad));
          const rayA = (front < 0.05 ? A : 0) * rayI + open * 0.25 * rayI;
          r1.uniforms.uTime!.value = t;
          r2.uniforms.uTime!.value = t;
          r1.uniforms.uA!.value = rayA;
          r2.uniforms.uA!.value = rayA * 0.8;
          cone1.rotation.y = t * 0.05;
          cone2.rotation.y = -t * 0.04;
          spot.intensity = A * (front < 0.05 ? 260 : 0) * (0.95 + 0.05 * Math.sin(t * 5));
          pool.set(A * (front < 0.05 ? 1.4 : 0));
          haloMat.uniforms.uA!.value = A * (front < 0.05 ? 1 : 0);
          haloMat.uniforms.uTime!.value = t;
          halo.rotation.z = t * 0.2;
          // 구름 틈
          for (let i = 0; i < clouds.n; i++) {
            const a = cloudA[i * 3]! + t * 0.03;
            const r = cloudA[i * 3 + 1]! + open * 1.2 * (cloudA[i * 3 + 1]! < 3 ? 1 : 0.3);
            clouds.x[i] = Math.cos(a) * r;
            clouds.z[i] = Math.sin(a) * r - 1;
            clouds.y[i] = cloudA[i * 3 + 2]!;
            clouds.br[i] = 0.55 + open * 0.6 * Math.exp(-r * 0.25);
          }
          clouds.upload();
          if (A > 0.5 && front < 0.05 && Math.random() < dt * 40) {
            const a = R(0, TAU);
            const r = Math.sqrt(Math.random()) * 1.2;
            motes.spawn({ x: Math.cos(a) * r, y: R(0.2, 5), z: Math.sin(a) * r, vx: R(-0.05, 0.05), vy: R(0.05, 0.25), vz: R(-0.05, 0.05), life: R(1.2, 2.4), s0: R(0.04, 0.09), ramp: MOTE, shape: 4, rot: R(0, TAU) });
          }
          let n = 0;
          for (const f of FE) {
            if (!f.on || f.y < -5 || cyc < 1.35 || cyc > 7.6) continue;
            if (f.y > 0.03) {
              f.y -= f.sp * dt * (0.8 + 0.4 * Math.sin(t * 1.6 + f.ph) ** 2);
              f.x = f.x0 + Math.sin(t * 1.6 + f.ph) * 0.35;
              f.ry += dt * 0.6;
              E.set(0.3 * Math.sin(t * 1.6 + f.ph + 1), f.ry, 0.7 * Math.sin(t * 1.6 + f.ph));
            } else {
              f.y = 0.03;
              f.rest += dt;
              E.set(-Math.PI / 2, 0, f.ry);
            }
            const fadeK = cyc > 6.4 ? 1 - smooth((cyc - 6.4) / 1.2) : 1;
            Q.setFromEuler(E);
            Pv.set(f.x, f.y + 0.2, f.z);
            Sv.setScalar(fadeK);
            M.compose(Pv, Q, Sv);
            fm.setMatrixAt(n++, M);
          }
          fm.count = n;
          fm.instanceMatrix.needsUpdate = true;
          ring.update(dt);
          motes.tick(dt);
          S.tick(dt);
        },
        resize: (w, h) => S.resize(w, h),
        dispose: () => S.dispose(),
      };
    },
  },

  /* i512 회오리 · 토네이도 */
  i512: {
    kind: '3d',
    caption: '위로 넓어지는 깔때기 세 겹에 잡음이 돌며 흐름(아래일수록 빠름) + 빨려 올라가는 잔해 · 바닥 먼지 고리 · 소용돌이 구름 · 번개',
    make(): Scene3D {
      const S = makeStage({ bg: 0x7c847a, cam: [0, 1.5, 12.5], look: [0, 3.5, 0], fov: 50, fog: [14, 42] });
      S.scene.add(skyDome(0x2a322e, 0x8a9286, 0x3a3a30));
      const lab = S.hud.label('tl');
      const hemi = new THREE.HemisphereLight(0xa8b8b8, 0x2a2a20, 0.9);
      S.scene.add(hemi);
      const sunL = new THREE.DirectionalLight(0xd0d8e0, 0.8);
      sunL.position.set(-4, 8, 5);
      S.scene.add(sunL);
      const field = groundCanvas('v3field', '#4c5a36', [['rgba(30,50,10,0.35)', 9000, 2], ['rgba(150,170,90,0.25)', 5000, 1.5], ['rgba(90,70,40,0.25)', 2000, 3]], 81);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ map: texFrom(field, true, 12), roughness: 1, color: 0xffffff, emissive: 0x1a2010 }));
      ground.rotation.x = -Math.PI / 2;
      S.scene.add(ground);
      const H = 8.6;
      const base = new THREE.Vector3();
      let spin = 1;
      const flash = { v: 0 };
      // 소용돌이 구름
      const cloudMat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uNoise: { value: S.noise }, uC: { value: new THREE.Vector2() }, uFlash: { value: 0 }, uSpin: { value: 1 } },
        vertexShader: WORLD_VS,
        fragmentShader: /* glsl */ `uniform sampler2D uNoise; uniform float uTime, uFlash, uSpin; uniform vec2 uC; varying vec3 vW;
          void main(){ vec2 d = vW.xz - uC; float r = length(d); float a = atan(d.y, d.x) / 6.2831853;
            float sw = a * 2.0 + r * 0.09 - uTime * 0.05 * uSpin * 3.0 / (1.0 + r * 0.3);
            float n = texture2D(uNoise, vec2(sw, r * 0.05 - uTime * 0.01)).r * 0.65 + texture2D(uNoise, vec2(sw * 3.0, r * 0.13)).g * 0.45;
            vec3 col = mix(vec3(0.12, 0.14, 0.13), vec3(0.42, 0.46, 0.43), smoothstep(0.3, 0.95, n));
            col *= mix(0.5, 1.0, smoothstep(1.0, 6.0, r));
            col += vec3(0.6, 0.65, 0.8) * uFlash * (0.4 + n);
            float edge = 1.0 - smoothstep(18.0, 30.0, r);
            gl_FragColor = vec4(col, 1.0); ${TONE} gl_FragColor.a = edge; }`,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      });
      const clouds = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), cloudMat);
      clouds.rotation.x = Math.PI / 2;
      clouds.position.y = H;
      S.scene.add(clouds);
      // 깔때기
      const prof: THREE.Vector2[] = [];
      for (let i = 0; i <= 30; i++) {
        const y = (i / 30) * H;
        prof.push(new THREE.Vector2(0.22 + 0.03 * y + 0.027 * y * y, y));
      }
      const funnelGeo = new THREE.LatheGeometry(prof, 64);
      const FN = /* glsl */ `
        uniform float uTime, uSpin, uA, uScale; uniform vec3 uBase; uniform sampler2D uNoise; uniform vec3 uCol;
        varying vec2 vUv; varying float vH; varying vec3 vW; varying vec3 vN;`;
      const funnelMat = (scale: number, A: number, col: number, order: number): THREE.Mesh => {
        const m = new THREE.ShaderMaterial({
          uniforms: { uTime: { value: 0 }, uSpin: { value: 1 }, uA: { value: A }, uScale: { value: scale }, uBase: { value: base }, uNoise: { value: S.noise }, uCol: { value: new THREE.Color(col) } },
          vertexShader: /* glsl */ `${FN}
            void main(){ vec3 p = position; float h = p.y / ${H.toFixed(1)}; vH = h; vUv = uv;
              float ang = atan(p.z, p.x);
              float wob = 1.0 + 0.06 * sin(ang * 3.0 + uTime * 2.0 + h * 8.0) + 0.04 * sin(ang * 5.0 - uTime * 3.0);
              p.xz *= uScale * wob;
              p.x += sin(h * 2.6 + uTime * 0.7) * 0.55 * h + 0.9 * h * h;
              p.z += cos(h * 2.1 + uTime * 0.5) * 0.3 * h;
              p += uBase;
              vW = p; vN = normalize(vec3(position.x, -0.25, position.z));
              gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
          fragmentShader: /* glsl */ `${FN}
            void main(){ float h = vH; float sp = uSpin * (1.7 - h);
              vec2 q = vec2(vUv.x * 3.0 + uTime * sp * 0.55 + h * 1.6, h * 2.2 - uTime * 0.35);
              float n = texture2D(uNoise, q).r * 0.6 + texture2D(uNoise, q * vec2(2.0, 2.6) + vec2(0.3, -uTime * 0.25)).g * 0.5;
              float dens = smoothstep(0.32, 0.9, n);
              vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vW);
              float rim = 1.0 - abs(dot(N, V));
              float lit = 0.55 + 0.45 * max(dot(N, normalize(vec3(-0.5, 0.6, 0.6))), 0.0);
              vec3 col = uCol * lit * (0.75 + 0.5 * dens);
              col = mix(col, vec3(0.42, 0.34, 0.24), (1.0 - smoothstep(0.0, 0.22, h)) * 0.7);
              float a = (0.25 + 0.75 * dens) * (0.4 + 0.6 * rim) * uA * smoothstep(0.0, 0.03, h) * (1.0 - smoothstep(0.88, 1.0, h));
              gl_FragColor = vec4(col, 1.0); ${TONE} gl_FragColor.a = clamp(a, 0.0, 1.0); }`,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(funnelGeo, m);
        mesh.renderOrder = order;
        mesh.frustumCulled = false;
        S.scene.add(mesh);
        return mesh;
      };
      const layers = [funnelMat(0.75, 0.9, 0x4a4e4a, 3), funnelMat(1.0, 0.65, 0x6a6e66, 4), funnelMat(1.32, 0.35, 0x8a8a80, 5)];
      // 잔해
      const ND = 90;
      const deb = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 0.035, 0.09), new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.9 }), ND);
      deb.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      deb.frustumCulled = false;
      S.scene.add(deb);
      const D = Array.from({ length: ND }, () => ({ a: R(0, TAU), h: Math.random(), ro: R(-0.2, 0.6), w: R(2.5, 4), up: R(0.06, 0.14), ax: new THREE.Vector3(R(-1, 1), R(-1, 1), R(-1, 1)).normalize(), rs: R(3, 9), s: R(0.5, 1.4) }));
      let nDeb = 60;
      let bolts = true;
      const dust = S.pool(900, 2);
      const fine = S.pool(600, 6);
      const boltP = S.pool(600, 8);
      const DUST = ramp([[0, 0x8a7458, 1.1, 0, 0], [0.12, 0x7a6a54, 1.1, 0.55, 0], [0.6, 0x7a7262, 1.05, 0.32, 0], [1, 0x8a8478, 1, 0, 0]]);
      const BITS = ramp([[0, 0x2a2018, 1, 1, 0], [1, 0x3a3020, 1, 0, 0]]);
      const BOLT = flat(0xe8f0ff, 6, 1);
      const BOLTH = flat(0x8aa8ff, 1.2, 0.5);
      const axisAt = (h: number, t: number, out: THREE.Vector3): THREE.Vector3 => out.set(base.x + Math.sin(h * 2.6 + t * 0.7) * 0.55 * h + 0.9 * h * h, h * H, base.z + Math.cos(h * 2.1 + t * 0.5) * 0.3 * h);
      const rAt = (h: number): number => {
        const y = h * H;
        return 0.22 + 0.03 * y + 0.027 * y * y;
      };
      const M = new THREE.Matrix4();
      const Q = new THREE.Quaternion();
      const P3 = new THREE.Vector3();
      const SC = new THREE.Vector3();
      let nextBolt = 2;
      let boltAge = 9;
      const boltPts: THREE.Vector3[] = [];
      const makeBolt = (): void => {
        boltPts.length = 0;
        const x0 = (Math.random() < 0.5 ? -1 : 1) * R(3.5, 7);
        const z0 = R(-5, -2);
        const a = new THREE.Vector3(x0 + R(-2, 2), H - 0.1, z0);
        const b = new THREE.Vector3(x0, 0, z0);
        const pts = [a, b];
        for (let it = 0; it < 6; it++) {
          const np: THREE.Vector3[] = [pts[0]!];
          for (let i = 0; i < pts.length - 1; i++) {
            const p = pts[i]!;
            const q = pts[i + 1]!;
            const L = p.distanceTo(q);
            np.push(new THREE.Vector3().addVectors(p, q).multiplyScalar(0.5).add(new THREE.Vector3(R(-0.25, 0.25) * L, R(-0.1, 0.1) * L, R(-0.15, 0.15) * L)), q);
          }
          pts.splice(0, pts.length, ...np);
        }
        boltPts.push(...pts);
        boltAge = 0;
        flash.v = 1;
      };
      const controls: Control[] = [
        ctrlRange('회전 속도', 0.4, 2, 0.05, 1, (v) => (spin = v)),
        ctrlRange('잔해 양', 0, ND, 1, 60, (v) => (nDeb = v)),
        ctrlTog('번개', true, (v) => (bolts = v)),
      ];
      let acc = 0;
      return {
        scene: S.scene,
        camera: S.cam,
        controls,
        update(t, dt0) {
          const dt = Math.min(dt0, 0.05);
          base.set(Math.sin(t * 0.2) * 2.2, 0, Math.cos(t * 0.13) * 1.2 - 1);
          for (const l of layers) {
            const u = (l.material as THREE.ShaderMaterial).uniforms;
            u.uTime!.value = t;
            u.uSpin!.value = spin;
          }
          cloudMat.uniforms.uTime!.value = t;
          cloudMat.uniforms.uSpin!.value = spin;
          (cloudMat.uniforms.uC!.value as THREE.Vector2).set(base.x + 1.4, base.z);
          // 잔해
          let n = 0;
          for (let i = 0; i < nDeb; i++) {
            const d = D[i]!;
            d.h += d.up * dt * spin;
            if (d.h > 0.85) d.h = 0;
            const r = rAt(d.h) * 1.1 + d.ro;
            d.a += ((d.w * spin) / Math.max(0.4, r)) * dt;
            axisAt(d.h, t, P3);
            P3.x += Math.cos(d.a) * r;
            P3.z += Math.sin(d.a) * r;
            Q.setFromAxisAngle(d.ax, t * d.rs);
            M.compose(P3, Q, SC.setScalar(d.s));
            deb.setMatrixAt(n++, M);
          }
          deb.count = n;
          deb.instanceMatrix.needsUpdate = true;
          // 바닥 먼지 고리
          acc += dt * 50;
          while (acc >= 1) {
            acc -= 1;
            const a = R(0, TAU);
            const r = R(0.4, 1.3);
            const tx = -Math.sin(a);
            const tz = Math.cos(a);
            dust.spawn({ x: base.x + Math.cos(a) * r, y: R(0.05, 0.4), z: base.z + Math.sin(a) * r, vx: tx * 3 * spin + Math.cos(a) * 1.1, vy: R(0.3, 1.2), vz: tz * 3 * spin + Math.sin(a) * 1.1, life: R(1.3, 2.2), s0: R(0.4, 0.6), s1: R(1.8, 2.6), ramp: DUST, shape: 1, rot: R(-0.4, 0.4), rv: R(-1, 1), drag: 1.4, grav: -0.3 });
            if (Math.random() < 0.6) {
              const h = R(0, 0.3);
              axisAt(h, t, P3);
              const rr = rAt(h) * R(1.1, 1.5);
              fine.spawn({ x: P3.x + Math.cos(a) * rr, y: P3.y, z: P3.z + Math.sin(a) * rr, vx: tx * 5 * spin, vy: R(1, 3), vz: tz * 5 * spin, life: R(0.5, 0.9), s0: R(0.03, 0.06), ramp: BITS, shape: 3, rot: R(0, TAU), rv: R(-8, 8), st: 0.02 });
            }
          }
          // 번개
          nextBolt -= dt;
          if (bolts && nextBolt <= 0) {
            makeBolt();
            nextBolt = R(2.5, 4.5);
          }
          boltAge += dt;
          boltP.clear();
          if (boltAge < 0.22 && boltPts.length) {
            const on = boltAge < 0.06 || (boltAge > 0.1 && boltAge < 0.16);
            if (on)
              for (let i = 0; i < boltPts.length - 1; i++) {
                const p = boltPts[i]!;
                const q = boltPts[i + 1]!;
                const vx = q.x - p.x;
                const vy = q.y - p.y;
                const vz = q.z - p.z;
                boltP.spawn({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, z: (p.z + q.z) / 2, vx: vx * 1.1, vy: vy * 1.1, vz: vz * 1.1, life: 1, s0: 0.09, ramp: BOLT, st: 1, shape: 0 });
                if (i % 2 === 0) boltP.spawn({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, z: (p.z + q.z) / 2, life: 1, s0: 0.6, ramp: BOLTH, shape: 0 });
              }
          }
          boltP.upload();
          flash.v *= Math.exp(-dt * 6);
          cloudMat.uniforms.uFlash!.value = flash.v;
          hemi.intensity = 0.9 + flash.v * 1.4;
          dust.tick(dt);
          fine.tick(dt);
          lab.set(boltAge < 0.4 ? '번개 — 구름이 번쩍' : '깔때기 구름 + 빨려 올라가는 잔해 + 바닥 먼지 고리', '#c8d0b0');
          S.tick(dt);
        },
        resize: (w, h) => S.resize(w, h),
        dispose: () => S.dispose(),
      };
    },
  },

  /* i513 화염 방사 */
  i513: {
    kind: '3d',
    caption: '파란 핵 → 노랑 → 주황 → 연기로 식는 불 줄기 — 벽에 닿으면 퍼지며 열 · 그을음이 쌓이고, 떨어진 불방울은 바닥에서 한동안 탄다',
    make(): Scene3D {
      const S = makeStage({ bg: 0x0b0a0a, cam: [0.1, 2.0, 6.2], look: [0.1, 0.95, 0], fov: 46, fog: [8, 20] });
      const lab = S.hud.label('tl');
      S.scene.add(new THREE.HemisphereLight(0x606878, 0x101010, 0.6));
      const key = new THREE.DirectionalLight(0x9ab0d0, 0.8);
      key.position.set(-3, 4, 4);
      S.scene.add(key);
      const con = groundCanvas('v3con', '#5a544e', [['rgba(0,0,0,0.25)', 5000, 1.5], ['rgba(255,255,255,0.06)', 3000, 1.2]], 41);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ map: texFrom(con, true, 8), roughness: 0.85, color: 0x6a6a6a }));
      floor.rotation.x = -Math.PI / 2;
      S.scene.add(floor);
      const WX = 2.75;
      const HW = 64;
      const HH = 32;
      const heat = new Float32Array(HW * HH);
      const soot = new Float32Array(HW * HH);
      const hd = new Uint8Array(HW * HH * 4);
      const heatTex = new THREE.DataTexture(hd, HW, HH, THREE.RGBAFormat);
      heatTex.magFilter = THREE.LinearFilter;
      heatTex.minFilter = THREE.LinearFilter;
      heatTex.needsUpdate = true;
      const brick = cachedCanvas('v3brick2', 256, 256, (g, s) => {
        const r = rng(13);
        g.fillStyle = '#2a2420';
        g.fillRect(0, 0, s, s);
        const bh = s / 8;
        for (let row = 0; row < 8; row++) {
          const off = (row % 2) * (s / 8);
          for (let x = -s / 4; x < s; x += s / 4) {
            g.fillStyle = `hsl(${15 + r() * 15}, ${18 + r() * 12}%, ${34 + r() * 12}%)`;
            g.fillRect(x + off + 3, row * bh + 3, s / 4 - 6, bh - 6);
          }
        }
      });
      const fireP = new THREE.Vector3(1.5, 1.0, 0);
      const wallMat = new THREE.ShaderMaterial({
        uniforms: { uBrick: { value: texFrom(brick, true) }, uHeat: { value: heatTex }, uFireP: { value: fireP }, uFireI: { value: 0 } },
        vertexShader: WORLD_VS,
        fragmentShader: /* glsl */ `uniform sampler2D uBrick, uHeat; uniform vec3 uFireP; uniform float uFireI; varying vec3 vW; varying vec3 vN;
          void main(){ vec3 N = normalize(vN);
            vec2 bu = vec2(vW.z * 0.5, vW.y * 0.5);
            vec3 base = texture2D(uBrick, bu).rgb;
            vec2 hu = vec2((vW.z + 2.5) / 5.0, vW.y / 3.2);
            vec4 hs = texture2D(uHeat, hu);
            vec3 L = uFireP - vW; float d = length(L);
            float lam = max(dot(N, L / d), 0.0) * uFireI / (1.0 + d * d * 0.6);
            vec3 c = base * (0.12 + lam * vec3(1.0, 0.55, 0.25));
            c *= 1.0 - hs.g * 0.85;
            float h = hs.r;
            vec3 hc = mix(vec3(0.5, 0.05, 0.0), vec3(1.0, 0.45, 0.05), smoothstep(0.3, 0.7, h));
            hc = mix(hc, vec3(1.0, 0.85, 0.5) * 2.0, smoothstep(0.75, 1.0, h));
            c += hc * smoothstep(0.08, 0.5, h) * 1.6;
            gl_FragColor = vec4(c, 1.0); ${TONE} }`,
      });
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.2, 5), wallMat);
      wall.position.set(WX + 0.2, 1.6, 0);
      S.scene.add(wall);
      // 화염 방사기
      const metal = new THREE.MeshStandardMaterial({ color: 0x6a6e76, roughness: 0.35, metalness: 0.85 });
      const gun = new THREE.Group();
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 1.0, 16), metal);
      barrel.rotation.z = -Math.PI / 2;
      barrel.position.x = 0.5;
      const tipM = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.12, 16), new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.6, metalness: 0.6 }));
      tipM.rotation.z = -Math.PI / 2;
      tipM.position.x = 1.02;
      const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.5, 6, 16), new THREE.MeshStandardMaterial({ color: 0x9a2a1a, roughness: 0.45, metalness: 0.3 }));
      tank.rotation.z = Math.PI / 2;
      tank.position.set(0.1, -0.24, 0);
      const hose = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 8, 20, Math.PI), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 }));
      hose.position.set(-0.2, -0.08, 0);
      hose.rotation.z = Math.PI / 2;
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.06), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 }));
      grip.position.set(0.25, -0.12, 0);
      gun.add(barrel, tipM, tank, hose, grip);
      gun.position.set(-3.2, 0.95, 0.4);
      gun.rotation.y = 0.06;
      S.scene.add(gun);
      const NZ = new THREE.Vector3(-3.2 + 1.08, 0.95, 0.4 - 0.065);
      const DIR = new THREE.Vector3(1, 0.03, -0.06).normalize();
      const light = new THREE.PointLight(0xff8a30, 0, 10, 1.4);
      S.scene.add(light);
      const fire = S.pool(2600, 4);
      const smoke = S.pool(500, 2);
      const FIRE = ramp([[0, 0x6ab0ff, 2.2, 0, 1], [0.05, 0x9ad4ff, 2.4, 0.8, 1], [0.13, 0xffe0a0, 1.7, 0.85, 1], [0.3, 0xffa030, 1.45, 0.8, 1], [0.55, 0xff5a10, 1.1, 0.7, 0.9], [0.78, 0x5a2410, 0.9, 0.5, 0.2], [1, 0x1a1210, 0.6, 0, 0]]);
      const FIRE2 = ramp([[0, 0xfff0c0, 3.5, 0, 1], [0.15, 0xffc050, 3, 0.9, 1], [0.55, 0xff6a10, 2, 0.7, 0.9], [1, 0x3a1a10, 0.6, 0, 0.1]]);
      const DROP = flat(0xffd890, 5, 1);
      const PILOT = ramp([[0, 0x6ab0ff, 3, 0.9, 1], [1, 0x2050ff, 1, 0, 1]]);
      const SMK = ramp([[0, 0x3a3634, 1, 0, 0], [0.15, 0x302c2a, 1, 0.5, 0], [1, 0x4a4644, 1, 0, 0]]);
      interface Burner {
        x: number;
        z: number;
        life: number;
        age: number;
      }
      const burners: Burner[] = [];
      let range = 1;
      let fuel = 1;
      let drops = true;
      const addHeat = (z: number, y: number, h: number, s: number): void => {
        const ix = Math.round(((z + 2.5) / 5) * HW);
        const iy = Math.round((y / 3.2) * HH);
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const x = ix + dx;
            const yy = iy + dy;
            if (x < 0 || yy < 0 || x >= HW || yy >= HH) continue;
            const w = Math.exp(-(dx * dx + dy * dy) / 2.5);
            const k = yy * HW + x;
            heat[k] = Math.min(1.1, heat[k]! + h * w);
            soot[k] = Math.min(1, soot[k]! + s * w);
          }
      };
      fire.onStep = (p, i) => {
        const tg = p.tag[i]!;
        if (tg === 1 && p.x[i]! > WX - 0.12 && p.vx[i]! > 0) {
          const sp = Math.hypot(p.vx[i]!, p.vy[i]!, p.vz[i]!);
          const a = p.rot[i]!;
          p.x[i] = WX - 0.12;
          p.vx[i] = -sp * 0.06;
          p.vy[i] = Math.sin(a) * sp * 0.55 + 0.8;
          p.vz[i] = Math.cos(a) * sp * 0.6;
          p.tag[i] = 2;
          addHeat(p.z[i]!, p.y[i]!, 0.06, 0.012);
        } else if (tg === 3) {
          if (p.y[i]! < 0.03) {
            if (burners.length < 26) burners.push({ x: p.x[i]!, z: p.z[i]!, life: R(2, 3.4), age: 0 });
            p.end(i);
          } else if (Math.random() < 0.5) fire.spawn({ x: p.x[i]!, y: p.y[i]!, z: p.z[i]!, vy: 0.3, life: 0.25, s0: 0.12, s1: 0.04, ramp: FIRE2, shape: 6, rot: R(0, TAU) });
          if (p.x[i]! > WX - 0.05) p.end(i);
        }
      };
      const controls: Control[] = [
        ctrlRange('사거리', 0.6, 1.3, 0.05, 1, (v) => (range = v)),
        ctrlRange('연료 양', 0.4, 1.6, 0.05, 1, (v) => (fuel = v)),
        ctrlTog('불방울 (바닥에서 탐)', true, (v) => (drops = v)),
      ];
      let cyc = 0;
      let acc = 0;
      let accD = 0;
      return {
        scene: S.scene,
        camera: S.cam,
        controls,
        update(t, dt0) {
          const dt = Math.min(dt0, 0.05);
          const prev = cyc;
          cyc = (cyc + dt) % 4.6;
          if (cyc < prev) {
            for (let k = 0; k < soot.length; k++) soot[k] = soot[k]! * 0.5;
          }
          const on = cyc < 2.7;
          if (on) {
            acc += dt * 120 * fuel;
            while (acc >= 1) {
              acc -= 1;
              const sp = R(8, 9.5) * range;
              fire.spawn({ x: NZ.x + R(-0.02, 0.02), y: NZ.y + R(-0.02, 0.02), z: NZ.z, vx: DIR.x * sp, vy: DIR.y * sp + R(-0.35, 0.35), vz: DIR.z * sp + R(-0.4, 0.4), life: R(0.75, 1.0), s0: 0.08, s1: R(0.8, 1.6), ramp: FIRE, shape: 6, rot: R(0, TAU), rv: R(-4, 4), drag: 1.0, grav: -1.6, tag: 1 });
            }
            if (drops) {
              accD += dt * 8 * fuel;
              while (accD >= 1) {
                accD -= 1;
                const sp = R(4.5, 7) * range;
                fire.spawn({ x: NZ.x + 0.3, y: NZ.y, z: NZ.z, vx: DIR.x * sp, vy: R(0, 1.2), vz: R(-0.6, 0.6), life: 2.5, s0: 0.07, ramp: DROP, shape: 0, grav: 7, tag: 3 });
              }
            }
            lab.set('화염 줄기 — 벽에 부딪혀 퍼지고 열 · 그을음이 쌓임', '#ff9a40');
          } else lab.set(burners.length ? '떨어진 불방울이 바닥에서 탐 · 벽이 식어 감' : '대기', '#ff7030');
          // 점화 불꽃
          fire.spawn({ x: NZ.x + 0.02, y: NZ.y - 0.04, z: NZ.z, vx: 0.3, vy: 0.4, life: 0.2, s0: 0.06, s1: 0.02, ramp: PILOT, shape: 0 });
          // 바닥 불
          let bI = 0;
          for (let i = burners.length - 1; i >= 0; i--) {
            const b = burners[i]!;
            b.age += dt;
            const k = b.age / b.life;
            if (k >= 1) {
              burners.splice(i, 1);
              continue;
            }
            const s = Math.sin(Math.PI * Math.min(1, k * 1.5 + 0.2));
            bI += s;
            if (Math.random() < dt * 16) fire.spawn({ x: b.x + R(-0.08, 0.08), y: 0.04, z: b.z + R(-0.08, 0.08), vx: R(-0.1, 0.1), vy: R(0.7, 1.3), vz: R(-0.1, 0.1), life: R(0.4, 0.6), s0: 0.1 * s + 0.04, s1: 0.4 * s + 0.1, ramp: FIRE2, shape: 6, rot: R(0, TAU), rv: R(-2, 2), drag: 1, grav: -0.5 });
            if (Math.random() < dt * 2) smoke.spawn({ x: b.x, y: 0.3, z: b.z, vy: 0.6, life: R(1.5, 2.2), s0: 0.15, s1: 0.8, ramp: SMK, shape: 1, rot: R(-0.4, 0.4), drag: 0.6 });
          }
          if (on && Math.random() < dt * 10) smoke.spawn({ x: WX - 0.3, y: R(0.8, 1.6), z: R(-0.6, 0.6), vx: -0.3, vy: R(0.6, 1), life: R(1.8, 2.6), s0: 0.4, s1: 1.6, ramp: SMK, shape: 1, rot: R(-0.4, 0.4), drag: 0.5, grav: -0.3 });
          const decay = Math.exp(-dt * 0.55);
          for (let k = 0; k < HW * HH; k++) {
            heat[k] = heat[k]! * decay;
            hd[k * 4] = Math.round(clamp(heat[k]!, 0, 1) * 255);
            hd[k * 4 + 1] = Math.round(clamp(soot[k]!, 0, 1) * 255);
            hd[k * 4 + 3] = 255;
          }
          heatTex.needsUpdate = true;
          const fl = 0.8 + 0.2 * Math.sin(t * 37) * Math.sin(t * 23);
          const LI = (on ? 26 * fuel : 0) * fl + bI * 3;
          light.intensity = LI;
          light.position.set(on ? 0.6 : 0, on ? 1.1 : 0.3, 0.4);
          fireP.copy(light.position);
          wallMat.uniforms.uFireI!.value = LI * 0.25;
          fire.tick(dt);
          smoke.tick(dt);
          S.tick(dt);
        },
        resize: (w, h) => S.resize(w, h),
        dispose: () => {
          S.dispose();
          heatTex.dispose();
        },
      };
    },
  },

  /* i514 크리스탈 성장 · 깨짐 */
  i514: {
    kind: '3d',
    caption: '육각 결정이 바닥에서 차례로 튀어나와 자람(넘치게 컸다 돌아옴 · 끝이 빛남) → 반짝 → 하얗게 번쩍 후 조각으로 깨져 흩어짐',
    make(): Scene3D {
      const S = makeStage({ bg: 0x06060c, cam: [0, 1.7, 5.4], look: [0, 0.75, 0], fov: 42, fog: [7, 18] });
      const lab = S.hud.label('tl');
      S.scene.add(new THREE.HemisphereLight(0x404880, 0x080808, 0.4));
      const rock = groundCanvas('v3rock', '#2c2824', [['rgba(0,0,0,0.3)', 6000, 2], ['rgba(255,255,255,0.05)', 3000, 1.5]], 71);
      const rockT = texFrom(rock, true, 5);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ map: rockT, bumpMap: rockT, bumpScale: 2, roughness: 0.9, color: 0x6a7088 }));
      ground.rotation.x = -Math.PI / 2;
      S.scene.add(ground);
      const prism = mergeGeometries([new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1).translate(0, 0.5, 0), new THREE.ConeGeometry(0.5, 0.5, 6, 1).translate(0, 1.25, 0)], false)!;
      const N_MAX = 40;
      const iCol = new THREE.InstancedBufferAttribute(new Float32Array(N_MAX * 3), 3);
      const iGrow = new THREE.InstancedBufferAttribute(new Float32Array(N_MAX * 2), 2);
      iCol.setUsage(THREE.DynamicDrawUsage);
      iGrow.setUsage(THREE.DynamicDrawUsage);
      prism.setAttribute('iCol', iCol);
      prism.setAttribute('iGrow', iGrow);
      const crystalMat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: /* glsl */ `attribute vec3 iCol; attribute vec2 iGrow; varying vec3 vW; varying float vH; varying vec3 vCol; varying vec2 vG;
          void main(){ vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vW = w.xyz; vH = position.y / 1.5; vCol = iCol; vG = iGrow;
            gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: /* glsl */ `uniform float uTime; varying vec3 vW; varying float vH; varying vec3 vCol; varying vec2 vG;
          void main(){ vec3 N = normalize(cross(dFdx(vW), dFdy(vW))); vec3 V = normalize(cameraPosition - vW); if (dot(N, V) < 0.0) N = -N;
            float ndv = max(dot(N, V), 0.0);
            vec3 Rf = reflect(-V, N);
            vec3 env = mix(vec3(0.02, 0.02, 0.05), vec3(0.55, 0.58, 0.8), smoothstep(-0.2, 0.9, Rf.y));
            float spec = pow(max(dot(Rf, normalize(vec3(-0.4, 0.8, 0.5))), 0.0), 50.0) * 2.4 + pow(max(dot(Rf, normalize(vec3(0.6, 0.3, 0.7))), 0.0), 16.0) * 0.5;
            float fres = pow(1.0 - ndv, 3.0);
            float facet = 0.55 + 0.45 * sin(dot(N, vec3(13.0, 7.0, 11.0)) * 2.0);
            float inner = 0.12 + 1.5 * pow(vH, 1.7);
            float sweep = exp(-pow((fract(vH * 0.5 - uTime * 0.35) - 0.5) * 9.0, 2.0)) * 0.5;
            vec3 col = vCol * (inner + sweep) * facet + env * fres * 0.9 + vec3(spec) + vCol * fres * 1.3;
            col += vCol * smoothstep(0.55, 1.0, vH) * (1.0 - vG.x) * 3.5;
            col = mix(col, vec3(4.0), vG.y);
            gl_FragColor = vec4(col, 1.0); ${TONE} }`,
      });
      const im = new THREE.InstancedMesh(prism, crystalMat, N_MAX);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      S.scene.add(im);
      const THEMES = [
        [0xb050ff, 0x30d8ff, 0xff4aa0],
        [0x60e0ff, 0x8ab0ff, 0xc0f4ff],
        [0xffb030, 0xff6020, 0xffe060],
      ];
      let theme = 0;
      const CL = [new THREE.Vector3(-1.4, 0, -0.3), new THREE.Vector3(0.15, 0, 0.35), new THREE.Vector3(1.55, 0, -0.55)];
      interface Cr {
        c: number;
        pos: THREE.Vector3;
        q: THREE.Quaternion;
        len: number;
        rad: number;
        start: number;
        tip: THREE.Vector3;
        burst: boolean;
      }
      const CR: Cr[] = [];
      const rr = rng(5);
      CL.forEach((c, ci) => {
        const n = 7 + ci % 2;
        for (let k = 0; k < n; k++) {
          const main = k === 0;
          const a = rr() * TAU;
          const tilt = main ? rr() * 0.12 : 0.3 + rr() * 0.55;
          const dir = new THREE.Vector3(Math.sin(tilt) * Math.cos(a), Math.cos(tilt), Math.sin(tilt) * Math.sin(a));
          const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
          const off = main ? 0 : 0.08 + rr() * 0.22;
          const len = main ? 1.5 + rr() * 0.5 : 0.5 + rr() * 0.8;
          const rad = main ? 0.2 + rr() * 0.06 : 0.08 + rr() * 0.1;
          CR.push({ c: ci, pos: new THREE.Vector3(c.x + Math.cos(a) * off, -0.05, c.z + Math.sin(a) * off), q, len, rad, start: ci * 0.55 + (main ? 0 : 0.15 + k * 0.11), tip: dir.clone(), burst: false });
        }
      });
      const lights = CL.map((c) => {
        const l = new THREE.PointLight(0xffffff, 0, 5, 1.6);
        l.position.set(c.x, 0.7, c.z + 0.3);
        S.scene.add(l);
        return l;
      });
      const discs = CL.map((c) => {
        const d = glowDisc(0xffffff, 0, 2.2, 3.5);
        d.mesh.position.set(c.x, 0.015, c.z);
        S.scene.add(d.mesh);
        return d;
      });
      const ring = new Ring();
      S.scene.add(ring.mesh);
      const P = S.pool(2400, 5);
      P.floorY = 0.02;
      const dust = S.pool(300, 2);
      const DUST = ramp([[0, 0x6a6a7a, 1, 0, 0], [0.15, 0x5a5a6a, 1, 0.4, 0], [1, 0x3a3a44, 1, 0, 0]]);
      const ramps = (hex: number): { shard: Float32Array; spark: Float32Array } => ({
        shard: ramp([[0, 0xffffff, 5, 1, 1], [0.15, hex, 3.5, 1, 1], [0.8, hex, 1.6, 0.85, 1], [1, hex, 0.6, 0, 1]]),
        spark: ramp([[0, 0xffffff, 7, 0, 1], [0.2, 0xffffff, 6, 1, 1], [1, hex, 2, 0, 1]]),
      });
      let R3 = THEMES[0]!.map(ramps);
      const col = new THREE.Color();
      let speed = 1;
      let size = 1;
      let cyc = 0;
      let shattered = false;
      const SH = 5.2;
      const CY = 7.0;
      const controls: Control[] = [
        ctrlRange('자라는 속도', 0.5, 2, 0.05, 1, (v) => (speed = v)),
        ctrlRange('결정 크기', 0.6, 1.5, 0.05, 1, (v) => (size = v)),
        ctrlRange('색 (0 보석 · 1 얼음 · 2 호박)', 0, 2, 1, 0, (v) => {
          theme = v;
          R3 = THEMES[v]!.map(ramps);
        }),
        ctrlBtn('지금 깨기', () => (cyc = Math.max(cyc, SH - 0.01))),
      ];
      const M = new THREE.Matrix4();
      const SC = new THREE.Vector3();
      const tip = new THREE.Vector3();
      return {
        scene: S.scene,
        camera: S.cam,
        controls,
        update(t, dt0) {
          const dt = Math.min(dt0, 0.05);
          const prev = cyc;
          cyc = (cyc + dt * (cyc < SH ? speed : 1)) % CY;
          if (cyc < prev) {
            shattered = false;
            for (const c of CR) c.burst = false;
          }
          crystalMat.uniforms.uTime!.value = t;
          const flashK = cyc >= SH ? clamp(1 - (cyc - SH) / 0.12, 0, 1) : 0;
          if (cyc >= SH + 0.1 && !shattered) {
            shattered = true;
            ring.fire(0, 0.03, 0, 4.5, 0.7, THEMES[theme]![0]!, 3);
            S.shake = 0.08;
            for (const c of CR) {
              const L = c.len * size;
              const sp = R3[c.c]!;
              const n = Math.round(10 + L * 16);
              for (let k = 0; k < n; k++) {
                const s = Math.random();
                tip.copy(c.tip).multiplyScalar(L * s).add(c.pos);
                const d = sphereDir();
                const v = R(1.5, 4.5);
                P.spawn({ x: tip.x, y: Math.max(0.05, tip.y), z: tip.z, vx: d.x * v + c.tip.x * 1.5, vy: Math.abs(d.y) * v + 1.5, vz: d.z * v + c.tip.z * 1.5, life: R(1.2, 2.2), s0: R(0.05, 0.11) * size, ramp: sp.shard, shape: 3, rot: R(0, TAU), rv: R(-12, 12), drag: 0.6, grav: 8, bnc: 0.35 });
              }
              for (let k = 0; k < 8; k++) {
                const d = sphereDir();
                tip.copy(c.tip).multiplyScalar(L * Math.random()).add(c.pos);
                P.spawn({ x: tip.x, y: tip.y, z: tip.z, vx: d.x * 2, vy: d.y * 2, vz: d.z * 2, life: R(0.5, 1), s0: R(0.12, 0.25), ramp: sp.spark, shape: 4, rot: R(0, TAU), drag: 2 });
              }
            }
          }
          let n = 0;
          const grownBy = [0, 0, 0];
          const pal = THEMES[theme]!;
          for (const c of CR) {
            const k = clamp((cyc - c.start) / 0.6, 0, 1);
            if (cyc < SH && k > 0 && !c.burst) {
              c.burst = true;
              const sp = R3[c.c]!;
              for (let j = 0; j < 10; j++) {
                const d = sphereDir();
                P.spawn({ x: c.pos.x, y: 0.05, z: c.pos.z, vx: d.x * 2, vy: Math.abs(d.y) * 3, vz: d.z * 2, life: R(0.5, 0.9), s0: R(0.03, 0.06), ramp: sp.shard, shape: 3, rot: R(0, TAU), rv: R(-10, 10), grav: 8, bnc: 0.3 });
              }
              for (let j = 0; j < 5; j++) {
                const a = R(0, TAU);
                dust.spawn({ x: c.pos.x, y: 0.1, z: c.pos.z, vx: Math.cos(a) * 0.8, vy: 0.3, vz: Math.sin(a) * 0.8, life: R(1, 1.5), s0: 0.15, s1: 0.6, ramp: DUST, shape: 1, rot: R(-0.4, 0.4), drag: 2 });
              }
            }
            if (shattered || k <= 0) continue;
            const L = c.len * size * backOut(k);
            const rad = c.rad * size * Math.min(1, k * 1.8);
            M.compose(c.pos, c.q, SC.set(rad * 2, L / 1.5 + 0.0001, rad * 2));
            im.setMatrixAt(n, M);
            col.setHex(pal[c.c]!);
            iCol.setXYZ(n, col.r, col.g, col.b);
            iGrow.setXY(n, k, flashK);
            n++;
            grownBy[c.c] = grownBy[c.c]! + k / 8;
            if (k >= 1 && Math.random() < dt * 1.2) {
              tip.copy(c.tip).multiplyScalar(L + 0.02).add(c.pos);
              P.spawn({ x: tip.x, y: tip.y, z: tip.z, life: R(0.4, 0.7), s0: R(0.15, 0.28), ramp: R3[c.c]!.spark, shape: 4, rot: R(0, TAU) });
            }
          }
          im.count = n;
          im.instanceMatrix.needsUpdate = true;
          iCol.needsUpdate = true;
          iGrow.needsUpdate = true;
          CL.forEach((_, i) => {
            const g = shattered ? 0 : grownBy[i]!;
            lights[i]!.color.setHex(pal[i]!);
            lights[i]!.intensity = g * 6 + flashK * 20;
            discs[i]!.set(g * 0.9 + flashK, pal[i]!);
          });
          if (cyc < SH) lab.set(cyc < 2.4 ? '자라남 — 바닥에서 튀어나와 넘치게 컸다 돌아옴' : '반짝임 — 끝에서 빛이 맺힘', '#c890ff');
          else lab.set(cyc < SH + 0.2 ? '번쩍!' : '깨짐 — 조각이 튀어 흩어짐', '#ffffff');
          ring.update(dt);
          P.tick(dt);
          dust.tick(dt);
          S.tick(dt);
        },
        resize: (w, h) => S.resize(w, h),
        dispose: () => S.dispose(),
      };
    },
  },

  /* i515 꽃잎 · 낙엽 바람에 흩날림 */
  i515: {
    kind: '3d',
    caption: '꽃잎마다 돌며 팔랑 — 지나가는 돌풍이 잔디를 눕히고 땅에 떨어진 꽃잎을 다시 들어 올림 (벚꽃 ↔ 단풍)',
    make(): Scene3D {
      const S = makeStage({ bg: 0xc4dcef, cam: [0.4, 1.7, 8.2], look: [0, 1.5, 0], fov: 46, fog: [16, 48] });
      S.scene.add(skyDome(0x6aa8e0, 0xf2e6ee, 0x8aa070, 0, { dir: [0.5, 0.6, -0.6], col: 0xfff4e0, pow: 10, I: 0.5 }));
      const lab = S.hud.label('tl');
      S.scene.add(new THREE.HemisphereLight(0xffffff, 0x6a8a50, 1.1));
      const sunL = new THREE.DirectionalLight(0xfff4e0, 2.2);
      sunL.position.set(5, 8, 4);
      S.scene.add(sunL);
      const grassC = groundCanvas('v3grass', '#5c8c3c', [['rgba(30,70,10,0.35)', 9000, 2], ['rgba(170,210,90,0.3)', 6000, 1.5]], 91);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ map: texFrom(grassC, true, 14), roughness: 1 }));
      ground.rotation.x = -Math.PI / 2;
      S.scene.add(ground);
      let windK = 1;
      const GUST = /* glsl */ `uniform float uTime, uWind; float gustX(float t){ return -10.0 + mod(t * 4.2, 26.0); }
        float windAt(vec2 p, float t){ float g = exp(-pow((p.x - gustX(t)) / 2.2, 2.0)); return uWind * (0.35 + 0.25 * sin(t * 1.3 + p.x * 0.4 + p.y * 0.7)) + uWind * 2.2 * g; }`;
      const gustX = (t: number): number => -10 + ((t * 4.2) % 26);
      const windAt = (x: number, z: number, t: number): number => {
        const g = Math.exp(-Math.pow((x - gustX(t)) / 2.2, 2));
        return windK * (0.35 + 0.25 * Math.sin(t * 1.3 + x * 0.4 + z * 0.7)) + windK * 2.2 * g;
      };
      // 잔디 (누우는 풀잎)
      const NG = 2600;
      const bladeGeo = new THREE.PlaneGeometry(0.045, 0.32, 1, 3).translate(0, 0.16, 0);
      {
        const p = bladeGeo.attributes.position!;
        for (let i = 0; i < p.count; i++) {
          const h = p.getY(i) / 0.32;
          p.setX(i, p.getX(i) * (1 - h * 0.85));
        }
      }
      const gOff = new THREE.InstancedBufferAttribute(new Float32Array(NG * 4), 4);
      const rg = rng(31);
      for (let i = 0; i < NG; i++) gOff.setXYZW(i, -8 + rg() * 16, -4.5 + rg() * 8, rg() * TAU, 0.6 + rg() * 0.8);
      bladeGeo.setAttribute('iOff', gOff);
      const grassMat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uWind: { value: 1 } },
        vertexShader: /* glsl */ `attribute vec4 iOff; varying float vH; varying float vV; ${GUST}
          void main(){ vec3 p = position; float h = p.y / 0.32; vH = h; vV = fract(iOff.z * 7.3);
            p *= iOff.w; float c = cos(iOff.z), s = sin(iOff.z); p.xz = vec2(c * p.x - s * p.z, s * p.x + c * p.z);
            float w = windAt(iOff.xy, uTime);
            float bend = w * h * h * 0.16 + 0.02 * sin(uTime * 3.0 + iOff.x * 2.0) * h;
            p.x += bend; p.y -= bend * bend * 0.6;
            vec3 wp = vec3(iOff.x, 0.0, iOff.y) + p;
            gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0); }`,
        fragmentShader: /* glsl */ `varying float vH; varying float vV;
          void main(){ vec3 a = vec3(0.12, 0.25, 0.06); vec3 b = mix(vec3(0.45, 0.68, 0.22), vec3(0.6, 0.75, 0.3), vV);
            gl_FragColor = vec4(mix(a, b, vH), 1.0); ${TONE} }`,
        side: THREE.DoubleSide,
      });
      const grass = new THREE.InstancedMesh(bladeGeo, grassMat, NG);
      grass.frustumCulled = false;
      S.scene.add(grass);
      // 나무
      const tree = new THREE.Group();
      const bark = new THREE.MeshStandardMaterial({ color: 0x4a3426, roughness: 0.9 });
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.26, 2.6, 12), bark);
      trunk.position.y = 1.3;
      trunk.rotation.z = 0.06;
      const br1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.11, 1.4, 8), bark);
      br1.position.set(0.45, 2.5, 0);
      br1.rotation.z = -0.8;
      const br2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, 1.2, 8), bark);
      br2.position.set(-0.4, 2.45, 0.1);
      br2.rotation.z = 0.9;
      tree.add(trunk, br1, br2);
      const canopyMat = new THREE.MeshStandardMaterial({ color: 0xffd4e2, roughness: 0.8, flatShading: true, emissive: 0x4a2a34 });
      const canopyMat2 = new THREE.MeshStandardMaterial({ color: 0xd88aa8, roughness: 0.9, flatShading: true });
      const cr = rng(12);
      const lumps: THREE.Vector3[] = [];
      for (let i = 0; i < 9; i++) {
        const s = 0.42 + cr() * 0.3;
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), canopyMat2);
        m.position.set((cr() - 0.5) * 2.2, 2.9 + (cr() - 0.3) * 0.9, (cr() - 0.5) * 1.2);
        lumps.push(m.position.clone().setY(m.position.y + 0.0001), new THREE.Vector3(s, 0, 0));
        tree.add(m);
      }
      // 꽃송이: 작은 덩이 수백 개를 덩어리 겉면에 소복이
      const NB = 520;
      const blossom = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.11, 0), canopyMat, NB);
      {
        const Mb = new THREE.Matrix4();
        const qb = new THREE.Quaternion();
        const pb = new THREE.Vector3();
        const sb = new THREE.Vector3();
        const cb = new THREE.Color();
        for (let i = 0; i < NB; i++) {
          const li = Math.floor(cr() * 9) * 2;
          const c = lumps[li]!;
          const s = lumps[li + 1]!.x;
          const d = sphereDir();
          if (d.y < -0.4) d.y = -d.y * 0.5;
          pb.set(c.x + d.x * s * 1.02, c.y + d.y * s * 1.02, c.z + d.z * s * 1.02);
          qb.setFromEuler(new THREE.Euler(cr() * 6, cr() * 6, cr() * 6));
          sb.setScalar(0.7 + cr() * 0.8);
          Mb.compose(pb, qb, sb);
          blossom.setMatrixAt(i, Mb);
          blossom.setColorAt(i, cb.setScalar(0.82 + cr() * 0.3));
        }
      }
      tree.add(blossom);
      tree.position.set(-3.2, 0, -1.6);
      S.scene.add(tree);
      const CANOPY = new THREE.Vector3(-3.2, 3.0, -1.6);
      // 꽃잎 · 잎 모양
      const petalGeo = (() => {
        const sh = new THREE.Shape();
        sh.moveTo(0, -0.05);
        sh.bezierCurveTo(0.045, -0.03, 0.05, 0.03, 0.02, 0.05);
        sh.lineTo(0, 0.035);
        sh.lineTo(-0.02, 0.05);
        sh.bezierCurveTo(-0.05, 0.03, -0.045, -0.03, 0, -0.05);
        const g = new THREE.ShapeGeometry(sh, 6);
        const p = g.attributes.position!;
        const cA = new THREE.Color(0xffffff);
        const cB = new THREE.Color(0xf48ab0);
        const cols = new Float32Array(p.count * 3);
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i);
          const y = p.getY(i);
          p.setZ(i, x * x * 9 - y * 0.15);
          const c = cA.clone().lerp(cB, clamp(0.85 - (y + 0.05) * 8, 0, 1));
          cols.set([c.r, c.g, c.b], i * 3);
        }
        g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
        g.computeVertexNormals();
        return g;
      })();
      const leafGeo = (() => {
        const sh = new THREE.Shape();
        const n = 5;
        for (let i = 0; i <= n * 2; i++) {
          const a = (i / (n * 2)) * TAU + Math.PI / 2;
          const r = i % 2 === 0 ? 0.075 : 0.032;
          const x = Math.cos(a) * r;
          const y = Math.sin(a) * r * (a > Math.PI && a < TAU ? 0.75 : 1);
          if (i === 0) sh.moveTo(x, y);
          else sh.lineTo(x, y);
        }
        const g = new THREE.ShapeGeometry(sh);
        const p = g.attributes.position!;
        const cols = new Float32Array(p.count * 3).fill(1);
        for (let i = 0; i < p.count; i++) p.setZ(i, (p.getX(i) * p.getX(i) + p.getY(i) * p.getY(i)) * 5);
        g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
        g.computeVertexNormals();
        return g;
      })();
      const NP = 700;
      const pm = new THREE.InstancedMesh(petalGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide, emissive: 0x5a3a44 }), NP);
      pm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      pm.frustumCulled = false;
      for (let i = 0; i < NP; i++) pm.setColorAt(i, new THREE.Color(1, 1, 1));
      S.scene.add(pm);
      interface Pt {
        p: THREE.Vector3;
        v: THREE.Vector3;
        ax: THREE.Vector3;
        ang: number;
        ph: number;
        rest: number;
        yaw: number;
        c: THREE.Color;
      }
      const PT: Pt[] = [];
      const LEAFC = [0xd8401a, 0xf08a1a, 0xf0c030, 0xb8541a, 0xc02818].map((h) => new THREE.Color(h));
      const PETALC = [0xffffff, 0xfff0f4, 0xffe0ea];
      let leaves = false;
      let amount = 1;
      const streaks = S.pool(300, 6);
      const STREAK = ramp([[0, 0xffffff, 1.3, 0, 0.6], [0.3, 0xffffff, 1.3, 0.22, 0.6], [1, 0xffffff, 1.2, 0, 0.6]]);
      const setLeaves = (v: boolean): void => {
        leaves = v;
        pm.geometry = v ? leafGeo : petalGeo;
        canopyMat.color.setHex(v ? 0xe8902a : 0xf6c0d4);
        canopyMat2.color.setHex(v ? 0xc8501a : 0xe89ab8);
        for (const p of PT) p.c.copy(v ? LEAFC[Math.floor(Math.random() * LEAFC.length)]! : new THREE.Color(PETALC[Math.floor(Math.random() * 3)]!));
      };
      const controls: Control[] = [
        ctrlRange('바람 세기', 0.2, 2, 0.05, 1, (v) => (windK = v)),
        ctrlTog('단풍잎', false, setLeaves),
        ctrlRange('꽃잎 양', 0.2, 2, 0.05, 1, (v) => (amount = v)),
      ];
      const spawnPetal = (): void => {
        if (PT.length >= NP) {
          let oi = -1;
          let best = -1;
          for (let i = 0; i < PT.length; i++)
            if (PT[i]!.rest > best) {
              best = PT[i]!.rest;
              oi = i;
            }
          if (best <= 0) return;
          PT.splice(oi, 1);
        }
        const d = sphereDir();
        PT.push({
          p: new THREE.Vector3(CANOPY.x + d.x * 1.4, CANOPY.y + d.y * 0.7, CANOPY.z + d.z * 0.9),
          v: new THREE.Vector3(),
          ax: new THREE.Vector3(R(-1, 1), R(-1, 1), R(-1, 1)).normalize(),
          ang: R(0, TAU),
          ph: R(0, TAU),
          rest: 0,
          yaw: R(0, TAU),
          c: leaves ? LEAFC[Math.floor(Math.random() * LEAFC.length)]!.clone() : new THREE.Color(PETALC[Math.floor(Math.random() * 3)]!),
        });
      };
      // 처음부터 흩날리게
      for (let i = 0; i < 260; i++) {
        spawnPetal();
        const p = PT[PT.length - 1]!;
        p.p.set(R(-6, 7), R(0.02, 3.5), R(-3, 2));
        if (p.p.y < 0.4) {
          p.p.y = 0.015;
          p.rest = R(0.1, 4);
        }
      }
      const M = new THREE.Matrix4();
      const Q = new THREE.Quaternion();
      const Q2 = new THREE.Quaternion();
      const E = new THREE.Euler();
      const ONE = new THREE.Vector3(1.9, 1.9, 1.9);
      const tv = new THREE.Vector3();
      let acc = 0;
      return {
        scene: S.scene,
        camera: S.cam,
        controls,
        update(t, dt0) {
          const dt = Math.min(dt0, 0.05);
          grassMat.uniforms.uTime!.value = t;
          grassMat.uniforms.uWind!.value = windK;
          acc += dt * 34 * amount * (0.6 + windK * 0.5);
          while (acc >= 1) {
            acc -= 1;
            spawnPetal();
          }
          const gx = gustX(t);
          let n = 0;
          for (let i = PT.length - 1; i >= 0; i--) {
            const p = PT[i]!;
            const w = windAt(p.p.x, p.p.z, t);
            if (p.rest > 0) {
              p.rest += dt;
              const g = Math.exp(-Math.pow((p.p.x - gx) / 1.6, 2)) * windK;
              if (g > 0.5 && Math.random() < dt * 6 * g) {
                p.rest = 0;
                p.v.set(w * 0.8, R(1.2, 2.4) * Math.min(1.5, windK), R(-0.3, 0.3));
              } else if (p.rest > 9) {
                PT.splice(i, 1);
                continue;
              }
            } else {
              tv.set(w + Math.sin(p.ph + t * 5) * 0.35, -0.5 + Math.cos(p.ph + t * 3.7) * 0.3, 0.12 * w + Math.sin(t * 4.3 + p.ph) * 0.3);
              p.v.lerp(tv, 1 - Math.exp(-dt * 2.2));
              p.p.addScaledVector(p.v, dt);
              p.ang += (2.2 + w * 1.6) * dt;
              if (p.p.y < 0.015) {
                p.p.y = 0.015;
                p.rest = 0.001;
              }
              if (p.p.x > 11) {
                PT.splice(i, 1);
                continue;
              }
            }
            if (p.rest > 0) {
              E.set(-Math.PI / 2, 0, p.yaw);
              Q.setFromEuler(E);
            } else {
              Q.setFromAxisAngle(p.ax, p.ang);
              E.set(Math.sin(t * 6 + p.ph) * 0.5, 0, Math.cos(t * 5 + p.ph) * 0.4);
              Q2.setFromEuler(E);
              Q.multiply(Q2);
            }
            M.compose(p.p, Q, ONE);
            pm.setMatrixAt(n, M);
            pm.setColorAt(n, p.c);
            n++;
          }
          pm.count = n;
          pm.instanceMatrix.needsUpdate = true;
          if (pm.instanceColor) pm.instanceColor.needsUpdate = true;
          // 바람 줄기 (돌풍 앞)
          if (Math.random() < dt * 20 * windK) {
            const x = gx + R(-1.5, 1);
            const ww = windAt(x, 0, t);
            streaks.spawn({ x, y: R(0.2, 3), z: R(-3, 2), vx: ww * 1.6 + 1, vy: R(-0.1, 0.1), life: R(0.5, 0.9), s0: 0.025, ramp: STREAK, shape: 2, st: 0.35 });
          }
          streaks.tick(dt);
          lab.set(Math.abs(gx) < 4 ? '돌풍 — 잔디가 눕고 땅의 ' + (leaves ? '잎이' : '꽃잎이') + ' 다시 날아오름' : (leaves ? '단풍잎' : '벚꽃잎') + ' — 돌며 팔랑팔랑 떨어짐', leaves ? '#f0901a' : '#f48ab0');
          S.tick(dt);
        },
        resize: (w, h) => S.resize(w, h),
        dispose: () => {
          S.dispose();
          petalGeo.dispose();
          leafGeo.dispose();
        },
      };
    },
  },

  /* i516 투명 은신 (굴절 실루엣) */
  i516: {
    kind: '3d',
    caption: '뒤 배경을 먼저 그려 두고 몸 표면 방향만큼 밀어 읽어 일렁이는 투명 몸 — 발끝부터 올라가는 전기 경계로 켜고 끄고, 은신 중엔 발밑 먼지만 보인다',
    make(): Scene3D {
      const S = makeStage({ bg: 0x1a1612, cam: [0, 1.2, 4.3], look: [0, 1.0, 0], fov: 42 });
      const lab = S.hud.label('tl');
      S.scene.add(new THREE.HemisphereLight(0xfff0e0, 0x302820, 1.0));
      const key = new THREE.DirectionalLight(0xffffff, 1.6);
      key.position.set(-2, 4, 3);
      S.scene.add(key);
      const mural = cachedCanvas('v3mural', 1024, 512, (g, w, h) => {
        const r = rng(2);
        g.fillStyle = '#6a4a3a';
        g.fillRect(0, 0, w, h);
        const bh = 32;
        for (let y = 0; y < h; y += bh)
          for (let x = -64 + ((y / bh) % 2) * 32; x < w; x += 64) {
            g.fillStyle = `hsl(${12 + r() * 14}, ${30 + r() * 15}%, ${30 + r() * 12}%)`;
            g.fillRect(x + 2, y + 2, 60, bh - 4);
          }
        const cols = ['#ffcc33', '#22b5c8', '#ef4f6a', '#7ad04a', '#ffffff', '#3a5cff'];
        for (let i = 0; i < 9; i++) {
          g.save();
          g.translate(60 + i * 112 + r() * 20, 90 + r() * 200);
          g.rotate((r() - 0.5) * 0.25);
          g.fillStyle = cols[i % cols.length]!;
          g.fillRect(-42, -60, 84, 120);
          g.fillStyle = cols[(i + 2) % cols.length]!;
          g.beginPath();
          g.arc(0, -10, 26, 0, TAU);
          g.fill();
          g.fillStyle = '#1a1a1a';
          g.font = 'bold 26px sans-serif';
          g.textAlign = 'center';
          g.fillText(['π', '∑', '7', '√2', '∞', 'x²', '∆', '%', '½'][i]!, 0, 0);
          g.fillRect(-30, 30, 60, 6);
          g.fillRect(-30, 42, 40, 6);
          g.restore();
        }
        for (let i = 0; i < 14; i++) {
          g.strokeStyle = cols[i % cols.length]!;
          g.lineWidth = 10;
          g.beginPath();
          g.moveTo(i * 80, h);
          g.lineTo(i * 80 + 140, h - 120);
          g.stroke();
        }
      });
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), new THREE.MeshStandardMaterial({ map: texFrom(mural, true), roughness: 0.85 }));
      wall.position.set(0, 2.2, -1.6);
      S.scene.add(wall);
      const chk = cachedCanvas('v3chk', 256, 256, (g, s) => {
        for (let y = 0; y < 8; y++)
          for (let x = 0; x < 8; x++) {
            g.fillStyle = (x + y) % 2 ? '#e8e2d6' : '#2a2622';
            g.fillRect((x * s) / 8, (y * s) / 8, s / 8, s / 8);
          }
      });
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), new THREE.MeshStandardMaterial({ map: texFrom(chk, true, 4), roughness: 0.4 }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.z = 2;
      S.scene.add(floor);
      const lamp = new THREE.PointLight(0xffb070, 6, 8, 1.5);
      lamp.position.set(2, 2.6, 0.5);
      S.scene.add(lamp);
      const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
      const geo = figureGeo('stand');
      const cloakMat = new THREE.ShaderMaterial({
        uniforms: { uRT: { value: rt.texture }, uRes: { value: new THREE.Vector2(4, 4) }, uCut: { value: -0.3 }, uStr: { value: 1 }, uChroma: { value: 1 }, uTime: { value: 0 }, uNoise: { value: S.noise }, uCol: { value: new THREE.Color(0x40e0ff) }, uY0: { value: 0 } },
        vertexShader: /* glsl */ `varying vec3 vW; varying vec3 vN; varying vec3 vVN; varying vec3 vL;
          void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vL = position; vN = normalize(mat3(modelMatrix) * normal); vVN = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: /* glsl */ `uniform sampler2D uRT, uNoise; uniform vec2 uRes; uniform float uCut, uStr, uChroma, uTime, uY0; uniform vec3 uCol;
          varying vec3 vW; varying vec3 vN; varying vec3 vVN; varying vec3 vL;
          ${SHADE_GLSL}
          void main(){ vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vW); float ndv = max(dot(N, V), 0.0);
            float plate = smoothstep(0.88, 0.95, fract(vL.y * 6.0)) + smoothstep(0.9, 0.97, fract(vL.x * 5.0 + 0.3)) * 0.5;
            vec3 base = mix(vec3(0.16, 0.2, 0.24), vec3(0.32, 0.38, 0.44), plate);
            vec3 sh = shade(base, N, V, normalize(vec3(-0.5, 0.8, 0.6)), vec3(1.0, 0.96, 0.9));
            vec3 Rf = reflect(-V, N); sh += mix(vec3(0.03), vec3(0.3, 0.32, 0.36), smoothstep(-0.1, 0.9, Rf.y)) * 0.5;
            sh += uCol * pow(1.0 - ndv, 3.0) * 0.4 + uCol * 0.6 * step(0.97, fract(vL.y * 6.0));
            vec2 suv = gl_FragCoord.xy / uRes;
            vec3 vn = normalize(vVN);
            float wob = texture2D(uNoise, vW.xy * 1.3 + vec2(uTime * 0.12, -uTime * 0.2)).r - 0.5;
            vec2 off = vn.xy * 0.055 * uStr + vec2(wob) * 0.012 * uStr;
            float ch = 0.3 * uChroma;
            vec3 refr = vec3(texture2D(uRT, suv + off * (1.0 + ch)).r, texture2D(uRT, suv + off).g, texture2D(uRT, suv + off * (1.0 - ch)).b);
            float fres = pow(1.0 - ndv, 3.0);
            vec3 cloak = refr * 0.94 + vec3(0.7, 0.9, 1.0) * fres * 0.25;
            float n = texture2D(uNoise, vec2(vL.x * 2.0 + vL.z * 1.3, vL.y * 0.4)).r * 0.14 - 0.07;
            float d = (vW.y - uY0) - (uCut + n);
            float k = smoothstep(-0.015, 0.015, d);
            vec3 col = mix(cloak, sh, k);
            float hex = step(0.5, fract((vL.y + vL.x) * 22.0)) * step(0.5, fract((vL.y - vL.x) * 22.0));
            float edge = exp(-pow(d * 28.0, 2.0));
            col += uCol * edge * (3.0 + 2.0 * hex) * (0.7 + 0.3 * sin(uTime * 40.0 + vW.x * 30.0));
            col += uCol * exp(-max(-d, 0.0) * 8.0) * (1.0 - k) * hex * 0.5;
            gl_FragColor = vec4(col, 1.0); ${TONE} }`,
      });
      const fig = new THREE.Mesh(geo, cloakMat);
      S.scene.add(fig);
      const samp = surfacePoints(geo, 1600);
      const sparks = S.pool(800, 6);
      const dust = S.pool(300, 3);
      const SPARK = ramp([[0, 0xffffff, 6, 1, 1], [0.3, 0x80f0ff, 4, 1, 1], [1, 0x2080ff, 1.5, 0, 1]]);
      const DUST = ramp([[0, 0xc8b8a0, 1.1, 0, 0], [0.15, 0xb8a890, 1.1, 0.5, 0], [1, 0xa09880, 1, 0, 0]]);
      let str = 1;
      let foot = true;
      const controls: Control[] = [
        ctrlRange('굴절 세기', 0, 2.5, 0.05, 1, (v) => (str = v)),
        ctrlTog('색 갈라짐', true, (v) => (cloakMat.uniforms.uChroma!.value = v ? 1 : 0)),
        ctrlTog('발밑 먼지 (숨은 적 단서)', true, (v) => (foot = v)),
      ];
      let cyc = 0;
      let x = -1.4;
      let dir = 1;
      let walkPh = 0;
      let lastStep = 0;
      const tmp = new THREE.Vector3();
      return {
        scene: S.scene,
        camera: S.cam,
        controls,
        update(t, dt0) {
          const dt = Math.min(dt0, 0.05);
          cyc = (cyc + dt) % 8;
          x += dir * dt * 0.55;
          if (x > 1.5) dir = -1;
          if (x < -1.5) dir = 1;
          walkPh += dt * 7;
          const bob = Math.abs(Math.sin(walkPh)) * 0.035;
          fig.position.set(x, bob, 0);
          const want = dir > 0 ? 0.55 : -0.55;
          fig.rotation.y += (want - fig.rotation.y) * (1 - Math.exp(-dt * 6));
          fig.rotation.z = Math.sin(walkPh) * 0.03;
          fig.updateMatrixWorld();
          let cut: number;
          let state: string;
          if (cyc < 1.5) {
            cut = -0.3;
            state = '보임';
          } else if (cyc < 2.6) {
            cut = lerp(-0.3, 2.0, smooth((cyc - 1.5) / 1.1));
            state = '은신 켜짐 — 발끝부터 전기 경계가 올라감';
          } else if (cyc < 5.6) {
            cut = 2.0;
            state = '은신 중 — 뒤 배경이 일렁이며 비침 · 발밑 먼지만';
          } else if (cyc < 6.7) {
            cut = lerp(2.0, -0.3, smooth((cyc - 5.6) / 1.1));
            state = '은신 풀림 — 위에서부터 드러남';
          } else {
            cut = -0.3;
            state = '보임';
          }
          lab.set(state, '#40e0ff');
          cloakMat.uniforms.uCut!.value = cut;
          cloakMat.uniforms.uY0!.value = bob;
          cloakMat.uniforms.uTime!.value = t;
          cloakMat.uniforms.uStr!.value = str;
          const sweeping = cut > -0.25 && cut < 1.95;
          if (sweeping)
            for (let k = 0; k < 18; k++) {
              const i = Math.floor(Math.random() * 1600);
              const ly = samp[i * 6 + 1]!;
              if (Math.abs(ly - cut) > 0.05) continue;
              tmp.set(samp[i * 6]!, ly, samp[i * 6 + 2]!).applyMatrix4(fig.matrixWorld);
              const d = sphereDir();
              sparks.spawn({ x: tmp.x, y: tmp.y, z: tmp.z, vx: d.x * 1.2, vy: d.y * 1.2 + 0.4, vz: d.z * 1.2, life: R(0.15, 0.35), s0: R(0.015, 0.03), ramp: SPARK, st: 0.05, shape: 2 });
            }
          // 발자국 먼지
          const stepNow = Math.floor(walkPh / Math.PI);
          if (stepNow !== lastStep) {
            lastStep = stepNow;
            if (foot && cut > 0.3) {
              const side = stepNow % 2 ? 0.12 : -0.12;
              const fx = x + Math.cos(fig.rotation.y) * side;
              const fz = -Math.sin(fig.rotation.y) * side;
              for (let k = 0; k < 6; k++) {
                const a = R(0, TAU);
                dust.spawn({ x: fx, y: 0.03, z: fz, vx: Math.cos(a) * 0.4, vy: R(0.05, 0.25), vz: Math.sin(a) * 0.4, life: R(0.7, 1.1), s0: 0.06, s1: 0.28, ramp: DUST, shape: 1, rot: R(-0.4, 0.4), drag: 2.5 });
              }
            }
          }
          sparks.tick(dt);
          dust.tick(dt);
          S.tick(dt);
        },
        render(r, w, h) {
          if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
          (cloakMat.uniforms.uRes!.value as THREE.Vector2).set(w, h);
          fig.visible = false;
          r.setRenderTarget(rt);
          r.clear();
          r.render(S.scene, S.cam);
          r.setRenderTarget(null);
          fig.visible = true;
          r.render(S.scene, S.cam);
        },
        resize: (w, h) => S.resize(w, h),
        dispose: () => {
          S.dispose();
          rt.dispose();
        },
      };
    },
  },

  /* i517 블랙홀 (강착 원반 · 중력 렌즈) */
  i517: {
    kind: '3d',
    caption: '뒤 별빛이 블랙홀 둘레에서 휘어 고리처럼 비치고(중력 렌즈), 안쪽일수록 뜨겁고 빠른 원반 · 위아래로 휘어 보이는 원반 뒤쪽 · 빨려 드는 가스 · 제트',
    make(): Scene3D {
      const S = makeStage({ bg: 0x000000, cam: [0, 1, 9], look: [0, 0, 0], fov: 45 });
      const lab = S.hud.label('tl');
      const space = new THREE.Mesh(
        new THREE.SphereGeometry(60, 48, 24),
        new THREE.ShaderMaterial({
          uniforms: { uNoise: { value: S.noise } },
          vertexShader: /* glsl */ `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
          fragmentShader: /* glsl */ `uniform sampler2D uNoise; varying vec3 vD;
            float h31(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
            void main(){ vec3 d = normalize(vD);
              vec2 uv = vec2(atan(d.z, d.x) / 6.2831853, asin(clamp(d.y, -1.0, 1.0)) / 3.14159 + 0.5);
              float n = texture2D(uNoise, uv * vec2(2.0, 1.0)).r; float n2 = texture2D(uNoise, uv * vec2(4.0, 2.0) + 0.3).g;
              float band = exp(-pow((d.y + 0.25 * sin(uv.x * 6.28)) * 2.4, 2.0));
              vec3 col = vec3(0.0);
              col += mix(vec3(0.015, 0.008, 0.04), vec3(0.06, 0.02, 0.09), n) * smoothstep(0.4, 0.95, n * n2 * 1.8) * (0.3 + band);
              col += vec3(0.03, 0.06, 0.13) * smoothstep(0.55, 0.95, n2) * 0.5;
              col += vec3(0.5, 0.42, 0.35) * band * smoothstep(0.5, 1.0, n) * 0.12;
              for (int k = 0; k < 2; k++) {
                float sc = k == 0 ? 160.0 : 60.0;
                vec3 q = d * sc; vec3 c = floor(q); float h = h31(c + float(k) * 17.0);
                vec3 f = fract(q) - 0.5; float s = step(k == 0 ? 0.965 : 0.992, h) * exp(-dot(f, f) * (k == 0 ? 40.0 : 22.0));
                vec3 tint = mix(vec3(1.0, 0.8, 0.6), vec3(0.7, 0.85, 1.0), fract(h * 13.0));
                col += tint * s * (k == 0 ? 1.4 : 4.0) * (0.4 + fract(h * 37.0));
              }
              gl_FragColor = vec4(col, 1.0); ${TONE} }`,
          side: THREE.BackSide,
          depthWrite: false,
        }),
      );
      space.renderOrder = -10;
      S.scene.add(space);
      const bh = new THREE.Group();
      S.scene.add(bh);
      const RS = 0.75;
      const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
      const lensMat = new THREE.ShaderMaterial({
        uniforms: { uRT: { value: rt.texture }, uRes: { value: new THREE.Vector2(4, 4) }, uC: { value: new THREE.Vector2(0.5, 0.5) }, uRs: { value: 0.1 }, uK: { value: 1 }, uAsp: { value: 1 } },
        vertexShader: FLAT_VS,
        fragmentShader: /* glsl */ `uniform sampler2D uRT; uniform vec2 uRes, uC; uniform float uRs, uK, uAsp; varying vec2 vUv;
          void main(){ vec2 suv = gl_FragCoord.xy / uRes;
            vec2 d = suv - uC; d.x *= uAsp; float r = max(length(d), 1e-5);
            float rs = uRs;
            float rsrc = r - uK * 2.2 * rs * rs / r;
            vec2 dir = d / r;
            vec2 sp = uC + vec2(dir.x / uAsp, dir.y) * rsrc;
            float e = length(vUv - 0.5) * 2.0;
            float blend = 1.0 - smoothstep(0.6, 1.0, e);
            vec2 uv = mix(suv, sp, blend);
            vec3 col = texture2D(uRT, clamp(uv, 0.001, 0.999)).rgb;
            col *= smoothstep(rs * 0.98, rs * 1.03, r);
            col += vec3(1.0, 0.72, 0.42) * exp(-pow((r - rs * 1.07) / (rs * 0.035), 2.0)) * 2.5;
            gl_FragColor = vec4(col, 1.0); ${TONE} gl_FragColor.a = 1.0; }`,
        depthWrite: false,
        transparent: true,
      });
      const lens = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), lensMat);
      lens.scale.setScalar(RS * 9);
      lens.renderOrder = 1;
      bh.add(lens);
      const shadowM = new THREE.Mesh(new THREE.CircleGeometry(RS * 0.98, 48), new THREE.MeshBasicMaterial({ color: 0x000000, colorWrite: false }));
      shadowM.renderOrder = 2;
      bh.add(shadowM);
      const tiltG = new THREE.Group();
      bh.add(tiltG);
      const diskMat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uNoise: { value: S.noise }, uIn: { value: RS * 1.6 }, uOut: { value: RS * 4.8 } },
        vertexShader: /* glsl */ `varying vec2 vP; varying vec3 vW; varying vec3 vT; void main(){ vP = position.xy; vT = normalize(mat3(modelMatrix) * normalize(vec3(-position.y, position.x, 0.0))); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: /* glsl */ `uniform sampler2D uNoise; uniform float uTime, uIn, uOut; varying vec2 vP; varying vec3 vW; varying vec3 vT;
          void main(){ float r = length(vP); float a = atan(vP.y, vP.x);
            float x = (r - uIn) / (uOut - uIn);
            float w = 1.4 / pow(r, 1.5);
            float ar = a + uTime * w;
            float n = texture2D(uNoise, vec2(ar / 6.2831853 * 4.0, r * 0.55)).r;
            float n2 = texture2D(uNoise, vec2(ar / 6.2831853 * 9.0, r * 1.6 + 0.3)).g;
            float streak = 0.45 + 0.9 * n * n2;
            vec3 hot = vec3(1.0, 0.95, 0.88) * 6.0; vec3 mid = vec3(1.0, 0.62, 0.25) * 2.6; vec3 cold = vec3(0.7, 0.18, 0.05) * 0.9;
            vec3 col = mix(hot, mid, smoothstep(0.0, 0.3, x)); col = mix(col, cold, smoothstep(0.3, 1.0, x));
            vec3 tw = normalize(vT);
            float beam = 1.0 + 0.8 * dot(tw, normalize(cameraPosition - vW));
            float alpha = smoothstep(0.0, 0.06, x) * (1.0 - smoothstep(0.7, 1.0, x)) * streak;
            gl_FragColor = vec4(col * beam * streak, 1.0); ${TONE}
            gl_FragColor.a = clamp(alpha, 0.0, 1.0); }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const disk = new THREE.Mesh(new THREE.RingGeometry(RS * 1.6, RS * 4.8, 160, 8), diskMat);
      disk.rotation.x = -Math.PI / 2;
      disk.renderOrder = 3;
      tiltG.add(disk);
      // 원반 뒤쪽이 휘어 위아래로 보이는 고리 (카메라를 보는 판)
      const haloMat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uNoise: { value: S.noise }, uIn: { value: RS * 1.12 }, uOut: { value: RS * 1.9 }, uTilt: { value: 0.18 } },
        vertexShader: /* glsl */ `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `uniform sampler2D uNoise; uniform float uTime, uIn, uOut, uTilt; varying vec2 vP;
          void main(){ float r = length(vP); float a = atan(vP.y, vP.x);
            float x = (r - uIn) / (uOut - uIn);
            float top = pow(abs(sin(a)), 0.6) * (vP.y > 0.0 ? 1.0 : 0.55 + uTilt);
            float n = texture2D(uNoise, vec2(a / 6.2831853 * 5.0 - uTime * 0.25, r * 0.9)).r;
            vec3 col = mix(vec3(1.0, 0.9, 0.75) * 4.0, vec3(1.0, 0.5, 0.18) * 1.6, smoothstep(0.0, 0.8, x));
            float alpha = smoothstep(0.0, 0.12, x) * (1.0 - smoothstep(0.45, 1.0, x)) * top * (0.6 + 1.0 * n) * 1.5;
            gl_FragColor = vec4(col, 1.0); ${TONE} gl_FragColor.a = clamp(alpha, 0.0, 1.0); }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const halo = new THREE.Mesh(new THREE.RingGeometry(RS * 1.12, RS * 1.9, 128, 4), haloMat);
      halo.renderOrder = 2;
      bh.add(halo);
      // 제트
      const jetMat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uNoise: { value: S.noise }, uA: { value: 1 } },
        vertexShader: /* glsl */ `varying vec2 vUv; varying float vF; void main(){ vUv = uv; vec3 n = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vF = abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: /* glsl */ `uniform sampler2D uNoise; uniform float uTime, uA; varying vec2 vUv; varying float vF;
          void main(){ float n = texture2D(uNoise, vec2(vUv.x * 3.0, vUv.y * 2.0 - uTime * 1.5)).r;
            float a = pow(vF, 1.5) * (0.4 + 0.9 * n) * (1.0 - smoothstep(0.3, 1.0, vUv.y)) * smoothstep(0.0, 0.05, vUv.y) * uA;
            gl_FragColor = vec4(vec3(0.55, 0.75, 1.0) * 1.6, 1.0); ${TONE} gl_FragColor.a = clamp(a * 0.6, 0.0, 1.0); }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const jetGeo = new THREE.CylinderGeometry(0.22, 0.04, 4.5, 24, 1, true).translate(0, 2.25, 0);
      const jUp = new THREE.Mesh(jetGeo, jetMat);
      const jDn = new THREE.Mesh(jetGeo, jetMat);
      jDn.rotation.x = Math.PI;
      jUp.renderOrder = jDn.renderOrder = 4;
      tiltG.add(jUp, jDn);
      const gas = S.pool(1600, 5);
      bh.add(gas.mesh);
      const GAS = flat(0xffa050, 2.2, 0.7);
      const GASH = flat(0xffe0b0, 4, 0.9);
      const JETP = ramp([[0, 0xd8ecff, 4, 1, 1], [1, 0x4a80ff, 1, 0, 1]]);
      const jetP = S.pool(400, 6);
      bh.add(jetP.mesh);
      const NG = 520;
      const G = Array.from({ length: NG }, () => ({ r: R(1.7, 6) * RS, a: R(0, TAU), h: R(-0.04, 0.04) }));
      let K = 1;
      let tilt = 0.17;
      let jets = true;
      const controls: Control[] = [
        ctrlRange('렌즈 세기', 0, 2, 0.05, 1, (v) => (K = v)),
        ctrlRange('원반 기울기', 0.02, 0.6, 0.01, 0.17, (v) => (tilt = v)),
        ctrlTog('제트', true, (v) => (jets = v)),
      ];
      const P0 = new THREE.Vector3();
      const ndc = new THREE.Vector3();
      const up = new THREE.Vector3();
      let W = 4;
      let Hh = 4;
      return {
        scene: S.scene,
        camera: S.cam,
        controls,
        update(t, dt0) {
          const dt = Math.min(dt0, 0.05);
          const ang = t * 0.06;
          S.base.set(Math.sin(ang) * 9, 0.9 + Math.sin(t * 0.11) * 0.5, Math.cos(ang) * 9);
          S.tick(dt);
          S.cam.updateMatrixWorld();
          tiltG.rotation.set(0, 0, 0);
          tiltG.lookAt(S.cam.position);
          tiltG.rotateX(tilt);
          lens.lookAt(S.cam.position);
          shadowM.lookAt(S.cam.position);
          halo.lookAt(S.cam.position);
          diskMat.uniforms.uTime!.value = t;
          haloMat.uniforms.uTime!.value = t;
          haloMat.uniforms.uTilt!.value = tilt;
          jetMat.uniforms.uTime!.value = t;
          jUp.visible = jDn.visible = jets;
          // 렌즈 중심 · 크기 (화면 좌표)
          ndc.copy(P0).project(S.cam);
          (lensMat.uniforms.uC!.value as THREE.Vector2).set(ndc.x * 0.5 + 0.5, ndc.y * 0.5 + 0.5);
          const dist = S.cam.position.length();
          lensMat.uniforms.uRs!.value = RS / (2 * dist * Math.tan(THREE.MathUtils.degToRad(S.cam.fov / 2)));
          lensMat.uniforms.uK!.value = K;
          lensMat.uniforms.uAsp!.value = W / Hh;
          // 빨려 드는 가스
          gas.clear();
          tiltG.updateMatrixWorld();
          const m = tiltG.matrixWorld;
          for (const g of G) {
            const w = 1.4 / Math.pow(g.r / RS, 1.5) / RS;
            g.a += w * dt * 1.6;
            g.r -= dt * (0.12 + 0.5 / (g.r / RS)) * RS * 0.5;
            if (g.r < RS * 1.25) {
              g.r = R(4.5, 6.5) * RS;
              g.a = R(0, TAU);
            }
            const x = Math.cos(g.a) * g.r;
            const z = -Math.sin(g.a) * g.r;
            up.set(x, g.h, z).applyMatrix4(m);
            const tx = -Math.sin(g.a);
            const tz = -Math.cos(g.a);
            const vx = tx * g.r * w * 0.15;
            const vz = tz * g.r * w * 0.15;
            const vv = new THREE.Vector3(vx, 0, vz).transformDirection(m).multiplyScalar(Math.hypot(vx, vz));
            const hot = g.r < RS * 2.4;
            gas.spawn({ x: up.x, y: up.y, z: up.z, vx: vv.x, vy: vv.y, vz: vv.z, life: 1, s0: hot ? 0.05 : 0.07, ramp: hot ? GASH : GAS, br: hot ? 1 : 0.6, st: 1, shape: 0 });
          }
          gas.upload();
          if (jets && Math.random() < dt * 30) {
            const s = Math.random() < 0.5 ? 1 : -1;
            const nrm = new THREE.Vector3(0, s, 0).transformDirection(m);
            const sp = R(5, 8);
            jetP.spawn({ x: nrm.x * 0.3, y: nrm.y * 0.3, z: nrm.z * 0.3, vx: nrm.x * sp, vy: nrm.y * sp, vz: nrm.z * sp, life: R(0.5, 0.9), s0: 0.06, ramp: JETP, st: 0.05, shape: 2 });
          }
          jetP.tick(dt);
          lab.set('중력 렌즈 — 뒤 별빛이 휘어 고리처럼 · 강착 원반은 안쪽일수록 뜨겁고 빠름', '#ffb060');
        },
        render(r, w, h) {
          W = w;
          Hh = h;
          if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
          (lensMat.uniforms.uRes!.value as THREE.Vector2).set(w, h);
          lensMat.uniforms.uAsp!.value = w / h;
          bh.visible = false;
          r.setRenderTarget(rt);
          r.clear();
          r.render(S.scene, S.cam);
          r.setRenderTarget(null);
          bh.visible = true;
          r.render(S.scene, S.cam);
        },
        resize: (w, h) => S.resize(w, h),
        dispose: () => {
          S.dispose();
          rt.dispose();
        },
      };
    },
  },
};

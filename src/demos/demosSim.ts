import * as THREE from 'three';
import Matter from 'matter-js';
import { Box, Circle, RevoluteJoint, World, type Body as PBody } from 'planck';
import '@/game/games/numbaseball/ballfx.css';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Drag, Overlay, type Tag } from './lib/mech';
import type { DemoMap, Scene3D } from './types';

/**
 * 견본 — 시뮬레이션 · 물리 · 입자/연출 (그룹 Sim)
 *  u34 ~ u39 · u48 ~ u51 (쓰는 중) · i22 ~ i24 · i46 ~ i55 (아이디어)
 * 시뮬레이션은 가볍게 — 대부분 CPU 2D 캔버스, 3D 는 공유 renderer 로.
 */

const FONT = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
const FONT_CSS = FONT.replace(/"/g, "'");
const TITLE = '"Black Han Sans", "Dela Gothic One", Pretendard, system-ui, sans-serif';
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const ease = (k: number): number => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
const easeOut = (k: number): number => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
/** 고정 씨앗 난수 */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/* ───────────── 2D 도구 ───────────── */

function bg(g: CanvasRenderingContext2D, w: number, h: number, top: string, bot: string): void {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, top);
  gr.addColorStop(1, bot);
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
}
function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color = '#fff', align: CanvasTextAlign = 'left', font = FONT, weight = '700'): void {
  g.font = `${weight} ${size}px ${font}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(s, x, y);
}
/** 글씨 딱지 (둥근 판 + 글씨) */
function pill(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, fill: string, color = '#fff', align: CanvasTextAlign = 'left'): void {
  g.font = `800 ${size}px ${FONT}`;
  const tw = g.measureText(s).width;
  const pw = tw + size * 1.1;
  const ph = size * 1.7;
  const x0 = align === 'center' ? x - pw / 2 : align === 'right' ? x - pw : x;
  g.fillStyle = fill;
  g.beginPath();
  g.roundRect(x0, y - ph / 2, pw, ph, ph / 2);
  g.fill();
  text(g, s, x0 + pw / 2, y + size * 0.04, size, color, 'center', FONT, '800');
}
/** 캔버스 포인터 (자세히 보기에서 손으로 만지기) — draw 의 g.canvas 에 한 번 붙인다 */
function pointerOf(): { attach(c: HTMLCanvasElement): void; x: number; y: number; dx: number; dy: number; down: boolean; inside: boolean; dispose(): void } {
  let el: HTMLCanvasElement | null = null;
  const st = {
    x: 0,
    y: 0,
    dx: 0,
    dy: 0,
    down: false,
    inside: false,
    attach(c: HTMLCanvasElement) {
      if (el === c) return;
      st.dispose();
      el = c;
      c.addEventListener('pointermove', move);
      c.addEventListener('pointerdown', dn);
      c.addEventListener('pointerleave', leave);
      window.addEventListener('pointerup', up);
    },
    dispose() {
      if (!el) return;
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerdown', dn);
      el.removeEventListener('pointerleave', leave);
      window.removeEventListener('pointerup', up);
      el = null;
    },
  };
  function pos(e: PointerEvent): void {
    const r = el!.getBoundingClientRect();
    const nx = e.clientX - r.left;
    const ny = e.clientY - r.top;
    if (st.inside) {
      st.dx += nx - st.x;
      st.dy += ny - st.y;
    }
    st.x = nx;
    st.y = ny;
    st.inside = true;
  }
  function move(e: PointerEvent): void {
    pos(e);
  }
  function dn(e: PointerEvent): void {
    pos(e);
    st.down = true;
  }
  function up(): void {
    st.down = false;
  }
  function leave(): void {
    st.inside = false;
  }
  return st;
}

/* ───────────── 3D 도구 ───────────── */

function disposeScene(scene: THREE.Object3D): void {
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mats = (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) as THREE.Material[];
    for (const mt of mats) {
      for (const v of Object.values(mt)) if (v && (v as THREE.Texture).isTexture) (v as THREE.Texture).dispose();
      mt.dispose();
    }
  });
}
/** 둥근 빛 점 그림 */
function dotTexture(soft = 0.45): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(soft, 'rgba(255,255,255,0.8)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** 글씨 스프라이트 (늘 화면을 본다) */
function textSprite(s: string, o: { size?: number; color?: string; stroke?: string; bg?: string; font?: string; h?: number } = {}): THREE.Sprite {
  const size = o.size ?? 64;
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  const font = `${o.font === 'title' ? '400' : '800'} ${size}px ${o.font === 'title' ? TITLE : FONT}`;
  g.font = font;
  const tw = Math.ceil(g.measureText(s).width);
  const pad = Math.round(size * 0.45);
  c.width = tw + pad * 2;
  c.height = Math.round(size * 1.6);
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (o.bg) {
    g.fillStyle = o.bg;
    g.beginPath();
    g.roundRect(2, 2, c.width - 4, c.height - 4, c.height / 2 - 2);
    g.fill();
  }
  if (o.stroke) {
    g.lineWidth = size * 0.16;
    g.lineJoin = 'round';
    g.strokeStyle = o.stroke;
    g.strokeText(s, c.width / 2, c.height / 2 + size * 0.04);
  }
  g.fillStyle = o.color ?? '#fff';
  g.fillText(s, c.width / 2, c.height / 2 + size * 0.04);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  const hh = o.h ?? 0.5;
  sp.scale.set((hh * c.width) / c.height, hh, 1);
  return sp;
}
/** 크기 · 투명도가 점마다 다른 점 재질 */
function pointMaterial(additive = true): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 300 }, uSize: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
      uniform float uScale; uniform float uSize;
      varying vec3 vC; varying float vA;
      void main(){ vC = aColor; vA = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = aSize * uSize * uScale / -mv.z;
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      varying vec3 vC; varying float vA;
      void main(){ float d = length(gl_PointCoord-0.5);
        float a = smoothstep(0.5, 0.05, d) * vA; if (a < 0.01) discard;
        gl_FragColor = vec4(vC * a, a); }`,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}
/** 점 묶음 — 위치 · 색 · 크기 · 투명도 배열 */
class PointPool {
  readonly pos: Float32Array;
  readonly col: Float32Array;
  readonly size: Float32Array;
  readonly alpha: Float32Array;
  readonly geo = new THREE.BufferGeometry();
  readonly mat: THREE.ShaderMaterial;
  readonly obj: THREE.Points;
  constructor(readonly n: number, additive = true) {
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.mat = pointMaterial(additive);
    this.obj = new THREE.Points(this.geo, this.mat);
    this.obj.frustumCulled = false;
  }
  set(i: number, x: number, y: number, z: number, c: THREE.Color, size: number, a: number): void {
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.col[i * 3] = c.r;
    this.col[i * 3 + 1] = c.g;
    this.col[i * 3 + 2] = c.b;
    this.size[i] = size;
    this.alpha[i] = a;
  }
  flush(): void {
    for (const k of ['position', 'aColor', 'aSize', 'aAlpha']) (this.geo.attributes[k] as THREE.BufferAttribute).needsUpdate = true;
  }
  resize(h: number): void {
    this.mat.uniforms['uScale']!.value = h * 0.9;
  }
}
/** 위 하늘 그러데이션 배경 그림 */
function skyTexture(top: string, bot: string): THREE.CanvasTexture {
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
/** 값 잡음 (2D) — 지형 · 행성 무늬 */
function makeNoise(seed: number): (x: number, y: number) => number {
  const r = rng(seed);
  const P = new Uint8Array(512);
  const G = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    P[i] = i;
    G[i] = r();
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const tmp = P[i]!;
    P[i] = P[j]!;
    P[j] = tmp;
  }
  for (let i = 0; i < 256; i++) P[i + 256] = P[i]!;
  const v = (x: number, y: number): number => G[P[(P[x & 255]! + y) & 511]!]!;
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const u = fx * fx * (3 - 2 * fx);
    const w = fy * fy * (3 - 2 * fy);
    const a = lerp(v(xi, yi), v(xi + 1, yi), u);
    const b = lerp(v(xi, yi + 1), v(xi + 1, yi + 1), u);
    return lerp(a, b, w);
  };
}
function fbm(n: (x: number, y: number) => number, x: number, y: number, oct = 5): number {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  for (let o = 0; o < oct; o++) {
    s += amp * n(x * f, y * f);
    f *= 2.03;
    amp *= 0.5;
  }
  return s / (1 - Math.pow(0.5, oct));
}

/* ═════════════ 견본들 ═════════════ */

/* ───────────── i24 직접 만든 3D 강체 물리 (반복 충격량) ─────────────
 * 상자 · 공 강체를 1/120초 고정 걸음으로: 중력 → 접촉 찾기 → 충격량 되풀이(정상 · 마찰) → 위치 적분 → 잠자기.
 * 접촉: 상자 꼭짓점 vs 평면 · 공 vs 평면 · 공 vs 공 · 공 vs 상자(가장 가까운 점) · 상자 vs 상자(SAT 15축 + 면 자르기 / 모서리 둘).
 * 지난 걸음의 충격량을 같은 자리 접촉에 미리 주어(warm start) 쌓은 탑이 떨리지 않는다. */

/** 강체 하나 — 상자(box) 또는 공 */
interface RBody {
  id: number;
  box: boolean;
  /** 상자 반 크기 */
  h: THREE.Vector3;
  /** 공 반지름 */
  r: number;
  p: THREE.Vector3;
  q: THREE.Quaternion;
  v: THREE.Vector3;
  w: THREE.Vector3;
  /** 질량 역수 */
  im: number;
  /** 몸 좌표 관성 역수 (대각) */
  ii: THREE.Vector3;
  /** 몸 축 (세계 방향) */
  ax: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  /** 세계 관성 역수 3×3 (행 우선) */
  iw: Float64Array;
  /** 감싸는 공 반지름 (넓은 단계) */
  rad: number;
  on: boolean;
  sleep: boolean;
  still: number;
  mesh: THREE.Object3D;
}
interface RContact {
  a: RBody | null;
  b: RBody;
  /** 계산에 들어가는 몸 (잠든 몸 · 바닥은 null = 움직이지 않는 것) */
  A: RBody | null;
  B: RBody | null;
  /** a → b 법선 */
  n: THREE.Vector3;
  p: THREE.Vector3;
  ra: THREE.Vector3;
  rb: THREE.Vector3;
  t1: THREE.Vector3;
  t2: THREE.Vector3;
  sep: number;
  mN: number;
  mT1: number;
  mT2: number;
  target: number;
  jn: number;
  jt1: number;
  jt2: number;
  key: string;
  /** b 몸 좌표의 접촉점 (warm start 짝 찾기) */
  lx: number;
  ly: number;
  lz: number;
}
type RCache = { lx: number; ly: number; lz: number; jn: number; fx: number; fy: number; fz: number; used: boolean }[];

const RB_MARGIN = 0.02; // 이만큼 떨어져 있어도 미리 접촉으로 (speculative)
const RB_SLOP = 0.004; // 이만큼 파고든 건 그냥 둔다 (떨림 막기)
const RB_BETA = 0.2; // 파고든 만큼 밀어내는 비율 (Baumgarte)
const _m4 = new THREE.Matrix4();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _va = new THREE.Vector3();
const _T = new THREE.Vector3();
const _L = new THREE.Vector3();
const _bestL = new THREE.Vector3();
const _n = new THREE.Vector3();
const _C = new Float64Array(9);
const _poly: number[] = [];
const _poly2: number[] = [];

function rbMake(id: number, box: boolean, sx: number, sy: number, sz: number, density: number, mesh: THREE.Object3D): RBody {
  const h = new THREE.Vector3(sx / 2, sy / 2, sz / 2);
  const r = sx / 2;
  const m = box ? density * sx * sy * sz : density * (4 / 3) * Math.PI * r * r * r;
  const ii = box
    ? new THREE.Vector3(12 / (m * (sy * sy + sz * sz)), 12 / (m * (sx * sx + sz * sz)), 12 / (m * (sx * sx + sy * sy)))
    : new THREE.Vector3().setScalar(1 / (0.4 * m * r * r));
  const b: RBody = {
    id,
    box,
    h,
    r,
    p: new THREE.Vector3(),
    q: new THREE.Quaternion(),
    v: new THREE.Vector3(),
    w: new THREE.Vector3(),
    im: 1 / m,
    ii,
    ax: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)],
    iw: new Float64Array(9),
    rad: box ? h.length() : r,
    on: false,
    sleep: false,
    still: 0,
    mesh,
  };
  rbFrame(b);
  return b;
}
/** 회전이 바뀐 뒤 — 몸 축 · 세계 관성 역수 (I⁻¹w = R · diag(ii) · Rᵀ) */
function rbFrame(b: RBody): void {
  const e = _m4.makeRotationFromQuaternion(b.q).elements;
  b.ax[0].set(e[0]!, e[1]!, e[2]!);
  b.ax[1].set(e[4]!, e[5]!, e[6]!);
  b.ax[2].set(e[8]!, e[9]!, e[10]!);
  const R = [e[0]!, e[4]!, e[8]!, e[1]!, e[5]!, e[9]!, e[2]!, e[6]!, e[10]!];
  const d = [b.ii.x, b.ii.y, b.ii.z];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) b.iw[i * 3 + j] = R[i * 3]! * d[0]! * R[j * 3]! + R[i * 3 + 1]! * d[1]! * R[j * 3 + 1]! + R[i * 3 + 2]! * d[2]! * R[j * 3 + 2]!;
}
function rbIw(b: RBody, v: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const m = b.iw;
  return out.set(m[0]! * v.x + m[1]! * v.y + m[2]! * v.z, m[3]! * v.x + m[4]! * v.y + m[5]! * v.z, m[6]! * v.x + m[7]! * v.y + m[8]! * v.z);
}
const sgn = (x: number): number => (x >= 0 ? 1 : -1);

/** 다각형(xyz 평평한 배열)을 평면 k·p ≤ o 쪽만 남기기 (Sutherland–Hodgman) */
function clipPoly(inp: number[], out: number[], kx: number, ky: number, kz: number, o: number): void {
  out.length = 0;
  const n = inp.length / 3;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const px = inp[i * 3]!;
    const py = inp[i * 3 + 1]!;
    const pz = inp[i * 3 + 2]!;
    const qx = inp[j * 3]!;
    const qy = inp[j * 3 + 1]!;
    const qz = inp[j * 3 + 2]!;
    const dp = kx * px + ky * py + kz * pz - o;
    const dq = kx * qx + ky * qy + kz * qz - o;
    if (dp <= 0) out.push(px, py, pz);
    if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
      const t = dp / (dp - dq);
      out.push(px + (qx - px) * t, py + (qy - py) * t, pz + (qz - pz) * t);
    }
  }
}

/** 강체 세계 — 바닥 · 벽은 평면 (n·p ≥ d 쪽이 안) */
class RigidWorld {
  bodies: RBody[] = [];
  planes: { n: THREE.Vector3; d: number }[] = [];
  contacts: RContact[] = [];
  private pool: RContact[] = [];
  private cache = new Map<string, RCache>();
  gravity = -9.81;
  e = 0.3;
  mu = 0.5;
  iters = 10;

  wakeAll(): void {
    for (const b of this.bodies) {
      b.sleep = false;
      b.still = 0;
    }
  }
  step(dt: number): void {
    const B = this.bodies;
    // 1) 중력 · 감쇠 (깨어 있는 몸만)
    for (const b of B) {
      if (!b.on || b.sleep) continue;
      rbFrame(b);
      b.v.y += this.gravity * dt;
      b.v.multiplyScalar(1 / (1 + 0.04 * dt));
      b.w.multiplyScalar(1 / (1 + (b.box ? 0.25 : 0.7) * dt));
      const wl = b.w.length();
      if (wl > 60) b.w.multiplyScalar(60 / wl);
    }
    // 2) 접촉 찾기
    this.pool.push(...this.contacts);
    this.contacts.length = 0;
    this.collide();
    // 3) 미리 계산 + 지난 충격량 미리 주기
    const C = this.contacts;
    // (반발 판단은 미리 주기 전 속도로 — 아래 몸에 먼저 준 큰 충격량을 「세게 부딪힘」으로 잘못 읽으면 탑이 튄다)
    for (const c of C) this.prestep(c, dt);
    for (const c of C) this.warm(c);
    // 4) 충격량 되풀이
    for (let it = 0; it < this.iters; it++) for (const c of C) this.solve(c);
    // 5) 다음 걸음을 위해 충격량 기억
    this.cache.clear();
    for (const c of C) {
      let arr = this.cache.get(c.key);
      if (!arr) this.cache.set(c.key, (arr = []));
      arr.push({ used: false, lx: c.lx, ly: c.ly, lz: c.lz, jn: c.jn, fx: c.t1.x * c.jt1 + c.t2.x * c.jt2, fy: c.t1.y * c.jt1 + c.t2.y * c.jt2, fz: c.t1.z * c.jt1 + c.t2.z * c.jt2 });
    }
    // 6) 위치 · 회전 적분 + 잠자기
    for (const b of B) {
      if (!b.on || b.sleep) continue;
      b.p.addScaledVector(b.v, dt);
      const q = b.q;
      const wx = b.w.x * dt * 0.5;
      const wy = b.w.y * dt * 0.5;
      const wz = b.w.z * dt * 0.5;
      const x = q.x;
      const y = q.y;
      const z = q.z;
      const ww = q.w;
      q.set(x + wx * ww + wy * z - wz * y, y + wy * ww + wz * x - wx * z, z + wz * ww + wx * y - wy * x, ww - wx * x - wy * y - wz * z).normalize();
      if (b.v.lengthSq() < 0.012 && b.w.lengthSq() < 0.03) b.still += dt;
      else b.still = 0;
      if (b.still > 0.45) {
        b.sleep = true;
        b.v.set(0, 0, 0);
        b.w.set(0, 0, 0);
      }
    }
  }

  private add(a: RBody | null, b: RBody, n: THREE.Vector3, p: THREE.Vector3, sep: number, key: string): void {
    const c =
      this.pool.pop() ??
      ({ n: new THREE.Vector3(), p: new THREE.Vector3(), ra: new THREE.Vector3(), rb: new THREE.Vector3(), t1: new THREE.Vector3(), t2: new THREE.Vector3() } as RContact);
    c.a = a;
    c.b = b;
    c.n.copy(n);
    c.p.copy(p);
    c.sep = sep;
    c.key = key;
    const d = _va.subVectors(p, b.p);
    c.lx = d.dot(b.ax[0]);
    c.ly = d.dot(b.ax[1]);
    c.lz = d.dot(b.ax[2]);
    this.contacts.push(c);
  }

  private collide(): void {
    const B = this.bodies;
    const M = RB_MARGIN;
    // 몸 vs 평면
    for (const b of B) {
      if (!b.on || b.sleep) continue;
      this.planes.forEach((pl, pi) => {
        const cd = pl.n.dot(b.p) - pl.d;
        if (cd > b.rad + M) return;
        if (!b.box) {
          if (cd - b.r < M) this.add(null, b, pl.n, _v2.copy(b.p).addScaledVector(pl.n, -b.r), cd - b.r, `${b.id}p${pi}`);
          return;
        }
        for (let k = 0; k < 8; k++) {
          _v2.copy(b.p)
            .addScaledVector(b.ax[0], k & 1 ? b.h.x : -b.h.x)
            .addScaledVector(b.ax[1], k & 2 ? b.h.y : -b.h.y)
            .addScaledVector(b.ax[2], k & 4 ? b.h.z : -b.h.z);
          const s = pl.n.dot(_v2) - pl.d;
          if (s < M) this.add(null, b, pl.n, _v2, s, `${b.id}p${pi}`);
        }
      });
    }
    // 몸 vs 몸 (넓은 단계 = 감싸는 공)
    for (let i = 0; i < B.length; i++) {
      const a = B[i]!;
      if (!a.on) continue;
      for (let j = i + 1; j < B.length; j++) {
        const b = B[j]!;
        if (!b.on || (a.sleep && b.sleep)) continue;
        const rr = a.rad + b.rad + M;
        if (a.p.distanceToSquared(b.p) > rr * rr) continue;
        const n0 = this.contacts.length;
        if (a.box && b.box) this.boxBox(a, b);
        else if (a.box) this.boxSphere(a, b);
        else if (b.box) this.boxSphere(b, a);
        else this.sphereSphere(a, b);
        // 잠든 몸에 「잠들 만큼 느리지 않은」 몸이 닿으면 깨운다 — 깨어남이 닿은 몸을 따라 번져서,
        // 밑의 몸이 빠져나갔는데 위의 잠든 몸이 허공에 떠 있는 일이 없게 (섬 단위 잠자기와 같은 효과)
        if (this.contacts.length > n0 && a.sleep !== b.sleep) {
          const aw = a.sleep ? b : a;
          const sl = a.sleep ? a : b;
          if (aw.v.lengthSq() > 0.012 || aw.w.lengthSq() > 0.03) {
            sl.sleep = false;
            sl.still = 0;
          }
        }
      }
    }
  }
  private sphereSphere(a: RBody, b: RBody): void {
    _n.subVectors(b.p, a.p);
    const d = _n.length();
    const sep = d - a.r - b.r;
    if (sep > RB_MARGIN) return;
    if (d < 1e-6) _n.set(0, 1, 0);
    else _n.divideScalar(d);
    this.add(a, b, _n, _v2.copy(a.p).addScaledVector(_n, a.r + sep * 0.5), sep, `${a.id}-${b.id}`);
  }
  /** 상자 a vs 공 b — 공 가운데에서 상자 위 가장 가까운 점 */
  private boxSphere(a: RBody, b: RBody): void {
    _v1.subVectors(b.p, a.p);
    const lx = _v1.dot(a.ax[0]);
    const ly = _v1.dot(a.ax[1]);
    const lz = _v1.dot(a.ax[2]);
    const cx = clamp(lx, -a.h.x, a.h.x);
    const cy = clamp(ly, -a.h.y, a.h.y);
    const cz = clamp(lz, -a.h.z, a.h.z);
    let sep: number;
    if (cx !== lx || cy !== ly || cz !== lz) {
      // 공 가운데가 상자 밖
      _v2.copy(a.p).addScaledVector(a.ax[0], cx).addScaledVector(a.ax[1], cy).addScaledVector(a.ax[2], cz);
      _n.subVectors(b.p, _v2);
      const d = _n.length();
      sep = d - b.r;
      if (sep > RB_MARGIN) return;
      _n.divideScalar(d);
    } else {
      // 가운데가 상자 안 — 가장 가까운 면으로
      const dx = a.h.x - Math.abs(lx);
      const dy = a.h.y - Math.abs(ly);
      const dz = a.h.z - Math.abs(lz);
      if (dx <= dy && dx <= dz) {
        _n.copy(a.ax[0]).multiplyScalar(sgn(lx));
        sep = -dx - b.r;
      } else if (dy <= dz) {
        _n.copy(a.ax[1]).multiplyScalar(sgn(ly));
        sep = -dy - b.r;
      } else {
        _n.copy(a.ax[2]).multiplyScalar(sgn(lz));
        sep = -dz - b.r;
      }
      _v2.copy(b.p).addScaledVector(_n, -b.r);
    }
    this.add(a, b, _n, _v2, sep, `${a.id}-${b.id}`);
  }
  /** 상자 vs 상자 — 분리축 15개(SAT) 중 가장 얕은 축. 면이면 맞은편 면을 잘라 접촉점 여러 개, 모서리면 두 모서리 가장 가까운 점 하나 */
  private boxBox(A: RBody, B: RBody): void {
    const M = RB_MARGIN;
    const T = _T.subVectors(B.p, A.p);
    const a = A.ax;
    const b = B.ax;
    const ha = [A.h.x, A.h.y, A.h.z];
    const hb = [B.h.x, B.h.y, B.h.z];
    const C = _C;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i * 3 + j] = Math.abs(a[i]!.dot(b[j]!)) + 1e-6;
    let best = -Infinity;
    let type = 0;
    let ai = 0;
    for (let i = 0; i < 3; i++) {
      const s = Math.abs(T.dot(a[i]!)) - (ha[i]! + hb[0]! * C[i * 3]! + hb[1]! * C[i * 3 + 1]! + hb[2]! * C[i * 3 + 2]!);
      if (s > M) return;
      if (s > best) {
        best = s;
        type = 0;
        ai = i;
      }
    }
    for (let j = 0; j < 3; j++) {
      const s = Math.abs(T.dot(b[j]!)) - (ha[0]! * C[j]! + ha[1]! * C[3 + j]! + ha[2]! * C[6 + j]! + hb[j]!);
      if (s > M) return;
      if (s > best + 1e-4) {
        best = s;
        type = 1;
        ai = j;
      }
    }
    let eBest = -Infinity;
    let ei = 0;
    let ej = 0;
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        _L.crossVectors(a[i]!, b[j]!);
        const len = _L.length();
        if (len < 1e-3) continue;
        _L.divideScalar(len);
        const s =
          Math.abs(T.dot(_L)) -
          (ha[0]! * Math.abs(a[0]!.dot(_L)) + ha[1]! * Math.abs(a[1]!.dot(_L)) + ha[2]! * Math.abs(a[2]!.dot(_L)) + hb[0]! * Math.abs(b[0]!.dot(_L)) + hb[1]! * Math.abs(b[1]!.dot(_L)) + hb[2]! * Math.abs(b[2]!.dot(_L)));
        if (s > M) return;
        if (s > eBest) {
          eBest = s;
          ei = i;
          ej = j;
          _bestL.copy(_L);
        }
      }
    const key = `${A.id}-${B.id}`;
    if (eBest > best + 0.01) {
      // 모서리 vs 모서리
      const L = _bestL;
      if (L.dot(T) < 0) L.negate();
      const pa = _v1.copy(A.p);
      for (let k = 0; k < 3; k++) if (k !== ei) pa.addScaledVector(a[k]!, ha[k]! * sgn(a[k]!.dot(L)));
      const pb = _v2.copy(B.p);
      for (let k = 0; k < 3; k++) if (k !== ej) pb.addScaledVector(b[k]!, -hb[k]! * sgn(b[k]!.dot(L)));
      const d1 = a[ei]!;
      const d2 = b[ej]!;
      const r = _v3.subVectors(pa, pb);
      const bb = d1.dot(d2);
      const c = d1.dot(r);
      const f = d2.dot(r);
      const den = 1 - bb * bb;
      let s = den > 1e-6 ? (bb * f - c) / den : 0;
      s = clamp(s, -ha[ei]!, ha[ei]!);
      const t = clamp(bb * s + f, -hb[ej]!, hb[ej]!);
      pa.addScaledVector(d1, s);
      pb.addScaledVector(d2, t);
      pa.add(pb).multiplyScalar(0.5);
      this.add(A, B, L, pa, eBest, key);
      return;
    }
    // 면 vs 면 — ref 의 면에 inc 의 가장 맞서는 면을 잘라 얹는다
    const ref = type === 0 ? A : B;
    const inc = type === 0 ? B : A;
    const rh = type === 0 ? ha : hb;
    const ih = type === 0 ? hb : ha;
    // n = ref 에서 inc 쪽으로
    const n = _n.copy(ref.ax[ai]!).multiplyScalar(sgn((type === 0 ? 1 : -1) * T.dot(ref.ax[ai]!)));
    const rc = _v1.copy(ref.p).addScaledVector(n, rh[ai]!);
    // inc 에서 n 과 가장 마주 보는 면
    let k = 0;
    let kd = -1;
    for (let kk = 0; kk < 3; kk++) {
      const d = Math.abs(inc.ax[kk]!.dot(n));
      if (d > kd) {
        kd = d;
        k = kk;
      }
    }
    const fc = _v2.copy(inc.p).addScaledVector(inc.ax[k]!, -sgn(inc.ax[k]!.dot(n)) * ih[k]!);
    const e1 = inc.ax[(k + 1) % 3]!;
    const e2 = inc.ax[(k + 2) % 3]!;
    const h1 = ih[(k + 1) % 3]!;
    const h2 = ih[(k + 2) % 3]!;
    const P = _poly;
    P.length = 0;
    for (const [s1, s2] of [
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
    ] as const)
      P.push(fc.x + e1.x * h1 * s1 + e2.x * h2 * s2, fc.y + e1.y * h1 * s1 + e2.y * h2 * s2, fc.z + e1.z * h1 * s1 + e2.z * h2 * s2);
    // ref 면의 네 옆 평면으로 자르기
    const u = ref.ax[(ai + 1) % 3]!;
    const w = ref.ax[(ai + 2) % 3]!;
    const hu = rh[(ai + 1) % 3]!;
    const hw = rh[(ai + 2) % 3]!;
    const uc = u.dot(rc);
    const wc = w.dot(rc);
    clipPoly(P, _poly2, u.x, u.y, u.z, uc + hu);
    clipPoly(_poly2, P, -u.x, -u.y, -u.z, -uc + hu);
    clipPoly(P, _poly2, w.x, w.y, w.z, wc + hw);
    clipPoly(_poly2, P, -w.x, -w.y, -w.z, -wc + hw);
    const cn = _v3.copy(n);
    if (type === 1) cn.negate(); // 접촉 법선은 늘 A → B
    for (let i = 0; i < P.length; i += 3) {
      const px = P[i]!;
      const py = P[i + 1]!;
      const pz = P[i + 2]!;
      const s = n.x * (px - rc.x) + n.y * (py - rc.y) + n.z * (pz - rc.z);
      if (s > M) continue;
      // 자른 다각형에 거의 같은 점이 둘 생길 수 있다 — 하나만
      let dup = false;
      for (let j = 0; j < i; j += 3) if (Math.abs(P[j]! - px) + Math.abs(P[j + 1]! - py) + Math.abs(P[j + 2]! - pz) < 0.004) dup = true;
      if (dup) continue;
      _L.set(px - n.x * s * 0.5, py - n.y * s * 0.5, pz - n.z * s * 0.5);
      this.add(A, B, cn, _L, s, key);
    }
  }

  private prestep(c: RContact, dt: number): void {
    const a = c.a;
    const b = c.b;
    c.A = a && a.on && !a.sleep ? a : null;
    c.B = b.on && !b.sleep ? b : null;
    if (a) c.ra.subVectors(c.p, a.p);
    else c.ra.set(0, 0, 0);
    c.rb.subVectors(c.p, b.p);
    const n = c.n;
    // 접선 둘 (법선에 수직)
    if (Math.abs(n.x) > 0.57) c.t1.set(n.y, -n.x, 0).normalize();
    else c.t1.set(0, n.z, -n.y).normalize();
    c.t2.crossVectors(n, c.t1);
    c.mN = 1 / Math.max(1e-9, this.k(c, n));
    c.mT1 = 1 / Math.max(1e-9, this.k(c, c.t1));
    c.mT2 = 1 / Math.max(1e-9, this.k(c, c.t2));
    const vn = this.relVel(c, _v1).dot(n);
    // 목표 vn: 떨어져 있으면 그만큼만 다가오게(speculative) · 파고들었으면 조금씩 밀어내기 · 세게 닿으면 튀기(반발)
    let target = c.sep > 0 ? -c.sep / dt : (RB_BETA / dt) * Math.max(0, -c.sep - RB_SLOP);
    if (vn < -0.8 && c.sep < -vn * dt) target = Math.max(target, -this.e * vn);
    c.target = target;
  }
  private warm(c: RContact): void {
    const n = c.n;
    // warm start — 지난 걸음 같은 자리(b 몸 좌표 6cm 안) 접촉의 충격량
    c.jn = c.jt1 = c.jt2 = 0;
    const old = this.cache.get(c.key);
    if (old) {
      let bd = 0.0036;
      let o: RCache[number] | null = null;
      for (const x of old) {
        if (x.used) continue; // 한 번만 — 두 접촉이 같은 옛 충격량을 나눠 받으면 걸음마다 불어나 탑이 튄다
        const d = (x.lx - c.lx) ** 2 + (x.ly - c.ly) ** 2 + (x.lz - c.lz) ** 2;
        if (d < bd) {
          bd = d;
          o = x;
        }
      }
      if (o) {
        o.used = true;
        c.jn = o.jn;
        c.jt1 = o.fx * c.t1.x + o.fy * c.t1.y + o.fz * c.t1.z;
        c.jt2 = o.fx * c.t2.x + o.fy * c.t2.y + o.fz * c.t2.z;
        _v2.copy(n).multiplyScalar(c.jn).addScaledVector(c.t1, c.jt1).addScaledVector(c.t2, c.jt2);
        this.apply(c, _v2);
      }
    }
  }
  /** 방향 d 로의 유효 질량 역수 = 1/mA + 1/mB + d·((I⁻¹(r×d))×r) */
  private k(c: RContact, d: THREE.Vector3): number {
    let k = 0;
    if (c.A) {
      k += c.A.im;
      rbIw(c.A, _v2.crossVectors(c.ra, d), _v3);
      k += _v2.crossVectors(_v3, c.ra).dot(d);
    }
    if (c.B) {
      k += c.B.im;
      rbIw(c.B, _v2.crossVectors(c.rb, d), _v3);
      k += _v2.crossVectors(_v3, c.rb).dot(d);
    }
    return k;
  }
  /** 접촉점의 상대 속도 (b − a) */
  private relVel(c: RContact, out: THREE.Vector3): THREE.Vector3 {
    out.set(0, 0, 0);
    if (c.B) out.copy(c.B.v).add(_v3.crossVectors(c.B.w, c.rb));
    if (c.A) out.sub(c.A.v).sub(_v3.crossVectors(c.A.w, c.ra));
    return out;
  }
  /** 충격량 P 를 a 에 −, b 에 + */
  private apply(c: RContact, P: THREE.Vector3): void {
    if (c.A) {
      c.A.v.addScaledVector(P, -c.A.im);
      c.A.w.sub(rbIw(c.A, _v3.crossVectors(c.ra, P), _T));
    }
    if (c.B) {
      c.B.v.addScaledVector(P, c.B.im);
      c.B.w.add(rbIw(c.B, _v3.crossVectors(c.rb, P), _T));
    }
  }
  private solve(c: RContact): void {
    if (!c.A && !c.B) return;
    const dv = this.relVel(c, _v1);
    // 마찰 (쿨롱: |마찰| ≤ μ · 수직 충격량)
    const maxF = this.mu * c.jn;
    let vt = dv.dot(c.t1);
    let nj = clamp(c.jt1 - vt * c.mT1, -maxF, maxF);
    let d = nj - c.jt1;
    c.jt1 = nj;
    if (d) this.apply(c, _v2.copy(c.t1).multiplyScalar(d));
    vt = this.relVel(c, _v1).dot(c.t2);
    nj = clamp(c.jt2 - vt * c.mT2, -maxF, maxF);
    d = nj - c.jt2;
    c.jt2 = nj;
    if (d) this.apply(c, _v2.copy(c.t2).multiplyScalar(d));
    // 수직 (밀기만, 당기지 않음: 누적 ≥ 0)
    const vn = this.relVel(c, _v1).dot(c.n);
    nj = Math.max(0, c.jn + (c.target - vn) * c.mN);
    d = nj - c.jn;
    c.jn = nj;
    if (d) this.apply(c, _v2.copy(c.n).multiplyScalar(d));
  }
}

/** 주사위 한 면 (상아색 바탕 · 오목한 눈 점, 1 은 빨강) */
function dieFaceTex(n: number): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const bgG = g.createRadialGradient(S / 2, S / 2, S * 0.2, S / 2, S / 2, S * 0.75);
  bgG.addColorStop(0, '#fbf8f1');
  bgG.addColorStop(1, '#ece5d6');
  g.fillStyle = bgG;
  g.fillRect(0, 0, S, S);
  const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const rr = n === 1 ? S * 0.12 : S * 0.085;
  for (const k of PIPS[n]!) {
    const x = S * (0.24 + (k % 3) * 0.26);
    const y = S * (0.24 + Math.floor(k / 3) * 0.26);
    const pg = g.createRadialGradient(x - rr * 0.25, y - rr * 0.3, rr * 0.1, x, y, rr);
    pg.addColorStop(0, n === 1 ? '#8e1c1c' : '#0d1018');
    pg.addColorStop(0.75, n === 1 ? '#d43a34' : '#2a2f3c');
    pg.addColorStop(1, n === 1 ? '#f08a80' : '#8a8f9a');
    g.fillStyle = pg;
    g.beginPath();
    g.arc(x, y, rr, 0, TAU);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/** 나뭇결 (결 줄 + 옹이 조금) */
function woodTex(seed: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d9b07a';
  g.fillRect(0, 0, 256, 64);
  const r = rng(seed);
  for (let i = 0; i < 46; i++) {
    const y = r() * 64;
    g.strokeStyle = `rgba(${120 + r() * 40},${70 + r() * 30},${30 + r() * 20},${0.12 + r() * 0.22})`;
    g.lineWidth = 0.6 + r() * 1.8;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 2.2 + (r() - 0.5) * 0.8);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
/** 공 무늬 (가운데 띠 · 극 동그라미 — 굴러가는 게 보이게) */
function ballTex(base: string, band: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 64);
  g.fillStyle = band;
  g.fillRect(0, 27, 128, 10);
  for (let k = 0; k < 4; k++) g.fillRect(k * 32 + 14, 0, 4, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** 주사위 면 순서 (BoxGeometry 묶음 +x −x +y −y +z −z) — 마주 보는 면 합 7 */
const DIE_FACE = [3, 4, 1, 6, 2, 5];
/** 위를 보는 면의 눈 */
function dieTop(b: RBody): number {
  let j = 0;
  let best = -1;
  for (let k = 0; k < 3; k++) {
    const y = Math.abs(b.ax[k]!.y);
    if (y > best) {
      best = y;
      j = k;
    }
  }
  return DIE_FACE[j * 2 + (b.ax[j]!.y > 0 ? 0 : 1)]!;
}

/** i24 — 직접 만든 3D 강체 물리 견본: 상자 쟁반 속 주사위 굴리기 · 나무 탑 무너뜨리기 */
function makeRigidDemo(): Scene3D {
  const scene = new THREE.Scene();
  const bgTex = skyTexture('#e6edf5', '#b4c1d0');
  scene.background = bgTex;
  scene.add(new THREE.HemisphereLight(0xf4f8ff, 0x6a7380, 0.95));
  const key = new THREE.DirectionalLight(0xfff3e2, 2.4);
  key.position.set(-3.5, 9, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera;
  sc.left = sc.bottom = -6.5;
  sc.right = sc.top = 6.5;
  sc.near = 1;
  sc.far = 25;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  const fill = new THREE.DirectionalLight(0xdfe9ff, 0.55);
  fill.position.set(5, 4, -3);
  scene.add(key, fill);
  const cam = new THREE.PerspectiveCamera(36, 1.6, 0.1, 80);

  /* 무대: 펠트 깐 나무 쟁반 + 투명 벽 */
  const W = 4;
  const D = 2.5;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd3dae3, roughness: 0.95 }));
  ground.position.y = -0.32;
  ground.receiveShadow = true;
  const rimTex = woodTex(7);
  rimTex.repeat.set(2, 1);
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xb98552, map: rimTex, roughness: 0.55 });
  const base = new THREE.Mesh(new RoundedBoxGeometry(2 * W + 0.8, 0.32, 2 * D + 0.8, 2, 0.08), new THREE.MeshStandardMaterial({ color: 0x7a5232, roughness: 0.6 }));
  base.position.y = -0.16;
  const felt = new THREE.Mesh(new THREE.PlaneGeometry(2 * W, 2 * D).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2e6a70, roughness: 1 }));
  felt.position.y = 0.002;
  felt.receiveShadow = base.receiveShadow = true;
  scene.add(ground, base, felt);
  const rimX = new RoundedBoxGeometry(0.3, 0.44, 2 * D + 0.6, 2, 0.06);
  const rimZ = new RoundedBoxGeometry(2 * W, 0.44, 0.3, 2, 0.06);
  for (const s of [-1, 1]) {
    const a = new THREE.Mesh(rimX, rimMat);
    a.position.set(s * (W + 0.15), 0.22, 0);
    const b = new THREE.Mesh(rimZ, rimMat);
    b.position.set(0, 0.22, s * (D + 0.15));
    a.castShadow = a.receiveShadow = b.castShadow = b.receiveShadow = true;
    scene.add(a, b);
  }
  // 투명 벽 (물리 벽은 끝없이 높은 평면 — 보이는 높이까지만 유리로)
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, roughness: 0.1, depthWrite: false, side: THREE.DoubleSide });
  const GH = 1.9;
  for (const s of [-1, 1]) {
    const gx = new THREE.Mesh(new THREE.PlaneGeometry(2 * D, GH).rotateY(Math.PI / 2), glassMat);
    gx.position.set(s * W, 0.44 + GH / 2, 0);
    const gz = new THREE.Mesh(new THREE.PlaneGeometry(2 * W, GH), glassMat);
    gz.position.set(0, 0.44 + GH / 2, s * D);
    scene.add(gx, gz);
  }
  {
    const y0 = 0.44;
    const y1 = 0.44 + GH;
    const P: number[] = [];
    const cs = [
      [-W, -D],
      [W, -D],
      [W, D],
      [-W, D],
    ];
    for (let i = 0; i < 4; i++) {
      const [x, z] = cs[i]!;
      const [x2, z2] = cs[(i + 1) % 4]!;
      P.push(x!, y1, z!, x2!, y1, z2!, x!, y0, z!, x!, y1, z!);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    scene.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 })));
  }

  /* 물리 세계 */
  const world = new RigidWorld();
  world.planes.push(
    { n: new THREE.Vector3(0, 1, 0), d: 0 },
    { n: new THREE.Vector3(1, 0, 0), d: -W },
    { n: new THREE.Vector3(-1, 0, 0), d: -W },
    { n: new THREE.Vector3(0, 0, 1), d: -D },
    { n: new THREE.Vector3(0, 0, -1), d: -D },
  );
  let nid = 0;
  const addBody = (box: boolean, sx: number, sy: number, sz: number, density: number, mesh: THREE.Mesh): RBody => {
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.visible = false;
    scene.add(mesh);
    const b = rbMake(nid++, box, sx, sy, sz, density, mesh);
    world.bodies.push(b);
    return b;
  };
  const DS = 0.5;
  const dieGeo = new RoundedBoxGeometry(DS, DS, DS, 3, 0.07);
  const dieMats = DIE_FACE.map((n) => new THREE.MeshStandardMaterial({ map: dieFaceTex(n), roughness: 0.32 }));
  const dice = [0, 1, 2].map(() => addBody(true, DS, DS, DS, 1, new THREE.Mesh(dieGeo, dieMats)));
  const sphere = (r: number): THREE.SphereGeometry => new THREE.SphereGeometry(r, 32, 20);
  const ballMat = (a: string, b: string): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ map: ballTex(a, b), roughness: 0.35 });
  const smalls = [
    ['#ffcf3a', '#ffffff'],
    ['#3a9cff', '#ffffff'],
  ].map(([a, b]) => addBody(false, 0.36, 0, 0, 0.8, new THREE.Mesh(sphere(0.18), ballMat(a!, b!))));
  const PL = [1.5, 0.3, 0.48] as const;
  const plankGeo = new RoundedBoxGeometry(PL[0], PL[1], PL[2], 2, 0.035);
  const plankTex = woodTex(3);
  const plankMats = [0xffffff, 0xf3e2c8, 0xe9d2ae, 0xfff0d8].map((c) => new THREE.MeshStandardMaterial({ color: c, map: plankTex, roughness: 0.6 }));
  const LAYERS = 8;
  const planks: RBody[] = [];
  for (let i = 0; i < LAYERS * 3; i++) planks.push(addBody(true, PL[0], PL[1], PL[2], 0.6, new THREE.Mesh(plankGeo, plankMats[(i * 7) % 4]!)));
  const bigBall = addBody(false, 0.76, 0, 0, 7, new THREE.Mesh(sphere(0.38), ballMat('#e8423a', '#ffffff')));
  const pokes = [
    ['#ff8a3a', '#ffe9c8'],
    ['#5ad07a', '#ffffff'],
    ['#a06cff', '#ffffff'],
  ].map(([a, b]) => addBody(false, 0.44, 0, 0, 1.2, new THREE.Mesh(sphere(0.22), ballMat(a!, b!))));
  let pokeNext = 0;

  /* 접촉점 보기 — 빨간 점 + 법선 */
  const MAXC = 600;
  const dotMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a2a, depthTest: false, toneMapped: false }), MAXC);
  dotMesh.renderOrder = 10;
  dotMesh.frustumCulled = false;
  const nPos = new Float32Array(MAXC * 6);
  const nGeo = new THREE.BufferGeometry();
  nGeo.setAttribute('position', new THREE.BufferAttribute(nPos, 3));
  const nLines = new THREE.LineSegments(nGeo, new THREE.LineBasicMaterial({ color: 0xffe14a, depthTest: false, toneMapped: false }));
  nLines.renderOrder = 11;
  nLines.frustumCulled = false;
  dotMesh.visible = nLines.visible = false;
  scene.add(dotMesh, nLines);
  let showContacts = false;

  /* 장면 고르기 */
  type Mode = 'dice' | 'tower';
  let mode: Mode = 'dice';
  let modeT = 0;
  let launched = false;
  let manualUntil = -1;
  const HOLD = new THREE.Vector3(-3.3, 0.95, 0.1);
  const off = (): void => {
    for (const b of world.bodies) {
      b.on = false;
      b.mesh.visible = false;
    }
  };
  const put = (b: RBody, x: number, y: number, z: number, q?: THREE.Quaternion): void => {
    b.on = true;
    b.sleep = false;
    b.still = 0;
    b.p.set(x, y, z);
    if (q) b.q.copy(q);
    else b.q.identity();
    b.v.set(0, 0, 0);
    b.w.set(0, 0, 0);
    rbFrame(b);
    b.mesh.visible = true;
  };
  const rq = new THREE.Quaternion();
  const re = new THREE.Euler();
  const setMode = (m: Mode): void => {
    off();
    mode = m;
    modeT = 0;
    launched = false;
    const R = Math.random;
    if (m === 'dice') {
      dice.forEach((b, i) => {
        re.set(R() * TAU, R() * TAU, R() * TAU);
        put(b, -3.1 + R() * 0.3, 1.2 + i * 0.6, -1 + i * 1 + (R() - 0.5) * 0.3, rq.setFromEuler(re));
        b.v.set(5 + R() * 2.5, 0.6 + R() * 1.2, (R() - 0.5) * 2.4);
        b.w.set((R() - 0.5) * 24, (R() - 0.5) * 24, (R() - 0.5) * 24);
      });
      smalls.forEach((b, i) => {
        put(b, 0.6 + i * 1.2, 2.2 + i * 0.4, (i ? 1 : -1) * 0.9);
        b.v.set(-1 + R() * 2, 0, (R() - 0.5) * 2);
      });
    } else {
      const cx = 1.7;
      const g = 0.0015; // 층 사이 작은 틈 — 처음부터 겹치지 않게
      const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
      for (let L = 0; L < LAYERS; L++)
        for (let k = 0; k < 3; k++) {
          const b = planks[L * 3 + k]!;
          const o = (k - 1) * 0.5;
          const y = PL[1] / 2 + L * (PL[1] + g) + g;
          if (L % 2 === 0) put(b, cx, y, o);
          else put(b, cx + o, y, 0, yaw);
        }
      bigBall.on = false;
      bigBall.p.copy(HOLD);
      bigBall.q.identity();
      bigBall.mesh.visible = true;
    }
  };
  setMode('dice');

  /* 크게 보기: 누르면 물체를 튕기고, 빈 곳이면 공을 떨어뜨린다 */
  const drag = new Drag();
  const ray = new THREE.Raycaster();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitP = new THREE.Vector3();
  const poke = (x: number, y: number): void => {
    ray.setFromCamera(new THREE.Vector2(x, y), cam);
    const live = world.bodies.filter((b) => b.on);
    const hit = ray.intersectObjects(
      live.map((b) => b.mesh),
      false,
    )[0];
    if (hit) {
      const b = live.find((x) => x.mesh === hit.object)!;
      b.sleep = false;
      b.still = 0;
      b.v.add(new THREE.Vector3((Math.random() - 0.5) * 2, 4.5, (Math.random() - 0.5) * 2));
      b.w.add(new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14));
      return;
    }
    if (!ray.ray.intersectPlane(floorPlane, hitP)) return;
    const b = pokes[pokeNext++ % pokes.length]!;
    put(b, clamp(hitP.x, -W + 0.3, W - 0.3), 2.6, clamp(hitP.z, -D + 0.3, D - 0.3));
  };

  const overlay = new Overlay();
  let tags: Tag[] = [];
  const H = 1 / 120;
  let acc = 0;
  let last = -1;
  let stepsLast = 0;
  let bigView = false;
  const proj = new THREE.Vector3();
  return {
    scene,
    camera: cam,
    update(t) {
      // 실제 지난 시간(0.25초까지)을 1/120초 걸음으로 조각낸다 — 느린 기기에서도 시간이 느려지지 않게
      const now = performance.now();
      const rdt = last < 0 ? 1 / 60 : clamp((now - last) / 1000, 0, 0.25);
      last = now;
      drag.tick(rdt);
      for (const tp of drag.taps.splice(0)) {
        poke(tp.x, tp.y);
        manualUntil = t + 15;
      }
      drag.dx = drag.dy = drag.wheel = 0;
      modeT += rdt;
      if (mode === 'tower') {
        if (!launched && modeT > 1.6) {
          launched = true;
          put(bigBall, HOLD.x, HOLD.y, HOLD.z);
          bigBall.v.set(12, 1.6, (Math.random() - 0.5) * 0.5);
        }
        if (!launched) bigBall.p.set(HOLD.x, HOLD.y + Math.sin(modeT * 6) * 0.06, HOLD.z);
      }
      if (t > manualUntil && modeT > (mode === 'dice' ? 6.5 : 9)) setMode(mode === 'dice' ? 'tower' : 'dice');
      acc += rdt;
      let n = 0;
      while (acc >= H && n < 30) {
        world.step(H);
        acc -= H;
        n++;
      }
      stepsLast = n;
      for (const b of world.bodies) {
        if (!b.mesh.visible) continue;
        b.mesh.position.copy(b.p);
        b.mesh.quaternion.copy(b.q);
      }
      // 카메라: 쟁반을 비스듬히 내려다보며 천천히 흔들림
      cam.position.set(Math.sin(t * 0.18) * 1.6, 6.4, 8.6);
      cam.lookAt(0.2, 0.55, 0);
      cam.updateMatrixWorld();
      // 접촉점
      const C = world.contacts;
      dotMesh.visible = nLines.visible = showContacts;
      if (showContacts) {
        const m = new THREE.Matrix4();
        const cnt = Math.min(MAXC, C.length);
        for (let i = 0; i < cnt; i++) {
          const c = C[i]!;
          dotMesh.setMatrixAt(i, m.makeTranslation(c.p.x, c.p.y, c.p.z));
          const L = 0.12 + Math.min(0.5, c.jn * 6);
          nPos.set([c.p.x, c.p.y, c.p.z, c.p.x + c.n.x * L, c.p.y + c.n.y * L, c.p.z + c.n.z * L], i * 6);
        }
        dotMesh.count = cnt;
        dotMesh.instanceMatrix.needsUpdate = true;
        nGeo.setDrawRange(0, cnt * 2);
        nGeo.attributes.position!.needsUpdate = true;
      }
      // 글씨
      tags = [];
      const live = world.bodies.filter((b) => b.on);
      const awake = live.filter((b) => !b.sleep).length;
      if (mode === 'dice') {
        const settled = modeT > 1 && dice.every((b) => b.sleep || (b.v.lengthSq() < 0.02 && b.w.lengthSq() < 0.05));
        if (settled) {
          const vals = dice.map(dieTop);
          dice.forEach((b, i) => {
            proj.copy(b.p).setY(b.p.y + 0.45).project(cam);
            tags.push({ text: String(vals[i]), x: (proj.x + 1) / 2, y: (1 - proj.y) / 2, ax: 0.5, ay: 1, bg: 'rgba(214,52,46,0.92)', big: true });
          });
          tags.push({ text: `윗면 눈  ${vals.join(' + ')} = ${vals.reduce((a, b) => a + b, 0)}`, x: 0.5, y: 0.04, ax: 0.5, ay: 0, big: true });
        } else tags.push({ text: '주사위 굴러가는 중…', x: 0.5, y: 0.04, ax: 0.5, ay: 0, big: true });
      } else tags.push({ text: launched ? '공으로 무너뜨리기!' : `나무 탑 ${planks.length}개 쌓기`, x: 0.5, y: 0.04, ax: 0.5, ay: 0, big: true });
      tags.push({
        text: bigView ? `물체 ${live.length} · 깨어 있음 ${awake} · 잠듦 ${live.length - awake} · 접촉점 ${C.length} · 1/120초 × ${stepsLast}걸음` : `접촉점 ${C.length} · 잠듦 ${live.length - awake}/${live.length}`,
        x: 0.015,
        y: 0.97,
        ax: 0,
        ay: 1,
      });
    },
    render(r, w, h) {
      bigView = w >= 700;
      drag.attach(w, h);
      r.shadowMap.enabled = true;
      r.render(scene, cam);
      overlay.draw(r, w, h, tags);
    },
    controls: [
      {
        type: 'button',
        label: '주사위 던지기',
        on: () => {
          setMode('dice');
          manualUntil = Infinity;
        },
      },
      {
        type: 'button',
        label: '탑 쌓기 → 공으로 무너뜨리기',
        on: () => {
          setMode('tower');
          manualUntil = Infinity;
        },
      },
      { type: 'range', label: '반발 (튀는 정도)', min: 0, max: 0.9, step: 0.05, value: 0.3, on: (v) => ((world.e = v), world.wakeAll()) },
      { type: 'range', label: '마찰 (μ)', min: 0, max: 1.2, step: 0.05, value: 0.5, on: (v) => ((world.mu = v), world.wakeAll()) },
      { type: 'toggle', label: '접촉점 보기 (빨간 점 + 법선)', value: false, on: (v) => (showContacts = v) },
    ],
    dispose() {
      drag.dispose();
      overlay.dispose();
      disposeScene(scene);
      bgTex.dispose();
    },
  };
}

/* ───────────── i46 GPU 유체 (stable fluids) ─────────────
 * 속도 · 압력 · 잉크를 HalfFloat 렌더 타깃 두 장씩(핑퐁)으로 두고, 단계마다 화면 크기 판 하나를 셰이더로 그린다.
 * 한 걸음 = 잉크 · 힘 뿌리기 → 회전량(curl) → 소용돌이 살리기 → 발산 → 압력 야코비 N번 → 기울기 빼기 → 속도 · 잉크 이류.
 * 셰이더에 반복문이 없다 (야코비 되풀이는 패스를 N번 그리기) — 윈도 D3D 컴파일이 빠르다. */

const FL_VERT = `
uniform vec2 texel;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
void main() {
  vUv = uv;
  vL = uv - vec2(texel.x, 0.0);
  vR = uv + vec2(texel.x, 0.0);
  vT = uv + vec2(0.0, texel.y);
  vB = uv - vec2(0.0, texel.y);
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;
const FL_HEAD = `
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
`;
const FL_FRAG = {
  /** 가우스 모양으로 값 더하기 (잉크 색 또는 힘) */
  splat: `
uniform sampler2D uTarget;
uniform float aspect;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
void main() {
  vec2 p = vUv - point;
  p.x *= aspect;
  vec3 s = exp(-dot(p, p) / radius) * color;
  gl_FragColor = vec4(texture2D(uTarget, vUv).xyz + s, 1.0);
}`,
  /** 이류 — 속도를 거꾸로 따라가 한 걸음 전 자리의 값을 가져온다 (semi-Lagrangian) */
  advect: `
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 simTexel;
uniform float dt;
uniform float dissipation;
void main() {
  vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * simTexel;
  gl_FragColor = texture2D(uSource, coord) / (1.0 + dissipation * dt);
}`,
  /** 발산 — 벽에서는 벽에 수직인 속도를 뒤집어 물이 새지 않게 */
  divergence: `
uniform sampler2D uVelocity;
void main() {
  float L = texture2D(uVelocity, vL).x;
  float R = texture2D(uVelocity, vR).x;
  float T = texture2D(uVelocity, vT).y;
  float B = texture2D(uVelocity, vB).y;
  vec2 C = texture2D(uVelocity, vUv).xy;
  if (vL.x < 0.0) L = -C.x;
  if (vR.x > 1.0) R = -C.x;
  if (vT.y > 1.0) T = -C.y;
  if (vB.y < 0.0) B = -C.y;
  gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`,
  /** 회전량 (2D 와도) */
  curl: `
uniform sampler2D uVelocity;
void main() {
  float L = texture2D(uVelocity, vL).y;
  float R = texture2D(uVelocity, vR).y;
  float T = texture2D(uVelocity, vT).x;
  float B = texture2D(uVelocity, vB).x;
  gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`,
  /** 소용돌이 살리기 — 회전량이 큰 쪽으로 작은 힘 (vorticity confinement) */
  vorticity: `
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float curl;
uniform float dt;
void main() {
  float L = texture2D(uCurl, vL).x;
  float R = texture2D(uCurl, vR).x;
  float T = texture2D(uCurl, vT).x;
  float B = texture2D(uCurl, vB).x;
  float C = texture2D(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= curl * C;
  force.y *= -1.0;
  vec2 vel = texture2D(uVelocity, vUv).xy + force * dt;
  gl_FragColor = vec4(clamp(vel, -2000.0, 2000.0), 0.0, 1.0);
}`,
  /** 압력 야코비 한 번 — 이웃 넷의 평균에서 발산을 뺀다 */
  pressure: `
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
void main() {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  float div = texture2D(uDivergence, vUv).x;
  gl_FragColor = vec4((L + R + B + T - div) * 0.25, 0.0, 0.0, 1.0);
}`,
  /** 기울기 빼기 — 압력이 높은 곳에서 낮은 곳으로 밀어 안 눌리는 흐름으로 */
  gradient: `
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
void main() {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  vec2 vel = texture2D(uVelocity, vUv).xy - 0.5 * vec2(R - L, T - B);
  gl_FragColor = vec4(vel, 0.0, 1.0);
}`,
  /** 값에 곱하기 (압력을 다음 걸음 첫 값으로 조금 남김) */
  scale: `
uniform sampler2D uTexture;
uniform float value;
void main() {
  gl_FragColor = value * texture2D(uTexture, vUv);
}`,
  /** 화면 — 잉크 + 결 그늘, 「속도장 보기」면 방향 색 + 칸마다 화살표 (반복문 없음) */
  display: `
uniform sampler2D uTexture;
uniform sampler2D uVelocity;
uniform vec2 dyeTexel;
uniform float showVel;
uniform float aspect;
uniform vec3 bgTop;
uniform vec3 bgBot;
void main() {
  vec3 c = texture2D(uTexture, vUv).rgb;
  vec3 lc = texture2D(uTexture, vUv - vec2(dyeTexel.x, 0.0)).rgb;
  vec3 rc = texture2D(uTexture, vUv + vec2(dyeTexel.x, 0.0)).rgb;
  vec3 tc = texture2D(uTexture, vUv + vec2(0.0, dyeTexel.y)).rgb;
  vec3 bc = texture2D(uTexture, vUv - vec2(0.0, dyeTexel.y)).rgb;
  vec3 n = normalize(vec3(length(rc) - length(lc), length(tc) - length(bc), length(dyeTexel)));
  c *= clamp(n.z + 0.7, 0.7, 1.0);
  c = vec3(1.0) - exp(-c * 1.6);
  float a = clamp(max(c.r, max(c.g, c.b)) * 1.2, 0.0, 1.0);
  vec3 col = c + mix(bgBot, bgTop, vUv.y) * (1.0 - a);
  if (showVel > 0.5) {
    vec2 v = texture2D(uVelocity, vUv).xy;
    float sp = length(v);
    vec2 dir = v / (sp + 0.0001);
    vec3 vc = vec3(0.5 + 0.5 * dir.x, 0.5 + 0.5 * dir.y, 0.75 - 0.35 * (dir.x + dir.y) * 0.5) * clamp(sp / 120.0, 0.0, 1.0);
    col = col * 0.3 + vc * 0.8;
    vec2 grid = vec2(26.0 * aspect, 26.0);
    vec2 cc = (floor(vUv * grid) + 0.5) / grid;
    vec2 cv = texture2D(uVelocity, cc).xy;
    float cl = length(cv);
    vec2 cd = cv / (cl + 0.0001);
    float len = clamp(cl / 140.0, 0.0, 1.0) * 0.9;
    vec2 q = (vUv - cc) * grid;
    vec2 a0 = -cd * len * 0.5;
    vec2 ba = cd * len;
    float hh = clamp(dot(q - a0, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
    float line = smoothstep(0.075, 0.03, length(q - a0 - ba * hh));
    float head = smoothstep(0.15, 0.09, length(q - a0 - ba));
    col = mix(col, vec3(1.0), max(line, head * step(0.15, len)) * step(0.06, len));
  }
  gl_FragColor = vec4(col, 1.0);
}`,
};
type FlPass = keyof typeof FL_FRAG;

/** 핑퐁 한 쌍 — 읽는 판 · 쓰는 판 */
interface FlDouble {
  read: THREE.WebGLRenderTarget;
  write: THREE.WebGLRenderTarget;
  swap(): void;
}

/** 크게 보기 캔버스 위 손가락 — 누른 채 끌면 그 자리 · 움직인 양 (0~1, 위가 1) */
class FluidPointer {
  el: HTMLCanvasElement | null = null;
  x = 0;
  y = 0;
  dx = 0;
  dy = 0;
  down = false;
  moved = false;
  pressed = false;
  idle = 99;
  attach(w: number, h: number): void {
    if (this.el || w < 700) return;
    for (const c of Array.from(document.querySelectorAll<HTMLCanvasElement>('canvas.hub-canvas')))
      if (c.width === w && c.height === h) {
        this.el = c;
        break;
      }
    if (!this.el) return;
    this.el.style.cursor = 'crosshair';
    this.el.style.touchAction = 'none';
    this.el.addEventListener('pointerdown', this.pd);
    window.addEventListener('pointermove', this.pm);
    window.addEventListener('pointerup', this.pu);
  }
  private pos(e: PointerEvent): [number, number] {
    const r = this.el!.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height];
  }
  private pd = (e: PointerEvent): void => {
    [this.x, this.y] = this.pos(e);
    this.down = true;
    this.pressed = true;
    this.idle = 0;
  };
  private pm = (e: PointerEvent): void => {
    if (!this.down) return;
    const [x, y] = this.pos(e);
    this.dx += x - this.x;
    this.dy += y - this.y;
    this.x = x;
    this.y = y;
    this.moved = true;
    this.idle = 0;
  };
  private pu = (): void => {
    this.down = false;
  };
  dispose(): void {
    if (this.el) {
      this.el.removeEventListener('pointerdown', this.pd);
      this.el.style.cursor = '';
      this.el = null;
    }
    window.removeEventListener('pointermove', this.pm);
    window.removeEventListener('pointerup', this.pu);
  }
}

/** i46 — GPU stable fluids 견본 */
function makeFluidDemo(): Scene3D {
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  scene.add(quad);
  const U = (v: unknown): { value: unknown } => ({ value: v });
  const mats = {} as Record<FlPass, THREE.ShaderMaterial>;
  for (const k of Object.keys(FL_FRAG) as FlPass[]) {
    mats[k] = new THREE.ShaderMaterial({
      vertexShader: FL_VERT,
      fragmentShader: FL_HEAD + FL_FRAG[k],
      uniforms: {
        texel: U(new THREE.Vector2()),
        uTarget: U(null),
        uVelocity: U(null),
        uSource: U(null),
        uCurl: U(null),
        uPressure: U(null),
        uDivergence: U(null),
        uTexture: U(null),
        aspect: U(1),
        color: U(new THREE.Vector3()),
        point: U(new THREE.Vector2()),
        radius: U(0.002),
        simTexel: U(new THREE.Vector2()),
        dt: U(0.016),
        dissipation: U(0),
        curl: U(30),
        value: U(0.8),
        dyeTexel: U(new THREE.Vector2()),
        showVel: U(0),
        bgTop: U(new THREE.Vector3(0.03, 0.04, 0.09)),
        bgBot: U(new THREE.Vector3(0.0, 0.0, 0.02)),
      },
      depthTest: false,
      depthWrite: false,
    });
  }
  mats.display.toneMapped = false;

  // 조절 값
  let simRes = 256;
  let iters = 25;
  let curlK = 30;
  let showVel = false;
  let big = false;

  let simW = 0;
  let simH = 0;
  let dyeW = 0;
  let dyeH = 0;
  let vel!: FlDouble;
  let dye!: FlDouble;
  let prs!: FlDouble;
  let div!: THREE.WebGLRenderTarget;
  let crl!: THREE.WebGLRenderTarget;
  const RT = (w: number, h: number): THREE.WebGLRenderTarget =>
    new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    });
  const dbl = (w: number, h: number): FlDouble => {
    const o = {
      read: RT(w, h),
      write: RT(w, h),
      swap() {
        const t = o.read;
        o.read = o.write;
        o.write = t;
      },
    };
    return o;
  };
  const freeTargets = (): void => {
    if (!vel) return;
    for (const d of [vel, dye, prs]) {
      d.read.dispose();
      d.write.dispose();
    }
    div.dispose();
    crl.dispose();
  };
  let fresh = true;
  /** 화면 비율 · 해상도에 맞춰 판 만들기 (바뀔 때만) */
  const ensure = (aspect: number): void => {
    const res = big ? simRes : 128;
    const sh = res;
    const sw = Math.max(16, Math.round(res * aspect));
    const dh = big ? 512 : 256;
    const dw = Math.max(16, Math.round(dh * aspect));
    if (sw === simW && sh === simH && dw === dyeW && dh === dyeH) return;
    freeTargets();
    simW = sw;
    simH = sh;
    dyeW = dw;
    dyeH = dh;
    vel = dbl(sw, sh);
    prs = dbl(sw, sh);
    div = RT(sw, sh);
    crl = RT(sw, sh);
    dye = dbl(dw, dh);
    fresh = true;
  };

  let R!: THREE.WebGLRenderer;
  const pass = (k: FlPass, target: THREE.WebGLRenderTarget | null, set: Record<string, unknown>, tw: number, th: number): void => {
    const m = mats[k];
    for (const [n, v] of Object.entries(set)) m.uniforms[n]!.value = v;
    (m.uniforms.texel!.value as THREE.Vector2).set(1 / tw, 1 / th);
    quad.material = m;
    R.setRenderTarget(target);
    R.render(scene, cam);
  };
  const tmpC = new THREE.Vector3();
  const tmpP = new THREE.Vector2();
  /** 한 점에 잉크 · 힘 (x, y 는 0~1, fx fy 는 칸/초) */
  const splat = (x: number, y: number, fx: number, fy: number, col: THREE.Color, rad: number): void => {
    const aspect = simW / simH;
    const r = (rad / 100) * (aspect > 1 ? aspect : 1);
    tmpP.set(x, y);
    pass('splat', vel.write, { uTarget: vel.read.texture, aspect, point: tmpP, color: tmpC.set(fx, fy, 0), radius: r }, simW, simH);
    vel.swap();
    pass('splat', dye.write, { uTarget: dye.read.texture, aspect, point: tmpP, color: tmpC.set(col.r, col.g, col.b), radius: r }, dyeW, dyeH);
    dye.swap();
  };
  const simTexel = new THREE.Vector2();
  const step = (dt: number): void => {
    const sw = simW;
    const sh = simH;
    simTexel.set(1 / sw, 1 / sh);
    pass('curl', crl, { uVelocity: vel.read.texture }, sw, sh);
    pass('vorticity', vel.write, { uVelocity: vel.read.texture, uCurl: crl.texture, curl: curlK, dt }, sw, sh);
    vel.swap();
    pass('divergence', div, { uVelocity: vel.read.texture }, sw, sh);
    pass('scale', prs.write, { uTexture: prs.read.texture, value: 0.8 }, sw, sh);
    prs.swap();
    for (let i = 0; i < iters; i++) {
      pass('pressure', prs.write, { uPressure: prs.read.texture, uDivergence: div.texture }, sw, sh);
      prs.swap();
    }
    pass('gradient', vel.write, { uPressure: prs.read.texture, uVelocity: vel.read.texture }, sw, sh);
    vel.swap();
    pass('advect', vel.write, { uVelocity: vel.read.texture, uSource: vel.read.texture, simTexel, dt, dissipation: 0.25 }, sw, sh);
    vel.swap();
    pass('advect', dye.write, { uVelocity: vel.read.texture, uSource: dye.read.texture, simTexel, dt, dissipation: 0.9 }, dyeW, dyeH);
    dye.swap();
  };
  const clearAll = (): void => {
    for (const d of [vel, dye, prs]) {
      pass('scale', d.write, { uTexture: d.read.texture, value: 0 }, simW, simH);
      d.swap();
    }
  };

  const ptr = new FluidPointer();
  const col = new THREE.Color();
  const dyeTexel = new THREE.Vector2();
  const overlay = new Overlay();
  let tags: Tag[] = [];
  let last = -1;
  let time = 0;
  let wantClear = false;
  return {
    scene,
    camera: cam,
    tone: THREE.NoToneMapping,
    update(t) {
      time = t;
    },
    render(r, w, h) {
      R = r;
      big = w >= 700;
      ptr.attach(w, h);
      const now = performance.now();
      // 실제 지난 시간 (0.25초까지) — 1/60초보다 길면 걸음을 나눈다
      const rdt = last < 0 ? 1 / 60 : clamp((now - last) / 1000, 0.001, 0.25);
      last = now;
      ptr.idle += rdt;
      const prevRT = r.getRenderTarget();
      const prevAuto = r.autoClear;
      r.autoClear = false;
      ensure(w / h);
      const k = simRes / 128;
      if (wantClear) {
        wantClear = false;
        clearAll();
      }
      if (fresh) {
        fresh = false;
        clearAll();
        for (let i = 0; i < 6; i++) {
          col.setHSL(Math.random(), 1, 0.5).multiplyScalar(0.9);
          const a = Math.random() * TAU;
          splat(0.15 + Math.random() * 0.7, 0.15 + Math.random() * 0.7, Math.cos(a) * 900 * (big ? k : 1), Math.sin(a) * 900 * (big ? k : 1), col, 0.35);
        }
      }
      // 손으로 젓기 (크게 보기) — 끈 만큼 힘, 누른 자리에 잉크
      const fk = (big ? k : 1) * 5200;
      if (ptr.pressed) {
        ptr.pressed = false;
        col.setHSL((time * 0.13) % 1, 1, 0.5).multiplyScalar(1.1);
        splat(ptr.x, ptr.y, 0, 0, col, 0.4);
      }
      if (ptr.moved) {
        ptr.moved = false;
        col.setHSL((time * 0.13) % 1, 1, 0.5).multiplyScalar(0.7);
        splat(ptr.x, ptr.y, ptr.dx * fk * (w / h), ptr.dy * fk, col, 0.25);
        ptr.dx = ptr.dy = 0;
      }
      // 저절로 젓는 붓 셋 (카드 · 손을 뗀 지 3초 뒤)
      if (!big || ptr.idle > 3) {
        for (let i = 0; i < 3; i++) {
          const a = time * 0.55 + (i * TAU) / 3;
          const x = 0.5 + Math.cos(a) * 0.3;
          const y = 0.5 + Math.sin(a * 1.37 + i) * 0.28;
          const vx = -Math.sin(a) * 0.3 * 0.55;
          const vy = Math.cos(a * 1.37 + i) * 0.28 * 0.55 * 1.37;
          col.setHSL((time * 0.05 + i / 3) % 1, 1, 0.5).multiplyScalar(0.12 * rdt * 60);
          splat(x, y, vx * 700 * (big ? k : 1), vy * 700 * (big ? k : 1), col, 0.18);
        }
      }
      const n = Math.min(4, Math.ceil(rdt / (1 / 60) - 0.01));
      for (let i = 0; i < n; i++) step(rdt / n);
      // 화면
      r.setRenderTarget(null);
      dyeTexel.set(1 / dyeW, 1 / dyeH);
      pass('display', null, { uTexture: dye.read.texture, uVelocity: vel.read.texture, dyeTexel, showVel: showVel ? 1 : 0, aspect: w / h }, w, h);
      tags = [
        { text: `GPU 격자 ${simW}×${simH} · 잉크 ${dyeW}×${dyeH} · 압력 야코비 ${iters}번 · 걸음 ${n}`, x: 0.015, y: 0.03, ax: 0, ay: 0 },
      ];
      if (big && ptr.idle > 3) tags.push({ text: '끌어서 저어 보세요', x: 0.5, y: 0.96, ax: 0.5, ay: 1, big: true });
      overlay.draw(r, w, h, tags);
      r.autoClear = prevAuto;
      r.setRenderTarget(prevRT);
    },
    controls: [
      { type: 'range', label: '해상도 (속도 격자 세로 칸)', min: 128, max: 256, step: 128, value: 256, on: (v) => (simRes = v) },
      { type: 'range', label: '압력 반복 수 (야코비)', min: 1, max: 40, step: 1, value: 25, on: (v) => (iters = v) },
      { type: 'range', label: '소용돌이 세기 (vorticity)', min: 0, max: 60, step: 1, value: 30, on: (v) => (curlK = v) },
      { type: 'toggle', label: '속도장 보기', value: false, on: (v) => (showVel = v) },
      { type: 'button', label: '맑은 물로', on: () => (wantClear = true) },
    ],
    dispose() {
      ptr.dispose();
      overlay.dispose();
      freeTargets();
      for (const m of Object.values(mats)) m.dispose();
      quad.geometry.dispose();
    },
  };
}

export const DEMOS: DemoMap = {
  /* ───── u34 점 입자 ───── */
  u34: {
    kind: '3d',
    caption: '점(Points) 하나로 눈 · 반딧불 · 모닥불 불똥 · 꽃가루 · 폭죽을 한꺼번에 — 점 1,400개',
    make() {
      const scene = new THREE.Scene();
      scene.background = skyTexture('#0b1240', '#2a3a7a');
      const cam = new THREE.PerspectiveCamera(48, 1.6, 0.1, 100);
      cam.position.set(0, 2.2, 10);
      cam.lookAt(0, 2.2, 0);
      scene.add(new THREE.HemisphereLight(0x9ab0ff, 0x203018, 1.2));
      const ground = new THREE.Mesh(new THREE.CircleGeometry(14, 40), new THREE.MeshLambertMaterial({ color: 0x1d3a2a }));
      ground.rotation.x = -Math.PI / 2;
      scene.add(ground);
      // 모닥불
      const fire = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1, 8), new THREE.MeshLambertMaterial({ color: 0x6a3a1a, emissive: 0x401000 }));
        log.rotation.z = Math.PI / 2;
        log.rotation.y = (k * Math.PI) / 3;
        log.position.y = 0.1;
        fire.add(log);
      }
      const glow = new THREE.PointLight(0xff8a3a, 6, 6);
      glow.position.y = 0.6;
      fire.add(glow);
      fire.position.set(-3, 0, 1);
      scene.add(fire);
      const N = 1400;
      const pool = new PointPool(N);
      scene.add(pool.obj);
      const r = rng(7);
      // 종류별 칸: 눈 0~499 · 반딧불 500~559 · 불똥 560~799 · 꽃가루 800~949 · 폭죽 950~1399
      const vx = new Float32Array(N * 3);
      const life = new Float32Array(N);
      const seed = new Float32Array(N);
      for (let i = 0; i < N; i++) seed[i] = r();
      const P = pool.pos;
      for (let i = 0; i < 500; i++) {
        P[i * 3] = (r() - 0.5) * 18;
        P[i * 3 + 1] = r() * 9;
        P[i * 3 + 2] = (r() - 0.5) * 8;
      }
      for (let i = 500; i < 560; i++) {
        P[i * 3] = 1 + r() * 5;
        P[i * 3 + 1] = 0.3 + r() * 1.5;
        P[i * 3 + 2] = (r() - 0.5) * 4;
      }
      for (let i = 560; i < 800; i++) life[i] = -r() * 1.2;
      for (let i = 800; i < 950; i++) {
        P[i * 3] = (r() - 0.5) * 16;
        P[i * 3 + 1] = 1 + r() * 7;
        P[i * 3 + 2] = (r() - 0.5) * 6;
      }
      for (let i = 950; i < N; i++) life[i] = 0;
      const c = new THREE.Color();
      const BURSTS = 3;
      const PER = 150;
      const burstAt = [0.2, 0.9, 1.6];
      const burstHue = [0.95, 0.12, 0.55];
      let sizeK = 1;
      return {
        scene,
        camera: cam,
        resize(_w, h) {
          pool.resize(h);
        },
        update(t, dt) {
          dt = Math.min(dt, 0.05);
          glow.intensity = 5 + Math.sin(t * 17) * 1.2 + Math.sin(t * 7) * 1.4;
          // 눈
          for (let i = 0; i < 500; i++) {
            P[i * 3 + 1] = P[i * 3 + 1]! - (dt * (0.5 + seed[i]! * 0.5));
            P[i * 3] = P[i * 3]! + (Math.sin(t * 1.3 + seed[i]! * 20) * dt * 0.3);
            if (P[i * 3 + 1]! < 0) P[i * 3 + 1] = 9;
            c.setRGB(0.85, 0.92, 1);
            pool.set(i, P[i * 3]!, P[i * 3 + 1]!, P[i * 3 + 2]!, c, 0.14 * sizeK, 0.75);
          }
          // 반딧불 — 깜빡이며 떠돈다
          for (let i = 500; i < 560; i++) {
            const s = seed[i]! * 50;
            const x = P[i * 3]! + Math.sin(t * 0.7 + s) * 0.004;
            const y = P[i * 3 + 1]! + Math.cos(t * 0.9 + s) * 0.003;
            P[i * 3] = x;
            P[i * 3 + 1] = y;
            const blink = Math.max(0, Math.sin(t * 2.2 + s));
            c.setRGB(0.75, 1, 0.3);
            pool.set(i, x, y, P[i * 3 + 2]!, c, (0.18 + blink * 0.25) * sizeK, 0.2 + blink * 0.9);
          }
          // 모닥불 불똥 — 솟아오르며 식는다
          for (let i = 560; i < 800; i++) {
            const before = life[i]!;
            life[i] = life[i]! + (dt);
            if (life[i]! > 1.4 || (before < 0 && life[i]! >= 0)) {
              life[i] = 0;
              P[i * 3] = fire.position.x + (r() - 0.5) * 0.5;
              P[i * 3 + 1] = 0.25;
              P[i * 3 + 2] = fire.position.z + (r() - 0.5) * 0.5;
              vx[i * 3] = (r() - 0.5) * 0.6;
              vx[i * 3 + 1] = 1.2 + r() * 1.6;
              vx[i * 3 + 2] = (r() - 0.5) * 0.6;
            }
            const k = clamp(life[i]! / 1.4, 0, 1);
            if (life[i]! >= 0) for (let a = 0; a < 3; a++) P[i * 3 + a] = P[i * 3 + a]! + (vx[i * 3 + a]! * dt);
            P[i * 3] = P[i * 3]! + (Math.sin(t * 6 + seed[i]! * 30) * dt * 0.4);
            c.setRGB(1, 0.8 - k * 0.6, 0.3 - k * 0.3);
            pool.set(i, P[i * 3]!, P[i * 3 + 1]!, P[i * 3 + 2]!, c, (0.16 - k * 0.1) * sizeK, life[i]! < 0 ? 0 : 1 - k);
          }
          // 꽃가루 — 바람 따라 비스듬히
          for (let i = 800; i < 950; i++) {
            P[i * 3] = P[i * 3]! + (dt * (0.7 + seed[i]! * 0.4));
            P[i * 3 + 1] = P[i * 3 + 1]! + (Math.sin(t * 2 + seed[i]! * 40) * dt * 0.4 - dt * 0.15);
            if (P[i * 3]! > 9) P[i * 3] = -9;
            if (P[i * 3 + 1]! < 0.5) P[i * 3 + 1] = 8;
            c.setRGB(1, 0.6 + seed[i]! * 0.2, 0.78);
            pool.set(i, P[i * 3]!, P[i * 3 + 1]!, P[i * 3 + 2]!, c, 0.16 * sizeK, 0.85);
          }
          // 폭죽 — 2.1초마다 세 송이
          const cyc = t % 2.1;
          const round = Math.floor(t / 2.1);
          for (let b = 0; b < BURSTS; b++) {
            const age = cyc - burstAt[b]!;
            const br = rng(round * 7 + b * 13 + 1);
            const cx = (br() - 0.5) * 9 + 1.5;
            const cy = 3.7 + br() * 1.5;
            for (let k = 0; k < PER; k++) {
              const i = 950 + b * PER + k;
              if (age < 0 || age > 1.5) {
                pool.alpha[i] = 0;
                continue;
              }
              const s = seed[i]!;
              const th = s * TAU * 13.7;
              const ph = Math.acos(1 - 2 * ((k + 0.5) / PER));
              const sp = 2.0 * (0.8 + (s * 7) % 0.3);
              const dx = Math.sin(ph) * Math.cos(th);
              const dy = Math.cos(ph);
              const dz = Math.sin(ph) * Math.sin(th);
              const d = sp * (1 - Math.exp(-age * 3)) / 1.0;
              c.setHSL((burstHue[b]! + round * 0.17) % 1, 0.95, 0.62);
              pool.set(i, cx + dx * d, cy + dy * d - age * age * 0.9, dz * d, c, 0.26 * sizeK, Math.max(0, 1 - age / 1.5) * (0.7 + 0.3 * Math.sin(t * 40 + k)));
            }
          }
          pool.flush();
        },
        controls: [
          { type: 'range', label: '입자 크기', min: 0.4, max: 2.5, step: 0.1, value: 1, on: (v) => (sizeK = v) },
          {
            type: 'toggle',
            label: '빛 더하기 섞기 (Additive)',
            value: true,
            on: (v) => {
              pool.mat.blending = v ? THREE.AdditiveBlending : THREE.NormalBlending;
              pool.mat.needsUpdate = true;
            },
          },
        ],
        dispose() {
          disposeScene(scene);
          (scene.background as THREE.Texture).dispose();
        },
      };
    },
  },

  /* ───── u35 스프라이트 ───── */
  u35: {
    kind: '3d',
    caption: '카메라가 빙 돌아도 스프라이트(오른쪽 · Z · 하트 · +10)는 늘 정면 — 왼쪽 평면 판은 옆으로 돌면 얇아져요',
    make() {
      const scene = new THREE.Scene();
      scene.background = skyTexture('#7cc8f4', '#d8f0ff');
      scene.add(new THREE.HemisphereLight(0xffffff, 0x6a9a4a, 1.3));
      const sun = new THREE.DirectionalLight(0xfff2d8, 1.5);
      sun.position.set(3, 6, 4);
      scene.add(sun);
      const cam = new THREE.PerspectiveCamera(40, 1.6, 0.1, 80);
      const ground = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.8, 0.4, 48), new THREE.MeshLambertMaterial({ color: 0x8ad06a }));
      ground.position.y = -0.2;
      scene.add(ground);
      const post = (x: number, col: number): void => {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 10), new THREE.MeshLambertMaterial({ color: col }));
        p.position.set(x, 0.8, 0);
        scene.add(p);
      };
      post(-1.9, 0x8a6a4a);
      post(1.9, 0x8a6a4a);
      // 왼쪽: 평면 판 (글씨를 그린 PlaneGeometry)
      const plate = textSprite('평면 판', { size: 64, color: '#20304a', bg: '#ffffff' });
      const planeMat = new THREE.MeshBasicMaterial({ map: (plate.material as THREE.SpriteMaterial).map, transparent: true, side: THREE.DoubleSide });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(plate.scale.x * 1.4, plate.scale.y * 1.4), planeMat);
      plane.position.set(-1.9, 1.9, 0);
      scene.add(plane);
      plate.material.dispose();
      // 오른쪽: 스프라이트
      const spr = textSprite('스프라이트', { size: 64, color: '#5a2a00', bg: '#ffd23a', h: 0.7 });
      spr.position.set(1.9, 1.9, 0);
      scene.add(spr);
      // 잠자는 친구 + Z
      const blobMat = new THREE.MeshStandardMaterial({ color: 0xa48aff, roughness: 0.6 });
      const blob = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 20), blobMat);
      blob.scale.y = 0.8;
      blob.position.set(0, 0.44, -1.4);
      scene.add(blob);
      const happy = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 20), new THREE.MeshStandardMaterial({ color: 0xff8aa0, roughness: 0.6 }));
      happy.position.set(0, 0.5, 1.5);
      scene.add(happy);
      const floaters: { s: THREE.Sprite; t0: number; kind: number }[] = [];
      const mk = (k: number): THREE.Sprite =>
        k === 0
          ? textSprite('Z', { size: 80, color: '#ffffff', stroke: '#4a3aa0', font: 'title', h: 0.45 })
          : k === 1
            ? textSprite('♥', { size: 80, color: '#ff4a6a', stroke: '#ffffff', h: 0.5 })
            : textSprite('+10', { size: 72, color: '#ffe23a', stroke: '#5a2a00', font: 'title', h: 0.5 });
      for (let k = 0; k < 9; k++) {
        const s = mk(k % 3);
        scene.add(s);
        floaters.push({ s, t0: (k / 9) * 2.4 + (k % 3) * 0.2, kind: k % 3 });
      }
      return {
        scene,
        camera: cam,
        update(t) {
          const a = t * 0.55;
          cam.position.set(Math.sin(a) * 7.2, 3.2, Math.cos(a) * 7.2);
          cam.lookAt(0, 1.1, 0);
          blob.scale.y = 0.8 + Math.sin(t * 2) * 0.04;
          happy.position.y = 0.5 + Math.abs(Math.sin(t * 3)) * 0.4;
          for (const f of floaters) {
            const k = ((t + f.t0) % 2.4) / 2.4;
            const base = f.kind === 0 ? blob.position : happy.position;
            const side = f.kind === 2 ? -0.8 : f.kind === 1 ? -0.2 : 0.3;
            f.s.position.set(base.x + side + Math.sin(k * 6 + f.t0) * 0.25, (f.kind === 0 ? 0.9 : 1.1) + k * 1.6, base.z);
            (f.s.material as THREE.SpriteMaterial).opacity = k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6) / 0.4);
            const sc = 0.7 + Math.min(1, k * 4) * 0.3;
            f.s.scale.set((f.s.userData['w0'] ??= f.s.scale.x) * sc, (f.s.userData['h0'] ??= f.s.scale.y) * sc, 1);
          }
        },
        dispose() {
          disposeScene(scene);
          (scene.background as THREE.Texture).dispose();
        },
      };
    },
  },

  /* ───── u36 인스턴싱 ───── */
  u36: {
    kind: '3d',
    caption: '관중 수천 명을 InstancedMesh 두 개(몸 · 머리)로 — 그리기 호출 2번, 파도타기는 행렬만 바꿔요',
    make() {
      const scene = new THREE.Scene();
      scene.background = skyTexture('#0e1a44', '#3a4c8e');
      scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x303050, 1.4));
      const sun = new THREE.DirectionalLight(0xffffff, 1.4);
      sun.position.set(2, 8, 6);
      scene.add(sun);
      const cam = new THREE.PerspectiveCamera(42, 1.6, 0.1, 200);
      const COLS = 80;
      const ROWS = 50;
      const MAX = COLS * ROWS;
      const body = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.42, 0.24), new THREE.MeshLambertMaterial(), MAX);
      const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshLambertMaterial({ color: 0xffd2a8 }), MAX);
      const r = rng(3);
      const pal = [0xff4a5a, 0xffd23a, 0x3ab0ff, 0x4ae07a, 0xffffff, 0xff8a3a, 0xb07aff];
      const col = new THREE.Color();
      const seats: { x: number; y: number; z: number; ry: number; ph: number }[] = [];
      for (let rr = 0; rr < ROWS; rr++)
        for (let cc = 0; cc < COLS; cc++) {
          const ang = (cc / (COLS - 1) - 0.5) * 2.0;
          const R = 9 + rr * 0.5;
          seats.push({ x: Math.sin(ang) * R, y: rr * 0.36, z: -Math.cos(ang) * R + 6, ry: -ang, ph: cc * 0.16 });
          body.setColorAt(seats.length - 1, col.setHex(pal[Math.floor(r() * pal.length)]!));
        }
      // 앞 사람부터 count 만큼 보이게 (가운데부터)
      const order = seats.map((_, i) => i).sort((a, b) => Math.floor(a / COLS) - Math.floor(b / COLS));
      for (let k = 0; k < MAX; k++) body.setColorAt(k, col.setHex(pal[Math.floor(r() * pal.length)]!));
      scene.add(body, head);
      const field = new THREE.Mesh(new THREE.CircleGeometry(8, 40), new THREE.MeshLambertMaterial({ color: 0x3aa04a }));
      field.rotation.x = -Math.PI / 2;
      field.position.set(0, -0.3, 6);
      scene.add(field);
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(34, 9, 18, 48, 1, true, Math.PI - 1.1, 2.2), new THREE.MeshLambertMaterial({ color: 0x2a3050, side: THREE.DoubleSide }));
      stand.position.set(0, 8.5, 6);
      scene.add(stand);
      let count = 2400;
      let label = textSprite(`${count.toLocaleString()}명 · 그리기 2번`, { size: 56, color: '#fff', bg: 'rgba(10,16,40,0.75)', h: 0.9 });
      label.position.set(0, 0.6, 8);
      scene.add(label);
      const setLabel = (): void => {
        scene.remove(label);
        label.material.map?.dispose();
        label.material.dispose();
        label = textSprite(`${count.toLocaleString()}명 · 그리기 2번`, { size: 56, color: '#fff', bg: 'rgba(10,16,40,0.75)', h: 0.9 });
        label.position.set(0, 0.6, 8);
        scene.add(label);
      };
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const e = new THREE.Euler();
      const v = new THREE.Vector3();
      const one = new THREE.Vector3(1, 1, 1);
      let waveOn = true;
      return {
        scene,
        camera: cam,
        update(t) {
          cam.position.set(Math.sin(t * 0.2) * 3, 6, 23);
          cam.lookAt(0, 4.6, 0);
          body.count = head.count = count;
          for (let k = 0; k < count; k++) {
            const i = order[k]!;
            const s = seats[i]!;
            const w = waveOn ? Math.max(0, Math.sin(s.ph - t * 3.2)) : 0;
            const up = Math.pow(w, 3) * 0.45;
            e.set(0, s.ry, 0);
            q.setFromEuler(e);
            m.compose(v.set(s.x, s.y + 0.21 + up, s.z), q, one);
            body.setMatrixAt(k, m);
            m.compose(v.set(s.x, s.y + 0.55 + up, s.z), q, one);
            head.setMatrixAt(k, m);
          }
          body.instanceMatrix.needsUpdate = true;
          head.instanceMatrix.needsUpdate = true;
          if (body.instanceColor) body.instanceColor.needsUpdate = true;
        },
        controls: [
          {
            type: 'range',
            label: '관중 수',
            min: 200,
            max: MAX,
            step: 200,
            value: count,
            on: (x) => {
              count = x;
              setLabel();
            },
          },
          { type: 'toggle', label: '파도타기', value: true, on: (x) => (waveOn = x) },
        ],
        dispose() {
          disposeScene(scene);
          (scene.background as THREE.Texture).dispose();
          body.dispose();
          head.dispose();
        },
      };
    },
  },

  /* ───── u37 필살 투구 ───── */
  u37: {
    kind: '3d',
    caption: '숫자 야구 필살 투구 — 불꽃 · 번개 · 도깨비 · 회오리 · 무지개, 공 뒤에 잔상 8개 + 불똥 입자 + 번개 줄기',
    make() {
      const scene = new THREE.Scene();
      scene.background = skyTexture('#060a24', '#2a3a80');
      scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x305030, 2.2));
      const cam = new THREE.PerspectiveCamera(50, 1.6, 0.1, 120);
      cam.position.set(1.2, 2.4, 7.2);
      cam.lookAt(0, 1.3, -7);
      const grass = new THREE.Mesh(new THREE.PlaneGeometry(40, 60), new THREE.MeshLambertMaterial({ color: 0x2f8a48 }));
      grass.rotation.x = -Math.PI / 2;
      grass.position.z = -14;
      scene.add(grass);
      const dirt = new THREE.Mesh(new THREE.CircleGeometry(1.6, 32), new THREE.MeshLambertMaterial({ color: 0x8a5a3a }));
      dirt.rotation.x = -Math.PI / 2;
      dirt.position.set(0, 0.01, -22);
      scene.add(dirt);
      const plate = new THREE.Mesh(new THREE.CircleGeometry(0.45, 5), new THREE.MeshLambertMaterial({ color: 0xffffff }));
      plate.rotation.x = -Math.PI / 2;
      plate.position.set(0, 0.03, 1.4);
      plate.rotation.z = Math.PI / 2;
      scene.add(plate);
      const homeDirt = new THREE.Mesh(new THREE.CircleGeometry(1.1, 32), new THREE.MeshLambertMaterial({ color: 0x9a6a44 }));
      homeDirt.rotation.x = -Math.PI / 2;
      homeDirt.position.set(0, 0.015, 1.4);
      scene.add(homeDirt);
      // 조명탑 빛
      for (const x of [-9, 9]) {
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffee }));
        l.position.set(x, 9, -26);
        scene.add(l);
      }
      const ballMat = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, emissive: 0xff7a1a, emissiveIntensity: 0.6, roughness: 0.5 });
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), ballMat);
      scene.add(ball);
      const after: THREE.Mesh[] = [];
      for (let k = 0; k < 8; k++) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 10), new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
        scene.add(m);
        after.push(m);
      }
      const boltGeo = new THREE.BufferGeometry();
      boltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 3), 3));
      const bolt = new THREE.Line(boltGeo, new THREE.LineBasicMaterial({ color: 0xbfe8ff }));
      bolt.frustumCulled = false;
      scene.add(bolt);
      const boltGeo2 = boltGeo.clone();
      const bolt2 = new THREE.Line(boltGeo2, new THREE.LineBasicMaterial({ color: 0x5ab0ff }));
      bolt2.frustumCulled = false;
      scene.add(bolt2);
      const NP = 500;
      const sparks = new PointPool(NP);
      scene.add(sparks.obj);
      const sv = new Float32Array(NP * 3);
      const sl = new Float32Array(NP);
      let sNext = 0;
      const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(0.2), color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      scene.add(flash);
      type Sp = 'fire' | 'bolt' | 'ghost' | 'twist' | 'ult';
      const SPS: Sp[] = ['fire', 'bolt', 'ghost', 'twist', 'ult'];
      const NAME: Record<Sp, string> = { fire: '불꽃 강속구!', bolt: '번개 직구!', ghost: '도깨비 공!', twist: '회오리 볼!', ult: '필살! 무지개 유성구!' };
      const COL: Record<Sp, number> = { fire: 0xff7a1a, bolt: 0x8ad8ff, ghost: 0xb06aff, twist: 0x4af0e0, ult: 0xffffff };
      const cut: Record<string, THREE.Sprite> = {};
      for (const s of SPS) {
        const sp = textSprite(NAME[s], { size: 72, color: '#ffffff', stroke: '#10142e', font: 'title', bg: `#${new THREE.Color(COL[s]).multiplyScalar(s === 'ult' ? 0.9 : 0.7).getHexString()}`, h: 0.62 });
        sp.visible = false;
        scene.add(sp);
        cut[s] = sp;
      }
      const from = new THREE.Vector3(0, 1.9, -21);
      const to = new THREE.Vector3(0, 1.2, 1.4);
      const ctrl = new THREE.Vector3(0, 2.6, -10);
      const dir = to.clone().sub(from).normalize();
      const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
      const up = new THREE.Vector3().crossVectors(side, dir).normalize();
      const DUR = 2.3;
      let showAfter = true;
      let showBolt = true;
      const c = new THREE.Color();
      const pathAt = (sp: Sp, k: number, out: THREE.Vector3): THREE.Vector3 => {
        const e = sp === 'ult' ? k * k : k * k * k * 0.6 + k * 0.4;
        out.copy(from).multiplyScalar((1 - e) * (1 - e)).addScaledVector(ctrl, 2 * (1 - e) * e).addScaledVector(to, e * e);
        if (sp === 'bolt') out.addScaledVector(side, (Math.abs(((k * 5) % 2) - 1) * 2 - 1) * 1.1 * (1 - k));
        if (sp === 'twist') {
          const th = k * Math.PI * 7;
          out.addScaledVector(side, Math.cos(th) * 1.5 * (1 - k)).addScaledVector(up, Math.sin(th) * 1.5 * (1 - k));
        }
        if (sp === 'ghost') out.addScaledVector(side, Math.sin(k * Math.PI * 3) * 1.6 * (1 - k));
        return out;
      };
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      return {
        scene,
        camera: cam,
        resize(_w, h) {
          sparks.resize(h);
        },
        update(t, dt) {
          dt = Math.min(dt, 0.05);
          const idx = Math.floor(t / DUR) % SPS.length;
          const sp = SPS[idx]!;
          const lt = t % DUR;
          const col = COL[sp];
          // 컷인 띠 — 화면을 가르며 지나감
          for (const s of SPS) cut[s]!.visible = false;
          const ci = cut[sp]!;
          if (lt < 0.95) {
            ci.visible = true;
            const k = lt / 0.95;
            const x = k < 0.25 ? lerp(-7, 0, easeOut(k / 0.25)) : k < 0.75 ? lerp(0, -0.3, (k - 0.25) / 0.5) : lerp(-0.3, 7, ease((k - 0.75) / 0.25));
            ci.position.set(cam.position.x + x * 0.5 - 0.3, 2.55, 1.0);
            (ci.material as THREE.SpriteMaterial).opacity = 1;
          }
          const k = (lt - 0.35) / 1.15;
          const hue = (t * 1.5) % 1;
          if (sp === 'ult') c.setHSL(hue, 1, 0.6);
          else c.setHex(col);
          ballMat.emissive.copy(c);
          if (k >= 0 && k < 1) {
            pathAt(sp, k, a);
            ball.position.copy(a);
            ball.visible = !(sp === 'ghost' && k > 0.38 && k < 0.7);
            const sc = sp === 'ult' ? 1.8 - 0.6 * k : 1.3 - 0.4 * k;
            ball.scale.setScalar(sc);
            after.forEach((m, ai) => {
              const kk = Math.max(0, k - (ai + 1) * 0.045);
              pathAt(sp, kk, b);
              if (sp === 'ghost') b.addScaledVector(side, (ai % 2 ? 0.5 : -0.5) * (1 - kk));
              m.position.copy(b);
              m.scale.setScalar(sc * (1 - ai * 0.06));
              m.visible = showAfter && kk > 0;
              const mm = m.material as THREE.MeshBasicMaterial;
              if (sp === 'ult') mm.color.setHSL((hue + ai * 0.12) % 1, 1, 0.6);
              else mm.color.setHex(col);
              mm.opacity = 0.55 * (1 - ai / 8);
            });
            // 불똥
            const emit = sp === 'fire' || sp === 'ult' ? 10 : 5;
            for (let e = 0; e < emit; e++) {
              const i = sNext;
              sNext = (sNext + 1) % NP;
              sl[i] = 0.5 + Math.random() * 0.3;
              sparks.pos[i * 3] = a.x + (Math.random() - 0.5) * 0.3;
              sparks.pos[i * 3 + 1] = a.y + (Math.random() - 0.5) * 0.3;
              sparks.pos[i * 3 + 2] = a.z + (Math.random() - 0.5) * 0.3;
              sv[i * 3] = (Math.random() - 0.5) * 1.5;
              sv[i * 3 + 1] = (Math.random() - 0.2) * (sp === 'fire' ? 3 : 1.5);
              sv[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
              const cc = sp === 'ult' ? new THREE.Color().setHSL(Math.random(), 1, 0.6) : c;
              sparks.col[i * 3] = cc.r;
              sparks.col[i * 3 + 1] = cc.g;
              sparks.col[i * 3 + 2] = cc.b;
              sparks.size[i] = 0.12 + Math.random() * 0.14;
            }
            // 번개 줄기
            const showB = showBolt && (sp === 'bolt' || sp === 'ult') && Math.random() < 0.85;
            bolt.visible = bolt2.visible = showB;
            if (showB) {
              for (const L of [bolt, bolt2]) {
                const arr = (L.geometry.attributes['position'] as THREE.BufferAttribute).array as Float32Array;
                const st = Math.max(0, k - 0.35);
                for (let q = 0; q < 24; q++) {
                  pathAt(sp, lerp(st, k, q / 23), b);
                  if (q > 0 && q < 23) b.addScaledVector(side, (Math.random() - 0.5) * 0.7).addScaledVector(up, (Math.random() - 0.5) * 0.7);
                  arr[q * 3] = b.x;
                  arr[q * 3 + 1] = b.y;
                  arr[q * 3 + 2] = b.z;
                }
                L.geometry.attributes['position']!.needsUpdate = true;
              }
            }
            flash.visible = false;
          } else {
            ball.visible = false;
            bolt.visible = bolt2.visible = false;
            for (const m of after) m.visible = false;
            const fk = (lt - 1.5) / 0.5;
            flash.visible = fk >= 0 && fk < 1;
            if (flash.visible) {
              flash.position.copy(to);
              flash.scale.setScalar(1 + fk * 4);
              flash.material.color.copy(c);
              flash.material.opacity = 1 - fk;
            }
          }
          for (let i = 0; i < NP; i++) {
            if (sl[i]! <= 0) {
              sparks.alpha[i] = 0;
              continue;
            }
            sl[i] = sl[i]! - (dt);
            for (let q = 0; q < 3; q++) sparks.pos[i * 3 + q] = sparks.pos[i * 3 + q]! + (sv[i * 3 + q]! * dt);
            sv[i * 3 + 1] = sv[i * 3 + 1]! - (3 * dt);
            sparks.alpha[i] = clamp(sl[i]! / 0.5, 0, 1);
          }
          sparks.flush();
        },
        controls: [
          { type: 'toggle', label: '잔상', value: true, on: (v) => (showAfter = v) },
          { type: 'toggle', label: '번개 줄기', value: true, on: (v) => (showBolt = v) },
        ],
        dispose() {
          disposeScene(scene);
          (scene.background as THREE.Texture).dispose();
        },
      };
    },
  },

  /* ───── u38 만화 연출 층 ───── */
  u38: {
    kind: 'dom',
    caption: '3D 판 위에 HTML 층 — 집중선 · 컷인 띠 · 스트라이크 딱지 · 별 터짐 「홈런!」 · 종이 꽃가루 (숫자 야구 ballfx.css 그대로)',
    make(box) {
      const wrap = document.createElement('div');
      wrap.style.cssText =
        'position:absolute;inset:0;overflow:hidden;background:radial-gradient(ellipse 80% 60% at 50% 110%, #2f8a44 0 38%, transparent 39%),radial-gradient(circle at 20% 15%, rgba(255,255,230,.5), transparent 12%),radial-gradient(circle at 80% 15%, rgba(255,255,230,.5), transparent 12%),linear-gradient(#081030,#1e2c66 70%,#2a3a70)';
      const ballEl = document.createElement('div');
      ballEl.style.cssText = 'position:absolute;left:50%;top:52%;width:9%;aspect-ratio:1;border-radius:50%;transform:translate(-50%,-50%);background:radial-gradient(circle at 35% 30%,#fff,#e8e2d4 60%,#b8ae9a);box-shadow:0 0 18px rgba(255,255,255,.6)';
      const fx = document.createElement('div');
      fx.className = 'nb-fx';
      fx.innerHTML = '<div class="nb-speed"></div><div class="nb-flash"></div><div class="nb-comic"></div>';
      wrap.append(ballEl, fx);
      box.appendChild(wrap);
      const speed = fx.querySelector('.nb-speed') as HTMLElement;
      const flashEl = fx.querySelector('.nb-flash') as HTMLElement;
      const comic = fx.querySelector('.nb-comic') as HTMLElement;
      const burst = (spikes: number, outer: number, inner: number): string => {
        const pts: string[] = [];
        for (let k = 0; k < spikes * 2; k++) {
          const a = (k / (spikes * 2)) * TAU - Math.PI / 2;
          const r = k % 2 ? inner : outer * (0.9 + ((k * 37) % 10) / 100);
          pts.push(`${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`);
        }
        return pts.join(' ');
      };
      const temp: { el: HTMLElement; until: number }[] = [];
      let now = 0;
      const add = (el: HTMLElement, life: number): void => {
        fx.appendChild(el);
        temp.push({ el, until: now + life });
      };
      const showComic = (kind: 'hr' | 'out' | 'hit', s: string): void => {
        comic.className = `nb-comic ${kind}`;
        comic.innerHTML = `<svg viewBox="-100 -100 200 200" aria-hidden="true"><polygon points="${burst(kind === 'hr' ? 24 : 18, 98, kind === 'hr' ? 62 : 70)}"/><polygon class="in" points="${burst(kind === 'hr' ? 24 : 18, 80, kind === 'hr' ? 52 : 58)}"/></svg><b>${s}</b>`;
        void comic.offsetWidth;
        comic.classList.add('on');
      };
      const flash = (strong: boolean): void => {
        flashEl.className = 'nb-flash';
        void flashEl.offsetWidth;
        flashEl.className = `nb-flash on${strong ? ' strong' : ''}`;
      };
      const tag = (s: string, kind: 'S' | 'B' | 'X', x: number, y: number): void => {
        const el = document.createElement('div');
        el.className = `nb-tag ${kind} big`;
        el.textContent = s;
        el.style.left = `${x}%`;
        el.style.top = `${y}%`;
        add(el, 1.35);
      };
      const SP = ['fire', 'bolt', 'ghost', 'twist', 'ult'] as const;
      const SPN = { fire: '불꽃 강속구!', bolt: '번개 직구!', ghost: '도깨비 공!', twist: '회오리 볼!', ult: '필살! 무지개 유성구!' };
      let round = 0;
      let phase = -1;
      let disposed = false;
      const LOOP = 7.2;
      return {
        update(t) {
          now = t;
          const W = box.clientWidth;
          const H = box.clientHeight;
          fx.style.setProperty('--fw', `${W}px`);
          fx.style.setProperty('--fh', `${H}px`);
          fx.style.setProperty('--cx', '50%');
          fx.style.setProperty('--cy', '52%');
          const lt = t % LOOP;
          const r = Math.floor(t / LOOP);
          if (r !== round) {
            round = r;
            phase = -1;
          }
          const ph = lt < 1.3 ? 0 : lt < 2.5 ? 1 : lt < 5.0 ? 2 : 3;
          // 공 — 다가오며 커짐
          const bk = lt < 1.3 ? lt / 1.3 : 1;
          ballEl.style.width = `${4 + bk * 10}%`;
          ballEl.style.opacity = ph >= 2 ? '0' : '1';
          if (ph !== phase) {
            phase = ph;
            const sp = SP[round % SP.length]!;
            if (ph === 0) {
              comic.className = 'nb-comic';
              speed.className = `nb-speed on burst ${sp}`;
              const el = document.createElement('div');
              el.className = `nb-cutin ${sp}`;
              const b = document.createElement('b');
              b.textContent = SPN[sp];
              el.appendChild(b);
              add(el, sp === 'ult' ? 1.3 : 0.9);
            } else if (ph === 1) {
              speed.className = 'nb-speed on';
              flash(false);
              tag('스트라이크!', 'S', 50, 40);
              window.setTimeout(() => !disposed && tag('볼!', 'B', 30, 60), 380);
            } else if (ph === 2) {
              speed.className = 'nb-speed on burst gold rainbow';
              flash(true);
              showComic('hr', '홈런!');
              const cf = document.createElement('div');
              cf.className = 'nb-confetti';
              const cols = ['#ff5a7a', '#ffd23a', '#5ab8ff', '#7ae08a', '#ff9a3a', '#c08aff', '#ffffff'];
              for (let k = 0; k < 60; k++) {
                const i = document.createElement('i');
                i.style.left = `${Math.random() * 100}%`;
                i.style.background = cols[k % cols.length]!;
                i.style.width = `${Math.max(5, W / 90)}px`;
                i.style.height = `${Math.max(8, W / 55)}px`;
                i.style.animationDelay = `${Math.random() * 0.7}s`;
                i.style.animationDuration = `${1.6 + Math.random() * 1.2}s`;
                i.style.setProperty('--dx', `${(Math.random() - 0.5) * W * 0.3}px`);
                i.style.setProperty('--r', `${Math.random() * 1080 - 540}deg`);
                cf.appendChild(i);
              }
              add(cf, 3);
            } else {
              speed.className = 'nb-speed';
              showComic('out', '삼진 아웃!');
            }
          }
          for (let i = temp.length - 1; i >= 0; i--)
            if (temp[i]!.until < t) {
              temp[i]!.el.remove();
              temp.splice(i, 1);
            }
        },
        dispose() {
          disposed = true;
          wrap.remove();
        },
      };
    },
  },

  /* ───── u39 도장 · 흔들림 · 시차 ───── */
  u39: {
    kind: 'dom',
    caption: '왼쪽: 판정 도장이 위에서 쾅 — 종이가 흔들리고 잉크가 번져요 · 오른쪽: 마우스(없으면 저절로)를 따라 겹마다 다르게 움직이는 시차 제목',
    make(box) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:absolute;inset:0;display:grid;grid-template-columns:1fr 1fr;overflow:hidden;container-type:size;font-family:' + FONT;
      // 왼쪽: 책상 + 서류 + 도장
      const desk = document.createElement('div');
      desk.style.cssText = 'position:relative;overflow:hidden;background:repeating-linear-gradient(95deg,#8a5a34 0 7cqw,#7a4e2c 7cqw 9cqw,#94643c 9cqw 15cqw),#8a5a34';
      const paper = document.createElement('div');
      paper.style.cssText =
        'position:absolute;left:10%;top:9%;width:80%;height:82%;background:#fbf6e8;border-radius:4px;box-shadow:0 6px 14px rgba(0,0,0,.35);transform:rotate(-3deg);background-image:repeating-linear-gradient(#fbf6e8 0 7cqh,#e2dccb 7cqh calc(7cqh + 1px));';
      paper.innerHTML =
        '<div style="position:absolute;left:8%;top:6%;font:800 5cqh/1 ' + TITLE.replace(/"/g, "'") + ';color:#2a2a40">전단 검사서</div><div style="position:absolute;left:8%;top:20%;width:60%;height:2.5cqh;background:#d8cfb6;border-radius:2px"></div><div style="position:absolute;left:8%;top:28%;width:48%;height:2.5cqh;background:#d8cfb6;border-radius:2px"></div><div style="position:absolute;left:8%;top:36%;width:55%;height:2.5cqh;background:#d8cfb6;border-radius:2px"></div>';
      const ink = document.createElement('div');
      ink.style.cssText = 'position:absolute;left:50%;top:62%;width:52%;aspect-ratio:1;transform:translate(-50%,-50%);border-radius:50%;opacity:0';
      const stamp = document.createElement('div');
      stamp.style.cssText = 'position:absolute;left:50%;top:62%;width:46%;aspect-ratio:1;transform:translate(-50%,-50%)';
      const svgOf = (word: string, color: string): string =>
        `<svg viewBox="0 0 100 100" width="100%" height="100%"><g fill="none" stroke="${color}"><circle cx="50" cy="50" r="45" stroke-width="5"/><circle cx="50" cy="50" r="37" stroke-width="2"/></g><text x="50" y="52" text-anchor="middle" dominant-baseline="middle" font-family="'Black Han Sans',sans-serif" font-size="30" fill="${color}">${word}</text><text x="50" y="22" text-anchor="middle" font-size="8" font-weight="800" fill="${color}" font-family="Pretendard,sans-serif">검 문 소</text></svg>`;
      const WORDS: [string, string][] = [
        ['반려', '#d8283a'],
        ['통과', '#1a9a4a'],
        ['보류', '#e08a1a'],
      ];
      paper.append(ink, stamp);
      desk.appendChild(paper);
      // 오른쪽: 시차 층
      const par = document.createElement('div');
      par.style.cssText = 'position:relative;overflow:hidden;background:linear-gradient(#ffb36a,#ff7a8a 45%,#6a4aa0)';
      const layer = (html: string, css: string): HTMLElement => {
        const d = document.createElement('div');
        d.style.cssText = 'position:absolute;inset:-12%;will-change:transform;' + css;
        d.innerHTML = html;
        par.appendChild(d);
        return d;
      };
      const L0 = layer('<div style="position:absolute;left:62%;top:24%;width:18%;aspect-ratio:1;border-radius:50%;background:radial-gradient(#fff6c8,#ffd25a 60%,rgba(255,210,90,0) 72%)"></div>', '');
      const L1 = layer(
        '<svg viewBox="0 0 200 100" preserveAspectRatio="none" style="position:absolute;left:0;bottom:22%;width:100%;height:40%"><path d="M0 100 L0 60 L30 30 L55 55 L85 15 L120 58 L150 28 L200 62 L200 100Z" fill="#8a5ab0"/></svg>',
        '',
      );
      const L2 = layer(
        '<svg viewBox="0 0 200 100" preserveAspectRatio="none" style="position:absolute;left:0;bottom:6%;width:100%;height:36%"><path d="M0 100 L0 70 L20 70 L20 50 L40 50 L40 64 L70 64 L70 36 L84 28 L98 36 L98 66 L130 66 L130 46 L160 46 L160 70 L200 70 L200 100Z" fill="#3a2a60"/><rect x="74" y="44" width="5" height="6" fill="#ffe08a"/><rect x="88" y="44" width="5" height="6" fill="#ffe08a"/><rect x="138" y="54" width="5" height="6" fill="#ffe08a"/></svg>',
        '',
      );
      const L3 = layer(
        `<div style="position:absolute;inset:0;display:grid;place-items:center"><div style="text-align:center;transform:rotate(-4deg)"><div style="font:400 8.5cqh/1 ${TITLE.replace(/"/g, "'")};color:#ffe58a;-webkit-text-stroke:0.8cqh #2a1440;paint-order:stroke fill;text-shadow:0 1cqh 0 #2a1440">수학 검문소</div><div style="margin-top:2cqh;font:800 3cqh/1 ${FONT.replace(/"/g, "'")};color:#fff;letter-spacing:.2em">MATH CHECKPOINT</div></div></div>`,
        '',
      );
      wrap.append(desk, par);
      box.appendChild(wrap);
      let mx = 0;
      let my = 0;
      let lastMove = -10;
      let tt = 0;
      const onMove = (e: PointerEvent): void => {
        const r = par.getBoundingClientRect();
        mx = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
        my = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
        lastMove = tt;
      };
      par.addEventListener('pointermove', onMove);
      let shakeAmt = 1;
      let cur = -1;
      return {
        update(t) {
          tt = t;
          // 도장
          const P = 2.4;
          const k = t % P;
          const n = Math.floor(t / P);
          if (n !== cur) {
            cur = n;
            const [w, c] = WORDS[n % WORDS.length]!;
            stamp.innerHTML = svgOf(w, c);
            ink.style.background = `radial-gradient(circle, ${c}22, ${c}00 70%)`;
          }
          const drop = 0.32;
          if (k < drop) {
            const q = k / drop;
            const s = lerp(2.8, 1, q * q);
            stamp.style.transform = `translate(-50%,-50%) scale(${s}) rotate(${lerp(-24, -9, q)}deg)`;
            stamp.style.opacity = String(clamp(q * 2, 0, 0.95));
            stamp.style.filter = `blur(${(1 - q) * 3}px) drop-shadow(0 ${(1 - q) * 30}px 10px rgba(0,0,0,.4))`;
            paper.style.transform = 'rotate(-3deg)';
            ink.style.opacity = '0';
          } else {
            const q = (k - drop) / 0.5;
            const amp = q < 1 ? (1 - q) * 6 * shakeAmt : 0;
            const sx = Math.sin(k * 90) * amp;
            const sy = Math.cos(k * 70) * amp * 0.7;
            const sq = q < 0.25 ? 1 - Math.sin((q / 0.25) * Math.PI) * 0.08 : 1;
            stamp.style.transform = `translate(-50%,-50%) scale(${sq}) rotate(-9deg)`;
            stamp.style.opacity = k > P - 0.25 ? String(((P - k) / 0.25) * 0.95) : '0.95';
            stamp.style.filter = 'none';
            paper.style.transform = `translate(${sx}px,${sy}px) rotate(${-3 + sx * 0.15}deg)`;
            ink.style.opacity = String(clamp(1 - q * 0.5, 0.4, 1) * (k > P - 0.25 ? (P - k) / 0.25 : 1));
            ink.style.transform = `translate(-50%,-50%) scale(${0.6 + easeOut(q) * 0.6})`;
          }
          // 시차
          let x = mx;
          let y = my;
          if (t - lastMove > 1.5) {
            x = Math.sin(t * 0.8);
            y = Math.sin(t * 1.1) * 0.6;
          }
          const W = par.clientWidth;
          [L0, L1, L2, L3].forEach((el, i) => {
            const f = [0.02, 0.05, 0.09, 0.14][i]! * W;
            el.style.transform = `translate(${-x * f}px, ${-y * f * 0.6}px)`;
          });
        },
        controls: [{ type: 'range', label: '흔들림 세기', min: 0, max: 3, step: 0.1, value: 1, on: (v) => (shakeAmt = v) }],
        dispose() {
          par.removeEventListener('pointermove', onMove);
          wrap.remove();
        },
      };
    },
  },

  /* ───── u48 Box2D (planck) ───── */
  u48: {
    kind: '2d',
    caption: '진짜 planck(Box2D) — 중력 -9.81 · 0.02초 · 반복 8/3. 관절로 이은 진자 사슬, 떨어지는 상자 · 공, 들어오면 켜지는 센서',
    make() {
      interface Item {
        b: PBody;
        kind: 'box' | 'ball' | 'link';
        hx: number;
        hy: number;
        col: string;
      }
      let world!: World;
      let items: Item[] = [];
      let sensor!: PBody;
      let bob!: PBody;
      let grav = -9.81;
      const COLS = ['#ff6a7a', '#ffd23a', '#5ab8ff', '#7ae08a', '#c08aff', '#ff9a4a'];
      const r = rng(11);
      const build = (): void => {
        world = new World({ gravity: { x: 0, y: grav } });
        items = [];
        const ground = world.createBody();
        ground.createFixture({ shape: new Box(8.4, 0.3, { x: 0, y: -0.3 }, 0), friction: 0.6 });
        ground.createFixture({ shape: new Box(0.2, 6, { x: -8.2, y: 5.5 }, 0), friction: 0.6 });
        ground.createFixture({ shape: new Box(0.2, 6, { x: 8.2, y: 5.5 }, 0), friction: 0.6 });
        ground.createFixture({ shape: new Box(2.4, 0.12, { x: -4, y: 4 }, -0.32), friction: 0.3 });
        let prev: PBody = ground;
        const ax = 2.2;
        const ay = 9.6;
        for (let i = 0; i < 6; i++) {
          const y = ay - 0.25 - i * 0.5;
          const b = world.createDynamicBody({ position: { x: ax, y } });
          b.createFixture({ shape: new Box(0.08, 0.25), density: 2, friction: 0.6 });
          world.createJoint(new RevoluteJoint({}, prev, b, { x: ax, y: y + 0.25 }));
          items.push({ b, kind: 'link', hx: 0.08, hy: 0.25, col: '#e8e4f8' });
          prev = b;
        }
        bob = world.createDynamicBody({ position: { x: ax, y: ay - 3 - 0.45 } });
        bob.createFixture({ shape: new Circle(0.45), density: 4, friction: 0.6 });
        world.createJoint(new RevoluteJoint({}, prev, bob, { x: ax, y: ay - 3 }));
        items.push({ b: bob, kind: 'ball', hx: 0.45, hy: 0.45, col: '#ff8a3a' });
        bob.setLinearVelocity({ x: 9, y: 0 });
        sensor = world.createBody({ position: { x: 6.3, y: 1.1 } });
        sensor.createFixture({ shape: new Box(1.6, 1.1), isSensor: true });
      };
      build();
      let acc = 0;
      let spawnT = 0;
      let kickT = 0;
      const drops: Item[] = [];
      return {
        draw(g, w, h, _t, dt) {
          dt = Math.min(dt, 0.1);
          acc += dt;
          let n = 0;
          while (acc >= 0.02 && n < 4) {
            world.step(0.02, 8, 3);
            acc -= 0.02;
            n++;
          }
          if (n === 4) acc = 0;
          spawnT += dt;
          kickT += dt;
          if (spawnT > 0.5) {
            spawnT = 0;
            const ball = r() < 0.45;
            const hx = 0.25 + r() * 0.3;
            const hy = ball ? hx : 0.2 + r() * 0.3;
            const b = world.createDynamicBody({ position: { x: -6.5 + r() * 13.5, y: 11 }, angle: r() * 3 });
            b.createFixture({ shape: ball ? new Circle(hx) : new Box(hx, hy), density: 1, friction: 0.6, restitution: ball ? 0.35 : 0.05 });
            const it: Item = { b, kind: ball ? 'ball' : 'box', hx, hy, col: COLS[Math.floor(r() * COLS.length)]! };
            items.push(it);
            drops.push(it);
            if (drops.length > 26) {
              const old = drops.shift()!;
              world.destroyBody(old.b);
              items.splice(items.indexOf(old), 1);
            }
          }
          if (kickT > 5) {
            kickT = 0;
            const v = bob.getLinearVelocity();
            bob.setLinearVelocity({ x: v.x + (v.x >= 0 ? 6 : -6), y: v.y });
          }
          // 그리기
          bg(g, w, h, '#18245a', '#3a5aa0');
          const s = Math.min(w / 17.6, h / 11.8);
          const ox = w / 2;
          const oy = h / 2 + 5.2 * s;
          const X = (x: number): number => ox + x * s;
          const Y = (y: number): number => oy - y * s;
          g.lineWidth = Math.max(1, s * 0.05);
          g.strokeStyle = '#10142e';
          // 바닥 · 벽 · 경사
          g.fillStyle = '#6a7ab8';
          g.fillRect(X(-8.4), Y(0), 16.8 * s, 0.6 * s);
          g.fillRect(X(-8.4), Y(11.5), 0.4 * s, 11.5 * s);
          g.fillRect(X(7.99), Y(11.5), 0.4 * s, 11.5 * s);
          g.save();
          g.translate(X(-4), Y(4));
          g.rotate(0.32);
          g.fillRect(-2.4 * s, -0.12 * s, 4.8 * s, 0.24 * s);
          g.restore();
          // 센서
          let inside = 0;
          for (let ce = sensor.getContactList(); ce; ce = ce.next ?? null) if (ce.contact.isTouching()) inside++;
          g.save();
          g.setLineDash([s * 0.2, s * 0.15]);
          g.strokeStyle = inside ? '#7affa0' : 'rgba(255,255,255,0.6)';
          g.fillStyle = inside ? 'rgba(122,255,160,0.28)' : 'rgba(255,255,255,0.06)';
          g.fillRect(X(4.7), Y(2.2), 3.2 * s, 2.2 * s);
          g.strokeRect(X(4.7), Y(2.2), 3.2 * s, 2.2 * s);
          g.restore();
          text(g, `센서 ${inside}`, X(6.3), Y(2.6), clamp(s * 0.42, 9, 22), inside ? '#7affa0' : '#dfe6ff', 'center', FONT, '800');
          // 물체
          for (const it of items) {
            const p = it.b.getPosition();
            g.save();
            g.translate(X(p.x), Y(p.y));
            g.rotate(-it.b.getAngle());
            g.fillStyle = it.col;
            g.strokeStyle = '#10142e';
            g.lineWidth = Math.max(1, s * 0.05);
            if (it.kind === 'ball') {
              g.beginPath();
              g.arc(0, 0, it.hx * s, 0, TAU);
              g.fill();
              g.stroke();
              g.beginPath();
              g.moveTo(0, 0);
              g.lineTo(it.hx * s, 0);
              g.stroke();
            } else {
              g.beginPath();
              g.roundRect(-it.hx * s, -it.hy * s, it.hx * 2 * s, it.hy * 2 * s, Math.min(it.hx, it.hy) * s * 0.3);
              g.fill();
              g.stroke();
            }
            g.restore();
          }
          // 관절 점
          g.fillStyle = '#ffd23a';
          for (let j = world.getJointList(); j; j = j.getNext()) {
            const a = j.getAnchorA();
            g.beginPath();
            g.arc(X(a.x), Y(a.y), Math.max(2, s * 0.09), 0, TAU);
            g.fill();
          }
          text(g, '관절 (RevoluteJoint)', X(2.2) + s * 0.4, Y(9.75), clamp(s * 0.36, 8, 18), '#ffe58a', 'left', FONT, '800');
        },
        controls: [
          {
            type: 'range',
            label: '중력 (m/s²)',
            min: -20,
            max: 0,
            step: 0.5,
            value: -9.81,
            on: (v) => {
              grav = v;
              world.setGravity({ x: 0, y: v });
            },
          },
          {
            type: 'button',
            label: '처음부터',
            on: () => {
              drops.length = 0;
              build();
            },
          },
        ],
      };
    },
  },

  /* ───── u49 matter.js ───── */
  u49: {
    kind: '2d',
    caption: 'matter.js 로 과일 합치기 — 같은 과일 둘이 부딪히면 한 단계 큰 과일로 (충돌 이벤트)',
    make() {
      const engine = Matter.Engine.create({ gravity: { x: 0, y: 1, scale: 0.001 } });
      const W = 300;
      const H = 400;
      const st = { isStatic: true, friction: 0.3 };
      Matter.Composite.add(engine.world, [Matter.Bodies.rectangle(W / 2, H + 10, W + 60, 20, st), Matter.Bodies.rectangle(-10, H / 2, 20, H * 2, st), Matter.Bodies.rectangle(W + 10, H / 2, 20, H * 2, st)]);
      const R = [11, 15, 20, 26, 33, 41, 50, 60];
      const FRUIT = ['#ff3a4a', '#ff6a8a', '#9a5aff', '#ffb02a', '#ff7a1a', '#e8323a', '#ffe06a', '#ffa0b8'];
      const level = new Map<number, number>();
      const born = new Map<number, number>();
      const live = new Set<Matter.Body>();
      const pops: { x: number; y: number; r: number; t: number; c: string }[] = [];
      let merges: [Matter.Body, Matter.Body][] = [];
      const add = (x: number, y: number, lv: number): void => {
        const b = Matter.Bodies.circle(x, y, R[lv]!, { restitution: 0.15, friction: 0.15, density: 0.001 });
        level.set(b.id, lv);
        born.set(b.id, now);
        live.add(b);
        Matter.Composite.add(engine.world, b);
      };
      const onCol = (ev: Matter.IEventCollision<Matter.Engine>): void => {
        for (const p of ev.pairs) {
          const a = p.bodyA;
          const b = p.bodyB;
          if (!live.has(a) || !live.has(b)) continue;
          if (level.get(a.id) === level.get(b.id) && !merges.some((m) => m.includes(a) || m.includes(b))) merges.push([a, b]);
        }
      };
      Matter.Events.on(engine, 'collisionStart', onCol);
      Matter.Events.on(engine, 'collisionActive', onCol);
      const r = rng(5);
      let spawnT = 0;
      let next = 0;
      let dropX = W / 2;
      let fade = 0;
      let now = 0;
      return {
        draw(g, w, h, t, dt) {
          now = t;
          dt = Math.min(dt, 0.05);
          spawnT += dt;
          dropX = W / 2 + Math.sin(t * 1.3) * (W / 2 - 40);
          if (spawnT > 0.55 && fade === 0) {
            spawnT = 0;
            add(dropX, 30, next);
            next = Math.floor(r() * r() * 4);
          }
          Matter.Engine.update(engine, Math.min(dt * 1000, 33));
          for (const [a, b] of merges) {
            if (!live.has(a) || !live.has(b)) continue;
            const lv = level.get(a.id)!;
            Matter.Composite.remove(engine.world, a);
            Matter.Composite.remove(engine.world, b);
            live.delete(a);
            live.delete(b);
            const x = (a.position.x + b.position.x) / 2;
            const y = (a.position.y + b.position.y) / 2;
            pops.push({ x, y, r: R[Math.min(lv + 1, R.length - 1)]!, t: now, c: FRUIT[Math.min(lv + 1, R.length - 1)]! });
            if (lv + 1 < R.length) add(x, y, lv + 1);
          }
          merges = [];
          // 가득 차면 비우기
          let high = false;
          for (const b of live) if (now - (born.get(b.id) ?? now) > 2 && b.position.y - (b.circleRadius ?? 0) < 70 && Math.abs(b.velocity.y) < 0.3) high = true;
          if ((high || live.size > 48) && fade === 0) fade = 0.0001;
          if (fade > 0) {
            fade += dt;
            if (fade > 0.8) {
              for (const b of live) Matter.Composite.remove(engine.world, b);
              live.clear();
              fade = 0;
            }
          }
          // 그리기
          bg(g, w, h, '#ffe9c4', '#ffc6a0');
          const s = Math.min(w / (W + 40), h / (H + 70));
          g.save();
          g.translate(w / 2 - (W / 2) * s, h - (H + 14) * s);
          g.scale(s, s);
          // 병
          g.fillStyle = 'rgba(255,255,255,0.45)';
          g.beginPath();
          g.roundRect(-8, 50, W + 16, H - 42, 18);
          g.fill();
          g.strokeStyle = '#a0603a';
          g.lineWidth = 5;
          g.beginPath();
          g.moveTo(-8, 50);
          g.lineTo(-8, H + 8);
          g.lineTo(W + 8, H + 8);
          g.lineTo(W + 8, 50);
          g.stroke();
          g.setLineDash([8, 8]);
          g.strokeStyle = 'rgba(255,80,80,0.5)';
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(0, 70);
          g.lineTo(W, 70);
          g.stroke();
          g.setLineDash([]);
          // 다음 과일
          g.globalAlpha = 0.85;
          fruit(g, dropX, 18, R[next]!, FRUIT[next]!, 0);
          g.globalAlpha = 1 - clamp(fade / 0.8, 0, 1);
          for (const b of live) fruit(g, b.position.x, b.position.y, b.circleRadius ?? 10, FRUIT[level.get(b.id) ?? 0]!, b.angle);
          g.globalAlpha = 1;
          for (let i = pops.length - 1; i >= 0; i--) {
            const p = pops[i]!;
            const k = (now - p.t) / 0.45;
            if (k > 1) {
              pops.splice(i, 1);
              continue;
            }
            g.strokeStyle = p.c;
            g.globalAlpha = 1 - k;
            g.lineWidth = 4;
            g.beginPath();
            g.arc(p.x, p.y, p.r * (1 + k * 0.8), 0, TAU);
            g.stroke();
            for (let q = 0; q < 8; q++) {
              const a = (q / 8) * TAU;
              g.fillStyle = '#fff';
              g.beginPath();
              g.arc(p.x + Math.cos(a) * p.r * (1 + k * 1.2), p.y + Math.sin(a) * p.r * (1 + k * 1.2), 3, 0, TAU);
              g.fill();
            }
            g.globalAlpha = 1;
          }
          g.restore();
          function fruit(gg: CanvasRenderingContext2D, x: number, y: number, rr: number, c: string, ang: number): void {
            gg.save();
            gg.translate(x, y);
            gg.rotate(ang);
            gg.fillStyle = c;
            gg.strokeStyle = 'rgba(60,20,10,0.55)';
            gg.lineWidth = 2;
            gg.beginPath();
            gg.arc(0, 0, rr, 0, TAU);
            gg.fill();
            gg.stroke();
            gg.fillStyle = 'rgba(255,255,255,0.45)';
            gg.beginPath();
            gg.arc(-rr * 0.35, -rr * 0.4, rr * 0.28, 0, TAU);
            gg.fill();
            gg.fillStyle = '#3a1a10';
            gg.beginPath();
            gg.arc(-rr * 0.3, -rr * 0.02, rr * 0.09, 0, TAU);
            gg.arc(rr * 0.3, -rr * 0.02, rr * 0.09, 0, TAU);
            gg.fill();
            gg.beginPath();
            gg.lineWidth = Math.max(1.2, rr * 0.07);
            gg.strokeStyle = '#3a1a10';
            gg.arc(0, rr * 0.12, rr * 0.18, 0.15 * Math.PI, 0.85 * Math.PI);
            gg.stroke();
            gg.fillStyle = '#4a9a3a';
            gg.beginPath();
            gg.ellipse(rr * 0.15, -rr * 0.95, rr * 0.25, rr * 0.12, -0.5, 0, TAU);
            gg.fill();
            gg.restore();
          }
        },
        dispose() {
          Matter.Events.off(engine, 'collisionStart', onCol);
          Matter.Events.off(engine, 'collisionActive', onCol);
          Matter.Engine.clear(engine);
        },
      };
    },
  },

  /* ───── u50 Verlet 갈톤 ───── */
  u50: {
    kind: '2d',
    caption: '직접 짠 베를레 물리 — 구슬이 핀에 부딪혀 좌우로 갈리고, 아래 칸에 종 모양(이항분포)이 쌓여요',
    make() {
      const W = 300;
      const H = 390;
      const ROWS = 10;
      const D = 24;
      const RB = 4.3;
      const RP = 3;
      const pins: [number, number][] = [];
      for (let i = 0; i < ROWS; i++) for (let j = 0; j <= i + 1; j++) pins.push([W / 2 + (j - (i + 1) / 2) * D, 78 + i * 19]);
      const lastY = 78 + (ROWS - 1) * 19;
      const divX: number[] = [];
      for (let j = 0; j <= ROWS + 1; j++) divX.push(W / 2 + (j - (ROWS + 1) / 2) * D);
      const divTop = lastY + 16;
      const segs: [number, number, number, number][] = [
        [20, 6, W / 2 - 15, 50],
        [W - 20, 6, W / 2 + 15, 50],
        [20, -60, 20, 6],
        [W - 20, -60, W - 20, 6],
      ];
      for (const x of divX) segs.push([x, divTop, x, H]);
      const MAX = 180;
      const px = new Float32Array(MAX);
      const py = new Float32Array(MAX);
      const qx = new Float32Array(MAX);
      const qy = new Float32Array(MAX);
      let n = 0;
      let spawnT = 0;
      let doneT = 0;
      let tilt = 0;
      const r = rng(9);
      const step = (h: number): void => {
        const G = 1100;
        const gx = Math.sin(tilt) * G;
        const gy = Math.cos(tilt) * G;
        for (let i = 0; i < n; i++) {
          const vx = clamp((px[i]! - qx[i]!) * 0.999, -1.1, 1.1);
          const vy = clamp((py[i]! - qy[i]!) * 0.999, -0.4, 3);
          qx[i] = px[i]!;
          qy[i] = py[i]!;
          px[i] = px[i]! + vx + gx * h * h;
          py[i] = py[i]! + vy + gy * h * h;
        }
        for (let it = 0; it < 2; it++) {
          for (let i = 0; i < n; i++) {
            let x = px[i]!;
            let y = py[i]!;
            let hit = false;
            if (y > 60 && y < lastY + 12)
              for (const [cx, cy] of pins) {
                const dx = x - cx;
                const dy = y - cy;
                const d2 = dx * dx + dy * dy;
                const m = RB + RP;
                if (d2 < m * m && d2 > 1e-6) {
                  const d = Math.sqrt(d2);
                  const push = (m - d) / d;
                  x += dx * push + (r() - 0.5) * 0.3;
                  y += dy * push;
                  hit = true;
                }
              }
            if (hit) {
              qx[i] = x - (x - qx[i]!) * 0.62;
              qy[i] = y - (y - qy[i]!) * 0.62;
            }
            for (const [x1, y1, x2, y2] of segs) {
              const ex = x2 - x1;
              const ey = y2 - y1;
              const k = clamp(((x - x1) * ex + (y - y1) * ey) / (ex * ex + ey * ey), 0, 1);
              const cx = x1 + ex * k;
              const cy = y1 + ey * k;
              const dx = x - cx;
              const dy = y - cy;
              const d2 = dx * dx + dy * dy;
              if (d2 < (RB + 1) * (RB + 1) && d2 > 1e-6) {
                const d = Math.sqrt(d2);
                x += (dx / d) * (RB + 1 - d);
                y += (dy / d) * (RB + 1 - d);
              }
            }
            x = clamp(x, RB, W - RB);
            if (y > H - RB) {
              y = H - RB;
              qx[i] = qx[i]! + (x - qx[i]!) * 0.5;
            }
            px[i] = x;
            py[i] = y;
          }
          for (let i = 0; i < n; i++)
            for (let j = i + 1; j < n; j++) {
              const dx = px[j]! - px[i]!;
              const dy = py[j]! - py[i]!;
              const d2 = dx * dx + dy * dy;
              if (d2 < 4 * RB * RB && d2 > 1e-6) {
                const d = Math.sqrt(d2);
                const p = ((2 * RB - d) / d) * 0.5;
                px[i] = px[i]! - dx * p;
                py[i] = py[i]! - dy * p;
                px[j] = px[j]! + dx * p;
                py[j] = py[j]! + dy * p;
              }
            }
        }
      };
      // 이항분포 기대 개수
      const binom: number[] = [];
      const NB = ROWS + 1;
      for (let k = 0; k < NB; k++) {
        let c = 1;
        for (let q = 0; q < k; q++) c = (c * (ROWS - q)) / (q + 1);
        binom.push(c / Math.pow(2, ROWS));
      }
      return {
        draw(g, w, h, _t, dt) {
          dt = Math.min(dt, 1 / 30);
          spawnT += dt;
          if (n < MAX && spawnT > 0.13) {
            spawnT = 0;
            px[n] = W / 2 + (r() - 0.5) * 90;
            py[n] = 8;
            qx[n] = px[n]!;
            qy[n] = 8;
            n++;
          }
          if (n >= MAX) {
            doneT += dt;
            if (doneT > 2.5) {
              n = 0;
              doneT = 0;
            }
          }
          for (let s = 0; s < 3; s++) step(dt / 3);
          bg(g, w, h, '#2a1a5a', '#5a3a9a');
          const s = Math.min(w / (W + 30), h / (H + 24));
          g.save();
          g.translate(w / 2, h / 2);
          g.rotate(-tilt * 0.6);
          g.translate(-(W / 2) * s, -(H / 2) * s);
          g.scale(s, s);
          g.fillStyle = 'rgba(255,255,255,0.08)';
          g.beginPath();
          g.roundRect(0, 0, W, H, 12);
          g.fill();
          // 기대 곡선
          const area = Math.PI * RB * RB * 1.25;
          g.strokeStyle = 'rgba(255,230,120,0.75)';
          g.lineWidth = 2;
          g.setLineDash([5, 4]);
          g.beginPath();
          for (let k = 0; k < NB; k++) {
            const x0 = divX[k]!;
            const hh = (binom[k]! * MAX * area) / D;
            if (k === 0) g.moveTo(x0, H - hh);
            g.lineTo(x0 + D / 2, H - hh);
            g.lineTo(x0 + D, H - hh);
          }
          g.stroke();
          g.setLineDash([]);
          g.strokeStyle = '#ffd6f0';
          g.lineCap = 'round';
          g.lineWidth = 2.5;
          for (const [x1, y1, x2, y2] of segs) {
            if (y1 < 0) continue;
            g.beginPath();
            g.moveTo(x1, y1);
            g.lineTo(x2, y2);
            g.stroke();
          }
          g.fillStyle = '#ffe58a';
          for (const [x, y] of pins) {
            g.beginPath();
            g.arc(x, y, RP, 0, TAU);
            g.fill();
          }
          for (let i = 0; i < n; i++) {
            const hue = (i * 37) % 360;
            g.fillStyle = `hsl(${hue} 90% 66%)`;
            g.beginPath();
            g.arc(px[i]!, py[i]!, RB, 0, TAU);
            g.fill();
          }
          g.restore();
          const fs = clamp(h * 0.05, 10, 20);
          pill(g, `구슬 ${n}`, 10, fs * 1.3, fs, 'rgba(10,6,30,0.55)');
          if (Math.abs(tilt) > 0.01) pill(g, `기울기 ${Math.round((tilt * 180) / Math.PI)}°`, w - 10, fs * 1.3, fs, 'rgba(255,190,60,0.9)', '#2a1a00', 'right');
        },
        controls: [
          { type: 'range', label: '기울이기 (중력 방향°)', min: -20, max: 20, step: 1, value: 0, on: (v) => (tilt = (v * Math.PI) / 180) },
          { type: 'button', label: '다시 떨어뜨리기', on: () => (n = 0) },
        ],
      };
    },
  },

  /* ───── u51 기울이기 · 흔들기 ───── */
  u51: {
    kind: '2d',
    caption: '폰을 기울이면 화면 속 중력 방향이 바뀌어 구슬이 굴러요 · 흔들면 튀어요 — PC 는 방향키 · 누른 채 끌기로 같은 값을 줘요',
    make() {
      const balls = [0, 1, 2].map((i) => ({ x: 0.3 + i * 0.2, y: 0.5, vx: 0, vy: 0, c: ['#ff5a7a', '#ffd23a', '#5ab8ff'][i]! }));
      let shakeK = 1;
      return {
        draw(g, w, h, t, dt) {
          dt = Math.min(dt, 0.05);
          bg(g, w, h, '#cfeaff', '#9fd0f6');
          const cyc = t % 7;
          const shaking = cyc > 5.6 && cyc < 6.5;
          const a = Math.sin(t * 0.9) * 0.5 * (shaking ? 0.2 : 1);
          const jx = shaking ? Math.sin(t * 60) * 6 * shakeK : 0;
          const jy = shaking ? Math.cos(t * 47) * 4 * shakeK : 0;
          // 공 물리 — 폰 좌표 (0..1)
          const G = 2.4;
          const gx = Math.sin(a) * G;
          const gy = Math.cos(a) * G;
          const asp = 0.5;
          for (const b of balls) {
            b.vx += gx * dt;
            b.vy += gy * dt * asp;
            if (shaking && Math.random() < 0.25) {
              b.vx += (Math.random() - 0.5) * 3 * shakeK;
              b.vy += (Math.random() - 0.8) * 2 * shakeK;
            }
            b.vx *= 0.995;
            b.vy *= 0.995;
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            const rx = 0.09;
            const ry = rx * asp * 1.0;
            if (b.x < rx) (b.x = rx), (b.vx = -b.vx * 0.5);
            if (b.x > 1 - rx) (b.x = 1 - rx), (b.vx = -b.vx * 0.5);
            if (b.y < ry) (b.y = ry), (b.vy = -b.vy * 0.5);
            if (b.y > 1 - ry) (b.y = 1 - ry), (b.vy = -b.vy * 0.5);
          }
          for (let i = 0; i < balls.length; i++)
            for (let j = i + 1; j < balls.length; j++) {
              const A = balls[i]!;
              const B = balls[j]!;
              const dx = B.x - A.x;
              const dy = (B.y - A.y) / asp;
              const d = Math.hypot(dx, dy);
              if (d < 0.18 && d > 1e-4) {
                const p = (0.18 - d) / 2 / d;
                A.x -= dx * p;
                B.x += dx * p;
                A.y -= dy * p * asp;
                B.y += dy * p * asp;
              }
            }
          // 폰
          const cx = w * 0.32 + jx;
          const cy = h * 0.52 + jy;
          const ph = Math.min(h * 0.8, w * 0.32 * 2);
          const pw = ph * 0.5;
          g.save();
          g.translate(cx, cy);
          g.rotate(a);
          g.fillStyle = 'rgba(0,0,0,0.15)';
          g.beginPath();
          g.roundRect(-pw / 2 + 6, -ph / 2 + 8, pw, ph, pw * 0.16);
          g.fill();
          g.fillStyle = '#20243a';
          g.beginPath();
          g.roundRect(-pw / 2, -ph / 2, pw, ph, pw * 0.16);
          g.fill();
          const sx = -pw / 2 + pw * 0.07;
          const sy = -ph / 2 + ph * 0.06;
          const sw = pw * 0.86;
          const sh = ph * 0.88;
          const sg = g.createLinearGradient(0, sy, 0, sy + sh);
          sg.addColorStop(0, '#fff6dc');
          sg.addColorStop(1, '#ffe0b0');
          g.fillStyle = sg;
          g.beginPath();
          g.roundRect(sx, sy, sw, sh, pw * 0.08);
          g.fill();
          // 중력 화살표 (화면 속)
          g.save();
          g.translate(0, 0);
          g.rotate(-a);
          g.strokeStyle = 'rgba(120,80,40,0.35)';
          g.fillStyle = 'rgba(120,80,40,0.35)';
          g.lineWidth = pw * 0.05;
          g.beginPath();
          g.moveTo(0, -sh * 0.1);
          g.lineTo(0, sh * 0.16);
          g.stroke();
          g.beginPath();
          g.moveTo(-pw * 0.08, sh * 0.13);
          g.lineTo(pw * 0.08, sh * 0.13);
          g.lineTo(0, sh * 0.24);
          g.fill();
          g.restore();
          for (const b of balls) {
            g.fillStyle = b.c;
            g.beginPath();
            g.arc(sx + b.x * sw, sy + b.y * sh, sw * 0.09, 0, TAU);
            g.fill();
            g.fillStyle = 'rgba(255,255,255,0.6)';
            g.beginPath();
            g.arc(sx + b.x * sw - sw * 0.03, sy + b.y * sh - sw * 0.03, sw * 0.03, 0, TAU);
            g.fill();
          }
          g.restore();
          if (shaking) text(g, '흔들!', cx, cy - ph * 0.58, clamp(h * 0.09, 12, 40), '#ff4a6a', 'center', TITLE, '400');
          // 오른쪽: PC 대신 조작
          const fs = clamp(h * 0.055, 9, 20);
          const rx0 = w * 0.62;
          text(g, `기울기 ${Math.round((a * 180) / Math.PI)}°`, rx0 + w * 0.15, h * 0.16, fs * 1.2, '#20304a', 'center', FONT, '800');
          text(g, 'PC 에서는', rx0 + w * 0.15, h * 0.33, fs, '#40507a', 'center');
          const kw = Math.min(w * 0.085, h * 0.16);
          const key = (x: number, y: number, s: string, on: boolean): void => {
            g.fillStyle = on ? '#ffd23a' : '#ffffff';
            g.strokeStyle = '#20304a';
            g.lineWidth = 2;
            g.beginPath();
            g.roundRect(x - kw / 2, y - kw / 2, kw, kw, kw * 0.2);
            g.fill();
            g.stroke();
            text(g, s, x, y + 1, kw * 0.5, '#20304a', 'center', FONT, '900');
          };
          const ky = h * 0.5;
          const kx = rx0 + w * 0.15;
          key(kx - kw * 1.15, ky, '←', a < -0.08);
          key(kx, ky, '↓', false);
          key(kx + kw * 1.15, ky, '→', a > 0.08);
          // 마우스 끌기 그림
          const my = h * 0.78;
          const mx = kx + Math.sin(t * 0.9) * kw * 1.2;
          g.strokeStyle = 'rgba(32,48,74,0.5)';
          g.setLineDash([4, 4]);
          g.beginPath();
          g.moveTo(kx - kw * 1.3, my);
          g.lineTo(kx + kw * 1.3, my);
          g.stroke();
          g.setLineDash([]);
          g.fillStyle = '#fff';
          g.strokeStyle = '#20304a';
          g.beginPath();
          g.roundRect(mx - kw * 0.3, my - kw * 0.45, kw * 0.6, kw * 0.9, kw * 0.3);
          g.fill();
          g.stroke();
          g.beginPath();
          g.moveTo(mx, my - kw * 0.45);
          g.lineTo(mx, my - kw * 0.1);
          g.stroke();
          text(g, '누른 채 끌기', kx, my + kw * 0.75, fs * 0.85, '#40507a', 'center');
        },
        controls: [{ type: 'range', label: '흔들기 세기', min: 0, max: 3, step: 0.1, value: 1, on: (v) => (shakeK = v) }],
      };
    },
  },

  /* ───── i24 직접 만든 3D 강체 물리 ───── */
  i24: {
    kind: '3d',
    caption: '직접 만든 3D 강체 물리 — 주사위를 굴려 윗면 눈을 읽고, 나무 탑을 쌓아 공으로 무너뜨려요 (충격량 되풀이 · 마찰 · 잠자기)',
    make: () => makeRigidDemo(),
  },
  /* ───── i22 GPU 입자 ───── */
  i22: {
    kind: '3d',
    caption: '점 4만 개의 자리를 GPU(셰이더)가 매 순간 계산 — 은하 → 눈보라 → 불꽃놀이로 모양이 바뀌어요',
    make() {
      const scene = new THREE.Scene();
      scene.background = skyTexture('#02030c', '#0c1236');
      const cam = new THREE.PerspectiveCamera(50, 1.6, 0.1, 100);
      cam.position.set(0, 3.2, 8.5);
      cam.lookAt(0, 0.6, 0);
      const N = 40000;
      const geo = new THREE.BufferGeometry();
      const seeds = new Float32Array(N * 4);
      const r = rng(21);
      for (let i = 0; i < N * 4; i++) seeds[i] = r();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
      const mat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uMode: { value: 0 }, uScale: { value: 300 }, uSize: { value: 1 } },
        vertexShader: /* glsl */ `
          attribute vec4 aSeed;
          uniform float uTime; uniform float uMode; uniform float uScale; uniform float uSize;
          varying vec3 vC; varying float vA;
          vec3 hsv(float h, float s, float v){ vec3 p = abs(fract(h + vec3(1., 2./3., 1./3.)) * 6. - 3.); return v * mix(vec3(1.), clamp(p - 1., 0., 1.), s); }
          float hash(float n){ return fract(sin(n) * 43758.5453); }
          void galaxy(out vec3 p, out vec3 c, out float a){
            float r = pow(aSeed.x, 0.7) * 4.6;
            float arm = floor(aSeed.y * 3.) * 2.0944;
            float ang = arm + r * 1.15 - uTime * 0.35 / (0.5 + r * 0.4) + (aSeed.z - 0.5) * 0.5 * (1.0 - r * 0.1);
            p = vec3(cos(ang) * r, (aSeed.w - 0.5) * 0.35 * (1.2 - r / 5.), sin(ang) * r);
            c = mix(vec3(1., 0.85, 0.55), hsv(0.58 + aSeed.w * 0.25, 0.7, 1.), clamp(r / 2.5, 0., 1.)); a = 0.5; }
          void snow(out vec3 p, out vec3 c, out float a){
            float sp = 0.4 + aSeed.w * 0.7;
            float y = 4. - mod(aSeed.y * 8. + uTime * sp * 1.3, 8.);
            float x = (aSeed.x - 0.5) * 13. + sin(uTime * 0.9 + aSeed.z * 20.) * 0.5 + (y - 4.) * 0.35 * sin(uTime * 0.4);
            p = vec3(x, y, (aSeed.z - 0.5) * 8.);
            c = vec3(0.82, 0.92, 1.); a = 0.55; }
          void fire(out vec3 p, out vec3 c, out float a){
            float g = floor(aSeed.x * 7.); float per = 2.6;
            float tt = uTime + g * 0.371 * per; float cyc = floor(tt / per); float age = mod(tt, per);
            vec3 ctr = vec3((hash(g * 7. + cyc * 13.) - 0.5) * 8., 0.6 + hash(g * 3. + cyc * 5.) * 2.6, (hash(g * 11. + cyc) - 0.5) * 3.);
            float th = aSeed.y * 6.2832; float ph = acos(1. - 2. * aSeed.z);
            vec3 d = vec3(sin(ph) * cos(th), cos(ph), sin(ph) * sin(th));
            float sp = 2.3 * (0.8 + aSeed.w * 0.2);
            p = ctr + d * sp * (1. - exp(-age * 2.6)) - vec3(0., age * age * 0.32, 0.);
            c = hsv(hash(g + cyc * 1.7), 0.7, 1.);
            a = clamp(1. - age / (per * 0.85), 0., 1.) * (0.65 + 0.35 * sin(uTime * 30. + aSeed.x * 100.)); }
          void pick(float m, out vec3 p, out vec3 c, out float a){
            if (m < 0.5) galaxy(p, c, a); else if (m < 1.5) snow(p, c, a); else fire(p, c, a); }
          void main(){
            float ma = mod(floor(uMode), 3.); float mb = mod(ma + 1., 3.);
            float f = smoothstep(0.7, 1., fract(uMode));
            vec3 p1, c1, p2, c2; float a1, a2;
            pick(ma, p1, c1, a1); pick(mb, p2, c2, a2);
            float fs = smoothstep(0., 1., clamp(f * 1.3 - aSeed.w * 0.3, 0., 1.));
            vec3 p = mix(p1, p2, fs); vC = mix(c1, c2, fs); vA = mix(a1, a2, fs);
            vec4 mv = modelViewMatrix * vec4(p, 1.);
            gl_PointSize = 0.05 * uSize * uScale / -mv.z;
            gl_Position = projectionMatrix * mv; }`,
        fragmentShader: /* glsl */ `
          varying vec3 vC; varying float vA;
          void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC * a, a); }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      scene.add(pts);
      let auto = true;
      let fixed = 0;
      return {
        scene,
        camera: cam,
        resize(_w, h) {
          mat.uniforms['uScale']!.value = h;
        },
        update(t) {
          mat.uniforms['uTime']!.value = t;
          mat.uniforms['uMode']!.value = auto ? t / 5 : fixed;
          pts.rotation.y = t * 0.08;
        },
        controls: [
          { type: 'toggle', label: '저절로 바뀌기', value: true, on: (v) => (auto = v) },
          {
            type: 'range',
            label: '모양 (0 은하 · 1 눈보라 · 2 불꽃놀이)',
            min: 0,
            max: 2,
            step: 1,
            value: 0,
            on: (v) => {
              auto = false;
              fixed = v;
            },
          },
          { type: 'range', label: '점 크기', min: 0.4, max: 3, step: 0.1, value: 1, on: (v) => (mat.uniforms['uSize']!.value = v) },
        ],
        dispose() {
          disposeScene(scene);
          (scene.background as THREE.Texture).dispose();
        },
      };
    },
  },

  /* ───── i23 화면 전환 ───── */
  i23: {
    kind: 'dom',
    caption: '왼쪽: 화면이 툭 바뀜 · 오른쪽: 누른 카드가 그대로 커져 게임 화면이 됨 (View Transitions 의 「이어지는」 느낌)',
    make(box) {
      const wrap = document.createElement('div');
      wrap.style.cssText = `position:absolute;inset:0;display:grid;grid-template-columns:1fr 1fr;gap:2px;background:#fff;container-type:size;font-family:${FONT}`;
      const TILES = [
        ['#ff6a7a', '⚾'],
        ['#5ab8ff', '❄'],
        ['#7ae08a', '♞'],
        ['#ffd23a', '★'],
      ];
      const mkPane = (title: string, accent: string): { pane: HTMLElement; tiles: HTMLElement[]; game: HTMLElement; cursor: HTMLElement; head: HTMLElement } => {
        const pane = document.createElement('div');
        pane.style.cssText = 'position:relative;overflow:hidden;background:linear-gradient(#eef4ff,#d8e6ff)';
        const head = document.createElement('div');
        head.style.cssText = `position:absolute;left:6%;top:4%;font:800 6cqh/1 ${FONT};color:#30406a`;
        head.textContent = '게임 고르기';
        const tag = document.createElement('div');
        tag.style.cssText = `position:absolute;right:4%;top:3%;z-index:5;padding:1cqh 2.2cqw;border-radius:99px;background:${accent};color:#fff;font:800 4.6cqh/1.3 ${FONT}`;
        tag.textContent = title;
        pane.append(head, tag);
        const tiles = TILES.map(([c, icon], i) => {
          const el = document.createElement('div');
          el.style.cssText = `position:absolute;border-radius:2.4cqh;background:${c};display:grid;place-items:center;font-size:9cqh;color:#fff;box-shadow:0 0.8cqh 1.6cqh rgba(40,60,120,.25);z-index:${i === 0 ? 2 : 1}`;
          el.textContent = icon!;
          pane.appendChild(el);
          return el;
        });
        const game = document.createElement('div');
        game.style.cssText = 'position:absolute;inset:0;z-index:3;opacity:0;pointer-events:none';
        game.innerHTML = `<div style="position:absolute;left:6%;top:16%;font:800 5cqh/1 ${FONT_CSS};color:#fff">숫자 야구</div><div style="position:absolute;left:50%;top:58%;transform:translate(-50%,-50%);display:flex;gap:2cqw">${[3, 7, 1].map((n) => `<div style="width:9cqw;height:9cqw;border-radius:50%;background:#fff;display:grid;place-items:center;font:900 5cqw/1 ${FONT_CSS};color:#c02a3a;box-shadow:0 .6cqh 0 rgba(0,0,0,.25)">${n}</div>`).join('')}</div><div style="position:absolute;left:50%;bottom:8%;transform:translateX(-50%);padding:1.2cqh 4cqw;border-radius:99px;background:#ffd23a;font:800 5cqh/1 ${FONT_CSS};color:#5a2a00">던지기</div>`;
        pane.appendChild(game);
        const cursor = document.createElement('div');
        cursor.style.cssText = 'position:absolute;z-index:6;width:5cqh;height:5cqh;border-radius:50%;background:rgba(255,255,255,.85);border:0.5cqh solid #30406a;transform:translate(-50%,-50%);pointer-events:none';
        pane.appendChild(cursor);
        return { pane, tiles, game, cursor, head };
      };
      const A = mkPane('그냥 바뀜', '#8a94b0');
      const B = mkPane('부드럽게 이어짐', '#ff8a3a');
      wrap.append(A.pane, B.pane);
      box.appendChild(wrap);
      // 카드 자리 (%)
      const slot = (i: number): [number, number, number, number] => [8 + (i % 2) * 44, 18 + Math.floor(i / 2) * 40, 40, 34];
      const full: [number, number, number, number] = [0, 0, 100, 100];
      const place = (el: HTMLElement, r: [number, number, number, number], rad: number): void => {
        el.style.left = `${r[0]}%`;
        el.style.top = `${r[1]}%`;
        el.style.width = `${r[2]}%`;
        el.style.height = `${r[3]}%`;
        el.style.borderRadius = `${rad}cqh`;
      };
      const LOOP = 5;
      return {
        update(t) {
          const k = t % LOOP;
          // 0~1.2 메뉴 · 1.2 누름 · 1.2~1.8 열림 · 1.8~3.6 게임 · 3.6~4.2 닫힘 · 4.2~5 메뉴
          const open = k < 1.2 ? 0 : k < 1.8 ? (k - 1.2) / 0.6 : k < 3.6 ? 1 : k < 4.2 ? 1 - (k - 3.6) / 0.6 : 0;
          const curK = clamp(k / 1.1, 0, 1);
          for (const P of [A, B]) {
            const cx = lerp(80, 28, ease(curK));
            const cy = lerp(85, 35, ease(curK));
            P.cursor.style.left = `${cx}%`;
            P.cursor.style.top = `${cy}%`;
            const press = k > 1.0 && k < 1.25;
            P.cursor.style.transform = `translate(-50%,-50%) scale(${press ? 0.7 : 1})`;
            P.cursor.style.opacity = open > 0.02 && open < 0.98 ? '0' : open >= 0.98 ? '0' : '1';
          }
          // 왼쪽 — 툭
          const hardOpen = open > 0.5 ? 1 : 0;
          A.tiles.forEach((el, i) => {
            place(el, slot(i), 2.4);
            el.style.opacity = hardOpen ? '0' : '1';
          });
          A.head.style.opacity = hardOpen ? '0' : '1';
          A.game.style.opacity = String(hardOpen);
          A.game.style.background = TILES[0]![0]!;
          // 오른쪽 — 이어짐
          const e = ease(open);
          B.tiles.forEach((el, i) => {
            if (i === 0) {
              const s = slot(0);
              place(el, [lerp(s[0], full[0], e), lerp(s[1], full[1], e), lerp(s[2], full[2], e), lerp(s[3], full[3], e)], lerp(2.4, 0, e));
              el.style.fontSize = `${lerp(9, 0, e)}cqh`;
            } else {
              place(el, slot(i), 2.4);
              el.style.opacity = String(1 - e);
              el.style.transform = `scale(${1 - e * 0.15})`;
            }
          });
          B.head.style.opacity = String(1 - e);
          B.game.style.opacity = String(clamp((open - 0.6) / 0.4, 0, 1));
        },
        dispose() {
          wrap.remove();
        },
      };
    },
  },

  /* ───── i46 GPU 유체 ───── */
  i46: {
    kind: '3d',
    caption: 'GPU 셰이더로 푸는 유체 — 이류 · 압력 풀이 · 소용돌이 살리기를 렌더 타깃 핑퐁으로. 크게 보기에서 끌어서 저어 보세요',
    make: () => makeFluidDemo(),
  },

  /* ───── i47 SPH ───── */
  i47: {
    kind: '2d',
    caption: '입자 500개가 서로 밀어내며(밀도 → 압력) 물처럼 출렁 — 수조를 기울였다 세웠다 해요',
    make() {
      const N = 500;
      const TW = 200;
      const TH = 120;
      const HR = 9;
      const x = new Float32Array(N);
      const y = new Float32Array(N);
      const px = new Float32Array(N);
      const py = new Float32Array(N);
      const vx = new Float32Array(N);
      const vy = new Float32Array(N);
      const reset = (): void => {
        for (let i = 0; i < N; i++) {
          x[i] = 6 + (i % 22) * 4.4;
          y[i] = TH - 6 - Math.floor(i / 22) * 4.4;
          vx[i] = vy[i] = 0;
        }
      };
      reset();
      const CS = HR;
      const GX = Math.ceil(TW / CS) + 1;
      const GY = Math.ceil(TH / CS) + 1;
      const head = new Int32Array(GX * GY);
      const nxt = new Int32Array(N);
      let tiltK = 1;
      let stiff = 0.5;
      const REST = 3.2;
      const KN = 1.2;
      const step = (gx: number, gy: number): void => {
        const dt = 1;
        for (let i = 0; i < N; i++) {
          vx[i] = vx[i]! + gx * dt;
          vy[i] = vy[i]! + gy * dt;
          px[i] = x[i]!;
          py[i] = y[i]!;
          x[i] = x[i]! + vx[i]! * dt;
          y[i] = y[i]! + vy[i]! * dt;
        }
        head.fill(-1);
        for (let i = 0; i < N; i++) {
          const cx = clamp(Math.floor(x[i]! / CS), 0, GX - 1);
          const cy = clamp(Math.floor(y[i]! / CS), 0, GY - 1);
          const c = cx + cy * GX;
          nxt[i] = head[c]!;
          head[c] = i;
        }
        for (let i = 0; i < N; i++) {
          const xi = x[i]!;
          const yi = y[i]!;
          const cx = clamp(Math.floor(xi / CS), 0, GX - 1);
          const cy = clamp(Math.floor(yi / CS), 0, GY - 1);
          let d = 0;
          let dn = 0;
          for (let oy = -1; oy <= 1; oy++)
            for (let ox = -1; ox <= 1; ox++) {
              const ax = cx + ox;
              const ay = cy + oy;
              if (ax < 0 || ay < 0 || ax >= GX || ay >= GY) continue;
              for (let j = head[ax + ay * GX]!; j >= 0; j = nxt[j]!) {
                if (j === i) continue;
                const r = Math.hypot(x[j]! - xi, y[j]! - yi);
                if (r < HR) {
                  const q = 1 - r / HR;
                  d += q * q;
                  dn += q * q * q;
                }
              }
            }
          const P = stiff * (d - REST);
          const Pn = KN * dn;
          let dxi = 0;
          let dyi = 0;
          for (let oy = -1; oy <= 1; oy++)
            for (let ox = -1; ox <= 1; ox++) {
              const ax = cx + ox;
              const ay = cy + oy;
              if (ax < 0 || ay < 0 || ax >= GX || ay >= GY) continue;
              for (let j = head[ax + ay * GX]!; j >= 0; j = nxt[j]!) {
                if (j === i) continue;
                const rx = x[j]! - xi;
                const ry = y[j]! - yi;
                const r = Math.hypot(rx, ry);
                if (r < HR && r > 1e-4) {
                  const q = 1 - r / HR;
                  const D = (dt * dt * (P * q + Pn * q * q)) / 2;
                  const ux = (rx / r) * D;
                  const uy = (ry / r) * D;
                  x[j] = x[j]! + ux;
                  y[j] = y[j]! + uy;
                  dxi -= ux;
                  dyi -= uy;
                }
              }
            }
          x[i] = xi + dxi;
          y[i] = yi + dyi;
        }
        for (let i = 0; i < N; i++) {
          x[i] = clamp(x[i]!, 1.5, TW - 1.5);
          y[i] = clamp(y[i]!, 1.5, TH - 1.5);
          vx[i] = clamp((x[i]! - px[i]!) / dt, -4, 4);
          vy[i] = clamp((y[i]! - py[i]!) / dt, -4, 4);
        }
      };
      return {
        draw(g, w, h, t) {
          const ang = Math.sin(t * 0.7) * 0.32 * tiltK;
          const G = 0.12;
          // 수조 안 좌표에서 본 중력 (아래가 +y)
          const gx = -Math.sin(ang) * G;
          const gy = Math.cos(ang) * G;
          step(gx, gy);
          step(gx, gy);
          bg(g, w, h, '#fff4dc', '#ffe0b8');
          const s = Math.min((w * 0.86) / TW, (h * 0.8) / TH);
          g.save();
          g.translate(w / 2, h * 0.53);
          g.rotate(-ang);
          g.translate((-TW / 2) * s, (-TH / 2) * s);
          g.fillStyle = 'rgba(255,255,255,0.6)';
          g.fillRect(0, 0, TW * s, TH * s);
          // 물 — 큰 흐린 점 위에 작은 점
          g.fillStyle = 'rgba(60,160,255,0.35)';
          for (let i = 0; i < N; i++) {
            g.beginPath();
            g.arc(x[i]! * s, y[i]! * s, 4.6 * s, 0, TAU);
            g.fill();
          }
          for (let i = 0; i < N; i++) {
            const sp = Math.min(1, Math.hypot(vx[i]!, vy[i]!) / 1.6);
            g.fillStyle = `rgb(${Math.round(40 + sp * 200)},${Math.round(130 + sp * 115)},255)`;
            g.beginPath();
            g.arc(x[i]! * s, y[i]! * s, 2 * s, 0, TAU);
            g.fill();
          }
          g.strokeStyle = '#30406a';
          g.lineWidth = Math.max(2, s * 2);
          g.beginPath();
          g.moveTo(0, 0);
          g.lineTo(0, TH * s);
          g.lineTo(TW * s, TH * s);
          g.lineTo(TW * s, 0);
          g.stroke();
          g.restore();
          const fs = clamp(h * 0.05, 9, 18);
          pill(g, `입자 ${N} · 이웃 찾기 격자`, 8, fs * 1.3, fs, 'rgba(48,64,106,0.8)');
        },
        controls: [
          { type: 'range', label: '기울이기', min: 0, max: 2, step: 0.1, value: 1, on: (v) => (tiltK = v) },
          { type: 'range', label: '압력 세기 (안 눌림)', min: 0.1, max: 1.2, step: 0.05, value: 0.5, on: (v) => (stiff = v) },
          { type: 'button', label: '물 다시 붓기', on: reset },
        ],
      };
    },
  },

  /* ───── i48 물결 파동 ───── */
  i48: {
    kind: '3d',
    caption: '물방울이 떨어지면 동심원이 퍼지고, 둘이 만나면 겹쳐(간섭) — 바닥엔 물결이 모은 빛무늬',
    make() {
      const scene = new THREE.Scene();
      scene.background = skyTexture('#bfe6ff', '#f0f9ff');
      scene.add(new THREE.HemisphereLight(0xffffff, 0x88aacc, 1.1));
      const sun = new THREE.DirectionalLight(0xffffff, 2.4);
      sun.position.set(-3, 6, 2);
      scene.add(sun);
      const glint = new THREE.DirectionalLight(0xfff6e0, 2.2);
      glint.position.set(1, 3, -6);
      scene.add(glint);
      const cam = new THREE.PerspectiveCamera(42, 1.6, 0.1, 60);
      const NG = 80;
      const SIZE = 6;
      const cur = new Float32Array(NG * NG);
      const prv = new Float32Array(NG * NG);
      // 바닥 타일
      const tc = document.createElement('canvas');
      tc.width = tc.height = 256;
      const tg = tc.getContext('2d')!;
      tg.fillStyle = '#e8f6ff';
      tg.fillRect(0, 0, 256, 256);
      for (let j = 0; j < 8; j++)
        for (let i = 0; i < 8; i++) {
          tg.fillStyle = (i + j) % 2 ? '#7ac8f0' : '#a8dcf6';
          tg.fillRect(i * 32 + 1.5, j * 32 + 1.5, 29, 29);
        }
      const tileTex = new THREE.CanvasTexture(tc);
      tileTex.colorSpace = THREE.SRGBColorSpace;
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshLambertMaterial({ map: tileTex }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -0.7;
      scene.add(floor);
      // 빛무늬 (물결의 휜 정도 → 밝기)
      const cc = document.createElement('canvas');
      cc.width = cc.height = NG;
      const cg = cc.getContext('2d')!;
      const cimg = cg.createImageData(NG, NG);
      const cTex = new THREE.CanvasTexture(cc);
      const caus = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshBasicMaterial({ map: cTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      caus.rotation.x = -Math.PI / 2;
      caus.position.y = -0.69;
      scene.add(caus);
      const wallMat = new THREE.MeshLambertMaterial({ color: 0xf4f8ff });
      for (const [px, pz, sx, sz] of [
        [0, -SIZE / 2 - 0.15, SIZE + 0.6, 0.3],
        [0, SIZE / 2 + 0.15, SIZE + 0.6, 0.3],
        [-SIZE / 2 - 0.15, 0, 0.3, SIZE],
        [SIZE / 2 + 0.15, 0, 0.3, SIZE],
      ] as const) {
        const wl = new THREE.Mesh(new THREE.BoxGeometry(sx, 1, sz), wallMat);
        wl.position.set(px, -0.25, pz);
        scene.add(wl);
      }
      const geo = new THREE.PlaneGeometry(SIZE, SIZE, NG - 1, NG - 1);
      geo.rotateX(-Math.PI / 2);
      const water = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color: 0xffffff, vertexColors: true, specular: 0xffffff, shininess: 90, transparent: true, opacity: 0.72 }));
      scene.add(water);
      const wcol = new Float32Array(NG * NG * 3);
      geo.setAttribute('color', new THREE.BufferAttribute(wcol, 3));
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshStandardMaterial({ color: 0x9adcff, roughness: 0.1 }));
      scene.add(drop);
      const pos = geo.attributes['position'] as THREE.BufferAttribute;
      const r = rng(4);
      let next = 0.3;
      let pending: { i: number; j: number; at: number }[] = [];
      let damp = 0.988;
      let strength = 1;
      const disturb = (ci: number, cj: number, amt: number): void => {
        for (let j = -3; j <= 3; j++)
          for (let i = -3; i <= 3; i++) {
            const a = ci + i;
            const b = cj + j;
            if (a < 1 || b < 1 || a >= NG - 1 || b >= NG - 1) continue;
            const w = Math.exp(-(i * i + j * j) / 3);
            cur[a + b * NG] = cur[a + b * NG]! - amt * w;
          }
      };
      return {
        scene,
        camera: cam,
        update(t) {
          cam.position.set(Math.sin(t * 0.15) * 2.2, 6.6, 7.6);
          cam.lookAt(0, -0.4, 0);
          if (t > next) {
            const two = r() < 0.4;
            const at = t + 0.35;
            pending.push({ i: 12 + Math.floor(r() * (NG - 24)), j: 12 + Math.floor(r() * (NG - 24)), at });
            if (two) pending.push({ i: 12 + Math.floor(r() * (NG - 24)), j: 12 + Math.floor(r() * (NG - 24)), at });
            next = t + 1.1;
          }
          drop.visible = false;
          pending = pending.filter((p) => {
            if (t >= p.at) {
              disturb(p.i, p.j, 1.4 * strength);
              return false;
            }
            const k = 1 - (p.at - t) / 0.35;
            drop.visible = true;
            drop.position.set((p.i / (NG - 1) - 0.5) * SIZE, 2.2 - k * 2.2, (p.j / (NG - 1) - 0.5) * SIZE);
            return true;
          });
          for (let it = 0; it < 1; it++) {
            for (let j = 1; j < NG - 1; j++)
              for (let i = 1; i < NG - 1; i++) {
                const k = i + j * NG;
                const nv = (cur[k - 1]! + cur[k + 1]! + cur[k - NG]! + cur[k + NG]!) / 2 - prv[k]!;
                prv[k] = nv * damp;
              }
            const tmp = prv.slice();
            prv.set(cur);
            cur.set(tmp);
          }
          const D = cimg.data;
          for (let j = 0; j < NG; j++)
            for (let i = 0; i < NG; i++) {
              const k = i + j * NG;
              pos.setY(k, cur[k]! * 0.5);
              const hv = clamp(cur[k]! * 1.6, -1, 1);
              wcol[k * 3] = clamp(0.16 + hv * 0.7, 0, 1);
              wcol[k * 3 + 1] = clamp(0.6 + hv * 0.45, 0, 1);
              wcol[k * 3 + 2] = clamp(0.9 + hv * 0.2, 0, 1);
              const lap = i > 0 && j > 0 && i < NG - 1 && j < NG - 1 ? cur[k - 1]! + cur[k + 1]! + cur[k - NG]! + cur[k + NG]! - 4 * cur[k]! : 0;
              const b = clamp(lap * 500, 0, 220);
              const o = k * 4;
              D[o] = 255;
              D[o + 1] = 255;
              D[o + 2] = 240;
              D[o + 3] = b;
            }
          cg.putImageData(cimg, 0, 0);
          cTex.needsUpdate = true;
          pos.needsUpdate = true;
          geo.attributes['color']!.needsUpdate = true;
          geo.computeVertexNormals();
        },
        controls: [
          { type: 'range', label: '물결 남는 정도', min: 0.95, max: 0.998, step: 0.001, value: 0.988, on: (v) => (damp = v) },
          { type: 'range', label: '물방울 세기', min: 0.2, max: 3, step: 0.1, value: 1, on: (v) => (strength = v) },
          { type: 'button', label: '가운데 톡', on: () => disturb(NG >> 1, NG >> 1, 2 * strength) },
        ],
        dispose() {
          disposeScene(scene);
          (scene.background as THREE.Texture).dispose();
        },
      };
    },
  },

  /* ───── i49 천 · 말랑한 몸 ───── */
  i49: {
    kind: '2d',
    caption: '왼쪽: 점들을 거리 제약으로 묶은 천이 바람에 펄럭 · 오른쪽: 용수철 + 넓이 지키기(압력)로 된 젤리가 통통',
    make() {
      // 천
      const CW = 16;
      const CH = 12;
      const REST = 1 / (CW - 1);
      const cx = new Float32Array(CW * CH);
      const cy = new Float32Array(CW * CH);
      const ox = new Float32Array(CW * CH);
      const oy = new Float32Array(CW * CH);
      for (let j = 0; j < CH; j++)
        for (let i = 0; i < CW; i++) {
          const k = i + j * CW;
          cx[k] = ox[k] = i * REST;
          cy[k] = oy[k] = j * REST;
        }
      let wind = 1;
      const pinned = (k: number): boolean => k < CW && k % 5 === 0;
      const clink = (a: number, b: number): void => {
        const wa = pinned(a) ? 0 : 1;
        const wb = pinned(b) ? 0 : 1;
        if (!wa && !wb) return;
        const dx = cx[b]! - cx[a]!;
        const dy = cy[b]! - cy[a]!;
        const d = Math.hypot(dx, dy) || 1e-6;
        const diff = (d - REST) / d / (wa + wb);
        cx[a] = cx[a]! + dx * diff * wa;
        cy[a] = cy[a]! + dy * diff * wa;
        cx[b] = cx[b]! - dx * diff * wb;
        cy[b] = cy[b]! - dy * diff * wb;
      };
      // 젤리
      const JN = 20;
      const JR = 0.24;
      const jx = new Float32Array(JN + 1);
      const jy = new Float32Array(JN + 1);
      const qx = new Float32Array(JN + 1);
      const qy = new Float32Array(JN + 1);
      for (let i = 0; i < JN; i++) {
        jx[i] = qx[i] = 0.5 + Math.cos((i / JN) * TAU) * JR;
        jy[i] = qy[i] = 0.62 + Math.sin((i / JN) * TAU) * JR;
      }
      jx[JN] = qx[JN] = 0.5;
      jy[JN] = qy[JN] = 0.62;
      const SEG = 2 * JR * Math.sin(Math.PI / JN);
      const A0 = Math.PI * JR * JR * 0.86;
      let soft = 0.35;
      let jumpT = 0;
      const area = (): number => {
        let a = 0;
        for (let i = 0; i < JN; i++) {
          const n = (i + 1) % JN;
          a += jx[i]! * jy[n]! - jx[n]! * jy[i]!;
        }
        return a / 2;
      };
      const link = (X: Float32Array, Y: Float32Array, a: number, b: number, rest: number, stiff: number): void => {
        const dx = X[b]! - X[a]!;
        const dy = Y[b]! - Y[a]!;
        const d = Math.hypot(dx, dy) || 1e-6;
        const diff = ((d - rest) / d) * stiff;
        X[a] = X[a]! + dx * diff * 0.5;
        Y[a] = Y[a]! + dy * diff * 0.5;
        X[b] = X[b]! - dx * diff * 0.5;
        Y[b] = Y[b]! - dy * diff * 0.5;
      };
      return {
        draw(g, w, h, t, dt) {
          dt = Math.min(dt, 1 / 30);
          const H2 = dt * dt;
          // ── 천
          for (let j = 0; j < CH; j++)
            for (let i = 0; i < CW; i++) {
              const k = i + j * CW;
              if (pinned(k)) continue;
              const vx = (cx[k]! - ox[k]!) * 0.99;
              const vy = (cy[k]! - oy[k]!) * 0.99;
              ox[k] = cx[k]!;
              oy[k] = cy[k]!;
              const gust = (0.5 + 0.5 * Math.sin(t * 0.8)) * (0.6 + 0.4 * Math.sin(t * 3.1 + i * 0.5 + j * 0.3));
              cx[k] = cx[k]! + vx + wind * gust * 2.6 * H2;
              cy[k] = cy[k]! + vy + (2 + Math.sin(t * 4.3 + i * 0.7 + j * 0.4) * 0.7 * wind) * H2;
            }
          for (let it = 0; it < 12; it++)
            for (let j = 0; j < CH; j++)
              for (let i = 0; i < CW; i++) {
                const k = i + j * CW;
                if (i < CW - 1) clink(k, k + 1);
                if (j < CH - 1) clink(k, k + CW);
              }
          // ── 젤리
          jumpT += dt;
          for (let i = 0; i <= JN; i++) {
            const vx = (jx[i]! - qx[i]!) * 0.985;
            const vy = (jy[i]! - qy[i]!) * 0.985;
            qx[i] = jx[i]!;
            qy[i] = jy[i]!;
            jx[i] = jx[i]! + vx;
            jy[i] = jy[i]! + vy + 2.2 * H2;
          }
          if (jumpT > 2.4) {
            jumpT = 0;
            for (let i = 0; i <= JN; i++) {
              qy[i] = qy[i]! + 0.02;
              qx[i] = qx[i]! + (Math.sin(t) > 0 ? 0.004 : -0.004);
            }
          }
          for (let it = 0; it < 6; it++) {
            for (let i = 0; i < JN; i++) {
              link(jx, jy, i, (i + 1) % JN, SEG, 0.9);
              link(jx, jy, i, JN, JR, soft * 0.12);
            }
            const A = area();
            const push = ((A0 - A) / (JN * SEG)) * 0.3;
            for (let i = 0; i < JN; i++) {
              const p = (i + JN - 1) % JN;
              const n = (i + 1) % JN;
              const nx = jy[n]! - jy[p]!;
              const ny = -(jx[n]! - jx[p]!);
              const l = Math.hypot(nx, ny) || 1;
              jx[i] = jx[i]! + (nx / l) * push;
              jy[i] = jy[i]! + (ny / l) * push;
            }
            for (let i = 0; i <= JN; i++) {
              if (jy[i]! > 0.92) {
                jy[i] = 0.92;
                qx[i] = qx[i]! + (jx[i]! - qx[i]!) * 0.3;
              }
              jx[i] = clamp(jx[i]!, 0.05, 0.95);
            }
          }
          // ── 그리기
          bg(g, w, h, '#bfe8ff', '#eaf8ff');
          const half = w / 2;
          const fs = clamp(h * 0.055, 9, 18);
          // 천
          const cs = Math.min(half * 0.62, h * 0.62) / 1;
          const ccx = half * 0.5 - cs * 0.5;
          const ccy = h * 0.2;
          g.fillStyle = '#8a6a4a';
          g.fillRect(ccx - cs * 0.06, ccy - 4, cs * 1.12, 6);
          const stripes = ['#ff5a6a', '#ff9a3a', '#ffd23a', '#5ad07a', '#4ab0ff', '#9a6aff'];
          for (let j = 0; j < CH - 1; j++)
            for (let i = 0; i < CW - 1; i++) {
              const a = i + j * CW;
              const b = a + 1;
              const c = a + CW + 1;
              const d = a + CW;
              const ww = Math.hypot(cx[b]! - cx[a]!, cy[b]! - cy[a]!) / REST;
              const sh = clamp(0.55 + ww * 0.45 + (cx[b]! - cx[a]! - REST) * 6, 0.5, 1.15);
              const base = new THREE.Color(stripes[Math.floor((j / (CH - 1)) * stripes.length)]!).multiplyScalar(sh);
              g.fillStyle = `#${base.getHexString()}`;
              g.beginPath();
              g.moveTo(ccx + cx[a]! * cs, ccy + cy[a]! * cs);
              g.lineTo(ccx + cx[b]! * cs, ccy + cy[b]! * cs);
              g.lineTo(ccx + cx[c]! * cs, ccy + cy[c]! * cs);
              g.lineTo(ccx + cx[d]! * cs, ccy + cy[d]! * cs);
              g.closePath();
              g.fill();
              g.strokeStyle = g.fillStyle;
              g.lineWidth = 0.8;
              g.stroke();
            }
          // 점 · 막대 몇 개 보이기
          g.fillStyle = 'rgba(30,40,80,0.45)';
          for (let j = 0; j < CH; j += 2)
            for (let i = 0; i < CW; i += 3) {
              const k = i + j * CW;
              g.beginPath();
              g.arc(ccx + cx[k]! * cs, ccy + cy[k]! * cs, 1.6, 0, TAU);
              g.fill();
            }
          g.fillStyle = '#d8402a';
          for (let i = 0; i < CW; i += 5) {
            g.beginPath();
            g.arc(ccx + cx[i]! * cs, ccy + cy[i]! * cs, Math.max(2.5, cs * 0.025), 0, TAU);
            g.fill();
          }
          text(g, '천 — 점 + 거리 제약', half * 0.5, h * 0.92, fs, '#30406a', 'center', FONT, '800');
          g.fillStyle = 'rgba(48,64,106,0.35)';
          g.fillRect(half - 1, 0, 2, h);
          // 젤리
          const js = Math.min(half * 0.9, h * 0.9);
          const jox = half + (half - js) / 2;
          const joy = (h - js) / 2 - h * 0.02;
          g.fillStyle = '#8ac86a';
          g.fillRect(half, joy + 0.92 * js + JR * 0.0, half, h);
          const P = (i: number): [number, number] => [jox + jx[(i + JN) % JN]! * js, joy + jy[(i + JN) % JN]! * js];
          const grd = g.createRadialGradient(jox + jx[JN]! * js - js * 0.06, joy + jy[JN]! * js - js * 0.08, js * 0.02, jox + jx[JN]! * js, joy + jy[JN]! * js, js * 0.3);
          grd.addColorStop(0, '#d8ffb0');
          grd.addColorStop(1, '#4ac86a');
          g.fillStyle = grd;
          g.beginPath();
          let [ax, ay] = P(0);
          let [bx, by] = P(1);
          g.moveTo((ax + bx) / 2, (ay + by) / 2);
          for (let i = 1; i <= JN; i++) {
            [ax, ay] = P(i);
            [bx, by] = P(i + 1);
            g.quadraticCurveTo(ax, ay, (ax + bx) / 2, (ay + by) / 2);
          }
          g.fill();
          g.strokeStyle = '#2a8a4a';
          g.lineWidth = 2;
          g.stroke();
          const ex = jox + jx[JN]! * js;
          const ey = joy + jy[JN]! * js;
          g.fillStyle = '#1a3a2a';
          for (const sx of [-1, 1]) {
            g.beginPath();
            g.ellipse(ex + sx * js * 0.07, ey - js * 0.03, js * 0.022, js * 0.03, 0, 0, TAU);
            g.fill();
          }
          g.beginPath();
          g.strokeStyle = '#1a3a2a';
          g.arc(ex, ey + js * 0.02, js * 0.035, 0.15 * Math.PI, 0.85 * Math.PI);
          g.stroke();
          text(g, '젤리 — 용수철 + 압력', half * 1.5, h * 0.92, fs, '#204a2a', 'center', FONT, '800');
        },
        controls: [
          { type: 'range', label: '바람', min: 0, max: 3, step: 0.1, value: 1, on: (v) => (wind = v) },
          { type: 'range', label: '젤리 단단함', min: 0.05, max: 1, step: 0.05, value: 0.35, on: (v) => (soft = v) },
        ],
      };
    },
  },

  /* ───── i50 무리 짓기 ───── */
  i50: {
    kind: '2d',
    caption: '물고기 한 마리마다 규칙 셋(분리 · 정렬 · 결집)만 — 그런데 떼가 생겨요. 몇 초마다 정렬 · 결집을 껐다 켜요',
    make() {
      const N = 110;
      const r = rng(8);
      const fish = Array.from({ length: N }, (_, i) => ({ x: r() * 1.6, y: r(), vx: (r() - 0.5) * 0.2, vy: (r() - 0.5) * 0.2, c: i % 7 === 0 ? '#ff6a8a' : i % 3 ? '#ffb02a' : '#ffd84a' }));
      const rules = { sep: true, ali: true, coh: true };
      let auto = true;
      const ptr = pointerOf();
      const bubbles = Array.from({ length: 14 }, () => ({ x: r(), y: r(), s: 0.5 + r() }));
      return {
        draw(g, w, h, t, dt) {
          ptr.attach(g.canvas as HTMLCanvasElement);
          dt = Math.min(dt, 1 / 30);
          const A = w / h;
          if (auto) {
            const k = t % 14;
            const off = k > 9;
            rules.sep = true;
            rules.ali = !off;
            rules.coh = !off;
          }
          for (const f of fish) {
            let sx = 0;
            let sy = 0;
            let ax = 0;
            let ay = 0;
            let cx = 0;
            let cy = 0;
            let n = 0;
            for (const o of fish) {
              if (o === f) continue;
              let dx = o.x - f.x;
              let dy = o.y - f.y;
              if (dx > A / 2) dx -= A;
              if (dx < -A / 2) dx += A;
              if (dy > 0.5) dy -= 1;
              if (dy < -0.5) dy += 1;
              const d2 = dx * dx + dy * dy;
              if (d2 < 0.012) {
                n++;
                ax += o.vx;
                ay += o.vy;
                cx += dx;
                cy += dy;
                if (d2 < 0.0012) {
                  sx -= dx / (d2 + 1e-4);
                  sy -= dy / (d2 + 1e-4);
                }
              }
            }
            if (rules.sep) {
              f.vx += sx * 0.00025;
              f.vy += sy * 0.00025;
            }
            if (n) {
              if (rules.ali) {
                f.vx += (ax / n - f.vx) * 0.06;
                f.vy += (ay / n - f.vy) * 0.06;
              }
              if (rules.coh) {
                f.vx += (cx / n) * 0.05;
                f.vy += (cy / n) * 0.05;
              }
            }
            if (ptr.inside) {
              const dx = f.x - ptr.x / h;
              const dy = f.y - ptr.y / h;
              const d2 = dx * dx + dy * dy;
              if (d2 < 0.04) {
                f.vx += (dx / (d2 + 0.002)) * 0.004;
                f.vy += (dy / (d2 + 0.002)) * 0.004;
              }
            }
            f.vx += (r() - 0.5) * 0.01;
            f.vy += (r() - 0.5) * 0.01;
            const sp = Math.hypot(f.vx, f.vy);
            const want = clamp(sp, 0.12, 0.28);
            f.vx = (f.vx / (sp || 1)) * want;
            f.vy = (f.vy / (sp || 1)) * want;
          }
          for (const f of fish) {
            f.x = (f.x + f.vx * dt + A) % A;
            f.y = (f.y + f.vy * dt + 1) % 1;
          }
          // 그리기
          bg(g, w, h, '#2ab0d8', '#0a3a7a');
          g.fillStyle = 'rgba(255,255,255,0.06)';
          for (let k = 0; k < 4; k++) {
            const x0 = ((k * 0.3 + t * 0.02) % 1.3) * w;
            g.beginPath();
            g.moveTo(x0, 0);
            g.lineTo(x0 + w * 0.08, 0);
            g.lineTo(x0 - w * 0.12, h);
            g.lineTo(x0 - w * 0.22, h);
            g.fill();
          }
          g.strokeStyle = 'rgba(255,255,255,0.35)';
          for (const b of bubbles) {
            const y = (((b.y - t * 0.05 * b.s) % 1) + 1) % 1;
            g.beginPath();
            g.arc(b.x * w + Math.sin(t + b.x * 9) * 4, y * h, 2 + b.s * 2, 0, TAU);
            g.stroke();
          }
          const L = Math.max(5, h * 0.028);
          for (const f of fish) {
            const a = Math.atan2(f.vy, f.vx);
            g.save();
            g.translate(f.x * h, f.y * h);
            g.rotate(a);
            const wag = Math.sin(t * 12 + f.x * 30) * 0.35;
            g.fillStyle = f.c;
            g.beginPath();
            g.moveTo(-L * 0.8, 0);
            g.lineTo(-L * 1.5, -L * 0.5 + wag * L * 0.3);
            g.lineTo(-L * 1.5, L * 0.5 + wag * L * 0.3);
            g.fill();
            g.beginPath();
            g.ellipse(0, 0, L, L * 0.48, 0, 0, TAU);
            g.fill();
            g.fillStyle = '#10203a';
            g.beginPath();
            g.arc(L * 0.5, -L * 0.12, L * 0.12, 0, TAU);
            g.fill();
            g.restore();
          }
          const fs = clamp(h * 0.05, 9, 18);
          let x = 8;
          for (const [k, name] of [
            ['sep', '분리'],
            ['ali', '정렬'],
            ['coh', '결집'],
          ] as const) {
            const on = rules[k];
            g.font = `800 ${fs}px ${FONT}`;
            const tw = g.measureText(`${name} ${on ? '켬' : '끔'}`).width + fs * 1.1;
            pill(g, `${name} ${on ? '켬' : '끔'}`, x, h - fs * 1.3, fs, on ? 'rgba(255,210,60,0.95)' : 'rgba(0,0,0,0.45)', on ? '#3a2400' : '#cfe0ff');
            x += tw + 6;
          }
        },
        controls: [
          {
            type: 'toggle',
            label: '분리 (너무 붙지 않기)',
            value: true,
            on: (v) => {
              auto = false;
              rules.sep = v;
            },
          },
          {
            type: 'toggle',
            label: '정렬 (같은 쪽 보기)',
            value: true,
            on: (v) => {
              auto = false;
              rules.ali = v;
            },
          },
          {
            type: 'toggle',
            label: '결집 (가운데로 모이기)',
            value: true,
            on: (v) => {
              auto = false;
              rules.coh = v;
            },
          },
        ],
        dispose() {
          ptr.dispose();
        },
      };
    },
  },

  /* ───── i51 궤도 ───── */
  i51: {
    kind: '3d',
    caption: '케플러 식으로 도는 행성 — 먼 행성일수록 느리고(T² ∝ a³), 길쭉한 혜성은 태양 가까이서 휙 빨라져요',
    make() {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x03040e);
      const cam = new THREE.PerspectiveCamera(42, 1.6, 0.1, 200);
      scene.add(new THREE.AmbientLight(0x5a64a0, 2.2));
      const sunLight = new THREE.PointLight(0xfff2d8, 60, 0, 1.6);
      scene.add(sunLight);
      const sun = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 20), new THREE.MeshBasicMaterial({ color: 0xffd25a }));
      scene.add(sun);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(0.15), color: 0xffa83a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.setScalar(3.4);
      scene.add(glow);
      // 별
      const sg = new THREE.BufferGeometry();
      const sp = new Float32Array(900 * 3);
      const r = rng(17);
      for (let i = 0; i < 900; i++) {
        const th = r() * TAU;
        const ph = Math.acos(2 * r() - 1);
        sp.set([Math.sin(ph) * Math.cos(th) * 60, Math.cos(ph) * 60, Math.sin(ph) * Math.sin(th) * 60], i * 3);
      }
      sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
      scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, sizeAttenuation: true })));
      const planetTex = (seed: number, cols: string[], bands: boolean): THREE.CanvasTexture => {
        const c = document.createElement('canvas');
        c.width = 128;
        c.height = 64;
        const g = c.getContext('2d')!;
        const n = makeNoise(seed);
        const img = g.createImageData(128, 64);
        const cs = cols.map((x) => new THREE.Color(x));
        for (let y = 0; y < 64; y++)
          for (let x = 0; x < 128; x++) {
            const v = bands ? clamp(0.5 + Math.sin(y * 0.35 + fbm(n, x / 18, y / 9, 3) * 4) * 0.5, 0, 1) : fbm(n, x / 16, y / 16, 4);
            const f = clamp(v, 0, 0.999) * (cs.length - 1);
            const i0 = Math.floor(f);
            const col = cs[i0]!.clone().lerp(cs[i0 + 1]!, f - i0);
            const o = (x + y * 128) * 4;
            img.data[o] = col.r * 255;
            img.data[o + 1] = col.g * 255;
            img.data[o + 2] = col.b * 255;
            img.data[o + 3] = 255;
          }
        g.putImageData(img, 0, 0);
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      };
      interface Orb {
        a: number;
        e: number;
        T: number;
        m: THREE.Object3D;
        spin: number;
        tilt: number;
      }
      const orbs: Orb[] = [];
      const add = (a: number, e: number, rad: number, tex: THREE.Texture | null, color: number, tilt = 0): THREE.Mesh => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(rad, 28, 18), new THREE.MeshStandardMaterial({ map: tex, color: tex ? 0xffffff : color, roughness: 0.85 }));
        scene.add(m);
        orbs.push({ a, e, T: 2.2 * Math.pow(a, 1.5), m, spin: 1 + r() * 2, tilt });
        const pts: THREE.Vector3[] = [];
        const b = a * Math.sqrt(1 - e * e);
        for (let k = 0; k <= 128; k++) {
          const E = (k / 128) * TAU;
          pts.push(new THREE.Vector3(a * (Math.cos(E) - e), 0, b * Math.sin(E)));
        }
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x5a6aa8, transparent: true, opacity: 0.55 }));
        line.rotation.x = tilt;
        scene.add(line);
        return m;
      };
      add(1.4, 0.05, 0.14, planetTex(1, ['#8a7a6a', '#c8b8a0', '#6a5a4a'], false), 0);
      add(2.3, 0.04, 0.24, planetTex(2, ['#1a4aa8', '#2a7ad8', '#3a9a4a', '#e8e0c0', '#ffffff'], false), 0);
      add(3.3, 0.08, 0.2, planetTex(3, ['#a83a1a', '#d8683a', '#f0a070'], false), 0);
      const giant = add(5.0, 0.05, 0.48, planetTex(4, ['#c89a6a', '#f0d8b0', '#a86a3a', '#f8e8d0'], true), 0);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.95, 48), new THREE.MeshBasicMaterial({ color: 0xe8d0a8, side: THREE.DoubleSide, transparent: true, opacity: 0.6 }));
      ring.rotation.x = -Math.PI / 2.4;
      giant.add(ring);
      // 혜성
      const comet = add(4.2, 0.78, 0.09, null, 0xbfe8ff, 0.25);
      (comet.material as THREE.MeshStandardMaterial).emissive.setHex(0x8ad8ff);
      const TR = 70;
      const trailGeo = new THREE.BufferGeometry();
      trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TR * 3), 3));
      const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.9 }));
      trail.frustumCulled = false;
      scene.add(trail);
      const hist: THREE.Vector3[] = [];
      let speed = 1;
      let sim = 0;
      const tmp = new THREE.Vector3();
      return {
        scene,
        camera: cam,
        update(t, dt) {
          sim += Math.min(dt, 0.05) * speed;
          for (const o of orbs) {
            const M = (TAU * sim) / o.T;
            let E = M;
            for (let k = 0; k < 6; k++) E -= (E - o.e * Math.sin(E) - M) / (1 - o.e * Math.cos(E));
            const b = o.a * Math.sqrt(1 - o.e * o.e);
            tmp.set(o.a * (Math.cos(E) - o.e), 0, -b * Math.sin(E));
            tmp.applyAxisAngle(new THREE.Vector3(1, 0, 0), o.tilt);
            o.m.position.copy(tmp);
            o.m.rotation.y = sim * o.spin;
          }
          hist.unshift(comet.position.clone());
          if (hist.length > TR) hist.pop();
          const arr = (trailGeo.attributes['position'] as THREE.BufferAttribute).array as Float32Array;
          for (let k = 0; k < TR; k++) {
            const p = hist[Math.min(k, hist.length - 1)]!;
            arr[k * 3] = p.x;
            arr[k * 3 + 1] = p.y;
            arr[k * 3 + 2] = p.z;
          }
          trailGeo.attributes['position']!.needsUpdate = true;
          sun.rotation.y = t * 0.2;
          glow.scale.setScalar(3.4 + Math.sin(t * 2) * 0.15);
          const ca = t * 0.06;
          cam.position.set(Math.sin(ca) * 11.5, 6.6, Math.cos(ca) * 11.5);
          cam.lookAt(0.6, 0, 0);
        },
        controls: [{ type: 'range', label: '시간 빠르기', min: 0, max: 4, step: 0.1, value: 1, on: (v) => (speed = v) }],
        dispose() {
          disposeScene(scene);
        },
      };
    },
  },

  /* ───── i52 소리 보기 ───── */
  i52: {
    kind: '2d',
    caption: '두 음(분홍 · 파랑)을 더하면 노란 물결이 커졌다 작아졌다 — 맥놀이. 아래는 FFT 주파수 막대. 크게 보기에서 실제 소리를 켤 수 있어요',
    make() {
      let f1 = 440;
      let f2 = 466;
      let ctx: AudioContext | null = null;
      let o1: OscillatorNode | null = null;
      let o2: OscillatorNode | null = null;
      let an: AnalyserNode | null = null;
      let freq: Uint8Array<ArrayBuffer> | null = null;
      const stop = (): void => {
        if (ctx) void ctx.close();
        ctx = null;
        o1 = o2 = null;
        an = null;
      };
      const start = (): void => {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = new AC();
        an = ctx.createAnalyser();
        an.fftSize = 8192;
        an.smoothingTimeConstant = 0.7;
        freq = new Uint8Array(an.frequencyBinCount);
        const master = ctx.createGain();
        master.gain.value = 0.18;
        an.connect(master);
        master.connect(ctx.destination);
        o1 = ctx.createOscillator();
        o2 = ctx.createOscillator();
        o1.frequency.value = f1;
        o2.frequency.value = f2;
        o1.connect(an);
        o2.connect(an);
        o1.start();
        o2.start();
      };
      const bars = new Float32Array(64);
      return {
        draw(g, w, h, t) {
          bg(g, w, h, '#16133a', '#2c2462');
          const fs = clamp(h * 0.05, 9, 18);
          // 위: 파형
          const top = h * 0.12;
          const wh = h * 0.42;
          const mid = top + wh / 2;
          const win = 2 / Math.max(4, Math.abs(f2 - f1));
          const shift = t * 0.15;
          const Wv = (f: number, x: number): number => Math.sin(TAU * f * (shift + (x / w) * win));
          const amp = wh * 0.22;
          const lineOf = (fn: (x: number) => number, col: string, lw: number, yOff: number, a: number): void => {
            g.strokeStyle = col;
            g.lineWidth = lw;
            g.globalAlpha = a;
            g.beginPath();
            for (let x = 0; x <= w; x += 1) {
              const y = yOff + fn(x);
              if (x === 0) g.moveTo(x, y);
              else g.lineTo(x, y);
            }
            g.stroke();
            g.globalAlpha = 1;
          };
          lineOf((x) => Wv(f1, x) * amp * 0.45, '#ff7aa8', 1, top + wh * 0.08, 0.8);
          lineOf((x) => Wv(f2, x) * amp * 0.45, '#6ac0ff', 1, top + wh * 0.24, 0.8);
          lineOf((x) => (Wv(f1, x) + Wv(f2, x)) * amp * 0.5, '#ffd84a', 1.3, mid + wh * 0.2, 1);
          // 덮개 (맥놀이)
          g.setLineDash([4, 4]);
          lineOf((x) => -Math.abs(Math.cos(Math.PI * (f2 - f1) * (shift + (x / w) * win))) * amp, 'rgba(255,255,255,0.7)', 1.2, mid + wh * 0.2, 1);
          lineOf((x) => Math.abs(Math.cos(Math.PI * (f2 - f1) * (shift + (x / w) * win))) * amp, 'rgba(255,255,255,0.7)', 1.2, mid + wh * 0.2, 1);
          g.setLineDash([]);
          // 아래: 주파수 막대
          const by = h * 0.94;
          const bh = h * 0.3;
          const NB = bars.length;
          const fLo = 200;
          const fHi = 1400;
          if (an && freq) {
            an.getByteFrequencyData(freq);
            const binHz = ctx!.sampleRate / an.fftSize;
            for (let b = 0; b < NB; b++) {
              const fa = fLo + ((fHi - fLo) * b) / NB;
              const fb = fLo + ((fHi - fLo) * (b + 1)) / NB;
              let m = 0;
              for (let k = Math.floor(fa / binHz); k <= Math.ceil(fb / binHz); k++) m = Math.max(m, freq[k] ?? 0);
              bars[b] = m / 255;
            }
          } else {
            for (let b = 0; b < NB; b++) {
              const fc = fLo + ((fHi - fLo) * (b + 0.5)) / NB;
              const bw = (fHi - fLo) / NB;
              const pk = (f: number): number => Math.exp(-(((fc - f) / (bw * 0.7)) ** 2));
              const target = Math.min(1, pk(f1) + pk(f2) + 0.05 + 0.03 * Math.sin(t * 9 + b));
              bars[b] = lerp(bars[b]!, target * (0.85 + 0.15 * Math.sin(t * 6 + b * 0.7)), 0.25);
            }
          }
          const bw = w / NB;
          for (let b = 0; b < NB; b++) {
            const v = bars[b]!;
            const col = new THREE.Color().setHSL(0.75 - (b / NB) * 0.6, 0.85, 0.6);
            g.fillStyle = `#${col.getHexString()}`;
            g.fillRect(b * bw + 1, by - v * bh, bw - 2, v * bh);
          }
          g.fillStyle = 'rgba(255,255,255,0.4)';
          g.fillRect(0, by, w, 1);
          const ratio = f2 / f1;
          const harm = Math.abs(ratio - 1.5) < 0.01 ? ' · 2:3 어울림(완전5도)' : Math.abs(ratio - 2) < 0.01 ? ' · 1:2 옥타브' : '';
          pill(g, `${f1}Hz + ${f2}Hz → 맥놀이 ${Math.abs(f2 - f1)}번/초${harm}`, 8, fs * 1.3, fs, 'rgba(0,0,0,0.4)');
          text(g, ctx ? '🔊 실제 소리 분석 중' : '그림만 (소리 끔)', w - 8, by - bh - fs * 0.6, fs * 0.85, ctx ? '#7affa0' : '#a8b0e0', 'right');
        },
        controls: [
          { type: 'button', label: '소리 켜기 / 끄기', on: () => (ctx ? stop() : start()) },
          {
            type: 'range',
            label: '두 번째 음 (Hz)',
            min: 440,
            max: 880,
            step: 2,
            value: 466,
            on: (v) => {
              f2 = v;
              if (o2 && ctx) o2.frequency.setTargetAtTime(v, ctx.currentTime, 0.02);
            },
          },
        ],
        dispose: stop,
      };
    },
  },

  /* ───── i53 L-시스템 ───── */
  i53: {
    kind: '2d',
    caption: '왼쪽: 규칙 X → F+[[X]-X]-F[-FX]+X 를 거북이가 그려 나무가 자람 · 오른쪽: 씨앗마다 137.5° 돌리면 해바라기 무늬',
    make() {
      const strs: string[] = ['X'];
      for (let d = 1; d <= 6; d++) {
        let s = '';
        for (const ch of strs[d - 1]!) s += ch === 'X' ? 'F+[[X]-X]-F[-FX]+X' : ch === 'F' ? 'FF' : ch;
        strs.push(s);
      }
      let depth = 5;
      let angle = 137.5;
      interface Seg {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
        d: number;
        tip: boolean;
      }
      const build = (sway: number): { segs: Seg[]; maxD: number; minX: number; maxX: number; maxY: number } => {
        const s = strs[depth]!;
        const segs: Seg[] = [];
        let x = 0;
        let y = 0;
        let a = -Math.PI / 2;
        let dist = 0;
        const st: [number, number, number, number][] = [];
        const turn = ((25 + sway * 2.5) * Math.PI) / 180;
        let minX = 0;
        let maxX = 0;
        let maxY = 0;
        for (let i = 0; i < s.length; i++) {
          const ch = s[i]!;
          if (ch === 'F') {
            const nx = x + Math.cos(a);
            const ny = y + Math.sin(a);
            segs.push({ x1: x, y1: y, x2: nx, y2: ny, d: dist, tip: s[i + 1] === ']' || s[i + 1] === 'X' });
            x = nx;
            y = ny;
            dist += 1;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, -y);
          } else if (ch === '+') a += turn;
          else if (ch === '-') a -= turn;
          else if (ch === '[') st.push([x, y, a, dist]);
          else if (ch === ']') [x, y, a, dist] = st.pop()!;
        }
        let maxD = 0;
        for (const sg of segs) maxD = Math.max(maxD, sg.d);
        return { segs, maxD, minX, maxX, maxY };
      };
      return {
        draw(g, w, h, t) {
          bg(g, w, h, '#fff6e0', '#e6f6d8');
          const fs = clamp(h * 0.05, 9, 18);
          // 나무
          const CYC = 6;
          const k = clamp(((t % CYC) / CYC) * 1.4, 0, 1);
          const T = build(Math.sin(t * 1.4));
          const lw = w * 0.56;
          const sc = Math.min((lw * 0.9) / (T.maxX - T.minX || 1), (h * 0.82) / (T.maxY || 1));
          const ox = lw / 2 - ((T.minX + T.maxX) / 2) * sc;
          const oy = h * 0.95;
          g.fillStyle = '#b8d89a';
          g.beginPath();
          g.ellipse(lw / 2, oy + 2, lw * 0.4, h * 0.04, 0, 0, TAU);
          g.fill();
          const lim = k * (T.maxD + 1);
          g.lineCap = 'round';
          for (let pass = 0; pass < 2; pass++) {
            g.beginPath();
            for (const sg of T.segs) {
              if (sg.d > lim) continue;
              const thick = sg.d < T.maxD * 0.3;
              if ((pass === 0) !== thick) continue;
              const f = clamp(lim - sg.d, 0, 1);
              g.moveTo(ox + sg.x1 * sc, oy + sg.y1 * sc);
              g.lineTo(ox + lerp(sg.x1, sg.x2, f) * sc, oy + lerp(sg.y1, sg.y2, f) * sc);
            }
            g.strokeStyle = pass === 0 ? '#7a4a2a' : '#5a8a3a';
            g.lineWidth = pass === 0 ? Math.max(1.5, sc * 0.9) : Math.max(0.8, sc * 0.5);
            g.stroke();
          }
          g.fillStyle = 'rgba(255,120,160,0.8)';
          for (const sg of T.segs) {
            if (!sg.tip || sg.d > lim - 1) continue;
            g.beginPath();
            g.arc(ox + sg.x2 * sc, oy + sg.y2 * sc, Math.max(1.2, sc * 0.9), 0, TAU);
            g.fill();
          }
          pill(g, `반복 ${depth}번 · 글자 ${strs[depth]!.length.toLocaleString()}개`, 8, fs * 1.3, fs, 'rgba(90,60,30,0.75)');
          // 해바라기
          const rx = w * 0.78;
          const ry = h * 0.5;
          const R = Math.min(w * 0.2, h * 0.42);
          const n = Math.floor(clamp(((t % CYC) / CYC) * 1.3, 0, 1) * 320);
          const c = R / Math.sqrt(320);
          const ang = (angle * Math.PI) / 180;
          for (let i = 0; i < n; i++) {
            const rr = c * Math.sqrt(i);
            const th = i * ang;
            g.fillStyle = i % 21 === 0 ? '#ff7a3a' : i % 2 ? '#c88a1a' : '#a8681a';
            g.beginPath();
            g.arc(rx + Math.cos(th) * rr, ry + Math.sin(th) * rr, c * 0.42, 0, TAU);
            g.fill();
          }
          text(g, `${angle}°`, rx, h - fs * 1.1, fs * 1.1, '#6a4a1a', 'center', FONT, '900');
        },
        controls: [
          { type: 'range', label: '규칙 반복 수', min: 1, max: 6, step: 1, value: 5, on: (v) => (depth = v) },
          { type: 'range', label: '씨앗 돌리는 각 (°)', min: 120, max: 160, step: 0.1, value: 137.5, on: (v) => (angle = v) },
        ],
      };
    },
  },

  /* ───── i54 지형 생성 ───── */
  i54: {
    kind: '3d',
    caption: '잡음(fbm)을 높이로 쓰면 섬이 생겨요 — 높이마다 바다 · 모래 · 풀 · 바위 · 눈, 몇 초마다 새 섬으로 바뀌며 등고선도',
    make() {
      const scene = new THREE.Scene();
      scene.background = skyTexture('#6ac0f0', '#e0f4ff');
      const cam = new THREE.PerspectiveCamera(40, 1.6, 0.1, 100);
      const SEG = 110;
      const SZ = 10;
      const geo = new THREE.PlaneGeometry(SZ, SZ, SEG, SEG);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes['position'] as THREE.BufferAttribute;
      const NV = pos.count;
      const island = (seed: number): Float32Array => {
        const n = makeNoise(seed);
        const out = new Float32Array(NV);
        for (let i = 0; i < NV; i++) {
          const x = pos.getX(i);
          const z = pos.getZ(i);
          const d = Math.hypot(x, z) / (SZ * 0.5);
          const hgt = fbm(n, x * 0.32 + 10, z * 0.32 + 10, 5);
          out[i] = (hgt * 1.25 - 0.12 - d * d * 0.85) * 3.2;
        }
        return out;
      };
      let seed = 1;
      let A = island(seed);
      let B = island(++seed);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uContour: { value: 1 }, uScale: { value: 1 } },
        vertexShader: /* glsl */ `
          uniform float uScale; varying float vH; varying vec3 vP;
          void main(){ vec3 p = position; p.y = max(p.y, -0.9) * uScale; vH = position.y; vP = (modelMatrix * vec4(p, 1.)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vP, 1.); }`,
        fragmentShader: /* glsl */ `
          uniform float uContour; varying float vH; varying vec3 vP;
          void main(){
            vec3 n = normalize(cross(dFdx(vP), dFdy(vP)));
            float l = max(dot(n, normalize(vec3(-0.5, 1.0, 0.4))), 0.) * 0.75 + 0.35;
            vec3 c;
            if (vH < 0.0) c = mix(vec3(0.85,0.8,0.55), vec3(0.2,0.45,0.6), clamp(-vH*1.5, 0., 1.));
            else if (vH < 0.18) c = vec3(0.96, 0.88, 0.62);
            else if (vH < 1.1) c = mix(vec3(0.45, 0.78, 0.3), vec3(0.22, 0.55, 0.22), (vH - 0.18) / 0.92);
            else if (vH < 1.8) c = mix(vec3(0.5, 0.45, 0.38), vec3(0.62, 0.58, 0.55), (vH - 1.1) / 0.7);
            else c = vec3(0.97, 0.98, 1.0);
            c *= l;
            float k = vH * 3.0; float f = fract(k); float d = min(f, 1. - f) / max(fwidth(k), 1e-4);
            float line = (1. - clamp(d, 0., 1.)) * step(0.0, vH) * uContour;
            c = mix(c, c * 0.45, line * 0.8);
            gl_FragColor = vec4(c, 1.);
            #include <colorspace_fragment>
          }`,
      });
      const land = new THREE.Mesh(geo, mat);
      scene.add(land);
      const sea = new THREE.Mesh(new THREE.CircleGeometry(9, 48), new THREE.MeshStandardMaterial({ color: 0x3a9ae0, transparent: true, opacity: 0.7, roughness: 0.2 }));
      sea.rotation.x = -Math.PI / 2;
      sea.position.y = 0.0;
      scene.add(sea);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x4a6a8a, 1.2));
      const dl = new THREE.DirectionalLight(0xffffff, 1.6);
      dl.position.set(-3, 6, 2);
      scene.add(dl);
      const apply = (k: number): void => {
        for (let i = 0; i < NV; i++) pos.setY(i, lerp(A[i]!, B[i]!, k));
        pos.needsUpdate = true;
      };
      apply(0);
      let phaseStart = 0;
      let lastK = -1;
      return {
        scene,
        camera: cam,
        update(t) {
          const lt = t - phaseStart;
          const k = ease(clamp((lt - 4) / 2, 0, 1));
          if (k !== lastK) {
            apply(k);
            lastK = k;
          }
          if (lt > 6) {
            phaseStart = t;
            A = B;
            B = island(++seed);
            lastK = -1;
          }
          const a = t * 0.12;
          cam.position.set(Math.sin(a) * 11, 7.5, Math.cos(a) * 11);
          cam.lookAt(0, 0, 0);
        },
        controls: [
          { type: 'toggle', label: '등고선', value: true, on: (v) => (mat.uniforms['uContour']!.value = v ? 1 : 0) },
          { type: 'range', label: '높이 배율', min: 0.3, max: 2, step: 0.05, value: 1, on: (v) => (mat.uniforms['uScale']!.value = v) },
          { type: 'button', label: '새 섬', on: () => (phaseStart = -100) },
        ],
        dispose() {
          disposeScene(scene);
          (scene.background as THREE.Texture).dispose();
        },
      };
    },
  },

  /* ───── i55 도형 모핑 ───── */
  i55: {
    kind: '2d',
    caption: '원을 부채꼴로 잘라 엇갈려 놓으면 직사각형에 가까워져요 — 조각은 그대로라 넓이 보존: πr × r = πr²',
    make() {
      let n = 8;
      return {
        draw(g, w, h, t) {
          bg(g, w, h, '#f4f0ff', '#e2ecff');
          const fs = clamp(h * 0.055, 9, 22);
          const CYC = 6;
          const lt = t % CYC;
          const u = lt < 1 ? 0 : lt < 2.6 ? ease((lt - 1) / 1.6) : lt < 4.6 ? 1 : lt < 5.6 ? 1 - ease((lt - 4.6) / 1) : 0;
          const N2 = n * 2;
          const al = Math.PI / N2;
          const R = Math.min(h * 0.3, (w * 0.86) / (Math.PI + 0.6));
          const s = (2 * Math.PI * R) / N2;
          const cx0 = w / 2;
          const cy0 = h * 0.47;
          const rectW = Math.PI * R;
          const x0 = w / 2 - rectW / 2 - s / 4;
          const yTop = cy0 - R / 2;
          for (let j = 0; j < N2; j++) {
            const phi0 = (j + 0.5) * 2 * al;
            const upper = phi0 > Math.PI;
            const m = upper ? j - n : n - 1 - j;
            const tx = upper ? x0 + s + m * s : x0 + s / 2 + m * s;
            const ty = upper ? yTop + R : yTop;
            const tphi = upper ? -Math.PI / 2 : Math.PI / 2;
            let dphi = tphi - phi0;
            while (dphi > Math.PI) dphi -= TAU;
            while (dphi < -Math.PI) dphi += TAU;
            const ax = lerp(cx0, tx, u);
            const ay = lerp(cy0, ty, u);
            const phi = phi0 + dphi * u;
            g.beginPath();
            g.moveTo(ax, ay);
            g.arc(ax, ay, R, phi - al, phi + al);
            g.closePath();
            g.fillStyle = upper ? (j % 2 ? '#ff8aa8' : '#ff6a90') : j % 2 ? '#6ab8ff' : '#4aa0f0';
            g.fill();
            g.strokeStyle = '#ffffff';
            g.lineWidth = 1.2;
            g.stroke();
          }
          // 치수
          const show = clamp((lt - 2.6) / 0.4, 0, 1) * (lt < 4.6 ? 1 : clamp(1 - (lt - 4.6) / 0.3, 0, 1));
          if (show > 0) {
            g.globalAlpha = show;
            g.strokeStyle = '#30406a';
            g.lineWidth = 1.5;
            g.beginPath();
            g.moveTo(x0 + s / 4, yTop + R + fs * 0.9);
            g.lineTo(x0 + s / 4 + rectW, yTop + R + fs * 0.9);
            g.moveTo(x0 + s / 4 + rectW + fs * 0.6, yTop);
            g.lineTo(x0 + s / 4 + rectW + fs * 0.6, yTop + R);
            g.stroke();
            text(g, 'πr (둘레의 반)', x0 + s / 4 + rectW / 2, yTop + R + fs * 1.8, fs, '#30406a', 'center', FONT, '800');
            text(g, 'r', x0 + s / 4 + rectW + fs * 1.2, yTop + R / 2, fs * 1.1, '#30406a', 'left', 'Georgia, serif', 'italic 700');
            g.globalAlpha = 1;
          }
          g.font = `italic 700 ${fs * 1.2}px Georgia, "Times New Roman", serif`;
          g.textAlign = 'center';
          g.fillStyle = '#30406a';
          g.fillText(u < 0.5 ? 'S = 원의 넓이' : 'S = πr × r = πr²', w / 2, fs * 1.4);
          pill(g, `조각 ${N2}개`, w - 8, h - fs * 1.2, fs * 0.85, 'rgba(48,64,106,0.8)', '#fff', 'right');
        },
        controls: [{ type: 'range', label: '반쪽 조각 수', min: 3, max: 24, step: 1, value: 8, on: (v) => (n = v) }],
      };
    },
  },
};

import * as THREE from 'three';
import type { Control, DemoMap, Scene3D } from './types';

/**
 * 견본 — 스킬 VFX (마법 · 미사일) 둘째 묶음  i184 ~ i196
 * 디아블로 같은 액션 RPG 의 마법 효과: 더해지는(additive) 빛 입자 · HDR 하얀 핵 · 겹 빛무리 · 불티 · 연기 · 바닥 빛.
 * 모두 어두운 돌바닥 위를 3/4 위에서 내려다보는 구도. 입자 도구(Pool · Streaks)는 이 파일 안에서만 쓴다.
 */

type V3 = [number, number, number];
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const sstep = (e0: number, e1: number, x: number): number => {
  const k = clamp((x - e0) / (e1 - e0), 0, 1);
  return k * k * (3 - 2 * k);
};
const easeOut = (k: number): number => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const rr = (a: number, b: number): number => a + (b - a) * Math.random();
function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
/** 16진 색 → 선형 RGB × k (k > 1 이면 HDR — 톤 매핑에서 하얗게 타오른다) */
function C(hex: number, k = 1): V3 {
  const c = new THREE.Color(hex);
  return [c.r * k, c.g * k, c.b * k];
}
function HSL(h: number, s: number, l: number, k = 1): V3 {
  const c = new THREE.Color().setHSL(((h % 1) + 1) % 1, s, l);
  return [c.r * k, c.g * k, c.b * k];
}
const mix3 = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const sc3 = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len3 = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const norm3 = (a: V3): V3 => {
  const l = len3(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
function randDir(): V3 {
  const u = Math.random() * 2 - 1;
  const a = Math.random() * TAU;
  const r = Math.sqrt(1 - u * u);
  return [r * Math.cos(a), u, r * Math.sin(a)];
}
const toV = (p: V3): THREE.Vector3 => new THREE.Vector3(p[0], p[1], p[2]);
const ofV = (v: THREE.Vector3): V3 => [v.x, v.y, v.z];

/* ═════════════════════ 입자 도구 ═════════════════════ */

interface Part {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  age: number; life: number;
  s0: number; s1: number;
  r: number; g: number; b: number;
  r2: number; g2: number; b2: number;
  a: number; fi: number;
  drag: number; grav: number;
  rot: number; spin: number;
  px: number; py: number; pz: number; pull: number;
  len: number; w: number; tail: number;
}
interface EmitO {
  p: V3;
  v?: V3;
  life: number;
  size?: number;
  size2?: number;
  c: V3;
  c2?: V3;
  a?: number;
  fadeIn?: number;
  drag?: number;
  grav?: number;
  rot?: number;
  spin?: number;
  /** 이 점으로 빨려 들어감 (k = 세기) */
  pull?: { at: V3; k: number };
  /** 줄 입자: 속도 × len 만큼 늘어남 */
  len?: number;
  w?: number;
  tail?: number;
}
function newPart(): Part {
  return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, s0: 1, s1: 1, r: 1, g: 1, b: 1, r2: 1, g2: 1, b2: 1, a: 1, fi: 0.1, drag: 0, grav: 0, rot: 0, spin: 0, px: 0, py: 0, pz: 0, pull: 0, len: 0.05, w: 0.03, tail: 0 };
}
function initPart(q: Part, o: EmitO): void {
  q.x = o.p[0]; q.y = o.p[1]; q.z = o.p[2];
  const v = o.v ?? [0, 0, 0];
  q.vx = v[0]; q.vy = v[1]; q.vz = v[2];
  q.age = 0; q.life = Math.max(0.01, o.life);
  q.s0 = o.size ?? 0.3; q.s1 = o.size2 ?? q.s0;
  q.r = o.c[0]; q.g = o.c[1]; q.b = o.c[2];
  const c2 = o.c2 ?? o.c;
  q.r2 = c2[0]; q.g2 = c2[1]; q.b2 = c2[2];
  q.a = o.a ?? 1; q.fi = o.fadeIn ?? 0.1;
  q.drag = o.drag ?? 0; q.grav = o.grav ?? 0;
  q.rot = o.rot ?? Math.random() * TAU; q.spin = o.spin ?? 0;
  if (o.pull) {
    q.px = o.pull.at[0]; q.py = o.pull.at[1]; q.pz = o.pull.at[2]; q.pull = o.pull.k;
  } else q.pull = 0;
  q.len = o.len ?? 0.05; q.w = o.w ?? 0.03; q.tail = o.tail ?? 0;
}
function simPart(q: Part, d: number): boolean {
  q.age += d;
  if (q.age >= q.life) return false;
  if (q.pull > 0) {
    const dx = q.px - q.x, dy = q.py - q.y, dz = q.pz - q.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    const dist = Math.sqrt(d2);
    if (dist < 0.09) return false;
    const acc = (q.pull / (d2 + 0.08)) * d;
    q.vx += (dx / dist) * acc; q.vy += (dy / dist) * acc; q.vz += (dz / dist) * acc;
  }
  const dr = Math.max(0, 1 - q.drag * d);
  q.vx *= dr; q.vy *= dr; q.vz *= dr;
  q.vy -= q.grav * d;
  q.x += q.vx * d; q.y += q.vy * d; q.z += q.vz * d;
  q.rot += q.spin * d;
  return true;
}
function partAlpha(q: Part): number {
  const k = q.age / q.life;
  return q.a * (q.fi > 0 ? Math.min(1, k / q.fi) : 1) * (1 - k);
}

const TONE = `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

const PV = `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor; attribute float aRot;
uniform float uScale;
varying vec3 vC; varying float vA; varying float vR;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.05), 0.0, 1024.0);
  vC = aColor; vA = aAlpha; vR = aRot;
}`;
const PF = `
uniform sampler2D uMap;
varying vec3 vC; varying float vA; varying float vR;
void main(){
  vec2 p = gl_PointCoord - 0.5;
#ifdef USE_TEX
  p.y = -p.y;
  float c = cos(vR), s = sin(vR);
  p = mat2(c, -s, s, c) * p;
  vec4 tx = texture2D(uMap, p + 0.5);
  gl_FragColor = vec4(vC * tx.rgb, tx.a * vA);
#else
  float d = length(p) * 2.0;
  float a = (exp(-d * d * 3.2) - 0.0408) / 0.9592;
  if (a <= 0.0) discard;
  gl_FragColor = vec4(vC, a * vA);
#endif
  ${TONE}
}`;

/** 빛 점 입자 풀 — Points + 입자마다 크기 · 색 · 투명도 · 회전. put() 은 이 프레임만 그릴 점(핵 · 빛무리) */
class Pool {
  readonly obj: THREE.Points;
  readonly mat: THREE.ShaderMaterial;
  private geo = new THREE.BufferGeometry();
  private ps: Part[] = [];
  private n = 0;
  private k = 0;
  private max: number;
  private pos: Float32Array; private col: Float32Array; private siz: Float32Array; private alp: Float32Array; private rot: Float32Array;
  constructor(readonly cap: number, opt: { normal?: boolean; map?: THREE.Texture | null } = {}) {
    this.max = cap + 256;
    this.pos = new Float32Array(this.max * 3);
    this.col = new Float32Array(this.max * 3);
    this.siz = new Float32Array(this.max);
    this.alp = new Float32Array(this.max);
    this.rot = new Float32Array(this.max);
    const at = (a: Float32Array, n: number): THREE.BufferAttribute => new THREE.BufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', at(this.pos, 3));
    this.geo.setAttribute('aColor', at(this.col, 3));
    this.geo.setAttribute('aSize', at(this.siz, 1));
    this.geo.setAttribute('aAlpha', at(this.alp, 1));
    this.geo.setAttribute('aRot', at(this.rot, 1));
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 300 }, uMap: { value: opt.map ?? null } },
      vertexShader: PV,
      fragmentShader: PF,
      defines: opt.map ? { USE_TEX: '' } : {},
      transparent: true,
      depthWrite: false,
      blending: opt.normal ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    this.obj = new THREE.Points(this.geo, this.mat);
    this.obj.frustumCulled = false;
    for (let i = 0; i < cap; i++) this.ps.push(newPart());
  }
  emit(o: EmitO): void {
    if (this.n >= this.cap) return;
    initPart(this.ps[this.n++]!, o);
  }
  put(p: V3, size: number, c: V3, a: number, rot = 0): void {
    if (this.k >= this.max || a <= 0.002) return;
    this.write(this.k++, p[0], p[1], p[2], size, c[0], c[1], c[2], a, rot);
  }
  private write(i: number, x: number, y: number, z: number, s: number, r: number, g: number, b: number, a: number, ro: number): void {
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.siz[i] = s; this.alp[i] = a; this.rot[i] = ro;
  }
  step(dt: number, ts?: (q: Part) => number): void {
    let i = 0;
    while (i < this.n) {
      const q = this.ps[i]!;
      if (!simPart(q, dt * (ts ? ts(q) : 1))) {
        this.n--;
        this.ps[i] = this.ps[this.n]!;
        this.ps[this.n] = q;
        continue;
      }
      i++;
    }
    for (i = 0; i < this.n && this.k < this.max; i++) {
      const q = this.ps[i]!;
      const kk = q.age / q.life;
      this.write(this.k++, q.x, q.y, q.z, lerp(q.s0, q.s1, kk), lerp(q.r, q.r2, kk), lerp(q.g, q.g2, kk), lerp(q.b, q.b2, kk), partAlpha(q), q.rot);
    }
    for (const nm of ['position', 'aColor', 'aSize', 'aAlpha', 'aRot']) (this.geo.getAttribute(nm) as THREE.BufferAttribute).needsUpdate = true;
    this.geo.setDrawRange(0, this.k);
    this.k = 0;
  }
  setScale(h: number, fov: number): void {
    this.mat.uniforms.uScale!.value = h / (2 * Math.tan((fov * Math.PI) / 360));
  }
  clear(): void {
    this.n = 0;
  }
}

const SV = `
attribute vec3 iA; attribute vec3 iB; attribute vec3 iC; attribute vec4 iW;
varying float vS; varying float vY; varying float vL; varying vec3 vC; varying float vA; varying float vT;
void main(){
  vec4 a = modelViewMatrix * vec4(iA, 1.0);
  vec4 b = modelViewMatrix * vec4(iB, 1.0);
  vec2 d = b.xy - a.xy; float L = length(d);
  vec2 dir = L > 1e-5 ? d / L : vec2(1.0, 0.0);
  vec2 side = vec2(-dir.y, dir.x);
  float w = max(iW.x, 1e-4);
  float lw = L / w;
  float s = position.x * (lw + 2.0) - 1.0;
  vec3 p = vec3(a.xy + dir * s * w + side * w * position.y, mix(a.z, b.z, clamp(s / max(lw, 1e-4), 0.0, 1.0)));
  gl_Position = projectionMatrix * vec4(p, 1.0);
  vS = s; vY = position.y; vL = lw; vC = iC; vA = iW.y; vT = iW.z;
}`;
const SF = `
varying float vS; varying float vY; varying float vL; varying vec3 vC; varying float vA; varying float vT;
void main(){
  float dx = max(max(-vS, vS - vL), 0.0);
  float ac = clamp(1.0 - length(vec2(dx, vY)), 0.0, 1.0);
  if (ac <= 0.0) discard;
  float along = mix(vT, 1.0, clamp(vS / max(vL, 1e-4), 0.0, 1.0));
  float glow = ac * ac;
  float core = pow(ac, 7.0);
  vec3 col = vC * glow + vec3(core * (0.45 + 0.55 * max(vC.r, max(vC.g, vC.b))));
  gl_FragColor = vec4(col, vA * along);
  ${TONE}
}`;

/** 줄 입자 · 선분 — 화면을 보는 캡슐 띠 (가운데 하얀 심 + 색 빛). 번개 · 불티 · 꼬리 · 빛살 */
class Streaks {
  readonly mesh: THREE.Mesh;
  private geo = new THREE.InstancedBufferGeometry();
  private A: Float32Array; private B: Float32Array; private Cc: Float32Array; private W: Float32Array;
  private atts: THREE.InstancedBufferAttribute[];
  private ps: Part[] = [];
  private n = 0;
  private k = 0;
  private max: number;
  constructor(readonly cap: number) {
    this.max = cap + 512;
    this.A = new Float32Array(this.max * 3);
    this.B = new Float32Array(this.max * 3);
    this.Cc = new Float32Array(this.max * 3);
    this.W = new Float32Array(this.max * 4);
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, -1, 0, 1, -1, 0, 0, 1, 0, 1, 1, 0]), 3));
    this.geo.setIndex([0, 1, 2, 2, 1, 3]);
    const mk = (a: Float32Array, n: number): THREE.InstancedBufferAttribute => {
      const at = new THREE.InstancedBufferAttribute(a, n);
      at.setUsage(THREE.DynamicDrawUsage);
      return at;
    };
    this.atts = [mk(this.A, 3), mk(this.B, 3), mk(this.Cc, 3), mk(this.W, 4)];
    this.geo.setAttribute('iA', this.atts[0]!);
    this.geo.setAttribute('iB', this.atts[1]!);
    this.geo.setAttribute('iC', this.atts[2]!);
    this.geo.setAttribute('iW', this.atts[3]!);
    this.geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({ vertexShader: SV, fragmentShader: SF, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < cap; i++) this.ps.push(newPart());
  }
  /** 이 프레임만 그릴 선분 (w = 반폭) */
  seg(a: V3, b: V3, w: number, c: V3, al: number, tail = 1): void {
    if (this.k >= this.max || al <= 0.002) return;
    this.write(this.k++, a[0], a[1], a[2], b[0], b[1], b[2], w, c[0], c[1], c[2], al, tail);
  }
  /** 날아가는 줄 불티 */
  spark(o: EmitO): void {
    if (this.n >= this.cap) return;
    initPart(this.ps[this.n++]!, o);
  }
  private write(i: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number, r: number, g: number, b: number, al: number, tail: number): void {
    const A = this.A, B = this.B, Cc = this.Cc, W = this.W;
    A[i * 3] = ax; A[i * 3 + 1] = ay; A[i * 3 + 2] = az;
    B[i * 3] = bx; B[i * 3 + 1] = by; B[i * 3 + 2] = bz;
    Cc[i * 3] = r; Cc[i * 3 + 1] = g; Cc[i * 3 + 2] = b;
    W[i * 4] = w; W[i * 4 + 1] = al; W[i * 4 + 2] = tail; W[i * 4 + 3] = 0;
  }
  step(dt: number, ts?: (q: Part) => number): void {
    let i = 0;
    while (i < this.n) {
      const q = this.ps[i]!;
      if (!simPart(q, dt * (ts ? ts(q) : 1))) {
        this.n--;
        this.ps[i] = this.ps[this.n]!;
        this.ps[this.n] = q;
        continue;
      }
      i++;
    }
    for (i = 0; i < this.n && this.k < this.max; i++) {
      const q = this.ps[i]!;
      const kk = q.age / q.life;
      const L = q.len;
      this.write(this.k++, q.x - q.vx * L, q.y - q.vy * L, q.z - q.vz * L, q.x, q.y, q.z, q.w * (1 - kk * 0.6), lerp(q.r, q.r2, kk), lerp(q.g, q.g2, kk), lerp(q.b, q.b2, kk), partAlpha(q), q.tail);
    }
    for (const at of this.atts) at.needsUpdate = true;
    this.geo.instanceCount = this.k;
    this.k = 0;
  }
  clear(): void {
    this.n = 0;
  }
}

/* ═════════════════════ 그림 (캔버스 텍스처) ═════════════════════ */

function cv(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}
function glowCanvas(): HTMLCanvasElement {
  const [c, g] = cv(128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  gr.addColorStop(0.6, 'rgba(255,255,255,0.14)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return c;
}
function shadowCanvas(): HTMLCanvasElement {
  const [c, g] = cv(64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.85)');
  gr.addColorStop(0.55, 'rgba(0,0,0,0.45)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return c;
}
function ringCanvas(): HTMLCanvasElement {
  const [c, g] = cv(256);
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.62, 'rgba(255,255,255,0.05)');
  gr.addColorStop(0.84, 'rgba(255,255,255,0.55)');
  gr.addColorStop(0.9, 'rgba(255,255,255,1)');
  gr.addColorStop(0.95, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  return c;
}
/** 마법진: 겹 원 · 육망성 · 룬 글자 */
function runeCanvas(seed = 3): HTMLCanvasElement {
  const S = 512;
  const [c, g] = cv(S);
  const rnd = rng(seed);
  g.translate(S / 2, S / 2);
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  g.shadowColor = '#fff';
  g.shadowBlur = 10;
  g.lineCap = 'round';
  const circle = (r: number, lw: number): void => {
    g.lineWidth = lw;
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.stroke();
  };
  circle(242, 7);
  circle(226, 2.5);
  circle(176, 4);
  circle(164, 1.5);
  circle(62, 3);
  // 룬 글자 띠
  const N = 30;
  for (let i = 0; i < N; i++) {
    g.save();
    g.rotate((i / N) * TAU);
    g.translate(0, -201);
    g.lineWidth = 3;
    g.beginPath();
    const k = 3 + Math.floor(rnd() * 3);
    for (let j = 0; j < k; j++) {
      const x0 = (rnd() - 0.5) * 16, y0 = (rnd() - 0.5) * 18;
      g.moveTo(x0, y0);
      g.lineTo(x0 + (rnd() - 0.5) * 18, y0 + (rnd() - 0.5) * 20);
    }
    g.stroke();
    if (rnd() < 0.4) {
      g.beginPath();
      g.arc(0, 0, 3.5, 0, TAU);
      g.fill();
    }
    g.restore();
  }
  // 육망성
  g.lineWidth = 4;
  for (const off of [0, Math.PI]) {
    g.beginPath();
    for (let i = 0; i <= 3; i++) {
      const a = off - Math.PI / 2 + (i / 3) * TAU;
      const x = Math.cos(a) * 164, y = Math.sin(a) * 164;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i / 6) * TAU;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(Math.cos(a) * 164, Math.sin(a) * 164, 13, 0, TAU);
    g.stroke();
  }
  // 가운데 별
  g.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    const r = i % 2 ? 18 : 48;
    if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.lineWidth = 2.5;
  g.stroke();
  return c;
}
function puffCanvas(): HTMLCanvasElement {
  const [c, g] = cv(128);
  const rnd = rng(11);
  for (let i = 0; i < 26; i++) {
    const a = rnd() * TAU, d = rnd() * 26;
    const x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d;
    const r = 18 + rnd() * 22;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const l = 200 + Math.floor(rnd() * 55);
    gr.addColorStop(0, `rgba(${l},${l},${l},0.32)`);
    gr.addColorStop(1, `rgba(${l},${l},${l},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  }
  // 가장자리 부드럽게
  g.globalCompositeOperation = 'destination-in';
  const m = g.createRadialGradient(64, 64, 20, 64, 64, 64);
  m.addColorStop(0, 'rgba(0,0,0,1)');
  m.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = m;
  g.fillRect(0, 0, 128, 128);
  return c;
}
function skullCanvas(): HTMLCanvasElement {
  const [c, g] = cv(128);
  g.shadowColor = '#fff';
  g.shadowBlur = 12;
  g.fillStyle = '#fff';
  g.beginPath();
  g.ellipse(64, 54, 36, 34, 0, 0, TAU);
  g.fill();
  g.beginPath();
  g.roundRect(42, 70, 44, 30, 8);
  g.fill();
  g.shadowBlur = 0;
  g.globalCompositeOperation = 'destination-out';
  g.beginPath();
  g.ellipse(50, 58, 10, 12, 0.2, 0, TAU);
  g.ellipse(78, 58, 10, 12, -0.2, 0, TAU);
  g.fill();
  g.beginPath();
  g.moveTo(64, 70);
  g.lineTo(58, 80);
  g.lineTo(70, 80);
  g.closePath();
  g.fill();
  g.fillRect(52, 88, 3, 13);
  g.fillRect(62, 88, 3, 13);
  g.fillRect(72, 88, 3, 13);
  return c;
}
function plusCanvas(): HTMLCanvasElement {
  const [c, g] = cv(64);
  g.shadowColor = '#fff';
  g.shadowBlur = 8;
  g.fillStyle = '#fff';
  g.beginPath();
  g.roundRect(26, 10, 12, 44, 5);
  g.roundRect(10, 26, 44, 12, 5);
  g.fill();
  return c;
}
function bubbleCanvas(): HTMLCanvasElement {
  const [c, g] = cv(64);
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(32, 32, 24, 0, TAU);
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath();
  g.ellipse(24, 22, 6, 4, -0.6, 0, TAU);
  g.fill();
  return c;
}
function clockCanvas(): HTMLCanvasElement {
  const S = 512;
  const [c, g] = cv(S);
  g.translate(S / 2, S / 2);
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  g.shadowColor = '#fff';
  g.shadowBlur = 8;
  g.lineWidth = 5;
  g.beginPath();
  g.arc(0, 0, 238, 0, TAU);
  g.stroke();
  g.lineWidth = 2;
  g.beginPath();
  g.arc(0, 0, 222, 0, TAU);
  g.stroke();
  for (let i = 0; i < 60; i++) {
    g.save();
    g.rotate((i / 60) * TAU);
    g.lineWidth = i % 5 ? 2 : 6;
    g.beginPath();
    g.moveTo(0, -214);
    g.lineTo(0, i % 5 ? -200 : -182);
    g.stroke();
    g.restore();
  }
  g.font = '700 46px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const nums = ['XII', 'III', 'VI', 'IX'];
  nums.forEach((s, i) => {
    const a = -Math.PI / 2 + (i / 4) * TAU;
    g.fillText(s, Math.cos(a) * 148, Math.sin(a) * 148);
  });
  g.lineWidth = 2;
  g.beginPath();
  g.arc(0, 0, 100, 0, TAU);
  g.stroke();
  return c;
}
function handCanvas(long: boolean): HTMLCanvasElement {
  const [c, g] = cv(64, 512);
  g.fillStyle = '#fff';
  g.shadowColor = '#fff';
  g.shadowBlur = 8;
  const top = long ? 40 : 120;
  g.beginPath();
  g.moveTo(32, top);
  g.lineTo(42, top + 40);
  g.lineTo(35, 256);
  g.lineTo(29, 256);
  g.lineTo(22, top + 40);
  g.closePath();
  g.fill();
  g.beginPath();
  g.arc(32, 256, 12, 0, TAU);
  g.fill();
  return c;
}
/** 용암 금 (유성 바위 빛 무늬) */
function lavaCanvas(): HTMLCanvasElement {
  const [c, g] = cv(256);
  g.fillStyle = '#100503';
  g.fillRect(0, 0, 256, 256);
  const rnd = rng(5);
  g.strokeStyle = '#ff7a1a';
  g.shadowColor = '#ff4000';
  g.shadowBlur = 10;
  g.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    let x = rnd() * 256, y = rnd() * 256;
    g.lineWidth = 2 + rnd() * 4;
    g.beginPath();
    g.moveTo(x, y);
    for (let j = 0; j < 6; j++) {
      x += (rnd() - 0.5) * 50;
      y += (rnd() - 0.5) * 50;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return c;
}
/** 어두운 돌바닥 (판석 · 틈 · 얼룩) */
function stoneCanvas(): HTMLCanvasElement {
  const S = 512;
  const [c, g] = cv(S);
  const rnd = rng(7);
  g.fillStyle = '#060508';
  g.fillRect(0, 0, S, S);
  const rows = 7;
  const rh = S / rows;
  for (let r = 0; r < rows; r++) {
    const x0 = rnd() * S;
    let x = x0;
    while (x < x0 + S) {
      const w = Math.min(rh * (0.9 + rnd() * 1.1), x0 + S - x);
      const l = 13 + rnd() * 10;
      const hue = 25 + rnd() * 30;
      const sat = 4 + rnd() * 7;
      for (const ox of [0, -S]) {
        const gx = x + ox + 2.5, gy = r * rh + 2.5, gw = w - 5, gh = rh - 5;
        const gr = g.createLinearGradient(gx, gy, gx + gw * 0.4, gy + gh);
        gr.addColorStop(0, `hsl(${hue},${sat}%,${l + 5}%)`);
        gr.addColorStop(1, `hsl(${hue},${sat}%,${l - 3}%)`);
        g.fillStyle = gr;
        g.beginPath();
        g.roundRect(gx, gy, gw, gh, 7);
        g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.07)';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(gx + 6, gy + 1);
        g.lineTo(gx + gw - 6, gy + 1);
        g.stroke();
      }
      x += w;
    }
  }
  // 얼룩 · 금
  for (let i = 0; i < 40; i++) {
    const x = rnd() * S, y = rnd() * S, r = 10 + rnd() * 40;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(0,0,0,${0.12 + rnd() * 0.15})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.strokeStyle = 'rgba(0,0,0,0.55)';
  g.lineWidth = 1.2;
  for (let i = 0; i < 26; i++) {
    let x = rnd() * S, y = rnd() * S;
    g.beginPath();
    g.moveTo(x, y);
    for (let j = 0; j < 4; j++) {
      x += (rnd() - 0.5) * 28;
      y += (rnd() - 0.5) * 28;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  const im = g.getImageData(0, 0, S, S);
  const d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 16;
    d[i] = clamp(d[i]! + n, 0, 255);
    d[i + 1] = clamp(d[i + 1]! + n, 0, 255);
    d[i + 2] = clamp(d[i + 2]! + n, 0, 255);
  }
  g.putImageData(im, 0, 0);
  return c;
}

class Tex {
  private m = new Map<string, THREE.Texture>();
  get(name: string, make: () => HTMLCanvasElement): THREE.Texture {
    let t = this.m.get(name);
    if (!t) {
      t = new THREE.CanvasTexture(make());
      t.colorSpace = THREE.SRGBColorSpace;
      this.m.set(name, t);
    }
    return t;
  }
  glow = (): THREE.Texture => this.get('glow', glowCanvas);
  shadow = (): THREE.Texture => this.get('shadow', shadowCanvas);
  ring = (): THREE.Texture => this.get('ring', ringCanvas);
  rune = (): THREE.Texture => this.get('rune', () => runeCanvas(3));
  puff = (): THREE.Texture => this.get('puff', puffCanvas);
  skull = (): THREE.Texture => this.get('skull', skullCanvas);
  plus = (): THREE.Texture => this.get('plus', plusCanvas);
  bubble = (): THREE.Texture => this.get('bubble', bubbleCanvas);
  clock = (): THREE.Texture => this.get('clock', clockCanvas);
  hand = (long: boolean): THREE.Texture => this.get('hand' + long, () => handCanvas(long));
  lava = (): THREE.Texture => this.get('lava', lavaCanvas);
  dispose(): void {
    for (const t of this.m.values()) t.dispose();
    this.m.clear();
  }
}

/* ═════════════════════ 무대 ═════════════════════ */

const NOISE = `
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
float h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;

interface Arena {
  scene: THREE.Scene;
  cam: THREE.PerspectiveCamera;
  fx: Pool;
  st: Streaks;
  tx: Tex;
  pools: Pool[];
  addPool(p: Pool): Pool;
  shake(a: number): void;
  tickCam(dt: number): void;
  resize(w: number, h: number): void;
  dispose(): void;
}
function arena(o: { cam?: V3; look?: V3; fx?: number; st?: number; amb?: number } = {}): Arena {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050409);
  scene.fog = new THREE.Fog(0x050409, 9, 19);
  const cam = new THREE.PerspectiveCamera(40, 1.6, 0.1, 60);
  const base = toV(o.cam ?? [0, 7.2, 7.4]);
  const look = toV(o.look ?? [0, 0.4, 0]);
  cam.position.copy(base);
  cam.lookAt(look);
  const tx = new Tex();
  // 돌바닥
  const st = new THREE.CanvasTexture(stoneCanvas());
  st.colorSpace = THREE.SRGBColorSpace;
  st.wrapS = st.wrapT = THREE.RepeatWrapping;
  st.repeat.set(3.6, 3.6);
  st.anisotropy = 4;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 26),
    new THREE.MeshStandardMaterial({ map: st, bumpMap: st, bumpScale: 3, roughness: 0.82, metalness: 0.05 }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  scene.add(new THREE.HemisphereLight(0xa8acc8, 0x2a2018, o.amb ?? 0.75));
  const moon = new THREE.DirectionalLight(0xc4ccff, 1.1);
  moon.position.set(-3, 8, -4);
  scene.add(moon);
  const fx = new Pool(o.fx ?? 900);
  const sk = new Streaks(o.st ?? 400);
  fx.obj.renderOrder = 5;
  sk.mesh.renderOrder = 6;
  scene.add(fx.obj, sk.mesh);
  const pools: Pool[] = [fx];
  let amp = 0;
  const A: Arena = {
    scene,
    cam,
    fx,
    st: sk,
    tx,
    pools,
    addPool(p) {
      pools.push(p);
      scene.add(p.obj);
      return p;
    },
    shake(a) {
      amp = Math.max(amp, a);
    },
    tickCam(dt) {
      amp *= Math.exp(-dt * 7);
      cam.position.set(base.x + (Math.random() - 0.5) * amp, base.y + (Math.random() - 0.5) * amp, base.z + (Math.random() - 0.5) * amp * 0.6);
      cam.lookAt(look);
    },
    resize(_w, h) {
      for (const p of pools) p.setScale(h, cam.fov);
    },
    dispose() {
      disposeAll(scene);
      tx.dispose();
    },
  };
  return A;
}
function disposeAll(root: THREE.Object3D): void {
  const geos = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>();
  const texs = new Set<THREE.Texture>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) geos.add(m.geometry);
    const ms = (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) as THREE.Material[];
    for (const mt of ms) {
      mats.add(mt);
      for (const v of Object.values(mt)) if (v && (v as THREE.Texture).isTexture) texs.add(v as THREE.Texture);
      const u = (mt as THREE.ShaderMaterial).uniforms;
      if (u) for (const k of Object.keys(u)) {
        const v = u[k]!.value as THREE.Texture | null;
        if (v && v.isTexture) texs.add(v);
      }
    }
  });
  geos.forEach((g) => g.dispose());
  mats.forEach((m) => m.dispose());
  texs.forEach((t) => t.dispose());
}
/** 바닥에 붙은 빛 판 (더하기) · 그늘 판 (보통) */
function decal(tex: THREE.Texture, size: number, c: V3, opacity = 1, normal = false): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(c[0], c[1], c[2]), transparent: true, opacity, depthWrite: false, blending: normal ? THREE.NormalBlending : THREE.AdditiveBlending }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = normal ? 0.012 : 0.02;
  m.scale.setScalar(size);
  m.renderOrder = normal ? 1 : 2;
  return m;
}
/** 순간 점광 — kick 하면 번쩍, 저절로 꺼짐 */
class Flash {
  readonly light: THREE.PointLight;
  lv = 0;
  constructor(color: number, readonly peak: number, readonly fall = 9, dist = 9) {
    this.light = new THREE.PointLight(color, 0, dist, 2);
  }
  kick(p: V3, k = 1): void {
    this.light.position.set(p[0], Math.max(0.5, p[1]), p[2]);
    this.lv = Math.max(this.lv, k);
  }
  tick(dt: number, base = 0): void {
    this.lv *= Math.exp(-dt * this.fall);
    this.light.intensity = this.peak * this.lv + base;
  }
}
/** 고리 시간 — 다시 쏘기 · 사건 시각 넘김 확인 */
class Loop {
  private start = 0;
  private last = 0;
  private a = -1;
  private b = -1;
  private wrap = false;
  constructor(public P: number) {}
  tick(t: number): number {
    this.last = t;
    let lt = (t - this.start) % this.P;
    if (lt < 0) lt += this.P;
    this.wrap = this.b >= 0 && lt < this.b;
    this.a = this.b;
    this.b = lt;
    return lt;
  }
  /** 이번 프레임에 시각 e 를 지났나 */
  hit(e: number): boolean {
    if (this.a < 0) return e <= this.b;
    if (this.wrap) return e > this.a || e <= this.b;
    return e > this.a && e <= this.b;
  }
  get wrapped(): boolean {
    return this.wrap || this.a < 0;
  }
  restart(): void {
    this.start = this.last;
    this.b = -1;
  }
}

/* ───── 캐릭터 (작은 마법사 · 귀여운 괴물) ───── */

interface Mage {
  g: THREE.Group;
  orb: THREE.Mesh;
  tip(): V3;
}
function mage(A: Arena, robe = 0x34418f, orbC: V3 = [1.2, 1.6, 3]): Mage {
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: robe, roughness: 0.75 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xd8b25a, roughness: 0.4, metalness: 0.6 });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.15, 24), cloth);
  body.position.y = 0.575;
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.035, 8, 24), trim);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.72;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 20, 14), new THREE.MeshStandardMaterial({ color: 0xf0c9a2, roughness: 0.7 }));
  head.position.y = 1.29;
  head.scale.set(1.05, 1, 1.05);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.31, 0.035, 28), cloth);
  brim.position.y = 1.5;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.62, 24), cloth);
  hat.position.set(0.03, 1.8, -0.04);
  hat.rotation.z = -0.22;
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.025, 6, 24), trim);
  band.rotation.x = Math.PI / 2;
  band.position.y = 1.54;
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x1a1020 });
  const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), eyeM);
  e1.position.set(-0.075, 1.3, 0.2);
  const e2 = e1.clone();
  e2.position.x = 0.075;
  const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.035, 1.75, 8), new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.8 }));
  staff.position.set(0.42, 0.88, 0.12);
  const claw = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.022, 6, 16, Math.PI * 1.4), trim);
  claw.position.set(0.42, 1.8, 0.12);
  claw.rotation.z = Math.PI * 1.3;
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.095, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(orbC[0], orbC[1], orbC[2]) }));
  orb.position.set(0.42, 1.83, 0.12);
  const sh = decal(A.tx.shadow(), 1.3, [1, 1, 1], 0.8, true);
  g.add(body, belt, head, brim, hat, band, e1, e2, staff, claw, orb, sh);
  const v = new THREE.Vector3();
  return {
    g,
    orb,
    tip() {
      orb.getWorldPosition(v);
      return ofV(v);
    },
  };
}
interface Mon {
  g: THREE.Group;
  body: THREE.Group;
  mat: THREE.MeshStandardMaterial;
  fl: number;
  fc: V3;
  jolt: number;
  hit(c: V3, k?: number): void;
  tick(dt: number, t: number): void;
  center(): V3;
}
function monster(A: Arena, color = 0x5d4a78, phase = 0): Mon {
  const g = new THREE.Group();
  const body = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, emissive: 0x000000 });
  const bone = new THREE.MeshStandardMaterial({ color: 0xe9dfc6, roughness: 0.5 });
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 18), mat);
  b.scale.set(1, 1.08, 0.95);
  b.position.y = 0.48;
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 12), new THREE.MeshStandardMaterial({ color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.25), roughness: 0.6 }));
  belly.scale.set(1, 1, 0.6);
  belly.position.set(0, 0.4, 0.2);
  const hornG = new THREE.ConeGeometry(0.075, 0.3, 10);
  const h1 = new THREE.Mesh(hornG, bone);
  h1.position.set(-0.2, 0.9, 0);
  h1.rotation.z = 0.45;
  const h2 = new THREE.Mesh(hornG, bone);
  h2.position.set(0.2, 0.9, 0);
  h2.rotation.z = -0.45;
  const eyeM = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.5, 0.25) });
  const eG = new THREE.SphereGeometry(0.065, 10, 8);
  const e1 = new THREE.Mesh(eG, eyeM);
  e1.position.set(-0.13, 0.6, 0.35);
  const e2 = new THREE.Mesh(eG, eyeM);
  e2.position.set(0.13, 0.6, 0.35);
  const fG = new THREE.SphereGeometry(0.13, 12, 8);
  const f1 = new THREE.Mesh(fG, mat);
  f1.position.set(-0.2, 0.09, 0.08);
  const f2 = new THREE.Mesh(fG, mat);
  f2.position.set(0.2, 0.09, 0.08);
  const aG = new THREE.SphereGeometry(0.1, 10, 8);
  const a1 = new THREE.Mesh(aG, mat);
  a1.position.set(-0.43, 0.42, 0.05);
  const a2 = new THREE.Mesh(aG, mat);
  a2.position.set(0.43, 0.42, 0.05);
  body.add(b, belly, h1, h2, e1, e2, a1, a2);
  g.add(body, f1, f2, decal(A.tx.shadow(), 1.25, [1, 1, 1], 0.85, true));
  const m: Mon = {
    g,
    body,
    mat,
    fl: 0,
    fc: [1, 1, 1],
    jolt: 0,
    hit(c, k = 1) {
      m.fc = c;
      m.fl = Math.max(m.fl, k);
      m.jolt = Math.max(m.jolt, k);
    },
    tick(dt, t) {
      m.fl *= Math.exp(-dt * 5);
      m.jolt *= Math.exp(-dt * 6);
      mat.emissive.setRGB(m.fc[0] * m.fl, m.fc[1] * m.fl, m.fc[2] * m.fl);
      const w = Math.sin(t * 46) * 0.09 * m.jolt;
      body.position.y = Math.sin(t * 3 + phase) * 0.025;
      body.scale.set(1 + w, 1 - w, 1 + w);
      body.rotation.z = Math.sin(t * 31) * 0.12 * m.jolt;
    },
    center() {
      return [g.position.x, g.position.y + 0.55, g.position.z];
    },
  };
  return m;
}

/** 빛 핵 + 빛무리 (겹 빛) */
function orbGlow(P: Pool, p: V3, c: V3, s: number, a = 1): void {
  P.put(p, s * 4.2, c, 0.22 * a);
  P.put(p, s * 1.9, c, 0.55 * a);
  P.put(p, s * 0.75, sc3(add3(c, [2, 2, 2]), 1), 0.95 * a);
}
/** 사방으로 튀는 줄 불티 */
function sparks(S: Streaks, p: V3, o: { n: number; c: V3; c2?: V3; speed: number; life: number; grav?: number; len?: number; w?: number; up?: number; dir?: V3; cone?: number }): void {
  for (let i = 0; i < o.n; i++) {
    let d = randDir();
    if (o.dir) d = norm3(add3(sc3(o.dir, 1 / Math.max(0.05, o.cone ?? 0.6)), d));
    if (o.up) d = norm3([d[0], Math.abs(d[1]) * o.up + d[1] * (1 - o.up), d[2]]);
    const sp = o.speed * rr(0.45, 1.15);
    S.spark({ p, v: sc3(d, sp), life: o.life * rr(0.6, 1.2), c: o.c, c2: o.c2 ?? sc3(o.c, 0.4), a: 1, fadeIn: 0, drag: 2.2, grav: o.grav ?? 6, len: o.len ?? 0.045, w: o.w ?? 0.028 });
  }
}
/** 순간 번쩍 (화면 쪽 큰 빛 한 점) */
function flashAt(P: Pool, p: V3, size: number, c: V3, life = 0.22): void {
  P.emit({ p, life, size, size2: size * 1.5, c, a: 1, fadeIn: 0 });
  P.emit({ p, life: life * 0.7, size: size * 0.35, size2: size * 0.6, c: [4, 4, 4], a: 1, fadeIn: 0 });
}
/** 지그재그 번개 점 */
function boltPts(a: V3, b: V3, rnd: () => number, depth = 5, jag = 0.32): V3[] {
  let pts: V3[] = [a, b];
  let off = len3(sub3(b, a)) * jag;
  for (let d = 0; d < depth; d++) {
    const np: V3[] = [pts[0]!];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i]!, q = pts[i + 1]!;
      const dir = norm3(sub3(q, p));
      let r: V3 = [rnd() - 0.5, (rnd() - 0.5) * 0.8, rnd() - 0.5];
      const dd = r[0] * dir[0] + r[1] * dir[1] + r[2] * dir[2];
      r = sub3(r, sc3(dir, dd));
      np.push(add3(sc3(add3(p, q), 0.5), sc3(r, off)), q);
    }
    pts = np;
    off *= 0.55;
  }
  return pts;
}
function drawBolt(S: Streaks, pts: V3[], w: number, c: V3, a: number): void {
  for (let i = 0; i < pts.length - 1; i++) {
    S.seg(pts[i]!, pts[i + 1]!, w * 3.2, c, a * 0.22);
    S.seg(pts[i]!, pts[i + 1]!, w, sc3(c, 1.8), a);
  }
}
/** 원기둥을 a → b 로 늘여 놓기 */
function placeBetween(m: THREE.Object3D, a: V3, b: V3, r: number): number {
  const d = sub3(b, a);
  const L = len3(d);
  m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), toV(norm3(d)));
  m.scale.set(r, L, r);
  return L;
}
/** 들어온 수 만큼 (소수 누적) */
function rate(st: { acc: number }, perSec: number, dt: number): number {
  st.acc += perSec * dt;
  const n = Math.floor(st.acc);
  st.acc -= n;
  return n;
}
function base3d(A: Arena, upd: (t: number, dt: number) => void, controls: Control[], extra?: Partial<Scene3D>): Scene3D {
  return {
    scene: A.scene,
    camera: A.cam,
    update(t, dt) {
      upd(t, Math.min(dt, 0.05));
    },
    resize: (w, h) => A.resize(w, h),
    controls,
    dispose: () => A.dispose(),
    ...extra,
  };
}

const FRESNEL_V = `
varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying vec3 vP;
void main(){
  vUv = uv; vP = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

/* ═════════════════════ 견본 ═════════════════════ */

export const DEMOS: DemoMap = {
  /* ───────── i184 연쇄 번개 ───────── */
  i184: {
    kind: '3d',
    caption: '번개가 가장 가까운 적에게 차례로 튀며 갈라진다 — 맞을 때마다 번쩍 · 불티 · 바닥 빛',
    make() {
      const A = arena();
      const mg = mage(A, 0x2b3a8a, [1.4, 2.2, 3.5]);
      mg.g.position.set(-3.4, 0, 1.0);
      mg.g.rotation.y = 0.5;
      A.scene.add(mg.g);
      const spots: V3[] = [[-1.5, 0, -0.5], [0.1, 0, 1.1], [1.2, 0, -1.4], [2.8, 0, 0.1], [1.9, 0, 2.0], [-0.3, 0, -2.4]];
      const mons = spots.map((p, i) => {
        const m = monster(A, i % 2 ? 0x5d4a78 : 0x4a5c6e, i);
        m.g.position.set(p[0], 0, p[2]);
        m.g.rotation.y = -0.25;
        A.scene.add(m.g);
        return m;
      });
      A.scene.updateMatrixWorld(true);
      // 사슬 순서: 지팡이에서 가장 가까운 적 → 그다음 가까운 적 (욕심쟁이 잇기)
      const order: number[] = [];
      {
        let cur = mg.tip();
        const left = new Set(mons.map((_, i) => i));
        while (left.size) {
          let best = -1, bd = 1e9;
          for (const i of left) {
            const d = len3(sub3(mons[i]!.center(), cur));
            if (d < bd) { bd = d; best = i; }
          }
          order.push(best);
          left.delete(best);
          cur = mons[best]!.center();
        }
      }
      const glows = mons.map((m) => {
        const d = decal(A.tx.glow(), 2.8, C(0x6ab0ff, 1.6), 0);
        d.position.set(m.g.position.x, 0.02, m.g.position.z);
        A.scene.add(d);
        return d;
      });
      const hitL = new Flash(0x8cc4ff, 60, 7);
      const tipL = new THREE.PointLight(0x8cc4ff, 0, 6, 2);
      A.scene.add(hitL.light, tipL);
      const loop = new Loop(3.2);
      let hops = 4, fork = true, gain = 1;
      const BC = C(0x7ab8ff, 1.6);
      return base3d(A, (t, dt) => {
        const lt = loop.tick(t);
        const tip = mg.tip();
        const charge = sstep(0, 0.35, lt) * (1 - sstep(0.4, 0.9, lt));
        orbGlow(A.fx, tip, BC, 0.18 + charge * 0.3 * gain, 0.6 + charge);
        tipL.position.set(tip[0], tip[1], tip[2]);
        tipL.intensity = (4 + charge * 30) * gain;
        if (charge > 0.2 && Math.random() < 0.5) {
          const r = rng(Math.floor(t * 30));
          const e = add3(tip, sc3(randDir(), 0.5));
          drawBolt(A.st, boltPts(tip, e, r, 3), 0.012, BC, 0.8 * charge);
        }
        for (let i = 0; i < hops; i++) {
          const st = 0.35 + i * 0.11;
          const age = lt - st;
          if (age < 0 || age > 0.62) continue;
          const mi = order[i]!;
          const a = i === 0 ? tip : mons[order[i - 1]!]!.center();
          const b = mons[mi]!.center();
          const fade = 1 - sstep(0.18, 0.62, age);
          const seed = Math.floor(lt / 0.045) * 31 + i * 977;
          const r = rng(seed);
          const pts = boltPts(a, b, r, 5, 0.3);
          drawBolt(A.st, pts, 0.045 * gain, BC, fade);
          if (fork) {
            for (let f = 0; f < 2; f++) {
              const at = pts[4 + Math.floor(r() * (pts.length - 8))]!;
              const dir = norm3(sub3(b, a));
              const end = add3(at, sc3(norm3(add3(dir, [r() - 0.5, r() * 0.4 - 0.3, r() - 0.5].map((x) => x * 2.2) as V3)), 0.5 + r() * 0.6));
              drawBolt(A.st, boltPts(at, end, r, 3, 0.35), 0.022 * gain, BC, fade * 0.8);
            }
          }
          orbGlow(A.fx, b, BC, 0.32 * gain, fade);
          if (loop.hit(st)) {
            sparks(A.st, b, { n: 18, c: C(0xbfe0ff, 3), c2: C(0x3a7bff, 1.2), speed: 6, life: 0.4, grav: 7, up: 0.5 });
            flashAt(A.fx, b, 2.6 * gain, C(0x9cc8ff, 2.2));
            hitL.kick(b, gain);
            mons[mi]!.hit(C(0x6aa8ff, 2.2), 1);
            glows[mi]!.material.opacity = 1;
            A.shake(0.05 * gain);
          }
        }
        for (const g of glows) g.material.opacity *= Math.exp(-dt * 2.2);
        for (const m of mons) m.tick(dt, t);
        hitL.tick(dt);
        A.fx.step(dt);
        A.st.step(dt);
        A.tickCam(dt);
      }, [
        { type: 'button', label: '다시 쏘기', on: () => loop.restart() },
        { type: 'range', label: '튀는 횟수', min: 1, max: 6, step: 1, value: hops, on: (v) => (hops = v) },
        { type: 'toggle', label: '갈래 번개', value: fork, on: (v) => (fork = v) },
        { type: 'range', label: '세기', min: 0.5, max: 2, step: 0.1, value: gain, on: (v) => (gain = v) },
      ]);
    },
  },

  /* ───────── i185 비전 미사일 ───────── */
  i185: {
    kind: '3d',
    caption: '보라 빛 구슬 여러 개가 부채꼴로 퍼졌다가 휘어지며 움직이는 적을 쫓아가 맞는다 (유도 + 리본 꼬리)',
    make() {
      const A = arena({ st: 700 });
      const mg = mage(A, 0x4b2a7a, [2.6, 1.2, 3.6]);
      mg.g.position.set(-3.4, 0, 1.0);
      mg.g.rotation.y = 0.5;
      A.scene.add(mg.g);
      const foe = monster(A, 0x3f5a52, 0.5);
      A.scene.add(foe.g);
      const glow = decal(A.tx.glow(), 3.2, C(0xb26bff, 1.6), 0);
      A.scene.add(glow);
      const hitL = new Flash(0xc88cff, 50, 8);
      const flyL = new THREE.PointLight(0xb070ff, 0, 7, 2);
      A.scene.add(hitL.light, flyL);
      A.scene.updateMatrixWorld(true);
      interface Mis { p: V3; v: V3; age: number; trail: V3[]; live: boolean; acc: { acc: number } }
      const mis: Mis[] = [];
      const loop = new Loop(3.0);
      let count = 5, homing = 1, tail = true;
      const PC = C(0xb36bff, 1.7);
      const PK = C(0xff7ad9, 1.6);
      return base3d(A, (t, dt) => {
        const lt = loop.tick(t);
        // 움직이는 과녁
        const fx = 2.6 + Math.sin(t * 0.7) * 0.5, fz = -0.2 + Math.sin(t * 0.9) * 1.4;
        foe.g.position.set(fx, 0, fz);
        const tgt = foe.center();
        const tip = mg.tip();
        for (let k = 0; k < count; k++) {
          if (loop.hit(0.15 + k * 0.09)) {
            const s = count === 1 ? 0 : (k / (count - 1)) * 2 - 1;
            mis.push({ p: tip, v: [1.2 + Math.random(), 2.4 + Math.random() * 1.6, s * 4.2 + (Math.random() - 0.5)], age: 0, trail: [], live: true, acc: { acc: 0 } });
            flashAt(A.fx, tip, 0.9, PC, 0.15);
          }
        }
        const casting = lt < 0.25 + count * 0.09;
        orbGlow(A.fx, tip, PC, casting ? 0.3 : 0.16, 1);
        let cx = 0, cy = 0, cz = 0, cn = 0;
        for (const m of mis) {
          if (m.live) {
            m.age += dt;
            const to = sub3(tgt, m.p);
            const dist = len3(to);
            const speed = 6.5 + m.age * 5;
            const want = sc3(norm3(to), speed);
            const turn = Math.min(1, (1.5 + m.age * 9) * homing * dt);
            m.v = add3(m.v, sc3(sub3(want, m.v), turn));
            m.p = add3(m.p, sc3(m.v, dt));
            m.trail.unshift(m.p);
            if (m.trail.length > 16) m.trail.pop();
            if (dist < 0.38 || m.age > 2.4) {
              m.live = false;
              sparks(A.st, m.p, { n: 16, c: C(0xe6c2ff, 3), c2: PK, speed: 5.5, life: 0.45, grav: 5, up: 0.4 });
              flashAt(A.fx, m.p, 2.2, PC);
              for (let i = 0; i < 10; i++) A.fx.emit({ p: m.p, v: sc3(randDir(), rr(0.5, 1.6)), life: rr(0.4, 0.8), size: 0.18, size2: 0.02, c: PK, a: 1, drag: 2 });
              hitL.kick(m.p, 1);
              foe.hit(C(0xb070ff, 2), 1);
              glow.material.opacity = 1;
              A.shake(0.04);
            }
            const sc = 0.22 + Math.sin(t * 40 + m.age * 7) * 0.02;
            orbGlow(A.fx, m.p, PC, sc, 1);
            cx += m.p[0]; cy += m.p[1]; cz += m.p[2]; cn++;
            for (let i = rate(m.acc, 60, dt); i > 0; i--) A.fx.emit({ p: add3(m.p, sc3(randDir(), 0.08)), v: sc3(randDir(), 0.3), life: rr(0.3, 0.7), size: rr(0.06, 0.13), size2: 0.01, c: mix3(PC, PK, Math.random()), a: 0.9 });
          } else if (m.trail.length) m.trail.pop();
          // 리본 꼬리
          if (tail) {
            const n = m.trail.length;
            for (let i = 0; i < n - 1; i++) {
              const k = 1 - i / (n - 1);
              A.st.seg(m.trail[i + 1]!, m.trail[i]!, 0.11 * k + 0.01, mix3(PK, PC, k), 0.75 * k);
            }
          }
        }
        for (let i = mis.length - 1; i >= 0; i--) if (!mis[i]!.live && !mis[i]!.trail.length) mis.splice(i, 1);
        if (cn) flyL.position.set(cx / cn, cy / cn, cz / cn);
        flyL.intensity = cn ? 10 + cn * 3 : 0;
        glow.position.set(fx, 0.02, fz);
        glow.material.opacity *= Math.exp(-dt * 3);
        foe.tick(dt, t);
        hitL.tick(dt);
        A.fx.step(dt);
        A.st.step(dt);
        A.tickCam(dt);
      }, [
        { type: 'button', label: '다시 쏘기', on: () => loop.restart() },
        { type: 'range', label: '미사일 수', min: 1, max: 9, step: 1, value: count, on: (v) => (count = v) },
        { type: 'range', label: '유도 세기', min: 0.2, max: 2, step: 0.1, value: homing, on: (v) => (homing = v) },
        { type: 'toggle', label: '리본 꼬리', value: tail, on: (v) => (tail = v) },
      ]);
    },
  },

  /* ───────── i186 유성 낙하 ───────── */
  i186: {
    kind: '3d',
    caption: '바닥에 떨어질 곳 표시 → 불타는 바위가 비스듬히 떨어짐 → 섬광 · 충격 고리 · 파편 · 먼지 · 화면 흔들림',
    make() {
      const A = arena({ fx: 1400, st: 500 });
      const smoke = A.addPool(new Pool(500, { normal: true, map: A.tx.puff() }));
      smoke.obj.renderOrder = 4;
      const I: V3 = [0.6, 0, 0.1];
      const mons = ([[-0.6, 0, 1.2], [1.9, 0, -0.6], [0.2, 0, -1.4]] as V3[]).map((p, i) => {
        const m = monster(A, [0x5d4a78, 0x4a5c6e, 0x6a4a4a][i]!, i);
        m.g.position.set(p[0], 0, p[2]);
        A.scene.add(m.g);
        return m;
      });
      const warn = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: A.tx.rune(), color: new THREE.Color(2.6, 0.45, 0.06), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      warn.rotation.x = -Math.PI / 2;
      warn.position.set(I[0], 0.025, I[2]);
      const warnFill = decal(A.tx.glow(), 4, C(0xff3010, 1), 0);
      warnFill.position.set(I[0], 0.02, I[2]);
      const shock = decal(A.tx.ring(), 1, C(0xffa040, 2.5), 0);
      shock.position.set(I[0], 0.04, I[2]);
      const crater = decal(A.tx.glow(), 3.5, C(0xff6a10, 2), 0);
      crater.position.set(I[0], 0.03, I[2]);
      const scorch = decal(A.tx.shadow(), 3.6, [1, 1, 1], 0, true);
      scorch.position.set(I[0], 0.015, I[2]);
      // 바위
      const rg = new THREE.IcosahedronGeometry(0.5, 2);
      const pa = rg.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
        const f = 1 + 0.22 * Math.sin(x * 7 + 1) * Math.sin(y * 6 + 2) * Math.sin(z * 8 + 3);
        pa.setXYZ(i, x * f, y * f, z * f);
      }
      rg.computeVertexNormals();
      const lava = A.tx.lava();
      const rock = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color: 0x2a1c16, roughness: 0.9, flatShading: true, emissive: new THREE.Color(2.5, 1.0, 0.3), emissiveMap: lava }));
      A.scene.add(warn, warnFill, shock, crater, scorch, rock);
      const boom = new Flash(0xffa050, 900, 4.5, 14);
      const fireL = new THREE.PointLight(0xff7a30, 0, 10, 2);
      A.scene.add(boom.light, fireL);
      const loop = new Loop(4.4);
      let size = 1, shakeOn = true, smokeOn = true;
      const T0 = 0.85, T1 = 1.75;
      const S0: V3 = add3(I, [-4.2, 10, -5]);
      const fireAcc = { acc: 0 }, smokeAcc = { acc: 0 }, emberAcc = { acc: 0 };
      const FIRE: V3 = C(0xffc070, 4);
      const FIRE2: V3 = C(0xff3a08, 1.2);
      return base3d(A, (t, dt) => {
        const lt = loop.tick(t);
        if (loop.wrapped) { scorch.material.opacity = 0; }
        // 예고 원
        const wk = sstep(0, 0.35, lt) * (1 - sstep(T1 - 0.05, T1, lt));
        const pulse = 0.75 + 0.25 * Math.sin(lt * 18);
        warn.material.opacity = wk * pulse;
        warn.scale.setScalar((3.4 - sstep(0, T1, lt) * 0.6) * size);
        warn.rotation.z = lt * 0.8;
        warnFill.material.opacity = wk * 0.45 * (0.6 + 0.4 * sstep(0.3, T1, lt));
        warnFill.scale.setScalar(3.6 * size * sstep(0, T1, lt));
        // 낙하
        const fk = (lt - T0) / (T1 - T0);
        rock.visible = fk >= 0 && fk < 1;
        if (rock.visible) {
          const e = Math.pow(fk, 1.5);
          const p = mix3(S0, add3(I, [0, 0.35 * size, 0]), e);
          rock.position.set(p[0], p[1], p[2]);
          rock.scale.setScalar(size);
          rock.rotation.set(lt * 5, lt * 3, 0);
          const dir = norm3(sub3(I, S0));
          orbGlow(A.fx, p, C(0xff8a30, 1.6), 0.55 * size, 1);
          for (let i = rate(fireAcc, 160 * size, dt); i > 0; i--) {
            A.fx.emit({ p: add3(p, sc3(randDir(), 0.3 * size)), v: add3(sc3(dir, -2.5), sc3(randDir(), 0.6)), life: rr(0.35, 0.7), size: rr(0.7, 1.1) * size, size2: 0.2, c: FIRE, c2: FIRE2, a: 0.6, drag: 1.5 });
          }
          if (smokeOn) for (let i = rate(smokeAcc, 40, dt); i > 0; i--) {
            smoke.emit({ p: add3(p, sc3(randDir(), 0.3)), v: add3(sc3(dir, -1.2), [0, 0.3, 0]), life: rr(1, 1.6), size: 0.8 * size, size2: 2.4 * size, c: [0.12, 0.09, 0.08], a: 0.55, spin: rr(-1, 1), drag: 1 });
          }
          if (Math.random() < 0.6) A.st.spark({ p, v: add3(sc3(dir, -3), sc3(randDir(), 2)), life: 0.4, c: C(0xffd090, 3), c2: FIRE2, len: 0.05, w: 0.025, grav: 3, drag: 1 });
          fireL.position.set(p[0], p[1], p[2]);
          fireL.intensity = 30 + 30 * e;
        } else fireL.intensity = 0;
        // 쾅
        if (loop.hit(T1)) {
          const c: V3 = add3(I, [0, 0.3, 0]);
          flashAt(A.fx, c, 9 * size, C(0xffd2a0, 2.5), 0.3);
          boom.kick(c, size);
          shock.material.opacity = 1;
          crater.material.opacity = 1;
          scorch.material.opacity = 0.9;
          sparks(A.st, c, { n: 70, c: C(0xffd8a0, 3.5), c2: FIRE2, speed: 9 * size, life: 0.9, grav: 9, up: 0.75, len: 0.05, w: 0.035 });
          for (let i = 0; i < 70; i++) {
            const d = randDir();
            A.fx.emit({ p: add3(c, sc3(d, 0.4)), v: [d[0] * 4, Math.abs(d[1]) * 3 + 0.5, d[2] * 4], life: rr(0.4, 0.9), size: rr(0.8, 1.6) * size, size2: 0.3, c: FIRE, c2: FIRE2, a: 0.7, drag: 3.5 });
          }
          if (smokeOn) for (let i = 0; i < 46; i++) {
            const a = (i / 46) * TAU;
            const s = rr(2.5, 5) * size;
            smoke.emit({ p: add3(I, [Math.cos(a) * 0.5, 0.2, Math.sin(a) * 0.5]), v: [Math.cos(a) * s, rr(0.3, 1.4), Math.sin(a) * s], life: rr(1.3, 2.4), size: 1.0 * size, size2: 2.8 * size, c: [0.16, 0.13, 0.11], a: 0.6, spin: rr(-1, 1), drag: 2.4 });
          }
          for (let i = 0; i < 24; i++) {
            const d = randDir();
            smoke.emit({ p: c, v: [d[0] * 4, Math.abs(d[1]) * 6 + 2, d[2] * 4], life: rr(0.7, 1.1), size: 0.16, size2: 0.12, c: [0.05, 0.04, 0.04], a: 1, grav: 12, fadeIn: 0 });
          }
          for (const m of mons) m.hit(C(0xff7a30, 1.5), 1);
          if (shakeOn) A.shake(0.45 * size);
        }
        // 남은 불씨
        const after = lt - T1;
        if (after > 0 && after < 2) for (let i = rate(emberAcc, 30 * (1 - after / 2), dt); i > 0; i--) {
          const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * 1.4 * size;
          A.fx.emit({ p: add3(I, [Math.cos(a) * r, 0.05, Math.sin(a) * r]), v: [0, rr(0.2, 0.8), 0], life: rr(0.6, 1.3), size: rr(0.06, 0.14), size2: 0.02, c: C(0xffb050, 3), c2: FIRE2, a: 1 });
        }
        shock.scale.setScalar((1 + easeOut(clamp(after / 0.6, 0, 1)) * 8) * size);
        shock.material.opacity *= Math.exp(-dt * 4.5);
        crater.material.opacity *= Math.exp(-dt * 1.1);
        crater.scale.setScalar(3.5 * size);
        scorch.scale.setScalar(3.6 * size);
        if (lt > loop.P - 0.5) scorch.material.opacity *= Math.exp(-dt * 6);
        for (const m of mons) m.tick(dt, t);
        boom.tick(dt);
        A.fx.step(dt);
        smoke.step(dt);
        A.st.step(dt);
        A.tickCam(dt);
      }, [
        { type: 'button', label: '다시 떨어뜨리기', on: () => loop.restart() },
        { type: 'range', label: '크기', min: 0.6, max: 1.6, step: 0.1, value: size, on: (v) => (size = v) },
        { type: 'toggle', label: '화면 흔들림', value: shakeOn, on: (v) => (shakeOn = v) },
        { type: 'toggle', label: '연기 · 먼지', value: smokeOn, on: (v) => (smokeOn = v) },
      ]);
    },
  },

  /* ───────── i187 치유 오라 ───────── */
  i187: {
    kind: '3d',
    caption: '발밑 마법진 + 휘감아 오르는 초록 빛 알갱이 · + 표시 + 몸을 감싸는 빛 — 주기마다 회복 파동',
    make() {
      const A = arena({ cam: [0, 4.4, 5.0], look: [0, 0.85, 0] });
      const plus = A.addPool(new Pool(80, { map: A.tx.plus() }));
      const hero = mage(A, 0x2f6a4a, [1.4, 3, 1.6]);
      hero.g.position.set(0, 0, 0.2);
      A.scene.add(hero.g);
      const G = C(0x5dff9a, 1.6);
      const G2 = C(0x1fd36a, 1);
      const rune = decal(A.tx.rune(), 3.6, sc3(G, 1.3), 0.9);
      rune.position.set(0, 0.03, 0.2);
      const rune2 = decal(A.tx.rune(), 2.2, sc3(G, 0.9), 0.5);
      rune2.position.set(0, 0.035, 0.2);
      const pool = decal(A.tx.glow(), 4.5, G2, 0.6);
      pool.position.set(0, 0.02, 0.2);
      const wave = decal(A.tx.ring(), 1, sc3(G, 1.6), 0);
      wave.position.set(0, 0.04, 0.2);
      A.scene.add(rune, rune2, pool, wave);
      // 감싸는 빛 (가장자리 빛)
      const shell = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.55, 1.0, 8, 20),
        new THREE.ShaderMaterial({
          uniforms: { uC: { value: new THREE.Color(G[0], G[1], G[2]) }, uA: { value: 1 }, uT: { value: 0 } },
          vertexShader: FRESNEL_V,
          fragmentShader: `uniform vec3 uC; uniform float uA; uniform float uT; varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying vec3 vP;
            void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
              float band = 0.6 + 0.4 * sin(vP.y * 9.0 - uT * 4.0);
              float a = pow(f, 2.2) * uA * band * smoothstep(-1.05, -0.4, vP.y);
              gl_FragColor = vec4(uC, a); ${TONE} }`,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      shell.position.set(0, 0.95, 0.2);
      // 빛 장막 기둥
      const veil = new THREE.Mesh(
        new THREE.CylinderGeometry(1.45, 1.6, 2.4, 48, 1, true),
        new THREE.ShaderMaterial({
          uniforms: { uC: { value: new THREE.Color(G[0], G[1], G[2]) }, uT: { value: 0 } },
          vertexShader: FRESNEL_V,
          fragmentShader: `${NOISE} uniform vec3 uC; uniform float uT; varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vP;
            void main(){ float n = vn(vec2(vUv.x * 24.0, vUv.y * 3.0 - uT * 1.2));
              float a = pow(1.0 - vUv.y, 1.8) * (0.2 + 0.8 * n * n) * 0.6;
              gl_FragColor = vec4(uC, a); ${TONE} }`,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      veil.position.set(0, 1.2, 0.2);
      A.scene.add(shell, veil);
      const light = new Flash(0x6aff9a, 40, 3, 8);
      light.light.position.set(0, 0.8, 0.6);
      A.scene.add(light.light);
      const loop = new Loop(2.6);
      let amount = 1, wrapOn = true;
      const acc = { acc: 0 }, pacc = { acc: 0 };
      return base3d(A, (t, dt) => {
        const lt = loop.tick(t);
        rune.rotation.z = t * 0.35;
        rune2.rotation.z = -t * 0.6;
        const breath = 0.8 + 0.2 * Math.sin(t * 2.4);
        pool.material.opacity = 0.5 * breath;
        (shell.material as THREE.ShaderMaterial).uniforms.uA!.value = wrapOn ? 0.9 * breath + light.lv : 0;
        (shell.material as THREE.ShaderMaterial).uniforms.uT!.value = t;
        (veil.material as THREE.ShaderMaterial).uniforms.uT!.value = t;
        if (loop.hit(0.05)) {
          wave.material.opacity = 1;
          light.kick([0, 0.8, 0.6], 1);
          for (let i = 0; i < 50; i++) {
            const a = Math.random() * TAU, r = rr(0.2, 1.4);
            A.fx.emit({ p: [Math.cos(a) * r, 0.1, 0.2 + Math.sin(a) * r], v: [-Math.sin(a) * 0.8, rr(1.5, 3.2), Math.cos(a) * 0.8], life: rr(0.7, 1.3), size: rr(0.1, 0.22), size2: 0.02, c: C(0xc8ffd8, 3), c2: G2, a: 1, drag: 1 });
          }
          for (let i = 0; i < 4; i++) plus.emit({ p: [rr(-0.7, 0.7), rr(1.2, 1.8), 0.2 + rr(-0.3, 0.5)], v: [0, rr(0.6, 1), 0], life: 1.1, size: rr(0.35, 0.5), size2: 0.5, c: sc3(G, 1.4), a: 1, fadeIn: 0.15, rot: 0, spin: 0 });
        }
        const wk = clamp(lt / 0.9, 0, 1);
        wave.scale.setScalar(0.6 + easeOut(wk) * 3.4);
        wave.material.opacity *= Math.exp(-dt * 2.6);
        // 휘감아 오르는 알갱이
        for (let i = rate(acc, 70 * amount, dt); i > 0; i--) {
          const a = Math.random() * TAU, r = rr(0.35, 1.35);
          A.fx.emit({ p: [Math.cos(a) * r, rr(0, 0.2), 0.2 + Math.sin(a) * r], v: [-Math.sin(a) * 0.7 * (1.4 - r), rr(0.7, 1.6), Math.cos(a) * 0.7 * (1.4 - r)], life: rr(1.1, 2.0), size: rr(0.12, 0.26), size2: 0.03, c: Math.random() < 0.25 ? C(0xeaffb0, 3) : sc3(G, 2), c2: G2, a: 1, fadeIn: 0.2 });
        }
        for (let i = rate(pacc, 1.5 * amount, dt); i > 0; i--) plus.emit({ p: [rr(-1, 1), rr(0.3, 1.0), 0.2 + rr(-0.6, 0.8)], v: [0, rr(0.5, 0.9), 0], life: 1.4, size: rr(0.2, 0.3), size2: 0.3, c: sc3(G, 1.2), a: 0.9, fadeIn: 0.2, rot: 0, spin: 0 });
        orbGlow(A.fx, hero.tip(), G, 0.2 + light.lv * 0.2, 1);
        light.tick(dt, 10);
        A.fx.step(dt);
        plus.step(dt);
        A.st.step(dt);
        A.tickCam(dt);
      }, [
        { type: 'button', label: '회복 파동', on: () => loop.restart() },
        { type: 'range', label: '빛 알갱이 양', min: 0.2, max: 2.5, step: 0.1, value: amount, on: (v) => (amount = v) },
        { type: 'toggle', label: '몸을 감싸는 빛', value: wrapOn, on: (v) => (wrapOn = v) },
      ]);
    },
  },

  /* ───────── i188 독구름 ───────── */
  i188: {
    kind: '3d',
    caption: '독 병이 깨지며 보라 · 녹색 연기가 부글부글 퍼진다 — 거품이 터지고 해골이 떠오르며 안의 적은 중독',
    make() {
      const A = arena({ fx: 900 });
      const smoke = A.addPool(new Pool(260, { normal: true, map: A.tx.puff() }));
      smoke.obj.renderOrder = 3;
      const glowP = A.addPool(new Pool(200, { map: A.tx.puff() }));
      const bubbles = A.addPool(new Pool(60, { map: A.tx.bubble() }));
      const skulls = A.addPool(new Pool(10, { map: A.tx.skull() }));
      skulls.obj.renderOrder = 7;
      const mg = mage(A, 0x3b2a5a, [1.6, 3, 0.8]);
      mg.g.position.set(-3.4, 0, 1.2);
      mg.g.rotation.y = 0.6;
      A.scene.add(mg.g);
      const CEN: V3 = [0.7, 0, -0.2];
      const mons = ([[0.2, 0, 0.4], [1.4, 0, -0.8]] as V3[]).map((p, i) => {
        const m = monster(A, i ? 0x6a4a4a : 0x5d4a78, i * 2);
        m.g.position.set(p[0], 0, p[2]);
        A.scene.add(m.g);
        return m;
      });
      const ground = decal(A.tx.glow(), 5.5, C(0x6dff3a, 1.0), 0);
      ground.position.set(CEN[0], 0.02, CEN[2]);
      A.scene.add(ground);
      const flask = new THREE.Group();
      const glass = new THREE.MeshStandardMaterial({ color: 0x80ff70, emissive: new THREE.Color(0.4, 1.4, 0.2), roughness: 0.15, metalness: 0.1 });
      const fb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), glass);
      const fn = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.16, 10), glass);
      fn.position.y = 0.18;
      const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.06, 10), new THREE.MeshStandardMaterial({ color: 0x8a5a30 }));
      cork.position.y = 0.28;
      flask.add(fb, fn, cork);
      A.scene.add(flask);
      const light = new Flash(0x7aff40, 50, 4, 8);
      A.scene.add(light.light);
      const amb = new THREE.PointLight(0x7aff50, 0, 7, 2);
      amb.position.set(CEN[0], 0.6, CEN[2]);
      A.scene.add(amb);
      const loop = new Loop(4.6);
      let dense = 1, skullOn = true;
      const sAcc = { acc: 0 }, gAcc = { acc: 0 }, bAcc = { acc: 0 }, kAcc = { acc: 0 };
      const PUR: V3 = [0.16, 0.04, 0.22];
      const GRN: V3 = [0.07, 0.2, 0.04];
      const GL: V3 = C(0x8aff4a, 1.2);
      let env = 0;
      return base3d(A, (t, dt) => {
        const lt = loop.tick(t);
        // 병 던지기
        const tk = lt / 0.6;
        flask.visible = tk < 1;
        const tip = mg.tip();
        if (flask.visible) {
          const p = mix3(tip, add3(CEN, [0, 0.15, 0]), tk);
          p[1] += Math.sin(tk * Math.PI) * 1.6;
          flask.position.set(p[0], p[1], p[2]);
          flask.rotation.set(tk * 9, 0, tk * 6);
          A.fx.put(p, 0.9, GL, 0.35);
        }
        if (loop.hit(0.6)) {
          const p: V3 = add3(CEN, [0, 0.2, 0]);
          sparks(A.st, p, { n: 26, c: C(0xd8ffc0, 3), c2: GL, speed: 5, life: 0.5, grav: 8, up: 0.6 });
          flashAt(A.fx, p, 3, C(0x9aff60, 2));
          light.kick(p, 1);
          for (let i = 0; i < 26; i++) {
            const d = randDir();
            smoke.emit({ p, v: [d[0] * 3.2, Math.abs(d[1]) * 1.5, d[2] * 3.2], life: rr(1.4, 2.4), size: 0.8, size2: 2.6, c: i % 2 ? PUR : GRN, a: 0.7, spin: rr(-0.8, 0.8), drag: 2.4 });
          }
        }
        const want = lt < 0.6 ? 0 : lt < loop.P - 0.9 ? 1 : 0;
        env = lerp(env, want, 1 - Math.exp(-dt * 2.5));
        const e = env * dense;
        for (let i = rate(sAcc, 26 * e, dt); i > 0; i--) {
          const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * 1.7;
          smoke.emit({ p: add3(CEN, [Math.cos(a) * r, rr(0.1, 0.5), Math.sin(a) * r]), v: [Math.cos(a) * 0.25, rr(0.1, 0.35), Math.sin(a) * 0.25], life: rr(2, 3), size: rr(1, 1.4), size2: rr(2.2, 2.9), c: Math.random() < 0.55 ? PUR : GRN, a: 0.5, fadeIn: 0.3, spin: rr(-0.5, 0.5) });
        }
        for (let i = rate(gAcc, 16 * e, dt); i > 0; i--) {
          const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * 1.6;
          glowP.emit({ p: add3(CEN, [Math.cos(a) * r, rr(0.05, 0.4), Math.sin(a) * r]), v: [0, rr(0.05, 0.25), 0], life: rr(1.5, 2.5), size: rr(1.2, 1.8), size2: 2.4, c: Math.random() < 0.6 ? sc3(GL, 0.5) : C(0xb84aff, 0.6), a: 0.35, fadeIn: 0.3, spin: rr(-0.4, 0.4) });
        }
        for (let i = rate(bAcc, 9 * e, dt); i > 0; i--) {
          const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * 1.5;
          bubbles.emit({ p: add3(CEN, [Math.cos(a) * r, rr(0.05, 0.4), Math.sin(a) * r]), v: [0, rr(0.3, 0.6), 0], life: rr(0.6, 1.1), size: 0.1, size2: rr(0.3, 0.45), c: C(0xb4ff8a, 1.8), a: 1, fadeIn: 0.05, rot: 0, spin: 0 });
        }
        if (skullOn) for (let i = rate(kAcc, 1.1 * env, dt); i > 0; i--) {
          skulls.emit({ p: add3(CEN, [rr(-1.1, 1.1), rr(0.6, 1.0), rr(-0.8, 0.9)]), v: [0, rr(0.35, 0.55), 0], life: 1.8, size: 0.55, size2: 0.75, c: C(0xa6ff70, 1.8), a: 0.85, fadeIn: 0.25, rot: rr(-0.2, 0.2), spin: rr(-0.15, 0.15) });
        }
        // 거품 꺼질 때 반짝 (가끔)
        if (Math.random() < 6 * e * dt) A.fx.emit({ p: add3(CEN, [rr(-1.3, 1.3), rr(0.3, 0.9), rr(-1.1, 1.1)]), life: 0.2, size: 0.4, size2: 0.1, c: C(0xc8ffa0, 2.5), a: 1, fadeIn: 0 });
        ground.material.opacity = 0.75 * env;
        amb.intensity = 14 * env;
        for (const m of mons) {
          const pulse = 0.5 + 0.5 * Math.sin(t * 5 + m.g.position.x * 3);
          if (env > 0.3 && pulse > 0.97) m.hit(C(0x5aff30, 1.2), 0.5);
          m.mat.emissive.lerp(new THREE.Color(0.05 * env, 0.25 * env * pulse, 0.03), 0.5);
          m.tick(dt, t);
          m.mat.emissive.g = Math.max(m.mat.emissive.g, 0.18 * env * pulse);
        }
        orbGlow(A.fx, tip, GL, 0.16, 1);
        light.tick(dt);
        A.fx.step(dt);
        smoke.step(dt);
        glowP.step(dt);
        bubbles.step(dt);
        skulls.step(dt);
        A.st.step(dt);
        A.tickCam(dt);
      }, [
        { type: 'button', label: '다시 던지기', on: () => loop.restart() },
        { type: 'range', label: '연기 짙기', min: 0.3, max: 2, step: 0.1, value: dense, on: (v) => (dense = v) },
        { type: 'toggle', label: '해골', value: skullOn, on: (v) => (skullOn = v) },
      ]);
    },
  },

  /* ───────── i189 빔 · 레이저 ───────── */
  i189: {
    kind: '3d',
    caption: '지팡이에서 지속 광선 — 흐르는 무늬 원통 + 하얀 심 + 둘레 번개 떨림 · 맞는 곳 불티와 그을음',
    make() {
      const A = arena({ fx: 1000, st: 500 });
      const mg = mage(A, 0x5a2a3a, [3, 1.3, 2.4]);
      mg.g.position.set(-3.5, 0, 0.9);
      mg.g.rotation.y = 0.6;
      A.scene.add(mg.g);
      const mons = ([[1.8, 0, -1.6], [2.4, 0, 0.3], [1.6, 0, 2.0]] as V3[]).map((p, i) => {
        const m = monster(A, [0x4a5c6e, 0x5d4a78, 0x4a6a4e][i]!, i);
        m.g.position.set(p[0], 0, p[2]);
        m.g.rotation.y = -0.6;
        A.scene.add(m.g);
        return m;
      });
      const beamMat = (core: boolean): THREE.ShaderMaterial =>
        new THREE.ShaderMaterial({
          uniforms: { uC: { value: new THREE.Color() }, uT: { value: 0 }, uA: { value: 0 }, uLen: { value: 5 }, uCore: { value: core ? 1 : 0 } },
          vertexShader: FRESNEL_V,
          fragmentShader: `${NOISE} uniform vec3 uC; uniform float uT; uniform float uA; uniform float uLen; uniform float uCore;
            varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying vec3 vP;
            void main(){
              float f = abs(dot(normalize(vN), normalize(vV)));
              float s1 = vn(vec2(vUv.x * 6.0, vUv.y * uLen * 1.6 - uT * 10.0));
              float s2 = vn(vec2(vUv.x * 13.0 + 3.0, vUv.y * uLen * 3.2 - uT * 17.0));
              float flow = 0.35 + 1.3 * s1 * s2;
              vec3 col = uCore > 0.5 ? vec3(3.0) * pow(f, 1.5) + uC * 0.5 : uC * pow(f, 1.4) * flow * 1.6;
              float ends = smoothstep(0.0, 0.025, vUv.y) * smoothstep(1.0, 0.985, vUv.y);
              gl_FragColor = vec4(col, uA * ends * (uCore > 0.5 ? 1.0 : pow(f, 0.8)));
              ${TONE} }`,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
      const cyl = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true);
      const outer = new THREE.Mesh(cyl, beamMat(false));
      const inner = new THREE.Mesh(cyl, beamMat(true));
      outer.frustumCulled = inner.frustumCulled = false;
      A.scene.add(outer, inner);
      const endG = decal(A.tx.glow(), 2.6, [1, 1, 1], 0);
      A.scene.add(endG);
      const endL = new THREE.PointLight(0xffffff, 0, 7, 2);
      const tipL = new THREE.PointLight(0xffffff, 0, 6, 2);
      A.scene.add(endL, tipL);
      const loop = new Loop(4.2);
      let thick = 1, jitter = true, hue = 0.97;
      const eAcc = { acc: 0 }, sAcc = { acc: 0 };
      const sweepAt = (k: number): V3 => [1.9 + 0.45 * Math.sin(k * 5), 0.45, lerp(-1.9, 2.1, k)];
      return base3d(A, (t, dt) => {
        const lt = loop.tick(t);
        const col = HSL(hue, 1, 0.55, 2);
        const tip = mg.tip();
        const charge = sstep(0, 0.6, lt);
        const on = sstep(0.55, 0.7, lt) * (1 - sstep(3.5, 3.9, lt));
        const k = clamp((lt - 0.6) / 2.9, 0, 1);
        const sw = 0.5 - 0.5 * Math.cos(k * Math.PI);
        const end = sweepAt(sw);
        const flick = jitter ? 1 + (Math.random() - 0.5) * 0.3 : 1;
        const R = 0.17 * thick * on * flick * (1 + 0.5 * Math.exp(-(lt - 0.6) * 8) * (lt > 0.6 ? 1 : 0));
        const L = placeBetween(outer, tip, end, Math.max(R, 1e-4));
        placeBetween(inner, tip, end, Math.max(R * 0.32, 1e-4));
        for (const m of [outer, inner]) {
          const u = (m.material as THREE.ShaderMaterial).uniforms;
          u.uT!.value = t;
          u.uA!.value = on;
          u.uLen!.value = L;
          (u.uC!.value as THREE.Color).setRGB(col[0], col[1], col[2]);
        }
        // 시작 · 끝 빛무리
        orbGlow(A.fx, tip, col, (0.18 + charge * 0.25 + on * 0.15) * thick * flick, 1);
        if (charge > 0 && on < 0.5) for (let i = 0; i < 2; i++) {
          const d = randDir();
          A.fx.emit({ p: add3(tip, sc3(d, 1.2)), v: sc3(d, -3), life: 0.35, size: 0.1, size2: 0.02, c: col, a: charge });
        }
        if (on > 0.02) {
          orbGlow(A.fx, end, col, 0.35 * thick * flick * on, 1);
          // 둘레 번개 떨림
          if (jitter) {
            const r = rng(Math.floor(t * 22));
            for (let j = 0; j < 2; j++) {
              const off: V3 = sc3(randDir(), 0.12 * thick);
              drawBolt(A.st, boltPts(add3(tip, off), add3(end, off), r, 5, 0.06), 0.01, col, 0.7 * on);
            }
          }
          for (let i = rate(sAcc, 50 * on, dt); i > 0; i--) {
            const d = norm3(add3(norm3(sub3(tip, end)), sc3(randDir(), 1.2)));
            A.st.spark({ p: end, v: [d[0] * rr(2, 5), Math.abs(d[1]) * rr(2, 5) + 1, d[2] * rr(2, 5)], life: rr(0.25, 0.5), c: C(0xffe0c0, 3), c2: col, len: 0.05, w: 0.025, grav: 9, drag: 1.5, fadeIn: 0 });
          }
          for (let i = rate(eAcc, 35 * on, dt); i > 0; i--) {
            A.fx.emit({ p: [end[0] + rr(-0.15, 0.15), 0.04, end[2] + rr(-0.15, 0.15)], v: [0, rr(0.05, 0.3), 0], life: rr(0.8, 1.6), size: rr(0.08, 0.16), size2: 0.02, c: C(0xff9a40, 2.5), c2: C(0xff3000, 0.6), a: 1 });
          }
          for (const m of mons) if (len3(sub3(m.center(), end)) < 0.7) m.hit(sc3(col, 0.8), 0.6);
        }
        endG.position.set(end[0], 0.02, end[2]);
        endG.material.color.setRGB(col[0], col[1], col[2]);
        endG.material.opacity = on * (0.8 + Math.random() * 0.2);
        endL.color.setRGB(col[0] / 2, col[1] / 2, col[2] / 2);
        endL.position.set(end[0], 0.8, end[2]);
        endL.intensity = 40 * on * flick;
        tipL.color.copy(endL.color);
        tipL.position.set(tip[0], tip[1], tip[2]);
        tipL.intensity = 8 + 25 * charge;
        for (const m of mons) m.tick(dt, t);
        A.fx.step(dt);
        A.st.step(dt);
        A.tickCam(dt);
      }, [
        { type: 'button', label: '다시 쏘기', on: () => loop.restart() },
        { type: 'range', label: '두께', min: 0.4, max: 2.2, step: 0.1, value: thick, on: (v) => (thick = v) },
        { type: 'toggle', label: '가장자리 떨림', value: jitter, on: (v) => (jitter = v) },
        { type: 'range', label: '색', min: 0, max: 1, step: 0.01, value: hue, on: (v) => (hue = v) },
      ]);
    },
  },

  /* ───────── i190 소환 ───────── */
  i190: {
    kind: '3d',
    caption: '마법진이 그려지고 → 빛기둥이 솟고 → 수정 수호자가 아래에서 위로 디졸브로 나타나며 빛 조각이 흩어진다',
    make() {
      const A = arena({ cam: [0, 6.4, 6.8], look: [0, 0.9, 0] });
      const runeMat = new THREE.ShaderMaterial({
        uniforms: { uMap: { value: A.tx.rune() }, uP: { value: 0 }, uC: { value: new THREE.Color(1.4, 2.0, 3.2) }, uA: { value: 1 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform sampler2D uMap; uniform float uP; uniform vec3 uC; uniform float uA; varying vec2 vUv;
          void main(){ vec2 p = vUv - 0.5; float ang = atan(p.y, p.x) / 6.2831853 + 0.5;
            float r = length(p) * 2.0;
            float rev = smoothstep(ang - 0.02, ang, uP * 1.05 - (1.0 - r) * 0.15);
            float a = texture2D(uMap, vUv).a * rev;
            float head = exp(-pow((ang - uP) * 40.0, 2.0)) * step(0.8, r) * step(r, 0.98) * step(uP, 0.999);
            gl_FragColor = vec4(uC * (1.0 + head * 3.0), (a + head) * uA); ${TONE} }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const circle = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), runeMat);
      circle.rotation.x = -Math.PI / 2;
      circle.position.y = 0.03;
      const under = decal(A.tx.glow(), 5.5, C(0x5aa0ff, 1.4), 0);
      A.scene.add(circle, under);
      const pillarMat = new THREE.ShaderMaterial({
        uniforms: { uT: { value: 0 }, uA: { value: 0 }, uC: { value: new THREE.Color(1.2, 1.9, 3.2) } },
        vertexShader: FRESNEL_V,
        fragmentShader: `${NOISE} uniform float uT; uniform float uA; uniform vec3 uC; varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vP;
          void main(){ float f = abs(dot(normalize(vN), normalize(vV)));
            float n = vn(vec2(vUv.x * 18.0, vUv.y * 4.0 - uT * 3.5));
            float a = pow(1.0 - vUv.y, 1.6) * (0.35 + 0.9 * n) * pow(f, 1.2) * uA;
            gl_FragColor = vec4(uC + vec3(1.0) * pow(1.0 - vUv.y, 6.0), a); ${TONE} }`,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 40, 1, true), pillarMat);
      const core = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 24, 1, true), pillarMat.clone());
      (core.material as THREE.ShaderMaterial).uniforms.uC!.value = new THREE.Color(3, 3, 3.4);
      A.scene.add(pillar, core);
      // 수정 수호자 + 디졸브
      const cut = { value: -1 };
      const edgeC = { value: new THREE.Color(2.5, 4, 6) };
      const crystal = new THREE.MeshStandardMaterial({ color: 0x9ad8ff, roughness: 0.18, metalness: 0.15, emissive: new THREE.Color(0.06, 0.18, 0.35), flatShading: true });
      crystal.onBeforeCompile = (sh) => {
        sh.uniforms.uCut = cut;
        sh.uniforms.uEdge = edgeC;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <project_vertex>', '#include <project_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>\nvarying vec3 vWp; uniform float uCut; uniform vec3 uEdge;\n${NOISE}`)
          .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\nfloat dz = vWp.y + (vn3(vWp * 7.0) - 0.5) * 0.35 - uCut; if (dz > 0.0) discard;`)
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += uEdge * smoothstep(-0.12, 0.0, dz);`);
      };
      const guard = new THREE.Group();
      const shard = (r: number, h: number, x: number, y: number, z: number, rz = 0, rx = 0): THREE.Mesh => {
        const m = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), crystal);
        m.scale.set(r, h, r);
        m.position.set(x, y, z);
        m.rotation.set(rx, 0.4, rz);
        guard.add(m);
        return m;
      };
      shard(0.42, 1.05, 0, 1.05, 0);
      shard(0.22, 0.55, -0.42, 0.55, 0.15, 0.35);
      shard(0.2, 0.5, 0.44, 0.5, 0.1, -0.35);
      shard(0.18, 0.42, 0.1, 0.42, -0.42, 0, -0.4);
      shard(0.16, 0.4, -0.12, 0.38, 0.44, 0, 0.4);
      const halo = new THREE.Group();
      for (let i = 0; i < 6; i++) {
        const m = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), crystal);
        m.scale.set(0.08, 0.18, 0.08);
        const a = (i / 6) * TAU;
        m.position.set(Math.cos(a) * 0.85, 0, Math.sin(a) * 0.85);
        halo.add(m);
      }
      halo.position.y = 1.4;
      guard.add(halo);
      const gsh = decal(A.tx.shadow(), 1.6, [1, 1, 1], 0.8, true);
      guard.add(gsh);
      A.scene.add(guard);
      const light = new Flash(0x7ab8ff, 120, 3, 9);
      light.light.position.set(0, 1.2, 0.5);
      A.scene.add(light.light);
      const loop = new Loop(5.2);
      let speed = 1, pillarOn = true;
      const pAcc = { acc: 0 }, eAcc = { acc: 0 };
      const BL = C(0x7ac0ff, 2);
      return base3d(A, (t, dt) => {
        const lt = loop.tick(t);
        const P = 0.9; // 마법진 다 그림
        runeMat.uniforms.uP!.value = clamp(lt / P, 0, 1);
        const fadeAll = 1 - sstep(loop.P - 0.6, loop.P - 0.1, lt);
        runeMat.uniforms.uA!.value = fadeAll * (0.8 + 0.2 * Math.sin(lt * 6));
        circle.rotation.z = lt * 0.25;
        under.material.opacity = sstep(0, P, lt) * 0.55 * fadeAll;
        // 빛기둥
        const pk = sstep(P, P + 0.25, lt) * (1 - sstep(2.6, 3.3, lt));
        const ph = 7 * sstep(P, P + 0.3, lt);
        pillar.visible = core.visible = pillarOn && pk > 0.01;
        pillar.scale.set(1.15 * (0.6 + 0.4 * pk), Math.max(ph, 0.01), 1.15 * (0.6 + 0.4 * pk));
        pillar.position.y = ph / 2;
        core.scale.set(0.35 * pk, Math.max(ph, 0.01), 0.35 * pk);
        core.position.y = ph / 2;
        pillarMat.uniforms.uT!.value = t;
        pillarMat.uniforms.uA!.value = pk;
        (core.material as THREE.ShaderMaterial).uniforms.uT!.value = t * 1.5;
        (core.material as THREE.ShaderMaterial).uniforms.uA!.value = pk * 0.8;
        if (loop.hit(P)) {
          light.kick([0, 1.2, 0.5], 1);
          flashAt(A.fx, [0, 0.4, 0], 4, BL, 0.3);
          sparks(A.st, [0, 0.1, 0], { n: 30, c: C(0xd0eaff, 3), c2: BL, speed: 5, life: 0.6, grav: 2, up: 0.9 });
        }
        // 디졸브 (아래 → 위), 끝에 위 → 아래로 사라짐
        const d0 = P + 0.2;
        const d1 = d0 + 1.5 / speed;
        let c = -0.5;
        if (lt > d0) c = lerp(-0.3, 2.6, sstep(d0, d1, lt));
        if (lt > loop.P - 0.9) c = lerp(2.6, -0.3, sstep(loop.P - 0.9, loop.P - 0.2, lt));
        cut.value = c;
        guard.visible = c > -0.29;
        guard.rotation.y = t * 0.4;
        guard.position.y = 0.06 + Math.sin(t * 2) * 0.05 * sstep(d1, d1 + 0.3, lt);
        halo.rotation.y = -t * 1.3;
        if (c > -0.3 && c < 2.5) for (let i = rate(eAcc, 70, dt); i > 0; i--) {
          const a = Math.random() * TAU;
          const r = c < 1 ? lerp(0.6, 0.45, c) : lerp(0.45, 0.05, (c - 1) / 1.5);
          A.fx.emit({ p: [Math.cos(a) * r, c + 0.05, Math.sin(a) * r], v: [Math.cos(a) * 0.5, rr(0.3, 1), Math.sin(a) * 0.5], life: rr(0.3, 0.6), size: rr(0.08, 0.16), size2: 0.02, c: C(0xd8f0ff, 3), c2: BL, a: 1 });
        }
        if (loop.hit(d1)) {
          light.kick([0, 1.2, 0.5], 0.8);
          for (let i = 0; i < 70; i++) {
            const d = randDir();
            A.fx.emit({ p: [d[0] * 0.4, 1 + d[1] * 0.8, d[2] * 0.4], v: [d[0] * rr(2, 4), d[1] * 2 + 1, d[2] * rr(2, 4)], life: rr(0.6, 1.2), size: rr(0.1, 0.22), size2: 0.02, c: Math.random() < 0.3 ? C(0xffe6a0, 3) : BL, a: 1, drag: 2, grav: 1.5 });
          }
          sparks(A.st, [0, 1, 0], { n: 24, c: C(0xe0f4ff, 3), c2: BL, speed: 6, life: 0.5, grav: 3 });
        }
        // 마법진 위로 오르는 빛
        for (let i = rate(pAcc, 50 * sstep(0, P, lt) * fadeAll, dt); i > 0; i--) {
          const a = Math.random() * TAU, r = rr(1.6, 2.05);
          A.fx.emit({ p: [Math.cos(a) * r, 0.05, Math.sin(a) * r], v: [0, rr(0.4, 1.4), 0], life: rr(0.6, 1.2), size: rr(0.06, 0.12), size2: 0.02, c: BL, a: 1 });
        }
        light.tick(dt, 6 * fadeAll);
        A.fx.step(dt);
        A.st.step(dt);
        A.tickCam(dt);
      }, [
        { type: 'button', label: '다시 소환', on: () => loop.restart() },
        { type: 'range', label: '디졸브 속도', min: 0.4, max: 2.5, step: 0.1, value: speed, on: (v) => (speed = v) },
        { type: 'toggle', label: '빛기둥', value: pillarOn, on: (v) => (pillarOn = v) },
      ]);
    },
  },

  /* ───────── i191 보호막 맞음 ───────── */
  i191: {
    kind: '3d',
    caption: '반투명 보호막에 불덩이가 맞으면 맞은 곳에서 육각 무늬 물결이 퍼지고 금이 갔다가 아문다',
    make() {
      const A = arena({ cam: [0, 6.0, 7.0], look: [0, 0.8, 0] });
      const hero = mage(A, 0x2a4a8a, [1.5, 2.2, 3.4]);
      A.scene.add(hero.g);
      const hits = [0, 1, 2, 3].map(() => new THREE.Vector4(0, 1, 0, -10));
      const shMat = new THREE.ShaderMaterial({
        uniforms: { uT: { value: 0 }, uHit: { value: hits }, uC: { value: new THREE.Color(0.35, 0.75, 1.4) }, uHex: { value: 1 }, uCrack: { value: 1 }, uGain: { value: 1 } },
        vertexShader: FRESNEL_V,
        fragmentShader: `uniform float uT; uniform vec4 uHit[4]; uniform vec3 uC; uniform float uHex; uniform float uCrack; uniform float uGain;
          varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying vec3 vP;
          float hexD(vec2 p){ const vec2 s = vec2(1.0, 1.7320508); vec4 hC = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
            vec4 h = vec4(p - hC.xy * s, p - (hC.zw + 0.5) * s); vec2 g = dot(h.xy, h.xy) < dot(h.zw, h.zw) ? h.xy : h.zw;
            vec2 a = abs(g); return 0.5 - max(dot(a, s * 0.5), a.x); }
          vec3 h33(vec3 p){ p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6))); return fract(sin(p) * 43758.5453); }
          float vorEdge(vec3 x){ vec3 n = floor(x), f = fract(x); vec3 mr = vec3(0.0); float md = 8.0;
            for (int k = -1; k <= 1; k++) for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
              vec3 g = vec3(float(i), float(j), float(k)); vec3 r = g + h33(n + g) - f; float d = dot(r, r); if (d < md) { md = d; mr = r; } }
            md = 8.0;
            for (int k = -1; k <= 1; k++) for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
              vec3 g = vec3(float(i), float(j), float(k)); vec3 r = g + h33(n + g) - f;
              if (dot(mr - r, mr - r) > 1e-5) md = min(md, dot(0.5 * (mr + r), normalize(r - mr))); }
            return md; }
          void main(){
            vec3 n = normalize(vN); vec3 v = normalize(vV);
            float fr = 1.0 - abs(dot(n, v));
            float rim = pow(fr, 3.0);
            vec3 P = normalize(vP);
            vec3 w = pow(abs(P), vec3(4.0)); w /= (w.x + w.y + w.z);
            float K = 5.5;
            float e = hexD(P.yz * K) * w.x + hexD(P.zx * K) * w.y + hexD(P.xy * K) * w.z;
            float hex = 1.0 - smoothstep(0.0, 0.07, e);
            float ripple = 0.0, spot = 0.0, crack = 0.0, near = 0.0;
            for (int i = 0; i < 4; i++) {
              vec4 H = uHit[i]; float age = uT - H.w;
              if (age < 0.0 || age > 1.6) continue;
              float ang = acos(clamp(dot(P, H.xyz), -1.0, 1.0));
              float r = age * 2.4;
              ripple += exp(-pow((ang - r) * 6.0, 2.0)) * (1.0 - age / 1.6);
              near += exp(-ang * ang * 6.0) * (1.0 - age / 1.6);
              spot += exp(-ang * ang * 45.0) * max(0.0, 1.0 - age * 3.5);
              if (uCrack > 0.5) {
                float cz = smoothstep(0.75, 0.0, ang) * max(0.0, 1.0 - age / 1.3);
                if (cz > 0.01) { float ve = vorEdge(P * 6.0 + H.xyz * 13.0); crack += (1.0 - smoothstep(0.0, 0.035, ve)) * cz; }
              }
            }
            float a = 0.035 + rim * 0.75 + hex * uHex * (0.05 + rim * 0.35 + ripple * 2.2 + near * 0.5) + ripple * 0.45 + spot * 2.0 + crack * 1.6;
            vec3 col = uC * a + vec3(1.0) * (spot * 1.6 + crack * 1.4 + ripple * hex * uHex * 0.8);
            gl_FragColor = vec4(col * uGain, 1.0);
            ${TONE} }`,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      const RAD = 1.45;
      const CEN: V3 = [0, 0.95, 0];
      const shield = new THREE.Mesh(new THREE.SphereGeometry(RAD, 64, 40), shMat);
      shield.position.set(CEN[0], CEN[1], CEN[2]);
      A.scene.add(shield);
      const floorRing = decal(A.tx.ring(), 3.3, C(0x5ab0ff, 1.2), 0.7);
      const floorGlow = decal(A.tx.glow(), 4.2, C(0x3a80ff, 1), 0.5);
      A.scene.add(floorRing, floorGlow);
      const hitL = new Flash(0x8ac8ff, 70, 6);
      A.scene.add(hitL.light);
      interface Shot { p: V3; v: V3; live: boolean; trail: V3[] }
      const shots: Shot[] = [];
      let hi = 0, nextAuto = 0.3, clock = 0, gain = 1;
      const FIRE = C(0xffa040, 2.5);
      const fire = (): void => {
        const a = Math.random() * TAU;
        const p: V3 = [Math.cos(a) * 6, rr(0.7, 1.8), Math.sin(a) * 6];
        const tg: V3 = add3(CEN, sc3(randDir(), 0.3));
        shots.push({ p, v: sc3(norm3(sub3(tg, p)), 9), live: true, trail: [] });
      };
      const fAcc = { acc: 0 };
      return base3d(A, (t, dt) => {
        clock = t;
        if (t > nextAuto) {
          fire();
          nextAuto = t + rr(0.55, 0.95);
        }
        shMat.uniforms.uT!.value = t;
        for (const s of shots) {
          if (s.live) {
            s.p = add3(s.p, sc3(s.v, dt));
            s.trail.unshift(s.p);
            if (s.trail.length > 10) s.trail.pop();
            orbGlow(A.fx, s.p, FIRE, 0.3, 1);
            for (let i = rate(fAcc, 40, dt); i > 0; i--) A.fx.emit({ p: s.p, v: sc3(randDir(), 0.4), life: rr(0.2, 0.4), size: 0.3, size2: 0.05, c: FIRE, c2: C(0xff3000, 0.8), a: 0.6 });
            const rel = sub3(s.p, CEN);
            if (len3(rel) <= RAD) {
              s.live = false;
              const d = norm3(rel);
              const hp = add3(CEN, sc3(d, RAD));
              hits[hi % 4]!.set(d[0], d[1], d[2], t);
              hi++;
              sparks(A.st, hp, { n: 22, c: C(0xffe0b0, 3), c2: FIRE, speed: 6, life: 0.4, grav: 6, dir: d, cone: 0.5 });
              sparks(A.st, hp, { n: 12, c: C(0xc8e8ff, 3), c2: C(0x4aa0ff, 1), speed: 4, life: 0.35, grav: 3, dir: d, cone: 0.3 });
              flashAt(A.fx, hp, 2.2, C(0xbfe0ff, 2));
              hitL.kick(hp, gain);
              A.shake(0.05);
            }
          } else if (s.trail.length) s.trail.pop();
          const n = s.trail.length;
          for (let i = 0; i < n - 1; i++) {
            const k = 1 - i / (n - 1);
            A.st.seg(s.trail[i + 1]!, s.trail[i]!, 0.15 * k + 0.015, FIRE, 0.7 * k);
          }
        }
        for (let i = shots.length - 1; i >= 0; i--) if (!shots[i]!.live && !shots[i]!.trail.length) shots.splice(i, 1);
        floorRing.material.opacity = 0.5 + hitL.lv * 0.5;
        shMat.uniforms.uGain!.value = gain;
        hitL.tick(dt);
        A.fx.step(dt);
        A.st.step(dt);
        A.tickCam(dt);
      }, [
        { type: 'button', label: '맞히기', on: () => { fire(); nextAuto = clock + 1.2; } },
        { type: 'toggle', label: '육각 무늬', value: true, on: (v) => (shMat.uniforms.uHex!.value = v ? 1 : 0) },
        { type: 'toggle', label: '금 가기', value: true, on: (v) => (shMat.uniforms.uCrack!.value = v ? 1 : 0) },
        { type: 'range', label: '세기', min: 0.4, max: 2, step: 0.1, value: gain, on: (v) => (gain = v) },
      ]);
    },
  },

  /* ───────── i192 검기 · 휘두름 호 ───────── */
  i192: {
    kind: '3d',
    caption: '반달 모양 메시에 흐르는 빛 무늬가 휙 — 가장자리 하얀 날 · 끝에서 튀는 불티, 세 번 연속 베기',
    make() {
      const A = arena({ cam: [0, 5.6, 6.6], look: [0, 0.9, 0] });
      const foe = monster(A, 0x5d4a78, 0);
      foe.g.position.set(0.3, 0, -0.2);
      foe.g.scale.setScalar(1.3);
      A.scene.add(foe.g);
      // 반달 메시: u = 휘두른 쪽, v = 안 → 바깥
      const SEG = 64;
      const pos: number[] = [], uv: number[] = [], idx: number[] = [];
      const A0 = -2.0, A1 = 2.0, R1 = 1.85, R0 = 0.3;
      for (let i = 0; i <= SEG; i++) {
        const u = i / SEG;
        const a = lerp(A0, A1, u);
        const rin = R0;
        pos.push(Math.cos(a) * rin, 0, Math.sin(a) * rin, Math.cos(a) * R1, 0, Math.sin(a) * R1);
        uv.push(u, 0, u, 1);
        if (i < SEG) {
          const b = i * 2;
          idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      const mk = (): THREE.ShaderMaterial =>
        new THREE.ShaderMaterial({
          uniforms: { uHead: { value: -1 }, uTail: { value: 1.05 }, uC: { value: new THREE.Color() }, uC2: { value: new THREE.Color() }, uT: { value: 0 }, uA: { value: 1 } },
          vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
          fragmentShader: `${NOISE} uniform float uHead; uniform float uTail; uniform vec3 uC; uniform vec3 uC2; uniform float uT; uniform float uA; varying vec2 vUv;
            void main(){ float u = vUv.x, v = vUv.y;
              float d = uHead - u; if (d < 0.0) discard;
              float k = 1.0 - d / uTail; if (k <= 0.0) discard;
              float w = 0.03 + 0.66 * pow(k, 0.9) * (1.0 - pow(k, 4.0)) * smoothstep(1.0, 0.93, u);
              float vv = (v - (1.0 - w)) / w; if (vv < 0.0) discard;
              float trail = pow(k, 1.4);
              float edge = pow(vv, 1.8);
              float line = smoothstep(0.82, 0.94, vv) * (1.0 - smoothstep(0.97, 1.0, vv));
              float n = vn(vec2(u * 22.0 - uT * 3.0, v * 4.0)) * vn(vec2(u * 9.0 + 2.0, v * 9.0 - uT * 2.0));
              float streak = 0.35 + 1.6 * n;
              float head = exp(-d * 26.0);
              vec3 col = mix(uC2, uC, edge) * (0.9 + streak * edge * 1.8) + mix(uC, vec3(1.0), 0.6) * (line * 1.2 * k + head * edge * 0.9);
              float a = trail * uA * (0.6 + edge * 0.6) * smoothstep(0.0, 0.2, vv) * smoothstep(0.0, 0.03, u);
              gl_FragColor = vec4(col, a); ${TONE} }`,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        });
      const pivot: V3 = [0.3, 0.95, -0.2];
      const slashes = [
        { e: new THREE.Euler(0.55, 0, 0.15), at: 0.2, flip: 1 },
        { e: new THREE.Euler(0.6, 0, 0.75), at: 0.75, flip: -1 },
        { e: new THREE.Euler(0.65, 0, -0.65), at: 1.3, flip: 1 },
      ].map((s) => {
        const m = new THREE.Mesh(geo, mk());
        m.scale.x = s.flip;
        m.position.set(pivot[0], pivot[1], pivot[2]);
        m.rotation.copy(s.e);
        m.frustumCulled = false;
        A.scene.add(m);
        return { m, at: s.at };
      });
      const glow = decal(A.tx.glow(), 3.6, [1, 1, 1], 0);
      glow.position.set(pivot[0], 0.02, pivot[2]);
      A.scene.add(glow);
      const hitL = new Flash(0xffffff, 60, 7);
      A.scene.add(hitL.light);
      const loop = new Loop(2.4);
      let colorIdx = 0, embers = true;
      const PAL: [V3, V3][] = [
        [C(0xff7a10, 1.5), C(0xd01e00, 1.1)],
        [C(0x5ad0ff, 1.5), C(0x1a50ff, 1.1)],
        [C(0xb070ff, 1.5), C(0x6a20ff, 1.1)],
      ];
      const DUR = 0.24;
      const v = new THREE.Vector3();
      return base3d(A, (t, dt) => {
        const lt = loop.tick(t);
        const [c1, c2] = PAL[colorIdx]!;
        for (const s of slashes) {
          const u = s.m.material.uniforms;
          const k = (lt - s.at) / DUR;
          const head = k < 0 ? -1 : 1.04 * easeOut(Math.min(k, 1)) + Math.max(0, k - 1) * 0.04;
          u.uHead!.value = head;
          u.uT!.value = t;
          u.uA!.value = k < 0 ? 0 : 1 - sstep(1.1, 3.2, k);
          (u.uC!.value as THREE.Color).setRGB(c1[0], c1[1], c1[2]);
          (u.uC2!.value as THREE.Color).setRGB(c2[0], c2[1], c2[2]);
          s.m.visible = k >= 0 && k < 3.3;
          // 칼끝 불티
          if (k >= 0 && k < 1) {
            const hu = clamp(head, 0, 1);
            const a = lerp(A0, A1, hu);
            v.set(Math.cos(a) * R1, 0, Math.sin(a) * R1).applyMatrix4(s.m.matrixWorld);
            const tipP = ofV(v);
            const tg = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)).transformDirection(s.m.matrixWorld);
            A.fx.put(tipP, 0.9, c1, 0.5);
            if (embers) for (let i = 0; i < 4; i++) A.st.spark({ p: tipP, v: add3(sc3(ofV(tg), rr(2, 5)), sc3(randDir(), 1.5)), life: rr(0.2, 0.45), c: C(0xffffff, 2.5), c2: c2, len: 0.04, w: 0.02, grav: 6, drag: 2, fadeIn: 0 });
          }
          if (loop.hit(s.at + DUR * 0.45)) {
            const hp = foe.center();
            sparks(A.st, hp, { n: 26, c: C(0xffffff, 3), c2: c1, speed: 7, life: 0.35, grav: 5 });
            flashAt(A.fx, hp, 2.6, c1, 0.18);
            hitL.kick(hp, 1);
            hitL.light.color.setRGB(c1[0] / 2, c1[1] / 2, c1[2] / 2);
            foe.hit(sc3(c1, 0.6), 0.7);
            glow.material.opacity = 0.9;
            glow.material.color.setRGB(c2[0], c2[1], c2[2]);
            A.shake(0.08);
          }
        }
        glow.material.opacity *= Math.exp(-dt * 3);
        foe.tick(dt, t);
        hitL.tick(dt);
        A.fx.step(dt);
        A.st.step(dt);
        A.tickCam(dt);
      }, [
        { type: 'button', label: '다시 휘두르기', on: () => loop.restart() },
        { type: 'range', label: '색 (불꽃 · 얼음 · 번개)', min: 0, max: 2, step: 1, value: colorIdx, on: (v) => (colorIdx = v) },
        { type: 'toggle', label: '칼끝 불티', value: embers, on: (v) => (embers = v) },
      ]);
    },
  },

  /* ───────── i193 타격 반짝 ───────── */
  i193: {
    kind: '3d',
    caption: '맞는 순간 — 하얀 번쩍 · 별 모양 빛살 · 사방 줄 불티 · 퍼지는 고리, 그리고 아주 짧게 멈춤(히트스톱)',
    make() {
      const A = arena({ cam: [0, 5.0, 6.2], look: [0, 0.8, 0] });
      const foe = monster(A, 0x4a5c6e, 0);
      foe.g.scale.setScalar(1.4);
      A.scene.add(foe.g);
      const ringMat = new THREE.SpriteMaterial({ map: A.tx.ring(), color: new THREE.Color(2.5, 2.2, 1.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
      const ring = new THREE.Sprite(ringMat);
      ring.renderOrder = 8;
      A.scene.add(ring);
      const glow = decal(A.tx.glow(), 3, C(0xffc070, 1.5), 0);
      A.scene.add(glow);
      const hitL = new Flash(0xffd8a0, 90, 10);
      A.scene.add(hitL.light);
      const loop = new Loop(1.3);
      let rays = 6, stopOn = true;
      let freeze = 0, side = 1, local = 0;
      let hitP: V3 = [0, 1, 0.5];
      let rayAge = 9, ringAge = 9;
      let rayDirs: number[] = [];
      const right = new THREE.Vector3(), up = new THREE.Vector3();
      const BOLT = C(0xffd070, 2.5);
      return base3d(A, (t, dt) => {
        const lt = loop.tick(t);
        // 히트스톱: 그 사이 모든 것이 멈춘다
        let d = dt;
        if (freeze > 0) {
          freeze -= dt;
          d = 0;
        }
        local += d;
        // 날아오는 빛 주먹
        const T = 0.55;
        const k = lt / T;
        if (k < 1) {
          const from: V3 = [side * 4.5, 1.4, 1.5];
          const to: V3 = [side * 0.45, 0.85, 0.35];
          const p = mix3(from, to, k * k);
          const pp = mix3(from, to, Math.max(0, k - 0.12) * Math.max(0, k - 0.12));
          A.st.seg(pp, p, 0.08, BOLT, 0.8, 0);
          orbGlow(A.fx, p, BOLT, 0.2, 1);
        }
        if (loop.hit(T)) {
          hitP = [side * 0.45, 0.85, 0.35];
          side = -side;
          if (stopOn) freeze = 0.085;
          rayAge = 0;
          ringAge = 0;
          rayDirs = [];
          for (let i = 0; i < rays; i++) rayDirs.push((i / rays) * TAU + rr(-0.2, 0.2), rr(0.7, 1.5));
          flashAt(A.fx, hitP, 2.0, C(0xfff0d0, 2.5), 0.14);
          sparks(A.st, hitP, { n: 26, c: C(0xffffff, 3), c2: C(0xffa030, 1.2), speed: 9, life: 0.38, grav: 7, len: 0.035, w: 0.022 });
          for (let i = 0; i < 12; i++) A.fx.emit({ p: hitP, v: sc3(randDir(), rr(1, 3)), life: rr(0.2, 0.4), size: rr(0.1, 0.18), size2: 0.02, c: C(0xffd090, 3), a: 1, drag: 4, fadeIn: 0 });
          hitL.kick(hitP, 1);
          foe.hit([1.6, 1.3, 0.9], 0.8);
          glow.material.opacity = 1;
          glow.position.set(hitP[0], 0.02, hitP[2] - 0.2);
          A.shake(0.12);
        }
        rayAge += d;
        ringAge += d;
        // 별 빛살 (화면을 보는 평면 위)
        if (rayAge < 0.24) {
          right.setFromMatrixColumn(A.cam.matrixWorld, 0);
          up.setFromMatrixColumn(A.cam.matrixWorld, 1);
          const rk = rayAge / 0.24;
          for (let i = 0; i < rayDirs.length; i += 2) {
            const a = rayDirs[i]!, L = rayDirs[i + 1]! * (0.7 + easeOut(rk) * 1.1);
            const dir = right.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
            const end = add3(hitP, sc3(ofV(dir), L));
            A.st.seg(hitP, end, 0.1 * (1 - rk) + 0.01, C(0xffd890, 3), 1 - rk * rk, 0.6);
          }
          A.fx.put(hitP, 1.4 * (1 - rk) + 0.4, C(0xffffff, 3), 1 - rk);
        }
        ring.position.set(hitP[0], hitP[1], hitP[2]);
        ring.scale.setScalar(0.3 + easeOut(ringAge / 0.3) * 2.6);
        ringMat.opacity = Math.max(0, 1 - ringAge / 0.3);
        glow.material.opacity *= Math.exp(-dt * 4);
        foe.tick(d, local);
        hitL.tick(dt);
        A.fx.step(d);
        A.st.step(d);
        A.tickCam(dt);
      }, [
        { type: 'button', label: '때리기', on: () => loop.restart() },
        { type: 'range', label: '빛살 수', min: 3, max: 12, step: 1, value: rays, on: (v) => (rays = v) },
        { type: 'toggle', label: '히트스톱 (멈칫)', value: stopOn, on: (v) => (stopOn = v) },
      ]);
    },
  },

  /* ───────── i194 기 모으기 ───────── */
  i194: {
    kind: '3d',
    caption: '주변 빛 알갱이가 지팡이 끝으로 빨려 들며 구슬이 점점 커지고 고리가 조여든다 → 한 번에 발사 · 폭발',
    make() {
      const A = arena({ fx: 1200, st: 700 });
      const mg = mage(A, 0x3a2a6a, [2, 2, 3.5]);
      mg.g.position.set(-2.6, 0, 0.8);
      mg.g.rotation.y = 0.55;
      A.scene.add(mg.g);
      const foe = monster(A, 0x6a4a4a, 0);
      foe.g.position.set(2.8, 0, -0.6);
      foe.g.rotation.y = -0.6;
      A.scene.add(foe.g);
      A.scene.updateMatrixWorld(true);
      const rings = [0, 1, 2].map(() => {
        const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.tx.ring(), color: new THREE.Color(1.4, 1.8, 3), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
        m.renderOrder = 8;
        A.scene.add(m);
        return m;
      });
      const groundG = decal(A.tx.glow(), 3, C(0x6a9aff, 1.5), 0);
      const boomG = decal(A.tx.glow(), 3.4, C(0x8ab0ff, 2), 0);
      const shock = decal(A.tx.ring(), 1, C(0x9ac0ff, 2.5), 0);
      A.scene.add(groundG, boomG, shock);
      const orbL = new THREE.PointLight(0x8ab0ff, 0, 8, 2);
      const boom = new Flash(0x9ac0ff, 300, 6, 10);
      A.scene.add(orbL, boom.light);
      const loop = new Loop(3.8);
      let chargeT = 2.2, streak = true;
      const acc = { acc: 0 };
      const BL = C(0x7aa8ff, 1.8);
      const WH = C(0xe0ecff, 3);
      let shotAge = -1;
      let shotFrom: V3 = [0, 0, 0];
      let bAge = 9;
      return base3d(A, (t, dt) => {
        const lt = loop.tick(t);
        const tip = mg.tip();
        const T = chargeT;
        const c = lt < T ? Math.pow(lt / T, 1.4) : 0;
        if (loop.wrapped) { shotAge = -1; }
        // 빨려 드는 알갱이
        if (lt < T - 0.1) for (let i = rate(acc, 60 + 160 * c, dt); i > 0; i--) {
          const d = randDir();
          const r = rr(1.8, 3.0);
          const p = add3(tip, [d[0] * r, d[1] * r * 0.7, d[2] * r]);
          const tan = norm3([-d[2], 0.2, d[0]]);
          const cc = Math.random() < 0.25 ? WH : BL;
          if (streak) A.st.spark({ p, v: sc3(tan, 0.8), life: 3, c: cc, c2: cc, a: 0.9, fadeIn: 0.3, pull: { at: tip, k: 7 + 10 * c }, len: 0.06, w: 0.022, tail: 0 });
          else A.fx.emit({ p, v: sc3(tan, 0.8), life: 3, size: 0.12, c: cc, a: 0.9, fadeIn: 0.3, pull: { at: tip, k: 7 + 10 * c } });
        }
        // 구슬이 커짐 + 떨림
        const jit = c > 0.6 ? (Math.random() - 0.5) * 0.04 * c : 0;
        orbGlow(A.fx, add3(tip, [jit, jit, 0]), BL, 0.15 + c * 0.55, 1);
        if (c > 0.5 && Math.random() < c * 0.6) drawBolt(A.st, boltPts(tip, add3(tip, sc3(randDir(), 0.4 + c * 0.5)), rng(Math.floor(t * 40)), 3, 0.4), 0.01, BL, c);
        // 조여드는 고리
        rings.forEach((rg, i) => {
          const ph = ((lt * 2.4 + i / 3) % 1);
          rg.position.set(tip[0], tip[1], tip[2]);
          rg.scale.setScalar(lerp(3.2, 0.3, ph));
          rg.material.opacity = lt < T ? ph * c * 0.9 : 0;
        });
        groundG.position.set(tip[0], 0.02, tip[2]);
        groundG.material.opacity = c * 0.9;
        orbL.position.set(tip[0], tip[1], tip[2]);
        orbL.intensity = lt < T ? 5 + 55 * c : 4;
        // 발사
        if (loop.hit(T)) {
          shotAge = 0;
          shotFrom = tip;
          flashAt(A.fx, tip, 3, BL, 0.2);
          sparks(A.st, tip, { n: 20, c: WH, c2: BL, speed: 5, life: 0.3, grav: 2 });
          A.shake(0.06);
        }
        const tgt = foe.center();
        const FLY = 0.28;
        if (shotAge >= 0) {
          shotAge += dt;
          const k = Math.min(1, shotAge / FLY);
          const p = mix3(shotFrom, tgt, k);
          if (k < 1) {
            const back = mix3(shotFrom, tgt, Math.max(0, k - 0.35));
            A.st.seg(back, p, 0.22, BL, 0.8, 0);
            A.st.seg(back, p, 0.08, WH, 1, 0.2);
            orbGlow(A.fx, p, BL, 0.55, 1);
          } else if (shotAge - dt < FLY) {
            bAge = 0;
            flashAt(A.fx, tgt, 6, C(0xb0d0ff, 2.5), 0.3);
            sparks(A.st, tgt, { n: 60, c: WH, c2: BL, speed: 9, life: 0.6, grav: 7, up: 0.5, w: 0.03 });
            for (let i = 0; i < 40; i++) A.fx.emit({ p: tgt, v: sc3(randDir(), rr(1, 4)), life: rr(0.4, 0.9), size: rr(0.3, 0.7), size2: 0.05, c: BL, a: 0.8, drag: 3 });
            boom.kick(tgt, 1);
            foe.hit(sc3(BL, 1.4), 1);
            A.shake(0.3);
            shotAge = -1;
          }
        }
        bAge += dt;
        boomG.position.set(tgt[0], 0.02, tgt[2]);
        boomG.material.opacity = Math.max(0, 1 - bAge / 0.9);
        shock.position.set(tgt[0], 0.04, tgt[2]);
        shock.scale.setScalar(0.5 + easeOut(bAge / 0.5) * 5);
        shock.material.opacity = Math.max(0, 1 - bAge / 0.5);
        foe.tick(dt, t);
        boom.tick(dt);
        A.fx.step(dt);
        A.st.step(dt);
        A.tickCam(dt);
      }, [
        { type: 'button', label: '다시 모으기', on: () => loop.restart() },
        { type: 'range', label: '모으는 시간 (초)', min: 1, max: 3, step: 0.1, value: chargeT, on: (v) => { chargeT = v; loop.P = v + 1.6; } },
        { type: 'toggle', label: '줄무늬 알갱이', value: streak, on: (v) => (streak = v) },
      ]);
    },
  },

  /* ───────── i195 시간 정지 구 ───────── */
  i195: {
    kind: '3d',
    caption: '구 안쪽만 색이 빠지고 굴절되어 휘어 보이며, 안에 든 불티 · 미사일 · 괴물은 그 자리에 멈춘다',
    make() {
      const A = arena({ fx: 900 });
      const CEN: V3 = [0.2, 0.9, 0];
      const mon = monster(A, 0x5d4a78, 0);
      mon.g.position.set(-0.6, 0, 0.5);
      A.scene.add(mon.g);
      const mon2 = monster(A, 0x4a5c6e, 1);
      mon2.g.position.set(3.2, 0, -0.8);
      A.scene.add(mon2.g);
      // 화로 두 개 (불티 분수)
      const braz = ([[0.9, 0, -0.5], [-3.0, 0, -1.2]] as V3[]).map((p) => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.45, 12), new THREE.MeshStandardMaterial({ color: 0x3a3430, roughness: 0.6, metalness: 0.4 }));
        m.position.set(p[0], 0.22, p[2]);
        A.scene.add(m);
        return p;
      });
      const brazL = braz.map((p) => {
        const l = new THREE.PointLight(0xff9040, 14, 5, 2);
        l.position.set(p[0], 0.9, p[2]);
        A.scene.add(l);
        return l;
      });
      // 시간 정지 구 (화면 굴절)
      const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
      const sMat = new THREE.ShaderMaterial({
        uniforms: { uTex: { value: rt.texture }, uRes: { value: new THREE.Vector2(4, 4) }, uRef: { value: 1 }, uGray: { value: 1 }, uT: { value: 0 }, uA: { value: 0 } },
        vertexShader: FRESNEL_V,
        fragmentShader: `uniform sampler2D uTex; uniform vec2 uRes; uniform float uRef; uniform float uGray; uniform float uT; uniform float uA;
          varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying vec3 vP;
          void main(){ vec3 n = normalize(vN); vec3 v = normalize(vV); float ndv = abs(dot(n, v)); float fr = 1.0 - ndv;
            vec2 uv = gl_FragCoord.xy / uRes;
            vec2 off = n.xy * uRef * (0.03 + 0.09 * fr * fr) * uA;
            vec3 c; c.r = texture2D(uTex, uv - off * 1.15).r; c.g = texture2D(uTex, uv - off).g; c.b = texture2D(uTex, uv - off * 0.85).b;
            float l = dot(c, vec3(0.299, 0.587, 0.114));
            vec3 g = mix(c, vec3(l / (1.0 + l)) * vec3(0.62, 0.78, 1.1) * 0.85, uGray * uA);
            float wave = 0.5 + 0.5 * sin(fr * 26.0 + uT * 1.5);
            vec3 rim = vec3(1.0, 0.78, 0.4) * pow(fr, 4.0) * 1.3 + vec3(0.9, 0.7, 0.35) * pow(fr, 2.0) * wave * 0.05;
            gl_FragColor = vec4(g * (0.7 + 0.2 * ndv) + rim * uA, 1.0);
            ${TONE} }`,
      });
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), sMat);
      sphere.position.set(CEN[0], CEN[1], CEN[2]);
      sphere.renderOrder = 9;
      A.scene.add(sphere);
      // 시계 무늬 (구 가운데, 늘 화면을 봄)
      const face = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.tx.clock(), color: new THREE.Color(1.5, 1.0, 0.35), transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
      const hH = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.tx.hand(false), color: new THREE.Color(1.8, 1.4, 0.7), transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
      const hM = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.tx.hand(true), color: new THREE.Color(1.8, 1.4, 0.7), transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
      for (const s of [face, hH, hM]) {
        s.position.set(CEN[0], CEN[1], CEN[2]);
        s.renderOrder = 10;
        A.scene.add(s);
      }
      const ground = decal(A.tx.ring(), 1, C(0xffb850, 1.6), 0);
      ground.position.set(CEN[0], 0.03, CEN[2]);
      A.scene.add(ground);
      const loop = new Loop(6.4);
      let R = 0, refr = 1, gray = true;
      const RMAX = 2.1;
      const tsAt = (x: number, y: number, z: number): number => (R < 0.05 ? 1 : sstep(R * 0.88, R * 1.02, Math.hypot(x - CEN[0], y - CEN[1], z - CEN[2])));
      const tsP = (q: Part): number => tsAt(q.x, q.y, q.z);
      // 가로지르는 미사일 셋
      const MC = C(0x9a7aff, 1.8);
      const mis = [-1.0, 0.25, 1.4].map((z, i) => ({ x: -6 + i * 3.6, z, y: 0.9 + i * 0.12, trail: [] as V3[] }));
      const bAcc = braz.map(() => ({ acc: 0 }));
      const mAcc = { acc: 0 };
      let monT = 0, handA = 0;
      return base3d(A, (t, dt) => {
        const lt = loop.tick(t);
        const grow = sstep(0.4, 1.0, lt);
        const shrink = 1 - sstep(4.9, 5.6, lt);
        R = RMAX * easeOut(grow) * shrink;
        const on = R > 0.05 ? 1 : 0;
        sphere.visible = on > 0;
        sphere.scale.setScalar(Math.max(R, 0.01));
        sMat.uniforms.uT!.value = t;
        sMat.uniforms.uA!.value = clamp(R / 0.6, 0, 1);
        sMat.uniforms.uRef!.value = refr;
        sMat.uniforms.uGray!.value = gray ? 1 : 0;
        // 시계: 커질 땐 바늘이 빨리 돌다가 멈추고 째깍째깍 떨림
        handA += dt * (lt < 1 ? 14 * (1 - grow) + 0.5 : 0);
        const tick = Math.sin(t * 9) > 0.9 ? 0.03 : 0;
        const fa = clamp(R / RMAX, 0, 1);
        face.scale.setScalar(R * 1.25);
        face.material.opacity = 0.16 * fa;
        face.material.rotation = -lt * 0.05;
        hH.scale.set(R * 0.16, R * 1.25, 1);
        hM.scale.set(R * 0.16, R * 1.25, 1);
        hH.material.rotation = -handA * 0.25 + 1.1 + tick;
        hM.material.rotation = -handA * 3 - 0.6 - tick;
        hH.material.opacity = hM.material.opacity = 0.45 * fa;
        ground.scale.setScalar(R * 2.25);
        ground.rotation.z = handA * 0.02;
        ground.material.opacity = 0.8 * fa;
        if (loop.hit(0.4)) {
          flashAt(A.fx, CEN, 3, C(0xffe0a0, 2), 0.3);
        }
        // 불티 분수
        braz.forEach((p, i) => {
          for (let k = rate(bAcc[i]!, 55, dt); k > 0; k--) {
            const top: V3 = [p[0], 0.5, p[2]];
            if (tsAt(top[0], top[1], top[2]) < 0.5) continue;
            A.st.spark({ p: top, v: [rr(-0.7, 0.7), rr(3, 4.6), rr(-0.7, 0.7)], life: rr(1.0, 1.5), c: C(0xffc070, 3), c2: C(0xff3a00, 0.8), len: 0.03, w: 0.022, grav: 4, drag: 0.3, fadeIn: 0 });
          }
          A.fx.put([p[0], 0.55, p[2]], 0.9, C(0xff8a30, 1.5), 0.5 * tsAt(p[0], 0.55, p[2]) + 0.15);
          brazL[i]!.intensity = 10 + 6 * tsAt(p[0], 0.6, p[2]) * Math.random();
        });
        // 미사일
        for (const m of mis) {
          const s = tsAt(m.x, m.y, m.z);
          m.x += dt * 3.2 * s;
          if (m.x > 6) { m.x = -6; m.trail.length = 0; }
          const p: V3 = [m.x, m.y + Math.sin(m.x * 2) * 0.1, m.z];
          if (s > 0.05) { m.trail.unshift(p); if (m.trail.length > 12) m.trail.pop(); }
          orbGlow(A.fx, p, MC, 0.2, 1);
          const n = m.trail.length;
          for (let i = 0; i < n - 1; i++) {
            const k = 1 - i / (n - 1);
            A.st.seg(m.trail[i + 1]!, m.trail[i]!, 0.08 * k + 0.01, MC, 0.6 * k);
          }
          for (let i = rate(mAcc, 20 * s, dt); i > 0; i--) A.fx.emit({ p, v: sc3(randDir(), 0.3), life: 0.6, size: 0.1, size2: 0.02, c: MC, a: 0.9 });
        }
        // 뛰는 괴물 (안에 있으면 공중에 멈춤)
        const ms = tsAt(mon.g.position.x, 0.8, mon.g.position.z);
        monT += dt * ms;
        mon.g.position.y = Math.abs(Math.sin(monT * 3.2)) * 0.9;
        mon.tick(dt * ms, monT);
        mon2.g.position.y = Math.abs(Math.sin(t * 3.2 + 1)) * 0.9;
        mon2.tick(dt, t);
        A.fx.step(dt, tsP);
        A.st.step(dt, tsP);
        A.tickCam(dt);
      }, [
        { type: 'button', label: '다시 걸기', on: () => loop.restart() },
        { type: 'range', label: '굴절 세기', min: 0, max: 3, step: 0.1, value: refr, on: (v) => (refr = v) },
        { type: 'toggle', label: '흑백 (색 빠짐)', value: gray, on: (v) => (gray = v) },
      ], {
        render(r, w, h) {
          if (sphere.visible) {
            if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
            (sMat.uniforms.uRes!.value as THREE.Vector2).set(w, h);
            sphere.visible = false;
            face.visible = hH.visible = hM.visible = false;
            r.setRenderTarget(rt);
            r.render(A.scene, A.cam);
            r.setRenderTarget(null);
            sphere.visible = true;
            face.visible = hH.visible = hM.visible = true;
          }
          r.render(A.scene, A.cam);
        },
        dispose() {
          rt.dispose();
          A.dispose();
        },
      });
    },
  },

  /* ───────── i196 VFX 편집기 ───────── */
  i196: {
    kind: '3d',
    caption: '방출기 · 수명 곡선 · 층(핵 · 불꽃 · 연기 · 불티 · 바닥빛)을 값으로 조합 — 오른쪽은 같은 효과의 JSON',
    make() {
      const A = arena({ cam: [1.7, 5.4, 6.6], look: [1.7, 0.9, 0], fx: 900, st: 300 });
      const smoke = A.addPool(new Pool(220, { normal: true, map: A.tx.puff() }));
      smoke.obj.renderOrder = 4;
      // 받침대
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x3a3640, roughness: 0.7, metalness: 0.2 }));
      ped.position.y = 0.25;
      const cap = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 6, 24), new THREE.MeshStandardMaterial({ color: 0xc8a050, roughness: 0.4, metalness: 0.7 }));
      cap.rotation.x = Math.PI / 2;
      cap.position.y = 0.5;
      A.scene.add(ped, cap);
      const groundG = decal(A.tx.glow(), 3.6, [1, 1, 1], 0.8);
      A.scene.add(groundG);
      const L = new THREE.PointLight(0xffffff, 20, 7, 2);
      L.position.set(0, 1.3, 0.3);
      A.scene.add(L);
      interface FX { rate: number; speed: number; size: number; life: number; hue: number; gravity: number; spread: number; core: boolean; flame: boolean; smoke: boolean; sparks: boolean; ground: boolean }
      const PRESETS: { name: string; fx: FX }[] = [
        { name: '불덩이', fx: { rate: 70, speed: 1.6, size: 0.9, life: 0.9, hue: 0.06, gravity: -1.4, spread: 0.35, core: true, flame: true, smoke: true, sparks: true, ground: true } },
        { name: '얼음 결정', fx: { rate: 55, speed: 2.4, size: 0.5, life: 1.1, hue: 0.55, gravity: 1.8, spread: 0.9, core: true, flame: true, smoke: false, sparks: true, ground: true } },
        { name: '독 샘', fx: { rate: 40, speed: 0.9, size: 1.2, life: 1.6, hue: 0.3, gravity: -0.5, spread: 0.6, core: false, flame: true, smoke: true, sparks: false, ground: true } },
        { name: '비전 소용돌이', fx: { rate: 80, speed: 2.8, size: 0.6, life: 0.8, hue: 0.78, gravity: 0, spread: 1, core: true, flame: true, smoke: false, sparks: true, ground: true } },
      ];
      const cur: FX = { ...PRESETS[0]!.fx };
      let auto = true, pi = 0, presetName = PRESETS[0]!.name, lastSwitch = 0, dirty = true, lastDraw = -1;
      // 오른쪽 판 (JSON · 노드)
      const hud = new THREE.Scene();
      const hudCam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
      const pc = document.createElement('canvas');
      pc.width = 512;
      pc.height = 640;
      const ptex = new THREE.CanvasTexture(pc);
      ptex.colorSpace = THREE.SRGBColorSpace;
      ptex.minFilter = THREE.LinearFilter;
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: ptex, transparent: true, toneMapped: false, depthTest: false }));
      hud.add(panel);
      let PW = 0, PH = 0;
      const FONT = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
      const MONO = 'Consolas, "D2Coding", monospace';
      const json = (): string =>
        JSON.stringify(
          {
            effect: presetName,
            emitter: { shape: 'cone', rate: Math.round(cur.rate), spread: +cur.spread.toFixed(2), speed: +cur.speed.toFixed(2) },
            particle: { life: +cur.life.toFixed(2), size: +cur.size.toFixed(2), gravity: +cur.gravity.toFixed(2), hue: +cur.hue.toFixed(2) },
            curves: { size: [0, 1, 0.3], alpha: [0, 1, 0], color: 'white→hue→dark' },
            layers: { core: cur.core, flame: cur.flame, smoke: cur.smoke, sparks: cur.sparks, ground: cur.ground },
          },
          null,
          1,
        ).replace(/\[\s+([^\]]*?)\s+\]/g, (_m, inner: string) => '[' + inner.replace(/\s+/g, ' ') + ']');
      const drawPanel = (): void => {
        const W = pc.width, H = pc.height;
        const g = pc.getContext('2d')!;
        const s = W / 360;
        g.clearRect(0, 0, W, H);
        g.fillStyle = 'rgba(14,12,24,0.88)';
        g.strokeStyle = 'rgba(160,140,255,0.45)';
        g.lineWidth = 2 * s;
        g.beginPath();
        g.roundRect(s, s, W - 2 * s, H - 2 * s, 12 * s);
        g.fill();
        g.stroke();
        const col = (h: number, l = 60): string => `hsl(${Math.round(h * 360)},90%,${l}%)`;
        g.fillStyle = '#fff';
        g.font = `800 ${16 * s}px ${FONT}`;
        g.textBaseline = 'middle';
        g.fillText('효과 편집기', 14 * s, 20 * s);
        g.fillStyle = col(cur.hue, 70);
        g.font = `700 ${12 * s}px ${FONT}`;
        g.fillText('· ' + presetName, 108 * s, 21 * s);
        // 노드 셋
        const nodes = ['방출기', '수명 곡선', '층'];
        const nw = 98 * s, nh = 56 * s, ny = 38 * s;
        nodes.forEach((nm, i) => {
          const x = 12 * s + i * (nw + 18 * s);
          g.fillStyle = 'rgba(255,255,255,0.06)';
          g.strokeStyle = i === 0 ? col(cur.hue) : 'rgba(255,255,255,0.25)';
          g.lineWidth = 1.5 * s;
          g.beginPath();
          g.roundRect(x, ny, nw, nh, 7 * s);
          g.fill();
          g.stroke();
          g.fillStyle = '#e8e4ff';
          g.font = `700 ${10.5 * s}px ${FONT}`;
          g.fillText(nm, x + 7 * s, ny + 10 * s);
          if (i < 2) {
            g.strokeStyle = 'rgba(200,190,255,0.6)';
            g.beginPath();
            g.moveTo(x + nw, ny + nh / 2);
            g.lineTo(x + nw + 18 * s, ny + nh / 2);
            g.stroke();
          }
          if (i === 0) {
            // 원뿔 모양 + 방출량 막대
            g.strokeStyle = col(cur.hue);
            g.beginPath();
            g.moveTo(x + 22 * s, ny + 48 * s);
            g.lineTo(x + 22 * s - 18 * s * cur.spread, ny + 22 * s);
            g.moveTo(x + 22 * s, ny + 48 * s);
            g.lineTo(x + 22 * s + 18 * s * cur.spread, ny + 22 * s);
            g.stroke();
            g.fillStyle = col(cur.hue);
            g.fillRect(x + 48 * s, ny + 40 * s, 42 * s * clamp(cur.rate / 120, 0, 1), 5 * s);
            g.fillStyle = 'rgba(255,255,255,0.15)';
            g.fillRect(x + 48 * s, ny + 30 * s, 42 * s * clamp(cur.speed / 3, 0, 1), 5 * s);
          } else if (i === 1) {
            g.lineWidth = 1.8 * s;
            g.strokeStyle = col(cur.hue);
            g.beginPath();
            for (let k = 0; k <= 20; k++) {
              const u = k / 20;
              const y = Math.sin(Math.PI * u) * (1 - u * 0.3);
              const px = x + 8 * s + u * (nw - 16 * s), py = ny + 50 * s - y * 28 * s;
              if (k) g.lineTo(px, py);
              else g.moveTo(px, py);
            }
            g.stroke();
            g.strokeStyle = 'rgba(255,255,255,0.55)';
            g.beginPath();
            for (let k = 0; k <= 20; k++) {
              const u = k / 20;
              const y = lerp(0.3, 1, Math.min(1, u * 3)) * (1 - u * 0.5);
              const px = x + 8 * s + u * (nw - 16 * s), py = ny + 50 * s - y * 28 * s;
              if (k) g.lineTo(px, py);
              else g.moveTo(px, py);
            }
            g.stroke();
          } else {
            const ls: [string, boolean][] = [['핵', cur.core], ['불꽃', cur.flame], ['연기', cur.smoke], ['불티', cur.sparks], ['바닥', cur.ground]];
            ls.forEach(([n, on], j) => {
              const cx = x + 7 * s + (j % 3) * 30 * s, cy = ny + 22 * s + Math.floor(j / 3) * 17 * s;
              g.fillStyle = on ? col(cur.hue, 45) : 'rgba(255,255,255,0.08)';
              g.beginPath();
              g.roundRect(cx, cy, 27 * s, 13 * s, 6 * s);
              g.fill();
              g.fillStyle = on ? '#fff' : 'rgba(255,255,255,0.35)';
              g.font = `700 ${8.5 * s}px ${FONT}`;
              g.textAlign = 'center';
              g.fillText(n, cx + 13.5 * s, cy + 7 * s);
              g.textAlign = 'left';
            });
          }
        });
        // JSON
        const lines = json().split('\n');
        g.font = `500 ${10.5 * s}px ${MONO}`;
        let y = 112 * s;
        g.fillStyle = 'rgba(255,255,255,0.05)';
        g.fillRect(10 * s, y - 10 * s, W - 20 * s, H - y);
        for (const ln of lines) {
          if (y > H - 8 * s) break;
          const m = /^(\s*)"([^"]+)":\s?(.*)$/.exec(ln);
          let x = 16 * s;
          if (m) {
            const ind = m[1]!.length * 10 * s;
            x += ind;
            g.fillStyle = '#9ad0ff';
            const key = `"${m[2]}": `;
            g.fillText(key, x, y);
            x += g.measureText(key).width;
            const val = m[3]!;
            g.fillStyle = /true|false/.test(val) ? '#ff9ad0' : /^"/.test(val) ? '#b8ff9a' : /^[{[]/.test(val) ? '#d8d4ff' : '#ffd48a';
            g.fillText(val, x, y);
          } else {
            g.fillStyle = '#d8d4ff';
            g.fillText(ln, x, y);
          }
          y += 14.5 * s;
        }
        ptex.needsUpdate = true;
      };
      const fAcc = { acc: 0 }, sAcc = { acc: 0 }, kAcc = { acc: 0 };
      const E: V3 = [0, 1.05, 0];
      let clock = 0;
      const setPreset = (i: number): void => {
        pi = i;
        presetName = PRESETS[i]!.name;
        lastSwitch = clock;
        dirty = true;
      };
      return base3d(A, (t, dt) => {
        clock = t;
        if (auto) {
          if (t - lastSwitch > 3.6) setPreset((pi + 1) % PRESETS.length);
          const tg = PRESETS[pi]!.fx;
          const k = 1 - Math.exp(-dt * 4);
          for (const key of ['rate', 'speed', 'size', 'life', 'hue', 'gravity', 'spread'] as const) {
            const a = cur[key];
            let b = tg[key];
            if (key === 'hue' && Math.abs(b - a) > 0.5) b += b < a ? 1 : -1;
            cur[key] = key === 'hue' ? (((lerp(a, b, k)) % 1) + 1) % 1 : lerp(a, b, k);
          }
          for (const key of ['core', 'flame', 'smoke', 'sparks', 'ground'] as const) cur[key] = tg[key];
          if (t - lastSwitch < 1.2) dirty = true;
        }
        const hot = HSL(cur.hue, 1, 0.6, 2.4);
        const mid = HSL(cur.hue, 1, 0.5, 1.4);
        const dark = HSL(cur.hue + 0.02, 1, 0.3, 0.5);
        if (cur.flame) for (let i = rate(fAcc, cur.rate, dt); i > 0; i--) {
          const d = norm3([rr(-1, 1) * cur.spread, 1, rr(-1, 1) * cur.spread]);
          const sp = cur.speed * rr(0.6, 1.2);
          const sw: V3 = cur.hue > 0.7 ? [Math.cos(t * 3) * 0.8, 0, Math.sin(t * 3) * 0.8] : [0, 0, 0];
          A.fx.emit({ p: add3(E, sc3(randDir(), 0.12)), v: add3(sc3(d, sp), sw), life: cur.life * rr(0.7, 1.2), size: cur.size * 0.5, size2: cur.size * 1.1, c: hot, c2: dark, a: 0.5 / Math.max(1, cur.size * 1.3), grav: cur.gravity, drag: 0.8 });
        }
        if (cur.smoke) for (let i = rate(sAcc, cur.rate * 0.2, dt); i > 0; i--) {
          smoke.emit({ p: add3(E, [rr(-0.2, 0.2), 0.5, rr(-0.2, 0.2)]), v: [rr(-0.2, 0.2), cur.speed * 0.6, rr(-0.2, 0.2)], life: cur.life * 2.2, size: cur.size * 0.8, size2: cur.size * 2.4, c: sc3(HSL(cur.hue, 0.4, 0.12), 1), a: 0.45, fadeIn: 0.3, spin: rr(-0.6, 0.6) });
        }
        if (cur.sparks) for (let i = rate(kAcc, cur.rate * 0.35, dt); i > 0; i--) {
          const d = norm3([rr(-1, 1) * (cur.spread + 0.4), 1, rr(-1, 1) * (cur.spread + 0.4)]);
          A.st.spark({ p: E, v: sc3(d, cur.speed * rr(1.6, 2.6)), life: cur.life * rr(0.6, 1.1), c: C(0xffffff, 2.5), c2: mid, len: 0.04, w: 0.02, grav: Math.max(cur.gravity, 0) + 3, drag: 0.6, fadeIn: 0 });
        }
        if (cur.core) orbGlow(A.fx, E, mid, 0.18 + cur.size * 0.18, 1);
        groundG.visible = cur.ground;
        groundG.material.color.setRGB(mid[0], mid[1], mid[2]);
        groundG.material.opacity = 0.6 + Math.sin(t * 9) * 0.05;
        L.color.setRGB(mid[0] / 1.4, mid[1] / 1.4, mid[2] / 1.4);
        L.intensity = cur.ground ? 22 : 8;
        if (dirty && t - lastDraw > 0.12 && PW > 0) {
          drawPanel();
          lastDraw = t;
          dirty = false;
        }
        A.fx.step(dt);
        smoke.step(dt);
        A.st.step(dt);
        A.tickCam(dt);
      }, [
        { type: 'toggle', label: '자동 프리셋 돌리기', value: auto, on: (v) => (auto = v) },
        { type: 'button', label: '다음 프리셋', on: () => { setPreset((pi + 1) % PRESETS.length); Object.assign(cur, PRESETS[pi]!.fx); } },
        { type: 'range', label: '방출량 (개/초)', min: 5, max: 150, step: 1, value: cur.rate, on: (v) => { auto = false; cur.rate = v; presetName = '내 효과'; dirty = true; } },
        { type: 'range', label: '크기', min: 0.2, max: 2, step: 0.05, value: cur.size, on: (v) => { auto = false; cur.size = v; presetName = '내 효과'; dirty = true; } },
        { type: 'range', label: '색조', min: 0, max: 1, step: 0.01, value: cur.hue, on: (v) => { auto = false; cur.hue = v; presetName = '내 효과'; dirty = true; } },
        { type: 'range', label: '중력 (− 는 위로)', min: -3, max: 4, step: 0.1, value: cur.gravity, on: (v) => { auto = false; cur.gravity = v; presetName = '내 효과'; dirty = true; } },
        { type: 'toggle', label: '연기 층', value: cur.smoke, on: (v) => { auto = false; cur.smoke = v; dirty = true; } },
        { type: 'toggle', label: '불티 층', value: cur.sparks, on: (v) => { auto = false; cur.sparks = v; dirty = true; } },
        { type: 'button', label: 'JSON 복사', on: () => { void navigator.clipboard?.writeText(json()).catch(() => undefined); } },
      ], {
        resize(w, h) {
          A.resize(w, h);
          const pw = Math.round(w * 0.4), ph = Math.round(h * 0.92);
          if (Math.abs(pw - PW) > 3 || Math.abs(ph - PH) > 3) {
            PW = pw;
            PH = ph;
            const sc = Math.max(1, 720 / Math.max(pw, 1));
            pc.width = Math.round(pw * Math.min(sc, 2));
            pc.height = Math.round(ph * Math.min(sc, 2));
            ptex.dispose();
            dirty = true;
            drawPanel();
          }
          panel.scale.set(0.4, 0.92, 1);
          panel.position.set(1 - 0.2 - 0.012, 0.5, 0);
        },
        render(r) {
          r.render(A.scene, A.cam);
          const ac = r.autoClear;
          r.autoClear = false;
          r.clearDepth();
          r.render(hud, hudCam);
          r.autoClear = ac;
        },
        dispose() {
          A.dispose();
          disposeAll(hud);
        },
      });
    },
  },
};

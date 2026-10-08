import * as THREE from 'three';
import { Lensflare, LensflareElement } from 'three/examples/jsm/objects/Lensflare.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Control, DemoMap, Scene3D } from './types';

/**
 * 견본 — 우주 표현  i522 ~ i535
 * 별 하늘 · 은하수 · 부피 성운 · 나선 은하 · 행성 대기 · 고리 행성 · 태양 · 블랙홀 · 워프 · 소행성대 · 혜성 · 오로라 · 초신성 · 시차 별층.
 *
 * 공용: 미리 구운 잡음 텍스처 — 3D(64³, R = fbm · G = 능선 fbm) · 2D(512², RGBA 네 갈래). 셰이더는 잡음을 계산하지 않고 읽기만 한다
 *  (반복문 잡음 셰이더는 윈도 D3D 컴파일이 수십 초 걸린다). 별은 실제 등급 분포 + B-V 색지수 → 온도 → 흑체 색.
 */

const TAU = Math.PI * 2;
const FONT = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const smooth = (a: number, b: number, x: number): number => {
  const k = clamp((x - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
function gauss(r: () => number): number {
  return Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(TAU * r());
}

/* ───────────── 잡음 (한 번 구워 두고 모든 견본이 같이 쓴다) ───────────── */

function permTable(seed: number): Uint8Array {
  const r = rng(seed);
  const a = new Uint8Array(256);
  for (let i = 0; i < 256; i++) a[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = a[i & 255]!;
  return p;
}
const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
function g3(h: number, x: number, y: number, z: number): number {
  switch (h % 12) {
    case 0: return x + y;
    case 1: return -x + y;
    case 2: return x - y;
    case 3: return -x - y;
    case 4: return x + z;
    case 5: return -x + z;
    case 6: return x - z;
    case 7: return -x - z;
    case 8: return y + z;
    case 9: return -y + z;
    case 10: return y - z;
    default: return -y - z;
  }
}
function g2(h: number, x: number, y: number): number {
  switch (h & 7) {
    case 0: return x + y;
    case 1: return -x + y;
    case 2: return x - y;
    case 3: return -x - y;
    case 4: return 1.41 * x;
    case 5: return -1.41 * x;
    case 6: return 1.41 * y;
    default: return -1.41 * y;
  }
}
/** 주기 per 로 이어지는 퍼린 잡음 (3D) */
function perlin3(P: Uint8Array, x: number, y: number, z: number, per: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fy = y - yi;
  const fz = z - zi;
  const X0 = ((xi % per) + per) % per;
  const Y0 = ((yi % per) + per) % per;
  const Z0 = ((zi % per) + per) % per;
  const X1 = (X0 + 1) % per;
  const Y1 = (Y0 + 1) % per;
  const Z1 = (Z0 + 1) % per;
  const h = (X: number, Y: number, Z: number): number => P[P[P[X]! + Y]! + Z]!;
  const u = fade(fx);
  const v = fade(fy);
  const w = fade(fz);
  const n000 = g3(h(X0, Y0, Z0), fx, fy, fz);
  const n100 = g3(h(X1, Y0, Z0), fx - 1, fy, fz);
  const n010 = g3(h(X0, Y1, Z0), fx, fy - 1, fz);
  const n110 = g3(h(X1, Y1, Z0), fx - 1, fy - 1, fz);
  const n001 = g3(h(X0, Y0, Z1), fx, fy, fz - 1);
  const n101 = g3(h(X1, Y0, Z1), fx - 1, fy, fz - 1);
  const n011 = g3(h(X0, Y1, Z1), fx, fy - 1, fz - 1);
  const n111 = g3(h(X1, Y1, Z1), fx - 1, fy - 1, fz - 1);
  return lerp(lerp(lerp(n000, n100, u), lerp(n010, n110, u), v), lerp(lerp(n001, n101, u), lerp(n011, n111, u), v), w);
}
function perlin2(P: Uint8Array, x: number, y: number, per: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const X0 = ((xi % per) + per) % per;
  const Y0 = ((yi % per) + per) % per;
  const X1 = (X0 + 1) % per;
  const Y1 = (Y0 + 1) % per;
  const u = fade(fx);
  const v = fade(fy);
  const a = g2(P[P[X0]! + Y0]!, fx, fy);
  const b = g2(P[P[X1]! + Y0]!, fx - 1, fy);
  const c = g2(P[P[X0]! + Y1]!, fx, fy - 1);
  const d = g2(P[P[X1]! + Y1]!, fx - 1, fy - 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
function normTo8(src: Float32Array, dst: Uint8Array, stride: number, off: number, lo = 0.005, hi = 0.995): void {
  // 위아래 끝 0.5% 를 잘라 0~255 로 펼친다 (대비가 고르게)
  const sorted = Float32Array.from(src).sort();
  const a = sorted[Math.floor(sorted.length * lo)]!;
  const b = sorted[Math.floor(sorted.length * hi)]!;
  const k = 255 / Math.max(1e-6, b - a);
  for (let i = 0; i < src.length; i++) dst[i * stride + off] = clamp((src[i]! - a) * k, 0, 255);
}

let N3: THREE.Data3DTexture | null = null;
/** 3D 잡음 64³ — R: fbm 4옥타브, G: 능선(1-|n|)² fbm. 모든 축으로 이어진다 */
function noise3D(): THREE.Data3DTexture {
  if (N3) return N3;
  const S = 64;
  const P = permTable(17);
  const fr = new Float32Array(S * S * S);
  const fg = new Float32Array(S * S * S);
  let i = 0;
  for (let z = 0; z < S; z++)
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        let f = 0;
        let g = 0;
        let a = 1;
        for (let o = 0; o < 4; o++) {
          const per = 4 << o;
          const n = perlin3(P, (x / S) * per, (y / S) * per, (z / S) * per, per);
          f += a * n;
          const q = 1 - Math.abs(n * 1.4);
          g += a * q * q;
          a *= 0.5;
        }
        fr[i] = f;
        fg[i] = g;
        i++;
      }
  const data = new Uint8Array(S * S * S * 2);
  normTo8(fr, data, 2, 0);
  normTo8(fg, data, 2, 1);
  const t = new THREE.Data3DTexture(data, S, S, S);
  t.format = THREE.RGFormat;
  t.type = THREE.UnsignedByteType;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  N3 = t;
  return t;
}

let N2: THREE.DataTexture | null = null;
/** 2D 잡음 512² — R: fbm(굵게) · G: fbm(다른 씨, 중간) · B: 능선 fbm · A: fbm(곱게). 가로 · 세로로 이어진다 */
function noise2D(): THREE.DataTexture {
  if (N2) return N2;
  const S = 512;
  const P1 = permTable(5);
  const P2 = permTable(29);
  const P3 = permTable(71);
  const c0 = new Float32Array(S * S);
  const c1 = new Float32Array(S * S);
  const c2 = new Float32Array(S * S);
  const c3 = new Float32Array(S * S);
  let i = 0;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      let f = 0;
      let rg = 0;
      let a = 1;
      for (let o = 0; o < 6; o++) {
        const per = 4 << o;
        const n = perlin2(P1, u * per, v * per, per);
        f += a * n;
        const q = 1 - Math.abs(n * 1.4);
        rg += a * q * q;
        a *= 0.5;
      }
      let f2 = 0;
      a = 1;
      for (let o = 0; o < 5; o++) {
        const per = 8 << o;
        f2 += a * perlin2(P2, u * per, v * per, per);
        a *= 0.5;
      }
      let f3 = 0;
      a = 1;
      for (let o = 0; o < 4; o++) {
        const per = 32 << o;
        f3 += a * perlin2(P3, u * per, v * per, per);
        a *= 0.5;
      }
      c0[i] = f;
      c1[i] = f2;
      c2[i] = rg;
      c3[i] = f3;
      i++;
    }
  const data = new Uint8Array(S * S * 4);
  normTo8(c0, data, 4, 0);
  normTo8(c1, data, 4, 1);
  normTo8(c2, data, 4, 2);
  normTo8(c3, data, 4, 3);
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  N2 = t;
  return t;
}

/* ───────────── 캔버스 그림 ───────────── */

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
/** 빛무리 (가운데 1 → 바깥 0, 부드럽게 떨어짐) */
function glowCanvas(): HTMLCanvasElement {
  return cachedCanvas('glow', 256, 256, (g, s) => {
    const img = g.createImageData(s, s);
    for (let y = 0; y < s; y++)
      for (let x = 0; x < s; x++) {
        const dx = (x + 0.5) / s * 2 - 1;
        const dy = (y + 0.5) / s * 2 - 1;
        const r = Math.sqrt(dx * dx + dy * dy);
        const v = r >= 1 ? 0 : (Math.exp(-r * r * 22) * 0.7 + Math.exp(-r * 5.5) * 0.3) * (1 - r * r);
        const k = (y * s + x) * 4;
        img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
        img.data[k + 3] = clamp(v * 255, 0, 255);
      }
    g.putImageData(img, 0, 0);
  });
}
/** 별 빛살 (십자 + 빛무리) */
function spikeCanvas(): HTMLCanvasElement {
  return cachedCanvas('spike', 256, 256, (g, s) => {
    const img = g.createImageData(s, s);
    for (let y = 0; y < s; y++)
      for (let x = 0; x < s; x++) {
        const dx = (x + 0.5) / s * 2 - 1;
        const dy = (y + 0.5) / s * 2 - 1;
        const r = Math.sqrt(dx * dx + dy * dy);
        let v = Math.exp(-r * r * 60) + Math.exp(-r * 9) * 0.25;
        v += Math.exp(-Math.abs(dx) * 90) * Math.exp(-Math.abs(dy) * 3.2) * 0.8;
        v += Math.exp(-Math.abs(dy) * 90) * Math.exp(-Math.abs(dx) * 3.2) * 0.8;
        v *= clamp(1 - r, 0, 1);
        const k = (y * s + x) * 4;
        img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
        img.data[k + 3] = clamp(v * 255, 0, 255);
      }
    g.putImageData(img, 0, 0);
  });
}
/** 렌즈 플레어 육각 고리 */
function hexCanvas(): HTMLCanvasElement {
  return cachedCanvas('hex', 128, 128, (g, s) => {
    g.translate(s / 2, s / 2);
    const poly = (r: number): void => {
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + Math.PI / 6;
        if (i) g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        else g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
    };
    poly(s * 0.46);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.stroke();
  });
}
function texOf(c: HTMLCanvasElement, srgb = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ───────────── 별 색 (B-V → 온도 → 흑체 색) ───────────── */

function kelvinRgb(K: number): [number, number, number] {
  const t = K / 100;
  let r: number;
  let g: number;
  let b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  r = clamp(r, 0, 255) / 255;
  g = clamp(g, 0, 255) / 255;
  b = clamp(b, 0, 255) / 255;
  const m = Math.max(r, g, b);
  return [r / m, g / m, b / m];
}
/** Ballesteros 공식: B-V 색지수 → 표면 온도 */
function bvRgb(bv: number): [number, number, number] {
  const T = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
  return kelvinRgb(T);
}
/** 실제 별의 B-V 분포를 흉내 (뜨거운 파랑 조금 · 노랑 · 주황 많이 · 빨강 조금) */
function sampleBV(r: () => number): number {
  const u = r();
  if (u < 0.13) return -0.3 + r() * 0.35;
  if (u < 0.32) return 0.05 + r() * 0.3;
  if (u < 0.62) return 0.35 + r() * 0.45;
  if (u < 0.9) return 0.8 + r() * 0.6;
  return 1.4 + r() * 0.5;
}

/* ───────────── 별 하늘 (모든 견본의 배경) ───────────── */

interface StarOpts {
  magMax?: number;
  /** 은하면에 몰린 별의 비율 */
  band?: number;
  bandW?: number;
  /** 은하 좌표 → 세계 좌표 (회전만) */
  frame?: THREE.Matrix4;
  upOnly?: boolean;
  gain?: number;
  tw?: number;
}
interface Stars {
  pts: THREE.Points;
  U: { uTime: { value: number }; uScale: { value: number }; uLimit: { value: number }; uTw: { value: number }; uColK: { value: number }; uGain: { value: number } };
  dispose(): void;
}
const STAR_VS = /* glsl */ `
attribute float aMag;
attribute vec3 aCol;
attribute float aPh;
uniform float uTime, uScale, uLimit, uTw, uColK, uGain;
varying vec3 vCol;
varying float vB, vSp, vS;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float flux = pow(10.0, -0.4 * (aMag - 1.0));
  float vis = smoothstep(uLimit + 0.4, uLimit - 0.4, aMag);
  float tw = 1.0 + uTw * (0.3 * sin(uTime * (5.0 + aPh * 11.0) + aPh * 61.0) + 0.24 * sin(uTime * (13.0 + aPh * 7.0) + aPh * 23.0));
  vSp = smoothstep(1.4, -0.6, aMag);
  vB = clamp(pow(flux, 0.36) * 1.5, 0.0, 2.6) * vis * tw * uGain;
  vCol = mix(vec3(1.0), aCol, uColK);
  float s = 2.2 + 4.2 * sqrt(min(flux, 6.0));
  s *= (1.0 + 2.4 * vSp) * max(uScale, 0.75);
  // 아주 작게 그려지는 별은 크기 대신 밝기로
  if (s < 1.6) { vB *= s / 1.6; s = 1.6; }
  gl_PointSize = s;
  vS = s;
  if (vB < 0.003) gl_PointSize = 0.0;
}`;
const STAR_FS = /* glsl */ `
varying vec3 vCol;
varying float vB, vSp, vS;
void main(){
  vec2 d = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(d, d);
  if (r2 > 1.0) discard;
  // 작은 점은 픽셀 몇 개뿐이라 납작하게, 큰 별만 가운데를 뾰족하게
  float core = exp(-r2 * mix(clamp(vS * 0.8, 1.2, 7.0), 34.0, vSp));
  float halo = exp(-r2 * mix(3.0, 8.0, vSp)) * mix(0.1, 0.2, vSp);
  float sp = vSp * (exp(-abs(d.x) * 55.0) * exp(-abs(d.y) * 3.0) + exp(-abs(d.y) * 55.0) * exp(-abs(d.x) * 3.0)) * 0.75;
  vec3 c = (vCol * (halo + sp) + mix(vCol, vec3(1.0), 0.3) * core) * vB * (1.0 - r2);
  gl_FragColor = vec4(c, 1.0);
}`;
function makeStars(n: number, radius: number, seed: number, o: StarOpts = {}): Stars {
  const r = rng(seed);
  const pos = new Float32Array(n * 3);
  const mag = new Float32Array(n);
  const col = new Float32Array(n * 3);
  const ph = new Float32Array(n);
  const mMin = -1.4;
  const mMax = o.magMax ?? 7;
  const A = Math.pow(10, 0.36 * mMin);
  const B = Math.pow(10, 0.36 * mMax);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    if (o.band && r() < o.band) {
      const lon = r() * TAU;
      const lat = gauss(r) * (o.bandW ?? 0.15) * (1 + 0.8 * Math.exp(-Math.pow(((lon + Math.PI) % TAU) - Math.PI, 2) * 2));
      v.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
    } else {
      const u = r() * 2 - 1;
      const a = r() * TAU;
      const s = Math.sqrt(1 - u * u);
      v.set(s * Math.cos(a), u, s * Math.sin(a));
    }
    if (o.frame) v.applyMatrix4(o.frame);
    if (o.upOnly && v.y < 0.01) v.y = Math.abs(v.y) + 0.01;
    v.normalize().multiplyScalar(radius);
    pos[i * 3] = v.x;
    pos[i * 3 + 1] = v.y;
    pos[i * 3 + 2] = v.z;
    mag[i] = Math.log10(A + r() * (B - A)) / 0.36;
    const c = bvRgb(sampleBV(r));
    col[i * 3] = c[0];
    col[i * 3 + 1] = c[1];
    col[i * 3 + 2] = c[2];
    ph[i] = r();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aMag', new THREE.BufferAttribute(mag, 1));
  geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
  const U = { uTime: { value: 0 }, uScale: { value: 1 }, uLimit: { value: mMax }, uTw: { value: o.tw ?? 0.6 }, uColK: { value: 1 }, uGain: { value: o.gain ?? 1 } };
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: STAR_VS, fragmentShader: STAR_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return { pts, U, dispose: () => (geo.dispose(), mat.dispose()) };
}

/** 빛 스프라이트 (더하기) — color 는 HDR(1 넘어도 됨) */
function glowSprite(tex: THREE.Texture, color: THREE.ColorRepresentation, k: number, size: number): THREE.Sprite {
  const m = new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(color).multiplyScalar(k), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(m);
  s.scale.setScalar(size);
  return s;
}

/** 견본 하나가 만든 것을 모아 한 번에 정리 */
class Bin {
  private list: { dispose(): void }[] = [];
  add<T extends { dispose(): void }>(x: T): T {
    this.list.push(x);
    return x;
  }
  /** 장면 안 메시 · 재질을 모두 */
  scene(s: THREE.Object3D): void {
    s.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) this.list.push(m.geometry);
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => this.list.push(x));
      else if (mat) this.list.push(mat);
    });
  }
  dispose(): void {
    const seen = new Set<unknown>();
    for (const x of this.list) {
      if (seen.has(x)) continue;
      seen.add(x);
      x.dispose();
    }
    this.list = [];
  }
}

/** HDR 로 더한 뒤 한 번에 톤 매핑 — 입자가 수만 개 겹쳐도 하얗게 잘리지 않고 밝은 핵이 부드럽게 */
class HdrPass {
  private rt: THREE.WebGLRenderTarget | null = null;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly U = { uTex: { value: null as THREE.Texture | null }, uExp: { value: 1 } };
  private mat = new THREE.ShaderMaterial({
    uniforms: this.U,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D uTex; uniform float uExp; varying vec2 vUv;
      void main(){
        vec3 c = texture(uTex, vUv).rgb * uExp;
        // 밝기(휘도)만 눌러 색은 지킨다 — 핵이 하얗게 날아가지 않고 노란빛 그대로 밝아진다
        float L = dot(c, vec3(0.2126, 0.7152, 0.0722));
        float Lt = L * (1.0 + L / 9.0) / (1.0 + L);
        c *= Lt / max(L, 1e-5);
        float m = max(max(c.r, c.g), c.b);
        if (m > 1.0) c /= m;
        gl_FragColor = vec4(pow(c, vec3(1.0 / 2.0)), 1.0);
      }`,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
  private cc = new THREE.Color();
  constructor() {
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }
  render(r: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.Camera, w: number, h: number): void {
    if (!this.rt || this.rt.width !== w || this.rt.height !== h) {
      this.rt?.dispose();
      this.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: true });
    }
    const tm = r.toneMapping;
    r.getClearColor(this.cc);
    const ca = r.getClearAlpha();
    r.toneMapping = THREE.NoToneMapping;
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 1);
    r.clear();
    r.render(scene, cam);
    r.setRenderTarget(null);
    this.U.uTex.value = this.rt.texture;
    r.render(this.scene, this.cam);
    r.toneMapping = tm;
    r.setClearColor(this.cc, ca);
  }
  dispose(): void {
    this.rt?.dispose();
    this.mat.dispose();
    this.quad.geometry.dispose();
  }
}

const range = (label: string, min: number, max: number, step: number, value: number, on: (v: number) => void): Control => ({ type: 'range', label, min, max, step, value, on });
const tog = (label: string, value: boolean, on: (v: boolean) => void): Control => ({ type: 'toggle', label, value, on });

const TONE_END = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;
const N3_DECL = 'uniform highp sampler3D uN3;';

/* ═════════════ i523 은하수 ═════════════ */

/** 은하 좌표(x = 은하 중심, y = 은하 북극) → 세계 좌표 */
function galFrame(centerAlt: number, centerAz: number, tilt: number): THREE.Matrix4 {
  const C = new THREE.Vector3(Math.sin(centerAz) * Math.cos(centerAlt), Math.sin(centerAlt), -Math.cos(centerAz) * Math.cos(centerAlt));
  const H = new THREE.Vector3(Math.cos(centerAz), 0, Math.sin(centerAz));
  const Vt = new THREE.Vector3().crossVectors(H, C).normalize();
  if (Vt.y < 0) Vt.negate();
  const T = H.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(Vt, Math.sin(tilt)).normalize();
  const N = new THREE.Vector3().crossVectors(T, C).normalize();
  return new THREE.Matrix4().makeBasis(C, N, T);
}

const MW_FS = /* glsl */ `
uniform sampler2D uN2;
uniform mat3 uGal;
uniform float uDust, uGlow, uAir;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  vec3 g = uGal * d;
  float b = asin(clamp(g.y, -1.0, 1.0));
  float l = atan(g.z, g.x);
  vec2 uv = vec2(l, b) / 6.2831853;
  vec4 n1 = texture(uN2, uv * 2.0);
  vec4 n2 = texture(uN2, uv * 5.0 + 0.37);
  vec4 n3 = texture(uN2, uv * 13.0 + 0.71);
  float l2 = l * l;
  float width = 0.05 + 0.075 * exp(-l2 * 1.3);
  float bb = b + (n1.r - 0.5) * 0.05;
  float band = exp(-bb * bb / (width * width));
  float wide = exp(-bb * bb / (width * width * 7.0)) * 0.25;
  float bulge = exp(-(l2 * 4.5 + bb * bb * 45.0));
  float clouds = smoothstep(0.3, 0.85, n2.g * 0.55 + n1.r * 0.5);
  clouds *= clouds;
  float grain = 0.55 + 0.9 * n3.a * n3.a;
  float light = band * (0.08 + 1.1 * clouds) * grain + wide * (0.3 + 0.7 * n1.g) * (0.6 + 0.4 * n3.a) + bulge * 1.5 * (0.6 + 0.7 * n2.g) * grain;
  vec3 tint = mix(vec3(0.6, 0.66, 0.9), vec3(1.0, 0.78, 0.52), clamp(bulge * 1.6 + 0.15 * band, 0.0, 1.0));
  vec3 col = light * tint;
  // 먼지 줄 (큰 틈 Great Rift) — 띠 가운데를 가르는 어두운 줄, 파랑을 더 먹어 붉어진다
  float laneC = 0.008 * sin(l * 3.0) + (n1.g - 0.5) * 0.035;
  float laneW = 0.016 + 0.022 * exp(-l2 * 2.0);
  float lane = exp(-pow((b - laneC) / laneW, 2.0)) * smoothstep(2.4, 0.2, abs(l));
  float dust = lane * smoothstep(0.35, 0.65, n2.r) * 1.6 + band * smoothstep(0.55, 0.8, n3.g) * 0.9 + band * smoothstep(0.58, 0.85, n1.a) * 0.6;
  dust *= uDust;
  col *= exp(-dust * vec3(1.9, 2.4, 3.2));
  // 분홍 수소 구름 (H II)
  col += band * vec3(1.0, 0.25, 0.42) * smoothstep(0.82, 0.97, n3.r) * 0.35 * exp(-dust);
  col *= uGlow * 0.16;
  // 대기광 (지평선 가까이 초록 · 주황)
  float alt = max(d.y, 0.0);
  col += uAir * (vec3(0.03, 0.07, 0.04) * exp(-alt * 9.0) + vec3(0.06, 0.035, 0.015) * exp(-alt * 30.0));
  col += vec3(0.0015, 0.002, 0.005);
  gl_FragColor = vec4(col, 1.0);
  ${TONE_END}
}`;
const DIR_VS = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** 지평선 산 그림자 (반지름 R 의 띠) */
function mountainRing(R: number, seed: number, amp: number, color: number, a0 = 0, a1 = TAU, bottom = -R * 0.6): THREE.Mesh {
  const r = rng(seed);
  const ph = Array.from({ length: 6 }, () => r() * TAU);
  const N = 720;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const a = lerp(a0, a1, i / N);
    let e = 0.02 + 0.5 * amp * Math.abs(Math.sin(a * 1.5 + ph[0]!));
    e += amp * 0.35 * Math.sin(a * 4 + ph[1]!) + amp * 0.18 * Math.sin(a * 11 + ph[2]!) + amp * 0.08 * Math.sin(a * 27 + ph[3]!) + amp * 0.04 * Math.sin(a * 61 + ph[4]!) + amp * 0.02 * Math.sin(a * 143 + ph[5]!);
    e = Math.max(0.006, e);
    const x = Math.sin(a) * R;
    const z = -Math.cos(a) * R;
    pos.push(x, Math.tan(e) * R, z, x, bottom, z);
    if (i < N) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
}

/* ═════════════ i524 부피 성운 ═════════════ */

const NEB_VS = /* glsl */ `
varying vec3 vObj;
void main(){
  vObj = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const NEB_FS = /* glsl */ `
${N3_DECL}
uniform vec3 uCamObj, uStarPos;
uniform float uTime, uDens, uStar;
uniform int uSteps;
varying vec3 vObj;
vec2 boxHit(vec3 ro, vec3 rd){
  vec3 inv = 1.0 / rd;
  vec3 t0 = (-1.0 - ro) * inv;
  vec3 t1 = (1.0 - ro) * inv;
  vec3 a = min(t0, t1);
  vec3 b = max(t0, t1);
  return vec2(max(max(a.x, a.y), a.z), min(min(b.x, b.y), b.z));
}
void main(){
  vec3 ro = uCamObj;
  vec3 rd = normalize(vObj - uCamObj);
  vec2 h = boxHit(ro, rd);
  h.x = max(h.x, 0.0);
  if (h.y <= h.x) discard;
  float ds = 3.4 / float(uSteps);
  float jit = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float t = h.x + ds * jit;
  vec3 col = vec3(0.0);
  float T = 1.0;
  for (int i = 0; i < 48; i++) {
    if (i >= uSteps || t > h.y || T < 0.02) break;
    vec3 p = ro + rd * t;
    float r = length(p);
    if (r < 1.0) {
      vec2 a = texture(uN3, p * 0.42 + vec3(0.13, uTime * 0.003, 0.41)).rg;
      vec2 b = texture(uN3, p * 1.1 + vec3(a.r * 0.35, 0.17, uTime * 0.005)).rg;
      float rw = r + (a.g - 0.5) * 0.7;
      float shell = smoothstep(0.95, 0.45, rw) * smoothstep(0.08, 0.4, r) * smoothstep(1.0, 0.82, r);
      float d = max(a.r * 0.85 + b.g * 0.6 - 0.74, 0.0) * shell * 7.0 * uDens;
      if (d > 0.001) {
        vec3 sp = p - uStarPos;
        float rs = length(sp);
        float lightI = uStar / (0.06 + rs * rs * 5.0);
        // 별에 가까운 쪽은 산소(청록), 바깥은 수소 알파(빨강), 가는 실은 밝은 주황 테
        vec3 em = mix(vec3(0.05, 0.7, 1.0), vec3(0.9, 0.06, 0.14), smoothstep(0.2, 0.58, rs));
        em = mix(em, vec3(1.0, 0.62, 0.2), smoothstep(0.55, 0.8, a.r) * smoothstep(0.5, 0.8, rs) * 0.5);
        em += vec3(1.0, 0.5, 0.2) * pow(b.g, 5.0) * 0.8 * smoothstep(0.3, 0.6, rs);
        float dust = smoothstep(0.42, 0.72, b.r) * smoothstep(0.35, 0.8, r);
        vec3 emit = em * d * (lightI * (1.0 - dust * 0.85) + 0.04);
        col += T * emit * ds * 1.8;
        T *= exp(-d * (0.8 + dust * 9.0) * ds * 3.0);
      }
    }
    t += ds;
  }
  gl_FragColor = vec4(col, 1.0 - T);
  ${TONE_END}
}`;

/* ═════════════ i525 나선 은하 ═════════════ */

interface GalData { orbit: Float32Array; col: Float32Array; bri: Float32Array; n: number }
let GAL: { stars: GalData; dust: GalData } | null = null;
function galaxyData(): { stars: GalData; dust: GalData } {
  if (GAL) return GAL;
  const r = rng(91);
  const N = 200000;
  const orbit = new Float32Array(N * 4);
  const col = new Float32Array(N * 3);
  const bri = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const u = r();
    let a: number;
    let y: number;
    let kind = 0;
    let c: [number, number, number];
    let b: number;
    if (u < 0.07) {
      // 팽대부: 늙은 주황 별, 둥글게
      a = Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * 1.0 + 0.02;
      y = gauss(r) * 0.45 * Math.exp(-a * 0.6);
      kind = 1;
      c = bvRgb(0.9 + r() * 0.5);
      b = 0.3 + r() * 0.3;
    } else if (u < 0.2) {
      // 넓게 번지는 빛 (큰 입자 · 아주 옅게) — 팔이 매끈한 빛 띠로 보이게
      do a = -2.0 * Math.log(Math.max(1e-9, r() * r()));
      while (a > 11.5);
      y = gauss(r) * 0.12;
      kind = 4;
      c = bvRgb(lerp(1.1, -0.25, smooth(1.0, 5, a)));
      b = 0.05 + r() * 0.04;
    } else {
      do a = -1.9 * Math.log(Math.max(1e-9, r() * r()));
      while (a > 11.5);
      y = gauss(r) * (0.05 + 0.12 * Math.exp(-a / 2));
      const v = r();
      const young = 0.5 * smooth(1.2, 4, a);
      if (v < young) {
        c = bvRgb(-0.3 + r() * 0.3); // 젊은 파란 별 (팔에서 많다)
        b = 1.1 + r() * 1.1;
      } else if (v >= 0.6 && v < 0.614 && a > 2.2) {
        c = [1.0, 0.3, 0.55]; // 수소 구름 (분홍)
        b = 1.6 + r() * 1.6;
        kind = 2;
      } else {
        c = bvRgb(0.6 + r() * 0.7);
        b = 0.25 + r() * 0.35;
      }
    }
    orbit[i * 4] = a;
    // 수소 구름은 팔(타원이 몰리는 곳)에만 — 궤도를 돌지 않고 무늬와 함께 머문다
    orbit[i * 4 + 1] = kind === 2 ? (r() < 0.5 ? 0 : Math.PI) + gauss(r) * 0.22 : r() * TAU;
    orbit[i * 4 + 2] = y;
    orbit[i * 4 + 3] = kind;
    col[i * 3] = c[0];
    col[i * 3 + 1] = c[1];
    col[i * 3 + 2] = c[2];
    bri[i] = b;
  }
  const ND = 14000;
  const dO = new Float32Array(ND * 4);
  const dC = new Float32Array(ND * 3);
  const dB = new Float32Array(ND);
  for (let i = 0; i < ND; i++) {
    let a: number;
    do a = 0.8 + -2.0 * Math.log(Math.max(1e-9, r() * r()));
    while (a > 11);
    dO[i * 4] = a;
    dO[i * 4 + 1] = r() * TAU;
    dO[i * 4 + 2] = gauss(r) * 0.05;
    dO[i * 4 + 3] = 3;
    dC[i * 3] = 0.05;
    dC[i * 3 + 1] = 0.03;
    dC[i * 3 + 2] = 0.02;
    dB[i] = 0.5 + r() * 0.8;
  }
  GAL = { stars: { orbit, col, bri, n: N }, dust: { orbit: dO, col: dC, bri: dB, n: ND } };
  return GAL;
}
const GAL_VS = /* glsl */ `
attribute vec4 aOrbit;
attribute vec3 aCol;
attribute float aB;
uniform float uTime, uTwist, uEcc, uProj, uSpeed, uSize, uLag;
varying vec3 vCol;
varying float vB;
void main(){
  float a = aOrbit.x;
  float kind = aOrbit.w;
  float e = kind == 1.0 ? 0.0 : uEcc * (a < 2.0 ? a / 2.0 : 1.0 - 0.75 * clamp((a - 2.0) / 8.0, 0.0, 1.0));
  float th = a * uTwist + (kind == 3.0 ? uLag : 0.0);
  float v = 1.0 - exp(-a * 1.4);
  float om = v / max(a, 0.2);
  float ph = aOrbit.y + (kind == 2.0 ? 0.0 : uTime * om * uSpeed);
  vec2 el = vec2(a * cos(ph), a * (1.0 - e) * sin(ph));
  float c = cos(th), s = sin(th);
  vec3 p = vec3(el.x * c - el.y * s, aOrbit.z, el.x * s + el.y * c);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float sz = uSize * uProj / -mv.z * (kind == 2.0 ? 2.8 : kind == 3.0 ? 9.0 : kind == 4.0 ? 8.0 : kind == 1.0 ? 1.2 : 1.0);
  vB = aB * (kind == 1.0 ? 1.0 : kind == 4.0 ? smoothstep(0.2, 2.5, a) * (1.0 - 0.7 * smoothstep(5.0, 9.0, a)) : kind == 3.0 ? smoothstep(1.0, 3.2, a) : 1.0);
  if (sz < 1.5) { vB *= sz / 1.5; sz = 1.5; }
  gl_PointSize = sz;
  vCol = aCol;
}`;
const GAL_FS = /* glsl */ `
uniform float uGain;
varying vec3 vCol;
varying float vB;
void main(){
  vec2 d = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(d, d);
  if (r2 > 1.0) discard;
  float k = exp(-r2 * 4.5) * (1.0 - r2);
  gl_FragColor = vec4(pow(vCol, vec3(1.7)) * vB * k * uGain, 1.0);
}`;
const DUST_FS = /* glsl */ `
uniform float uDust;
varying vec3 vCol;
varying float vB;
void main(){
  vec2 d = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(d, d);
  if (r2 > 1.0) discard;
  float k = exp(-r2 * 3.0) * (1.0 - r2);
  gl_FragColor = vec4(vCol, k * 0.08 * vB * uDust);
}`;

/* ═════════════ i526 행성 대기 ═════════════ */

const PLANET_VS = /* glsl */ `
varying vec3 vObjN, vWN, vWP;
void main(){
  vObjN = normal;
  vWN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const EARTH_FS = /* glsl */ `
${N3_DECL}
uniform vec3 uSun, uSunObj;
uniform float uTime, uCloudRot, uCloud, uLights;
varying vec3 vObjN, vWN, vWP;
vec3 rotY(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
float clouds(vec3 n){
  vec3 q = rotY(n, uCloudRot);
  float w = texture(uN3, q * 0.3 + 0.21).r;
  float c = texture(uN3, q * 0.55 + vec3(w * 0.2, 0.13, 0.0)).r * 0.6 + texture(uN3, q * 1.7 + vec3(0.0, uTime * 0.002, w * 0.3)).g * 0.4;
  return smoothstep(0.62 - uCloud * 0.2, 0.8 - uCloud * 0.15, c);
}
void main(){
  vec3 n = normalize(vObjN);
  vec3 N = normalize(vWN);
  vec3 V = normalize(cameraPosition - vWP);
  float h = texture(uN3, n * 0.33 + 0.5).r * 0.62 + texture(uN3, n * 0.9 + 0.2).r * 0.28 + texture(uN3, n * 2.7).r * 0.1;
  float sea = 0.53;
  float land = smoothstep(sea, sea + 0.006, h);
  float lat = abs(n.y);
  float e = clamp((h - sea) / 0.2, 0.0, 1.0);
  vec3 ocean = mix(vec3(0.004, 0.022, 0.07), vec3(0.01, 0.07, 0.14), smoothstep(sea - 0.12, sea, h));
  vec3 lc = mix(vec3(0.07, 0.13, 0.04), vec3(0.24, 0.22, 0.11), smoothstep(0.05, 0.5, e));
  float desert = smoothstep(0.38, 0.12, abs(lat - 0.3)) * smoothstep(0.35, 0.65, texture(uN3, n * 0.6 + 0.7).r);
  lc = mix(lc, vec3(0.5, 0.38, 0.22), desert * 0.85);
  lc = mix(lc, vec3(0.36, 0.33, 0.3), smoothstep(0.55, 0.9, e));
  float ice = smoothstep(0.74, 0.8, lat + (h - 0.5) * 0.35);
  vec3 alb = mix(ocean, lc, land);
  alb = mix(alb, vec3(0.8, 0.85, 0.9), ice);
  float NL = dot(N, uSun);
  vec3 sunCol = mix(vec3(1.0, 0.42, 0.18), vec3(1.0, 0.97, 0.93), smoothstep(0.0, 0.35, NL));
  float cl = clouds(n);
  float cs = clouds(normalize(n + uSunObj * 0.025));
  vec3 col = alb * sunCol * max(NL, 0.0) * 2.6 * (1.0 - cs * 0.55);
  vec3 H = normalize(uSun + V);
  float spec = pow(max(dot(N, H), 0.0), 600.0) * (1.0 - land) * (1.0 - ice) * smoothstep(-0.05, 0.2, NL);
  col += sunCol * spec * 1.6 * (1.0 - cl);
  col += sunCol * pow(max(dot(N, H), 0.0), 40.0) * 0.06 * (1.0 - land) * (1.0 - cl);
  // 도시 불빛: 땅 위, 밤쪽, 덩어리 · 점 · 길 무늬
  float city = smoothstep(0.55, 0.8, texture(uN3, n * 3.2 + 0.4).r) * land * (1.0 - ice) * (1.0 - desert * 0.7);
  float dots = smoothstep(0.62, 0.78, texture(uN3, n * 31.0).r) * smoothstep(0.45, 0.7, texture(uN3, n * 13.0 + 0.3).r);
  city = city * dots * 2.6 + city * city * 0.06;
  city *= smoothstep(0.0, 0.03, h - sea);
  float night = 1.0 - smoothstep(-0.12, 0.06, NL);
  col += vec3(1.0, 0.6, 0.26) * city * uLights * 2.2 * night * (1.0 - cl * 0.8);
  // 구름
  vec3 ccol = sunCol * max(NL + 0.04, 0.0) * 2.4;
  col = mix(col, ccol, cl * 0.95);
  gl_FragColor = vec4(col, 1.0);
  ${TONE_END}
}`;
const ATMO_VS = /* glsl */ `
varying vec3 vWP;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const ATMO_FS = /* glsl */ `
uniform vec3 uSun;
uniform float uRA, uDens;
varying vec3 vWP;
vec2 sph(vec3 ro, vec3 rd, float r){
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r * r;
  float h = b * b - c;
  if (h < 0.0) return vec2(1e9, -1e9);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}
void main(){
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWP - cameraPosition);
  vec2 a = sph(ro, rd, uRA);
  vec2 p = sph(ro, rd, 1.0);
  float t0 = max(a.x, 0.0);
  float t1 = a.y;
  if (p.x > 0.0) t1 = min(t1, p.x);
  if (t1 <= t0) discard;
  float ds = (t1 - t0) / 12.0;
  vec3 betaR = vec3(0.16, 0.4, 1.0);
  float mu = dot(rd, uSun);
  float phR = 0.75 * (1.0 + mu * mu);
  float g = 0.78;
  float phM = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5) * 0.05;
  vec3 sum = vec3(0.0);
  vec3 sumM = vec3(0.0);
  float od = 0.0;
  for (int i = 0; i < 12; i++) {
    vec3 q = ro + rd * (t0 + ds * (float(i) + 0.5));
    float hh = (length(q) - 1.0) / (uRA - 1.0);
    float dn = exp(-hh * 5.0);
    od += dn * ds;
    float cs = dot(normalize(q), uSun);
    float lit = smoothstep(-0.22, 0.08, cs);
    float air = 1.0 / (max(cs, 0.0) * 0.9 + 0.1);
    vec3 Tsun = exp(-betaR * air * 0.5 * uDens - vec3(0.02) * air);
    vec3 Tview = exp(-betaR * od * 7.0 * uDens);
    sum += dn * lit * Tsun * Tview * ds;
    sumM += dn * dn * lit * Tsun * Tview * ds;
  }
  vec3 col = (sum * betaR * phR * 20.0 + sumM * phM * 34.0 * vec3(1.0, 0.85, 0.7)) * uDens;
  gl_FragColor = vec4(col, 1.0);
  ${TONE_END}
}`;

/* ═════════════ i527 고리 행성 ═════════════ */

const RING_FN = /* glsl */ `
float ringD(float r, float fw){
  float d = 0.0;
  d += smoothstep(1.24, 1.27, r) * (1.0 - smoothstep(1.50, 1.53, r)) * 0.16;
  d += smoothstep(1.52, 1.55, r) * (1.0 - smoothstep(1.92, 1.95, r)) * (0.82 + 0.14 * sin(r * 47.0));
  d += smoothstep(2.02, 2.04, r) * (1.0 - smoothstep(2.26, 2.28, r)) * 0.62;
  d *= 1.0 - 0.92 * exp(-pow((r - 2.215) / 0.006, 2.0));
  d += exp(-pow((r - 2.33) / 0.005, 2.0)) * 0.45;
  float g = sin(r * 420.0) * sin(r * 173.0 + 1.0) * 0.5 + sin(r * 97.0 + 2.0) * 0.5;
  d *= 1.0 + 0.22 * g * (1.0 - smoothstep(0.004, 0.03, fw * 120.0));
  return clamp(d, 0.0, 1.0);
}`;
const SAT_VS = /* glsl */ `
uniform float uFlat;
varying vec3 vGP, vWN, vWP;
void main(){
  vGP = position * vec3(1.0, uFlat, 1.0);
  vWN = normalize(mat3(modelMatrix) * (normal * vec3(1.0, 1.0 / uFlat, 1.0)));
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const SAT_FS = /* glsl */ `
${N3_DECL}
uniform vec3 uSun, uSunG;
uniform float uTime, uFlat, uRing;
varying vec3 vGP, vWN, vWP;
${RING_FN}
void main(){
  vec3 N = normalize(vWN);
  vec3 V = normalize(cameraPosition - vWP);
  float lat = vGP.y / uFlat;
  float turb = texture(uN3, vGP * vec3(0.7, 2.6, 0.7) + vec3(uTime * 0.004, 0.0, 0.0)).r - 0.5;
  float tb = lat + turb * 0.05 + (texture(uN3, vGP * vec3(1.6, 5.0, 1.6)).g - 0.5) * 0.015;
  float b1 = sin(tb * 34.0) * 0.5 + 0.5;
  float b2 = sin(tb * 11.0 + 1.3) * 0.5 + 0.5;
  float b3 = sin(tb * 87.0 + 0.4) * 0.5 + 0.5;
  vec3 c = mix(vec3(0.72, 0.55, 0.33), vec3(0.93, 0.8, 0.56), b2);
  c = mix(c, vec3(0.55, 0.41, 0.27), b1 * 0.38 * smoothstep(0.05, 0.6, abs(lat)));
  c *= 0.9 + 0.1 * b3;
  c = mix(c, vec3(0.5, 0.58, 0.66), smoothstep(0.72, 0.95, abs(lat)) * 0.55);
  float NL = dot(N, uSun);
  float diff = max(NL, 0.0);
  float mu = max(dot(N, V), 0.0);
  diff *= 0.75 + 0.25 * mu;
  // 고리 그림자: 해 쪽으로 쏜 빛줄이 고리 면을 지나면 그 자리 고리 밀도만큼 가린다
  float sh = 1.0;
  if (abs(uSunG.y) > 1e-4) {
    float t = -vGP.y / uSunG.y;
    if (t > 0.0) {
      vec2 q = vGP.xz + uSunG.xz * t;
      sh = 1.0 - 0.9 * ringD(length(q), 0.0) * uRing;
    }
  }
  vec3 col = c * diff * sh * 2.3;
  // 고리가 비춰 주는 빛 (밤쪽에 은은히)
  col += c * 0.035 * (1.0 - smoothstep(-0.1, 0.1, NL)) * uRing;
  gl_FragColor = vec4(col, 1.0);
  ${TONE_END}
}`;
const RING_VS = /* glsl */ `
varying vec3 vGP;
varying vec3 vWP;
void main(){
  vGP = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const RING_FS = /* glsl */ `
uniform vec3 uSunG, uCamG;
uniform float uFlat, uRing;
varying vec3 vGP;
varying vec3 vWP;
${RING_FN}
void main(){
  float r = length(vGP.xz);
  float d = ringD(r, fwidth(r)) * uRing;
  if (d < 0.002) discard;
  vec3 c = mix(vec3(0.7, 0.58, 0.42), vec3(0.92, 0.82, 0.64), smoothstep(1.5, 2.0, r));
  c = mix(c, vec3(0.55, 0.48, 0.4), smoothstep(1.5, 1.3, r));
  // 보는 쪽이 해를 받는 면인가
  bool same = (uCamG.y - vGP.y) * uSunG.y > 0.0;
  float lit = same ? (0.35 + 0.9 * abs(uSunG.y)) : 0.45 * (1.0 - d * 0.7) * (0.4 + abs(uSunG.y));
  // 행성 그림자: 고리 점에서 해 쪽으로 쏜 빛줄이 (납작한) 행성에 닿는가
  vec3 ro = vGP * vec3(1.0, 1.0 / uFlat, 1.0);
  vec3 rd = normalize(uSunG * vec3(1.0, 1.0 / uFlat, 1.0));
  float b = dot(ro, rd);
  float cc = dot(ro, ro) - 1.0;
  float hh = b * b - cc;
  float shadow = 1.0;
  if (hh > 0.0 && -b - sqrt(hh) > 0.0) shadow = 0.04;
  gl_FragColor = vec4(c * lit * shadow * 1.7 * d, d * 0.96);
  ${TONE_END}
}`;

/* ═════════════ i528 태양 ═════════════ */

const SUN_VS = /* glsl */ `
varying vec3 vN, vWN, vWP;
void main(){
  vN = normal;
  vWN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const SUN_FS = /* glsl */ `
${N3_DECL}
uniform float uTime, uSpots;
varying vec3 vN, vWN, vWP;
void main(){
  vec3 n = normalize(vN);
  float mu = max(dot(normalize(vWN), normalize(cameraPosition - vWP)), 0.0);
  float tt = uTime;
  vec3 w = vec3(texture(uN3, n * 0.9 + vec3(tt * 0.004)).r, texture(uN3, n * 0.9 + vec3(0.5, tt * 0.003, 0.2)).r, 0.0) - 0.5;
  float gA = texture(uN3, n * 10.0 + vec3(w.xy * 0.18, tt * 0.006)).g;
  float gB = texture(uN3, n * 23.0 + vec3(tt * 0.01, w.x * 0.2, 0.3)).g;
  float sup = texture(uN3, n * 0.8 + vec3(0.3, 0.1, tt * 0.002)).r;
  // 쌀알 무늬: 능선 잡음의 골(밝은 칸)과 줄(어두운 틈)
  float I = 1.0 + 0.3 * (sup - 0.5) - 0.42 * gA * gA - 0.18 * gB * gB;
  // 흑점 (중위도에 띠로)
  float s = texture(uN3, n * 0.62 + vec3(0.31, 0.11, 0.73)).r + (gA - 0.5) * 0.03;
  float belt = smoothstep(0.06, 0.18, abs(n.y)) * smoothstep(0.6, 0.38, abs(n.y));
  float pen = smoothstep(0.74, 0.765, s) * belt * uSpots;
  float umb = smoothstep(0.78, 0.79, s) * belt * uSpots;
  I *= 1.0 - pen * 0.5 - umb * 0.42;
  // 백반 (흑점 둘레, 가장자리에서 밝다)
  I += smoothstep(0.6, 0.7, s) * (1.0 - pen) * belt * pow(1.0 - mu, 1.5) * 0.7 * uSpots;
  // 주연 감광
  float ld = 1.0 - 0.6 * (1.0 - mu) - 0.22 * (1.0 - mu) * (1.0 - mu);
  float L = I * ld;
  vec3 col = mix(vec3(0.85, 0.14, 0.0), vec3(1.0, 0.45, 0.06), smoothstep(0.05, 0.55, L));
  col = mix(col, vec3(1.0, 0.78, 0.4), smoothstep(0.65, 1.1, L));
  col *= L * 1.7;
  gl_FragColor = vec4(col, 1.0);
  ${TONE_END}
}`;
const CORONA_VS = /* glsl */ `
varying vec2 vP;
void main(){
  vP = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const CORONA_FS = /* glsl */ `
uniform sampler2D uN2;
uniform float uTime, uCor, uProm;
varying vec2 vP;
// 홍염: 가장자리에 발을 둔 반타원 고리 — 고리까지의 거리로 빛, 잡음으로 실 · 흐름
float prom(vec2 p, float a0, float w, float hgt, float seed){
  float r = length(p);
  float da = mod(atan(p.y, p.x) - a0 + 3.14159265, 6.2831853) - 3.14159265;
  vec2 q = vec2(da * r / w, (r - 0.99) / hgt);
  if (q.y < -0.05 || abs(q.x) > 1.6) return 0.0;
  float n = texture(uN2, vec2(da * 2.0 + seed, (r - 1.0) * 1.5 - uTime * 0.02)).r;
  float n2 = texture(uN2, vec2(da * 7.0 - seed, (r - 1.0) * 4.0 + uTime * 0.04)).b;
  float n3 = texture(uN2, vec2(da * 19.0 + seed, (r - 1.0) * 9.0 - uTime * 0.06)).a;
  float d = abs(length(q + vec2((n - 0.5) * 0.25, 0.0)) - 1.0);
  float th = 0.1 + 0.16 * n;
  float loop = exp(-d * d / (th * th)) * (0.35 + 1.4 * n2 * n2) * (0.6 + 0.6 * n3);
  float fill = exp(-dot(q, q) * 1.5) * 0.35 * n2 * n3;
  return (loop + fill) * smoothstep(-0.05, 0.12, q.y);
}
void main(){
  float r = length(vP);
  if (r < 0.97) discard;
  float a = atan(vP.y, vP.x) / 6.2831853;
  float s1 = texture(uN2, vec2(a * 3.0, r * 0.05 - uTime * 0.004)).r;
  float s2 = texture(uN2, vec2(a * 11.0, r * 0.12 - uTime * 0.009)).g;
  float s3 = texture(uN2, vec2(a * 29.0, r * 0.3 - uTime * 0.02)).b;
  float streak = 0.25 + 1.3 * s1 * s1 * s1 + 0.45 * s2 * s2 + 0.2 * s3;
  float x = max(r - 1.0, 0.0);
  float glow = exp(-x * 12.0) * 0.35 + pow(r, -8.0) * 0.3 * streak + exp(-x * 1.8) * 0.008 * streak;
  vec3 col = vec3(1.0, 0.7, 0.42) * glow * uCor;
  col += vec3(1.0, 0.18, 0.05) * exp(-x * 70.0) * 1.6;  // 채층 (붉은 테)
  col *= smoothstep(3.5, 2.0, r);
  float P = prom(vP, 2.35, 0.2, 0.42, 0.1) + prom(vP, -0.55, 0.13, 0.26, 0.6) * 0.8 + prom(vP, 3.95, 0.09, 0.17, 0.33) * 0.9;
  col += vec3(1.0, 0.2, 0.07) * P * uProm * 1.3;
  col *= smoothstep(0.97, 1.0, r);
  gl_FragColor = vec4(col, 1.0);
  ${TONE_END}
}`;
/* ═════════════ i529 블랙홀 ═════════════ */

/** 블랙홀 뒤 하늘 (등거리 원통 지도) — 별 + 은하수 띠 + 성운 */
function bhSkyCanvas(): HTMLCanvasElement {
  return cachedCanvas('bhsky', 2048, 1024, (g, W, H) => {
    const r = rng(404);
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    const bandY = (x: number): number => H / 2 + Math.sin((x / W) * TAU + 0.8) * H * 0.22;
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 1600; i++) {
      const x = r() * W;
      const y = bandY(x) + gauss(r) * H * 0.045;
      const rr = 10 + r() * 60;
      const core = Math.exp(-Math.pow(((x / W + 0.25) % 1) - 0.5, 2) * 30);
      const gr = g.createRadialGradient(x, y, 0, x, y, rr);
      const cw = core > 0.4 ? '255,205,150' : r() < 0.5 ? '150,165,215' : '200,190,210';
      gr.addColorStop(0, `rgba(${cw},${0.035 + 0.05 * core})`);
      gr.addColorStop(1, `rgba(${cw},0)`);
      g.fillStyle = gr;
      for (const dx of [-W, 0, W]) g.fillRect(x + dx - rr, y - rr, rr * 2, rr * 2);
    }
    // 분홍 · 청록 성운 몇 군데
    for (let i = 0; i < 7; i++) {
      const x = r() * W;
      const y = bandY(x) + gauss(r) * H * 0.08;
      const c = i % 2 ? '255,90,130' : '80,200,220';
      for (let k = 0; k < 30; k++) {
        const px = x + gauss(r) * 40;
        const py = y + gauss(r) * 25;
        const rr = 8 + r() * 30;
        const gr = g.createRadialGradient(px, py, 0, px, py, rr);
        gr.addColorStop(0, `rgba(${c},0.06)`);
        gr.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = gr;
        g.fillRect(px - rr, py - rr, rr * 2, rr * 2);
      }
    }
    // 먼지 (띠를 가르는 어두운 줄)
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 900; i++) {
      const x = r() * W;
      const y = bandY(x) + gauss(r) * H * 0.012;
      const rr = 6 + r() * 22;
      const gr = g.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, 'rgba(0,0,0,0.22)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    // 별
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 14000; i++) {
      const x = r() * W;
      const inBand = r() < 0.45;
      const y = inBand ? bandY(x) + gauss(r) * H * 0.06 : r() * H;
      const m = Math.pow(r(), 3.2);
      const c = bvRgb(sampleBV(r));
      const a = 0.18 + m * 0.82;
      g.fillStyle = `rgba(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0},${a})`;
      const s = m > 0.6 ? 2 : 1;
      g.fillRect(x, y, s, s);
      if (m > 0.75) {
        const gr = g.createRadialGradient(x + 1, y + 1, 0, x + 1, y + 1, 7);
        gr.addColorStop(0, `rgba(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0},0.35)`);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(x - 7, y - 7, 16, 16);
      }
    }
    g.globalCompositeOperation = 'source-over';
  });
}
const BH_VS = /* glsl */ `
varying vec3 vWP;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const BH_FS = /* glsl */ `
uniform sampler2D uSky, uN2;
uniform float uTime, uLens, uDopp, uDisk;
varying vec3 vWP;
vec3 sky(vec3 d){
  vec2 uv = vec2(atan(d.z, d.x) / 6.2831853 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.14159265 + 0.5);
  return texture(uSky, uv).rgb;
}
vec3 diskCol(float T){
  vec3 c = mix(vec3(1.0, 0.22, 0.03), vec3(1.0, 0.62, 0.3), smoothstep(0.25, 0.75, T));
  c = mix(c, vec3(1.0, 0.9, 0.78), smoothstep(0.75, 1.15, T));
  return mix(c, vec3(0.72, 0.82, 1.0), smoothstep(1.15, 1.8, T));
}
void main(){
  vec3 p = cameraPosition;
  vec3 v = normalize(vWP - cameraPosition);
  vec3 cr = cross(p, v);
  float h2 = dot(cr, cr);
  vec3 col = vec3(0.0);
  float T = 1.0;
  for (int i = 0; i < 96; i++) {
    float r2 = dot(p, p);
    float r = sqrt(r2);
    float dt = clamp(0.07 * r, 0.025, 1.6);
    vec3 acc = -1.5 * h2 * p / (r2 * r2 * r) * uLens;
    v += acc * dt;
    vec3 pn = p + v * dt;
    if (p.y * pn.y < 0.0) {
      vec3 q = mix(p, pn, p.y / (p.y - pn.y));
      float rq = length(q.xz);
      if (rq > 2.4 && rq < 15.0) {
        float ang = atan(q.z, q.x) / 6.2831853;
        float om = 0.5 / pow(rq, 1.5);
        float n1 = texture(uN2, vec2(ang * 2.0 - uTime * om * 0.9, rq * 0.11)).r;
        float n2 = texture(uN2, vec2(ang * 5.0 - uTime * om * 1.3, rq * 0.42)).b;
        float rings = 0.6 + 0.4 * sin(rq * 9.0 + n1 * 6.0);
        float dens = smoothstep(2.4, 3.3, rq) * smoothstep(15.0, 6.5, rq) * clamp(0.25 + 0.9 * n1 * rings + 0.5 * n2 * n2, 0.0, 1.3);
        float temp = pow(3.0 / rq, 0.75) * 1.05;
        vec3 vel = vec3(-q.z, 0.0, q.x) / rq * sqrt(0.5 / max(rq - 1.0, 0.5));
        float bta = length(vel);
        float gam = 1.0 / sqrt(1.0 - bta * bta);
        float gd = 1.0 / (gam * (1.0 - dot(vel, -normalize(v))));
        float gg = sqrt(max(1.0 - 1.0 / rq, 0.05));
        float g = mix(1.0, gd * gg, uDopp);
        vec3 ec = diskCol(temp * g) * pow(g, 3.0) * dens * temp * temp * 4.2 * uDisk;
        float a = clamp(dens * 0.92, 0.0, 1.0);
        col += T * ec * a;
        T *= 1.0 - a;
      }
    }
    p = pn;
    float rn = length(p);
    if (rn < 1.0) { T = 0.0; break; }
    if (rn > 46.0 && dot(p, v) > 0.0) break;
    if (T < 0.01) break;
  }
  col += T * sky(normalize(v)) * 0.9;
  gl_FragColor = vec4(col, 1.0);
  ${TONE_END}
}`;

/* ═════════════ i530 워프 ═════════════ */

const WARP_VS = /* glsl */ `
attribute vec2 aCorner;
attribute vec4 aStar;
uniform float uDist, uLen, uScale, uAspect, uDepth, uResY, uWarp;
varying float vAlong, vSide, vB;
varying vec3 vCol;
void main(){
  float zHead = -mod(aStar.z - uDist, uDepth) - 0.6;
  vec3 head = vec3(cos(aStar.x) * aStar.y, sin(aStar.x) * aStar.y, zHead);
  vec3 tail = head - vec3(0.0, 0.0, uLen * (0.6 + aStar.w * 0.6) + 0.02);
  vec4 ch = projectionMatrix * viewMatrix * vec4(head, 1.0);
  vec4 ct = projectionMatrix * viewMatrix * vec4(tail, 1.0);
  vec2 sh = ch.xy / ch.w;
  vec2 st = ct.xy / ct.w;
  vec2 dir = (sh - st) * vec2(uAspect, 1.0);
  float l = length(dir);
  dir = l > 1e-5 ? dir / l : vec2(0.0, 1.0);
  vec2 nrm = vec2(-dir.y, dir.x) / vec2(uAspect, 1.0);
  vec2 dn = dir / vec2(uAspect, 1.0);
  float near = 1.0 - (-zHead) / uDepth;
  float wpx = (0.9 + 1.6 * aStar.w) * uScale * (0.5 + near * 1.3);
  float w = wpx * 2.0 / uResY;
  vec2 s = mix(st, sh, aCorner.x) + nrm * aCorner.y * w + dn * (aCorner.x * 2.0 - 1.0) * w;
  gl_Position = vec4(s, 0.0, 1.0);
  vAlong = aCorner.x;
  vSide = aCorner.y;
  vB = smoothstep(0.0, 0.25, near) * (0.35 + 0.9 * near * near) * (0.5 + aStar.w);
  vec3 c = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.9, 0.8), fract(aStar.w * 7.3));
  vCol = mix(c, vec3(0.55, 0.7, 1.0), uWarp * 0.6);
}`;
const WARP_FS = /* glsl */ `
uniform float uWarp;
varying float vAlong, vSide, vB;
varying vec3 vCol;
void main(){
  float across = exp(-vSide * vSide * 3.2);
  float along = mix(1.0, smoothstep(0.0, 0.85, vAlong), smoothstep(0.02, 0.2, uWarp));
  vec3 c = mix(vCol, vec3(1.0), across * across * 0.6) * across * along * vB * 1.6;
  gl_FragColor = vec4(c, 1.0);
}`;
const TUNNEL_VS = /* glsl */ `
varying vec2 vUv;
varying float vZ;
void main(){
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vZ = wp.z;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const TUNNEL_FS = /* glsl */ `
uniform sampler2D uN2;
uniform float uDist, uWarp, uTun;
varying vec2 vUv;
varying float vZ;
void main(){
  float a = vUv.x;
  float z = vUv.y;
  float n1 = texture(uN2, vec2(a * 3.0, z * 5.0 + uDist * 0.0016)).r;
  float n2 = texture(uN2, vec2(a * 9.0 + n1 * 0.2, z * 1.4 + uDist * 0.0011)).b;
  float n3 = texture(uN2, vec2(a * 2.0 - z * 0.6, z * 0.8 + uDist * 0.0007)).g;
  float streak = pow(n2, 3.0) * 2.2 + pow(n1, 4.0) * 1.2;
  vec3 c = mix(vec3(0.12, 0.3, 1.0), vec3(0.7, 0.25, 1.0), n3);
  c = mix(c, vec3(0.75, 0.95, 1.0), smoothstep(0.55, 0.95, n2) * 0.7);
  float fadeNear = smoothstep(-4.0, -30.0, vZ);
  float fadeFar = smoothstep(-330.0, -170.0, vZ);
  float I = streak * fadeNear * fadeFar * uWarp * uWarp * uTun;
  gl_FragColor = vec4(c * I, 1.0);
}`;

/* ═════════════ i531 소행성대 ═════════════ */

function rockGeometry(seed: number): THREE.BufferGeometry {
  const r = rng(seed);
  const P = permTable(seed);
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 4);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const craters = Array.from({ length: 9 }, () => {
    const u = r() * 2 - 1;
    const a = r() * TAU;
    const s = Math.sqrt(1 - u * u);
    return { c: new THREE.Vector3(s * Math.cos(a), u, s * Math.sin(a)), rad: 0.15 + r() * 0.4, dep: 0.05 + r() * 0.09 };
  });
  const sx = 0.75 + r() * 0.5;
  const sy = 0.55 + r() * 0.3;
  const sz = 0.7 + r() * 0.4;
  const col = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  const o = r() * 50;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let h = 0;
    let a = 0.32;
    let f = 1.1;
    for (let k = 0; k < 5; k++) {
      h += a * perlin3(P, v.x * f + o, v.y * f + o, v.z * f + o, 256);
      a *= 0.5;
      f *= 2.1;
    }
    let cr = 0;
    for (const c of craters) {
      const d = Math.acos(clamp(v.dot(c.c), -1, 1)) / c.rad;
      if (d < 1.3) cr += d < 1 ? -c.dep * (1 - d * d) : c.dep * 0.5 * Math.sin(((d - 1) / 0.3) * Math.PI);
    }
    const rad = 1 + h + cr;
    const shade = clamp(0.75 + h * 0.9 + cr * 2.2, 0.35, 1.15);
    col[i * 3] = shade;
    col[i * 3 + 1] = shade * 0.97;
    col[i * 3 + 2] = shade * 0.93;
    pos.setXYZ(i, v.x * rad * sx, v.y * rad * sy, v.z * rad * sz);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
const SPIN_GLSL = /* glsl */ `
vec3 spinR(vec3 p, vec3 ax, float a){
  float c = cos(a), s = sin(a);
  return p * c + cross(ax, p) * s + ax * dot(ax, p) * (1.0 - c);
}`;
const BELT_FS = /* glsl */ `
uniform sampler2D uN2;
uniform vec3 uSunV;
uniform float uDust;
varying vec3 vWP;
void main(){
  float r = length(vWP.xz);
  float a = atan(vWP.z, vWP.x) / 6.2831853;
  float band = exp(-pow((r - 80.0) / 9.0, 2.0));
  float n = texture(uN2, vec2(a * 6.0, r * 0.02)).r * 0.7 + texture(uN2, vec2(a * 23.0, r * 0.07)).a * 0.5;
  vec3 V = normalize(vWP - cameraPosition);
  float fw = pow(max(dot(V, uSunV), 0.0), 6.0);
  float near = smoothstep(8.0, 40.0, length(vWP - cameraPosition));
  vec3 col = vec3(0.55, 0.45, 0.35) * band * n * (0.006 + 0.3 * fw) * uDust * near;
  gl_FragColor = vec4(col, 1.0);
  ${TONE_END}
}`;

/* ═════════════ i532 혜성 ═════════════ */

const PART_VS = /* glsl */ `
attribute vec4 aCA;
attribute float aSize;
uniform float uScale;
varying vec4 vCA;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float s = aSize * uScale * (300.0 / -mv.z);
  vCA = aCA;
  if (s < 1.5) { vCA.a *= s / 1.5; s = 1.5; }
  gl_PointSize = s;
}`;
const PART_FS = /* glsl */ `
varying vec4 vCA;
void main(){
  vec2 d = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(d, d);
  if (r2 > 1.0) discard;
  float k = exp(-r2 * 4.0) * (1.0 - r2);
  gl_FragColor = vec4(vCA.rgb * vCA.a * k, 1.0);
  ${TONE_END}
}`;
/** CPU 입자 통 (위치 · 색 · 알파 · 크기) */
class Parts {
  n = 0;
  readonly pos: Float32Array;
  readonly ca: Float32Array;
  readonly size: Float32Array;
  readonly geo = new THREE.BufferGeometry();
  readonly U = { uScale: { value: 1 } };
  readonly mat: THREE.ShaderMaterial;
  readonly pts: THREE.Points;
  constructor(readonly max: number) {
    this.pos = new Float32Array(max * 3);
    this.ca = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aCA', new THREE.BufferAttribute(this.ca, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({ uniforms: this.U, vertexShader: PART_VS, fragmentShader: PART_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.pts = new THREE.Points(this.geo, this.mat);
    this.pts.frustumCulled = false;
  }
  put(i: number, x: number, y: number, z: number, r: number, g: number, b: number, a: number, s: number): void {
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.ca[i * 4] = r;
    this.ca[i * 4 + 1] = g;
    this.ca[i * 4 + 2] = b;
    this.ca[i * 4 + 3] = a;
    this.size[i] = s;
  }
  upload(n: number): void {
    this.n = n;
    this.geo.setDrawRange(0, n);
    for (const k of ['position', 'aCA', 'aSize']) (this.geo.attributes[k] as THREE.BufferAttribute).needsUpdate = true;
  }
  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

/* ═════════════ i533 오로라 ═════════════ */

const AUR_VS = /* glsl */ `
uniform float uTime, uSeed, uZ, uW, uX, uBot, uTilt, uH, uMove;
varying vec2 vUv;
varying float vFold;
// 커튼 아래 가장자리가 지나는 길: 하늘을 비스듬히 가로지르며 S자로 굽이치고 잘게 접힌다
vec3 path(float u, float tm){
  float x = uX + (u - 0.5) * uW;
  float z = uZ + 60.0 * sin(u * 4.4 + uSeed * 6.0 + tm * 0.06) + 16.0 * sin(u * 12.0 - tm * 0.15 + uSeed * 3.0) + 4.0 * sin(u * 31.0 + tm * 0.33);
  float y = uBot + uTilt * (u - 0.5) + 5.0 * sin(u * 5.0 + tm * 0.08 + uSeed);
  return vec3(x, y, z);
}
void main(){
  vUv = uv;
  float tm = uTime * uMove;
  vec3 p = path(uv.x, tm);
  vec3 T = normalize(mat3(modelMatrix) * (path(uv.x + 0.002, tm) - p));
  vec3 wp = (modelMatrix * vec4(p, 1.0)).xyz;
  vec3 V = normalize(wp - cameraPosition);
  // 커튼을 옆에서(접힌 곳) 보면 빛이 겹쳐 더 밝다
  float side = length(cross(T, V));
  vFold = clamp(0.32 / (side + 0.1), 0.45, 2.8);
  p.y += uv.y * uH;
  p.x += uv.y * uH * 0.12;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const AUR_FS = /* glsl */ `
uniform sampler2D uN2;
uniform float uTime, uSeed, uI, uMove;
varying vec2 vUv;
varying float vFold;
void main(){
  float u = vUv.x;
  float v = vUv.y;
  float tm = uTime * uMove;
  // 세로 결: 가늘고 불규칙하게 (가는 잡음 두 겹, 위로 갈수록 조금 비껴감)
  float a1 = texture(uN2, vec2(u * 29.0 + v * 0.12 + tm * 0.004 + uSeed, 0.31 + v * 0.015)).a;
  float a2 = texture(uN2, vec2(u * 83.0 - v * 0.2 - tm * 0.007, 0.67 + v * 0.02)).r;
  float rays = 0.4 + 1.1 * a1 * a1 + 0.6 * a2 * a2 * a2;
  // 밝기가 띠를 따라 흘러간다
  float flow = 0.25 + 1.1 * smoothstep(0.3, 0.8, texture(uN2, vec2(u * 1.6 - tm * 0.025, 0.15 + uSeed)).g);
  float edge = smoothstep(0.0, 0.012, v) * (1.0 + 2.2 * exp(-v * 28.0));
  float decay = exp(-v * 3.0) * (1.0 - smoothstep(0.55, 1.0, v));
  vec3 col = mix(vec3(0.12, 1.0, 0.42), vec3(0.5, 0.14, 0.62), smoothstep(0.22, 0.75, v));
  col = mix(col, vec3(0.75, 1.0, 0.8), exp(-v * 40.0) * 0.35);
  float ends = smoothstep(0.0, 0.14, u) * smoothstep(1.0, 0.86, u);
  float I = edge * decay * rays * flow * vFold * ends;
  gl_FragColor = vec4(col * I * uI * 0.55, 1.0);
  ${TONE_END}
}`;
const SKY_FS = /* glsl */ `
uniform float uGlow;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  float alt = max(d.y, 0.0);
  vec3 c = mix(vec3(0.012, 0.022, 0.05), vec3(0.002, 0.004, 0.014), smoothstep(0.0, 0.6, alt));
  c += vec3(0.02, 0.09, 0.05) * exp(-alt * 6.0) * uGlow * smoothstep(-0.2, -0.9, d.z);
  gl_FragColor = vec4(c, 1.0);
  ${TONE_END}
}`;

/* ═════════════ i534 초신성 ═════════════ */

const SHELL_VS = /* glsl */ `
${N3_DECL}
uniform float uInner;
varying vec3 vN, vWN, vWP;
void main(){
  vN = normal;
  vWN = normalize(mat3(modelMatrix) * normal);
  float bump = texture(uN3, normal * 0.3 + vec3(0.5, uInner * 0.3, 0.2)).r - 0.5;
  vec4 wp = modelMatrix * vec4(position * (1.0 + bump * 0.35), 1.0);
  vWP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const SHELL_FS = /* glsl */ `
${N3_DECL}
uniform float uAge, uFil, uI, uInner;
varying vec3 vN, vWN, vWP;
void main(){
  vec3 n = normalize(vN);
  float mu = abs(dot(normalize(vWN), normalize(cameraPosition - vWP)));
  float rim = pow(1.0 - mu, 2.2);
  vec2 a = texture(uN3, n * 0.55 + vec3(0.2, 0.4, uAge * 0.01 + uInner)).rg;
  vec2 b = texture(uN3, n * 1.5 + vec3(a.r * 0.3, uInner, 0.0)).rg;
  float fil = smoothstep(0.62, 0.95, b.g) * 1.6 * smoothstep(0.35, 0.7, a.r) + smoothstep(0.75, 1.0, a.g) * 0.6;
  float clump = smoothstep(0.35, 0.8, a.r);
  vec3 shock = vec3(0.45, 0.68, 1.0) * pow(rim, 3.0) * smoothstep(0.3, 0.75, b.r) * (0.4 + clump) * 1.4;
  vec3 hot = mix(vec3(1.0, 0.28, 0.12), vec3(0.2, 0.95, 0.75), smoothstep(0.4, 0.75, b.r));
  vec3 col = (shock * (1.0 - uInner) * 0.6 + hot * fil * uFil * 0.5 * (0.2 + 0.8 * pow(1.0 - mu, 0.7))) * uI;
  gl_FragColor = vec4(col, 1.0);
  ${TONE_END}
}`;
const ECHO_FS = /* glsl */ `
uniform sampler2D uN2;
uniform float uEchoR, uEchoI;
varying vec2 vUv;
void main(){
  vec2 p = (vUv - 0.5) * 40.0;
  float d = texture(uN2, vUv * 1.3).r * 0.65 + texture(uN2, vUv * 3.1 + 0.4).b * 0.45;
  d = smoothstep(0.45, 0.95, d);
  float r = length(p);
  float ring = exp(-pow((r - uEchoR) / (1.2 + uEchoR * 0.08), 2.0));
  float inside = smoothstep(uEchoR + 2.0, 0.0, r) * 0.12;
  vec3 col = vec3(1.0, 0.55, 0.35) * d * (ring * 1.1 + inside) * uEchoI + vec3(0.04, 0.025, 0.03) * d * 0.2;
  gl_FragColor = vec4(col, 1.0);
  ${TONE_END}
}`;
const UV_VS = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const BEAM_FS = /* glsl */ `
uniform float uI;
varying vec2 vUv;
void main(){
  float along = vUv.y;
  float k = pow(along, 3.0);
  gl_FragColor = vec4(vec3(0.45, 0.7, 1.0) * k * uI * smoothstep(0.0, 0.4, along), 1.0);
  ${TONE_END}
}`;

/* ═════════════ i535 시차 별층 (2D) ═════════════ */

const LW = 2048;
const LH = 1000;
function parallaxLayers(): HTMLCanvasElement[] {
  const wrap = (g: CanvasRenderingContext2D, x: number, y: number, rr: number, inner: string, outer: string): void => {
    for (const dx of [-LW, 0, LW]) {
      if (x + dx + rr < 0 || x + dx - rr > LW) continue;
      const gr = g.createRadialGradient(x + dx, y, 0, x + dx, y, rr);
      gr.addColorStop(0, inner);
      gr.addColorStop(1, outer);
      g.fillStyle = gr;
      g.fillRect(x + dx - rr, y - rr, rr * 2, rr * 2);
    }
  };
  const stars = (key: string, n: number, seed: number, minA: number, maxS: number, glowP: number): HTMLCanvasElement =>
    cachedCanvas(key, LW, LH, (g) => {
      const r = rng(seed);
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < n; i++) {
        const x = r() * LW;
        const y = r() * LH;
        const c = bvRgb(sampleBV(r));
        const m = Math.pow(r(), 2.5);
        const a = minA + (1 - minA) * m;
        const rgb = `${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0}`;
        const s = 0.6 + m * maxS;
        wrap(g, x, y, s * 2.2, `rgba(${rgb},${a})`, `rgba(${rgb},0)`);
        if (m > 1 - glowP) {
          wrap(g, x, y, s * 9, `rgba(${rgb},${a * 0.22})`, `rgba(${rgb},0)`);
          g.fillStyle = `rgba(${rgb},${a * 0.35})`;
          for (const dx of [-LW, 0, LW]) {
            g.fillRect(x + dx - s * 10, y - 0.6, s * 20, 1.2);
            g.fillRect(x + dx - 0.6, y - s * 10, 1.2, s * 20);
          }
        }
      }
    });
  return [
    cachedCanvas('px0', LW, LH, (g) => {
      // 성운: 가로로 이어지는 퍼린 fbm 을 픽셀마다 (반 해상도로 구워 늘림)
      const W = LW / 2;
      const H = LH / 2;
      const P1 = permTable(41);
      const P2 = permTable(43);
      const P3 = permTable(47);
      const fbm = (P: Uint8Array, u: number, v: number, base: number, oct: number, ridge = false): number => {
        let f = 0;
        let a = 1;
        let sum = 0;
        for (let o = 0; o < oct; o++) {
          const per = base << o;
          const n = perlin2(P, u * per, v * per, per);
          f += a * (ridge ? 1 - Math.abs(n * 1.5) : n);
          sum += a;
          a *= 0.5;
        }
        return f / sum;
      };
      const img = g.createImageData(W, H);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const u = x / W;
          const v = (y / H) * (LH / LW);
          const band = Math.exp(-Math.pow((y / H - 0.5 - Math.sin(u * TAU) * 0.12) / 0.3, 2));
          const d = clamp((fbm(P1, u, v, 3, 6) * 1.2 + 0.25) * band * 1.6, 0, 1.4);
          const hue = fbm(P2, u, v, 2, 4) * 1.4 + 0.5;
          const rid = fbm(P3, u, v, 4, 5, true);
          const dust = clamp((rid - 0.55) * 3, 0, 1) * band;
          const k = d * d * (1 - dust * 0.85);
          // 보라 · 청록 · 분홍
          let r = lerp(0.42, 0.1, hue) + Math.max(0, 0.5 - Math.abs(hue - 0.75)) * 1.2;
          let gg = lerp(0.12, 0.55, hue);
          let b = lerp(0.85, 0.75, hue);
          r = r * k * 200;
          gg = gg * k * 200;
          b = b * k * 200;
          const i = (y * W + x) * 4;
          const base = 5 + (1 - Math.abs(y / H - 0.5) * 2) * 6;
          img.data[i] = clamp(base * 0.5 + r, 0, 255);
          img.data[i + 1] = clamp(base * 0.5 + gg, 0, 255);
          img.data[i + 2] = clamp(base * 1.4 + b, 0, 255);
          img.data[i + 3] = 255;
        }
      const tmp = document.createElement('canvas');
      tmp.width = W;
      tmp.height = H;
      tmp.getContext('2d')!.putImageData(img, 0, 0);
      g.imageSmoothingQuality = 'high';
      g.drawImage(tmp, 0, 0, LW, LH);
    }),
    stars('px1', 4200, 11, 0.12, 0.5, 0),
    stars('px2', 900, 12, 0.3, 1.0, 0.01),
    cachedCanvas('px3', LW, LH, (g) => {
      // 성간 먼지: 짙은 갈색 구름 + 별빛 받은 가장자리 (반 해상도 잡음)
      const W = LW / 2;
      const H = LH / 2;
      const P = permTable(53);
      const Q = permTable(59);
      const img = g.createImageData(W, H);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const u = x / W;
          const v = (y / H) * (LH / LW);
          let f = 0;
          let a = 1;
          for (let o = 0; o < 5; o++) {
            const per = 3 << o;
            f += a * perlin2(P, u * per, v * per, per);
            a *= 0.5;
          }
          const w2 = perlin2(Q, u * 6, v * 6, 6);
          const d = clamp((f - 0.12) * 3.2, 0, 1);
          const edge = Math.pow(clamp(1 - Math.abs(f - 0.16) * 5, 0, 1), 2) * clamp(w2 * 2 + 0.5, 0, 1) * 0.5;
          const i = (y * W + x) * 4;
          img.data[i] = 14 + edge * 120;
          img.data[i + 1] = 8 + edge * 70;
          img.data[i + 2] = 10 + edge * 45;
          img.data[i + 3] = clamp(d * 200 + edge * 60, 0, 255);
        }
      const tmp = document.createElement('canvas');
      tmp.width = W;
      tmp.height = H;
      tmp.getContext('2d')!.putImageData(img, 0, 0);
      g.imageSmoothingQuality = 'high';
      g.drawImage(tmp, 0, 0, LW, LH);
    }),
    stars('px4', 160, 14, 0.55, 2.2, 0.12),
    cachedCanvas('px5', LW, LH, (g) => {
      const r = rng(15);
      // 가까이 스치는 바위 (왼쪽에서 오는 빛 테)
      for (let i = 0; i < 9; i++) {
        const x = (i + r() * 0.6) * (LW / 9);
        const y = r() < 0.5 ? LH * (0.04 + r() * 0.16) : LH * (0.8 + r() * 0.16);
        const R0 = 14 + r() * 38;
        const pts: [number, number][] = [];
        for (let k = 0; k < 14; k++) {
          const a = (k / 14) * TAU;
          const rr = R0 * (0.75 + r() * 0.4);
          pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.75]);
        }
        g.beginPath();
        pts.forEach(([px, py], k) => (k ? g.lineTo(px, py) : g.moveTo(px, py)));
        g.closePath();
        const gr = g.createLinearGradient(x - R0, y - R0, x + R0, y + R0);
        gr.addColorStop(0, '#5a4a40');
        gr.addColorStop(0.35, '#1d1714');
        gr.addColorStop(1, '#050404');
        g.fillStyle = gr;
        g.fill();
        g.strokeStyle = 'rgba(255,200,150,0.25)';
        g.lineWidth = 1.5;
        g.stroke();
      }
      // 흐린 먼지 알갱이 (초점 밖)
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 40; i++) wrap(g, r() * LW, r() * LH, 6 + r() * 16, 'rgba(180,200,255,0.07)', 'rgba(180,200,255,0)');
    }),
  ];
}
function drawShip(g: CanvasRenderingContext2D, x: number, y: number, s: number, t: number): void {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  // 엔진 불꽃
  const fl = 1 + 0.15 * Math.sin(t * 40) + 0.1 * Math.sin(t * 23);
  g.globalCompositeOperation = 'lighter';
  for (const oy of [-9, 9]) {
    const gr = g.createRadialGradient(-44, oy, 0, -44, oy, 40 * fl);
    gr.addColorStop(0, 'rgba(200,230,255,0.95)');
    gr.addColorStop(0.25, 'rgba(90,150,255,0.6)');
    gr.addColorStop(1, 'rgba(40,60,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(-60 * fl, oy, 30 * fl, 6, 0, 0, TAU);
    g.fill();
    g.fillRect(-44 - 40 * fl, oy - 40, 40 * fl, 80);
  }
  g.globalCompositeOperation = 'source-over';
  // 몸체
  const body = g.createLinearGradient(0, -22, 0, 22);
  body.addColorStop(0, '#cfd6e2');
  body.addColorStop(0.45, '#7d8698');
  body.addColorStop(1, '#262b36');
  g.fillStyle = body;
  g.beginPath();
  g.moveTo(58, 0);
  g.quadraticCurveTo(30, -15, -10, -16);
  g.lineTo(-40, -30);
  g.lineTo(-46, -12);
  g.lineTo(-46, 12);
  g.lineTo(-40, 30);
  g.lineTo(-10, 16);
  g.quadraticCurveTo(30, 15, 58, 0);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 1;
  g.stroke();
  // 조종석
  const cp = g.createLinearGradient(20, -8, 40, 4);
  cp.addColorStop(0, '#9fe6ff');
  cp.addColorStop(1, '#1b3d66');
  g.fillStyle = cp;
  g.beginPath();
  g.ellipse(28, -3, 14, 5, -0.08, 0, TAU);
  g.fill();
  g.fillStyle = 'rgba(255,90,60,0.9)';
  g.fillRect(-30, -2, 18, 4);
  g.restore();
}

/* ───────────── 견본 ───────────── */

export const DEMOS: DemoMap = {
  /* i522 별 하늘 */
  i522: {
    kind: '3d',
    caption: '별 6만 개 — 어두운 별일수록 많은 실제 등급 분포, 색은 B-V 색지수 → 표면 온도 → 흑체 색, 대기 때문에 반짝인다',
    make(): Scene3D {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000000);
      const cam = new THREE.PerspectiveCamera(62, 1.6, 0.1, 1000);
      cam.rotation.order = 'YXZ';
      const S = makeStars(62000, 400, 3, { magMax: 8.4, band: 0.42, bandW: 0.16, frame: new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.9, 0.2, 0.5)), tw: 0.7 });
      S.U.uLimit.value = 7.6;
      scene.add(S.pts);
      return {
        scene,
        camera: cam,
        update(t) {
          S.U.uTime.value = t;
          cam.rotation.set(0.3 + 0.08 * Math.sin(t * 0.05), t * 0.02, 0);
        },
        resize: (_w, h) => (S.U.uScale.value = h / 900),
        controls: [
          range('한계 등급 (클수록 어두운 별까지)', 2, 8.4, 0.1, 7.6, (v) => (S.U.uLimit.value = v)),
          range('반짝임 (대기 흔들림)', 0, 2, 0.05, 0.7, (v) => (S.U.uTw.value = v)),
          range('색 (B-V 온도색)', 0, 1.5, 0.05, 1, (v) => (S.U.uColK.value = v)),
          range('밝기', 0.3, 3, 0.05, 1, (v) => (S.U.uGain.value = v)),
        ],
        dispose: () => S.dispose(),
      };
    },
  },

  /* i523 은하수 */
  i523: {
    kind: '3d',
    caption: '은하수 띠 — 잡음 별구름 + 가운데를 가르는 먼지 줄(파랑을 더 먹어 붉게) + 밝은 팽대부, 지평선 대기광과 산 그림자',
    make(): Scene3D {
      const bin = new Bin();
      const scene = new THREE.Scene();
      const cam = new THREE.PerspectiveCamera(68, 1.6, 0.5, 1000);
      cam.rotation.order = 'YXZ';
      const frame = galFrame(0.42, 0.15, 1.05);
      const U = { uN2: { value: noise2D() }, uGal: { value: new THREE.Matrix3().setFromMatrix4(frame).transpose() }, uDust: { value: 1 }, uGlow: { value: 1 }, uAir: { value: 1 } };
      const dome = new THREE.Mesh(new THREE.SphereGeometry(450, 64, 32), new THREE.ShaderMaterial({ uniforms: U, vertexShader: DIR_VS, fragmentShader: MW_FS, side: THREE.BackSide, depthWrite: false }));
      dome.renderOrder = -2;
      scene.add(dome);
      const S = makeStars(60000, 400, 8, { magMax: 8.2, band: 0.55, bandW: 0.07, frame, tw: 0.5, gain: 1.2 });
      scene.add(S.pts);
      const hills = mountainRing(300, 4, 0.06, 0x010204);
      scene.add(hills);
      bin.scene(scene);
      return {
        scene,
        camera: cam,
        tone: THREE.ACESFilmicToneMapping,
        update(t) {
          S.U.uTime.value = t;
          cam.rotation.set(0.42, 0.12 + Math.sin(t * 0.06) * 0.42, 0);
        },
        resize: (_w, h) => (S.U.uScale.value = h / 900),
        controls: [
          range('먼지 줄 (가림)', 0, 2, 0.05, 1, (v) => (U.uDust.value = v)),
          range('별구름 밝기', 0.2, 2.5, 0.05, 1, (v) => (U.uGlow.value = v)),
          range('대기광', 0, 3, 0.05, 1, (v) => (U.uAir.value = v)),
          range('별 밝기', 0.2, 3, 0.05, 1, (v) => (S.U.uGain.value = v)),
        ],
        dispose: () => {
          bin.dispose();
          S.dispose();
        },
      };
    },
  },

  /* i524 부피 성운 */
  i524: {
    kind: '3d',
    caption: '레이마칭 부피 성운 — 3D 잡음 덩어리를 한 걸음씩 지나며 빛을 모은다: 가운데 별 가까이는 청록(산소), 바깥은 빨강(수소), 먼지는 뒤 별을 가린다',
    make(): Scene3D {
      const bin = new Bin();
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000000);
      const cam = new THREE.PerspectiveCamera(50, 1.6, 0.1, 1000);
      const S = makeStars(14000, 300, 21, { magMax: 7.5, tw: 0.15 });
      scene.add(S.pts);
      const U = { uN3: { value: noise3D() }, uCamObj: { value: new THREE.Vector3() }, uStarPos: { value: new THREE.Vector3(0.05, 0.02, 0) }, uTime: { value: 0 }, uDens: { value: 1 }, uStar: { value: 1 }, uSteps: { value: 48 } };
      const neb = new THREE.Mesh(
        new THREE.BoxGeometry(2, 2, 2),
        new THREE.ShaderMaterial({ uniforms: U, vertexShader: NEB_VS, fragmentShader: NEB_FS, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor }),
      );
      neb.scale.setScalar(4.6);
      neb.renderOrder = 1;
      scene.add(neb);
      const tex = bin.add(texOf(spikeCanvas()));
      const gt = bin.add(texOf(glowCanvas()));
      const star = glowSprite(tex, 0xbfd8ff, 3, 1.4);
      star.position.copy(U.uStarPos.value).multiplyScalar(4.6);
      star.renderOrder = 2;
      scene.add(star);
      const halo = glowSprite(gt, 0x6fb6ff, 0.5, 3.2);
      halo.position.copy(star.position);
      halo.renderOrder = 2;
      scene.add(halo);
      const r = rng(5);
      for (let i = 0; i < 9; i++) {
        const s = glowSprite(tex, i % 3 ? 0xdde8ff : 0xffe2c0, 0.9 + r(), 0.35 + r() * 0.35);
        s.position.set(gauss(r) * 1.1, gauss(r) * 0.8, gauss(r) * 1.1);
        s.renderOrder = 2;
        scene.add(s);
      }
      bin.scene(scene);
      const inv = new THREE.Matrix4();
      return {
        scene,
        camera: cam,
        tone: THREE.ACESFilmicToneMapping,
        update(t) {
          S.U.uTime.value = t;
          U.uTime.value = t;
          const a = t * 0.07;
          cam.position.set(Math.sin(a) * 8.4, 1.6 + Math.sin(t * 0.05) * 1.2, Math.cos(a) * 8.4);
          cam.lookAt(0, 0, 0);
          neb.updateMatrixWorld();
          inv.copy(neb.matrixWorld).invert();
          U.uCamObj.value.copy(cam.position).applyMatrix4(inv);
          star.scale.setScalar(1.4 * (1 + 0.04 * Math.sin(t * 3)));
        },
        resize: (_w, h) => (S.U.uScale.value = h / 900),
        controls: [
          range('밀도', 0.2, 2.5, 0.05, 1, (v) => (U.uDens.value = v)),
          range('가운데 별빛', 0, 3, 0.05, 1, (v) => (U.uStar.value = v)),
          range('걸음 수 (레이마칭)', 8, 48, 1, 48, (v) => (U.uSteps.value = v)),
        ],
        dispose: () => {
          bin.dispose();
          S.dispose();
        },
      };
    },
  },

  /* i525 나선 은하 */
  i525: {
    kind: '3d',
    caption: '입자 20만 개 나선 은하 — 별마다 조금씩 돌아간 타원 궤도를 돌고, 타원이 몰리는 곳이 팔(밀도파). 파란 젊은 별 · 분홍 수소 구름 · 먼지 줄',
    make(): Scene3D {
      const bin = new Bin();
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000000);
      const cam = new THREE.PerspectiveCamera(45, 1.6, 0.1, 1000);
      const bg = makeStars(9000, 300, 33, { magMax: 7, tw: 0.1, gain: 0.7 });
      scene.add(bg.pts);
      const D = galaxyData();
      const U = { uTime: { value: 0 }, uTwist: { value: 0.38 }, uEcc: { value: 0.36 }, uProj: { value: 500 }, uSpeed: { value: 0.35 }, uSize: { value: 0.075 }, uLag: { value: 0.22 }, uGain: { value: 0.2 }, uDust: { value: 1 } };
      const mkGeo = (d: GalData): THREE.BufferGeometry => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(d.n * 3), 3));
        g.setAttribute('aOrbit', new THREE.BufferAttribute(d.orbit, 4));
        g.setAttribute('aCol', new THREE.BufferAttribute(d.col, 3));
        g.setAttribute('aB', new THREE.BufferAttribute(d.bri, 1));
        return g;
      };
      const gal = new THREE.Group();
      gal.rotation.set(0.55, 0, 0.3);
      scene.add(gal);
      const stars = new THREE.Points(mkGeo(D.stars), new THREE.ShaderMaterial({ uniforms: U, vertexShader: GAL_VS, fragmentShader: GAL_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      stars.frustumCulled = false;
      gal.add(stars);
      const dust = new THREE.Points(mkGeo(D.dust), new THREE.ShaderMaterial({ uniforms: U, vertexShader: GAL_VS, fragmentShader: DUST_FS, transparent: true, depthWrite: false, toneMapped: false }));
      dust.frustumCulled = false;
      dust.renderOrder = 2;
      gal.add(dust);
      const gt = bin.add(texOf(glowCanvas()));
      const core = glowSprite(gt, 0xffc890, 0.5, 5.5);
      core.renderOrder = 1;
      gal.add(core);
      const core2 = glowSprite(gt, 0xfff0d8, 0.35, 1.2);
      core2.renderOrder = 1;
      gal.add(core2);
      bin.scene(gal);
      const hdr = bin.add(new HdrPass());
      hdr.U.uExp.value = 1.2;
      return {
        scene,
        camera: cam,
        render: (rr, w, h) => hdr.render(rr, scene, cam, w, h),
        update(t) {
          U.uTime.value = t;
          bg.U.uTime.value = t;
          const a = t * 0.03;
          cam.position.set(Math.sin(a) * 4, 3 + Math.sin(t * 0.04) * 2, 25);
          cam.lookAt(0, 0, 0);
        },
        resize: (_w, h) => {
          U.uProj.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)));
          bg.U.uScale.value = h / 900;
        },
        controls: [
          range('노출 (HDR 톤 매핑)', 0.2, 5, 0.05, 1.2, (v) => (hdr.U.uExp.value = v)),
          range('팔 꼬임 (타원이 반지름마다 돌아간 정도)', 0, 1, 0.01, 0.38, (v) => (U.uTwist.value = v)),
          range('타원 찌그러짐 (밀도파 세기)', 0, 0.5, 0.01, 0.36, (v) => (U.uEcc.value = v)),
          range('먼지 줄', 0, 2, 0.05, 1, (v) => (U.uDust.value = v)),
          range('회전 빠르기', 0, 2, 0.05, 0.35, (v) => (U.uSpeed.value = v)),
        ],
        dispose: () => {
          bin.dispose();
          bg.dispose();
        },
      };
    },
  },

  /* i526 행성 대기 */
  i526: {
    kind: '3d',
    caption: '행성 대기 — 빛줄을 12걸음 지나며 레일리(파랑) · 미(해 쪽 빛무리) 산란을 모아 테두리가 빛나고 낮밤 경계는 노을빛, 밤쪽엔 도시 불빛 · 구름 그림자',
    make(): Scene3D {
      const bin = new Bin();
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000000);
      const cam = new THREE.PerspectiveCamera(38, 1.6, 0.01, 1000);
      cam.position.set(-0.5, 0.55, 3.1);
      cam.lookAt(-0.62, 0.05, 0);
      const S = makeStars(12000, 300, 44, { magMax: 7, tw: 0.1, gain: 0.8 });
      scene.add(S.pts);
      const sun = new THREE.Vector3(-1, 0.28, -0.55).normalize();
      const U = { uN3: { value: noise3D() }, uSun: { value: sun }, uSunObj: { value: new THREE.Vector3() }, uTime: { value: 0 }, uCloudRot: { value: 0 }, uCloud: { value: 0.5 }, uLights: { value: 1 } };
      const planet = new THREE.Mesh(new THREE.SphereGeometry(1, 160, 96), new THREE.ShaderMaterial({ uniforms: U, vertexShader: PLANET_VS, fragmentShader: EARTH_FS }));
      planet.rotation.z = 0.35;
      scene.add(planet);
      const UA = { uSun: { value: sun }, uRA: { value: 1.06 }, uDens: { value: 1 } };
      const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.06, 128, 64), new THREE.ShaderMaterial({ uniforms: UA, vertexShader: ATMO_VS, fragmentShader: ATMO_FS, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
      atmo.renderOrder = 2;
      scene.add(atmo);
      bin.scene(scene);
      let spin = 1;
      let rot = 0;
      let last = 0;
      const inv = new THREE.Matrix4();
      return {
        scene,
        camera: cam,
        tone: THREE.ACESFilmicToneMapping,
        update(t) {
          const dt = Math.min(0.05, Math.max(0, t - last));
          last = t;
          rot += dt * 0.03 * spin;
          planet.rotation.y = rot + 2.2;
          U.uTime.value = t;
          U.uCloudRot.value = rot * 0.35;
          S.U.uTime.value = t;
          planet.updateMatrixWorld();
          inv.copy(planet.matrixWorld).invert();
          U.uSunObj.value.copy(sun).transformDirection(inv);
        },
        resize: (_w, h) => (S.U.uScale.value = h / 900),
        controls: [
          range('대기 짙기', 0, 2.5, 0.05, 1, (v) => (UA.uDens.value = v)),
          range('구름 양', 0, 1, 0.01, 0.5, (v) => (U.uCloud.value = v)),
          range('도시 불빛', 0, 3, 0.05, 1, (v) => (U.uLights.value = v)),
          range('자전 빠르기', 0, 6, 0.1, 1, (v) => (spin = v)),
        ],
        dispose: () => {
          bin.dispose();
          S.dispose();
        },
      };
    },
  },

  /* i527 고리 행성 */
  i527: {
    kind: '3d',
    caption: '고리 행성 — 행성 픽셀에서 해 쪽으로 쏜 빛줄이 고리 면을 지나면 고리 그림자, 고리 픽셀에서 쏜 빛줄이 행성에 닿으면 행성 그림자',
    make(): Scene3D {
      const bin = new Bin();
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000000);
      const cam = new THREE.PerspectiveCamera(36, 1.6, 0.1, 1000);
      cam.position.set(0.6, 1.5, 8.6);
      cam.lookAt(0, -0.1, 0);
      const S = makeStars(12000, 300, 55, { magMax: 7, tw: 0.1, gain: 0.8 });
      scene.add(S.pts);
      const grp = new THREE.Group();
      grp.rotation.set(0.12, 0, 0.42);
      scene.add(grp);
      const sun = new THREE.Vector3();
      const U = { uN3: { value: noise3D() }, uSun: { value: sun }, uSunG: { value: new THREE.Vector3() }, uCamG: { value: new THREE.Vector3() }, uTime: { value: 0 }, uFlat: { value: 0.9 }, uRing: { value: 1 } };
      const planet = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), new THREE.ShaderMaterial({ uniforms: U, vertexShader: SAT_VS, fragmentShader: SAT_FS }));
      planet.scale.y = 0.9;
      grp.add(planet);
      const rg = new THREE.RingGeometry(1.22, 2.36, 256, 2);
      rg.rotateX(-Math.PI / 2);
      const ring = new THREE.Mesh(rg, new THREE.ShaderMaterial({ uniforms: U, vertexShader: RING_VS, fragmentShader: RING_FS, side: THREE.DoubleSide, transparent: true, depthWrite: false }));
      ring.renderOrder = 1;
      grp.add(ring);
      bin.scene(scene);
      let auto = true;
      let manual = 40;
      let tilt = 0.42;
      const inv = new THREE.Matrix4();
      return {
        scene,
        camera: cam,
        tone: THREE.ACESFilmicToneMapping,
        update(t) {
          S.U.uTime.value = t;
          U.uTime.value = t;
          grp.rotation.z = tilt;
          const az = THREE.MathUtils.degToRad(auto ? -10 + 60 * Math.sin(t * 0.12) : manual);
          sun.set(-Math.cos(az), 0.42, Math.sin(az) * 0.9 + 0.35).normalize();
          planet.rotation.y = t * 0.05;
          grp.updateMatrixWorld();
          inv.copy(grp.matrixWorld).invert();
          U.uSunG.value.copy(sun).transformDirection(inv);
          U.uCamG.value.copy(cam.position).applyMatrix4(inv);
        },
        resize: (_w, h) => (S.U.uScale.value = h / 900),
        controls: [
          tog('해가 저절로 움직이기', true, (v) => (auto = v)),
          range('해 방향 (자동 끄면)', -80, 80, 1, 40, (v) => (manual = v)),
          range('고리 기울기', -0.2, 1.0, 0.01, 0.42, (v) => (tilt = v)),
          range('고리 짙기', 0, 1.5, 0.05, 1, (v) => (U.uRing.value = v)),
        ],
        dispose: () => {
          bin.dispose();
          S.dispose();
        },
      };
    },
  },

  /* i528 태양 표면 · 코로나 */
  i528: {
    kind: '3d',
    caption: '태양 — 흐르는 쌀알 무늬 · 흑점 · 주연 감광(가장자리가 어둡다), 둘레엔 줄무늬 코로나와 붉은 채층, 가장자리에 반타원 고리 홍염이 흐른다',
    make(): Scene3D {
      const bin = new Bin();
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000000);
      const cam = new THREE.PerspectiveCamera(40, 1.6, 0.1, 1000);
      cam.position.set(0, 0, 5.4);
      const S = makeStars(8000, 300, 66, { magMax: 6.5, tw: 0.05, gain: 0.6 });
      scene.add(S.pts);
      const U = { uN3: { value: noise3D() }, uTime: { value: 0 }, uSpots: { value: 1 } };
      const sun = new THREE.Mesh(new THREE.SphereGeometry(1, 160, 96), new THREE.ShaderMaterial({ uniforms: U, vertexShader: SUN_VS, fragmentShader: SUN_FS }));
      scene.add(sun);
      const UC = { uN2: { value: noise2D() }, uTime: { value: 0 }, uCor: { value: 1 }, uProm: { value: 1 } };
      const corona = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 7.2), new THREE.ShaderMaterial({ uniforms: UC, vertexShader: CORONA_VS, fragmentShader: CORONA_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      corona.renderOrder = 1;
      scene.add(corona);
      bin.scene(scene);
      return {
        scene,
        camera: cam,
        tone: THREE.ACESFilmicToneMapping,
        update(t) {
          U.uTime.value = t;
          UC.uTime.value = t;
          S.U.uTime.value = t;
          sun.rotation.y = t * 0.025;
        },
        resize: (_w, h) => (S.U.uScale.value = h / 900),
        controls: [
          range('흑점', 0, 1.5, 0.05, 1, (v) => (U.uSpots.value = v)),
          range('코로나 세기', 0, 2.5, 0.05, 1, (v) => (UC.uCor.value = v)),
          range('홍염', 0, 2.5, 0.05, 1, (v) => (UC.uProm.value = v)),
        ],
        dispose: () => {
          bin.dispose();
          S.dispose();
        },
      };
    },
  },

  /* i529 블랙홀 */
  i529: {
    kind: '3d',
    caption: '블랙홀 — 픽셀마다 빛줄을 휘게 따라가(슈바르츠실트 근사) 뒤 하늘이 휘고 원반 뒤쪽이 위아래로 보인다. 다가오는 쪽 원반은 도플러로 더 밝고 파랗다',
    make(): Scene3D {
      const bin = new Bin();
      const scene = new THREE.Scene();
      const cam = new THREE.PerspectiveCamera(48, 1.6, 0.1, 1000);
      const sky = bin.add(texOf(bhSkyCanvas(), true));
      sky.generateMipmaps = false;
      sky.minFilter = THREE.LinearFilter;
      const U = { uSky: { value: sky as THREE.Texture }, uN2: { value: noise2D() }, uTime: { value: 0 }, uLens: { value: 1 }, uDopp: { value: 1 }, uDisk: { value: 1 } };
      const ball = new THREE.Mesh(new THREE.SphereGeometry(50, 64, 32), new THREE.ShaderMaterial({ uniforms: U, vertexShader: BH_VS, fragmentShader: BH_FS, side: THREE.BackSide, depthWrite: false }));
      scene.add(ball);
      bin.scene(scene);
      let elev = 9;
      return {
        scene,
        camera: cam,
        tone: THREE.ACESFilmicToneMapping,
        update(t) {
          U.uTime.value = t;
          const a = t * 0.05;
          const e = THREE.MathUtils.degToRad(elev + Math.sin(t * 0.13) * 3);
          const R = 26;
          cam.position.set(Math.sin(a) * Math.cos(e) * R, Math.sin(e) * R, Math.cos(a) * Math.cos(e) * R);
          cam.lookAt(0, 0, 0);
          ball.position.copy(cam.position);
        },
        controls: [
          range('중력 렌즈 (빛 휘기)', 0, 1, 0.01, 1, (v) => (U.uLens.value = v)),
          range('도플러 · 중력 적색편이', 0, 1, 0.01, 1, (v) => (U.uDopp.value = v)),
          range('원반 밝기', 0, 2.5, 0.05, 1, (v) => (U.uDisk.value = v)),
          range('보는 높이 (°)', -30, 60, 1, 9, (v) => (elev = v)),
        ],
        dispose: () => bin.dispose(),
      };
    },
  },

  /* i530 워프 */
  i530: {
    kind: '3d',
    caption: '워프 — 별이 속도만큼 늘어난 빛줄이 되고(화면 공간 띠), 시야각이 넓어지며 푸른 초공간 터널이 열렸다가 번쩍 빠져나온다',
    make(): Scene3D {
      const bin = new Bin();
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000004);
      const cam = new THREE.PerspectiveCamera(60, 1.6, 0.1, 1000);
      const N = 2600;
      const geo = new THREE.InstancedBufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
      geo.setAttribute('aCorner', new THREE.Float32BufferAttribute([0, -1, 0, 1, 1, -1, 1, 1], 2));
      geo.setIndex([0, 2, 1, 1, 2, 3]);
      const st = new Float32Array(N * 4);
      const r = rng(77);
      for (let i = 0; i < N; i++) {
        st[i * 4] = r() * TAU;
        st[i * 4 + 1] = 0.6 + Math.pow(r(), 0.7) * 26;
        st[i * 4 + 2] = r() * 300;
        st[i * 4 + 3] = Math.pow(r(), 3);
      }
      geo.setAttribute('aStar', new THREE.InstancedBufferAttribute(st, 4));
      geo.instanceCount = N;
      const U = { uDist: { value: 0 }, uLen: { value: 0 }, uScale: { value: 1 }, uAspect: { value: 1.6 }, uDepth: { value: 300 }, uResY: { value: 900 }, uWarp: { value: 0 } };
      const streaks = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: U, vertexShader: WARP_VS, fragmentShader: WARP_FS, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
      streaks.frustumCulled = false;
      streaks.renderOrder = 2;
      scene.add(streaks);
      const UT = { uN2: { value: noise2D() }, uDist: { value: 0 }, uWarp: { value: 0 }, uTun: { value: 1 } };
      const tg = new THREE.CylinderGeometry(9, 9, 340, 72, 1, true);
      tg.rotateX(Math.PI / 2);
      const tunnel = new THREE.Mesh(tg, new THREE.ShaderMaterial({ uniforms: UT, vertexShader: TUNNEL_VS, fragmentShader: TUNNEL_FS, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      tunnel.position.z = -170;
      tunnel.renderOrder = 1;
      scene.add(tunnel);
      const gt = bin.add(texOf(glowCanvas()));
      const eye = glowSprite(gt, 0x9fc8ff, 1, 30);
      eye.position.z = -240;
      scene.add(eye);
      const flash = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ color: 0xdfeaff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false }));
      flash.position.z = -0.5;
      flash.renderOrder = 5;
      cam.add(flash);
      scene.add(cam);
      bin.scene(scene);
      let auto = true;
      let manual = 0.5;
      let last = 0;
      return {
        scene,
        camera: cam,
        update(t) {
          const dt = Math.min(0.05, Math.max(0, t - last));
          last = t;
          let w: number;
          let fl = 0;
          if (auto) {
            const p = t % 12;
            if (p < 3) w = 0;
            else if (p < 5.2) w = Math.pow((p - 3) / 2.2, 2.2);
            else if (p < 9) w = 1;
            else if (p < 9.35) w = 1 - (p - 9) / 0.35;
            else w = 0;
            if (p >= 9 && p < 10.4) fl = Math.exp(-(p - 9) * 4) * 0.9;
            if (p >= 5 && p < 5.6) fl = Math.max(fl, (1 - Math.abs(p - 5.25) / 0.35) * 0.35);
          } else w = manual;
          const speed = lerp(3, 330, w * w);
          U.uDist.value += speed * dt;
          U.uLen.value = speed * 0.045;
          U.uWarp.value = w;
          UT.uDist.value = U.uDist.value;
          UT.uWarp.value = w;
          (eye.material as THREE.SpriteMaterial).opacity = 0.15 + w * 0.85;
          eye.scale.setScalar(20 + w * 40);
          (flash.material as THREE.MeshBasicMaterial).opacity = fl;
          const fov = lerp(60, 98, smooth(0, 1, w));
          if (Math.abs(cam.fov - fov) > 0.01) {
            cam.fov = fov;
            cam.updateProjectionMatrix();
          }
          const sh = w * w * 0.012;
          cam.position.set(Math.sin(t * 37) * sh, Math.cos(t * 41) * sh, 0);
          cam.rotation.z = Math.sin(t * 0.3) * 0.05 + w * Math.sin(t * 0.7) * 0.06;
        },
        resize: (w, h) => {
          U.uScale.value = h / 900;
          U.uAspect.value = w / h;
          U.uResY.value = h;
        },
        controls: [
          tog('저절로 (순항 → 워프 → 빠져나오기)', true, (v) => (auto = v)),
          range('워프 세기 (자동 끄면)', 0, 1, 0.01, 0.5, (v) => (manual = v)),
          range('초공간 터널', 0, 2, 0.05, 1, (v) => (UT.uTun.value = v)),
        ],
        dispose: () => {
          bin.dispose();
        },
      };
    },
  },

  /* i531 소행성대 + 렌즈 플레어 */
  i531: {
    kind: '3d',
    caption: '소행성대 — 절차로 빚은 바위 5종(잡음 · 크레이터)을 인스턴싱으로 4천 개, 회전은 정점 셰이더에서. 해를 보면 렌즈 플레어, 먼지 띠는 해 쪽에서 빛난다',
    make(): Scene3D {
      const bin = new Bin();
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000000);
      const cam = new THREE.PerspectiveCamera(55, 1.6, 0.05, 2000);
      const S = makeStars(14000, 900, 99, { magMax: 7, tw: 0.08, gain: 0.8 });
      scene.add(S.pts);
      scene.add(new THREE.HemisphereLight(0x3a4866, 0x0a0806, 0.35));
      const sunL = new THREE.PointLight(0xfff1dc, 3.4, 0, 0);
      scene.add(sunL);
      const gt = bin.add(texOf(glowCanvas()));
      const ht = bin.add(texOf(hexCanvas()));
      const sunG = glowSprite(gt, 0xfff0d0, 3, 30);
      scene.add(sunG);
      const sunG2 = glowSprite(gt, 0xffa860, 0.5, 70);
      scene.add(sunG2);
      const flare = new Lensflare();
      flare.addElement(new LensflareElement(gt, 380, 0, new THREE.Color(0xffe6c0)));
      flare.addElement(new LensflareElement(ht, 50, 0.45, new THREE.Color(0x0a1230)));
      flare.addElement(new LensflareElement(ht, 80, 0.6, new THREE.Color(0x0a2a16)));
      flare.addElement(new LensflareElement(ht, 120, 0.8, new THREE.Color(0x2a120a)));
      flare.addElement(new LensflareElement(gt, 160, 1.0, new THREE.Color(0x101a30)));
      flare.addElement(new LensflareElement(ht, 60, 1.15, new THREE.Color(0x1a1030)));
      sunL.add(flare);
      const belt = new THREE.Group();
      scene.add(belt);
      const Ut = { value: 0 };
      const meshes: THREE.InstancedMesh[] = [];
      const r = rng(123);
      const PER = 820;
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const v = new THREE.Vector3();
      const sc = new THREE.Vector3();
      const col = new THREE.Color();
      for (let k = 0; k < 5; k++) {
        const geo = rockGeometry(200 + k * 17);
        const spin = new Float32Array(PER * 4);
        const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.93, metalness: 0, vertexColors: true });
        mat.onBeforeCompile = (sh) => {
          sh.uniforms.uTime = Ut;
          sh.vertexShader = sh.vertexShader
            .replace('#include <common>', `#include <common>\nattribute vec4 aSpin;\nuniform float uTime;\n${SPIN_GLSL}`)
            .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\nobjectNormal = spinR(objectNormal, aSpin.xyz, uTime * aSpin.w);`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed = spinR(transformed, aSpin.xyz, uTime * aSpin.w);`);
        };
        const im = new THREE.InstancedMesh(geo, mat, PER);
        for (let i = 0; i < PER; i++) {
          const near = i < 14;
          const a = near ? (r() - 0.5) * 0.35 : r() * TAU;
          const rad = near ? (r() < 0.5 ? 76 + r() * 4 : 88 + r() * 6) : 80 + gauss(r) * 6.5;
          const y = gauss(r) * (near ? 2.2 : 1.6);
          v.set(Math.cos(a) * rad, y, Math.sin(a) * rad);
          const s = near ? 0.2 + Math.pow(r(), 2) * 1.2 : 0.05 + Math.pow(r(), 4) * 1.2;
          sc.set(s, s, s);
          q.setFromEuler(new THREE.Euler(r() * TAU, r() * TAU, r() * TAU));
          m4.compose(v, q, sc);
          im.setMatrixAt(i, m4);
          const tint = r();
          col.setRGB(0.42 + tint * 0.12, 0.38 + tint * 0.08, 0.34 + tint * 0.04 + (r() < 0.2 ? 0.06 : 0));
          im.setColorAt(i, col);
          const ax = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
          spin[i * 4] = ax.x;
          spin[i * 4 + 1] = ax.y;
          spin[i * 4 + 2] = ax.z;
          spin[i * 4 + 3] = (0.05 + r() * 0.5) / Math.sqrt(s + 0.2);
        }
        geo.setAttribute('aSpin', new THREE.InstancedBufferAttribute(spin, 4));
        im.frustumCulled = false;
        belt.add(im);
        meshes.push(im);
      }
      const UB = { uN2: { value: noise2D() }, uSunV: { value: new THREE.Vector3() }, uDust: { value: 1 } };
      const bg = new THREE.RingGeometry(55, 105, 256, 4);
      bg.rotateX(-Math.PI / 2);
      const haze = new THREE.Mesh(bg, new THREE.ShaderMaterial({ uniforms: UB, vertexShader: ATMO_VS, fragmentShader: BELT_FS, side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      belt.add(haze);
      bin.scene(scene);
      bin.add({ dispose: () => flare.dispose() });
      let orbit = 1;
      let last = 0;
      let ang = 0;
      return {
        scene,
        camera: cam,
        tone: THREE.ACESFilmicToneMapping,
        update(t) {
          const dt = Math.min(0.05, Math.max(0, t - last));
          last = t;
          Ut.value = t;
          S.U.uTime.value = t;
          ang += dt * 0.004 * orbit;
          belt.rotation.y = ang;
          cam.position.set(84 + Math.sin(t * 0.1) * 0.8, 3.2 + Math.sin(t * 0.07) * 0.8, 3 + Math.sin(t * 0.05) * 2);
          const look = new THREE.Vector3(-0.86, -0.06, -0.5);
          cam.lookAt(cam.position.x + look.x, cam.position.y + look.y, cam.position.z + look.z);
          UB.uSunV.value.copy(cam.position).negate().normalize();
        },
        resize: (_w, h) => (S.U.uScale.value = h / 900),
        controls: [
          range('소행성 수 (배)', 0.1, 1, 0.05, 1, (k) => meshes.forEach((m) => (m.count = Math.round(PER * k)))),
          tog('렌즈 플레어', true, (on) => (flare.visible = on)),
          range('먼지 띠', 0, 3, 0.05, 1, (k) => (UB.uDust.value = k)),
          range('공전 빠르기', 0, 10, 0.1, 1, (k) => (orbit = k)),
        ],
        dispose: () => {
          bin.dispose();
          S.dispose();
        },
      };
    },
  },

  /* i532 혜성 */
  i532: {
    kind: '3d',
    caption: '혜성 — 이온 꼬리(파랑)는 태양풍에 밀려 언제나 해 반대쪽으로 곧게, 먼지 꼬리(노랑)는 복사압으로 궤도 뒤로 휘며 처진다. 해에 가까울수록 길고 밝다',
    make(): Scene3D {
      const bin = new Bin();
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000000);
      const cam = new THREE.PerspectiveCamera(42, 1.6, 0.01, 1000);
      cam.position.set(-0.6, 6.4, 4.6);
      cam.lookAt(-0.55, 0, 0.1);
      const S = makeStars(12000, 300, 111, { magMax: 7, tw: 0.15, gain: 0.8 });
      scene.add(S.pts);
      const gt = bin.add(texOf(glowCanvas()));
      const st = bin.add(texOf(spikeCanvas()));
      scene.add(glowSprite(gt, 0xffe0a8, 3.2, 1.4));
      scene.add(glowSprite(gt, 0xff9a40, 0.6, 5));
      scene.add(glowSprite(st, 0xfff3e0, 1.6, 2.4));
      // 궤도 (q = 1, e = 0.9)
      const e = 0.9;
      const qd = 1.0;
      const a = qd / (1 - e);
      const bAx = a * Math.sqrt(1 - e * e);
      const nMot = Math.sqrt(1 / (a * a * a));
      const nuMax = THREE.MathUtils.degToRad(125);
      const E1 = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(nuMax / 2));
      const M1 = E1 - e * Math.sin(E1);
      const span = (2 * M1) / nMot;
      const orbitPts: THREE.Vector3[] = [];
      for (let i = -150; i <= 150; i++) {
        const nu = THREE.MathUtils.degToRad(i);
        const rr = (a * (1 - e * e)) / (1 + e * Math.cos(nu));
        orbitPts.push(new THREE.Vector3(rr * Math.cos(nu), 0, -rr * Math.sin(nu)));
      }
      const orbitLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(orbitPts), new THREE.LineBasicMaterial({ color: 0x5a7aa8, transparent: true, opacity: 0.25 }));
      scene.add(orbitLine);
      const posAt = (tt: number, out: THREE.Vector3): THREE.Vector3 => {
        const M = -M1 + nMot * tt;
        let E = M;
        for (let k = 0; k < 8; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
        return out.set(a * (Math.cos(E) - e), 0, -bAx * Math.sin(E));
      };
      const coma = glowSprite(gt, 0x7dffd0, 1.4, 0.5);
      scene.add(coma);
      const nucleus = glowSprite(st, 0xffffff, 1.4, 0.18);
      scene.add(nucleus);
      const MAXD = 7000;
      const MAXI = 4000;
      const P = new Parts(MAXD + MAXI);
      scene.add(P.pts);
      bin.add(P);
      type Pt = { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; beta: number; ion: boolean };
      const dust: Pt[] = [];
      const ions: Pt[] = [];
      const rays = Array.from({ length: 7 }, (_, i) => ({ off: (i - 3) * 0.05, ph: Math.random() * TAU }));
      const cp = new THREE.Vector3();
      const cp2 = new THREE.Vector3();
      let simT = 0;
      let speed = 1;
      let ionOn = true;
      let dustOn = true;
      let accD = 0;
      let accI = 0;
      let last = 0;
      bin.scene(scene);
      return {
        scene,
        camera: cam,
        tone: THREE.ACESFilmicToneMapping,
        update(t) {
          const dt = Math.min(0.05, Math.max(0, t - last));
          last = t;
          S.U.uTime.value = t;
          const sdt = (dt * speed * span) / 15;
          simT += sdt;
          if (simT > span) simT -= span;
          posAt(simT, cp);
          posAt(simT + 0.001, cp2);
          const vx = (cp2.x - cp.x) / 0.001;
          const vz = (cp2.z - cp.z) / 0.001;
          const rS = cp.length();
          const ux = cp.x / rS;
          const uz = cp.z / rS;
          const act = Math.min(3, 1.6 / (rS * rS));
          coma.position.copy(cp);
          nucleus.position.copy(cp);
          coma.scale.setScalar(0.35 + 0.45 * act);
          (coma.material as THREE.SpriteMaterial).opacity = Math.min(1, 0.4 + act * 0.5);
          // 먼지: 혜성 속도 + 조금 흩어짐, 복사압(β) 으로 중력이 줄어 궤도 뒤로 처진다
          if (dustOn) accD += dt * 1150 * act;
          while (accD >= 1 && dust.length < MAXD) {
            accD--;
            dust.push({ x: cp.x, y: (Math.random() - 0.5) * 0.01, z: cp.z, vx: vx + gauss(Math.random) * 0.04 + ux * 0.05, vy: gauss(Math.random) * 0.02, vz: vz + gauss(Math.random) * 0.04 + uz * 0.05, age: 0, life: 4 + Math.random() * 4, beta: 0.15 + Math.pow(Math.random(), 1.5) * 0.85, ion: false });
          }
          accD = Math.min(accD, 20);
          // 이온: 해 반대쪽으로 빠르게, 가는 줄기 몇 가닥
          if (ionOn) accI += dt * 1500 * act;
          while (accI >= 1 && ions.length < MAXI) {
            accI--;
            const ray = rays[Math.floor(Math.random() * rays.length)]!;
            const off = ray.off + Math.sin(t * 0.7 + ray.ph) * 0.02 + gauss(Math.random) * 0.006;
            const sp = 2.6 + Math.random() * 1.6;
            ions.push({ x: cp.x, y: 0, z: cp.z, vx: (ux - uz * off) * sp, vy: off * 0.6 * sp, vz: (uz + ux * off) * sp, age: 0, life: 0.6 + Math.random() * 0.6, beta: 0, ion: true });
          }
          accI = Math.min(accI, 30);
          let n = 0;
          for (let i = dust.length - 1; i >= 0; i--) {
            const p = dust[i]!;
            p.age += sdt;
            if (p.age > p.life) {
              dust[i] = dust[dust.length - 1]!;
              dust.pop();
              continue;
            }
            const r2 = p.x * p.x + p.y * p.y + p.z * p.z;
            const r3 = r2 * Math.sqrt(r2);
            const g = (1 - p.beta) / r3;
            p.vx -= p.x * g * sdt;
            p.vy -= p.y * g * sdt;
            p.vz -= p.z * g * sdt;
            p.x += p.vx * sdt;
            p.y += p.vy * sdt;
            p.z += p.vz * sdt;
          }
          for (let i = ions.length - 1; i >= 0; i--) {
            const p = ions[i]!;
            p.age += sdt;
            if (p.age > p.life) {
              ions[i] = ions[ions.length - 1]!;
              ions.pop();
              continue;
            }
            p.x += p.vx * sdt;
            p.y += p.vy * sdt;
            p.z += p.vz * sdt;
          }
          for (const p of dust) {
            const k = p.age / p.life;
            const fadeK = Math.min(1, k * 8) * (1 - k) * (1 - k);
            const sunK = 1 / Math.max(0.5, p.x * p.x + p.z * p.z);
            P.put(n++, p.x, p.y, p.z, 1.0, 0.82, 0.55, 0.22 * fadeK * sunK * (0.6 + p.beta), 0.12 + k * 0.32);
          }
          for (const p of ions) {
            const k = p.age / p.life;
            const fadeK = Math.min(1, k * 10) * (1 - k);
            P.put(n++, p.x, p.y, p.z, 0.3, 0.6, 1.0, 0.3 * fadeK, 0.07 + k * 0.12);
          }
          P.upload(n);
        },
        resize: (_w, h) => {
          S.U.uScale.value = h / 900;
          P.U.uScale.value = h / 900;
        },
        controls: [
          tog('이온 꼬리 (태양풍)', true, (v) => (ionOn = v)),
          tog('먼지 꼬리 (복사압)', true, (v) => (dustOn = v)),
          tog('궤도 선', true, (v) => (orbitLine.visible = v)),
          range('시간 빠르기', 0.2, 3, 0.05, 1, (v) => (speed = v)),
        ],
        dispose: () => {
          bin.dispose();
          S.dispose();
        },
      };
    },
  },

  /* i533 오로라 */
  i533: {
    kind: '3d',
    caption: '오로라 — 휘어진 커튼 띠에 세로 빛줄(잡음을 가로로만 읽음), 아래 가장자리는 또렷한 초록 · 위로 갈수록 붉은 보라로 옅어지고, 호수에 거꾸로 비친다',
    make(): Scene3D {
      const bin = new Bin();
      const scene = new THREE.Scene();
      const cam = new THREE.PerspectiveCamera(70, 1.6, 0.5, 2000);
      cam.position.set(0, 2.2, 0);
      cam.rotation.order = 'YXZ';
      const US = { uGlow: { value: 1 } };
      const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), new THREE.ShaderMaterial({ uniforms: US, vertexShader: DIR_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false }));
      sky.renderOrder = -3;
      scene.add(sky);
      const S = makeStars(16000, 800, 131, { magMax: 7.2, upOnly: true, tw: 0.6 });
      scene.add(S.pts);
      const world = new THREE.Group();
      scene.add(world);
      const mirror = new THREE.Group();
      mirror.scale.y = -1;
      scene.add(mirror);
      const hills = mountainRing(260, 9, 0.032, 0x020306, -1.6, 1.6, -0.3);
      world.add(hills);
      mirror.add(new THREE.Mesh(hills.geometry, hills.material));
      const pine = new THREE.MeshBasicMaterial({ color: 0x010203 });
      const r = rng(41);
      for (let i = 0; i < 22; i++) {
        const side = i % 2 ? 1 : -1;
        const x = side * (60 + r() * 70);
        const z = -150 - r() * 50;
        const h = 6 + r() * 7;
        const tree = new THREE.Group();
        for (let k = 0; k < 4; k++) {
          const c = new THREE.Mesh(new THREE.ConeGeometry(h * 0.26 * (1 - k * 0.2), h * 0.42, 7), pine);
          c.position.y = h * (0.25 + k * 0.2);
          tree.add(c);
        }
        tree.position.set(x, 0, z);
        world.add(tree);
        const tm = tree.clone();
        mirror.add(tm);
      }
      const N2 = noise2D();
      const curtains: { uTime: { value: number }; uI: { value: number }; uMove: { value: number } }[] = [];
      const CUR = [
        { z: -210, w: 420, x: 30, bot: 62, tilt: 70, h: 85, seed: 0.1, i: 1.0 },
        { z: -330, w: 380, x: -170, bot: 70, tilt: -35, h: 110, seed: 0.47, i: 0.5 },
      ];
      const ag = new THREE.PlaneGeometry(1, 1, 400, 1);
      ag.translate(0.5, 0.5, 0);
      for (const c of CUR) {
        const U = { uN2: { value: N2 }, uTime: { value: 0 }, uSeed: { value: c.seed }, uZ: { value: c.z }, uW: { value: c.w }, uX: { value: c.x }, uTilt: { value: c.tilt }, uBot: { value: c.bot }, uH: { value: c.h }, uI: { value: c.i }, uMove: { value: 1 } };
        curtains.push(U);
        const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: AUR_VS, fragmentShader: AUR_FS, side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
        const m = new THREE.Mesh(ag, mat);
        m.frustumCulled = false;
        m.renderOrder = 1;
        world.add(m);
        const mm = new THREE.Mesh(ag, mat);
        mm.frustumCulled = false;
        mirror.add(mm);
      }
      const ms = new THREE.Points(S.pts.geometry, S.pts.material);
      ms.frustumCulled = false;
      mirror.add(ms);
      const lake = new THREE.Mesh(new THREE.PlaneGeometry(900, 600), new THREE.MeshBasicMaterial({ color: 0x01030a, transparent: true, opacity: 0.5, depthWrite: false }));
      lake.rotation.x = -Math.PI / 2;
      lake.position.z = -280;
      lake.renderOrder = 4;
      scene.add(lake);
      bin.scene(scene);
      let refl = true;
      return {
        scene,
        camera: cam,
        tone: THREE.ACESFilmicToneMapping,
        update(t) {
          S.U.uTime.value = t;
          for (const c of curtains) c.uTime.value = t;
          cam.rotation.set(0.24 + Math.sin(t * 0.05) * 0.03, Math.sin(t * 0.04) * 0.15, 0);
          mirror.visible = refl;
        },
        resize: (_w, h) => (S.U.uScale.value = h / 900),
        controls: [
          range('오로라 세기', 0, 2.5, 0.05, 1, (v) => curtains.forEach((c, i) => (c.uI.value = v * CUR[i]!.i))),
          range('커튼 움직임', 0, 5, 0.1, 1, (v) => curtains.forEach((c) => (c.uMove.value = v))),
          tog('호수에 비친 모습', true, (v) => (refl = v)),
        ],
        dispose: () => {
          bin.dispose();
          S.dispose();
        },
      };
    },
  },

  /* i534 초신성 */
  i534: {
    kind: '3d',
    caption: '초신성 — 푸른 초거성이 부풀다 번쩍, 충격파 껍질(테두리가 밝은 구)과 붉은 · 청록 필라멘트가 퍼지고, 적도 고리에 구슬 빛이 켜지며 남은 펄서가 빛줄을 돌린다',
    make(): Scene3D {
      const bin = new Bin();
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000000);
      const cam = new THREE.PerspectiveCamera(45, 1.6, 0.1, 1000);
      const S = makeStars(12000, 300, 141, { magMax: 7, tw: 0.15, gain: 0.8 });
      scene.add(S.pts);
      const N3 = noise3D();
      const UE = { uN2: { value: noise2D() }, uEchoR: { value: 0 }, uEchoI: { value: 0 } };
      const echo = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShaderMaterial({ uniforms: UE, vertexShader: UV_VS, fragmentShader: ECHO_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      echo.position.z = -14;
      scene.add(echo);
      const mkShell = (inner: number): { m: THREE.Mesh; U: { uN3: { value: THREE.Data3DTexture }; uAge: { value: number }; uFil: { value: number }; uI: { value: number }; uInner: { value: number } } } => {
        const U = { uN3: { value: N3 }, uAge: { value: 0 }, uFil: { value: 1 }, uI: { value: 1 }, uInner: { value: inner } };
        const m = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.ShaderMaterial({ uniforms: U, vertexShader: SHELL_VS, fragmentShader: SHELL_FS, side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        m.renderOrder = 2;
        scene.add(m);
        return { m, U };
      };
      const outer = mkShell(0);
      const inner = mkShell(1);
      const gt = bin.add(texOf(glowCanvas()));
      const st = bin.add(texOf(spikeCanvas()));
      const star = glowSprite(st, 0xaecbff, 2.4, 1.2);
      star.renderOrder = 3;
      scene.add(star);
      const flash = glowSprite(gt, 0xeef4ff, 6, 4);
      flash.renderOrder = 4;
      scene.add(flash);
      // 적도 고리 (구슬 빛)
      const ringG = new THREE.Group();
      ringG.rotation.set(1.15, 0.3, 0);
      scene.add(ringG);
      const beads: THREE.Sprite[] = [];
      const rr = rng(9);
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * TAU + rr() * 0.12;
        const s = glowSprite(gt, 0xffd6b0, 1.6, 0.25);
        s.position.set(Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6);
        s.userData.k = rr();
        ringG.add(s);
        beads.push(s);
      }
      // 펄서 빛줄
      const pulsar = new THREE.Group();
      pulsar.rotation.z = 0.5;
      scene.add(pulsar);
      const UB = { uI: { value: 0 } };
      const cone = new THREE.ConeGeometry(0.07, 3.0, 24, 1, true);
      cone.translate(0, -1.6, 0);
      const beamMat = new THREE.ShaderMaterial({ uniforms: UB, vertexShader: UV_VS, fragmentShader: BEAM_FS, side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const spinner = new THREE.Group();
      pulsar.add(spinner);
      for (const sgn of [1, -1]) {
        const b = new THREE.Mesh(cone, beamMat);
        b.rotation.z = sgn > 0 ? Math.PI : 0;
        b.rotation.x = 0.5;
        spinner.add(b);
      }
      const ps = glowSprite(st, 0xbfe0ff, 2, 0.4);
      pulsar.add(ps);
      // 날아가는 조각
      const NP = 2600;
      const P = new Parts(NP);
      scene.add(P.pts);
      bin.add(P);
      const pv = new Float32Array(NP * 4);
      const seedParts = (): void => {
        const r = rng(Math.floor(Math.random() * 1e6));
        for (let i = 0; i < NP; i++) {
          const u = r() * 2 - 1;
          const a = r() * TAU;
          const s = Math.sqrt(1 - u * u);
          pv[i * 4] = s * Math.cos(a);
          pv[i * 4 + 1] = u;
          pv[i * 4 + 2] = s * Math.sin(a);
          pv[i * 4 + 3] = 0.55 + r() * 0.5;
        }
      };
      seedParts();
      bin.scene(scene);
      let restart = false;
      let speed = 1;
      let pulsarOn = true;
      let fil = 1;
      let last = 0;
      let tau = 0;
      return {
        scene,
        camera: cam,
        tone: THREE.ACESFilmicToneMapping,
        update(t) {
          const dt = Math.min(0.05, Math.max(0, t - last));
          last = t;
          S.U.uTime.value = t;
          tau += dt * speed;
          if (restart || tau > 13) {
            restart = false;
            tau = 0;
            seedParts();
          }
          const T0 = 2.5;
          const age = tau - T0;
          cam.position.set(Math.sin(t * 0.05) * 1.2, 0.8 + Math.sin(t * 0.04) * 0.4, 10.5);
          cam.lookAt(0, 0, 0);
          if (age < 0) {
            const k = tau / T0;
            star.visible = true;
            star.scale.setScalar(1.0 + k * 0.8 + Math.sin(tau * 9) * 0.06 * k);
            (star.material as THREE.SpriteMaterial).color.setRGB(0.68, 0.8, 1).multiplyScalar(2.4 + k * 2);
            flash.visible = false;
            outer.m.visible = inner.m.visible = false;
            pulsar.visible = false;
            UE.uEchoI.value = 0;
            beads.forEach((b) => (b.visible = false));
            P.upload(0);
            return;
          }
          star.visible = false;
          const f = Math.exp(-age * 2.2);
          flash.visible = f > 0.01;
          flash.scale.setScalar(4 + 26 * (1 - Math.exp(-age * 6)));
          (flash.material as THREE.SpriteMaterial).opacity = f;
          const R = 0.25 + 3.3 * (1 - Math.exp(-age * 0.55));
          outer.m.visible = inner.m.visible = true;
          outer.m.scale.setScalar(R);
          inner.m.scale.setScalar(R * 0.62);
          outer.m.rotation.y = age * 0.05;
          inner.m.rotation.y = -age * 0.07;
          const bright = 0.3 + 1.1 * Math.exp(-age * 0.5);
          outer.U.uI.value = bright * Math.min(1, age * 3);
          inner.U.uI.value = bright * 0.8 * Math.min(1, age * 2);
          outer.U.uAge.value = inner.U.uAge.value = age;
          outer.U.uFil.value = inner.U.uFil.value = fil;
          UE.uEchoR.value = age * 2.6;
          UE.uEchoI.value = Math.exp(-age * 0.25) * 1.2;
          // 충격파가 고리(2.6)에 닿으면 구슬이 하나씩 켜진다
          beads.forEach((b) => {
            const on = smooth(2.2, 2.7, R + (b.userData.k as number) * 0.25);
            b.visible = on > 0.01;
            (b.material as THREE.SpriteMaterial).opacity = on * (0.8 + 0.2 * Math.sin(t * 3 + (b.userData.k as number) * 20));
          });
          pulsar.visible = pulsarOn && age > 1.2;
          spinner.rotation.y = t * 9;
          UB.uI.value = Math.min(1, (age - 1.2) * 0.8) * 0.12;
          let n = 0;
          for (let i = 0; i < NP; i++) {
            const sp = pv[i * 4 + 3]!;
            const d = sp * 3.6 * (1 - Math.exp(-age * 0.6)) + 0.1;
            const k = clamp(age / 8, 0, 1);
            P.put(n++, pv[i * 4]! * d, pv[i * 4 + 1]! * d, pv[i * 4 + 2]! * d, lerp(1, 1, k), lerp(0.85, 0.35, k), lerp(0.6, 0.2, k), 0.6 * Math.exp(-age * 0.35), 0.006 + sp * 0.006);
          }
          P.upload(n);
        },
        resize: (_w, h) => {
          S.U.uScale.value = h / 900;
          P.U.uScale.value = h / 900;
        },
        controls: [
          { type: 'button', label: '다시 폭발', on: () => (restart = true) },
          range('빠르기', 0.2, 3, 0.05, 1, (v) => (speed = v)),
          range('필라멘트', 0, 2.5, 0.05, 1, (v) => (fil = v)),
          tog('펄서', true, (v) => (pulsarOn = v)),
        ],
        dispose: () => {
          bin.dispose();
          S.dispose();
        },
      };
    },
  },

  /* i535 시차 별층 (2D) */
  i535: {
    kind: '2d',
    caption: '시차 스크롤 — 멀리 있는 층(성운 · 먼 별)은 느리게, 가까운 층(밝은 별 · 먼지 · 바위)은 빠르게 지나가 깊이가 생긴다. 층 6장을 미리 그려 두고 옮기기만',
    make() {
      const layers = parallaxLayers();
      const SPEED = [0.03, 0.08, 0.17, 0.33, 0.62, 1.5];
      const NAMES = ['성운 (가장 멀다)', '먼 별', '별', '먼지 구름', '밝은 별', '바위 · 먼지 (가장 가깝다)'];
      let speed = 1;
      let parallax = true;
      let labels = false;
      let ship = true;
      let scroll = 0;
      return {
        draw(g, w, h, t, dt) {
          scroll += dt * 260 * speed;
          const s = h / 900;
          const bob = Math.sin(t * 0.5) * 30;
          g.fillStyle = '#000';
          g.fillRect(0, 0, w, h);
          for (let i = 0; i < layers.length; i++) {
            const L = layers[i]!;
            const k = parallax ? SPEED[i]! : 0.5;
            const lw = LW * s;
            const lh = LH * s;
            let x = -((scroll * k * s) % lw);
            const y = (h - lh) / 2 - bob * k * 0.4 * s;
            while (x < w) {
              g.drawImage(L, x, y, lw, lh);
              x += lw;
            }
            if (i === 4 && ship) drawShip(g, w * 0.36, h * 0.5 + Math.sin(t * 1.3) * 12 * s - bob * 0.25 * s, s * 1.3, t);
            if (labels) {
              g.font = `600 ${Math.max(11, 15 * s)}px ${FONT}`;
              g.fillStyle = 'rgba(0,0,0,0.55)';
              const txt = `${i + 1}. ${NAMES[i]} — 빠르기 ×${k}`;
              const tw = g.measureText(txt).width;
              const ly = 14 * s + i * 24 * Math.max(0.75, s);
              g.fillRect(10, ly, tw + 16, 20 * Math.max(0.75, s));
              g.fillStyle = '#e8eeff';
              g.fillText(txt, 18, ly + 15 * Math.max(0.75, s));
            }
          }
        },
        controls: [
          range('날아가는 빠르기', 0, 4, 0.05, 1, (v) => (speed = v)),
          tog('시차 (끄면 모든 층이 같은 빠르기 — 납작해 보인다)', true, (v) => (parallax = v)),
          tog('층 이름 · 빠르기 보기', false, (v) => (labels = v)),
          tog('우주선', true, (v) => (ship = v)),
        ],
      };
    },
  },
};

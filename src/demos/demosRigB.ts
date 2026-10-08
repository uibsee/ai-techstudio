import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Control, DemoMap } from './types';

/**
 * 견본 — 캐릭터 · 리깅 B (i462 ~ i467)
 * 블렌더 없이 코드로 만든 점토 토끼: 부드러운 합집합 SDF → 표면 그물(surface nets) 한 덩어리 SkinnedMesh,
 * 코드로 만든 뼈대 + 부위 · 거리 기반 스킨 가중치, 얼굴은 모프 타깃.
 */

const FONT = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const sstep = (x: number): number => {
  const k = clamp(x, 0, 1);
  return k * k * (3 - 2 * k);
};
type V3 = [number, number, number];

/* ───────────── 토끼 뼈대 ───────────── */

const BONE_DEFS: { n: string; p: string | null; at: V3 }[] = [
  { n: 'root', p: null, at: [0, 0, 0] },
  { n: 'hips', p: 'root', at: [0, 0.55, 0] },
  { n: 'spine', p: 'hips', at: [0, 0.72, 0] },
  { n: 'head', p: 'spine', at: [0, 0.97, 0] },
  { n: 'earL1', p: 'head', at: [-0.125, 1.55, -0.025] },
  { n: 'earL2', p: 'earL1', at: [-0.17, 1.81, -0.045] },
  { n: 'earR1', p: 'head', at: [0.125, 1.55, -0.025] },
  { n: 'earR2', p: 'earR1', at: [0.17, 1.81, -0.045] },
  { n: 'hair', p: 'head', at: [0, 1.61, 0.1] },
  { n: 'armL', p: 'spine', at: [-0.25, 0.77, 0.02] },
  { n: 'armR', p: 'spine', at: [0.25, 0.77, 0.02] },
  { n: 'thighL', p: 'hips', at: [-0.14, 0.47, 0] },
  { n: 'shinL', p: 'thighL', at: [-0.14, 0.29, 0] },
  { n: 'footL', p: 'shinL', at: [-0.14, 0.1, 0] },
  { n: 'thighR', p: 'hips', at: [0.14, 0.47, 0] },
  { n: 'shinR', p: 'thighR', at: [0.14, 0.29, 0] },
  { n: 'footR', p: 'shinR', at: [0.14, 0.1, 0] },
  { n: 'tail', p: 'hips', at: [0, 0.6, -0.27] },
];
const BI: Record<string, number> = {};
BONE_DEFS.forEach((d, i) => (BI[d.n] = i));
const BIND: Record<string, V3> = {};
for (const d of BONE_DEFS) BIND[d.n] = d.at;
/** 끝(자식이 없는 뼈의 끝 점) */
const TIPS: Record<string, V3> = {
  earL2: [-0.215, 2.08, -0.06],
  earR2: [0.215, 2.08, -0.06],
  hair: [0, 1.73, 0.22],
  tail: [0, 0.62, -0.42],
  armL: [-0.45, 0.6, 0.04],
  armR: [0.45, 0.6, 0.04],
  footL: [-0.14, 0.05, 0.19],
  footR: [0.14, 0.05, 0.19],
};

/* ───────────── 토끼 모양 (부드러운 합집합 SDF) ───────────── */

interface Prim {
  id: string;
  e?: { c: V3; r: V3 };
  cap?: { a: V3; b: V3; r: number; fz: number };
}
const cap = (id: string, a: V3, b: V3, r: number, fz = 1): Prim => ({ id, cap: { a, b, r, fz } });
const ell = (id: string, c: V3, r: V3): Prim => ({ id, e: { c, r } });
const PRIMS: Prim[] = [
  ell('head', [0, 1.25, 0], [0.44, 0.4, 0.4]),
  ell('body', [0, 0.68, 0], [0.3, 0.33, 0.27]),
  cap('earL', [-0.115, 1.47, -0.02], [-0.215, 2.05, -0.06], 0.09, 0.5),
  cap('earR', [0.115, 1.47, -0.02], [0.215, 2.05, -0.06], 0.09, 0.5),
  cap('armL', [-0.25, 0.77, 0.02], [-0.45, 0.6, 0.04], 0.075),
  cap('armR', [0.25, 0.77, 0.02], [0.45, 0.6, 0.04], 0.075),
  cap('legL', [-0.14, 0.46, 0], [-0.14, 0.12, 0], 0.1),
  cap('legR', [0.14, 0.46, 0], [0.14, 0.12, 0], 0.1),
  ell('footL', [-0.14, 0.075, 0.05], [0.095, 0.075, 0.15]),
  ell('footR', [0.14, 0.075, 0.05], [0.095, 0.075, 0.15]),
  ell('tail', [0, 0.62, -0.3], [0.12, 0.12, 0.12]),
  cap('hair1', [0, 1.6, 0.1], [-0.05, 1.73, 0.21], 0.042),
  cap('hair2', [0.01, 1.6, 0.1], [0.065, 1.7, 0.22], 0.034),
];
const SMK = 0.07;

/** 부위 하나까지 거리 · 캡슐이면 t(0~1) 도 */
let lastT = 0;
function primD(p: Prim, x: number, y: number, z: number): number {
  if (p.e) {
    const { c, r } = p.e;
    const qx = (x - c[0]) / r[0], qy = (y - c[1]) / r[1], qz = (z - c[2]) / r[2];
    const k0 = Math.hypot(qx, qy, qz);
    const k1 = Math.hypot(qx / r[0], qy / r[1], qz / r[2]);
    lastT = 0;
    return k1 < 1e-6 ? -Math.min(r[0], r[1], r[2]) : (k0 * (k0 - 1)) / k1;
  }
  const { a, b, r, fz } = p.cap!;
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  const qx = x - a[0], qy = y - a[1], qz = z - a[2];
  const h = clamp((qx * bx + qy * by + qz * bz) / (bx * bx + by * by + bz * bz), 0, 1);
  lastT = h;
  const ox = qx - bx * h, oy = qy - by * h, oz = (qz - bz * h) / fz;
  const d = Math.hypot(ox, oy, oz) - r;
  return fz < 1 ? d * 0.75 : d;
}
function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
function bunnySdf(x: number, y: number, z: number): number {
  let d = 1e9;
  for (const p of PRIMS) d = smin(d, primD(p, x, y, z), SMK);
  return d;
}
function sdfGrad(x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
  const e = 0.002;
  return out
    .set(
      bunnySdf(x + e, y, z) - bunnySdf(x - e, y, z),
      bunnySdf(x, y + e, z) - bunnySdf(x, y - e, z),
      bunnySdf(x, y, z + e) - bunnySdf(x, y, z - e),
    )
    .multiplyScalar(1 / (2 * e));
}

/** 부위별 뼈 가중치 */
function primSkin(id: string, y: number, t: number): [string, number][] {
  const s = id.endsWith('L') ? 'L' : id.endsWith('R') ? 'R' : '';
  switch (id) {
    case 'head':
      return [['head', 1]];
    case 'body': {
      const k = sstep((y - 0.6) / 0.2);
      return [['hips', 1 - k], ['spine', k]];
    }
    case 'earL':
    case 'earR': {
      const wh = 1 - sstep((t - 0.04) / 0.12);
      const k2 = sstep((t - 0.46) / 0.2);
      return [['head', wh], ['ear' + s + '1', (1 - wh) * (1 - k2)], ['ear' + s + '2', (1 - wh) * k2]];
    }
    case 'armL':
    case 'armR': {
      const ws = 1 - sstep(t / 0.3);
      return [['spine', ws * 0.6], ['arm' + s, 1 - ws * 0.6]];
    }
    case 'legL':
    case 'legR': {
      const k = sstep((t - 0.38) / 0.24);
      const wh = (1 - sstep(t / 0.18)) * 0.5;
      return [['hips', wh], ['thigh' + s, (1 - wh) * (1 - k)], ['shin' + s, (1 - wh) * k]];
    }
    case 'footL':
    case 'footR': {
      const k = sstep((y - 0.1) / 0.06);
      return [['foot' + s, 1 - k], ['shin' + s, k]];
    }
    case 'tail':
      return [['tail', 1]];
    default: {
      const wh = 1 - sstep(t / 0.35);
      return [['head', wh], ['hair', 1 - wh]];
    }
  }
}

const COL = {
  fur: new THREE.Color('#f5e3d3'),
  white: new THREE.Color('#fffaf5'),
  pink: new THREE.Color('#f6a3b6'),
  pad: new THREE.Color('#f2a7b8'),
};
function primColor(p: Prim, x: number, y: number, z: number, t: number, out: THREE.Color): THREE.Color {
  out.copy(COL.fur);
  if (p.id === 'tail') out.copy(COL.white);
  else if (p.id === 'head') {
    // 주둥이 둘레 흰 털
    const m = sstep((z - 0.27) / 0.06) * (1 - sstep((Math.abs(x) - 0.15) / 0.06)) * (1 - sstep((y - 1.2) / 0.05));
    out.lerp(COL.white, m);
  } else if (p.id === 'body') {
    out.lerp(COL.white, sstep((z - 0.13) / 0.07) * (1 - sstep((y - 0.86) / 0.06)));
  } else if (p.id === 'earL' || p.id === 'earR') {
    const c = p.cap!;
    const ax = lerp(c.a[0], c.b[0], t), az = lerp(c.a[2], c.b[2], t);
    const front = sstep((z - az - 0.018) / 0.014);
    const mid = 1 - sstep((Math.abs(x - ax) - 0.045) / 0.02);
    const along = sstep((t - 0.1) / 0.1) * (1 - sstep((t - 0.9) / 0.08));
    out.lerp(COL.pink, front * mid * along);
  } else if (p.id === 'footL' || p.id === 'footR') {
    out.lerp(COL.pad, 1 - sstep((y - 0.012) / 0.02));
  }
  return out;
}

interface BunnyData {
  pos: Float32Array;
  nrm: Float32Array;
  col: Float32Array;
  si: Uint16Array;
  sw: Float32Array;
  idx: Uint32Array;
}
let BUNNY: BunnyData | null = null;
/** 표면 그물(naive surface nets) — 한 번만, 조금씩 나눠 만들어 모듈에 둔다 (진행률을 yield) */
function* bunnyGen(): Generator<number, void, void> {
  const cs = 0.024, ox = -0.62, oy = -0.06, oz = -0.5;
  const nx = 52, ny = 94, nz = 42;
  const NX = nx + 1, NY = ny + 1;
  const F = new Float32Array(NX * NY * (nz + 1));
  const fi = (i: number, j: number, k: number): number => i + NX * (j + NY * k);
  for (let k = 0; k <= nz; k++)
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i <= nx; i++) F[fi(i, j, k)] = bunnySdf(ox + i * cs, oy + j * cs, oz + k * cs);
      yield (0.45 * (k * (ny + 1) + j)) / ((nz + 1) * (ny + 1));
    }
  const cellV = new Int32Array(nx * ny * nz).fill(-1);
  const ci = (i: number, j: number, k: number): number => i + nx * (j + ny * k);
  const P: number[] = [];
  const cv = new Float32Array(8);
  const EDGES = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7];
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++, j % 16 || (yield 0.45))
      for (let i = 0; i < nx; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const v = F[fi(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))]!;
          cv[c] = v;
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (let e = 0; e < 24; e += 2) {
          const a = EDGES[e]!, b = EDGES[e + 1]!;
          const va = cv[a]!, vb = cv[b]!;
          if (va < 0 === vb < 0) continue;
          const tt = va / (va - vb);
          sx += (a & 1) + ((b & 1) - (a & 1)) * tt;
          sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * tt;
          sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * tt;
          n++;
        }
        cellV[ci(i, j, k)] = P.length / 3;
        P.push(ox + (i + sx / n) * cs, oy + (j + sy / n) * cs, oz + (k + sz / n) * cs);
      }
  const I: number[] = [];
  const pa = new THREE.Vector3(), pb = new THREE.Vector3(), pc = new THREE.Vector3();
  const quad = (q: number[], dx: number, dy: number, dz: number): void => {
    const [a, b, c, d] = q as [number, number, number, number];
    pa.fromArray(P, a * 3);
    pc.fromArray(P, c * 3).sub(pa);
    pb.fromArray(P, d * 3).sub(pa.fromArray(P, b * 3));
    pa.fromArray(P, a * 3);
    const n = pc.cross(pb);
    if (n.x * dx + n.y * dy + n.z * dz >= 0) I.push(a, b, c, a, c, d);
    else I.push(a, c, b, a, d, c);
  };
  for (let k = 1; k < nz; k++, yield 0.5)
    for (let j = 1; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const a = F[fi(i, j, k)]!, b = F[fi(i + 1, j, k)]!;
        if (a < 0 === b < 0) continue;
        quad([cellV[ci(i, j - 1, k - 1)]!, cellV[ci(i, j, k - 1)]!, cellV[ci(i, j, k)]!, cellV[ci(i, j - 1, k)]!], a < 0 ? 1 : -1, 0, 0);
      }
  for (let k = 1; k < nz; k++, yield 0.5)
    for (let j = 0; j < ny; j++)
      for (let i = 1; i < nx; i++) {
        const a = F[fi(i, j, k)]!, b = F[fi(i, j + 1, k)]!;
        if (a < 0 === b < 0) continue;
        quad([cellV[ci(i - 1, j, k - 1)]!, cellV[ci(i, j, k - 1)]!, cellV[ci(i, j, k)]!, cellV[ci(i - 1, j, k)]!], 0, a < 0 ? 1 : -1, 0);
      }
  for (let k = 0; k < nz; k++, yield 0.5)
    for (let j = 1; j < ny; j++)
      for (let i = 1; i < nx; i++) {
        const a = F[fi(i, j, k)]!, b = F[fi(i, j, k + 1)]!;
        if (a < 0 === b < 0) continue;
        quad([cellV[ci(i - 1, j - 1, k)]!, cellV[ci(i, j - 1, k)]!, cellV[ci(i, j, k)]!, cellV[ci(i - 1, j, k)]!], 0, 0, a < 0 ? 1 : -1);
      }
  const nv = P.length / 3;
  const pos = new Float32Array(P);
  const nrm = new Float32Array(nv * 3);
  const col = new Float32Array(nv * 3);
  const si = new Uint16Array(nv * 4);
  const sw = new Float32Array(nv * 4);
  const g = new THREE.Vector3();
  const cc = new THREE.Color(), acc = new THREE.Color();
  const dist = new Float32Array(PRIMS.length), ts = new Float32Array(PRIMS.length);
  for (let v = 0; v < nv; v++) {
    if (v % 12 === 0) yield 0.5 + (0.42 * v) / nv;
    let x = pos[v * 3]!, y = pos[v * 3 + 1]!, z = pos[v * 3 + 2]!;
    for (let it = 0; it < 3; it++) {
      const d = bunnySdf(x, y, z);
      sdfGrad(x, y, z, g);
      const l2 = Math.max(1e-6, g.lengthSq());
      x -= (d * g.x) / l2;
      y -= (d * g.y) / l2;
      z -= (d * g.z) / l2;
    }
    pos[v * 3] = x;
    pos[v * 3 + 1] = y;
    pos[v * 3 + 2] = z;
    sdfGrad(x, y, z, g).normalize();
    nrm[v * 3] = g.x;
    nrm[v * 3 + 1] = g.y;
    nrm[v * 3 + 2] = g.z;
    let dmin = 1e9;
    PRIMS.forEach((p, i) => {
      dist[i] = primD(p, x, y, z);
      ts[i] = lastT;
      dmin = Math.min(dmin, dist[i]!);
    });
    const bw = new Float32Array(BONE_DEFS.length);
    acc.setRGB(0, 0, 0);
    let wsum = 0;
    PRIMS.forEach((p, i) => {
      const dd = dist[i]! - dmin;
      if (dd > 0.12) return;
      const w = Math.exp(-dd / 0.022);
      wsum += w;
      for (const [bn, bwt] of primSkin(p.id, y, ts[i]!)) bw[BI[bn]!]! += w * bwt;
      primColor(p, x, y, z, ts[i]!, cc);
      acc.r += cc.r * w;
      acc.g += cc.g * w;
      acc.b += cc.b * w;
    });
    col[v * 3] = acc.r / wsum;
    col[v * 3 + 1] = acc.g / wsum;
    col[v * 3 + 2] = acc.b / wsum;
    const order = Array.from(bw.keys()).sort((a, b) => bw[b]! - bw[a]!).slice(0, 4);
    let tot = 0;
    for (const o of order) tot += bw[o]!;
    order.forEach((o, q) => {
      si[v * 4 + q] = o;
      sw[v * 4 + q] = tot > 0 ? bw[o]! / tot : q === 0 ? 1 : 0;
    });
  }
  BUNNY = { pos, nrm, col, si, sw, idx: new Uint32Array(I) };
}

/* ───────────── 얼굴 (모프 타깃) ───────────── */

const HEAD_C = 1.25;
const HEAD_BONE_Y = 0.97;
const _g = new THREE.Vector3();
/** 얼굴 좌표 (u, v = 머리 가운데 기준) → 머리 표면 점 (머리 뼈 기준) + 법선 */
function faceProj(u: number, v: number, off: number, n?: THREE.Vector3): THREE.Vector3 {
  const ez = 0.4 * Math.sqrt(Math.max(0.02, 1 - (u / 0.44) ** 2 - (v / 0.4) ** 2));
  const dir = new THREE.Vector3(u, v, ez).normalize();
  let lo = 0.1, hi = 0.7;
  for (let i = 0; i < 22; i++) {
    const m = (lo + hi) / 2;
    if (bunnySdf(dir.x * m, HEAD_C + dir.y * m, dir.z * m) < 0) lo = m;
    else hi = m;
  }
  const p = new THREE.Vector3(dir.x * lo, HEAD_C + dir.y * lo, dir.z * lo);
  sdfGrad(p.x, p.y, p.z, _g).normalize();
  if (n) n.copy(_g);
  p.addScaledVector(_g, off);
  p.y -= HEAD_BONE_Y;
  return p;
}
interface Shape {
  cx: number;
  cy: number;
  w: number;
  top(x: number): number;
  bot(x: number): number;
}
interface Strip {
  pos: Float32Array;
  nrm: Float32Array;
  idx: number[];
  morph: Float32Array[];
}
/** 위 · 아래 테를 짝지은 띠 — 7개 모양(기본 + 6 표정)이 같은 꼭짓점 수. 모양마다 yield */
function* stripGen(shapes: Shape[], M: number, off: number, out: Strip[]): Generator<number, void, void> {
  const nn = new THREE.Vector3();
  const build = (sh: Shape, nrm?: number[]): Float32Array => {
    const o: number[] = [];
    for (let i = 0; i <= M; i++) {
      const xn = -Math.cos((Math.PI * i) / M);
      const x = sh.cx + sh.w * xn;
      for (const yy of [sh.top(xn), sh.bot(xn)]) {
        const p = faceProj(x, sh.cy + yy, off, nn);
        o.push(p.x, p.y, p.z);
        nrm?.push(nn.x, nn.y, nn.z);
      }
    }
    return new Float32Array(o);
  };
  const nrm: number[] = [];
  const pos = build(shapes[0]!, nrm);
  yield 0;
  const morph: Float32Array[] = [];
  for (const sh of shapes.slice(1)) {
    morph.push(build(sh));
    yield 0;
  }
  const idx: number[] = [];
  for (let i = 0; i < M; i++) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
  out.push({ pos, nrm: new Float32Array(nrm), idx, morph });
}
function stripGeo(st: Strip): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(st.pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(st.nrm, 3));
  geo.setIndex(st.idx);
  geo.morphAttributes.position = st.morph.map((m, k) => {
    const a = new THREE.BufferAttribute(m, 3);
    a.name = EXPR[k]!;
    return a;
  });
  return geo;
}
interface FaceData {
  strips: Strip[];
  /** 눈 반짝 (위치 · 법선 · 크기), 코, 볼 */
  hl: [THREE.Vector3, THREE.Vector3, number][];
  nose: [THREE.Vector3, THREE.Vector3];
  cheeks: [THREE.Vector3, THREE.Vector3][];
}
let FACE: FaceData | null = null;
function* faceGen(): Generator<number, void, void> {
  const strips: Strip[] = [];
  yield* stripGen(eyeShapes(-0.155), 14, 0.004, strips);
  yield* stripGen(eyeShapes(0.155), 14, 0.004, strips);
  yield* stripGen(browShapes(-0.16), 9, 0.004, strips);
  yield* stripGen(browShapes(0.16), 9, 0.004, strips);
  yield* stripGen(mouthShapes(), 14, 0.004, strips);
  yield* stripGen(tongueShapes(), 10, 0.007, strips);
  const at = (u: number, v: number, off: number): [THREE.Vector3, THREE.Vector3] => {
    const n = new THREE.Vector3();
    return [faceProj(u, v, off, n), n];
  };
  const hl: [THREE.Vector3, THREE.Vector3, number][] = [];
  for (const cx of [-0.155, 0.155])
    for (const [dx, dy, r] of [[0.018, 0.028, 0.017], [-0.016, -0.022, 0.008]] as V3[]) hl.push([...at(cx + dx, dy, 0.009), r]);
  FACE = { strips, hl, nose: at(0, -0.085, 0), cheeks: [at(-0.265, -0.11, 0.006), at(0.265, -0.11, 0.006)] };
}
/** 살을 붙였지만 셰이더 준비를 기다리는 토끼 */
const SHOW_WAIT = new Set<Bunny>();
/** 토끼 만들기 일 — 모든 견본이 함께 쓴다 */
let JOB: Generator<number, void, void> | null = null;
let JOB_P = 0;
let JOB_WIN = 0, JOB_SPENT = 0;
function* bunnyJob(): Generator<number, void, void> {
  yield* bunnyGen();
  for (const g = faceGen(); !g.next().done; ) yield 0.95;
}
function bunnyReady(): boolean {
  return !!(BUNNY && FACE);
}
/** 여러 카드가 불러도 16ms 창마다 합쳐 budget ms 까지만 */
function pumpBunny(budget = 3): void {
  if (bunnyReady()) return;
  const now = performance.now();
  if (now - JOB_WIN > 16) {
    JOB_WIN = now;
    JOB_SPENT = 0;
  }
  const left = budget - JOB_SPENT;
  if (left <= 0) return;
  if (!JOB) JOB = bunnyJob();
  const t0 = performance.now();
  while (performance.now() - t0 < left) {
    const r = JOB.next();
    if (r.done) break;
    JOB_P = r.value;
  }
  JOB_SPENT += performance.now() - t0;
}
/** 표정 이름 (모프 순서) */
const EXPR = ['blink', 'smile', 'surprise', 'angry', 'talkA', 'talkO'];
const EXPR_KO = ['깜빡', '웃음', '놀람', '화남', '아', '오'];
const ell2 = (cx: number, cy: number, w: number, h: number, dy = 0): Shape => ({ cx, cy, w, top: (x) => dy + h * Math.sqrt(1 - x * x), bot: (x) => dy - h * Math.sqrt(1 - x * x) });
const band = (cx: number, cy: number, w: number, c: (x: number) => number, th: number): Shape => ({
  cx,
  cy,
  w,
  top: (x) => c(x) + th * (0.35 + 0.65 * Math.sqrt(1 - x * x)),
  bot: (x) => c(x) - th * (0.35 + 0.65 * Math.sqrt(1 - x * x)),
});
function eyeShapes(cx: number): Shape[] {
  const ins = cx < 0 ? 1 : -1;
  const open = ell2(cx, 0, 0.056, 0.07);
  return [
    open,
    band(cx, 0, 0.062, (x) => -0.02 + 0.018 * x * x, 0.009),
    band(cx, 0, 0.062, (x) => 0.022 - 0.034 * x * x, 0.009),
    ell2(cx, 0.01, 0.066, 0.086),
    { cx, cy: 0, w: 0.058, top: (x) => Math.min(0.07 * Math.sqrt(1 - x * x), 0.028 - 0.04 * x * ins), bot: (x) => -0.066 * Math.sqrt(1 - x * x) },
    open,
    open,
  ];
}
function browShapes(cx: number): Shape[] {
  const ins = cx < 0 ? 1 : -1;
  const b = (c: (x: number) => number, dx = 0): Shape => band(cx + dx, 0.128, 0.046, c, 0.011);
  const base = b((x) => 0.006 * (1 - x * x));
  return [base, b((x) => -0.01 + 0.006 * (1 - x * x)), b((x) => 0.018 + 0.012 * (1 - x * x)), b((x) => 0.046 + 0.016 * (1 - x * x)), b((x) => -0.008 - 0.028 * x * ins, ins * 0.01), base, base];
}
function mouthShapes(): Shape[] {
  const cy = -0.14;
  const e = (x: number): number => Math.sqrt(1 - x * x);
  return [
    band(0, cy, 0.045, (x) => 0.014 * x * x - 0.006, 0.0055),
    band(0, cy, 0.045, (x) => 0.014 * x * x - 0.006, 0.0055),
    { cx: 0, cy, w: 0.07, top: (x) => 0.012 + 0.01 * x * x, bot: (x) => 0.012 - 0.062 * e(x) },
    ell2(0, cy, 0.032, 0.038, -0.018),
    { cx: 0, cy, w: 0.05, top: (x) => 0.004 - 0.022 * x * x + 0.004 * e(x), bot: (x) => 0.004 - 0.022 * x * x - 0.012 * e(x) - 0.002 },
    { cx: 0, cy, w: 0.048, top: (x) => 0.004 + 0.02 * e(x), bot: (x) => 0.004 - 0.065 * e(x) },
    { cx: 0, cy, w: 0.03, top: (x) => -0.008 + 0.03 * e(x), bot: (x) => -0.008 - 0.038 * e(x) },
  ];
}
function tongueShapes(): Shape[] {
  const cy = -0.14;
  const none = ell2(0, cy - 0.01, 0.002, 0.001);
  return [none, none, ell2(0, cy, 0.034, 0.015, -0.03), ell2(0, cy, 0.02, 0.011, -0.04), none, ell2(0, cy, 0.03, 0.015, -0.042), ell2(0, cy, 0.016, 0.012, -0.03)];
}

/* ───────────── 토끼 만들기 ───────────── */

interface Bunny {
  group: THREE.Group;
  /** 살 (만들기 일이 끝나기 전엔 null) */
  mesh: THREE.SkinnedMesh | null;
  b: Record<string, THREE.Bone>;
  /** 표정 6개 비율 */
  expr: number[];
  applyFace(): void;
  dispose(): void;
}
function makeBunny(tint = 0xffffff): Bunny {
  // 뼈대는 바로 (견본이 곧장 움직일 수 있게), 살 · 얼굴은 토끼 만들기 일이 끝나면 끼운다
  const b: Record<string, THREE.Bone> = {};
  const list: THREE.Bone[] = [];
  const inv: THREE.Matrix4[] = [];
  for (const bd of BONE_DEFS) {
    const bone = new THREE.Bone();
    bone.name = bd.n;
    const pp = bd.p ? BIND[bd.p]! : ([0, 0, 0] as V3);
    bone.position.set(bd.at[0] - pp[0], bd.at[1] - pp[1], bd.at[2] - pp[2]);
    if (bd.p) b[bd.p]!.add(bone);
    b[bd.n] = bone;
    list.push(bone);
    inv.push(new THREE.Matrix4().makeTranslation(-bd.at[0], -bd.at[1], -bd.at[2]));
  }
  const group = new THREE.Group();
  const holder = new THREE.Group(); // 살이 붙기 전 뼈를 담아 둔다
  holder.add(b.root!);
  group.add(holder);
  const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, color: tint, roughness: 0.58, sheen: 0.6, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ffe6dc') });
  const faceMats: THREE.Material[] = [mat];
  const fm = (c: string, rough: number): THREE.MeshStandardMaterial => {
    const m = new THREE.MeshStandardMaterial({ color: c, roughness: rough, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    faceMats.push(m);
    return m;
  };
  const hlM = new THREE.MeshBasicMaterial({ color: 0xffffff });
  faceMats.push(hlM);
  let blushM: THREE.MeshBasicMaterial | null = null;
  const geos: THREE.BufferGeometry[] = [];
  const texs: THREE.Texture[] = [];
  const morphs: THREE.Mesh[] = [];
  const hls: THREE.Mesh[] = [];
  let mesh: THREE.SkinnedMesh | null = null;
  const zAxis = new THREE.Vector3(0, 0, 1);
  const finish = (): void => {
    const d = BUNNY!, F = FACE!;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(d.nrm, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(d.col, 3));
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(d.si, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(d.sw, 4));
    geo.setIndex(new THREE.BufferAttribute(d.idx, 1));
    geos.push(geo);
    const sm = new THREE.SkinnedMesh(geo, mat);
    sm.castShadow = true;
    // 첫 그리기 때 뼈를 적용해 경계 구를 계산하지 않게 (10ms) 미리 넣는다
    sm.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.05, 0), 1.6);
    sm.boundingBox = new THREE.Box3(new THREE.Vector3(-1, -0.6, -1), new THREE.Vector3(1, 2.7, 1));
    sm.frustumCulled = false;
    holder.remove(b.root!);
    sm.add(b.root!);
    // 뼈가 이미 움직이고 있어도 되게 — 쉬는 자세 역행렬을 직접 준다
    sm.bind(new THREE.Skeleton(list, inv), new THREE.Matrix4());
    group.add(sm);
    mesh = sm;
    bunny.mesh = sm;
    const head = b.head!;
    const ms = [fm('#2a1c1f', 0.18), fm('#2a1c1f', 0.18), fm('#7a5246', 0.7), fm('#7a5246', 0.7), fm('#5e2633', 0.45), fm('#ec7f93', 0.4)];
    F.strips.forEach((st, i) => {
      const g = stripGeo(st);
      geos.push(g);
      const me = new THREE.Mesh(g, ms[i]!);
      me.updateMorphTargets();
      head.add(me);
      morphs.push(me);
    });
    const disc = new THREE.CircleGeometry(1, 16);
    geos.push(disc);
    for (const [p, n, r] of F.hl) {
      const m = new THREE.Mesh(disc, hlM);
      m.position.copy(p);
      m.quaternion.setFromUnitVectors(zAxis, n);
      m.scale.setScalar(r);
      m.userData.r = r;
      head.add(m);
      hls.push(m);
    }
    const sg = new THREE.SphereGeometry(1, 16, 12);
    geos.push(sg);
    const nose = new THREE.Mesh(sg, fm('#f08aa0', 0.35));
    nose.position.copy(F.nose[0]);
    nose.quaternion.setFromUnitVectors(zAxis, F.nose[1]);
    nose.scale.set(0.032, 0.022, 0.018);
    head.add(nose);
    const blushC = document.createElement('canvas');
    blushC.width = blushC.height = 64;
    const bg = blushC.getContext('2d')!;
    const gr = bg.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,140,165,0.9)');
    gr.addColorStop(1, 'rgba(255,140,165,0)');
    bg.fillStyle = gr;
    bg.fillRect(0, 0, 64, 64);
    const blushT = new THREE.CanvasTexture(blushC);
    blushT.colorSpace = THREE.SRGBColorSpace;
    texs.push(blushT);
    blushM = new THREE.MeshBasicMaterial({ map: blushT, transparent: true, depthWrite: false, opacity: 0.55 });
    faceMats.push(blushM);
    for (const [p, n] of F.cheeks) {
      const m = new THREE.Mesh(disc, blushM);
      m.position.copy(p);
      m.quaternion.setFromUnitVectors(zAxis, n);
      m.scale.set(0.085, 0.06, 1);
      head.add(m);
    }
    // 셰이더는 compileAsync 로 미리 (안 막히게) — 끝나면 보인다
    sm.visible = false;
    SHOW_WAIT.add(bunny);
  };
  const expr = [0, 0, 0, 0, 0, 0];
  const bunny: Bunny = {
    group,
    mesh: null,
    b,
    expr,
    applyFace() {
      if (!mesh) {
        if (!bunnyReady()) return;
        finish();
      }
      for (const m of morphs) for (let i = 0; i < 6; i++) m.morphTargetInfluences![i] = expr[i]!;
      const open = clamp(1 - expr[0]! - expr[1]!, 0, 1);
      for (const h of hls) h.scale.setScalar(h.userData.r * open + 1e-5);
      if (blushM) blushM.opacity = 0.5 + 0.4 * expr[1]! - 0.2 * expr[3]!;
    },
    dispose() {
      SHOW_WAIT.delete(bunny);
      for (const g of geos) g.dispose();
      for (const t of texs) t.dispose();
      for (const m of faceMats) m.dispose();
      (mesh as THREE.SkinnedMesh | null)?.skeleton.dispose();
    },
  };
  return bunny;
}

/* ───────────── 무대 · 그림자 · HUD ───────────── */

const _cc = new THREE.Color();
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
interface Stage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  hud: Hud;
  /** 늦게 붙는 물체: 셰이더를 비동기로 준비한 뒤 보이게 */
  reveal(o: THREE.Object3D): void;
  render(r: THREE.WebGLRenderer, w: number, h: number): void;
  disposeAll(): void;
}
function makeStage(cam: V3, look: V3, fov = 32, bg: [string, string] = ['#2f3f6b', '#141b31'], bunny = true): Stage {
  const scene = new THREE.Scene();
  const bgT = gradTex(bg[0], bg[1]);
  scene.background = bgT;
  const camera = new THREE.PerspectiveCamera(fov, 1.6, 0.05, 80);
  camera.position.set(...cam);
  camera.lookAt(...look);
  const hemi = new THREE.HemisphereLight(0xe2ebff, 0x5b4a62, 1.2);
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.3);
  sun.position.set(2.5, 5, 3.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -3.4;
  sc.right = sc.top = 3.4;
  sc.near = 0.5;
  sc.far = 16;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 4;
  const rim = new THREE.DirectionalLight(0xa9c8ff, 1.0);
  rim.position.set(-3, 2.5, -3);
  scene.add(hemi, sun, sun.target, rim);
  const hud = new Hud();
  let compiling = false, warm = false, ready = false;
  const revealQ: THREE.Object3D[] = [];
  const inScene = (o: THREE.Object3D): boolean => {
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === scene) return true;
    return false;
  };
  // 점토 토끼를 조금씩 만드는 동안 알림
  const wait = bunny && !bunnyReady() ? hud.add(150, 24, 'free', (g, w, h) => {
    plate(g, w, h);
    txt(g, '점토 토끼 만드는 중 ' + Math.round(JOB_P * 100) + '%', w / 2, h / 2 + 0.5, 9.5, '#fff', 'center', 800);
  }, 0.1) : null;
  if (wait) {
    wait.fx = 0.5;
    wait.fy = 0.45;
  }
  return {
    scene,
    camera,
    sun,
    hud,
    reveal(o) {
      o.visible = false;
      revealQ.push(o);
    },
    render(r, w, h) {
      if (bunny) pumpBunny();
      const en = r.shadowMap.enabled, ty = r.shadowMap.type;
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFShadowMap;
      // 셰이더 오류 검사(getProgramInfoLog)는 GPU 를 기다리게 해 첫 그리기를 50ms 넘게 막는다 — 미리 compileAsync 로 준비한 셰이더라 끈다
      const chk = r.debug.checkShaderErrors;
      r.debug.checkShaderErrors = false;
      if (!warm) {
        // 첫 프레임: 셰이더를 비동기로 준비하는 동안은 바탕만
        warm = true;
        const done = (): void => {
          ready = true;
        };
        Promise.all([r.compileAsync(scene, camera), r.compileAsync(hud.scene, hud.cam)]).then(done, done);
      } else if (ready && !compiling) {
        const mine = [...SHOW_WAIT].filter((b) => inScene(b.group));
        const objs = revealQ.splice(0);
        if (mine.length || objs.length) {
          compiling = true;
          const show = (): void => {
            for (const b of mine) {
              if (b.mesh) b.mesh.visible = true;
              SHOW_WAIT.delete(b);
            }
            for (const o of objs) o.visible = true;
            compiling = false;
          };
          r.compileAsync(scene, camera).then(show, show);
        }
      }
      if (ready) r.render(scene, camera);
      else {
        r.getClearColor(_cc);
        const ca = r.getClearAlpha();
        r.setClearColor(bg[1], 1);
        r.clear();
        r.setClearColor(_cc, ca);
      }
      r.shadowMap.enabled = en;
      r.shadowMap.type = ty;
      if (wait) wait.show = !bunnyReady() || compiling;
      if (ready) hud.render(r, w, h);
      r.debug.checkShaderErrors = chk;
    },
    disposeAll() {
      disposeTree(scene);
      bgT.dispose();
      hud.dispose();
    },
  };
}
function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if ((m as unknown as THREE.SkinnedMesh).isSkinnedMesh) return; // 토끼는 제 dispose 로
    if (m.geometry) m.geometry.dispose();
    const mats = (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) as THREE.Material[];
    for (const mt of mats) {
      for (const v of Object.values(mt)) if (v && (v as THREE.Texture).isTexture) (v as THREE.Texture).dispose();
      mt.dispose();
    }
  });
}
/** 둥근 받침 (위는 잔디빛, 옆은 흙) */
function pedestal(r: number, top: string, side: string): THREE.Group {
  const g = new THREE.Group();
  const s = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r * 0.94, 0.3, 64), new THREE.MeshStandardMaterial({ color: side, roughness: 0.9 }));
  s.position.y = -0.17;
  const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.02, 0.06, 64), new THREE.MeshStandardMaterial({ color: top, roughness: 0.85 }));
  t.position.y = -0.03;
  s.receiveShadow = t.receiveShadow = true;
  g.add(s, t);
  return g;
}

type Anchor = 'tl' | 'tr' | 'bl' | 'br' | 'free';
interface Panel {
  lw: number;
  lh: number;
  anchor: Anchor;
  draw: (g: CanvasRenderingContext2D, lw: number, lh: number) => void;
  every: number;
  last: number;
  c: HTMLCanvasElement;
  tex: THREE.CanvasTexture;
  mesh: THREE.Mesh;
  /** free: 화면 비율 위치 (0~1, 아래 왼쪽 0) — 판의 아래 가운데 */
  fx: number;
  fy: number;
  show: boolean;
}
const RES = 3;
class Hud {
  scene = new THREE.Scene();
  cam = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10);
  geo = new THREE.PlaneGeometry(1, 1);
  panels: Panel[] = [];
  add(lw: number, lh: number, anchor: Anchor, draw: Panel['draw'], every = 0.12): Panel {
    const c = document.createElement('canvas');
    c.width = lw * RES;
    c.height = lh * RES;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthTest: false }));
    this.scene.add(mesh);
    const p: Panel = { lw, lh, anchor, draw, every, last: -1, c, tex, mesh, fx: 0.5, fy: 0.5, show: true };
    this.panels.push(p);
    return p;
  }
  render(r: THREE.WebGLRenderer, w: number, h: number): void {
    if (!this.panels.length) return;
    this.cam.right = w;
    this.cam.top = h;
    this.cam.updateProjectionMatrix();
    const s = Math.pow(Math.min(w / 280, h / 175), 0.62);
    const m = 7 * s;
    const now = performance.now() / 1000;
    for (const p of this.panels) {
      p.mesh.visible = p.show;
      if (!p.show) continue;
      if (now - p.last >= p.every) {
        p.last = now;
        const g = p.c.getContext('2d')!;
        g.setTransform(RES, 0, 0, RES, 0, 0);
        g.clearRect(0, 0, p.lw, p.lh);
        p.draw(g, p.lw, p.lh);
        p.tex.needsUpdate = true;
      }
      const W = p.lw * s, H = p.lh * s;
      p.mesh.scale.set(W, H, 1);
      const x = p.anchor === 'tl' || p.anchor === 'bl' ? m + W / 2 : p.anchor === 'free' ? p.fx * w : w - m - W / 2;
      const y = p.anchor === 'tl' || p.anchor === 'tr' ? h - m - H / 2 : p.anchor === 'free' ? p.fy * h + H / 2 : m + H / 2;
      p.mesh.position.set(Math.round(x), Math.round(y), 0);
    }
    r.autoClear = false;
    r.clearDepth();
    r.render(this.scene, this.cam);
    r.autoClear = true;
  }
  dispose(): void {
    for (const p of this.panels) {
      p.tex.dispose();
      (p.mesh.material as THREE.Material).dispose();
    }
    this.geo.dispose();
  }
}
function plate(g: CanvasRenderingContext2D, w: number, h: number, fill = 'rgba(12,16,34,0.74)'): void {
  g.fillStyle = fill;
  g.beginPath();
  g.roundRect(0.5, 0.5, w - 1, h - 1, Math.min(8, h / 2));
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.14)';
  g.lineWidth = 1;
  g.stroke();
}
function txt(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color = '#fff', align: CanvasTextAlign = 'left', weight = 700): void {
  g.font = `${weight} ${size}px ${FONT}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(s, x, y);
}
function bar(g: CanvasRenderingContext2D, label: string, v: number, x: number, y: number, w: number, color: string, lw = 26): void {
  txt(g, label, x, y, 8, '#dfe6ff', 'left', 700);
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.beginPath();
  g.roundRect(x + lw, y - 3.5, w - lw - 22, 7, 3.5);
  g.fill();
  g.fillStyle = color;
  g.beginPath();
  g.roundRect(x + lw, y - 3.5, Math.max(7, (w - lw - 22) * clamp(v, 0, 1)), 7, 3.5);
  g.fill();
  txt(g, Math.round(v * 100) + '%', x + w, y, 7.5, '#ffffffcc', 'right', 600);
}
/** 머리 위에 띄울 위치 → 패널 fx, fy */
function pinTo(p: Panel, wp: THREE.Vector3, cam: THREE.Camera): void {
  const v = wp.clone().project(cam);
  p.fx = (v.x + 1) / 2;
  p.fy = (v.y + 1) / 2;
}

/* ───────────── 흔들리는 뼈 (스프링 · 감쇠) ───────────── */

interface SpringItem {
  bone: THREE.Bone;
  tipL: THREE.Vector3;
  tip: THREE.Vector3;
  prev: THREE.Vector3;
  init: boolean;
  k: number;
}
const _h = new THREE.Vector3(), _r = new THREE.Vector3(), _d = new THREE.Vector3(), _v = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qw = new THREE.Quaternion(), _qp = new THREE.Quaternion();
class Springs {
  items: SpringItem[] = [];
  constructor(bn: Bunny, names: string[] = ['earL1', 'earL2', 'earR1', 'earR2', 'hair', 'tail']) {
    for (const n of names) {
      const child = BONE_DEFS.find((d) => d.p === n && n !== 'head');
      const tipW = child ? child.at : TIPS[n]!;
      const at = BIND[n]!;
      this.items.push({ bone: bn.b[n]!, tipL: new THREE.Vector3(tipW[0] - at[0], tipW[1] - at[1], tipW[2] - at[2]), tip: new THREE.Vector3(), prev: new THREE.Vector3(), init: false, k: n === 'tail' ? 1.6 : n === 'hair' ? 1.3 : 1 });
    }
  }
  /** 몸 자세를 정한 뒤 (matrixWorld 갱신 뒤) 부른다 */
  step(dt: number, stiff: number, damp: number, on: boolean): void {
    const n = clamp(Math.round(dt * 120), 1, 8);
    for (const it of this.items) {
      const bone = it.bone;
      bone.updateMatrixWorld(true);
      _h.setFromMatrixPosition(bone.matrixWorld);
      _r.copy(it.tipL).applyMatrix4(bone.matrixWorld);
      if (!on || !it.init) {
        it.tip.copy(_r);
        it.prev.copy(_r);
        it.init = true;
        if (!on) continue;
      }
      const len = _r.distanceTo(_h);
      for (let s = 0; s < n; s++) {
        _v.subVectors(it.tip, it.prev).multiplyScalar(1 - damp);
        it.prev.copy(it.tip);
        it.tip.add(_v).addScaledVector(_d.subVectors(_r, it.tip), stiff * it.k);
        it.tip.y -= 0.0003;
        it.tip.sub(_h).setLength(len).add(_h);
      }
      _d.subVectors(it.tip, _h).normalize();
      _r.sub(_h).normalize();
      _qw.setFromUnitVectors(_r, _d);
      bone.getWorldQuaternion(_q);
      bone.parent!.getWorldQuaternion(_qp);
      bone.quaternion.copy(_qp.invert().multiply(_qw.multiply(_q)));
      bone.updateMatrixWorld(true);
    }
  }
  shift(dx: number): void {
    for (const it of this.items) {
      it.tip.x += dx;
      it.prev.x += dx;
    }
  }
}
/** 깜빡임 (주기 3.1초 근처) */
function blinkAt(t: number, seed = 0): number {
  const p = (t + seed) % 3.3;
  return p < 0.16 ? Math.sin((p / 0.16) * Math.PI) : 0;
}

/* ───────────── i462 흔들리는 뼈 ───────────── */

interface HopPose {
  x: number;
  y: number;
  yaw: number;
  sy: number;
  lean: number;
  tuck: number;
}
/** 세 번 폴짝 → 멈춤 → 돌기 → 세 번 폴짝 → 멈춤 → 돌기 (4.6초) */
function hopPose(T: number): HopPose {
  const P = 4.6;
  const u = ((T % P) + P) % P;
  const hop = (s: number, x0: number, x1: number, yaw: number): HopPose => {
    const i = Math.min(2, Math.floor(s / 0.4));
    const p = (s - i * 0.4) / 0.4;
    const a = lerp(x0, x1, i / 3), b = lerp(x0, x1, (i + 1) / 3);
    const pc = 0.16;
    if (p < pc) return { x: a, y: 0, yaw, sy: 1 - 0.14 * Math.sin((p / pc) * Math.PI), lean: 0.08, tuck: 0 };
    const q = (p - pc) / (1 - pc);
    return { x: lerp(a, b, sstep(q) * 0.3 + q * 0.7), y: 4 * 0.3 * q * (1 - q), yaw, sy: 1 + 0.08 * Math.sin(Math.PI * q), lean: 0.2 * Math.sin(Math.PI * q), tuck: Math.sin(Math.PI * q) };
  };
  const stand = (s: number, x: number, yaw: number): HopPose => ({ x, y: 0, yaw, sy: s < 0.2 ? 1 - 0.16 * Math.sin((s / 0.2) * Math.PI) : 1, lean: 0, tuck: 0 });
  const turn = (s: number, x: number, y0: number, y1: number): HopPose => {
    const k = s / 0.3;
    return { x, y: 0.08 * Math.sin(Math.PI * k), yaw: lerp(y0, y1, sstep(k)), sy: 1, lean: 0, tuck: 0.3 * Math.sin(Math.PI * k) };
  };
  const H = Math.PI / 2 - 0.42;
  if (u < 1.2) return hop(u, -0.45, 0.45, H);
  if (u < 2.0) return stand(u - 1.2, 0.45, H);
  if (u < 2.3) return turn(u - 2.0, 0.45, H, -H);
  if (u < 3.5) return hop(u - 2.3, 0.45, -0.45, -H);
  if (u < 4.3) return stand(u - 3.5, -0.45, -H);
  return turn(u - 4.3, -0.45, -H, H);
}
function applyHop(bn: Bunny, p: HopPose, baseX: number): void {
  const g = bn.group;
  g.position.set(baseX + p.x, p.y, 0);
  g.rotation.y = p.yaw;
  const sx = 1 / Math.sqrt(p.sy);
  g.scale.set(sx, p.sy, sx);
  const b = bn.b;
  b.spine!.rotation.x = p.lean;
  b.head!.rotation.x = -p.lean * 0.4;
  b.thighL!.rotation.x = b.thighR!.rotation.x = 0.55 * p.tuck;
  b.shinL!.rotation.x = b.shinR!.rotation.x = -0.25 * p.tuck;
  b.footL!.rotation.x = b.footR!.rotation.x = -0.3 * p.tuck;
  b.armL!.rotation.z = -0.8 * p.tuck;
  b.armR!.rotation.z = 0.8 * p.tuck;
  for (const n of ['earL1', 'earL2', 'earR1', 'earR2', 'hair', 'tail']) b[n]!.quaternion.identity();
}

const i462: DemoMap[string] = {
  kind: '3d',
  caption: '폴짝 뛰다 멈추면 귀 · 머리카락 · 꼬리가 늦게 따라와 출렁 — 왼쪽은 끔, 오른쪽은 켬',
  make() {
    const st = makeStage([0, 1.5, 6.6], [0, 0.98, 0], 32);
    const lanes = [-1.12, 1.12];
    st.scene.add(pedestal(1.0, '#b3acdf', '#6d6497').translateX(lanes[0]!), pedestal(1.0, '#9fdcb9', '#5f8f74').translateX(lanes[1]!));
    const A = makeBunny(), B = makeBunny();
    st.scene.add(A.group, B.group);
    const SA = new Springs(A), SB = new Springs(B);
    let stiff = 0.028, damp = 0.04, on = true;
    const mkLabel = (s: string, c: string): ((g: CanvasRenderingContext2D, w: number, h: number) => void) => (g, w, h) => {
      plate(g, w, h, c);
      txt(g, s, w / 2, h / 2 + 0.5, 10, '#fff', 'center', 800);
    };
    st.hud.add(78, 20, 'bl', mkLabel('흔들림 끔', 'rgba(70,62,120,0.85)'), 1);
    const lb = st.hud.add(78, 20, 'br', mkLabel('흔들림 켬', 'rgba(40,120,90,0.85)'), 0.2);
    return {
      scene: st.scene,
      camera: st.camera,
      update(t, dt) {
        const d = Math.min(dt, 0.05);
        const p = hopPose(t);
        applyHop(A, p, lanes[0]!);
        applyHop(B, p, lanes[1]!);
        for (const bn of [A, B]) {
          bn.expr[0] = blinkAt(t, bn === A ? 0.7 : 0);
          bn.expr[1] = p.tuck * 0.6;
          bn.applyFace();
          bn.group.updateMatrixWorld(true);
        }
        SA.step(d, stiff, damp, false);
        SB.step(d, stiff, damp, on);
        lb.draw = mkLabel(on ? '흔들림 켬' : '흔들림 끔', on ? 'rgba(40,120,90,0.85)' : 'rgba(70,62,120,0.85)');
      },
      render: st.render,
      controls: [
        { type: 'toggle', label: '흔들림 (오른쪽 토끼)', value: true, on: (v) => (on = v) },
        { type: 'range', label: '단단함', min: 0.004, max: 0.1, step: 0.002, value: stiff, on: (v) => (stiff = v) },
        { type: 'range', label: '감쇠 (멈추는 빠르기)', min: 0.005, max: 0.2, step: 0.005, value: damp, on: (v) => (damp = v) },
      ] as Control[],
      dispose() {
        A.dispose();
        B.dispose();
        st.disposeAll();
      },
    };
  },
};

/* ───────────── i463 표정 모프 ───────────── */

const i463: DemoMap[string] = {
  kind: '3d',
  caption: '같은 얼굴의 변형 6가지(깜빡 · 웃음 · 놀람 · 화남 · 아 · 오)를 비율로 섞어 표정 — morphTargetInfluences',
  make() {
    const st = makeStage([0.25, 1.4, 3.7], [0.12, 1.24, 0], 30, ['#3a3f72', '#171b36']);
    const ped = pedestal(1.0, '#f2c6d3', '#9a6f86');
    st.scene.add(ped);
    const bn = makeBunny();
    bn.group.rotation.y = -0.12;
    bn.group.position.x = 0.32;
    st.scene.add(bn.group);
    const springs = new Springs(bn, ['earL1', 'earL2', 'earR1', 'earR2', 'hair']);
    let auto = true;
    const manual = [0, 0, 0];
    const w = [0, 0, 0, 0, 0, 0];
    const COLS = ['#9fb4ff', '#ffb3c6', '#ffd36e', '#ff7a6b', '#8ee3c2', '#c4a6ff'];
    const NAMES = ['기본', '웃음', '놀람', '화남', '말하기', '웃음'];
    let label = '기본';
    st.hud.add(104, 98, 'tl', (g, lw, lh) => {
      plate(g, lw, lh);
      txt(g, auto ? '표정 · ' + label : '표정 · 직접 섞기', 8, 11, 8.5, '#fff', 'left', 800);
      for (let i = 0; i < 6; i++) bar(g, EXPR_KO[i]!, w[i]!, 8, 26 + i * 12.5, lw - 14, COLS[i]!, 24);
    }, 0.06);
    return {
      scene: st.scene,
      camera: st.camera,
      update(t, dt) {
        const d = Math.min(dt, 0.05);
        const tgt = [0, 0, 0, 0, 0, 0];
        let talk = 0;
        if (auto) {
          const seg = Math.floor(t / 2.2) % 6;
          label = NAMES[seg]!;
          if (seg === 1 || seg === 5) tgt[1] = 1;
          if (seg === 2) tgt[2] = 1;
          if (seg === 3) tgt[3] = 1;
          if (seg === 4 || seg === 5) talk = 1;
        } else {
          tgt[1] = manual[0]!;
          tgt[2] = manual[1]!;
          tgt[3] = manual[2]!;
        }
        const k = 1 - Math.exp(-d * 9);
        for (let i = 1; i < 4; i++) w[i] = lerp(w[i]!, tgt[i]!, k);
        // 말하기: 음절마다 아 · 오
        const syl = Math.floor(t / 0.17);
        const open = talk * Math.max(0, Math.sin(((t % 0.17) / 0.17) * Math.PI));
        const isO = (syl * 7919) % 3 === 0;
        w[4] = lerp(w[4]!, isO ? 0 : open * 0.9, 1 - Math.exp(-d * 25));
        w[5] = lerp(w[5]!, isO ? open : 0, 1 - Math.exp(-d * 25));
        w[0] = blinkAt(t) * (1 - w[1]!);
        for (let i = 0; i < 6; i++) bn.expr[i] = w[i]!;
        bn.applyFace();
        const b = bn.b;
        b.head!.rotation.set(-0.08 * w[2]! + 0.1 * w[3]! + 0.02 * Math.sin(t * 1.3), 0.08 * Math.sin(t * 0.7), 0.13 * w[1]! * Math.sin(t * 2.2) + 0.03 * Math.sin(t));
        b.spine!.rotation.x = 0.02 * Math.sin(t * 2);
        b.armL!.rotation.z = -0.6 * w[2]! + 0.3 * w[3]! - 0.25 * w[1]! * (0.5 + 0.5 * Math.sin(t * 6));
        b.armR!.rotation.z = 0.6 * w[2]! - 0.3 * w[3]! + 0.25 * w[1]! * (0.5 + 0.5 * Math.sin(t * 6 + 1));
        const earX = -0.55 * w[3]! + 0.05 * w[2]!;
        const earZ = 0.12 * w[2]! + 0.35 * w[3]!;
        b.earL1!.rotation.set(earX, 0, earZ);
        b.earR1!.rotation.set(earX, 0, -earZ);
        b.earL2!.quaternion.identity();
        b.earR2!.quaternion.identity();
        b.hair!.quaternion.identity();
        bn.group.position.y = 0.015 * Math.sin(t * 2);
        bn.group.updateMatrixWorld(true);
        springs.step(d, 0.035, 0.05, true);
      },
      render: st.render,
      controls: [
        { type: 'toggle', label: '자동 표정', value: true, on: (v) => (auto = v) },
        { type: 'range', label: '웃음', min: 0, max: 1, step: 0.01, value: 0, on: (v) => ((manual[0] = v), (auto = false)) },
        { type: 'range', label: '놀람', min: 0, max: 1, step: 0.01, value: 0, on: (v) => ((manual[1] = v), (auto = false)) },
        { type: 'range', label: '화남', min: 0, max: 1, step: 0.01, value: 0, on: (v) => ((manual[2] = v), (auto = false)) },
      ] as Control[],
      dispose() {
        bn.dispose();
        st.disposeAll();
      },
    };
  },
};

/* ───────────── i464 애니메이션 섞기 ───────────── */

type PoseFn = (a: number) => { r: Record<string, V3>; hy: number };
const CLIP_BONES = ['hips', 'spine', 'head', 'armL', 'armR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR', 'earL1', 'earR1', 'tail'];
/** 키프레임 클립을 코드로 — 뼈마다 QuaternionKeyframeTrack, 골반 높이는 VectorKeyframeTrack */
function makeClip(name: string, period: number, fn: PoseFn, n = 24): THREE.AnimationClip {
  const times: number[] = [];
  const q: Record<string, number[]> = {};
  const hy: number[] = [];
  for (const b of CLIP_BONES) q[b] = [];
  const e = new THREE.Euler(), qq = new THREE.Quaternion();
  for (let i = 0; i <= n; i++) {
    times.push((i / n) * period);
    const p = fn(((i % n) / n) * TAU);
    for (const b of CLIP_BONES) {
      const r = p.r[b] ?? [0, 0, 0];
      qq.setFromEuler(e.set(r[0], r[1], r[2]));
      q[b]!.push(qq.x, qq.y, qq.z, qq.w);
    }
    hy.push(0, p.hy, 0);
  }
  const tracks: THREE.KeyframeTrack[] = CLIP_BONES.map((b) => new THREE.QuaternionKeyframeTrack(b + '.quaternion', times, q[b]!));
  tracks.push(new THREE.VectorKeyframeTrack('hips.position', times, hy));
  return new THREE.AnimationClip(name, period, tracks);
}
function legs(a: number, amp: number, knee: number): Record<string, V3> {
  const r: Record<string, V3> = {};
  for (const [s, off] of [['L', 0], ['R', Math.PI]] as [string, number][]) {
    const th = -amp * Math.sin(a + off);
    const sh = knee * Math.pow(Math.max(0, Math.cos(a + off)), 1.4);
    r['thigh' + s] = [th, 0, 0];
    r['shin' + s] = [sh, 0, 0];
    r['foot' + s] = [-(th + sh) * 0.85 + 0.25 * Math.max(0, -Math.sin(a + off)) * amp, 0, 0];
  }
  return r;
}
const IDLE: PoseFn = (a) => ({
  r: {
    spine: [0.03 * Math.sin(a), 0, 0],
    head: [0.03 * Math.sin(a + 1), 0.12 * Math.sin(a), 0.04 * Math.sin(a)],
    armL: [0, 0, 0.08 * Math.sin(a)],
    armR: [0, 0, -0.08 * Math.sin(a)],
    earL1: [0.06 * Math.sin(a), 0, 0.05 + 0.25 * Math.max(0, Math.sin(2 * a)) ** 8],
    earR1: [0.06 * Math.sin(a + 0.5), 0, -0.05],
    tail: [0, 0.35 * Math.sin(2 * a), 0],
  },
  hy: 0.55 + 0.006 * Math.sin(a),
});
const WALK: PoseFn = (a) => ({
  r: {
    ...legs(a, 0.55, 0.8),
    hips: [0, -0.1 * Math.sin(a), 0.04 * Math.sin(a)],
    spine: [0.06, 0.14 * Math.sin(a), -0.03 * Math.sin(a)],
    head: [-0.03, -0.06 * Math.sin(a), 0.04 * Math.sin(2 * a)],
    armL: [0.55 * Math.sin(a), 0, 0.1],
    armR: [-0.55 * Math.sin(a), 0, -0.1],
    earL1: [-0.08 - 0.08 * Math.cos(2 * a), 0, 0.05 * Math.sin(a)],
    earR1: [-0.08 - 0.08 * Math.cos(2 * a + 0.4), 0, 0.05 * Math.sin(a)],
    tail: [0, 0.3 * Math.sin(a), 0],
  },
  hy: 0.523 + 0.027 * Math.cos(2 * a),
});
const RUN: PoseFn = (a) => ({
  r: {
    ...legs(a, 0.95, 1.5),
    hips: [0.1, -0.14 * Math.sin(a), 0.05 * Math.sin(a)],
    spine: [0.22, 0.2 * Math.sin(a), 0],
    head: [-0.2, -0.1 * Math.sin(a), 0],
    armL: [1.0 * Math.sin(a), 0, 0.35],
    armR: [-1.0 * Math.sin(a), 0, -0.35],
    earL1: [-0.5 - 0.15 * Math.cos(2 * a), 0, 0.12],
    earR1: [-0.5 - 0.15 * Math.cos(2 * a + 0.5), 0, -0.12],
    tail: [0.3, 0.2 * Math.sin(2 * a), 0],
  },
  hy: 0.52 + 0.07 * Math.abs(Math.cos(a)),
});

const i464: DemoMap[string] = {
  kind: '3d',
  caption: '코드로 만든 클립 3개(가만히 · 걷기 · 뛰기)를 속도에 따라 AnimationMixer 가중치로 섞기 — 걷기 ↔ 뛰기 발 박자 맞춤',
  make() {
    const st = makeStage([1.2, 1.45, 5.9], [0.2, 1.0, 0], 32, ['#30406e', '#151c34']);
    // 움직이는 땅 (러닝머신처럼 무늬가 흐른다)
    const gc = document.createElement('canvas');
    gc.width = gc.height = 256;
    const gg = gc.getContext('2d')!;
    gg.fillStyle = '#86c99a';
    gg.fillRect(0, 0, 256, 256);
    gg.fillStyle = '#79bd8e';
    gg.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 90; i++) {
      gg.fillStyle = i % 3 ? 'rgba(255,255,255,0.18)' : 'rgba(40,110,70,0.25)';
      gg.beginPath();
      gg.arc((i * 97) % 256, (i * 57) % 256, 2 + (i % 3), 0, TAU);
      gg.fill();
    }
    const gt = new THREE.CanvasTexture(gc);
    gt.colorSpace = THREE.SRGBColorSpace;
    gt.wrapS = gt.wrapT = THREE.RepeatWrapping;
    gt.repeat.set(12, 8);
    gt.anisotropy = 4;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(24, 16), new THREE.MeshStandardMaterial({ map: gt, roughness: 0.9 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    st.scene.add(ground);
    // 흐르는 꽃 · 돌
    const flowers = new THREE.Group();
    const stemG = new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6).translate(0, 0.08, 0);
    const headG = new THREE.SphereGeometry(0.05, 12, 8);
    const stoneG = new THREE.SphereGeometry(0.1, 12, 8).scale(1, 0.55, 0.8);
    const stemM = new THREE.MeshStandardMaterial({ color: '#4e9a5e' });
    const petalMs = ['#ffd36e', '#ff9fb8', '#ffffff', '#b9a6ff'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
    const stoneM = new THREE.MeshStandardMaterial({ color: '#c9c2b8', roughness: 0.85 });
    for (let i = 0; i < 18; i++) {
      const f = new THREE.Group();
      if (i % 4 === 3) f.add(new THREE.Mesh(stoneG, stoneM));
      else {
        const hm = new THREE.Mesh(headG, petalMs[i % 4]!);
        hm.position.y = 0.17;
        f.add(new THREE.Mesh(stemG, stemM), hm);
      }
      f.position.set(-5 + (i * 10) / 18, 0, (i % 2 ? -1 : 1) * (0.6 + ((i * 37) % 10) / 12));
      f.traverse((o) => (o.castShadow = true));
      flowers.add(f);
    }
    st.scene.add(flowers);
    const bn = makeBunny();
    bn.group.rotation.y = Math.PI / 2 - 0.3;
    st.scene.add(bn.group);
    const mixer = new THREE.AnimationMixer(bn.group);
    const clips = [makeClip('가만히', 2.4, IDLE), makeClip('걷기', 0.8, WALK), makeClip('뛰기', 0.5, RUN)];
    const acts = clips.map((c) => {
      const a = mixer.clipAction(c);
      a.play();
      a.setEffectiveWeight(0);
      return a;
    });
    const [aIdle, aWalk, aRun] = acts as [THREE.AnimationAction, THREE.AnimationAction, THREE.AnimationAction];
    let autoSpeed = true, speedM = 1, sync = true, speed = 0;
    const W = [1, 0, 0];
    st.hud.add(112, 64, 'tl', (g, lw, lh) => {
      plate(g, lw, lh);
      txt(g, '속도 ' + speed.toFixed(2) + (sync ? '  · 박자 맞춤' : '  · 박자 따로'), 8, 11, 8.5, '#fff', 'left', 800);
      const C = ['#9fb4ff', '#8ee3c2', '#ffb36b'];
      clips.forEach((c, i) => bar(g, c.name, W[i]!, 8, 26 + i * 13, lw - 14, C[i]!, 30));
    }, 0.06);
    return {
      scene: st.scene,
      camera: st.camera,
      update(t, dt) {
        const d = Math.min(dt, 0.05);
        if (autoSpeed) {
          const u = t % 10;
          speed = u < 1.2 ? 0 : u < 2.4 ? 1.1 * sstep((u - 1.2) / 1.2) : u < 4.2 ? 1.1 : u < 5.4 ? lerp(1.1, 2.5, sstep((u - 4.2) / 1.2)) : u < 7.4 ? 2.5 : u < 8.8 ? lerp(2.5, 0, sstep((u - 7.4) / 1.4)) : 0;
        } else speed = speedM;
        const wi = 1 - sstep(speed / 0.9);
        const kr = sstep((speed - 1.4) / 0.9);
        W[0] = wi;
        W[1] = (1 - wi) * (1 - kr);
        W[2] = (1 - wi) * kr;
        acts.forEach((a, i) => a.setEffectiveWeight(W[i]!));
        // 박자: 걷기(0.8초) · 뛰기(0.5초)를 같은 한 걸음 길이로
        const D = lerp(0.8, 0.5, kr);
        const m = clamp(Math.max(speed, 0.6) / lerp(1.1, 2.4, kr), 0.5, 1.6);
        if (sync) {
          aWalk.timeScale = (0.8 / D) * m;
          aRun.timeScale = (0.5 / D) * m;
        } else {
          aWalk.timeScale = m;
          aRun.timeScale = m * 1.13;
        }
        mixer.update(d);
        if (sync) aRun.time = ((aWalk.time / 0.8) % 1) * 0.5;
        void aIdle;
        bn.expr[0] = blinkAt(t);
        bn.expr[1] = 0.6 * kr * (1 - wi);
        bn.expr[4] = 0.4 * kr * (1 - wi);
        bn.applyFace();
        // 땅이 흐른다
        gt.offset.x += (speed * d) / 2;
        for (const f of flowers.children) {
          f.position.x -= speed * d;
          if (f.position.x < -5) f.position.x += 10;
        }
      },
      render: st.render,
      controls: [
        { type: 'toggle', label: '자동 속도', value: true, on: (v) => (autoSpeed = v) },
        { type: 'range', label: '속도', min: 0, max: 3, step: 0.05, value: 1, on: (v) => ((speedM = v), (autoSpeed = false)) },
        { type: 'toggle', label: '걷기 ↔ 뛰기 박자 맞추기', value: true, on: (v) => (sync = v) },
      ] as Control[],
      dispose() {
        mixer.stopAllAction();
        mixer.uncacheRoot(bn.group);
        bn.dispose();
        st.disposeAll();
        stemG.dispose();
        headG.dispose();
        stoneG.dispose();
      },
    };
  },
};

/* ───────────── i465 발 땅에 붙이기 ───────────── */

const TP = 12;
/** 지형 높이 (12 마다 되풀이): 잔물결 · 언덕 · 계단 오르기 · 단 · 계단 내리기 */
function terrH(x: number): number {
  const u = ((x % TP) + TP) % TP;
  if (u < 3) return 0.03 * Math.sin(u * 2.6);
  if (u < 6) return 0.25 * (1 - Math.cos((TAU * (u - 3)) / 3));
  if (u < 6.4) return 0;
  if (u < 8.2) return 0.14 * (Math.floor((u - 6.4) / 0.45) + 1);
  if (u < 9.2) return 0.56;
  if (u < 10.55) return 0.14 * (3 - Math.floor((u - 9.2) / 0.45));
  return 0;
}
function terrainGeo(): { geo: THREE.BufferGeometry; chunks: THREE.Mesh[] } {
  const pts: [number, number, boolean][] = []; // x, y, 돌계단 구간
  for (let per = -1; per <= 1; per++) {
    const X = per * TP;
    for (let u = 0; u < 6.4 - 1e-6; u += 0.05) pts.push([X + u, terrH(X + u), false]);
    let y = 0;
    const steps = [6.4, 6.85, 7.3, 7.75, 8.2, 9.2, 9.65, 10.1, 10.55];
    for (const sx of steps) {
      pts.push([X + sx, y, true]);
      y = terrH(X + sx + 1e-4);
      pts.push([X + sx, y, true]);
    }
    for (let u = 10.6; u < TP - 1e-6; u += 0.05) pts.push([X + u, 0, false]);
  }
  pts.push([2 * TP, 0, false]);
  const P: number[] = [], C: number[] = [];
  const CH: number[][] = Array.from({ length: 3 * TP + 1 }, () => []);
  const zb = -1.7, zf = 1.0, yb = -0.7;
  const grass = new THREE.Color('#8fd19c'), grass2 = new THREE.Color('#7cc28c'), stone = new THREE.Color('#e3d6bf'), stoneS = new THREE.Color('#bfae93'), soil = new THREE.Color('#9a6c4f'), soil2 = new THREE.Color('#7f5640');
  const c = new THREE.Color();
  const tri = (a: V3, b: V3, d: V3, col: THREE.Color): void => {
    P.push(...a, ...b, ...d);
    for (let i = 0; i < 3; i++) C.push(col.r, col.g, col.b);
  };
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0, s0] = pts[i]!, [x1, y1, s1] = pts[i + 1]!;
    const vert = Math.abs(x1 - x0) < 1e-6;
    const st = s0 && s1;
    c.copy(st ? (vert ? stoneS : stone) : Math.floor(x0 * 2.5) % 2 ? grass : grass2);
    tri([x0, y0, zf], [x1, y1, zf], [x1, y1, zb], c);
    tri([x0, y0, zf], [x1, y1, zb], [x0, y0, zb], c);
    if (!vert) for (const ch of new Set([Math.floor(x0 + TP), Math.floor(x1 + TP - 1e-6)])) CH[clamp(ch, 0, 3 * TP)]!.push(x0, y0, zf, x1, y1, zf, x1, y1, zb, x0, y0, zf, x1, y1, zb, x0, y0, zb);
    // 앞 흙벽 (층 무늬)
    const cs = st ? stoneS : Math.floor((y0 + 0.7) * 6) % 2 ? soil : soil2;
    tri([x0, yb, zf], [x1, yb, zf], [x1, y1, zf], cs);
    tri([x0, yb, zf], [x1, y1, zf], [x0, y0, zf], cs);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.computeVertexNormals();
  const chunks = CH.map((a) => {
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(a, 3));
    return new THREE.Mesh(cg);
  });
  return { geo: g, chunks };
}
const L1 = 0.18, L2 = 0.19;
/** 다리 두 뼈 IK (옆에서 본 평면) — 골반 기준 발목 목표 (dz 앞, ty 높이) */
function legIK(bn: Bunny, s: string, hipY: number, dz: number, ty: number, slope: number): number {
  const vy = ty - hipY, vz = dz;
  const D = Math.hypot(vy, vz);
  const Dc = clamp(D, 0.05, (L1 + L2) * 0.999);
  const phi = Math.atan2(vz, -vy);
  const al = Math.acos(clamp((L1 * L1 + Dc * Dc - L2 * L2) / (2 * L1 * Dc), -1, 1));
  const ga = Math.acos(clamp((L1 * L1 + L2 * L2 - Dc * Dc) / (2 * L1 * L2), -1, 1));
  const th = -(phi + al), sh = Math.PI - ga;
  bn.b['thigh' + s]!.rotation.set(th, 0, 0);
  bn.b['shin' + s]!.rotation.set(sh, 0, 0);
  bn.b['foot' + s]!.rotation.set(-slope - th - sh, 0, 0);
  return D - Dc; // 못 닿은 길이
}

const i465: DemoMap[string] = {
  kind: '3d',
  caption: '발 아래로 광선(하늘색)을 쏴 땅 높이 → 다리 IK · 골반 높이 보정 — 오른쪽(IK 끔)은 발이 뜨거나 묻힌다',
  make() {
    const st = makeStage([0.6, 1.9, 6.2], [0, 0.75, 0], 32, ['#35477a', '#161d36']);
    const tg = terrainGeo();
    const terr = new THREE.Mesh(tg.geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 }));
    terr.receiveShadow = true;
    st.scene.add(terr);
    // 뒤쪽 덤불
    const bushG = new THREE.SphereGeometry(0.32, 16, 12);
    const bush = new THREE.InstancedMesh(bushG, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 }), 46);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 46; i++) {
      const x = -12 + i * 0.78;
      const s = 0.7 + ((i * 37) % 10) / 18;
      m4.makeScale(s, s * 0.85, s).setPosition(x, terrH(x) + 0.12, -1.45 - ((i * 13) % 5) / 20);
      bush.setMatrixAt(i, m4);
      bush.setColorAt(i, new THREE.Color(i % 3 ? '#86c996' : '#74b887'));
    }
    bush.castShadow = true;
    st.scene.add(bush);
    const A = makeBunny(), B = makeBunny();
    st.scene.add(A.group, B.group);
    A.group.rotation.y = B.group.rotation.y = Math.PI / 2;
    const SA = new Springs(A), SB = new Springs(B);
    // 광선 · 틈 표시
    const rodG = new THREE.CylinderGeometry(1, 1, 1, 8).translate(0, 0.5, 0);
    const rayM = new THREE.MeshBasicMaterial({ color: '#7fe3ff', transparent: true, opacity: 0.85, toneMapped: false });
    const gapM = new THREE.MeshBasicMaterial({ color: '#ff5a6e', toneMapped: false });
    const dotG = new THREE.SphereGeometry(0.035, 12, 8);
    const rays = [0, 1].map(() => new THREE.Mesh(rodG, rayM));
    const dots = [0, 1].map(() => new THREE.Mesh(dotG, rayM));
    const gaps = [0, 1].map(() => new THREE.Mesh(rodG, gapM));
    st.scene.add(...rays, ...dots, ...gaps);
    const rc = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0), org = new THREE.Vector3();
    const nrm = new THREE.Vector3();
    const cast = (x: number): number => {
      rc.set(org.set(x, 5, 0), down);
      const ch = tg.chunks[clamp(Math.floor(x + TP), 0, 3 * TP)]!;
      const hit = rc.intersectObject(ch, false)[0];
      if (!hit) return terrH(x);
      nrm.copy(hit.face!.normal);
      return hit.point.y;
    };
    let ikOn = true, pelvis = true, speed = 0.75, bx = 0.5;
    const hy = [0.55, 0.55];
    const lA = st.hud.add(52, 18, 'free', (g, w, h) => {
      plate(g, w, h, ikOn ? 'rgba(30,130,110,0.9)' : 'rgba(110,80,140,0.9)');
      txt(g, ikOn ? 'IK 켬' : 'IK 끔', w / 2, h / 2 + 0.5, 9.5, '#fff', 'center', 800);
    }, 0.2);
    const lB = st.hud.add(52, 18, 'free', (g, w, h) => {
      plate(g, w, h, 'rgba(190,60,80,0.9)');
      txt(g, 'IK 끔', w / 2, h / 2 + 0.5, 9.5, '#fff', 'center', 800);
    }, 1);
    st.hud.add(150, 18, 'bl', (g, w, h) => {
      plate(g, w, h);
      txt(g, '하늘색 = 발 아래 광선 · 빨강 = 뜬 틈', w / 2, h / 2 + 0.5, 8, '#e6ecff', 'center', 700);
    }, 1);
    const walk = (bn: Bunny, sp: Springs, bodyX: number, k: number, ik: boolean, d: number, t: number): void => {
      const S = 0.62;
      const ph = bodyX / S;
      const gC = cast(bodyX);
      let hips = gC + 0.53 + 0.02 * Math.cos(ph * 2 * TAU);
      const feet: { s: string; dz: number; ty: number; slope: number; fx: number }[] = [];
      for (const [s, o] of [['L', 0], ['R', 0.5]] as [string, number][]) {
        const n = Math.floor(ph + o), p = ph + o - n;
        const Xn = (n + 0.25 - o) * S, Xn1 = Xn + S;
        const gP = ik ? cast(Xn) : gC, gN = ik ? cast(Xn1) : gC;
        let fx: number, fy: number;
        if (p < 0.5) {
          fx = Xn;
          fy = gP;
        } else {
          const q = (p - 0.5) / 0.5;
          fx = lerp(Xn, Xn1, sstep(q));
          const hi = Math.max(gP, gN) + 0.02;
          fy = (q < 0.5 ? lerp(gP, hi, sstep(q * 2)) : lerp(hi, gN, sstep((q - 0.5) * 2))) + 0.09 * Math.sin(Math.PI * q);
        }
        let slope = 0;
        if (ik) {
          cast(fx);
          slope = nrm.y > 0.5 ? clamp(Math.atan2(-nrm.x, nrm.y), -0.45, 0.45) : 0;
          if (p >= 0.5) slope *= Math.abs(Math.cos(Math.PI * ((p - 0.5) / 0.5)));
        }
        const ty = fy + 0.1;
        feet.push({ s, dz: fx - bodyX, ty, slope, fx });
        if (ik && pelvis) hips = Math.min(hips, ty + Math.sqrt(Math.max(0, (0.37 * 0.98) ** 2 - (fx - bodyX) ** 2)) + 0.08);
      }
      hy[k] = Math.abs(hy[k]! - hips) > 0.4 ? hips : lerp(hy[k]!, hips, 1 - Math.exp(-d * 16));
      const g = bn.group;
      g.position.set(bodyX, 0, 0);
      bn.b.hips!.position.y = hy[k]!;
      bn.b.spine!.rotation.x = 0.07;
      bn.b.armL!.rotation.set(0.5 * Math.sin(ph * TAU), 0, 0.1);
      bn.b.armR!.rotation.set(-0.5 * Math.sin(ph * TAU), 0, -0.1);
      for (const n of ['earL1', 'earL2', 'earR1', 'earR2', 'hair', 'tail']) bn.b[n]!.quaternion.identity();
      feet.forEach((f, i) => {
        legIK(bn, f.s, hy[k]! - 0.08, f.dz, f.ty, f.slope);
        const ground = cast(f.fx);
        if (k === 0) {
          rays[i]!.visible = dots[i]!.visible = ik;
          rays[i]!.position.set(f.fx, ground, 0.15);
          rays[i]!.scale.set(0.006, f.ty + 0.55 - ground, 0.006);
          dots[i]!.position.set(f.fx, ground + 0.01, 0.15);
        } else {
          const gap = f.ty - 0.1 - ground;
          gaps[i]!.visible = gap > 0.03;
          gaps[i]!.position.set(f.fx, ground, 0.2);
          gaps[i]!.scale.set(0.012, Math.max(0.001, gap), 0.012);
        }
      });
      bn.expr[0] = blinkAt(t, k * 1.3);
      bn.applyFace();
      g.updateMatrixWorld(true);
      sp.step(d, 0.03, 0.05, true);
    };
    return {
      scene: st.scene,
      camera: st.camera,
      update(t, dt) {
        const d = Math.min(dt, 0.05);
        bx += speed * d;
        if (bx >= TP) {
          bx -= TP;
          SA.shift(-TP);
          SB.shift(-TP);
        }
        walk(A, SA, bx, 0, ikOn, d, t);
        walk(B, SB, bx + 2.0, 1, false, d, t);
        const cx = bx + 1.0;
        st.camera.position.set(cx + 0.5, 2.1, 7.4);
        st.camera.lookAt(cx, 1.05, 0);
        st.sun.position.set(cx + 2.5, 5, 3.5);
        st.sun.target.position.set(cx, 0, 0);
        st.sun.target.updateMatrixWorld();
        st.camera.updateMatrixWorld();
        pinTo(lA, new THREE.Vector3(bx, hy[0]! + 1.66, 0), st.camera);
        pinTo(lB, new THREE.Vector3(bx + 2.0, hy[1]! + 1.66, 0), st.camera);
      },
      render: st.render,
      controls: [
        { type: 'toggle', label: 'IK (왼쪽 토끼)', value: true, on: (v) => (ikOn = v) },
        { type: 'toggle', label: '골반 높이 보정', value: true, on: (v) => (pelvis = v) },
        { type: 'range', label: '걷는 속도', min: 0.2, max: 1.4, step: 0.05, value: speed, on: (v) => (speed = v) },
      ] as Control[],
      dispose() {
        A.dispose();
        B.dispose();
        bush.dispose();
        for (const c of tg.chunks) c.geometry.dispose();
        st.disposeAll();
      },
    };
  },
};

/* ───────────── i466 래그돌 흉내 ───────────── */

/** 베를레 점: 이름 · 묶은 뼈 · 반지름 · (위치는 BIND 기준 자리) */
const RAG_PTS: [string, string, number, V3][] = [
  ['P', 'hips', 0.2, [0, 0.55, 0]],
  ['N', 'spine', 0.12, [0, 0.97, 0]],
  ['SL', 'spine', 0.08, [-0.25, 0.77, 0.02]],
  ['SR', 'spine', 0.08, [0.25, 0.77, 0.02]],
  ['BF', 'hips', 0.06, [0, 0.68, 0.24]],
  ['TA', 'hips', 0.12, [0, 0.62, -0.3]],
  ['HL', 'hips', 0.1, [-0.14, 0.47, 0]],
  ['HR', 'hips', 0.1, [0.14, 0.47, 0]],
  ['HC', 'head', 0.4, [0, 1.25, 0]],
  ['HT', 'head', 0.05, [0, 1.62, 0]],
  ['HF', 'head', 0.04, [0, 1.25, 0.4]],
  ['EBL', 'head', 0.05, [-0.125, 1.55, -0.025]],
  ['EBR', 'head', 0.05, [0.125, 1.55, -0.025]],
  ['EML', 'earL2', 0.06, [-0.17, 1.81, -0.045]],
  ['ETL', 'earL2', 0.06, [-0.215, 2.08, -0.06]],
  ['EMR', 'earR2', 0.06, [0.17, 1.81, -0.045]],
  ['ETR', 'earR2', 0.06, [0.215, 2.08, -0.06]],
  ['AL', 'armL', 0.08, [-0.45, 0.6, 0.04]],
  ['AR', 'armR', 0.08, [0.45, 0.6, 0.04]],
  ['KL', 'shinL', 0.1, [-0.14, 0.29, 0]],
  ['FL', 'footL', 0.09, [-0.14, 0.1, 0]],
  ['TL', 'footL', 0.06, [-0.14, 0.05, 0.19]],
  ['KR', 'shinR', 0.1, [0.14, 0.29, 0]],
  ['FR', 'footR', 0.09, [0.14, 0.1, 0]],
  ['TR', 'footR', 0.06, [0.14, 0.05, 0.19]],
];
const RI: Record<string, number> = {};
RAG_PTS.forEach((p, i) => (RI[p[0]] = i));
function ragLinks(): [number, number, number, boolean][] {
  const L: [number, number, number, boolean][] = [];
  const at = (n: string): V3 => RAG_PTS[RI[n]!]![3];
  const add = (a: string, b: string, minOnly = false, k = 1): void => {
    const pa = at(a), pb = at(b);
    L.push([RI[a]!, RI[b]!, Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]) * k, minOnly]);
  };
  const rigid = (names: string[]): void => {
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) add(names[i]!, names[j]!);
  };
  rigid(['P', 'N', 'SL', 'SR', 'BF', 'TA', 'HL', 'HR']);
  rigid(['N', 'HC', 'HT', 'HF', 'EBL', 'EBR']);
  add('HC', 'P', true, 0.85);
  add('HC', 'BF', true, 0.8);
  for (const s of ['L', 'R']) {
    add('S' + s, 'A' + s);
    add('EB' + s, 'EM' + s);
    add('EM' + s, 'ET' + s);
    add('EB' + s, 'ET' + s, true, 0.8);
    add('H' + s, 'K' + s);
    add('K' + s, 'F' + s);
    add('F' + s, 'T' + s);
    add('K' + s, 'T' + s);
    add('H' + s, 'F' + s, true, 0.7);
    add('P', 'K' + s, true, 0.75);
  }
  return L;
}
function ballGeo(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(0.2, 32, 20);
  const pos = g.attributes.position!;
  const cols = ['#ff5a6e', '#ffffff', '#4aa8ff', '#ffd23f', '#ffffff', '#5fd39a'].map((c) => new THREE.Color(c));
  const C: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const c = Math.abs(y) > 0.185 ? cols[1]! : cols[Math.floor(((Math.atan2(z, x) + Math.PI) / TAU) * 6) % 6]!;
    C.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  return g;
}

const i466: DemoMap[string] = {
  kind: '3d',
  caption: '뼈 끝을 베를레 점 + 거리 제약으로 — 공에 맞으면 흐물흐물 넘어지고, 잠시 뒤 원래 자세로 부드럽게 섞으며 일어남',
  make() {
    const st = makeStage([0.45, 1.45, 5.3], [0.55, 0.72, 0], 34, ['#3b3566', '#171530']);
    st.scene.add(pedestal(2.5, '#a8d8c0', '#5d8d7a'));
    const bn = makeBunny();
    st.scene.add(bn.group);
    const N = RAG_PTS.length;
    const cur = RAG_PTS.map(() => new THREE.Vector3()), prev = RAG_PTS.map(() => new THREE.Vector3());
    const links = ragLinks();
    const invM = RAG_PTS.map((p) => (p[0] === 'HC' ? 0.5 : 1));
    // 점 · 막대 보기
    const lgeo = new THREE.BufferGeometry();
    lgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(links.length * 6), 3));
    const lines = new THREE.LineSegments(lgeo, new THREE.LineBasicMaterial({ color: '#ffe27a', transparent: true, opacity: 0.55, depthTest: false, toneMapped: false }));
    const pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const pts = new THREE.Points(pgeo, new THREE.PointsMaterial({ color: '#ffef9a', size: 5, sizeAttenuation: false, depthTest: false, toneMapped: false }));
    lines.renderOrder = pts.renderOrder = 5;
    lines.frustumCulled = pts.frustumCulled = false;
    st.scene.add(lines, pts);
    const ball = new THREE.Mesh(ballGeo(), new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 0.8 }));
    ball.castShadow = true;
    st.scene.add(ball);
    const ballV = new THREE.Vector3();
    let c = 0, state: 'stand' | 'rag' | 'getup' | 'back' = 'stand';
    let power = 3.2, iters = 10, showRig = true, auto = true;
    const fallen = new THREE.Vector3();
    const from = { hp: new THREE.Vector3(), hq: new THREE.Quaternion(), q: {} as Record<string, THREE.Quaternion> };
    const HIT = new THREE.Vector3(-0.28, 0.85, 0.12), B0 = new THREE.Vector3(-3.3, 1.7, 0.5);
    const tmp = new THREE.Vector3(), m4 = new THREE.Matrix4(), bx = new THREE.Vector3(), by = new THREE.Vector3(), bz = new THREE.Vector3();
    const Qt = new THREE.Quaternion(), Qh = new THREE.Quaternion(), W1 = new THREE.Quaternion(), W2 = new THREE.Quaternion(), W3 = new THREE.Quaternion(), qi = new THREE.Quaternion();
    const restDir = (a: string, b: string): THREE.Vector3 => {
      const pa = RAG_PTS[RI[a]!]![3], pb = RAG_PTS[RI[b]!]![3];
      return new THREE.Vector3(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]).normalize();
    };
    const RD: Record<string, THREE.Vector3> = {};
    for (const s of ['L', 'R']) {
      RD['arm' + s] = restDir('S' + s, 'A' + s);
      RD['thigh' + s] = restDir('H' + s, 'K' + s);
      RD['shin' + s] = restDir('K' + s, 'F' + s);
      RD['foot' + s] = restDir('F' + s, 'T' + s);
      RD['ear' + s + '1'] = restDir('EB' + s, 'EM' + s);
      RD['ear' + s + '2'] = restDir('EM' + s, 'ET' + s);
    }
    const P = (n: string): THREE.Vector3 => cur[RI[n]!]!;
    /** 부모 세계 회전 Wp 에서, 쉬는 방향 → 지금 방향 으로 휘두른 세계 회전 */
    const swing = (Wp: THREE.Quaternion, rest: THREE.Vector3, a: string, b: string, out: THREE.Quaternion): THREE.Quaternion => {
      const r = rest.clone().applyQuaternion(Wp);
      const d = tmp.subVectors(P(b), P(a)).normalize();
      return out.setFromUnitVectors(r, d).multiply(Wp);
    };
    const setLocal = (bone: string, Wp: THREE.Quaternion, W: THREE.Quaternion): void => {
      bn.b[bone]!.quaternion.copy(qi.copy(Wp).invert().multiply(W));
    };
    const startRag = (): void => {
      bn.group.updateMatrixWorld(true);
      RAG_PTS.forEach(([, bone, , at], i) => {
        const bb = BIND[bone]!;
        cur[i]!.set(at[0] - bb[0], at[1] - bb[1], at[2] - bb[2]).applyMatrix4(bn.b[bone]!.matrixWorld);
        const w = Math.exp(-cur[i]!.distanceToSquared(HIT) / 0.3);
        const hk = clamp(cur[i]!.y / 1.3, 0.05, 1.3);
        prev[i]!.copy(cur[i]!).sub(tmp.set(power * (0.15 + w) * hk, power * 0.1 * w, -0.15 * power * w).multiplyScalar(1 / 120));
      });
      state = 'rag';
      ballV.set(-1.3, 2.2, 0.7);
    };
    const simulate = (d: number): void => {
      const n = clamp(Math.round(d * 120), 1, 6);
      const h = 1 / 120;
      for (let s = 0; s < n; s++) {
        for (let i = 0; i < N; i++) {
          const p = cur[i]!, q = prev[i]!;
          tmp.subVectors(p, q).multiplyScalar(0.995);
          q.copy(p);
          p.add(tmp);
          p.y -= 9.8 * h * h;
        }
        for (let it = 0; it < iters; it++) {
          for (const [a, b, rest, minOnly] of links) {
            const pa = cur[a]!, pb = cur[b]!;
            tmp.subVectors(pb, pa);
            const dd = tmp.length() || 1e-6;
            if (minOnly && dd >= rest) continue;
            const wa = invM[a]!, wb = invM[b]!;
            const k = (dd - rest) / dd / (wa + wb);
            pa.addScaledVector(tmp, k * wa);
            pb.addScaledVector(tmp, -k * wb);
          }
          for (let i = 0; i < N; i++) {
            const r = RAG_PTS[i]![2];
            const p = cur[i]!;
            if (p.y < r) {
              p.y = r;
              const q = prev[i]!;
              q.x = p.x - (p.x - q.x) * 0.6;
              q.z = p.z - (p.z - q.z) * 0.6;
            }
          }
        }
      }
    };
    const mapBones = (): void => {
      by.subVectors(P('N'), P('P')).normalize();
      bx.subVectors(P('SR'), P('SL'));
      bx.addScaledVector(by, -bx.dot(by)).normalize();
      bz.crossVectors(bx, by);
      Qt.setFromRotationMatrix(m4.makeBasis(bx, by, bz));
      bn.b.hips!.position.copy(P('P'));
      bn.b.hips!.quaternion.copy(Qt);
      bn.b.spine!.quaternion.identity();
      by.subVectors(P('HT'), P('HC')).normalize();
      bz.subVectors(P('HF'), P('HC'));
      bz.addScaledVector(by, -bz.dot(by)).normalize();
      bx.crossVectors(by, bz);
      Qh.setFromRotationMatrix(m4.makeBasis(bx, by, bz));
      setLocal('head', Qt, Qh);
      for (const s of ['L', 'R']) {
        setLocal('arm' + s, Qt, swing(Qt, RD['arm' + s]!, 'S' + s, 'A' + s, W1));
        swing(Qt, RD['thigh' + s]!, 'H' + s, 'K' + s, W1);
        setLocal('thigh' + s, Qt, W1);
        swing(W1, RD['shin' + s]!, 'K' + s, 'F' + s, W2);
        setLocal('shin' + s, W1, W2);
        swing(W2, RD['foot' + s]!, 'F' + s, 'T' + s, W3);
        setLocal('foot' + s, W2, W3);
        swing(Qh, RD['ear' + s + '1']!, 'EB' + s, 'EM' + s, W1);
        setLocal('ear' + s + '1', Qh, W1);
        swing(W1, RD['ear' + s + '2']!, 'EM' + s, 'ET' + s, W2);
        setLocal('ear' + s + '2', W1, W2);
      }
    };
    const restPose = (t: number): void => {
      for (const b of Object.values(bn.b)) b.quaternion.identity();
      bn.b.hips!.position.set(0, 0.55 + 0.006 * Math.sin(t * 2.4), 0);
      bn.b.spine!.rotation.x = 0.02 * Math.sin(t * 2.4);
    };
    const label = { s: '서 있기' };
    st.hud.add(196, 20, 'tl', (g, w, h) => {
      plate(g, w, h);
      txt(g, label.s, 8, h / 2 + 0.5, 8.5, '#fff', 'left', 800);
    }, 0.08);
    return {
      scene: st.scene,
      camera: st.camera,
      update(t, dt) {
        const d = Math.min(dt, 0.05);
        if (state !== 'stand' || auto || c > 0.01) c += d;
        // 공
        if (state === 'stand') {
          if (!auto && c < 0.45) c = Math.min(c, 0);
          const k = clamp((c - 0.45) / 0.55, 0, 1);
          ball.visible = c > 0.45;
          ball.position.lerpVectors(B0, HIT, k);
          ball.position.y += Math.sin(Math.PI * k) * 0.5;
          ball.position.x -= 0.2;
          ball.scale.setScalar(1);
          ball.rotation.z -= d * 8;
          restPose(t);
          bn.expr[2] = sstep((c - 0.6) / 0.3);
          bn.expr[1] = 0;
          label.s = c > 0.45 ? '공이 날아온다!' : '서 있기';
          if (c >= 1.0) startRag();
        } else {
          ballV.y -= 9.8 * d;
          ball.position.addScaledVector(ballV, d);
          if (ball.position.y < 0.2) {
            ball.position.y = 0.2;
            ballV.y = Math.abs(ballV.y) * 0.55;
            ballV.x *= 0.8;
          }
          ball.rotation.z += ballV.x * d * 4;
          ball.scale.setScalar(clamp(1 - (c - 2.4) / 0.4, 0.001, 1));
        }
        if (state === 'rag') {
          simulate(d);
          mapBones();
          bn.expr[2] = Math.max(0, 1 - (c - 1.0) * 2);
          bn.expr[0] = sstep((c - 1.4) / 0.3);
          label.s = '맞았다! 흐물흐물 — 베를레 점 ' + N + '개 · 제약 ' + links.length + '개';
          if (c >= 3.3) {
            state = 'getup';
            fallen.set(P('P').x, 0, P('P').z);
            from.hp.copy(bn.b.hips!.position);
            from.hq.copy(bn.b.hips!.quaternion);
            for (const [k, b] of Object.entries(bn.b)) from.q[k] = b.quaternion.clone();
          }
        }
        if (state === 'getup') {
          const k = sstep((c - 3.3) / 0.9);
          for (const [kk, b] of Object.entries(bn.b)) b.quaternion.slerpQuaternions(from.q[kk]!, qi.identity(), k);
          bn.b.hips!.position.lerpVectors(from.hp, tmp.set(fallen.x, 0.55, fallen.z), k);
          bn.b.hips!.position.y += Math.sin(Math.PI * k) * 0.12;
          bn.expr[0] = 1 - k;
          bn.expr[1] = k;
          label.s = '일어나기 — 원래 자세로 섞기 ' + Math.round(k * 100) + '%';
          if (c >= 4.2) state = 'back';
        }
        if (state === 'back') {
          const k = clamp((c - 4.2) / 1.0, 0, 1);
          const hop = (k * 2) % 1;
          restPose(t);
          bn.b.hips!.position.set(lerp(fallen.x, 0, sstep(k)), 0.55 + 0.25 * Math.sin(Math.PI * hop), lerp(fallen.z, 0, sstep(k)));
          bn.b.thighL!.rotation.x = bn.b.thighR!.rotation.x = 0.4 * Math.sin(Math.PI * hop);
          bn.expr[0] = 0;
          bn.expr[1] = 1 - k * 0.5;
          label.s = '제자리로 폴짝';
          if (c >= 5.4) {
            state = 'stand';
            c = auto ? 0 : -1;
          }
        }
        if (state === 'stand') bn.expr[0] = Math.max(bn.expr[0]!, blinkAt(t));
        bn.applyFace();
        const on = showRig && (state === 'rag' || state === 'getup');
        lines.visible = pts.visible = on;
        if (on) {
          const op = state === 'getup' ? 1 - sstep((c - 3.3) / 0.5) : 1;
          (lines.material as THREE.LineBasicMaterial).opacity = 0.55 * op;
          (pts.material as THREE.PointsMaterial).opacity = op;
          (pts.material as THREE.PointsMaterial).transparent = true;
          const la = lgeo.attributes.position as THREE.BufferAttribute;
          links.forEach(([a, b], i) => {
            la.setXYZ(i * 2, cur[a]!.x, cur[a]!.y, cur[a]!.z);
            la.setXYZ(i * 2 + 1, cur[b]!.x, cur[b]!.y, cur[b]!.z);
          });
          la.needsUpdate = true;
          const pa = pgeo.attributes.position as THREE.BufferAttribute;
          cur.forEach((p, i) => pa.setXYZ(i, p.x, p.y, p.z));
          pa.needsUpdate = true;
        }
      },
      render: st.render,
      controls: [
        { type: 'button', label: '공 던지기', on: () => {
            if (state === 'stand') c = Math.max(c, 0.45);
          },
        },
        { type: 'range', label: '공 세기', min: 1, max: 6, step: 0.1, value: power, on: (v) => (power = v) },
        { type: 'range', label: '제약 반복 (적을수록 흐물)', min: 1, max: 20, step: 1, value: iters, on: (v) => (iters = v) },
        { type: 'toggle', label: '점 · 막대 보기', value: true, on: (v) => (showRig = v) },
        { type: 'toggle', label: '자동 반복', value: true, on: (v) => (auto = v) },
      ] as Control[],
      dispose() {
        bn.dispose();
        st.disposeAll();
      },
    };
  },
};

/* ───────────── i467 무료 모델 (CC0 GLB) ───────────── */

let DRAGON: Promise<GLTF> | null = null;
function loadDragon(): Promise<GLTF> {
  if (!DRAGON) {
    DRAGON = new GLTFLoader().loadAsync(new URL('../assets/games/fakecoin/dragon.glb', import.meta.url).href);
    DRAGON.catch(() => (DRAGON = null));
  }
  return DRAGON;
}
const CLIP_KO: Record<string, string> = { Flying_Idle: '날며 쉬기', Fast_Flying: '빠르게 날기', Headbutt: '박치기', HitReact: '맞음', No: '아니야', Punch: '주먹', Yes: '응!', Death: '쓰러짐' };
const CLIP_ORDER = ['Flying_Idle', 'Yes', 'Fast_Flying', 'Headbutt', 'No', 'Punch', 'HitReact', 'Death'];
const HUES = [0, 0.48, 0.72, 0.3, 0.1];
function partyHat(H: number): THREE.Group {
  const g = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const x = c.getContext('2d')!;
  for (let i = 0; i < 8; i++) {
    x.fillStyle = i % 2 ? '#ffffff' : '#ff6f91';
    x.fillRect(i * 16, 0, 16, 64);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.075 * H, 0.2 * H, 32, 1, true).translate(0, 0.1 * H, 0), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, side: THREE.DoubleSide }));
  const pom = new THREE.Mesh(new THREE.SphereGeometry(0.026 * H, 16, 12), new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.7 }));
  pom.position.y = 0.205 * H;
  const brim = new THREE.Mesh(new THREE.TorusGeometry(0.075 * H, 0.012 * H, 10, 32).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.6 }));
  g.add(cone, pom, brim);
  g.traverse((o) => (o.castShadow = true));
  return g;
}
function flag(H: number): { g: THREE.Group; cloth: THREE.Mesh } {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.006 * H, 0.006 * H, 0.32 * H, 8).translate(0, 0.16 * H, 0), new THREE.MeshStandardMaterial({ color: '#f2efe6', roughness: 0.4 }));
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.014 * H, 12, 8), new THREE.MeshStandardMaterial({ color: '#ffd23f', metalness: 0.6, roughness: 0.3 }));
  ball.position.y = 0.325 * H;
  const fg = new THREE.PlaneGeometry(0.17 * H, 0.1 * H, 12, 1).translate(0.085 * H, 0, 0);
  const cloth = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ color: '#4aa8ff', roughness: 0.7, side: THREE.DoubleSide }));
  cloth.position.y = 0.26 * H;
  cloth.userData.base = Float32Array.from(fg.attributes.position!.array as Float32Array);
  g.add(pole, ball, cloth);
  g.traverse((o) => (o.castShadow = true));
  return { g, cloth };
}
/** 소품을 뼈 자식으로 — 세계 위치 · 똑바로 선 방향을 뼈 좌표로 바꿔 넣는다 */
function attachTo(bone: THREE.Object3D, prop: THREE.Object3D, worldPos: THREE.Vector3, worldQ = new THREE.Quaternion()): void {
  const M = new THREE.Matrix4().compose(worldPos, worldQ, new THREE.Vector3(1, 1, 1));
  M.premultiply(new THREE.Matrix4().copy(bone.matrixWorld).invert());
  M.decompose(prop.position, prop.quaternion, prop.scale);
  bone.add(prop);
}

const i467: DemoMap[string] = {
  kind: '3d',
  caption: 'CC0 용 모델(Quaternius)을 GLTFLoader 로 — 클립 바꾸기 · 색 바꾸기 · 뼈 이름 · 머리 뼈에 모자, 꼬리 뼈에 깃발',
  make() {
    const st = makeStage([0.6, 1.5, 5.2], [0, 1.0, 0], 34, ['#2c4a66', '#13202f'], false);
    const fill = new THREE.DirectionalLight(0xffe7d0, 1.2);
    fill.position.set(-1, 2, 5);
    st.scene.add(fill, pedestal(1.5, '#d9c7a4', '#8b7656'));
    const spin = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 12, 48, Math.PI * 1.5), new THREE.MeshStandardMaterial({ color: '#8fd6ff', emissive: '#2a6c9a' }));
    spin.position.y = 1;
    st.scene.add(spin);
    const holder = new THREE.Group();
    st.scene.add(holder);
    let mixer: THREE.AnimationMixer | null = null;
    let acts: THREE.AnimationAction[] = [];
    let names: string[] = [];
    let cur = -1, manualClip = -1, hue = -1, manualHue = -1, dead = false, status = '불러오는 중…';
    let props: THREE.Group[] = [];
    let cloth: THREE.Mesh | null = null;
    let helper: THREE.SkeletonHelper | null = null;
    let showBones = false, showProps = true;
    let bones: string[] = [];
    const mats: { m: THREE.MeshStandardMaterial; c: THREE.Color }[] = [];
    const ownMats: THREE.Material[] = [];
    const play = (i: number): void => {
      if (!mixer || i === cur || !acts[i]) return;
      const next = acts[i]!;
      next.reset();
      next.setLoop(names[i] === 'Death' ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = true;
      next.play();
      if (cur >= 0) acts[cur]!.crossFadeTo(next, 0.35, false);
      cur = i;
    };
    const tint = (h: number): void => {
      if (h === hue) return;
      hue = h;
      for (const { m, c } of mats) {
        m.color.copy(c);
        if (h > 0) m.color.offsetHSL(h, 0.15, 0.06);
      }
    };
    loadDragon()
      .then((gltf) => {
        if (dead) return;
        const model = SkeletonUtils.clone(gltf.scene);
        model.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          m.castShadow = true;
          m.frustumCulled = false;
          const list = (Array.isArray(m.material) ? m.material : [m.material]).map((mt) => {
            const c = (mt as THREE.MeshStandardMaterial).clone();
            ownMats.push(c);
            if (/Main|Secondary/.test(c.name)) mats.push({ m: c, c: c.color.clone() });
            return c;
          });
          m.material = Array.isArray(m.material) ? list : list[0]!;
          const sm = m as THREE.SkinnedMesh;
          if (sm.isSkinnedMesh && !bones.length) bones = sm.skeleton.bones.map((b) => b.name);
        });
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model, true);
        const size = box.getSize(new THREE.Vector3());
        const H = 1.9;
        const s = Math.min(H / Math.max(size.y, 1e-3), 2.5 / Math.max(size.x, size.z, 1e-3));
        model.scale.multiplyScalar(s);
        const ctr = box.getCenter(new THREE.Vector3()).multiplyScalar(s);
        model.position.set(-ctr.x, -box.min.y * s + 0.1, -ctr.z);
        holder.add(model);
        holder.updateMatrixWorld(true);
        st.reveal(model);
        // 소품
        const head = model.getObjectByName('Head'), headEnd = model.getObjectByName('Head_end');
        const tail = model.getObjectByName('Body4'), tailEnd = model.getObjectByName('Body4_end');
        if (head && headEnd) {
          const hat = partyHat(H);
          const p = head.getWorldPosition(new THREE.Vector3()).lerp(headEnd.getWorldPosition(new THREE.Vector3()), 0.8);
          p.y += 0.17 * s * size.y;
          attachTo(head, hat, p, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.25)));
          props.push(hat);
        }
        if (tail && tailEnd) {
          const f = flag(H * 1.5);
          attachTo(tail, f.g, tailEnd.getWorldPosition(new THREE.Vector3()));
          props.push(f.g);
          cloth = f.cloth;
        }
        mixer = new THREE.AnimationMixer(model);
        const byShort = new Map(gltf.animations.map((c) => [c.name.split('|').pop()!, c]));
        names = CLIP_ORDER.filter((n) => byShort.has(n));
        for (const [n] of byShort) if (!names.includes(n)) names.push(n);
        acts = names.map((n) => mixer!.clipAction(byShort.get(n)!));
        helper = new THREE.SkeletonHelper(model);
        (helper.material as THREE.LineBasicMaterial).depthTest = false;
        helper.visible = showBones;
        st.scene.add(helper);
        spin.visible = false;
        status = '';
        play(0);
      })
      .catch((e) => {
        console.error('[i467] 모델 불러오기 실패', e);
        status = '모델을 불러오지 못했어요';
      });
    const pLoad = st.hud.add(120, 22, 'free', (g, w, h) => {
      plate(g, w, h);
      txt(g, status, w / 2, h / 2 + 0.5, 9, '#fff', 'center', 800);
    }, 0.2);
    pLoad.fx = 0.5;
    pLoad.fy = 0.22;
    st.hud.add(132, 46, 'tl', (g, w, h) => {
      plate(g, w, h);
      const n = names[cur] ?? '';
      txt(g, cur >= 0 ? '▶ ' + (CLIP_KO[n] ?? n) + `  (${cur + 1}/${names.length})` : 'GLB 모델', 8, 11, 9, '#fff', 'left', 800);
      txt(g, `클립 ${names.length}개 · 뼈 ${bones.length}개`, 8, 25, 7.5, '#cfe0ff', 'left', 600);
      txt(g, '모자 → Head 뼈 · 깃발 → Body4 뼈', 8, 37, 7.5, '#ffd9a8', 'left', 600);
    }, 0.15);
    const pBones = st.hud.add(92, 118, 'tr', (g, w, h) => {
      plate(g, w, h);
      txt(g, '뼈 이름', 8, 10, 8, '#fff', 'left', 800);
      bones.slice(0, 12).forEach((b, i) => txt(g, (b === 'Head' || b === 'Body4' ? '● ' : '· ') + b, 8, 22 + i * 7.6, 6.6, b === 'Head' || b === 'Body4' ? '#ffd9a8' : '#c9d4ee', 'left', 600));
      if (bones.length > 12) txt(g, `… 외 ${bones.length - 12}개`, 8, h - 6, 6.6, '#8fa0c8', 'left', 600);
    }, 0.5);
    st.hud.add(124, 13, 'br', (g, w, h) => {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath();
      g.roundRect(0, 0, w, h, 4);
      g.fill();
      txt(g, 'Dragon Evolved · Quaternius · CC0', w / 2, h / 2 + 0.5, 6.3, '#ffffffcc', 'center', 600);
    }, 5);
    return {
      scene: st.scene,
      camera: st.camera,
      update(t, dt) {
        const d = Math.min(dt, 0.05);
        spin.rotation.z = -t * 4;
        pLoad.show = !!status;
        pBones.show = st.camera.aspect > 0 && bones.length > 0;
        holder.rotation.y = -0.75 + 0.35 * Math.sin(t * 0.35);
        if (mixer) {
          const slot = Math.floor(t / 2.8);
          play(manualClip >= 0 ? manualClip : slot % Math.max(1, names.length - 1));
          tint(manualHue >= 0 ? manualHue : HUES[slot % HUES.length]!);
          mixer.update(d);
        }
        for (const p of props) p.visible = showProps;
        if (helper) helper.visible = showBones;
        if (cloth) {
          const pa = cloth.geometry.attributes.position as THREE.BufferAttribute;
          const base = cloth.userData.base as Float32Array;
          for (let i = 0; i < pa.count; i++) {
            const x = base[i * 3]!;
            pa.setZ(i, Math.sin(x * 40 - t * 9) * x * 0.35);
          }
          pa.needsUpdate = true;
          cloth.geometry.computeVertexNormals();
        }
      },
      render: (r, w, h) => {
        pBones.show = h > 380 && bones.length > 0;
        st.render(r, w, h);
      },
      controls: [
        { type: 'range', label: '클립 (0 = 자동으로 바꾸기)', min: 0, max: 8, step: 1, value: 0, on: (v) => (manualClip = v - 1) },
        { type: 'range', label: '색 (0 = 원래 색)', min: 0, max: 1, step: 0.01, value: 0, on: (v) => (manualHue = v) },
        { type: 'toggle', label: '소품 (모자 · 깃발)', value: true, on: (v) => (showProps = v) },
        { type: 'toggle', label: '뼈 보기', value: false, on: (v) => (showBones = v) },
      ] as Control[],
      dispose() {
        dead = true;
        mixer?.stopAllAction();
        for (const m of ownMats) m.dispose();
        for (const p of props) disposeTree(p);
        helper?.dispose();
        // 모델 모양(geometry)은 캐시한 원본과 나눠 쓰므로 버리지 않는다
        holder.clear();
        st.disposeAll();
      },
    };
  },
};

export const DEMOS: DemoMap = { i462, i463, i464, i465, i466, i467 };

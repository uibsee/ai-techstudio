import * as THREE from 'three';
import type { Control, DemoMap, Scene3D } from './types';

/**
 * 「캐릭터 · 리깅」 견본 앞 여섯 (i456 ~ i461) — 블렌더 없이 코드만으로 뼈대 · 스킨 · 걷기 · IK · 시선.
 *
 * 공용 캐릭터 「점토 곰」: 머리 · 몸 · 귀 · 주둥이 · 팔다리를 거리 함수(SDF)로 부드럽게 합친 뒤
 * 표면 그물로 한 덩어리 매끈한 메시를 뽑는다 (이음새 없음). 화면을 막지 않게 프레임마다 3ms 씩 나눠 만든다. 그 메시에 뼈 16개를 코드로 세우고
 * 정점마다 「뼈 막대까지 거리」로 가중치를 매겨 SkinnedMesh 로 묶는다 — 모양 · 가중치는 한 번 만들어 모듈에 둔다.
 * 3D 견본은 포인터를 받지 않는 구조라, 크게 보기에서는 화면 캔버스를 찾아 마우스를 직접 듣는다 (BigPointer).
 */

type R = THREE.WebGLRenderer;
type P3 = readonly [number, number, number];
const FONT = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
const Y = new THREE.Vector3(0, 1, 0);
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const sstep = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const frac = (v: number): number => v - Math.floor(v);
const damp = (dt: number, tau: number): number => 1 - Math.exp(-dt / Math.max(1e-4, tau));

/* ═════════════ 거리 함수로 빚는 점토 곰 ═════════════ */

const SH: P3 = [0.24, 1.18, 0]; // 어깨 (왼쪽 = +x)
const AD: P3 = [0.766, -0.643, 0]; // 팔 방향 (A 자세 40°)
const EL: P3 = [SH[0] + AD[0] * 0.27, SH[1] + AD[1] * 0.27, 0];
const HD: P3 = [EL[0] + AD[0] * 0.24, EL[1] + AD[1] * 0.24, 0]; // 손바닥 가운데
const HP: P3 = [0.16, 0.74, 0]; // 고관절
const KN: P3 = [0.16, 0.44, 0];
const AN: P3 = [0.16, 0.14, 0];
const TO: P3 = [0.16, 0.06, 0.18];
const mx = (p: P3): P3 => [-p[0], p[1], p[2]];

interface BoneDef {
  name: string;
  ko: string;
  parent: number;
  head: P3;
  tail: P3;
  r: number; // 살 두께 (가중치 거리에서 뺌, 0 = 가중치 없음)
}
const BONES: BoneDef[] = [
  { name: 'root', ko: '뿌리', parent: -1, head: [0, 0, 0], tail: [0, 0.8, 0], r: 0 },
  { name: 'hips', ko: '골반', parent: 0, head: [0, 0.8, 0], tail: [0, 0.98, 0], r: 0.3 },
  { name: 'spine', ko: '척추', parent: 1, head: [0, 0.98, 0], tail: [0, 1.14, 0], r: 0.3 },
  { name: 'chest', ko: '가슴', parent: 2, head: [0, 1.14, 0], tail: [0, 1.3, 0], r: 0.27 },
  { name: 'neck', ko: '목', parent: 3, head: [0, 1.3, 0], tail: [0, 1.42, 0], r: 0.17 },
  { name: 'head', ko: '머리', parent: 4, head: [0, 1.42, 0], tail: [0, 1.98, 0], r: 0.36 },
  { name: 'upperArm.L', ko: '왼 위팔', parent: 3, head: SH, tail: EL, r: 0.095 },
  { name: 'foreArm.L', ko: '왼 아래팔', parent: 6, head: EL, tail: HD, r: 0.085 },
  { name: 'upperArm.R', ko: '오른 위팔', parent: 3, head: mx(SH), tail: mx(EL), r: 0.095 },
  { name: 'foreArm.R', ko: '오른 아래팔', parent: 8, head: mx(EL), tail: mx(HD), r: 0.085 },
  { name: 'thigh.L', ko: '왼 넓적다리', parent: 1, head: HP, tail: KN, r: 0.12 },
  { name: 'shin.L', ko: '왼 정강이', parent: 10, head: KN, tail: AN, r: 0.105 },
  { name: 'foot.L', ko: '왼 발', parent: 11, head: AN, tail: TO, r: 0.1 },
  { name: 'thigh.R', ko: '오른 넓적다리', parent: 1, head: mx(HP), tail: mx(KN), r: 0.12 },
  { name: 'shin.R', ko: '오른 정강이', parent: 13, head: mx(KN), tail: mx(AN), r: 0.105 },
  { name: 'foot.R', ko: '오른 발', parent: 14, head: mx(AN), tail: mx(TO), r: 0.1 },
];
const NB = BONES.length;
const BI: Record<string, number> = {};
BONES.forEach((b, i) => (BI[b.name] = i));

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
/** 굵기가 바뀌는 캡슐 (근사) */
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
const HAND_C: P3 = [HD[0] + AD[0] * 0.035, HD[1] + AD[1] * 0.035, 0.01];
function bearSdf(x: number, y: number, z: number): number {
  const ax = Math.abs(x);
  let d = cone(x, y, z, [0, 0.84, 0], 0.34, [0, 1.18, 0], 0.27);
  d = smin(d, ell(x, y, z, [0, 1.72, 0], [0.46, 0.41, 0.41]), 0.14);
  d = smin(d, ell(ax, y, z, [0.3, 2.02, -0.02], [0.13, 0.13, 0.085]), 0.05);
  d = smin(d, ell(x, y, z, [0, 1.6, 0.31], [0.17, 0.115, 0.13]), 0.07);
  d = smin(d, sph(x, y, z, [0, 0.84, -0.34], 0.09), 0.05);
  // 팔 (좌우 대칭 — |x|)
  let arm = cone(ax, y, z, SH, 0.1, EL, 0.085);
  arm = smin(arm, cone(ax, y, z, EL, 0.085, HD, 0.075), 0.03);
  arm = smin(arm, sph(ax, y, z, HAND_C, 0.098), 0.05);
  d = smin(d, arm, 0.07);
  // 다리
  let leg = cone(ax, y, z, HP, 0.125, KN, 0.11);
  leg = smin(leg, cone(ax, y, z, KN, 0.11, AN, 0.1), 0.03);
  leg = smin(leg, ell(ax, y, z, [0.16, 0.095, 0.05], [0.13, 0.09, 0.19]), 0.05);
  d = smin(d, leg, 0.06);
  return d;
}

/**
 * 한 덩어리 메시 + 색 + 가중치 (모듈에 한 번, 여섯 견본이 함께 씀).
 * 화면을 막지 않도록 생성기(generator)로 잘게 나눠 만든다 — bearReady() 가 한 프레임에 3ms 까지만 진행.
 * 표면 뽑기는 「표면 그물(surface nets)」: 부호가 바뀌는 칸마다 점 하나, 부호가 바뀌는 모서리마다 네모 하나 —
 * 점이 처음부터 공유되어 합치기가 필요 없고, 층(z) 단위로 나눠 돌리기 쉽다. 그 뒤 점을 거리 함수 위로 끌어 붙인다.
 */
interface Base {
  pos: Float32Array;
  nrm: Float32Array;
  col: Float32Array;
  idx: Uint32Array;
  n: number;
}
type WMode = 'smooth' | 'nearest';
interface Weights {
  si: Uint16Array;
  sw: Float32Array;
}
let BASE: Base | null = null;
const WCACHE: Partial<Record<WMode, Weights>> = {};
let BUILD: Generator<void, void, void> | null = null;
let PROG = 0;
let lastStep = -1e9;
const BUDGET_MS = 2;
let lastCreate = -1e9;
/** 곰 만들어 끼우기는 프레임마다 견본 하나씩만 (한꺼번에 몰리지 않게) */
function createSlot(): boolean {
  const now = performance.now();
  if (now - lastCreate < 10 || now - lastStep < 10) return false;
  lastCreate = now;
  return true;
}

/** 정점 → 뼈 막대까지 거리 */
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

/** 곰이 다 만들어졌나 — 아니면 이번 프레임 몫(3ms)만큼 더 만든다. 여러 카드가 불러도 프레임마다 한 번만 */
function bearReady(): boolean {
  if (BASE && WCACHE.smooth && WCACHE.nearest) return true;
  const now = performance.now();
  if (now - lastStep < 10) return false;
  if (!BUILD) BUILD = buildBear();
  const end = now + BUDGET_MS;
  while (performance.now() < end) if (BUILD.next().done) break;
  lastStep = performance.now();
  return !!(BASE && WCACHE.smooth && WCACHE.nearest);
}

function* buildBear(): Generator<void, void, void> {
  const R = 88;
  const S = 1.2;
  const C: P3 = [0, 1.08, 0];
  const step = (2 * S) / R;
  const gx = (i: number): number => C[0] - S + i * step;
  const gy = (i: number): number => C[1] - S + i * step;
  const gz = (i: number): number => C[2] - S + i * step;
  const R2 = R * R;
  // 1) 거리 값 (층마다)
  const F = new Float32Array(R * R2);
  for (let iz = 0; iz < R; iz++) {
    const z = gz(iz);
    for (let iy = 0; iy < R; iy++) {
      const y = gy(iy);
      for (let ix = 0; ix < R; ix++) F[ix + iy * R + iz * R2] = bearSdf(gx(ix), y, z);
      if (iy % 22 === 21) yield;
    }
    PROG = 0.25 * (iz / R);
    yield;
  }
  // 2) 칸마다 점 (부호가 바뀌는 칸만, 모서리 교차점 평균)
  const cell = new Int32Array(R * R2).fill(-1);
  const P: number[] = [];
  const EDGES = [
    [0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7],
  ] as const;
  const cv = new Float64Array(8);
  for (let iz = 0; iz < R - 1; iz++) {
    for (let iy = 0; iy < R - 1; iy++) {
      for (let ix = 0; ix < R - 1; ix++) {
        let neg = 0;
        for (let k = 0; k < 8; k++) {
          const v = F[ix + (k & 1) + (iy + ((k >> 1) & 1)) * R + (iz + (k >> 2)) * R2]!;
          cv[k] = v;
          if (v < 0) neg++;
        }
        if (neg === 0 || neg === 8) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let m = 0;
        for (const [a, b] of EDGES) {
          const va = cv[a]!;
          const vb = cv[b]!;
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          sx += (a & 1) + ((b & 1) - (a & 1)) * t;
          sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
          sz += (a >> 2) + ((b >> 2) - (a >> 2)) * t;
          m++;
        }
        cell[ix + iy * R + iz * R2] = P.length / 3;
        P.push(gx(ix + sx / m), gy(iy + sy / m), gz(iz + sz / m));
      }
      if (iy % 29 === 28) yield;
    }
    PROG = 0.25 + 0.15 * (iz / R);
    yield;
  }
  // 3) 부호가 바뀌는 모서리마다 네모 (둘레 네 칸의 점을 잇기)
  const I: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean): void => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) I.push(a, c, b, a, d, c);
    else I.push(a, b, c, a, c, d);
  };
  const ci = (x: number, y: number, z: number): number => cell[x + y * R + z * R2]!;
  for (let iz = 1; iz < R - 1; iz++) {
    for (let iy = 1; iy < R - 1; iy++)
      for (let ix = 1; ix < R - 1; ix++) {
        const v0 = F[ix + iy * R + iz * R2]! < 0;
        if (v0 !== F[ix + 1 + iy * R + iz * R2]! < 0) quad(ci(ix, iy - 1, iz - 1), ci(ix, iy, iz - 1), ci(ix, iy, iz), ci(ix, iy - 1, iz), !v0);
        if (v0 !== F[ix + (iy + 1) * R + iz * R2]! < 0) quad(ci(ix - 1, iy, iz - 1), ci(ix - 1, iy, iz), ci(ix, iy, iz), ci(ix, iy, iz - 1), !v0);
        if (v0 !== F[ix + iy * R + (iz + 1) * R2]! < 0) quad(ci(ix - 1, iy - 1, iz), ci(ix, iy - 1, iz), ci(ix, iy, iz), ci(ix - 1, iy, iz), !v0);
      }
    PROG = 0.4 + 0.1 * (iz / R);
    yield;
  }
  const n = P.length / 3;
  const pos = new Float32Array(P);
  const idx = new Uint32Array(I);
  // 4) 점을 표면 위로 끌어 붙이고 법선 = 기울기, 색 칠하기
  const nrm = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const cBase = new THREE.Color(0xd08a52);
  const cCream = new THREE.Color(0xf5dcb5);
  const cBlush = new THREE.Color(0xf09a9a);
  const cShoe = new THREE.Color(0xe0473f);
  const cSole = new THREE.Color(0xf4f1ea);
  const cPaw = new THREE.Color(0xe6b07e);
  const tmp = new THREE.Color();
  const e = 0.004;
  for (let i = 0; i < n; i++) {
    let x = pos[i * 3]!;
    let y = pos[i * 3 + 1]!;
    let z = pos[i * 3 + 2]!;
    let ngx = 0;
    let ngy = 1;
    let ngz = 0;
    for (let it = 0; it < 2; it++) {
      const d = bearSdf(x, y, z);
      const ddx = (bearSdf(x + e, y, z) - bearSdf(x - e, y, z)) / (2 * e);
      const ddy = (bearSdf(x, y + e, z) - bearSdf(x, y - e, z)) / (2 * e);
      const ddz = (bearSdf(x, y, z + e) - bearSdf(x, y, z - e)) / (2 * e);
      const g2 = ddx * ddx + ddy * ddy + ddz * ddz || 1;
      const k = clamp(d / g2, -step, step);
      x -= ddx * k;
      y -= ddy * k;
      z -= ddz * k;
      const gl = Math.sqrt(g2);
      ngx = ddx / gl;
      ngy = ddy / gl;
      ngz = ddz / gl;
    }
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    nrm[i * 3] = ngx;
    nrm[i * 3 + 1] = ngy;
    nrm[i * 3 + 2] = ngz;
    const ax = Math.abs(x);
    tmp.copy(cBase);
    tmp.lerp(cCream, 1 - sstep(0.75, 1.0, h3(x / 0.21, (y - 0.95) / 0.25, Math.max(0, 0.3 - z) / 0.18)));
    tmp.lerp(cCream, 1 - sstep(0.8, 1.05, h3(x / 0.16, (y - 1.6) / 0.11, Math.max(0, 0.36 - z) / 0.08)));
    tmp.lerp(cBlush, (1 - sstep(0.7, 1.0, h3((ax - 0.3) / 0.075, (y - 2.02) / 0.075, Math.max(0, 0.03 - z) / 0.04))) * 0.6);
    tmp.lerp(cPaw, sstep(0.55, 0.7, ax) * sstep(0.95, 0.85, y));
    tmp.lerp(cBlush, (1 - sstep(0.4, 1.0, h3((ax - 0.27) / 0.075, (y - 1.62) / 0.06, Math.max(0, 0.28 - z) / 0.06))) * 0.75);
    tmp.lerp(cShoe, sstep(0.19, 0.16, y));
    tmp.lerp(cSole, sstep(0.045, 0.03, y));
    col[i * 3] = tmp.r;
    col[i * 3 + 1] = tmp.g;
    col[i * 3 + 2] = tmp.b;
    if ((i & 63) === 63) {
      PROG = 0.5 + 0.15 * (i / n);
      yield;
    }
  }
  // 감기 방향 맞추기 (면 법선 vs 기울기 다수결)
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
  // 5) 이웃 (CSR — 점마다 이웃 목록)
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
  // 6) 가중치: 뼈 막대까지 거리 (살 두께 뺌) → 가까운 뼈 하나 / 거리⁻⁴ 섞기
  let full = new Float32Array(n * NB);
  const near = new Uint8Array(n);
  const p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    p.fromArray(pos, i * 3);
    let best = 1;
    let bd = 1e9;
    let sum = 0;
    for (let b = 1; b < NB; b++) {
      const bd0 = BONES[b]!;
      const d = Math.max(segDist(p, bd0.head, bd0.tail) - bd0.r * 0.85, 0) + 0.025;
      if (d < bd) {
        bd = d;
        best = b;
      }
      const w = 1 / (d * d * d * d);
      full[i * NB + b] = w;
      sum += w;
    }
    near[i] = best;
    for (let b = 1; b < NB; b++) full[i * NB + b] = full[i * NB + b]! / sum;
    if ((i & 127) === 127) {
      PROG = 0.65 + 0.07 * (i / n);
      yield;
    }
  }
  {
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      si[i * 4] = near[i]!;
      sw[i * 4] = 1;
    }
    WCACHE.nearest = { si, sw };
  }
  // 7) 표면을 따라 이웃과 평균 내기 10번 — 관절 둘레로 고르게 퍼짐
  let next = new Float32Array(n * NB);
  const ITER = 10;
  for (let it = 0; it < ITER; it++) {
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
      if ((i & 127) === 127) {
        PROG = 0.72 + 0.23 * ((it + i / n) / ITER);
        yield;
      }
    }
    const sw = full;
    full = next;
    next = sw;
  }
  // 8) 가장 큰 넷만 남기고 합 1로
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
    if ((i & 511) === 511) yield;
  }
  WCACHE.smooth = { si, sw };
  BASE = { pos, nrm, col, idx, n };
  PROG = 1;
}

/** 만드는 동안 보이는 표시 — 「점토 곰 빚는 중」 + 진행 막대 */
function makeLoader(scene: THREE.Scene, at: P3): { set(p: number, t: number): void; done(): void; dispose(): void } {
  const g = new THREE.Group();
  g.position.set(at[0], at[1], at[2]);
  const lab = makeLabel('점토 곰 빚는 중', '#ffe58a', 'rgba(14,18,40,0.78)', 0.2);
  lab.position.y = 0.22;
  const gBar = new THREE.PlaneGeometry(1, 1);
  const mBg = new THREE.MeshBasicMaterial({ color: 0x1a2140, depthTest: false, transparent: true, opacity: 0.85 });
  const mFg = new THREE.MeshBasicMaterial({ color: 0xffd84a, depthTest: false, transparent: true });
  const bg = new THREE.Mesh(gBar, mBg);
  bg.scale.set(0.9, 0.05, 1);
  const fg = new THREE.Mesh(gBar, mFg);
  bg.renderOrder = 30;
  fg.renderOrder = 31;
  g.add(lab, bg, fg);
  // 통통 튀는 점토 공
  const gBall = new THREE.SphereGeometry(0.09, 24, 16);
  const mBall = new THREE.MeshStandardMaterial({ color: 0xd08a52, roughness: 0.6 });
  const ball = new THREE.Mesh(gBall, mBall);
  g.add(ball);
  scene.add(g);
  return {
    set(p, t) {
      const w = 0.86 * clamp(p, 0.02, 1);
      fg.scale.set(w, 0.032, 1);
      fg.position.x = -0.43 + w / 2;
      const b = Math.abs(Math.sin(t * 5));
      ball.position.set(0, -0.3 + b * 0.25, 0);
      ball.scale.set(1 + (1 - b) * 0.25, 1 - (1 - b) * 0.25, 1 + (1 - b) * 0.25);
    },
    done() {
      g.visible = false;
    },
    dispose() {
      scene.remove(g);
      disposeSprite(lab);
      gBar.dispose();
      mBg.dispose();
      mFg.dispose();
      gBall.dispose();
      mBall.dispose();
    },
  };
}


/* ═════════════ 캐릭터 ═════════════ */

interface Char {
  group: THREE.Group;
  mesh: THREE.SkinnedMesh;
  mat: THREE.MeshPhysicalMaterial;
  bones: THREE.Bone[];
  b(name: string): THREE.Bone;
  eyes: THREE.Group[]; // 눈알 (돌릴 수 있음)
  sockets: THREE.Group[]; // 눈 자리 (깜빡임 = 세로 줄이기)
  setHeat(bone: number | null): void;
  rest(): void;
  dispose(): void;
}
function heatColor(w: number, out: THREE.Color): THREE.Color {
  // 파랑 → 하늘 → 초록 → 노랑 → 빨강
  const stops = [
    [0.2, 0.3, 0.85],
    [0.15, 0.65, 0.98],
    [0.1, 0.85, 0.35],
    [1.0, 0.85, 0.1],
    [0.95, 0.12, 0.08],
  ];
  const x = clamp(w, 0, 1) * 4;
  const i = Math.min(3, Math.floor(x));
  const t = x - i;
  const a = stops[i]!;
  const b = stops[i + 1]!;
  return out.setRGB(lerp(a[0]!, b[0]!, t), lerp(a[1]!, b[1]!, t), lerp(a[2]!, b[2]!, t), THREE.SRGBColorSpace);
}
let LUT: Float32Array | null = null;
function heatLut(): Float32Array {
  if (LUT) return LUT;
  LUT = new Float32Array(256 * 3);
  const c = new THREE.Color();
  for (let i = 0; i < 256; i++) {
    heatColor(i / 255, c);
    LUT[i * 3] = c.r;
    LUT[i * 3 + 1] = c.g;
    LUT[i * 3 + 2] = c.b;
  }
  return LUT;
}
function makeChar(mode: WMode = 'smooth'): Char {
  const B = BASE!;
  const W = WCACHE[mode]!;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(B.pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(B.nrm, 3));
  const colArr = new Float32Array(B.col);
  const colAttr = new THREE.BufferAttribute(colArr, 3);
  geo.setAttribute('color', colAttr);
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(W.si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(W.sw, 4));
  geo.setIndex(new THREE.BufferAttribute(B.idx, 1));
  const mat = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.58,
    metalness: 0,
    sheen: 0.5,
    sheenRoughness: 0.7,
    sheenColor: new THREE.Color(0xffe6cc),
    clearcoat: 0.12,
    clearcoatRoughness: 0.6,
  });
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  const bones: THREE.Bone[] = [];
  BONES.forEach((d, i) => {
    const bn = new THREE.Bone();
    bn.name = d.name;
    const ph = d.parent >= 0 ? BONES[d.parent]!.head : ([0, 0, 0] as P3);
    bn.position.set(d.head[0] - ph[0], d.head[1] - ph[1], d.head[2] - ph[2]);
    if (d.parent >= 0) bones[d.parent]!.add(bn);
    bones[i] = bn;
  });
  mesh.add(bones[0]!);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  const group = new THREE.Group();
  group.add(mesh);

  // 얼굴 소품 (머리뼈에 붙임)
  const head = bones[BI['head']!]!;
  const hp = BONES[BI['head']!]!.head;
  const own: { geo: THREE.BufferGeometry[]; mat: THREE.Material[] } = { geo: [], mat: [] };
  const gSclera = new THREE.SphereGeometry(0.074, 28, 20);
  const gIris = new THREE.SphereGeometry(0.056, 28, 20);
  const gHi = new THREE.SphereGeometry(0.017, 12, 8);
  const gNose = new THREE.SphereGeometry(1, 24, 16);
  const gMouth = new THREE.TorusGeometry(0.034, 0.008, 8, 20, Math.PI);
  const mSclera = new THREE.MeshPhysicalMaterial({ color: 0xfbfbf6, roughness: 0.25, clearcoat: 0.6 });
  const mIris = new THREE.MeshPhysicalMaterial({ color: 0x24160f, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.1 });
  const mHi = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const mNose = new THREE.MeshPhysicalMaterial({ color: 0x3a2318, roughness: 0.3, clearcoat: 0.8 });
  const mMouth = new THREE.MeshStandardMaterial({ color: 0x4a2a1c, roughness: 0.6 });
  own.geo.push(gSclera, gIris, gHi, gNose, gMouth);
  own.mat.push(mSclera, mIris, mHi, mNose, mMouth);
  const eyes: THREE.Group[] = [];
  const sockets: THREE.Group[] = [];
  for (const s of [1, -1]) {
    const sock = new THREE.Group();
    sock.position.set(s * 0.155 - hp[0], 1.75 - hp[1], 0.33 - hp[2]);
    sock.rotation.y = s * 0.28;
    const eye = new THREE.Group();
    const scl = new THREE.Mesh(gSclera, mSclera);
    scl.scale.set(1, 1.18, 1);
    const iris = new THREE.Mesh(gIris, mIris);
    iris.position.z = 0.03;
    iris.scale.set(1, 1.15, 0.85);
    const hi = new THREE.Mesh(gHi, mHi);
    hi.position.set(0.02, 0.03, 0.078);
    eye.add(scl, iris, hi);
    sock.add(eye);
    head.add(sock);
    eyes.push(eye);
    sockets.push(sock);
  }
  const nose = new THREE.Mesh(gNose, mNose);
  nose.scale.set(0.055, 0.038, 0.04);
  nose.position.set(0, 1.645 - hp[1], 0.43);
  const mouth = new THREE.Mesh(gMouth, mMouth);
  mouth.position.set(0, 1.585 - hp[1], 0.432);
  mouth.rotation.set(-0.25, 0, Math.PI);
  head.add(nose, mouth);

  return {
    group,
    mesh,
    mat,
    bones,
    b: (name) => bones[BI[name]!]!,
    eyes,
    sockets,
    setHeat(bone) {
      if (bone === null) colArr.set(B.col);
      else {
        const lut = heatLut();
        for (let i = 0; i < B.n; i++) {
          let w = 0;
          for (let k = 0; k < 4; k++) if (W.si[i * 4 + k] === bone) w += W.sw[i * 4 + k]!;
          const j = Math.round(clamp(w, 0, 1) * 255) * 3;
          colArr[i * 3] = lut[j]!;
          colArr[i * 3 + 1] = lut[j + 1]!;
          colArr[i * 3 + 2] = lut[j + 2]!;
        }
      }
      colAttr.needsUpdate = true;
    },
    rest() {
      BONES.forEach((d, i) => {
        const bn = bones[i]!;
        const ph = d.parent >= 0 ? BONES[d.parent]!.head : ([0, 0, 0] as P3);
        bn.position.set(d.head[0] - ph[0], d.head[1] - ph[1], d.head[2] - ph[2]);
        bn.quaternion.identity();
        bn.scale.set(1, 1, 1);
      });
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      mesh.skeleton.dispose();
      own.geo.forEach((g) => g.dispose());
      own.mat.forEach((m) => m.dispose());
    },
  };
}

/* ═════════════ 뼈 보기 (블렌더 꼴 팔면체 막대) ═════════════ */

function boneStickGeo(): THREE.BufferGeometry {
  const w = 0.1;
  const v = [0, 0, 0, w, 0.15, 0, 0, 0.15, w, -w, 0.15, 0, 0, 0.15, -w, 0, 1, 0];
  const f = [0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 1, 4, 5, 1, 2, 5, 2, 3, 5, 3, 4, 5, 4, 1];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(f);
  const ng = g.toNonIndexed();
  g.dispose();
  ng.computeVertexNormals();
  return ng;
}
const CHAIN_COL: Record<string, number> = { c: 0xffd84a, L: 0x5ad1ff, R: 0xff7ab8 };
class BoneViz {
  group = new THREE.Group();
  sticks: THREE.Mesh[] = [];
  joints: THREE.Mesh[] = [];
  private tails: THREE.Vector3[] = [];
  private geo = boneStickGeo();
  private jgeo = new THREE.SphereGeometry(0.022, 14, 10);
  private mats: THREE.Material[] = [];
  private _a = new THREE.Vector3();
  private _b = new THREE.Vector3();
  constructor(private c: Char) {
    const matFor = new Map<number, THREE.MeshBasicMaterial>();
    const get = (col: number): THREE.MeshBasicMaterial => {
      let m = matFor.get(col);
      if (!m) {
        m = new THREE.MeshBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: 0.92 });
        matFor.set(col, m);
        this.mats.push(m);
      }
      return m;
    };
    const jm = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.95 });
    this.mats.push(jm);
    BONES.forEach((d, i) => {
      const side = d.name.endsWith('.L') ? 'L' : d.name.endsWith('.R') ? 'R' : 'c';
      const s = new THREE.Mesh(this.geo, get(CHAIN_COL[side]!));
      s.renderOrder = 20;
      const j = new THREE.Mesh(this.jgeo, jm);
      j.renderOrder = 21;
      if (i === 0) s.visible = false;
      this.sticks.push(s);
      this.joints.push(j);
      this.group.add(s, j);
      this.tails.push(new THREE.Vector3(d.tail[0] - d.head[0], d.tail[1] - d.head[1], d.tail[2] - d.head[2]));
    });
  }
  update(grow = 1e9): void {
    this.c.group.updateMatrixWorld(true);
    const S = this.c.group.getWorldScale(this._b).x;
    for (let i = 0; i < NB; i++) {
      const bn = this.c.bones[i]!;
      const st = this.sticks[i]!;
      const jt = this.joints[i]!;
      const k = clamp(grow - i, 0, 1);
      bn.getWorldPosition(this._a);
      jt.position.copy(this._a);
      jt.scale.setScalar(S * sstep(0, 0.3, k) + 1e-4);
      const tail = this._b.copy(this.tails[i]!).applyMatrix4(bn.matrixWorld);
      const dir = tail.sub(this._a);
      const len = dir.length();
      st.position.copy(this._a);
      st.quaternion.setFromUnitVectors(Y, dir.normalize());
      const e = sstep(0, 1, k);
      st.scale.set(Math.min(len, 0.3 * S) * e + 1e-4, len * e + 1e-4, Math.min(len, 0.3 * S) * e + 1e-4);
    }
  }
  dispose(): void {
    this.geo.dispose();
    this.jgeo.dispose();
    this.mats.forEach((m) => m.dispose());
  }
}

/* ═════════════ 무대 (공통) ═════════════ */

function gradTex(top: string, bottom: string): THREE.CanvasTexture {
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
function blobTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)');
  gr.addColorStop(0.5, 'rgba(0,0,0,0.25)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
function glowTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.18, 'rgba(255,255,255,0.7)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.18)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
function makeLabel(text: string, fg = '#ffffff', bg = 'rgba(14,18,40,0.72)', h = 0.16): THREE.Sprite {
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  const fs = 54;
  g.font = `800 ${fs}px ${FONT}`;
  const tw = Math.ceil(g.measureText(text).width);
  c.width = tw + 60;
  c.height = 84;
  g.font = `800 ${fs}px ${FONT}`;
  g.fillStyle = bg;
  const r = 40;
  g.beginPath();
  g.roundRect(2, 2, c.width - 4, c.height - 4, r);
  g.fill();
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  sp.scale.set((h * c.width) / c.height, h, 1);
  sp.renderOrder = 30;
  return sp;
}
function disposeSprite(s: THREE.Sprite): void {
  s.material.map?.dispose();
  s.material.dispose();
}

interface Stage {
  scene: THREE.Scene;
  cam: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  disc: THREE.Mesh;
  own: { dispose(): void }[];
  /** 셰이더를 비동기로 미리 데운 뒤에 무대에 넣기 (첫 그리기에서 화면이 멈추지 않게) */
  later(objs: THREE.Object3D[], shown?: () => void): void;
  warm: 0 | 1 | 2;
  queue: THREE.Object3D[];
  qwarm: 0 | 1 | 2 | 3;
  onShown: (() => void)[];
}
/**
 * 무대 그리기 — 처음엔 compileAsync 로 셰이더를 병렬 컴파일하고(그동안 빈 바탕), 곰처럼 나중에 오는 물체도
 * 따로 데운 뒤 넣는다. 그림자는 다른 카드와 나눠 쓰는 renderer 라 끝나면 되돌린다.
 */
function stageRender(st: Stage, r: R): void {
  withShadows(r, () => {
    if (st.warm !== 2) {
      if (st.warm === 0) {
        st.warm = 1;
        r.compileAsync(st.scene, st.cam).then(
          () => (st.warm = 2),
          () => (st.warm = 2),
        );
      }
      r.setClearColor(0x161c33, 1);
      r.clear();
      return;
    }
    if (st.queue.length) {
      if (st.qwarm === 0) {
        st.qwarm = 1;
        const tmp = new THREE.Scene();
        st.queue.forEach((o) => tmp.add(o));
        r.compileAsync(tmp, st.cam, st.scene).then(
          () => (st.qwarm = 2),
          () => (st.qwarm = 2),
        );
      } else if (st.qwarm === 2) {
        // 화면에 넣기 전, 그림자까지 켠 채 한 번 「몰래」 그려 그림자 · 깊이 셰이더와 첫 업로드를 끝낸다
        // (렌더 타깃에 그리면 톤 매핑 · 색 공간이 달라 셰이더가 따로 생기므로 같은 화면에 그리고 바로 덮어쓴다).
        // 멈춤이 생겨도 「빚는 중」 표시가 떠 있는 동안 — 다음 프레임에 넣는다.
        st.queue.forEach((o) => st.scene.add(o));
        r.render(st.scene, st.cam);
        st.queue.forEach((o) => st.scene.remove(o));
        st.qwarm = 3;
      } else if (st.qwarm === 3) {
        st.queue.forEach((o) => st.scene.add(o));
        st.queue.length = 0;
        st.qwarm = 0;
        st.onShown.splice(0).forEach((f) => f());
      }
    }
    r.render(st.scene, st.cam);
  });
}
function makeStage(cam: P3, look: P3, fov = 32, radius = 1.9, top = '#2b3560', bottom = '#121729'): Stage {
  const scene = new THREE.Scene();
  const bg = gradTex(top, bottom);
  scene.background = bg;
  scene.add(new THREE.HemisphereLight(0xe4ecff, 0x40384f, 1.25));
  const sun = new THREE.DirectionalLight(0xfff0da, 2.4);
  sun.position.set(2.4, 5.2, 3.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = -2.4;
  sc.right = 2.4;
  sc.top = 2.6;
  sc.bottom = -2.2;
  sc.near = 1;
  sc.far = 14;
  sun.shadow.radius = 3;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.025;
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight(0x9db8ff, 0.9);
  rim.position.set(-3, 2.5, -4);
  scene.add(rim);
  const gDisc = new THREE.CylinderGeometry(radius, radius * 1.03, 0.2, 72);
  const mDisc = new THREE.MeshStandardMaterial({ color: 0x55608f, roughness: 0.85 });
  const disc = new THREE.Mesh(gDisc, mDisc);
  disc.position.y = -0.1;
  disc.receiveShadow = true;
  scene.add(disc);
  const gRim = new THREE.TorusGeometry(radius * 1.015, 0.025, 10, 96);
  const mRim = new THREE.MeshStandardMaterial({ color: 0x8b97c9, roughness: 0.5 });
  const rimM = new THREE.Mesh(gRim, mRim);
  rimM.rotation.x = Math.PI / 2;
  scene.add(rimM);
  const camera = new THREE.PerspectiveCamera(fov, 1.6, 0.05, 60);
  camera.position.set(cam[0], cam[1], cam[2]);
  camera.lookAt(look[0], look[1], look[2]);
  const st: Stage = {
    scene,
    cam: camera,
    sun,
    disc,
    own: [bg, gDisc, mDisc, gRim, mRim],
    warm: 0,
    queue: [],
    qwarm: 0,
    onShown: [],
    later(objs, shown) {
      if (st.qwarm !== 0) {
        // 데우는 중이면 다음 차례로 (지금 묶음이 끝난 뒤)
        st.onShown.push(() => st.later(objs, shown));
        return;
      }
      st.queue.push(...objs);
      if (shown) st.onShown.push(shown);
    },
  };
  return st;
}
function blob(tex: THREE.Texture, size: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.003;
  m.renderOrder = 1;
  return m;
}
function disposeMesh(m: THREE.Mesh): void {
  m.geometry.dispose();
  (m.material as THREE.Material).dispose();
}
function withShadows(r: R, fn: () => void): void {
  const en = r.shadowMap.enabled;
  const ty = r.shadowMap.type;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFShadowMap;
  fn();
  r.shadowMap.enabled = en;
  r.shadowMap.type = ty;
}

/** 크게 보기에서만 — 화면 캔버스(.hub-canvas)를 크기로 찾아 마우스를 듣는다 */
class BigPointer {
  ndc = new THREE.Vector2();
  private el: HTMLCanvasElement | null = null;
  private last = -1e9;
  private on = false;
  attach(w: number, h: number): void {
    if (this.el || w < 700) return;
    for (const c of Array.from(document.querySelectorAll<HTMLCanvasElement>('canvas.hub-canvas')))
      if (c.width === w && c.height === h) {
        this.el = c;
        c.addEventListener('pointermove', this.move);
        c.addEventListener('pointerdown', this.move);
        c.addEventListener('pointerleave', this.leave);
        c.style.cursor = 'crosshair';
        break;
      }
  }
  private move = (e: PointerEvent): void => {
    const r = this.el!.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.on = true;
    this.last = performance.now();
  };
  private leave = (): void => {
    this.on = false;
  };
  live(): boolean {
    return this.on && performance.now() - this.last < 4000;
  }
  /** 카메라에서 평면(법선 n, 점 p)으로 */
  hit(cam: THREE.Camera, n: THREE.Vector3, p: THREE.Vector3, out: THREE.Vector3): boolean {
    const rc = new THREE.Raycaster();
    rc.setFromCamera(this.ndc, cam);
    return !!rc.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(n, p), out);
  }
  dispose(): void {
    if (!this.el) return;
    this.el.removeEventListener('pointermove', this.move);
    this.el.removeEventListener('pointerdown', this.move);
    this.el.removeEventListener('pointerleave', this.leave);
    this.el.style.cursor = '';
    this.el = null;
  }
}

/* ═════════════ IK 풀이 ═════════════ */

const _m4 = new THREE.Matrix4();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _va = new THREE.Vector3();
const _vb = new THREE.Vector3();
const _vc = new THREE.Vector3();
const _vd = new THREE.Vector3();
/**
 * 두 뼈 IK — 코사인 법칙. upper(어깨) · mid(팔꿈치) 의 쉼 자세 회전은 단위(코드로 세운 뼈라 늘 그렇다).
 * endLocal = 끝점(손)의 mid 기준 위치, target · pole = 세계 좌표 (pole = 팔꿈치가 향할 쪽 방향).
 * 돌려주는 값: 팔꿈치 세계 위치, 닿았는지
 */
function twoBoneIK(upper: THREE.Bone, mid: THREE.Bone, endLocal: THREE.Vector3, target: THREE.Vector3, pole: THREE.Vector3, elbowOut?: THREE.Vector3): boolean {
  const parent = upper.parent!;
  parent.updateWorldMatrix(true, false);
  const inv = _m4.copy(parent.matrixWorld).invert();
  const A = _va.copy(upper.position);
  const T = _vb.copy(target).applyMatrix4(inv);
  const pq = parent.getWorldQuaternion(_q1).invert();
  const P = _vc.copy(pole).applyQuaternion(pq);
  const a = mid.position.length();
  const b = endLocal.length();
  const d = _vd.copy(T).sub(A);
  const raw = d.length();
  const len = clamp(raw, Math.abs(a - b) + 1e-4, a + b - 1e-4);
  d.normalize();
  const cosA = clamp((a * a + len * len - b * b) / (2 * a * len), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  P.addScaledVector(d, -P.dot(d));
  if (P.lengthSq() < 1e-8) P.set(0, 0, 1).addScaledVector(d, -d.z);
  P.normalize();
  const E = new THREE.Vector3().copy(A).addScaledVector(d, a * cosA).addScaledVector(P, a * sinA);
  const Tc = new THREE.Vector3().copy(A).addScaledVector(d, len);
  const uRest = new THREE.Vector3().copy(mid.position).normalize();
  const qU = _q2.setFromUnitVectors(uRest, new THREE.Vector3().subVectors(E, A).normalize());
  upper.quaternion.copy(qU);
  const ld = new THREE.Vector3().subVectors(Tc, E).normalize().applyQuaternion(qU.clone().invert());
  mid.quaternion.setFromUnitVectors(new THREE.Vector3().copy(endLocal).normalize(), ld);
  if (elbowOut) elbowOut.copy(E).applyMatrix4(parent.matrixWorld);
  return raw <= a + b;
}
/** 발/손을 세계 기준 원하는 방향으로 (부모 회전 상쇄) */
function setWorldQuat(bone: THREE.Bone, want: THREE.Quaternion): void {
  bone.parent!.updateWorldMatrix(true, false);
  const pq = bone.parent!.getWorldQuaternion(_q1).invert();
  bone.quaternion.copy(pq.multiply(want));
}
const qX = (a: number): THREE.Quaternion => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a);
const qZ = (a: number): THREE.Quaternion => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a);
const qY = (a: number): THREE.Quaternion => new THREE.Quaternion().setFromAxisAngle(Y, a);

const ANK_L = new THREE.Vector3(AN[0] - KN[0], AN[1] - KN[1], AN[2] - KN[2]);
const HAND_L = new THREE.Vector3(HD[0] - EL[0], HD[1] - EL[1], HD[2] - EL[2]);

/** 두 발을 땅의 한 점에 붙여 두기 (골반이 움직여도) */
function plantFeet(c: Char, feet: THREE.Vector3[], pitch: number[] = [0, 0]): void {
  const gq = c.group.getWorldQuaternion(new THREE.Quaternion());
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(gq);
  ['L', 'R'].forEach((s, i) => {
    const side = i === 0 ? 1 : -1;
    const pole = fwd.clone().add(new THREE.Vector3(side * 0.15, 0, 0).applyQuaternion(gq));
    twoBoneIK(c.b('thigh.' + s), c.b('shin.' + s), ANK_L, feet[i]!, pole);
    setWorldQuat(c.b('foot.' + s), gq.clone().multiply(qX(pitch[i] ?? 0)));
  });
}

/* ═════════════ 견본 ═════════════ */

export const DEMOS: DemoMap = {
  /* ───── i456 코드로 뼈대 ───── */
  i456: {
    kind: '3d',
    caption: '뼈 16개를 코드로 하나씩 세우고 살(메시)에 묶어요 — 뼈를 돌리면 살이 따라와요',
    make() {
      const st = makeStage([2.2, 1.55, 4.6], [0, 1.0, 0], 30);
      let cc: Char | null = null;
      let vv: BoneViz | null = null;
      const loader = makeLoader(st.scene, [0, 1.1, 0]);
      const bt = blobTex();
      const sh = blob(bt, 1.3);
      st.scene.add(sh);
      let showBones = true;
      let showSkin = true;
      let ghost = false;
      let t0 = 0;
      let restart = false;
      const CYCLE = 11;
      const feet = [new THREE.Vector3(AN[0], AN[1], 0), new THREE.Vector3(-AN[0], AN[1], 0)];
      const tag = makeLabel('뼈 세우는 중', '#ffe58a');
      tag.position.set(0, 2.45, 0);
      const tag2 = makeLabel('살 묶기 · 움직이기', '#bff0ff');
      tag2.position.copy(tag.position);
      tag.visible = tag2.visible = false;
      st.scene.add(tag, tag2);
      return {
        scene: st.scene,
        camera: st.cam,
        update(t) {
          if (!cc || !vv) {
            if (!bearReady() || !createSlot()) {
              loader.set(PROG, t);
              return;
            }
            cc = makeChar('smooth');
            vv = new BoneViz(cc);
            st.later([cc.group, vv.group]);
            t0 = t;
            st.onShown.push(() => loader.done());
          }
          const c = cc;
          const viz = vv;
          if (restart) {
            t0 = t;
            restart = false;
          }
          const lt = (t - t0) % CYCLE;
          const grow = lt / 0.14;
          const fade = sstep(2.5, 3.3, lt);
          const dance = sstep(3.0, 3.8, lt) * (1 - sstep(CYCLE - 0.8, CYCLE - 0.1, lt));
          c.rest();
          const ph = t * 2.6;
          const hips = c.b('hips');
          hips.position.y = 0.8 - dance * (0.035 + 0.03 * Math.sin(ph * 2));
          hips.position.x = dance * 0.05 * Math.sin(ph);
          hips.quaternion.copy(qZ(dance * 0.08 * Math.sin(ph)));
          c.b('spine').quaternion.copy(qZ(-dance * 0.1 * Math.sin(ph)));
          c.b('chest').quaternion.copy(qY(dance * 0.15 * Math.sin(ph * 0.5)));
          c.b('head').quaternion.copy(qZ(dance * 0.16 * Math.sin(ph + 0.6)).multiply(qX(dance * 0.06 * Math.sin(ph * 2))));
          // 왼팔 흔들어 인사 · 오른팔은 살랑
          c.b('upperArm.L').quaternion.copy(qZ(dance * 1.75));
          c.b('foreArm.L').quaternion.copy(qZ(dance * (0.55 + 0.45 * Math.sin(ph * 2.2))));
          c.b('upperArm.R').quaternion.copy(qZ(-dance * 0.35).multiply(qX(dance * 0.3 * Math.sin(ph))));
          c.b('foreArm.R').quaternion.copy(qZ(-dance * 0.4));
          c.group.updateMatrixWorld(true);
          plantFeet(c, feet);
          c.group.updateMatrixWorld(true);
          viz.update(grow);
          c.mesh.visible = showSkin && fade > 0.01;
          const tr = ghost || fade < 0.99;
          if (c.mat.transparent !== tr) {
            c.mat.transparent = tr;
            c.mat.needsUpdate = true;
          }
          c.mat.opacity = ghost ? 0.45 * fade : fade;
          c.mat.depthWrite = !ghost;
          viz.group.visible = showBones;
          tag.visible = lt < 3.0;
          tag2.visible = lt >= 3.0 && lt < 6;
          sh.visible = showSkin;
        },
        render(r, w, h) {
          void w;
          void h;
          stageRender(st, r);
        },
        controls: [
          { type: 'toggle', label: '뼈 보기', value: true, on: (v) => (showBones = v) },
          { type: 'toggle', label: '살(메시) 보기', value: true, on: (v) => (showSkin = v) },
          { type: 'toggle', label: '살 반투명', value: false, on: (v) => (ghost = v) },
          { type: 'button', label: '처음부터 뼈 세우기', on: () => (restart = true) },
        ] as Control[],
        dispose() {
          cc?.dispose();
          vv?.dispose();
          loader.dispose();
          disposeMesh(sh);
          bt.dispose();
          disposeSprite(tag);
          disposeSprite(tag2);
          st.own.forEach((o) => o.dispose());
        },
      } satisfies Scene3D;
    },
  },

  /* ───── i457 자동 스킨 가중치 ───── */
  i457: {
    kind: '3d',
    caption: '왼쪽 「가까운 뼈 하나만」은 팔꿈치 · 무릎이 꺾여 찌그러지고, 오른쪽 「여러 뼈 + 부드럽게」는 둥글게 굽어요',
    make() {
      const st = makeStage([0.9, 1.45, 5.6], [0, 1.08, 0], 30, 2.3);
      let AA: Char | null = null;
      let BB: Char | null = null;
      let VA: BoneViz | null = null;
      let VB: BoneViz | null = null;
      const loader = makeLoader(st.scene, [0, 1.1, 0]);
      const bt = blobTex();
      const sA = blob(bt, 1.2);
      sA.position.x = -0.82;
      const sB = blob(bt, 1.2);
      sB.position.x = 0.82;
      st.scene.add(sA, sB);
      const lA = makeLabel('가까운 뼈 하나만', '#ffb4a8', 'rgba(14,18,40,0.72)', 0.21);
      lA.position.set(-0.82, 2.42, 0);
      const lB = makeLabel('여러 뼈 + 부드럽게', '#b8f5c8', 'rgba(14,18,40,0.72)', 0.21);
      lB.position.set(0.82, 2.42, 0);
      st.scene.add(lA, lB);
      const names = new Map<number, THREE.Sprite>();
      const nameOf = (b: number): THREE.Sprite => {
        let s = names.get(b);
        if (!s) {
          s = makeLabel('색 = 「' + BONES[b]!.ko + '」 뼈의 영향 (빨강 1 → 파랑 0)', '#ffffff', 'rgba(14,18,40,0.8)', 0.17);
          s.position.set(0, 0.12, 1.0);
          names.set(b, s);
          st.scene.add(s);
        }
        return s;
      };
      const AUTO = [BI['foreArm.L']!, BI['upperArm.L']!, BI['shin.L']!, BI['thigh.L']!, BI['chest']!, BI['head']!];
      let heat = true;
      let pick = 0; // 0 = 자동
      let bend = 1;
      let bones = false;
      let shown = -2;
      const feetA = [new THREE.Vector3(), new THREE.Vector3()];
      const pose = (c: Char, k: number): void => {
        c.rest();
        // 두 팔을 앞으로 들어 팔꿈치를 위로 접고(먹는 몸짓), 왼 무릎을 높이 든다
        const axL = new THREE.Vector3(AD[1], -AD[0], 0).normalize();
        const axR = new THREE.Vector3(AD[1], AD[0], 0).normalize();
        c.b('upperArm.L').quaternion.copy(qX(-0.8 * k).multiply(qZ(-0.12 * k)));
        c.b('foreArm.L').quaternion.setFromAxisAngle(axL, 2.35 * k * bend);
        c.b('upperArm.R').quaternion.copy(qX(-0.8 * k).multiply(qZ(0.12 * k)));
        c.b('foreArm.R').quaternion.setFromAxisAngle(axR, 2.35 * k * bend);
        c.b('thigh.L').quaternion.copy(qX(-1.35 * k * bend));
        c.b('shin.L').quaternion.copy(qX(2.2 * k * bend));
        c.b('foot.L').quaternion.copy(qX(-0.5 * k));
        c.b('head').quaternion.copy(qZ(0.12 * k));
        c.b('chest').quaternion.copy(qX(-0.06 * k));
        c.b('hips').position.y = 0.8 - 0.02 * k;
        c.group.updateMatrixWorld(true);
        // 디딘 발은 땅에
        const gq = c.group;
        feetA[1]!.set(-AN[0], AN[1], 0.0);
        gq.localToWorld(feetA[1]!);
        const pole = new THREE.Vector3(0, 0, 1).applyQuaternion(gq.quaternion);
        twoBoneIK(c.b('thigh.R'), c.b('shin.R'), ANK_L, feetA[1]!, pole);
        setWorldQuat(c.b('foot.R'), gq.quaternion.clone());
        c.group.updateMatrixWorld(true);
      };
      return {
        scene: st.scene,
        camera: st.cam,
        update(t) {
          if (!AA || !BB || !VA || !VB) {
            if (!bearReady() || !createSlot()) {
              loader.set(PROG, t);
              return;
            }
            if (!AA) {
              AA = makeChar('nearest');
              loader.set(PROG, t);
              return;
            }
            BB = makeChar('smooth');
            AA.group.position.x = -0.82;
            BB.group.position.x = 0.82;
            AA.group.rotation.y = 0.6;
            BB.group.rotation.y = 0.6;
            VA = new BoneViz(AA);
            VB = new BoneViz(BB);
            st.later([AA.group, BB.group, VA.group, VB.group]);
            shown = -2;
            st.onShown.push(() => loader.done());
          }
          const A = AA;
          const Bc = BB;
          const vizA = VA;
          const vizB = VB;
          const lt = t % 4;
          const k = sstep(0.2, 1.6, lt) * (1 - sstep(3.0, 3.9, lt));
          pose(A, k);
          pose(Bc, k);
          const want = heat ? (pick > 0 ? pick : AUTO[Math.floor(t / 4) % AUTO.length]!) : -1;
          if (want !== shown) {
            A.setHeat(want < 0 ? null : want);
            Bc.setHeat(want < 0 ? null : want);
            names.forEach((s) => (s.visible = false));
            if (want >= 0) nameOf(want).visible = true;
            shown = want;
          }
          vizA.group.visible = vizB.group.visible = bones;
          if (bones) {
            vizA.update();
            vizB.update();
          }
        },
        render(r, w, h) {
          void w;
          void h;
          stageRender(st, r);
        },
        controls: [
          { type: 'toggle', label: '가중치 색 보기', value: true, on: (v) => (heat = v) },
          { type: 'range', label: '뼈 고르기 (0 = 자동으로 돌기)', min: 0, max: NB - 1, step: 1, value: 0, on: (v) => (pick = v) },
          { type: 'range', label: '굽힘 세기', min: 0.3, max: 1.15, step: 0.05, value: 1, on: (v) => (bend = v) },
          { type: 'toggle', label: '뼈 보기', value: false, on: (v) => (bones = v) },
        ] as Control[],
        dispose() {
          AA?.dispose();
          BB?.dispose();
          VA?.dispose();
          VB?.dispose();
          loader.dispose();
          disposeMesh(sA);
          (sB.geometry as THREE.BufferGeometry).dispose();
          (sB.material as THREE.Material).dispose();
          bt.dispose();
          disposeSprite(lA);
          disposeSprite(lB);
          names.forEach(disposeSprite);
          st.own.forEach((o) => o.dispose());
        },
      } satisfies Scene3D;
    },
  },

  /* ───── i458 절차 걷기 · 뛰기 ───── */
  i458: {
    kind: '3d',
    caption: '속도 하나로 걸음 폭 · 박자 · 팔 흔들기 · 골반 오르내림이 저절로 — 가만히 → 걷기 → 뛰기, 발은 땅에서 안 미끄러져요',
    make() {
      const st = makeStage([4.3, 1.8, 3.0], [0, 1.0, 0.1], 30, 2.0, '#2c3a5e', '#11182a');
      // 움직이는 땅 (러닝머신처럼) — 타일 하나 = 0.4
      const tc = document.createElement('canvas');
      tc.width = tc.height = 128;
      const tg = tc.getContext('2d')!;
      tg.fillStyle = '#6d7cb4';
      tg.fillRect(0, 0, 128, 128);
      tg.fillStyle = '#5c6aa0';
      tg.fillRect(0, 0, 64, 64);
      tg.fillRect(64, 64, 64, 64);
      tg.strokeStyle = 'rgba(255,255,255,0.10)';
      tg.lineWidth = 2;
      tg.strokeRect(1, 1, 126, 126);
      const tex = new THREE.CanvasTexture(tc);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = 8;
      const R0 = 2.0;
      const TILE = 0.8; // 텍스처 한 장 = 0.8 (칸 2 × 2)
      tex.repeat.set((2 * R0) / TILE, (2 * R0) / TILE);
      const gTop = new THREE.CircleGeometry(R0 * 0.995, 72);
      const mTop = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
      const top = new THREE.Mesh(gTop, mTop);
      top.rotation.x = -Math.PI / 2;
      top.position.y = 0.002;
      top.receiveShadow = true;
      st.scene.add(top);
      let cc: Char | null = null;
      let vv: BoneViz | null = null;
      const loader = makeLoader(st.scene, [0, 1.1, 0]);
      const bt = blobTex();
      const sh = blob(bt, 1.1);
      sh.position.y = 0.006;
      st.scene.add(sh);
      // 발 디딤 표시 고리 (땅과 함께 흘러감 — 발이 고리 안에 그대로 있으면 안 미끄러진 것)
      const gRing = new THREE.RingGeometry(0.1, 0.13, 32);
      const rings: { m: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number }[] = [];
      for (let i = 0; i < 10; i++) {
        const mat = new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0, depthWrite: false });
        const m = new THREE.Mesh(gRing, mat);
        m.rotation.x = -Math.PI / 2;
        m.position.y = 0.008;
        m.scale.set(1, 1.5, 1);
        m.renderOrder = 2;
        st.scene.add(m);
        rings.push({ m, mat, life: 0 });
      }
      let ri = 0;
      const labels = [makeLabel('가만히', '#d8e1ff'), makeLabel('걷기', '#b8f5c8'), makeLabel('뛰기', '#ffcf8a')];
      labels.forEach((l) => {
        l.position.set(0, 2.2, 0);
        st.scene.add(l);
      });
      let auto = true;
      let speed = 1;
      let cur = 0;
      let phase = 0;
      let showRings = true;
      let showBones = false;
      const inStance = [false, false];
      const target = new THREE.Vector3();
      return {
        scene: st.scene,
        camera: st.cam,
        update(t, dt) {
          if (!cc || !vv) {
            if (!bearReady() || !createSlot()) {
              loader.set(PROG, t);
              return;
            }
            cc = makeChar('smooth');
            vv = new BoneViz(cc);
            vv.group.visible = false;
            st.later([cc.group, vv.group]);
            st.onShown.push(() => loader.done());
          }
          const c = cc;
          const viz = vv;
          dt = Math.min(dt, 0.05);
          // 자동: 가만히 2초 → 걷기 → 뛰기 → 걷기 → 가만히 (14초)
          const want = auto ? (() => {
            const u = t % 14;
            if (u < 2) return 0;
            if (u < 5) return 1.0;
            if (u < 9) return 2.8;
            if (u < 12) return 1.0;
            return 0;
          })() : speed;
          cur += (want - cur) * damp(dt, 0.6);
          const v = cur < 0.01 ? 0 : cur;
          const run = sstep(1.3, 2.1, v);
          const g = sstep(0.02, 0.35, v);
          const walkLc = 0.3 + 0.5 * Math.min(v, 1) + 0.12 * Math.max(v - 1, 0);
          const runLc = 0.8 + 0.3 * v;
          const Lc = lerp(walkLc, runLc, run);
          const D = lerp(0.62, 0.34, run);
          const f = v / Lc;
          phase = frac(phase + f * dt);
          const ph = phase;
          tex.offset.y -= (v * dt) / TILE;
          c.rest();
          const hips = c.b('hips');
          const mid = 4 * Math.PI * (ph - D / 2);
          const bob = lerp(0.022 * Math.min(v, 1) * Math.cos(mid), -0.04 * Math.cos(mid), run) * g;
          const drop = (0.012 + 0.02 * Math.min(v, 1) + 0.075 * run) * g + 0.012;
          hips.position.y = 0.8 - drop + bob + (1 - g) * 0.006 * Math.sin(t * 2.4);
          hips.position.x = 0.022 * Math.cos(2 * Math.PI * (ph - D / 2)) * (1 - run) * g;
          const yaw = -(0.14 + 0.06 * run) * g * Math.cos(2 * Math.PI * ph);
          hips.quaternion.copy(qY(yaw));
          const lean = (0.05 * Math.min(v, 1) + 0.16 * run) * g;
          c.b('spine').quaternion.copy(qX(lean * 0.6));
          c.b('chest').quaternion.copy(qY(-yaw * 1.6).multiply(qX(lean * 0.4 + (1 - g) * 0.015 * Math.sin(t * 2.4))));
          c.b('head').quaternion.copy(qX(-lean * 0.8 - bob * 1.2));
          // 다리: 걸음 주기 → 발목 목표 → 두 뼈 IK
          c.group.updateMatrixWorld(true);
          const gq = c.group.quaternion;
          ['L', 'R'].forEach((s, i) => {
            const side = i === 0 ? 1 : -1;
            const p = frac(ph + (i === 0 ? 0 : 0.5));
            let z: number;
            let lift = 0;
            let pitch = 0;
            let heel = 0;
            const half = (Lc * D) / 2;
            const stance = p < D;
            if (stance) {
              const u = p / D;
              z = Lc * D * (0.5 - u);
              const hr = sstep(0.65, 1, u);
              pitch = 0.55 * hr * g;
              heel = 0.05 * hr * g;
            } else {
              const u = (p - D) / (1 - D);
              z = -half + 2 * half * (0.5 - 0.5 * Math.cos(Math.PI * u));
              lift = (0.05 + 0.05 * Math.min(v, 1) + 0.07 * run) * Math.sin(Math.PI * u) ** 1.2;
              pitch = lerp(0.55, -0.35, sstep(0, 0.85, u)) * g;
              pitch = u > 0.85 ? lerp(-0.35, 0, (u - 0.85) / 0.15) * g : pitch;
            }
            z *= g;
            lift *= g;
            target.set(side * 0.16, AN[1] + lift + heel, z);
            c.group.localToWorld(target);
            const pole = new THREE.Vector3(side * 0.12, 0, 1).applyQuaternion(gq);
            twoBoneIK(c.b('thigh.' + s), c.b('shin.' + s), ANK_L, target, pole);
            setWorldQuat(c.b('foot.' + s), gq.clone().multiply(qX(pitch)));
            if (stance && !inStance[i] && v > 0.15 && showRings) {
              const r = rings[ri++ % rings.length]!;
              r.m.position.set(target.x, 0.008, target.z + 0.06);
              r.life = 1;
            }
            inStance[i] = stance;
          });
          // 팔: 다리와 반대로 흔들기, 뛸 땐 팔꿈치를 굽혀 크게
          const armA = (0.28 * Math.min(v, 1) + 0.5 * run) * g;
          const sw = Math.cos(2 * Math.PI * ph);
          const down = 0.42 - 0.12 * run;
          const elbow = 0.22 + 0.25 * Math.min(v, 1) * g + 1.05 * run;
          c.b('upperArm.L').quaternion.copy(qX(armA * sw).multiply(qZ(-down)));
          c.b('upperArm.R').quaternion.copy(qX(-armA * sw).multiply(qZ(down)));
          const axL = new THREE.Vector3(AD[1], -AD[0], 0).normalize();
          const axR = new THREE.Vector3(AD[1], AD[0], 0).normalize();
          c.b('foreArm.L').quaternion.setFromAxisAngle(axL, elbow + 0.2 * run * Math.max(0, sw));
          c.b('foreArm.R').quaternion.setFromAxisAngle(axR, elbow + 0.2 * run * Math.max(0, -sw));
          c.group.updateMatrixWorld(true);
          for (const r of rings) {
            if (r.life <= 0) {
              r.mat.opacity = 0;
              continue;
            }
            r.m.position.z -= v * dt;
            r.life -= dt / 1.6;
            r.mat.opacity = 0.85 * Math.min(1, r.life * 2) * (Math.hypot(r.m.position.x, r.m.position.z) < R0 - 0.15 ? 1 : 0);
          }
          const state = v < 0.15 ? 0 : run < 0.5 ? 1 : 2;
          labels.forEach((l, i) => (l.visible = i === state));
          viz.group.visible = showBones;
          if (showBones) viz.update();
        },
        render(r, w, h) {
          void w;
          void h;
          stageRender(st, r);
        },
        controls: [
          { type: 'toggle', label: '자동 (가만히 → 걷기 → 뛰기)', value: true, on: (v) => (auto = v) },
          { type: 'range', label: '속도 (자동 끄고)', min: 0, max: 3.2, step: 0.05, value: 1, on: (v) => ((speed = v), (auto = false)) },
          { type: 'toggle', label: '발 디딤 표시', value: true, on: (v) => (showRings = v) },
          { type: 'toggle', label: '뼈 보기', value: false, on: (v) => (showBones = v) },
        ] as Control[],
        dispose() {
          cc?.dispose();
          vv?.dispose();
          loader.dispose();
          tex.dispose();
          gTop.dispose();
          mTop.dispose();
          disposeMesh(sh);
          bt.dispose();
          gRing.dispose();
          rings.forEach((r) => r.mat.dispose());
          labels.forEach(disposeSprite);
          st.own.forEach((o) => o.dispose());
        },
      } satisfies Scene3D;
    },
  },

  /* ───── i459 두 뼈 IK ───── */
  i459: {
    kind: '3d',
    caption: '어깨 · 팔꿈치 · 손 길이로 코사인 법칙 — 손이 움직이는 공을 잡으러 가요 (팔꿈치 방향은 따로 정함)',
    make() {
      const st = makeStage([0.9, 1.4, 4.4], [0.25, 1.12, 0], 32);
      let cc: Char | null = null;
      const loader = makeLoader(st.scene, [0, 1.1, 0]);
      const bt = blobTex();
      const sh = blob(bt, 1.2);
      st.scene.add(sh);
      // 공 (줄무늬 비치볼)
      const bc = document.createElement('canvas');
      bc.width = 256;
      bc.height = 128;
      const bg = bc.getContext('2d')!;
      const cols = ['#ff5a5f', '#ffffff', '#3fb6ff', '#ffffff', '#ffd23f', '#ffffff'];
      cols.forEach((col, i) => {
        bg.fillStyle = col;
        bg.fillRect((i * 256) / 6, 0, 256 / 6 + 1, 128);
      });
      const btex = new THREE.CanvasTexture(bc);
      btex.colorSpace = THREE.SRGBColorSpace;
      const BR = 0.1;
      const gBall = new THREE.SphereGeometry(BR, 40, 28);
      const mBall = new THREE.MeshPhysicalMaterial({ map: btex, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15 });
      const ball = new THREE.Mesh(gBall, mBall);
      ball.castShadow = true;
      st.scene.add(ball);
      const bsh = blob(bt, 0.45);
      st.scene.add(bsh);
      // 삼각형 · 닿는 거리 보기
      const gCyl = new THREE.CylinderGeometry(1, 1, 1, 10);
      gCyl.translate(0, 0.5, 0);
      const mUp = new THREE.MeshBasicMaterial({ color: 0x5ad1ff, depthTest: false, transparent: true, opacity: 0.95 });
      const mLo = new THREE.MeshBasicMaterial({ color: 0xffd84a, depthTest: false, transparent: true, opacity: 0.95 });
      const mDash = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.35 });
      const sticks = [new THREE.Mesh(gCyl, mUp), new THREE.Mesh(gCyl, mLo), new THREE.Mesh(gCyl, mDash)];
      const gDot = new THREE.SphereGeometry(0.028, 14, 10);
      const mDot = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true });
      const dots = [new THREE.Mesh(gDot, mDot), new THREE.Mesh(gDot, mDot), new THREE.Mesh(gDot, mDot)];
      const tri = new THREE.Group();
      [...sticks, ...dots].forEach((m) => {
        m.renderOrder = 25;
        tri.add(m);
      });
      st.scene.add(tri);
      const reachR = 0.27 + 0.24;
      const gReach = new THREE.SphereGeometry(reachR, 32, 20);
      const mReach = new THREE.MeshBasicMaterial({ color: 0x8fd8ff, wireframe: true, transparent: true, opacity: 0.12, depthWrite: false });
      const reach = new THREE.Mesh(gReach, mReach);
      reach.visible = false;
      st.scene.add(reach);
      const lab = makeLabel('닿지 않아요 — 쭉 뻗기', '#ffcf8a', 'rgba(14,18,40,0.72)', 0.13);
      st.scene.add(lab);
      const ptr = new BigPointer();
      let poleDeg = 0;
      let showTri = true;
      let autoBall = true;
      const ballPos = new THREE.Vector3(0.6, 1.1, 0.4);
      const want = new THREE.Vector3();
      const feet = [new THREE.Vector3(), new THREE.Vector3()];
      const elbowW = new THREE.Vector3();
      const shoulderW = new THREE.Vector3();
      const handW = new THREE.Vector3();
      const stick = (m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, r: number): void => {
        const d = _vd.subVectors(b, a);
        const l = d.length();
        m.position.copy(a);
        m.quaternion.setFromUnitVectors(Y, d.normalize());
        m.scale.set(r, l, r);
      };
      let headYaw = 0;
      let headPitch = 0;
      return {
        scene: st.scene,
        camera: st.cam,
        update(t, dt) {
          if (!cc) {
            if (!bearReady() || !createSlot()) {
              loader.set(PROG, t);
              return;
            }
            cc = makeChar('smooth');
            cc.group.rotation.y = -0.25;
            st.later([cc.group]);
            st.onShown.push(() => loader.done());
          }
          const c = cc;
          dt = Math.min(dt, 0.05);
          c.rest();
          c.group.updateMatrixWorld(true);
          // 공 자리: 자동 궤도 (가끔 팔이 안 닿는 곳까지) 또는 마우스
          const P = c.group.localToWorld(new THREE.Vector3(SH[0], SH[1], SH[2]));
          shoulderW.copy(P);
          if (ptr.live() && ptr.hit(st.cam, new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0.35), want)) {
            want.y = Math.max(want.y, 0.12);
          } else if (autoBall) {
            const a = t * 0.9;
            const rr = 0.3 + 0.32 * (0.5 + 0.5 * Math.sin(t * 0.43));
            want.set(P.x + 0.3 + Math.cos(a) * rr * 0.75, P.y - 0.02 + Math.sin(a * 1.3) * rr * 0.75, 0.22 + Math.sin(a * 0.7) * 0.3);
          }
          ballPos.lerp(want, damp(dt, 0.12));
          ball.position.copy(ballPos);
          ball.rotation.y += dt * 1.5;
          ball.rotation.x += dt * 0.7;
          bsh.position.set(ballPos.x, 0.004, ballPos.z);
          bsh.scale.setScalar(0.6 + 0.4 / (1 + ballPos.y));
          // 몸이 공 쪽으로 살짝
          const lx = ballPos.x - P.x;
          c.b('chest').quaternion.copy(qZ(clamp(-lx * 0.15, -0.12, 0.12)).multiply(qY(clamp(lx * 0.25, -0.2, 0.2))));
          c.b('hips').position.y = 0.79 + 0.01 * Math.sin(t * 2);
          c.group.updateMatrixWorld(true);
          // 손바닥이 공 겉면에 닿도록 목표를 공 가운데서 조금 앞으로
          const sW = c.b('upperArm.L').getWorldPosition(new THREE.Vector3());
          shoulderW.copy(sW);
          const dir = new THREE.Vector3().subVectors(ballPos, sW).normalize();
          const tgt = new THREE.Vector3().copy(ballPos).addScaledVector(dir, -(BR + 0.075));
          // 팔꿈치 방향: 기본 = 아래 · 뒤, 슬라이더로 어깨→목표 축을 따라 돌림
          const pole = new THREE.Vector3(0.35, -1, -0.45).normalize().applyAxisAngle(dir, (poleDeg * Math.PI) / 180);
          const ok = twoBoneIK(c.b('upperArm.L'), c.b('foreArm.L'), HAND_L, tgt, pole, elbowW);
          // 오른팔은 내려두고 · 고개는 공을 봄
          c.b('upperArm.R').quaternion.copy(qZ(0.35).multiply(qX(0.08 * Math.sin(t * 1.3))));
          c.b('foreArm.R').quaternion.copy(qZ(0.25));
          const hW = c.b('head').getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.3, 0));
          const to = new THREE.Vector3().subVectors(ballPos, hW);
          const gy = c.group.rotation.y;
          const yawW = clamp(Math.atan2(to.x, to.z) - gy, -0.9, 0.9);
          const pitchW = clamp(Math.atan2(to.y, Math.hypot(to.x, to.z)), -0.5, 0.5);
          headYaw += (yawW - headYaw) * damp(dt, 0.15);
          headPitch += (pitchW - headPitch) * damp(dt, 0.15);
          c.b('neck').quaternion.copy(qY(headYaw * 0.4));
          c.b('head').quaternion.copy(qY(headYaw * 0.5).multiply(qX(-headPitch * 0.7)));
          c.group.updateMatrixWorld(true);
          for (const e of c.eyes) {
            e.rotation.set(-headPitch * 0.4, headYaw * 0.3, 0);
          }
          feet[0]!.set(AN[0], AN[1], 0);
          feet[1]!.set(-AN[0], AN[1], 0);
          c.group.localToWorld(feet[0]!);
          c.group.localToWorld(feet[1]!);
          plantFeet(c, feet);
          c.group.updateMatrixWorld(true);
          // 보기
          handW.copy(HAND_L).applyMatrix4(c.b('foreArm.L').matrixWorld);
          tri.visible = showTri;
          if (showTri) {
            stick(sticks[0]!, shoulderW, elbowW, 0.012);
            stick(sticks[1]!, elbowW, handW, 0.012);
            stick(sticks[2]!, shoulderW, tgt, 0.006);
            dots[0]!.position.copy(shoulderW);
            dots[1]!.position.copy(elbowW);
            dots[2]!.position.copy(handW);
          }
          reach.position.copy(shoulderW);
          lab.visible = !ok;
          lab.position.copy(ballPos).add(new THREE.Vector3(0, 0.22, 0));
        },
        render(r, w, h) {
          ptr.attach(w, h);
          stageRender(st, r);
        },
        controls: [
          { type: 'range', label: '팔꿈치 방향 (°)', min: -180, max: 180, step: 5, value: 0, on: (v) => (poleDeg = v) },
          { type: 'toggle', label: '공 자동으로 움직이기 (끄면 · 마우스로 옮기기)', value: true, on: (v) => (autoBall = v) },
          { type: 'toggle', label: '삼각형 보기 (어깨 · 팔꿈치 · 손)', value: true, on: (v) => (showTri = v) },
          { type: 'toggle', label: '닿는 거리 보기', value: false, on: (v) => (reach.visible = v) },
        ] as Control[],
        dispose() {
          ptr.dispose();
          cc?.dispose();
          loader.dispose();
          disposeMesh(sh);
          (bsh.geometry as THREE.BufferGeometry).dispose();
          (bsh.material as THREE.Material).dispose();
          bt.dispose();
          btex.dispose();
          gBall.dispose();
          mBall.dispose();
          gCyl.dispose();
          [mUp, mLo, mDash, mDot, mReach].forEach((m) => m.dispose());
          gDot.dispose();
          gReach.dispose();
          disposeSprite(lab);
          st.own.forEach((o) => o.dispose());
        },
      } satisfies Scene3D;
    },
  },

  /* ───── i460 사슬 IK (FABRIK) ───── */
  i460: {
    kind: '3d',
    caption: '관절 여러 개를 끝 → 뿌리 → 끝으로 번갈아 당겨요 (FABRIK) — 촉수가 반딧불을 따라 휘고, 관절마다 굽는 각도는 제한',
    make() {
      const st = makeStage([0.4, 1.75, 4.7], [0, 1.2, 0], 34, 1.9, '#24365a', '#0f1626');
      const bt = blobTex();
      const gt = glowTex();
      // 화분
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i <= 14; i++) {
        const u = i / 14;
        pts.push(new THREE.Vector2(0.22 + 0.1 * u + (u > 0.82 ? 0.035 : 0), u * 0.4));
      }
      pts.push(new THREE.Vector2(0.3, 0.4), new THREE.Vector2(0.27, 0.34), new THREE.Vector2(0, 0.34));
      const gPot = new THREE.LatheGeometry(pts, 48);
      const mPot = new THREE.MeshStandardMaterial({ color: 0xc8643c, roughness: 0.75 });
      const pot = new THREE.Mesh(gPot, mPot);
      pot.castShadow = true;
      pot.receiveShadow = true;
      st.scene.add(pot);
      const gSoil = new THREE.CircleGeometry(0.28, 32);
      const mSoil = new THREE.MeshStandardMaterial({ color: 0x4a3026, roughness: 1 });
      const soil = new THREE.Mesh(gSoil, mSoil);
      soil.rotation.x = -Math.PI / 2;
      soil.position.y = 0.36;
      st.scene.add(soil);
      const psh = blob(bt, 1.1);
      st.scene.add(psh);
      // 반딧불 목표
      const glowM = new THREE.SpriteMaterial({ map: gt, color: 0xfff09a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
      const glow = new THREE.Sprite(glowM);
      glow.scale.setScalar(0.55);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfffbe0 }));
      const light = new THREE.PointLight(0xffe28a, 1.6, 2.5, 2);
      const fly = new THREE.Group();
      fly.add(glow, core, light);
      st.scene.add(fly);
      const gCyl = new THREE.CylinderGeometry(1, 1, 1, 8);
      gCyl.translate(0, 0.5, 0);
      const mLine = new THREE.MeshBasicMaterial({ color: 0xfff09a, transparent: true, opacity: 0.4, depthTest: false });
      const reachLine = new THREE.Mesh(gCyl, mLine);
      reachLine.renderOrder = 25;
      st.scene.add(reachLine);
      const BASE = new THREE.Vector3(0, 0.34, 0);
      const L = 2.0;
      let N = 12;
      let maxA = (32 * Math.PI) / 180;
      let showJ = true;
      // 촉수 (관절 수가 바뀌면 다시 짓기)
      const mT = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.4, clearcoat: 0.55, clearcoatRoughness: 0.35, sheen: 0.4, sheenColor: new THREE.Color(0xffc8f0) });
      const gSuck = new THREE.TorusGeometry(1, 0.42, 8, 18);
      const mSuck = new THREE.MeshStandardMaterial({ color: 0xf6b5d2, roughness: 0.5 });
      const gJ = new THREE.SphereGeometry(0.03, 12, 8);
      const mJ = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true });
      const mSeg = new THREE.MeshBasicMaterial({ color: 0x5ad1ff, depthTest: false, transparent: true, opacity: 0.85 });
      let tent: { mesh: THREE.SkinnedMesh; bones: THREE.Bone[]; joints: THREE.Mesh[]; segs: THREE.Mesh[]; p: THREE.Vector3[]; geo: THREE.BufferGeometry; group: THREE.Group } | null = null;
      const radius = (s: number): number => 0.13 * Math.pow(1 - s, 0.8) + 0.02;
      const build = (n: number): void => {
        if (tent) {
          st.scene.remove(tent.group);
          tent.geo.dispose();
          tent.mesh.skeleton.dispose();
        }
        const l = L / n;
        const RS = 24;
        const HS = n * 6;
        const pos: number[] = [];
        const nor: number[] = [];
        const col: number[] = [];
        const si: number[] = [];
        const sw: number[] = [];
        const idx: number[] = [];
        const cTop = new THREE.Color(0x8e5ce0);
        const cTip = new THREE.Color(0xc79bff);
        const cUnder = new THREE.Color(0xf7b2d4);
        const cc = new THREE.Color();
        const pushW = (y: number): void => {
          const s = y / l;
          const k = Math.floor(s);
          const fr = s - k;
          let a: number;
          let b: number;
          let wa: number;
          if (fr < 0.5) {
            a = k - 1;
            b = k;
            wa = 0.5 - fr;
          } else {
            a = k;
            b = k + 1;
            wa = 1.5 - fr;
          }
          a = clamp(a, 0, n - 1);
          b = clamp(b, 0, n - 1);
          si.push(a, b, 0, 0);
          sw.push(wa, 1 - wa, 0, 0);
        };
        for (let j = 0; j <= HS; j++) {
          const s = j / HS;
          const y = s * L;
          const r = radius(s);
          for (let i = 0; i <= RS; i++) {
            const th = (i / RS) * Math.PI * 2;
            const cx = Math.sin(th);
            const cz = Math.cos(th);
            pos.push(cx * r, y, cz * r);
            nor.push(cx, 0.08, cz);
            const under = sstep(0.2, 0.85, cz);
            cc.copy(cTop).lerp(cTip, s * 0.8).lerp(cUnder, under);
            col.push(cc.r, cc.g, cc.b);
            pushW(Math.min(y, L - 1e-4));
          }
        }
        for (let j = 0; j < HS; j++)
          for (let i = 0; i < RS; i++) {
            const a = j * (RS + 1) + i;
            const b = a + RS + 1;
            idx.push(a, b, a + 1, b, b + 1, a + 1);
          }
        // 끝 막기
        const tipI = pos.length / 3;
        pos.push(0, L + 0.02, 0);
        nor.push(0, 1, 0);
        col.push(cTip.r, cTip.g, cTip.b);
        pushW(L - 1e-4);
        for (let i = 0; i < RS; i++) idx.push(HS * (RS + 1) + i, tipI, HS * (RS + 1) + i + 1);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
        geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
        geo.setIndex(idx);
        geo.computeVertexNormals();
        const mesh = new THREE.SkinnedMesh(geo, mT);
        mesh.castShadow = true;
        mesh.frustumCulled = false;
        const bones: THREE.Bone[] = [];
        for (let i = 0; i < n; i++) {
          const b = new THREE.Bone();
          b.position.set(0, i === 0 ? 0 : l, 0);
          if (i > 0) bones[i - 1]!.add(b);
          bones.push(b);
          // 빨판 둘 (뼈에 붙음 — 아랫면 +z)
          for (let k = 0; k < 2; k++) {
            const s = (i + 0.3 + k * 0.45) / n;
            if (s > 0.93) continue;
            const r = radius(s);
            const su = new THREE.Mesh(gSuck, mSuck);
            su.position.set(0, (0.3 + k * 0.45) * l, r * 0.93);
            su.scale.setScalar(r * 0.32);
            b.add(su);
          }
        }
        mesh.add(bones[0]!);
        mesh.updateMatrixWorld(true);
        mesh.bind(new THREE.Skeleton(bones));
        mesh.position.copy(BASE);
        const group = new THREE.Group();
        group.add(mesh);
        const joints: THREE.Mesh[] = [];
        const segs: THREE.Mesh[] = [];
        const p: THREE.Vector3[] = [];
        for (let i = 0; i <= n; i++) {
          // 처음엔 S 자로 말린 모양
          const s = i / n;
          p.push(new THREE.Vector3(Math.sin(s * 3) * 0.25 * s, BASE.y + s * L * 0.9, 0));
          const j = new THREE.Mesh(gJ, mJ);
          j.renderOrder = 26;
          group.add(j);
          joints.push(j);
          if (i < n) {
            const sg = new THREE.Mesh(gCyl, mSeg);
            sg.renderOrder = 25;
            group.add(sg);
            segs.push(sg);
          }
        }
        st.scene.add(group);
        tent = { mesh, bones, joints, segs, p, geo, group };
      };
      build(N);
      const target = new THREE.Vector3(0.5, 1.6, 0.3);
      const want = new THREE.Vector3();
      const ptr = new BigPointer();
      const prev = new THREE.Vector3();
      const dir = new THREE.Vector3();
      const ax = new THREE.Vector3();
      const qW = new THREE.Quaternion();
      const solve = (): void => {
        const T = tent!;
        const p = T.p;
        const n = p.length - 1;
        const l = L / n;
        for (let it = 0; it < 8; it++) {
          // 뒤로: 끝을 목표에 두고 뿌리 쪽으로
          p[n]!.copy(target);
          for (let i = n - 1; i >= 0; i--) {
            dir.subVectors(p[i]!, p[i + 1]!).normalize();
            p[i]!.copy(p[i + 1]!).addScaledVector(dir, l);
          }
          // 앞으로: 뿌리를 제자리에 두고 끝 쪽으로 + 각도 제한
          p[0]!.copy(BASE);
          for (let i = 1; i <= n; i++) {
            dir.subVectors(p[i]!, p[i - 1]!).normalize();
            if (i === 1) prev.copy(Y);
            else prev.subVectors(p[i - 1]!, p[i - 2]!).normalize();
            const ang = Math.acos(clamp(prev.dot(dir), -1, 1));
            if (ang > maxA) {
              ax.crossVectors(prev, dir);
              if (ax.lengthSq() < 1e-10) ax.set(1, 0, 0);
              ax.normalize();
              dir.copy(prev).applyAxisAngle(ax, maxA);
            }
            p[i]!.copy(p[i - 1]!).addScaledVector(dir, l);
          }
          if (p[n]!.distanceTo(target) < 1e-3) break;
        }
        // 관절 위치 → 뼈 회전
        qW.identity();
        for (let i = 0; i < n; i++) {
          dir.subVectors(p[i + 1]!, p[i]!).normalize().applyQuaternion(_q1.copy(qW).invert());
          T.bones[i]!.quaternion.setFromUnitVectors(Y, dir);
          qW.multiply(T.bones[i]!.quaternion);
        }
        for (let i = 0; i <= n; i++) {
          T.joints[i]!.position.copy(p[i]!);
          T.joints[i]!.visible = showJ;
          if (i < n) {
            const sg = T.segs[i]!;
            sg.visible = showJ;
            const d = _vd.subVectors(p[i + 1]!, p[i]!);
            sg.position.copy(p[i]!);
            sg.quaternion.setFromUnitVectors(Y, d.clone().normalize());
            sg.scale.set(0.008, d.length(), 0.008);
          }
        }
        const gap = p[n]!.distanceTo(target);
        reachLine.visible = gap > 0.03;
        if (reachLine.visible) {
          const d = _vd.subVectors(target, p[n]!);
          reachLine.position.copy(p[n]!);
          reachLine.quaternion.setFromUnitVectors(Y, d.clone().normalize());
          reachLine.scale.set(0.006, d.length(), 0.006);
        }
      };
      return {
        scene: st.scene,
        camera: st.cam,
        update(t, dt) {
          dt = Math.min(dt, 0.05);
          if (ptr.live() && ptr.hit(st.cam, new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0.2), want)) {
            want.y = Math.max(want.y, 0.25);
          } else {
            want.set(1.3 * Math.sin(t * 0.8), 1.35 + 0.95 * Math.sin(t * 1.27 + 1), 0.55 * Math.sin(t * 0.6));
          }
          target.lerp(want, damp(dt, 0.18));
          fly.position.copy(target);
          glowM.opacity = 0.75 + 0.25 * Math.sin(t * 9);
          solve();
        },
        render(r, w, h) {
          ptr.attach(w, h);
          stageRender(st, r);
        },
        controls: [
          {
            type: 'range',
            label: '관절 수',
            min: 3,
            max: 24,
            step: 1,
            value: N,
            on: (v) => {
              if (v !== N) {
                N = v;
                build(N);
              }
            },
          },
          { type: 'range', label: '관절마다 굽는 각도 제한 (°)', min: 5, max: 90, step: 1, value: 32, on: (v) => (maxA = (v * Math.PI) / 180) },
          { type: 'toggle', label: '관절 · 뼈 보기', value: true, on: (v) => (showJ = v) },
        ] as Control[],
        dispose() {
          ptr.dispose();
          if (tent) {
            tent.geo.dispose();
            tent.mesh.skeleton.dispose();
          }
          [gPot, gSoil, gCyl, gSuck, gJ].forEach((g) => g.dispose());
          [mPot, mSoil, mT, mSuck, mJ, mSeg, mLine, glowM].forEach((m) => m.dispose());
          disposeMesh(core);
          disposeMesh(psh);
          bt.dispose();
          gt.dispose();
          light.dispose();
          st.own.forEach((o) => o.dispose());
        },
      } satisfies Scene3D;
    },
  },

  /* ───── i461 시선 따라가기 ───── */
  i461: {
    kind: '3d',
    caption: '눈이 먼저 나비를 보고 머리가 뒤따라 돌아요 — 목은 각도 제한 안에서만, 사이사이 깜빡',
    make() {
      const st = makeStage([0.3, 2.45, 4.4], [0, 1.12, 0.2], 34, 1.9);
      let cc: Char | null = null;
      const loader = makeLoader(st.scene, [0, 1.1, 0]);
      const bt = blobTex();
      const sh = blob(bt, 1.2);
      st.scene.add(sh);
      // 나비
      const wc = document.createElement('canvas');
      wc.width = wc.height = 128;
      const wg = wc.getContext('2d')!;
      const wgr = wg.createRadialGradient(20, 64, 4, 30, 64, 110);
      wgr.addColorStop(0, '#fff4c2');
      wgr.addColorStop(0.45, '#ff9f43');
      wgr.addColorStop(0.85, '#e8505b');
      wgr.addColorStop(1, '#5a1e3a');
      wg.fillStyle = wgr;
      wg.beginPath();
      wg.moveTo(8, 64);
      wg.bezierCurveTo(30, -10, 130, -6, 118, 50);
      wg.bezierCurveTo(112, 70, 70, 66, 8, 64);
      wg.bezierCurveTo(60, 72, 108, 84, 96, 112);
      wg.bezierCurveTo(80, 132, 24, 110, 8, 64);
      wg.fill();
      wg.strokeStyle = 'rgba(60,20,40,0.85)';
      wg.lineWidth = 4;
      wg.stroke();
      wg.fillStyle = 'rgba(255,255,255,0.9)';
      [
        [92, 30, 6],
        [104, 44, 4],
        [80, 98, 5],
      ].forEach(([x, y, r]) => {
        wg.beginPath();
        wg.arc(x!, y!, r!, 0, Math.PI * 2);
        wg.fill();
      });
      const wtex = new THREE.CanvasTexture(wc);
      wtex.colorSpace = THREE.SRGBColorSpace;
      const gWing = new THREE.PlaneGeometry(0.28, 0.28);
      gWing.translate(0.14, 0, 0);
      gWing.rotateX(-Math.PI / 2);
      const mWing = new THREE.MeshStandardMaterial({ map: wtex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6, emissive: 0x442211, emissiveIntensity: 0.4 });
      const fly = new THREE.Group();
      const wl = new THREE.Mesh(gWing, mWing);
      const wr = new THREE.Mesh(gWing, mWing);
      wr.scale.x = -1;
      const gBody = new THREE.CapsuleGeometry(0.014, 0.09, 4, 8);
      gBody.rotateX(Math.PI / 2);
      const mBody = new THREE.MeshStandardMaterial({ color: 0x2a1a22, roughness: 0.6 });
      const body = new THREE.Mesh(gBody, mBody);
      wl.castShadow = wr.castShadow = true;
      fly.add(wl, wr, body);
      st.scene.add(fly);
      const fsh = blob(bt, 0.3);
      st.scene.add(fsh);
      // 목 제한 부채꼴 (머리 높이)
      const mFan = new THREE.MeshBasicMaterial({ color: 0x8fd8ff, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });
      let gFan = new THREE.CircleGeometry(1.25, 48, 0, 1);
      const fan = new THREE.Mesh(gFan, mFan);
      fan.rotation.x = -Math.PI / 2;
      fan.position.set(0, 0.012, 0);
      fan.renderOrder = 3;
      st.scene.add(fan);
      const setFan = (lim: number): void => {
        gFan.dispose();
        gFan = new THREE.CircleGeometry(1.25, 48, -Math.PI / 2 - lim, lim * 2);
        fan.geometry = gFan;
      };
      // 시선 선
      const gCyl = new THREE.CylinderGeometry(1, 1, 1, 6);
      gCyl.translate(0, 0.5, 0);
      const mLine = new THREE.MeshBasicMaterial({ color: 0xffe58a, transparent: true, opacity: 0.45, depthTest: false });
      const line = new THREE.Mesh(gCyl, mLine);
      line.renderOrder = 25;
      st.scene.add(line);
      const ptr = new BigPointer();
      let lim = (50 * Math.PI) / 180;
      setFan(lim);
      let eyesFirst = true;
      let blinkOn = true;
      let showLine = true;
      const T = new THREE.Vector3(0.6, 1.7, 1);
      const want = new THREE.Vector3();
      const prevT = new THREE.Vector3().copy(T);
      let hy = 0;
      let hp = 0; // 머리
      let ey = 0;
      let ep = 0; // 눈
      let nextBlink = 1.5;
      let blinkT = -1;
      let lastYaw = 0;
      const eyeW = new THREE.Vector3();
      const tmpQ = new THREE.Quaternion();
      return {
        scene: st.scene,
        camera: st.cam,
        update(t, dt) {
          if (!cc) {
            if (!bearReady() || !createSlot()) {
              loader.set(PROG, t);
              return;
            }
            cc = makeChar('smooth');
            st.later([cc.group]);
            st.onShown.push(() => loader.done());
          }
          const c = cc;
          dt = Math.min(dt, 0.05);
          // 나비 길: 앞을 크게 돌다가 가끔 옆 · 뒤로 (목 제한 밖)
          if (ptr.live() && ptr.hit(st.cam, new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0.9), want)) {
            want.y = clamp(want.y, 0.3, 2.6);
          } else {
            const a = t * 0.55;
            const wide = 1 + 0.8 * sstep(0.75, 0.98, Math.sin(t * 0.37 + 2.2));
            want.set((0.95 * Math.sin(a) + 0.2 * Math.sin(a * 3.1)) * wide, 1.7 + 0.45 * Math.sin(a * 1.7 + 0.5) + 0.08 * Math.sin(t * 5), 1.3 + 0.4 * Math.cos(a * 0.8) - 0.55 * (wide - 1));
          }
          T.lerp(want, damp(dt, 0.25));
          fly.position.copy(T);
          const vel = _vd.subVectors(T, prevT);
          if (vel.lengthSq() > 1e-8) fly.rotation.y = Math.atan2(vel.x, vel.z);
          prevT.copy(T);
          const flap = Math.sin(t * 22) * 0.9 + 0.2;
          wl.rotation.z = flap;
          wr.rotation.z = -flap;
          fsh.position.set(T.x, 0.004, T.z);
          // 몸 기준 방향
          c.rest();
          c.b('hips').position.y = 0.8 + 0.006 * Math.sin(t * 2.2);
          c.group.updateMatrixWorld(true);
          const H = c.b('head').getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.32, 0.1));
          const to = new THREE.Vector3().subVectors(T, H);
          const yaw = Math.atan2(to.x, to.z);
          const pitch = Math.atan2(to.y, Math.hypot(to.x, to.z));
          // 목 제한 넘으면 가슴이 조금 더 돌아 줌
          const over = Math.max(0, Math.abs(yaw) - lim) * Math.sign(yaw);
          const hyW = clamp(yaw, -lim, lim);
          const hpW = clamp(pitch, -lim * 0.5, lim * 0.5);
          if (eyesFirst) {
            hy += (hyW - hy) * damp(dt, 0.32);
            hp += (hpW - hp) * damp(dt, 0.32);
          } else {
            hy += (hyW - hy) * damp(dt, 0.05);
            hp += (hpW - hp) * damp(dt, 0.05);
          }
          // 머리를 크게 돌리기 시작하면 깜빡 (사람도 그래요)
          if (blinkOn && Math.abs(hyW - lastYaw) > 0.9 && blinkT < 0) blinkT = 0;
          lastYaw = lastYaw + (hyW - lastYaw) * damp(dt, 0.6);
          const chestY = clamp(over * 0.5, -0.35, 0.35);
          c.b('chest').quaternion.copy(qY(chestY * 0.6 + hy * 0.12));
          c.b('neck').quaternion.copy(qY(hy * 0.35).multiply(qX(-hp * 0.35)));
          c.b('head').quaternion.copy(qY(hy * 0.5).multiply(qX(-hp * 0.6)).multiply(qZ(-hy * 0.06)));
          c.group.updateMatrixWorld(true);
          // 눈: 머리 기준 남은 각도 (빠르게), 눈 돌림도 제한
          c.eyes.forEach((e, i) => {
            const sock = c.sockets[i]!;
            sock.getWorldPosition(eyeW);
            const local = new THREE.Vector3().subVectors(T, eyeW).applyQuaternion(sock.getWorldQuaternion(tmpQ).invert());
            const yE = clamp(Math.atan2(local.x, local.z), -0.6, 0.6);
            const pE = clamp(Math.atan2(local.y, Math.hypot(local.x, local.z)), -0.45, 0.45);
            if (i === 0) {
              ey += ((eyesFirst ? yE : 0) - ey) * damp(dt, 0.045);
              ep += ((eyesFirst ? pE : 0) - ep) * damp(dt, 0.045);
            }
            e.rotation.set(-ep, ey + (i === 0 ? -0.03 : 0.03), 0, 'YXZ');
          });
          // 깜빡임
          nextBlink -= dt;
          if (blinkOn && nextBlink <= 0 && blinkT < 0) blinkT = 0;
          let close = 0;
          if (blinkT >= 0) {
            blinkT += dt;
            close = blinkT < 0.07 ? blinkT / 0.07 : 1 - (blinkT - 0.07) / 0.1;
            if (blinkT > 0.17) {
              blinkT = -1;
              close = 0;
              nextBlink = 1.8 + Math.random() * 2.6;
            }
          }
          c.sockets.forEach((s) => s.scale.set(1, 1 - 0.9 * clamp(close, 0, 1), 1));
          line.visible = showLine;
          if (showLine) {
            const mid = new THREE.Vector3();
            c.sockets[0]!.getWorldPosition(mid);
            c.sockets[1]!.getWorldPosition(eyeW);
            mid.add(eyeW).multiplyScalar(0.5);
            const d = _vd.subVectors(T, mid);
            line.position.copy(mid);
            line.quaternion.setFromUnitVectors(Y, d.clone().normalize());
            line.scale.set(0.005, d.length(), 0.005);
          }
          fan.rotation.z = chestY * 0.6;
        },
        render(r, w, h) {
          ptr.attach(w, h);
          stageRender(st, r);
        },
        controls: [
          {
            type: 'range',
            label: '목 돌림 제한 (°)',
            min: 15,
            max: 110,
            step: 5,
            value: 50,
            on: (v) => {
              lim = (v * Math.PI) / 180;
              setFan(lim);
            },
          },
          { type: 'toggle', label: '눈 먼저 · 머리 뒤따라 (끄면 한 덩어리로)', value: true, on: (v) => (eyesFirst = v) },
          { type: 'toggle', label: '깜빡임', value: true, on: (v) => (blinkOn = v) },
          { type: 'toggle', label: '시선 선 · 제한 부채꼴 보기', value: true, on: (v) => ((showLine = v), (fan.visible = v)) },
        ] as Control[],
        dispose() {
          ptr.dispose();
          cc?.dispose();
          loader.dispose();
          disposeMesh(sh);
          (fsh.geometry as THREE.BufferGeometry).dispose();
          (fsh.material as THREE.Material).dispose();
          bt.dispose();
          wtex.dispose();
          gWing.dispose();
          mWing.dispose();
          gBody.dispose();
          mBody.dispose();
          gFan.dispose();
          mFan.dispose();
          gCyl.dispose();
          mLine.dispose();
          st.own.forEach((o) => o.dispose());
        },
      } satisfies Scene3D;
    },
  },
};

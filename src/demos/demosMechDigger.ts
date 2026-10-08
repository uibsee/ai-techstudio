import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { DemoMap, Scene3D } from './types';
import { Drag, Orbit, Overlay, TAU, bevelExtrude, clamp, freeTree, lathe, lerp, makeStage, mechMats, rng, roundRect, smooth, type Tag } from './lib/mech';

/**
 * 견본 — i544 굴착기 (무한궤도 · 유압 실린더) (2026-10-08)
 *  - 무한궤도: 링크 60개가 뒤 구동 스프로킷 · 앞 아이들러 둘레(직선 둘 + 반원 둘) 경로 위 등간격 자리에 접선 방향으로 놓인다.
 *    몸이 앞으로 간 거리만큼 경로 위치를 뒤로 밀어 → 바닥에 닿은 링크는 땅에 멈춰 있고 위쪽 링크는 두 배 빠르게 앞으로.
 *  - 유압 실린더 3개: 통(노랑)은 아래 핀에서, 크롬 봉은 위 핀에서 서로를 향해 — 두 핀 사이 거리가 바뀌면 봉이 통 안으로 들어가고 나온다.
 *  - 버킷 4절 링크: 팔의 흔들 고리(C 중심, 길이 고정) · 연결 고리(버킷 점 B 까지, 길이 고정)를 두 원의 교점으로 풀고 실린더는 그 교점을 민다.
 *  - 모든 자세는 붐 · 팔 · 버킷 각도 셋 + 선회 각 + 주행 거리 다섯 값의 키프레임에서 나온다.
 */

type V2 = [number, number];
const V3 = (x = 0, y = 0, z = 0): THREE.Vector3 => new THREE.Vector3(x, y, z);
const D2R = Math.PI / 180;
const rot2 = (p: V2, a: number): V2 => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
const add2 = (a: V2, b: V2): V2 => [a[0] + b[0], a[1] + b[1]];
const dist2 = (a: V2, b: V2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** 두 원의 교점 (위쪽 = 왼쪽 방향 해) */
function circleX(c0: V2, r0: number, c1: V2, r1: number, upper: boolean): V2 {
  const d = Math.max(1e-6, dist2(c0, c1));
  const a = clamp((r0 * r0 - r1 * r1 + d * d) / (2 * d), -r0, r0);
  const h = Math.sqrt(Math.max(0, r0 * r0 - a * a));
  const ex = (c1[0] - c0[0]) / d;
  const ey = (c1[1] - c0[1]) / d;
  const px = c0[0] + ex * a;
  const py = c0[1] + ey * a;
  const s = upper ? 1 : -1;
  return [px - ey * h * s, py + ex * h * s];
}

/** 가운데 선을 따라 폭이 줄어드는 판 윤곽 (붐 · 팔) — 양 끝은 반원 */
function taperShape(pts: V2[], w0: number, w1: number): THREE.Shape {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y]) => V3(x, y, 0)));
  const N = 40;
  const L: V2[] = [];
  const R: V2[] = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const w = lerp(w0, w1, u) / 2;
    L.push([p.x - t.y * w, p.y + t.x * w]);
    R.push([p.x + t.y * w, p.y - t.x * w]);
  }
  const s = new THREE.Shape();
  s.moveTo(L[0]![0], L[0]![1]);
  for (const p of L) s.lineTo(p[0], p[1]);
  // 끝 반원
  const pe = curve.getPointAt(1);
  const te = curve.getTangentAt(1);
  const ae = Math.atan2(te.y, te.x);
  s.absarc(pe.x, pe.y, w1 / 2, ae + Math.PI / 2, ae - Math.PI / 2, true);
  for (let i = N; i >= 0; i--) s.lineTo(R[i]![0], R[i]![1]);
  const p0 = curve.getPointAt(0);
  const t0 = curve.getTangentAt(0);
  const a0 = Math.atan2(t0.y, t0.x);
  s.absarc(p0.x, p0.y, w0 / 2, a0 - Math.PI / 2, a0 + Math.PI / 2, true);
  return s;
}

/** 톱니 스프로킷 윤곽 */
function sprocketShape(n: number, rRoot: number, rTip: number, hole: number): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU;
    const da = TAU / n;
    const pts: [number, number][] = [
      [a0, rRoot],
      [a0 + da * 0.18, rRoot],
      [a0 + da * 0.32, rTip],
      [a0 + da * 0.62, rTip],
      [a0 + da * 0.76, rRoot],
    ];
    pts.forEach(([a, r], k) => {
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0 && k === 0) s.moveTo(x, y);
      else s.lineTo(x, y);
    });
  }
  s.closePath();
  const h = new THREE.Path();
  h.absarc(0, 0, hole, 0, TAU, true);
  s.holes.push(h);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const p = new THREE.Path();
    p.absarc(Math.cos(a) * rRoot * 0.62, Math.sin(a) * rRoot * 0.62, rRoot * 0.14, 0, TAU, true);
    s.holes.push(p);
  }
  return s;
}

/** 키프레임: 붐 b · 팔 a · 버킷 k (도) · 선회 s (도) · 주행 x */
interface Key {
  b: number;
  a: number;
  k: number;
  s: number;
  x: number;
  dur: number;
  label: string;
}
// 버킷 각 k: + 쪽이 이빨이 아래로(펴기 · 쏟기), − 쪽이 감아 올리기(담기)
const REACH = { b: 30, a: -64, k: 62, s: 0, x: 0 };
const KEYS: Key[] = [
  { ...REACH, dur: 1.2, label: '팔 뻗기' },
  { b: 6, a: -72, k: 72, s: 0, x: 0, dur: 1.2, label: '흙에 버킷 꽂기' },
  { b: 8, a: -116, k: -20, s: 0, x: 0, dur: 1.8, label: '흙 파기 (팔 · 버킷 당기기)' },
  { b: 40, a: -108, k: -48, s: 0, x: 0, dur: 1.3, label: '들어 올리기' },
  { b: 42, a: -104, k: -48, s: 100, x: 0, dur: 2.0, label: '몸통 돌리기' },
  { b: 44, a: -74, k: 98, s: 100, x: 0, dur: 1.5, label: '흙 쏟기' },
  { b: 44, a: -74, k: 98, s: 100, x: 0, dur: 0.7, label: '흙 쏟기' },
  { ...REACH, dur: 2.0, label: '돌아오기' },
  { ...REACH, x: 0.42, dur: 1.8, label: '무한궤도로 앞으로' },
  { ...REACH, x: 0.42, dur: 0.4, label: '무한궤도로 앞으로' },
  { ...REACH, dur: 1.8, label: '무한궤도로 뒤로' },
];
const DIG_DONE = 2; // 이 키에 닿으면 흙이 담김
const DUMP_AT = 5; // 이 키 중간에 흙이 쏟아짐
const CYCLE = KEYS.reduce((s, k) => s + k.dur, 0);

/** 시각 t (초, 한 바퀴 안) → 자세 · 지금 키 번호 · 키 안 진행도 */
function poseAt(t: number): { b: number; a: number; k: number; s: number; x: number; i: number; u: number } {
  let tt = ((t % CYCLE) + CYCLE) % CYCLE;
  for (let i = 0; i < KEYS.length; i++) {
    const k1 = KEYS[i]!;
    if (tt <= k1.dur || i === KEYS.length - 1) {
      const k0 = KEYS[(i - 1 + KEYS.length) % KEYS.length]!;
      const u = clamp(tt / k1.dur, 0, 1);
      const e = smooth(0, 1, u);
      return { b: lerp(k0.b, k1.b, e), a: lerp(k0.a, k1.a, e), k: lerp(k0.k, k1.k, e), s: lerp(k0.s, k1.s, e), x: lerp(k0.x, k1.x, e), i, u };
    }
    tt -= k1.dur;
  }
  return { ...REACH, i: 0, u: 0 };
}

/* ───────────── 치수 (단위 m 쯤) ───────────── */
// 무한궤도
const TR_CX = 1.1; // 아이들러 · 스프로킷 중심 x (±)
const TR_CY = 0.4;
const TR_R = 0.33; // 링크 가운데 선 반지름
const TR_Z = 0.8; // 궤도 가운데 z (±)
const TR_W = 0.5;
const N_LINK = 60;
const TR_S = TR_CX * 2;
const TR_L = 2 * TR_S + TAU * TR_R;
// 상부
const UP_Y = 0.78;
const BOOM_PIV: V2 = [0.95, 0.42]; // 상부 기준
const BOOM_Z = -0.12;
const BOOM_TIP: V2 = [2.1, 0];
const ARM_TIP: V2 = [1.6, 0];
// 실린더 핀
const BC_BASE: V2 = [1.28, 0.2]; // 상부 기준 (붐 실린더 아래 핀)
const BC_ROD: V2 = [0.85, 0.16]; // 붐 기준
const AC_BASE: V2 = [0.78, 0.56]; // 붐 기준 (팔 실린더)
const AC_ROD: V2 = [-0.42, 0.12]; // 팔 기준 (팔 꼬리)
const KC_BASE: V2 = [0.12, 0.2]; // 팔 기준 (버킷 실린더)
const ROCK_C: V2 = [1.3, 0.05]; // 팔 기준 (흔들 고리 중심)
const BUCK_B: V2 = [-0.15, 0.17]; // 버킷 기준 (연결 고리 핀)
const D_REF: V2 = [1.27, 0.33]; // 기준 자세(버킷 0°)에서 흔들 고리 끝
const ROCK_L = dist2(ROCK_C, D_REF);
const LINK_L = dist2(add2(ARM_TIP, BUCK_B), D_REF);

/** 무한궤도 경로: 거리 s → 자리 · 접선 · 바깥 법선 (궤도 옆에서 본 XY) */
function trackAt(s: number): { p: V2; t: V2; n: V2 } {
  s = ((s % TR_L) + TR_L) % TR_L;
  const arc = Math.PI * TR_R;
  if (s < TR_S) return { p: [-TR_CX + s, TR_CY - TR_R], t: [1, 0], n: [0, -1] };
  s -= TR_S;
  if (s < arc) {
    const a = -Math.PI / 2 + s / TR_R;
    return { p: [TR_CX + TR_R * Math.cos(a), TR_CY + TR_R * Math.sin(a)], t: [-Math.sin(a), Math.cos(a)], n: [Math.cos(a), Math.sin(a)] };
  }
  s -= arc;
  if (s < TR_S) return { p: [TR_CX - s, TR_CY + TR_R], t: [-1, 0], n: [0, 1] };
  s -= TR_S;
  const a = Math.PI / 2 + s / TR_R;
  return { p: [-TR_CX + TR_R * Math.cos(a), TR_CY + TR_R * Math.sin(a)], t: [-Math.sin(a), Math.cos(a)], n: [Math.cos(a), Math.sin(a)] };
}

function makeDigger(): Scene3D {
  const stage = makeStage({ size: 6 });
  const { scene, cam } = stage;
  const M = mechMats();
  // 노란 도장 — 아래쪽일수록 흙때 (색 어둡게 · 거칠게)
  const yellow = M.yellow;
  yellow.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying float vWY;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWY = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader =
      'varying float vWY;\n' +
      sh.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float dirt = (1.0 - smoothstep(0.12, 1.0, vWY)) * (0.75 + 0.25 * sin(vWY * 37.0 + gl_FragCoord.x * 0.02));
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.42, 0.34, 0.26), clamp(dirt, 0.0, 1.0) * 0.8);`,
        )
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.85, clamp(dirt, 0.0, 1.0) * 0.8);');
  };
  yellow.customProgramCacheKey = () => 'digger-dirty-yellow';
  const cylYellow = new THREE.MeshPhysicalMaterial({ color: 0xf2b822, metalness: 0.1, roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.2 });
  const rodChrome = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 1, roughness: 0.05 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x26384f, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.38, envMapIntensity: 1.6, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });
  const soil = new THREE.MeshStandardMaterial({ color: 0x7a5636, roughness: 0.95 });
  const soilDark = new THREE.MeshStandardMaterial({ color: 0x5e4029, roughness: 1, flatShading: true });
  const bodyMats: THREE.Material[] = [yellow, M.iron, M.dark, M.rubber, M.steel, M.chrome, glass, M.white];
  const extraMats: THREE.Material[] = [cylYellow, rodChrome, glass, soil, soilDark];

  const root = new THREE.Group(); // 기계 전체 (주행)
  scene.add(root);

  /* ── 하부: 무한궤도 · 바퀴 · 프레임 ── */
  const linkGeo = (() => {
    const plate = new THREE.BoxGeometry(0.095, 0.045, TR_W);
    const grouser = new THREE.BoxGeometry(0.026, 0.036, TR_W).translate(0.018, 0.04, 0);
    const lugA = new THREE.BoxGeometry(0.085, 0.045, 0.06).translate(0, -0.04, 0.11);
    const lugB = new THREE.BoxGeometry(0.085, 0.045, 0.06).translate(0, -0.04, -0.11);
    const pin = new THREE.CylinderGeometry(0.014, 0.014, TR_W + 0.02, 8).rotateX(Math.PI / 2).translate(0.048, 0, 0);
    const g = mergeGeometries([plate, grouser, lugA, lugB, pin])!;
    for (const x of [plate, grouser, lugA, lugB, pin]) x.dispose();
    return g;
  })();
  const trackMat = M.iron;
  const tracks: THREE.InstancedMesh[] = [];
  for (const sz of [-1, 1]) {
    const im = new THREE.InstancedMesh(linkGeo, trackMat, N_LINK);
    im.position.z = sz * TR_Z;
    im.castShadow = im.receiveShadow = true;
    im.frustumCulled = false;
    root.add(im);
    tracks.push(im);
  }
  const spinners: { o: THREE.Object3D; r: number }[] = [];
  const sprG = bevelExtrude(sprocketShape(11, TR_R - 0.07, TR_R - 0.015, 0.06), 0.13, 0.012, 6, 2);
  const idlerG = lathe(
    [
      [0.05, -0.12],
      [TR_R - 0.04, -0.12],
      [TR_R - 0.025, -0.1],
      [TR_R - 0.025, -0.03],
      [TR_R - 0.06, -0.02],
      [TR_R - 0.06, 0.02],
      [TR_R - 0.025, 0.03],
      [TR_R - 0.025, 0.1],
      [TR_R - 0.04, 0.12],
      [0.05, 0.12],
    ],
    40,
  ).rotateX(Math.PI / 2);
  const rollG = lathe(
    [
      [0.03, -0.2],
      [0.075, -0.2],
      [0.075, -0.07],
      [0.06, -0.06],
      [0.06, 0.06],
      [0.075, 0.07],
      [0.075, 0.2],
      [0.03, 0.2],
    ],
    24,
  ).rotateX(Math.PI / 2);
  const hubG = new THREE.CylinderGeometry(0.09, 0.11, 0.08, 20).rotateX(Math.PI / 2);
  const bottomInner = TR_CY - TR_R + 0.0225;
  const topInner = TR_CY + TR_R - 0.0225;
  for (const sz of [-1, 1]) {
    const z = sz * TR_Z;
    const spr = new THREE.Mesh(sprG, M.dark);
    spr.position.set(-TR_CX, TR_CY, z);
    root.add(spr);
    spinners.push({ o: spr, r: TR_R });
    const hub = new THREE.Mesh(hubG, M.iron);
    hub.position.set(-TR_CX, TR_CY, z + sz * 0.1);
    root.add(hub);
    const idl = new THREE.Mesh(idlerG, M.dark);
    idl.position.set(TR_CX, TR_CY, z);
    root.add(idl);
    spinners.push({ o: idl, r: TR_R });
    for (const x of [-0.62, -0.21, 0.21, 0.62]) {
      const r = new THREE.Mesh(rollG, M.dark);
      r.position.set(x, bottomInner + 0.075, z);
      root.add(r);
      spinners.push({ o: r, r: 0.075 });
    }
    for (const x of [-0.45, 0.45]) {
      const r = new THREE.Mesh(rollG, M.dark);
      r.scale.set(0.7, 0.7, 0.6);
      r.position.set(x, topInner - 0.053, z);
      root.add(r);
      spinners.push({ o: r, r: 0.053 });
    }
    // 궤도 프레임 (옆에서 본 윤곽: 가운데가 높고 양끝이 낮아지는 판)
    const fs = new THREE.Shape();
    fs.moveTo(-0.95, 0.27);
    fs.lineTo(0.95, 0.27);
    fs.lineTo(1.0, 0.42);
    fs.lineTo(0.85, 0.56);
    fs.lineTo(-0.85, 0.56);
    fs.lineTo(-1.0, 0.42);
    fs.closePath();
    const frame = new THREE.Mesh(bevelExtrude(fs, 0.3, 0.025, 4, 2), yellow);
    frame.position.z = z;
    root.add(frame);
  }
  // 가운데 몸 · 선회 링
  const car = new THREE.Mesh(bevelExtrude(roundRect(1.25, 1.3, 0.12), 0.32, 0.04, 8, 2).rotateX(-Math.PI / 2), yellow);
  car.position.y = 0.5;
  root.add(car);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.66, 0.1, 48), M.dark);
  ring.position.y = 0.72;
  root.add(ring);
  {
    const boltG = new THREE.CylinderGeometry(0.018, 0.018, 0.03, 6);
    const bolts = new THREE.InstancedMesh(boltG, M.steel, 24);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      m4.makeTranslation(Math.cos(a) * 0.6, 0.78, Math.sin(a) * 0.6);
      bolts.setMatrixAt(i, m4);
    }
    root.add(bolts);
  }

  /* ── 상부 (선회) ── */
  const upper = new THREE.Group();
  upper.position.y = UP_Y;
  root.add(upper);
  const flat = (s: THREE.Shape, h: number, bevel: number): THREE.BufferGeometry => bevelExtrude(s, h, bevel, 10, 3).rotateX(-Math.PI / 2);
  // 갑판
  const deck = new THREE.Mesh(flat(roundRect(2.35, 1.9, 0.18, -0.17, 0), 0.2, 0.04), yellow);
  deck.position.y = 0.1;
  upper.add(deck);
  // 평형추 (뒤쪽, 둥근 덩어리)
  {
    const s = new THREE.Shape();
    s.moveTo(-0.95, -0.95);
    s.lineTo(-1.15, -0.95);
    s.quadraticCurveTo(-1.48, -0.9, -1.5, 0);
    s.quadraticCurveTo(-1.48, 0.9, -1.15, 0.95);
    s.lineTo(-0.95, 0.95);
    s.closePath();
    const cw = new THREE.Mesh(flat(s, 0.55, 0.07), yellow);
    cw.position.y = 0.47;
    upper.add(cw);
    const stripe = new THREE.Mesh(flat(s, 0.06, 0.01), M.dark);
    stripe.scale.set(1.01, 1, 1.01);
    stripe.position.y = 0.36;
    upper.add(stripe);
  }
  // 엔진 덮개 · 그릴 · 배기관
  {
    const hood = new THREE.Mesh(flat(roundRect(0.95, 1.15, 0.1, -0.5, 0.35), 0.48, 0.06), yellow);
    hood.position.y = 0.44;
    upper.add(hood);
    const slat = new THREE.BoxGeometry(0.6, 0.025, 0.02);
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(slat, M.dark);
      s.position.set(-0.5, 0.3 + i * 0.045, -0.93);
      upper.add(s);
    }
    const grillBack = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.3, 0.01), M.rubber);
    grillBack.position.set(-0.5, 0.41, -0.928);
    upper.add(grillBack);
    const pipe = new THREE.Mesh(
      lathe(
        [
          [0.0, 0],
          [0.05, 0],
          [0.05, 0.42],
          [0.058, 0.44],
          [0.058, 0.5],
          [0.045, 0.5],
        ],
        20,
      ),
      M.chrome,
    );
    pipe.position.set(-0.32, 0.66, -0.55);
    upper.add(pipe);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 20), M.dark);
    cap.position.set(-0.3, 1.17, -0.55);
    cap.rotation.z = 0.5;
    upper.add(cap);
    // 앞 오른쪽 공구함 · 난간
    const box = new THREE.Mesh(flat(roundRect(0.75, 0.48, 0.06, 0.55, 0.68), 0.32, 0.04), yellow);
    box.position.y = 0.36;
    upper.add(box);
  }
  // 운전석: 노란 아래판 · 검은 기둥 · 유리 · 지붕 · 의자 · 조종 손잡이
  {
    const cab = new THREE.Group();
    cab.position.set(0, 0.2, 0);
    upper.add(cab);
    const x0 = 0.12;
    const x1 = 0.95;
    const z0 = 0.2;
    const z1 = 0.92;
    const hTop = 1.05;
    const lower = new THREE.Mesh(flat(roundRect(x1 - x0, z1 - z0, 0.05, (x0 + x1) / 2, -(z0 + z1) / 2), 0.28, 0.03), yellow);
    lower.position.y = 0.14;
    cab.add(lower);
    // 옆 윤곽 (앞이 기운 다섯모)
    const side = new THREE.Shape();
    side.moveTo(x0, 0.28);
    side.lineTo(x1, 0.28);
    side.lineTo(x1, 0.62);
    side.lineTo(x1 - 0.14, hTop);
    side.lineTo(x0, hTop);
    side.closePath();
    const shell = new THREE.Mesh(new THREE.ExtrudeGeometry(side, { depth: z1 - z0 - 0.04, bevelEnabled: false }).translate(0, 0, -(z1 - z0 - 0.04) / 2), glass);
    shell.position.z = (z0 + z1) / 2;
    shell.renderOrder = 2;
    cab.add(shell);
    const pil = new THREE.CylinderGeometry(0.025, 0.025, 1, 8);
    const pillar = (a: THREE.Vector3, b: THREE.Vector3): void => {
      const m = new THREE.Mesh(pil, M.dark);
      const d = b.clone().sub(a);
      m.position.copy(a).addScaledVector(d, 0.5);
      m.quaternion.setFromUnitVectors(V3(0, 1, 0), d.clone().normalize());
      m.scale.y = d.length();
      cab.add(m);
    };
    for (const z of [z0 + 0.02, z1 - 0.02]) {
      pillar(V3(x0, 0.28, z), V3(x0, hTop, z));
      pillar(V3(x1, 0.28, z), V3(x1, 0.62, z));
      pillar(V3(x1, 0.62, z), V3(x1 - 0.14, hTop, z));
      pillar(V3((x0 + x1) / 2 - 0.05, 0.28, z), V3((x0 + x1) / 2 - 0.05, hTop, z));
      pillar(V3(x0, 0.62, z), V3(x1, 0.62, z));
    }
    pillar(V3(x1, 0.62, z0 + 0.02), V3(x1, 0.62, z1 - 0.02));
    pillar(V3(x1, 0.28, z0 + 0.02), V3(x1, 0.28, z1 - 0.02));
    const roof = new THREE.Mesh(flat(roundRect(x1 - x0 + 0.06, z1 - z0 + 0.06, 0.05, (x0 + x1) / 2 - 0.05, -(z0 + z1) / 2), 0.06, 0.02), yellow);
    roof.position.y = hTop + 0.03;
    cab.add(roof);
    const seatB = new THREE.Mesh(flat(roundRect(0.3, 0.32, 0.06, 0.38, -0.56), 0.1, 0.03), M.rubber);
    seatB.position.y = 0.42;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.36, 0.3), M.rubber);
    back.position.set(0.22, 0.62, 0.56);
    back.rotation.z = 0.15;
    cab.add(seatB, back);
    for (const z of [0.4, 0.72]) {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8), M.steel);
      st.position.set(0.55, 0.5, z);
      st.rotation.z = -0.25;
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 8), M.red);
      knob.position.set(0.57, 0.58, z);
      cab.add(st, knob);
    }
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.05, 16).rotateZ(Math.PI / 2), M.chrome);
    lamp.position.set(x1 - 0.1, hTop + 0.09, (z0 + z1) / 2);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.04, 16).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff6d8 }));
    lens.position.set(x1 - 0.074, hTop + 0.09, (z0 + z1) / 2);
    cab.add(lamp, lens);
    extraMats.push(lens.material as THREE.Material);
  }
  // 붐 받침 (갑판 앞 두 귀)
  {
    const ear = new THREE.Shape();
    ear.moveTo(0.55, 0.2);
    ear.lineTo(1.35, 0.2);
    ear.lineTo(1.3, 0.3);
    ear.absarc(BOOM_PIV[0], BOOM_PIV[1], 0.13, 0, Math.PI, false);
    ear.lineTo(0.6, 0.3);
    ear.closePath();
    for (const dz of [-0.2, 0.2]) {
      const e = new THREE.Mesh(bevelExtrude(ear, 0.06, 0.012, 16, 2), yellow);
      e.position.z = BOOM_Z + dz;
      upper.add(e);
    }
  }

  /* ── 핀 (회전축) ── */
  const pinG = new THREE.CylinderGeometry(0.045, 0.045, 1, 16).rotateX(Math.PI / 2);
  const pinCapG = new THREE.CylinderGeometry(0.06, 0.06, 0.02, 16).rotateX(Math.PI / 2);
  const pin = (parent: THREE.Object3D, p: V2, w: number, z = 0): void => {
    const m = new THREE.Mesh(pinG, M.steel);
    m.position.set(p[0], p[1], z);
    m.scale.z = w;
    parent.add(m);
    for (const s of [-1, 1]) {
      const c = new THREE.Mesh(pinCapG, M.iron);
      c.position.set(p[0], p[1], z + (s * w) / 2);
      parent.add(c);
    }
  };

  /* ── 붐 ── */
  const boom = new THREE.Group();
  boom.position.set(BOOM_PIV[0], BOOM_PIV[1], BOOM_Z);
  upper.add(boom);
  const boomPts: V2[] = [
    [0, 0],
    [0.55, 0.3],
    [1.0, 0.42],
    [1.55, 0.3],
    [2.1, 0],
  ];
  boom.add(new THREE.Mesh(bevelExtrude(taperShape(boomPts, 0.34, 0.24), 0.3, 0.035, 40, 3), yellow));
  pin(upper, BOOM_PIV, 0.56, BOOM_Z);
  pin(boom, BOOM_TIP, 0.42);
  pin(boom, BC_ROD, 0.66);
  // 팔 실린더 받침 (붐 위 귀)
  {
    const s = new THREE.Shape();
    s.moveTo(AC_BASE[0] - 0.16, AC_BASE[1] - 0.12);
    s.lineTo(AC_BASE[0] + 0.16, AC_BASE[1] - 0.12);
    s.absarc(AC_BASE[0], AC_BASE[1], 0.08, 0, Math.PI, false);
    s.closePath();
    for (const dz of [-0.1, 0.1]) {
      const e = new THREE.Mesh(bevelExtrude(s, 0.04, 0.01, 12, 2), yellow);
      e.position.z = dz;
      boom.add(e);
    }
    pin(boom, AC_BASE, 0.26);
  }
  // 유압 호스 (붐 위를 따라)
  {
    const hoseCurve = (dz: number): THREE.CatmullRomCurve3 =>
      new THREE.CatmullRomCurve3([V3(0.15, 0.24, dz), V3(0.55, 0.47, dz), V3(1.0, 0.6, dz), V3(1.55, 0.47, dz), V3(1.95, 0.22, dz), V3(2.15, 0.16, dz)]);
    for (const dz of [-0.08, 0.08]) {
      const h = new THREE.Mesh(new THREE.TubeGeometry(hoseCurve(dz), 48, 0.022, 8), M.rubber);
      boom.add(h);
    }
    for (const u of [0.3, 0.55, 0.8]) {
      const clampM = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.26), M.dark);
      const p = hoseCurve(0).getPointAt(u);
      clampM.position.set(p.x, p.y - 0.01, 0);
      boom.add(clampM);
    }
  }

  /* ── 팔 ── */
  const arm = new THREE.Group();
  arm.position.set(BOOM_TIP[0], BOOM_TIP[1], 0);
  boom.add(arm);
  const armPts: V2[] = [
    [-0.42, 0.12],
    [0, 0.02],
    [0.8, 0.0],
    [1.6, 0],
  ];
  arm.add(new THREE.Mesh(bevelExtrude(taperShape(armPts, 0.3, 0.17), 0.24, 0.03, 40, 3), yellow));
  pin(arm, AC_ROD, 0.3);
  pin(arm, ARM_TIP, 0.5);
  pin(arm, ROCK_C, 0.34);
  // 버킷 실린더 받침
  {
    const s = new THREE.Shape();
    s.moveTo(KC_BASE[0] - 0.14, KC_BASE[1] - 0.12);
    s.lineTo(KC_BASE[0] + 0.14, KC_BASE[1] - 0.12);
    s.absarc(KC_BASE[0], KC_BASE[1], 0.07, 0, Math.PI, false);
    s.closePath();
    for (const dz of [-0.09, 0.09]) {
      const e = new THREE.Mesh(bevelExtrude(s, 0.035, 0.01, 12, 2), yellow);
      e.position.z = dz;
      arm.add(e);
    }
    pin(arm, KC_BASE, 0.24);
  }
  {
    const hc = new THREE.CatmullRomCurve3([V3(-0.2, 0.2, 0.07), V3(0.4, 0.15, 0.13), V3(1.0, 0.12, 0.13), V3(1.25, 0.16, 0.1)]);
    arm.add(new THREE.Mesh(new THREE.TubeGeometry(hc, 32, 0.018, 8), M.rubber));
  }

  /* ── 버킷 ── */
  const bucket = new THREE.Group();
  bucket.position.set(ARM_TIP[0], ARM_TIP[1], 0);
  arm.add(bucket);
  const BW = 0.62;
  const backCurve: V2[] = [
    [-0.1, 0.12],
    [0.12, 0.13],
    [0.32, 0.02],
    [0.44, -0.2],
    [0.42, -0.44],
    [0.28, -0.6],
    [0.1, -0.66],
  ];
  const lip: V2 = [0.1, -0.66];
  const tipMark = new THREE.Object3D();
  {
    // 뒤판: 곡선을 따라 폭 BW 띠
    const cur = new THREE.CatmullRomCurve3(backCurve.map(([x, y]) => V3(x, y, 0)));
    const N = 30;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= N; i++) {
      const p = cur.getPointAt(i / N);
      pos.push(p.x, p.y, -BW / 2, p.x, p.y, BW / 2);
      if (i < N) {
        const a = i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const shellM = yellow.clone();
    shellM.side = THREE.DoubleSide;
    shellM.onBeforeCompile = yellow.onBeforeCompile;
    shellM.customProgramCacheKey = () => 'digger-dirty-yellow-2s';
    bodyMats.push(shellM);
    bucket.add(new THREE.Mesh(g, shellM));
    // 옆판: 곡선 + 입구 선으로 닫은 모양
    const s = new THREE.Shape();
    const sp = cur.getSpacedPoints(30);
    s.moveTo(sp[0]!.x, sp[0]!.y);
    for (const p of sp) s.lineTo(p.x, p.y);
    s.lineTo(-0.12, -0.18);
    s.closePath();
    for (const z of [-BW / 2, BW / 2]) {
      const pl = new THREE.Mesh(bevelExtrude(s, 0.035, 0.01, 30, 2), yellow);
      pl.position.z = z;
      bucket.add(pl);
    }
    // 날 (입구 아래 두꺼운 판) + 이빨 5개
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, BW + 0.04), M.dark);
    const ang = Math.atan2(lip[1] - -0.6, lip[0] - 0.28);
    blade.position.set(lip[0] + 0.0, lip[1] + 0.0, 0);
    blade.rotation.z = ang;
    bucket.add(blade);
    const toothG = new THREE.ConeGeometry(0.045, 0.16, 4).rotateY(Math.PI / 4).scale(1, 1, 0.6);
    const dir = new THREE.Vector2(Math.cos(ang), Math.sin(ang));
    for (let i = 0; i < 5; i++) {
      const t = new THREE.Mesh(toothG, M.iron);
      const z = lerp(-BW / 2 + 0.06, BW / 2 - 0.06, i / 4);
      t.position.set(lip[0] + dir.x * 0.13, lip[1] + dir.y * 0.13, z);
      t.rotation.z = ang - Math.PI / 2;
      bucket.add(t);
    }
    tipMark.position.set(lip[0] + dir.x * 0.2, lip[1] + dir.y * 0.2, 0);
    bucket.add(tipMark);
    // 위 귀 (팔 핀 · 연결 고리 핀)
    const earS = new THREE.Shape();
    earS.moveTo(-0.24, 0.1);
    earS.lineTo(0.18, 0.1);
    earS.absarc(0, 0, 0.09, 0, Math.PI, false);
    earS.lineTo(BUCK_B[0] - 0.08, BUCK_B[1]);
    earS.absarc(BUCK_B[0], BUCK_B[1], 0.07, Math.PI, 0, true);
    earS.closePath();
    for (const dz of [-0.13, 0.13]) {
      const e = new THREE.Mesh(bevelExtrude(earS, 0.04, 0.01, 12, 2), yellow);
      e.position.z = dz;
      bucket.add(e);
    }
    pin(bucket, BUCK_B, 0.36);
  }
  // 버킷 속 흙
  const load = new THREE.Group();
  {
    const r = rng(5);
    const g = new THREE.IcosahedronGeometry(0.09, 0);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(g, i % 3 ? soil : soilDark);
      m.position.set(0.1 + r() * 0.25, -0.15 - r() * 0.3, (r() - 0.5) * (BW - 0.12));
      m.scale.setScalar(0.7 + r() * 0.8);
      m.rotation.set(r() * 3, r() * 3, r() * 3);
      load.add(m);
    }
    load.visible = false;
    bucket.add(load);
  }

  /* ── 4절 링크 (흔들 고리 · 연결 고리) ── */
  const plateG = new THREE.BoxGeometry(0.06, 1, 0.025);
  const rocker: THREE.Mesh[] = [];
  const linkP: THREE.Mesh[] = [];
  for (const dz of [-0.15, 0.15]) {
    const a = new THREE.Mesh(plateG, M.dark);
    a.position.z = dz;
    arm.add(a);
    rocker.push(a);
    const b = new THREE.Mesh(plateG, M.dark);
    b.position.z = dz * 1.25;
    arm.add(b);
    linkP.push(b);
  }
  const dPin = new THREE.Mesh(pinG, M.steel);
  dPin.scale.z = 0.44;
  arm.add(dPin);
  const plate2 = (m: THREE.Mesh, a: V2, b: V2): void => {
    m.position.x = (a[0] + b[0]) / 2;
    m.position.y = (a[1] + b[1]) / 2;
    m.rotation.z = Math.atan2(b[1] - a[1], b[0] - a[0]) - Math.PI / 2;
    m.scale.y = dist2(a, b) + 0.06;
  };

  /* ── 유압 실린더 ── */
  interface Cyl {
    g: THREE.Group;
    barrel: THREE.Mesh;
    gland: THREE.Mesh;
    rod: THREE.Mesh;
    eyeA: THREE.Mesh;
    eyeB: THREE.Mesh;
    lb: number;
    lr: number;
    d: number;
    prev: number;
    min: number;
    max: number;
  }
  const barrelG = new THREE.CylinderGeometry(0.075, 0.075, 1, 24, 1);
  const rodG = new THREE.CylinderGeometry(0.038, 0.038, 1, 20, 1);
  const glandG = new THREE.CylinderGeometry(0.085, 0.085, 0.06, 24);
  const eyeG = new THREE.CylinderGeometry(0.07, 0.07, 0.1, 20).rotateX(Math.PI / 2);
  const makeCyl = (parent: THREE.Object3D, z: number, scale = 1): Cyl => {
    const g = new THREE.Group();
    g.position.z = z;
    g.scale.set(scale, 1, scale);
    const barrel = new THREE.Mesh(barrelG, cylYellow);
    const gland = new THREE.Mesh(glandG, M.dark);
    const rod = new THREE.Mesh(rodG, rodChrome);
    const eyeA = new THREE.Mesh(eyeG, cylYellow);
    const eyeB = new THREE.Mesh(eyeG, rodChrome);
    g.add(barrel, gland, rod, eyeA, eyeB);
    parent.add(g);
    return { g, barrel, gland, rod, eyeA, eyeB, lb: 1, lr: 1, d: 1, prev: 1, min: 9, max: 0 };
  };
  const UP = V3(0, 1, 0);
  const placeCyl = (c: Cyl, P: V2, Q: V2): void => {
    const a = V3(P[0], P[1], 0);
    const b = V3(Q[0], Q[1], 0);
    const dir = b.clone().sub(a);
    const d = dir.length();
    dir.divideScalar(d);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir);
    const seg = (m: THREE.Mesh, from: THREE.Vector3, len: number): void => {
      m.position.copy(from).addScaledVector(dir, len / 2);
      m.quaternion.copy(q);
      m.scale.y = len;
    };
    seg(c.barrel, a, c.lb);
    c.gland.position.copy(a).addScaledVector(dir, c.lb);
    c.gland.quaternion.copy(q);
    seg(c.rod, b.clone().addScaledVector(dir, -c.lr), c.lr);
    c.eyeA.position.copy(a);
    c.eyeB.position.copy(b);
    c.prev = c.d;
    c.d = d;
  };
  const boomCyls = [makeCyl(upper, BOOM_Z - 0.24), makeCyl(upper, BOOM_Z + 0.24)];
  const armCyl = makeCyl(boom, 0, 1.05);
  const buckCyl = makeCyl(arm, 0, 0.9);

  /** 자세 → 2D 핀 자리 (실린더별 [아래 핀, 위 핀]) · 흔들 고리 끝 D */
  const pinsFor = (b: number, a: number, k: number): { bc: [V2, V2]; ac: [V2, V2]; kc: [V2, V2]; D: V2; Barm: V2 } => {
    const bc: [V2, V2] = [BC_BASE, add2(BOOM_PIV, rot2(BC_ROD, b))];
    const ac: [V2, V2] = [AC_BASE, add2(BOOM_TIP, rot2(AC_ROD, a))];
    const Barm = add2(ARM_TIP, rot2(BUCK_B, k));
    const D = circleX(ROCK_C, ROCK_L, Barm, LINK_L, true);
    const kc: [V2, V2] = [KC_BASE, D];
    return { bc, ac, kc, D, Barm };
  };
  // 실린더 통 · 봉 길이: 동작 전체의 최소 · 최대 거리로 정한다 (봉이 통 밖으로 빠지지 않게)
  {
    for (let t = 0; t < CYCLE; t += 0.05) {
      const p = poseAt(t);
      const q = pinsFor(p.b * D2R, p.a * D2R, p.k * D2R);
      for (const [c, [A, B]] of [
        [boomCyls[0]!, q.bc],
        [armCyl, q.ac],
        [buckCyl, q.kc],
      ] as const) {
        const d = dist2(A, B);
        c.min = Math.min(c.min, d);
        c.max = Math.max(c.max, d);
      }
    }
    boomCyls[1]!.min = boomCyls[0]!.min;
    boomCyls[1]!.max = boomCyls[0]!.max;
    for (const c of [...boomCyls, armCyl, buckCyl]) {
      c.lb = c.min - 0.1;
      c.lr = Math.min(c.min - 0.04, c.max - c.lb + 0.12);
    }
  }

  /* ── 흙 더미 · 쏟아지는 흙 ── */
  const mound = (x: number, z: number, r: number, h: number, seed: number): THREE.Mesh => {
    const rr = rng(seed);
    const ph = [rr() * 6, rr() * 6];
    const geo = new THREE.SphereGeometry(r, 40, 16, 0, TAU, 0, Math.PI / 2);
    const p2 = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p2.count; i++) {
      const x0 = p2.getX(i);
      const z0 = p2.getZ(i);
      const a = Math.atan2(z0, x0);
      const n = 1 + 0.08 * Math.sin(a * 3 + ph[0]!) + 0.05 * Math.sin(a * 7 + ph[1]!);
      p2.setXYZ(i, x0 * n, Math.pow(p2.getY(i) / r, 0.8) * h, z0 * n);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, soil);
    m.position.set(x, 0, z);
    m.receiveShadow = true;
    m.castShadow = true;
    scene.add(m);
    // 흩어진 흙덩이
    const cg = new THREE.IcosahedronGeometry(0.06, 0);
    for (let i = 0; i < 18; i++) {
      const c = new THREE.Mesh(cg, soilDark);
      const a = rr() * TAU;
      const d = r * (0.95 + rr() * 0.5);
      c.position.set(x + Math.cos(a) * d, 0.02, z + Math.sin(a) * d);
      c.scale.setScalar(0.5 + rr());
      c.rotation.set(rr() * 3, rr() * 3, 0);
      c.castShadow = true;
      scene.add(c);
    }
    return m;
  };
  // 파는 곳 · 쏟는 곳: 그 자세에서 버킷 이빨 끝이 닿는 땅 위치
  const setPose = (b: number, a: number, k: number, s: number, x: number): void => {
    root.position.x = x;
    upper.rotation.y = s * D2R;
    boom.rotation.z = b * D2R;
    arm.rotation.z = a * D2R;
    bucket.rotation.z = k * D2R;
  };
  const tipAt = (key: Key): THREE.Vector3 => {
    setPose(key.b, key.a, key.k, key.s, key.x);
    scene.updateMatrixWorld(true);
    return tipMark.getWorldPosition(V3());
  };
  const digP = tipAt(KEYS[1]!);
  const dumpP = tipAt(KEYS[5]!);
  const digMound = mound(digP.x + 0.1, digP.z, 0.75, 0.3, 3);
  const dumpR = 0.6;
  const dumpH = 0.32;
  mound(dumpP.x, dumpP.z, dumpR, dumpH, 9);
  void digMound;
  const groundAt = (x: number, z: number): number => {
    const r2 = ((x - dumpP.x) ** 2 + (z - dumpP.z) ** 2) / (dumpR * dumpR);
    return r2 < 1 ? dumpH * Math.sqrt(1 - r2) : 0;
  };
  const NP = 40;
  const clodG = new THREE.IcosahedronGeometry(0.06, 0);
  const clods = new THREE.InstancedMesh(clodG, soilDark, NP);
  clods.castShadow = true;
  clods.frustumCulled = false;
  scene.add(clods);
  const parts = Array.from({ length: NP }, () => ({ p: V3(0, -9, 0), v: V3(), life: 0, s: 1, rest: false }));
  const m4 = new THREE.Matrix4();
  const qd = new THREE.Quaternion();
  const spill = (): void => {
    const at = bucket.localToWorld(V3(0.2, -0.3, 0));
    const r = Math.random;
    for (const p of parts) {
      p.p.set(at.x + (r() - 0.5) * 0.3, at.y + (r() - 0.5) * 0.2, at.z + (r() - 0.5) * 0.45);
      p.v.set((r() - 0.5) * 0.8, -r() * 0.5, (r() - 0.5) * 0.8);
      p.life = 2.6 + r() * 1.2;
      p.s = 0.6 + r() * 0.9;
      p.rest = false;
    }
  };

  shadows(root);
  for (const c of [...boomCyls, armCyl, buckCyl]) shadows(c.g);

  /* ── 움직이기 ── */
  const orbit = new Orbit(V3(1.4, 0.95, 0), 0.95, 0.3, 7.6);
  const drag = new Drag();
  const overlay = new Overlay();
  let speed = 1;
  let clock = 0;
  let trackOff = 0;
  let lastX = 0;
  let loaded = false;
  let spilled = false;
  let label = '';
  let highlight = false;
  let trackOnly = 0; // 남은 초 (「트랙만 움직이기」)
  let trackOnlyX = 0;
  let isBig = false;
  const setHighlight = (on: boolean): void => {
    for (const m of bodyMats) {
      const mm = m as THREE.MeshPhysicalMaterial;
      if (mm === glass) {
        mm.opacity = on ? 0.08 : 0.38;
        continue;
      }
      mm.transparent = on;
      mm.opacity = on ? 0.14 : 1;
      mm.depthWrite = !on;
      mm.needsUpdate = true;
    }
    cylYellow.emissive.set(on ? 0x6a4400 : 0x000000);
    rodChrome.emissive.set(on ? 0x223344 : 0x000000);
  };

  return {
    scene,
    camera: cam,
    update(_t, dt) {
      dt = Math.min(dt, 0.05);
      orbit.update(cam, drag, dt, 0.1);
      let pose: ReturnType<typeof poseAt>;
      if (trackOnly > 0) {
        trackOnly = Math.max(0, trackOnly - dt);
        const u = 1 - trackOnly / 4;
        trackOnlyX = Math.sin(u * TAU) * 0.6;
        pose = { ...poseAt(clock), i: -1, u: 0 };
        pose.x += trackOnlyX;
        label = '무한궤도만 — 앞으로 · 뒤로';
      } else {
        clock += dt * speed;
        pose = poseAt(clock);
        label = KEYS[pose.i]!.label;
        if (pose.i === DIG_DONE && pose.u > 0.85) loaded = true;
        if (pose.i === DUMP_AT && pose.u > 0.35 && !spilled && loaded) {
          spill();
          spilled = true;
          loaded = false;
        }
        if (pose.i === 0) spilled = false;
      }
      setPose(pose.b, pose.a, pose.k, pose.s, pose.x);
      load.visible = loaded;
      // 무한궤도: 몸이 간 만큼 경로 위치를 뒤로 → 바닥 링크는 땅에 멈춤
      const dx = pose.x - lastX;
      lastX = pose.x;
      trackOff -= dx;
      for (const sp of spinners) sp.o.rotation.z -= dx / sp.r;
      for (const im of tracks) {
        for (let i = 0; i < N_LINK; i++) {
          const { p, t, n } = trackAt((i / N_LINK) * TR_L + trackOff);
          const bx = V3(t[0], t[1], 0);
          const by = V3(n[0], n[1], 0);
          const bz = V3().crossVectors(bx, by);
          m4.makeBasis(bx, by, bz).setPosition(p[0], p[1], 0);
          im.setMatrixAt(i, m4);
        }
        im.instanceMatrix.needsUpdate = true;
      }
      // 실린더 · 4절 링크
      const q = pinsFor(pose.b * D2R, pose.a * D2R, pose.k * D2R);
      for (const c of boomCyls) placeCyl(c, q.bc[0], q.bc[1]);
      placeCyl(armCyl, q.ac[0], q.ac[1]);
      placeCyl(buckCyl, q.kc[0], q.kc[1]);
      for (const r of rocker) plate2(r, ROCK_C, q.D);
      for (const l of linkP) plate2(l, q.D, q.Barm);
      dPin.position.set(q.D[0], q.D[1], 0);
      // 쏟아진 흙
      for (let i = 0; i < NP; i++) {
        const p = parts[i]!;
        if (p.life > 0) {
          p.life -= dt;
          if (!p.rest) {
            p.v.y -= 9.8 * dt;
            p.p.addScaledVector(p.v, dt);
            const g = groundAt(p.p.x, p.p.z) + 0.03;
            if (p.p.y < g) {
              p.p.y = g;
              p.rest = true;
            }
          }
        }
        const s = p.life > 0 ? p.s * Math.min(1, p.life / 0.6) : 0;
        qd.setFromEuler(new THREE.Euler(i, i * 2, 0));
        m4.compose(p.p, qd, V3(s, s, s));
        clods.setMatrixAt(i, m4);
      }
      clods.instanceMatrix.needsUpdate = true;
    },
    render(r, w, h) {
      isBig = w >= 700;
      if (isBig) drag.attach(w, h);
      if (!stage.prepare(r, cam)) return;
      r.render(scene, cam);
      const cylTag = (name: string, c: Cyl): string => {
        const dd = c.d - c.prev;
        return `${name} ${c.d.toFixed(2)} m ${Math.abs(dd) < 0.0004 ? '·' : dd > 0 ? '▲ 늘어남' : '▼ 줄어듦'}`;
      };
      const tags: Tag[] = [{ text: label, x: 0.03, y: 0.05, ax: 0, ay: 0, big: true, bg: 'rgba(160,110,10,0.82)' }];
      if (isBig) {
        tags.push(
          { text: cylTag('붐 실린더', boomCyls[0]!), x: 0.97, y: 0.05, ax: 1, ay: 0 },
          { text: cylTag('팔 실린더', armCyl), x: 0.97, y: 0.13, ax: 1, ay: 0 },
          { text: cylTag('버킷 실린더', buckCyl), x: 0.97, y: 0.21, ax: 1, ay: 0 },
          { text: `무한궤도 링크 ${N_LINK}개 × 2 — 바닥 링크는 땅에 멈춰 있고 위는 두 배 빠르게`, x: 0.5, y: 0.96, ax: 0.5, ay: 1 },
        );
      }
      overlay.draw(r, w, h, tags);
    },
    controls: [
      { type: 'range', label: '속도', min: 0.2, max: 2.5, step: 0.05, value: 1, on: (v) => (speed = v) },
      { type: 'toggle', label: '유압 실린더 강조 (나머지 반투명)', value: false, on: (v) => ((highlight = v), setHighlight(highlight)) },
      { type: 'button', label: '무한궤도만 움직이기', on: () => (trackOnly = 4) },
    ],
    dispose() {
      drag.dispose();
      overlay.dispose();
      freeTree(scene);
      M.dispose();
      for (const m of extraMats) m.dispose();
      for (const m of bodyMats) m.dispose();
      stage.dispose();
    },
  };
}

function shadows(o: THREE.Object3D): void {
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
}

export const DEMOS: DemoMap = {
  i544: { kind: '3d', caption: '무한궤도 링크 60개 × 2가 바퀴 둘레 경로를 따라 돌고, 유압 실린더 셋은 두 핀 사이 거리만큼 봉이 통에서 나왔다 들어간다 — 버킷은 4절 링크', make: () => makeDigger() },
};

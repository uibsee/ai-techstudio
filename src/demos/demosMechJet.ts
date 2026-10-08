import * as THREE from 'three';
import type { DemoMap, Scene3D } from './types';
import { Drag, Orbit, Overlay, freeTree, lerp, makeStage, mechMats, rng, smooth, TAU } from './lib/mech';

/**
 * 견본 — i543 터보팬 제트엔진 단면 (2026-10-08)
 *  - 날개: 뿌리 → 끝으로 비틀림 · 시위 · 두께가 바뀌는 NACA 꼴 단면을 줄줄이 이어 직접 생성, 원형 배열은 인스턴스
 *  - 팬(넓은 비틀린 날개 22장) · 저압 압축기 2단 · 고압 압축기 6단(회전 / 고정 번갈아, 뒤로 갈수록 작고 많게) · 연소실 · 고압 터빈 · 저압 터빈 · 배기 콘
 *  - 나셀 · 코어 덮개 · 연소실은 회전체 — 위쪽 반을 잘라 속을 보이고, 잘린 면은 붉은 단면 색
 *  - 저압 축(팬 · 저압 압축기 · 저압 터빈)과 고압 축(고압 압축기 · 고압 터빈)은 다른 빠르기로 돈다
 *  - 공기 입자: 바이패스(하늘색, 팬만 지나 바깥으로) · 코어(압축될수록 희게 → 연소 뒤 주황 → 빠르게 빠져나감)
 */

const H = 1.45; // 축 높이

type XR = [number, number];
/** 표 [x, 값] 사이를 부드럽게 */
function table(pts: XR[]): (x: number) => number {
  return (x) => {
    if (x <= pts[0]![0]) return pts[0]![1];
    for (let i = 1; i < pts.length; i++) {
      const [x1, y1] = pts[i]!;
      if (x <= x1) {
        const [x0, y0] = pts[i - 1]!;
        const k = (x - x0) / (x1 - x0);
        return lerp(y0, y1, k * k * (3 - 2 * k));
      }
    }
    return pts[pts.length - 1]![1];
  };
}
// 코어 통로: 바깥 벽(rc) · 안쪽 드럼(rh) · 코어 덮개 겉(ro) · 나셀 안쪽(rn)
const RC: XR[] = [[-1.32, 0.445], [-0.92, 0.425], [-0.7, 0.4], [0.28, 0.335], [0.42, 0.45], [0.84, 0.45], [0.95, 0.39], [1.15, 0.41], [1.6, 0.5], [1.76, 0.43]];
const RH: XR[] = [[-1.32, 0.27], [-0.92, 0.27], [-0.7, 0.225], [0.28, 0.282], [0.42, 0.29], [0.84, 0.29], [0.95, 0.285], [1.6, 0.29], [1.76, 0.275]];
const RO: XR[] = [[-1.34, 0.455], [-1.1, 0.55], [-0.5, 0.6], [0.6, 0.62], [1.3, 0.58], [1.76, 0.45]];
const rc = table(RC);
const rh = table(RH);
const ro = table(RO);
const rn = table([[-2.0, 1.0], [-1.4, 0.985], [-0.6, 0.98], [0.2, 0.97], [0.7, 0.99]]);

interface BladeOpt {
  r0: number;
  r1: number;
  c0: number;
  c1: number;
  /** 축에 대한 날개 각 (라디안) 뿌리 · 끝 */
  tw0: number;
  tw1: number;
  /** 두께 비 · 휨 비 */
  t: number;
  camber: number;
  /** 가운데가 넓어지는 정도 · 뒤로 젖힘 */
  bulge?: number;
  sweep?: number;
  nS?: number;
  nC?: number;
}
/** 날개 하나 — 반지름 방향 = +Y, 축 = X. 단면은 NACA 4자리 두께 + 포물선 휨 */
function bladeGeo(o: BladeOpt): THREE.BufferGeometry {
  const nS = o.nS ?? 10;
  const nC = o.nC ?? 9;
  const af: [number, number][] = [];
  const pt = (a: number, up: boolean): [number, number] => {
    const yt = 5 * o.t * (0.2969 * Math.sqrt(a) - 0.126 * a - 0.3516 * a * a + 0.2843 * a ** 3 - 0.1036 * a ** 4);
    const yc = o.camber * 4 * a * (1 - a);
    return [a - 0.42, yc + (up ? yt : -yt)];
  };
  // 위 면: 뒷전 → 앞전, 아래 면: 앞전 → 뒷전 (앞전 겹침 없이) — 촘촘한 코사인 간격
  for (let i = nC; i >= 0; i--) af.push(pt((1 - Math.cos((Math.PI * i) / nC)) / 2, true));
  for (let i = 1; i <= nC; i++) af.push(pt((1 - Math.cos((Math.PI * i) / nC)) / 2, false));
  const M = af.length;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= nS; j++) {
    const s = j / nS;
    const r = lerp(o.r0, o.r1, s);
    const c = lerp(o.c0, o.c1, s) + (o.bulge ?? 0) * Math.sin(Math.PI * s);
    const th = lerp(o.tw0, o.tw1, Math.pow(s, 0.85));
    const sw = (o.sweep ?? 0) * s * s;
    const ct = Math.cos(th);
    const st = Math.sin(th);
    for (const [a, b] of af) {
      const u = a * c;
      const v = b * c;
      pos.push(u * ct - v * st + sw, r, u * st + v * ct);
    }
    if (j < nS)
      for (let i = 0; i < M; i++) {
        const i2 = (i + 1) % M;
        const A = j * M + i;
        const B = j * M + i2;
        const C = (j + 1) * M + i;
        const D = (j + 1) * M + i2;
        idx.push(A, B, C, B, D, C);
      }
  }
  // 끝 마개
  const top = nS * M;
  const cx = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < M; i++) {
    cx.x += pos[(top + i) * 3]!;
    cx.y += pos[(top + i) * 3 + 1]!;
    cx.z += pos[(top + i) * 3 + 2]!;
  }
  const ci = pos.length / 3;
  pos.push(cx.x / M, cx.y / M, cx.z / M);
  for (let i = 0; i < M; i++) idx.push(top + ((i + 1) % M), top + i, ci);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 날개 n 장을 축 둘레로 고르게 — 인스턴스 */
function ring(geo: THREE.BufferGeometry, mat: THREE.Material, n: number, x: number, phase = 0): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(geo, mat, n);
  const m4 = new THREE.Matrix4();
  for (let k = 0; k < n; k++) im.setMatrixAt(k, m4.makeRotationX((k / n) * TAU + phase));
  im.position.x = x;
  im.castShadow = true;
  im.receiveShadow = true;
  return im;
}

/** [x, r] 닫힌 윤곽을 축(X) 둘레로 — half 면 아래쪽 반만 (φ 0 ~ π) */
function shell(profile: XR[], half: boolean, segs = 96): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(
    profile.map(([x, r]) => new THREE.Vector2(r, x)),
    half ? segs / 2 : segs,
    0,
    half ? Math.PI : TAU,
  );
  g.rotateZ(-Math.PI / 2);
  return g;
}
/** 잘린 면 두 장 — 윤곽을 축 높이의 수평면(앞 · 뒤 z 쪽)에 */
function cutFaces(profile: XR[]): THREE.BufferGeometry[] {
  const s = new THREE.Shape(profile.map(([x, r]) => new THREE.Vector2(x, r)));
  const a = new THREE.ShapeGeometry(s).rotateX(Math.PI / 2);
  const b = new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2);
  return [a, b];
}

/** 3D 이름표 — 화면 크기 고정 스프라이트 + 가리키는 선 */
function label(text: string, col: string): THREE.Sprite {
  const c = document.createElement('canvas');
  const fs = 44;
  const g0 = c.getContext('2d')!;
  g0.font = `800 ${fs}px "Pretendard Variable", Pretendard, system-ui, sans-serif`;
  const w = Math.ceil(g0.measureText(text).width + fs * 1.1);
  c.width = w;
  c.height = Math.ceil(fs * 1.7);
  const g = c.getContext('2d')!;
  g.font = `800 ${fs}px "Pretendard Variable", Pretendard, system-ui, sans-serif`;
  g.beginPath();
  g.roundRect(2, 2, c.width - 4, c.height - 4, (c.height - 4) / 2);
  g.fillStyle = col;
  g.fill();
  g.fillStyle = '#fff';
  g.textBaseline = 'middle';
  g.fillText(text, fs * 0.55, c.height / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, depthWrite: false, sizeAttenuation: false, toneMapped: false }));
  sp.center.set(0.5, 0);
  sp.scale.set(0.034 * (c.width / c.height), 0.034, 1);
  sp.renderOrder = 999;
  return sp;
}

function spinnerTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1d2026';
  g.fillRect(0, 0, 256, 256);
  // 나선 줄 (돌 때 새가 알아보게 하는 흰 소용돌이) — u = 둘레, v = 축 방향
  g.fillStyle = '#f4f4f0';
  for (let y = 0; y < 256; y++) {
    const off = (y / 256) * 150;
    g.fillRect((off % 256) - 0, y, 18, 1);
    g.fillRect(((off % 256) - 256), y, 18, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function makeJet(): Scene3D {
  const st = makeStage({ size: 4.2 });
  const { scene, cam } = st;
  const M = mechMats();
  const mats: THREE.Material[] = [];
  const mk = <T extends THREE.Material>(m: T): T => {
    mats.push(m);
    return m;
  };
  // 넓은 팬 날개는 거울처럼 비추면 어두운 배경만 비쳐 까맣게 된다 — 금속도를 낮추고 결을 살짝 거칠게
  const titanium = mk(new THREE.MeshPhysicalMaterial({ color: 0xb4bcc6, metalness: 0.55, roughness: 0.36, clearcoat: 0.4, clearcoatRoughness: 0.3, side: THREE.DoubleSide }));
  const steelB = mk(new THREE.MeshPhysicalMaterial({ color: 0xc4cad1, metalness: 1, roughness: 0.3 }));
  const nickel = mk(new THREE.MeshPhysicalMaterial({ color: 0xb59474, metalness: 1, roughness: 0.34, emissive: 0xff5a10, emissiveIntensity: 0 }));
  const nacelleM = mk(new THREE.MeshPhysicalMaterial({ color: 0xf1f3f5, metalness: 0.15, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15, side: THREE.DoubleSide }));
  const casingM = mk(new THREE.MeshPhysicalMaterial({ color: 0x8d949c, metalness: 0.9, roughness: 0.42, side: THREE.DoubleSide }));
  const cutM = mk(new THREE.MeshStandardMaterial({ color: 0xd8452e, roughness: 0.55, side: THREE.DoubleSide }));
  const cutM2 = mk(new THREE.MeshStandardMaterial({ color: 0xe9894a, roughness: 0.55, side: THREE.DoubleSide }));
  // 불꽃 무늬: 둘레(u) 방향으로 갈래진 혀, 축(v) 방향으로 앞이 밝고 뒤로 사그라짐
  const flameTex = (() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const g = c.getContext('2d')!;
    const fr = rng(5);
    g.fillStyle = '#000';
    g.fillRect(0, 0, 256, 64);
    for (let i = 0; i < 70; i++) {
      const x = fr() * 256;
      const len = 20 + fr() * 40;
      const w = 3 + fr() * 6;
      const gr = g.createLinearGradient(0, 0, 0, len);
      gr.addColorStop(0, 'rgba(255,240,180,0.9)');
      gr.addColorStop(0.35, 'rgba(255,150,50,0.7)');
      gr.addColorStop(1, 'rgba(255,60,10,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(x, len / 2, w, len / 2, 0, 0, TAU);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const flameM = mk(new THREE.MeshBasicMaterial({ map: flameTex, color: 0xffffff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const sTex = spinnerTex();
  const spinM = mk(new THREE.MeshPhysicalMaterial({ map: sTex, metalness: 0.4, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }));

  const eng = new THREE.Group();
  eng.position.y = H;
  scene.add(eng);
  const lp = new THREE.Group(); // 저압 축
  const hp = new THREE.Group(); // 고압 축
  eng.add(lp, hp);

  /* ── 팬 ── */
  const fanG = bladeGeo({ r0: 0.27, r1: 0.95, c0: 0.3, c1: 0.27, tw0: 0.32, tw1: 1.12, t: 0.07, camber: 0.05, bulge: 0.12, sweep: 0.06, nS: 14, nC: 12 });
  lp.add(ring(fanG, titanium, 22, -1.55));
  // 팬 디스크 · 스피너
  const spinner = new THREE.Mesh(
    shell([[-2.13, 0.0], [-2.09, 0.07], [-2.0, 0.15], [-1.86, 0.22], [-1.7, 0.27], [-1.5, 0.285], [-1.36, 0.28]], false, 64),
    spinM,
  );
  spinner.castShadow = true;
  lp.add(spinner);

  /* ── 저압 압축기 · 고압 압축기 (회전 R / 고정 S 번갈아) ── */
  const stage = (x: number, rotor: boolean, n: number, chord: number, tw: number, hot = false): void => {
    const r0 = rh(x);
    const r1 = rc(x) - 0.008;
    const g = bladeGeo({ r0: r0 - 0.005, r1, c0: chord, c1: chord * 0.9, tw0: rotor ? tw : -tw * 0.85, tw1: rotor ? tw + 0.25 : -tw * 0.75, t: hot ? 0.16 : 0.08, camber: hot ? 0.09 : 0.05, nS: 5, nC: 7 });
    const mat = hot ? nickel : rotor ? steelB : M.iron;
    const im = ring(g, mat, n, x, rotor ? 0 : 0.07);
    if (rotor) (x < -0.85 || x > 1.17 ? lp : hp).add(im);
    else eng.add(im);
  };
  // 저압 압축기 (부스터) 2단
  stage(-1.2, true, 40, 0.07, 0.75);
  stage(-1.12, false, 44, 0.06, 0.7);
  stage(-1.04, true, 44, 0.065, 0.75);
  stage(-0.96, false, 48, 0.055, 0.7);
  // 고압 압축기 6단 — 뒤로 갈수록 짧고 많게
  for (let k = 0; k < 6; k++) {
    const x = -0.66 + k * 0.155;
    stage(x, true, 44 + k * 4, 0.058 - k * 0.003, 0.82);
    stage(x + 0.077, false, 50 + k * 4, 0.05 - k * 0.003, 0.75);
  }
  // 고압 터빈 · 저압 터빈 (뜨거운 니켈 합금)
  stage(0.9, false, 46, 0.06, 0.9, true);
  stage(0.98, true, 60, 0.055, 1.0, true);
  stage(1.06, false, 50, 0.058, 0.9, true);
  stage(1.13, true, 64, 0.052, 1.0, true);
  for (let k = 0; k < 3; k++) {
    const x = 1.21 + k * 0.135;
    stage(x, false, 56 + k * 4, 0.06, 0.85, true);
    stage(x + 0.068, true, 66 + k * 4, 0.056, 0.95, true);
  }

  /* ── 드럼 (안쪽 회전 몸통) · 축 · 배기 콘 ── */
  const drum = new THREE.Mesh(
    shell([[-1.36, 0.0], [-1.36, 0.28], ...RH.slice(0, 4).map(([x, r]): XR => [x, r - 0.004]), [0.3, 0.0]], false, 64),
    M.steel,
  );
  lp.add(drum);
  const hpDrum = new THREE.Mesh(shell([[0.28, 0.0], [0.28, 0.27], [0.42, 0.285], [0.84, 0.285], [1.17, 0.284], [1.17, 0.0]], false, 64), M.iron);
  hp.add(hpDrum);
  const lptDrum = new THREE.Mesh(shell([[1.17, 0.0], [1.17, 0.285], [1.6, 0.286], [1.76, 0.272], [1.76, 0.0]], false, 64), M.iron);
  lp.add(lptDrum);
  const plug = new THREE.Mesh(shell([[1.76, 0.0], [1.76, 0.272], [1.95, 0.22], [2.15, 0.12], [2.32, 0.02], [2.34, 0.0]], false, 64), M.steel);
  eng.add(plug);

  /* ── 나셀 · 코어 덮개 · 연소실 — 반쪽 / 통째로 두 벌 ── */
  const NAC: XR[] = [
    [-2.0, 1.02], [-1.96, 1.075], [-1.84, 1.115], [-1.2, 1.14], [-0.4, 1.125], [0.3, 1.07], [0.7, 1.005],
    [0.7, 0.99], [0.2, 0.972], [-0.6, 0.982], [-1.4, 0.988], [-1.86, 1.0], [-1.97, 1.003],
  ];
  const coreOuter: XR[] = RO.map(([x, r]) => [x, r]);
  const coreInner: XR[] = [...RC].reverse().map(([x, r]) => [x, r + 0.006]);
  const CORE: XR[] = [...coreOuter, ...coreInner];
  // 연소실은 속이 빈 두 겹 라이너 + 앞 돔 — 잘린 면이 벽 두께만큼만 보이고 안의 불꽃이 드러난다
  const LIN_O: XR[] = [[0.35, 0.426], [0.84, 0.446], [0.84, 0.432], [0.36, 0.413]];
  const LIN_I: XR[] = [[0.35, 0.316], [0.84, 0.3], [0.84, 0.313], [0.36, 0.328]];
  const DOME: XR[] = [[0.325, 0.318], [0.355, 0.318], [0.355, 0.425], [0.325, 0.425]];
  const cutGroup = new THREE.Group();
  const fullGroup = new THREE.Group();
  const parts: [XR[], THREE.Material, THREE.Material][] = [
    [NAC, nacelleM, cutM],
    [CORE, casingM, cutM2],
    [LIN_O, M.iron, cutM2],
    [LIN_I, M.iron, cutM2],
    [DOME, M.iron, cutM2],
  ];
  for (const [prof, mat, cm] of parts) {
    const half = new THREE.Mesh(shell(prof, true), mat);
    const full = new THREE.Mesh(shell(prof, false), mat);
    cutGroup.add(half);
    fullGroup.add(full);
    for (const g of cutFaces(prof)) cutGroup.add(new THREE.Mesh(g, cm));
  }
  fullGroup.visible = false;
  eng.add(cutGroup, fullGroup);
  // 나셀 입구 테 (크롬 띠)
  const lipFull = new THREE.Mesh(new THREE.TorusGeometry(1.045, 0.035, 12, 96).rotateY(Math.PI / 2), M.chrome);
  const lipHalf = new THREE.Mesh(new THREE.TorusGeometry(1.045, 0.035, 12, 48, Math.PI).rotateZ(Math.PI).rotateY(Math.PI / 2), M.chrome);
  lipFull.position.x = lipHalf.position.x = -1.99;
  cutGroup.add(lipHalf);
  fullGroup.add(lipFull);

  /* ── 연소실: 연료 노즐 · 불꽃 ── */
  const nozG = new THREE.CylinderGeometry(0.012, 0.016, 0.09, 8).rotateZ(Math.PI / 2);
  const nozzles = new THREE.InstancedMesh(nozG, M.brass, 18);
  {
    const m4 = new THREE.Matrix4();
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * TAU;
      m4.makeTranslation(0.35, Math.cos(a) * 0.37, Math.sin(a) * 0.37);
      nozzles.setMatrixAt(k, m4);
    }
  }
  eng.add(nozzles);
  const flame = new THREE.Mesh(shell([[0.36, 0.37], [0.42, 0.335], [0.6, 0.33], [0.82, 0.345], [0.82, 0.41], [0.6, 0.42], [0.42, 0.41], [0.36, 0.375]], false, 72), flameM);
  flame.renderOrder = 2;
  eng.add(flame);
  const fireLight = new THREE.PointLight(0xff7a2a, 0, 2.2, 1.6);
  fireLight.position.set(0.6, -0.15, 0);
  eng.add(fireLight);

  /* ── 받침대 ── */
  const stand = new THREE.Group();
  for (const sx of [-0.85, 0.35]) {
    const cradle = new THREE.Mesh(new THREE.TorusGeometry(1.17, 0.06, 4, 48, Math.PI * 0.62).rotateZ(Math.PI * 1.19), M.navy);
    cradle.rotation.y = Math.PI / 2;
    cradle.position.set(sx, H, 0);
    stand.add(cradle);
    for (const sz of [-0.42, 0.42]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1, 0.08), M.navy);
      leg.scale.y = H - 0.75;
      leg.position.set(sx, (H - 0.75) / 2 + 0.05, sz * 1.3);
      leg.rotation.x = -sz * 0.42;
      stand.add(leg);
    }
  }
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.07, 1.5), M.dark);
  base.position.set(-0.25, 0.035, 0);
  stand.add(base);
  for (const sz of [-0.6, 0.6]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.035, 0.08), M.yellow);
    rail.position.set(-0.25, 0.085, sz);
    stand.add(rail);
  }
  scene.add(stand);
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.material !== flameM) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });

  /* ── 공기 입자 ── */
  const NP = 1800;
  const pPos = new Float32Array(NP * 3);
  const pCol = new Float32Array(NP * 3);
  const px = new Float32Array(NP);
  const pq = new Float32Array(NP);
  const pa = new Float32Array(NP);
  const r0 = rng(17);
  const Q0 = 0.27; // 팬 면에서 이 비율 아래가 코어 (반지름 0.3 ~ 0.47)
  const respawn = (i: number, first: boolean): void => {
    px[i] = first ? -2.8 + r0() * 5.8 : -2.9 + r0() * 0.3;
    // 코어 쪽을 1/11 쯤만 — 바이패스 비 ≈ 10 : 1
    pq[i] = r0() < 0.12 ? r0() * Q0 : Q0 + r0() * (1 - Q0);
    pa[i] = r0() * TAU;
  };
  for (let i = 0; i < NP; i++) respawn(i, true);
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pg.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const dot = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  })();
  const pm = mk(new THREE.PointsMaterial({ size: 0.045, map: dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const points = new THREE.Points(pg, pm);
  points.frustumCulled = false;
  eng.add(points);
  const cBy = new THREE.Color(0x6fc8ff);
  const cCold = new THREE.Color(0x5aa8ff);
  const cHotW = new THREE.Color(0xfff2d8);
  const cFire = new THREE.Color(0xff7a1e);
  const tc = new THREE.Color();
  const stepAir = (dt: number, pw: number): void => {
    for (let i = 0; i < NP; i++) {
      let x = px[i]!;
      const q = pq[i]!;
      const core = q < Q0;
      const k = core ? q / Q0 : (q - Q0) / (1 - Q0);
      let v: number;
      let r: number;
      if (x < -1.55) {
        // 입구 앞: 팬 면 반지름으로 모여 들어옴
        const rf = 0.3 + q * 0.64;
        r = lerp(rf * 1.15, rf, smooth(-2.9, -1.6, x));
        v = 1.1;
      } else if (!core) {
        const inner = x < 1.76 ? ro(x) + 0.03 : 0.45;
        const outer = x < 0.7 ? rn(x) - 0.03 : lerp(0.99, 0.82, smooth(0.7, 3.2, x));
        r = lerp(Math.min(inner, outer - 0.05), outer, k);
        v = x < 0.7 ? 1.25 : 1.4;
      } else {
        const lo = x < 1.76 ? rh(x) + 0.012 : lerp(0.27, 0.05, smooth(1.76, 2.34, x)) + 0.02;
        const hi = x < 1.76 ? rc(x) - 0.012 : lerp(0.43, 0.36, smooth(1.76, 3.2, x));
        r = x < -1.32 ? lerp(0.29, 0.44, k) : lerp(lo, hi, k);
        v = x < 0.35 ? 0.75 : x < 0.9 ? 1.2 : x < 1.76 ? 2.0 : 2.8;
      }
      x += v * dt * (0.35 + pw * 1.3);
      if (x > 3.3) {
        respawn(i, false);
        x = px[i]!;
      }
      px[i] = x;
      const a = pa[i]! + x * (core ? 0.6 : 0.15);
      pPos[i * 3] = x;
      pPos[i * 3 + 1] = Math.cos(a) * r;
      pPos[i * 3 + 2] = Math.sin(a) * r;
      if (!core) tc.copy(cBy).multiplyScalar(0.55);
      else if (x < 0.35) tc.copy(cCold).lerp(cHotW, smooth(-1.3, 0.3, x)).multiplyScalar(0.7);
      else tc.copy(cFire).multiplyScalar(lerp(1.1, 0.25, smooth(0.9, 3.2, x)) * (0.4 + pw * 0.8));
      pCol[i * 3] = tc.r;
      pCol[i * 3 + 1] = tc.g;
      pCol[i * 3 + 2] = tc.b;
    }
    pg.attributes.position!.needsUpdate = true;
    pg.attributes.color!.needsUpdate = true;
  };

  /* ── 이름표 ── */
  const labels = new THREE.Group();
  const lineM = mk(new THREE.LineBasicMaterial({ color: 0x2a3140, depthTest: false, transparent: true, opacity: 0.75 }));
  const tagDefs: [string, string, [number, number], [number, number]][] = [
    ['팬', '#3b6fd8', [-1.55, 0.85], [-1.4, 1.38]],
    ['압축기', '#4b5568', [-0.3, 0.37], [-0.45, 1.45]],
    ['연소실', '#d8562a', [0.6, 0.4], [0.6, 1.3]],
    ['터빈', '#9a6a3a', [1.3, 0.44], [1.45, 1.3]],
    ['노즐', '#4b5568', [2.15, 0.12], [2.45, 0.85]],
  ];
  for (const [text, col, [ax, ay], [lx, ly]] of tagDefs) {
    const sp = label(text, col);
    sp.position.set(lx, H + ly, 0);
    labels.add(sp);
    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ax, H + ay, 0), new THREE.Vector3(lx, H + ly, 0)]);
    const ln = new THREE.Line(lg, lineM);
    ln.renderOrder = 998;
    labels.add(ln);
  }
  scene.add(labels);

  let power = 0.7;
  let air = true;
  let cut = true;
  const drag = new Drag();
  const orbit = new Orbit(new THREE.Vector3(0.15, H - 0.05, 0), -0.95, 0.42, 6.6);
  const overlay = new Overlay();
  let lpA = 0;
  let hpA = 0;
  return {
    scene,
    camera: cam,
    update(t, dt) {
      orbit.update(cam, drag, dt, 0.1);
      const w = 0.6 + power * 9;
      lpA += dt * w;
      hpA += dt * w * 2.3;
      lp.rotation.x = lpA;
      hp.rotation.x = hpA;
      const fl = power * (0.75 + 0.25 * Math.sin(t * 23) * Math.sin(t * 7.3 + 1));
      flameM.opacity = 0.15 + fl * 0.85;
      flameTex.offset.x = (t * 0.07) % 1;
      flame.visible = power > 0.02;
      fireLight.intensity = fl * 6;
      nickel.emissiveIntensity = power * 0.35;
      points.visible = air;
      if (air) stepAir(Math.min(dt, 0.05), power);
    },
    render(r, w, h) {
      if (!st.prepare(r, cam)) return;
      drag.attach(w, h);
      r.render(scene, cam);
      overlay.draw(r, w, h, [
        { text: `출력 ${Math.round(power * 100)}%`, x: 0.97, y: 0.05, ax: 1, ay: 0 },
        { text: '바이패스 비 ≈ 10 : 1 — 공기 대부분은 팬만 지나 바깥으로', x: 0.03, y: 0.95, ax: 0, ay: 1, bg: 'rgba(40,110,170,0.78)' },
        { text: '압축 단마다 압력 ×1.3 → 전체 ×40', x: 0.97, y: 0.95, ax: 1, ay: 1, bg: 'rgba(170,80,40,0.8)' },
      ]);
    },
    controls: [
      { type: 'range', label: '출력 (회전 · 불꽃 · 공기 빠르기)', min: 0, max: 1, step: 0.01, value: 0.7, on: (v) => (power = v) },
      {
        type: 'toggle',
        label: '단면 (위쪽 반 잘라 보기)',
        value: true,
        on: (v) => {
          cut = v;
          cutGroup.visible = cut;
          fullGroup.visible = !cut;
          labels.visible = cut;
        },
      },
      { type: 'toggle', label: '공기 흐름 입자', value: true, on: (v) => (air = v) },
    ],
    dispose() {
      drag.dispose();
      overlay.dispose();
      freeTree(scene);
      labels.traverse((o) => {
        const s = o as THREE.Sprite;
        if (s.isSprite) {
          (s.material as THREE.SpriteMaterial).map?.dispose();
          s.material.dispose();
        }
      });
      for (const m of mats) m.dispose();
      M.dispose();
      sTex.dispose();
      flameTex.dispose();
      dot.dispose();
      st.dispose();
    },
  };
}

export const DEMOS: DemoMap = {
  i543: {
    kind: '3d',
    caption: '비틀린 날개 단면을 직접 생성해 원형으로 늘어놓은 터보팬 — 위쪽 반을 잘라 팬 · 압축기 · 연소실 · 터빈 · 노즐이 보이고, 공기 대부분은 팬만 지나 바깥으로 (바이패스)',
    make: () => makeJet(),
  },
};

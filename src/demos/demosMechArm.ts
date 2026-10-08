import * as THREE from 'three';
import type { DemoMap, Scene3D } from './types';
import { Drag, Orbit, Overlay, TAU, bevelExtrude, between, clamp, freeTree, lathe, lerp, mechMats, makeStage, roundRect, shadows, type Tag } from './lib/mech';

/**
 * i542 산업용 로봇 팔 (2026-10-08)
 *  - 6축: 허리(J1) · 어깨(J2) · 팔꿈치(J3) · 손목 비틀기(J4) · 손목 꺾기(J5) · 손끝 돌리기(J6) + 평행 2손가락 집게
 *  - 몸: 회전체(받침 · 허리 · 관절 북 · 모터) + 모서리 깎은 돌출(어깨 기둥 · 가운데가 잘록한 위팔 · 아래팔 · 손목 볼 · 집게)
 *  - 어깨 옆 가스 스프링(두 회전점 사이에서 늘었다 줄었다) · 팔을 따라 휘는 고무 케이블(매 장면 튜브 다시 계산)
 *  - 동작: 컨베이어로 온 상자를 해석적 IK(허리 각 + 2링크 평면)로 집어 팔레트에 2 × 2 × 2 로 쌓고 돌아옴
 *    목표점은 원기둥 좌표(각 · 거리 · 높이)로 부드럽게(가속 · 감속) 옮겨 팔이 몸을 가로지르지 않게
 */

const H0 = 0.78; // 어깨 높이
const A0 = 0.15; // 허리 축에서 어깨까지 앞으로
const L1 = 1.05; // 위팔
const L2 = 1.0; // 아래팔 (팔꿈치 → 손목 중심)
const LT = 0.34; // 손목 중심 → 집게 가운데 (상자 윗면이 집게 몸 바로 아래에 오게)
const J4X = 0.34; // 아래팔에서 손목 비틀기 축이 시작하는 곳
const BELT_Z = 1.3;
const BELT_TOP = 0.55;
const BOX = new THREE.Vector3(0.3, 0.26, 0.3);
const X_STOP = 0.38;
const PALLET = new THREE.Vector3(-1.32, 0.15, 0.3);
const SLOT_DX = 0.34;
const SLOT_DZ = 0.42;
const HOVER = 0.42;

const easeIO = (k: number): number => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const wrapPi = (a: number): number => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};
const deg = (r: number): string => `${Math.round((r * 180) / Math.PI)}°`;

/* ───── 캔버스 무늬 ───── */

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/** 노랑 · 검정 빗금 띠 */
const stripeTex = (): THREE.CanvasTexture =>
  canvasTex(256, 48, (g) => {
    g.fillStyle = '#f2c21b';
    g.fillRect(0, 0, 256, 48);
    g.fillStyle = '#1b1c20';
    for (let x = -48; x < 300; x += 32) {
      g.beginPath();
      g.moveTo(x, 48);
      g.lineTo(x + 16, 48);
      g.lineTo(x + 48, 0);
      g.lineTo(x + 32, 0);
      g.fill();
    }
  });
/** 경고 세모 (!) */
const warnTex = (): THREE.CanvasTexture =>
  canvasTex(128, 128, (g) => {
    g.fillStyle = '#f2c21b';
    g.strokeStyle = '#1b1c20';
    g.lineWidth = 9;
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(64, 12);
    g.lineTo(120, 112);
    g.lineTo(8, 112);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#1b1c20';
    g.fillRect(58, 42, 12, 42);
    g.beginPath();
    g.arc(64, 97, 7, 0, TAU);
    g.fill();
  });
/** 컨베이어 고무 벨트 — 짙은 고무에 갈매기 무늬 */
const beltTex = (): THREE.CanvasTexture => {
  const t = canvasTex(128, 128, (g) => {
    g.fillStyle = '#26282d';
    g.fillRect(0, 0, 128, 128);
    const r = 0.5;
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.035})`;
      g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
    g.strokeStyle = '#3a3d44';
    g.lineWidth = 10;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(40, 16);
    g.lineTo(80, 64);
    g.lineTo(40, 112);
    g.stroke();
    void r;
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};
/** 골판지 상자 옆 · 위 */
const boxSideTex = (): THREE.CanvasTexture =>
  canvasTex(128, 128, (g) => {
    g.fillStyle = '#c99a5b';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '90,60,30' : '255,235,200'},${Math.random() * 0.08})`;
      g.fillRect(Math.random() * 128, Math.random() * 128, 1.5, 1.5);
    }
    // 위쪽 화살표 두 개 (이쪽이 위)
    g.strokeStyle = 'rgba(60,40,20,0.75)';
    g.fillStyle = 'rgba(60,40,20,0.75)';
    g.lineWidth = 5;
    for (const x of [44, 84]) {
      g.beginPath();
      g.moveTo(x, 92);
      g.lineTo(x, 52);
      g.stroke();
      g.beginPath();
      g.moveTo(x - 10, 56);
      g.lineTo(x, 40);
      g.lineTo(x + 10, 56);
      g.fill();
    }
    g.fillRect(30, 98, 68, 5);
  });
const boxTopTex = (): THREE.CanvasTexture =>
  canvasTex(128, 128, (g) => {
    g.fillStyle = '#c99a5b';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '90,60,30' : '255,235,200'},${Math.random() * 0.08})`;
      g.fillRect(Math.random() * 128, Math.random() * 128, 1.5, 1.5);
    }
    g.fillStyle = 'rgba(70,45,20,0.5)';
    g.fillRect(0, 63, 128, 2);
    g.fillStyle = 'rgba(214,170,110,0.95)';
    g.fillRect(50, 0, 28, 128);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(52, 0, 6, 128);
  });

/** 가운데가 잘록한 팔 옆모습 — 0 에서 반지름 r0, L 에서 r1, 가운데 반높이 w */
function dogbone(L: number, r0: number, r1: number, w: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, -r0);
  s.bezierCurveTo(L * 0.3, -r0, L * 0.35, -w, L * 0.5, -w);
  s.bezierCurveTo(L * 0.65, -w, L * 0.7, -r1, L, -r1);
  s.absarc(L, 0, r1, -Math.PI / 2, Math.PI / 2, false);
  s.bezierCurveTo(L * 0.7, r1, L * 0.65, w, L * 0.5, w);
  s.bezierCurveTo(L * 0.35, w, L * 0.3, r0, 0, r0);
  s.absarc(0, 0, r0, Math.PI / 2, (Math.PI * 3) / 2, false);
  return s;
}

function makeArm(): Scene3D {
  const st = makeStage({ size: 3.2 });
  const { scene, cam } = st;
  const M = mechMats();
  const texs: THREE.Texture[] = [];
  const extraMats: THREE.Material[] = [];
  const T = <X extends THREE.Texture>(t: X): X => {
    texs.push(t);
    return t;
  };
  const E = <X extends THREE.Material>(m: X): X => {
    extraMats.push(m);
    return m;
  };
  const root = new THREE.Group();
  scene.add(root);
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Mesh => {
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  };
  const zCyl = (r: number, len: number, seg = 40): THREE.BufferGeometry => new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2);
  const xCyl = (r: number, len: number, seg = 32): THREE.BufferGeometry => new THREE.CylinderGeometry(r, r, len, seg).rotateZ(-Math.PI / 2);
  /** 둥근 모서리 북 (Z 축) — 가장자리를 깎아 반사가 테를 따라 흐르게 */
  const drum = (r: number, w: number, bevel = 0.015): THREE.BufferGeometry =>
    lathe(
      [
        [0, -w / 2],
        [r - bevel, -w / 2],
        [r, -w / 2 + bevel],
        [r, w / 2 - bevel],
        [r - bevel, w / 2],
        [0, w / 2],
      ],
      48,
    ).rotateX(Math.PI / 2);
  const screw = zCyl(0.014, 0.012, 12);
  const screws = (parent: THREE.Object3D, pts: [number, number][], z: number): void => {
    for (const [x, y] of pts) mesh(screw, M.chrome, parent, x, y, z);
  };
  const decal = (tex: THREE.Texture, w: number, h: number): THREE.Mesh =>
    new THREE.Mesh(new THREE.PlaneGeometry(w, h), E(new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.45, clearcoat: 0.5, polygonOffset: true, polygonOffsetFactor: -2 })));
  const stripes = T(stripeTex());
  const warn = T(warnTex());

  /* ── 받침 (볼트 박은 원판) ── */
  const base = new THREE.Group();
  root.add(base);
  mesh(
    lathe(
      [
        [0, 0],
        [0.55, 0],
        [0.56, 0.015],
        [0.56, 0.07],
        [0.54, 0.09],
        [0.44, 0.1],
        [0.41, 0.14],
        [0, 0.14],
      ],
      64,
    ),
    M.iron,
    base,
  );
  {
    const hex = new THREE.CylinderGeometry(0.03, 0.03, 0.03, 6);
    const washer = new THREE.CylinderGeometry(0.042, 0.042, 0.008, 20);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.2;
      mesh(washer, M.steel, base, Math.cos(a) * 0.49, 0.094, Math.sin(a) * 0.49);
      mesh(hex, M.steel, base, Math.cos(a) * 0.49, 0.11, Math.sin(a) * 0.49).rotation.y = a;
    }
  }
  // 바닥 안전선 (노랑 · 검정 빗금 고리)
  {
    const ringTex = T(stripeTex());
    ringTex.wrapS = THREE.RepeatWrapping;
    ringTex.repeat.set(10, 1);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.66, 0.74, 96, 1), E(new THREE.MeshStandardMaterial({ map: ringTex, roughness: 0.7 })));
    // 고리 uv 를 둘레 방향으로
    const uv = ring.geometry.attributes.uv as THREE.BufferAttribute;
    const p = ring.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getY(i), p.getX(i));
      uv.setXY(i, (a / TAU + 0.5) * 1, Math.hypot(p.getX(i), p.getY(i)) > 0.7 ? 1 : 0);
    }
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.003;
    ring.receiveShadow = true;
    root.add(ring);
  }

  /* ── J1 허리 ── */
  const j1 = new THREE.Group();
  root.add(j1);
  mesh(
    lathe(
      [
        [0, 0.14],
        [0.37, 0.14],
        [0.38, 0.155],
        [0.38, 0.19],
        [0.36, 0.2],
        [0.35, 0.44],
        [0.33, 0.47],
        [0.22, 0.5],
        [0, 0.5],
      ],
      64,
    ),
    M.orange,
    j1,
  );
  mesh(lathe([[0.385, 0.2], [0.385, 0.225], [0.36, 0.225], [0.36, 0.2]], 64), M.dark, j1);
  // 어깨 기둥 — 옆모습을 깎아 돌출
  {
    const s = new THREE.Shape();
    s.moveTo(-0.3, 0.4);
    s.lineTo(0.36, 0.4);
    s.quadraticCurveTo(0.42, 0.52, 0.39, 0.66);
    s.absarc(A0, H0, 0.25, -0.24, Math.PI + 0.55, false);
    s.lineTo(-0.3, 0.56);
    s.lineTo(-0.3, 0.4);
    mesh(bevelExtrude(s, 0.4, 0.04, 32, 4), M.orange, j1);
    // 옆 덮개판 (짙은 회색) + 나사
    const plate = roundRect(0.34, 0.2, 0.04, 0.02, 0.52);
    for (const z of [0.2, -0.2]) {
      const p = mesh(bevelExtrude(plate, 0.014, 0.004), M.dark, j1, 0, 0, z + Math.sign(z) * 0.002);
      void p;
      screws(j1, [[-0.13, 0.44], [0.17, 0.44], [-0.13, 0.6], [0.17, 0.6]], z + Math.sign(z) * 0.011);
    }
    // 앞 빗금 띠 · 경고 세모
    const d = decal(stripes, 0.42, 0.06);
    d.position.set(0.358, 0.3, 0);
    d.rotation.y = Math.PI / 2;
    j1.add(d);
    const w = decal(warn, 0.11, 0.11);
    w.position.set(0.02, 0.52, 0.214);
    j1.add(w);
  }
  // 어깨 관절 북 · 모터
  for (const z of [0.215, -0.215]) {
    mesh(drum(0.25, 0.07), M.orange, j1, A0, H0, z);
    mesh(drum(0.13, 0.03, 0.008), M.steel, j1, A0, H0, z + Math.sign(z) * 0.045);
  }
  {
    // 어깨 모터 (짙은 회색, 냉각 지느러미)
    const pts: [number, number][] = [[0, 0]];
    for (let i = 0; i < 6; i++) {
      const y = 0.02 + i * 0.03;
      pts.push([0.13, y], [0.13, y + 0.012], [0.118, y + 0.016], [0.118, y + 0.03]);
    }
    pts.push([0.11, 0.21], [0.09, 0.225], [0, 0.225]);
    const motor = mesh(lathe(pts, 40), M.dark, j1, A0, H0, -0.245);
    motor.rotation.x = -Math.PI / 2;
    mesh(drum(0.06, 0.02, 0.006), M.brushed, j1, A0, H0, -0.48);
  }
  // 가스 스프링 받침 (허리 뒤)
  const springA = new THREE.Vector3(-0.17, 0.5, 0.3);
  mesh(bevelExtrude(roundRect(0.12, 0.1, 0.02, springA.x, springA.y), 0.12, 0.012), M.dark, j1, 0, 0, 0.255);

  /* ── J2 어깨 → 위팔 ── */
  const j2 = new THREE.Group();
  j2.position.set(A0, H0, 0);
  j1.add(j2);
  mesh(bevelExtrude(dogbone(L1, 0.2, 0.165, 0.125), 0.3, 0.035, 40, 4), M.orange, j2);
  {
    const plate = roundRect(L1 * 0.5, 0.15, 0.05, L1 * 0.52, 0);
    for (const z of [0.15, -0.15]) {
      mesh(bevelExtrude(plate, 0.014, 0.004), M.dark, j2, 0, 0, z + Math.sign(z) * 0.003);
      screws(
        j2,
        [
          [L1 * 0.3, 0.05],
          [L1 * 0.74, 0.05],
          [L1 * 0.3, -0.05],
          [L1 * 0.74, -0.05],
        ],
        z + Math.sign(z) * 0.012,
      );
    }
    const w = decal(warn, 0.09, 0.09);
    w.position.set(L1 * 0.52, 0, 0.169);
    j2.add(w);
    // 위쪽 빗금 띠
    const d = decal(stripes, 0.36, 0.05);
    d.position.set(L1 * 0.52, 0.126, 0);
    d.rotation.x = -Math.PI / 2;
    j2.add(d);
  }
  // 가스 스프링 핀 (위팔 옆)
  const springB = new THREE.Object3D();
  springB.position.set(0.42, 0.02, 0.3);
  j2.add(springB);
  mesh(zCyl(0.028, 0.16, 20), M.steel, j2, 0.42, 0.02, 0.22);

  /* ── J3 팔꿈치 → 아래팔 ── */
  const j3 = new THREE.Group();
  j3.position.set(L1, 0, 0);
  j2.add(j3);
  for (const z of [0.19, -0.19]) {
    mesh(drum(0.18, 0.06), M.orange, j3, 0, 0, z);
    mesh(drum(0.1, 0.025, 0.006), M.steel, j3, 0, 0, z + Math.sign(z) * 0.038);
  }
  {
    // 팔꿈치 모터 (옆에 붙음)
    const motor = mesh(lathe([[0, 0], [0.1, 0], [0.105, 0.01], [0.105, 0.15], [0.09, 0.17], [0, 0.17]], 36), M.dark, j3, 0, 0, 0.22);
    motor.rotation.x = Math.PI / 2;
    mesh(drum(0.045, 0.02, 0.005), M.brushed, j3, 0, 0, 0.4);
  }
  mesh(bevelExtrude(dogbone(J4X + 0.04, 0.15, 0.11, 0.1), 0.24, 0.03, 36, 3), M.orange, j3);
  {
    const d = decal(stripes, 0.2, 0.04);
    d.position.set(0.2, 0.102, 0);
    d.rotation.x = -Math.PI / 2;
    j3.add(d);
  }
  // 손목 비틀기 관절 둘레 테
  mesh(lathe([[0.1, 0], [0.112, 0.01], [0.112, 0.04], [0.1, 0.05], [0.08, 0.05], [0.08, 0]], 40).rotateZ(-Math.PI / 2), M.dark, j3, J4X, 0, 0);

  /* ── J4 손목 비틀기 ── */
  const j4 = new THREE.Group();
  j4.position.set(J4X + 0.05, 0, 0);
  j3.add(j4);
  const tubeLen = L2 - J4X - 0.05 - 0.1;
  mesh(
    lathe(
      [
        [0.092, 0],
        [0.092, tubeLen * 0.7],
        [0.082, tubeLen * 0.78],
        [0.078, tubeLen],
        [0, tubeLen],
      ],
      40,
    ).rotateZ(-Math.PI / 2),
    M.white,
    j4,
  );
  mesh(lathe([[0.096, 0.02], [0.096, 0.045], [0.093, 0.045], [0.093, 0.02]], 40).rotateZ(-Math.PI / 2), M.dark, j4, tubeLen * 0.3, 0, 0);
  // 손목 볼 (양옆 뺨)
  {
    const cheek = new THREE.Shape();
    cheek.moveTo(-0.12, -0.07);
    cheek.lineTo(0, -0.085);
    cheek.absarc(0, 0, 0.085, -Math.PI / 2, Math.PI / 2, false);
    cheek.lineTo(-0.12, 0.07);
    cheek.lineTo(-0.12, -0.07);
    for (const z of [0.085, -0.085]) {
      const c = mesh(bevelExtrude(cheek, 0.04, 0.01, 24, 3), M.orange, j4, L2 - J4X - 0.05, 0, z);
      void c;
    }
  }

  /* ── J5 손목 꺾기 ── */
  const j5 = new THREE.Group();
  j5.position.set(L2 - J4X - 0.05, 0, 0);
  j4.add(j5);
  mesh(drum(0.07, 0.13, 0.01), M.dark, j5);
  for (const z of [0.108, -0.108]) mesh(drum(0.045, 0.012, 0.004), M.brushed, j5, 0, 0, z);
  mesh(lathe([[0.06, 0], [0.072, 0.012], [0.072, 0.05], [0.06, 0.06], [0, 0.06]], 40).rotateZ(-Math.PI / 2), M.orange, j5, 0.03, 0, 0);

  /* ── J6 손끝 돌리기 + 집게 ── */
  const j6 = new THREE.Group();
  j6.position.set(0.1, 0, 0);
  j5.add(j6);
  mesh(lathe([[0.075, 0], [0.075, 0.018], [0.065, 0.024], [0, 0.024]], 40).rotateZ(-Math.PI / 2), M.chrome, j6);
  {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      mesh(xCyl(0.008, 0.008, 8), M.dark, j6, 0.026, Math.cos(a) * 0.055, Math.sin(a) * 0.055);
    }
  }
  // 집게 몸 (Z 로 긴 상자) · 미끄럼 레일
  const gripBody = new THREE.Mesh(bevelExtrude(roundRect(0.075, 0.12, 0.02), 0.36, 0.015), M.dark);
  gripBody.position.set(0.062, 0, 0);
  j6.add(gripBody);
  mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.48, 12).rotateX(Math.PI / 2), M.chrome, j6, 0.104, 0.035, 0);
  mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.48, 12).rotateX(Math.PI / 2), M.chrome, j6, 0.104, -0.035, 0);
  {
    const d = decal(stripes, 0.3, 0.035);
    d.position.set(0.062, 0.061, 0);
    d.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    d.scale.set(1, 1, 1);
    j6.add(d);
  }
  // 손가락 — 집게 가운데(손목 중심에서 LT)는 j6 의 x = LT - 0.1
  const GX = LT - 0.1;
  const fingers: THREE.Group[] = [];
  {
    const fShape = new THREE.Shape();
    fShape.moveTo(0.1, -0.05);
    fShape.lineTo(GX + 0.06, -0.035);
    fShape.quadraticCurveTo(GX + 0.09, -0.03, GX + 0.09, 0);
    fShape.quadraticCurveTo(GX + 0.09, 0.03, GX + 0.06, 0.035);
    fShape.lineTo(0.1, 0.05);
    fShape.lineTo(0.1, -0.05);
    const fg = bevelExtrude(fShape, 0.026, 0.006, 16, 2);
    const carriage = bevelExtrude(roundRect(0.05, 0.11, 0.012, 0.11, 0), 0.05, 0.008);
    const pad = new THREE.BoxGeometry(0.12, 0.06, 0.008);
    for (const s of [1, -1]) {
      const f = new THREE.Group();
      mesh(fg, M.steel, f, 0, 0, s * 0.013);
      mesh(carriage, M.orange, f, 0, 0, s * 0.02);
      mesh(pad, M.rubber, f, GX + 0.02, 0, -s * 0.004);
      f.userData['s'] = s;
      j6.add(f);
      fingers.push(f);
    }
  }
  const gripPt = new THREE.Object3D();
  gripPt.position.set(GX, 0, 0);
  j6.add(gripPt);

  /* ── 가스 스프링 (허리 받침 A ↔ 위팔 핀 B) ── */
  const barrelG = new THREE.CylinderGeometry(0.038, 0.038, 1, 24);
  const rodG = new THREE.CylinderGeometry(0.016, 0.016, 1, 16);
  const barrel = mesh(barrelG, M.dark, j1);
  const barrelCap = mesh(new THREE.CylinderGeometry(0.042, 0.042, 1, 24), M.orange, j1);
  const rod = mesh(rodG, M.chrome, j1);
  const eyeG = new THREE.TorusGeometry(0.028, 0.012, 10, 20);
  const eyeA = mesh(eyeG, M.steel, j1, springA.x, springA.y, springA.z);
  const eyeB = mesh(eyeG, M.steel, j1);
  void eyeA;

  /* ── 케이블 (팔을 따라 휘는 고무 관) ── */
  const anchors: [THREE.Object3D, THREE.Vector3][] = [
    [j1, new THREE.Vector3(-0.32, 0.3, -0.12)],
    [j1, new THREE.Vector3(-0.2, 0.62, -0.3)],
    [j2, new THREE.Vector3(0.05, 0.22, -0.24)],
    [j2, new THREE.Vector3(L1 * 0.5, 0.15, -0.2)],
    [j2, new THREE.Vector3(L1 - 0.05, 0.2, -0.25)],
    [j3, new THREE.Vector3(0.22, 0.14, -0.15)],
    [j4, new THREE.Vector3(0.1, 0.1, -0.06)],
    [j4, new THREE.Vector3(tubeLen * 0.85, 0.1, 0)],
  ];
  const cablePts = anchors.map(() => new THREE.Vector3());
  const curve = new THREE.CatmullRomCurve3(cablePts, false, 'centripetal');
  const CSEG = 64;
  const cables: { m: THREE.Mesh; r: number; off: number }[] = [];
  for (const [r, off] of [
    [0.03, 0],
    [0.017, 0.055],
  ] as const) {
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]), CSEG, r, 10, false);
    const m = new THREE.Mesh(g, r > 0.02 ? M.rubber : M.dark);
    m.frustumCulled = false;
    root.add(m);
    cables.push({ m, r, off });
  }
  const updCables = (): void => {
    anchors.forEach(([o, p], i) => cablePts[i]!.copy(p).applyMatrix4(o.matrixWorld));
    for (const c of cables) {
      const pts = cablePts.map((p, i) => (c.off ? p.clone().add(new THREE.Vector3(0, c.off * (i > 1 ? 0.6 : 0.2), -c.off * 0.5)) : p));
      const tg = new THREE.TubeGeometry(c.off ? new THREE.CatmullRomCurve3(pts, false, 'centripetal') : curve, CSEG, c.r, 10, false);
      (c.m.geometry.attributes.position as THREE.BufferAttribute).copyArray(tg.attributes.position!.array as Float32Array).needsUpdate = true;
      (c.m.geometry.attributes.normal as THREE.BufferAttribute).copyArray(tg.attributes.normal!.array as Float32Array).needsUpdate = true;
      tg.dispose();
    }
  };

  /* ── 컨베이어 ── */
  const conv = new THREE.Group();
  root.add(conv);
  const X0 = -0.15;
  const X1 = 2.6;
  const CL = X1 - X0;
  const CW = 0.46;
  const bt = T(beltTex());
  bt.repeat.set(CL / 0.22, 1);
  const beltM = E(new THREE.MeshStandardMaterial({ map: bt, roughness: 0.8 }));
  {
    const top = new THREE.Mesh(new THREE.PlaneGeometry(CL, CW).rotateX(-Math.PI / 2), beltM);
    top.position.set((X0 + X1) / 2, BELT_TOP, BELT_Z);
    conv.add(top);
    // 롤러 끝 (반원통 벨트) · 옆 레일 · 다리
    for (const x of [X0, X1]) {
      mesh(zCyl(0.05, CW + 0.02, 32), M.rubber, conv, x, BELT_TOP - 0.05, BELT_Z);
      mesh(zCyl(0.025, CW + 0.12, 16), M.chrome, conv, x, BELT_TOP - 0.05, BELT_Z);
    }
    const rail = bevelExtrude(roundRect(CL + 0.14, 0.12, 0.025, (X0 + X1) / 2, BELT_TOP - 0.03), 0.04, 0.01);
    for (const s of [1, -1]) mesh(rail, M.navy, conv, 0, 0, BELT_Z + s * (CW / 2 + 0.03));
    const leg = new THREE.BoxGeometry(0.05, BELT_TOP - 0.09, 0.05).translate(0, (BELT_TOP - 0.09) / 2, 0);
    for (const x of [X0 + 0.15, (X0 + X1) / 2, X1 - 0.15])
      for (const s of [1, -1]) mesh(leg, M.iron, conv, x, 0, BELT_Z + s * (CW / 2 + 0.03));
    const cross = new THREE.BoxGeometry(0.04, 0.04, CW + 0.06);
    for (const x of [X0 + 0.15, (X0 + X1) / 2, X1 - 0.15]) mesh(cross, M.iron, conv, x, 0.15, BELT_Z);
    // 멈춤 막대 (노랑)
    mesh(bevelExtrude(roundRect(0.04, 0.07, 0.012, X_STOP - BOX.x / 2 - 0.025, BELT_TOP + 0.035), CW + 0.1, 0.008), M.yellow, conv, 0, 0, BELT_Z);
    // 밑 롤러 줄 (벨트 아래 가지런히)
    const roll = zCyl(0.022, CW - 0.04, 16);
    for (let x = X0 + 0.25; x < X1 - 0.1; x += 0.25) mesh(roll, M.steel, conv, x, BELT_TOP - 0.06, BELT_Z);
  }

  /* ── 팔레트 ── */
  {
    const wood = E(new THREE.MeshStandardMaterial({ color: 0xc9a06a, roughness: 0.82 }));
    const woodD = E(new THREE.MeshStandardMaterial({ color: 0xa97f4c, roughness: 0.85 }));
    const pw = SLOT_DX * 2 + 0.12;
    const pd = SLOT_DZ * 2 + 0.12;
    const plank = new THREE.BoxGeometry(0.13, 0.025, pd);
    for (let i = 0; i < 5; i++) mesh(plank, wood, root, PALLET.x - pw / 2 + 0.065 + (i * (pw - 0.13)) / 4, PALLET.y - 0.0125, PALLET.z);
    const block = new THREE.BoxGeometry(pw, 0.1, 0.11);
    for (const s of [-1, 0, 1]) mesh(block, woodD, root, PALLET.x, 0.05, PALLET.z + s * (pd / 2 - 0.06));
  }

  /* ── 상자 (재활용 묶음) ── */
  const sideT = T(boxSideTex());
  const topT = T(boxTopTex());
  const sideM = E(new THREE.MeshStandardMaterial({ map: sideT, roughness: 0.9 }));
  const topM = E(new THREE.MeshStandardMaterial({ map: topT, roughness: 0.88 }));
  const boxG = new THREE.BoxGeometry(BOX.x, BOX.y, BOX.z);
  type Box = { m: THREE.Mesh; st: 'off' | 'belt' | 'held' | 'placed' | 'clear'; x: number; k: number };
  const boxes: Box[] = [];
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(boxG, [sideM, sideM, topM, topM, sideM, sideM]);
    m.castShadow = m.receiveShadow = true;
    m.visible = false;
    root.add(m);
    boxes.push({ m, st: 'off', x: 0, k: 0 });
  }
  const spawn = (x: number): void => {
    const b = boxes.find((q) => q.st === 'off');
    if (!b) return;
    b.st = 'belt';
    b.x = x;
    b.k = 0;
    b.m.visible = true;
    b.m.scale.setScalar(1);
    root.attach(b.m);
    b.m.rotation.set(0, 0, 0);
    b.m.position.set(x, BELT_TOP + BOX.y / 2, BELT_Z);
  };
  spawn(X_STOP + 0.9);
  spawn(X_STOP + 1.6);
  let placedN = 0;
  const slotPos = (n: number): THREE.Vector3 => {
    const layer = Math.floor(n / 4);
    const k = n % 4;
    return new THREE.Vector3(PALLET.x + (k % 2 ? 1 : -1) * (SLOT_DX / 2), PALLET.y + BOX.y / 2 + layer * BOX.y, PALLET.z + (k < 2 ? -1 : 1) * (SLOT_DZ / 2));
  };

  /* ── 보조 표시: IK 목표 · 팔 길이 원 · 관절 축 ── */
  const ikViz = new THREE.Group();
  ikViz.visible = false;
  root.add(ikViz);
  const lineM = E(new THREE.LineBasicMaterial({ color: 0xff3d8b, depthTest: false, transparent: true }));
  const lineM2 = E(new THREE.LineBasicMaterial({ color: 0x2ad0ff, depthTest: false, transparent: true }));
  const circleGeo = (r: number): THREE.BufferGeometry => new THREE.BufferGeometry().setFromPoints(Array.from({ length: 97 }, (_, i) => new THREE.Vector3(Math.cos((i / 96) * TAU) * r, Math.sin((i / 96) * TAU) * r, 0)));
  const plane = new THREE.Group(); // 팔이 움직이는 수직 평면 (허리와 같이 돈다)
  root.add(plane);
  plane.visible = false;
  const c1 = new THREE.Line(circleGeo(L1), lineM2);
  c1.position.set(A0, H0, 0);
  const c2 = new THREE.Line(circleGeo(L2), lineM);
  plane.add(c1, c2);
  const crossG = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.12, 0, 0), new THREE.Vector3(0.12, 0, 0), new THREE.Vector3(0, -0.12, 0), new THREE.Vector3(0, 0.12, 0), new THREE.Vector3(0, 0, -0.12), new THREE.Vector3(0, 0, 0.12)]);
  const cross = new THREE.LineSegments(crossG, lineM);
  const wristDot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), E(new THREE.MeshBasicMaterial({ color: 0xff3d8b, depthTest: false, transparent: true })));
  ikViz.add(cross, wristDot);
  cross.renderOrder = c1.renderOrder = c2.renderOrder = wristDot.renderOrder = 10;
  const axisM = E(new THREE.MeshBasicMaterial({ color: 0xff5ab0, depthTest: false, transparent: true, opacity: 0.85 }));
  const axisG = new THREE.CylinderGeometry(0.008, 0.008, 1, 8);
  const axes: THREE.Mesh[] = [];
  const addAxis = (parent: THREE.Object3D, dir: 'x' | 'y' | 'z', len: number, x = 0, y = 0, z = 0): void => {
    const a = new THREE.Mesh(axisG, axisM);
    a.scale.y = len;
    if (dir === 'x') a.rotation.z = Math.PI / 2;
    if (dir === 'z') a.rotation.x = Math.PI / 2;
    a.position.set(x, y, z);
    a.renderOrder = 11;
    a.visible = false;
    parent.add(a);
    axes.push(a);
  };
  addAxis(j1, 'y', 1.3, 0, 0.6, 0);
  addAxis(j2, 'z', 0.9);
  addAxis(j3, 'z', 0.8);
  addAxis(j4, 'x', 0.75, 0.25, 0, 0);
  addAxis(j5, 'z', 0.5);
  addAxis(j6, 'x', 0.5, 0.15, 0, 0);

  shadows(root);
  conv.traverse((o) => ((o as THREE.Mesh).receiveShadow = true));
  ikViz.traverse((o) => ((o as THREE.Mesh).castShadow = false));
  plane.traverse((o) => ((o as THREE.Mesh).castShadow = false));
  for (const a of axes) a.castShadow = false;
  for (const c of cables) c.m.castShadow = true;

  /* ── IK ── */
  const q = { j1: 0, j2: 0, j3: 0, j4: 0, j5: 0, j6: 0 };
  const W = new THREE.Vector3();
  const tq = new THREE.Quaternion();
  const zAxis = new THREE.Vector3();
  const yawOf = (): number => {
    j6.updateWorldMatrix(true, false);
    zAxis.set(0, 0, 1).applyQuaternion(j6.getWorldQuaternion(tq));
    return Math.atan2(zAxis.x, zAxis.z);
  };
  /** 집게 가운데를 P 에 (손끝은 아래로, 손가락은 세상 Z 방향으로 닫히게) */
  const solve = (P: THREE.Vector3): void => {
    W.copy(P).setY(P.y + LT);
    q.j1 = Math.atan2(-W.z, W.x);
    const r = Math.hypot(W.x, W.z) - A0;
    const h = W.y - H0;
    const d = clamp(Math.hypot(r, h), 0.25, L1 + L2 - 1e-3);
    const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const th2 = Math.atan2(h, r) + a;
    const phi = Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
    const th3abs = th2 - (Math.PI - phi);
    q.j2 = th2;
    q.j3 = th3abs - th2;
    q.j4 = 0;
    q.j5 = -Math.PI / 2 - th3abs;
    j1.rotation.y = q.j1;
    j2.rotation.z = q.j2;
    j3.rotation.z = q.j3;
    j4.rotation.x = q.j4;
    j5.rotation.z = q.j5;
    // J6: 손가락 축이 세상 Z 와 나란하게 (집게는 앞뒤가 같으니 반 바퀴 안에서 가까운 쪽)
    j6.rotation.x = 0;
    const c0 = yawOf();
    j6.rotation.x = 0.5;
    const s = Math.sign(wrapPi(yawOf() - c0)) || 1;
    let want = wrapPi(0 - c0);
    if (want > Math.PI / 2) want -= Math.PI;
    if (want < -Math.PI / 2) want += Math.PI;
    q.j6 = s * want;
    j6.rotation.x = q.j6;
    // 보조 표시
    cross.position.copy(P);
    wristDot.position.copy(W);
    plane.rotation.y = q.j1;
    c2.position.set(Math.hypot(W.x, W.z), W.y, 0);
  };

  /* ── 동작 순서 ── */
  type Phase = 'wait' | 'down' | 'grip' | 'up' | 'move' | 'down2' | 'release' | 'up2' | 'return';
  const DUR: Record<Phase, number> = { wait: 0, down: 0.8, grip: 0.4, up: 0.6, move: 1.7, down2: 0.8, release: 0.35, up2: 0.5, return: 1.5 };
  const LABEL: Record<Phase, string> = { wait: '기다림 — 상자가 오면', down: '다가감', grip: '집기', up: '옮기기', move: '옮기기', down2: '옮기기', release: '놓기', up2: '돌아감', return: '돌아감' };
  const NEXT: Record<Phase, Phase> = { wait: 'down', down: 'grip', grip: 'up', up: 'move', move: 'down2', down2: 'release', release: 'up2', up2: 'return', return: 'wait' };
  let phase: Phase = 'wait';
  let pt = 0;
  const pickPt = new THREE.Vector3(X_STOP, BELT_TOP + BOX.y / 2, BELT_Z);
  const pickHover = pickPt.clone().setY(pickPt.y + HOVER);
  const from = pickHover.clone();
  const to = pickHover.clone();
  const P = pickHover.clone();
  let gripOpen = 1;
  let held: Box | null = null;
  let speed = 1;
  /** 팔레트 비우기 시계 (null = 비우는 중 아님, 음수 = 잠깐 기다림) */
  let clearT: number | null = null;
  const cylLerp = (a: THREE.Vector3, b: THREE.Vector3, k: number, lift: number, out: THREE.Vector3): void => {
    const aa = Math.atan2(a.z, a.x);
    const ab = Math.atan2(b.z, b.x);
    const ang = aa + wrapPi(ab - aa) * k;
    const ra = Math.hypot(a.x, a.z);
    const rb = Math.hypot(b.x, b.z);
    const rr = lerp(ra, rb, k) - Math.sin(Math.PI * k) * 0.12;
    out.set(Math.cos(ang) * rr, lerp(a.y, b.y, k) + Math.sin(Math.PI * k) * lift, Math.sin(ang) * rr);
  };
  const begin = (p: Phase): void => {
    phase = p;
    pt = 0;
    from.copy(P);
    const slot = slotPos(placedN);
    if (p === 'down') to.copy(pickPt);
    else if (p === 'up') to.copy(pickHover);
    else if (p === 'move') to.copy(slot).setY(slot.y + HOVER);
    else if (p === 'down2') to.copy(slot);
    else if (p === 'up2') to.copy(slot).setY(slot.y + HOVER);
    else if (p === 'return') to.copy(pickHover);
    else to.copy(P);
  };
  solve(P);

  const stepSim = (dt: number): void => {
    // 벨트: 앞 상자는 멈춤 막대에서, 뒤 상자는 앞 상자 뒤에서 선다 (벨트는 계속 돈다)
    bt.offset.x += (dt * 0.45) / 0.22;
    const onBelt = boxes.filter((b) => b.st === 'belt').sort((a, b) => a.x - b.x);
    let limit = X_STOP;
    for (const b of onBelt) {
      b.x = Math.max(limit, b.x - dt * 0.45);
      b.m.position.x = b.x;
      limit = b.x + BOX.x + 0.06;
    }
    const last = onBelt[onBelt.length - 1];
    if (onBelt.length < 3 && (!last || last.x < X1 - 0.75)) spawn(X1 - 0.18);
    // 팔레트가 차면 비우기 (가라앉으며 사라짐)
    if (clearT !== null) {
      clearT += dt;
      const k = clamp(clearT / 0.8, 0, 1);
      for (const b of boxes)
        if (b.st === 'clear') {
          b.m.scale.setScalar(1 - k * k);
          b.m.position.y = b.k - k * 0.15;
          if (k >= 1) {
            b.st = 'off';
            b.m.visible = false;
          }
        }
      if (clearT > 0.85) clearT = null;
    }
    // 팔
    if (phase === 'wait') {
      const front = onBelt[0];
      if (front && front.x <= X_STOP + 1e-3 && clearT === null) begin('down');
    } else {
      pt += dt;
      const k = Math.min(1, pt / DUR[phase]);
      const e = easeIO(k);
      if (phase === 'move' || phase === 'return') cylLerp(from, to, e, 0.18, P);
      else if (phase !== 'grip' && phase !== 'release') P.lerpVectors(from, to, e);
      if (phase === 'grip') gripOpen = 1 - e;
      if (phase === 'release') gripOpen = e;
      if (k >= 1) {
        if (phase === 'grip') {
          const front = onBelt[0];
          if (front) {
            held = front;
            front.st = 'held';
            gripPt.attach(front.m);
          }
        }
        if (phase === 'release' && held) {
          root.attach(held.m);
          const s = slotPos(placedN);
          held.m.position.copy(s);
          held.m.rotation.set(0, 0, 0);
          held.st = 'placed';
          held.k = s.y;
          held = null;
          placedN++;
          if (placedN >= 8) {
            placedN = 0;
            clearT = -0.6;
            for (const b of boxes) if (b.st === 'placed') b.st = 'clear';
          }
        }
        begin(NEXT[phase]);
      }
    }
    solve(P);
    const gap = lerp(BOX.z + 0.012, BOX.z + 0.15, gripOpen);
    for (const f of fingers) f.position.z = (f.userData['s'] as number) * (gap / 2);
    // 가스 스프링
    j1.updateWorldMatrix(true, true);
    const B = springB.getWorldPosition(new THREE.Vector3());
    j1.worldToLocal(B);
    const dir = B.clone().sub(springA).normalize();
    between(rod, springA, B);
    between(barrel, springA.clone().addScaledVector(dir, 0.04), springA.clone().addScaledVector(dir, 0.4));
    between(barrelCap, springA.clone().addScaledVector(dir, 0.37), springA.clone().addScaledVector(dir, 0.41));
    eyeB.position.copy(B);
    updCables();
  };

  const drag = new Drag();
  const orbit = new Orbit(new THREE.Vector3(0.25, 0.65, 0.45), 0.72, 0.36, 5.4);
  const overlay = new Overlay();
  return {
    scene,
    camera: cam,
    update(_t, dt) {
      const d = Math.min(dt, 0.05) * speed;
      // 큰 걸음은 잘게 나눠 (느린 기기에서도 상자가 손가락을 지나치지 않게)
      const n = Math.max(1, Math.ceil(d / 0.02));
      for (let i = 0; i < n; i++) stepSim(d / n);
      orbit.update(cam, drag, Math.min(dt, 0.05));
    },
    render(r, w, h) {
      drag.attach(w, h);
      if (!st.prepare(r, cam)) return;
      r.render(scene, cam);
      const big = w >= 700;
      const tags: Tag[] = [{ text: `지금: ${LABEL[phase]}`, x: 0.03, y: 0.05, ax: 0, ay: 0, bg: phase === 'grip' || phase === 'release' ? 'rgba(200,120,20,0.85)' : 'rgba(24,30,42,0.7)' }];
      const names = ['J1 허리', 'J2 어깨', 'J3 팔꿈치', 'J4 손목 비틀기', 'J5 손목 꺾기', 'J6 손끝'];
      const vals = [q.j1, q.j2, q.j3, q.j4, q.j5, q.j6];
      if (big) {
        names.forEach((nm, i) => tags.push({ text: `${nm}  ${deg(vals[i]!)}`, x: 0.97, y: 0.05 + i * 0.075, ax: 1, ay: 0 }));
        tags.push({ text: `팔레트 ${placedN} / 8 · 끌기 = 돌려 보기 · 휠 = 가까이`, x: 0.5, y: 0.96, ax: 0.5, ay: 1 });
      } else tags.push({ text: '해석적 IK — 목표점 하나로 관절 6개', x: 0.5, y: 0.95, ax: 0.5, ay: 1 });
      overlay.draw(r, w, h, tags);
    },
    controls: [
      { type: 'range', label: '속도', min: 0.25, max: 2.5, step: 0.05, value: 1, on: (v) => (speed = v) },
      {
        type: 'toggle',
        label: 'IK 목표점 보기 (목표 십자 · 손목 중심 · 팔 길이 원 — 두 원이 만나는 곳이 팔꿈치)',
        value: false,
        on: (v) => {
          ikViz.visible = v;
          plane.visible = v;
        },
      },
      { type: 'toggle', label: '관절 축 보기', value: false, on: (v) => axes.forEach((a) => (a.visible = v)) },
    ],
    dispose() {
      drag.dispose();
      overlay.dispose();
      freeTree(scene);
      M.dispose();
      for (const m of extraMats) m.dispose();
      for (const t of texs) t.dispose();
      st.dispose();
    },
  };
}

export const DEMOS: DemoMap = {
  i542: {
    kind: '3d',
    caption: '6축 로봇 팔 — 컨베이어로 온 상자를 해석적 IK(허리 각 + 2링크 평면 삼각형)로 집어 팔레트에 쌓는다. 몸은 회전체 + 모서리 깎은 돌출, 가스 스프링 · 케이블은 관절을 따라 매 장면 다시 계산',
    make: () => makeArm(),
  },
};

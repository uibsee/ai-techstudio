import * as THREE from 'three';
import type { DemoMap, Scene3D } from './types';
import { bevelExtrude, between, circlePath, Drag, freeTree, lathe, makeStage, mechMats, Orbit, Overlay, shadows, TAU, type Tag } from './lib/mech';

/**
 * i541 직렬 4기통 엔진 단면 (2026-10-08)
 *  - 크랭크 각 θ 하나로 모든 부품 위치를 식으로: 핀 (r cosθ, r sinθ), 피스톤 핀 높이 = r cosθ + √(l² − r² sin²θ),
 *    커넥팅 로드는 두 핀을 잇는 각도, 캠축은 θ/2 로 돌고 밸브 들림 = 캠 윤곽 − 기초원
 *  - 크랭크 핀 위상 1 · 4 번 0°, 2 · 3 번 180°, 점화 순서 1-3-4-2 (720° 한 바퀴 = 흡입 · 압축 · 폭발 · 배기)
 *  - 블록은 앞쪽 절반을 잘라낸 단면 (잘린 면은 빗금), 헤드 판은 밸브 · 점화 플러그를 받친다. 「단면」을 끄면 앞 절반을 거울로 덮는다
 */

const R = 0.3; // 크랭크 반지름 (행정 0.6)
const L = 0.95; // 커넥팅 로드 길이
const XC = [-1.35, -0.45, 0.45, 1.35];
const XJ = [-1.8, -0.9, 0, 0.9, 1.8];
const PIN_PH = [0, Math.PI, Math.PI, 0];
const FIRE = [0, 540, 180, 360].map((d) => (d * Math.PI) / 180); // 1-3-4-2 : 1번 0°, 3번 180°, 4번 360°, 2번 540°
const DECK = 1.55;
const CAM_Y = 2.12;
const CAM_Z = 0.2;
const RB = 0.07; // 캠 기초원
const CAM_H = 0.045; // 최대 들림
const CAM_W = 1.22; // 캠 코 반폭 (rad, 70°)
const LIFT_Y0 = 0.65; // 바닥 위로 올리기

const wrap = (a: number): number => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};
const camProf = (d: number): number => {
  const k = Math.abs(d) / CAM_W;
  return k >= 1 ? RB : RB + CAM_H * Math.cos(k * Math.PI * 0.5) ** 2;
};
const pistonY = (a: number): number => R * Math.cos(a) + Math.sqrt(L * L - R * R * Math.sin(a) ** 2);
const STROKE = ['폭발', '배기', '흡입', '압축'] as const;
const STROKE_BG: Record<string, string> = { 폭발: 'rgba(222,96,30,0.88)', 배기: 'rgba(90,96,110,0.82)', 흡입: 'rgba(40,120,210,0.85)', 압축: 'rgba(120,70,190,0.85)' };

/** 거울(Z) — 감김 순서를 뒤집어 앞면이 바깥을 보게 */
function mirrorZ(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = src.clone();
  g.scale(1, 1, -1);
  if (g.index) {
    const ix = g.index.array as Uint16Array | Uint32Array;
    for (let i = 0; i < ix.length; i += 3) {
      const t = ix[i + 1]!;
      ix[i + 1] = ix[i + 2]!;
      ix[i + 2] = t;
    }
    g.index.needsUpdate = true;
  } else {
    for (const name of Object.keys(g.attributes)) {
      const a = g.attributes[name] as THREE.BufferAttribute;
      const n = a.itemSize;
      const arr = a.array as Float32Array;
      for (let f = 0; f < a.count; f += 3)
        for (let k = 0; k < n; k++) {
          const i1 = (f + 1) * n + k;
          const i2 = (f + 2) * n + k;
          const t = arr[i1]!;
          arr[i1] = arr[i2]!;
          arr[i2] = t;
        }
    }
  }
  return g;
}
/** 다각형 윤곽 */
function poly(pts: [number, number][]): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i]![0], pts[i]![1]);
  s.closePath();
  return s;
}
/** XY 윤곽을 z 0 → −depth 로 돌출 (잘린 면 = z 0) */
function slab(shape: THREE.Shape, depth: number, bevel = 0.012): THREE.BufferGeometry {
  return bevelExtrude(shape, depth, bevel, 12, 2).translate(0, 0, -depth / 2);
}
/** 톱니 윤곽 (스프로킷 · 링 기어) */
function toothed(rOut: number, n: number, depth: number, holes: THREE.Path[]): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU;
    const st = TAU / n;
    const pts: [number, number][] = [
      [rOut - depth, a0],
      [rOut - depth, a0 + st * 0.18],
      [rOut, a0 + st * 0.32],
      [rOut, a0 + st * 0.68],
      [rOut - depth, a0 + st * 0.82],
    ];
    for (const [r, a] of pts) {
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0 && r === rOut - depth && a === a0) s.moveTo(x, y);
      else s.lineTo(x, y);
    }
  }
  s.closePath();
  s.holes.push(...holes);
  return s;
}
/** 볼록 껍질 (단조 사슬) */
function hull(pts: THREE.Vector2[]): THREE.Vector2[] {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo: THREE.Vector2[] = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2]!, lo[lo.length - 1]!, q) <= 0) lo.pop();
    lo.push(q);
  }
  const up: THREE.Vector2[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]!;
    while (up.length >= 2 && cross(up[up.length - 2]!, up[up.length - 1]!, q) <= 0) up.pop();
    up.push(q);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

function makeEngine(): Scene3D {
  const st = makeStage({ size: 3.3, bg: ['#e3e8ee', '#b6bfca'] });
  const { scene, cam } = st;
  const M = mechMats();
  const own: THREE.Material[] = [];
  const P = (o: THREE.MeshPhysicalMaterialParameters): THREE.MeshPhysicalMaterial => {
    const m = new THREE.MeshPhysicalMaterial(o);
    own.push(m);
    return m;
  };
  // 주조 알루미늄 블록 · 잘린 면(빗금)
  const cast = P({ color: 0x9aa3ad, metalness: 0.7, roughness: 0.55 });
  const hatch = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = '#d4553a';
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(120,30,20,0.55)';
    g.lineWidth = 5;
    for (let i = -64; i < 128; i += 16) {
      g.beginPath();
      g.moveTo(i, 64);
      g.lineTo(i + 64, 0);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(5, 5);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const cut = P({ color: 0xffffff, map: hatch, metalness: 0.1, roughness: 0.7 });
  const liner = P({ color: 0xc4c9cf, metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide });
  const ceramic = P({ color: 0xf4f1ea, metalness: 0, roughness: 0.25, clearcoat: 0.8 });
  const pistonM = P({ color: 0xc9ced4, metalness: 0.85, roughness: 0.35, side: THREE.DoubleSide });

  const eng = new THREE.Group();
  eng.position.y = LIFT_Y0;
  scene.add(eng);

  /* ── 블록 · 헤드 (뒤 절반 + 거울 앞 절반) ── */
  const blockBack = new THREE.Group();
  const blockFront = new THREE.Group();
  blockFront.visible = false;
  eng.add(blockBack, blockFront);
  const both = (g: THREE.BufferGeometry, mats: THREE.Material | THREE.Material[], mirror = true): void => {
    blockBack.add(new THREE.Mesh(g, mats));
    if (mirror) blockFront.add(new THREE.Mesh(mirrorZ(g), cast));
  };
  const D = 0.55;
  // 기둥 (실린더 사이 · 메인 베어링 벽) — 위는 실린더 벽, 아래는 얇은 격벽
  for (const xj of XJ) {
    const end = Math.abs(xj) > 1.5;
    const s = Math.sign(xj);
    const pts: [number, number][] = end
      ? [
          [s * 1.66, DECK],
          [s * 2.0, DECK],
          [s * 2.0, 0.17],
          [s * 1.73, 0.17],
          [s * 1.73, 0.6],
          [s * 1.66, 0.68],
        ]
      : [
          [xj - 0.14, DECK],
          [xj + 0.14, DECK],
          [xj + 0.14, 0.68],
          [xj + 0.07, 0.6],
          [xj + 0.07, 0.17],
          [xj - 0.07, 0.17],
          [xj - 0.07, 0.6],
          [xj - 0.14, 0.68],
        ];
    if (end && s < 0) pts.reverse();
    both(slab(poly(pts), D), [cut, cast]);
  }
  // 실린더 벽 (뒤 반원통) · 뒤 판
  const linerG = new THREE.CylinderGeometry(0.31, 0.31, DECK - 0.62, 40, 1, true, Math.PI / 2, Math.PI);
  for (const xc of XC) {
    const m = new THREE.Mesh(linerG, liner);
    m.position.set(xc, (DECK + 0.62) / 2, 0);
    blockBack.add(m);
    const f = new THREE.Mesh(linerG, cast);
    f.position.copy(m.position);
    f.rotation.y = Math.PI;
    blockFront.add(f);
  }
  both(new THREE.BoxGeometry(4, DECK - 0.62, D - 0.31).translate(0, (DECK + 0.62) / 2, -0.31 - (D - 0.31) / 2), cast);
  both(new THREE.BoxGeometry(4, 1.24, 0.05).translate(0, 0, -D + 0.025), cast);
  // 기름통 (U 단면)
  both(
    slab(
      poly([
        [-2.0, 0.17],
        [-2.0, -0.52],
        [-1.9, -0.62],
        [1.9, -0.62],
        [2.0, -0.52],
        [2.0, 0.17],
        [1.95, 0.17],
        [1.95, -0.53],
        [1.88, -0.57],
        [-1.88, -0.57],
        [-1.95, -0.53],
        [-1.95, 0.17],
      ]),
      D,
    ),
    [cut, M.dark],
  );
  // 메인 베어링 하우징 (저널 둘레 고리)
  {
    const ring = new THREE.LatheGeometry(
      [
        [0.12, -0.07],
        [0.17, -0.07],
        [0.175, -0.06],
        [0.175, 0.06],
        [0.17, 0.07],
        [0.12, 0.07],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      40,
    ).rotateZ(Math.PI / 2);
    for (const xj of XJ) {
      const m = new THREE.Mesh(ring, cast);
      m.position.x = xj;
      blockBack.add(m);
    }
  }
  // 헤드 판 (밸브 · 플러그 구멍) — 앞쪽도 z 0.32 까지 남겨 밸브를 받친다
  {
    const s = poly([
      [-2.0, -0.55],
      [2.0, -0.55],
      [2.0, 0.32],
      [-2.0, 0.32],
    ]);
    for (const xc of XC) {
      s.holes.push(circlePath(0.095, xc, -CAM_Z, 40, true), circlePath(0.095, xc, CAM_Z, 40, true), circlePath(0.045, xc, 0, 24, true));
    }
    const g = bevelExtrude(s, 0.07, 0.01, 24, 2).rotateX(Math.PI / 2).translate(0, DECK + 0.035, 0);
    const m = new THREE.Mesh(g, [cast, cut]);
    eng.add(m);
    // 헤드 뒤 덩어리 · 캠 받침 탑
    both(new THREE.BoxGeometry(4, 0.7, 0.21).translate(0, DECK + 0.07 + 0.35, -D + 0.105), cast);
    const tower = new THREE.BoxGeometry(0.08, CAM_Y - DECK - 0.07, 0.15).translate(0, (CAM_Y + DECK + 0.07) / 2, 0);
    const cap = new THREE.CylinderGeometry(0.075, 0.075, 0.08, 24, 1, false, 0, Math.PI).rotateZ(Math.PI / 2);
    for (const xj of XJ)
      for (const z of [-CAM_Z, CAM_Z]) {
        const t = new THREE.Mesh(tower, cast);
        t.position.set(xj, 0, z);
        const c = new THREE.Mesh(cap, cast);
        c.position.set(xj, CAM_Y, z);
        eng.add(t, c);
      }
  }

  /* ── 크랭크축 ── */
  const crank = new THREE.Group();
  eng.add(crank);
  {
    const web = (() => {
      const s = new THREE.Shape();
      const a = 0.45;
      const Rc = 0.36;
      s.moveTo(0.13, R);
      s.absarc(0, R, 0.13, 0, Math.PI, false);
      s.lineTo(-0.17, 0);
      s.lineTo(Math.cos(Math.PI + a) * Rc, Math.sin(Math.PI + a) * Rc);
      s.absarc(0, 0, Rc, Math.PI + a, TAU - a, false);
      s.lineTo(0.17, 0);
      s.lineTo(0.13, R);
      return bevelExtrude(s, 0.06, 0.012, 32, 2).rotateY(Math.PI / 2);
    })();
    const pinG = new THREE.CylinderGeometry(0.08, 0.08, 0.15, 32).rotateZ(Math.PI / 2);
    const jour = (x0: number, x1: number): void => {
      const g = new THREE.CylinderGeometry(0.115, 0.115, x1 - x0, 32).rotateZ(Math.PI / 2);
      const m = new THREE.Mesh(g, M.steel);
      m.position.x = (x0 + x1) / 2;
      crank.add(m);
    };
    XC.forEach((xc, i) => {
      const throwG = new THREE.Group();
      throwG.rotation.x = PIN_PH[i]!;
      for (const s of [-1, 1]) {
        const w = new THREE.Mesh(web, M.steel);
        w.position.x = xc + s * 0.075;
        throwG.add(w);
      }
      const p = new THREE.Mesh(pinG, M.steel);
      p.position.set(xc, R, 0);
      throwG.add(p);
      crank.add(throwG);
      if (i < 3) jour(xc + 0.105, XC[i + 1]! - 0.105);
    });
    jour(-2.32, XC[0]! - 0.105);
    jour(XC[3]! + 0.105, 2.32);
  }
  // 플라이휠 (링 기어 · 덜어낸 구멍 · 볼트)
  {
    const holes = [circlePath(0.115, 0, 0, 32, true)];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      holes.push(circlePath(0.075, Math.cos(a) * 0.31, Math.sin(a) * 0.31, 24, true));
      holes.push(circlePath(0.016, Math.cos(a + 0.52) * 0.17, Math.sin(a + 0.52) * 0.17, 12, true));
    }
    const g = bevelExtrude(toothed(0.52, 90, 0.025, holes), 0.08, 0.01, 4, 2).rotateY(Math.PI / 2);
    const fw = new THREE.Mesh(g, M.iron);
    fw.position.x = -2.24;
    crank.add(fw);
  }
  // 크랭크 풀리 (톱니 24)
  const PR = 0.09;
  {
    const g = bevelExtrude(toothed(PR, 24, 0.012, [circlePath(0.03, 0, 0, 16, true)]), 0.09, 0.006, 3, 1).rotateY(Math.PI / 2);
    const m = new THREE.Mesh(g, M.steel);
    m.position.x = 2.27;
    crank.add(m);
  }

  /* ── 피스톤 · 커넥팅 로드 · 밸브 · 플러그 (실린더마다) ── */
  const pistonG = lathe(
    [
      [0, 0.04],
      [0.255, 0.04],
      [0.262, -0.19],
      [0.275, -0.2],
      [0.295, -0.19],
      [0.295, 0.085],
      [0.276, 0.09],
      [0.276, 0.105],
      [0.295, 0.11],
      [0.295, 0.125],
      [0.276, 0.13],
      [0.276, 0.145],
      [0.295, 0.15],
      [0.295, 0.165],
      [0.276, 0.17],
      [0.276, 0.185],
      [0.295, 0.19],
      [0.297, 0.212],
      [0.287, 0.224],
      [0.16, 0.234],
      [0, 0.24],
    ],
    56,
  );
  const ppinG = new THREE.CylinderGeometry(0.045, 0.045, 0.56, 20).rotateZ(Math.PI / 2);
  // 커넥팅 로드: 대단(지름 큰 고리) · 소단 · 가운데 얇은 판 + 양쪽 테 (I 단면)
  const rodG = (() => {
    const R1 = 0.15;
    const R2 = 0.08;
    const w1 = 0.07;
    const w2 = 0.04;
    const ta = Math.acos(w1 / R1);
    const tb = Math.acos(w2 / R2);
    const yj1 = Math.sqrt(R1 * R1 - w1 * w1);
    const sb = Math.sqrt(R2 * R2 - w2 * w2);
    const s = new THREE.Shape();
    s.moveTo(w1, yj1);
    s.lineTo(w2, L - sb);
    s.absarc(0, L, R2, -tb, Math.PI + tb, false);
    s.lineTo(-w1, yj1);
    s.absarc(0, 0, R1, Math.PI - ta, TAU + ta, false);
    s.holes.push(circlePath(0.082, 0, 0, 32, true), circlePath(0.047, 0, L, 24, true));
    return { web: bevelExtrude(s, 0.045, 0.008, 32, 2).rotateY(Math.PI / 2), edge: [new THREE.Vector2(w1, yj1), new THREE.Vector2(w2, L - sb)] };
  })();
  const railG = new THREE.BoxGeometry(0.075, 1, 0.026);
  const boltG = new THREE.CylinderGeometry(0.022, 0.022, 0.04, 6);
  const valveG = lathe(
    [
      [0, -0.012],
      [0.088, -0.012],
      [0.092, -0.004],
      [0.06, 0.01],
      [0.025, 0.04],
      [0.017, 0.07],
      [0.017, 0.43],
      [0, 0.43],
    ],
    32,
  );
  const tappetG = lathe(
    [
      [0, 0],
      [0.055, 0],
      [0.055, 0.06],
      [0, 0.06],
    ],
    32,
  );
  const SPR0 = DECK + 0.07 + 0.04;
  const SPR1 = CAM_Y - RB - 0.06 - 0.012;
  const springG = (() => {
    const turns = 7;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= turns * 24; i++) {
      const a = (i / 24) * TAU;
      pts.push(new THREE.Vector3(Math.cos(a) * 0.045, i / (turns * 24), Math.sin(a) * 0.045));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 24, 0.008, 6, false);
  })();
  const guideG = new THREE.CylinderGeometry(0.03, 0.03, 0.06, 16).translate(0, DECK + 0.07 + 0.03, 0);
  const plugParts = [
    { g: new THREE.CylinderGeometry(0.035, 0.035, 0.16, 16).translate(0, DECK + 0.02 + 0.08, 0), m: M.steel },
    { g: new THREE.CylinderGeometry(0.055, 0.055, 0.07, 6).translate(0, DECK + 0.18 + 0.035, 0), m: M.chrome },
    { g: lathe([[0, 0], [0.042, 0], [0.042, 0.06], [0.032, 0.1], [0.032, 0.3], [0.02, 0.36], [0, 0.36]], 24).translate(0, DECK + 0.25, 0), m: ceramic },
    { g: new THREE.CylinderGeometry(0.014, 0.018, 0.06, 12).translate(0, DECK + 0.64, 0), m: M.steel },
  ];
  const glowG = new THREE.CylinderGeometry(0.29, 0.29, 1, 40);
  interface Cyl {
    piston: THREE.Group;
    rod: THREE.Group;
    valves: { m: THREE.Mesh; tap: THREE.Mesh; spr: THREE.Mesh; z: number }[];
    glow: THREE.Mesh;
    glowM: THREE.MeshBasicMaterial;
    spark: THREE.Mesh;
    parts: THREE.Object3D[];
  }
  const cyls: Cyl[] = [];
  const sparkM = new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  own.push(sparkM);
  XC.forEach((xc) => {
    const piston = new THREE.Group();
    piston.add(new THREE.Mesh(pistonG, pistonM));
    piston.add(new THREE.Mesh(ppinG, M.chrome));
    piston.position.x = xc;
    const rod = new THREE.Group();
    rod.add(new THREE.Mesh(rodG.web, M.steel));
    const [a, b] = rodG.edge as [THREE.Vector2, THREE.Vector2];
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(railG, M.steel);
      between(rail, new THREE.Vector3(0, a.y, -s * (a.x - 0.012)), new THREE.Vector3(0, b.y, -s * (b.x - 0.012)));
      rail.scale.x = 1;
      rod.add(rail);
      const bolt = new THREE.Mesh(boltG, M.chrome);
      bolt.position.set(0, -0.125, s * 0.075);
      rod.add(bolt);
    }
    rod.position.x = xc;
    const valves: Cyl['valves'] = [];
    for (const z of [-CAM_Z, CAM_Z]) {
      const v = new THREE.Mesh(valveG, M.steel);
      const tap = new THREE.Mesh(tappetG, M.chrome);
      const spr = new THREE.Mesh(springG, M.copper);
      const gd = new THREE.Mesh(guideG, cast);
      v.position.set(xc, 0, z);
      tap.position.set(xc, 0, z);
      spr.position.set(xc, SPR0, z);
      gd.position.set(xc, 0, z);
      eng.add(v, tap, spr, gd);
      valves.push({ m: v, tap, spr, z });
    }
    const plug = new THREE.Group();
    for (const p of plugParts) plug.add(new THREE.Mesh(p.g, p.m));
    plug.position.x = xc;
    const glowM = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    own.push(glowM);
    const glow = new THREE.Mesh(glowG, glowM);
    glow.position.x = xc;
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), sparkM);
    spark.position.set(xc, DECK - 0.01, 0);
    eng.add(piston, rod, plug, glow, spark);
    cyls.push({ piston, rod, valves, glow, glowM, spark, parts: [piston, rod, plug, glow, spark, ...valves.flatMap((x) => [x.m, x.tap, x.spr])] });
  });

  /* ── 캠축 두 개 (흡기 뒤 · 배기 앞) ── */
  const lobeG = (() => {
    const s = new THREE.Shape();
    const N = 96;
    for (let i = 0; i <= N; i++) {
      const f = (i / N) * TAU;
      const r = camProf(wrap(f));
      const x = -r * Math.sin(f);
      const y = r * Math.cos(f);
      if (i === 0) s.moveTo(x, y);
      else s.lineTo(x, y);
    }
    return bevelExtrude(s, 0.08, 0.008, 8, 2).rotateY(Math.PI / 2);
  })();
  const camShaftG = new THREE.CylinderGeometry(0.035, 0.035, 4.7, 20).rotateZ(Math.PI / 2);
  const cams: { g: THREE.Group; intake: boolean }[] = [];
  const CAM_SPR_R = PR * 2;
  for (const intake of [true, false]) {
    const g = new THREE.Group();
    g.position.set(0, CAM_Y, intake ? -CAM_Z : CAM_Z);
    const sh = new THREE.Mesh(camShaftG, M.steel);
    sh.position.x = 0.1;
    g.add(sh);
    XC.forEach((xc, i) => {
      const lobe = new THREE.Mesh(lobeG, M.steel);
      lobe.position.x = xc;
      // 들림이 가장 클 때 = 흡입은 720° 중 450°, 배기는 270° (그때 코가 아래 −Y)
      lobe.rotation.x = Math.PI - (FIRE[i]! + ((intake ? 450 : 270) * Math.PI) / 180) / 2;
      g.add(lobe);
    });
    // 캠 스프로킷 (톱니 48, 크랭크의 두 배 → 반 속도)
    const holes = [circlePath(0.03, 0, 0, 16, true)];
    for (let k = 0; k < 4; k++) holes.push(circlePath(0.045, Math.cos((k / 4) * TAU) * 0.1, Math.sin((k / 4) * TAU) * 0.1, 20, true));
    const spr = new THREE.Mesh(bevelExtrude(toothed(CAM_SPR_R, 48, 0.012, holes), 0.09, 0.006, 3, 1).rotateY(Math.PI / 2), intake ? M.brass : M.copper);
    spr.position.x = 2.27;
    g.add(spr);
    eng.add(g);
    cams.push({ g, intake });
  }

  /* ── 타이밍 벨트 (세 풀리를 감싸는 볼록 껍질) + 움직이는 이 ── */
  const beltX = 2.27;
  const path = (() => {
    const pts: THREE.Vector2[] = [];
    const add = (cz: number, cy: number, r: number): void => {
      for (let i = 0; i < 90; i++) pts.push(new THREE.Vector2(cz + Math.cos((i / 90) * TAU) * r, cy + Math.sin((i / 90) * TAU) * r));
    };
    add(0, 0, PR + 0.004);
    add(-CAM_Z, CAM_Y, CAM_SPR_R + 0.004);
    add(CAM_Z, CAM_Y, CAM_SPR_R + 0.004);
    return hull(pts);
  })();
  const plen: number[] = [0];
  for (let i = 1; i <= path.length; i++) plen.push(plen[i - 1]! + path[i % path.length]!.distanceTo(path[i - 1]!));
  const PER = plen[path.length]!;
  {
    const T = 0.022;
    const W = 0.08;
    const n = path.length;
    const pos: number[] = [];
    const nor: number[] = [];
    const idx: number[] = [];
    const nrm = (i: number): THREE.Vector2 => {
      const a = path[(i - 1 + n) % n]!;
      const b = path[(i + 1) % n]!;
      const t = b.clone().sub(a).normalize();
      // 볼록 껍질을 반시계로 돌면 바깥 = (t.y, −t.x)
      return new THREE.Vector2(t.y, -t.x);
    };
    for (let i = 0; i < n; i++) {
      const p = path[i]!;
      const o = nrm(i);
      const q = p.clone().addScaledVector(o, T);
      // 네 모서리: 안쪽 왼 · 안쪽 오른 · 바깥 오른 · 바깥 왼  (z = p.x, y = p.y)
      pos.push(beltX - W / 2, p.y, p.x, beltX + W / 2, p.y, p.x, beltX + W / 2, q.y, q.x, beltX - W / 2, q.y, q.x);
      nor.push(0, -o.y, -o.x, 0, -o.y, -o.x, 0, o.y, o.x, 0, o.y, o.x);
    }
    for (let i = 0; i < n; i++) {
      const a = i * 4;
      const b = ((i + 1) % n) * 4;
      // 바깥면 · 안쪽면 · 옆 두 면
      idx.push(a + 3, a + 2, b + 2, a + 3, b + 2, b + 3);
      idx.push(a + 0, b + 0, b + 1, a + 0, b + 1, a + 1);
      idx.push(a + 1, b + 1, b + 2, a + 1, b + 2, a + 2);
      idx.push(a + 0, a + 3, b + 3, a + 0, b + 3, b + 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    const belt = new THREE.Mesh(g, M.rubber);
    belt.material.side = THREE.DoubleSide;
    eng.add(belt);
  }
  const NT = Math.floor(PER / 0.05);
  const teeth = new THREE.InstancedMesh(new THREE.BoxGeometry(0.084, 0.012, 0.018), M.dark, NT);
  teeth.frustumCulled = false;
  eng.add(teeth);
  const at = (s: number, out: THREE.Vector2, tan: THREE.Vector2): void => {
    s = ((s % PER) + PER) % PER;
    let lo = 0;
    let hi = path.length;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (plen[mid]! <= s) lo = mid;
      else hi = mid;
    }
    const a = path[lo]!;
    const b = path[(lo + 1) % path.length]!;
    const k = (s - plen[lo]!) / Math.max(1e-6, plen[lo + 1]! - plen[lo]!);
    out.copy(a).lerp(b, k);
    tan.copy(b).sub(a).normalize();
  };

  shadows(eng);
  for (const c of cyls) (c.glow.castShadow = false), (c.spark.castShadow = false);

  /* ── 움직이기 ── */
  let rpm = 30;
  let theta = 0;
  let solo = false;
  let cutOn = true;
  const drag = new Drag();
  const orbit = new Orbit(new THREE.Vector3(0, 1.45, 0), 0.5, 0.2, 7.4);
  const overlay = new Overlay();
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v2 = new THREE.Vector2();
  const t2 = new THREE.Vector2();
  const X = new THREE.Vector3(1, 0, 0);
  const scl = new THREE.Vector3(1, 1, 1);
  const tmp = new THREE.Vector3();
  const strokes: string[] = ['', '', '', ''];
  const pose = (): void => {
    crank.rotation.x = theta;
    XC.forEach((_, i) => {
      const c = cyls[i]!;
      const a = theta + PIN_PH[i]!;
      const yp = pistonY(a);
      c.piston.position.y = yp;
      // 로드: 크랭크 핀 → 피스톤 핀
      const py = R * Math.cos(a);
      const pz = R * Math.sin(a);
      c.rod.position.set(c.rod.position.x, py, pz);
      c.rod.rotation.x = Math.atan2(-pz, yp - py);
      // 행정: 720° 중 어디
      const psi = ((((theta - FIRE[i]!) % (4 * Math.PI)) + 4 * Math.PI) % (4 * Math.PI)) / Math.PI; // 0 ~ 4 (×180°)
      const k = Math.floor(psi);
      strokes[i] = STROKE[k]!;
      const f = psi - k;
      // 실린더 속 기체 빛: 폭발 = 번쩍 후 사그라듦, 흡입 = 푸른 기운
      const crown = yp + 0.24;
      c.glow.position.y = (crown + DECK) / 2;
      c.glow.scale.y = Math.max(0.01, DECK - crown);
      if (k === 0) {
        c.glowM.color.setHex(0xff7a1a);
        c.glowM.opacity = 0.9 * Math.exp(-f * 4) + 0.18 * (1 - f);
      } else if (k === 2) {
        c.glowM.color.setHex(0x3aa0ff);
        c.glowM.opacity = 0.28 * Math.sin(f * Math.PI);
      } else if (k === 3) {
        c.glowM.color.setHex(0x9a6aff);
        c.glowM.opacity = 0.1 * f;
      } else c.glowM.opacity = 0.05 * (1 - f);
      // 불꽃: 압축 끝 ~ 폭발 처음
      const sp = k === 3 && f > 0.92 ? (f - 0.92) / 0.08 : k === 0 && f < 0.06 ? 1 - f / 0.06 : 0;
      c.spark.visible = sp > 0.01;
      c.spark.scale.setScalar(0.4 + sp * 1.2);
      sparkM.opacity = 1;
      // 밸브: 캠 윤곽 − 기초원
      for (const v of c.valves) {
        const intake = v.z < 0;
        const beta = theta / 2 + (Math.PI - (FIRE[i]! + ((intake ? 450 : 270) * Math.PI) / 180) / 2);
        const lift = camProf(wrap(beta - Math.PI)) - RB;
        v.m.position.y = DECK - lift;
        v.tap.position.y = CAM_Y - RB - 0.06 - lift;
        v.spr.scale.y = SPR1 - lift - SPR0;
      }
    });
    for (const c of cams) c.g.rotation.x = theta / 2;
    // 벨트 이
    const s0 = theta * (PR + 0.004);
    for (let k = 0; k < NT; k++) {
      at(s0 + (k / NT) * PER, v2, t2);
      const ang = Math.atan2(t2.y, t2.x);
      q.setFromAxisAngle(X, -ang);
      // 벨트 바깥면 위
      const o = new THREE.Vector2(t2.y, -t2.x);
      tmp.set(beltX, v2.y + o.y * 0.028, v2.x + o.x * 0.028);
      m4.compose(tmp, q, scl);
      teeth.setMatrixAt(k, m4);
    }
    teeth.instanceMatrix.needsUpdate = true;
  };
  pose();
  let isBig = false;
  return {
    scene,
    camera: cam,
    tone: THREE.NeutralToneMapping,
    update(_t, dt) {
      theta += dt * ((rpm * TAU) / 60);
      pose();
      orbit.update(cam, drag, dt, 0.1);
    },
    render(r, w, h) {
      isBig = w >= 700;
      if (isBig) drag.attach(w, h);
      if (!st.prepare(r, cam)) return;
      r.render(scene, cam);
      const deg = Math.round(((theta * 180) / Math.PI) % 720);
      const tags: Tag[] = [];
      XC.forEach((xc, i) => {
        if (solo && i > 0) return;
        // 위쪽 한 줄에 나란히 (3D 위치를 따라가면 매 장면 글씨 판을 다시 그려야 하고 서로 겹친다)
        void xc;
        tags.push({ text: `${i + 1}번 ${strokes[i]}`, x: 0.97 - (3 - i) * 0.1, y: 0.05, ax: 1, ay: 0, bg: STROKE_BG[strokes[i]!] });
      });
      // 카드에서는 실린더 이름표와 겹치지 않게 아래로
      tags.push({ text: `크랭크 ${deg}° · 캠축 ${Math.round(deg / 2)}° (크랭크의 1/2)`, x: 0.03, y: isBig ? 0.05 : 0.95, ax: 0, ay: isBig ? 0 : 1 });
      if (isBig) {
        tags.push({ text: '점화 순서 1 → 3 → 4 → 2 · 두 바퀴(720°)에 한 번씩 폭발', x: 0.03, y: 0.13, ax: 0, ay: 0 });
        tags.push({ text: '피스톤 높이 = r cosθ + √(l² − r² sin²θ) — 크랭크 각 하나로 모든 부품이 움직여요', x: 0.5, y: 0.96, ax: 0.5, ay: 1 });
      }
      overlay.draw(r, w, h, tags);
    },
    controls: [
      { type: 'range', label: '회전 속도 (rpm, 실제 엔진의 수십 분의 1)', min: 2, max: 240, step: 1, value: 30, on: (v) => (rpm = v) },
      {
        type: 'toggle',
        label: '한 실린더만 보기 (1번)',
        value: false,
        on: (v) => {
          solo = v;
          cyls.forEach((c, i) => c.parts.forEach((p) => (p.visible = !solo || i === 0)));
        },
      },
      {
        type: 'toggle',
        label: '단면 (끄면 블록 앞 절반을 덮는다)',
        value: true,
        on: (v) => {
          cutOn = v;
          blockFront.visible = !cutOn;
        },
      },
    ],
    dispose() {
      drag.dispose();
      overlay.dispose();
      freeTree(eng);
      for (const m of own) m.dispose();
      M.dispose();
      hatch.dispose();
      st.dispose();
    },
  };
}

export const DEMOS: DemoMap = {
  i541: {
    kind: '3d',
    caption: '직렬 4기통 단면 — 크랭크 각 하나로 피스톤 · 로드 · 캠(½ 속도) · 밸브 · 벨트가 모두 식으로 움직이고, 폭발 행정은 주황 · 흡입은 푸르게',
    make: () => makeEngine(),
  },
};

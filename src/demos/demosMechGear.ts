import * as THREE from 'three';
import type { DemoMap, Scene3D } from './types';
import { Drag, FONT, Orbit, Overlay, TAU, bevelExtrude, between, freeTree, lathe, makeStage, mechMats, roundRect, shadows } from './lib/mech';
import type { Tag } from './lib/mech';

/**
 * i540 톱니바퀴 장치 (2026-10-08) — 수학으로 계산한 인벌류트 톱니
 *  - 치형: 압력각 20°, 모듈 m, 잇수 z → 피치원 r = mz/2 · 기초원 r·cos20° · 이끝원 r + m · 이뿌리원 r − 1.25m.
 *    기초원 위 점은 인벌류트 inv(α) = tanα − α 만큼 돌아간 각에 놓인다 — 그 곡선이 그대로 2D 윤곽 → 돌출 + 모서리 깎기
 *  - 맞물림 위상: 큰 기어 이 사이 홈이 작은 기어 이를 정확히 받게 (방향 φ, 반 피치 어긋남, 각속도 = 잇수 비)
 *  - 기어 열 12 → 36 · (같은 축) 14 → 28 = 6 : 1, 옆에 유성 기어(선 12 · 유성 18 × 3 · 링 48 안쪽 톱니 · 캐리어)
 *    링 고정이면 선 5바퀴에 캐리어 1바퀴, 캐리어 고정이면 링이 반대로 1/4
 */

const PA = (20 * Math.PI) / 180;
const inv = (a: number): number => Math.tan(a) - a;
const polar = (r: number, a: number): THREE.Vector2 => new THREE.Vector2(r * Math.cos(a), r * Math.sin(a));

/** 인벌류트 톱니 윤곽 점 (이 0 번이 각 0). ra · rf 를 바꾸면 안쪽 톱니(링 기어 구멍)에도 쓴다 */
function gearPts(z: number, m: number, ra: number, rf: number, nFlank = 6): THREE.Vector2[] {
  const rp = (m * z) / 2;
  const rb = rp * Math.cos(PA);
  const half = Math.PI / (2 * z) + inv(PA);
  const th = (r: number): number => half - inv(Math.acos(Math.min(1, rb / Math.max(r, rb))));
  const rs: number[] = [rf];
  const r0 = Math.max(rf, rb);
  if (rf < rb) rs.push(rb);
  for (let i = 1; i <= nFlank; i++) {
    const k = i / nFlank;
    rs.push(r0 + (ra - r0) * (1 - (1 - k) * (1 - k)) * 0.999 + (ra - r0) * 0.001 * k);
  }
  rs[rs.length - 1] = ra;
  const pts: THREE.Vector2[] = [];
  const pitch = TAU / z;
  for (let i = 0; i < z; i++) {
    const c = i * pitch;
    for (const r of rs) pts.push(polar(r, c - th(r)));
    const ta = th(ra);
    for (let k = 1; k <= 2; k++) pts.push(polar(ra, c - ta + (2 * ta * k) / 3));
    for (let j = rs.length - 1; j >= 0; j--) pts.push(polar(rs[j]!, c + th(rs[j]!)));
    const a0 = c + th(rf);
    const a1 = c + pitch - th(rf);
    for (let k = 1; k <= 3; k++) pts.push(polar(rf, a0 + ((a1 - a0) * k) / 4));
  }
  return pts;
}

/** 축 구멍 + 키홈 */
function boreWithKey(r: number, key: number): THREE.Path {
  const p = new THREE.Path();
  const ha = Math.asin(Math.min(0.9, key / 2 / r));
  p.moveTo(r * Math.cos(ha), r * Math.sin(ha));
  p.absarc(0, 0, r, ha, TAU - ha, false);
  p.lineTo(r + key * 0.7, -key / 2);
  p.lineTo(r + key * 0.7, key / 2);
  p.lineTo(r * Math.cos(ha), r * Math.sin(ha));
  return p;
}
/** 살 사이 구멍 (둥근 부채꼴) */
function spokeHoles(n: number, ri: number, ro: number, w: number, rot = 0): THREE.Path[] {
  const out: THREE.Path[] = [];
  for (let k = 0; k < n; k++) {
    const a0 = rot + (k * TAU) / n;
    const a1 = rot + ((k + 1) * TAU) / n;
    const p = new THREE.Path();
    const s0 = a0 + w / ro;
    const s1 = a1 - w / ro;
    p.moveTo(ro * Math.cos(s0), ro * Math.sin(s0));
    p.absarc(0, 0, ro, s0, s1, false);
    p.lineTo(ri * Math.cos(a1 - w / ri), ri * Math.sin(a1 - w / ri));
    p.absarc(0, 0, ri, a1 - w / ri, a0 + w / ri, true);
    p.lineTo(ro * Math.cos(s0), ro * Math.sin(s0));
    out.push(p);
  }
  return out;
}

interface GearOpt {
  z: number;
  m: number;
  t: number;
  shaft: number;
  spokes?: number;
}
/** 바깥 톱니 기어 (평평하게 눕힘 — 두께는 Y) */
function gearGeo(o: GearOpt): THREE.BufferGeometry {
  const rp = (o.m * o.z) / 2;
  const s = new THREE.Shape(gearPts(o.z, o.m, rp + o.m, rp - 1.25 * o.m));
  s.holes.push(boreWithKey(o.shaft, o.shaft * 0.5));
  if (o.spokes) s.holes.push(...spokeHoles(o.spokes, o.shaft * 3.6, rp - 1.25 * o.m - o.m * 2.0, o.m * 2.4, Math.PI / o.spokes));
  return bevelExtrude(s, o.t, o.m * 0.22, 14, 2).rotateX(-Math.PI / 2);
}
/** 허브 돋음 (기어 양쪽으로 도톰한 고리) */
function hubGeo(shaft: number, r: number, t: number): THREE.BufferGeometry {
  const h = t / 2 + 0.05;
  return lathe(
    [
      [shaft + 0.004, -h],
      [r - 0.012, -h],
      [r, -h + 0.012],
      [r, h - 0.012],
      [r - 0.012, h],
      [shaft + 0.004, h],
    ],
    40,
  );
}

/** 3D 이름표 (항상 앞에 보이게) */
function label(text: string, sub = ''): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 120;
  const g = c.getContext('2d')!;
  g.font = `800 56px ${FONT}`;
  const tw = g.measureText(text).width;
  g.font = `600 34px ${FONT}`;
  const sw = sub ? g.measureText(sub).width + 14 : 0;
  const w = Math.min(316, tw + sw + 44);
  const x0 = (320 - w) / 2;
  g.beginPath();
  g.roundRect(x0, 22, w, 76, 38);
  g.fillStyle = 'rgba(22,28,40,0.78)';
  g.fill();
  g.textBaseline = 'middle';
  g.fillStyle = '#ffd98a';
  g.font = `600 34px ${FONT}`;
  if (sub) g.fillText(sub, x0 + 22, 62);
  g.fillStyle = '#ffffff';
  g.font = `800 56px ${FONT}`;
  g.fillText(text, x0 + 22 + sw, 62);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true }));
  sp.scale.set(0.8, 0.3, 1);
  sp.renderOrder = 20;
  return sp;
}

/** 세계 방향 (윤곽 각 φ ↔ rotation.y φ 와 같은 방향) */
const dirXZ = (phi: number, d: number): [number, number] => [Math.cos(phi) * d, -Math.sin(phi) * d];
/** 바깥 맞물림: B 의 각 (A 가 각 θA, B 가 A 에서 방향 φ 에 있을 때) */
const meshExt = (thA: number, zA: number, zB: number, phi: number): number => phi + Math.PI + Math.PI / zB - (zA / zB) * (thA - phi);

function makeGears(): Scene3D {
  const st = makeStage({ size: 4.2, bg: ['#e6ebf1', '#bcc5cf'] });
  const { scene, cam } = st;
  const M = mechMats();
  const root = new THREE.Group();
  scene.add(root);
  const PLATE = 0.22;
  const LA = PLATE + 0.32; // 아래층 기어 높이
  const LB = PLATE + 0.62; // 위층 (복합 기어)

  /* ── 받침판 · 볼트 ── */
  const plateG = bevelExtrude(roundRect(7.2, 4.1, 0.28), PLATE, 0.03, 12, 3).rotateX(-Math.PI / 2).translate(0, PLATE / 2, 0);
  const plate = new THREE.Mesh(plateG, M.iron);
  plate.position.set(0.35, 0, 0.3);
  root.add(plate);
  const boltG = new THREE.CylinderGeometry(0.075, 0.075, 0.05, 6).translate(0, 0.025, 0);
  const washerG = new THREE.CylinderGeometry(0.1, 0.1, 0.014, 24).translate(0, 0.007, 0);
  for (const [x, z] of [
    [-3.0, -1.5],
    [3.7, -1.5],
    [-3.0, 2.1],
    [3.7, 2.1],
    [0.35, -1.5],
    [0.35, 2.1],
  ] as [number, number][]) {
    const w = new THREE.Mesh(washerG, M.steel);
    w.position.set(x, PLATE, z);
    const b = new THREE.Mesh(boltG, M.steel);
    b.position.set(x, PLATE + 0.014, z);
    b.rotation.y = x * 3 + z;
    root.add(w, b);
  }

  /* ── 축 · 받침 ── */
  const shaftG = new THREE.CylinderGeometry(1, 1, 1, 24);
  const pillowG = lathe(
    [
      [0.0, 0],
      [0.2, 0],
      [0.2, 0.04],
      [0.17, 0.06],
      [0.11, 0.08],
      [0.1, 0.16],
      [0.0, 0.16],
    ],
    36,
  );
  const nutG = lathe(
    [
      [0.0, 0],
      [0.1, 0],
      [0.1, 0.05],
      [0.085, 0.075],
      [0.05, 0.1],
      [0.0, 0.105],
    ],
    6,
  );
  const shaftAt = (x: number, z: number, top: number, r = 0.06): void => {
    const p = new THREE.Mesh(pillowG, M.dark);
    p.position.set(x, PLATE, z);
    const s = new THREE.Mesh(shaftG, M.chrome);
    between(s, new THREE.Vector3(x, PLATE, z), new THREE.Vector3(x, top, z));
    s.scale.x = s.scale.z = r;
    const n = new THREE.Mesh(nutG, M.steel);
    n.position.set(x, top - 0.02, z);
    root.add(p, s, n);
  };

  /* ── 기어 열 ── */
  const m1 = 0.06;
  const T = 0.18;
  type G = { g: THREE.Group; z: number; label: THREE.Sprite };
  const labels: THREE.Sprite[] = [];
  const makeGear = (z: number, m: number, mat: THREE.Material, spokes: number, x: number, y: number, zz: number, sub: string): G => {
    const g = new THREE.Group();
    const gear = new THREE.Mesh(gearGeo({ z, m, t: T, shaft: 0.062, spokes }), mat);
    const hubR = Math.min(0.24, ((m * z) / 2) * 0.42);
    const hub = new THREE.Mesh(hubGeo(0.062, hubR, T), mat === M.brass ? M.steel : M.brass);
    // 키 (축과 기어를 잇는 작은 쐐기)
    const key = new THREE.Mesh(new THREE.BoxGeometry(0.03, T + 0.1, 0.03), M.dark);
    key.position.set(0.07, 0, 0);
    g.add(gear, hub, key);
    g.position.set(x, y, zz);
    root.add(g);
    const lb = label(String(z), sub);
    lb.position.set(x, y + 0.42, zz);
    root.add(lb);
    labels.push(lb);
    return { g, z, label: lb };
  };
  const g2p: [number, number] = [-1.0, 0.0];
  const phi21 = (150 * Math.PI) / 180; // 큰 기어에서 본 작은 기어 방향
  const a12 = (m1 * (12 + 36)) / 2;
  const [d1x, d1z] = dirXZ(phi21, a12);
  const g1p: [number, number] = [g2p[0] + d1x, g2p[1] + d1z];
  const phi12 = phi21 - Math.PI;
  const phi34 = (-58 * Math.PI) / 180;
  const a34 = (m1 * (14 + 28)) / 2;
  const [d4x, d4z] = dirXZ(phi34, a34);
  const g4p: [number, number] = [g2p[0] + d4x, g2p[1] + d4z];
  const G1 = makeGear(12, m1, M.steel, 0, g1p[0], LA, g1p[1], '');
  const G2 = makeGear(36, m1, M.brass, 5, g2p[0], LA, g2p[1], '');
  const G3 = makeGear(14, m1, M.brushed, 0, g2p[0], LB, g2p[1], '');
  const G4 = makeGear(28, m1, M.iron, 4, g4p[0], LB, g4p[1], '');
  G1.label.position.y = LA + 0.42;
  G2.label.position.set(g2p[0] - 0.62, LA + 0.3, g2p[1] - 0.55);
  G3.label.position.y = LB + 0.38;
  shaftAt(g1p[0], g1p[1], LA + 0.2);
  shaftAt(g2p[0], g2p[1], LB + 0.2);
  shaftAt(g4p[0], g4p[1], LB + 0.2);
  // 작은 기어를 돌리는 모터
  {
    const body = new THREE.Mesh(
      lathe(
        [
          [0, 0],
          [0.3, 0],
          [0.32, 0.03],
          [0.32, 0.5],
          [0.29, 0.54],
          [0.12, 0.56],
          [0.12, 0.62],
          [0, 0.62],
        ],
        40,
      ),
      M.navy,
    );
    body.rotation.z = Math.PI / 2;
    body.position.set(g1p[0] - 0.2, LA - 0.05, g1p[1]);
    // 모터는 기어 아래에서 축을 돌린다 — 기어와 겹치지 않게 받침판 뒤쪽 모서리 쪽으로 눕혀 둔다
    body.position.set(g1p[0] - 0.95, PLATE + 0.32, g1p[1] + 0.05);
    body.rotation.set(0, 0, -Math.PI / 2);
    root.add(body);
    // 모터 축 → 베벨이 아니라 작은 벨트 바퀴 둘 + 고무 띠
    const pul = lathe(
      [
        [0.06, -0.05],
        [0.16, -0.05],
        [0.14, 0],
        [0.16, 0.05],
        [0.06, 0.05],
      ],
      32,
    );
    const p1 = new THREE.Mesh(pul, M.steel);
    p1.position.set(g1p[0], PLATE + 0.12, g1p[1]);
    root.add(p1);
  }

  /* ── 유성 기어 ── */
  const mp = 0.045;
  const ZS = 12;
  const ZP = 18;
  const ZR = 48;
  const PC: [number, number] = [2.25, 0.3];
  const aP = (mp * (ZS + ZP)) / 2;
  const sun = makeGear(ZS, mp, M.chrome, 0, PC[0], LA, PC[1], '선 ');
  sun.label.position.y = LA + 0.75;
  const planets: G[] = [];
  for (let k = 0; k < 3; k++) {
    const p = makeGear(ZP, mp, M.steel, 0, PC[0], LA, PC[1], k === 0 ? '유성 ' : '');
    planets.push(p);
    if (k) {
      root.remove(p.label);
      labels.splice(labels.indexOf(p.label), 1);
      p.label.material.map?.dispose();
      p.label.material.dispose();
    }
  }
  // 링 기어: 바깥 원 + 안쪽 톱니 구멍(바깥 톱니 윤곽의 이 = 링의 이 사이 홈)
  const rpR = (mp * ZR) / 2;
  const ringOuter = rpR + 1.25 * mp + 0.16;
  const ringShape = new THREE.Shape();
  ringShape.absarc(0, 0, ringOuter, 0, TAU, false);
  ringShape.holes.push(new THREE.Path(gearPts(ZR, mp, rpR + 1.25 * mp, rpR - mp)));
  const ring = new THREE.Group();
  ring.add(new THREE.Mesh(bevelExtrude(ringShape, T, mp * 0.25, 64, 2).rotateX(-Math.PI / 2), M.brass));
  // 링 바깥 테에 볼트 구멍 자리 (작은 머리)
  for (let k = 0; k < 12; k++) {
    const b = new THREE.Mesh(boltG, M.steel);
    const a = (k / 12) * TAU;
    b.scale.setScalar(0.45);
    b.position.set(Math.cos(a) * (ringOuter - 0.08), T / 2, -Math.sin(a) * (ringOuter - 0.08));
    ring.add(b);
  }
  ring.position.set(PC[0], LA, PC[1]);
  root.add(ring);
  const ringLb = label(String(ZR), '링 ');
  ringLb.position.set(PC[0] + ringOuter * 0.72, LA + 0.35, PC[1] + ringOuter * 0.72);
  root.add(ringLb);
  labels.push(ringLb);
  planets[0]!.label.position.y = LA + 0.42;
  // 캐리어: 세 핀을 감싸는 둥근 세모 판 + 가벼움 구멍
  const carrier = new THREE.Group();
  {
    const rc = 0.15;
    const s = new THREE.Shape();
    for (let k = 0; k < 3; k++) {
      const pk = (k * TAU) / 3;
      const cx = Math.cos(pk) * aP;
      const cy = Math.sin(pk) * aP;
      const s0 = pk - Math.PI / 3;
      const s1 = pk + Math.PI / 3;
      if (k === 0) s.moveTo(cx + rc * Math.cos(s0), cy + rc * Math.sin(s0));
      else s.lineTo(cx + rc * Math.cos(s0), cy + rc * Math.sin(s0));
      s.absarc(cx, cy, rc, s0, s1, false);
    }
    s.closePath();
    s.holes.push(boreWithKey(0.062, 0.03));
    for (let k = 0; k < 3; k++) {
      const a = (k * TAU) / 3 + Math.PI / 3;
      const h = new THREE.Path();
      h.absarc(Math.cos(a) * aP * 0.42, Math.sin(a) * aP * 0.42, 0.075, 0, TAU, true);
      s.holes.push(h);
    }
    const plateC = new THREE.Mesh(bevelExtrude(s, 0.07, 0.016, 20, 2).rotateX(-Math.PI / 2), M.red);
    plateC.position.y = T / 2 + 0.09;
    carrier.add(plateC);
    for (let k = 0; k < 3; k++) {
      const pk = (k * TAU) / 3;
      const pin = new THREE.Mesh(shaftG, M.chrome);
      pin.scale.set(0.05, T + 0.2, 0.05);
      pin.position.set(Math.cos(pk) * aP, 0.04, -Math.sin(pk) * aP);
      const cap = new THREE.Mesh(nutG, M.steel);
      cap.scale.setScalar(0.7);
      cap.position.set(Math.cos(pk) * aP, T / 2 + 0.125, -Math.sin(pk) * aP);
      carrier.add(pin, cap);
    }
    carrier.position.set(PC[0], LA, PC[1]);
    root.add(carrier);
  }
  shaftAt(PC[0], PC[1], LA + 0.34);
  // 무엇을 붙잡았나: 링 고정 = 링을 받침판에 물리는 쇠 받침 셋 / 캐리어 고정 = 위에서 누르는 다리
  const ringClamps = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const a = (k * TAU) / 3 + Math.PI / 6;
    const blk = new THREE.Mesh(bevelExtrude(roundRect(0.26, 0.2, 0.04), LA + T / 2 - PLATE + 0.02, 0.02, 8, 2).rotateX(-Math.PI / 2), M.yellow);
    const r = ringOuter + 0.1;
    blk.position.set(PC[0] + Math.cos(a) * r, PLATE + (LA + T / 2 - PLATE + 0.02) / 2, PC[1] - Math.sin(a) * r);
    blk.rotation.y = a;
    const tab = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.16), M.yellow);
    tab.position.set(PC[0] + Math.cos(a) * (ringOuter + 0.02), LA + T / 2 + 0.03, PC[1] - Math.sin(a) * (ringOuter + 0.02));
    tab.rotation.y = a;
    ringClamps.add(blk, tab);
  }
  root.add(ringClamps);
  const carrierArch = new THREE.Group();
  {
    const h = LA + 0.62;
    const span = ringOuter + 0.25;
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(bevelExtrude(roundRect(0.16, 0.16, 0.03), h - PLATE, 0.02, 8, 2).rotateX(-Math.PI / 2), M.yellow);
      post.position.set(PC[0] + s * span, PLATE + (h - PLATE) / 2, PC[1] - span * 0.0);
      carrierArch.add(post);
    }
    const bar = new THREE.Mesh(bevelExtrude(roundRect(span * 2 + 0.16, 0.16, 0.03), 0.12, 0.02, 8, 2), M.yellow);
    bar.position.set(PC[0], h + 0.06, PC[1]);
    bar.rotation.x = -Math.PI / 2;
    const plunger = new THREE.Mesh(shaftG, M.yellow);
    between(plunger, new THREE.Vector3(PC[0], h, PC[1]), new THREE.Vector3(PC[0], LA + T / 2 + 0.16, PC[1]));
    plunger.scale.x = plunger.scale.z = 0.07;
    carrierArch.add(bar, plunger);
  }
  root.add(carrierArch);
  shadows(root);
  for (const l of labels) l.castShadow = false;

  /* ── 상태 ── */
  let speed = 1;
  let showLabels = true;
  let ringFixed = true;
  let th1 = 0;
  let thS = 0;
  let thC = 0;
  let thR = (Math.PI * (ZP + 1)) / ZR;
  let turns1 = 0;
  const drag = new Drag();
  const orbit = new Orbit(new THREE.Vector3(0.35, 0.3, 0.35), 0.22, 0.78, 9.2);
  const overlay = new Overlay();
  const setMode = (): void => {
    ringClamps.visible = ringFixed;
    carrierArch.visible = !ringFixed;
  };
  setMode();
  let isBig = false;
  return {
    scene,
    camera: cam,
    tone: THREE.NeutralToneMapping,
    update(_t, dt) {
      orbit.update(cam, drag, dt, isBig ? 0.12 : 0.18);
      const w = speed * 1.6 * dt;
      th1 += w;
      turns1 += w / TAU;
      // 기어 열
      const th2 = meshExt(th1, 12, 36, phi12);
      const th3 = th2;
      const th4 = meshExt(th3, 14, 28, phi34);
      G1.g.rotation.y = th1;
      G2.g.rotation.y = th2;
      G3.g.rotation.y = th3;
      G4.g.rotation.y = th4;
      // 유성: 선은 같은 빠르기
      thS += w;
      if (ringFixed) thC += (w * ZS) / (ZS + ZR);
      else thR -= (w * ZS) / ZR;
      sun.g.rotation.y = thS;
      ring.rotation.y = thR;
      carrier.rotation.y = thC;
      planets.forEach((p, k) => {
        const phi = thC + (k * TAU) / 3;
        const [dx, dz] = dirXZ(phi, aP);
        p.g.position.set(PC[0] + dx, LA, PC[1] + dz);
        p.g.rotation.y = phi + (ZR / ZP) * (thR - phi);
        if (k === 0) p.label.position.set(PC[0] + dx, LA + 0.42, PC[1] + dz);
      });
    },
    render(r, w, h) {
      isBig = w >= 700;
      drag.attach(w, h);
      if (!st.prepare(r, cam)) return;
      for (const l of labels) l.visible = showLabels;
      r.render(scene, cam);
      const tags: Tag[] = [
        { text: `기어 열  36 : 12 = 3 : 1  ·  28 : 14 = 2 : 1  →  6 : 1`, x: 0.03, y: 0.04, ax: 0, ay: 0 },
        {
          text: ringFixed ? '유성 (링 고정)  선 5바퀴 = 캐리어 1바퀴  (1 + 48 ÷ 12 = 5)' : '유성 (캐리어 고정)  링 = 선 × (−12 ÷ 48)  — 거꾸로 1/4',
          x: 0.03,
          y: 0.04 + (isBig ? 0.065 : 0.12),
          ax: 0,
          ay: 0,
          bg: 'rgba(150,50,40,0.78)',
        },
      ];
      if (isBig) {
        tags.push({ text: `작은 기어 ${turns1.toFixed(1)}바퀴  →  큰 기어(28) ${(turns1 / 6).toFixed(2)}바퀴`, x: 0.97, y: 0.04, ax: 1, ay: 0, bg: 'rgba(40,90,150,0.78)' });
        tags.push({ text: '톱니 = 인벌류트 곡선 (압력각 20°) · 끌어 돌리기 · 휠 확대', x: 0.5, y: 0.97, ax: 0.5, ay: 1 });
      }
      overlay.draw(r, w, h, tags);
    },
    controls: [
      { type: 'range', label: '빠르기', min: 0, max: 4, step: 0.1, value: 1, on: (v) => (speed = v) },
      { type: 'toggle', label: '잇수 표시', value: true, on: (v) => (showLabels = v) },
      { type: 'toggle', label: '유성 기어: 링 고정 (끄면 캐리어 고정)', value: true, on: (v) => ((ringFixed = v), setMode()) },
    ],
    dispose() {
      drag.dispose();
      overlay.dispose();
      for (const l of labels) {
        l.material.map?.dispose();
        l.material.dispose();
      }
      freeTree(root);
      M.dispose();
      st.dispose();
    },
  };
}

export const DEMOS: DemoMap = {
  i540: {
    kind: '3d',
    caption: '인벌류트 곡선으로 계산한 톱니 — 맞물린 두 기어는 잇수 비만큼 거꾸로 돈다 (12 → 36 · 14 → 28 = 6 : 1), 옆은 선 · 유성 · 링 기어',
    make: () => makeGears(),
  },
};

import * as THREE from 'three';
import type { Kind } from './logic';

/**
 * 강 건너기 친구들 — 블록 캐릭터(꼬마 창고지기 결)를 더 꼼꼼하게.
 * 32×32 도트 얼굴(반짝이는 눈 · 눈썹 · 코 · 볼 · 입) · 앞머리 · 귀 · 옷깃 · 단추 · 주머니 · 허리띠 · 밑창 있는 신발,
 * 동물은 튀어나온 주둥이와 코 · 귓속 · 볼 털 · 가슴 털 · 발바닥 · 끝색 꼬리 · 무늬.
 * 바닥 y = 0, 얼굴이 +Z. 팔다리 묶음 이름 armL · armR · legL · legR · tail 은 무대가 흔든다.
 */

export interface Kit {
  box(parent: THREE.Object3D, w: number, h: number, d: number, color: number, x: number, y: number, z: number, outline?: boolean): THREE.Mesh;
  /** 앞면에 32×32 도트 얼굴을 그린 블록 */
  face(parent: THREE.Object3D, w: number, h: number, d: number, color: number, paint: (p: P) => void, x: number, y: number, z: number): THREE.Mesh;
}
export type P = (x: number, y: number, c: string) => void;

const hex = (c: number): string => '#' + c.toString(16).padStart(6, '0');

interface FaceOpt {
  bg: string;
  eye?: string;
  eyes?: 'round' | 'happy' | 'sleepy' | 'big';
  brow?: string;
  mouth?: 'smile' | 'grin' | 'o' | 'cat' | 'fang' | 'none';
  blush?: boolean;
  nose?: string;
  /** 주둥이 색 (동물 — 아래쪽 둥근 판) */
  muzzle?: string;
  freckles?: boolean;
  glasses?: boolean;
}

/** 32×32 얼굴 */
export function paintFace(p: P, o: FaceOpt): void {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p(x, y, o.bg);
  if (o.muzzle)
    for (let y = 17; y < 29; y++)
      for (let x = 8; x < 24; x++) {
        const dx = (x - 15.5) / 8;
        const dy = (y - 22.5) / 6;
        if (dx * dx + dy * dy <= 1) p(x, y, o.muzzle);
      }
  const eye = o.eye ?? '#2a1e28';
  const E = o.eyes ?? 'round';
  for (const ex of [9, 22]) {
    if (E === 'happy') {
      for (const [dx, dy] of [
        [-2, 1],
        [-1, 0],
        [0, -1],
        [1, -1],
        [2, 0],
        [3, 1],
      ] as const)
        p(ex + dx, 13 + dy, eye);
    } else if (E === 'sleepy') {
      for (let dx = -2; dx <= 2; dx++) p(ex + dx, 13, eye);
    } else {
      const h = E === 'big' ? 7 : 6;
      const top = 10;
      for (let dy = 0; dy < h; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const corner = (dy === 0 || dy === h - 1) && Math.abs(dx) === 2;
          if (!corner) p(ex + dx, top + dy, eye);
        }
      // 큰 반짝이 · 작은 반짝이 · 아래 물빛
      p(ex - 1, top + 1, '#ffffff');
      p(ex, top + 1, '#ffffff');
      p(ex - 1, top + 2, '#ffffff');
      p(ex + 1, top + h - 2, '#ffffff');
      for (let dx = -1; dx <= 1; dx++) p(ex + dx, top + h - 1, '#5a6aa8');
    }
    if (o.brow) for (let dx = -2; dx <= 2; dx++) p(ex + dx, 7 - (Math.abs(dx) === 2 ? 0 : 1), o.brow);
  }
  if (o.glasses) {
    for (const ex of [9, 22]) {
      for (let dx = -4; dx <= 4; dx++) {
        p(ex + dx, 9, '#4a3a2a');
        p(ex + dx, 17, '#4a3a2a');
      }
      for (let dy = 9; dy <= 17; dy++) {
        p(ex - 4, dy, '#4a3a2a');
        p(ex + 4, dy, '#4a3a2a');
      }
    }
    for (let x = 14; x <= 17; x++) p(x, 12, '#4a3a2a');
  }
  if (o.blush !== false)
    for (const bx of [5, 26])
      for (let dy = 0; dy < 3; dy++)
        for (let dx = -2; dx <= 2; dx++) if (!(dy !== 1 && Math.abs(dx) === 2)) p(bx + dx, 19 + dy, '#ff9ab4');
  if (o.freckles) for (const [x, y] of [[6, 16], [8, 17], [24, 16], [26, 17]] as const) p(x, y, '#c8865a');
  if (o.nose) {
    for (let dx = -1; dx <= 1; dx++) p(15 + dx + 1, 19, o.nose);
    p(16, 20, o.nose);
    p(15, 19, o.nose);
  }
  const M = o.mouth ?? 'smile';
  const mc = '#8a2a3a';
  if (M === 'smile') {
    for (let x = 13; x <= 18; x++) p(x, 23, mc);
    p(12, 22, mc);
    p(19, 22, mc);
  } else if (M === 'grin') {
    for (let x = 12; x <= 19; x++) p(x, 22, mc);
    for (let x = 13; x <= 18; x++) p(x, 23, '#d84a5a');
    for (let x = 14; x <= 17; x++) p(x, 24, mc);
  } else if (M === 'o') {
    for (let y = 22; y <= 24; y++) for (let x = 15; x <= 16; x++) p(x, y, mc);
  } else if (M === 'cat') {
    for (const [x, y] of [[13, 24], [14, 25], [15, 24], [16, 24], [17, 25], [18, 24]] as const) p(x, y, '#3a2030');
  } else if (M === 'fang') {
    for (let x = 12; x <= 19; x++) p(x, 24, '#3a1a2a');
    p(13, 25, '#ffffff');
    p(18, 25, '#ffffff');
  }
}

export function limbs(k: Kit, g: THREE.Group, o: { arm: number; hand: number; leg: number; shoe: number; sole?: number; cuff?: number; pad?: number; armY?: number; legY?: number }): void {
  for (const sx of [-1, 1]) {
    const a = new THREE.Group();
    k.box(a, 0.13, 0.25, 0.15, o.arm, 0, -0.09, 0);
    if (o.cuff !== undefined) k.box(a, 0.14, 0.04, 0.16, o.cuff, 0, -0.2, 0, false);
    k.box(a, 0.12, 0.09, 0.13, o.hand, 0, -0.27, 0);
    if (o.pad !== undefined) k.box(a, 0.06, 0.04, 0.02, o.pad, 0, -0.28, 0.07, false);
    a.position.set(sx * 0.31, o.armY ?? 0.63, 0);
    a.name = sx < 0 ? 'armL' : 'armR';
    const l = new THREE.Group();
    k.box(l, 0.17, 0.17, 0.19, o.leg, 0, -0.07, 0);
    k.box(l, 0.18, 0.07, 0.26, o.shoe, 0, -0.18, 0.035);
    if (o.sole !== undefined) k.box(l, 0.19, 0.03, 0.27, o.sole, 0, -0.225, 0.035, false);
    if (o.pad !== undefined) k.box(l, 0.08, 0.02, 0.06, o.pad, 0, -0.2, 0.16, false);
    l.position.set(sx * 0.12, o.legY ?? 0.25, 0);
    l.name = sx < 0 ? 'legL' : 'legR';
    g.add(a, l);
  }
}

interface PersonOpt {
  skin: number;
  hair: number;
  shirt: number;
  pants: number;
  shoe: number;
  collar?: number;
  buttons?: number;
  hat?: 'straw' | 'cap' | 'bun' | 'none';
  beard?: boolean;
  skirt?: boolean;
  face?: Partial<FaceOpt>;
}

function person(k: Kit, g: THREE.Group, o: PersonOpt): void {
  const s = hex(o.skin);
  k.face(g, 0.48, 0.44, 0.44, o.skin, (p) => paintFace(p, { bg: s, brow: hex(o.hair), nose: '#e8a888', ...o.face }), 0, 0.88, 0);
  // 귀
  for (const sx of [-1, 1]) k.box(g, 0.05, 0.1, 0.08, o.skin, sx * 0.26, 0.86, 0, false);
  // 머리카락 — 정수리 · 뒤 · 옆 · 앞머리
  k.box(g, 0.5, 0.1, 0.46, o.hair, 0, 1.13, -0.01);
  k.box(g, 0.5, 0.34, 0.08, o.hair, 0, 0.96, -0.21);
  for (const sx of [-1, 1]) k.box(g, 0.05, 0.2, 0.36, o.hair, sx * 0.25, 1.0, -0.03, false);
  for (const [x, w, h] of [
    [-0.15, 0.16, 0.1],
    [0.02, 0.18, 0.08],
    [0.17, 0.12, 0.11],
  ] as const)
    k.box(g, w, h, 0.05, o.hair, x, 1.06, 0.21, false);
  if (o.beard) {
    k.box(g, 0.44, 0.13, 0.07, 0xf4f4f4, 0, 0.72, 0.21);
    k.box(g, 0.24, 0.12, 0.07, 0xf4f4f4, 0, 0.63, 0.21, false);
    k.box(g, 0.2, 0.04, 0.05, 0xf4f4f4, 0, 0.82, 0.235, false);
  }
  if (o.hat === 'straw') {
    k.box(g, 0.78, 0.04, 0.7, 0xf0c860, 0, 1.17, 0);
    k.box(g, 0.46, 0.15, 0.42, 0xf0c860, 0, 1.25, 0);
    k.box(g, 0.47, 0.05, 0.43, 0xd8503a, 0, 1.2, 0, false);
    for (let k2 = 0; k2 < 4; k2++) k.box(g, 0.78, 0.005, 0.02, 0xd8a840, 0, 1.195, -0.3 + k2 * 0.2, false);
  } else if (o.hat === 'cap') {
    k.box(g, 0.5, 0.13, 0.46, 0x3a7ae0, 0, 1.15, -0.02);
    k.box(g, 0.44, 0.04, 0.14, 0x2a5ac0, 0, 1.11, 0.27);
    k.box(g, 0.1, 0.06, 0.1, 0xffffff, 0, 1.24, 0, false);
  } else if (o.hat === 'bun') {
    k.box(g, 0.22, 0.2, 0.22, o.hair, 0, 1.26, -0.08);
    k.box(g, 0.24, 0.05, 0.24, 0xf06aa8, 0, 1.19, -0.08, false);
  }
  // 목 · 몸 · 옷깃 · 단추 · 주머니
  k.box(g, 0.16, 0.06, 0.16, o.skin, 0, 0.68, 0, false);
  k.box(g, 0.47, 0.28, 0.33, o.shirt, 0, 0.53, 0);
  if (o.collar !== undefined)
    for (const sx of [-1, 1]) {
      const c = k.box(g, 0.12, 0.08, 0.03, o.collar, sx * 0.07, 0.64, 0.17, false);
      c.rotation.z = sx * 0.4;
    }
  if (o.buttons !== undefined) for (const y of [0.58, 0.5, 0.43]) k.box(g, 0.035, 0.035, 0.02, o.buttons, 0, y, 0.175, false);
  k.box(g, 0.1, 0.08, 0.02, new THREE.Color(o.shirt).multiplyScalar(0.8).getHex(), 0.13, 0.52, 0.17, false);
  if (o.skirt) {
    k.box(g, 0.54, 0.2, 0.4, o.pants, 0, 0.33, 0);
    for (let k2 = 0; k2 < 5; k2++) k.box(g, 0.02, 0.18, 0.005, new THREE.Color(o.pants).multiplyScalar(0.85).getHex(), -0.2 + k2 * 0.1, 0.33, 0.203, false);
  } else {
    k.box(g, 0.47, 0.06, 0.34, 0x5a3a24, 0, 0.4, 0, false);
    k.box(g, 0.08, 0.06, 0.02, 0xe8c040, 0, 0.4, 0.175, false);
    k.box(g, 0.47, 0.17, 0.33, o.pants, 0, 0.3, 0);
  }
  limbs(k, g, { arm: o.shirt, hand: o.skin, leg: o.pants, shoe: o.shoe, sole: 0xf4ece0, cuff: o.collar });
}

interface CritterOpt {
  fur: number;
  light: number;
  ears: 'point' | 'flop' | 'round' | 'mouse' | 'long';
  tail: 'bushy' | 'thin' | 'puff' | 'none';
  mouth?: FaceOpt['mouth'];
  eye?: string;
  eyes?: FaceOpt['eyes'];
  tip?: number;
  inner?: number;
  nose?: number;
  stripes?: number;
  spots?: number;
}

function critter(k: Kit, g: THREE.Group, o: CritterOpt): void {
  const nose = o.nose ?? 0x3a2030;
  k.face(g, 0.52, 0.44, 0.46, o.fur, (p) => paintFace(p, { bg: hex(o.fur), muzzle: hex(o.light), mouth: o.mouth ?? 'smile', eye: o.eye, eyes: o.eyes }), 0, 0.88, 0);
  // 튀어나온 주둥이 · 코
  k.box(g, 0.24, 0.13, 0.08, o.light, 0, 0.81, 0.25);
  k.box(g, 0.09, 0.06, 0.04, nose, 0, 0.86, 0.3, false);
  k.box(g, 0.03, 0.015, 0.01, 0xffffff, -0.015, 0.875, 0.322, false);
  // 볼 털
  for (const sx of [-1, 1]) {
    k.box(g, 0.06, 0.1, 0.12, o.light, sx * 0.27, 0.8, 0.06, false);
    k.box(g, 0.05, 0.06, 0.1, o.light, sx * 0.3, 0.74, 0.06, false);
  }
  const inner = o.inner ?? 0xffb0c4;
  for (const sx of [-1, 1]) {
    if (o.ears === 'point') {
      const e = new THREE.Group();
      k.box(e, 0.16, 0.16, 0.08, o.fur, 0, 0.08, 0);
      k.box(e, 0.1, 0.12, 0.08, o.fur, 0, 0.19, 0, false);
      k.box(e, 0.05, 0.06, 0.08, o.tip ?? o.fur, 0, 0.27, 0, false);
      k.box(e, 0.08, 0.12, 0.02, inner, 0, 0.1, 0.045, false);
      e.position.set(sx * 0.17, 1.1, -0.02);
      e.rotation.z = -sx * 0.12;
      g.add(e);
    } else if (o.ears === 'flop') {
      const e = new THREE.Group();
      k.box(e, 0.1, 0.28, 0.15, o.tip ?? new THREE.Color(o.fur).multiplyScalar(0.75).getHex(), 0, -0.12, 0);
      e.position.set(sx * 0.3, 1.02, 0);
      e.rotation.z = sx * 0.2;
      e.name = sx < 0 ? 'earL' : 'earR';
      g.add(e);
    } else if (o.ears === 'round') {
      k.box(g, 0.15, 0.15, 0.08, o.fur, sx * 0.21, 1.14, 0);
      k.box(g, 0.08, 0.08, 0.02, inner, sx * 0.21, 1.14, 0.045, false);
    } else if (o.ears === 'mouse') {
      k.box(g, 0.24, 0.24, 0.06, o.fur, sx * 0.28, 1.14, -0.02);
      k.box(g, 0.16, 0.16, 0.02, inner, sx * 0.28, 1.14, 0.015, false);
    } else {
      const e = new THREE.Group();
      k.box(e, 0.13, 0.44, 0.08, o.fur, 0, 0.22, 0);
      k.box(e, 0.07, 0.34, 0.02, inner, 0, 0.22, 0.045, false);
      e.position.set(sx * 0.13, 1.06, 0);
      e.rotation.z = -sx * 0.15;
      e.name = sx < 0 ? 'earL' : 'earR';
      g.add(e);
    }
  }
  // 몸 · 가슴 털 · 무늬
  k.box(g, 0.45, 0.43, 0.33, o.fur, 0, 0.43, 0);
  k.box(g, 0.28, 0.28, 0.04, o.light, 0, 0.42, 0.17, false);
  k.box(g, 0.18, 0.06, 0.04, o.light, 0, 0.59, 0.175, false);
  if (o.stripes !== undefined)
    for (const y of [0.33, 0.45, 0.57]) {
      k.box(g, 0.46, 0.035, 0.34, o.stripes, 0, y, 0, false);
      for (const sx of [-1, 1]) k.box(g, 0.08, 0.025, 0.47, o.stripes, sx * 0.18, 1.0 + (y - 0.45) * 0.4, 0, false);
    }
  if (o.spots !== undefined)
    for (const [x, y, z] of [
      [-0.15, 0.5, -0.17],
      [0.12, 0.34, -0.17],
      [0.23, 0.52, 0.05],
    ] as const)
      k.box(g, 0.1, 0.08, 0.02, o.spots, x, y, z, false);
  if (o.tail !== 'none') {
    const t = new THREE.Group();
    if (o.tail === 'bushy') {
      k.box(t, 0.14, 0.18, 0.14, o.fur, 0, 0.09, 0);
      k.box(t, 0.18, 0.18, 0.18, o.fur, 0, 0.24, 0);
      k.box(t, 0.15, 0.12, 0.15, o.tip ?? 0xffffff, 0, 0.38, 0, false);
    } else if (o.tail === 'thin') {
      k.box(t, 0.06, 0.2, 0.06, o.fur, 0, 0.1, 0);
      k.box(t, 0.06, 0.16, 0.06, o.tip ?? o.fur, 0, 0.26, 0.04, false);
    } else k.box(t, 0.17, 0.17, 0.15, o.tip ?? 0xffffff, 0, 0.04, 0);
    t.position.set(0, 0.28, -0.19);
    t.rotation.x = o.tail === 'puff' ? 0 : -0.7;
    t.name = 'tail';
    g.add(t);
  }
  limbs(k, g, { arm: o.fur, hand: o.light, leg: o.fur, shoe: o.light, pad: 0xff9ab0 });
}

export function buildRider(kind: Kind, k: Kit): THREE.Group {
  const g = chibiRaw(kind, k);
  return kind === 'cabbage' || kind === 'cheese' ? g : chibi(g);
}

/** 머리(높이 0.66 위)는 1.3배, 몸은 0.82배 — 큰 머리 꼬마 비율 */
export function chibi(src: THREE.Group): THREE.Group {
  const out = new THREE.Group();
  const body = new THREE.Group();
  const head = new THREE.Group();
  const PIV = 0.66;
  body.scale.set(0.92, 0.8, 0.92);
  head.position.y = PIV * 0.8;
  head.scale.setScalar(1.3);
  for (const c of [...src.children]) {
    const isLimb = /^(arm|leg|tail)/.test(c.name);
    if (!isLimb && c.position.y >= PIV) {
      c.position.y -= PIV;
      head.add(c);
    } else body.add(c);
  }
  out.add(body, head);
  // 팔다리 · 꼬리 이름을 그대로 찾을 수 있게 (getObjectByName 은 깊이 찾는다)
  return out;
}

function chibiRaw(kind: Kind, k: Kit): THREE.Group {
  const g = new THREE.Group();
  switch (kind) {
    case 'farmer':
      person(k, g, { skin: 0xffd9b8, hair: 0x6a3a20, shirt: 0xe8e0d0, pants: 0x3a5aa8, shoe: 0x6a4024, hat: 'straw', collar: 0xd8d0c0, face: { freckles: true } });
      for (const sx of [-1, 1]) k.box(g, 0.07, 0.3, 0.03, 0x3a5aa8, sx * 0.13, 0.54, 0.168, false);
      k.box(g, 0.26, 0.14, 0.03, 0x3a5aa8, 0, 0.47, 0.168, false);
      for (const sx of [-1, 1]) k.box(g, 0.04, 0.04, 0.02, 0xe8c040, sx * 0.13, 0.66, 0.185, false);
      break;
    case 'kid':
      person(k, g, { skin: 0xffdcc0, hair: 0x3a2418, shirt: 0xe8453c, pants: 0x3a5ad8, shoe: 0xffffff, hat: 'cap', collar: 0xffffff, face: { eyes: 'big', mouth: 'grin' } });
      k.box(g, 0.2, 0.06, 0.02, 0xffffff, 0, 0.53, 0.168, false);
      break;
    case 'mom':
      person(k, g, { skin: 0xffdcc4, hair: 0x8a4a28, shirt: 0xf8f0f4, pants: 0xe85a98, shoe: 0xe85a98, hat: 'bun', skirt: true, collar: 0xe85a98, buttons: 0xe85a98, face: { mouth: 'smile' } });
      break;
    case 'dad':
      person(k, g, { skin: 0xffd0b0, hair: 0x2a1a14, shirt: 0x4fa060, pants: 0x3a3a58, shoe: 0x4a2a18, collar: 0xffffff, buttons: 0xffffff });
      k.box(g, 0.07, 0.2, 0.02, 0xd8453c, 0, 0.55, 0.172, false);
      break;
    case 'grandpa':
      person(k, g, { skin: 0xffd8c0, hair: 0xe8e8e8, shirt: 0x8a6ab8, pants: 0x5a4a6a, shoe: 0x3a2a20, beard: true, collar: 0xe8e0f0, buttons: 0xe8c040, face: { glasses: true, eyes: 'happy' } });
      {
        const cane = new THREE.Group();
        k.box(cane, 0.04, 0.62, 0.04, 0x8a5a30, 0, 0.31, 0);
        k.box(cane, 0.16, 0.05, 0.05, 0x8a5a30, -0.06, 0.62, 0);
        cane.position.set(0.42, 0, 0.12);
        g.add(cane);
      }
      break;
    case 'wolf':
      critter(k, g, { fur: 0x8a92a8, light: 0xe8ecf4, ears: 'point', tail: 'bushy', mouth: 'fang', tip: 0x5a6278, eye: '#2a3a6a' });
      break;
    case 'fox':
      critter(k, g, { fur: 0xf08a2c, light: 0xfff4e8, ears: 'point', tail: 'bushy', tip: 0x3a2a24 });
      break;
    case 'dog':
      critter(k, g, { fur: 0xe8c088, light: 0xfff4e0, ears: 'flop', tail: 'thin', tip: 0xa8703a, spots: 0xa8703a });
      k.box(g, 0.47, 0.05, 0.36, 0xd8453c, 0, 0.66, 0, false);
      k.box(g, 0.07, 0.07, 0.03, 0xf0c040, 0, 0.62, 0.19, false);
      break;
    case 'cat':
      critter(k, g, { fur: 0xffa848, light: 0xfff0dc, ears: 'point', tail: 'thin', mouth: 'cat', eye: '#2a6a2a', stripes: 0xd87020, tip: 0xd87020 });
      for (const sx of [-1, 1]) for (const dy of [0, 0.03]) k.box(g, 0.2, 0.01, 0.01, 0x5a3a20, sx * 0.3, 0.8 + dy, 0.27, false);
      break;
    case 'mouse':
      critter(k, g, { fur: 0xb8bcc8, light: 0xf0f0f6, ears: 'mouse', tail: 'thin', mouth: 'o', nose: 0xff8aa8, tip: 0xffb0c4 });
      break;
    case 'rabbit':
      critter(k, g, { fur: 0xfaf8f4, light: 0xfff0f4, ears: 'long', tail: 'puff', mouth: 'cat', nose: 0xff8aa8, eye: '#6a2a3a' });
      break;
    case 'bear':
      critter(k, g, { fur: 0xa8704a, light: 0xe8c8a0, ears: 'round', tail: 'none', inner: 0xe8c8a0 });
      k.box(g, 0.47, 0.06, 0.36, 0x3a8ae0, 0, 0.66, 0, false);
      break;
    case 'goat': {
      critter(k, g, { fur: 0xf8f6f0, light: 0xece4d4, ears: 'flop', tail: 'puff', tip: 0xd8d0c0, nose: 0x8a6a5a, eyes: 'happy' });
      for (const sx of [-1, 1]) {
        const horn = new THREE.Group();
        k.box(horn, 0.08, 0.16, 0.08, 0xd8c8a0, 0, 0.08, 0);
        k.box(horn, 0.07, 0.1, 0.12, 0xc8b890, 0, 0.18, -0.05, false);
        k.box(horn, 0.06, 0.07, 0.08, 0xb8a880, 0, 0.21, -0.13, false);
        horn.position.set(sx * 0.13, 1.08, -0.04);
        horn.rotation.z = -sx * 0.25;
        g.add(horn);
      }
      k.box(g, 0.1, 0.14, 0.06, 0xe8e0d0, 0, 0.66, 0.25);
      k.box(g, 0.1, 0.05, 0.05, 0xf0c040, 0, 0.62, 0.19, false);
      break;
    }
    case 'cabbage': {
      k.face(g, 0.52, 0.44, 0.48, 0xc8f0a0, (p) => paintFace(p, { bg: '#c8f0a0', mouth: 'smile', eyes: 'big' }), 0, 0.44, 0);
      const leaves: [number, number, number, number][] = [
        [-0.29, 0, 0, 0x6ab84a],
        [0.29, 0, 0, 0x6ab84a],
        [0, -0.27, Math.PI / 2, 0x5aa040],
        [-0.22, -0.2, Math.PI / 4, 0x7ac858],
        [0.22, -0.2, -Math.PI / 4, 0x7ac858],
      ];
      for (const [x, z, ry, c] of leaves) {
        const leaf = k.box(g, 0.1, 0.5, 0.48, c, x, 0.44, z);
        leaf.rotation.y = ry;
        leaf.rotation.z = x === 0 ? 0 : x < 0 ? 0.15 : -0.15;
      }
      for (const x of [-0.31, 0.31]) k.box(g, 0.01, 0.4, 0.02, 0xd8f0b0, x, 0.44, 0.1, false);
      k.box(g, 0.48, 0.08, 0.44, 0x5aa040, 0, 0.7, 0);
      k.box(g, 0.2, 0.12, 0.2, 0x7ac050, 0, 0.79, 0);
      k.box(g, 0.08, 0.08, 0.08, 0x9ad870, 0.03, 0.88, 0.02, false);
      for (const sx of [-1, 1]) {
        const l = new THREE.Group();
        k.box(l, 0.12, 0.2, 0.12, 0x4f9e32, 0, -0.08, 0);
        k.box(l, 0.14, 0.05, 0.18, 0x3a7a24, 0, -0.19, 0.02, false);
        l.position.set(sx * 0.12, 0.22, 0);
        l.name = sx < 0 ? 'legL' : 'legR';
        g.add(l);
      }
      break;
    }
    case 'cheese': {
      k.face(g, 0.58, 0.38, 0.44, 0xf6cf3a, (p) => {
        paintFace(p, { bg: '#f6cf3a', eyes: 'big' });
        for (const [x, y] of [[3, 4], [27, 6], [26, 27], [4, 28]] as const)
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) p(x + dx, y + dy, '#e0a820');
      }, 0, 0.42, 0);
      k.box(g, 0.58, 0.07, 0.44, 0xffe680, 0, 0.64, 0);
      for (const [x, y, z] of [
        [-0.3, 0.42, 0.05],
        [0.3, 0.5, -0.08],
        [0.3, 0.34, 0.1],
        [-0.3, 0.55, -0.12],
      ] as const)
        k.box(g, 0.02, 0.09, 0.09, 0xd8a820, x, y, z, false);
      for (const sx of [-1, 1]) {
        const l = new THREE.Group();
        k.box(l, 0.1, 0.18, 0.1, 0xe0b020, 0, -0.06, 0);
        k.box(l, 0.12, 0.05, 0.16, 0xc89818, 0, -0.16, 0.02, false);
        l.position.set(sx * 0.15, 0.22, 0);
        l.name = sx < 0 ? 'legL' : 'legR';
        g.add(l);
      }
      break;
    }
  }
  return g;
}

import * as THREE from 'three';

/**
 * 블록 캐릭터 — 상자를 미는 주인공들과 들판을 돌아다니는 친구들.
 * 모두 바닥 y = 0, 앞(얼굴)이 +Z. 걷기 흔들기는 이름 armL · armR · legL · legR 묶음을 무대가 돌린다.
 * userData.float = 둥실 뜨는 아이(유령), userData.squish = 말랑하게 찌그러지는 아이(슬라임).
 */

export { CHAR_KEY, CHAR_NAME, type CharId, charSvg, PUSHERS } from './charInfo';
import type { CharId } from './charInfo';

export interface Kit {
  /** 블록 하나 (외곽선 포함) */
  box(parent: THREE.Object3D, w: number, h: number, d: number, color: number | THREE.Material, x: number, y: number, z: number, outline?: boolean): THREE.Mesh;
  /** 앞면에 도트 얼굴을 그린 머리 블록 */
  head(parent: THREE.Object3D, w: number, h: number, d: number, color: number, face: FaceSpec, x: number, y: number, z: number): THREE.Mesh;
  mat(color: number, opts?: THREE.MeshStandardMaterialParameters): THREE.Material;
}

export interface FaceSpec {
  bg: string;
  eye?: string;
  /** 'dot' 동글 · 'big' 큰 눈 · 'one' 외눈 · 'screen' 로봇 화면 */
  eyes?: 'dot' | 'big' | 'one' | 'screen';
  mouth?: 'smile' | 'o' | 'cat' | 'beak' | 'fang' | 'none';
  blush?: boolean;
  muzzle?: string;
}

/** 16×16 도트 얼굴 */
export function drawFace(p: (x: number, y: number, c: string) => void, f: FaceSpec): void {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p(x, y, f.bg);
  const eye = f.eye ?? '#2a2030';
  if (f.muzzle) for (let y = 9; y < 14; y++) for (let x = 5; x < 11; x++) if (!((x === 5 || x === 10) && (y === 9 || y === 13))) p(x, y, f.muzzle);
  const E = f.eyes ?? 'dot';
  if (E === 'screen') {
    for (let y = 3; y < 13; y++) for (let x = 2; x < 14; x++) p(x, y, '#1c2a3a');
    for (const [x, y] of [
      [5, 6],
      [10, 6],
      [5, 7],
      [10, 7],
    ] as const)
      p(x, y, '#5ff0ff');
    for (const x of [6, 7, 8, 9]) p(x, 10, '#5ff0ff');
    return;
  }
  if (E === 'one') {
    for (let y = 4; y < 10; y++) for (let x = 5; x < 11; x++) if (!((x === 5 || x === 10) && (y === 4 || y === 9))) p(x, y, '#ffffff');
    for (let y = 6; y < 9; y++) for (let x = 7; x < 10; x++) p(x, y, eye);
    p(7, 6, '#ffffff');
  } else {
    const ey = E === 'big' ? 6 : 7;
    for (const ex of [4, 10]) {
      p(ex, ey, eye);
      p(ex + 1, ey, eye);
      p(ex, ey + 1, eye);
      p(ex + 1, ey + 1, eye);
      if (E === 'big') {
        p(ex, ey + 2, eye);
        p(ex + 1, ey + 2, eye);
      }
      // 하얀 얼굴엔 반짝이가 묻혀 눈이 깨져 보이니 연한 하늘색으로
      p(ex, ey, /^#f[0-9a-f]f[0-9a-f]ff$/i.test(f.bg) || f.bg === '#ffffff' ? '#8fb8ff' : '#ffffff');
    }
  }
  if (f.blush !== false) for (const x of [2, 3, 12, 13]) p(x, 10, '#ff8fa0');
  const M = f.mouth ?? 'smile';
  if (M === 'smile') {
    for (const x of [6, 7, 8, 9]) p(x, 12, '#a03a3a');
    p(5, 11, '#a03a3a');
    p(10, 11, '#a03a3a');
  } else if (M === 'o') {
    for (const [x, y] of [
      [7, 11],
      [8, 11],
      [7, 12],
      [8, 12],
    ] as const)
      p(x, y, '#5a2030');
  } else if (M === 'cat') {
    p(7, 10, '#ff7a8a');
    p(8, 10, '#ff7a8a');
    for (const [x, y] of [
      [6, 12],
      [7, 11],
      [8, 11],
      [9, 12],
    ] as const)
      p(x, y, '#3a2030');
  } else if (M === 'beak') {
    for (const [x, y] of [
      [7, 10],
      [8, 10],
      [6, 11],
      [7, 11],
      [8, 11],
      [9, 11],
    ] as const)
      p(x, y, '#ff9a1a');
  } else if (M === 'fang') {
    for (const x of [5, 6, 7, 8, 9, 10]) p(x, 12, '#5a1a3a');
    p(6, 13, '#ffffff');
    p(9, 13, '#ffffff');
  }
}

function limbs(k: Kit, g: THREE.Group, arm: number | THREE.Material, hand: number | THREE.Material, leg: number | THREE.Material, shoe: number | THREE.Material, armY = 0.62, legY = 0.24): void {
  for (const sx of [-1, 1]) {
    const a = new THREE.Group();
    k.box(a, 0.12, 0.26, 0.14, arm, 0, -0.1, 0);
    k.box(a, 0.11, 0.08, 0.12, hand, 0, -0.26, 0);
    a.position.set(sx * 0.3, armY, 0);
    a.name = sx < 0 ? 'armL' : 'armR';
    const l = new THREE.Group();
    k.box(l, 0.16, 0.18, 0.18, leg, 0, -0.08, 0);
    k.box(l, 0.17, 0.08, 0.24, shoe, 0, -0.2, 0.03);
    l.position.set(sx * 0.11, legY, 0);
    l.name = sx < 0 ? 'legL' : 'legR';
    g.add(a, l);
  }
}

export function buildChar(id: CharId, k: Kit): THREE.Group {
  const g = new THREE.Group();
  switch (id) {
    case 'kid': {
      k.head(g, 0.46, 0.42, 0.42, 0xffd9b8, { bg: '#ffd9b8' }, 0, 0.86, 0);
      k.box(g, 0.48, 0.12, 0.44, 0xff5252, 0, 1.11, -0.02);
      k.box(g, 0.42, 0.04, 0.1, 0xe03c3c, 0, 1.08, 0.24);
      k.box(g, 0.12, 0.06, 0.12, 0xffffff, 0, 1.2, 0);
      k.box(g, 0.46, 0.26, 0.32, 0xffd23a, 0, 0.52, 0);
      k.box(g, 0.46, 0.2, 0.32, 0x3a7bff, 0, 0.32, 0);
      k.box(g, 0.26, 0.16, 0.04, 0x3a7bff, 0, 0.5, 0.17);
      for (const sx of [-1, 1]) {
        k.box(g, 0.06, 0.2, 0.04, 0x3a7bff, sx * 0.15, 0.58, 0.165);
        k.box(g, 0.05, 0.05, 0.03, 0xffe066, sx * 0.15, 0.54, 0.19, false);
      }
      limbs(k, g, 0xffd23a, 0xffd9b8, 0x2f66d6, 0x6a4024);
      break;
    }
    case 'bunny': {
      k.head(g, 0.46, 0.4, 0.42, 0xffffff, { bg: '#ffffff', mouth: 'cat' }, 0, 0.82, 0);
      for (const sx of [-1, 1]) {
        const ear = new THREE.Group();
        k.box(ear, 0.12, 0.42, 0.08, 0xffffff, 0, 0.21, 0);
        k.box(ear, 0.06, 0.32, 0.02, 0xffb3c6, 0, 0.21, 0.045, false);
        ear.position.set(sx * 0.12, 1.0, 0);
        ear.rotation.z = -sx * 0.18;
        ear.name = sx < 0 ? 'earL' : 'earR';
        g.add(ear);
      }
      k.box(g, 0.44, 0.42, 0.34, 0xffffff, 0, 0.42, 0);
      k.box(g, 0.28, 0.28, 0.04, 0xfff0f4, 0, 0.42, 0.18, false);
      k.box(g, 0.16, 0.16, 0.16, 0xffffff, 0, 0.32, -0.22);
      limbs(k, g, 0xffffff, 0xffffff, 0xffffff, 0xffc6d6);
      break;
    }
    case 'bear': {
      k.head(g, 0.5, 0.44, 0.44, 0xb07a48, { bg: '#b07a48', muzzle: '#f0d2a8', mouth: 'smile' }, 0, 0.86, 0);
      for (const sx of [-1, 1]) {
        k.box(g, 0.14, 0.14, 0.08, 0xb07a48, sx * 0.2, 1.12, 0);
        k.box(g, 0.07, 0.07, 0.02, 0xf0b8a0, sx * 0.2, 1.12, 0.045, false);
      }
      k.box(g, 0.5, 0.46, 0.36, 0xb07a48, 0, 0.42, 0);
      k.box(g, 0.3, 0.3, 0.04, 0xf0d2a8, 0, 0.42, 0.19, false);
      k.box(g, 0.5, 0.06, 0.38, 0xff5a5a, 0, 0.66, 0);
      limbs(k, g, 0xb07a48, 0x8a5a30, 0xb07a48, 0x8a5a30);
      break;
    }
    case 'cat': {
      k.head(g, 0.48, 0.4, 0.42, 0xffa040, { bg: '#ffa040', mouth: 'cat', eye: '#2a6a2a' }, 0, 0.84, 0);
      for (const sx of [-1, 1]) {
        k.box(g, 0.12, 0.12, 0.08, 0xffa040, sx * 0.16, 1.1, 0);
        k.box(g, 0.06, 0.06, 0.02, 0xffd0b0, sx * 0.16, 1.1, 0.045, false);
        k.box(g, 0.2, 0.012, 0.012, 0x5a3a20, sx * 0.3, 0.78, 0.22, false);
      }
      for (const y of [0.98, 0.9]) k.box(g, 0.5, 0.03, 0.44, 0xd87020, 0, y, 0, false);
      k.box(g, 0.44, 0.42, 0.32, 0xffa040, 0, 0.42, 0);
      for (const y of [0.34, 0.46, 0.58]) k.box(g, 0.46, 0.04, 0.34, 0xd87020, 0, y, 0, false);
      const tail = new THREE.Group();
      k.box(tail, 0.08, 0.36, 0.08, 0xffa040, 0, 0.18, 0);
      k.box(tail, 0.09, 0.08, 0.09, 0xd87020, 0, 0.36, 0, false);
      tail.position.set(0, 0.3, -0.18);
      tail.rotation.x = -0.6;
      tail.name = 'tail';
      g.add(tail);
      limbs(k, g, 0xffa040, 0xffffff, 0xffa040, 0xffffff);
      break;
    }
    case 'ghost': {
      const sheet = k.mat(0xf6f8ff, { roughness: 0.4, transparent: true, opacity: 0.9, emissive: 0xc8d8ff, emissiveIntensity: 0.25 });
      k.head(g, 0.56, 0.5, 0.5, 0xf6f8ff, { bg: '#f6f8ff', eyes: 'big', mouth: 'o' }, 0, 0.78, 0);
      k.box(g, 0.56, 0.36, 0.5, sheet, 0, 0.4, 0);
      // 물결 자락
      for (let i = 0; i < 4; i++) k.box(g, 0.13, 0.12 + (i % 2) * 0.06, 0.5, sheet, -0.21 + i * 0.14, 0.2 - (i % 2) * 0.03, 0, false);
      for (const sx of [-1, 1]) {
        const a = new THREE.Group();
        k.box(a, 0.12, 0.2, 0.14, sheet, 0, -0.06, 0);
        a.position.set(sx * 0.33, 0.6, 0.02);
        a.rotation.z = sx * 0.5;
        a.name = sx < 0 ? 'armL' : 'armR';
        g.add(a);
      }
      g.userData['float'] = true;
      break;
    }
    case 'slime': {
      const jelly = k.mat(0x5fe07a, { roughness: 0.15, transparent: true, opacity: 0.82, emissive: 0x1aa03a, emissiveIntensity: 0.25 });
      k.box(g, 0.66, 0.5, 0.62, jelly, 0, 0.25, 0);
      k.box(g, 0.5, 0.12, 0.5, jelly, 0, 0.55, 0, false);
      k.box(g, 0.26, 0.22, 0.26, 0x2fae4a, 0, 0.24, 0, false);
      const face = new THREE.Group();
      k.head(face, 0.4, 0.26, 0.02, 0x5fe07a, { bg: '#7ff090', eyes: 'big', mouth: 'smile' }, 0, 0, 0);
      face.position.set(0, 0.32, 0.31);
      g.add(face);
      k.box(g, 0.08, 0.08, 0.08, 0xffffff, -0.18, 0.46, 0.2, false);
      g.userData['squish'] = true;
      break;
    }
    case 'robot': {
      k.head(g, 0.5, 0.42, 0.42, 0xbfc6d6, { bg: '#bfc6d6', eyes: 'screen', mouth: 'none' }, 0, 0.88, 0);
      k.box(g, 0.04, 0.16, 0.04, 0x8a92a6, 0, 1.16, 0);
      const bulb = k.box(g, 0.1, 0.1, 0.1, k.mat(0xff4a4a, { emissive: 0xff2020, emissiveIntensity: 1.5 }), 0, 1.27, 0);
      bulb.name = 'bulb';
      for (const sx of [-1, 1]) k.box(g, 0.06, 0.14, 0.14, 0x8a92a6, sx * 0.27, 0.88, 0);
      k.box(g, 0.5, 0.46, 0.34, 0x9aa4ba, 0, 0.44, 0);
      k.box(g, 0.24, 0.16, 0.04, 0x1c2a3a, 0, 0.5, 0.18, false);
      k.box(g, 0.06, 0.06, 0.02, k.mat(0xffd23a, { emissive: 0xffb000, emissiveIntensity: 1 }), -0.05, 0.5, 0.2, false);
      k.box(g, 0.06, 0.06, 0.02, k.mat(0x5ff0ff, { emissive: 0x20c0ff, emissiveIntensity: 1 }), 0.05, 0.5, 0.2, false);
      limbs(k, g, 0x8a92a6, 0xbfc6d6, 0x8a92a6, 0x5a6278);
      break;
    }
    case 'chick': {
      k.head(g, 0.36, 0.34, 0.34, 0xffe04a, { bg: '#ffe04a', mouth: 'beak' }, 0, 0.5, 0);
      k.box(g, 0.06, 0.08, 0.06, 0xffe04a, 0, 0.71, 0);
      k.box(g, 0.4, 0.3, 0.36, 0xffe04a, 0, 0.2, 0);
      for (const sx of [-1, 1]) {
        const w = new THREE.Group();
        k.box(w, 0.06, 0.16, 0.2, 0xf8c820, 0, -0.06, 0);
        w.position.set(sx * 0.22, 0.28, 0);
        w.name = sx < 0 ? 'armL' : 'armR';
        const l = new THREE.Group();
        k.box(l, 0.04, 0.08, 0.04, 0xff9a1a, 0, -0.03, 0, false);
        k.box(l, 0.1, 0.03, 0.12, 0xff9a1a, 0, -0.07, 0.03, false);
        l.position.set(sx * 0.08, 0.06, 0);
        l.name = sx < 0 ? 'legL' : 'legR';
        g.add(w, l);
      }
      break;
    }
    case 'monster': {
      k.head(g, 0.6, 0.6, 0.5, 0xa070ff, { bg: '#a070ff', eyes: 'one', mouth: 'fang', blush: false }, 0, 0.5, 0);
      for (const sx of [-1, 1]) k.box(g, 0.08, 0.16, 0.08, 0xffe8a0, sx * 0.18, 0.88, 0);
      for (let i = 0; i < 4; i++) k.box(g, 0.06, 0.06, 0.02, 0x8050e0, -0.18 + (i % 2) * 0.36, 0.34 + Math.floor(i / 2) * 0.2, 0.26, false);
      for (const sx of [-1, 1]) {
        const a = new THREE.Group();
        k.box(a, 0.1, 0.22, 0.12, 0xa070ff, 0, -0.08, 0);
        a.position.set(sx * 0.35, 0.56, 0);
        a.name = sx < 0 ? 'armL' : 'armR';
        const l = new THREE.Group();
        k.box(l, 0.16, 0.2, 0.18, 0x8050e0, 0, -0.06, 0);
        l.position.set(sx * 0.15, 0.18, 0);
        l.name = sx < 0 ? 'legL' : 'legR';
        g.add(a, l);
      }
      break;
    }
  }
  return g;
}

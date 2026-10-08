import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * 주차장 둘레 정원 (2026-10-05 사용자 시안 「알록달록 주차장 탈출」) — 짙은 잔디 · 베이지 보도블록 인도 ·
 * 잎이 소복한 둥근 나무 · 덤불(꽃) · 바위 · 돌 화단 · 랜턴 가로등 · 벤치 · 소화전.
 *
 * 나무 · 덤불 = 울퉁불퉁한 잎 덩어리(정점 색: 위 밝게 · 아래 짙게) + 겉에 잎사귀 조각 수백 장(인스턴스 하나로 전부).
 * 판 크기(w · h)와 출구 줄(exitZ)을 받아 판 둘레에 배치한다. 판 좌표: 칸 1 = 1, 가운데 0, 바닥 위면 y = 0, 인도 위면 y = −0.1, 잔디 y = −0.22.
 */

type Lk = <T extends { dispose(): void }>(t: T) => T;

export interface GardenOpts {
  w: number;
  h: number;
  exitZ: number;
  rand: () => number;
}

const GRASS_Y = -0.22;
const WALK_Y = -0.1;

/* ───────────── 잡음 ───────────── */

function hash(x: number, y: number, z: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h & 0xffff) / 65535;
}
function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fy = y - yi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);
  const L = (a: number, b: number, t: number): number => a + (b - a) * t;
  const c = (i: number, j: number, k: number): number => hash(xi + i, yi + j, zi + k);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
function fbm(x: number, y: number, z: number): number {
  return noise3(x, y, z) * 0.55 + noise3(x * 2.1, y * 2.1, z * 2.1) * 0.3 + noise3(x * 4.3, y * 4.3, z * 4.3) * 0.15;
}

/* ───────────── 무늬 (캔버스) ───────────── */

/** 한 번 그린 무늬는 다시 쓴다 (판을 새로 지을 때마다 그리면 느리다) */
const painted = new Map<string, HTMLCanvasElement>();
function once(key: string, make: () => HTMLCanvasElement): HTMLCanvasElement {
  let c = painted.get(key);
  if (!c) painted.set(key, (c = make()));
  return c;
}

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  return c;
}
function tex(lk: Lk, c: HTMLCanvasElement, rep = 1, srgb = true): THREE.CanvasTexture {
  const t = lk(new THREE.CanvasTexture(c));
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep, rep);
  t.anisotropy = 8;
  return t;
}

/** 잔디 — 짙은 풀색 바탕 · 얼룩 · 풀결 · 클로버 점 */
function grassCanvas(): HTMLCanvasElement {
  const S = 512;
  return canvas(S, S, (g) => {
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        // 이음새 없게 — 둘레를 감는 잡음
        const a = (x / S) * Math.PI * 2;
        const b = (y / S) * Math.PI * 2;
        const n = fbm(Math.cos(a) * 1.6 + 10, Math.sin(a) * 1.6 + Math.cos(b) * 1.6, Math.sin(b) * 1.6);
        const k = 0.78 + n * 0.45;
        img.data.set([Math.min(255, 78 * k), Math.min(255, 150 * k), Math.min(255, 52 * k), 255], (y * S + x) * 4);
      }
    g.putImageData(img, 0, 0);
    // 풀결 — 짧은 획 수천 개 (밝은 것 · 짙은 것)
    for (let i = 0; i < 9000; i++) {
      const x = Math.random() * S;
      const y = Math.random() * S;
      const l = 3 + Math.random() * 6;
      const light = Math.random() < 0.5;
      g.strokeStyle = light ? `rgba(170,215,95,${0.25 + Math.random() * 0.3})` : `rgba(30,80,25,${0.2 + Math.random() * 0.25})`;
      g.lineWidth = 1 + Math.random();
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (Math.random() - 0.5) * 3, y - l);
      g.stroke();
    }
    // 작은 꽃점 · 클로버
    for (let i = 0; i < 70; i++) {
      g.fillStyle = ['rgba(255,255,255,0.8)', 'rgba(255,230,120,0.8)', 'rgba(120,180,70,0.9)'][i % 3]!;
      g.beginPath();
      g.arc(Math.random() * S, Math.random() * S, 1.2 + Math.random() * 1.2, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** 보도블록 — 베이지 벽돌을 엇갈려 · 둥근 모서리 · 블록마다 다른 색 · 줄눈 (bump 는 밝기 그대로) */
function paverCanvas(bump: boolean): HTMLCanvasElement {
  const S = 512;
  const bw = 64;
  const bh = 32;
  let sd = 7;
  const r = (): number => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  return canvas(S, S, (g) => {
    g.fillStyle = bump ? '#202020' : '#9c8f7c';
    g.fillRect(0, 0, S, S);
    const cols = ['#e6d8c0', '#dccbb0', '#eadfca', '#d6c4a6', '#e2d2b6', '#cfbd9e'];
    for (let y = 0; y < S / bh; y++)
      for (let x = -1; x <= S / bw; x++) {
        const ox = x * bw + (y % 2) * (bw / 2) + 2;
        const oy = y * bh + 2;
        const w = bw - 4;
        const h = bh - 4;
        const rr = 6;
        g.beginPath();
        g.moveTo(ox + rr, oy);
        g.arcTo(ox + w, oy, ox + w, oy + h, rr);
        g.arcTo(ox + w, oy + h, ox, oy + h, rr);
        g.arcTo(ox, oy + h, ox, oy, rr);
        g.arcTo(ox, oy, ox + w, oy, rr);
        g.closePath();
        if (bump) {
          const gr = g.createLinearGradient(ox, oy, ox, oy + h);
          gr.addColorStop(0, '#d8d8d8');
          gr.addColorStop(0.5, '#ffffff');
          gr.addColorStop(1, '#bcbcbc');
          g.fillStyle = gr;
        } else g.fillStyle = cols[Math.floor(r() * cols.length)]!;
        g.fill();
        if (!bump) {
          // 블록 위 얼룩 · 위쪽 밝은 테
          for (let k = 0; k < 6; k++) {
            g.fillStyle = `rgba(${r() < 0.5 ? '120,100,70' : '255,250,235'},${0.06 + r() * 0.08})`;
            g.beginPath();
            g.arc(ox + r() * w, oy + r() * h, 2 + r() * 6, 0, Math.PI * 2);
            g.fill();
          }
          g.strokeStyle = 'rgba(255,255,255,0.35)';
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(ox + rr, oy + 1.5);
          g.lineTo(ox + w - rr, oy + 1.5);
          g.stroke();
        }
      }
  });
}

/** 잎사귀 한 장 (알파) — 끝이 뾰족한 둥근 잎 · 가운데 잎맥 · 위 밝게 */
function leafCanvas(): HTMLCanvasElement {
  return canvas(64, 64, (g) => {
    g.translate(32, 32);
    const gr = g.createLinearGradient(0, -30, 0, 30);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(1, '#b8b8b8');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(0, -30);
    g.bezierCurveTo(22, -18, 22, 14, 0, 30);
    g.bezierCurveTo(-22, 14, -22, -18, 0, -30);
    g.fill();
    g.strokeStyle = 'rgba(80,80,80,0.5)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -24);
    g.lineTo(0, 26);
    g.stroke();
  });
}

/** 꽃 한 송이 (알파) — 다섯 꽃잎(흰색, 인스턴스 색으로 물듦) + 노란 속 */
function flowerCanvas(): HTMLCanvasElement {
  return canvas(64, 64, (g) => {
    g.translate(32, 32);
    for (let i = 0; i < 5; i++) {
      g.save();
      g.rotate((i / 5) * Math.PI * 2);
      const gr = g.createRadialGradient(0, -14, 2, 0, -14, 16);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(1, '#e8e8e8');
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(0, -15, 10, 15, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    g.fillStyle = '#ffe9a0';
    g.beginPath();
    g.arc(0, 0, 8, 0, Math.PI * 2);
    g.fill();
  });
}

/* ───────────── 잎 덩어리 (모듈에 한 번만) ───────────── */

const LEAF_PAL = [
  [0x4c9c32, 0x235a1a],
  [0x62b23e, 0x2e6a20],
  [0x56a636, 0x22561a],
  [0x78c24a, 0x3a7426],
];
const clumpCache = new Map<string, THREE.BufferGeometry>();
/** 모양 shape(0~3) · 색 pal 의 잎 덩어리 — 판을 새로 지어도 다시 쓰므로 버리지 않는다 */
function clumpGeometry(shape: number, pal: number): THREE.BufferGeometry {
  const key = shape + ':' + pal;
  let g = clumpCache.get(key);
  if (g) return g;
  let base = clumpCache.get(shape + ':base');
  if (!base) {
    base = new THREE.IcosahedronGeometry(1, 4);
    const pos = base.attributes['position'] as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    const seed = shape * 7.3;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      v.multiplyScalar(0.84 + fbm(v.x * 1.8 + seed, v.y * 1.8, v.z * 1.8 - seed) * 0.32);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    base.computeVertexNormals();
    clumpCache.set(shape + ':base', base);
  }
  g = base.clone();
  const pos = g.attributes['position'] as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const cl = new THREE.Color(LEAF_PAL[pal]![0]);
  const cd = new THREE.Color(LEAF_PAL[pal]![1]);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const yy = pos.getY(i);
    const t = THREE.MathUtils.clamp(yy * 0.5 + 0.55, 0, 1);
    c.copy(cd).lerp(cl, t * t);
    const j = 0.9 + noise3(pos.getX(i) * 4, yy * 4, pos.getZ(i) * 4) * 0.2;
    col.set([c.r * j, c.g * j, c.b * j], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  clumpCache.set(key, g);
  return g;
}

/* ───────────── 짓기 ───────────── */

interface Card {
  m: THREE.Matrix4;
  c: THREE.Color;
}

export function buildGarden(level: THREE.Group, o: GardenOpts, lk: Lk): void {
  const { w, h, exitZ, rand: r } = o;
  const std = (c: number, p: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial => lk(new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...p }));
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = level, shadow = true): THREE.Mesh => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const rbox = (sx: number, sy: number, sz: number, rad: number): THREE.BufferGeometry => lk(new RoundedBoxGeometry(sx, sy, sz, 3, Math.min(rad, sx / 2 - 1e-3, sy / 2 - 1e-3, sz / 2 - 1e-3)));
  const hw = w / 2 + 0.15;
  const hh = h / 2 + 0.15;
  const WW = w + 2.2; // 인도 바깥 크기
  const WH = h + 2.2;

  /* 잔디 */
  const gt = tex(lk, once('grass', grassCanvas), 9);
  const grass = add(lk(new THREE.PlaneGeometry(60, 60)), std(0xffffff, { map: gt, roughness: 0.95 }), 0, GRASS_Y, 0, level, false);
  grass.rotation.x = -Math.PI / 2;

  /* 인도 — 보도블록 판 + 둥근 돌 테 */
  const pav = tex(lk, once('paver', () => paverCanvas(false)), 1);
  const pavB = tex(lk, once('paverB', () => paverCanvas(true)), 1, false);
  pav.repeat.set(WW / 3.4, WH / 3.4);
  pavB.repeat.copy(pav.repeat);
  add(rbox(WW, 0.14, WH, 0.05), std(0xffffff, { map: pav, bumpMap: pavB, bumpScale: 2.2, roughness: 0.85 }), 0, WALK_Y - 0.07, 0, level, false);
  const kerbM = std(0xd9d2c4, { roughness: 0.75 });
  for (const [x, z, sx, sz] of [
    [0, -WH / 2, WW + 0.14, 0.14],
    [0, WH / 2, WW + 0.14, 0.14],
    [-WW / 2, 0, 0.14, WH],
    [WW / 2, 0, 0.14, WH],
  ] as const) {
    // 출구 길이 지나는 오른쪽 테는 길 자리를 비운다
    if (x > 0) {
      const z0 = -WH / 2;
      const z1 = WH / 2;
      const a = exitZ - 0.55;
      const b = exitZ + 0.55;
      if (a > z0) add(rbox(sx, 0.18, a - z0, 0.05), kerbM, x, WALK_Y - 0.05, (z0 + a) / 2);
      if (b < z1) add(rbox(sx, 0.18, z1 - b, 0.05), kerbM, x, WALK_Y - 0.05, (b + z1) / 2);
      continue;
    }
    add(rbox(sx, 0.18, sz, 0.05), kerbM, x, WALK_Y - 0.05, z);
  }

  /* 잎 · 꽃 인스턴스 모음 */
  const leaves: Card[] = [];
  const flowers: Card[] = [];
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 0, 1);
  const tmpN = new THREE.Vector3();
  const card = (list: Card[], p: THREE.Vector3, n: THREE.Vector3, size: number, col: THREE.Color, twist: number): void => {
    q.setFromUnitVectors(up, n);
    const tw = new THREE.Quaternion().setFromAxisAngle(n, twist);
    const m = new THREE.Matrix4().compose(p, tw.multiply(q), new THREE.Vector3(size, size, size));
    list.push({ m, c: col });
  };

  /** 잎 덩어리 — 울퉁불퉁한 공 (정점 색: 위 밝게 · 아래 짙게) + 겉 잎사귀 */
  const clump = (parent: THREE.Object3D, x: number, y: number, z: number, s: number, pal: number, nLeaves: number, sy = 1): void => {
    const g = clumpGeometry(Math.floor(r() * 4), pal % LEAF_PAL.length);
    const pos = g.attributes['position'] as THREE.BufferAttribute;
    const [lite, dark] = LEAF_PAL[pal % LEAF_PAL.length]!;
    const cl = new THREE.Color(lite);
    const cd = new THREE.Color(dark);
    const mesh = add(g, foliageM, x, y, z, parent);
    mesh.scale.set(s, s * sy, s);
    // 겉 잎사귀 — 위쪽 · 바깥쪽에 많이
    parent.updateMatrixWorld(true);
    mesh.updateMatrixWorld(true);
    for (let k = 0; k < nLeaves; k++) {
      const i = Math.floor(r() * pos.count);
      const p = new THREE.Vector3().fromBufferAttribute(pos, i);
      tmpN.copy(p).normalize();
      if (tmpN.y < -0.35 && r() < 0.8) continue;
      p.multiplyScalar(1.0 + r() * 0.08);
      p.applyMatrix4(mesh.matrixWorld);
      level.worldToLocal(p);
      // 잎 면은 바깥을 보되 비스듬히 — 겉으로 삐죽 나와 소복한 테두리
      const n = tmpN.clone().add(new THREE.Vector3((r() - 0.5) * 1.6, (r() - 0.5) * 1.2 + 0.3, (r() - 0.5) * 1.6)).normalize();
      const t = THREE.MathUtils.clamp(tmpN.y * 0.5 + 0.6, 0, 1);
      const lc = cd.clone().lerp(cl, t).multiplyScalar(0.88 + r() * 0.36);
      card(leaves, p, n, s * (0.3 + r() * 0.14), lc, r() * Math.PI * 2);
    }
  };
  const foliageM = std(0xffffff, { vertexColors: true, roughness: 0.85 });

  /** 둥근 나무 — 굽은 줄기 · 가지 · 큰 잎 덩어리 대여섯 */
  const barkM = std(0x7a5234, { roughness: 0.9 });
  const tree = (x: number, z: number, s: number): void => {
    const g = new THREE.Group();
    g.position.set(x, GRASS_Y, z);
    level.add(g);
    const trunkH = 0.55 * s;
    const trunk = add(lk(new THREE.CylinderGeometry(0.07 * s, 0.12 * s, trunkH, 10)), barkM, 0, trunkH / 2, 0, g);
    trunk.rotation.z = (r() - 0.5) * 0.15;
    // 뿌리 퍼짐
    const root = add(lk(new THREE.ConeGeometry(0.2 * s, 0.14 * s, 10)), barkM, 0, 0.05 * s, 0, g);
    root.scale.y = 0.8;
    for (let k = 0; k < 2; k++) {
      const br = add(lk(new THREE.CylinderGeometry(0.025 * s, 0.05 * s, 0.4 * s, 6)), barkM, (k ? 1 : -1) * 0.1 * s, trunkH + 0.05 * s, 0, g);
      br.rotation.z = (k ? -1 : 1) * 0.7;
    }
    const pal = Math.floor(r() * 4);
    const n = 5 + Math.floor(r() * 3);
    const top = trunkH + 0.42 * s;
    clump(g, 0, top + 0.12 * s, 0, 0.5 * s, pal, Math.round(260 * s));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + r() * 0.5;
      const rad = (0.32 + r() * 0.12) * s;
      clump(g, Math.cos(a) * rad, top - 0.05 * s + r() * 0.25 * s, Math.sin(a) * rad, (0.33 + r() * 0.1) * s, pal + (k % 2), Math.round(130 * s));
    }
  };

  /** 덤불 — 낮게 퍼진 잎 덩어리 셋 ~ 넷 (꽃이 핀 것도) */
  const flowerCols = [0xff6f9a, 0xffffff, 0xffd84a, 0xff8a4a, 0xc890ff, 0xff4a5a];
  const bush = (x: number, z: number, s: number, bloom: boolean): void => {
    const g = new THREE.Group();
    g.position.set(x, GRASS_Y, z);
    level.add(g);
    const pal = Math.floor(r() * 4);
    const n = 3 + Math.floor(r() * 2);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + r();
      clump(g, Math.cos(a) * 0.18 * s, 0.16 * s, Math.sin(a) * 0.14 * s, (0.22 + r() * 0.07) * s, pal, Math.round(80 * s), 0.8);
    }
    clump(g, 0, 0.24 * s, 0, 0.26 * s, pal, Math.round(100 * s), 0.85);
    if (bloom) {
      const fc = new THREE.Color(flowerCols[Math.floor(r() * flowerCols.length)]!);
      for (let k = 0; k < 14 * s; k++) {
        const a = r() * Math.PI * 2;
        const el = r() * 1.1;
        const nrm = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el) + 0.2, Math.sin(a) * Math.cos(el)).normalize();
        const p = new THREE.Vector3(x + nrm.x * 0.36 * s, GRASS_Y + 0.2 * s + nrm.y * 0.26 * s, z + nrm.z * 0.3 * s);
        card(flowers, p, nrm, 0.09 * s, fc, r() * 6);
      }
    }
  };

  /** 바위 — 둥글게 깎인 회색 돌 · 이끼 */
  const rockGeo = (() => {
    const g = new THREE.IcosahedronGeometry(1, 3);
    const pos = g.attributes['position'] as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = fbm(v.x * 1.3 + 3, v.y * 1.3, v.z * 1.3);
      v.multiplyScalar(0.8 + n * 0.4);
      v.y = Math.max(v.y, -0.3) * 0.75;
      pos.setXYZ(i, v.x, v.y, v.z);
      const moss = THREE.MathUtils.smoothstep(v.y, 0.25, 0.6) * (noise3(v.x * 3, v.y * 3, v.z * 3) > 0.45 ? 1 : 0.3);
      const gray = 0.27 + noise3(v.x * 5, v.y * 5, v.z * 5) * 0.14;
      col.set([gray * 1.04 * (1 - moss) + 0.26 * moss, gray * (1 - moss) + 0.42 * moss, gray * 0.94 * (1 - moss) + 0.18 * moss], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    return lk(g);
  })();
  const rockM = std(0xffffff, { vertexColors: true, roughness: 0.95, envMapIntensity: 0.35 });
  const rock = (x: number, z: number, s: number): void => {
    const m = add(rockGeo, rockM, x, GRASS_Y + 0.02, z);
    m.scale.set(s * (0.9 + r() * 0.4), s * (0.7 + r() * 0.3), s * (0.8 + r() * 0.3));
    m.rotation.y = r() * Math.PI * 2;
  };

  /** 돌 화단 — 크림색 돌 상자 · 흙 · 잎 · 꽃 */
  const stoneM = std(0xe8e0d0, { roughness: 0.8 });
  const planter = (x: number, z: number, len: number): void => {
    const g = new THREE.Group();
    g.position.set(x, WALK_Y, z);
    level.add(g);
    add(rbox(len, 0.26, 0.42, 0.05), stoneM, 0, 0.13, 0, g);
    add(rbox(len - 0.08, 0.02, 0.34, 0.01), std(0x5a3e28, { roughness: 1 }), 0, 0.255, 0, g, false);
    const nb = Math.round(len / 0.22);
    for (let k = 0; k < nb; k++) clump(g, -len / 2 + 0.12 + (k * (len - 0.24)) / Math.max(1, nb - 1), 0.3, (r() - 0.5) * 0.08, 0.1, Math.floor(r() * 4), 14, 0.7);
    for (let k = 0; k < nb * 3; k++) {
      const fc = new THREE.Color(flowerCols[Math.floor(r() * flowerCols.length)]!);
      const p = new THREE.Vector3(x - len / 2 + 0.08 + r() * (len - 0.16), WALK_Y + 0.36 + r() * 0.05, z + (r() - 0.5) * 0.3);
      card(flowers, p, new THREE.Vector3((r() - 0.5) * 0.5, 1, (r() - 0.5) * 0.5 + 0.3).normalize(), 0.08, fc, r() * 6);
    }
  };

  /** 랜턴 가로등 — 검은 기둥 · 받침 · 유리 등 상자 · 지붕 */
  const ironM = std(0x23262e, { roughness: 0.4, metalness: 0.6 });
  const glowM = lk(new THREE.MeshStandardMaterial({ color: 0xfff1c8, emissive: 0xffd88a, emissiveIntensity: 1.8, roughness: 0.2 }));
  const lamp = (x: number, z: number): void => {
    const g = new THREE.Group();
    g.position.set(x, WALK_Y, z);
    level.add(g);
    add(lk(new THREE.CylinderGeometry(0.11, 0.14, 0.12, 12)), ironM, 0, 0.06, 0, g);
    add(lk(new THREE.CylinderGeometry(0.04, 0.055, 1.25, 10)), ironM, 0, 0.7, 0, g);
    add(lk(new THREE.CylinderGeometry(0.07, 0.05, 0.06, 10)), ironM, 0, 1.33, 0, g);
    add(rbox(0.18, 0.2, 0.18, 0.02), glowM, 0, 1.47, 0, g, false);
    for (const [dx, dz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ] as const)
      add(rbox(0.025, 0.22, 0.025, 0.008), ironM, dx * 0.095, 1.47, dz * 0.095, g);
    const roof = add(lk(new THREE.ConeGeometry(0.17, 0.12, 4)), ironM, 0, 1.63, 0, g);
    roof.rotation.y = Math.PI / 4;
    add(lk(new THREE.SphereGeometry(0.025, 8, 6)), ironM, 0, 1.7, 0, g);
  };

  /** 벤치 — 나무 판 · 검은 쇠 다리 */
  const woodM = std(0xb87a46, { roughness: 0.7 });
  const bench = (x: number, z: number, rot: number): void => {
    const g = new THREE.Group();
    g.position.set(x, WALK_Y, z);
    g.rotation.y = rot;
    level.add(g);
    for (let k = 0; k < 3; k++) add(rbox(0.95, 0.035, 0.09, 0.012), woodM, 0, 0.24, -0.11 + k * 0.105, g);
    for (let k = 0; k < 2; k++) add(rbox(0.95, 0.08, 0.03, 0.012), woodM, 0, 0.36 + k * 0.1, -0.2, g).rotation.x = -0.15;
    for (const s of [-1, 1]) {
      add(rbox(0.05, 0.24, 0.3, 0.015), ironM, s * 0.4, 0.12, -0.04, g);
      add(rbox(0.04, 0.3, 0.04, 0.012), ironM, s * 0.4, 0.38, -0.21, g);
    }
  };

  /** 소화전 */
  const hydrant = (x: number, z: number): void => {
    const g = new THREE.Group();
    g.position.set(x, WALK_Y, z);
    level.add(g);
    const red = lk(new THREE.MeshPhysicalMaterial({ color: 0xd8252a, roughness: 0.35, clearcoat: 0.8 }));
    add(lk(new THREE.CylinderGeometry(0.12, 0.13, 0.05, 14)), red, 0, 0.025, 0, g);
    add(lk(new THREE.CylinderGeometry(0.085, 0.095, 0.32, 14)), red, 0, 0.21, 0, g);
    add(lk(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 14)), red, 0, 0.36, 0, g);
    add(lk(new THREE.SphereGeometry(0.085, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)), red, 0, 0.38, 0, g);
    add(lk(new THREE.CylinderGeometry(0.02, 0.02, 0.04, 8)), ironM, 0, 0.47, 0, g);
    for (const s of [-1, 1]) {
      const n = add(lk(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 10)), red, s * 0.1, 0.25, 0, g);
      n.rotation.z = Math.PI / 2;
    }
  };

  /* ── 배치 ── */
  // 인도 위: 가로등 네 귀 · 벤치 · 화단 · 소화전
  lamp(-WW / 2 + 0.35, -WH / 2 + 0.35);
  lamp(-WW / 2 + 0.35, WH / 2 - 0.35);
  lamp(WW / 2 - 0.35, WH / 2 - 0.35);
  lamp(WW / 2 - 0.35, -WH / 2 + 0.35);
  bench(-0.4, -hh - 0.62, 0);
  bench(-hw - 0.62, 0.6, Math.PI / 2);
  planter(0.9, -hh - 0.62, 1.0);
  planter(-hw + 1.0, hh + 0.62, 1.1);
  hydrant(hw + 0.6, -hh - 0.55);

  // 잔디: 판 둘레에 나무 · 덤불 · 바위 (출구 길 · 판 앞쪽 시야는 비움)
  const spots: [number, number][] = [];
  const free = (x: number, z: number, d: number): boolean => spots.every(([sx, sz]) => Math.hypot(sx - x, sz - z) >= d);
  const inWalk = (x: number, z: number, m: number): boolean => Math.abs(x) < WW / 2 + m && Math.abs(z) < WH / 2 + m;
  const onRoad = (x: number, z: number): boolean => x > 0 && Math.abs(z - exitZ) < 1.7;
  // 인도 가장자리를 따라 덤불 울타리 (뒤 · 왼쪽)
  for (let x = -WW / 2 + 0.6; x < WW / 2; x += 0.75 + r() * 0.3) {
    const z = -WH / 2 - 0.45;
    bush(x, z, 0.85 + r() * 0.3, r() < 0.4);
    spots.push([x, z]);
  }
  for (let z = -WH / 2 + 0.8; z < WH / 2 - 0.3; z += 0.8 + r() * 0.3) {
    const x = -WW / 2 - 0.45;
    bush(x, z, 0.8 + r() * 0.3, r() < 0.4);
    spots.push([x, z]);
  }
  for (let tries = 0; tries < 900 && spots.length < 120; tries++) {
    const x = (r() - 0.5) * (WW + 16);
    const z = (r() - 0.5) * (WH + 11);
    if (inWalk(x, z, 0.5) || onRoad(x, z)) continue;
    const front = z > WH / 2; // 화면 아래(카메라 쪽) — 큰 나무가 판을 가리지 않게
    const near = Math.max(Math.abs(x) - WW / 2, Math.abs(z) - WH / 2);
    const k = r();
    if (k < 0.42 && !(front && near < 2.2)) {
      if (!free(x, z, 1.25)) continue;
      tree(x, z, 0.85 + r() * 0.45 + Math.min(0.3, near * 0.05));
      spots.push([x, z]);
    } else if (k < 0.8) {
      if (!free(x, z, 0.8)) continue;
      bush(x, z, 0.8 + r() * 0.5, r() < 0.35);
      spots.push([x, z]);
    } else {
      if (!free(x, z, 0.6)) continue;
      rock(x, z, 0.18 + r() * 0.18);
      if (r() < 0.5) rock(x + 0.25, z + 0.1, 0.1 + r() * 0.08);
      spots.push([x, z]);
    }
  }
  // 잔디 위 작은 꽃 무리
  for (let k = 0; k < 40; k++) {
    const cx = (r() - 0.5) * (WW + 14);
    const cz = (r() - 0.5) * (WH + 10);
    if (inWalk(cx, cz, 0.3) || onRoad(cx, cz)) continue;
    const fc = new THREE.Color(flowerCols[k % flowerCols.length]!);
    for (let i = 0; i < 7; i++) {
      const p = new THREE.Vector3(cx + (r() - 0.5) * 0.5, GRASS_Y + 0.03, cz + (r() - 0.5) * 0.5);
      card(flowers, p, new THREE.Vector3((r() - 0.5) * 0.4, 1, (r() - 0.5) * 0.4).normalize(), 0.07, fc, r() * 6);
    }
  }

  /* 잎 · 꽃 인스턴스 만들기 */
  const leafT = tex(lk, once('leaf', leafCanvas));
  const leafM = std(0xffffff, { map: leafT, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75 });
  const flowerT = tex(lk, once('flower', flowerCanvas));
  const flowerM = std(0xffffff, { map: flowerT, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 });
  for (const [list, m] of [
    [leaves, leafM],
    [flowers, flowerM],
  ] as const) {
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(lk(new THREE.PlaneGeometry(1, 1)), m, list.length);
    list.forEach((cd, i) => {
      im.setMatrixAt(i, cd.m);
      im.setColorAt(i, cd.c);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = m === leafM;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    level.add(im);
  }
}

/** 아스팔트 — 짙은 회색 · 잔 알갱이 · 얼룩 (칸 하나에 한 장, lines 면 왼쪽 · 위 가장자리에 흰 주차선) */
export function asphaltTexture(lk: Lk, lines: boolean): THREE.CanvasTexture {
  const S = 256;
  const c = once('asphalt' + lines, () => canvas(S, S, (g) => {
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const n = fbm(x / 40, y / 40, 3.3);
        const grain = Math.random();
        let v = 70 + n * 26 + (grain - 0.5) * 22;
        if (grain > 0.985) v += 40;
        img.data.set([v * 0.94, v * 0.96, v * 1.04, 255], (y * S + x) * 4);
      }
    g.putImageData(img, 0, 0);
    if (!lines) return;
    // 주차선 (왼쪽 · 위) — 살짝 닳은 흰 선
    g.fillStyle = 'rgba(245,245,240,0.95)';
    g.fillRect(0, 0, S, 7);
    g.fillRect(0, 0, 7, S);
    for (let i = 0; i < 160; i++) {
      g.fillStyle = 'rgba(80,80,90,0.5)';
      const t = Math.random() * S;
      const d = Math.random() * 7;
      g.fillRect(Math.random() < 0.5 ? t : d, Math.random() < 0.5 ? d : t, 2, 2);
    }
  }));
  return tex(lk, c, 1);
}

/** 경계석 무늬 — 노랑 · 검정 빗금 (살짝 닳음) */
export function hazardTexture(lk: Lk): THREE.CanvasTexture {
  const c = once('hazard', () => canvas(256, 64, (g) => {
    g.fillStyle = '#ffc21a';
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#23242a';
    for (let x = -64; x < 320; x += 64) {
      g.beginPath();
      g.moveTo(x, 64);
      g.lineTo(x + 32, 64);
      g.lineTo(x + 64, 0);
      g.lineTo(x + 32, 0);
      g.closePath();
      g.fill();
    }
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.12})`;
      g.fillRect(Math.random() * 256, Math.random() * 64, 2 + Math.random() * 3, 1 + Math.random() * 2);
    }
  }));
  return tex(lk, c, 1);
}

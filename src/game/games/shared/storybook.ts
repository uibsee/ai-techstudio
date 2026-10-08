import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Kit } from '../rivercross/chars';

/**
 * 동화 무대 공용 부품 — 하늘에 뜬 풀밭 섬 · 그림책 하늘 · 진짜처럼 흐르는 물 셰이더 · 블록 캐릭터 도구.
 * (강 건너기에서 다듬은 결을 다른 게임들이 같이 쓴다. 강 건너기 자신은 island.ts 를 그대로 쓴다.)
 */

type Keep = { dispose(): void };
export type Lk = <T extends Keep>(t: T) => T;

export const NOISE = /* glsl */ `
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p){ float v = 0.0; float a = 0.5; for (int k = 0; k < 4; k++){ v += noise(p) * a; p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
`;

const rng = (seed: number): (() => number) => {
  let s = Math.max(1, Math.floor(seed * 7919 + 13) % 2147483647);
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
};

/* ───────────── 그림책 하늘 ───────────── */

export function skyCanvas(seed = 5): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const W = 1024;
  const H = 576;
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#6ab4f0');
  gr.addColorStop(0.55, '#a8d8fa');
  gr.addColorStop(0.85, '#fde8d0');
  gr.addColorStop(1, '#fcd8c0');
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  const sun = g.createRadialGradient(W * 0.22, H * 0.2, 10, W * 0.22, H * 0.2, W * 0.4);
  sun.addColorStop(0, 'rgba(255,250,220,0.95)');
  sun.addColorStop(0.15, 'rgba(255,245,210,0.5)');
  sun.addColorStop(1, 'rgba(255,245,210,0)');
  g.fillStyle = sun;
  g.fillRect(0, 0, W, H);
  const r = rng(seed);
  for (let k = 0; k < 9; k++) {
    const cx = r() * W;
    const cy = H * (0.15 + r() * 0.7);
    const sc = 0.5 + r() * 1.1;
    for (let q = 0; q < 7; q++) {
      const x = cx + (q - 3) * 38 * sc;
      const y = cy - Math.sin((q / 6) * Math.PI) * 30 * sc;
      const rr = (34 + r() * 26) * sc;
      const cg = g.createRadialGradient(x, y - rr * 0.3, rr * 0.2, x, y, rr);
      cg.addColorStop(0, 'rgba(255,255,255,0.95)');
      cg.addColorStop(0.7, 'rgba(244,248,255,0.85)');
      cg.addColorStop(1, 'rgba(225,235,250,0)');
      g.fillStyle = cg;
      g.beginPath();
      g.arc(x, y, rr, 0, Math.PI * 2);
      g.fill();
    }
  }
  return c;
}

/** 밤하늘 — 짙은 남색 · 은하수 띠 · 별 · 둥근 달과 달무리 · 옅은 밤구름 */
export function nightSkyCanvas(seed = 9): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const W = 1600;
  const H = 900;
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#060a24');
  gr.addColorStop(0.55, '#121a48');
  gr.addColorStop(1, '#2a2a62');
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  const r = rng(seed);
  // 은하수 띠
  g.save();
  g.translate(W * 0.5, H * 0.5);
  g.rotate(-0.45);
  for (let k = 0; k < 260; k++) {
    const x = (r() - 0.5) * W * 1.4;
    const y = (r() - 0.5) * 140 * (0.4 + r());
    const rr = 30 + r() * 90;
    const rg = g.createRadialGradient(x, y, 0, x, y, rr);
    rg.addColorStop(0, `rgba(${150 + r() * 60},${130 + r() * 50},255,0.05)`);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  g.restore();
  // 별
  for (let k = 0; k < 900; k++) {
    const x = r() * W;
    const y = r() * H * 0.85;
    const s = r() < 0.92 ? 0.6 + r() * 0.9 : 1.6 + r() * 1.4;
    g.fillStyle = `rgba(255,${235 + r() * 20},${210 + r() * 45},${0.4 + r() * 0.6})`;
    g.beginPath();
    g.arc(x, y, s, 0, Math.PI * 2);
    g.fill();
    if (s > 2) {
      const sg = g.createRadialGradient(x, y, 0, x, y, s * 5);
      sg.addColorStop(0, 'rgba(220,230,255,0.35)');
      sg.addColorStop(1, 'rgba(220,230,255,0)');
      g.fillStyle = sg;
      g.fillRect(x - s * 5, y - s * 5, s * 10, s * 10);
    }
  }
  // 달 — 달무리 · 둥근 달 · 옅은 바다 무늬
  const mx = W * 0.16;
  const my = H * 0.2;
  const halo = g.createRadialGradient(mx, my, 30, mx, my, 280);
  halo.addColorStop(0, 'rgba(255,245,210,0.45)');
  halo.addColorStop(0.3, 'rgba(200,210,255,0.12)');
  halo.addColorStop(1, 'rgba(200,210,255,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, W, H);
  const md = g.createRadialGradient(mx - 18, my - 18, 10, mx, my, 62);
  md.addColorStop(0, '#fffbe8');
  md.addColorStop(1, '#f2e2b0');
  g.fillStyle = md;
  g.beginPath();
  g.arc(mx, my, 60, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(210,190,140,0.35)';
  for (const [dx, dy, rr] of [
    [-18, -8, 14],
    [14, 12, 10],
    [6, -22, 7],
    [-6, 22, 6],
  ] as const) {
    g.beginPath();
    g.arc(mx + dx, my + dy, rr, 0, Math.PI * 2);
    g.fill();
  }
  // 밤구름 (아래쪽, 달빛 테두리)
  for (let k = 0; k < 8; k++) {
    const cx = r() * W;
    const cy = H * (0.6 + r() * 0.35);
    const sc = 0.7 + r() * 1.2;
    for (let q = 0; q < 6; q++) {
      const x = cx + (q - 2.5) * 40 * sc;
      const y = cy - Math.sin((q / 5) * Math.PI) * 26 * sc;
      const rr = (36 + r() * 24) * sc;
      const cg = g.createRadialGradient(x, y - rr * 0.4, rr * 0.1, x, y, rr);
      cg.addColorStop(0, 'rgba(120,130,200,0.55)');
      cg.addColorStop(0.75, 'rgba(60,66,130,0.45)');
      cg.addColorStop(1, 'rgba(40,44,100,0)');
      g.fillStyle = cg;
      g.beginPath();
      g.arc(x, y, rr, 0, Math.PI * 2);
      g.fill();
    }
  }
  return c;
}

/* ───────────── 블록 캐릭터 도구 (꼬마 창고지기 결 · 외곽선 · 32px 도트 얼굴) ───────────── */

export function makeKit(lk: Lk): Kit {
  const round = lk(roundedBox());
  const sharp = lk(new THREE.BoxGeometry(1, 1, 1));
  const outlineMat = lk(new THREE.MeshBasicMaterial({ color: 0x2a1a14, side: THREE.BackSide }));
  const mats = new Map<number, THREE.Material>();
  const mat = (color: number): THREE.Material => {
    let m = mats.get(color);
    if (!m) {
      m = lk(new THREE.MeshStandardMaterial({ color, roughness: 0.55 }));
      mats.set(color, m);
    }
    return m;
  };
  const outline = (m: THREE.Mesh, w: number, h: number, d: number, t: number): void => {
    const o = new THREE.Mesh(m.geometry, outlineMat);
    o.scale.set(1 + (2 * t) / w, 1 + (2 * t) / h, 1 + (2 * t) / d);
    m.add(o);
  };
  return {
    box(parent, w, h, d, color, x, y, z, ol = true) {
      const m = new THREE.Mesh(round, mat(color));
      m.scale.set(w, h, d);
      m.position.set(x, y, z);
      m.castShadow = true;
      if (ol) outline(m, w, h, d, 0.02);
      parent.add(m);
      return m;
    },
    face(parent, w, h, d, color, paint, x, y, z) {
      const c = document.createElement('canvas');
      c.width = c.height = 32;
      const g = c.getContext('2d')!;
      paint((px, py, col) => {
        g.fillStyle = col;
        g.fillRect(px, py, 1, 1);
      });
      const tex = lk(new THREE.CanvasTexture(c));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestMipmapNearestFilter;
      const side = mat(color);
      const front = lk(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }));
      const m = new THREE.Mesh(sharp, [side, side, side, side, front, side]);
      m.scale.set(w, h, d);
      m.position.set(x, y, z);
      m.castShadow = true;
      outline(m, w, h, d, 0.022);
      parent.add(m);
      return m;
    },
  };
}

/** 둥근 모서리 상자 (모서리 0.12) */
function roundedBox(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1, 6, 6, 6);
  const p = g.attributes['position'] as THREE.BufferAttribute;
  const r = 0.12;
  const inner = 0.5 - r;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const c = new THREE.Vector3(THREE.MathUtils.clamp(v.x, -inner, inner), THREE.MathUtils.clamp(v.y, -inner, inner), THREE.MathUtils.clamp(v.z, -inner, inner));
    const d = v.clone().sub(c);
    if (d.lengthSq() > 0) d.setLength(r);
    p.setXYZ(i, c.x + d.x, c.y + d.y, c.z + d.z);
  }
  g.computeVertexNormals();
  return g;
}

/* ───────────── 하늘에 뜬 풀밭 섬 ───────────── */

export interface MeadowOpts {
  halfW: number;
  halfD: number;
  seed: number;
  /** 풀 · 꽃을 비울 곳 (물건이 놓이는 자리) */
  clear: { x: number; z: number; r: number }[];
  /** 섬 둘레 구름 · 먼 섬 */
  sky?: boolean;
  /** 밤 섬 — 모든 색에 곱하는 색 (예: 0x56648c) */
  tint?: number;
  /** 풀 포기 · 꽃 없이 깔끔한 윗면 */
  plain?: boolean;
}

export interface Meadow {
  group: THREE.Group;
  time: { value: number };
  update(t: number): void;
}

export function buildMeadow(o: MeadowOpts, lk: Lk): Meadow {
  const r = rng(o.seed);
  const group = new THREE.Group();
  const time = { value: 0 };
  const ups: ((t: number) => void)[] = [];
  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, shadow = true): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const tint = new THREE.Color(o.tint ?? 0xffffff);
  const std = (color: number, p: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial => lk(new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiply(tint), roughness: 0.85, ...p }));
  const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d')!);
    const t = lk(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  };
  const grassTex = canvasTex(512, 512, (g) => {
    const gr = g.createLinearGradient(0, 0, 512, 512);
    gr.addColorStop(0, '#94d266');
    gr.addColorStop(1, '#84c85a');
    g.fillStyle = gr;
    g.fillRect(0, 0, 512, 512);
    for (let k = 0; k < 18; k++) {
      const x = r() * 512;
      const y = r() * 512;
      const rg = g.createRadialGradient(x, y, 0, x, y, 60 + r() * 80);
      rg.addColorStop(0, r() < 0.5 ? 'rgba(210,245,150,0.25)' : 'rgba(80,150,60,0.18)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg;
      g.fillRect(x - 150, y - 150, 300, 300);
    }
    for (let k = 0; k < 900; k++) {
      g.fillStyle = r() < 0.5 ? 'rgba(255,255,220,0.07)' : 'rgba(40,100,40,0.06)';
      g.beginPath();
      g.arc(r() * 512, r() * 512, 2 + r() * 4, 0, Math.PI * 2);
      g.fill();
    }
  });
  grassTex.repeat.set(0.4, 0.4);
  const soilTex = canvasTex(256, 256, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#8a5a36');
    gr.addColorStop(0.5, '#734a2c');
    gr.addColorStop(1, '#5a3a24');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    for (let k = 0; k < 6; k++) {
      g.fillStyle = k % 2 ? 'rgba(160,110,70,0.35)' : 'rgba(60,35,20,0.3)';
      const y = 30 + k * 40 + r() * 10;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + k) * 4);
      g.lineTo(256, y + 8);
      g.lineTo(0, y + 8);
      g.fill();
    }
    for (let k = 0; k < 90; k++) {
      const x = r() * 256;
      const y = r() * 256;
      const rr = 2 + r() * 7;
      g.fillStyle = ['#a89880', '#8a7a68', '#6a5a4a', '#b8a890'][k % 4]!;
      g.beginPath();
      g.ellipse(x, y, rr, rr * 0.7, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
  });
  soilTex.repeat.set(0.8, 1.6);
  const lipTex = canvasTex(256, 64, (g) => {
    g.fillStyle = '#6ab448';
    g.fillRect(0, 0, 256, 64);
    for (let x = 0; x < 256; x += 3) {
      const h = 30 + r() * 30;
      g.fillStyle = r() < 0.5 ? '#5aa03c' : '#7ac458';
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + 3, 0);
      g.lineTo(x + 1.5, h);
      g.fill();
    }
  });
  lipTex.repeat.set(3, 1);
  const grassMat = std(0xffffff, { map: grassTex, roughness: 0.95 });
  const soilMat = std(0xffffff, { map: soilTex, roughness: 0.95 });
  const lipMat = std(0xffffff, { map: lipTex, roughness: 0.9 });
  const { halfW: hw, halfD: hd } = o;
  const blob = (ex: number, rad: number, wob: number): THREE.Shape => {
    const pts: THREE.Vector2[] = [];
    const x0 = -hw - ex;
    const x1 = hw + ex;
    const z0 = -hd - ex;
    const z1 = hd + ex;
    const push = (x: number, z: number): void => {
      const w = (r() - 0.5) * wob;
      pts.push(new THREE.Vector2(x + w, z + w * 0.6));
    };
    const corner = (cx: number, cz: number, a0: number): void => {
      for (let k = 0; k <= 6; k++) {
        const a = a0 + (k / 6) * (Math.PI / 2);
        push(cx + Math.cos(a) * rad, cz + Math.sin(a) * rad);
      }
    };
    const side = (ax: number, az: number, bx: number, bz: number): void => {
      const n = Math.max(2, Math.round(Math.hypot(bx - ax, bz - az) / 0.4));
      for (let k = 1; k < n; k++) push(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n);
    };
    corner(x1 - rad, z0 + rad, -Math.PI / 2);
    side(x1, z0 + rad, x1, z1 - rad);
    corner(x1 - rad, z1 - rad, 0);
    side(x1 - rad, z1, x0 + rad, z1);
    corner(x0 + rad, z1 - rad, Math.PI / 2);
    side(x0, z1 - rad, x0, z0 + rad);
    corner(x0 + rad, z0 + rad, Math.PI);
    side(x0 + rad, z0, x1 - rad, z0);
    return new THREE.Shape(pts);
  };
  const slab = (shape: THREE.Shape, depth: number, mats: THREE.Material[], y: number): THREE.Mesh => {
    const g = lk(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 6 }));
    g.rotateX(Math.PI / 2);
    g.translate(0, y, 0);
    return add(group, g, mats as unknown as THREE.Material, 0, 0, 0);
  };
  const DEPTH = 0.6;
  slab(blob(0, 0.5, 0.08), DEPTH, [grassMat, soilMat], 0);
  slab(blob(0.04, 0.53, 0.05), 0.07, [grassMat, lipMat], 0.004);
  // 매달린 바위 · 뿌리 · 덩굴
  const rockA = std(0x8a7a6a, { roughness: 0.95, flatShading: true });
  const rockB = std(0x6e6258, { roughness: 0.95, flatShading: true });
  const nRock = Math.round(hw * hd * 2.2) + 4;
  for (let k = 0; k < nRock; k++) {
    const rr = 0.35 + r() * 0.35;
    const sy = 0.7 + r() * 0.4;
    const rk = add(group, lk(new THREE.DodecahedronGeometry(rr, 1)), k % 2 ? rockA : rockB, (r() - 0.5) * hw * 1.6, -DEPTH + 0.05 - rr * sy * 0.9, (r() - 0.5) * hd * 1.4);
    rk.scale.set(1.1 + r() * 0.4, sy, 1.1 + r() * 0.4);
    rk.rotation.set(r() * 3, r() * 3, r() * 3);
  }
  for (let k = 0; k < 5; k++) {
    const st = add(group, lk(new THREE.ConeGeometry(0.25 + r() * 0.2, 1 + r() * 0.8, 7)), rockB, (r() - 0.5) * hw, -DEPTH - 0.8 - r() * 0.3, (r() - 0.5) * hd * 0.8);
    st.rotation.x = Math.PI;
  }
  const rootMat = std(0x7a5236);
  const vineMat = std(0x4f9a3c);
  for (let k = 0; k < 16; k++) {
    const front = r() < 0.6;
    const px = front ? (r() - 0.5) * hw * 1.8 : (r() < 0.5 ? -1 : 1) * (hw + 0.02);
    const pz = front ? hd + 0.02 : (r() - 0.5) * hd * 1.6;
    const len = 0.3 + r() * 0.6;
    const out = front ? new THREE.Vector3(0, 0, 0.04) : new THREE.Vector3(Math.sign(px) * 0.04, 0, 0);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(px, -0.05, pz),
      new THREE.Vector3(px + (r() - 0.5) * 0.1, -0.05 - len * 0.5, pz).add(out),
      new THREE.Vector3(px + (r() - 0.5) * 0.15, -0.05 - len, pz).add(out.clone().multiplyScalar(0.5)),
    ]);
    add(group, lk(new THREE.TubeGeometry(curve, 8, 0.012 + r() * 0.01, 5)), k % 3 ? rootMat : vineMat, 0, 0, 0, false);
    if (k % 3 === 0) {
      const e = curve.getPoint(1);
      add(group, lk(new THREE.SphereGeometry(0.032, 8, 6)), std(0xff7aa0), e.x, e.y, e.z, false);
    }
  }
  const isClear = (x: number, z: number, m: number): boolean => o.clear.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + m);
  const onTop = (x: number, z: number, m: number): boolean => Math.abs(x) < hw - m && Math.abs(z) < hd - m;
  // 풀 포기 (바람에 살랑)
  if (!o.plain) {
    const blade = new THREE.BufferGeometry();
    blade.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.15, 0.55, 0, -0.15, 0.55, 0, 0, 1, 0], 3));
    blade.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0.3, 1, 0, 0.3, 1, 0, 0.3, 1, 0, 0.3, 1, 0, 0.3, 1], 3));
    blade.setIndex([0, 1, 2, 0, 2, 3, 3, 2, 4]);
    lk(blade);
    const mat = std(0xffffff, { side: THREE.DoubleSide, roughness: 0.7 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms['uTime'] = time;
      sh.vertexShader =
        'uniform float uTime;\n' +
        sh.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
        float hh = position.y;
        vec4 ip = instanceMatrix[3];
        float wv = sin(uTime * 1.8 + ip.x * 2.3 + ip.z * 1.7) + 0.5 * sin(uTime * 3.1 + ip.z * 4.0);
        transformed.x += wv * 0.16 * hh * hh;`,
        );
    };
    const tufts = Math.round(hw * hd * 4 * 3.2);
    const per = 9;
    const im = new THREE.InstancedMesh(blade, mat, tufts * per);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    let n = 0;
    for (let k = 0; k < tufts * 6 && n < tufts * per; k++) {
      const tx = (r() - 0.5) * hw * 2;
      const tz = (r() - 0.5) * hd * 2;
      if (!onTop(tx, tz, 0.12) || isClear(tx, tz, 0.1)) continue;
      const base = 0.07 + r() * 0.05;
      const c0 = r() < 0.5 ? 0x62b048 : 0x6cba50;
      for (let b = 0; b < per; b++) {
        const a = (b / per) * Math.PI * 2 + r() * 0.4;
        const d = r() * 0.035;
        q.setFromEuler(new THREE.Euler(Math.sin(a) * 0.35, a, -Math.cos(a) * 0.35));
        const h = base * (0.75 + (1 - d / 0.035) * 0.35);
        m4.compose(new THREE.Vector3(tx + Math.cos(a) * d, 0, tz + Math.sin(a) * d), q, new THREE.Vector3(0.03, h, 1));
        im.setMatrixAt(n, m4);
        im.setColorAt(n, col.setHex(c0).multiplyScalar(0.95 + (h / base) * 0.12));
        n++;
      }
    }
    im.count = n;
    im.receiveShadow = true;
    group.add(im);
  }
  // 꽃 무리
  if (!o.plain) {
    const petal = new THREE.SphereGeometry(1, 8, 6);
    const parts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 6; k++) {
      const g = petal.clone();
      g.scale(0.022, 0.006, 0.012);
      g.translate(0.022, 0, 0);
      g.rotateY((k / 6) * Math.PI * 2);
      parts.push(g);
    }
    const head = lk(mergeGeometries(parts)!);
    parts.forEach((g) => g.dispose());
    petal.dispose();
    const center = lk(new THREE.SphereGeometry(0.012, 8, 6));
    const stem = lk(new THREE.CylinderGeometry(0.003, 0.004, 1, 4));
    stem.translate(0, 0.5, 0);
    const patches = Math.round(hw * hd * 4 * 1.2);
    const N = patches * 4;
    const hm = new THREE.InstancedMesh(head, std(0xffffff, { roughness: 0.5 }), N);
    const cm = new THREE.InstancedMesh(center, std(0xffc830, { roughness: 0.5 }), N);
    const sm = new THREE.InstancedMesh(stem, std(0x4f9a36), N);
    const cols = [0xffffff, 0xffe066, 0xff9ac0, 0xc8a8ff];
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    let n = 0;
    for (let k = 0; k < patches * 6 && n < N; k++) {
      const px = (r() - 0.5) * hw * 2;
      const pz = (r() - 0.5) * hd * 2;
      if (!onTop(px, pz, 0.18) || isClear(px, pz, 0.15)) continue;
      col.setHex(cols[Math.floor(r() * cols.length)]!);
      const cnt = 3 + Math.floor(r() * 2);
      for (let f = 0; f < cnt && n < N; f++) {
        const a = (f / cnt) * Math.PI * 2 + r();
        const x = px + Math.cos(a) * 0.05;
        const z = pz + Math.sin(a) * 0.05;
        const h = 0.08 + r() * 0.05;
        const s = 0.9 + r() * 0.3;
        q.setFromEuler(new THREE.Euler(-0.25, r() * 6, 0));
        m4.compose(new THREE.Vector3(x, h, z), q, new THREE.Vector3(s, s, s));
        hm.setMatrixAt(n, m4);
        m4.compose(new THREE.Vector3(x, h + 0.004, z), q, new THREE.Vector3(s, s, s));
        cm.setMatrixAt(n, m4);
        m4.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion(), new THREE.Vector3(1, h, 1));
        sm.setMatrixAt(n, m4);
        hm.setColorAt(n, col);
        n++;
      }
    }
    for (const im of [hm, cm, sm]) {
      im.count = n;
      group.add(im);
    }
  }
  if (o.sky !== false) {
    const cloudMat = lk(new THREE.MeshStandardMaterial({ color: new THREE.Color(0xffffff).multiply(tint), roughness: 1, emissive: new THREE.Color(0xdfe8f4).multiply(tint), emissiveIntensity: 0.45 }));
    const puff = lk(new THREE.SphereGeometry(1, 16, 12));
    const clouds: THREE.Group[] = [];
    for (let k = 0; k < 7; k++) {
      const g = new THREE.Group();
      for (let q = 0; q < 5; q++) {
        const m = new THREE.Mesh(puff, cloudMat);
        m.scale.setScalar(0.35 + r() * 0.3);
        m.position.set(q * 0.45 - 0.9, Math.sin(q * 1.3) * 0.12, (r() - 0.5) * 0.3);
        g.add(m);
      }
      const ang = (k / 7) * Math.PI * 2;
      g.position.set(Math.cos(ang) * (hw + 1.2 + r() * 2), -1.3 - r() * 1.4, Math.sin(ang) * (hd + 1 + r() * 1.5));
      group.add(g);
      g.userData['dynamic'] = true; // 둥실 움직임 — 합치기(bake.ts)에서 뺀다
      clouds.push(g);
    }
    ups.push((t) => clouds.forEach((c, k) => (c.position.y += Math.sin(t * 0.6 + k) * 0.0006)));
  }
  return {
    group,
    time,
    update(t: number): void {
      time.value = t;
      for (const u of ups) u(t);
    },
  };
}

/* ───────────── 소품 ───────────── */

export function pine(lk: Lk, s = 1): THREE.Group {
  const g = new THREE.Group();
  const std = (c: number, p: THREE.MeshStandardMaterialParameters = {}): THREE.Material => lk(new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...p }));
  const tr = new THREE.Mesh(lk(new THREE.CylinderGeometry(0.04, 0.06, 0.3, 8)), std(0x7a4a2a));
  tr.position.y = 0.15;
  tr.castShadow = true;
  g.add(tr);
  const tiers = [0x2f7a44, 0x3a8a4c, 0x48a058, 0x58b468];
  for (let k = 0; k < 4; k++) {
    const c = new THREE.Mesh(lk(new THREE.ConeGeometry(0.34 - k * 0.07, 0.34, 9)), std(tiers[k]!, { flatShading: true }));
    c.position.y = 0.3 + k * 0.17;
    c.rotation.y = k * 0.4;
    c.castShadow = true;
    g.add(c);
  }
  g.scale.setScalar(s);
  return g;
}

export function bush(lk: Lk, seed = 1): THREE.Group {
  const r = rng(seed);
  const g = new THREE.Group();
  const leaf = lk(new THREE.MeshStandardMaterial({ color: 0x4f9a3c, roughness: 0.8, flatShading: true }));
  const leaf2 = lk(new THREE.MeshStandardMaterial({ color: 0x62b048, roughness: 0.8, flatShading: true }));
  const berry = lk(new THREE.MeshStandardMaterial({ color: 0xe8304a, roughness: 0.3 }));
  for (let k = 0; k < 5; k++) {
    const b = new THREE.Mesh(lk(new THREE.IcosahedronGeometry(0.11 + r() * 0.05, 1)), k % 2 ? leaf : leaf2);
    b.position.set((r() - 0.5) * 0.2, 0.08 + r() * 0.06, (r() - 0.5) * 0.16);
    b.scale.y = 0.8;
    b.castShadow = true;
    g.add(b);
  }
  for (let k = 0; k < 6; k++) {
    const b = new THREE.Mesh(lk(new THREE.SphereGeometry(0.02, 8, 6)), berry);
    b.position.set((r() - 0.5) * 0.26, 0.1 + r() * 0.1, (r() - 0.5) * 0.2 + 0.06);
    g.add(b);
  }
  return g;
}

/* ───────────── 물 셰이더 ───────────── */

/**
 * 흐르는 물 띠 — uv.y 를 따라 흐른다(물줄기 · 개울 · 폭포). 줄무늬 · 흰 물살 · 가장자리 투명.
 * speed 가 클수록 빠르게, foam 은 흰 물살 양.
 */
export function flowMaterial(time: { value: number }, o: { speed?: number; foam?: number; deep?: number; shallow?: number; opacity?: number; along?: number; strands?: number } = {}): THREE.ShaderMaterial {
  const deep = new THREE.Color(o.deep ?? 0x2a86c8);
  const sh = new THREE.Color(o.shallow ?? 0x8ad8f0);
  return new THREE.ShaderMaterial({
    uniforms: { uTime: time, uSpeed: { value: o.speed ?? 2 }, uFoam: { value: o.foam ?? 0.5 }, uDeep: { value: deep }, uShallow: { value: sh }, uOp: { value: o.opacity ?? 0.88 }, uAlong: { value: o.along ?? 3 }, uStrand: { value: o.strands ?? 0 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `uniform float uTime; uniform float uSpeed; uniform float uFoam; uniform vec3 uDeep; uniform vec3 uShallow; uniform float uOp; uniform float uAlong; uniform float uStrand;
      varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      ${NOISE}
      void main(){
        vec2 p = vec2(vUv.x * 6.0, vUv.y * uAlong - uTime * uSpeed);
        float s = fbm(p) * 0.65 + noise(p * vec2(3.0, 2.0)) * 0.35;
        vec3 col = mix(uDeep, uShallow, smoothstep(0.35, 0.75, s));
        float foam = smoothstep(0.72 - uFoam * 0.2, 0.86, noise(vec2(vUv.x * 14.0, vUv.y * uAlong * 2.5 - uTime * uSpeed * 1.4)));
        col = mix(col, vec3(1.0), foam * uFoam);
        // 반짝 (뷰 방향 기준 가짜 반사)
        vec3 V = normalize(cameraPosition - vW);
        float fr = pow(1.0 - abs(dot(normalize(vN), V)), 3.0);
        col += vec3(0.9, 0.97, 1.0) * fr * 0.35;
        float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
        float a = uOp * (0.55 + 0.45 * edge) + foam * 0.2;
        if (uStrand > 0.0) a *= mix(1.0, smoothstep(0.35, 0.7, noise(vec2(vUv.x * uStrand, vUv.y * 2.0 - uTime * 0.3))) * 1.3, 0.85);
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
  });
}

/**
 * 고인 물 표면 (원 · 병 속 수면) — 잔물결 법선 · 프레넬 하늘 반사 · 햇빛 반짝 · 가장자리 물빛 띠,
 * uHit(물이 떨어진 때)부터 퍼지는 동그라미 물결.
 */
export function poolMaterial(time: { value: number }, o: { deep?: number; shallow?: number; opacity?: number; scale?: number; skyLow?: number; skyHigh?: number; sun?: number; bed?: number; bed2?: number; caustic?: number } = {}): THREE.ShaderMaterial & { uniforms: { uHit: { value: number } } } {
  /*
   * 강 건너기 물과 같은 결: 물결 법선(두 겹 흐름) · 프레넬 하늘 반사 · 햇빛 반짝 ·
   * 물 밑 바닥(자갈 · 모래)이 비쳐 보이고 그 위로 일렁이는 빛 그물(코스틱) · 가장자리는 얕아 맑고 가운데는 깊어 짙다.
   */
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uTime: time,
      uHit: { value: -10 },
      uDeep: { value: new THREE.Color(o.deep ?? 0x1a70b8) },
      uShallow: { value: new THREE.Color(o.shallow ?? 0x6ad0e8) },
      uOp: { value: o.opacity ?? 0.95 },
      uScale: { value: o.scale ?? 1 },
      uSkyLow: { value: new THREE.Color(o.skyLow ?? 0xc4e1f9) },
      uSkyHigh: { value: new THREE.Color(o.skyHigh ?? 0x4f8ae8) },
      uSun: { value: new THREE.Color(o.sun ?? 0xfffcf3) },
      uBed: { value: new THREE.Color(o.bed ?? 0xc8b48a) },
      uBed2: { value: new THREE.Color(o.bed2 ?? 0x8a8a7a) },
      uCaus: { value: o.caustic ?? 1 },
    },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vW;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `uniform float uTime; uniform float uHit; uniform vec3 uDeep; uniform vec3 uShallow; uniform float uOp; uniform float uScale; uniform vec3 uSkyLow; uniform vec3 uSkyHigh; uniform vec3 uSun; uniform vec3 uBed; uniform vec3 uBed2; uniform float uCaus;
      varying vec2 vUv; varying vec3 vW;
      ${NOISE}
      vec2 hash2(vec2 p){ return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
      // 자갈 — 셀 거리 (가까운 점까지)
      vec2 cell(vec2 p){
        vec2 i = floor(p); vec2 f = fract(p); float d1 = 8.0; float d2 = 8.0;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 g = vec2(float(x), float(y)); vec2 o = hash2(i + g); float d = length(g + o - f);
          if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
        }
        return vec2(d1, d2 - d1);
      }
      float H(vec2 p){
        float d = length(p);
        float age = uTime - uHit;
        float ring = age > 0.0 && age < 2.0 ? sin((d - age * 0.8) * 40.0) * exp(-abs(d - age * 0.8) * 9.0) * (1.0 - age / 2.0) * 0.8 : 0.0;
        vec2 q = p * uScale;
        float a = fbm(q * 4.0 + vec2(uTime * 0.22, -uTime * 0.15));
        float b = fbm(q * 9.0 + vec2(-uTime * 0.35, uTime * 0.28) + 3.0);
        return a * 0.6 + b * 0.3 + noise(q * 22.0 - uTime * 0.8) * 0.1 + ring;
      }
      vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
      void main(){
        vec2 p = vUv - 0.5;
        float e = 0.003;
        float h = H(p);
        vec3 N = normalize(vec3(-(H(p + vec2(e, 0.0)) - h) / e * 0.02, 1.0, -(H(p + vec2(0.0, e)) - h) / e * 0.02));
        vec3 V = normalize(cameraPosition - vW);
        float F = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        float r = length(p) * 2.0;
        // 깊이 — 가장자리 얕고 가운데 깊다
        float depth = smoothstep(1.0, 0.25, r);
        // 바닥 — 물결에 굴절돼 흔들리는 자갈 · 모래
        vec2 q = (p + N.xz * 0.025 * (0.4 + depth)) * uScale;
        vec2 c = cell(q * 16.0);
        float pebble = smoothstep(0.02, 0.22, c.y);
        float tone = hash2(floor(q * 16.0 + 0.5)).x;
        vec3 bed = mix(uBed2, uBed, tone * 0.7 + 0.3) * (0.75 + 0.25 * pebble) * (0.9 + 0.2 * (1.0 - c.x));
        // 코스틱 — 일렁이는 빛 그물
        vec2 cp = q * 7.0;
        float ca = abs(sin((fbm(cp + vec2(uTime * 0.3, -uTime * 0.45)) - 0.5) * 16.0));
        float cb = abs(sin((fbm(cp * 1.3 + vec2(-uTime * 0.25, uTime * 0.35) + 3.1) - 0.5) * 16.0));
        float caustic = pow(1.0 - min(ca, cb), 4.0);
        bed += uSun * caustic * 0.2 * uCaus * (1.0 - depth * 0.7);
        // 물빛 — 깊을수록 바닥이 덜 보이고 물 색이 짙다
        vec3 water = mix(uShallow, uDeep, depth);
        vec3 col = mix(bed * mix(vec3(1.0), uShallow * 1.6, 0.5), water, clamp(0.25 + depth * 0.7, 0.0, 1.0));
        // 하늘 반사 · 햇빛 반짝
        vec3 R = reflect(-V, N);
        vec3 sky = mix(uSkyLow, uSkyHigh, clamp(R.y, 0.0, 1.0));
        col = mix(col, sky, clamp(F * 1.4, 0.0, 0.85));
        vec3 L = normalize(vec3(-0.45, 0.8, 0.4));
        col += uSun * (pow(max(dot(R, L), 0.0), 160.0) * 2.5 + pow(max(dot(R, L), 0.0), 20.0) * 0.15);
        // 가장자리 — 얕은 물가 거품 띠
        float edge = smoothstep(0.9, 0.99, r) * smoothstep(0.45, 0.7, fbm(p * 30.0 + uTime * 0.4));
        col = mix(col, vec3(0.95, 0.98, 1.0), edge * 0.3);
        gl_FragColor = vec4(col, uOp);
        #include <colorspace_fragment>
      }`,
  });
  return m as THREE.ShaderMaterial & { uniforms: { uHit: { value: number } } };
}

/** 병 속 물기둥 — 위로 갈수록 밝고, 속에서 빛 무늬가 일렁이고, 테두리(프레넬)가 밝다 */
export function bodyWaterMaterial(time: { value: number }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: time },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vW; varying vec3 vL;
      void main(){ vN = normalize(mat3(modelMatrix) * normal); vL = position; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `uniform float uTime; varying vec3 vN; varying vec3 vW; varying vec3 vL;
      ${NOISE}
      void main(){
        vec3 V = normalize(cameraPosition - vW);
        float F = pow(1.0 - abs(dot(normalize(vN), V)), 2.5);
        float y = vL.y + 0.5;
        vec3 col = mix(pow(vec3(0.06, 0.32, 0.62), vec3(2.2)), pow(vec3(0.2, 0.6, 0.86), vec3(2.2)), y);
        vec2 p = vec2(atan(vL.z, vL.x) * 2.0, vW.y * 6.0);
        float a = abs(sin((fbm(p + vec2(uTime * 0.3, -uTime * 0.4)) - 0.5) * 14.0));
        float ca = pow(1.0 - a, 7.0);
        col += vec3(0.3, 0.6, 0.85) * ca * 0.3;
        col += vec3(0.35, 0.6, 0.85) * F * 0.5;
        gl_FragColor = vec4(col, 0.82 + F * 0.15);
        #include <colorspace_fragment>
      }`,
  });
}

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Control, DemoMap, Scene3D } from './types';

/**
 * 견본 — 카메라 5 (i426 ~ i430) · 빛 · 환경 4 (i431 ~ i434)
 * 작은 「하늘에 뜬 블록 마을」 무대 하나를 나눠 쓰고, 견본마다 다른 기술만 바꾼다.
 * 카메라 견본은 오른쪽 아래에 위에서 본 지도(카메라 자리 · 땅에 닿는 시야)를 같은 renderer 로 scissor 해서 그린다.
 * 규칙: 가장자리 흐림 · 비네트 · 심도 없음, Neutral 톤 매핑, 셰이더에 반복문 잡음 없음.
 */

type R = THREE.WebGLRenderer;
const TAU = Math.PI * 2;
const FONT = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const ease = (k: number): number => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
const sstep = (e0: number, e1: number, x: number): number => ease((x - e0) / (e1 - e0));
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
const hash1 = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** 1차원 부드러운 잡음 (-1 ~ 1) — CPU */
function vnoise(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash1(i + seed * 157.3);
  const b = hash1(i + 1 + seed * 157.3);
  const u = f * f * (3 - 2 * f);
  return (a + (b - a) * u) * 2 - 1;
}

/* ───────────── 정리 · renderer 상태 ───────────── */

function disposeMat(m: THREE.Material): void {
  for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
  const u = (m as THREE.ShaderMaterial).uniforms;
  if (u) for (const k of Object.keys(u)) if (u[k]!.value instanceof THREE.Texture) (u[k]!.value as THREE.Texture).dispose();
  m.dispose();
}
function disposeTree(o: THREE.Object3D): void {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach(disposeMat);
    else if (mat) disposeMat(mat);
  });
}
function withState(r: R, fn: () => void): void {
  const ac = r.autoClear;
  const sc = r.getScissorTest();
  const vp = r.getViewport(new THREE.Vector4());
  const sb = r.getScissor(new THREE.Vector4());
  const cc = r.getClearColor(new THREE.Color());
  const ca = r.getClearAlpha();
  const se = r.shadowMap.enabled;
  const st = r.shadowMap.type;
  const tm = r.toneMapping;
  try {
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    fn();
  } finally {
    r.autoClear = ac;
    r.setScissorTest(sc);
    r.setViewport(vp);
    r.setScissor(sb);
    r.setClearColor(cc, ca);
    r.shadowMap.enabled = se;
    r.shadowMap.type = st;
    r.toneMapping = tm;
  }
}
function rect(r: R, x: number, y: number, w: number, h: number): void {
  r.setViewport(x, y, w, h);
  r.setScissor(x, y, w, h);
}

/* ───────────── 텍스처 ───────────── */

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function glowTex(): THREE.CanvasTexture {
  return canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.18, 'rgba(255,255,255,0.75)');
    gr.addColorStop(0.45, 'rgba(255,255,255,0.22)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  });
}

/* ───────────── 하늘 돔 (그라데이션 · 해 · 달 · 별) ───────────── */

interface Sky {
  mesh: THREE.Mesh;
  u: {
    uTop: { value: THREE.Color };
    uHor: { value: THREE.Color };
    uBot: { value: THREE.Color };
    uSun: { value: THREE.Vector3 };
    uSunCol: { value: THREE.Color };
    uSunK: { value: number };
    uMoonK: { value: number };
    uStars: { value: number };
    uTime: { value: number };
    uSpan: { value: number };
  };
}
function makeSky(top: number, hor: number, bot: number): Sky {
  const u = {
    uTop: { value: new THREE.Color(top) },
    uHor: { value: new THREE.Color(hor) },
    uBot: { value: new THREE.Color(bot) },
    uSun: { value: new THREE.Vector3(0.5, 0.6, 0.4).normalize() },
    uSunCol: { value: new THREE.Color(0xfff2d0) },
    uSunK: { value: 0 },
    uMoonK: { value: 0 },
    uStars: { value: 0 },
    uTime: { value: 0 },
    uSpan: { value: 0.55 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uHor, uBot, uSun, uSunCol;
      uniform float uSunK, uMoonK, uStars, uTime, uSpan;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHor, uTop, smoothstep(-0.02, uSpan, h));
        col = mix(col, uBot, smoothstep(0.02, -0.35, h));
        float s = max(dot(d, uSun), 0.0);
        col += uSunCol * (smoothstep(0.9985, 0.9992, s) * 3.0 + pow(s, 14.0) * 0.45 + pow(s, 3.0) * 0.12) * uSunK;
        float m = max(dot(d, -uSun), 0.0);
        col += vec3(0.92, 0.95, 1.0) * smoothstep(0.9990, 0.9994, m) * 1.6 * uMoonK + vec3(0.35, 0.45, 0.8) * pow(m, 30.0) * 0.25 * uMoonK;
        vec3 g = d * 90.0;
        vec3 c = floor(g);
        vec3 f = fract(g) - 0.5;
        float r = fract(sin(dot(c, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        float st = step(0.985, r) * smoothstep(0.32, 0.0, length(f)) * smoothstep(0.0, 0.25, h);
        col += vec3(0.95, 0.97, 1.0) * st * uStars * (0.55 + 0.45 * sin(uTime * 2.5 + r * 60.0));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(80, 32, 16), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return { mesh, u };
}

/* ───────────── 고정 물체 합치기 (그리기 횟수 줄이기 — 모양 그대로) ───────────── */

function mergeStatic(root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true);
  const out = new THREE.Group();
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; recv: boolean; geos: THREE.BufferGeometry[] }>();
  const keep: THREE.Object3D[] = [];
  const src = new Set<THREE.BufferGeometry>();
  const kept = new Set<THREE.BufferGeometry>();
  root.traverse((o) => {
    if (o.userData.keep) {
      keep.push(o);
      o.traverse((c) => {
        const cm = c as THREE.Mesh;
        if (cm.geometry) kept.add(cm.geometry);
      });
      return;
    }
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return;
    let p: THREE.Object3D | null = m.parent;
    while (p) {
      if (p.userData.keep) return;
      p = p.parent;
    }
    src.add(m.geometry);
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position!.count * 2), 2));
    g.clearGroups();
    g.applyMatrix4(m.matrixWorld);
    const key = m.material.uuid + (m.castShadow ? 'c' : '') + (m.receiveShadow ? 'r' : '');
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mat: m.material, cast: m.castShadow, recv: m.receiveShadow, geos: [] }));
    b.geos.push(g);
  });
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    b.geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.recv;
    out.add(mesh);
  }
  for (const o of keep) {
    o.matrixWorld.decompose(o.position, o.quaternion, o.scale);
    out.add(o);
  }
  for (const g of src) if (!kept.has(g)) g.dispose();
  return out;
}

/* ───────────── 블록 마을 무대 ───────────── */

interface HouseSpec {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  rot: number;
  wall: number;
  roof: number;
  name: string;
}
const HOUSES: HouseSpec[] = [
  { x: -3.1, z: -2.0, w: 2.0, d: 1.7, h: 1.45, rot: 0.35, wall: 0xfff1d6, roof: 0xe8574a, name: '빨간 집' },
  { x: 2.7, z: -2.9, w: 2.1, d: 1.6, h: 1.3, rot: -0.45, wall: 0xffe4c8, roof: 0x4a8fe8, name: '파란 집' },
  { x: 3.6, z: 1.5, w: 1.6, d: 1.6, h: 1.75, rot: -1.2, wall: 0xf4f0ff, roof: 0x9b6ae8, name: '보라 집' },
  { x: -3.7, z: 2.3, w: 1.8, d: 1.6, h: 1.2, rot: 0.95, wall: 0xfff6e0, roof: 0xf2a33a, name: '주황 집' },
  { x: 0.1, z: -4.7, w: 1.7, d: 1.4, h: 1.1, rot: 0.0, wall: 0xffeedd, roof: 0x3fb37f, name: '초록 집' },
];
const POND = { x: 0.9, z: 3.8, r: 1.25 };
const ISLAND_R = 7;
/** 마을을 도는 오솔길 (따라가는 카메라의 길) */
const PATH_PTS: [number, number][] = [
  [-1.6, -0.1],
  [-0.6, -2.5],
  [1.0, -3.4],
  [4.6, -1.1],
  [5.2, 3.1],
  [2.9, 5.6],
  [-1.2, 5.3],
  [-1.6, 2.6],
];
function makePath(): THREE.CatmullRomCurve3 {
  return new THREE.CatmullRomCurve3(
    PATH_PTS.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true,
    'centripetal',
  );
}

interface MapItem {
  kind: 'rect' | 'circle';
  x: number;
  z: number;
  w: number;
  d: number;
  rot: number;
  color: number;
}
interface Village {
  group: THREE.Group;
  windows: THREE.Mesh[];
  winMat: THREE.MeshStandardMaterial;
  lampMat: THREE.MeshStandardMaterial;
  lamps: THREE.Vector3[];
  grassMat: THREE.MeshStandardMaterial;
  stoneMat: THREE.MeshStandardMaterial;
  roofMats: THREE.MeshStandardMaterial[];
  leafMats: THREE.MeshStandardMaterial[];
  items: MapItem[];
  houseTop: THREE.Vector3[];
}
function std(color: number, rough = 0.85, metal = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}
function buildVillage(opts: { perWindow?: boolean } = {}): Village {
  const rnd = rng(7);
  const root = new THREE.Group();
  const items: MapItem[] = [];
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = root, cast = true): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  /* 재질 */
  const grassMat = std(0x7cc65a, 0.92);
  const grassDark = std(0x5aa843, 0.95);
  const dirt = std(0x9a6a45, 0.95);
  const dirtDark = std(0x6e4a33, 1);
  const rock = std(0x8c8a96, 0.9);
  const stoneMat = std(0xe2dacb, 0.8);
  const stone2 = std(0xcfc6b4, 0.85);
  const water = new THREE.MeshStandardMaterial({ color: 0x4fb3e8, roughness: 0.12, metalness: 0.15 });
  const lily = std(0x4fae4a, 0.7);
  const trunk = std(0x8a5a3a, 0.9);
  const leafMats = [std(0x5cbf55, 0.8), std(0x48aa4a, 0.8), std(0x2f8f5a, 0.8), std(0x7bd06a, 0.8)];
  const white = std(0xfdf8ef, 0.7);
  const door = std(0x8a5236, 0.75);
  const gold = std(0xf2c14e, 0.35, 0.6);
  const brick = std(0xb5654a, 0.9);
  const pole = std(0x3a3f55, 0.5, 0.4);
  const flowerMats = [std(0xff7fa8, 0.6), std(0xffd84a, 0.6), std(0xffffff, 0.6), std(0xb48cff, 0.6)];
  const winMat = new THREE.MeshStandardMaterial({ color: 0x9fd4ff, roughness: 0.15, metalness: 0.1, emissive: 0xffc46b, emissiveIntensity: 0 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff1c8, roughness: 0.3, emissive: 0xffc46b, emissiveIntensity: 0.4 });
  const roofMats: THREE.MeshStandardMaterial[] = [];
  const windows: THREE.Mesh[] = [];

  /* 공유 모양 */
  const sph = new THREE.SphereGeometry(1, 16, 12);
  const sphLo = new THREE.SphereGeometry(1, 8, 6);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const rbox = new RoundedBoxGeometry(1, 1, 1, 2, 0.12);
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 20);
  const cone = new THREE.ConeGeometry(1, 1, 16);
  const dodec = new THREE.DodecahedronGeometry(1, 0);

  /* 섬 */
  add(new THREE.CylinderGeometry(ISLAND_R + 0.12, ISLAND_R, 0.3, 72), grassMat, 0, -0.15, 0, root, false);
  add(new THREE.CylinderGeometry(ISLAND_R + 0.14, ISLAND_R + 0.08, 0.12, 72), grassDark, 0, -0.33, 0, root, false);
  add(new THREE.CylinderGeometry(ISLAND_R - 0.05, ISLAND_R - 0.7, 1.0, 64), dirt, 0, -0.85, 0, root, false);
  const under = add(new THREE.ConeGeometry(ISLAND_R - 0.7, 3.6, 40), dirtDark, 0, -3.15, 0, root, false);
  under.rotation.x = Math.PI;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + rnd();
    const rr = 2 + rnd() * 3.5;
    const s = 0.35 + rnd() * 0.5;
    const m = add(dodec, i % 2 ? rock : dirtDark, Math.cos(a) * rr, -1.8 - rnd() * 2.2, Math.sin(a) * rr, root, false);
    m.scale.set(s, s * 1.3, s);
    m.rotation.set(rnd() * 3, rnd() * 3, 0);
  }
  items.push({ kind: 'circle', x: 0, z: 0, w: ISLAND_R, d: 0, rot: 0, color: 0x6db84f });

  /* 광장 */
  add(new THREE.CylinderGeometry(1.65, 1.7, 0.08, 48), stoneMat, 0, 0.04, 0, root, false);
  add(new THREE.CylinderGeometry(1.1, 1.1, 0.09, 40), stone2, 0, 0.045, 0, root, false);
  items.push({ kind: 'circle', x: 0, z: 0, w: 1.7, d: 0, rot: 0, color: 0xe2dacb });

  /* 오솔길 디딤돌 */
  const curve = makePath();
  const L = curve.getLength();
  const pathPts = curve.getSpacedPoints(Math.round(L / 0.55));
  for (const p of pathPts) {
    if (Math.hypot(p.x, p.z) < 1.8) continue;
    const m = add(rbox, stone2, p.x + (rnd() - 0.5) * 0.1, 0.03, p.z + (rnd() - 0.5) * 0.1, root, false);
    m.scale.set(0.34 + rnd() * 0.1, 0.07, 0.28 + rnd() * 0.08);
    m.rotation.y = rnd() * 3;
  }

  /* 연못 */
  add(new THREE.CylinderGeometry(POND.r, POND.r, 0.06, 40), water, POND.x, 0.01, POND.z, root, false);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    const s = 0.16 + rnd() * 0.08;
    const m = add(dodec, i % 3 ? stone2 : rock, POND.x + Math.cos(a) * (POND.r + 0.06), 0.06, POND.z + Math.sin(a) * (POND.r + 0.06));
    m.scale.set(s * 1.2, s * 0.7, s);
    m.rotation.y = rnd() * 3;
  }
  for (let i = 0; i < 3; i++) {
    const m = add(cyl, lily, POND.x - 0.4 + i * 0.45, 0.05, POND.z + (i - 1) * 0.3, root, false);
    m.scale.set(0.2, 0.02, 0.2);
  }
  items.push({ kind: 'circle', x: POND.x, z: POND.z, w: POND.r, d: 0, rot: 0, color: 0x4fb3e8 });

  /* 집 */
  const houseTop: THREE.Vector3[] = [];
  for (const s of HOUSES) {
    const g = new THREE.Group();
    g.position.set(s.x, 0, s.z);
    g.rotation.y = s.rot;
    root.add(g);
    const wallMat = std(s.wall, 0.85);
    const roofMat = std(s.roof, 0.6);
    roofMats.push(roofMat);
    const base = add(box, stone2, 0, 0.08, 0, g);
    base.scale.set(s.w + 0.14, 0.16, s.d + 0.14);
    const walls = add(rbox, wallMat, 0, s.h / 2 + 0.05, 0, g);
    walls.scale.set(s.w, s.h, s.d);
    const o = 0.2;
    const rh = Math.min(s.w, 1.7) * 0.58;
    const shape = new THREE.Shape();
    shape.moveTo(-s.w / 2 - o, 0);
    shape.lineTo(s.w / 2 + o, 0);
    shape.lineTo(0, rh);
    shape.closePath();
    const rg = new THREE.ExtrudeGeometry(shape, { depth: s.d + o * 2, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 });
    rg.translate(0, 0, -(s.d + o * 2) / 2);
    add(rg, roofMat, 0, s.h + 0.02, 0, g);
    const ch = add(box, brick, s.w * 0.24, s.h + rh * 0.62, -s.d * 0.15, g);
    ch.scale.set(0.26, 0.55, 0.26);
    const dr = add(rbox, door, -s.w * 0.2, 0.47, s.d / 2 + 0.02, g);
    dr.scale.set(0.4, 0.66, 0.08);
    const kn = add(sphLo, gold, -s.w * 0.2 + 0.11, 0.45, s.d / 2 + 0.07, g, false);
    kn.scale.setScalar(0.035);
    const winAt = (x: number, y: number, z: number, ry: number): void => {
      const wg = new THREE.Group();
      wg.position.set(x, y, z);
      wg.rotation.y = ry;
      g.add(wg);
      const fr = add(rbox, white, 0, 0, 0, wg);
      fr.scale.set(0.46, 0.46, 0.06);
      const glass = add(box, opts.perWindow ? winMat.clone() : winMat, 0, 0, 0.02, wg, false);
      glass.scale.set(0.34, 0.34, 0.04);
      glass.userData.keep = true;
      windows.push(glass);
      const m1 = add(box, white, 0, 0, 0.045, wg, false);
      m1.scale.set(0.34, 0.035, 0.02);
      const m2 = add(box, white, 0, 0, 0.045, wg, false);
      m2.scale.set(0.035, 0.34, 0.02);
    };
    winAt(s.w * 0.2, s.h * 0.6, s.d / 2 + 0.01, 0);
    winAt(s.w / 2 + 0.01, s.h * 0.58, 0, Math.PI / 2);
    winAt(-s.w / 2 - 0.01, s.h * 0.58, 0, -Math.PI / 2);
    const fb = add(box, door, s.w * 0.2, s.h * 0.6 - 0.3, s.d / 2 + 0.08, g);
    fb.scale.set(0.5, 0.1, 0.12);
    for (let i = 0; i < 3; i++) {
      const f = add(sphLo, flowerMats[i % flowerMats.length]!, s.w * 0.2 - 0.15 + i * 0.15, s.h * 0.6 - 0.22, s.d / 2 + 0.08, g, false);
      f.scale.setScalar(0.06);
    }
    for (let i = 0; i < 2; i++) {
      const b = add(sph, leafMats[1]!, (i ? 1 : -1) * (s.w / 2 + 0.05), 0.22, s.d / 2 + 0.15, g);
      b.scale.set(0.28, 0.24, 0.24);
    }
    houseTop.push(new THREE.Vector3(s.x, s.h + rh, s.z));
    items.push({ kind: 'rect', x: s.x, z: s.z, w: s.w + 0.3, d: s.d + 0.3, rot: s.rot, color: s.roof });
  }

  /* 가로등 */
  const lamps: THREE.Vector3[] = [];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const x = Math.cos(a) * 1.95;
    const z = Math.sin(a) * 1.95;
    const p1 = add(cyl, pole, x, 0.55, z);
    p1.scale.set(0.045, 1.1, 0.045);
    const p2 = add(cyl, pole, x, 0.06, z);
    p2.scale.set(0.11, 0.12, 0.11);
    const cap = add(cone, pole, x, 1.32, z);
    cap.scale.set(0.16, 0.12, 0.16);
    const bulb = add(sph, lampMat, x, 1.18, z, root, false);
    bulb.scale.setScalar(0.11);
    lamps.push(new THREE.Vector3(x, 1.18, z));
  }

  /* 나무 · 덤불 · 꽃 */
  const near = (x: number, z: number, d: number): boolean => {
    for (const h of HOUSES) if (Math.hypot(x - h.x, z - h.z) < d + 1.2) return true;
    if (Math.hypot(x - POND.x, z - POND.z) < POND.r + d) return true;
    for (const p of pathPts) if (Math.hypot(x - p.x, z - p.z) < d * 0.8) return true;
    return Math.hypot(x, z) < 2.4;
  };
  let placed = 0;
  for (let k = 0; k < 400 && placed < 16; k++) {
    const a = rnd() * TAU;
    const rr = 4.4 + rnd() * 2.0;
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;
    if (rr > ISLAND_R - 0.55 || near(x, z, 0.9)) continue;
    placed++;
    const s = 0.8 + rnd() * 0.45;
    const t = add(cyl, trunk, x, 0.35 * s, z);
    t.scale.set(0.1 * s, 0.7 * s, 0.1 * s);
    if (placed % 3 === 0) {
      for (let j = 0; j < 3; j++) {
        const c = add(cone, leafMats[2]!, x, (0.75 + j * 0.42) * s, z);
        c.scale.set((0.62 - j * 0.15) * s, 0.7 * s, (0.62 - j * 0.15) * s);
      }
    } else {
      const lm = leafMats[placed % 2 ? 0 : 3]!;
      const b1 = add(sph, lm, x, 1.0 * s, z);
      b1.scale.setScalar(0.55 * s);
      const b2 = add(sph, lm, x + 0.25 * s, 0.82 * s, z + 0.18 * s);
      b2.scale.setScalar(0.38 * s);
      const b3 = add(sph, leafMats[1]!, x - 0.22 * s, 0.85 * s, z - 0.1 * s);
      b3.scale.setScalar(0.36 * s);
    }
    items.push({ kind: 'circle', x, z, w: 0.5 * s, d: 0, rot: 0, color: 0x2f7d3e });
  }
  for (let k = 0; k < 300; k++) {
    const a = rnd() * TAU;
    const rr = 2.2 + rnd() * 4.5;
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;
    if (rr > ISLAND_R - 0.3 || near(x, z, 0.35)) continue;
    const f = add(sphLo, flowerMats[k % 4]!, x, 0.06, z, root, false);
    f.scale.setScalar(0.055);
    const st = add(sphLo, leafMats[0]!, x, 0.02, z, root, false);
    st.scale.set(0.07, 0.03, 0.07);
  }
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * TAU + 0.2;
    const x = Math.cos(a) * (ISLAND_R - 0.45);
    const z = Math.sin(a) * (ISLAND_R - 0.45);
    if (near(x, z, 0.45)) continue;
    const b = add(sph, leafMats[k % 2]!, x, 0.16, z);
    b.scale.set(0.34, 0.26, 0.3);
  }
  const group = mergeStatic(root);
  [sph, sphLo, box, rbox, cyl, cone, dodec].forEach((g) => g.dispose());
  return { group, windows, winMat, lampMat, lamps, grassMat, stoneMat, roofMats, leafMats, items, houseTop };
}

function addLights(scene: THREE.Scene): { sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight } {
  const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x6a5a40, 1.15);
  const sun = new THREE.DirectionalLight(0xfff2dc, 2.6);
  sun.position.set(7, 12, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -9;
  sc.right = sc.top = 9;
  sc.near = 1;
  sc.far = 50;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  scene.add(hemi, sun, sun.target);
  return { sun, hemi };
}

/* ───────────── 위에서 본 작은 지도 ───────────── */

class MiniMap {
  scene = new THREE.Scene();
  cam: THREE.OrthographicCamera;
  private footPos = new THREE.BufferAttribute(new Float32Array(12), 3);
  private camDot!: THREE.Object3D;
  private camLine!: THREE.Line;
  private order = 0;
  private v = new THREE.Vector3();
  private dir = new THREE.Vector3();
  constructor(private extent: number) {
    this.cam = new THREE.OrthographicCamera(-extent, extent, extent, -extent, -50, 50);
    this.cam.position.set(0, 20, 0);
    this.cam.up.set(0, 0, -1);
    this.cam.lookAt(0, 0, 0);
    this.cam.updateMatrixWorld();
  }
  mat(color: number, opacity = 1): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, toneMapped: false, transparent: opacity < 1, opacity });
  }
  private put<T extends THREE.Object3D>(o: T): T {
    o.renderOrder = this.order++;
    this.scene.add(o);
    return o;
  }
  items(list: MapItem[]): void {
    for (const it of list) {
      const geo = it.kind === 'circle' ? new THREE.CircleGeometry(it.w, 32) : new THREE.PlaneGeometry(it.w, it.d);
      geo.rotateX(-Math.PI / 2);
      const m = this.put(new THREE.Mesh(geo, this.mat(it.color)));
      m.position.set(it.x, 0, it.z);
      m.rotation.y = it.rot;
    }
  }
  rectItem(w: number, d: number, color: number, opacity = 1): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(w, d);
    geo.rotateX(-Math.PI / 2);
    return this.put(new THREE.Mesh(geo, this.mat(color, opacity)));
  }
  line(color: number, opacity = 1, n = 64): { line: THREE.Line; set(pts: THREE.Vector3[]): void } {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setDrawRange(0, 0);
    const line = this.put(new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false, toneMapped: false })));
    return {
      line,
      set(pts: THREE.Vector3[]) {
        const a = geo.attributes.position as THREE.BufferAttribute;
        const k = Math.min(n, pts.length);
        for (let i = 0; i < k; i++) a.setXYZ(i, pts[i]!.x, 0, pts[i]!.z);
        a.needsUpdate = true;
        geo.setDrawRange(0, k);
      },
    };
  }
  dot(color: number, r: number, ring = 0x1b2240): THREE.Group {
    const g = new THREE.Group();
    const a = new THREE.Mesh(new THREE.CircleGeometry(r * 1.45, 20).rotateX(-Math.PI / 2), this.mat(ring));
    const b = new THREE.Mesh(new THREE.CircleGeometry(r, 20).rotateX(-Math.PI / 2), this.mat(color));
    a.renderOrder = this.order++;
    b.renderOrder = this.order++;
    g.add(a, b);
    this.scene.add(g);
    return g;
  }
  /** 카메라 시야가 땅에 닿는 사다리꼴 + 카메라 점 — 다른 표시 다음에 한 번 부른다 */
  camera(): void {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', this.footPos);
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.put(new THREE.Mesh(geo, this.mat(0xfff3b0, 0.28)));
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', this.footPos);
    this.put(new THREE.LineLoop(lg, new THREE.LineBasicMaterial({ color: 0xffd23f, depthTest: false, toneMapped: false })));
    const cl = new THREE.BufferGeometry();
    cl.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.camLine = this.put(new THREE.Line(cl, new THREE.LineBasicMaterial({ color: 0xffd23f, depthTest: false, toneMapped: false, transparent: true, opacity: 0.8 })));
    this.camDot = this.dot(0xffffff, this.extent * 0.045, 0xff5a7a);
  }
  setCamera(c: THREE.PerspectiveCamera): void {
    c.updateMatrixWorld();
    const cp = c.position;
    const cx = [-1, 1, 1, -1];
    const cy = [-1, -1, 1, 1];
    let mx = 0;
    let mz = 0;
    for (let i = 0; i < 4; i++) {
      this.v.set(cx[i]!, cy[i]!, 0.5).unproject(c);
      this.dir.copy(this.v).sub(cp).normalize();
      let t = 30;
      if (this.dir.y < -0.02) t = Math.min(30, -cp.y / this.dir.y);
      const x = cp.x + this.dir.x * t;
      const z = cp.z + this.dir.z * t;
      this.footPos.setXYZ(i, x, 0, z);
      mx += x / 4;
      mz += z / 4;
    }
    this.footPos.needsUpdate = true;
    this.camDot.position.set(cp.x, 0, cp.z);
    const a = this.camLine.geometry.attributes.position as THREE.BufferAttribute;
    a.setXYZ(0, cp.x, 0, cp.z);
    a.setXYZ(1, mx, 0, mz);
    a.needsUpdate = true;
  }
  /** 화면 오른쪽 아래 (또는 corner 'bl') 에 그리기 — renderer 상태는 부른 쪽이 지킨다 */
  draw(r: R, w: number, h: number, corner: 'br' | 'bl' = 'br'): void {
    const s = Math.round(Math.min(w, h) * 0.36);
    const m = Math.round(Math.min(w, h) * 0.035);
    const b = Math.max(2, Math.round(s * 0.025));
    const x = corner === 'br' ? w - s - m : m;
    const y = m;
    r.autoClear = false;
    r.setScissorTest(true);
    rect(r, x - b, y - b, s + b * 2, s + b * 2);
    r.setClearColor(0xf6f1e4, 1);
    r.clear(true, true, false);
    rect(r, x, y, s, s);
    r.setClearColor(0x1d2747, 1);
    r.clear(true, true, false);
    r.render(this.scene, this.cam);
    r.setScissorTest(false);
    r.setViewport(0, 0, w, h);
  }
  dispose(): void {
    disposeTree(this.scene);
  }
}

/* ───────────── 화면 글씨 (HUD) ───────────── */

class Hud {
  scene = new THREE.Scene();
  cam = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10);
  private labels = new Map<string, { mesh: THREE.Mesh; str: string; aspect: number }>();
  private geo = new THREE.PlaneGeometry(1, 1).translate(0.5, -0.5, 0);
  label(id: string, str: string, x: number, y: number, hpx: number, opt: { bg?: string; fg?: string; align?: 'l' | 'c' | 'r'; visible?: boolean } = {}): void {
    let it = this.labels.get(id);
    const key = str + (opt.bg ?? '') + (opt.fg ?? '');
    if (!it || it.str !== key) {
      const fs = 40;
      const c = document.createElement('canvas');
      const g0 = c.getContext('2d')!;
      g0.font = `800 ${fs}px ${FONT}`;
      const tw = Math.ceil(g0.measureText(str).width);
      c.width = tw + fs * 1.3;
      c.height = Math.round(fs * 1.75);
      const g = c.getContext('2d')!;
      g.fillStyle = opt.bg ?? 'rgba(14,20,44,0.78)';
      g.beginPath();
      g.roundRect(0, 0, c.width, c.height, c.height / 2);
      g.fill();
      g.font = `800 ${fs}px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = opt.fg ?? '#ffffff';
      g.fillText(str, c.width / 2, c.height / 2 + fs * 0.05);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      if (!it) {
        const mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, toneMapped: false }));
        this.scene.add(mesh);
        it = { mesh, str: key, aspect: c.width / c.height };
        this.labels.set(id, it);
      } else {
        const mm = it.mesh.material as THREE.MeshBasicMaterial;
        mm.map?.dispose();
        mm.map = tex;
        it.str = key;
        it.aspect = c.width / c.height;
      }
    }
    const wpx = hpx * it.aspect;
    const ax = opt.align === 'c' ? -wpx / 2 : opt.align === 'r' ? -wpx : 0;
    it.mesh.visible = opt.visible ?? true;
    it.mesh.scale.set(wpx, hpx, 1);
    it.mesh.position.set(x + ax, -y, 0);
  }
  rectMesh(color: number, opacity = 1): THREE.Mesh {
    const m = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, toneMapped: false }));
    this.scene.add(m);
    return m;
  }
  static place(m: THREE.Object3D, x: number, y: number, w: number, h: number): void {
    m.scale.set(Math.max(0.001, w), Math.max(0.001, h), 1);
    m.position.set(x, -y, 0);
  }
  draw(r: R, w: number, h: number): void {
    this.cam.left = 0;
    this.cam.right = w;
    this.cam.top = 0;
    this.cam.bottom = -h;
    this.cam.updateProjectionMatrix();
    r.autoClear = false;
    r.setScissorTest(false);
    r.setViewport(0, 0, w, h);
    r.clearDepth();
    r.render(this.scene, this.cam);
  }
  dispose(): void {
    disposeTree(this.scene);
    this.geo.dispose();
  }
}

/* ───────────── 캐릭터 · 말 ───────────── */

function makeChick(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const yel = new THREE.MeshStandardMaterial({ color: 0xffd84a, roughness: 0.55 });
  const org = new THREE.MeshStandardMaterial({ color: 0xff8a3a, roughness: 0.5 });
  const blk = new THREE.MeshStandardMaterial({ color: 0x1e1a2a, roughness: 0.3 });
  const wht = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const pink = new THREE.MeshBasicMaterial({ color: 0xff9bb3, transparent: true, opacity: 0.85 });
  const s = new THREE.SphereGeometry(1, 24, 18);
  const m = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy = sx, sz = sx, parent: THREE.Object3D = body): THREE.Mesh => {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(x, y, z);
    o.scale.set(sx, sy, sz);
    o.castShadow = true;
    parent.add(o);
    return o;
  };
  m(s, yel, 0, 0.36, 0, 0.36, 0.34, 0.35);
  m(s.clone(), yel, -0.33, 0.33, -0.02, 0.1, 0.16, 0.14);
  m(s.clone(), yel, 0.33, 0.33, -0.02, 0.1, 0.16, 0.14);
  for (const sx of [-1, 1]) {
    m(s.clone(), blk, sx * 0.12, 0.44, 0.31, 0.05, 0.06, 0.04);
    m(s.clone(), wht, sx * 0.12 + 0.018, 0.46, 0.345, 0.015, 0.015, 0.01);
    m(new THREE.CircleGeometry(1, 16), pink, sx * 0.2, 0.36, 0.32, 0.045, 0.03, 1).rotation.y = sx * 0.5;
    m(new THREE.BoxGeometry(1, 1, 1), org, sx * 0.12, 0.02, 0.05, 0.08, 0.04, 0.16, g);
  }
  const beak = m(new THREE.ConeGeometry(1, 1, 12), org, 0, 0.37, 0.37, 0.055, 0.13, 0.055);
  beak.rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) {
    const t = m(new THREE.ConeGeometry(1, 1, 8), yel, (i - 1) * 0.06, 0.72, 0, 0.035, 0.12, 0.035);
    t.rotation.z = (i - 1) * -0.5;
  }
  return g;
}
function pieceGeo(king: boolean): THREE.LatheGeometry {
  const k = king ? 1.25 : 1;
  const pts = [
    [0, 0],
    [0.33, 0],
    [0.35, 0.06],
    [0.27, 0.13],
    [0.2, 0.16],
    [0.14, 0.42 * k],
    [0.19, 0.48 * k],
    [0.11, 0.54 * k],
    [0, 0.55 * k],
  ].map(([x, y]) => new THREE.Vector2(x!, y!));
  return new THREE.LatheGeometry(pts, 28);
}
function makePiece(color: number, king: boolean): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.05 });
  const body = new THREE.Mesh(pieceGeo(king), mat);
  body.castShadow = true;
  g.add(body);
  const hy = king ? 0.85 : 0.7;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 20, 14), mat);
  head.position.y = hy;
  head.castShadow = true;
  g.add(head);
  const blk = new THREE.MeshBasicMaterial({ color: 0x1b1830 });
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), blk);
    e.position.set(sx * 0.07, hy + 0.02, 0.17);
    g.add(e);
  }
  if (king) {
    const goldM = new THREE.MeshStandardMaterial({ color: 0xf5c542, roughness: 0.3, metalness: 0.7 });
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.09, 20, 1, true), goldM);
    ring.position.y = hy + 0.2;
    g.add(ring);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      const p = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 8), goldM);
      p.position.set(Math.cos(a) * 0.14, hy + 0.29, Math.sin(a) * 0.14);
      g.add(p);
    }
  }
  return g;
}
function buildBoard(cols: number, rows: number): { group: THREE.Group; w: number; d: number; tile: (i: number, j: number) => THREE.Vector3 } {
  const root = new THREE.Group();
  const a = new THREE.MeshStandardMaterial({ color: 0xfaecd0, roughness: 0.6 });
  const b = new THREE.MeshStandardMaterial({ color: 0x8fd0a6, roughness: 0.6 });
  const wood = new THREE.MeshStandardMaterial({ color: 0xa8693c, roughness: 0.6 });
  const wood2 = new THREE.MeshStandardMaterial({ color: 0x7c4a2a, roughness: 0.7 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xf5c542, roughness: 0.3, metalness: 0.7 });
  const tg = new RoundedBoxGeometry(0.94, 0.16, 0.94, 2, 0.04);
  const w = cols;
  const d = rows;
  const tile = (i: number, j: number): THREE.Vector3 => new THREE.Vector3(i - (cols - 1) / 2, 0.16, j - (rows - 1) / 2);
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const m = new THREE.Mesh(tg, (i + j) % 2 ? b : a);
      m.position.copy(tile(i, j)).setY(0.08);
      m.receiveShadow = true;
      root.add(m);
    }
  const fr = new RoundedBoxGeometry(1, 1, 1, 2, 0.08);
  const frame = (x: number, z: number, sx: number, sz: number): void => {
    const m = new THREE.Mesh(fr, wood);
    m.position.set(x, 0.1, z);
    m.scale.set(sx, 0.34, sz);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
  };
  frame(0, -d / 2 - 0.22, w + 0.88, 0.44);
  frame(0, d / 2 + 0.22, w + 0.88, 0.44);
  frame(-w / 2 - 0.22, 0, 0.44, d);
  frame(w / 2 + 0.22, 0, 0.44, d);
  const base = new THREE.Mesh(fr, wood2);
  base.position.y = -0.18;
  base.scale.set(w + 1.1, 0.3, d + 1.1);
  base.receiveShadow = true;
  root.add(base);
  const sg = new THREE.SphereGeometry(0.11, 16, 12);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const k = new THREE.Mesh(sg, gold);
      k.position.set(sx * (w / 2 + 0.22), 0.3, sz * (d / 2 + 0.22));
      root.add(k);
    }
  const group = mergeStatic(root);
  tg.dispose();
  fr.dispose();
  sg.dispose();
  return { group, w: w + 0.9, d: d + 0.9, tile };
}

/** SmoothDamp (임계 감쇠 스프링) — Vector3 */
function smoothDamp(cur: THREE.Vector3, target: THREE.Vector3, vel: THREE.Vector3, smoothTime: number, dt: number): void {
  const st = Math.max(0.0001, smoothTime);
  const om = 2 / st;
  const x = om * dt;
  const ex = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const cx = cur.x - target.x;
  const cy = cur.y - target.y;
  const cz = cur.z - target.z;
  const tx = (vel.x + om * cx) * dt;
  const ty = (vel.y + om * cy) * dt;
  const tz = (vel.z + om * cz) * dt;
  vel.set((vel.x - om * tx) * ex, (vel.y - om * ty) * ex, (vel.z - om * tz) * ex);
  cur.set(target.x + (cx + tx) * ex, target.y + (cy + ty) * ex, target.z + (cz + tz) * ex);
}

/** 기본 마을 장면 (하늘 · 빛 · 마을) */
function villageWorld(opts: { perWindow?: boolean } = {}): { scene: THREE.Scene; cam: THREE.PerspectiveCamera; sky: Sky; vil: Village; sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight } {
  const scene = new THREE.Scene();
  const sky = makeSky(0x4f9be8, 0xcfe9ff, 0x9ec6e8);
  sky.u.uSunK.value = 0.6;
  scene.add(sky.mesh);
  const { sun, hemi } = addLights(scene);
  sky.u.uSun.value.copy(sun.position).normalize();
  const vil = buildVillage(opts);
  scene.add(vil.group);
  const cam = new THREE.PerspectiveCamera(42, 1.6, 0.1, 200);
  return { scene, cam, sky, vil, sun, hemi };
}
function mapFor(vil: Village): MiniMap {
  const mm = new MiniMap(ISLAND_R + 0.6);
  mm.items(vil.items);
  return mm;
}

/* ═════════════ i426 따라가는 카메라 ═════════════ */

function demoFollow(): Scene3D {
  const { scene, cam, vil } = villageWorld();
  const chick = makeChick();
  scene.add(chick);
  const curve = makePath();
  const L = curve.getLength();
  const mm = mapFor(vil);
  const pathLine = mm.line(0xffffff, 0.35, 96);
  pathLine.set(curve.getSpacedPoints(95));
  const aheadDot = mm.dot(0xff6fae, 0.22);
  const chickDot = mm.dot(0xffd84a, 0.3);
  mm.camera();
  const hud = new Hud();
  const st = { lead: true, smooth: 0.35, rigid: false };
  const OFF = new THREE.Vector3(0, 6.8, 7.4);
  let dist = 0;
  const pos = new THREE.Vector3();
  const prev = curve.getPointAt(0);
  const vel = new THREE.Vector3();
  const look = new THREE.Vector3();
  const lookV = new THREE.Vector3();
  const camP = new THREE.Vector3();
  const camV = new THREE.Vector3();
  const goal = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  let first = true;
  let speedK = 0;
  return {
    scene,
    camera: cam,
    update(t, dt) {
      dt = Math.min(dt, 0.05);
      const ph = t % 4;
      const want = ph < 2.9 ? 1 : 0;
      speedK += (want - speedK) * (1 - Math.exp(-dt * (want ? 4 : 7)));
      dist = (dist + dt * 2.3 * speedK) % L;
      pos.copy(curve.getPointAt(dist / L));
      const tan = curve.getTangentAt(dist / L);
      const hop = Math.abs(Math.sin(dist * 4.2)) * 0.22 * speedK;
      chick.position.set(pos.x, hop, pos.z);
      chick.rotation.y = Math.atan2(tan.x, tan.z);
      chick.rotation.z = Math.sin(dist * 4.2) * 0.12 * speedK;
      if (dt > 0) {
        tmp.copy(pos).sub(prev).divideScalar(dt);
        if (tmp.length() < 20) vel.lerp(tmp, 1 - Math.exp(-dt * 6));
      }
      prev.copy(pos);
      if (st.rigid) {
        look.copy(chick.position);
        camP.copy(chick.position).add(OFF);
        lookV.set(0, 0, 0);
        camV.set(0, 0, 0);
      } else {
        goal.copy(pos);
        if (st.lead) goal.addScaledVector(vel, 0.75);
        if (first) {
          look.copy(goal);
          camP.copy(goal).add(OFF);
          first = false;
        }
        smoothDamp(look, goal, lookV, st.smooth, dt);
        tmp.copy(goal).add(OFF);
        smoothDamp(camP, tmp, camV, st.smooth * 1.25, dt);
      }
      cam.position.copy(camP);
      cam.lookAt(look);
      chickDot.position.set(pos.x, 0, pos.z);
      aheadDot.position.set(look.x, 0, look.z);
      mm.setCamera(cam);
    },
    render(r, w, h) {
      withState(r, () => {
        r.render(scene, cam);
        mm.draw(r, w, h);
        const u = Math.min(1.9, w / 280, h / 175);
        hud.label('a', st.rigid ? '딱 붙기 (비교)' : st.lead ? '부드럽게 + 앞질러 보기' : '부드럽게만', 10 * u, 10 * u, 17 * u, { bg: st.rigid ? 'rgba(200,60,80,0.85)' : 'rgba(14,20,44,0.78)' });
        hud.draw(r, w, h);
      });
    },
    controls: [
      { type: 'toggle', label: '앞질러 보기 (가는 쪽을 더 보여 주기)', value: true, on: (v) => (st.lead = v) },
      { type: 'range', label: '부드러움 (스프링 시간, 초)', min: 0.05, max: 1, step: 0.05, value: 0.35, on: (v) => (st.smooth = v) },
      { type: 'toggle', label: '비교: 딱 붙기 (스프링 끔 · 폴짝도 따라 흔들림)', value: false, on: (v) => (st.rigid = v) },
    ] as Control[],
    dispose() {
      disposeTree(scene);
      mm.dispose();
      hud.dispose();
    },
  };
}

/* ═════════════ i427 판 맞춤 카메라 ═════════════ */

const ASPECTS = [
  { name: '카드 그대로', a: 0 },
  { name: '가로 폰 844 × 390', a: 844 / 390 },
  { name: '세로 폰 390 × 844', a: 390 / 844 },
  { name: '태블릿 4 : 3', a: 4 / 3 },
  { name: '정사각 1 : 1', a: 1 },
];
function demoBoardFit(): Scene3D {
  const scene = new THREE.Scene();
  const sky = makeSky(0x1b2350, 0x4a3d78, 0x2a2448);
  scene.add(sky.mesh);
  const { sun } = addLights(scene);
  sun.position.set(5, 12, 7);
  const dummy = new THREE.PerspectiveCamera(40, 1.6, 0.1, 200);
  const cam = new THREE.PerspectiveCamera(40, 1.6, 0.1, 200);
  let board: ReturnType<typeof buildBoard> | null = null;
  const pieces = new THREE.Group();
  scene.add(pieces);
  let corners: THREE.Vector3[] = [];
  let mm: MiniMap | null = null;
  const hud = new Hud();
  const st = { cols: 6, mode: 0, auto: true, fit: true };
  let built = -1;
  const rebuild = (): void => {
    if (board) {
      scene.remove(board.group);
      disposeTree(board.group);
    }
    pieces.children.slice().forEach((c) => {
      pieces.remove(c);
      disposeTree(c);
    });
    const cols = st.cols;
    const rows = cols + 3;
    board = buildBoard(cols, rows);
    scene.add(board.group);
    const r = rng(cols * 13);
    for (let k = 0; k < Math.round(cols * 1.2); k++) {
      const p = makePiece(k % 3 ? 0xe8574a : 0x4a7fe8, k === 0);
      p.position.copy(board.tile(Math.floor(r() * cols), Math.floor(r() * rows)));
      p.rotation.y = (r() - 0.5) * 0.8;
      pieces.add(p);
    }
    const hw = board.w / 2;
    const hd = board.d / 2;
    corners = [];
    for (const x of [-hw, hw]) for (const y of [-0.3, 1.2]) for (const z of [-hd, hd]) corners.push(new THREE.Vector3(x, y, z));
    mm?.dispose();
    mm = new MiniMap(Math.max(hw, hd) * 1.9);
    mm.rectItem(board.w, board.d, 0xa8693c);
    mm.rectItem(board.w - 0.9, board.d - 0.9, 0x8fd0a6);
    mm.camera();
    built = cols;
  };
  rebuild();
  const PITCH = 0.95;
  const dir = new THREE.Vector3(0, Math.sin(PITCH), Math.cos(PITCH));
  const target = new THREE.Vector3();
  const pv = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  let curA = 1.6;
  let lastDist = 10;
  let canvasA = 1.6;
  let modeNow = 1;
  const place = (d: number): void => {
    cam.position.copy(target).addScaledVector(dir, d);
    cam.lookAt(target);
    cam.updateMatrixWorld();
  };
  const fits = (m: number): boolean => {
    for (const c of corners) {
      pv.copy(c).project(cam);
      if (pv.z > 1 || Math.abs(pv.x) > m || Math.abs(pv.y) > m) return false;
    }
    return true;
  };
  const fit = (): void => {
    target.set(0, 0, 0);
    if (!st.fit) {
      place(15);
      lastDist = 15;
      return;
    }
    let d = 10;
    for (let it = 0; it < 3; it++) {
      let lo = 1;
      let hi = 200;
      for (let k = 0; k < 24; k++) {
        const mid = (lo + hi) / 2;
        place(mid);
        if (fits(0.94)) hi = mid;
        else lo = mid;
      }
      d = hi;
      place(d);
      let x0 = 9;
      let x1 = -9;
      let y0 = 9;
      let y1 = -9;
      for (const c of corners) {
        pv.copy(c).project(cam);
        x0 = Math.min(x0, pv.x);
        x1 = Math.max(x1, pv.x);
        y0 = Math.min(y0, pv.y);
        y1 = Math.max(y1, pv.y);
      }
      const halfH = d * Math.tan((cam.fov * Math.PI) / 360);
      right.setFromMatrixColumn(cam.matrixWorld, 0);
      up.setFromMatrixColumn(cam.matrixWorld, 1);
      target.addScaledVector(right, ((x0 + x1) / 2) * halfH * cam.aspect).addScaledVector(up, ((y0 + y1) / 2) * halfH);
    }
    place(d);
    lastDist = d;
  };
  return {
    scene,
    camera: dummy,
    resize(w, h) {
      canvasA = w / h;
    },
    update(t, dt) {
      if (built !== st.cols) rebuild();
      if (st.auto) modeNow = 1 + (Math.floor(t / 3) % 4);
      else modeNow = st.mode;
      const want = ASPECTS[modeNow]!.a || canvasA;
      curA = Math.exp(lerp(Math.log(curA), Math.log(want), 1 - Math.exp(-Math.min(dt, 0.05) * 7)));
      pieces.children.forEach((p, i) => {
        p.position.y = 0.16 + Math.abs(Math.sin(t * 3 + i)) * 0.06;
      });
    },
    render(r, w, h) {
      withState(r, () => {
        const u = Math.min(1.9, w / 280, h / 175);
        const top = 30 * u;
        const m = 10 * u;
        const aw = w - m * 2;
        const ah = h - top - m;
        let vw = aw;
        let vh = aw / curA;
        if (vh > ah) {
          vh = ah;
          vw = ah * curA;
        }
        const vx = Math.round((w - vw) / 2);
        const vy = Math.round(m + (ah - vh) / 2);
        vw = Math.round(vw);
        vh = Math.round(vh);
        cam.aspect = vw / vh;
        cam.updateProjectionMatrix();
        fit();
        mm!.setCamera(cam);
        r.autoClear = false;
        r.setScissorTest(true);
        rect(r, 0, 0, w, h);
        r.setClearColor(0x0d1226, 1);
        r.clear(true, true, false);
        const bz = Math.round(5 * u);
        rect(r, vx - bz, vy - bz, vw + bz * 2, vh + bz * 2);
        r.setClearColor(0x2c3458, 1);
        r.clear(true, true, false);
        rect(r, vx, vy, vw, vh);
        r.setClearColor(0x000000, 1);
        r.clear(true, true, false);
        r.render(scene, cam);
        r.setScissorTest(false);
        r.setViewport(0, 0, w, h);
        mm!.draw(r, w, h, 'bl');
        hud.label('a', ASPECTS[modeNow]!.name, w / 2, 6 * u, 18 * u, { align: 'c', bg: 'rgba(59,130,246,0.92)' });
        hud.label('b', st.fit ? `맞춤 거리 ${lastDist.toFixed(1)}` : '맞춤 끔 (거리 고정)', w - 8 * u, 6 * u, 15 * u, { align: 'r', bg: st.fit ? 'rgba(14,20,44,0.78)' : 'rgba(200,60,80,0.85)' });
        hud.draw(r, w, h);
      });
    },
    controls: [
      { type: 'toggle', label: '비율 자동으로 돌려 보기', value: true, on: (v) => (st.auto = v) },
      { type: 'range', label: '화면 비율 (0 그대로 · 1 가로 폰 · 2 세로 폰 · 3 태블릿 · 4 정사각)', min: 0, max: 4, step: 1, value: 0, on: (v) => ((st.mode = v), (st.auto = false)) },
      { type: 'toggle', label: '판 맞춤 계산 (끄면 거리 고정 — 세로 폰에서 잘림)', value: true, on: (v) => (st.fit = v) },
      { type: 'range', label: '판 크기 (가로 칸)', min: 3, max: 10, step: 1, value: 6, on: (v) => (st.cols = v) },
    ] as Control[],
    dispose() {
      disposeTree(scene);
      mm?.dispose();
      hud.dispose();
    },
  };
}

/* ═════════════ i428 극적인 확대 ═════════════ */

function demoDramatic(): Scene3D {
  const scene = new THREE.Scene();
  const sky = makeSky(0x141a3c, 0x3d3470, 0x221c40);
  scene.add(sky.mesh);
  const { sun } = addLights(scene);
  sun.position.set(-5, 11, 6);
  const board = buildBoard(7, 7);
  scene.add(board.group);
  const hero = makePiece(0xe8574a, false);
  const king = makePiece(0x4a7fe8, true);
  scene.add(hero, king);
  const others: THREE.Group[] = [];
  const ot: [number, number, number][] = [
    [0, 1, 0x4a7fe8],
    [5, 1, 0x4a7fe8],
    [6, 4, 0x4a7fe8],
    [1, 6, 0xe8574a],
    [4, 6, 0xe8574a],
  ];
  for (const [i, j, c] of ot) {
    const p = makePiece(c, false);
    p.position.copy(board.tile(i, j));
    scene.add(p);
    others.push(p);
  }
  const route = [board.tile(1, 5), board.tile(2, 4), board.tile(3, 3), board.tile(4, 2)];
  const land = route[3]!;
  /* 별 터짐 */
  const N = 90;
  const pg = new THREE.BufferGeometry();
  const pp = new Float32Array(N * 3);
  const pc = new Float32Array(N * 3);
  const pvv: THREE.Vector3[] = [];
  const r0 = rng(5);
  const pal = [new THREE.Color(0xffe066), new THREE.Color(0xffffff), new THREE.Color(0xff8fb1), new THREE.Color(0x8fd8ff)];
  for (let i = 0; i < N; i++) {
    const a = r0() * TAU;
    const sp = 1.5 + r0() * 3.5;
    pvv.push(new THREE.Vector3(Math.cos(a) * sp, 2 + r0() * 4, Math.sin(a) * sp));
    const c = pal[i % 4]!;
    pc.set([c.r, c.g, c.b], i * 3);
  }
  pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  pg.setAttribute('color', new THREE.BufferAttribute(pc, 3));
  const glow = glowTex();
  const pts = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.32, map: glow, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  pts.frustumCulled = false;
  scene.add(pts);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffd860, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  ring.position.copy(land).setY(0.2);
  scene.add(ring);
  const cam = new THREE.PerspectiveCamera(40, 1.6, 0.1, 200);
  const mm = new MiniMap(9);
  mm.rectItem(board.w, board.d, 0xa8693c);
  mm.rectItem(7, 7, 0x8fd0a6);
  const landDot = mm.dot(0xffd23f, 0.25);
  landDot.position.set(land.x, 0, land.z);
  const heroDot = mm.dot(0xe8574a, 0.3);
  mm.camera();
  const hud = new Hud();
  const st = { zoom: true, slow: true, power: 0.85 };
  let gt = 0;
  let lastC = 0;
  let slowAt = -1;
  let ts = 1;
  let z = 0;
  let realSince = 0;
  const kingV = new THREE.Vector3();
  const look = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const zp = new THREE.Vector3();
  const LAND = 2.0;
  return {
    scene,
    camera: cam,
    update(t, dt) {
      dt = Math.min(dt, 0.05);
      const c = t % 6.2;
      if (c < lastC) {
        gt = 0;
        slowAt = -1;
        realSince = 0;
      }
      lastC = c;
      if (st.slow && slowAt < 0 && gt > 1.88) slowAt = c;
      if (slowAt >= 0) realSince = c - slowAt;
      const slowing = slowAt >= 0 && realSince < 1.7;
      const tsWant = slowing ? 0.14 : 1;
      ts += (tsWant - ts) * (1 - Math.exp(-dt * (slowing ? 18 : 5)));
      gt += dt * ts;
      const zWant = st.zoom && (slowing || (!st.slow && gt > 1.75 && gt < 2.9)) ? 1 : 0;
      z += (zWant - z) * (1 - Math.exp(-dt * (zWant ? 7 : 2.6)));
      /* 말 폴짝 */
      const hops: [number, number, number][] = [
        [0.5, 0.9, 0.5],
        [1.05, 1.45, 0.5],
        [1.5, LAND, 1.2],
      ];
      pos.copy(route[0]!);
      let squash = 1;
      for (let i = 0; i < 3; i++) {
        const [a, b, hgt] = hops[i]!;
        if (gt >= b) pos.copy(route[i + 1]!);
        else if (gt > a) {
          const k = (gt - a) / (b - a);
          pos.lerpVectors(route[i]!, route[i + 1]!, ease(k));
          pos.y += Math.sin(Math.PI * k) * hgt;
        }
      }
      const since = gt - LAND;
      if (since > 0 && since < 0.35) squash = 1 - Math.sin((since / 0.35) * Math.PI) * 0.3;
      hero.position.copy(pos);
      hero.scale.set(2 - squash, squash, 2 - squash);
      hero.rotation.y = Math.PI * 0.75;
      /* 왕 날아가기 */
      if (since <= 0) {
        king.position.copy(land);
        king.rotation.set(0, -Math.PI * 0.25, 0);
        king.visible = true;
        kingV.set(1.6, 4.2, -2.0);
      } else {
        king.position.set(land.x + kingV.x * since, land.y + kingV.y * since - 4.9 * since * since, land.z + kingV.z * since);
        king.rotation.set(-since * 5, -Math.PI * 0.25, since * 3);
        king.visible = king.position.y > -6;
      }
      /* 별 · 고리 */
      const show = since > 0 && since < 1.6;
      pts.visible = show;
      ring.visible = show;
      if (show) {
        for (let i = 0; i < N; i++) {
          const v = pvv[i]!;
          pp[i * 3] = land.x + v.x * since;
          pp[i * 3 + 1] = 0.4 + v.y * since - 4 * since * since;
          pp[i * 3 + 2] = land.z + v.z * since;
        }
        pg.attributes.position!.needsUpdate = true;
        (pts.material as THREE.PointsMaterial).opacity = 1 - since / 1.6;
        ring.scale.setScalar(0.3 + since * 4);
        (ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - since / 0.9);
      }
      others.forEach((o, i) => (o.position.y = 0.16 + Math.abs(Math.sin(gt * 2.2 + i)) * 0.03));
      /* 카메라: 넓게 천천히 → 결정적 순간에 다가감 */
      const yaw = 0.5 + Math.sin(t * 0.25) * 0.35;
      const wide = new THREE.Vector3(Math.sin(yaw) * 11.5, 9.4, Math.cos(yaw) * 11.5);
      zp.set(land.x + 2.2, land.y + 1.5, land.z + 2.6);
      const zz = ease(z) * st.power;
      cam.position.lerpVectors(wide, zp, zz);
      look.set(0, 0, 0).lerp(land.clone().setY(0.55), zz);
      cam.fov = lerp(40, 30, zz);
      cam.updateProjectionMatrix();
      cam.lookAt(look);
      heroDot.position.set(pos.x, 0, pos.z);
      mm.setCamera(cam);
    },
    render(r, w, h) {
      withState(r, () => {
        r.render(scene, cam);
        mm.draw(r, w, h);
        const u = Math.min(1.9, w / 280, h / 175);
        hud.label('s', `느린 화면 ×${ts.toFixed(2)}`, 10 * u, 10 * u, 16 * u, { bg: 'rgba(14,20,44,0.78)', visible: ts < 0.9 });
        const since = gt - LAND;
        hud.label('p', '결정적 한 수!', w * 0.36, h * 0.2, 26 * u * (1 + Math.max(0, 0.25 - since) * 1.2), { align: 'c', bg: 'rgba(255,90,122,0.92)', visible: since > 0 && since < 1.4 });
        hud.draw(r, w, h);
      });
    },
    controls: [
      { type: 'toggle', label: '확대 (결정적 순간에 다가가기)', value: true, on: (v) => (st.zoom = v) },
      { type: 'toggle', label: '느린 화면', value: true, on: (v) => (st.slow = v) },
      { type: 'range', label: '확대 세기', min: 0.3, max: 1, step: 0.05, value: 0.85, on: (v) => (st.power = v) },
    ] as Control[],
    dispose() {
      disposeTree(scene);
      mm.dispose();
      hud.dispose();
    },
  };
}

/* ═════════════ i429 카메라 흔들림 ═════════════ */

function crateTex(): THREE.CanvasTexture {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#c98a4b';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 5; i++) {
      g.fillStyle = i % 2 ? '#bf7f42' : '#d2955a';
      g.fillRect(0, i * 51, 256, 49);
      g.fillStyle = 'rgba(90,50,20,0.5)';
      g.fillRect(0, i * 51 + 49, 256, 2);
    }
    g.strokeStyle = '#8a5428';
    g.lineWidth = 26;
    g.strokeRect(13, 13, 230, 230);
    g.beginPath();
    g.moveTo(20, 20);
    g.lineTo(236, 236);
    g.stroke();
    g.fillStyle = '#5a5f73';
    for (const [x, y] of [
      [22, 22],
      [234, 22],
      [22, 234],
      [234, 234],
    ])
      g.fillRect(x! - 6, y! - 6, 12, 12);
  });
}
function demoShake(): Scene3D {
  const { scene, cam, vil } = villageWorld();
  const crate = new THREE.Mesh(new RoundedBoxGeometry(1, 1, 1, 2, 0.06), new THREE.MeshStandardMaterial({ map: crateTex(), roughness: 0.75 }));
  crate.castShadow = true;
  scene.add(crate);
  const shadowDisc = new THREE.Mesh(
    new THREE.CircleGeometry(0.7, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }),
  );
  shadowDisc.position.y = 0.1;
  scene.add(shadowDisc);
  /* 먼지 */
  const N = 70;
  const dg = new THREE.BufferGeometry();
  const dp = new Float32Array(N * 3);
  const dv: THREE.Vector3[] = [];
  const r0 = rng(11);
  for (let i = 0; i < N; i++) {
    const a = r0() * TAU;
    const s = 1.5 + r0() * 2.5;
    dv.push(new THREE.Vector3(Math.cos(a) * s, 0.4 + r0() * 1.4, Math.sin(a) * s));
  }
  dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const glow = glowTex();
  const dust = new THREE.Points(dg, new THREE.PointsMaterial({ size: 0.9, map: glow, color: 0xe6d6bc, transparent: true, depthWrite: false }));
  dust.frustumCulled = false;
  scene.add(dust);
  const mm = mapFor(vil);
  const impact = mm.dot(0xff6b4a, 0.4);
  mm.camera();
  const hud = new Hud();
  const bg = hud.rectMesh(0x0e142c, 0.7);
  const fill = hud.rectMesh(0xff6b4a, 1);
  const st = { power: 1, freq: 14, smooth: true, decay: 1.5 };
  let trauma = 0;
  let lastC = 0;
  let y = 9;
  let vy = 0;
  let hitAt = -10;
  let bounced = false;
  let manual = -1;
  const base = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  return {
    scene,
    camera: cam,
    update(t, dt) {
      dt = Math.min(dt, 0.05);
      const c = t % 3.4;
      if (c < lastC || manual >= 0) {
        y = 9;
        vy = 0;
        bounced = false;
        manual = -1;
      }
      lastC = c;
      vy -= 26 * dt;
      y += vy * dt;
      if (y < 0.5) {
        y = 0.5;
        if (!bounced) {
          trauma = Math.min(1, trauma + st.power);
          hitAt = t;
          bounced = true;
          vy = 3.2;
        } else vy = 0;
      }
      const since = t - hitAt;
      const sq = since < 0.25 ? 1 - Math.sin((since / 0.25) * Math.PI) * 0.22 : 1;
      const out = c > 2.9 ? ease((c - 2.9) / 0.4) : 0;
      crate.position.set(0, y * sq + (1 - sq) * 0, 0);
      crate.scale.set(2 - sq, sq, 2 - sq).multiplyScalar(1 - out);
      crate.rotation.y = 0.4;
      shadowDisc.scale.setScalar(clamp(1.2 - y / 10, 0.3, 1) * (1 - out));
      dust.visible = since < 1.4;
      if (dust.visible) {
        for (let i = 0; i < N; i++) {
          const v = dv[i]!;
          const k = 1 - Math.exp(-since * 3);
          dp[i * 3] = v.x * k * 0.7;
          dp[i * 3 + 1] = 0.15 + v.y * k * 0.5;
          dp[i * 3 + 2] = v.z * k * 0.7;
        }
        dg.attributes.position!.needsUpdate = true;
        (dust.material as THREE.PointsMaterial).opacity = 0.85 * (1 - since / 1.4);
      }
      trauma = Math.max(0, trauma - dt * st.decay);
      /* 기본 자리 */
      const yaw = 0.35;
      base.set(Math.sin(yaw) * 11, 8, Math.cos(yaw) * 11);
      cam.position.copy(base);
      cam.lookAt(0, 0.4, 0);
      const s = trauma * trauma;
      let nx: number;
      let ny: number;
      let nr: number;
      if (st.smooth) {
        const f = t * st.freq;
        nx = vnoise(f, 1) * 0.8 + vnoise(f * 2.1, 4) * 0.2;
        ny = vnoise(f, 2) * 0.8 + vnoise(f * 2.1, 5) * 0.2;
        nr = vnoise(f, 3);
      } else {
        nx = Math.random() * 2 - 1;
        ny = Math.random() * 2 - 1;
        nr = Math.random() * 2 - 1;
      }
      cam.updateMatrixWorld();
      right.setFromMatrixColumn(cam.matrixWorld, 0);
      up.setFromMatrixColumn(cam.matrixWorld, 1);
      cam.position.addScaledVector(right, nx * s * 0.55).addScaledVector(up, ny * s * 0.55);
      cam.rotateZ(nr * s * 0.07);
      impact.visible = since < 1.2;
      mm.setCamera(cam);
    },
    render(r, w, h) {
      withState(r, () => {
        r.render(scene, cam);
        mm.draw(r, w, h);
        const u = Math.min(1.9, w / 280, h / 175);
        hud.label('a', st.smooth ? '잡음 흔들림' : '무작위 흔들림 (비교)', 10 * u, 10 * u, 16 * u, { bg: st.smooth ? 'rgba(14,20,44,0.78)' : 'rgba(200,60,80,0.85)' });
        const bw = 90 * u;
        Hud.place(bg, 10 * u, 34 * u, bw, 9 * u);
        Hud.place(fill, 10 * u + 1.5 * u, 35.5 * u, (bw - 3 * u) * trauma, 6 * u);
        hud.label('b', `세기 ${(trauma * trauma).toFixed(2)}`, 10 * u + bw + 5 * u, 31 * u, 14 * u, { bg: 'rgba(14,20,44,0.6)' });
        hud.draw(r, w, h);
      });
    },
    controls: [
      { type: 'button', label: '다시 떨어뜨리기', on: () => (manual = 1) },
      { type: 'range', label: '흔들림 세기', min: 0.2, max: 1, step: 0.05, value: 1, on: (v) => (st.power = v) },
      { type: 'range', label: '주파수 (빠르기)', min: 3, max: 30, step: 1, value: 14, on: (v) => (st.freq = v) },
      { type: 'toggle', label: '부드러운 잡음 (끄면 매 장면 무작위 — 덜컹거림)', value: true, on: (v) => (st.smooth = v) },
    ] as Control[],
    dispose() {
      disposeTree(scene);
      mm.dispose();
      hud.dispose();
    },
  };
}

/* ═════════════ i430 장면 전환 궤도 이동 ═════════════ */

interface Station {
  name: string;
  target: THREE.Vector3;
  r: number;
  yaw: number;
  el: number;
}
function demoOrbit(): Scene3D {
  const { scene, cam, vil } = villageWorld();
  const h0 = HOUSES[0]!;
  const h2 = HOUSES[2]!;
  const ST: Station[] = [
    { name: '마을 전체', target: new THREE.Vector3(0, 0, 0), r: 17, yaw: 0.5, el: 0.72 },
    { name: h0.name, target: new THREE.Vector3(h0.x, 0.9, h0.z), r: 5, yaw: h0.rot + 0.25, el: 0.32 },
    { name: '연못', target: new THREE.Vector3(POND.x, 0.2, POND.z), r: 5.5, yaw: 0.9, el: 0.55 },
    { name: h2.name, target: new THREE.Vector3(h2.x, 1.0, h2.z), r: 5.2, yaw: h2.rot - 0.2 + TAU, el: 0.3 },
  ];
  const mm = mapFor(vil);
  const straight = mm.line(0xff6b8a, 0.6, 2);
  const arcLine = mm.line(0xffffff, 0.85, 48);
  const tgtDot = mm.dot(0x7cf0ff, 0.28);
  mm.camera();
  const hud = new Hud();
  const st = { mode: 2, speed: 1, showStraight: true };
  const pa = new THREE.Vector3();
  const pb = new THREE.Vector3();
  const tg = new THREE.Vector3();
  const sph = (s: Station, out: THREE.Vector3): THREE.Vector3 =>
    out.set(s.target.x + Math.sin(s.yaw) * Math.cos(s.el) * s.r, s.target.y + Math.sin(s.el) * s.r, s.target.z + Math.cos(s.yaw) * Math.cos(s.el) * s.r);
  const camAt = (a: Station, b: Station, k: number, out: THREE.Vector3, look: THREE.Vector3): void => {
    const e = ease(k);
    if (st.mode === 0) {
      const s = k < 0.5 ? a : b;
      look.copy(s.target);
      sph(s, out);
      return;
    }
    look.lerpVectors(a.target, b.target, e);
    if (st.mode === 1) {
      sph(a, pa);
      sph(b, pb);
      out.lerpVectors(pa, pb, e);
      return;
    }
    let dy = b.yaw - a.yaw;
    dy = ((dy + Math.PI) % TAU + TAU) % TAU - Math.PI;
    const yaw = a.yaw + dy * e;
    const bump = Math.sin(Math.PI * e);
    const el = lerp(a.el, b.el, e) + bump * 0.32;
    const r = lerp(a.r, b.r, e) + bump * 5;
    out.set(look.x + Math.sin(yaw) * Math.cos(el) * r, look.y + Math.sin(el) * r, look.z + Math.cos(yaw) * Math.cos(el) * r);
  };
  const tmpL = new THREE.Vector3();
  const arcPts: THREE.Vector3[] = Array.from({ length: 48 }, () => new THREE.Vector3());
  let label = '';
  let clock = 0;
  return {
    scene,
    camera: cam,
    update(_t, dt) {
      clock += Math.min(dt, 0.05) * st.speed;
      const seg = 3.2;
      const i = Math.floor(clock / seg) % ST.length;
      const a = ST[i]!;
      const b = ST[(i + 1) % ST.length]!;
      const ph = clock % seg;
      const fly = 1.7;
      const k = clamp((ph - (seg - fly)) / fly, 0, 1);
      camAt(a, b, k, cam.position, tg);
      cam.lookAt(tg);
      label = k > 0 && k < 1 ? `→ ${b.name}` : k >= 1 ? b.name : a.name;
      for (let j = 0; j < 48; j++) camAt(a, b, j / 47, arcPts[j]!, tmpL);
      arcLine.set(arcPts);
      straight.line.visible = st.showStraight && st.mode === 2;
      sph(a, pa);
      sph(b, pb);
      straight.set([pa, pb]);
      tgtDot.position.set(tg.x, 0, tg.z);
      mm.setCamera(cam);
    },
    render(r, w, h) {
      withState(r, () => {
        r.render(scene, cam);
        mm.draw(r, w, h);
        const u = Math.min(1.9, w / 280, h / 175);
        hud.label('a', label, 10 * u, 10 * u, 18 * u, { bg: 'rgba(14,20,44,0.8)' });
        hud.label('b', ['순간 이동', '직선 이동', '궤도 이동'][st.mode]!, 10 * u, 34 * u, 14 * u, { bg: st.mode === 2 ? 'rgba(59,130,246,0.9)' : 'rgba(200,60,80,0.85)' });
        hud.draw(r, w, h);
      });
    },
    controls: [
      { type: 'range', label: '이동 방식 (0 순간 · 1 직선 · 2 궤도)', min: 0, max: 2, step: 1, value: 2, on: (v) => (st.mode = v) },
      { type: 'range', label: '빠르기', min: 0.3, max: 2, step: 0.1, value: 1, on: (v) => (st.speed = v) },
      { type: 'toggle', label: '지도에 직선 경로도 (빨강)', value: true, on: (v) => (st.showStraight = v) },
    ] as Control[],
    dispose() {
      disposeTree(scene);
      mm.dispose();
      hud.dispose();
    },
  };
}

/* ═════════════ i431 하루 시간 흐름 ═════════════ */

const C = (h: number): THREE.Color => new THREE.Color(h);
const SKY_KEYS = {
  night: { top: C(0x060b26), hor: C(0x1a2552), hemi: C(0x27335e), gnd: C(0x0c0f1c) },
  dusk: { top: C(0x3a3f80), hor: C(0xff9a5c), hemi: C(0xf2a88a), gnd: C(0x4a3a40) },
  day: { top: C(0x3b8ee6), hor: C(0xcbe7ff), hemi: C(0xcfe6ff), gnd: C(0x6a5a40) },
};
function skyMix(el: number, key: 'top' | 'hor' | 'hemi' | 'gnd', out: THREE.Color): THREE.Color {
  if (el < 0) return out.copy(SKY_KEYS.night[key]).lerp(SKY_KEYS.dusk[key], sstep(-0.28, 0, el));
  return out.copy(SKY_KEYS.dusk[key]).lerp(SKY_KEYS.day[key], sstep(0.02, 0.32, el));
}
function timeWord(h: number): string {
  if (h >= 4.5 && h < 7) return '새벽';
  if (h >= 7 && h < 10.5) return '아침';
  if (h >= 10.5 && h < 16) return '낮';
  if (h >= 16 && h < 19.5) return '노을';
  return '밤';
}
function demoDay(): Scene3D {
  const { scene, cam, sky, vil, sun, hemi } = villageWorld();
  cam.fov = 50;
  cam.updateProjectionMatrix();
  sky.u.uSpan.value = 0.32;
  const glow = glowTex();
  const halos: THREE.Sprite[] = vil.lamps.map((p) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffc46b, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.position.copy(p);
    s.scale.setScalar(1.3);
    scene.add(s);
    return s;
  });
  const hud = new Hud();
  const st = { auto: true, hour: 9, speed: 2 };
  let hour = 5;
  const dir = new THREE.Vector3();
  const tc = new THREE.Color();
  const warm = C(0xff8a4a);
  const noon = C(0xfff4e0);
  const moonC = C(0x8fa8ff);
  return {
    scene,
    camera: cam,
    update(t, dt) {
      if (st.auto) hour = (hour + Math.min(dt, 0.05) * st.speed) % 24;
      else hour = st.hour;
      const a = ((hour - 6) / 24) * TAU;
      dir.set(Math.cos(a), Math.sin(a) * 0.9, -1.1).normalize();
      const el = dir.y;
      sky.u.uSun.value.copy(dir);
      skyMix(el, 'top', sky.u.uTop.value);
      skyMix(el, 'hor', sky.u.uHor.value);
      sky.u.uBot.value.copy(sky.u.uHor.value).multiplyScalar(0.7);
      sky.u.uSunK.value = sstep(-0.12, 0.05, el);
      sky.u.uSunCol.value.copy(warm).lerp(noon, sstep(0.0, 0.4, el));
      sky.u.uMoonK.value = sstep(0.0, -0.15, el);
      sky.u.uStars.value = sstep(-0.02, -0.25, el);
      sky.u.uTime.value = t;
      if (el > -0.03) {
        sun.position.copy(dir).multiplyScalar(20);
        sun.color.copy(warm).lerp(noon, sstep(0.0, 0.45, el));
        sun.intensity = 3.0 * sstep(-0.03, 0.22, el);
      } else {
        sun.position.copy(dir).multiplyScalar(-20);
        sun.color.copy(moonC);
        sun.intensity = 0.45 * sstep(-0.03, -0.2, el);
      }
      hemi.color.copy(skyMix(el, 'hemi', tc));
      hemi.groundColor.copy(skyMix(el, 'gnd', tc));
      hemi.intensity = lerp(0.3, 1.1, sstep(-0.2, 0.3, el));
      const night = sstep(0.08, -0.08, el);
      vil.winMat.emissiveIntensity = night * 2.2;
      vil.lampMat.emissiveIntensity = 0.3 + night * 3;
      halos.forEach((s) => ((s.material as THREE.SpriteMaterial).opacity = night));
      const yaw = Math.sin(t * 0.1) * 0.12;
      cam.position.set(Math.sin(yaw) * 13, 4.6, Math.cos(yaw) * 13);
      cam.lookAt(0, 1.4, 0);
    },
    render(r, w, h) {
      withState(r, () => {
        r.render(scene, cam);
        const u = Math.min(1.9, w / 280, h / 175);
        const hh = Math.floor(hour);
        const mi = Math.floor((hour - hh) * 60);
        hud.label('a', `${String(hh).padStart(2, '0')}:${String(Math.floor(mi / 10) * 10).padStart(2, '0')} ${timeWord(hour)}`, 10 * u, 10 * u, 19 * u, { bg: 'rgba(14,20,44,0.75)' });
        hud.draw(r, w, h);
      });
    },
    controls: [
      { type: 'toggle', label: '시간 저절로 흐르기', value: true, on: (v) => (st.auto = v) },
      { type: 'range', label: '시각 (0 ~ 24시)', min: 0, max: 24, step: 0.25, value: 9, on: (v) => ((st.hour = v), (st.auto = false)) },
      { type: 'range', label: '흐르는 빠르기 (시간/초)', min: 0.5, max: 6, step: 0.5, value: 2, on: (v) => (st.speed = v) },
    ] as Control[],
    dispose() {
      disposeTree(scene);
      hud.dispose();
    },
  };
}

/* ═════════════ i432 밤 장면 ═════════════ */

function demoNight(): Scene3D {
  const { scene, cam, sky, vil, sun, hemi } = villageWorld({ perWindow: true });
  sky.u.uTop.value.set(0x050a22);
  sky.u.uHor.value.set(0x18224a);
  sky.u.uBot.value.set(0x0e1430);
  sky.u.uSunK.value = 0;
  sky.u.uMoonK.value = 1;
  sky.u.uStars.value = 1;
  const moonDir = new THREE.Vector3(-0.45, 0.55, -0.7).normalize();
  sky.u.uSun.value.copy(moonDir).negate();
  sun.position.copy(moonDir).multiplyScalar(20);
  sun.color.set(0x8aa6ff);
  const glow = glowTex();
  const warm = 0xffb35a;
  const lampHalos: THREE.Sprite[] = [];
  const pools: THREE.Mesh[] = [];
  const lights: THREE.PointLight[] = [];
  const poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  vil.lamps.forEach((p, i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: warm, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.position.copy(p);
    s.scale.setScalar(1.6);
    scene.add(s);
    lampHalos.push(s);
    const pm = new THREE.Mesh(poolGeo, new THREE.MeshBasicMaterial({ map: glow, color: warm, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.45 }));
    pm.position.set(p.x, 0.1, p.z);
    pm.scale.setScalar(3.2);
    scene.add(pm);
    pools.push(pm);
    if (i < 3) {
      const l = new THREE.PointLight(warm, 5, 5, 2);
      l.position.copy(p);
      scene.add(l);
      lights.push(l);
    }
  });
  const wp = new THREE.Vector3();
  const winHalos: THREE.Sprite[] = vil.windows.map((w) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffc46b, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    w.getWorldPosition(wp);
    s.position.copy(wp);
    s.scale.setScalar(1.0);
    scene.add(s);
    return s;
  });
  const order = vil.windows.map((_, i) => i).sort((a, b) => hash1(a * 3.1) - hash1(b * 3.1));
  const onAt = new Map<number, number>();
  order.forEach((wi, k) => onAt.set(wi, 0.6 + (k / order.length) * 3.2));
  /* 반딧불 */
  const N = 46;
  const fg = new THREE.BufferGeometry();
  const fp = new Float32Array(N * 3);
  const fph = new Float32Array(N);
  const r0 = rng(21);
  for (let i = 0; i < N; i++) {
    const a = r0() * TAU;
    const rr = 2.2 + r0() * 4.3;
    fp.set([Math.cos(a) * rr, 0.3 + r0() * 1.4, Math.sin(a) * rr], i * 3);
    fph[i] = r0() * 100;
  }
  fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
  fg.setAttribute('aPh', new THREE.BufferAttribute(fph, 1));
  const fu = { uTime: { value: 0 }, uPx: { value: 300 } };
  const flies = new THREE.Points(
    fg,
    new THREE.ShaderMaterial({
      uniforms: fu,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aPh; uniform float uTime, uPx; varying float vA;
        void main(){
          vec3 p = position + vec3(sin(uTime*0.7+aPh)*0.5, sin(uTime*1.1+aPh*1.7)*0.25, cos(uTime*0.6+aPh*0.8)*0.5);
          vec4 mv = modelViewMatrix * vec4(p,1.0);
          vA = 0.35 + 0.65 * pow(0.5 + 0.5*sin(uTime*2.3 + aPh*3.0), 3.0);
          gl_PointSize = uPx * 0.09 / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          a = a*a;
          gl_FragColor = vec4(vec3(0.85, 1.0, 0.45) * a * vA * 1.6, 1.0);
        }`,
    }),
  );
  flies.frustumCulled = false;
  scene.add(flies);
  const hud = new Hud();
  const st = { contrast: true, moon: 0.45, win: 2.6, flies: true };
  return {
    scene,
    camera: cam,
    update(t) {
      fu.uTime.value = t;
      sky.u.uTime.value = t;
      const c = t % 8;
      const off = c > 7.3 ? ease((c - 7.3) / 0.5) : 0;
      const on = st.contrast;
      sun.intensity = on ? st.moon : st.moon * 0.6;
      hemi.color.set(0x2a3766);
      hemi.groundColor.set(0x0a0c18);
      hemi.intensity = on ? 0.32 : 1.6;
      vil.windows.forEach((w, i) => {
        const t0 = onAt.get(i) ?? 1;
        let k = c > t0 ? 1 : 0;
        if (c > t0 && c < t0 + 0.28) k = hash1(Math.floor(c * 30) + i) > 0.45 ? 1 : 0.15;
        k *= 1 - off;
        if (!on) k = 0;
        (w.material as THREE.MeshStandardMaterial).emissiveIntensity = k * st.win;
        (winHalos[i]!.material as THREE.SpriteMaterial).opacity = k * 0.75;
      });
      vil.lampMat.emissiveIntensity = on ? 3.2 : 0;
      lampHalos.forEach((s, i) => {
        s.visible = on;
        s.scale.setScalar(1.5 + Math.sin(t * 3 + i) * 0.06);
      });
      pools.forEach((p) => (p.visible = on));
      lights.forEach((l) => (l.intensity = on ? 5 : 0));
      flies.visible = st.flies;
      const yaw = 0.45 + Math.sin(t * 0.12) * 0.25;
      cam.position.set(Math.sin(yaw) * 13.5, 7.2, Math.cos(yaw) * 13.5);
      cam.lookAt(0, 0.3, 0);
    },
    render(r, w, h) {
      fu.uPx.value = h;
      withState(r, () => {
        r.render(scene, cam);
        const u = Math.min(1.9, w / 280, h / 175);
        hud.label('a', st.contrast ? '켜진 창 · 등만 밝게' : '비교: 고르게 어둡게', 10 * u, 10 * u, 16 * u, { bg: st.contrast ? 'rgba(14,20,44,0.75)' : 'rgba(200,60,80,0.85)' });
        hud.draw(r, w, h);
      });
    },
    controls: [
      { type: 'toggle', label: '대비 (끄면 전체를 고르게 어둡게)', value: true, on: (v) => (st.contrast = v) },
      { type: 'range', label: '달빛 세기', min: 0, max: 1.5, step: 0.05, value: 0.45, on: (v) => (st.moon = v) },
      { type: 'range', label: '창 불빛', min: 0.5, max: 5, step: 0.1, value: 2.6, on: (v) => (st.win = v) },
      { type: 'toggle', label: '반딧불', value: true, on: (v) => (st.flies = v) },
    ] as Control[],
    dispose() {
      disposeTree(scene);
      poolGeo.dispose();
      glow.dispose();
      hud.dispose();
    },
  };
}

/* ═════════════ i433 실내 조명 ═════════════ */

function demoIndoor(): Scene3D {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x141826);
  const floorTex = canvasTex(
    512,
    512,
    (g) => {
      const r = rng(3);
      for (let i = 0; i < 8; i++) {
        const base = 150 + r() * 30;
        g.fillStyle = `rgb(${base + 40},${base - 10},${base - 60})`;
        g.fillRect(0, i * 64, 512, 64);
        for (let k = 0; k < 40; k++) {
          g.fillStyle = `rgba(90,50,20,${0.04 + r() * 0.06})`;
          g.fillRect(r() * 512, i * 64 + r() * 60, 40 + r() * 120, 1 + r() * 2);
        }
        g.fillStyle = 'rgba(60,30,10,0.55)';
        g.fillRect(0, i * 64 + 62, 512, 2);
        const cut = r() * 512;
        g.fillRect(cut, i * 64, 2, 64);
      }
    },
    true,
  );
  floorTex.repeat.set(2, 2);
  const wallTex = canvasTex(
    256,
    256,
    (g) => {
      g.fillStyle = '#f2e4d2';
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? 'rgba(232,180,170,0.35)' : 'rgba(255,255,255,0.25)';
        g.fillRect(i * 32, 0, 16, 256);
      }
      g.fillStyle = 'rgba(214,140,150,0.5)';
      for (let y = 16; y < 256; y += 48) for (let x = 24; x < 256; x += 64) {
        g.beginPath();
        g.arc(x, y, 3, 0, TAU);
        g.fill();
      }
    },
    true,
  );
  wallTex.repeat.set(3, 1.5);
  const rugTex = canvasTex(256, 256, (g) => {
    const cols = ['#d9534f', '#f6d36b', '#5b8def', '#f6efe2', '#d9534f'];
    for (let i = 0; i < 5; i++) {
      g.fillStyle = cols[i]!;
      g.beginPath();
      g.arc(128, 128, 126 - i * 24, 0, TAU);
      g.fill();
    }
  });
  const floorM = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55 });
  const wallM = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 });
  const trimM = std(0xfaf6ee, 0.6);
  const woodM = std(0x9a6438, 0.6);
  const darkWood = std(0x6b4128, 0.7);
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, cast = true): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = cast;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  const box = new THREE.BoxGeometry(1, 1, 1);
  const rb = new RoundedBoxGeometry(1, 1, 1, 3, 0.15);
  const W = 8;
  const D = 6;
  const H = 3.2;
  add(box, floorM, 0, -0.1, 0, W, 0.2, D, false);
  /* 뒤 벽 (창 구멍) */
  const wx0 = -0.6;
  const wx1 = 1.4;
  const wy0 = 1.0;
  const wy1 = 2.5;
  const zb = -D / 2;
  add(box, wallM, (-W / 2 + wx0) / 2, H / 2, zb, wx0 + W / 2, H, 0.2);
  add(box, wallM, (wx1 + W / 2) / 2, H / 2, zb, W / 2 - wx1, H, 0.2);
  add(box, wallM, (wx0 + wx1) / 2, wy0 / 2, zb, wx1 - wx0, wy0, 0.2);
  add(box, wallM, (wx0 + wx1) / 2, (wy1 + H) / 2, zb, wx1 - wx0, H - wy1, 0.2);
  const wc = (wx0 + wx1) / 2;
  add(box, trimM, wc, wy0 - 0.04, zb + 0.16, wx1 - wx0 + 0.3, 0.08, 0.32);
  add(box, trimM, wc, (wy0 + wy1) / 2, zb, 0.06, wy1 - wy0, 0.12);
  add(box, trimM, wc, (wy0 + wy1) / 2, zb, wx1 - wx0, 0.06, 0.12);
  for (const x of [wx0, wx1]) add(box, trimM, x, (wy0 + wy1) / 2, zb + 0.02, 0.08, wy1 - wy0 + 0.1, 0.24);
  add(box, trimM, wc, wy1 + 0.04, zb + 0.02, wx1 - wx0 + 0.16, 0.08, 0.24);
  /* 왼쪽 벽 */
  add(box, wallM, -W / 2, H / 2, 0, 0.2, H, D);
  add(box, trimM, -W / 2 + 0.12, 0.08, 0, 0.04, 0.16, D);
  add(box, trimM, 0, 0.08, zb + 0.12, W, 0.16, 0.04);
  /* 보이지 않는 천장 (그림자만) */
  const ceil = add(box, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }), 0, H + 0.1, 0, W + 2, 0.2, D + 2, true);
  ceil.receiveShadow = false;
  /* 창밖 */
  const outTex = canvasTex(256, 192, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 192);
    gr.addColorStop(0, '#6fb6ff');
    gr.addColorStop(1, '#e6f4ff');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 192);
    g.fillStyle = '#ffffff';
    for (const [x, y, r] of [
      [60, 50, 22],
      [85, 45, 28],
      [110, 55, 20],
    ]) {
      g.beginPath();
      g.arc(x!, y!, r!, 0, TAU);
      g.fill();
    }
    g.fillStyle = '#5fbf63';
    for (const [x, r] of [
      [30, 50],
      [200, 60],
      [250, 45],
    ]) {
      g.beginPath();
      g.arc(x!, 192, r!, 0, TAU);
      g.fill();
    }
  });
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(wx1 - wx0 + 0.8, wy1 - wy0 + 0.6), new THREE.MeshBasicMaterial({ map: outTex }));
  outside.position.set(wc, (wy0 + wy1) / 2, zb - 0.45);
  scene.add(outside);
  /* 가구 */
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1.4, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: rugTex, roughness: 0.95 }));
  rug.position.set(0.9, 0.012, 0.9);
  rug.receiveShadow = true;
  scene.add(rug);
  /* 책장 */
  add(rb, woodM, -W / 2 + 0.4, 1.0, -1.2, 0.6, 2.0, 1.8);
  const bookC = [0xe8574a, 0x4a8fe8, 0xf2c14e, 0x3fb37f, 0x9b6ae8, 0xff8fb1];
  const r1 = rng(9);
  for (let s = 0; s < 3; s++) {
    add(box, darkWood, -W / 2 + 0.72, 0.45 + s * 0.6, -1.2, 0.06, 0.04, 1.6, false);
    let z = -1.95;
    while (z < -0.5) {
      const bw = 0.08 + r1() * 0.06;
      const bh = 0.32 + r1() * 0.18;
      add(box, std(bookC[Math.floor(r1() * bookC.length)]!, 0.7), -W / 2 + 0.7, 0.47 + s * 0.6 + bh / 2, z + bw / 2, 0.06, bh, bw * 0.9);
      z += bw + 0.01;
    }
  }
  /* 안락의자 */
  const chairM = std(0x5aa0d8, 0.85);
  add(rb, chairM, 2.9, 0.35, -1.3, 1.3, 0.5, 1.2);
  add(rb, chairM, 2.9, 0.85, -1.82, 1.3, 1.0, 0.3);
  add(rb, chairM, 2.32, 0.6, -1.3, 0.22, 0.6, 1.2);
  add(rb, chairM, 3.48, 0.6, -1.3, 0.22, 0.6, 1.2);
  add(rb, std(0xffe08a, 0.9), 2.9, 0.7, -1.25, 0.5, 0.3, 0.2);
  /* 작은 탁자 + 스탠드 */
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 28);
  add(cyl, woodM, -0.9, 0.62, 1.3, 0.55, 0.06, 0.55);
  add(cyl, darkWood, -0.9, 0.31, 1.3, 0.06, 0.62, 0.06);
  add(cyl, darkWood, -0.9, 0.02, 1.3, 0.3, 0.04, 0.3);
  add(cyl, std(0x3a3f55, 0.4, 0.5), -0.9, 0.9, 1.3, 0.03, 0.5, 0.03);
  const shadeM = new THREE.MeshStandardMaterial({ color: 0xfff0c8, roughness: 0.8, emissive: 0xffb050, emissiveIntensity: 0.9, side: THREE.DoubleSide });
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.34, 0.34, 28, 1, true), shadeM);
  shade.position.set(-0.9, 1.25, 1.3);
  scene.add(shade);
  const glow = glowTex();
  const bulbHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffb050, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
  bulbHalo.position.set(-0.9, 1.2, 1.3);
  bulbHalo.scale.setScalar(1.6);
  scene.add(bulbHalo);
  const lamp = new THREE.PointLight(0xffa850, 6, 7, 2);
  lamp.position.set(-0.9, 1.15, 1.3);
  scene.add(lamp);
  /* 화분 · 액자 · 고양이 쿠션 */
  add(cyl, std(0xd97b4a, 0.8), 2.0, 0.22, -2.5, 0.22, 0.44, 0.22);
  const leaf = std(0x4fae4a, 0.7);
  const sp = new THREE.SphereGeometry(1, 16, 12);
  add(sp, leaf, 2.0, 0.75, -2.5, 0.38, 0.42, 0.38);
  add(sp, leaf, 1.8, 0.95, -2.4, 0.25, 0.25, 0.25);
  add(box, darkWood, -2.2, 1.9, zb + 0.12, 1.0, 0.75, 0.05);
  add(box, std(0xffd27a, 0.8), -2.2, 1.9, zb + 0.15, 0.85, 0.6, 0.02);
  add(sp, std(0xff9bb3, 0.9), 0.5, 0.12, 0.9, 0.35, 0.14, 0.3);
  /* 빛 */
  const hemi = new THREE.HemisphereLight(0xbcd0ff, 0x6b4a30, 0.28);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d0, 3.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -6;
  sc.right = sc.top = 6;
  sc.near = 1;
  sc.far = 40;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const bounce = new THREE.PointLight(0xffc890, 1.5, 5, 2);
  scene.add(bounce);
  /* 빛 기둥 */
  const shaftGeo = new THREE.BufferGeometry();
  const shaftPos = new THREE.BufferAttribute(new Float32Array(8 * 3), 3);
  const shaftT = new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 1, 1, 1, 1]), 1);
  shaftGeo.setAttribute('position', shaftPos);
  shaftGeo.setAttribute('aT', shaftT);
  shaftGeo.setIndex([0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
  const su = { uK: { value: 1 } };
  const shaft = new THREE.Mesh(
    shaftGeo,
    new THREE.ShaderMaterial({
      uniforms: su,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aT; varying float vT; varying vec3 vN; varying vec3 vV;
        void main(){
          vT = aT;
          vec4 wp = modelMatrix * vec4(position,1.0);
          vV = normalize(cameraPosition - wp.xyz);
          vN = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uK; varying float vT; varying vec3 vN; varying vec3 vV;
        void main(){
          float face = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
          float a = face * (0.17 + 0.13 * (1.0 - vT)) * smoothstep(1.0, 0.8, vT) * uK;
          gl_FragColor = vec4(vec3(1.0, 0.9, 0.7) * a, 1.0);
        }`,
    }),
  );
  shaft.frustumCulled = false;
  scene.add(shaft);
  /* 먼지 */
  const N = 140;
  const dg = new THREE.BufferGeometry();
  const seeds = new Float32Array(N * 3);
  const r2 = rng(33);
  for (let i = 0; i < N * 3; i++) seeds[i] = r2();
  dg.setAttribute('position', new THREE.BufferAttribute(seeds, 3));
  const du = {
    uO: { value: new THREE.Vector3(wx0, wy0, zb) },
    uEx: { value: new THREE.Vector3(wx1 - wx0, 0, 0) },
    uEy: { value: new THREE.Vector3(0, wy1 - wy0, 0) },
    uDir: { value: new THREE.Vector3() },
    uTime: { value: 0 },
    uPx: { value: 300 },
    uK: { value: 1 },
  };
  const motes = new THREE.Points(
    dg,
    new THREE.ShaderMaterial({
      uniforms: du,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform vec3 uO, uEx, uEy, uDir; uniform float uTime, uPx;
        varying float vA;
        void main(){
          vec3 c = uO + uEx * position.x + uEy * position.y;
          float L = c.y / -uDir.y;
          float s = fract(position.z + uTime * 0.025);
          vec3 p = c + uDir * L * s;
          p += vec3(sin(uTime*0.6 + position.x*40.0), sin(uTime*0.45 + position.y*30.0), cos(uTime*0.5 + position.z*20.0)) * 0.06;
          vA = smoothstep(0.0, 0.12, s) * smoothstep(1.0, 0.8, s) * (0.4 + 0.6 * fract(position.x * 13.7));
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_PointSize = uPx * 0.022 / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uK; varying float vA;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.1, d) * vA * uK;
          gl_FragColor = vec4(vec3(1.0, 0.92, 0.75) * a, 1.0);
        }`,
    }),
  );
  motes.frustumCulled = false;
  scene.add(motes);
  const cam = new THREE.PerspectiveCamera(40, 1.6, 0.1, 100);
  cam.position.set(5.6, 4.3, 6.6);
  cam.lookAt(-0.3, 0.9, -0.6);
  const hud = new Hud();
  const st = { sunK: 1, auto: true, ang: 0.5, lamp: true, bounce: true };
  const dir = new THREE.Vector3();
  const cs = [
    [wx0, wy0],
    [wx1, wy0],
    [wx1, wy1],
    [wx0, wy1],
  ];
  return {
    scene,
    camera: cam,
    tone: THREE.NeutralToneMapping,
    update(t) {
      const ang = st.auto ? 0.5 + Math.sin(t * 0.45) * 0.5 : st.ang;
      dir.set(lerp(-0.55, 0.65, ang), -lerp(0.62, 0.9, Math.sin(ang * Math.PI) * 0.5 + 0.25), 1).normalize();
      sun.target.position.set(wc, 0, 0);
      sun.position.copy(sun.target.position).addScaledVector(dir, -15);
      sun.intensity = 3.6 * st.sunK;
      for (let i = 0; i < 4; i++) {
        const [x, y] = cs[i]!;
        shaftPos.setXYZ(i, x!, y!, zb);
        const L = y! / -dir.y;
        shaftPos.setXYZ(i + 4, x! + dir.x * L, 0.01, zb + dir.z * L);
      }
      shaftPos.needsUpdate = true;
      shaftGeo.computeVertexNormals();
      su.uK.value = st.sunK;
      du.uDir.value.copy(dir);
      du.uTime.value = t;
      du.uK.value = st.sunK;
      const mid = 1.75 / -dir.y;
      bounce.position.set(wc + dir.x * mid, 0.35, zb + dir.z * mid);
      bounce.intensity = st.bounce ? 2.2 * st.sunK : 0;
      const fl = 1 + Math.sin(t * 13) * 0.02 + Math.sin(t * 7.3) * 0.02;
      lamp.intensity = st.lamp ? 6 * fl : 0;
      shadeM.emissiveIntensity = st.lamp ? 0.9 : 0.05;
      bulbHalo.visible = st.lamp;
      hemi.intensity = st.bounce ? 0.3 : 0.15;
    },
    render(r, w, h) {
      du.uPx.value = h;
      withState(r, () => {
        r.render(scene, cam);
        const u = Math.min(1.9, w / 280, h / 175);
        const parts = [st.sunK > 0.05 ? '창 빛' : '', st.lamp ? '전등' : '', st.bounce ? '반사광' : ''].filter(Boolean).join(' + ');
        hud.label('a', parts || '빛 없음', 10 * u, 10 * u, 16 * u, { bg: 'rgba(14,20,44,0.75)' });
        hud.draw(r, w, h);
      });
    },
    controls: [
      { type: 'range', label: '창 빛 세기', min: 0, max: 2, step: 0.05, value: 1, on: (v) => (st.sunK = v) },
      { type: 'range', label: '해 각도 (움직이면 자동 멈춤)', min: 0, max: 1, step: 0.01, value: 0.5, on: (v) => ((st.ang = v), (st.auto = false)) },
      { type: 'toggle', label: '따뜻한 전등', value: true, on: (v) => (st.lamp = v) },
      { type: 'toggle', label: '반사광 흉내 (바닥에서 튀는 빛)', value: true, on: (v) => (st.bounce = v) },
    ] as Control[],
    dispose() {
      disposeTree(scene);
      box.dispose();
      rb.dispose();
      hud.dispose();
    },
  };
}

/* ═════════════ i434 날씨 ═════════════ */

const WEATHER = [
  { name: '맑음', sun: 2.7, hemi: 1.1, top: C(0x3b8ee6), hor: C(0xcbe7ff), fog: 0.004 },
  { name: '비', sun: 0.45, hemi: 0.75, top: C(0x4a5568), hor: C(0x8a94a6), fog: 0.035 },
  { name: '눈', sun: 0.9, hemi: 1.0, top: C(0x8e9fb8), hor: C(0xdfe6f0), fog: 0.03 },
  { name: '안개', sun: 0.7, hemi: 0.95, top: C(0xb8c2cc), hor: C(0xd6dce2), fog: 0.085 },
];
function particleMat(kind: 'rain' | 'snow', u: Record<string, { value: unknown }>): THREE.ShaderMaterial {
  const rain = kind === 'rain';
  return new THREE.ShaderMaterial({
    uniforms: u,
    transparent: true,
    depthWrite: false,
    blending: rain ? THREE.NormalBlending : THREE.NormalBlending,
    vertexShader: /* glsl */ `
      uniform float uTime, uPx, uA;
      varying float vA;
      void main(){
        vec3 p = position;
        float H = 12.0;
        ${rain ? 'p.y = mod(p.y - uTime * 14.0, H); p.x += p.y * 0.08;' : 'p.y = mod(p.y - uTime * 1.3, H); p.x += sin(uTime*1.1 + position.z*3.0)*0.45; p.z += cos(uTime*0.9 + position.x*2.0)*0.3;'}
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vA = uA * smoothstep(0.0, 1.0, p.y) * smoothstep(H, H - 2.0, p.y);
        gl_PointSize = uPx * ${rain ? '0.22' : '0.1'} / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        ${rain ? 'float a = smoothstep(0.07, 0.0, abs(c.x + c.y * 0.08)) * smoothstep(0.5, 0.15, abs(c.y)) * 0.9; vec3 col = vec3(0.82, 0.88, 1.0);' : 'float a = smoothstep(0.5, 0.15, length(c)); vec3 col = vec3(1.0);'}
        gl_FragColor = vec4(col, a * vA);
      }`,
  });
}
function demoWeather(): Scene3D {
  const { scene, cam, sky, vil, sun, hemi } = villageWorld();
  const fog = new THREE.FogExp2(0xcbe7ff, 0.004);
  scene.fog = fog;
  const mk = (n: number, seed: number): THREE.BufferGeometry => {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(n * 3);
    const r = rng(seed);
    for (let i = 0; i < n; i++) p.set([(r() - 0.5) * 18, r() * 12, (r() - 0.5) * 18], i * 3);
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    return g;
  };
  const ru = { uTime: { value: 0 }, uPx: { value: 300 }, uA: { value: 0 } };
  const nu = { uTime: { value: 0 }, uPx: { value: 300 }, uA: { value: 0 } };
  const rain = new THREE.Points(mk(2600, 4), particleMat('rain', ru));
  const snow = new THREE.Points(mk(900, 8), particleMat('snow', nu));
  rain.frustumCulled = snow.frustumCulled = false;
  scene.add(rain, snow);
  /* 웅덩이 */
  const pu = { uWet: { value: 0 }, uTime: { value: 0 }, uSky: { value: new THREE.Color() }, uDeep: { value: new THREE.Color(0x2a3140) } };
  const puddleMat = new THREE.ShaderMaterial({
    uniforms: pu,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vW;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform float uWet, uTime; uniform vec3 uSky, uDeep;
      varying vec2 vUv; varying vec3 vW;
      void main(){
        vec2 p = vUv * 2.0 - 1.0;
        float edge = smoothstep(1.0, 0.75, length(p));
        vec3 V = normalize(cameraPosition - vW);
        float fres = 0.25 + 0.75 * pow(1.0 - clamp(V.y, 0.0, 1.0), 2.0);
        vec3 col = mix(uDeep, uSky * 1.45, fres);
        vec2 g = vW.xz * 2.2;
        vec2 cell = floor(g);
        vec2 f = fract(g) - 0.5;
        float h = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
        float ph = fract(uTime * 1.3 + h);
        vec2 o = (vec2(h, fract(h * 7.31)) - 0.5) * 0.3;
        float d = length(f - o);
        float ring = smoothstep(0.035, 0.0, abs(d - ph * 0.42)) * (1.0 - ph);
        col += ring * 0.6;
        gl_FragColor = vec4(col, edge * uWet * 0.92);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const pg = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
  const puddles: [number, number, number, number][] = [
    [0.6, 0.5, 0.75, 0.55],
    [-1.0, -0.7, 0.5, 0.4],
    [-1.9, 3.7, 0.6, 0.45],
    [4.4, -0.2, 0.55, 0.4],
    [1.6, -2.4, 0.45, 0.35],
    [-4.8, -0.4, 0.6, 0.45],
  ];
  for (const [x, z, sx, sz] of puddles) {
    const m = new THREE.Mesh(pg, puddleMat);
    m.position.set(x, 0.085, z);
    m.scale.set(sx, 1, sz);
    m.renderOrder = 1;
    scene.add(m);
  }
  /* 원래 색 기억 (눈 쌓임) */
  const grass0 = vil.grassMat.color.clone();
  const roof0 = vil.roofMats.map((m) => m.color.clone());
  const leaf0 = vil.leafMats.map((m) => m.color.clone());
  const stone0 = vil.stoneMat.color.clone();
  const snowC = C(0xf4f8ff);
  const wetGrass = C(0x4f8f3e);
  const hud = new Hud();
  const st = { auto: true, w: 1, amount: 1 };
  const wts = [1, 0, 0, 0];
  let acc = 0;
  let flash = 0;
  let nextFlash = 2;
  let cur = 0;
  const tc = new THREE.Color();
  const tc2 = new THREE.Color();
  return {
    scene,
    camera: cam,
    update(t, dt) {
      dt = Math.min(dt, 0.05);
      cur = st.auto ? Math.floor(t / 4) % 4 : st.w;
      for (let i = 0; i < 4; i++) wts[i]! += ((i === cur ? 1 : 0) - wts[i]!) * (1 - Math.exp(-dt * 2.2));
      let sunI = 0;
      let hemiI = 0;
      let fd = 0;
      tc.setRGB(0, 0, 0);
      tc2.setRGB(0, 0, 0);
      for (let i = 0; i < 4; i++) {
        const W = WEATHER[i]!;
        const k = wts[i]!;
        sunI += W.sun * k;
        hemiI += W.hemi * k;
        fd += W.fog * k;
        tc.r += W.top.r * k;
        tc.g += W.top.g * k;
        tc.b += W.top.b * k;
        tc2.r += W.hor.r * k;
        tc2.g += W.hor.g * k;
        tc2.b += W.hor.b * k;
      }
      /* 번개 */
      if (wts[1]! > 0.7 && t > nextFlash) {
        flash = 1;
        nextFlash = t + 2.5 + hash1(Math.floor(t)) * 3;
      }
      flash = Math.max(0, flash - dt * 6);
      const fl = flash > 0.5 || (flash > 0.15 && flash < 0.3) ? 1 : 0;
      sky.u.uTop.value.copy(tc).lerp(C(0xc8d4ff), fl * 0.5);
      sky.u.uHor.value.copy(tc2).lerp(C(0xffffff), fl * 0.4);
      sky.u.uBot.value.copy(tc2).multiplyScalar(0.8);
      sky.u.uSunK.value = wts[0]! * 0.7;
      sun.intensity = sunI;
      hemi.intensity = hemiI + fl * 2.2;
      fog.color.copy(tc2);
      fog.density = fd * (0.5 + 0.5 * st.amount);
      ru.uA.value = wts[1]! * st.amount;
      nu.uA.value = wts[2]! * st.amount;
      ru.uTime.value = t;
      nu.uTime.value = t;
      rain.visible = ru.uA.value > 0.01;
      snow.visible = nu.uA.value > 0.01;
      /* 젖은 바닥 · 눈 쌓임 */
      const wet = wts[1]!;
      acc += ((cur === 2 ? 1 : 0) * st.amount - acc) * (1 - Math.exp(-dt * (cur === 2 ? 1.8 : 1.6)));
      pu.uWet.value = wet;
      pu.uTime.value = t;
      pu.uSky.value.copy(tc2);
      vil.grassMat.color.copy(grass0).lerp(wetGrass, wet * 0.6).lerp(snowC, acc * 0.95);
      vil.grassMat.roughness = lerp(0.92, 0.45, wet);
      vil.stoneMat.color.copy(stone0).multiplyScalar(1 - wet * 0.35).lerp(snowC, acc * 0.8);
      vil.stoneMat.roughness = lerp(0.8, 0.2, wet);
      vil.roofMats.forEach((m, i) => m.color.copy(roof0[i]!).lerp(snowC, acc * 0.75));
      vil.leafMats.forEach((m, i) => m.color.copy(leaf0[i]!).lerp(snowC, acc * 0.45));
      vil.winMat.emissiveIntensity = (1 - wts[0]!) * 1.1;
      vil.lampMat.emissiveIntensity = 0.4 + (1 - wts[0]!) * 2;
      const yaw = 0.4 + t * 0.08;
      cam.position.set(Math.sin(yaw) * 13.5, 7.5, Math.cos(yaw) * 13.5);
      cam.lookAt(0, 0.5, 0);
    },
    render(r, w, h) {
      ru.uPx.value = h;
      nu.uPx.value = h;
      withState(r, () => {
        r.render(scene, cam);
        const u = Math.min(1.9, w / 280, h / 175);
        hud.label('a', WEATHER[cur]!.name, 10 * u, 10 * u, 20 * u, { bg: 'rgba(14,20,44,0.75)' });
        hud.draw(r, w, h);
      });
    },
    controls: [
      { type: 'toggle', label: '날씨 자동으로 바꾸기', value: true, on: (v) => (st.auto = v) },
      { type: 'range', label: '날씨 (0 맑음 · 1 비 · 2 눈 · 3 안개)', min: 0, max: 3, step: 1, value: 1, on: (v) => ((st.w = v), (st.auto = false)) },
      { type: 'range', label: '세기 (입자 · 안개)', min: 0.2, max: 1.5, step: 0.05, value: 1, on: (v) => (st.amount = v) },
    ] as Control[],
    dispose() {
      disposeTree(scene);
      pg.dispose();
      hud.dispose();
    },
  };
}

/* ───────────── 내보내기 ───────────── */

export const DEMOS: DemoMap = {
  i426: { kind: '3d', caption: '병아리를 스프링으로 따라가며 가는 쪽을 앞질러 보여 줌 — 지도: 노랑 = 카메라 시야, 분홍 = 바라보는 곳', make: () => demoFollow() },
  i427: { kind: '3d', caption: '화면 비율이 바뀌어도 판이 꽉 차게 거리 · 중심을 다시 계산 — 가로 폰 · 세로 폰 · 태블릿', make: () => demoBoardFit() },
  i428: { kind: '3d', caption: '결정적 한 수에서 느린 화면 + 확대로 다가갔다 돌아옴', make: () => demoDramatic() },
  i429: { kind: '3d', caption: '상자가 떨어지면 부드러운 잡음으로 흔들고 빠르게 잦아듦 — 위 막대 = 흔들림 세기', make: () => demoShake() },
  i430: { kind: '3d', caption: '장소 사이를 원호로 날아가며 바라보는 곳도 함께 옮김 — 지도: 흰 선 = 궤도, 빨강 = 직선', make: () => demoOrbit() },
  i431: { kind: '3d', caption: '해 각도 하나로 빛 색 · 세기 · 그림자 길이 · 하늘색이 함께 — 아침 · 낮 · 노을 · 밤', make: () => demoDay() },
  i432: { kind: '3d', caption: '전체는 어둡게, 켜진 창 · 가로등만 밝게 — 대비가 주인공', make: () => demoNight() },
  i433: { kind: '3d', caption: '창으로 드는 빛 기둥 + 떠도는 먼지 + 따뜻한 전등 + 바닥 반사광 흉내', make: () => demoIndoor() },
  i434: { kind: '3d', caption: '맑음 → 비 → 눈 → 안개: 입자 · 안개 · 빛 세기를 함께, 비 오면 젖은 바닥 · 웅덩이 물결', make: () => demoWeather() },
};

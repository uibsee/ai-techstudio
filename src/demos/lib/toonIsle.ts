import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Scene3D } from '../types';

/**
 * i222 툰 물 · 기슭 거품 — 섬 · 배 · 소품까지 같은 툰 그림체로 (2026-10-08 다시)
 *  - 물: 섬 높이를 알아 물 깊이로 색 3단 + 기슭 거품 띠 + 밀려가는 물결 줄 (원래 그대로)
 *    + 배 뒤 V자 물거품 자국 · 배 둘레 물보라 · 물 위 바위 둘레 거품 고리
 *  - 물체: 명암 3단 계단(MeshToonMaterial) + 뒤집은 껍데기 외곽선(물체 색을 짙게 한 색)
 *  - 섬: 모래 테 → 풀 언덕(층 하나 솟음) · 야자수(마디 줄기 · 처진 잎 · 코코넛) · 바위 · 덤불 · 꽃 · 등대 · 나무 선착장
 *  - 배: 뾰족한 뱃머리 몸통(아래로 좁아짐) · 흰 띠 · 갑판 · 선실 · 휜 돛(줄무늬) · 펄럭이는 깃발, 갈매기 둘
 */

const TAU = Math.PI * 2;
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const smooth = (a: number, b: number, x: number): number => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

const NOISE = /* glsl */ `
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}`;

/** 섬 높이 — 물 셰이더와 같은 식 (물 아래 깊이를 셰이더가 다시 계산한다) */
const ISLANDS: [number, number, number, number][] = [
  [-2.3, -0.5, 1.55, 1.15],
  [2.1, 0.3, 1.2, 0.95],
  [0.15, -2.6, 0.85, 0.72],
  [0.5, 2.0, 0.55, 0.62],
];
function islandH(x: number, z: number): number {
  let h = -0.6;
  for (const [cx, cz, r, a] of ISLANDS) h += a * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r));
  return h + 0.07 * Math.sin(x * 1.7 + z * 0.9) * Math.cos(z * 1.3 - x * 0.4);
}
/** 보이는 땅 높이 — 모래 테 위로 풀 언덕이 한 층 솟는다 (물 아래는 islandH 그대로) */
function landH(x: number, z: number): number {
  const h = islandH(x, z);
  if (h < 0.1) return h;
  return 0.1 + (h - 0.1) * 0.45 + smooth(0.16, 0.22, h) * 0.12;
}

/** 물체 색을 짙게 한 외곽선 — 뒤집은 껍데기 (법선 방향으로 부풀려 뒷면만) */
function inkMat(inkMats: Map<string, THREE.ShaderMaterial>, color: THREE.Color, width: number): THREE.ShaderMaterial {
  const key = `${color.getHexString()}-${width}`;
  let m = inkMats.get(key);
  if (!m) {
    m = new THREE.ShaderMaterial({
      uniforms: { uCol: { value: color.clone() }, uW: { value: width } },
      vertexShader: /* glsl */ `uniform float uW;
        void main(){
          vec4 w = modelMatrix * vec4(position, 1.0);
          vec3 n = normalize(mat3(modelMatrix) * normal);
          float k = length((viewMatrix * w).xyz);
          w.xyz += n * uW * clamp(k * 0.12, 0.6, 1.6);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `uniform vec3 uCol; void main(){ gl_FragColor = vec4(uCol, 1.0); }`,
      side: THREE.BackSide,
    });
    inkMats.set(key, m);
  }
  return m;
}

export function makeToonIsle(): Scene3D {
  const scene = new THREE.Scene();
  {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 256;
    const g = c.getContext('2d')!;
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#7fc8ff');
    gr.addColorStop(0.7, '#bfe6ff');
    gr.addColorStop(1, '#e8f6ff');
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    scene.background = t;
  }
  const cam = new THREE.PerspectiveCamera(38, 1.6, 0.1, 80);
  scene.add(new THREE.HemisphereLight(0xe4f4ff, 0x5a7a60, 1.25));
  const sun = new THREE.DirectionalLight(0xfff2d6, 2.6);
  sun.position.set(-4, 7, 3);
  scene.add(sun);
  const root = new THREE.Group();
  scene.add(root);

  // 명암 계단 3단 — 그늘 · 중간 · 밝음
  const ramp = (() => {
    const d = new Uint8Array([120, 120, 120, 255, 196, 196, 196, 255, 255, 255, 255, 255]);
    const t = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
    t.minFilter = t.magFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return t;
  })();
  const toonMats: { toon: THREE.MeshToonMaterial; plain: THREE.MeshStandardMaterial }[] = [];
  const T = (color: number, vc = false): THREE.MeshToonMaterial => {
    const toon = new THREE.MeshToonMaterial({ color, gradientMap: ramp, vertexColors: vc });
    const plain = new THREE.MeshStandardMaterial({ color, vertexColors: vc, roughness: 0.7 });
    toonMats.push({ toon, plain });
    return toon;
  };
  const inks: THREE.Mesh[] = [];
  const inkMats = new Map<string, THREE.ShaderMaterial>();
  /** 외곽선 껍데기 붙이기 — 각진 모양도 틈 없게 정점을 합쳐 부드러운 법선으로 */
  const ink = (m: THREE.Mesh, w = 0.012, col?: number): THREE.Mesh => {
    const base = col !== undefined ? new THREE.Color(col) : (m.material as THREE.MeshToonMaterial).color.clone().multiplyScalar(0.32);
    const g0 = m.geometry.clone();
    for (const k of Object.keys(g0.attributes)) if (k !== 'position') g0.deleteAttribute(k);
    const g = mergeVertices(g0, 1e-4);
    g0.dispose();
    g.computeVertexNormals();
    const hull = new THREE.Mesh(g, inkMat(inkMats, base, w));
    m.add(hull);
    inks.push(hull);
    return m;
  };

  /* ── 땅 ── */
  const tg = new THREE.PlaneGeometry(16, 12, 220, 165).rotateX(-Math.PI / 2);
  {
    const pos = tg.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const wet = new THREE.Color(0xe2c58a);
    const sand = new THREE.Color(0xf6e1a8);
    const g1 = new THREE.Color(0x8fdc5c);
    const g2 = new THREE.Color(0x6cc24f);
    const cliff = new THREE.Color(0xd9b97c);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = islandH(x, z);
      pos.setY(i, landH(x, z));
      const patch = 0.5 + 0.5 * Math.sin(x * 2.1 + Math.sin(z * 1.7) * 1.4) * Math.cos(z * 1.9 - x * 0.6);
      if (h < 0.02) c.copy(wet);
      else if (h < 0.15) c.copy(wet).lerp(sand, smooth(0.02, 0.05, h));
      else c.copy(cliff).lerp(patch > 0.55 ? g2 : g1, smooth(0.165, 0.19, h));
      col.set([c.r, c.g, c.b], i * 3);
    }
    tg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    tg.computeVertexNormals();
  }
  const land = new THREE.Mesh(tg, T(0xffffff, true));
  root.add(land);

  /* ── 야자수: 마디 줄기(휜 곡선) · 처진 잎(가운데 접힌 띠) · 코코넛 ── */
  const frondGeo = (() => {
    const SEG = 10;
    const p: number[] = [];
    const cl: number[] = [];
    const idx: number[] = [];
    const light = new THREE.Color(0x5fd25a);
    const dark = new THREE.Color(0x2f9a45);
    for (let i = 0; i <= SEG; i++) {
      const u = i / SEG;
      const x = u * 0.62;
      const y = 0.16 * Math.sin(u * 2.4) - u * u * 0.34;
      const w = 0.13 * Math.sin(Math.PI * Math.pow(u, 0.7)) + 0.01;
      // 가운데 잎맥이 살짝 솟은 V 단면: 왼 · 가운데 · 오른
      p.push(x, y - w * 0.25, -w, x, y + 0.012, 0, x, y - w * 0.25, w);
      for (const k of [0, 1, 2]) {
        const c = k === 1 ? light : dark.clone().lerp(light, 0.35 + u * 0.3);
        cl.push(c.r, c.g, c.b);
      }
      if (i < SEG) {
        const a = i * 3;
        idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  })();
  const frondMat = T(0xffffff, true);
  frondMat.side = THREE.DoubleSide;
  const barkA = T(0xb07a45);
  const barkB = T(0x8f5f35);
  const nutMat = T(0x7a4a28);
  const ringGeo = new THREE.CylinderGeometry(0.055, 0.07, 0.11, 8);
  const nutGeo = new THREE.SphereGeometry(0.045, 10, 8);
  const palms: { g: THREE.Group; crown: THREE.Group; ph: number }[] = [];
  const palm = (x: number, z: number, lean: number, dir: number, s: number): void => {
    const g = new THREE.Group();
    const y0 = landH(x, z);
    g.position.set(x, y0 - 0.02, z);
    g.rotation.y = dir;
    g.scale.setScalar(s);
    const N = 9;
    let top = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      const ring = new THREE.Mesh(ringGeo, i % 2 ? barkB : barkA);
      ring.position.set(lean * u * u * 0.9, 0.06 + i * 0.1, 0);
      ring.rotation.z = -lean * u * 1.5;
      ring.scale.setScalar(1 - u * 0.28);
      ink(ring, 0.008);
      g.add(ring);
      top = ring.position.clone();
    }
    const crown = new THREE.Group();
    crown.position.copy(top).add(new THREE.Vector3(0, 0.05, 0));
    for (let k = 0; k < 7; k++) {
      const f = new THREE.Mesh(frondGeo, frondMat);
      f.rotation.y = (k / 7) * TAU + 0.3;
      f.rotation.z = 0.15 + (k % 2) * 0.12;
      ink(f, 0.006, 0x1d5a2c);
      crown.add(f);
    }
    for (let k = 0; k < 3; k++) {
      const n = new THREE.Mesh(nutGeo, nutMat);
      n.position.set(Math.cos(k * 2.1) * 0.05, -0.04, Math.sin(k * 2.1) * 0.05);
      ink(n, 0.006);
      crown.add(n);
    }
    g.add(crown);
    root.add(g);
    palms.push({ g, crown, ph: x * 3.1 + z });
  };
  palm(-2.55, -0.75, 0.28, 0.4, 1.05);
  palm(-1.85, -0.05, 0.2, 2.2, 0.9);
  palm(-2.9, 0.1, 0.15, -1.2, 0.8);
  palm(2.25, 0.45, 0.25, 3.0, 1.0);
  palm(0.15, -2.62, 0.22, 1.2, 0.85);

  /* ── 바위 · 덤불 · 꽃 ── */
  const rockGeo = (() => {
    const g = new THREE.IcosahedronGeometry(0.16, 1);
    const p = g.attributes.position as THREE.BufferAttribute;
    const r = rng(7);
    const seen = new Map<string, number>();
    for (let i = 0; i < p.count; i++) {
      const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
      let s = seen.get(k);
      if (s === undefined) {
        s = 0.82 + r() * 0.3;
        seen.set(k, s);
      }
      p.setXYZ(i, p.getX(i) * s, Math.max(-0.05, p.getY(i) * s * 0.75), p.getZ(i) * s);
    }
    // 깎은 면이 보이게 면마다 법선 (외곽선은 정점을 다시 합쳐 쓴다)
    const f = g.toNonIndexed();
    g.dispose();
    f.computeVertexNormals();
    return f;
  })();
  const rockMat = T(0xa9b4c2);
  const rocks: THREE.Vector3[] = [];
  const rock = (x: number, z: number, s: number, inWater = false): void => {
    const m = new THREE.Mesh(rockGeo, rockMat);
    m.position.set(x, inWater ? -0.02 : landH(x, z) - 0.02, z);
    m.scale.setScalar(s);
    m.rotation.y = x * 4.1 + z;
    ink(m, 0.01);
    root.add(m);
    if (inWater) rocks.push(new THREE.Vector3(x, z, 0.16 * s * 0.95));
  };
  rock(-1.2, -0.95, 0.9);
  rock(-1.35, -0.75, 0.55);
  rock(2.95, 0.05, 0.8);
  rock(-0.9, 1.15, 1.2, true);
  rock(-0.65, 1.35, 0.7, true);
  rock(3.6, -1.2, 1.0, true);
  rock(-3.9, -1.8, 0.9, true);
  const bushMat = T(0x58b84c);
  const bushGeo = new THREE.IcosahedronGeometry(0.12, 2);
  const bush = (x: number, z: number, s: number): void => {
    const g = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const b = new THREE.Mesh(bushGeo, bushMat);
      b.position.set(Math.cos(k * 2.2) * 0.09, 0.06 + (k === 0 ? 0.04 : 0), Math.sin(k * 2.2) * 0.09);
      b.scale.setScalar(k === 0 ? 1.15 : 0.9);
      ink(b, 0.008);
      g.add(b);
    }
    g.position.set(x, landH(x, z) - 0.02, z);
    g.scale.setScalar(s);
    root.add(g);
  };
  bush(-2.1, -0.9, 1);
  bush(-2.75, -0.35, 0.8);
  bush(1.85, 0.05, 0.9);
  bush(2.45, 0.75, 0.7);
  bush(0.35, -2.45, 0.7);
  const flowerGeo = new THREE.SphereGeometry(0.03, 8, 6);
  const FL = [0xff6f9a, 0xffd24a, 0xffffff, 0xb98cff];
  {
    const r = rng(13);
    for (let i = 0; i < 26; i++) {
      const isl = ISLANDS[i % 2]!;
      const a = r() * TAU;
      const d = Math.sqrt(r()) * isl[2] * 0.55;
      const x = isl[0] + Math.cos(a) * d;
      const z = isl[1] + Math.sin(a) * d;
      if (islandH(x, z) < 0.2) continue;
      const f = new THREE.Mesh(flowerGeo, T(FL[i % FL.length]!));
      f.position.set(x, landH(x, z) + 0.02, z);
      root.add(f);
    }
  }

  /* ── 등대 (작은 섬) ── */
  const lighthouse = new THREE.Group();
  {
    const [lx, lz] = [0.5, 2.0];
    lighthouse.position.set(lx, landH(lx, lz) - 0.03, lz);
    const white = T(0xfffaf0);
    const red = T(0xe84a4a);
    const H = 0.9;
    const bands = 5;
    for (let i = 0; i < bands; i++) {
      const y0 = (i / bands) * H;
      const r0 = lerp(0.2, 0.13, i / bands);
      const r1 = lerp(0.2, 0.13, (i + 1) / bands);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, H / bands, 16).translate(0, H / bands / 2, 0), i % 2 ? red : white);
      m.position.y = y0;
      ink(m, 0.008, 0x5a2a2a);
      lighthouse.add(m);
    }
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.17, 0.05, 16), T(0x3b4a6b));
    deck.position.y = H + 0.02;
    ink(deck, 0.008);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.14, 12), new THREE.MeshBasicMaterial({ color: 0xfff1a0 }));
    glass.position.y = H + 0.12;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.16, 16), red);
    cap.position.y = H + 0.26;
    ink(cap, 0.008, 0x5a2a2a);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.02), T(0x6b4a30));
    door.position.set(0, 0.06, 0.2);
    lighthouse.add(deck, glass, cap, door);
    lighthouse.scale.setScalar(0.72);
    root.add(lighthouse);
  }
  /* ── 나무 선착장 (큰 섬에서 물로) ── */
  {
    const plank = T(0xc8925a);
    const post = T(0x8a5a35);
    const dock = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.09), i % 3 === 1 ? post : plank);
      m.position.set(0, 0.1, -i * 0.11);
      m.rotation.y = (i % 2 ? 1 : -1) * 0.03;
      ink(m, 0.006);
      dock.add(m);
    }
    for (const sx of [-0.15, 0.15])
      for (const k of [2, 5, 8]) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.32, 6), post);
        p.position.set(sx, -0.03, -k * 0.11);
        ink(p, 0.006);
        dock.add(p);
      }
    // 뭍 쪽 끝을 큰 섬 모래 테에 붙이고 물길 가운데 쪽으로 뻗게
    const to = new THREE.Vector2(-0.2, 0.4);
    const from = new THREE.Vector2(-2.3, -0.5);
    const dir = to.clone().sub(from).normalize();
    const p = from.clone();
    while (islandH(p.x, p.y) > 0.05) p.addScaledVector(dir, 0.02);
    p.addScaledVector(dir, -0.12);
    dock.position.set(p.x, 0, p.y);
    dock.rotation.y = Math.atan2(-dir.x, -dir.y);
    root.add(dock);
  }

  /* ── 배 ── */
  const boat = new THREE.Group();
  const flagGeo = new THREE.PlaneGeometry(0.12, 0.07, 6, 1).translate(0.06, 0, 0);
  const flagBase = Float32Array.from(flagGeo.attributes.position!.array as Float32Array);
  {
    // 위에서 본 몸통: 둥근 고물 → 뾰족한 이물
    const s = new THREE.Shape();
    s.moveTo(-0.26, -0.08);
    s.quadraticCurveTo(-0.3, 0, -0.26, 0.08);
    s.lineTo(0.08, 0.1);
    s.quadraticCurveTo(0.26, 0.07, 0.34, 0);
    s.quadraticCurveTo(0.26, -0.07, 0.08, -0.1);
    s.lineTo(-0.26, -0.08);
    const hullG = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 3, curveSegments: 14 });
    hullG.rotateX(-Math.PI / 2).translate(0, -0.06, 0);
    // 아래로 갈수록 좁게 (배 밑이 둥글게 모이게)
    const p = hullG.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const k = lerp(0.45, 1, smooth(-0.09, 0.06, y));
      p.setZ(i, p.getZ(i) * k);
      p.setX(i, p.getX(i) * lerp(0.82, 1, smooth(-0.09, 0.06, y)));
    }
    hullG.computeVertexNormals();
    const hull = new THREE.Mesh(hullG, T(0xe0533b));
    ink(hull, 0.01, 0x4a1a14);
    // 흰 띠
    const band = new THREE.Mesh(hullG.clone().scale(1.015, 0.18, 1.04).translate(0, 0.055, 0), T(0xfff6e6));
    const deck = new THREE.Mesh(new THREE.ShapeGeometry(s, 14).rotateX(-Math.PI / 2).scale(0.9, 1, 0.82), T(0xd9a46a));
    deck.position.y = 0.095;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.12), T(0xfffaf0));
    cabin.position.set(-0.12, 0.14, 0);
    ink(cabin, 0.008);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.025, 0.15), T(0x3d7fd6));
    roof.position.set(-0.12, 0.19, 0);
    ink(roof, 0.008);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.035, 0.05), T(0x8fd0ff));
    win.position.set(-0.045, 0.145, 0);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.62, 8), T(0x8a5a35));
    mast.position.set(0.05, 0.4, 0);
    ink(mast, 0.006);
    // 휜 돛 — 세모를 바람 쪽으로 불룩하게, 줄무늬는 정점 색
    const sg = new THREE.BufferGeometry();
    {
      const NS = 8;
      const pp: number[] = [];
      const cc: number[] = [];
      const ii: number[] = [];
      const cream = new THREE.Color(0xfff8ea);
      const stripe = new THREE.Color(0xff8a5c);
      for (let i = 0; i <= NS; i++) {
        const v = i / NS;
        const w = (1 - v) * 0.26;
        for (let j = 0; j <= 4; j++) {
          const u = j / 4;
          pp.push(u * w, 0.12 + v * 0.44, Math.sin(Math.PI * u) * 0.05 * (1 - v));
          const c = Math.floor(v * 5) % 2 ? stripe : cream;
          cc.push(c.r, c.g, c.b);
        }
        if (i < NS)
          for (let j = 0; j < 4; j++) {
            const a = i * 5 + j;
            ii.push(a, a + 1, a + 5, a + 1, a + 6, a + 5);
          }
      }
      sg.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
      sg.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
      sg.setIndex(ii);
      sg.computeVertexNormals();
    }
    const sailM = T(0xffffff, true);
    sailM.side = THREE.DoubleSide;
    const sail = new THREE.Mesh(sg, sailM);
    sail.position.set(0.065, 0.06, 0);
    ink(sail, 0.006, 0x8a5a3a);
    const flag = new THREE.Mesh(flagGeo, T(0xffd34a));
    flag.material.side = THREE.DoubleSide;
    flag.position.set(0.05, 0.69, 0);
    boat.add(hull, band, deck, cabin, roof, win, mast, sail, flag);
    boat.userData['flag'] = flag;
  }
  root.add(boat);

  /* ── 갈매기 둘 ── */
  const gulls: THREE.Group[] = [];
  {
    const wingG = new THREE.BufferGeometry();
    wingG.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.16, 0.03, -0.03, 0.14, 0, 0.04, 0, 0, 0, -0.16, 0.03, -0.03, -0.14, 0, 0.04], 3));
    wingG.computeVertexNormals();
    const gm = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      const w = new THREE.Mesh(wingG, gm);
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(wingG), new THREE.LineBasicMaterial({ color: 0x4a5a70 }));
      g.add(w, edge);
      root.add(g);
      gulls.push(g);
    }
  }

  /* ── 물 ── */
  const uni = {
    uTime: { value: 0 },
    uFoam: { value: 0.12 },
    uToon: { value: 1 },
    uLines: { value: 1 },
    uIsl: { value: ISLANDS.map((v) => new THREE.Vector4(...v)) },
    uRock: { value: Array.from({ length: 4 }, (_, i) => rocks[i] ?? new THREE.Vector3(99, 99, 0)) },
    uBoat: { value: new THREE.Vector4() },
    cShallow: { value: new THREE.Color(0x5fe6dc) },
    cMid: { value: new THREE.Color(0x27b6d6) },
    cDeep: { value: new THREE.Color(0x1673b8) },
    cFoam: { value: new THREE.Color(0xffffff) },
  };
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 40, 1, 1).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      uniforms: uni,
      vertexShader: /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uFoam, uToon, uLines; uniform vec4 uIsl[4]; uniform vec3 uRock[4]; uniform vec4 uBoat;
        uniform vec3 cShallow, cMid, cDeep, cFoam;
        varying vec3 vW;
        ${NOISE}
        float H(vec2 p){ float h = -0.6; for (int i = 0; i < 4; i++){ vec4 s = uIsl[i]; vec2 d = p - s.xy; h += s.w * exp(-dot(d, d) / (s.z * s.z)); }
          return h + 0.07 * sin(p.x * 1.7 + p.y * 0.9) * cos(p.y * 1.3 - p.x * 0.4); }
        void main(){
          float d = -H(vW.xz);
          float n = noise(vW.xz * 2.4 + vec2(uTime * 0.3, uTime * 0.2));
          float dd = d + (n - 0.5) * 0.08;
          vec3 col;
          if (uToon > 0.5) col = dd < 0.16 ? cShallow : (dd < 0.42 ? cMid : cDeep);
          else col = mix(cShallow, mix(cMid, cDeep, smoothstep(0.25, 0.6, dd)), smoothstep(0.02, 0.3, dd));
          float edge = uFoam * (0.8 + 0.2 * sin(uTime * 1.8 + n * 5.0));
          float foam = uToon > 0.5 ? step(dd, edge) : 1.0 - smoothstep(edge * 0.5, edge, dd);
          float ph = fract(uTime * 0.33);
          float ring = uFoam * (1.35 + ph * 1.8);
          float line = (1.0 - smoothstep(0.012, 0.03, abs(dd - ring))) * (1.0 - ph) * step(0.42, noise(vW.xz * 3.2 + 7.0));
          vec2 sp = vW.xz * vec2(0.8, 2.4) + vec2(uTime * 0.3, sin(vW.x * 0.6 + uTime * 0.5) * 0.4);
          float ridge = 1.0 - abs(noise(sp) * 2.0 - 1.0);
          float streak = step(0.94, ridge) * step(0.55, noise(vW.xz * 0.6 + vec2(uTime * 0.12, 0.0))) * step(0.36, dd) * uLines;
          float sp2 = step(0.985, noise(vW.xz * 9.0 + uTime * 0.6)) * step(0.3, dd) * uLines;
          // 물 위 바위 둘레 거품 고리
          float rf = 0.0;
          for (int i = 0; i < 4; i++){
            vec3 r = uRock[i];
            float q = length(vW.xz - r.xy) - r.z;
            float wob = 0.025 * sin(uTime * 2.2 + float(i) * 1.7 + atan(vW.z - r.y, vW.x - r.x) * 3.0);
            rf = max(rf, step(q, 0.06 + wob) * step(-0.05, q));
            rf = max(rf, (1.0 - smoothstep(0.0, 0.015, abs(q - 0.12 - fract(uTime * 0.5 + float(i) * 0.3) * 0.12))) * 0.8 * (1.0 - fract(uTime * 0.5 + float(i) * 0.3)));
          }
          // 배: 뒤로 벌어지는 V자 물거품 · 몸통 둘레 물보라
          vec2 bp = vW.xz - uBoat.xy;
          vec2 fwd = vec2(cos(uBoat.z), -sin(uBoat.z));
          float along = -dot(bp, fwd);
          float side = dot(bp, vec2(-fwd.y, fwd.x));
          float wakeN = noise(vec2(along * 6.0 - uTime * 2.0, side * 9.0));
          float vline = abs(abs(side) - 0.08 - along * 0.32);
          float wake = step(0.0, along) * step(vline, 0.025 + along * 0.03) * step(0.35 - along * 0.18, wakeN) * (1.0 - smoothstep(0.6, 1.8, along)) * uBoat.w;
          float trail = step(0.0, along) * step(abs(side), 0.05 + along * 0.05) * step(0.55 + along * 0.25, wakeN) * (1.0 - smoothstep(0.2, 1.2, along)) * uBoat.w;
          float hullD = length(vec2((-along - 0.03) / 0.36, side / 0.15));
          float spray = step(hullD, 1.18 + 0.08 * sin(uTime * 7.0 + side * 30.0)) * step(0.92, hullD);
          col = mix(col, cFoam, clamp(max(max(foam, max(line * 0.95, max(streak * 0.7, sp2))), max(rf, max(wake, max(trail * 0.85, spray)))), 0.0, 1.0));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  root.add(water);

  let outline = true;
  let toonOn = true;
  const setMats = (): void => {
    const map = new Map<THREE.Material, THREE.Material>();
    for (const { toon, plain } of toonMats) {
      map.set(toon, plain);
      map.set(plain, toon);
      plain.side = toon.side;
    }
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || inks.includes(m)) return;
      const cur = m.material as THREE.Material;
      const isToon = (cur as THREE.MeshToonMaterial).isMeshToonMaterial === true;
      if (isToon !== toonOn && map.has(cur)) m.material = map.get(cur)!;
    });
  };
  const flag = boat.userData['flag'] as THREE.Mesh;
  return {
    scene,
    camera: cam,
    update(t) {
      uni.uTime.value = t;
      // 카메라: 살짝 숨쉬듯 돈다
      const ca = Math.sin(t * 0.12) * 0.18;
      cam.position.set(Math.sin(ca) * 6.6, 5.0, Math.cos(ca) * 6.6);
      cam.lookAt(0, -0.3, -0.1);
      // 배: 섬 사이 8자 길
      const a = t * 0.2;
      const bx = Math.sin(a) * 0.55 - 0.05;
      const bz = Math.sin(a * 2) * 0.7 - 0.55 + Math.cos(a) * 0.6;
      const nx = Math.sin(a + 0.01) * 0.55 - 0.05;
      const nz = Math.sin((a + 0.01) * 2) * 0.7 - 0.55 + Math.cos(a + 0.01) * 0.6;
      const yaw = Math.atan2(-(nz - bz), nx - bx);
      boat.position.set(bx, Math.sin(t * 2.1) * 0.012, bz);
      boat.rotation.set(Math.sin(t * 1.7) * 0.06, yaw, Math.sin(t * 1.3) * 0.04);
      uni.uBoat.value.set(bx, bz, yaw, 1);
      // 깃발 펄럭
      const fp = flag.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < fp.count; i++) {
        const x = flagBase[i * 3]!;
        fp.setZ(i, Math.sin(x * 40 - t * 9) * 0.012 * (x / 0.12));
      }
      fp.needsUpdate = true;
      // 야자 잎 살랑
      for (const p of palms) p.crown.rotation.set(Math.sin(t * 1.3 + p.ph) * 0.05, Math.sin(t * 0.7 + p.ph) * 0.08, Math.sin(t * 1.1 + p.ph) * 0.06);
      gulls.forEach((g, i) => {
        const ga = t * (0.35 + i * 0.08) + i * 2;
        g.position.set(Math.cos(ga) * (1.6 + i * 0.5) - 0.4, 1.4 + i * 0.25 + Math.sin(t * 1.5 + i) * 0.06, Math.sin(ga) * (1.2 + i * 0.4) - 0.2);
        g.rotation.y = -ga;
        const flap = Math.sin(t * 6 + i * 2) * 0.35;
        g.children[0]!.scale.y = 1 + flap;
        g.children[1]!.scale.y = 1 + flap;
      });
    },
    controls: [
      { type: 'range', label: '기슭 거품 폭', min: 0.02, max: 0.3, step: 0.01, value: 0.12, on: (v) => (uni.uFoam.value = v) },
      { type: 'toggle', label: '툰 단계 물 (끄면 매끈한 물)', value: true, on: (v) => (uni.uToon.value = v ? 1 : 0) },
      { type: 'toggle', label: '섬 · 배 툰 명암 (끄면 일반 재질)', value: true, on: (v) => ((toonOn = v), setMats()) },
      { type: 'toggle', label: '외곽선', value: true, on: (v) => ((outline = v), inks.forEach((m) => (m.visible = outline))) },
      { type: 'toggle', label: '만화 물결 줄', value: true, on: (v) => (uni.uLines.value = v ? 1 : 0) },
    ],
    dispose() {
      const seen = new Set<unknown>();
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry && !seen.has(m.geometry)) {
          seen.add(m.geometry);
          m.geometry.dispose();
        }
        const mat = m.material as THREE.Material | undefined;
        if (mat && !seen.has(mat)) {
          seen.add(mat);
          mat.dispose();
        }
      });
      for (const { toon, plain } of toonMats) {
        toon.dispose();
        plain.dispose();
      }
      for (const m of inkMats.values()) m.dispose();
      inkMats.clear();
      ramp.dispose();
      (scene.background as THREE.Texture).dispose();
    },
  };
}

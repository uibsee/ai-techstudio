import * as THREE from 'three';
import { triTable } from 'three/examples/jsm/objects/MarchingCubes.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Control, DemoMap, Scene3D } from './types';

/**
 * 견본 — 3D 모델링 · 절차 (블렌더 없이 코드로 디테일 있게)
 *  i444 공간 군체화 나무 · i445 L-시스템 · i446 SDF 조각 · i447 메타볼 · i448 서브디비전 · i449 스윕 · 로프트
 * 생성은 make() 에서 미리(또는 단계별 캐시) — 카드 프레임마다 다시 만들지 않는다.
 */

type V3 = THREE.Vector3;
type R = THREE.WebGLRenderer;
const FONT = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const ease = (k: number): number => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
const easeBack = (k: number): number => {
  const x = clamp(k, 0, 1) - 1;
  return 1 + 2.4 * x * x * x + 1.4 * x * x;
};
function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
const fmt = (n: number): string => Math.round(n).toLocaleString('ko-KR');

/* ───────────── 환경 · 화면 글씨 ───────────── */

const ENV = new WeakMap<R, THREE.Texture>();
function envFor(r: R): THREE.Texture {
  let e = ENV.get(r);
  if (!e) {
    const pm = new THREE.PMREMGenerator(r);
    const room = new RoomEnvironment();
    e = pm.fromScene(room, 0.04).texture;
    pm.dispose();
    room.dispose();
    ENV.set(r, e);
  }
  return e;
}

class Label {
  readonly canvas = document.createElement('canvas');
  tex = new THREE.CanvasTexture(this.canvas);
  readonly mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  aspect = 1;
  private key = '';
  private at = -1e9;
  /** 글씨가 바뀌어도 0.5초에 한 번만 다시 그린다 (캔버스 글씨 + 텍스처 올리기가 1ms 가까이 들어서) */
  set(text: string, accent = '#ffd76a'): void {
    if (text === this.key) return;
    const now = performance.now();
    if (now - this.at < 500) return;
    this.at = now;
    this.key = text;
    const F = 40;
    const g0 = this.canvas.getContext('2d')!;
    const font = `700 ${F}px ${FONT}`;
    g0.font = font;
    const W = Math.ceil(g0.measureText(text).width + F * 1.2);
    const H = Math.ceil(F * 1.6);
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
      this.tex.dispose();
      this.tex = new THREE.CanvasTexture(this.canvas);
    }
    const g = this.canvas.getContext('2d')!;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(8,12,26,0.62)';
    g.beginPath();
    g.roundRect(1, 1, W - 2, H - 2, H / 2);
    g.fill();
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = text.startsWith('▲') ? accent : '#ffffff';
    g.fillText(text, W / 2, H / 2 + F * 0.04);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
    this.mesh.material.map = this.tex;
    this.mesh.material.needsUpdate = true;
    this.aspect = W / H;
  }
  dispose(): void {
    this.tex.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

class Hud {
  readonly scene = new THREE.Scene();
  readonly cam = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10);
  readonly tl = new Label();
  readonly bl = new Label();
  constructor() {
    this.scene.add(this.tl.mesh, this.bl.mesh);
  }
  render(r: R, w: number, h: number): void {
    const px = clamp(Math.min(h * 0.05, w * 0.03), 10, 19);
    const m = px * 0.7;
    const hh = px * 1.6;
    const place = (l: Label, y: number): void => {
      const ww = hh * l.aspect;
      l.mesh.scale.set(ww, hh, 1);
      l.mesh.position.set(m + ww / 2, h - y - hh / 2, 0);
    };
    place(this.tl, m);
    place(this.bl, h - m - hh);
    const c = this.cam;
    c.left = 0;
    c.right = w;
    c.top = h;
    c.bottom = 0;
    c.updateProjectionMatrix();
    r.autoClear = false;
    r.clearDepth();
    r.render(this.scene, c);
  }
  dispose(): void {
    this.tl.dispose();
    this.bl.dispose();
  }
}

/** 와이어프레임 겹쳐 보기 — 만든 메시 위에 같은 모양 선 */
class Wire {
  on = false;
  readonly mat = new THREE.MeshBasicMaterial({ color: 0x0c1222, wireframe: true, transparent: true, opacity: 0.42, depthWrite: false, toneMapped: false });
  private list: { m: THREE.Mesh; w: THREE.Mesh }[] = [];
  track(m: THREE.Mesh): void {
    let w: THREE.Mesh;
    const im = m as THREE.InstancedMesh;
    if (im.isInstancedMesh) {
      const x = new THREE.InstancedMesh(m.geometry, this.mat, im.instanceMatrix.count);
      x.instanceMatrix = im.instanceMatrix;
      w = x;
    } else w = new THREE.Mesh(m.geometry, this.mat);
    w.castShadow = w.receiveShadow = false;
    w.renderOrder = 2;
    w.raycast = () => {};
    w.visible = false;
    w.userData['wire'] = true;
    m.add(w);
    this.list.push({ m, w });
  }
  sync(): void {
    for (const { m, w } of this.list) {
      w.visible = this.on;
      if (!this.on) continue;
      if (w.geometry !== m.geometry) {
        w.geometry = m.geometry;
        w.updateMorphTargets();
      }
      const im = m as THREE.InstancedMesh;
      if (im.isInstancedMesh) (w as THREE.InstancedMesh).count = im.count;
      if (m.morphTargetInfluences) w.morphTargetInfluences = m.morphTargetInfluences;
    }
  }
}

function triCount(list: THREE.Mesh[]): number {
  let s = 0;
  for (const m of list) {
    if (!m.visible || (m.parent && !m.parent.visible)) continue;
    const g = m.geometry;
    const total = g.index ? g.index.count : g.getAttribute('position').count;
    const n = Math.max(0, Math.min(total, g.drawRange.start + g.drawRange.count) - g.drawRange.start);
    const im = m as THREE.InstancedMesh;
    s += (n / 3) * (im.isInstancedMesh ? im.count : 1);
  }
  return s;
}

function disposeTree(root: THREE.Object3D): void {
  const mats = new Set<THREE.Material>();
  const geos = new Set<THREE.BufferGeometry>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh && !(o as THREE.Line).isLine && !(o as THREE.Points).isPoints) return;
    geos.add(m.geometry);
    for (const x of Array.isArray(m.material) ? m.material : [m.material]) mats.add(x);
  });
  for (const g of geos) g.dispose();
  for (const x of mats) {
    const mm = x as THREE.MeshStandardMaterial;
    mm.map?.dispose();
    x.dispose();
  }
}

/* ───────────── 무대: 하늘 · 빛 · 떠 있는 섬 ───────────── */

function bgTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  const lg = g.createLinearGradient(0, 0, 0, 256);
  lg.addColorStop(0, '#2b4170');
  lg.addColorStop(0.55, '#1b2a4c');
  lg.addColorStop(1, '#0e1529');
  g.fillStyle = lg;
  g.fillRect(0, 0, 256, 256);
  const rg = g.createRadialGradient(128, 120, 10, 128, 120, 150);
  rg.addColorStop(0, 'rgba(120,170,230,0.35)');
  rg.addColorStop(1, 'rgba(120,170,230,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function colorAttr(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const n = g.getAttribute('position').count;
  const c = new THREE.Color(hex);
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = c.r;
    a[i * 3 + 1] = c.g;
    a[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/** 꽃 하나 (꽃잎 다섯 + 노란 속) — 정점 색 */
function flowerGeo(petal: number, heart = 0xffd34d): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU;
    const p = new THREE.SphereGeometry(1, 10, 6);
    p.scale(0.42, 0.12, 0.3);
    p.translate(0.38, 0, 0);
    p.rotateY(a);
    parts.push(colorAttr(p, petal));
  }
  const h = new THREE.SphereGeometry(0.2, 10, 6);
  h.scale(1, 0.7, 1);
  h.translate(0, 0.05, 0);
  parts.push(colorAttr(h, heart));
  const g = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return g;
}

function makeIsland(Rr: number, top: number, side: number, seed: number): THREE.Group {
  const grp = new THREE.Group();
  const P = (x: number, y: number): THREE.Vector2 => new THREE.Vector2(x, y);
  const grass = new THREE.LatheGeometry([P(Rr - 0.07, -0.16), P(Rr - 0.02, -0.13), P(Rr + 0.015, -0.08), P(Rr - 0.015, -0.025), P(Rr - 0.08, 0), P(Rr * 0.5, 0), P(0.001, 0)], 72);
  const gm = new THREE.Mesh(grass, new THREE.MeshStandardMaterial({ color: top, roughness: 0.92 }));
  gm.receiveShadow = true;
  const dirtG = new THREE.LatheGeometry([P(0.001, -0.95), P(Rr * 0.22, -0.92), P(Rr * 0.48, -0.82), P(Rr * 0.72, -0.64), P(Rr * 0.9, -0.42), P(Rr * 0.98, -0.24), P(Rr - 0.05, -0.12)], 72);
  const pos = dirtG.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const c0 = new THREE.Color(side);
  const c1 = new THREE.Color(side).multiplyScalar(0.62);
  const cc = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const band = 0.5 + 0.5 * Math.sin(y * 26 + Math.sin(Math.atan2(pos.getZ(i), pos.getX(i)) * 5) * 0.8);
    cc.copy(c0).lerp(c1, clamp(-y * 0.9, 0, 1) * 0.7 + band * 0.18);
    col.set([cc.r, cc.g, cc.b], i * 3);
  }
  dirtG.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const dm = new THREE.Mesh(dirtG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  grp.add(gm, dm);
  // 풀 포기 · 꽃 · 자갈
  const R0 = rng(seed);
  const tuftParts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 5; k++) {
    const c = new THREE.ConeGeometry(0.018, 0.12 + (k % 2) * 0.05, 4);
    c.translate(0, 0.06, 0);
    c.rotateZ((k - 2) * 0.28);
    c.rotateY(k * 1.3);
    tuftParts.push(c);
  }
  const tuft = mergeGeometries(tuftParts)!;
  for (const p of tuftParts) p.dispose();
  const tuftM = new THREE.InstancedMesh(tuft, new THREE.MeshStandardMaterial({ color: new THREE.Color(top).multiplyScalar(0.78), roughness: 0.9 }), 30);
  const fl = new THREE.InstancedMesh(flowerGeo(0xffffff), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), 12);
  const pb = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xa9a49c, roughness: 0.85 }), 8);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const place = (im: THREE.InstancedMesh, i: number, sc: number, sy = 1): void => {
    const a = R0() * TAU;
    const r = Rr * (0.6 + R0() * 0.33);
    p.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R0() * TAU);
    s.set(sc, sc * sy, sc);
    im.setMatrixAt(i, m4.compose(p, q, s));
  };
  for (let i = 0; i < 30; i++) place(tuftM, i, 0.8 + R0() * 0.6);
  const pal = [0xffffff, 0xffc4dc, 0xfff1a8, 0xd9c8ff];
  for (let i = 0; i < 12; i++) {
    place(fl, i, 0.06 + R0() * 0.03);
    fl.setColorAt(i, new THREE.Color(pal[i % 4]!));
  }
  for (let i = 0; i < 8; i++) place(pb, i, 0.04 + R0() * 0.04, 0.55);
  for (const im of [tuftM, fl, pb]) {
    im.castShadow = true;
    im.receiveShadow = true;
    grp.add(im);
  }
  return grp;
}

interface StageOpt {
  cam: [number, number, number];
  look: [number, number, number];
  fov?: number;
  island?: number;
  top?: number;
  side?: number;
  shadow?: number;
}
class Stage {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly hud = new Hud();
  readonly wire = new Wire();
  readonly spin = new THREE.Group();
  readonly models: THREE.Mesh[] = [];
  readonly sun: THREE.DirectionalLight;
  private bg = bgTexture();
  constructor(o: StageOpt) {
    this.scene.background = this.bg;
    this.camera = new THREE.PerspectiveCamera(o.fov ?? 34, 16 / 10, 0.1, 60);
    this.camera.position.set(...o.cam);
    this.camera.lookAt(new THREE.Vector3(...o.look));
    this.scene.add(new THREE.HemisphereLight(0xdcecff, 0x5b4a3a, 0.95));
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.3);
    sun.position.set(3, 6.5, 4);
    sun.castShadow = true;
    const S = o.shadow ?? 2.6;
    const sc = sun.shadow.camera;
    sc.left = -S;
    sc.right = S;
    sc.top = S;
    sc.bottom = -S;
    sc.near = 1;
    sc.far = 20;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.025;
    sun.shadow.radius = 4;
    this.sun = sun;
    const rim = new THREE.DirectionalLight(0xa9c9ff, 0.9);
    rim.position.set(-4, 3, -4);
    this.scene.add(sun, rim);
    this.scene.add(this.spin);
    if (o.island) this.spin.add(makeIsland(o.island, o.top ?? 0x86c95a, o.side ?? 0x9a6a44, 7));
  }
  /** 만든 모델 등록 — 그림자 · 와이어 · 삼각형 수 */
  model<T extends THREE.Mesh>(m: T, wire = true): T {
    m.castShadow = true;
    m.receiveShadow = true;
    this.models.push(m);
    if (wire) this.wire.track(m);
    return m;
  }
  tris(): number {
    return triCount(this.models);
  }
  draw(r: R, w: number, h: number): void {
    this.scene.environment = envFor(r);
    this.scene.environmentIntensity = 0.42;
    this.wire.sync();
    const se = r.shadowMap.enabled;
    const st = r.shadowMap.type;
    const ac = r.autoClear;
    try {
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFShadowMap;
      r.render(this.scene, this.camera);
      this.hud.render(r, w, h);
    } finally {
      r.shadowMap.enabled = se;
      r.shadowMap.type = st;
      r.autoClear = ac;
    }
  }
  dispose(): void {
    disposeTree(this.scene);
    this.hud.dispose();
    this.bg.dispose();
    this.wire.mat.dispose();
  }
  /** 3D 장면 꼴로 */
  out(extra: Partial<Scene3D>): Scene3D {
    return { scene: this.scene, camera: this.camera, render: (r, w, h) => this.draw(r, w, h), ...extra, dispose: () => { extra.dispose?.(); this.dispose(); } };
  }
}

/* ───────────── 가지 튜브 (나무 두 견본이 함께 씀) ───────────── */

interface Chain {
  pts: V3[];
  rad: number[];
}
/** 갈래 사슬 → 가늘어지는 튜브 (평행 이동 틀, 끝은 뾰족하게 닫음) */
function tubeGeo(chains: Chain[], radial: number, colorOf: (r: number, out: THREE.Color) => void, vScale = 3): THREE.BufferGeometry {
  let nv = 0;
  let ni = 0;
  for (const c of chains) {
    if (c.pts.length < 2) continue;
    nv += c.pts.length * (radial + 1) + 1;
    ni += (c.pts.length - 1) * radial * 6 + radial * 3;
  }
  const pos = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const uv = new Float32Array(nv * 2);
  const col = new Float32Array(nv * 3);
  const idx = new Uint32Array(ni);
  const T = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();
  const d = new THREE.Vector3();
  const cc = new THREE.Color();
  let v = 0;
  let k = 0;
  for (const c of chains) {
    const n = c.pts.length;
    if (n < 2) continue;
    const base = v;
    let L = 0;
    for (let i = 0; i < n; i++) {
      const p = c.pts[i]!;
      const pa = c.pts[Math.max(0, i - 1)]!;
      const pb = c.pts[Math.min(n - 1, i + 1)]!;
      T.subVectors(pb, pa).normalize();
      if (i === 0) {
        N.set(0, 1, 0);
        if (Math.abs(T.y) > 0.9) N.set(1, 0, 0);
        N.crossVectors(T, N).normalize();
      } else {
        N.addScaledVector(T, -N.dot(T));
        if (N.lengthSq() < 1e-8) N.set(1, 0, 0).cross(T);
        N.normalize();
        L += p.distanceTo(c.pts[i - 1]!);
      }
      B.crossVectors(T, N);
      const r = c.rad[i]!;
      colorOf(r, cc);
      for (let j = 0; j <= radial; j++) {
        const a = (j / radial) * TAU;
        d.copy(N).multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
        pos.set([p.x + d.x * r, p.y + d.y * r, p.z + d.z * r], v * 3);
        nor.set([d.x, d.y, d.z], v * 3);
        uv.set([(j / radial) * 2, L * vScale], v * 2);
        col.set([cc.r, cc.g, cc.b], v * 3);
        v++;
      }
    }
    for (let i = 0; i < n - 1; i++)
      for (let j = 0; j < radial; j++) {
        const a = base + i * (radial + 1) + j;
        const b = a + radial + 1;
        idx.set([a, a + 1, b, a + 1, b + 1, b], k);
        k += 6;
      }
    const pl = c.pts[n - 1]!;
    const rl = c.rad[n - 1]!;
    pos.set([pl.x + T.x * rl * 1.6, pl.y + T.y * rl * 1.6, pl.z + T.z * rl * 1.6], v * 3);
    nor.set([T.x, T.y, T.z], v * 3);
    uv.set([0, (L + rl) * vScale], v * 2);
    colorOf(rl, cc);
    col.set([cc.r, cc.g, cc.b], v * 3);
    const last = base + (n - 1) * (radial + 1);
    for (let j = 0; j < radial; j++) {
      idx.set([last + j, last + j + 1, v], k);
      k += 3;
    }
    v++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

/** 나무 마디(부모 번호가 늘 작음) → 다빈치 굵기 → 사슬 (굵은 아이로 이어 가고, 나머지는 새 사슬) */
interface TreeNodes {
  x: number[];
  y: number[];
  z: number[];
  par: number[];
  kids: number[][];
}
function treeChains(t: TreeNodes, vis: (i: number) => boolean, r0: number, nexp: number): Chain[] {
  const n = t.x.length;
  const r = new Float32Array(n);
  for (let i = n - 1; i >= 0; i--) {
    if (!vis(i)) continue;
    let s = 0;
    for (const c of t.kids[i]!) if (vis(c)) s += Math.pow(r[c]!, nexp);
    r[i] = Math.max(r0, s > 0 ? Math.pow(s, 1 / nexp) : r0);
  }
  const P = (i: number): V3 => new THREE.Vector3(t.x[i]!, t.y[i]!, t.z[i]!);
  const out: Chain[] = [];
  const queue: [number, number][] = [[0, -1]];
  while (queue.length) {
    const [start, from] = queue.pop()!;
    const ch: Chain = { pts: [], rad: [] };
    if (from >= 0) {
      ch.pts.push(P(from));
      ch.rad.push(r[start]!);
    }
    let i = start;
    for (;;) {
      ch.pts.push(P(i));
      ch.rad.push(r[i]!);
      const ks = t.kids[i]!.filter(vis).sort((a, b) => r[b]! - r[a]!);
      if (!ks.length) break;
      for (let q = 1; q < ks.length; q++) queue.push([ks[q]!, i]);
      i = ks[0]!;
    }
    // 한 번 고르게 (끝점은 그대로)
    const p = ch.pts;
    if (p.length > 2) {
      const sm = p.map((v, q) => (q === 0 || q === p.length - 1 ? v.clone() : v.clone().multiplyScalar(0.5).addScaledVector(p[q - 1]!, 0.25).addScaledVector(p[q + 1]!, 0.25)));
      ch.pts = sm;
    }
    out.push(ch);
  }
  return out;
}

function barkTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e4dbd0';
  g.fillRect(0, 0, 64, 128);
  const R0 = rng(11);
  for (let k = 0; k < 46; k++) {
    const x = R0() * 64;
    g.strokeStyle = `rgba(70,45,25,${0.18 + R0() * 0.3})`;
    g.lineWidth = 1 + R0() * 2.5;
    g.beginPath();
    for (let y = -4; y <= 132; y += 8) g.lineTo(x + Math.sin(y * 0.09 + k) * 2.5, y);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 울퉁불퉁한 잎 뭉치 공 */
function leafBlobGeo(): THREE.BufferGeometry {
  const ico = new THREE.IcosahedronGeometry(1, 3);
  ico.deleteAttribute("normal");
  ico.deleteAttribute("uv");
  const g = mergeVertices(ico);
  ico.dispose();
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + 0.13 * Math.sin(x * 4.1 + 1.3) * Math.sin(y * 3.7 + 0.7) * Math.sin(z * 4.3 + 2.1) + 0.05 * Math.sin(x * 9 + y * 7);
    p.setXYZ(i, x * k, (y < -0.2 ? y * 0.82 : y) * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}

/* ───────────── i444 공간 군체화 나무 ───────────── */

interface Colony extends TreeNodes {
  birth: number[];
  ax: Float32Array;
  kill: Float32Array;
  imax: number;
}
function colonize(seed: number, count: number): Colony {
  const R0 = rng(seed);
  const blobs: number[][] = [[0, 2.05, 0, 0.92]];
  const nb = 5 + Math.floor(R0() * 2);
  for (let k = 0; k < nb; k++) {
    const a = (k / nb) * TAU + R0() * 0.7;
    const rr = 0.5 + R0() * 0.28;
    blobs.push([Math.cos(a) * rr, 1.72 + R0() * 0.55, Math.sin(a) * rr, 0.48 + R0() * 0.24]);
  }
  blobs.push([(R0() - 0.5) * 0.3, 2.62, (R0() - 0.5) * 0.3, 0.52]);
  const ax = new Float32Array(count * 3);
  let na = 0;
  for (let tries = 0; na < count && tries < count * 80; tries++) {
    const x = (R0() * 2 - 1) * 1.6;
    const y = 1.0 + R0() * 2.3;
    const z = (R0() * 2 - 1) * 1.6;
    if (blobs.some((b) => (x - b[0]!) ** 2 + (y - b[1]!) ** 2 + (z - b[2]!) ** 2 < b[3]! ** 2)) ax.set([x, y, z], na++ * 3);
  }
  const t: Colony = { x: [], y: [], z: [], par: [], kids: [], birth: [], ax: ax.slice(0, na * 3), kill: new Float32Array(na).fill(1e9), imax: 0 };
  const DI = 0.55;
  const DK = 0.13;
  const D = 0.085;
  const key = (x: number, y: number, z: number): number => (Math.floor(x / DI) + 64) * 16384 + (Math.floor(y / DI) + 64) * 128 + (Math.floor(z / DI) + 64);
  const ngrid = new Map<number, number[]>();
  const agrid = new Map<number, number[]>();
  const add = (x: number, y: number, z: number, par: number, b: number): number => {
    const i = t.x.length;
    t.x.push(x);
    t.y.push(y);
    t.z.push(z);
    t.par.push(par);
    t.kids.push([]);
    t.birth.push(b);
    if (par >= 0) t.kids[par]!.push(i);
    const k = key(x, y, z);
    let l = ngrid.get(k);
    if (!l) ngrid.set(k, (l = []));
    l.push(i);
    return i;
  };
  for (let i = 0; i < na; i++) {
    const k = key(ax[i * 3]!, ax[i * 3 + 1]!, ax[i * 3 + 2]!);
    let l = agrid.get(k);
    if (!l) agrid.set(k, (l = []));
    l.push(i);
  }
  const near = (grid: Map<number, number[]>, x: number, y: number, z: number, fn: (i: number) => void): void => {
    const cx = Math.floor(x / DI);
    const cy = Math.floor(y / DI);
    const cz = Math.floor(z / DI);
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++)
        for (let c = -1; c <= 1; c++) {
          const l = grid.get((cx + a + 64) * 16384 + (cy + b + 64) * 128 + (cz + c + 64));
          if (l) for (const i of l) fn(i);
        }
  };
  // 줄기: 잎 점에 닿을 때까지 위로
  let cur = add(0, -0.15, 0, -1, 0);
  const alive = new Uint8Array(na).fill(1);
  const minDist = (x: number, y: number, z: number): number => {
    let m = 1e9;
    for (let i = 0; i < na; i++) m = Math.min(m, (ax[i * 3]! - x) ** 2 + (ax[i * 3 + 1]! - y) ** 2 + (ax[i * 3 + 2]! - z) ** 2);
    return Math.sqrt(m);
  };
  for (let s = 0; s < 40 && minDist(t.x[cur]!, t.y[cur]!, t.z[cur]!) > DI * 0.95; s++) cur = add(Math.sin(s * 0.7) * 0.012, t.y[cur]! + D, Math.cos(s * 0.5) * 0.01, cur, 0);
  const sum = new Map<number, number[]>();
  let it = 1;
  for (; it < 220; it++) {
    sum.clear();
    for (let a = 0; a < na; a++) {
      if (!alive[a]) continue;
      const x = ax[a * 3]!;
      const y = ax[a * 3 + 1]!;
      const z = ax[a * 3 + 2]!;
      let best = -1;
      let bd = DI * DI;
      near(ngrid, x, y, z, (i) => {
        const d = (t.x[i]! - x) ** 2 + (t.y[i]! - y) ** 2 + (t.z[i]! - z) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      if (best < 0) continue;
      const l = Math.sqrt(bd) || 1;
      let s = sum.get(best);
      if (!s) sum.set(best, (s = [0, 0, 0]));
      s[0]! += (x - t.x[best]!) / l;
      s[1]! += (y - t.y[best]!) / l;
      s[2]! += (z - t.z[best]!) / l;
    }
    if (!sum.size) break;
    const fresh: number[] = [];
    for (const [i, s] of sum) {
      let dx = s[0]! + (R0() - 0.5) * 0.15;
      let dy = s[1]! + 0.12 * Math.hypot(s[0]!, s[1]!, s[2]!);
      let dz = s[2]! + (R0() - 0.5) * 0.15;
      const l = Math.hypot(dx, dy, dz) || 1;
      dx /= l;
      dy /= l;
      dz /= l;
      const x = t.x[i]! + dx * D;
      const y = t.y[i]! + dy * D;
      const z = t.z[i]! + dz * D;
      let dup = false;
      near(ngrid, x, y, z, (j) => {
        if ((t.x[j]! - x) ** 2 + (t.y[j]! - y) ** 2 + (t.z[j]! - z) ** 2 < (D * 0.4) ** 2) dup = true;
      });
      if (!dup) fresh.push(add(x, y, z, i, it));
    }
    if (!fresh.length) break;
    for (const i of fresh)
      near(agrid, t.x[i]!, t.y[i]!, t.z[i]!, (a) => {
        if (alive[a] && (ax[a * 3]! - t.x[i]!) ** 2 + (ax[a * 3 + 1]! - t.y[i]!) ** 2 + (ax[a * 3 + 2]! - t.z[i]!) ** 2 < DK * DK) {
          alive[a] = 0;
          t.kill[a] = it;
        }
      });
  }
  t.imax = it;
  return t;
}

const pointsMat = (): THREE.ShaderMaterial =>
  new THREE.ShaderMaterial({
    uniforms: { uG: { value: 0 }, uSize: { value: 40 } },
    vertexShader: `attribute float aKill; uniform float uG; uniform float uSize; varying float vA;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vA = aKill > uG ? 1.0 : 0.0;
      gl_PointSize = vA * uSize / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; void main(){ if(vA < 0.5) discard; float d = length(gl_PointCoord - 0.5);
      float a = smoothstep(0.5, 0.15, d); gl_FragColor = vec4(1.0, 0.8, 0.35, a * 0.7); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

function demoColony(): Scene3D {
  const st = new Stage({ cam: [0, 1.9, 6.4], look: [0, 1.62, 0], island: 1.5 });
  const bark = new THREE.MeshStandardMaterial({ vertexColors: true, map: barkTexture(), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const trunk = st.model(new THREE.Mesh(new THREE.BufferGeometry(), bark));
  st.spin.add(trunk);
  const blob = leafBlobGeo();
  const leafMat = new THREE.MeshStandardMaterial({ roughness: 0.72, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  let leaves = st.model(new THREE.InstancedMesh(blob, leafMat, 1));
  const appleG = mergeGeometries([colorAttr(new THREE.SphereGeometry(1, 14, 10), 0xe8413a), colorAttr(new THREE.CylinderGeometry(0.08, 0.08, 0.6, 5).translate(0, 1, 0), 0x6b4a2a)])!;
  const apples = new THREE.InstancedMesh(appleG, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 0.6 }), 10);
  apples.castShadow = true;
  st.spin.add(apples);
  const pts = new THREE.Points(new THREE.BufferGeometry(), pointsMat());
  st.spin.add(pts);
  const S = { seed: 3, count: 650, nexp: 2.5, auto: true, stage: 0, showPts: true };
  let col: Colony;
  let stages: THREE.BufferGeometry[] = [];
  let stageAt: number[] = [];
  let tips: number[] = [];
  let tipScale: number[] = [];
  let tipColor: THREE.Color[] = [];
  let appleTips: number[] = [];
  let killSorted: Float32Array = new Float32Array();
  const brown = new THREE.Color(0x6e4429);
  const light = new THREE.Color(0xb58456);
  const barkCol = (r: number, o: THREE.Color): void => {
    o.copy(brown).lerp(light, clamp(1 - r / 0.1, 0, 1));
  };
  const buildStages = (): void => {
    for (const g of stages) g.dispose();
    stages = [];
    stageAt = [];
    const K = 16;
    for (let k = 0; k < K; k++) {
      const s = Math.round(col.imax * Math.pow(k / (K - 1), 0.9));
      stageAt.push(s);
      stages.push(tubeGeo(treeChains(col, (i) => col.birth[i]! <= s, 0.013, S.nexp), 7, barkCol));
    }
  };
  const build = (): void => {
    const t0 = performance.now();
    col = colonize(S.seed, S.count);
    buildStages();
    const R0 = rng(S.seed + 5);
    tips = [];
    for (let i = 1; i < col.x.length; i++) if (!col.kids[i]!.length && col.birth[i]! > 0) tips.push(i);
    tipScale = tips.map(() => 0.12 + R0() * 0.06);
    const greens = [0x5fb34a, 0x76c655, 0x4f9e44, 0x8bd365, 0x69b84d];
    tipColor = tips.map((i) => new THREE.Color(greens[Math.floor(R0() * greens.length)]!).offsetHSL(0, 0, (col.y[i]! - 2) * 0.05));
    appleTips = tips.filter((i) => Math.hypot(col.x[i]!, col.z[i]!) > 0.75 && col.y[i]! < 2.1).sort(() => R0() - 0.5).slice(0, 10);
    st.spin.remove(leaves);
    st.models.splice(st.models.indexOf(leaves), 1);
    leaves.dispose();
    leaves = st.model(new THREE.InstancedMesh(blob, leafMat, Math.max(1, tips.length)));
    tips.forEach((_, k) => leaves.setColorAt(k, tipColor[k]!));
    st.spin.add(leaves);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(col.ax, 3));
    pg.setAttribute('aKill', new THREE.BufferAttribute(col.kill, 1));
    pts.geometry.dispose();
    pts.geometry = pg;
    killSorted = col.kill.slice().sort();
    buildMs = performance.now() - t0;
  };
  let buildMs = 0;
  build();
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sv = new THREE.Vector3();
  const pv = new THREE.Vector3();
  let lastG = -1;
  const setG = (g: number): void => {
    let k = 0;
    while (k + 1 < stageAt.length && stageAt[k + 1]! <= g) k++;
    trunk.geometry = stages[k]!;
    if (Math.abs(g - lastG) < 1e-3) return;
    lastG = g;
    tips.forEach((i, n) => {
      const e = easeBack((g - col.birth[i]! - 1) / 6) * tipScale[n]!;
      pv.set(col.x[i]!, col.y[i]! + 0.03, col.z[i]!);
      q.setFromAxisAngle(sv.set(0, 1, 0), i * 1.7);
      leaves.setMatrixAt(n, m4.compose(pv, q, sv.setScalar(Math.max(1e-4, e))));
    });
    leaves.instanceMatrix.needsUpdate = true;
    appleTips.forEach((i, n) => {
      const e = easeBack((g - col.imax - 5 - n * 0.6) / 3) * 0.055;
      pv.set(col.x[i]! * 1.08, col.y[i]! - 0.12, col.z[i]! * 1.08);
      apples.setMatrixAt(n, m4.compose(pv, q.identity(), sv.setScalar(Math.max(1e-4, e))));
    });
    apples.count = appleTips.length;
    apples.instanceMatrix.needsUpdate = true;
    (pts.material as THREE.ShaderMaterial).uniforms['uG']!.value = g;
  };
  return st.out({
    update(t) {
      let g: number;
      const gEnd = col.imax + 12;
      if (S.auto) {
        const T = 9.5;
        const k = t % T;
        g = k < 6.5 ? (k / 6.5) * gEnd : k < 8.9 ? gEnd : gEnd * (1 - ease((k - 8.9) / 0.6));
      } else g = (S.stage / 15) * gEnd;
      setG(g);
      st.spin.rotation.y = t * 0.22;
      pts.visible = S.showPts;
      let alive = 0;
      for (let lo = 0, hi = killSorted.length; lo < hi; ) {
        const mid = (lo + hi) >> 1;
        if (killSorted[mid]! > g) hi = mid;
        else lo = mid + 1;
        alive = killSorted.length - lo;
      }
      st.hud.tl.set(`▲ 삼각형 ${fmt(st.tris())}`);
      st.hud.bl.set(`남은 잎 점 ${fmt(alive)} · 마디 ${fmt(col.x.length)} · 생성 ${buildMs.toFixed(0)}ms`);
    },
    controls: [
      { type: 'toggle', label: '자동 재생 (자라기)', value: true, on: (v) => (S.auto = v) },
      { type: 'range', label: '자라기 단계', min: 0, max: 15, step: 1, value: 0, on: (v) => ((S.stage = v), (S.auto = false)) },
      { type: 'range', label: '잎 점 수 (끌어당기는 점)', min: 200, max: 1500, step: 50, value: 650, on: (v) => ((S.count = v), build(), (lastG = -1)) },
      { type: 'range', label: '다빈치 굵기 지수 n', min: 2, max: 3.5, step: 0.1, value: 2.5, on: (v) => ((S.nexp = v), buildStages()) },
      { type: 'toggle', label: '잎 점 보기', value: true, on: (v) => (S.showPts = v) },
      { type: 'toggle', label: '와이어프레임', value: false, on: (v) => (st.wire.on = v) },
      { type: 'button', label: '새로 만들기 (시드)', on: () => ((S.seed += 1), build(), (lastG = -1)) },
    ],
    dispose() {
      for (const g of stages) g.dispose();
      blob.dispose();
    },
  });
}

/* ───────────── i445 L-시스템 ───────────── */

interface LPreset {
  name: string;
  axiom: string;
  rules: Record<string, { p: number; s: string }[]>;
  show: string;
  angle: number;
  roll: number;
  yaw: number;
  len: number;
  decay: number;
  jitter: number;
  trop: number;
  r0: number;
  nexp: number;
  leafAt: string;
  bark: [number, number];
}
const LPRESETS: LPreset[] = [
  { name: '나무', axiom: 'FA', rules: { A: [{ p: 0.72, s: 'F[&A]/[&A]/[&A]' }, { p: 0.28, s: 'F[&A]//[&A]' }] }, show: 'A → F[&A]/[&A]/[&A]', angle: 40, roll: 120, yaw: 30, len: 0.42, decay: 0.84, jitter: 0.3, trop: 0.025, r0: 0.014, nexp: 2.3, leafAt: 'A', bark: [0x6e4429, 0xb58456] },
  { name: '고사리', axiom: '[&A]/[&A]/[&A]/[&A]/[&A]/[&A]/[&A]', rules: { A: [{ p: 1, s: 'F[+B][-B]A' }], B: [{ p: 1, s: 'F[+L][-L]B' }] }, show: 'A → F[+B][-B]A · B → F[+L][-L]B', angle: 28, roll: 51.4, yaw: 62, len: 0.2, decay: 0.72, jitter: 0.18, trop: -0.07, r0: 0.005, nexp: 2.7, leafAt: 'LAB', bark: [0x3d7a2e, 0x7cbf52] },
  { name: '산호', axiom: 'A', rules: { A: [{ p: 0.35, s: 'F[&A]//[&A]' }, { p: 0.65, s: 'F[&A]/[&A]/[&A]' }] }, show: 'A → F[&A]/[&A]/[&A] · F[&A]//[&A]', angle: 34, roll: 120, yaw: 30, len: 0.42, decay: 0.8, jitter: 0.4, trop: 0.02, r0: 0.022, nexp: 2.6, leafAt: '', bark: [0xe0506a, 0xffb48a] },
];
interface LSym {
  c: string;
  r: number;
}
function lExpand(p: LPreset, n: number, seed: number): LSym[][] {
  const R0 = rng(seed);
  let cur: LSym[] = [...p.axiom].map((c) => ({ c, r: R0() }));
  const out = [cur];
  for (let i = 0; i < n; i++) {
    const nx: LSym[] = [];
    for (const s of cur) {
      const rs = p.rules[s.c];
      if (!rs) {
        nx.push(s);
        continue;
      }
      let acc = 0;
      let pick = rs[rs.length - 1]!;
      for (const r of rs) if (s.r < (acc += r.p)) { pick = r; break; }
      for (const c of pick.s) nx.push({ c, r: R0() });
    }
    out.push((cur = nx));
  }
  return out;
}
interface LLeaf {
  p: V3;
  q: THREE.Quaternion;
  depth: number;
  r: number;
  c: string;
}
function lTurtle(syms: LSym[], p: LPreset, angle: number): { t: TreeNodes; leaves: LLeaf[] } {
  const t: TreeNodes = { x: [0], y: [0], z: [0], par: [-1], kids: [[]] };
  const leaves: LLeaf[] = [];
  const X = new THREE.Vector3(1, 0, 0);
  const Y = new THREE.Vector3(0, 1, 0);
  const Z = new THREE.Vector3(0, 0, 1);
  const tmpQ = new THREE.Quaternion();
  const H = new THREE.Vector3();
  const ax = new THREE.Vector3();
  let st = { p: new THREE.Vector3(), q: new THREE.Quaternion(), node: 0, depth: 0 };
  const stack: (typeof st)[] = [];
  const rot = (axis: V3, deg: number, r: number): void => {
    st.q.multiply(tmpQ.setFromAxisAngle(axis, THREE.MathUtils.degToRad(deg) * (1 + p.jitter * (r * 2 - 1))));
  };
  for (const s of syms) {
    switch (s.c) {
      case 'F': {
        rot(X, (s.r - 0.5) * 8, 0.5);
        H.copy(Y).applyQuaternion(st.q);
        ax.crossVectors(H, Y);
        const sl = ax.length();
        if (sl > 1e-4) st.q.premultiply(tmpQ.setFromAxisAngle(ax.normalize(), Math.sign(p.trop) * Math.min(Math.abs(p.trop) * sl * 2, sl)));
        if (p.trop < 0 && sl <= 1e-4) st.q.premultiply(tmpQ.setFromAxisAngle(X, 0.05));
        H.copy(Y).applyQuaternion(st.q);
        const L = p.len * Math.pow(p.decay, st.depth) * (0.88 + s.r * 0.24);
        st.p.addScaledVector(H, L);
        const i = t.x.length;
        t.x.push(st.p.x);
        t.y.push(st.p.y);
        t.z.push(st.p.z);
        t.par.push(st.node);
        t.kids.push([]);
        t.kids[st.node]!.push(i);
        st.node = i;
        break;
      }
      case '+': rot(Z, p.yaw, s.r); break;
      case '-': rot(Z, -p.yaw, s.r); break;
      case '&': rot(X, angle, s.r); break;
      case '^': rot(X, -angle, s.r); break;
      case '/': rot(Y, p.roll, s.r); break;
      case '\\': rot(Y, -p.roll, s.r); break;
      case '[': stack.push(st); st = { p: st.p.clone(), q: st.q.clone(), node: st.node, depth: st.depth + 1 }; break;
      case ']': st = stack.pop() ?? st; break;
      default:
        if (p.leafAt.includes(s.c)) leaves.push({ p: st.p.clone(), q: st.q.clone(), depth: st.depth, r: s.r, c: s.c });
    }
  }
  return { t, leaves };
}
/** 잎 카드 (가운데 맥을 따라 V 로 접힘) */
function leafCardGeo(heart = false): THREE.BufferGeometry {
  const S = 9;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= S; i++) {
    const t = i / S;
    const w = heart ? 0.5 * Math.pow(Math.sin(Math.PI * Math.min(1, (t + 0.18) / 1.18)), 0.85) : 0.34 * Math.pow(Math.sin(Math.PI * t), 0.8);
    const bend = -0.12 * t * t;
    for (const s of [-1, 0, 1]) {
      pos.push(s * w, t, bend + Math.abs(s) * w * 0.35);
      const k = s === 0 ? 1.18 : 0.92;
      col.push(k, k, k);
    }
  }
  for (let i = 0; i < S; i++)
    for (let j = 0; j < 2; j++) {
      const a = i * 3 + j;
      idx.push(a, a + 1, a + 3, a + 1, a + 4, a + 3);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

interface LPlant {
  group: THREE.Group;
  trunk: THREE.Mesh;
  leaves: THREE.InstancedMesh;
  flowers: THREE.InstancedMesh;
  geos: THREE.BufferGeometry[];
  leafData: { m: Float32Array; c: Float32Array; n: number }[];
  flowerData: { m: Float32Array; n: number }[];
  set(n: number): void;
  dispose(): void;
}
const LMAX = 5;
function makePlant(st: Stage, preset: LPreset, seed: number, angle: number, mats: { bark: THREE.Material; leaf: THREE.Material; flower: THREE.Material }, leafG: THREE.BufferGeometry, flowerG: THREE.BufferGeometry): LPlant {
  const strs = lExpand(preset, LMAX, seed);
  const R0 = rng(seed + 9);
  const geos: THREE.BufferGeometry[] = [];
  const leafData: LPlant['leafData'] = [];
  const flowerData: LPlant['flowerData'] = [];
  const c0 = new THREE.Color(preset.bark[0]);
  const c1 = new THREE.Color(preset.bark[1]);
  const thick = preset.r0 * 6;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sv = new THREE.Vector3();
  const pv = new THREE.Vector3();
  const greens = preset.name === '고사리' ? [0x4f9e3c, 0x63b347, 0x78c455] : [0x5fb34a, 0x76c655, 0x4f9e44, 0x8bd365];
  let maxL = 1;
  let maxF = 1;
  for (let n = 0; n <= LMAX; n++) {
    const { t, leaves } = lTurtle(strs[n]!, preset, angle);
    geos.push(tubeGeo(treeChains(t, () => true, preset.r0, preset.nexp), preset.name === '산호' ? 10 : 7, (r, o) => o.copy(c0).lerp(c1, clamp(1 - r / thick, 0, 1))));
    const lm: number[] = [];
    const lc: number[] = [];
    const fm: number[] = [];
    for (const lf of leaves) {
      if (preset.name === '나무') {
        for (let k = 0; k < 6; k++) {
          q.copy(lf.q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler((R0() - 0.5) * 2.2, R0() * TAU, (R0() - 0.5) * 2.2)));
          const s = 0.15 + R0() * 0.08;
          m4.compose(pv.copy(lf.p), q, sv.set(s, s, s));
          lm.push(...m4.elements);
          new THREE.Color(greens[Math.floor(R0() * greens.length)]!).toArray(lc, lc.length);
        }
        if (lf.r > 0.8) {
          m4.compose(pv.copy(lf.p).add(new THREE.Vector3(0, 0.04, 0)), q.copy(lf.q), sv.setScalar(0.06));
          fm.push(...m4.elements);
        }
      } else {
        const s = (lf.c === 'L' ? 0.15 : 0.09) * (0.85 + lf.r * 0.3);
        m4.compose(pv.copy(lf.p), q.copy(lf.q), sv.set(s * 0.8, s, s));
        lm.push(...m4.elements);
        new THREE.Color(greens[Math.floor(R0() * greens.length)]!).toArray(lc, lc.length);
      }
    }
    leafData.push({ m: new Float32Array(lm), c: new Float32Array(lc), n: lm.length / 16 });
    flowerData.push({ m: new Float32Array(fm), n: fm.length / 16 });
    maxL = Math.max(maxL, lm.length / 16);
    maxF = Math.max(maxF, fm.length / 16);
  }
  const group = new THREE.Group();
  const trunk = st.model(new THREE.Mesh(geos[0]!, mats.bark));
  const leaves = st.model(new THREE.InstancedMesh(leafG, mats.leaf, maxL));
  const flowers = st.model(new THREE.InstancedMesh(flowerG, mats.flower, maxF), false);
  leaves.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxL * 3), 3);
  group.add(trunk, leaves, flowers);
  const plant: LPlant = {
    group, trunk, leaves, flowers, geos, leafData, flowerData,
    set(n) {
      trunk.geometry = geos[n]!;
      const L = leafData[n]!;
      leaves.instanceMatrix.array.set(L.m);
      leaves.instanceColor!.array.set(L.c);
      leaves.count = L.n;
      leaves.instanceMatrix.needsUpdate = true;
      leaves.instanceColor!.needsUpdate = true;
      const F = flowerData[n]!;
      flowers.instanceMatrix.array.set(F.m);
      flowers.count = F.n;
      flowers.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      group.removeFromParent();
      for (const g of geos) g.dispose();
      for (const m of [trunk, leaves, flowers]) st.models.splice(st.models.indexOf(m), 1);
      leaves.dispose();
      flowers.dispose();
    },
  };
  return plant;
}

function demoLSystem(): Scene3D {
  const st = new Stage({ cam: [0, 1.75, 6.0], look: [0, 1.1, 0], island: 1.7 });
  const po = { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 };
  const mats = {
    bark: new THREE.MeshStandardMaterial({ vertexColors: true, map: barkTexture(), roughness: 0.85, ...po }),
    leaf: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide, ...po }),
    flower: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }),
  };
  const leafG = leafCardGeo();
  const flowerG = flowerGeo(0xffb6d2);
  const S = { seed: 1, preset: 0, angle: 40, auto: true, n: 5 };
  let plants: LPlant[] = [];
  let ms = 0;
  const build = (): void => {
    const t0 = performance.now();
    for (const p of plants) p.dispose();
    plants = [];
    const P = LPRESETS[S.preset]!;
    const main = makePlant(st, P, S.seed, S.angle, mats, leafG, flowerG);
    plants.push(main);
    st.spin.add(main.group);
    if (S.preset === 0) {
      for (const [x, z, k] of [[-1.05, 0.55, 0], [1.0, 0.6, 1], [0.15, 1.05, 2]] as const) {
        const f = makePlant(st, LPRESETS[1]!, S.seed * 7 + k, 28, mats, leafG, flowerG);
        f.group.position.set(x, 0, z);
        f.group.scale.setScalar(0.62);
        f.group.rotation.y = k * 2;
        plants.push(f);
        st.spin.add(f.group);
      }
    }
    main.group.scale.setScalar(S.preset === 1 ? 2.0 : S.preset === 2 ? 1.05 : 1);
    ms = performance.now() - t0;
    last = -1;
  };
  let last = -1;
  let warmL = 0;
  build();
  return st.out({
    update(t) {
      let n = S.n;
      let pop = 0;
      if (S.auto) {
        const k = t % 8.4;
        n = Math.min(LMAX, Math.floor(k / 1.05));
        pop = k - n * 1.05;
      }
      if (warmL++ < 2) n = LMAX;
      if (n !== last) {
        for (const p of plants) p.set(n);
        last = n;
      }
      const b = S.auto && pop < 0.35 ? 1 + 0.035 * Math.sin((pop / 0.35) * Math.PI) : 1;
      st.spin.scale.set(1, b, 1);
      st.spin.rotation.y = Math.sin(t * 0.35) * 0.6;
      st.hud.tl.set(`▲ 삼각형 ${fmt(st.tris())}`);
      st.hud.bl.set(`${LPRESETS[S.preset]!.show}   반복 n = ${n}  (${ms.toFixed(0)}ms)`);
    },
    controls: [
      { type: 'toggle', label: '자동 재생 (n 올리기)', value: true, on: (v) => (S.auto = v) },
      { type: 'range', label: '반복 횟수 n', min: 0, max: LMAX, step: 1, value: 5, on: (v) => ((S.n = v), (S.auto = false)) },
      { type: 'range', label: '규칙 (0 나무 · 1 고사리 · 2 산호)', min: 0, max: 2, step: 1, value: 0, on: (v) => ((S.preset = v), (S.angle = LPRESETS[v]!.angle), build()) },
      { type: 'range', label: '가지 각도 (도)', min: 12, max: 55, step: 1, value: 40, on: (v) => ((S.angle = v), build()) },
      { type: 'toggle', label: '와이어프레임', value: false, on: (v) => (st.wire.on = v) },
      { type: 'button', label: '새로 만들기 (시드)', on: () => ((S.seed += 1), build()) },
    ],
    dispose() {
      for (const p of plants) p.dispose();
      leafG.dispose();
      flowerG.dispose();
    },
  });
}

/* ───────────── 마칭 큐브 (SDF · 메타볼이 함께 씀) ───────────── */

class MCBuf {
  pos = new Float32Array(3 * 8192);
  nor = new Float32Array(3 * 8192);
  col = new Float32Array(3 * 8192);
  idx = new Uint32Array(3 * 16384);
  nv = 0;
  ni = 0;
  vert(): number {
    if ((this.nv + 1) * 3 > this.pos.length) {
      const g = (a: Float32Array<ArrayBuffer>): Float32Array<ArrayBuffer> => {
        const b = new Float32Array(a.length * 2);
        b.set(a);
        return b;
      };
      this.pos = g(this.pos);
      this.nor = g(this.nor);
      this.col = g(this.col);
    }
    return this.nv++;
  }
  tri(a: number, b: number, c: number): void {
    if (this.ni + 3 > this.idx.length) {
      const n = new Uint32Array(this.idx.length * 2);
      n.set(this.idx);
      this.idx = n;
    }
    this.idx[this.ni++] = a;
    this.idx[this.ni++] = b;
    this.idx[this.ni++] = c;
  }
}
const MC_EDGE = [[0, 0, 0, 0], [1, 0, 0, 1], [0, 1, 0, 0], [0, 0, 0, 1], [0, 0, 1, 0], [1, 0, 1, 1], [0, 1, 1, 0], [0, 0, 1, 1], [0, 0, 0, 2], [1, 0, 0, 2], [1, 1, 0, 2], [0, 1, 0, 2]];
const MC_CORNER = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
let MC_FLIP: boolean | null = null;
interface Grid {
  nx: number;
  ny: number;
  nz: number;
  ox: number;
  oy: number;
  oz: number;
  h: number;
}
/** field(안쪽이 큼) 의 iso 면을 삼각형으로 — 꼭짓점은 모서리마다 하나(공유), 법선 · 색은 vtx 가 채움 */
function polygonize(f: Float32Array, G: Grid, iso: number, out: MCBuf, cache: Int32Array, vtx: (x: number, y: number, z: number, i: number) => void): void {
  const it = polygonizeGen(f, G, iso, out, cache, vtx);
  while (!it.next().done);
}
/** 같은 일을 z 층마다 쉬어 가며 (프레임 예산으로 나눠 굽기) */
function* polygonizeGen(f: Float32Array, G: Grid, iso: number, out: MCBuf, cache: Int32Array, vtx: (x: number, y: number, z: number, i: number) => void): Generator<void, void, void> {
  const { nx, ny, nz, ox, oy, oz, h } = G;
  const flip = MC_FLIP;
  const nxy = nx * ny;
  cache.fill(-1);
  yield;
  const every = Math.max(1, Math.round(60 / nx));
  out.nv = 0;
  out.ni = 0;
  const coff = MC_CORNER.map(([a, b, c]) => a! + b! * nx + c! * nxy);
  const step = [1, nx, nxy];
  const ev = [0, 0, 0];
  const edgeVert = (x: number, y: number, z: number, e: number): number => {
    const E = MC_EDGE[e]!;
    const gx = x + E[0]!;
    const gy = y + E[1]!;
    const gz = z + E[2]!;
    const a = E[3]!;
    const gi = gx + gy * nx + gz * nxy;
    const key = gi * 3 + a;
    const c = cache[key]!;
    if (c >= 0) return c;
    const v0 = f[gi]!;
    const v1 = f[gi + step[a]!]!;
    const t = (iso - v0) / (v1 - v0 || 1e-9);
    const px = ox + (gx + (a === 0 ? t : 0)) * h;
    const py = oy + (gy + (a === 1 ? t : 0)) * h;
    const pz = oz + (gz + (a === 2 ? t : 0)) * h;
    const i = out.vert();
    out.pos[i * 3] = px;
    out.pos[i * 3 + 1] = py;
    out.pos[i * 3 + 2] = pz;
    vtx(px, py, pz, i);
    cache[key] = i;
    return i;
  };
  for (let z = 0; z < nz - 1; z++) {
    for (let y = 0; y < ny - 1; y++) {
      if (y % every === 0) yield;
      for (let x = 0; x < nx - 1; x++) {
        const g = x + y * nx + z * nxy;
        let ci = 0;
        for (let c = 0; c < 8; c++) if (f[g + coff[c]!]! < iso) ci |= 1 << c;
        if (ci === 0 || ci === 255) continue;
        const o = ci * 16;
        for (let t = 0; triTable[o + t]! !== -1; t += 3) {
          ev[0] = edgeVert(x, y, z, triTable[o + t]!);
          ev[1] = edgeVert(x, y, z, triTable[o + t + 1]!);
          ev[2] = edgeVert(x, y, z, triTable[o + t + 2]!);
          if (flip) out.tri(ev[0]!, ev[2]!, ev[1]!);
          else out.tri(ev[0]!, ev[1]!, ev[2]!);
        }
      }
    }
  }
  if (flip === null && out.ni >= 3) {
    // 첫 삼각형의 면 방향과 법선을 비교해 감는 방향을 정한다 (한 번만)
    const P = out.pos;
    const [a, b, c] = [out.idx[0]! * 3, out.idx[1]! * 3, out.idx[2]! * 3];
    const ux = P[b]! - P[a]!, uy = P[b + 1]! - P[a + 1]!, uz = P[b + 2]! - P[a + 2]!;
    const vx = P[c]! - P[a]!, vy = P[c + 1]! - P[a + 1]!, vz = P[c + 2]! - P[a + 2]!;
    const d = (uy * vz - uz * vy) * out.nor[a]! + (uz * vx - ux * vz) * out.nor[a + 1]! + (ux * vy - uy * vx) * out.nor[a + 2]!;
    MC_FLIP = d < 0;
    if (d < 0) for (let i = 0; i < out.ni; i += 3) [out.idx[i + 1], out.idx[i + 2]] = [out.idx[i + 2]!, out.idx[i + 1]!];
  }
}
function mcGeometry(b: MCBuf): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(b.pos.slice(0, b.nv * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(b.nor.slice(0, b.nv * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(b.col.slice(0, b.nv * 3), 3));
  g.setIndex(new THREE.BufferAttribute(b.idx.slice(0, b.ni), 1));
  g.computeBoundingSphere();
  return g;
}

/* ───────────── i446 SDF 조각 모델링 ───────────── */

/** 부품: 0 구 · 1 타원체 · 2 캡슐 */
interface Part {
  kind: 0 | 1 | 2;
  a: [number, number, number];
  b: [number, number, number];
  r: number;
  col: number;
  k: number;
  fly: [number, number, number];
}
const BEAR: Part[] = [
  { kind: 1, a: [0, 0.72, 0], b: [0.56, 0.6, 0.5], r: 0, col: 0xf0a35e, k: 0, fly: [0, -1, 0] },
  { kind: 0, a: [0, 1.52, 0.02], b: [0, 0, 0], r: 0.56, col: 0xf0a35e, k: 0.16, fly: [0, 1, 0] },
  { kind: 1, a: [-0.38, 1.98, -0.02], b: [0.18, 0.18, 0.11], r: 0, col: 0xe8954e, k: 0.09, fly: [-1, 1, 0] },
  { kind: 1, a: [0.38, 1.98, -0.02], b: [0.18, 0.18, 0.11], r: 0, col: 0xe8954e, k: 0.09, fly: [1, 1, 0] },
  { kind: 1, a: [0, 1.39, 0.52], b: [0.25, 0.17, 0.16], r: 0, col: 0xfde8cc, k: 0.07, fly: [0, 0, 1] },
  { kind: 2, a: [-0.48, 1.02, 0.06], b: [-0.74, 0.62, 0.2], r: 0.13, col: 0xf0a35e, k: 0.1, fly: [-1, 0, 0] },
  { kind: 2, a: [0.48, 1.02, 0.06], b: [0.74, 0.62, 0.2], r: 0.13, col: 0xf0a35e, k: 0.1, fly: [1, 0, 0] },
  { kind: 2, a: [-0.25, 0.34, 0.06], b: [-0.29, 0.1, 0.16], r: 0.17, col: 0xf0a35e, k: 0.1, fly: [-0.5, -1, 0.5] },
  { kind: 2, a: [0.25, 0.34, 0.06], b: [0.29, 0.1, 0.16], r: 0.17, col: 0xf0a35e, k: 0.1, fly: [0.5, -1, 0.5] },
  { kind: 0, a: [0, 0.52, -0.5], b: [0, 0, 0], r: 0.15, col: 0xfbe3c2, k: 0.06, fly: [0, 0, -1] },
];
const PSTRIDE = 12;
function packParts(parts: Part[], n: number, off: number, kmul: number): Float64Array {
  const P = new Float64Array(n * PSTRIDE);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const p = parts[i]!;
    const last = i === n - 1 && off > 0;
    const fl = last ? off * 0.5 : 0;
    const dx = p.fly[0] * fl, dy = p.fly[1] * fl, dz = p.fly[2] * fl;
    const sc = last ? 1 - off * 0.25 : 1;
    c.set(p.col);
    P.set([p.kind, p.a[0] + dx, p.a[1] + dy, p.a[2] + dz, p.kind === 2 ? p.b[0] + dx : p.b[0] * sc, p.kind === 2 ? p.b[1] + dy : p.b[1] * sc, p.kind === 2 ? p.b[2] + dz : p.b[2] * sc, p.r * sc, p.k * kmul * (last ? 1 - off : 1), c.r, c.g, c.b], i * PSTRIDE);
  }
  return P;
}
function primD(P: Float64Array, o: number, x: number, y: number, z: number): number {
  const ax = P[o + 1]!, ay = P[o + 2]!, az = P[o + 3]!;
  const k = P[o]!;
  if (k === 0) return Math.hypot(x - ax, y - ay, z - az) - P[o + 7]!;
  if (k === 1) {
    const rx = P[o + 4]!, ry = P[o + 5]!, rz = P[o + 6]!;
    const px = (x - ax) / rx, py = (y - ay) / ry, pz = (z - az) / rz;
    const k0 = Math.hypot(px, py, pz);
    const k1 = Math.hypot(px / rx, py / ry, pz / rz) || 1e-9;
    return (k0 * (k0 - 1)) / k1;
  }
  const bx = P[o + 4]! - ax, by = P[o + 5]! - ay, bz = P[o + 6]! - az;
  const px = x - ax, py = y - ay, pz = z - az;
  const hh = clamp((px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz), 0, 1);
  return Math.hypot(px - bx * hh, py - by * hh, pz - bz * hh) - P[o + 7]!;
}
/** 부드러운 합치기 (다항식 smin) — col 이 있으면 섞인 색도 */
function sdf(P: Float64Array, x: number, y: number, z: number, col: number[] | null): number {
  const n = P.length / PSTRIDE;
  let d = primD(P, 0, x, y, z);
  if (col) [col[0], col[1], col[2]] = [P[9]!, P[10]!, P[11]!];
  for (let i = 1; i < n; i++) {
    const o = i * PSTRIDE;
    const di = primD(P, o, x, y, z);
    const k = P[o + 8]!;
    let hh: number;
    if (k < 1e-4) {
      hh = di < d ? 0 : 1;
      d = Math.min(d, di);
    } else {
      hh = clamp(0.5 + (0.5 * (di - d)) / k, 0, 1);
      d = di + (d - di) * hh - k * hh * (1 - hh);
    }
    if (col) for (let c = 0; c < 3; c++) col[c] = P[o + 9 + c]! + (col[c]! - P[o + 9 + c]!) * hh;
  }
  return d;
}
/** 부위 무늬 (배 · 귀 안 · 볼) — 모양이 아니라 색만 */
const PATCH: [number, number, number, number, number, number][] = [
  [0, 0.68, 0.42, 0.34, 0xfbe3c2, 1],
  [-0.38, 1.97, 0.06, 0.1, 0xf6a6a6, 3],
  [0.38, 1.97, 0.06, 0.1, 0xf6a6a6, 4],
  [-0.32, 1.42, 0.44, 0.1, 0xff8f8f, 2],
  [0.32, 1.42, 0.44, 0.1, 0xff8f8f, 2],
];

function demoSdf(): Scene3D {
  const st = new Stage({ cam: [0, 1.5, 5.6], look: [0, 1.05, 0], island: 1.5 });
  const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.5, sheen: 0.4, sheenColor: new THREE.Color(0xffe6cc), polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const body = st.model(new THREE.Mesh(new THREE.BufferGeometry(), mat));
  const char = new THREE.Group();
  char.add(body);
  st.spin.add(char);
  const S = { res: 30, kmul: 1, auto: true, step: BEAR.length, ghosts: false };
  const SUB = 4;
  const nFrames = 1 + (BEAR.length - 1) * SUB;
  const frameSpec = (f: number): [number, number] => (f === 0 ? [1, 0] : [2 + Math.floor((f - 1) / SUB), 1 - ((f - 1) % SUB) / (SUB - 1)]);
  let frames: (THREE.BufferGeometry | null)[] = [];
  const buf = new MCBuf();
  let cache = new Int32Array(1);
  const tmp = [0, 0, 0];
  const cc = new THREE.Color();
  /** 장면 하나 굽기 — z 층마다 쉬어 가는 생성기 (한 프레임 예산 안에서만 돌린다) */
  function* buildGen(f: number, res: number, kmul: number): Generator<void, THREE.BufferGeometry, void> {
    const [n, off] = frameSpec(f);
    const P = packParts(BEAR, n, off, kmul);
    const h = 2.3 / res;
    const G: Grid = { nx: res + 1, ny: Math.ceil(2.75 / h) + 1, nz: Math.ceil(1.95 / h) + 1, ox: -1.15, oy: -0.12, oz: -0.95, h };
    const N = G.nx * G.ny * G.nz;
    const fld = new Float32Array(N);
    for (let z = 0, i = 0; z < G.nz; z++) {
      if (z) yield;
      for (let y = 0; y < G.ny; y++) for (let x = 0; x < G.nx; x++, i++) fld[i] = -sdf(P, G.ox + x * h, G.oy + y * h, G.oz + z * h, null);
    }
    if (cache.length < N * 3) {
      yield;
      cache = new Int32Array(N * 3);
      yield;
    }
    const e = h * 0.35;
    yield* polygonizeGen(fld, G, 0, buf, cache, (x, y, z, i) => {
      const gx = sdf(P, x + e, y, z, null) - sdf(P, x - e, y, z, null);
      const gy = sdf(P, x, y + e, z, null) - sdf(P, x, y - e, z, null);
      const gz = sdf(P, x, y, z + e, null) - sdf(P, x, y, z - e, null);
      const l = Math.hypot(gx, gy, gz) || 1;
      buf.nor.set([gx / l, gy / l, gz / l], i * 3);
      sdf(P, x, y, z, tmp);
      for (const [px, py, pz, r, c, need] of PATCH) {
        if (n <= need) continue;
        const w = 1 - ease(clamp((Math.hypot(x - px, y - py, z - pz) - r * 0.6) / (r * 0.6), 0, 1));
        if (w <= 0) continue;
        cc.set(c);
        tmp[0] = lerp(tmp[0]!, cc.r, w);
        tmp[1] = lerp(tmp[1]!, cc.g, w);
        tmp[2] = lerp(tmp[2]!, cc.b, w);
      }
      buf.col.set(tmp, i * 3);
    });
    return mcGeometry(buf);
  }
  let prev: (THREE.BufferGeometry | null)[] = [];
  let job: { f: number; it: Generator<void, THREE.BufferGeometry, void> } | null = null;
  let bakedMs = 0;
  const BUDGET = 1.0;
  /** 필요한 장면부터, 그다음은 차례로 미리 — 예산(ms)이 다 되면 멈춘다 */
  const pump = (want: number): void => {
    const t0 = performance.now();
    while (performance.now() - t0 < BUDGET) {
      if (!job) {
        let f = -1;
        for (let k = 0; k < nFrames; k++) {
          const c = (want + k) % nFrames;
          if (!frames[c]) {
            f = c;
            break;
          }
        }
        if (f < 0) {
          for (const g of prev) g?.dispose();
          prev = [];
          return;
        }
        job = { f, it: buildGen(f, S.res, S.kmul) };
      }
      const r = job.it.next();
      if (r.done) {
        frames[job.f] = r.value;
        job = null;
      }
    }
    bakedMs = Math.max(bakedMs, performance.now() - t0);
  };
  /** 준비된 것 중 가장 가까운 앞 장면 (없으면 예전 해상도 장면) */
  const ready = (f: number): THREE.BufferGeometry | null => {
    if (frames[f]) return frames[f]!;
    if (prev[f]) return prev[f]!;
    for (let k = f; k >= 0; k--) if (frames[k]) return frames[k]!;
    for (let k = f; k >= 0; k--) if (prev[k]) return prev[k]!;
    return null;
  };
  const reset = (first = false): void => {
    for (const g of prev) g?.dispose();
    prev = first ? [] : frames;
    frames = new Array<THREE.BufferGeometry | null>(nFrames).fill(null);
    job = null;
    if (first) {
      const it = buildGen(0, S.res, S.kmul);
      let r = it.next();
      while (!r.done) r = it.next();
      frames[0] = r.value;
    }
  };
  reset(true);
  // 얼굴 (따로 만든 반짝이는 눈 · 코 · 입) — 마지막 SDF 면 위에 광선으로 붙인다
  const Pfull = packParts(BEAR, BEAR.length, 0, 1);
  const onSurface = (x: number, y: number): V3 => {
    let z = 1.2;
    for (let i = 0; i < 64; i++) {
      const d = sdf(Pfull, x, y, z, null);
      if (d < 1e-4) break;
      z -= d;
    }
    return new THREE.Vector3(x, y, z);
  };
  const face = new THREE.Group();
  const black = new THREE.MeshPhysicalMaterial({ color: 0x1b1410, roughness: 0.15, clearcoat: 1 });
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const s of [-1, 1]) {
    const p = onSurface(s * 0.2, 1.62);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), black);
    eye.scale.set(0.068, 0.088, 0.045);
    eye.position.copy(p);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), white);
    hl.position.copy(p).add(new THREE.Vector3(0.02, 0.03, 0.04));
    face.add(eye, hl);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), black);
  nose.scale.set(0.075, 0.05, 0.05);
  nose.position.copy(onSurface(0, 1.47));
  const mouth = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([-0.07, -0.035, 0, 0.035, 0.07].map((x) => onSurface(x, 1.36 - 0.03 * Math.cos(x * 22)).add(new THREE.Vector3(0, 0, 0.008)))), 16, 0.008, 6), black);
  face.add(nose, mouth);
  char.add(face);
  // 기본 도형 보기 (반투명 선)
  const ghosts = new THREE.Group();
  for (const p of BEAR) {
    const gm = new THREE.MeshBasicMaterial({ color: 0x8fe3ff, wireframe: true, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false });
    let m: THREE.Mesh;
    if (p.kind === 2) {
      const a = new THREE.Vector3(...p.a);
      const b = new THREE.Vector3(...p.b);
      m = new THREE.Mesh(new THREE.CapsuleGeometry(p.r, a.distanceTo(b), 6, 12), gm);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    } else {
      m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), gm);
      m.position.set(...p.a);
      if (p.kind === 0) m.scale.setScalar(p.r);
      else m.scale.set(...p.b);
    }
    ghosts.add(m);
  }
  char.add(ghosts);
  return st.out({
    update(t) {
      let f: number;
      let faceK = 1;
      let bob = 0;
      if (S.auto) {
        const k = t % 9;
        f = Math.min(nFrames - 1, Math.floor(k / 0.17));
        faceK = easeBack((k - nFrames * 0.17 - 0.1) / 0.45);
        bob = k > nFrames * 0.17 + 0.6 ? Math.sin((k - nFrames * 0.17) * 5) * 0.025 : 0;
      } else {
        f = S.step <= 1 ? 0 : 1 + (S.step - 2) * SUB + SUB - 1;
        faceK = S.step >= BEAR.length ? 1 : 0;
      }
      pump(f);
      const g = ready(f);
      if (g) body.geometry = g;
      for (const c of face.children) {
        const b0 = c.userData['s'] as V3 | undefined;
        if (!b0) c.userData['s'] = c.scale.clone();
        else c.scale.copy(b0).multiplyScalar(Math.max(1e-3, faceK));
      }
      char.scale.set(1 - bob, 1 + bob, 1 - bob);
      ghosts.visible = S.ghosts;
      st.spin.rotation.y = Math.sin(t * 0.45) * 0.55;
      const [n] = frameSpec(f);
      st.hud.tl.set(`▲ 삼각형 ${fmt(st.tris())}`);
      st.hud.bl.set(`부품 ${n} / ${BEAR.length} 녹여 붙이기 · 격자 ${S.res} · 구운 장면 ${frames.filter(Boolean).length}/${nFrames}`);
    },
    controls: [
      { type: 'toggle', label: '자동 재생 (하나씩 붙이기)', value: true, on: (v) => (S.auto = v) },
      { type: 'range', label: '붙인 부품 수', min: 1, max: BEAR.length, step: 1, value: BEAR.length, on: (v) => ((S.step = v), (S.auto = false)) },
      { type: 'range', label: '부드럽게 합치기 k (0 = 딱딱하게)', min: 0, max: 2, step: 0.1, value: 1, on: (v) => ((S.kmul = v), reset()) },
      { type: 'range', label: '마칭 큐브 격자 (해상도)', min: 20, max: 72, step: 2, value: 30, on: (v) => ((S.res = v), reset()) },
      { type: 'toggle', label: '기본 도형 보기 (구 · 캡슐)', value: false, on: (v) => (S.ghosts = v) },
      { type: 'toggle', label: '와이어프레임', value: false, on: (v) => (st.wire.on = v) },
    ],
    dispose() {
      for (const g of frames) g?.dispose();
      for (const g of prev) g?.dispose();
    },
  });
}

/* ───────────── i447 메타볼 슬라임 ───────────── */

interface Ball {
  x: number;
  y: number;
  z: number;
  R: number;
  sy: number;
  c: THREE.Color;
}
function demoMeta(): Scene3D {
  const st = new Stage({ cam: [0, 1.7, 5.4], look: [0, 0.75, 0], island: 1.75 });
  const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.5, sheenColor: new THREE.Color(0xffffff), polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  let geo = new THREE.BufferGeometry();
  const slime = st.model(new THREE.Mesh(geo, mat));
  slime.frustumCulled = false;
  st.spin.add(slime);
  const S = { res: 30, drops: 4, iso: 0.3, centers: false, seed: 1 };
  const body = new THREE.Color(0x7ee8c4);
  const pal = [0xff9ec7, 0x8fd0ff, 0xffe27a, 0xc5a8ff, 0xffb38a, 0xa8f07a].map((c) => new THREE.Color(c));
  const balls: Ball[] = [];
  const dirs: number[] = [];
  const reseed = (): void => {
    const R0 = rng(S.seed);
    dirs.length = 0;
    for (let i = 0; i < 6; i++) dirs.push((i / 6) * TAU + R0() * 0.8);
    pal.sort(() => R0() - 0.5);
  };
  reseed();
  const X0 = -1.8, Y0 = -0.25, SPAN = 3.6;
  let G: Grid;
  let fld = new Float32Array(1);
  let cache = new Int32Array(1);
  const buf = new MCBuf();
  const setRes = (): void => {
    const h = SPAN / S.res;
    G = { nx: S.res + 1, ny: Math.ceil(2.5 / h) + 1, nz: S.res + 1, ox: X0, oy: Y0, oz: X0, h };
    fld = new Float32Array(G.nx * G.ny * G.nz);
    cache = new Int32Array(fld.length * 3);
  };
  setRes();
  // 공 중심 · 영향 범위 보기
  const dotG = new THREE.SphereGeometry(1, 12, 8);
  const dots = new THREE.InstancedMesh(dotG, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, depthTest: false, transparent: true }), 12);
  const halos = new THREE.InstancedMesh(dotG, new THREE.MeshBasicMaterial({ color: 0x9fe8ff, wireframe: true, transparent: true, opacity: 0.18, depthWrite: false, toneMapped: false }), 12);
  dots.renderOrder = 5;
  st.spin.add(dots, halos);
  // 얼굴
  const face = new THREE.Group();
  const black = new THREE.MeshPhysicalMaterial({ color: 0x14202a, roughness: 0.1, clearcoat: 1 });
  const eyes: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), black);
    e.scale.set(0.085, 0.115, 0.05);
    e.position.set(s * 0.2, 0, 0);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    hl.position.set(0.3, 0.35, 0.8);
    e.add(hl);
    const bl = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff8fb0, transparent: true, opacity: 0.55, depthWrite: false }));
    bl.scale.set(0.08, 0.04, 0.02);
    bl.position.set(s * 0.33, -0.1, -0.01);
    eyes.push(e);
    face.add(e, bl);
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 16, Math.PI), black);
  smile.rotation.z = Math.PI;
  smile.position.set(0, -0.1, 0.05);
  face.add(smile);
  st.spin.add(face);
  const m4 = new THREE.Matrix4();
  const pv = new THREE.Vector3();
  const qv = new THREE.Quaternion();
  const sv = new THREE.Vector3();
  let lastMs = 0;
  const place = (t: number): void => {
    balls.length = 0;
    const br = Math.sin(t * 3.2);
    balls.push({ x: 0, y: 0.42, z: 0, R: 1.08, sy: 0.85 - br * 0.04, c: body });
    balls.push({ x: 0, y: 0.9 + br * 0.03, z: 0.02, R: 0.82, sy: 1, c: body });
    balls.push({ x: -0.42, y: 0.26, z: 0.12, R: 0.6, sy: 0.8, c: body });
    balls.push({ x: 0.42, y: 0.26, z: 0.12, R: 0.6, sy: 0.8, c: body });
    for (let i = 0; i < S.drops; i++) {
      const P = 3.4;
      const tau = (((t + i * (P / Math.max(1, S.drops))) / P) % 1 + 1) % 1;
      const a = dirs[i]!;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      const L = 1.25;
      let x: number, y: number, z: number, R = 0.5, sy = 1;
      if (tau < 0.15) {
        const k = ease(tau / 0.15);
        x = dx * 0.35 * k;
        z = dz * 0.35 * k;
        y = 1.0 + 0.35 * k;
        R = 0.34 + 0.16 * k;
      } else if (tau < 0.5) {
        const k = (tau - 0.15) / 0.35;
        x = dx * lerp(0.35, L, k);
        z = dz * lerp(0.35, L, k);
        y = lerp(1.35, 0.18, k) + Math.sin(k * Math.PI) * 0.9;
        sy = 1 + Math.sin(k * Math.PI) * 0.15;
      } else if (tau < 0.62) {
        const k = (tau - 0.5) / 0.12;
        x = dx * L;
        z = dz * L;
        y = 0.16 - Math.sin(k * Math.PI) * 0.05;
        sy = 1 - Math.sin(k * Math.PI) * 0.4;
      } else {
        const k = ease((tau - 0.62) / 0.38);
        const r = lerp(L, 0.25, k);
        x = dx * r + Math.sin(k * 18) * 0.03;
        z = dz * r;
        y = 0.18 + Math.abs(Math.sin(k * 9)) * 0.06;
        R = lerp(0.5, 0.38, k);
      }
      balls.push({ x, y, z, R, sy, c: pal[i % pal.length]! });
    }
  };
  const poly = (): void => {
    const t0 = performance.now();
    fld.fill(0);
    const { nx, ny, nz, h } = G;
    for (const b of balls) {
      const rx = b.R, ry = b.R * b.sy;
      const x0 = Math.max(0, Math.floor((b.x - rx - X0) / h)), x1 = Math.min(nx - 1, Math.ceil((b.x + rx - X0) / h));
      const y0 = Math.max(0, Math.floor((b.y - ry - Y0) / h)), y1 = Math.min(ny - 1, Math.ceil((b.y + ry - Y0) / h));
      const z0 = Math.max(0, Math.floor((b.z - rx - X0) / h)), z1 = Math.min(nz - 1, Math.ceil((b.z + rx - X0) / h));
      const iR = 1 / (b.R * b.R);
      for (let z = z0; z <= z1; z++) {
        const dz = X0 + z * h - b.z;
        for (let y = y0; y <= y1; y++) {
          const dy = (Y0 + y * h - b.y) / b.sy;
          const row = (z * ny + y) * nx;
          for (let x = x0; x <= x1; x++) {
            const dx = X0 + x * h - b.x;
            const q = (dx * dx + dy * dy + dz * dz) * iR;
            if (q < 1) {
              const w = 1 - q;
              fld[row + x]! += w * w * w;
            }
          }
        }
      }
    }
    polygonize(fld, G, S.iso, buf, cache, (x, y, z, i) => {
      let gx = 0, gy = 0, gz = 0, ws = 0, r = 0, g = 0, bb = 0;
      for (const b of balls) {
        const dx = x - b.x, dy = (y - b.y) / b.sy, dz = z - b.z;
        const iR = 1 / (b.R * b.R);
        const q = (dx * dx + dy * dy + dz * dz) * iR;
        if (q >= 1) continue;
        const w = 1 - q;
        const dw = -6 * w * w * iR;
        gx += dw * dx;
        gy += (dw * dy) / b.sy;
        gz += dw * dz;
        const ww = w * w * w;
        ws += ww;
        r += b.c.r * ww;
        g += b.c.g * ww;
        bb += b.c.b * ww;
      }
      const l = Math.hypot(gx, gy, gz) || 1;
      buf.nor[i * 3] = -gx / l;
      buf.nor[i * 3 + 1] = -gy / l;
      buf.nor[i * 3 + 2] = -gz / l;
      ws = ws || 1;
      buf.col[i * 3] = r / ws;
      buf.col[i * 3 + 1] = g / ws;
      buf.col[i * 3 + 2] = bb / ws;
    });
    // 미리 넉넉히 잡은 버퍼에 쓴 만큼만 올린다
    const pa = geo.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!pa || pa.count < buf.nv || (geo.index?.count ?? 0) < buf.ni) {
      geo.dispose();
      geo = new THREE.BufferGeometry();
      const cap = Math.ceil(buf.nv * 1.6) + 1024;
      const capI = Math.ceil(buf.ni * 1.6) + 4096;
      for (const n of ['position', 'normal', 'color']) geo.setAttribute(n, new THREE.BufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage));
      geo.setIndex(new THREE.BufferAttribute(new Uint32Array(capI), 1).setUsage(THREE.DynamicDrawUsage));
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.8, 0), 3);
      slime.geometry = geo;
    }
    for (const [n, src] of [['position', buf.pos], ['normal', buf.nor], ['color', buf.col]] as const) {
      const a = geo.getAttribute(n) as THREE.BufferAttribute;
      (a.array as Float32Array).set(src.subarray(0, buf.nv * 3));
      a.clearUpdateRanges();
      a.addUpdateRange(0, buf.nv * 3);
      a.needsUpdate = true;
    }
    const ix = geo.index!;
    (ix.array as Uint32Array).set(buf.idx.subarray(0, buf.ni));
    ix.clearUpdateRanges();
    ix.addUpdateRange(0, buf.ni);
    ix.needsUpdate = true;
    geo.setDrawRange(0, buf.ni);
    lastMs = performance.now() - t0;
  };
  return st.out({
    update(t) {
      place(t);
      poly();
      // 얼굴은 머리 공 앞면에
      const hb = balls[1]!;
      let fz = 1.7;
      for (; fz > 0; fz -= 0.01) {
        let v = 0;
        for (const b of balls) {
          const q = ((hb.x - b.x) ** 2 + ((hb.y - b.y) / b.sy) ** 2 + (fz - b.z) ** 2) / (b.R * b.R);
          if (q < 1) v += (1 - q) ** 3;
        }
        if (v >= S.iso) break;
      }
      face.position.set(hb.x, hb.y, fz + 0.005);
      const blink = (t % 3.7) > 3.55 ? 0.15 : 1;
      for (const e of eyes) e.scale.y = 0.115 * blink;
      const n = balls.length;
      dots.count = halos.count = n;
      balls.forEach((b, i) => {
        pv.set(b.x, b.y, b.z);
        dots.setMatrixAt(i, m4.compose(pv, qv, sv.setScalar(0.035)));
        halos.setMatrixAt(i, m4.compose(pv, qv, sv.set(b.R, b.R * b.sy, b.R)));
      });
      dots.instanceMatrix.needsUpdate = halos.instanceMatrix.needsUpdate = true;
      dots.visible = halos.visible = S.centers;
      st.spin.rotation.y = Math.sin(t * 0.3) * 0.5;
      st.hud.tl.set(`▲ 삼각형 ${fmt(st.tris())}`);
      st.hud.bl.set(`공 ${n}개가 녹아 붙는 면 · 격자 ${S.res} · 매 장면 ${lastMs.toFixed(1)}ms`);
    },
    controls: [
      { type: 'range', label: '튀어나가는 방울 수', min: 0, max: 6, step: 1, value: 4, on: (v) => (S.drops = v) },
      { type: 'range', label: '끈적임 (면 높이 iso)', min: 0.12, max: 0.55, step: 0.01, value: 0.3, on: (v) => (S.iso = v) },
      { type: 'range', label: '마칭 큐브 격자 (해상도)', min: 16, max: 64, step: 2, value: 30, on: (v) => ((S.res = v), setRes()) },
      { type: 'toggle', label: '공 중심 · 영향 범위 보기', value: false, on: (v) => (S.centers = v) },
      { type: 'toggle', label: '와이어프레임', value: false, on: (v) => (st.wire.on = v) },
      { type: 'button', label: '새로 만들기 (색 · 방향)', on: () => ((S.seed += 1), reseed()) },
    ],
  });
}

/* ───────────── i448 서브디비전 ───────────── */

/** 다각형 메시 (면마다 색, 날카로운 모서리 집합) */
interface PMesh {
  v: V3[];
  f: number[][];
  fc: number[];
  cr: Set<number>;
}
const ek = (a: number, b: number): number => (a < b ? a * 65536 + b : b * 65536 + a);
function newell(m: PMesh, f: number[]): V3 {
  const n = new THREE.Vector3();
  for (let i = 0; i < f.length; i++) {
    const c = m.v[f[i]!]!;
    const d = m.v[f[(i + 1) % f.length]!]!;
    n.x += (c.y - d.y) * (c.z + d.z);
    n.y += (c.z - d.z) * (c.x + d.x);
    n.z += (c.x - d.x) * (c.y + d.y);
  }
  return n;
}
function centroid(m: PMesh, f: number[]): V3 {
  const c = new THREE.Vector3();
  for (const i of f) c.add(m.v[i]!);
  return c.divideScalar(f.length);
}
/** 면마다 n 칸 격자인 상자 (같은 자리 꼭짓점은 하나로) */
function gridBox(hx: number, hy: number, hz: number, nx: number, ny: number, nz: number, col: number): PMesh {
  const m: PMesh = { v: [], f: [], fc: [], cr: new Set() };
  const map = new Map<string, number>();
  const H = [hx, hy, hz];
  const NS = [nx, ny, nz];
  const vid = (p: number[]): number => {
    const k = p.map((x) => Math.round(x * 1000)).join(',');
    let i = map.get(k);
    if (i === undefined) {
      i = m.v.length;
      m.v.push(new THREE.Vector3(p[0], p[1], p[2]));
      map.set(k, i);
    }
    return i;
  };
  // [법선 축, 부호, U 축, V 축] — U × V = 바깥
  const sides: [number, number, number, number][] = [[0, 1, 1, 2], [0, -1, 2, 1], [1, 1, 2, 0], [1, -1, 0, 2], [2, 1, 0, 1], [2, -1, 1, 0]];
  for (const [N, s, U, V] of sides) {
    const nu = NS[U]!, nv = NS[V]!;
    const P = (i: number, j: number): number => {
      const p = [0, 0, 0];
      p[N] = s * H[N]!;
      p[U] = -H[U]! + (2 * H[U]! * i) / nu;
      p[V] = -H[V]! + (2 * H[V]! * j) / nv;
      return vid(p);
    };
    for (let i = 0; i < nu; i++)
      for (let j = 0; j < nv; j++) {
        m.f.push([P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)]);
        m.fc.push(col);
      }
  }
  return m;
}
function pickFace(m: PMesh, dir: V3, near: V3): number {
  let best = 0;
  let bd = 1e9;
  m.f.forEach((f, i) => {
    if (newell(m, f).normalize().dot(dir) < 0.7) return;
    const d = centroid(m, f).distanceTo(near);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}
/** 면 묶음 밀어내기 — 테두리에 옆면을 새로 붙인다 */
function extrude(m: PMesh, faces: number[], dist: number, scale: number, col: number | null, side: number | null = null, xf?: (p: V3) => void): void {
  const N = new THREE.Vector3();
  const vs = new Set<number>();
  for (const fi of faces) {
    N.add(newell(m, m.f[fi]!));
    for (const v of m.f[fi]!) vs.add(v);
  }
  N.normalize();
  const C = new THREE.Vector3();
  for (const v of vs) C.add(m.v[v]!);
  C.divideScalar(vs.size);
  const map = new Map<number, number>();
  for (const v of vs) {
    const p = m.v[v]!.clone().sub(C).multiplyScalar(scale).add(C).addScaledVector(N, dist);
    xf?.(p);
    map.set(v, m.v.length);
    m.v.push(p);
  }
  const cnt = new Map<number, number>();
  for (const fi of faces) {
    const f = m.f[fi]!;
    for (let i = 0; i < f.length; i++) {
      const k = ek(f[i]!, f[(i + 1) % f.length]!);
      cnt.set(k, (cnt.get(k) ?? 0) + 1);
    }
  }
  for (const fi of faces) {
    const f = m.f[fi]!;
    for (let i = 0; i < f.length; i++) {
      const a = f[i]!;
      const b = f[(i + 1) % f.length]!;
      if (cnt.get(ek(a, b)) !== 1) continue;
      m.f.push([a, b, map.get(b)!, map.get(a)!]);
      m.fc.push(side ?? col ?? m.fc[fi]!);
    }
    m.f[fi] = f.map((v) => map.get(v)!);
    if (col !== null) m.fc[fi] = col;
  }
}
function vertexNormals(m: PMesh): V3[] {
  const n = m.v.map(() => new THREE.Vector3());
  for (const f of m.f) {
    const fn = newell(m, f);
    for (const v of f) n[v]!.add(fn);
  }
  for (const x of n) x.normalize();
  return n;
}
interface SubOut {
  m: PMesh;
  lin: V3[];
  linN: V3[] | null;
  parent: number[];
}
/** Catmull-Clark 한 번 — 날카로운 모서리 규칙 포함 */
function catmull(m: PMesh, prevN: V3[] | null): SubOut {
  const nv = m.v.length;
  const E = new Map<number, { a: number; b: number; f: number[]; id: number }>();
  const vE: number[][] = m.v.map(() => []);
  const vF: number[][] = m.v.map(() => []);
  const elist: { a: number; b: number; f: number[]; id: number }[] = [];
  m.f.forEach((f, fi) => {
    for (let i = 0; i < f.length; i++) {
      const a = f[i]!;
      const b = f[(i + 1) % f.length]!;
      const k = ek(a, b);
      let e = E.get(k);
      if (!e) {
        e = { a, b, f: [], id: elist.length };
        E.set(k, e);
        elist.push(e);
        vE[a]!.push(e.id);
        vE[b]!.push(e.id);
      }
      e.f.push(fi);
      vF[a]!.push(fi);
    }
  });
  const fp = m.f.map((f) => centroid(m, f));
  const sharp = (e: { a: number; b: number; f: number[] }): boolean => e.f.length < 2 || m.cr.has(ek(e.a, e.b));
  const out: PMesh = { v: [], f: [], fc: [], cr: new Set() };
  const lin: V3[] = [];
  const linN: V3[] | null = prevN ? [] : null;
  for (let v = 0; v < nv; v++) {
    const p = m.v[v]!;
    const es = vE[v]!.map((i) => elist[i]!);
    const cs = es.filter(sharp);
    let q: V3;
    if (cs.length >= 3) q = p.clone();
    else if (cs.length === 2) {
      const o = cs.map((e) => m.v[e.a === v ? e.b : e.a]!);
      q = p.clone().multiplyScalar(6).add(o[0]!).add(o[1]!).divideScalar(8);
    } else {
      const n = es.length;
      const F = new THREE.Vector3();
      for (const fi of vF[v]!) F.add(fp[fi]!);
      F.divideScalar(vF[v]!.length);
      const Rm = new THREE.Vector3();
      for (const e of es) Rm.add(m.v[e.a]!).add(m.v[e.b]!);
      Rm.divideScalar(2 * n);
      q = F.add(Rm.multiplyScalar(2)).addScaledVector(p, n - 3).divideScalar(n);
    }
    out.v.push(q);
    lin.push(p.clone());
    linN?.push(prevN![v]!.clone());
  }
  for (const e of elist) {
    const mid = m.v[e.a]!.clone().add(m.v[e.b]!).multiplyScalar(0.5);
    out.v.push(sharp(e) ? mid.clone() : m.v[e.a]!.clone().add(m.v[e.b]!).add(fp[e.f[0]!]!).add(fp[e.f[1]!]!).multiplyScalar(0.25));
    lin.push(mid);
    linN?.push(prevN![e.a]!.clone().add(prevN![e.b]!).normalize());
    if (m.cr.has(ek(e.a, e.b))) {
      out.cr.add(ek(e.a, nv + e.id));
      out.cr.add(ek(nv + e.id, e.b));
    }
  }
  const f0 = nv + elist.length;
  m.f.forEach((f, fi) => {
    out.v.push(fp[fi]!.clone());
    lin.push(fp[fi]!.clone());
    if (linN) {
      const s = new THREE.Vector3();
      for (const v of f) s.add(prevN![v]!);
      linN.push(s.normalize());
    }
  });
  const parent: number[] = [];
  m.f.forEach((f, fi) => {
    const n = f.length;
    for (let i = 0; i < n; i++) {
      const a = f[i]!;
      const eNext = nv + E.get(ek(a, f[(i + 1) % n]!))!.id;
      const ePrev = nv + E.get(ek(f[(i + n - 1) % n]!, a))!.id;
      out.f.push([a, eNext, f0 + fi, ePrev]);
      out.fc.push(m.fc[fi]!);
      parent.push(fi);
    }
  });
  return { m: out, lin, linN, parent };
}
function triangulate(m: PMesh): PMesh {
  const o: PMesh = { v: m.v, f: [], fc: [], cr: m.cr };
  m.f.forEach((f, fi) => {
    for (let i = 1; i < f.length - 1; i++) {
      o.f.push([f[0]!, f[i]!, f[i + 1]!]);
      o.fc.push(m.fc[fi]!);
    }
  });
  return o;
}
/** Loop 한 번 (삼각형) */
function loopSub(m: PMesh, prevN: V3[] | null): SubOut {
  const nv = m.v.length;
  const E = new Map<number, { a: number; b: number; opp: number[]; id: number }>();
  const nb: Set<number>[] = m.v.map(() => new Set());
  const elist: { a: number; b: number; opp: number[]; id: number }[] = [];
  for (const f of m.f)
    for (let i = 0; i < 3; i++) {
      const a = f[i]!, b = f[(i + 1) % 3]!, c = f[(i + 2) % 3]!;
      let e = E.get(ek(a, b));
      if (!e) {
        e = { a, b, opp: [], id: elist.length };
        E.set(ek(a, b), e);
        elist.push(e);
      }
      e.opp.push(c);
      nb[a]!.add(b);
      nb[b]!.add(a);
    }
  const sharp = (e: { a: number; b: number; opp: number[] }): boolean => e.opp.length < 2 || m.cr.has(ek(e.a, e.b));
  const out: PMesh = { v: [], f: [], fc: [], cr: new Set() };
  const lin: V3[] = [];
  const linN: V3[] | null = prevN ? [] : null;
  for (let v = 0; v < nv; v++) {
    const p = m.v[v]!;
    const ns = [...nb[v]!];
    const cs = ns.filter((o) => sharp(E.get(ek(v, o))!));
    let q: V3;
    if (cs.length >= 3) q = p.clone();
    else if (cs.length === 2) q = p.clone().multiplyScalar(0.75).addScaledVector(m.v[cs[0]!]!, 0.125).addScaledVector(m.v[cs[1]!]!, 0.125);
    else {
      const n = ns.length;
      const beta = n === 3 ? 3 / 16 : 3 / (8 * n);
      q = p.clone().multiplyScalar(1 - n * beta);
      for (const o of ns) q.addScaledVector(m.v[o]!, beta);
    }
    out.v.push(q);
    lin.push(p.clone());
    linN?.push(prevN![v]!.clone());
  }
  for (const e of elist) {
    const mid = m.v[e.a]!.clone().add(m.v[e.b]!).multiplyScalar(0.5);
    out.v.push(sharp(e) ? mid.clone() : m.v[e.a]!.clone().add(m.v[e.b]!).multiplyScalar(0.375).addScaledVector(m.v[e.opp[0]!]!, 0.125).addScaledVector(m.v[e.opp[1]!]!, 0.125));
    lin.push(mid);
    linN?.push(prevN![e.a]!.clone().add(prevN![e.b]!).normalize());
    if (m.cr.has(ek(e.a, e.b))) {
      out.cr.add(ek(e.a, nv + e.id));
      out.cr.add(ek(nv + e.id, e.b));
    }
  }
  const parent: number[] = [];
  m.f.forEach((f, fi) => {
    const [a, b, c] = [f[0]!, f[1]!, f[2]!];
    const ab = nv + E.get(ek(a, b))!.id, bc = nv + E.get(ek(b, c))!.id, ca = nv + E.get(ek(c, a))!.id;
    for (const t of [[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]]) {
      out.f.push(t);
      out.fc.push(m.fc[fi]!);
      parent.push(fi);
    }
  });
  return { m: out, lin, linN, parent };
}
/** 한 단계 그리기용: 기준 = 앞 단계 면 위(lin), 목표(morph) = 매끈한 자리 → 녹아내리듯 이어짐 */
function levelGeo(cur: PMesh, sub: SubOut | null, prevFlat: V3[] | null): { geo: THREE.BufferGeometry; target: Float32Array } {
  const tris: [number, number, number, number][] = [];
  cur.f.forEach((f, fi) => {
    for (let i = 1; i < f.length - 1; i++) tris.push([f[0]!, f[i]!, f[i + 1]!, fi]);
  });
  const n = tris.length * 3;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const tp = new Float32Array(n * 3), tn = new Float32Array(n * 3);
  const sN = vertexNormals(cur);
  const flat = cur.f.map((f) => newell(cur, f).normalize());
  const c = new THREE.Color();
  let k = 0;
  for (const [a, b, d, fi] of tris) {
    c.set(cur.fc[fi]!);
    for (const v of [a, b, d]) {
      const P = sub ? sub.lin[v]! : cur.v[v]!;
      const N = !sub ? flat[fi]! : prevFlat ? prevFlat[sub.parent[fi]!]! : sub.linN![v]!;
      pos.set([P.x, P.y, P.z], k * 3);
      nor.set([N.x, N.y, N.z], k * 3);
      col.set([c.r, c.g, c.b], k * 3);
      const T = cur.v[v]!;
      const TN = sub ? sN[v]! : flat[fi]!;
      tp.set([T.x, T.y, T.z], k * 3);
      tn.set([TN.x, TN.y, TN.z], k * 3);
      k++;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (sub) {
    g.morphAttributes['position'] = [new THREE.BufferAttribute(tp, 3)];
    g.morphAttributes['normal'] = [new THREE.BufferAttribute(tn, 3)];
  }
  g.computeBoundingSphere();
  return { geo: g, target: tp };
}

interface Decal {
  o: [number, number, number];
  d: [number, number, number];
  make(): THREE.Object3D;
}
function chickCage(seed: number): { m: PMesh; decals: Decal[]; extra: THREE.Object3D[] } {
  const R0 = rng(seed);
  const pals = [[0xffd84a, 0xf7c430, 0xff9a3c], [0x8fd3ff, 0x6bb8f0, 0xffb347], [0xffb7d5, 0xf59cc2, 0xff8a5c], [0xc9f07a, 0xa9dc55, 0xff9a3c]];
  const [body, wing, beak] = pals[(seed - 1) % pals.length]!;
  const m = gridBox(1, 1, 1, 3, 3, 3, body!);
  for (const v of m.v) {
    v.lerp(v.clone().normalize().multiplyScalar(1.12), 0.55);
    const k = 1 - 0.16 * ((v.y + 1) / 2);
    v.x *= 0.98 * k;
    v.z *= 0.9 * k;
  }
  const V = (x: number, y: number, z: number): V3 => new THREE.Vector3(x, y, z);
  let f = pickFace(m, V(0, 0, 1), V(0, 0, 1));
  extrude(m, [f], 0.22, 0.5, beak!);
  extrude(m, [f], 0.16, 0.3, beak!, null, (p) => (p.y -= 0.05));
  const wl = 0.1 + R0() * 0.12;
  for (const s of [-1, 1]) {
    f = pickFace(m, V(s, 0, 0), V(s, -0.1, 0));
    extrude(m, [f], 0.22, 0.8, wing!, null, (p) => ((p.y -= wl), (p.z -= 0.1)));
  }
  f = pickFace(m, V(0, 0, -1), V(0, 0.67, -1));
  extrude(m, [f], 0.3, 0.6, wing!, null, (p) => (p.y += 0.18));
  f = pickFace(m, V(0, 1, 0), V(0, 1, 0));
  const cz = 0.05 + R0() * 0.1;
  extrude(m, [f], 0.24, 0.5, null, null, (p) => (p.z += cz));
  extrude(m, [f], 0.2, 0.45, null, null, (p) => (p.z -= 0.16));
  for (const s of [-1, 1]) {
    f = pickFace(m, V(0, -1, 0), V(s * 0.67, -1, 0.0));
    extrude(m, [f], 0.22, 0.7, beak!, null, (p) => (p.z += 0.14));
  }
  const black = new THREE.MeshPhysicalMaterial({ color: 0x181410, roughness: 0.12, clearcoat: 1 });
  const decals: Decal[] = [];
  for (const s of [-1, 1]) {
    decals.push({ o: [s * 0.36, 0.42, 4], d: [0, 0, -1], make: () => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), black);
      e.scale.set(0.1, 0.13, 0.06);
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      hl.position.set(0.3, 0.35, 0.8);
      e.add(hl);
      return e;
    } });
    decals.push({ o: [s * 0.58, 0.08, 4], d: [0, 0, -1], make: () => {
      const c = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshStandardMaterial({ color: 0xff8fa8, roughness: 0.7 }));
      c.scale.set(0.12, 0.07, 0.03);
      return c;
    } });
  }
  return { m, decals, extra: [] };
}
function carCage(): { m: PMesh; decals: Decal[]; extra: THREE.Object3D[] } {
  const m = gridBox(1.15, 0.34, 0.62, 4, 2, 2, 0xe8453c);
  const top = m.f.map((f, i) => [f, i] as const).filter(([f]) => newell(m, f).normalize().y > 0.7 && Math.abs(centroid(m, f).x) < 0.6).map(([, i]) => i);
  extrude(m, top, 0.4, 0.8, null, 0xbfe6ff, (p) => (p.x -= 0.1));
  m.f.forEach((f) => {
    if (newell(m, f).normalize().y < -0.7) for (let i = 0; i < f.length; i++) m.cr.add(ek(f[i]!, f[(i + 1) % f.length]!));
  });
  const decals: Decal[] = [];
  for (const s of [-1, 1]) {
    decals.push({ o: [4, 0.02, s * 0.36], d: [-1, 0, 0], make: () => {
      const l = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshStandardMaterial({ color: 0xfff3b0, emissive: 0xffe27a, emissiveIntensity: 0.8 }));
      l.scale.set(0.12, 0.1, 0.04);
      return l;
    } });
    decals.push({ o: [-4, 0.06, s * 0.4], d: [1, 0, 0], make: () => {
      const l = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshStandardMaterial({ color: 0xff4a4a, emissive: 0xff2020, emissiveIntensity: 0.6 }));
      l.scale.set(0.08, 0.06, 0.03);
      return l;
    } });
  }
  const extra: THREE.Object3D[] = [];
  const tyre = new THREE.MeshStandardMaterial({ color: 0x24252b, roughness: 0.8 });
  const hub = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.35, metalness: 0.3 });
  for (const x of [-0.68, 0.68])
    for (const z of [-0.64, 0.64]) {
      const w = new THREE.Group();
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.1, 12, 24), tyre);
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.12, 20).rotateX(Math.PI / 2), hub);
      w.add(t, h);
      w.position.set(x, -0.3, z);
      t.castShadow = h.castShadow = true;
      extra.push(w);
    }
  return { m, decals, extra };
}

function demoSubdiv(): Scene3D {
  const st = new Stage({ cam: [0, 1.55, 5.2], look: [0, 0.85, 0], island: 1.55 });
  const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const S = { shape: 0, loop: false, crease: true, cage: true, auto: true, level: 3, seed: 1 };
  const holder = new THREE.Group();
  st.spin.add(holder);
  let levels: THREE.Mesh[] = [];
  let decals: { obj: THREE.Object3D; hits: { p: V3; n: V3 }[] }[] = [];
  let ms = 0;
  const lineMat = new THREE.LineBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.9, toneMapped: false });
  const creaseMat = new THREE.LineBasicMaterial({ color: 0xff3d8b, toneMapped: false });
  const cageGrp = new THREE.Group();
  holder.add(cageGrp);
  const ray = new THREE.Raycaster();
  const build = (): void => {
    const t0 = performance.now();
    for (const m of levels) {
      st.models.splice(st.models.indexOf(m), 1);
      m.geometry.dispose();
    }
    disposeTree(holder);
    holder.clear();
    cageGrp.clear();
    holder.add(cageGrp);
    levels = [];
    decals = [];
    const src = S.shape === 0 ? chickCage(S.seed) : carCage();
    if (!S.crease) src.m.cr.clear();
    const cage0 = S.loop ? triangulate(src.m) : src.m;
    // 틀 선
    const lp: number[] = [];
    const cp: number[] = [];
    const seen = new Set<number>();
    for (const f of src.m.f)
      for (let i = 0; i < f.length; i++) {
        const a = f[i]!, b = f[(i + 1) % f.length]!;
        const k = ek(a, b);
        if (seen.has(k)) continue;
        seen.add(k);
        const arr = src.m.cr.has(k) ? cp : lp;
        arr.push(...src.m.v[a]!.toArray(), ...src.m.v[b]!.toArray());
      }
    const lg = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    const cg = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
    cageGrp.add(new THREE.LineSegments(lg, lineMat), new THREE.LineSegments(cg, creaseMat));
    // 단계 0 ~ 3
    const targets: Float32Array[] = [];
    let cur = cage0;
    const L0 = levelGeo(cur, null, null);
    levels.push(new THREE.Mesh(L0.geo, mat));
    targets.push(L0.target);
    for (let k = 1; k <= 3; k++) {
      const prevN = k === 1 ? null : vertexNormals(cur);
      const prevFlat = k === 1 ? cur.f.map((f) => newell(cur, f).normalize()) : null;
      const sub = S.loop ? loopSub(cur, prevN) : catmull(cur, prevN);
      const L = levelGeo(sub.m, sub, prevFlat);
      const mesh = new THREE.Mesh(L.geo, mat);
      mesh.updateMorphTargets();
      levels.push(mesh);
      targets.push(L.target);
      cur = sub.m;
    }
    for (const m of levels) holder.add(st.model(m));
    // 얼굴 · 등 — 단계마다 표면 위 자리를 미리 찾아 둔다
    const probes = targets.map((tp) => new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(tp, 3)), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })));
    for (const d of src.decals) {
      const obj = d.make();
      const hits = probes.map((pm) => {
        ray.set(new THREE.Vector3(...d.o), new THREE.Vector3(...d.d));
        const h = ray.intersectObject(pm)[0];
        return h ? { p: h.point.clone(), n: h.face!.normal.clone() } : { p: new THREE.Vector3(...d.o), n: new THREE.Vector3(0, 0, 1) };
      });
      holder.add(obj);
      decals.push({ obj, hits });
    }
    for (const pm of probes) pm.geometry.dispose();
    for (const e of src.extra) holder.add(e);
    holder.position.y = S.shape === 0 ? 0.95 : 0.52;
    holder.scale.setScalar(S.shape === 0 ? 0.78 : 0.95);
    ms = performance.now() - t0;
  };
  build();
  let frameNo = 0;
  const PH = [1.1, 0.8, 0.5, 0.8, 0.5, 0.8, 1.7];
  const TOT = PH.reduce((a, b) => a + b, 0);
  const pv = new THREE.Vector3();
  const nv = new THREE.Vector3();
  const Zp = new THREE.Vector3(0, 0, 1);
  return st.out({
    update(t) {
      let level = S.level;
      let inf = 1;
      if (S.auto) {
        let k = t % TOT;
        let ph = 0;
        while (ph < PH.length - 1 && k > PH[ph]!) k -= PH[ph++]!;
        if (ph === 0) level = 0;
        else {
          level = Math.ceil(ph / 2);
          inf = ph % 2 === 1 ? ease(k / PH[ph]!) : 1;
        }
      }
      const warm = frameNo++ < 2;
      levels.forEach((m, i) => {
        m.visible = warm || i === level;
        if (m.morphTargetInfluences) m.morphTargetInfluences[0] = inf;
      });
      for (const d of decals) {
        const a = d.hits[Math.max(0, level - 1)]!;
        const b = d.hits[level]!;
        const w = level === 0 ? 1 : inf;
        pv.copy(a.p).lerp(b.p, w);
        nv.copy(a.n).lerp(b.n, w).normalize();
        d.obj.position.copy(pv);
        d.obj.quaternion.setFromUnitVectors(Zp, nv);
      }
      cageGrp.visible = S.cage;
      st.spin.rotation.y = Math.sin(t * 0.5) * 0.7 + (S.shape === 1 ? 0.5 : 0);
      st.hud.tl.set(`▲ 삼각형 ${fmt(st.tris())}`);
      st.hud.bl.set(`${S.loop ? 'Loop' : 'Catmull-Clark'} 단계 ${level}${S.crease && S.shape === 1 ? ' · 분홍 = 날카로운 모서리' : ''} · ${ms.toFixed(0)}ms`);
    },
    controls: [
      { type: 'toggle', label: '자동 재생 (단계 올리기)', value: true, on: (v) => (S.auto = v) },
      { type: 'range', label: '나누기 단계', min: 0, max: 3, step: 1, value: 3, on: (v) => ((S.level = v), (S.auto = false)) },
      { type: 'range', label: '모양 (0 병아리 · 1 장난감 차)', min: 0, max: 1, step: 1, value: 0, on: (v) => ((S.shape = v), build()) },
      { type: 'toggle', label: 'Loop 방식 (삼각형으로 나누기)', value: false, on: (v) => ((S.loop = v), build()) },
      { type: 'toggle', label: '날카로운 모서리 (차 바닥)', value: true, on: (v) => ((S.crease = v), build()) },
      { type: 'toggle', label: '처음 상자 틀 보기', value: true, on: (v) => (S.cage = v) },
      { type: 'toggle', label: '와이어프레임', value: false, on: (v) => (st.wire.on = v) },
      { type: 'button', label: '새로 만들기 (색 · 비율)', on: () => ((S.seed += 1), build()) },
    ],
    dispose() {
      lineMat.dispose();
      creaseMat.dispose();
    },
  });
}

/* ───────────── i449 스윕 · 로프트 ───────────── */

interface SweepOpt {
  pts: V3[];
  radial: number;
  radius: (u: number) => number;
  section?: (a: number, u: number) => number;
  twist?: (u: number) => number;
  sxy?: (u: number) => [number, number];
  color: (u: number, a: number, out: THREE.Color) => void;
  startCap?: boolean;
}
interface Sweep {
  geo: THREE.BufferGeometry;
  rings: number;
  radial: number;
  capTri: number;
  frames: { p: V3; t: V3 }[];
}
/** 곡선을 따라 단면 끌기 — 평행 이동 틀, 비틀림 · 크기 · 납작함이 u 에 따라 */
function buildSweep(o: SweepOpt): Sweep {
  const n = o.pts.length;
  const rad = o.radial;
  const cap = o.startCap ? 1 : 0;
  const pos = new Float32Array((n * rad + cap) * 3);
  const col = new Float32Array((n * rad + cap) * 3);
  const idx: number[] = [];
  const T = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();
  const c = new THREE.Color();
  const frames: Sweep['frames'] = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const p = o.pts[i]!;
    T.subVectors(o.pts[Math.min(n - 1, i + 1)]!, o.pts[Math.max(0, i - 1)]!).normalize();
    if (i === 0) {
      N.set(0, 1, 0).addScaledVector(T, -T.y);
      if (N.lengthSq() < 1e-4) N.set(1, 0, 0).addScaledVector(T, -T.x);
      N.normalize();
    } else {
      N.addScaledVector(T, -N.dot(T)).normalize();
    }
    B.crossVectors(T, N);
    frames.push({ p: p.clone(), t: T.clone() });
    const r = o.radius(u);
    const tw = o.twist ? o.twist(u) : 0;
    const [sx, sy] = o.sxy ? o.sxy(u) : [1, 1];
    for (let j = 0; j < rad; j++) {
      const a = (j / rad) * TAU;
      const la = a - tw;
      const rr = r * (o.section ? o.section(la, u) : 1);
      const ca = Math.cos(a) * rr * sx;
      const sa = Math.sin(a) * rr * sy;
      const k = (i * rad + j) * 3;
      pos[k] = p.x + N.x * ca + B.x * sa;
      pos[k + 1] = p.y + N.y * ca + B.y * sa;
      pos[k + 2] = p.z + N.z * ca + B.z * sa;
      o.color(u, la, c);
      col[k] = c.r;
      col[k + 1] = c.g;
      col[k + 2] = c.b;
    }
  }
  if (cap) {
    const ci = n * rad;
    pos.set(o.pts[0]!.toArray(), ci * 3);
    o.color(0, 0, c);
    col.set([c.r, c.g, c.b], ci * 3);
    for (let j = 0; j < rad; j++) idx.push(ci, (j + 1) % rad, j);
  }
  for (let i = 0; i < n - 1; i++)
    for (let j = 0; j < rad; j++) {
      const a = i * rad + j;
      const a1 = i * rad + ((j + 1) % rad);
      idx.push(a, a1, a + rad, a1, a1 + rad, a + rad);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return { geo: g, rings: n, radial: rad, capTri: cap ? rad : 0, frames };
}
/** 스윕 하나를 화면에: 진행 정도만큼 그리고, 앞머리에 단면(뚜껑) + 빛나는 테 + 남은 길 점선 */
class SweepView {
  sw!: Sweep;
  readonly mesh: THREE.Mesh;
  readonly cap: THREE.Mesh;
  readonly ring: THREE.LineLoop;
  readonly path: THREE.Line;
  constructor(st: Stage, parent: THREE.Object3D, mat: THREE.Material, capMat: THREE.Material, ringMat: THREE.LineBasicMaterial, pathMat: THREE.LineDashedMaterial) {
    this.mesh = st.model(new THREE.Mesh(new THREE.BufferGeometry(), mat));
    this.cap = new THREE.Mesh(new THREE.BufferGeometry(), capMat);
    this.ring = new THREE.LineLoop(new THREE.BufferGeometry(), ringMat);
    this.path = new THREE.Line(new THREE.BufferGeometry(), pathMat);
    this.ring.renderOrder = 6;
    parent.add(this.mesh, this.cap, this.ring, this.path);
  }
  set(sw: Sweep): void {
    this.mesh.geometry.dispose();
    this.sw = sw;
    this.mesh.geometry = sw.geo;
    const R = sw.radial;
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.BufferAttribute(new Float32Array((R + 1) * 3), 3));
    cg.setAttribute('color', new THREE.BufferAttribute(new Float32Array((R + 1) * 3), 3));
    const ci: number[] = [];
    for (let j = 0; j < R; j++) ci.push(R, j, (j + 1) % R);
    cg.setIndex(ci);
    this.cap.geometry.dispose();
    this.cap.geometry = cg;
    this.ring.geometry.dispose();
    this.ring.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(R * 3), 3));
    this.path.geometry.dispose();
    this.path.geometry = new THREE.BufferGeometry().setFromPoints(sw.frames.map((f) => f.p));
    this.path.computeLineDistances();
  }
  progress(p: number, showPath: boolean): void {
    const sw = this.sw;
    const R = sw.radial;
    const segs = Math.round(clamp(p, 0, 1) * (sw.rings - 1));
    sw.geo.setDrawRange(0, p <= 0 ? 0 : (sw.capTri + segs * R * 2) * 3);
    const active = p > 0.001 && p < 0.999;
    this.cap.visible = this.ring.visible = active;
    this.path.visible = showPath && p < 0.999;
    this.path.geometry.setDrawRange(segs, sw.rings - segs);
    if (!active) return;
    const src = sw.geo.getAttribute('position').array as Float32Array;
    const scol = sw.geo.getAttribute('color').array as Float32Array;
    const cp = this.cap.geometry.getAttribute('position') as THREE.BufferAttribute;
    const cc = this.cap.geometry.getAttribute('color') as THREE.BufferAttribute;
    const rp = this.ring.geometry.getAttribute('position') as THREE.BufferAttribute;
    const f = sw.frames[segs]!;
    const o = segs * R * 3;
    for (let j = 0; j < R; j++) {
      const x = src[o + j * 3]!, y = src[o + j * 3 + 1]!, z = src[o + j * 3 + 2]!;
      cp.setXYZ(j, x, y, z);
      cc.setXYZ(j, scol[o + j * 3]! * 1.15, scol[o + j * 3 + 1]! * 1.15, scol[o + j * 3 + 2]! * 1.15);
      rp.setXYZ(j, f.p.x + (x - f.p.x) * 1.08, f.p.y + (y - f.p.y) * 1.08, f.p.z + (z - f.p.z) * 1.08);
    }
    cp.setXYZ(R, f.p.x, f.p.y, f.p.z);
    cc.setXYZ(R, scol[o]!, scol[o + 1]!, scol[o + 2]!);
    cp.needsUpdate = cc.needsUpdate = rp.needsUpdate = true;
    this.cap.geometry.computeVertexNormals();
    this.cap.geometry.computeBoundingSphere();
    this.ring.geometry.computeBoundingSphere();
  }
}

const crPts = (pts: [number, number, number][], n: number): V3[] => new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))).getSpacedPoints(n - 1);

function demoSweep(): Scene3D {
  const st = new Stage({ cam: [0, 1.55, 5.3], look: [0, 0.75, 0], island: 1.7 });
  const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.25, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const hornMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.28, clearcoat: 0.9, iridescence: 0.5, iridescenceIOR: 1.4, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const capMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, side: THREE.DoubleSide, emissive: 0x223344 });
  const ringMat = new THREE.LineBasicMaterial({ color: 0xaef4ff, toneMapped: false, transparent: true, depthTest: false });
  const pathMat = new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.05, gapSize: 0.04, transparent: true, opacity: 0.55, toneMapped: false });
  const S = { auto: true, prog: 1, turns: 3, lobes: 5, taper: 0.9, path: true, seed: 1 };
  const W = st.spin;
  const V = (): SweepView => new SweepView(st, W, mat, capMat, ringMat, pathMat);
  const horn = new SweepView(st, W, hornMat, capMat, ringMat, pathMat);
  const vine = V();
  const flower = V();
  const shell = V();
  const body = V();
  const stalks = [V(), V()];
  // 고정 소품: 방석 · 금 고리 · 막대 · 눈알
  const props = new THREE.Group();
  W.add(props);
  const P2 = (x: number, y: number): THREE.Vector2 => new THREE.Vector2(x, y);
  const cushion = new THREE.Mesh(new THREE.LatheGeometry([P2(0.001, 0), P2(0.38, 0.0), P2(0.47, 0.06), P2(0.45, 0.14), P2(0.3, 0.19), P2(0.001, 0.2)], 40), new THREE.MeshStandardMaterial({ color: 0xff8fb8, roughness: 0.6 }));
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc94a, metalness: 1, roughness: 0.25 });
  const ringG = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.045, 12, 40).rotateX(Math.PI / 2), gold);
  ringG.position.y = 0.2;
  const hornBase = new THREE.Group();
  hornBase.add(cushion, ringG);
  hornBase.position.set(0.05, 0, -0.35);
  const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 1.75, 10).translate(0, 0.875, 0), new THREE.MeshStandardMaterial({ color: 0xa2774c, roughness: 0.85 }));
  const stakeTip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.1, 10).translate(0, 1.8, 0), stake.material);
  const vineBase = new THREE.Group();
  vineBase.add(stake, stakeTip);
  vineBase.position.set(-1.0, 0, -0.15);
  const snail = new THREE.Group();
  snail.position.set(0.95, 0, 0.55);
  snail.rotation.y = 0.4;
  props.add(hornBase, vineBase, snail);
  for (const o of [cushion, ringG, stake, stakeTip]) o.castShadow = o.receiveShadow = true;
  const eyeBalls: THREE.Group[] = [];
  for (let s = 0; s < 2; s++) {
    const g = new THREE.Group();
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.034, 12, 8), new THREE.MeshPhysicalMaterial({ color: 0x14100c, roughness: 0.1, clearcoat: 1 }));
    p.position.set(-0.02, 0.005, 0.035);
    g.add(w, p);
    snail.add(g);
    eyeBalls.push(g);
  }
  // 덩굴 잎 (하트 잎 카드)
  const leafG = leafCardGeo(true);
  const leaves = st.model(new THREE.InstancedMesh(leafG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide }), 24), false);
  vineBase.add(leaves);
  let leafU: { u: number; m: THREE.Matrix4 }[] = [];
  // 스윕 다시 만들기
  for (const sv of [vine, flower, shell, body, ...stalks]) {
    sv.mesh.removeFromParent();
    sv.cap.removeFromParent();
    sv.ring.removeFromParent();
    sv.path.removeFromParent();
  }
  for (const sv of [vine, flower]) vineBase.add(sv.mesh, sv.cap, sv.ring, sv.path);
  for (const sv of [shell, body, ...stalks]) snail.add(sv.mesh, sv.cap, sv.ring, sv.path);
  for (const o of [horn.mesh, horn.cap, horn.ring, horn.path]) hornBase.add(o);
  let ms = 0;
  const cA = new THREE.Color(0xc9b6ff), cB = new THREE.Color(0xffb3d9), cC = new THREE.Color(0xfff0c8);
  const buildHorn = (): void => {
    const R0 = rng(S.seed);
    const bend = 0.1 + R0() * 0.25;
    horn.set(buildSweep({
      pts: crPts([[0, 0.2, 0], [0.02, 0.6, 0], [bend * 0.5, 1.05, 0.02], [bend, 1.5, 0.05]], 120),
      radial: 48,
      radius: (u) => 0.25 * Math.pow(1 - u, S.taper) + 0.003,
      section: (a) => (S.lobes ? 1 + 0.15 * Math.cos(S.lobes * a) : 1),
      twist: (u) => S.turns * TAU * u,
      color: (u, a, o) => {
        if (u < 0.5) o.copy(cA).lerp(cB, u * 2);
        else o.copy(cB).lerp(cC, (u - 0.5) * 2);
        if (S.lobes) o.multiplyScalar(0.82 + 0.18 * (0.5 + 0.5 * Math.cos(S.lobes * a)));
      },
      startCap: true,
    }));
  };
  const build = (): void => {
    const t0 = performance.now();
    const R0 = rng(S.seed * 3 + 1);
    buildHorn();
    // 덩굴: 막대를 감고 오르는 나선
    const turns = 2.2 + R0() * 0.8;
    const vp: V3[] = [];
    for (let i = 0; i < 150; i++) {
      const u = i / 149;
      const a = turns * TAU * u;
      const r = 0.085 + 0.012 * Math.sin(a * 3);
      vp.push(new THREE.Vector3(Math.cos(a) * r, 0.02 + 1.5 * u, Math.sin(a) * r));
    }
    const g0 = new THREE.Color(0x4f9a3a), g1 = new THREE.Color(0x8fd16a);
    vine.set(buildSweep({ pts: vp, radial: 10, radius: (u) => 0.03 * (1 - u * 0.45), color: (u, _a, o) => o.copy(g0).lerp(g1, u), startCap: true }));
    leafU = [];
    const m4 = new THREE.Matrix4();
    for (let u = 0.1; u < 0.93; u += 0.075) {
      const i = Math.round(u * 149);
      const p = vp[i]!;
      const out = new THREE.Vector3(p.x, 0, p.z).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), out.clone().multiplyScalar(0.8).add(new THREE.Vector3(0, 0.6, 0)).normalize());
      q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), R0() * 0.8 - 0.4));
      const s = 0.17 + R0() * 0.07;
      leafU.push({ u, m: m4.clone().compose(p.clone().addScaledVector(out, 0.02), q, new THREE.Vector3(s, s, s)) });
    }
    leaves.count = leafU.length;
    leafU.forEach((_l, i) => leaves.setColorAt(i, new THREE.Color(0x5fb34a).offsetHSL(0, 0, (i % 3) * 0.04)));
    // 나팔꽃: 덩굴 끝에서 벌어지는 로프트
    const E = vp[vp.length - 1]!;
    const dir = new THREE.Vector3(E.x, 0, E.z).normalize();
    const fp = crPts([[E.x, E.y, E.z], [E.x + dir.x * 0.08, E.y + 0.07, E.z + dir.z * 0.08], [E.x + dir.x * 0.17, E.y + 0.18, E.z + dir.z * 0.17]], 40);
    const fA = new THREE.Color(0xfff6d0), fB = new THREE.Color(0x7d6bff), fW = new THREE.Color(0xffffff);
    flower.set(buildSweep({
      pts: fp,
      radial: 60,
      radius: (u) => 0.022 + 0.25 * Math.pow(u, 2.3),
      section: (a, u) => 1 + 0.09 * u * Math.cos(5 * a),
      color: (u, a, o) => {
        o.copy(fA).lerp(fB, ease(clamp((u - 0.3) / 0.6, 0, 1)));
        const star = Math.pow(0.5 + 0.5 * Math.cos(5 * a), 6);
        o.lerp(fW, star * 0.55 * u);
      },
    }));
    // 달팽이 껍데기: 로그 나선, 고리가 맞닿게 굵기 = 반지름 × 0.36
    const sp: V3[] = [];
    const th1 = 3.6 * Math.PI;
    for (let i = 0; i < 140; i++) {
      const th = (i / 139) * th1;
      const r = 0.055 * Math.exp(0.18 * th);
      sp.push(new THREE.Vector3(0.05 + Math.cos(-th + 2.2) * r, 0.5 + Math.sin(-th + 2.2) * r, 0.02 * Math.sin(th * 0.5)));
    }
    const s0 = new THREE.Color(0xe7a35a), s1 = new THREE.Color(0x9c5a32), s2 = new THREE.Color(0xfbe1b0);
    shell.set(buildSweep({
      pts: sp,
      radial: 28,
      radius: (u) => 0.055 * Math.exp(0.18 * u * th1) * 0.37 * (1 + 0.03 * Math.sin(u * 90)),
      color: (u, a, o) => {
        const band = 0.5 + 0.5 * Math.cos(a * 3);
        o.copy(s0).lerp(s1, band * 0.6).lerp(s2, Math.max(0, Math.cos(a)) * 0.35);
        o.multiplyScalar(0.92 + 0.08 * Math.sin(u * 90));
      },
      startCap: true,
    }));
    // 달팽이 몸: 납작한 꼬리 → 둥근 머리 (단면 크기 · 납작함이 바뀌는 로프트)
    const bp = crPts([[0.62, 0.05, 0], [0.3, 0.09, 0], [-0.1, 0.1, 0], [-0.42, 0.13, 0], [-0.6, 0.3, 0], [-0.64, 0.5, 0]], 70);
    const b0 = new THREE.Color(0xbfe08a), b1 = new THREE.Color(0xf3f8c8);
    body.set(buildSweep({
      pts: bp,
      radial: 28,
      radius: (u) => {
        const base = u < 0.15 ? lerp(0.02, 0.15, ease(u / 0.15)) : u < 0.7 ? 0.15 : u < 0.8 ? lerp(0.15, 0.12, (u - 0.7) / 0.1) : 0.12 + 0.02 * Math.sin(((u - 0.8) / 0.2) * Math.PI);
        return u > 0.88 ? base * Math.sqrt(Math.max(0.02, 1 - ((u - 0.88) / 0.12) ** 2)) : base;
      },
      sxy: (u) => (u < 0.65 ? [0.62, 1.25] : [lerp(0.62, 1, ease((u - 0.65) / 0.2)), lerp(1.25, 1, ease((u - 0.65) / 0.2))]),
      color: (_u, a, o) => o.copy(b0).lerp(b1, Math.max(0, -Math.cos(a)) * 0.8),
      startCap: true,
    }));
    [-1, 1].forEach((s, k) => {
      const tip = new THREE.Vector3(-0.72, 0.86, s * 0.11);
      stalks[k]!.set(buildSweep({ pts: crPts([[-0.62, 0.58, s * 0.04], [-0.66, 0.72, s * 0.07], [tip.x, tip.y, tip.z]], 20), radial: 10, radius: (u) => 0.026 - u * 0.008, color: (_u, _a, o) => o.copy(b0), startCap: true }));
      eyeBalls[k]!.position.copy(tip);
    });
    ms = performance.now() - t0;
  };
  build();
  const m4 = new THREE.Matrix4();
  const sc = new THREE.Matrix4();
  return st.out({
    update(t) {
      let k = S.prog * 6;
      if (S.auto) {
        const T = t % 9;
        k = T < 6.2 ? T : T < 8.3 ? 6.2 : 6.2 * (1 - ease((T - 8.3) / 0.7));
      }
      const pr = (a: number, b: number): number => clamp((k - a) / (b - a), 0, 1);
      horn.progress(pr(0.5, 3.4), S.path);
      vine.progress(pr(0.1, 3.0), S.path);
      flower.progress(pr(3.0, 4.0), S.path);
      body.progress(pr(0.2, 1.7), S.path);
      shell.progress(pr(1.6, 4.4), S.path);
      stalks[0]!.progress(pr(1.7, 2.3), false);
      stalks[1]!.progress(pr(1.7, 2.3), false);
      const ep = easeBack(pr(2.2, 2.7));
      for (const e of eyeBalls) e.scale.setScalar(Math.max(1e-3, ep));
      const vp = pr(0.1, 3.0);
      leafU.forEach((l, i) => {
        const s = Math.max(1e-3, easeBack((vp - l.u) / 0.12));
        sc.makeScale(s, s, s);
        leaves.setMatrixAt(i, m4.copy(l.m).multiply(sc));
      });
      leaves.instanceMatrix.needsUpdate = true;
      st.spin.rotation.y = Math.sin(t * 0.35) * 0.45;
      st.hud.tl.set(`▲ 삼각형 ${fmt(st.tris())}`);
      st.hud.bl.set(`단면 × 경로 · 뿔 비틀림 ${S.turns}바퀴 · 꽃잎 ${S.lobes} · ${ms.toFixed(0)}ms`);
    },
    controls: [
      { type: 'toggle', label: '자동 재생 (끌어 만들기)', value: true, on: (v) => (S.auto = v) },
      { type: 'range', label: '진행', min: 0, max: 1, step: 0.01, value: 1, on: (v) => ((S.prog = v), (S.auto = false)) },
      { type: 'range', label: '뿔 비틀림 (바퀴)', min: 0, max: 6, step: 0.5, value: 3, on: (v) => ((S.turns = v), buildHorn()) },
      { type: 'range', label: '단면 꽃잎 수 (0 = 동그라미)', min: 0, max: 8, step: 1, value: 5, on: (v) => ((S.lobes = v), buildHorn()) },
      { type: 'range', label: '가늘어짐 (지수)', min: 0.3, max: 2.2, step: 0.1, value: 0.9, on: (v) => ((S.taper = v), buildHorn()) },
      { type: 'toggle', label: '경로 점선 보기', value: true, on: (v) => (S.path = v) },
      { type: 'toggle', label: '와이어프레임', value: false, on: (v) => (st.wire.on = v) },
      { type: 'button', label: '새로 만들기 (곡선)', on: () => ((S.seed += 1), build()) },
    ],
    dispose() {
      leafG.dispose();
    },
  });
}

/* ── 여기에 다음 견본 ── */

export const DEMOS: DemoMap = {
  i444: { kind: '3d', caption: '잎이 될 점(노란 빛)을 향해 가지가 뻗어 자람 — 점을 먹으면 사라지고, 굵기는 다빈치 규칙', make: demoColony },
  i445: { kind: '3d', caption: '규칙 A → F[&A]/[&A]/[&A] 를 되풀이할 때마다 가지가 갈라짐 — 나무와 고사리가 같은 방식', make: demoLSystem },
  i446: { kind: '3d', caption: '구 · 캡슐 · 타원체를 거리 함수로 하나씩 녹여 붙이고 마칭 큐브로 메시 — 점토 곰돌이', make: demoSdf },
  i447: { kind: '3d', caption: '공들이 가까우면 녹아 붙는 면 — 방울이 튀어나갔다 기어 돌아와 색이 섞이며 합쳐지는 슬라임', make: demoMeta },
  i448: { kind: '3d', caption: '주황 선 = 처음 각진 상자 틀 — Catmull-Clark 로 한 단계씩 나눌 때마다 매끈한 병아리로 녹아내림', make: demoSubdiv },
  i449: { kind: '3d', caption: '빛나는 테 = 지금 끌고 가는 단면 — 비틀린 별 단면 뿔 · 감아 오르는 덩굴과 나팔꽃 · 나선 달팽이', make: demoSweep },
};
export type { Control };

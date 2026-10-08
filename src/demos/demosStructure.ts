import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { AfterimagePass } from 'three/examples/jsm/postprocessing/AfterimagePass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { DiceSet } from '@/game/games/shared/dice3d';
import type { DemoMap } from './types';

/**
 * 「모양 · 카메라 · 움직임 · 원리 설명 · 구조」 견본 (u28 ~ u47 · i17 ~ i21 · i35 ~ i45).
 * 원리 설명 견본은 작은 설명 장면 — 엔진 피스톤 · 톱니 · 렌즈 광선 · 날개 흐름처럼 「보면 원리가 보이게」.
 */

const FONT = '"Pretendard Variable", system-ui, sans-serif';
const TITLE = '"Black Han Sans", "Pretendard Variable", system-ui, sans-serif';
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const smooth = (x: number): number => {
  const k = clamp(x, 0, 1);
  return k * k * (3 - 2 * k);
};
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
/** 0 → 1 → 0 되풀이 (period 초, hold 비율만큼 끝에서 머묾) */
const pingpong = (t: number, period: number): number => {
  const p = (t % period) / period;
  return smooth(p < 0.5 ? p * 2 : 2 - p * 2);
};
/** 글씨 크기 — 카드 · 큰 화면에 맞게 (px 는 그려지는 픽셀) */
const fsz = (w: number, h: number, k = 1): number => Math.round(clamp(Math.min(w, h * 1.6) * 0.045, 11, 26) * k);

/* ───────────── 공통 도구 ───────────── */

function gradTex(top: string, bottom: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 256;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, top);
  gr.addColorStop(1, bottom);
  g.fillStyle = gr;
  g.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function baseScene(top = '#bfe6ff', bottom = '#f4fbff'): THREE.Scene {
  const s = new THREE.Scene();
  s.background = gradTex(top, bottom);
  s.add(new THREE.HemisphereLight(0xffffff, 0x9a8f80, 1.1));
  const sun = new THREE.DirectionalLight(0xfff3e0, 1.9);
  sun.position.set(-3, 6, 5);
  s.add(sun);
  const rim = new THREE.DirectionalLight(0xbfdcff, 0.7);
  rim.position.set(4, 2, -4);
  s.add(rim);
  return s;
}
const darkScene = (): THREE.Scene => baseScene('#1b2450', '#3a4a86');
/** 장면 안 모양 · 재질 · 그림 정리 (shared 표시가 있는 것은 건너뜀) */
function disposeScene(s: THREE.Object3D): void {
  const seen = new Set<unknown>();
  const kill = (x: { dispose(): void } | null | undefined): void => {
    if (!x || seen.has(x)) return;
    seen.add(x);
    x.dispose();
  };
  s.traverse((o) => {
    if (o.userData['shared']) return;
    const m = o as THREE.Mesh;
    if (m.geometry) kill(m.geometry);
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mt of mats) {
      if (!mt) continue;
      for (const v of Object.values(mt)) if (v && (v as THREE.Texture).isTexture) kill(v as THREE.Texture);
      kill(mt);
    }
  });
  const sc = s as THREE.Scene;
  if (sc.isScene && sc.background && (sc.background as THREE.Texture).isTexture) kill(sc.background as THREE.Texture);
}
function std(color: number, rough = 0.5, metal = 0, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
}

/** 3D 위에 얹는 글씨 층 — 내용(key)이 바뀔 때만 다시 그린다 */
class Hud {
  private cv = document.createElement('canvas');
  private g = this.cv.getContext('2d')!;
  private tex: THREE.CanvasTexture | null = null;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
  private mat = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  private geo = new THREE.PlaneGeometry(1, 1);
  private key = '';
  constructor() {
    const m = new THREE.Mesh(this.geo, this.mat);
    m.position.set(0.5, 0.5, 0);
    this.scene.add(m);
  }
  draw(r: THREE.WebGLRenderer, w: number, h: number, key: string, paint: (g: CanvasRenderingContext2D, w: number, h: number) => void): void {
    if (this.cv.width !== w || this.cv.height !== h || !this.tex) {
      this.cv.width = w;
      this.cv.height = h;
      this.tex?.dispose();
      this.tex = new THREE.CanvasTexture(this.cv);
      this.tex.colorSpace = THREE.SRGBColorSpace;
      this.tex.generateMipmaps = false;
      this.tex.minFilter = THREE.LinearFilter;
      this.mat.map = this.tex;
      this.mat.needsUpdate = true;
      this.key = '';
    }
    if (key !== this.key) {
      this.key = key;
      this.g.clearRect(0, 0, w, h);
      paint(this.g, w, h);
      this.tex.needsUpdate = true;
    }
    const ac = r.autoClear;
    const tm = r.toneMapping;
    r.autoClear = false;
    r.setViewport(0, 0, w, h);
    r.clearDepth();
    r.render(this.scene, this.cam);
    r.autoClear = ac;
    r.toneMapping = tm;
  }
  dispose(): void {
    this.tex?.dispose();
    this.mat.dispose();
    this.geo.dispose();
  }
}
/** 둥근 글씨 띠 */
function pill(g: CanvasRenderingContext2D, x: number, y: number, text: string, size: number, bg = 'rgba(20,28,60,0.72)', fg = '#fff', align: 'left' | 'center' | 'right' = 'left', font = FONT): number {
  g.font = `700 ${size}px ${font}`;
  const tw = g.measureText(text).width;
  const pw = tw + size * 1.1;
  const ph = size * 1.65;
  const x0 = align === 'left' ? x : align === 'center' ? x - pw / 2 : x - pw;
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(x0, y, pw, ph, ph / 2);
  g.fill();
  g.fillStyle = fg;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.fillText(text, x0 + size * 0.55, y + ph / 2 + size * 0.04);
  return pw;
}
/** 화면 반씩 두 장면 (왼쪽 a · 오른쪽 b) */
function splitRender(r: THREE.WebGLRenderer, w: number, h: number, a: THREE.Scene, b: THREE.Scene, cam: THREE.PerspectiveCamera, between?: (side: 0 | 1) => void): void {
  cam.aspect = w / 2 / h;
  cam.updateProjectionMatrix();
  r.setScissorTest(true);
  r.setViewport(0, 0, w / 2, h);
  r.setScissor(0, 0, w / 2, h);
  between?.(0);
  r.render(a, cam);
  r.setViewport(w / 2, 0, w / 2, h);
  r.setScissor(w / 2, 0, w / 2, h);
  between?.(1);
  r.render(b, cam);
  r.setScissorTest(false);
  r.setViewport(0, 0, w, h);
}
/** 반쪽 표시 글씨 + 가운데 금 */
function splitLabels(g: CanvasRenderingContext2D, w: number, h: number, left: string, right: string): void {
  const s = fsz(w, h, 0.9);
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.fillRect(w / 2 - 1, 0, 2, h);
  pill(g, s * 0.6, s * 0.6, left, s, 'rgba(30,40,80,0.7)');
  pill(g, w / 2 + s * 0.6, s * 0.6, right, s, 'rgba(255,120,60,0.9)');
}

/* ───── 내 견본 전용 WebGL 화면 (DOM 견본이 3D + HTML 을 겹칠 때) ───── */
let ownR: THREE.WebGLRenderer | null = null;
let ownRefs = 0;
function ownAcquire(): void {
  ownRefs++;
}
function ownRelease(): void {
  ownRefs--;
  if (ownRefs <= 0 && ownR) {
    ownR.dispose();
    ownR.forceContextLoss();
    ownR = null;
    ownRefs = 0;
  }
}
function ownRenderer(): THREE.WebGLRenderer {
  if (!ownR) {
    ownR = new THREE.WebGLRenderer({ antialias: true, stencil: true });
    ownR.setPixelRatio(1);
    ownR.toneMapping = THREE.NeutralToneMapping;
  }
  return ownR;
}
/** box 를 덮는 캔버스 하나 + 크기 맞추기 */
function boxCanvas(box: HTMLElement): { cv: HTMLCanvasElement; g: CanvasRenderingContext2D; fit(): { w: number; h: number; dpr: number } } {
  box.style.position = box.style.position || 'relative';
  const cv = document.createElement('canvas');
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  box.appendChild(cv);
  const g = cv.getContext('2d')!;
  return {
    cv,
    g,
    fit() {
      const dpr = Math.min(devicePixelRatio, 2);
      const w = Math.max(1, box.clientWidth);
      const h = Math.max(1, box.clientHeight);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      return { w, h, dpr };
    },
  };
}
/** 장면을 내 화면으로 그려 2D 캔버스 (x, y, w, h — CSS 픽셀) 자리에 붙임 */
const glWarm = new WeakMap<THREE.Scene, 'busy' | 'done'>();
function glPaint(g: CanvasRenderingContext2D, dpr: number, scene: THREE.Scene, cam: THREE.PerspectiveCamera, x: number, y: number, w: number, h: number, pre?: (r: THREE.WebGLRenderer) => void): void {
  const r = ownRenderer();
  const pw = Math.max(1, Math.round(w * dpr));
  const ph = Math.max(1, Math.round(h * dpr));
  const sz = r.getSize(new THREE.Vector2());
  if (sz.x !== pw || sz.y !== ph) r.setSize(pw, ph, false);
  cam.aspect = pw / ph;
  cam.updateProjectionMatrix();
  pre?.(r);
  // 처음 한 번은 셰이더를 뒤에서 굽고 그리지 않는다 — 전용 화면이라 견본 엔진의 미리 굽기가 닿지 않아 첫 장면에 1 ~ 2초 멈췄다
  const st = glWarm.get(scene);
  if (st !== 'done') {
    if (!st) {
      glWarm.set(scene, 'busy');
      void r
        .compileAsync(scene, cam)
        .catch(() => undefined)
        .then(() => glWarm.set(scene, 'done'));
    }
    return;
  }
  r.render(scene, cam);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(r.domElement, Math.round(x * dpr), Math.round(y * dpr));
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/* ───── 용 모델 (가짜 동전 게임의 dragon.glb) — 한 번 읽고 복제해 씀 ───── */
const DRAGON_URL = Object.values(import.meta.glob('/src/assets/games/fakecoin/*.glb', { eager: true, query: '?url', import: 'default' }) as Record<string, string>)[0];
let dragonP: Promise<GLTF> | null = null;
let dragonBytes = 0;
function loadDragon(): Promise<GLTF> {
  if (!dragonP)
    dragonP = new Promise((res, rej) => {
      if (!DRAGON_URL) return rej(new Error('dragon.glb 없음'));
      new GLTFLoader().load(
        DRAGON_URL,
        res,
        (e) => {
          if (e.total) dragonBytes = e.total;
          else if (e.loaded) dragonBytes = Math.max(dragonBytes, e.loaded);
        },
        rej,
      );
    });
  return dragonP;
}
/** 복제해서 키 size 에 맞추고 바닥을 y=0 에 */
function placeDragon(gl: GLTF, size: number): THREE.Object3D {
  const m = SkeletonUtils.clone(gl.scene);
  m.traverse((o) => (o.userData['shared'] = true));
  m.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(m, true);
  const s = box.getSize(new THREE.Vector3());
  const k = size / Math.max(s.x, s.y, s.z);
  m.scale.setScalar(k);
  m.position.set(-((box.min.x + box.max.x) / 2) * k, -box.min.y * k, -((box.min.z + box.max.z) / 2) * k);
  const holder = new THREE.Group();
  holder.add(m);
  return holder;
}
/** 금화 더미 바닥 */
function coinPile(): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(0.14, 0.14, 0.03, 18);
  const mat = std(0xf2c23a, 0.3, 0.85, { emissive: 0x4a2e00, emissiveIntensity: 0.4 });
  const inst = new THREE.InstancedMesh(geo, mat, 160);
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const mm = new THREE.Matrix4();
  for (let i = 0; i < 160; i++) {
    const a = Math.random() * TAU;
    const rr = Math.sqrt(Math.random()) * 1.6;
    const y = Math.max(0, 0.32 * (1 - rr / 1.6)) + Math.random() * 0.04;
    e.set((Math.random() - 0.5) * 0.8, Math.random() * TAU, (Math.random() - 0.5) * 0.8);
    q.setFromEuler(e);
    mm.compose(new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr), q, new THREE.Vector3(1, 1, 1));
    inst.setMatrixAt(i, mm);
  }
  g.add(inst);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.9, 0.12, 40), std(0x6b4a2e, 0.8));
  base.position.y = -0.06;
  g.add(base);
  return g;
}

/* ───── 크랭크 · 피스톤 (i37 · i39 · i45 가 함께) ───── */
interface Engine {
  root: THREE.Group;
  /** θ(라디안) — 0 이면 피스톤이 맨 위 */
  set(theta: number): number;
  r: number;
  L: number;
  pistonTop(): number;
  head: number;
  gas: THREE.Mesh;
  intake: THREE.Mesh;
  exhaust: THREE.Mesh;
  spark: THREE.Mesh;
  pistonMesh: THREE.Mesh;
}
function makeEngine(opts: { valves?: boolean } = {}): Engine {
  const r = 0.5;
  const L = 1.4;
  const root = new THREE.Group();
  const crankMat = std(0x5a6b8a, 0.35, 0.7);
  const steel = std(0xc9d2de, 0.25, 0.85);
  // 크랭크 원판 + 축
  const disk = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.16, 40), crankMat);
  disk.rotation.x = Math.PI / 2;
  const crank = new THREE.Group();
  crank.add(disk);
  const weight = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.17, 24, 1, false, Math.PI * 0.6, Math.PI * 0.8), std(0x3e4b66, 0.4, 0.6));
  weight.rotation.x = Math.PI / 2;
  crank.add(weight);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.42, 16), std(0xffc54a, 0.3, 0.8));
  pin.rotation.x = Math.PI / 2;
  pin.position.set(0, r, 0.12);
  crank.add(pin);
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 16), steel);
  axle.rotation.x = Math.PI / 2;
  root.add(crank, axle);
  // 막대
  const rod = new THREE.Mesh(new RoundedBoxGeometry(0.16, L, 0.1, 2, 0.04), std(0xff8a3d, 0.4, 0.3));
  rod.position.z = 0.24;
  root.add(rod);
  // 피스톤
  const pistonMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.5, 32), steel);
  for (let k = 0; k < 2; k++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.425, 0.012, 6, 40), std(0x3a3f4a, 0.4, 0.6));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.12 + k * 0.08;
    pistonMesh.add(ring);
  }
  root.add(pistonMesh);
  // 실린더 (유리)
  const head = L + r + 0.25 + 0.42;
  const cylH = head - (L - r - 0.25) + 0.05;
  const cyl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.47, 0.47, cylH, 40, 1, true),
    new THREE.MeshPhysicalMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.22, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false }),
  );
  cyl.position.y = head - cylH / 2;
  cyl.renderOrder = 2;
  root.add(cyl);
  const capMat = std(0x8a96ad, 0.45, 0.5);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.16, 40), capMat);
  cap.position.y = head + 0.08;
  root.add(cap);
  // 가스
  const gas = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 1, 32), new THREE.MeshBasicMaterial({ color: 0x6fc3ff, transparent: true, opacity: 0.35, depthWrite: false }));
  gas.renderOrder = 1;
  root.add(gas);
  const valveGeo = new THREE.CylinderGeometry(0.03, 0.14, 0.36, 16);
  const intake = new THREE.Mesh(valveGeo, std(0x3d8bff, 0.4, 0.5));
  const exhaust = new THREE.Mesh(valveGeo, std(0xff5a5a, 0.4, 0.5));
  intake.position.set(-0.2, head - 0.02, 0);
  exhaust.position.set(0.2, head - 0.02, 0);
  intake.rotation.z = Math.PI;
  exhaust.rotation.z = Math.PI;
  const spark = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0 }));
  spark.position.set(0, head - 0.06, 0);
  if (opts.valves !== false) root.add(intake, exhaust, spark);
  const plug = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 10), std(0xeeeeee, 0.4));
  plug.position.set(0, head + 0.25, 0);
  if (opts.valves !== false) root.add(plug);
  let top = 0;
  const set = (theta: number): number => {
    crank.rotation.z = -theta;
    const px = r * Math.sin(theta);
    const py = r * Math.cos(theta);
    const yp = r * Math.cos(theta) + Math.sqrt(L * L - r * r * Math.sin(theta) ** 2);
    const dx = -px;
    const dy = yp - py;
    rod.position.set(px + dx / 2, py + dy / 2, 0.24);
    rod.rotation.z = Math.atan2(-dx, dy);
    pistonMesh.position.y = yp + 0.25;
    top = yp + 0.5;
    const gh = Math.max(0.02, head - top);
    gas.scale.y = gh;
    gas.position.y = top + gh / 2;
    return yp;
  };
  set(0);
  return { root, set, r, L, pistonTop: () => top, head, gas, intake, exhaust, spark, pistonMesh };
}

/* ───── 톱니바퀴 모양 ───── */
function gearGeo(n: number, m: number, depth: number, hole = 0.12): THREE.ExtrudeGeometry {
  const rp = (m * n) / 2;
  const ra = rp + m;
  const rf = rp - 1.2 * m;
  const s = new THREE.Shape();
  const step = TAU / n;
  let first = true;
  for (let i = 0; i < n; i++) {
    const a = i * step;
    const pts: [number, number][] = [
      [rf, a - step * 0.5],
      [rf, a - step * 0.28],
      [ra, a - step * 0.13],
      [ra, a + step * 0.13],
      [rf, a + step * 0.28],
    ];
    for (const [rr, aa] of pts) {
      const x = rr * Math.cos(aa);
      const y = rr * Math.sin(aa);
      if (first) s.moveTo(x, y);
      else s.lineTo(x, y);
      first = false;
    }
  }
  s.closePath();
  const hp = new THREE.Path();
  hp.absarc(0, 0, hole, 0, TAU, true);
  s.holes.push(hp);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/* ───── 거리장(SDF) 손 + Surface Nets ───── */
type V3 = [number, number, number];
function sdCapsule(p: V3, a: V3, b: V3, r: number): number {
  const pa = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const h = clamp((pa[0]! * ba[0]! + pa[1]! * ba[1]! + pa[2]! * ba[2]!) / (ba[0]! ** 2 + ba[1]! ** 2 + ba[2]! ** 2), 0, 1);
  return Math.hypot(pa[0]! - ba[0]! * h, pa[1]! - ba[1]! * h, pa[2]! - ba[2]! * h) - r;
}
function sdRoundBox(p: V3, b: V3, r: number): number {
  const q = [Math.abs(p[0]) - b[0] + r, Math.abs(p[1]) - b[1] + r, Math.abs(p[2]) - b[2] + r];
  return Math.hypot(Math.max(q[0]!, 0), Math.max(q[1]!, 0), Math.max(q[2]!, 0)) + Math.min(Math.max(q[0]!, q[1]!, q[2]!), 0) - r;
}
const smin = (a: number, b: number, k: number): number => {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return lerp(b, a, h) - k * h * (1 - h);
};
const FINGERS: [V3, V3, number][] = [
  [[-0.33, 0.42, 0], [-0.4, 1.1, 0.06], 0.11],
  [[-0.11, 0.45, 0], [-0.12, 1.32, 0.08], 0.12],
  [[0.11, 0.45, 0], [0.13, 1.27, 0.08], 0.12],
  [[0.33, 0.42, 0], [0.42, 1.02, 0.06], 0.105],
  [[0.42, -0.1, 0.05], [0.88, 0.38, 0.18], 0.125],
];
const BONE_COL = [0xff6b8b, 0xffb340, 0x5ad17a, 0x4aa8ff, 0xb07cff, 0xffe0c8].map((c) => new THREE.Color(c));
function handParts(p: V3): number[] {
  const out = [sdRoundBox([p[0], p[1] + 0.05, p[2]], [0.46, 0.5, 0.15], 0.13)];
  for (const [a, b, r] of FINGERS) out.push(sdCapsule(p, a, b, r));
  return out;
}
function handSdf(p: V3): number {
  const d = handParts(p);
  let v = d[0]!;
  for (let i = 1; i < d.length; i++) v = smin(v, d[i]!, 0.09);
  return v;
}
/** 거리장 → 매끈한 껍질 (Surface Nets: 칸마다 꼭짓점 하나, 부호가 바뀌는 모서리마다 네모 하나) */
function surfaceNets(f: (p: V3) => number, lo: V3, hi: V3, N: number): { geo: THREE.BufferGeometry; inside: number[] } {
  const span = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  const hs = span / N;
  const nx = Math.ceil((hi[0] - lo[0]) / hs) + 1;
  const ny = Math.ceil((hi[1] - lo[1]) / hs) + 1;
  const nz = Math.ceil((hi[2] - lo[2]) / hs) + 1;
  const val = new Float32Array(nx * ny * nz);
  const id = (i: number, j: number, k: number): number => i + nx * (j + ny * k);
  const inside: number[] = [];
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const p: V3 = [lo[0] + i * hs, lo[1] + j * hs, lo[2] + k * hs];
        const v = f(p);
        val[id(i, j, k)] = v;
        if (v < 0) inside.push(p[0], p[1], p[2]);
      }
  const cellV = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cid = (i: number, j: number, k: number): number => i + (nx - 1) * (j + (ny - 1) * k);
  const pos: number[] = [];
  const corners: V3[] = [];
  for (let c = 0; c < 8; c++) corners.push([c & 1, (c >> 1) & 1, (c >> 2) & 1]);
  const edges: [number, number][] = [
    [0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const cv: number[] = [];
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const o = corners[c]!;
          const v = val[id(i + o[0], j + o[1], k + o[2])]!;
          cv.push(v);
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        for (const [a, b] of edges) {
          const va = cv[a]!;
          const vb = cv[b]!;
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          const A = corners[a]!;
          const B = corners[b]!;
          sx += A[0] + (B[0] - A[0]) * t;
          sy += A[1] + (B[1] - A[1]) * t;
          sz += A[2] + (B[2] - A[2]) * t;
          n++;
        }
        cellV[cid(i, j, k)] = pos.length / 3;
        pos.push(lo[0] + (i + sx / n) * hs, lo[1] + (j + sy / n) * hs, lo[2] + (k + sz / n) * hs);
      }
  const idx: number[] = [];
  const grad = (p: V3): V3 => {
    const e = 0.01;
    const g: V3 = [f([p[0] + e, p[1], p[2]]) - f([p[0] - e, p[1], p[2]]), f([p[0], p[1] + e, p[2]]) - f([p[0], p[1] - e, p[2]]), f([p[0], p[1], p[2] + e]) - f([p[0], p[1], p[2] - e])];
    const l = Math.hypot(...g) || 1;
    return [g[0] / l, g[1] / l, g[2] / l];
  };
  const quad = (a: number, b: number, c: number, d: number): void => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    const P = (q: number): V3 => [pos[q * 3]!, pos[q * 3 + 1]!, pos[q * 3 + 2]!];
    const pa = P(a);
    const pb = P(b);
    const pc = P(c);
    const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
    const v = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    const nrm = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    const gg = grad([(pa[0] + pc[0]) / 2, (pa[1] + pc[1]) / 2, (pa[2] + pc[2]) / 2]);
    if (nrm[0]! * gg[0] + nrm[1]! * gg[1] + nrm[2]! * gg[2] >= 0) idx.push(a, b, c, a, c, d);
    else idx.push(a, c, b, a, d, c);
  };
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const v0 = val[id(i, j, k)]! < 0;
        if (j > 0 && k > 0 && v0 !== val[id(i + 1, j, k)]! < 0) quad(cellV[cid(i, j - 1, k - 1)]!, cellV[cid(i, j, k - 1)]!, cellV[cid(i, j, k)]!, cellV[cid(i, j - 1, k)]!);
        if (i > 0 && k > 0 && v0 !== val[id(i, j + 1, k)]! < 0) quad(cellV[cid(i - 1, j, k - 1)]!, cellV[cid(i, j, k - 1)]!, cellV[cid(i, j, k)]!, cellV[cid(i - 1, j, k)]!);
        if (i > 0 && j > 0 && v0 !== val[id(i, j, k + 1)]! < 0) quad(cellV[cid(i - 1, j - 1, k)]!, cellV[cid(i, j - 1, k)]!, cellV[cid(i, j, k)]!, cellV[cid(i - 1, j, k)]!);
      }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const nor: number[] = [];
  const col: number[] = [];
  const tmp = new THREE.Color();
  for (let q = 0; q < pos.length; q += 3) {
    const p: V3 = [pos[q]!, pos[q + 1]!, pos[q + 2]!];
    nor.push(...grad(p));
    // 뼈 무게 — 가까운 부위일수록 크게 (부드럽게 섞음)
    const d = handParts(p);
    let sum = 0;
    tmp.setRGB(0, 0, 0);
    d.forEach((dd, b) => {
      const w = Math.exp(-Math.max(0, dd) * 28);
      sum += w;
      tmp.r += BONE_COL[b === 0 ? 5 : b - 1]!.r * w;
      tmp.g += BONE_COL[b === 0 ? 5 : b - 1]!.g * w;
      tmp.b += BONE_COL[b === 0 ? 5 : b - 1]!.b * w;
    });
    col.push(tmp.r / sum, tmp.g / sum, tmp.b / sum);
  }
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return { geo, inside };
}

/* ───── 얼굴 모프 (i20) — 닫힌 고리 모양들을 같은 꼭짓점 수로 ───── */
function loopGeo(shapes: ((u: number) => [number, number])[], n: number, depth: number): THREE.BufferGeometry {
  // 0 번 모양이 기본, 나머지는 모프 대상. 부채꼴(가운데 + 둘레) 앞뒤 두 장 + 옆면
  const build = (fn: (u: number) => [number, number]): number[] => {
    const ring: [number, number][] = [];
    for (let i = 0; i < n; i++) ring.push(fn(i / n));
    let cx = 0;
    let cy = 0;
    for (const [x, y] of ring) {
      cx += x / n;
      cy += y / n;
    }
    const p: number[] = [cx, cy, depth / 2, cx, cy, -depth / 2];
    for (const [x, y] of ring) p.push(x, y, depth / 2, x, y, -depth / 2);
    return p;
  };
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(build(shapes[0]!), 3));
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = 2 + i * 2;
    const b = 2 + ((i + 1) % n) * 2;
    idx.push(0, a, b, 1, b + 1, a + 1, a, a + 1, b + 1, a, b + 1, b);
  }
  geo.setIndex(idx);
  geo.morphAttributes['position'] = shapes.slice(1).map((s) => new THREE.Float32BufferAttribute(build(s), 3));
  geo.computeVertexNormals();
  return geo;
}


/* ───── i35 단면: 월드 좌표 평면으로 셰이더에서 직접 자르기 (uClip = n, c — n·p > c 쪽을 버림) ───── */
function planeClip<M extends THREE.Material>(m: M, u: { value: THREE.Vector4 }): M {
  m.onBeforeCompile = (sh) => {
    sh.uniforms['uClip'] = u;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vClipW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvClipW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vClipW;\nuniform vec4 uClip;')
      .replace('void main() {', 'void main() {\n\tif (dot(vClipW, uClip.xyz) > uClip.w) discard;');
  };
  m.customProgramCacheKey = () => 'planeclip';
  return m;
}

/* ───── i17 입체 글씨: 캔버스 글자 → 마칭 스퀘어 윤곽 → RDP → Shape(구멍 포함) → 돌출 + 모서리 깎기 ───── */
interface GlyphOutline {
  /** 글꼴 크기 1 = 1 단위. y 위쪽이 +, 기준선 y = 0, 글자 가운데 x = 0 */
  loops: { pts: THREE.Vector2[]; hole: boolean }[];
  shapes: THREE.Shape[];
  adv: number;
  minY: number;
}
const GLYPH_PX = 160;
const glyphCache = new Map<string, GlyphOutline>();
let bhsReady = false;
/** 마칭 스퀘어 — 값 v(0~1) 가 T 를 넘는 칸의 경계를 닫힌 고리들로 (모든 고리가 같은 돌림 방향: 안쪽이 한쪽에) */
function marchLoops(v: Float32Array, W: number, H: number, T = 0.5): [number, number][][] {
  const N = 2 * W * H;
  const next = new Int32Array(N).fill(-1);
  const px = new Float32Array(N);
  const py = new Float32Array(N);
  const done = new Uint8Array(N);
  // 칸 변 번호: 가로 변 (x,y)→(x+1,y) = 2(yW+x) · 세로 변 (x,y)→(x,y+1) = 2(yW+x)+1, 점은 값으로 보간
  const pt = (id: number): void => {
    if (done[id]) return;
    done[id] = 1;
    const i = id >> 1;
    const x = i % W;
    const y = (i / W) | 0;
    const v0 = v[i]!;
    const v1 = id & 1 ? v[i + W]! : v[i + 1]!;
    const t = clamp((T - v0) / (v1 - v0 || 1e-6), 0, 1);
    px[id] = id & 1 ? x : x + t;
    py[id] = id & 1 ? y + t : y;
  };
  // 선분 e1–e2 를 「모서리 (kx,ky) 가 안쪽이면 왼쪽에」 오도록 방향을 정해 잇는다
  const seg = (e1: number, e2: number, kx: number, ky: number, kin: boolean): void => {
    pt(e1);
    pt(e2);
    const cr = (px[e2]! - px[e1]!) * (ky - py[e1]!) - (py[e2]! - py[e1]!) * (kx - px[e1]!);
    if (cr > 0 === kin) next[e1] = e2;
    else next[e2] = e1;
  };
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const i = y * W + x;
      const ia = v[i]! >= T;
      const ib = v[i + 1]! >= T;
      const ic = v[i + W + 1]! >= T;
      const id = v[i + W]! >= T;
      const cnt = +ia + +ib + +ic + +id;
      if (cnt === 0 || cnt === 4) continue;
      const eT = 2 * i;
      const eB = 2 * (i + W);
      const eL = 2 * i + 1;
      const eR = 2 * (i + 1) + 1;
      // 모서리 하나를 잘라 내는 선분 (A 왼위 · B 오위 · C 오아래 · D 왼아래)
      const cut = (k: 0 | 1 | 2 | 3, kin: boolean): void => {
        if (k === 0) seg(eT, eL, x, y, kin);
        else if (k === 1) seg(eT, eR, x + 1, y, kin);
        else if (k === 2) seg(eR, eB, x + 1, y + 1, kin);
        else seg(eB, eL, x, y + 1, kin);
      };
      const ins = [ia, ib, ic, id];
      if (cnt === 1) cut(ins.indexOf(true) as 0 | 1 | 2 | 3, true);
      else if (cnt === 3) cut(ins.indexOf(false) as 0 | 1 | 2 | 3, false);
      else if (ia === ic) {
        // 안장점 — 가운데 값으로 정함
        const cIn = (v[i]! + v[i + 1]! + v[i + W + 1]! + v[i + W]!) / 4 >= T;
        for (let k = 0; k < 4; k++) if (ins[k] !== cIn) cut(k as 0 | 1 | 2 | 3, ins[k]!);
      } else if (ia === ib) seg(eL, eR, x, y, ia);
      else seg(eT, eB, x, y, ia);
    }
  }
  const loops: [number, number][][] = [];
  const seen = new Uint8Array(N);
  for (let s = 0; s < N; s++) {
    if (next[s]! < 0 || seen[s]) continue;
    const loop: [number, number][] = [];
    let e = s;
    while (e >= 0 && !seen[e]) {
      seen[e] = 1;
      loop.push([px[e]!, py[e]!]);
      e = next[e]!;
    }
    if (loop.length >= 4) loops.push(loop);
  }
  return loops;
}
/** 닫힌 고리 단순화 (Ramer–Douglas–Peucker) */
function rdpClosed(p: [number, number][], eps: number): [number, number][] {
  const n = p.length;
  if (n < 8) return p;
  let far = 0;
  let fd = -1;
  for (let i = 1; i < n; i++) {
    const d = (p[i]![0] - p[0]![0]) ** 2 + (p[i]![1] - p[0]![1]) ** 2;
    if (d > fd) ((fd = d), (far = i));
  }
  const keep = new Uint8Array(n);
  keep[0] = keep[far] = 1;
  const stack: [number, number][] = [
    [0, far],
    [far, n],
  ];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const A = p[a]!;
    const B = p[b % n]!;
    const dx = B[0] - A[0];
    const dy = B[1] - A[1];
    const L = Math.hypot(dx, dy) || 1e-9;
    let md = -1;
    let mi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((p[i]![0] - A[0]) * dy - (p[i]![1] - A[1]) * dx) / L;
      if (d > md) ((md = d), (mi = i));
    }
    if (md > eps) {
      keep[mi] = 1;
      stack.push([a, mi], [mi, b]);
    }
  }
  return p.filter((_, i) => keep[i]);
}
const loopArea = (p: THREE.Vector2[]): number => {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j]!.x - p[i]!.x) * (p[j]!.y + p[i]!.y);
  return a / 2;
};
const inLoop = (q: THREE.Vector2, p: THREE.Vector2[]): boolean => {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i]!;
    const b = p[j]!;
    if (a.y > q.y !== b.y > q.y && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
};
/** 글자 하나 윤곽 (캐시) */
function traceGlyph(ch: string, font: string): GlyphOutline {
  const key = font + '|' + ch;
  const hit = glyphCache.get(key);
  if (hit) return hit;
  const S = GLYPH_PX;
  const cv = document.createElement('canvas');
  const cg = cv.getContext('2d', { willReadFrequently: true })!;
  cg.font = font.replace('{px}', S + 'px');
  const adv = cg.measureText(ch).width;
  const pad = 6;
  const W = Math.ceil(adv + S * 0.3) + pad * 2;
  const H = Math.ceil(S * 1.45) + pad * 2;
  const base = pad + S * 1.08;
  const cx = W / 2;
  cv.width = W;
  cv.height = H;
  cg.font = font.replace('{px}', S + 'px');
  cg.textAlign = 'center';
  cg.textBaseline = 'alphabetic';
  cg.fillStyle = '#000';
  cg.fillText(ch, cx, base);
  const img = cg.getImageData(0, 0, W, H).data;
  const v = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) v[i] = img[i * 4 + 3]! / 255;
  const raw = marchLoops(v, W, H);
  const loops: { pts: THREE.Vector2[]; area: number }[] = [];
  for (const L of raw) {
    // 보간된 마칭 스퀘어 점은 이미 매끈하다 — 바로 단순화(0.4 px)하고, 1 px 안으로 붙은 점은 하나로 (짧은 변은 모서리 깎기에서 뾰족 가시가 된다)
    const sim: [number, number][] = [];
    for (const q of rdpClosed(L, 0.4)) {
      const last = sim[sim.length - 1];
      if (!last || Math.hypot(q[0] - last[0], q[1] - last[1]) > 1) sim.push(q);
    }
    if (sim.length > 3 && Math.hypot(sim[0]![0] - sim[sim.length - 1]![0], sim[0]![1] - sim[sim.length - 1]![1]) <= 1) sim.pop();
    if (sim.length < 3) continue;
    const pts = sim.map(([x, y]) => new THREE.Vector2((x - cx) / S, (base - y) / S));
    const area = loopArea(pts);
    if (Math.abs(area) < 2e-4) continue;
    loops.push({ pts, area });
  }
  let big = 0;
  for (const l of loops) if (Math.abs(l.area) > Math.abs(big)) big = l.area;
  const outers = loops.filter((l) => Math.sign(l.area) === Math.sign(big));
  const holes = loops.filter((l) => Math.sign(l.area) !== Math.sign(big));
  const shapes = outers.map((o) => ({ o, s: new THREE.Shape(o.pts) }));
  for (const hl of holes) {
    let best: (typeof shapes)[number] | null = null;
    for (const c of shapes) if (inLoop(hl.pts[0]!, c.o.pts) && (!best || Math.abs(c.o.area) < Math.abs(best.o.area))) best = c;
    best?.s.holes.push(new THREE.Path(hl.pts));
  }
  let minY = 0;
  for (const l of loops) for (const q of l.pts) minY = Math.min(minY, q.y);
  const out: GlyphOutline = {
    loops: [...outers.map((l) => ({ pts: l.pts, hole: false })), ...holes.map((l) => ({ pts: l.pts, hole: true }))],
    shapes: shapes.map((s) => s.s),
    adv: adv / S,
    minY,
  };
  glyphCache.set(key, out);
  return out;
}
/** 금속 매트캡 — 왼쪽 위 빛을 받은 구. bands 면 크롬처럼 하늘 · 지평선 · 바닥 띠가 비친다 */
function matcapTex(c: [string, string, string, string], bands: boolean): THREE.CanvasTexture {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2, 0, TAU);
  g.clip();
  if (bands) {
    const lg = g.createLinearGradient(0, 0, 0, S);
    // 가운데(정면을 보는 면)는 밝게, 지평선 어두운 띠는 조금 아래 — 앞면이 기울 때마다 띠가 지나간다
    lg.addColorStop(0, c[3]);
    lg.addColorStop(0.3, c[2]);
    lg.addColorStop(0.5, c[3]);
    lg.addColorStop(0.64, c[2]);
    lg.addColorStop(0.74, c[0]);
    lg.addColorStop(0.82, c[1]);
    lg.addColorStop(1, c[2]);
    g.fillStyle = lg;
    g.fillRect(0, 0, S, S);
  } else {
    const rg = g.createRadialGradient(S * 0.38, S * 0.32, S * 0.02, S * 0.5, S * 0.5, S * 0.62);
    rg.addColorStop(0, c[3]);
    rg.addColorStop(0.25, c[2]);
    rg.addColorStop(0.65, c[1]);
    rg.addColorStop(1, c[0]);
    g.fillStyle = rg;
    g.fillRect(0, 0, S, S);
    // 아래쪽 반사광 띠 — 금속이 바닥 빛을 받아 테두리가 살아남
    const bg = g.createLinearGradient(0, S * 0.7, 0, S);
    bg.addColorStop(0, 'rgba(255,255,255,0)');
    bg.addColorStop(0.7, 'rgba(255,230,180,0.35)');
    bg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = bg;
    g.fillRect(0, 0, S, S);
  }
  // 작은 창 반사 두 개
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath();
  g.ellipse(S * 0.33, S * 0.27, S * 0.07, S * 0.045, -0.5, 0, TAU);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.4)';
  g.beginPath();
  g.ellipse(S * 0.7, S * 0.36, S * 0.035, S * 0.025, 0.4, 0, TAU);
  g.fill();
  // 테두리로 갈수록 어둡게
  const rim = g.createRadialGradient(S / 2, S / 2, S * 0.36, S / 2, S / 2, S / 2);
  rim.addColorStop(0, 'rgba(0,0,0,0)');
  rim.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = rim;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** 윤곽 → 돌출 + 모서리 깎기. 깎기는 바깥으로(bevelOffset 0) — 안쪽으로 줄이면 가는 획 · 오목한 모서리에서 앞면 윤곽이 꼬여 삼각형이 튀어나온다 */
function glyphGeo(o: GlyphOutline, depth: number, bevel: number): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(o.shapes, {
    depth,
    steps: 1,
    curveSegments: 1,
    bevelEnabled: bevel > 0.0005,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: 0,
    bevelSegments: 3,
  });
  // 옆면 · 깎은 면은 부드럽게, 앞면과 옆면 사이 같은 꺾임만 날카롭게 (작은 크기에선 같은 점 찾기 격자가 거칠어 100 배로 키워 계산)
  geo.scale(100, 100, 100);
  const sm = toCreasedNormals(geo, (40 * Math.PI) / 180);
  sm.scale(0.01, 0.01, 0.01);
  // 앞뒷면(묶음 0)은 정확히 평평하게 — 가장자리 점만 깎은 면과 섞이면 긴 삼각형을 따라 줄무늬가 진다
  const nrm = sm.attributes['normal'] as THREE.BufferAttribute;
  const pos = sm.attributes['position'] as THREE.BufferAttribute;
  for (const gr of sm.groups) {
    if (gr.materialIndex !== 0) continue;
    for (let i = gr.start; i < gr.start + gr.count; i++) nrm.setXYZ(i, 0, 0, pos.getZ(i) > depth / 2 ? 1 : -1);
  }
  sm.translate(0, 0, -depth / 2);
  return sm;
}

/* ───── i37 인벌류트 톱니 (demosMechGear.ts gearPts 와 같은 식을 옮겨 적음) ─────
 * 압력각 20°, 모듈 m · 잇수 z → 피치원 r = mz/2 · 기초원 r·cos20° · 이끝원 r + m · 이뿌리원 r − 1.25m.
 * 기초원 위 점은 인벌류트 inv(α) = tanα − α 만큼 돌아간 각에 놓인다. 이 0 번 가운데가 각 0, 양쪽 면은 거울 대칭 */
const PA20 = (20 * Math.PI) / 180;
const invo = (a: number): number => Math.tan(a) - a;
const polar2 = (r: number, a: number): THREE.Vector2 => new THREE.Vector2(r * Math.cos(a), r * Math.sin(a));
function involutePts(z: number, m: number, ra: number, rf: number, nFlank = 6): THREE.Vector2[] {
  const rp = (m * z) / 2;
  const rb = rp * Math.cos(PA20);
  const half = Math.PI / (2 * z) + invo(PA20);
  const th = (r: number): number => half - invo(Math.acos(Math.min(1, rb / Math.max(r, rb))));
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
    for (const r of rs) pts.push(polar2(r, c - th(r)));
    const ta = th(ra);
    for (let k = 1; k <= 2; k++) pts.push(polar2(ra, c - ta + (2 * ta * k) / 3));
    for (let j = rs.length - 1; j >= 0; j--) pts.push(polar2(rs[j]!, c + th(rs[j]!)));
    const a0 = c + th(rf);
    const a1 = c + pitch - th(rf);
    for (let k = 1; k <= 3; k++) pts.push(polar2(rf, a0 + ((a1 - a0) * k) / 4));
  }
  return pts;
}
/** 인벌류트 톱니바퀴 (XY 면, 두께는 Z 가운데 맞춤). 모서리 깎기는 안쪽으로 — 이 면이 정확히 인벌류트 위에 남게 */
function involuteGearGeo(z: number, m: number, depth: number, hole = 0.12): THREE.BufferGeometry {
  const rp = (m * z) / 2;
  const s = new THREE.Shape(involutePts(z, m, rp + m, rp - 1.25 * m));
  const hp = new THREE.Path();
  hp.absarc(0, 0, hole, 0, TAU, true);
  s.holes.push(hp);
  // 바퀴살 구멍 넷 (큰 바퀴만) — 도는 게 잘 보이게
  if (z >= 24) {
    const ri = hole * 2.4;
    const ro = rp - 1.25 * m - m * 2.2;
    for (let k = 0; k < 4; k++) {
      const a0 = (k * TAU) / 4 + 0.22;
      const a1 = ((k + 1) * TAU) / 4 - 0.22;
      const p = new THREE.Path();
      p.absarc(0, 0, ro, a0, a1, false);
      p.absarc(0, 0, ri, a1 - 0.1, a0 + 0.1, true);
      p.closePath();
      s.holes.push(p);
    }
  }
  const bev = m * 0.16;
  const d = depth - 2 * bev;
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelOffset: -bev, bevelSegments: 2, curveSegments: 24 });
  g.translate(0, 0, -d / 2);
  return g;
}
/** 캠 반지름 r(φ): 0 ~ 110° 오름 · 150° 까지 머묾 · 260° 까지 내림 (모두 코사인 꼴로 매끈하게) */
function camRadius(phi: number, r0: number, lift: number): number {
  const d = (((phi * 180) / Math.PI) % 360 + 360) % 360;
  const h = (k: number): number => (1 - Math.cos(Math.PI * k)) / 2;
  if (d < 110) return r0 + lift * h(d / 110);
  if (d < 150) return r0 + lift;
  if (d < 260) return r0 + lift * (1 - h((d - 150) / 110));
  return r0;
}

export const DEMOS: DemoMap = {
  /* ═════════════ 모양 ═════════════ */
  u28: {
    kind: '3d',
    caption: '둥근 상자(모서리가 둥글어짐) · 돌림(옆모습을 빙 돌림) · 밀어내기(별을 두껍게) · 관(곡선을 따라) — 모양이 자라나요',
    make() {
      const scene = baseScene('#ffe3c2', '#fff8ee');
      const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 80);
      const X = [-3.45, -1.15, 1.15, 3.45];
      const holders = X.map((x) => {
        const g = new THREE.Group();
        g.position.x = x;
        scene.add(g);
        return g;
      });
      // 1) 둥근 상자 — 반지름 단계별로 미리 만들기
      const boxMat = std(0xff7a59, 0.45);
      const boxGeos = Array.from({ length: 8 }, (_, i) => new RoundedBoxGeometry(1.3, 1.3, 1.3, 5, 0.01 + i * 0.07));
      const box = new THREE.Mesh(boxGeos[0], boxMat);
      holders[0]!.add(box);
      // 2) 돌림 — 폰 옆모습
      const prof = [
        [0, -0.9], [0.62, -0.9], [0.62, -0.78], [0.45, -0.7], [0.4, -0.55], [0.22, -0.2], [0.17, 0.2], [0.34, 0.3], [0.2, 0.4], [0.33, 0.62], [0.3, 0.82], [0.15, 0.93], [0, 0.95],
      ].map(([x, y]) => new THREE.Vector2(x, y));
      const latheMat = std(0x4aa8ff, 0.35, 0.1, { side: THREE.DoubleSide });
      const latheGeos = Array.from({ length: 25 }, (_, i) => new THREE.LatheGeometry(prof, 48, 0, Math.max(0.01, (i / 24) * TAU)));
      const lathe = new THREE.Mesh(latheGeos[0], latheMat);
      const profLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(prof.map((p) => new THREE.Vector3(p.x, p.y, 0))), new THREE.LineBasicMaterial({ color: 0xff3366 }));
      holders[1]!.add(lathe, profLine);
      // 3) 밀어내기 — 별
      const star = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const a = Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? 0.34 : 0.8;
        if (i === 0) star.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else star.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      const extMat = std(0xffc93c, 0.35, 0.2);
      const extGeos = Array.from({ length: 12 }, (_, i) => {
        const g = new THREE.ExtrudeGeometry(star, { depth: 0.02 + i * 0.05, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 3 });
        g.center();
        return g;
      });
      const ext = new THREE.Mesh(extGeos[0], extMat);
      holders[2]!.add(ext);
      // 4) 관 — 꼬인 밧줄
      const curve = new THREE.CatmullRomCurve3(Array.from({ length: 12 }, (_, i) => new THREE.Vector3(Math.cos(i * 1.1) * 0.55, -0.95 + i * 0.17, Math.sin(i * 1.1) * 0.55)));
      const tubeGeo = new THREE.TubeGeometry(curve, 160, 0.13, 12);
      const tube = new THREE.Mesh(tubeGeo, std(0x5ad17a, 0.55));
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), std(0x5ad17a, 0.55));
      holders[3]!.add(tube, head);
      const hud = new Hud();
      const names = ['둥근 상자', '돌림 (Lathe)', '밀어내기', '관 (Tube)'];
      let key = '';
      return {
        scene,
        camera: cam,
        update(t) {
          const k = pingpong(t, 5);
          box.geometry = boxGeos[Math.round(k * 7)]!;
          lathe.geometry = latheGeos[Math.round(k * 24)]!;
          ext.geometry = extGeos[Math.round(k * 11)]!;
          const segs = Math.max(1, Math.round(k * 160));
          tubeGeo.setDrawRange(0, segs * 12 * 6);
          head.position.copy(curve.getPointAt(segs / 160));
          holders.forEach((h, i) => (h.rotation.y = t * 0.5 + i * 0.6));
          holders[1]!.rotation.y = 0.5 + Math.sin(t * 0.4) * 0.5;
          box.rotation.x = 0.4;
          key = `${Math.round(k * 10)}`;
        },
        resize(w, h) {
          const tn = Math.tan((cam.fov * Math.PI) / 360);
          const d = Math.max(1.6 / tn, 4.7 / (tn * (w / h)));
          cam.position.set(0, d * 0.18, d);
          cam.lookAt(0, -0.15, 0);
        },
        render(r, w, h) {
          r.render(scene, cam);
          hud.draw(r, w, h, `${w}x${h}${key}`, (g) => {
            const s = fsz(w, h, 0.85);
            X.forEach((x, i) => {
              const p = new THREE.Vector3(x, -1.25, 0).project(cam);
              pill(g, ((p.x + 1) / 2) * w, ((1 - p.y) / 2) * h, names[i]!, s, 'rgba(60,40,30,0.72)', '#fff', 'center');
            });
          });
        },
        dispose() {
          [...boxGeos, ...latheGeos, ...extGeos].forEach((g) => g.dispose());
          disposeScene(scene);
          hud.dispose();
        },
      };
    },
  },

  u29: {
    kind: '3d',
    caption: '왼쪽 조각 74개 = 74번 그림 (빛이 한 장씩 지나감) · 오른쪽 하나로 합침 = 1번에 그림',
    make() {
      const A = baseScene('#cde9ff', '#f5fbff');
      const B = baseScene('#ffe1cf', '#fff7f0');
      const cells: [number, number][] = [];
      for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) if (Math.abs(q + r) <= 3) cells.push([q, r]);
      const cols = [0xffd166, 0x7bdff2, 0xf7a6c1, 0xb5e48c, 0xcdb4db];
      const tileGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.22, 6);
      const pebGeo = new THREE.SphereGeometry(0.16, 14, 10);
      const pos = (q: number, r: number): THREE.Vector3 => new THREE.Vector3(Math.sqrt(3) * 0.52 * (q + r / 2), 0, 0.52 * 1.5 * r);
      const leftMeshes: THREE.Mesh[] = [];
      const boardA = new THREE.Group();
      const parts: THREE.BufferGeometry[] = [];
      cells.forEach(([q, r], i) => {
        const p = pos(q, r);
        const c = new THREE.Color(cols[(i * 7) % cols.length]!);
        const tm = new THREE.Mesh(tileGeo, std(c.getHex(), 0.6, 0, { emissive: 0xffffff, emissiveIntensity: 0 }));
        tm.position.copy(p);
        const pm = new THREE.Mesh(pebGeo, std(0x3d4a7a, 0.3, 0.2, { emissive: 0xffffff, emissiveIntensity: 0 }));
        pm.position.set(p.x, 0.22, p.z);
        boardA.add(tm, pm);
        leftMeshes.push(tm, pm);
        // 오른쪽용 — 색을 꼭짓점에 굽고 위치를 옮긴 복사본
        for (const [gsrc, col, y] of [
          [tileGeo, c, 0],
          [pebGeo, new THREE.Color(0x3d4a7a), 0.22],
        ] as [THREE.BufferGeometry, THREE.Color, number][]) {
          const gg = gsrc.clone();
          gg.translate(p.x, y, p.z);
          const n = gg.getAttribute('position').count;
          const ca = new Float32Array(n * 3);
          for (let k = 0; k < n; k++) ca.set([col.r, col.g, col.b], k * 3);
          gg.setAttribute('color', new THREE.BufferAttribute(ca, 3));
          parts.push(gg);
        }
      });
      const merged = mergeGeometries(parts)!;
      parts.forEach((g) => g.dispose());
      const mMat = std(0xffffff, 0.55, 0, { vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0 });
      const boardB = new THREE.Mesh(merged, mMat);
      A.add(boardA);
      B.add(boardB);
      const cam = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
      const hud = new Hud();
      let calls: [number, number] = [0, 0];
      return {
        scene: A,
        camera: cam,
        update(t) {
          const hi = Math.floor(t * 14) % leftMeshes.length;
          leftMeshes.forEach((m, i) => ((m.material as THREE.MeshStandardMaterial).emissiveIntensity = i === hi ? 0.75 : 0));
          leftMeshes.forEach((m, i) => (m.position.y = (i % 2 ? 0.22 : 0) + Math.sin(t * 2.4 + i * 0.37) * 0.05));
          mMat.emissiveIntensity = Math.max(0, Math.sin(t * 3)) ** 8 * 0.3;
          boardB.position.y = Math.sin(t * 2.4) * 0.05;
          boardA.rotation.y = boardB.rotation.y = t * 0.25;
        },
        render(r, w, h) {
          const tn = Math.tan((cam.fov * Math.PI) / 360);
          const d = Math.max(3.4 / tn, 3.6 / (tn * (w / 2 / h)));
          cam.position.set(0, d * 0.75, d * 0.66);
          cam.lookAt(0, -0.3, 0);
          splitRender(r, w, h, A, B, cam);
          calls = [0, 0];
          // 실제 그리기 횟수 재기 (화면 밖에서 한 번 더 세지 않고 info 를 그대로 읽음)
          r.setScissorTest(true);
          r.setScissor(0, 0, 1, 1);
          r.setViewport(0, 0, w / 2, h);
          r.render(A, cam);
          calls[0] = r.info.render.calls - 1; // 배경 한 장 빼기
          r.render(B, cam);
          calls[1] = r.info.render.calls - 1;
          r.setScissorTest(false);
          r.setViewport(0, 0, w, h);
          hud.draw(r, w, h, `${w}x${h}${calls.join()}`, (g) => {
            splitLabels(g, w, h, '따로따로', '하나로 합침');
            const s = fsz(w, h, 1.15);
            g.textAlign = 'center';
            g.font = `400 ${s}px ${TITLE}`;
            g.lineWidth = s * 0.25;
            g.strokeStyle = 'rgba(255,255,255,0.9)';
            for (const [x, txt, col] of [
              [w / 4, `그리기 ${calls[0]}번`, '#2a3a7a'],
              [(w * 3) / 4, `그리기 ${calls[1]}번`, '#d0451b'],
            ] as [number, string, string][]) {
              g.strokeText(txt, x, h - s * 0.9);
              g.fillStyle = col;
              g.fillText(txt, x, h - s * 0.9);
            }
          });
        },
        dispose() {
          disposeScene(A);
          disposeScene(B);
          hud.dispose();
        },
      };
    },
  },

  u30: {
    kind: '3d',
    caption: '거리장(점이 손 안쪽인지)을 격자로 찍고 → Surface Nets 로 매끈한 껍질 · 색은 뼈마다 무게 (격자가 촘촘해질수록 매끈)',
    make() {
      const scene = darkScene();
      const RES = [8, 12, 18, 26, 36];
      const lo: V3 = [-0.75, -0.72, -0.42];
      const hi: V3 = [1.15, 1.55, 0.45];
      const built = RES.map((N) => surfaceNets(handSdf, lo, hi, N));
      const root = new THREE.Group();
      scene.add(root);
      const weightMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, transparent: true, side: THREE.DoubleSide });
      const skinMat = new THREE.MeshStandardMaterial({ color: 0xffc9a8, roughness: 0.6, transparent: true, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(built[0]!.geo, weightMat);
      const ptsGeo = built.map((b) => new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(b.inside, 3)));
      const ptsMat = new THREE.PointsMaterial({ color: 0x8fe3ff, size: 0.05, transparent: true, depthWrite: false });
      const pts = new THREE.Points(ptsGeo[0], ptsMat);
      const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])), new THREE.LineBasicMaterial({ color: 0x8fa8ff, transparent: true, opacity: 0.5 }));
      frame.position.set((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2);
      root.add(mesh, pts, frame);
      root.position.set(-0.2, -0.4, 0);
      const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
      const hud = new Hud();
      let weights = true;
      let state = '';
      return {
        scene,
        camera: cam,
        update(t) {
          const P = 2.6;
          const i = Math.floor(t / P) % RES.length;
          const ph = (t % P) / P;
          mesh.geometry = built[i]!.geo;
          pts.geometry = ptsGeo[i]!;
          mesh.material = weights ? weightMat : skinMat;
          const show = smooth((ph - 0.3) / 0.25);
          (mesh.material as THREE.MeshStandardMaterial).opacity = show;
          mesh.visible = show > 0.01;
          ptsMat.opacity = 1 - show * 0.85;
          ptsMat.size = ((hi[1] - lo[1]) / RES[i]!) * 0.75;
          root.rotation.y = Math.sin(t * 0.6) * 0.6;
          state = `${i}|${ph < 0.3 ? 0 : ph < 0.55 ? 1 : 2}|${Math.floor(Math.min(1, ph / 0.55) * 10)}`;
        },
        resize(w, h) {
          const tn = Math.tan((cam.fov * Math.PI) / 360);
          const d = Math.max(1.45 / tn, 1.45 / (tn * (w / h)));
          cam.position.set(0, 0.3, d);
          cam.lookAt(0, 0.05, 0);
        },
        render(r, w, h) {
          r.render(scene, cam);
          hud.draw(r, w, h, `${w}x${h}${state}`, (g) => {
            const [si, sp, sb] = state.split('|').map(Number) as [number, number, number];
            const s = fsz(w, h, 0.9);
            const N = RES[si]!;
            pill(g, s * 0.6, s * 0.6, `격자 ${N}칸 · 꼭짓점 ${built[si]!.geo.getAttribute('position').count}개`, s);
            const bw = w * 0.34;
            const bx = w - bw - s * 0.8;
            const by = s * 0.75;
            g.fillStyle = 'rgba(255,255,255,0.18)';
            g.beginPath();
            g.roundRect(bx, by, bw, s * 1.3, s * 0.65);
            g.fill();
            g.fillStyle = sp === 2 ? '#7be38f' : '#ffc94a';
            g.beginPath();
            g.roundRect(bx, by, Math.max(s * 1.3, bw * (sb / 10)), s * 1.3, s * 0.65);
            g.fill();
            g.fillStyle = '#1a2040';
            g.font = `700 ${s * 0.8}px ${FONT}`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText(sp === 0 ? '일꾼: 거리 재는 중' : sp === 1 ? '일꾼: 껍질 굽는 중' : '완성!', bx + bw / 2, by + s * 0.68);
          });
        },
        controls: [{ type: 'toggle', label: '뼈 무게 색 보기', value: true, on: (v) => (weights = v) }],
        dispose() {
          built.forEach((b) => b.geo.dispose());
          ptsGeo.forEach((g) => g.dispose());
          mesh.geometry = new THREE.BufferGeometry();
          pts.geometry = new THREE.BufferGeometry();
          skinMat.dispose();
          weightMat.dispose();
          disposeScene(scene);
          hud.dispose();
        },
      };
    },
  },

  u31: {
    kind: '3d',
    caption: '면만 → 보이는 선 → 숨은 선은 점선 → 굵은 선(LineSegments2) — 교과서 입체 그림처럼',
    make() {
      const scene = baseScene('#e8f4ff', '#ffffff');
      const root = new THREE.Group();
      scene.add(root);
      const shapes: THREE.BufferGeometry[] = [new THREE.BoxGeometry(1.5, 1.1, 1.1), new THREE.ConeGeometry(0.85, 1.4, 4, 1), new THREE.CylinderGeometry(0.6, 0.6, 1.3, 3)];
      const xs = [-2.1, 0, 2.1];
      const faceMat = new THREE.MeshStandardMaterial({ color: 0xcfe6ff, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      const thin = new THREE.LineBasicMaterial({ color: 0x1d2a55 });
      const dash = new THREE.LineDashedMaterial({ color: 0x5a6aa0, dashSize: 0.07, gapSize: 0.06, depthFunc: THREE.GreaterDepth, transparent: true, opacity: 0.9 });
      const fat = new LineMaterial({ color: 0x1d2a55, linewidth: 3.5, worldUnits: false });
      const groups: { thinL: THREE.LineSegments; dashL: THREE.LineSegments; fatL: LineSegments2 }[] = [];
      shapes.forEach((geo, i) => {
        const g = new THREE.Group();
        g.position.x = xs[i]!;
        const m = new THREE.Mesh(geo, faceMat);
        const edges = new THREE.EdgesGeometry(geo);
        const thinL = new THREE.LineSegments(edges, thin);
        const dashL = new THREE.LineSegments(edges, dash);
        dashL.computeLineDistances();
        dashL.renderOrder = 2;
        const fg = new LineSegmentsGeometry().fromEdgesGeometry(edges);
        const fatL = new LineSegments2(fg, fat);
        fatL.renderOrder = 3;
        g.add(m, thinL, dashL, fatL);
        root.add(g);
        groups.push({ thinL, dashL, fatL });
      });
      const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
      const hud = new Hud();
      let step = 0;
      let auto = true;
      const names = ['면만', '보이는 선', '+ 숨은 선 (점선)', '+ 굵은 선'];
      return {
        scene,
        camera: cam,
        update(t) {
          if (auto) step = Math.floor(t / 2.2) % 4;
          root.children.forEach((g, i) => {
            g.rotation.y = t * 0.45 + i;
            g.rotation.x = 0.35;
          });
          for (const G of groups) {
            G.thinL.visible = step === 1 || step === 2;
            G.dashL.visible = step >= 2;
            G.fatL.visible = step === 3;
          }
        },
        resize(w, h) {
          const tn = Math.tan((cam.fov * Math.PI) / 360);
          const d = Math.max(1.3 / tn, 3.2 / (tn * (w / h)));
          cam.position.set(0, 0.6, d);
          cam.lookAt(0, -0.05, 0);
        },
        render(r, w, h) {
          fat.resolution.set(w, h);
          r.render(scene, cam);
          hud.draw(r, w, h, `${w}x${h}${step}`, (g) => {
            const s = fsz(w, h);
            if (w < 560) {
              pill(g, w / 2, h - s * 2.3, `${step + 1}/4 ${names[step]}`, s * 0.9, 'rgba(255,110,60,0.95)', '#fff', 'center');
              return;
            }
            names.forEach((n, i) => {
              const x = s * 0.6 + i * (w - s * 1.2) / 4;
              g.globalAlpha = i === step ? 1 : 0.35;
              pill(g, x, h - s * 2.3, n, s * 0.8, i === step ? 'rgba(255,110,60,0.95)' : 'rgba(30,40,80,0.6)');
            });
            g.globalAlpha = 1;
          });
        },
        controls: [
          { type: 'toggle', label: '저절로 단계 넘기기', value: true, on: (v) => (auto = v) },
          { type: 'range', label: '단계 (0 면 ~ 3 굵은 선)', min: 0, max: 3, step: 1, value: 3, on: (v) => ((auto = false), (step = v)) },
          { type: 'range', label: '굵은 선 굵기(px)', min: 1, max: 10, step: 0.5, value: 3.5, on: (v) => (fat.linewidth = v) },
        ],
        dispose() {
          disposeScene(scene);
          fat.dispose();
          hud.dispose();
        },
      };
    },
  },

  u32: {
    kind: '3d',
    caption: '왼쪽: 경첩 나무 따라 면이 차례로 펼쳐지는 전개도 · 오른쪽: 자르기 평면이 돌며 단면(삼각형 · 사각형 · 육각형)',
    make() {
      const A = baseScene('#d9f2e6', '#f6fffb');
      const B = baseScene('#ffe7d6', '#fffaf5');
      // 전개도 — 바닥이 뿌리, 앞 · 뒤 · 왼 · 오른쪽이 바닥에, 뚜껑이 뒤에 붙음
      const cols = [0xffd166, 0xef476f, 0x06d6a0, 0x118ab2, 0x9b5de5, 0xff9f1c];
      const faceGeo = new RoundedBoxGeometry(0.98, 0.06, 0.98, 2, 0.02);
      const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.98, 0.06, 0.98));
      const edgeMat = new THREE.LineBasicMaterial({ color: 0x24324f });
      const face = (c: number, ox: number, oz: number): THREE.Group => {
        const g = new THREE.Group();
        const m = new THREE.Mesh(faceGeo, std(c, 0.55));
        m.position.set(ox, 0, oz);
        const e = new THREE.LineSegments(edgeGeo, edgeMat);
        e.position.copy(m.position);
        g.add(m, e);
        return g;
      };
      const net = new THREE.Group();
      A.add(net);
      const bottom = face(cols[0]!, 0, 0);
      net.add(bottom);
      const hinge = (parent: THREE.Object3D, px: number, pz: number, c: number, ox: number, oz: number): THREE.Group => {
        const piv = new THREE.Group();
        piv.position.set(px, 0, pz);
        piv.add(face(c, ox, oz));
        parent.add(piv);
        return piv;
      };
      const front = hinge(bottom, 0, 0.5, cols[1]!, 0, 0.5);
      const back = hinge(bottom, 0, -0.5, cols[2]!, 0, -0.5);
      const right = hinge(bottom, 0.5, 0, cols[3]!, 0.5, 0);
      const left = hinge(bottom, -0.5, 0, cols[4]!, -0.5, 0);
      const top = hinge(back, 0, -1, cols[5]!, 0, -0.5);
      // 자르기 — 정육면체 + 평면 (속이 보이는 뒷면을 단면 색으로)
      const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
      const cube = new THREE.Group();
      const cubeGeo = new THREE.BoxGeometry(1.4, 1.4, 1.4);
      const front3 = new THREE.Mesh(cubeGeo, std(0x6cc5ff, 0.45, 0, { clippingPlanes: [plane] }));
      const cap = new THREE.Mesh(cubeGeo, new THREE.MeshBasicMaterial({ color: 0xff4f7b, side: THREE.BackSide, clippingPlanes: [plane] }));
      const ghost = new THREE.Mesh(cubeGeo, new THREE.MeshBasicMaterial({ color: 0x6cc5ff, transparent: true, opacity: 0.12, depthWrite: false }));
      const cedges = new THREE.LineSegments(new THREE.EdgesGeometry(cubeGeo), new THREE.LineBasicMaterial({ color: 0x23406a, transparent: true, opacity: 0.6 }));
      cube.add(front3, cap, ghost, cedges);
      B.add(cube);
      const planeVis = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ color: 0xff8fab, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
      B.add(planeVis);
      const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
      const hud = new Hud();
      let label = '';
      const N = new THREE.Vector3();
      return {
        scene: A,
        camera: cam,
        update(t) {
          const k = pingpong(t, 7);
          const f = (d: number): number => smooth(clamp(k * 1.6 - d, 0, 1));
          const fold = (x: number): number => (1 - x) * (Math.PI / 2);
          front.rotation.x = -fold(f(0));
          back.rotation.x = fold(f(0.15));
          right.rotation.z = fold(f(0.3));
          left.rotation.z = -fold(f(0.45));
          top.rotation.x = fold(f(0.6));
          net.rotation.y = t * 0.3;
          net.position.y = lerp(-0.5, -0.1, k);
          // 단면 — 기울기를 바꿔 가며 (꼭짓점 셋 · 넷 · 여섯을 지나게)
          const P = 9;
          const ph = (t % P) / P;
          if (ph < 1 / 3) {
            N.set(1, 1, 1).normalize();
            plane.constant = 0.75;
            label = '삼각형';
          } else if (ph < 2 / 3) {
            N.set(0.35, 1, 0).normalize();
            plane.constant = 0.05;
            label = '사각형';
          } else {
            N.set(1, 1, 1).normalize();
            plane.constant = 0;
            label = '육각형';
          }
          const wob = Math.sin(t * 1.3) * 0.12;
          plane.normal.copy(N).multiplyScalar(-1);
          plane.constant += wob;
          planeVis.position.copy(N).multiplyScalar(plane.constant);
          planeVis.lookAt(planeVis.position.clone().add(N));
          B.rotation.y = 0;
          cube.rotation.set(0, 0, 0);
        },
        render(r, w, h) {
          const tn = Math.tan((cam.fov * Math.PI) / 360);
          const d = Math.max(1.9 / tn, 1.9 / (tn * (w / 2 / h)));
          const a = 0.5 + Math.sin(performance.now() / 4000) * 0.4;
          cam.position.set(Math.sin(a) * d * 0.8, d * 0.55, Math.cos(a) * d * 0.8);
          cam.lookAt(0, 0, 0);
          const lc = r.localClippingEnabled;
          r.localClippingEnabled = true;
          splitRender(r, w, h, A, B, cam);
          r.localClippingEnabled = lc;
          hud.draw(r, w, h, `${w}x${h}${label}`, (g) => {
            splitLabels(g, w, h, '전개도 펼치기', `단면: ${label}`);
          });
        },
        dispose() {
          faceGeo.dispose();
          edgeGeo.dispose();
          disposeScene(A);
          disposeScene(B);
          hud.dispose();
        },
      };
    },
  },

  u33: {
    kind: '3d',
    caption: '가짜 동전 게임의 용 — dragon.glb 파일 하나에 모양 · 색 · 뼈 · 동작이 다 들어 있어요',
    make() {
      const scene = baseScene('#2a1f4a', '#6b4a7a');
      const glow = new THREE.PointLight(0xffb347, 6, 8);
      glow.position.set(0, 1.2, 1.5);
      scene.add(glow);
      const pile = coinPile();
      scene.add(pile);
      const cam = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
      const hud = new Hud();
      let mixer: THREE.AnimationMixer | null = null;
      let holder: THREE.Object3D | null = null;
      let info = '';
      let dead = false;
      let err = '';
      loadDragon()
        .then((gl) => {
          if (dead) return;
          holder = placeDragon(gl, 3.3);
          holder.position.y = 0.1;
          scene.add(holder);
          mixer = new THREE.AnimationMixer(holder.children[0]!);
          const clip = THREE.AnimationClip.findByName(gl.animations, 'CharacterArmature|Flying_Idle') ?? gl.animations[0];
          if (clip) mixer.clipAction(clip).play();
          let meshes = 0;
          let bones = 0;
          holder.traverse((o) => {
            if ((o as THREE.Mesh).isMesh) meshes++;
            if ((o as THREE.Bone).isBone) bones++;
          });
          info = `메시 ${meshes} · 뼈 ${bones} · 동작 ${gl.animations.length}`;
        })
        .catch((e) => (err = String(e)));
      return {
        scene,
        camera: cam,
        update(t, dt) {
          mixer?.update(dt);
          if (holder) holder.rotation.y = t * 0.4;
          pile.rotation.y = t * 0.4;
        },
        resize(w, h) {
          const tn = Math.tan((cam.fov * Math.PI) / 360);
          const d = Math.max(1.9 / tn, 2.2 / (tn * (w / h)));
          cam.position.set(0, d * 0.4, d);
          cam.lookAt(0, 1.05, 0);
        },
        render(r, w, h) {
          r.render(scene, cam);
          hud.draw(r, w, h, `${w}x${h}${info}${err}${!!holder}`, (g) => {
            const s = fsz(w, h, 0.9);
            const kb = dragonBytes ? ` · ${Math.round(dragonBytes / 1024)}KB` : '';
            pill(g, s * 0.6, s * 0.6, `dragon.glb${kb}`, s, 'rgba(255,190,70,0.92)', '#3a2200');
            if (info) pill(g, s * 0.6, s * 2.5, info, s * 0.85);
            if (!holder) pill(g, w / 2, h / 2 - s, err ? '모델 없음' : '불러오는 중…', s, 'rgba(0,0,0,0.6)', '#fff', 'center');
          });
        },
        dispose() {
          dead = true;
          mixer?.stopAllAction();
          disposeScene(scene);
          hud.dispose();
        },
      };
    },
  },

  /* ═════════════ 카메라 ═════════════ */
  u40: {
    kind: '3d',
    caption: '끔: 판이 화면 한가운데라 오른쪽 패널에 가려요 · 켬: 투영을 옮겨 빈 자리(점선) 가운데로 — 카메라는 그대로',
    make() {
      const scene = baseScene('#bfe3c9', '#eefaf1');
      const board = new THREE.Group();
      const light = std(0xf3e2c4, 0.7);
      const dark = std(0x8a5a3c, 0.7);
      const sq = new THREE.BoxGeometry(0.5, 0.12, 0.5);
      for (let i = 0; i < 6; i++)
        for (let j = 0; j < 6; j++) {
          const m = new THREE.Mesh(sq, (i + j) % 2 ? dark : light);
          m.position.set((i - 2.5) * 0.5, 0, (j - 2.5) * 0.5);
          board.add(m);
        }
      const frameM = new THREE.Mesh(new RoundedBoxGeometry(3.3, 0.14, 3.3, 2, 0.05), std(0x5a3a26, 0.6));
      frameM.position.y = -0.03;
      board.add(frameM);
      const pieceGeo = new THREE.CylinderGeometry(0.17, 0.2, 0.12, 24);
      [[0, 0, 0xffffff], [1, 2, 0x2b2b3a], [3, 1, 0xffffff], [4, 4, 0x2b2b3a], [2, 5, 0xffffff], [5, 3, 0x2b2b3a]].forEach(([i, j, c]) => {
        const p = new THREE.Mesh(pieceGeo, std(c!, 0.35));
        p.position.set((i! - 2.5) * 0.5, 0.12, (j! - 2.5) * 0.5);
        board.add(p);
      });
      scene.add(board);
      const cam = new THREE.PerspectiveCamera(36, 1, 0.1, 60);
      const hud = new Hud();
      let m = 0;
      let on = false;
      let auto = true;
      return {
        scene,
        camera: cam,
        update(t, dt) {
          if (auto) on = Math.floor(t / 3) % 2 === 1;
          m += ((on ? 1 : 0) - m) * Math.min(1, dt * 5);
          board.rotation.y = Math.sin(t * 0.4) * 0.15;
        },
        render(r, w, h) {
          // 빈 자리: 위 HUD 14% · 아래 단추 16% · 오른쪽 패널 30% 를 뺀 곳
          const fx1 = w * 0.7;
          const fy0 = h * 0.14;
          const fy1 = h * 0.84;
          const cx = fx1 / 2;
          const cy = (fy0 + fy1) / 2;
          const tn = Math.tan((cam.fov * Math.PI) / 360);
          const half = 1.85;
          const d = Math.max(half / (tn * 0.7), half / (tn * (w / h) * 0.7));
          cam.position.set(0, d * 0.8, d * 0.6);
          cam.lookAt(0, 0, 0);
          cam.setViewOffset(w, h, (w / 2 - cx) * m, (h / 2 - cy) * m, w, h);
          r.render(scene, cam);
          hud.draw(r, w, h, `${w}x${h}${on}`, (g) => {
            const s = fsz(w, h);
            g.fillStyle = 'rgba(40,60,110,0.86)';
            g.fillRect(0, 0, w, fy0);
            g.fillRect(fx1, fy0, w - fx1, h - fy0);
            g.fillRect(0, fy1, fx1, h - fy1);
            g.fillStyle = '#fff';
            g.font = `700 ${s * 0.85}px ${FONT}`;
            g.textBaseline = 'middle';
            g.textAlign = 'left';
            g.fillText('점수 120   ·   차례: 나', s * 0.6, fy0 / 2);
            g.textAlign = 'center';
            g.fillText('패널', fx1 + (w - fx1) / 2, fy0 + s * 1.2);
            for (let k = 0; k < 3; k++) {
              g.fillStyle = 'rgba(255,255,255,0.18)';
              g.beginPath();
              g.roundRect(fx1 + s * 0.5, fy0 + s * 2.3 + k * s * 2, w - fx1 - s, s * 1.5, s * 0.4);
              g.fill();
            }
            for (let k = 0; k < 3; k++) {
              g.fillStyle = '#ffc94a';
              g.beginPath();
              g.roundRect(fx1 * (0.12 + k * 0.29), fy1 + (h - fy1) * 0.2, fx1 * 0.2, (h - fy1) * 0.6, s * 0.4);
              g.fill();
            }
            g.setLineDash([s * 0.4, s * 0.3]);
            g.strokeStyle = on ? '#ff5a36' : 'rgba(255,90,54,0.5)';
            g.lineWidth = Math.max(1.5, s * 0.12);
            g.strokeRect(s * 0.3, fy0 + s * 0.3, fx1 - s * 0.6, fy1 - fy0 - s * 0.6);
            g.setLineDash([]);
            g.beginPath();
            g.moveTo(cx - s, cy);
            g.lineTo(cx + s, cy);
            g.moveTo(cx, cy - s);
            g.lineTo(cx, cy + s);
            g.stroke();
            pill(g, s * 0.6, fy0 + s * 0.6, on ? '가운데 맞추기 켬' : '가운데 맞추기 끔', s * 0.85, on ? 'rgba(255,90,54,0.95)' : 'rgba(30,40,80,0.75)');
          });
        },
        controls: [
          { type: 'toggle', label: '저절로 켜고 끄기', value: true, on: (v) => (auto = v) },
          { type: 'toggle', label: '빈 자리 가운데 맞추기', value: false, on: (v) => ((auto = false), (on = v)) },
        ],
        dispose() {
          disposeScene(scene);
          hud.dispose();
        },
      };
    },
  },

  u41: {
    kind: '3d',
    caption: '이분 탐색: 모서리(점)가 95% 틀 밖이면 멀리, 안이면 가까이 — 절반씩 좁혀 판에 꼭 맞는 거리를 찾아요',
    make() {
      const scene = baseScene('#d6e4ff', '#f6f9ff');
      const root = new THREE.Group();
      scene.add(root);
      const sizes: [number, number][] = [
        [6, 3],
        [3, 4.5],
        [4, 4],
      ];
      const lot = new THREE.Mesh(new THREE.BoxGeometry(1, 0.2, 1), std(0x5d6475, 0.9));
      root.add(lot);
      const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const cars: THREE.Mesh[] = [];
      const carCols = [0xff4f4f, 0x4aa8ff, 0xffc93c, 0x5ad17a, 0xb07cff];
      for (let i = 0; i < 6; i++) {
        const c = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.45, 0.5, 2, 0.12), std(carCols[i % 5]!, 0.4));
        root.add(c);
        cars.push(c);
      }
      const stripes = new THREE.Group();
      root.add(stripes);
      const stripeGeo = new THREE.PlaneGeometry(0.05, 0.8);
      const corners: THREE.Vector3[] = [];
      let W = 6;
      let D = 3;
      const setBoard = (k: number): void => {
        [W, D] = sizes[k % sizes.length]!;
        lot.scale.set(W, 1, D);
        cars.forEach((c, i) => {
          c.position.set(((i % 3) / 2 - 0.5) * (W - 1.4), 0.32, (Math.floor(i / 3) - 0.5) * (D - 1.2) * 0.8);
          c.rotation.y = i % 2 ? 0 : Math.PI / 2;
        });
        stripes.clear();
        for (let x = -W / 2 + 0.6; x < W / 2; x += 0.8) {
          const s = new THREE.Mesh(stripeGeo, lineMat);
          s.rotation.x = -Math.PI / 2;
          s.position.set(x, 0.11, -D / 2 + 0.5);
          stripes.add(s);
        }
        corners.length = 0;
        for (const sx of [-1, 1]) for (const sy of [0, 0.6]) for (const sz of [-1, 1]) corners.push(new THREE.Vector3((sx * W) / 2, sy, (sz * D) / 2));
      };
      const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
      const dir = new THREE.Vector3(0, 0.82, 0.57).normalize();
      const hud = new Hud();
      let board = -1;
      let lo = 1;
      let hi = 40;
      let mid = 20;
      let step = 0;
      let dist = 20;
      let verdict = '';
      const fits = (d: number, aspect: number): boolean => {
        cam.position.copy(dir).multiplyScalar(d);
        cam.lookAt(0, 0, 0);
        cam.aspect = aspect;
        cam.updateMatrixWorld();
        cam.updateProjectionMatrix();
        let mx = 0;
        for (const c of corners) {
          const p = c.clone().project(cam);
          mx = Math.max(mx, Math.abs(p.x), Math.abs(p.y));
        }
        return mx <= 0.95;
      };
      return {
        scene,
        camera: cam,
        update(t) {
          const cyc = 5.2;
          const k = Math.floor(t / cyc);
          if (k !== board) {
            board = k;
            setBoard(k);
            lo = 1;
            hi = 40;
            step = -1;
            mid = 3 + ((k * 7) % 5) * 6;
          }
          const s = Math.min(10, Math.floor(((t % cyc) - 0.6) / 0.32));
          root.rotation.y = 0;
          if (s > step && s >= 0) {
            step = s;
            if (s >= 10) {
              mid = hi;
              verdict = `찾았다! 거리 ${hi.toFixed(2)}`;
            } else {
              mid = (lo + hi) / 2;
              const ok = fits(mid, cam.aspect);
              if (ok) hi = mid;
              else lo = mid;
              verdict = ok ? '틀 안 → 더 가까이' : '틀 밖 → 더 멀리';
            }
          }
          dist += (mid - dist) * 0.25;
        },
        render(r, w, h) {
          cam.aspect = w / h;
          cam.position.copy(dir).multiplyScalar(dist);
          cam.lookAt(0, 0, 0);
          cam.updateProjectionMatrix();
          cam.updateMatrixWorld();
          r.render(scene, cam);
          const pts = corners.map((c) => c.clone().project(cam));
          hud.draw(r, w, h, `${w}x${h}${pts.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join()}${step}`, (g) => {
            const s = fsz(w, h);
            g.setLineDash([s * 0.4, s * 0.3]);
            g.strokeStyle = '#ff5a36';
            g.lineWidth = Math.max(1.5, s * 0.12);
            g.strokeRect(w * 0.025, h * 0.025, w * 0.95, h * 0.95);
            g.setLineDash([]);
            for (const p of pts) {
              const out = Math.abs(p.x) > 0.95 || Math.abs(p.y) > 0.95;
              g.fillStyle = out ? '#ff3b3b' : '#22c55e';
              g.beginPath();
              g.arc(((p.x + 1) / 2) * w, ((1 - p.y) / 2) * h, s * 0.32, 0, TAU);
              g.fill();
              g.strokeStyle = '#fff';
              g.lineWidth = 2;
              g.stroke();
            }
            if (step >= 0) pill(g, s * 0.8, s * 0.8, step >= 10 ? verdict : `${step + 1}번째: ${verdict}`, s * 0.85, step >= 10 ? 'rgba(34,160,90,0.95)' : 'rgba(20,28,60,0.72)');
            // 남은 범위 띠
            const bx = w * 0.55;
            const bw = w * 0.38;
            const by = h - s * 2;
            g.fillStyle = 'rgba(30,40,80,0.25)';
            g.fillRect(bx, by, bw, s * 0.5);
            g.fillStyle = '#4a7dff';
            g.fillRect(bx + ((lo - 1) / 39) * bw, by, Math.max(2, ((hi - lo) / 39) * bw), s * 0.5);
            g.fillStyle = '#1d2a55';
            g.font = `700 ${s * 0.7}px ${FONT}`;
            g.textAlign = 'left';
            g.textBaseline = 'bottom';
            g.fillText(`거리 범위 ${lo.toFixed(1)} ~ ${hi.toFixed(1)}`, bx, by - 2);
          });
        },
        dispose() {
          stripeGeo.dispose();
          lineMat.dispose();
          disposeScene(scene);
          hud.dispose();
        },
      };
    },
  },

  u42: {
    kind: '3d',
    caption: '넓게 보다가 → 던진 공 뒤에서 따라가고 → 꽂히는 순간 느리게 확대 → 원래 구도로 (숫자 야구)',
    make() {
      const scene = baseScene('#0d1838', '#2a3f7a');
      scene.add(new THREE.AmbientLight(0x8090c0, 0.5));
      const field = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), std(0x2f8f4a, 0.9));
      field.rotation.x = -Math.PI / 2;
      scene.add(field);
      for (let i = -6; i <= 6; i += 2) {
        const stripe = new THREE.Mesh(new THREE.PlaneGeometry(2, 30), new THREE.MeshBasicMaterial({ color: 0x3aa457, transparent: true, opacity: 0.35 }));
        stripe.rotation.x = -Math.PI / 2;
        stripe.position.set(i, 0.01, 0);
        scene.add(stripe);
      }
      // 과녁판 — 숫자 셋
      const cv = document.createElement('canvas');
      cv.width = 512;
      cv.height = 192;
      const cg = cv.getContext('2d')!;
      cg.fillStyle = '#1b2a6b';
      cg.fillRect(0, 0, 512, 192);
      ['3', '7', '1'].forEach((d, i) => {
        cg.fillStyle = '#0a1240';
        cg.beginPath();
        cg.arc(96 + i * 160, 96, 70, 0, TAU);
        cg.fill();
        cg.fillStyle = '#ffd34a';
        cg.font = `400 96px ${TITLE}`;
        cg.textAlign = 'center';
        cg.textBaseline = 'middle';
        cg.fillText(d, 96 + i * 160, 104);
      });
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      const target = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.2, 0.2), [std(0x14204f, 0.6), std(0x14204f, 0.6), std(0x14204f, 0.6), std(0x14204f, 0.6), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25 }), std(0x14204f, 0.6)]);
      const T0 = new THREE.Vector3(0, 1.6, -6);
      target.position.copy(T0);
      scene.add(target);
      const flash = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.55, 32), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0, toneMapped: false }));
      flash.position.set(T0.x + 1, T0.y, T0.z + 0.12);
      scene.add(flash);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16), std(0xffffff, 0.5));
      for (const s of [-1, 1]) {
        const st = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 6, 24), new THREE.MeshBasicMaterial({ color: 0xe03030 }));
        st.position.x = s * 0.07;
        st.rotation.y = Math.PI / 2;
        ball.add(st);
      }
      scene.add(ball);
      const mound = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.3, 0.25, 32), std(0xc08a55, 0.95));
      mound.position.set(0, 0.12, 6);
      scene.add(mound);
      const cam = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
      const hud = new Hud();
      const P0 = new THREE.Vector3(0, 1.4, 6);
      const P1 = new THREE.Vector3(T0.x + 1, T0.y, T0.z + 0.15);
      const wide = new THREE.Vector3(7, 5.5, 8);
      const wideLook = new THREE.Vector3(0, 1, 0);
      let clock = 0;
      let phase = '';
      const ballAt = (k: number): THREE.Vector3 => new THREE.Vector3().lerpVectors(P0, P1, k).add(new THREE.Vector3(0, Math.sin(k * Math.PI) * 1.4, 0));
      return {
        scene,
        camera: cam,
        update(_t, dt) {
          // 느린 화면: 꽂히는 순간 시간이 느려짐
          const c = clock % 6;
          const slow = c > 2.2 && c < 3.4 ? 0.25 : 1;
          clock += dt * slow;
          const cc = clock % 6;
          const fly = clamp((cc - 1) / 1.4, 0, 1);
          ball.position.copy(ballAt(fly));
          ball.rotation.x += dt * slow * 20;
          ball.visible = cc > 0.6;
          if (cc < 0.6) ball.position.copy(P0);
          let pos = wide.clone();
          let look = wideLook.clone();
          let fov = 45;
          if (cc < 1) phase = '원래 구도';
          else if (cc < 2.4) {
            const k = smooth((cc - 1) / 0.4);
            const behind = ball.position.clone().add(new THREE.Vector3(0.6, 0.7, 2.2));
            pos = wide.clone().lerp(behind, k);
            look = wideLook.clone().lerp(ballAt(Math.min(1, fly + 0.25)), k);
            phase = '공 따라가기';
          } else if (cc < 4) {
            const k = smooth((cc - 2.4) / 0.35);
            const close = P1.clone().add(new THREE.Vector3(1.4, 0.7, 4.0));
            const behind = ballAt(1).add(new THREE.Vector3(0.6, 0.7, 2.2));
            pos = behind.lerp(close, k);
            look = P1.clone();
            fov = lerp(45, 28, k);
            phase = '꽂히는 순간 확대';
          } else {
            const k = smooth((cc - 4) / 1.3);
            const close = P1.clone().add(new THREE.Vector3(1.4, 0.7, 4.0));
            pos = close.lerp(wide, k);
            look = P1.clone().lerp(wideLook, k);
            fov = lerp(28, 45, k);
            phase = '원래 구도로';
          }
          (flash.material as THREE.MeshBasicMaterial).opacity = cc > 2.4 && cc < 4.5 ? 0.5 + 0.5 * Math.sin(cc * 14) : 0;
          flash.scale.setScalar(1 + Math.min(1, Math.max(0, cc - 2.4)) * 0.4);
          cam.position.copy(pos);
          cam.lookAt(look);
          if (cam.fov !== fov) {
            cam.fov = fov;
            cam.updateProjectionMatrix();
          }
        },
        render(r, w, h) {
          r.render(scene, cam);
          hud.draw(r, w, h, `${w}x${h}${phase}`, (g) => {
            const s = fsz(w, h);
            pill(g, s * 0.6, s * 0.6, `카메라: ${phase}`, s * 0.9, phase === '꽂히는 순간 확대' ? 'rgba(255,90,54,0.95)' : 'rgba(10,20,50,0.7)');
          });
        },
        dispose() {
          disposeScene(scene);
          hud.dispose();
        },
      };
    },
  },

  u43: {
    kind: '3d',
    caption: '큰 화면은 원근 카메라, 작은 창 셋은 정사영 카메라 — 쌓기나무를 정면 · 옆 · 위에서 본 모양',
    make() {
      const scene = baseScene('#e9f1ff', '#fbfdff');
      const blocks = new THREE.Group();
      scene.add(blocks);
      const geo = new RoundedBoxGeometry(0.96, 0.96, 0.96, 2, 0.06);
      const mats = [0xff7a59, 0xffc93c, 0x4aa8ff, 0x5ad17a].map((c) => std(c, 0.5));
      const grid = new THREE.GridHelper(4, 4, 0x8aa0c8, 0xc6d4ee);
      grid.position.y = -0.5;
      scene.add(grid);
      const build = (k: number): void => {
        blocks.clear();
        let seed = k * 9301 + 49297;
        const rnd = (): number => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
        for (let x = 0; x < 3; x++)
          for (let z = 0; z < 3; z++) {
            const hgt = Math.floor(rnd() * 3.4);
            for (let y = 0; y < hgt; y++) {
              const m = new THREE.Mesh(geo, mats[(x + z + y) % 4]!);
              m.position.set(x - 1, y, z - 1);
              m.userData['shared'] = true;
              blocks.add(m);
            }
          }
      };
      let built = -1;
      const main = new THREE.PerspectiveCamera(35, 1, 0.1, 60);
      const S = 2.3;
      const ortho = [new THREE.OrthographicCamera(-S, S, S, -S, 0.1, 50), new THREE.OrthographicCamera(-S, S, S, -S, 0.1, 50), new THREE.OrthographicCamera(-S, S, S, -S, 0.1, 50)];
      ortho[0]!.position.set(0, 1, 10);
      ortho[1]!.position.set(10, 1, 0);
      ortho[2]!.position.set(0, 10, 0);
      ortho[2]!.up.set(0, 0, -1);
      ortho.forEach((c) => c.lookAt(0, 1, 0));
      ortho[2]!.lookAt(0, 0, 0);
      const hud = new Hud();
      const names = ['정면', '옆', '위'];
      return {
        scene,
        camera: main,
        update(t) {
          const k = Math.floor(t / 4);
          if (k !== built) {
            built = k;
            build(k);
          }
          (main.userData as { a: number })['a'] = t * 0.4 + 0.7;
        },
        render(r, w, h) {
          const wide = w >= h;
          const mw = wide ? w * 0.7 : w;
          const mh = wide ? h : h * 0.7;
          main.aspect = mw / mh;
          main.updateProjectionMatrix();
          const tn = Math.tan((main.fov * Math.PI) / 360);
          const dd = Math.max(2.7 / tn, 2.7 / (tn * main.aspect));
          const an = (main.userData as { a: number })['a'] ?? 0;
          main.position.set(Math.sin(an) * dd * 0.78, dd * 0.55 + 0.8, Math.cos(an) * dd * 0.78);
          main.lookAt(0, 0.7, 0);
          r.setScissorTest(true);
          r.setViewport(0, wide ? 0 : h - mh, mw, mh);
          r.setScissor(0, wide ? 0 : h - mh, mw, mh);
          r.render(scene, main);
          const rects: [number, number, number, number][] = [];
          for (let i = 0; i < 3; i++) {
            const size = wide ? Math.min(w - mw, h / 3) : Math.min(h - mh, w / 3);
            const x = wide ? mw + (w - mw - size) / 2 : (w / 3) * i + (w / 3 - size) / 2;
            const y = wide ? h - (i + 1) * (h / 3) + (h / 3 - size) / 2 : (h - mh - size) / 2;
            rects.push([x, y, size, size]);
            const pad = size * 0.06;
            r.setViewport(x + pad, y + pad, size - pad * 2, size - pad * 2);
            r.setScissor(x + pad, y + pad, size - pad * 2, size - pad * 2);
            r.render(scene, ortho[i]!);
          }
          r.setScissorTest(false);
          r.setViewport(0, 0, w, h);
          hud.draw(r, w, h, `${w}x${h}`, (g) => {
            const s = fsz(w, h, 0.8);
            rects.forEach(([x, y, size], i) => {
              const top = h - y - size;
              g.strokeStyle = '#3a5bb0';
              g.lineWidth = Math.max(1.5, s * 0.15);
              g.strokeRect(x + size * 0.06, top + size * 0.06, size * 0.88, size * 0.88);
              pill(g, x + size * 0.08, top + size * 0.08, names[i]!, s * 0.85, 'rgba(58,91,176,0.92)');
            });
          });
        },
        dispose() {
          geo.dispose();
          mats.forEach((m) => m.dispose());
          disposeScene(scene);
          hud.dispose();
        },
      };
    },
  },

  /* ═════════════ 움직임 ═════════════ */
  u44: {
    kind: '3d',
    caption: '손가락마다 뼈 3개(노란 선) — 뼈만 돌리면 살(색 = 어느 뼈를 따르는지 무게)이 따라 휘어요',
    make() {
      const scene = baseScene('#ffe9e0', '#fffaf6');
      const hand = new THREE.Group();
      scene.add(hand);
      const palm = new THREE.Mesh(new RoundedBoxGeometry(1.5, 1.5, 0.45, 4, 0.18), std(0xffc9a8, 0.6));
      palm.position.y = -0.7;
      hand.add(palm);
      const BCOL = [new THREE.Color(0xff6b8b), new THREE.Color(0xffc23a), new THREE.Color(0x4aa8ff)];
      const skin = new THREE.Color(0xffc9a8);
      const weightMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
      const fingers: THREE.Bone[][] = [];
      const meshes: THREE.SkinnedMesh[] = [];
      const defs: [number, number, number, number][] = [
        [-0.54, 0, 0.95, 0.16],
        [-0.18, 0, 1.2, 0.17],
        [0.18, 0, 1.12, 0.17],
        [0.54, 0, 0.9, 0.15],
      ];
      const mk = (x: number, y: number, len: number, rad: number, rotZ: number): void => {
        const seg = len / 3;
        const geo = new THREE.CylinderGeometry(rad * 0.9, rad, len, 14, 18, false);
        geo.translate(0, len / 2, 0);
        const p = geo.getAttribute('position');
        const si: number[] = [];
        const sw: number[] = [];
        const cw: number[] = [];
        const cWeights: THREE.Color[] = [];
        for (let i = 0; i < p.count; i++) {
          const y0 = p.getY(i);
          const f = clamp(y0 / seg, 0, 2.999);
          const b = Math.floor(f);
          const fr = f - b;
          // 관절 근처는 두 뼈가 섞임
          let b2 = b;
          let w2 = 0;
          if (fr > 0.75 && b < 2) {
            b2 = b + 1;
            w2 = ((fr - 0.75) / 0.25) * 0.5;
          } else if (fr < 0.25 && b > 0) {
            b2 = b - 1;
            w2 = ((0.25 - fr) / 0.25) * 0.5;
          }
          si.push(b, b2, 0, 0);
          sw.push(1 - w2, w2, 0, 0);
          const c = BCOL[b]!.clone().lerp(BCOL[b2]!, w2);
          cWeights.push(c);
          cw.push(c.r, c.g, c.b);
        }
        geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
        geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(cw, 3));
        geo.userData['wc'] = cw;
        const bones = [new THREE.Bone(), new THREE.Bone(), new THREE.Bone()];
        bones[1]!.position.y = seg;
        bones[2]!.position.y = seg;
        bones[0]!.add(bones[1]!);
        bones[1]!.add(bones[2]!);
        const sm = new THREE.SkinnedMesh(geo, weightMat);
        sm.add(bones[0]!);
        sm.bind(new THREE.Skeleton(bones));
        sm.position.set(x, y, 0);
        sm.rotation.z = rotZ;
        const tip = new THREE.Mesh(new THREE.SphereGeometry(rad * 0.9, 14, 10), std(0xffc9a8, 0.6));
        tip.position.y = seg;
        bones[2]!.add(tip);
        hand.add(sm);
        fingers.push(bones);
        meshes.push(sm);
      };
      defs.forEach(([x, y, l, r]) => mk(x, y, l, r, 0));
      mk(0.75, -0.75, 0.75, 0.18, -0.9);
      const helper = new THREE.SkeletonHelper(hand);
      (helper.material as THREE.LineBasicMaterial).linewidth = 2;
      (helper.material as THREE.LineBasicMaterial).color = new THREE.Color(0xffe100);
      (helper.material as THREE.LineBasicMaterial).depthTest = false;
      helper.renderOrder = 5;
      scene.add(helper);
      const joints = new THREE.Group();
      scene.add(joints);
      const jGeo = new THREE.SphereGeometry(0.045, 10, 8);
      const jMat = new THREE.MeshBasicMaterial({ color: 0xffe100, depthTest: false });
      fingers.flat().forEach((b) => {
        const j = new THREE.Mesh(jGeo, jMat);
        j.renderOrder = 6;
        b.add(j);
      });
      const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
      let showBones = true;
      let weights = true;
      let speed = 1;
      let clock = 0;
      return {
        scene,
        camera: cam,
        update(t, dt) {
          clock += dt * speed;
          fingers.forEach((bones, i) => {
            const b = (0.5 - 0.5 * Math.cos(clock * 2.2 - i * 0.55)) * (i === 4 ? 0.5 : 0.75);
            bones.forEach((bn) => (bn.rotation.x = b));
          });
          hand.rotation.y = -0.85 + Math.sin(t * 0.5) * 0.4;
          helper.visible = showBones;
          joints.visible = showBones;
          for (const m of meshes) {
            const geo = m.geometry;
            const want = weights ? 1 : 0;
            if (geo.userData['mode'] !== want) {
              geo.userData['mode'] = want;
              const c = geo.getAttribute('color') as THREE.BufferAttribute;
              const wc = geo.userData['wc'] as number[];
              for (let i = 0; i < c.count; i++) {
                if (weights) c.setXYZ(i, wc[i * 3]!, wc[i * 3 + 1]!, wc[i * 3 + 2]!);
                else c.setXYZ(i, skin.r, skin.g, skin.b);
              }
              c.needsUpdate = true;
            }
          }
        },
        resize(w, h) {
          const tn = Math.tan((cam.fov * Math.PI) / 360);
          const d = Math.max(1.75 / tn, 1.6 / (tn * (w / h)));
          cam.position.set(0.3, 0.9, d);
          cam.lookAt(0, -0.1, 0);
        },
        controls: [
          { type: 'toggle', label: '뼈 보기', value: true, on: (v) => (showBones = v) },
          { type: 'toggle', label: '무게 색 보기', value: true, on: (v) => (weights = v) },
          { type: 'range', label: '빠르기', min: 0, max: 3, step: 0.1, value: 1, on: (v) => (speed = v) },
        ],
        dispose() {
          jGeo.dispose();
          jMat.dispose();
          helper.dispose();
          disposeScene(scene);
        },
      };
    },
  },

  u45: {
    kind: '3d',
    caption: '같은 몸 움직임 — 왼쪽은 딱딱하게 붙어 있고, 오른쪽은 머리 · 안테나가 용수철처럼 늦게 따라와 출렁여요',
    make() {
      const mkBot = (): { scene: THREE.Scene; body: THREE.Group; neck: THREE.Group; ant: THREE.Group } => {
        const scene = baseScene('#d7f0ff', '#f8fdff');
        const ground = new THREE.Mesh(new THREE.CircleGeometry(3, 40), std(0xcfe8d0, 0.9));
        ground.rotation.x = -Math.PI / 2;
        scene.add(ground);
        const body = new THREE.Group();
        const torso = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.8, 0.7, 3, 0.2), std(0x6aa8ff, 0.35, 0.2));
        torso.position.y = 0.55;
        body.add(torso);
        for (const s of [-1, 1]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.3, 12), std(0x3a4a7a, 0.4));
          leg.position.set(s * 0.22, 0.12, 0);
          body.add(leg);
        }
        const neck = new THREE.Group();
        neck.position.y = 0.95;
        body.add(neck);
        const head = new THREE.Mesh(new RoundedBoxGeometry(1.05, 0.8, 0.8, 3, 0.25), std(0xf2f5ff, 0.3, 0.1));
        head.position.y = 0.42;
        neck.add(head);
        const screen = new THREE.Mesh(new RoundedBoxGeometry(0.8, 0.5, 0.05, 2, 0.1), std(0x1b2450, 0.3));
        screen.position.set(0, 0.42, 0.39);
        neck.add(screen);
        for (const s of [-1, 1]) {
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 10), new THREE.MeshBasicMaterial({ color: 0x7cf0ff }));
          eye.position.set(s * 0.17, 0.45, 0.43);
          eye.scale.set(1, 1.3, 0.4);
          neck.add(eye);
        }
        const ant = new THREE.Group();
        ant.position.y = 0.82;
        neck.add(ant);
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.4, 8), std(0x8a96ad, 0.4, 0.6));
        stick.position.y = 0.2;
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 10), new THREE.MeshStandardMaterial({ color: 0xff5a7a, emissive: 0xff2050, emissiveIntensity: 0.6 }));
        bulb.position.y = 0.42;
        ant.add(stick, bulb);
        scene.add(body);
        return { scene, body, neck, ant };
      };
      const A = mkBot();
      const B = mkBot();
      const cam = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
      const hud = new Hud();
      let stiff = 60;
      // 용수철 상태: 머리 늦음(x, y) · 안테나 각
      const sp = { hx: 0, hvx: 0, hy: 0, hvy: 0, a: 0, va: 0 };
      let prevX = 0;
      let prevY = 0;
      let pvx = 0;
      let pvy = 0;
      const bodyAt = (t: number): [number, number] => {
        const k = Math.floor(t / 1.1);
        const f = (t % 1.1) / 1.1;
        const xs = [-0.55, 0.55, 0, 0.55, -0.55, 0];
        const x0 = xs[k % xs.length]!;
        const x1 = xs[(k + 1) % xs.length]!;
        const m = smooth(clamp(f / 0.35, 0, 1));
        const hop = f < 0.35 ? Math.sin((f / 0.35) * Math.PI) * 0.35 : 0;
        return [lerp(x0, x1, m), hop];
      };
      return {
        scene: A.scene,
        camera: cam,
        update(t, dt) {
          const [x, y] = bodyAt(t);
          for (const S of [A, B]) {
            S.body.position.set(x, y, 0);
          }
          // 몸의 가속도로 용수철을 흔든다 (작은 걸음으로 나눠 안정하게)
          const n = Math.max(1, Math.ceil(dt / (1 / 240)));
          const h = dt / n;
          const vx = (x - prevX) / Math.max(dt, 1e-4);
          const vy = (y - prevY) / Math.max(dt, 1e-4);
          const ax = (vx - pvx) / Math.max(dt, 1e-4);
          const ay = (vy - pvy) / Math.max(dt, 1e-4);
          prevX = x;
          prevY = y;
          pvx = vx;
          pvy = vy;
          const k = stiff;
          const c = 2 * Math.sqrt(k) * 0.18;
          for (let i = 0; i < n; i++) {
            sp.hvx += (-k * sp.hx - c * sp.hvx - clamp(ax, -60, 60)) * h;
            sp.hx += sp.hvx * h;
            sp.hvy += (-k * sp.hy - c * sp.hvy - clamp(ay, -60, 60)) * h;
            sp.hy += sp.hvy * h;
            const ka = k * 0.6;
            sp.va += (-ka * sp.a - 2 * Math.sqrt(ka) * 0.1 * sp.va + sp.hvx * 8) * h;
            sp.a += sp.va * h;
          }
          B.neck.position.x = clamp(sp.hx * 0.6, -0.25, 0.25);
          B.neck.position.y = 0.95 + clamp(sp.hy * 0.5, -0.15, 0.15);
          B.neck.rotation.z = clamp(-sp.hx * 1.2, -0.5, 0.5);
          B.ant.rotation.z = clamp(sp.a * 0.5, -1.1, 1.1);
        },
        render(r, w, h) {
          const tn = Math.tan((cam.fov * Math.PI) / 360);
          const d = Math.max(1.6 / tn, 1.45 / (tn * (w / 2 / h)));
          cam.position.set(0, 1.4, d);
          cam.lookAt(0, 0.9, 0);
          splitRender(r, w, h, A.scene, B.scene, cam);
          hud.draw(r, w, h, `${w}x${h}`, (g) => splitLabels(g, w, h, '딱딱하게', '용수철 리그'));
        },
        controls: [{ type: 'range', label: '용수철 세기', min: 15, max: 200, step: 5, value: 60, on: (v) => (stiff = v) }],
        dispose() {
          disposeScene(A.scene);
          disposeScene(B.scene);
          hud.dispose();
        },
      };
    },
  },

  u46: {
    kind: '2d',
    caption: '같은 시간, 같은 거리 — 이징 곡선마다 움직이는 느낌이 달라요 (easeOutBack 은 살짝 넘쳤다 「폴짝」)',
    make() {
      const c1 = 1.70158;
      const E: [string, (x: number) => number, string][] = [
        ['linear', (x) => x, '#9aa5c4'],
        ['easeOutCubic (쓱)', (x) => 1 - (1 - x) ** 3, '#4aa8ff'],
        ['easeInOutSine', (x) => -(Math.cos(Math.PI * x) - 1) / 2, '#5ad17a'],
        ['easeOutBack (폴짝)', (x) => 1 + (c1 + 1) * (x - 1) ** 3 + c1 * (x - 1) ** 2, '#ff7a59'],
        [
          'easeOutBounce (통통)',
          (x) => {
            const n1 = 7.5625;
            const d1 = 2.75;
            if (x < 1 / d1) return n1 * x * x;
            if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
            if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
            return n1 * (x -= 2.625 / d1) * x + 0.984375;
          },
          '#b07cff',
        ],
      ];
      let dur = 1.2;
      return {
        draw(g, w, h, t) {
          const bg = g.createLinearGradient(0, 0, 0, h);
          bg.addColorStop(0, '#1d2752');
          bg.addColorStop(1, '#2f3f7c');
          g.fillStyle = bg;
          g.fillRect(0, 0, w, h);
          const cyc = dur + 0.9;
          const tt = t % (cyc * 2);
          const forward = tt < cyc;
          const x = clamp((forward ? tt : tt - cyc) / dur, 0, 1);
          const pad = Math.min(w, h) * 0.05;
          const gw = Math.min(h - pad * 2, w * 0.3);
          const rowH = (h - pad * 2) / E.length;
          const s = clamp(rowH * 0.3, 9, 26);
          E.forEach(([name, f, col], i) => {
            const y = pad + rowH * i + rowH / 2;
            // 작은 곡선 그래프
            const gx = pad;
            const gh = rowH * 0.78;
            const gy = y - gh / 2;
            const gwid = gw * 0.55;
            g.strokeStyle = 'rgba(255,255,255,0.15)';
            g.strokeRect(gx, gy, gwid, gh);
            g.beginPath();
            for (let k = 0; k <= 40; k++) {
              const u = k / 40;
              const v = f(u);
              const px = gx + u * gwid;
              const py = gy + gh - v * gh * 0.8 - gh * 0.1;
              if (k) g.lineTo(px, py);
              else g.moveTo(px, py);
            }
            g.strokeStyle = col;
            g.lineWidth = 2;
            g.stroke();
            const v = f(x);
            g.fillStyle = '#fff';
            g.beginPath();
            g.arc(gx + x * gwid, gy + gh - v * gh * 0.8 - gh * 0.1, 3, 0, TAU);
            g.fill();
            // 길 위의 공
            const lx0 = gx + gwid + pad * 1.2;
            const lx1 = w - pad * 1.5;
            const vv = forward ? v : 1 - v;
            g.strokeStyle = 'rgba(255,255,255,0.18)';
            g.lineWidth = 2;
            g.beginPath();
            g.moveTo(lx0, y + s * 0.2);
            g.lineTo(lx1, y + s * 0.2);
            g.stroke();
            g.fillStyle = col;
            g.font = `700 ${s * 0.85}px ${FONT}`;
            g.textAlign = 'left';
            g.textBaseline = 'bottom';
            g.fillText(name, lx0, y - rowH * 0.18);
            const bx = lerp(lx0 + s * 0.6, lx1 - s * 0.6, vv);
            const squash = Math.abs(vv - (forward ? 1 : 0)) < 0.02 ? 1.15 : 1;
            g.beginPath();
            g.ellipse(bx, y + s * 0.2 - s * 0.55, s * 0.6 * squash, (s * 0.6) / squash, 0, 0, TAU);
            g.fill();
            g.fillStyle = 'rgba(255,255,255,0.6)';
            g.beginPath();
            g.arc(bx - s * 0.18, y + s * 0.2 - s * 0.75, s * 0.15, 0, TAU);
            g.fill();
          });
        },
        controls: [{ type: 'range', label: '걸리는 시간(초)', min: 0.3, max: 3, step: 0.1, value: 1.2, on: (v) => (dur = v) }],
      };
    },
  },

  u47: {
    kind: '3d',
    caption: '먼저 정한 눈(위 글씨) 그대로 — 포물선으로 날아와 통통 튀고 굴러 그 눈이 위로 오게 멈춰요 (요트 · 피그 주사위)',
    make() {
      const scene = baseScene('#0f3d2e', '#1f6b4c');
      const felt = new THREE.Mesh(new THREE.PlaneGeometry(9, 6), std(0x1f7a4d, 0.95));
      felt.rotation.x = -Math.PI / 2;
      scene.add(felt);
      const rimMat = std(0x7a4a2a, 0.5);
      for (const [x, z, sx, sz] of [
        [0, -3, 9.4, 0.4],
        [0, 3, 9.4, 0.4],
        [-4.5, 0, 0.4, 6],
        [4.5, 0, 0.4, 6],
      ] as [number, number, number, number][]) {
        const b = new THREE.Mesh(new RoundedBoxGeometry(sx, 0.4, sz, 2, 0.1), rimMat);
        b.position.set(x, 0.2, z);
        scene.add(b);
      }
      const shadowTex = (() => {
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const g = c.getContext('2d')!;
        const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
        gr.addColorStop(0, 'rgba(0,0,0,0.55)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, 64, 64);
        return new THREE.CanvasTexture(c);
      })();
      const dice = new DiceSet(scene, null, 3, 0.75);
      const shadows = dice.meshes.map(() => {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
        s.rotation.x = -Math.PI / 2;
        s.position.y = 0.01;
        scene.add(s);
        return s;
      });
      const spots = [-1.3, 0, 1.3].map((x) => new THREE.Vector3(x, 0.375, 0.3));
      dice.meshes.forEach((_, i) => dice.set(i, i + 1, spots[i]!));
      const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
      const hud = new Hud();
      let want = [1, 2, 3];
      let done = true;
      let rollK = -1;
      return {
        scene,
        camera: cam,
        update(t, dt) {
          const k = Math.floor(t / 3.2);
          if (k !== rollK) {
            rollK = k;
            want = [0, 1, 2].map(() => 1 + Math.floor(Math.random() * 6));
            done = false;
            dice.meshes.forEach((_, i) => dice.highlight(i, false));
            dice.roll([0, 1, 2], want, spots, () => {
              done = true;
              dice.meshes.forEach((_, i) => dice.highlight(i, true));
            }, new THREE.Vector3(-3.4, 1.8, 2.2));
          }
          dice.update(dt);
          dice.meshes.forEach((m, i) => {
            shadows[i]!.position.x = m.position.x;
            shadows[i]!.position.z = m.position.z;
            const k2 = clamp(1 - (m.position.y - 0.375) / 2, 0.3, 1);
            shadows[i]!.scale.setScalar(1.3 - k2 * 0.3);
            (shadows[i]!.material as THREE.MeshBasicMaterial).opacity = k2;
          });
        },
        resize(w, h) {
          const tn = Math.tan((cam.fov * Math.PI) / 360);
          const d = Math.max(2.4 / tn, 3.4 / (tn * (w / h)));
          cam.position.set(0, d * 0.8, d * 0.62);
          cam.lookAt(0, 0, 0.1);
        },
        render(r, w, h) {
          r.render(scene, cam);
          hud.draw(r, w, h, `${w}x${h}${want.join()}${done}`, (g) => {
            const s = fsz(w, h);
            pill(g, w / 2, s * 0.6, done ? `✓ 정한 눈 ${want.join(' · ')} 그대로!` : `정한 눈: ${want.join(' · ')}`, s, done ? 'rgba(255,200,60,0.95)' : 'rgba(0,0,0,0.55)', done ? '#3a2200' : '#fff', 'center');
          });
        },
        dispose() {
          dice.dispose();
          shadowTex.dispose();
          disposeScene(scene);
          hud.dispose();
        },
      };
    },
  },

  /* ═════════════ 아이디어: 모양 · 움직임 ═════════════ */
  i17: {
    kind: '3d',
    caption: '글꼴 윤곽을 따서(마칭 스퀘어 → 단순화) 구멍까지 살린 모양을 돌출 + 모서리 깎기 — 진짜 두께 있는 금속 · 도장 글자가 돌며 내려앉아요',
    make() {
      const TEXTS = ['수학', '123', 'π≈3.14', '놀이터', 'ABC'];
      const scene = baseScene('#ffe9c7', '#fff8ee');
      // 금속은 매트캡(구 그림 한 장)으로 — 환경 반사(PMREM)는 첫 장면에 셰이더를 0.45초 동기로 구워 멈칫해서 쓰지 않는다
      const gold = matcapTex(['#3a1e00', '#a8640a', '#ffc44a', '#fff4c8'], false);
      const chrome = matcapTex(['#1c2028', '#7d8794', '#c9daee', '#ffffff'], true);
      const copper = matcapTex(['#2c0e04', '#8a3a1a', '#e88a5a', '#ffe0c8'], false);
      const key = new THREE.DirectionalLight(0xfff1dc, 2.2);
      key.position.set(-2.5, 5, 4);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.left = key.shadow.camera.bottom = -4.5;
      key.shadow.camera.right = key.shadow.camera.top = 4.5;
      key.shadow.camera.near = 1;
      key.shadow.camera.far = 14;
      key.shadow.bias = -0.0008;
      key.shadow.normalBias = 0.02;
      scene.add(key);
      const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 64), std(0xf3e2c8, 0.85));
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      scene.add(floor);
      // 재질 세 벌: [앞뒷면(도장) 색들, 옆면 · 깎은 면]
      const PAINT = [0xff4f6b, 0x3d8bff, 0x2fc28a, 0xffb020, 0xa36bff, 0xff7a3c];
      const presets: { name: string; face: THREE.Material[]; side: THREE.Material }[] = [
        {
          name: '도장 + 금 테',
          face: PAINT.map((c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.06 })),
          side: new THREE.MeshMatcapMaterial({ matcap: gold }),
        },
        {
          name: '크롬',
          face: [new THREE.MeshMatcapMaterial({ matcap: chrome })],
          side: new THREE.MeshMatcapMaterial({ matcap: chrome, color: 0xd8e0ea }),
        },
        {
          name: '구리 무광 + 흰 도장',
          face: [new THREE.MeshPhysicalMaterial({ color: 0xfff6ec, roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.25 })],
          side: new THREE.MeshMatcapMaterial({ matcap: copper }),
        },
      ];
      const outlineMat = new THREE.LineBasicMaterial({ color: 0xff2d5c, depthTest: false, transparent: true });
      const holeMat = new THREE.LineBasicMaterial({ color: 0x1f6bff, depthTest: false, transparent: true });
      const dotMat = new THREE.PointsMaterial({ color: 0x1d2a55, size: 4, sizeAttenuation: false, depthTest: false, transparent: true });
      // 글꼴: 굵은 제목 글꼴(Black Han Sans)은 글자 묶음별로 내려받는다 — fonts.check 는 받기 전에도 참이라 믿을 수 없어 load 가 끝난 뒤에만 쓴다.
      // 그 전에는 굵은 기본 글꼴로 먼저 따고, 오면 다시 딴다 ({px} = 글자 크기 자리)
      const ALL_TXT = TEXTS.join('');
      const BHS = '{px} "Black Han Sans", "Pretendard Variable", sans-serif';
      const fontOf = (): string => (bhsReady ? BHS : '900 {px} "Pretendard Variable", "Malgun Gothic", system-ui, sans-serif');
      let font = fontOf();
      if (!bhsReady)
        void document.fonts
          ?.load('40px "Black Han Sans"', ALL_TXT)
          .then((f) => {
            bhsReady = f.length > 0;
            if (fontOf() !== font) dirty = true;
          })
          .catch(() => undefined);
      let textIdx = 0;
      let depth = 0.25;
      let bevel = 0.022;
      let mat = 0;
      let showLines = false;
      let auto = true;
      let dirty = true;
      let replay = true;
      let t0 = 0;
      let tNow = 0;
      let width = 2;
      let camD = 0;
      const group = new THREE.Group();
      scene.add(group);
      const geoCache = new Map<string, THREE.BufferGeometry>();
      let letters: { root: THREE.Group; mesh: THREE.Mesh; lines: THREE.Group; x: number }[] = [];
      let stats = { loops: 0, holes: 0, pts: 0, tris: 0 };
      const clearLetters = (): void => {
        for (const l of letters) {
          l.lines.traverse((o) => (o as THREE.Line).geometry?.dispose());
          group.remove(l.root);
        }
        letters = [];
      };
      const build = (): void => {
        dirty = false;
        if (replay) t0 = tNow;
        replay = false;
        font = fontOf();
        clearLetters();
        const chars = [...TEXTS[textIdx]!];
        const outs = chars.map((c) => traceGlyph(c, font));
        const gap = 0.05 + bevel * 2;
        width = outs.reduce((a, o) => a + o.adv + gap, -gap);
        const minY = Math.min(...outs.map((o) => o.minY));
        let x = -width / 2;
        stats = { loops: 0, holes: 0, pts: 0, tris: 0 };
        const P = presets[mat]!;
        outs.forEach((o, i) => {
          const cx = x + o.adv / 2;
          x += o.adv + gap;
          if (!o.shapes.length) return;
          const gk = `${font}|${chars[i]}|${depth}|${bevel}`;
          let geo = geoCache.get(gk);
          if (!geo) {
            geo = glyphGeo(o, depth, bevel);
            geoCache.set(gk, geo);
          }
          const mesh = new THREE.Mesh(geo, [P.face[i % P.face.length]!, P.side]);
          mesh.castShadow = true;
          mesh.position.y = -minY;
          // 2D 윤곽 보기 — 앞면 바로 앞에 선 · 점
          const lines = new THREE.Group();
          const zf = depth / 2 + bevel + 0.004;
          for (const L of o.loops) {
            const arr = new Float32Array(L.pts.length * 3);
            L.pts.forEach((q, k) => arr.set([q.x, q.y, zf], k * 3));
            const lg = new THREE.BufferGeometry();
            lg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
            const ln = new THREE.LineLoop(lg, L.hole ? holeMat : outlineMat);
            ln.renderOrder = 9;
            const dots = new THREE.Points(lg, dotMat);
            dots.renderOrder = 10;
            lines.add(ln, dots);
            stats.loops++;
            if (L.hole) stats.holes++;
            stats.pts += L.pts.length;
          }
          lines.visible = showLines;
          mesh.add(lines);
          stats.tris += geo.attributes['position']!.count / 3;
          const root = new THREE.Group();
          root.add(mesh);
          root.position.x = cx;
          group.add(root);
          letters.push({ root, mesh, lines, x: cx });
        });
      };
      const rebuildGeo = (): void => {
        for (const g of geoCache.values()) g.dispose();
        geoCache.clear();
        dirty = true;
      };
      const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
      const hud = new Hud();
      let warmK = 0;
      const ALL = [...new Set(TEXTS.join(''))];
      build();
      return {
        scene,
        camera: cam,
        update(t) {
          tNow = t;
          if (auto && t - t0 > 7) {
            textIdx = (textIdx + 1) % TEXTS.length;
            dirty = replay = true;
          }
          if (dirty) build();
          // 다음 글자들 윤곽은 프레임마다 하나씩 미리 (글자 하나 1 ~ 3ms)
          if (warmK < ALL.length && t > 1) traceGlyph(ALL[warmK++]!, font);
          const lt0 = t - t0;
          letters.forEach((l, i) => {
            const lt = lt0 - i * 0.16;
            const r = l.root;
            if (lt < 0) {
              r.visible = false;
              return;
            }
            r.visible = true;
            const fall = 0.85;
            if (lt < fall) {
              // 떨어지며 돈다 (중력처럼 k² · 회전은 점점 느려져 앞을 보며 멈춤)
              const k = lt / fall;
              r.position.y = 2.6 * (1 - k * k);
              r.rotation.y = (1 - k) ** 2 * TAU;
              r.rotation.x = (1 - k) * 0.5;
              r.scale.set(1, 1, 1);
            } else {
              const s = lt - fall;
              const sq = Math.exp(-s * 7) * Math.cos(s * 22);
              r.position.y = Math.max(0, Math.sin(Math.min(s / 0.32, 1) * Math.PI) * 0.16 * Math.exp(-s * 3));
              r.scale.set(1 + sq * 0.12, 1 - sq * 0.16, 1 + sq * 0.12);
              r.rotation.x = 0;
              r.rotation.y = Math.sin(t * 0.9 + i * 0.8) * 0.16 * Math.min(1, s);
            }
          });
          group.rotation.y = Math.sin(t * 0.35) * 0.18;
        },
        resize(w, h) {
          const tn = Math.tan((cam.fov * Math.PI) / 360);
          const want = Math.max(1.05 / tn, (width / 2 + 0.45) / (tn * (w / h)));
          camD = camD ? lerp(camD, want, 0.08) : want;
          cam.position.set(0, camD * 0.32 + 0.35, camD);
          cam.lookAt(0, 0.4, 0);
        },
        render(r, w, h) {
          r.render(scene, cam);
          hud.draw(r, w, h, `${w}x${h}${textIdx}${mat}${showLines}${stats.pts}${depth}${bevel}`, (g) => {
            const s = fsz(w, h, 0.85);
            pill(g, s * 0.6, s * 0.6, `「${TEXTS[textIdx]}」 · ${presets[mat]!.name}`, s, 'rgba(60,36,10,0.78)');
            if (showLines) pill(g, s * 0.6, s * 2.5, `윤곽 ${stats.loops - stats.holes} · 구멍 ${stats.holes} · 점 ${stats.pts} · 삼각형 ${stats.tris}`, s * 0.85, 'rgba(255,255,255,0.88)', '#1d2a55');
            pill(g, w - s * 0.6, s * 0.6, `두께 ${depth.toFixed(2)} · 깎기 ${bevel.toFixed(3)}`, s * 0.85, 'rgba(255,160,40,0.92)', '#2a1800', 'right');
          });
        },
        controls: [
          { type: 'button', label: '글자 바꾸기', on: () => ((textIdx = (textIdx + 1) % TEXTS.length), (dirty = replay = true)) },
          { type: 'toggle', label: '저절로 바꾸기', value: true, on: (v) => (auto = v) },
          { type: 'range', label: '두께', min: 0.04, max: 0.6, step: 0.01, value: 0.25, on: (v) => ((depth = v), rebuildGeo()) },
          { type: 'range', label: '모서리 깎기', min: 0, max: 0.05, step: 0.002, value: 0.022, on: (v) => ((bevel = v), rebuildGeo()) },
          { type: 'button', label: '재질 바꾸기', on: () => ((mat = (mat + 1) % presets.length), (dirty = true)) },
          { type: 'toggle', label: '윤곽선 보기 (2D 점 · 선)', value: false, on: (v) => ((showLines = v), letters.forEach((l) => (l.lines.visible = v))) },
        ],
        dispose() {
          clearLetters();
          for (const g of geoCache.values()) g.dispose();
          for (const p of presets) for (const m of [...p.face, p.side]) m.dispose();
          outlineMat.dispose();
          holeMat.dispose();
          dotMat.dispose();
          for (const x of [gold, chrome, copper]) x.dispose();
          disposeScene(scene);
          hud.dispose();
        },
      };
    },
  },

  i18: {
    kind: '3d',
    caption: '공이 도는 동안 겉면에 스티커가 「톡」 붙어요 — 표면 굴곡을 따라 휘어 붙는 데칼 (공 도장 · 차 긁힘)',
    make() {
      const scene = baseScene('#cfeaff', '#f6fbff');
      const R = 1.15;
      const ballGeo = new THREE.SphereGeometry(R, 48, 32);
      const ball = new THREE.Group();
      const ballMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, emissive: 0x5a6080, emissiveIntensity: 0.35 });
      const body = new THREE.Mesh(ballGeo, ballMat);
      ball.add(body);
      // 공 무늬 띠
      const band = new THREE.Mesh(new THREE.TorusGeometry(R * 1.001, 0.04, 8, 64), std(0x4a7dff, 0.4));
      band.rotation.x = Math.PI / 2;
      ball.add(band);
      scene.add(ball);
      const proxy = new THREE.Mesh(ballGeo);
      proxy.updateMatrixWorld();
      const sticker = (kind: number): THREE.CanvasTexture => {
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const g = c.getContext('2d')!;
        g.translate(64, 64);
        const cols = ['#ffcf3a', '#ff5a7a', '#36c98a', '#8a6bff'];
        g.fillStyle = cols[kind]!;
        g.strokeStyle = '#fff';
        g.lineWidth = 8;
        g.beginPath();
        if (kind === 0) {
          for (let i = 0; i < 10; i++) {
            const a = -Math.PI / 2 + (i * Math.PI) / 5;
            const rr = i % 2 ? 24 : 54;
            g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
          }
          g.closePath();
        } else if (kind === 1) {
          g.moveTo(0, 46);
          g.bezierCurveTo(-70, 0, -40, -56, 0, -24);
          g.bezierCurveTo(40, -56, 70, 0, 0, 46);
        } else g.arc(0, 0, 50, 0, TAU);
        g.stroke();
        g.fill();
        if (kind >= 2) {
          g.fillStyle = '#fff';
          g.font = `400 64px ${TITLE}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(kind === 2 ? '7' : '+', 0, 4);
        }
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      };
      const texs = [0, 1, 2, 3].map(sticker);
      const mats = texs.map((t) => new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.4 }));
      const decals: { m: THREE.Mesh; born: number }[] = [];
      const helper = new THREE.Object3D();
      let next = 0;
      let seed = 3;
      const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const stamp = (t: number): void => {
        // 지금 카메라 쪽(앞)에 붙여야 붙는 순간이 보인다 → 공 회전을 거꾸로 돌려 공 좌표로
        const dirW = new THREE.Vector3((rnd() - 0.5) * 1.4, (rnd() - 0.5) * 1.2, 1).normalize();
        const dir = dirW.applyQuaternion(ball.quaternion.clone().invert());
        const p = dir.clone().multiplyScalar(R);
        helper.position.copy(p);
        helper.lookAt(p.clone().add(dir));
        helper.rotateZ(rnd() * TAU);
        const s = 0.45 + rnd() * 0.3;
        const geo = new DecalGeometry(proxy, p, helper.rotation, new THREE.Vector3(s, s, s));
        geo.translate(-p.x, -p.y, -p.z);
        const m = new THREE.Mesh(geo, mats[Math.floor(rnd() * 4)]!);
        m.position.copy(p);
        m.scale.setScalar(0.01);
        ball.add(m);
        decals.push({ m, born: t });
        if (decals.length > 16) {
          const old = decals.shift()!;
          ball.remove(old.m);
          old.m.geometry.dispose();
        }
      };
      const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
      let every = 0.7;
      return {
        scene,
        camera: cam,
        update(t) {
          ball.rotation.y = t * 0.6;
          ball.rotation.x = Math.sin(t * 0.3) * 0.4;
          ball.updateMatrixWorld();
          if (t >= next) {
            next = t + every;
            stamp(t);
          }
          const c1 = 1.70158;
          for (const d of decals) {
            const x = clamp((t - d.born) / 0.35, 0, 1);
            d.m.scale.setScalar(Math.max(0.01, 1 + (c1 + 1) * (x - 1) ** 3 + c1 * (x - 1) ** 2));
          }
        },
        resize(w, h) {
          const tn = Math.tan((cam.fov * Math.PI) / 360);
          const d = Math.max(1.85 / tn, 1.85 / (tn * (w / h)));
          cam.position.set(0, 0.2, d);
          cam.lookAt(0, 0, 0);
        },
        controls: [{ type: 'range', label: '붙이는 간격(초)', min: 0.2, max: 2, step: 0.1, value: 0.7, on: (v) => (every = v) }],
        dispose() {
          for (const d of decals) d.m.geometry.dispose();
          texs.forEach((t) => t.dispose());
          mats.forEach((m) => m.dispose());
          disposeScene(scene);
        },
      };
    },
  },

  i19: {
    kind: '3d',
    caption: '카메라가 숲을 지나가요 — 가까운 나무는 촘촘(초록), 멀수록 거친 모델(노랑 → 빨강)로 바뀌어 삼각형 수가 줄어요',
    make() {
      const scene = baseScene('#bfe6ff', '#eaf7ff');
      scene.fog = new THREE.Fog(0xeaf7ff, 18, 45);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 80), std(0x9fd88a, 0.95));
      ground.rotation.x = -Math.PI / 2;
      ground.position.z = -25;
      scene.add(ground);
      const foliage = [new THREE.IcosahedronGeometry(0.8, 4), new THREE.IcosahedronGeometry(0.8, 1), new THREE.IcosahedronGeometry(0.8, 0)];
      const trunk = new THREE.CylinderGeometry(0.12, 0.16, 0.8, 8);
      const trunkMat = std(0x8a5a3c, 0.8);
      const lvCols = [0x3fbf5f, 0xffc23a, 0xff5a4a];
      const matsCode = lvCols.map((c, i) => std(c, 0.7, 0, { flatShading: i > 0 }));
      const matsPlain = [0, 1, 2].map((i) => std(0x48b86a, 0.7, 0, { flatShading: i > 0 }));
      const lods: THREE.LOD[] = [];
      const fol: THREE.Mesh[][] = [];
      for (let i = 0; i < 16; i++) {
        for (const side of [-1, 1]) {
          const lod = new THREE.LOD();
          const meshes: THREE.Mesh[] = [];
          foliage.forEach((g, k) => {
            const grp = new THREE.Group();
            const f = new THREE.Mesh(g, matsCode[k]!);
            f.position.y = 1.2;
            const tr = new THREE.Mesh(trunk, trunkMat);
            tr.position.y = 0.4;
            grp.add(f, tr);
            meshes.push(f);
            lod.addLevel(grp, [0, 7, 14][k]!);
          });
          lod.position.set(side * (1.6 + (i % 3) * 0.4), 0, -i * 3);
          scene.add(lod);
          lods.push(lod);
          fol.push(meshes);
        }
      }
      const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 80);
      const hud = new Hud();
      let colorize = true;
      let tris = 0;
      return {
        scene,
        camera: cam,
        update(t) {
          const z = 6 - pingpong(t, 14) * 30;
          cam.position.set(Math.sin(t * 0.5) * 0.3, 1.7, z);
          cam.lookAt(0, 1, z - 10);
          fol.forEach((ms) => ms.forEach((m, k) => (m.material = colorize ? matsCode[k]! : matsPlain[k]!)));
        },
        render(r, w, h) {
          r.render(scene, cam);
          tris = r.info.render.triangles;
          hud.draw(r, w, h, `${w}x${h}${Math.round(tris / 500)}${colorize}`, (g) => {
            const s = fsz(w, h, 0.85);
            pill(g, s * 0.6, s * 0.6, `삼각형 ${tris.toLocaleString()}개`, s);
            if (colorize)
              ['촘촘', '중간', '거침'].forEach((n, i) => {
                pill(g, w - s * 0.6, s * 0.6 + i * s * 1.9, n, s * 0.85, ['#2f9f4f', '#d99a10', '#e0402f'][i], '#fff', 'right');
              });
          });
        },
        controls: [{ type: 'toggle', label: '단계 색 보기', value: true, on: (v) => (colorize = v) }],
        dispose() {
          foliage.forEach((g) => g.dispose());
          matsCode.forEach((m) => m.dispose());
          matsPlain.forEach((m) => m.dispose());
          disposeScene(scene);
          hud.dispose();
        },
      };
    },
  },

  i20: {
    kind: '3d',
    caption: '눈 · 입 · 눈썹 모양을 「기본 → 웃음 / 놀람」 사이로 섞어요 — 아래 막대가 섞는 비율 (모프 타깃)',
    make() {
      const scene = baseScene('#ffe4f0', '#fff8fb');
      const face = new THREE.Group();
      scene.add(face);
      const head = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), std(0xffd45a, 0.45));
      head.scale.set(1.08, 1, 0.92);
      face.add(head);
      const ink = new THREE.MeshStandardMaterial({ color: 0x3a1f2a, roughness: 0.4 });
      const mouthIn = new THREE.MeshStandardMaterial({ color: 0xc8344d, roughness: 0.5 });
      const C = (u: number): number => Math.cos(u * TAU);
      const S = (u: number): number => Math.sin(u * TAU);
      const mouth = loopGeo(
        [
          (u) => [0.3 * C(u), -0.03 * S(u) - 0.0],
          (u) => {
            const X = C(u);
            return u < 0.5 ? [0.38 * X, 0.05 - 0.07 * (1 - X * X)] : [0.38 * X, 0.05 - 0.3 * (1 - X * X)];
          },
          (u) => [0.15 * C(u), -0.06 + 0.2 * S(u)],
        ],
        48,
        0.05,
      );
      const eye = loopGeo(
        [
          (u) => [0.1 * C(u), 0.14 * S(u)],
          (u) => {
            const X = C(u);
            return u < 0.5 ? [0.13 * X, 0.08 * (1 - X * X)] : [0.13 * X, 0.08 * (1 - X * X) - 0.045];
          },
          (u) => [0.13 * C(u), 0.19 * S(u)],
        ],
        40,
        0.05,
      );
      const brow = loopGeo(
        [
          (u) => [0.14 * C(u), 0.025 * S(u)],
          (u) => [0.14 * C(u), 0.025 * S(u) + 0.04 * (1 - C(u) ** 2) + 0.03],
          (u) => [0.14 * C(u), 0.03 * S(u) + 0.06 * (1 - C(u) ** 2) + 0.12],
        ],
        32,
        0.04,
      );
      const parts: THREE.Mesh[] = [];
      const put = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number): THREE.Mesh => {
        const m = new THREE.Mesh(geo, mat);
        const z = Math.sqrt(Math.max(0, 1 - (x / 1.08) ** 2 - y * y)) * 0.92;
        m.position.set(x, y, z + 0.005);
        m.lookAt(x * 2.2, y * 2.2, z * 2.2 + 1.5);
        face.add(m);
        parts.push(m);
        return m;
      };
      put(mouth, mouthIn, 0, -0.38);
      put(eye, ink, -0.34, 0.15);
      put(eye, ink, 0.34, 0.15);
      put(brow, ink, -0.36, 0.42);
      put(brow, ink, 0.36, 0.42);
      for (const s of [-1, 1]) {
        const ck = new THREE.Mesh(new THREE.CircleGeometry(0.13, 24), new THREE.MeshBasicMaterial({ color: 0xff7aa0, transparent: true, opacity: 0.55 }));
        const z = Math.sqrt(1 - 0.58 ** 2 / 1.08 ** 2 - 0.13 ** 2) * 0.92;
        ck.position.set(s * 0.58, -0.13, z + 0.035);
        ck.lookAt(s * 0.58 * 2, -0.26, z * 2 + 1);
        face.add(ck);
      }
      const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
      const hud = new Hud();
      let auto = true;
      let smile = 0;
      let wow = 0;
      let manS = 0;
      let manW = 0;
      return {
        scene,
        camera: cam,
        update(t) {
          if (auto) {
            const P = 7;
            const p = (t % P) / P;
            const bump = (a: number, b: number): number => smooth((p - a) / 0.08) * (1 - smooth((p - b) / 0.08));
            smile = bump(0.1, 0.42);
            wow = bump(0.55, 0.88);
          } else {
            smile = manS;
            wow = manW;
          }
          for (const m of parts) {
            if (m.morphTargetInfluences) {
              m.morphTargetInfluences[0] = smile;
              m.morphTargetInfluences[1] = wow;
            }
          }
          face.rotation.y = Math.sin(t * 0.7) * 0.3;
          face.rotation.x = Math.sin(t * 0.5) * 0.08 - wow * 0.08;
          face.position.y = wow * 0.06;
        },
        resize(w, h) {
          const tn = Math.tan((cam.fov * Math.PI) / 360);
          const d = Math.max(1.5 / tn, 1.5 / (tn * (w / h)));
          cam.position.set(0, 0, d);
          cam.lookAt(0, -0.12, 0);
        },
        render(r, w, h) {
          r.render(scene, cam);
          hud.draw(r, w, h, `${w}x${h}${smile.toFixed(2)}${wow.toFixed(2)}`, (g) => {
            const s = fsz(w, h, 0.85);
            [
              ['웃음', smile, '#ff7a3c'],
              ['놀람', wow, '#4a7dff'],
            ].forEach(([n, v, c], i) => {
              const x = s * 0.7;
              const y = h - s * (3.6 - i * 1.7);
              g.fillStyle = '#5a3a4a';
              g.font = `700 ${s}px ${FONT}`;
              g.textBaseline = 'middle';
              g.textAlign = 'left';
              g.fillText(n as string, x, y);
              const bx = x + s * 2.6;
              const bw = Math.min(w * 0.3, s * 9);
              g.fillStyle = 'rgba(90,58,74,0.15)';
              g.beginPath();
              g.roundRect(bx, y - s * 0.4, bw, s * 0.8, s * 0.4);
              g.fill();
              g.fillStyle = c as string;
              g.beginPath();
              g.roundRect(bx, y - s * 0.4, Math.max(s * 0.8, bw * (v as number)), s * 0.8, s * 0.4);
              g.fill();
            });
          });
        },
        controls: [
          { type: 'toggle', label: '저절로', value: true, on: (v) => (auto = v) },
          { type: 'range', label: '웃음', min: 0, max: 1, step: 0.01, value: 0, on: (v) => ((auto = false), (manS = v)) },
          { type: 'range', label: '놀람', min: 0, max: 1, step: 0.01, value: 0, on: (v) => ((auto = false), (manW = v)) },
        ],
        dispose() {
          disposeScene(scene);
          hud.dispose();
        },
      };
    },
  },

  i21: {
    kind: '3d',
    caption: '용의 동작 여러 개를 0.6초씩 겹쳐 바꿔요 — 막대는 지금 섞이는 비율 (뚝 끊기지 않고 스르륵)',
    make() {
      const scene = baseScene('#2b2350', '#7a5a96');
      const glow = new THREE.PointLight(0xffb347, 5, 8);
      glow.position.set(0, 1.4, 1.6);
      scene.add(glow);
      const pile = coinPile();
      scene.add(pile);
      const cam = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
      const hud = new Hud();
      const NAMES: [string, string][] = [
        ['CharacterArmature|Flying_Idle', '날기'],
        ['CharacterArmature|Fast_Flying', '빨리 날기'],
        ['CharacterArmature|Yes', '끄덕'],
        ['CharacterArmature|Headbutt', '박치기'],
        ['CharacterArmature|No', '도리도리'],
      ];
      let mixer: THREE.AnimationMixer | null = null;
      let acts: THREE.AnimationAction[] = [];
      let holder: THREE.Object3D | null = null;
      let dead = false;
      let cur = 0;
      let lastK = -1;
      let fade = 0.6;
      loadDragon()
        .then((gl) => {
          if (dead) return;
          holder = placeDragon(gl, 3.3);
          holder.position.y = 0.1;
          scene.add(holder);
          mixer = new THREE.AnimationMixer(holder.children[0]!);
          acts = NAMES.map(([n]) => {
            const c = THREE.AnimationClip.findByName(gl.animations, n) ?? gl.animations[0]!;
            const a = mixer!.clipAction(c);
            a.play();
            a.setEffectiveWeight(0);
            return a;
          });
          acts[0]!.setEffectiveWeight(1);
        })
        .catch(() => undefined);
      let bars = '';
      return {
        scene,
        camera: cam,
        update(t, dt) {
          if (mixer && acts.length) {
            const k = Math.floor(t / 2.4);
            if (k !== lastK) {
              lastK = k;
              const nx = k % acts.length;
              if (nx !== cur) {
                const to = acts[nx]!;
                to.reset();
                to.setEffectiveWeight(1);
                to.play();
                acts[cur]!.crossFadeTo(to, fade, false);
                cur = nx;
              }
            }
            mixer.update(dt);
            bars = acts.map((a) => a.getEffectiveWeight().toFixed(2)).join(',');
          }
          if (holder) holder.rotation.y = 0.6 + Math.sin(t * 0.3) * 0.4;
        },
        resize(w, h) {
          const tn = Math.tan((cam.fov * Math.PI) / 360);
          const d = Math.max(2.3 / tn, 2.5 / (tn * (w / h)));
          cam.position.set(-d * 0.25, d * 0.35, d);
          cam.lookAt(0.2, 1.25, 0);
        },
        render(r, w, h) {
          r.render(scene, cam);
          hud.draw(r, w, h, `${w}x${h}${bars}`, (g) => {
            const s = fsz(w, h, 0.75);
            const ws = bars ? bars.split(',').map(Number) : [];
            NAMES.forEach(([, n], i) => {
              const y = s * 0.7 + i * s * 1.7;
              const v = ws[i] ?? 0;
              g.fillStyle = 'rgba(0,0,0,0.35)';
              g.beginPath();
              g.roundRect(s * 0.6, y, s * 9, s * 1.3, s * 0.4);
              g.fill();
              g.fillStyle = `rgba(255,200,70,${0.35 + v * 0.65})`;
              g.beginPath();
              g.roundRect(s * 0.6, y, Math.max(s * 0.5, s * 9 * v), s * 1.3, s * 0.4);
              g.fill();
              g.fillStyle = '#fff';
              g.font = `700 ${s * 0.85}px ${FONT}`;
              g.textBaseline = 'middle';
              g.textAlign = 'left';
              g.fillText(`${n} ${Math.round(v * 100)}%`, s * 1, y + s * 0.67);
            });
          });
        },
        controls: [{ type: 'range', label: '섞는 시간(초)', min: 0, max: 2, step: 0.1, value: 0.6, on: (v) => (fade = v) }],
        dispose() {
          dead = true;
          mixer?.stopAllAction();
          disposeScene(scene);
          hud.dispose();
        },
      };
    },
  },

  /* ═════════════ 원리 설명 · 구조 ═════════════ */
  i35: {
    kind: 'dom',
    caption: '평면 하나로 원뿔 · 속 빈 관 · 겹친 입체를 함께 잘라요 — 잘린 면은 스텐실로 평평하게 메움 (원뿔 단면: 원 → 타원 → 포물선 → 쌍곡선)',
    make(box) {
      ownAcquire();
      const { g, fit } = boxCanvas(box);
      const scene = baseScene('#dff0ff', '#ffffff');
      // 자르기 평면: n·p ≤ c 쪽(아래)이 남고 위쪽이 잘려 나간다. 모든 물체 중심이 x = 0 줄에 있어 같은 평면이 셋을 다 지난다
      // three 의 재질 clippingPlanes 는 compileAsync 가 평면 수를 모른 채 구워(전역 상태만 봄) 첫 장면에 1.2초 다시 굽는다 → 셰이더에 직접 넣음
      const keep = { value: new THREE.Vector4(0, 1, 0, 0) };
      const gone = { value: new THREE.Vector4(0, -1, 0, 0) };
      // 단면 무늬 (빗금) — 같은 그림을 스텐실 판 · BackSide 둘 다에 쓴다
      const hc = document.createElement('canvas');
      hc.width = hc.height = 64;
      const hg = hc.getContext('2d')!;
      // 가로 띠를 45° 돌려 깐다 — 대각선을 그리면 칸 이음매에 끊긴 자국이 남는다
      hg.fillStyle = '#ff7aa6';
      hg.fillRect(0, 0, 64, 64);
      hg.fillStyle = '#c8124f';
      hg.fillRect(0, 0, 64, 14);
      const hatch = new THREE.CanvasTexture(hc);
      hatch.colorSpace = THREE.SRGBColorSpace;
      hatch.wrapS = hatch.wrapT = THREE.RepeatWrapping;
      hatch.anisotropy = 4;
      hatch.center.set(0.5, 0.5);
      hatch.rotation = Math.PI / 4;
      const hatchObj = hatch.clone();
      hatchObj.repeat.set(6, 6);
      // 물체: 원뿔 · 속 빈 관(닫힌 고리 돌출) · 겹친 공 + 상자 — 모두 닫힌 껍데기여야 스텐실 셈이 맞는다
      const ring = new THREE.Shape();
      ring.absarc(0, 0, 0.7, 0, TAU, false);
      const hole = new THREE.Path();
      hole.absarc(0, 0, 0.4, 0, TAU, true);
      ring.holes.push(hole);
      const tubeGeo = new THREE.ExtrudeGeometry(ring, { depth: 1.9, bevelEnabled: false, curveSegments: 64 }).rotateX(-Math.PI / 2).translate(0, -1.0, 0);
      const parts: { geo: THREE.BufferGeometry; color: number; pos: [number, number, number]; rotY?: number }[] = [
        { geo: tubeGeo, color: 0x5ab0ff, pos: [0, 0, 2.35] },
        { geo: new THREE.ConeGeometry(1, 2, 96, 1, false), color: 0xffb347, pos: [0, 0, 0] },
        { geo: new THREE.SphereGeometry(0.72, 48, 32), color: 0x4fd1a0, pos: [-0.05, -0.1, -2.15] },
        { geo: new THREE.BoxGeometry(0.95, 0.95, 0.95), color: 0xb07cff, pos: [0.2, -0.45, -2.75], rotY: 0.55 },
      ];
      const stencilMeshes: THREE.Mesh[] = [];
      const backMeshes: THREE.Mesh[] = [];
      // 뒷면 +1 · 앞면 −1 (색 · 깊이 안 씀, 깊이 시험 끔) — 잘린 물체 속을 지나는 화면 점만 0 이 아닌 값이 남는다
      const stBack = planeClip(new THREE.MeshBasicMaterial({ side: THREE.BackSide, colorWrite: false, depthWrite: false, depthTest: false, stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilFail: THREE.IncrementWrapStencilOp, stencilZFail: THREE.IncrementWrapStencilOp, stencilZPass: THREE.IncrementWrapStencilOp }), keep);
      const stFront = planeClip(new THREE.MeshBasicMaterial({ side: THREE.FrontSide, colorWrite: false, depthWrite: false, depthTest: false, stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilFail: THREE.DecrementWrapStencilOp, stencilZFail: THREE.DecrementWrapStencilOp, stencilZPass: THREE.DecrementWrapStencilOp }), keep);
      // 비교용 옛 방식: 잘린 물체 안쪽 면(BackSide)을 단면 색으로
      const backMat = planeClip(new THREE.MeshBasicMaterial({ map: hatchObj, side: THREE.BackSide }), keep);
      const ghostMat = planeClip(new THREE.MeshStandardMaterial({ color: 0x9fb4d8, transparent: true, opacity: 0.13, depthWrite: false }), gone);
      for (const p of parts) {
        const main = new THREE.Mesh(p.geo, planeClip(std(p.color, 0.42, 0.05), keep));
        main.renderOrder = 3;
        const sb = new THREE.Mesh(p.geo, stBack);
        const sf = new THREE.Mesh(p.geo, stFront);
        sb.renderOrder = sf.renderOrder = 1;
        const bm = new THREE.Mesh(p.geo, backMat);
        bm.renderOrder = 3;
        const gh = new THREE.Mesh(p.geo, ghostMat);
        gh.renderOrder = 6;
        for (const m of [main, sb, sf, bm, gh]) {
          m.position.set(...p.pos);
          m.rotation.y = p.rotY ?? 0;
          scene.add(m);
        }
        stencilMeshes.push(sb, sf);
        backMeshes.push(bm);
      }
      // 단면 판: 자르기 평면 위의 큰 판을 스텐실 ≠ 0 인 곳에만 그리고, 그린 자리는 0 으로 되돌린다
      const capW = 3.6;
      const capH = 7.6;
      const capTex = hatch.clone();
      capTex.repeat.set(4.5, 4.5);
      const capMat = new THREE.MeshBasicMaterial({ map: capTex, stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc, stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp });
      // 판 UV 를 세계 길이(단위)로 — 늘이기가 고르게 되어야 무늬를 45° 로 돌려도 비뚤지 않다
      const capGeo = new THREE.PlaneGeometry(capW, capH);
      const uvA = capGeo.attributes['uv'] as THREE.BufferAttribute;
      for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getX(i) * capW, uvA.getY(i) * capH);
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.renderOrder = 2;
      scene.add(cap);
      // 평면 테두리 (보이는 칼)
      const frame = new THREE.Group();
      const pv = new THREE.Mesh(new THREE.PlaneGeometry(capW, capH), new THREE.MeshBasicMaterial({ color: 0x7ab8ff, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
      pv.renderOrder = 7;
      const pvEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(capW, capH)), new THREE.LineBasicMaterial({ color: 0x4a7dff, transparent: true, opacity: 0.7 }));
      frame.add(pv, pvEdge);
      scene.add(frame);
      // 원뿔 단면 곡선 (모선과 평면의 교점)
      const curvePos = new Float32Array(200 * 3);
      const curveGeo = new THREE.BufferGeometry();
      curveGeo.setAttribute('position', new THREE.BufferAttribute(curvePos, 3));
      const curve = new THREE.Line(curveGeo, new THREE.LineBasicMaterial({ color: 0x8a0a3a }));
      curve.renderOrder = 8;
      scene.add(curve);
      const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
      const camDir = new THREE.Vector3(1, 0.78, 0.34).normalize();
      const look = new THREE.Vector3(0, -0.2, 0);
      let name = '';
      let beta = 0;
      let auto = true;
      let manual = 30;
      let compare = false;
      let useStencil = true;
      const n = new THREE.Vector3();
      const p0 = new THREE.Vector3(0, -0.25, 0);
      const apex = new THREE.Vector3(0, 1, 0);
      const dv = new THREE.Vector3();
      const u = new THREE.Vector3();
      const zAxis = new THREE.Vector3(0, 0, 1);
      const basis = new THREE.Matrix4();
      const pts: THREE.Vector3[] = [];
      const setMode = (stencil: boolean): void => {
        for (const m of stencilMeshes) m.visible = stencil;
        cap.visible = stencil;
        for (const m of backMeshes) m.visible = !stencil;
      };
      const fitCam = (): void => {
        const tn = Math.tan((cam.fov * Math.PI) / 360);
        const d = Math.max(2.0 / tn, 3.9 / (tn * cam.aspect));
        cam.position.copy(look).addScaledVector(camDir, d);
        cam.lookAt(look);
      };
      const labels: [string, THREE.Vector3][] = [
        ['속 빈 관', new THREE.Vector3(0, -1.15, 2.35)],
        ['원뿔', new THREE.Vector3(0, -1.15, 0)],
        ['겹친 공 + 상자', new THREE.Vector3(0, -1.15, -2.45)],
      ];
      const sp = new THREE.Vector3();
      const tagLabels = (x0: number, w: number, h: number, s: number): void => {
        for (const [txt, p] of labels) {
          sp.copy(p).project(cam);
          pill(g, x0 + ((sp.x + 1) / 2) * w, ((1 - sp.y) / 2) * h + s * 0.4, txt, s * 0.78, 'rgba(255,255,255,0.86)', '#1d2a55', 'center');
        }
      };
      return {
        update(t) {
          const { w, h, dpr } = fit();
          beta = auto ? pingpong(t, 12) * 80 : manual;
          const b = (beta * Math.PI) / 180;
          n.set(Math.sin(b), Math.cos(b), 0);
          const c = n.dot(p0);
          keep.value.set(n.x, n.y, n.z, c);
          gone.value.set(-n.x, -n.y, -n.z, -c);
          // 판 방향: 가로 u = 평면 안에서 z 에 수직, 세로 = z, 법선 = n
          u.crossVectors(zAxis, n).normalize();
          basis.makeBasis(u, zAxis, n);
          // 판을 평면 위에 놓되 위로(n 쪽) 아주 조금 — 잘린 면의 깊이와 겹쳐 지글거리지 않게
          for (const o of [cap, frame]) {
            o.quaternion.setFromRotationMatrix(basis);
            o.position.copy(p0);
          }
          cap.position.addScaledVector(n, 0.0005);
          // 원뿔 단면 곡선: 꼭짓점에서 내려오는 모선마다 평면과 만나는 점
          pts.length = 0;
          for (let i = 0; i < 160; i++) {
            const ph = (i / 160) * TAU;
            dv.set(Math.cos(ph), -2, Math.sin(ph));
            const den = n.dot(dv);
            if (Math.abs(den) < 1e-6) continue;
            const s = (c - n.dot(apex)) / den;
            if (s >= 0 && s <= 1) pts.push(apex.clone().addScaledVector(dv, s).addScaledVector(n, 0.004));
          }
          let k = 0;
          if (pts.length) {
            const ctr = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
            const ang = (p: THREE.Vector3): number => Math.atan2(p.z - ctr.z, (p.x - ctr.x) * u.x + (p.y - ctr.y) * u.y);
            pts.sort((a, b2) => ang(a) - ang(b2));
            for (const p of pts) {
              if (k >= 199) break;
              curvePos.set([p.x, p.y, p.z], k * 3);
              k++;
            }
            if (beta < 61) {
              curvePos.set([pts[0]!.x, pts[0]!.y, pts[0]!.z], k * 3);
              k++;
            }
          }
          curveGeo.setDrawRange(0, k);
          curveGeo.attributes['position']!.needsUpdate = true;
          name = beta < 2 ? '원' : beta < 61 ? '타원' : beta < 65.5 ? '포물선' : '쌍곡선';
          scene.updateMatrixWorld();
          g.setTransform(dpr, 0, 0, dpr, 0, 0);
          g.clearRect(0, 0, w, h);
          const warm = glWarm.get(scene) === 'done';
          const pre = (stencil: boolean) => (): void => {
            // 데우는 동안은 두 방식 다 보이게 — 셰이더를 한 번에 굽는다
            if (warm) setMode(stencil);
            else {
              for (const m of [...stencilMeshes, ...backMeshes, cap]) m.visible = true;
            }
            fitCam();
          };
          const s = fsz(w, h, 0.9);
          if (compare) {
            const hw = Math.floor(w / 2);
            glPaint(g, dpr, scene, cam, 0, 0, hw, h, pre(false));
            if (warm) tagLabels(0, hw, h, s);
            glPaint(g, dpr, scene, cam, hw, 0, w - hw, h, pre(true));
            if (warm) tagLabels(hw, w - hw, h, s);
            g.fillStyle = 'rgba(255,255,255,0.85)';
            g.fillRect(hw - 1, 0, 2, h);
            pill(g, s * 0.6, s * 0.6, 'BackSide 색칠 (틀림)', s, 'rgba(120,130,150,0.9)');
            pill(g, hw + s * 0.6, s * 0.6, '스텐실 단면', s, 'rgba(212,20,90,0.92)');
            pill(g, w / 2, h - s * 2.2, '겹친 곳 · 빗금 모양을 비교해 보세요', s * 0.85, 'rgba(30,40,80,0.75)', '#fff', 'center');
          } else {
            glPaint(g, dpr, scene, cam, 0, 0, w, h, pre(useStencil));
            if (warm) tagLabels(0, w, h, s);
            pill(g, s * 0.6, s * 0.6, `기울기 ${Math.round(beta)}°`, s * 0.95);
            pill(g, w - s * 0.6, s * 0.6, `원뿔 단면: ${name}`, s * 1.1, 'rgba(212,20,90,0.92)', '#fff', 'right', TITLE);
            pill(g, s * 0.6, s * 2.5, useStencil ? '스텐실 단면 (뒷면 +1 · 앞면 −1)' : 'BackSide 색칠', s * 0.8, 'rgba(255,255,255,0.85)', '#1d2a55');
          }
        },
        controls: [
          { type: 'toggle', label: '저절로 기울이기', value: true, on: (v) => (auto = v) },
          { type: 'range', label: '평면 기울기(°)', min: 0, max: 85, step: 1, value: 30, on: (v) => ((auto = false), (manual = v)) },
          { type: 'toggle', label: 'BackSide 방식과 나란히', value: false, on: (v) => (compare = v) },
          { type: 'toggle', label: '스텐실 단면 (끄면 BackSide)', value: true, on: (v) => (useStencil = v) },
        ],
        dispose() {
          disposeScene(scene);
          hatch.dispose();
          ownRelease();
          box.innerHTML = '';
        },
      };
    },
  },

  i36: {
    kind: '3d',
    caption: '톱니 상자를 조립 순서대로 분해했다 다시 조립해요 — 부품은 끼우는 축(점선)을 따라서만 움직이고, 다 조이면 손잡이가 톱니를 돌려요 (분해도)',
    make() {
      const scene = baseScene('#e6ecff', '#fbfcff');
      const root = new THREE.Group();
      scene.add(root);
      const hud = new Hud();
      // ── 치수 (단위 = cm 대신 한 칸) — 톱니 모듈 0.1: 큰 톱니 18개(피치 반지름 0.9) · 작은 톱니 10개(0.5) → 축 사이 1.4
      const BX = -0.55;
      const SX = 0.85;
      const POSTS: [number, number][] = [
        [-1.38, -0.78],
        [1.38, -0.78],
        [-1.38, 0.78],
        [1.38, 0.78],
      ];
      const SHAFT_R = 0.08;
      const COVER_Y = 0.82;
      const COVER_T = 0.1;
      const mDark = std(0x4a5a8a, 0.5, 0.15);
      const mSteel = std(0xe4e9f2, 0.3, 0.35);
      const mPost = std(0xb9c2d3, 0.35, 0.3);
      const mScrew = std(0x8a93a6, 0.35, 0.35);
      const mBrass = std(0xffc23a, 0.35, 0.35);
      const mCopper = std(0xff8a5c, 0.35, 0.3);
      const mRed = std(0xff4f7b, 0.35, 0.1);
      const mHole = std(0x161b29, 0.8, 0.2);

      // 바닥 판 + 축받이 2 + 기둥 4
      const base = new THREE.Group();
      const plate = new THREE.Mesh(new RoundedBoxGeometry(3.2, 0.2, 2.0, 3, 0.06), mDark);
      base.add(plate);
      for (const x of [BX, SX]) {
        const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.14, 28), mPost);
        boss.position.set(x, 0.17, 0);
        const hole = new THREE.Mesh(new THREE.CircleGeometry(SHAFT_R + 0.01, 20).rotateX(-Math.PI / 2), mHole);
        hole.position.set(x, 0.241, 0);
        base.add(boss, hole);
      }
      for (const [x, z] of POSTS) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, COVER_Y - 0.1, 6), mPost);
        post.position.set(x, 0.1 + (COVER_Y - 0.1) / 2, z);
        const hole = new THREE.Mesh(new THREE.CircleGeometry(0.05, 16).rotateX(-Math.PI / 2), mHole);
        hole.position.set(x, COVER_Y + 0.001, z);
        base.add(post, hole);
      }
      root.add(base);

      // 단계 = 조립 순서. off = 펼친 자리 (제자리에서 축을 따라)
      type Part = { o: THREE.Object3D; home: THREE.Vector3 };
      interface Step {
        name: string;
        how: string;
        off: THREE.Vector3;
        parts: Part[];
        label: THREE.Vector3;
        side: 1 | -1;
        spin?: number;
      }
      const steps: Step[] = [];
      const step = (name: string, how: string, off: [number, number, number], label: [number, number, number], side: 1 | -1, spin?: number): Step => {
        const s: Step = { name, how, off: new THREE.Vector3(...off), parts: [], label: new THREE.Vector3(...label), side, spin };
        steps.push(s);
        return s;
      };
      const put = (s: Step, o: THREE.Object3D, x: number, y: number, z: number): void => {
        o.position.set(x, y, z);
        root.add(o);
        s.parts.push({ o, home: new THREE.Vector3(x, y, z) });
      };

      // ① 축 2개 — 아래에서 축받이 구멍으로 (밑에 턱)
      const sShaft = step('축 2개', '바닥 아래에서 축받이 구멍으로 밀어 올리기', [0, -1.35, 0], [SX + 0.35, 0.5, 0], 1);
      const shaftGeo = new THREE.CylinderGeometry(SHAFT_R, SHAFT_R, 1.25, 20);
      for (const x of [BX, SX]) {
        const g = new THREE.Group();
        const rod = new THREE.Mesh(shaftGeo, mSteel);
        rod.position.y = 0.625;
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.05, 24), mSteel);
        collar.position.y = -0.025;
        g.add(rod, collar);
        put(sShaft, g, x, -0.1, 0);
      }
      // ② 와셔 2개
      const sWasher = step('와셔 2개', '축에 끼워 축받이 위로 내리기', [0, 0.5, 0], [SX + 0.35, 0.26, 0], 1);
      const washerGeo = new THREE.LatheGeometry(
        [
          [SHAFT_R + 0.005, -0.02],
          [0.17, -0.02],
          [0.17, 0.02],
          [SHAFT_R + 0.005, 0.02],
          [SHAFT_R + 0.005, -0.02],
        ].map(([r, y]) => new THREE.Vector2(r, y)),
        32,
      );
      for (const x of [BX, SX]) put(sWasher, new THREE.Mesh(washerGeo, mSteel), x, 0.26, 0);
      // ③ 톱니 2개 — 축에 끼우며 이를 맞물림 (작은 톱니가 내려오며 돌아 이가 맞는다)
      const sGear = step('톱니바퀴 2개', '축에 끼우며 이를 맞물리기', [0, 1.05, 0], [SX + 0.62, 0.36, 0], 1);
      const big = new THREE.Mesh(gearGeo(18, 0.1, 0.16, SHAFT_R + 0.006), mBrass);
      big.rotation.x = -Math.PI / 2;
      const bigG = new THREE.Group();
      bigG.add(big);
      put(sGear, bigG, BX, 0.36, 0);
      const small = new THREE.Mesh(gearGeo(10, 0.1, 0.16, SHAFT_R + 0.006), mCopper);
      small.rotation.x = -Math.PI / 2;
      const smallG = new THREE.Group();
      smallG.add(small);
      put(sGear, smallG, SX, 0.36, 0);
      // ④ 덮개 — 축 구멍 2 · 나사 구멍 4 (투명 아크릴)
      const sCover = step('덮개', '축과 기둥 구멍에 맞춰 내리기', [0, 1.6, 0], [1.62, COVER_Y + 0.05, 0], 1);
      const cs = new THREE.Shape();
      {
        const w = 1.6;
        const d = 1.0;
        const r = 0.16;
        cs.moveTo(-w + r, -d);
        cs.lineTo(w - r, -d);
        cs.quadraticCurveTo(w, -d, w, -d + r);
        cs.lineTo(w, d - r);
        cs.quadraticCurveTo(w, d, w - r, d);
        cs.lineTo(-w + r, d);
        cs.quadraticCurveTo(-w, d, -w, d - r);
        cs.lineTo(-w, -d + r);
        cs.quadraticCurveTo(-w, -d, -w + r, -d);
        const hole = (x: number, y: number, rr: number): void => {
          const p = new THREE.Path();
          p.absarc(x, y, rr, 0, TAU, true);
          cs.holes.push(p);
        };
        for (const x of [BX, SX]) hole(x, 0, SHAFT_R + 0.02);
        for (const [x, z] of POSTS) hole(x, -z, 0.06);
      }
      const coverGeo = new THREE.ExtrudeGeometry(cs, { depth: COVER_T, bevelEnabled: false, curveSegments: 12 }).rotateX(-Math.PI / 2);
      const cover = new THREE.Group();
      cover.add(new THREE.Mesh(coverGeo, new THREE.MeshPhysicalMaterial({ color: 0xa8d8ff, transparent: true, opacity: 0.32, roughness: 0.08, depthWrite: false })));
      cover.add(new THREE.LineSegments(new THREE.EdgesGeometry(coverGeo, 30), new THREE.LineBasicMaterial({ color: 0x3f7fc0, transparent: true, opacity: 0.85 })));
      put(sCover, cover, 0, COVER_Y, 0);
      // ⑤ 나사 4개 — 나사산 (돌며 박힌다)
      const sScrew = step('나사 4개', '덮개 구멍으로 돌려 조이기', [0, 2.05, 0], [1.62, COVER_Y + 0.4, 0.78], 1, TAU * 6);
      const prof: [number, number][] = [[0, -0.66], [0.035, -0.68]];
      for (let y = -0.64; y < -0.04; y += 0.05) prof.push([0.052, y], [0.038, y + 0.025]);
      prof.push([0.045, -0.02], [0.045, 0], [0.11, 0], [0.11, 0.035], [0.095, 0.07], [0.06, 0.085], [0, 0.088]);
      const screwGeo = new THREE.LatheGeometry(
        prof.map(([r, y]) => new THREE.Vector2(r, y)),
        24,
      );
      const slotGeo = new THREE.BoxGeometry(0.17, 0.03, 0.03);
      for (const [x, z] of POSTS) {
        const g = new THREE.Group();
        const sc = new THREE.Mesh(screwGeo, mScrew);
        const slot = new THREE.Mesh(slotGeo, mHole);
        slot.position.y = 0.08;
        const slot2 = slot.clone();
        slot2.rotation.y = Math.PI / 2;
        g.add(sc, slot, slot2);
        put(sScrew, g, x, COVER_Y + COVER_T, z);
      }
      // ⑥ 손잡이 + 축 끝 마개
      const sCrank = step('손잡이 · 마개', '축 끝에 끼우기', [0, 1.75, 0], [BX - 0.35, 1.1, 0], -1);
      const crank = new THREE.Group();
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.16, 24), mDark);
      hub.position.y = 0.08;
      const arm = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.06, 0.13, 2, 0.025), mDark);
      arm.position.set(0.31, 0.13, 0);
      const knobStem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.18, 12), mSteel);
      knobStem.position.set(0.58, 0.24, 0);
      const knob = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.14, 4, 14), mRed);
      knob.position.set(0.58, 0.4, 0);
      crank.add(hub, arm, knobStem, knob);
      crank.rotation.y = Math.PI;
      put(sCrank, crank, BX, COVER_Y + COVER_T + 0.02, 0);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.1, 6), mDark);
      put(sCrank, cap, SX, COVER_Y + COVER_T + 0.07, 0);

      // 끼우는 축 (점선) — 축 2 · 나사 4
      const guideMat = new THREE.LineDashedMaterial({ color: 0x4a5a8a, dashSize: 0.07, gapSize: 0.06, transparent: true, opacity: 0 });
      const axes: [number, number, number, number][] = [
        [BX, 0, -1.55, 3.0],
        [SX, 0, -1.55, 2.4],
        ...POSTS.map(([x, z]) => [x, z, 0.85, 3.15] as [number, number, number, number]),
      ];
      for (const [x, z, y0, y1] of axes) {
        const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, y0, z), new THREE.Vector3(x, y1, z)]), guideMat);
        l.computeLineDistances();
        root.add(l);
      }

      const N = steps.length;
      const st = steps.map(() => 0);
      let auto = true;
      let manual = 0;
      let u = 0;
      let lastU = 0;
      let assembling = true;
      let spin = 0;
      let lastT = 0;
      let aspect = 1.6;
      const HOLD0 = 3.2;
      const DIS = N * 0.55;
      const HOLD1 = 2.6;
      const ASM = N * 1.0;
      const CYCLE = HOLD0 + DIS + HOLD1 + ASM;
      const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
      const v = new THREE.Vector3();
      const proj = (p: THREE.Vector3, w: number, h: number): [number, number] => {
        v.copy(p).applyMatrix4(root.matrixWorld).project(cam);
        return [(v.x * 0.5 + 0.5) * w, (1 - (v.y * 0.5 + 0.5)) * h];
      };
      return {
        scene,
        camera: cam,
        update(t) {
          const dt = Math.min(0.1, Math.max(0, t - lastT));
          lastT = t;
          if (auto) {
            const T = t % CYCLE;
            if (T < HOLD0) u = 0;
            else if (T < HOLD0 + DIS) u = ((T - HOLD0) / DIS) * N;
            else if (T < HOLD0 + DIS + HOLD1) u = N;
            else u = N * (1 - (T - HOLD0 - DIS - HOLD1) / ASM);
          } else u = manual * N;
          if (u !== lastU) assembling = u < lastU;
          lastU = u;
          // 분해는 마지막 단계부터: 손잡이 → 나사 → 덮개 → 톱니 → 와셔 → 축
          steps.forEach((s, i) => {
            const f = smooth(u - (N - 1 - i));
            st[i] = f;
            for (const p of s.parts) p.o.position.copy(p.home).addScaledVector(s.off, f);
          });
          // 나사: 올라가는 만큼 돈다 (나사산을 따라)
          const fs = st[steps.indexOf(sScrew)]!;
          for (const p of sScrew.parts) p.o.rotation.y = -fs * (sScrew.spin ?? 0);
          // 다 조였을 때만 손잡이가 돌고 톱니가 맞물려 돈다 (잇수 18 : 10)
          if (u < 0.001) spin += dt * 0.9;
          const fg = st[steps.indexOf(sGear)]!;
          big.rotation.z = spin;
          small.rotation.z = (-spin * 18) / 10 + Math.PI / 10 + fg * 0.9;
          crank.rotation.y = Math.PI + spin;
          guideMat.opacity = clamp(u * 1.2, 0, 1) * 0.75;
          root.rotation.y = Math.sin(t * 0.25) * 0.35 + 0.25;
          // 카메라: 다 펼친 모습이 들어오게 고정 (조금씩만 다가감)
          const e = smooth(u / N);
          const tn = Math.tan((cam.fov * Math.PI) / 360);
          const d = Math.max(3.25 / tn, 2.7 / (tn * aspect)) * lerp(0.9, 1, e);
          const ty = lerp(0.75, 0.85, e);
          cam.position.set(0, ty + d * 0.42, d);
          cam.lookAt(0, ty, 0);
        },
        resize(w, h) {
          aspect = w / h;
        },
        render(r, w, h) {
          r.render(scene, cam);
          root.updateMatrixWorld();
          const S = fsz(w, h);
          const j = Math.min(N - 1, Math.floor(u));
          const i = N - 1 - j;
          const moving = u > 0.001 && u < N - 0.001;
          const exploded = u >= N - 0.001;
          const labels = exploded
            ? steps.map((s, k) => {
                const at = s.label.clone().addScaledVector(s.off, st[k]!);
                const [x, y] = proj(at, w, h);
                return { k, s, x, y };
              })
            : [];
          const key = `${w}x${h}|${moving ? `${i}${assembling}` : exploded ? labels.map((l) => `${l.x | 0},${l.y | 0}`).join(';') : 'done'}`;
          hud.draw(r, w, h, key, (g) => {
            if (moving) {
              const s = steps[i]!;
              pill(g, S * 0.6, S * 0.6, `${assembling ? '조립' : '분해'} ${i + 1}/${N} · ${s.name} — ${assembling ? s.how : '빼기'}`, S * 0.8);
            } else if (exploded) {
              pill(g, S * 0.6, S * 0.6, `분해도 · 부품 ${N}종 — 번호 = 조립 순서`, S * 0.8);
              for (const l of labels) {
                const t = `${l.k + 1}. ${l.s.name}`;
                g.font = `700 ${S * 0.72}px ${FONT}`;
                const tw = g.measureText(t).width + S * 0.72 * 1.1;
                const gx = l.s.side > 0 ? l.x + S * 1.6 : l.x - S * 1.6 - tw;
                g.strokeStyle = 'rgba(40,52,90,0.75)';
                g.lineWidth = 1.5;
                g.beginPath();
                g.moveTo(l.x, l.y);
                g.lineTo(l.s.side > 0 ? gx : gx + tw, l.y);
                g.stroke();
                g.fillStyle = '#28345a';
                g.beginPath();
                g.arc(l.x, l.y, 3, 0, TAU);
                g.fill();
                pill(g, gx, l.y - S * 0.72 * 0.825, t, S * 0.72, 'rgba(255,255,255,0.94)', '#1d2747');
              }
            } else {
              pill(g, S * 0.6, S * 0.6, '다 조립됨 — 손잡이를 돌리면 큰 톱니 1바퀴에 작은 톱니 1.8바퀴', S * 0.8);
            }
          });
        },
        controls: [
          { type: 'toggle', label: '저절로', value: true, on: (x) => (auto = x) },
          { type: 'range', label: '조립 ↔ 분해 (순서대로)', min: 0, max: 1, step: 0.005, value: 0, on: (x) => ((auto = false), (manual = x)) },
        ],
        dispose() {
          disposeScene(scene);
          hud.dispose();
        },
      };
    },
  },

  i37: {
    kind: '3d',
    caption: '각도 θ 하나로 모든 부품 자리를 계산 — 피스톤 x = r·cosθ + √(L² − r²sin²θ), 인벌류트 톱니 16 : 32 → 캠은 2바퀴에 1바퀴, 캠 모양 r(φ) 이 밀대를 올린다',
    make() {
      const scene = baseScene('#e3ecff', '#fafcff');
      const eng = makeEngine({ valves: false });
      eng.root.position.set(-2.3, -1.35, 0);
      eng.root.scale.setScalar(0.85);
      scene.add(eng.root);
      // 톱니: 모듈 0.08, 16 : 32 (잇수 17 아래는 뿌리가 깎이는 언더컷 — 16 은 이끝을 줄이지 않아도 맞물림 간섭이 없는 경계)
      const M = 0.07;
      const Z1 = 16;
      const Z2 = 32;
      const r1 = (M * Z1) / 2;
      const r2 = (M * Z2) / 2;
      const gy = -0.32;
      const g1 = new THREE.Mesh(involuteGearGeo(Z1, M, 0.2), std(0x4aa8ff, 0.35, 0.5));
      const g2 = new THREE.Mesh(involuteGearGeo(Z2, M, 0.2), std(0xffc23a, 0.3, 0.7));
      g1.position.set(0.1, gy, 0);
      g2.position.set(0.1 + r1 + r2, gy, 0);
      const axleGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.5, 20).rotateX(Math.PI / 2);
      const axleMat = std(0xc9d2de, 0.25, 0.85);
      for (const g of [g1, g2]) {
        const ax = new THREE.Mesh(axleGeo, axleMat);
        ax.position.copy(g.position);
        scene.add(ax);
      }
      const dotGeo = new THREE.SphereGeometry(0.06, 12, 8);
      const dotMat = new THREE.MeshBasicMaterial({ color: 0xff3355 });
      const d1 = new THREE.Mesh(dotGeo, dotMat);
      d1.position.set(r1 * 0.62, 0, 0.12);
      g1.add(d1);
      scene.add(g1, g2);
      // 캠: 큰 톱니 축 앞에 붙어 같이 돈다 (반 빠르기 = 4행정 엔진의 캠축)
      const R0 = 0.4;
      const LIFT = 0.3;
      const camS = new THREE.Shape();
      const NC = 180;
      for (let i = 0; i < NC; i++) {
        const a = (i / NC) * TAU;
        const rr = camRadius(a, R0, LIFT);
        if (i) camS.lineTo(rr * Math.cos(a), rr * Math.sin(a));
        else camS.moveTo(rr * Math.cos(a), rr * Math.sin(a));
      }
      const camHole = new THREE.Path();
      camHole.absarc(0, 0, 0.1, 0, TAU, true);
      camS.holes.push(camHole);
      const camGeo = new THREE.ExtrudeGeometry(camS, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelOffset: -0.012, bevelSegments: 2, curveSegments: 8 });
      camGeo.translate(0, 0, 0.17);
      const cam3 = new THREE.Mesh(camGeo, std(0xff6b8b, 0.35, 0.3));
      g2.add(cam3);
      // 납작 밀대(태핏) + 막대 + 안내 고리 + 용수철 — 캠 윤곽에서 가장 높은 점에 밀대 밑면이 닿는다
      const steel = std(0xc9d2de, 0.25, 0.85);
      const tappet = new THREE.Group();
      const plate = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.06, 0.16, 2, 0.02), steel);
      plate.position.y = 0.03;
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.1, 12), steel);
      rod.position.y = 0.06 + 0.55;
      tappet.add(plate, rod);
      tappet.position.set(g2.position.x, 0, 0.22);
      scene.add(tappet);
      const guideY = gy + 1.5;
      const guide = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.025, 8, 20), std(0x5a6b8a, 0.4, 0.6));
      guide.rotation.x = Math.PI / 2;
      guide.position.set(g2.position.x, guideY, 0.22);
      const bracket = new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.08, 0.08, 2, 0.02), std(0x5a6b8a, 0.4, 0.6));
      bracket.position.set(g2.position.x + 0.3, guideY, 0.22);
      scene.add(guide, bracket);
      const SPN = 120;
      const springPos = new Float32Array(SPN * 3);
      for (let i = 0; i < SPN; i++) {
        const a = (i / SPN) * TAU * 7;
        springPos.set([Math.cos(a) * 0.09, i / (SPN - 1), Math.sin(a) * 0.09], i * 3);
      }
      const springGeo = new THREE.BufferGeometry();
      springGeo.setAttribute('position', new THREE.BufferAttribute(springPos, 3));
      const spring = new THREE.Line(springGeo, new THREE.LineBasicMaterial({ color: 0x2a3550 }));
      spring.position.set(g2.position.x, 0, 0.22);
      scene.add(spring);
      // 피치원 · 기초원 · 작용선 (보기 켜고 끄기)
      const circ = (rr: number, color: number, op: number): THREE.LineLoop => {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i < 96; i++) pts.push(new THREE.Vector3(rr * Math.cos((i / 96) * TAU), rr * Math.sin((i / 96) * TAU), 0));
        return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity: op, depthTest: false }));
      };
      const guides = new THREE.Group();
      for (const [g, rr] of [
        [g1, r1],
        [g2, r2],
      ] as [THREE.Mesh, number][]) {
        const pc = circ(rr, 0x1d2a55, 0.7);
        const bc = circ(rr * Math.cos(PA20), 0x1f6bff, 0.8);
        for (const c of [pc, bc]) {
          c.position.copy(g.position).setZ(0.13);
          c.renderOrder = 6;
          guides.add(c);
        }
      }
      const ca = Math.cos(PA20);
      const sa = Math.sin(PA20);
      const T1 = new THREE.Vector3(g1.position.x + r1 * ca * ca, gy + r1 * ca * sa, 0.13);
      const T2 = new THREE.Vector3(g2.position.x - r2 * ca * ca, gy - r2 * ca * sa, 0.13);
      const loa = new THREE.Line(new THREE.BufferGeometry().setFromPoints([T1, T2]), new THREE.LineBasicMaterial({ color: 0xd4145a, depthTest: false }));
      loa.renderOrder = 7;
      const pp = new THREE.Mesh(new THREE.CircleGeometry(0.035, 16), new THREE.MeshBasicMaterial({ color: 0xd4145a, depthTest: false }));
      pp.position.set(g1.position.x + r1, gy, 0.13);
      pp.renderOrder = 7;
      guides.add(loa, pp);
      scene.add(guides);
      const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
      const hud = new Hud();
      let speed = 1;
      let th = 0;
      let x = 0;
      let lift = 0;
      let camPhi = 0;
      const tmp = new THREE.Vector2();
      const O2 = new THREE.Vector2();
      return {
        scene,
        camera: cam,
        update(_t, dt) {
          th += dt * 1.8 * speed;
          x = eng.set(th);
          // 크랭크와 같은 축 방향으로 돈다고 보고(θ), 맞물림: θ₂ = π + π/z₂ + (z₁/z₂)·θ — 이 0 번이 맞은편 홈에 들어가는 위상
          g1.rotation.z = -th;
          g2.rotation.z = Math.PI + Math.PI / Z2 + (Z1 / Z2) * th;
          // 납작 밀대: 캠 윤곽 점을 돌려 가장 높은 y (지지 함수) — 캠이 볼록하니 그 점이 닿는 점
          let top = 0;
          for (let i = 0; i < NC; i++) {
            const a = (i / NC) * TAU;
            const rr = camRadius(a, R0, LIFT);
            tmp.set(rr * Math.cos(a), rr * Math.sin(a)).rotateAround(O2, g2.rotation.z);
            if (tmp.y > top) top = tmp.y;
          }
          lift = top - R0;
          camPhi = ((Math.PI / 2 - g2.rotation.z) % TAU + TAU) % TAU;
          tappet.position.y = gy + top + 0.012;
          const sb = tappet.position.y + 0.08;
          spring.position.y = sb;
          spring.scale.y = Math.max(0.05, guideY - 0.04 - sb);
        },
        resize(w, h) {
          const tn = Math.tan((cam.fov * Math.PI) / 360);
          const d = Math.max(2.05 / tn, 3.7 / (tn * (w / h)));
          cam.position.set(0.1, 0.2, d);
          cam.lookAt(0.1, -0.05, 0);
        },
        render(r, w, h) {
          r.render(scene, cam);
          const deg = Math.round(((th * 180) / Math.PI) % 360);
          hud.draw(r, w, h, `${w}x${h}${deg}${Math.round(lift * 1000)}`, (g) => {
            const s = fsz(w, h, 0.8);
            pill(g, s * 0.6, s * 0.6, `θ = ${deg}°   x = ${x.toFixed(2)}`, s, 'rgba(30,40,80,0.8)');
            const b1 = Math.floor(th / TAU);
            const b2 = Math.floor((th * Z1) / Z2 / TAU);
            pill(g, w - s * 0.6, s * 0.6, `파랑 ${b1}바퀴 · 노랑(캠) ${b2}바퀴`, s, 'rgba(255,160,40,0.92)', '#2a1800', 'right');
            pill(g, w / 2, h - s * 2.3, 'x = r·cosθ + √(L² − r²·sin²θ)    ω₁·z₁ = ω₂·z₂    밀대 = max r(φ)', s * 0.9, 'rgba(255,255,255,0.88)', '#1d2a55', 'center');
            // 캠 들림 그래프 (한 바퀴 φ → 들림)
            const gw = Math.min(w * 0.24, s * 11);
            const gh = gw * 0.42;
            const gx = w * 0.4 - gw / 2;
            const gyy = s * 3.2;
            g.fillStyle = 'rgba(255,255,255,0.85)';
            g.beginPath();
            g.roundRect(gx - s * 0.4, gyy - s * 0.4, gw + s * 0.8, gh + s * 1.9, s * 0.5);
            g.fill();
            g.strokeStyle = '#ff6b8b';
            g.lineWidth = Math.max(1.5, s * 0.14);
            g.beginPath();
            for (let i = 0; i <= 90; i++) {
              const a = (i / 90) * TAU;
              const yy = gyy + gh - ((camRadius(a, R0, LIFT) - R0) / LIFT) * gh;
              if (i) g.lineTo(gx + (i / 90) * gw, yy);
              else g.moveTo(gx, yy);
            }
            g.stroke();
            const px = gx + (camPhi / TAU) * gw;
            g.fillStyle = '#d4145a';
            g.beginPath();
            g.arc(px, gyy + gh - (lift / LIFT) * gh, s * 0.3, 0, TAU);
            g.fill();
            g.fillStyle = '#1d2a55';
            g.font = `700 ${s * 0.75}px ${FONT}`;
            g.textBaseline = 'top';
            g.textAlign = 'left';
            g.fillText(`캠 들림 ${lift.toFixed(2)}`, gx, gyy + gh + s * 0.35);
          });
        },
        controls: [
          { type: 'range', label: '빠르기', min: 0, max: 3, step: 0.1, value: 1, on: (v) => (speed = v) },
          { type: 'toggle', label: '피치원 · 기초원 · 작용선', value: true, on: (v) => (guides.visible = v) },
        ],
        dispose() {
          disposeScene(scene);
          hud.dispose();
        },
      };
    },
  },

  i38: {
    kind: 'dom',
    caption: '3D 부품 자리를 화면 좌표로 찍어 HTML 이름표 + 지시선 — 로켓이 돌아 부품이 뒤로 가면 이름표가 흐려져요',
    make(box) {
      ownAcquire();
      const { g, fit } = boxCanvas(box);
      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible');
      box.appendChild(svg);
      const scene = darkScene();
      const rocket = new THREE.Group();
      scene.add(rocket);
      const bodyM = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 2, 40), std(0xf2f4ff, 0.35, 0.2));
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.9, 40), std(0xff4f6b, 0.35));
      nose.position.y = 1.45;
      const win = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 10, 30), std(0x8a96ad, 0.3, 0.8));
      win.position.set(0, 0.45, 0.5);
      const glass = new THREE.Mesh(new THREE.CircleGeometry(0.2, 30), new THREE.MeshStandardMaterial({ color: 0x5ad1ff, emissive: 0x1a6aa0, roughness: 0.1 }));
      glass.position.set(0, 0.45, 0.51);
      const fins: THREE.Mesh[] = [];
      const finShape = new THREE.Shape();
      finShape.moveTo(0, 0);
      finShape.lineTo(0.55, -0.35);
      finShape.lineTo(0.55, -0.75);
      finShape.lineTo(0, -0.45);
      const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.06, bevelEnabled: false });
      finGeo.translate(0, 0, -0.03);
      for (let i = 0; i < 3; i++) {
        const f = new THREE.Mesh(finGeo, std(0xff4f6b, 0.4));
        const a = (i / 3) * TAU + Math.PI / 2;
        f.position.set(Math.cos(a) * 0.5, -0.45, Math.sin(a) * 0.5);
        f.rotation.y = -a;
        rocket.add(f);
        fins.push(f);
      }
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 0.35, 30, 1, true), std(0x4a5468, 0.4, 0.7, { side: THREE.DoubleSide }));
      nozzle.position.y = -1.17;
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.8, 24), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85 }));
      flame.position.y = -1.7;
      flame.rotation.x = Math.PI;
      rocket.add(bodyM, nose, win, glass, nozzle, flame);
      const anchors: { name: string; obj: THREE.Object3D; local: THREE.Vector3; side: number; el: HTMLDivElement; line: SVGLineElement; dot: SVGCircleElement }[] = [];
      const mkLabel = (name: string, obj: THREE.Object3D, local: THREE.Vector3, side: number): void => {
        const el = document.createElement('div');
        el.textContent = name;
        el.style.cssText = `position:absolute;left:0;top:0;padding:3px 9px;border-radius:999px;background:#ffffff;color:#1d2a55;font:700 13px ${FONT};white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.3);transition:opacity .2s;will-change:transform`;
        box.appendChild(el);
        const line = document.createElementNS(svgNS, 'line');
        line.setAttribute('stroke', '#ffd34a');
        line.setAttribute('stroke-width', '2');
        const dot = document.createElementNS(svgNS, 'circle');
        dot.setAttribute('r', '4');
        dot.setAttribute('fill', '#ffd34a');
        svg.append(line, dot);
        anchors.push({ name, obj, local, side, el, line, dot });
      };
      mkLabel('뾰족 머리', nose, new THREE.Vector3(0.16, 0.12, 0.08), 1);
      mkLabel('창문', glass, new THREE.Vector3(0, 0, 0.02), -1);
      mkLabel('몸통', bodyM, new THREE.Vector3(-0.38, -0.2, -0.38), 1);
      mkLabel('날개', fins[0]!, new THREE.Vector3(0.45, -0.5, 0), -1);
      mkLabel('분사구', nozzle, new THREE.Vector3(0.3, -0.05, -0.22), 1);
      const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
      const ray = new THREE.Raycaster();
      const hitList = [bodyM, nose, win, glass, nozzle, ...fins];
      return {
        update(t) {
          const { w, h, dpr } = fit();
          rocket.rotation.y = t * 0.7;
          rocket.rotation.z = Math.sin(t * 0.5) * 0.12;
          rocket.position.y = Math.sin(t * 1.3) * 0.08;
          flame.scale.set(1, 0.85 + Math.sin(t * 25) * 0.15, 1);
          const tn = Math.tan((cam.fov * Math.PI) / 360);
          const d = Math.max(1.9 / tn, 2.6 / (tn * (w / h)));
          cam.position.set(0, 0.4, d);
          cam.lookAt(0, 0.05, 0);
          scene.updateMatrixWorld();
          glPaint(g, dpr, scene, cam, 0, 0, w, h);
          const fs = clamp(Math.min(w, h * 1.6) * 0.045, 11, 18);
          for (const a of anchors) {
            const wp = a.local.clone().applyMatrix4(a.obj.matrixWorld);
            const sp = wp.clone().project(cam);
            const x = ((sp.x + 1) / 2) * w;
            const y = ((1 - sp.y) / 2) * h;
            // 가려졌나? 카메라 → 점 사이에 다른 면이 먼저 닿으면 숨김
            const dir = wp.clone().sub(cam.position);
            const dist = dir.length();
            ray.set(cam.position, dir.normalize());
            const hit = ray.intersectObjects(hitList, false)[0];
            const hidden = !!hit && hit.distance < dist - 0.07;
            const lx = clamp(x + a.side * w * 0.2, fs * 3.5, w - fs * 3.5);
            const ly = y - fs * 0.8;
            a.el.style.fontSize = `${fs}px`;
            a.el.style.transform = `translate(${lx}px, ${ly}px) translate(-50%, -50%)`;
            a.el.style.opacity = hidden ? '0.35' : '1';
            a.el.textContent = hidden ? `${a.name} (뒤)` : a.name;
            a.line.setAttribute('x1', String(x));
            a.line.setAttribute('y1', String(y));
            a.line.setAttribute('x2', String(lx));
            a.line.setAttribute('y2', String(ly));
            a.line.setAttribute('opacity', hidden ? '0.15' : '1');
            a.line.setAttribute('stroke-dasharray', hidden ? '4 4' : '');
            a.dot.setAttribute('cx', String(x));
            a.dot.setAttribute('cy', String(y));
            a.dot.setAttribute('opacity', hidden ? '0.15' : '1');
          }
        },
        dispose() {
          disposeScene(scene);
          ownRelease();
          box.innerHTML = '';
        },
      };
    },
  },

  i39: {
    kind: 'dom',
    caption: '피스톤(왼쪽 3D)과 높이 그래프(오른쪽)가 같은 각도 θ 하나로 움직여요 — 점선은 사인 곡선, 거의 닮았어요',
    make(box) {
      ownAcquire();
      const { g, fit } = boxCanvas(box);
      const scene = baseScene('#1d2752', '#2f3f7c');
      const eng = makeEngine({ valves: false });
      eng.root.position.y = -1.2;
      scene.add(eng.root);
      const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
      let auto = true;
      let th = 0;
      let manual = 0;
      return {
        update(_t, dt) {
          const { w, h, dpr } = fit();
          if (auto) th += dt * 1.6;
          else th = manual;
          const yp = eng.set(th);
          const lw = w * 0.42;
          const tn = Math.tan((cam.fov * Math.PI) / 360);
          const d = Math.max(1.85 / tn, 1.2 / (tn * (lw / h)));
          cam.position.set(0.9, 0.5, d);
          cam.lookAt(0, 0.05, 0);
          scene.updateMatrixWorld();
          g.setTransform(dpr, 0, 0, dpr, 0, 0);
          const bg = g.createLinearGradient(0, 0, 0, h);
          bg.addColorStop(0, '#1d2752');
          bg.addColorStop(1, '#2f3f7c');
          g.fillStyle = bg;
          g.fillRect(0, 0, w, h);
          glPaint(g, dpr, scene, cam, 0, 0, lw, h);
          // 그래프
          const gx0 = lw + w * 0.05;
          const gx1 = w - w * 0.04;
          const r = eng.r;
          const L = eng.L;
          const ymin = L - r;
          const ymax = L + r;
          const top = eng.pistonTop() - 0.5;
          // 3D 피스톤 높이 → 화면 y (그래프 세로 눈금을 3D 와 같게)
          cam.updateMatrixWorld();
          const scr = (yy: number): number => ((1 - new THREE.Vector3(0, yy + 0.25 + eng.root.position.y, 0).project(cam).y) / 2) * h;
          const sTop = scr(ymax);
          const sBot = scr(ymin);
          const Y = (v: number): number => lerp(sBot, sTop, (v - ymin) / (ymax - ymin));
          const span = TAU * 2;
          const X = (a: number): number => lerp(gx0, gx1, (a % span) / span);
          g.strokeStyle = 'rgba(255,255,255,0.25)';
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(gx0, sTop - 10);
          g.lineTo(gx0, sBot + 10);
          g.lineTo(gx1, sBot + 10);
          g.stroke();
          const fs = clamp(Math.min(w, h * 1.6) * 0.036, 10, 18);
          g.fillStyle = 'rgba(255,255,255,0.7)';
          g.font = `600 ${fs}px ${FONT}`;
          g.textAlign = 'right';
          g.textBaseline = 'top';
          g.fillText('θ →', gx1, sBot + 14);
          g.textAlign = 'left';
          g.textBaseline = 'bottom';
          g.fillText('피스톤 높이', gx0 + 4, sTop - 12);
          // 사인 (점선)
          g.setLineDash([5, 5]);
          g.strokeStyle = 'rgba(255,255,255,0.55)';
          g.beginPath();
          for (let k = 0; k <= 200; k++) {
            const a = (k / 200) * span;
            const v = L + r * Math.cos(a);
            if (k) g.lineTo(lerp(gx0, gx1, k / 200), Y(v));
            else g.moveTo(gx0, Y(v));
          }
          g.stroke();
          g.setLineDash([]);
          // 실제 곡선
          g.strokeStyle = '#ffc23a';
          g.lineWidth = 3;
          g.beginPath();
          for (let k = 0; k <= 200; k++) {
            const a = (k / 200) * span;
            const v = r * Math.cos(a) + Math.sqrt(L * L - r * r * Math.sin(a) ** 2);
            if (k) g.lineTo(lerp(gx0, gx1, k / 200), Y(v));
            else g.moveTo(gx0, Y(v));
          }
          g.stroke();
          const a = ((th % span) + span) % span;
          const px = X(a);
          const py = Y(yp);
          // 3D 피스톤 → 그래프 점 잇기
          const pistonY = scr(top);
          const pistonX = ((new THREE.Vector3(0.45, top + 0.25 + eng.root.position.y, 0).project(cam).x + 1) / 2) * lw;
          g.setLineDash([3, 4]);
          g.strokeStyle = '#ff6b8b';
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(pistonX, pistonY);
          g.lineTo(px, py);
          g.stroke();
          g.setLineDash([]);
          g.fillStyle = '#ff6b8b';
          g.beginPath();
          g.arc(px, py, 6, 0, TAU);
          g.fill();
          g.strokeStyle = '#fff';
          g.lineWidth = 2;
          g.stroke();
          g.fillStyle = '#fff';
          g.font = `700 ${fs}px ${FONT}`;
          g.textAlign = 'left';
          g.textBaseline = 'top';
          g.fillText(`θ = ${Math.round(((a % TAU) * 180) / Math.PI)}°`, gx0 + 4, 10);
        },
        controls: [
          { type: 'toggle', label: '저절로 돌리기', value: true, on: (v) => (auto = v) },
          { type: 'range', label: '각도 θ (라디안)', min: 0, max: 12.56, step: 0.01, value: 0, on: (v) => ((auto = false), (manual = v)) },
        ],
        dispose() {
          disposeScene(scene);
          ownRelease();
          box.innerHTML = '';
        },
      };
    },
  },

  i40: {
    kind: '2d',
    caption: '물체(초록 화살)가 움직이면 세 광선이 렌즈에서 꺾여 상(분홍)이 생겨요 — 1/f = 1/a + 1/b · 초점 안쪽이면 허상(점선)',
    make() {
      let auto = true;
      let manA = 2;
      let fK = 1;
      return {
        draw(g, w, h, t) {
          const bg = g.createLinearGradient(0, 0, 0, h);
          bg.addColorStop(0, '#101a3e');
          bg.addColorStop(1, '#1e2c63');
          g.fillStyle = bg;
          g.fillRect(0, 0, w, h);
          const fs = clamp(Math.min(w, h * 1.6) * 0.038, 10, 18);
          const ax = h * 0.58;
          const lx = w * 0.5;
          const f = w * 0.12 * fK;
          const aN = auto ? lerp(0.55, 3.0, pingpong(t, 10)) : manA;
          const a = aN * f;
          const ho = h * 0.2;
          const ox = lx - a;
          // 광축 · 초점
          g.strokeStyle = 'rgba(255,255,255,0.3)';
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(0, ax);
          g.lineTo(w, ax);
          g.stroke();
          for (const s of [-1, 1]) {
            for (const k of [1, 2]) {
              g.fillStyle = k === 1 ? '#ffd34a' : 'rgba(255,211,74,0.45)';
              g.beginPath();
              g.arc(lx + s * f * k, ax, k === 1 ? 4 : 3, 0, TAU);
              g.fill();
            }
            g.fillStyle = '#ffd34a';
            g.font = `700 ${fs * 0.85}px ${FONT}`;
            g.textAlign = 'center';
            g.textBaseline = 'top';
            g.fillText('F', lx + s * f, ax + 6);
          }
          // 렌즈 (볼록)
          const lh = h * 0.42;
          g.fillStyle = 'rgba(140,210,255,0.28)';
          g.strokeStyle = 'rgba(170,225,255,0.9)';
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(lx, ax - lh);
          g.quadraticCurveTo(lx + lh * 0.22, ax, lx, ax + lh);
          g.quadraticCurveTo(lx - lh * 0.22, ax, lx, ax - lh);
          g.fill();
          g.stroke();
          // 상 거리 b · 배율
          const near = Math.abs(a - f) < f * 0.03;
          const b = near ? Infinity : 1 / (1 / f - 1 / a);
          const m = -b / a;
          const ix = lx + b;
          const hi = ho * m;
          const top: [number, number] = [ox, ax - ho];
          const flow = -t * 40;
          const ray = (pts: [number, number][], col: string, dashed = false): void => {
            g.strokeStyle = col;
            g.lineWidth = dashed ? 1.5 : 2.2;
            g.setLineDash(dashed ? [5, 5] : [14, 6]);
            g.lineDashOffset = dashed ? 0 : flow;
            g.beginPath();
            pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
            g.stroke();
            g.setLineDash([]);
          };
          const ext = (x0: number, y0: number, x1: number, y1: number, toX: number): [number, number] => [toX, y0 + ((y1 - y0) * (toX - x0)) / (x1 - x0)];
          const R1 = '#ffd34a';
          const R2 = '#5ae0ff';
          const R3 = '#ff7ab0';
          // 1) 축에 나란히 → 렌즈 지나 뒤 초점으로
          const p1: [number, number] = [lx, top[1]];
          ray([top, p1, ext(lx, top[1], lx + f, ax, w + 10)], R1);
          // 2) 렌즈 가운데 → 곧게
          ray([top, ext(top[0], top[1], lx, ax, w + 10)], R2);
          // 3) 앞 초점 지나 → 렌즈 뒤 축에 나란히
          if (a > f * 1.02) {
            const hit = ext(top[0], top[1], lx - f, ax, lx);
            ray([top, hit, [w + 10, hit[1]]], R3);
          } else if (a < f * 0.98) {
            const hit = ext(lx - f, ax, top[0], top[1], lx);
            ray([top, hit, [w + 10, hit[1]]], R3);
            ray([[lx - f, ax], top], 'rgba(255,122,176,0.5)', true);
          }
          // 허상: 광선을 뒤로 이어 만난 곳
          if (!near && b < 0) {
            ray([p1, ext(lx, top[1], lx + f, ax, ix)], 'rgba(255,211,74,0.55)', true);
            ray([top, [ix, ax - hi]], 'rgba(90,224,255,0.55)', true);
          }
          const arrow = (x: number, hgt: number, col: string, dashed: boolean): void => {
            g.strokeStyle = col;
            g.fillStyle = col;
            g.lineWidth = 4;
            g.setLineDash(dashed ? [6, 5] : []);
            g.beginPath();
            g.moveTo(x, ax);
            g.lineTo(x, ax - hgt);
            g.stroke();
            g.setLineDash([]);
            const d = hgt > 0 ? 1 : -1;
            g.beginPath();
            g.moveTo(x, ax - hgt - d * 2);
            g.lineTo(x - 8, ax - hgt + d * 12);
            g.lineTo(x + 8, ax - hgt + d * 12);
            g.closePath();
            g.fill();
          };
          arrow(ox, ho, '#5ad17a', false);
          if (!near && Math.abs(ix) < w * 3 && Math.abs(hi) < h * 2) arrow(ix, hi, '#ff6b9b', b < 0);
          // 글씨
          g.fillStyle = '#fff';
          g.font = `700 ${fs}px ${FONT}`;
          g.textAlign = 'left';
          g.textBaseline = 'top';
          const bTxt = near ? '∞ (상이 안 생김)' : b < 0 ? `${(b / f).toFixed(2)}f (허상)` : `${(b / f).toFixed(2)}f`;
          g.fillText(`1/f = 1/a + 1/b    a = ${aN.toFixed(2)}f  →  b = ${bTxt}`, fs * 0.7, fs * 0.6);
          g.fillStyle = 'rgba(255,255,255,0.7)';
          g.font = `600 ${fs * 0.85}px ${FONT}`;
          g.fillText(near ? '초점 위: 나란한 빛' : b < 0 ? `초점 안쪽 → 바로 선 큰 허상 (${Math.abs(m).toFixed(1)}배)` : `거꾸로 선 실상 (${Math.abs(m).toFixed(1)}배)`, fs * 0.7, fs * 2.1);
          // 작은 창: 스넬 법칙 (물 → 공기 꺾임)
          if (w < 520) return;
          const bw = Math.min(w * 0.26, h * 0.42);
          const bx = w - bw - fs * 0.6;
          const by = fs * 0.6;
          const bh = bw * 0.62;
          g.fillStyle = 'rgba(255,255,255,0.06)';
          g.fillRect(bx, by, bw, bh / 2);
          g.fillStyle = 'rgba(80,170,255,0.3)';
          g.fillRect(bx, by + bh / 2, bw, bh / 2);
          g.strokeStyle = 'rgba(255,255,255,0.4)';
          g.strokeRect(bx, by, bw, bh);
          const th1 = (0.15 + 0.5 * pingpong(t, 6)) * 1;
          const th2 = Math.asin(clamp((1.0 / 1.5) * Math.sin(th1), -1, 1));
          const cx = bx + bw / 2;
          const cy = by + bh / 2;
          const L = bh * 0.48;
          g.strokeStyle = '#ffd34a';
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(cx - Math.sin(th1) * L, cy - Math.cos(th1) * L);
          g.lineTo(cx, cy);
          g.lineTo(cx + Math.sin(th2) * L, cy + Math.cos(th2) * L);
          g.stroke();
          g.fillStyle = '#fff';
          g.font = `600 ${fs * 0.7}px ${FONT}`;
          g.textAlign = 'center';
          g.textBaseline = 'top';
          g.fillText('n₁sinθ₁ = n₂sinθ₂', cx, by + bh + 3);
        },
        controls: [
          { type: 'toggle', label: '물체 저절로 움직이기', value: true, on: (v) => (auto = v) },
          { type: 'range', label: '물체 거리 a (f 의 몇 배)', min: 0.4, max: 3.5, step: 0.05, value: 2, on: (v) => ((auto = false), (manA = v)) },
          { type: 'range', label: '초점 거리 f', min: 0.6, max: 1.5, step: 0.05, value: 1, on: (v) => (fK = v) },
        ],
      };
    },
  },

  i41: {
    kind: '3d',
    caption: '조리개(f) → 배경 흐림 · 셔터 → 바람개비 움직임 흐림 · ISO → 자글자글 노이즈 — 한 칸(스톱)마다 밝기 2배',
    make() {
      const scene = baseScene('#bfe3ff', '#f2fbff');
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), std(0x9ed88a, 0.95));
      ground.rotation.x = -Math.PI / 2;
      scene.add(ground);
      // 가까이: 공 · 가운데(초점): 바람개비 · 멀리: 나무
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.32, 32, 20), std(0xff5a5a, 0.35));
      ball.position.set(-1.25, 0.32, 3.3);
      scene.add(ball);
      const pin = new THREE.Group();
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 10), std(0xf4e2c0, 0.6));
      stick.position.y = 0.8;
      pin.add(stick);
      const wheel = new THREE.Group();
      wheel.position.set(0, 1.6, 0.06);
      const bladeCols = [0xff4f7b, 0xffc23a, 0x4aa8ff, 0x5ad17a];
      for (let i = 0; i < 4; i++) {
        const sh = new THREE.Shape();
        sh.moveTo(0, 0);
        sh.lineTo(0.6, 0.1);
        sh.lineTo(0.55, 0.5);
        sh.closePath();
        const bl = new THREE.Mesh(new THREE.ShapeGeometry(sh), std(bladeCols[i]!, 0.5, 0, { side: THREE.DoubleSide }));
        bl.rotation.z = (i * Math.PI) / 2;
        wheel.add(bl);
      }
      pin.add(wheel);
      pin.position.set(0.3, 0, 0);
      scene.add(pin);
      for (let i = 0; i < 7; i++) {
        const tr = new THREE.Group();
        const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 2), std(0x3f9f5f, 0.7));
        f.position.y = 1.5;
        const tk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.2, 8), std(0x8a5a3c, 0.8));
        tk.position.y = 0.6;
        tr.add(f, tk);
        tr.position.set(-4.5 + i * 1.6, 0, -5 - (i % 2) * 1.2);
        scene.add(tr);
      }
      const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 80);
      cam.position.set(0.2, 1.5, 6.2);
      cam.lookAt(0.2, 1.2, 0);
      const focusD = cam.position.distanceTo(new THREE.Vector3(0.3, 1.4, 0));
      const grainShader = {
        uniforms: { tDiffuse: { value: null }, amount: { value: 0 }, seed: { value: 0 }, gain: { value: 1 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform sampler2D tDiffuse; uniform float amount; uniform float seed; uniform float gain; varying vec2 vUv;
          float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + seed) * 43758.5453); }
          void main(){ vec4 c = texture2D(tDiffuse, vUv); float n = rnd(gl_FragCoord.xy) - 0.5; float m = rnd(gl_FragCoord.xy + 7.1) - 0.5;
            c.rgb = c.rgb * gain + vec3(n, n*0.8 + m*0.4, n*0.8 - m*0.4) * amount; gl_FragColor = c; }`,
      };
      interface Chain {
        comp: EffectComposer;
        bokeh: BokehPass;
        after: AfterimagePass;
        grain: ShaderPass;
        w: number;
        h: number;
      }
      const chains = new WeakMap<THREE.WebGLRenderer, Chain>();
      const all: Chain[] = [];
      const chainFor = (r: THREE.WebGLRenderer, w: number, h: number): Chain => {
        let c = chains.get(r);
        if (!c) {
          const comp = new EffectComposer(r);
          comp.addPass(new RenderPass(scene, cam));
          const bokeh = new BokehPass(scene, cam, { focus: focusD, aperture: 0.001, maxblur: 0.012 });
          comp.addPass(bokeh);
          const after = new AfterimagePass(0);
          comp.addPass(after);
          const grain = new ShaderPass(grainShader);
          comp.addPass(grain);
          comp.addPass(new OutputPass());
          c = { comp, bokeh, after, grain, w: 0, h: 0 };
          chains.set(r, c);
          all.push(c);
        }
        if (c.w !== w || c.h !== h) {
          c.comp.setSize(w, h);
          c.w = w;
          c.h = h;
        }
        return c;
      };
      const hud = new Hud();
      const F = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16];
      const SH = [1000, 500, 250, 125, 60, 30, 15];
      const ISO = [100, 200, 400, 800, 1600, 3200];
      let fi = 3;
      let si = 2;
      let ii = 0;
      let mode = 0;
      let auto = true;
      let tt = 0;
      return {
        scene,
        camera: cam,
        update(t) {
          tt = t;
          wheel.rotation.z = -t * 9;
          if (auto) {
            mode = Math.floor(t / 5) % 3;
            const k = pingpong(t, 5);
            fi = mode === 0 ? Math.round(lerp(F.length - 1, 0, k)) : 3;
            si = mode === 1 ? Math.round(lerp(0, SH.length - 1, k)) : 2;
            ii = mode === 2 ? Math.round(lerp(0, ISO.length - 1, k)) : 0;
          }
        },
        render(r, w, h) {
          const c = chainFor(r, w, h);
          const N = F[fi]!;
          const S = SH[si]!;
          const I = ISO[ii]!;
          (c.bokeh.uniforms as Record<string, THREE.IUniform>)['aperture']!.value = (1.4 / N) ** 2 * 0.0035 + 0.00002;
          (c.after.uniforms as Record<string, THREE.IUniform>)['damp']!.value = S <= 250 && mode !== 1 ? 0 : clamp(Math.log2(250 / S) * 0.24 + 0.2, 0, 0.93);
          // 밝기(스톱 수) = log2(1/N²) + log2(1/S) + log2(I) 를 기준(f/4 · 1/250 · ISO100)과 비교
          const stops = Math.log2((4 / N) ** 2) + Math.log2(250 / S) + Math.log2(I / 100);
          const gu = c.grain.uniforms as Record<string, THREE.IUniform>;
          gu['gain']!.value = 2 ** (stops * 0.28);
          gu['amount']!.value = Math.log2(I / 100) * 0.07;
          gu['seed']!.value = (tt * 60) % 100;
          c.comp.render();
          hud.draw(r, w, h, `${w}x${h}${fi}${si}${ii}${mode}`, (g) => {
            const s = fsz(w, h, 0.85);
            const items = [`f/${N}`, `1/${S}초`, `ISO ${I}`];
            let x = s * 0.6;
            items.forEach((it, k) => {
              x += pill(g, x, s * 0.6, it, s, k === mode ? 'rgba(255,110,60,0.95)' : 'rgba(20,30,60,0.6)') + s * 0.4;
            });
            const tips = ['조리개를 열면(f 작게) 배경이 흐려지고 밝아져요', '셔터가 길면 바람개비가 번지고 밝아져요', 'ISO 를 올리면 밝아지지만 자글자글'];
            pill(g, s * 0.6, h - s * 2.3, `${tips[mode]}  ·  밝기 ×${(2 ** stops).toFixed(stops < -2 ? 2 : 1)}`, s * 0.8, 'rgba(255,255,255,0.88)', '#1d2a55');
          });
        },
        controls: [
          { type: 'toggle', label: '저절로', value: true, on: (v) => (auto = v) },
          { type: 'range', label: '조리개 (0 = f/1.4 ~ 7 = f/16)', min: 0, max: 7, step: 1, value: 3, on: (v) => ((auto = false), (fi = v), (mode = 0)) },
          { type: 'range', label: '셔터 (0 = 1/1000 ~ 6 = 1/15)', min: 0, max: 6, step: 1, value: 2, on: (v) => ((auto = false), (si = v), (mode = 1)) },
          { type: 'range', label: 'ISO (0 = 100 ~ 5 = 3200)', min: 0, max: 5, step: 1, value: 0, on: (v) => ((auto = false), (ii = v), (mode = 2)) },
        ],
        dispose() {
          for (const c of all) {
            c.comp.passes.forEach((p) => p.dispose());
            c.comp.dispose();
          }
          disposeScene(scene);
          hud.dispose();
        },
      };
    },
  },

  i42: {
    kind: '3d',
    caption: '왼쪽 보통 껍질 · 오른쪽 엑스레이 — 가장자리만 빛나고(pow(1 − N·V, p)) 속 톱니 · 전지 · 칩이 비쳐 보여요',
    make() {
      const mk = (xray: boolean, p: { value: number }): THREE.Scene => {
        const scene = darkScene();
        const inner = new THREE.Group();
        const gear = new THREE.Mesh(gearGeo(14, 0.07, 0.12), std(0xffc23a, 0.3, 0.7));
        gear.position.set(-0.12, 0.25, 0);
        gear.name = 'gear';
        const gear2 = new THREE.Mesh(gearGeo(9, 0.07, 0.12), std(0xff7a59, 0.3, 0.6));
        gear2.position.set(0.36, 0.78, 0);
        gear2.name = 'gear2';
        const bat = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.6, 20), std(0x4aa8ff, 0.4, 0.3));
        bat.position.set(-0.3, -0.45, 0);
        bat.rotation.z = Math.PI / 2.4;
        const chip = new THREE.Mesh(new RoundedBoxGeometry(0.45, 0.08, 0.35, 2, 0.02), std(0x2fae6a, 0.5));
        chip.position.set(0.3, -0.4, 0.05);
        chip.rotation.x = 0.4;
        const spring = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 40 }, (_, i) => new THREE.Vector3(Math.cos(i * 0.9) * 0.1, -0.1 + i * 0.012, Math.sin(i * 0.9) * 0.1))), 120, 0.02, 6), std(0xd8dee8, 0.25, 0.9));
        spring.position.set(-0.45, 0.2, 0);
        inner.add(gear, gear2, bat, chip, spring);
        scene.add(inner);
        const shellGeo = new THREE.CapsuleGeometry(0.85, 0.7, 12, 40);
        const shell = xray
          ? new THREE.Mesh(
              shellGeo,
              new THREE.ShaderMaterial({
                uniforms: { p, col: { value: new THREE.Color(0x5ad7ff) } },
                vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
                fragmentShader: 'uniform float p; uniform vec3 col; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), p); gl_FragColor = vec4(col * (0.2 + f * 1.8), clamp(0.04 + f, 0.0, 1.0)); }',
                transparent: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
              }),
            )
          : new THREE.Mesh(shellGeo, std(0xeaeefa, 0.35, 0.1));
        shell.name = 'shell';
        shell.renderOrder = 3;
        scene.add(shell);
        scene.userData['inner'] = inner;
        return scene;
      };
      const P = { value: 2.2 };
      const A = mk(false, P);
      const B = mk(true, P);
      const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
      const hud = new Hud();
      return {
        scene: A,
        camera: cam,
        update(t) {
          for (const S of [A, B]) {
            S.getObjectByName('gear')!.rotation.z = t;
            S.getObjectByName('gear2')!.rotation.z = (-t * 14) / 9;
            (S.userData['inner'] as THREE.Group).rotation.y = Math.sin(t * 0.5) * 0.6;
            S.getObjectByName('shell')!.rotation.y = Math.sin(t * 0.5) * 0.6;
          }
        },
        render(r, w, h) {
          const tn = Math.tan((cam.fov * Math.PI) / 360);
          const d = Math.max(1.75 / tn, 1.2 / (tn * (w / 2 / h)));
          cam.position.set(0, 0.2, d);
          cam.lookAt(0, 0, 0);
          splitRender(r, w, h, A, B, cam);
          hud.draw(r, w, h, `${w}x${h}`, (g) => splitLabels(g, w, h, '보통 껍질', '엑스레이 (프레넬)'));
        },
        controls: [{ type: 'range', label: '가장자리 지수 p', min: 0.5, max: 6, step: 0.1, value: 2.2, on: (v) => (P.value = v) }],
        dispose() {
          disposeScene(A);
          disposeScene(B);
          hud.dispose();
        },
      };
    },
  },

  i43: {
    kind: '3d',
    caption: '지구 껍질을 한 겹씩 투명하게 — 지각 → 맨틀 → 외핵 → 내핵 (해부 「피부 → 근육 → 뼈」와 같은 방법)',
    make() {
      const scene = darkScene();
      const earth = new THREE.Group();
      scene.add(earth);
      const cv = document.createElement('canvas');
      cv.width = 512;
      cv.height = 256;
      const cg = cv.getContext('2d')!;
      cg.fillStyle = '#2f7fd6';
      cg.fillRect(0, 0, 512, 256);
      let seed = 11;
      const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 26; i++) {
        const x = rnd() * 512;
        const y = 50 + rnd() * 156;
        cg.fillStyle = rnd() > 0.3 ? '#5bbf5a' : '#d9c27a';
        for (let k = 0; k < 9; k++) {
          cg.beginPath();
          cg.ellipse(x + (rnd() - 0.5) * 70, y + (rnd() - 0.5) * 40, 10 + rnd() * 26, 8 + rnd() * 16, rnd() * 3, 0, TAU);
          cg.fill();
        }
      }
      cg.fillStyle = '#f4f8ff';
      cg.fillRect(0, 0, 512, 18);
      cg.fillRect(0, 238, 512, 18);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      const layers = [
        { name: '지각', r: 1.0, mat: new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, transparent: true }) },
        { name: '맨틀', r: 0.88, mat: new THREE.MeshStandardMaterial({ color: 0xd8502a, emissive: 0x6a1a08, roughness: 0.6, transparent: true }) },
        { name: '외핵', r: 0.55, mat: new THREE.MeshStandardMaterial({ color: 0xffa23a, emissive: 0xa04a00, roughness: 0.5, transparent: true }) },
        { name: '내핵', r: 0.3, mat: new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffd060, emissiveIntensity: 0.8, roughness: 0.4, transparent: true }) },
      ];
      layers.forEach((L, i) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(L.r, 48, 32), L.mat);
        m.renderOrder = 10 - i;
        earth.add(m);
      });
      const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
      const hud = new Hud();
      let auto = true;
      let manual = 0;
      let peel = 0;
      return {
        scene,
        camera: cam,
        update(t) {
          peel = auto ? pingpong(t, 10) * 3 : manual;
          layers.forEach((L, i) => {
            const o = i < 3 ? 1 - clamp(peel - i, 0, 1) * 0.92 : 1;
            L.mat.opacity = o;
            L.mat.depthWrite = o > 0.97;
          });
          earth.rotation.y = t * 0.3;
          earth.rotation.z = 0.4;
        },
        resize(w, h) {
          const tn = Math.tan((cam.fov * Math.PI) / 360);
          const d = Math.max(1.25 / tn, 1.6 / (tn * (w / h)));
          cam.position.set(0, 0.2, d);
          cam.lookAt(0.25, 0, 0);
        },
        render(r, w, h) {
          r.render(scene, cam);
          hud.draw(r, w, h, `${w}x${h}${peel.toFixed(2)}`, (g) => {
            const s = fsz(w, h, 0.8);
            const x = w - s * 7.5;
            layers.forEach((L, i) => {
              const y = h / 2 - s * 3.6 + i * s * 1.9;
              const o = L.mat.opacity;
              g.fillStyle = 'rgba(255,255,255,0.12)';
              g.beginPath();
              g.roundRect(x, y, s * 6.8, s * 1.4, s * 0.7);
              g.fill();
              g.fillStyle = `rgba(255,200,80,${0.25 + o * 0.7})`;
              g.beginPath();
              g.roundRect(x, y, Math.max(s * 1.4, s * 6.8 * o), s * 1.4, s * 0.7);
              g.fill();
              g.fillStyle = '#fff';
              g.font = `700 ${s * 0.9}px ${FONT}`;
              g.textBaseline = 'middle';
              g.textAlign = 'left';
              g.fillText(`${L.name} ${Math.round(o * 100)}%`, x + s * 0.5, y + s * 0.72);
            });
          });
        },
        controls: [
          { type: 'toggle', label: '저절로', value: true, on: (v) => (auto = v) },
          { type: 'range', label: '벗긴 층 수', min: 0, max: 3, step: 0.01, value: 0, on: (v) => ((auto = false), (manual = v)) },
        ],
        dispose() {
          disposeScene(scene);
          hud.dispose();
        },
      };
    },
  },

  i44: {
    kind: '3d',
    caption: '날개 둘레 공기 알갱이 — 위쪽은 빠르게(노랑) 아래쪽은 느리게(파랑) 흘러 양력이 생겨요 (주코프스키 흐름 식으로 계산)',
    make() {
      type Cx = [number, number];
      const mul = (a: Cx, b: Cx): Cx => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
      const div = (a: Cx, b: Cx): Cx => {
        const d = b[0] * b[0] + b[1] * b[1] || 1e-9;
        return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
      };
      const csqrt = (a: Cx): Cx => {
        const r = Math.hypot(a[0], a[1]);
        const re = Math.sqrt(Math.max(0, (r + a[0]) / 2));
        const im = Math.sign(a[1] || 1) * Math.sqrt(Math.max(0, (r - a[0]) / 2));
        return [re, im];
      };
      const MU: Cx = [-0.09, 0.08];
      const R = Math.hypot(1 - MU[0], -MU[1]);
      const beta = -Math.atan2(-MU[1], 1 - MU[0]);
      let alpha = (7 * Math.PI) / 180;
      const SC = 0.55;
      const toZ = (z: Cx): Cx => [z[0] + z[0] / (z[0] ** 2 + z[1] ** 2), z[1] - z[1] / (z[0] ** 2 + z[1] ** 2)];
      const rot = (a: Cx, ang: number): Cx => [a[0] * Math.cos(ang) - a[1] * Math.sin(ang), a[0] * Math.sin(ang) + a[1] * Math.cos(ang)];
      /** ζ 평면 속도 dζ/dt 와 실제 빠르기 */
      const vel = (zeta: Cx): [Cx, number] => {
        const s: Cx = [zeta[0] - MU[0], zeta[1] - MU[1]];
        const G = -4 * Math.PI * R * Math.sin(alpha + beta);
        const ea: Cx = [Math.cos(alpha), -Math.sin(alpha)];
        const eb: Cx = [Math.cos(alpha), Math.sin(alpha)];
        const s2 = mul(s, s);
        let dw = mul(eb, [R * R, 0]);
        dw = div(dw, s2);
        dw = [ea[0] - dw[0], ea[1] - dw[1]];
        const circ = div([0, -G / (2 * Math.PI)], s);
        dw = [dw[0] + circ[0], dw[1] + circ[1]];
        const z2 = mul(zeta, zeta);
        const dz = [1 - div([1, 0], z2)[0], -div([1, 0], z2)[1]] as Cx;
        const conjV = div(dw, dz);
        const v: Cx = [conjV[0], -conjV[1]];
        const speed = Math.hypot(v[0], v[1]);
        const dzeta = div(v, dz);
        const m = Math.hypot(dzeta[0], dzeta[1]);
        const k = m > 4 ? 4 / m : 1;
        return [[dzeta[0] * k, dzeta[1] * k], speed];
      };
      const fromDisplay = (D: Cx): Cx | null => {
        const z = rot(D, alpha);
        const q = csqrt([z[0] * z[0] - z[1] * z[1] - 4, 2 * z[0] * z[1]]);
        const a: Cx = [(z[0] + q[0]) / 2, (z[1] + q[1]) / 2];
        const b: Cx = [(z[0] - q[0]) / 2, (z[1] - q[1]) / 2];
        const da = Math.hypot(a[0] - MU[0], a[1] - MU[1]);
        const db = Math.hypot(b[0] - MU[0], b[1] - MU[1]);
        const best = da > db ? a : b;
        return Math.max(da, db) > R * 1.01 ? best : null;
      };
      const toDisplay = (zeta: Cx): Cx => rot(toZ(zeta), -alpha);
      const scene = baseScene('#0e1636', '#22336e');
      const wingMat = std(0xf2f5ff, 0.35, 0.1);
      let wing: THREE.Mesh | null = null;
      const buildWing = (): void => {
        if (wing) {
          scene.remove(wing);
          wing.geometry.dispose();
        }
        const sh = new THREE.Shape();
        for (let i = 0; i <= 120; i++) {
          const th = (i / 120) * TAU;
          const D = toDisplay([MU[0] + R * Math.cos(th), MU[1] + R * Math.sin(th)]);
          if (i) sh.lineTo(D[0] * SC, D[1] * SC);
          else sh.moveTo(D[0] * SC, D[1] * SC);
        }
        const g = new THREE.ExtrudeGeometry(sh, { depth: 1.8, bevelEnabled: false, curveSegments: 1 });
        g.translate(0, 0, -0.9);
        wing = new THREE.Mesh(g, wingMat);
        scene.add(wing);
      };
      buildWing();
      const N = 520;
      const TR = 12;
      const P: { z: Cx; depth: number; trail: Cx[]; sp: number }[] = [];
      const spawn = (anywhere: boolean): { z: Cx; depth: number; trail: Cx[]; sp: number } => {
        for (let k = 0; k < 30; k++) {
          const D: Cx = anywhere ? [(Math.random() - 0.5) * 8.4, (Math.random() - 0.5) * 4.4] : [-4.2 - Math.random() * 0.3, (Math.random() - 0.5) * 4.4];
          const zt = fromDisplay(D);
          if (zt) {
            const d = toDisplay(zt);
            return { z: zt, depth: (Math.random() - 0.5) * 1.7, trail: Array.from({ length: TR }, () => [d[0], d[1]] as Cx), sp: 1 };
          }
        }
        return { z: [-4, 0], depth: 0, trail: Array.from({ length: TR }, () => [-4, 0] as Cx), sp: 1 };
      };
      for (let i = 0; i < N; i++) P.push(spawn(true));
      const segs = N * (TR - 1);
      const pos = new Float32Array(segs * 2 * 3);
      const col = new Float32Array(segs * 2 * 3);
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      lg.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 }));
      scene.add(lines);
      const slow = new THREE.Color(0x4a8bff);
      const mid = new THREE.Color(0xf4f8ff);
      const fast = new THREE.Color(0xffb52e);
      const cc = new THREE.Color();
      const cam = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
      const hud = new Hud();
      let lastAlpha = alpha;
      let frame = 0;
      return {
        scene,
        camera: cam,
        update(_t, dt) {
          if (alpha !== lastAlpha) {
            lastAlpha = alpha;
            buildWing();
            for (let i = 0; i < N; i++) P[i] = spawn(true);
          }
          const step = Math.min(dt, 0.05) * 1.6;
          frame++;
          for (let i = 0; i < N; i++) {
            const p = P[i]!;
            const n = 3;
            for (let k = 0; k < n; k++) {
              const h = step / n;
              const [v1] = vel(p.z);
              const zm: Cx = [p.z[0] + v1[0] * h * 0.5, p.z[1] + v1[1] * h * 0.5];
              const [v2, sp] = vel(zm);
              p.z = [p.z[0] + v2[0] * h, p.z[1] + v2[1] * h];
              p.sp = sp;
            }
            const D = toDisplay(p.z);
            const inside = Math.hypot(p.z[0] - MU[0], p.z[1] - MU[1]) < R * 1.002;
            if (D[0] > 4.4 || Math.abs(D[1]) > 2.6 || inside || !Number.isFinite(D[0])) {
              P[i] = spawn(false);
              continue;
            }
            if (frame % 2 === 0) {
              p.trail.pop();
              p.trail.unshift([D[0], D[1]]);
            } else p.trail[0] = [D[0], D[1]];
          }
          let o = 0;
          for (const p of P) {
            const k = clamp((p.sp - 0.82) / 0.6, 0, 1);
            if (k < 0.4) cc.copy(slow).lerp(mid, k / 0.4);
            else cc.copy(mid).lerp(fast, (k - 0.4) / 0.6);
            for (let s = 0; s < TR - 1; s++) {
              const a = p.trail[s]!;
              const b = p.trail[s + 1]!;
              const fade = 1 - s / (TR - 1);
              pos.set([a[0] * SC, a[1] * SC, p.depth, b[0] * SC, b[1] * SC, p.depth], o * 6);
              col.set([cc.r * fade, cc.g * fade, cc.b * fade, cc.r * fade * 0.7, cc.g * fade * 0.7, cc.b * fade * 0.7], o * 6);
              o++;
            }
          }
          lg.attributes['position']!.needsUpdate = true;
          lg.attributes['color']!.needsUpdate = true;
        },
        resize(w, h) {
          const tn = Math.tan((cam.fov * Math.PI) / 360);
          const d = Math.max(1.45 / tn, 2.35 / (tn * (w / h)));
          cam.position.set(d * 0.1, d * 0.22, d);
          cam.lookAt(0, -0.05, 0);
        },
        render(r, w, h) {
          r.render(scene, cam);
          hud.draw(r, w, h, `${w}x${h}${alpha}`, (g) => {
            const s = fsz(w, h, 0.85);
            pill(g, s * 0.6, s * 0.6, `받음각 ${Math.round((alpha * 180) / Math.PI)}°`, s);
            let x = w - s * 0.6;
            for (const [n, c] of [
              ['빠름', '#e09a10'],
              ['보통', '#8a96b8'],
              ['느림', '#3a6ee0'],
            ] as [string, string][])
              x -= pill(g, x, s * 0.6, n, s * 0.8, c, '#fff', 'right') + s * 0.3;
          });
        },
        controls: [{ type: 'range', label: '받음각(°)', min: -4, max: 14, step: 1, value: 7, on: (v) => (alpha = (v * Math.PI) / 180) }],
        dispose() {
          disposeScene(scene);
          hud.dispose();
        },
      };
    },
  },

  i45: {
    kind: 'dom',
    caption: '「엔진 한 바퀴」를 4단계로 — 단계마다 카메라 · 밸브 · 가스 색이 바뀌고 설명이 나와요 (자세히 보기에서 「다음」 단추)',
    make(box) {
      ownAcquire();
      const { g, fit } = boxCanvas(box);
      const scene = baseScene('#dfeaff', '#f8fbff');
      const eng = makeEngine();
      eng.root.position.y = -1.3;
      scene.add(eng.root);
      const flash = new THREE.PointLight(0xffa040, 0, 4);
      flash.position.set(0, eng.head - 1.3, 0.6);
      scene.add(flash);
      const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
      const STEPS = [
        { name: '흡입', text: '피스톤이 내려가며 연료 + 공기를 빨아들여요 (파란 밸브 열림)', cam: new THREE.Vector3(-3.6, 1.6, 7.6), look: new THREE.Vector3(0, 0.05, 0), gas: 0x6fc3ff, o0: 0.12, o1: 0.45 },
        { name: '압축', text: '두 밸브를 닫고 피스톤이 올라가 꽉 눌러요', cam: new THREE.Vector3(0, 2.2, 6.4), look: new THREE.Vector3(0, 0.5, 0), gas: 0x3aa0ff, o0: 0.45, o1: 0.8 },
        { name: '폭발', text: '불꽃! 터지는 힘이 피스톤을 세게 밀어 내려요 — 이때만 힘이 생겨요', cam: new THREE.Vector3(2.4, 2.4, 5.6), look: new THREE.Vector3(0, 0.6, 0), gas: 0xff8a3d, o0: 0.85, o1: 0.4 },
        { name: '배기', text: '빨간 밸브가 열리고 피스톤이 타고 남은 가스를 밀어내요', cam: new THREE.Vector3(3.8, 1.2, 7.4), look: new THREE.Vector3(0, 0.05, 0), gas: 0x9a9aa8, o0: 0.4, o1: 0.06 },
      ];
      const ui = document.createElement('div');
      ui.style.cssText = `position:absolute;inset:0;pointer-events:none;font-family:${FONT};color:#1d2a55`;
      ui.innerHTML = `
        <div data-k="chip" style="position:absolute;left:4%;top:5%;padding:.25em .8em;border-radius:999px;background:#ff6b3c;color:#fff;font:400 1.2em ${TITLE}"></div>
        <div data-k="text" style="position:absolute;left:4%;right:4%;bottom:19%;padding:.45em .8em;border-radius:12px;background:rgba(255,255,255,.9);font-weight:700;line-height:1.35;box-shadow:0 2px 10px rgba(0,0,0,.12)"></div>
        <div style="position:absolute;left:4%;right:4%;bottom:4%;display:flex;align-items:center;gap:.6em">
          <button data-k="prev" style="pointer-events:auto;border:0;border-radius:999px;padding:.35em 1em;background:#fff;color:#1d2a55;font:700 1.1em ${FONT};cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.2)">이전</button>
          <div data-k="dots" style="flex:1;display:flex;justify-content:center;gap:.5em"></div>
          <button data-k="next" style="pointer-events:auto;border:0;border-radius:999px;padding:.35em 1em;background:#ff6b3c;color:#fff;font:700 1.1em ${FONT};cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.2)">다음 ▶</button>
        </div>`;
      box.appendChild(ui);
      const q = (k: string): HTMLElement => ui.querySelector<HTMLElement>(`[data-k="${k}"]`)!;
      const dots = STEPS.map(() => {
        const d = document.createElement('span');
        d.style.cssText = 'width:.7em;height:.7em;border-radius:50%;background:#c7d2ee;transition:all .3s';
        q('dots').appendChild(d);
        return d;
      });
      let step = 0;
      let stepT = 0;
      let hold = 0;
      const go = (k: number): void => {
        step = (k + STEPS.length) % STEPS.length;
        stepT = 0;
        q('chip').textContent = `${step + 1} / 4  ${STEPS[step]!.name}`;
        q('text').textContent = STEPS[step]!.text;
        dots.forEach((d, i) => {
          d.style.background = i === step ? '#ff6b3c' : '#c7d2ee';
          d.style.transform = i === step ? 'scale(1.3)' : '';
        });
      };
      q('prev').onclick = (e) => {
        e.stopPropagation();
        hold = 12;
        go(step - 1);
      };
      q('next').onclick = (e) => {
        e.stopPropagation();
        hold = 12;
        go(step + 1);
      };
      go(0);
      const camPos = STEPS[0]!.cam.clone();
      const camLook = STEPS[0]!.look.clone();
      const gasMat = eng.gas.material as THREE.MeshBasicMaterial;
      const sparkMat = eng.spark.material as THREE.MeshBasicMaterial;
      const iy = eng.intake.position.y;
      return {
        update(_t, dt) {
          const { w, h, dpr } = fit();
          ui.style.fontSize = `${clamp(Math.min(w, h * 1.6) * 0.036, 10, 17)}px`;
          stepT += dt;
          hold = Math.max(0, hold - dt);
          const dur = 2.4;
          if (stepT > dur * 2 + 0.6 && hold <= 0) go(step + 1);
          const k = smooth(Math.min(1, (stepT % (dur + 0.6)) / dur));
          const S = STEPS[step]!;
          eng.set(Math.PI * step + Math.PI * k);
          gasMat.color.setHex(S.gas);
          gasMat.opacity = lerp(S.o0, S.o1, k);
          const open = (on: boolean): number => (on ? Math.sin(k * Math.PI) * 0.14 : 0);
          eng.intake.position.y = iy - open(step === 0);
          eng.exhaust.position.y = iy - open(step === 3);
          const boom = step === 2 ? Math.max(0, 1 - k * 4) : 0;
          sparkMat.opacity = boom;
          eng.spark.scale.setScalar(1 + boom * 3);
          flash.intensity = boom * 30;
          camPos.lerp(S.cam, Math.min(1, dt * 2.5));
          camLook.lerp(S.look, Math.min(1, dt * 2.5));
          const aspect = w / h;
          const back = aspect < 1.2 ? 1.2 / aspect : 1;
          cam.position.copy(camLook).addScaledVector(camPos.clone().sub(camLook), back);
          cam.lookAt(camLook.x, camLook.y - 0.75, camLook.z);
          scene.updateMatrixWorld();
          glPaint(g, dpr, scene, cam, 0, 0, w, h);
        },
        controls: [
          { type: 'button', label: '이전 단계', on: () => ((hold = 12), go(step - 1)) },
          { type: 'button', label: '다음 단계', on: () => ((hold = 12), go(step + 1)) },
        ],
        dispose() {
          disposeScene(scene);
          ownRelease();
          box.innerHTML = '';
        },
      };
    },
  },
};

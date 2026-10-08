import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Control, DemoMap, Scene3D } from './types';
import { makeToonIsle } from './lib/toonIsle';

/**
 * 재질 · 그림체 (둘째 묶음, i221 ~ i244) — 홀로그램 · 툰 물 · 풀밭 · 하늘 · 구름 · 강조 테 · 비눗방울 · 서리 유리 ·
 * 삼면 투영 · 시차 차폐 · 가짜 방 · 대역 · 스프라이트 상태기 · 노멀 맵 2D · 시야 다각형 · 색 순환 · 디더 · 아스키 ·
 * 도트 3D · 낮은 다각형 · 복셀 · SDF 글자 · 셰이더 전환 · 뼈대 반짝임.
 * 무늬는 모두 코드로 (CanvasTexture · DataTexture), 파일 없음.
 */

const F = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const smooth = (a: number, b: number, x: number): number => {
  const k = clamp((x - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/* ───────────── GLSL 도구 ───────────── */

const NOISE = /* glsl */ `
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float h1(float n){ return fract(sin(n) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){ float v = 0.0; float a = 0.5; for (int k = 0; k < 5; k++){ v += noise(p) * a; p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
float hash3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise3(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float fbm3(vec3 p){ float v = 0.0; float a = 0.5; for (int k = 0; k < 4; k++){ v += a * noise3(p); p = p * 2.02 + vec3(3.1, 1.7, 5.3); a *= 0.5; } return v; }
`;
/** 셰이더 끝에 붙이는 톤 매핑 · 색 공간 (다른 재질과 같은 색이 되게) */
const OUT = /* glsl */ `
#include <tonemapping_fragment>
#include <colorspace_fragment>
`;
const FSQ_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const WORLD_VERT = /* glsl */ `
varying vec3 vW; varying vec3 vN; varying vec2 vUv;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

interface Quad {
  scene: THREE.Scene;
  cam: THREE.OrthographicCamera;
  mat: THREE.ShaderMaterial;
  dispose(): void;
}
function quad(frag: string, uniforms: Record<string, THREE.IUniform>, extra: Partial<THREE.ShaderMaterialParameters> = {}): Quad {
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geo = new THREE.PlaneGeometry(2, 2);
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: FSQ_VERT, fragmentShader: frag, depthTest: false, depthWrite: false, ...extra });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  scene.add(m);
  return {
    scene,
    cam,
    mat,
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

type Disposable = { dispose(): void };
function freeAll(...roots: THREE.Object3D[]): void {
  const seen = new Set<unknown>();
  for (const root of roots)
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && !seen.has(m.geometry)) {
        seen.add(m.geometry);
        m.geometry.dispose();
      }
      const raw = (m as unknown as { material?: THREE.Material | THREE.Material[] }).material;
      const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
      for (const x of list) {
        if (seen.has(x)) continue;
        seen.add(x);
        const mm = x as unknown as Record<string, unknown>;
        for (const k of ['map', 'emissiveMap', 'gradientMap', 'alphaMap']) (mm[k] as Disposable | undefined)?.dispose();
        x.dispose();
      }
    });
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}
function canvasTex(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** 세로 그러데이션 배경 */
function gradBg(stops: [number, string][]): THREE.CanvasTexture {
  const [c, g] = canvas(4, 256);
  const gr = g.createLinearGradient(0, 0, 0, 256);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 256);
  return canvasTex(c);
}
/** 툰 명암 계단 */
function toonRamp(steps: number[]): THREE.DataTexture {
  const d = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => {
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = Math.round(v * 255);
    d[i * 4 + 3] = 255;
  });
  const t = new THREE.DataTexture(d, steps.length, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

/** 3D 화면 위 이름표 (둥근 띠 글씨) */
class Hud {
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
  private items: { spr: THREE.Sprite; mat: THREE.SpriteMaterial; tex: THREE.CanvasTexture | null; text: string; aspect: number; bg: string; fg: string; pos: [number, number, number, number] | null }[] = [];
  private alive = true;
  constructor() {
    void document.fonts?.ready.then(() => {
      if (!this.alive) return;
      for (const it of this.items) {
        const s = it.text;
        it.text = '';
        this.paint(it, s);
      }
    });
  }
  add(text: string, bg = 'rgba(8,14,36,0.72)', fg = '#fff'): number {
    const mat = new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    const spr = new THREE.Sprite(mat);
    const it = { spr, mat, tex: null, text: '', aspect: 1, bg, fg, pos: null };
    this.items.push(it);
    this.scene.add(spr);
    this.paint(it, text);
    return this.items.length - 1;
  }
  private paint(it: Hud['items'][number], text: string): void {
    if (it.text === text) return;
    it.text = text;
    const fs = 40;
    const H = 66;
    const font = `700 ${fs}px ${F}`;
    const cv = document.createElement('canvas');
    let g = cv.getContext('2d')!;
    g.font = font;
    cv.width = Math.ceil(g.measureText(text).width) + 48;
    cv.height = H;
    g = cv.getContext('2d')!;
    g.font = font;
    g.fillStyle = it.bg;
    g.beginPath();
    g.roundRect(2, 2, cv.width - 4, H - 4, (H - 4) / 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.3)';
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = it.fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, cv.width / 2, H / 2 + 2);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    it.tex?.dispose();
    it.tex = tex;
    it.mat.map = tex;
    it.mat.needsUpdate = true;
    it.aspect = cv.width / H;
  }
  set(i: number, text: string): void {
    const it = this.items[i];
    if (it) this.paint(it, text);
  }
  /** x, y = 화면 비율 (왼쪽 위 0,0), ax/ay = 기준점 (0 왼쪽/위 ~ 1 오른쪽/아래). null 이면 숨김 */
  at(i: number, x: number, y: number, ax = 0.5, ay = 0.5): void {
    const it = this.items[i];
    if (it) it.pos = [x, y, ax, ay];
  }
  hide(i: number): void {
    const it = this.items[i];
    if (it) it.pos = null;
  }
  draw(r: THREE.WebGLRenderer, w: number, h: number): void {
    this.cam.right = w;
    this.cam.top = h;
    this.cam.updateProjectionMatrix();
    const hp = clamp(h * 0.08, 14, 30);
    const m = hp * 0.3;
    for (const it of this.items) {
      if (!it.pos) {
        it.spr.visible = false;
        continue;
      }
      it.spr.visible = true;
      const wp = hp * it.aspect;
      const [px, py, ax, ay] = it.pos;
      const x = clamp(px * w, m + wp * ax, w - m - wp * (1 - ax));
      const y = clamp((1 - py) * h, m + hp * (1 - ay), h - m - hp * ay);
      it.spr.center.set(ax, 1 - ay);
      it.spr.position.set(x, y, 0);
      it.spr.scale.set(wp, hp, 1);
    }
    const ac = r.autoClear;
    r.autoClear = false;
    r.setRenderTarget(null);
    r.setScissorTest(false);
    r.setViewport(0, 0, w, h);
    r.clearDepth();
    r.render(this.scene, this.cam);
    r.autoClear = ac;
  }
  dispose(): void {
    this.alive = false;
    for (const it of this.items) {
      it.tex?.dispose();
      it.mat.dispose();
    }
  }
}

/** 가운데 세로 줄 (나눠 보기) */
function drawDivider(r: THREE.WebGLRenderer, x: number, h: number, w: number): void {
  const cc = r.getClearColor(new THREE.Color());
  const ca = r.getClearAlpha();
  r.setScissorTest(true);
  r.setScissor(Math.round(x) - 1, 0, 2, h);
  r.setClearColor(0xffffff, 1);
  r.clear(true, false, false);
  r.setScissor(0, 0, w, h);
  r.setScissorTest(false);
  r.setClearColor(cc, ca);
}

/** 늘 쓰는 저해상 렌더 대상 */
class LowRT {
  rt: THREE.WebGLRenderTarget | null = null;
  constructor(
    private opts: THREE.RenderTargetOptions = {},
    private withDepth = false,
  ) {}
  get(w: number, h: number): THREE.WebGLRenderTarget {
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    if (!this.rt || this.rt.width !== w || this.rt.height !== h) {
      this.rt?.dispose();
      this.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, ...this.opts });
      if (this.withDepth) this.rt.depthTexture = new THREE.DepthTexture(w, h);
    }
    return this.rt;
  }
  dispose(): void {
    this.rt?.depthTexture?.dispose();
    this.rt?.dispose();
  }
}

/* ═════════════ i221 홀로그램 · 주사선 ═════════════ */

function makeHolo(): Scene3D {
  const scene = new THREE.Scene();
  scene.background = gradBg([
    [0, '#020611'],
    [0.6, '#06142c'],
    [1, '#0a1d3a'],
  ]);
  const cam = new THREE.PerspectiveCamera(36, 1.6, 0.1, 60);
  cam.position.set(0, 1.55, 5.0);
  cam.lookAt(0, 0.95, 0);
  scene.add(new THREE.HemisphereLight(0x6fa8ff, 0x0a0f1e, 0.9));
  const key = new THREE.PointLight(0x5ff3ff, 14, 8);
  key.position.set(0, 0.6, 0.8);
  scene.add(key);
  const dl = new THREE.DirectionalLight(0xffffff, 1.6);
  dl.position.set(2, 4, 3);
  scene.add(dl);

  const root = new THREE.Group();
  scene.add(root);
  // 바닥 (반사 느낌의 어두운 원판 + 격자)
  const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x07101f, metalness: 0.6, roughness: 0.45 }));
  root.add(floor);
  const grid = new THREE.GridHelper(8, 32, 0x1d4c7a, 0x0f2747);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.45;
  grid.position.y = 0.002;
  root.add(grid);
  // 투사기 받침
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.9, 0.24, 48), new THREE.MeshStandardMaterial({ color: 0x1b2438, metalness: 0.85, roughness: 0.32 }));
  base.position.y = 0.12;
  root.add(base);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.04, 48), new THREE.MeshBasicMaterial({ color: 0x9ffcff }));
  lens.position.y = 0.25;
  root.add(lens);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x38e8ff });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.025, 10, 64).rotateX(Math.PI / 2), ringMat);
  ring.position.y = 0.2;
  root.add(ring);

  const uni = { uTime: { value: 0 }, uDensity: { value: 46 }, uFlicker: { value: 0.6 }, uGlitch: { value: 1 }, uColor: { value: new THREE.Color(0x3fd8ff) } };
  const holoVert = /* glsl */ `
    uniform float uTime; uniform float uGlitch;
    varying vec3 vW; varying vec3 vN;
    float h1(float n){ return fract(sin(n) * 43758.5453); }
    void main(){
      vec4 w = modelMatrix * vec4(position, 1.0);
      float slice = floor(w.y * 16.0);
      float on = step(0.9, h1(slice * 7.13 + floor(uTime * 7.0))) * step(0.55, h1(floor(uTime * 3.0)));
      w.x += on * uGlitch * 0.14 * sin(uTime * 60.0 + slice);
      vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * w;
    }`;
  const holoFrag = /* glsl */ `
    uniform float uTime, uDensity, uFlicker; uniform vec3 uColor;
    varying vec3 vW; varying vec3 vN;
    float h1(float n){ return fract(sin(n) * 43758.5453); }
    void main(){
      vec3 V = normalize(cameraPosition - vW);
      vec3 N = normalize(vN);
      float fr = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 2.0);
      float sl = pow(sin(vW.y * uDensity - uTime * 5.0) * 0.5 + 0.5, 5.0);
      float b = fract(vW.y * 0.42 - uTime * 0.32);
      float band = smoothstep(0.0, 0.05, b) * (1.0 - smoothstep(0.05, 0.22, b));
      float fl = 1.0 - uFlicker * (step(0.8, h1(floor(uTime * 13.0))) * 0.55 + 0.07 * sin(uTime * 95.0));
      float a = (0.035 + fr * 1.2 + sl * 0.22 + band * 0.6) * fl;
      vec3 col = uColor * a + vec3(0.7, 0.95, 1.0) * fr * fr * 0.7 * fl;
      gl_FragColor = vec4(col, 1.0);
    }`;
  const holoMat = new THREE.ShaderMaterial({ uniforms: uni, vertexShader: holoVert, fragmentShader: holoFrag, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const plainMat = new THREE.MeshStandardMaterial({ color: 0x4fb2ff, metalness: 0.2, roughness: 0.35 });
  const knot = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(new THREE.TorusKnotGeometry(0.46, 0.15, 220, 28, 2, 3), holoMat);
  knot.position.y = 1.2;
  root.add(knot);
  // 바깥 그물 (데이터 느낌)
  const wire = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(0.95, 1)), holoMat);
  wire.position.y = 1.2;
  root.add(wire);
  // 빛 원뿔
  const coneMat = new THREE.ShaderMaterial({
    uniforms: uni,
    vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uColor; varying vec2 vUv; varying vec3 vW;
      void main(){
        float fade = pow(1.0 - vUv.y, 1.6);
        float rays = 0.65 + 0.35 * sin(vUv.x * 60.0 + uTime * 1.5) * sin(vUv.x * 23.0 - uTime);
        float sl = 0.8 + 0.2 * sin(vW.y * 40.0 - uTime * 6.0);
        gl_FragColor = vec4(uColor * fade * rays * sl * 0.28, 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.48, 1.95, 48, 1, true), coneMat);
  cone.position.y = 0.25 + 1.95 / 2;
  root.add(cone);
  // 솟는 빛 알갱이
  const N = 140;
  const pp = new Float32Array(N * 3);
  const r0 = rng(7);
  for (let i = 0; i < N; i++) {
    const a = r0() * Math.PI * 2;
    const rr = Math.sqrt(r0()) * 0.75;
    pp[i * 3] = Math.cos(a) * rr;
    pp[i * 3 + 1] = r0();
    pp[i * 3 + 2] = Math.sin(a) * rr;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  const pMat = new THREE.ShaderMaterial({
    uniforms: uni,
    vertexShader: /* glsl */ `uniform float uTime; varying float vA;
      void main(){ vec3 p = position; float y = fract(p.y + uTime * (0.12 + p.y * 0.05)); p.y = 0.28 + y * 2.0; p.xz *= 1.0 + y * 0.6;
        vA = sin(y * 3.14159); vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = 34.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform vec3 uColor; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(uColor * a * vA * 1.2, 1.0); }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  root.add(new THREE.Points(pGeo, pMat));

  const hud = new Hud();
  const tag = hud.add('홀로그램 셰이더', 'rgba(10,60,90,0.75)');
  hud.at(tag, 0.03, 0.05, 0, 0);
  let holo = true;
  return {
    scene,
    camera: cam,
    update(t) {
      uni.uTime.value = t;
      knot.rotation.y = t * 0.6;
      knot.rotation.x = Math.sin(t * 0.4) * 0.3;
      wire.rotation.y = -t * 0.25;
      wire.rotation.z = t * 0.1;
      ringMat.color.setHSL(0.52, 1, 0.45 + 0.15 * Math.sin(t * 3));
    },
    render(r, w, h) {
      r.render(scene, cam);
      hud.draw(r, w, h);
    },
    controls: [
      { type: 'toggle', label: '홀로그램 켜기 (끄면 그냥 재질)', value: true, on: (v) => {
          holo = v;
          knot.material = holo ? holoMat : plainMat;
          wire.visible = holo;
          hud.set(tag, holo ? '홀로그램 셰이더' : '그냥 재질');
        } },
      { type: 'range', label: '주사선 촘촘함', min: 10, max: 120, step: 1, value: 46, on: (v) => (uni.uDensity.value = v) },
      { type: 'range', label: '깜박임', min: 0, max: 1, step: 0.05, value: 0.6, on: (v) => (uni.uFlicker.value = v) },
      { type: 'toggle', label: '글리치 (가로 찢김)', value: true, on: (v) => (uni.uGlitch.value = v ? 1 : 0) },
    ],
    dispose() {
      freeAll(root);
      plainMat.dispose();
      (scene.background as THREE.Texture).dispose();
      hud.dispose();
    },
  };
}

/* ═════════════ i222 툰 물 · 기슭 거품 — 섬 · 배까지 툰으로 (2026-10-08 다시, lib/toonIsle.ts) ═════════════ */

/* ═════════════ i223 바람 풀밭 (인스턴싱) ═════════════ */

function makeGrass(): Scene3D {
  const scene = new THREE.Scene();
  scene.background = gradBg([
    [0, '#6fb6ff'],
    [0.75, '#cfe9ff'],
    [1, '#f6efd6'],
  ]);
  scene.fog = new THREE.Fog(0xdcecf6, 7, 16);
  const cam = new THREE.PerspectiveCamera(40, 1.6, 0.1, 60);
  cam.position.set(0, 2.6, 5.6);
  cam.lookAt(0, 0.2, 0);
  scene.add(new THREE.HemisphereLight(0xeaf6ff, 0x4a6a2a, 1.3));
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.2);
  sun.position.set(3, 6, 2);
  scene.add(sun);
  const root = new THREE.Group();
  scene.add(root);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(9, 64).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3f7a26 }));
  root.add(ground);

  // 잎 하나 (끝으로 갈수록 좁아짐, 7마디)
  const SEG = 6;
  const bp: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= SEG; i++) {
    const y = i / SEG;
    const wdt = 0.045 * (1 - y) ** 0.9 + 0.002;
    bp.push(-wdt, y, 0, wdt, y, 0);
    if (i < SEG) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const MAX = 16000;
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
  geo.setIndex(idx);
  const off = new Float32Array(MAX * 4);
  const r0 = rng(31);
  for (let i = 0; i < MAX; i++) {
    const a = r0() * Math.PI * 2;
    const rr = Math.sqrt(r0()) * 8.5;
    off[i * 4] = Math.cos(a) * rr;
    off[i * 4 + 1] = Math.sin(a) * rr;
    off[i * 4 + 2] = r0() * Math.PI * 2;
    off[i * 4 + 3] = 0.55 + r0() * 0.6;
  }
  geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
  geo.instanceCount = 11000;
  const uni = { uTime: { value: 0 }, uWind: { value: 1 }, uPush: { value: 1 }, uChar: { value: new THREE.Vector2() }, fogColor: { value: new THREE.Color(0xdcecf6) } };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform float uTime, uWind, uPush; uniform vec2 uChar;
      attribute vec4 aOff;
      varying float vY; varying float vGust; varying float vVar; varying float vDist;
      ${NOISE}
      void main(){
        float y = position.y * aOff.w * 0.42;
        float c = cos(aOff.z), s = sin(aOff.z);
        vec3 p = vec3(position.x * c, y, position.x * s);
        vec2 base = aOff.xy;
        vec2 wdir = normalize(vec2(1.0, 0.35));
        float gust = sin(dot(base, wdir) * 0.9 - uTime * 2.1) * 0.5 + 0.5;
        gust = gust * gust * (0.6 + 0.8 * noise(base * 0.35 + uTime * 0.25));
        float k = position.y * position.y;
        float bend = uWind * (0.12 + gust * 0.55) + 0.05 * sin(uTime * 3.0 + aOff.z * 5.0) * uWind;
        p.xz += wdir * bend * k * aOff.w * 0.42;
        vec2 d = base - uChar; float dist = length(d);
        float push = (1.0 - smoothstep(0.15, 0.85, dist)) * uPush;
        p.xz += normalize(d + 1e-4) * push * k * 0.5;
        p.y *= 1.0 - push * 0.55 * position.y - bend * 0.25 * k;
        vec4 w = vec4(p + vec3(base.x, 0.0, base.y), 1.0);
        vY = position.y; vGust = gust * uWind; vVar = hash(base * 3.1);
        vec4 mv = viewMatrix * w; vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 fogColor;
      varying float vY; varying float vGust; varying float vVar; varying float vDist;
      void main(){
        vec3 root = vec3(0.06, 0.20, 0.03);
        vec3 tip = mix(vec3(0.42, 0.72, 0.16), vec3(0.62, 0.78, 0.22), vVar);
        vec3 col = mix(root, tip, pow(vY, 0.8));
        col += vec3(0.25, 0.24, 0.08) * vGust * vY * vY;
        float f = smoothstep(7.0, 16.0, vDist);
        col = mix(col, fogColor, f);
        gl_FragColor = vec4(col, 1.0);
        ${OUT}
      }`,
  });
  const grass = new THREE.Mesh(geo, mat);
  grass.frustumCulled = false;
  root.add(grass);
  // 굴러가는 꼬마 (노란 공 + 눈)
  const kid = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 24), new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.5 }));
  body.position.y = 0.3;
  const eyeGeo = new THREE.SphereGeometry(0.045, 12, 10);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1a1a2a });
  for (const sx of [-0.1, 0.1]) {
    const e = new THREE.Mesh(eyeGeo, eyeMat);
    e.position.set(sx, 0.38, 0.26);
    kid.add(e);
  }
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 8).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xff8a2a }));
  beak.position.set(0, 0.3, 0.32);
  kid.add(body, beak);
  root.add(kid);
  return {
    scene,
    camera: cam,
    update(t) {
      uni.uTime.value = t;
      const a = t * 0.45;
      const x = Math.cos(a) * 1.8;
      const z = Math.sin(a) * 1.2 + 0.4;
      kid.position.set(x, Math.abs(Math.sin(t * 6)) * 0.08, z);
      kid.rotation.y = Math.atan2(-Math.sin(a) * 1.8, Math.cos(a) * 1.2);
      uni.uChar.value.set(x, z);
    },
    controls: [
      { type: 'range', label: '바람 세기', min: 0, max: 2, step: 0.05, value: 1, on: (v) => (uni.uWind.value = v) },
      { type: 'range', label: '잎 수', min: 2000, max: MAX, step: 500, value: 11000, on: (v) => (geo.instanceCount = v) },
      { type: 'toggle', label: '꼬마 둘레 눕히기', value: true, on: (v) => (uni.uPush.value = v ? 1 : 0) },
    ],
    dispose() {
      freeAll(root);
      (scene.background as THREE.Texture).dispose();
    },
  };
}

/* ═════════════ i224 대기 산란 하늘 ═════════════ */

/**
 * 대기 산란 하늘 + 산맥 (2026-10-07 다시 — 사용자: 「하늘은 진짜 같은데 산 · 밤하늘이 많이 떨어진다」)
 *  - 하늘: three Sky (레일리 · 미 산란)
 *  - 공기 원근: 하늘만 64px 큐브로 매 장면 구워, 산이 멀수록 「그 방향의 진짜 하늘색」으로 녹아든다 (노을이면 노을빛 안개)
 *  - 산맥: 능선 잡음(ridged fbm)으로 깎은 산 네 겹 + 앞 언덕 · 소나무. 높이 · 경사로 바위 · 풀 · 눈, 해 · 달 · 하늘빛 조명
 *  - 밤: 색온도 · 밝기가 다른 별 1만 개(반짝임) · 은하수 띠(먼지 줄 · 밝은 핵) · 달(크레이터 · 달무리) · 달빛에 비친 눈
 */
function makeSky(): Scene3D {
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(48, 1.6, 1, 30000);
  cam.position.set(0, 70, 420);
  cam.lookAt(0, 150, -1400);
  const sky = new Sky();
  sky.scale.setScalar(15000);
  scene.add(sky);
  const su = sky.material.uniforms;
  su.turbidity!.value = 8;
  su.rayleigh!.value = 2.4;
  su.mieCoefficient!.value = 0.005;
  su.mieDirectionalG!.value = 0.8;
  if (su.cloudCoverage) su.cloudCoverage.value = 0.25;

  // ── 굽는 잡음 (산 무늬 · 은하수) ──
  const NS = 256;
  const nd = new Uint8Array(NS * NS * 4);
  {
    const r = rng(11);
    const grid = (o: number): number[] => Array.from({ length: o * o }, () => r());
    const lv = [4, 8, 16, 32, 64].map((o) => ({ o, g: grid(o) }));
    const lv2 = [6, 12, 24, 48].map((o) => ({ o, g: grid(o) }));
    const sample = (L: { o: number; g: number[] }[], u: number, v: number): number => {
      let s = 0;
      let a = 0.5;
      let tot = 0;
      for (const { o, g } of L) {
        const x = u * o;
        const y = v * o;
        const xi = Math.floor(x);
        const yi = Math.floor(y);
        const fx = x - xi;
        const fy = y - yi;
        const sx = fx * fx * (3 - 2 * fx);
        const sy = fy * fy * (3 - 2 * fy);
        const at = (i: number, j: number): number => g[(((j % o) + o) % o) * o + (((i % o) + o) % o)]!;
        s += a * lerp(lerp(at(xi, yi), at(xi + 1, yi), sx), lerp(at(xi, yi + 1), at(xi + 1, yi + 1), sx), sy);
        tot += a;
        a *= 0.5;
      }
      return s / tot;
    };
    for (let y = 0; y < NS; y++)
      for (let x = 0; x < NS; x++) {
        const i = (y * NS + x) * 4;
        nd[i] = Math.round(sample(lv, x / NS, y / NS) * 255);
        nd[i + 1] = Math.round(sample(lv2, x / NS, y / NS) * 255);
        nd[i + 2] = Math.round(r() * 255);
        nd[i + 3] = 255;
      }
  }
  const noiseTex = new THREE.DataTexture(nd, NS, NS);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
  noiseTex.magFilter = THREE.LinearFilter;
  noiseTex.minFilter = THREE.LinearMipmapLinearFilter;
  noiseTex.generateMipmaps = true;
  noiseTex.needsUpdate = true;

  // ── 밤하늘 (은하수 · 대기광) — 하늘 위에 더한다 ──
  const nightMat = new THREE.ShaderMaterial({
    uniforms: { uK: { value: 0 }, uNoise: { value: noiseTex } },
    vertexShader: /* glsl */ `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uK; uniform sampler2D uNoise; varying vec3 vP;
      float tri(vec3 p, float s, int ch){ vec3 w = abs(p); w /= (w.x + w.y + w.z);
        vec4 a = texture2D(uNoise, p.yz * s), b = texture2D(uNoise, p.xz * s), c = texture2D(uNoise, p.xy * s);
        vec4 m = a * w.x + b * w.y + c * w.z; return ch == 0 ? m.r : m.g; }
      void main(){
        vec3 d = normalize(vP);
        float h = max(d.y, 0.0);
        // 밤 하늘빛: 머리 위 짙은 남색 → 지평선 쪽 옅은 대기광
        vec3 c = mix(vec3(0.16, 0.20, 0.36), vec3(0.015, 0.02, 0.06), pow(h, 0.45));
        // 은하수 띠: 큰 원 둘레 + 잡음 결 + 가운데 먼지 줄 + 밝은 핵
        vec3 bn = normalize(vec3(0.63, -0.71, -0.32));
        float b = dot(d, bn);
        float n1 = tri(d, 0.9, 0), n2 = tri(d * 1.7 + 3.0, 1.3, 1), n3 = tri(d * 3.1 + 7.0, 2.6, 0);
        // 넓고 옅은 띠 + 잔 결(별구름) — 가운데로 갈수록 진하게
        float band = exp(-b * b * 30.0) * (0.45 + 0.9 * n1) * (0.6 + 0.6 * n3);
        // 먼지 줄: 띠 한가운데를 가늘게 지나는 어두운 갈래 (가장자리는 부드럽게)
        float dust = exp(-pow(b + 0.025 * (n2 - 0.5), 2.0) * 520.0) * smoothstep(0.4, 0.62, n3 * 0.65 + n2 * 0.35);
        vec3 coreDir = normalize(vec3(-0.42, 0.24, -0.88));
        float core = pow(max(dot(d, coreDir), 0.0), 18.0);
        vec3 mw = vec3(0.55, 0.6, 0.82) * band * (1.0 - dust * 0.8) + vec3(1.0, 0.84, 0.66) * core * (0.6 + 0.6 * n3) * (1.0 - dust * 0.9);
        c += mw * 0.42 * smoothstep(0.0, 0.16, d.y);
        gl_FragColor = vec4(c * uK, 1.0);
      }`,
    side: THREE.BackSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const night = new THREE.Mesh(new THREE.SphereGeometry(9000, 48, 24), nightMat);
  night.renderOrder = -1;
  scene.add(night);

  // ── 공기 원근용 하늘 큐브 (하늘 · 밤 하늘빛만, 매 장면 64px) ──
  const skyScene = new THREE.Scene();
  const sky2 = new Sky();
  sky2.material = sky.material;
  sky2.scale.setScalar(15000);
  skyScene.add(sky2);
  const night2 = new THREE.Mesh(night.geometry, nightMat);
  skyScene.add(night2);
  const cubeRT = new THREE.WebGLCubeRenderTarget(64, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const cubeCam = new THREE.CubeCamera(1, 30000, cubeRT);
  cubeCam.position.copy(cam.position);

  // ── 산 재질 (바위 · 풀 · 눈 + 해 · 달 · 하늘빛 + 공기 원근) ──
  const mountUniforms = {
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color(1, 1, 1) },
    uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
    uMoonCol: { value: new THREE.Color(0, 0, 0) },
    uSkyAmb: { value: new THREE.Color(0.3, 0.4, 0.6) },
    uGndAmb: { value: new THREE.Color(0.08, 0.08, 0.06) },
    uEnv: { value: cubeRT.texture },
    uNoise: { value: noiseTex },
    uFog: { value: 0.00024 },
    uSnow: { value: 1150 },
  };
  const mountMat = (tree: boolean): THREE.ShaderMaterial =>
    new THREE.ShaderMaterial({
      uniforms: { ...mountUniforms, uTree: { value: tree ? 1 : 0 } },
      vertexShader: /* glsl */ `
        attribute float aH; varying vec3 vW; varying vec3 vN; varying float vH;
        void main(){
          vec4 lp = vec4(position, 1.0); vec3 nn = normal;
          #ifdef USE_INSTANCING
            lp = instanceMatrix * lp; nn = mat3(instanceMatrix) * nn;
          #endif
          vec4 wp = modelMatrix * lp; vW = wp.xyz; vN = normalize(mat3(modelMatrix) * nn); vH = aH;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunDir, uSunCol, uMoonDir, uMoonCol, uSkyAmb, uGndAmb; uniform samplerCube uEnv; uniform sampler2D uNoise;
        uniform float uFog, uSnow, uTree; varying vec3 vW; varying vec3 vN; varying float vH;
        void main(){
          vec3 n = normalize(vN);
          float e = 0.6, hx = texture2D(uNoise, (vW.xz + vec2(e, 0.0)) * 0.006).g - texture2D(uNoise, (vW.xz - vec2(e, 0.0)) * 0.006).g;
          float hz = texture2D(uNoise, (vW.xz + vec2(0.0, e)) * 0.006).g - texture2D(uNoise, (vW.xz - vec2(0.0, e)) * 0.006).g;
          if (uTree < 0.5) n = normalize(n + vec3(-hx, 0.0, -hz) * 9.0 * (1.0 - smoothstep(0.85, 0.98, n.y)));
          float n1 = texture2D(uNoise, vW.xz * 0.0011).r, n2 = texture2D(uNoise, vW.xz * 0.009).g, n3 = texture2D(uNoise, vec2(vW.x * 0.004, vW.y * 0.03)).r;
          // 바위: 층 무늬(높이 따라 띠) + 결
          vec3 rock = mix(vec3(0.12, 0.11, 0.105), vec3(0.27, 0.24, 0.21), n2) * (0.75 + 0.5 * n3);
          vec3 grass = mix(vec3(0.05, 0.09, 0.04), vec3(0.14, 0.17, 0.07), n1);
          float flat_ = smoothstep(0.72, 0.9, n.y);
          // 풀은 낮은 곳 · 완만한 곳, 눈은 실제 높이(해발) 기준 — 낮은 언덕엔 눈이 없다
          vec3 alb = mix(rock, grass, flat_ * (1.0 - smoothstep(260.0, 520.0, vW.y + (n1 - 0.5) * 160.0)));
          // 눈: 높은 곳 + 완만한 곳, 경계는 잡음으로 들쭉날쭉
          float snow = smoothstep(uSnow - 60.0, uSnow + 50.0, vW.y + (n1 - 0.5) * 260.0 + (n2 - 0.5) * 90.0) * smoothstep(0.42, 0.68, n.y);
          alb = mix(alb, vec3(0.88, 0.9, 0.95), snow);
          if (uTree > 0.5) alb = vec3(0.03, 0.055, 0.035) * (0.8 + 0.4 * n2);
          float dif = max(dot(n, uSunDir), 0.0);
          float mdif = max(dot(n, uMoonDir), 0.0);
          vec3 amb = mix(uGndAmb, uSkyAmb, n.y * 0.5 + 0.5);
          vec3 col = alb * (uSunCol * dif + uMoonCol * mdif + amb);
          // 공기 원근 — 그 방향 하늘색으로 녹아든다 (높을수록 공기가 옅다)
          vec3 v = vW - cameraPosition; float d = length(v); vec3 dir = v / d;
          vec3 fd = normalize(vec3(dir.x, max(dir.y, 0.0) * 0.6 + 0.04, dir.z));
          vec3 fogC = textureLod(uEnv, fd, 3.6).rgb; // 흐린 밉맵 — 해 원반이 그대로 박히면 빛기둥이 생긴다
          // 해 쪽 하늘은 다른 곳보다 수십 배 밝다 — 그대로 안개 색으로 쓰면 해 쪽 앞 들판 · 나무까지 하얗게 덮인다.
          // 머리 위 하늘 밝기의 몇 배까지만 (해 쪽이 조금 더 밝은 느낌은 남긴다)
          vec3 lw = vec3(0.2126, 0.7152, 0.0722);
          vec3 zen = textureLod(uEnv, normalize(vec3(fd.x * 0.25, 1.0, fd.z * 0.25)), 5.0).rgb;
          float capL = 2.2 * dot(zen, lw) + 1e-5;
          float fL = dot(fogC, lw);
          fogC *= min(1.0, capL / max(fL, 1e-5));
          float hf = exp(-max(vW.y, 0.0) * 0.0009);
          // 가까운 곳(앞 들판 · 기슭 숲)은 공기가 얇다 — 300 너머부터 안개
          float fog = 1.0 - exp(-max(d - 300.0, 0.0) * uFog * hf);
          col = mix(col, fogC, clamp(fog, 0.0, 1.0));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
  const matM = mountMat(false);
  const matT = mountMat(true);

  // 능선 잡음 (ridged multifractal) — 날카로운 봉우리와 골짜기
  const vrand = rng(23);
  const perm = Array.from({ length: 512 }, () => vrand());
  const vn = (x: number, y: number): number => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const h = (i: number, j: number): number => perm[(((i * 73 + j * 151) % 512) + 512) % 512]!;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    return lerp(lerp(h(xi, yi), h(xi + 1, yi), sx), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), sx), sy);
  };
  const ridged = (x: number, y: number, oct: number): number => {
    let s = 0;
    let a = 0.5;
    let f = 1;
    let w = 1;
    for (let o = 0; o < oct; o++) {
      let v = 1 - Math.abs(vn(x * f, y * f) * 2 - 1);
      v *= v * w;
      w = clamp(v * 2, 0, 1);
      s += v * a;
      f *= 2.03;
      a *= 0.5;
    }
    return s;
  };
  /** 산 한 겹: 가운데 깊이 z0, 폭 W, 깊이 D, 높이 H. 앞뒤 가장자리는 낮아져 능선 띠가 된다 */
  const geos: THREE.BufferGeometry[] = [];
  /** 산 한 겹의 높이 (겹 안 좌표 x · z) — 메시와 나무 놓기가 같은 식을 쓴다 */
  const layerY = (x: number, z: number, D: number, H: number, sc: number, seed: number): number => {
    const q = z / (D / 2); // -1 (뒤) … 1 (앞)
    const prof = Math.exp(-((q + 0.15) ** 2) * 2.2);
    const big = 0.55 + 0.45 * vn(x * sc * 0.25 + seed, seed * 3);
    const r = ridged(x * sc + seed, z * sc + seed * 7, 6);
    return Math.max(-20, H * prof * big * (r * 1.25 - 0.1));
  };
  const layer = (z0: number, W: number, D: number, H: number, sc: number, seed: number, nx: number, nz: number): THREE.Mesh => {
    const g = new THREE.PlaneGeometry(W, D, nx, nz).rotateX(-Math.PI / 2);
    const p = g.attributes.position as THREE.BufferAttribute;
    const aH = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const y = layerY(x, z, D, H, sc, seed);
      p.setY(i, y);
      aH[i] = clamp(y / H, 0, 1);
    }
    g.setAttribute('aH', new THREE.BufferAttribute(aH, 1));
    g.computeVertexNormals();
    geos.push(g);
    const m = new THREE.Mesh(g, matM);
    m.position.z = z0;
    scene.add(m);
    return m;
  };
  layer(-4200, 22000, 2600, 2100, 0.00042, 1.7, 220, 40);
  layer(-2600, 13000, 1600, 1250, 0.0007, 5.1, 220, 40);
  layer(-1500, 8000, 1100, 640, 0.0012, 9.3, 200, 40);
  const near = layer(-650, 4600, 900, 230, 0.0021, 2.2, 180, 40);
  // 앞 들판 (완만한 언덕)
  const fieldY = (x: number, z: number): number => (vn(x * 0.004, z * 0.004) - 0.5) * 40 + (vn(x * 0.013 + 4, z * 0.013) - 0.5) * 10 - 10;
  const fg = new THREE.PlaneGeometry(3000, 900, 120, 40).rotateX(-Math.PI / 2);
  {
    const p = fg.attributes.position as THREE.BufferAttribute;
    const aH = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      p.setY(i, fieldY(x, z));
      aH[i] = 0;
    }
    fg.setAttribute('aH', new THREE.BufferAttribute(aH, 1));
    fg.computeVertexNormals();
    geos.push(fg);
  }
  const field = new THREE.Mesh(fg, matM);
  field.position.z = 0;
  scene.add(field);
  // 소나무 (원뿔 셋 겹친 실루엣) — 앞 들판 · 가까운 산 기슭에
  const treeG = new THREE.ConeGeometry(1, 2.2, 7, 1).translate(0, 1.1, 0);
  const t2 = new THREE.ConeGeometry(0.78, 1.8, 7, 1).translate(0, 2.0, 0);
  const t3 = new THREE.ConeGeometry(0.55, 1.4, 7, 1).translate(0, 2.8, 0);
  const pine = (() => {
    const parts = [treeG, t2, t3];
    const pos: number[] = [];
    const nor: number[] = [];
    for (const pg of parts) {
      const ng = pg.toNonIndexed();
      pos.push(...(ng.attributes.position!.array as Float32Array));
      nor.push(...(ng.attributes.normal!.array as Float32Array));
      ng.dispose();
      pg.dispose();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('aH', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3), 1));
    return g;
  })();
  geos.push(pine);
  const NT = 900;
  const trees = new THREE.InstancedMesh(pine, matT, NT);
  {
    const m4 = new THREE.Matrix4();
    // 위에서 내려본 땅 높이 = 들판(|x| ≤ 1500, |z| ≤ 450) · 가까운 산(z0 −650, 4600 × 900) 중 높은 쪽 — 광선 6천 번(1초) 대신 식으로
    const groundAt = (x: number, z: number): number => {
      let y = -Infinity;
      if (Math.abs(x) <= 1500 && Math.abs(z) <= 450) y = fieldY(x, z);
      if (Math.abs(x) <= 2300 && Math.abs(z + 650) <= 450) y = Math.max(y, layerY(x, z + 650, 900, 230, 0.0021, 2.2));
      return y;
    };
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const tr = rng(41);
    field.updateMatrixWorld();
    near.updateMatrixWorld();
    let k = 0;
    for (let tries = 0; tries < 6000 && k < NT; tries++) {
      const onNear = tr() < 0.45;
      const x = (tr() - 0.5) * (onNear ? 4200 : 2600);
      const z = onNear ? -650 + (tr() - 0.2) * 700 : -380 + tr() * 520;
      // 무리 지어 자라게 (잡음이 높은 곳만)
      if (vn(x * 0.006 + 9, z * 0.006) < 0.5) continue;
      const gy = groundAt(x, z);
      if (!Number.isFinite(gy)) continue;
      // 경사: 주변 높이 차로 법선 y (0.8 아래면 너무 가팔라 나무 없음)
      const e = 6;
      const dx = groundAt(x + e, z) - groundAt(x - e, z);
      const dz = groundAt(x, z + e) - groundAt(x, z - e);
      const ny = (2 * e) / Math.hypot(dx, 2 * e, dz);
      if (!Number.isFinite(ny) || ny < 0.8) continue;
      const hit = { point: new THREE.Vector3(x, gy, z) };
      const sz = (onNear ? 14 : 7) * (0.7 + tr() * 0.6);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), tr() * 6.28);
      s.set(sz * (0.8 + tr() * 0.3), sz, sz * (0.8 + tr() * 0.3));
      m4.compose(hit.point, q, s);
      trees.setMatrixAt(k++, m4);
    }
    trees.count = k;
    trees.instanceMatrix.needsUpdate = true;
  }
  scene.add(trees);

  // ── 별 (색온도 · 밝기 · 반짝임) ──
  const NSTAR = 11000;
  const sp = new Float32Array(NSTAR * 3);
  const ss = new Float32Array(NSTAR);
  const sc = new Float32Array(NSTAR * 3);
  const sph = new Float32Array(NSTAR);
  {
    const r0 = rng(5);
    const bn = new THREE.Vector3(0.63, -0.71, -0.32).normalize();
    const tmp = new THREE.Vector3();
    const temps = [
      [0.62, 0.72, 1.0],
      [0.82, 0.88, 1.0],
      [1.0, 1.0, 1.0],
      [1.0, 0.94, 0.8],
      [1.0, 0.8, 0.56],
      [1.0, 0.66, 0.46],
    ];
    for (let i = 0; i < NSTAR; i++) {
      // 40% 는 은하수 띠 근처에 몰리게
      for (;;) {
        tmp.set(r0() * 2 - 1, r0() * 2 - 1, r0() * 2 - 1);
        const l = tmp.length();
        if (l > 1 || l < 0.05) continue;
        tmp.divideScalar(l);
        if (i % 5 < 2 && Math.abs(tmp.dot(bn)) > 0.12 + r0() * 0.1) continue;
        break;
      }
      if (tmp.y < -0.05) tmp.y = -tmp.y;
      sp.set([tmp.x * 8000, tmp.y * 8000, tmp.z * 8000], i * 3);
      const mag = Math.pow(r0(), 9); // 대부분 어둡고 몇 개만 밝다
      ss[i] = 0.8 + mag * 5.2;
      const t = temps[Math.min(5, Math.floor(Math.pow(r0(), 1.4) * 6))]!;
      const br = 0.35 + mag * 2.4 + r0() * 0.25;
      sc.set([t[0]! * br, t[1]! * br, t[2]! * br], i * 3);
      sph[i] = r0() * 100;
    }
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  sg.setAttribute('aSize', new THREE.BufferAttribute(ss, 1));
  sg.setAttribute('aCol', new THREE.BufferAttribute(sc, 3));
  sg.setAttribute('aPh', new THREE.BufferAttribute(sph, 1));
  const starMat = new THREE.ShaderMaterial({
    uniforms: { uK: { value: 0 }, uTime: { value: 0 }, uPx: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aSize, aPh; attribute vec3 aCol; uniform float uTime, uPx; varying vec3 vC; varying float vTw;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        vec3 wd = normalize((modelMatrix * vec4(position, 1.0)).xyz);
        float ext = smoothstep(-0.02, 0.25, wd.y); // 지평선 가까운 별은 공기에 가려 흐리게
        vTw = (0.72 + 0.28 * sin(uTime * (2.0 + mod(aPh, 3.0)) + aPh)) * ext;
        vC = aCol;
        gl_PointSize = aSize * uPx * (0.6 + 0.4 * ext);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uK; varying vec3 vC; varying float vTw;
      void main(){
        vec2 q = gl_PointCoord - 0.5; float r = length(q);
        float core = smoothstep(0.5, 0.0, r);
        float a = core * core;
        gl_FragColor = vec4(vC * a * vTw * uK * 2.2, 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const stars = new THREE.Points(sg, starMat);
  scene.add(stars);

  // ── 달 (크레이터 무늬 캔버스 + 달무리) ──
  const moonCanvas = document.createElement('canvas');
  moonCanvas.width = moonCanvas.height = 256;
  {
    const g = moonCanvas.getContext('2d')!;
    const r0 = rng(77);
    const gr = g.createRadialGradient(110, 110, 10, 128, 128, 124);
    gr.addColorStop(0, '#f4f1e8');
    gr.addColorStop(1, '#bdb8ab');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(128, 128, 124, 0, Math.PI * 2);
    g.fill();
    g.save();
    g.clip();
    // 바다 (어두운 넓은 얼룩)
    for (const [x, y, rr] of [[96, 86, 46], [150, 120, 38], [120, 168, 30], [70, 140, 22]] as const) {
      g.fillStyle = 'rgba(120,118,112,0.38)';
      g.beginPath();
      g.ellipse(x, y, rr, rr * 0.8, r0() * 3, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 70; i++) {
      const x = r0() * 256;
      const y = r0() * 256;
      const rr = 2 + Math.pow(r0(), 3) * 16;
      g.fillStyle = 'rgba(90,88,84,0.35)';
      g.beginPath();
      g.arc(x, y, rr, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,255,250,0.35)';
      g.lineWidth = Math.max(1, rr * 0.18);
      g.beginPath();
      g.arc(x - rr * 0.12, y - rr * 0.12, rr, Math.PI * 0.9, Math.PI * 1.9);
      g.stroke();
    }
    g.restore();
  }
  const moonTex = new THREE.CanvasTexture(moonCanvas);
  moonTex.colorSpace = THREE.SRGBColorSpace;
  const moonMat = new THREE.MeshBasicMaterial({ map: moonTex, transparent: true, depthWrite: false, fog: false, color: new THREE.Color(3, 3, 2.9) });
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), moonMat);
  const haloMat = new THREE.ShaderMaterial({
    uniforms: { uK: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform float uK; varying vec2 vUv; void main(){ float r = length(vUv - 0.5) * 2.0; float a = (exp(-r * 5.0) * 0.9 + exp(-r * 1.6) * 0.18) * smoothstep(1.0, 0.6, r); gl_FragColor = vec4(vec3(0.55, 0.62, 0.8) * a * uK, 1.0); }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), haloMat);
  scene.add(halo, moon);
  const moonDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 24), THREE.MathUtils.degToRad(160));
  const placeSprite = (m: THREE.Mesh, dir: THREE.Vector3, dist: number, size: number): void => {
    m.position.copy(cam.position).addScaledVector(dir, dist);
    m.quaternion.copy(cam.quaternion);
    m.scale.setScalar(size);
  };

  const hud = new Hud();
  const tag = hud.add('해 높이 30°');
  const tag2 = hud.add('three Sky — 레일리 · 미 산란 · 공기 원근', 'rgba(8,14,36,0.55)');
  hud.at(tag, 0.03, 0.05, 0, 0);
  hud.at(tag2, 0.97, 0.95, 1, 1);
  let auto = true;
  let manual = 20;
  let elev = 30;
  let fogUser = 0.00024;
  let fogK = 1;
  const sunDir = new THREE.Vector3();
  const c = new THREE.Color();
  return {
    scene,
    camera: cam,
    tone: THREE.ACESFilmicToneMapping,
    update(t) {
      elev = auto ? -9 + 47 * (0.5 + 0.5 * Math.cos(t * 0.26)) : manual;
      const phi = THREE.MathUtils.degToRad(90 - elev);
      // 해 방향: 낮게 뜨면 앞쪽(노을이 산 뒤로), 높이 뜨면 왼쪽 뒤로 돌아가 하늘이 파랗고 산이 옆빛을 받는다
      sunDir.setFromSphericalCoords(1, phi, THREE.MathUtils.degToRad(lerp(-150, -75, smooth(6, 30, elev))));
      su.sunPosition!.value.copy(sunDir);
      if (su.time) su.time.value = t * 40;
      const day = smooth(-4, 10, elev);
      const nightK = 1 - smooth(-7, 2, elev);
      // 해빛: 낮을수록 붉게, 지평선 아래면 0
      c.setRGB(1, lerp(0.42, 0.96, smooth(0, 25, elev)), lerp(0.18, 0.9, smooth(0, 30, elev)));
      mountUniforms.uSunDir.value.copy(sunDir);
      mountUniforms.uSunCol.value.copy(c).multiplyScalar(9 * smooth(-2, 6, elev));
      mountUniforms.uMoonDir.value.copy(moonDir);
      mountUniforms.uMoonCol.value.setRGB(0.32, 0.4, 0.62).multiplyScalar(0.55 * nightK);
      // 하늘빛 (위에서 오는 빛): 낮 파랑 → 노을 보랏빛 → 밤 남색
      mountUniforms.uSkyAmb.value.setRGB(lerp(0.05, 0.62, day), lerp(0.07, 0.78, day), lerp(0.16, 1.1, day)).multiplyScalar(1.1 + 1.1 * day);
      mountUniforms.uGndAmb.value.setRGB(0.05 * day + 0.01, 0.05 * day + 0.012, 0.04 * day + 0.02);
      fogK = lerp(1, 0.75, smooth(8, 30, elev));
      mountUniforms.uFog.value = fogUser * fogK;
      nightMat.uniforms.uK!.value = nightK;
      starMat.uniforms.uK!.value = 1 - smooth(-8, 1, elev);
      starMat.uniforms.uTime!.value = t;
      stars.rotation.y = t * 0.004;
      haloMat.uniforms.uK!.value = nightK;
      moonMat.opacity = smooth(-12, 0, -elev) * 0.95 + 0.05 * nightK;
      moon.visible = moonMat.opacity > 0.03;
      halo.visible = moon.visible;
      hud.set(tag, `해 높이 ${Math.round(elev)}° · ${elev > 12 ? '낮' : elev > -1 ? '노을' : elev > -6 ? '땅거미' : '밤'}`);
    },
    render(r, w, h) {
      starMat.uniforms.uPx!.value = Math.max(1, h / 600) * r.getPixelRatio();
      placeSprite(moon, moonDir, 6000, 250);
      placeSprite(halo, moonDir, 6020, 1400);
      cubeCam.position.copy(cam.position);
      // 공기 원근용 큐브에는 해 원반을 빼고 굽는다 — 64px 큐브에 원반(수만 배 밝음)이 들어가면 그 면의 흐린 밉 전체가
      // 하얗게 번지고, 해가 움직이며 원반이 텍셀을 드나들 때마다 산 왼쪽이 깜빡였다
      if (su.showSunDisc) su.showSunDisc.value = 0;
      cubeCam.update(r, skyScene);
      if (su.showSunDisc) su.showSunDisc.value = 1;
      const ex = r.toneMappingExposure;
      r.toneMappingExposure = 0.34;
      r.render(scene, cam);
      r.toneMappingExposure = ex;
      hud.draw(r, w, h);
    },
    controls: [
      { type: 'toggle', label: '해가 저절로 움직이기', value: true, on: (v) => (auto = v) },
      { type: 'range', label: '해 높이 (자동 끄면)', min: -10, max: 60, step: 0.5, value: 20, on: (v) => (manual = v) },
      { type: 'range', label: '공기 원근 (먼 산이 흐려지는 정도)', min: 0, max: 0.0012, step: 0.00002, value: 0.00024, on: (v) => (fogUser = v) },
      { type: 'range', label: '탁함 (먼지)', min: 1, max: 20, step: 0.5, value: 8, on: (v) => (su.turbidity!.value = v) },
      { type: 'range', label: '레일리 (파란 산란)', min: 0.2, max: 4, step: 0.1, value: 2.4, on: (v) => (su.rayleigh!.value = v) },
    ],
    dispose() {
      sky.geometry.dispose();
      sky.material.dispose();
      sky2.geometry.dispose();
      for (const g of geos) g.dispose();
      matM.dispose();
      matT.dispose();
      noiseTex.dispose();
      sg.dispose();
      starMat.dispose();
      night.geometry.dispose();
      nightMat.dispose();
      cubeRT.dispose();
      moonTex.dispose();
      moonMat.dispose();
      moon.geometry.dispose();
      halo.geometry.dispose();
      haloMat.dispose();
      hud.dispose();
    },
  };
}

/* ═════════════ i225 절차 뭉게구름 ═════════════ */

function makeClouds(): Scene3D {
  const uni = { uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uCover: { value: 0.56 }, uSpeed: { value: 1 }, uToon: { value: 0 } };
  const q = quad(
    /* glsl */ `
    uniform float uTime, uCover, uSpeed, uToon; uniform vec2 uRes; varying vec2 vUv;
    ${NOISE}
    float dens(vec2 p, float cover){
      float d = fbm(p) * 0.85 + noise(p * 0.5) * 0.35;
      return d - cover;
    }
    vec4 layer(vec2 p, float cover, vec2 sunDir, vec3 lit, vec3 shade, float soft){
      float d = dens(p, cover);
      float flatBottom = smoothstep(-0.25, 0.25, fract(p.y * 0.18) - 0.2);
      float a = smoothstep(0.0, soft, d);
      float d2 = dens(p + sunDir * 0.12, cover);
      float light = clamp(0.55 + (d - d2) * 5.0, 0.0, 1.0);
      float rim = smoothstep(soft * 2.5, 0.0, d) * a;
      if (uToon > 0.5){
        light = light > 0.62 ? 1.0 : (light > 0.35 ? 0.6 : 0.25);
        a = step(0.02, d);
        rim = step(d, 0.045) * a;
      }
      vec3 c = mix(shade, lit, light) + rim * vec3(1.0, 0.92, 0.8) * 0.35;
      return vec4(c, a * (0.85 + flatBottom * 0.0));
    }
    void main(){
      vec2 uv = vUv; float asp = uRes.x / uRes.y;
      vec2 p = vec2(uv.x * asp, uv.y);
      vec3 sky = mix(vec3(0.98, 0.83, 0.70), vec3(0.32, 0.58, 0.95), smoothstep(0.0, 0.9, uv.y));
      sky = mix(sky, vec3(0.18, 0.40, 0.86), smoothstep(0.6, 1.0, uv.y));
      vec2 sun = vec2(asp * 0.82, 0.78);
      float sd = length(p - sun);
      sky += vec3(1.0, 0.85, 0.55) * (0.5 * exp(-sd * 6.0) + 0.9 * smoothstep(0.06, 0.05, sd));
      float t = uTime * uSpeed;
      vec2 sdir = normalize(sun - p);
      // 먼 구름 (작고 느림)
      vec4 far = layer(p * vec2(3.6, 6.0) + vec2(t * 0.05, 3.0), uCover + 0.06, sdir, vec3(1.0, 0.95, 0.92), vec3(0.62, 0.66, 0.82), 0.08);
      far.a *= smoothstep(0.25, 0.55, uv.y) * 0.85;
      vec3 col = mix(sky, far.rgb, far.a);
      // 가까운 뭉게구름 (크고 빠름, 아래가 평평)
      vec2 q = p * vec2(1.7, 2.6) + vec2(t * 0.16, 0.0);
      float shapeY = smoothstep(0.05, 0.3, uv.y) * (1.0 - smoothstep(0.62, 0.95, uv.y));
      vec4 near = layer(q, uCover + 0.08 - shapeY * 0.18, sdir, vec3(1.0, 0.98, 0.96), vec3(0.55, 0.6, 0.78), 0.06);
      near.a *= smoothstep(0.08, 0.2, uv.y);
      col = mix(col, near.rgb, near.a);
      // 땅 언덕
      float hill = 0.12 + 0.05 * sin(p.x * 3.0 + 1.0) + 0.03 * sin(p.x * 7.0);
      col = mix(col, vec3(0.30, 0.55, 0.30), smoothstep(hill + 0.004, hill - 0.004, uv.y));
      gl_FragColor = vec4(pow(col, vec3(2.2)), 1.0);
      ${OUT}
    }`,
    uni,
  );
  return {
    scene: q.scene,
    camera: q.cam,
    tone: THREE.NoToneMapping,
    update(t) {
      uni.uTime.value = t;
    },
    render(r, w, h) {
      uni.uRes.value.set(w, h);
      r.render(q.scene, q.cam);
    },
    controls: [
      { type: 'range', label: '구름 양 (문턱)', min: 0.35, max: 0.75, step: 0.01, value: 0.56, on: (v) => (uni.uCover.value = v) },
      { type: 'range', label: '바람 속도', min: 0, max: 4, step: 0.1, value: 1, on: (v) => (uni.uSpeed.value = v) },
      { type: 'toggle', label: '툰 구름 (3단 명암 · 또렷한 테)', value: false, on: (v) => (uni.uToon.value = v ? 1 : 0) },
    ],
    dispose() {
      q.dispose();
    },
  };
}

/* ═════════════ i226 선택 강조 맥박 테 ═════════════ */

function makeSelect(): Scene3D {
  const scene = new THREE.Scene();
  scene.background = gradBg([
    [0, '#151a33'],
    [1, '#2a2148'],
  ]);
  const cam = new THREE.PerspectiveCamera(36, 1.6, 0.1, 50);
  cam.position.set(0, 2.5, 6.4);
  cam.lookAt(0, 0.55, 0);
  scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x302040, 1.4));
  const dl = new THREE.DirectionalLight(0xffffff, 2.4);
  dl.position.set(3, 5, 4);
  scene.add(dl);
  const root = new THREE.Group();
  scene.add(root);
  const table = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.5, 0.2, 64), new THREE.MeshStandardMaterial({ color: 0x3a3060, roughness: 0.7 }));
  table.position.y = -0.1;
  root.add(table);
  const geos: THREE.BufferGeometry[] = [
    new RoundedBoxGeometry(0.8, 0.8, 0.8, 5, 0.16),
    new THREE.SphereGeometry(0.46, 40, 28),
    new THREE.CapsuleGeometry(0.28, 0.5, 8, 24),
    new THREE.TorusGeometry(0.34, 0.15, 20, 48),
    new THREE.IcosahedronGeometry(0.46, 4),
  ];
  const colors = [0xff5a6e, 0xffcb3d, 0x47a8ff, 0x4fd28a, 0xb88cff];
  const outlineUni = { uTime: { value: 0 }, uW: { value: 0.045 }, uSpeed: { value: 1 } };
  const items: { g: THREE.Group; hull: THREE.Mesh; glow: THREE.Mesh; mat: THREE.ShaderMaterial; gmat: THREE.ShaderMaterial; baseY: number; on: number }[] = [];
  const hullVert = (scale: string) => /* glsl */ `
    uniform float uW, uTime, uSpeed, uOn;
    varying vec3 vN; varying vec3 vW;
    void main(){
      float pulse = 0.5 + 0.5 * sin(uTime * 4.2 * uSpeed);
      vec3 p = position + normal * uW * (${scale}) * (0.7 + 0.6 * pulse) * uOn;
      vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * w;
    }`;
  geos.forEach((geo, i) => {
    const g = new THREE.Group();
    const x = (i - 2) * 1.25;
    const z = i % 2 ? -0.5 : 0.4;
    g.position.set(x, 0.5, z);
    const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: colors[i]!, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.25 }));
    const u = { ...outlineUni, uOn: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: hullVert('1.0'),
      fragmentShader: /* glsl */ `uniform float uTime, uSpeed, uOn; void main(){ float pulse = 0.5 + 0.5 * sin(uTime * 4.2 * uSpeed);
        gl_FragColor = vec4(mix(vec3(1.0, 0.85, 0.25), vec3(1.0, 1.0, 0.9), pulse) * 1.2, 1.0); }`,
      side: THREE.BackSide,
    });
    const gmat = new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: hullVert('3.4'),
      fragmentShader: /* glsl */ `uniform float uTime, uSpeed, uOn; varying vec3 vN; varying vec3 vW;
        void main(){ float pulse = 0.5 + 0.5 * sin(uTime * 4.2 * uSpeed); vec3 V = normalize(cameraPosition - vW);
          float f = pow(1.0 - abs(dot(normalize(vN), V)), 1.5);
          gl_FragColor = vec4(vec3(1.0, 0.8, 0.3) * (1.0 - f) * (0.25 + 0.35 * pulse) * uOn, 1.0); }`,
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const hull = new THREE.Mesh(geo, mat);
    const glow = new THREE.Mesh(geo, gmat);
    hull.visible = glow.visible = false;
    g.add(glow, hull, m);
    if (i === 3) g.rotation.x = -0.5;
    root.add(g);
    items.push({ g, hull, glow, mat, gmat, baseY: 0.5, on: 0 });
  });
  // 바닥 물결 고리
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const ringGeo = new THREE.RingGeometry(0.55, 0.62, 64).rotateX(-Math.PI / 2);
  const rings = [0, 1].map(() => {
    const m = new THREE.Mesh(ringGeo, ringMat.clone());
    m.position.y = 0.01;
    root.add(m);
    return m;
  });
  let sel = 0;
  let selAt = 0;
  let auto = true;
  let now = 0;
  const pick = (i: number) => {
    sel = (i + items.length) % items.length;
    selAt = now;
  };
  return {
    scene,
    camera: cam,
    update(t, dt) {
      now = t;
      outlineUni.uTime.value = t;
      if (auto && t - selAt > 2.4) pick(sel + 1);
      items.forEach((it, i) => {
        const target = i === sel ? 1 : 0;
        it.on += (target - it.on) * Math.min(1, dt * 9);
        (it.mat.uniforms.uOn as THREE.IUniform).value = it.on;
        it.hull.visible = it.glow.visible = it.on > 0.01;
        const bob = i === sel ? 0.12 + Math.sin(t * 4) * 0.04 : 0;
        it.g.position.y += (it.baseY + bob - it.g.position.y) * Math.min(1, dt * 8);
        it.g.rotation.y += dt * (i === sel ? 1.2 : 0.2);
      });
      const s = items[sel]!.g.position;
      rings.forEach((m, k) => {
        const ph = ((t - selAt) * 0.8 + k * 0.5) % 1;
        m.position.x = s.x;
        m.position.z = s.z;
        m.scale.setScalar(1 + ph * 1.2);
        (m.material as THREE.MeshBasicMaterial).opacity = (1 - ph) * 0.8;
      });
    },
    controls: [
      { type: 'button', label: '다음 것 고르기', on: () => pick(sel + 1) },
      { type: 'toggle', label: '저절로 바꾸기', value: true, on: (v) => (auto = v) },
      { type: 'range', label: '테 두께', min: 0.01, max: 0.1, step: 0.005, value: 0.045, on: (v) => (outlineUni.uW.value = v) },
      { type: 'range', label: '맥박 빠르기', min: 0, max: 2.5, step: 0.1, value: 1, on: (v) => (outlineUni.uSpeed.value = v) },
    ],
    dispose() {
      for (const it of items) {
        it.mat.dispose();
        it.gmat.dispose();
      }
      for (const m of rings) (m.material as THREE.Material).dispose();
      ringMat.dispose();
      freeAll(root);
      (scene.background as THREE.Texture).dispose();
    },
  };
}

/* ═════════════ i227 비눗방울 박막 무지개 ═════════════ */

function makeBubble(): Scene3D {
  const scene = new THREE.Scene();
  scene.background = gradBg([
    [0, '#0b1230'],
    [0.6, '#1a1f4a'],
    [1, '#2b2350'],
  ]);
  const cam = new THREE.PerspectiveCamera(40, 1.6, 0.1, 50);
  cam.position.set(0, 0, 6);
  const root = new THREE.Group();
  scene.add(root);
  // 흐린 빛 방울 (보케)
  const bokehGeo = new THREE.PlaneGeometry(1, 1);
  const bokehMat = new THREE.ShaderMaterial({
    uniforms: { uC: { value: new THREE.Color() } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `varying vec2 vUv; uniform vec3 uC; void main(){ float d = length(vUv - 0.5) * 2.0; float a = smoothstep(1.0, 0.85, d) * (0.5 + 0.5 * d); gl_FragColor = vec4(uC * a * 0.35, 1.0); }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const r0 = rng(17);
  for (let i = 0; i < 18; i++) {
    const m = new THREE.Mesh(bokehGeo, bokehMat.clone());
    ((m.material as THREE.ShaderMaterial).uniforms.uC as THREE.IUniform).value = new THREE.Color().setHSL(0.55 + r0() * 0.4, 0.7, 0.5);
    m.position.set((r0() - 0.5) * 14, (r0() - 0.5) * 8, -6 - r0() * 4);
    m.scale.setScalar(0.6 + r0() * 1.6);
    root.add(m);
  }
  const uni = { uTime: { value: 0 }, uThick: { value: 420 }, uFlow: { value: 1 }, uFilm: { value: 1 } };
  const vert = /* glsl */ `
    varying vec3 vN; varying vec3 vW; varying vec3 vO;
    void main(){ vO = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * w; }`;
  const frag = (back: boolean) => /* glsl */ `
    uniform float uTime, uThick, uFlow, uFilm, uSeed, uFade;
    varying vec3 vN; varying vec3 vW; varying vec3 vO;
    ${NOISE}
    void main(){
      vec3 V = normalize(cameraPosition - vW);
      vec3 N = normalize(vN); ${back ? 'N = -N;' : ''}
      float c = clamp(abs(dot(N, V)), 0.0, 1.0);
      vec3 o = normalize(vO);
      float t = uTime * uFlow;
      vec3 q = o * 1.6 + vec3(uSeed, t * 0.18, -t * 0.1);
      q.xz += vec2(sin(o.y * 3.0 + t * 0.7), cos(o.y * 2.0 - t * 0.5)) * 0.5;
      float n = fbm3(q) * 1.2 + fbm3(q * 2.3 + 4.0) * 0.4;
      float grav = mix(1.45, 0.45, o.y * 0.5 + 0.5);
      float d = uThick * grav * (0.45 + n);
      float st = sqrt(1.0 - c * c) / 1.33; float ct = sqrt(1.0 - st * st);
      vec3 lam = vec3(650.0, 532.0, 450.0);
      vec3 film = 0.5 - 0.5 * cos(6.2831853 * 2.0 * 1.33 * d * ct / lam);
      film = mix(vec3(0.6), film, uFilm);
      float fr = 0.06 + 0.94 * pow(1.0 - c, 3.0);
      vec3 R = reflect(-V, N);
      float win = smoothstep(0.55, 0.62, R.y) * smoothstep(0.75, 0.0, abs(R.x - 0.25)) * step(abs(fract(R.x * 3.0) - 0.5), 0.44);
      float win2 = smoothstep(0.85, 0.95, dot(R, normalize(vec3(-0.7, -0.2, 0.7))));
      vec3 col = film * (0.22 + fr * 1.3) + vec3(1.0) * (win * 0.9 + win2 * 0.5);
      gl_FragColor = vec4(col * ${back ? '0.35' : '1.0'} * uFade, 1.0);
    }`;
  const bubbles: { g: THREE.Group; mats: THREE.ShaderMaterial[]; x: number; ph: number; size: number; speed: number }[] = [];
  const sgeo = new THREE.SphereGeometry(1, 64, 48);
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    const mats = [true, false].map((back) => {
      const m = new THREE.ShaderMaterial({ uniforms: { ...uni, uSeed: { value: i * 7.3 }, uFade: { value: 1 } }, vertexShader: vert, fragmentShader: frag(back), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: back ? THREE.BackSide : THREE.FrontSide });
      g.add(new THREE.Mesh(sgeo, m));
      return m;
    });
    root.add(g);
    bubbles.push({ g, mats, x: [-1.6, 1.4, 0.1, 2.9][i]!, ph: i * 0.27, size: [1.25, 0.8, 0.55, 0.5][i]!, speed: [0.12, 0.17, 0.2, 0.15][i]! });
  }
  // 터질 때 물방울
  const DN = 40;
  const dp = new Float32Array(DN * 3);
  const dv: THREE.Vector3[] = [];
  for (let i = 0; i < DN; i++) dv.push(new THREE.Vector3());
  const dGeo = new THREE.BufferGeometry();
  dGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dMat = new THREE.PointsMaterial({ color: 0xcff4ff, size: 0.06, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const drops = new THREE.Points(dGeo, dMat);
  root.add(drops);
  let popAge = 9;
  const popAt = (p: THREE.Vector3, s: number) => {
    popAge = 0;
    for (let i = 0; i < DN; i++) {
      const v = dv[i]!.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      dp[i * 3] = p.x + v.x * s;
      dp[i * 3 + 1] = p.y + v.y * s;
      dp[i * 3 + 2] = p.z + v.z * s;
      v.multiplyScalar(1.5 + Math.random() * 2);
    }
  };
  let lastPop = 0;
  return {
    scene,
    camera: cam,
    update(t, dt) {
      uni.uTime.value = t;
      bubbles.forEach((b, i) => {
        const life = ((t * b.speed + b.ph) % 1 + 1) % 1;
        const y = -3.6 + life * 7.2;
        b.g.position.set(b.x + Math.sin(t * 0.7 + i) * 0.35, y, Math.cos(t * 0.5 + i * 2) * 0.4);
        const wob = 1 + Math.sin(t * 3.1 + i) * 0.025;
        b.g.scale.set(b.size * wob, b.size / wob, b.size * wob);
        b.g.rotation.y = t * 0.2 + i;
        const fade = smooth(0, 0.06, life) * (1 - smooth(0.93, 0.97, life));
        for (const m of b.mats) (m.uniforms.uFade as THREE.IUniform).value = fade;
      });
      // 큰 방울은 가운데쯤에서 2.8초마다 톡
      if (t - lastPop > 2.8) {
        lastPop = t;
        const b = bubbles[2]!;
        popAt(b.g.position, b.size);
        b.ph = (b.ph + 0.37) % 1;
      }
      popAge += dt;
      dMat.opacity = Math.max(0, 1 - popAge * 1.6);
      for (let i = 0; i < DN; i++) {
        const v = dv[i]!;
        v.y -= dt * 4;
        dp[i * 3] = dp[i * 3]! + v.x * dt;
        dp[i * 3 + 1] = dp[i * 3 + 1]! + v.y * dt;
        dp[i * 3 + 2] = dp[i * 3 + 2]! + v.z * dt;
      }
      (dGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    },
    controls: [
      { type: 'range', label: '막 두께 (nm)', min: 120, max: 1000, step: 10, value: 420, on: (v) => (uni.uThick.value = v) },
      { type: 'range', label: '흐름 빠르기', min: 0, max: 3, step: 0.1, value: 1, on: (v) => (uni.uFlow.value = v) },
      { type: 'toggle', label: '박막 간섭 색 (끄면 그냥 유리)', value: true, on: (v) => (uni.uFilm.value = v ? 1 : 0) },
      { type: 'button', label: '톡 터뜨리기', on: () => (lastPop = -9) },
    ],
    dispose() {
      for (const b of bubbles) for (const m of b.mats) m.dispose();
      sgeo.dispose();
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.material) (m.material as THREE.Material).dispose();
      });
      bokehGeo.dispose();
      bokehMat.dispose();
      dGeo.dispose();
      dMat.dispose();
      (scene.background as THREE.Texture).dispose();
    },
  };
}

/* ═════════════ i228 서리 유리 (backdrop blur) ═════════════ */

function makeFrost(box: HTMLElement): { update(t: number): void; controls: Control[]; dispose(): void } {
  const outer = document.createElement('div');
  outer.style.cssText = 'position:absolute;inset:0;overflow:hidden;container-type:size';
  const noise = `url("data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.09 0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>')}")`;
  outer.innerHTML = `<style>
    .fz{position:absolute;inset:0;overflow:hidden;font-family:${F};color:#fff;user-select:none;background:#11122b}
    .fz .bl{position:absolute;border-radius:50%;filter:blur(1px)}
    .fz .num{position:absolute;font-weight:900;font-size:34cqmin;line-height:1;color:#fff;opacity:.9;letter-spacing:-.04em;text-shadow:0 .5cqmin 0 rgba(0,0,0,.25)}
    .fz .gridl{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.08) 1px,transparent 1px);background-size:8cqmin 8cqmin}
    .fz .card{position:absolute;top:16%;width:40%;height:68%;border-radius:4.5cqmin;padding:4cqmin;box-sizing:border-box;display:flex;flex-direction:column;gap:2.4cqmin}
    .fz .card.a{left:6%;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.25)}
    .fz .card.b{right:6%;background:linear-gradient(150deg,rgba(255,255,255,.28),rgba(255,255,255,.08));border:1px solid rgba(255,255,255,.45);
       box-shadow:0 2cqmin 6cqmin rgba(0,0,0,.35), inset 0 .4cqmin 0 rgba(255,255,255,.5), inset 0 -.4cqmin 1cqmin rgba(255,255,255,.08)}
    .fz .card.b::before{content:'';position:absolute;inset:0;border-radius:inherit;background:${noise};pointer-events:none}
    .fz .card.b.nog::before{display:none}
    .fz .tt{font-size:6.2cqmin;font-weight:800;letter-spacing:-.02em}
    .fz .sub{font-size:3.6cqmin;opacity:.85;font-weight:600}
    .fz .bt{margin-top:auto;display:flex;gap:2cqmin}
    .fz .bt span{flex:1;text-align:center;padding:1.8cqmin 0;border-radius:99px;font-size:3.6cqmin;font-weight:800;background:rgba(255,255,255,.22);border:1px solid rgba(255,255,255,.35)}
    .fz .bt span.p{background:#ffd23f;color:#3a2a00;border-color:#fff3}
    .fz .lb{position:absolute;top:4%;font-size:3.6cqmin;font-weight:800;padding:.5em 1em;border-radius:99px;background:rgba(0,0,0,.45)}
  </style>
  <div class="fz">
    <div class="gridl"></div>
    <div class="bl b1"></div><div class="bl b2"></div><div class="bl b3"></div><div class="bl b4"></div>
    <div class="num n1">3</div><div class="num n2">7</div><div class="num n3">+</div>
    <div class="card a"><div class="tt">일시정지</div><div class="sub">그냥 반투명 — 뒤가 또렷해 글씨가 안 읽혀요</div><div class="bt"><span>그만</span><span class="p">계속</span></div></div>
    <div class="card b"><div class="tt">일시정지</div><div class="sub">서리 유리 — 뒤는 흐린 빛만, 글씨가 또렷</div><div class="bt"><span>그만</span><span class="p">계속</span></div></div>
    <div class="lb" style="left:6%">그냥 반투명</div><div class="lb" style="right:6%;background:rgba(80,160,255,.6)">backdrop-filter</div>
  </div>`;
  box.appendChild(outer);
  const root = outer.querySelector('.fz') as HTMLElement;
  const blobs = Array.from(root.querySelectorAll<HTMLElement>('.bl'));
  const nums = Array.from(root.querySelectorAll<HTMLElement>('.num'));
  const cardB = root.querySelector('.card.b') as HTMLElement;
  const BC = ['#ff4f8b', '#ffb02e', '#3fa9ff', '#5ee08a'];
  blobs.forEach((b, i) => {
    b.style.width = b.style.height = `${[46, 38, 42, 30][i]}cqmin`;
    b.style.background = `radial-gradient(circle at 35% 35%, ${BC[i]}, ${BC[i]}00 70%)`;
  });
  let blur = 14;
  let sat = 1.6;
  const apply = () => {
    const f = `blur(${blur}px) saturate(${sat})`;
    cardB.style.backdropFilter = f;
    (cardB.style as unknown as Record<string, string>).webkitBackdropFilter = f;
  };
  apply();
  return {
    update(t) {
      blobs.forEach((b, i) => {
        const x = 50 + Math.sin(t * (0.35 + i * 0.07) + i * 1.7) * 42;
        const y = 50 + Math.cos(t * (0.3 + i * 0.05) + i * 2.3) * 36;
        b.style.left = `calc(${x}% - ${[23, 19, 21, 15][i]}cqmin)`;
        b.style.top = `calc(${y}% - ${[23, 19, 21, 15][i]}cqmin)`;
      });
      nums.forEach((n, i) => {
        const x = ((t * (8 + i * 3) + i * 37) % 130) - 20;
        n.style.left = `${x}%`;
        n.style.top = `${[8, 38, 60][i]}%`;
        n.style.color = ['#ffffff', '#ffe066', '#7fe0ff'][i]!;
      });
    },
    controls: [
      { type: 'range', label: '흐림 (px)', min: 0, max: 40, step: 1, value: 14, on: (v) => ((blur = v), apply()) },
      { type: 'range', label: '채도', min: 1, max: 2.5, step: 0.1, value: 1.6, on: (v) => ((sat = v), apply()) },
      { type: 'toggle', label: '서리 결 (잡음)', value: true, on: (v) => cardB.classList.toggle('nog', !v) },
    ],
    dispose() {
      outer.remove();
    },
  };
}

/* ═════════════ i229 삼면 투영 (triplanar) ═════════════ */

function tileTex(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const cols = ['#ffe9b8', '#3fb6a8'];
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++) {
      g.fillStyle = cols[(x + y) % 2]!;
      g.fillRect(x * 64, y * 64, 64, 64);
      g.fillStyle = (x + y) % 2 ? '#ffe9b8' : '#ff7a59';
      g.beginPath();
      g.arc(x * 64 + 32, y * 64 + 32, 9, 0, Math.PI * 2);
      g.fill();
    }
  g.strokeStyle = '#1d2a4a';
  g.lineWidth = 4;
  for (let i = 0; i <= 4; i++) {
    g.beginPath();
    g.moveTo(i * 64, 0);
    g.lineTo(i * 64, 256);
    g.moveTo(0, i * 64);
    g.lineTo(256, i * 64);
    g.stroke();
  }
  const t = canvasTex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
function blobGeo(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(0.8, 96, 64);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    const d = 1 + 0.28 * Math.sin(n.x * 4.1 + 1) * Math.sin(n.y * 3.3) + 0.18 * Math.cos(n.z * 5.2 + n.y * 2) + 0.35 * Math.max(0, n.y) ** 3;
    v.multiplyScalar(d);
    p.setXYZ(i, v.x, v.y * 1.15, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function makeTriplanar(): Scene3D {
  const scene = new THREE.Scene();
  scene.background = gradBg([
    [0, '#1b2140'],
    [1, '#2d2a4a'],
  ]);
  const cam = new THREE.PerspectiveCamera(36, 1.6, 0.1, 50);
  cam.position.set(0, 1.4, 7.4);
  cam.lookAt(0, 0.15, 0);
  scene.add(new THREE.HemisphereLight(0xb8c8ff, 0x4a3a50, 1.1));
  const dl = new THREE.DirectionalLight(0xfff2e0, 2.2);
  dl.position.set(3, 4, 5);
  scene.add(dl);
  const tex = tileTex();
  const uvTex = tex.clone();
  uvTex.repeat.set(2, 2);
  const uni = { uMap: { value: tex }, uScale: { value: 0.9 }, uSharp: { value: 6 }, uDebug: { value: 0 }, uLight: { value: dl.position.clone().normalize() } };
  const triMat = new THREE.ShaderMaterial({
    uniforms: uni,
    vertexShader: /* glsl */ `varying vec3 vO; varying vec3 vON; varying vec3 vN;
      void main(){ vO = position; vON = normal; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform sampler2D uMap; uniform float uScale, uSharp, uDebug; uniform vec3 uLight;
      varying vec3 vO; varying vec3 vON; varying vec3 vN;
      void main(){
        vec3 n = normalize(vON);
        vec3 b = pow(abs(n), vec3(uSharp)); b /= (b.x + b.y + b.z);
        vec3 p = vO * uScale;
        vec3 cx = texture2D(uMap, p.zy).rgb, cy = texture2D(uMap, p.xz).rgb, cz = texture2D(uMap, p.xy).rgb;
        vec3 alb = cx * b.x + cy * b.y + cz * b.z;
        if (uDebug > 0.5) alb = mix(alb, b * vec3(1.0, 0.9, 1.2), 0.6);
        vec3 N = normalize(vN);
        float diff = max(dot(N, uLight), 0.0);
        vec3 amb = mix(vec3(0.30, 0.24, 0.32), vec3(0.72, 0.78, 1.0), N.y * 0.5 + 0.5) * 0.55;
        gl_FragColor = vec4(alb * (amb + diff * vec3(1.0, 0.95, 0.88) * 1.05), 1.0);
        ${OUT}
      }`,
  });
  const uvMat = new THREE.MeshLambertMaterial({ map: uvTex });
  const root = new THREE.Group();
  scene.add(root);
  const blob = blobGeo();
  const tall = new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
  tall.scale(0.7, 2.0, 0.7);
  const ring = new THREE.TorusKnotGeometry(0.42, 0.16, 160, 20);
  const make = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, 0);
    root.add(m);
    return m;
  };
  const L = [make(blob, uvMat, -2.75, 0.1), make(tall, uvMat, -1.25, 0.1)];
  const R = [make(blob, triMat, 1.25, 0.1), make(tall, triMat, 2.75, 0.1)];
  const knotL = make(ring, uvMat, -2.0, -1.55);
  const knotR = make(ring, triMat, 2.0, -1.55);
  knotL.scale.setScalar(0.75);
  knotR.scale.setScalar(0.75);
  const hud = new Hud();
  const a = hud.add('UV 무늬 — 늘어남 · 이음새');
  const b = hud.add('삼면 투영 — 고른 무늬', 'rgba(30,110,100,0.8)');
  hud.at(a, 0.03, 0.05, 0, 0);
  hud.at(b, 0.97, 0.05, 1, 0);
  return {
    scene,
    camera: cam,
    update(t) {
      for (const m of [...L, ...R]) {
        m.rotation.y = t * 0.45;
        m.rotation.x = Math.sin(t * 0.3) * 0.35;
      }
      knotL.rotation.y = knotR.rotation.y = t * 0.6;
    },
    render(r, w, h) {
      r.render(scene, cam);
      drawDivider(r, w / 2, h, w);
      hud.draw(r, w, h);
    },
    controls: [
      { type: 'range', label: '섞임 날카로움', min: 1, max: 24, step: 1, value: 6, on: (v) => (uni.uSharp.value = v) },
      { type: 'range', label: '무늬 크기', min: 0.3, max: 2.5, step: 0.05, value: 0.9, on: (v) => (uni.uScale.value = v) },
      { type: 'toggle', label: '축 색 보기 (빨 x · 초 y · 파 z)', value: false, on: (v) => (uni.uDebug.value = v ? 1 : 0) },
    ],
    dispose() {
      blob.dispose();
      tall.dispose();
      ring.dispose();
      triMat.dispose();
      uvMat.dispose();
      tex.dispose();
      uvTex.dispose();
      hud.dispose();
      (scene.background as THREE.Texture).dispose();
    },
  };
}

/* ═════════════ i230 시차 차폐 매핑 (POM) ═════════════ */

function brickMaps(): { h: THREE.CanvasTexture; a: THREE.CanvasTexture } {
  const S = 512;
  const [hc, hg] = canvas(S, S);
  const [ac, ag] = canvas(S, S);
  hg.fillStyle = '#000';
  hg.fillRect(0, 0, S, S);
  ag.fillStyle = '#9c9488';
  ag.fillRect(0, 0, S, S);
  // 줄눈 결
  const r = rng(11);
  for (let i = 0; i < 3000; i++) {
    ag.fillStyle = `rgba(${r() > 0.5 ? 255 : 60},${r() > 0.5 ? 250 : 55},${r() > 0.5 ? 240 : 50},0.12)`;
    ag.fillRect(r() * S, r() * S, 2, 2);
  }
  const RH = 64;
  const BW = 128;
  const M = 6;
  for (let row = 0; row < S / RH; row++) {
    const off = row % 2 ? BW / 2 : 0;
    for (let bx = -1; bx < S / BW + 1; bx++) {
      const x0 = bx * BW + off;
      const top = 0.78 + r() * 0.22;
      const hue = 8 + r() * 14;
      const lum = 34 + r() * 14;
      for (const sx of [x0, x0 - S, x0 + S]) {
        if (sx + BW < 0 || sx > S) continue;
        const x = sx + M;
        const y = row * RH + M;
        const w = BW - M * 2;
        const h = RH - M * 2;
        for (let k = 0; k < 12; k++) {
          const v = Math.round(255 * top * (0.35 + 0.65 * Math.sin(((k + 1) / 12) * Math.PI * 0.5)));
          hg.fillStyle = `rgb(${v},${v},${v})`;
          hg.beginPath();
          hg.roundRect(x + k * 0.9, y + k * 0.9, w - k * 1.8, h - k * 1.8, 6);
          hg.fill();
        }
        ag.fillStyle = `hsl(${hue},55%,${lum}%)`;
        ag.beginPath();
        ag.roundRect(x, y, w, h, 6);
        ag.fill();
      }
    }
  }
  // 움푹한 자국 · 얼룩 (높이는 어둡게, 색은 살짝)
  for (let i = 0; i < 260; i++) {
    const x = r() * S;
    const y = r() * S;
    const rad = 1.5 + r() * 4;
    const gr = hg.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    hg.fillStyle = gr;
    hg.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    ag.fillStyle = `rgba(30,10,0,${0.1 + r() * 0.15})`;
    ag.beginPath();
    ag.arc(x, y, rad * 0.8, 0, Math.PI * 2);
    ag.fill();
  }
  const h = canvasTex(hc, false);
  const a = canvasTex(ac);
  for (const t of [h, a]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
  }
  return { h, a };
}

function makePom(): Scene3D {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c0a10);
  const cam = new THREE.PerspectiveCamera(42, 1.6, 0.1, 50);
  const { h: hTex, a: aTex } = brickMaps();
  const uni = {
    uH: { value: hTex },
    uA: { value: aTex },
    uLight: { value: new THREE.Vector3() },
    uDepth: { value: 0.07 },
    uSplit: { value: 0 },
    uShadow: { value: 1 },
  };
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 14).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      uniforms: uni,
      vertexShader: WORLD_VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D uH, uA; uniform vec3 uLight; uniform float uDepth, uSplit, uShadow;
        varying vec3 vW;
        void main(){
          vec2 uv = vec2(vW.x, -vW.z) * 0.32;
          vec2 dx = dFdx(uv), dy = dFdy(uv);
          vec3 V = normalize(cameraPosition - vW);
          vec3 vT = vec3(V.x, -V.z, V.y);
          bool pom = gl_FragCoord.x > uSplit;
          vec2 tuv = uv;
          if (pom){
            float n = mix(36.0, 10.0, clamp(vT.z, 0.0, 1.0));
            float layer = 1.0 / n; float cur = 0.0;
            vec2 P = vT.xy / max(vT.z, 0.12) * uDepth; vec2 d = P / n;
            float depth = 1.0 - textureGrad(uH, tuv, dx, dy).r;
            for (int i = 0; i < 40; i++){ if (cur >= depth || float(i) >= n) break; tuv -= d; depth = 1.0 - textureGrad(uH, tuv, dx, dy).r; cur += layer; }
            vec2 prev = tuv + d;
            float after = depth - cur; float before = (1.0 - textureGrad(uH, prev, dx, dy).r) - cur + layer;
            tuv = mix(tuv, prev, after / (after - before));
          }
          vec2 e = vec2(1.0 / 512.0, 0.0);
          float hl = textureGrad(uH, tuv - e.xy, dx, dy).r, hr = textureGrad(uH, tuv + e.xy, dx, dy).r;
          float hd = textureGrad(uH, tuv - e.yx, dx, dy).r, hu = textureGrad(uH, tuv + e.yx, dx, dy).r;
          vec3 nT = normalize(vec3((hl - hr) * uDepth * 256.0, (hd - hu) * uDepth * 256.0, 1.0));
          vec3 N = vec3(nT.x, nT.z, -nT.y);
          vec3 Lv = uLight - vW; float ld = length(Lv); vec3 L = Lv / ld;
          float sh = 1.0;
          vec3 lT = vec3(L.x, -L.z, L.y);
          if (pom && uShadow > 0.5 && lT.z > 0.0){
            float h0 = textureGrad(uH, tuv, dx, dy).r;
            float dh = (1.0 - h0) / 12.0;
            vec2 duv = lT.xy / max(lT.z, 0.08) * uDepth * dh;
            vec2 p = tuv; float cur = h0; float occ = 0.0;
            for (int i = 0; i < 12; i++){ p += duv; cur += dh; occ = max(occ, (textureGrad(uH, p, dx, dy).r - cur) * (1.0 - float(i) / 12.0)); }
            sh = 1.0 - clamp(occ * 9.0, 0.0, 1.0) * 0.9;
          }
          vec3 alb = textureGrad(uA, tuv, dx, dy).rgb;
          float diff = max(dot(N, L), 0.0);
          vec3 Hh = normalize(L + V);
          float spec = pow(max(dot(N, Hh), 0.0), 32.0) * 0.25;
          float att = 1.0 / (1.0 + ld * ld * 0.35);
          vec3 lc = vec3(1.0, 0.72, 0.42);
          float ao = mix(0.55, 1.0, textureGrad(uH, tuv, dx, dy).r);
          vec3 col = alb * (vec3(0.05, 0.06, 0.1) * ao + lc * diff * att * 5.0 * sh) + lc * spec * att * 4.0 * sh;
          col *= 1.0 - smoothstep(4.0, 9.0, length(vW.xz));
          gl_FragColor = vec4(col, 1.0);
          ${OUT}
        }`,
    }),
  );
  scene.add(floor);
  // 등불 (빛나는 구 + 빛무리)
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffe2b0 }));
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: (() => {
        const [c, g] = canvas(64, 64);
        const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        gr.addColorStop(0, 'rgba(255,200,130,0.9)');
        gr.addColorStop(1, 'rgba(255,160,80,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, 64, 64);
        return canvasTex(c);
      })(),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }),
  );
  halo.scale.setScalar(1.1);
  bulb.add(halo);
  scene.add(bulb);
  const hud = new Hud();
  const a = hud.add('노멀 맵만 (납작)');
  const b = hud.add('시차 차폐 (POM)', 'rgba(150,70,30,0.8)');
  hud.at(a, 0.03, 0.05, 0, 0);
  hud.at(b, 0.97, 0.05, 1, 0);
  let split = 0.5;
  let moveSplit = true;
  let time = 0;
  return {
    scene,
    camera: cam,
    update(t) {
      time = t;
      const ca = Math.sin(t * 0.18) * 0.5;
      cam.position.set(Math.sin(ca) * 4.6, 1.55, Math.cos(ca) * 4.6);
      cam.lookAt(0, 0, -0.6);
      bulb.position.set(Math.cos(t * 0.7) * 1.8, 0.55 + Math.sin(t * 1.3) * 0.15, Math.sin(t * 0.7) * 1.2 - 0.3);
      uni.uLight.value.copy(bulb.position);
    },
    render(r, w, h) {
      const s = moveSplit ? 0.5 + Math.sin(time * 0.5) * 0.2 : split;
      uni.uSplit.value = s * w;
      r.render(scene, cam);
      drawDivider(r, s * w, h, w);
      hud.draw(r, w, h);
    },
    controls: [
      { type: 'range', label: '깊이', min: 0, max: 0.14, step: 0.005, value: 0.07, on: (v) => (uni.uDepth.value = v) },
      { type: 'toggle', label: '스스로 드리운 그림자', value: true, on: (v) => (uni.uShadow.value = v ? 1 : 0) },
      { type: 'toggle', label: '나누는 줄 움직이기', value: true, on: (v) => (moveSplit = v) },
      { type: 'range', label: '나누는 자리', min: 0, max: 1, step: 0.01, value: 0.5, on: (v) => ((split = v), (moveSplit = false)) },
    ],
    dispose() {
      freeAll(scene);
      halo.material.map?.dispose();
      halo.material.dispose();
      hTex.dispose();
      aTex.dispose();
      hud.dispose();
    },
  };
}

/* ═════════════ i231 가짜 방 창문 (interior mapping) ═════════════ */

function makeInterior(): Scene3D {
  const scene = new THREE.Scene();
  scene.background = gradBg([
    [0, '#050816'],
    [0.7, '#141a3c'],
    [1, '#2c2850'],
  ]);
  const cam = new THREE.PerspectiveCamera(40, 1.6, 0.1, 80);
  const uni = { uDepth: { value: 0.9 }, uFurn: { value: 1 }, uOn: { value: 1 }, uTime: { value: 0 } };
  const vert = /* glsl */ `
    varying vec3 vL; varying vec3 vCam;
    void main(){ vL = position; vCam = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const frag = /* glsl */ `
    uniform vec2 uSize; uniform float uDepth, uFurn, uOn, uTime;
    varying vec3 vL; varying vec3 vCam;
    ${NOISE}
    vec3 hsv(float h, float s, float v){ vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); return v * mix(vec3(1.0), k, s); }
    float box(vec2 p, vec2 a, vec2 b){ return step(a.x, p.x) * step(p.x, b.x) * step(a.y, p.y) * step(p.y, b.y); }
    void main(){
      vec2 g = vL.xy + uSize * 0.5;
      vec2 cell = floor(g); vec2 f = fract(g);
      float id = hash(cell + 3.1);
      vec2 wa = vec2(0.14, 0.2), wb = vec2(0.86, 0.86);
      float inWin = box(f, wa, wb);
      float frame = box(f, wa - 0.03, wb + 0.03) - inWin;
      // 벽: 따뜻한 벽돌 결
      float rowL = step(0.92, fract(g.y * 4.0)) + step(0.95, fract(g.x * 2.0 + floor(g.y * 4.0) * 0.5)) * 0.6;
      vec3 wall = vec3(0.22, 0.16, 0.16) * (0.85 + 0.25 * hash(floor(g * vec2(2.0, 4.0)))) * (1.0 - rowL * 0.35);
      float lit = step(0.3, hash(cell * 1.7 + floor(uTime * 0.12 + id * 9.0))) * uOn;
      // 창 아래로 새는 빛
      float spill = lit * box(f, vec2(0.1, 0.0), vec2(0.9, 0.2)) * (1.0 - f.y / 0.2) * 0.35;
      vec3 col = wall * (0.5 + spill * 2.0) + vec3(1.0, 0.7, 0.4) * spill * 0.12;
      col = mix(col, vec3(0.06, 0.06, 0.08), frame);
      if (inWin > 0.5){
        vec3 dir = normalize(vL - vCam);
        dir.x = abs(dir.x) < 1e-4 ? 1e-4 : dir.x; dir.y = abs(dir.y) < 1e-4 ? 1e-4 : dir.y;
        vec3 o = vec3(f, 0.0);
        float D = uDepth;
        vec3 tw = vec3(((dir.x > 0.0 ? 1.0 : 0.0) - o.x) / dir.x, ((dir.y > 0.0 ? 1.0 : 0.0) - o.y) / dir.y, (-D - o.z) / dir.z);
        float tt = min(min(tw.x, tw.y), tw.z);
        vec3 hp = o + dir * tt;
        vec3 wc = hsv(fract(id * 3.7), 0.25 + 0.3 * hash(cell + 9.0), 0.62);
        vec3 room;
        if (tt == tw.z){
          room = wc * 0.95;
          float pic = box(hp.xy, vec2(0.3 + id * 0.2, 0.5), vec2(0.55 + id * 0.2, 0.75));
          room = mix(room, hsv(fract(id * 11.0), 0.6, 0.85), pic * step(0.4, id));
        } else if (tt == tw.y){
          room = dir.y > 0.0 ? vec3(0.85, 0.83, 0.8) : vec3(0.45, 0.28, 0.16) * (0.8 + 0.2 * step(0.5, fract(hp.x * 6.0)));
        } else {
          room = wc * 0.72;
        }
        vec3 lamp = vec3(0.5, 0.97, -D * 0.5);
        float ld = length(hp - lamp);
        float shade = 0.35 + 0.9 / (1.0 + ld * ld * 2.5);
        if (uFurn > 0.5){
          float zf = -D * 0.55;
          float tf = (zf - o.z) / dir.z;
          if (tf < tt){
            vec2 fp = (o + dir * tf).xy;
            float k = floor(hash(cell + 1.3) * 3.0);
            float s = 0.0;
            if (k < 1.0){ float cx = 0.3 + 0.4 * id; s = max(step(length(fp - vec2(cx, 0.6)), 0.075), box(fp, vec2(cx - 0.09, 0.0), vec2(cx + 0.09, 0.5))); }
            else if (k < 2.0){ s = max(box(fp, vec2(0.18, 0.0), vec2(0.82, 0.22)), box(fp, vec2(0.18, 0.0), vec2(0.28, 0.38))); s = max(s, box(fp, vec2(0.72, 0.0), vec2(0.82, 0.38))); }
            else { s = max(box(fp, vec2(0.62, 0.0), vec2(0.74, 0.14)), step(length(fp - vec2(0.68, 0.28)), 0.12)); }
            if (s > 0.5){ room = mix(vec3(0.05, 0.04, 0.06), room * 0.25, 0.4); shade = 1.0; }
          }
          float cur = max(box(f, wa, vec2(0.24, 0.86)), box(f, vec2(0.76, 0.2), wb)) * step(0.5, hash(cell + 5.5));
          room = mix(room, wc * 0.9 * (0.75 + 0.25 * sin(f.x * 90.0)), cur * 0.92);
        }
        vec3 warm = vec3(1.25, 1.0, 0.72);
        vec3 tv = vec3(0.6, 0.8, 1.4) * (0.8 + 0.2 * sin(uTime * 13.0 + id * 40.0));
        vec3 lightC = id > 0.85 ? tv : warm;
        room *= lit > 0.5 ? lightC * shade : vec3(0.05, 0.06, 0.12);
        // 유리 반사
        float refl = 0.06 + 0.1 * smoothstep(0.0, 1.0, f.y + f.x * 0.3);
        col = room + vec3(0.3, 0.38, 0.6) * refl;
      }
      gl_FragColor = vec4(col, 1.0);
      ${OUT}
    }`;
  const mk = (w: number, h: number) => new THREE.ShaderMaterial({ uniforms: { ...uni, uSize: { value: new THREE.Vector2(w, h) } }, vertexShader: vert, fragmentShader: frag });
  const root = new THREE.Group();
  scene.add(root);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(6, 7), mk(6, 7));
  front.position.set(0, 3.5, 0);
  const side = new THREE.Mesh(new THREE.PlaneGeometry(4, 7), mk(4, 7));
  side.rotation.y = Math.PI / 2;
  side.position.set(3, 3.5, -2);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(6.3, 0.3, 4.3), new THREE.MeshLambertMaterial({ color: 0x241a20 }));
  roof.position.set(0, 7.1, -2);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 40).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x14141c }));
  scene.add(new THREE.HemisphereLight(0x5060a0, 0x101018, 1.2));
  root.add(front, side, roof, ground);
  // 별
  const sp = new Float32Array(300 * 3);
  const r0 = rng(3);
  for (let i = 0; i < 300; i++) {
    sp[i * 3] = (r0() - 0.5) * 80;
    sp[i * 3 + 1] = 6 + r0() * 30;
    sp[i * 3 + 2] = -30 - r0() * 5;
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  root.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xdfe6ff, size: 1.6, sizeAttenuation: false })));
  return {
    scene,
    camera: cam,
    update(t) {
      uni.uTime.value = t;
      const s = Math.sin(t * 0.3);
      cam.position.set(s * 4.5 + 1.0, 3.6 + Math.sin(t * 0.21) * 1.4, 5.0);
      cam.lookAt(0.9, 3.6, -1);
    },
    controls: [
      { type: 'range', label: '방 깊이', min: 0.2, max: 2, step: 0.05, value: 0.9, on: (v) => (uni.uDepth.value = v) },
      { type: 'toggle', label: '가구 · 커튼 (깊이 판 하나 더)', value: true, on: (v) => (uni.uFurn.value = v ? 1 : 0) },
      { type: 'toggle', label: '방 불 켜기', value: true, on: (v) => (uni.uOn.value = v ? 1 : 0) },
    ],
    dispose() {
      freeAll(root);
      (scene.background as THREE.Texture).dispose();
    },
  };
}

/* ═════════════ i232 빌보드 대역 (impostor) ═════════════ */

function buildTree(): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 1.0, 8).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x7a4a2a, roughness: 0.9 }));
  g.add(trunk);
  const leaf = new THREE.MeshStandardMaterial({ color: 0x4caf50, roughness: 0.8, flatShading: true });
  const leaf2 = new THREE.MeshStandardMaterial({ color: 0x2f8f46, roughness: 0.8, flatShading: true });
  const blobs: [number, number, number, number, THREE.Material][] = [
    [0, 1.35, 0, 0.62, leaf],
    [0.32, 1.1, 0.15, 0.42, leaf2],
    [-0.3, 1.2, -0.12, 0.45, leaf2],
    [0.05, 1.85, 0.05, 0.4, leaf],
  ];
  for (const [x, y, z, r, m] of blobs) {
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), m);
    s.position.set(x, y, z);
    g.add(s);
  }
  // 한쪽에만 새집 · 사과 → 돌면 달라 보인다
  const house = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.2), new THREE.MeshStandardMaterial({ color: 0xe8483a }));
  house.position.set(0.0, 0.85, 0.2);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), new THREE.MeshBasicMaterial({ color: 0x1a0d08 }));
  hole.position.set(0, 0.87, 0.301);
  g.add(house, hole);
  const apple = new THREE.MeshStandardMaterial({ color: 0xff3a3a, roughness: 0.4 });
  const ag = new THREE.SphereGeometry(0.07, 10, 8);
  for (const [x, y, z] of [
    [0.5, 1.2, 0.3],
    [0.35, 1.55, 0.45],
    [0.55, 1.0, -0.05],
  ] as const) {
    const a = new THREE.Mesh(ag, apple);
    a.position.set(x, y, z);
    g.add(a);
  }
  return g;
}
function triCount(o: THREE.Object3D): number {
  let n = 0;
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : (m.geometry.attributes.position as THREE.BufferAttribute).count) / 3;
  });
  return Math.round(n);
}

function makeImpostor(): Scene3D {
  const scene = new THREE.Scene();
  scene.background = gradBg([
    [0, '#78b8f0'],
    [0.8, '#d8ecf5'],
    [1, '#eef3e0'],
  ]);
  scene.fog = new THREE.Fog(0xd8ecf5, 14, 40);
  const cam = new THREE.PerspectiveCamera(45, 1.6, 0.1, 100);
  const hemi = new THREE.HemisphereLight(0xe8f4ff, 0x5a7040, 1.3);
  const dl = new THREE.DirectionalLight(0xfff0d8, 2.4);
  dl.position.set(4, 8, 6);
  scene.add(hemi, dl);
  const root = new THREE.Group();
  scene.add(root);
  root.add(new THREE.Mesh(new THREE.CircleGeometry(60, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x7fb257 })));
  const proto = buildTree();
  const tris = triCount(proto);
  const near: THREE.Object3D[] = [];
  for (let i = 0; i < 6; i++) {
    const t = proto.clone();
    const a = (i / 6) * Math.PI * 2 + 0.3;
    t.position.set(Math.cos(a) * 2.2, 0, Math.sin(a) * 2.2);
    t.rotation.y = a * 2.3;
    root.add(t);
    near.push(t);
  }
  // 굽기 (처음 그릴 때 한 번): 8 방향 × 128×256
  const FR = 8;
  const atlas = new THREE.WebGLRenderTarget(FR * 128, 256, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  const bakeScene = new THREE.Scene();
  const bakeTree = proto.clone();
  bakeScene.add(bakeTree, new THREE.HemisphereLight(0xe8f4ff, 0x5a7040, 1.3));
  const bdl = new THREE.DirectionalLight(0xfff0d8, 2.4);
  bdl.position.set(4, 8, 6);
  bakeScene.add(bdl);
  const bakeCam = new THREE.OrthographicCamera(-0.75, 0.75, 2.6, -0.4, 0.1, 20);
  let baked = false;
  const bake = (r: THREE.WebGLRenderer) => {
    const cc = r.getClearColor(new THREE.Color());
    const ca = r.getClearAlpha();
    atlas.scissorTest = false;
    atlas.viewport.set(0, 0, FR * 128, 256);
    r.setRenderTarget(atlas);
    r.setClearColor(0x000000, 0);
    r.clear();
    const ac = r.autoClear;
    r.autoClear = false;
    for (let k = 0; k < FR; k++) {
      const a = (k / FR) * Math.PI * 2;
      bakeCam.position.set(Math.sin(a) * 6, 1.1, Math.cos(a) * 6);
      bakeCam.lookAt(0, 1.1, 0);
      atlas.viewport.set(k * 128, 0, 128, 256);
      r.setRenderTarget(atlas);
      r.render(bakeScene, bakeCam);
    }
    r.autoClear = ac;
    atlas.viewport.set(0, 0, FR * 128, 256);
    r.setRenderTarget(null);
    r.setClearColor(cc, ca);
    baked = true;
  };
  // 대역 숲
  const MAX = 1400;
  const qg = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = qg.index;
  geo.setAttribute('position', qg.attributes.position!);
  geo.setAttribute('uv', qg.attributes.uv!);
  const inst = new Float32Array(MAX * 4);
  const r0 = rng(21);
  for (let i = 0; i < MAX; i++) {
    const a = r0() * Math.PI * 2;
    const rr = 8.5 + Math.sqrt(r0()) * 24;
    inst[i * 4] = Math.cos(a) * rr;
    inst[i * 4 + 1] = Math.sin(a) * rr;
    inst[i * 4 + 2] = r0() * Math.PI * 2;
    inst[i * 4 + 3] = 0.8 + r0() * 0.5;
  }
  geo.setAttribute('aI', new THREE.InstancedBufferAttribute(inst, 4));
  geo.instanceCount = 900;
  const uni = { uAtlas: { value: atlas.texture }, uShow: { value: 0 }, uBlend: { value: 1 }, fogColor: { value: new THREE.Color(0xd8ecf5) } };
  const imp = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      uniforms: uni,
      vertexShader: /* glsl */ `
        attribute vec4 aI; varying vec2 vUv; varying float vF; varying float vD;
        void main(){
          vec3 base = vec3(aI.x, 0.0, aI.y);
          vec3 toC = cameraPosition - base;
          float ang = atan(toC.x, toC.z) - aI.z;
          vF = mod(ang / 6.2831853 * 8.0, 8.0);
          vec3 right = normalize(vec3(toC.z, 0.0, -toC.x));
          vec3 p = base + right * (position.x * 1.5 * aI.w) + vec3(0.0, (position.y * 3.0 - 0.4) * aI.w, 0.0);
          vUv = uv;
          vec4 mv = viewMatrix * vec4(p, 1.0); vD = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uAtlas; uniform float uShow, uBlend; uniform vec3 fogColor;
        varying vec2 vUv; varying float vF; varying float vD;
        void main(){
          float f0 = floor(vF); float f1 = mod(f0 + 1.0, 8.0); float k = fract(vF) * uBlend;
          if (uBlend < 0.5) { f0 = mod(floor(vF + 0.5), 8.0); }
          float ux = clamp(vUv.x, 0.02, 0.98);
          vec4 a = texture2D(uAtlas, vec2((f0 + ux) / 8.0, vUv.y));
          vec4 b = texture2D(uAtlas, vec2((f1 + ux) / 8.0, vUv.y));
          vec4 c = mix(a, b, k);
          float edge = 1.0 - step(0.03, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
          if (uShow > 0.5){
            if (c.a < 0.5) c = vec4(1.0, 0.3, 0.6, 0.0);
            c.rgb = mix(c.rgb, vec3(1.0, 0.2, 0.55), max(edge, 0.25));
          } else if (c.a < 0.5) discard;
          vec3 col = mix(c.rgb, fogColor, smoothstep(14.0, 40.0, vD));
          gl_FragColor = vec4(col, 1.0);
          ${OUT}
        }`,
    }),
  );
  imp.frustumCulled = false;
  root.add(imp);
  const hud = new Hud();
  const a = hud.add(`진짜 나무 1그루 = 삼각형 ${tris}개`);
  const b = hud.add('대역 1그루 = 삼각형 2개 (그림 8장 중 골라 섞기)', 'rgba(140,30,80,0.75)');
  hud.at(a, 0.03, 0.05, 0, 0);
  hud.at(b, 0.03, 0.95, 0, 1);
  return {
    scene,
    camera: cam,
    update(t) {
      const a2 = t * 0.22;
      cam.position.set(Math.sin(a2) * 6.2, 3.0, Math.cos(a2) * 6.2);
      cam.lookAt(0, 1.3, 0);
    },
    render(r, w, h) {
      if (!baked) bake(r);
      r.render(scene, cam);
      hud.draw(r, w, h);
    },
    controls: [
      { type: 'toggle', label: '대역 판 드러내기', value: false, on: (v) => (uni.uShow.value = v ? 1 : 0) },
      { type: 'toggle', label: '각도 사이 섞기 (끄면 툭툭 바뀜)', value: true, on: (v) => (uni.uBlend.value = v ? 1 : 0) },
      { type: 'range', label: '대역 나무 수', min: 100, max: MAX, step: 50, value: 900, on: (v) => (geo.instanceCount = v) },
    ],
    dispose() {
      freeAll(root, bakeScene);
      qg.dispose();
      atlas.dispose();
      hud.dispose();
      (scene.background as THREE.Texture).dispose();
      void near;
    },
  };
}

/* ═════════════ i233 스프라이트 동작 상태기 + 섞기 (2D) ═════════════ */

type Pose = { hipL: number; hipR: number; kneeL: number; kneeR: number; shL: number; shR: number; elL: number; elR: number; bob: number; lean: number; squash: number };
const TAU = Math.PI * 2;
const ANIMS: Record<string, (p: number) => Pose> = {
  idle: (p) => {
    const s = Math.sin(p * TAU);
    return { hipL: 0.06, hipR: -0.06, kneeL: 0.05, kneeR: 0.05, shL: 0.12 + s * 0.04, shR: -0.12 - s * 0.04, elL: 0.2, elR: 0.2, bob: s * 1.2, lean: 0, squash: s * 0.02 };
  },
  walk: (p) => {
    const s = Math.sin(p * TAU);
    const c = Math.cos(p * TAU);
    return { hipL: s * 0.5, hipR: -s * 0.5, kneeL: Math.max(0, -c) * 0.7 + 0.05, kneeR: Math.max(0, c) * 0.7 + 0.05, shL: -s * 0.45, shR: s * 0.45, elL: 0.35, elR: 0.35, bob: -Math.abs(Math.sin(p * TAU)) * 2.5 + 1, lean: 0.06, squash: 0 };
  },
  run: (p) => {
    const s = Math.sin(p * TAU);
    const c = Math.cos(p * TAU);
    return { hipL: s * 0.95, hipR: -s * 0.95, kneeL: Math.max(0, -c) * 1.5 + 0.2, kneeR: Math.max(0, c) * 1.5 + 0.2, shL: -s * 1.0, shR: s * 1.0, elL: 1.4, elR: 1.4, bob: -Math.abs(Math.sin(p * TAU)) * 5 + 2, lean: 0.22, squash: 0 };
  },
  jump: (p) => {
    const k = Math.sin(Math.min(1, p) * Math.PI);
    return { hipL: -0.9 * k - 0.2, hipR: -0.3 * k + 0.3, kneeL: 1.6 * k + 0.2, kneeR: 0.9 * k + 0.3, shL: -2.5 * k, shR: -2.1 * k + 0.4, elL: 0.3, elR: 0.5, bob: 0, lean: 0.1, squash: -0.08 * k };
  },
};
const STATES = ['idle', 'walk', 'run', 'jump'] as const;
const STATE_KO: Record<string, string> = { idle: '서기', walk: '걷기', run: '뛰기', jump: '점프' };
const RATE: Record<string, number> = { idle: 0.45, walk: 1.25, run: 2.2, jump: 1.25 };
const SPEED: Record<string, number> = { idle: 0, walk: 38, run: 105, jump: 105 };
const TIMELINE: [string, number][] = [
  ['idle', 1.6],
  ['walk', 1.7],
  ['run', 2.0],
  ['jump', 0.8],
  ['run', 1.0],
  ['walk', 1.1],
  ['idle', 0.8],
];
const TL_LEN = TIMELINE.reduce((s, x) => s + x[1], 0);
function lerpPose(a: Pose, b: Pose, k: number): Pose {
  const o = {} as Pose;
  for (const key of Object.keys(a) as (keyof Pose)[]) o[key] = lerp(a[key], b[key], k);
  return o;
}

function makeSpriteSM() {
  let blendOn = true;
  let blendDur = 0.3;
  let cur = 'idle';
  let prev = 'idle';
  let changeAt = -10;
  let phase = 0;
  let jumpT = 0;
  let scroll = 0;
  let speed = 0;
  let lastT = 0;
  const stateAt = (tt: number): string => {
    let x = tt % TL_LEN;
    for (const [s, d] of TIMELINE) {
      if (x < d) return s;
      x -= d;
    }
    return 'idle';
  };
  return {
    draw(g: CanvasRenderingContext2D, w: number, h: number, t: number, dt: number) {
      dt = Math.min(dt, 0.05);
      lastT = t;
      const u = Math.min(w / 280, h / 175);
      const st = stateAt(t);
      if (st !== cur) {
        prev = cur;
        cur = st;
        changeAt = t;
        if (st === 'jump') jumpT = 0;
      }
      const wgt = blendOn ? smooth(0, blendDur, t - changeAt) : 1;
      const rate = lerp(RATE[prev]!, RATE[cur]!, wgt);
      phase = (phase + rate * dt) % 1;
      if (cur === 'jump' || prev === 'jump') jumpT += dt;
      const targetSpeed = SPEED[cur]!;
      speed = blendOn ? lerp(speed, targetSpeed, Math.min(1, dt * 4)) : targetSpeed;
      scroll += speed * dt;
      const pa = prev === 'jump' ? ANIMS.jump!(jumpT / 0.8) : ANIMS[prev]!(phase);
      const pb = cur === 'jump' ? ANIMS.jump!(jumpT / 0.8) : ANIMS[cur]!(phase);
      const pose = lerpPose(pa, pb, wgt);
      const jumpY = cur === 'jump' ? Math.sin(Math.min(1, jumpT / 0.8) * Math.PI) * 42 : 0;

      // 배경
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      const sky = g.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#5ab0ff');
      sky.addColorStop(1, '#c8ecff');
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      const gy = h * 0.8;
      // 구름
      g.fillStyle = 'rgba(255,255,255,0.9)';
      for (let i = 0; i < 4; i++) {
        const x = ((((i * 97 - scroll * 0.1) % (w + 80)) + w + 80) % (w + 80)) - 40;
        const y = (18 + (i % 2) * 22) * u;
        g.beginPath();
        g.arc(x, y, 10 * u, 0, TAU);
        g.arc(x + 12 * u, y - 5 * u, 12 * u, 0, TAU);
        g.arc(x + 25 * u, y, 9 * u, 0, TAU);
        g.fill();
      }
      // 먼 언덕
      g.fillStyle = '#86cf7a';
      g.beginPath();
      g.moveTo(0, gy);
      for (let x = 0; x <= w; x += 6) g.lineTo(x, gy - (22 + 12 * Math.sin((x + scroll * 0.3) * 0.02 / u) + 6 * Math.sin((x + scroll * 0.3) * 0.051 / u)) * u);
      g.lineTo(w, gy);
      g.fill();
      // 땅
      g.fillStyle = '#5bb04c';
      g.fillRect(0, gy, w, h - gy);
      g.fillStyle = '#c98b52';
      g.fillRect(0, gy + 7 * u, w, h - gy);
      g.fillStyle = '#b27640';
      const tile = 24 * u;
      for (let x = -((scroll * u) % tile); x < w; x += tile) g.fillRect(x, gy + 7 * u, 2 * u, h);
      g.fillStyle = '#3f9a3a';
      for (let x = -((scroll * u) % (14 * u)); x < w; x += 14 * u) {
        g.beginPath();
        g.moveTo(x, gy + 1);
        g.lineTo(x + 3 * u, gy - 4 * u);
        g.lineTo(x + 6 * u, gy + 1);
        g.fill();
      }
      // 그림자
      const cx = w * 0.3;
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.beginPath();
      g.ellipse(cx, gy + 2 * u, (14 - jumpY * 0.12) * u, 3 * u, 0, 0, TAU);
      g.fill();
      // 캐릭터
      g.save();
      g.translate(cx, gy - (jumpY + 27 + pose.bob) * u);
      g.rotate(pose.lean);
      g.scale(1 + pose.squash, 1 - pose.squash);
      const limb = (ang: number, bend: number, l1: number, l2: number, col: string, wdt: number, back: boolean, leg: boolean) => {
        g.strokeStyle = col;
        g.lineWidth = wdt * u;
        g.lineCap = 'round';
        g.lineJoin = 'round';
        const x1 = Math.sin(ang) * l1 * u;
        const y1 = Math.cos(ang) * l1 * u;
        const a2 = leg ? ang - bend : ang + bend;
        const x2 = x1 + Math.sin(a2) * l2 * u;
        const y2 = y1 + Math.cos(a2) * l2 * u;
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(x1, y1);
        g.lineTo(x2, y2);
        g.stroke();
        if (leg) {
          g.fillStyle = back ? '#2a2a3a' : '#3a3a52';
          g.beginPath();
          g.ellipse(x2 + 2.5 * u, y2 + 1 * u, 4.5 * u, 2.6 * u, 0, 0, TAU);
          g.fill();
        } else {
          g.fillStyle = back ? '#e0a37a' : '#ffc89a';
          g.beginPath();
          g.arc(x2, y2, 2.6 * u, 0, TAU);
          g.fill();
        }
      };
      // 뒤 팔 · 다리
      g.save();
      g.translate(0, 0);
      limb(pose.hipR, pose.kneeR, 12, 12, '#2f4f9a', 6, true, true);
      g.restore();
      g.save();
      g.translate(0, -19 * u);
      limb(pose.shR, pose.elR, 9, 9, '#d24a4a', 5, true, false);
      g.restore();
      // 몸
      g.fillStyle = '#ff5a5a';
      g.beginPath();
      g.roundRect(-7 * u, -24 * u, 14 * u, 22 * u, 5 * u);
      g.fill();
      g.fillStyle = '#3b63c4';
      g.beginPath();
      g.roundRect(-7 * u, -6 * u, 14 * u, 7 * u, 2 * u);
      g.fill();
      // 머리
      g.fillStyle = '#ffc89a';
      g.beginPath();
      g.arc(1 * u, -34 * u, 10 * u, 0, TAU);
      g.fill();
      g.fillStyle = '#4a2a18';
      g.beginPath();
      g.arc(0, -37 * u, 10 * u, Math.PI * 1.05, Math.PI * 2.05);
      g.fill();
      g.beginPath();
      g.arc(-6 * u, -36 * u, 5 * u, 0, TAU);
      g.fill();
      g.fillStyle = '#1a1a2a';
      g.beginPath();
      g.ellipse(6 * u, -34 * u, 1.6 * u, 2.4 * u, 0, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,110,110,0.55)';
      g.beginPath();
      g.arc(5 * u, -29.5 * u, 2.2 * u, 0, TAU);
      g.fill();
      // 앞 다리 · 팔
      limb(pose.hipL, pose.kneeL, 12, 12, '#3b63c4', 6, false, true);
      g.save();
      g.translate(0, -19 * u);
      limb(pose.shL, pose.elL, 9, 9, '#ff6a6a', 5, false, false);
      g.restore();
      g.restore();

      // 상태 그래프 (오른쪽 위)
      const px = w - 132 * u;
      const py = 10 * u;
      g.fillStyle = 'rgba(10,20,50,0.72)';
      g.beginPath();
      g.roundRect(px, py, 124 * u, 50 * u, 8 * u);
      g.fill();
      const nx = (i: number) => px + 17 * u + i * 30 * u;
      const ny = py + 20 * u;
      g.font = `800 ${8 * u}px ${F}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const ia = STATES.indexOf(prev as (typeof STATES)[number]);
      const ib = STATES.indexOf(cur as (typeof STATES)[number]);
      for (let i = 0; i < 3; i++) {
        g.strokeStyle = 'rgba(255,255,255,0.3)';
        g.lineWidth = 1.5 * u;
        g.beginPath();
        g.moveTo(nx(i) + 11 * u, ny);
        g.lineTo(nx(i + 1) - 11 * u, ny);
        g.stroke();
      }
      if (ia !== ib && wgt < 1) {
        const x0 = nx(ia);
        const x1 = nx(ib);
        const xm = lerp(x0, x1, wgt);
        g.strokeStyle = '#ffd23f';
        g.lineWidth = 3 * u;
        g.beginPath();
        g.moveTo(x0, ny);
        g.lineTo(xm, ny);
        g.stroke();
      }
      STATES.forEach((s, i) => {
        const on = i === ib ? wgt : i === ia ? 1 - wgt : 0;
        g.fillStyle = on > 0.01 ? `rgba(255,${Math.round(210 - 40 * on)},63,${0.35 + on * 0.65})` : 'rgba(255,255,255,0.12)';
        g.beginPath();
        g.arc(nx(i), ny, 11 * u, 0, TAU);
        g.fill();
        g.fillStyle = on > 0.5 ? '#2a1a00' : '#fff';
        g.fillText(STATE_KO[s]!, nx(i), ny + 0.5 * u);
      });
      g.fillStyle = '#fff';
      g.font = `700 ${7 * u}px ${F}`;
      g.textAlign = 'left';
      g.fillText(blendOn ? `섞기 ${Math.round(wgt * 100)}%` : '섞기 끔 — 툭 바뀜', px + 8 * u, py + 41 * u);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(px + 62 * u, py + 39 * u, 54 * u, 4 * u);
      g.fillStyle = '#ffd23f';
      g.fillRect(px + 62 * u, py + 39 * u, 54 * u * wgt, 4 * u);
      void lastT;
    },
    controls: [
      { type: 'toggle', label: '섞기 (끄면 동작이 툭 바뀜)', value: true, on: (v: boolean) => (blendOn = v) },
      { type: 'range', label: '섞는 시간 (초)', min: 0.05, max: 0.8, step: 0.05, value: 0.3, on: (v: number) => (blendDur = v) },
    ] as Control[],
  };
}

/* ═════════════ i234 노멀 맵 스프라이트 조명 ═════════════ */

function paintRelief(): { h: THREE.CanvasTexture; a: THREE.CanvasTexture } {
  const W = 640;
  const H = 400;
  const [hc, hg] = canvas(W, H);
  const [ac, ag] = canvas(W, H);
  const r = rng(77);
  hg.fillStyle = '#000';
  hg.fillRect(0, 0, W, H);
  ag.fillStyle = '#2a2a33';
  ag.fillRect(0, 0, W, H);
  // 돌벽
  const RH = 50;
  for (let row = 0; row < H / RH; row++) {
    let x = -r() * 60;
    while (x < W) {
      const bw = 70 + r() * 70;
      const y = row * RH + 3;
      hg.filter = 'blur(3px)';
      const top = 150 + r() * 70;
      hg.fillStyle = `rgb(${top},${top},${top})`;
      hg.beginPath();
      hg.roundRect(x + 4, y + 2, bw - 8, RH - 8, 10);
      hg.fill();
      hg.filter = 'none';
      const l = 30 + r() * 14;
      ag.fillStyle = `hsl(${215 + r() * 25},${10 + r() * 10}%,${l}%)`;
      ag.beginPath();
      ag.roundRect(x + 3, y + 1, bw - 6, RH - 6, 9);
      ag.fill();
      if (r() < 0.25) {
        ag.fillStyle = 'rgba(80,130,60,0.45)';
        ag.beginPath();
        ag.ellipse(x + r() * bw, y + RH - 10, 18, 6, 0, 0, TAU);
        ag.fill();
      }
      x += bw;
    }
  }
  // 결 · 금
  for (let i = 0; i < 1800; i++) {
    const v = r() > 0.5 ? 255 : 0;
    hg.fillStyle = `rgba(${v},${v},${v},0.08)`;
    hg.fillRect(r() * W, r() * H, 3, 3);
  }
  // 가운데 청동 방패 + 숫자 7
  const cx = W / 2;
  const cy = H / 2;
  hg.filter = 'blur(2px)';
  const dome = hg.createRadialGradient(cx - 10, cy - 10, 10, cx, cy, 120);
  dome.addColorStop(0, '#fff');
  dome.addColorStop(1, '#888');
  hg.fillStyle = dome;
  hg.beginPath();
  hg.arc(cx, cy, 118, 0, TAU);
  hg.fill();
  hg.strokeStyle = '#fff';
  hg.lineWidth = 14;
  hg.beginPath();
  hg.arc(cx, cy, 108, 0, TAU);
  hg.stroke();
  hg.fillStyle = '#9a9a9a';
  hg.beginPath();
  hg.arc(cx, cy, 92, 0, TAU);
  hg.fill();
  hg.filter = 'none';
  for (let k = 0; k < 7; k++) {
    hg.filter = `blur(${6 - k * 0.8}px)`;
    const v = 150 + k * 15;
    hg.fillStyle = `rgb(${v},${v},${v})`;
    hg.font = `900 ${170 - k * 3}px ${F}`;
    hg.textAlign = 'center';
    hg.textBaseline = 'middle';
    hg.fillText('7', cx, cy + 8);
  }
  hg.filter = 'none';
  const ab = ag.createRadialGradient(cx - 30, cy - 30, 10, cx, cy, 120);
  ab.addColorStop(0, '#c98a4a');
  ab.addColorStop(1, '#7a4a22');
  ag.fillStyle = ab;
  ag.beginPath();
  ag.arc(cx, cy, 118, 0, TAU);
  ag.fill();
  ag.strokeStyle = '#e8b04a';
  ag.lineWidth = 14;
  ag.beginPath();
  ag.arc(cx, cy, 108, 0, TAU);
  ag.stroke();
  ag.fillStyle = '#ffcc4a';
  ag.font = `900 170px ${F}`;
  ag.textAlign = 'center';
  ag.textBaseline = 'middle';
  ag.fillText('7', cx, cy + 8);
  // 징
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU;
    const x = cx + Math.cos(a) * 108;
    const y = cy + Math.sin(a) * 108;
    const gr = hg.createRadialGradient(x - 1, y - 1, 0, x, y, 7);
    gr.addColorStop(0, '#fff');
    gr.addColorStop(1, '#bbb');
    hg.fillStyle = gr;
    hg.beginPath();
    hg.arc(x, y, 7, 0, TAU);
    hg.fill();
    ag.fillStyle = '#f0d070';
    ag.beginPath();
    ag.arc(x, y, 6, 0, TAU);
    ag.fill();
  }
  // 금화
  for (const [x, y] of [
    [92, 330],
    [128, 344],
    [520, 320],
    [556, 342],
    [500, 352],
  ] as const) {
    const gr = hg.createRadialGradient(x - 4, y - 4, 2, x, y, 20);
    gr.addColorStop(0, '#fff');
    gr.addColorStop(1, '#999');
    hg.fillStyle = gr;
    hg.beginPath();
    hg.arc(x, y, 18, 0, TAU);
    hg.fill();
    hg.fillStyle = '#bbb';
    hg.beginPath();
    hg.arc(x, y, 11, 0, TAU);
    hg.fill();
    ag.fillStyle = '#f2b632';
    ag.beginPath();
    ag.arc(x, y, 18, 0, TAU);
    ag.fill();
  }
  return { h: canvasTex(hc, false), a: canvasTex(ac) };
}

function makeNormalSprite(): Scene3D {
  const { h: hTex, a: aTex } = paintRelief();
  const uni = {
    uH: { value: hTex },
    uA: { value: aTex },
    uRes: { value: new THREE.Vector2(1, 1) },
    uLight: { value: new THREE.Vector3(0.8, 0.5, 0.14) },
    uStr: { value: 7 },
    uSplit: { value: 0 },
    uFl: { value: 1 },
  };
  const q = quad(
    /* glsl */ `
    uniform sampler2D uH, uA; uniform vec2 uRes; uniform vec3 uLight; uniform float uStr, uSplit, uFl;
    varying vec2 vUv;
    void main(){
      float sa = uRes.x / uRes.y; vec2 uv = vUv;
      if (sa > 1.6) uv.y = (uv.y - 0.5) * 1.6 / sa + 0.5; else uv.x = (uv.x - 0.5) * sa / 1.6 + 0.5;
      vec2 e = vec2(1.5 / 640.0, 1.5 / 400.0);
      float h = texture2D(uH, uv).r;
      float hl = texture2D(uH, uv - vec2(e.x, 0.0)).r, hr = texture2D(uH, uv + vec2(e.x, 0.0)).r;
      float hd = texture2D(uH, uv - vec2(0.0, e.y)).r, hu = texture2D(uH, uv + vec2(0.0, e.y)).r;
      vec3 N = normalize(vec3((hl - hr) * uStr, (hd - hu) * uStr, 1.0));
      bool flat_ = gl_FragCoord.x < uSplit;
      if (flat_) N = vec3(0.0, 0.0, 1.0);
      vec3 alb = texture2D(uA, uv).rgb;
      vec3 P = vec3(uv.x * 1.6, uv.y, h * 0.05);
      vec3 Lv = uLight - P; float d = length(Lv); vec3 L = Lv / d;
      float diff = max(dot(N, L), 0.0);
      float metal = smoothstep(0.05, 0.25, alb.r - alb.b);
      vec3 Hh = normalize(L + vec3(0.0, 0.0, 1.0));
      float spec = pow(max(dot(N, Hh), 0.0), mix(18.0, 60.0, metal)) * mix(0.15, 1.6, metal);
      float att = 1.0 / (1.0 + d * d * 3.5);
      vec3 lc = vec3(1.0, 0.66, 0.32) * uFl;
      vec3 col = alb * (vec3(0.025, 0.03, 0.05) + diff * lc * att * 3.2) + lc * spec * att * 2.0;
      float g = length(P.xy - uLight.xy);
      col += lc * (exp(-g * 22.0) * 0.9 + exp(-g * 6.0) * 0.08);
      gl_FragColor = vec4(col, 1.0);
      ${OUT}
    }`,
    uni,
  );
  const hud = new Hud();
  const a = hud.add('그림만 (평면 조명)');
  const b = hud.add('노멀 맵 조명', 'rgba(150,80,20,0.8)');
  hud.at(a, 0.03, 0.05, 0, 0);
  hud.at(b, 0.97, 0.05, 1, 0);
  let compare = true;
  let lz = 0.14;
  let time = 0;
  return {
    scene: q.scene,
    camera: q.cam,
    update(t) {
      time = t;
      uni.uLight.value.set(0.8 + Math.sin(t * 0.6) * 0.62, 0.5 + Math.sin(t * 1.05 + 1) * 0.36, lz);
      uni.uFl.value = 0.9 + 0.1 * Math.sin(t * 17) * Math.sin(t * 7.3);
    },
    render(r, w, h) {
      uni.uRes.value.set(w, h);
      const s = compare ? (0.5 + Math.sin(time * 0.35) * 0.15) * w : -1;
      uni.uSplit.value = s;
      r.render(q.scene, q.cam);
      if (compare) {
        drawDivider(r, s, h, w);
        hud.at(a, 0.03, 0.05, 0, 0);
      } else hud.hide(a);
      hud.draw(r, w, h);
    },
    controls: [
      { type: 'range', label: '요철 세기', min: 0, max: 16, step: 0.5, value: 7, on: (v) => (uni.uStr.value = v) },
      { type: 'range', label: '횃불 높이', min: 0.04, max: 0.5, step: 0.01, value: 0.14, on: (v) => (lz = v) },
      { type: 'toggle', label: '나눠 비교', value: true, on: (v) => (compare = v) },
    ],
    dispose() {
      q.dispose();
      hTex.dispose();
      aTex.dispose();
      hud.dispose();
    },
  };
}

/* ═════════════ i235 2D 시야 다각형 ═════════════ */

type Seg = [number, number, number, number];
function makeVisibility() {
  // 설계 좌표 280 × 175
  const rects: [number, number, number, number][] = [
    [52, 34, 26, 26],
    [150, 26, 16, 52],
    [200, 104, 40, 16],
    [96, 112, 18, 36],
    [230, 40, 20, 20],
    [36, 118, 22, 14],
  ];
  const segs: Seg[] = [
    [6, 6, 274, 6],
    [274, 6, 274, 169],
    [274, 169, 6, 169],
    [6, 169, 6, 6],
  ];
  for (const [x, y, w, h] of rects) segs.push([x, y, x + w, y], [x + w, y, x + w, y + h], [x + w, y + h, x, y + h], [x, y + h, x, y]);
  // L 벽
  segs.push([120, 80, 180, 80], [180, 80, 180, 86], [180, 86, 126, 86], [126, 86, 126, 104], [126, 104, 120, 104], [120, 104, 120, 80]);
  const gems: [number, number][] = [
    [30, 24],
    [258, 150],
    [170, 50],
    [70, 156],
    [250, 22],
    [140, 140],
    [212, 72],
  ];
  const cast = (ox: number, oy: number, dx: number, dy: number): [number, number] => {
    let best = 1e9;
    for (const [x1, y1, x2, y2] of segs) {
      const sx = x2 - x1;
      const sy = y2 - y1;
      const den = dx * sy - dy * sx;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((x1 - ox) * sy - (y1 - oy) * sx) / den;
      const s = ((x1 - ox) * dy - (y1 - oy) * dx) / den;
      if (t > 0 && s >= 0 && s <= 1 && t < best) best = t;
    }
    return [ox + dx * best, oy + dy * best];
  };
  let showRays = true;
  let fov = 360;
  return {
    draw(g: CanvasRenderingContext2D, w: number, h: number, t: number) {
      const u = Math.min(w / 280, h / 175);
      const ox0 = (w - 280 * u) / 2;
      const oy0 = (h - 175 * u) / 2;
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#05060c';
      g.fillRect(0, 0, w, h);
      g.save();
      g.translate(ox0, oy0);
      g.scale(u, u);
      // 경비원 순찰 (8자)
      const px = 140 + Math.sin(t * 0.45) * 108;
      const py = 92 + Math.sin(t * 0.9) * 60;
      const vx = Math.cos(t * 0.45) * 108 * 0.45;
      const vy = Math.cos(t * 0.9) * 60 * 0.9;
      const dir = Math.atan2(vy, vx);
      const half = (fov / 2) * (Math.PI / 180);
      const angs: number[] = [];
      const cone = fov < 359;
      const inCone = (a: number) => {
        let d = a - dir;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        return Math.abs(d) <= half;
      };
      for (const [x1, y1, x2, y2] of segs)
        for (const [x, y] of [
          [x1, y1],
          [x2, y2],
        ] as const) {
          const a = Math.atan2(y - py, x - px);
          for (const e of [-1e-4, 0, 1e-4]) if (!cone || inCone(a + e)) angs.push(a + e);
        }
      if (cone) {
        for (let k = 0; k <= 16; k++) angs.push(dir - half + (2 * half * k) / 16);
      }
      const rel = (a: number) => {
        let d = a - (cone ? dir - half : -Math.PI);
        d = ((d % TAU) + TAU) % TAU;
        return d;
      };
      angs.sort((a, b) => rel(a) - rel(b));
      const pts = angs.map((a) => cast(px, py, Math.cos(a), Math.sin(a)));
      const poly = () => {
        g.beginPath();
        if (cone) g.moveTo(px, py);
        pts.forEach(([x, y], i) => (i || cone ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.closePath();
      };
      // 밝은 바닥 (다각형 안만)
      g.save();
      poly();
      g.clip();
      const gr = g.createRadialGradient(px, py, 4, px, py, 190);
      gr.addColorStop(0, '#fff3c4');
      gr.addColorStop(0.35, '#e8c27a');
      gr.addColorStop(1, '#4a3a2a');
      g.fillStyle = gr;
      g.fillRect(0, 0, 280, 175);
      g.strokeStyle = 'rgba(80,50,20,0.25)';
      g.lineWidth = 0.6;
      for (let x = 6; x < 274; x += 12) {
        g.beginPath();
        g.moveTo(x, 6);
        g.lineTo(x, 169);
        g.stroke();
      }
      for (let y = 6; y < 169; y += 12) {
        g.beginPath();
        g.moveTo(6, y);
        g.lineTo(274, y);
        g.stroke();
      }
      g.restore();
      // 보석: 보이면 반짝
      for (const [gx, gy] of gems) {
        const [hx, hy] = cast(px, py, gx - px, gy - py);
        const vis = Math.hypot(hx - px, hy - py) >= Math.hypot(gx - px, gy - py) - 0.5 && (!cone || inCone(Math.atan2(gy - py, gx - px)));
        g.fillStyle = vis ? '#3ff0ff' : 'rgba(60,80,120,0.35)';
        g.beginPath();
        g.moveTo(gx, gy - 4.5);
        g.lineTo(gx + 3.5, gy);
        g.lineTo(gx, gy + 4.5);
        g.lineTo(gx - 3.5, gy);
        g.closePath();
        g.fill();
        if (vis) {
          g.fillStyle = 'rgba(120,250,255,0.25)';
          g.beginPath();
          g.arc(gx, gy, 8 + Math.sin(t * 6) * 1.5, 0, TAU);
          g.fill();
        }
      }
      // 광선
      if (showRays) {
        g.strokeStyle = 'rgba(255,90,90,0.45)';
        g.lineWidth = 0.5;
        for (const [x, y] of pts) {
          g.beginPath();
          g.moveTo(px, py);
          g.lineTo(x, y);
          g.stroke();
        }
        g.fillStyle = '#ff5a5a';
        for (const [x, y] of pts) g.fillRect(x - 1, y - 1, 2, 2);
      }
      // 벽
      g.fillStyle = '#5a6c9a';
      g.strokeStyle = '#a8b8e8';
      g.lineWidth = 1;
      for (const [x, y, rw, rh] of rects) {
        g.fillRect(x, y, rw, rh);
        g.strokeRect(x, y, rw, rh);
      }
      g.beginPath();
      g.moveTo(120, 80);
      g.lineTo(180, 80);
      g.lineTo(180, 86);
      g.lineTo(126, 86);
      g.lineTo(126, 104);
      g.lineTo(120, 104);
      g.closePath();
      g.fill();
      g.stroke();
      g.strokeStyle = '#a8b8e8';
      g.lineWidth = 2;
      g.strokeRect(6, 6, 268, 163);
      // 경비원
      g.fillStyle = '#ff5a5a';
      g.beginPath();
      g.arc(px, py, 5, 0, TAU);
      g.fill();
      g.strokeStyle = '#fff';
      g.lineWidth = 1.5;
      g.stroke();
      g.beginPath();
      g.moveTo(px + Math.cos(dir) * 5, py + Math.sin(dir) * 5);
      g.lineTo(px + Math.cos(dir) * 10, py + Math.sin(dir) * 10);
      g.stroke();
      g.restore();
      // 글
      g.font = `700 ${Math.max(10, 9 * u)}px ${F}`;
      g.fillStyle = 'rgba(0,0,0,0.6)';
      const txt = `광선 ${pts.length}개 → 보이는 다각형`;
      const tw = g.measureText(txt).width;
      g.beginPath();
      g.roundRect(ox0 + 10 * u, oy0 + 150 * u, tw + 14 * u, 14 * u, 7 * u);
      g.fill();
      g.fillStyle = '#fff';
      g.textBaseline = 'middle';
      g.fillText(txt, ox0 + 17 * u, oy0 + 157.5 * u);
    },
    controls: [
      { type: 'toggle', label: '광선 보기 (꼭짓점마다 3개)', value: true, on: (v: boolean) => (showRays = v) },
      { type: 'range', label: '시야각 (°)', min: 30, max: 360, step: 5, value: 360, on: (v: number) => (fov = v) },
    ] as Control[],
  };
}

/* ═════════════ i236 팔레트 색 순환 ═════════════ */

function makeCycle() {
  const W = 192;
  const H = 120;
  const idx = new Uint8Array(W * H);
  const pal = new Uint32Array(256);
  const rgb = (r: number, g: number, b: number) => (255 << 24) | (b << 16) | (g << 8) | r;
  // 하늘 0..15
  for (let i = 0; i < 16; i++) {
    const k = i / 15;
    pal[i] = rgb(Math.round(lerp(40, 255, k ** 1.4)), Math.round(lerp(30, 170, k)), Math.round(lerp(90, 120, k)));
  }
  // 바위 · 숲 16..27
  const rock = [
    [34, 28, 50],
    [52, 40, 70],
    [74, 56, 88],
    [98, 74, 104],
    [20, 50, 40],
    [30, 74, 52],
    [46, 100, 62],
    [70, 130, 70],
  ];
  rock.forEach(([r, g, b], i) => (pal[16 + i] = rgb(r!, g!, b!)));
  // 폭포 32..47 (흰 줄이 흐르게)
  const fall = [255, 220, 170, 120, 90, 70, 60, 70, 90, 120, 150, 110, 80, 70, 100, 180];
  fall.forEach((v, i) => (pal[32 + i] = rgb(Math.round(v * 0.75), Math.round(v * 0.92), Math.min(255, v + 40))));
  // 호수 물결 48..63
  for (let i = 0; i < 16; i++) {
    const v = 0.5 + 0.5 * Math.cos((i / 16) * TAU);
    pal[48 + i] = rgb(Math.round(lerp(20, 120, v ** 3)), Math.round(lerp(50, 150, v ** 2)), Math.round(lerp(110, 210, v)));
  }
  // 해 반사 64..71
  for (let i = 0; i < 8; i++) {
    const v = i < 2 ? 1 : 0.25;
    pal[64 + i] = rgb(Math.round(lerp(60, 255, v)), Math.round(lerp(80, 220, v)), Math.round(lerp(140, 150, v)));
  }
  const r0 = rng(9);
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      // 하늘 (디더 띠)
      const sk = (y / 62) * 15;
      const b = (bayer[(y % 4) * 4 + (x % 4)]! + 0.5) / 16;
      idx[i] = Math.min(15, Math.max(0, Math.floor(sk + b - 0.5)));
    }
  // 해
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if ((x - 140) ** 2 + (y - 44) ** 2 < 120) idx[y * W + x] = 15;
  // 먼 산
  for (let x = 0; x < W; x++) {
    const top = 46 + Math.round(8 * Math.sin(x * 0.05) + 5 * Math.sin(x * 0.13 + 1));
    for (let y = top; y < 70; y++) idx[y * W + x] = 17 + (y - top < 2 ? 1 : 0);
  }
  // 호수 (아래)
  for (let y = 70; y < H; y++)
    for (let x = 0; x < W; x++) {
      const d = y - 70;
      const band = Math.floor(d * 0.9 + 3 * Math.sin(x * 0.12 + d * 0.3) + r0() * 1.2);
      idx[y * W + x] = 48 + (((band % 16) + 16) % 16);
      // 해 반사 기둥
      if (Math.abs(x - 140) < 10 - d * 0.08 && (x + y * 3) % 5 < 2) idx[y * W + x] = 64 + ((d + (x % 3)) % 8);
    }
  // 절벽 · 폭포
  for (let y = 22; y < 76; y++)
    for (let x = 0; x < W; x++) {
      const leftEdge = 64 + Math.round(4 * Math.sin(y * 0.3));
      const rightEdge = 92 + Math.round(3 * Math.sin(y * 0.25 + 2));
      const cliffL = x < 30 + y * 0.6 && x >= 0 && y > 30 - x * 0.2;
      if (x >= leftEdge - 18 && x < leftEdge) idx[y * W + x] = 16 + ((x + y) % 7 < 2 ? 2 : 1);
      else if (x >= rightEdge && x < rightEdge + 22) idx[y * W + x] = 16 + ((x * 3 + y) % 9 < 2 ? 3 : 1);
      else if (x >= leftEdge && x < rightEdge) {
        const col = Math.floor(r0() * 3) + ((x * 7) % 5);
        idx[y * W + x] = 32 + (((y - col) % 16) + 16) % 16;
      } else if (cliffL) idx[y * W + x] = 20 + ((x + y) % 5 === 0 ? 1 : 0);
    }
  // 물보라 (호수 위 폭포 발치)
  for (let y = 70; y < 82; y++)
    for (let x = 52; x < 106; x++) {
      const k = 1 - Math.abs(x - 78) / 28 - (y - 70) / 14;
      if (k > 0.2 && r0() < k) idx[y * W + x] = 32 + ((y * 2 + x) % 16);
    }
  // 앞 나무 실루엣
  for (const tx of [12, 30, 170, 184]) {
    const th = 34 + (tx % 7) * 3;
    for (let y = H - th; y < H; y++) {
      const wdt = Math.round(((y - (H - th)) / th) * 10) + 1;
      for (let x = tx - wdt; x <= tx + wdt; x++) if (x >= 0 && x < W) idx[y * W + x] = 20 + ((x + y) % 4 === 0 ? 1 : 0);
    }
  }
  const [cv, cg] = canvas(W, H);
  const img = cg.createImageData(W, H);
  const buf = new Uint32Array(img.data.buffer);
  let on = true;
  let speed = 1;
  let showPal = true;
  let off = 0;
  const shown = new Uint32Array(256);
  return {
    draw(g: CanvasRenderingContext2D, w: number, h: number, _t: number, dt: number) {
      if (on) off += dt * speed * 12;
      const o1 = Math.floor(off);
      const o2 = Math.floor(off * 0.5);
      const o3 = Math.floor(off * 0.7);
      for (let i = 0; i < 256; i++) shown[i] = pal[i]!;
      for (let i = 0; i < 16; i++) shown[32 + i] = pal[32 + ((((i - o1) % 16) + 16) % 16)]!;
      for (let i = 0; i < 16; i++) shown[48 + i] = pal[48 + ((((i - o2) % 16) + 16) % 16)]!;
      for (let i = 0; i < 8; i++) shown[64 + i] = pal[64 + ((((i - o3) % 8) + 8) % 8)]!;
      for (let i = 0; i < W * H; i++) buf[i] = shown[idx[i]!]!;
      cg.putImageData(img, 0, 0);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#000';
      g.fillRect(0, 0, w, h);
      const ph = showPal ? Math.max(14, h * 0.12) : 0;
      const sc = Math.min(w / W, (h - ph) / H);
      const dw = W * sc;
      const dh = H * sc;
      g.imageSmoothingEnabled = false;
      g.drawImage(cv, (w - dw) / 2, (h - ph - dh) / 2, dw, dh);
      if (showPal) {
        const y0 = h - ph;
        const n = 40;
        const cw = w / n;
        for (let i = 0; i < n; i++) {
          const p = shown[32 + i]!;
          g.fillStyle = `rgb(${p & 255},${(p >> 8) & 255},${(p >> 16) & 255})`;
          g.fillRect(i * cw, y0 + 3, cw + 0.5, ph - 6);
        }
        g.strokeStyle = '#ffd23f';
        g.lineWidth = 2;
        g.strokeRect(1, y0 + 2, 16 * cw - 2, ph - 4);
        g.strokeStyle = '#7fe0ff';
        g.strokeRect(16 * cw + 1, y0 + 2, 16 * cw - 2, ph - 4);
        g.font = `800 ${Math.max(9, ph * 0.42)}px ${F}`;
        g.textBaseline = 'middle';
        g.fillStyle = '#fff';
        g.shadowColor = 'rgba(0,0,0,0.9)';
        g.shadowBlur = 4;
        g.fillText('폭포 16색 →', 6, y0 + ph / 2);
        g.fillText('호수 16색 →', 16 * cw + 6, y0 + ph / 2);
        g.shadowBlur = 0;
      }
      g.imageSmoothingEnabled = true;
    },
    controls: [
      { type: 'toggle', label: '색 순환 (끄면 그냥 그림)', value: true, on: (v: boolean) => (on = v) },
      { type: 'range', label: '빠르기', min: 0, max: 4, step: 0.1, value: 1, on: (v: number) => (speed = v) },
      { type: 'toggle', label: '팔레트 띠 보기', value: true, on: (v: boolean) => (showPal = v) },
    ] as Control[],
  };
}

/* ═════════════ 후처리 견본에 쓰는 작은 무대 (i237 · i238) ═════════════ */

function postStage(): { scene: THREE.Scene; cam: THREE.PerspectiveCamera; update(t: number): void; dispose(): void } {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x10131c);
  const cam = new THREE.PerspectiveCamera(40, 1.6, 0.1, 50);
  scene.add(new THREE.HemisphereLight(0x8090b0, 0x201810, 0.5));
  const lamp = new THREE.PointLight(0xffe0b0, 30, 12, 1.6);
  scene.add(lamp);
  const dl = new THREE.DirectionalLight(0xffffff, 1.4);
  dl.position.set(-3, 5, 4);
  scene.add(dl);
  const root = new THREE.Group();
  scene.add(root);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8a7a66, roughness: 0.9 }));
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 6), new THREE.MeshStandardMaterial({ color: 0x6a6e80, roughness: 0.9 }));
  wall.position.set(0, 3, -3);
  root.add(floor, wall);
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.7, 48, 32), new THREE.MeshStandardMaterial({ color: 0xff7a59, roughness: 0.35 }));
  sphere.position.set(-1.6, 0.7, 0);
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.45, 0.16, 140, 20), new THREE.MeshStandardMaterial({ color: 0x4fb2ff, roughness: 0.3, metalness: 0.2 }));
  knot.position.set(0.3, 1.05, -0.3);
  const box = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.9, 0.9, 4, 0.08), new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.5 }));
  box.position.set(1.9, 0.45, 0.4);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.1, 32), new THREE.MeshStandardMaterial({ color: 0x5ed68a, roughness: 0.5 }));
  cone.position.set(-0.3, 0.55, 1.2);
  const lampBulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), new THREE.MeshBasicMaterial({ color: 0xfff2d0 }));
  lamp.add(lampBulb);
  root.add(sphere, knot, box, cone);
  return {
    scene,
    cam,
    update(t) {
      const a = Math.sin(t * 0.25) * 0.6;
      cam.position.set(Math.sin(a) * 6, 2.6, Math.cos(a) * 6);
      cam.lookAt(0, 0.7, 0);
      knot.rotation.y = t * 0.7;
      knot.rotation.x = t * 0.3;
      box.rotation.y = -t * 0.4;
      lamp.position.set(Math.cos(t * 0.8) * 2.4, 1.8 + Math.sin(t * 1.3) * 0.4, Math.sin(t * 0.8) * 1.6 + 0.6);
    },
    dispose() {
      freeAll(root);
      lampBulb.geometry.dispose();
      (lampBulb.material as THREE.Material).dispose();
    },
  };
}

/** 왼쪽은 그냥 그리고 오른쪽만 후처리 (scissor) */
function splitPost(r: THREE.WebGLRenderer, w: number, h: number, split: number, plain: () => void, post: () => void): void {
  const sx = Math.round(split * w);
  r.setRenderTarget(null);
  r.setScissorTest(true);
  if (sx > 0) {
    r.setViewport(0, 0, w, h);
    r.setScissor(0, 0, sx, h);
    plain();
  }
  r.setViewport(0, 0, w, h);
  r.setScissor(sx, 0, w - sx, h);
  post();
  r.setScissorTest(false);
  r.setScissor(0, 0, w, h);
  if (sx > 0) drawDivider(r, sx, h, w);
}

/* ═════════════ i237 디더링 (Bayer · 1비트) ═════════════ */

const BAYER8 = /* glsl */ `
float bayer8(vec2 p){
  ivec2 ip = ivec2(mod(p, 8.0)); int x = ip.x; int xc = ip.x ^ ip.y;
  int v = ((xc & 1) << 5) | ((x & 1) << 4) | ((xc & 2) << 2) | ((x & 2) << 1) | ((xc & 4) >> 1) | ((x & 4) >> 2);
  return (float(v) + 0.5) / 64.0;
}`;

function makeDither(): Scene3D {
  const st = postStage();
  const low = new LowRT({ minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const uni = { tScene: { value: null as THREE.Texture | null }, uLow: { value: new THREE.Vector2() }, uPx: { value: 2 }, uMode: { value: 0 } };
  const q = quad(
    /* glsl */ `
    uniform sampler2D tScene; uniform vec2 uLow; uniform float uPx, uMode;
    ${BAYER8}
    void main(){
      vec2 pix = floor(gl_FragCoord.xy / uPx);
      vec3 c = texture2D(tScene, (pix + 0.5) / uLow).rgb;
      c = pow(1.0 - exp(-c * 0.75), vec3(1.0 / 2.2));
      float L = dot(c, vec3(0.299, 0.587, 0.114));
      L = smoothstep(0.08, 0.92, L);
      float b = bayer8(pix);
      vec3 o;
      if (uMode < 0.5){ o = L > b ? vec3(0.90, 1.0, 1.0) : vec3(0.20, 0.20, 0.10); }
      else if (uMode < 1.5){ o = L > 0.5 ? vec3(0.90, 1.0, 1.0) : vec3(0.20, 0.20, 0.10); }
      else {
        float k = clamp(floor(L * 3.0 + b), 0.0, 3.0);
        o = k < 0.5 ? vec3(0.06, 0.22, 0.06) : k < 1.5 ? vec3(0.19, 0.38, 0.19) : k < 2.5 ? vec3(0.55, 0.67, 0.06) : vec3(0.61, 0.74, 0.06);
      }
      gl_FragColor = vec4(o, 1.0);
    }`,
    uni,
  );
  const hud = new Hud();
  const MODES = ['1비트 Bayer 디더', '1비트 문턱만 (디더 없음)', '4색 Bayer (옛 게임기)'];
  const a = hud.add('원래 장면');
  const b = hud.add(MODES[0]!, 'rgba(60,60,30,0.85)');
  hud.at(a, 0.03, 0.05, 0, 0);
  hud.at(b, 0.97, 0.05, 1, 0);
  let compare = true;
  let time = 0;
  return {
    scene: st.scene,
    camera: q.cam,
    update(t) {
      time = t;
      st.update(t);
    },
    render(r, w, h) {
      st.cam.aspect = w / h;
      st.cam.updateProjectionMatrix();
      const px = uni.uPx.value;
      const lw = Math.ceil(w / px);
      const lh = Math.ceil(h / px);
      const rt = low.get(lw, lh);
      r.setRenderTarget(rt);
      r.render(st.scene, st.cam);
      r.setRenderTarget(null);
      uni.tScene.value = rt.texture;
      uni.uLow.value.set(lw, lh);
      const split = compare ? 0.5 + Math.sin(time * 0.4) * 0.22 : 0;
      splitPost(
        r,
        w,
        h,
        split,
        () => r.render(st.scene, st.cam),
        () => r.render(q.scene, q.cam),
      );
      if (compare) hud.at(a, 0.03, 0.05, 0, 0);
      else hud.hide(a);
      hud.set(b, MODES[uni.uMode.value]!);
      hud.draw(r, w, h);
    },
    controls: [
      { type: 'range', label: '방식 (0 Bayer · 1 문턱 · 2 4색)', min: 0, max: 2, step: 1, value: 0, on: (v) => (uni.uMode.value = v) },
      { type: 'range', label: '점 크기 (px)', min: 1, max: 6, step: 1, value: 2, on: (v) => (uni.uPx.value = v) },
      { type: 'toggle', label: '원래 장면과 나눠 보기', value: true, on: (v) => (compare = v) },
    ],
    dispose() {
      st.dispose();
      low.dispose();
      q.dispose();
      hud.dispose();
    },
  };
}

/* ═════════════ i238 아스키 렌더 ═════════════ */

function glyphAtlas(): THREE.CanvasTexture {
  const chars = [' ', '.', ':', '-', '=', '+', '*', '#', '%', '@', '|', '/', '-', '\\'];
  const [c, g] = canvas(16 * 32, 32);
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff';
  g.font = '900 34px Consolas, "Courier New", monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  chars.forEach((ch, i) => g.fillText(ch, i * 32 + 16, 17));
  const t = canvasTex(c, false);
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  return t;
}

function makeAscii(): Scene3D {
  const st = postStage();
  const low = new LowRT({ minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const atlas = glyphAtlas();
  const uni = { tScene: { value: null as THREE.Texture | null }, tGlyph: { value: atlas }, uLow: { value: new THREE.Vector2() }, uCell: { value: 10 }, uEdge: { value: 1 }, uColor: { value: 1 } };
  const q = quad(
    /* glsl */ `
    uniform sampler2D tScene, tGlyph; uniform vec2 uLow; uniform float uCell, uEdge, uColor;
    vec3 S(vec2 cell){ vec3 c = texture2D(tScene, (cell + 0.5) / uLow).rgb; return pow(1.0 - exp(-c * 0.8), vec3(1.0 / 2.2)); }
    float Lm(vec2 cell){ return dot(S(cell), vec3(0.299, 0.587, 0.114)); }
    void main(){
      vec2 cell = floor(gl_FragCoord.xy / uCell);
      vec2 inC = fract(gl_FragCoord.xy / uCell);
      vec3 c = S(cell);
      float L = dot(c, vec3(0.299, 0.587, 0.114));
      float gi = floor(clamp(L * 1.15, 0.0, 0.999) * 10.0);
      if (uEdge > 0.5){
        float tl = Lm(cell + vec2(-1, 1)), t = Lm(cell + vec2(0, 1)), tr = Lm(cell + vec2(1, 1));
        float l = Lm(cell + vec2(-1, 0)), r = Lm(cell + vec2(1, 0));
        float bl = Lm(cell + vec2(-1, -1)), b = Lm(cell + vec2(0, -1)), br = Lm(cell + vec2(1, -1));
        float gx = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);
        float gy = (tl + 2.0 * t + tr) - (bl + 2.0 * b + br);
        if (length(vec2(gx, gy)) > 0.55){
          float a = mod(atan(gy, gx) + 3.14159265 / 8.0, 3.14159265);
          float k = floor(a / (3.14159265 / 4.0));
          gi = k < 0.5 ? 10.0 : k < 1.5 ? 13.0 : k < 2.5 ? 12.0 : 11.0;
        }
      }
      float gl = texture2D(tGlyph, vec2((gi + inC.x) / 16.0, inC.y)).r;
      vec3 tint = uColor > 0.5 ? clamp(c * 1.7 + 0.18, 0.0, 1.0) : vec3(0.35, 1.0, 0.55);
      vec3 o = vec3(0.02, 0.03, 0.04) + c * 0.16 + tint * gl;
      gl_FragColor = vec4(o, 1.0);
    }`,
    uni,
  );
  const hud = new Hud();
  const a = hud.add('원래 장면');
  const b = hud.add('아스키 — 밝기 → 글자, 윤곽 → / \\ | -', 'rgba(10,60,30,0.85)');
  hud.at(a, 0.03, 0.05, 0, 0);
  hud.at(b, 0.97, 0.05, 1, 0);
  let compare = true;
  let time = 0;
  return {
    scene: st.scene,
    camera: q.cam,
    update(t) {
      time = t;
      st.update(t);
    },
    render(r, w, h) {
      st.cam.aspect = w / h;
      st.cam.updateProjectionMatrix();
      const cs = Math.max(5, Math.round(uni.uCell.value * Math.max(1, h / 400)));
      const lw = Math.ceil(w / cs);
      const lh = Math.ceil(h / cs);
      const rt = low.get(lw, lh);
      r.setRenderTarget(rt);
      r.render(st.scene, st.cam);
      r.setRenderTarget(null);
      uni.tScene.value = rt.texture;
      uni.uLow.value.set(lw, lh);
      const save = uni.uCell.value;
      uni.uCell.value = cs;
      const split = compare ? 0.32 + Math.sin(time * 0.4) * 0.12 : 0;
      splitPost(
        r,
        w,
        h,
        split,
        () => r.render(st.scene, st.cam),
        () => r.render(q.scene, q.cam),
      );
      uni.uCell.value = save;
      if (compare) hud.at(a, 0.03, 0.05, 0, 0);
      else hud.hide(a);
      hud.draw(r, w, h);
    },
    controls: [
      { type: 'range', label: '글자 칸 크기', min: 5, max: 18, step: 1, value: 10, on: (v) => (uni.uCell.value = v) },
      { type: 'toggle', label: '윤곽 글자 (/ \\ | -)', value: true, on: (v) => (uni.uEdge.value = v ? 1 : 0) },
      { type: 'toggle', label: '장면 색 (끄면 초록 단말기)', value: true, on: (v) => (uni.uColor.value = v ? 1 : 0) },
      { type: 'toggle', label: '원래 장면과 나눠 보기', value: true, on: (v) => (compare = v) },
    ],
    dispose() {
      st.dispose();
      low.dispose();
      q.dispose();
      atlas.dispose();
      hud.dispose();
    },
  };
}

/* ═════════════ i239 저해상 3D 도트 + 1px 외곽선 ═════════════ */

function makePixel3D(): Scene3D {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2b3a5c);
  const cam = new THREE.OrthographicCamera(-4, 4, 2.5, -2.5, 0.1, 40);
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x40304a, 1.2));
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.6);
  sun.position.set(4, 7, 2);
  scene.add(sun);
  const ramp = toonRamp([0.35, 0.7, 1]);
  const M = (c: number) => new THREE.MeshToonMaterial({ color: c, gradientMap: ramp });
  const root = new THREE.Group();
  scene.add(root);
  const add = (geo: THREE.BufferGeometry, c: number | THREE.Material, x: number, y: number, z: number, ry = 0) => {
    const m = new THREE.Mesh(geo, typeof c === 'number' ? M(c) : c);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    root.add(m);
    return m;
  };
  add(new THREE.BoxGeometry(5, 0.9, 5), 0x8a5a3a, 0, -0.45, 0);
  add(new THREE.BoxGeometry(5, 0.2, 5), 0x6cc04a, 0, 0.1, 0);
  const water = add(new THREE.BoxGeometry(60, 0.1, 60), 0x3f8fd8, 0, -0.55, 0);
  // 집
  add(new THREE.BoxGeometry(1.4, 1.0, 1.2), 0xf3e2c0, -1.1, 0.7, -1.0);
  add(new THREE.ConeGeometry(1.15, 0.8, 4).rotateY(Math.PI / 4), 0xd8483a, -1.1, 1.6, -1.0);
  add(new THREE.BoxGeometry(0.35, 0.55, 0.05), 0x5a3a22, -1.1, 0.48, -0.38);
  add(new THREE.BoxGeometry(0.3, 0.3, 0.05), 0x8fd0ff, -0.7, 0.85, -0.38);
  // 나무
  const trunkGeo = new THREE.CylinderGeometry(0.1, 0.13, 0.6, 6);
  const leafGeo = new THREE.IcosahedronGeometry(0.5, 0);
  for (const [x, z, s] of [
    [1.4, -1.3, 1],
    [1.8, 0.6, 0.8],
    [-1.8, 1.5, 0.9],
  ] as const) {
    add(trunkGeo, 0x7a4a2a, x, 0.5, z);
    const l = add(leafGeo, 0x3f9a3a, x, 1.05 * s + 0.1, z, x);
    l.scale.setScalar(s);
    const l2 = add(leafGeo, 0x5fbf4a, x + 0.1, 1.45 * s + 0.1, z, x * 2);
    l2.scale.setScalar(s * 0.7);
  }
  // 울타리 · 길 · 꽃
  const postGeo = new THREE.BoxGeometry(0.1, 0.4, 0.1);
  for (let i = 0; i < 7; i++) add(postGeo, 0xc8a070, -2.3 + i * 0.4, 0.4, 2.2);
  add(new THREE.BoxGeometry(2.6, 0.06, 0.06), 0xc8a070, -1.1, 0.5, 2.2);
  const stoneGeo = new THREE.BoxGeometry(0.45, 0.06, 0.45);
  for (let i = 0; i < 5; i++) add(stoneGeo, 0xd8d0c0, -1.1 + i * 0.15, 0.22, -0.1 + i * 0.5, i);
  const flowerGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
  for (let i = 0; i < 10; i++) add(flowerGeo, [0xff5a8a, 0xffd23f, 0xffffff][i % 3]!, 0.3 + Math.sin(i * 2.3) * 1.1, 0.26, 0.9 + Math.cos(i * 1.7) * 0.6);
  // 꼬마
  const kid = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.2, 4, 10), M(0x4a7aff));
  body.position.y = 0.32;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), M(0xffd0a0));
  head.position.y = 0.66;
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.12, 12), M(0xff4a4a));
  hat.position.y = 0.8;
  kid.add(body, head, hat);
  root.add(kid);
  const low = new LowRT({ minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }, true);
  const lowN = new LowRT({ minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const nMat = new THREE.MeshNormalMaterial();
  const uni = { tC: { value: null as THREE.Texture | null }, tD: { value: null as THREE.Texture | null }, tN: { value: null as THREE.Texture | null }, uLow: { value: new THREE.Vector2() }, uPx: { value: 4 }, uOutline: { value: 1 } };
  const q = quad(
    /* glsl */ `
    uniform sampler2D tC, tD, tN; uniform vec2 uLow; uniform float uPx, uOutline;
    void main(){
      vec2 pix = floor(gl_FragCoord.xy / uPx);
      vec2 uv = (pix + 0.5) / uLow; vec2 e = 1.0 / uLow;
      vec3 c = texture2D(tC, uv).rgb;
      c = pow(1.0 - exp(-c * 1.25), vec3(1.0 / 2.2));
      if (uOutline > 0.5){
        float d = texture2D(tD, uv).r;
        vec3 n = texture2D(tN, uv).rgb * 2.0 - 1.0;
        float de = 0.0; float ne = 0.0;
        vec2 off[4]; off[0] = vec2(e.x, 0.0); off[1] = vec2(-e.x, 0.0); off[2] = vec2(0.0, e.y); off[3] = vec2(0.0, -e.y);
        for (int i = 0; i < 4; i++){
          float dn = texture2D(tD, uv + off[i]).r;
          vec3 nn = texture2D(tN, uv + off[i]).rgb * 2.0 - 1.0;
          de += step(0.004, dn - d);
          ne += step(abs(dn - d), 0.004) * step(0.0, dn - d) * (1.0 - smoothstep(0.6, 0.9, dot(n, nn)));
        }
        if (de > 0.0) c *= 0.38;
        else if (ne > 0.0) c = min(c * 1.35 + 0.05, vec3(1.0));
      }
      gl_FragColor = vec4(c, 1.0);
    }`,
    uni,
  );
  const hud = new Hud();
  const tag = hud.add('도트 3D (1/4 해상도) + 1px 외곽선');
  hud.at(tag, 0.03, 0.05, 0, 0);
  let compare = false;
  let ang = 0;
  return {
    scene,
    camera: q.cam,
    update(t) {
      ang = 0.6 + Math.sin(t * 0.25) * 0.5;
      cam.position.set(Math.sin(ang) * 12, 9, Math.cos(ang) * 12);
      cam.lookAt(0, 0.3, 0);
      const a = t * 0.7;
      kid.position.set(Math.cos(a) * 1.1 + 0.5, Math.abs(Math.sin(t * 7)) * 0.06 + 0.2, Math.sin(a) * 0.9 + 0.6);
      kid.rotation.y = -a;
      water.position.y = -0.55 + Math.sin(t * 1.5) * 0.02;
    },
    render(r, w, h) {
      const asp = w / h;
      const vs = 3.0;
      cam.left = -vs * asp;
      cam.right = vs * asp;
      cam.top = vs;
      cam.bottom = -vs;
      cam.updateProjectionMatrix();
      if (compare) {
        r.render(scene, cam);
        hud.set(tag, '보통 렌더 (비교)');
        hud.draw(r, w, h);
        return;
      }
      const px = Math.max(1, Math.round(uni.uPx.value * Math.max(1, h / 420)));
      const lw = Math.ceil(w / px);
      const lh = Math.ceil(h / px);
      const rt = low.get(lw, lh);
      const rn = lowN.get(lw, lh);
      r.setRenderTarget(rt);
      r.render(scene, cam);
      const bg = scene.background;
      scene.background = null;
      scene.overrideMaterial = nMat;
      const cc = r.getClearColor(new THREE.Color());
      const ca = r.getClearAlpha();
      r.setRenderTarget(rn);
      r.setClearColor(0x8080ff, 1);
      r.clear();
      r.render(scene, cam);
      r.setClearColor(cc, ca);
      scene.overrideMaterial = null;
      scene.background = bg;
      r.setRenderTarget(null);
      uni.tC.value = rt.texture;
      uni.tD.value = rt.depthTexture;
      uni.tN.value = rn.texture;
      uni.uLow.value.set(lw, lh);
      const save = uni.uPx.value;
      uni.uPx.value = px;
      r.render(q.scene, q.cam);
      uni.uPx.value = save;
      hud.set(tag, `도트 3D (1/${px} 해상도)${uni.uOutline.value ? ' + 1px 외곽선' : ''}`);
      hud.draw(r, w, h);
    },
    controls: [
      { type: 'range', label: '도트 크기', min: 1, max: 8, step: 1, value: 4, on: (v) => (uni.uPx.value = v) },
      { type: 'toggle', label: '1px 외곽선 · 모서리 밝힘', value: true, on: (v) => (uni.uOutline.value = v ? 1 : 0) },
      { type: 'toggle', label: '보통 렌더로 비교', value: false, on: (v) => (compare = v) },
    ],
    dispose() {
      freeAll(root);
      ramp.dispose();
      low.dispose();
      lowN.dispose();
      nMat.dispose();
      q.dispose();
      hud.dispose();
    },
  };
}

/* ═════════════ i240 낮은 다각형 평면 음영 ═════════════ */

function elev(x: number, y: number, z: number): number {
  return (
    0.55 * Math.sin(x * 2.1 + 1.3) * Math.sin(y * 2.4 + 0.4) * Math.sin(z * 2.2 + 2.1) +
    0.3 * Math.sin(x * 4.3 + z * 1.1) * Math.cos(y * 3.9 - 1) +
    0.15 * Math.sin(x * 8.1 - y * 6.3 + z * 7.7) +
    0.12
  );
}
const PLANET_COLS: [number, number][] = [
  [1.6, 0xe8d8a0],
  [1.66, 0xf2e2a8],
  [1.76, 0x7ccf55],
  [1.86, 0x4fa043],
  [1.95, 0x8f8a8a],
  [9, 0xffffff],
];
function planetGeos(detail: number): { flat: THREE.BufferGeometry; smooth: THREE.BufferGeometry; trees: THREE.Matrix4[] } {
  const base = new THREE.IcosahedronGeometry(1.6, detail);
  base.deleteAttribute('normal');
  base.deleteAttribute('uv');
  const ind = mergeVertices(base);
  base.dispose();
  const p = ind.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const e = elev(v.x, v.y, v.z);
    v.multiplyScalar(1.6 + Math.max(e, -0.15) * 0.45);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  const colOf = (r: number) => {
    for (const [lim, c] of PLANET_COLS) if (r < lim) return new THREE.Color(c);
    return new THREE.Color(0xffffff);
  };
  // 부드러운 판 (꼭짓점 색)
  const sc = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const c = colOf(v.length());
    sc.set([c.r, c.g, c.b], i * 3);
  }
  const smoothG = ind.clone();
  smoothG.setAttribute('color', new THREE.BufferAttribute(sc, 3));
  smoothG.computeVertexNormals();
  // 각진 판 (면마다 한 색)
  const flat = ind.toNonIndexed();
  ind.dispose();
  const fp = flat.attributes.position as THREE.BufferAttribute;
  const fc = new Float32Array(fp.count * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c3 = new THREE.Vector3();
  const trees: THREE.Matrix4[] = [];
  const r0 = rng(detail * 13 + 1);
  for (let f = 0; f < fp.count; f += 3) {
    a.fromBufferAttribute(fp, f);
    b.fromBufferAttribute(fp, f + 1);
    c3.fromBufferAttribute(fp, f + 2);
    const ctr = a.clone().add(b).add(c3).multiplyScalar(1 / 3);
    const rr = ctr.length();
    const c = colOf(rr);
    c.offsetHSL(0, 0, (r0() - 0.5) * 0.04);
    for (let k = 0; k < 3; k++) fc.set([c.r, c.g, c.b], (f + k) * 3);
    if (rr > 1.68 && rr < 1.84 && r0() < 0.12 * (4 / Math.max(1, detail ** 1.6))) {
      const n = ctr.clone().normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      const s = 0.6 + r0() * 0.5;
      trees.push(new THREE.Matrix4().compose(ctr, q, new THREE.Vector3(s, s, s)));
    }
  }
  flat.setAttribute('color', new THREE.BufferAttribute(fc, 3));
  flat.computeVertexNormals();
  return { flat, smooth: smoothG, trees };
}

function makeLowPoly(): Scene3D {
  const scene = new THREE.Scene();
  scene.background = gradBg([
    [0, '#1b2350'],
    [0.6, '#3a2c66'],
    [1, '#ff9a7a'],
  ]);
  const cam = new THREE.PerspectiveCamera(36, 1.6, 0.1, 60);
  cam.position.set(0, 1.4, 7.6);
  cam.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0x9fb8ff, 0x3a2040, 0.9));
  const key = new THREE.DirectionalLight(0xffe2c0, 2.8);
  key.position.set(5, 3, 4);
  const rim = new THREE.DirectionalLight(0x7fb0ff, 1.2);
  rim.position.set(-5, 2, -3);
  scene.add(key, rim);
  const planet = new THREE.Group();
  scene.add(planet);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 });
  const sea = new THREE.Mesh(new THREE.IcosahedronGeometry(1.64, 3), new THREE.MeshStandardMaterial({ color: 0x3aa0e8, flatShading: true, roughness: 0.3, transparent: true, opacity: 0.85 }));
  planet.add(sea);
  const land = new THREE.Mesh(new THREE.BufferGeometry(), mat);
  planet.add(land);
  const wireMat = new THREE.LineBasicMaterial({ color: 0x1a1030, transparent: true, opacity: 0.35 });
  const wire = new THREE.LineSegments(new THREE.BufferGeometry(), wireMat);
  wire.visible = false;
  planet.add(wire);
  const treeGeo = new THREE.ConeGeometry(0.07, 0.24, 5).translate(0, 0.12, 0);
  const treeMat = new THREE.MeshStandardMaterial({ color: 0x2f7a3a, flatShading: true, roughness: 0.9 });
  let trees = new THREE.InstancedMesh(treeGeo, treeMat, 1);
  planet.add(trees);
  let flatOn = true;
  let cur: ReturnType<typeof planetGeos> | null = null;
  const build = (d: number) => {
    cur?.flat.dispose();
    cur?.smooth.dispose();
    cur = planetGeos(d);
    land.geometry = flatOn ? cur.flat : cur.smooth;
    wire.geometry.dispose();
    wire.geometry = new THREE.WireframeGeometry(cur.flat);
    planet.remove(trees);
    trees.dispose();
    trees = new THREE.InstancedMesh(treeGeo, treeMat, Math.max(1, cur.trees.length));
    cur.trees.forEach((m, i) => trees.setMatrixAt(i, m));
    trees.count = cur.trees.length;
    planet.add(trees);
  };
  build(3);
  // 구름
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 1 });
  const cloudGeo = new THREE.IcosahedronGeometry(0.18, 0);
  const clouds: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const piv = new THREE.Group();
    const c = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const m = new THREE.Mesh(cloudGeo, cloudMat);
      m.position.set((k - 1.5) * 0.17, Math.sin(k * 2) * 0.05, Math.cos(k * 3) * 0.06);
      m.scale.setScalar(k === 1 || k === 2 ? 1.3 : 0.9);
      c.add(m);
    }
    c.position.set(0, 2.25, 0);
    piv.add(c);
    piv.rotation.set(i * 1.3, i * 2.1, i * 0.7);
    scene.add(piv);
    clouds.push(piv);
  }
  return {
    scene,
    camera: cam,
    update(t) {
      planet.rotation.y = t * 0.25;
      planet.rotation.x = 0.3;
      clouds.forEach((c, i) => (c.rotation.z += 0.0025 * (1 + i * 0.2)));
    },
    controls: [
      { type: 'toggle', label: '평면 음영 (끄면 매끈한 음영)', value: true, on: (v) => {
          flatOn = v;
          mat.flatShading = v;
          mat.needsUpdate = true;
          if (cur) land.geometry = v ? cur.flat : cur.smooth;
        } },
      { type: 'range', label: '면 쪼개기 단계', min: 1, max: 5, step: 1, value: 3, on: (v) => build(v) },
      { type: 'toggle', label: '모서리 선 보기', value: false, on: (v) => (wire.visible = v) },
    ],
    dispose() {
      cur?.flat.dispose();
      cur?.smooth.dispose();
      wire.geometry.dispose();
      wireMat.dispose();
      mat.dispose();
      sea.geometry.dispose();
      (sea.material as THREE.Material).dispose();
      trees.dispose();
      treeGeo.dispose();
      treeMat.dispose();
      cloudGeo.dispose();
      cloudMat.dispose();
      (scene.background as THREE.Texture).dispose();
    },
  };
}

/* ═════════════ i241 복셀 덩어리 메시 (greedy meshing + 구석 그늘) ═════════════ */

function vnoise(x: number, z: number): number {
  const h = (i: number, j: number) => {
    const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  return lerp(lerp(h(xi, zi), h(xi + 1, zi), u), lerp(h(xi, zi + 1), h(xi + 1, zi + 1), u), v);
}
const VOX_COL = [0, 0x6cc04a, 0x9a6a3a, 0x8a8f9a, 0x7a5230, 0x3f9a3a, 0xe6d29a, 0x7da84a];
const AO_CURVE = [0.42, 0.62, 0.82, 1];

function makeVoxel(): Scene3D {
  const scene = new THREE.Scene();
  scene.background = gradBg([
    [0, '#6fb8ff'],
    [1, '#d6eeff'],
  ]);
  const cam = new THREE.PerspectiveCamera(38, 1.6, 0.1, 100);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8090a0, 1.6));
  const dl = new THREE.DirectionalLight(0xfff2dc, 1.6);
  dl.position.set(5, 9, 3);
  scene.add(dl);
  const X = 22;
  const Y = 12;
  const Z = 22;
  const vox = new Uint8Array(X * Y * Z);
  const at = (x: number, y: number, z: number) => (x < 0 || y < 0 || z < 0 || x >= X || y >= Y || z >= Z ? 0 : vox[x + X * (y + Y * z)]!);
  const set = (x: number, y: number, z: number, v: number) => {
    if (x >= 0 && y >= 0 && z >= 0 && x < X && y < Y && z < Z) vox[x + X * (y + Y * z)] = v;
  };
  const gen = (off: number) => {
    vox.fill(0);
    for (let x = 0; x < X; x++)
      for (let z = 0; z < Z; z++) {
        const n = vnoise((x + off) * 0.13, z * 0.13) * 0.7 + vnoise((x + off) * 0.31, z * 0.31) * 0.3;
        const hh = Math.max(1, Math.round(1 + n * 8));
        for (let y = 0; y < hh; y++) set(x, y, z, y === hh - 1 ? (hh <= 2 ? 6 : 1) : y > hh - 3 ? 2 : 3);
      }
    // 나무 (같은 자리는 같은 나무가 되게 세계 좌표로)
    for (let x = 2; x < X - 2; x++)
      for (let z = 2; z < Z - 2; z++) {
        const s = Math.sin((x + off) * 12.9898 + z * 78.233) * 43758.5453;
        if (s - Math.floor(s) > 0.975) {
          let top = 0;
          while (top < Y && at(x, top, z)) top++;
          if (top < 3 || top > Y - 5) continue;
          for (let k = 0; k < 3; k++) set(x, top + k, z, 4);
          for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = 2; dy <= 3; dy++) if (!at(x + dx, top + dy, z + dz)) set(x + dx, top + dy, z + dz, 5);
          set(x, top + 4, z, 5);
        }
      }
  };
  const geo = new THREE.BufferGeometry();
  const lineGeo = new THREE.BufferGeometry();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0x102040, transparent: true, opacity: 0.55 }));
  const root = new THREE.Group();
  root.add(mesh, lines);
  root.position.set(-X / 2, -3, -Z / 2);
  scene.add(root);
  let greedy = true;
  let aoOn = true;
  let faces = 0;
  let quads = 0;
  const col = new THREE.Color();
  const mesher = () => {
    const P: number[] = [];
    const C: number[] = [];
    const N: number[] = [];
    const I: number[] = [];
    const L: number[] = [];
    const dims = [X, Y, Z];
    faces = 0;
    quads = 0;
    for (let d = 0; d < 3; d++) {
      const u = (d + 1) % 3;
      const v = (d + 2) % 3;
      const du = dims[u]!;
      const dv = dims[v]!;
      const mask = new Int32Array(du * dv);
      for (const side of [1, -1]) {
        const x = [0, 0, 0];
        for (x[d] = 0; x[d]! < dims[d]!; x[d]!++) {
          let n = 0;
          for (x[v] = 0; x[v]! < dv; x[v]!++)
            for (x[u] = 0; x[u]! < du; x[u]!++) {
              const a = at(x[0]!, x[1]!, x[2]!);
              const q = [x[0]!, x[1]!, x[2]!];
              q[d]! += side;
              const b = at(q[0]!, q[1]!, q[2]!);
              let key = 0;
              if (a && !b) {
                faces++;
                let ci = a;
                if (a === 1 && d !== 1) ci = 7;
                if (a === 1 && d === 1 && side < 0) ci = 2;
                let ao = 0;
                if (aoOn) {
                  const s = (du2: number, dv2: number) => {
                    const p = [q[0]!, q[1]!, q[2]!];
                    p[u]! += du2;
                    p[v]! += dv2;
                    return at(p[0]!, p[1]!, p[2]!) ? 1 : 0;
                  };
                  const corner = (cu: number, cv: number) => {
                    const s1 = s(cu, 0);
                    const s2 = s(0, cv);
                    const c = s(cu, cv);
                    return s1 && s2 ? 0 : 3 - (s1 + s2 + c);
                  };
                  ao = corner(-1, -1) | (corner(1, -1) << 2) | (corner(1, 1) << 4) | (corner(-1, 1) << 6);
                } else ao = 255;
                key = 1 + ci * 256 + ao;
              }
              mask[n++] = key;
            }
          // 덩어리 합치기
          n = 0;
          for (let j = 0; j < dv; j++)
            for (let i = 0; i < du; ) {
              const k = mask[n]!;
              if (!k) {
                i++;
                n++;
                continue;
              }
              let w = 1;
              let hgt = 1;
              if (greedy) {
                while (i + w < du && mask[n + w] === k) w++;
                outer: for (; j + hgt < dv; hgt++)
                  for (let kk = 0; kk < w; kk++)
                    if (mask[n + kk + hgt * du] !== k) break outer;
              }
              const base = [0, 0, 0];
              base[d] = x[d]! + (side > 0 ? 1 : 0);
              base[u] = i;
              base[v] = j;
              const corner = (cu: number, cv: number) => {
                const p = [base[0]!, base[1]!, base[2]!];
                p[u]! += cu;
                p[v]! += cv;
                return p;
              };
              const cs = [corner(0, 0), corner(w, 0), corner(w, hgt), corner(0, hgt)];
              const ao = (k - 1) & 255;
              const ci = ((k - 1) >> 8) & 255;
              const aov = [ao & 3, (ao >> 2) & 3, (ao >> 4) & 3, (ao >> 6) & 3];
              const vi = P.length / 3;
              cs.forEach((p, ix) => {
                P.push(p[0]!, p[1]!, p[2]!);
                col.set(VOX_COL[ci]!);
                const f = aoOn ? AO_CURVE[aov[ix]!]! : 1;
                C.push(col.r * f, col.g * f, col.b * f);
                const nn = [0, 0, 0];
                nn[d] = side;
                N.push(nn[0]!, nn[1]!, nn[2]!);
              });
              const flip = aov[0]! + aov[2]! < aov[1]! + aov[3]!;
              const tri = flip ? [0, 1, 3, 1, 2, 3] : [0, 1, 2, 0, 2, 3];
              if (side < 0) tri.reverse();
              for (const t of tri) I.push(vi + t);
              const eps = side * 0.004;
              for (let e = 0; e < 4; e++) {
                const p1 = cs[e]!;
                const p2 = cs[(e + 1) % 4]!;
                const o = [0, 0, 0];
                o[d] = eps;
                L.push(p1[0]! + o[0]!, p1[1]! + o[1]!, p1[2]! + o[2]!, p2[0]! + o[0]!, p2[1]! + o[1]!, p2[2]! + o[2]!);
              }
              quads++;
              for (let jj = 0; jj < hgt; jj++) for (let ii = 0; ii < w; ii++) mask[n + ii + jj * du] = 0;
              i += w;
              n += w;
            }
        }
      }
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    geo.setIndex(I);
    geo.computeBoundingSphere();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(L, 3));
    lineGeo.computeBoundingSphere();
  };
  const hud = new Hud();
  const tag = hud.add('');
  hud.at(tag, 0.03, 0.05, 0, 0);
  let lastOff = -1;
  let dirty = true;
  const refresh = () => {
    mesher();
    hud.set(tag, greedy ? `보이는 면 ${faces} → 덩어리 ${quads} (${(faces / Math.max(1, quads)).toFixed(1)}배 적게)` : `한 면씩 ${quads}개 (덩어리 안 함)`);
  };
  return {
    scene,
    camera: cam,
    update(t) {
      const off = Math.floor(t * 1.0);
      if (off !== lastOff || dirty) {
        if (off !== lastOff) gen(off);
        lastOff = off;
        dirty = false;
        refresh();
      }
      const a = 0.7 + Math.sin(t * 0.2) * 0.4;
      cam.position.set(Math.sin(a) * 30, 22, Math.cos(a) * 30);
      cam.lookAt(0, -1.5, 0);
    },
    render(r, w, h) {
      r.render(scene, cam);
      hud.draw(r, w, h);
    },
    controls: [
      { type: 'toggle', label: '덩어리 합치기 (greedy)', value: true, on: (v) => ((greedy = v), (dirty = true)) },
      { type: 'toggle', label: '구석 그늘 (AO)', value: true, on: (v) => ((aoOn = v), (dirty = true)) },
      { type: 'toggle', label: '면 테두리 보기', value: true, on: (v) => (lines.visible = v) },
    ],
    dispose() {
      geo.dispose();
      lineGeo.dispose();
      (mesh.material as THREE.Material).dispose();
      (lines.material as THREE.Material).dispose();
      hud.dispose();
      (scene.background as THREE.Texture).dispose();
    },
  };
}

/* ═════════════ i242 SDF 글자 빛 · 테 ═════════════ */

function edt(grid: Float64Array, w: number, h: number): void {
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const pass = (len: number) => {
    let k = 0;
    v[0] = 0;
    z[0] = -Infinity;
    z[1] = Infinity;
    for (let q = 1; q < len; q++) {
      let s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
      while (s <= z[k]!) {
        k--;
        s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1]! < q) k++;
      d[q] = (q - v[k]!) ** 2 + f[v[k]!]!;
    }
  };
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x]!;
    pass(h);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y]!;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x]!;
    pass(w);
    for (let x = 0; x < w; x++) grid[y * w + x] = d[x]!;
  }
}
function makeSdfTex(text: string): { sdf: THREE.DataTexture; bmp: THREE.CanvasTexture } {
  const W = 512;
  const H = 256;
  const [, g] = canvas(W, H);
  g.fillStyle = '#fff';
  g.font = `900 200px ${F}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, W / 2, H / 2 + 10);
  const px = g.getImageData(0, 0, W, H).data;
  const inG = new Float64Array(W * H);
  const outG = new Float64Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const inside = px[i * 4 + 3]! > 127;
    inG[i] = inside ? 0 : 1e20;
    outG[i] = inside ? 1e20 : 0;
  }
  edt(inG, W, H);
  edt(outG, W, H);
  const S = 4;
  const w = W / S;
  const h = H / S;
  const SPREAD = 28;
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = x * S + S / 2;
      const sy = y * S + S / 2;
      const i = sy * W + sx;
      const sd = Math.sqrt(outG[i]!) - Math.sqrt(inG[i]!);
      data[(h - 1 - y) * w + x] = Math.round(clamp(0.5 + sd / (2 * SPREAD), 0, 1) * 255);
    }
  const sdf = new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.UnsignedByteType);
  sdf.minFilter = sdf.magFilter = THREE.LinearFilter;
  sdf.needsUpdate = true;
  const [bc, bg] = canvas(w, h);
  bg.fillStyle = '#fff';
  bg.font = `900 ${200 / S}px ${F}`;
  bg.textAlign = 'center';
  bg.textBaseline = 'middle';
  bg.fillText(text, w / 2, h / 2 + 10 / S);
  const bmp = canvasTex(bc, false);
  bmp.minFilter = THREE.LinearFilter;
  bmp.generateMipmaps = false;
  return { sdf, bmp };
}

function makeSdf(): Scene3D {
  let tex = makeSdfTex('123');
  const uni = {
    tS: { value: tex.sdf as THREE.Texture },
    tB: { value: tex.bmp as THREE.Texture },
    uRes: { value: new THREE.Vector2(1, 1) },
    uZoom: { value: 1 },
    uOut: { value: 0.09 },
    uGlow: { value: 1 },
    uTime: { value: 0 },
  };
  let alive = true;
  void document.fonts?.ready.then(() => {
    if (!alive) return;
    tex.sdf.dispose();
    tex.bmp.dispose();
    tex = makeSdfTex('123');
    uni.tS.value = tex.sdf;
    uni.tB.value = tex.bmp;
  });
  const q = quad(
    /* glsl */ `
    uniform sampler2D tS, tB; uniform vec2 uRes; uniform float uZoom, uOut, uGlow, uTime;
    varying vec2 vUv;
    void main(){
      bool right = vUv.x > 0.5;
      vec2 lp = vec2(right ? (vUv.x - 0.5) * 2.0 : vUv.x * 2.0, vUv.y);
      float hasp = (uRes.x * 0.5) / uRes.y;
      vec2 p = (lp - 0.5) * vec2(hasp, 1.0);
      vec2 S = vec2(hasp * 0.92, hasp * 0.46);
      vec2 focus = vec2(0.47, 0.62);
      vec2 tuv = mix(vec2(0.5), focus, 1.0 - 1.0 / uZoom) + p / (S * uZoom);
      vec3 bg = mix(vec3(0.05, 0.06, 0.16), vec3(0.12, 0.08, 0.24), vUv.y);
      vec3 col = bg;
      float inside = step(0.0, tuv.x) * step(tuv.x, 1.0) * step(0.0, tuv.y) * step(tuv.y, 1.0);
      vec3 gold = mix(vec3(1.0, 0.55, 0.12), vec3(1.0, 0.92, 0.4), clamp(tuv.y * 1.6 - 0.3, 0.0, 1.0));
      if (!right){
        float a = texture2D(tB, tuv).a * inside;
        col = mix(col, gold, a);
      } else {
        float d = texture2D(tS, tuv).r;
        if (inside < 0.5) d = 0.0;
        float fw = max(fwidth(d) * 0.75, 1e-4);
        float fill = smoothstep(0.5 - fw, 0.5 + fw, d);
        float o = smoothstep(0.5 - uOut - fw, 0.5 - uOut + fw, d);
        float pulse = 0.75 + 0.25 * sin(uTime * 3.0);
        float glow = exp(-max(0.5 - uOut - d, 0.0) * 9.0) * uGlow * pulse * step(0.001, d);
        col = mix(col, vec3(0.3, 0.85, 1.0), clamp(glow, 0.0, 1.0) * (1.0 - o));
        col = mix(col, vec3(0.08, 0.1, 0.35), o);
        col = mix(col, gold, fill);
      }
      gl_FragColor = vec4(pow(col, vec3(1.0)), 1.0);
    }`,
    uni,
  );
  const hud = new Hud();
  const a = hud.add('보통 그림 글자 (128×64)');
  const b = hud.add('SDF 글자 (같은 128×64)', 'rgba(20,90,140,0.85)');
  hud.at(a, 0.03, 0.05, 0, 0);
  hud.at(b, 0.97, 0.05, 1, 0);
  const zl = hud.add('');
  hud.at(zl, 0.5, 0.95, 0.5, 1);
  let auto = true;
  let manual = 4;
  return {
    scene: q.scene,
    camera: q.cam,
    tone: THREE.NoToneMapping,
    update(t) {
      uni.uTime.value = t;
      const k = 0.5 - 0.5 * Math.cos(t * 0.9);
      uni.uZoom.value = auto ? 1 + 9 * k * k : manual;
      hud.set(zl, `× ${uni.uZoom.value.toFixed(1)} 확대`);
    },
    render(r, w, h) {
      uni.uRes.value.set(w, h);
      r.render(q.scene, q.cam);
      drawDivider(r, w / 2, h, w);
      hud.draw(r, w, h);
    },
    controls: [
      { type: 'toggle', label: '저절로 확대', value: true, on: (v) => (auto = v) },
      { type: 'range', label: '확대 (저절로 끄면)', min: 1, max: 12, step: 0.1, value: 4, on: (v) => (manual = v) },
      { type: 'range', label: '테 두께', min: 0, max: 0.3, step: 0.01, value: 0.09, on: (v) => (uni.uOut.value = v) },
      { type: 'range', label: '빛무리', min: 0, max: 2, step: 0.05, value: 1, on: (v) => (uni.uGlow.value = v) },
    ],
    dispose() {
      alive = false;
      q.dispose();
      tex.sdf.dispose();
      tex.bmp.dispose();
      hud.dispose();
    },
  };
}

/* ═════════════ i243 셰이더 전환 ═════════════ */

function paintScene(kind: number): THREE.CanvasTexture {
  const W = 512;
  const H = 320;
  const [c, g] = canvas(W, H);
  const r = rng(kind * 31 + 5);
  if (kind === 0) {
    const s = g.createLinearGradient(0, 0, 0, H);
    s.addColorStop(0, '#4aa8ff');
    s.addColorStop(1, '#cdeeff');
    g.fillStyle = s;
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff3a0';
    g.beginPath();
    g.arc(400, 70, 36, 0, TAU);
    g.fill();
    for (const [x, y] of [
      [90, 60],
      [250, 90],
    ]) {
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(x!, y!, 22, 0, TAU);
      g.arc(x! + 26, y! - 10, 28, 0, TAU);
      g.arc(x! + 54, y!, 20, 0, TAU);
      g.fill();
    }
    g.fillStyle = '#7fd06a';
    g.beginPath();
    g.moveTo(0, 220);
    for (let x = 0; x <= W; x += 8) g.lineTo(x, 210 - 30 * Math.sin(x * 0.012) - 12 * Math.sin(x * 0.03));
    g.lineTo(W, H);
    g.lineTo(0, H);
    g.fill();
    g.fillStyle = '#4fae4a';
    g.fillRect(0, 250, W, 70);
    g.fillStyle = '#fff1d6';
    g.fillRect(300, 170, 90, 70);
    g.fillStyle = '#e8483a';
    g.beginPath();
    g.moveTo(290, 172);
    g.lineTo(345, 128);
    g.lineTo(400, 172);
    g.fill();
    g.fillStyle = '#6a3a1a';
    g.fillRect(332, 200, 24, 40);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = ['#ff6a8a', '#ffd23f', '#fff'][i % 3]!;
      g.beginPath();
      g.arc(r() * W, 255 + r() * 60, 3, 0, TAU);
      g.fill();
    }
  } else if (kind === 1) {
    const s = g.createLinearGradient(0, 0, 0, H);
    s.addColorStop(0, '#060a24');
    s.addColorStop(1, '#2a2060');
    g.fillStyle = s;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 120; i++) {
      g.fillStyle = `rgba(255,255,255,${0.4 + r() * 0.6})`;
      g.fillRect(r() * W, r() * 180, 1.5, 1.5);
    }
    g.fillStyle = '#fff6c8';
    g.beginPath();
    g.arc(90, 70, 30, 0, TAU);
    g.fill();
    g.fillStyle = '#0a0e2c';
    g.beginPath();
    g.arc(104, 62, 28, 0, TAU);
    g.fill();
    let x = 0;
    while (x < W) {
      const bw = 40 + r() * 50;
      const bh = 90 + r() * 140;
      g.fillStyle = '#141a3a';
      g.fillRect(x, H - bh, bw - 4, bh);
      for (let wy = H - bh + 10; wy < H - 10; wy += 16)
        for (let wx = x + 6; wx < x + bw - 12; wx += 12) if (r() < 0.45) {
          g.fillStyle = r() < 0.8 ? '#ffd27a' : '#7fd8ff';
          g.fillRect(wx, wy, 6, 8);
        }
      x += bw;
    }
  } else {
    const s = g.createLinearGradient(0, 0, 0, H);
    s.addColorStop(0, '#1fb6d8');
    s.addColorStop(1, '#063a6a');
    g.fillStyle = s;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      g.fillStyle = 'rgba(180,240,255,0.08)';
      g.beginPath();
      const x0 = 60 + i * 80;
      g.moveTo(x0, 0);
      g.lineTo(x0 + 40, 0);
      g.lineTo(x0 - 30, H);
      g.lineTo(x0 - 90, H);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#e8c890';
    g.beginPath();
    g.moveTo(0, 290);
    for (let xx = 0; xx <= W; xx += 8) g.lineTo(xx, 285 - 10 * Math.sin(xx * 0.02));
    g.lineTo(W, H);
    g.lineTo(0, H);
    g.fill();
    for (const [fx, fy, col] of [
      [140, 140, '#ff8a3a'],
      [300, 200, '#ffd23f'],
      [380, 110, '#ff5a8a'],
    ] as const) {
      g.fillStyle = col;
      g.beginPath();
      g.ellipse(fx, fy, 26, 15, 0, 0, TAU);
      g.fill();
      g.beginPath();
      g.moveTo(fx - 22, fy);
      g.lineTo(fx - 42, fy - 14);
      g.lineTo(fx - 42, fy + 14);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(fx + 12, fy - 4, 5, 0, TAU);
      g.fill();
      g.fillStyle = '#111';
      g.beginPath();
      g.arc(fx + 13, fy - 4, 2.5, 0, TAU);
      g.fill();
    }
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 2;
    for (let i = 0; i < 20; i++) {
      g.beginPath();
      g.arc(r() * W, r() * 260, 2 + r() * 6, 0, TAU);
      g.stroke();
    }
    g.fillStyle = '#2f9a5a';
    for (let i = 0; i < 8; i++) {
      const sx = 20 + i * 65;
      g.beginPath();
      g.moveTo(sx, H);
      g.quadraticCurveTo(sx + 20, 230, sx + 6, 200);
      g.quadraticCurveTo(sx + 26, 240, sx + 14, H);
      g.fill();
    }
  }
  return canvasTex(c);
}

function makeTransition(): Scene3D {
  const scenes = [0, 1, 2].map(paintScene);
  const uni = {
    tA: { value: scenes[0] as THREE.Texture },
    tB: { value: scenes[1] as THREE.Texture },
    uP: { value: 0 },
    uMode: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uGlow: { value: 1 },
  };
  const q = quad(
    /* glsl */ `
    uniform sampler2D tA, tB; uniform float uP, uMode, uGlow; uniform vec2 uRes;
    varying vec2 vUv;
    ${NOISE}
    vec2 cover(vec2 uv){ float sa = uRes.x / uRes.y; if (sa > 1.6) uv.y = (uv.y - 0.5) * 1.6 / sa + 0.5; else uv.x = (uv.x - 0.5) * sa / 1.6 + 0.5; return uv; }
    void main(){
      vec2 uv = cover(vUv);
      float p = uP;
      vec3 col;
      vec3 a = texture2D(tA, uv).rgb, b = texture2D(tB, uv).rgb;
      if (uMode < 0.5){
        float n = fbm(uv * vec2(5.0, 3.2));
        float e = p * 1.3 - 0.15;
        float m = smoothstep(e - 0.01, e + 0.01, n);
        col = mix(b, a, m);
        float band = smoothstep(e - 0.08, e, n) * (1.0 - smoothstep(e, e + 0.015, n));
        col += vec3(1.0, 0.45, 0.1) * band * 2.2 * uGlow;
        col += vec3(1.0, 0.9, 0.5) * (1.0 - smoothstep(0.0, 0.02, abs(n - e))) * uGlow;
      } else if (uMode < 1.5){
        float s = sin(p * 3.14159265);
        float cells = mix(400.0, 14.0, s);
        vec2 cuv = vec2(cells * 1.6, cells);
        vec2 pu = (floor(uv * cuv) + 0.5) / cuv;
        float pick = step(hash(floor(uv * cuv) * 1.37), p * 1.2 - 0.1);
        pick = s > 0.15 ? pick : step(0.5, p);
        col = mix(texture2D(tA, pu).rgb, texture2D(tB, pu).rgb, pick);
      } else if (uMode < 2.5){
        vec2 d = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
        float ang = fract(atan(d.x, d.y) / 6.2831853 + 0.5);
        float m = smoothstep(p - 0.004, p + 0.004, ang);
        col = mix(b, a, m);
        col += vec3(1.0, 0.95, 0.7) * (1.0 - smoothstep(0.0, 0.012, abs(ang - p))) * step(0.001, p) * step(p, 0.999) * uGlow;
      } else {
        vec2 d = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
        float rr = length(d);
        float R = p * 1.05;
        float m = smoothstep(R - 0.004, R + 0.004, rr);
        col = mix(b, a, m);
        col += vec3(1.0) * (1.0 - smoothstep(0.0, 0.01, abs(rr - R))) * step(0.01, p) * step(p, 0.99) * uGlow;
      }
      gl_FragColor = vec4(col, 1.0);
      ${OUT}
    }`,
    uni,
  );
  const NAMES = ['잡음 녹기 (불탄 가장자리)', '도트 녹기 (모자이크)', '시계 방향 쓸기', '동그라미 열기'];
  const hud = new Hud();
  const tag = hud.add(NAMES[0]!);
  hud.at(tag, 0.03, 0.05, 0, 0);
  let auto = true;
  let fixedMode = 0;
  let k = 0;
  let start = 0;
  let now = 0;
  const PER = 2.9;
  const DUR = 1.5;
  return {
    scene: q.scene,
    camera: q.cam,
    tone: THREE.NoToneMapping,
    update(t) {
      now = t;
      const local = t - start;
      if (local >= PER) {
        start = t;
        k++;
      }
      const p = smooth(0, DUR, t - start);
      uni.tA.value = scenes[k % 3]!;
      uni.tB.value = scenes[(k + 1) % 3]!;
      uni.uP.value = p;
      if (p >= 1) {
        uni.tA.value = scenes[(k + 1) % 3]!;
        uni.uP.value = 0;
      }
      uni.uMode.value = auto ? k % 4 : fixedMode;
      hud.set(tag, NAMES[uni.uMode.value]!);
    },
    render(r, w, h) {
      uni.uRes.value.set(w, h);
      r.render(q.scene, q.cam);
      hud.draw(r, w, h);
    },
    controls: [
      { type: 'button', label: '다음 장면으로', on: () => ((start = now - PER), void 0) },
      { type: 'toggle', label: '방식 돌아가며', value: true, on: (v) => (auto = v) },
      { type: 'range', label: '방식 (돌아가며 끄면)', min: 0, max: 3, step: 1, value: 0, on: (v) => ((fixedMode = v), (auto = false)) },
      { type: 'range', label: '가장자리 빛', min: 0, max: 2, step: 0.1, value: 1, on: (v) => (uni.uGlow.value = v) },
    ],
    dispose() {
      q.dispose();
      for (const s of scenes) s.dispose();
      hud.dispose();
    },
  };
}

/* ═════════════ i244 뼈대 화면 반짝임 (skeleton) ═════════════ */

function makeSkeleton(box: HTMLElement): { update(t: number): void; controls: Control[]; dispose(): void } {
  const outer = document.createElement('div');
  outer.style.cssText = 'position:absolute;inset:0;overflow:hidden;container-type:size';
  const people = [
    ['하늘', 9820, '#ff6a8a'],
    ['도윤', 8710, '#ffb02e'],
    ['서아', 8150, '#3fa9ff'],
    ['지호', 7340, '#5ee08a'],
    ['유나', 6980, '#b88cff'],
  ] as const;
  const rows = people
    .map(
      ([n, s, c], i) => `<div class="row">
      <div class="sk av"></div><div class="sk l1"></div><div class="sk l2"></div><div class="sk pill"></div>
      <div class="real"><span class="rk">${i + 1}</span><span class="ava" style="background:${c}">${n[0]}</span>
        <span class="nm">${n}<small>${['🏆 연속 12일', '⭐ 새 기록', '수학 탐험가', '꾸준히 연습', '처음 왔어요'][i]}</small></span><span class="sc">${s.toLocaleString()}</span></div>
    </div>`,
    )
    .join('');
  outer.innerHTML = `<style>
    .skl{position:absolute;inset:0;font-family:${F};color:#fff;user-select:none;background:radial-gradient(circle at 30% 0%,#2a3364,#121633 70%);display:flex;align-items:center;justify-content:center}
    .skl .card{width:84%;height:86%;background:#1b2147;border-radius:4cqmin;padding:3cqmin 4cqmin;box-sizing:border-box;box-shadow:0 2cqmin 6cqmin rgba(0,0,0,.4);display:flex;flex-direction:column}
    .skl .hd{display:flex;align-items:center;gap:2cqmin;font-weight:800;font-size:5cqmin;margin-bottom:2cqmin}
    .skl .hd .st{margin-left:auto;font-size:3.4cqmin;font-weight:700;padding:.4em .9em;border-radius:99px;background:rgba(255,255,255,.1)}
    .skl .row{position:relative;flex:1;display:flex;align-items:center;gap:2.6cqmin;border-top:1px solid rgba(255,255,255,.06)}
    .skl .sk{border-radius:99px;background:#2b3260;background-image:linear-gradient(100deg,rgba(255,255,255,0) 30%,rgba(255,255,255,.16) 50%,rgba(255,255,255,0) 70%);background-size:300% 100%;background-repeat:no-repeat}
    .skl .av{width:7.5cqmin;height:7.5cqmin;flex:none}
    .skl .l1{width:24%;height:2.8cqmin}
    .skl .l2{width:14%;height:2.2cqmin;position:absolute;left:10.1cqmin;top:62%}
    .skl .l1{position:absolute;left:10.1cqmin;top:28%}
    .skl .pill{position:absolute;right:0;width:16%;height:4.4cqmin}
    .skl .real{position:absolute;inset:0;display:flex;align-items:center;gap:2.4cqmin;opacity:0;transform:translateY(1cqmin)}
    .skl .rk{width:4cqmin;text-align:center;font-weight:900;font-size:4cqmin;color:#ffd23f}
    .skl .ava{width:7.5cqmin;height:7.5cqmin;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:3.6cqmin;color:#1b2147}
    .skl .nm{display:flex;flex-direction:column;font-weight:800;font-size:3.8cqmin;line-height:1.15}
    .skl .nm small{font-size:2.6cqmin;font-weight:600;opacity:.65}
    .skl .sc{margin-left:auto;font-weight:900;font-size:4cqmin;padding:.25em .8em;border-radius:99px;background:rgba(255,210,63,.15);color:#ffd23f}
    .skl .row .sk{transition:opacity .25s}
  </style>
  <div class="skl"><div class="card"><div class="hd">🏅 이번 주 순위<span class="st">불러오는 중…</span></div>${rows}</div></div>`;
  box.appendChild(outer);
  const root = outer.querySelector('.skl') as HTMLElement;
  const sks = Array.from(root.querySelectorAll<HTMLElement>('.sk'));
  const reals = Array.from(root.querySelectorAll<HTMLElement>('.real'));
  const st = root.querySelector('.st') as HTMLElement;
  let speed = 1;
  let shimmer = true;
  let start = 0;
  let now = 0;
  const LOAD = 2.6;
  const CYCLE = 5;
  let phase = 0;
  return {
    update(t) {
      now = t;
      let l = t - start;
      if (l > CYCLE) {
        start = t;
        l = 0;
      }
      phase += (1 / 60) * speed;
      const loading = l < LOAD;
      const pos = 150 - ((phase * 0.9) % 1.4) * 150;
      for (const s of sks) {
        s.style.backgroundPosition = shimmer ? `${pos}% 0` : '-200% 0';
        s.style.opacity = loading ? '1' : '0';
      }
      reals.forEach((r, i) => {
        const k = loading ? 0 : smooth(0, 0.35, l - LOAD - i * 0.08);
        r.style.opacity = String(k);
        r.style.transform = `translateY(${(1 - k) * 1}cqmin)`;
      });
      st.textContent = loading ? '불러오는 중…' : '다 불러왔어요';
      st.style.background = loading ? 'rgba(255,255,255,.1)' : 'rgba(94,224,138,.25)';
    },
    controls: [
      { type: 'button', label: '다시 불러오기', on: () => (start = now) },
      { type: 'range', label: '반짝임 빠르기', min: 0.2, max: 3, step: 0.1, value: 1, on: (v) => (speed = v) },
      { type: 'toggle', label: '반짝임 (끄면 그냥 회색 판)', value: true, on: (v) => (shimmer = v) },
    ],
    dispose() {
      outer.remove();
    },
  };
}

/* ═════════════ 견본 목록 ═════════════ */

export const DEMOS: DemoMap = {
  i221: { kind: '3d', caption: '반투명 파랑 + 테두리 빛(프레넬) + 흐르는 주사선 · 빛 띠 + 깜박임 · 가로 찢김 — 투사기 위 홀로그램', make: () => makeHolo() },
  i222: { kind: '3d', caption: '물 셰이더가 섬 높이를 알아 물 깊이로 색 3단 + 기슭 거품 띠 · 배 뒤 V자 물거품 · 바위 둘레 고리 — 섬 · 야자수 · 등대 · 배는 명암 3단 + 외곽선', make: () => makeToonIsle() },
  i223: { kind: '3d', caption: '잎 1만여 포기를 한 번에 그리기(인스턴싱) — 바람 물결이 들판을 지나가고, 꼬마 둘레 풀은 눕는다', make: () => makeGrass() },
  i224: { kind: '3d', caption: 'three Sky (레일리 · 미 산란) + 공기 원근 산맥 — 낮 파랑 → 노을 → 땅거미 → 별 · 은하수 · 달빛 밤', make: () => makeSky() },
  i225: { kind: '3d', caption: 'fbm 잡음 문턱으로 만든 뭉게구름 두 겹 — 해 쪽 밝고 아래 그늘, 바람에 흘러감 (툰 3단도)', make: () => makeClouds() },
  i226: { kind: '3d', caption: '고른 물체만 뒷면 껍데기 테 + 빛무리가 숨 쉬듯 — 바닥 물결 고리, 2.4초마다 다음 것', make: () => makeSelect() },
  i227: { kind: '3d', caption: '막 두께가 흐르며 빛 세 파장이 간섭 → 무지갯빛 소용돌이, 위는 얇고 아래는 두꺼움 · 톡 터짐', make: () => makeBubble() },
  i228: { kind: 'dom', caption: '왼쪽 그냥 반투명 ↔ 오른쪽 backdrop-filter 흐림 + 채도 + 결 — 뒤가 움직여도 글씨가 또렷', make: (box) => makeFrost(box) },
  i229: { kind: '3d', caption: '왼쪽 UV 무늬는 늘어나고 이음새, 오른쪽 삼면 투영은 어떤 모양에도 고른 칸 (축 셋을 법선으로 섞기)', make: () => makeTriplanar() },
  i230: { kind: '3d', caption: '같은 평면 — 왼쪽 노멀 맵만 ↔ 오른쪽 시차 차폐(높이를 따라 광선 걸음) + 스스로 그림자, 벽돌이 움푹', make: () => makePom() },
  i231: { kind: '3d', caption: '벽은 평면 두 장뿐 — 창마다 광선을 방 상자에 쏴 천장 · 바닥 · 벽 · 가구를 계산, 움직이면 방 속이 보임', make: () => makeInterior() },
  i232: { kind: '3d', caption: '가까운 6그루만 진짜, 먼 숲 900그루는 8방향에서 구운 그림 판 — 보는 각도에 맞는 그림을 골라 섞음', make: () => makeImpostor() },
  i233: { kind: '2d', caption: '서기 → 걷기 → 뛰기 → 점프를 상태기가 고르고, 바뀔 때 0.3초 동안 두 자세를 섞어 끊김 없이', make: () => makeSpriteSM() },
  i234: { kind: '3d', caption: '그림 한 장 + 높이 지도 — 횃불이 움직이면 돌벽 · 방패 · 숫자 7에 입체 음영 (왼쪽은 그림만)', make: () => makeNormalSprite() },
  i235: { kind: '2d', caption: '벽 꼭짓점마다 광선 3개 → 각도 순으로 이어 보이는 다각형 — 경비원 시야 밖 보석은 어둠 속', make: () => makeVisibility() },
  i236: { kind: '2d', caption: '그림(색 번호)은 그대로, 팔레트 칸만 돌려서 폭포 · 호수 물결 · 햇빛 반짝이 흐름 (아래 띠가 도는 색)', make: () => makeCycle() },
  i237: { kind: '3d', caption: '3D 장면을 낮은 해상도로 그려 밝기 → 8×8 Bayer 문턱으로 흑백 점 (오브라 딘 느낌) · 4색 모드', make: () => makeDither() },
  i238: { kind: '3d', caption: '칸마다 밝기를 글자 사다리(. : = + # @)로, 밝기 경계는 기울기 방향 따라 / \\ | - 로', make: () => makeAscii() },
  i239: { kind: '3d', caption: '1/4 ~ 1/5 해상도로 그려 크게 늘림 — 깊이 차이로 1px 어두운 외곽선, 법선 차이로 모서리 밝힘', make: () => makePixel3D() },
  i240: { kind: '3d', caption: '면마다 한 색 · 평면 음영의 낮은 다각형 행성 — 끄면 매끈해져 차이가 보임, 쪼개기 단계 조절', make: () => makeLowPoly() },
  i241: { kind: '3d', caption: '보이는 면만 골라 같은 색 · 같은 그늘끼리 큰 네모로 합침 + 꼭짓점 구석 그늘 — 테두리 선이 합친 덩어리', make: () => makeVoxel() },
  i242: { kind: '3d', caption: '같은 128×64 크기 — 왼쪽 그림 글자는 확대하면 뭉개지고, 오른쪽 거리장(SDF)은 매끈 + 테 + 빛무리', make: () => makeSdf() },
  i243: { kind: '3d', caption: '두 장면을 셰이더 하나로 갈아 끼우기 — 잡음 녹기(불탄 테) · 도트 녹기 · 시계 쓸기 · 동그라미 열기', make: () => makeTransition() },
  i244: { kind: 'dom', caption: '불러오는 동안 회색 판 위로 빛 띠가 쓱 — 다 오면 줄마다 차례로 나타남 (5초마다 다시)', make: (box) => makeSkeleton(box) },
};

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SavePass } from 'three/examples/jsm/postprocessing/SavePass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { AfterimagePass } from 'three/examples/jsm/postprocessing/AfterimagePass.js';
import { LUTPass } from 'three/examples/jsm/postprocessing/LUTPass.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';
import { RenderPixelatedPass } from 'three/examples/jsm/postprocessing/RenderPixelatedPass.js';
import type { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';
import { RGBShiftShader } from 'three/examples/jsm/shaders/RGBShiftShader.js';
import { HorizontalBlurShader } from 'three/examples/jsm/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/examples/jsm/shaders/VerticalBlurShader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { DemoMap } from './types';

/**
 * 「빛 · 환경 / 후처리」 견본 — 환경 반사 · 조명 · 안개 · 그림자 · 톤 매핑 · 2D 빛 지도 · 후처리 사슬 · 아이디어 기술들.
 * 비교가 어울리면 화면을 반(또는 셋)으로 나눠 「기술 없음 ↔ 있음」을 나란히, 후처리는 SavePass 로 원본을 남겨 두고 마지막에 왼쪽 반만 원본으로 바꾼다.
 * 글씨는 화면 위 HUD(정사영 스프라이트)로 — 갤러리가 3D 캔버스를 그대로 복사하므로 3D 안에서 그린다.
 */

type R = THREE.WebGLRenderer;
const FONT = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
const V3 = (x = 0, y = 0, z = 0): THREE.Vector3 => new THREE.Vector3(x, y, z);
const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

/* ───────────── 공통 도구 ───────────── */

function std(color: number, roughness = 0.5, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
}
function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}
/** 세로 그러데이션 배경 */
function gradTex(top: string, bottom: string, mid?: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, top);
  if (mid) gr.addColorStop(0.55, mid);
  gr.addColorStop(1, bottom);
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function disposeTree(...roots: (THREE.Object3D | null | undefined)[]): void {
  for (const root of roots) {
    if (!root) continue;
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = (m as { material?: THREE.Material | THREE.Material[] }).material;
      const list = Array.isArray(mat) ? mat : mat ? [mat] : [];
      for (const x of list) {
        for (const v of Object.values(x as unknown as Record<string, unknown>)) if (v && (v as THREE.Texture).isTexture && !(v as THREE.Texture).isRenderTargetTexture) (v as THREE.Texture).dispose();
        x.dispose();
      }
    });
    const s = root as THREE.Scene;
    if (s.isScene && s.background && (s.background as THREE.Texture).isTexture) (s.background as THREE.Texture).dispose();
  }
}
/** 공(반지름 radius)이 화면 가로 · 세로 모두에 들어오게 카메라 거리 맞추기 */
function fit(cam: THREE.PerspectiveCamera, aspect: number, target: THREE.Vector3, radius: number, dir: THREE.Vector3): THREE.PerspectiveCamera {
  cam.aspect = aspect;
  cam.updateProjectionMatrix();
  const v = THREE.MathUtils.degToRad(cam.fov) / 2;
  const hf = Math.atan(Math.tan(v) * aspect);
  const d = radius / Math.sin(Math.min(v, hf));
  cam.position.copy(target).addScaledVector(dir.clone().normalize(), d);
  cam.lookAt(target);
  return cam;
}
interface Panel {
  scene: THREE.Scene;
  tone?: THREE.ToneMapping;
  exposure?: number;
}
/** 화면을 세로 칸 n 개로 나눠 장면마다 그린다 (같은 카메라 틀) */
function panels(r: R, w: number, h: number, list: Panel[], frame: (aspect: number) => THREE.Camera): void {
  const n = list.length;
  const tm = r.toneMapping;
  const ex = r.toneMappingExposure;
  r.setScissorTest(true);
  list.forEach((p, i) => {
    const x0 = Math.round((i * w) / n);
    const x1 = Math.round(((i + 1) * w) / n);
    const cam = frame((x1 - x0) / h);
    r.setViewport(x0, 0, x1 - x0, h);
    r.setScissor(x0, 0, x1 - x0, h);
    if (p.tone !== undefined) r.toneMapping = p.tone;
    if (p.exposure !== undefined) r.toneMappingExposure = p.exposure;
    r.render(p.scene, cam);
    r.toneMapping = tm;
    r.toneMappingExposure = ex;
  });
  r.setScissorTest(false);
  r.setViewport(0, 0, w, h);
}
/** 그림자를 켜고 그리기 — 다른 카드와 나눠 쓰는 renderer 라 끝나면 되돌린다 */
function withShadows(r: R, fn: () => void): void {
  const en = r.shadowMap.enabled;
  const ty = r.shadowMap.type;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFShadowMap;
  fn();
  r.shadowMap.enabled = en;
  r.shadowMap.type = ty;
}

/* ───────────── HUD 글씨 ───────────── */

const STY = {
  tag: ['rgba(14,20,44,0.78)', '#ffffff'],
  on: ['#ffd23f', '#1d2340'],
  off: ['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.75)'],
  blue: ['#3b82f6', '#ffffff'],
  pop: ['', '#ffe14a'],
} as const;
type Sty = keyof typeof STY;
const LW = 512;
const LH = 80;
class Label {
  readonly canvas = document.createElement('canvas');
  readonly tex: THREE.CanvasTexture;
  readonly spr: THREE.Sprite;
  aspect = 1;
  text = '';
  sty: Sty = 'tag';
  visible = true;
  constructor(
    text: string,
    public fx: number,
    public fy: number,
    public ax: number,
    public ay: number,
    public size: number,
    sty: Sty,
  ) {
    this.canvas.width = LW;
    this.canvas.height = LH;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, depthTest: false, depthWrite: false, toneMapped: false, transparent: true }));
    this.spr.center.set(ax, ay);
    this.set(text, sty, true);
  }
  set(text: string, sty: Sty = this.sty, force = false): void {
    if (!force && text === this.text && sty === this.sty) return;
    this.text = text;
    this.sty = sty;
    const g = this.canvas.getContext('2d')!;
    g.clearRect(0, 0, LW, LH);
    const pop = sty === 'pop';
    const fs = pop ? 64 : 42;
    g.font = `${pop ? 900 : 700} ${fs}px ${pop ? '"Black Han Sans", ' : ''}${FONT}`;
    const tw = Math.min(LW - 40, g.measureText(text).width);
    const used = Math.min(LW, Math.ceil(tw + (pop ? 24 : 40)));
    const x0 = (LW - used) / 2;
    const [bg, fg] = STY[sty];
    if (bg) {
      g.fillStyle = bg;
      g.beginPath();
      g.roundRect(x0 + 2, 6, used - 4, LH - 12, 30);
      g.fill();
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (pop) {
      g.lineWidth = 10;
      g.strokeStyle = '#2a1640';
      g.strokeText(text, LW / 2, LH / 2 + 3, LW - 30);
    }
    g.fillStyle = fg;
    g.fillText(text, LW / 2, LH / 2 + 2, LW - 40);
    this.tex.repeat.set(used / LW, 1);
    this.tex.offset.set(x0 / LW, 0);
    this.tex.needsUpdate = true;
    this.aspect = used / LH;
  }
}
class Hud {
  readonly scene = new THREE.Scene();
  readonly cam = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10);
  readonly labels: Label[] = [];
  readonly lines: { m: THREE.Mesh; fx: number }[] = [];
  private lineGeo = new THREE.PlaneGeometry(1, 1);
  private lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, depthTest: false, transparent: true, opacity: 0.9 });
  constructor() {
    document.fonts?.ready.then(() => {
      for (const l of this.labels) l.set(l.text, l.sty, true);
    });
  }
  /** fx · fy = 화면 비율 자리 (왼쪽 아래 0,0), ax · ay = 글씨 상자의 기준점 */
  label(text: string, fx: number, fy: number, ax = 0.5, ay = 0.5, sty: Sty = 'tag', size = 1): Label {
    const l = new Label(text, fx, fy, ax, ay, size, sty);
    this.labels.push(l);
    this.scene.add(l.spr);
    return l;
  }
  vline(fx: number): void {
    const m = new THREE.Mesh(this.lineGeo, this.lineMat);
    this.lines.push({ m, fx });
    this.scene.add(m);
  }
  draw(r: R, w: number, h: number): void {
    this.cam.right = w;
    this.cam.top = h;
    this.cam.updateProjectionMatrix();
    const px = Math.max(18, Math.min(46, h * 0.11));
    for (const l of this.labels) {
      l.spr.visible = l.visible;
      const s = px * l.size;
      l.spr.scale.set(s * l.aspect, s, 1);
      l.spr.position.set(l.fx * w, l.fy * h, 0);
    }
    for (const { m, fx } of this.lines) {
      m.scale.set(Math.max(2, Math.round(h / 260)), h, 1);
      m.position.set(Math.round(fx * w), h / 2, 0);
    }
    const ac = r.autoClear;
    r.autoClear = false;
    r.setViewport(0, 0, w, h);
    r.render(this.scene, this.cam);
    r.autoClear = ac;
  }
  dispose(): void {
    for (const l of this.labels) {
      l.tex.dispose();
      l.spr.material.dispose();
    }
    this.lineGeo.dispose();
    this.lineMat.dispose();
  }
}

/* ───────────── 후처리 도구 ───────────── */

/** composer 는 renderer 마다 따로 — r 이 바뀌면 다시 짓고, 크기가 바뀌면 setSize */
function postKit<P extends { comp: EffectComposer }>(build: (r: R) => P) {
  let cur: (P & { r: R; w: number; h: number }) | null = null;
  const kill = (): void => {
    if (!cur) return;
    for (const p of cur.comp.passes) p.dispose();
    cur.comp.dispose();
    cur = null;
  };
  return {
    get(r: R, w: number, h: number): P {
      if (!cur || cur.r !== r) {
        kill();
        cur = Object.assign(build(r), { r, w: 0, h: 0 });
      }
      if (cur.w !== w || cur.h !== h) {
        cur.comp.setSize(w, h);
        cur.w = w;
        cur.h = h;
      }
      return cur;
    },
    dispose: kill,
  };
}
/** 왼쪽은 원본(tRaw), 오른쪽은 효과 결과 */
function splitPass(raw: THREE.Texture): ShaderPass {
  return new ShaderPass(
    new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tRaw: { value: raw }, split: { value: 0.5 } },
      vertexShader: VERT,
      fragmentShader:
        'uniform sampler2D tDiffuse; uniform sampler2D tRaw; uniform float split; varying vec2 vUv; void main(){ gl_FragColor = vUv.x < split ? texture2D(tRaw, vUv) : texture2D(tDiffuse, vUv); }',
    }),
  );
}
/** 그리기 → (원본 저장) → 효과들 → 반반 → 출력 */
function splitChain(r: R, scene: THREE.Scene, cam: THREE.Camera, effects: Pass[]): EffectComposer {
  const comp = new EffectComposer(r);
  comp.setPixelRatio(1);
  comp.addPass(new RenderPass(scene, cam));
  const save = new SavePass();
  comp.addPass(save);
  for (const e of effects) comp.addPass(e);
  comp.addPass(splitPass(save.renderTarget.texture));
  comp.addPass(new OutputPass());
  return comp;
}

/* ───────────── 소품 ───────────── */

/** 동글 캐릭터 (발이 y=0) */
function cutie(color: number, belly = 0xfff6e6): THREE.Group {
  const g = new THREE.Group();
  const body = mesh(new THREE.SphereGeometry(0.5, 32, 24), std(color, 0.55), 0, 0.48, 0);
  body.scale.set(1, 0.94, 0.95);
  const bel = mesh(new THREE.SphereGeometry(0.3, 24, 16), std(belly, 0.6), 0, 0.36, 0.3);
  bel.scale.set(1, 0.9, 0.6);
  const eyeM = std(0x1b1b2a, 0.3);
  const hiM = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const cheekM = std(0xff8fa8, 0.7);
  const earM = std(color, 0.55);
  g.add(body, bel);
  for (const s of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(0.065, 16, 12), eyeM, s * 0.16, 0.6, 0.42);
    const hi = mesh(new THREE.SphereGeometry(0.022, 8, 6), hiM, s * 0.16 + 0.02, 0.625, 0.48);
    const ch = mesh(new THREE.SphereGeometry(0.07, 12, 8), cheekM, s * 0.29, 0.5, 0.36);
    ch.scale.set(1, 0.6, 0.4);
    const ear = mesh(new THREE.SphereGeometry(0.14, 16, 12), earM, s * 0.3, 0.92, 0);
    ear.scale.set(1, 1.2, 0.7);
    const foot = mesh(new THREE.SphereGeometry(0.14, 16, 10), earM, s * 0.2, 0.05, 0.12);
    foot.scale.set(1, 0.5, 1.3);
    g.add(eye, hi, ch, ear, foot);
  }
  g.traverse((o) => {
    o.castShadow = true;
  });
  return g;
}
function starGeo(r1 = 0.5, r2 = 0.24, depth = 0.22): THREE.BufferGeometry {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r2 : r1;
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 3 });
  geo.center();
  return geo;
}
function basicLights(scene: THREE.Scene, hemi = 0.9, sun = 1.6, at = V3(-3, 5, 4)): THREE.DirectionalLight {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x7a8aa0, hemi));
  const s = new THREE.DirectionalLight(0xfff0d6, sun);
  s.position.copy(at);
  scene.add(s);
  return s;
}

/* ───────────── 하늘 셰이더 (u13) ───────────── */

const SKY_V = 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const SKY_F = `uniform vec3 top; uniform vec3 bot; uniform vec3 sun; uniform vec3 sunDir; uniform float sunK; varying vec3 vP;
void main(){
  vec3 p = normalize(vP);
  vec3 c = mix(bot, top, smoothstep(-0.4, 0.9, p.y));
  float s = max(dot(p, normalize(sunDir)), 0.0);
  c += sun * (pow(s, 60.0) * sunK + pow(s, 5.0) * 0.45);
  float a = atan(p.z, p.x);
  c += top * 0.18 * smoothstep(0.55, 1.0, sin(a * 7.0 + p.y * 3.0) * 0.5 + 0.5) * smoothstep(-0.1, 0.5, p.y);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
interface Mood {
  name: string;
  top: [number, number, number];
  bot: [number, number, number];
  sun: [number, number, number];
  k: number;
}
const MOODS: Mood[] = [
  { name: '금빛 동굴', top: [0.95, 0.62, 0.25], bot: [0.07, 0.035, 0.02], sun: [1.0, 0.72, 0.35], k: 5 },
  { name: '밤 보라', top: [0.32, 0.14, 0.62], bot: [0.02, 0.015, 0.07], sun: [0.95, 0.5, 1.0], k: 4 },
  { name: '얼음 하늘', top: [0.45, 0.8, 1.0], bot: [0.9, 0.97, 1.0], sun: [1.0, 1.0, 1.0], k: 4 },
];
function skyMat(m: Mood): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(...m.top) },
      bot: { value: new THREE.Color(...m.bot) },
      sun: { value: new THREE.Color(...m.sun) },
      sunDir: { value: V3(-0.6, 0.45, -0.7) },
      sunK: { value: m.k },
    },
    vertexShader: SKY_V,
    fragmentShader: SKY_F,
  });
}

/* ───────────── HDR 파노라마 (i16) ───────────── */

function hash3(x: number, y: number, z: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h & 0xffff) / 65535;
}
function vnoise(x: number, y: number, z: number): number {
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
  const c = (i: number, j: number, k: number): number => hash3(xi + i, yi + j, zi + k);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
function fbm(x: number, y: number, z: number, oct = 4): number {
  let s = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x * f, y * f, z * f);
    f *= 2.03;
    a *= 0.5;
  }
  return s / (1 - Math.pow(0.5, oct));
}
type Pano = 'day' | 'sunset';
const PANO_W = 1024;
const PANO_H = 512;
const panoCache = new Map<Pano, Uint16Array>();
function panoData(kind: Pano): Uint16Array {
  const hit = panoCache.get(kind);
  if (hit) return hit;
  const day = kind === 'day';
  const out = new Uint16Array(PANO_W * PANO_H * 4);
  const sAz = day ? 0.7 : 2.4;
  const sEl = day ? 0.7 : 0.07;
  const sd = [Math.cos(sEl) * Math.cos(sAz), Math.sin(sEl), Math.cos(sEl) * Math.sin(sAz)];
  const zen = day ? [0.12, 0.32, 0.95] : [0.08, 0.06, 0.3];
  const hor = day ? [0.8, 0.92, 1.1] : [1.7, 0.62, 0.25];
  const sunC = day ? [1.0, 0.96, 0.88] : [1.0, 0.55, 0.22];
  const cos1 = Math.cos(THREE.MathUtils.degToRad(day ? 1.8 : 2.6));
  const mtnOf = new Float32Array(PANO_W);
  for (let x = 0; x < PANO_W; x++) {
    const az = ((x + 0.5) / PANO_W - 0.5) * Math.PI * 2;
    mtnOf[x] = 0.02 + 0.08 * fbm(Math.cos(az) * 2.2 + 7, Math.sin(az) * 2.2, 1.3, 4);
  }
  for (let y = 0; y < PANO_H; y++) {
    const el = ((y + 0.5) / PANO_H - 0.5) * Math.PI;
    const ce = Math.cos(el);
    const se = Math.sin(el);
    for (let x = 0; x < PANO_W; x++) {
      const az = ((x + 0.5) / PANO_W - 0.5) * Math.PI * 2;
      const dx = ce * Math.cos(az);
      const dz = ce * Math.sin(az);
      const dy = se;
      let r: number;
      let g: number;
      let b: number;
      const cs = dx * sd[0]! + dy * sd[1]! + dz * sd[2]!;
      const mtn = mtnOf[x]!;
      if (el >= 0) {
        const k = Math.pow(1 - se, 4);
        r = zen[0]! + (hor[0]! - zen[0]!) * k;
        g = zen[1]! + (hor[1]! - zen[1]!) * k;
        b = zen[2]! + (hor[2]! - zen[2]!) * k;
        const cl = el > 0.02 ? fbm(dx * 3 + 11, dy * 6, dz * 3, 4) : 0;
        const cloud = Math.max(0, Math.min(1, (cl - 0.52) / 0.18)) * Math.min(1, el / 0.12);
        const cc = day ? [1.5, 1.5, 1.55] : [1.3, 0.55, 0.5];
        const sh = 0.75 + 0.35 * (1 - cl);
        r += (cc[0]! * sh - r) * cloud * 0.9;
        g += (cc[1]! * sh - g) * cloud * 0.9;
        b += (cc[2]! * sh - b) * cloud * 0.9;
        if (el < mtn) {
          const n = 0.85 + 0.25 * vnoise(dx * 40, dy * 40, dz * 40);
          const mc = day ? [0.22, 0.36, 0.42] : [0.12, 0.05, 0.14];
          r = mc[0]! * n;
          g = mc[1]! * n;
          b = mc[2]! * n;
        }
      } else {
        if (day) {
          const n = 0.75 + 0.4 * fbm(dx * 14, dy * 14, dz * 14, 3);
          r = 0.16 * n;
          g = 0.32 * n;
          b = 0.07 * n;
        } else {
          const n = fbm(dx * 30, dy * 6, dz * 30, 3);
          r = 0.03;
          g = 0.06;
          b = 0.16;
          let da = Math.abs(az - sAz);
          if (da > Math.PI) da = Math.PI * 2 - da;
          const streak = Math.exp(-da * da * 60) * Math.max(0, n - 0.35) * 6 * Math.exp(el * 3);
          r += 1.0 * streak;
          g += 0.5 * streak;
          b += 0.2 * streak;
        }
        const hz = Math.exp(el * 18);
        r += (hor[0]! * 0.6 - r) * hz * 0.6;
        g += (hor[1]! * 0.6 - g) * hz * 0.6;
        b += (hor[2]! * 0.6 - b) * hz * 0.6;
      }
      // 해 — HDR 이라 아주 밝다
      if (cs > cos1) {
        r = sunC[0]! * 60;
        g = sunC[1]! * 60;
        b = sunC[2]! * 60;
      } else if (cs > 0) {
        const glow = Math.pow(cs, 400) * 6 + Math.pow(cs, 24) * 0.6;
        r += sunC[0]! * glow;
        g += sunC[1]! * glow;
        b += sunC[2]! * glow;
      }
      const o = (y * PANO_W + x) * 4;
      out[o] = THREE.DataUtils.toHalfFloat(r);
      out[o + 1] = THREE.DataUtils.toHalfFloat(g);
      out[o + 2] = THREE.DataUtils.toHalfFloat(b);
      out[o + 3] = THREE.DataUtils.toHalfFloat(1);
    }
  }
  panoCache.set(kind, out);
  return out;
}
function panoTex(kind: Pano): THREE.DataTexture {
  const t = new THREE.DataTexture(panoData(kind), PANO_W, PANO_H, THREE.RGBAFormat, THREE.HalfFloatType);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.LinearSRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/* ───────────── 색 보정 표 (i07) ───────────── */

function makeLut(fn: (r: number, g: number, b: number) => [number, number, number], N = 24): THREE.Data3DTexture {
  const d = new Uint8Array(N * N * N * 4);
  for (let b = 0; b < N; b++)
    for (let g = 0; g < N; g++)
      for (let r = 0; r < N; r++) {
        const [R, G, B] = fn(r / (N - 1), g / (N - 1), b / (N - 1));
        const o = (r + g * N + b * N * N) * 4;
        d[o] = Math.round(Math.max(0, Math.min(1, R)) * 255);
        d[o + 1] = Math.round(Math.max(0, Math.min(1, G)) * 255);
        d[o + 2] = Math.round(Math.max(0, Math.min(1, B)) * 255);
        d[o + 3] = 255;
      }
  const t = new THREE.Data3DTexture(d, N, N, N);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}
const sCurve = (x: number, k = 0.6): number => x + k * (x - 0.5) * (1 - Math.abs(2 * x - 1)) * 0.5 * 2 * 0.5;
const LUTS: { name: string; fn: (r: number, g: number, b: number) => [number, number, number] }[] = [
  {
    name: '노을',
    fn: (r, g, b) => [sCurve(r * 1.08 + 0.07), sCurve(g * 0.9 + 0.03), sCurve(b * 0.7 + 0.02)],
  },
  {
    name: '밤',
    fn: (r, g, b) => {
      const l = 0.3 * r + 0.55 * g + 0.15 * b;
      return [l * 0.3 + r * 0.12, l * 0.48 + g * 0.2 + 0.02, l * 0.75 + b * 0.32 + 0.07];
    },
  },
  {
    name: '옛날 필름',
    fn: (r, g, b) => {
      const l = 0.3 * r + 0.59 * g + 0.11 * b;
      const m = (c: number): number => 0.08 + 0.86 * (c * 0.55 + l * 0.45);
      return [m(r) * 1.06, m(g) * 1.0, m(b) * 0.82];
    },
  },
];

/* ───────────── 2D 빛 (u19) ───────────── */

const RW = 560;
const RH = 420;
function paintRoom(g: CanvasRenderingContext2D): void {
  const wall = g.createLinearGradient(0, 0, 0, RH);
  wall.addColorStop(0, '#7fb7ff');
  wall.addColorStop(1, '#b9d8ff');
  g.fillStyle = wall;
  g.fillRect(0, 0, RW, RH);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  for (let y = 20; y < 320; y += 36) for (let x = (y / 36) % 2 ? 18 : 36; x < RW; x += 36) g.fillRect(x, y, 6, 6);
  // 바닥
  g.fillStyle = '#c98a4b';
  g.fillRect(0, 320, RW, 100);
  g.strokeStyle = '#a86c33';
  g.lineWidth = 3;
  for (let x = 0; x < RW; x += 70) {
    g.beginPath();
    g.moveTo(x, 320);
    g.lineTo(x - 30, RH);
    g.stroke();
  }
  // 창문
  g.fillStyle = '#ffffff';
  g.fillRect(48, 60, 120, 100);
  g.fillStyle = '#2b3f8f';
  g.fillRect(56, 68, 104, 84);
  g.fillStyle = '#fff3a0';
  g.beginPath();
  g.arc(128, 96, 16, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.fillRect(105, 60, 6, 100);
  // 선반과 책
  g.fillStyle = '#8a5a2b';
  g.fillRect(230, 150, 160, 12);
  const books = ['#ff5d73', '#ffd23f', '#3ec46d', '#4aa3ff', '#b06cff', '#ff9f43'];
  books.forEach((c, i) => {
    g.fillStyle = c;
    g.fillRect(240 + i * 22, 100 + (i % 2) * 8, 18, 50 - (i % 2) * 8);
  });
  // 문
  g.fillStyle = '#e07a3f';
  g.fillRect(450, 150, 80, 170);
  g.fillStyle = '#ffd23f';
  g.beginPath();
  g.arc(515, 240, 7, 0, Math.PI * 2);
  g.fill();
  // 숫자 블록
  const blocks: [number, number, string, string][] = [
    [70, 250, '#ff5d73', '7'],
    [150, 270, '#3ec46d', '3'],
    [300, 260, '#ffb02e', '4'],
  ];
  for (const [x, y, c, d] of blocks) {
    g.fillStyle = c;
    g.beginPath();
    g.roundRect(x, y, 66, 66, 10);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.font = `900 44px "Black Han Sans", ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(d, x + 33, y + 36);
  }
  // 고양이
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.ellipse(400, 310, 34, 26, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(400, 272, 22, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(382, 262);
  g.lineTo(386, 240);
  g.lineTo(396, 256);
  g.moveTo(418, 262);
  g.lineTo(414, 240);
  g.lineTo(404, 256);
  g.fill();
  g.fillStyle = '#222';
  g.beginPath();
  g.arc(392, 272, 3, 0, Math.PI * 2);
  g.arc(408, 272, 3, 0, Math.PI * 2);
  g.fill();
  // 천장 등
  g.strokeStyle = '#333';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(380, 0);
  g.lineTo(380, 60);
  g.stroke();
  g.fillStyle = '#ffe066';
  g.beginPath();
  g.moveTo(356, 82);
  g.lineTo(404, 82);
  g.lineTo(392, 60);
  g.lineTo(368, 60);
  g.fill();
}

/* ───────────── 견본 ───────────── */

export const DEMOS: DemoMap = {
  /* ── u12 환경 반사 RoomEnvironment ── */
  u12: {
    kind: '3d',
    caption: '왼쪽 조명만 · 오른쪽 RoomEnvironment 반사 — 금속 · 유리에 스튜디오 빛이 비쳐 반짝여요',
    make() {
      const build = (): { scene: THREE.Scene; root: THREE.Group; items: THREE.Mesh[] } => {
        const scene = new THREE.Scene();
        scene.background = gradTex('#25346e', '#0b1026');
        basicLights(scene, 0.5, 1.3, V3(3, 5, 4));
        const root = new THREE.Group();
        const chrome = mesh(new THREE.SphereGeometry(0.5, 48, 32), std(0xffffff, 0.05, 1), -0.62, 0.55, 0);
        const gold = mesh(new THREE.TorusKnotGeometry(0.3, 0.1, 120, 16), std(0xffc94a, 0.2, 1), 0.66, 0.58, 0);
        const gem = mesh(
          new THREE.IcosahedronGeometry(0.44, 0),
          new THREE.MeshPhysicalMaterial({ color: 0x7fe6ff, roughness: 0.02, clearcoat: 1, transparent: true, opacity: 0.6, flatShading: true }),
          -0.62,
          -0.55,
          0,
        );
        const dice = mesh(
          new RoundedBoxGeometry(0.72, 0.72, 0.72, 4, 0.13),
          new THREE.MeshPhysicalMaterial({ color: 0xe8453c, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.04 }),
          0.66,
          -0.55,
          0,
        );
        root.add(chrome, gold, gem, dice);
        scene.add(root);
        return { scene, root, items: [chrome, gold, gem, dice] };
      };
      const A = build();
      const B = build();
      const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
      const hud = new Hud();
      hud.vline(0.5);
      hud.label('조명만', 0.25, 0.95, 0.5, 1);
      hud.label('환경 반사', 0.75, 0.95, 0.5, 1, 'on');
      let env: { r: R; tex: THREE.Texture } | null = null;
      let k = 1;
      return {
        scene: A.scene,
        camera: cam,
        update(t) {
          for (const S of [A, B])
            S.items.forEach((m, i) => {
              m.rotation.y = t * (0.5 + i * 0.12);
              m.rotation.x = Math.sin(t * 0.7 + i) * 0.5;
            });
        },
        render(r, w, h) {
          if (!env || env.r !== r) {
            env?.tex.dispose();
            const pm = new THREE.PMREMGenerator(r);
            const room = new RoomEnvironment();
            env = { r, tex: pm.fromScene(room, 0.04).texture };
            room.dispose();
            pm.dispose();
            B.scene.environment = env.tex;
            B.scene.environmentIntensity = k;
          }
          panels(r, w, h, [{ scene: A.scene }, { scene: B.scene }], (a) => fit(cam, a, V3(0, 0, 0), 1.45, V3(0, 0.12, 1)));
          hud.draw(r, w, h);
        },
        controls: [
          {
            type: 'range',
            label: '반사 세기',
            min: 0,
            max: 2,
            step: 0.05,
            value: 1,
            on: (v) => {
              k = v;
              B.scene.environmentIntensity = v;
            },
          },
        ],
        dispose() {
          env?.tex.dispose();
          hud.dispose();
          disposeTree(A.scene, B.scene);
        },
      };
    },
  },

  /* ── u13 셰이더 하늘 환경 ── */
  u13: {
    kind: '3d',
    caption: '셰이더로 그린 하늘(금빛 동굴 → 밤 보라 → 얼음 하늘)을 구워 반사 지도로 — 금화 · 수정 빛깔이 하늘 따라 바뀌어요',
    make() {
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 0.25));
      const key = new THREE.DirectionalLight(0xffffff, 0.6);
      key.position.set(2, 4, 3);
      scene.add(key);
      const sky = new THREE.Mesh(new THREE.SphereGeometry(30, 48, 24), skyMat(MOODS[0]!));
      scene.add(sky);
      const root = new THREE.Group();
      const coinM = std(0xffc24a, 0.22, 1);
      const coinG = new THREE.CylinderGeometry(0.36, 0.36, 0.09, 40);
      for (let i = 0; i < 6; i++) {
        const c = mesh(coinG, coinM, -0.75 + Math.sin(i * 2.1) * 0.04, -0.6 + i * 0.095, Math.cos(i * 1.7) * 0.04);
        root.add(c);
      }
      const ball = mesh(new THREE.SphereGeometry(0.42, 48, 32), std(0xffffff, 0.04, 1), 0.72, 0.35, -0.1);
      const crystal = mesh(
        new THREE.OctahedronGeometry(0.42, 0),
        new THREE.MeshPhysicalMaterial({ color: 0xcdf3ff, roughness: 0.04, metalness: 0.25, clearcoat: 1, flatShading: true }),
        0,
        0.2,
        0.35,
      );
      crystal.scale.set(0.8, 1.5, 0.8);
      const ring = mesh(new THREE.TorusGeometry(0.32, 0.09, 24, 64), std(0xffffff, 0.15, 1), 0.6, -0.5, 0.3);
      root.add(ball, crystal, ring);
      scene.add(root);
      const cam = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
      const hud = new Hud();
      const name = hud.label(MOODS[0]!.name, 0.04, 0.95, 0, 1, 'on');
      hud.label('하늘 셰이더 → 반사 지도', 0.5, 0.05, 0.5, 0, 'tag', 0.85);
      let envs: { r: R; tex: THREE.Texture[] } | null = null;
      let shift = 0;
      let t0 = 0;
      let mood = -1;
      const apply = (i: number): void => {
        const m = MOODS[i]!;
        const u = sky.material.uniforms;
        (u['top']!.value as THREE.Color).setRGB(...m.top);
        (u['bot']!.value as THREE.Color).setRGB(...m.bot);
        (u['sun']!.value as THREE.Color).setRGB(...m.sun);
        u['sunK']!.value = m.k;
        name.set(m.name);
        if (envs) scene.environment = envs.tex[i]!;
      };
      let now = 0;
      return {
        scene,
        camera: cam,
        update(t) {
          now = t;
          const i = (Math.floor((t - t0) / 3.5) + shift) % MOODS.length;
          if (i !== mood) {
            mood = i;
            apply(i);
          }
          root.rotation.y = t * 0.35;
          crystal.rotation.y = -t * 0.8;
          ring.rotation.x = t * 0.9;
        },
        render(r, w, h) {
          if (!envs || envs.r !== r) {
            envs?.tex.forEach((x) => x.dispose());
            const pm = new THREE.PMREMGenerator(r);
            const geo = new THREE.SphereGeometry(10, 48, 24);
            const tex = MOODS.map((m) => {
              const es = new THREE.Scene();
              const mat = skyMat(m);
              es.add(new THREE.Mesh(geo, mat));
              const tx = pm.fromScene(es, 0.02).texture;
              mat.dispose();
              return tx;
            });
            geo.dispose();
            pm.dispose();
            envs = { r, tex };
            scene.environment = tex[Math.max(0, mood)]!;
          }
          const a = Math.sin(now * 0.25) * 0.5;
          fit(cam, w / h, V3(0, 0, 0), 1.75, V3(Math.sin(a), 0.25, Math.cos(a)));
          r.render(scene, cam);
          hud.draw(r, w, h);
        },
        controls: [
          {
            type: 'button',
            label: '다음 하늘',
            on: () => {
              shift += 1;
            },
          },
          { type: 'range', label: '반사 세기', min: 0, max: 2.5, step: 0.05, value: 1, on: (v) => (scene.environmentIntensity = v) },
        ],
        dispose() {
          envs?.tex.forEach((x) => x.dispose());
          hud.dispose();
          disposeTree(scene);
        },
      };
    },
  },

  /* ── u14 3점 조명 ── */
  u14: {
    kind: '3d',
    caption: '반구 빛만 → 해(주광)를 더하면 입체 → 뒤에서 테두리 빛을 더하면 윤곽이 반짝 떠올라요',
    make() {
      const build = (n: number): { scene: THREE.Scene; ch: THREE.Group } => {
        const scene = new THREE.Scene();
        scene.background = gradTex('#1f2b5a', '#0c1230');
        scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x5a4630, n === 0 ? 1.4 : 0.9));
        if (n >= 1) {
          const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
          sun.position.set(-2.2, 3, 2.5);
          scene.add(sun);
        }
        if (n >= 2) {
          const rim = new THREE.DirectionalLight(0x9fe0ff, 7);
          rim.position.set(2.6, 1.2, -3.5);
          const rim2 = new THREE.DirectionalLight(0xffd0f0, 4);
          rim2.position.set(-2.6, 1.0, -3.5);
          scene.add(rim2);
          scene.add(rim);
        }
        const ch = cutie(0xffa94d);
        const base = mesh(new THREE.CylinderGeometry(0.85, 0.9, 0.12, 48), std(0xdde6f5, 0.7), 0, -0.06, 0);
        scene.add(ch, base);
        return { scene, ch };
      };
      const S = [build(0), build(1), build(2)];
      const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
      const hud = new Hud();
      hud.vline(1 / 3);
      hud.vline(2 / 3);
      ['반구', '+ 해', '+ 테두리'].forEach((s, i) => hud.label(s, (i + 0.5) / 3, 0.95, 0.5, 1, i === 2 ? 'on' : 'tag'));
      return {
        scene: S[0]!.scene,
        camera: cam,
        update(t) {
          for (const s of S) {
            s.ch.rotation.y = Math.sin(t * 0.6) * 0.8;
            s.ch.position.y = Math.abs(Math.sin(t * 2)) * 0.06;
          }
        },
        render(r, w, h) {
          panels(r, w, h, S.map((s) => ({ scene: s.scene })), (a) => fit(cam, a, V3(0, 0.5, 0), 0.82, V3(0, 0.25, 1)));
          hud.draw(r, w, h);
        },
        dispose() {
          hud.dispose();
          disposeTree(...S.map((s) => s.scene));
        },
      };
    },
  },

  /* ── u15 스포트라이트 · 움직이는 점광 ── */
  u15: {
    kind: '3d',
    caption: '탁자 위를 훑는 원뿔 스포트라이트 · 일렁이는 촛불 점광 · 가끔 번쩍!',
    make() {
      const scene = new THREE.Scene();
      scene.background = gradTex('#141a3a', '#06070f');
      scene.add(new THREE.HemisphereLight(0x8090c0, 0x201810, 0.35));
      const table = mesh(new THREE.BoxGeometry(4.4, 0.2, 2.8), std(0x8a5530, 0.75), 0, -0.1, 0);
      table.receiveShadow = true;
      scene.add(table);
      const items = new THREE.Group();
      const coinM = std(0xffc24a, 0.35, 0.35);
      const coinG = new THREE.CylinderGeometry(0.22, 0.22, 0.06, 32);
      for (let i = 0; i < 9; i++) {
        const c = mesh(coinG, coinM, 0.9 + (i % 3) * 0.32 - 0.3, 0.03 + Math.floor(i / 3) * 0.062, 0.4 - (i % 2) * 0.2);
        items.add(c);
      }
      const diceM = std(0xfaf7f0, 0.35);
      const pipM = std(0x222233, 0.4);
      for (const [x, z, ry] of [
        [-0.4, 0.3, 0.4],
        [0.2, -0.5, -0.3],
      ] as const) {
        const d = mesh(new RoundedBoxGeometry(0.42, 0.42, 0.42, 3, 0.07), diceM, x, 0.21, z);
        d.rotation.y = ry;
        for (const [px, pz] of [
          [-0.1, -0.1],
          [0.1, 0.1],
          [0, 0],
          [0.1, -0.1],
          [-0.1, 0.1],
        ] as const)
          d.add(mesh(new THREE.SphereGeometry(0.035, 10, 8), pipM, px, 0.21, pz));
        items.add(d);
      }
      const ball = mesh(new THREE.SphereGeometry(0.28, 32, 24), std(0x4aa3ff, 0.35), -1.2, 0.28, -0.4);
      items.add(ball);
      // 촛불
      const candle = mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.55, 24), std(0xfff4dc, 0.6), -1.6, 0.275, 0.7);
      const flame = mesh(new THREE.ConeGeometry(0.06, 0.18, 16), new THREE.MeshBasicMaterial({ color: 0xffc060 }), -1.6, 0.66, 0.7);
      items.add(candle, flame);
      items.traverse((o) => {
        o.castShadow = true;
        o.receiveShadow = true;
      });
      scene.add(items);
      const candleL = new THREE.PointLight(0xff9a40, 2, 4.5, 1.6);
      candleL.position.set(-1.6, 0.85, 0.7);
      scene.add(candleL);
      const spot = new THREE.SpotLight(0xfff3d0, 45, 12, 0.32, 0.45, 1.4);
      spot.position.set(0, 4, 0.6);
      spot.castShadow = true;
      spot.shadow.mapSize.set(512, 512);
      spot.shadow.bias = -0.0005;
      scene.add(spot, spot.target);
      // 보이는 원뿔
      const len = 4.4;
      const coneGeo = new THREE.ConeGeometry(Math.tan(0.32) * len, len, 40, 1, true);
      coneGeo.translate(0, -len / 2, 0);
      coneGeo.rotateX(-Math.PI / 2);
      const coneM = new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const cone = new THREE.Mesh(coneGeo, coneM);
      cone.position.copy(spot.position);
      scene.add(cone);
      const flash = new THREE.PointLight(0xe8f0ff, 0, 10, 1.2);
      flash.position.set(0.5, 2.2, 1.5);
      scene.add(flash);
      const cam = new THREE.PerspectiveCamera(36, 1, 0.1, 50);
      const hud = new Hud();
      hud.label('원뿔 빛 · 촛불 · 번쩍', 0.04, 0.95, 0, 1);
      const pop = hud.label('번쩍!', 0.5, 0.62, 0.5, 0.5, 'pop', 1.6);
      let flicker = true;
      let ang = 0.32;
      return {
        scene,
        camera: cam,
        update(t) {
          spot.target.position.set(Math.sin(t * 0.8) * 1.5, 0, Math.cos(t * 0.55) * 0.7);
          spot.angle = ang;
          cone.lookAt(spot.target.position);
          const ck = spot.position.distanceTo(spot.target.position) / len;
          const cr = (ck * Math.tan(ang)) / Math.tan(0.32);
          cone.scale.set(cr, cr, ck);
          const f = flicker ? 0.75 + 0.25 * Math.sin(t * 13) * Math.sin(t * 7.3 + 1) + 0.1 * Math.sin(t * 29) : 1;
          candleL.intensity = 2.2 * f;
          flame.scale.set(1, 0.8 + f * 0.35, 1);
          flame.rotation.z = Math.sin(t * 9) * 0.12;
          const ph = t % 5;
          const fl = ph > 4 ? Math.exp(-(ph - 4) * 7) : 0;
          flash.intensity = 60 * fl;
          pop.visible = fl > 0.25;
          ball.position.x = -1.2 + Math.sin(t * 0.9) * 0.3;
        },
        render(r, w, h) {
          fit(cam, w / h, V3(0, 0.1, 0.1), 2.35, V3(0, 1.05, 1.25));
          withShadows(r, () => r.render(scene, cam));
          hud.draw(r, w, h);
        },
        controls: [
          { type: 'range', label: '원뿔 넓이', min: 0.12, max: 0.7, step: 0.01, value: 0.32, on: (v) => (ang = v) },
          { type: 'toggle', label: '촛불 일렁임', value: true, on: (v) => (flicker = v) },
        ],
        dispose() {
          hud.dispose();
          disposeTree(scene);
          spot.shadow.map?.dispose();
        },
      };
    },
  },

  /* ── u16 안개 ── */
  u16: {
    kind: '3d',
    caption: '왼쪽 안개 없음 · 오른쪽 안개 — 멀리 있는 쌓기나무 탑일수록 하늘색에 묻혀 깊이가 느껴져요',
    make() {
      const SKY = 0xbfe4ff;
      const build = (fog: boolean): THREE.Scene => {
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(SKY);
        if (fog) scene.fog = new THREE.Fog(SKY, 3, 30);
        basicLights(scene, 1.0, 1.4, V3(-3, 6, 2));
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), std(0x9fd77a, 0.95));
        ground.rotation.x = -Math.PI / 2;
        scene.add(ground);
        const cols = [0xff6b6b, 0xffd23f, 0x4aa3ff, 0x3ec46d, 0xb06cff, 0xff9f43];
        const pts: [number, number, number, number][] = [];
        for (let i = 0; i < 22; i++)
          for (const s of [-1, 1]) {
            const hgt = 1 + Math.floor(hash3(i, s + 3, 7) * 4);
            const x = s * (2.2 + hash3(i, s, 1) * 1.2);
            const z = 2 - i * 3.2;
            for (let k = 0; k < hgt; k++) pts.push([x, k + 0.5, z, cols[(i + k + (s > 0 ? 2 : 0)) % cols.length]!]);
          }
        const im = new THREE.InstancedMesh(new RoundedBoxGeometry(0.96, 0.96, 0.96, 2, 0.08), std(0xffffff, 0.6), pts.length);
        const m4 = new THREE.Matrix4();
        const c = new THREE.Color();
        pts.forEach(([x, y, z, col], i) => {
          m4.makeTranslation(x, y, z);
          im.setMatrixAt(i, m4);
          im.setColorAt(i, c.setHex(col));
        });
        scene.add(im);
        return scene;
      };
      const A = build(false);
      const B = build(true);
      const cam = new THREE.PerspectiveCamera(52, 1, 0.1, 300);
      const hud = new Hud();
      hud.vline(0.5);
      hud.label('안개 없음', 0.25, 0.95, 0.5, 1);
      hud.label('안개', 0.75, 0.95, 0.5, 1, 'on');
      let now = 0;
      return {
        scene: A,
        camera: cam,
        update(t) {
          now = t;
        },
        render(r, w, h) {
          panels(r, w, h, [{ scene: A }, { scene: B }], (a) => {
            cam.aspect = a;
            cam.updateProjectionMatrix();
            cam.position.set(Math.sin(now * 0.4) * 0.9, 1.7 + Math.sin(now * 0.3) * 0.2, 6 - (now * 0.8) % 3.2);
            cam.lookAt(cam.position.x * 0.3, 1.3, cam.position.z - 10);
            return cam;
          });
          hud.draw(r, w, h);
        },
        controls: [
          {
            type: 'range',
            label: '안개 끝 거리',
            min: 8,
            max: 80,
            step: 1,
            value: 30,
            on: (v) => {
              (B.fog as THREE.Fog).far = v;
            },
          },
        ],
        dispose() {
          hud.dispose();
          disposeTree(A, B);
        },
      };
    },
  },

  /* ── u17 그림자 맵 ── */
  u17: {
    kind: '3d',
    caption: '그림자 없음 · 또렷한 그림자(만화풍) · 부드러운 그림자 — 해가 돌면 그림자도 따라 돌아요',
    make() {
      const build = (mode: 0 | 1 | 2): { scene: THREE.Scene; sun: THREE.DirectionalLight; ch: THREE.Group } => {
        const scene = new THREE.Scene();
        scene.background = gradTex('#9fd3ff', '#e8f5ff');
        scene.add(new THREE.HemisphereLight(0xffffff, 0x9a8a70, 0.9));
        const sun = new THREE.DirectionalLight(0xfff0d6, 2.2);
        sun.castShadow = mode > 0;
        sun.shadow.mapSize.set(mode === 1 ? 1024 : 512, mode === 1 ? 1024 : 512);
        sun.shadow.radius = mode === 1 ? 1 : 10;
        sun.shadow.bias = -0.0008;
        sun.shadow.normalBias = 0.02;
        Object.assign(sun.shadow.camera, { left: -2.2, right: 2.2, top: 2.2, bottom: -2.2, near: 0.5, far: 14 });
        scene.add(sun, sun.target);
        const ground = new THREE.Mesh(new THREE.CircleGeometry(2.2, 48), std(0xf3ead8, 0.9));
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);
        const ch = cutie(0x6fd3c7);
        ch.scale.setScalar(1.1);
        scene.add(ch);
        const cube = mesh(new RoundedBoxGeometry(0.5, 0.5, 0.5, 2, 0.06), std(0xff6b6b, 0.5), 1.05, 0.25, -0.35);
        const cube2 = mesh(new RoundedBoxGeometry(0.5, 0.5, 0.5, 2, 0.06), std(0xffd23f, 0.5), 1.05, 0.75, -0.35);
        const ball = mesh(new THREE.SphereGeometry(0.3, 32, 20), std(0x4aa3ff, 0.4), -1.0, 0.3, 0.3);
        for (const m of [cube, cube2, ball]) m.castShadow = true;
        scene.add(cube, cube2, ball);
        return { scene, sun, ch };
      };
      const S = [build(0), build(1), build(2)];
      const cam = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
      const hud = new Hud();
      hud.vline(1 / 3);
      hud.vline(2 / 3);
      ['없음', '또렷하게', '부드럽게'].forEach((s, i) => hud.label(s, (i + 0.5) / 3, 0.95, 0.5, 1, i ? 'on' : 'tag'));
      let soft = 10;
      return {
        scene: S[0]!.scene,
        camera: cam,
        update(t) {
          const a = t * 0.5;
          for (const s of S) {
            s.sun.position.set(Math.cos(a) * 3, 4, Math.sin(a) * 3);
            s.ch.rotation.y = Math.sin(t * 0.7) * 0.6;
          }
          S[2]!.sun.shadow.radius = soft;
        },
        render(r, w, h) {
          withShadows(r, () => panels(r, w, h, S.map((s) => ({ scene: s.scene })), (a) => fit(cam, a, V3(0, 0.35, 0), 1.75, V3(0, 1.1, 1.3))));
          hud.draw(r, w, h);
        },
        controls: [{ type: 'range', label: '부드러움 (반지름)', min: 1, max: 20, step: 0.5, value: 10, on: (v) => (soft = v) }],
        dispose() {
          hud.dispose();
          for (const s of S) s.sun.shadow.map?.dispose();
          disposeTree(...S.map((s) => s.scene));
        },
      };
    },
  },

  /* ── u18 톤 매핑 ── */
  u18: {
    kind: '3d',
    caption: '같은 밝은 장면을 톤 매핑 없음 · Neutral · ACES 로 — 없음은 하얗게 날아가고, ACES 는 영화처럼 진해요',
    make() {
      const build = (): { scene: THREE.Scene; root: THREE.Group } => {
        const scene = new THREE.Scene();
        scene.background = gradTex('#2a3a78', '#0e1430');
        scene.add(new THREE.HemisphereLight(0xffffff, 0x404060, 1.2));
        const sun = new THREE.DirectionalLight(0xfff2dc, 5.5);
        sun.position.set(-2, 4, 3);
        scene.add(sun);
        const root = new THREE.Group();
        const cols = [0xff3b3b, 0xffd23f, 0x2ad1ff, 0x3ee07a];
        cols.forEach((c, i) => {
          const a = (i / cols.length) * Math.PI * 2;
          root.add(mesh(new THREE.SphereGeometry(0.3, 32, 20), std(c, 0.35), Math.cos(a) * 0.75, 0.1, Math.sin(a) * 0.75));
        });
        const lamp = mesh(
          new THREE.SphereGeometry(0.28, 32, 20),
          new THREE.MeshStandardMaterial({ color: 0xffe9a0, emissive: 0xffc040, emissiveIntensity: 5 }),
          0,
          0.62,
          0,
        );
        const cube = mesh(new RoundedBoxGeometry(0.45, 0.45, 0.45, 2, 0.06), std(0xffffff, 0.4), 0, -0.25, 0);
        root.add(lamp, cube);
        const pl = new THREE.PointLight(0xffc040, 6, 4, 1.5);
        pl.position.set(0, 0.62, 0);
        root.add(pl);
        scene.add(root);
        return { scene, root };
      };
      const S = [build(), build(), build()];
      const tones = [THREE.NoToneMapping, THREE.NeutralToneMapping, THREE.ACESFilmicToneMapping];
      const cam = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
      const hud = new Hud();
      hud.vline(1 / 3);
      hud.vline(2 / 3);
      ['없음', 'Neutral', 'ACES'].forEach((s, i) => hud.label(s, (i + 0.5) / 3, 0.95, 0.5, 1, i ? 'on' : 'tag'));
      let exposure = 1;
      return {
        scene: S[0]!.scene,
        camera: cam,
        update(t) {
          for (const s of S) s.root.rotation.y = t * 0.5;
        },
        render(r, w, h) {
          panels(r, w, h, S.map((s, i) => ({ scene: s.scene, tone: tones[i]!, exposure })), (a) => fit(cam, a, V3(0, 0.15, 0), 1.15, V3(0, 0.6, 1)));
          hud.draw(r, w, h);
        },
        controls: [{ type: 'range', label: '노출 (밝기)', min: 0.2, max: 3, step: 0.05, value: 1, on: (v) => (exposure = v) }],
        dispose() {
          hud.dispose();
          disposeTree(...S.map((s) => s.scene));
        },
      };
    },
  },

  /* ── u19 2D 조명 흉내 ── */
  u19: {
    kind: '2d',
    caption: '그림 × 빛 지도 = 결과 — 어두운 바탕 빛에 손전등 · 전등 빛을 더한 지도를 그림에 곱해요 (SEVEN 방식)',
    make() {
      const room = document.createElement('canvas');
      room.width = RW;
      room.height = RH;
      let painted = false;
      const light = document.createElement('canvas');
      light.width = RW / 2;
      light.height = RH / 2;
      const out = document.createElement('canvas');
      out.width = RW;
      out.height = RH;
      let on = true;
      let amb = 0.18;
      const coverRect = (x: number, y: number, w: number, h: number): [number, number, number, number] => {
        const s = Math.max(w / RW, h / RH);
        const dw = RW * s;
        const dh = RH * s;
        return [x + (w - dw) / 2, y + (h - dh) / 2, dw, dh];
      };
      const tag = (g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number): void => {
        g.font = `700 ${size}px ${FONT}`;
        const tw = g.measureText(s).width;
        g.fillStyle = 'rgba(14,20,44,0.8)';
        g.beginPath();
        g.roundRect(x - tw / 2 - size * 0.5, y - size * 0.75, tw + size, size * 1.5, size * 0.75);
        g.fill();
        g.fillStyle = '#fff';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(s, x, y + 1);
      };
      return {
        draw(g, w, h, t) {
          if (!painted) {
            paintRoom(room.getContext('2d')!);
            painted = true;
            document.fonts?.ready.then(() => paintRoom(room.getContext('2d')!));
          }
          // 빛 지도
          const l = light.getContext('2d')!;
          const lw = light.width;
          const lh = light.height;
          const s = lw / RW;
          l.globalCompositeOperation = 'source-over';
          const a = Math.round(amb * 255);
          l.fillStyle = `rgb(${a},${Math.round(a * 1.1)},${Math.min(255, Math.round(a * 1.9))})`;
          l.fillRect(0, 0, lw, lh);
          l.globalCompositeOperation = 'lighter';
          const spot = (x: number, y: number, rad: number, c: [number, number, number], k: number): void => {
            const gr = l.createRadialGradient(x * s, y * s, 0, x * s, y * s, rad * s);
            for (let i = 0; i <= 6; i++) {
              const q = i / 6;
              const v = Math.pow(1 - q, 1.6) * k;
              gr.addColorStop(q, `rgb(${Math.round(c[0] * v)},${Math.round(c[1] * v)},${Math.round(c[2] * v)})`);
            }
            l.fillStyle = gr;
            l.beginPath();
            l.arc(x * s, y * s, rad * s, 0, Math.PI * 2);
            l.fill();
          };
          const fx = RW / 2 + Math.sin(t * 0.7) * 200;
          const fy = 250 + Math.sin(t * 1.3) * 80;
          spot(fx, fy, 125, [255, 250, 230], 1.1);
          const fl = 0.85 + 0.15 * Math.sin(t * 11) * Math.sin(t * 5.3);
          spot(380, 95, 170, [255, 210, 120], fl);
          spot(103, 283, 70, [255, 120, 150], 0.55 + 0.25 * Math.sin(t * 2));
          // 결과
          const o = out.getContext('2d')!;
          o.globalCompositeOperation = 'source-over';
          o.drawImage(room, 0, 0);
          if (on) {
            o.globalCompositeOperation = 'multiply';
            o.drawImage(light, 0, 0, RW, RH);
            o.globalCompositeOperation = 'source-over';
          }
          // 배치
          g.fillStyle = '#0c1230';
          g.fillRect(0, 0, w, h);
          const fsz = Math.max(10, Math.min(18, h * 0.065));
          if (w >= h * 1.15) {
            const pad = Math.max(4, h * 0.025);
            const cw = Math.min(w * 0.3, (h - pad * 3) / 2 / 0.75);
            const th = cw * 0.75;
            const y1 = (h - th * 2 - pad) / 2;
            g.drawImage(room, pad, y1, cw, th);
            g.drawImage(light, pad, y1 + th + pad, cw, th);
            tag(g, '그림', pad + cw / 2, y1 + fsz, fsz * 0.9);
            tag(g, '빛 지도', pad + cw / 2, y1 + th + pad + fsz, fsz * 0.9);
            g.fillStyle = '#ffd23f';
            g.font = `900 ${fsz * 1.6}px ${FONT}`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText('×', pad + cw / 2, y1 + th + pad / 2);
            const rx = pad * 2 + cw + fsz * 1.4;
            g.fillText('=', pad + cw + (rx - pad - cw) / 2, h / 2);
            g.save();
            g.beginPath();
            g.rect(rx, 0, w - rx, h);
            g.clip();
            const [dx, dy, dw, dh] = coverRect(rx, 0, w - rx, h);
            g.drawImage(out, dx, dy, dw, dh);
            g.restore();
            tag(g, on ? '결과 (곱하기)' : '빛 끔', rx + (w - rx) / 2, h - fsz * 1.2, fsz);
          } else {
            const pad = Math.max(4, w * 0.02);
            const tw = (w - pad * 3) / 2;
            const th = Math.min(h * 0.3, tw * 0.75);
            const tw2 = th / 0.75;
            const x1 = (w - tw2 * 2 - pad) / 2;
            g.drawImage(room, x1, pad, tw2, th);
            g.drawImage(light, x1 + tw2 + pad, pad, tw2, th);
            tag(g, '그림', x1 + tw2 / 2, pad + fsz, fsz * 0.9);
            tag(g, '빛 지도', x1 + tw2 * 1.5 + pad, pad + fsz, fsz * 0.9);
            const ry = pad * 2 + th;
            g.save();
            g.beginPath();
            g.rect(0, ry, w, h - ry);
            g.clip();
            const [dx, dy, dw, dh] = coverRect(0, ry, w, h - ry);
            g.drawImage(out, dx, dy, dw, dh);
            g.restore();
            tag(g, on ? '결과 (곱하기)' : '빛 끔', w / 2, h - fsz * 1.2, fsz);
          }
        },
        controls: [
          { type: 'toggle', label: '빛 지도 곱하기', value: true, on: (v) => (on = v) },
          { type: 'range', label: '바탕 빛 (어둠 정도)', min: 0, max: 0.8, step: 0.02, value: 0.18, on: (v) => (amb = v) },
        ],
      };
    },
  },

  /* ── u20 빛 번짐 ── */
  u20: {
    kind: '3d',
    caption: '왼쪽 끔 · 오른쪽 UnrealBloom — 문턱보다 밝은 네온 · 전구만 빛이 번져요',
    make() {
      const scene = new THREE.Scene();
      scene.background = gradTex('#141a40', '#04050c');
      basicLights(scene, 0.35, 0.9, V3(2, 4, 3));
      const root = new THREE.Group();
      const neon = (c: number, k = 4): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.055, 16, 96), neon(0xff4fa8));
      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.04, 16, 96), neon(0x38e1ff));
      root.add(ring, ring2);
      const balls: THREE.Mesh[] = [];
      [0xffd23f, 0x3ee07a, 0x38e1ff, 0xff7a3a].forEach((c, i) => {
        const b = mesh(new THREE.SphereGeometry(0.17, 24, 16), neon(c, 3.5), 0, 0, 0);
        balls.push(b);
        root.add(b);
        void i;
      });
      const plain = mesh(new RoundedBoxGeometry(0.55, 0.55, 0.55, 3, 0.08), std(0xdfe6ff, 0.5), 0, 0, 0);
      root.add(plain);
      const floor = mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.06, 64), std(0x22284a, 0.8), 0, -1.35, 0);
      scene.add(root, floor);
      const cam = new THREE.PerspectiveCamera(36, 1, 0.1, 50);
      let strength = 0.8;
      let threshold = 1.4;
      const kit = postKit((r) => {
        const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), strength, 0.4, threshold);
        return { comp: splitChain(r, scene, cam, [bloom]), bloom };
      });
      const hud = new Hud();
      hud.vline(0.5);
      hud.label('끔', 0.25, 0.95, 0.5, 1);
      hud.label('빛 번짐', 0.75, 0.95, 0.5, 1, 'on');
      let dt = 0.016;
      return {
        scene,
        camera: cam,
        update(t, d) {
          dt = d;
          ring.rotation.set(Math.sin(t * 0.5) * 0.4, t * 0.6, 0);
          ring2.rotation.set(t * 0.7, 0, Math.sin(t * 0.4) * 0.5);
          balls.forEach((b, i) => {
            const a = t * 1.2 + (i * Math.PI) / 2;
            b.position.set(Math.cos(a) * 0.75, Math.sin(a * 1.3) * 0.25, Math.sin(a) * 0.75);
          });
          plain.rotation.set(t * 0.4, t * 0.6, 0);
        },
        render(r, w, h) {
          fit(cam, w / h, V3(0, -0.15, 0), 1.6, V3(0, 0.3, 1));
          const k = kit.get(r, w, h);
          k.bloom.strength = strength;
          k.bloom.threshold = threshold;
          k.comp.render(dt);
          hud.draw(r, w, h);
        },
        controls: [
          { type: 'range', label: '번짐 세기', min: 0, max: 3, step: 0.05, value: 0.8, on: (v) => (strength = v) },
          { type: 'range', label: '문턱 (이보다 밝으면 번짐)', min: 0, max: 4, step: 0.05, value: 1.4, on: (v) => (threshold = v) },
        ],
        dispose() {
          kit.dispose();
          hud.dispose();
          disposeTree(scene);
        },
      };
    },
  },

  /* ── u21 후처리 사슬 ── */
  u21: {
    kind: '3d',
    caption: '그리기 → 빛 번짐 → 색 보정 → 출력(sRGB) — 단계가 하나씩 켜지며 화면이 손질돼요 (출력 전엔 선형 색이라 어둡게)',
    make() {
      const scene = new THREE.Scene();
      scene.background = gradTex('#5b7bd8', '#1a2350');
      basicLights(scene, 0.8, 1.8, V3(-2, 4, 3));
      const ch = cutie(0xff8fb1);
      const base = mesh(new THREE.CylinderGeometry(1.2, 1.25, 0.15, 48), std(0x9fd77a, 0.8), 0, -0.075, 0);
      const stars: THREE.Mesh[] = [];
      const sg = starGeo(0.12, 0.055, 0.05);
      const sm = new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xffc020, emissiveIntensity: 2.2 });
      for (let i = 0; i < 5; i++) {
        const s = new THREE.Mesh(sg, sm);
        stars.push(s);
        scene.add(s);
      }
      scene.add(ch, base);
      const cam = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
      const GRADE = new THREE.ShaderMaterial({
        uniforms: { tDiffuse: { value: null } },
        vertexShader: VERT,
        fragmentShader:
          'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); c.rgb *= vec3(1.12, 1.0, 0.86); float l = dot(c.rgb, vec3(0.3,0.59,0.11)); c.rgb = mix(vec3(l), c.rgb, 1.25); float v = smoothstep(0.85, 0.3, length(vUv - 0.5)); c.rgb *= mix(0.35, 1.0, v); gl_FragColor = c; }',
      });
      const kit = postKit((r) => {
        const comp = new EffectComposer(r);
        comp.setPixelRatio(1);
        comp.addPass(new RenderPass(scene, cam));
        const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.35, 1.1);
        const grade = new ShaderPass(GRADE.clone());
        const output = new OutputPass();
        const copy = new ShaderPass(CopyShader);
        comp.addPass(bloom);
        comp.addPass(grade);
        comp.addPass(output);
        comp.addPass(copy);
        return { comp, bloom, grade, output, copy };
      });
      const hud = new Hud();
      const names = ['① 그리기', '② 빛 번짐', '③ 색 보정', '④ 출력'];
      const steps = names.map((s, i) => hud.label(s, (i + 0.5) / 4, 0.04, 0.5, 0, 'off', 0.85));
      const what = hud.label('', 0.5, 0.96, 0.5, 1, 'tag');
      const notes = ['장면만 그린 선형 색 — 어둡고 칙칙', '밝은 별 · 볼이 빛나요', '따뜻한 색 · 가장자리 어둡게', 'sRGB 로 바꿔 화면에 알맞게'];
      let stage = -1;
      let manual = -1;
      let dt = 0.016;
      return {
        scene,
        camera: cam,
        update(t, d) {
          dt = d;
          const st = manual >= 0 ? manual : Math.floor(t / 1.8) % 4;
          if (st !== stage) {
            stage = st;
            steps.forEach((l, i) => l.set(names[i]!, i <= st ? (i === st ? 'on' : 'blue') : 'off'));
            what.set(notes[st]!);
          }
          ch.rotation.y = Math.sin(t * 0.8) * 0.7;
          ch.position.y = Math.abs(Math.sin(t * 2.2)) * 0.1;
          stars.forEach((s, i) => {
            const a = t * 0.8 + (i / 5) * Math.PI * 2;
            s.position.set(Math.cos(a) * 1.05, 1.15 + Math.sin(a * 2) * 0.12, Math.sin(a) * 0.8 - 0.2);
            s.rotation.y = t * 2 + i;
          });
        },
        render(r, w, h) {
          fit(cam, w / h, V3(0, 0.5, 0), 1.55, V3(0, 0.35, 1));
          const k = kit.get(r, w, h);
          k.bloom.enabled = stage >= 1;
          k.grade.enabled = stage >= 2;
          k.output.enabled = stage >= 3;
          k.copy.enabled = stage < 3;
          k.comp.render(dt);
          hud.draw(r, w, h);
        },
        controls: [{ type: 'range', label: '단계 고정 (0 = 자동)', min: 0, max: 4, step: 1, value: 0, on: (v) => (manual = v - 1) }],
        dispose() {
          kit.dispose();
          GRADE.dispose();
          hud.dispose();
          disposeTree(scene);
        },
      };
    },
  },

  /* ── i01 피사계 심도 ── */
  i01: {
    kind: '3d',
    caption: '왼쪽 모두 또렷 · 오른쪽 Bokeh — 가운데 공에 초점, 앞뒤 관중은 흐릿해져 주인공이 도드라져요',
    make() {
      const scene = new THREE.Scene();
      scene.background = gradTex('#1b2a6a', '#0a1030');
      basicLights(scene, 0.9, 1.8, V3(2, 5, 4));
      const field = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), std(0x3f9f4f, 0.9));
      field.rotation.x = -Math.PI / 2;
      scene.add(field);
      // 주인공 공
      const ball = new THREE.Group();
      ball.add(mesh(new THREE.SphereGeometry(0.42, 40, 28), std(0xfdfbf5, 0.45)));
      const stitchM = std(0xe23a3a, 0.5);
      for (const s of [-1, 1]) {
        const st = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 8, 48), stitchM);
        st.position.x = s * 0.24;
        st.scale.setScalar(1.12);
        st.rotation.y = Math.PI / 2;
        ball.add(st);
      }
      ball.position.set(0, 0.7, 0);
      scene.add(ball);
      // 관중 (뒤) · 앞 소품
      const capG = new THREE.CapsuleGeometry(0.16, 0.3, 4, 12);
      const headG = new THREE.SphereGeometry(0.13, 16, 12);
      const skin = std(0xffd9b3, 0.6);
      const cols = [0xff6b6b, 0xffd23f, 0x4aa3ff, 0x3ec46d, 0xb06cff, 0xff9f43, 0xffffff];
      const crowd = new THREE.Group();
      let n = 0;
      for (let row = 0; row < 4; row++)
        for (let i = -7; i <= 7; i++) {
          const x = i * 0.55 + (row % 2) * 0.27;
          const z = -3.5 - row * 1.2;
          const y = 0.3 + row * 0.45;
          const body = mesh(capG, std(cols[n++ % cols.length]!, 0.6), x, y, z);
          const head = mesh(headG, skin, x, y + 0.36, z);
          crowd.add(body, head);
        }
      const stands = mesh(new THREE.BoxGeometry(10, 2.2, 5), std(0x2d3566, 0.9), 0, -0.95, -5.3);
      scene.add(crowd, stands);
      const front = new THREE.Group();
      [
        [-1.5, 2.2, 0xffd23f],
        [1.3, 2.5, 0x4aa3ff],
        [0.4, 2.9, 0xff6b6b],
      ].forEach(([x, z, c]) => front.add(mesh(new THREE.ConeGeometry(0.2, 0.5, 20), std(c as number, 0.5), x as number, 0.25, z as number)));
      scene.add(front);
      const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 60);
      cam.position.set(0, 1.25, 4.2);
      cam.lookAt(0, 0.75, 0);
      let aperture = 0.006;
      const kit = postKit((r) => {
        const bokeh = new BokehPass(scene, cam, { focus: 4.2, aperture, maxblur: 0.014 });
        return { comp: splitChain(r, scene, cam, [bokeh]), bokeh };
      });
      const hud = new Hud();
      hud.vline(0.5);
      hud.label('모두 또렷', 0.25, 0.95, 0.5, 1);
      hud.label('초점만 또렷', 0.75, 0.95, 0.5, 1, 'on');
      let dt = 0.016;
      return {
        scene,
        camera: cam,
        update(t, d) {
          dt = d;
          ball.rotation.set(t * 1.3, t * 0.9, 0);
          ball.position.y = 0.7 + Math.sin(t * 2) * 0.08;
          crowd.children.forEach((c, i) => {
            if (i % 2 === 0) c.position.y += Math.sin(t * 6 + i) * 0.003;
          });
          cam.position.x = Math.sin(t * 0.3) * 0.35;
          cam.lookAt(0, 0.75, 0);
        },
        render(r, w, h) {
          cam.aspect = w / h;
          cam.fov = w / h < 1 ? 55 : 40;
          cam.updateProjectionMatrix();
          const k = kit.get(r, w, h);
          const u = k.bokeh.uniforms as Record<string, { value: number }>;
          u['focus']!.value = cam.position.distanceTo(ball.position);
          u['aperture']!.value = aperture;
          u['aspect']!.value = w / h;
          k.comp.render(dt);
          hud.draw(r, w, h);
        },
        controls: [{ type: 'range', label: '조리개 (흐림 정도)', min: 0, max: 0.02, step: 0.0005, value: 0.006, on: (v) => (aperture = v) }],
        dispose() {
          kit.dispose();
          hud.dispose();
          disposeTree(scene);
        },
      };
    },
  },

  /* ── i02 구석 그늘 ── */
  i02: {
    kind: '3d',
    caption: '왼쪽 그냥 · 오른쪽 GTAO 구석 그늘 — 블록 틈 · 벽 모서리가 어두워져 입체감이 쑥',
    make() {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xe9eef8);
      scene.add(new THREE.HemisphereLight(0xffffff, 0xc8c0b0, 1.6));
      const sun = new THREE.DirectionalLight(0xffffff, 0.7);
      sun.position.set(3, 5, 4);
      scene.add(sun);
      const wallM = std(0xf4efe6, 0.95);
      const floor = mesh(new THREE.BoxGeometry(4, 0.1, 4), wallM, 0, -0.05, 0);
      const back = mesh(new THREE.BoxGeometry(4, 2.4, 0.1), wallM, 0, 1.2, -2);
      const left = mesh(new THREE.BoxGeometry(0.1, 2.4, 4), wallM, -2, 1.2, 0);
      scene.add(floor, back, left);
      const cols = [0xffc7c7, 0xfff0a8, 0xbfe3ff, 0xc8f2c8, 0xe2cdfc];
      const cubeG = new THREE.BoxGeometry(0.5, 0.5, 0.5);
      const stack: [number, number, number][] = [
        [-1.75, 0, -1.75], [-1.25, 0, -1.75], [-0.75, 0, -1.75], [-1.75, 0, -1.25], [-1.75, 1, -1.75], [-1.25, 1, -1.75], [-1.75, 1, -1.25], [-1.75, 2, -1.75],
        [0.25, 0, -0.25], [0.75, 0, -0.25], [0.25, 0, 0.25], [0.25, 1, -0.25], [0.75, 0, 0.25],
        [-0.75, 0, 0.75], [1.25, 0, -1.25], [1.25, 1, -1.25], [1.25, 0, -1.75],
      ];
      const blocks = new THREE.Group();
      stack.forEach(([x, y, z], i) => blocks.add(mesh(cubeG, std(cols[i % cols.length]!, 0.8), x, 0.25 + y * 0.5, z)));
      const ball = mesh(new THREE.SphereGeometry(0.32, 32, 20), std(0xffffff, 0.7), -0.7, 0.32, -0.3);
      scene.add(blocks, ball);
      const cam = new THREE.PerspectiveCamera(36, 1, 0.1, 40);
      let inten = 1;
      const kit = postKit((r) => {
        const ao = new GTAOPass(scene, cam, 256, 256);
        ao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1, thickness: 1, scale: 1.3, samples: 16 });
        return { comp: splitChain(r, scene, cam, [ao]), ao };
      });
      const hud = new Hud();
      hud.vline(0.5);
      hud.label('그냥', 0.25, 0.95, 0.5, 1);
      hud.label('구석 그늘', 0.75, 0.95, 0.5, 1, 'on');
      let now = 0;
      let dt = 0.016;
      return {
        scene,
        camera: cam,
        update(t, d) {
          now = t;
          dt = d;
          ball.position.x = -0.7 + Math.sin(t * 0.9) * 0.45;
          ball.rotation.z = -t;
        },
        render(r, w, h) {
          const a = 0.55 + Math.sin(now * 0.3) * 0.25;
          fit(cam, w / h, V3(-0.4, 0.55, -0.4), 2.0, V3(Math.sin(a), 0.75, Math.cos(a)));
          const k = kit.get(r, w, h);
          k.ao.blendIntensity = inten;
          k.comp.render(dt);
          hud.draw(r, w, h);
        },
        controls: [{ type: 'range', label: '그늘 세기', min: 0, max: 2, step: 0.05, value: 1, on: (v) => (inten = v) }],
        dispose() {
          kit.dispose();
          hud.dispose();
          disposeTree(scene);
        },
      };
    },
  },

  /* ── i03 후처리 외곽선 ── */
  i03: {
    kind: '3d',
    caption: '왼쪽 선 없음 · 오른쪽 깊이 · 법선이 갑자기 바뀌는 곳에 선 — 굵기가 일정하고 얇은 표지판도 선이 생겨요',
    make() {
      const scene = new THREE.Scene();
      scene.background = gradTex('#bfe6ff', '#f2fbff');
      basicLights(scene, 1.0, 1.6, V3(-3, 6, 3));
      const toon = (c: number): THREE.MeshToonMaterial => new THREE.MeshToonMaterial({ color: c });
      const ground = mesh(new THREE.BoxGeometry(6, 0.1, 4.4), toon(0x8d94a6), 0, -0.05, 0);
      scene.add(ground);
      const lineM = toon(0xffffff);
      for (let i = -2; i <= 2; i++) scene.add(mesh(new THREE.BoxGeometry(0.06, 0.02, 1.4), lineM, i * 1.15, 0.01, -1.2));
      const car = (c: number, x: number, z: number, ry: number): THREE.Group => {
        const g = new THREE.Group();
        g.add(mesh(new RoundedBoxGeometry(0.75, 0.32, 1.2, 2, 0.08), toon(c), 0, 0.28, 0));
        g.add(mesh(new RoundedBoxGeometry(0.6, 0.28, 0.6, 2, 0.08), toon(0xdff4ff), 0, 0.55, -0.05));
        const wg = new THREE.CylinderGeometry(0.15, 0.15, 0.12, 20);
        wg.rotateZ(Math.PI / 2);
        for (const [wx, wz] of [
          [-0.38, 0.38],
          [0.38, 0.38],
          [-0.38, -0.38],
          [0.38, -0.38],
        ] as const)
          g.add(mesh(wg, toon(0x2a2a3a), wx, 0.15, wz));
        g.position.set(x, 0, z);
        g.rotation.y = ry;
        return g;
      };
      const cars = [car(0xff5d5d, -0.57, -1.2, 0), car(0x4aa3ff, 1.72, -1.2, 0), car(0xffd23f, 0.3, 0.9, Math.PI / 2)];
      scene.add(...cars);
      for (const [x, z] of [
        [-2.2, 0.8],
        [-1.6, 1.4],
      ] as const) {
        const cone = mesh(new THREE.ConeGeometry(0.16, 0.45, 20), toon(0xff8a3a), x, 0.25, z);
        scene.add(cone);
      }
      const sign = new THREE.Group();
      sign.add(mesh(new THREE.BoxGeometry(0.6, 0.6, 0.015), toon(0x3ec46d), 0, 1.0, 0));
      sign.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.75, 10), toon(0xdddddd), 0, 0.37, -0.02));
      sign.position.set(2.2, 0, 1.1);
      scene.add(sign);
      const cam = new THREE.PerspectiveCamera(36, 1, 0.1, 40);
      const rtN = new THREE.WebGLRenderTarget(1, 1, { depthTexture: new THREE.DepthTexture(1, 1) });
      const normalM = new THREE.MeshNormalMaterial();
      let thick = 1.2;
      const EDGE = new THREE.ShaderMaterial({
        uniforms: {
          tDiffuse: { value: null },
          tN: { value: rtN.texture },
          tD: { value: rtN.depthTexture },
          res: { value: new THREE.Vector2(1, 1) },
          near: { value: 0.1 },
          far: { value: 40 },
          thick: { value: 1 },
          ink: { value: new THREE.Color(0x1d2340) },
        },
        vertexShader: VERT,
        fragmentShader: `uniform sampler2D tDiffuse; uniform sampler2D tN; uniform sampler2D tD; uniform vec2 res; uniform float near; uniform float far; uniform float thick; uniform vec3 ink; varying vec2 vUv;
          float iz(vec2 uv){ float z = texture2D(tD, uv).x * 2.0 - 1.0; float lin = (2.0 * near * far) / (far + near - z * (far - near)); return 1.0 / lin; }
          vec3 nn(vec2 uv){ return texture2D(tN, uv).rgb * 2.0 - 1.0; }
          void main(){
            vec4 base = texture2D(tDiffuse, vUv);
            vec2 px = thick / res;
            float w0 = iz(vUv);
            float wl = iz(vUv - vec2(px.x, 0.0)); float wr = iz(vUv + vec2(px.x, 0.0));
            float wd = iz(vUv - vec2(0.0, px.y)); float wu = iz(vUv + vec2(0.0, px.y));
            float lap = abs(wl + wr - 2.0 * w0) + abs(wd + wu - 2.0 * w0);
            float de = smoothstep(0.02, 0.06, lap / max(w0, 1e-4));
            vec3 n0 = nn(vUv);
            float ne = distance(nn(vUv - vec2(px.x, 0.0)), n0) + distance(nn(vUv + vec2(px.x, 0.0)), n0) + distance(nn(vUv - vec2(0.0, px.y)), n0) + distance(nn(vUv + vec2(0.0, px.y)), n0);
            float e = max(de, smoothstep(0.5, 0.9, ne));
            gl_FragColor = vec4(mix(base.rgb, ink, e), base.a);
          }`,
      });
      const kit = postKit((r) => {
        const edge = new ShaderPass(EDGE);
        return { comp: splitChain(r, scene, cam, [edge]), edge };
      });
      const hud = new Hud();
      hud.vline(0.5);
      hud.label('선 없음', 0.25, 0.95, 0.5, 1);
      hud.label('후처리 외곽선', 0.75, 0.95, 0.5, 1, 'on');
      let now = 0;
      let dt = 0.016;
      const clear = new THREE.Color();
      return {
        scene,
        camera: cam,
        update(t, d) {
          now = t;
          dt = d;
          cars[2]!.position.x = 0.3 + Math.sin(t * 0.8) * 1.3;
          sign.rotation.y = Math.sin(t * 0.7) * 0.9;
        },
        render(r, w, h) {
          const a = Math.sin(now * 0.25) * 0.35;
          fit(cam, w / h, V3(0, 0.2, 0), 2.6, V3(Math.sin(a), 1.0, Math.cos(a)));
          if (rtN.width !== w || rtN.height !== h) rtN.setSize(w, h);
          // 법선 · 깊이 한 번 더 그리기
          const bg = scene.background;
          r.getClearColor(clear);
          const ca = r.getClearAlpha();
          scene.background = null;
          scene.overrideMaterial = normalM;
          r.setClearColor(0x000000, 0);
          r.setRenderTarget(rtN);
          r.clear();
          r.render(scene, cam);
          r.setRenderTarget(null);
          scene.overrideMaterial = null;
          scene.background = bg;
          r.setClearColor(clear, ca);
          const k = kit.get(r, w, h);
          const u = k.edge.uniforms as Record<string, { value: unknown }>;
          (u['res']!.value as THREE.Vector2).set(w, h);
          u['thick']!.value = thick * Math.max(1, h / 420);
          k.comp.render(dt);
          hud.draw(r, w, h);
        },
        controls: [{ type: 'range', label: '선 굵기', min: 0.5, max: 3, step: 0.1, value: 1.2, on: (v) => (thick = v) }],
        dispose() {
          kit.dispose();
          rtN.depthTexture?.dispose();
          rtN.dispose();
          normalM.dispose();
          hud.dispose();
          disposeTree(scene);
        },
      };
    },
  },

  /* ── i04 계단 줄이기 ── */
  i04: {
    kind: '3d',
    caption: '확대해서 본 가장자리 — 왼쪽은 안티앨리어싱이 꺼진 계단, 오른쪽 SMAA 는 경계를 매끈하게 다듬어요',
    make() {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x10163a);
      basicLights(scene, 0.8, 1.8, V3(-2, 3, 4));
      const wheel = new THREE.Group();
      const spokeM = std(0xffffff, 0.4);
      for (let i = 0; i < 10; i++) {
        const s = mesh(new THREE.BoxGeometry(0.035, 2.0, 0.035), spokeM);
        s.rotation.z = (i / 10) * Math.PI;
        wheel.add(s);
      }
      wheel.add(new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.03, 8, 80), std(0xffd23f, 0.4)));
      const cube = mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), std(0xff5d73, 0.5));
      scene.add(wheel, cube);
      const cam = new THREE.PerspectiveCamera(36, 1, 0.1, 30);
      let zoom = 3;
      let lw = 1;
      let lh = 1;
      const UP = new THREE.ShaderMaterial({
        uniforms: { tDiffuse: { value: null }, lowRes: { value: new THREE.Vector2(1, 1) } },
        vertexShader: VERT,
        fragmentShader:
          'uniform sampler2D tDiffuse; uniform vec2 lowRes; varying vec2 vUv; void main(){ ivec2 p = ivec2(clamp(floor(vUv * lowRes), vec2(0.0), lowRes - 1.0)); gl_FragColor = texelFetch(tDiffuse, p, 0); }',
      });
      const kit = postKit((r) => {
        const comp = new EffectComposer(r);
        comp.setPixelRatio(1);
        comp.addPass(new RenderPass(scene, cam));
        const save = new SavePass();
        comp.addPass(save);
        const smaa = new SMAAPass();
        comp.addPass(smaa);
        comp.addPass(splitPass(save.renderTarget.texture));
        comp.addPass(new OutputPass());
        const up = new ShaderPass(UP);
        comp.addPass(up);
        return { comp, up };
      });
      const hud = new Hud();
      hud.vline(0.5);
      hud.label('AA 없음 (계단)', 0.25, 0.95, 0.5, 1);
      hud.label('SMAA', 0.75, 0.95, 0.5, 1, 'on');
      const zl = hud.label('×3 확대', 0.5, 0.04, 0.5, 0, 'tag', 0.8);
      let dt = 0.016;
      return {
        scene,
        camera: cam,
        update(t, d) {
          dt = d;
          wheel.rotation.z = t * 0.25;
          wheel.rotation.y = Math.sin(t * 0.3) * 0.4;
          cube.rotation.set(t * 0.35, t * 0.5, 0.3);
        },
        render(r, w, h) {
          fit(cam, w / h, V3(0, 0, 0), 1.15, V3(0, 0, 1));
          const z = Math.max(1, zoom * Math.max(0.6, Math.min(1.6, h / 350)));
          lw = Math.max(16, Math.ceil(w / z));
          lh = Math.max(16, Math.ceil(h / z));
          const k = kit.get(r, lw, lh);
          (k.up.uniforms['lowRes']!.value as THREE.Vector2).set(lw, lh);
          zl.set(`×${Math.round(z * 10) / 10} 확대`);
          k.comp.render(dt);
          r.setViewport(0, 0, w, h);
          hud.draw(r, w, h);
        },
        controls: [{ type: 'range', label: '확대 배율', min: 1, max: 6, step: 0.5, value: 3, on: (v) => (zoom = v) }],
        dispose() {
          kit.dispose();
          hud.dispose();
          disposeTree(scene);
        },
      };
    },
  },

  /* ── i05 잔상 ── */
  i05: {
    kind: '3d',
    caption: '왼쪽 그냥 · 오른쪽 Afterimage — 빠르게 미끄러지는 별 · 도는 공 뒤에 꼬리가 남아 속도감',
    make() {
      const scene = new THREE.Scene();
      scene.background = gradTex('#1a2560', '#070a1e');
      basicLights(scene, 0.7, 1.6, V3(-2, 4, 3));
      const ice = mesh(new THREE.BoxGeometry(5, 0.1, 2.6), std(0x9fd6ff, 0.25, 0.1), 0, -0.05, 0);
      scene.add(ice);
      const star = new THREE.Mesh(starGeo(0.34, 0.16, 0.16), new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xffb000, emissiveIntensity: 0.8 }));
      star.position.y = 0.4;
      const ball = mesh(new THREE.SphereGeometry(0.2, 24, 16), new THREE.MeshStandardMaterial({ color: 0xff6bb5, emissive: 0xff2d8a, emissiveIntensity: 0.6 }));
      const car = new THREE.Group();
      car.add(mesh(new RoundedBoxGeometry(0.6, 0.25, 0.35, 2, 0.06), std(0x38e1ff, 0.4), 0, 0.2, 0));
      car.add(mesh(new RoundedBoxGeometry(0.3, 0.18, 0.3, 2, 0.05), std(0xffffff, 0.4), -0.04, 0.4, 0));
      scene.add(star, ball, car);
      const cam = new THREE.PerspectiveCamera(36, 1, 0.1, 30);
      let damp = 0.88;
      const kit = postKit((r) => {
        const after = new AfterimagePass(damp);
        return { comp: splitChain(r, scene, cam, [after]), after };
      });
      const hud = new Hud();
      hud.vline(0.5);
      hud.label('그냥', 0.25, 0.95, 0.5, 1);
      hud.label('잔상', 0.75, 0.95, 0.5, 1, 'on');
      let dt = 0.016;
      return {
        scene,
        camera: cam,
        update(t, d) {
          dt = d;
          const p = (t * 0.55) % 2;
          const e = p < 1 ? p : 2 - p;
          const ease = e * e * (3 - 2 * e);
          star.position.x = -2 + ease * 4;
          star.rotation.z = -star.position.x * 2.2;
          ball.position.set(Math.cos(t * 5) * 1.1, 0.75 + Math.sin(t * 5) * 0.2, Math.sin(t * 5) * 0.6 - 0.3);
          car.position.set(Math.sin(t * 2.6) * 2.0, 0, 0.85);
          car.rotation.y = Math.cos(t * 2.6) > 0 ? 0 : Math.PI;
        },
        render(r, w, h) {
          fit(cam, w / h, V3(0, 0.4, 0), 2.2, V3(0, 0.55, 1));
          const k = kit.get(r, w, h);
          (k.after.uniforms as Record<string, { value: number }>)['damp']!.value = damp;
          k.comp.render(dt);
          hud.draw(r, w, h);
        },
        controls: [{ type: 'range', label: '꼬리 길이', min: 0.5, max: 0.97, step: 0.01, value: 0.88, on: (v) => (damp = v) }],
        dispose() {
          kit.dispose();
          hud.dispose();
          disposeTree(scene);
        },
      };
    },
  },

  /* ── i06 빛살 ── */
  i06: {
    kind: '3d',
    caption: '해 앞의 풍차 · 나무 사이로 빛줄기가 쏟아져요 — 몇 초마다 켬 / 끔',
    make() {
      const scene = new THREE.Scene();
      scene.background = gradTex('#3a2a78', '#ff9a5a', '#c0508a');
      scene.add(new THREE.HemisphereLight(0xffc0a0, 0x302040, 0.6));
      const back = new THREE.DirectionalLight(0xffc080, 1.2);
      back.position.set(0, 2, -6);
      scene.add(back);
      const sun = mesh(new THREE.SphereGeometry(0.95, 32, 20), new THREE.MeshBasicMaterial({ color: 0xfff0b8 }), -0.5, 2.9, -9);
      scene.add(sun);
      const occ: THREE.Mesh[] = [];
      const hill = mesh(new THREE.SphereGeometry(6, 48, 24), std(0x4a2a5a, 0.9), 0, -5.6, -3);
      const mill = new THREE.Group();
      mill.add(mesh(new THREE.CylinderGeometry(0.12, 0.2, 2.0, 12), std(0x3a2240, 0.8), 0, 0.5, 0));
      const blades = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const b = mesh(new THREE.BoxGeometry(0.22, 1.5, 0.04), std(0x3a2240, 0.8), 0, 0.75, 0);
        const holder = new THREE.Group();
        holder.add(b);
        holder.rotation.z = (i * Math.PI) / 2;
        blades.add(holder);
      }
      blades.position.set(0, 1.5, 0.15);
      mill.add(blades);
      mill.position.set(0.15, 0, -4.2);
      const trees = new THREE.Group();
      for (const [x, z, s] of [
        [-2.4, -3.5, 1.2],
        [-1.6, -4.6, 0.9],
        [2.0, -3.8, 1.1],
        [2.9, -4.8, 0.8],
        [-3.3, -4.9, 1.0],
      ] as const) {
        const tr = new THREE.Group();
        tr.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.6, 8), std(0x2a1630), 0, 0.3, 0));
        tr.add(mesh(new THREE.ConeGeometry(0.45, 1.3, 12), std(0x2f1a3c), 0, 1.1, 0));
        tr.position.set(x, 0, z);
        tr.scale.setScalar(s);
        trees.add(tr);
      }
      const birds: THREE.Mesh[] = [];
      for (let i = 0; i < 4; i++) {
        const b = mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), std(0x3a2240), 0, 0, -5);
        birds.push(b);
        scene.add(b);
      }
      scene.add(hill, mill, trees);
      scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && o !== sun) occ.push(o as THREE.Mesh);
      });
      const cam = new THREE.PerspectiveCamera(42, 1, 0.1, 50);
      cam.position.set(0, 0.9, 3.2);
      cam.lookAt(0, 1.3, -6);
      const rtO = new THREE.WebGLRenderTarget(1, 1);
      const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
      const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const GOD = new THREE.ShaderMaterial({
        uniforms: { tDiffuse: { value: null }, tOcc: { value: rtO.texture }, lightPos: { value: new THREE.Vector2(0.5, 0.6) }, amount: { value: 1 }, tint: { value: new THREE.Color(1.0, 0.82, 0.55) } },
        vertexShader: VERT,
        fragmentShader: `uniform sampler2D tDiffuse; uniform sampler2D tOcc; uniform vec2 lightPos; uniform float amount; uniform vec3 tint; varying vec2 vUv;
          void main(){
            vec4 base = texture2D(tDiffuse, vUv);
            vec2 d = (vUv - lightPos) * (0.92 / 60.0);
            vec2 uv = vUv; float il = 1.0; vec3 acc = vec3(0.0);
            for (int i = 0; i < 60; i++){ uv -= d; acc += texture2D(tOcc, uv).rgb * il; il *= 0.975; }
            acc /= 60.0;
            gl_FragColor = vec4(base.rgb + acc * tint * amount * 3.2, base.a);
          }`,
      });
      const kit = postKit((r) => {
        const comp = new EffectComposer(r);
        comp.setPixelRatio(1);
        comp.addPass(new RenderPass(scene, cam));
        comp.addPass(new ShaderPass(GOD));
        comp.addPass(new OutputPass());
        return { comp };
      });
      const hud = new Hud();
      const lab = hud.label('빛살 켬', 0.04, 0.95, 0, 1, 'on');
      let amount = 0;
      let auto = true;
      let dt = 0.016;
      let want = 1;
      const pos = new THREE.Vector3();
      const saved = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
      const clear = new THREE.Color();
      return {
        scene,
        camera: cam,
        update(t, d) {
          dt = d;
          blades.rotation.z = t * 0.9;
          birds.forEach((b, i) => {
            const a = t * 0.4 + i * 1.6;
            b.position.set(Math.sin(a) * 2.2, 1.6 + Math.sin(a * 2) * 0.5, -6 + Math.cos(a) * 0.5);
            b.rotation.set(t, t * 1.3, 0);
          });
          want = auto ? (Math.floor(t / 3) % 2 === 0 ? 1 : 0) : want;
          amount += (want - amount) * Math.min(1, d * 5);
          lab.set(want ? '빛살 켬' : '빛살 끔', want ? 'on' : 'off');
        },
        render(r, w, h) {
          cam.aspect = w / h;
          cam.fov = w / h < 1 ? 62 : 42;
          cam.updateProjectionMatrix();
          const ow = Math.max(1, Math.round(w / 2));
          const oh = Math.max(1, Math.round(h / 2));
          if (rtO.width !== ow || rtO.height !== oh) rtO.setSize(ow, oh);
          // 가림 그림: 해만 하양, 나머지 검정
          const bg = scene.background;
          scene.background = null;
          for (const m of occ) {
            saved.set(m, m.material);
            m.material = black;
          }
          saved.set(sun, sun.material);
          sun.material = white;
          r.getClearColor(clear);
          const ca = r.getClearAlpha();
          r.setClearColor(0x000000, 1);
          r.setRenderTarget(rtO);
          r.clear();
          r.render(scene, cam);
          r.setRenderTarget(null);
          r.setClearColor(clear, ca);
          for (const [m, mat] of saved) m.material = mat;
          saved.clear();
          scene.background = bg;
          pos.copy(sun.position).project(cam);
          const u = GOD.uniforms;
          (u['lightPos']!.value as THREE.Vector2).set(pos.x * 0.5 + 0.5, pos.y * 0.5 + 0.5);
          u['amount']!.value = amount;
          kit.get(r, w, h).comp.render(dt);
          hud.draw(r, w, h);
        },
        controls: [
          {
            type: 'toggle',
            label: '자동 켜고 끄기',
            value: true,
            on: (v) => {
              auto = v;
              if (!v) want = 1;
            },
          },
          { type: 'range', label: '빛살 세기 (자동 끔일 때)', min: 0, max: 1, step: 1, value: 1, on: (v) => (want = v) },
        ],
        dispose() {
          kit.dispose();
          rtO.dispose();
          black.dispose();
          white.dispose();
          GOD.dispose();
          hud.dispose();
          disposeTree(scene);
        },
      };
    },
  },

  /* ── i07 색 보정 LUT · 색수차 · 필름 결 ── */
  i07: {
    kind: '3d',
    caption: '왼쪽 원본 · 오른쪽 색 보정 표(LUT)로 노을 / 밤 / 옛날 필름 + 필름 결, 「쿵!」 순간엔 RGB 가 어긋나요',
    make() {
      const scene = new THREE.Scene();
      scene.background = gradTex('#8fd0ff', '#e6f6ff');
      basicLights(scene, 1.0, 1.8, V3(-3, 5, 3));
      const ground = mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.15, 48), std(0x8fd46a, 0.9), 0, -0.075, 0);
      const house = new THREE.Group();
      house.add(mesh(new THREE.BoxGeometry(0.8, 0.7, 0.7), std(0xfff1d6, 0.7), 0, 0.35, 0));
      const roof = mesh(new THREE.ConeGeometry(0.66, 0.5, 4), std(0xe8453c, 0.6), 0, 0.95, 0);
      roof.rotation.y = Math.PI / 4;
      house.add(roof);
      house.add(mesh(new THREE.BoxGeometry(0.2, 0.32, 0.02), std(0x8a5530), 0, 0.16, 0.36));
      house.position.set(-0.85, 0, -0.5);
      const tree = new THREE.Group();
      tree.add(mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.5, 10), std(0x8a5530), 0, 0.25, 0));
      tree.add(mesh(new THREE.SphereGeometry(0.38, 24, 16), std(0x3ec46d, 0.7), 0, 0.75, 0));
      tree.position.set(1.0, 0, -0.6);
      const ch = cutie(0x4aa3ff);
      ch.scale.setScalar(0.7);
      ch.position.set(0.2, 0, 0.5);
      const ball = mesh(new THREE.SphereGeometry(0.16, 24, 16), std(0xffd23f, 0.4), 0.9, 0.16, 0.6);
      scene.add(ground, house, tree, ch, ball);
      const cam = new THREE.PerspectiveCamera(36, 1, 0.1, 30);
      const luts = LUTS.map((l) => makeLut(l.fn));
      let grain = 0.35;
      const kit = postKit((r) => {
        const comp = new EffectComposer(r);
        comp.setPixelRatio(1);
        comp.addPass(new RenderPass(scene, cam));
        comp.addPass(new OutputPass());
        const save = new SavePass();
        comp.addPass(save);
        const lut = new LUTPass({ lut: luts[0]!, intensity: 1 });
        const shift = new ShaderPass(RGBShiftShader);
        const film = new FilmPass(grain, false);
        comp.addPass(lut);
        comp.addPass(shift);
        comp.addPass(film);
        comp.addPass(splitPass(save.renderTarget.texture));
        return { comp, lut, shift, film };
      });
      const hud = new Hud();
      hud.vline(0.5);
      hud.label('원본', 0.25, 0.95, 0.5, 1);
      const mood = hud.label(LUTS[0]!.name, 0.75, 0.95, 0.5, 1, 'on');
      const pop = hud.label('쿵!', 0.75, 0.55, 0.5, 0.5, 'pop', 1.6);
      let dt = 0.016;
      let mi = 0;
      let hit = 0;
      let now = 0;
      return {
        scene,
        camera: cam,
        update(t, d) {
          dt = d;
          now = t;
          mi = Math.floor(t / 3) % LUTS.length;
          mood.set(LUTS[mi]!.name);
          const ph = t % 4.5;
          hit = ph > 3.6 ? Math.exp(-(ph - 3.6) * 6) : 0;
          pop.visible = hit > 0.3;
          ch.position.y = Math.abs(Math.sin(t * 2.4)) * 0.18;
          ch.rotation.y = Math.sin(t * 0.8) * 0.8;
          ball.position.x = 0.9 + Math.sin(t * 1.3) * 0.25;
        },
        render(r, w, h) {
          const a = Math.sin(now * 0.3) * 0.4;
          fit(cam, w / h, V3(0, 0.45, 0), 2.1, V3(Math.sin(a), 0.6, Math.cos(a)));
          cam.position.x += (Math.random() - 0.5) * 0.12 * hit;
          cam.position.y += (Math.random() - 0.5) * 0.12 * hit;
          const k = kit.get(r, w, h);
          k.lut.lut = luts[mi]!;
          (k.shift.uniforms['amount']!.value as number) = 0.004 + 0.022 * hit;
          k.shift.uniforms['angle']!.value = now * 2;
          (k.film.uniforms as Record<string, { value: number }>)['intensity']!.value = grain;
          k.comp.render(dt);
          hud.draw(r, w, h);
        },
        controls: [{ type: 'range', label: '필름 결', min: 0, max: 1, step: 0.05, value: 0.35, on: (v) => (grain = v) }],
        dispose() {
          kit.dispose();
          for (const l of luts) l.dispose();
          hud.dispose();
          disposeTree(scene);
        },
      };
    },
  },

  /* ── i08 도트화 ── */
  i08: {
    kind: '3d',
    caption: '왼쪽 그냥 3D · 오른쪽 도트화 — 낮은 해상도로 그리고 가장자리에 선을 넣어 도트 그림처럼 (꼬마 창고지기 레트로 모드)',
    make() {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x7ec8ff);
      basicLights(scene, 0.9, 1.8, V3(-3, 6, 4));
      const root = new THREE.Group();
      const tileA = std(0xe8d3a8, 0.9);
      const tileB = std(0xd8bf8e, 0.9);
      const tileG = new THREE.BoxGeometry(0.98, 0.2, 0.98);
      for (let x = -2; x <= 2; x++)
        for (let z = -2; z <= 2; z++) root.add(mesh(tileG, (x + z) & 1 ? tileA : tileB, x, -0.1, z));
      const wallM = std(0x8a8fa3, 0.85);
      const wallG = new THREE.BoxGeometry(1, 1, 1);
      for (let i = -3; i <= 3; i++) {
        root.add(mesh(wallG, wallM, i, 0.5, -3));
        if (i > -3 && i < 3) {
          root.add(mesh(wallG, wallM, -3, 0.5, i));
          root.add(mesh(wallG, wallM, 3, 0.5, i));
        }
      }
      const crateM = std(0xc07a3a, 0.8);
      const crateE = std(0x8a5530, 0.8);
      const crate = (x: number, z: number): THREE.Group => {
        const g = new THREE.Group();
        g.add(mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), crateM, 0, 0.4, 0));
        g.add(mesh(new THREE.BoxGeometry(0.84, 0.12, 0.84), crateE, 0, 0.74, 0));
        g.add(mesh(new THREE.BoxGeometry(0.84, 0.12, 0.84), crateE, 0, 0.06, 0));
        g.position.set(x, 0, z);
        return g;
      };
      const crates = [crate(-1, -1), crate(1, 0), crate(0, 1)];
      root.add(...crates);
      const goalM = std(0xff7aa8, 0.6);
      for (const [x, z] of [
        [-2, -2],
        [2, -1],
        [-1, 2],
      ] as const) {
        const gm = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 20), goalM, x, 0.02, z);
        root.add(gm);
      }
      const kid = new THREE.Group();
      kid.add(mesh(new THREE.BoxGeometry(0.4, 0.45, 0.3), std(0x3a6cf0, 0.7), 0, 0.42, 0));
      kid.add(mesh(new THREE.BoxGeometry(0.36, 0.34, 0.34), std(0xffd9b3, 0.7), 0, 0.82, 0));
      kid.add(mesh(new THREE.BoxGeometry(0.4, 0.12, 0.4), std(0xe8453c, 0.6), 0, 1.03, 0.02));
      kid.add(mesh(new THREE.BoxGeometry(0.4, 0.04, 0.2), std(0xe8453c, 0.6), 0, 0.98, 0.25));
      const legs: THREE.Mesh[] = [];
      for (const s of [-1, 1]) {
        const l = mesh(new THREE.BoxGeometry(0.15, 0.22, 0.15), std(0x2a2a3a), s * 0.1, 0.11, 0);
        legs.push(l);
        kid.add(l);
      }
      root.add(kid);
      scene.add(root);
      const cam = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
      let mul = 1;
      let px = 0;
      const kit = postKit((r) => {
        const pix = new RenderPixelatedPass(4, scene, cam, { normalEdgeStrength: 0.35, depthEdgeStrength: 0.5 });
        return { comp: splitChain(r, scene, cam, [pix]), pix };
      });
      const hud = new Hud();
      hud.vline(0.5);
      hud.label('그냥 3D', 0.25, 0.95, 0.5, 1);
      hud.label('도트화', 0.75, 0.95, 0.5, 1, 'on');
      let dt = 0.016;
      let now = 0;
      return {
        scene,
        camera: cam,
        update(t, d) {
          dt = d;
          now = t;
          const p = (t * 0.35) % 2;
          const e = p < 1 ? p : 2 - p;
          kid.position.set(-2 + e * 4, 0, -2 + 0 * e);
          kid.rotation.y = p < 1 ? Math.PI / 2 : -Math.PI / 2;
          legs.forEach((l, i) => (l.position.z = Math.sin(t * 10 + i * Math.PI) * 0.08));
          kid.position.z = -2 + Math.sin(t * 0.2) * 0.02;
          crates[1]!.position.y = 0;
        },
        render(r, w, h) {
          root.rotation.y = Math.sin(now * 0.25) * 0.45;
          fit(cam, w / h, V3(0, 0.3, 0), 4.3, V3(0, 1.25, 1));
          const k = kit.get(r, w, h);
          const want = Math.max(2, Math.round((h / 75) * mul));
          if (want !== px) {
            px = want;
            k.pix.setPixelSize(px);
          }
          k.comp.render(dt);
          hud.draw(r, w, h);
        },
        controls: [
          {
            type: 'range',
            label: '도트 크기',
            min: 0.4,
            max: 3,
            step: 0.1,
            value: 1,
            on: (v) => {
              mul = v;
            },
          },
        ],
        dispose() {
          kit.dispose();
          hud.dispose();
          disposeTree(scene);
        },
      };
    },
  },

  /* ── i14 평면 반사 ── */
  i14: {
    kind: '3d',
    caption: '왼쪽 그냥 얼음 바닥 · 오른쪽 Reflector — 별 · 펭귄 · 눈사람이 반들반들 얼음에 거꾸로 비쳐요',
    make() {
      const build = (mirror: boolean): { scene: THREE.Scene; star: THREE.Mesh; peng: THREE.Group; refl: Reflector | null } => {
        const scene = new THREE.Scene();
        scene.background = gradTex('#7fc8ff', '#e8f7ff');
        basicLights(scene, 1.0, 1.6, V3(-3, 5, 3));
        let refl: Reflector | null = null;
        if (mirror) {
          refl = new Reflector(new THREE.CircleGeometry(2.4, 64), { textureWidth: 512, textureHeight: 512, color: 0xa8c4dc, clipBias: 0.003 });
          refl.rotation.x = -Math.PI / 2;
          scene.add(refl);
          const film = new THREE.Mesh(new THREE.CircleGeometry(2.4, 64), new THREE.MeshStandardMaterial({ color: 0xd8f2ff, roughness: 0.2, transparent: true, opacity: 0.38 }));
          film.rotation.x = -Math.PI / 2;
          film.position.y = 0.004;
          scene.add(film);
        } else {
          const ice = new THREE.Mesh(new THREE.CircleGeometry(2.4, 64), std(0xc6e8fa, 0.25, 0.05));
          ice.rotation.x = -Math.PI / 2;
          scene.add(ice);
        }
        const rim = mesh(new THREE.TorusGeometry(2.4, 0.12, 12, 80), std(0xffffff, 0.8), 0, 0, 0);
        rim.rotation.x = Math.PI / 2;
        scene.add(rim);
        const star = new THREE.Mesh(starGeo(0.42, 0.2, 0.18), new THREE.MeshStandardMaterial({ color: 0xffd84a, emissive: 0xff9a00, emissiveIntensity: 0.25, roughness: 0.4 }));
        star.position.set(0, 0.7, 0);
        const peng = cutie(0x2b3550, 0xffffff);
        peng.scale.setScalar(0.8);
        peng.position.set(-1.1, 0, 0.3);
        const snow = new THREE.Group();
        const sm = std(0xffffff, 0.7);
        snow.add(mesh(new THREE.SphereGeometry(0.38, 24, 16), sm, 0, 0.36, 0));
        snow.add(mesh(new THREE.SphereGeometry(0.26, 24, 16), sm, 0, 0.88, 0));
        snow.add(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.26, 20), std(0x22223a, 0.5), 0, 1.22, 0));
        snow.add(mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.03, 20), std(0x22223a, 0.5), 0, 1.09, 0));
        snow.add(mesh(new THREE.ConeGeometry(0.05, 0.2, 12), std(0xff8a3a, 0.5), 0, 0.88, 0.3).rotateX(Math.PI / 2));
        snow.position.set(1.1, 0, -0.2);
        scene.add(star, peng, snow);
        return { scene, star, peng, refl };
      };
      const A = build(false);
      const B = build(true);
      const cam = new THREE.PerspectiveCamera(36, 1, 0.1, 40);
      const hud = new Hud();
      hud.vline(0.5);
      hud.label('그냥 바닥', 0.25, 0.95, 0.5, 1);
      hud.label('평면 반사', 0.75, 0.95, 0.5, 1, 'on');
      let now = 0;
      return {
        scene: A.scene,
        camera: cam,
        update(t) {
          now = t;
          for (const S of [A, B]) {
            S.star.rotation.y = t * 1.2;
            S.star.position.y = 0.7 + Math.abs(Math.sin(t * 1.8)) * 0.5;
            S.peng.position.y = Math.abs(Math.sin(t * 2.4 + 1)) * 0.25;
            S.peng.rotation.y = Math.sin(t * 0.7) * 0.6;
          }
        },
        render(r, w, h) {
          const a = Math.sin(now * 0.25) * 0.3;
          panels(r, w, h, [{ scene: A.scene }, { scene: B.scene }], (asp) => fit(cam, asp, V3(0, 0.45, 0), 1.75, V3(Math.sin(a), 0.42, Math.cos(a))));
          hud.draw(r, w, h);
        },
        dispose() {
          B.refl?.dispose();
          hud.dispose();
          disposeTree(A.scene, B.scene);
        },
      };
    },
  },

  /* ── i15 접촉 그림자 ── */
  i15: {
    kind: '3d',
    caption: '왼쪽 그림자 없음(둥둥 떠 보임) · 오른쪽 접촉 그림자 — 아래에서 한 장 찍어 흐린 그림자, 높이 뛰면 옅어져요',
    make() {
      const build = (): { scene: THREE.Scene; chars: THREE.Group[]; cube: THREE.Mesh; ground: THREE.Mesh } => {
        const scene = new THREE.Scene();
        scene.background = gradTex('#d9ccff', '#fff6ea');
        basicLights(scene, 1.0, 1.4, V3(-2, 5, 3));
        const ground = new THREE.Mesh(new THREE.CircleGeometry(2.6, 64), std(0xfff3e2, 0.95));
        ground.rotation.x = -Math.PI / 2;
        scene.add(ground);
        const chars = [cutie(0xff8fb1), cutie(0x6fd3c7), cutie(0xffc94a)];
        chars.forEach((c, i) => {
          c.position.set((i - 1) * 1.1, 0, i === 1 ? -0.4 : 0.3);
          scene.add(c);
        });
        const cube = mesh(new RoundedBoxGeometry(0.45, 0.45, 0.45, 2, 0.06), std(0x4aa3ff, 0.5), 1.6, 0.6, -0.8);
        scene.add(cube);
        return { scene, chars, cube, ground };
      };
      const A = build();
      const B = build();
      // 접촉 그림자 (three 예제 방식)
      const SW = 5;
      const CH = 1.4;
      const rt = new THREE.WebGLRenderTarget(512, 512);
      rt.texture.generateMipmaps = false;
      const rtB = new THREE.WebGLRenderTarget(512, 512);
      rtB.texture.generateMipmaps = false;
      const group = new THREE.Group();
      group.position.y = 0.002;
      const planeGeo = new THREE.PlaneGeometry(SW, SW).rotateX(Math.PI / 2);
      const plane = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ map: rt.texture, opacity: 0.85, transparent: true, depthWrite: false }));
      plane.renderOrder = 1;
      plane.scale.y = -1;
      group.add(plane);
      const blurPlane = new THREE.Mesh(planeGeo);
      blurPlane.visible = false;
      group.add(blurPlane);
      const shadowCam = new THREE.OrthographicCamera(-SW / 2, SW / 2, SW / 2, -SW / 2, 0, CH);
      shadowCam.rotation.x = Math.PI / 2;
      group.add(shadowCam);
      B.scene.add(group);
      const depthM = new THREE.MeshDepthMaterial();
      const dark = { value: 1.4 };
      depthM.onBeforeCompile = (sh) => {
        sh.uniforms['darkness'] = dark;
        sh.fragmentShader = `uniform float darkness;\n${sh.fragmentShader.replace('gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );', 'gl_FragColor = vec4( vec3( 0.0 ), ( 1.0 - fragCoordZ ) * darkness );')}`;
      };
      depthM.depthTest = false;
      depthM.depthWrite = false;
      const hB = new THREE.ShaderMaterial(HorizontalBlurShader);
      hB.depthTest = false;
      const vB = new THREE.ShaderMaterial(VerticalBlurShader);
      vB.depthTest = false;
      let blur = 3.5;
      const blurOnce = (r: R, amount: number): void => {
        blurPlane.visible = true;
        blurPlane.material = hB;
        hB.uniforms['tDiffuse']!.value = rt.texture;
        hB.uniforms['h']!.value = amount / 256;
        r.setRenderTarget(rtB);
        r.render(blurPlane, shadowCam);
        blurPlane.material = vB;
        vB.uniforms['tDiffuse']!.value = rtB.texture;
        vB.uniforms['v']!.value = amount / 256;
        r.setRenderTarget(rt);
        r.render(blurPlane, shadowCam);
        blurPlane.visible = false;
      };
      const cam = new THREE.PerspectiveCamera(34, 1, 0.1, 40);
      const hud = new Hud();
      hud.vline(0.5);
      hud.label('그림자 없음', 0.25, 0.95, 0.5, 1);
      hud.label('접촉 그림자', 0.75, 0.95, 0.5, 1, 'on');
      const clear = new THREE.Color();
      return {
        scene: A.scene,
        camera: cam,
        update(t) {
          for (const S of [A, B]) {
            S.chars.forEach((c, i) => {
              c.position.y = Math.max(0, Math.sin(t * 2.2 + i * 2.1)) * 0.75;
              c.rotation.y = Math.sin(t * 0.6 + i) * 0.5;
            });
            S.cube.position.y = 0.45 + Math.sin(t * 1.3) * 0.35;
            S.cube.rotation.set(t * 0.5, t * 0.7, 0);
          }
        },
        render(r, w, h) {
          // 아래에서 깊이 찍기 → 두 번 흐리기
          const bg = B.scene.background;
          B.scene.background = null;
          B.scene.overrideMaterial = depthM;
          plane.visible = false;
          B.ground.visible = false;
          r.getClearColor(clear);
          const ca = r.getClearAlpha();
          r.setClearColor(0x000000, 0);
          r.setRenderTarget(rt);
          r.clear();
          r.render(B.scene, shadowCam);
          B.scene.overrideMaterial = null;
          blurOnce(r, blur);
          blurOnce(r, blur * 0.4);
          r.setRenderTarget(null);
          r.setClearColor(clear, ca);
          B.scene.background = bg;
          plane.visible = true;
          B.ground.visible = true;
          panels(r, w, h, [{ scene: A.scene }, { scene: B.scene }], (a) => fit(cam, a, V3(0, 0.45, 0), 1.9, V3(0, 0.55, 1)));
          hud.draw(r, w, h);
        },
        controls: [
          { type: 'range', label: '흐림', min: 0, max: 10, step: 0.5, value: 3.5, on: (v) => (blur = v) },
          { type: 'range', label: '진하기', min: 0.2, max: 3, step: 0.1, value: 1.4, on: (v) => (dark.value = v) },
        ],
        dispose() {
          rt.dispose();
          rtB.dispose();
          depthM.dispose();
          hB.dispose();
          vB.dispose();
          hud.dispose();
          disposeTree(A.scene, B.scene);
        },
      };
    },
  },

  /* ── i16 HDRI 환경 ── */
  i16: {
    kind: '3d',
    caption: 'HDR 파노라마 하늘(낮 들판 · 노을 바다)을 배경과 반사로 — 왼쪽 조명만, 오른쪽 HDRI 로 금속 · 보석에 진짜 하늘이 비쳐요',
    make() {
      const panos: Pano[] = ['day', 'sunset'];
      const tex = panos.map((p) => panoTex(p));
      const build = (): { scene: THREE.Scene; items: THREE.Object3D[] } => {
        const scene = new THREE.Scene();
        scene.background = tex[0]!;
        scene.add(new THREE.HemisphereLight(0xffffff, 0x606060, 0.5));
        const s = new THREE.DirectionalLight(0xffffff, 1.0);
        s.position.set(3, 4, 2);
        scene.add(s);
        const chrome = mesh(new THREE.SphereGeometry(0.48, 48, 32), std(0xffffff, 0.03, 1), -0.6, 0.5, 0);
        const coins = new THREE.Group();
        const cg = new THREE.CylinderGeometry(0.3, 0.3, 0.08, 40);
        const cm = std(0xffc94a, 0.18, 1);
        for (let i = 0; i < 5; i++) coins.add(mesh(cg, cm, Math.sin(i * 2.3) * 0.03, i * 0.085, Math.cos(i * 1.9) * 0.03));
        coins.position.set(0.62, 0.15, 0);
        const gem = mesh(
          new THREE.IcosahedronGeometry(0.4, 0),
          new THREE.MeshPhysicalMaterial({ color: 0xff7ab8, roughness: 0.02, metalness: 0.1, clearcoat: 1, flatShading: true }),
          -0.55,
          -0.55,
          0.1,
        );
        const cup = mesh(new THREE.TorusKnotGeometry(0.24, 0.08, 100, 14), std(0xdfe8ff, 0.12, 1), 0.62, -0.55, 0);
        scene.add(chrome, coins, gem, cup);
        return { scene, items: [chrome, coins, gem, cup] };
      };
      const A = build();
      const B = build();
      const cam = new THREE.PerspectiveCamera(55, 1, 0.1, 50);
      const hud = new Hud();
      hud.vline(0.5);
      hud.label('조명만', 0.25, 0.95, 0.5, 1);
      hud.label('HDRI 환경', 0.75, 0.95, 0.5, 1, 'on');
      const sky = hud.label('맑은 낮 들판', 0.5, 0.05, 0.5, 0, 'tag', 0.85);
      let envs: { r: R; tex: THREE.Texture[] } | null = null;
      let now = 0;
      let shift = 0;
      let cur = -1;
      return {
        scene: A.scene,
        camera: cam,
        update(t) {
          now = t;
          A.items.forEach((m, i) => (m.rotation.y = t * (0.4 + i * 0.1)));
          B.items.forEach((m, i) => (m.rotation.y = t * (0.4 + i * 0.1)));
        },
        render(r, w, h) {
          if (!envs || envs.r !== r) {
            envs?.tex.forEach((x) => x.dispose());
            const pm = new THREE.PMREMGenerator(r);
            envs = { r, tex: tex.map((x) => pm.fromEquirectangular(x).texture) };
            pm.dispose();
            cur = -1;
          }
          const i = (Math.floor(now / 5) + shift) % panos.length;
          if (i !== cur) {
            cur = i;
            A.scene.background = tex[i]!;
            B.scene.background = tex[i]!;
            B.scene.environment = envs.tex[i]!;
            sky.set(i === 0 ? '맑은 낮 들판' : '노을 바다');
          }
          const a = now * 0.2;
          panels(r, w, h, [{ scene: A.scene }, { scene: B.scene }], (asp) => fit(cam, asp, V3(0, 0, 0), 1.35, V3(Math.sin(a), 0.15, Math.cos(a))));
          hud.draw(r, w, h);
        },
        controls: [
          {
            type: 'button',
            label: '하늘 바꾸기',
            on: () => {
              shift += 1;
            },
          },
          { type: 'range', label: '반사 세기', min: 0, max: 2, step: 0.05, value: 1, on: (v) => (B.scene.environmentIntensity = v) },
        ],
        dispose() {
          envs?.tex.forEach((x) => x.dispose());
          A.scene.background = null;
          B.scene.background = null;
          tex.forEach((x) => x.dispose());
          hud.dispose();
          disposeTree(A.scene, B.scene);
        },
      };
    },
  },
};

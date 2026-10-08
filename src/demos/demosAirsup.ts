import * as THREE from 'three';
import type { Control, DemoMap } from './types';
import { Pipeline, type PipelineOpts } from '../vendor/airsup/render/pipeline';
import { makeNoise3D, NOISE3D } from '../vendor/airsup/core/noise';
import { surf } from '../vendor/airsup/core/materials';
import { CutState } from '../vendor/airsup/core/cut';
import {
  revolve, wall, pipe, bentPath, ringProfile, circleProfile, helixBlade, impellerBlade, SpiralCurve, volute,
  flangeAt, boltCircle, boltGeo, ringMatrices, spline2, rAt, type P2,
} from '../vendor/airsup/core/geometry';
import { fluidMat, FLUID_TIME, type FluidKind } from '../vendor/airsup/engine/fluid';
import { Plume, PHYS } from '../vendor/airsup/engine/plume';
import { GEO } from '../vendor/airsup/engine/raptor';
import { Turbopump } from '../vendor/airsup/pump/turbopump';
import { studioEnvironment } from '../vendor/airsup/scene/room';

/**
 * 「The lab」(AirsupHQ/airsup-lab, MIT) 기술 견본 — i83 ~ i89.
 * 원본 코드는 src/studio/vendor/airsup/ 에 그대로 옮겨 두고(머리 주석 · LICENSE), 여기서는 견본 장면만 짠다.
 *  - 그 파이프라인은 render target 을 여럿 쓰므로 renderer 마다 따로 만든다 (WeakMap). 그린 뒤 renderer 상태를 되돌린다.
 *  - 단면 자르기는 renderer.localClippingEnabled 가 필요 → 그릴 때만 켜고 돌려 놓는다.
 */

type R = THREE.WebGLRenderer;
const FONT = '"Pretendard Variable", system-ui, sans-serif';
const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
const sm = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const ease = (x: number): number => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/* ------------------------------------------------------------------ 공통 도구 */

function ensureNoise(): void {
  if (!NOISE3D.value) NOISE3D.value = makeNoise3D(64);
}

/** 금속이 비출 스튜디오 환경 — renderer 마다 한 번 (PMREM 은 그 renderer 의 GL 자원) */
const ENV = new WeakMap<R, THREE.Texture>();
function envFor(r: R): THREE.Texture {
  let e = ENV.get(r);
  if (!e) {
    e = studioEnvironment(r);
    ENV.set(r, e);
  }
  return e;
}

interface Saved {
  autoClear: boolean;
  clear: THREE.Color;
  alpha: number;
  rt: THREE.WebGLRenderTarget | null;
  clip: boolean;
  sc: boolean;
  vp: THREE.Vector4;
  sb: THREE.Vector4;
  tone: THREE.ToneMapping;
  exp: number;
}
function save(r: R): Saved {
  return {
    autoClear: r.autoClear,
    clear: r.getClearColor(new THREE.Color()),
    alpha: r.getClearAlpha(),
    rt: r.getRenderTarget(),
    clip: r.localClippingEnabled,
    sc: r.getScissorTest(),
    vp: r.getViewport(new THREE.Vector4()),
    sb: r.getScissor(new THREE.Vector4()),
    tone: r.toneMapping,
    exp: r.toneMappingExposure,
  };
}
function restore(r: R, s: Saved): void {
  r.setRenderTarget(s.rt);
  r.autoClear = s.autoClear;
  r.setClearColor(s.clear, s.alpha);
  r.localClippingEnabled = s.clip;
  r.setScissorTest(s.sc);
  r.setViewport(s.vp);
  r.setScissor(s.sb);
  r.toneMapping = s.tone;
  r.toneMappingExposure = s.exp;
}
function guarded(r: R, fn: () => void): void {
  const s = save(r);
  try {
    fn();
  } finally {
    restore(r, s);
  }
}

/** 견본 하나가 쓰는 파이프라인 — renderer 마다 따로, 크기가 바뀌면 setSize */
/** 후처리 통로에 처음 그리기 전, 장면 셰이더를 그 통로의 렌더 타깃 상태로 뒤에서 굽는다 (끝날 때까지 false — 그리지 않음).
 *  그냥 그리면 재질 수십 개를 그 자리에서 컴파일해 1 ~ 2초 멈췄다. 렌더 타깃에 그릴 때는 톤 매핑 · 색공간이 달라 셰이더도 다르다 */
const pipeWarm = new WeakMap<THREE.Scene, 'busy' | 'done'>();
function warmPipe(r: R, p: Pipeline, scene: THREE.Scene, cam: THREE.Camera): boolean {
  const st = pipeWarm.get(scene);
  if (st === 'done') return true;
  if (!st) {
    pipeWarm.set(scene, 'busy');
    const layers = cam.layers.mask;
    cam.layers.enableAll();
    const prev = r.getRenderTarget();
    r.setRenderTarget(p.sceneRT);
    const job = r.compileAsync(scene, cam);
    // 후처리 단계 셰이더(구석 그늘 · 빛 번짐 · 심도 · 합치기)도 — 중간 단계는 렌더 타깃, 마지막은 화면 상태로
    const fx = new THREE.Scene();
    const fxCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quadG = new THREE.PlaneGeometry(2, 2);
    for (const m of [p.gtao, p.aoBlur, p.aoApply, p.composite, p.bloomPre, p.bloomDown, p.bloomUpM, p.dof]) fx.add(new THREE.Mesh(quadG, m));
    const fxJob = r.compileAsync(fx, fxCam);
    r.setRenderTarget(prev);
    const fin = new THREE.Scene();
    fin.add(new THREE.Mesh(quadG, p.final));
    const finJob = r.compileAsync(fin, fxCam);
    cam.layers.mask = layers;
    void Promise.all([job, fxJob, finJob])
      .catch(() => undefined)
      .then(() => {
        quadG.dispose();
        pipeWarm.set(scene, 'done');
      });
  }
  return false;
}

function pipelines(opts: PipelineOpts, tune?: (p: Pipeline) => void): { get(r: R, w: number, h: number): Pipeline; dispose(): void } {
  const map = new WeakMap<R, Pipeline>();
  const all: Pipeline[] = [];
  return {
    get(r, w, h) {
      let p = map.get(r);
      if (!p) {
        // 카드(작은 화면)는 가볍게: MSAA 2배
        p = new Pipeline(r, w * h < 250000 ? { ...opts, msaa: Math.min(opts.msaa, 2), aoSamples: 6 } : opts);
        tune?.(p);
        map.set(r, p);
        all.push(p);
      }
      if (!p.sceneRT || p.w !== w || p.h !== h) p.setSize(w, h);
      return p;
    },
    dispose() {
      for (const p of all) {
        for (const rt of [p.sceneRT, p.aoRT, p.aoTmp, p.plumeRT, p.hdrRT, p.dofRT, ...p.bloom, ...p.bloomUp]) {
          if (!rt) continue;
          rt.depthTexture?.dispose();
          rt.dispose();
        }
        (p.gtao.uniforms['tNoise']?.value as THREE.Texture | null)?.dispose();
        for (const m of [p.gtao, p.aoBlur, p.aoApply, p.composite, p.bloomPre, p.bloomDown, p.bloomUpM, p.dof, p.final]) m.dispose();
        p.quad.dispose();
      }
      all.length = 0;
    },
  };
}

function disposeTree(root: THREE.Object3D): void {
  const mats = new Set<THREE.Material>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    const list = Array.isArray(m.material) ? m.material : [m.material];
    for (const x of list) {
      mats.add(x);
      const back = x.userData['back'] as THREE.Material | undefined;
      if (back) mats.add(back);
    }
    const front = m.userData['front'] as THREE.Material | undefined;
    if (front) mats.add(front);
    if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
  });
  for (const x of mats) {
    const mm = x as THREE.MeshBasicMaterial;
    if (mm.map) mm.map.dispose();
    x.dispose();
  }
}

/** 남색 그러데이션 하늘 공 (깊이를 쓰지 않음 → AO · 심도에서 「먼 배경」) */
function backdrop(stops: [number, string][], radius = 40): THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const lg = g.createLinearGradient(0, 0, 0, 256);
  for (const [o, col] of stops) lg.addColorStop(o, col);
  g.fillStyle = lg;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false, fog: false }));
  m.renderOrder = -1;
  return m;
}

function studioLights(scene: THREE.Scene, k = 1): void {
  const key = new THREE.DirectionalLight(0xfff0dc, 2.0 * k);
  key.position.set(2, 4, 3);
  const rim = new THREE.DirectionalLight(0x9cc4ff, 1.3 * k);
  rim.position.set(-3, 2, -3);
  scene.add(key, rim, new THREE.HemisphereLight(0xbfd6ff, 0x221a14, 0.35 * k));
}

function floorDisc(r = 2.2): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 64), surf({ color: 0x262c38, metalness: 0.05, roughness: 0.7, detail: 1.5, roughVar: 0.18, colorVar: 0.06 }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

/** 화면 위 글씨 · 선 (픽셀 좌표, 왼쪽 위 기준) — 정사영 장면 하나 */
class Label {
  readonly canvas = document.createElement('canvas');
  tex: THREE.CanvasTexture;
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  aspect = 1;
  private key = '';
  constructor() {
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    this.mesh.renderOrder = 10;
  }
  set(text: string, fg = '#ffffff', bg = 'rgba(8,14,30,0.62)', bold = false): void {
    const k = `${text}|${fg}|${bg}|${bold}`;
    if (k === this.key) return;
    this.key = k;
    const F = 40;
    const g0 = this.canvas.getContext('2d')!;
    const font = `${bold ? 800 : 600} ${F}px ${FONT}`;
    g0.font = font;
    const W = Math.ceil(g0.measureText(text).width + F * 1.1);
    const H = Math.ceil(F * 1.55);
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
      this.tex.dispose();
      this.tex = new THREE.CanvasTexture(this.canvas);
    }
    const g = this.canvas.getContext('2d')!;
    g.clearRect(0, 0, W, H);
    if (bg !== 'none') {
      g.fillStyle = bg;
      g.beginPath();
      g.roundRect(1, 1, W - 2, H - 2, H / 2);
      g.fill();
    }
    g.font = font;
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (bg === 'none') {
      g.shadowColor = 'rgba(0,0,0,0.85)';
      g.shadowBlur = 8;
    }
    g.fillText(text, W / 2, H / 2 + F * 0.04);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
    this.tex.needsUpdate = true;
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
  readonly labels: Label[] = [];
  readonly bars: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  w = 1;
  h = 1;
  label(): Label {
    const l = new Label();
    this.labels.push(l);
    this.scene.add(l.mesh);
    return l;
  }
  bar(color = 0xffffff, opacity = 0.9): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, toneMapped: false }));
    m.renderOrder = 9;
    this.bars.push(m);
    this.scene.add(m);
    return m;
  }
  /** 글씨 크기(px)는 화면 높이에 맞춰 */
  get px(): number {
    return clamp(Math.min(this.h * 0.062, this.w * 0.042), 9, 17);
  }
  place(l: Label, x: number, y: number, px = this.px, ax = 0.5, ay = 0.5): void {
    const hh = px * 1.55;
    const ww = hh * l.aspect;
    l.mesh.scale.set(ww, hh, 1);
    l.mesh.position.set(x + (0.5 - ax) * ww, this.h - (y + (0.5 - ay) * hh), 0);
  }
  rect(m: THREE.Mesh, x: number, y: number, w: number, h: number): void {
    m.scale.set(Math.max(w, 0.001), Math.max(h, 0.001), 1);
    m.position.set(x + w / 2, this.h - (y + h / 2), 0);
  }
  begin(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }
  render(r: R): void {
    const c = this.cam;
    c.left = 0;
    c.right = this.w;
    c.top = this.h;
    c.bottom = 0;
    c.updateProjectionMatrix();
    r.setRenderTarget(null);
    r.setViewport(0, 0, this.w, this.h);
    r.setScissorTest(false);
    r.autoClear = false;
    r.render(this.scene, c);
  }
  dispose(): void {
    for (const l of this.labels) l.dispose();
    for (const b of this.bars) {
      b.geometry.dispose();
      b.material.dispose();
    }
  }
}
const _pv = new THREE.Vector3();
function toScreen(p: THREE.Vector3, cam: THREE.Camera, w: number, h: number): [number, number] {
  _pv.copy(p).project(cam);
  return [((_pv.x + 1) / 2) * w, ((1 - _pv.y) / 2) * h];
}

/** 화면 비율이 바뀌어도 (fw × fh) 크기가 다 들어가게 카메라 거리를 맞춘다 */
function fitCamera(cam: THREE.PerspectiveCamera, aspect: number, target: THREE.Vector3, dir: THREE.Vector3, fw: number, fh: number): void {
  const t = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
  const d = Math.max(fh / (2 * t), fw / (2 * t * aspect));
  cam.aspect = aspect;
  cam.updateProjectionMatrix();
  cam.position.copy(target).addScaledVector(dir.clone().normalize(), d);
  cam.lookAt(target);
}

/** CutState 를 일자 ↔ 쐐기로 바꾸기 (원본은 만들 때 정함 — 같은 평면 배열을 재질들이 함께 쓰므로 거기에 더하고 뺀다) */
function setWedge(cut: CutState, a: number): void {
  const on = a > 0;
  const has = cut.planes.length > 1;
  cut.wedge = a;
  if (on && !has) cut.planes.push(cut.world2);
  if (!on && has) cut.planes.length = 1;
  if (!on) cut.uPlane2.value.set(0, 0, 0, -1);
  if (on !== has)
    for (const m of cut.materials)
      for (const x of [m, m.userData['back'] as THREE.Material | undefined]) {
        if (!x) continue;
        x.clipIntersection = on;
        x.needsUpdate = true;
      }
}

/** 원본 turbopump 를 옆으로 눕혀 받침대 위에 (원본 main.ts 와 같은 자세) */
function pumpRig(): { scene: THREE.Scene; pump: Turbopump; stand: THREE.Group; floor: THREE.Mesh; sky: THREE.Mesh } {
  ensureNoise();
  const scene = new THREE.Scene();
  const pump = new Turbopump();
  pump.root.rotation.z = -Math.PI / 2;
  pump.root.position.set(0, 0.362, 0);
  const stand = new THREE.Group();
  stand.add(pump.root);
  scene.add(stand);
  const floor = floorDisc(2.4);
  const sky = backdrop([[0, '#24375e'], [0.5, '#121c33'], [1, '#070b14']]);
  scene.add(floor, sky);
  studioLights(scene);
  return { scene, pump, stand, floor, sky };
}

/* ------------------------------------------------------------------ 엔진 노즐 (원본 GEO 윤곽 + 원본 모델링 도구) */

interface EngineMats {
  nozzle: THREE.Material;
  cast: THREE.Material;
  machined: THREE.Material;
  dark: THREE.Material;
  printed: THREE.Material;
}
function wearMats(cut: CutState | null = null): EngineMats & { nozzleU: Record<string, { value: unknown }> } {
  const cap = 0xb4b9bf;
  const nozzle = surf({
    name: 'nozzle', color: 0x5f6267, metalness: 1, roughness: 0.44, detail: 1.3, roughVar: 0.28, colorVar: 0.05, bump: 0.0002, streaks: 0.28,
    tint: { y0: GEO.yE, y1: GEO.yT, a: 0x34477e, b: 0x6b5a78, c: 0xb58a4a, strength: 0.6 },
    ribs: [220, 0.00035], cut, capColor: cap,
  });
  return {
    nozzle,
    nozzleU: nozzle.userData['u'] as Record<string, { value: unknown }>,
    cast: surf({ color: 0xa3a8ae, metalness: 1, roughness: 0.44, detail: 1.1, roughVar: 0.22, colorVar: 0.035, bump: 0.00012, cut, capColor: cap }),
    machined: surf({ color: 0xc4c8cd, metalness: 1, roughness: 0.3, detail: 3, roughVar: 0.15, colorVar: 0.02, anisotropy: 0.5, cut, capColor: 0xb9bdc3 }),
    dark: surf({ color: 0x34373c, metalness: 0.9, roughness: 0.4, detail: 9, roughVar: 0.3, cut, capColor: 0x8a8f96 }),
    printed: surf({ color: 0xa9adb3, metalness: 1, roughness: 0.5, detail: 1.2, roughVar: 0.22, colorVar: 0.035, layers: [2300, 0.00004], bump: 0.00015, cut, capColor: cap }),
  };
}
function plainMats(): EngineMats {
  const std = (color: number, metalness: number, roughness: number): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, metalness, roughness });
  return { nozzle: std(0x5f6267, 1, 0.44), cast: std(0xa3a8ae, 1, 0.44), machined: std(0xc4c8cd, 1, 0.3), dark: std(0x34373c, 0.9, 0.4), printed: std(0xa9adb3, 1, 0.5) };
}

/** 추력실 — 노즐 종 · 연소실 · 이음 고리와 볼트 · 매니폴드 · 위 동력부 · 옆 냉각 관 */
function buildEngine(M: EngineMats, segs = 128): THREE.Group {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh => {
    const mesh = new THREE.Mesh(geo, m);
    g.add(mesh);
    return mesh;
  };
  const yJ = GEO.yT - 0.3;
  const outer = (y: number): number => GEO.Rin(y) + 0.024 + 0.03 * sm(GEO.yT - 0.3, GEO.yT + 0.06, y);
  add(revolve(wall(GEO.Rin, outer, GEO.yE, yJ, 160), segs, 30), M.nozzle);
  const bulk = spline2([[0.34, -0.07], [0.322, -0.15], [0.282, -0.28], [0.236, GEO.yT + 0.03], [0.215, GEO.yT - 0.1], [outer(yJ) + 0.014, yJ]], 10);
  const outerC = (y: number): number => Math.max(outer(y), rAt(bulk, y));
  const ch: P2[] = [];
  for (let i = 0; i <= 80; i++) {
    const y = yJ + ((-0.075 - yJ) * i) / 80;
    ch.push([outerC(y), y]);
  }
  ch.push([0.363, -0.056], [0.375, -0.046], [0.375, -0.006], [0.369, 0], [GEO.Rin(0), 0]);
  for (let i = 0; i <= 80; i++) {
    const y = (yJ * i) / 80;
    ch.push([GEO.Rin(y), y]);
  }
  add(revolve(ch, segs, 30), M.cast);
  const rj = outer(yJ);
  add(revolve(ringProfile(rj - 0.004, rj + 0.034, yJ - 0.016, yJ + 0.016, 0.004), segs), M.machined);
  const bolts = (count: number, r: number, y: number, size: number, down: boolean): void => {
    const mats = ringMatrices(count, r, y, 0.03, down ? new THREE.Euler(Math.PI, 0, 0) : undefined);
    const im = new THREE.InstancedMesh(boltGeo(size, size * 1.1), M.dark, mats.length);
    mats.forEach((mm, i) => im.setMatrixAt(i, mm));
    g.add(im);
  };
  bolts(36, rj + 0.022, yJ - 0.016, 0.0075, true);
  add(revolve(circleProfile(GEO.Re + 0.035, GEO.yE + 0.004, 0.012, 18), segs), M.nozzle);
  const yM = GEO.yE + 0.19;
  add(revolve(circleProfile(outer(yM) + 0.03, yM, 0.032, 20), segs), M.cast);
  // 위: 3D 프린트 동력부 (층 무늬) + 플랜지 볼트
  add(revolve(spline2([[0.001, 0], [0.33, 0], [0.33, 0.05], [0.26, 0.1], [0.2, 0.28], [0.15, 0.5], [0.19, 0.56], [0.19, 0.66], [0.001, 0.68]], 8), segs), M.printed);
  bolts(24, 0.35, 0, 0.008, false);
  // 옆 냉각 관: 매니폴드 → 위
  const c = bentPath([[outer(yM) + 0.03, yM + 0.02, 0.05], [0.42, yM + 0.12, 0.08], [0.46, -0.6, 0.12], [0.36, -0.1, 0.14], [0.22, 0.3, 0.1]], 0.12);
  add(pipe(c, { r: 0.022, ri: 0.016, tubular: 90, radial: 16 }), M.machined);
  return g;
}

/* ================================================================== 견본 */

export const DEMOS: DemoMap = {
  /* ------------------------------------------------------------ i83 직접 짠 렌더 파이프라인 */
  i83: {
    kind: '3d',
    caption: '왼쪽 일반 렌더 · 오른쪽 직접 짠 파이프라인 — 구석 그늘 · 빛 번짐 · 색 보정 · 비네트 · 필름 결',
    make() {
      const { scene, pump, stand } = pumpRig();
      setWedge(pump.cut, Math.PI / 4);
      pump.cut.collect(pump.root);
      // 빛 번짐이 잘 보이게 — 받침대 위 표시등 (HDR 밝기)
      const glowM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.6, 3.2) });
      for (const [x, z] of [[-0.42, 0.22], [0.5, 0.22]] as [number, number][]) {
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.014, 16, 10), glowM);
        led.position.set(x, 0.03, z);
        stand.add(led);
      }
      const cam = new THREE.PerspectiveCamera(32, 1.6, 0.05, 60);
      const target = new THREE.Vector3(0.04, 0.36, 0);
      const dir = new THREE.Vector3(0.3, 0.42, 1);
      const P = pipelines({ ao: true, msaa: 4, aoSamples: 8 });
      const opt = { bloom: 0.14, vignette: 0.55, grain: 0.03, ca: 0.012, dof: 16, wipe: true };
      const hud = new Hud();
      const lA = hud.label();
      const lB = hud.label();
      const line = hud.bar(0xffffff, 0.85);
      let time = 0;
      return {
        scene,
        camera: cam,
        update(t, dt) {
          time = t;
          FLUID_TIME.value = t;
          stand.rotation.y = Math.sin(t * 0.25) * 0.45 - 0.15;
          pump.cut.amount = 1;
          pump.cut.update();
          pump.update(dt, t, 0.35, 0, false, 0);
        },
        render(r, w, h) {
          guarded(r, () => {
            scene.environment = envFor(r);
            r.localClippingEnabled = true;
            fitCamera(cam, w / h, target, dir, 1.45, 1.0);
            const p = P.get(r, w, h);
            Object.assign(p.params, { bloom: opt.bloom, vignette: opt.vignette, grain: opt.grain, ca: opt.ca, dofAperture: opt.dof, dofFocus: cam.position.distanceTo(target), bloomThreshold: 0.75 });
            const split = Math.round(w * (opt.wipe ? 0.5 + 0.22 * Math.sin(time * 0.6) : 0.5));
            r.setRenderTarget(null);
            r.setViewport(0, 0, w, h);
            r.setScissorTest(true);
            r.setScissor(split, 0, w - split, h);
            if (warmPipe(r, p, scene, cam)) p.render(scene, cam, null, time);
            // 왼쪽: 같은 장면을 그냥 한 번 (톤 매핑만)
            r.setRenderTarget(null);
            r.setViewport(0, 0, w, h);
            r.setScissorTest(true);
            r.setScissor(0, 0, split, h);
            r.toneMapping = THREE.ACESFilmicToneMapping;
            r.toneMappingExposure = 1;
            r.autoClear = false;
            r.setClearColor(0x0a0f1c, 1);
            r.clear();
            cam.layers.enableAll();
            r.render(scene, cam);
            cam.layers.set(0);
            hud.begin(w, h);
            lA.set('일반 렌더');
            lB.set('직접 짠 파이프라인', '#ffe7a8');
            const m = hud.px * 0.7;
            hud.place(lA, m, m, hud.px, 0, 0);
            hud.place(lB, w - m, m, hud.px, 1, 0);
            hud.rect(line, split - 1, 0, 2, h);
            hud.render(r);
          });
        },
        controls: [
          { type: 'range', label: '빛 번짐 (bloom)', min: 0, max: 0.5, step: 0.01, value: opt.bloom, on: (v) => (opt.bloom = v) },
          { type: 'range', label: '비네트', min: 0, max: 1.2, step: 0.05, value: opt.vignette, on: (v) => (opt.vignette = v) },
          { type: 'range', label: '필름 결', min: 0, max: 0.12, step: 0.005, value: opt.grain, on: (v) => (opt.grain = v) },
          { type: 'range', label: '색수차', min: 0, max: 0.06, step: 0.002, value: opt.ca, on: (v) => (opt.ca = v) },
          { type: 'range', label: '깊이 심도 (조리개)', min: 0, max: 60, step: 1, value: opt.dof, on: (v) => (opt.dof = v) },
          { type: 'toggle', label: '나누는 선 움직이기', value: true, on: (v) => (opt.wipe = v) },
        ] satisfies Control[],
        dispose() {
          P.dispose();
          hud.dispose();
          disposeTree(scene);
        },
      };
    },
  },

  /* ------------------------------------------------------------ i84 절차 마모 재질 */
  i84: {
    kind: '3d',
    caption: '왼쪽 그냥 금속 · 오른쪽 절차 마모 — 거칠기 얼룩 · 그을음 줄 · 노즐 끝 열 변색(파랑 → 금색)',
    make() {
      ensureNoise();
      const mk = (wear: boolean): { scene: THREE.Scene; eng: THREE.Group; mats: EngineMats } => {
        const scene = new THREE.Scene();
        const mats = wear ? wearMats() : plainMats();
        const eng = buildEngine(mats, 112);
        scene.add(eng, backdrop([[0, '#2a3f6a'], [0.55, '#131d36'], [1, '#080c16']]));
        studioLights(scene, 0.9);
        return { scene, eng, mats };
      };
      const A = mk(false);
      const B = mk(true);
      const wm = B.mats as ReturnType<typeof wearMats>;
      const U = wm.nozzleU;
      const base = { roughVar: 0.28, colorVar: 0.05, streaks: 0.28 };
      const set = { heat: 0.6, wear: 1 };
      const apply = (): void => {
        (U['uTintRange']!.value as THREE.Vector3).z = set.heat;
        const d = U['uDetail']!.value as THREE.Vector4;
        d.y = base.roughVar * set.wear * 1.4;
        d.z = base.colorVar * set.wear * 1.6;
        U['uStreaks']!.value = base.streaks * set.wear * 1.3;
      };
      apply();
      let autoHeat = true;
      const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 60);
      const target = new THREE.Vector3(0, -0.72, 0);
      const dir = new THREE.Vector3(0.15, 0.12, 1);
      const hud = new Hud();
      const lA = hud.label();
      const lB = hud.label();
      const line = hud.bar(0xffffff, 0.8);
      return {
        scene: B.scene,
        camera: cam,
        update(t) {
          for (const S of [A, B]) S.eng.rotation.y = t * 0.35;
          if (!autoHeat) return;
          set.heat = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(t * 0.7));
          apply();
        },
        render(r, w, h) {
          guarded(r, () => {
            const env = envFor(r);
            A.scene.environment = env;
            B.scene.environment = env;
            const half = Math.round(w / 2);
            fitCamera(cam, half / h, target, dir, 1.9, 3.25);
            r.toneMapping = THREE.ACESFilmicToneMapping;
            r.toneMappingExposure = 1.05;
            r.setRenderTarget(null);
            r.setScissorTest(true);
            r.autoClear = true;
            r.setViewport(0, 0, half, h);
            r.setScissor(0, 0, half, h);
            r.render(A.scene, cam);
            r.setViewport(half, 0, w - half, h);
            r.setScissor(half, 0, w - half, h);
            r.render(B.scene, cam);
            hud.begin(w, h);
            lA.set('일반 재질');
            lB.set('절차 마모 재질', '#ffe7a8');
            const m = hud.px * 0.6;
            hud.place(lA, m, m, hud.px, 0, 0);
            hud.place(lB, w - m, m, hud.px, 1, 0);
            hud.rect(line, half - 1, 0, 2, h);
            hud.render(r);
          });
        },
        controls: [
          { type: 'range', label: '열 변색', min: 0, max: 1, step: 0.02, value: 0.6, on: (v) => { autoHeat = false; set.heat = v; apply(); } },
          { type: 'range', label: '마모 세기', min: 0, max: 2, step: 0.05, value: 1, on: (v) => { set.wear = v; apply(); } },
          { type: 'toggle', label: '열 자동으로 오르내리기', value: true, on: (v) => (autoHeat = v) },
        ] satisfies Control[],
        dispose() {
          hud.dispose();
          disposeTree(A.scene);
          disposeTree(B.scene);
        },
      };
    },
  },

  /* ------------------------------------------------------------ i85 뚜껑 없는 단면 */
  i85: {
    kind: '3d',
    caption: '칼(자르기 평면)이 쓸고 지나가며 펌프 속이 열려요 — 뚜껑 모형 없이 뒷면을 「쇠 단면」으로 칠함 (일자 ↔ 쐐기)',
    make() {
      const { scene, pump, stand } = pumpRig();
      pump.cut.collect(pump.root);
      const cam = new THREE.PerspectiveCamera(32, 1.6, 0.05, 60);
      const target = new THREE.Vector3(0.04, 0.36, 0);
      const dir = new THREE.Vector3(0.3, 0.38, 1);
      const P = pipelines({ ao: true, msaa: 4, aoSamples: 8 });
      const hud = new Hud();
      const lMode = hud.label();
      const lNote = hud.label();
      const st = { auto: true, amount: 0.7, wedge: false };
      let time = 0;
      let shownWedge = false;
      return {
        scene,
        camera: cam,
        update(t, dt) {
          time = t;
          FLUID_TIME.value = t;
          let a = st.amount;
          let wedge = st.wedge;
          if (st.auto) {
            const C = 9;
            const u = (t % C) / C;
            a = u < 0.08 ? 0 : u < 0.4 ? ease((u - 0.08) / 0.32) : u < 0.76 ? 1 : u < 0.96 ? 1 - ease((u - 0.76) / 0.2) : 0;
            wedge = Math.floor(t / C) % 2 === 1;
          }
          if (wedge !== shownWedge) {
            setWedge(pump.cut, wedge ? Math.PI / 4 : 0);
            shownWedge = wedge;
          }
          stand.rotation.y = Math.sin(t * 0.3) * 0.3 - 0.1;
          pump.cut.amount = a;
          pump.cut.update();
          pump.update(dt, t, 0.3, 0, false, 0);
        },
        render(r, w, h) {
          guarded(r, () => {
            scene.environment = envFor(r);
            r.localClippingEnabled = true;
            fitCamera(cam, w / h, target, dir, 1.4, 0.95);
            const p = P.get(r, w, h);
            Object.assign(p.params, { bloom: 0.1, bloomThreshold: 0.8, vignette: 0.5, grain: 0.015, ca: 0.004 });
            r.setRenderTarget(null);
            r.setViewport(0, 0, w, h);
            r.setScissorTest(false);
            if (warmPipe(r, p, scene, cam)) p.render(scene, cam, null, time);
            hud.begin(w, h);
            lMode.set(shownWedge ? '쐐기 자르기 (¼ 열기)' : '일자 자르기 (반 열기)', '#bfe6ff');
            const m = hud.px * 0.6;
            hud.place(lMode, m, m, hud.px, 0, 0);
            if (w > 420) {
              lNote.set('뚜껑 모형 0개 · 잘린 곳의 뒷면 = 평평한 금속 단면', '#ffffff', 'rgba(8,14,30,0.5)');
              hud.place(lNote, w / 2, h - m, hud.px * 0.85, 0.5, 1);
              lNote.mesh.visible = true;
            } else lNote.mesh.visible = false;
            hud.render(r);
          });
        },
        controls: [
          { type: 'toggle', label: '자동으로 쓸기', value: true, on: (v) => (st.auto = v) },
          { type: 'range', label: '자른 정도 (자동 끄면)', min: 0, max: 1, step: 0.01, value: 0.7, on: (v) => { st.amount = v; st.auto = false; } },
          { type: 'toggle', label: '쐐기 모양 (자동 끄면)', value: false, on: (v) => { st.wedge = v; } },
        ] satisfies Control[],
        dispose() {
          P.dispose();
          hud.dispose();
          disposeTree(scene);
        },
      };
    },
  },

  /* ------------------------------------------------------------ i86 관 따라 흐르는 물질 */
  i86: {
    kind: '3d',
    caption: '관 속 「시작부터 거리」로 펄스가 흘러요 — 산소(파랑) · 메탄(주황), 하나를 따라가면 탱크부터 불꽃까지 그 길만 빛나요',
    make() {
      ensureNoise();
      const scene = new THREE.Scene();
      const root = new THREE.Group();
      scene.add(root);
      const cut = new CutState(root, 1.2, 0);
      const emph: Record<'lox' | 'ch4' | 'fire', { value: number }> = { lox: { value: 1 }, ch4: { value: 1 }, fire: { value: 1 } };
      const rate = { value: 1 };
      const on = { value: 1 };
      const cap = 0xc3c7cd;
      const M = {
        steel: surf({ color: 0xc4c8cd, metalness: 1, roughness: 0.3, detail: 3, roughVar: 0.15, cut, capColor: cap }),
        cast: surf({ color: 0xa3a8ae, metalness: 1, roughness: 0.44, detail: 1.6, roughVar: 0.22, colorVar: 0.04, cut, capColor: cap }),
        blueTank: surf({ color: 0x6f8fb8, metalness: 0.6, roughness: 0.38, detail: 2, roughVar: 0.2, colorVar: 0.05, cut, capColor: cap }),
        orangeTank: surf({ color: 0xb98a5a, metalness: 0.6, roughness: 0.38, detail: 2, roughVar: 0.2, colorVar: 0.05, cut, capColor: cap }),
        hot: surf({ color: 0x6a6c72, metalness: 1, roughness: 0.42, detail: 2, roughVar: 0.25, cut, capColor: 0xc97c50, tint: { y0: -0.62, y1: -0.12, a: 0x34477e, b: 0x6b5a78, c: 0xb58a4a, strength: 0.55 } }),
        dark: surf({ color: 0x34373c, metalness: 0.9, roughness: 0.4, detail: 9, cut, capColor: 0x8a8f96 }),
      };
      const add = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0): THREE.Mesh => {
        const mesh = new THREE.Mesh(g, m);
        mesh.position.set(x, y, 0);
        root.add(mesh);
        return mesh;
      };
      const fluid = (g: THREE.BufferGeometry, kind: FluidKind & ('lox' | 'ch4' | 'fire'), mode: 0 | 1 | 2 | 3 | 4, x = 0, y = 0, extra: { scale?: number; speed?: number; intensity?: number; gas?: boolean } = {}): void => {
        const m = fluidMat(cut, { kind, mode, rate, on, emph: emph[kind], ...extra });
        const mesh = new THREE.Mesh(g, m);
        mesh.position.set(x, y, 0);
        mesh.layers.set(m.userData['gas'] ? 1 : 2);
        mesh.userData['fluid'] = kind;
        root.add(mesh);
      };
      // 탱크 (속 빈 캡슐) + 안의 액체
      const capsule = (r: number, hh: number, n = 14): P2[] => {
        const o: P2[] = [];
        for (let i = 0; i <= n; i++) {
          const a = -Math.PI / 2 + (Math.PI / 2) * (i / n);
          o.push([r * Math.cos(a), -hh + r * Math.sin(a)]);
        }
        for (let i = 0; i <= n; i++) {
          const a = (Math.PI / 2) * (i / n);
          o.push([r * Math.cos(a), hh + r * Math.sin(a)]);
        }
        return o;
      };
      const tank = (x: number, y: number, r: number, hh: number, kind: 'lox' | 'ch4', mat: THREE.Material): void => {
        const out = capsule(r, hh);
        const inn = capsule(r - 0.018, hh).reverse();
        add(revolve([...out, ...inn], 64), mat, x, y);
        fluid(revolve(capsule(r - 0.019, hh), 48), kind, 2, x, y, { scale: 0.09, speed: 0.6, gas: false });
      };
      tank(-1.15, 0.38, 0.24, 0.16, 'lox', M.blueTank);
      tank(-1.15, -0.5, 0.22, 0.12, 'ch4', M.orangeTank);
      // 연소실 + 노즐 (원본 GEO 윤곽을 0.32 배)
      const S = 0.32;
      const rin = (y: number): number => S * GEO.Rin(y / S);
      const yE = S * GEO.yE;
      const CX = 0.95;
      const CY = 0.22;
      add(revolve(wall(rin, (y) => rin(y) + 0.02, yE, 0, 120), 72, 30), M.hot, CX, CY);
      add(revolve(ringProfile(0, rin(0) + 0.03, 0, 0.05, 0.006), 64), M.steel, CX, CY);
      const firePts: P2[] = [[0, yE]];
      for (let i = 0; i <= 60; i++) {
        const y = yE + ((0 - yE) * i) / 60;
        firePts.push([rin(y) - 0.002, y]);
      }
      firePts.push([0, 0]);
      fluid(revolve(firePts, 64), 'fire', 2, CX, CY, { scale: 0.08, speed: 2.2, intensity: 0.9, gas: true });
      const rE = rin(yE);
      fluid(revolve([[0, yE], [rE, yE], [rE * 1.25, yE - 0.18], [rE * 0.9, yE - 0.42], [0, yE - 0.5]], 48), 'fire', 2, CX, CY, { scale: 0.1, speed: 2.6, intensity: 0.55, gas: true });
      // 관: 같은 평면(z = 0) 위에, 속 빈 관 + 그 속 액체 (aS = 시작부터 거리)
      const line = (pts: [number, number, number][], kind: 'lox' | 'ch4'): void => {
        const c = bentPath(pts, 0.12);
        add(pipe(c, { r: 0.05, ri: 0.037, tubular: 220, radial: 20 }), M.steel);
        fluid(pipe(c, { r: 0.036, tubular: 220, radial: 14 }), kind, 0, 0, 0, { scale: 0.11, speed: 1.4, intensity: 1.9, gas: false });
        // 밸브 (플랜지 두 장 + 볼트)
        const mid = c.getPointAt(0.18);
        const tg = c.getTangentAt(0.18);
        for (const s of [-0.018, 0.018]) {
          const p = mid.clone().addScaledVector(tg, s);
          add(flangeAt(p, tg, 0.036, 0.085, 0.014), M.cast);
        }
        const im = new THREE.InstancedMesh(boltGeo(1, 1.1), M.dark, 8);
        boltCircle(mid.clone().addScaledVector(tg, 0.026), tg, 0.068, 8, 0.008).forEach((mm, i) => im.setMatrixAt(i, mm));
        root.add(im);
      };
      line([[-0.92, 0.38, 0], [0.2, 0.38, 0], [0.2, 0.62, 0], [0.88, 0.62, 0], [0.88, CY + 0.05, 0]], 'lox');
      line([[-0.94, -0.5, 0], [1.42, -0.5, 0], [1.42, 0.7, 0], [1.02, 0.7, 0], [1.02, CY + 0.05, 0]], 'ch4');
      cut.collect(root);
      const floor = floorDisc(3);
      floor.position.y = -0.8;
      scene.add(floor, backdrop([[0, '#22355c'], [0.5, '#111a30'], [1, '#070b14']]));
      studioLights(scene);

      const cam = new THREE.PerspectiveCamera(30, 1.6, 0.05, 60);
      const target = new THREE.Vector3(0.1, 0.02, 0);
      const dir = new THREE.Vector3(0.12, 0.22, 1);
      const P = pipelines({ ao: true, msaa: 4, aoSamples: 8 }, (p) => (p.params.aoRadius = 0.14));
      const hud = new Hud();
      const lMode = hud.label();
      const tags = { lox: hud.label(), ch4: hud.label(), fire: hud.label() };
      const st = { auto: true, follow: 'all' as 'all' | 'lox' | 'ch4', speed: 1 };
      let time = 0;
      let follow: 'all' | 'lox' | 'ch4' = 'all';
      const approach = (u: { value: number }, to: number, dt: number): void => {
        u.value += (to - u.value) * (1 - Math.exp(-dt * 4));
      };
      const NAME = { all: '모두 흐름', lox: '산소 따라가기', ch4: '메탄 따라가기' };
      return {
        scene,
        camera: cam,
        update(t, dt) {
          time = t;
          FLUID_TIME.value = t;
          follow = st.auto ? (['all', 'lox', 'ch4'] as const)[Math.floor(t / 3.2) % 3]! : st.follow;
          approach(emph.lox, follow === 'all' ? 1 : follow === 'lox' ? 1.8 : 0.08, dt);
          approach(emph.ch4, follow === 'all' ? 1 : follow === 'ch4' ? 1.8 : 0.08, dt);
          approach(emph.fire, follow === 'all' ? 1 : 1.3, dt);
          rate.value = st.speed;
          cut.amount = 1;
          cut.update();
        },
        render(r, w, h) {
          guarded(r, () => {
            scene.environment = envFor(r);
            r.localClippingEnabled = true;
            fitCamera(cam, w / h, target, dir, 3.35, 2.05);
            const p = P.get(r, w, h);
            Object.assign(p.params, { bloom: 0.16, bloomThreshold: 0.7, vignette: 0.5, grain: 0.015, ca: 0.004 });
            r.setRenderTarget(null);
            r.setViewport(0, 0, w, h);
            r.setScissorTest(false);
            if (warmPipe(r, p, scene, cam)) p.render(scene, cam, null, time);
            hud.begin(w, h);
            lMode.set(NAME[follow], follow === 'lox' ? '#9fe0ff' : follow === 'ch4' ? '#ffc98a' : '#ffffff');
            const m = hud.px * 0.6;
            hud.place(lMode, m, m, hud.px, 0, 0);
            const at = (l: Label, x: number, y: number, text: string, col: string, lit: boolean): void => {
              l.set(text, lit ? col : 'rgba(255,255,255,0.55)', 'rgba(8,14,30,0.55)');
              const [sx, sy] = toScreen(new THREE.Vector3(x, y, 0), cam, w, h);
              hud.place(l, sx, sy, hud.px * 0.85);
            };
            const big = w > 420;
            for (const l of Object.values(tags)) l.mesh.visible = big;
            if (big) {
              at(tags.lox, -1.15, 0.86, '산소 탱크', '#9fe0ff', follow !== 'ch4');
              at(tags.ch4, -1.15, -0.92, '메탄 탱크', '#ffc98a', follow !== 'lox');
              at(tags.fire, CX + 0.4, yE + CY - 0.3, '불꽃', '#ffd9a8', true);
            }
            hud.render(r);
          });
        },
        controls: [
          { type: 'toggle', label: '자동으로 바꿔 따라가기', value: true, on: (v) => (st.auto = v) },
          { type: 'button', label: '모두', on: () => { st.auto = false; st.follow = 'all'; } },
          { type: 'button', label: '산소 따라가기', on: () => { st.auto = false; st.follow = 'lox'; } },
          { type: 'button', label: '메탄 따라가기', on: () => { st.auto = false; st.follow = 'ch4'; } },
          { type: 'range', label: '흐름 빠르기', min: 0, max: 3, step: 0.1, value: 1, on: (v) => (st.speed = v) },
        ] satisfies Control[],
        dispose() {
          P.dispose();
          hud.dispose();
          disposeTree(scene);
        },
      };
    },
  },

  /* ------------------------------------------------------------ i87 실제 수치 물리 + 부피 배기 */
  i87: {
    kind: '3d',
    caption: '공개 수치로 계산한 압력비 — 고도가 오르면 바깥 기압이 지수로 줄어 배기가 부풀고, 마하 다이아몬드 간격이 바뀌어요',
    make() {
      ensureNoise();
      const scene = new THREE.Scene();
      const engine = new THREE.Group();
      engine.rotation.z = Math.PI / 2; // 엔진 +Y → 왼쪽, 배기는 오른쪽(+X)으로
      engine.position.set(-1.6, 0, 0);
      scene.add(engine);
      const wm = wearMats();
      (wm.nozzleU['uTintRange']!.value as THREE.Vector3).z = 0.75;
      engine.add(buildEngine(wm, 96));
      const plume = new Plume(engine, scene);
      plume.material.uniforms['uSteps']!.value = 40;
      const sky = backdrop([[0, '#0b1a3a'], [0.5, '#1f3b6c'], [0.62, '#2d4f80'], [1, '#0b1222']], 50);
      scene.add(sky);
      studioLights(scene, 0.8);
      const cam = new THREE.PerspectiveCamera(30, 1.6, 0.1, 80);
      const target = new THREE.Vector3(2.1, 0, 0);
      const dir = new THREE.Vector3(-0.12, 0.16, 1);
      const P = pipelines({ ao: false, msaa: 4 }, (p) => {
        p.plumeScale = 0.5;
      });
      const hud = new Hud();
      const lAlt = hud.label();
      const lPhys = hud.label();
      const lState = hud.label();
      const st = { auto: true, alt: 0, thr: 1 };
      let time = 0;
      let alt = 0;
      return {
        scene,
        camera: cam,
        update(t, dt) {
          time = t;
          if (st.auto) {
            const u = (t % 18) / 18;
            alt = 32 * (u < 0.5 ? ease(u * 2) : 1 - ease((u - 0.5) * 2));
          } else alt = st.alt;
          plume.update(Math.min(dt, 0.05), t, st.thr, alt, 1);
          const k = clamp(1 - alt / 60, 0.08, 1);
          sky.material.color.setRGB(k, k, k * 0.95 + 0.05);
        },
        render(r, w, h) {
          guarded(r, () => {
            scene.environment = envFor(r);
            fitCamera(cam, w / h, target, dir, 8.6, 3.6);
            plume.material.uniforms['uSteps']!.value = w * h < 250000 ? 28 : 48;
            const p = P.get(r, w, h);
            Object.assign(p.params, { bloom: 0.12, bloomThreshold: 0.8, vignette: 0.45, grain: 0.012, ca: 0.003, haze: 0.012 });
            r.setRenderTarget(null);
            r.setViewport(0, 0, w, h);
            r.setScissorTest(false);
            if (warmPipe(r, p, scene, cam)) p.render(scene, cam, plume, time);
            const s = PHYS.state(st.thr, alt);
            hud.begin(w, h);
            const m = hud.px * 0.6;
            lAlt.set(`고도 ${alt.toFixed(0)} km · 출력 ${(st.thr * 100).toFixed(0)}%`, '#ffffff');
            hud.place(lAlt, m, m, hud.px, 0, 0);
            const ratio = s.n;
            const state = ratio < 0.97 ? '과팽창 — 바깥 기압에 눌려 충격 다이아몬드' : ratio < 1.1 ? '적정 팽창 — 곧게 뻗어요' : ratio < 120 ? '부족 팽창 — 배기가 부풀어요' : '거의 진공 — 넓게 퍼지는 희미한 배기';
            lState.set(state, ratio < 0.97 ? '#ffd9a8' : ratio < 1.1 ? '#c8ffd0' : '#cdbbff', 'rgba(8,14,30,0.55)');
            hud.place(lState, m, h - m, hud.px * 0.9, 0, 1);
            if (w > 420) {
              lPhys.set(`바깥 기압 ${s.pa.toFixed(3)} bar · 출구 압력 ${s.pe.toFixed(2)} bar · 압력비 ${ratio.toFixed(2)} · 추력 ${s.thrust.toFixed(0)} tf`, '#e8f0ff', 'rgba(8,14,30,0.55)');
              hud.place(lPhys, w - m, m, hud.px * 0.85, 1, 0);
              lPhys.mesh.visible = true;
            } else lPhys.mesh.visible = false;
            hud.render(r);
          });
        },
        controls: [
          { type: 'toggle', label: '고도 자동으로 오르내리기', value: true, on: (v) => (st.auto = v) },
          { type: 'range', label: '고도 (km)', min: 0, max: 80, step: 1, value: 0, on: (v) => { st.auto = false; st.alt = v; } },
          { type: 'range', label: '출력 (스로틀)', min: 0.4, max: 1, step: 0.01, value: 1, on: (v) => (st.thr = v) },
        ] satisfies Control[],
        dispose() {
          P.dispose();
          hud.dispose();
          disposeTree(scene);
          for (const l of plume.lights) l.dispose();
        },
      };
    },
  },

  /* ------------------------------------------------------------ i88 절차 기계 모델링 도구 */
  i88: {
    kind: '3d',
    caption: '모델 파일 0개 — 단면 돌리기 · 곡선 따라 관 · 나선 인듀서 · 원심 임펠러 · 볼류트 · 플랜지와 볼트 원을 코드로',
    make() {
      ensureNoise();
      const scene = new THREE.Scene();
      const M = {
        steel: surf({ color: 0xc4c8cd, metalness: 1, roughness: 0.3, detail: 3, roughVar: 0.15, anisotropy: 0.5 }),
        cast: surf({ color: 0xa3a8ae, metalness: 1, roughness: 0.44, detail: 1.1, roughVar: 0.22, colorVar: 0.035, bump: 0.00012 }),
        rotor: surf({ color: 0xc2c6cc, metalness: 1, roughness: 0.24, detail: 6, roughVar: 0.25, side: THREE.DoubleSide }),
        gold: surf({ color: 0xc9a045, metalness: 1, roughness: 0.3, detail: 8 }),
        dark: surf({ color: 0x34373c, metalness: 0.9, roughness: 0.4, detail: 9 }),
        nozzle: surf({ color: 0x5f6267, metalness: 1, roughness: 0.44, detail: 1.3, roughVar: 0.28, colorVar: 0.05, streaks: 0.28, ribs: [220, 0.00035], tint: { y0: GEO.yE, y1: GEO.yT, a: 0x34477e, b: 0x6b5a78, c: 0xb58a4a, strength: 0.6 } }),
        ped: surf({ color: 0x2a3140, metalness: 0.3, roughness: 0.5, detail: 4 }),
      };
      const mesh = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D): THREE.Mesh => {
        const x = new THREE.Mesh(g, m);
        parent.add(x);
        return x;
      };
      const inst = (g: THREE.BufferGeometry, m: THREE.Material, mats: THREE.Matrix4[], parent: THREE.Object3D): void => {
        const im = new THREE.InstancedMesh(g, m, mats.length);
        mats.forEach((mm, i) => im.setMatrixAt(i, mm));
        im.computeBoundingBox();
        parent.add(im);
      };
      const items: { name: string; obj: THREE.Group }[] = [];
      const item = (name: string, build: (g: THREE.Group) => void): void => {
        const g = new THREE.Group();
        build(g);
        items.push({ name, obj: g });
      };
      item('회전체 (revolve)', (g) => {
        mesh(revolve(wall(GEO.Rin, (y) => GEO.Rin(y) + 0.03, GEO.yE, 0, 140), 96, 30), M.nozzle, g);
        mesh(revolve(ringProfile(GEO.Rin(0) - 0.01, 0.34, 0, 0.06, 0.008), 96), M.steel, g);
      });
      item('관 (pipe · 닫힌 끝)', (g) => {
        const c = bentPath([[-0.2, 0, -0.1], [-0.2, 0.26, -0.1], [0.14, 0.26, -0.1], [0.14, 0.26, 0.16], [0.14, 0.48, 0.16]], 0.08);
        mesh(pipe(c, { r: 0.04, ri: 0.03, tubular: 120, radial: 24 }), M.steel, g);
        const c2 = bentPath([[0.2, 0, 0.1], [0.2, 0.16, 0.1], [-0.1, 0.16, 0.1], [-0.1, 0.4, -0.05]], 0.07);
        mesh(pipe(c2, { r: 0.026, ri: 0.019, tubular: 90, radial: 18 }), M.gold, g);
      });
      item('나선 인듀서', (g) => {
        mesh(revolve([[0, 0.22], [0.036, 0.22], [0.036, 0.36], [0.026, 0.375], [0.01, 0.385], [0, 0.386]], 64), M.rotor, g);
        for (let k = 0; k < 3; k++) mesh(helixBlade(0.03, 0.094, 0.25, 0.345, 0.55, 0.005, (k / 3) * Math.PI * 2), M.rotor, g);
      });
      item('원심 임펠러', (g) => {
        mesh(revolve(spline2([[0.036, 0.232], [0.05, 0.2], [0.09, 0.168], [0.15, 0.158], [0.158, 0.162], [0.158, 0.156], [0.036, 0.15]], 6), 128), M.rotor, g);
        mesh(revolve([[0, 0.15], [0.036, 0.15], [0.036, 0.25], [0.02, 0.262], [0, 0.264]], 48), M.steel, g);
        for (let i = 0; i < 8; i++) mesh(impellerBlade(0.05, 0.156, 0.226, 0.236, 0.162, 0.19, -1.2, 0.006, (i / 8) * Math.PI * 2), M.rotor, g);
        for (let i = 0; i < 8; i++) mesh(impellerBlade(0.1, 0.156, 0.19, 0.2, 0.162, 0.19, -0.7, 0.005, ((i + 0.5) / 8) * Math.PI * 2 - 0.25), M.rotor, g);
      });
      item('나선 볼류트', (g) => {
        const c = new SpiralCurve(0, 0.16, 0.02, 0.07, 0, 0.94, 0.2);
        mesh(volute(c, 0.012, 160, 28).shell, M.cast, g);
        mesh(revolve(ringProfile(0.06, 0.17, -0.03, 0.0, 0.004), 96), M.cast, g);
      });
      item('플랜지 + 볼트 원', (g) => {
        const up = new THREE.Vector3(0, 1, 0);
        const c = bentPath([[0, 0.02, 0], [0, 0.2, 0]], 0.05);
        mesh(pipe(c, { r: 0.07, ri: 0.058, tubular: 8, radial: 40 }), M.steel, g);
        for (const y of [0.02, 0.2]) {
          const p = new THREE.Vector3(0, y, 0);
          mesh(flangeAt(p, up, 0.058, 0.15, 0.024), M.cast, g);
          inst(boltGeo(1, 1.1), M.dark, boltCircle(p.clone().add(new THREE.Vector3(0, 0.012, 0)), up, 0.118, 10, 0.011), g);
        }
        mesh(revolve(circleProfile(0.075, 0.11, 0.008, 12), 64), M.gold, g);
      });
      // 3 × 2 로 늘어놓기 — 모두 같은 크기로 맞춘 받침대 위에서 빙글
      const pivots: THREE.Group[] = [];
      const anchors: THREE.Vector3[] = [];
      const box = new THREE.Box3();
      const size = new THREE.Vector3();
      const ctr = new THREE.Vector3();
      items.forEach((it, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = (col - 1) * 0.82;
        const z = (row - 0.5) * 0.9;
        const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.29, 0.05, 48), M.ped);
        pedestal.position.set(x, 0.025, z);
        scene.add(pedestal);
        box.setFromObject(it.obj);
        box.getSize(size);
        box.getCenter(ctr);
        const k = 0.42 / Math.max(size.x, size.y, size.z);
        it.obj.scale.setScalar(k);
        it.obj.position.set(-ctr.x * k, -box.min.y * k, -ctr.z * k);
        const pv = new THREE.Group();
        pv.position.set(x, 0.05, z);
        pv.add(it.obj);
        scene.add(pv);
        pivots.push(pv);
        anchors.push(new THREE.Vector3(x, 0.0, z + 0.33));
      });
      const floor = floorDisc(4.5);
      scene.add(floor, backdrop([[0, '#253a63'], [0.5, '#121c33'], [1, '#070b14']]));
      studioLights(scene);
      const cam = new THREE.PerspectiveCamera(30, 1.6, 0.05, 60);
      const target = new THREE.Vector3(0, 0.2, 0.02);
      const dir = new THREE.Vector3(0, 0.95, 1);
      const P = pipelines({ ao: true, msaa: 4, aoSamples: 8 }, (p) => (p.params.aoRadius = 0.06));
      const hud = new Hud();
      const tags = items.map(() => hud.label());
      const st = { spin: 0.6 };
      let time = 0;
      let hi = 0;
      return {
        scene,
        camera: cam,
        update(t) {
          time = t;
          hi = Math.floor(t / 2.2) % items.length;
          pivots.forEach((p, i) => {
            p.rotation.y = t * st.spin + i * 1.1;
            const lift = i === hi ? sm(0, 0.4, (t % 2.2)) * (1 - sm(1.8, 2.2, t % 2.2)) : 0;
            p.position.y = 0.05 + lift * 0.06;
          });
        },
        render(r, w, h) {
          guarded(r, () => {
            scene.environment = envFor(r);
            fitCamera(cam, w / h, target, dir, 2.75, 1.75);
            const p = P.get(r, w, h);
            Object.assign(p.params, { bloom: 0.06, vignette: 0.5, grain: 0.012, ca: 0.003 });
            r.setRenderTarget(null);
            r.setViewport(0, 0, w, h);
            r.setScissorTest(false);
            if (warmPipe(r, p, scene, cam)) p.render(scene, cam, null, time);
            hud.begin(w, h);
            items.forEach((it, i) => {
              const l = tags[i]!;
              const lit = i === hi;
              l.set(w > 420 || lit ? it.name : it.name.split(' ')[0]!, lit ? '#ffe7a8' : '#ffffff', lit ? 'rgba(60,40,8,0.7)' : 'rgba(8,14,30,0.55)', lit);
              const [sx, sy] = toScreen(anchors[i]!, cam, w, h);
              hud.place(l, sx, sy, hud.px * (w > 420 ? 0.8 : 0.72));
            });
            hud.render(r);
          });
        },
        controls: [{ type: 'range', label: '돌리는 빠르기', min: 0, max: 2, step: 0.05, value: 0.6, on: (v) => (st.spin = v) }] satisfies Control[],
        dispose() {
          P.dispose();
          hud.dispose();
          disposeTree(scene);
        },
      };
    },
  },

  /* ------------------------------------------------------------ i89 감독 투어 + 프레임 단위 녹화 */
  i89: {
    kind: '2d',
    caption: '대본(카메라 구도 · 커서 이동 · 실제 클릭)을 1/60초씩 진행하며 한 장씩 찍어 ffmpeg 로 — 느린 컴퓨터도 끊김 없는 영상',
    make() {
      type Shot = { n: string; t: number; d: number; cx: number; cy: number; z: number; col: string };
      const SHOTS: Shot[] = [
        { n: 'hero', t: 0, d: 0.01, cx: 52, cy: 30, z: 1, col: '#5b8def' },
        { n: 'cut', t: 2.4, d: 1.6, cx: 50, cy: 30, z: 1.55, col: '#45c3a4' },
        { n: 'ox', t: 5.0, d: 1.5, cx: 30, cy: 22, z: 2.1, col: '#46c8ff' },
        { n: 'ch4', t: 7.6, d: 1.5, cx: 30, cy: 38, z: 2.1, col: '#ffa23a' },
        { n: 'fire', t: 10.2, d: 1.5, cx: 62, cy: 30, z: 2.2, col: '#ff6a5a' },
        { n: 'plume', t: 12.8, d: 1.6, cx: 76, cy: 30, z: 1.35, col: '#b48cff' },
        { n: 'hero', t: 15.4, d: 1.6, cx: 52, cy: 30, z: 1, col: '#5b8def' },
      ];
      const BTN = ['전체', '단면', '산소', '메탄', '불꽃'];
      const CLICKS: { t: number; b: number }[] = [
        { t: 2.3, b: 1 },
        { t: 4.9, b: 2 },
        { t: 7.5, b: 3 },
        { t: 10.1, b: 4 },
        { t: 15.3, b: 0 },
      ];
      const DUR = 18;
      const FPS = 60;
      const TOTAL = DUR * FPS;
      const SLOW = 0.42; // 느린 컴퓨터: 실제 1초에 영상 0.42초만 찍힘
      let pace = SLOW;
      let T0 = 0;
      let lastT = 0;
      const st = { show: true };
      const camAt = (T: number): { cx: number; cy: number; z: number; shot: Shot } => {
        let prev = SHOTS[0]!;
        let cur = SHOTS[0]!;
        for (let i = 0; i < SHOTS.length; i++) if (SHOTS[i]!.t <= T) {
          cur = SHOTS[i]!;
          prev = SHOTS[Math.max(0, i - 1)]!;
        }
        const k = ease(clamp((T - cur.t) / cur.d, 0, 1));
        return { cx: prev.cx + (cur.cx - prev.cx) * k, cy: prev.cy + (cur.cy - prev.cy) * k, z: prev.z + (cur.z - prev.z) * k, shot: cur };
      };
      const stateAt = (T: number): { view: number; follow: number } => {
        let view = 0;
        let follow = -1;
        for (const c of CLICKS) {
          if (c.t > T) break;
          if (c.b <= 1) view = c.b;
          if (c.b === 0) follow = -1;
          if (c.b >= 2) follow = c.b;
          if (c.b >= 2) view = 1;
        }
        return { view, follow };
      };
      const rr = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void => {
        g.beginPath();
        g.roundRect(x, y, w, h, r);
      };
      return {
        draw(g, w, h, t) {
          if (t < lastT) T0 = t;
          lastT = t;
          const tv = ((t - T0) * pace) % DUR;
          const frame = Math.floor(tv * FPS);
          const T = frame / FPS; // 화면은 프레임 단위로 딱딱 넘어간다
          const small = w < 420;
          const U = clamp(Math.min(w / 300, h / 190), 0.85, 3.2);
          const f = (px: number, bold = false): string => `${bold ? 800 : 600} ${px * U}px ${FONT}`;
          // 바탕
          const bg = g.createLinearGradient(0, 0, 0, h);
          bg.addColorStop(0, '#16233f');
          bg.addColorStop(1, '#0a1020');
          g.fillStyle = bg;
          g.fillRect(0, 0, w, h);
          const pad = 6 * U;
          const tlH = h * (small ? 0.3 : 0.27);
          const S = { x: pad, y: pad, w: w * (small ? 0.64 : 0.6), h: h - tlH - pad * 3 };
          const Rx = S.x + S.w + pad;
          const Rw = w - Rx - pad;

          /* ---------- 화면: 시뮬레이션 + 카메라 구도 + 커서 ---------- */
          g.save();
          rr(g, S.x, S.y, S.w, S.h, 6 * U);
          g.clip();
          const sg = g.createLinearGradient(0, S.y, 0, S.y + S.h);
          sg.addColorStop(0, '#22345a');
          sg.addColorStop(1, '#0e1628');
          g.fillStyle = sg;
          g.fillRect(S.x, S.y, S.w, S.h);
          const cam = camAt(T);
          const { view, follow } = stateAt(T);
          const k = (S.w / 100) * cam.z;
          g.save();
          g.translate(S.x + S.w / 2, S.y + S.h * 0.44);
          g.scale(k, k);
          g.translate(-cam.cx, -cam.cy);
          // 탱크
          const dimOf = (b: number): number => (follow < 0 || follow === b ? 1 : 0.25);
          const tank = (x: number, y: number, col: string, a: number): void => {
            g.globalAlpha = 0.35 + 0.65 * a;
            g.fillStyle = col;
            rr(g, x - 6, y - 7, 12, 14, 5);
            g.fill();
            g.globalAlpha = 1;
          };
          tank(12, 20, '#4f86c8', dimOf(2));
          tank(12, 40, '#c8874f', dimOf(3));
          // 관 + 흐르는 펄스
          const flow = (pts: [number, number][], col: string, a: number): void => {
            g.lineCap = 'round';
            g.lineJoin = 'round';
            g.strokeStyle = '#8b93a1';
            g.lineWidth = 3.2;
            g.beginPath();
            pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
            g.stroke();
            if (view === 1) {
              g.strokeStyle = col;
              g.globalAlpha = 0.25 + 0.75 * a;
              g.lineWidth = 1.8;
              g.setLineDash([2.2, 2.2]);
              g.lineDashOffset = -T * 9;
              g.stroke();
              g.setLineDash([]);
              g.globalAlpha = 1;
            }
          };
          flow([[18, 20], [40, 20], [40, 26], [47, 26]], '#46c8ff', dimOf(2));
          flow([[18, 40], [40, 40], [40, 34], [47, 34]], '#ffa23a', dimOf(3));
          // 엔진 (연소실 + 목 + 노즐 종)
          const engine = new Path2D('M46 23 L56 23 Q58 23 59 27 L60 28.5 Q61 25 70 20 L70 40 Q61 35 60 31.5 L59 33 Q58 37 56 37 L46 37 Z');
          g.fillStyle = '#9aa1ac';
          g.fill(engine);
          if (view === 1) {
            g.fillStyle = '#d4d8de';
            g.fill(new Path2D('M46 30 L56 30 L59 30 L60 30 L70 30 L70 40 Q61 35 60 31.5 L59 33 Q58 37 56 37 L46 37 Z'));
            g.fillStyle = `rgba(255,${follow === 4 ? 200 : 150},90,${follow < 0 || follow === 4 ? 0.95 : 0.35})`;
            g.fill(new Path2D('M47 31 L56 31 L59.2 31 L60 31 L69 31 L69 38 Q61 34 60 32 L59 33.5 Q58 36 56 36 L47 36 Z'));
          }
          // 배기 + 다이아몬드
          const pa = follow < 0 || follow === 4 ? 1 : 0.4;
          const pl = g.createLinearGradient(70, 0, 100, 0);
          pl.addColorStop(0, `rgba(180,150,255,${0.75 * pa})`);
          pl.addColorStop(1, 'rgba(180,150,255,0)');
          g.fillStyle = pl;
          g.beginPath();
          g.moveTo(70, 21);
          g.quadraticCurveTo(85, 23, 100, 25);
          g.lineTo(100, 35);
          g.quadraticCurveTo(85, 37, 70, 39);
          g.fill();
          for (let i = 0; i < 4; i++) {
            g.fillStyle = `rgba(255,236,210,${(0.9 - i * 0.18) * pa})`;
            g.beginPath();
            g.ellipse(75 + i * 6.5, 30, 1.6 - i * 0.2, 2.6 - i * 0.35, 0, 0, Math.PI * 2);
            g.fill();
          }
          g.restore();
          // 구도 이름
          g.font = f(8.5, true);
          g.textBaseline = 'top';
          g.fillStyle = 'rgba(8,14,30,0.6)';
          const tag = `카메라 구도 · ${cam.shot.n}`;
          const tw = g.measureText(tag).width;
          rr(g, S.x + 5 * U, S.y + 5 * U, tw + 10 * U, 14 * U, 7 * U);
          g.fill();
          g.fillStyle = cam.shot.col;
          g.fillText(tag, S.x + 10 * U, S.y + 7.5 * U);
          // 단추 줄
          const bw = Math.min(40 * U, (S.w - 12 * U) / BTN.length - 3 * U);
          const bh = 13 * U;
          const by = S.y + S.h - bh - 6 * U;
          const bx0 = S.x + (S.w - (bw + 3 * U) * BTN.length + 3 * U) / 2;
          const btnC = (i: number): [number, number] => [bx0 + i * (bw + 3 * U) + bw / 2, by + bh / 2];
          g.font = f(7.5, true);
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          BTN.forEach((b, i) => {
            const on = (i <= 1 && view === i && follow < 0) || (i <= 1 && i === 1 && view === 1) || (i >= 2 && follow === i);
            g.fillStyle = on ? '#ffd166' : 'rgba(255,255,255,0.13)';
            rr(g, bx0 + i * (bw + 3 * U), by, bw, bh, bh / 2);
            g.fill();
            g.fillStyle = on ? '#2a1c00' : '#e8eefc';
            g.fillText(b, btnC(i)[0], btnC(i)[1] + 0.5);
          });
          g.textAlign = 'left';
          // 커서: 클릭 0.7초 전부터 그 단추로 이동
          let cx = S.x + S.w * 0.9;
          let cy = S.y + S.h * 1.1;
          for (const c of CLICKS) {
            const [tx, ty] = btnC(c.b);
            if (T >= c.t) {
              cx = tx;
              cy = ty;
            } else if (T > c.t - 0.7) {
              const q = ease((T - (c.t - 0.7)) / 0.7);
              cx += (tx - cx) * q;
              cy += (ty - cy) * q;
              break;
            } else break;
          }
          if (T > 1.6 && T < 16.6) {
            for (const c of CLICKS) {
              const a = T - c.t;
              if (a < 0 || a > 0.45) continue;
              g.strokeStyle = `rgba(255,255,255,${1 - a / 0.45})`;
              g.lineWidth = 2 * U;
              g.beginPath();
              g.arc(cx, cy, (5 + a * 40) * U, 0, Math.PI * 2);
              g.stroke();
            }
            g.save();
            g.translate(cx, cy);
            g.scale(U * 0.75, U * 0.75);
            g.fillStyle = '#fff';
            g.strokeStyle = '#0b0f17';
            g.lineWidth = 1.3;
            const ar = new Path2D('M2 1.5v16.2l4.3-4.1 2.9 6.6 2.7-1.2-2.9-6.5h6.1z');
            g.fill(ar);
            g.stroke(ar);
            g.restore();
          }
          g.restore();
          g.strokeStyle = 'rgba(255,255,255,0.25)';
          g.lineWidth = 1;
          rr(g, S.x + 0.5, S.y + 0.5, S.w - 1, S.h - 1, 6 * U);
          g.stroke();

          /* ---------- 오른쪽: 녹화 사슬 ---------- */
          g.font = f(8.5, true);
          g.textBaseline = 'top';
          g.fillStyle = '#ffe7a8';
          g.fillText('프레임 단위 녹화', Rx, S.y + 1);
          const steps = small ? ['frame(1/60초)', '찍기', 'ffmpeg'] : ['대본 한 칸 진행', 'frame(1/60초)', '화면 찍기 (JPEG)', 'ffmpeg → mp4'];
          const chainY = S.y + 16 * U;
          const sh = 13 * U;
          const gap = 5 * U;
          const ph = (tv * FPS) % 1;
          steps.forEach((s, i) => {
            const y = chainY + i * (sh + gap);
            const act = Math.floor(ph * steps.length) === i;
            g.fillStyle = act ? 'rgba(255,209,102,0.95)' : 'rgba(255,255,255,0.1)';
            rr(g, Rx, y, Rw, sh, 4 * U);
            g.fill();
            g.fillStyle = act ? '#2a1c00' : '#dfe7f7';
            g.font = f(7.2, true);
            g.textBaseline = 'middle';
            g.fillText(s, Rx + 5 * U, y + sh / 2 + 0.5);
            if (i < steps.length - 1) {
              g.fillStyle = 'rgba(255,255,255,0.4)';
              g.beginPath();
              g.moveTo(Rx + Rw / 2 - 3 * U, y + sh + 1);
              g.lineTo(Rx + Rw / 2 + 3 * U, y + sh + 1);
              g.lineTo(Rx + Rw / 2, y + sh + gap - 1);
              g.fill();
            }
          });
          let y2 = chainY + steps.length * (sh + gap) + 2 * U;
          g.textBaseline = 'top';
          g.font = f(11, true);
          g.fillStyle = '#ffffff';
          g.fillText(`${String(frame).padStart(4, '0')} / ${TOTAL}`, Rx, y2);
          y2 += 14 * U;
          g.font = f(7, false);
          g.fillStyle = '#9fb3d9';
          g.fillText(`영상 ${T.toFixed(2)}초`, Rx, y2);
          y2 += 10 * U;
          g.fillStyle = '#ffb3a8';
          g.fillText(`실제 ${(T / pace).toFixed(1)}초 걸림`, Rx, y2);
          y2 += 12 * U;
          // 필름 띠: 방금 찍은 프레임들 (모두 같은 1/60초 간격)
          if (y2 + 14 * U < S.y + S.h) {
            const n = small ? 4 : 6;
            const fw = (Rw - (n - 1) * 2 * U) / n;
            const fh = Math.min(fw * 0.62, S.y + S.h - y2);
            for (let i = 0; i < n; i++) {
              const fr = frame - (n - 1 - i);
              if (fr < 0) continue;
              const shot = camAt(fr / FPS).shot;
              const x = Rx + i * (fw + 2 * U);
              g.fillStyle = shot.col;
              g.globalAlpha = i === n - 1 ? 1 : 0.55;
              rr(g, x, y2, fw, fh, 2 * U);
              g.fill();
              g.globalAlpha = 1;
              if (!small && fh > 10 * U) {
                g.font = f(5.5, true);
                g.fillStyle = '#0a1020';
                g.fillText(String(fr), x + 2 * U, y2 + 2 * U);
              }
            }
          }

          /* ---------- 아래: 타임라인 ---------- */
          const TL = { x: pad + 30 * U, y: h - tlH - pad * 0.5, w: w - pad * 2 - 30 * U, h: tlH };
          const X = (s: number): number => TL.x + (s / DUR) * TL.w;
          const rowH = TL.h / 3.2;
          g.font = f(7, true);
          g.textBaseline = 'middle';
          g.fillStyle = '#9fb3d9';
          g.fillText('카메라', pad, TL.y + rowH * 0.5);
          g.fillText('커서', pad, TL.y + rowH * 1.5);
          g.fillText('시간', pad, TL.y + rowH * 2.5);
          SHOTS.forEach((s, i) => {
            const end = i + 1 < SHOTS.length ? SHOTS[i + 1]!.t : DUR;
            const x0 = X(s.t);
            const x1 = X(end);
            g.fillStyle = s.col;
            g.globalAlpha = T >= s.t && T < end ? 1 : 0.45;
            rr(g, x0 + 1, TL.y + 2, x1 - x0 - 2, rowH - 4, 3 * U);
            g.fill();
            g.globalAlpha = 1;
            if (x1 - x0 > 24 * U) {
              g.fillStyle = '#0a1020';
              g.font = f(6.5, true);
              g.fillText(s.n, x0 + 4 * U, TL.y + rowH / 2);
            }
            // 이동 구간 (빗금)
            g.fillStyle = 'rgba(255,255,255,0.35)';
            g.fillRect(x0 + 1, TL.y + rowH - 5, Math.max(1, X(s.t + s.d) - x0 - 1), 2);
          });
          for (const c of CLICKS) {
            g.strokeStyle = 'rgba(255,255,255,0.45)';
            g.lineWidth = 2 * U;
            g.beginPath();
            g.moveTo(X(c.t - 0.7), TL.y + rowH * 1.5);
            g.lineTo(X(c.t), TL.y + rowH * 1.5);
            g.stroke();
            const x = X(c.t);
            const yy = TL.y + rowH * 1.5;
            g.fillStyle = T >= c.t ? '#ffd166' : 'rgba(255,209,102,0.45)';
            g.beginPath();
            g.moveTo(x, yy - 4 * U);
            g.lineTo(x + 4 * U, yy);
            g.lineTo(x, yy + 4 * U);
            g.lineTo(x - 4 * U, yy);
            g.fill();
            if (!small) {
              g.font = f(6, true);
              g.fillStyle = '#ffe7a8';
              g.fillText(BTN[c.b]!, x + 6 * U, yy);
            }
          }
          // 눈금: 1초마다, 프레임 눈금은 크게 볼 때만
          g.fillStyle = 'rgba(255,255,255,0.5)';
          for (let s = 0; s <= DUR; s++) {
            const x = X(s);
            g.fillRect(x, TL.y + rowH * 2.1, 1, s % 5 === 0 ? 7 * U : 4 * U);
            if (s % 5 === 0) {
              g.font = f(6, false);
              g.fillText(`${s}s`, x + 2, TL.y + rowH * 2.75);
            }
          }
          if (!small) {
            g.fillStyle = 'rgba(255,255,255,0.18)';
            const fx = TL.w / TOTAL;
            if (fx * 6 > 1.5) for (let i = 0; i <= TOTAL; i += 6) g.fillRect(X(i / FPS), TL.y + rowH * 2.1, 1, 2 * U);
          }
          // 재생 머리
          const px = X(T);
          g.fillStyle = '#ff5a6a';
          g.fillRect(px - 1, TL.y - 2, 2, TL.h * 0.95);
          g.beginPath();
          g.moveTo(px - 4 * U, TL.y - 4);
          g.lineTo(px + 4 * U, TL.y - 4);
          g.lineTo(px, TL.y + 2);
          g.fill();
          if (st.show && !small) {
            g.font = f(6.5, true);
            g.fillStyle = '#ffb3c0';
            g.textBaseline = 'bottom';
            g.fillText(`frame ${frame}`, Math.min(px + 4 * U, w - 50 * U), TL.y - 3);
          }
        },
        controls: [
          { type: 'range', label: '컴퓨터 빠르기 (실제 1초에 찍는 영상 초)', min: 0.1, max: 1, step: 0.02, value: SLOW, on: (v) => (pace = v) },
          { type: 'toggle', label: '재생 머리에 프레임 번호', value: true, on: (v) => (st.show = v) },
        ] satisfies Control[],
      };
    },
  },
};

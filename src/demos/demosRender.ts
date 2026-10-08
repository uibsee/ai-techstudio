import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import type { DemoMap, Scene3D } from './types';

/**
 * 하드서피스 · 실사 렌더링 (2) — 무료 CC0 스캔 재질(Poly Haven)로 디테일을 끝까지 끌어올리기.
 * i474 실사 PBR 텍스처 단계 · i475 HDRI 환경 빛 · i477 디아블로풍 던전 조명 · i478 LOD · 텍스처 예산 · i479 데칼.
 *
 * 텍스처는 한 번만 받아(ImageBitmap — 해독은 브라우저 일꾼이) 모든 견본이 같이 쓴다.
 * 반복(repeat)이 다른 복사본은 같은 Source 를 가리켜 GPU 에는 한 장만 올라간다.
 * 그리기 전에: 텍스처 올리기(프레임당 3ms 까지) → compileAsync(병렬 컴파일) → 그 뒤부터 그림.
 */

type R = THREE.WebGLRenderer;
const FONT = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const fmt = (n: number): string => Math.round(n).toLocaleString('ko-KR');

/* ───────────── 무료 재질 받기 (한 번만, 모두 같이) ───────────── */

export type SetId = 'rock' | 'brick' | 'planks' | 'metal';
type Kind = 'diff' | 'nor' | 'arm';
const SETS: SetId[] = ['rock', 'brick', 'planks', 'metal'];

const SRC: Record<SetId, Record<Kind, string>> = {
  rock: {
    diff: new URL('../assets/polyhaven/rock_tile_floor_diff_1k.jpg', import.meta.url).href,
    nor: new URL('../assets/polyhaven/rock_tile_floor_nor_gl_1k.jpg', import.meta.url).href,
    arm: new URL('../assets/polyhaven/rock_tile_floor_arm_1k.jpg', import.meta.url).href,
  },
  brick: {
    diff: new URL('../assets/polyhaven/castle_brick_07_diff_1k.jpg', import.meta.url).href,
    nor: new URL('../assets/polyhaven/castle_brick_07_nor_gl_1k.jpg', import.meta.url).href,
    arm: new URL('../assets/polyhaven/castle_brick_07_arm_1k.jpg', import.meta.url).href,
  },
  planks: {
    diff: new URL('../assets/polyhaven/worn_planks_diff_1k.jpg', import.meta.url).href,
    nor: new URL('../assets/polyhaven/worn_planks_nor_gl_1k.jpg', import.meta.url).href,
    arm: new URL('../assets/polyhaven/worn_planks_arm_1k.jpg', import.meta.url).href,
  },
  metal: {
    diff: new URL('../assets/polyhaven/metal_plate_diff_1k.jpg', import.meta.url).href,
    nor: new URL('../assets/polyhaven/metal_plate_nor_gl_1k.jpg', import.meta.url).href,
    arm: new URL('../assets/polyhaven/metal_plate_arm_1k.jpg', import.meta.url).href,
  },
};
const HDR_URL = new URL('../assets/polyhaven/studio_small_09_1k.hdr', import.meta.url).href;
/** 1k jpg 실제 파일 크기 (KB) — 예산 표 */
const KB1K: Record<SetId, Record<Kind, number>> = {
  rock: { diff: 1106, nor: 1032, arm: 716 },
  brick: { diff: 643, nor: 976, arm: 261 },
  planks: { diff: 921, nor: 444, arm: 912 },
  metal: { diff: 676, nor: 752, arm: 981 },
};

const bmpCache = new Map<string, Promise<ImageBitmap | null>>();
/** 1024 는 파일 그대로, 512 · 256 은 1024 를 브라우저가 줄인 것 */
function bitmap(set: SetId, kind: Kind, size = 1024): Promise<ImageBitmap | null> {
  const key = `${set}:${kind}:${size}`;
  let p = bmpCache.get(key);
  if (!p) {
    p =
      size === 1024
        ? fetch(SRC[set][kind])
            .then((r) => {
              if (!r.ok) throw new Error(String(r.status));
              return r.blob();
            })
            .then((b) => createImageBitmap(b, { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' }))
        : bitmap(set, kind, 1024).then((b) =>
            b ? createImageBitmap(b, { resizeWidth: size, resizeHeight: size, resizeQuality: 'high', premultiplyAlpha: 'none', colorSpaceConversion: 'none' }) : null,
          );
    p = p.catch((e) => {
      console.warn('[studio] 재질을 못 받았어요', key, e);
      return null;
    });
    bmpCache.set(key, p);
  }
  return p;
}

export interface PBR {
  set: SetId;
  size: number;
  map: THREE.Texture;
  normal: THREE.Texture;
  arm: THREE.Texture;
  /** 색 지도의 평균색 — 「단색」 단계 */
  avg: THREE.Color;
}
function texFrom(img: ImageBitmap | null, kind: Kind): THREE.Texture {
  let t: THREE.Texture;
  if (img) t = new THREE.Texture(img);
  else {
    // 못 받았을 때 — 멈추지 않게 무난한 1×1 로
    const px = kind === 'diff' ? [128, 120, 110, 255] : kind === 'nor' ? [128, 128, 255, 255] : [255, 190, 0, 255];
    t = new THREE.DataTexture(new Uint8Array(px), 1, 1);
  }
  t.flipY = false;
  t.colorSpace = kind === 'diff' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 16; // 렌더러가 최대치로 잘라 쓴다
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}
function avgColor(img: ImageBitmap | null): THREE.Color {
  const c = new THREE.Color(0x807870);
  if (!img) return c;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const g = cv.getContext('2d')!;
  g.drawImage(img, 0, 0, 1, 1);
  const d = g.getImageData(0, 0, 1, 1).data;
  return c.setRGB(d[0]! / 255, d[1]! / 255, d[2]! / 255, THREE.SRGBColorSpace);
}
const pbrCache = new Map<string, Promise<PBR>>();
function loadPBR(set: SetId, size = 1024): Promise<PBR> {
  const key = `${set}:${size}`;
  let p = pbrCache.get(key);
  if (!p) {
    p = Promise.all([bitmap(set, 'diff', size), bitmap(set, 'nor', size), bitmap(set, 'arm', size)]).then(([d, n, a]) => ({
      set,
      size,
      map: texFrom(d, 'diff'),
      normal: texFrom(n, 'nor'),
      arm: texFrom(a, 'arm'),
      avg: avgColor(d),
    }));
    pbrCache.set(key, p);
  }
  return p;
}
let hdrP: Promise<THREE.DataTexture | null> | null = null;
function loadHDR(): Promise<THREE.DataTexture | null> {
  hdrP ??= new HDRLoader()
    .loadAsync(HDR_URL)
    .then((t) => {
      t.mapping = THREE.EquirectangularReflectionMapping;
      return t;
    })
    .catch((e) => {
      console.warn('[studio] HDRI 를 못 받았어요', e);
      return null;
    });
  return hdrP;
}
interface Kit {
  pbr: Record<SetId, PBR>;
  hdr: THREE.DataTexture | null;
}
let kitP: Promise<Kit> | null = null;
function loadKit(): Promise<Kit> {
  kitP ??= Promise.all([...SETS.map((s) => loadPBR(s)), loadHDR()]).then((a) => ({
    pbr: { rock: a[0] as PBR, brick: a[1] as PBR, planks: a[2] as PBR, metal: a[3] as PBR },
    hdr: a[4] as THREE.DataTexture | null,
  }));
  return kitP;
}
/** 같은 그림(Source)을 쓰는 반복만 다른 복사본 — GPU 에 다시 올리지 않는다 */
function rep(t: THREE.Texture, x: number, y = x): THREE.Texture {
  const c = new THREE.Texture();
  c.source = t.source;
  c.flipY = t.flipY;
  c.colorSpace = t.colorSpace;
  c.wrapS = c.wrapT = THREE.RepeatWrapping;
  c.anisotropy = t.anisotropy;
  c.generateMipmaps = t.generateMipmaps;
  c.minFilter = t.minFilter;
  c.repeat.set(x, y);
  c.version = Math.max(1, t.version); // needsUpdate 를 켜면 같은 Source 를 다시 올리므로 판(version)만 맞춘다
  return c;
}
/** 실사 PBR 재질 — arm 한 장이 AO(R) · 거칠기(G) · 금속(B) 셋을 맡는다 */
function pbrMat(p: PBR, rx: number, ry = rx, o: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const arm = rep(p.arm, rx, ry);
  return new THREE.MeshStandardMaterial({
    map: rep(p.map, rx, ry),
    normalMap: rep(p.normal, rx, ry),
    aoMap: arm,
    roughnessMap: arm,
    metalnessMap: arm,
    roughness: 1,
    metalness: 1,
    ...o,
  });
}

/**
 * PMREM 은 렌더러마다 한 번 — 모든 견본이 같이 쓴다.
 * PMREM 의 흐림 · GGX 셰이더는 윈도(D3D)에서 동기 컴파일이 400ms 넘게 걸려, 먼저 compileAsync 로 병렬 컴파일한 뒤 굽는다.
 * 굽는 동안은 null — 견본은 「빛 굽는 중」 화면을 보인다 (env 없이 셰이더를 구우면 나중에 다시 컴파일되므로).
 */
interface PmremPriv {
  _setSize(n: number): void;
  _allocateTargets(): THREE.WebGLRenderTarget;
  _compileMaterial(m: THREE.Material): void;
  _blurMaterial: THREE.Material | null;
  _ggxMaterial: THREE.Material | null;
  _equirectMaterial: THREE.Material | null;
  compileEquirectangularShader(): void;
}
const pmrems = new WeakMap<R, THREE.Texture | 'busy'>();
function envFor(r: R, hdr: THREE.DataTexture): THREE.Texture | null {
  const e = pmrems.get(r);
  if (e === 'busy') return null;
  if (e) return e;
  pmrems.set(r, 'busy');
  const pm = new THREE.PMREMGenerator(r);
  const pv = pm as unknown as PmremPriv;
  let target: THREE.WebGLRenderTarget | null = null;
  let warm: Promise<unknown> = Promise.resolve();
  try {
    pv._setSize(hdr.image.width / 4);
    target = pv._allocateTargets();
    const real = pv._compileMaterial;
    pv._compileMaterial = () => {}; // 재질만 만들고 동기 컴파일은 건너뛴다
    pv.compileEquirectangularShader();
    pv._compileMaterial = real;
    const sc = new THREE.Scene();
    const geo = new THREE.BufferGeometry();
    for (const m of [pv._equirectMaterial, pv._blurMaterial, pv._ggxMaterial]) if (m) sc.add(new THREE.Mesh(geo, m));
    const old = r.getRenderTarget();
    r.setRenderTarget(target); // 실제로 그릴 곳(반정밀 렌더 타깃)과 같은 조건으로 컴파일
    warm = r.compileAsync(sc, new THREE.OrthographicCamera());
    r.setRenderTarget(old);
  } catch (err) {
    console.warn('[studio] PMREM 미리 굽기 실패 — 바로 굽는다', err);
    target = null;
  }
  const bake = (): void => {
    const tex = target ? pm.fromEquirectangular(hdr, target).texture : pm.fromEquirectangular(hdr).texture;
    pm.dispose();
    pmrems.set(r, tex);
  };
  warm.then(bake, bake);
  return null;
}

/* ───────────── 준비: 텍스처 올리기 → 병렬 컴파일 ───────────── */

const uploaded = new WeakMap<R, WeakSet<object>>();
/** 텍스처를 프레임당 budget ms 까지만 GPU 에 올린다 — 다 올렸으면 true */
function pump(r: R, list: THREE.Texture[], budget = 3): boolean {
  let done = uploaded.get(r);
  if (!done) uploaded.set(r, (done = new WeakSet()));
  const t0 = performance.now();
  for (const t of list) {
    if (done.has(t.source)) continue;
    if (performance.now() - t0 > budget) return false;
    r.initTexture(t);
    done.add(t.source);
  }
  return true;
}
/** 렌더러마다 한 번 compileAsync — 끝나기 전엔 false (그동안 「준비 중」 화면) */
class Warm {
  private st = new WeakMap<R, 1 | 2>();
  ready(r: R, go: (r: R) => Promise<unknown>): boolean {
    const s = this.st.get(r);
    if (s === 2) return true;
    if (s === 1) return false;
    this.st.set(r, 1);
    const fin = (): void => void this.st.set(r, 2);
    go(r).then(fin, fin);
    return false;
  }
  reset(): void {
    this.st = new WeakMap();
  }
}
/** 그림자를 켜고 — 다른 카드와 나눠 쓰는 렌더러라 끝나면 되돌린다 */
function withShadows<T>(r: R, on: boolean, fn: () => T): T {
  const en = r.shadowMap.enabled;
  const ty = r.shadowMap.type;
  const ck = r.debug.checkShaderErrors;
  r.shadowMap.enabled = on;
  r.shadowMap.type = THREE.PCFShadowMap;
  r.debug.checkShaderErrors = false; // 미리 굽는 셰이더 — 오류 검사는 GPU 를 기다리게 한다
  try {
    return fn();
  } finally {
    r.shadowMap.enabled = en;
    r.shadowMap.type = ty;
    r.debug.checkShaderErrors = ck;
  }
}
function allTex(m: THREE.Material | THREE.Material[]): THREE.Texture[] {
  const out: THREE.Texture[] = [];
  for (const x of Array.isArray(m) ? m : [m]) {
    const s = x as THREE.MeshStandardMaterial;
    for (const t of [s.map, s.normalMap, s.aoMap, s.roughnessMap, s.metalnessMap, s.emissiveMap, s.alphaMap]) if (t) out.push(t);
  }
  return out;
}
function sceneTex(root: THREE.Object3D): THREE.Texture[] {
  const out: THREE.Texture[] = [];
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (m) out.push(...allTex(m));
  });
  return out;
}

/* ───────────── HUD 글씨 (장면 위에 겹쳐 그리기) ───────────── */

type Sty = 'tag' | 'on' | 'off' | 'warn';
const STY: Record<Sty, [string, string]> = {
  tag: ['rgba(10,12,22,0.74)', '#ffffff'],
  on: ['#ffcf4a', '#22180a'],
  off: ['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.8)'],
  warn: ['rgba(120,20,20,0.82)', '#ffe0d0'],
};
class Label {
  readonly canvas = document.createElement('canvas');
  readonly tex: THREE.CanvasTexture;
  readonly spr: THREE.Sprite;
  aspect = 1;
  text = '';
  sty: Sty = 'tag';
  visible = true;
  /** 화면 폭 대비 최대 너비 (0 = 제한 없음) */
  maxW = 0;
  constructor(
    text: string,
    public fx: number,
    public fy: number,
    ax: number,
    ay: number,
    public size: number,
    sty: Sty,
  ) {
    this.canvas.width = 512;
    this.canvas.height = 80;
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
    const W = 512;
    const H = 80;
    const g = this.canvas.getContext('2d')!;
    g.clearRect(0, 0, W, H);
    g.font = `700 40px ${FONT}`;
    const tw = Math.min(W - 40, g.measureText(text).width);
    const used = Math.min(W, Math.ceil(tw + 40));
    const x0 = (W - used) / 2;
    const [bg, fg] = STY[sty];
    g.fillStyle = bg;
    g.beginPath();
    g.roundRect(x0 + 2, 8, used - 4, H - 16, 28);
    g.fill();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = fg;
    g.fillText(text, W / 2, H / 2 + 2, W - 40);
    this.tex.repeat.set(used / W, 1);
    this.tex.offset.set(x0 / W, 0);
    this.tex.needsUpdate = true;
    this.aspect = used / H;
  }
}
/** 여러 줄 표 — 캔버스에 그려 한 장으로 */
class Board {
  readonly canvas = document.createElement('canvas');
  readonly tex: THREE.CanvasTexture;
  readonly spr: THREE.Sprite;
  private key = '';
  constructor(
    public fx: number,
    public fy: number,
    ax: number,
    ay: number,
    public size: number,
  ) {
    this.canvas.width = 640;
    this.canvas.height = 300;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, depthTest: false, depthWrite: false, toneMapped: false, transparent: true }));
    this.spr.center.set(ax, ay);
  }
  /** rows: [글, 색, 굵게?] */
  set(title: string, rows: [string, string, boolean?][]): void {
    const key = title + rows.map((r) => r.join('|')).join('/');
    if (key === this.key) return;
    this.key = key;
    const g = this.canvas.getContext('2d')!;
    const W = this.canvas.width;
    const H = this.canvas.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(8,10,20,0.8)';
    g.beginPath();
    g.roundRect(2, 2, W - 4, H - 4, 26);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.14)';
    g.lineWidth = 2;
    g.stroke();
    g.textBaseline = 'middle';
    g.font = `800 34px ${FONT}`;
    g.fillStyle = '#ffd166';
    g.fillText(title, 24, 40, W - 48);
    const lh = (H - 80) / Math.max(1, rows.length);
    rows.forEach(([t, c, b], i) => {
      g.font = `${b ? 800 : 600} 29px ${FONT}`;
      g.fillStyle = c;
      g.fillText(t, 24, 82 + lh * (i + 0.5), W - 48);
    });
    this.tex.needsUpdate = true;
  }
}
class Hud {
  readonly scene = new THREE.Scene();
  readonly cam = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10);
  readonly labels: Label[] = [];
  readonly boards: Board[] = [];
  private lines: { m: THREE.Mesh; fx: number }[] = [];
  private lineGeo = new THREE.PlaneGeometry(1, 1);
  private lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, depthTest: false, transparent: true, opacity: 0.85 });
  private alive = true;
  constructor() {
    document.fonts?.ready.then(() => {
      if (this.alive) for (const l of this.labels) l.set(l.text, l.sty, true);
    });
  }
  label(text: string, fx: number, fy: number, ax = 0.5, ay = 0.5, sty: Sty = 'tag', size = 1): Label {
    const l = new Label(text, fx, fy, ax, ay, size, sty);
    this.labels.push(l);
    this.scene.add(l.spr);
    return l;
  }
  board(fx: number, fy: number, ax: number, ay: number, size = 1): Board {
    const b = new Board(fx, fy, ax, ay, size);
    this.boards.push(b);
    this.scene.add(b.spr);
    return b;
  }
  vline(fx: number): void {
    const m = new THREE.Mesh(this.lineGeo, this.lineMat);
    this.lines.push({ m, fx });
    this.scene.add(m);
  }
  private warm = new Warm();
  draw(r: R, w: number, h: number): void {
    // 글씨 스프라이트 셰이더도 처음엔 병렬 컴파일 — 끝나기 전엔 글씨 없이
    if (!this.warm.ready(r, (rr) => rr.compileAsync(this.scene, this.cam))) return;
    this.cam.right = w;
    this.cam.top = h;
    this.cam.updateProjectionMatrix();
    const px = clamp(h * 0.1, 16, 44);
    for (const l of this.labels) {
      l.spr.visible = l.visible;
      let s = px * l.size;
      if (l.maxW > 0) s = Math.min(s, (l.maxW * w) / l.aspect);
      l.spr.scale.set(s * l.aspect, s, 1);
      l.spr.position.set(l.fx * w, l.fy * h, 0);
    }
    for (const b of this.boards) {
      const s = px * 3.4 * b.size;
      b.spr.scale.set((s * 640) / 300, s, 1);
      b.spr.position.set(b.fx * w, b.fy * h, 0);
    }
    for (const { m, fx } of this.lines) {
      m.scale.set(Math.max(2, Math.round(h / 240)), h, 1);
      m.position.set(Math.round(fx * w), h / 2, 0);
    }
    const ac = r.autoClear;
    const ck = r.debug.checkShaderErrors;
    r.autoClear = false;
    r.debug.checkShaderErrors = false;
    r.setViewport(0, 0, w, h);
    r.render(this.scene, this.cam);
    r.debug.checkShaderErrors = ck;
    r.autoClear = ac;
  }
  dispose(): void {
    this.alive = false;
    for (const l of this.labels) {
      l.tex.dispose();
      l.spr.material.dispose();
    }
    for (const b of this.boards) {
      b.tex.dispose();
      b.spr.material.dispose();
    }
    this.lineGeo.dispose();
    this.lineMat.dispose();
  }
}

/* ───────────── 공통 그리기 도우미 ───────────── */

/** 카메라를 dir 쪽에서 target 을 보게 — 반지름 radius 공이 화면에 꼭 들어가게 물러난다 */
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
/** 화면을 세로 칸으로 나눠 장면마다 (칸마다 자기 카메라 틀) */
function panels(r: R, w: number, h: number, list: { scene: THREE.Scene; exposure?: number }[], frame: (aspect: number) => THREE.Camera): void {
  const n = list.length;
  const ex = r.toneMappingExposure;
  r.setScissorTest(true);
  list.forEach((p, i) => {
    const x0 = Math.round((i * w) / n);
    const x1 = Math.round(((i + 1) * w) / n);
    const cam = frame((x1 - x0) / h);
    r.setViewport(x0, 0, x1 - x0, h);
    r.setScissor(x0, 0, x1 - x0, h);
    if (p.exposure !== undefined) r.toneMappingExposure = p.exposure;
    r.render(p.scene, cam);
    r.toneMappingExposure = ex;
  });
  r.setScissorTest(false);
  r.setViewport(0, 0, w, h);
}
/** 불러오는 동안 — 어두운 바탕 + 가운데 글 */
function waiting(r: R, w: number, h: number, hud: Hud, msg: Label, text: string): void {
  r.setClearColor(0x0b0d14, 1);
  r.setViewport(0, 0, w, h);
  r.clear();
  msg.visible = true;
  msg.set(text);
  hud.draw(r, w, h);
}
/** 바닥에 까는 둥근 그늘 (접촉 그림자) — 물체가 떠 보이지 않게 */
let blobTex: THREE.CanvasTexture | null = null;
function blobShadow(): THREE.CanvasTexture {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, 'rgba(0,0,0,0.85)');
  rg.addColorStop(0.45, 'rgba(0,0,0,0.42)');
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 128, 128);
  blobTex = new THREE.CanvasTexture(c);
  return blobTex;
}
function blob(size: number, opacity = 0.7, sy = size): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, sy),
    new THREE.MeshBasicMaterial({ map: blobShadow(), transparent: true, depthWrite: false, opacity, color: 0x000000, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  m.rotation.x = -Math.PI / 2;
  return m;
}
/** 부드러운 빛 무리 (스프라이트 빛 번짐) */
let glowTex: THREE.CanvasTexture | null = null;
function glow(): THREE.CanvasTexture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  rg.addColorStop(0.5, 'rgba(255,255,255,0.12)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}
function glowSprite(color: number, scale: number, opacity = 1): THREE.Sprite {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glow(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  );
  s.scale.setScalar(scale);
  return s;
}
/** 장면 정리 — 모양 · 재질만 (공유 텍스처는 페이지 끝까지 둔다) */
function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material;
    if (mat) for (const x of Array.isArray(mat) ? mat : [mat]) x.dispose();
  });
}
/** 돌기둥 단면 (아래 받침 · 몸통 · 위 머리) — 회전체 */
function columnProfile(h: number, r: number, rows: number): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [new THREE.Vector2(0.001, 0)];
  const key: [number, number][] = [
    [r * 1.45, 0],
    [r * 1.45, 0.07],
    [r * 1.25, 0.1],
    [r * 1.18, 0.16],
    [r * 1.02, 0.2],
  ];
  for (const [x, y] of key) pts.push(new THREE.Vector2(x, y * h * 0.5));
  const y0 = 0.1 * h;
  const y1 = 0.88 * h;
  for (let i = 0; i <= rows; i++) {
    const k = i / rows;
    const ent = 1 + 0.06 * Math.sin(k * Math.PI) - 0.08 * k; // 가운데가 살짝 부푼 몸통
    pts.push(new THREE.Vector2(r * ent, y0 + (y1 - y0) * k));
  }
  const top: [number, number][] = [
    [r * 1.0, 0.9],
    [r * 1.2, 0.93],
    [r * 1.42, 0.96],
    [r * 1.42, 1.0],
  ];
  for (const [x, y] of top) pts.push(new THREE.Vector2(x, y * h));
  pts.push(new THREE.Vector2(0.001, h));
  return pts;
}

/* ───────────── i474 실사 PBR 텍스처 — 단계 비교 ───────────── */

const STAGE_NAME = ['① 단색', '② + 색 지도', '③ + 법선', '④ + AO·거칠기·금속'];
const MODE_NAME = ['어울리는 재질 4종', '모두 돌바닥', '모두 성벽 벽돌', '모두 낡은 나무', '모두 금속 판'];

function stageMat(p: PBR, stage: number, rx: number, ry: number): THREE.MeshStandardMaterial {
  const metal = p.set === 'metal' ? 0.75 : 0;
  if (stage === 0) return new THREE.MeshStandardMaterial({ color: p.avg, roughness: 0.72, metalness: metal });
  if (stage === 1) return new THREE.MeshStandardMaterial({ map: rep(p.map, rx, ry), roughness: 0.72, metalness: metal });
  if (stage === 2) return new THREE.MeshStandardMaterial({ map: rep(p.map, rx, ry), normalMap: rep(p.normal, rx, ry), roughness: 0.72, metalness: metal });
  return pbrMat(p, rx, ry);
}

function makePbrStages(T: typeof THREE): Scene3D {
  const scene = new T.Scene();
  scene.background = new T.Color(0x0c0e15);
  const cam = new T.PerspectiveCamera(28, 1.6, 0.1, 60);
  const hud = new Hud();
  const msg = hud.label('실사 재질 받는 중 …', 0.5, 0.5, 0.5, 0.5, 'tag', 0.8);
  const heads = STAGE_NAME.map((s, i) => {
    const l = hud.label(s, (i + 0.5) / 4, 0.965, 0.5, 1, i === 3 ? 'on' : 'tag', 0.7);
    l.maxW = 0.235;
    l.visible = false;
    return l;
  });
  const foot = hud.label(MODE_NAME[0]!, 0.5, 0.03, 0.5, 0, 'off', 0.62);
  foot.visible = false;
  for (let i = 1; i < 4; i++) hud.vline(i / 4);

  scene.add(new T.HemisphereLight(0xbfd4ff, 0x2a2018, 0.35));
  const key = new T.DirectionalLight(0xfff1dd, 1.4);
  key.position.set(-4, 6, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 3, bottom: -3, near: 1, far: 20 });
  key.shadow.bias = -0.0008;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  // 낮게 훑는 빛 — 벽 · 바닥 요철이 드러난다
  const sweep = new T.PointLight(0xffd7a0, 9, 7, 2);
  scene.add(sweep);
  const bulb = new T.Mesh(new T.SphereGeometry(0.05, 16, 10), new T.MeshBasicMaterial({ color: 0xfff0d0, toneMapped: false }));
  bulb.add(glowSprite(0xffc070, 0.7, 0.8));
  sweep.add(bulb);

  type Role = 'floor' | 'wall' | 'crate' | 'pillar';
  const NATURAL: Record<Role, SetId> = { floor: 'rock', wall: 'brick', crate: 'metal', pillar: 'planks' };
  const REP: Record<Role, [number, number]> = { floor: [3.2, 1.5], wall: [3.2, 1.3], crate: [0.6, 0.6], pillar: [1, 1.2] };
  const geos: THREE.BufferGeometry[] = [];
  const meshes: { m: THREE.Mesh; role: Role }[] = [];
  const add = (g: THREE.BufferGeometry, role: Role, x: number, y: number, z: number, ry = 0): THREE.Mesh => {
    geos.push(g);
    const m = new T.Mesh(g);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = role !== 'floor';
    m.receiveShadow = true;
    m.visible = false;
    scene.add(m);
    meshes.push({ m, role });
    return m;
  };
  add(new T.BoxGeometry(6.6, 0.3, 3.2), 'floor', 0, -0.15, 0.1);
  add(new T.BoxGeometry(6.6, 2.7, 0.3), 'wall', 0, 1.35, -1.35);
  const crate = new T.BoxGeometry(0.85, 0.85, 0.85);
  const pillar = new T.LatheGeometry(columnProfile(2.3, 0.24, 12), 40);
  add(crate, 'crate', -2.45, 0.425, 0.2, 0.35);
  add(pillar, 'pillar', -0.82, 0, -0.35);
  add(crate.clone(), 'crate', 0.82, 0.425, 0.2, -0.3);
  add(pillar.clone(), 'pillar', 2.45, 0, -0.35);
  const blobs = [-2.45, -0.82, 0.82, 2.45].map((x, i) => {
    const b = blob(i % 2 ? 0.9 : 1.4, 0.55);
    b.position.set(x, 0.005, i % 2 ? -0.35 : 0.2);
    b.visible = false;
    scene.add(b);
    return b;
  });

  let kit: Kit | null = null;
  let dead = false;
  let mode = 0;
  let moving = true;
  let lightH = 1.2;
  let now = 0;
  const cache = new Map<string, THREE.MeshStandardMaterial>();
  const matFor = (role: Role, stage: number): THREE.MeshStandardMaterial => {
    const set = mode === 0 ? NATURAL[role] : SETS[mode - 1]!;
    const k = `${set}|${role}|${stage}`;
    let m = cache.get(k);
    if (!m) {
      const [rx, ry] = REP[role];
      m = stageMat(kit!.pbr[set], stage, rx, ry);
      cache.set(k, m);
    }
    return m;
  };
  const applyStage = (stage: number): void => {
    for (const { m, role } of meshes) m.material = matFor(role, stage);
  };
  const warm = new Warm();
  const texList = (): THREE.Texture[] => {
    const out: THREE.Texture[] = [];
    for (let s = 0; s < 4; s++) for (const { role } of meshes) out.push(...allTex(matFor(role, s)));
    return out;
  };
  loadKit().then((k) => {
    if (dead) return;
    kit = k;
    for (const { m } of meshes) m.visible = true;
    for (const b of blobs) b.visible = true;
  });
  const target = new T.Vector3(0, 1.0, 0);
  const dir = new T.Vector3(0, 0.22, 1);

  return {
    scene,
    camera: cam,
    update(t) {
      now = moving ? t : now;
      sweep.position.set(Math.sin(now * 0.55) * 3.1, lightH + 0.35 * Math.sin(now * 0.9), -0.75);
    },
    render(r, w, h) {
      if (!kit) return waiting(r, w, h, hud, msg, '실사 재질 받는 중 … (약 10MB · 한 번만)');
      if (!pump(r, texList())) return waiting(r, w, h, hud, msg, 'GPU 에 텍스처 올리는 중 …');
      if (kit.hdr) {
        const env = envFor(r, kit.hdr);
        if (!env) return waiting(r, w, h, hud, msg, 'HDRI 빛 굽는 중 …');
        scene.environment = env;
        scene.environmentIntensity = 0.35;
      }
      // 폭에 맞춰 — 네 칸 모두 같은 벽 · 바닥이 이어 보이게
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
      const vh = THREE.MathUtils.degToRad(cam.fov) / 2;
      const hf = Math.atan(Math.tan(vh) * cam.aspect);
      const dd = Math.max(3.7 / Math.tan(hf), 2.0 / Math.tan(vh));
      cam.position.copy(target).addScaledVector(dir.clone().normalize(), dd);
      cam.lookAt(target);
      const c = cam;
      const ok = warm.ready(r, (rr) =>
        withShadows(rr, true, () =>
          Promise.all([0, 1, 2, 3].map((s) => {
            applyStage(s);
            return rr.compileAsync(scene, c);
          })),
        ),
      );
      if (!ok) return waiting(r, w, h, hud, msg, '셰이더 굽는 중 …');
      msg.visible = false;
      heads.forEach((l) => (l.visible = true));
      foot.visible = true;
      foot.set('재질: ' + MODE_NAME[mode]);
      withShadows(r, true, () => {
        const au = r.shadowMap.autoUpdate;
        r.shadowMap.autoUpdate = false;
        r.setScissorTest(true);
        r.setViewport(0, 0, w, h);
        for (let s = 0; s < 4; s++) {
          const x0 = Math.round((s * w) / 4);
          const x1 = Math.round(((s + 1) * w) / 4);
          r.setScissor(x0, 0, x1 - x0, h);
          applyStage(s);
          r.shadowMap.needsUpdate = s === 0;
          r.render(scene, c);
        }
        r.setScissorTest(false);
        r.shadowMap.autoUpdate = au;
      });
      hud.draw(r, w, h);
    },
    controls: [
      {
        type: 'button',
        label: '재질 바꾸기',
        on: () => {
          mode = (mode + 1) % MODE_NAME.length;
          warm.reset();
        },
      },
      { type: 'range', label: '빛 높이', min: 0.4, max: 2.2, step: 0.05, value: lightH, on: (v) => (lightH = v) },
      { type: 'toggle', label: '빛 움직이기', value: true, on: (v) => (moving = v) },
    ],
    dispose() {
      dead = true;
      for (const g of geos) g.dispose();
      for (const m of cache.values()) m.dispose();
      for (const b of blobs) disposeTree(b);
      disposeTree(bulb);
      hud.dispose();
    },
  };
}

/* ───────────── i475 HDRI 환경 빛 · 반사 ───────────── */

/** 톱니바퀴 (구멍 뚫린 돌출) */
function gearGeometry(T: typeof THREE, teeth: number, r0: number, r1: number, hole: number, depth: number): THREE.BufferGeometry {
  const s = new T.Shape();
  const n = teeth * 4;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const q = i % 4;
    const rr = q === 1 || q === 2 ? r1 : r0;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  const hp = new T.Path();
  hp.absarc(0, 0, hole, 0, TAU, true);
  s.holes.push(hp);
  // 바퀴살 구멍 넷
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + Math.PI / 4;
    const p = new T.Path();
    p.absarc(Math.cos(a) * (r0 * 0.58), Math.sin(a) * (r0 * 0.58), r0 * 0.17, 0, TAU, true);
    s.holes.push(p);
  }
  const g = new T.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.014, bevelSegments: 3, curveSegments: 20 });
  g.center();
  return g;
}

function makeHdri(T: typeof THREE): Scene3D {
  const cam = new T.PerspectiveCamera(36, 0.8, 0.1, 80);
  const hud = new Hud();
  const msg = hud.label('HDRI 받는 중 …', 0.5, 0.5, 0.5, 0.5, 'tag', 0.8);
  hud.vline(0.5);
  const la = hud.label('일반 조명', 0.25, 0.965, 0.5, 1, 'off', 0.72);
  const lb = hud.label('HDRI 환경 빛', 0.75, 0.965, 0.5, 1, 'on', 0.72);
  la.maxW = lb.maxW = 0.46;
  la.visible = lb.visible = false;

  const geos: THREE.BufferGeometry[] = [];
  const g = <G extends THREE.BufferGeometry>(x: G): G => (geos.push(x), x);
  const sphere = g(new T.SphereGeometry(0.4, 64, 40));
  const small = g(new T.SphereGeometry(0.3, 56, 36));
  const gear = g(gearGeometry(T, 14, 0.36, 0.44, 0.09, 0.12));
  const ring = g(new T.TorusGeometry(0.2, 0.055, 32, 80));
  const disc = g(new T.CylinderGeometry(1.55, 1.62, 0.18, 96));
  const mats: THREE.Material[] = [];
  const m = <M extends THREE.Material>(x: M): M => (mats.push(x), x);
  const chrome = m(new T.MeshStandardMaterial({ color: 0xf2f4f8, metalness: 1, roughness: 0.04 }));
  const glass = m(
    new T.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.02, transmission: 1, thickness: 0.7, ior: 1.5, attenuationColor: new T.Color(0xcfe8ff), attenuationDistance: 1.6, specularIntensity: 1 }),
  );
  const rubber = m(new T.MeshPhysicalMaterial({ color: 0xc8232c, roughness: 0.62, metalness: 0, sheen: 0.4, sheenRoughness: 0.6, sheenColor: new T.Color(0xff9a9a) }));
  const gold = m(new T.MeshStandardMaterial({ color: 0xffc35a, metalness: 1, roughness: 0.18 }));
  const blobMat = m(new T.MeshBasicMaterial({ map: blobShadow(), transparent: true, depthWrite: false, opacity: 0.65, color: 0x000000, polygonOffset: true, polygonOffsetFactor: -2 }));
  const blobGeo = g(new T.PlaneGeometry(1, 1));
  let steel: THREE.MeshStandardMaterial | null = null;
  let plate: THREE.MeshStandardMaterial | null = null;

  interface Side {
    scene: THREE.Scene;
    spin: THREE.Object3D[];
    gear: THREE.Mesh;
    disc: THREE.Mesh;
  }
  const build = (hdri: boolean): Side => {
    const scene = new T.Scene();
    const root = new T.Group();
    scene.add(root);
    const put = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
      const o = new T.Mesh(geo, mat);
      o.position.set(x, y, z);
      o.castShadow = o.receiveShadow = true;
      root.add(o);
      return o;
    };
    const d = put(disc, chrome, 0, 0.09, 0);
    put(sphere, chrome, -0.62, 0.58, -0.42);
    put(sphere, glass, 0.62, 0.58, -0.42);
    put(small, rubber, -0.66, 0.48, 0.62);
    const gm = put(gear, chrome, 0.5, 0.62, 0.55);
    gm.rotation.y = -0.5;
    const rg = put(ring, gold, 0.02, 0.235, 0.3);
    rg.rotation.x = -Math.PI / 2;
    const bl: [number, number, number][] = [
      [-0.62, -0.42, 1.0],
      [0.62, -0.42, 1.0],
      [-0.66, 0.62, 0.78],
      [0.5, 0.55, 0.85],
    ];
    for (const [x, z, s] of bl) {
      const b = new T.Mesh(blobGeo, blobMat);
      b.rotation.x = -Math.PI / 2;
      b.position.set(x, 0.182, z);
      b.scale.setScalar(s);
      root.add(b);
    }
    if (!hdri) {
      scene.background = new T.Color(0x1b1e27);
      scene.add(new T.AmbientLight(0xffffff, 0.55));
      const sun = new T.DirectionalLight(0xffffff, 2.4);
      sun.position.set(2.5, 4, 2.2);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.5, far: 12 });
      sun.shadow.bias = -0.0006;
      scene.add(sun);
    }
    return { scene, spin: [gm], gear: gm, disc: d };
  };
  const A = build(false);
  const B = build(true);
  let kit: Kit | null = null;
  let dead = false;
  let exposure = 1;
  let rot = 0;
  let showBg = true;
  const plainBg = new T.Color(0x1b1e27);
  let now = 0;
  const warm = new Warm();
  loadKit().then((k) => {
    if (dead) return;
    kit = k;
    const mp = k.pbr.metal;
    steel = m(new T.MeshStandardMaterial({ color: 0xd4d8e0, metalness: 1, roughness: 0.3 }));
    plate = m(pbrMat(mp, 2.2, 2.2, { color: 0xc4c8d0 }));
    for (const s of [A, B]) {
      s.gear.material = steel;
      s.disc.material = plate;
    }
  });
  const target = new T.Vector3(0, 0.45, 0.05);

  return {
    scene: B.scene,
    camera: cam,
    update(t, dt) {
      now = t;
      void dt;
      for (const s of [A, B]) for (const o of s.spin) o.rotation.z = t * 0.6;
    },
    render(r, w, h) {
      if (!kit || !steel || !plate) return waiting(r, w, h, hud, msg, 'HDRI · 금속 재질 받는 중 …');
      if (!pump(r, allTex(plate))) return waiting(r, w, h, hud, msg, 'GPU 에 올리는 중 …');
      if (kit.hdr) {
        const env = envFor(r, kit.hdr);
        if (!env) return waiting(r, w, h, hud, msg, 'HDRI 빛 굽는 중 …');
        B.scene.environment = env;
        B.scene.background = showBg ? kit.hdr : plainBg;
        B.scene.backgroundIntensity = 0.85;
        B.scene.environmentRotation.y = rot;
        B.scene.backgroundRotation.y = rot;
      }
      const a = now * 0.25;
      const dir = new T.Vector3(Math.sin(a) * 0.9, 0.55, Math.cos(a) * 0.9 + 0.3);
      const ok = warm.ready(r, (rr) =>
        withShadows(rr, true, () => {
          const c = fit(cam, w / 2 / h, target, 1.5, dir);
          const list = [rr.compileAsync(A.scene, c), rr.compileAsync(B.scene, c)];
          // 유리(투과)는 불투명 물체를 반정밀 렌더 타깃에 한 번 더 그린다 — 그 조건(톤 매핑 없음 · 선형 색)의 셰이더도 미리
          const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
          const old = rr.getRenderTarget();
          rr.setRenderTarget(rt);
          list.push(rr.compileAsync(A.scene, c), rr.compileAsync(B.scene, c));
          rr.setRenderTarget(old);
          return Promise.all(list).finally(() => rt.dispose());
        }),
      );
      if (!ok) return waiting(r, w, h, hud, msg, '셰이더 굽는 중 …');
      msg.visible = false;
      la.visible = lb.visible = true;
      withShadows(r, true, () =>
        panels(r, w, h, [{ scene: A.scene, exposure }, { scene: B.scene, exposure }], (asp) => fit(cam, asp, target, 1.5, dir)),
      );
      hud.draw(r, w, h);
    },
    controls: [
      { type: 'range', label: '노출', min: 0.3, max: 2.5, step: 0.05, value: 1, on: (v) => (exposure = v) },
      { type: 'range', label: '환경 회전(도)', min: 0, max: 360, step: 1, value: 0, on: (v) => (rot = THREE.MathUtils.degToRad(v)) },
      { type: 'toggle', label: 'HDRI 배경 보이기', value: true, on: (v) => (showBg = v) },
    ],
    dispose() {
      dead = true;
      for (const x of geos) x.dispose();
      for (const x of mats) x.dispose();
      hud.dispose();
    },
  };
}

/* ───────────── 나눠 만들기 (프레임당 3ms) ───────────── */

type Gen = Generator<void, void, void>;
let DEADLINE = Infinity;
const late = (): boolean => performance.now() > DEADLINE;
class Job {
  private it: Gen | null = null;
  start(g: Gen): void {
    this.it = g;
  }
  get busy(): boolean {
    return this.it !== null;
  }
  step(budget = 3): boolean {
    if (!this.it) return true;
    DEADLINE = performance.now() + budget;
    try {
      if (this.it.next().done) this.it = null;
    } finally {
      DEADLINE = Infinity;
    }
    return this.it === null;
  }
}
/** 고정 난수 (매번 같은 배치) */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ───────────── 불꽃 · 불티 · 먼지 (점 셰이더, 반복문 없음) ───────────── */

const FIRE_VS = /* glsl */ `
attribute float seed;
attribute float tid;
uniform float uTime;
uniform float uScale;
uniform vec3 uO[3];
uniform float uMode; // 0 불꽃 1 불티
varying float vLife;
varying float vSeed;
void main() {
  vec3 o = tid < 0.5 ? uO[0] : (tid < 1.5 ? uO[1] : uO[2]);
  float ang = seed * 43.7;
  vec3 p;
  float sz;
  if (uMode < 0.5) {
    float life = fract(uTime * 1.7 + seed * 7.31);
    float rad = 0.075 * (1.0 - life) * (0.3 + 0.7 * fract(seed * 91.3));
    p = o + vec3(cos(ang) * rad, life * 0.56, sin(ang) * rad);
    p.x += sin(uTime * 9.0 + seed * 20.0) * 0.025 * life;
    p.z += cos(uTime * 7.0 + seed * 13.0) * 0.02 * life;
    sz = 0.28 * (1.0 - life * 0.75) * (0.6 + 0.4 * fract(seed * 13.1));
    vLife = life;
  } else {
    float life = fract(uTime * 0.32 + seed * 3.77);
    p = o + vec3(sin(ang + uTime * 1.3) * 0.35 * life, life * 2.1, cos(ang * 1.7 + uTime) * 0.35 * life);
    sz = 0.035 * (1.0 - life * 0.5);
    vLife = life;
  }
  vSeed = seed;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = sz * uScale / -mv.z;
}`;
const FIRE_FS = /* glsl */ `
uniform float uMode;
uniform float uTime;
varying float vLife;
varying float vSeed;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  if (r > 1.0) discard;
  if (uMode < 0.5) {
    float a = (1.0 - r) * (1.0 - r) * (1.0 - vLife * 0.9);
    vec3 c = mix(vec3(1.0, 0.93, 0.62), vec3(1.0, 0.48, 0.1), smoothstep(0.05, 0.45, vLife));
    c = mix(c, vec3(0.55, 0.08, 0.02), smoothstep(0.45, 1.0, vLife));
    gl_FragColor = vec4(c, a * 0.85);
  } else {
    float tw = 0.6 + 0.4 * sin(uTime * 17.0 + vSeed * 50.0);
    float a = smoothstep(1.0, 0.0, r) * (1.0 - vLife) * tw;
    gl_FragColor = vec4(1.0, 0.62, 0.22, a);
  }
}`;
const DUST_VS = /* glsl */ `
attribute float seed;
uniform float uTime;
uniform float uScale;
uniform vec3 uL[3];
uniform vec3 uI;
varying float vB;
void main() {
  vec3 p = position;
  p += vec3(sin(uTime * 0.13 + seed * 6.0) * 0.45, sin(uTime * 0.09 + seed * 3.0) * 0.3, cos(uTime * 0.11 + seed * 5.0) * 0.45);
  vec3 d0 = p - uL[0];
  vec3 d1 = p - uL[1];
  vec3 d2 = p - uL[2];
  vB = uI.x / (1.0 + dot(d0, d0) * 0.9) + uI.y / (1.0 + dot(d1, d1) * 0.9) + uI.z / (1.0 + dot(d2, d2) * 0.9);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (0.028 + 0.02 * fract(seed * 7.7)) * uScale / -mv.z;
}`;
const DUST_FS = /* glsl */ `
varying float vB;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  if (r > 1.0) discard;
  float a = smoothstep(1.0, 0.0, r) * clamp(vB, 0.0, 1.0) * 0.75;
  gl_FragColor = vec4(1.0, 0.8, 0.55, a);
}`;
function pointsMat(vs: string, fs: string, uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
}
/** 바닥에 까는 선형 그늘 (벽 밑 접촉 그림자) */
let stripTex: THREE.CanvasTexture | null = null;
function stripShadow(): THREE.CanvasTexture {
  if (stripTex) return stripTex;
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const g = c.getContext('2d')!;
  const lg = g.createLinearGradient(0, 0, 0, 128);
  lg.addColorStop(0, 'rgba(0,0,0,0.9)');
  lg.addColorStop(0.35, 'rgba(0,0,0,0.4)');
  lg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = lg;
  g.fillRect(0, 0, 4, 128);
  stripTex = new THREE.CanvasTexture(c);
  return stripTex;
}
const flick = (t: number, ph: number): number => 0.84 + 0.08 * Math.sin(t * 11 + ph) + 0.05 * Math.sin(t * 23.7 + ph * 1.7) + 0.03 * Math.sin(t * 5.3 + ph * 0.3);

/* ───────────── i477 디아블로풍 던전 — 장면 짓기 ───────────── */

interface DMats {
  floor: THREE.MeshStandardMaterial;
  wall: THREE.MeshStandardMaterial;
  pillar: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  door: THREE.MeshStandardMaterial;
  barrel: THREE.MeshStandardMaterial;
  iron: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
  leather: THREE.MeshStandardMaterial;
  cloth: THREE.MeshPhysicalMaterial;
  dark: THREE.MeshStandardMaterial;
  red: THREE.MeshStandardMaterial;
  stick: THREE.MeshStandardMaterial;
}
function dungeonMats(T: typeof THREE, k: Kit): DMats {
  const p = k.pbr;
  return {
    floor: pbrMat(p.rock, 5, 5, { color: 0xc8beb0 }),
    wall: pbrMat(p.brick, 0.42, 0.42),
    pillar: pbrMat(p.brick, 1, 1.5),
    stone: pbrMat(p.rock, 1.3, 1.3, { color: 0x9a9184 }),
    wood: pbrMat(p.planks, 0.8, 0.8),
    door: pbrMat(p.planks, 0.55, 0.55, { color: 0xb09070 }),
    barrel: pbrMat(p.planks, 1.5, 0.7),
    iron: pbrMat(p.metal, 0.7, 0.7, { color: 0x5a5650 }),
    steel: pbrMat(p.metal, 0.5, 0.5, { color: 0xe0e4ec, envMapIntensity: 9 }),
    gold: new T.MeshStandardMaterial({ color: 0xffc040, metalness: 1, roughness: 0.26, envMapIntensity: 1.5 }),
    leather: new T.MeshStandardMaterial({ color: 0x3b2618, roughness: 0.82 }),
    cloth: new T.MeshPhysicalMaterial({ color: 0x6a1018, roughness: 0.82, sheen: 0.5, sheenRoughness: 0.7, sheenColor: new T.Color(0x803030), side: T.DoubleSide }),
    dark: new T.MeshStandardMaterial({ color: 0x050403, roughness: 1 }),
    red: new T.MeshStandardMaterial({ color: 0xa8141c, roughness: 0.55 }),
    stick: new T.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.9 }),
  };
}
interface Knight {
  root: THREE.Group;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  armR: THREE.Object3D;
  armL: THREE.Object3D;
  flame: THREE.Object3D;
  cape: THREE.Mesh;
  capeBase: Float32Array;
}
/** 망토 두른 꼬마 기사 — 오른손에 횃불 */
function buildKnight(T: typeof THREE, m: DMats): Knight {
  const root = new T.Group();
  const mesh = (g: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, par: THREE.Object3D = root): THREE.Mesh => {
    const o = new T.Mesh(g, mat);
    o.position.set(x, y, z);
    o.receiveShadow = true;
    par.add(o);
    return o;
  };
  const leg = (sx: number): THREE.Object3D => {
    const piv = new T.Group();
    piv.position.set(sx, 0.62, 0);
    root.add(piv);
    mesh(new T.CapsuleGeometry(0.07, 0.42, 4, 10), m.leather, 0, -0.29, 0, piv);
    mesh(new T.CylinderGeometry(0.085, 0.08, 0.2, 12), m.steel, 0, -0.18, 0.005, piv); // 무릎 · 정강이 판
    const boot = mesh(new T.BoxGeometry(0.15, 0.1, 0.24), m.leather, 0, -0.57, 0.035, piv);
    boot.geometry.translate(0, 0, 0);
    return piv;
  };
  const legL = leg(-0.1);
  const legR = leg(0.1);
  const torso = new T.LatheGeometry(
    [
      [0.001, 0.56],
      [0.2, 0.57],
      [0.25, 0.7],
      [0.24, 0.82],
      [0.27, 1.0],
      [0.23, 1.11],
      [0.1, 1.17],
      [0.001, 1.18],
    ].map(([x, y]) => new T.Vector2(x, y)),
    28,
  );
  mesh(torso, m.steel, 0, 0, 0);
  const belt = mesh(new T.TorusGeometry(0.245, 0.03, 8, 28), m.leather, 0, 0.72, 0);
  belt.rotation.x = Math.PI / 2;
  mesh(new T.BoxGeometry(0.08, 0.07, 0.03), m.gold, 0, 0.72, 0.25);
  mesh(new T.CylinderGeometry(0.24, 0.29, 0.2, 20, 1, true), m.leather, 0, 0.6, 0);
  for (const sx of [-1, 1]) {
    const pa = mesh(new T.SphereGeometry(0.12, 18, 12), m.steel, sx * 0.25, 1.1, 0);
    pa.scale.set(1, 0.75, 1.05);
  }
  // 투구
  mesh(new T.CylinderGeometry(0.15, 0.16, 0.24, 24), m.steel, 0, 1.31, 0);
  mesh(new T.SphereGeometry(0.15, 24, 12, 0, TAU, 0, Math.PI / 2), m.steel, 0, 1.43, 0);
  mesh(new T.BoxGeometry(0.22, 0.03, 0.03), m.dark, 0, 1.34, 0.152);
  mesh(new T.BoxGeometry(0.03, 0.12, 0.03), m.dark, 0, 1.29, 0.155);
  const plume = mesh(new T.ConeGeometry(0.05, 0.3, 10), m.red, 0, 1.6, -0.06);
  plume.rotation.x = -0.6;
  // 오른팔 + 횃불
  const armR = new T.Group();
  armR.position.set(0.28, 1.06, 0);
  root.add(armR);
  mesh(new T.CapsuleGeometry(0.055, 0.36, 4, 10), m.steel, 0, -0.24, 0, armR);
  armR.rotation.x = -1.15;
  const torch = new T.Group();
  torch.position.set(0.3, 0.86, 0.46);
  root.add(torch);
  mesh(new T.CylinderGeometry(0.022, 0.03, 0.44, 8), m.stick, 0, 0.12, 0, torch);
  mesh(new T.CylinderGeometry(0.05, 0.035, 0.08, 10), m.iron, 0, 0.34, 0, torch);
  const flame = new T.Object3D();
  flame.position.set(0, 0.39, 0);
  torch.add(flame);
  // 왼팔 + 방패
  const armL = new T.Group();
  armL.position.set(-0.28, 1.06, 0);
  root.add(armL);
  mesh(new T.CapsuleGeometry(0.055, 0.36, 4, 10), m.steel, 0, -0.24, 0, armL);
  const shield = new T.Group();
  shield.position.set(-0.08, -0.32, 0.08);
  armL.add(shield);
  const sd = mesh(new T.CylinderGeometry(0.24, 0.24, 0.04, 32), m.steel, 0, 0, 0, shield);
  sd.rotation.z = Math.PI / 2;
  const em = mesh(new T.CylinderGeometry(0.19, 0.19, 0.045, 32), m.red, -0.004, 0, 0, shield);
  em.rotation.z = Math.PI / 2;
  const cr1 = mesh(new T.BoxGeometry(0.05, 0.3, 0.05), m.gold, -0.012, 0, 0, shield);
  const cr2 = mesh(new T.BoxGeometry(0.05, 0.05, 0.3), m.gold, -0.012, 0.03, 0, shield);
  void cr1;
  void cr2;
  // 망토
  const cg = new T.PlaneGeometry(0.46, 0.9, 6, 10);
  cg.translate(0, -0.45, 0);
  const cape = mesh(cg, m.cloth, 0, 1.16, -0.2);
  const capeBase = Float32Array.from(cg.attributes.position!.array as Float32Array);
  return { root, legL, legR, armR, armL, flame, cape, capeBase };
}
/** 벽 횃불 받침 — 벽에서 +z 쪽으로 나온다. 불꽃 자리 Object3D 를 돌려준다 */
function torchBracket(T: typeof THREE, m: DMats, geos: THREE.BufferGeometry[]): { g: THREE.Group; flame: THREE.Object3D } {
  const g = new T.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
    geos.push(geo);
    const o = new T.Mesh(geo, mat);
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    g.add(o);
    return o;
  };
  add(new T.BoxGeometry(0.22, 0.36, 0.05), m.iron, 0, 0, 0.025);
  const arm = add(new T.CylinderGeometry(0.025, 0.025, 0.34, 8), m.iron, 0, 0.02, 0.18);
  arm.rotation.x = Math.PI / 2;
  add(new T.CylinderGeometry(0.09, 0.04, 0.14, 12, 1, true), m.iron, 0, 0.1, 0.32);
  add(new T.TorusGeometry(0.09, 0.012, 6, 16), m.iron, 0, 0.17, 0.32).rotation.x = Math.PI / 2;
  add(new T.CylinderGeometry(0.03, 0.035, 0.3, 8), m.stick, 0, 0.2, 0.32);
  const flame = new T.Object3D();
  flame.position.set(0, 0.38, 0.32);
  g.add(flame);
  return { g, flame };
}
/** 바닥에 접촉 그늘을 깐다 */
function shadowStrip(T: typeof THREE, len: number, depth: number): THREE.Mesh {
  const mm = new T.Mesh(
    new T.PlaneGeometry(len, depth),
    new T.MeshBasicMaterial({ map: stripShadow(), color: 0x000000, transparent: true, depthWrite: false, opacity: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  mm.rotation.x = -Math.PI / 2;
  mm.renderOrder = 1;
  return mm;
}

function makeDungeon(T: typeof THREE): Scene3D {
  const BG = 0x040305;
  const scene = new T.Scene();
  scene.background = new T.Color(BG);
  const fog = new T.Fog(BG, 20, 40);
  scene.fog = fog;
  const cam = new T.PerspectiveCamera(30, 1.6, 0.5, 80);
  const hud = new Hud();
  const msg = hud.label('던전 재질 받는 중 …', 0.5, 0.5, 0.5, 0.5, 'tag', 0.8);
  const note = hud.label('횃불 3개 · 그림자는 영웅 횃불 하나', 0.02, 0.03, 0, 0, 'off', 0.55);
  note.maxW = 0.7;
  note.visible = false;
  const world = new T.Group();
  scene.add(world);
  const geos: THREE.BufferGeometry[] = [];
  const G = <X extends THREE.BufferGeometry>(x: X): X => (geos.push(x), x);

  // 빛 — 어둠은 아주 어둡게, 횃불만 따뜻하게
  scene.add(new T.HemisphereLight(0x33405e, 0x0a0605, 0.2));
  const moon = new T.DirectionalLight(0x6c88c8, 0.42);
  moon.position.set(-4, 10, 3);
  scene.add(moon);
  const BASE = [16, 16, 30];
  const lights = BASE.map((b, i) => {
    const l = new T.PointLight(i === 2 ? 0xffa64e : 0xff8a3a, b, i === 2 ? 14 : 12, 2);
    scene.add(l);
    return l;
  });
  const hero = lights[2]!;
  hero.castShadow = true;
  hero.shadow.mapSize.set(512, 512);
  hero.shadow.camera.near = 0.1;
  hero.shadow.camera.far = 14;
  hero.shadow.bias = -0.004;
  hero.shadow.normalBias = 0.03;

  // 불꽃 · 불티 · 먼지 · 빛 무리
  const fp = [new T.Vector3(), new T.Vector3(), new T.Vector3()];
  const lp = [new T.Vector3(), new T.Vector3(), new T.Vector3()];
  const lit = new T.Vector3(1, 1, 1);
  const uScale = { value: 400 };
  const uTime = { value: 0 };
  const pts = (n: number, perTorch: boolean, seedK: number, spread?: (i: number, p: Float32Array) => void): THREE.BufferGeometry => {
    const g = G(new T.BufferGeometry());
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    const tid = new Float32Array(n);
    const rnd = rng(seedK);
    for (let i = 0; i < n; i++) {
      seed[i] = rnd();
      tid[i] = perTorch ? i % 3 : 0;
      spread?.(i, pos);
    }
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('seed', new T.BufferAttribute(seed, 1));
    g.setAttribute('tid', new T.BufferAttribute(tid, 1));
    return g;
  };
  const flameMat = pointsMat(FIRE_VS, FIRE_FS, { uTime, uScale, uO: { value: fp }, uMode: { value: 0 } });
  const emberMat = pointsMat(FIRE_VS, FIRE_FS, { uTime, uScale, uO: { value: fp }, uMode: { value: 1 } });
  const drnd = rng(77);
  const dustMat = pointsMat(DUST_VS, DUST_FS, { uTime, uScale, uL: { value: lp }, uI: { value: lit } });
  const parts = [
    new T.Points(pts(3 * 40, true, 11), flameMat),
    new T.Points(pts(3 * 16, true, 23), emberMat),
    new T.Points(
      pts(320, false, 37, (i, p) => {
        p[i * 3] = (drnd() - 0.5) * 13;
        p[i * 3 + 1] = 0.2 + drnd() * 2.8;
        p[i * 3 + 2] = (drnd() - 0.5) * 13;
      }),
      dustMat,
    ),
  ];
  for (const p of parts) {
    p.frustumCulled = false;
    p.renderOrder = 3;
    p.visible = false;
    scene.add(p);
  }
  const halos = [0, 1, 2].map(() => {
    const a = glowSprite(0xffb060, 0.5, 0.9);
    const b = glowSprite(0xff7a20, 2.2, 0.22);
    a.visible = b.visible = false;
    scene.add(a, b);
    return [a, b] as const;
  });

  let K: Knight | null = null;
  let heroBlob: THREE.Mesh | null = null;
  let built = false;
  let dead = false;
  let hdrTex: THREE.DataTexture | null = null;
  let texs: THREE.Texture[] = [];
  const job = new Job();
  const P4: [number, number][] = [
    [-3.3, -3.3],
    [3.3, -3.3],
    [-3.3, 3.0],
    [3.3, 3.0],
  ];
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, list: { p: [number, number, number]; r?: [number, number, number]; s?: number | [number, number, number] }[], cast = true): THREE.InstancedMesh => {
    const im = new T.InstancedMesh(G(geo), mat, list.length);
    const o = new T.Object3D();
    list.forEach((it, i) => {
      o.position.set(...it.p);
      o.rotation.set(...(it.r ?? [0, 0, 0]));
      const s = it.s ?? 1;
      if (typeof s === 'number') o.scale.setScalar(s);
      else o.scale.set(...s);
      o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
    });
    im.castShadow = cast;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    world.add(im);
    return im;
  };
  const plain = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, cast = true): THREE.Mesh => {
    const o = new T.Mesh(G(geo), mat);
    o.position.set(x, y, z);
    o.castShadow = cast;
    o.receiveShadow = true;
    world.add(o);
    return o;
  };
  const wallTorch: THREE.Object3D[] = [];

  function* build(k: Kit): Gen {
    const m = dungeonMats(T, k);
    if (late()) yield;
    // 바닥
    const fl = plain(new T.PlaneGeometry(15.4, 15.4), m.floor, 0, 0, 0, false);
    fl.rotation.x = -Math.PI / 2;
    // 북쪽 벽 (문 아치를 파낸 모양을 그대로 돌출 — 앞면 UV 가 세계 크기라 벽돌 크기가 고르다)
    const ns = new T.Shape();
    ns.moveTo(-7.7, 0);
    ns.lineTo(0.6, 0);
    ns.lineTo(0.6, 1.9);
    ns.absarc(1.5, 1.9, 0.9, Math.PI, 0, true);
    ns.lineTo(2.4, 0);
    ns.lineTo(7.7, 0);
    ns.lineTo(7.7, 3.4);
    ns.lineTo(-7.7, 3.4);
    ns.lineTo(-7.7, 0);
    plain(new T.ExtrudeGeometry(ns, { depth: 0.7, bevelEnabled: false, curveSegments: 28 }), m.wall, 0, 0, -7.7, false);
    if (late()) yield;
    const ws = new T.Shape();
    ws.moveTo(-7, 0);
    ws.lineTo(7.7, 0);
    ws.lineTo(7.7, 3.4);
    ws.lineTo(-7, 3.4);
    ws.lineTo(-7, 0);
    plain(new T.ExtrudeGeometry(ws, { depth: 0.7, bevelEnabled: false }), m.wall, -7.7, 0, 0, false).rotation.y = Math.PI / 2;
    // 앞쪽 무너진 낮은 벽 (들쭉날쭉한 윗면)
    const low = (seed: number): THREE.ExtrudeGeometry => {
      const rnd = rng(seed);
      const s = new T.Shape();
      s.moveTo(-7.7, 0);
      s.lineTo(7.7, 0);
      for (let x = 7.7; x >= -7.7; x -= 0.55) s.lineTo(x, 0.32 + rnd() * 0.5);
      s.lineTo(-7.7, 0);
      return new T.ExtrudeGeometry(s, { depth: 0.7, bevelEnabled: false });
    };
    plain(low(5), m.wall, 0, 0, 7.0, false);
    plain(low(9), m.wall, 7.0, 0, 0, false).rotation.y = Math.PI / 2;
    if (late()) yield;
    // 돌기둥 넷 (받침 · 몸통 · 머리)
    const col = columnProfile(2.5, 0.34, 10);
    inst(new T.LatheGeometry(col, 28), m.pillar, P4.map(([x, z]) => ({ p: [x, 0.3, z] })));
    inst(new T.BoxGeometry(1.06, 0.3, 1.06), m.stone, P4.map(([x, z]) => ({ p: [x, 0.15, z] })));
    if (late()) yield;
    // 문 + 쇠 띠 + 손잡이 + 아치 돌
    const ds = new T.Shape();
    ds.moveTo(0.66, 0);
    ds.lineTo(0.66, 1.9);
    ds.absarc(1.5, 1.9, 0.84, Math.PI, 0, true);
    ds.lineTo(2.34, 0);
    ds.lineTo(0.66, 0);
    plain(new T.ExtrudeGeometry(ds, { depth: 0.1, bevelEnabled: false, curveSegments: 24 }), m.door, 0, 0, -7.42, false);
    for (const y of [0.5, 1.45]) plain(new T.BoxGeometry(1.66, 0.09, 0.05), m.iron, 1.5, y, -7.3, false);
    const ring = plain(new T.TorusGeometry(0.09, 0.016, 8, 20), m.iron, 2.05, 1.0, -7.29, false);
    void ring;
    const blocks: { p: [number, number, number]; r?: [number, number, number]; s?: [number, number, number] }[] = [];
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI - (i / 8) * Math.PI;
      blocks.push({ p: [1.5 + Math.cos(a) * 1.02, 1.9 + Math.sin(a) * 1.02, -6.96], r: [0, 0, a - Math.PI / 2], s: [0.3, 0.34, 0.14] });
    }
    for (const sx of [0.48, 2.52]) for (let j = 0; j < 4; j++) blocks.push({ p: [sx, 0.24 + j * 0.47, -6.96], s: [j % 2 ? 0.3 : 0.36, 0.44, 0.14] });
    inst(new T.BoxGeometry(1, 1, 1), m.stone, blocks, false);
    if (late()) yield;
    // 벽 횃불 둘
    const t1 = torchBracket(T, m, geos);
    t1.g.position.set(-1.6, 1.95, -7.0);
    const t2 = torchBracket(T, m, geos);
    t2.g.position.set(-7.0, 1.95, 1.0);
    t2.g.rotation.y = Math.PI / 2;
    world.add(t1.g, t2.g);
    wallTorch.push(t1.flame, t2.flame);
    // 상자 · 통 · 보물 상자 · 금화 · 돌 부스러기
    inst(new T.BoxGeometry(0.9, 0.9, 0.9), m.wood, [
      { p: [5.55, 0.45, -6.3], r: [0, 0.12, 0] },
      { p: [4.55, 0.45, -6.4], r: [0, -0.1, 0] },
      { p: [5.1, 1.35, -6.3], r: [0, 0.32, 0] },
      { p: [6.25, 0.45, -5.15], r: [0, 0.55, 0] },
      { p: [5.4, 0.36, 5.6], r: [0, 0.3, 0], s: 0.8 },
    ]);
    const barrel = new T.LatheGeometry(
      [
        [0.001, 0],
        [0.3, 0],
        [0.355, 0.22],
        [0.375, 0.45],
        [0.355, 0.68],
        [0.3, 0.9],
        [0.001, 0.9],
      ].map(([x, y]) => new T.Vector2(x, y)),
      28,
    );
    const BR: [number, number][] = [
      [-6.3, 3.5],
      [-6.25, 4.42],
      [-5.45, 4.0],
    ];
    inst(barrel, m.barrel, BR.map(([x, z], i) => ({ p: [x, 0, z], r: [0, i * 1.3, 0] })));
    const hoops: { p: [number, number, number]; r: [number, number, number]; s: [number, number, number] }[] = [];
    for (const [x, z] of BR)
      for (const [y, rr] of [
        [0.2, 0.36],
        [0.7, 0.35],
      ] as const)
        hoops.push({ p: [x, y, z], r: [Math.PI / 2, 0, 0], s: [rr / 0.36, rr / 0.36, 1] });
    inst(new T.TorusGeometry(0.36, 0.018, 6, 32), m.iron, hoops);
    if (late()) yield;
    const chest = new T.Group();
    chest.position.set(-6.0, 0, -1.1);
    chest.rotation.y = Math.PI / 2 - 0.1;
    world.add(chest);
    const cm = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
      const o = new T.Mesh(G(geo), mat);
      o.position.set(x, y, z);
      o.castShadow = o.receiveShadow = true;
      chest.add(o);
      return o;
    };
    cm(new T.BoxGeometry(1.2, 0.62, 0.72), m.wood, 0, 0.31, 0);
    cm(new T.CylinderGeometry(0.36, 0.36, 1.2, 24, 1, false, 0, Math.PI), m.wood, 0, 0.62, 0).rotation.z = Math.PI / 2;
    for (const x of [-0.42, 0, 0.42]) {
      cm(new T.BoxGeometry(0.07, 0.64, 0.74), m.iron, x, 0.31, 0);
      cm(new T.TorusGeometry(0.366, 0.022, 6, 20, Math.PI), m.iron, x, 0.62, 0).rotation.y = Math.PI / 2;
    }
    cm(new T.BoxGeometry(0.14, 0.16, 0.05), m.gold, 0, 0.56, 0.37);
    const crnd = rng(101);
    const coins: { p: [number, number, number]; r: [number, number, number] }[] = [];
    for (let i = 0; i < 90; i++) {
      const rr = Math.pow(crnd(), 0.8) * 0.75;
      const a = crnd() * TAU;
      const hgt = Math.max(0, 0.26 * (1 - rr / 0.75)) * (0.5 + 0.5 * crnd());
      coins.push({ p: [-5.05 + Math.sin(a) * rr * 0.8, 0.012 + hgt, -0.75 + Math.cos(a) * rr], r: [(crnd() - 0.5) * 1.2, crnd() * TAU, (crnd() - 0.5) * 1.2] });
    }
    inst(new T.CylinderGeometry(0.065, 0.065, 0.016, 16), m.gold, coins, false);
    const rrnd = rng(55);
    const rub: { p: [number, number, number]; r: [number, number, number]; s: [number, number, number] }[] = [];
    for (let i = 0; i < 34; i++) {
      const side = i % 4;
      const u = (rrnd() - 0.5) * 13;
      const v = 0.2 + rrnd() * 0.7;
      const x = side === 0 ? u : side === 1 ? -6.9 + v : side === 2 ? P4[i % 4]![0] + (rrnd() - 0.5) * 1.6 : u * 0.8;
      const z = side === 0 ? -6.9 + v : side === 1 ? u : side === 2 ? P4[i % 4]![1] + (rrnd() - 0.5) * 1.6 : 6.6 - v;
      const s = 0.5 + rrnd() * 1.1;
      rub.push({ p: [x, 0.05 * s, z], r: [rrnd() * 3, rrnd() * 3, rrnd() * 3], s: [s, s * 0.6, s * (0.7 + rrnd() * 0.5)] });
    }
    inst(new T.IcosahedronGeometry(0.13, 1), m.stone, rub);
    if (late()) yield;
    // 접촉 그늘
    const sN = shadowStrip(T, 15.4, 1.4);
    sN.position.set(0, 0.006, -6.3);
    const sW = shadowStrip(T, 15.4, 1.4);
    sW.position.set(-6.3, 0.006, 0);
    sW.rotation.z = Math.PI / 2;
    world.add(sN, sW);
    const blobAt = (x: number, z: number, s: number, o = 0.75): void => {
      const b = blob(s, o);
      b.position.set(x, 0.008, z);
      world.add(b);
    };
    for (const [x, z] of P4) blobAt(x, z, 2.4, 0.8);
    blobAt(5.2, -6.1, 3.2, 0.7);
    blobAt(-5.95, 4.0, 2.4, 0.7);
    blobAt(-5.95, -1.1, 2.2, 0.7);
    blobAt(5.4, 5.6, 1.4, 0.6);
    // 기사
    K = buildKnight(T, m);
    K.root.scale.setScalar(1.3);
    world.add(K.root);
    heroBlob = blob(1.0, 0.7);
    world.add(heroBlob);
    if (late()) yield;
    world.updateMatrixWorld(true);
    wallTorch.forEach((f, i) => f.getWorldPosition(fp[i]!));
    texs = sceneTex(world);
    for (const p of parts) p.visible = true;
    for (const [a, b] of halos) a.visible = b.visible = true;
    built = true;
  }
  loadKit().then((k) => {
    if (dead) return;
    hdrTex = k.hdr;
    job.start(build(k));
  });

  let walking = true;
  let s = 0;
  let mul = 1;
  let shadows = true;
  const warm = new Warm();
  const tgt = new T.Vector3();
  const OFF = new T.Vector3(8.6, 12.4, 9.8);
  update0();
  function update0(): void {
    cam.position.copy(OFF);
    cam.lookAt(0, 0, 0);
  }

  return {
    scene,
    camera: cam,
    update(t, dt) {
      if (job.busy) job.step(3);
      uTime.value = t;
      if (!built || !K) return;
      if (walking) s += Math.min(dt, 0.05) * 0.42;
      const rx = 2.25;
      const rz = 1.85;
      const cz = -0.2;
      const x = Math.cos(s) * rx;
      const z = cz + Math.sin(s) * rz;
      const dx = -Math.sin(s) * rx;
      const dz = Math.cos(s) * rz;
      const ph = s * 9.5;
      const sw = walking ? 1 : 0;
      K.root.position.set(x, Math.abs(Math.sin(ph)) * 0.035 * sw, z);
      K.root.rotation.y = Math.atan2(dx, dz);
      K.legL.rotation.x = Math.sin(ph) * 0.55 * sw;
      K.legR.rotation.x = -Math.sin(ph) * 0.55 * sw;
      K.armL.rotation.x = -Math.sin(ph) * 0.3 * sw - 0.15;
      K.armR.rotation.x = -1.15 + Math.sin(ph) * 0.06 * sw;
      heroBlob!.position.set(x, 0.009, z);
      // 망토 — 아래로 갈수록 뒤로 날리고 물결
      const pa = K.cape.geometry.attributes.position!;
      const arr = pa.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        const bx = K.capeBase[i]!;
        const by = K.capeBase[i + 1]!;
        const k = Math.max(0, -by / 0.9);
        const pleat = Math.sin(bx * 34 + 0.6) * 0.022 * (0.3 + k);
        arr[i + 2] = -Math.pow(k, 1.4) * (0.1 + 0.16 * sw) + Math.sin(t * 6.5 + k * 4.2 + bx * 3) * 0.045 * k - bx * bx * 1.6 * (1 - k * 0.5) + pleat;
        arr[i] = bx * (0.72 + k * 0.5);
        arr[i + 1] = by - (bx * bx * 0.9) * k;
      }
      pa.needsUpdate = true;
      K.cape.geometry.computeVertexNormals();
      K.root.updateMatrixWorld(true);
      K.flame.getWorldPosition(fp[2]!);
      for (let i = 0; i < 3; i++) {
        const f = flick(t, i * 2.1);
        const l = lights[i]!;
        l.position.copy(fp[i]!).y += 0.14;
        l.intensity = BASE[i]! * f * mul;
        lp[i]!.copy(l.position);
        lit.setComponent(i, f * mul * (i === 2 ? 1.2 : 1));
        const [a, b] = halos[i]!;
        a.position.copy(fp[i]!).y += 0.1;
        b.position.copy(fp[i]!).y += 0.1;
        a.scale.setScalar(0.5 * (0.85 + 0.3 * f) * Math.sqrt(mul));
        b.scale.setScalar(2.3 * f * Math.sqrt(mul));
      }
      tgt.set(x * 0.45, 0.6, cz * 0.55 + z * 0.45 - 0.6);
      cam.position.copy(tgt).add(OFF);
      cam.lookAt(tgt);
    },
    render(r, w, h) {
      if (!built) return waiting(r, w, h, hud, msg, job.busy ? '던전 짓는 중 …' : '실사 재질 받는 중 …');
      if (!pump(r, texs)) return waiting(r, w, h, hud, msg, 'GPU 에 텍스처 올리는 중 …');
      if (hdrTex) {
        const env = envFor(r, hdrTex);
        if (!env) return waiting(r, w, h, hud, msg, 'HDRI 빛 굽는 중 …');
        scene.environment = env;
        scene.environmentIntensity = 0.06;
      }
      uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
      const ok = warm.ready(r, (rr) => withShadows(rr, shadows, () => rr.compileAsync(scene, cam)));
      if (!ok) return waiting(r, w, h, hud, msg, '셰이더 굽는 중 …');
      msg.visible = false;
      note.visible = true;
      r.setClearColor(BG, 1);
      withShadows(r, shadows, () => r.render(scene, cam));
      hud.draw(r, w, h);
    },
    controls: [
      { type: 'toggle', label: '영웅 횃불 그림자', value: true, on: (v) => ((shadows = v), (hero.castShadow = v), warm.reset()) },
      { type: 'range', label: '횃불 세기', min: 0.3, max: 2, step: 0.05, value: 1, on: (v) => (mul = v) },
      { type: 'range', label: '안개 거리', min: 24, max: 70, step: 1, value: 40, on: (v) => ((fog.far = v), (fog.near = v * 0.5)) },
      { type: 'toggle', label: '영웅 걷기', value: true, on: (v) => (walking = v) },
    ],
    dispose() {
      dead = true;
      for (const g of geos) g.dispose();
      disposeTree(world);
      for (const p of [flameMat, emberMat, dustMat]) p.dispose();
      for (const [a, b] of halos) (a.material.dispose(), b.material.dispose());
      hud.dispose();
    },
  };
}

/* ───────────── i478 LOD · 텍스처 예산 ───────────── */

/** 홈 파인 돌기둥 — radial · rows · flutes 로 정밀도를 정한다 */
function lodColumn(T: typeof THREE, radial: number, rows: number, flutes: number): THREE.BufferGeometry {
  const prof = columnProfile(3.4, 0.34, rows);
  const H = 3.4;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const shaft0 = 6;
  const shaft1 = 6 + rows;
  prof.forEach((p, j) => {
    for (let i = 0; i <= radial; i++) {
      const a = (i / radial) * TAU;
      let r = p.x;
      if (flutes > 0 && j > shaft0 && j < shaft1) r *= 1 - 0.065 * Math.pow(0.5 + 0.5 * Math.cos(a * flutes), 2);
      pos.push(Math.sin(a) * r, p.y, Math.cos(a) * r);
      uv.push((i / radial) * 2, (p.y / H) * 2.2);
    }
  });
  const n = radial + 1;
  for (let j = 0; j < prof.length - 1; j++)
    for (let i = 0; i < radial; i++) {
      const a = j * n + i;
      const b = a + n;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const LOD_TINT = [0x9dffa8, 0xffe27a, 0xff8a7a];
const SIZES = [256, 512, 1024];

function makeLod(T: typeof THREE): Scene3D {
  const scene = new T.Scene();
  const BG = 0x0d0f16;
  scene.background = new T.Color(BG);
  scene.fog = new T.Fog(BG, 20, 58);
  const cam = new T.PerspectiveCamera(50, 1.6, 0.1, 120);
  const hud = new Hud();
  const msg = hud.label('재질 받는 중 …', 0.5, 0.5, 0.5, 0.5, 'tag', 0.8);
  const top = hud.label('초록 정밀 · 노랑 중간 · 빨강 단순', 0.5, 0.965, 0.5, 1, 'tag', 0.62);
  top.maxW = 0.9;
  const board = hud.board(0.015, 0.03, 0, 0, 0.95);
  top.visible = false;
  board.spr.visible = false;

  scene.add(new T.HemisphereLight(0xcfdcff, 0x302820, 0.6));
  const sun = new T.DirectionalLight(0xfff0dc, 2.2);
  sun.position.set(-6, 10, 4);
  scene.add(sun);
  const geos = [lodColumn(T, 96, 40, 16), lodColumn(T, 20, 8, 0), lodColumn(T, 6, 1, 0)];
  const triOf = geos.map((g) => g.index!.count / 3);
  const floorG = new T.PlaneGeometry(26, 76);
  const wallG = new T.PlaneGeometry(76, 5.5);
  const lods: THREE.LOD[] = [];
  let mats: THREE.MeshStandardMaterial[] = [];
  let floorM: THREE.MeshStandardMaterial | null = null;
  let wallM: THREE.MeshStandardMaterial | null = null;
  const floor = new T.Mesh(floorG);
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = -22;
  const wl = new T.Mesh(wallG);
  wl.position.set(-7, 2.75, -22);
  wl.rotation.y = Math.PI / 2;
  const wr = new T.Mesh(wallG);
  wr.position.set(7, 2.75, -22);
  wr.rotation.y = -Math.PI / 2;
  const holder = new T.Group();
  holder.visible = false;
  holder.add(floor, wl, wr);
  scene.add(holder);
  const COUNT = 22;
  for (let k = 0; k < COUNT; k++) {
    const lod = new T.LOD();
    lod.position.set(k % 2 ? 3.8 : -3.8, 0, 6 - Math.floor(k / 2) * 5.6);
    for (let i = 0; i < 3; i++) {
      const m = new T.Mesh(geos[i]!);
      lod.addLevel(m, [0, 9, 22][i]!);
    }
    holder.add(lod);
    lods.push(lod);
  }

  let sizeI = 2;
  let cur: { size: number; pbr: { brick: PBR; rock: PBR } } | null = null;
  let tint = true;
  let useLod = true;
  let moving = true;
  let now = 0;
  let dead = false;
  const warm = new Warm();
  const applyMats = (): void => {
    if (!cur) return;
    for (const m of mats) m.dispose();
    floorM?.dispose();
    wallM?.dispose();
    const { brick, rock } = cur.pbr;
    mats = [0, 1, 2].map(() => pbrMat(brick, 1, 1));
    floorM = pbrMat(rock, 8, 24);
    wallM = pbrMat(brick, 22, 1.6);
    floor.material = floorM;
    wl.material = wr.material = wallM;
    for (const lod of lods) lod.levels.forEach((lv, i) => ((lv.object as THREE.Mesh).material = mats[i]!));
    paint();
  };
  const paint = (): void => mats.forEach((m, i) => m.color.set(tint ? LOD_TINT[i]! : 0xffffff));
  const want = (i: number): void => {
    sizeI = i;
    const sz = SIZES[i]!;
    Promise.all([loadPBR('brick', sz), loadPBR('rock', sz)]).then(([brick, rock]) => {
      if (dead || SIZES[sizeI] !== sz) return;
      cur = { size: sz, pbr: { brick, rock } };
      applyMats();
      holder.visible = true;
    });
  };
  want(2);
  const kb1k = KB1K.brick.diff + KB1K.brick.nor + KB1K.brick.arm + KB1K.rock.diff + KB1K.rock.nor + KB1K.rock.arm;
  const dlK = [0.085, 0.28, 1];
  let stat = { tri: 0, calls: 0 };
  let lastBoard = -1;

  return {
    scene,
    camera: cam,
    update(t) {
      if (moving) now = t;
      const k = 0.5 - 0.5 * Math.cos(now * 0.32);
      const z = 9 - k * 34;
      cam.position.set(Math.sin(now * 0.21) * 1.2, 2.3, z);
      cam.lookAt(0, 1.5, z - 12);
      for (const lod of lods) {
        lod.autoUpdate = useLod;
        if (!useLod) lod.levels.forEach((lv, i) => (lv.object.visible = i === 0));
      }
    },
    render(r, w, h) {
      if (!cur) return waiting(r, w, h, hud, msg, '재질 받는 중 …');
      if (!pump(r, sceneTex(holder))) return waiting(r, w, h, hud, msg, 'GPU 에 텍스처 올리는 중 …');
      const ok = warm.ready(r, (rr) => withShadows(rr, false, () => rr.compileAsync(scene, cam)));
      if (!ok) return waiting(r, w, h, hud, msg, '셰이더 굽는 중 …');
      msg.visible = false;
      top.visible = tint;
      board.spr.visible = true;
      withShadows(r, false, () => r.render(scene, cam));
      const inf = r.info.render;
      stat = { tri: inf.triangles, calls: inf.calls };
      const q = Math.floor(performance.now() / 250);
      if (q !== lastBoard) {
        lastBoard = q;
        const full = triOf[0]! * COUNT;
        const rows: [string, string, boolean?][] = [[`삼각형 ${fmt(stat.tri)} · 그리기 ${stat.calls}번`, '#ffffff', true]];
        rows.push([useLod ? `LOD 끄면 기둥만 ${fmt(full)}개` : `LOD 꺼짐 — 모두 정밀 (${fmt(triOf[0]!)}/개)`, '#aab4c8']);
        SIZES.slice()
          .reverse()
          .forEach((s) => {
            const i = SIZES.indexOf(s);
            const mb = (6 * s * s * 4 * (4 / 3)) / 1048576;
            const dl = (kb1k * dlK[i]!) / 1024;
            const on = i === sizeI;
            rows.push([`${on ? '▶ ' : '   '}${s}² 텍스처 6장 · GPU ${mb.toFixed(1)}MB · 받기 ${i === 2 ? '' : '약 '}${dl.toFixed(1)}MB`, on ? '#ffd166' : '#8890a4', on]);
          });
        board.set('LOD · 텍스처 예산', rows);
      }
      hud.draw(r, w, h);
    },
    controls: [
      { type: 'toggle', label: 'LOD 쓰기', value: true, on: (v) => (useLod = v) },
      { type: 'toggle', label: '단계 색 보기', value: true, on: (v) => ((tint = v), paint()) },
      { type: 'range', label: '텍스처 크기 (0=256 · 1=512 · 2=1024)', min: 0, max: 2, step: 1, value: 2, on: (v) => want(v) },
      { type: 'toggle', label: '카메라 움직이기', value: true, on: (v) => (moving = v) },
    ],
    dispose() {
      dead = true;
      for (const g of geos) g.dispose();
      floorG.dispose();
      wallG.dispose();
      for (const m of mats) m.dispose();
      floorM?.dispose();
      wallM?.dispose();
      hud.dispose();
    },
  };
}

/* ───────────── i479 데칼 — 표면을 따라 붙는 그림 조각 ───────────── */

type Draw = (g: CanvasRenderingContext2D, w: number, h: number, rnd: () => number) => void;
/** 낡은 느낌 — 작은 점들을 지워 페인트가 벗겨진 듯 */
function wear(g: CanvasRenderingContext2D, w: number, h: number, rnd: () => number, n: number, rmax: number): void {
  g.save();
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < n; i++) {
    g.globalAlpha = 0.3 + rnd() * 0.7;
    g.beginPath();
    g.arc(rnd() * w, rnd() * h, 0.6 + rnd() * rmax, 0, TAU);
    g.fill();
  }
  g.restore();
}
const DECAL_DRAW: Record<string, [number, number, Draw]> = {
  hazard: [
    256,
    256,
    (g, w, h, rnd) => {
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(w / 2, 22);
      g.lineTo(w - 18, h - 30);
      g.lineTo(18, h - 30);
      g.closePath();
      g.fillStyle = '#f5c518';
      g.fill();
      g.lineWidth = 16;
      g.strokeStyle = '#141414';
      g.stroke();
      g.fillStyle = '#141414';
      g.beginPath();
      g.roundRect(w / 2 - 11, 86, 22, 82, 8);
      g.fill();
      g.beginPath();
      g.arc(w / 2, 192, 13, 0, TAU);
      g.fill();
      wear(g, w, h, rnd, 260, 2.6);
    },
  ],
  serial: [
    512,
    160,
    (g, w, h, rnd) => {
      g.fillStyle = 'rgba(240,240,232,0.95)';
      g.font = `900 92px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('No. 07-342', w / 2, h / 2 + 4, w - 20);
      g.globalCompositeOperation = 'destination-out';
      for (let x = 40; x < w; x += 47) g.fillRect(x + rnd() * 6, 0, 3, h); // 스텐실 다리
      g.globalCompositeOperation = 'source-over';
      wear(g, w, h, rnd, 420, 2.4);
    },
  ],
  scratch: [
    256,
    256,
    (g, w, h, rnd) => {
      g.lineCap = 'round';
      for (let i = 0; i < 46; i++) {
        const x = rnd() * w;
        const y = rnd() * h;
        const a = -0.5 + (rnd() - 0.5) * 0.7;
        const L = 30 + rnd() * 120;
        g.strokeStyle = `rgba(20,16,12,${0.25 + rnd() * 0.3})`;
        g.lineWidth = 2.6;
        g.beginPath();
        g.moveTo(x + 1, y + 1.5);
        g.lineTo(x + Math.cos(a) * L + 1, y + Math.sin(a) * L + 1.5);
        g.stroke();
        g.strokeStyle = `rgba(235,232,225,${0.45 + rnd() * 0.5})`;
        g.lineWidth = 0.8 + rnd() * 1.4;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L);
        g.stroke();
      }
      // 가장자리로 갈수록 옅게
      g.globalCompositeOperation = 'destination-in';
      const rg = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
      rg.addColorStop(0, 'rgba(0,0,0,1)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg;
      g.fillRect(0, 0, w, h);
    },
  ],
  soot: [
    256,
    256,
    (g, w, h, rnd) => {
      for (let i = 0; i < 70; i++) {
        const a = rnd() * TAU;
        const d = Math.pow(rnd(), 0.7) * w * 0.32;
        const x = w / 2 + Math.cos(a) * d;
        const y = h / 2 + Math.sin(a) * d * 0.9 - d * 0.25;
        const r = 14 + rnd() * 46;
        const rg = g.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, `rgba(8,6,5,${0.18 + rnd() * 0.16})`);
        rg.addColorStop(1, 'rgba(8,6,5,0)');
        g.fillStyle = rg;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      const rg = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.2);
      rg.addColorStop(0, 'rgba(4,3,2,0.85)');
      rg.addColorStop(1, 'rgba(4,3,2,0)');
      g.fillStyle = rg;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) {
        const a = rnd() * TAU;
        const d = rnd() * w * 0.42;
        g.fillStyle = `rgba(0,0,0,${rnd() * 0.35})`;
        g.fillRect(w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, 1.5, 1.5);
      }
    },
  ],
  hole: [
    128,
    128,
    (g, w, h, rnd) => {
      const c = w / 2;
      g.strokeStyle = 'rgba(20,16,14,0.7)';
      g.lineWidth = 1.6;
      for (let i = 0; i < 7; i++) {
        const a = rnd() * TAU;
        const L = 22 + rnd() * 34;
        g.beginPath();
        g.moveTo(c, c);
        g.lineTo(c + Math.cos(a) * L * 0.5 + (rnd() - 0.5) * 8, c + Math.sin(a) * L * 0.5 + (rnd() - 0.5) * 8);
        g.lineTo(c + Math.cos(a) * L, c + Math.sin(a) * L);
        g.stroke();
      }
      let rg = g.createRadialGradient(c, c, 6, c, c, 30);
      rg.addColorStop(0, 'rgba(70,60,54,0.9)');
      rg.addColorStop(0.6, 'rgba(150,140,130,0.5)');
      rg.addColorStop(1, 'rgba(150,140,130,0)');
      g.fillStyle = rg;
      g.fillRect(0, 0, w, h);
      rg = g.createRadialGradient(c - 2, c - 2, 0, c, c, 11);
      rg.addColorStop(0, 'rgba(0,0,0,1)');
      rg.addColorStop(0.8, 'rgba(10,8,6,1)');
      rg.addColorStop(1, 'rgba(10,8,6,0)');
      g.fillStyle = rg;
      g.beginPath();
      g.arc(c, c, 12, 0, TAU);
      g.fill();
    },
  ],
  label: [
    512,
    170,
    (g, w, h, rnd) => {
      g.fillStyle = '#c02626';
      g.beginPath();
      g.roundRect(6, 6, w - 12, h - 12, 18);
      g.fill();
      g.strokeStyle = '#ffffff';
      g.lineWidth = 6;
      g.beginPath();
      g.roundRect(18, 18, w - 36, h - 36, 12);
      g.stroke();
      // 불꽃 그림
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(92, 138);
      g.bezierCurveTo(48, 130, 52, 80, 86, 40);
      g.bezierCurveTo(88, 70, 104, 72, 106, 58);
      g.bezierCurveTo(132, 90, 132, 132, 92, 138);
      g.fill();
      g.font = `900 78px ${FONT}`;
      g.textBaseline = 'middle';
      g.fillText('화기 엄금', 150, h / 2 + 4, w - 170);
      wear(g, w, h, rnd, 380, 2.6);
    },
  ],
  stencil: [
    256,
    256,
    (g, w, h, rnd) => {
      g.fillStyle = 'rgba(236,232,220,0.92)';
      g.font = `900 150px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('B-2', w / 2, h / 2 - 8, w - 16);
      wear(g, w, h, rnd, 700, 2.2);
    },
  ],
};
const decalTex = new Map<string, THREE.CanvasTexture>();
function decalMap(name: string): THREE.CanvasTexture {
  let t = decalTex.get(name);
  if (!t) {
    const [w, h, draw] = DECAL_DRAW[name]!;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d')!, w, h, rng(name.length * 97 + w));
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 16;
    decalTex.set(name, t);
  }
  return t;
}

interface DecalSpec {
  on: 'crate' | 'barrel' | 'wall';
  p: [number, number, number];
  n: [number, number, number];
  s: [number, number, number];
  rot: number;
  tex: string;
  metal?: boolean;
}
const DECALS: DecalSpec[] = [
  { on: 'crate', p: [0, 0.17, 0.55], n: [0, 0, 1], s: [0.5, 0.5, 0.3], rot: 0.05, tex: 'hazard' },
  { on: 'crate', p: [0, -0.3, 0.55], n: [0, 0, 1], s: [0.66, 0.2, 0.3], rot: 0, tex: 'serial' },
  { on: 'crate', p: [0.55, 0.05, 0.05], n: [1, 0, 0], s: [0.9, 0.9, 0.3], rot: 0.3, tex: 'scratch', metal: true },
  { on: 'barrel', p: [Math.sin(0.25) * 0.42, 0.12, Math.cos(0.25) * 0.42], n: [Math.sin(0.25), 0, Math.cos(0.25)], s: [0.95, 0.32, 0.62], rot: 0, tex: 'label' },
  { on: 'barrel', p: [Math.sin(-0.6) * 0.42, -0.3, Math.cos(-0.6) * 0.42], n: [Math.sin(-0.6), 0, Math.cos(-0.6)], s: [0.6, 0.6, 0.5], rot: 1.2, tex: 'scratch', metal: true },
  { on: 'wall', p: [0.35, 0.05, 0.15], n: [0, 0, 1], s: [1.7, 1.7, 0.4], rot: 0, tex: 'soot' },
  { on: 'wall', p: [-1.75, 0.55, 0.15], n: [0, 0, 1], s: [0.24, 0.24, 0.3], rot: 0.4, tex: 'hole' },
  { on: 'wall', p: [-1.42, 0.22, 0.15], n: [0, 0, 1], s: [0.22, 0.22, 0.3], rot: 2.1, tex: 'hole' },
  { on: 'wall', p: [-1.95, 0.02, 0.15], n: [0, 0, 1], s: [0.26, 0.26, 0.3], rot: 4.0, tex: 'hole' },
  { on: 'wall', p: [1.95, 0.55, 0.15], n: [0, 0, 1], s: [0.9, 0.9, 0.3], rot: -0.06, tex: 'stencil' },
];

function makeDecals(T: typeof THREE): Scene3D {
  const scene = new T.Scene();
  scene.background = new T.Color(0x0e1017);
  const cam = new T.PerspectiveCamera(34, 1.6, 0.1, 60);
  const hud = new Hud();
  const msg = hud.label('재질 받는 중 …', 0.5, 0.5, 0.5, 0.5, 'tag', 0.8);
  const count = hud.label('', 0.5, 0.965, 0.5, 1, 'tag', 0.62);
  count.maxW = 0.9;
  count.visible = false;

  scene.add(new T.HemisphereLight(0xd8e4ff, 0x30281e, 0.45));
  const sun = new T.DirectionalLight(0xfff0e0, 2.0);
  sun.position.set(-3, 5, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 3.5, bottom: -1, near: 1, far: 16 });
  sun.shadow.bias = -0.0007;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  const root = new T.Group();
  root.visible = false;
  scene.add(root);
  const mk = (g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0): THREE.Mesh => {
    const m = new T.Mesh(g);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    return m;
  };
  const floor = mk(new T.PlaneGeometry(9, 5), 0, 0, 0.6);
  floor.rotation.x = -Math.PI / 2;
  floor.castShadow = false;
  const wall = mk(new T.BoxGeometry(6.4, 3.2, 0.3), 0, 1.6, -1.1);
  const crate = mk(new T.BoxGeometry(1.1, 1.1, 1.1), -1.05, 0.55, 0.25, 0.55);
  const barrel = mk(new T.CylinderGeometry(0.42, 0.42, 1.15, 72, 6), 1.05, 0.575, 0.1, -0.2);
  const ringG = new T.TorusGeometry(0.425, 0.022, 8, 72);
  for (const y of [-0.42, 0.42]) {
    const r = new T.Mesh(ringG);
    r.rotation.x = Math.PI / 2;
    r.position.y = y;
    r.castShadow = true;
    barrel.add(r);
  }
  const blobs = [blob(2.0, 0.6), blob(1.4, 0.6)];
  blobs[0]!.position.set(-1.05, 0.004, 0.25);
  blobs[1]!.position.set(1.05, 0.004, 0.1);
  root.add(...blobs);
  root.updateMatrixWorld(true);
  const target: Record<DecalSpec['on'], THREE.Mesh> = { crate, barrel, wall };

  const decals: { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; t0: number }[] = [];
  const job = new Job();
  function* build(): Gen {
    const helper = new T.Object3D();
    const pos = new T.Vector3();
    const nrm = new T.Vector3();
    for (let i = 0; i < DECALS.length; i++) {
      const d = DECALS[i]!;
      const m = target[d.on];
      pos.set(...d.p).applyMatrix4(m.matrixWorld);
      nrm.set(...d.n).transformDirection(m.matrixWorld);
      helper.position.copy(pos);
      helper.lookAt(pos.clone().add(nrm));
      helper.rotateZ(d.rot);
      const geo = new DecalGeometry(m, pos, helper.rotation.clone(), new T.Vector3(...d.s));
      geo.translate(-pos.x, -pos.y, -pos.z);
      if (late()) yield;
      const map = decalMap(d.tex);
      const mat = new T.MeshStandardMaterial({
        map,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
        roughness: d.tex === 'soot' ? 1 : d.metal ? 0.32 : 0.6,
        metalness: d.metal ? 0.85 : 0,
        emissive: 0xffffff,
        emissiveMap: map,
        emissiveIntensity: 0,
      });
      const mesh = new T.Mesh(geo, mat);
      mesh.position.copy(pos);
      mesh.receiveShadow = true;
      mesh.renderOrder = 2 + i;
      mesh.visible = false;
      root.add(mesh);
      decals.push({ mesh, mat, t0: 0.5 + i * 0.62 });
      if (late()) yield;
    }
  }
  job.start(build());

  let kit: Kit | null = null;
  let dead = false;
  let mats: THREE.MeshStandardMaterial[] = [];
  let ringM: THREE.MeshStandardMaterial | null = null;
  loadKit().then((k) => {
    if (dead) return;
    kit = k;
    const p = k.pbr;
    const crateM = pbrMat(p.metal, 1, 1, { color: 0xc8d89a, metalness: 0.3 }); // 칠한 쇠 — 금속감은 줄이고 색을 살린다
    const barrelM = pbrMat(p.metal, 2, 1, { color: 0x9cbcf0, metalness: 0.3 });
    const wallM = pbrMat(p.brick, 2.4, 1.2);
    const floorM = pbrMat(p.rock, 3, 1.7);
    ringM = pbrMat(p.metal, 3, 0.2, { color: 0x6a6a70 });
    mats = [crateM, barrelM, wallM, floorM, ringM];
    crate.material = crateM;
    barrel.material = barrelM;
    wall.material = wallM;
    floor.material = floorM;
    for (const c of barrel.children) (c as THREE.Mesh).material = ringM;
    root.visible = true;
  });
  let clock = 0;
  let base = 0;
  let loop = true;
  let show = true;
  let orbit = 0;
  const warm = new Warm();
  const tgt = new T.Vector3(0, 0.95, 0);
  const CYC = 9.4;

  return {
    scene,
    camera: cam,
    update(t) {
      if (job.busy) job.step(3);
      orbit = t;
      let lt = t - base;
      if (loop) lt %= CYC;
      clock = lt;
      let n = 0;
      for (const d of decals) {
        const a = lt - d.t0;
        const fade = loop ? clamp((CYC - 0.6 - lt) / 0.5, 0, 1) : 1;
        const vis = show && a > 0 && fade > 0;
        d.mesh.visible = vis;
        if (!vis) continue;
        n++;
        const pop = clamp(a / 0.14, 0, 1);
        d.mat.opacity = pop * fade;
        d.mat.emissiveIntensity = Math.max(0, 1 - a / 0.4) * 0.9;
        d.mesh.scale.setScalar(1 + (1 - pop) * 0.35);
      }
      count.set(show ? `데칼 ${n} / ${DECALS.length}장 붙음` : '데칼 끔 — 맨 표면');
    },
    render(r, w, h) {
      if (!kit || job.busy) return waiting(r, w, h, hud, msg, '재질 받는 중 …');
      if (!pump(r, [...sceneTex(root), ...decals.map((d) => d.mat.map!)])) return waiting(r, w, h, hud, msg, 'GPU 에 올리는 중 …');
      if (kit.hdr) {
        const env = envFor(r, kit.hdr);
        if (!env) return waiting(r, w, h, hud, msg, 'HDRI 빛 굽는 중 …');
        scene.environment = env;
        scene.environmentIntensity = 1.0;
      }
      const a = Math.sin(orbit * 0.3) * 0.38;
      const c = fit(cam, w / h, tgt, 2.25, new T.Vector3(Math.sin(a), 0.32, Math.cos(a)));
      const ok = warm.ready(r, (rr) =>
        withShadows(rr, true, () => {
          for (const d of decals) d.mesh.visible = true;
          const pr = rr.compileAsync(scene, c);
          return pr;
        }),
      );
      if (!ok) return waiting(r, w, h, hud, msg, '셰이더 굽는 중 …');
      msg.visible = false;
      count.visible = true;
      void clock;
      withShadows(r, true, () => r.render(scene, c));
      hud.draw(r, w, h);
    },
    controls: [
      { type: 'button', label: '처음부터 다시 붙이기', on: () => ((base = orbit), (loop = true)) },
      { type: 'toggle', label: '데칼 보이기', value: true, on: (v) => (show = v) },
      { type: 'toggle', label: '반복', value: true, on: (v) => ((loop = v), (base = v ? base : orbit - 7)) },
    ],
    dispose() {
      dead = true;
      job.start((function* (): Gen {})());
      disposeTree(root);
      ringG.dispose();
      for (const m of mats) m.dispose();
      hud.dispose();
    },
  };
}

/* ───────────── 내보내기 ───────────── */

export const DEMOS: DemoMap = {
  i474: { kind: '3d', caption: '같은 벽 · 바닥 · 상자 · 기둥 — 단색 → 색 지도 → 법선 → AO·거칠기·금속, 낮게 훑는 빛', make: makePbrStages },
  i475: { kind: '3d', caption: '왼쪽 일반 조명 vs 오른쪽 HDRI 사진관 빛 — 크롬 · 유리 · 고무 · 톱니 · 금 고리', make: makeHdri },
  i477: { kind: '3d', caption: '내려다보는 던전 — 실사 돌 · 벽돌 · 나무, 일렁이는 횃불 그림자 · 안개 · 먼지 · 불티', make: makeDungeon },
  i478: { kind: '3d', caption: '기둥 22개가 거리마다 정밀 → 중간 → 단순 모델로 — 삼각형 · 텍스처 메모리 표', make: makeLod },
  i479: { kind: '3d', caption: '상자 · 통 · 벽 모양을 따라 붙는 경고 스티커 · 번호 · 긁힘 · 그을음 · 탄흔', make: makeDecals },
};

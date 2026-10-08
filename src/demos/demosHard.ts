import * as THREE from 'three';
import type { Control, DemoMap, Scene3D } from './types';
import { Blaster, FONT, clamp, envFor, getKit, hdrSettled, kitBuildMs, kitStats, kitStep, stepLog, loadHdr, triCount, type BPart, type Kit, type ScrewRef } from './lib/blaster';

/**
 * 견본 — 하드서피스 · 실사 렌더링 (SF 레이저 블래스터 하나를 모든 견본이 같이 쓴다)
 *  i468 윤곽 돌출 + 베벨 · i469 부품 조립(분해도) · i470 나사 · 패널선 · i471 무늬 · 각인 법선 맵
 *  i472 가장자리 닳음 · i473 렌즈 · 유리 · i476 FPS 1인칭 무기 연출
 * 모델 만들기는 lib/blaster.ts 의 생성기가 프레임당 3ms 씩 — 다 되기 전엔 「만드는 중」.
 * 그다음 compileAsync 로 셰이더를 미리 굽고 나서 그린다.
 */

type R = THREE.WebGLRenderer;
const TAU = Math.PI * 2;
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const ease = (k: number): number => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
const easeOut = (k: number): number => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const fmt = (n: number): string => Math.round(n).toLocaleString('ko-KR');

/* ───────────── 화면 글씨 · 선 · 네모 (HUD) ───────────── */

type LStyle = 'pill' | 'plain' | 'tag';
class Label {
  readonly canvas = document.createElement('canvas');
  tex = new THREE.CanvasTexture(this.canvas);
  readonly mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  aspect = 1;
  private key = '';
  private at = -1e9;
  set(text: string, color: string, style: LStyle): void {
    const k = text + '|' + color + '|' + style;
    if (k === this.key) return;
    const now = performance.now();
    if (this.key && now - this.at < 250) return;
    this.at = now;
    this.key = k;
    const F = 40;
    const g0 = this.canvas.getContext('2d')!;
    const font = `700 ${F}px ${FONT}`;
    g0.font = font;
    const W = Math.ceil(g0.measureText(text).width + F * (style === 'plain' ? 0.5 : 1.1));
    const H = Math.ceil(F * 1.55);
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
      this.tex.dispose();
      this.tex = new THREE.CanvasTexture(this.canvas);
    }
    const g = this.canvas.getContext('2d')!;
    g.clearRect(0, 0, W, H);
    if (style !== 'plain') {
      g.fillStyle = 'rgba(7,10,18,0.7)';
      g.beginPath();
      g.roundRect(1.5, 1.5, W - 3, H - 3, style === 'tag' ? 10 : H / 2);
      g.fill();
      if (style === 'tag') {
        g.strokeStyle = color;
        g.lineWidth = 3;
        g.stroke();
      }
    }
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (style === 'plain') {
      g.shadowColor = 'rgba(0,0,0,0.9)';
      g.shadowBlur = 8;
    }
    g.fillStyle = style === 'tag' ? '#ffffff' : color;
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

/** 화면 좌표(왼쪽 위 0,0 · 픽셀)로 글씨 · 선 · 네모를 얹는다. 매 프레임 부른 것만 보인다 */
class Hud {
  readonly scene = new THREE.Scene();
  readonly cam = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10);
  private labels = new Map<string, Label>();
  private rects = new Map<string, THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>();
  private used = new Set<string>();
  private lineGeo = new THREE.BufferGeometry();
  private linePos = new Float32Array(64 * 6);
  private lineN = 0;
  private lines: THREE.LineSegments;
  w = 1;
  h = 1;
  /** 글씨 크기 기준 (px) */
  get px(): number {
    return clamp(Math.min(this.h * 0.052, this.w * 0.034), 10, 24);
  }
  constructor() {
    this.lineGeo.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3));
    this.lines = new THREE.LineSegments(this.lineGeo, new THREE.LineBasicMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.85, depthTest: false, toneMapped: false }));
    this.lines.frustumCulled = false;
    this.scene.add(this.lines);
  }
  size(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }
  text(id: string, s: string, x: number, y: number, ax = 0, ay = 0, size = 1, color = '#ffffff', style: LStyle = 'pill'): number {
    let l = this.labels.get(id);
    if (!l) {
      l = new Label();
      this.labels.set(id, l);
      this.scene.add(l.mesh);
    }
    l.set(s, color, style);
    const hh = this.px * 1.55 * size;
    const ww = hh * l.aspect;
    l.mesh.scale.set(ww, hh, 1);
    l.mesh.position.set(x - ww * ax + ww / 2, this.h - (y - hh * ay + hh / 2), 1);
    l.mesh.renderOrder = 10;
    this.used.add('L' + id);
    return ww;
  }
  rect(id: string, x: number, y: number, w: number, h: number, color: number, alpha = 1): void {
    let m = this.rects.get(id);
    if (!m) {
      m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
      this.rects.set(id, m);
      this.scene.add(m);
    }
    m.material.color.setHex(color);
    m.material.opacity = alpha;
    m.scale.set(Math.max(0.01, w), Math.max(0.01, h), 1);
    m.position.set(x + w / 2, this.h - (y + h / 2), 0);
    this.used.add('R' + id);
  }
  line(x1: number, y1: number, x2: number, y2: number): void {
    if (this.lineN >= 64) return;
    const o = this.lineN++ * 6;
    this.linePos.set([x1, this.h - y1, 0, x2, this.h - y2, 0], o);
  }
  render(r: R): void {
    for (const [id, l] of this.labels) l.mesh.visible = this.used.has('L' + id);
    for (const [id, m] of this.rects) m.visible = this.used.has('R' + id);
    this.used.clear();
    this.lineGeo.setDrawRange(0, this.lineN * 2);
    (this.lineGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.lines.visible = this.lineN > 0;
    this.lineN = 0;
    const c = this.cam;
    c.left = 0;
    c.right = this.w;
    c.top = this.h;
    c.bottom = 0;
    c.updateProjectionMatrix();
    r.autoClear = false;
    r.clearDepth();
    r.render(this.scene, c);
    r.autoClear = true;
  }
  dispose(): void {
    for (const l of this.labels.values()) l.dispose();
    for (const m of this.rects.values()) {
      m.geometry.dispose();
      m.material.dispose();
    }
    this.lineGeo.dispose();
    (this.lines.material as THREE.Material).dispose();
  }
}

/** 와이어프레임 겹쳐 보기 (같은 모양 · 인스턴스도) */
class Wire {
  on = false;
  readonly mat = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, wireframe: true, transparent: true, opacity: 0.32, depthWrite: false, toneMapped: false });
  private list: { m: THREE.Mesh; w: THREE.Mesh }[] = [];
  track(list: THREE.Mesh[]): void {
    for (const m of list) {
      const im = m as THREE.InstancedMesh;
      let w: THREE.Mesh;
      if (im.isInstancedMesh) {
        const x = new THREE.InstancedMesh(m.geometry, this.mat, im.count);
        x.instanceMatrix = im.instanceMatrix;
        w = x;
      } else w = new THREE.Mesh(m.geometry, this.mat);
      w.renderOrder = 3;
      w.visible = false;
      w.frustumCulled = false;
      m.add(w);
      this.list.push({ m, w });
    }
  }
  sync(): void {
    for (const { m, w } of this.list) {
      w.visible = this.on && m.visible;
      if (w.visible && w.geometry !== m.geometry) w.geometry = m.geometry;
    }
  }
}

/* ───────────── 무대 바탕 ───────────── */

function gradientBg(top: string, mid: string, bot: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 256;
  const g = c.getContext('2d')!;
  const lg = g.createLinearGradient(0, 0, 0, 256);
  lg.addColorStop(0, top);
  lg.addColorStop(0.6, mid);
  lg.addColorStop(1, bot);
  g.fillStyle = lg;
  g.fillRect(0, 0, 8, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface ShowOpt {
  fov: number;
  near?: number;
  far?: number;
  bg?: [string, string, string];
  env?: number;
  lens?: boolean;
  stage?: number;
}
/**
 * 견본 하나의 틀: 장면 · 카메라 · 빛 · HUD · 와이어 + kit 기다리기 · 셰이더 미리 굽기.
 * build(kit) 는 kit 이 준비된 첫 프레임에 한 번.
 */
class Show {
  readonly scene = new THREE.Scene();
  readonly cam: THREE.PerspectiveCamera;
  readonly hud = new Hud();
  readonly wire = new Wire();
  readonly key = new THREE.DirectionalLight(0xffffff, 2.2);
  readonly rim = new THREE.DirectionalLight(0xa8ccff, 1.3);
  readonly holder = new THREE.Group();
  /** 준비 중엔 숨길 것 (카메라에 붙인 총 등) */
  readonly hide: THREE.Object3D[] = [];
  bl: Blaster | null = null;
  tris = 0;
  frameMs = 0;
  private bg: THREE.CanvasTexture;
  private t0 = performance.now();
  private compiled = false;
  private compiling = false;
  private progress = 0;
  private triAt = -1;
  private built = false;
  constructor(
    readonly o: ShowOpt,
    private build: (kit: Kit, bl: Blaster) => void,
  ) {
    loadHdr();
    this.cam = new THREE.PerspectiveCamera(o.fov, 16 / 10, o.near ?? 1, o.far ?? 2000);
    const [a, b, c] = o.bg ?? ['#1d2433', '#121722', '#0a0d14'];
    this.bg = gradientBg(a, b, c);
    this.scene.background = this.bg;
    this.scene.environmentIntensity = o.env ?? 1;
    this.key.position.set(-40, 70, 90);
    this.rim.position.set(60, 30, -80);
    this.scene.add(this.key, this.rim, this.holder);
  }
  /** 매 프레임 — kit 이 되면 true */
  tick(t: number): boolean {
    if (!this.built) {
      this.progress = kitStep(3);
      const kit = getKit();
      if (!kit) return false;
      this.built = true;
      this.bl = new Blaster(kit, { lensTransmission: !!this.o.lens, stage: this.o.stage ?? 7 });
      this.holder.add(this.bl.root);
      this.build(kit, this.bl);
      this.wire.track(this.bl.meshes);
    }
    this.bl!.update(t);
    if (t - this.triAt > 0.5) {
      this.triAt = t;
      this.tris = triCount(this.bl!.meshes);
    }
    this.wire.sync();
    return true;
  }
  /** draw 가 없으면 장면을 한 번 그린다. HUD 는 draw 뒤에 */
  render(r: R, w: number, h: number, draw?: () => void, hud?: () => void): void {
    const t0 = performance.now();
    this.hud.size(w, h);
    this.scene.environment = envFor(r);
    const ready = this.built && hdrSettled(this.t0);
    if (ready && !this.compiled && !this.compiling) {
      this.compiling = true;
      r.compileAsync(this.scene, this.cam)
        .catch(() => undefined)
        .finally(() => {
          this.compiled = true;
        });
    }
    if (!ready || !this.compiled) {
      this.holder.visible = false;
      for (const o of this.hide) o.visible = false;
      r.render(this.scene, this.cam);
      this.holder.visible = true;
      for (const o of this.hide) o.visible = true;
      const px = this.hud.px;
      const bw = Math.min(w * 0.5, px * 16);
      const k = this.built ? 1 : this.progress;
      this.hud.text('wait', this.built ? '셰이더 미리 굽는 중…' : `모델 만드는 중 · ${Math.round(k * 100)}%`, w / 2, h / 2 - px * 0.6, 0.5, 1, 1, '#dff6ff', 'plain');
      this.hud.rect('barbg', (w - bw) / 2, h / 2 + px * 0.2, bw, px * 0.32, 0x2a3346, 1);
      this.hud.rect('bar', (w - bw) / 2, h / 2 + px * 0.2, bw * k, px * 0.32, 0x5fd8ff, 1);
      this.hud.render(r);
      return;
    }
    if (draw) draw();
    else r.render(this.scene, this.cam);
    hud?.();
    this.hud.render(r);
    this.frameMs = lerp(this.frameMs, performance.now() - t0, 0.1);
  }
  /** 크게 보기 아래 정보 줄 (삼각형 · 만들기 시간) */
  info(extra = ''): void {
    const px = this.hud.px;
    this.hud.text('tri', `삼각형 ${fmt(this.tris)}${extra ? ' · ' + extra : ''}`, px * 0.7, this.hud.h - px * 0.7, 0, 1, 0.8, '#cfe3ff');
  }
  dispose(): void {
    this.bl?.dispose();
    this.hud.dispose();
    this.wire.mat.dispose();
    this.bg.dispose();
  }
}

/** 장면 좌표 → HUD 픽셀 */
function toScreen(v: THREE.Vector3, cam: THREE.Camera, w: number, h: number): { x: number; y: number; ok: boolean } {
  const p = v.clone().project(cam);
  return { x: (p.x * 0.5 + 0.5) * w, y: (1 - (p.y * 0.5 + 0.5)) * h, ok: p.z < 1 };
}
/** 화면 반쪽만 그리기 (가위) */
function scissorDraw(r: R, x: number, w: number, h: number, fn: () => void): void {
  r.setScissorTest(true);
  r.setScissor(x, 0, w, h);
  r.setViewport(0, 0, r.domElement.width, h);
  fn();
  r.setScissorTest(false);
}
const wireCtl = (s: Show): Control => ({ type: 'toggle', label: '와이어프레임', value: false, on: (v) => (s.wire.on = v) });

/** 카메라를 목표 둘레에 (yaw: 0 = +Z 쪽에서, elev: 위로 라디안) */
function orbit(cam: THREE.PerspectiveCamera, tx: number, ty: number, tz: number, d: number, yaw: number, elev: number): void {
  cam.position.set(tx + Math.sin(yaw) * Math.cos(elev) * d, ty + Math.sin(elev) * d, tz + Math.cos(yaw) * Math.cos(elev) * d);
  cam.lookAt(tx, ty, tz);
}
export const STAGE_NAMES = ['0 윤곽선', '1 돌출', '2 베벨', '3 부품 조립', '4 나사 · 패널선', '5 무늬 · 각인', '6 재질 · 닳음', '7 렌즈'];

/* ───────────── i468 옆모습 윤곽 돌출 + 베벨 ───────────── */

function demo468(): Scene3D {
  let auto = true;
  let manual = 2;
  let split = 0.5;
  let restart = 0;
  let now = 0;
  let triFlat = 0;
  let triBevel = 0;
  let phase = 0;
  let k = 1;
  const s = new Show({ fov: 26, stage: 2, env: 0.85 }, (_kit, bl) => {
    const c = bl.mats.clay;
    c.color.setHex(0x9ba2ac);
    c.metalness = 0.7;
    c.roughness = 0.28;
    bl.setStage(1);
    triFlat = triCount(bl.meshes);
    bl.setStage(2);
    triBevel = triCount(bl.meshes);
  });
  const lines = (fn: (l: THREE.LineSegments) => void): void => {
    for (const p of s.bl!.parts) for (const l of p.lines) fn(l);
  };
  return {
    scene: s.scene,
    camera: s.cam,
    update(t) {
      now = t;
      if (!s.tick(t)) return;
      const bl = s.bl!;
      const T = auto ? (t - restart) % 9.5 : 99;
      phase = auto ? (T < 2.4 ? 0 : T < 3.9 ? 1 : 2) : manual;
      k = auto ? (phase === 0 ? T / 2.2 : phase === 1 ? (T - 2.4) / 1.2 : 1) : 1;
      bl.root.scale.z = phase === 1 ? Math.max(0.02, easeOut(k)) : 1;
      const yaw = phase === 0 ? 0 : phase === 1 ? lerp(0, 0.62, ease(k)) : 0.62 + Math.sin(t * 0.45) * 0.16;
      const elev = phase === 0 ? 0 : phase === 1 ? lerp(0, 0.24, ease(k)) : 0.24;
      orbit(s.cam, phase === 0 ? 8 : 2, -3, 0, phase === 0 ? 150 : lerp(150, 100, phase === 1 ? ease(k) : 1), yaw, elev);
      const a = t * 0.8;
      s.key.position.set(Math.cos(a) * 80, 60, Math.sin(a) * 40 + 70);
      if (phase !== 2) bl.setStage(phase);
    },
    render(r, w, h) {
      s.render(
        r,
        w,
        h,
        () => {
          const bl = s.bl!;
          if (phase === 0) {
            lines((l) => l.geometry.setDrawRange(0, Math.floor(clamp(k, 0, 1) * l.geometry.getAttribute('position').count / 2) * 2));
            r.render(s.scene, s.cam);
            lines((l) => l.geometry.setDrawRange(0, Infinity));
          } else if (phase === 1) r.render(s.scene, s.cam);
          else {
            const sx = Math.round(w * split);
            bl.setStage(1);
            scissorDraw(r, 0, sx, h, () => r.render(s.scene, s.cam));
            bl.setStage(2);
            scissorDraw(r, sx, w - sx, h, () => r.render(s.scene, s.cam));
          }
        },
        () => {
          const H = s.hud;
          const px = H.px;
          if (phase === 0) H.text('ph', '① 2D 윤곽 그리기 — Shape (모서리마다 반지름)', px * 0.7, px * 0.7);
          else if (phase === 1) H.text('ph', '② 두께로 돌출 — ExtrudeGeometry', px * 0.7, px * 0.7);
          else {
            const sx = w * split;
            H.rect('div', sx - 1, 0, 2, h, 0xffffff, 0.85);
            H.text('l', '베벨 없음 · 모서리 칼날', sx - px * 0.6, px * 0.7, 1, 0, 0.9, '#ffb59a', 'tag');
            H.text('r', '베벨 있음 · 모서리에 빛', sx + px * 0.6, px * 0.7, 0, 0, 0.9, '#7fe3ff', 'tag');
          }
          void now;
          if (phase === 0) s.hud.text('tri', '윤곽 = 점을 이은 선 (구멍은 Shape.holes)', s.hud.px * 0.7, h - s.hud.px * 0.7, 0, 1, 0.8, '#cfe3ff');
          else s.info(`베벨 없음 ${fmt(triFlat)} → 있음 ${fmt(triBevel)}`);
        },
      );
    },
    controls: [
      { type: 'toggle', label: '자동 진행', value: true, on: (v) => (auto = v) },
      {
        type: 'range',
        label: '단계 (0 윤곽 · 1 돌출 · 2 베벨 비교)',
        min: 0,
        max: 2,
        step: 1,
        value: 2,
        on: (v) => {
          auto = false;
          manual = v;
        },
      },
      { type: 'range', label: '나눠 보기 위치', min: 0.15, max: 0.85, step: 0.01, value: 0.5, on: (v) => (split = v) },
      wireCtl(s),
      {
        type: 'button',
        label: '처음부터',
        on: () => {
          auto = true;
          restart = now;
        },
      },
    ],
    dispose: () => s.dispose(),
  };
}

/* ───────────── i469 부품 조립 (분해도) ───────────── */

/**
 * 진짜 조립 순서: 부품마다 끼우는 방향(축)으로만 들어가고, 끼워지는 부품(parent)에 붙어 함께 빠진다.
 * 나사가 있는 단계는 부품이 자리에 앉은 뒤 나사가 돌며 박힌다 (분해는 거꾸로 — 나사부터 풀고 뺀다).
 */
interface AStep {
  key: string;
  name: string;
  how: string;
  parent?: string;
  /** 제자리 → 펼친 자리 꺾은선 (cm, 제자리 기준) */
  path: [number, number, number][];
  /** 이 단계에서 조이는 나사 (SCREWS 의 부품 id) */
  screws?: string[];
}
const ASTEPS: AStep[] = [
  { key: 'lower', name: '아래 틀', how: '아래에서 올려 몸체에 맞추고 나사로 조이기', path: [[0, -8, 0]], screws: ['lower'] },
  { key: 'trigger', parent: 'lower', name: '방아쇠', how: '옆에서 방아쇠울 안으로 밀어 넣기', path: [[0, 0, 7]] },
  { key: 'grip', parent: 'lower', name: '손잡이', how: '아래에서 밀어 올리고 나사로 조이기', path: [[0, -7, 0]], screws: ['grip'] },
  { key: 'mag', parent: 'lower', name: '에너지 셀', how: '탄창 구멍에 밀어 올려 끼우기', path: [[0, -9, 0]] },
  { key: 'block', name: '연결 블록', how: '몸체 뒤에 끼우기', path: [[-5, 0, 0]] },
  { key: 'stock', name: '개머리판', how: '뒤에서 밀어 블록에 물리고 나사로 조이기', path: [[-12, 0, 0]], screws: ['stock', 'receiver'] },
  { key: 'butt', parent: 'stock', name: '개머리 패드', how: '개머리판 끝에 씌우기', path: [[-6, 0, 0]] },
  { key: 'barrel', name: '총열', how: '앞에서 몸체 안으로 길게 밀어 넣기', path: [[20, 0, 0]] },
  { key: 'shroud', name: '총열 덮개', how: '위에서 총열에 덮고 나사로 조이기', path: [[0, 10, 0]], screws: ['shroud'] },
  { key: 'plates', name: '옆 패널', how: '양옆에서 눌러 붙이고 나사로 조이기', path: [[0, 0, 6]], screws: ['plates'] },
  { key: 'rail', name: '레일', how: '몸체 위에 얹기', path: [[0, 6, 0]] },
  { key: 'sight', parent: 'rail', name: '홀로 조준경', how: '레일 뒤 끝에 걸고 앞으로 밀어 조이기', path: [[-11, 0, 0], [-11, 6, 0]], screws: ['sight'] },
  { key: 'cable', name: '에너지 케이블', how: '옆에서 두 이음쇠에 꽂기', path: [[0, 0, 9]] },
];
const SCREW_STEP: Record<string, string> = { lower: 'lower', grip: 'grip', stock: 'stock', receiver: 'stock', shroud: 'shroud', plates: 'plates', sight: 'sight' };
const SCREW_OUT = 3.6;
/** 단계 하나에서 나사가 차지하는 몫 (분해 쪽 0 → 이만큼 나사, 나머지 부품) */
const SCREW_SHARE = 0.42;

function demo469(): Scene3D {
  const N = ASTEPS.length;
  const idx = new Map(ASTEPS.map((st, i) => [st.key, i]));
  const paths = ASTEPS.map((st) => {
    const pts = [new THREE.Vector3(), ...st.path.map((p) => new THREE.Vector3(...p))];
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += pts[i]!.distanceTo(pts[i - 1]!);
    return { pts, len };
  });
  const along = (i: number, f: number, out: THREE.Vector3): THREE.Vector3 => {
    const { pts, len } = paths[i]!;
    let d = f * len;
    for (let k = 1; k < pts.length; k++) {
      const seg = pts[k]!.distanceTo(pts[k - 1]!);
      if (d <= seg || k === pts.length - 1) return out.copy(pts[k - 1]!).lerp(pts[k]!, seg ? clamp(d / seg, 0, 1) : 1);
      d -= seg;
    }
    return out.set(0, 0, 0);
  };
  // 단계마다 지금 상태: f 부품이 빠진 정도 · so 나사가 풀린 정도 · disp 부모까지 더한 자리 (+z 쪽 / −z 쪽)
  const st = ASTEPS.map(() => ({ f: 0, so: 0, disp: new THREE.Vector3(), dispM: new THREE.Vector3(), own: new THREE.Vector3() }));
  const pose = (u: number): void => {
    ASTEPS.forEach((s, i) => {
      const q = clamp(u - (N - 1 - i), 0, 1);
      const S = st[i]!;
      if (s.screws) {
        S.so = ease(q / SCREW_SHARE);
        S.f = ease((q - SCREW_SHARE) / (1 - SCREW_SHARE));
      } else {
        S.so = 0;
        S.f = ease(q);
      }
      along(i, S.f, S.own);
      const P = s.parent ? st[idx.get(s.parent)!]! : null;
      S.disp.copy(S.own);
      S.dispM.copy(S.own);
      if (s.key === 'plates') S.dispM.z = -S.dispM.z;
      if (P) {
        S.disp.add(P.disp);
        S.dispM.add(P.dispM);
      }
    });
  };
  const keyOf = (p: BPart, ex: THREE.Vector3): string => {
    const id = p.def.id;
    if (id === 'stock') return ex.x === -22 ? 'butt' : ex.x === -8 ? 'block' : 'stock';
    return id === 'receiver' ? '' : id;
  };
  /** 부품 메시 → 단계 · 쪽 */
  const links: { mesh: THREE.Object3D; base: THREE.Vector3; step: number; side: 1 | -1 }[] = [];
  const screwLinks: { im: THREE.InstancedMesh; refs: ScrewRef[]; step: number; side: 1 | -1; pid: string }[] = [];
  const screwCount = new Map<number, number>();
  let auto = true;
  let manual = 0;
  let stage = 7;
  let u = 0;
  let lastU = 0;
  let assembling = true;
  const dimGeo = new THREE.BufferGeometry();
  const Y = -19;
  dimGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([-41.4, Y, 0, 57.6, Y, 0, -41.4, Y - 1.2, 0, -41.4, Y + 1.2, 0, 57.6, Y - 1.2, 0, 57.6, Y + 1.2, 0, -41.4, Y, 0, -39.6, Y + 0.7, 0, -41.4, Y, 0, -39.6, Y - 0.7, 0, 57.6, Y, 0, 55.8, Y + 0.7, 0, 57.6, Y, 0, 55.8, Y - 0.7, 0, -41.4, Y + 1.2, 0, -41.4, -6.6, 0, 57.6, Y + 1.2, 0, 57.6, 2.4, 0], 3),
  );
  const dimMat = new THREE.LineBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.9, toneMapped: false });
  const dim = new THREE.LineSegments(dimGeo, dimMat);
  const s = new Show({ fov: 28, stage: 7 }, (_kit, bl) => {
    s.holder.add(dim);
    for (const p of bl.parts) {
      for (const it of p.items) {
        if (it.def.name === 'screw') continue;
        const k = keyOf(p, it.ex);
        if (!k) continue;
        links.push({ mesh: it.mesh, base: it.base.clone(), step: idx.get(k)!, side: it.ex.z < 0 ? -1 : 1 });
        if (it.line) links.push({ mesh: it.line, base: it.base.clone(), step: idx.get(k)!, side: it.ex.z < 0 ? -1 : 1 });
      }
    }
    const byIm = new Map<THREE.InstancedMesh, ScrewRef[]>();
    for (const r of bl.screws) {
      if (!byIm.has(r.im)) byIm.set(r.im, []);
      byIm.get(r.im)!.push(r);
    }
    for (const [im, refs] of byIm) {
      const pid = refs[0]!.slot.part;
      // 나사는 자기 부품과 함께 움직인다 (몸체 나사는 제자리)
      const own = pid === 'receiver' ? -1 : idx.get(keyOf(bl.parts.find((p) => p.def.id === pid)!, new THREE.Vector3()))!;
      im.frustumCulled = false;
      screwLinks.push({ im, refs, step: own, side: refs[0]!.slot.side, pid });
      const tight = SCREW_STEP[pid];
      if (tight) {
        const ti = idx.get(tight)!;
        screwCount.set(ti, (screwCount.get(ti) ?? 0) + refs.length);
      }
    }
  });
  const mT = new THREE.Matrix4();
  const mR = new THREE.Matrix4();
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const w2 = new THREE.Vector3();
  const apply = (): void => {
    pose(u);
    for (const l of links) {
      const S = st[l.step]!;
      l.mesh.position.copy(l.base).add(l.side < 0 ? S.dispM : S.disp);
    }
    for (const sl of screwLinks) {
      if (sl.step >= 0) {
        const S = st[sl.step]!;
        sl.im.position.copy(sl.side < 0 ? S.dispM : S.disp);
      } else sl.im.position.set(0, 0, 0);
      const tight = SCREW_STEP[sl.pid];
      const so = tight ? st[idx.get(tight)!]!.so : 0;
      sl.refs.forEach((r) => {
        mT.makeTranslation(0, 0, so * SCREW_OUT);
        mR.makeRotationZ(-so * TAU * 4);
        m.copy(r.slot.base).multiply(mT).multiply(mR);
        r.im.setMatrixAt(r.idx, m);
      });
      sl.im.instanceMatrix.needsUpdate = true;
    }
  };
  /** 부품 이름표 자리 (지금 위치) */
  const anchorNow = (p: BPart, out: THREE.Vector3): THREE.Vector3 => {
    out.set(...p.def.anchor);
    const k = keyOf(p, new THREE.Vector3(...p.def.explode));
    return k ? out.add(st[idx.get(k)!]!.disp) : out;
  };
  // 한 바퀴: 다 된 모습 → 차례로 분해 → 펼친 모습 (이름표) → 하나씩 조립
  const HOLD0 = 2.2;
  const DIS = N * 0.5;
  const HOLD1 = 3.2;
  const ASM = N * 1.15;
  const CYCLE = HOLD0 + DIS + HOLD1 + ASM;
  return {
    scene: s.scene,
    camera: s.cam,
    update(t) {
      if (!s.tick(t)) return;
      const bl = s.bl!;
      if (auto) {
        const T = t % CYCLE;
        if (T < HOLD0) u = 0;
        else if (T < HOLD0 + DIS) u = ((T - HOLD0) / DIS) * N;
        else if (T < HOLD0 + DIS + HOLD1) u = N;
        else u = N * (1 - (T - HOLD0 - DIS - HOLD1) / ASM);
      } else u = manual * N;
      if (u !== lastU) assembling = u < lastU;
      lastU = u;
      if (bl.stage !== stage) bl.setStage(stage);
      apply();
      const ek = u / N;
      dimMat.opacity = clamp(1 - u * 4, 0, 1) * 0.9;
      dim.visible = dimMat.opacity > 0.02;
      const e = ease(ek);
      orbit(s.cam, lerp(8, 9.5, e), lerp(-3, -1, e), 0, lerp(150, 240, e), 0.5 + Math.sin(t * 0.22) * 0.2, 0.28);
    },
    render(r, w, h) {
      s.render(r, w, h, undefined, () => {
        const H = s.hud;
        const px = H.px;
        const bl = s.bl!;
        const small = h < 330;
        H.text('st', `단계 ${STAGE_NAMES[stage]}`, px * 0.7, px * 0.7, 0, 0, 0.9, '#ffd76a');
        const moving = u > 0.001 && u < N - 0.001;
        if (moving) {
          // 지금 움직이는 부품: 끼우는 축(제자리 ↔ 지금) + 이름 · 하는 일
          const j = Math.min(N - 1, Math.floor(u));
          const i = N - 1 - j;
          const step = ASTEPS[i]!;
          const S = st[i]!;
          const q = u - j;
          const screwing = !!step.screws && q < SCREW_SHARE;
          const no = `${i + 1}/${N}`;
          const nScrew = screwCount.get(i) ?? 0;
          const what = assembling ? (screwing ? `나사 ${nScrew}개 조이기` : step.how) : screwing ? `나사 ${nScrew}개 풀기` : '빼기';
          H.text('cap', `${assembling ? '조립' : '분해'} ${no} · ${step.name} — ${what}`, px * 0.7, px * 2.5, 0, 0, small ? 0.66 : 0.8, '#ffffff', 'tag');
          const p = bl.parts.find((x) => keyOf(x, new THREE.Vector3(...x.def.explode)) === step.key);
          if (p) {
            const now = toScreen(anchorNow(p, v), s.cam, w, h);
            // 제자리 = 부모가 지금 있는 곳
            const P = step.parent ? st[idx.get(step.parent)!]!.disp : w2.set(0, 0, 0);
            const home = toScreen(w2.set(...p.def.anchor).add(P), s.cam, w, h);
            if (now.ok && home.ok && S.f > 0.02) {
              H.line(home.x, home.y, now.x, now.y);
              H.rect('home', home.x - 4, home.y - 4, 8, 8, 0x5fd8ff, 0.95);
            }
            if (now.ok) H.rect('now', now.x - 3, now.y - 3, 6, 6, 0xffd76a, 1);
          }
        } else if (u >= N - 0.001) {
          // 다 펼침: 이름표는 양옆 기둥에 줄 세우고 (겹치지 않게) 부품까지 지시선, 번호 = 조립 순서
          const size = small ? 0.62 : 0.72;
          const gap = px * 1.55 * size * 1.18;
          const all: { q: { x: number; y: number }; t: string; y: number }[] = [];
          for (const p of bl.parts as BPart[]) {
            if (!p.items.some((it) => it.mesh.visible)) continue;
            const q = toScreen(anchorNow(p, v), s.cam, w, h);
            if (!q.ok) continue;
            const k = keyOf(p, new THREE.Vector3(...p.def.explode));
            const n = k ? `${idx.get(k)! + 1}. ` : '';
            all.push({ q, t: small ? `${n}${p.def.name}` : `${n}${p.def.name} · ${p.def.dim}`, y: q.y });
          }
          // 화면 x 순서로 반씩 왼쪽 · 오른쪽 기둥에 (한쪽에 몰려 부품을 가리지 않게)
          all.sort((a, b) => a.q.x - b.q.x);
          const half = Math.ceil(all.length / 2);
          const cols = [all.slice(0, half), all.slice(half)];
          let i = 0;
          cols.forEach((col, side) => {
            col.sort((a, b) => a.q.y - b.q.y);
            const top = px * 2.6;
            const bot = h - px * 2.6;
            for (let k = 0; k < col.length; k++) col[k]!.y = Math.max(col[k]!.q.y, k ? col[k - 1]!.y + gap : top);
            const over = (col.length ? col[col.length - 1]!.y : 0) - bot;
            if (over > 0) for (const it of col) it.y -= over;
            for (let k = col.length - 2; k >= 0; k--) col[k]!.y = Math.min(col[k]!.y, col[k + 1]!.y - gap);
            const x = side === 0 ? px * 0.7 : w - px * 0.7;
            for (const it of col) {
              const ww = H.text('p' + i, it.t, x, it.y, side === 0 ? 0 : 1, 0.5, size, '#ffd76a', 'tag');
              const ex = side === 0 ? x + ww : x - ww;
              H.line(it.q.x, it.q.y, ex, it.y);
              H.rect('dot' + i, it.q.x - 2.5, it.q.y - 2.5, 5, 5, 0xffd76a, 1);
              i++;
            }
          });
        } else {
          const q = toScreen(v.set(8, -19, 0), s.cam, w, h);
          H.text('dim', '전체 길이 99 cm', q.x, q.y + px * 0.4, 0.5, 0, 0.85, '#ffd76a', 'plain');
        }
        const done = N - Math.ceil(u - 1e-6);
        s.info(`부품 ${bl.parts.length}개 · 나사 ${bl.screws.length}개 · 조립 ${clamp(done, 0, N)}/${N} 단계`);
      });
    },
    controls: [
      {
        type: 'range',
        label: '조립 ↔ 분해 (단계 순서대로)',
        min: 0,
        max: 1,
        step: 0.005,
        value: 0,
        on: (x) => {
          auto = false;
          manual = x;
        },
      },
      { type: 'toggle', label: '자동으로 분해했다 조립하기', value: true, on: (x) => (auto = x) },
      { type: 'range', label: '단계 (0 윤곽 → 7 렌즈)', min: 0, max: 7, step: 1, value: 7, on: (x) => (stage = x) },
      wireCtl(s),
    ],
    dispose: () => {
      s.dispose();
      dimGeo.dispose();
      dimMat.dispose();
    },
  };
}

/* ───────────── i470 나사 · 볼트 · 패널 이음선 ───────────── */

function beamTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 4;
  const g = c.getContext('2d')!;
  const lg = g.createLinearGradient(0, 0, 64, 0);
  lg.addColorStop(0, 'rgba(80,220,255,0)');
  lg.addColorStop(0.42, 'rgba(80,220,255,0.35)');
  lg.addColorStop(0.5, 'rgba(235,252,255,1)');
  lg.addColorStop(0.58, 'rgba(80,220,255,0.35)');
  lg.addColorStop(1, 'rgba(80,220,255,0)');
  g.fillStyle = lg;
  g.fillRect(0, 0, 64, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function demo470(): Scene3D {
  let start = 0;
  let now = 0;
  let depth = 1;
  let placed = 0;
  let phase = 0;
  const beamTex = beamTexture();
  const beamMat = new THREE.MeshBasicMaterial({ map: beamTex, color: new THREE.Color(1.6, 1.8, 2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 16), beamMat);
  const order: number[] = [];
  const mT = new THREE.Matrix4();
  const mR = new THREE.Matrix4();
  const m = new THREE.Matrix4();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const s = new Show({ fov: 30, stage: 6 }, (_k, bl) => {
    s.holder.add(beam);
    const idx = bl.screws.map((_, i) => i);
    idx.sort((a, b) => bl.screws[a]!.slot.pos.x - bl.screws[b]!.slot.pos.x);
    order.push(...idx);
  });
  return {
    scene: s.scene,
    camera: s.cam,
    update(t) {
      now = t;
      if (!s.tick(t)) return;
      const bl = s.bl!;
      const T = (t - start) % 7;
      // ① 패널선 새기기 — 레이저가 지나간 곳부터 법선 맵이 생긴다
      const rx = T < 0.4 ? -30 : lerp(-16, 46, clamp((T - 0.4) / 2.2, 0, 1));
      bl.U.reveal.value = T < 2.6 ? rx : 1e4;
      beam.visible = T > 0.4 && T < 2.6;
      beam.position.set(rx, 3.2, 4.4);
      beamMat.opacity = 0.9 + Math.sin(t * 40) * 0.1;
      phase = T < 2.6 ? 0 : 1;
      // ② 나사 — x 순서로 하나씩 돌며 박힌다
      placed = 0;
      order.forEach((i, rank) => {
        const ref = bl.screws[i]!;
        const lt = (T - 2.7 - (rank >> 1) * 0.06) / 0.3;
        if (lt < 0) ref.im.setMatrixAt(ref.idx, zero);
        else {
          const e = easeOut(lt);
          const bounce = lt > 1 ? 0 : Math.sin(clamp(lt, 0, 1) * Math.PI) * 0.15;
          mT.makeTranslation(0, 0, (1 - e) * 2.4 + bounce);
          mR.makeRotationZ((1 - e) * TAU * 1.5);
          m.copy(ref.slot.base).multiply(mT).multiply(mR);
          ref.im.setMatrixAt(ref.idx, m);
          if (lt >= 1) placed++;
        }
        ref.im.instanceMatrix.needsUpdate = true;
      });
      bl.setNormals(true, true, depth);
      orbit(s.cam, 5, 2.4, 0, 72, 0.32 + Math.sin(t * 0.3) * 0.12, 0.14);
      const a = t * 0.6;
      s.key.position.set(Math.cos(a) * 70 - 20, 55, 80);
    },
    render(r, w, h) {
      s.render(r, w, h, undefined, () => {
        const H = s.hud;
        const px = H.px;
        if (phase === 0) H.text('ph', '① 패널선 · 환기구 새기기 — 법선 맵 (삼각형 그대로)', px * 0.7, px * 0.7);
        else H.text('ph', `② 나사 ${placed} / ${s.bl!.screws.length} — InstancedMesh 로 한꺼번에`, px * 0.7, px * 0.7);
        void now;
        s.info(`나사 그리기 ${s.bl!.parts.reduce((n, p) => n + p.items.filter((it) => it.def.name === 'screw').length, 0)}번에 ${s.bl!.screws.length}개`);
      });
    },
    controls: [
      { type: 'button', label: '다시 박기', on: () => (start = now) },
      { type: 'range', label: '패널선 깊이 (법선 세기)', min: 0, max: 2.5, step: 0.05, value: 1, on: (v) => (depth = v) },
      wireCtl(s),
    ],
    dispose: () => {
      s.dispose();
      beamTex.dispose();
      beamMat.dispose();
      beam.geometry.dispose();
    },
  };
}

/* ───────────── i471 미끄럼 방지 무늬 · 각인 (법선 맵 켬/끔) ───────────── */

function demo471(): Scene3D {
  let splitOn = true;
  let on = true;
  let scale = 1.2;
  let spin = true;
  let la = 0;
  const s = new Show({ fov: 30, stage: 6, env: 0.4 }, () => undefined);
  s.key.intensity = 4.2;
  s.rim.intensity = 0.8;
  return {
    scene: s.scene,
    camera: s.cam,
    update(t, dt) {
      if (!s.tick(t)) return;
      if (spin) la += dt * 1.1;
      s.key.position.set(-10 + Math.cos(la) * 60, 20 + Math.sin(la * 0.7) * 40, 60);
      orbit(s.cam, -11.2, -7.5, 0, 34, 0.08 + Math.sin(t * 0.35) * 0.12, 0.05);
    },
    render(r, w, h) {
      const bl = (): Blaster => s.bl!;
      s.render(
        r,
        w,
        h,
        () => {
          if (!splitOn) {
            bl().setNormals(on, on, scale);
            r.render(s.scene, s.cam);
            return;
          }
          const sx = Math.round(w * 0.5);
          bl().setNormals(false, false, scale);
          scissorDraw(r, 0, sx, h, () => r.render(s.scene, s.cam));
          bl().setNormals(true, true, scale);
          scissorDraw(r, sx, w - sx, h, () => r.render(s.scene, s.cam));
        },
        () => {
          const H = s.hud;
          const px = H.px;
          if (splitOn) {
            H.rect('div', w / 2 - 1, 0, 2, h, 0xffffff, 0.85);
            H.text('l', '법선 맵 끔 · 매끈', w / 2 - px * 0.6, px * 0.7, 1, 0, 0.9, '#ffb59a', 'tag');
            H.text('r', '법선 맵 켬 · 무늬 · 각인', w / 2 + px * 0.6, px * 0.7, 0, 0, 0.9, '#7fe3ff', 'tag');
          } else H.text('l', on ? '법선 맵 켬' : '법선 맵 끔', px * 0.7, px * 0.7, 0, 0, 0.9, on ? '#7fe3ff' : '#ffb59a', 'tag');
          s.info('양쪽 삼각형 수 같음 — 빛만 속인다');
        },
      );
    },
    controls: [
      { type: 'toggle', label: '반반 나눠 보기', value: true, on: (v) => (splitOn = v) },
      { type: 'toggle', label: '법선 맵 (나눠 보기 끄면)', value: true, on: (v) => (on = v) },
      { type: 'range', label: '무늬 깊이', min: 0, max: 3, step: 0.05, value: 1.2, on: (v) => (scale = v) },
      { type: 'toggle', label: '빛 돌리기', value: true, on: (v) => (spin = v) },
      wireCtl(s),
    ],
    dispose: () => s.dispose(),
  };
}

/* ───────────── i472 가장자리 닳음 (새것 ↔ 낡은 것) ───────────── */

function demo472(): Scene3D {
  let wear = 0.85;
  let auto = true;
  let pos = 0.5;
  let mask = false;
  let split = 0.5;
  const s = new Show({ fov: 30, stage: 6 }, () => undefined);
  return {
    scene: s.scene,
    camera: s.cam,
    update(t) {
      if (!s.tick(t)) return;
      split = auto ? 0.5 + Math.sin(t * 0.7) * 0.3 : pos;
      orbit(s.cam, 9, 1.5, 0, 74, 0.5 + Math.sin(t * 0.25) * 0.14, 0.26);
      const a = t * 0.5;
      s.key.position.set(Math.cos(a) * 60 - 20, 70, 70);
    },
    render(r, w, h) {
      s.render(
        r,
        w,
        h,
        () => {
          const U = s.bl!.U;
          const sx = Math.round(w * split);
          U.maskView.value = 0;
          U.wear.value = 0;
          scissorDraw(r, 0, sx, h, () => r.render(s.scene, s.cam));
          U.wear.value = wear;
          U.maskView.value = mask ? 1 : 0;
          scissorDraw(r, sx, w - sx, h, () => r.render(s.scene, s.cam));
        },
        () => {
          const H = s.hud;
          const px = H.px;
          const sx = w * split;
          H.rect('div', sx - 1, 0, 2, h, 0xffffff, 0.85);
          H.text('l', '새것', sx - px * 0.6, px * 0.7, 1, 0, 0.9, '#7fe3ff', 'tag');
          H.text('r', mask ? '모서리 마스크 (곡률)' : `낡은 것 · 닳음 ${Math.round(wear * 100)}%`, sx + px * 0.6, px * 0.7, 0, 0, 0.9, '#ffb36a', 'tag');
          s.info('모서리 = 정점 곡률 + 잡음 → 칠 벗겨진 금속');
        },
      );
    },
    controls: [
      { type: 'range', label: '닳음 정도', min: 0, max: 1, step: 0.01, value: 0.85, on: (v) => (wear = v) },
      { type: 'toggle', label: '밀대 자동', value: true, on: (v) => (auto = v) },
      {
        type: 'range',
        label: '밀대 위치',
        min: 0.05,
        max: 0.95,
        step: 0.01,
        value: 0.5,
        on: (v) => {
          auto = false;
          pos = v;
        },
      },
      { type: 'toggle', label: '모서리 마스크 보기', value: false, on: (v) => (mask = v) },
      wireCtl(s),
    ],
    dispose: () => s.dispose(),
  };
}

/* ───────────── i473 렌즈 · 유리 (굴절 · 반사 코팅) ───────────── */

/** 수학 숫자 판 (렌즈 너머 배경 — 굴절로 휘는 게 보이게 줄 · 숫자) */
function numberBoard(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 640;
  const g = c.getContext('2d')!;
  g.fillStyle = '#10182a';
  g.fillRect(0, 0, 1024, 640);
  const cols = ['#ff7a3a', '#ffd23a', '#5fe08a', '#4fc8ff', '#b48cff'];
  const R = (i: number): number => ((i * 9301 + 49297) % 233280) / 233280;
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 16; x++) {
      const i = y * 16 + x;
      g.fillStyle = (x + y) % 2 ? '#18233b' : '#1d2a46';
      g.fillRect(x * 64, y * 64, 64, 64);
      g.fillStyle = cols[Math.floor(R(i) * cols.length)]!;
      g.font = `800 30px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(((x + 1) * (y + 1)) % 100), x * 64 + 32, y * 64 + 34);
    }
  g.strokeStyle = 'rgba(200,230,255,0.55)';
  g.lineWidth = 2;
  for (let x = 0; x <= 1024; x += 64) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 640);
    g.stroke();
  }
  for (let y = 0; y <= 640; y += 64) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(1024, y);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function demo473(): Scene3D {
  let ior = 1.52;
  let coat = 1;
  let thick = 1.4;
  let dot = true;
  const boardTex = numberBoard();
  const boardMat = new THREE.MeshBasicMaterial({ map: boardTex });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(64, 40), boardMat);
  board.rotation.y = -Math.PI / 2;
  board.position.set(70, 14, 0);
  const s = new Show({ fov: 30, stage: 7, lens: true, near: 0.5 }, () => {
    s.holder.add(board);
  });
  const rear = new THREE.Vector3();
  const front = new THREE.Vector3(15, 17.5, 10);
  const look = new THREE.Vector3();
  const C = new THREE.Vector3(2.75, 14.15, 0);
  return {
    scene: s.scene,
    camera: s.cam,
    update(t) {
      if (!s.tick(t)) return;
      const bl = s.bl!;
      const lens = bl.mats.full.lens as THREE.MeshPhysicalMaterial;
      lens.ior = ior;
      lens.iridescence = coat;
      lens.thickness = thick;
      for (const p of bl.parts) for (const it of p.items) if (it.def.mat === 'reticle') it.mesh.visible = dot;
      const u = ease(clamp(0.5 - 0.5 * Math.cos((t * TAU) / 12) * 1.25, 0, 1));
      rear.set(-15, 14.5 + Math.sin(t * 0.9) * 0.6, Math.sin(t * 0.6) * 1.4);
      s.cam.position.lerpVectors(rear, front, u);
      look.set(40, 14.2, 0).lerp(C, u);
      s.cam.lookAt(look);
      s.key.position.set(30, 60, 40);
    },
    render(r, w, h) {
      s.render(r, w, h, undefined, () => {
        const H = s.hud;
        const px = H.px;
        H.text('ph', '렌즈 = 투과 · 굴절 재질 + 보랏빛 코팅(박막 간섭)', px * 0.7, px * 0.7);
        s.info(`굴절률 ${ior.toFixed(2)} · 코팅 ${Math.round(coat * 100)}%`);
      });
    },
    controls: [
      { type: 'range', label: '굴절률 (IOR)', min: 1, max: 2.4, step: 0.01, value: 1.52, on: (v) => (ior = v) },
      { type: 'range', label: '코팅 (무지갯빛)', min: 0, max: 1, step: 0.01, value: 1, on: (v) => (coat = v) },
      { type: 'range', label: '유리 두께', min: 0, max: 4, step: 0.05, value: 1.4, on: (v) => (thick = v) },
      { type: 'toggle', label: '홀로 조준점', value: true, on: (v) => (dot = v) },
      wireCtl(s),
    ],
    dispose: () => {
      s.dispose();
      boardTex.dispose();
      boardMat.dispose();
      board.geometry.dispose();
    },
  };
}

/* ───────────── i476 FPS 1인칭 무기 연출 ───────────── */

function gridTexture(bg: string, line: string, n: number, accent?: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = line;
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, 253, 253);
  g.lineWidth = 1;
  for (let i = 1; i < n; i++) {
    g.beginPath();
    g.moveTo((i * 256) / n, 0);
    g.lineTo((i * 256) / n, 256);
    g.moveTo(0, (i * 256) / n);
    g.lineTo(256, (i * 256) / n);
    g.stroke();
  }
  if (accent) {
    g.fillStyle = accent;
    g.fillRect(0, 118, 256, 20);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
function targetTexture(text: string, answer: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const rings = answer ? ['#1f6d43', '#e9fff1', '#2fae66', '#e9fff1'] : ['#20242c', '#f4f1ea', '#ff7a2a', '#f4f1ea'];
  rings.forEach((col, i) => {
    g.fillStyle = col;
    g.beginPath();
    g.arc(128, 128, 126 - i * 26, 0, TAU);
    g.fill();
  });
  g.fillStyle = answer ? '#0e3a22' : '#1a1d24';
  g.font = `900 ${text.length > 3 ? 54 : 70}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 134);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function starTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.18, 'rgba(160,240,255,0.9)');
  rg.addColorStop(0.5, 'rgba(60,180,255,0.25)');
  rg.addColorStop(1, 'rgba(40,140,255,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = 'rgba(190,245,255,0.9)';
  for (let k = 0; k < 6; k++) {
    g.save();
    g.translate(64, 64);
    g.rotate((k / 6) * TAU);
    g.beginPath();
    g.moveTo(0, -4);
    g.lineTo(62, 0);
    g.lineTo(0, 4);
    g.closePath();
    g.fill();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 입자 (불꽃 · 김) — Points + 둥근 셰이더, 위치는 세계 좌표 */
class Particles {
  readonly n: number;
  readonly pos: Float32Array;
  readonly vel: Float32Array;
  readonly life: Float32Array;
  readonly max: Float32Array;
  readonly size: Float32Array;
  readonly grow: Float32Array;
  readonly geo = new THREE.BufferGeometry();
  readonly mat: THREE.ShaderMaterial;
  readonly points: THREE.Points;
  private aLife: THREE.BufferAttribute;
  private aSize: THREE.BufferAttribute;
  private next = 0;
  constructor(n: number, color: THREE.Color, additive: boolean, readonly gravity: number, readonly drag: number) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n).fill(1);
    this.size = new Float32Array(n);
    this.grow = new Float32Array(n);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.aLife = new THREE.BufferAttribute(new Float32Array(n), 1);
    this.aSize = new THREE.BufferAttribute(new Float32Array(n), 1);
    this.geo.setAttribute('aLife', this.aLife);
    this.geo.setAttribute('aSize', this.aSize);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: color }, uScale: { value: 400 }, uAlpha: { value: additive ? 1 : 0.32 } },
      vertexShader: /* glsl */ `attribute float aLife; attribute float aSize; uniform float uScale; varying float vL;
        void main(){ vL = aLife; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aLife > 0.0 ? aSize * uScale / max(1.0, -mv.z) : 0.0; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: additive
        ? /* glsl */ `uniform vec3 uColor; uniform float uAlpha; varying float vL;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r > 1.0) discard; float a = (1.0 - r) * (1.0 - r) * vL * uAlpha; gl_FragColor = vec4(uColor * a * (1.0 + 2.0 * vL), a); }`
        : /* glsl */ `uniform vec3 uColor; uniform float uAlpha; varying float vL;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r > 1.0) discard; float a = (1.0 - r) * vL * uAlpha; gl_FragColor = vec4(uColor, a); }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
  }
  emit(p: THREE.Vector3, v: THREE.Vector3, life: number, size: number, grow = 0): void {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.life[i] = life;
    this.max[i] = life;
    this.size[i] = size;
    this.grow[i] = grow;
  }
  step(dt: number): void {
    const la = this.aLife.array as Float32Array;
    const sa = this.aSize.array as Float32Array;
    const dk = Math.exp(-this.drag * dt);
    for (let i = 0; i < this.n; i++) {
      if (this.life[i]! <= 0) {
        la[i] = 0;
        continue;
      }
      this.life[i] = this.life[i]! - dt;
      const o = i * 3;
      this.vel[o + 1] = this.vel[o + 1]! + this.gravity * dt;
      for (let k = 0; k < 3; k++) {
        this.vel[o + k] = this.vel[o + k]! * dk;
        this.pos[o + k] = this.pos[o + k]! + this.vel[o + k]! * dt;
      }
      const f = Math.max(0, this.life[i]! / this.max[i]!);
      la[i] = f;
      sa[i] = this.size[i]! + this.grow[i]! * (1 - f);
    }
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.aLife.needsUpdate = true;
    this.aSize.needsUpdate = true;
  }
  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

interface Spring {
  x: number;
  v: number;
}
const springStep = (s: Spring, k: number, c: number, dt: number): void => {
  const n = Math.max(1, Math.ceil(dt / 0.008));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    s.v += (-k * s.x - c * s.v) * h;
    s.x += s.v * h;
  }
};

function demo476(): Scene3D {
  let auto = true;
  let walkOn = true;
  let aimOn = false;
  let now = 0;
  let lastT = 0;
  const EYE = 0;
  const FLOOR = -165;
  const QA: [string, string][] = [
    ['7×8', '56'],
    ['√81', '9'],
    ['12÷4', '3'],
  ];
  const disposables: { dispose(): void }[] = [];
  const keep = <X extends { dispose(): void }>(x: X): X => {
    disposables.push(x);
    return x;
  };
  const room = new THREE.Group();
  // 바닥 · 벽 · 낮은 벽 (훈련장)
  const floorTex = keep(gridTexture('#0d1322', 'rgba(90,200,255,0.55)', 4));
  floorTex.repeat.set(60, 60);
  const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(8000, 8000)), keep(new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.62, metalness: 0.3 })));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR;
  const wallTex = keep(gridTexture('#151c2e', 'rgba(120,170,230,0.35)', 2, 'rgba(255,122,42,0.55)'));
  wallTex.repeat.set(14, 3);
  const wallMat = keep(new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.7, metalness: 0.1 }));
  const back = new THREE.Mesh(keep(new THREE.PlaneGeometry(4000, 900)), wallMat);
  back.position.set(0, FLOOR + 450, -1500);
  const sideG = keep(new THREE.PlaneGeometry(3200, 900));
  const left = new THREE.Mesh(sideG, wallMat);
  left.rotation.y = Math.PI / 2;
  left.position.set(-900, FLOOR + 450, 100);
  const right = new THREE.Mesh(sideG, wallMat);
  right.rotation.y = -Math.PI / 2;
  right.position.set(900, FLOOR + 450, 100);
  const blockG = keep(new THREE.BoxGeometry(160, 90, 60));
  const blockM = keep(new THREE.MeshStandardMaterial({ color: 0x3a4152, roughness: 0.55, metalness: 0.4 }));
  const blocks = new THREE.InstancedMesh(blockG, blockM, 6);
  [-520, 520].forEach((x, j) => [-260, -620, -960].forEach((z, i) => blocks.setMatrixAt(j * 3 + i, new THREE.Matrix4().makeTranslation(x, FLOOR + 45, z))));
  room.add(floor, back, left, right, blocks);
  // 과녁 (앞 = 문제, 뒤 = 답)
  const boardG = keep(new THREE.BoxGeometry(150, 150, 8));
  const boardM = keep(new THREE.MeshStandardMaterial({ color: 0x252a33, roughness: 0.45, metalness: 0.7 }));
  const faceG = keep(new THREE.CircleGeometry(68, 48));
  const poleG = keep(new THREE.CylinderGeometry(4, 4, 200, 12));
  const targets = QA.map(([q, a], i) => {
    const g = new THREE.Group();
    g.position.set((i - 1) * 300, -20, -1000);
    const spin = new THREE.Group();
    spin.add(new THREE.Mesh(boardG, boardM));
    const ft = keep(targetTexture(q, false));
    const bt = keep(targetTexture(a, true));
    const fm = keep(new THREE.MeshStandardMaterial({ map: ft, emissiveMap: ft, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.6 }));
    const bm = keep(new THREE.MeshStandardMaterial({ map: bt, emissiveMap: bt, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.6 }));
    const f = new THREE.Mesh(faceG, fm);
    f.position.z = 4.3;
    const b = new THREE.Mesh(faceG, bm);
    b.position.z = -4.3;
    b.rotation.y = Math.PI;
    spin.add(f, b);
    const pole = new THREE.Mesh(poleG, boardM);
    pole.position.y = -175;
    g.add(spin, pole);
    room.add(g);
    return { g, spin, hitAt: -1 };
  });
  // 섬광 · 빛 · 광선 · 입자
  const starTex = keep(starTexture());
  const flashMat = keep(new THREE.MeshBasicMaterial({ map: starTex, color: new THREE.Color(1.6, 1.9, 2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  const flashG = keep(new THREE.PlaneGeometry(1, 1));
  const flashA = new THREE.Mesh(flashG, flashMat);
  flashA.rotation.y = -Math.PI / 2;
  const flashB = new THREE.Mesh(flashG, flashMat);
  const flash = new THREE.Group();
  flash.add(flashA, flashB);
  flash.position.set(61, 4.6, 0);
  const light = new THREE.PointLight(0x6fdcff, 0, 0, 2);
  light.position.set(64, 6, 0);
  const boltMat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 2.4, 3.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const boltCore = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3), toneMapped: false }));
  const boltG = keep(new THREE.CylinderGeometry(2.2, 2.2, 160, 10, 1, true).rotateX(Math.PI / 2));
  const boltCG = keep(new THREE.CylinderGeometry(0.7, 0.7, 150, 8, 1, true).rotateX(Math.PI / 2));
  const bolt = new THREE.Group();
  bolt.add(new THREE.Mesh(boltG, boltMat), new THREE.Mesh(boltCG, boltCore));
  bolt.visible = false;
  room.add(bolt);
  const sparks = new Particles(220, new THREE.Color(0.55, 0.9, 1.0), true, -900, 1.6);
  const steam = new Particles(140, new THREE.Color(0.86, 0.9, 0.95), false, 18, 0.9);
  disposables.push(sparks, steam);
  room.add(sparks.points, steam.points);

  const pivot = new THREE.Group();
  const s = new Show({ fov: 62, near: 0.5, far: 6000, bg: ['#0b1222', '#0b1120', '#070a12'], env: 0.75, stage: 7 }, (_k, bl) => {
    bl.root.rotation.y = Math.PI / 2;
    pivot.add(bl.root);
    bl.root.add(flash, light);
  });
  s.scene.add(room, s.cam);
  s.cam.add(pivot);
  s.hide.push(pivot);
  s.scene.fog = new THREE.Fog(0x0a1020, 1400, 4200);
  s.key.position.set(-120, 300, 200);
  s.key.intensity = 2.0;

  // 상태
  let aimK = 0;
  let walkK = 0;
  let phase = 0;
  let camZ = 250;
  let yaw = 0;
  let pitch = 0;
  let yawV = 0;
  let wantYaw = 0;
  let wantPitch = 0;
  let heat = 0;
  let energy = 40;
  let flashT = -1;
  let hitT = -1;
  let shots = 0;
  let fade = 0;
  let inspect = 0;
  const rz: Spring = { x: 0, v: 0 };
  const rp: Spring = { x: 0, v: 0 };
  const ry: Spring = { x: 0, v: 0 };
  const boltS = { on: false, t0: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), target: 0 };
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const label = { text: '' };
  const aimAt = (i: number): void => {
    const tg = targets[i]!.g.position;
    const dx = tg.x - 0;
    const dz = tg.z - camZ;
    wantYaw = Math.atan2(-dx, -dz);
    wantPitch = Math.atan2(tg.y - EYE, Math.hypot(dx, dz));
  };
  const fire = (i: number): void => {
    const bl = s.bl;
    if (!bl) return;
    bl.root.updateWorldMatrix(true, false);
    boltS.from.copy(bl.root.localToWorld(v1.set(62, 4.6, 0)));
    const tg = targets[i]!.g.position;
    boltS.to.set(tg.x + (Math.random() - 0.5) * 30, tg.y + (Math.random() - 0.5) * 30, tg.z + 6);
    boltS.on = true;
    boltS.t0 = now;
    boltS.target = i;
    targets[i]!.hitAt = -1;
    flashT = now;
    rz.v += 75 * (1 - 0.45 * aimK);
    rp.v += 2.6 * (1 - 0.3 * aimK);
    ry.v += (Math.random() - 0.5) * 1.2;
    heat = Math.min(1.2, heat + 0.38);
    energy = Math.max(0, energy - 1);
    shots++;
    flashA.rotation.x = Math.random() * TAU;
    const sc = 13 + Math.random() * 7;
    flashA.scale.set(sc, sc, 1);
    flashB.scale.set(sc * 1.6, sc * 0.55, 1);
  };
  const reset = (): void => {
    for (const tg of targets) {
      tg.hitAt = -1;
      tg.spin.rotation.y = 0;
    }
    energy = 40;
    camZ = 650;
  };

  return {
    scene: s.scene,
    camera: s.cam,
    update(t, dt) {
      now = t;
      if (!s.tick(t)) return;
      const bl = s.bl!;
      dt = Math.min(dt, 0.05);
      let walkWant = walkOn ? 1 : 0;
      let aimWant = aimOn ? 1 : 0;
      inspect = 0;
      if (auto) {
        const L = 9.6;
        const T = t % L;
        const P = lastT % L;
        const crossed = (x: number): boolean => (P < x && T >= x) || (P > T && (x <= T || x > P));
        if (crossed(0.01)) reset();
        fade = T < 0.4 ? 1 - T / 0.4 : T > 9.0 ? (T - 9.0) / 0.6 : 0;
        walkWant = T < 3.0 ? 1 : 0;
        aimWant = T > 3.4 && T < 6.1 ? 1 : 0;
        if (T < 3.0) {
          camZ = lerp(650, 250, T / 3.0);
          wantYaw = 0;
          wantPitch = -0.02;
        } else if (T < 4.25) aimAt(0);
        else if (T < 5.1) aimAt(1);
        else if (T < 6.3) aimAt(2);
        else {
          wantYaw = 0;
          wantPitch = -0.04;
        }
        if (crossed(3.9)) fire(0);
        if (crossed(4.75)) fire(1);
        if (crossed(5.6)) fire(2);
        inspect = T > 6.5 && T < 8.7 ? ease(Math.min((T - 6.5) / 0.6, (8.7 - T) / 0.6, 1)) : 0;
        phase = T < 3.0 ? 0 : T < 3.8 ? 1 : T < 6.2 ? 2 : 3;
      } else {
        fade = 0;
        camZ = 250;
        phase = aimOn ? (t - Math.max(0, boltS.t0) < 1 ? 2 : 1) : heat > 0.15 ? 3 : walkOn ? 0 : 1;
      }
      lastT = t;
      // 걷기 · 조준 부드럽게
      walkK += (walkWant - walkK) * Math.min(1, dt * 5);
      aimK += (aimWant - aimK) * Math.min(1, dt * 8);
      const prevYaw = yaw;
      yaw += (wantYaw - yaw) * Math.min(1, dt * 6);
      pitch += (wantPitch - pitch) * Math.min(1, dt * 6);
      yawV = lerp(yawV, (yaw - prevYaw) / Math.max(dt, 1e-3), Math.min(1, dt * 10));
      const ph = t * 9.2;
      const W = walkK * (1 - 0.75 * aimK);
      s.cam.position.set(0, EYE + Math.sin(ph * 2) * 1.5 * walkK, camZ);
      s.cam.rotation.set(pitch, yaw, Math.sin(ph) * 0.006 * walkK, 'YXZ');
      const fov = lerp(62, 40, ease(aimK));
      if (Math.abs(s.cam.fov - fov) > 0.01) {
        s.cam.fov = fov;
        s.cam.updateProjectionMatrix();
      }
      if (!auto && walkOn) floorTex.offset.y -= dt * 1.1;
      // 반동 스프링
      springStep(rz, 260, 21, dt);
      springStep(rp, 200, 17, dt);
      springStep(ry, 180, 15, dt);
      // 총 자세 = 엉덩이 ↔ 조준 + 걸음 8자 + 숨 + 반동 + 돌릴 때 늦게 따라옴
      const a = ease(aimK);
      const br = 1 - 0.75 * a;
      pivot.position.set(
        lerp(12.5, 0, a) + Math.sin(ph) * 1.1 * W + Math.sin(t * 0.85) * 0.12 * br + yawV * 2.2,
        lerp(-13.5, -14.15, a) - Math.abs(Math.cos(ph)) * 0.9 * W + Math.sin(t * 1.7) * 0.22 * br - inspect * 2,
        lerp(-24, -9.5, a) + rz.x * 0.06 - inspect * 4,
      );
      pivot.rotation.set(lerp(0.02, 0, a) + rp.x * 0.05 + Math.sin(t * 1.7) * 0.004 * br + inspect * 0.12, lerp(0.1, 0, a) + ry.x * 0.03 + yawV * 0.05 + inspect * 0.5, lerp(0.03, 0, a) + Math.sin(ph) * 0.025 * W - inspect * 0.45, 'YXZ');
      // 열 · 섬광 · 빛
      const glow = bl.mats.full.glow as THREE.MeshStandardMaterial;
      glow.emissiveIntensity = 2.6 + heat * 5;
      const fl = flashT < 0 ? 1 : (now - flashT) / 0.075;
      flash.visible = fl < 1;
      light.intensity = fl < 1 ? 7000 * (1 - fl) : 0;
      if (phase === 3 || (!auto && !aimOn)) {
        if (heat > 0.05) {
          heat = Math.max(0, heat - dt * 0.45);
          bl.root.updateWorldMatrix(true, false);
          const nE = Math.random() < heat * dt * 60 ? 2 : 0;
          for (let k = 0; k < nE; k++) {
            const x = [25.3, 28.5, 31.7, 34.9, 38.1][Math.floor(Math.random() * 5)]!;
            const sz = Math.random() < 0.5 ? 3.2 : -3.2;
            bl.root.localToWorld(v1.set(x, 4.6 + (Math.random() - 0.5) * 2, sz));
            v2.set((Math.random() - 0.5) * 8, 14 + Math.random() * 16, (Math.random() - 0.5) * 8);
            steam.emit(v1, v2, 1.1 + Math.random() * 0.9, 2.5, 13);
          }
        }
      } else heat = Math.max(0, heat - dt * 0.05);
      // 광선이 날아가 과녁에
      if (boltS.on) {
        const k = (now - boltS.t0) / 0.13;
        if (k >= 1) {
          boltS.on = false;
          bolt.visible = false;
          hitT = now;
          const tg = targets[boltS.target]!;
          tg.hitAt = now;
          for (let i = 0; i < 34; i++) {
            v2.set((Math.random() - 0.5) * 520, Math.random() * 420, 120 + Math.random() * 380);
            sparks.emit(boltS.to, v2, 0.35 + Math.random() * 0.5, 10 + Math.random() * 12);
          }
          for (let i = 0; i < 3; i++) sparks.emit(boltS.to, v2.set(0, 0, 0), 0.16, 140 - i * 30);
        } else {
          bolt.visible = true;
          bolt.position.lerpVectors(boltS.from, boltS.to, k);
          bolt.lookAt(boltS.to);
        }
      }
      for (const tg of targets) {
        const k = tg.hitAt < 0 ? 0 : (now - tg.hitAt) / 0.55;
        const e = k <= 0 ? 0 : k >= 1 ? 1 : 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
        tg.spin.rotation.y = Math.PI * e;
      }
      sparks.step(dt);
      steam.step(dt);
      label.text = ['걷기 — 걸음 따라 8자로 흔들림 · 숨쉬기', '조준(ADS) — 조준경이 눈앞으로 · 시야 62° → 40°', '반동 스프링 · 에너지 섬광 · 순간 빛', '열 배출 — 코일이 식으며 김'][phase]!;
    },
    render(r, w, h) {
      const sc = (h * 0.5) / Math.tan(THREE.MathUtils.degToRad(s.cam.fov * 0.5));
      sparks.mat.uniforms['uScale']!.value = sc;
      steam.mat.uniforms['uScale']!.value = sc;
      s.render(r, w, h, undefined, () => {
        const H = s.hud;
        const px = H.px;
        H.text('ph', label.text, px * 0.7, px * 0.7, 0, 0, 0.9);
        const ca = clamp(1 - aimK * 2.5, 0, 1);
        if (ca > 0.02) {
          const g = px * 0.45;
          const L = px * 0.55;
          H.rect('c1', w / 2 - g - L, h / 2 - 1, L, 2, 0xffffff, ca * 0.9);
          H.rect('c2', w / 2 + g, h / 2 - 1, L, 2, 0xffffff, ca * 0.9);
          H.rect('c3', w / 2 - 1, h / 2 - g - L, 2, L, 0xffffff, ca * 0.9);
          H.rect('c4', w / 2 - 1, h / 2 + g, 2, L, 0xffffff, ca * 0.9);
        }
        if (hitT > 0 && now - hitT < 0.18) {
          const q = px * 0.5;
          H.line(w / 2 - q * 2, h / 2 - q * 2, w / 2 - q, h / 2 - q);
          H.line(w / 2 + q * 2, h / 2 - q * 2, w / 2 + q, h / 2 - q);
          H.line(w / 2 - q * 2, h / 2 + q * 2, w / 2 - q, h / 2 + q);
          H.line(w / 2 + q * 2, h / 2 + q * 2, w / 2 + q, h / 2 + q);
        }
        H.text('en', `에너지 ${energy}  ${'▮'.repeat(Math.ceil(energy / 8))}${'▯'.repeat(5 - Math.ceil(energy / 8))}`, w - px * 0.7, h - px * 0.7, 1, 1, 0.85, '#7fe3ff');
        if (fade > 0.01) H.rect('fade', 0, 0, w, h, 0x000000, clamp(fade, 0, 1));
        s.info(`맞힌 과녁 ${targets.filter((x) => x.hitAt >= 0).length} / 3 · 열 ${Math.round(heat * 100)}%`);
        void shots;
      });
    },
    controls: [
      { type: 'toggle', label: '자동 연출', value: true, on: (v) => (auto = v) },
      {
        type: 'button',
        label: '쏘기',
        on: () => {
          auto = false;
          aimAt(shots % 3);
          fire(shots % 3);
        },
      },
      {
        type: 'toggle',
        label: '조준 (ADS)',
        value: false,
        on: (v) => {
          auto = false;
          aimOn = v;
        },
      },
      {
        type: 'toggle',
        label: '걷기',
        value: true,
        on: (v) => {
          auto = false;
          walkOn = v;
        },
      },
      wireCtl(s),
    ],
    dispose: () => {
      s.dispose();
      for (const d of disposables) d.dispose();
    },
  };
}

/* ───────────── 내보내기 ───────────── */

/** 잰 값 (개발 화면 콘솔: __hard) — make 시간 · 장면별 프레임 CPU 시간 · 모델 만들기 합계 */
const STATS = { make: {} as Record<string, number>, frame: {} as Record<string, number>, kitMs: 0, kit: kitStats, log: stepLog };
(globalThis as unknown as { __hard?: typeof STATS }).__hard = STATS;
function timed(id: string, f: () => Scene3D): () => Scene3D {
  return () => {
    const t0 = performance.now();
    const sc = f();
    STATS.make[id] = +(performance.now() - t0).toFixed(2);
    const r0 = sc.render!.bind(sc);
    sc.render = (r, w, h) => {
      const a = performance.now();
      r0(r, w, h);
      STATS.frame[id] = +lerp(STATS.frame[id] ?? 0, performance.now() - a, 0.05).toFixed(2);
      STATS.kitMs = +kitBuildMs().toFixed(1);
    };
    return sc;
  };
}

export const DEMOS: DemoMap = {
  i468: { kind: '3d', caption: '2D 윤곽 → 두께로 돌출 → 모서리 깎기: 왼쪽 베벨 없음 · 오른쪽 베벨 있음 (모서리에 빛)', make: timed('i468', demo468) },
  i469: { kind: '3d', caption: '부품 12개를 조립 순서대로 — 끼우는 방향으로 밀어 넣고 나사를 돌려 조이기, 분해는 거꾸로 (번호 = 조립 순서 · 치수)', make: timed('i469', demo469) },
  i470: { kind: '3d', caption: '레이저가 패널선 · 환기구를 새기고(법선 맵) 나사 58개가 톡톡 박힌다(인스턴스)', make: timed('i470', demo470) },
  i471: { kind: '3d', caption: '손잡이 다이아몬드 무늬 · 각인 글씨 — 왼쪽 법선 맵 끔 · 오른쪽 켬, 빛이 돌며 요철이 드러남', make: timed('i471', demo471) },
  i472: { kind: '3d', caption: '새것 ↔ 낡은 것: 모서리 곡률 + 잡음으로 칠이 벗겨져 금속이 반짝, 오목한 곳은 때', make: timed('i472', demo472) },
  i473: { kind: '3d', caption: '조준경 렌즈: 뒤 숫자판이 굴절로 휘고, 보랏빛 코팅이 반사 · 붉은 홀로 조준점', make: timed('i473', demo473) },
  i476: { kind: '3d', caption: '1인칭 무기: 걷기 흔들림 · 숨 · 조준 확대 · 반동 스프링 · 섬광 · 열 배출 김 — 수학 과녁 쏘기', make: timed('i476', demo476) },
};

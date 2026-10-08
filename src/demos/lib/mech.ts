import * as THREE from 'three';
import { envFor, loadHdr } from './blaster';

/**
 * 기계 모델링 견본 공용 (i540 ~ i544, 2026-10-08)
 *  - 무대: 스튜디오 HDR 반사(블래스터와 같은 envFor) · 키 · 채움 · 뒤 테두리 빛 · 그림자 받는 바닥 · 옅은 그러데이션 배경
 *  - 재질: 깎은 강철 · 주철 · 황동 · 크롬 · 도장(노랑 · 빨강 · 남색 등) · 고무 · 유리 — 거칠기 · 금속도만 다르게
 *  - 모양: 모서리를 깎은 돌출(bevelExtrude) · 회전체(lathe) · 두 점 사이 원기둥(between)
 *  - 글씨 판(Overlay) · 크게 보기 끌기 입력(Drag) — 카드에서는 저절로 천천히 돈다
 */

export const TAU = Math.PI * 2;
export const FONT = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
export const smooth = (a: number, b: number, x: number): number => {
  const k = clamp((x - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/* ───────────── 재질 ───────────── */

export type MechMat = 'steel' | 'brushed' | 'iron' | 'brass' | 'copper' | 'chrome' | 'dark' | 'yellow' | 'red' | 'navy' | 'white' | 'orange' | 'rubber' | 'glass' | 'glow' | 'hot';
export function mechMats(): Record<MechMat, THREE.MeshPhysicalMaterial> & { dispose(): void } {
  const P = (o: THREE.MeshPhysicalMaterialParameters): THREE.MeshPhysicalMaterial => new THREE.MeshPhysicalMaterial({ envMapIntensity: 1, ...o });
  const m = {
    steel: P({ color: 0xb9c0c8, metalness: 1, roughness: 0.32 }),
    brushed: P({ color: 0xd2d6db, metalness: 1, roughness: 0.22, anisotropy: 0.6 }),
    iron: P({ color: 0x55585e, metalness: 0.85, roughness: 0.62 }),
    brass: P({ color: 0xd9ad5c, metalness: 1, roughness: 0.28 }),
    copper: P({ color: 0xd9895a, metalness: 1, roughness: 0.3 }),
    chrome: P({ color: 0xffffff, metalness: 1, roughness: 0.06 }),
    dark: P({ color: 0x2a2d33, metalness: 0.3, roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.4 }),
    yellow: P({ color: 0xf2b822, metalness: 0.1, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.25 }),
    red: P({ color: 0xd8382e, metalness: 0.1, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.25 }),
    navy: P({ color: 0x2c3e66, metalness: 0.15, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.25 }),
    white: P({ color: 0xeef0f2, metalness: 0.05, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
    orange: P({ color: 0xf06a21, metalness: 0.1, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
    rubber: P({ color: 0x1c1d20, metalness: 0, roughness: 0.85 }),
    glass: P({ color: 0xcfe8ff, metalness: 0, roughness: 0.05, transmission: 0.9, thickness: 0.4, ior: 1.45, transparent: true, opacity: 1 }),
    glow: P({ color: 0x9fd8ff, emissive: 0x58b8ff, emissiveIntensity: 2.2, roughness: 0.3 }),
    hot: P({ color: 0xffb070, emissive: 0xff6a1a, emissiveIntensity: 0, roughness: 0.4, metalness: 0.6 }),
  };
  return {
    ...m,
    dispose() {
      for (const x of Object.values(m)) x.dispose();
    },
  };
}

/* ───────────── 모양 ───────────── */

/** 2D 윤곽을 두께 depth 로 돌출 + 모서리 깎기 (윤곽 크기는 그대로 — 깎기는 안쪽으로). Z 가운데 정렬 */
export function bevelExtrude(shape: THREE.Shape, depth: number, bevel: number, curveSeg = 24, bevelSeg = 3): THREE.BufferGeometry {
  const d = Math.max(0.001, depth - 2 * bevel);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: d,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: bevelSeg,
    curveSegments: curveSeg,
  });
  g.translate(0, 0, -d / 2);
  g.computeVertexNormals();
  return g;
}
/** 회전체 — [반지름, 높이] 점들을 Y 축으로 */
export function lathe(pts: [number, number][], segs = 48): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(r, y)),
    segs,
  );
}
/** 원 윤곽 (구멍용) */
export function circlePath(r: number, cx = 0, cy = 0, n = 40, cw = false): THREE.Path {
  const p = new THREE.Path();
  p.absarc(cx, cy, r, 0, TAU, cw);
  void n;
  return p;
}
/** 모서리 둥근 네모 윤곽 */
export function roundRect(w: number, h: number, r: number, cx = 0, cy = 0): THREE.Shape {
  const s = new THREE.Shape();
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x0 + r, y0);
  s.lineTo(x0 + w - r, y0);
  s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  s.lineTo(x0 + w, y0 + h - r);
  s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
  s.lineTo(x0 + r, y0 + h);
  s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
  s.lineTo(x0, y0 + r);
  s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}
const Y = new THREE.Vector3(0, 1, 0);
/** 원기둥 메시를 두 점 a → b 사이에 놓기 (길이 1 · Y 축 원기둥 기준, 늘이기는 scale.y) */
export function between(m: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3): void {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  m.position.copy(a).addScaledVector(d, 0.5);
  if (len > 1e-6) m.quaternion.setFromUnitVectors(Y, d.divideScalar(len));
  m.scale.y = len;
}

/* ───────────── 무대 ───────────── */

export interface Stage {
  scene: THREE.Scene;
  cam: THREE.PerspectiveCamera;
  key: THREE.DirectionalLight;
  ground: THREE.Mesh;
  /** 매 장면 — 환경 반사 붙이기 · 그림자 켜기. cam 을 주면 첫 장면에 셰이더를 뒤에서 미리 굽고, 다 구울 때까지 false (그동안 배경색만) */
  prepare(r: THREE.WebGLRenderer, cam?: THREE.Camera): boolean;
  dispose(): void;
}
/** 스튜디오 무대: 옅은 회청색 그러데이션 · 그림자만 받는 바닥 · 키 / 채움 / 뒤 테두리 빛 */
export function makeStage(opt: { size?: number; shadow?: number; bg?: [string, string] } = {}): Stage {
  loadHdr();
  const size = opt.size ?? 6;
  const scene = new THREE.Scene();
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 256);
  const [top, bottom] = opt.bg ?? ['#dfe5ec', '#b9c2cc'];
  gr.addColorStop(0, top);
  gr.addColorStop(1, bottom);
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 256);
  const bgTex = new THREE.CanvasTexture(c);
  bgTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = bgTex;
  const cam = new THREE.PerspectiveCamera(35, 1.6, 0.05, 200);
  const hemi = new THREE.HemisphereLight(0xf2f6ff, 0x5a5f68, 0.35);
  const key = new THREE.DirectionalLight(0xfff4e6, 2.4);
  key.position.set(size * 0.8, size * 1.4, size * 0.9);
  key.castShadow = true;
  key.shadow.mapSize.set(opt.shadow ?? 2048, opt.shadow ?? 2048);
  const sc = key.shadow.camera;
  sc.left = sc.bottom = -size;
  sc.right = sc.top = size;
  sc.near = 0.1;
  sc.far = size * 6;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  const fill = new THREE.DirectionalLight(0xdbe8ff, 0.6);
  fill.position.set(-size, size * 0.5, size * 0.6);
  const rim = new THREE.DirectionalLight(0xffffff, 1.4);
  rim.position.set(-size * 0.4, size * 0.8, -size * 1.2);
  scene.add(hemi, key, fill, rim);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(size * 3, 64).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.22 }));
  ground.receiveShadow = true;
  scene.add(ground);
  // 바닥에 은은한 동그란 그늘 (그림자 지도 없이도 물체가 땅에 앉아 보이게)
  const ao = (() => {
    const cc = document.createElement('canvas');
    cc.width = cc.height = 128;
    const gg = cc.getContext('2d')!;
    const r = gg.createRadialGradient(64, 64, 4, 64, 64, 63);
    r.addColorStop(0, 'rgba(30,36,46,0.28)');
    r.addColorStop(1, 'rgba(30,36,46,0)');
    gg.fillStyle = r;
    gg.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(cc);
  })();
  const aoM = new THREE.Mesh(new THREE.PlaneGeometry(size * 1.6, size * 1.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: ao, transparent: true, depthWrite: false }));
  aoM.position.y = 0.002;
  scene.add(aoM);
  let envSet: THREE.Texture | null = null;
  // 셰이더 미리 굽기 — 투과 유리 · 클리어코트 재질은 첫 컴파일이 1~2초라 그대로 그리면 페이지가 멈춘다
  let warm: 'no' | 'busy' | 'done' = 'no';
  const clearCol = new THREE.Color(bottom);
  return {
    scene,
    cam,
    key,
    ground,
    prepare(r, c) {
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFShadowMap;
      const e = envFor(r);
      if (e !== envSet) {
        scene.environment = e;
        scene.environmentIntensity = 0.9;
        envSet = e;
      }
      if (!c || warm === 'done') return true;
      if (warm === 'no') {
        warm = 'busy';
        r.compileAsync(scene, c)
          .catch(() => undefined)
          .then(() => (warm = 'done'));
      }
      r.setClearColor(clearCol, 1);
      r.clear();
      return false;
    },
    dispose() {
      bgTex.dispose();
      ao.dispose();
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      aoM.geometry.dispose();
      (aoM.material as THREE.Material).dispose();
    },
  };
}

/** 그림자 켜기 (모든 메시) */
export function shadows(root: THREE.Object3D, cast = true, receive = true): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = cast;
      m.receiveShadow = receive;
    }
  });
}
/** 만든 것 정리 (같은 기하 · 재질 한 번만) */
export function freeTree(root: THREE.Object3D): void {
  const seen = new Set<unknown>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !seen.has(m.geometry)) {
      seen.add(m.geometry);
      m.geometry.dispose();
    }
    if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
  });
}

/* ───────────── 글씨 판 ───────────── */

export interface Tag {
  text: string;
  x: number;
  y: number;
  ax: number;
  ay: number;
  bg?: string;
  big?: boolean;
}
export class Overlay {
  private canvas = document.createElement('canvas');
  private tex = new THREE.CanvasTexture(this.canvas);
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private key = '';
  private size = '';
  private last = 0;
  constructor() {
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false })));
  }
  draw(r: THREE.WebGLRenderer, w: number, h: number, tags: Tag[]): void {
    const key = `${w}x${h}|${tags.map((t) => `${t.text}${t.x}${t.y}${t.bg ?? ''}`).join('|')}`;
    // 글씨가 매 장면 바뀌어도(각도 · 길이 숫자) 화면 크기 판을 다시 그리는 건 1초에 10번까지
    const now = performance.now();
    if (key !== this.key && (`${w}x${h}` !== this.size || now - this.last > 100)) {
      this.key = key;
      this.size = `${w}x${h}`;
      this.last = now;
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
      const g = this.canvas.getContext('2d')!;
      g.clearRect(0, 0, w, h);
      const u = Math.min(w / 280, h / 175) * (w >= 700 ? 0.62 : 1);
      for (const t of tags) {
        const size = (t.big ? 9 : 7) * u;
        g.font = `700 ${size}px ${FONT}`;
        const tw = g.measureText(t.text).width;
        const pw = tw + size * 1.1;
        const ph = size * 1.6;
        const x0 = clamp(t.x * w - t.ax * pw, 4, w - pw - 4);
        const y0 = clamp(t.y * h - t.ay * ph, 4, h - ph - 4);
        g.beginPath();
        g.roundRect(x0, y0, pw, ph, ph / 2);
        g.fillStyle = t.bg ?? 'rgba(24,30,42,0.66)';
        g.fill();
        g.fillStyle = '#fff';
        g.textBaseline = 'middle';
        g.fillText(t.text, x0 + size * 0.55, y0 + ph / 2 + size * 0.05);
      }
      this.tex.needsUpdate = true;
    }
    const ac = r.autoClear;
    r.autoClear = false;
    r.clearDepth();
    r.render(this.scene, this.cam);
    r.autoClear = ac;
  }
  dispose(): void {
    this.tex.dispose();
    for (const o of this.scene.children) {
      const m = o as THREE.Mesh;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  }
}

/* ───────────── 크게 보기 끌기 · 누르기 (카드에서는 아무것도 안 함) ───────────── */

export class Drag {
  el: HTMLCanvasElement | null = null;
  dx = 0;
  dy = 0;
  wheel = 0;
  taps: { x: number; y: number }[] = [];
  /** 마지막으로 만진 뒤 지난 초 */
  idle = 99;
  private down: { x: number; y: number; moved: boolean } | null = null;
  attach(w: number, h: number): void {
    if (this.el || w < 700) return;
    for (const c of Array.from(document.querySelectorAll<HTMLCanvasElement>('canvas.hub-canvas')))
      if (c.width === w && c.height === h) {
        this.el = c;
        break;
      }
    if (!this.el) return;
    this.el.style.cursor = 'grab';
    this.el.style.touchAction = 'none';
    this.el.addEventListener('pointerdown', this.pd);
    this.el.addEventListener('wheel', this.wh, { passive: false });
    window.addEventListener('pointermove', this.pm);
    window.addEventListener('pointerup', this.pu);
  }
  tick(dt: number): void {
    this.idle += dt;
  }
  private pd = (e: PointerEvent): void => {
    this.down = { x: e.clientX, y: e.clientY, moved: false };
    this.idle = 0;
  };
  private pm = (e: PointerEvent): void => {
    if (!this.down) return;
    const dx = e.clientX - this.down.x;
    const dy = e.clientY - this.down.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) this.down.moved = true;
    if (this.down.moved) {
      this.dx += dx;
      this.dy += dy;
      this.down.x = e.clientX;
      this.down.y = e.clientY;
      this.idle = 0;
    }
  };
  private pu = (e: PointerEvent): void => {
    if (this.down && !this.down.moved && this.el) {
      const r = this.el.getBoundingClientRect();
      this.taps.push({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 });
    }
    this.down = null;
  };
  private wh = (e: WheelEvent): void => {
    e.preventDefault();
    this.wheel += e.deltaY;
    this.idle = 0;
  };
  dispose(): void {
    if (this.el) {
      this.el.removeEventListener('pointerdown', this.pd);
      this.el.removeEventListener('wheel', this.wh);
      this.el.style.cursor = '';
      this.el = null;
    }
    window.removeEventListener('pointermove', this.pm);
    window.removeEventListener('pointerup', this.pu);
  }
}

/** 궤도 카메라 — 끌면 돌리고 휠로 다가가기, 가만히 두면 천천히 저절로 돈다 */
export class Orbit {
  yaw: number;
  pitch: number;
  dist: number;
  constructor(
    public target: THREE.Vector3,
    yaw: number,
    pitch: number,
    dist: number,
    private minD = dist * 0.5,
    private maxD = dist * 1.6,
  ) {
    this.yaw = yaw;
    this.pitch = pitch;
    this.dist = dist;
  }
  update(cam: THREE.PerspectiveCamera, drag: Drag, dt: number, autoSpeed = 0.12): void {
    drag.tick(dt);
    this.yaw -= drag.dx * 0.006;
    this.pitch = clamp(this.pitch + drag.dy * 0.004, -0.1, 1.35);
    drag.dx = drag.dy = 0;
    if (drag.wheel) {
      this.dist = clamp(this.dist * Math.exp(drag.wheel * 0.001), this.minD, this.maxD);
      drag.wheel = 0;
    }
    if (drag.idle > 4) this.yaw += dt * autoSpeed * smooth(4, 6, drag.idle);
    const cp = Math.cos(this.pitch);
    cam.position.set(this.target.x + Math.sin(this.yaw) * cp * this.dist, this.target.y + Math.sin(this.pitch) * this.dist, this.target.z + Math.cos(this.yaw) * cp * this.dist);
    cam.lookAt(this.target);
  }
}

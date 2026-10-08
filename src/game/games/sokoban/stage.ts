import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeStatic } from '../shared/bake';
import { type Post, createPost } from '../shared/post';
import { buildChar, type CharId, drawFace, type Kit } from './chars';
import { type Board, DX, DY, type Dir } from './logic';

/**
 * 꼬마 창고지기 무대 — 복셀(블록) 3D + 도트 무늬. 거의 바로 위에서 내려다본다.
 * 무늬는 모두 16×16 도트 그림(가장 가까운 픽셀로 늘림)을 코드로 그린다: 나무 마루 · 돌 벽 위 잔디 · 나무 상자 · 잔디 마당.
 * 칸 하나 = 1, 바닥 윗면 y = 0. 칸 (x, y) → 월드 X = x − (w−1)/2, Z = y − (h−1)/2 (글자 줄 아래쪽이 화면 아래).
 */

export interface FreeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Keep = { dispose(): void };

interface Tween {
  t0: number;
  dur: number;
  step(k: number): void;
  done?(): void;
}

const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** 16×16 도트 그림 → 텍스처 (가장 가까운 픽셀) */
export function pix(draw: (p: (x: number, y: number, c: string) => void, r: () => number) => void, seed = 1, size = 16): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  let s = seed * 9301 + 49297;
  const r = (): number => ((s = (s * 16807) % 2147483647) / 2147483647);
  draw((x, y, col) => {
    g.fillStyle = col;
    g.fillRect(x, y, 1, 1);
  }, r);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapNearestFilter;
  t.generateMipmaps = true;
  return t;
}

const pick = <T,>(r: () => number, a: readonly T[]): T => a[Math.floor(r() * a.length)]!;

export class SokoStage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(24, 1, 0.1, 300);
  private readonly composer: EffectComposer;
  private readonly post: Post;
  private readonly observer: ResizeObserver;
  private readonly keep: Keep[] = [];
  private levelKeep: Keep[] = [];
  private readonly level = new THREE.Group();
  private board: Board | null = null;
  private free: FreeRect = { x: 0, y: 0, w: 1, h: 1 };
  private readonly tweens: Tween[] = [];
  private raf = 0;
  private last = performance.now();
  /* 판 위 것들 */
  private crates: THREE.Group[] = [];
  private pads: THREE.Group[] = [];
  readonly player = new THREE.Group();
  private readonly playerBody = new THREE.Group();
  private readonly tiles: THREE.Mesh[] = [];
  private readonly ray = new THREE.Raycaster();
  private walkPhase = 0;
  private cheer = 0;
  private readonly hintMarks: THREE.Group;
  private charKeep: Keep[] = [];
  private labels: THREE.Sprite[] = [];
  private critters: { root: THREE.Group; body: THREE.Group; kind: CharId; tx: number; tz: number; wait: number; phase: number; speed: number }[] = [];
  private readonly heights = new Map<string, number>();
  private fieldR = 10;
  private blocked: (x: number, z: number) => boolean = () => false;
  /** 들판 친구들이 지나가지 못하는 칸 — 나무 · 덤불 · 바위 · 두 층 둔덕 */
  private readonly solid = new Set<string>();
  private decorMats = new Map<number, THREE.Material>();
  private readonly sparks: { pts: THREE.Points; vel: Float32Array; t: number }[] = [];
  /* 재료 */
  private readonly tex: Record<string, THREE.Texture> = {};
  private readonly mat: Record<string, THREE.Material> = {};
  private readonly cube = new RoundedBoxGeometry(1, 1, 1, 2, 0.06);
  private readonly sharp = new THREE.BoxGeometry(1, 1, 1);
  private readonly dot: THREE.CanvasTexture;

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 0.84;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const canvas = this.renderer.domElement;
    Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%', touchAction: 'none' });
    host.appendChild(canvas);
    this.keep.push(this.cube, this.sharp);

    this.scene.background = new THREE.Color(0x78c052);
    this.scene.add(new THREE.HemisphereLight(0xeaf2ff, 0x3a5a2a, 0.55));
    const sun = new THREE.DirectionalLight(0xffe8c8, 3.1);
    sun.position.set(-9, 11, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 50 });
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun);

    // 명암 올리기 (기술 스튜디오) — 반사 · 구석 그늘(벽 밑 · 상자 틈) · 대비 · 비네트 · 계단 줄이기
    {
      const pm = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.environmentIntensity = 0.25;
      this.keep.push(this.scene.environment);
      pm.dispose();
    }
// 심도 · 가장자리 어둡게(비네트)는 뺌 — 그린 배경 · 판 가장자리가 흐리고 빛바래 보였다 (사용자 2026-10-05)
    this.post = createPost(this.renderer, this.scene, this.camera, {
      bloom: [0.25, 0.4, 1.2],
      ao: { radius: 0.3, scale: 1.2, blend: 1.0 },
      dof: null,
      grade: { vig: 0, warm: 0.03, con: 1.14 },
    });
    this.composer = this.post.composer;

    const dc = document.createElement('canvas');
    dc.width = dc.height = 64;
    const dg = dc.getContext('2d')!;
    const rg = dg.createRadialGradient(32, 32, 0, 32, 32, 30);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    dg.fillStyle = rg;
    dg.fillRect(0, 0, 64, 64);
    this.dot = new THREE.CanvasTexture(dc);
    this.keep.push(this.dot);

    this.makeTextures();
    this.makePlayer();
    this.hintMarks = new THREE.Group();
    this.scene.add(this.level, this.player, this.hintMarks);

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    this.raf = requestAnimationFrame(this.loop);
  }

  /* ───────────── 도트 무늬 ───────────── */

  private makeTextures(): void {
    const T = (k: string, t: THREE.CanvasTexture): void => {
      this.tex[k] = t;
      this.keep.push(t);
    };
    // 나무 마루 — 넓은 판자 둘, 결은 옅게 (상자 · 사람이 잘 보이게 차분한 밝은 나무)
    const floorTex = (seed: number, tones: string[]): THREE.CanvasTexture =>
      pix((p, r) => {
        for (let row = 0; row < 2; row++) {
          const base = tones[row]!;
          for (let y = row * 8; y < row * 8 + 8; y++)
            for (let x = 0; x < 16; x++) {
              let c = base;
              if (y === row * 8 + 7) c = tones[3]!;
              else if (y === row * 8) c = tones[2]!;
              else if (r() < 0.05) c = tones[4]!;
              p(x, y, c);
            }
        }
        p(2, 3, tones[4]!);
        p(13, 3, tones[4]!);
        p(2, 11, tones[4]!);
        p(13, 11, tones[4]!);
      }, seed);
    T('floor', floorTex(3, ['#f3d6a2', '#efcf98', '#fae4b8', '#d8ac70', '#e6c088']));
    T('floor2', floorTex(4, ['#ebc98f', '#e7c287', '#f4dcac', '#cf9f62', '#dcb478']));
    // 돌 벽 옆면 — 엇갈린 벽돌
    T(
      'wall',
      pix((p, r) => {
        for (let y = 0; y < 16; y++)
          for (let x = 0; x < 16; x++) {
            const row = Math.floor(y / 4);
            const off = row % 2 ? 4 : 0;
            const mortar = y % 4 === 3 || (x + off) % 8 === 7;
            const c = mortar ? '#7c7f92' : pick(r, ['#b9bccb', '#adb0c0', '#c4c7d4', '#a6a9ba']);
            p(x, y, y % 4 === 0 && !mortar ? '#d2d5e0' : c);
          }
      }, 5),
    );
    // 벽 윗면 — 둥근 돌 뚜껑 (네 귀퉁이 돌 · 밝은 가장자리 · 이끼 조금)
    T(
      'grassTop',
      pix((p, r) => {
        for (let y = 0; y < 16; y++)
          for (let x = 0; x < 16; x++) {
            const seam = x === 7 || x === 8 || y === 7 || y === 8;
            let c = seam ? '#8a8ea3' : pick(r, ['#cfd2de', '#c6c9d6', '#d8dbe5']);
            if (!seam && (x % 8 === 0 || y % 8 === 0)) c = '#eef0f6';
            if (!seam && (x % 8 === 6 || y % 8 === 6)) c = '#aeb2c2';
            p(x, y, c);
          }
        for (let k = 0; k < 6; k++) p(Math.floor(r() * 16), Math.floor(r() * 16), pick(r, ['#7cc14e', '#8fd05e']));
      }, 7),
    );
    // 마당 잔디 (큰 바탕)
    T(
      'yard',
      pix((p, r) => {
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p(x, y, pick(r, ['#78c052', '#76bd50', '#7bc355']));
        for (let k = 0; k < 4; k++) p(Math.floor(r() * 16), Math.floor(r() * 16), '#8cd064');
        p(Math.floor(r() * 16), Math.floor(r() * 16), '#fff3a0');
      }, 11),
    );
    (this.tex['yard']! as THREE.CanvasTexture).wrapS = (this.tex['yard']! as THREE.CanvasTexture).wrapT = THREE.RepeatWrapping;
    // 나무 상자 — 굵은 테두리 · X 버팀목 · 못
    const crate = (lit: boolean): THREE.CanvasTexture =>
      pix((p, r) => {
        const plank = lit ? ['#ffd36a', '#ffc94f', '#ffdb80'] : ['#d98f3e', '#cf8636', '#e09a4a'];
        const frame = lit ? '#e09a10' : '#8f5222';
        const frameHi = lit ? '#fff0a8' : '#b8733a';
        for (let y = 0; y < 16; y++)
          for (let x = 0; x < 16; x++) {
            let c = pick(r, plank);
            if (y % 5 === 4) c = lit ? '#e8b030' : '#a8642c';
            const edge = x < 2 || y < 2 || x > 13 || y > 13;
            const diag = Math.abs(x - y) <= 1 || Math.abs(x + y - 15) <= 1;
            if (edge || (diag && x > 1 && x < 14)) c = (x === 0 || y === 0) && edge ? frameHi : frame;
            p(x, y, c);
          }
        for (const [x, y] of [
          [1, 1],
          [14, 1],
          [1, 14],
          [14, 14],
        ] as const)
          p(x, y, lit ? '#fffbe0' : '#e8e0d0');
      }, lit ? 13 : 17);
    T('crate', crate(false));
    T('crateLit', crate(true));

    const M = (k: string, m: THREE.Material): void => {
      this.mat[k] = m;
      this.keep.push(m);
    };
    M('floor', new THREE.MeshStandardMaterial({ map: this.tex['floor'], roughness: 0.75 }));
    T(
      'dirt',
      pix((p, r) => {
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p(x, y, pick(r, ['#d9a86a', '#d2a064', '#e0b274', '#cc9a5e']));
        for (let k = 0; k < 6; k++) p(Math.floor(r() * 16), Math.floor(r() * 16), '#b8864e');
        for (let k = 0; k < 3; k++) p(Math.floor(r() * 16), Math.floor(r() * 16), '#ecc48a');
      }, 21),
    );
    T(
      'dirtSide',
      pix((p, r) => {
        for (let y = 0; y < 16; y++)
          for (let x = 0; x < 16; x++) {
            const grassy = y < 4 + ((x * 7) % 3);
            p(x, y, grassy ? pick(r, ['#6fbb48', '#62b040']) : pick(r, ['#b07a48', '#a8723f', '#ba8452']));
          }
        for (let k = 0; k < 4; k++) p(Math.floor(r() * 16), 6 + Math.floor(r() * 10), '#8a5a30');
      }, 23),
    );
    T(
      'grassBlock',
      pix((p, r) => {
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p(x, y, pick(r, ['#86cc5c', '#82c858', '#8ad060']));
        for (let k = 0; k < 5; k++) p(Math.floor(r() * 16), Math.floor(r() * 16), '#a0dc78');
        if (r() < 0.6) p(Math.floor(r() * 16), Math.floor(r() * 16), '#fff3a0');
      }, 25),
    );
    T(
      'water',
      pix((p, r) => {
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p(x, y, pick(r, ['#4fb4f0', '#4aaeee', '#55baf4']));
        for (let k = 0; k < 4; k++) {
          const y = Math.floor(r() * 16);
          const x = Math.floor(r() * 12);
          for (let i = 0; i < 4; i++) p(x + i, y, '#a8e2ff');
        }
      }, 27),
    );
    for (const k of ['water']) (this.tex[k] as THREE.CanvasTexture).wrapS = (this.tex[k] as THREE.CanvasTexture).wrapT = THREE.RepeatWrapping;
    (this.tex['water'] as THREE.CanvasTexture).repeat.set(3, 2);
    M('dirt', new THREE.MeshStandardMaterial({ map: this.tex['dirt'], roughness: 1 }));
    M('dirtSide', new THREE.MeshStandardMaterial({ map: this.tex['dirtSide'], roughness: 1 }));
    M('grassBlock', new THREE.MeshStandardMaterial({ map: this.tex['grassBlock'], roughness: 1 }));
    M('water', new THREE.MeshStandardMaterial({ map: this.tex['water'], roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88, emissive: 0x1a6fb0, emissiveIntensity: 0.25 }));
    M('outlineSoft', new THREE.MeshBasicMaterial({ color: 0x2a4a1e, side: THREE.BackSide }));
    M('floor2', new THREE.MeshStandardMaterial({ map: this.tex['floor2'], roughness: 0.75 }));
    M('outline', new THREE.MeshBasicMaterial({ color: 0x3a2418, side: THREE.BackSide }));
    M('outlineBox', new THREE.MeshBasicMaterial({ color: 0x4a2a12, side: THREE.BackSide }));
    M('ao', new THREE.MeshBasicMaterial({ map: this.aoTex(), color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false }));
    M('contact', new THREE.MeshBasicMaterial({ map: this.dot, color: 0x3a2a10, transparent: true, opacity: 0.45, depthWrite: false }));
    M('wallSide', new THREE.MeshStandardMaterial({ map: this.tex['wall'], roughness: 0.85 }));
    M('wallTop', new THREE.MeshStandardMaterial({ map: this.tex['grassTop'], roughness: 0.9 }));
    M('yard', new THREE.MeshStandardMaterial({ map: this.tex['yard'], roughness: 1 }));
    M('crate', new THREE.MeshStandardMaterial({ map: this.tex['crate'], roughness: 0.7 }));
    M('crateLit', new THREE.MeshStandardMaterial({ map: this.tex['crateLit'], roughness: 0.5, emissive: 0xffb300, emissiveIntensity: 0.35, emissiveMap: this.tex['crateLit'] }));
    M('pad', new THREE.MeshStandardMaterial({ color: 0xff2f6e, emissive: 0xe0004a, emissiveIntensity: 0.75, roughness: 0.4 }));
    M('padLit', new THREE.MeshStandardMaterial({ color: 0xfff0a0, emissive: 0xffc400, emissiveIntensity: 1.6, roughness: 0.3 }));
    M('glow', new THREE.MeshBasicMaterial({ map: this.dot, color: 0xff4f8b, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
    M('hint', new THREE.MeshBasicMaterial({ color: 0x3fd0ff, transparent: true, opacity: 0.85, depthWrite: false }));
  }

  /* ───────────── 꼬마 창고지기 (블록 사람) ───────────── */

  /** 뒷면만 그린 조금 큰 껍데기 = 진한 외곽선 (만화처럼 또렷하게) */
  private outline(m: THREE.Mesh, w: number, h: number, d: number, t: number, mat = this.mat['outline']!): void {
    const o = new THREE.Mesh(m.geometry, mat);
    o.scale.set(1 + (2 * t) / w, 1 + (2 * t) / h, 1 + (2 * t) / d);
    m.add(o);
  }

  /** 벽 밑 그늘 — 벽 쪽이 진하고 멀어질수록 옅다 */
  private aoTex(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 64;
    const g = c.getContext('2d')!;
    const gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, 64);
    const t = new THREE.CanvasTexture(c);
    this.keep.push(t);
    return t;
  }

  private own<T extends Keep>(t: T): T {
    this.keep.push(t);
    return t;
  }

  /** 블록 캐릭터를 짓는 도구 — keep 에 만든 재료를 모은다 */
  private kit(keep: Keep[]): Kit {
    const lk = <T extends Keep>(t: T): T => {
      keep.push(t);
      return t;
    };
    const mats = new Map<string, THREE.Material>();
    const mat = (color: number, opts: THREE.MeshStandardMaterialParameters = {}): THREE.Material => {
      const key = color + JSON.stringify(opts);
      let m = mats.get(key);
      if (!m) {
        m = lk(new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...opts }));
        mats.set(key, m);
      }
      return m;
    };
    const box: Kit['box'] = (parent, w, h, d, color, x, y, z, outline = true) => {
      const m = new THREE.Mesh(this.cube, color instanceof THREE.Material ? color : mat(color));
      m.scale.set(w, h, d);
      m.position.set(x, y, z);
      m.castShadow = true;
      if (outline) this.outline(m, w, h, d, 0.026);
      parent.add(m);
      return m;
    };
    const head: Kit['head'] = (parent, w, h, d, color, face, x, y, z) => {
      const tex = lk(pix((p) => drawFace(p, face), 1));
      const side = mat(color);
      const front = lk(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
      const m = new THREE.Mesh(this.sharp, [side, side, side, side, front, side]);
      m.scale.set(w, h, d);
      m.position.set(x, y, z);
      m.castShadow = true;
      this.outline(m, w, h, d, 0.026);
      parent.add(m);
      return m;
    };
    return { box, head, mat };
  }

  /** 상자를 미는 캐릭터 바꾸기 */
  setCharacter(id: CharId): void {
    for (const c of [...this.playerBody.children]) this.playerBody.remove(c);
    for (const k of this.charKeep) k.dispose();
    this.charKeep = [];
    const g = buildChar(id, this.kit(this.charKeep));
    for (const c of [...g.children]) this.playerBody.add(c);
    this.playerBody.userData = { ...g.userData };
    this.playerBody.scale.setScalar(1.15);
  }

  private makePlayer(): void {
    const sh = new THREE.Mesh(this.own(new THREE.CircleGeometry(0.34, 24)), this.own(new THREE.MeshBasicMaterial({ map: this.dot, color: 0x203010, transparent: true, opacity: 0.35, depthWrite: false })));
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.01;
    this.player.add(this.playerBody, sh);
    this.setCharacter('kid');
  }

  /* ───────────── 들판 — 언덕 · 흙길 · 연못 · 울타리 · 나무 · 돌아다니는 친구들 ───────────── */

  private buildField(b: Board, r: () => number, lk: <T extends Keep>(t: T) => T): void {
    const R = Math.ceil(Math.max(b.w, b.h) / 2) + 9;
    const bx = b.w / 2 + 0.9;
    const bz = b.h / 2 + 0.9;
    const inBoard = (x: number, z: number): boolean => Math.abs(x) < bx && Math.abs(z) < bz;
    // 흙길 — 판 아래 가운데에서 아래로, 중간에 오른쪽으로 꺾인다
    const path = new Set<string>();
    const pk = (x: number, z: number): string => `${Math.round(x - 0.5)},${Math.round(z - 0.5)}`;
    const turn = Math.round(bz + 2 + r() * 2);
    for (let z = Math.ceil(bz); z <= R; z++) path.add(pk(0.5, z + 0.5));
    for (let x = 0; x <= R; x++) path.add(pk(x + 0.5, turn + 0.5));
    // 연못 — 판 왼쪽 아래
    const pond = { x: -(bx + 3.2), z: bz * 0.4 + 1.5, w: 3, d: 2.2 };
    const inPond = (x: number, z: number, m = 0.6): boolean => Math.abs(x - pond.x) < pond.w / 2 + m && Math.abs(z - pond.z) < pond.d / 2 + m;
    this.fieldR = R;
    this.solid.clear();
    // 몸 둘레(반지름 0.3)까지 막힌 곳에 닿으면 못 간다 — 가운데 점만 보면 벽 모서리를 스치며 뚫고 들어간다
    const hit = (x: number, z: number): boolean => inBoard(x, z) || inPond(x, z, 0.4) || this.solid.has(pk(x, z)) || Math.abs(x) > R - 1 || Math.abs(z) > R - 1;
    this.blocked = (x, z) => hit(x, z) || hit(x + 0.3, z + 0.3) || hit(x - 0.3, z + 0.3) || hit(x + 0.3, z - 0.3) || hit(x - 0.3, z - 0.3);
    // 땅 — 잔디 바탕 + 둔덕 (한 층 · 두 층), 흙길 칸
    const yardSize = R * 2 + 16;
    const yardTex = this.tex['yard']! as THREE.CanvasTexture;
    yardTex.repeat.set(yardSize, yardSize);
    const yard = new THREE.Mesh(lk(new THREE.PlaneGeometry(yardSize, yardSize)), this.mat['yard']);
    yard.rotation.x = -Math.PI / 2;
    yard.position.y = -0.2;
    yard.receiveShadow = true;
    this.level.add(yard);
    const s1 = r() * 10;
    const s2 = r() * 10;
    const hill = (x: number, z: number): number => {
      const n = Math.sin(x * 0.42 + s1) + Math.cos(z * 0.37 + s2) + Math.sin((x - z) * 0.23 + s1 * 0.5) * 0.8;
      return n > 1.55 ? 2 : n > 0.85 ? 1 : 0;
    };
    const lumps: [number, number, number][] = [];
    const dirt: [number, number][] = [];
    this.heights.clear();
    for (let ix = -R; ix < R; ix++)
      for (let iz = -R; iz < R; iz++) {
        const x = ix + 0.5;
        const z = iz + 0.5;
        if (inBoard(x, z) || inPond(x, z, 0.3)) continue;
        if (path.has(pk(x, z))) {
          dirt.push([x, z]);
          continue;
        }
        const hgt = Math.abs(x) < bx + 0.6 && Math.abs(z) < bz + 0.6 ? 0 : hill(x, z);
        if (hgt) {
          lumps.push([x, z, hgt]);
          this.heights.set(pk(x, z), hgt * 0.32);
          if (hgt >= 2) this.solid.add(pk(x, z));
        }
      }
    const patches: [number, number][] = [];
    for (let ix = -R; ix < R; ix++)
      for (let iz = -R; iz < R; iz++) {
        const x = ix + 0.5;
        const z = iz + 0.5;
        if (inBoard(x, z) || inPond(x, z, 0.3) || path.has(pk(x, z)) || this.heights.has(pk(x, z))) continue;
        if (Math.sin(x * 1.3 + s2) * Math.cos(z * 1.1 + s1) > 0.35 || r() < 0.08) patches.push([x, z]);
      }
    const patchGeo = lk(new THREE.BoxGeometry(1, 0.02, 1));
    const patchMesh = new THREE.InstancedMesh(patchGeo, this.mat['grassBlock'], patches.length);
    const pm = new THREE.Matrix4();
    patches.forEach(([x, z], k) => {
      pm.makeTranslation(x, -0.195, z);
      patchMesh.setMatrixAt(k, pm);
    });
    patchMesh.receiveShadow = true;
    lk({ dispose: () => patchMesh.dispose() });
    this.level.add(patchMesh);
    const lumpGeo = lk(new THREE.BoxGeometry(1, 1, 1));
    const lumpMats = [this.mat['dirtSide']!, this.mat['dirtSide']!, this.mat['grassBlock']!, this.mat['dirtSide']!, this.mat['dirtSide']!, this.mat['dirtSide']!];
    const lumpMesh = new THREE.InstancedMesh(lumpGeo, lumpMats, lumps.length);
    const m4 = new THREE.Matrix4();
    lumps.forEach(([x, z, hh], k) => {
      const top = hh * 0.32;
      m4.compose(new THREE.Vector3(x, -0.2 + top / 2, z), new THREE.Quaternion(), new THREE.Vector3(1, top, 1));
      lumpMesh.setMatrixAt(k, m4);
    });
    lumpMesh.castShadow = true;
    lumpMesh.receiveShadow = true;
    lk({ dispose: () => lumpMesh.dispose() });
    this.level.add(lumpMesh);
    const dirtGeo = lk(new THREE.BoxGeometry(1, 0.04, 1));
    const dirtMesh = new THREE.InstancedMesh(dirtGeo, this.mat['dirt'], dirt.length);
    dirt.forEach(([x, z], k) => {
      m4.makeTranslation(x, -0.19, z);
      dirtMesh.setMatrixAt(k, m4);
    });
    dirtMesh.receiveShadow = true;
    lk({ dispose: () => dirtMesh.dispose() });
    this.level.add(dirtMesh);
    // 길가 울타리 — 흙길 아래쪽 줄을 따라 띄엄띄엄
    const post = lk(new THREE.MeshStandardMaterial({ color: 0xc89058, roughness: 0.8 }));
    for (let x = 2; x <= R - 1; x += 1) {
      if (r() < 0.25) continue;
      const fz = turn + 1.15;
      const fp = new THREE.Mesh(this.sharp, post);
      fp.scale.set(0.12, 0.42, 0.12);
      fp.position.set(x, -0.2 + 0.21, fz);
      fp.castShadow = true;
      this.level.add(fp);
      for (const y of [0.12, 0.28]) {
        const rail = new THREE.Mesh(this.sharp, post);
        rail.scale.set(1, 0.06, 0.06);
        rail.position.set(x + 0.5, -0.2 + y, fz);
        rail.castShadow = true;
        this.level.add(rail);
      }
    }
    // 연못 — 물결 무늬가 흐르는 물 · 둘레 돌 · 연잎 · 오리 대신 개구리
    const water = new THREE.Mesh(lk(new THREE.PlaneGeometry(pond.w, pond.d)), this.mat['water']);
    water.rotation.x = -Math.PI / 2;
    water.position.set(pond.x, -0.17, pond.z);
    const bed = new THREE.Mesh(this.sharp, lk(new THREE.MeshStandardMaterial({ color: 0x2f7fc8, roughness: 0.6 })));
    bed.scale.set(pond.w, 0.05, pond.d);
    bed.position.set(pond.x, -0.21, pond.z);
    bed.visible = false;
    this.level.add(bed, water);
    const stone = [lk(new THREE.MeshStandardMaterial({ color: 0xb8bccb, roughness: 0.9 })), lk(new THREE.MeshStandardMaterial({ color: 0x9fa4b6, roughness: 0.9 }))];
    const per = (pond.w + pond.d) * 2;
    for (let k = 0; k < per * 2.4; k++) {
      let t = (k / (per * 2.4)) * per;
      let x: number;
      let z: number;
      if (t < pond.w) [x, z] = [pond.x - pond.w / 2 + t, pond.z - pond.d / 2 - 0.12];
      else if ((t -= pond.w) < pond.d) [x, z] = [pond.x + pond.w / 2 + 0.12, pond.z - pond.d / 2 + t];
      else if ((t -= pond.d) < pond.w) [x, z] = [pond.x + pond.w / 2 - t, pond.z + pond.d / 2 + 0.12];
      else [x, z] = [pond.x - pond.w / 2 - 0.12, pond.z + pond.d / 2 - (t - pond.w)];
      const s = new THREE.Mesh(this.sharp, stone[k % 2]!);
      const sz = 0.2 + r() * 0.16;
      s.scale.set(sz, 0.1 + r() * 0.12, sz);
      s.position.set(x, -0.18, z);
      s.rotation.y = r();
      s.castShadow = true;
      this.level.add(s);
    }
    const pad = lk(new THREE.MeshStandardMaterial({ color: 0x4fb84a, roughness: 0.6 }));
    for (let k = 0; k < 3; k++) {
      const lp = new THREE.Mesh(this.sharp, pad);
      lp.scale.set(0.34, 0.02, 0.34);
      lp.position.set(pond.x + (r() - 0.5) * (pond.w - 0.6), -0.155, pond.z + (r() - 0.5) * (pond.d - 0.6));
      lp.rotation.y = r() * 3;
      this.level.add(lp);
      if (k === 0) {
        const fl = new THREE.Mesh(this.sharp, lk(new THREE.MeshStandardMaterial({ color: 0xffa0c0, emissive: 0xff6090, emissiveIntensity: 0.3 })));
        fl.scale.set(0.12, 0.1, 0.12);
        fl.position.set(lp.position.x, -0.12, lp.position.z);
        this.level.add(fl);
      }
    }
    // 나무 · 덤불 · 꽃밭 · 바위 · 버섯
    const free = (x: number, z: number, m = 0.8): boolean => !inBoard(x, z) && !inPond(x, z, m) && !path.has(pk(x, z)) && Math.abs(x) < R - 0.5 && Math.abs(z) < R - 0.5;
    const yAt = (x: number, z: number): number => -0.2 + (this.heights.get(pk(x, z)) ?? 0);
    let placed = 0;
    for (let k = 0; k < 900 && placed < R * 11; k++) {
      const x = (r() * 2 - 1) * R;
      const z = (r() * 2 - 1) * R;
      const near = Math.max(Math.abs(x) - bx, Math.abs(z) - bz);
      if (!free(x, z) || near < 0.2) continue;
      const kind = near > 2.5 && r() < 0.32 ? pick(r, ['tree', 'pine', 'tree', 'birch']) : pick(r, ['bush', 'flowers', 'flowers', 'rock', 'mush', 'grass', 'grass']);
      this.level.add(this.decor(x, yAt(x, z), z, r, lk, kind));
      if (!['grass', 'flowers', 'mush'].includes(kind)) this.solid.add(pk(x, z));
      placed++;
    }
  }

  /** 들판을 돌아다니는 친구들 */
  private spawnCritters(r: () => number): void {
    this.critters = [];
    const kinds: [CharId, number][] = [
      ['bunny', 0.8],
      ['bunny', 0.72],
      ['chick', 0.85],
      ['chick', 0.75],
      ['ghost', 0.85],
      ['slime', 0.8],
      ['monster', 0.8],
    ];
    for (const [kind, sc] of kinds) {
      const g = buildChar(kind, this.kit(this.levelKeep));
      g.scale.setScalar(sc);
      const sh = new THREE.Mesh(this.sharp, this.mat['contact']);
      sh.scale.set(0.7 / sc, 0.001, 0.7 / sc);
      sh.position.y = 0.01;
      const root = new THREE.Group();
      root.add(g, sh);
      let x = 0;
      let z = 0;
      for (let k = 0; k < 60; k++) {
        x = (r() * 2 - 1) * (this.fieldR - 2);
        z = (r() * 2 - 1) * (this.fieldR - 2);
        if (!this.blocked(x, z)) break;
      }
      // 빈자리를 못 찾으면 이 친구는 내보내지 않는다 (벽 · 나무 속에서 태어나지 않게)
      if (this.blocked(x, z)) continue;
      root.position.set(x, this.groundY(x, z), z);
      root.rotation.y = r() * Math.PI * 2;
      this.level.add(root);
      this.critters.push({ root, body: g, kind, tx: x, tz: z, wait: r() * 2, phase: r() * 10, speed: kind === 'ghost' ? 0.7 : kind === 'slime' ? 0.55 : kind === 'chick' ? 0.9 : 1.1 });
    }
  }

  private groundY(x: number, z: number): number {
    return -0.2 + (this.heights.get(`${Math.round(x - 0.5)},${Math.round(z - 0.5)}`) ?? 0);
  }

  private moveCritters(dt: number, t: number): void {
    for (const c of this.critters) {
      const { root, body } = c;
      c.phase += dt;
      const dx = c.tx - root.position.x;
      const dz = c.tz - root.position.z;
      const dist = Math.hypot(dx, dz);
      let moving = false;
      if (c.wait > 0) c.wait -= dt;
      else if (dist < 0.08) {
        c.wait = 0.8 + Math.random() * 2.6;
        for (let k = 0; k < 30; k++) {
          const a = Math.random() * Math.PI * 2;
          const d = 1.5 + Math.random() * 3.5;
          const nx = root.position.x + Math.cos(a) * d;
          const nz = root.position.z + Math.sin(a) * d;
          if (!this.blocked(nx, nz)) {
            c.tx = nx;
            c.tz = nz;
            break;
          }
        }
      } else {
        moving = true;
        const s = Math.min(dist, c.speed * dt);
        const nx = root.position.x + (dx / dist) * s;
        const nz = root.position.z + (dz / dist) * s;
        if (this.blocked(nx, nz)) {
          c.tx = root.position.x;
          c.tz = root.position.z;
        } else root.position.set(nx, root.position.y, nz);
        const want = Math.atan2(dx, dz);
        let dy = want - root.rotation.y;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        root.rotation.y += dy * Math.min(1, dt * 8);
      }
      const gy = this.groundY(root.position.x, root.position.z);
      root.position.y += (gy - root.position.y) * Math.min(1, dt * 10);
      const ph = c.phase * (c.kind === 'bunny' ? 9 : 7);
      body.position.y = 0;
      body.scale.setScalar(body.scale.x);
      if (c.kind === 'bunny') body.position.y = moving ? Math.abs(Math.sin(ph)) * 0.14 : 0;
      else if (c.kind === 'ghost') {
        body.position.y = 0.15 + Math.sin(t * 2 + c.phase) * 0.05;
        body.rotation.z = Math.sin(t * 1.7 + c.phase) * 0.06;
      }
      else if (c.kind === 'slime') {
        const q = moving ? Math.abs(Math.sin(ph)) : 0.15 + Math.sin(t * 3 + c.phase) * 0.1;
        const s0 = 0.8;
        body.scale.set(s0 * (1 + (1 - q) * 0.15), s0 * (0.85 + q * 0.3), s0 * (1 + (1 - q) * 0.15));
        body.position.y = moving ? q * 0.08 : 0;
      } else if (c.kind === 'chick') body.rotation.z = moving ? Math.sin(ph) * 0.15 : 0;
      else if (c.kind === 'monster') body.position.y = moving ? Math.abs(Math.sin(ph)) * 0.06 : 0;
      const sw = moving ? Math.sin(ph) * 0.7 : Math.sin(t * 2 + c.phase) * 0.08;
      for (const [n, s] of [
        ['armL', 1],
        ['armR', -1],
        ['legL', -1],
        ['legR', 1],
      ] as const) {
        const o = body.getObjectByName(n);
        if (!o) continue;
        if (c.kind === 'ghost') o.rotation.z = (n === 'armL' ? -0.5 : 0.5) + Math.sin(t * 3 + c.phase + (n === 'armL' ? 0 : 1.5)) * 0.25;
        else o.rotation.x = sw * s;
      }
    }
  }

  /* ───────────── 판 ───────────── */

  world(i: number): THREE.Vector3 {
    const b = this.board!;
    return new THREE.Vector3((i % b.w) - (b.w - 1) / 2, 0, Math.floor(i / b.w) - (b.h - 1) / 2);
  }

  setBoard(b: Board, player: number, boxes: readonly number[]): void {
    this.board = b;
    this.tweens.length = 0;
    for (const o of [...this.level.children]) this.level.remove(o);
    for (const k of this.levelKeep) k.dispose();
    this.levelKeep = [];
    this.crates = [];
    this.pads = [];
    this.tiles.length = 0;
    this.clearHint();
    this.setLabels([]);
    this.decorMats = new Map();
    const lk = <T extends Keep>(t: T): T => {
      this.levelKeep.push(t);
      return t;
    };
    let seed = b.w * 7 + b.h;
    const r = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const floorGeo = lk(new THREE.BoxGeometry(1, 0.2, 1));
    const aoGeo = lk(new THREE.PlaneGeometry(1, 0.4));
    const sideMats = [this.mat['wallSide']!, this.mat['wallSide']!, this.mat['wallTop']!, this.mat['wallSide']!, this.mat['wallSide']!, this.mat['wallSide']!];
    const wallGeo = lk(new THREE.BoxGeometry(1, 0.9, 1));
    for (let i = 0; i < b.w * b.h; i++) {
      const p = this.world(i);
      if (b.cell[i] === 0) {
        const cx = i % b.w;
        const cy = Math.floor(i / b.w);
        const t = new THREE.Mesh(floorGeo, (cx + cy) % 2 ? this.mat['floor2'] : this.mat['floor']);
        t.position.set(p.x, -0.1, p.z);
        for (let d = 0; d < 4; d++) {
          const nx = cx + [1, 0, -1, 0][d]!;
          const ny = cy + [0, -1, 0, 1][d]!;
          if (nx < 0 || ny < 0 || nx >= b.w || ny >= b.h || b.cell[ny * b.w + nx] !== 1) continue;
          const ao = new THREE.Mesh(aoGeo, this.mat['ao']);
          ao.rotation.x = -Math.PI / 2;
          ao.rotation.z = [Math.PI / 2, 0, -Math.PI / 2, Math.PI][d]!;
          ao.position.set(p.x + [1, 0, -1, 0][d]! * 0.3, 0.004, p.z + [0, -1, 0, 1][d]! * 0.3);
          this.level.add(ao);
        }
        t.receiveShadow = true;
        t.userData['cell'] = i;
        this.level.add(t);
        this.tiles.push(t);
      } else if (b.cell[i] === 1) {
        const w = new THREE.Mesh(wallGeo, sideMats);
        const hgt = 0.95 + r() * 0.12;
        w.scale.y = hgt / 0.9;
        w.position.set(p.x, -0.2 + hgt / 2, p.z);
        w.castShadow = true;
        w.receiveShadow = true;
        this.level.add(w);
        // 벽 위 작은 장식 — 풀 포기 · 꽃 · 버섯
        if (r() < 0.3) this.level.add(this.decor(p.x + (r() - 0.5) * 0.4, -0.2 + hgt, p.z + (r() - 0.5) * 0.4, r, lk));
      }
    }
    this.buildField(b, r, lk);
    this.spawnCritters(r);
    // 목표 자리 — 분홍 빛 고리 (상자가 들어가면 금빛)
    for (let i = 0; i < b.w * b.h; i++) {
      if (!b.goal[i]) continue;
      const g = new THREE.Group();
      const p = this.world(i);
      for (const [w, d] of [
        [0.62, 0.1],
        [0.1, 0.62],
      ] as const) {
        const bar = new THREE.Mesh(this.sharp, this.mat['pad']);
        bar.scale.set(w * 1.05, 0.05, d * 1.05);
        bar.position.y = 0.02;
        g.add(bar);
      }
      // 네모 테두리 (도트 느낌)
      for (const [x, z, w, d] of [
        [0, -0.33, 0.74, 0.08],
        [0, 0.33, 0.74, 0.08],
        [-0.33, 0, 0.08, 0.58],
        [0.33, 0, 0.08, 0.58],
      ] as const) {
        const e = new THREE.Mesh(this.sharp, this.mat['pad']);
        e.scale.set(w, 0.05, d * 1.3);
        e.position.set(x, 0.02, z);
        g.add(e);
      }
      const glow = new THREE.Mesh(lk(new THREE.PlaneGeometry(1.3, 1.3)), this.mat['glow']);
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.03;
      glow.name = 'glow';
      g.add(glow);
      g.position.set(p.x, 0, p.z);
      g.userData['cell'] = i;
      this.level.add(g);
      this.pads.push(g);
    }
    // 상자
    for (const i of boxes) {
      const c = new THREE.Group();
      const m = new THREE.Mesh(this.cube, this.mat['crate']);
      m.scale.setScalar(0.84);
      m.position.y = 0.42;
      m.castShadow = true;
      m.receiveShadow = true;
      this.outline(m, 1, 1, 1, 0.035, this.mat['outlineBox']);
      const cs = new THREE.Mesh(this.sharp, this.mat['contact']);
      cs.scale.set(1.15, 0.001, 1.15);
      cs.position.y = 0.006;
      c.add(cs);
      m.name = 'crate';
      c.add(m);
      c.position.copy(this.world(i));
      this.level.add(c);
      this.crates.push(c);
    }
    // 고정된 물체 합치기 (화질 그대로, 그리기 호출만 줄임 — shared/bake.ts). 상자 · 들판 친구들은 움직이니 뺀다
    for (const c of this.crates) c.userData['dynamic'] = true;
    for (const c of this.critters) c.root.userData['dynamic'] = true;
    mergeStatic(this.level, lk, { transparent: true });
    this.player.position.copy(this.world(player));
    this.player.rotation.y = 0;
    this.refresh(boxes);
    this.fit();
  }

  /** 작은 복셀 장식 — 풀 포기 · 꽃 · 버섯 · 덤불 */
  private decor(x: number, y: number, z: number, r: () => number, lk: <T extends Keep>(t: T) => T, kindIn?: string): THREE.Group {
    const g = new THREE.Group();
    const mats = this.decorMats;
    const vox = (w: number, h: number, d: number, color: number, px: number, py: number, pz: number, line = false): void => {
      let m = mats.get(color);
      if (!m) {
        m = lk(new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
        mats.set(color, m);
      }
      const v = new THREE.Mesh(this.sharp, m);
      v.scale.set(w, h, d);
      v.position.set(px, py + h / 2, pz);
      v.castShadow = true;
      v.receiveShadow = true;
      if (line) this.outline(v, w, h, d, 0.02, this.mat['outlineSoft']);
      g.add(v);
    };
    const kind = kindIn ?? pick(r, ['grass', 'flower', 'mush']);
    const greens = [0x3e9e3a, 0x4fb444, 0x62c650, 0x2f8a34];
    if (kind === 'grass') {
      for (let k = 0; k < 4; k++) vox(0.07, 0.1 + r() * 0.1, 0.07, pick(r, [0x5fb83a, 0x6cc444, 0x58ad36]), (r() - 0.5) * 0.25, 0, (r() - 0.5) * 0.25);
    } else if (kind === 'flower' || kind === 'flowers') {
      const n = kind === 'flowers' ? 3 + Math.floor(r() * 4) : 1;
      for (let k = 0; k < n; k++) {
        const c = pick(r, [0xff7aa0, 0xffe066, 0xffffff, 0xa98bff, 0xff9a4a]);
        const px = n > 1 ? (r() - 0.5) * 0.7 : 0;
        const pz = n > 1 ? (r() - 0.5) * 0.7 : 0;
        const hh = 0.14 + r() * 0.1;
        vox(0.04, hh, 0.04, 0x4f9e32, px, 0, pz);
        vox(0.07, 0.03, 0.12, 0x5fb83a, px + 0.05, 0.04, pz);
        vox(0.15, 0.05, 0.15, c, px, hh, pz);
        vox(0.06, 0.06, 0.06, 0xffd23a, px, hh + 0.02, pz);
      }
    } else if (kind === 'mush') {
      for (let k = 0; k < 1 + Math.floor(r() * 2); k++) {
        const px = k * 0.18;
        const s = 1 - k * 0.3;
        vox(0.08 * s, 0.1 * s, 0.08 * s, 0xfff4e0, px, 0, 0);
        vox(0.22 * s, 0.09 * s, 0.22 * s, 0xff4a4a, px, 0.1 * s, 0, true);
        vox(0.05 * s, 0.02, 0.05 * s, 0xffffff, px + 0.05 * s, 0.19 * s, 0.05 * s);
        vox(0.04 * s, 0.02, 0.04 * s, 0xffffff, px - 0.06 * s, 0.19 * s, -0.03 * s);
      }
    } else if (kind === 'rock') {
      const s = 0.3 + r() * 0.3;
      vox(s, s * 0.5, s * 0.8, 0xa9adbd, 0, 0, 0, true);
      vox(s * 0.6, s * 0.3, s * 0.5, 0xc4c8d6, -s * 0.1, s * 0.5, 0);
      if (r() < 0.5) vox(s * 0.3, 0.03, s * 0.3, 0x7cc14e, s * 0.15, s * 0.8, 0.05);
    } else if (kind === 'bush') {
      const s = 0.45 + r() * 0.3;
      vox(s, s * 0.6, s, pick(r, greens), 0, 0, 0, true);
      vox(s * 0.7, s * 0.35, s * 0.7, pick(r, greens), (r() - 0.5) * 0.1, s * 0.6, 0);
      for (let k = 0; k < 3; k++) if (r() < 0.6) vox(0.08, 0.08, 0.08, pick(r, [0xff4a6a, 0x5a6aff, 0xffe066]), (r() - 0.5) * s, s * (0.3 + r() * 0.5), s * 0.5);
    } else if (kind === 'pine') {
      vox(0.18, 0.35, 0.18, 0x7a4a26, 0, 0, 0);
      const h = 0.35;
      [1.0, 0.78, 0.56, 0.34].forEach((w, k) => vox(w, 0.32, w, k % 2 ? 0x2f8a34 : 0x3e9e3a, 0, h + k * 0.3, 0, k === 0));
      vox(0.14, 0.14, 0.14, 0x4fb444, 0, h + 1.2, 0);
    } else if (kind === 'birch') {
      vox(0.16, 0.9, 0.16, 0xf2efe4, 0, 0, 0);
      for (let k = 0; k < 3; k++) vox(0.17, 0.04, 0.08, 0x3a3a3a, 0, 0.2 + k * 0.25, 0.05);
      vox(0.8, 0.45, 0.8, 0x8fd04a, 0, 0.8, 0, true);
      vox(0.5, 0.3, 0.5, 0xa4dc5e, 0.05, 1.25, 0);
    } else {
      // 동글 나무 — 둥치 + 층진 잎 + 사과
      vox(0.22, 0.55, 0.22, 0x8a5a30, 0, 0, 0);
      vox(1.0, 0.55, 1.0, pick(r, greens), 0, 0.5, 0, true);
      vox(0.72, 0.4, 0.72, pick(r, greens), 0, 1.05, 0);
      vox(0.36, 0.25, 0.36, 0x62c650, 0, 1.45, 0);
      for (let k = 0; k < 3; k++) if (r() < 0.6) vox(0.1, 0.1, 0.1, 0xff3a3a, (r() - 0.5) * 0.8, 0.6 + r() * 0.4, 0.5);
    }
    g.position.set(x, y, z);
    g.rotation.y = Math.floor(r() * 4) * (Math.PI / 2);
    return g;
  }

  /** 자리에 든 상자 · 자리 표시를 다시 칠한다 */
  refresh(boxes: readonly number[]): void {
    const b = this.board;
    if (!b) return;
    const on = new Set(boxes);
    boxes.forEach((i, k) => {
      const m = this.crates[k]!.getObjectByName('crate') as THREE.Mesh;
      const lit = b.goal[i] === 1;
      const was = m.material === this.mat['crateLit'];
      m.material = lit ? this.mat['crateLit']! : this.mat['crate']!;
      if (lit && !was) this.pop(k);
    });
    for (const p of this.pads) {
      const filled = on.has(p.userData['cell'] as number);
      p.children.forEach((c) => {
        if (c.name === 'glow') c.visible = !filled;
        else (c as THREE.Mesh).material = filled ? this.mat['padLit']! : this.mat['pad']!;
      });
    }
  }

  /** 상자가 자리에 들어간 순간 — 통 튀고 반짝 */
  private pop(k: number): void {
    const c = this.crates[k]!;
    const m = c.getObjectByName('crate')!;
    this.tweens.push({
      t0: performance.now(),
      dur: 0.35,
      step: (t) => {
        const s = 0.84 * (1 + Math.sin(t * Math.PI) * 0.12);
        m.scale.set(s, 0.84 * (1 - Math.sin(t * Math.PI) * 0.08), s);
      },
      done: () => m.scale.setScalar(0.84),
    });
    this.sparkle(c.position, 0xffe066, 18);
  }

  private sparkle(at: THREE.Vector3, color: number, n: number): void {
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos.set([at.x, 0.8, at.z], i * 3);
      const a = Math.random() * Math.PI * 2;
      const s = 0.8 + Math.random() * 1.4;
      vel.set([Math.cos(a) * s, 1.5 + Math.random() * 2, Math.sin(a) * s], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color, size: 0.13, transparent: true, depthWrite: false }));
    this.scene.add(pts);
    this.sparks.push({ pts, vel, t: 0 });
  }

  /* ───────────── 움직임 ───────────── */

  get busy(): boolean {
    return this.tweens.some((t) => t.dur > 0.1 && t.done !== undefined && (t as Tween & { move?: boolean }).move === true);
  }

  /** 사람 한 칸 (pushed ≥ 0 이면 그 상자도 같이) */
  walk(to: number, d: Dir, pushed: number, boxTo: number, done: () => void): void {
    for (let k = this.tweens.length - 1; k >= 0; k--) if ((this.tweens[k] as Tween & { bump?: boolean }).bump) this.tweens.splice(k, 1);
    const from = this.player.position.clone();
    const end = this.world(to);
    const yaw = [Math.PI / 2, Math.PI, -Math.PI / 2, 0][d]!;
    const y0 = this.player.rotation.y;
    let dy = yaw - y0;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    const crate = pushed >= 0 ? this.crates[pushed]! : null;
    const cFrom = crate?.position.clone();
    const cEnd = crate ? this.world(boxTo) : null;
    const tw: Tween & { move: boolean } = {
      move: true,
      t0: performance.now(),
      dur: crate ? 0.2 : 0.13,
      step: (k) => {
        const e = ease(k);
        this.player.position.lerpVectors(from, end, e);
        this.player.position.y = Math.sin(k * Math.PI) * (crate ? 0.02 : 0.05);
        this.player.rotation.y = y0 + dy * Math.min(1, k * 3);
        this.playerBody.rotation.x = crate ? 0.22 : 0;
        this.walkPhase += 0.5;
        if (crate && cFrom && cEnd) crate.position.lerpVectors(cFrom, cEnd, e);
      },
      done: () => {
        this.player.position.copy(end);
        if (crate && cEnd) crate.position.copy(cEnd);
        done();
      },
    };
    this.tweens.push(tw);
  }

  /** 못 가는 쪽 — 그 자리에서 움찔 */
  bump(d: Dir, cell: number): void {
    // 이미 움찔하는 중이면 무시 — 겹치면 밀려난 자리를 기준으로 삼아 조금씩 벽 속으로 파고든다
    if (this.tweens.some((t) => (t as Tween & { bump?: boolean }).bump)) return;
    // 기준은 언제나 지금 서 있는 칸의 한가운데
    const base = this.world(cell);
    const tw: Tween & { bump: boolean } = {
      bump: true,
      t0: performance.now(),
      dur: 0.2,
      step: (k) => {
        const s = Math.sin(k * Math.PI) * 0.12;
        this.player.position.set(base.x + DX[d] * s, base.y, base.z + DY[d] * s);
      },
      done: () => this.player.position.copy(base),
    };
    this.tweens.push(tw);
  }


  /** 상자 갸웃 — 갈 수 없는 상자를 눌렀을 때 「여기 못 가요」 (좌우로 살짝 흔들림) */
  wiggleCrate(k: number): void {
    const c = this.crates[k];
    const m = c?.getObjectByName('crate');
    if (!m) return;
    this.tweens.push({
      t0: performance.now(),
      dur: 0.38,
      step: (t) => {
        m.rotation.y = Math.sin(t * Math.PI * 4) * (1 - t) * 0.18;
      },
      done: () => {
        m.rotation.y = 0;
      },
    });
  }

  /** 바로 그 자리로 (되돌리기 · 처음부터) */
  place(player: number, boxes: readonly number[]): void {
    this.tweens.length = 0;
    this.player.position.copy(this.world(player));
    this.playerBody.rotation.x = 0;
    boxes.forEach((i, k) => this.crates[k]!.position.copy(this.world(i)));
    this.refresh(boxes);
  }

  celebrate(): void {
    this.cheer = 2.5;
    for (const c of this.crates) this.sparkle(c.position, 0xfff3a0, 14);
  }

  flush(): void {
    for (let g = 0; this.tweens.length && g < 500; g++) {
      const t = this.tweens.shift()!;
      t.step(1);
      t.done?.();
    }
  }

  /* ───────────── 힌트 표시 — 걸을 길(점) + 밀 쪽 화살표 ───────────── */

  showHint(path: number[], box: number, d: Dir): void {
    this.clearHint();
    for (const i of path) {
      const p = this.world(i);
      const m = new THREE.Mesh(this.sharp, this.mat['hint']);
      m.scale.set(0.14, 0.03, 0.14);
      m.position.set(p.x, 0.03, p.z);
      this.hintMarks.add(m);
    }
    const p = this.world(box);
    const arrow = new THREE.Group();
    const shaft = new THREE.Mesh(this.sharp, this.mat['hint']);
    shaft.scale.set(0.12, 0.05, 0.4);
    shaft.position.z = -0.1;
    const headL = new THREE.Mesh(this.sharp, this.mat['hint']);
    headL.scale.set(0.12, 0.05, 0.32);
    headL.position.set(-0.09, 0, -0.32);
    headL.rotation.y = -0.7;
    const headR = headL.clone();
    headR.position.x = 0.09;
    headR.rotation.y = 0.7;
    arrow.add(shaft, headL, headR);
    arrow.position.set(p.x + DX[d] * 0.15, 1.0, p.z + DY[d] * 0.15);
    arrow.rotation.y = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][d]!;
    arrow.name = 'arrow';
    this.hintMarks.add(arrow);
  }

  clearHint(): void {
    for (const c of [...this.hintMarks.children]) this.hintMarks.remove(c);
  }

  /** 칸 위 동그란 글씨표 (수학 이야기 — × 갇히는 칸 등). tone: red 위험 · blue 보통 */
  setLabels(list: { cell: number; text: string; tone?: 'red' | 'blue' }[]): void {
    for (const sp of this.labels) {
      this.scene.remove(sp);
      sp.material.map?.dispose();
      sp.material.dispose();
    }
    this.labels = [];
    for (const { cell, text, tone = 'blue' } of list) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d')!;
      g.fillStyle = tone === 'red' ? '#ff4a5a' : '#ffffff';
      g.strokeStyle = tone === 'red' ? '#8a1020' : '#1f5fc4';
      g.lineWidth = 6;
      g.fillRect(6, 6, 52, 52);
      g.strokeRect(6, 6, 52, 52);
      g.fillStyle = tone === 'red' ? '#ffffff' : '#1f4fa8';
      g.font = '900 38px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, 32, 35);
      const tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      sp.renderOrder = 5;
      sp.scale.setScalar(0.42);
      sp.position.copy(this.world(cell));
      sp.position.y = 0.35;
      this.scene.add(sp);
      this.labels.push(sp);
    }
  }

  /* ───────────── 고르기 ───────────── */

  pickCell(clientX: number, clientY: number): number {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), this.camera);
    this.scene.updateMatrixWorld();
    if (!this.board) return -1;
    const b = this.board;
    // 먼저 서 있는 것(벽 · 상자 · 사람)의 몸통 — 비스듬히 보니 윗면을 바닥 평면으로만 세면 뒤 칸이 잡혔다 (2026-10-05)
    // 벽은 합쳐진 메시라 칸마다 상자 모양으로 셈
    const ray = this.ray.ray;
    const box = new THREE.Box3();
    const hitAt = new THREE.Vector3();
    let best = Infinity;
    let bestCell = -1;
    const test = (cell: number, cx: number, cz: number, half: number, y0: number, y1: number): void => {
      box.min.set(cx - half, y0, cz - half);
      box.max.set(cx + half, y1, cz + half);
      if (!ray.intersectBox(box, hitAt)) return;
      const d = hitAt.distanceToSquared(ray.origin);
      if (d < best) {
        best = d;
        bestCell = cell;
      }
    };
    const cellAt = (v: THREE.Vector3): number => {
      const x = Math.round(v.x + (b.w - 1) / 2);
      const y = Math.round(v.z + (b.h - 1) / 2);
      return x < 0 || y < 0 || x >= b.w || y >= b.h ? -1 : y * b.w + x;
    };
    for (let i = 0; i < b.w * b.h; i++) {
      if (b.cell[i] !== 1) continue;
      const w = this.world(i);
      // 높이는 벽 윗면보다 살짝 낮게 — 벽 뒤 바닥 칸의 한가운데를 누르면 바닥이 잡히게
      test(i, w.x, w.z, 0.5, 0, 0.72);
    }
    for (const c of this.crates) {
      const i = cellAt(c.position);
      if (i >= 0) test(i, c.position.x, c.position.z, 0.42, 0, 0.84);
    }
    const pc = cellAt(this.player.position);
    if (pc >= 0) test(pc, this.player.position.x, this.player.position.z, 0.36, 0, 1.15);
    if (bestCell >= 0) return bestCell;
    // 바닥 평면 y = 0 과 만나는 점 → 칸
    const t = -ray.origin.y / ray.direction.y;
    if (!(t > 0)) return -1;
    const p = ray.at(t, new THREE.Vector3());
    const x = Math.round(p.x + (b.w - 1) / 2);
    const y = Math.round(p.z + (b.h - 1) / 2);
    if (x < 0 || y < 0 || x >= b.w || y >= b.h) return -1;
    return y * b.w + x;
  }

  /* ───────────── 화면 맞춤 ───────────── */

  setFree(rect: FreeRect): void {
    this.free = rect;
    this.fit();
  }

  private resize(): void {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (w <= 0 || h <= 0) return;
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, this.renderer.getPixelRatio());
    this.fit();
  }

  private fit(): void {
    const W = this.host.clientWidth;
    const H = this.host.clientHeight;
    if (W <= 0 || H <= 0 || !this.board) return;
    const pitch = THREE.MathUtils.degToRad(56);
    this.camera.aspect = W / H;
    this.camera.updateProjectionMatrix();
    const f = this.free;
    const sx = (f.x + f.w / 2 - W / 2) / (W / 2);
    const sy = -(f.y + f.h / 2 - H / 2) / (H / 2);
    const hx = this.board.w / 2 + 0.3;
    const hz = this.board.h / 2 + 0.3;
    const corners: THREE.Vector3[] = [];
    for (const x of [-hx, hx]) for (const z of [-hz, hz]) for (const y of [-0.2, 1.2]) corners.push(new THREE.Vector3(x, y, z));
    const dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
    const target = new THREE.Vector3(0, 0, 0.15);
    const fits = (dist: number): boolean => {
      this.camera.position.copy(dir).multiplyScalar(dist).add(target);
      this.camera.lookAt(target);
      this.camera.updateMatrixWorld();
      return corners.every((c) => {
        const v = c.clone().project(this.camera);
        return Math.abs(v.x) <= (f.w / W) * 0.95 && Math.abs(v.y) <= (f.h / H) * 0.95;
      });
    };
    let lo = 2;
    let hi = 200;
    for (let k = 0; k < 30; k++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    fits(hi);
    this.camera.projectionMatrix.elements[8] = -sx;
    this.camera.projectionMatrix.elements[9] = -sy;
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
  }

  /* ───────────── 그리기 ───────────── */

  private loop = (now: number): void => {
    this.raf = requestAnimationFrame(this.loop);
    // 실제 흐른 시간대로 — 예전엔 0.05초로 잘라 느린 폰(20fps 아래)에서 모든 움직임이 슬로모션이 됐다.
    // 여기서 dt 는 덧셈 · 남은 시간 · 상한을 둔 따라가기에만 쓰여 0.25초를 한 번에 넣어도 튀지 않는다
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    const t = now / 1000;
    for (let k = 0; k < this.tweens.length; k++) {
      const tw = this.tweens[k]!;
      const p = Math.min(1, (now - tw.t0) / 1000 / tw.dur);
      tw.step(p);
      if (p >= 1) {
        this.tweens.splice(k--, 1);
        tw.done?.();
      }
    }
    const moving = this.tweens.length > 0;
    // 걸음 — 팔다리 흔들기, 서 있으면 숨쉬기
    const by = this.playerBody;
    const ghost = !!by.userData['float'];
    const swing = moving && !ghost ? Math.sin(this.walkPhase) * 0.7 : 0;
    for (const [n, s] of [
      ['armL', 1],
      ['armR', -1],
      ['legL', -1],
      ['legR', 1],
    ] as const) {
      const o = by.getObjectByName(n);
      if (o) o.rotation.x = swing * s;
    }
    if (!moving) by.rotation.x *= 0.8;
    if (ghost) {
      // 유령 — 늘 같은 높이에서 둥실 · 옆으로 살랑, 밀 때도 몸을 숙이지 않는다
      by.position.y = 0.16 + Math.sin(t * 2.4) * 0.05;
      by.rotation.x = 0;
      by.rotation.z = Math.sin(t * 1.8) * 0.06;
    } else if (!moving) by.position.y = Math.abs(Math.sin(t * 2.2)) * 0.02;
    if (by.userData['squish']) {
      const q = moving ? Math.abs(Math.sin(this.walkPhase)) : 0.5 + Math.sin(t * 3) * 0.3;
      by.scale.set(1.15 * (1 + (1 - q) * 0.12), 1.15 * (0.88 + q * 0.2), 1.15 * (1 + (1 - q) * 0.12));
    }
    const bulb = by.getObjectByName('bulb') as THREE.Mesh | undefined;
    if (bulb) bulb.visible = Math.sin(t * 6) > -0.3;
    this.moveCritters(dt, t);
    const wt = this.tex['water'];
    if (wt) wt.offset.set((t * 0.03) % 1, (Math.sin(t * 0.5) * 0.02) % 1);
    // 신나면 폴짝폴짝 + 팔 번쩍
    if (this.cheer > 0) {
      this.cheer -= dt;
      by.position.y = (ghost ? 0.16 : 0) + Math.abs(Math.sin(t * 9)) * 0.12;
      for (const n of ['armL', 'armR']) {
        const o = by.getObjectByName(n);
        if (o) o.rotation.z = (n === 'armL' ? -1 : 1) * (2.6 + Math.sin(t * 18) * 0.3);
      }
    } else
      for (const n of ['armL', 'armR']) {
        const o = by.getObjectByName(n);
        if (o) o.rotation.z = ghost ? (n === 'armL' ? -0.5 : 0.5) + Math.sin(t * 3 + (n === 'armL' ? 0 : 1.5)) * 0.25 : 0;
      }
    // 자리 빛 깜빡 · 힌트 화살표 통통
    for (const p of this.pads) {
      const g = p.getObjectByName('glow');
      if (g) g.scale.setScalar(1 + Math.sin(t * 3 + p.position.x) * 0.08);
    }
    const arrow = this.hintMarks.getObjectByName('arrow');
    if (arrow) arrow.position.y = 1.0 + Math.abs(Math.sin(t * 5)) * 0.18;
    // 반짝이
    for (let k = this.sparks.length - 1; k >= 0; k--) {
      const s = this.sparks[k]!;
      s.t += dt;
      const a = s.pts.geometry.attributes['position'] as THREE.BufferAttribute;
      for (let i = 0; i < a.count; i++) {
        s.vel[i * 3 + 1]! -= 7 * dt;
        a.setXYZ(i, a.getX(i) + s.vel[i * 3]! * dt, Math.max(0.05, a.getY(i) + s.vel[i * 3 + 1]! * dt), a.getZ(i) + s.vel[i * 3 + 2]! * dt);
      }
      a.needsUpdate = true;
      (s.pts.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - s.t / 0.9);
      if (s.t > 0.9) {
        this.scene.remove(s.pts);
        s.pts.geometry.dispose();
        (s.pts.material as THREE.Material).dispose();
        this.sparks.splice(k, 1);
      }
    }
    this.composer.render(dt);
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    for (const k of this.levelKeep) k.dispose();
    for (const k of this.keep) k.dispose();
    this.post.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

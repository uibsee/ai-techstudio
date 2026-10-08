import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { t as $t } from '@/i18n';
import { artUrl } from '@/services/artSlots';
import { isPhoneLandscape } from '../shared/fillFraming';
import type { Clue } from './logic';
import './ballfx.css';

/**
 * 숫자 야구 무대 — 애니메이션 같은 밤 경기 (2026-10-05 사용자: 「세 숫자를 화면 크게 세 개의 야구공으로 고르고,
 * 애니메이션처럼 야구공이 던져지는 효과 · 큰 결과 · 큰 전광판, 극적인 느낌으로」).
 *
 * 그림체: 툰 셰이딩(3단 명암) + 검은 외곽선(뒤집은 껍데기) + 애니 배경처럼 그린 밤 야구장(캔버스, 그림 자리 `numbaseball/background` 가 있으면 그것).
 * 화면: 위 큰 LED 전광판(돌아가는 전구 테) · 가운데 배팅 티 위 큰 야구공 = 부르는 수 칸 · 아래 숫자 공 선반.
 * 던지기: 공을 뒤로 당겼다(집중선) → 하나씩 전광판의 새 줄로 날아가 꽂힘(번쩍 · 흔들림) → S · B 불이 하나씩 → 큰 만화 글자.
 * 홈런이면 공이 전광판 너머로 · 폭죽 · 관중 플래시. 만화 글자 · 집중선은 DOM 층(ballfx.css).
 */

export interface FreeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
type Keep = { dispose(): void };
interface Ball {
  g: THREE.Group;
  mat: THREE.MeshToonMaterial;
  digit: string;
  home: THREE.Vector3;
  pos: THREE.Vector3;
  to: THREE.Vector3;
  from: THREE.Vector3;
  t: number;
  used: boolean;
  /** 던져져서 전광판에 꽂힌 공 — 다음에 선반으로 돌아올 때 폴짝 나타난다 */
  flown: boolean;
  pop: number;
  /** 「더 못 골라요」 흔들기 */
  wig: number;
}
interface Pending {
  g: string;
  s: number;
  b: number;
  litS: number;
  litB: number;
  done: boolean;
}
/** 스트라이크 필살 투구 — 애니메이션 필살 슛처럼 */
type Special = 'fire' | 'bolt' | 'ghost' | 'twist' | 'ult';
const SPECIAL_NAME: Record<Special, string> = {
  fire: '불꽃 강속구!',
  bolt: '번개 직구!',
  ghost: '도깨비 공!',
  twist: '회오리 볼!',
  ult: '필살! 무지개 유성구!',
};
const SPECIAL_COL: Record<Special, number> = { fire: 0xff7a1a, bolt: 0x8ad8ff, ghost: 0xb06aff, twist: 0x4af0e0, ult: 0xffffff };
interface Pitch {
  kind: 'S' | 'B' | 'X';
  sp: Special | null;
  cutAt: number;
  cut: boolean;
  mat: THREE.MeshToonMaterial;
  after: THREE.Mesh[];
  bolt: THREE.Line | null;
  /** S · B 불의 몇 번째 */
  q: number;
  t0: number;
  dur: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  ctrl: THREE.Vector3;
  m: THREE.Group;
  hit: boolean;
}
interface Throw {
  pitches: Pitch[];
  t: number;
  s: number;
  b: number;
  n: number;
  balls: Ball[];
  starts: THREE.Vector3[];
  targets: THREE.Vector3[];
  hit: boolean[];
  resultAt: number;
  end: number;
  shown: boolean;
}

/* 공 쪽(playGrp) 안 좌표 */
const BALL_R = 0.36;
const BIG = 3.5;
const RACK_Y = -2.6;
const RACK_Z = 2.0;
const RACK_GAP = 0.84;
const SLOT_Y = 0.75;
const SLOT_Z = 0.7;
const SLOT_GAP = 2.85;
/* 전광판(boardGrp) — 넓은 화면은 오른쪽, 좁은 화면은 위 */
const BOARD_Z = -3.4;
const BW = 9.6;
const BH = 7.49;
const INK = 0x10142e;

export class BallStage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 300);
  private readonly composer: EffectComposer;
  private readonly observer: ResizeObserver;
  private readonly keep: Keep[] = [];
  private levelKeep: Keep[] = [];
  private readonly level = new THREE.Group();
  private boardGrp = new THREE.Group();
  private playGrp = new THREE.Group();
  private wide = true;
  private free: FreeRect = { x: 0, y: 0, w: 1, h: 1 };
  private raf = 0;
  private last = performance.now();
  private readonly mats = new Map<string, THREE.Material>();
  private readonly geos = new Map<string, THREE.BufferGeometry>();
  private readonly ray = new THREE.Raycaster();
  private readonly grad: THREE.DataTexture;
  private readonly inkMat: THREE.MeshBasicMaterial;
  private bg: THREE.Texture | null = null;
  private balls: Ball[] = [];
  /** 선반 공 크기 배율 · 줄 수 (좁은 화면은 키워서 두 줄) */
  private rackS = 1;
  private rackRows = 1;
  private rackKey = '';
  private trays: THREE.Group[] = [];
  private trayW = 1;
  private dirt: THREE.Mesh | null = null;
  private slots: THREE.Mesh[] = [];
  private ghosts: { ring: THREE.Mesh; q: THREE.Sprite; tee: THREE.Group; glass: THREE.Object3D[] }[] = [];
  private bulbs: THREE.InstancedMesh | null = null;
  private readonly bulbCol = new THREE.Color();
  private beams: THREE.Mesh[] = [];
  private sparkles: THREE.Points | null = null;
  private board!: { c: HTMLCanvasElement; t: THREE.CanvasTexture };
  private boardArgs: { clues: Clue[]; n: number; reveal: string; maxRows: number; info: string } = { clues: [], n: 3, reveal: '', maxRows: 5, info: '' };
  private pending: Pending | null = null;
  private thr: Throw | null = null;
  private flashes: { s: THREE.Sprite; t: number; size: number; life: number }[] = [];
  private streaks: THREE.Mesh[] = [];
  private won = 0;
  private fireworks: { pts: THREE.Points; vel: Float32Array; t: number }[] = [];
  private homer: { m: THREE.Group; t: number; from: THREE.Vector3 } | null = null;
  private hintDigits: string[] = [];
  private readonly ballTex = new Map<string, THREE.CanvasTexture>();
  private shake = 0;
  private punch = 0;
  private camBase = new THREE.Vector3();
  private camDir = new THREE.Vector3(0, 0, 1);
  private camTarget = new THREE.Vector3();
  /* 연출 카메라 — 던진 공을 뒤에서 따라가 전광판에 꽂히는 순간을 크게, 다시 원래 구도로 */
  private cineW = 0;
  private cinePos = new THREE.Vector3();
  private cineLook = new THREE.Vector3();
  private flashTex: THREE.CanvasTexture;
  private streakTex: THREE.CanvasTexture;

  /* DOM 연출 층 — 집중선 · 번쩍 · 만화 글자 */
  private readonly fx: HTMLDivElement;
  private readonly speed: HTMLDivElement;
  private readonly flashEl: HTMLDivElement;
  private readonly comic: HTMLDivElement;

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.toneMapping = THREE.NoToneMapping;
    const canvas = this.renderer.domElement;
    Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%', touchAction: 'none' });
    host.appendChild(canvas);
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';

    // 툰 명암 3단
    // 웹툰 2단 명암 — 밝은 그림자 · 평평한 면 (시안처럼 맑고 경쾌하게)
    const gd = new Uint8Array([205, 255]);
    this.grad = this.own(new THREE.DataTexture(gd, 2, 1, THREE.RedFormat));
    this.grad.minFilter = this.grad.magFilter = THREE.NearestFilter;
    this.grad.needsUpdate = true;
    this.inkMat = this.own(new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }));

    // 조명은 π 로 나눠 적용된다 — 주변광 + 주조명 ≈ π 면 물체 색이 그대로 (웹툰처럼 맑게)
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.55));
    const key = new THREE.DirectionalLight(0xfff8ec, 1.55);
    key.position.set(-5, 9, 10);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9ac4ff, 0.35);
    rim.position.set(6, 5, -8);
    this.scene.add(rim);
    this.scene.add(this.camera);

    this.flashTex = this.own(this.radialTex(['rgba(255,255,255,1)', 'rgba(255,240,170,0.85)', 'rgba(255,200,80,0)'], true));
    this.streakTex = this.own(this.streakTexture());

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(512, 512), 0.4, 0.4, 0.94));
    this.composer.addPass(new OutputPass());
    this.scene.add(this.level);

    this.fx = document.createElement('div');
    this.fx.className = 'nb-fx';
    this.fx.innerHTML = '<div class="nb-speed"></div><div class="nb-flash"></div><div class="nb-comic"></div>';
    host.appendChild(this.fx);
    this.speed = this.fx.querySelector('.nb-speed')!;
    this.flashEl = this.fx.querySelector('.nb-flash')!;
    this.comic = this.fx.querySelector('.nb-comic')!;

    this.paintBackground();
    this.buildCrowd();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    this.raf = requestAnimationFrame(this.loop);
  }

  private own<T extends Keep>(t: T): T {
    this.keep.push(t);
    return t;
  }
  private toon(color: number, opts: THREE.MeshToonMaterialParameters = {}): THREE.MeshToonMaterial {
    const k = color + JSON.stringify(opts);
    let m = this.mats.get(k) as THREE.MeshToonMaterial | undefined;
    if (!m) {
      m = this.own(new THREE.MeshToonMaterial({ color, gradientMap: this.grad, ...opts }));
      this.mats.set(k, m);
    }
    return m;
  }
  private geo(k: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let g = this.geos.get(k);
    if (!g) {
      g = this.own(make());
      this.geos.set(k, g);
    }
    return g;
  }
  private m(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material | number, x = 0, y = 0, z = 0): THREE.Mesh {
    const o = new THREE.Mesh(geo, typeof mat === 'number' ? this.toon(mat) : mat);
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  }
  /** 검은 외곽선 — 뒷면만 그린 조금 큰 껍데기 (만화 선) */
  private ink(mesh: THREE.Mesh, t = 0.05): THREE.Mesh {
    mesh.geometry.computeBoundingBox();
    const s = new THREE.Vector3();
    mesh.geometry.boundingBox!.getSize(s);
    const hull = new THREE.Mesh(mesh.geometry, this.inkMat);
    hull.scale.set(s.x > 0.001 ? 1 + (2 * t) / s.x : 1, s.y > 0.001 ? 1 + (2 * t) / s.y : 1, s.z > 0.001 ? 1 + (2 * t) / s.z : 1);
    hull.raycast = () => {};
    mesh.add(hull);
    return mesh;
  }

  private radialTex(stops: string[], spikes = false): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    stops.forEach((s, i) => gr.addColorStop(i / (stops.length - 1), s));
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    if (spikes) {
      // 애니 번쩍 — 가는 빛살
      g.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2 + (k % 2) * 0.1;
        const len = k % 2 ? 90 : 126;
        g.fillStyle = 'rgba(255,250,220,0.55)';
        g.beginPath();
        g.moveTo(128 + Math.cos(a + 0.05) * 14, 128 + Math.sin(a + 0.05) * 14);
        g.lineTo(128 + Math.cos(a) * len, 128 + Math.sin(a) * len);
        g.lineTo(128 + Math.cos(a - 0.05) * 14, 128 + Math.sin(a - 0.05) * 14);
        g.fill();
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  private streakTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 256;
    const g = c.getContext('2d')!;
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(1, 'rgba(255,245,200,0.9)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(16, 0);
    g.lineTo(30, 256);
    g.lineTo(2, 256);
    g.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /** 공 앞 큰 숫자 (남색 · 흰 테) */
  private numTexture(d: string): THREE.CanvasTexture {
    const k = 'n' + d;
    let t = this.ballTex.get(k);
    if (t) return t;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.font = '400 210px "Black Han Sans", "Dela Gothic One", system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 26;
    g.strokeStyle = '#eeeeee';
    g.strokeText(d, 128, 140);
    g.fillStyle = '#16245e';
    g.fillText(d, 128, 140);
    t = this.own(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    this.ballTex.set(k, t);
    return t;
  }

  /** 야구공 무늬 — 흰 가죽 · 빨간 실밥 두 줄 (숫자마다 실밥 위치를 조금 돌려 똑같아 보이지 않게) */
  private ballTexture(d: string): THREE.CanvasTexture {
    let t = this.ballTex.get(d);
    if (t) return t;
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fffdf6';
    g.fillRect(0, 0, 512, 256);
    g.strokeStyle = '#e0383a';
    g.lineWidth = 6;
    for (const off of [0, 256]) {
      for (const side of [-1, 1]) {
        g.beginPath();
        for (let x = 0; x <= 256; x += 4) {
          const y = 128 + side * (70 + Math.cos((x / 256) * Math.PI * 2) * 34);
          if (x) g.lineTo(off + x, y);
          else g.moveTo(off + x, y);
        }
        g.stroke();
        for (let x = 6; x < 256; x += 14) {
          const y = 128 + side * (70 + Math.cos((x / 256) * Math.PI * 2) * 34);
          g.beginPath();
          g.moveTo(off + x - 5, y - 8);
          g.lineTo(off + x + 5, y + 8);
          g.stroke();
        }
      }
    }
    // 숫자는 공 앞 글자(numTexture)로 — 무늬에 찍으면 옆면에 얼룩처럼 보인다
    t = this.own(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    this.ballTex.set(d, t);
    return t;
  }

  /* ───────────── 배경 — 애니 배경 같은 밤 야구장 ───────────── */

  private paintBackground(): void {
    const url = artUrl('numbaseball', 'background');
    if (url) {
      const tex = this.own(
        new THREE.TextureLoader().load(url, (tx) => {
          this.bgAspect = (tx.image as HTMLImageElement).width / (tx.image as HTMLImageElement).height;
          this.coverBg();
        }),
      );
      tex.colorSpace = THREE.SRGBColorSpace;
      this.bg = tex;
      this.scene.background = tex;
      return;
    }
    const W = 2048;
    const H = 1024;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d')!;
    let sd = 7;
    const r = (): number => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    const HZ = 640;
    // 하늘 — 남색에서 보랏빛 지평선
    const sky = g.createLinearGradient(0, 0, 0, HZ);
    sky.addColorStop(0, '#163288');
    sky.addColorStop(0.45, '#2f5ad0');
    sky.addColorStop(0.78, '#5a48c0');
    sky.addColorStop(1, '#b07ad0');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, HZ + 10);
    for (let k = 0; k < 520; k++) {
      g.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.7})`;
      const s = r() < 0.06 ? 3 : 1.6;
      g.fillRect(r() * W, r() * HZ * 0.7, s, s);
    }
    // 반짝 별 몇 개 (십자)
    for (let k = 0; k < 14; k++) {
      const x = r() * W;
      const y = r() * HZ * 0.55;
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.fillRect(x - 7, y - 0.8, 14, 1.6);
      g.fillRect(x - 0.8, y - 7, 1.6, 14);
    }
    // 위 관중석 — 짙은 그림자 + 계단 줄 + 관중 점
    g.fillStyle = '#283478';
    g.beginPath();
    g.moveTo(0, 380);
    g.quadraticCurveTo(W / 2, 470, W, 380);
    g.lineTo(W, HZ + 6);
    g.lineTo(0, HZ + 6);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(80,100,170,0.35)';
    g.lineWidth = 2;
    for (let k = 1; k < 7; k++) {
      const y = 380 + k * 38;
      g.beginPath();
      g.moveTo(0, y);
      g.quadraticCurveTo(W / 2, y + 90 - k * 10, W, y);
      g.stroke();
    }
    const fanCols = ['#e8453c', '#3a7ae0', '#ffd23a', '#f4f4f4', '#5ab84a', '#f08ab8', '#ff8a3a', '#8a6ae8'];
    for (let k = 0; k < 2600; k++) {
      const x = r() * W;
      const top = 392 + (1 - Math.pow((x - W / 2) / (W / 2), 2)) * 82;
      const y = top + r() * (HZ - top - 4);
      g.globalAlpha = 0.25 + r() * 0.3;
      g.fillStyle = fanCols[Math.floor(r() * fanCols.length)]!;
      g.beginPath();
      g.arc(x, y, 2.2 + r() * 1.6, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    // 조명탑 — 기둥 · 빛나는 등판 · 큰 빛무리 · 빛살
    const towers = [170, 560, 1488, 1878];
    for (const [i, x] of towers.entries()) {
      const top = i === 0 || i === 3 ? 150 : 205;
      g.fillStyle = '#0c1028';
      g.fillRect(x - 7, top + 40, 14, HZ - top);
      g.globalCompositeOperation = 'lighter';
      const halo = g.createRadialGradient(x, top, 10, x, top, 330);
      halo.addColorStop(0, 'rgba(255,248,215,0.95)');
      halo.addColorStop(0.18, 'rgba(255,236,180,0.45)');
      halo.addColorStop(0.5, 'rgba(160,140,255,0.12)');
      halo.addColorStop(1, 'rgba(120,100,255,0)');
      g.fillStyle = halo;
      g.fillRect(x - 340, top - 340, 680, 680);
      // 애니 빛살 — 단단한 가장자리 삼각형
      for (let k = 0; k < 9; k++) {
        const a = Math.PI / 2 + (k - 4) * 0.2 + (i < 2 ? 0.35 : -0.35);
        g.fillStyle = `rgba(255,245,210,${k % 2 ? 0.05 : 0.08})`;
        g.beginPath();
        g.moveTo(x, top);
        g.lineTo(x + Math.cos(a - 0.035) * 1200, top + Math.sin(a - 0.035) * 1200);
        g.lineTo(x + Math.cos(a + 0.035) * 1200, top + Math.sin(a + 0.035) * 1200);
        g.fill();
      }
      // 겹 빛고리 (애니 렌즈 느낌)
      for (const [rr, al] of [
        [60, 0.25],
        [110, 0.1],
      ] as const) {
        g.strokeStyle = `rgba(255,240,200,${al})`;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(x, top, rr, 0, Math.PI * 2);
        g.stroke();
      }
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#1a2040';
      g.fillRect(x - 64, top - 34, 128, 68);
      for (let a = 0; a < 3; a++)
        for (let b = 0; b < 5; b++) {
          g.fillStyle = '#fffbe8';
          g.beginPath();
          g.arc(x - 48 + b * 24, top - 20 + a * 20, 8, 0, Math.PI * 2);
          g.fill();
        }
    }
    // 외야 펜스 — 짙은 초록 벽 · 노란 띠 · 광고 칸
    g.fillStyle = '#0d3f2c';
    g.fillRect(0, HZ, W, 66);
    const ads = ['#2a6ad8', '#e8453c', '#2f9a5a', '#f0a020', '#8a4ad8', '#20a0b0'];
    for (let k = 0; k < 16; k++) {
      g.fillStyle = ads[k % ads.length]!;
      g.fillRect(k * 128 + 6, HZ + 12, 116, 42);
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.font = '900 30px system-ui,sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(['★', '⚾', '♥', '◆', '♪', '●'][k % 6]!, k * 128 + 64, HZ + 34);
    }
    g.fillStyle = '#ffd23a';
    g.fillRect(0, HZ, W, 6);
    // 잔디 — 원근 줄무늬 · 가운데 밝게
    const GY = HZ + 66;
    let y = GY;
    let k = 0;
    while (y < H) {
      const h = 14 + k * 9;
      g.fillStyle = k % 2 ? '#2f8f3c' : '#3aa448';
      g.fillRect(0, y, W, h);
      y += h;
      k++;
    }
    const lit = g.createRadialGradient(W / 2, H, 50, W / 2, H, 900);
    lit.addColorStop(0, 'rgba(220,255,200,0.35)');
    lit.addColorStop(1, 'rgba(220,255,200,0)');
    g.fillStyle = lit;
    g.fillRect(0, GY, W, H - GY);
    // 흰 파울선 두 줄
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 7;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(W / 2 + s * 120, H);
      g.lineTo(W / 2 + s * 1100, GY);
      g.stroke();
    }
    // 가장자리 어둡게
    const vg = g.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, W * 0.62);
    vg.addColorStop(0, 'rgba(0,0,20,0)');
    vg.addColorStop(1, 'rgba(0,0,20,0.55)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
    const tex = this.own(new THREE.CanvasTexture(c));
    tex.colorSpace = THREE.SRGBColorSpace;
    this.bg = tex;
    this.bgAspect = W / H;
    this.scene.background = tex;
  }
  private bgAspect = 2;
  /** 배경을 화면 비율에 맞춰 잘라 채운다 (늘어나지 않게) */
  private coverBg(): void {
    if (!this.bg) return;
    const A = this.host.clientWidth / Math.max(1, this.host.clientHeight);
    const I = this.bgAspect;
    if (A > I) {
      this.bg.repeat.set(1, I / A);
      this.bg.offset.set(0, (1 - I / A) * 0.35);
    } else {
      this.bg.repeat.set(A / I, 1);
      this.bg.offset.set((1 - A / I) / 2, 0);
    }
  }

  /* ───────────── 관중석 — 툰 셰이딩 3D 관중 ───────────── */

  private fans: {
    body: THREE.InstancedMesh;
    head: THREE.InstancedMesh;
    hat: THREE.InstancedMesh;
    armL: THREE.InstancedMesh;
    armR: THREE.InstancedMesh;
    hulls: THREE.InstancedMesh[];
    seats: { x: number; y: number; z: number; ph: number; sc: number; hat: boolean; face: number; fi: number; prop: number }[];
    /** 표정마다 얼굴판 (웃음 · 환호 · 윙크 · 놀람) */
    faces: THREE.InstancedMesh[];
    /** 응원 깃발 — 막대 · 천 (든 사람만) */
    stick: THREE.InstancedMesh;
    flag: THREE.InstancedMesh;
  } | null = null;
  private readonly dummy = new THREE.Object3D();

  /** 전광판 뒤 계단식 관중석 · 외야 담장 · 잔디 바닥. 관중은 몸 · 머리 · 모자 · 두 팔(인스턴스) + 검은 외곽선 */
  private buildCrowd(): void {
    const root = new THREE.Group();
    this.scene.add(root);
    let sd = 11;
    const r = (): number => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    const GROUND = -3.35;
    // 잔디 바닥 — 깎은 줄무늬
    const gc = document.createElement('canvas');
    gc.width = 64;
    gc.height = 512;
    const gg = gc.getContext('2d')!;
    for (let k = 0; k < 8; k++) {
      gg.fillStyle = k % 2 ? '#2a9a3a' : '#38b048';
      gg.fillRect(0, k * 64, 64, 64);
    }
    const gt = this.own(new THREE.CanvasTexture(gc));
    gt.colorSpace = THREE.SRGBColorSpace;
    gt.wrapS = gt.wrapT = THREE.RepeatWrapping;
    gt.repeat.set(1, 6);
    const ground = new THREE.Mesh(this.own(new THREE.PlaneGeometry(180, 70)), this.toon(0xffffff, { map: gt }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, GROUND, -12);
    root.add(ground);
    // 외야 담장 — 짙은 초록 벽 · 노란 띠 · 광고 칸
    const WZ = -30;
    const wc = document.createElement('canvas');
    wc.width = 2048;
    wc.height = 128;
    const wg = wc.getContext('2d')!;
    wg.fillStyle = '#126a40';
    wg.fillRect(0, 0, 2048, 128);
    const ads = ['#2a6ad8', '#e8453c', '#2f9a5a', '#f0a020', '#8a4ad8', '#20a0b0'];
    for (let k = 0; k < 16; k++) {
      wg.fillStyle = ads[k % ads.length]!;
      wg.fillRect(k * 128 + 8, 26, 112, 78);
      wg.fillStyle = 'rgba(255,255,255,0.92)';
      wg.font = '900 52px system-ui,sans-serif';
      wg.textAlign = 'center';
      wg.textBaseline = 'middle';
      wg.fillText(['★', '⚾', '♥', '◆', '♪', '●'][k % 6]!, k * 128 + 64, 68);
    }
    wg.fillStyle = '#ffd23a';
    wg.fillRect(0, 0, 2048, 12);
    const wt = this.own(new THREE.CanvasTexture(wc));
    wt.colorSpace = THREE.SRGBColorSpace;
    const wall = this.ink(new THREE.Mesh(this.own(new THREE.BoxGeometry(160, 2.2, 0.5)), this.toon(0xffffff, { map: wt })), 0.06);
    wt.wrapS = THREE.RepeatWrapping;
    wt.repeat.set(2, 1);
    wall.position.set(0, GROUND + 1.1, WZ);
    root.add(wall);
    // 계단식 관중석 — 줄마다 한 단씩 높고 멀다
    // 관중을 크게 · 성기게 — 얼굴 표정과 동작이 보이게 (시안의 앞줄 관중 크기)
    const ROWS = 8;
    const RH = 1.3;
    const RD = 1.65;
    const rowY = (k: number): number => GROUND + 2.2 + k * RH;
    const rowZ = (k: number): number => WZ - 1.0 - k * RD;
    for (let k = 0; k < ROWS; k++) {
      const step = new THREE.Mesh(this.own(new THREE.BoxGeometry(170, RH, RD)), this.toon(k % 2 ? 0x2f4cb8 : 0x3a5ad0));
      step.position.set(0, rowY(k) - RH / 2, rowZ(k));
      root.add(step);
    }
    // 뒤 벽 (관중석 끝)
    const back = new THREE.Mesh(this.own(new THREE.BoxGeometry(170, 3, 0.4)), this.toon(0x24306e));
    back.position.set(0, rowY(ROWS) + 1.0, rowZ(ROWS) - 0.3);
    root.add(back);
    // 관중 자리
    const seats: { x: number; y: number; z: number; ph: number; sc: number; hat: boolean; face: number; fi: number; prop: number }[] = [];
    for (let k = 0; k < ROWS; k++)
      for (let x = -62; x <= 62; x += 1.55 + r() * 0.35) {
        if (r() < 0.06) continue;
        seats.push({ x: x + (r() - 0.5) * 0.2, y: rowY(k), z: rowZ(k) + 0.15, ph: r() * Math.PI * 2, sc: 1.45 + r() * 0.3, hat: r() < 0.45, face: Math.floor(r() * 4), fi: 0, prop: r() < 0.13 ? 0 : -1 });
      }
    const N = seats.length;
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material): THREE.InstancedMesh => {
      const m = new THREE.InstancedMesh(this.own(geo), mat, N);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      root.add(m);
      return m;
    };
    const white = this.toon(0xffffff);
    const body = mk(new THREE.CapsuleGeometry(0.27, 0.28, 4, 10), white);
    const head = mk(new THREE.SphereGeometry(0.23, 14, 10), white);
    const hat = mk(new THREE.SphereGeometry(0.245, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), white);
    const armL = mk(new THREE.CapsuleGeometry(0.065, 0.32, 3, 6).translate(0, 0.2, 0), white);
    const armR = mk(new THREE.CapsuleGeometry(0.065, 0.32, 3, 6).translate(0, 0.2, 0), white);
    // 외곽선 껍데기 — 몸 · 머리만
    const hulls = [mk(new THREE.CapsuleGeometry(0.3, 0.28, 4, 10), this.inkMat), mk(new THREE.SphereGeometry(0.26, 12, 8), this.inkMat)];
    const shirts = [0xff3a30, 0x2f7bff, 0xffd21a, 0xf8f8f8, 0x2fcf4a, 0xff6ab0, 0xff8a1a, 0x8a5aff, 0x10c8d8];
    const skins = [0xffdcc0, 0xf2c49a, 0xd89a6a, 0xa86a42, 0xffe8d6];
    const hats = [0xd83a3a, 0x2a4ad8, 0xffd23a, 0x1a1a2a, 0xf4f4f4, 0x3aa84a];
    const hairs = [0x2a1a12, 0x4a2a18, 0x1a1a1a, 0x8a5a2a, 0xd8a85a];
    const c = new THREE.Color();
    seats.forEach((st, i) => {
      const sh = shirts[Math.floor(r() * shirts.length)]!;
      body.setColorAt(i, c.setHex(sh));
      armL.setColorAt(i, c.setHex(sh));
      armR.setColorAt(i, c.setHex(sh));
      head.setColorAt(i, c.setHex(skins[Math.floor(r() * skins.length)]!));
      hat.setColorAt(i, c.setHex(st.hat ? hats[Math.floor(r() * hats.length)]! : hairs[Math.floor(r() * hairs.length)]!));
    });
    // 얼굴 — 표정 4가지 (눈 · 볼 · 입만 그린 투명 판을 머리 앞에). 표정마다 InstancedMesh 하나
    const faceTex = (kind: number): THREE.CanvasTexture => {
      const c2 = document.createElement('canvas');
      c2.width = c2.height = 64;
      const g = c2.getContext('2d')!;
      g.fillStyle = 'rgba(255,120,120,0.45)';
      g.beginPath();
      g.ellipse(16, 38, 6, 4, 0, 0, Math.PI * 2);
      g.ellipse(48, 38, 6, 4, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1a1420';
      g.strokeStyle = '#1a1420';
      g.lineWidth = 3.4;
      g.lineCap = 'round';
      const eye = (x: number): void => {
        g.beginPath();
        g.ellipse(x, 28, 3.2, 4.4, 0, 0, Math.PI * 2);
        g.fill();
      };
      const arc = (x: number): void => {
        g.beginPath();
        g.arc(x, 30, 4.5, Math.PI * 1.1, Math.PI * 1.9);
        g.stroke();
      };
      if (kind === 0) {
        // 웃음 — 눈웃음 · 활짝
        arc(22);
        arc(42);
        g.beginPath();
        g.arc(32, 40, 8, 0.15 * Math.PI, 0.85 * Math.PI);
        g.stroke();
      } else if (kind === 1) {
        // 환호 — 동그란 눈 · 크게 벌린 입
        eye(22);
        eye(42);
        g.fillStyle = '#7a1f2a';
        g.beginPath();
        g.ellipse(32, 44, 7, 6, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#ff8a8a';
        g.beginPath();
        g.ellipse(32, 47, 4, 2.4, 0, 0, Math.PI * 2);
        g.fill();
      } else if (kind === 2) {
        // 윙크
        arc(22);
        eye(42);
        g.beginPath();
        g.arc(32, 40, 7, 0.2 * Math.PI, 0.8 * Math.PI);
        g.stroke();
      } else {
        // 놀람 — 큰 눈 · 동그란 입
        eye(22);
        eye(42);
        g.fillStyle = '#7a1f2a';
        g.beginPath();
        g.arc(32, 45, 4.5, 0, Math.PI * 2);
        g.fill();
      }
      const t2 = this.own(new THREE.CanvasTexture(c2));
      t2.colorSpace = THREE.SRGBColorSpace;
      return t2;
    };
    const faceCount = [0, 0, 0, 0];
    for (const st of seats) st.fi = faceCount[st.face]!++;
    const faceGeo = this.own(new THREE.PlaneGeometry(0.4, 0.4));
    const faces = [0, 1, 2, 3].map((k) => {
      const m = new THREE.InstancedMesh(faceGeo, this.own(new THREE.MeshBasicMaterial({ map: faceTex(k), transparent: true, alphaTest: 0.35, depthWrite: false })), Math.max(1, faceCount[k]!));
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.renderOrder = 1;
      root.add(m);
      return m;
    });
    // 응원 깃발 — 든 사람만 (막대 · 천)
    let np = 0;
    for (const st of seats) if (st.prop === 0) st.prop = np++;
    const mkP = (geo: THREE.BufferGeometry, mat: THREE.Material): THREE.InstancedMesh => {
      const m = new THREE.InstancedMesh(this.own(geo), mat, Math.max(1, np));
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      root.add(m);
      return m;
    };
    const stick = mkP(new THREE.BoxGeometry(0.04, 0.62, 0.04).translate(0, 0.31, 0), this.toon(0x3a2a1a));
    const flag = mkP(new THREE.PlaneGeometry(0.46, 0.3).translate(0.23, 0.46, 0), this.toon(0xffffff, { side: THREE.DoubleSide }));
    const flagCols = [0xff3a30, 0x2f7bff, 0xffd21a, 0x2fcf4a, 0xff6ab0, 0xffffff];
    for (let i = 0; i < np; i++) flag.setColorAt(i, c.setHex(flagCols[i % flagCols.length]!));
    // 응원 현수막 — 관중석 앞 (글씨는 번역되게 코드로)
    const banner = (text: string, col: string, x: number, k: number, rz: number): void => {
      const c3 = document.createElement('canvas');
      c3.width = 512;
      c3.height = 160;
      const g = c3.getContext('2d')!;
      g.fillStyle = col;
      g.fillRect(0, 0, 512, 160);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(0, 0, 512, 22);
      g.strokeStyle = 'rgba(0,0,0,0.25)';
      g.lineWidth = 8;
      g.strokeRect(4, 4, 504, 152);
      g.font = '900 96px "Black Han Sans", system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.lineWidth = 14;
      g.strokeStyle = '#1a1030';
      g.strokeText(text, 256, 86, 470);
      g.fillStyle = '#ffffff';
      g.fillText(text, 256, 86, 470);
      const t3 = this.own(new THREE.CanvasTexture(c3));
      t3.colorSpace = THREE.SRGBColorSpace;
      const m = this.ink(new THREE.Mesh(this.own(new THREE.PlaneGeometry(5.6, 1.75)), this.toon(0xffffff, { map: t3 })), 0.06);
      m.position.set(x, rowY(k) + 1.4, rowZ(k) + 1.1);
      m.rotation.z = rz;
      root.add(m);
    };
    banner($t('홈런!'), '#e8303a', -16, 2, 0.08);
    banner($t('파이팅!'), '#2f63d8', -5, 4, -0.06);
    banner($t('홈런!'), '#2fa84a', 17, 3, -0.07);
    banner($t('파이팅!'), '#ff8a1a', 27, 5, 0.06);
    // 멀리 있는 밤 관중 — 아주 조금만 낮춘다 (시안처럼 화사하게, 공 · 전광판은 외곽선으로 앞에 선다)
    for (const m of [body, head, hat, armL, armR]) {
      const ic = m.instanceColor;
      if (!ic) continue;
      for (let i = 0; i < ic.count; i++) ic.setXYZ(i, ic.getX(i), ic.getY(i), ic.getZ(i));
      ic.needsUpdate = true;
    }
    // 안개 막 — 담장 앞에 한 겹: 먼 것 전체를 어둡고 흐릿하게
    const haze = new THREE.Mesh(this.own(new THREE.PlaneGeometry(260, 80)), this.own(new THREE.MeshBasicMaterial({ color: 0x1a2a6a, transparent: true, opacity: 0.16, depthWrite: false })));
    haze.position.set(0, GROUND + 38, WZ + 2.5);
    haze.renderOrder = 1;
    root.add(haze);
    // 관중석 전구 줄 — 몇 단마다 앞 가장자리에 작은 따뜻한 전구 (시안의 반짝이는 관중석)
    {
      const pts: number[] = [];
      for (const k of [1, 3, 5, 7])
        for (let x = -60; x <= 60; x += 3.2 + r() * 2.4) pts.push(x, rowY(k) + 2.3 + (r() - 0.5) * 0.3, rowZ(k) - 0.35);
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const lights = new THREE.Points(this.own(lg), this.own(new THREE.PointsMaterial({ map: this.flashTex, color: 0xffe2a0, size: 1.5, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
      root.add(lights);
    }
    // 조명탑 — 관중석 뒤 양쪽 위: 기둥 · 전구판(빛 번짐이 걸리는 흰 전구) · 큰 빛무리 (시안의 눈부신 조명)
    const TY = rowY(ROWS) + 4.0;
    const TZ = rowZ(ROWS) - 1.2;
    const bulbMat = this.own(new THREE.MeshBasicMaterial({ color: 0xfffbe8, toneMapped: false }));
    const bulbGeo = this.own(new THREE.SphereGeometry(0.34, 12, 8));
    for (const sx of [-1, 1]) {
      const tw = new THREE.Group();
      tw.position.set(sx * 23, TY, TZ);
      tw.rotation.z = sx * 0.12;
      root.add(tw);
      const pole = new THREE.Mesh(this.own(new THREE.BoxGeometry(0.5, 9, 0.5)), this.toon(0x1c2450));
      pole.position.y = -5.5;
      tw.add(pole);
      const panel = new THREE.Mesh(this.own(new THREE.BoxGeometry(6.4, 3.2, 0.4)), this.toon(0x1a2040));
      tw.add(panel);
      for (let a = 0; a < 3; a++)
        for (let b = 0; b < 6; b++) {
          const bulb = new THREE.Mesh(bulbGeo, bulbMat);
          bulb.position.set(-2.6 + b * 1.04, 1.0 - a * 1.0, 0.25);
          tw.add(bulb);
        }
      const halo = new THREE.Sprite(this.own(new THREE.SpriteMaterial({ map: this.flashTex, color: 0xfff0c8, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })));
      halo.scale.setScalar(26);
      halo.position.z = 0.6;
      tw.add(halo);
    }
    this.fans = { body, head, hat, armL, armR, hulls, seats, faces, stick, flag };
    this.animCrowd(0, 0);
  }

  /** 관중 움직임 — 평소 들썩, 던질 때 들뜸, 홈런이면 팔 들고 파도타기 */
  private animCrowd(t: number, hype: number): void {
    const f = this.fans;
    if (!f) return;
    const d = this.dummy;
    f.seats.forEach((st, i) => {
      const wave = hype > 0.8 ? Math.max(0, Math.sin(t * 5 - st.x * 0.35)) : 0;
      const jump = Math.abs(Math.sin(t * (3 + hype * 6) + st.ph)) * (0.03 + hype * 0.12) + wave * 0.45;
      const y = st.y + jump;
      const sc = st.sc;
      const set = (m: THREE.InstancedMesh, x: number, yy: number, rz = 0, sy = 1): void => {
        d.position.set(st.x + x * sc, yy, st.z);
        d.rotation.set(0, 0, rz);
        d.scale.set(sc, sc * sy, sc);
        d.updateMatrix();
        m.setMatrixAt(i, d.matrix);
      };
      set(f.body, 0, y + 0.42 * sc);
      set(f.head, 0, y + 0.95 * sc);
      set(f.hat, 0, y + 1.0 * sc, 0, st.hat ? 0.75 : 0.62);
      set(f.hulls[0]!, 0, y + 0.42 * sc);
      set(f.hulls[1]!, 0, y + 0.95 * sc);
      // 얼굴판 — 머리 앞
      d.position.set(st.x, y + 0.95 * sc, st.z + 0.32 * sc);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(sc);
      d.updateMatrix();
      f.faces[st.face]!.setMatrixAt(st.fi, d.matrix);
      // 팔 — 평소 내림, 들뜨면 흔들, 홈런이면 번쩍
      const up = Math.min(1, hype * 0.7 + wave);
      const swing = Math.sin(t * 9 + st.ph) * 0.35 * hype;
      set(f.armL, -0.27, y + 0.55 * sc, 0.35 + up * 2.4 + swing);
      // 깃발 든 사람 — 오른팔을 들고 깃발을 흔든다
      const rz = st.prop >= 0 ? -2.55 - Math.sin(t * 4 + st.ph) * 0.35 - up * 0.2 : -0.35 - up * 2.4 - swing;
      set(f.armR, 0.27, y + 0.55 * sc, rz);
      if (st.prop >= 0) {
        // 손 끝 = 어깨 + 팔 길이(0.42)를 rz 만큼 돌린 곳
        d.position.set(st.x + (0.27 - Math.sin(rz) * 0.42) * sc, y + (0.55 + Math.cos(rz) * 0.42) * sc, st.z + 0.05);
        d.rotation.set(0, 0, rz + Math.PI + Math.sin(t * 6 + st.ph) * 0.25);
        d.scale.setScalar(sc);
        d.updateMatrix();
        f.stick.setMatrixAt(st.prop, d.matrix);
        f.flag.setMatrixAt(st.prop, d.matrix);
      }
    });
    for (const m of [f.body, f.head, f.hat, f.armL, f.armR, ...f.hulls, ...f.faces, f.stick, f.flag]) m.instanceMatrix.needsUpdate = true;
  }

  /* ───────────── 판 ───────────── */

  setGame(n: number, lo: number, hi: number): void {
    for (const o of [...this.level.children]) this.level.remove(o);
    for (const k of this.levelKeep) k.dispose();
    this.levelKeep = [];
    this.balls = [];
    this.slots = [];
    this.ghosts = [];
    this.bulbs = null;
    this.beams = [];
    this.won = 0;
    this.homer = null;
    this.thr = null;
    this.pending = null;
    this.hideComic();
    const lk = <T extends Keep>(x: T): T => {
      this.levelKeep.push(x);
      return x;
    };
    this.boardGrp = new THREE.Group();
    this.playGrp = new THREE.Group();
    this.level.add(this.boardGrp, this.playGrp);
    this.buildBoard(lk);
    this.buildField(lk, n);
    // 숫자 공 선반 — 나무 쟁반 · 공마다 둥근 홈
    const digits = Array.from({ length: hi - lo + 1 }, (_, i) => String(lo + i));
    const gap = RACK_GAP;
    const w = digits.length * gap + 0.5;
    // 선반은 줄마다 하나 — 좁은 화면(폰)은 공을 키워 두 줄로 놓는다 (layoutRack)
    const trayG = new THREE.Group();
    trayG.position.set(0, RACK_Y, RACK_Z);
    this.ink(this.m(trayG, lk(new RoundedBoxGeometry(w, 0.3, 1.0, 3, 0.12)), 0xd08a48, 0, -0.48, 0), 0.04);
    this.ink(this.m(trayG, lk(new RoundedBoxGeometry(w + 0.16, 0.14, 0.2, 2, 0.06)), 0x9a5a2a, 0, -0.3, 0.48), 0.035);
    const trayG2 = trayG.clone(true);
    trayG2.visible = false;
    this.playGrp.add(trayG, trayG2);
    this.trays = [trayG, trayG2];
    this.trayW = w;
    this.rackKey = '';
    // 공보다 조금 큰 보이지 않는 누름 구 — 공 사이 틈 없이 눌린다
    const hitMat = lk(new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    digits.forEach((d, i) => {
      const g = new THREE.Group();
      const mat = lk(new THREE.MeshToonMaterial({ map: this.ballTexture(d), gradientMap: this.grad }));
      const b = this.ink(this.m(g, this.geo('bball', () => new THREE.SphereGeometry(BALL_R, 40, 24)), mat), 0.022);
      b.rotation.y = -Math.PI / 2;
      b.userData['digit'] = d;
      g.userData['digit'] = d;
      const num = new THREE.Sprite(lk(new THREE.SpriteMaterial({ map: this.numTexture(d), transparent: true, depthWrite: false, depthTest: false })));
      num.scale.setScalar(BALL_R * 1.4);
      num.position.set(0, 0, BALL_R * 0.6);
      num.renderOrder = 3;
      num.userData['digit'] = d;
      g.add(num);
      const hit = new THREE.Mesh(this.geo('ballHit', () => new THREE.SphereGeometry(RACK_GAP / 2, 12, 8)), hitMat);
      hit.userData['digit'] = d;
      g.add(hit);
      const home = new THREE.Vector3((i - (digits.length - 1) / 2) * gap, RACK_Y, RACK_Z);
      g.position.copy(home);
      this.playGrp.add(g);
      this.balls.push({ g, mat, digit: d, home, pos: home.clone(), to: home.clone(), from: home.clone(), t: 1, used: false, flown: false, pop: 1, wig: 0 });
    });
    this.drawBoard([], n, '', 5, '');
    this.fit();
  }

  /** 큰 LED 전광판 — 두꺼운 남색 틀 · 빨간 머리띠와 별 · 둘레 전구 · 기둥 · 서치라이트 */
  private buildBoard(lk: <T extends Keep>(x: T) => T): void {
    const grp = this.boardGrp;
    // 기둥 — 공 뒤로 숨는다
    for (const sx of [-1, 1]) this.ink(this.m(grp, this.geo('post', () => new THREE.BoxGeometry(0.55, 6, 0.5)), 0x2a3466, sx * (BW / 2 - 1.3), -BH / 2 - 3, -0.3), 0.04);
    this.ink(this.m(grp, lk(new RoundedBoxGeometry(BW + 1.0, BH + 1.0, 0.55, 3, 0.2)), 0x223080, 0, 0, -0.3), 0.07);
    this.m(grp, lk(new RoundedBoxGeometry(BW + 0.3, BH + 0.3, 0.2, 2, 0.08)), 0x05070f, 0, 0, -0.05);
    // 머리띠 — 빨간 띠 · 노란 테 · 별 셋
    this.ink(this.m(grp, lk(new RoundedBoxGeometry(BW * 0.62, 0.95, 0.7, 3, 0.25)), 0xe0393e, 0, BH / 2 + 0.75, -0.2), 0.06);
    this.m(grp, lk(new RoundedBoxGeometry(BW * 0.62 - 0.3, 0.12, 0.72, 1, 0.05)), 0xffd23a, 0, BH / 2 + 0.98, -0.2);
    const star = new THREE.Shape();
    for (let k = 0; k < 10; k++) {
      const a = Math.PI / 2 + (k * Math.PI) / 5;
      const rr = k % 2 ? 0.17 : 0.4;
      if (k) star.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else star.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    const sg = lk(new THREE.ExtrudeGeometry(star, { depth: 0.14, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 }));
    for (const x of [-1.6, 0, 1.6]) this.ink(this.m(grp, sg, this.toon(0xffd23a, { emissive: 0x6a4a00 }), x, BH / 2 + 0.72, 0.18), 0.03).scale.setScalar(x ? 0.8 : 1.05);
    // 화면
    const c = document.createElement('canvas');
    c.width = 1000;
    c.height = 780;
    const t = lk(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    const screen = new THREE.Mesh(lk(new THREE.PlaneGeometry(BW, BH)), lk(new THREE.MeshBasicMaterial({ map: t, color: 0xd8d8d8, toneMapped: false })));
    screen.position.z = 0.06;
    grp.add(screen);
    this.board = { c, t };
    // 둘레 전구
    const bulbG = this.geo('bulb', () => new THREE.SphereGeometry(0.1, 12, 8));
    const per = (BW + 0.7) * 2 + (BH + 0.7) * 2;
    const cnt = Math.round(per / 0.55);
    const bulbAt: number[] = [];
    for (let k = 0; k < cnt; k++) {
      let d = (k / cnt) * per;
      let x: number;
      let y: number;
      const hw = (BW + 0.7) / 2;
      const hh = (BH + 0.7) / 2;
      if (d < hw * 2) {
        x = -hw + d;
        y = hh;
      } else if ((d -= hw * 2) < hh * 2) {
        x = hw;
        y = hh - d;
      } else if ((d -= hh * 2) < hw * 2) {
        x = hw - d;
        y = -hh;
      } else {
        d -= hw * 2;
        x = -hw;
        y = -hh + d;
      }
      bulbAt.push(x, y);
    }
    // 전구는 색만 바뀌어 한 번에 그린다 (인스턴스 — 전구마다 따로 그리던 것과 그림은 같다)
    const bulbs = lk(new THREE.InstancedMesh(bulbG, lk(new THREE.MeshBasicMaterial({ color: 0xffffff })), cnt));
    const bm = new THREE.Matrix4();
    for (let k = 0; k < cnt; k++) {
      bulbs.setMatrixAt(k, bm.makeTranslation(bulbAt[k * 2]!, bulbAt[k * 2 + 1]!, 0.05));
      bulbs.setColorAt(k, this.bulbCol.setHex(0xffe08a));
    }
    bulbs.computeBoundingSphere();
    grp.add(bulbs);
    this.bulbs = bulbs;
    // 서치라이트 빛줄기 — 전광판 뒤에서 하늘로
    const bc = document.createElement('canvas');
    bc.width = 64;
    bc.height = 256;
    const bgc = bc.getContext('2d')!;
    const gr = bgc.createLinearGradient(0, 256, 0, 0);
    gr.addColorStop(0, 'rgba(200,220,255,0.7)');
    gr.addColorStop(1, 'rgba(200,220,255,0)');
    bgc.fillStyle = gr;
    bgc.beginPath();
    bgc.moveTo(26, 256);
    bgc.lineTo(38, 256);
    bgc.lineTo(64, 0);
    bgc.lineTo(0, 0);
    bgc.fill();
    const bt = lk(new THREE.CanvasTexture(bc));
    for (const [x, a] of [
      [-4.5, 0.35],
      [-1.5, 0.12],
      [1.5, -0.12],
      [4.5, -0.35],
    ] as const) {
      const pivot = new THREE.Group();
      pivot.position.set(x * 0.8, -1, -1.2);
      const beam = new THREE.Mesh(lk(new THREE.PlaneGeometry(3.2, 16)), lk(new THREE.MeshBasicMaterial({ map: bt, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending })));
      beam.position.y = 8;
      pivot.add(beam);
      pivot.rotation.z = a;
      pivot.userData['a'] = a;
      grp.add(pivot);
      this.beams.push(pivot as unknown as THREE.Mesh);
    }
    // 관중 플래시 (반짝이 점)
    const N = 160;
    const pos = new Float32Array(N * 3);
    for (let k = 0; k < N; k++) pos.set([(Math.random() - 0.5) * 34, 1 + Math.random() * 3.5, BOARD_Z - 8 - Math.random() * 4], k * 3);
    const pg = lk(new THREE.BufferGeometry());
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const sp = new THREE.Points(pg, lk(new THREE.PointsMaterial({ map: this.flashTex, size: 0.55, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending })));
    this.level.add(sp);
    this.sparkles = sp;
  }

  /** 홈 타석 흙 받침 · 배팅 티 · 빈 칸 표시(빛 고리 · ?) */
  private buildField(lk: <T extends Keep>(x: T) => T, n: number): void {
    const P = this.playGrp;
    // 흙 내야 — 받침대 앞 바닥 (시안의 화면 아래 흙 · 흰 선)
    const dirt = new THREE.Mesh(lk(new THREE.CircleGeometry(1, 72)), this.toon(0xd28c4a));
    dirt.rotation.x = -Math.PI / 2;
    dirt.scale.set(Math.max(16, n * 4.5), 7, 1);
    dirt.position.set(0, -3.32, RACK_Z + 3.2);
    P.add(dirt);
    this.dirt = dirt;
    const pad = this.ink(this.m(P, lk(new THREE.CylinderGeometry(1, 1, 0.3, 64)), 0xc98a55, 0, -1.55, SLOT_Z - 0.1), 0.05);
    pad.scale.set(Math.max(4.4, n * 1.4 + 1.3), 1, 1.7);
    // 흰 홈 플레이트
    const plate = new THREE.Shape();
    plate.moveTo(-0.45, 0);
    plate.lineTo(0.45, 0);
    plate.lineTo(0.45, -0.32);
    plate.lineTo(0, -0.62);
    plate.lineTo(-0.45, -0.32);
    plate.closePath();
    const pm = this.ink(this.m(P, lk(new THREE.ExtrudeGeometry(plate, { depth: 0.08, bevelEnabled: false })), 0xffffff, 0, -1.38, SLOT_Z + 1.25), 0.03);
    pm.rotation.x = Math.PI / 2;
    const qc = document.createElement('canvas');
    qc.width = qc.height = 128;
    const qg = qc.getContext('2d')!;
    qg.font = '900 100px "Black Han Sans", system-ui, sans-serif';
    qg.textAlign = 'center';
    qg.textBaseline = 'middle';
    qg.lineJoin = 'round';
    qg.lineWidth = 14;
    qg.strokeStyle = '#1a3a8a';
    qg.strokeText('?', 64, 70);
    qg.fillStyle = '#ffffff';
    qg.fillText('?', 64, 70);
    const qt = lk(new THREE.CanvasTexture(qc));
    // 유리 구슬 안 색 배경 (시안: 파랑 · 초록 · 주황) — 가운데가 밝은 둥근 그러데이션 + 흐릿한 공 무늬
    const glassBack = (col: string): THREE.CanvasTexture => {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d')!;
      g.beginPath();
      g.arc(128, 128, 126, 0, Math.PI * 2);
      g.clip();
      const lg = g.createLinearGradient(0, 0, 0, 256);
      lg.addColorStop(0, 'rgba(255,255,255,0)');
      lg.addColorStop(0.42, 'rgba(255,255,255,0.05)');
      lg.addColorStop(0.58, col);
      lg.addColorStop(1, col);
      g.fillStyle = lg;
      g.fillRect(0, 0, 256, 256);
      // 아래쪽 흐릿한 공 무늬
      g.strokeStyle = 'rgba(255,255,255,0.28)';
      g.lineWidth = 7;
      g.beginPath();
      g.arc(128, 200, 52, 0, Math.PI * 2);
      g.stroke();
      const t = lk(new THREE.CanvasTexture(c));
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const backCols = ['#2f6fd8', '#2f9e55', '#e8902a', '#c8407a'];
    // 유리 반짝임 (왼쪽 위 초승달 · 작은 점)
    const hc = document.createElement('canvas');
    hc.width = hc.height = 256;
    const hg = hc.getContext('2d')!;
    hg.fillStyle = 'rgba(255,255,255,0.75)';
    hg.beginPath();
    hg.ellipse(66, 70, 30, 11, -0.75, 0, Math.PI * 2);
    hg.fill();
    hg.beginPath();
    hg.arc(98, 44, 6, 0, Math.PI * 2);
    hg.fill();
    const ht = lk(new THREE.CanvasTexture(hc));
    const glassMat = lk(new THREE.MeshBasicMaterial({ color: 0xe8f6ff, transparent: true, opacity: 0.1, depthWrite: false }));
    for (let k = 0; k < n; k++) {
      const x = (k - (n - 1) / 2) * SLOT_GAP;
      const tee = new THREE.Group();
      tee.position.set(x, 0, SLOT_Z);
      this.ink(this.m(tee, this.geo('teeBase', () => new THREE.CylinderGeometry(0.42, 0.5, 0.18, 24)), 0x2a2e3a, 0, -1.33, 0), 0.03);
      this.ink(this.m(tee, this.geo('teePost', () => new THREE.CylinderGeometry(0.08, 0.08, 0.62, 12)), 0x3a3f50, 0, -0.95, 0), 0.025);
      this.ink(this.m(tee, this.geo('teeCup', () => new THREE.CylinderGeometry(0.3, 0.1, 0.22, 16)), 0xe0393e, 0, -0.56, 0), 0.025);
      P.add(tee);
      // 유리 구슬 — 색 배경 · 유리 · 반짝임 (공이 앉아도 남는다: 진열장 안의 공)
      const back = new THREE.Mesh(this.geo('glassBack', () => new THREE.CircleGeometry(1.2, 48)), lk(new THREE.MeshBasicMaterial({ map: glassBack(backCols[k % backCols.length]!), transparent: true, depthWrite: false })));
      back.position.set(x, SLOT_Y, SLOT_Z - 0.75);
      P.add(back);
      const glass = new THREE.Mesh(this.geo('glass', () => new THREE.SphereGeometry(1.3, 40, 28)), glassMat);
      glass.position.set(x, SLOT_Y, SLOT_Z);
      glass.renderOrder = 2;
      P.add(glass);
      const shine = new THREE.Sprite(lk(new THREE.SpriteMaterial({ map: ht, transparent: true, depthWrite: false })));
      shine.scale.setScalar(2.5);
      shine.position.set(x, SLOT_Y, SLOT_Z + 1.32);
      shine.renderOrder = 3;
      P.add(shine);
      const ring = this.m(P, this.geo('ring', () => new THREE.TorusGeometry(1.3, 0.055, 8, 48)), lk(new THREE.MeshBasicMaterial({ color: 0x8ad8ff, transparent: true })), x, SLOT_Y, SLOT_Z);
      const q = new THREE.Sprite(lk(new THREE.SpriteMaterial({ map: qt, color: 0xdcdcdc, transparent: true, depthWrite: false })));
      q.scale.setScalar(1.6);
      q.position.set(x, SLOT_Y, SLOT_Z + 0.1);
      q.renderOrder = 4;
      P.add(q);
      this.ghosts.push({ ring, q, tee, glass: [back, glass, shine] });
      // 누르는 자리 (보이지 않는 공)
      const hit = this.m(P, this.geo('slotHit', () => new THREE.SphereGeometry(1.32, 12, 8)), lk(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })), x, SLOT_Y, SLOT_Z);
      hit.userData['slot'] = k;
      this.slots.push(hit);
    }
  }

  /* ───────────── 전광판 ───────────── */

  /** LED 전광판 — 숨은 수 · 부른 수 줄마다 S(초록) · B(노랑) 불빛 · 결과 */
  drawBoard(clues: Clue[], n: number, reveal: string, maxRows = 9, info = ''): void {
    // 던진 줄이 이제 기록에 들어왔으면 임시 줄을 지운다
    if (this.pending && clues.some((c) => c.g === this.pending!.g)) this.pending = null;
    // 게임의 기록 배열은 던지기 전에 새 줄이 먼저 들어가므로, 받은 순간의 모습을 복사해 둔다
    this.boardArgs = { clues: clues.map((c) => ({ ...c })), n, reveal, maxRows, info };
    this.paintBoard();
  }

  private rowsOf(): number {
    return Math.min(6, Math.max(4, this.boardArgs.maxRows));
  }
  private readonly cols = { no: 62, g: 290, s: 548, b: 720, r: 885 };

  private paintBoard(): void {
    const { c, t } = this.board;
    const { n, reveal, info } = this.boardArgs;
    const clues: (Clue & { p?: Pending })[] = this.pending ? [...this.boardArgs.clues, { g: this.pending.g, s: this.pending.s, b: this.pending.b, p: this.pending }] : this.boardArgs.clues;
    const W = c.width;
    const H = c.height;
    const g = c.getContext('2d')!;
    g.fillStyle = '#04060d';
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(40,60,100,0.32)';
    for (let y = 4; y < H; y += 8) for (let x = 4; x < W; x += 8) g.fillRect(x, y, 3, 3);
    const glow = (col: string, blur: number): void => {
      g.shadowColor = col;
      g.shadowBlur = blur;
    };
    const F = '"Black Han Sans", "Dela Gothic One", system-ui, sans-serif';
    // 숨은 수
    g.textBaseline = 'middle';
    glow('#ffd23a', 6);
    g.font = `400 60px ${F}`;
    g.textAlign = 'left';
    g.fillStyle = '#ffd23a';
    g.fillText($t('숨은 수'), 36, 72, 200);
    for (let k = 0; k < n; k++) {
      const x = 250 + k * 98;
      glow(reveal ? '#ffd23a' : '#3a6aff', 8);
      g.fillStyle = reveal ? '#ffd23a' : '#15245a';
      g.fillRect(x, 24, 88, 94);
      g.shadowBlur = 0;
      g.fillStyle = reveal ? '#05080f' : '#8ab0ff';
      g.textAlign = 'center';
      g.font = `400 70px ${F}`;
      g.fillText(reveal ? reveal[k]! : '?', x + 44, 74);
    }
    g.textAlign = 'right';
    glow('#7ad8ff', 3);
    g.fillStyle = '#7ad8ff';
    g.font = `400 42px ${F}`;
    g.fillText(info, W - 36, 72, W - 300 - n * 98);
    g.shadowBlur = 0;
    const { cols } = this;
    // 머리글(회 · 부른 수 · S · B · 결과) — 폰 가로 화면에서는 7px 쯤으로 보여 키운다 (숨은 수 칸 아래 · 줄 위 빈자리 안)
    g.font = `400 ${isPhoneLandscape() ? 50 : 34}px ${F}`;
    g.fillStyle = '#6a8ab8';
    g.textAlign = 'center';
    g.fillText($t('회'), cols.no, 164, 90);
    g.fillText($t('부른 수'), cols.g, 164, 300);
    g.fillText('S', cols.s, 164);
    g.fillText('B', cols.b, 164);
    g.fillText($t('결과'), cols.r, 164, 220);
    g.fillStyle = '#2a3a5a';
    g.fillRect(30, 190, W - 60, 3);
    const rows = this.rowsOf();
    const show = clues.slice(-rows);
    const rh = (H - 210) / rows;
    const now = performance.now() / 1000;
    show.forEach((k, i) => {
      const y = 205 + i * rh + rh / 2;
      const p = k.p;
      g.fillStyle = p ? `rgba(60,110,200,${0.45 + 0.25 * Math.abs(Math.sin(now * 8))})` : i % 2 ? 'rgba(30,45,75,0.55)' : 'rgba(20,32,58,0.55)';
      g.fillRect(30, y - rh / 2 + 2, W - 60, rh - 4);
      g.fillStyle = '#9ab8e8';
      g.font = `400 ${Math.round(rh * 0.55)}px ${F}`;
      g.fillText(String(clues.length - show.length + i + 1), cols.no, y + 2);
      if (!p || p.done || p.litS + p.litB > 0 || this.thr?.hit.every(Boolean)) {
        glow('#ffffff', 0);
        g.fillStyle = '#ffffff';
        g.font = `400 ${Math.round(rh * 0.84)}px ${F}`;
        g.fillText(k.g.split('').join(' '), cols.g, y + 4);
      }
      const lamp = (cx: number, on: number, col: string): void => {
        for (let q = 0; q < n; q++) {
          const lit = q < on;
          glow(lit ? col : 'transparent', lit ? 10 : 0);
          g.fillStyle = lit ? col : '#1c2638';
          g.beginPath();
          g.arc(cx - ((n - 1) / 2) * 38 + q * 38, y, Math.min(18, rh * 0.25), 0, Math.PI * 2);
          g.fill();
        }
      };
      lamp(cols.s, p ? p.litS : k.s, '#4aff7a');
      lamp(cols.b, p ? p.litB : k.b, '#ffd23a');
      if (!p || p.done) {
        const hr = k.s === n;
        const out = k.s + k.b === 0;
        glow(hr ? '#ffd23a' : out ? '#ff4a4a' : '#ffffff', 4);
        g.font = `400 ${Math.round(rh * 0.56)}px ${F}`;
        g.fillStyle = hr ? '#ffd23a' : out ? '#ff5a5a' : '#e8f0ff';
        g.fillText(hr ? $t('홈런!') : out ? $t('아웃') : `${k.s}S ${k.b}B`, cols.r, y + 3, 200);
      }
      g.shadowBlur = 0;
    });
    g.shadowBlur = 0;
    t.needsUpdate = true;
  }

  /** 전광판 「부른 수」 칸의 j번째 숫자 자리 (세계 좌표) — 던진 공이 꽂히는 곳 */
  private boardSpot(j: number, n: number, rowIndex: number): THREE.Vector3 {
    const rows = this.rowsOf();
    const H = this.board.c.height;
    const W = this.board.c.width;
    const rh = (H - 210) / rows;
    const y = 205 + Math.min(rowIndex, rows - 1) * rh + rh / 2;
    const step = rh * 0.84 * 0.62 * 2;
    const x = this.cols.g + (j - (n - 1) / 2) * step;
    this.boardGrp.updateMatrixWorld();
    return this.boardGrp.localToWorld(new THREE.Vector3((x / W - 0.5) * BW, (0.5 - y / H) * BH, 0.15));
  }

  /* ───────────── 공 · 칸 ───────────── */

  private slotPos(k: number, n: number): THREE.Vector3 {
    return new THREE.Vector3((k - (n - 1) / 2) * SLOT_GAP, SLOT_Y, SLOT_Z);
  }

  /** 부르는 수 칸에 놓인 숫자 (차례대로) — 공들이 폴짝 */
  setPicked(picked: string[], used: Set<string> = new Set()): void {
    const n = this.ghosts.length;
    for (const b of this.balls) {
      const k = picked.indexOf(b.digit);
      const target = k >= 0 ? this.slotPos(k, n) : b.home.clone();
      if (b.flown) {
        // 전광판에 꽂혔던 공 — 선반에 폴짝 다시 나타난다
        b.flown = false;
        b.g.visible = true;
        b.pos.copy(b.home);
        b.from.copy(b.home);
        b.to.copy(b.home);
        b.t = 1;
        b.pop = 0;
      }
      if (!b.to.equals(target)) {
        b.from.copy(b.pos);
        b.to.copy(target);
        b.t = 0;
      }
      b.used = used.has(b.digit);
    }
  }

  hint(digits: string[]): void {
    this.hintDigits = digits;
  }

  /** 「더는 못 골라요」 — 그 공을 좌우로 흔든다 */
  shakeDigit(d: string): void {
    const b = this.balls.find((x) => x.digit === d);
    if (b) b.wig = 0.45;
  }

  /**
   * 던지기 연출 — 돌려주는 값은 연출이 끝나는 데 걸리는 시간(ms). 게임은 그 뒤에 다음 차례로.
   * 칸의 공을 뒤로 당겼다가 하나씩 전광판 새 줄로 던지고, S · B 불을 하나씩 켠 뒤 큰 만화 글자.
   */
  pitch(s: number, b: number, n: number, guess = ''): number {
    const inSlots = this.balls.filter((x) => x.to.z > SLOT_Z - 0.2 && x.to.z < SLOT_Z + 0.2 && Math.abs(x.to.y - SLOT_Y) < 0.01);
    const order = (guess ? guess.split('') : inSlots.map((x) => x.digit)).map((d) => this.balls.find((x) => x.digit === d)!).filter(Boolean);
    const rowIndex = this.boardArgs.clues.length;
    this.pending = { g: guess || order.map((x) => x.digit).join(''), s, b, litS: 0, litB: 0, done: false };
    // 숫자 공이 꽂힌 뒤 — 숫자 없는 투구가 결과 수만큼: 스트라이크(직구) → 볼(변화구) → 헛공(툭 떨어짐).
    // 어느 숫자가 스트라이크인지는 알려 주면 안 되므로 숫자 공과 따로 던진다.
    this.playGrp.updateMatrixWorld();
    this.boardGrp.updateMatrixWorld();
    // 전광판이 바라보는 쪽(+z) 정면 먼 곳 — 투수 자리에서 포수(전광판)를 보는 구도
    const fwd = new THREE.Vector3(0, 0, 1);
    const P0 = 1.12;
    const kinds: ('S' | 'B' | 'X')[] = [...Array(s).fill('S'), ...Array(b).fill('B'), ...Array(Math.max(0, n - s - b)).fill('X')];
    const SPS: Special[] = ['fire', 'bolt', 'ghost', 'twist'];
    let cursor = P0;
    const pitches: Pitch[] = kinds.map((kind, i) => {
      const q = kind === 'S' ? i : kind === 'B' ? i - s : i - s - b;
      const to = kind === 'X' ? this.boardGrp.localToWorld(new THREE.Vector3((i % 2 ? 1 : -1) * 1.2, -BH / 2 - 2.4, 3.2)) : this.lampSpot(kind, q, n, rowIndex);
      const aim = kind === 'X' ? this.boardGrp.localToWorld(new THREE.Vector3(0, -BH / 2, 0.2)) : to;
      const from = aim.clone().addScaledVector(fwd, 15).add(new THREE.Vector3(0, -0.6, 0));
      const mid = from.clone().lerp(to, 0.5);
      // 직구는 곧게, 변화구는 옆으로 휘었다 들어가고, 헛공은 떴다가 전광판 앞에 떨어진다
      const ctrl = kind === 'B' ? mid.add(new THREE.Vector3((i % 2 ? -1 : 1) * 2.6, 1.2, 0)) : kind === 'S' ? mid.add(new THREE.Vector3(0, 0.25, 0)) : mid.add(new THREE.Vector3(0, 2.4, 0));
      const sp: Special | null = kind !== 'S' ? null : s === n && q === n - 1 ? 'ult' : SPS[(rowIndex + q) % SPS.length]!;
      const g = new THREE.Group();
      const mat = new THREE.MeshToonMaterial({ color: 0xf4f1ea, map: this.ballTexture('p'), gradientMap: this.grad, emissive: sp ? SPECIAL_COL[sp] : 0x000000, emissiveIntensity: sp ? 0.55 : 0 });
      this.ink(this.m(g, this.geo('bball', () => new THREE.SphereGeometry(BALL_R, 40, 24)), mat), 0.022);
      g.visible = false;
      this.scene.add(g);
      const after: THREE.Mesh[] = [];
      if (sp === 'ghost' || sp === 'ult') {
        for (let a = 0; a < 4; a++) {
          const am = new THREE.Mesh(this.geo('bball', () => new THREE.SphereGeometry(BALL_R, 40, 24)), new THREE.MeshBasicMaterial({ color: sp === 'ghost' ? 0xc08aff : 0xffffff, transparent: true, opacity: 0.35 - a * 0.07, depthWrite: false, blending: THREE.AdditiveBlending }));
          am.visible = false;
          this.scene.add(am);
          after.push(am);
        }
      }
      let bolt: THREE.Line | null = null;
      if (sp === 'bolt' || sp === 'ult') {
        const bg = new THREE.BufferGeometry();
        bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 3), 3));
        bolt = new THREE.Line(bg, new THREE.LineBasicMaterial({ color: sp === 'bolt' ? 0xd8f4ff : 0xfff6c8, transparent: true, depthTest: false, blending: THREE.AdditiveBlending }));
        bolt.renderOrder = 16;
        bolt.frustumCulled = false;
        bolt.visible = false;
        this.scene.add(bolt);
      }
      const dur = kind === 'S' ? (sp === 'ult' ? 0.62 : sp === 'ghost' ? 0.5 : sp === 'twist' ? 0.46 : 0.3) : kind === 'B' ? 0.5 : 0.48;
      const cutAt = cursor;
      const t0 = kind === 'S' ? cursor + (sp === 'ult' ? 0.85 : 0.55) : cursor;
      cursor = t0 + (kind === 'X' ? 0.46 : dur + 0.32);
      return { kind, sp, cutAt, cut: false, mat, after, bolt, q, t0, dur, from, to, ctrl, m: g, hit: false };
    });
    const last = pitches.length ? pitches[pitches.length - 1]! : null;
    const resultAt = last ? last.t0 + last.dur + (last.kind === 'X' ? 0.45 : 0.25) : 1.3;
    const hr = s === n;
    this.thr = {
      pitches,
      t: 0,
      s,
      b,
      n,
      balls: order,
      starts: order.map((x) => x.pos.clone()),
      targets: order.map((_, j) => this.playGrp.worldToLocal(this.boardSpot(j, n, rowIndex))),
      hit: order.map(() => false),
      resultAt,
      end: resultAt + (hr ? 2.3 : 1.2),
      shown: false,
    };
    this.speed.className = 'nb-speed on';
    this.punch = 1;
    return Math.round(this.thr.end * 1000);
  }

  /** 방금 짠 투구 시간표 (초) — 게임이 소리를 연출에 맞춘다 */
  get pitchTimes(): { kind: 'S' | 'B' | 'X'; q: number; at: number }[] {
    return (this.thr?.pitches ?? []).map((p) => ({ kind: p.kind, q: p.q, at: p.t0 + p.dur }));
  }

  /** 방금 짠 투구의 결과가 뜨는 때 (초) */
  get resultTime(): number {
    return this.thr?.resultAt ?? 1.3;
  }

  /** 전광판 새 줄의 S · B 불 자리 (세계 좌표) */
  private lampSpot(kind: 'S' | 'B', q: number, n: number, rowIndex: number): THREE.Vector3 {
    const rows = this.rowsOf();
    const H = this.board.c.height;
    const W = this.board.c.width;
    const rh = (H - 210) / rows;
    const y = 205 + Math.min(rowIndex, rows - 1) * rh + rh / 2;
    const cx = kind === 'S' ? this.cols.s : this.cols.b;
    const x = cx - ((n - 1) / 2) * 38 + q * 38;
    return this.boardGrp.localToWorld(new THREE.Vector3((x / W - 0.5) * BW, (0.5 - y / H) * BH, 0.15));
  }

  private showComic(kind: 'hr' | 'out' | 'hit', text: string): void {
    this.comic.className = `nb-comic ${kind}`;
    this.comic.innerHTML = `<svg viewBox="-100 -100 200 200" aria-hidden="true"><polygon points="${burst(kind === 'hr' ? 24 : 18, 98, kind === 'hr' ? 62 : 70)}"/><polygon class="in" points="${burst(kind === 'hr' ? 24 : 18, 80, kind === 'hr' ? 52 : 58)}"/></svg><b></b>`;
    const lines = text.split(/\s{2,}/);
    const bEl = this.comic.querySelector('b')!;
    bEl.textContent = '';
    lines.forEach((ln, i) => {
      if (i) bEl.appendChild(document.createElement('br'));
      bEl.appendChild(document.createTextNode(ln));
    });
    void this.comic.offsetWidth;
    this.comic.classList.add('on');
  }
  private hideComic(): void {
    this.comic.className = 'nb-comic';
    this.speed.className = 'nb-speed';
  }
  private flashScreen(strong = false): void {
    this.flashEl.className = 'nb-flash';
    void this.flashEl.offsetWidth;
    this.flashEl.className = `nb-flash on${strong ? ' strong' : ''}`;
  }
  private boom(at: THREE.Vector3, size = 1.6, color = 0xffffff, life = 0.45): void {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flashTex, color, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
    s.position.copy(at);
    s.renderOrder = 20;
    s.scale.setScalar(size);
    this.scene.add(s);
    this.flashes.push({ s, t: 0, size, life });
  }
  /** 화면 위 작은 만화 딱지 (스트라이크! · 볼!) — 세계 좌표를 화면에 찍어 띄운다 */
  private tag(at: THREE.Vector3, text: string, kind: 'S' | 'B' | 'X', big = false): void {
    const v = at.clone().project(this.camera);
    const el = document.createElement('div');
    el.className = `nb-tag ${kind}${big ? ' big' : ''}`;
    el.textContent = text;
    el.style.left = `${((v.x + 1) / 2) * this.host.clientWidth}px`;
    el.style.top = `${((1 - v.y) / 2) * this.host.clientHeight}px`;
    this.fx.appendChild(el);
    window.setTimeout(() => el.remove(), 1400);
  }
  /** 종이 꽃가루 (홈런) */
  private confetti(): void {
    const box = document.createElement('div');
    box.className = 'nb-confetti';
    const cols = ['#ff5a7a', '#ffd23a', '#5ab8ff', '#7ae08a', '#ff9a3a', '#c08aff', '#ffffff'];
    for (let k = 0; k < 90; k++) {
      const i = document.createElement('i');
      i.style.left = `${Math.random() * 100}%`;
      i.style.background = cols[k % cols.length]!;
      i.style.animationDelay = `${Math.random() * 0.9}s`;
      i.style.animationDuration = `${1.8 + Math.random() * 1.6}s`;
      i.style.setProperty('--dx', `${(Math.random() - 0.5) * 220}px`);
      i.style.setProperty('--r', `${Math.random() * 1080 - 540}deg`);
      box.appendChild(i);
    }
    this.fx.appendChild(box);
    window.setTimeout(() => box.remove(), 4200);
  }

  celebrate(): void {
    this.won = performance.now() / 1000;
    const g = new THREE.Group();
    this.ink(this.m(g, this.geo('hball', () => new THREE.SphereGeometry(0.42, 24, 16)), this.toon(0xffffff)), 0.03);
    g.position.copy(this.playGrp.localToWorld(new THREE.Vector3(0, SLOT_Y, SLOT_Z)));
    this.scene.add(g);
    this.homer = { m: g, t: 0, from: g.position.clone() };
  }

  pick(clientX: number, clientY: number): { digit: string } | { slot: number } | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), this.camera);
    this.scene.updateMatrixWorld();
    const hits = this.ray.intersectObjects([...this.balls.filter((b) => b.g.visible).map((b) => b.g), ...this.slots], true);
    for (const h of hits) {
      if (h.object.userData['digit'] !== undefined) return { digit: h.object.userData['digit'] as string };
      if (h.object.userData['slot'] !== undefined) return { slot: h.object.userData['slot'] as number };
    }
    return null;
  }

  screenOfDigit(d: string): [number, number] {
    const b = this.balls.find((x) => x.digit === d)!;
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = this.playGrp.localToWorld(b.pos.clone()).project(this.camera);
    return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height];
  }

  /* ───────────── 화면 맞춤 ───────────── */

  setFree(rect: FreeRect): void {
    this.free = rect;
    // 만화 글자 · 집중선은 판이 보이는 자리 한가운데에
    this.fx.style.setProperty('--cx', `${rect.x + rect.w / 2}px`);
    this.fx.style.setProperty('--cy', `${rect.y + rect.h * 0.5}px`);
    this.fx.style.setProperty('--fw', `${rect.w}px`);
    this.fx.style.setProperty('--fh', `${rect.h}px`);
    this.fit();
  }
  private resize(): void {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (w <= 0 || h <= 0) return;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.coverBg();
    this.fit();
  }
  private rackRowGap(): number {
    return RACK_GAP * this.rackS * 1.3;
  }

  /** 선반 공 자리 — 배율 s · 줄 수 rows. 선반에 있던 공은 새 자리로 옮긴다 */
  private layoutRack(s: number, rows: number): void {
    const key = `${s}/${rows}`;
    if (key === this.rackKey) return;
    this.rackKey = key;
    this.rackS = s;
    this.rackRows = rows;
    const N = this.balls.length;
    const per = Math.ceil(N / rows);
    const gap = RACK_GAP * s;
    this.balls.forEach((b, i) => {
      const row = Math.floor(i / per);
      const cnt = row < rows - 1 ? per : N - per * (rows - 1);
      const col = i - row * per;
      const home = new THREE.Vector3((col - (cnt - 1) / 2) * gap, RACK_Y - row * this.rackRowGap(), RACK_Z + row * 0.25);
      const atHome = b.to.equals(b.home);
      b.home.copy(home);
      if (atHome) {
        b.to.copy(home);
        b.from.copy(home);
        b.pos.copy(home);
        b.t = 1;
      }
    });
    this.trays.forEach((tg, row) => {
      tg.visible = row < rows;
      const cnt = row < rows - 1 ? per : N - per * (rows - 1);
      tg.position.set(0, RACK_Y - row * this.rackRowGap(), RACK_Z + row * 0.25);
      tg.scale.set((cnt * gap + 0.5 * s) / this.trayW, s, s);
    });
    // 흙바닥은 아래 줄 선반보다 아래로 (안 그러면 아래 줄이 흙에 묻힌다)
    this.dirt?.position.setY(Math.min(-3.32, RACK_Y - (rows - 1) * this.rackRowGap() - 0.72 * s));
  }

  private fit(): void {
    const W = this.host.clientWidth;
    const H = this.host.clientHeight;
    if (W <= 0 || H <= 0 || !this.balls.length) return;
    const pitch = THREE.MathUtils.degToRad(7);
    this.camera.aspect = W / H;
    this.camera.updateProjectionMatrix();
    const f = this.free;
    const sx = (f.x + f.w / 2 - W / 2) / (W / 2);
    const sy = -(f.y + f.h / 2 - H / 2) / (H / 2);
    // 넓은 화면 — 왼쪽 공 · 오른쪽 전광판 나란히, 좁은 화면 — 위 전광판 · 아래 공
    this.wide = f.w / f.h > 1.25;
    const n = this.ghosts.length;
    // 낮은 화면(가로 폰)은 선반 공이 손가락보다 작아진다 — 공을 키우고 두 줄로
    const compact = f.h < 480;
    this.layoutRack(compact ? 1.6 : 1, compact && this.balls.length > 5 ? 2 : 1);
    const perRow = Math.ceil(this.balls.length / this.rackRows);
    const rackBottom = RACK_Y - (this.rackRows - 1) * this.rackRowGap() - 0.65 * this.rackS;
    const playW = Math.max(n * SLOT_GAP + 0.6, perRow * RACK_GAP * this.rackS + 0.6);
    if (this.wide) {
      const gapX = -0.7;
      this.playGrp.position.set(-(BW + 1.0 + gapX) / 2, 0, 0);
      this.boardGrp.position.set(playW / 2 + gapX / 2, 0.55, BOARD_Z);
      this.playGrp.position.x = this.boardGrp.position.x - (BW + 1.0) / 2 - gapX - playW / 2;
      const mid = (this.playGrp.position.x - playW / 2 + this.boardGrp.position.x + (BW + 1.0) / 2) / 2;
      this.playGrp.position.x -= mid;
      this.boardGrp.position.x -= mid;
      if (compact) {
        // 전광판이 더 길다 — 공 쪽을 전광판 높이 가운데로 올려, 키운 선반이 화면을 줄이지 않게
        const top = SLOT_Y + BALL_R * BIG + 0.15;
        const bTop = this.boardGrp.position.y + BH / 2 + 1.3;
        const bBot = this.boardGrp.position.y - BH / 2 - 0.55;
        this.playGrp.position.y = Math.max(0, (bTop + bBot) / 2 - (top + rackBottom) / 2);
      }
    } else {
      this.playGrp.position.set(0, 0, 0);
      this.boardGrp.position.set(0, 1.2 + BH / 2 + 1.0, BOARD_Z);
    }
    this.level.updateMatrixWorld(true);
    const corners: THREE.Vector3[] = [];
    const bw = BW / 2 + 0.6;
    for (const [x, y] of [
      [-bw, BH / 2 + 1.3],
      [bw, BH / 2 + 1.3],
      [-bw, -BH / 2 - 0.55],
      [bw, -BH / 2 - 0.55],
    ] as const)
      corners.push(this.boardGrp.localToWorld(new THREE.Vector3(x, y, 0)));
    const pw = playW / 2;
    for (const [x, y, z] of [
      [-pw, rackBottom, RACK_Z + 0.5],
      [pw, rackBottom, RACK_Z + 0.5],
      [-pw, SLOT_Y + BALL_R * BIG + 0.15, SLOT_Z],
      [pw, SLOT_Y + BALL_R * BIG + 0.15, SLOT_Z],
    ] as const)
      corners.push(this.playGrp.localToWorld(new THREE.Vector3(x, y, z)));
    const box = new THREE.Box3().setFromPoints(corners);
    const dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
    const target = box.getCenter(new THREE.Vector3());
    const fits = (dist: number): boolean => {
      this.camera.position.copy(dir).multiplyScalar(dist).add(target);
      this.camera.lookAt(target);
      this.camera.updateMatrixWorld();
      return corners.every((c) => {
        const v = c.clone().project(this.camera);
        return v.z < 1 && Math.abs(v.x) <= (f.w / W) * 0.97 && Math.abs(v.y) <= (f.h / H) * 0.97;
      });
    };
    let lo = 4;
    let hi = 200;
    for (let k = 0; k < 30; k++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    fits(hi);
    this.camBase.copy(this.camera.position);
    this.camDir.copy(dir);
    this.camTarget.copy(target);
    this.camera.projectionMatrix.elements[8] = -sx;
    this.camera.projectionMatrix.elements[9] = -sy;
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
  }

  /* ───────────── 그리기 ───────────── */

  private loop = (now: number): void => {
    this.raf = requestAnimationFrame(this.loop);
    // 느린 폰에서도 실제 시간대로 — 한 프레임을 0.05초로 자르면 20fps 아래에서 투구 연출이 슬로모션이 되고,
    // 게임(BallGame)이 실제 ms 로 기다리는 시간표와 어긋난다. 긴 프레임은 0.05초 이하 조각 여러 개로 센다
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    const steps = Math.max(1, Math.ceil(dt / 0.05 - 1e-6));
    /** 조각마다 rate 로 따라가는 것을 한 번에 (조각 크기가 예전과 같으니 결과도 같다) */
    const follow = (rate: number): number => 1 - Math.pow(1 - Math.min(1, (dt / steps) * rate), steps);
    /** 조각마다 rate × 조각 확률로 일어나는 일이 이 프레임에 한 번이라도 일어날 확률 — 같은 식 */
    const chance = follow;
    const t = now / 1000;
    const n = this.ghosts.length;
    const thr = this.thr;
    if (thr) thr.t += dt;

    // 공들
    for (const b of this.balls) {
      if (b.t < 1) {
        b.t = Math.min(1, b.t + dt / 0.34);
        const e = easeOutBack(b.t);
        b.pos.lerpVectors(b.from, b.to, e);
        b.pos.y += Math.sin(b.t * Math.PI) * 0.9;
      }
      const inSlot = Math.abs(b.to.z - SLOT_Z) < 0.2 && Math.abs(b.to.y - SLOT_Y) < 0.01;
      const fromSlot = Math.abs(b.from.z - SLOT_Z) < 0.2 && Math.abs(b.from.y - SLOT_Y) < 0.01;
      const r0 = this.rackS;
      let sc = inSlot ? r0 + (BIG - r0) * b.t : r0 + (BIG - r0) * (1 - b.t) * (fromSlot ? 1 : 0);
      if (b.pop < 1) {
        b.pop = Math.min(1, b.pop + dt / 0.35);
        sc *= easeOutBack(b.pop);
      }
      const glow = this.hintDigits.includes(b.digit);
      b.g.position.copy(b.pos);
      b.g.scale.setScalar(sc);
      // 칸 속 큰 공은 숨 쉬듯 · 살짝 돎
      if (inSlot && b.t >= 1 && !thr) {
        b.g.position.y += Math.sin(t * 2.2 + b.pos.x) * 0.05;
        b.g.rotation.set(Math.sin(t * 1.3 + b.pos.x) * 0.12, Math.sin(t * 0.9 + b.pos.x) * 0.25, 0);
      } else if (b.t < 1) b.g.rotation.set(0, b.t * Math.PI * 2, 0);
      else b.g.rotation.set(0, 0, 0);
      if (glow) b.g.position.y += Math.abs(Math.sin(t * 6)) * 0.14;
      if (b.wig > 0) {
        b.wig = Math.max(0, b.wig - dt);
        b.g.position.x += Math.sin(t * 42) * 0.09 * (b.wig / 0.45);
      }
      b.mat.color.setHex(b.used ? 0x8a9098 : glow ? 0xd8ffe8 : 0xf4f1ea);
      b.mat.emissive.setHex(glow ? 0x2a8a5a : 0x000000);
    }

    // 던지기
    if (thr) {
      const W0 = 0.38;
      thr.balls.forEach((b, j) => {
        const st = thr.starts[j]!;
        const to = thr.targets[j]!;
        const t0 = W0 + j * 0.1;
        if (thr.t < W0) {
          // 당기기 — 뒤로 · 찌그러짐 · 부르르
          const k = thr.t / W0;
          b.g.position.set(st.x + Math.sin(t * 60 + j) * 0.03 * k, st.y - 0.25 * k, st.z + 0.9 * easeOutCubic(k));
          b.g.scale.set(BIG * (1 + 0.14 * k), BIG * (1 - 0.14 * k), BIG);
          b.g.rotation.set(-k * 0.6, 0, 0);
        } else if (thr.t < t0 + 0.4) {
          const k = Math.max(0, (thr.t - t0) / 0.4);
          const from = new THREE.Vector3(st.x, st.y - 0.25, st.z + 0.9);
          const p = new THREE.Vector3().lerpVectors(from, to, easeInCubic(k));
          p.y += Math.sin(k * Math.PI) * 1.4;
          b.g.position.copy(p);
          const sc = BIG + (0.8 - BIG) * k;
          b.g.scale.set(sc * 0.86, sc * 0.86, sc * (1.25 + k));
          b.g.rotation.set(-t * 30, 0, 0);
          this.streak(j, this.playGrp.localToWorld(from.clone()), this.playGrp.localToWorld(p.clone()), k);
        } else if (!thr.hit[j]) {
          thr.hit[j] = true;
          b.g.visible = false;
          b.flown = true;
          this.streak(j, null, null, 1);
          this.boom(this.playGrp.localToWorld(to.clone()), 1.8, 0xbfe0ff);
          this.shake = Math.max(this.shake, 0.1);
          if (thr.hit.every(Boolean)) this.paintBoard();
        }
      });
      // 투구 — 스트라이크(직구) · 볼(변화구) · 헛공
      const p = this.pending;
      for (const pc of thr.pitches) {
        if (pc.sp && !pc.cut && thr.t >= pc.cutAt) {
          pc.cut = true;
          this.cutin(pc.sp);
          this.speed.className = `nb-speed on burst ${pc.sp}`;
          this.punch = Math.max(this.punch, pc.sp === 'ult' ? 1.2 : 0.6);
          if (pc.sp === 'ult') {
            this.rainbow = true;
            this.fever = Math.max(this.fever, 1.2);
          }
        }
        const k = (thr.t - pc.t0) / pc.dur;
        if (k < 0) continue;
        const sid = 8 + thr.pitches.indexOf(pc);
        if (!pc.hit && k < 1) {
          pc.m.visible = true;
          const e = pc.kind === 'S' ? (pc.sp === 'ult' ? k * k : easeInCubic(k)) : k;
          const a = pc.from.clone().multiplyScalar((1 - e) * (1 - e)).add(pc.ctrl.clone().multiplyScalar(2 * (1 - e) * e)).add(pc.to.clone().multiplyScalar(e * e));
          const dir = pc.to.clone().sub(pc.from).normalize();
          const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
          const up = new THREE.Vector3().crossVectors(side, dir).normalize();
          const col = pc.sp ? SPECIAL_COL[pc.sp] : 0xffffff;
          // 필살 궤적
          if (pc.sp === 'bolt') a.addScaledVector(side, (Math.abs(((k * 5) % 2) - 1) * 2 - 1) * 1.1 * (1 - k));
          if (pc.sp === 'twist') {
            const th = k * Math.PI * 7;
            a.addScaledVector(side, Math.cos(th) * 1.5 * (1 - k)).addScaledVector(up, Math.sin(th) * 1.5 * (1 - k));
          }
          if (pc.sp === 'ghost') a.addScaledVector(side, Math.sin(k * Math.PI * 3) * 1.6 * (1 - k));
          pc.m.position.copy(a);
          let sc = pc.kind === 'S' ? 1.7 - 0.8 * e : 1.6 - 0.7 * e;
          if (pc.sp === 'ult') sc = 2.6 - 1.2 * e;
          pc.m.scale.set(sc, sc, sc * (pc.kind === 'S' ? 1.6 : 1));
          pc.m.lookAt(pc.to);
          pc.m.rotateX(-t * (pc.kind === 'B' ? 18 : 40));
          // 도깨비 — 중간에 사라졌다 나타남
          pc.m.visible = !(pc.sp === 'ghost' && k > 0.38 && k < 0.7);
          if (pc.sp === 'ghost' && Math.abs(k - 0.38) < 0.03) this.boom(a, 2.2, 0xb06aff, 0.35);
          if (pc.sp === 'ghost' && Math.abs(k - 0.7) < 0.03) this.boom(a, 2.2, 0xb06aff, 0.35);
          // 잔상
          pc.after.forEach((am, ai) => {
            const kk = Math.max(0, k - (ai + 1) * 0.06);
            const ee = pc.sp === 'ult' ? kk * kk : easeInCubic(kk);
            const ap = pc.from.clone().multiplyScalar((1 - ee) * (1 - ee)).add(pc.ctrl.clone().multiplyScalar(2 * (1 - ee) * ee)).add(pc.to.clone().multiplyScalar(ee * ee));
            if (pc.sp === 'ghost') ap.addScaledVector(side, Math.sin(kk * Math.PI * 3) * 1.6 * (1 - kk) + (ai % 2 ? 0.5 : -0.5) * (1 - kk));
            am.position.copy(ap);
            am.scale.setScalar(sc * (pc.sp === 'ult' ? 1.15 : 1));
            am.visible = kk > 0;
          });
          // 번개 줄기
          if (pc.bolt) {
            const arr = (pc.bolt.geometry.attributes['position'] as THREE.BufferAttribute).array as Float32Array;
            for (let q = 0; q < 24; q++) {
              const u = q / 23;
              const v = pc.from.clone().lerp(a, u);
              if (q > 0 && q < 23) v.addScaledVector(side, (Math.random() - 0.5) * 0.9).addScaledVector(up, (Math.random() - 0.5) * 0.9);
              arr.set([v.x, v.y, v.z], q * 3);
            }
            pc.bolt.geometry.attributes['position']!.needsUpdate = true;
            pc.bolt.visible = Math.random() < 0.8;
          }
          // 입자
          if (k > 0.12) {
            if (pc.sp === 'fire') this.emit(a, Math.random() < 0.5 ? 0xffb02a : 0xff4a1a, 6, 1.0, 0.5, 3.5, dir.clone().multiplyScalar(-2.5));
            if (pc.sp === 'bolt') this.emit(a, 0xd8f4ff, 4, 3.0, 0.28, -2);
            if (pc.sp === 'ghost') this.emit(a, 0x9a5aff, 4, 0.8, 0.6, 0.6);
            if (pc.sp === 'twist') this.emit(a, 0x4af0e0, 5, 2.0, 0.45, 0, side.clone().multiplyScalar(2));
            if (pc.sp === 'ult') this.emit(a, 0xffffff, 10, 2.2, 0.7, 0.5, dir.clone().multiplyScalar(-3.5));
          }
          this.streak(sid, pc.from, a, Math.min(0.999, e), pc.kind === 'S' ? col : pc.kind === 'B' ? 0xffe070 : 0x9aa4b8);
          continue;
        }
        if (!pc.hit) {
          pc.hit = true;
          this.streak(sid, null, null, 1);
          if (pc.kind === 'X') {
            // 헛공 — 땅에 툭 · 회색 먼지 · 한 번 튀고 사라짐
            this.boom(pc.to, 1.4, 0x8a92a8, 0.5);
            this.tag(pc.to.clone().add(new THREE.Vector3(0, 1.2, 0)), '…', 'X');
          } else {
            pc.m.visible = false;
            const S = pc.kind === 'S';
            if (p) {
              if (S) p.litS = Math.max(p.litS, pc.q + 1);
              else p.litB = Math.max(p.litB, pc.q + 1);
            }
            this.paintBoard();
            pc.after.forEach((am) => (am.visible = false));
            if (pc.bolt) pc.bolt.visible = false;
            const col = pc.sp ? SPECIAL_COL[pc.sp] : 0xffd84a;
            this.boom(pc.to, S ? (pc.sp === 'ult' ? 3.2 : 2.2) : 1.5, S ? col : 0xffd84a, S ? 0.55 : 0.4);
            if (S) this.boom(pc.to, 1.2, 0xffffff, 0.22);
            if (S) this.emit(pc.to, pc.sp === 'ult' ? 0xffffff : col, pc.sp === 'ult' ? 140 : 50, pc.sp === 'ult' ? 7 : 4.5, 0.85, -3);
            this.tag(pc.to.clone().add(new THREE.Vector3(0, 0.9, 0)), S ? $t('스트라이크!') : $t('볼!'), pc.kind, S && thr.s === thr.n);
            this.shake = Math.max(this.shake, S ? 0.3 + pc.q * 0.08 : 0.12);
            this.bulbFlash = S ? 0.35 : 0.18;
            if (S) {
              this.punch = Math.max(this.punch, 0.5 + pc.q * 0.25);
              if (thr.s === thr.n && pc.q === thr.n - 1) this.flashScreen(false);
            }
          }
        }
        if (pc.kind === 'X') {
          // 튀고 굴러가다 사라진다
          const b2 = Math.min(1, (thr.t - pc.t0 - pc.dur) / 0.45);
          pc.m.position.set(pc.to.x + b2 * 1.2, pc.to.y + Math.sin(b2 * Math.PI) * 0.7, pc.to.z + b2 * 0.4);
          pc.m.visible = b2 < 1;
        }
      }
      if (p) this.paintBoard();
      if (!thr.shown && thr.t >= thr.resultAt) {
        thr.shown = true;
        if (p) p.done = true;
        this.paintBoard();
        const hr = thr.s === thr.n;
        const out = thr.s + thr.b === 0;
        this.showComic(hr ? 'hr' : out ? 'out' : 'hit', hr ? $t('홈런!') : out ? $t('아웃!') : $t('{0} 스트라이크  {1} 볼', { 0: thr.s, 1: thr.b }));
        this.speed.className = `nb-speed on burst${hr ? ' gold rainbow' : ''}`;
        this.shake = hr ? 0.65 : out ? 0.3 : 0.22;
        this.punch = hr ? 1.8 : 0.8;
        if (hr) {
          // 3 스트라이크 — 금빛 번쩍 · 폭죽 여러 발 · 꽃가루 · 관중 플래시 · 전구 빠르게
          this.flashScreen(true);
          this.confetti();
          this.fever = 3.5;
          const bp = this.boardGrp.position;
          for (let k = 0; k < 7; k++) this.firework(new THREE.Vector3(bp.x + (Math.random() - 0.5) * 18, bp.y + 2 + Math.random() * 6, BOARD_Z - 2 - Math.random() * 4));
          for (let k = 0; k < 2; k++) window.setTimeout(() => this.flashScreen(false), 350 + k * 380);
        }
      }
      if (thr.t >= thr.end) {
        for (const pc of thr.pitches) {
          this.scene.remove(pc.m);
          pc.mat.dispose();
          for (const am of pc.after) {
            this.scene.remove(am);
            (am.material as THREE.Material).dispose();
          }
          if (pc.bolt) {
            this.scene.remove(pc.bolt);
            pc.bolt.geometry.dispose();
            (pc.bolt.material as THREE.Material).dispose();
          }
        }
        this.rainbow = false;
        this.thr = null;
        this.hideComic();
      }
    }

    // 빈 칸 — 빛 고리 · ? (공이 앉으면 숨김)
    this.ghosts.forEach((gh, k) => {
      const sp = this.slotPos(k, n);
      const busy = this.balls.some((b) => b.g.visible && b.to.distanceTo(sp) < 0.05);
      gh.q.visible = !busy;
      // 공이 앉으면 유리 · 색 배경을 감춘다 (커진 공이 구슬을 채우고, 유리 막에 탁해지지 않게)
      for (const o of gh.glass) o.visible = !busy;
      const pulse = busy ? 1 : 1 + Math.sin(t * 3 + k) * 0.06;
      gh.ring.scale.setScalar(pulse);
      gh.ring.rotation.z = t * 0.5;
      (gh.ring.material as THREE.MeshBasicMaterial).opacity = busy ? 0.45 : 0.55 + Math.sin(t * 3 + k) * 0.3;
      gh.q.position.y = SLOT_Y + Math.sin(t * 2 + k) * 0.08;
    });

    // 전구 — 천천히 돌아가다 던질 때 · 이길 때 빠르게
    this.fever = Math.max(0, this.fever - dt);
    const fast = this.fever > 0 ? 30 : thr || this.won ? 18 : 4;
    this.bulbFlash = Math.max(0, this.bulbFlash - dt);
    if (this.bulbs) {
      const b = this.bulbs;
      for (let k = 0; k < b.count; k++) {
        const on = (Math.floor(t * fast) + k) % 3 === 0 || this.bulbFlash > 0;
        b.setColorAt(k, this.bulbCol.setHex(on ? 0xfff4c0 : 0x8a5a20));
      }
      b.instanceColor!.needsUpdate = true;
    }
    // 서치라이트
    for (const [k, p] of this.beams.entries()) p.rotation.z = (p.userData['a'] as number) + Math.sin(t * (this.fever > 0 ? 4 : 0.5) + k * 1.7) * (this.fever > 0 ? 0.5 : 0.18);
    // 관중 플래시
    if (this.sparkles) {
      const m = this.sparkles.material as THREE.PointsMaterial;
      const want = this.won || this.fever > 0 ? 1 : thr ? 0.5 : 0.18;
      m.opacity += (want * (0.6 + 0.4 * Math.random()) - m.opacity) * follow(10);
      if (Math.random() < chance(this.won || this.fever > 0 ? 40 : 6)) {
        const a = this.sparkles.geometry.attributes['position'] as THREE.BufferAttribute;
        const i = Math.floor(Math.random() * a.count);
        a.setX(i, (Math.random() - 0.5) * 34);
        a.needsUpdate = true;
      }
    }
    // 번쩍
    for (let k = this.flashes.length - 1; k >= 0; k--) {
      const f = this.flashes[k]!;
      f.t += dt;
      const e = f.t / f.life;
      f.s.scale.setScalar(f.size * (0.6 + e * 1.4));
      f.s.material.opacity = Math.max(0, 1 - e);
      f.s.material.rotation = f.t * 2;
      if (e >= 1) {
        this.scene.remove(f.s);
        f.s.material.dispose();
        this.flashes.splice(k, 1);
      }
    }
    // 홈런 — 공이 전광판 너머 하늘로 · 폭죽
    if (this.homer) {
      this.homer.t += dt;
      const k = Math.min(1, this.homer.t / 1.4);
      const f0 = this.homer.from;
      const bx = this.boardGrp.position.x;
      this.homer.m.position.set(f0.x + k * (bx - f0.x + 2), f0.y + Math.sin(k * Math.PI * 0.6) * 14, f0.z + k * (BOARD_Z - 8 - f0.z));
      this.homer.m.rotation.x = -t * 20;
      if (k >= 1) {
        this.boom(this.homer.m.position.clone(), 6);
        this.scene.remove(this.homer.m);
        this.homer = null;
      }
    }
    if (this.won) {
      const wt = t - this.won;
      if (wt > 0.2 && wt < 6 && Math.random() < chance(7)) this.firework(new THREE.Vector3(this.boardGrp.position.x + (Math.random() - 0.5) * 16, this.boardGrp.position.y + 3 + Math.random() * 4, BOARD_Z - 3 - Math.random() * 3));
    }
    for (let k = this.fireworks.length - 1; k >= 0; k--) {
      const f = this.fireworks[k]!;
      f.t += dt;
      const a = f.pts.geometry.attributes['position'] as THREE.BufferAttribute;
      const h = dt / steps;
      for (let i = 0; i < a.count; i++) {
        for (let q = 0; q < steps; q++) {
          f.vel[i * 3 + 1]! -= 2.4 * h;
          a.setXYZ(i, a.getX(i) + f.vel[i * 3]! * h, a.getY(i) + f.vel[i * 3 + 1]! * h, a.getZ(i) + f.vel[i * 3 + 2]! * h);
        }
      }
      a.needsUpdate = true;
      (f.pts.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - f.t / 1.5);
      if (f.t > 1.5) {
        this.scene.remove(f.pts);
        f.pts.geometry.dispose();
        (f.pts.material as THREE.Material).dispose();
        this.fireworks.splice(k, 1);
      }
    }
    for (let q = 0; q < steps; q++) this.stepParts(dt / steps);
    this.hype += ((this.fever > 0 || this.won ? 1.2 : thr ? 0.45 : 0.08) - this.hype) * follow(3);
    this.animCrowd(t, this.hype);
    // 화면 흔들림 · 다가가기(punch)
    this.shake = Math.max(0, this.shake - dt * 1.4);
    this.punch = Math.max(0, this.punch - dt * 1.6);
    const sh = this.shake * this.shake * 2.2;
    const base = this.camBase.clone().addScaledVector(this.camDir, -this.punch * 1.2);
    const want = this.cineWant();
    if (want && this.cineW < 0.02) {
      // 원래 구도에서 출발
      this.cinePos.copy(base);
      this.cineLook.copy(this.camTarget);
    }
    this.cineW += ((want ? 1 : 0) - this.cineW) * follow(want ? 5 : 3);
    if (want) {
      this.cinePos.lerp(want.pos, follow(want.rate));
      this.cineLook.lerp(want.look, follow(want.rate + 4));
    }
    const w = this.cineW * this.cineW * (3 - 2 * this.cineW);
    this.camera.position.lerpVectors(base, this.cinePos, w);
    this.camera.position.x += (Math.random() - 0.5) * sh;
    this.camera.position.y += (Math.random() - 0.5) * sh;
    this.camera.lookAt(new THREE.Vector3().lerpVectors(this.camTarget, this.cineLook, w));
    this.composer.render(dt);
  };
  private bulbFlash = 0;
  private fever = 0;
  private hype = 0;
  /* 입자 — 불꽃 · 불똥 · 연기 · 무지개 (한 덩어리 Points 를 돌려 쓴다) */
  private readonly PN = 1400;
  private pPos = new Float32Array(this.PN * 3);
  private pVel = new Float32Array(this.PN * 3);
  private pCol = new Float32Array(this.PN * 3);
  private pBase = new Float32Array(this.PN * 3);
  private pLife = new Float32Array(this.PN);
  private pMax = new Float32Array(this.PN);
  private pGrav = new Float32Array(this.PN);
  private pHead = 0;
  private parts: THREE.Points | null = null;
  private emit(at: THREE.Vector3, color: number, count: number, speed: number, life: number, grav = 0, base?: THREE.Vector3): void {
    if (!this.parts) {
      const g = this.own(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
      this.parts = new THREE.Points(g, this.own(new THREE.PointsMaterial({ map: this.flashTex, size: 0.42, vertexColors: true, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })));
      this.parts.frustumCulled = false;
      this.parts.renderOrder = 15;
      this.scene.add(this.parts);
    }
    const c = new THREE.Color(color);
    for (let k = 0; k < count; k++) {
      const i = this.pHead;
      this.pHead = (this.pHead + 1) % this.PN;
      this.pPos.set([at.x + (Math.random() - 0.5) * 0.2, at.y + (Math.random() - 0.5) * 0.2, at.z + (Math.random() - 0.5) * 0.2], i * 3);
      const a = Math.random() * Math.PI * 2;
      const b = Math.acos(2 * Math.random() - 1);
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.pVel.set([Math.sin(b) * Math.cos(a) * sp + (base?.x ?? 0), Math.cos(b) * sp + (base?.y ?? 0), Math.sin(b) * Math.sin(a) * sp + (base?.z ?? 0)], i * 3);
      const hsl = { h: 0, s: 0, l: 0 };
      c.getHSL(hsl);
      const cc = color === 0xffffff && this.rainbow ? new THREE.Color().setHSL(Math.random(), 1, 0.6) : new THREE.Color().setHSL(hsl.h + (Math.random() - 0.5) * 0.06, hsl.s, Math.min(1, hsl.l * (0.8 + Math.random() * 0.5)));
      this.pBase.set([cc.r, cc.g, cc.b], i * 3);
      this.pLife[i] = this.pMax[i] = life * (0.6 + Math.random() * 0.6);
      this.pGrav[i] = grav;
    }
  }
  private rainbow = false;
  private stepParts(dt: number): void {
    if (!this.parts) return;
    for (let i = 0; i < this.PN; i++) {
      if (this.pLife[i]! <= 0) {
        this.pCol[i * 3] = this.pCol[i * 3 + 1] = this.pCol[i * 3 + 2] = 0;
        continue;
      }
      this.pLife[i]! -= dt;
      const f = Math.max(0, this.pLife[i]! / this.pMax[i]!);
      this.pVel[i * 3 + 1]! += this.pGrav[i]! * dt;
      const damp = 1 - dt * 1.5;
      for (let a = 0; a < 3; a++) {
        this.pVel[i * 3 + a]! *= damp;
        this.pPos[i * 3 + a]! += this.pVel[i * 3 + a]! * dt;
        this.pCol[i * 3 + a] = this.pBase[i * 3 + a]! * f;
      }
    }
    (this.parts.geometry.attributes['position'] as THREE.BufferAttribute).needsUpdate = true;
    (this.parts.geometry.attributes['color'] as THREE.BufferAttribute).needsUpdate = true;
  }
  /** 필살 기술 이름 컷인 (화면을 가르는 띠) */
  private cutin(sp: Special): void {
    const el = document.createElement('div');
    el.className = `nb-cutin ${sp}`;
    const b = document.createElement('b');
    b.textContent = $t(SPECIAL_NAME[sp]);
    el.appendChild(b);
    this.fx.appendChild(el);
    window.setTimeout(() => el.remove(), sp === 'ult' ? 1300 : 900);
  }

  /** 지금 연출 카메라가 있어야 할 곳 — 없으면 원래 구도 */
  private cineWant(): { pos: THREE.Vector3; look: THREE.Vector3; rate: number } | null {
    const thr = this.thr;
    if (!thr || thr.shown) return null;
    const t = thr.t;
    const UP = new THREE.Vector3(0, 1, 0);
    const P = this.playGrp;
    // ① 숫자 공 셋 — 뒤로 당길 때 공 뒤로, 날아가는 동안 따라가고, 줄에 꽂히면 가까이
    const W0 = 0.38;
    const flyEnd = W0 + (thr.balls.length - 1) * 0.1 + 0.4;
    if (thr.balls.length && t < flyEnd + 0.4) {
      const avg = (vs: THREE.Vector3[]): THREE.Vector3 => vs.reduce((a, v) => a.add(v), new THREE.Vector3()).multiplyScalar(1 / vs.length);
      const st = avg(thr.starts.map((v) => P.localToWorld(v.clone())));
      const to = avg(thr.targets.map((v) => P.localToWorld(v.clone())));
      const dir = to.clone().sub(st).normalize();
      if (t < W0) return { pos: st.clone().addScaledVector(dir, -7.5).addScaledVector(UP, 2.2), look: to, rate: 6 };
      if (!thr.hit.every(Boolean)) {
        const fly = thr.balls.filter((b, j) => !thr.hit[j] && b.g.visible).map((b) => P.localToWorld(b.g.position.clone()));
        const mid = fly.length ? avg(fly) : to;
        return { pos: mid.clone().addScaledVector(dir, -6).addScaledVector(UP, 1.4), look: to, rate: 10 };
      }
      return { pos: to.clone().addScaledVector(dir, -5.2).addScaledVector(UP, 0.6), look: to, rate: 8 };
    }
    // ② 투구 — 공 바로 뒤 같은 축에서 과녁(전광판)을 정면으로: 컷인 동안 출발점 뒤 → 공을 따라 → 꽂히면 확대
    let pc: Pitch | null = null;
    for (const x of thr.pitches) if ((x.sp ? x.cutAt : x.t0) <= t) pc = x;
    if (!pc || pc.kind === 'X') return null;
    const dir = pc.to.clone().sub(pc.from).normalize();
    const end = pc.t0 + pc.dur;
    if (t < pc.t0) return { pos: pc.from.clone().addScaledVector(dir, -5.5).addScaledVector(UP, 1.1), look: pc.to, rate: 6 };
    if (t < end) {
      const b = pc.m.position;
      const back = pc.sp === 'ult' ? 6.2 : 4.8;
      // 변화구는 공 옆으로 휘어도 카메라는 축을 지킨다 (공이 화면에서 휘는 게 보이게)
      const onAxis = pc.from.clone().lerp(pc.to, Math.min(1, b.distanceTo(pc.from) / pc.from.distanceTo(pc.to)));
      const base = pc.kind === 'B' ? onAxis : b.clone();
      return { pos: base.addScaledVector(dir, -back).addScaledVector(UP, 1.0), look: pc.to, rate: 14 };
    }
    if (t < end + 0.5) return { pos: pc.to.clone().addScaledVector(dir, pc.sp === 'ult' ? -6 : -4.2).addScaledVector(UP, 0.5), look: pc.to, rate: 10 };
    return null;
  }

  /** 날아가는 공 뒤 빛꼬리 */
  private streak(j: number, from: THREE.Vector3 | null, at: THREE.Vector3 | null, k: number, color = 0xffffff): void {
    let s = this.streaks[j];
    if (!s) {
      s = new THREE.Mesh(this.geo('streak', () => new THREE.PlaneGeometry(1, 1)), new THREE.MeshBasicMaterial({ map: this.streakTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      s.renderOrder = 6;
      this.scene.add(s);
      this.streaks[j] = s;
    }
    if (!from || !at || k >= 1) {
      s.visible = false;
      return;
    }
    s.visible = true;
    (s.material as THREE.MeshBasicMaterial).color.setHex(color);
    const tail = new THREE.Vector3().lerpVectors(from, at, Math.max(0, 1 - 0.5 / Math.max(0.2, k)));
    const mid = tail.clone().add(at).multiplyScalar(0.5);
    const len = tail.distanceTo(at) + 0.01;
    s.position.copy(mid);
    // 화면 쪽으로 펼친 띠 — 진행 방향(y 축)으로 늘림
    const d = at.clone().sub(tail).normalize();
    s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    s.scale.set(0.9 * (1 - k * 0.5), len, 1);
    (s.material as THREE.MeshBasicMaterial).opacity = 0.85;
  }

  private firework(at: THREE.Vector3): void {
    const n = 80;
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      pos.set([at.x, at.y, at.z], k * 3);
      const a = Math.random() * Math.PI * 2;
      const b = Math.acos(2 * Math.random() - 1);
      const sp = 2.6 + Math.random() * 0.8;
      vel.set([Math.sin(b) * Math.cos(a) * sp, Math.cos(b) * sp, Math.sin(b) * Math.sin(a) * sp], k * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: this.flashTex, color: [0xff5a7a, 0xffd23a, 0x5ab8ff, 0x7ae08a, 0xff9a3a][Math.floor(Math.random() * 5)]!, size: 0.45, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(pts);
    this.fireworks.push({ pts, vel, t: 0 });
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    for (const s of this.streaks) {
      (s.material as THREE.Material).dispose();
    }
    for (const k of this.levelKeep) k.dispose();
    for (const k of this.keep) k.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.fx.remove();
  }
}

/** 만화 별 터짐 모양 (SVG polygon points) */
function burst(spikes: number, outer: number, inner: number): string {
  const pts: string[] = [];
  for (let k = 0; k < spikes * 2; k++) {
    const a = (k / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = k % 2 ? inner : outer * (0.9 + ((k * 37) % 10) / 100);
    pts.push(`${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`);
  }
  return pts.join(' ');
}
function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}
function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - x, 3);
}
function easeInCubic(x: number): number {
  return x * x * x;
}

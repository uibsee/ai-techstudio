import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { makeToonKit } from '@/game/core/toon';
import { pix } from '../sokoban/stage';
import { t as $t } from '@/i18n';
import '../numbaseball/ballfx.css';
import { burstPoints, ParkFx } from './fx';
import { mergeStatic } from '../shared/bake';
import { asphaltTexture, buildGarden, hazardTexture } from './garden';
import { buildToyCar, TOY_LONG, TOY_SHORT, type ToyKind } from './toycars';
import type { Rush } from './logic';

/**
 * 빵빵 주차장 탈출 무대 — 복셀 주차장. 아스팔트 칸 · 흰 주차선 · 노랑검정 경계석 · 오른쪽 출구(차단기) ·
 * 눈 달린 귀여운 자동차와 트럭(앞 유리에 도트 눈) · 둘레 보도블록 인도 · 연석 · 둥근 가로수 · 가로등 · 벤치 · 꽃 화단 · 덤불 · 소화전 · 고깔.
 * 칸 (x, y) → 월드 X = x − (w−1)/2, Z = y − (h−1)/2. 차 모형은 길이 방향이 +X(앞).
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
const ease = (t: number): number => 1 - Math.pow(1 - t, 3);

const COLORS = [0x3a8bff, 0x2fc46a, 0xffb21a, 0xa26bff, 0x24c4d8, 0xff7ab0, 0xf2f2f2, 0x6a7a96, 0xff8a2a, 0x8bd43a, 0x2f5fc4, 0xe0c060];

/**
 * 셰이더 하늘을 구운 환경 반사 (기술 갤러리 u13) — 위는 맑은 하늘빛, 아래는 풀빛, 해 쪽은 따뜻하게.
 * 유광 도장 · 유리 지붕에 하늘이 비쳐 시안처럼 맑고 입체적으로 보인다.
 */
function skyEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const scene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0.55, 0.78, 1.0) },
      hor: { value: new THREE.Color(1.0, 0.97, 0.9) },
      bot: { value: new THREE.Color(0.32, 0.5, 0.22) },
      sun: { value: new THREE.Color(1.0, 0.86, 0.62) },
      sunDir: { value: new THREE.Vector3(-0.55, 0.6, 0.45).normalize() },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 bot; uniform vec3 sun; uniform vec3 sunDir; varying vec3 vP;
void main(){
  vec3 p = normalize(vP);
  vec3 c = p.y > 0.0 ? mix(hor, top, smoothstep(0.0, 0.7, p.y)) : mix(hor * 0.8, bot, smoothstep(0.0, 0.25, -p.y));
  float s = max(dot(p, sunDir), 0.0);
  c += sun * (pow(s, 80.0) * 6.0 + pow(s, 6.0) * 0.5);
  // 하늘에 흰 구름 띠 몇 개 — 도장에 비치는 반짝 줄
  c += vec3(0.5) * smoothstep(0.75, 1.0, sin(atan(p.z, p.x) * 5.0) * 0.5 + 0.5) * smoothstep(0.1, 0.3, p.y) * smoothstep(0.65, 0.35, p.y);
  gl_FragColor = vec4(c, 1.0);
}`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), mat);
  scene.add(sky);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(scene, 0).texture;
  pm.dispose();
  sky.geometry.dispose();
  mat.dispose();
  return tex;
}

export class ParkStage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(24, 1, 0.1, 300);
  private readonly composer: EffectComposer;
  private readonly ao: GTAOPass;
  /** 탈출 연출 (3D 입자 · 리본) */
  private readonly fx3: ParkFx;
  /** 만화 연출 층 (숫자 야구 ballfx.css 를 같이 쓴다) — 집중선 · 번쩍 · 별 터짐 글자 */
  private readonly fxEl: HTMLDivElement;
  private readonly observer: ResizeObserver;
  private readonly keep: Keep[] = [];
  private levelKeep: Keep[] = [];
  private readonly level = new THREE.Group();
  private b: Rush | null = null;
  private free: FreeRect = { x: 0, y: 0, w: 1, h: 1 };
  private readonly tweens: Tween[] = [];
  private raf = 0;
  private last = performance.now();
  readonly cars: THREE.Group[] = [];
  private readonly hits: THREE.Mesh[] = [];
  private gate: THREE.Group | null = null;
  private readonly sel: THREE.Mesh;
  /** 고른 차 둘레 빛 테 (발밑 판은 차에 가려 잘 안 보였다) · 끄는 동안 갈 수 있는 칸 띠 */
  private readonly selFrame = new THREE.Group();
  private readonly lane: THREE.Mesh;
  private readonly hintArrow = new THREE.Group();
  private hintCar = -1;
  /** 부스터 불꽃 크기 (탈출 때 커진다) */
  private boost = 1;
  private selected = -1;
  private readonly labels: THREE.Sprite[] = [];
  private readonly sparks: { pts: THREE.Points; vel: Float32Array; t: number }[] = [];
  private readonly cube = new RoundedBoxGeometry(1, 1, 1, 2, 0.08);
  private readonly sharp = new THREE.BoxGeometry(1, 1, 1);
  private readonly outlineMat = new THREE.MeshBasicMaterial({ color: 0x1c1a2e, side: THREE.BackSide });
  private readonly mats = new Map<string, THREE.Material>();
  private readonly ray = new THREE.Raycaster();
  private readonly hitMat = new THREE.MeshBasicMaterial({ visible: false });
  /** 툰 셰이딩 (2026-10-05 사용자: 숫자 야구의 만화 그림체를 주차장에도) */
  readonly toon = makeToonKit([75, 168, 255], 0x1c1a2e);

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    // 툰 — 가장자리가 또렷한 만화 그림자
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const canvas = this.renderer.domElement;
    Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%', touchAction: 'none' });
    host.appendChild(canvas);
    this.keep.push(this.cube, this.sharp, this.outlineMat, this.hitMat);
    this.scene.background = new THREE.Color(0x86c45a);
    // 환경 반사 — 유광 도장 · 유리 · 크롬에 하늘이 비치게 (기술 갤러리 u13 셰이더 하늘)
    const env = skyEnvironment(this.renderer);
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.55;
    this.keep.push(env);
    // 3점 조명 (기술 갤러리 u14) — 옅은 반구광 + 비스듬한 따뜻한 해 + 뒤 테두리 빛
    this.scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x6a7a4a, 0.95));
    const rim = new THREE.DirectionalLight(0xdff2ff, 0);
    rim.name = 'rim';
    rim.position.set(5, 6, -9);
    this.scene.add(rim);
    const sun = new THREE.DirectionalLight(0xfff0d6, 1.35);
    sun.position.set(-8, 11, -4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 50 });
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // 구석 그늘 (기술 갤러리 i02) — 차 밑 · 차 사이 틈 · 경계석 모서리가 어두워져 입체감
    this.ao = new GTAOPass(this.scene, this.camera, 256, 256);
    this.ao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.5, thickness: 1, scale: 1, samples: 32 });
    this.ao.blendIntensity = 1.0;
    // 지지직 줄이기 — 잡음 고르기를 넉넉히, 그리고 깊이를 다시 그릴 때 유리 · 반투명 · 빛 판은 숨긴다
    // (유리 · 지붕 등 같은 반투명이 깊이에 들어가면 그 둘레가 매 장면 다르게 얼룩진다)
    this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 10, rings: 2, samples: 24 });
    {
      const orig = this.ao.render.bind(this.ao);
      this.ao.render = ((...args: Parameters<GTAOPass['render']>) => {
        const hidden: THREE.Object3D[] = [];
        this.scene.traverseVisible((o) => {
          const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
          if (o instanceof THREE.Sprite || o instanceof THREE.Points || (m && !Array.isArray(m) && (m.transparent || m.blending === THREE.AdditiveBlending))) hidden.push(o);
        });
        for (const o of hidden) o.visible = false;
        // 그림자 지도는 앞 RenderPass 가 이번 프레임에 이미 만들었다 — 법선을 다시 그릴 때 또 만들지 않는다 (화면 같음)
        const sm = this.renderer.shadowMap;
        const auto = sm.autoUpdate;
        sm.autoUpdate = false;
        orig(...args);
        sm.autoUpdate = auto;
        for (const o of hidden) o.visible = true;
      }) as GTAOPass['render'];
    }
    this.composer.addPass(this.ao);
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(512, 512), 0.3, 0.4, 1.6));
    this.composer.addPass(new OutputPass());
    // 계단 줄이기 (기술 갤러리 i04) — 후처리를 쓰면 기본 안티앨리어싱이 꺼진다
    this.composer.addPass(new SMAAPass());
    // 고른 차 발밑 — 하늘빛 테
    this.sel = new THREE.Mesh(this.own(new RoundedBoxGeometry(1, 0.04, 1, 2, 0.02)), this.own(new THREE.MeshBasicMaterial({ color: 0x5fe0ff, transparent: true, opacity: 0.75 })));
    this.sel.visible = false;
    const frameMat = this.own(new THREE.MeshBasicMaterial({ color: 0x7ff0ff, toneMapped: false }));
    const barGeo = this.own(new THREE.BoxGeometry(1, 1, 1));
    for (let k = 0; k < 4; k++) {
      const bar = new THREE.Mesh(barGeo, frameMat);
      bar.name = `bar${k}`;
      this.selFrame.add(bar);
    }
    this.selFrame.visible = false;
    this.lane = new THREE.Mesh(this.own(new THREE.PlaneGeometry(1, 1)), this.own(new THREE.MeshBasicMaterial({ color: 0x5fe0ff, transparent: true, opacity: 0.32, depthWrite: false })));
    this.lane.rotation.x = -Math.PI / 2;
    this.lane.visible = false;
    this.scene.add(this.level, this.sel, this.selFrame, this.lane, this.hintArrow);
    this.fx3 = new ParkFx(this.scene);
    this.fxEl = document.createElement('div');
    this.fxEl.className = 'nb-fx';
    this.fxEl.innerHTML = '<div class="nb-speed"></div><div class="nb-flash"></div><div class="nb-comic"></div>';
    host.appendChild(this.fxEl);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    this.raf = requestAnimationFrame(this.loop);
  }

  private own<T extends Keep>(t: T): T {
    this.keep.push(t);
    return t;
  }

  private mat(color: number, opts: THREE.MeshStandardMaterialParameters = {}): THREE.Material {
    const k = color + JSON.stringify(opts);
    let m = this.mats.get(k);
    if (!m) {
      m = this.own(new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...opts }));
      this.mats.set(k, m);
    }
    return m;
  }

  /** 블록 하나 (외곽선 있음) */
  private box(parent: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material | number, x: number, y: number, z: number, line = true, geo = this.cube): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, typeof m === 'number' ? this.mat(m) : m);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (line) {
      const o = new THREE.Mesh(geo, this.outlineMat);
      const t = this.toonOn ? 0.045 : 0.025;
      o.scale.set(1 + (2 * t) / w, 1 + (2 * t) / h, 1 + (2 * t) / d);
      o.userData['__boxInk'] = [w, h, d];
      mesh.add(o);
    }
    parent.add(mesh);
    return mesh;
  }

  /* ───────────── 자동차 ───────────── */

  /* ───────────── 판 ───────────── */

  cellX(x: number): number {
    return x - (this.b!.w - 1) / 2;
  }
  cellZ(y: number): number {
    return y - (this.b!.h - 1) / 2;
  }

  /** 차 i 를 연속 위치 p(앞쪽 칸 번호)에 놓는다 */
  setCarPos(i: number, p: number): void {
    const c = this.b!.cars[i]!;
    const g = this.cars[i]!;
    const mid = p + (c.len - 1) / 2;
    if (c.horiz) g.position.set(this.cellX(mid), 0, this.cellZ(c.fixed));
    else g.position.set(this.cellX(c.fixed), 0, this.cellZ(mid));
    if (i === this.selected) this.placeSel();
  }

  setBoard(b: Rush, pos: readonly number[]): void {
    this.b = b;
    this.tweens.length = 0;
    for (const o of [...this.level.children]) this.level.remove(o);
    for (const k of this.levelKeep) k.dispose();
    this.levelKeep = [];
    this.toon.reset();
    this.cars.length = 0;
    this.hits.length = 0;
    this.selected = -1;
    this.sel.visible = false;
    this.selFrame.visible = false;
    this.lane.visible = false;
    this.hint(-1, 0);
    this.setLabels([]);
    const lk = <T extends Keep>(t: T): T => {
      this.levelKeep.push(t);
      return t;
    };
    let seed = 7 + b.cars.length * 13 + pos.reduce((a, c) => a * 3 + c, 0);
    const r = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // 아스팔트 칸 — 잔 알갱이 · 얼룩 · 살짝 닳은 흰 주차선 (2026-10-05 시안)
    const asphalt = asphaltTexture(lk, true);
    const tile = new THREE.Mesh(lk(new THREE.BoxGeometry(b.w, 0.2, b.h)), lk(new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.9 })));
    asphalt.wrapS = asphalt.wrapT = THREE.RepeatWrapping;
    asphalt.repeat.set(b.w, b.h);
    tile.position.y = -0.1;
    tile.receiveShadow = true;
    this.level.add(tile);
    // 출구 길 — 빨간 차 줄 오른쪽으로 쭉
    const ey = b.cars[0]!.fixed;
    const roadT = asphaltTexture(lk, false);
    roadT.repeat.set(16, 1);
    const road = new THREE.Mesh(lk(new THREE.BoxGeometry(16, 0.2, 1)), lk(new THREE.MeshStandardMaterial({ map: roadT, roughness: 0.9 })));
    road.position.set(b.w / 2 + 8, -0.1, this.cellZ(ey));
    road.receiveShadow = true;
    this.level.add(road);
    for (let k = 0; k < 11; k++) this.box(this.level, 0.5, 0.02, 0.08, 0xfff0a0, b.w / 2 + 1 + k * 1.3, 0.01, this.cellZ(ey), false, this.sharp);
    // 출구 화살표 바닥 그림
    const arrow = new THREE.Shape();
    arrow.moveTo(-0.25, -0.1);
    arrow.lineTo(0.05, -0.1);
    arrow.lineTo(0.05, -0.25);
    arrow.lineTo(0.3, 0);
    arrow.lineTo(0.05, 0.25);
    arrow.lineTo(0.05, 0.1);
    arrow.lineTo(-0.25, 0.1);
    const am = new THREE.Mesh(lk(new THREE.ShapeGeometry(arrow)), this.mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.3 }));
    am.rotation.x = -Math.PI / 2;
    am.position.set(b.w / 2 + 0.6, 0.012, this.cellZ(ey));
    this.level.add(am);
    // 경계석 — 둥근 노랑 · 검정 빗금 블록, 외곽선 없음 (출구 칸은 비움)
    const curb = (x: number, z: number, w: number, d: number): void => {
      const t = hazardTexture(lk);
      t.repeat.set(Math.max(w, d) / 0.9, 1);
      if (d > w) t.rotation = Math.PI / 2;
      const m = new THREE.Mesh(lk(new RoundedBoxGeometry(w, 0.26, d, 3, 0.06)), lk(new THREE.MeshStandardMaterial({ map: t, roughness: 0.55 })));
      m.position.set(x, 0.06, z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.level.add(m);
    };
    const hw = b.w / 2 + 0.15;
    const hh = b.h / 2 + 0.15;
    curb(0, -hh, b.w + 0.6, 0.3);
    curb(0, hh, b.w + 0.6, 0.3);
    curb(-hw, 0, 0.3, b.h);
    const ez = this.cellZ(ey);
    if (ey > 0) curb(hw, (-b.h / 2 + ez - 0.5) / 2, 0.3, ez - 0.5 + b.h / 2);
    if (ey < b.h - 1) curb(hw, (ez + 0.5 + b.h / 2) / 2, 0.3, b.h / 2 - ez - 0.5);
    // 출구 차단기
    this.gate = new THREE.Group();
    this.box(this.gate, 0.22, 0.5, 0.22, 0xffc61a, 0, 0.25, 0, false);
    const arm = new THREE.Group();
    const armStripe = lk(
      pix((p) => {
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p(x, y, Math.floor(x / 4) % 2 ? '#ffffff' : '#ff3a4a');
      }, 1),
    );
    this.box(arm, 1.0, 0.08, 0.08, lk(new THREE.MeshStandardMaterial({ map: armStripe })), 0, 0, 0.5, false).rotation.y = Math.PI / 2;
    arm.position.set(0, 0.45, 0);
    arm.name = 'arm';
    this.gate.add(arm);
    this.gate.position.set(hw + 0.3, 0, ez - 0.55);
    this.level.add(this.gate);
    // 막힌 칸 — 고깔 셋
    for (let i = 0; i < b.w * b.h; i++)
      if (b.wall[i]) {
        const x = this.cellX(i % b.w);
        const z = this.cellZ(Math.floor(i / b.w));
        for (const [dx, dz] of [[-0.2, -0.2], [0.2, -0.1], [0, 0.22]] as const) {
          const cone = new THREE.Mesh(lk(new THREE.ConeGeometry(0.13, 0.4, 8)), this.mat(0xff7a1a));
          cone.position.set(x + dx, 0.2, z + dz);
          cone.castShadow = true;
          this.level.add(cone);
          this.box(this.level, 0.3, 0.04, 0.3, 0xff7a1a, x + dx, 0.02, z + dz, false, this.sharp);
        }
      }
    // 둘레 — 잔디 · 보도블록 인도 · 나무 · 덤불 · 바위 · 화단 · 가로등 · 벤치 · 소화전 (garden.ts)
    buildGarden(this.level, { w: b.w, h: b.h, exitZ: ez, rand: r }, lk);
    // 자동차
    const palette = [...COLORS].sort(() => r() - 0.5);
    // 차 종류 — 같은 판에서 겹치지 않게 돌려 쓴다
    const shorts = [...TOY_SHORT].sort(() => r() - 0.5);
    const longs = [...TOY_LONG].sort(() => r() - 0.5);
    let si = 0;
    let li = 0;
    b.cars.forEach((c, i) => {
      const hero = i === 0;
      const kind: ToyKind = hero ? 'sports' : c.len === 2 ? shorts[si++ % shorts.length]! : longs[li++ % longs.length]!;
      // 장난감 차 (2026-10-05 사용자 시안 — 반짝이는 장난감 차, 예전 블록 차는 cars.ts)
      const car = buildToyCar(kind, c.len, lk, palette[i % palette.length]);
      // 차 안 고정된 부품 합치기 (화질 그대로 — shared/bake.ts). 이름 붙은 바퀴 · 눈 · 경광등 등은 그대로 움직인다
      mergeStatic(car, lk);
      // 바퀴는 통째로만 돈다 — 바퀴 안 부품(타이어 · 휠 · 볼트)을 바퀴 하나로
      car.traverse((o) => {
        if (o.name === 'wheel' && o.children.length > 1) mergeStatic(o, lk);
      });
      car.userData['kind'] = kind;
      const wrap = new THREE.Group();
      // 가로 차는 오른쪽 · 왼쪽 아무 쪽이나, 세로 차는 위 · 아래 (주인공은 출구 쪽)
      car.rotation.y = c.horiz ? (hero || r() < 0.5 ? 0 : Math.PI) : r() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
      wrap.add(car);
      const hit = new THREE.Mesh(this.sharp, this.hitMat);
      // 판정 높이 = 차의 실제 높이 (소방차 · 캠핑카 · 지프 지붕 끝을 눌러도 잡히게)
      car.updateMatrixWorld(true);
      const top = Math.min(2, Math.max(0.9, new THREE.Box3().setFromObject(car).max.y));
      hit.scale.set(c.horiz ? c.len : 1, top + 0.1, c.horiz ? 1 : c.len);
      hit.position.y = (top - 0.1) / 2;
      hit.userData['car'] = i;
      wrap.add(hit);
      this.level.add(wrap);
      this.cars.push(wrap);
      this.hits.push(hit);
      this.setCarPos(i, pos[i]!);
    });
    // 둘레 · 판의 고정된 물체 합치기 (차 묶음은 userData 가 있어 빠진다)
    for (const w of this.cars) w.userData['dynamic'] = true;
    mergeStatic(this.level, lk);
    this.toon.toonify(this.level, { outline: 0.04, minSize: 0.12 });
    if (!this.toonOn) this.setToon(false);
    this.fit();
  }

  /** 툰 켜기/끄기 — 끄면 예전 그림체(ACES 톤 매핑 · 센 빛 · 일반 재질). 기술 스튜디오 비교용 */
  private toonOn = false; // 2026-10-05 사용자 시안(유광 장난감 차)에 맞춰 끔
  setToon(on: boolean): void {
    this.toonOn = on;
    this.toon.setEnabled(this.level, on);
    // 상자 외곽선도 툰이면 굵게
    this.level.traverse((o) => {
      const s = o.userData['__boxInk'] as number[] | undefined;
      if (!s) return;
      const t = on ? 0.045 : 0.025;
      o.scale.set(1 + (2 * t) / s[0]!, 1 + (2 * t) / s[1]!, 1 + (2 * t) / s[2]!);
    });
    this.renderer.toneMapping = on ? THREE.NoToneMapping : THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = on ? 1 : 1.05;
    this.ao.enabled = !on;
    this.scene.traverse((o) => {
      if ((o as THREE.HemisphereLight).isHemisphereLight) (o as THREE.HemisphereLight).intensity = on ? 0.95 : 0.5;
      else if ((o as THREE.DirectionalLight).isDirectionalLight) (o as THREE.DirectionalLight).intensity = o.name === 'rim' ? (on ? 0 : 1.2) : on ? 1.35 : 3.4;
    });
  }

  /* ───────────── 고르기 · 힌트 · 글씨 ───────────── */

  select(i: number): void {
    this.selected = i;
    this.sel.visible = i >= 0;
    this.selFrame.visible = i >= 0;
    this.placeSel();
  }

  private placeSel(): void {
    if (this.selected < 0 || !this.b) return;
    const c = this.b.cars[this.selected]!;
    const g = this.cars[this.selected]!;
    this.sel.scale.set(c.horiz ? c.len - 0.02 : 0.98, 1, c.horiz ? 0.98 : c.len - 0.02);
    this.sel.position.set(g.position.x, 0.015, g.position.z);
    // 둘레 빛 테 — 칸 테두리를 따라 낮은 울타리처럼 (차 사이 틈으로 또렷하게 보인다)
    const sx = (c.horiz ? c.len : 1) - 0.04;
    const sz = (c.horiz ? 1 : c.len) - 0.04;
    const T = 0.07;
    const H = 0.16;
    const bars = this.selFrame.children;
    bars[0]!.scale.set(sx, H, T);
    bars[0]!.position.set(0, H / 2, -sz / 2);
    bars[1]!.scale.set(sx, H, T);
    bars[1]!.position.set(0, H / 2, sz / 2);
    bars[2]!.scale.set(T, H, sz);
    bars[2]!.position.set(-sx / 2, H / 2, 0);
    bars[3]!.scale.set(T, H, sz);
    bars[3]!.position.set(sx / 2, H / 2, 0);
    this.selFrame.position.set(g.position.x, 0, g.position.z);
  }

  /** 끄는 동안 — 차 i 가 갈 수 있는 칸(앞쪽 칸 lo ~ hi)을 하늘빛 띠로. i < 0 이면 숨김 */
  showRange(i: number, lo = 0, hi = 0): void {
    if (i < 0 || !this.b) {
      this.lane.visible = false;
      return;
    }
    const c = this.b.cars[i]!;
    const lim = c.horiz ? this.b.w : this.b.h;
    const a = Math.max(0, lo);
    const z = Math.min(lim - 1, hi + c.len - 1);
    const mid = (a + z) / 2;
    const len = z - a + 1 - 0.08;
    if (c.horiz) {
      this.lane.scale.set(len, 0.92, 1);
      this.lane.position.set(this.cellX(mid), 0.02, this.cellZ(c.fixed));
    } else {
      this.lane.scale.set(0.92, len, 1);
      this.lane.position.set(this.cellX(c.fixed), 0.02, this.cellZ(mid));
    }
    this.lane.visible = true;
  }

  /** 힌트 — 차 위에 통통 튀는 화살표 (dir +1 = 오른쪽/아래, −1 = 왼쪽/위) */
  hint(i: number, dir: number): void {
    for (const c of [...this.hintArrow.children]) this.hintArrow.remove(c);
    this.hintCar = i;
    if (i < 0 || !this.b) return;
    const c = this.b.cars[i]!;
    const m = this.mat(0x3fd0ff, { emissive: 0x20b0ff, emissiveIntensity: 1.2 });
    const shaft = new THREE.Mesh(this.sharp, m);
    shaft.scale.set(0.5, 0.08, 0.14);
    const head = new THREE.Mesh(this.own(new THREE.ConeGeometry(0.2, 0.3, 4)), m);
    head.rotation.z = -Math.PI / 2;
    head.position.x = 0.35;
    this.hintArrow.add(shaft, head);
    this.hintArrow.rotation.y = c.horiz ? (dir > 0 ? 0 : Math.PI) : dir > 0 ? -Math.PI / 2 : Math.PI / 2;
  }

  setLabels(list: { car: number; text: string; color: string }[]): void {
    for (const sp of this.labels) {
      this.scene.remove(sp);
      sp.material.map?.dispose();
      sp.material.dispose();
    }
    this.labels.length = 0;
    for (const { car, text, color } of list) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d')!;
      g.fillStyle = color;
      g.strokeStyle = '#1c1a2e';
      g.lineWidth = 6;
      g.beginPath();
      g.arc(32, 32, 26, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = '#ffffff';
      g.font = '900 34px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, 32, 35);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
      sp.renderOrder = 5;
      sp.scale.setScalar(0.5);
      sp.userData['car'] = car;
      this.scene.add(sp);
      this.labels.push(sp);
    }
  }

  pickCar(clientX: number, clientY: number): number {
    this.setRay(clientX, clientY);
    this.scene.updateMatrixWorld();
    const h = this.ray.intersectObjects(this.hits, false)[0];
    return h ? (h.object.userData['car'] as number) : -1;
  }

  private setRay(clientX: number, clientY: number): void {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), this.camera);
  }

  /** 화면 점 → 판 위(y = 0.4) 점의 칸 좌표 (x, y) */
  groundCell(clientX: number, clientY: number): { x: number; y: number } | null {
    this.setRay(clientX, clientY);
    const t = (0.4 - this.ray.ray.origin.y) / this.ray.ray.direction.y;
    if (!(t > 0) || !this.b) return null;
    const p = this.ray.ray.at(t, new THREE.Vector3());
    return { x: p.x + (this.b.w - 1) / 2, y: p.z + (this.b.h - 1) / 2 };
  }

  /* ───────────── 움직임 ───────────── */

  get busy(): boolean {
    return this.tweens.length > 0;
  }

  slide(i: number, from: number, to: number, done?: () => void): void {
    this.tweens.push({
      t0: performance.now(),
      dur: 0.12 + Math.abs(to - from) * 0.05,
      step: (k) => this.setCarPos(i, from + (to - from) * ease(k)),
      done: () => {
        this.setCarPos(i, to);
        done?.();
      },
    });
  }

  /**
   * 탈출 (2026-10-05 다시) — ① 시동: 차가 부르르 떨며 앞을 들고, 배기구 뭉게 연기 · 뒷바퀴 헛돌기, 차단기가 통통 튀며 올라감
   * ② 출발: 집중선 · 차가 늘어나듯 튀어 나감 · 미등 빨간 빛꼬리 리본 · 옆으로 스치는 속도선 · 흙먼지
   * ③ 차단기를 지나는 순간: 색종이 터짐 · 반짝 별 · 바닥 충격파 고리 · 화면 번쩍 + 흔들림 · 「탈출!」 만화 글자
   */
  driveOut(done: () => void): void {
    const g = this.cars[0]!;
    const car = g.children[0]!;
    const x0 = g.position.x;
    const z0 = g.position.z;
    const L = this.b!.cars[0]!.len - 0.12;
    const gateX = this.gate ? this.gate.position.x : this.b!.w / 2 + 0.45;
    const arm = this.gate?.getObjectByName('arm');
    const cam0 = this.camera.position.clone();
    const spinWheels = (sp: number): void => car.traverse((o) => o.name === 'wheel' && (o.rotation.z -= sp));
    const fx = this.fx3;
    const speedEl = this.fxEl.querySelector<HTMLElement>('.nb-speed')!;
    const flashEl = this.fxEl.querySelector<HTMLElement>('.nb-flash')!;
    const comic = this.fxEl.querySelector<HTMLElement>('.nb-comic')!;
    let puffT = 0;
    // ① 시동
    this.tweens.push({
      t0: performance.now(),
      dur: 0.8,
      step: (k) => {
        const sh = 0.012 + k * 0.02;
        g.position.set(x0 + (Math.random() - 0.5) * sh, Math.random() * sh * 0.6, z0 + (Math.random() - 0.5) * sh * 0.6);
        car.rotation.z = Math.sin(Math.min(1, k * 1.4) * Math.PI * 0.5) * 0.06 + Math.sin(k * 60) * 0.006;
        if (arm) {
          // 통통 튀며 올라가는 차단기 (넘쳤다 돌아옴)
          const a = Math.min(1, k * 1.7);
          arm.rotation.x = -(1 - Math.cos(a * Math.PI * 0.5)) * 1.45 * (1 + Math.sin(a * Math.PI) * 0.15);
        }
        spinWheels(0.5 * k);
        if (performance.now() - puffT > 55) {
          puffT = performance.now();
          for (const s of [-1, 1]) fx.smoke(new THREE.Vector3(x0 - L / 2 - 0.08, 0.16, z0 + s * 0.2), new THREE.Vector3(-1.2 - Math.random(), 0.5 + Math.random() * 0.6, s * 0.3), 0.45 + k * 0.35, 0xc4c8d2, 1.1, 0.8);
        }
      },
      done: () => {
        // ② 출발
        speedEl.className = 'nb-speed on burst';
        fx.smoke(new THREE.Vector3(x0 - L / 2 - 0.1, 0.2, z0), new THREE.Vector3(-2.5, 0.8, 0), 0.9, 0xf2f2f2, 1.2, 0.85);
        const tails = [-1, 1].map(() => fx.ribbon(0xff3040, 0.09, 0.4));
        const glow = fx.ribbon(0xffd060, 0.3, 0.3);
        let burst = false;
        let lastX = x0;
        this.tweens.push({
          t0: performance.now(),
          dur: 1.25,
          step: (k) => {
            const e = k * k * (1.6 - 0.6 * k);
            const x = x0 + e * 12;
            const v = (x - lastX) / 0.016;
            lastX = x;
            g.position.set(x, Math.max(0, Math.sin(Math.min(1, k * 3) * Math.PI)) * 0.05, z0);
            // 앞 들림 → 가라앉음, 쭉 늘어남
            car.rotation.z = Math.max(0, 0.08 * (1 - k * 3));
            car.scale.set(1 + Math.min(0.16, k * 0.6) * (1 - k), 1 - Math.min(0.06, k * 0.2) * (1 - k), 1);
            spinWheels(0.9 + k * 1.5);
            // 미등 빛꼬리 · 바닥 빛
            tails.forEach((r, i) => fx.trail(r, new THREE.Vector3(x - L / 2, 0.3, z0 + (i ? 1 : -1) * 0.27)));
            fx.trail(glow, new THREE.Vector3(x - L / 2 + 0.2, 0.03, z0));
            if (Math.random() < 0.7) fx.streak(new THREE.Vector3(x - Math.random() * L, 0.15 + Math.random() * 0.5, z0 + (Math.random() < 0.5 ? -1 : 1) * (0.55 + Math.random() * 0.35)), Math.max(4, v));
            if (Math.random() < 0.5) fx.dust(new THREE.Vector3(x - L / 2 + 0.3, 0.05, z0 + (Math.random() < 0.5 ? -0.32 : 0.32)), 1);
            const sh = burst ? Math.max(0, 0.07 * (1 - (k - 0.25) * 2)) : 0.012;
            this.camera.position.set(cam0.x + (Math.random() - 0.5) * sh, cam0.y + (Math.random() - 0.5) * sh, cam0.z);
            // ③ 차단기를 지나는 순간
            if (!burst && x - L / 2 > gateX) {
              burst = true;
              const at = new THREE.Vector3(gateX + 0.6, 0.6, z0);
              fx.confetti(at, 180, 6);
              fx.stars(at.clone().setY(0.8), 26);
              fx.ring(new THREE.Vector3(gateX + 0.4, 0.04, z0), 3.4);
              fx.ring(new THREE.Vector3(gateX + 0.4, 0.05, z0), 2.0, 0xffffff);
              window.setTimeout(() => fx.confetti(new THREE.Vector3(gateX - 1.4, 0.4, z0 - 0.9), 90, 5), 160);
              window.setTimeout(() => fx.confetti(new THREE.Vector3(gateX - 0.6, 0.4, z0 + 1.0), 90, 5), 300);
              flashEl.className = 'nb-flash';
              void flashEl.offsetWidth;
              flashEl.className = 'nb-flash on';
              comic.className = 'nb-comic hr';
              comic.innerHTML = `<svg viewBox="-100 -100 200 200" aria-hidden="true"><polygon points="${burstPoints(22, 98, 64)}"/><polygon class="in" points="${burstPoints(22, 80, 54)}"/></svg><b></b>`;
              comic.querySelector('b')!.textContent = $t('탈출!');
              void comic.offsetWidth;
              comic.classList.add('on');
            }
          },
          done: () => {
            this.camera.position.copy(cam0);
            car.rotation.z = 0;
            car.scale.set(1, 1, 1);
            tails.forEach((r) => (r.live = false));
            glow.live = false;
            speedEl.className = 'nb-speed';
            window.setTimeout(() => {
              comic.className = 'nb-comic';
            }, 900);
            done();
          },
        });
      },
    });
  }

  flush(): void {
    for (let g = 0; this.tweens.length && g < 200; g++) {
      const t = this.tweens.shift()!;
      t.step(1);
      t.done?.();
    }
  }

  /* ───────────── 화면 맞춤 ───────────── */

  setFree(rect: FreeRect): void {
    this.free = rect;
    this.fxEl.style.setProperty('--cx', `${rect.x + rect.w / 2}px`);
    this.fxEl.style.setProperty('--cy', `${rect.y + rect.h / 2}px`);
    this.fxEl.style.setProperty('--fw', `${rect.w}px`);
    this.fxEl.style.setProperty('--fh', `${rect.h}px`);
    this.fit();
  }

  private resize(): void {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (w <= 0 || h <= 0) return;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.fit();
  }

  private fit(): void {
    const W = this.host.clientWidth;
    const H = this.host.clientHeight;
    if (W <= 0 || H <= 0 || !this.b) return;
    const pitch = THREE.MathUtils.degToRad(58);
    this.camera.aspect = W / H;
    this.camera.updateProjectionMatrix();
    const f = this.free;
    const sx = (f.x + f.w / 2 - W / 2) / (W / 2);
    const sy = -(f.y + f.h / 2 - H / 2) / (H / 2);
    const hx = this.b.w / 2 + 0.5;
    const hz = this.b.h / 2 + 0.4;
    const corners: THREE.Vector3[] = [];
    for (const x of [-hx, hx + 0.9]) for (const z of [-hz, hz]) for (const y of [0, 1.0]) corners.push(new THREE.Vector3(x, y, z));
    const dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
    const target = new THREE.Vector3(0.4, 0, 0.2);
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
    // 차들이 살짝 숨쉬듯 (부르릉) · 부품마다 움직임
    this.cars.forEach((g, i) => {
      const car = g.children[0]!;
      car.traverse((o) => {
        if (!o.name) return;
        if (o.name === 'siren') ((o as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = Math.sin(t * 10 + (o.position.z > 0 ? Math.PI : 0)) > 0 ? 2.4 : 0.15;
        else if (o.name === 'glow') {
          const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
          m.emissiveIntensity = 1.1 + Math.sin(t * 4) * 0.6;
        } else if (o.name === 'eye' || o.name === 'wink') {
          // 깜빡 — 차마다 다른 때에
          const ph = (t * 0.7 + i * 0.37) % 4;
          o.scale.y = ph < 0.12 ? 0.15 : 1;
        } else if (o.name === 'flame') {
          const f = this.boost * (0.85 + Math.random() * 0.3);
          o.scale.set(f, 0.8 + this.boost * 0.25, 0.8 + this.boost * 0.25);
        } else if (o.name === 'orbit') o.rotation.y = t * 1.1;
        else if (o.name === 'twinkle') o.scale.setScalar(1.1 + Math.sin(t * 6 + o.position.x * 3) * 0.5);
        else if (o.name === 'driver') o.rotation.y = Math.sin(t * 1.3) * 0.35;
        else if (o.name === 'wobble') o.rotation.z = Math.sin(t * 3 + i) * 0.12;
        else if (o.name === 'spin') o.rotation.z = -Math.PI / 2 + t * 1.5;
        else if (o.name === 'bounce') o.position.y = (o.userData['y0'] ??= o.position.y) + Math.abs(Math.sin(t * 5 + i)) * 0.05;
      });
      car.position.y = i === this.selected ? 0.04 + Math.abs(Math.sin(t * 6)) * 0.03 : Math.max(0, Math.sin(t * 9 + i * 2)) * 0.006;
    });
    if (this.selected >= 0) {
      (this.sel.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(t * 5) * 0.2;
      this.selFrame.scale.y = 0.8 + Math.abs(Math.sin(t * 5)) * 0.4;
    }
    if (this.hintCar >= 0) {
      const g = this.cars[this.hintCar]!;
      this.hintArrow.position.set(g.position.x, 1.2 + Math.abs(Math.sin(t * 5)) * 0.2, g.position.z);
    }
    for (const sp of this.labels) {
      const g = this.cars[sp.userData['car'] as number];
      if (g) sp.position.set(g.position.x, 1.15, g.position.z);
    }
    for (let k = this.sparks.length - 1; k >= 0; k--) {
      const s = this.sparks[k]!;
      s.t += dt;
      const a = s.pts.geometry.attributes['position'] as THREE.BufferAttribute;
      for (let i = 0; i < a.count; i++) {
        s.vel[i * 3 + 1]! -= 7 * dt;
        a.setXYZ(i, a.getX(i) + s.vel[i * 3]! * dt, Math.max(0.05, a.getY(i) + s.vel[i * 3 + 1]! * dt), a.getZ(i) + s.vel[i * 3 + 2]! * dt);
      }
      a.needsUpdate = true;
      (s.pts.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - s.t / 1.2);
      if (s.t > 1.2) {
        this.scene.remove(s.pts);
        s.pts.geometry.dispose();
        (s.pts.material as THREE.Material).dispose();
        this.sparks.splice(k, 1);
      }
    }
    this.fx3.update(dt);
    this.composer.render(dt);
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    for (const k of this.levelKeep) k.dispose();
    for (const k of this.keep) k.dispose();
    this.toon.dispose();
    this.fx3.dispose();
    this.fxEl.remove();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

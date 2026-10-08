import * as THREE from 'three';
import { createWater, pebbleCanvas } from './snap/riverWater';
import { bodyWaterMaterial, flowMaterial, poolMaterial } from '@/game/games/shared/storybook';
import type { Control, DemoMap, Scene3D } from './types';

/**
 * 셰이더 · 화려한 효과(VFX) 견본 — 물 셰이더(우리 게임에서 쓰는 것) · 불 · 번개 · SDF · 충격파 · 방패 · 포털 · 궤적.
 * 비교가 어울리는 견본은 화면을 반씩 나눠(scissor) 「기술 없음 ↔ 있음」을 나란히 보여 준다.
 */

/* ───────────── 공통 도구 ───────────── */

const NOISE2 = /* glsl */ `
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){ float v = 0.0; float a = 0.5; for (int k = 0; k < 4; k++){ v += noise(p) * a; p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
`;

const NOISE3 = /* glsl */ `
float hash3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise3(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float fbm3(vec3 p){ float v = 0.0; float a = 0.5; for (int k = 0; k < 4; k++){ v += a * noise3(p); p = p * 2.02 + vec3(3.1, 1.7, 5.3); a *= 0.5; } return v; }
`;

const FSQ_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/** 화면 가득 사각형 하나 + 셰이더 (레이마칭 · 2D 셰이더 · 후처리) */
function fsq(frag: string, uniforms: Record<string, THREE.IUniform>): { scene: THREE.Scene; camera: THREE.OrthographicCamera; mat: THREE.ShaderMaterial; dispose(): void } {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geo = new THREE.PlaneGeometry(2, 2);
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: FSQ_VERT, fragmentShader: frag, depthTest: false, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return {
    scene,
    camera,
    mat,
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

function gradTex(stops: [number, string][]): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 256);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

type Disposable = { dispose(): void };
function freeAll(...roots: THREE.Object3D[]): void {
  for (const root of roots)
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const raw = (m as unknown as { material?: THREE.Material | THREE.Material[] }).material;
      const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
      for (const x of list) {
        const mm = x as unknown as Record<string, unknown>;
        for (const k of ['map', 'emissiveMap']) (mm[k] as Disposable | undefined)?.dispose();
        x.dispose();
      }
    });
}

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/** 화면 위 이름표 (작은 둥근 띠 글씨) — 3D 장면 위에 덧그린다 */
class Tags {
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
  private items: { spr: THREE.Sprite; mat: THREE.SpriteMaterial; tex: THREE.CanvasTexture | null; text: string; aspect: number; tone: string }[] = [];
  private alive = true;
  constructor(texts: string[], tones: string[] = []) {
    texts.forEach((t, i) => {
      const mat = new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
      const spr = new THREE.Sprite(mat);
      const it = { spr, mat, tex: null, text: '', aspect: 1, tone: tones[i] ?? 'rgba(12,18,44,0.66)' };
      this.items.push(it);
      this.scene.add(spr);
      this.paint(it, t);
    });
    void document.fonts?.ready.then(() => {
      if (!this.alive) return;
      for (const it of this.items) {
        const s = it.text;
        it.text = '';
        this.paint(it, s);
      }
    });
  }
  private paint(it: Tags['items'][number], text: string): void {
    if (it.text === text) return;
    it.text = text;
    const fs = 40;
    const H = 66;
    const font = `700 ${fs}px "Pretendard Variable", Pretendard, system-ui, sans-serif`;
    const cv = document.createElement('canvas');
    let g = cv.getContext('2d')!;
    g.font = font;
    const tw = Math.ceil(g.measureText(text).width);
    cv.width = tw + 52;
    cv.height = H;
    g = cv.getContext('2d')!;
    g.font = font;
    g.fillStyle = it.tone;
    g.beginPath();
    g.roundRect(2, 2, cv.width - 4, H - 4, (H - 4) / 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = '#fff';
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
  /** pos: 화면 비율 좌표 [x, y] (왼쪽 위 0,0) — 없으면 숨김 */
  draw(r: THREE.WebGLRenderer, w: number, h: number, pos: ([number, number] | null)[]): void {
    this.cam.right = w;
    this.cam.top = h;
    this.cam.updateProjectionMatrix();
    const hp = clamp(h * 0.075, 15, 30);
    this.items.forEach((it, i) => {
      const p = pos[i];
      if (!p) {
        it.spr.visible = false;
        return;
      }
      it.spr.visible = true;
      const wp = hp * it.aspect;
      const x = clamp(p[0] * w, wp / 2 + 4, w - wp / 2 - 4);
      const y = clamp((1 - p[1]) * h, hp / 2 + 4, h - hp / 2 - 4);
      it.spr.position.set(x, y, 0);
      it.spr.scale.set(wp, hp, 1);
    });
    const ac = r.autoClear;
    r.autoClear = false;
    r.setScissorTest(false);
    r.setViewport(0, 0, w, h);
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

/** 화면 반씩 같은 카메라로 두 번 그리기 + 가운데 흰 줄 */
function splitRender(r: THREE.WebGLRenderer, w: number, h: number, cam: THREE.PerspectiveCamera, left: () => void, right: () => void): void {
  const hw = Math.floor(w / 2);
  cam.aspect = hw / h;
  cam.updateProjectionMatrix();
  r.setScissorTest(true);
  r.setViewport(0, 0, hw, h);
  r.setScissor(0, 0, hw, h);
  left();
  r.setViewport(hw, 0, w - hw, h);
  r.setScissor(hw, 0, w - hw, h);
  right();
  // 가운데 줄
  const cc = r.getClearColor(new THREE.Color());
  const ca = r.getClearAlpha();
  r.setScissor(hw - 1, 0, 2, h);
  r.setClearColor(0xffffff, 1);
  r.clear(true, false, false);
  r.setClearColor(cc, ca);
  r.setScissorTest(false);
  r.setViewport(0, 0, w, h);
  cam.aspect = w / h;
  cam.updateProjectionMatrix();
}

function toScreen(v: THREE.Vector3, cam: THREE.Camera): [number, number] {
  const p = v.clone().project(cam);
  return [(p.x + 1) / 2, (1 - p.y) / 2];
}

/** 렌더 타깃 하나 (크기만 맞춰 다시 씀) */
function makeRT(): { get(w: number, h: number): THREE.WebGLRenderTarget; dispose(): void } {
  let rt: THREE.WebGLRenderTarget | null = null;
  return {
    get(w, h) {
      if (!rt) rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
      else if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
      return rt;
    },
    dispose() {
      rt?.dispose();
    },
  };
}

function lights(scene: THREE.Scene, sky = 0xffffff, ground = 0x8aa86a, hemi = 1.0, sunI = 1.7): THREE.DirectionalLight {
  scene.add(new THREE.HemisphereLight(sky, ground, hemi));
  const sun = new THREE.DirectionalLight(0xfff0d6, sunI);
  sun.position.set(-3, 5, 4);
  scene.add(sun);
  return sun;
}

const POST_HEAD = /* glsl */ `uniform sampler2D tScene; uniform vec2 uRes; uniform float uTime; varying vec2 vUv;`;
const POST_TAIL = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

/* ───────────── u22 흐르는 강물 ───────────── */

function riverDemo(): Scene3D {
  const scene = new THREE.Scene();
  const bg = gradTex([
    [0, '#5eaee8'],
    [1, '#d6efff'],
  ]);
  scene.background = bg;
  lights(scene);
  const peb = new THREE.CanvasTexture(pebbleCanvas());
  peb.wrapS = peb.wrapT = THREE.RepeatWrapping;
  const W = createWater(1.3, 3.4, 0, -0.3, peb);
  scene.add(W.surface, W.bed);
  const shaderMat = W.surface.material as THREE.Material;
  const plainMat = new THREE.MeshStandardMaterial({ color: 0x3f8fd2, roughness: 0.35, transparent: true, opacity: 0.88 });
  const grass = new THREE.MeshStandardMaterial({ color: 0x7cc456, roughness: 0.9 });
  const sand = new THREE.MeshStandardMaterial({ color: 0xd9bd84, roughness: 1 });
  const rock = new THREE.MeshStandardMaterial({ color: 0x9a9aa6, roughness: 0.8, flatShading: true });
  const leaf = new THREE.MeshStandardMaterial({ color: 0x3f9d4a, roughness: 0.8, flatShading: true });
  const wood = new THREE.MeshStandardMaterial({ color: 0xa0683a, roughness: 0.8 });
  const world = new THREE.Group();
  for (const s of [-1, 1]) {
    const bank = new THREE.Mesh(new THREE.BoxGeometry(3, 0.6, 7), grass);
    bank.position.set(s * (1.3 + 1.5), -0.17, 0);
    const sl = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 7), sand);
    sl.position.set(s * 1.32, -0.06, 0);
    sl.rotation.z = s * 0.38;
    world.add(bank, sl);
    for (let k = 0; k < 3; k++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14 + k * 0.04), rock);
      r.position.set(s * (1.7 + k * 0.35), 0.15, -1.6 + k * 1.4 + (s > 0 ? 0.6 : 0));
      world.add(r);
      const tr = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.35, 8), wood);
      trunk.position.y = 0.3;
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 7), leaf);
      top.position.y = 0.75;
      tr.add(trunk, top);
      tr.position.set(s * (2.3 + (k % 2) * 0.5), 0.1, -2.5 + k * 1.7);
      world.add(tr);
    }
  }
  const boat = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.16, 1.0), wood);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.16), new THREE.MeshStandardMaterial({ color: 0xf2d39a }));
  seat.position.y = 0.08;
  const kid = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), new THREE.MeshStandardMaterial({ color: 0xff7a6a }));
  kid.position.set(0, 0.2, 0.15);
  boat.add(hull, seat, kid);
  world.add(boat);
  scene.add(world);
  const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
  cam.position.set(2.6, 3.6, 4.6);
  cam.lookAt(0, -0.2, 0.2);
  const tags = new Tags(['일반 재질', '물 셰이더']);
  let split = true;
  return {
    scene,
    camera: cam,
    update(t) {
      const bx = Math.sin(t * 0.45) * 0.6;
      boat.position.set(bx, 0.03 + Math.sin(t * 2.2) * 0.015, 0.4);
      boat.rotation.z = Math.sin(t * 1.7) * 0.05;
      W.update(t, bx);
    },
    render(r, w, h) {
      if (!split) {
        W.surface.material = shaderMat;
        r.render(scene, cam);
        return;
      }
      splitRender(
        r,
        w,
        h,
        cam,
        () => {
          W.surface.material = plainMat;
          r.render(scene, cam);
        },
        () => {
          W.surface.material = shaderMat;
          r.render(scene, cam);
        },
      );
      tags.draw(r, w, h, [
        [0.25, 0.08],
        [0.75, 0.08],
      ]);
    },
    controls: [{ type: 'toggle', label: '반씩 비교', value: true, on: (v) => (split = v) }],
    dispose() {
      W.surface.material = shaderMat;
      W.dispose();
      peb.dispose();
      plainMat.dispose();
      bg.dispose();
      freeAll(world);
      tags.dispose();
    },
  };
}

/* ───────────── u23 물 바닥 빛무늬 (커스틱) ───────────── */

function causticDemo(): Scene3D {
  const scene = new THREE.Scene();
  const bg = gradTex([
    [0, '#7cc6ee'],
    [1, '#e4f6ff'],
  ]);
  scene.background = bg;
  lights(scene, 0xffffff, 0x8899aa, 1.0, 1.4);
  const peb = new THREE.CanvasTexture(pebbleCanvas());
  peb.wrapS = peb.wrapT = THREE.RepeatWrapping;
  const uni = { uTime: { value: 0 }, uOn: { value: 1 }, uAmt: { value: 1 }, uMap: { value: peb } };
  const bedMat = new THREE.ShaderMaterial({
    uniforms: uni,
    vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vW;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `uniform float uTime; uniform float uOn; uniform float uAmt; uniform sampler2D uMap;
      varying vec2 vUv; varying vec3 vW;
      ${NOISE2}
      float caus(vec2 p, float t){
        float a = abs(sin((fbm(p + vec2(t * 0.25, -t * 0.4)) - 0.5) * 18.0));
        float b = abs(sin((fbm(p * 1.3 + vec2(-t * 0.2, t * 0.3) + 3.1) - 0.5) * 18.0));
        return pow(1.0 - min(a, b), 5.0);
      }
      void main(){
        vec3 c = pow(texture2D(uMap, vUv * 2.0).rgb, vec3(2.2));
        vec3 col = c * vec3(0.42, 0.66, 0.74);
        vec2 p = vW.xz * 1.7;
        // 빛 그물 — 빨 · 초 · 파 를 아주 조금씩 어긋나게 (무지개 테두리)
        vec3 cs = vec3(caus(p + vec2(0.012, 0.0), uTime), caus(p, uTime), caus(p - vec2(0.012, 0.0), uTime));
        col += vec3(1.0, 0.98, 0.9) * cs * 1.1 * uAmt * uOn;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const world = new THREE.Group();
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), bedMat);
  bed.rotation.x = -Math.PI / 2;
  bed.position.y = -0.6;
  world.add(bed);
  const stone = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.9 });
  for (const [x, z, sx, sz] of [
    [0, -2.1, 4.4, 0.2],
    [0, 2.1, 4.4, 0.2],
    [-2.1, 0, 0.2, 4.0],
    [2.1, 0, 0.2, 4.0],
  ] as const) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.9, sz), stone);
    m.position.set(x, -0.2, z);
    world.add(m);
  }
  const shell = new THREE.MeshStandardMaterial({ color: 0xff9eb5, roughness: 0.6 });
  const pebM = new THREE.MeshStandardMaterial({ color: 0x8d9aa0, roughness: 0.8, flatShading: true });
  for (let k = 0; k < 6; k++) {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.1 + (k % 3) * 0.05), k % 3 === 0 ? shell : pebM);
    m.position.set(Math.cos(k * 2.1) * 1.3, -0.55, Math.sin(k * 2.1) * 1.2);
    m.scale.y = 0.6;
    world.add(m);
  }
  const fish = new THREE.Group();
  const fbody = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 14), new THREE.MeshStandardMaterial({ color: 0xff8a2a, roughness: 0.4 }));
  fbody.scale.set(1.5, 0.8, 0.6);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.2, 3), new THREE.MeshStandardMaterial({ color: 0xffb04a }));
  tail.rotation.z = Math.PI / 2;
  tail.position.x = -0.32;
  fish.add(fbody, tail);
  world.add(fish);
  const surf = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshStandardMaterial({ color: 0x8fe0f2, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.16, depthWrite: false }));
  surf.rotation.x = -Math.PI / 2;
  surf.position.y = 0.05;
  world.add(surf);
  scene.add(world);
  const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  cam.position.set(0, 4.2, 3.4);
  cam.lookAt(0, -0.6, 0);
  const tags = new Tags(['빛무늬 없음', '커스틱 켬']);
  return {
    scene,
    camera: cam,
    update(t) {
      uni.uTime.value = t;
      const a = t * 0.6;
      fish.position.set(Math.cos(a) * 1.1, -0.25 + Math.sin(t * 2) * 0.04, Math.sin(a) * 0.9);
      fish.rotation.y = -a - Math.PI / 2;
      tail.rotation.x = Math.sin(t * 9) * 0.5;
    },
    render(r, w, h) {
      splitRender(
        r,
        w,
        h,
        cam,
        () => {
          uni.uOn.value = 0;
          r.render(scene, cam);
        },
        () => {
          uni.uOn.value = 1;
          r.render(scene, cam);
        },
      );
      tags.draw(r, w, h, [
        [0.25, 0.08],
        [0.75, 0.08],
      ]);
    },
    controls: [{ type: 'range', label: '빛무늬 세기', min: 0, max: 2, step: 0.05, value: 1, on: (v) => (uni.uAmt.value = v) }],
    dispose() {
      freeAll(world);
      peb.dispose();
      bg.dispose();
      tags.dispose();
    },
  };
}

/* ───────────── u24 물 셰이더 묶음 ───────────── */

function ribbonAlong(pts: THREE.Vector3[], width: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const n = pts.length;
  pts.forEach((p, i) => {
    pos.push(p.x - width / 2, p.y, p.z, p.x + width / 2, p.y, p.z);
    uv.push(0, i / (n - 1), 1, i / (n - 1));
    if (i < n - 1) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function waterKitDemo(): Scene3D {
  const scene = new THREE.Scene();
  const bg = gradTex([
    [0, '#62b4ee'],
    [0.7, '#cdeeff'],
    [1, '#eaf8ff'],
  ]);
  scene.background = bg;
  lights(scene);
  const time = { value: 0 };
  const world = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 3.5, 0.4, 64), new THREE.MeshStandardMaterial({ color: 0x8fd16a, roughness: 0.95 }));
  ground.position.y = -0.2;
  world.add(ground);
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 2.6, 0.7, 64), new THREE.MeshStandardMaterial({ color: 0xb98a5a, roughness: 1 }));
  soil.position.y = -0.75;
  world.add(soil);
  const stoneM = new THREE.MeshStandardMaterial({ color: 0xa6a2b0, roughness: 0.85, flatShading: true });

  // ① 흐르는 물 — 바위 위에서 떨어져 개울로
  const stream = new THREE.Group();
  const cliff = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 0.8), stoneM);
  cliff.position.set(0, 0.5, -0.75);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.08, 0.84), new THREE.MeshStandardMaterial({ color: 0x7cc456 }));
  cap.position.set(0, 1.02, -0.75);
  const path: THREE.Vector3[] = [];
  for (let i = 0; i <= 6; i++) path.push(new THREE.Vector3(0, 1.065, -1.1 + (i / 6) * 0.75));
  for (let i = 1; i <= 14; i++) {
    const s = i / 14;
    path.push(new THREE.Vector3(0, 1.065 - 1.03 * s * s, -0.35 + 0.22 * Math.sin((s * Math.PI) / 2)));
  }
  for (let i = 1; i <= 10; i++) path.push(new THREE.Vector3(0, 0.035, -0.13 + (i / 10) * 1.1));
  const flow = new THREE.Mesh(ribbonAlong(path, 0.46), flowMaterial(time, { speed: 1.6, along: 5, foam: 0.6 }));
  flow.renderOrder = 2;
  stream.add(cliff, cap, flow);
  stream.position.set(-2.0, 0, 0);
  world.add(stream);

  // ② 연못 — 물방울이 떨어지면 동그란 물결
  const pondMat = poolMaterial(time, { scale: 1.2 });
  const pond = new THREE.Mesh(new THREE.CircleGeometry(0.85, 48), pondMat);
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(0, 0.02, 0);
  pond.renderOrder = 2;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.08, 8, 40), stoneM);
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.03;
  const drop = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), new THREE.MeshStandardMaterial({ color: 0x9fe4ff, roughness: 0.05 }));
  drop.scale.y = 1.4;
  world.add(pond, rim, drop);

  // ③ 병 속 물
  const jar = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1, 40), bodyWaterMaterial(time));
  body.scale.y = 0.8;
  body.position.y = 0.46;
  const topMat = poolMaterial(time, { scale: 0.6, opacity: 0.9 });
  const top = new THREE.Mesh(new THREE.CircleGeometry(0.42, 40), topMat);
  top.rotation.x = -Math.PI / 2;
  top.position.y = 0.861;
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.46, 0.46, 1.3, 40, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
  );
  glass.position.y = 0.71;
  glass.renderOrder = 3;
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.025, 8, 40), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, transparent: true, opacity: 0.6 }));
  lip.rotation.x = Math.PI / 2;
  lip.position.y = 1.36;
  const baseG = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.06, 40), new THREE.MeshStandardMaterial({ color: 0xdff4ff, roughness: 0.1, transparent: true, opacity: 0.5 }));
  baseG.position.y = 0.03;
  jar.add(body, top, glass, lip, baseG);
  jar.position.set(2.0, 0, 0);
  world.add(jar);
  scene.add(world);

  const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 60);
  const tags = new Tags(['흐르는 물', '연못 물결', '병 속 물']);
  let lastHit = -10;
  return {
    scene,
    camera: cam,
    update(t) {
      time.value = t;
      const a = Math.sin(t * 0.3) * 0.25;
      cam.position.set(Math.sin(a) * 7, 3.0, Math.cos(a) * 7);
      cam.lookAt(0, 0.45, 0);
      const ph = t % 2.2;
      const fall = Math.min(1, ph / 0.6);
      drop.visible = ph < 0.6;
      drop.position.set(0, 1.6 - 1.58 * fall * fall, 0);
      if (ph >= 0.6 && t - lastHit > 1) {
        lastHit = t;
        pondMat.uniforms.uHit.value = t;
      }
    },
    render(r, w, h) {
      r.render(scene, cam);
      tags.draw(r, w, h, [toScreen(new THREE.Vector3(-2.0, -0.2, 1.3), cam), toScreen(new THREE.Vector3(0, -0.2, 1.2), cam), toScreen(new THREE.Vector3(2.0, -0.2, 0.9), cam)]);
    },
    dispose() {
      freeAll(world);
      bg.dispose();
      tags.dispose();
    },
  };
}

/* ───────────── u25 기울여도 평평한 물 ───────────── */

function flatWaterDemo(): Scene3D {
  const scene = new THREE.Scene();
  const bg = gradTex([
    [0, '#8fcff4'],
    [1, '#eef9ff'],
  ]);
  scene.background = bg;
  lights(scene, 0xffffff, 0x99aabb, 1.1, 1.5);
  const time = { value: 0 };
  const mkWater = (mode: number): THREE.ShaderMaterial =>
    new THREE.ShaderMaterial({
      uniforms: { uMode: { value: mode }, uLevel: { value: 0 }, uTime: time, uDeep: { value: new THREE.Color(0x1f6fd0) }, uTop: { value: new THREE.Color(0x6fd8f4) } },
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `varying vec3 vW; varying vec3 vL; varying vec3 vN;
        void main(){ vL = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `uniform float uMode; uniform float uLevel; uniform float uTime; uniform vec3 uDeep; uniform vec3 uTop;
        varying vec3 vW; varying vec3 vL; varying vec3 vN;
        ${NOISE2}
        void main(){
          // 수면 = 평면 y = uLevel (세상 좌표) — 그 위는 버린다. 끔이면 통 좌표 y = 0 (통과 같이 기운다)
          float hgt = uMode > 0.5 ? vW.y - uLevel : vL.y;
          if (hgt > 0.0) discard;
          vec3 col;
          if (gl_FrontFacing) {
            vec3 V = normalize(cameraPosition - vW);
            float F = pow(1.0 - abs(dot(normalize(vN), V)), 2.0);
            col = mix(uDeep, uTop, clamp(1.0 + hgt * 1.3, 0.0, 1.0)) + vec3(0.25, 0.35, 0.4) * F;
            col += vec3(0.85, 0.97, 1.0) * smoothstep(-0.035, 0.0, hgt) * 0.8;
          } else {
            // 앞면이 잘린 곳으로 보이는 뒷면 = 수면 뚜껑
            vec2 q = uMode > 0.5 ? vW.xz : vL.xz;
            float rip = noise(q * 7.0 + uTime * 0.7) * 0.5 + noise(q * 15.0 - uTime * 1.1) * 0.5;
            col = uTop * (0.95 + rip * 0.35) + vec3(0.08);
          }
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
  const S = { x: 1.0, y: 1.4, z: 0.7 };
  const mats: THREE.ShaderMaterial[] = [];
  const tanks: THREE.Group[] = [];
  const world = new THREE.Group();
  for (const [i, mode] of [
    [0, 0],
    [1, 1],
  ] as const) {
    const tank = new THREE.Group();
    const wm = mkWater(mode);
    mats.push(wm);
    const water = new THREE.Mesh(new THREE.BoxGeometry(S.x - 0.04, S.y - 0.04, S.z - 0.04), wm);
    const glassG = new THREE.BoxGeometry(S.x, S.y, S.z);
    const glass = new THREE.Mesh(glassG, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.16, depthWrite: false }));
    glass.renderOrder = 2;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(glassG), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
    const cap = new THREE.Mesh(new THREE.BoxGeometry(S.x + 0.06, 0.06, S.z + 0.06), new THREE.MeshStandardMaterial({ color: i ? 0x4fc06a : 0xf07a5a, roughness: 0.5 }));
    cap.position.y = -S.y / 2 - 0.03;
    tank.add(water, glass, edges, cap);
    tank.position.set(i ? 1.25 : -1.25, 0.15, 0);
    world.add(tank);
    tanks.push(tank);
  }
  const table = new THREE.Mesh(new THREE.BoxGeometry(6, 0.2, 2.4), new THREE.MeshStandardMaterial({ color: 0xd8a868, roughness: 0.8 }));
  table.position.y = -1.25;
  world.add(table);
  scene.add(world);
  const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  cam.position.set(0, 1.5, 5.6);
  cam.lookAt(0, 0, 0);
  const tags = new Tags(['통과 같이 기울어요 ✗', '수면은 늘 수평 ✓'], ['rgba(170,60,50,0.75)', 'rgba(30,120,60,0.75)']);
  let amp = 0.7;
  return {
    scene,
    camera: cam,
    update(t) {
      time.value = t;
      for (const [i, tk] of tanks.entries()) {
        tk.rotation.set(0, 0.35 + Math.sin(t * 0.4) * 0.25, Math.sin(t * 0.9) * amp);
        tk.updateMatrixWorld();
        mats[i]!.uniforms['uLevel']!.value = tk.position.y; // 통 가운데를 지나는 평면 → 물은 늘 반
      }
    },
    render(r, w, h) {
      r.render(scene, cam);
      tags.draw(r, w, h, [toScreen(new THREE.Vector3(-1.25, -1.15, 1.2), cam), toScreen(new THREE.Vector3(1.25, -1.15, 1.2), cam)]);
    },
    controls: [{ type: 'range', label: '기울기', min: 0, max: 1.4, step: 0.05, value: 0.7, on: (v) => (amp = v) }],
    dispose() {
      freeAll(world);
      bg.dispose();
      tags.dispose();
    },
  };
}

/* ───────────── u26 폭포 · 하늘 돔 · 바다 ───────────── */

const SKY_FN = /* glsl */ `
uniform vec3 uSunDir;
vec3 skyCol(vec3 d){
  float y = d.y;
  vec3 zen = vec3(0.16, 0.42, 0.86); vec3 hor = vec3(0.99, 0.82, 0.66); vec3 low = vec3(0.52, 0.72, 0.9);
  vec3 col = y > 0.0 ? mix(hor, zen, pow(clamp(y, 0.0, 1.0), 0.55)) : mix(hor, low, clamp(-y * 5.0, 0.0, 1.0));
  float s = max(dot(d, uSunDir), 0.0);
  col += vec3(1.0, 0.8, 0.55) * pow(s, 10.0) * 0.45 + vec3(1.0, 0.97, 0.88) * smoothstep(0.9975, 0.999, s);
  return col;
}`;

function seaDemo(): Scene3D {
  const scene = new THREE.Scene();
  const sunDir = new THREE.Vector3(-0.55, 0.22, -0.8).normalize();
  const time = { value: 0 };
  const domeMat = new THREE.ShaderMaterial({
    uniforms: { uSunDir: { value: sunDir } },
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `varying vec3 vD; ${SKY_FN} void main(){ gl_FragColor = vec4(skyCol(normalize(vD)), 1.0); }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(48, 32, 16), domeMat);
  dome.renderOrder = -1;
  scene.add(dome);
  const seaGeo = new THREE.PlaneGeometry(90, 90, 110, 110);
  seaGeo.rotateX(-Math.PI / 2);
  const seaMat = new THREE.ShaderMaterial({
    uniforms: { uTime: time, uSunDir: { value: sunDir } },
    vertexShader: /* glsl */ `uniform float uTime; varying vec3 vW; varying float vH;
      float H(vec2 p){
        return 0.16 * sin(dot(p, vec2(0.8, 0.6)) * 1.1 - uTime * 1.2) + 0.09 * sin(dot(p, vec2(-0.5, 0.86)) * 2.0 - uTime * 1.8)
             + 0.045 * sin(dot(p, vec2(0.95, -0.3)) * 3.6 - uTime * 2.5) + 0.02 * sin(dot(p, vec2(0.2, 1.0)) * 6.5 - uTime * 3.3);
      }
      void main(){ vec3 p = (modelMatrix * vec4(position, 1.0)).xyz; float h = H(p.xz); p.y += h; vH = h; vW = p; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
    fragmentShader: /* glsl */ `uniform float uTime; varying vec3 vW; varying float vH;
      ${NOISE2}
      ${SKY_FN}
      float H(vec2 p){
        float t = uTime;
        return 0.16 * sin(dot(p, vec2(0.8, 0.6)) * 1.1 - t * 1.2) + 0.09 * sin(dot(p, vec2(-0.5, 0.86)) * 2.0 - t * 1.8)
             + 0.045 * sin(dot(p, vec2(0.95, -0.3)) * 3.6 - t * 2.5) + 0.02 * sin(dot(p, vec2(0.2, 1.0)) * 6.5 - t * 3.3)
             + (fbm(p * 2.0 + vec2(t * 0.3, t * 0.2)) - 0.5) * 0.05;
      }
      void main(){
        vec2 p = vW.xz; float e = 0.04; float h = H(p);
        vec3 N = normalize(vec3(-(H(p + vec2(e, 0.0)) - h) / e, 1.0, -(H(p + vec2(0.0, e)) - h) / e));
        vec3 V = normalize(cameraPosition - vW);
        float F = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 deep = vec3(0.04, 0.3, 0.5); vec3 shal = vec3(0.12, 0.62, 0.72);
        vec3 col = mix(deep, shal, clamp(vH * 2.5 + 0.45, 0.0, 1.0));
        vec3 R = reflect(-V, N); R.y = abs(R.y);
        col = mix(col, skyCol(R), clamp(F, 0.0, 0.9));
        col += vec3(1.0, 0.9, 0.7) * pow(max(dot(R, uSunDir), 0.0), 220.0) * 3.0;
        // 물마루 거품 · 섬 둘레 거품
        float crest = smoothstep(0.17, 0.27, vH + (noise(p * 6.0 + uTime) - 0.5) * 0.12);
        float d = length(p);
        float ring = (1.0 - smoothstep(1.9, 2.6, d)) * smoothstep(0.35, 0.7, fbm(p * 5.0 + vec2(0.0, uTime * 0.8)) + (1.0 - smoothstep(1.7, 2.1, d)) * 0.4);
        col = mix(col, vec3(0.97, 0.99, 1.0), clamp(crest * 0.7 + ring, 0.0, 1.0));
        // 먼 바다는 수평선 빛으로
        float far = smoothstep(12.0, 42.0, length(vW.xz - cameraPosition.xz));
        col = mix(col, skyCol(normalize(vec3(V.x, 0.001, V.z)) * vec3(1.0)), far);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sea = new THREE.Mesh(seaGeo, seaMat);
  scene.add(sea);
  lights(scene, 0xfff2e0, 0x6a8aa0, 1.0, 1.8);
  const isle = new THREE.Group();
  const rockM = new THREE.MeshStandardMaterial({ color: 0x9a8676, roughness: 0.9, flatShading: true });
  const cliff = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.75, 2.8, 9, 3), rockM);
  cliff.position.y = 0.9;
  const grassTop = new THREE.Mesh(new THREE.CylinderGeometry(1.36, 1.3, 0.28, 9), new THREE.MeshStandardMaterial({ color: 0x6fc24f, roughness: 0.9, flatShading: true }));
  grassTop.position.y = 2.42;
  const leaf = new THREE.MeshStandardMaterial({ color: 0x2f9a4a, flatShading: true });
  for (const [x, z, s] of [
    [-0.5, -0.3, 1],
    [0.55, -0.5, 0.8],
    [0.1, 0.5, 0.7],
  ] as const) {
    const tr = new THREE.Mesh(new THREE.ConeGeometry(0.35 * s, 1.0 * s, 7), leaf);
    tr.position.set(x, 2.55 + 0.5 * s, z);
    isle.add(tr);
  }
  isle.add(cliff, grassTop);
  // 폭포 — 흐르는 거품 줄
  const fallMat = new THREE.ShaderMaterial({
    uniforms: { uTime: time },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform float uTime; varying vec2 vUv;
      ${NOISE2}
      void main(){
        float s = noise(vec2(vUv.x * 12.0, vUv.y * 4.0 + uTime * 2.6)) * 0.6 + noise(vec2(vUv.x * 26.0, vUv.y * 7.0 + uTime * 3.6)) * 0.4;
        vec3 col = mix(vec3(0.3, 0.68, 0.92), vec3(1.0), smoothstep(0.42, 0.8, s));
        col = mix(col, vec3(1.0), smoothstep(0.25, 0.0, vUv.y) * 0.9 + smoothstep(0.9, 1.0, vUv.y) * 0.5);
        float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
        gl_FragColor = vec4(col, (0.75 + 0.25 * s) * edge);
      }`,
  });
  const fallGeo = new THREE.PlaneGeometry(0.7, 2.5, 1, 1);
  const fall = new THREE.Mesh(fallGeo, fallMat);
  fall.position.set(0, 1.25, 1.62);
  fall.rotation.x = -0.12;
  fall.renderOrder = 2;
  isle.add(fall);
  // 물보라 알갱이
  const N = 70;
  const spray = new Float32Array(N * 3);
  const sprayGeo = new THREE.BufferGeometry();
  sprayGeo.setAttribute('position', new THREE.BufferAttribute(spray, 3));
  const sprayPts = new THREE.Points(sprayGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, transparent: true, opacity: 0.85, depthWrite: false }));
  isle.add(sprayPts);
  scene.add(isle);
  const cam = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
  return {
    scene,
    camera: cam,
    update(t) {
      time.value = t;
      const a = 0.35 + Math.sin(t * 0.18) * 0.55;
      cam.position.set(Math.sin(a) * 8.5, 2.6, Math.cos(a) * 8.5);
      cam.lookAt(0, 1.0, 0);
      for (let i = 0; i < N; i++) {
        const ph = (t * 0.9 + i / N) % 1;
        const ang = i * 2.39;
        const sp = 0.25 + (i % 7) * 0.06;
        spray[i * 3] = Math.cos(ang) * sp * ph * 2.2;
        spray[i * 3 + 1] = 0.05 + ph * 1.4 - ph * ph * 1.6;
        spray[i * 3 + 2] = 1.75 + Math.abs(Math.sin(ang)) * sp * ph * 2;
      }
      sprayGeo.attributes['position']!.needsUpdate = true;
    },
    dispose() {
      freeAll(dome, sea, isle);
    },
  };
}

/* ───────────── u27 빛기둥 · 반짝이 점 ───────────── */

function beamDemo(): Scene3D {
  const scene = new THREE.Scene();
  const bg = gradTex([
    [0, '#0b1030'],
    [1, '#2a2160'],
  ]);
  scene.background = bg;
  scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x302050, 0.7));
  const key = new THREE.PointLight(0xffe6a0, 6, 6);
  key.position.set(0, 1.2, 0.8);
  scene.add(key);
  const time = { value: 0 };
  const amt = { value: 1 };
  const mkBeam = (color: number, rt: number, rb: number): THREE.Mesh => {
    const g = new THREE.CylinderGeometry(rt, rb, 3.2, 48, 1, true);
    g.translate(0, 1.6, 0);
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: time, uAmt: amt, uColor: { value: new THREE.Color(color) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vW; varying vec3 vL;
        void main(){ vL = position; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `uniform float uTime; uniform float uAmt; uniform vec3 uColor; varying vec3 vN; varying vec3 vW; varying vec3 vL;
        ${NOISE2}
        void main(){
          float h = vL.y / 3.2;
          float edge = pow(abs(dot(normalize(vN), normalize(cameraPosition - vW))), 1.6);
          float fade = pow(1.0 - h, 1.7) * smoothstep(0.0, 0.04, h);
          float st = 0.55 + 0.45 * noise(vec2(atan(vL.z, vL.x) * 3.0, h * 3.0 - uTime * 1.3));
          gl_FragColor = vec4(uColor * edge * fade * st * uAmt, 1.0);
        }`,
    });
    return new THREE.Mesh(g, m);
  };
  const world = new THREE.Group();
  world.add(mkBeam(0xffd27a, 1.15, 0.5), mkBeam(0xfff6d0, 0.45, 0.28));
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.18, 48), new THREE.MeshStandardMaterial({ color: 0x24305e, roughness: 0.5, metalness: 0.3 }));
  pad.position.y = -0.09;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 8, 64), new THREE.MeshBasicMaterial({ color: 0xffd98a }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(3.5, 48), new THREE.MeshStandardMaterial({ color: 0x1a1d44, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.18;
  const cube = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0xffc23a, metalness: 0.7, roughness: 0.25, emissive: 0x6a4000, emissiveIntensity: 0.6 }));
  world.add(pad, ring, floor, cube);
  // 반짝이 점 — 점마다 다른 빠르기 · 때
  const N = 260;
  const pos = new Float32Array(N * 3);
  const ph = new Float32Array(N);
  const sp = new Float32Array(N);
  const col = new Float32Array(N * 3);
  const palette = [new THREE.Color(0xffe08a), new THREE.Color(0x8ae8ff), new THREE.Color(0xff9ad8), new THREE.Color(0xffffff)];
  let seed = 7;
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < N; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * 1.6;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = rnd() * 3.2;
    pos[i * 3 + 2] = Math.sin(a) * r;
    ph[i] = rnd() * 6.28;
    sp[i] = 0.6 + rnd() * 1.6;
    const c = palette[i % 4]!;
    col.set([c.r, c.g, c.b], i * 3);
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pg.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
  pg.setAttribute('aSpeed', new THREE.BufferAttribute(sp, 1));
  pg.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  const pu = { uTime: time, uSize: { value: 30 }, uTw: { value: 2.5 } };
  const pts = new THREE.Points(
    pg,
    new THREE.ShaderMaterial({
      uniforms: pu,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `attribute float aPhase; attribute float aSpeed; attribute vec3 aColor;
        uniform float uTime; uniform float uSize; uniform float uTw; varying vec3 vC; varying float vA;
        void main(){
          vec3 p = position; float h = fract(p.y / 3.2 + uTime * 0.04 * aSpeed); p.y = h * 3.2;
          float tw = pow(0.5 + 0.5 * sin(uTime * aSpeed * uTw + aPhase), 3.0);
          vA = (0.15 + tw) * smoothstep(0.0, 0.1, h) * smoothstep(1.0, 0.7, h);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uSize * (0.35 + tw) / -mv.z;
          gl_Position = projectionMatrix * mv; vC = aColor;
        }`,
      fragmentShader: /* glsl */ `varying vec3 vC; varying float vA;
        void main(){
          vec2 c = gl_PointCoord - 0.5; float d = length(c);
          float core = pow(max(0.0, 1.0 - d * 2.0), 2.0);
          float cr = max(0.0, 1.0 - abs(c.x) * 14.0) * max(0.0, 1.0 - abs(c.y) * 2.0) + max(0.0, 1.0 - abs(c.y) * 14.0) * max(0.0, 1.0 - abs(c.x) * 2.0);
          gl_FragColor = vec4(vC * (core + cr * 0.7) * vA, 1.0);
        }`,
    }),
  );
  world.add(pts);
  scene.add(world);
  const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  cam.position.set(0, 2.0, 6.2);
  cam.lookAt(0, 1.3, 0);
  return {
    scene,
    camera: cam,
    update(t) {
      time.value = t;
      cube.position.y = 1.1 + Math.sin(t * 1.6) * 0.15;
      cube.rotation.set(t * 0.5, t * 0.8, 0.3);
      world.rotation.y = t * 0.15;
    },
    resize(_w, h) {
      pu.uSize.value = h * 0.11;
    },
    controls: [
      { type: 'range', label: '빛기둥 밝기', min: 0, max: 2, step: 0.05, value: 1, on: (v) => (amt.value = v) },
      { type: 'range', label: '반짝 빠르기', min: 0.2, max: 6, step: 0.1, value: 2.5, on: (v) => (pu.uTw.value = v) },
    ],
    dispose() {
      freeAll(world);
      bg.dispose();
    },
  };
}

/* ───────────── i56 SDF 레이마칭 ───────────── */

function sdfDemo(): Scene3D {
  const u = { uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uOp: { value: 0 }, uPrev: { value: 3 }, uMix: { value: 1 }, uK: { value: 0.45 } };
  const q = fsq(
    /* glsl */ `uniform vec2 uRes; uniform float uTime; uniform float uOp; uniform float uPrev; uniform float uMix; uniform float uK;
    varying vec2 vUv;
    float sdBox(vec3 p, vec3 b, float r){ vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }
    float smin(float a, float b, float k){ float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
    float opF(float a, float b, float op){ if (op < 0.5) return min(a, b); if (op < 1.5) return smin(a, b, uK); if (op < 2.5) return max(a, b); return max(a, -b); }
    mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
    float A(vec3 p){ return length(p - vec3(sin(uTime * 0.9) * 0.55, 0.0, 0.0)) - 0.72; }
    float B(vec3 p){ vec3 q = p - vec3(-sin(uTime * 0.9) * 0.45, 0.0, 0.0); q.xz = rot(uTime * 0.5) * q.xz; q.xy = rot(0.4) * q.xy; return sdBox(q, vec3(0.48), 0.07); }
    vec2 map(vec3 p){
      float a = A(p); float b = B(p);
      float d = mix(opF(a, b, uPrev), opF(a, b, uOp), uMix);
      float m = clamp(0.5 + 0.5 * (b - a) / 0.25, 0.0, 1.0);
      float fl = p.y + 0.95;
      if (fl < d) return vec2(fl, -1.0);
      return vec2(d, m);
    }
    vec3 nrm(vec3 p){ vec2 e = vec2(0.0015, -0.0015);
      return normalize(e.xyy * map(p + e.xyy).x + e.yyx * map(p + e.yyx).x + e.yxy * map(p + e.yxy).x + e.xxx * map(p + e.xxx).x); }
    float shadow(vec3 ro, vec3 rd){ float r = 1.0; float t = 0.03; for (int i = 0; i < 28; i++){ float h = map(ro + rd * t).x; r = min(r, 9.0 * h / t); t += clamp(h, 0.02, 0.25); if (r < 0.01 || t > 5.0) break; } return clamp(r, 0.0, 1.0); }
    void main(){
      vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.y, uRes.x * 0.8);
      float an = uTime * 0.25 + 0.6;
      vec3 ro = vec3(5.6 * sin(an), 2.3, 5.6 * cos(an));
      vec3 ta = vec3(0.0, -0.05, 0.0);
      vec3 fw = normalize(ta - ro); vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0))); vec3 up = cross(rt, fw);
      vec3 rd = normalize(p.x * rt + p.y * up + 1.5 * fw);
      vec3 bg = mix(vec3(0.95, 0.9, 1.0), vec3(0.62, 0.78, 1.0), clamp(p.y + 0.5, 0.0, 1.0));
      vec3 col = bg;
      float t = 0.0; vec2 h = vec2(1.0); bool hit = false;
      for (int i = 0; i < 90; i++){
        vec3 x = ro + rd * t;
        h = map(x);
        if (h.x < 0.001){ hit = true; break; }
        t += h.x; if (t > 12.0) break;
      }
      if (hit){
        vec3 x = ro + rd * t; vec3 n = nrm(x);
        vec3 L = normalize(vec3(0.6, 0.85, 0.35));
        vec3 base;
        if (h.y < 0.0){ float ch = mod(floor(x.x * 2.0) + floor(x.z * 2.0), 2.0); base = mix(vec3(0.86, 0.84, 0.96), vec3(0.95, 0.94, 1.0), ch); }
        else base = mix(vec3(0.25, 0.72, 1.0), vec3(1.0, 0.42, 0.6), h.y);
        float dif = max(dot(n, L), 0.0) * shadow(x + n * 0.01, L);
        float ao = 0.0; float sc = 1.0; for (int k = 1; k <= 4; k++){ float hh = 0.04 * float(k); ao += (hh - map(x + n * hh).x) * sc; sc *= 0.7; }
        ao = clamp(1.0 - 3.0 * ao, 0.0, 1.0);
        vec3 H = normalize(L - rd);
        float spec = pow(max(dot(n, H), 0.0), 48.0) * dif * (h.y < 0.0 ? 0.0 : 0.8);
        float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0) * (h.y < 0.0 ? 0.0 : 0.5);
        col = base * (0.28 * ao + 0.85 * dif) + vec3(spec) + vec3(0.7, 0.85, 1.0) * rim * ao;
        col = mix(col, bg, smoothstep(5.0, 11.0, t));
      }
      gl_FragColor = vec4(pow(col, vec3(0.4545)), 1.0);
    }`,
    u,
  );
  const NAMES = ['합집합 A ∪ B', '부드러운 합 (smooth min)', '교집합 A ∩ B', '차집합 A − B'];
  const tags = new Tags([NAMES[0]!]);
  let auto = true;
  let fixed = 1;
  return {
    scene: q.scene,
    camera: q.camera,
    tone: THREE.NoToneMapping,
    update(t) {
      u.uTime.value = t;
      if (auto) {
        const idx = Math.floor(t / 3) % 4;
        u.uOp.value = idx;
        u.uPrev.value = (idx + 3) % 4;
        u.uMix.value = Math.min(1, (t % 3) / 0.6);
        tags.set(0, NAMES[idx]!);
      } else {
        u.uOp.value = u.uPrev.value = fixed;
        u.uMix.value = 1;
        tags.set(0, NAMES[fixed]!);
      }
    },
    render(r, w, h) {
      u.uRes.value.set(w, h);
      r.render(q.scene, q.camera);
      tags.draw(r, w, h, [[0.5, 0.08]]);
    },
    controls: [
      { type: 'range', label: '녹아 붙는 정도 k', min: 0.05, max: 1.2, step: 0.05, value: 0.45, on: (v) => (u.uK.value = v) },
      { type: 'toggle', label: '연산 자동으로 바꾸기', value: true, on: (v) => (auto = v) },
      { type: 'range', label: '연산 고르기 (0 합 · 1 부드러운 합 · 2 교 · 3 차)', min: 0, max: 3, step: 1, value: 1, on: (v) => (fixed = v) },
    ],
    dispose() {
      q.dispose();
      tags.dispose();
    },
  };
}

/* ───────────── i57 부피 불 · 구름 ───────────── */

function volumeDemo(): Scene3D {
  const u = { uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uSteps: { value: 40 } };
  const q = fsq(
    /* glsl */ `uniform vec2 uRes; uniform float uTime; uniform float uSteps; varying vec2 vUv;
    ${NOISE3}
    bool sph(vec3 ro, vec3 rd, vec3 c, float r, out float t0, out float t1){
      vec3 oc = ro - c; float b = dot(oc, rd); float cc = dot(oc, oc) - r * r; float h = b * b - cc;
      if (h < 0.0) return false; h = sqrt(h); t0 = -b - h; t1 = -b + h; return t1 > 0.0;
    }
    vec3 fireRamp(float x){
      vec3 c = mix(vec3(0.0), vec3(0.75, 0.05, 0.02), smoothstep(0.0, 0.25, x));
      c = mix(c, vec3(1.0, 0.42, 0.04), smoothstep(0.25, 0.55, x));
      c = mix(c, vec3(1.0, 0.82, 0.3), smoothstep(0.55, 0.8, x));
      return mix(c, vec3(1.0, 1.0, 0.9), smoothstep(0.8, 1.0, x));
    }
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    vec3 fire(vec2 p){
      vec3 ro = vec3(0.0, 0.2, 3.2); vec3 rd = normalize(vec3(p, -1.7));
      vec3 bg = mix(vec3(0.16, 0.05, 0.08), vec3(0.03, 0.03, 0.09), smoothstep(-0.5, 0.5, p.y));
      bg += vec3(1.0, 0.35, 0.08) * 0.25 * exp(-length(p - vec2(0.0, -0.32)) * 3.0);
      float t0, t1; vec3 acc = vec3(0.0); float T = 1.0;
      if (sph(ro, rd, vec3(0.0, 0.2, 0.0), 1.15, t0, t1)){
        t0 = max(t0, 0.0); float dt = (t1 - t0) / 40.0; float t = t0 + dt * rnd(p * 91.7);
        for (int i = 0; i < 40; i++){
          vec3 x = ro + rd * t;
          float hgt = clamp((x.y + 0.75) / 1.9, 0.0, 1.0);
          float w = 0.5 * (1.0 - hgt * 0.8) + 0.03;
          float n = fbm3(x * 2.4 - vec3(0.0, uTime * 2.0, 0.0) + vec3(0.0, 0.0, uTime * 0.2));
          float d = clamp((1.0 - length(x.xz) / w) * 1.3 + (n - 0.5) * 1.7 - hgt * 0.55, 0.0, 1.0) * step(-0.75, x.y);
          if (d > 0.001){
            acc += T * fireRamp(d * (1.2 - hgt * 0.75)) * d * dt * 9.0;
            T *= exp(-d * dt * 4.0);
            if (T < 0.02) break;
          }
          t += dt;
        }
      }
      return bg * T + acc;
    }
    mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
    float cden(vec3 x){
      x.xz = rot(uTime * 0.15) * x.xz;
      float s = 1.0 - length(x / vec3(1.05, 0.5, 0.75));
      s = max(s, 1.0 - length((x - vec3(0.45, 0.22, 0.0)) / vec3(0.55, 0.48, 0.5)));
      s = max(s, 1.0 - length((x - vec3(-0.42, 0.14, 0.1)) / vec3(0.5, 0.42, 0.48)));
      float n = fbm3(x * 2.3 + vec3(uTime * 0.12, -uTime * 0.05, 0.0));
      return clamp(s * 2.4 + (n - 0.5) * 2.0 - 0.15, 0.0, 1.0);
    }
    vec3 cloud(vec2 p){
      vec3 ro = vec3(0.0, 0.1, 3.2); vec3 rd = normalize(vec3(p, -1.7));
      vec3 bg = mix(vec3(0.78, 0.9, 1.0), vec3(0.32, 0.6, 0.95), smoothstep(-0.5, 0.6, p.y));
      vec3 L = normalize(vec3(0.6, 0.7, 0.3));
      float t0, t1; vec3 acc = vec3(0.0); float T = 1.0;
      if (sph(ro, rd, vec3(0.0), 1.3, t0, t1)){
        t0 = max(t0, 0.0); float dt = (t1 - t0) / 36.0; float t = t0 + dt * rnd(p * 53.1);
        for (int i = 0; i < 36; i++){
          vec3 x = ro + rd * t;
          float d = cden(x);
          if (d > 0.01){
            float dl = cden(x + L * 0.22);
            float li = exp(-dl * 2.6);
            vec3 c = mix(vec3(0.5, 0.58, 0.76), vec3(1.0, 0.98, 0.93), li);
            acc += T * c * d * dt * 7.0;
            T *= exp(-d * dt * 7.0);
            if (T < 0.02) break;
          }
          t += dt;
        }
      }
      return bg * T + acc;
    }
    void main(){
      bool right = gl_FragCoord.x > uRes.x * 0.5;
      float hw = uRes.x * 0.5;
      vec2 c = vec2(right ? hw * 1.5 : hw * 0.5, uRes.y * 0.5);
      vec2 p = (gl_FragCoord.xy - c) / min(hw * 1.35, uRes.y);
      vec3 col = right ? cloud(p) : fire(p);
      if (abs(gl_FragCoord.x - hw) < 1.0) col = vec3(1.0);
      gl_FragColor = vec4(col, 1.0);
    }`,
    u,
  );
  const tags = new Tags(['부피 불', '부피 구름']);
  return {
    scene: q.scene,
    camera: q.camera,
    tone: THREE.NoToneMapping,
    update(t) {
      u.uTime.value = t;
    },
    render(r, w, h) {
      u.uRes.value.set(w, h);
      r.render(q.scene, q.camera);
      tags.draw(r, w, h, [
        [0.25, 0.08],
        [0.75, 0.08],
      ]);
    },
    dispose() {
      q.dispose();
      tags.dispose();
    },
  };
}

/* ───────────── i58 2D 불 셰이더 ───────────── */

function fire2dDemo(): Scene3D {
  const u = { uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uSpeed: { value: 1 }, uH: { value: 0.62 } };
  const q = fsq(
    /* glsl */ `uniform vec2 uRes; uniform float uTime; uniform float uSpeed; uniform float uH; varying vec2 vUv;
    ${NOISE2}
    vec3 ramp(float x){
      vec3 c = mix(vec3(0.0), vec3(0.7, 0.06, 0.02), smoothstep(0.0, 0.3, x));
      c = mix(c, vec3(1.0, 0.45, 0.05), smoothstep(0.3, 0.6, x));
      c = mix(c, vec3(1.0, 0.85, 0.3), smoothstep(0.6, 0.85, x));
      return mix(c, vec3(1.0, 1.0, 0.92), smoothstep(0.85, 1.0, x));
    }
    void main(){
      float px = vUv.x * 3.0; float idx = floor(px); float u = fract(px);
      float asp = (uRes.x / 3.0) / uRes.y;
      vec2 p = vec2((u - 0.5) * asp, vUv.y);
      float tt = uTime * uSpeed;
      // ① 잡음을 위로 흘린다
      float n = fbm(vec2(p.x * 5.0, p.y * 3.5 - tt * 1.8)) * 0.7 + noise(vec2(p.x * 11.0, p.y * 8.0 - tt * 3.2)) * 0.3;
      // ② 불꽃 모양(아래 넓고 위로 좁게)으로 깎는다
      float base = 0.12;
      float vv = (p.y - base) / uH;
      float wd = 0.26 * pow(1.0 - clamp(vv, 0.0, 1.0), 0.6) + 0.005;
      float sway = 0.03 * sin(p.y * 6.0 - tt * 4.0) * clamp(vv, 0.0, 1.0);
      float mask = clamp(1.0 - abs(p.x + sway) / wd, 0.0, 1.0) * smoothstep(-0.1, 0.05, vv) * smoothstep(1.05, 0.8, vv);
      float n2 = smoothstep(0.2, 0.8, n);
      float I = clamp(mask * 1.8 - (1.0 - n2) * 1.15 - max(vv, 0.0) * 0.5, 0.0, 1.0);
      I = clamp(I * 1.6, 0.0, 1.0);
      vec3 bg = mix(vec3(0.05, 0.05, 0.12), vec3(0.1, 0.07, 0.2), vUv.y);
      vec3 col;
      if (idx < 0.5) col = vec3(n) * vec3(0.95, 0.95, 1.0);
      else if (idx < 1.5) col = mix(bg, vec3(1.0), I);
      else {
        col = bg + vec3(1.0, 0.35, 0.08) * 0.3 * exp(-length((p - vec2(0.0, base)) * vec2(1.0, 1.4)) * 5.0);
        col = max(col, ramp(I));
        // 장작
        float logY = abs(p.y - base + 0.04);
        if (logY < 0.022 && abs(p.x) < 0.17) col = mix(vec3(0.42, 0.24, 0.12), vec3(0.6, 0.36, 0.18), step(0.5, fract((p.x + p.y) * 30.0)));
      }
      float edge = min(u, 1.0 - u) * uRes.x / 3.0;
      if (edge < 1.0 && idx > 0.5 && u < 0.5) col = vec3(1.0);
      gl_FragColor = vec4(col, 1.0);
    }`,
    u,
  );
  const tags = new Tags(['① 잡음이 위로', '② 불꽃 모양', '③ 색 띠']);
  return {
    scene: q.scene,
    camera: q.camera,
    tone: THREE.NoToneMapping,
    update(t) {
      u.uTime.value = t;
    },
    render(r, w, h) {
      u.uRes.value.set(w, h);
      r.render(q.scene, q.camera);
      tags.draw(r, w, h, [
        [1 / 6, 0.08],
        [0.5, 0.08],
        [5 / 6, 0.08],
      ]);
    },
    controls: [
      { type: 'range', label: '흐르는 빠르기', min: 0.2, max: 3, step: 0.05, value: 1, on: (v) => (u.uSpeed.value = v) },
      { type: 'range', label: '불꽃 높이', min: 0.3, max: 0.9, step: 0.02, value: 0.62, on: (v) => (u.uH.value = v) },
    ],
    dispose() {
      q.dispose();
      tags.dispose();
    },
  };
}

/* ───────────── i59 플립북 ───────────── */

function makeSheet(): HTMLCanvasElement {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S * 4;
  const g = c.getContext('2d')!;
  let seed = 11;
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const blobs = Array.from({ length: 11 }, () => ({ a: rnd() * Math.PI * 2, d: 0.2 + rnd() * 0.8, r: 0.5 + rnd() * 0.6, up: rnd() }));
  const sparks = Array.from({ length: 12 }, () => ({ a: rnd() * Math.PI * 2, s: 0.6 + rnd() * 0.5 }));
  for (let k = 0; k < 16; k++) {
    const p = k / 15;
    const ox = (k % 4) * S + S / 2;
    const oy = Math.floor(k / 4) * S + S / 2 + 10;
    g.save();
    g.beginPath();
    g.rect((k % 4) * S, Math.floor(k / 4) * S, S, S);
    g.clip();
    // 고리
    if (p < 0.55) {
      g.strokeStyle = `rgba(255,240,200,${(1 - p / 0.55) * 0.7})`;
      g.lineWidth = 4 * (1 - p);
      g.beginPath();
      g.arc(ox, oy, 10 + p * S * 0.75, 0, Math.PI * 2);
      g.stroke();
    }
    for (const b of blobs) {
      const rise = p * p * S * 0.25 * (0.5 + b.up);
      const x = ox + Math.cos(b.a) * b.d * Math.sqrt(p) * S * 0.24;
      const y = oy + Math.sin(b.a) * b.d * Math.sqrt(p) * S * 0.16 - rise;
      const r = S * (0.07 + 0.2 * Math.sqrt(p)) * b.r;
      const smoke = clamp((p - 0.35) / 0.5, 0, 1);
      const al = p < 0.85 ? 1 : (1 - p) / 0.15;
      const core = p < 0.25 ? '255,250,210' : p < 0.5 ? '255,190,60' : '230,110,40';
      const hot = `rgba(${core},${al})`;
      const sm = Math.round(110 - smoke * 30);
      const col = smoke > 0 ? `rgba(${sm},${sm - 4},${sm + 6},${al * (0.9 - smoke * 0.3)})` : hot;
      const gr = g.createRadialGradient(x - r * 0.25, y - r * 0.25, r * 0.1, x, y, r);
      gr.addColorStop(0, smoke > 0.6 ? col : hot);
      gr.addColorStop(0.6, col);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    if (p < 0.5)
      for (const s of sparks) {
        const d0 = p * S * 0.55 * s.s;
        g.strokeStyle = `rgba(255,230,140,${1 - p * 2})`;
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(ox + Math.cos(s.a) * d0, oy + Math.sin(s.a) * d0 * 0.8);
        g.lineTo(ox + Math.cos(s.a) * (d0 + 10), oy + Math.sin(s.a) * (d0 + 10) * 0.8);
        g.stroke();
      }
    g.restore();
  }
  return c;
}

function flipbookDemo(): { draw(g: CanvasRenderingContext2D, w: number, h: number, t: number, dt: number): void; controls: Control[] } {
  const sheet = makeSheet();
  let fps = 12;
  let acc = 0;
  let frame = 0;
  return {
    draw(g, w, h, _t, dt) {
      acc += dt * fps;
      while (acc >= 1) {
        acc -= 1;
        frame = (frame + 1) % 22; // 16칸 + 쉬는 6박
      }
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#141a3e');
      bg.addColorStop(1, '#2b2462');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      const pad = Math.min(w, h) * 0.06;
      const ss = Math.min(h - pad * 2 - h * 0.1, w * 0.42);
      const sx = pad;
      const sy = (h - ss) / 2 + h * 0.03;
      const cell = ss / 4;
      // 시트
      g.fillStyle = '#0c1028';
      g.fillRect(sx, sy, ss, ss);
      g.drawImage(sheet, sx, sy, ss, ss);
      g.strokeStyle = 'rgba(255,255,255,0.18)';
      g.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        g.beginPath();
        g.moveTo(sx + i * cell, sy);
        g.lineTo(sx + i * cell, sy + ss);
        g.moveTo(sx, sy + i * cell);
        g.lineTo(sx + ss, sy + i * cell);
        g.stroke();
      }
      g.font = `600 ${Math.max(9, cell * 0.16)}px "Pretendard Variable", system-ui, sans-serif`;
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.textBaseline = 'top';
      for (let k = 0; k < 16; k++) g.fillText(String(k + 1), sx + (k % 4) * cell + 3, sy + Math.floor(k / 4) * cell + 2);
      const fs = clamp(h * 0.05, 11, 22);
      g.font = `700 ${fs}px "Pretendard Variable", system-ui, sans-serif`;
      g.fillStyle = '#cfd8ff';
      g.textAlign = 'center';
      g.fillText('그림 칸 16장 (한 장의 그림)', sx + ss / 2, Math.max(2, sy - fs * 1.4));
      if (frame < 16) {
        g.strokeStyle = '#ffd84a';
        g.lineWidth = Math.max(2, cell * 0.05);
        g.strokeRect(sx + (frame % 4) * cell + 1, sy + Math.floor(frame / 4) * cell + 1, cell - 2, cell - 2);
      }
      // 화살표
      const bx0 = sx + ss + pad * 0.5;
      const bs = Math.min(h - pad * 2 - h * 0.1, w - bx0 - pad * 1.8);
      const ax = bx0;
      const ay = sy + ss / 2;
      g.fillStyle = '#ffd84a';
      g.beginPath();
      g.moveTo(ax, ay - 7);
      g.lineTo(ax + pad * 0.9, ay);
      g.lineTo(ax, ay + 7);
      g.fill();
      // 넘겨 보이는 큰 화면
      const bx = ax + pad * 1.3;
      const by = (h - bs) / 2 + h * 0.03;
      const sky = g.createLinearGradient(0, by, 0, by + bs);
      sky.addColorStop(0, '#5aa6e8');
      sky.addColorStop(1, '#bfe6ff');
      g.save();
      g.beginPath();
      g.roundRect(bx, by, bs, bs, 12);
      g.clip();
      g.fillStyle = sky;
      g.fillRect(bx, by, bs, bs);
      g.fillStyle = '#6cc24a';
      g.fillRect(bx, by + bs * 0.72, bs, bs * 0.28);
      if (frame >= 16 || frame < 2) {
        // 터지기 전 상자
        g.fillStyle = '#c8873e';
        const b = bs * 0.16;
        g.fillRect(bx + bs / 2 - b / 2, by + bs * 0.72 - b, b, b);
        g.strokeStyle = '#7a4a1e';
        g.lineWidth = 2;
        g.strokeRect(bx + bs / 2 - b / 2, by + bs * 0.72 - b, b, b);
      }
      if (frame < 16) {
        const k = frame;
        const big = bs * 1.0;
        g.drawImage(sheet, (k % 4) * 128, Math.floor(k / 4) * 128, 128, 128, bx + bs / 2 - big / 2, by + bs * 0.72 - big * 0.62, big, big);
      }
      g.restore();
      g.strokeStyle = 'rgba(255,255,255,0.5)';
      g.lineWidth = 2;
      g.beginPath();
      g.roundRect(bx, by, bs, bs, 12);
      g.stroke();
      g.fillStyle = '#fff';
      g.fillText(frame < 16 ? `${frame + 1}번째 칸 · 1초에 ${fps}장` : '쉬는 중…', bx + bs / 2, Math.max(2, by - fs * 1.4));
      g.textAlign = 'start';
    },
    controls: [{ type: 'range', label: '1초에 넘기는 장 수', min: 2, max: 30, step: 1, value: 12, on: (v) => (fps = v) }],
  };
}

/* ───────────── 사탕 장난감 장면 (충격파 · 아지랑이 바탕) ───────────── */

function checkerTex(a: string, b: string, n = 8): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const s = 256 / n;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      g.fillStyle = (x + y) % 2 ? a : b;
      g.fillRect(x * s, y * s, s, s);
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/* ───────────── i60 충격파 화면 왜곡 ───────────── */

function shockDemo(): Scene3D {
  const scene = new THREE.Scene();
  const bg = gradTex([
    [0, '#4aa0f0'],
    [1, '#cfeaff'],
  ]);
  scene.background = bg;
  lights(scene, 0xffffff, 0x8899aa, 1.0, 1.6);
  const world = new THREE.Group();
  const ck = checkerTex('#ffe9b0', '#ffd27a');
  ck.repeat.set(5, 5);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ map: ck, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  world.add(floor);
  const COLS = [0xff5a7a, 0x4ac8ff, 0x7ad65a, 0xffb22a, 0xa07aff, 0xff7ad8];
  const toys: THREE.Mesh[] = [];
  const geos = [new THREE.SphereGeometry(0.32, 24, 16), new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.ConeGeometry(0.3, 0.6, 20), new THREE.TorusGeometry(0.24, 0.1, 12, 24)];
  let k = 0;
  for (let z = -3; z <= 1; z++)
    for (let x = -3; x <= 3; x++) {
      if (Math.abs(x) < 1 && Math.abs(z + 1) < 1) continue;
      const m = new THREE.Mesh(geos[k % 4]!, new THREE.MeshStandardMaterial({ color: COLS[k % 6]!, roughness: 0.4 }));
      m.position.set(x * 1.1, 0.35, z * 1.1);
      toys.push(m);
      world.add(m);
      k++;
    }
  const star = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshStandardMaterial({ color: 0xffe14a, emissive: 0xffa000, emissiveIntensity: 0.6, metalness: 0.3, roughness: 0.3, flatShading: true }));
  star.position.set(0, 0.8, -1.1);
  world.add(star);
  scene.add(world);
  const cam = new THREE.PerspectiveCamera(45, 1, 0.1, 60);
  cam.position.set(0, 4.2, 5.2);
  cam.lookAt(0, 0, -1);
  const rt = makeRT();
  const pu = { tScene: { value: null as THREE.Texture | null }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uAge: { value: 0 }, uC: { value: new THREE.Vector2(0.5, 0.5) }, uAmt: { value: 1 }, uOn: { value: 1 } };
  const post = fsq(
    /* glsl */ `${POST_HEAD} uniform float uAge; uniform vec2 uC; uniform float uAmt; uniform float uOn;
    void main(){
      vec2 asp = vec2(uRes.x / uRes.y, 1.0);
      vec2 d = (vUv - uC) * asp; float r = length(d);
      float R = uAge * 1.15; float th = 0.13;
      float x = (r - R) / th;
      float prof = abs(x) < 1.0 ? (1.0 - x * x) * sign(-x + 0.0001) * -1.0 : 0.0;
      float band = abs(x) < 1.0 ? 1.0 - x * x : 0.0;
      float fade = clamp(1.0 - uAge / 1.3, 0.0, 1.0);
      vec2 dir = normalize(d + 1e-5) / asp;
      vec2 off = dir * band * fade * 0.06 * uAmt * uOn * (0.6 + 0.4 * prof);
      vec3 col;
      col.r = texture2D(tScene, vUv - off * 1.25).r;
      col.g = texture2D(tScene, vUv - off).g;
      col.b = texture2D(tScene, vUv - off * 0.75).b;
      col += vec3(1.0, 0.95, 0.8) * band * fade * 0.18 * uOn;
      gl_FragColor = vec4(col, 1.0);
      ${POST_TAIL}
    }`,
    pu,
  );
  const tags = new Tags(['충격파 왜곡']);
  let mode: 'alt' | 'on' = 'alt';
  return {
    scene,
    camera: cam,
    update(t) {
      const P = 2.0;
      const age = t % P;
      const wave = Math.floor(t / P);
      pu.uAge.value = age;
      pu.uTime.value = t;
      pu.uOn.value = mode === 'on' || wave % 2 === 0 ? 1 : 0;
      tags.set(0, pu.uOn.value ? '충격파 왜곡 켬' : '왜곡 없음');
      const pop = Math.exp(-age * 6);
      star.scale.setScalar(1 + pop * 0.6);
      star.rotation.set(t * 0.7, t, 0);
      toys.forEach((m, i) => {
        m.rotation.y = t * 0.8 + i;
        m.position.y = 0.35 + Math.abs(Math.sin(t * 2 + i * 0.7)) * 0.12;
      });
    },
    render(r, w, h) {
      const target = rt.get(w, h);
      const prev = r.getRenderTarget();
      r.setRenderTarget(target);
      r.clear();
      r.render(scene, cam);
      r.setRenderTarget(prev);
      const c = toScreen(star.position, cam);
      pu.uC.value.set(c[0], 1 - c[1]);
      pu.tScene.value = target.texture;
      pu.uRes.value.set(w, h);
      r.render(post.scene, post.camera);
      tags.draw(r, w, h, [[0.5, 0.08]]);
    },
    controls: [
      { type: 'range', label: '밀어내는 세기', min: 0, max: 3, step: 0.05, value: 1, on: (v) => (pu.uAmt.value = v) },
      { type: 'toggle', label: '한 번씩 끄고 비교', value: true, on: (v) => (mode = v ? 'alt' : 'on') },
    ],
    dispose() {
      freeAll(world);
      for (const g of geos) g.dispose();
      bg.dispose();
      ck.dispose();
      rt.dispose();
      post.dispose();
      tags.dispose();
    },
  };
}

/* ───────────── i61 아지랑이 ───────────── */

function hazeDemo(): Scene3D {
  const scene = new THREE.Scene();
  const bg = gradTex([
    [0, '#ffb35a'],
    [0.55, '#ffe0a0'],
    [1, '#fff4d8'],
  ]);
  scene.background = bg;
  lights(scene, 0xfff0d0, 0xc08850, 1.0, 1.8);
  const world = new THREE.Group();
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.MeshStandardMaterial({ color: 0xe8c07a, roughness: 1 }));
  sand.rotation.x = -Math.PI / 2;
  world.add(sand);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 30), new THREE.MeshStandardMaterial({ color: 0x5a5a66, roughness: 0.9 }));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.01, -8);
  world.add(road);
  const dashM = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let i = 0; i < 12; i++) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.6), dashM);
    d.rotation.x = -Math.PI / 2;
    d.position.set(0, 0.02, 2 - i * 2);
    world.add(d);
  }
  const cactM = new THREE.MeshStandardMaterial({ color: 0x4caf5a, roughness: 0.8 });
  const rockM = new THREE.MeshStandardMaterial({ color: 0xc87a4a, roughness: 0.9, flatShading: true });
  for (let i = 0; i < 10; i++) {
    const s = i % 2 ? 1 : -1;
    const x = s * (1.6 + (i % 3) * 1.4);
    const z = -2 - i * 1.8;
    if (i % 3 === 0) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.2, 5), rockM);
      m.position.set(x * 1.5, 1.1, z - 4);
      world.add(m);
    } else {
      const c = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.9, 6, 10), cactM);
      c.position.set(x, 0.6, z);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.35, 6, 8), cactM);
      arm.position.set(0.22, 0.1, 0);
      arm.rotation.z = -0.6;
      c.add(arm);
      world.add(c);
    }
  }
  // 모닥불 둘 (왼쪽 · 오른쪽 똑같이)
  const fires: THREE.Group[] = [];
  const flameMs: THREE.Mesh[] = [];
  for (const x of [-1.5, 1.5]) {
    const f = new THREE.Group();
    const logM = new THREE.MeshStandardMaterial({ color: 0x7a4a26 });
    for (const a of [0.5, -0.5]) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 8), logM);
      l.rotation.set(Math.PI / 2, a, 0);
      l.position.y = 0.06;
      f.add(l);
    }
    for (const [c, s, y] of [
      [0xff5a1a, 1, 0.25],
      [0xffb02a, 0.7, 0.22],
      [0xfff2a0, 0.4, 0.18],
    ] as const) {
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.2 * s, 0.6 * s, 12), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, toneMapped: false }));
      fl.position.y = y + 0.05;
      f.add(fl);
      flameMs.push(fl);
    }
    f.position.set(x * 0.8, 0, 0.6);
    world.add(f);
    fires.push(f);
  }
  scene.add(world);
  const cam = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
  cam.position.set(0, 1.4, 5.4);
  cam.lookAt(0, 0.8, -2);
  const rt = makeRT();
  const pu = { tScene: { value: null as THREE.Texture | null }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uF: { value: new THREE.Vector2(0.75, 0.3) }, uHor: { value: 0.5 }, uAmt: { value: 1 }, uSplit: { value: 1 } };
  const post = fsq(
    /* glsl */ `${POST_HEAD} uniform vec2 uF; uniform float uHor; uniform float uAmt; uniform float uSplit;
    ${NOISE2}
    void main(){
      bool on = uSplit < 0.5 || vUv.x > 0.5;
      float asp = uRes.x / uRes.y;
      // 불 위 기둥 + 땅 위 신기루 띠
      float colm = exp(-pow((vUv.x - uF.x) * asp / 0.11, 2.0)) * smoothstep(uF.y - 0.04, uF.y + 0.04, vUv.y) * smoothstep(1.0, uF.y, vUv.y);
      float band = exp(-pow((vUv.y - uHor) / 0.07, 2.0)) * 0.55;
      float m = on ? clamp(colm + band, 0.0, 1.0) : 0.0;
      vec2 n = vec2(noise(vec2(vUv.x * 14.0 * asp, vUv.y * 20.0 - uTime * 3.0)), noise(vec2(vUv.x * 28.0 * asp + 3.0, vUv.y * 34.0 - uTime * 4.5))) - 0.5;
      vec2 uv = vUv + n * 0.028 * m * uAmt;
      vec3 col = texture2D(tScene, uv).rgb;
      col = mix(col, col * vec3(1.06, 1.0, 0.94), m * 0.4);
      if (uSplit > 0.5 && abs(vUv.x - 0.5) * uRes.x < 1.0) col = vec3(4.0);
      gl_FragColor = vec4(col, 1.0);
      ${POST_TAIL}
    }`,
    pu,
  );
  const tags = new Tags(['아지랑이 없음', '아지랑이 켬']);
  return {
    scene,
    camera: cam,
    update(t) {
      pu.uTime.value = t;
      flameMs.forEach((f, i) => {
        f.scale.set(1 + Math.sin(t * 13 + i) * 0.08, 1 + Math.sin(t * 9 + i * 2) * 0.15, 1);
      });
    },
    render(r, w, h) {
      const target = rt.get(w, h);
      const prev = r.getRenderTarget();
      r.setRenderTarget(target);
      r.clear();
      r.render(scene, cam);
      r.setRenderTarget(prev);
      const f = toScreen(new THREE.Vector3(1.2, 0.25, 0.6), cam);
      pu.uF.value.set(f[0], 1 - f[1]);
      const hz = toScreen(new THREE.Vector3(0, 0, -14), cam);
      pu.uHor.value = 1 - hz[1];
      pu.tScene.value = target.texture;
      pu.uRes.value.set(w, h);
      r.render(post.scene, post.camera);
      if (pu.uSplit.value > 0.5)
        tags.draw(r, w, h, [
          [0.25, 0.08],
          [0.75, 0.08],
        ]);
    },
    controls: [
      { type: 'range', label: '일렁임 세기', min: 0, max: 3, step: 0.05, value: 1, on: (v) => (pu.uAmt.value = v) },
      { type: 'toggle', label: '반씩 비교', value: true, on: (v) => (pu.uSplit.value = v ? 1 : 0) },
    ],
    dispose() {
      freeAll(world);
      bg.dispose();
      rt.dispose();
      post.dispose();
      tags.dispose();
    },
  };
}

/* ───────────── i62 에너지 방패 ───────────── */

function shieldDemo(): Scene3D {
  const scene = new THREE.Scene();
  const bg = gradTex([
    [0, '#120c36'],
    [1, '#2c1f6a'],
  ]);
  scene.background = bg;
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x302060, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(2, 4, 3);
  scene.add(key);
  const world = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 48), new THREE.MeshStandardMaterial({ color: 0x241c5a, roughness: 0.8 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.25;
  world.add(floor);
  // 안의 친구
  const pal = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 24), new THREE.MeshStandardMaterial({ color: 0xfff4e8, roughness: 0.45 }));
  body.scale.y = 0.92;
  const eyeM = new THREE.MeshStandardMaterial({ color: 0x1c1a2e, roughness: 0.3 });
  const cheekM = new THREE.MeshStandardMaterial({ color: 0xff9ab0, roughness: 0.6 });
  const eyes: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), eyeM);
    e.position.set(s * 0.18, 0.08, 0.5);
    eyes.push(e);
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), cheekM);
    c.scale.set(1.3, 0.7, 0.5);
    c.position.set(s * 0.3, -0.06, 0.45);
    pal.add(e, c);
  }
  const ant = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshBasicMaterial({ color: 0x6ff0ff }));
  ant.position.y = 0.72;
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.2, 6), eyeM);
  stalk.position.y = 0.58;
  pal.add(body, ant, stalk);
  pal.position.y = -0.55;
  world.add(pal);
  // 방패
  const hits = [0, 1, 2, 3].map(() => new THREE.Vector4(0, 1, 0, -10));
  const su = { uTime: { value: 0 }, uHits: { value: hits }, uCol: { value: new THREE.Color(0x3ad8ff) }, uHex: { value: 1 } };
  const shield = new THREE.Mesh(
    new THREE.SphereGeometry(1.3, 64, 48),
    new THREE.ShaderMaterial({
      uniforms: su,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vW; varying vec3 vP; varying vec2 vUv;
        void main(){ vUv = uv; vP = position; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `uniform float uTime; uniform vec4 uHits[4]; uniform vec3 uCol; uniform float uHex;
        varying vec3 vN; varying vec3 vW; varying vec3 vP; varying vec2 vUv;
        float hexDist(vec2 p){ p = abs(p); return max(dot(p, normalize(vec2(1.0, 1.7320508))), p.x); }
        vec4 hexC(vec2 uv){ vec2 r = vec2(1.0, 1.7320508); vec2 h = r * 0.5; vec2 a = mod(uv, r) - h; vec2 b = mod(uv - h, r) - h; vec2 gv = dot(a, a) < dot(b, b) ? a : b; return vec4(gv, uv - gv); }
        void main(){
          vec3 V = normalize(cameraPosition - vW);
          float F = pow(1.0 - abs(dot(normalize(vN), V)), 2.4);
          vec4 hc = hexC(vUv * vec2(30.0, 15.0));
          float edge = smoothstep(0.4, 0.49, hexDist(hc.xy)) * uHex;
          float rn = fract(sin(dot(hc.zw, vec2(12.9898, 78.233))) * 43758.5453);
          float pulse = pow(0.5 + 0.5 * sin(uTime * 2.0 + rn * 6.28), 4.0);
          vec3 n = normalize(vP);
          float ring = 0.0; float fill = 0.0;
          for (int i = 0; i < 4; i++){
            vec4 H = uHits[i]; float age = uTime - H.w;
            if (age < 0.0 || age > 1.4) continue;
            float ang = acos(clamp(dot(n, H.xyz), -1.0, 1.0));
            ring += exp(-pow((ang - age * 2.4) * 7.0, 2.0)) * (1.0 - age / 1.4);
            fill += exp(-ang * 5.0) * max(0.0, 1.0 - age * 2.5);
          }
          float a = F * 0.95 + edge * (0.1 + 0.3 * F) + edge * pulse * 0.12 + ring * (0.35 + edge * 1.3) + fill * 0.9 + 0.035;
          vec3 col = uCol * a + vec3(1.0) * (ring * edge * 0.5 + fill * 0.6);
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  world.add(shield);
  // 날아오는 공
  const shots = [0, 1, 2].map((i) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffa23a }));
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.add(glow);
    world.add(m);
    return { m, dir: new THREE.Vector3(), s: 0, wait: i * 0.55 };
  });
  let seed = 3;
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const respawn = (s: (typeof shots)[number]): void => {
    const a = rnd() * Math.PI * 2;
    const y = (rnd() - 0.3) * 0.9;
    s.dir.set(Math.cos(a), y, Math.sin(a) * 0.6 + 0.6).normalize();
    s.s = 4.5;
  };
  shots.forEach(respawn);
  scene.add(world);
  let slot = 0;
  let rate = 1;
  const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  cam.position.set(0, 0.7, 5.0);
  cam.lookAt(0, -0.1, 0);
  return {
    scene,
    camera: cam,
    update(t, dt) {
      su.uTime.value = t;
      pal.position.y = -0.55 + Math.sin(t * 2) * 0.05;
      const blink = (t % 3.2) < 0.12 ? 0.15 : 1;
      for (const e of eyes) e.scale.y = blink;
      for (const s of shots) {
        if (s.wait > 0) {
          s.wait -= dt;
          s.m.visible = false;
          continue;
        }
        s.m.visible = true;
        s.s -= dt * 3.2 * rate;
        if (s.s <= 1.3) {
          const h = hits[slot]!;
          h.set(s.dir.x, s.dir.y, s.dir.z, t);
          slot = (slot + 1) % 4;
          respawn(s);
          s.wait = 0.3 + rnd() * 0.6;
        }
        s.m.position.copy(s.dir).multiplyScalar(s.s);
      }
      shield.rotation.y = t * 0.1;
    },
    controls: [
      { type: 'range', label: '공 빠르기', min: 0.2, max: 3, step: 0.05, value: 1, on: (v) => (rate = v) },
      { type: 'toggle', label: '육각 무늬', value: true, on: (v) => (su.uHex.value = v ? 1 : 0) },
    ],
    dispose() {
      freeAll(world);
      bg.dispose();
    },
  };
}

/* ───────────── i63 번개 (중간점 변위) ───────────── */

type Seg = [number, number, number, number, number];
function bolt(out: Seg[], x1: number, y1: number, x2: number, y2: number, depth: number, rough: number, w: number, rnd: () => number, lvl: number): void {
  if (depth <= 0) {
    out.push([x1, y1, x2, y2, w]);
    return;
  }
  const len = Math.hypot(x2 - x1, y2 - y1);
  const nx = -(y2 - y1) / len;
  const ny = (x2 - x1) / len;
  const off = (rnd() - 0.5) * len * rough;
  const mx = (x1 + x2) / 2 + nx * off;
  const my = (y1 + y2) / 2 + ny * off;
  bolt(out, x1, y1, mx, my, depth - 1, rough, w, rnd, lvl);
  bolt(out, mx, my, x2, y2, depth - 1, rough, w, rnd, lvl);
  if (lvl < 2 && depth >= 2 && rnd() < 0.3) {
    const ang = Math.atan2(y2 - y1, x2 - x1) + (rnd() < 0.5 ? -1 : 1) * (0.35 + rnd() * 0.5);
    const bl = len * (0.5 + rnd() * 0.4);
    bolt(out, mx, my, mx + Math.cos(ang) * bl, my + Math.sin(ang) * bl, depth - 1, rough, w * 0.55, rnd, lvl + 1);
  }
}

function lightningDemo(): Scene3D {
  const scene = new THREE.Scene();
  const bgCol = new THREE.Color();
  scene.background = bgCol;
  const amb = new THREE.HemisphereLight(0xa0b0ff, 0x302040, 2.0);
  scene.add(amb);
  const flash = new THREE.PointLight(0xc8d0ff, 0, 12, 1.2);
  flash.position.set(0, 0.5, 1.5);
  scene.add(flash);
  const world = new THREE.Group();
  const cloudM = new THREE.MeshStandardMaterial({ color: 0x8a8cb4, roughness: 1 });
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.6 + (i % 3) * 0.2, 20, 14), cloudM);
    s.position.set(-3.2 + i * 0.8, 2.4 + Math.sin(i * 1.7) * 0.2, -0.6 - (i % 2) * 0.4);
    s.scale.y = 0.65;
    world.add(s);
  }
  const hill = new THREE.Mesh(new THREE.SphereGeometry(4, 32, 16), new THREE.MeshStandardMaterial({ color: 0x3a6a4a, roughness: 1 }));
  hill.position.set(0, -5.6, -1);
  hill.scale.x = 1.6;
  world.add(hill);
  // 피뢰침 탑
  const poleM = new THREE.MeshStandardMaterial({ color: 0x9aa2b8, metalness: 0.7, roughness: 0.3 });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 1.2, 8), poleM);
  tower.position.set(0.3, -1.3, 0);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), poleM);
  tip.position.set(0.3, -0.68, 0);
  const house = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 0.5), new THREE.MeshStandardMaterial({ color: 0xd88a5a }));
  house.position.set(-1.2, -1.55, 0);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.35, 4), new THREE.MeshStandardMaterial({ color: 0x8a3a3a }));
  roof.rotation.y = Math.PI / 4;
  roof.position.set(-1.2, -1.15, 0);
  world.add(tower, tip, house, roof);
  scene.add(world);
  const glowU = { uW: { value: 6 }, uI: { value: 0 }, uC: { value: new THREE.Color(0x7a6aff) }, uK: { value: 2.2 } };
  const coreU = { uW: { value: 1.2 }, uI: { value: 0 }, uC: { value: new THREE.Color(0xffffff) }, uK: { value: 1.5 } };
  const mkMat = (u: typeof glowU): THREE.ShaderMaterial =>
    new THREE.ShaderMaterial({
      uniforms: u,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `attribute vec2 aN; attribute float aSide; attribute float aW; uniform float uW; varying float vS;
        void main(){ vS = aSide; vec3 p = position + vec3(aN * aSide * aW * uW, 0.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
      fragmentShader: /* glsl */ `uniform float uI; uniform vec3 uC; uniform float uK; varying float vS;
        void main(){ float a = exp(-vS * vS * uK * 2.0); gl_FragColor = vec4(uC * a * uI, 1.0); }`,
    });
  const glowM = mkMat(glowU);
  const coreM = mkMat(coreU);
  let geo = new THREE.BufferGeometry();
  const glowMesh = new THREE.Mesh(geo, glowM);
  const coreMesh = new THREE.Mesh(geo, coreM);
  glowMesh.frustumCulled = coreMesh.frustumCulled = false;
  glowMesh.renderOrder = coreMesh.renderOrder = 5;
  scene.add(glowMesh, coreMesh);
  let depth = 7;
  let rough = 0.5;
  let seed = 1;
  let strike = -1;
  let sub = -1;
  let startX = 0;
  const build = (s: number): void => {
    let sd = s * 7919 + 13;
    const rnd = (): number => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    const segs: Seg[] = [];
    bolt(segs, startX, 2.0, 0.3, -0.68, depth, rough, 0.02, rnd, 0);
    const n = segs.length;
    const pos = new Float32Array(n * 4 * 3);
    const nn = new Float32Array(n * 4 * 2);
    const side = new Float32Array(n * 4);
    const ww = new Float32Array(n * 4);
    const idx: number[] = [];
    segs.forEach(([x1, y1, x2, y2, w], i) => {
      const L = Math.hypot(x2 - x1, y2 - y1) || 1;
      const nx = -(y2 - y1) / L;
      const ny = (x2 - x1) / L;
      // 이음새가 벌어지지 않게 양끝을 조금 늘린다
      const ex = ((x2 - x1) / L) * w;
      const ey = ((y2 - y1) / L) * w;
      const P = [x1 - ex, y1 - ey, x1 - ex, y1 - ey, x2 + ex, y2 + ey, x2 + ex, y2 + ey];
      for (let k = 0; k < 4; k++) {
        pos.set([P[k * 2]!, P[k * 2 + 1]!, 0], (i * 4 + k) * 3);
        nn.set([nx, ny], (i * 4 + k) * 2);
        side[i * 4 + k] = k % 2 ? 1 : -1;
        ww[i * 4 + k] = w;
      }
      const a = i * 4;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aN', new THREE.BufferAttribute(nn, 2));
    g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    g.setAttribute('aW', new THREE.BufferAttribute(ww, 1));
    g.setIndex(idx);
    geo.dispose();
    geo = g;
    glowMesh.geometry = g;
    coreMesh.geometry = g;
  };
  const tags = new Tags(['중간점 변위 7단계']);
  const cam = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
  cam.position.set(0, 0.2, 6.2);
  cam.lookAt(0, 0.2, 0);
  const P = 1.4;
  build(0);
  return {
    scene,
    camera: cam,
    tone: THREE.ACESFilmicToneMapping,
    update(t) {
      const id = Math.floor(t / P);
      const ph = t % P;
      if (id !== strike) {
        strike = id;
        seed = id;
        sub = -1;
        startX = Math.sin(id * 2.3) * 1.8;
      }
      const s2 = ph < 0.14 ? 0 : 1;
      if (s2 !== sub) {
        sub = s2;
        build(seed * 3 + s2);
      }
      const on = ph < 0.65;
      const I = on ? (0.55 + 0.45 * Math.abs(Math.sin(ph * 40))) * Math.pow(1 - ph / 0.65, 0.7) : 0;
      glowU.uI.value = I * 0.9;
      coreU.uI.value = I * 2.2;
      flash.intensity = I * 30;
      flash.position.x = (startX + 0.3) / 2;
      bgCol.setRGB(0.04 + I * 0.25, 0.04 + I * 0.25, 0.1 + I * 0.4);
      amb.intensity = 2.0 + I * 3;
      tags.set(0, `중간점 변위 ${depth}단계`);
    },
    render(r, w, h) {
      r.render(scene, cam);
      tags.draw(r, w, h, [[0.5, 0.92]]);
    },
    controls: [
      {
        type: 'range',
        label: '갈라지는 단계 (중간점을 몇 번 꺾나)',
        min: 1,
        max: 9,
        step: 1,
        value: 7,
        on: (v) => {
          depth = v;
          build(seed * 3 + sub);
        },
      },
      {
        type: 'range',
        label: '꺾임 정도',
        min: 0,
        max: 1,
        step: 0.05,
        value: 0.5,
        on: (v) => {
          rough = v;
          build(seed * 3 + sub);
        },
      },
    ],
    dispose() {
      freeAll(world);
      geo.dispose();
      glowM.dispose();
      coreM.dispose();
      tags.dispose();
    },
  };
}

/* ───────────── i64 포털 ───────────── */

function portalDemo(): Scene3D {
  // 이쪽 세상 — 낮 풀밭
  const scene = new THREE.Scene();
  const bg = gradTex([
    [0, '#5aa8ec'],
    [1, '#d8f0ff'],
  ]);
  scene.background = bg;
  lights(scene);
  const world = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.CircleGeometry(12, 48), new THREE.MeshStandardMaterial({ color: 0x86cc5a, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  world.add(ground);
  const leaf = new THREE.MeshStandardMaterial({ color: 0x3c9c48, flatShading: true });
  const trunkM = new THREE.MeshStandardMaterial({ color: 0x8a5a32 });
  for (const [x, z] of [
    [-2.6, -1.5],
    [2.8, -2.2],
    [-3.5, -4],
    [1.2, -4.5],
    [3.6, 0.6],
  ] as const) {
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.6, 8), trunkM);
    tr.position.set(x, 0.3, z);
    const tp = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), leaf);
    tp.position.set(x, 0.95, z);
    world.add(tr, tp);
  }
  const stoneM = new THREE.MeshStandardMaterial({ color: 0x8e86a8, roughness: 0.8, flatShading: true });
  const arch = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.16, 10, 40), stoneM);
  arch.position.set(0, 1.4, 0);
  const baseL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.5), stoneM);
  baseL.position.set(-1.0, 0.15, 0);
  const baseR = baseL.clone();
  baseR.position.x = 1.0;
  world.add(arch, baseL, baseR);
  scene.add(world);
  // 저쪽 세상 — 보랏빛 밤하늘 · 떠 있는 행성 · 빛나는 수정
  const other = new THREE.Scene();
  const bg2 = gradTex([
    [0, '#120a3a'],
    [0.6, '#5a2a8a'],
    [1, '#ff8ab8'],
  ]);
  other.background = bg2;
  other.add(new THREE.HemisphereLight(0xc0a0ff, 0x401a60, 1.0));
  const ol = new THREE.DirectionalLight(0xffc0f0, 1.5);
  ol.position.set(2, 3, 2);
  other.add(ol);
  const ow = new THREE.Group();
  const og = new THREE.Mesh(new THREE.CircleGeometry(14, 48), new THREE.MeshStandardMaterial({ color: 0x2a1a5a, roughness: 0.9 }));
  og.rotation.x = -Math.PI / 2;
  ow.add(og);
  const planet = new THREE.Mesh(new THREE.SphereGeometry(1.1, 32, 24), new THREE.MeshStandardMaterial({ color: 0xffa04a, emissive: 0x803010, emissiveIntensity: 0.4 }));
  planet.position.set(1.5, 3.2, -6);
  const pring = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.06, 6, 48), new THREE.MeshBasicMaterial({ color: 0xffe0a0 }));
  pring.rotation.x = 1.2;
  planet.add(pring);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(0.4, 20, 14), new THREE.MeshStandardMaterial({ color: 0x9ad8ff, emissive: 0x2050a0, emissiveIntensity: 0.5 }));
  moon.position.set(-2, 2.6, -4);
  ow.add(planet, moon);
  const crysM = new THREE.MeshStandardMaterial({ color: 0x7af0ff, emissive: 0x20a0c0, emissiveIntensity: 1.2, roughness: 0.2, flatShading: true });
  const crystals: THREE.Mesh[] = [];
  for (let i = 0; i < 7; i++) {
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.25 + (i % 3) * 0.12, 0), crysM);
    c.position.set(-2.5 + i * 0.85, 0.5 + (i % 2) * 0.4, -1.5 - (i % 3) * 1.2);
    c.scale.y = 1.8;
    crystals.push(c);
    ow.add(c);
  }
  const SN = 300;
  const sp = new Float32Array(SN * 3);
  for (let i = 0; i < SN; i++) {
    const a = i * 2.399;
    const r = 8 + (i % 7);
    sp.set([Math.cos(a) * r, 1 + ((i * 37) % 100) / 12, -Math.abs(Math.sin(a)) * r - 2], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  ow.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.08 })));
  other.add(ow);
  // 문 — 저쪽 장면을 같은 카메라로 그려 화면 좌표로 붙인다 + 가장자리 소용돌이
  const rt = makeRT();
  const pu = { tWorld: { value: null as THREE.Texture | null }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uSwirl: { value: 1 } };
  const door = new THREE.Mesh(
    new THREE.CircleGeometry(1.08, 64),
    new THREE.ShaderMaterial({
      uniforms: pu,
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `uniform sampler2D tWorld; uniform vec2 uRes; uniform float uTime; uniform float uSwirl; varying vec2 vUv;
        void main(){
          vec2 c = vUv - 0.5; float r = length(c) * 2.0; float a = atan(c.y, c.x);
          vec2 suv = gl_FragCoord.xy / uRes;
          float sw = smoothstep(0.45, 1.0, r) * uSwirl;
          suv += vec2(cos(a + 1.57), sin(a + 1.57)) * sw * 0.035 * (0.6 + 0.4 * sin(r * 18.0 - uTime * 5.0));
          vec3 col = texture2D(tWorld, suv).rgb;
          float spiral = 0.5 + 0.5 * sin(a * 5.0 + r * 12.0 - uTime * 4.0);
          vec3 glow = mix(vec3(0.6, 0.2, 1.0), vec3(0.2, 0.9, 1.0), spiral) * 2.0;
          col = mix(col, glow, sw * sw * (0.35 + 0.65 * spiral));
          col += vec3(0.9, 0.7, 1.0) * smoothstep(0.85, 1.0, r) * 1.5;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  door.position.set(0, 1.4, 0.01);
  scene.add(door);
  // 문 둘레 빛 알갱이
  const PN = 80;
  const pp = new Float32Array(PN * 3);
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  const sparks = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xc8a0ff, size: 0.07, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(sparks);
  const cam = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
  return {
    scene,
    camera: cam,
    update(t) {
      pu.uTime.value = t;
      const a = Math.sin(t * 0.35) * 0.65;
      cam.position.set(Math.sin(a) * 5.4, 1.6, Math.cos(a) * 5.4);
      cam.lookAt(0, 1.2, 0);
      planet.rotation.y = t * 0.3;
      crystals.forEach((c, i) => {
        c.rotation.y = t + i;
        c.position.y = 0.6 + (i % 2) * 0.4 + Math.sin(t * 1.5 + i) * 0.12;
      });
      for (let i = 0; i < PN; i++) {
        const an = (i / PN) * Math.PI * 2 + t * (i % 2 ? 0.8 : -0.5);
        const r = 1.25 + Math.sin(t * 3 + i) * 0.08;
        pp.set([Math.cos(an) * r, 1.4 + Math.sin(an) * r, 0.1 + Math.sin(i) * 0.1], i * 3);
      }
      pg.attributes['position']!.needsUpdate = true;
    },
    render(r, w, h) {
      const target = rt.get(w, h);
      const prev = r.getRenderTarget();
      r.setRenderTarget(target);
      r.clear();
      r.render(other, cam);
      r.setRenderTarget(prev);
      pu.tWorld.value = target.texture;
      pu.uRes.value.set(w, h);
      r.render(scene, cam);
    },
    controls: [{ type: 'range', label: '소용돌이', min: 0, max: 2, step: 0.05, value: 1, on: (v) => (pu.uSwirl.value = v) }],
    dispose() {
      freeAll(world, ow, door, sparks);
      bg.dispose();
      bg2.dispose();
      rt.dispose();
    },
  };
}

/* ───────────── i65 꼬리 · 리본 ───────────── */

class Ribbon {
  pts: { p: THREE.Vector3; t: number }[] = [];
  geo = new THREE.BufferGeometry();
  mesh: THREE.Mesh;
  private pos: Float32Array;
  private al: Float32Array;
  constructor(
    color: number,
    private width: number,
    private max = 220,
  ) {
    this.pos = new Float32Array(max * 2 * 3);
    this.al = new Float32Array(max * 2);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aA', new THREE.BufferAttribute(this.al, 1));
    const sd = new Float32Array(max * 2);
    for (let i = 0; i < max * 2; i++) sd[i] = i % 2 ? -1 : 1;
    this.geo.setAttribute('aS', new THREE.BufferAttribute(sd, 1));
    const idx: number[] = [];
    for (let i = 0; i < max - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(
      this.geo,
      new THREE.ShaderMaterial({
        uniforms: { uC: { value: new THREE.Color(color) } },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `attribute float aA; attribute float aS; varying float vA; varying float vS;
          void main(){ vA = aA; vS = aS; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `uniform vec3 uC; varying float vA; varying float vS;
          void main(){ float e = 1.0 - vS * vS; gl_FragColor = vec4((uC + vec3(0.5) * e * vA) * vA * (0.35 + 0.65 * e), 1.0); }`,
      }),
    );
    this.mesh.frustumCulled = false;
  }
  push(p: THREE.Vector3, t: number, life: number): void {
    const last = this.pts[0];
    if (!last || last.p.distanceToSquared(p) > 0.0004) this.pts.unshift({ p: p.clone(), t });
    while (this.pts.length > this.max || (this.pts.length > 1 && t - this.pts[this.pts.length - 1]!.t > life)) this.pts.pop();
  }
  clear(): void {
    this.pts.length = 0;
  }
  build(cam: THREE.Camera, t: number, life: number): void {
    const n = this.pts.length;
    const tan = new THREE.Vector3();
    const view = new THREE.Vector3();
    const side = new THREE.Vector3();
    for (let i = 0; i < this.max; i++) {
      const k = Math.min(i, Math.max(0, n - 1));
      const q = this.pts[k];
      if (!q) {
        this.pos.fill(0, i * 6, i * 6 + 6);
        this.al[i * 2] = this.al[i * 2 + 1] = 0;
        continue;
      }
      const a = this.pts[Math.max(0, k - 1)]!.p;
      const b = this.pts[Math.min(n - 1, k + 1)]!.p;
      tan.subVectors(a, b);
      if (tan.lengthSq() < 1e-8) tan.set(1, 0, 0);
      view.subVectors(cam.position, q.p);
      side.crossVectors(tan, view).normalize();
      const age = clamp((t - q.t) / life, 0, 1);
      const w = this.width * (1 - age * 0.85);
      this.pos.set([q.p.x + side.x * w, q.p.y + side.y * w, q.p.z + side.z * w, q.p.x - side.x * w, q.p.y - side.y * w, q.p.z - side.z * w], i * 6);
      const al = i < n ? Math.pow(1 - age, 1.4) : 0;
      this.al[i * 2] = this.al[i * 2 + 1] = al;
    }
    this.geo.attributes['position']!.needsUpdate = true;
    this.geo.attributes['aA']!.needsUpdate = true;
  }
  dispose(): void {
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

function trailDemo(): Scene3D {
  const scene = new THREE.Scene();
  const bg = gradTex([
    [0, '#0e1236'],
    [1, '#2a2a66'],
  ]);
  scene.background = bg;
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x302860, 1.2));
  const dl = new THREE.DirectionalLight(0xffffff, 1.2);
  dl.position.set(2, 4, 5);
  scene.add(dl);
  const world = new THREE.Group();
  const GY = -1.3;
  const R = 0.42;
  const groundL = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.06, 0.6), new THREE.MeshStandardMaterial({ color: 0x5a6aa8 }));
  groundL.position.set(0, GY - 0.03, 0);
  world.add(groundL);
  const wheel = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.TorusGeometry(R, 0.045, 10, 40), new THREE.MeshStandardMaterial({ color: 0xe8ecff, roughness: 0.4 }));
  wheel.add(tire);
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, R * 2, 6), new THREE.MeshStandardMaterial({ color: 0xaab4e0 }));
    s.rotation.z = (i * Math.PI) / 4;
    wheel.add(s);
  }
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff5a8a }));
  dot.position.set(0, -R, 0);
  wheel.add(dot);
  world.add(wheel);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffd23a, emissive: 0x805000, emissiveIntensity: 0.6 }));
  const comet = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), new THREE.MeshBasicMaterial({ color: 0x7ae8ff }));
  const sunB = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffb04a }));
  sunB.position.set(1.4, 1.35, 0);
  world.add(ball, comet, sunB);
  scene.add(world);
  const rC = new Ribbon(0xff4a8a, 0.06);
  const rB = new Ribbon(0xffc82a, 0.06);
  const rO = new Ribbon(0x3ad0ff, 0.06);
  scene.add(rC.mesh, rB.mesh, rO.mesh);
  const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  cam.position.set(0, 0.15, 7.4);
  cam.lookAt(0, 0.1, 0);
  let life = 2.2;
  let show = true;
  let lastLoop = -1;
  let now = 0;
  // 튀는 공 (수치 적분)
  const bp = new THREE.Vector3(-2.7, 0, 0);
  const bv = new THREE.Vector3(1.3, 3.0, 0);
  const tmp = new THREE.Vector3();
  const tags = new Tags(['사이클로이드', '포물선', '타원 궤도']);
  return {
    scene,
    camera: cam,
    tone: THREE.ACESFilmicToneMapping,
    update(t, dt) {
      now = t;
      // 굴러가는 바퀴 위 한 점 → 사이클로이드
      const span = 5.2;
      const loop = Math.floor((t * 0.8) / span);
      const x = -2.6 + ((t * 0.8) % span);
      if (loop !== lastLoop) {
        lastLoop = loop;
        rC.clear();
      }
      wheel.position.set(x, GY + R, 0);
      wheel.rotation.z = -(x + 2.6) / R;
      dot.getWorldPosition(tmp);
      rC.push(tmp, t, life);
      // 포물선
      let left = Math.min(dt, 0.1);
      while (left > 0) {
        const h = Math.min(left, 1 / 120);
        left -= h;
        bv.y -= 6.0 * h;
        bp.addScaledVector(bv, h);
        if (bp.y < -0.2 && bv.y < 0) {
          bp.y = -0.2;
          bv.y = -bv.y * 0.78;
        }
        if (bp.x > 2.7) {
          bp.set(-2.7, 0, 0);
          bv.set(1.3, 3.0, 0);
          rB.clear();
        }
      }
      ball.position.copy(bp);
      rB.push(bp, t, life);
      // 타원 궤도
      const a = t * 1.6;
      comet.position.set(1.4 + Math.cos(a) * 1.1, 1.35 + Math.sin(a) * 0.45, Math.sin(a) * 0.4);
      rO.push(comet.position, t, life);
      for (const rb of [rC, rB, rO]) rb.mesh.visible = show;
    },
    render(r, w, h) {
      for (const rb of [rC, rB, rO]) rb.build(cam, now, life);
      r.render(scene, cam);
      tags.draw(r, w, h, [toScreen(new THREE.Vector3(-1.6, GY - 0.3, 0), cam), toScreen(new THREE.Vector3(-1.6, 1.25, 0), cam), toScreen(new THREE.Vector3(1.4, 2.05, 0), cam)]);
    },
    controls: [
      { type: 'toggle', label: '꼬리 보이기', value: true, on: (v) => (show = v) },
      { type: 'range', label: '꼬리 길이 (초)', min: 0.3, max: 5, step: 0.1, value: 2.2, on: (v) => (life = v) },
    ],
    dispose() {
      freeAll(world);
      for (const rb of [rC, rB, rO]) rb.dispose();
      bg.dispose();
      tags.dispose();
    },
  };
}

/* ───────────── 등록 ───────────── */

export const DEMOS: DemoMap = {
  u22: { kind: '3d', caption: '왼쪽 일반 재질 · 오른쪽 강물 셰이더 — 잔물결 · 하늘 반사 · 햇빛 반짝 · 기슭과 배 둘레 거품', make: () => riverDemo() },
  u23: { kind: '3d', caption: '왼쪽 그냥 바닥 · 오른쪽 커스틱 — 물결이 모은 햇빛이 바닥에 그물처럼 일렁여요', make: () => causticDemo() },
  u24: { kind: '3d', caption: '흐르는 물(띠를 따라 흐름) · 연못(물방울이 닿으면 동그란 물결) · 병 속 물(속에서 빛 무늬)', make: () => waterKitDemo() },
  u25: { kind: '3d', caption: '왼쪽은 물을 통에 그냥 붙임 · 오른쪽은 평면 y = h 위를 잘라 내 — 통이 기울어도 수면은 수평', make: () => flatWaterDemo() },
  u26: { kind: '3d', caption: '그러데이션 하늘 돔과 해 · 출렁이는 바다(물마루 · 섬 둘레 거품) · 거품 줄이 흘러내리는 폭포', make: () => seaDemo() },
  u27: { kind: '3d', caption: '위로 갈수록 옅어지는 원뿔 빛기둥 · 점마다 다른 때에 반짝이는 별 알갱이', make: () => beamDemo() },
  i56: { kind: '3d', caption: '물체 없이 거리 함수만으로 그린 장면 — 합 · 부드러운 합 · 교 · 차가 차례로 바뀌어요', make: () => sdfDemo() },
  i57: { kind: '3d', caption: '왼쪽 부피 불 · 오른쪽 부피 구름 — 3D 잡음 밀도를 광선이 훑으며 빛을 모아요', make: () => volumeDemo() },
  i58: { kind: '3d', caption: '① 위로 흐르는 잡음 → ② 불꽃 모양으로 깎기 → ③ 밝기에 따라 색 띠 — 이것만으로 불', make: () => fire2dDemo() },
  i59: { kind: '2d', caption: '왼쪽 그림 칸 16장(한 장) · 오른쪽 그 칸을 차례로 넘겨 보이는 폭발', make: () => flipbookDemo() },
  i60: { kind: '3d', caption: '별이 터질 때 고리가 퍼지며 화면을 밀어 일그러뜨려요 (한 번은 켬, 한 번은 끔)', make: () => shockDemo() },
  i61: { kind: '3d', caption: '왼쪽 그대로 · 오른쪽 아지랑이 — 모닥불 위와 먼 땅 위 공기가 일렁여요', make: () => hazeDemo() },
  i62: { kind: '3d', caption: '프레넬 테두리 · 육각 무늬 방패 — 공이 맞은 곳에서 고리가 퍼져요', make: () => shieldDemo() },
  i63: { kind: '3d', caption: '선을 반으로 나눠 가운데를 꺾기를 되풀이 → 갈라지는 번개 + 빛 번짐 · 번쩍', make: () => lightningDemo() },
  i64: { kind: '3d', caption: '문 안에 다른 세상(같은 카메라로 그림)이 보이고, 가장자리는 소용돌이쳐요', make: () => portalDemo() },
  i65: { kind: '3d', caption: '지난 위치를 이은 리본이 시간 따라 사라져요 — 사이클로이드 · 포물선 · 타원 궤도', make: () => trailDemo() },
};

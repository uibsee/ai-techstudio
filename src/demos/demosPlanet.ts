import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { DemoMap, Scene3D } from './types';

/**
 * 견본 — 작은 행성 · 아기자기한 자연  i536 ~ i539 (2026-10-08)
 *  i536 작은 행성 산책 — 구면 중력(발밑 = 행성 중심 쪽) · 따라 도는 카메라 · 구면 잡음 지형 · 기슭 물거품 · 구 위 흩뿌리기
 *  i537 휘는 지평선 — 정점 셰이더에서 거리² 만큼 내려 평평한 마을이 둥근 행성처럼
 *  i538 동화 뭉게 나무 — 잎 카드 법선을 감싸는 구 법선으로 바꾸기 + 줄기 · 가지 · 잎 층별 바람
 *  i539 육각 타일 행성 — 정이십면체 나누기의 쌍대(골드버그 다면체): 육각형 + 오각형 12개, V − E + F = 2
 * 잡음은 CPU 에서 한 번 굽는다 (셰이더 반복문 잡음은 윈도 D3D 컴파일이 느리다).
 */

const TAU = Math.PI * 2;
const FONT = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
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
    return (s >>> 0) / 4294967296;
  };
}

/* ───────────── 3D 값 잡음 (CPU) ───────────── */

function hash3(x: number, y: number, z: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 144665) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise3(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fy = y - yi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);
  const c = (i: number, j: number, k: number): number => hash3(xi + i, yi + j, zi + k, seed);
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), u);
  const x10 = lerp(c(0, 1, 0), c(1, 1, 0), u);
  const x01 = lerp(c(0, 0, 1), c(1, 0, 1), u);
  const x11 = lerp(c(0, 1, 1), c(1, 1, 1), u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}
function fbm3(x: number, y: number, z: number, seed: number, oct = 5): number {
  let s = 0;
  let a = 0.5;
  let f = 1;
  let tot = 0;
  for (let o = 0; o < oct; o++) {
    s += a * vnoise3(x * f, y * f, z * f, seed + o * 17);
    tot += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / tot;
}

/* ───────────── 정점을 함께 쓰는 측지 구 (정이십면체 나누기) ───────────── */

function icosphere(detail: number): { pos: number[]; idx: number[] } {
  const t = (1 + Math.sqrt(5)) / 2;
  const pos: number[] = [];
  const add = (x: number, y: number, z: number): number => {
    const l = Math.hypot(x, y, z);
    pos.push(x / l, y / l, z / l);
    return pos.length / 3 - 1;
  };
  for (const [x, y, z] of [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ] as const)
    add(x, y, z);
  let idx = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
  for (let d = 0; d < detail; d++) {
    const cache = new Map<number, number>();
    const mid = (a: number, b: number): number => {
      const key = a < b ? a * 1e6 + b : b * 1e6 + a;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const i = add((pos[a * 3]! + pos[b * 3]!) / 2, (pos[a * 3 + 1]! + pos[b * 3 + 1]!) / 2, (pos[a * 3 + 2]! + pos[b * 3 + 2]!) / 2);
      cache.set(key, i);
      return i;
    };
    const next: number[] = [];
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i]!;
      const b = idx[i + 1]!;
      const c = idx[i + 2]!;
      const ab = mid(a, b);
      const bc = mid(b, c);
      const ca = mid(c, a);
      next.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
    }
    idx = next;
  }
  return { pos, idx };
}

/* ───────────── 글씨 판 (화면 위 겹 — 바뀔 때만 다시 그림) ───────────── */

interface Tag {
  text: string;
  x: number;
  y: number;
  ax: number;
  ay: number;
  bg?: string;
  big?: boolean;
}
class Overlay {
  private canvas = document.createElement('canvas');
  private tex = new THREE.CanvasTexture(this.canvas);
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private key = '';
  constructor() {
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    this.scene.add(m);
  }
  draw(r: THREE.WebGLRenderer, w: number, h: number, tags: Tag[]): void {
    const key = `${w}x${h}|${tags.map((t) => `${t.text}${t.x}${t.y}${t.bg ?? ''}`).join('|')}`;
    if (key !== this.key) {
      this.key = key;
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
        g.fillStyle = t.bg ?? 'rgba(20,28,48,0.62)';
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

/** 크게 보기 화면 캔버스 (같은 크기의 hub 캔버스) — 카드에서는 null */
function findBigCanvas(w: number, h: number): HTMLCanvasElement | null {
  if (w < 700) return null;
  for (const c of Array.from(document.querySelectorAll<HTMLCanvasElement>('canvas.hub-canvas'))) if (c.width === w && c.height === h) return c;
  return null;
}
/** 크게 보기 입력 — 누르기 · 끌기 · 키 */
class Input {
  el: HTMLCanvasElement | null = null;
  keys = new Set<string>();
  taps: { x: number; y: number }[] = [];
  drag: { dx: number; dy: number } = { dx: 0, dy: 0 };
  private down: { x: number; y: number; moved: boolean } | null = null;
  constructor(private wantKeys: boolean) {}
  attach(w: number, h: number): void {
    if (this.el) return;
    const c = findBigCanvas(w, h);
    if (!c) return;
    this.el = c;
    c.style.cursor = 'pointer';
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', this.pd);
    window.addEventListener('pointermove', this.pm);
    window.addEventListener('pointerup', this.pu);
    if (this.wantKeys) {
      window.addEventListener('keydown', this.kd);
      window.addEventListener('keyup', this.ku);
      window.addEventListener('blur', this.bl);
    }
  }
  private ndc(e: PointerEvent): { x: number; y: number } {
    const r = this.el!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 };
  }
  private pd = (e: PointerEvent): void => {
    this.down = { x: e.clientX, y: e.clientY, moved: false };
  };
  private pm = (e: PointerEvent): void => {
    if (!this.down) return;
    const dx = e.clientX - this.down.x;
    const dy = e.clientY - this.down.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) this.down.moved = true;
    if (this.down.moved) {
      this.drag.dx += dx;
      this.drag.dy += dy;
      this.down.x = e.clientX;
      this.down.y = e.clientY;
    }
  };
  private pu = (e: PointerEvent): void => {
    if (this.down && !this.down.moved && this.el) this.taps.push(this.ndc(e));
    this.down = null;
  };
  private kd = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    if (!['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', ' '].includes(k)) return;
    const tgt = e.target as HTMLElement | null;
    if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA') && (tgt as HTMLInputElement).type !== 'range' && (tgt as HTMLInputElement).type !== 'checkbox') return;
    e.preventDefault();
    this.keys.add(k);
  };
  private ku = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());
  };
  private bl = (): void => this.keys.clear();
  dispose(): void {
    if (this.el) {
      this.el.removeEventListener('pointerdown', this.pd);
      this.el.style.cursor = '';
      this.el = null;
    }
    window.removeEventListener('pointermove', this.pm);
    window.removeEventListener('pointerup', this.pu);
    if (this.wantKeys) {
      window.removeEventListener('keydown', this.kd);
      window.removeEventListener('keyup', this.ku);
      window.removeEventListener('blur', this.bl);
    }
  }
}

/** 파스텔 하늘 배경 (위 하늘색 → 아래 연한 복숭아) */
function pastelSky(top: string, mid: string, bottom: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, top);
  gr.addColorStop(0.55, mid);
  gr.addColorStop(1, bottom);
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 여러 조각을 정점 색과 함께 합치기 */
function colored(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  const n = ng.attributes.position!.count;
  const c = new THREE.Color(hex);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  ng.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  ng.deleteAttribute('uv');
  if (ng !== g) g.dispose();
  return ng;
}
function mergeColored(parts: [THREE.BufferGeometry, number][]): THREE.BufferGeometry {
  const gs = parts.map(([g, c]) => colored(g, c));
  const m = mergeGeometries(gs)!;
  for (const g of gs) g.dispose();
  return m;
}

/** 귀여운 꼬마 (둥근 몸 · 눈 · 볼 · 머리 새싹 · 발) — 위가 +Y, 앞이 +Z */
function makeBuddy(): { root: THREE.Group; body: THREE.Group; feet: THREE.Mesh[]; dispose(): void } {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const mats: THREE.Material[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const M = (c: number, rough = 0.55): THREE.MeshStandardMaterial => {
    const m = new THREE.MeshStandardMaterial({ color: c, roughness: rough });
    mats.push(m);
    return m;
  };
  const G = <T extends THREE.BufferGeometry>(g: T): T => {
    geos.push(g);
    return g;
  };
  const skin = M(0xffa77a, 0.6);
  const torso = new THREE.Mesh(G(new THREE.SphereGeometry(0.34, 32, 24)), skin);
  torso.scale.set(1, 0.92, 0.95);
  torso.position.y = 0.36;
  torso.castShadow = true;
  body.add(torso);
  const belly = new THREE.Mesh(G(new THREE.SphereGeometry(0.22, 24, 16)), M(0xfff1dc, 0.7));
  belly.scale.set(1, 0.9, 0.5);
  belly.position.set(0, 0.3, 0.2);
  body.add(belly);
  const eyeG = G(new THREE.SphereGeometry(0.052, 16, 12));
  const shineG = G(new THREE.SphereGeometry(0.018, 8, 6));
  const eyeM = M(0x1d1a24, 0.25);
  const shineM = new THREE.MeshBasicMaterial({ color: 0xffffff });
  mats.push(shineM);
  const cheekM = new THREE.MeshStandardMaterial({ color: 0xff6f8e, roughness: 0.8, transparent: true, opacity: 0.55 });
  mats.push(cheekM);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(eyeG, eyeM);
    e.position.set(0.11 * s, 0.44, 0.29);
    e.scale.set(1, 1.25, 0.6);
    body.add(e);
    const sh = new THREE.Mesh(shineG, shineM);
    sh.position.set(0.11 * s + 0.018, 0.465, 0.318);
    body.add(sh);
    const ch = new THREE.Mesh(G(new THREE.CircleGeometry(0.05, 16)), cheekM);
    ch.position.set(0.19 * s, 0.37, 0.285);
    ch.rotation.y = 0.55 * s;
    body.add(ch);
  }
  // 머리 새싹 두 잎
  const stem = new THREE.Mesh(G(new THREE.CylinderGeometry(0.012, 0.016, 0.12, 6)), M(0x5aa84a));
  stem.position.y = 0.72;
  body.add(stem);
  const leafG = G(new THREE.SphereGeometry(0.07, 12, 8));
  for (const s of [-1, 1]) {
    const lf = new THREE.Mesh(leafG, M(0x7cc85a));
    lf.scale.set(1, 0.35, 0.6);
    lf.position.set(0.06 * s, 0.79, 0);
    lf.rotation.z = -0.5 * s;
    body.add(lf);
  }
  const feet: THREE.Mesh[] = [];
  const footG = G(new THREE.SphereGeometry(0.09, 16, 10));
  const footM = M(0xe0784f, 0.7);
  for (const s of [-1, 1]) {
    const f = new THREE.Mesh(footG, footM);
    f.scale.set(1, 0.6, 1.3);
    f.position.set(0.14 * s, 0.05, 0.03);
    f.castShadow = true;
    root.add(f);
    feet.push(f);
  }
  return {
    root,
    body,
    feet,
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}

/* ═════════════ i536 작은 행성 산책 ═════════════ */

function makeWalk(): Scene3D {
  const R = 10;
  const SEA = 10.12;
  const scene = new THREE.Scene();
  const bg = pastelSky('#8fd3ff', '#cdeeff', '#ffe6d2');
  scene.background = bg;
  const cam = new THREE.PerspectiveCamera(46, 1.6, 0.1, 200);
  const hemi = new THREE.HemisphereLight(0xe8f6ff, 0x9a8a78, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -7;
  sc.right = sc.top = 7;
  sc.near = 1;
  sc.far = 60;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const sunDir = new THREE.Vector3(0.55, 0.75, 0.4).normalize();

  // ── 땅 높이: 3D 잡음 대륙 + 언덕, 바다는 따로 구 ──
  const seed = 7;
  const heightAt = (x: number, y: number, z: number): number => {
    const c = fbm3(x * 1.35 + 3, y * 1.35, z * 1.35, seed, 4);
    const hills = fbm3(x * 4.2, y * 4.2 + 9, z * 4.2, seed + 5, 3);
    const e = (c - 0.47) * 3.2;
    if (e < 0) return R + 0.12 + e * 0.9;
    return R + 0.12 + e * 0.55 + Math.pow(smooth(0.05, 0.6, e), 1.4) * (hills - 0.35) * 1.4;
  };
  const { pos, idx } = icosphere(6);
  const nV = pos.length / 3;
  const P = new Float32Array(nV * 3);
  const C = new Float32Array(nV * 3);
  const sand = new THREE.Color(0xf2dca2);
  const g1 = new THREE.Color(0x8fd36a);
  const g2 = new THREE.Color(0x5fb35a);
  const rock = new THREE.Color(0xb7a99a);
  const snow = new THREE.Color(0xffffff);
  const deep = new THREE.Color(0x3d8fb0);
  const col = new THREE.Color();
  for (let i = 0; i < nV; i++) {
    const x = pos[i * 3]!;
    const y = pos[i * 3 + 1]!;
    const z = pos[i * 3 + 2]!;
    const r = heightAt(x, y, z);
    P.set([x * r, y * r, z * r], i * 3);
    const a = r - SEA;
    const tint = fbm3(x * 6, y * 6, z * 6, 3, 2);
    if (a < -0.02) col.copy(deep).lerp(sand, smooth(-0.6, -0.02, a));
    else if (a < 0.1) col.copy(sand);
    else col.copy(g1).lerp(g2, smooth(0.35, 0.65, tint)).lerp(sand, 1 - smooth(0.1, 0.16, a));
    col.lerp(rock, smooth(0.55, 0.75, a)).lerp(snow, smooth(0.82, 0.9, a));
    C.set([col.r, col.g, col.b], i * 3);
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(P, 3));
  pg.setAttribute('color', new THREE.BufferAttribute(C, 3));
  pg.setIndex(idx);
  pg.computeVertexNormals();
  const uTime = { value: 0 };
  const landM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  // 기슭 물거품 — 바다 높이 둘레에 출렁이는 흰 띠 (땅 쪽에 그린다)
  landM.onBeforeCompile = (sh) => {
    sh.uniforms['uTime'] = uTime;
    sh.uniforms['uSea'] = { value: SEA };
    sh.vertexShader = 'varying vec3 vObj;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader =
      'uniform float uTime; uniform float uSea; varying vec3 vObj;\n' +
      sh.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float rr = length(vObj);
        float wob = 0.022 * sin(uTime * 1.8 + vObj.x * 2.3 + vObj.z * 1.7) + 0.012 * sin(uTime * 3.1 + vObj.y * 4.0);
        float d = rr - uSea - 0.03 - wob;
        float foam = 1.0 - smoothstep(0.0, 0.035, abs(d));
        float foam2 = (1.0 - smoothstep(0.0, 0.02, abs(d - 0.07 - wob))) * 0.5;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), clamp(foam + foam2, 0.0, 1.0) * step(-0.08, rr - uSea) * 0.9);`,
      );
  };
  landM.customProgramCacheKey = () => 'planet-foam';
  const planet = new THREE.Mesh(pg, landM);
  planet.receiveShadow = true;
  scene.add(planet);
  const seaG = new THREE.SphereGeometry(SEA, 96, 64);
  const seaM = new THREE.MeshStandardMaterial({ color: 0x5cc6ee, roughness: 0.18, metalness: 0, transparent: true, opacity: 0.78 });
  const sea = new THREE.Mesh(seaG, seaM);
  sea.receiveShadow = true;
  scene.add(sea);

  // ── 흩뿌리기: 피보나치 구 + 각거리 간격(구면 포아송) · 높이 · 경사 규칙 · 법선 정렬 ──
  const dirOK = (d: THREE.Vector3, minA: number, maxA: number, maxSlope: number): number => {
    const r = heightAt(d.x, d.y, d.z);
    const a = r - SEA;
    if (a < minA || a > maxA) return -1;
    const t1 = new THREE.Vector3(-d.z, 0, d.x).normalize();
    if (t1.lengthSq() < 0.1) t1.set(1, 0, 0);
    const t2 = new THREE.Vector3().crossVectors(d, t1);
    const e = 0.02;
    const s1 = Math.abs(heightAt(d.x + t1.x * e, d.y + t1.y * e, d.z + t1.z * e) - r) / (e * R);
    const s2 = Math.abs(heightAt(d.x + t2.x * e, d.y + t2.y * e, d.z + t2.z * e) - r) / (e * R);
    return Math.max(s1, s2) > maxSlope ? -1 : r;
  };
  const geos: THREE.BufferGeometry[] = [pg, seaG];
  const mats: THREE.Material[] = [landM, seaM];
  const roundTree = mergeColored([
    [new THREE.CylinderGeometry(0.06, 0.09, 0.5, 7).translate(0, 0.25, 0), 0x9a6a45],
    [new THREE.IcosahedronGeometry(0.34, 2).translate(0, 0.68, 0), 0x6cc35a],
    [new THREE.IcosahedronGeometry(0.24, 2).translate(0.16, 0.55, 0.08), 0x5fb35a],
    [new THREE.IcosahedronGeometry(0.22, 2).translate(-0.15, 0.58, -0.06), 0x7fcf62],
  ]);
  const pineTree = mergeColored([
    [new THREE.CylinderGeometry(0.05, 0.07, 0.3, 6).translate(0, 0.15, 0), 0x8a5e3e],
    [new THREE.ConeGeometry(0.32, 0.5, 9).translate(0, 0.48, 0), 0x3f9a63],
    [new THREE.ConeGeometry(0.25, 0.42, 9).translate(0, 0.76, 0), 0x4cae6c],
    [new THREE.ConeGeometry(0.17, 0.34, 9).translate(0, 1.0, 0), 0x5bbd78],
  ]);
  const rockG = new THREE.IcosahedronGeometry(0.22, 1);
  {
    const p = rockG.attributes.position as THREE.BufferAttribute;
    const rr = rng(3);
    const seen = new Map<string, number>();
    for (let i = 0; i < p.count; i++) {
      const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
      let s = seen.get(k);
      if (s === undefined) {
        s = 0.8 + rr() * 0.35;
        seen.set(k, s);
      }
      p.setXYZ(i, p.getX(i) * s, p.getY(i) * s * 0.7, p.getZ(i) * s);
    }
    rockG.computeVertexNormals();
  }
  const flowerG = mergeColored([
    [new THREE.CylinderGeometry(0.012, 0.012, 0.14, 4).translate(0, 0.07, 0), 0x4f9a3f],
    [new THREE.SphereGeometry(0.05, 8, 6).translate(0, 0.16, 0), 0xffffff],
  ]);
  geos.push(roundTree, pineTree, rockG, flowerG);
  const vcM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const rockM = new THREE.MeshStandardMaterial({ color: 0xc9bdb0, roughness: 0.95, flatShading: true });
  mats.push(vcM, rockM);
  const placed: THREE.Vector3[] = [];
  const spawn = new THREE.Vector3();
  const N = 5200;
  const rnd = rng(19);
  const kinds: { g: THREE.BufferGeometry; m: THREE.Material; list: THREE.Matrix4[]; colors: THREE.Color[] }[] = [
    { g: roundTree, m: vcM, list: [], colors: [] },
    { g: pineTree, m: vcM, list: [], colors: [] },
    { g: rockG, m: rockM, list: [], colors: [] },
    { g: flowerG, m: vcM, list: [], colors: [] },
  ];
  const FLOWER = [0xff7aa8, 0xffd04d, 0xb48cff, 0xffffff, 0xff9f5a];
  // 시작 자리: 넓은 풀밭 한가운데
  {
    let best = -1;
    for (let i = 0; i < 400; i++) {
      const d = new THREE.Vector3().setFromSphericalCoords(1, Math.acos(1 - 2 * ((i + 0.5) / 400)), i * 2.39996);
      const r = dirOK(d, 0.18, 0.4, 0.35);
      if (r < 0) continue;
      let ok = 0;
      for (let k = 0; k < 8; k++) {
        const q = d.clone().add(new THREE.Vector3(Math.cos(k), Math.sin(k * 1.7), Math.cos(k * 2.3)).multiplyScalar(0.09)).normalize();
        if (heightAt(q.x, q.y, q.z) - SEA > 0.12) ok++;
      }
      if (ok > best) {
        best = ok;
        spawn.copy(d);
      }
    }
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const qy = new THREE.Quaternion();
  const up0 = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < N; i++) {
    const y = 1 - 2 * ((i + 0.5) / N);
    const d = new THREE.Vector3().setFromSphericalCoords(1, Math.acos(y), i * 2.39996 + rnd() * 0.3).normalize();
    if (d.angleTo(spawn) < 0.08) continue;
    const roll = rnd();
    const kind = roll < 0.3 ? 0 : roll < 0.48 ? 1 : roll < 0.6 ? 2 : 3;
    const minGap = kind === 3 ? 0.035 : 0.075;
    // 무리 지어 자라게 — 잡음이 높은 곳에 나무, 낮은 곳에 꽃
    const clump = fbm3(d.x * 3, d.y * 3, d.z * 3, 41, 2);
    if (kind < 2 && clump < 0.5) continue;
    if (kind === 3 && clump > 0.55) continue;
    const r = kind === 2 ? dirOK(d, 0.04, 0.9, 1.4) : kind === 1 ? dirOK(d, 0.2, 0.75, 0.9) : dirOK(d, 0.12, 0.6, 0.7);
    if (r < 0) continue;
    if (placed.some((p) => p.angleTo(d) < minGap)) continue;
    placed.push(d);
    const s = kind === 3 ? 0.8 + rnd() * 0.5 : 0.75 + rnd() * 0.55;
    q.setFromUnitVectors(up0, d);
    qy.setFromAxisAngle(up0, rnd() * TAU);
    q.multiply(qy);
    m4.compose(d.clone().multiplyScalar(r - 0.02), q, new THREE.Vector3(s, s, s));
    kinds[kind]!.list.push(m4.clone());
    kinds[kind]!.colors.push(kind === 3 ? new THREE.Color(FLOWER[Math.floor(rnd() * FLOWER.length)]!) : new THREE.Color().setHSL(0, 0, 0.88 + rnd() * 0.12));
  }
  const counts: number[] = [];
  for (const k of kinds) {
    const im = new THREE.InstancedMesh(k.g, k.m, Math.max(1, k.list.length));
    k.list.forEach((mm, i) => {
      im.setMatrixAt(i, mm);
      im.setColorAt(i, k.colors[i]!);
    });
    im.count = k.list.length;
    im.castShadow = k.g !== flowerG;
    im.receiveShadow = true;
    scene.add(im);
    counts.push(k.list.length);
  }
  const scattered = counts.reduce((a, b) => a + b, 0);

  // ── 행성 둘레를 도는 뭉게구름 ──
  const cloudG = mergeColored([
    [new THREE.IcosahedronGeometry(0.55, 2), 0xffffff],
    [new THREE.IcosahedronGeometry(0.42, 2).translate(0.55, -0.08, 0.05), 0xffffff],
    [new THREE.IcosahedronGeometry(0.38, 2).translate(-0.52, -0.1, -0.05), 0xffffff],
    [new THREE.IcosahedronGeometry(0.3, 2).translate(0.15, 0.3, 0.12), 0xffffff],
  ]);
  geos.push(cloudG);
  const cloudM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, emissive: 0x9ab4c8, emissiveIntensity: 0.35 });
  mats.push(cloudM);
  const clouds = new THREE.Group();
  {
    const cr = rng(5);
    for (let i = 0; i < 11; i++) {
      const c = new THREE.Mesh(cloudG, cloudM);
      const d = new THREE.Vector3(cr() * 2 - 1, cr() * 2 - 1, cr() * 2 - 1).normalize();
      c.position.copy(d).multiplyScalar(13.2 + cr() * 1.2);
      c.quaternion.setFromUnitVectors(up0, d);
      c.scale.setScalar(0.8 + cr() * 0.7);
      c.castShadow = true;
      clouds.add(c);
    }
  }
  scene.add(clouds);

  // ── 꼬마 ──
  const buddy = makeBuddy();
  scene.add(buddy.root);
  const up = spawn.clone();
  const fwd = new THREE.Vector3(-up.z, 0, up.x).normalize();
  let hOff = 0;
  let vr = 0;
  let moving = 0;
  let walkPh = 0;
  let target: THREE.Vector3 | null = null;
  let wanderT = 0;
  let idle = 0;
  const input = new Input(true);
  const rayc = new THREE.Raycaster();
  let sphereCam = true;
  let wide = false;
  let wideK = 0;
  const camUp = up.clone();
  const camPos = new THREE.Vector3();
  let camInit = false;
  let orbitYaw = 0;
  const overlay = new Overlay();
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const look = new THREE.Vector3();
  let isBig = false;
  const surface = (d: THREE.Vector3): number => heightAt(d.x, d.y, d.z);
  let blocked = 0;

  const step = (dt: number, t: number): void => {
    // 입력 → 돌기 · 앞으로
    let turn = 0;
    let go = 0;
    const k = input.keys;
    if (k.has('arrowleft') || k.has('a')) turn += 1;
    if (k.has('arrowright') || k.has('d')) turn -= 1;
    if (k.has('arrowup') || k.has('w')) go += 1;
    if (k.has('arrowdown') || k.has('s')) go -= 0.6;
    if (turn || go) {
      target = null;
      idle = 0;
    }
    if (k.has(' ') && hOff <= 0.0001) {
      vr = 3.6;
      k.delete(' ');
      idle = 0;
    }
    idle += dt;
    // 누른 곳으로 걸어가기 · 가만히 있으면 저절로 산책
    if (!turn && !go && (target || idle > (isBig ? 6 : 0))) {
      if (!target || (wanderT -= dt) < 0) {
        if (!target || idle > 6 || !isBig) {
          for (let i = 0; i < 30; i++) {
            const cand = up.clone().addScaledVector(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), 0.9).normalize();
            if (surface(cand) - SEA > 0.12) {
              target = cand;
              break;
            }
          }
          wanderT = 7;
        }
      }
      if (target) {
        tmp.copy(target).addScaledVector(up, -target.dot(up));
        if (tmp.lengthSq() > 1e-6 && up.angleTo(target) > 0.02) {
          tmp.normalize();
          const side = tmp2.crossVectors(up, fwd).dot(tmp);
          const ahead = fwd.dot(tmp);
          turn = clamp(Math.atan2(side, ahead) * 2.2, -1, 1);
          go = ahead > 0.2 ? 1 : 0.25;
        } else target = null;
      }
    }
    if (turn) fwd.applyAxisAngle(up, turn * 2.6 * dt).normalize();
    const speed = 2.1;
    moving = lerp(moving, Math.abs(go), 1 - Math.exp(-dt * 10));
    if (go) {
      // 접평면으로 한 걸음 → 다시 구 위로 (발밑 = 중심 쪽)
      const rNow = surface(up);
      const next = tmp.copy(up).multiplyScalar(rNow).addScaledVector(fwd, go * speed * dt).normalize();
      if (surface(next) - SEA > 0.1) {
        // 앞 방향을 새 위쪽의 접평면으로 옮겨 실어 나르기 (평행 이동)
        const qq = new THREE.Quaternion().setFromUnitVectors(up, next);
        up.copy(next);
        fwd.applyQuaternion(qq);
        fwd.addScaledVector(up, -fwd.dot(up)).normalize();
        blocked = Math.max(0, blocked - dt);
      } else {
        blocked = 0.6;
        target = null;
        fwd.applyAxisAngle(up, 2.4 * dt * 3);
      }
    }
    // 점프 — 중력은 늘 행성 중심 쪽
    vr -= 9.5 * dt;
    hOff = Math.max(0, hOff + vr * dt);
    if (hOff === 0 && vr < 0) vr = 0;
    walkPh += dt * moving * 11;
    // 몸 놓기
    const rr = surface(up);
    buddy.root.position.copy(up).multiplyScalar(rr + hOff - 0.02);
    const m = new THREE.Matrix4().makeBasis(tmp2.crossVectors(up, fwd).normalize(), up, fwd);
    buddy.root.quaternion.setFromRotationMatrix(m);
    const bob = Math.abs(Math.sin(walkPh)) * 0.07 * moving;
    buddy.body.position.y = bob;
    const sq = hOff > 0 ? 1 + Math.min(0.12, vr * 0.03) : 1 - bob * 0.6;
    buddy.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    buddy.body.rotation.z = Math.sin(walkPh * 0.5) * 0.08 * moving;
    buddy.feet.forEach((f, i) => {
      const ph = walkPh * 0.5 + i * Math.PI;
      f.position.z = 0.03 + Math.sin(ph) * 0.12 * moving;
      f.position.y = 0.05 + Math.max(0, Math.cos(ph)) * 0.07 * moving;
    });
    clouds.rotation.y = t * 0.025;
    clouds.rotation.x = t * 0.011;
  };

  return {
    scene,
    camera: cam,
    update(t, dt) {
      uTime.value = t;
      step(Math.min(dt, 0.05), t);
      if (input.drag.dx) {
        orbitYaw = clamp(orbitYaw + input.drag.dx * 0.006, -2.6, 2.6);
        input.drag.dx = 0;
        input.drag.dy = 0;
      } else orbitYaw *= Math.exp(-dt * 0.6);
      // 카메라: 꼬마의 위 · 뒤에서 — 위쪽을 꼬마의 위쪽으로 부드럽게 돌린다 (끄면 세상 위쪽 고정)
      wideK = lerp(wideK, wide ? 1 : 0, 1 - Math.exp(-dt * 2.5));
      const k = 1 - Math.exp(-dt * 4);
      camUp.lerp(up, 1 - Math.exp(-dt * 3)).normalize();
      const back = tmp.copy(fwd).applyAxisAngle(up, orbitYaw).multiplyScalar(-1);
      const p = buddy.root.position;
      const want = tmp2.copy(p).addScaledVector(up, lerp(2.3, 16, wideK)).addScaledVector(back, lerp(4.2, 9, wideK));
      if (!camInit) {
        camPos.copy(want);
        camInit = true;
      } else camPos.lerp(want, k);
      // 언덕 속으로 들어가지 않게 — 카메라 아래 땅보다 늘 0.7 위
      {
        const cd = tmp.copy(camPos).normalize();
        const floor = Math.max(surface(cd), SEA) + 0.7;
        if (camPos.length() < floor) camPos.setLength(floor);
      }
      cam.position.copy(camPos);
      if (sphereCam) cam.up.copy(camUp);
      else cam.up.set(0, 1, 0);
      look.copy(p).addScaledVector(up, lerp(0.5, -6, wideK)).addScaledVector(fwd, lerp(1.3, 0, wideK));
      cam.lookAt(look);
      // 그림자는 꼬마 둘레만
      sun.position.copy(p).addScaledVector(sunDir, 25);
      sun.target.position.copy(p);
    },
    render(r, w, h) {
      isBig = w >= 700;
      if (isBig) input.attach(w, h);
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFShadowMap;
      while (input.taps.length) {
        const tp = input.taps.shift()!;
        rayc.setFromCamera(new THREE.Vector2(tp.x, tp.y), cam);
        const hit = rayc.intersectObject(planet, false)[0];
        if (hit) {
          const d = hit.point.clone().normalize();
          if (surface(d) - SEA > 0.1) {
            target = d;
            idle = 0;
            wanderT = 99;
          }
        }
      }
      r.render(scene, cam);
      const below = up.y < -0.35;
      const tags: Tag[] = [
        { text: sphereCam ? '카메라 위쪽 = 꼬마의 발밑 반대쪽' : '카메라 위쪽 = 세상 위쪽 (고정)', x: 0.03, y: 0.05, ax: 0, ay: 0, bg: sphereCam ? 'rgba(40,120,90,0.72)' : 'rgba(170,70,60,0.75)' },
        { text: `흩뿌린 나무 · 바위 · 꽃 ${scattered}개`, x: 0.97, y: 0.05, ax: 1, ay: 0 },
      ];
      if (!sphereCam && below) tags.push({ text: '행성 아래쪽 — 화면이 뒤집혀요', x: 0.5, y: 0.16, ax: 0.5, ay: 0, bg: 'rgba(170,70,60,0.8)', big: true });
      if (isBig) tags.push({ text: '방향키 · WASD 걷기 · 스페이스 점프 · 땅 누르기 = 그곳으로 · 끌기 = 카메라 돌리기', x: 0.5, y: 0.96, ax: 0.5, ay: 1 });
      else tags.push({ text: '어디서나 발밑이 「아래」', x: 0.5, y: 0.95, ax: 0.5, ay: 1 });
      overlay.draw(r, w, h, tags);
    },
    controls: [
      { type: 'toggle', label: '카메라 위쪽을 꼬마 발밑에 맞추기 (끄면 세상 위쪽 고정)', value: true, on: (v) => (sphereCam = v) },
      { type: 'toggle', label: '행성 전체 보기', value: false, on: (v) => (wide = v) },
      { type: 'button', label: '반대편으로 데려가기', on: () => (target = up.clone().multiplyScalar(-1).add(new THREE.Vector3(0.3, 0.1, 0.2)).normalize()) },
    ],
    dispose() {
      input.dispose();
      overlay.dispose();
      buddy.dispose();
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      bg.dispose();
      scene.traverse((o) => {
        if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
      });
    },
  };
}

/* ═════════════ i537 휘는 지평선 ═════════════ */

function makeCurved(): Scene3D {
  const scene = new THREE.Scene();
  const bg = pastelSky('#7cc8ff', '#c6ebff', '#ffe8cf');
  scene.background = bg;
  scene.fog = new THREE.Fog(0xd8eefc, 30, 75);
  const cam = new THREE.PerspectiveCamera(50, 1.6, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0xeaf6ff, 0xa08c74, 1.3));
  const sunL = new THREE.DirectionalLight(0xfff0d8, 2.1);
  sunL.position.set(-6, 10, 4);
  scene.add(sunL);
  const U = { uBend: { value: 0.012 }, uSide: { value: 0.35 }, uCam: { value: new THREE.Vector2() } };
  // 모든 재질에 같은 휨 — 카메라와의 수평 거리² 만큼 아래로
  const bend = (m: THREE.Material): THREE.Material => {
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader =
        'uniform float uBend; uniform float uSide; uniform vec2 uCam;\n' +
        sh.vertexShader.replace(
          '#include <project_vertex>',
          `vec4 mvPosition = vec4( transformed, 1.0 );
          #ifdef USE_INSTANCING
            mvPosition = instanceMatrix * mvPosition;
          #endif
          vec4 wpB = modelMatrix * mvPosition;
          vec2 dB = wpB.xz - uCam;
          wpB.y -= uBend * (dB.y * dB.y + uSide * dB.x * dB.x);
          mvPosition = viewMatrix * wpB;
          gl_Position = projectionMatrix * mvPosition;`,
        );
    };
    m.customProgramCacheKey = () => 'curved-world';
    return m;
  };
  const mats: THREE.Material[] = [];
  const M = (c: number, rough = 0.85): THREE.Material => {
    const m = bend(new THREE.MeshStandardMaterial({ color: c, roughness: rough }));
    mats.push(m);
    return m;
  };
  const vc = bend(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  mats.push(vc);
  const geos: THREE.BufferGeometry[] = [];
  // 한 줄(길이 4) 조각: 풀밭 · 길 · 인도 · 집 · 나무 · 가로등 · 울타리 — 줄마다 다른 모양
  const ROW = 4;
  const NROW = 28;
  const grassM = M(0x9ad86e);
  const roadM = M(0xf3e3c3, 0.95);
  const walkM = M(0xd9c6b0);
  const lineM = M(0xffffff, 0.7);
  // 휨은 정점에서만 일어난다 — 바닥은 촘촘한 격자여야 땅이 물체와 같이 휜다 (판 하나면 양 끝만 내려가 집 · 나무가 뜬다)
  const grassG = new THREE.PlaneGeometry(60, ROW, 60, 4).rotateX(-Math.PI / 2);
  const roadG = new THREE.PlaneGeometry(5, ROW, 6, 4).rotateX(-Math.PI / 2).translate(0, 0.03, 0);
  const walkG = new THREE.BoxGeometry(1.3, 0.12, ROW, 2, 1, 4);
  const lineG = new THREE.BoxGeometry(0.12, 0.06, 1.6).translate(0, 0.04, 0);
  geos.push(grassG, roadG, walkG, lineG);
  const ROOF = [0xff7b6b, 0x6aa8ff, 0xffb84d, 0x8ad07a, 0xc08bff, 0xff8fb8];
  const WALL = [0xfff3e2, 0xffe2c4, 0xe9f4ff, 0xfdf0f6];
  const house = (wc: number, rc: number, w: number, d: number, hgt: number): THREE.BufferGeometry => {
    const parts: [THREE.BufferGeometry, number][] = [
      [new THREE.BoxGeometry(w, hgt, d).translate(0, hgt / 2, 0), wc],
      [new THREE.ConeGeometry(Math.max(w, d) * 0.78, hgt * 0.75, 4).rotateY(Math.PI / 4).translate(0, hgt + hgt * 0.37, 0), rc],
      [new THREE.BoxGeometry(0.34, 0.6, 0.06).translate(0, 0.3, d / 2 + 0.01), 0x9b6b48],
    ];
    for (const s of [-1, 1]) parts.push([new THREE.BoxGeometry(0.3, 0.3, 0.06).translate(s * w * 0.27, hgt * 0.62, d / 2 + 0.01), 0x8fd0ff]);
    parts.push([new THREE.BoxGeometry(0.18, 0.5, 0.18).translate(w * 0.25, hgt * 1.3, -d * 0.1), 0xb07a5a]);
    return mergeColored(parts);
  };
  const tree = (): THREE.BufferGeometry =>
    mergeColored([
      [new THREE.CylinderGeometry(0.08, 0.11, 0.7, 7).translate(0, 0.35, 0), 0x9a6a45],
      [new THREE.IcosahedronGeometry(0.55, 2).translate(0, 1.05, 0), 0x6cc35a],
      [new THREE.IcosahedronGeometry(0.38, 2).translate(0.28, 0.85, 0.1), 0x5fb35a],
    ]);
  const lamp = mergeColored([
    [new THREE.CylinderGeometry(0.04, 0.05, 1.6, 6).translate(0, 0.8, 0), 0x55607a],
    [new THREE.SphereGeometry(0.14, 12, 8).translate(0, 1.66, 0), 0xfff2b0],
  ]);
  const fence = mergeColored([
    ...[-1.5, -0.5, 0.5, 1.5].map((z): [THREE.BufferGeometry, number] => [new THREE.BoxGeometry(0.08, 0.5, 0.08).translate(0, 0.25, z), 0xffffff]),
    [new THREE.BoxGeometry(0.05, 0.07, ROW).translate(0, 0.38, 0), 0xffffff],
    [new THREE.BoxGeometry(0.05, 0.07, ROW).translate(0, 0.18, 0), 0xffffff],
  ]);
  const shadowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(40,50,30,0.42)');
    gr.addColorStop(1, 'rgba(40,50,30,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const blobM = bend(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  mats.push(blobM);
  const blobG = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  geos.push(lamp, fence, blobG);
  const r0 = rng(12);
  const rows: THREE.Group[] = [];
  for (let i = 0; i < NROW; i++) {
    const row = new THREE.Group();
    row.add(new THREE.Mesh(grassG, grassM), new THREE.Mesh(roadG, roadM));
    for (const s of [-1, 1]) {
      const wk = new THREE.Mesh(walkG, walkM);
      wk.position.set(s * 3.15, 0.06, 0);
      row.add(wk);
    }
    if (i % 2 === 0) row.add(new THREE.Mesh(lineG, lineM));
    for (const s of [-1, 1]) {
      const pick = r0();
      const x0 = s * (5.2 + r0() * 1.2);
      const blob = (x: number, z: number, size: number): void => {
        const b = new THREE.Mesh(blobG, blobM);
        b.position.set(x, 0.02, z);
        b.scale.setScalar(size);
        row.add(b);
      };
      if (pick < 0.55) {
        const w = 1.6 + r0() * 0.8;
        const g = house(WALL[Math.floor(r0() * WALL.length)]!, ROOF[Math.floor(r0() * ROOF.length)]!, w, 1.6 + r0() * 0.5, 1.1 + r0() * 0.7);
        geos.push(g);
        const hm = new THREE.Mesh(g, vc);
        hm.position.set(x0 + s * 0.6, 0, 0);
        hm.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
        row.add(hm);
        blob(x0 + s * 0.6, 0, w * 1.9);
      } else {
        for (let k = 0; k < 2; k++) {
          const g = tree();
          geos.push(g);
          const tm = new THREE.Mesh(g, vc);
          const x = x0 + s * r0() * 2;
          const z = (r0() - 0.5) * 3;
          tm.position.set(x, 0, z);
          tm.scale.setScalar(0.8 + r0() * 0.6);
          row.add(tm);
          blob(x, z, 1.6);
        }
      }
      if (i % 3 === 0) {
        const lm = new THREE.Mesh(lamp, vc);
        lm.position.set(s * 2.7, 0, 0.5);
        row.add(lm);
      }
      const fm = new THREE.Mesh(fence, vc);
      fm.position.set(s * 4.1, 0, 0);
      if (r0() < 0.6) row.add(fm);
      // 먼 쪽 덤불 · 나무 줄
      for (let k = 0; k < 2; k++) {
        const g = tree();
        geos.push(g);
        const tm = new THREE.Mesh(g, vc);
        tm.position.set(s * (10 + r0() * 14), 0, (r0() - 0.5) * 3);
        tm.scale.setScalar(1 + r0() * 0.9);
        row.add(tm);
      }
    }
    row.traverse((o) => (o.frustumCulled = false));
    row.position.z = -i * ROW;
    rows.push(row);
    scene.add(row);
  }
  // 앞서 걷는 꼬마
  const buddy = makeBuddy();
  buddy.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.material = bend((m.material as THREE.Material).clone());
      mats.push(m.material as THREE.Material);
      m.frustumCulled = false;
    }
  });
  buddy.root.scale.setScalar(1.3);
  buddy.root.rotation.y = Math.PI;
  scene.add(buddy.root);
  const bb = new THREE.Mesh(blobG, blobM);
  bb.scale.setScalar(1.1);
  bb.frustumCulled = false;
  scene.add(bb);
  let k = 0.012;
  let side = true;
  let walk = true;
  let z = 0;
  let isBig = false;
  const overlay = new Overlay();
  return {
    scene,
    camera: cam,
    update(t, dt) {
      if (walk) z -= dt * 4.2;
      // 카드: 4초마다 휨 켬 ↔ 끔
      const on = isBig ? 1 : Math.sin(t * 0.8) > -0.2 ? 1 : 0;
      U.uBend.value = lerp(U.uBend.value, k * on, 1 - Math.exp(-dt * 5));
      U.uSide.value = side ? 0.35 : 0;
      cam.position.set(0, 7.5, z + 9);
      cam.lookAt(0, -3.2, z - 5);
      U.uCam.value.set(cam.position.x, cam.position.z);
      for (const r of rows) if (r.position.z > z + 12) r.position.z -= NROW * ROW;
      const ph = t * 9;
      buddy.root.position.set(Math.sin(t * 0.6) * 0.6, Math.abs(Math.sin(ph)) * 0.12, z - 1.5);
      buddy.feet.forEach((f, i) => {
        f.position.z = 0.03 + Math.sin(ph * 0.5 + i * Math.PI) * 0.12;
      });
      bb.position.set(buddy.root.position.x, 0.03, z - 1.5);
    },
    render(r, w, h) {
      isBig = w >= 700;
      r.render(scene, cam);
      const b = U.uBend.value;
      overlay.draw(r, w, h, [
        { text: b > 0.001 ? `휨 켬 — 높이 −= ${k.toFixed(3)} × 거리²` : '휨 끔 — 평평한 길', x: 0.03, y: 0.05, ax: 0, ay: 0, bg: b > 0.001 ? 'rgba(40,120,90,0.72)' : 'rgba(60,70,90,0.7)' },
        { text: '맵은 평평한 직선 길 — 셰이더가 보여 줄 때만 휜다', x: 0.5, y: 0.95, ax: 0.5, ay: 1 },
      ]);
    },
    controls: [
      { type: 'range', label: '휨 세기 (0 = 끔)', min: 0, max: 0.03, step: 0.001, value: 0.012, on: (v) => (k = v) },
      { type: 'toggle', label: '옆으로도 휘기 (작은 공 행성처럼)', value: true, on: (v) => (side = v) },
      { type: 'toggle', label: '앞으로 걷기', value: true, on: (v) => (walk = v) },
    ],
    dispose() {
      overlay.dispose();
      buddy.dispose();
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      shadowTex.dispose();
      bg.dispose();
    },
  };
}

/* ═════════════ i538 동화 뭉게 나무 ═════════════ */

function leafAtlas(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const r = rng(9);
  // 잎 여러 장이 겹친 덩이 — 가장자리는 잎 모양 그대로 잘린다 (alphaTest)
  for (let i = 0; i < 26; i++) {
    const a = r() * TAU;
    const d = Math.sqrt(r()) * 78;
    const x = 128 + Math.cos(a) * d;
    const y = 128 + Math.sin(a) * d;
    const len = 34 + r() * 22;
    g.save();
    g.translate(x, y);
    g.rotate(a + Math.PI / 2 + (r() - 0.5) * 0.9);
    const l = 0.5 + r() * 0.08;
    g.fillStyle = `hsl(${102 + r() * 10}, ${52 + r() * 8}%, ${l * 100}%)`;
    g.beginPath();
    g.moveTo(0, -len / 2);
    g.quadraticCurveTo(len * 0.42, 0, 0, len / 2);
    g.quadraticCurveTo(-len * 0.42, 0, 0, -len / 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,220,0.35)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, -len / 2);
    g.lineTo(0, len / 2);
    g.stroke();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** 바람 — 줄기 휨(높이²) · 가지(덩이마다 위상) · 잎 떨림(빠르고 작게). layered=0 이면 나무 전체가 한 덩어리로 기운다 */
function windPatch(m: THREE.Material, W: { uT: { value: number }; uWind: { value: number }; uLayer: { value: number } }, sphereNormal: boolean): void {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, W);
    sh.vertexShader =
      'uniform float uT; uniform float uWind; uniform float uLayer; attribute vec4 aBranch; attribute float aH;\n' +
      sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float gust = 0.6 + 0.4 * sin(uT * 0.37) * sin(uT * 0.21 + 1.3);
        float h2 = aH * aH;
        vec3 sway = vec3(sin(uT * 1.1) * 0.9 + 0.35, 0.0, sin(uT * 0.83 + 1.0) * 0.4) * h2 * 0.22 * uWind * gust;
        vec3 rigid = vec3(sin(uT * 1.1) * 0.9 + 0.35, 0.0, sin(uT * 0.83 + 1.0) * 0.4) * aH * 0.22 * uWind * gust;
        float bw = aBranch.w;
        vec3 branch = vec3(sin(uT * 2.3 + bw * 6.28), sin(uT * 3.1 + bw * 4.0) * 0.4, cos(uT * 1.9 + bw * 6.28)) * 0.07 * uWind * gust * step(0.001, length(aBranch.xyz));
        vec3 flutter = normal * sin(uT * 11.0 + bw * 40.0 + position.x * 7.0 + position.y * 5.0) * 0.035 * uWind * step(0.001, length(aBranch.xyz));
        transformed += mix(rigid, sway + branch + flutter, uLayer);`,
      );
    if (sphereNormal) {
      // 양면 잎: 뒷면에서 법선을 뒤집지 않는다 — 감싸는 구 법선 그대로 받아야 한 덩이로 보인다
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        `float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
        vec3 normal = normalize( vNormal );
        vec3 nonPerturbedNormal = normal;`,
      );
    }
  };
  m.customProgramCacheKey = () => `wind-${sphereNormal ? 's' : 'c'}-${m.type}`;
}

function makeFluffy(): Scene3D {
  const scene = new THREE.Scene();
  const bg = pastelSky('#8fd0ff', '#d2efff', '#fff0dc');
  scene.background = bg;
  const cam = new THREE.PerspectiveCamera(40, 1.6, 0.1, 100);
  scene.add(new THREE.HemisphereLight(0xdcefff, 0x5a4a3a, 0.55));
  const sun = new THREE.DirectionalLight(0xfff0d6, 4.2);
  sun.position.set(10, 7, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -8;
  sc.right = sc.top = 8;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  const W = { uT: { value: 0 }, uWind: { value: 1 }, uLayer: { value: 1 } };
  const atlas = leafAtlas();
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  // 땅
  const groundG = new THREE.CircleGeometry(14, 64).rotateX(-Math.PI / 2);
  const groundM = new THREE.MeshStandardMaterial({ color: 0x9fd77a, roughness: 1 });
  const ground = new THREE.Mesh(groundG, groundM);
  ground.receiveShadow = true;
  scene.add(ground);
  geos.push(groundG);
  mats.push(groundM);

  /** 나무 하나 — 같은 씨앗이면 같은 모양. sphere = 잎 법선을 덩이 중심에서 바깥쪽으로 */
  const buildTree = (sphere: boolean): { trunk: THREE.Mesh; leaves: THREE.Mesh; mats: THREE.Material[]; setSphere(on: boolean): void } => {
    const r = rng(31);
    const H = 3.6;
    const tubes: THREE.BufferGeometry[] = [];
    const clusters: { c: THREE.Vector3; rad: number; ph: number }[] = [];
    const addTube = (pts: THREE.Vector3[], r0: number, r1: number): void => {
      const curve = new THREE.CatmullRomCurve3(pts);
      const g = new THREE.TubeGeometry(curve, 12, 1, 8, false);
      // 굵기: 아래 → 위로 가늘게
      const p = g.attributes.position as THREE.BufferAttribute;
      const n = g.attributes.normal as THREE.BufferAttribute;
      const rings = 13;
      for (let i = 0; i < p.count; i++) {
        const ring = Math.floor(i / 9);
        const k = ring / (rings - 1);
        const c = curve.getPointAt(Math.min(1, k));
        const rad = lerp(r0, r1, k);
        p.setXYZ(i, c.x + n.getX(i) * rad, c.y + n.getY(i) * rad, c.z + n.getZ(i) * rad);
      }
      tubes.push(g);
    };
    // 줄기
    const trunkTop = new THREE.Vector3(0.15, H * 0.62, 0.05);
    addTube([new THREE.Vector3(0, -0.1, 0), new THREE.Vector3(0.05, H * 0.25, 0), new THREE.Vector3(-0.05, H * 0.45, 0.04), trunkTop], 0.26, 0.14);
    // 가지 + 끝마다 잎 덩이
    const NB = 6;
    for (let i = 0; i < NB; i++) {
      const a = (i / NB) * TAU + r() * 0.6;
      const up = 0.35 + r() * 0.5;
      const len = 1.1 + r() * 0.6;
      const start = trunkTop.clone().lerp(new THREE.Vector3(0, H * 0.35, 0), r() * 0.6);
      const end = start.clone().add(new THREE.Vector3(Math.cos(a) * len, up * len + 0.3, Math.sin(a) * len));
      const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.15, 0));
      addTube([start, mid, end], 0.1, 0.04);
      clusters.push({ c: end.clone().add(new THREE.Vector3(0, 0.25, 0)), rad: 0.85 + r() * 0.35, ph: r() });
    }
    clusters.push({ c: trunkTop.clone().add(new THREE.Vector3(0, 1.0, 0)), rad: 1.15, ph: r() });
    clusters.push({ c: trunkTop.clone().add(new THREE.Vector3(0.5, 0.55, -0.4)), rad: 0.9, ph: r() });
    const trunkG = mergeGeometries(tubes)!;
    for (const t of tubes) t.dispose();
    // 줄기에는 가지 위상 없음, 높이만
    {
      const p = trunkG.attributes.position as THREE.BufferAttribute;
      const aH = new Float32Array(p.count);
      for (let i = 0; i < p.count; i++) aH[i] = clamp(p.getY(i) / (H + 1.2), 0, 1);
      trunkG.setAttribute('aH', new THREE.BufferAttribute(aH, 1));
      trunkG.setAttribute('aBranch', new THREE.BufferAttribute(new Float32Array(p.count * 4), 4));
    }
    // 잎 카드: 덩이 안에 무작위 방향 판 — 정점 색은 안쪽일수록 어둡게(덩이 속 그늘)
    const PER = 40;
    const nq = clusters.length * PER;
    const pos = new Float32Array(nq * 4 * 3);
    const nor = new Float32Array(nq * 4 * 3);
    const norS = new Float32Array(nq * 4 * 3);
    const norF = new Float32Array(nq * 4 * 3);
    const colS = new Float32Array(nq * 4 * 3);
    const colF = new Float32Array(nq * 4 * 3);
    const uv = new Float32Array(nq * 4 * 2);
    const colr = new Float32Array(nq * 4 * 3);
    const aH = new Float32Array(nq * 4);
    const aB = new Float32Array(nq * 4 * 4);
    const ind: number[] = [];
    const qd = new THREE.Quaternion();
    const e = new THREE.Euler();
    const corner = [new THREE.Vector3(-1, -1, 0), new THREE.Vector3(1, -1, 0), new THREE.Vector3(1, 1, 0), new THREE.Vector3(-1, 1, 0)];
    const uvs = [0, 0, 1, 0, 1, 1, 0, 1];
    const v = new THREE.Vector3();
    let qi = 0;
    for (const cl of clusters) {
      const hueShift = (r() - 0.5) * 0.08;
      for (let k = 0; k < PER; k++) {
        // 구 안 고르게 (겉에 더 많이)
        const d = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize().multiplyScalar(cl.rad * Math.pow(r(), 0.35) * 0.82);
        d.y *= 0.8;
        const center = cl.c.clone().add(d);
        e.set(r() * TAU, r() * TAU, r() * TAU);
        qd.setFromEuler(e);
        const size = 0.5 + r() * 0.18;
        const face = new THREE.Vector3(0, 0, 1).applyQuaternion(qd);
        const inner = d.length() / cl.rad;
        for (let c = 0; c < 4; c++) {
          v.copy(corner[c]!).multiplyScalar(size).applyQuaternion(qd).add(center);
          const o = (qi * 4 + c) * 3;
          pos.set([v.x, v.y, v.z], o);
          const ns = v.clone().sub(cl.c).normalize();
          norS.set([ns.x, ns.y, ns.z], o);
          norF.set([face.x, face.y, face.z], o);
          const shade = 0.62 + 0.38 * smooth(0.1, 0.9, inner);
          colS.set([shade * (1 + hueShift), shade, shade * (1 - hueShift)], o);
          colF.set([1 + hueShift, 1, 1 - hueShift], o);
          uv.set([uvs[c * 2]!, uvs[c * 2 + 1]!], (qi * 4 + c) * 2);
          aH[qi * 4 + c] = clamp(v.y / (H + 1.2), 0, 1);
          aB.set([cl.c.x, cl.c.y, cl.c.z, cl.ph], (qi * 4 + c) * 4);
        }
        const b = qi * 4;
        ind.push(b, b + 1, b + 2, b, b + 2, b + 3);
        qi++;
      }
    }
    nor.set(sphere ? norS : norF);
    colr.set(sphere ? colS : colF);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    lg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    lg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    lg.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    lg.setAttribute('aH', new THREE.BufferAttribute(aH, 1));
    lg.setAttribute('aBranch', new THREE.BufferAttribute(aB, 4));
    lg.setIndex(ind);
    geos.push(trunkG, lg);
    const barkM = new THREE.MeshStandardMaterial({ color: 0x8a5a3c, roughness: 0.95 });
    windPatch(barkM, W, false);
    const leafM = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true, roughness: 0.85 });
    windPatch(leafM, W, true);
    const leafF = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true, roughness: 0.85 });
    windPatch(leafF, W, false);
    const depthM = new THREE.MeshDepthMaterial({ map: atlas, alphaTest: 0.45, depthPacking: THREE.RGBADepthPacking });
    windPatch(depthM, W, false);
    const trunk = new THREE.Mesh(trunkG, barkM);
    trunk.castShadow = trunk.receiveShadow = true;
    const leaves = new THREE.Mesh(lg, sphere ? leafM : leafF);
    leaves.castShadow = true;
    leaves.receiveShadow = true;
    leaves.customDepthMaterial = depthM;
    const setSphere = (on: boolean): void => {
      (lg.attributes.normal as THREE.BufferAttribute).array.set(on ? norS : norF);
      lg.attributes.normal!.needsUpdate = true;
      (lg.attributes.color as THREE.BufferAttribute).array.set(on ? colS : colF);
      lg.attributes.color!.needsUpdate = true;
      leaves.material = on ? leafM : leafF;
    };
    return { trunk, leaves, mats: [barkM, leafM, leafF, depthM], setSphere };
  };
  const left = new THREE.Group();
  const right = new THREE.Group();
  const tl = buildTree(false);
  const tr = buildTree(true);
  left.add(tl.trunk, tl.leaves);
  right.add(tr.trunk, tr.leaves);
  mats.push(...tl.mats, ...tr.mats);
  left.position.x = -3.1;
  right.position.x = 3.1;
  scene.add(left, right);
  // 풀 포기 몇 개 · 버섯 — 땅이 비지 않게
  const tuftG = mergeColored([
    [new THREE.ConeGeometry(0.06, 0.4, 4).translate(0, 0.2, 0).rotateZ(0.2), 0x6fbf4f],
    [new THREE.ConeGeometry(0.06, 0.34, 4).translate(0.08, 0.17, 0).rotateZ(-0.3), 0x7fcf5a],
    [new THREE.ConeGeometry(0.05, 0.3, 4).translate(-0.06, 0.15, 0.05).rotateX(0.3), 0x62b048],
  ]);
  const tuftM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  geos.push(tuftG);
  mats.push(tuftM);
  const tufts = new THREE.InstancedMesh(tuftG, tuftM, 160);
  {
    const rr = rng(4);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 160; i++) {
      const a = rr() * TAU;
      const d = 1.2 + Math.sqrt(rr()) * 10;
      m4.compose(new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d * 0.7), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rr() * TAU), new THREE.Vector3(1, 0.7 + rr() * 0.8, 1));
      tufts.setMatrixAt(i, m4);
    }
  }
  tufts.receiveShadow = true;
  scene.add(tufts);
  let sphereOn = true;
  let isBig = false;
  const overlay = new Overlay();
  let yaw = 0;
  const input = new Input(false);
  return {
    scene,
    camera: cam,
    update(t) {
      W.uT.value = t;
      if (input.drag.dx) {
        yaw += input.drag.dx * 0.005;
        input.drag.dx = input.drag.dy = 0;
      }
      const a = yaw + Math.sin(t * 0.15) * 0.35;
      cam.position.set(Math.sin(a) * 13, 4.4, Math.cos(a) * 13);
      cam.lookAt(0, 2.5, 0);
    },
    render(r, w, h) {
      isBig = w >= 700;
      if (isBig) input.attach(w, h);
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFShadowMap;
      r.render(scene, cam);
      const layered = W.uLayer.value > 0.5;
      overlay.draw(r, w, h, [
        { text: '잎 카드 법선 그대로 — 자글자글', x: 0.25, y: 0.05, ax: 0.5, ay: 0 },
        { text: sphereOn ? '감싸는 구 법선 — 뭉게뭉게 한 덩이' : '(구 법선 끔)', x: 0.75, y: 0.05, ax: 0.5, ay: 0, bg: sphereOn ? 'rgba(40,120,90,0.72)' : undefined },
        { text: layered ? '바람: 줄기 휨 · 가지 흔들림 · 잎 떨림' : '바람: 나무 전체가 통째로 기울기', x: 0.5, y: 0.95, ax: 0.5, ay: 1, bg: layered ? undefined : 'rgba(170,70,60,0.75)' },
      ]);
    },
    controls: [
      { type: 'toggle', label: '오른쪽 나무 — 감싸는 구 법선', value: true, on: (v) => ((sphereOn = v), tr.setSphere(v)) },
      { type: 'toggle', label: '층별 바람 (끄면 통째로 기울기)', value: true, on: (v) => (W.uLayer.value = v ? 1 : 0) },
      { type: 'range', label: '바람 세기', min: 0, max: 2.5, step: 0.05, value: 1, on: (v) => (W.uWind.value = v) },
    ],
    dispose() {
      input.dispose();
      overlay.dispose();
      tufts.dispose();
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      atlas.dispose();
      bg.dispose();
    },
  };
}

/* ═════════════ i539 육각 타일 행성 (골드버그 다면체) ═════════════ */

interface HexPlanet {
  geo: THREE.BufferGeometry;
  tileOfTri: Int32Array;
  ranges: { start: number; count: number }[];
  nbr: number[][];
  penta: boolean[];
  base: Float32Array;
  V: number;
  E: number;
  F: number;
}

/** 진동수 n 으로 정이십면체를 나눈 측지 구 → 쌍대: 꼭짓점마다 칸 하나, 둘레 삼각형의 무게중심이 칸의 모서리 */
function buildHex(n: number, pillars: boolean, seed: number): HexPlanet {
  const t = (1 + Math.sqrt(5)) / 2;
  const B = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z).normalize());
  const F0 = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
  const verts: THREE.Vector3[] = [];
  const keyMap = new Map<string, number>();
  const vid = (p: THREE.Vector3): number => {
    p.normalize();
    const k = `${Math.round(p.x * 1e5)},${Math.round(p.y * 1e5)},${Math.round(p.z * 1e5)}`;
    let i = keyMap.get(k);
    if (i === undefined) {
      i = verts.length;
      verts.push(p.clone());
      keyMap.set(k, i);
    }
    return i;
  };
  const tris: number[] = [];
  for (let f = 0; f < 20; f++) {
    const A = B[F0[f * 3]!]!;
    const Bv = B[F0[f * 3 + 1]!]!;
    const Cv = B[F0[f * 3 + 2]!]!;
    const P = (i: number, j: number): number => {
      // 무게중심 좌표 (i, j) — 평면 삼각형 위 점을 구로
      const a = (n - i - j) / n;
      const b = i / n;
      const c = j / n;
      return vid(new THREE.Vector3().addScaledVector(A, a).addScaledVector(Bv, b).addScaledVector(Cv, c));
    };
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n - i; j++) {
        tris.push(P(i, j), P(i + 1, j), P(i, j + 1));
        if (i + j < n - 1) tris.push(P(i + 1, j), P(i + 1, j + 1), P(i, j + 1));
      }
  }
  const nT = tris.length / 3;
  const cent: THREE.Vector3[] = [];
  const triOf: number[][] = verts.map(() => []);
  const nbrSet: Set<number>[] = verts.map(() => new Set());
  for (let i = 0; i < nT; i++) {
    const a = tris[i * 3]!;
    const b = tris[i * 3 + 1]!;
    const c = tris[i * 3 + 2]!;
    cent.push(verts[a]!.clone().add(verts[b]!).add(verts[c]!).normalize());
    triOf[a]!.push(i);
    triOf[b]!.push(i);
    triOf[c]!.push(i);
    nbrSet[a]!.add(b).add(c);
    nbrSet[b]!.add(a).add(c);
    nbrSet[c]!.add(a).add(b);
  }
  // 칸 높이 · 생물군
  const elev = verts.map((p) => fbm3(p.x * 1.6 + 2, p.y * 1.6, p.z * 1.6, seed, 4));
  const biome = (e: number): [number, number] => {
    if (e < 0.44) return [0x4aa8d8, 0];
    if (e < 0.47) return [0x7cc6e8, 0];
    if (e < 0.5) return [0xf1dca0, 1];
    if (e < 0.58) return [0x8bd36a, 2];
    if (e < 0.64) return [0x5cad5a, 3];
    if (e < 0.7) return [0xb5a796, 4];
    return [0xffffff, 5];
  };
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const tileOfTri: number[] = [];
  const ranges: { start: number; count: number }[] = [];
  const c3 = new THREE.Color();
  const tan = new THREE.Vector3();
  const bit = new THREE.Vector3();
  const push = (p: THREE.Vector3, nn: THREE.Vector3, c: THREE.Color, tile: number): void => {
    pos.push(p.x, p.y, p.z);
    nor.push(nn.x, nn.y, nn.z);
    col.push(c.r, c.g, c.b);
    if (pos.length % 9 === 0) tileOfTri.push(tile);
  };
  for (let v = 0; v < verts.length; v++) {
    const cnt = verts[v]!;
    // 둘레 삼각형 무게중심을 각도 순으로
    tan.set(-cnt.z, 0, cnt.x);
    if (tan.lengthSq() < 1e-6) tan.set(1, 0, 0);
    tan.normalize();
    bit.crossVectors(cnt, tan);
    const ring = triOf[v]!.map((ti) => cent[ti]!).sort((p, q) => Math.atan2(p.dot(bit), p.dot(tan)) - Math.atan2(q.dot(bit), q.dot(tan)));
    const e = elev[v]!;
    const [hex, lvl] = biome(e);
    const hgt = 1 + (pillars ? Math.max(0, lvl) * 0.035 : 0);
    c3.set(hex);
    const start = pos.length / 3;
    const k = ring.length;
    // 윗면 (조금 안쪽으로 줄여 칸 사이 틈)
    const top = ring.map((p) => p.clone().lerp(cnt, 0.08).normalize().multiplyScalar(hgt));
    const ctr = cnt.clone().multiplyScalar(hgt);
    for (let i = 0; i < k; i++) {
      push(ctr, cnt, c3, v);
      push(top[i]!, cnt, c3, v);
      push(top[(i + 1) % k]!, cnt, c3, v);
    }
    // 옆벽 (기둥일 때) — 조금 어둡게
    const side = c3.clone().multiplyScalar(0.72);
    for (let i = 0; i < k; i++) {
      const a = top[i]!;
      const b = top[(i + 1) % k]!;
      const a0 = a.clone().normalize().multiplyScalar(0.96);
      const b0 = b.clone().normalize().multiplyScalar(0.96);
      const nn = a.clone().add(b).multiplyScalar(0.5).sub(ctr).normalize();
      push(a, nn, side, v);
      push(a0, nn, side, v);
      push(b, nn, side, v);
      push(b, nn, side, v);
      push(a0, nn, side, v);
      push(b0, nn, side, v);
    }
    ranges.push({ start, count: pos.length / 3 - start });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  const colArr = new Float32Array(col);
  geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  const nbr = nbrSet.map((s) => [...s]);
  const F = verts.length;
  let E = 0;
  for (const s of nbrSet) E += s.size;
  E /= 2;
  const V = nT; // 칸의 모서리 점 = 삼각형 수
  return { geo, tileOfTri: Int32Array.from(tileOfTri), ranges, nbr, penta: nbr.map((x) => x.length === 5), base: colArr.slice(), V, E, F };
}

function makeHex(): Scene3D {
  const scene = new THREE.Scene();
  const bg = pastelSky('#1d2b55', '#2d4a7c', '#5a7fb0');
  scene.background = bg;
  const cam = new THREE.PerspectiveCamera(38, 1.6, 0.1, 50);
  cam.position.set(0, 0.6, 4.4);
  cam.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xe6f2ff, 0x3a4060, 1.4));
  const sun = new THREE.DirectionalLight(0xfff2dc, 2.2);
  sun.position.set(3, 2.5, 4);
  scene.add(sun);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, flatShading: false });
  const holder = new THREE.Group();
  scene.add(holder);
  let n = 4;
  let pillars = true;
  let pentaOnly = false;
  let hp: HexPlanet | null = null;
  let mesh: THREE.Mesh | null = null;
  let sel = -1;
  let selT = 0;
  const rebuild = (): void => {
    if (mesh) {
      holder.remove(mesh);
      mesh.geometry.dispose();
    }
    hp = buildHex(n, pillars, 21);
    mesh = new THREE.Mesh(hp.geo, mat);
    holder.add(mesh);
    sel = -1;
    paint();
  };
  const paint = (): void => {
    if (!hp) return;
    const c = hp.geo.attributes.color as THREE.BufferAttribute;
    const arr = c.array as Float32Array;
    arr.set(hp.base);
    const tint = (tile: number, r: number, g: number, b: number, k: number): void => {
      const { start, count } = hp!.ranges[tile]!;
      for (let i = start; i < start + count; i++) {
        arr[i * 3] = lerp(arr[i * 3]!, r, k);
        arr[i * 3 + 1] = lerp(arr[i * 3 + 1]!, g, k);
        arr[i * 3 + 2] = lerp(arr[i * 3 + 2]!, b, k);
      }
    };
    hp.penta.forEach((p, i) => {
      if (p) tint(i, 1, 0.32, 0.45, 0.85);
      else if (pentaOnly) tint(i, 0.5, 0.55, 0.65, 0.7);
    });
    if (sel >= 0) {
      tint(sel, 1, 0.85, 0.2, 0.9);
      for (const j of hp.nbr[sel]!) tint(j, 1, 0.95, 0.6, 0.6);
    }
    c.needsUpdate = true;
  };
  rebuild();
  const input = new Input(false);
  const rayc = new THREE.Raycaster();
  let spin = 0;
  let tilt = 0.25;
  let isBig = false;
  const overlay = new Overlay();
  return {
    scene,
    camera: cam,
    update(_t, dt) {
      if (input.drag.dx || input.drag.dy) {
        spin += input.drag.dx * 0.006;
        tilt = clamp(tilt + input.drag.dy * 0.006, -1.2, 1.2);
        input.drag.dx = input.drag.dy = 0;
      } else spin += dt * 0.18;
      holder.rotation.set(tilt, spin, 0);
      // 카드: 칸 하나를 골라 이웃과 함께 비추기 (2초마다)
      if (!isBig && hp && (selT -= dt) < 0) {
        selT = 2;
        const cands = hp.penta.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
        sel = Math.random() < 0.4 ? cands[Math.floor(Math.random() * cands.length)]! : Math.floor(Math.random() * hp.F);
        paint();
      }
    },
    render(r, w, h) {
      isBig = w >= 700;
      if (isBig) input.attach(w, h);
      while (input.taps.length && mesh && hp) {
        const tp = input.taps.shift()!;
        rayc.setFromCamera(new THREE.Vector2(tp.x, tp.y), cam);
        const hit = rayc.intersectObject(mesh, false)[0];
        if (hit && hit.faceIndex !== undefined && hit.faceIndex !== null) {
          sel = hp.tileOfTri[hit.faceIndex]!;
          paint();
        }
      }
      r.render(scene, cam);
      if (!hp) return;
      const pen = hp.penta.filter(Boolean).length;
      const tags: Tag[] = [
        { text: `나누기 ${n} — 칸 ${hp.F}개 = 육각형 ${hp.F - pen} + 오각형 ${pen}`, x: 0.03, y: 0.05, ax: 0, ay: 0, bg: 'rgba(20,28,48,0.7)' },
        { text: `꼭짓점 ${hp.V} − 모서리 ${hp.E} + 면 ${hp.F} = ${hp.V - hp.E + hp.F}`, x: 0.03, y: 0.15, ax: 0, ay: 0, bg: 'rgba(170,60,90,0.75)' },
      ];
      if (sel >= 0) tags.push({ text: `고른 칸: ${hp.penta[sel] ? '오각형 — 이웃 5칸' : '육각형 — 이웃 6칸'}`, x: 0.97, y: 0.05, ax: 1, ay: 0, bg: 'rgba(160,120,20,0.8)' });
      if (isBig) tags.push({ text: '칸 누르기 = 이웃 보기 · 끌기 = 돌리기 · 오각형(분홍)은 늘 12개', x: 0.5, y: 0.96, ax: 0.5, ay: 1 });
      overlay.draw(r, w, h, tags);
    },
    controls: [
      { type: 'range', label: '나누기 (진동수)', min: 1, max: 9, step: 1, value: 4, on: (v) => ((n = v), rebuild()) },
      { type: 'toggle', label: '높이 기둥 (땅이 높을수록 솟게)', value: true, on: (v) => ((pillars = v), rebuild()) },
      { type: 'toggle', label: '오각형만 또렷하게', value: false, on: (v) => ((pentaOnly = v), paint()) },
    ],
    dispose() {
      input.dispose();
      overlay.dispose();
      mesh?.geometry.dispose();
      mat.dispose();
      bg.dispose();
    },
  };
}

export const DEMOS: DemoMap = {
  i536: { kind: '3d', caption: '어디서나 발밑 = 행성 중심 쪽 — 한 걸음마다 접평면으로 옮기고 구 위로 되돌림, 카메라 위쪽도 꼬마를 따라 돈다 (나무 · 바위 · 꽃은 구면 간격으로 흩뿌림)', make: () => makeWalk() },
  i537: { kind: '3d', caption: '맵은 평평한 직선 길 — 정점 셰이더가 카메라에서 먼 만큼(거리²) 아래로 내려 둥근 작은 행성처럼 보이게', make: () => makeCurved() },
  i538: { kind: '3d', caption: '같은 나무 둘 — 왼쪽은 잎 카드 법선 그대로, 오른쪽은 잎 덩이를 감싸는 구 법선 + 줄기 · 가지 · 잎이 다른 빠르기로 흔들리는 바람', make: () => makeFluffy() },
  i539: { kind: '3d', caption: '정이십면체를 나눈 구의 쌍대 — 칸은 육각형, 오각형은 나누기와 상관없이 늘 12개 · 꼭짓점 − 모서리 + 면 = 2', make: () => makeHex() },
};

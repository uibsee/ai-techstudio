import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * 장난감 자동차 (2026-10-05 사용자 시안 「알록달록 주차장 탈출」 — 반짝이는 다이캐스트 장난감 차, 눈 · 외곽선 없음).
 *
 * 차체 = 옆모습 윤곽(둥근 모서리 · 바퀴 자리 반원)을 폭만큼 밀어 가장자리를 둥글게 깎은 것.
 * 그 위에 객실(유리 판 · 기둥), 지붕 판, 크롬 범퍼 · 그릴 · 등, 고무 타이어 + 은빛 휠, 발밑 그림자.
 * 도장은 클리어코트(유광), 유리는 짙은 남색 반사 — 무대의 환경 반사(scene.environment)가 있어야 산다.
 *
 * 모형 좌표: +X 가 앞, 바닥 y = 0, 길이 len − 0.12, 폭 0.8. 무대가 움직이는 이름: wheel(굴림) · siren · glow · bounce · wobble
 */

export type ToyKind =
  | 'sports'
  | 'sedan'
  | 'taxi'
  | 'suv'
  | 'jeep'
  | 'pickup'
  | 'police'
  | 'mini'
  | 'bus'
  | 'boxtruck'
  | 'fire'
  | 'garbage'
  | 'camper'
  | 'dump';
export const TOY_SHORT: ToyKind[] = ['sedan', 'taxi', 'suv', 'jeep', 'pickup', 'police', 'mini'];
export const TOY_LONG: ToyKind[] = ['bus', 'boxtruck', 'fire', 'garbage', 'camper', 'dump'];

type Keep = <T extends { dispose(): void }>(t: T) => T;
type V = [x: number, y: number, r: number];

const W = 0.8; // 차 폭

/* ───────────── 재질 ───────────── */

class Mats {
  private readonly cache = new Map<string, THREE.Material>();
  constructor(private readonly keep: Keep) {}
  private get(key: string, make: () => THREE.Material): THREE.Material {
    let m = this.cache.get(key);
    if (!m) this.cache.set(key, (m = this.keep(make())));
    return m;
  }
  /** 유광 도장 */
  paint(c: number): THREE.Material {
    return this.get('p' + c, () => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.32, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.1 }));
  }
  /** 무광 플라스틱 (범퍼 아래 · 바퀴집 · 짐칸 바닥) */
  plastic(c: number, rough = 0.6): THREE.Material {
    return this.get('s' + c + rough, () => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0 }));
  }
  get glass(): THREE.Material {
    return this.get('glass', () => new THREE.MeshPhysicalMaterial({ color: 0x1a2a3e, roughness: 0.04, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.8, side: THREE.DoubleSide }));
  }
  get chrome(): THREE.Material {
    return this.get('chrome', () => new THREE.MeshStandardMaterial({ color: 0xe6e9ef, roughness: 0.16, metalness: 1, envMapIntensity: 1.3 }));
  }
  get rim(): THREE.Material {
    return this.get('rim', () => new THREE.MeshStandardMaterial({ color: 0xd4d8e0, roughness: 0.28, metalness: 0.9 }));
  }
  get tire(): THREE.Material {
    return this.get('tire', () => new THREE.MeshStandardMaterial({ color: 0x222228, roughness: 0.82, metalness: 0 }));
  }
  /** 바퀴집 안 (양면) */
  get wellMat(): THREE.Material {
    return this.get('well', () => new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.9, side: THREE.DoubleSide }));
  }
  get dark(): THREE.Material {
    return this.get('dark', () => new THREE.MeshStandardMaterial({ color: 0x2a2d36, roughness: 0.5, metalness: 0.2 }));
  }
  lamp(c: number, glow: number, k = 0.8): THREE.Material {
    return this.get('l' + c + glow + k, () => new THREE.MeshPhysicalMaterial({ color: c, emissive: glow, emissiveIntensity: k, roughness: 0.1, clearcoat: 1 }));
  }
  wood(c = 0xb98250): THREE.Material {
    return this.get('w' + c, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, map: woodTex(this.keep) }));
  }
}

let woodCanvas: HTMLCanvasElement | null = null;
function woodTex(keep: Keep): THREE.Texture {
  if (!woodCanvas) {
    const c = (woodCanvas = document.createElement('canvas'));
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#e0b27a';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = `rgba(${120 + Math.random() * 40},${70 + Math.random() * 30},30,${0.15 + Math.random() * 0.25})`;
      g.lineWidth = 1 + Math.random() * 2;
      const y = Math.random() * 128;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(40, y + (Math.random() - 0.5) * 8, 80, y + (Math.random() - 0.5) * 8, 128, y);
      g.stroke();
    }
    // 판자 사이 홈
    g.fillStyle = 'rgba(70,40,20,0.55)';
    for (const y of [0, 42, 85]) g.fillRect(0, y, 128, 3);
  }
  const t = keep(new THREE.CanvasTexture(woodCanvas));
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let blobCanvas: HTMLCanvasElement | null = null;
function blobTex(keep: Keep): THREE.Texture {
  if (!blobCanvas) {
    const c = (blobCanvas = document.createElement('canvas'));
    c.width = 128;
    c.height = 64;
    const g = c.getContext('2d')!;
    const img = g.createImageData(128, 64);
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 128; x++) {
        // 둥근 네모 모양으로 번지는 그림자
        const dx = Math.max(0, Math.abs(x - 63.5) / 63.5 - 0.62) / 0.38;
        const dy = Math.max(0, Math.abs(y - 31.5) / 31.5 - 0.35) / 0.65;
        const d = Math.min(1, Math.hypot(dx, dy));
        const a = Math.pow(1 - d, 1.8);
        img.data.set([0, 0, 0, Math.round(a * 255)], (y * 128 + x) * 4);
      }
    g.putImageData(img, 0, 0);
  }
  return keep(new THREE.CanvasTexture(blobCanvas));
}

/* ───────────── 모양 도구 ───────────── */

/** 꼭짓점마다 반지름 r 로 둥글린 다각형 */
function rounded(pts: V[]): THREE.Shape {
  const s = new THREE.Shape();
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const [x, y, r] = pts[i]!;
    const [px, py] = pts[(i - 1 + n) % n]!;
    const [nx, ny] = pts[(i + 1) % n]!;
    const l1 = Math.hypot(x - px, y - py);
    const l2 = Math.hypot(nx - x, ny - y);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const ax = x + ((px - x) / l1) * rr;
    const ay = y + ((py - y) / l1) * rr;
    const bx = x + ((nx - x) / l2) * rr;
    const by = y + ((ny - y) / l2) * rr;
    if (i === 0) s.moveTo(ax, ay);
    else s.lineTo(ax, ay);
    if (rr > 0) s.quadraticCurveTo(x, y, bx, by);
  }
  s.closePath();
  return s;
}

/** 옆모습 윤곽을 폭 w 로 밀고 가장자리를 b 만큼 둥글게 (윤곽 크기는 그대로) */
function slab(shape: THREE.Shape, w: number, b: number, keep: Keep): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth: w - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 5, curveSegments: 14 });
  g.translate(0, 0, -(w - 2 * b) / 2);
  g.computeVertexNormals();
  return keep(g);
}

/** 위에서 본 둥근 네모를 두께 h 로 (지붕 판 · 등) */
function topSlab(len: number, wid: number, r: number, h: number, keep: Keep, b = 0.015): THREE.BufferGeometry {
  const s = rounded([
    [len / 2, wid / 2, r],
    [-len / 2, wid / 2, r],
    [-len / 2, -wid / 2, r],
    [len / 2, -wid / 2, r],
  ]);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, h - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 3, curveSegments: 8 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, b, 0);
  return keep(g);
}

/** 볼록 다각형을 d 만큼 안으로 */
function inset(pts: [number, number][], d: number): [number, number][] {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pts[i]!;
    const [x2, y2] = pts[(i + 1) % n]!;
    area += x1 * y2 - x2 * y1;
  }
  const sgn = area > 0 ? 1 : -1;
  const lines = pts.map((p, i) => {
    const q = pts[(i + 1) % n]!;
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const l = Math.hypot(dx, dy);
    const nx = (-dy / l) * sgn;
    const ny = (dx / l) * sgn;
    return { px: p[0] + nx * d, py: p[1] + ny * d, dx, dy };
  });
  return lines.map((a, i) => {
    const b = lines[(i - 1 + n) % n]!;
    const den = b.dx * a.dy - b.dy * a.dx;
    const t = ((a.px - b.px) * a.dy - (a.py - b.py) * a.dx) / den;
    return [b.px + b.dx * t, b.py + b.dy * t];
  });
}

/** 다각형에서 x0 ~ x1 부분만 */
function clipX(pts: [number, number][], x0: number, x1: number): [number, number][] {
  const cut = (poly: [number, number][], keepFn: (x: number) => boolean, xc: number): [number, number][] => {
    const out: [number, number][] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      const ia = keepFn(a[0]);
      const ib = keepFn(b[0]);
      if (ia) out.push(a);
      if (ia !== ib) {
        const t = (xc - a[0]) / (b[0] - a[0]);
        out.push([xc, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return out;
  };
  return cut(cut(pts, (x) => x >= x0, x0), (x) => x <= x1, x1);
}

/* ───────────── 짓는 도구 ───────────── */

class Build {
  readonly g = new THREE.Group();
  readonly m: Mats;
  constructor(
    readonly keep: Keep,
    readonly L: number,
  ) {
    this.m = new Mats(keep);
  }

  add(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = this.g): THREE.Mesh {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  }

  /** 둥근 상자 (가운데 기준) */
  rbox(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, r = 0.02, parent?: THREE.Object3D): THREE.Mesh {
    const rr = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
    return this.add(this.keep(new RoundedBoxGeometry(w, h, d, 3, Math.max(0.001, rr))), mat, x, y, z, parent);
  }

  /**
   * 아래 몸통 — top: 앞 아래 → 앞 위 … 뒤 위 → 뒤 아래 (위쪽 윤곽), 바닥은 base 높이에 바퀴 자리 반원(wheels · wr)
   */
  body(top: V[], wheels: number[], wr: number, mat: THREE.Material, width = W, b = 0.07, base = 0.11): THREE.Mesh {
    const pts: V[] = [...top];
    const ra = wr + 0.025;
    for (const x of [...wheels].sort((a, c) => a - c)) {
      pts.push([x - ra, base, 0.02]);
      for (let k = 0; k <= 10; k++) {
        const a = Math.PI - (k / 10) * Math.PI;
        pts.push([x + Math.cos(a) * ra, wr + Math.sin(a) * ra, 0]);
      }
      pts.push([x + ra, base, 0.02]);
    }
    const mesh = this.add(slab(rounded(pts), width, b, this.keep), mat);
    // 바퀴 사이 아래 그늘 (바퀴집 너머가 비어 보이지 않게)
    this.rbox(Math.max(...wheels) - Math.min(...wheels), wr * 1.1, width - 0.3, this.m.wellMat, (Math.max(...wheels) + Math.min(...wheels)) / 2, wr * 0.75, 0, 0.02);
    return mesh;
  }

  /**
   * 객실 — 사다리꼴 옆모습 (뒤 아래 xr · 앞 아래 xf · 앞유리 기울기 sf · 뒷유리 기울기 sr, 높이 yb ~ yt),
   * 폭 cw. 앞유리 · 뒷유리 · 옆창(가운데 기둥) 유리를 붙이고, 지붕 판(roof 색)을 얹는다.
   */
  cabin(o: { xr: number; xf: number; sf: number; sr: number; yb: number; yt: number; cw?: number; paint: THREE.Material; roof?: THREE.Material; pillars?: number; roofT?: number; sideGlass?: boolean; rearGlass?: boolean }): void {
    const cw = o.cw ?? W - 0.14;
    const poly: [number, number][] = [
      [o.xr, o.yb],
      [o.xf, o.yb],
      [o.xf - o.sf, o.yt],
      [o.xr + o.sr, o.yt],
    ];
    this.add(slab(rounded(poly.map(([x, y]) => [x, y, 0.06] as V)), cw, 0.05, this.keep), o.paint);
    const glass = this.m.glass;
    // 앞유리 · 뒷유리 — 기운 면 위에 둥근 판
    const face = (a: [number, number], c: [number, number], wid: number): void => {
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      const n = new THREE.Vector3(c[1] - a[1], -(c[0] - a[0]), 0).normalize();
      if (n.y < 0) n.negate();
      const geo = this.keep(new THREE.ShapeGeometry(rounded([
        [wid / 2, len / 2 - 0.035, 0.05],
        [-wid / 2, len / 2 - 0.035, 0.05],
        [-wid / 2, -len / 2 + 0.03, 0.03],
        [wid / 2, -len / 2 + 0.03, 0.03],
      ]), 6));
      const mesh = new THREE.Mesh(geo, glass);
      const mid = new THREE.Vector3((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, 0).addScaledVector(n, 0.006);
      mesh.position.copy(mid);
      mesh.up.set(c[0] - a[0], c[1] - a[1], 0).normalize();
      mesh.lookAt(mid.clone().add(n));
      this.g.add(mesh);
    };
    face([o.xf, o.yb + 0.01], [o.xf - o.sf, o.yt - 0.005], cw - 0.1);
    if (o.rearGlass !== false) face([o.xr, o.yb + 0.01], [o.xr + o.sr, o.yt - 0.005], cw - 0.12);
    // 옆창 — 안으로 줄인 사다리꼴을 기둥 수만큼 나눔
    if (o.sideGlass !== false) {
      const inner = inset(
        [
          [o.xr, o.yb + 0.035],
          [o.xf, o.yb + 0.035],
          [o.xf - o.sf, o.yt],
          [o.xr + o.sr, o.yt],
        ],
        0.045,
      );
      const xs = inner.map((p) => p[0]);
      const x0 = Math.min(...xs);
      const x1 = Math.max(...xs);
      const parts = o.pillars ?? 2;
      const gap = 0.05;
      const seg = (x1 - x0 - gap * (parts - 1)) / parts;
      for (let k = 0; k < parts; k++) {
        const piece = clipX(inner, x0 + k * (seg + gap), x0 + k * (seg + gap) + seg);
        if (piece.length < 3) continue;
        const geo = this.keep(new THREE.ShapeGeometry(rounded(piece.map(([x, y]) => [x, y, 0.025] as V)), 4));
        for (const s of [-1, 1]) {
          const mesh = new THREE.Mesh(geo, glass);
          mesh.position.z = s * (cw / 2 + 0.003);
          if (s < 0) mesh.rotation.y = Math.PI;
          if (s < 0) mesh.scale.x = -1;
          this.g.add(mesh);
        }
      }
    }
    // 지붕 판
    if (o.roof) {
      const len = o.xf - o.sf - (o.xr + o.sr);
      this.add(topSlab(len + 0.05, cw + 0.02, 0.07, o.roofT ?? 0.035, this.keep), o.roof, (o.xf - o.sf + o.xr + o.sr) / 2, o.yt - 0.012, 0);
    }
  }

  /** 네 바퀴 (xs 축마다 양쪽) — 고무 타이어 · 은빛 휠 · 휠 너트 */
  wheels(xs: number[], r: number, wid = 0.16, rimMat?: THREE.Material, z = W / 2 - 0.085): void {
    const prof: THREE.Vector2[] = [];
    const ri = r * 0.6;
    const e = Math.min(0.04, wid * 0.3);
    for (const [px, py] of [
      [ri, -wid / 2],
      [r - e, -wid / 2],
      [r - e * 0.3, -wid / 2 + e * 0.3],
      [r, -wid / 2 + e],
      [r, wid / 2 - e],
      [r - e * 0.3, wid / 2 - e * 0.3],
      [r - e, wid / 2],
      [ri, wid / 2],
    ] as const)
      prof.push(new THREE.Vector2(px, py));
    const tire = this.keep(new THREE.LatheGeometry(prof, 32));
    tire.rotateX(Math.PI / 2);
    const rimG = this.keep(new THREE.CylinderGeometry(ri + 0.004, ri + 0.004, wid * 0.86, 24));
    rimG.rotateX(Math.PI / 2);
    const dish = this.keep(new THREE.CylinderGeometry(ri * 0.82, ri * 0.95, 0.02, 24));
    dish.rotateX(Math.PI / 2);
    const cap = this.keep(new THREE.SphereGeometry(ri * 0.3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2));
    cap.rotateX(Math.PI / 2);
    const spokeG = this.keep(new THREE.BoxGeometry(ri * 0.2, ri * 1.3, 0.02));
    const rm = rimMat ?? this.m.rim;
    for (const x of xs)
      for (const s of [-1, 1]) {
        const w = new THREE.Group();
        w.name = 'wheel';
        w.position.set(x, r, s * z);
        this.add(tire, this.m.tire, 0, 0, 0, w);
        this.add(rimG, this.m.dark, 0, 0, 0, w);
        const face = new THREE.Group();
        face.position.z = s * (wid * 0.43);
        if (s < 0) face.rotation.y = Math.PI;
        this.add(dish, rm, 0, 0, 0, face);
        for (let k = 0; k < 5; k++) {
          const sp = this.add(spokeG, rm, 0, 0, 0.012, face);
          sp.rotation.z = (k / 5) * Math.PI;
        }
        this.add(cap, this.m.chrome, 0, 0, 0.02, face);
        w.add(face);
        this.g.add(w);
      }
  }

  /** 앞뒤 등 · 범퍼 · 그릴 · 번호판 */
  ends(o: { y: number; bumper?: number; front?: boolean; grille?: boolean; lampW?: number; fx?: number; rx?: number; bumperMat?: THREE.Material; plate?: boolean }): void {
    const fx = o.fx ?? this.L / 2;
    const rx = o.rx ?? -this.L / 2;
    const lw = o.lampW ?? 0.15;
    const head = this.m.lamp(0xfffbea, 0xfff2c0, 0.9);
    const tail = this.m.lamp(0xff3a3a, 0xff1a1a, 0.9);
    for (const s of [-1, 1]) {
      this.rbox(0.05, 0.075, lw, head, fx - 0.012, o.y, s * (W / 2 - 0.1 - lw / 2 + 0.06), 0.02);
      this.rbox(0.05, 0.07, lw * 0.85, tail, rx + 0.012, o.y, s * (W / 2 - 0.1 - lw / 2 + 0.06), 0.02);
      // 앞 깜빡이
      this.rbox(0.03, 0.035, 0.05, this.m.lamp(0xffb030, 0xff8a00, 0.6), fx - 0.008, o.y - 0.07, s * (W / 2 - 0.07), 0.01);
    }
    if (o.grille !== false) {
      this.rbox(0.04, 0.07, W - 0.42, this.m.dark, fx - 0.008, o.y - 0.01, 0, 0.02);
      for (let k = 0; k < 3; k++) this.rbox(0.045, 0.008, W - 0.44, this.m.chrome, fx - 0.006, o.y - 0.035 + k * 0.025, 0, 0.003);
    }
    const bm = o.bumperMat ?? this.m.chrome;
    const by = o.bumper ?? 0.17;
    this.rbox(0.09, 0.07, W + 0.02, bm, fx - 0.01, by, 0, 0.03);
    this.rbox(0.09, 0.07, W + 0.02, bm, rx + 0.01, by, 0, 0.03);
    if (o.plate !== false)
      for (const [x, s] of [
        [fx + 0.035, 1],
        [rx - 0.035, -1],
      ] as const) {
        const p = this.rbox(0.012, 0.05, 0.16, this.m.plastic(0xf4f4ee, 0.4), x, by + 0.005, 0, 0.004);
        p.scale.x = s;
      }
  }

  /** 옆거울 */
  mirrors(x: number, y: number, mat: THREE.Material, z = W / 2 - 0.06): void {
    for (const s of [-1, 1]) {
      this.rbox(0.05, 0.05, 0.08, mat, x, y, s * (z + 0.04), 0.015);
      this.rbox(0.02, 0.04, 0.06, this.m.chrome, x - 0.02, y, s * (z + 0.05), 0.008);
    }
  }

  /** 발밑 그림자 */
  shadow(len = this.L): void {
    const mat = this.keep(new THREE.MeshBasicMaterial({ map: blobTex(this.keep), transparent: true, opacity: 0.6, depthWrite: false, color: 0x000000 }));
    const sh = new THREE.Mesh(this.keep(new THREE.PlaneGeometry(len + 0.24, W + 0.26)), mat);
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.004;
    sh.renderOrder = -1;
    this.g.add(sh);
  }

  /** 문틈 선 (옆면) */
  doorLine(x: number, y0: number, y1: number, z = W / 2): void {
    for (const s of [-1, 1]) this.rbox(0.008, y1 - y0, 0.004, this.m.plastic(0x000000, 0.6), x, (y0 + y1) / 2, s * (z + 0.001), 0.002);
  }

  /** 지붕 짐받이 (막대 두 줄 + 가로대) */
  roofRack(x0: number, x1: number, y: number, wid: number): void {
    const d = this.m.dark;
    for (const s of [-1, 1]) {
      this.rbox(x1 - x0, 0.03, 0.03, d, (x0 + x1) / 2, y + 0.05, s * wid / 2, 0.012);
      for (const x of [x0 + 0.03, x1 - 0.03]) this.rbox(0.03, 0.05, 0.03, d, x, y + 0.025, s * wid / 2, 0.01);
    }
    for (let k = 0; k < 3; k++) this.rbox(0.025, 0.025, wid, d, x0 + 0.06 + ((x1 - x0 - 0.12) * k) / 2, y + 0.055, 0, 0.01);
  }

  /** 나무 상자 */
  crate(x: number, y: number, z: number, s: number, rot = 0): void {
    const c = this.rbox(s, s * 0.9, s, this.m.wood(), x, y + s * 0.45, z, 0.012);
    c.rotation.y = rot;
    for (const dy of [-1, 1]) {
      const band = this.rbox(s + 0.006, 0.02, s + 0.006, this.m.wood(0x9a6a3a), 0, dy * s * 0.36, 0, 0.005, c);
      band.position.set(0, dy * s * 0.36, 0);
    }
  }
}

/* ───────────── 차 ───────────── */

const carCache = new Map<string, THREE.Group>();
/**
 * 장난감 차 하나 — 종류 · 길이 · 색이 같은 차는 처음 한 번만 짓고 다음부터는 복사본(모양 · 재질 공유).
 * 공유 자원은 판을 바꿔도 버리지 않는다 (차 종류 × 색 수만큼만 생긴다).
 */
export function buildToyCar(kind: ToyKind, len: number, _keep: Keep, color?: number): THREE.Group {
  const key = `${kind}:${len}:${color ?? ''}`;
  let t = carCache.get(key);
  if (!t) carCache.set(key, (t = makeToyCar(kind, len, (x) => x, color)));
  return t.clone();
}

function makeToyCar(kind: ToyKind, len: number, keep: Keep, color?: number): THREE.Group {
  const L = len - 0.12;
  const H = L / 2;
  const b = new Build(keep, L);
  const m = b.m;
  const white = m.paint(0xf6f4ee);
  switch (kind) {
    case 'sports': {
      // 주인공 — 낮고 긴 빨간 스포츠카 · 금빛 줄 두 개 · 뒤 날개 · 금빛 휠
      const red = m.paint(0xe8202c);
      const gold = new THREE.MeshPhysicalMaterial({ color: 0xffc53a, metalness: 0.85, roughness: 0.22, clearcoat: 1 });
      keep(gold);
      const wr = 0.16;
      const wx = [-H + 0.34, H - 0.34];
      b.body(
        [
          [H, 0.13, 0.05],
          [H + 0.005, 0.24, 0.08],
          [H - 0.1, 0.33, 0.1],
          [0.6, 0.39, 0.12],
          [0.32, 0.365, 0.12],
          [-0.3, 0.37, 0.12],
          [-0.6, 0.4, 0.12],
          [-H + 0.04, 0.38, 0.05],
          [-H, 0.3, 0.06],
          [-H, 0.13, 0.04],
        ],
        wx,
        wr,
        red,
        W,
        0.08,
      );
      b.cabin({ xr: -H + 0.42, xf: 0.24, sf: 0.27, sr: 0.27, yb: 0.34, yt: 0.55, cw: W - 0.2, paint: red, roof: red, roofT: 0.03, pillars: 1 });
      // 금빛 경주 줄 — 보닛 · 지붕 · 트렁크
      for (const s of [-1, 1]) {
        // 보닛 (x 0.2 ~ H − 0.15 에서 y 0.335 → 0.305 로 내려감)
        b.rbox(0.36, 0.008, 0.05, gold, 0.44, 0.372, s * 0.07, 0.004).rotation.z = -0.03;
        b.rbox(0.2, 0.008, 0.05, gold, -0.12, 0.579, s * 0.07, 0.004);
        b.rbox(0.26, 0.008, 0.05, gold, -0.66, 0.398, s * 0.07, 0.004);
      }
      // 뒤 날개
      for (const s of [-1, 1]) b.rbox(0.05, 0.1, 0.03, m.dark, -H + 0.1, 0.44, s * 0.25, 0.01);
      b.rbox(0.16, 0.03, W - 0.04, red, -H + 0.08, 0.5, 0, 0.012);
      // 옆 공기구멍
      for (const s of [-1, 1]) b.rbox(0.14, 0.04, 0.01, m.dark, -0.05, 0.25, s * (W / 2 + 0.001), 0.008);
      b.wheels(wx, wr, 0.18, gold);
      b.ends({ y: 0.25, bumper: 0.15, lampW: 0.17, grille: true, bumperMat: m.dark });
      for (const s of [-1, 1]) {
        const pipe = b.add(keep(new THREE.CylinderGeometry(0.035, 0.04, 0.1, 14, 1, true).rotateZ(Math.PI / 2)), m.chrome, -H - 0.03, 0.15, s * 0.2);
        pipe.castShadow = false;
        b.add(keep(new THREE.CircleGeometry(0.03, 14).rotateY(-Math.PI / 2)), m.dark, -H - 0.075, 0.15, s * 0.2);
      }
      b.mirrors(0.14, 0.42, red, W / 2 - 0.12);
      b.doorLine(-0.04, 0.17, 0.35);
      break;
    }
    case 'sedan':
    case 'taxi': {
      // 세단 — 지붕은 흰색 (택시는 노랑 · 바둑판 띠 · 지붕 등)
      const c = kind === 'taxi' ? m.paint(0xffc21a) : m.paint(color ?? 0xffb81c);
      const wr = 0.17;
      const wx = [-H + 0.33, H - 0.34];
      b.body(
        [
          [H, 0.13, 0.05],
          [H + 0.005, 0.29, 0.07],
          [H - 0.07, 0.39, 0.08],
          [0.25, 0.42, 0.06],
          [-H + 0.28, 0.43, 0.05],
          [-H + 0.03, 0.41, 0.05],
          [-H, 0.3, 0.06],
          [-H, 0.13, 0.04],
        ],
        wx,
        wr,
        c,
      );
      b.cabin({ xr: -H + 0.32, xf: 0.3, sf: 0.24, sr: 0.2, yb: 0.4, yt: 0.68, paint: c, roof: white });
      b.ends({ y: 0.31, bumper: 0.16 });
      b.mirrors(0.22, 0.47, c);
      b.doorLine(-0.08, 0.16, 0.41);
      b.doorLine(0.3, 0.16, 0.41);
      if (kind === 'taxi') {
        const sign = b.rbox(0.13, 0.085, 0.29, m.lamp(0xfff6d8, 0xffe08a, 0.7), -0.12, 0.7805, 0, 0.03);
        sign.name = 'glow';
        const base = b.rbox(0.16, 0.03, 0.33, m.dark, -0.12, 0.7185, 0, 0.01);
        sign.castShadow = false;
        base.castShadow = false;
        for (const s of [-1, 1])
          for (let i = 0; i < 12; i++) {
            const st = b.rbox(0.07, 0.03, 0.01, i % 2 ? white : m.dark, -0.5 + i * 0.075, 0.3, s * (W / 2 + 0.006), 0.003);
            st.castShadow = false;
          }
      }
      b.wheels(wx, wr);
      break;
    }
    case 'suv': {
      // SUV — 높고 각진 몸 · 흰 지붕 · 짐받이 · 검은 바퀴집 테
      const c = m.paint(color ?? 0x1f4fd6);
      const wr = 0.18;
      const wx = [-H + 0.34, H - 0.34];
      b.body(
        [
          [H, 0.14, 0.05],
          [H + 0.005, 0.32, 0.07],
          [H - 0.06, 0.44, 0.07],
          [0.38, 0.46, 0.05],
          [-H + 0.04, 0.46, 0.05],
          [-H, 0.36, 0.05],
          [-H, 0.14, 0.04],
        ],
        wx,
        wr,
        c,
      );
      b.cabin({ xr: -H + 0.06, xf: 0.42, sf: 0.22, sr: 0.05, yb: 0.43, yt: 0.72, paint: c, roof: white, pillars: 3 });
      b.roofRack(-H + 0.15, 0.1, 0.73, W - 0.24);
      for (const x of wx) {
        const flare = keep(new THREE.TorusGeometry(wr + 0.045, 0.025, 8, 20, Math.PI));
        for (const s of [-1, 1]) b.add(flare, m.dark, x, wr, s * (W / 2 + 0.005));
      }
      b.ends({ y: 0.34, bumper: 0.18, bumperMat: m.dark });
      b.mirrors(0.32, 0.5, c);
      b.doorLine(0.0, 0.18, 0.44);
      b.doorLine(-0.38, 0.18, 0.44);
      b.wheels(wx, wr, 0.17);
      break;
    }
    case 'jeep': {
      // 지프 — 각진 노랑 몸 · 검은 바퀴집 · 지붕 짐받이 · 뒤 예비 바퀴 · 앞 철망
      const c = m.paint(color ?? 0xffb01a);
      const wr = 0.19;
      const wx = [-H + 0.33, H - 0.33];
      b.body(
        [
          [H, 0.15, 0.03],
          [H, 0.46, 0.05],
          [0.3, 0.48, 0.03],
          [-H, 0.48, 0.04],
          [-H, 0.15, 0.03],
        ],
        wx,
        wr,
        c,
        W,
        0.05,
      );
      b.cabin({ xr: -H + 0.02, xf: 0.32, sf: 0.06, sr: 0.0, yb: 0.46, yt: 0.78, cw: W - 0.1, paint: c, roof: c, pillars: 2 });
      b.roofRack(-H + 0.08, 0.2, 0.79, W - 0.16);
      for (const x of wx)
        for (const s of [-1, 1]) {
          const flare = keep(new THREE.TorusGeometry(wr + 0.05, 0.035, 8, 20, Math.PI));
          b.add(flare, m.dark, x, wr, s * (W / 2 + 0.01));
        }
      // 뒤 예비 바퀴
      const spare = new THREE.Group();
      spare.rotation.y = Math.PI / 2;
      spare.position.set(-H - 0.07, 0.42, 0);
      const t = keep(new THREE.TorusGeometry(0.14, 0.065, 12, 24));
      b.add(t, m.tire, 0, 0, 0, spare);
      b.add(keep(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 20).rotateX(Math.PI / 2)), m.rim, 0, 0, 0, spare);
      b.g.add(spare);
      // 앞 철망 막대
      for (let k = 0; k < 5; k++) b.rbox(0.03, 0.18, 0.025, m.dark, H + 0.01, 0.32, -0.16 + k * 0.08, 0.008);
      b.ends({ y: 0.38, bumper: 0.17, bumperMat: m.dark, grille: false });
      b.mirrors(0.28, 0.54, m.dark, W / 2 - 0.02);
      b.wheels(wx, wr, 0.19);
      break;
    }
    case 'pickup': {
      // 픽업트럭 — 초록 · 운전석 + 열린 짐칸에 나무 상자
      const c = m.paint(color ?? 0x5cbf2a);
      const wr = 0.18;
      const wx = [-H + 0.32, H - 0.33];
      b.body(
        [
          [H, 0.14, 0.05],
          [H + 0.005, 0.32, 0.07],
          [H - 0.07, 0.43, 0.06],
          [0.25, 0.46, 0.04],
          [-H, 0.46, 0.04],
          [-H, 0.14, 0.04],
        ],
        wx,
        wr,
        c,
      );
      b.cabin({ xr: -0.12, xf: 0.3, sf: 0.18, sr: 0.03, yb: 0.44, yt: 0.73, paint: c, roof: c, pillars: 1 });
      // 짐칸 — 안쪽 바닥(검정) + 테
      b.rbox(H - 0.1, 0.02, W - 0.14, m.plastic(0x2b2d33, 0.8), (-H - 0.1) / 2 + 0.02, 0.465, 0, 0.005);
      for (const s of [-1, 1]) b.rbox(H - 0.07, 0.04, 0.05, c, (-H - 0.12) / 2 + 0.02, 0.49, s * (W / 2 - 0.03), 0.015);
      b.rbox(0.05, 0.04, W - 0.02, c, -H + 0.03, 0.49, 0, 0.015);
      b.crate(-0.6, 0.47, -0.14, 0.24, 0.05);
      b.crate(-0.36, 0.47, 0.13, 0.2, -0.1);
      b.crate(-0.62, 0.47, 0.16, 0.18, 0.2);
      b.ends({ y: 0.34, bumper: 0.17 });
      b.mirrors(0.22, 0.5, c);
      b.doorLine(-0.1, 0.17, 0.45);
      b.wheels(wx, wr, 0.17);
      break;
    }
    case 'police': {
      // 경찰차 — 흰 몸 · 남색 문 · 지붕 경광등(빨강 · 파랑 번쩍)
      const navy = m.paint(0x22325e);
      const wr = 0.175;
      const wx = [-H + 0.33, H - 0.33];
      b.body(
        [
          [H, 0.13, 0.05],
          [H + 0.005, 0.31, 0.07],
          [H - 0.07, 0.42, 0.07],
          [0.32, 0.45, 0.05],
          [-H + 0.05, 0.46, 0.05],
          [-H, 0.34, 0.05],
          [-H, 0.13, 0.04],
        ],
        wx,
        wr,
        white,
      );
      b.cabin({ xr: -H + 0.08, xf: 0.36, sf: 0.22, sr: 0.08, yb: 0.43, yt: 0.72, paint: white, roof: white, pillars: 2 });
      for (const s of [-1, 1]) b.rbox(0.62, 0.17, 0.01, navy, -0.06, 0.27, s * (W / 2 + 0.002), 0.03);
      // 경광등
      b.rbox(0.12, 0.04, 0.5, m.dark, -0.18, 0.764, 0, 0.015).castShadow = false;
      for (const [s, col] of [
        [-1, 0x2a6aff],
        [1, 0xff2a2a],
      ] as const) {
        const sr = b.rbox(0.11, 0.07, 0.22, m.lamp(col, col, 1.2).clone(), -0.18, 0.823, s * 0.12, 0.03);
        sr.castShadow = false;
        keep(sr.material as THREE.Material);
        sr.name = 'siren';
      }
      b.ends({ y: 0.33, bumper: 0.17, bumperMat: m.dark });
      b.mirrors(0.28, 0.5, white);
      b.doorLine(-0.06, 0.16, 0.44);
      b.wheels(wx, wr);
      break;
    }
    case 'mini': {
      // 동글동글 작은 차 — 둥근 지붕(흰색) · 큰 등
      const c = m.paint(color ?? 0xff6fa8);
      const wr = 0.16;
      const wx = [-H + 0.3, H - 0.3];
      b.body(
        [
          [H, 0.13, 0.06],
          [H + 0.005, 0.29, 0.1],
          [H - 0.12, 0.39, 0.1],
          [0.3, 0.41, 0.06],
          [-H + 0.04, 0.42, 0.08],
          [-H, 0.3, 0.08],
          [-H, 0.13, 0.05],
        ],
        wx,
        wr,
        c,
        W,
        0.09,
      );
      b.cabin({ xr: -H + 0.08, xf: 0.34, sf: 0.2, sr: 0.1, yb: 0.39, yt: 0.68, paint: c, roof: white, pillars: 2 });
      b.ends({ y: 0.29, bumper: 0.16, lampW: 0.13 });
      b.mirrors(0.26, 0.44, white);
      b.doorLine(-0.05, 0.16, 0.38);
      b.wheels(wx, wr, 0.15);
      break;
    }
    case 'bus': {
      // 노란 학교 버스 — 짧은 보닛 · 긴 창 줄 · 흰 지붕 · 검은 띠
      const y = m.paint(0xffb514);
      const wr = 0.18;
      const wx = [-H + 0.45, H - 0.42];
      b.body(
        [
          [H, 0.14, 0.05],
          [H + 0.005, 0.34, 0.06],
          [H - 0.05, 0.43, 0.06],
          [H - 0.3, 0.46, 0.05],
          [H - 0.36, 0.86, 0.06],
          [-H, 0.86, 0.07],
          [-H, 0.14, 0.04],
        ],
        wx,
        wr,
        y,
        W + 0.02,
        0.07,
      );
      // 흰 지붕 판
      b.add(topSlab(L - 0.42, W - 0.04, 0.1, 0.05, keep), white, -0.18, 0.84, 0);
      // 앞유리
      const ws = keep(new THREE.ShapeGeometry(rounded([
        [0.3, 0.17, 0.04],
        [-0.3, 0.17, 0.04],
        [-0.3, -0.15, 0.04],
        [0.3, -0.15, 0.04],
      ])));
      const wm = new THREE.Mesh(ws, m.glass);
      wm.position.set(H - 0.35 + 0.01, 0.67, 0);
      wm.rotation.y = Math.PI / 2;
      wm.rotation.x = 0;
      b.g.add(wm);
      // 옆 창 줄 · 검은 띠
      const pane = keep(new THREE.ShapeGeometry(rounded([
        [0.14, 0.09, 0.025],
        [-0.14, 0.09, 0.025],
        [-0.14, -0.09, 0.025],
        [0.14, -0.09, 0.025],
      ])));
      for (const s of [-1, 1]) {
        for (let i = 0; i < 7; i++) {
          const p = new THREE.Mesh(pane, m.glass);
          p.position.set(H - 0.5 - i * 0.33, 0.68, s * (W / 2 + 0.013));
          if (s < 0) p.rotation.y = Math.PI;
          b.g.add(p);
        }
        b.rbox(L - 0.4, 0.035, 0.01, m.dark, -0.18, 0.5, s * (W / 2 + 0.012), 0.008);
        b.rbox(L - 0.4, 0.035, 0.01, m.dark, -0.18, 0.4, s * (W / 2 + 0.012), 0.008);
      }
      // 지붕 등 (빨강 · 주황)
      for (const x of [H - 0.42, -H + 0.08])
        for (const s of [-1, 1]) b.rbox(0.05, 0.05, 0.08, m.lamp(0xff6a2a, 0xff3a00, 0.6), x, 0.83, s * 0.28, 0.015);
      b.ends({ y: 0.32, bumper: 0.17, bumperMat: m.dark, fx: H, lampW: 0.13 });
      b.mirrors(H - 0.1, 0.5, m.dark, W / 2);
      b.wheels(wx, wr, 0.18);
      break;
    }
    case 'boxtruck':
    case 'fire':
    case 'garbage':
    case 'dump':
    case 'camper': {
      // 짐차 — 앞 운전석(보닛 짧음) + 뒤 짐칸 (종류마다)
      const cabCol = kind === 'fire' ? 0xe0242c : kind === 'garbage' ? 0x2f9a52 : kind === 'dump' ? 0xffae12 : kind === 'camper' ? 0xf4f2ea : (color ?? 0xff7a1a);
      const c = m.paint(cabCol);
      const wr = 0.19;
      const wx = kind === 'dump' || kind === 'fire' || kind === 'garbage' ? [-H + 0.34, -H + 0.8, H - 0.36] : [-H + 0.42, H - 0.36];
      const cabBack = H - 0.78;
      // 운전석 몸 (낮은 판 위)
      b.body(
        [
          [H, 0.14, 0.05],
          [H + 0.005, 0.34, 0.07],
          [H - 0.06, 0.46, 0.06],
          [H - 0.2, 0.48, 0.04],
          [cabBack, 0.48, 0.03],
          [cabBack, 0.14, 0.03],
        ],
        wx.filter((x) => x > cabBack),
        wr,
        c,
      );
      b.cabin({ xr: cabBack + 0.02, xf: H - 0.2, sf: 0.14, sr: 0.0, yb: 0.46, yt: 0.83, paint: c, roof: kind === 'camper' ? m.paint(0x4cb4dc) : c, pillars: 1, rearGlass: false });
      // 차대 (짐칸 아래 검은 틀)
      b.rbox(cabBack + H - 0.02, 0.12, W - 0.16, m.dark, (cabBack - H) / 2, 0.24, 0, 0.02);
      for (const x of wx.filter((x) => x < cabBack))
        for (const s of [-1, 1]) {
          const fender = keep(new THREE.CylinderGeometry(wr + 0.05, wr + 0.05, 0.2, 20, 1, false, 0, Math.PI));
          fender.rotateX(Math.PI / 2);
          fender.rotateZ(-Math.PI / 2);
          b.add(fender, m.dark, x, wr + 0.02, s * (W / 2 - 0.1));
        }
      const bx0 = -H;
      const bx1 = cabBack - 0.03;
      const bl = bx1 - bx0;
      const bc = (bx0 + bx1) / 2;
      if (kind === 'boxtruck') {
        // 짐 상자 — 크림색 · 주황 띠 · 뒤 문 손잡이
        const box = m.paint(0xf6efe0);
        b.add(slab(rounded([
          [bx1, 0.3, 0.04],
          [bx1, 0.92, 0.05],
          [bx0, 0.92, 0.05],
          [bx0, 0.3, 0.04],
        ]), W + 0.04, 0.05, keep), box);
        for (const s of [-1, 1]) {
          b.rbox(bl - 0.12, 0.08, 0.01, c, bc, 0.55, s * (W / 2 + 0.022), 0.02);
          b.rbox(bl - 0.12, 0.025, 0.01, c, bc, 0.44, s * (W / 2 + 0.022), 0.01);
        }
        b.rbox(0.012, 0.56, 0.01, m.dark, bx0 - 0.002, 0.6, 0, 0.004);
        for (const s of [-1, 1]) b.rbox(0.02, 0.2, 0.025, m.chrome, bx0 - 0.01, 0.6, s * 0.06, 0.008);
      } else if (kind === 'fire') {
        // 소방차 — 빨간 상자 · 흰 띠 · 지붕 사다리 · 경광등
        b.add(slab(rounded([
          [bx1, 0.3, 0.04],
          [bx1, 0.74, 0.05],
          [bx0, 0.74, 0.05],
          [bx0, 0.3, 0.04],
        ]), W + 0.04, 0.05, keep), c);
        for (const s of [-1, 1]) {
          b.rbox(bl - 0.08, 0.05, 0.01, white, bc, 0.42, s * (W / 2 + 0.022), 0.015);
          for (let i = 0; i < 3; i++) b.rbox(bl / 3 - 0.06, 0.2, 0.008, m.chrome, bx0 + 0.04 + (bl / 3) * (i + 0.5), 0.6, s * (W / 2 + 0.022), 0.02);
        }
        const steel = m.rim;
        for (const s of [-1, 1]) b.rbox(L - 0.6, 0.035, 0.035, steel, -0.2, 0.82, s * 0.17, 0.012);
        for (let i = 0; i < 11; i++) b.rbox(0.025, 0.025, 0.34, steel, -H + 0.12 + i * ((L - 0.7) / 10), 0.82, 0, 0.008);
        for (const s of [-1, 1]) b.rbox(0.04, 0.08, 0.04, m.dark, -0.2, 0.78, s * 0.17, 0.01);
        for (const [s, col] of [
          [-1, 0x2a6aff],
          [1, 0xff2a2a],
        ] as const) {
          const sr = b.rbox(0.09, 0.06, 0.2, m.lamp(col, col, 1.2).clone(), H - 0.34, 0.84, s * 0.12, 0.025);
          keep(sr.material as THREE.Material);
          sr.name = 'siren';
        }
      } else if (kind === 'garbage') {
        // 청소차 — 둥근 초록 통 · 골 · 뒤 투입구
        const tank = m.paint(0x3fb466);
        b.add(slab(rounded([
          [bx1, 0.3, 0.06],
          [bx1, 0.86, 0.14],
          [bx0 + 0.1, 0.86, 0.14],
          [bx0, 0.7, 0.06],
          [bx0, 0.3, 0.04],
        ]), W + 0.04, 0.1, keep), tank);
        for (let i = 0; i < 4; i++)
          for (const s of [-1, 1]) b.rbox(0.035, 0.46, 0.012, m.paint(0x2c8a4c), bx0 + 0.25 + i * ((bl - 0.4) / 3), 0.56, s * (W / 2 + 0.022), 0.01);
        b.rbox(0.06, 0.3, W - 0.2, m.dark, bx0 - 0.02, 0.45, 0, 0.02);
        const bin = b.rbox(0.18, 0.22, 0.2, m.paint(0x2f7ae0), bx0 - 0.1, 0.72, 0.18, 0.03);
        bin.name = 'bounce';
      } else if (kind === 'dump') {
        // 덤프트럭 — 회색 쇠 짐칸 · 흙 더미 · 노랑 검정 빗금
        const steel = m.plastic(0x7a808e, 0.45);
        b.add(slab(rounded([
          [bx1, 0.32, 0.02],
          [bx1, 0.74, 0.03],
          [bx0 - 0.02, 0.74, 0.03],
          [bx0 + 0.04, 0.32, 0.02],
        ]), W + 0.04, 0.03, keep), steel);
        // 짐칸 바닥 판은 짐칸 윗면(0.74)보다 높게 — 같은 높이면 면이 겹쳐 지지직
        b.rbox(bl - 0.1, 0.03, W - 0.1, m.plastic(0x3a3c44, 0.9), bc, 0.755, 0, 0.01);
        // 짐칸 테 (쇠 벽 윗부분)
        for (const s of [-1, 1]) b.rbox(bl, 0.07, 0.05, steel, bc, 0.78, s * (W / 2 - 0.005), 0.015);
        for (const x of [bx0 + 0.01, bx1 - 0.025]) b.rbox(0.05, 0.07, W + 0.04, steel, x, 0.78, 0, 0.015);
        // 돌무더기 — 짙은 회색 바닥 언덕(틈 메움) 위에 크고 작은 회색 바위를 수북이. 가장자리는 짐칸 바닥(0.77) 아래로 묻힘
        const sx = bl - 0.14;
        const sz = W - 0.16;
        const sand = keep(new THREE.PlaneGeometry(sx, sz, 48, 20).rotateX(-Math.PI / 2));
        const sp = sand.attributes['position'] as THREE.BufferAttribute;
        const hAt = (x: number, z: number): number => {
          const u = x / (sx / 2);
          const v = z / (sz / 2);
          const base = 1 - Math.pow(Math.abs(u), 2.2) - Math.pow(Math.abs(v), 2.2) * 1.1;
          // 봉우리 둘 · 낮은 굴곡 (아주 부드럽게)
          const lump = Math.exp(-((u + 0.35) ** 2) * 6 - v * v * 3) * 0.25 + Math.exp(-((u - 0.3) ** 2) * 7 - (v - 0.15) ** 2 * 4) * 0.18 + Math.sin(u * 5.2) * Math.cos(v * 3.1) * 0.04;
          return Math.max(-0.05, base * 0.8 + lump);
        };
        for (let i = 0; i < sp.count; i++) sp.setY(i, hAt(sp.getX(i), sp.getZ(i)) * 0.24);
        sand.computeVertexNormals();
        const sandM = keep(new THREE.MeshStandardMaterial({ color: 0x55524c, roughness: 1 }));
        b.add(sand, sandM, bc, 0.765, 0);
        // 바위 — 모서리가 둥근 돌 (정점을 조금씩 흔든 이십면체), 언덕 높이를 따라 겹겹이
        const rockG = (() => {
          const g = new THREE.IcosahedronGeometry(1, 1);
          const pp = g.attributes['position'] as THREE.BufferAttribute;
          const vv = new THREE.Vector3();
          for (let i = 0; i < pp.count; i++) {
            vv.fromBufferAttribute(pp, i);
            const k = 0.82 + (Math.sin(vv.x * 5.3 + vv.y * 3.1) * Math.cos(vv.z * 4.7) * 0.5 + 0.5) * 0.3;
            pp.setXYZ(i, vv.x * k, vv.y * k, vv.z * k);
          }
          g.computeVertexNormals();
          return keep(g);
        })();
        const rockM = [0x9a978f, 0x86827a, 0xb0aca2, 0x76726b, 0x8f8a80].map((c) => keep(new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, flatShading: true })));
        let rs = 11;
        const rnd = (): number => ((rs = (rs * 16807) % 2147483647) / 2147483647);
        for (let i = 0; i < 70; i++) {
          const x = (rnd() - 0.5) * sx * 0.9;
          const z = (rnd() - 0.5) * sz * 0.85;
          const h = hAt(x, z);
          if (h < 0.05) continue;
          const r = 0.045 + rnd() * 0.045;
          const rk = b.add(rockG, rockM[i % rockM.length]!, bc + x, 0.765 + h * 0.24 + r * 0.15, z);
          rk.scale.set(r * (1 + rnd() * 0.4), r * (0.7 + rnd() * 0.3), r * (0.9 + rnd() * 0.3));
          rk.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6);
        }
        for (const s of [-1, 1]) for (let i = 0; i < 8; i++) b.rbox(0.09, 0.07, 0.008, i % 2 ? m.dark : m.paint(0xffc61a), bx0 + 0.1 + i * 0.1, 0.38, s * (W / 2 + 0.022), 0.005);
      } else {
        // 캠핑카 — 흰 몸 · 하늘색 띠 · 창 · 지붕 짐
        b.add(slab(rounded([
          [bx1 + 0.02, 0.3, 0.04],
          [bx1 + 0.02, 0.9, 0.1],
          [bx0, 0.9, 0.08],
          [bx0, 0.3, 0.04],
        ]), W + 0.04, 0.06, keep), white);
        const pane = keep(new THREE.ShapeGeometry(rounded([
          [0.13, 0.08, 0.04],
          [-0.13, 0.08, 0.04],
          [-0.13, -0.08, 0.04],
          [0.13, -0.08, 0.04],
        ])));
        for (const s of [-1, 1]) {
          b.rbox(bl - 0.06, 0.07, 0.01, m.paint(0x4cb4dc), bc, 0.47, s * (W / 2 + 0.022), 0.02);
          b.rbox(bl - 0.06, 0.025, 0.01, m.paint(0xff8a5a), bc, 0.4, s * (W / 2 + 0.022), 0.01);
          for (let i = 0; i < 2; i++) {
            const p = new THREE.Mesh(pane, m.glass);
            p.position.set(bx0 + 0.35 + i * 0.6, 0.68, s * (W / 2 + 0.024));
            if (s < 0) p.rotation.y = Math.PI;
            b.g.add(p);
          }
        }
        b.roofRack(bx0 + 0.15, bx1 - 0.15, 0.9, W - 0.2);
        b.rbox(0.5, 0.12, 0.36, m.plastic(0xd8763a, 0.7), bc - 0.1, 1.0, 0, 0.04);
      }
      b.ends({ y: 0.33, bumper: 0.17, bumperMat: m.dark, rx: -H });
      b.mirrors(H - 0.22, 0.55, m.dark, W / 2);
      b.wheels(wx, wr, 0.18);
      break;
    }
  }
  b.shadow();
  return b.g;
}

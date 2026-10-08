import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * 공용 모델 — SF 레이저 블래스터 (하드서피스, 블렌더 없이 코드로)
 *  단위: cm. 총구는 +X, 위는 +Y, 두께는 Z (가운데 0).
 *  만들기는 생성기로 잘게 나눠 프레임당 3ms 씩 (kitStep) — 한 번 만든 kit 은 모든 견본이 같이 쓴다.
 *  단계(stage): 0 윤곽선 · 1 돌출 · 2 베벨 · 3 부품 · 4 나사/패널선 · 5 무늬/각인 · 6 재질/닳음 · 7 렌즈
 */

export const FONT = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/* ───────────── 환경 빛 (HDR · 렌더러마다 PMREM 한 번) ───────────── */

let hdrTex: THREE.DataTexture | null = null;
let hdrState = 0; // 0 아직 · 1 받는 중 · 2 받음 · 3 실패
export function loadHdr(): void {
  if (hdrState) return;
  hdrState = 1;
  const url = new URL('../../assets/polyhaven/studio_small_09_1k.hdr', import.meta.url).href;
  new HDRLoader()
    .loadAsync(url)
    .then((t) => {
      t.mapping = THREE.EquirectangularReflectionMapping;
      hdrTex = t;
      hdrState = 2;
    })
    .catch(() => {
      hdrState = 3;
    });
}
/** HDR 을 받았거나(또는 실패) 2.5초가 지나면 true */
export function hdrSettled(since: number): boolean {
  return hdrState >= 2 || performance.now() - since > 2500;
}
const ENV_HDR = new WeakMap<THREE.WebGLRenderer, THREE.Texture>();
const ENV_ROOM = new WeakMap<THREE.WebGLRenderer, THREE.Texture>();
export function envFor(r: THREE.WebGLRenderer): THREE.Texture {
  if (hdrTex) {
    let e = ENV_HDR.get(r);
    if (!e) {
      const pm = new THREE.PMREMGenerator(r);
      e = pm.fromEquirectangular(hdrTex).texture;
      pm.dispose();
      ENV_HDR.set(r, e);
    }
    return e;
  }
  let e = ENV_ROOM.get(r);
  if (!e) {
    const pm = new THREE.PMREMGenerator(r);
    const room = new RoomEnvironment();
    e = pm.fromScene(room, 0.04).texture;
    pm.dispose();
    room.dispose();
    ENV_ROOM.set(r, e);
  }
  return e;
}

/* ───────────── 옆면 시트 (패널선 · 각인 높이 → 법선, 데칼 색) ───────────── */
// 옆모습 돌출 부품의 앞뒤 면 uv = 윤곽 좌표 (cm) — 그래서 시트 한 장에 모든 부품의 무늬를 그린다.
export const SHEET = { x0: -42, y0: -17.2, s: 20, w: 2048, h: 584 };
const SHEET_TOP = SHEET.y0 + SHEET.h / SHEET.s;

/** 시트 캔버스 = 위 절반 뒷면(-Z, 글씨는 거울로) · 아래 절반 앞면(+Z) */
function cmCtx(c: HTMLCanvasElement, back = false): CanvasRenderingContext2D {
  const g = c.getContext('2d')!;
  g.setTransform(SHEET.s, 0, 0, -SHEET.s, -SHEET.x0 * SHEET.s, SHEET_TOP * SHEET.s + (back ? 0 : SHEET.h));
  return g;
}
let MIRROR = false;
/** 앞 · 뒤 반쪽에 같은 그림을 (뒤는 글씨만 거울로 — 뒤에서 봐도 바로 읽히게) */
function bothSides(c: HTMLCanvasElement, draw: (g: CanvasRenderingContext2D) => void, only?: boolean): void {
  for (const back of only === undefined ? [false, true] : [only]) {
    const g = cmCtx(c, back);
    g.save();
    g.beginPath();
    g.rect(SHEET.x0, SHEET.y0, SHEET.w / SHEET.s, SHEET.h / SHEET.s);
    g.clip();
    MIRROR = back;
    draw(g);
    g.restore();
  }
  MIRROR = false;
}
type Pt = [number, number, number?];
/** 모서리마다 반지름을 줄 수 있는 다각형 경로 (2D 캔버스 · THREE.Path 둘 다) */
function roundPath(p: { moveTo(x: number, y: number): unknown; lineTo(x: number, y: number): unknown; quadraticCurveTo(a: number, b: number, c: number, d: number): unknown }, pts: Pt[]): void {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[(i + n - 1) % n]!;
    const b = pts[i]!;
    const c = pts[(i + 1) % n]!;
    const r = b[2] ?? 0;
    if (r <= 0) {
      if (i === 0) p.moveTo(b[0], b[1]);
      else p.lineTo(b[0], b[1]);
      continue;
    }
    const l1 = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const k1 = Math.min(r, l1 * 0.45) / l1;
    const k2 = Math.min(r, l2 * 0.45) / l2;
    const sx = b[0] + (a[0] - b[0]) * k1;
    const sy = b[1] + (a[1] - b[1]) * k1;
    if (i === 0) p.moveTo(sx, sy);
    else p.lineTo(sx, sy);
    p.quadraticCurveTo(b[0], b[1], b[0] + (c[0] - b[0]) * k2, b[1] + (c[1] - b[1]) * k2);
  }
}
export function roundShape(pts: Pt[], holes: Pt[][] = []): THREE.Shape {
  const s = new THREE.Shape();
  roundPath(s, pts);
  s.closePath();
  for (const h of holes) {
    const p = new THREE.Path();
    roundPath(p, h);
    p.closePath();
    s.holes.push(p);
  }
  return s;
}
export const rrect = (x0: number, y0: number, x1: number, y1: number, r: number): Pt[] => [
  [x0, y0, r],
  [x1, y0, r],
  [x1, y1, r],
  [x0, y1, r],
];

/* 윤곽 데이터 (cm) — 모양 · 시트 무늬 · 나사 자리가 모두 이 숫자를 쓴다 */
export const P = {
  receiver: [[-14, 0.2, 0.4], [22, 0.2, 0.3], [22, 6.2, 0.3], [19.4, 9, 0.7], [-7.5, 9, 0.9], [-11.5, 7.6, 0.6], [-14, 5.6, 0.5]] as Pt[],
  window: rrect(2.5, 3, 11.5, 6.2, 0.9),
  plateA: [[-10.5, 1.4, 0.5], [0.8, 1.4, 0.5], [0.8, 7.9, 0.4], [-7.2, 7.9, 0.7], [-10.5, 6.6, 0.5]] as Pt[],
  plateB: [[13.2, 1.6, 0.4], [20.8, 1.6, 0.3], [20.8, 5.8, 0.3], [18.8, 7.9, 0.5], [13.2, 7.9, 0.4]] as Pt[],
  strip: rrect(1.6, 7.0, 12.4, 8.2, 0.35),
  lower: [[-13.5, 0.6, 0.3], [11.2, 0.6, 0.3], [11.2, -2.8, 0.5], [4.4, -2.8, 0.4], [4.4, -6.6, 1.0], [3.0, -8.1, 0.8], [-3.6, -8.1, 0.8], [-5.6, -6.4, 1.2], [-6.4, -2.8, 0.4], [-13.5, -2.8, 0.5]] as Pt[],
  guard: [[-4.3, -2.2, 0.4], [3.2, -2.2, 0.4], [3.2, -6.4, 0.9], [2.2, -7.0, 0.5], [-3.0, -7.0, 0.6], [-4.6, -5.6, 1.0]] as Pt[],
  trigger: [[-1.9, -2.0, 0.2], [-0.7, -2.0, 0.2], [-0.5, -3.5, 0.7], [-1.0, -5.3, 0.4], [-1.7, -5.6, 0.3], [-1.5, -4.2, 0.7]] as Pt[],
  grip: [[-13.4, -2.4, 0.3], [-6.3, -2.4, 0.3], [-6.9, -5.4, 1.2], [-6.6, -7.2, 0.9], [-7.6, -8.8, 0.9], [-7.4, -10.6, 0.9], [-8.4, -12.2, 0.9], [-8.6, -14.4, 1.2], [-10.6, -15.4, 1.3], [-14.6, -14.8, 1.4], [-15.6, -12.8, 1.4], [-14.6, -6.4, 3.0]] as Pt[],
  stock: [[-13.6, 7.6, 0.4], [-13.6, -2.2, 0.5], [-19, -3.6, 1.2], [-35.5, -5.6, 1.0], [-38.8, -5.6, 0.4], [-38.8, 8.8, 0.4], [-35.5, 8.8, 0.8], [-20, 8.2, 1.5]] as Pt[],
  stockHoles: [
    [[-16.6, 5.9, 0.8], [-31.5, 6.5, 0.9], [-17.0, 1.6, 0.8]],
    [[-19.5, -1.2, 0.8], [-36.8, -3.9, 0.9], [-36.8, 4.6, 0.9]],
  ] as Pt[][],
  butt: [[-41.4, -6.4, 0.6], [-38.6, -6.0, 0.3], [-38.6, 9.2, 0.3], [-41.4, 9.6, 0.6]] as Pt[],
  shroud: [[21.6, 1.0, 0.3], [42.6, 1.0, 0.4], [44.2, 2.6, 0.4], [44.2, 6.4, 0.4], [42.0, 8.2, 0.5], [21.6, 8.2, 0.3]] as Pt[],
  slots: [24.2, 27.4, 30.6, 33.8, 37.0].map((x) => rrect(x, 3.0, x + 2.2, 6.2, 1.05)),
  mag: [[4.4, -2.4, 0.3], [10.8, -2.4, 0.3], [11.6, -12.6, 0.8], [10.6, -13.4, 0.5], [5.6, -13.4, 0.5], [4.8, -12.6, 0.8]] as Pt[],
  magWin: rrect(6.2, -4.6, 9.6, -10.6, 0.9),
  magCap: [[4.7, -14.4, 0.4], [11.7, -14.4, 0.4], [11.9, -13.0, 0.3], [4.5, -13.0, 0.3]] as Pt[],
  selector: [[-11.9, -0.4, 0.4], [-9.0, -1.2, 0.3], [-9.0, -1.9, 0.3], [-11.9, -1.6, 0.4]] as Pt[],
  sightBase: rrect(-3.5, 10.3, 6.2, 11.7, 0.3),
};

/** 나사 자리: [x, y, 반두께(z), 부품 id] — 양쪽에 하나씩 */
export const SCREWS: [number, number, number, string][] = [
  [-9.6, 2.2, 4.05, 'plates'], [0, 2.2, 4.05, 'plates'], [0, 7.1, 4.05, 'plates'], [-6.8, 7.1, 4.05, 'plates'],
  [13.9, 2.3, 4.05, 'plates'], [20.1, 2.3, 4.05, 'plates'], [13.9, 7.2, 4.05, 'plates'],
  [-12.8, 1.4, 3.6, 'receiver'], [-12.6, 4.4, 3.6, 'receiver'],
  [23, 1.8, 3.0, 'shroud'], [23, 7.4, 3.0, 'shroud'], [32.2, 1.8, 3.0, 'shroud'], [32.2, 7.4, 3.0, 'shroud'], [40.6, 1.8, 3.0, 'shroud'], [40.9, 7.0, 3.0, 'shroud'],
  [-11.8, -1.6, 3.1, 'lower'], [9.8, -0.6, 3.1, 'lower'], [9.8, -2.0, 3.1, 'lower'],
  [-15.3, 6.6, 2.3, 'stock'], [-15.3, -1.1, 2.3, 'stock'], [-37.4, 7.6, 2.3, 'stock'], [-37.4, -4.4, 2.3, 'stock'], [-26, 7.5, 2.3, 'stock'],
  [5.6, -3.4, 2.2, 'mag'], [9.9, -3.4, 2.2, 'mag'],
  [-11.4, -4.0, 2.8, 'grip'], [-12.6, -13.6, 2.8, 'grip'],
  [-2.6, 11.0, 1.7, 'sight'], [5.4, 11.0, 1.7, 'sight'],
];

function txt(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, align: CanvasTextAlign = 'left', weight = 800, rot = 0): void {
  g.save();
  g.translate(x, y);
  g.scale(1 / SHEET.s, -1 / SHEET.s);
  if (MIRROR) {
    g.scale(-1, 1);
    align = align === 'left' ? 'right' : align === 'right' ? 'left' : align;
  }
  if (rot) g.rotate(rot);
  g.font = `${weight} ${size * SHEET.s}px ${FONT}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillText(s, 0, 0);
  g.restore();
}
function polyPath(g: CanvasRenderingContext2D, pts: Pt[]): void {
  g.beginPath();
  roundPath(g, pts);
  g.closePath();
}
const gray = (v: number): string => `rgb(${v},${v},${v})`;

/** 높이 그림 — 128 기준, 어두우면 파인 곳 · 밝으면 솟은 곳 */
function drawSheetHeight(c: HTMLCanvasElement, only?: boolean): void {
  bothSides(c, drawHeightSide, only);
}
function drawHeightSide(g: CanvasRenderingContext2D): void {
  g.fillStyle = gray(128);
  g.fillRect(SHEET.x0, SHEET.y0, 200, 60);
  const groove = (w = 0.12, v = 34): void => {
    g.strokeStyle = gray(v);
    g.lineWidth = w;
    g.stroke();
  };
  const line = (pts: number[][], w = 0.12): void => {
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p[0]!, p[1]!) : g.moveTo(p[0]!, p[1]!)));
    groove(w);
  };
  // 몸체 — 창문 둘레 솟은 테 + 바깥 홈, 이음선
  polyPath(g, rrect(1.9, 2.4, 12.1, 6.8, 1.25));
  g.strokeStyle = gray(178);
  g.lineWidth = 0.42;
  g.stroke();
  polyPath(g, rrect(1.45, 1.95, 12.55, 7.25, 1.5));
  groove();
  line([[-12.3, 0.7], [-12.3, 6.4]]);
  line([[12.9, 0.6], [12.9, 8.6]]);
  line([[-13.4, 0.85], [21.4, 0.85]], 0.1);
  for (const y of [3.6, 4.6, 5.6]) {
    g.beginPath();
    g.arc(-13.3, y, 0.22, 0, Math.PI * 2);
    g.fillStyle = gray(40);
    g.fill();
  }
  // 옆 패널 A — 안쪽 홈 · 환기 홈 · 각인
  polyPath(g, [[-9.8, 2.1, 0.3], [0.1, 2.1, 0.3], [0.1, 7.2, 0.3], [-6.9, 7.2, 0.5], [-9.8, 6.1, 0.4]]);
  groove(0.1);
  g.fillStyle = gray(26);
  for (let i = 0; i < 6; i++) {
    polyPath(g, rrect(-8.7, 2.75 + i * 0.6, -4.6, 3.03 + i * 0.6, 0.14));
    g.fill();
  }
  g.fillStyle = gray(64);
  txt(g, 'MX-07', -0.9, 5.7, 1.05, 'right', 900);
  txt(g, 'ENERGY · 120 kJ', -0.9, 4.55, 0.42, 'right', 700);
  // 옆 패널 B — 비스듬한 환기 홈
  g.fillStyle = gray(26);
  for (let i = 0; i < 5; i++) {
    const x = 14.2 + i * 1.15;
    polyPath(g, [[x, 2.4, 0.15], [x + 0.42, 2.4, 0.15], [x + 1.25, 6.6, 0.15], [x + 0.83, 6.6, 0.15]]);
    g.fill();
  }
  // 주황 띠 — 눈금
  for (let i = 0; i < 9; i++) line([[2.4 + i * 1.2, 7.25], [2.4 + i * 1.2, 7.55 + (i % 2) * 0.25]], 0.09);
  // 아래 틀 — 일련번호 각인 · 선택 표시 · 핀
  g.fillStyle = gray(54);
  txt(g, 'SN 3141-5926', 3.8, -1.05, 0.62, 'center', 800);
  txt(g, '0', -12.6, 0.0, 0.5, 'center');
  txt(g, '1', -10.4, 0.12, 0.5, 'center');
  txt(g, '∞', -8.5, -0.15, 0.62, 'center');
  for (const [x, y] of [[-1.2, -0.7], [8.4, -1.4]] as const) {
    g.beginPath();
    g.arc(x, y, 0.36, 0, Math.PI * 2);
    g.fillStyle = gray(190);
    g.fill();
    g.beginPath();
    g.arc(x, y, 0.36, 0, Math.PI * 2);
    groove(0.07, 60);
  }
  // 총열 덮개 — 홈 줄 · 구멍 둘레 · 경고 띠 테
  line([[22.4, 2.2], [40.2, 2.2]]);
  line([[22.4, 7.0], [40.2, 7.0]]);
  polyPath(g, rrect(23.5, 2.5, 39.8, 6.7, 0.7));
  groove(0.1);
  polyPath(g, rrect(40.6, 1.55, 43.6, 7.65, 0.3));
  groove(0.1);
  g.fillStyle = gray(70);
  txt(g, '고열 주의', 31.6, 7.55, 0.42, 'center', 800);
  // 에너지 셀 — 눈금 · 글씨
  for (let i = 0; i <= 10; i++) line([[9.95, -4.8 - i * 0.56], [i % 5 ? 10.35 : 10.7, -4.8 - i * 0.56]], 0.08);
  g.fillStyle = gray(60);
  txt(g, 'E-CELL', 5.35, -7.6, 0.52, 'center', 900, -Math.PI / 2);
  polyPath(g, rrect(5.9, -4.3, 9.9, -10.9, 1.1));
  groove(0.09);
  // 개머리판 — 각인 · 솟은 π
  g.fillStyle = gray(58);
  txt(g, 'MATHMIRI ARMS', -27.6, 7.42, 0.62, 'center', 900);
  g.fillStyle = gray(200);
  txt(g, 'π', -36.9, 1.0, 1.6, 'center', 900);
  line([[-14.6, 6.9], [-14.6, -1.6]], 0.1);
  // 나사 둘레 홈
  for (const [x, y] of SCREWS) {
    g.beginPath();
    g.arc(x, y, 0.52, 0, Math.PI * 2);
    groove(0.08, 50);
  }
}

/** 데칼 그림 — 경고 줄무늬 · 흰 글씨 · 기호 (투명 바탕) */
function drawSheetDecal(c: HTMLCanvasElement): void {
  bothSides(c, drawDecalSide);
}
function drawDecalSide(g: CanvasRenderingContext2D): void {
  g.clearRect(SHEET.x0, SHEET.y0, 200, 60);
  const stripes = (pts: Pt[], w = 0.7): void => {
    g.save();
    polyPath(g, pts);
    g.clip();
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs) - 0.2, x1 = Math.max(...xs) + 0.2, y0 = Math.min(...ys) - 0.2, y1 = Math.max(...ys) + 0.2;
    const hh = y1 - y0;
    g.fillStyle = '#ff8a1e';
    g.fillRect(x0, y0, x1 - x0, hh);
    g.fillStyle = '#16181c';
    g.beginPath();
    for (let x = x0 - hh; x < x1; x += w * 2) {
      g.moveTo(x, y0);
      g.lineTo(x + w, y0);
      g.lineTo(x + w + hh, y1);
      g.lineTo(x + hh, y1);
      g.closePath();
    }
    g.fill();
    g.restore();
  };
  stripes(rrect(40.75, 1.7, 43.45, 7.5, 0.25));
  stripes(P.magCap, 0.62);
  g.fillStyle = 'rgba(245,246,240,0.92)';
  txt(g, 'SN 3141-5926', 3.8, -1.05, 0.62, 'center', 800);
  txt(g, '0', -12.6, 0.0, 0.5, 'center');
  txt(g, '1', -10.4, 0.12, 0.5, 'center');
  txt(g, 'MATHMIRI ARMS', -27.6, 7.42, 0.62, 'center', 900);
  g.fillStyle = '#ff8a1e';
  txt(g, '∞', -8.5, -0.15, 0.62, 'center');
  txt(g, 'π', -36.9, 1.0, 1.6, 'center', 900);
  g.fillStyle = 'rgba(70,215,255,0.95)';
  for (let i = 0; i <= 10; i++) g.fillRect(9.95, -4.84 - i * 0.56, i % 5 ? 0.4 : 0.75, 0.08);
  txt(g, 'E-CELL', 5.35, -7.6, 0.52, 'center', 900, -Math.PI / 2);
  // 작은 경고 삼각형
  g.fillStyle = '#ffd23a';
  g.beginPath();
  g.moveTo(29.0, 7.3);
  g.lineTo(29.8, 7.3);
  g.lineTo(29.4, 7.95);
  g.closePath();
  g.fill();
  g.fillStyle = '#ff8a1e';
  txt(g, 'MX-07', -0.9, 5.7, 1.05, 'right', 900);
}

/* ───────────── 굽기 (생성기 — 한 번에 조금씩) ───────────── */

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** 닳음용 잡음 (R 얼룩 · G 긁힘 · B 때) — 이음새 없이 반복 */
function* bakeNoise(out: { noise?: THREE.DataTexture }): Generator<void> {
  const N = 256;
  const R = rng(17);
  const lattice = (p: number): Float32Array => {
    const a = new Float32Array(p * p);
    for (let i = 0; i < a.length; i++) a[i] = R();
    return a;
  };
  const vnoise = (lat: Float32Array, p: number, x: number, y: number): number => {
    const fx = x * p;
    const fy = y * p;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    let tx = fx - ix;
    let ty = fy - iy;
    tx = tx * tx * (3 - 2 * tx);
    ty = ty * ty * (3 - 2 * ty);
    const x0 = ((ix % p) + p) % p;
    const y0 = ((iy % p) + p) % p;
    const x1 = (x0 + 1) % p;
    const y1 = (y0 + 1) % p;
    const a = lat[y0 * p + x0]!;
    const b = lat[y0 * p + x1]!;
    const c = lat[y1 * p + x0]!;
    const d = lat[y1 * p + x1]!;
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
  const oR: [number, number, Float32Array][] = [4, 8, 16, 32, 64].map((p, i) => [p, [0.5, 0.25, 0.13, 0.07, 0.05][i]!, lattice(p)]);
  const oB: [number, number, Float32Array][] = [3, 6, 12].map((p, i) => [p, [0.62, 0.28, 0.1][i]!, lattice(p)]);
  const d = new Uint8Array(N * N * 4);
  for (let y0 = 0; y0 < N; y0 += 16) {
    for (let y = y0; y < y0 + 16; y++)
      for (let x = 0; x < N; x++) {
        const u = x / N;
        const v = y / N;
        let r = 0;
        for (const [p, w, l] of oR) r += vnoise(l, p, u, v) * w;
        let b = 0;
        for (const [p, w, l] of oB) b += vnoise(l, p, u, v) * w;
        const i = (y * N + x) * 4;
        d[i] = clamp((r - 0.5) * 1.9 + 0.5, 0, 1) * 255;
        d[i + 2] = clamp((b - 0.5) * 2.2 + 0.5, 0, 1) * 255;
        d[i + 3] = 255;
      }
    yield;
  }
  // 긁힘 — 가는 선을 이어 붙여 (반복 타일이라 감싸기)
  const sc = new Float32Array(N * N);
  for (let k = 0; k < 300; k++) {
    let x = R() * N;
    let y = R() * N;
    const a = R() * Math.PI;
    const len = 6 + R() * R() * 60;
    const s = 0.35 + R() * 0.65;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    for (let t = 0; t < len; t++) {
      const ix = ((Math.round(x) % N) + N) % N;
      const iy = ((Math.round(y) % N) + N) % N;
      const fade = Math.sin((t / len) * Math.PI);
      sc[iy * N + ix] = Math.max(sc[iy * N + ix]!, s * fade);
      x += dx;
      y += dy;
    }
  }
  yield;
  for (let i = 0; i < N * N; i++) d[i * 4 + 1] = sc[i]! * 255;
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  out.noise = t;
}

/** 높이 배열 → 법선 지도 (OpenGL +Y) — 행을 잘라 여러 번에 */
function* heightToNormal(h: Float32Array, W: number, H: number, k: number, wrap: boolean, out: (t: THREE.DataTexture) => void): Generator<void> {
  const d = new Uint8Array(W * H * 4);
  const at = (x: number, y: number): number => {
    if (wrap) return h[((y + H) % H) * W + ((x + W) % W)]!;
    return h[clamp(y, 0, H - 1) * W + clamp(x, 0, W - 1)]!;
  };
  const rows = Math.max(8, Math.floor(55000 / W));
  for (let y0 = 0; y0 < H; y0 += rows) {
    const y1 = Math.min(H, y0 + rows);
    for (let y = y0; y < y1; y++) {
      const o = (H - 1 - y) * W * 4; // 캔버스 위쪽 행 = 텍스처 위 (v=1)
      for (let x = 0; x < W; x++) {
        // 소벨 (3×3 — 가로세로로 살짝 부드럽게)
        const nx = -((at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1))) * k * 0.25;
        const ny = -((at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1)) - (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1))) * k * 0.25;
        const l = 1 / Math.sqrt(nx * nx + ny * ny + 1);
        const i = o + x * 4;
        d[i] = (nx * l * 0.5 + 0.5) * 255;
        d[i + 1] = (ny * l * 0.5 + 0.5) * 255;
        d[i + 2] = (l * 0.5 + 0.5) * 255;
        d[i + 3] = 255;
      }
    }
    yield;
  }
  const t = new THREE.DataTexture(d, W, H, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  out(t);
}

/** 손잡이 다이아몬드 무늬 (깎인 피라미드) — 이음새 없는 타일 1.4cm */
export const KNURL_CM = 1.4;
function* bakeKnurl(out: { knurl?: THREE.DataTexture }): Generator<void> {
  const N = 256;
  const h = new Float32Array(N * N);
  const tri = (x: number): number => 1 - Math.abs(2 * (x - Math.floor(x)) - 1);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const u = (x / N) * 4;
      const v = (y / N) * 4;
      const p = Math.min(tri(u + v), tri(u - v));
      h[y * N + x] = Math.min(p * 1.7, 1) * 120;
    }
  yield;
  yield* heightToNormal(h, N, N, 0.06, true, (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / KNURL_CM, 1 / KNURL_CM);
    out.knurl = t;
  });
}

/** 옆면 시트: 높이 그림 → 흐림 → 읽기(띠별) → 법선, 데칼 그림은 그대로 텍스처 */
function* bakeSheet(out: { sheetN?: THREE.DataTexture; decal?: THREE.CanvasTexture }): Generator<void> {
  const W = SHEET.w;
  const H = SHEET.h * 2;
  const hc = canvas(W, H);
  // 읽어 갈 캔버스는 처음부터 CPU 쪽에 (GPU 에서 되읽기 멈춤 없게)
  const bg = hc.getContext('2d', { willReadFrequently: true })!;
  drawSheetHeight(hc, false);
  yield;
  drawSheetHeight(hc, true);
  yield;
  const dc = canvas(W, H);
  drawSheetDecal(dc);
  const decal = new THREE.CanvasTexture(dc);
  decal.colorSpace = THREE.SRGBColorSpace;
  decal.anisotropy = 8;
  decal.repeat.set(SHEET.s / W, SHEET.s / H);
  decal.offset.set((-SHEET.x0 * SHEET.s) / W, (-SHEET.y0 * SHEET.s) / H);
  out.decal = decal;
  yield;
  const h = new Float32Array(W * H);
  const R = rng(5);
  for (let y0 = 0; y0 < H; y0 += 48) {
    const n = Math.min(48, H - y0);
    const px = bg.getImageData(0, y0, W, n).data;
    for (let i = 0; i < W * n; i++) h[y0 * W + i] = px[i * 4]! + (R() - 0.5) * 1.6;
    yield;
  }
  yield* heightToNormal(h, W, H, 0.034, false, (t) => {
    t.repeat.copy(decal.repeat);
    t.offset.copy(decal.offset);
    out.sheetN = t;
  });
}

/** 에너지 셀 속 빛 띠 · 홀로 조준점 그림 */
function coreTexture(): THREE.CanvasTexture {
  const c = canvas(32, 256);
  const g = c.getContext('2d')!;
  const lg = g.createLinearGradient(0, 0, 0, 256);
  for (let i = 0; i <= 8; i++) {
    lg.addColorStop(i / 8, i % 2 ? '#0a3550' : '#bff4ff');
  }
  g.fillStyle = lg;
  g.fillRect(0, 0, 32, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
export function reticleTexture(): THREE.CanvasTexture {
  const c = canvas(256, 256);
  const g = c.getContext('2d')!;
  g.translate(128, 128);
  g.shadowColor = 'rgba(255,60,40,1)';
  g.shadowBlur = 14;
  g.strokeStyle = '#ff5a3c';
  g.fillStyle = '#ff6a48';
  g.lineWidth = 7;
  g.beginPath();
  g.arc(0, 0, 70, 0, Math.PI * 2);
  g.stroke();
  for (let k = 0; k < 4; k++) {
    g.save();
    g.rotate((k * Math.PI) / 2);
    g.fillRect(-3.5, -104, 7, 24);
    g.restore();
  }
  g.beginPath();
  g.arc(0, 0, 9, 0, Math.PI * 2);
  g.fill();
  g.shadowBlur = 0;
  g.fillStyle = '#ffe2d8';
  g.beginPath();
  g.arc(0, 0, 4, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ───────────── 모양 만들기 ───────────── */

type UVMode = 'sheet' | 'tile' | 'none';
const FAR = -500;
function uvGen(mode: UVMode, depth: number): NonNullable<THREE.ExtrudeGeometryOptions['UVGenerator']> {
  const V = THREE.Vector2;
  const BACK = SHEET.h / SHEET.s;
  return {
    generateTopUV(_g, v, a, b, c) {
      if (mode === 'none') return [new V(FAR, FAR), new V(FAR, FAR), new V(FAR, FAR)];
      // 뒷면(-Z) 뚜껑은 시트 위 절반 (거울 글씨)
      const dy = v[a * 3 + 2]! < depth * 0.5 ? BACK : 0;
      return [new V(v[a * 3]!, v[a * 3 + 1]! + dy), new V(v[b * 3]!, v[b * 3 + 1]! + dy), new V(v[c * 3]!, v[c * 3 + 1]! + dy)];
    },
    generateSideWallUV(_g, v, a, b, c, d) {
      if (mode !== 'tile') return [new V(FAR, FAR), new V(FAR, FAR), new V(FAR, FAR), new V(FAR, FAR)];
      const xs = Math.abs(v[a * 3 + 1]! - v[b * 3 + 1]!) < Math.abs(v[a * 3]! - v[b * 3]!) ? 0 : 1;
      return [a, b, c, d].map((i) => new V(v[i * 3 + xs]!, v[i * 3 + 2]!));
    },
  };
}

/**
 * 모서리 마스크 (정점마다 0~1) — 「닳음」 이 쓰는 곡률 값.
 *  ① 같은 자리 정점들의 법선이 갈라진 정도 (날카로운 모서리)
 *  ② 돌출 부품이면 베벨 띠 (앞뒤 면과 옆 벽 사이 — 법선이 비스듬한 곳)
 */
function edgeAttr(g: THREE.BufferGeometry, extruded: boolean): void {
  const pos = g.getAttribute('position').array as ArrayLike<number>;
  const nor = g.getAttribute('normal').array as ArrayLike<number>;
  const n = pos.length / 3;
  let size = 1;
  while (size < n * 2) size <<= 1;
  const table = new Int32Array(size).fill(-1);
  const keys: number[] = [];
  const gid = new Int32Array(n);
  const sum = new Float32Array(n * 4);
  let groups = 0;
  for (let i = 0; i < n; i++) {
    const qx = Math.round(pos[i * 3]! * 200);
    const qy = Math.round(pos[i * 3 + 1]! * 200);
    const qz = Math.round(pos[i * 3 + 2]! * 200);
    let s = (Math.imul(qx, 73856093) ^ Math.imul(qy, 19349663) ^ Math.imul(qz, 83492791)) & (size - 1);
    for (;;) {
      const id = table[s]!;
      if (id < 0) {
        table[s] = groups;
        keys.push(qx, qy, qz);
        gid[i] = groups++;
        break;
      }
      if (keys[id * 3] === qx && keys[id * 3 + 1] === qy && keys[id * 3 + 2] === qz) {
        gid[i] = id;
        break;
      }
      s = (s + 1) & (size - 1);
    }
    const o = gid[i]! * 4;
    sum[o] = sum[o]! + nor[i * 3]!;
    sum[o + 1] = sum[o + 1]! + nor[i * 3 + 1]!;
    sum[o + 2] = sum[o + 2]! + nor[i * 3 + 2]!;
    sum[o + 3] = sum[o + 3]! + 1;
  }
  const e = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = gid[i]! * 4;
    const spread = 1 - Math.hypot(sum[o]!, sum[o + 1]!, sum[o + 2]!) / sum[o + 3]!;
    let v = clamp(spread * 3.2, 0, 1);
    if (extruded) {
      const nz = Math.abs(nor[i * 3 + 2]!);
      v = Math.max(v, clamp(2 * nz * Math.sqrt(Math.max(0, 1 - nz * nz)) * 1.1, 0, 1));
    }
    e[i] = v;
  }
  g.setAttribute('aEdge', new THREE.BufferAttribute(e, 1));
}

/** 옆모습 돌출 — 윤곽은 정확히 (베벨을 안쪽으로), 두께 width 를 Z 가운데에 */
export function extrudeSide(shape: THREE.Shape, width: number, bevel: number, seg = 3, curveSeg = 6, mode: UVMode = 'sheet'): THREE.BufferGeometry {
  const depth = Math.max(0.01, width - 2 * bevel);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: seg,
    curveSegments: curveSeg,
    UVGenerator: uvGen(mode, depth),
  });
  g.translate(0, 0, -depth / 2);
  toCreasedNormals(g, 0.6);
  // 앞뒤 평평한 면은 법선을 곧게 (베벨과 섞이면 큰 삼각형에 얼룩이 진다)
  const pa = g.getAttribute('position');
  const na = g.getAttribute('normal');
  for (let f = 0; f < pa.count; f += 3) {
    const ax = pa.getX(f), ay = pa.getY(f);
    const ux = pa.getX(f + 1) - ax, uy = pa.getY(f + 1) - ay, uz = pa.getZ(f + 1) - pa.getZ(f);
    const vx = pa.getX(f + 2) - ax, vy = pa.getY(f + 2) - ay, vz = pa.getZ(f + 2) - pa.getZ(f);
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l > 0 && Math.abs(nz) / l > 0.9995) for (let k = 0; k < 3; k++) na.setXYZ(f + k, 0, 0, Math.sign(nz));
  }
  edgeAttr(g, true);
  return g;
}
function farUV(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const uv = g.getAttribute('uv');
  if (uv) for (let i = 0; i < uv.count; i++) uv.setXY(i, FAR, FAR);
  return g;
}
/** 회전체 — 점 [반지름, x] 를 X 축으로 돌린다. 날카로운 계단은 날카롭게 */
export function latheX(pts: [number, number][], segs = 32): THREE.BufferGeometry {
  const src = new THREE.LatheGeometry(pts.map(([r, x]) => new THREE.Vector2(r, x)), segs);
  src.rotateZ(-Math.PI / 2);
  const g = toCreasedNormals(src, 0.6);
  if (g !== src) src.dispose();
  edgeAttr(g, false);
  return farUV(g);
}
function finish(g: THREE.BufferGeometry, crease = 0.6): THREE.BufferGeometry {
  const r = toCreasedNormals(g, crease);
  if (r !== g) g.dispose();
  edgeAttr(r, false);
  return farUV(r);
}

/* ───────────── 부품 목록 (kit) ───────────── */

export type MatKey = 'dark' | 'white' | 'orange' | 'rubber' | 'metal' | 'black' | 'copper' | 'glow' | 'core' | 'glass' | 'lens' | 'reticle' | 'cable' | 'screw';
type V3t = [number, number, number];
export interface MeshDef {
  geo: THREE.BufferGeometry;
  /** 베벨 없는 모양 (단계 1) */
  flat?: THREE.BufferGeometry;
  /** 윤곽선 (단계 0) — 앞면 z 에 그린 선 */
  outline?: THREE.BufferGeometry;
  mat: MatKey;
  stage: number;
  pos?: V3t;
  inst?: THREE.Matrix4[];
  /** 부품 기본 펼침과 다르게 (양쪽 패널 등) */
  ex?: V3t;
  /** 단계 4 에 보이는 것 (나사) */
  name?: string;
}
export interface PartDef {
  id: string;
  name: string;
  dim: string;
  explode: V3t;
  anchor: V3t;
  meshes: MeshDef[];
}
export interface ScrewSlot {
  part: string;
  side: 1 | -1;
  base: THREE.Matrix4;
  pos: THREE.Vector3;
}
export interface Kit {
  parts: PartDef[];
  screws: ScrewSlot[];
  screwGeo: THREE.BufferGeometry;
  tex: { noise: THREE.DataTexture; knurl: THREE.DataTexture; sheetN: THREE.DataTexture; decal: THREE.CanvasTexture; core: THREE.CanvasTexture; reticle: THREE.CanvasTexture };
  /** 단계별 삼각형 수를 셀 때 쓰는 전체 길이 (cm) */
  length: number;
}

const circlePts = (cx: number, cy: number, r: number, n = 36): Pt[] => Array.from({ length: n }, (_, i) => [cx + Math.cos((-i / n) * Math.PI * 2) * r, cy + Math.sin((-i / n) * Math.PI * 2) * r, 0] as Pt);

function outlineGeo(shape: THREE.Shape, z: number): THREE.BufferGeometry {
  const v: number[] = [];
  const add = (pts: THREE.Vector2[]): void => {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      v.push(a.x, a.y, z, b.x, b.y, z);
    }
  };
  const sp = shape.extractPoints(10);
  add(sp.shape);
  for (const h of sp.holes) add(h);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  return g;
}
const M = (x: number, y: number, z: number, ry = 0, rx = 0): THREE.Matrix4 => {
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, 0));
  m.setPosition(x, y, z);
  return m;
};
function colorize(g: THREE.BufferGeometry, v: number): THREE.BufferGeometry {
  const n = g.getAttribute('position').count;
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(v), 3));
  return g;
}

/** 모든 모양을 한 덩이씩 만들어 내는 생성기 (yield = 쉬어 가기) */
function* buildKit(out: { kit?: Kit }): Generator<void> {
  const T: { noise?: THREE.DataTexture; knurl?: THREE.DataTexture; sheetN?: THREE.DataTexture; decal?: THREE.CanvasTexture } = {};
  yield* bakeNoise(T);
  yield* bakeKnurl(T);
  yield* bakeSheet(T);
  const parts: PartDef[] = [];
  const part = (id: string, name: string, dim: string, explode: V3t, anchor: V3t): PartDef => {
    const p: PartDef = { id, name, dim, explode, anchor, meshes: [] };
    parts.push(p);
    return p;
  };
  /** 옆모습 부품: 베벨 · 평평 · 윤곽선 세 가지 */
  function* side(shape: THREE.Shape, w: number, bevel: number, seg: number, cs: number, mode: UVMode, withFlat: boolean): Generator<void, Pick<MeshDef, 'geo' | 'flat' | 'outline'>> {
    const geo = extrudeSide(shape, w, bevel, seg, cs, mode);
    yield;
    return { geo, flat: withFlat ? extrudeSide(shape, w, 0, 1, cs, mode) : undefined, outline: withFlat ? outlineGeo(shape, w / 2 + 0.02) : undefined };
  }

  // 몸체 + 창 안의 코일
  const rec = part('receiver', '몸체 (리시버)', '36 × 9 × 7.2 cm', [0, 0, 0], [6, 9.4, 3.6]);
  rec.meshes.push({ ...(yield* side(roundShape(P.receiver, [P.window]), 7.2, 0.35, 3, 6, 'sheet', true)), mat: 'dark', stage: 1 });
  yield;
  rec.meshes.push({ geo: finish(new THREE.CylinderGeometry(0.85, 0.85, 12, 24).rotateZ(Math.PI / 2)), mat: 'glow', stage: 3, pos: [7, 4.6, 0] });
  rec.meshes.push({
    geo: finish(new THREE.TorusGeometry(1.3, 0.2, 10, 32)),
    mat: 'copper',
    stage: 3,
    inst: Array.from({ length: 10 }, (_, i) => M(2.95 + i * 0.9, 4.6, 0, Math.PI / 2)),
  });
  rec.meshes.push({ geo: finish(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 14).rotateX(Math.PI / 2)), mat: 'glow', stage: 3, inst: [3.6, 4.6, 5.6].map((y) => M(-13.3, y, 3.58)) });
  yield;

  // 옆 패널 (양쪽) + 주황 띠
  const pl = part('plates', '옆 패널', '두께 0.9 cm · 양쪽', [0, 0, 8], [-5, 7.9, 4.1]);
  const pa = extrudeSide(roundShape(P.plateA), 0.9, 0.25, 3, 6);
  const pb = extrudeSide(roundShape(P.plateB), 0.9, 0.25, 3, 6);
  const st = extrudeSide(roundShape(P.strip), 0.6, 0.18, 3, 4);
  for (const s of [1, -1] as const) {
    pl.meshes.push({ geo: pa, mat: 'white', stage: 3, pos: [0, 0, 3.6 * s], ex: [0, 0, 8 * s] });
    pl.meshes.push({ geo: pb, mat: 'white', stage: 3, pos: [0, 0, 3.6 * s], ex: [0, 0, 8 * s] });
    pl.meshes.push({ geo: st, mat: 'orange', stage: 3, pos: [0, 0, 3.62 * s], ex: [0, 0, 8 * s] });
  }
  yield;

  // 아래 틀 (방아쇠울 구멍) · 선택 레버 · 방아쇠
  const lo = part('lower', '아래 틀 · 방아쇠울', '24.7 cm', [0, -6, 0], [0, -8.1, 3.1]);
  lo.meshes.push({ ...(yield* side(roundShape(P.lower, [P.guard]), 6.2, 0.35, 3, 8, 'sheet', true)), mat: 'dark', stage: 1 });
  lo.meshes.push({ geo: extrudeSide(roundShape(P.selector), 0.5, 0.15, 3, 4), mat: 'orange', stage: 3, pos: [0, 0, 3.3] });
  yield;
  const tr = part('trigger', '방아쇠', '3.6 cm', [0, -6, 6], [-1, -5.6, 0.5]);
  tr.meshes.push({ geo: extrudeSide(roundShape(P.trigger), 1.0, 0.22, 3, 8), mat: 'orange', stage: 3 });

  // 손잡이 (고무 · 다이아몬드 무늬)
  const gr = part('grip', '손잡이', '13 cm · 다이아몬드 무늬', [-3, -13, 0], [-11, -15.4, 2.8]);
  gr.meshes.push({ ...(yield* side(roundShape(P.grip), 5.6, 0.9, 4, 10, 'tile', true)), mat: 'rubber', stage: 1 });
  yield;

  // 개머리판 · 개머리 패드 · 연결 블록
  const sk = part('stock', '개머리판', '27.8 cm', [-16, 0, 0], [-27, 8.8, 2.3]);
  sk.meshes.push({ ...(yield* side(roundShape(P.stock, P.stockHoles), 4.6, 0.4, 3, 6, 'sheet', true)), mat: 'dark', stage: 1 });
  yield;
  sk.meshes.push({ ...(yield* side(roundShape(P.butt), 5.0, 0.6, 4, 6, 'tile', true)), mat: 'rubber', stage: 1, ex: [-22, 0, 0] });
  sk.meshes.push({ geo: extrudeSide(roundShape(rrect(-15.4, 3.0, -13.2, 8.2, 0.3)), 5.4, 0.3, 3, 4, 'none'), mat: 'black', stage: 3, ex: [-8, 0, 0] });
  yield;

  // 총열 덮개 (구멍 다섯) · 위 방열 핀
  const sh = part('shroud', '총열 덮개', '22.6 cm · 구멍 5', [12, 9, 0], [33, 8.2, 3]);
  sh.meshes.push({ ...(yield* side(roundShape(P.shroud, P.slots), 6.0, 0.3, 3, 8, 'sheet', true)), mat: 'dark', stage: 1 });
  yield;
  sh.meshes.push({
    geo: extrudeSide(roundShape([[0, 0, 0], [0.34, 0, 0], [0.34, 1.3, 0.12], [0, 1.3, 0.12]]), 4.4, 0.08, 2, 3, 'none'),
    mat: 'black',
    stage: 3,
    inst: Array.from({ length: 16 }, (_, i) => M(23.9 + i * 1.0, 8.1, 0)),
  });

  // 총열 · 방열 링 · 총구 빛 · 속 코일
  const ba = part('barrel', '총열 · 방열 핀', '38 cm', [24, 0, 0], [54, 6.8, 0]);
  ba.meshes.push({
    geo: latheX([[0, 40.5], [1.5, 40.5], [1.5, 44.4], [1.25, 44.7], [1.25, 52.3], [1.75, 52.45], [2.15, 52.9], [2.2, 53.4], [2.2, 56.4], [2.05, 56.9], [1.75, 57.5], [1.15, 57.6], [1.0, 57.3], [0.0, 57.3]], 40),
    mat: 'metal',
    stage: 1,
    pos: [0, 4.6, 0],
  });
  yield;
  ba.meshes.push({ geo: latheX([[1.2, 0], [2.25, 0], [2.4, 0.06], [2.4, 0.24], [2.25, 0.3], [1.2, 0.3]], 36), mat: 'black', stage: 3, inst: Array.from({ length: 9 }, (_, i) => M(45 + i * 0.82, 4.6, 0)) });
  ba.meshes.push({ geo: finish(new THREE.TorusGeometry(1.42, 0.15, 10, 40).rotateY(Math.PI / 2)), mat: 'glow', stage: 3, pos: [57.42, 4.6, 0] });
  ba.meshes.push({ geo: finish(new THREE.CircleGeometry(1.02, 32).rotateY(Math.PI / 2)), mat: 'glow', stage: 3, pos: [57.33, 4.6, 0] });
  ba.meshes.push({ geo: finish(new THREE.CylinderGeometry(1.05, 1.05, 21, 24).rotateZ(Math.PI / 2)), mat: 'glow', stage: 3, pos: [30.5, 4.6, 0] });
  ba.meshes.push({ geo: finish(new THREE.TorusGeometry(1.75, 0.22, 10, 32)), mat: 'copper', stage: 3, inst: Array.from({ length: 15 }, (_, i) => M(22.6 + i * 1.25, 4.6, 0, Math.PI / 2)) });
  yield;

  // 레일 + 이빨
  const ra = part('rail', '레일', '25 cm · 이 25개', [0, 7, 0], [-5, 10.4, 1.4]);
  const railG = extrudeSide(roundShape([[-1.1, 0, 0], [1.1, 0, 0], [1.1, 0.45, 0.05], [1.45, 0.72, 0.05], [1.1, 1.0, 0.05], [-1.1, 1.0, 0.05], [-1.45, 0.72, 0.05], [-1.1, 0.45, 0.05]]), 25, 0.06, 2, 2, 'none');
  railG.rotateY(Math.PI / 2);
  ra.meshes.push({ geo: railG, mat: 'black', stage: 3, pos: [5.5, 8.98, 0] });
  ra.meshes.push({ geo: extrudeSide(roundShape([[0, 0, 0], [0.62, 0, 0], [0.52, 0.42, 0.05], [0.1, 0.42, 0.05]]), 2.2, 0.05, 2, 2, 'none'), mat: 'black', stage: 3, inst: Array.from({ length: 25 }, (_, i) => M(-6.7 + i * 1.0, 9.96, 0)) });
  yield;

  // 홀로 조준경: 받침 · 테 · 렌즈 · 조준점 · 단추
  const si = part('sight', '홀로 조준경', '렌즈 Ø4.3 cm', [0, 15, 0], [0.2, 16.6, 0]);
  si.meshes.push({ geo: extrudeSide(roundShape(P.sightBase), 3.4, 0.25, 3, 6, 'none'), mat: 'black', stage: 3 });
  const hood = extrudeSide(roundShape(rrect(-2.7, 11.4, 2.7, 16.9, 1.1), [circlePts(0, 14.15, 2.12, 40)]), 6.0, 0.28, 3, 8, 'none');
  hood.rotateY(Math.PI / 2);
  si.meshes.push({ geo: hood, mat: 'black', stage: 3, pos: [0.2, 0, 0] });
  si.meshes.push({ geo: latheX([[0, -0.34], [0.9, -0.29], [1.6, -0.18], [2.12, -0.05], [2.16, 0], [2.12, 0.05], [1.6, 0.18], [0.9, 0.29], [0, 0.34]], 48), mat: 'lens', stage: 3, pos: [2.75, 14.15, 0] });
  si.meshes.push({ geo: new THREE.PlaneGeometry(2.9, 2.9).rotateY(-Math.PI / 2), mat: 'reticle', stage: 3, pos: [0.6, 14.15, 0] });
  si.meshes.push({ geo: finish(new THREE.CylinderGeometry(0.34, 0.34, 0.4, 18).rotateX(Math.PI / 2)), mat: 'orange', stage: 3, pos: [-1.3, 12.3, 2.75] });
  si.meshes.push({ geo: finish(new THREE.CylinderGeometry(0.34, 0.34, 0.4, 18).rotateX(Math.PI / 2)), mat: 'metal', stage: 3, pos: [0.0, 12.3, 2.75] });
  si.meshes.push({ geo: finish(new THREE.CylinderGeometry(0.8, 0.8, 0.8, 28).rotateX(Math.PI / 2)), mat: 'metal', stage: 3, pos: [1.6, 15.3, 2.95] });
  si.meshes.push({ geo: finish(new THREE.CylinderGeometry(0.55, 0.55, 0.9, 6).rotateX(Math.PI / 2)), mat: 'metal', stage: 3, pos: [1.4, 10.95, 2.0] });
  yield;

  // 에너지 셀 (탄창): 껍데기 · 바닥 · 빛나는 심 · 유리관 · 고리
  const mg = part('mag', '에너지 셀', '11 cm · 빛나는 심', [5, -17, 0], [8, -14.4, 2.4]);
  mg.meshes.push({ geo: extrudeSide(roundShape(P.mag, [P.magWin]), 4.4, 0.35, 3, 6), mat: 'white', stage: 3 });
  mg.meshes.push({ geo: extrudeSide(roundShape(P.magCap), 4.8, 0.3, 3, 4), mat: 'dark', stage: 3 });
  yield;
  mg.meshes.push({ geo: finish(new THREE.CylinderGeometry(1.15, 1.15, 7.8, 28, 1, true)), mat: 'core', stage: 3, pos: [7.9, -7.6, 0] });
  mg.meshes.push({ geo: new THREE.CylinderGeometry(1.55, 1.55, 7.4, 36, 1, true), mat: 'glass', stage: 3, pos: [7.9, -7.6, 0] });
  mg.meshes.push({ geo: finish(new THREE.TorusGeometry(1.45, 0.16, 10, 32).rotateX(Math.PI / 2)), mat: 'metal', stage: 3, inst: [-4.3, -7.6, -10.9].map((y) => M(7.9, y, 0)) });

  // 에너지 케이블 + 이음쇠
  const cb = part('cable', '에너지 케이블', 'Ø0.7 cm', [6, -6, 9], [16, -0.6, 4.6]);
  const curve = new THREE.CatmullRomCurve3([[10.2, -3.6, 2.2], [11.4, -3.3, 3.5], [14.5, -1.7, 4.3], [18.5, 0.4, 4.3], [22.5, 1.6, 4.0], [24.6, 1.9, 3.7], [25.2, 1.9, 3.0]].map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  cb.meshes.push({ geo: finish(new THREE.TubeGeometry(curve, 72, 0.36, 12)), mat: 'cable', stage: 3 });
  const conn = (latheX([[0, -0.55], [0.5, -0.55], [0.58, -0.45], [0.58, 0.25], [0.44, 0.35], [0.44, 0.55], [0, 0.55]], 20));
  const ends: THREE.Matrix4[] = [];
  for (const u of [0.03, 0.97]) {
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), u < 0.5 ? t.negate() : t);
    ends.push(new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1)));
  }
  cb.meshes.push({ geo: conn, mat: 'metal', stage: 3, inst: ends });
  yield;

  // 나사 (머리 + 육각 홈) — 정점 색으로 홈을 어둡게
  const head = colorize(latheX([[0.34, -0.1], [0.34, 0.02], [0.335, 0.1], [0.3, 0.165], [0.23, 0.205], [0.13, 0.228], [0, 0.235]], 20).rotateY(-Math.PI / 2), 1);
  const sock = colorize(finish(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 6).rotateX(Math.PI / 2).translate(0, 0, 0.205)), 0.04);
  const screwGeo = mergeGeometries([head, sock])!;
  head.dispose();
  sock.dispose();
  const R = rng(3);
  const screws: ScrewSlot[] = [];
  for (const [x, y, hz, pid] of SCREWS)
    for (const s of [1, -1] as const) {
      const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, s > 0 ? 0 : Math.PI, 0));
      m.multiply(new THREE.Matrix4().makeRotationZ(R() * Math.PI));
      const pos = new THREE.Vector3(x, y, hz * s);
      m.setPosition(pos);
      screws.push({ part: pid, side: s, base: m, pos });
    }
  yield;

  out.kit = {
    parts,
    screws,
    screwGeo,
    tex: { noise: T.noise!, knurl: T.knurl!, sheetN: T.sheetN!, decal: T.decal!, core: coreTexture(), reticle: reticleTexture() },
    length: 99,
  };
}

let gen: Generator<void> | null = null;
const holder: { kit?: Kit } = {};
let steps = 0;
let lastStep = -1e9;
let buildMs = 0;
let maxStep = 0;
export const stepLog: number[] = [];
/** 프레임마다 부르면 budget(ms) 만큼만 만든다. 같은 프레임에 여러 견본이 불러도 한 번만. 진행 0~1 */
export function kitStep(budget = 3): number {
  if (holder.kit) return 1;
  const now = performance.now();
  if (now - lastStep < 6) return Math.min(0.99, steps / 64);
  if (!gen) gen = buildKit(holder);
  const t0 = performance.now();
  while (performance.now() - t0 < budget) {
    steps++;
    const a = performance.now();
    const dn = gen.next().done;
    stepLog.push(+(performance.now() - a).toFixed(1));
    if (dn) break;
  }
  lastStep = performance.now();
  buildMs += lastStep - t0;
  maxStep = Math.max(maxStep, lastStep - t0);
  return holder.kit ? 1 : Math.min(0.99, steps / 64);
}
export const getKit = (): Kit | null => holder.kit ?? null;
/** 만드는 데 든 CPU 시간 합 (ms) */
export const kitBuildMs = (): number => buildMs;
/** 한 프레임에 쓴 가장 긴 만들기 시간 · 걸음 수 */
export const kitStats = (): { maxStep: number; steps: number } => ({ maxStep, steps });

/* ───────────── 재질 · 닳음 셰이더 ───────────── */

export interface WearU {
  wear: { value: number };
  maskView: { value: number };
  reveal: { value: number };
}
const VERT_HEAD = /* glsl */ `
attribute float aEdge;
varying float vEdge; varying vec3 vOP; varying vec3 vON; varying vec2 vSU;
uniform vec4 uSheetT;`;
const VERT_BODY = /* glsl */ `
vEdge = aEdge; vOP = position; vON = normal;
#ifdef USE_INSTANCING
  vOP = (instanceMatrix * vec4(position, 1.0)).xyz; vON = mat3(instanceMatrix) * normal;
#endif
vSU = uv * uSheetT.xy + uSheetT.zw;`;
const FRAG_HEAD = /* glsl */ `
uniform sampler2D uNoise; uniform sampler2D uDecal;
uniform float uWear, uMaskView, uReveal, uDecalOn, uBareM, uBareR; uniform vec3 uBare;
varying float vEdge; varying vec3 vOP; varying vec3 vON; varying vec2 vSU;
float hsM = 0.0; float hsG = 0.0; float hsRev = 1.0; vec4 hsN = vec4(0.5);`;
// 잡음은 미리 구운 텍스처를 세 방향으로 읽기만 (반복문 없음)
const FRAG_COLOR = /* glsl */ `
{
  vec3 bw = abs(normalize(vON)); bw = bw * bw; bw /= (bw.x + bw.y + bw.z);
  vec3 p = vOP * 0.085;
  hsN = texture2D(uNoise, p.xy) * bw.z + texture2D(uNoise, p.zy) * bw.x + texture2D(uNoise, p.xz) * bw.y;
  vec3 q = vOP * 0.37 + 0.31;
  vec4 nB = texture2D(uNoise, q.xy) * bw.z + texture2D(uNoise, q.zy) * bw.x + texture2D(uNoise, q.xz) * bw.y;
  float k = uWear;
  float chip = vEdge * 1.2 + (hsN.r - 0.5) * 1.25 + (nB.r - 0.5) * 0.55;
  float th = mix(2.4, 0.42, k);
  hsM = smoothstep(th, th + 0.07, chip);
  hsM = max(hsM, smoothstep(0.42, 0.78, hsN.g) * smoothstep(0.3, 1.0, k) * 0.95);
  hsG = k * (1.0 - vEdge) * smoothstep(0.38, 0.8, hsN.b);
  hsRev = 1.0 - smoothstep(uReveal - 0.5, uReveal, vOP.x);
  if (uDecalOn > 0.5) { vec4 dc = texture2D(uDecal, vSU); diffuseColor.rgb = mix(diffuseColor.rgb, dc.rgb, dc.a * hsRev); }
  diffuseColor.rgb = mix(diffuseColor.rgb, uBare * (0.82 + 0.36 * nB.r), hsM);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.18, 0.15), hsG * 0.6);
  if (uMaskView > 0.5) diffuseColor.rgb = mix(vec3(0.04, 0.05, 0.08), vec3(1.0, 0.56, 0.16), clamp(vEdge, 0.0, 1.0));
}`;

interface WearOpt {
  bare: number;
  bareMetal: number;
  bareRough: number;
  decal: boolean;
}
function wearify<Mt extends THREE.MeshStandardMaterial>(m: Mt, kit: Kit, U: WearU, o: WearOpt): Mt {
  const d = kit.tex.decal;
  const sheetT = new THREE.Vector4(d.repeat.x, d.repeat.y, d.offset.x, d.offset.y);
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      uNoise: { value: kit.tex.noise },
      uDecal: { value: d },
      uSheetT: { value: sheetT },
      uWear: U.wear,
      uMaskView: U.maskView,
      uReveal: U.reveal,
      uDecalOn: { value: o.decal ? 1 : 0 },
      uBare: { value: new THREE.Color(o.bare) },
      uBareM: { value: o.bareMetal },
      uBareR: { value: o.bareRough },
    });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>' + VERT_HEAD).replace('#include <begin_vertex>', '#include <begin_vertex>' + VERT_BODY);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>' + FRAG_HEAD)
      .replace('#include <color_fragment>', '#include <color_fragment>' + FRAG_COLOR)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor * (0.86 + 0.28 * hsN.r), uBareR, hsM); roughnessFactor = min(1.0, roughnessFactor + hsG * 0.35);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, uBareM, hsM);')
      .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale * hsRev;'));
  };
  m.customProgramCacheKey = () => 'hs-wear-1';
  return m;
}

export type MatSet = Record<MatKey, THREE.Material>;
export interface Mats {
  full: MatSet;
  clay: THREE.MeshStandardMaterial;
  claySheet: THREE.MeshStandardMaterial;
  clayKnurl: THREE.MeshStandardMaterial;
  lensDark: THREE.MeshStandardMaterial;
  outline: THREE.LineBasicMaterial;
  all: THREE.Material[];
}
function makeMats(kit: Kit, U: WearU, lensTransmission: boolean): Mats {
  const S = THREE.MeshStandardMaterial;
  const N = kit.tex.sheetN;
  const K = kit.tex.knurl;
  const w = (m: THREE.MeshStandardMaterial, bare: number, bareMetal: number, bareRough: number, decal = false): THREE.MeshStandardMaterial => wearify(m, kit, U, { bare, bareMetal, bareRough, decal });
  const lens = lensTransmission
    ? new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.02, transmission: 1, ior: 1.52, thickness: 0.7, attenuationColor: new THREE.Color(0xdcefff), attenuationDistance: 6, iridescence: 1, iridescenceIOR: 1.7, iridescenceThicknessRange: [260, 560], specularIntensity: 1 })
    : new THREE.MeshPhysicalMaterial({ color: 0x9fb4c8, metalness: 0, roughness: 0.03, transparent: true, opacity: 0.32, iridescence: 1, iridescenceIOR: 1.7, iridescenceThicknessRange: [260, 560], depthWrite: false });
  const full: MatSet = {
    dark: w(new S({ color: 0x2e3239, metalness: 0.55, roughness: 0.4, normalMap: N }), 0xc4c8cc, 1, 0.26, true),
    white: w(new S({ color: 0xdedbd2, metalness: 0, roughness: 0.42, normalMap: N }), 0xb9bdc2, 1, 0.3, true),
    orange: w(new S({ color: 0xff6612, metalness: 0.08, roughness: 0.36, normalMap: N }), 0xc4c8cc, 1, 0.28, true),
    rubber: w(new S({ color: 0x1d1e21, metalness: 0, roughness: 0.74, normalMap: K, normalScale: new THREE.Vector2(1, 1) }), 0x44464a, 0, 0.5),
    metal: w(new S({ color: 0x9ba1a9, metalness: 1, roughness: 0.27 }), 0xdadde0, 1, 0.16),
    black: w(new S({ color: 0x1b1d21, metalness: 0.7, roughness: 0.4 }), 0xb4b8bd, 1, 0.28),
    copper: w(new S({ color: 0xc9733b, metalness: 1, roughness: 0.3 }), 0xf0b080, 1, 0.2),
    glow: new S({ color: 0x041018, emissive: 0x3fd2ff, emissiveIntensity: 2.6, roughness: 0.25, metalness: 0 }),
    core: new S({ color: 0x000000, emissive: 0xffffff, emissiveMap: kit.tex.core, emissiveIntensity: 2.4, roughness: 0.3, metalness: 0 }),
    glass: new S({ color: 0xcfeeff, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }),
    lens,
    reticle: new THREE.MeshBasicMaterial({ map: kit.tex.reticle, color: new THREE.Color(1.7, 1.5, 1.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
    cable: w(new S({ color: 0x17181b, metalness: 0, roughness: 0.55 }), 0x3a3c40, 0, 0.45),
    screw: w(new S({ color: 0xb6bac0, metalness: 1, roughness: 0.3, vertexColors: true }), 0xe0e3e6, 1, 0.18),
  };
  const clay = new S({ color: 0xb8bcc3, metalness: 0, roughness: 0.55 });
  const claySheet = new S({ color: 0xb8bcc3, metalness: 0, roughness: 0.55, normalMap: N });
  const clayKnurl = new S({ color: 0xb8bcc3, metalness: 0, roughness: 0.6, normalMap: K });
  const lensDark = new S({ color: 0x0b0e14, metalness: 0.4, roughness: 0.08 });
  const outline = new THREE.LineBasicMaterial({ color: 0x5fe0ff, transparent: true, opacity: 0.95, toneMapped: false });
  return { full, clay, claySheet, clayKnurl, lensDark, outline, all: [...Object.values(full), clay, claySheet, clayKnurl, lensDark, outline] };
}

/* ───────────── 블래스터 (kit 으로 짓기 — 모양 · 텍스처는 같이 쓰고 재질만 따로) ───────────── */

export interface Item {
  def: MeshDef;
  mesh: THREE.Mesh;
  base: THREE.Vector3;
  ex: THREE.Vector3;
  line?: THREE.LineSegments;
}
export interface BPart {
  def: PartDef;
  group: THREE.Group;
  items: Item[];
  lines: THREE.LineSegments[];
}
export interface ScrewRef {
  im: THREE.InstancedMesh;
  idx: number;
  slot: ScrewSlot;
}
const SHEET_KEYS: MatKey[] = ['dark', 'white', 'orange'];

export class Blaster {
  readonly root = new THREE.Group();
  readonly parts: BPart[] = [];
  readonly meshes: THREE.Mesh[] = [];
  readonly screws: ScrewRef[] = [];
  readonly U: WearU = { wear: { value: 0 }, maskView: { value: 0 }, reveal: { value: 1e4 } };
  readonly mats: Mats;
  stage = -1;
  explode = 0;
  /** 법선 지도 켬/끔 (시트 · 무늬) */
  sheetOn = true;
  knurlOn = true;
  constructor(readonly kit: Kit, opts: { lensTransmission?: boolean; stage?: number } = {}) {
    this.mats = makeMats(kit, this.U, !!opts.lensTransmission);
    for (const def of kit.parts) {
      const group = new THREE.Group();
      group.name = def.id;
      const bp: BPart = { def, group, items: [], lines: [] };
      for (const md of def.meshes) {
        const mat = this.mats.full[md.mat];
        let mesh: THREE.Mesh;
        if (md.inst) {
          const im = new THREE.InstancedMesh(md.geo, mat, md.inst.length);
          md.inst.forEach((m, i) => im.setMatrixAt(i, m));
          im.instanceMatrix.needsUpdate = true;
          im.computeBoundingSphere();
          mesh = im;
        } else mesh = new THREE.Mesh(md.geo, mat);
        const base = new THREE.Vector3(...(md.pos ?? [0, 0, 0]));
        mesh.position.copy(base);
        if (md.mat === 'reticle') mesh.renderOrder = 5;
        group.add(mesh);
        this.meshes.push(mesh);
        const item: Item = { def: md, mesh, base, ex: new THREE.Vector3(...(md.ex ?? def.explode)) };
        bp.items.push(item);
        if (md.outline) {
          const l = new THREE.LineSegments(md.outline, this.mats.outline);
          l.position.copy(base);
          l.visible = false;
          group.add(l);
          bp.lines.push(l);
          item.line = l;
        }
      }
      // 이 부품의 나사 (양쪽 따로 — 펼칠 때 바깥으로)
      for (const s of [1, -1] as const) {
        const list = kit.screws.filter((x) => x.part === def.id && x.side === s);
        if (!list.length) continue;
        const im = new THREE.InstancedMesh(kit.screwGeo, this.mats.full.screw, list.length);
        list.forEach((slot, i) => {
          im.setMatrixAt(i, slot.base);
          this.screws.push({ im, idx: i, slot });
        });
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        group.add(im);
        this.meshes.push(im);
        const ex = def.id === 'plates' ? [0, 0, 8 * s] : def.explode;
        bp.items.push({ def: { geo: kit.screwGeo, mat: 'screw', stage: 4, name: 'screw' }, mesh: im, base: new THREE.Vector3(), ex: new THREE.Vector3(...(ex as V3t)) });
      }
      this.root.add(group);
      this.parts.push(bp);
    }
    this.setStage(opts.stage ?? 7);
  }

  /** 0 윤곽선 · 1 돌출 · 2 베벨 · 3 부품 · 4 나사/패널선 · 5 무늬 · 6 재질/닳음 · 7 렌즈 */
  setStage(s: number): void {
    this.stage = s;
    const M = this.mats;
    for (const p of this.parts) {
      for (const l of p.lines) l.visible = s === 0;
      for (const it of p.items) {
        const d = it.def;
        it.mesh.visible = s > 0 && d.stage <= s;
        if (d.flat) it.mesh.geometry = s <= 1 ? d.flat : d.geo;
        let mat: THREE.Material;
        if (s >= 6) {
          mat = M.full[d.mat];
          if (d.mat === 'lens' && s < 7) mat = M.lensDark;
        } else if (s >= 4 && SHEET_KEYS.includes(d.mat) && this.sheetOn) mat = M.claySheet;
        else if (s >= 5 && d.mat === 'rubber' && this.knurlOn) mat = M.clayKnurl;
        else mat = d.mat === 'reticle' ? M.full.reticle : M.clay;
        if (d.mat === 'reticle') it.mesh.visible = s >= 7;
        it.mesh.material = mat;
      }
    }
    this.applyNormals();
  }
  /** 법선 지도 켬/끔 · 세기 — 재질의 normalScale 로 (셰이더 바꾸지 않게 0 으로) */
  setNormals(sheet: boolean, knurl: boolean, scale = 1): void {
    this.sheetOn = sheet;
    this.knurlOn = knurl;
    this.nScale = scale;
    this.applyNormals();
  }
  private nScale = 1;
  private applyNormals(): void {
    const M = this.mats;
    const sv = this.sheetOn ? this.nScale : 0;
    const kv = this.knurlOn ? this.nScale : 0;
    for (const k of SHEET_KEYS) (M.full[k] as THREE.MeshStandardMaterial).normalScale.set(sv, sv);
    M.claySheet.normalScale.set(sv, sv);
    (M.full.rubber as THREE.MeshStandardMaterial).normalScale.set(kv, kv);
    M.clayKnurl.normalScale.set(kv, kv);
  }
  setExplode(k: number): void {
    this.explode = k;
    for (const p of this.parts)
      for (const it of p.items) {
        it.mesh.position.copy(it.base).addScaledVector(it.ex, k);
        it.line?.position.copy(it.mesh.position);
      }
  }
  /** 부품 이름표 자리 (펼침 반영, 블래스터 기준) */
  anchorOf(p: BPart, out: THREE.Vector3): THREE.Vector3 {
    return out.set(...p.def.anchor).addScaledVector(new THREE.Vector3(...p.def.explode), this.explode);
  }
  update(t: number): void {
    this.kit.tex.core.offset.y = -t * 0.35;
  }
  dispose(): void {
    for (const m of this.mats.all) m.dispose();
  }
}

/** 보이는 메시의 삼각형 수 */
export function triCount(list: THREE.Object3D[]): number {
  let s = 0;
  for (const o of list) {
    const m = o as THREE.Mesh;
    if (!m.isMesh) continue;
    let vis = true;
    for (let q: THREE.Object3D | null = m; q; q = q.parent) if (!q.visible) vis = false;
    if (!vis) continue;
    const g = m.geometry;
    const n = g.index ? g.index.count : g.getAttribute('position').count;
    const im = m as THREE.InstancedMesh;
    s += (n / 3) * (im.isInstancedMesh ? im.count : 1);
  }
  return Math.round(s);
}

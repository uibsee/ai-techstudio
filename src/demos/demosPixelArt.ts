import type { Control, DemoMap } from './types';

/**
 * 픽셀 그림 (2026-10-07, 원혼 그림 — surado 자료, 사용자 허락)
 *  i500 AI 픽셀풍 그림 정리 — 격자 간격 찾기 → 칸 대표 색 → 색 줄이기(Lab k-평균) → 배경 · 흰 테두리 지우기
 *  i501 픽셀 그림 한 장 살리기 — 부위를 오려 겹으로, 통째로 칸 단위로 옮기기 + 색 순환 + 상태 7가지
 * 처음엔 그림을 칸마다 휘게(warp) 했다가 외곽선이 끊겨 버렸다 — 픽셀 그림은 휘지 말고 「통째로 · 칸 단위로」.
 */

const URL_RAW = new URL('../assets/pixelghost/raw-crop.png', import.meta.url).href;
const URL_SPRITE = new URL('../assets/pixelghost/ghost256.png', import.meta.url).href;
const URL_LABELS = new URL('../assets/pixelghost/labels.png', import.meta.url).href;
const TAU = Math.PI * 2;
const FONT = '"Pretendard Variable", Pretendard, system-ui, sans-serif';

function loadPixels(src: string): Promise<{ w: number; h: number; d: Uint8ClampedArray }> {
  return new Promise((ok, no) => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas');
      c.width = im.naturalWidth;
      c.height = im.naturalHeight;
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(im, 0, 0);
      ok({ w: c.width, h: c.height, d: g.getImageData(0, 0, c.width, c.height).data });
    };
    im.onerror = no;
    im.src = src;
  });
}
function hash(i: number): number {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ 0x165667b1;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
/** 상자에 꽉 차는 캔버스 (픽셀 그대로 확대) */
function fitCanvas(box: HTMLElement, bg: string): { cv: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  box.style.cssText += `;position:relative;overflow:hidden;background:${bg}`;
  const cv = document.createElement('canvas');
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated';
  box.appendChild(cv);
  return { cv, g: cv.getContext('2d')! };
}
function sizeTo(cv: HTMLCanvasElement): [number, number] {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(cv.clientWidth * dpr));
  const h = Math.max(1, Math.round(cv.clientHeight * dpr));
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }
  return [w, h];
}

/* ═════════ i500 — AI 픽셀풍 그림 정리 ═════════ */

/** 격자 찾기: 이웃 칸 색 차이를 세로줄 · 가로줄로 더해, 간격 p · 위상 o 에서 경계가 가장 센 값 */
function findGrid(d: Uint8ClampedArray, w: number, h: number): { p: number; ox: number; oy: number; score: number } {
  const col = new Float64Array(w);
  const row = new Float64Array(h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      col[x]! += Math.abs(d[i]! - d[i + 4]!) + Math.abs(d[i + 1]! - d[i + 5]!) + Math.abs(d[i + 2]! - d[i + 6]!);
    }
  for (let y = 0; y < h - 1; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const j = i + w * 4;
      row[y]! += Math.abs(d[i]! - d[j]!) + Math.abs(d[i + 1]! - d[j + 1]!) + Math.abs(d[i + 2]! - d[j + 2]!);
    }
  const best = (arr: Float64Array, n: number): { p: number; o: number; s: number } => {
    const mean = arr.reduce((a, b) => a + b, 0) / n;
    let r = { p: 8, o: 0, s: 0 };
    for (let p = 4; p <= 16; p++)
      for (let o = 0; o < p; o++) {
        let s = 0;
        let k = 0;
        for (let x = o; x < n - 1; x += p) {
          s += arr[x]!;
          k++;
        }
        s = s / Math.max(1, k) / mean;
        if (s > r.s) r = { p, o, s };
      }
    return r;
  };
  const bx = best(col, w);
  const by = best(row, h);
  // 경계(차이)는 칸의 마지막 화소와 다음 칸 첫 화소 사이 → 칸 시작 = o + 1
  return { p: bx.p, ox: (bx.o + 1) % bx.p, oy: (by.o + 1) % by.p, score: (bx.s + by.s) / 2 };
}
/** 칸마다 가운데 화소들의 중앙값 (가장자리 번짐은 버림) */
function cellColors(d: Uint8ClampedArray, w: number, h: number, p: number, ox: number, oy: number): { cw: number; ch: number; c: Uint8ClampedArray } {
  const cw = Math.floor((w - ox) / p);
  const ch = Math.floor((h - oy) / p);
  const c = new Uint8ClampedArray(cw * ch * 4);
  const m = Math.max(1, Math.floor(p / 4));
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const med = (a: number[]): number => a.sort((x, y) => x - y)[a.length >> 1]!;
  for (let cy = 0; cy < ch; cy++)
    for (let cx = 0; cx < cw; cx++) {
      rs.length = gs.length = bs.length = 0;
      for (let y = oy + cy * p + m; y < oy + (cy + 1) * p - m; y++)
        for (let x = ox + cx * p + m; x < ox + (cx + 1) * p - m; x++) {
          const i = (y * w + x) * 4;
          rs.push(d[i]!);
          gs.push(d[i + 1]!);
          bs.push(d[i + 2]!);
        }
      const o = (cy * cw + cx) * 4;
      c[o] = med(rs);
      c[o + 1] = med(gs);
      c[o + 2] = med(bs);
      c[o + 3] = 255;
    }
  return { cw, ch, c };
}
/** 배경 지우기: 가장자리에서 이어진 밝은 칸 + 갇힌 밝은 덩어리(8칸 이상) + 배경에 닿은 밝은 테두리 */
function removeBg(c: Uint8ClampedArray, cw: number, ch: number): void {
  const n = cw * ch;
  const light = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = c[i * 4]!;
    const g = c[i * 4 + 1]!;
    const b = c[i * 4 + 2]!;
    light[i] = Math.min(r, g, b) > 228 && Math.max(r, g, b) - Math.min(r, g, b) < 22 ? 1 : 0;
  }
  const bg = new Uint8Array(n);
  const seen = new Uint8Array(n);
  for (let s = 0; s < n; s++) {
    if (!light[s] || seen[s]) continue;
    const comp = [s];
    seen[s] = 1;
    let edge = false;
    for (let k = 0; k < comp.length; k++) {
      const i = comp[k]!;
      const x = i % cw;
      const y = (i / cw) | 0;
      if (x === 0 || y === 0 || x === cw - 1 || y === ch - 1) edge = true;
      for (const j of [x > 0 ? i - 1 : -1, x < cw - 1 ? i + 1 : -1, y > 0 ? i - cw : -1, y < ch - 1 ? i + cw : -1])
        if (j >= 0 && light[j] && !seen[j]) {
          seen[j] = 1;
          comp.push(j);
        }
    }
    if (edge || comp.length >= 8) for (const i of comp) bg[i] = 1;
  }
  for (let pass = 0; pass < 2; pass++) {
    const add: number[] = [];
    for (let i = 0; i < n; i++) {
      if (bg[i]) continue;
      const x = i % cw;
      const y = (i / cw) | 0;
      const near = (x > 0 && bg[i - 1]) || (x < cw - 1 && bg[i + 1]) || (y > 0 && bg[i - cw]) || (y < ch - 1 && bg[i + cw]);
      if (near && Math.min(c[i * 4]!, c[i * 4 + 1]!, c[i * 4 + 2]!) > 200) add.push(i);
    }
    for (const i of add) bg[i] = 1;
  }
  for (let i = 0; i < n; i++) if (bg[i]) c[i * 4 + 3] = 0;
}
/** sRGB → Lab (색 거리를 사람 눈에 가깝게) */
function lab(r: number, g: number, b: number): [number, number, number] {
  const f = (v: number): number => {
    v /= 255;
    return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92;
  };
  const R = f(r);
  const G = f(g);
  const B = f(b);
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.9505;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.089;
  const q = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * q(Y) - 16, 500 * (q(X) - q(Y)), 200 * (q(Y) - q(Z))];
}
/** 색 줄이기: 그림 칸만 놓고 Lab k-평균. 채도가 큰 칸에 무게를 줘 금빛 · 초록 같은 적은 색도 살린다 */
function quantize(c: Uint8ClampedArray, n: number, K: number): { out: Uint8ClampedArray; pal: [number, number, number][] } {
  const idx: number[] = [];
  for (let i = 0; i < n; i++) if (c[i * 4 + 3]) idx.push(i);
  const L = idx.map((i) => lab(c[i * 4]!, c[i * 4 + 1]!, c[i * 4 + 2]!));
  const wt = L.map((l) => 1 + Math.hypot(l[1], l[2]) / 12);
  const cent: [number, number, number][] = [L[0]!];
  const dist = new Float64Array(L.length).fill(1e18);
  for (let k = 1; k < K; k++) {
    // k-means++ — 가장 먼 쪽에 무게를 두고 다음 중심 (씨앗 고정)
    let sum = 0;
    const last = cent[cent.length - 1]!;
    for (let i = 0; i < L.length; i++) {
      const l = L[i]!;
      const d = (l[0] - last[0]) ** 2 + (l[1] - last[1]) ** 2 + (l[2] - last[2]) ** 2;
      if (d < dist[i]!) dist[i] = d;
      sum += dist[i]! * wt[i]!;
    }
    let r = hash(k * 7919) * sum;
    let pick = 0;
    for (let i = 0; i < L.length; i++) {
      r -= dist[i]! * wt[i]!;
      if (r <= 0) {
        pick = i;
        break;
      }
    }
    cent.push([...L[pick]!] as [number, number, number]);
  }
  const asg = new Int32Array(L.length);
  for (let it = 0; it < 12; it++) {
    const acc = cent.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < L.length; i++) {
      const l = L[i]!;
      let b = 0;
      let bd = 1e18;
      for (let k = 0; k < cent.length; k++) {
        const c0 = cent[k]!;
        const d = (l[0] - c0[0]) ** 2 + (l[1] - c0[1]) ** 2 + (l[2] - c0[2]) ** 2;
        if (d < bd) {
          bd = d;
          b = k;
        }
      }
      asg[i] = b;
      const a = acc[b]!;
      const w = wt[i]!;
      a[0]! += l[0] * w;
      a[1]! += l[1] * w;
      a[2]! += l[2] * w;
      a[3]! += w;
    }
    acc.forEach((a, k) => {
      if (a[3]! > 0) cent[k] = [a[0]! / a[3]!, a[1]! / a[3]!, a[2]! / a[3]!];
    });
  }
  // 팔레트 색 = 그 무리 칸들의 RGB 중앙값 (평균은 탁해진다)
  const groups: number[][][] = cent.map(() => [[], [], []]);
  idx.forEach((i, k) => {
    const gr = groups[asg[k]!]!;
    gr[0]!.push(c[i * 4]!);
    gr[1]!.push(c[i * 4 + 1]!);
    gr[2]!.push(c[i * 4 + 2]!);
  });
  const med = (a: number[]): number => (a.length ? a.sort((x, y) => x - y)[a.length >> 1]! : 0);
  const pal = groups.map((gr) => [med(gr[0]!), med(gr[1]!), med(gr[2]!)] as [number, number, number]);
  const out = new Uint8ClampedArray(c);
  idx.forEach((i, k) => {
    const p = pal[asg[k]!]!;
    out[i * 4] = p[0];
    out[i * 4 + 1] = p[1];
    out[i * 4 + 2] = p[2];
  });
  const used = [...new Set(Array.from(asg))].map((k) => pal[k]!).sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
  return { out, pal: used };
}
function countColors(d: Uint8ClampedArray): number {
  const s = new Set<number>();
  for (let i = 0; i < d.length; i += 4) if (d[i + 3]) s.add((d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!);
  return s.size;
}

const STEPS = ['① AI 그림 그대로', '② 격자 찾기', '③ 칸마다 대표 색', '④ 색 줄이기', '⑤ 배경 · 흰 테두리 지우기'];

export const DEMOS: DemoMap = {
  i500: {
    kind: 'dom',
    caption: 'AI 가 그린 「픽셀풍」 그림(번진 칸 · 색 수천 가지) → 격자 찾기 → 칸 대표 색 → 색 줄이기 → 배경 지우기',
    make(box) {
      const { cv, g } = fitCanvas(box, '#16131f');
      let raw: { w: number; h: number; d: Uint8ClampedArray } | null = null;
      let grid = { p: 8, ox: 0, oy: 0, score: 0 };
      let cells: { cw: number; ch: number; c: Uint8ClampedArray } | null = null;
      let K = 24;
      let quant: { out: Uint8ClampedArray; pal: [number, number, number][] } | null = null;
      let clean: Uint8ClampedArray | null = null;
      const nColors = { raw: 0, cells: 0 };
      const rawC = document.createElement('canvas');
      const smallC = document.createElement('canvas');
      let step = 0;
      let auto = true;
      let timer = 0;
      const rebuild = (): void => {
        if (!cells) return;
        quant = quantize(cells.c, cells.cw * cells.ch, K);
        clean = new Uint8ClampedArray(quant.out);
        removeBg(clean, cells.cw, cells.ch);
      };
      void loadPixels(URL_RAW).then((r) => {
        raw = r;
        rawC.width = r.w;
        rawC.height = r.h;
        rawC.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(r.d), r.w, r.h), 0, 0);
        grid = findGrid(r.d, r.w, r.h);
        cells = cellColors(r.d, r.w, r.h, grid.p, grid.ox, grid.oy);
        nColors.raw = countColors(r.d);
        nColors.cells = countColors(cells.c);
        rebuild();
      });
      const putSmall = (d: Uint8ClampedArray): HTMLCanvasElement => {
        smallC.width = cells!.cw;
        smallC.height = cells!.ch;
        smallC.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(d), cells!.cw, cells!.ch), 0, 0);
        return smallC;
      };
      const controls: Control[] = [
        { type: 'button', label: '다음 단계 ▶', on: () => { auto = false; step = (step + 1) % STEPS.length; } },
        { type: 'toggle', label: '저절로 넘기기', value: true, on: (v) => { auto = v; } },
        { type: 'range', label: '줄인 색 수', min: 4, max: 48, step: 1, value: 24, on: (v) => { K = v; rebuild(); if (!auto) step = Math.max(step, 3); } },
      ];
      return {
        controls,
        update(_t, dt) {
          const [w, h] = sizeTo(cv);
          g.imageSmoothingEnabled = false;
          g.fillStyle = step === 4 ? '#2a2236' : '#16131f';
          g.fillRect(0, 0, w, h);
          if (!raw || !cells || !quant || !clean) {
            g.fillStyle = '#aaa';
            g.font = `600 ${Math.round(h * 0.05)}px ${FONT}`;
            g.textAlign = 'center';
            g.fillText('그림 정리하는 중…', w / 2, h / 2);
            return;
          }
          if (auto) {
            timer += dt;
            if (timer > 2.6) {
              timer = 0;
              step = (step + 1) % STEPS.length;
            }
          }
          // 왼쪽: 그림 (정사각) · 오른쪽: 확대 돋보기 + 설명
          const side = Math.min(h, w * 0.58);
          const x0 = Math.round((w * 0.6 - side) / 2);
          const y0 = Math.round((h - side) / 2);
          const zoomSrc = { x: 0.36, y: 0.28, s: 0.22 }; // 얼굴 근처 (그림 비율)
          const draw = (dx: number, dy: number, ds: number, sx: number, sy: number, ss: number): void => {
            if (step === 0 || step === 1) g.drawImage(rawC, sx * raw!.w, sy * raw!.h, ss * raw!.w, ss * raw!.h, dx, dy, ds, ds);
            else {
              const src = putSmall(step === 2 ? cells!.c : step === 3 ? quant!.out : clean!);
              g.drawImage(src, sx * cells!.cw, sy * cells!.ch, ss * cells!.cw, ss * cells!.ch, dx, dy, ds, ds);
            }
            if (step === 1) {
              // 찾은 격자 선
              const k = ds / (ss * raw!.w);
              g.strokeStyle = 'rgba(80,200,255,0.55)';
              g.lineWidth = 1;
              g.beginPath();
              for (let x = grid.ox; x < raw!.w; x += grid.p) {
                const X = dx + (x - sx * raw!.w) * k;
                if (X >= dx && X <= dx + ds) {
                  g.moveTo(Math.round(X) + 0.5, dy);
                  g.lineTo(Math.round(X) + 0.5, dy + ds);
                }
              }
              for (let y = grid.oy; y < raw!.h; y += grid.p) {
                const Y = dy + (y - sy * raw!.h) * k;
                if (Y >= dy && Y <= dy + ds) {
                  g.moveTo(dx, Math.round(Y) + 0.5);
                  g.lineTo(dx + ds, Math.round(Y) + 0.5);
                }
              }
              g.stroke();
            }
          };
          draw(x0, y0, side, 0, 0, 1);
          // 확대 돋보기 (작은 견본 카드에선 생략)
          const zx = Math.round(w * 0.62);
          const zs = Math.round(Math.min(w * 0.34, h * 0.5));
          const big = w > 360;
          if (big) {
            draw(zx, y0, zs, zoomSrc.x, zoomSrc.y, zoomSrc.s);
            g.strokeStyle = 'rgba(255,255,255,0.7)';
            g.lineWidth = 2;
            g.strokeRect(zx, y0, zs, zs);
            g.strokeStyle = 'rgba(255,255,255,0.5)';
            g.strokeRect(x0 + zoomSrc.x * side, y0 + zoomSrc.y * side, zoomSrc.s * side, zoomSrc.s * side);
          }
          // 설명
          const fs = Math.max(11, Math.round(h * (big ? 0.045 : 0.07)));
          g.font = `800 ${fs}px ${FONT}`;
          g.textAlign = 'left';
          g.fillStyle = '#fff';
          const tx = big ? zx : x0 + 6;
          let ty = big ? y0 + zs + fs * 1.6 : y0 + fs * 1.3;
          g.fillText(STEPS[step]!, tx, ty);
          g.font = `600 ${Math.round(fs * 0.78)}px ${FONT}`;
          g.fillStyle = 'rgba(255,255,255,0.75)';
          const info = [
            `${raw.w}×${raw.h} 화소 · 색 ${nColors.raw.toLocaleString()}가지 — 칸 경계가 번짐`,
            `간격 ${grid.p}화소 · 시작 (${grid.ox}, ${grid.oy}) — 경계 세기 ${grid.score.toFixed(1)}배`,
            `${cells.cw}×${cells.ch} 칸 · 색 ${nColors.cells.toLocaleString()}가지 — 가장자리 버리고 중앙값`,
            `색 ${quant.pal.length}가지 (Lab k-평균 · 채도에 무게)`,
            '밝은 배경 · 갇힌 흰 덩어리 · 흰 테두리 찌꺼기 제거',
          ];
          if (big) {
            ty += fs * 1.3;
            g.fillText(info[step]!, tx, ty);
          }
          // 팔레트 띠
          if (step >= 3 && big) {
            const pw = zs / Math.max(1, quant.pal.length);
            quant.pal.forEach((p, i) => {
              g.fillStyle = `rgb(${p[0]},${p[1]},${p[2]})`;
              g.fillRect(zx + i * pw, ty + fs * 0.7, Math.ceil(pw), fs * 1.1);
            });
          }
        },
        dispose() {
          box.innerHTML = '';
        },
      };
    },
  },
  i501: {
    kind: 'dom',
    caption: '그림 한 장을 부위별로 오려 통째로 칸 단위로 — 가만히 · 유령 걸음 · 공격 · 맞음 · 사라지기 · 나타나기 · 분노',
    make(box) {
      const { cv, g } = fitCanvas(box, '#16131f');
      const anim = makeGhost();
      let state: StateId = 'idle';
      let f = 0;
      let acc = 0;
      let fps = 8;
      let auto = true;
      let autoT = 0;
      let showParts = false;
      const tmp = document.createElement('canvas');
      tmp.width = SW;
      tmp.height = N;
      const order: StateId[] = ['idle', 'attack', 'idle', 'hit', 'walk', 'rage', 'vanish', 'appear'];
      let oi = 0;
      const set = (s: StateId): void => {
        state = s;
        f = 0;
      };
      const controls: Control[] = [
        ...GHOST_STATES.map((s): Control => ({ type: 'button', label: s.name, on: () => { auto = false; set(s.id); } })),
        { type: 'toggle', label: '상태 저절로 바꾸기', value: true, on: (v) => { auto = v; } },
        { type: 'toggle', label: '나눈 부위 색으로 보기', value: false, on: (v) => { showParts = v; } },
        { type: 'range', label: '장 / 초', min: 4, max: 12, step: 1, value: 8, on: (v) => { fps = v; } },
      ];
      return {
        controls,
        update(_t, dt) {
          const [w, h] = sizeTo(cv);
          g.imageSmoothingEnabled = false;
          g.fillStyle = '#16131f';
          g.fillRect(0, 0, w, h);
          if (!anim.ready()) {
            g.fillStyle = '#aaa';
            g.font = `600 ${Math.round(h * 0.05)}px ${FONT}`;
            g.textAlign = 'center';
            g.fillText('그림 불러오는 중…', w / 2, h / 2);
            return;
          }
          const st = GHOST_STATES.find((s) => s.id === state)!;
          acc += Math.min(0.25, dt);
          while (acc >= 1 / fps) {
            acc -= 1 / fps;
            f++;
            if (f >= st.len) {
              if (st.loop) f = 0;
              else if (state === 'vanish') f = st.len - 1;
              else set('idle');
            }
          }
          if (auto) {
            autoT += dt;
            const hold = state === 'idle' || state === 'walk' || state === 'rage' ? 4 : st.len / fps + 0.6;
            if (autoT > hold) {
              autoT = 0;
              oi = (oi + 1) % order.length;
              set(order[oi]!);
            }
          }
          const img = anim.render(state, f, showParts);
          tmp.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img), SW, N), 0, 0);
          const k = Math.min(w / SW, h / N);
          const s = k >= 2 ? Math.floor(k) : k; // 두 배 이상이면 정수 배 (칸이 고르게)
          const dw = SW * s;
          const dh = N * s;
          g.drawImage(tmp, Math.round((w - dw) / 2), Math.round((h - dh) / 2), dw, dh);
          g.font = `700 ${Math.max(11, Math.round(h * 0.04))}px ${FONT}`;
          g.textAlign = 'left';
          g.fillStyle = 'rgba(255,255,255,0.75)';
          g.fillText(`${st.name} · ${f + 1}/${st.len}장`, 10, Math.max(16, h * 0.06));
        },
        dispose() {
          box.innerHTML = '';
        },
      };
    },
  },
};

/* ═════════ i501 — 원혼 상태 애니메이션 ═════════ */

const N = 256;
const SW = 384;
const OX = 64;
type StateId = 'idle' | 'walk' | 'attack' | 'hit' | 'vanish' | 'appear' | 'rage';
const GHOST_STATES: { id: StateId; name: string; len: number; loop: boolean }[] = [
  { id: 'idle', name: '가만히', len: 32, loop: true },
  { id: 'walk', name: '유령 걸음', len: 64, loop: true },
  { id: 'attack', name: '공격', len: 18, loop: false },
  { id: 'hit', name: '맞음', len: 12, loop: false },
  { id: 'vanish', name: '사라지기', len: 24, loop: false },
  { id: 'appear', name: '나타나기', len: 24, loop: false },
  { id: 'rage', name: '분노', len: 16, loop: true },
];
type RGB = [number, number, number];
const SMOKE: RGB[] = [[94, 79, 103], [107, 80, 113], [119, 98, 124], [138, 121, 144], [157, 122, 144], [175, 165, 180]];
const FLAME: RGB[] = [[88, 52, 77], [98, 64, 90], [118, 72, 97], [122, 85, 105], [140, 101, 122], [148, 102, 151]];
const RED: RGB[] = [[72, 17, 42], [96, 31, 57], [118, 38, 70], [150, 45, 70], [190, 60, 80], [226, 104, 112]];
/** 부위 번호 (labels.png 의 빨강 값): 1 · 2 띠 고리 · 12 · 13 띠 아래 가닥 · 3 머리카락 끝 (몸 뒤) / 4 노리개 · 5 비파 술 · 6 · 7 연꽃 · 8 손 (몸 앞) / 9 연기 · 10 불꽃 (색 순환) · 11 비파 줄 */
const BACK = new Set([1, 2, 12, 13, 3]);
const FRONT = new Set([4, 5, 6, 7, 8]);
const PART_COL: Record<number, RGB> = { 1: [0, 140, 255], 12: [80, 80, 255], 2: [0, 220, 255], 13: [0, 255, 255], 3: [255, 200, 0], 4: [0, 255, 120], 5: [120, 255, 0], 6: [255, 80, 200], 7: [255, 120, 255], 8: [255, 40, 40], 9: [200, 0, 255], 10: [255, 140, 0], 11: [255, 255, 255] };

function makeGhost() {
  let SRC: Uint8ClampedArray | null = null;
  const lab = new Uint8Array(N * N);
  const base = new Uint8ClampedArray(N * N * 4);
  const partPx: Record<number, number[]> = {};
  const smokeShade = new Int8Array(N * N);
  const flameShade = new Int8Array(N * N);
  const revealAt = new Float32Array(N * N);
  const opaque: number[] = [];
  void Promise.all([loadPixels(URL_SPRITE), loadPixels(URL_LABELS)]).then(([s, l]) => {
    const S = s.d;
    for (let i = 0; i < N * N; i++) lab[i] = l.d[i * 4]!;
    base.set(S);
    // 몸통 겹: 뒤 부위 자리는 비우고, 앞 부위 자리는 같은 줄 가까운 칸으로 메운다 (움직여도 구멍 없게)
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const L = lab[i]!;
        if (BACK.has(L)) {
          base[i * 4 + 3] = 0;
          continue;
        }
        if (!FRONT.has(L)) continue;
        let best = -1;
        for (let d = 1; d < 10 && best < 0; d++)
          for (const xx of [x - d, x + d]) {
            if (xx < 0 || xx >= N) continue;
            const j = y * N + xx;
            if (!FRONT.has(lab[j]!) && !BACK.has(lab[j]!) && S[j * 4 + 3]) {
              best = j;
              break;
            }
          }
        if (best < 0) base[i * 4 + 3] = 0;
        else for (let c = 0; c < 4; c++) base[i * 4 + c] = S[best * 4 + c]!;
      }
    for (let i = 0; i < N * N; i++) {
      if (!S[i * 4 + 3]) continue;
      opaque.push(i);
      if (lab[i]) (partPx[lab[i]!] ||= []).push(i);
      revealAt[i] = ((255 - ((i / N) | 0)) / 255) * 0.84 + hash(i * 13) * 0.16;
    }
    const shadeOf = (pal: RGB[], i: number): number => {
      let b = 0;
      let bd = 1e9;
      pal.forEach((p, k) => {
        const d = (S[i * 4]! - p[0]) ** 2 + (S[i * 4 + 1]! - p[1]) ** 2 + (S[i * 4 + 2]! - p[2]) ** 2;
        if (d < bd) {
          bd = d;
          b = k;
        }
      });
      return b;
    };
    for (const i of partPx[9] ?? []) smokeShade[i] = shadeOf(SMOKE, i);
    for (const i of partPx[10] ?? []) flameShade[i] = shadeOf(FLAME, i);
    SRC = S;
  });

  const sq = (f: number, period: number, ph = 0): number => Math.round(Math.sin((TAU * f) / period + ph));
  const ch = new Uint8ClampedArray(N * N * 4);
  const stage = new Uint8ClampedArray(SW * N * 4);

  interface LayerOpt {
    trail?: number;
    hem?: boolean;
    rage?: boolean;
    strumNow?: boolean;
    strumFlash?: boolean;
  }
  /** 캐릭터 한 장 (256칸) — 부위마다 통째로 칸 단위 이동 + 연기 · 불꽃 색 순환 */
  function charLayer(f: number, o: LayerOpt = {}): void {
    const S = SRC!;
    ch.fill(0);
    const put = (x: number, y: number, s: number): void => {
      if (x < 0 || y < 0 || x >= N || y >= N) return;
      const p = (y * N + x) * 4;
      ch[p] = S[s * 4]!;
      ch[p + 1] = S[s * 4 + 1]!;
      ch[p + 2] = S[s * 4 + 2]!;
      ch[p + 3] = 255;
    };
    const bob = !o.rage && Math.sin((TAU * f) / 32) > 0.35 ? 1 : 0;
    const tr = o.trail ?? 0;
    const up = o.rage ? (f % 4 < 2 ? -1 : -2) : 0;
    const strum = o.strumNow ?? f % 16 < 2;
    const off: Record<number, [number, number]> = {
      1: [sq(f, 32, 0) + tr, up],
      12: [sq(f, 32, -1.3) + tr * 2, up],
      2: [sq(f, 32, Math.PI) + tr, up],
      13: [sq(f, 32, Math.PI - 1.3) + tr * 2, up],
      3: [sq(f, 16, 0.6) + tr + (o.rage ? (f % 2 ? 1 : -1) : 0), bob + up],
      4: [sq(f, 32, -0.9) + tr, 0],
      5: [sq(f, 16, 1) + tr, 0],
      6: [Math.sin((TAU * f) / 32 + 1) > 0.5 ? 1 : 0, 0],
      7: [Math.sin((TAU * f) / 32 + 2.6) > 0.5 ? -1 : 0, 0],
      8: [0, strum ? 1 : 0],
    };
    for (const k of [1, 12, 2, 13, 3]) for (const i of partPx[k] ?? []) put((i % N) + off[k]![0], ((i / N) | 0) + off[k]![1], i);
    // 몸통 — 고개 숙임 · 치맛단 물결은 세로로 한 칸 늘여 메운다
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        let sy = y;
        if (bob && x >= 96 && x < 160 && y >= 12 && y <= 62) sy = y - 1;
        if (o.hem && y >= 196 && x >= 56 && x < 204) {
          const r = (Math.floor((x - 56) / 7) + Math.floor(f / 2)) % 3;
          sy = Math.max(196, y - (r === 0 ? 1 : r === 1 ? 2 : 0));
        }
        const s = sy * N + x;
        if (!base[s * 4 + 3]) continue;
        const p = (y * N + x) * 4;
        ch[p] = base[s * 4]!;
        ch[p + 1] = base[s * 4 + 1]!;
        ch[p + 2] = base[s * 4 + 2]!;
        ch[p + 3] = 255;
      }
    // 색 순환 — 칸은 그대로, 밝은 띠가 위로 흐른다
    const cyc = (k: number, pal: RGB[], shade: Int8Array, speed: number, scale: number): void => {
      for (const i of partPx[k] ?? []) {
        const p = i * 4;
        if (!ch[p + 3]) continue;
        const x = i % N;
        const y = (i / N) | 0;
        const w = Math.round(1.2 * Math.sin(y * scale + x * 0.07 + (TAU * f * speed) / 32));
        const c = pal[Math.max(0, Math.min(pal.length - 1, shade[i]! + w))]!;
        ch[p] = c[0];
        ch[p + 1] = c[1];
        ch[p + 2] = c[2];
      }
    };
    cyc(9, o.rage ? RED : SMOKE, smokeShade, o.rage ? 8 : 4, 0.42);
    cyc(10, o.rage ? RED : FLAME, flameShade, 8, 0.6);
    if (o.strumFlash ?? (f % 16 >= 1 && f % 16 <= 5))
      for (const i of partPx[11] ?? []) {
        if (((i % N) + ((i / N) | 0) + f) % 3) continue;
        ch[i * 4] = 236;
        ch[i * 4 + 1] = 228;
        ch[i * 4 + 2] = 196;
      }
    for (const k of [4, 5, 6, 7, 8]) for (const i of partPx[k] ?? []) put((i % N) + off[k]![0], ((i / N) | 0) + off[k]![1], i);
    if (!o.rage && f >= 10 && f < 20) {
      const y = 51 + (f - 10) + bob;
      for (const yy of [y, y + 1]) {
        const p = (yy * N + 121) * 4;
        ch[p] = 120;
        ch[p + 1] = 20;
        ch[p + 2] = 40;
        ch[p + 3] = 255;
      }
    }
    if (o.rage)
      for (const [ex, ey] of [[121, 49], [134, 49]] as const) {
        for (let dx = -1; dx <= 1; dx++) {
          const p = (ey * N + ex + dx) * 4;
          ch[p] = 230;
          ch[p + 1] = 40;
          ch[p + 2] = 60;
          ch[p + 3] = 255;
        }
        const p = (ey * N + ex) * 4;
        ch[p] = 255;
        ch[p + 1] = f % 4 < 2 ? 220 : 160;
        ch[p + 2] = f % 4 < 2 ? 210 : 150;
      }
  }

  /* 무대 그리기 */
  const sp = (x: number, y: number, c: readonly number[]): void => {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= SW || y >= N) return;
    const p = (y * SW + x) * 4;
    stage[p] = c[0]!;
    stage[p + 1] = c[1]!;
    stage[p + 2] = c[2]!;
    stage[p + 3] = 255;
  };
  const empty = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < SW && y < N && !stage[(y * SW + x) * 4 + 3];
  function blit(dx: number, dy: number, tint?: (c: RGB, i: number) => RGB, keep?: (i: number) => boolean): void {
    for (let i = 0; i < N * N; i++) {
      const p = i * 4;
      if (!ch[p + 3] || (keep && !keep(i))) continue;
      let c: RGB = [ch[p]!, ch[p + 1]!, ch[p + 2]!];
      if (tint) c = tint(c, i);
      sp(OX + (i % N) + dx, ((i / N) | 0) + dy, c);
    }
  }
  function ghostTrail(dx: number, dy: number, color: RGB, every: number): void {
    for (let i = 0; i < N * N; i++) {
      if (!ch[i * 4 + 3]) continue;
      const X = OX + (i % N) + dx;
      const Y = ((i / N) | 0) + dy;
      if ((X + Y) % every || !empty(X, Y)) continue;
      sp(X, Y, color);
    }
  }
  function ring(cx: number, cy: number, r: number, w: number, color: RGB, density: number, seed: number): void {
    const steps = Math.ceil(TAU * r * 1.3);
    for (let s = 0; s < steps; s++) {
      if (hash(seed * 997 + Math.floor(s / 3)) > density) continue;
      const a = (s / steps) * TAU;
      for (let k = 0; k < w; k++) sp(cx + Math.cos(a) * (r - k), cy + Math.sin(a) * (r - k) * 0.82, color);
    }
  }
  const NOTE = ['..##', '..#.#', '..#..', '..#..', '###..', '###..'];
  const note = (x: number, y: number, color: RGB): void =>
    NOTE.forEach((row, j) => [...row].forEach((c, i) => {
      if (c === '#') sp(x + i, y + j, color);
    }));
  function idlePuff(f: number): void {
    const spots = partPx[9] ?? [];
    for (let p = 0; p < 26 && spots.length; p++) {
      const life = 10 + Math.floor(hash(p * 7) * 14);
      const age = (f + Math.floor(hash(p) * 32)) % 32;
      if (age >= life) continue;
      const s = spots[Math.floor(hash(p * 3 + 1) * spots.length)]!;
      const x = OX + (s % N) + (Math.floor(age / 4) % 2 ? 1 : 0);
      const y = ((s / N) | 0) - 2 - age;
      if (empty(x, y)) sp(x, y, SMOKE[age > life * 0.6 ? 1 : 3]!);
    }
  }

  function render(state: StateId, f: number, showParts: boolean): Uint8ClampedArray {
    stage.fill(0);
    if (state === 'idle') {
      charLayer(f % 32);
      blit(0, 0);
      idlePuff(f % 32);
    } else if (state === 'walk') {
      // 64장: 한 장에 2칸 — 오른쪽 16장 → 왼쪽 32장 → 다시 16장
      const posAt = (k: number): number => {
        k = ((k % 64) + 64) % 64;
        return k < 16 ? k * 2 : k < 48 ? 32 - (k - 16) * 2 : -32 + (k - 48) * 2;
      };
      const x = posAt(f);
      const dir = Math.sign(posAt(f + 1) - x) || 1;
      const bob = [0, -1, -2, -1][Math.floor(f / 2) % 4]!;
      charLayer(f % 32, { trail: -dir, hem: true });
      ghostTrail(posAt(f - 3), bob, [80, 58, 100], 3);
      ghostTrail(posAt(f - 6), bob, [56, 40, 72], 5);
      blit(x, bob);
      for (let p = 0; p < 18; p++) {
        const age = (f + p * 5) % 12;
        const bx = posAt(f - age) + OX + 60 + Math.floor(hash(p) * 140);
        const by = 236 - age * 2 - Math.floor(hash(p * 3) * 10);
        if (empty(bx, by)) sp(bx, by, SMOKE[age < 6 ? 3 : 1]!);
      }
    } else if (state === 'attack') {
      const lean = f >= 1 && f <= 3 ? -1 : f >= 4 && f <= 6 ? 1 : 0;
      const shake = f >= 4 && f <= 7 ? (f % 2 ? 1 : -1) : 0;
      charLayer(f, { strumNow: f === 4 || f === 5, strumFlash: f >= 4 && f <= 10 });
      blit(lean, shake);
      const cx = OX + 120;
      const cy = 126;
      for (let k = 0; k < 3; k++) {
        const age = f - (4 + k * 3);
        if (age < 0) continue;
        const r = 10 + age * 9;
        ring(cx, cy, r, 2, age < 4 ? [236, 150, 226] : [170, 110, 190], 0.25 + Math.max(0, 1 - age / 11) * 0.75, k * 31 + age);
        if (age < 3) ring(cx, cy, r - 3, 1, [255, 230, 250], 0.8, k * 17);
      }
      if (f >= 4)
        for (let n = 0; n < 7; n++) {
          const a = -2.6 + n * 0.75;
          const age = f - 4 - (n % 3);
          if (age < 0 || age > 12) continue;
          const d = 18 + age * 7;
          note(cx + Math.cos(a) * d + Math.sin(age + n) * 2, cy + Math.sin(a) * d * 0.8 - age * 1.5, age < 7 ? [246, 186, 240] : [160, 110, 180]);
        }
    } else if (state === 'hit') {
      const knock = [0, 2, 3, 4, 4, 3, 3, 2, 1, 1, 0, 0][f] ?? 0;
      const shake = f >= 1 && f <= 5 ? (f % 2 ? 1 : -1) : 0;
      charLayer(8);
      blit(knock, shake, (c) => {
        if (f <= 1) return [246, 240, 250]; // 하얗게 번쩍
        let [r, g, b] = c;
        if (f <= 3) {
          r = Math.min(255, r * 0.6 + 120);
          g *= 0.6;
          b *= 0.65;
        }
        const ds = f <= 9 ? 0.45 * (1 - (f - 2) / 8) : 0; // 색이 빠졌다 돌아옴
        const gray = (r + g + b) / 3;
        return [Math.round(r + (gray - r) * ds), Math.round(g + (gray - g) * ds), Math.round(b + (gray - b) * ds)];
      });
      if (f <= 2)
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * TAU;
          for (let d = 3 + f * 3; d < 9 + f * 5; d++) sp(OX + 90 + Math.cos(a) * d, 92 + Math.sin(a) * d, f === 0 ? [255, 255, 255] : [255, 210, 120]);
        }
    } else if (state === 'vanish' || state === 'appear') {
      const span = 18;
      const p = state === 'vanish' ? 1.02 - (f / span) * 1.04 : (f / span) * 1.04 - 0.02;
      charLayer(state === 'vanish' ? f : 0);
      blit(0, 0, (c, i) => (p - revealAt[i]! < 0.03 ? SMOKE[5]! : p - revealAt[i]! < 0.06 ? SMOKE[3]! : c), (i) => revealAt[i]! < p);
      for (let s = 0; s < opaque.length; s += 29) {
        const i = opaque[s]!;
        const dAt = state === 'vanish' ? (1 - revealAt[i]!) * span : revealAt[i]! * span;
        const age = state === 'vanish' ? f - dAt : dAt - f;
        if (age < 0 || age > 5) continue;
        const x = OX + (i % N) + Math.round(Math.sin(age + i) * 1.5);
        const y = ((i / N) | 0) - Math.round(age * 2.5);
        if (empty(x, y)) sp(x, y, SMOKE[age < 2 ? 5 : age < 4 ? 3 : 1]!);
      }
    } else {
      const tremble = f % 4 === 1 ? 1 : f % 4 === 3 ? -1 : 0;
      charLayer(f, { rage: true });
      for (let y = 1; y < N - 1; y++)
        for (let x = 1; x < N - 1; x++) {
          if (ch[(y * N + x) * 4 + 3]) continue;
          const near = ch[(y * N + x + 1) * 4 + 3] || ch[(y * N + x - 1) * 4 + 3] || ch[((y + 1) * N + x) * 4 + 3] || ch[((y - 1) * N + x) * 4 + 3];
          if (near && (x + y + f) % 3 === 0) sp(OX + x + tremble, y, [150, 30, 54]);
        }
      blit(tremble, 0);
      const spots = partPx[9] ?? [];
      for (let q = 0; q < 22 && spots.length; q++) {
        const age = (f + q * 3) % 16;
        const s = spots[Math.floor(hash(q * 5) * spots.length)]!;
        const x = OX + (s % N) + (age % 4 < 2 ? 1 : 0);
        const y = ((s / N) | 0) - age * 2;
        if (empty(x, y)) sp(x, y, RED[age < 8 ? 5 : 3]!);
      }
    }
    if (showParts)
      for (let i = 0; i < N * N; i++) {
        const c = PART_COL[lab[i]!];
        if (!c) continue;
        const p = ((i / N) | 0) * SW * 4 + (OX + (i % N)) * 4;
        stage[p] = (stage[p]! + c[0] * 2) / 3;
        stage[p + 1] = (stage[p + 1]! + c[1] * 2) / 3;
        stage[p + 2] = (stage[p + 2]! + c[2] * 2) / 3;
        stage[p + 3] = 255;
      }
    return stage;
  }
  return { ready: () => SRC !== null, render };
}

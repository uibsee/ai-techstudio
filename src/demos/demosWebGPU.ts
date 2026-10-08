import type * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clone as skelClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Control, Demo3D, DemoDom, DemoMap } from './types';

/**
 * WebGPU · 최신 렌더링 (i493 ~ i498) — i498 만 공용 WebGL 렌더러로 도는 '3d' 견본 (아래 i498 설명)
 *
 * 공용 WebGL 렌더러로는 안 되는 기술이라 'dom' 꼴로 box 안에 three/webgpu 의 WebGPURenderer 를 직접 만든다.
 *  - 카드(폭 < 500): 렌더러를 만들지 않는다 — 기술을 보여 주는 2D 그림 + 「크게 보기에서 실제 실행」.
 *  - 크게 보기(폭 ≥ 500): three/webgpu · three/tsl 을 그때 불러와(dynamic import) 렌더러 하나 생성.
 *    navigator.gpu 가 없거나 「WebGL2 로 강제」면 같은 렌더러가 WebGL2 백엔드로 돈다 (구석에 표시).
 *  - 같은 페이지의 공용 WebGL 렌더러와 GPU 메모리를 나눠 쓰니 픽셀 비율은 1.5 까지.
 * TSL 노드는 타입이 너무 복잡해 any 로 다룬다 (three 0.186 에 실제로 있는 함수만 씀).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

const FONT = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
const MONO = 'ui-monospace, "Cascadia Code", Consolas, monospace';
const TAU = Math.PI * 2;

const hasGPU = (): boolean => typeof navigator !== 'undefined' && !!(navigator as Any).gpu;

interface Ctx {
  GPU: Any;
  TSL: Any;
  renderer: Any;
  webgpu: boolean;
  canvas: HTMLCanvasElement;
  /** 견본마다 쓰는 HTML 층 (코드 표 등) */
  layer: HTMLElement;
  w: number;
  h: number;
}
interface Run {
  scene: Any;
  camera: Any;
  frame?(t: number, dt: number): void;
  /** 직접 그리기 (후처리 등) — 없으면 renderer.render(scene, camera) */
  render?(): void;
  resize?(w: number, h: number): void;
  dispose?(): void;
  /** HUD 셋째 줄 */
  note?(): string;
}
interface Api {
  restart(): void;
  ctx(): Ctx | null;
}
interface Spec<S> {
  caption: string;
  state(): S;
  card(g: CanvasRenderingContext2D, w: number, h: number, t: number, u: number): void;
  controls?(st: S, api: Api): Control[];
  build(ctx: Ctx, st: S): Promise<Run>;
}

function el(tag: string, css: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.style.cssText = css;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** 장면 안 모양 · 재질 · 그림 정리 */
function disposeScene(root: Any): void {
  if (!root?.traverse) return;
  const seen = new Set<Any>();
  root.traverse((o: Any) => {
    if (o.geometry && !seen.has(o.geometry)) {
      seen.add(o.geometry);
      o.geometry.dispose();
    }
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (seen.has(m)) continue;
      seen.add(m);
      for (const k of Object.keys(m)) {
        const v = m[k];
        if (v && v.isTexture && !seen.has(v)) {
          seen.add(v);
          v.dispose();
        }
      }
      m.dispose();
    }
  });
}

/* ───────── 카드 공통 꾸밈 ───────── */
function chip(g: CanvasRenderingContext2D, x: number, y: number, text: string, u: number, fg: string, bg: string, align: 'left' | 'center' | 'right'): void {
  g.font = `600 ${Math.round(9.5 * u)}px ${FONT}`;
  const tw = g.measureText(text).width;
  const pw = tw + 14 * u;
  const ph = 17 * u;
  const x0 = align === 'left' ? x : align === 'right' ? x - pw : x - pw / 2;
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(x0, y - ph / 2, pw, ph, ph / 2);
  g.fill();
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x0 + pw / 2, y + 0.5 * u);
}
function cardChrome(g: CanvasRenderingContext2D, w: number, h: number, t: number, u: number): void {
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  const ok = hasGPU();
  chip(g, w - 7 * u, 13 * u, ok ? '✓ 이 브라우저: WebGPU' : '이 브라우저: WebGL2 대체', u, ok ? '#0b2b1a' : '#2e1d00', ok ? 'rgba(110,240,170,.92)' : 'rgba(255,196,90,.92)', 'right');
  const a = 0.75 + 0.25 * Math.sin(t * 3);
  g.globalAlpha = a;
  chip(g, w / 2, h - 12 * u, '▶ 크게 보기에서 실제 실행', u, '#fff', 'rgba(120,90,255,.85)', 'center');
  g.globalAlpha = 1;
}
function bg(g: CanvasRenderingContext2D, w: number, h: number, top: string, bottom: string): void {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, top);
  gr.addColorStop(1, bottom);
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
}
function glow(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, a = 1): void {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, col);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalAlpha = a;
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
  g.globalAlpha = 1;
}

/* ───────── 견본 틀 ───────── */
function gpuDemo<S>(spec: Spec<S>): DemoDom {
  return {
    kind: 'dom',
    caption: spec.caption,
    make(box: HTMLElement) {
      const st = spec.state();
      const root = el('div', `position:absolute;inset:0;overflow:hidden;background:#07080f;font-family:${FONT};`);
      if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
      box.appendChild(root);
      let mode: 'card' | 'big' | null = null;
      let dead = false;
      let force = false;
      // 카드
      let cv: HTMLCanvasElement | null = null;
      // 크게
      let ctx: Ctx | null = null;
      let run: Run | null = null;
      let gen = 0;
      let failed = '';
      const hud = el(
        'div',
        'position:absolute;left:10px;top:10px;z-index:3;pointer-events:none;display:flex;flex-direction:column;gap:4px;align-items:flex-start;font-size:12px;color:#e8ecff;text-shadow:0 1px 2px #000;',
      );
      const hudBadge = el('div', 'padding:3px 10px;border-radius:999px;font-weight:700;font-size:12px;');
      const hudLine = el('div', `font-family:${MONO};font-size:11.5px;background:rgba(5,6,14,.62);padding:3px 8px;border-radius:6px;`);
      const hudNote = el('div', 'font-size:11.5px;background:rgba(5,6,14,.62);padding:3px 8px;border-radius:6px;max-width:440px;line-height:1.45;white-space:pre-line;');
      hud.append(hudBadge, hudLine, hudNote);
      let cpuAvg = 0;
      let fpsAcc = 0;
      let fpsN = 0;
      let fps = 0;
      let hudT = 0;

      function teardown(): void {
        try {
          run?.dispose?.();
          if (run) disposeScene(run.scene);
        } catch (e) {
          console.warn('[studio] WebGPU 정리', e);
        }
        run = null;
        if (ctx) {
          try {
            ctx.renderer.dispose();
          } catch {
            /* 무시 */
          }
          ctx.canvas.remove();
          ctx.layer.remove();
          ctx = null;
        }
      }

      async function boot(): Promise<void> {
        const my = ++gen;
        teardown();
        failed = '';
        hudBadge.textContent = '준비 중…';
        hudBadge.style.background = 'rgba(160,170,210,.85)';
        hudBadge.style.color = '#10121c';
        hudLine.textContent = 'three/webgpu 불러오는 중';
        hudNote.style.display = 'none';
        try {
          const [GPU, TSL] = await Promise.all([import('three/webgpu'), import('three/tsl')]);
          if (dead || my !== gen) return;
          const canvas = document.createElement('canvas');
          canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
          const layer = el('div', 'position:absolute;inset:0;z-index:2;pointer-events:none;');
          root.prepend(canvas);
          root.appendChild(layer);
          const w = Math.max(1, box.clientWidth);
          const h = Math.max(1, box.clientHeight);
          const renderer: Any = new (GPU as Any).WebGPURenderer({ canvas, antialias: true, forceWebGL: force || !hasGPU() });
          renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
          renderer.setSize(w, h, false);
          await renderer.init();
          if (dead || my !== gen) {
            renderer.dispose();
            canvas.remove();
            layer.remove();
            return;
          }
          const webgpu = !!renderer.backend?.isWebGPUBackend;
          ctx = { GPU, TSL, renderer, webgpu, canvas, layer, w, h };
          const r = await spec.build(ctx, st);
          if (dead || my !== gen) {
            r.dispose?.();
            disposeScene(r.scene);
            return;
          }
          run = r;
          hudBadge.textContent = webgpu ? '지금: WebGPU' : 'WebGL2 대체';
          hudBadge.style.background = webgpu ? 'rgba(110,240,170,.92)' : 'rgba(255,196,90,.95)';
          hudBadge.style.color = webgpu ? '#06281a' : '#2e1d00';
          if (!webgpu) hudBadge.textContent += force ? ' (강제)' : hasGPU() ? ' (어댑터 없음)' : ' (navigator.gpu 없음)';
        } catch (e) {
          if (my !== gen) return;
          failed = String((e as Error)?.message ?? e).slice(0, 160);
          console.warn('[studio] WebGPU 견본 시작 실패', e);
          hudBadge.textContent = '시작 실패';
          hudBadge.style.background = 'rgba(255,110,110,.95)';
          hudLine.textContent = failed;
        }
      }

      function setupCard(): void {
        cv = document.createElement('canvas');
        cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
        root.appendChild(cv);
      }
      function decide(): void {
        const w = box.clientWidth;
        if (w === 0) return;
        mode = w >= 500 ? 'big' : 'card';
        if (mode === 'card') setupCard();
        else {
          root.appendChild(hud);
          void boot();
        }
      }

      const api: Api = {
        restart: () => {
          if (mode === 'big') void boot();
        },
        ctx: () => ctx,
      };
      const controls: Control[] = [
        ...(spec.controls?.(st, api) ?? []),
        {
          type: 'toggle',
          label: 'WebGL2 로 강제 (비교)',
          value: false,
          on: (v) => {
            force = v;
            api.restart();
          },
        },
      ];
      decide();

      return {
        controls,
        update(t: number, dt: number) {
          if (dead) return;
          if (!mode) {
            decide();
            return;
          }
          const w = Math.max(1, box.clientWidth);
          const h = Math.max(1, box.clientHeight);
          if (mode === 'card' && cv) {
            const dpr = Math.min(devicePixelRatio, 1.5);
            const cw = Math.round(w * dpr);
            const ch = Math.round(h * dpr);
            if (cv.width !== cw || cv.height !== ch) {
              cv.width = cw;
              cv.height = ch;
            }
            const g = cv.getContext('2d')!;
            g.setTransform(dpr, 0, 0, dpr, 0, 0);
            g.globalAlpha = 1;
            g.globalCompositeOperation = 'source-over';
            g.filter = 'none';
            const u = Math.min(w / 280, h / 175);
            spec.card(g, w, h, t, u);
            g.globalAlpha = 1;
            g.globalCompositeOperation = 'source-over';
            g.filter = 'none';
            cardChrome(g, w, h, t, u);
            return;
          }
          if (!ctx || !run) return;
          const c = ctx;
          const r = run;
          try {
            if (c.w !== w || c.h !== h) {
              c.w = w;
              c.h = h;
              c.renderer.setSize(w, h, false);
              if (r.camera?.isPerspectiveCamera) {
                r.camera.aspect = w / h;
                r.camera.updateProjectionMatrix();
              }
              r.resize?.(w, h);
            }
            const t0 = performance.now();
            r.frame?.(t, Math.min(dt, 0.05));
            if (r.render) r.render();
            else c.renderer.render(r.scene, r.camera);
            const cpu = performance.now() - t0;
            cpuAvg = cpuAvg * 0.9 + cpu * 0.1;
            fpsAcc += dt;
            fpsN++;
            if (fpsAcc > 0.5) {
              fps = fpsN / fpsAcc;
              fpsAcc = 0;
              fpsN = 0;
            }
            hudT += dt;
            if (hudT > 0.25) {
              hudT = 0;
              const info = c.renderer.info?.render;
              hudLine.textContent = `CPU ${cpuAvg.toFixed(2)} ms · ${fps.toFixed(0)} fps${info ? ` · 그리기 ${info.drawCalls ?? info.calls ?? '-'}` : ''}`;
              const n = r.note?.() ?? '';
              hudNote.style.display = n ? 'block' : 'none';
              hudNote.textContent = n;
            }
          } catch (e) {
            console.warn('[studio] WebGPU 그리기 오류', e);
            hudLine.textContent = '그리기 오류: ' + String((e as Error)?.message ?? e).slice(0, 120);
            run = null;
          }
        },
        dispose() {
          dead = true;
          gen++;
          teardown();
          root.remove();
        },
      };
    },
  };
}

/* ═════════ 카드 그림 (렌더러 없이 2D) ═════════ */

/** 반짝이는 공 하나 (금속 · 유리 느낌) */
function shinyBall(g: CanvasRenderingContext2D, x: number, y: number, r: number, c0: string, c1: string, c2: string, hl: number, glass = false): void {
  const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r);
  gr.addColorStop(0, c0);
  gr.addColorStop(0.45, c1);
  gr.addColorStop(1, c2);
  g.globalAlpha = glass ? 0.55 : 1;
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
  g.globalAlpha = 1;
  if (glass) {
    g.strokeStyle = 'rgba(200,240,255,.75)';
    g.lineWidth = r * 0.06;
    g.beginPath();
    g.arc(x, y, r * 0.97, 0, TAU);
    g.stroke();
  }
  const hx = x + Math.cos(hl) * r * 0.42;
  const hy = y - r * 0.45 + Math.sin(hl * 1.3) * r * 0.1;
  glow(g, hx, hy, r * 0.42, 'rgba(255,255,255,.95)', 0.9);
  g.globalAlpha = 0.25;
  g.fillStyle = c1;
  g.beginPath();
  g.ellipse(x, y + r * 1.25, r * 0.8, r * 0.16, 0, 0, TAU);
  g.fill();
  g.globalAlpha = 1;
}

/** 3차 베지어 위 한 점 (가로로 굽은 선) */
function bez(x1: number, y1: number, x2: number, y2: number, s: number): [number, number] {
  const m = 1 - s;
  const mx = (x1 + x2) / 2;
  return [m * m * m * x1 + 3 * m * m * s * mx + 3 * m * s * s * mx + s * s * s * x2, m * m * m * y1 + 3 * m * m * s * y1 + 3 * m * s * s * y2 + s * s * s * y2];
}
function wire(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, on: boolean, t: number, u: number, col: string, dot: string): void {
  g.strokeStyle = on ? col : 'rgba(255,255,255,.18)';
  g.lineWidth = 1.4 * u;
  g.beginPath();
  g.moveTo(x1, y1);
  g.bezierCurveTo((x1 + x2) / 2, y1, (x1 + x2) / 2, y2, x2, y2);
  g.stroke();
  if (!on) return;
  for (let k = 0; k < 3; k++) {
    const [px, py] = bez(x1, y1, x2, y2, (t * 0.8 + k / 3) % 1);
    glow(g, px, py, 5 * u, dot);
  }
}

function card493(g: CanvasRenderingContext2D, w: number, h: number, t: number, u: number): void {
  bg(g, w, h, '#0d1030', '#05060f');
  glow(g, w / 2, h * 0.32, 110 * u, 'rgba(110,90,255,.25)');
  const cy = h * 0.33;
  shinyBall(g, w / 2 - 62 * u, cy + Math.sin(t * 1.4) * 3 * u, 19 * u, '#fff6d0', '#e0a93a', '#5a3a08', t * 1.1);
  shinyBall(g, w / 2, cy + Math.sin(t * 1.4 + 2) * 3 * u, 22 * u, '#ffffff', '#9aa6b8', '#20242e', t * 1.1 + 1);
  shinyBall(g, w / 2 + 62 * u, cy + Math.sin(t * 1.4 + 4) * 3 * u, 19 * u, '#ffffff', '#7fd4ff', '#0b3550', t * 1.1 + 2, true);
  const ok = hasGPU();
  const y0 = h * 0.66;
  const xs = w / 2 - 80 * u;
  const xa = w / 2 + 50 * u;
  const ya = y0 - 15 * u;
  const yb = y0 + 15 * u;
  g.font = `700 ${Math.round(10 * u)}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const box = (x: number, y: number, bw: number, label: string, on: boolean, col: string): void => {
    g.fillStyle = on ? col : 'rgba(255,255,255,.07)';
    g.strokeStyle = on ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.25)';
    g.lineWidth = 1;
    g.setLineDash(on ? [] : [3 * u, 3 * u]);
    g.beginPath();
    g.roundRect(x - bw / 2, y - 9 * u, bw, 18 * u, 5 * u);
    g.fill();
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = on ? '#0a0b18' : 'rgba(255,255,255,.55)';
    g.fillText(label, x, y + 0.5 * u);
  };
  wire(g, xs + 34 * u, y0, xa - 34 * u, ya, ok, t, u, 'rgba(160,220,255,.8)', 'rgba(190,240,255,1)');
  wire(g, xs + 34 * u, y0, xa - 34 * u, yb, !ok, t, u, 'rgba(255,210,140,.8)', 'rgba(255,220,160,1)');
  box(xs, y0, 68 * u, '같은 장면', true, '#cfd6ff');
  box(xa, ya, 68 * u, 'WebGPU', ok, '#7ff0b0');
  box(xa, yb, 68 * u, 'WebGL2', !ok, '#ffc45a');
}

/* 용암 무늬 (값 잡음) — 카드용으로 한 번만 만든다 */
let lavaTex: HTMLCanvasElement | null = null;
function lavaCanvas(): HTMLCanvasElement {
  if (lavaTex) return lavaTex;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d')!;
  const img = g.createImageData(S, S);
  const N = 16;
  const grid: number[] = [];
  let seed = 7;
  const rnd = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < N * N; i++) grid.push(rnd());
  const at = (x: number, y: number): number => grid[(((y % N) + N) % N) * N + (((x % N) + N) % N)]!;
  const noise = (x: number, y: number): number => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * sx;
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * sx;
    return a + (b - a) * sy;
  };
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const fx = (x / S) * N;
      const fy = (y / S) * N;
      let n = noise(fx * 0.25, fy * 0.25) * 0.55 + noise(fx * 0.5, fy * 0.5) * 0.3 + noise(fx, fy) * 0.15;
      n = Math.abs(n - 0.5) * 2;
      const e = Math.pow(1 - n, 6);
      const i = (y * S + x) * 4;
      img.data[i] = Math.min(255, 40 + e * 255);
      img.data[i + 1] = Math.min(255, 12 + e * 150);
      img.data[i + 2] = Math.min(255, 10 + e * 30);
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  lavaTex = c;
  return c;
}

function card494(g: CanvasRenderingContext2D, w: number, h: number, t: number, u: number): void {
  bg(g, w, h, '#16101f', '#07060c');
  const nodes = [
    { x: 40, y: 52, l: 'noise()' },
    { x: 40, y: 96, l: 'time' },
    { x: 108, y: 66, l: 'mix()' },
    { x: 108, y: 116, l: 'smoothstep' },
    { x: 172, y: 90, l: 'colorNode' },
  ];
  const links: [number, number][] = [
    [0, 2],
    [1, 2],
    [1, 3],
    [2, 4],
    [3, 4],
  ];
  for (const [a, b] of links) {
    const A = nodes[a]!;
    const B = nodes[b]!;
    wire(g, (A.x + 30) * u, A.y * u, (B.x - 30) * u, B.y * u, true, t + a * 0.23, u, 'rgba(255,170,90,.55)', 'rgba(255,210,140,1)');
  }
  g.font = `600 ${Math.round(9 * u)}px ${MONO}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  nodes.forEach((n, i) => {
    const isOut = i === 4;
    g.fillStyle = isOut ? 'rgba(255,140,60,.95)' : 'rgba(40,32,60,.95)';
    g.strokeStyle = isOut ? '#ffd9a8' : 'rgba(200,170,255,.6)';
    g.lineWidth = 1;
    g.beginPath();
    g.roundRect((n.x - 30) * u, (n.y - 9) * u, 60 * u, 18 * u, 5 * u);
    g.fill();
    g.stroke();
    g.fillStyle = isOut ? '#1c0b00' : '#e6dcff';
    g.fillText(n.l, n.x * u, n.y * u + 0.5 * u);
  });
  // 결과: 흐르는 용암 공
  const cx = 240 * u;
  const cy = 86 * u;
  const r = 30 * u;
  glow(g, cx, cy, r * 1.9, 'rgba(255,90,20,.35)');
  g.save();
  g.beginPath();
  g.arc(cx, cy, r, 0, TAU);
  g.clip();
  const tex = lavaCanvas();
  const sz = r * 2.4;
  const off = (t * 10 * u) % sz;
  for (let k = 0; k < 3; k++) g.drawImage(tex, cx - sz / 2, cy - r - sz + off + k * sz, sz, sz);
  const sh = g.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
  sh.addColorStop(0, 'rgba(255,255,255,.2)');
  sh.addColorStop(0.6, 'rgba(0,0,0,0)');
  sh.addColorStop(1, 'rgba(0,0,0,.75)');
  g.fillStyle = sh;
  g.fillRect(cx - r, cy - r, r * 2, r * 2);
  g.restore();
  g.font = `700 ${Math.round(10.5 * u)}px ${FONT}`;
  g.fillStyle = '#ffd2a8';
  g.textAlign = 'left';
  g.fillText('TSL: 함수 조립 → 셰이더', 10 * u, 14 * u);
}

/* 카드 입자 (소용돌이) */
interface CP {
  a: number;
  r: number;
  s: number;
  y: number;
  hue: number;
}
const cardParts: CP[] = [];
function card495(g: CanvasRenderingContext2D, w: number, h: number, t: number, u: number): void {
  bg(g, w, h, '#080616', '#020208');
  if (!cardParts.length) {
    for (let i = 0; i < 900; i++) {
      const r = Math.pow(Math.random(), 0.6);
      cardParts.push({ a: Math.random() * TAU, r, s: 0.6 + Math.random() * 0.8, y: (Math.random() - 0.5) * 0.25, hue: 190 + Math.random() * 120 });
    }
  }
  const cx = w * 0.5;
  const cy = h * 0.47;
  const R = Math.min(w * 0.42, h * 0.75);
  glow(g, cx, cy, R * 0.5, 'rgba(160,120,255,.35)');
  g.globalCompositeOperation = 'lighter';
  for (const p of cardParts) {
    const a = p.a + t * p.s * (1.4 / (p.r + 0.25));
    const rr = p.r * R;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr * 0.36 + p.y * R - (1 - p.r) * 10 * u;
    g.fillStyle = `hsla(${p.hue},95%,${60 + (1 - p.r) * 25}%,.75)`;
    g.fillRect(x, y, 1.6 * u, 1.6 * u);
  }
  g.globalCompositeOperation = 'source-over';
  const cyc = (t % 4) / 4;
  const n = Math.round(Math.min(1, cyc * 1.6) * 500000);
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.font = `800 ${Math.round(17 * u)}px ${FONT}`;
  g.fillStyle = '#fff';
  g.fillText(n.toLocaleString('ko-KR'), 10 * u, 16 * u);
  g.font = `600 ${Math.round(9.5 * u)}px ${FONT}`;
  g.fillStyle = '#c9b8ff';
  g.fillText('입자 — GPU 계산 셰이더', 10 * u, 33 * u);
  g.fillStyle = '#7ff0b0';
  g.fillText('CPU ≈ 0 ms', 10 * u, 47 * u);
}

/** 던전 기둥 · 횃불 (반사에도 그대로 쓴다) */
function dungeonRow(g: CanvasRenderingContext2D, w: number, hz: number, t: number, u: number): void {
  for (let i = 0; i < 4; i++) {
    const x = w * (0.16 + i * 0.226);
    const pw = 22 * u;
    const ph = 78 * u;
    const gr = g.createLinearGradient(x - pw / 2, 0, x + pw / 2, 0);
    gr.addColorStop(0, '#3a3440');
    gr.addColorStop(0.45, '#6d6070');
    gr.addColorStop(1, '#1d1a22');
    g.fillStyle = gr;
    g.fillRect(x - pw / 2, hz - ph, pw, ph);
    g.fillStyle = '#4a424f';
    g.fillRect(x - pw / 2 - 3 * u, hz - ph, pw + 6 * u, 6 * u);
    g.fillRect(x - pw / 2 - 3 * u, hz - 6 * u, pw + 6 * u, 6 * u);
    if (i % 2 === 0) {
      const fl = 0.8 + 0.2 * Math.sin(t * 13 + i * 3) * Math.sin(t * 7 + i);
      const fx = x + pw / 2 + 6 * u;
      const fy = hz - ph * 0.62;
      glow(g, fx, fy, 34 * u * fl, 'rgba(255,140,40,.55)');
      glow(g, fx, fy, 8 * u * fl, 'rgba(255,240,180,1)');
    } else {
      glow(g, x, hz - ph - 10 * u, 12 * u, 'rgba(120,200,255,.65)');
    }
  }
}
function card496(g: CanvasRenderingContext2D, w: number, h: number, t: number, u: number): void {
  bg(g, w, h, '#0c0a12', '#14111a');
  const hz = h * 0.6;
  const on = Math.floor(t / 2.5) % 2 === 0;
  dungeonRow(g, w, hz, t, u);
  // 바닥
  const fl = g.createLinearGradient(0, hz, 0, h);
  fl.addColorStop(0, '#1b1820');
  fl.addColorStop(1, '#0a090d');
  g.fillStyle = fl;
  g.fillRect(0, hz, w, h - hz);
  if (on) {
    g.save();
    g.beginPath();
    g.rect(0, hz, w, h - hz);
    g.clip();
    g.translate(0, hz * 2);
    g.scale(1, -1);
    g.globalAlpha = 0.5;
    g.filter = `blur(${1.2 * u}px)`;
    dungeonRow(g, w, hz, t, u);
    g.restore();
    g.filter = 'none';
    const fade = g.createLinearGradient(0, hz, 0, h);
    fade.addColorStop(0, 'rgba(10,9,13,0)');
    fade.addColorStop(1, 'rgba(10,9,13,.85)');
    g.fillStyle = fade;
    g.fillRect(0, hz, w, h - hz);
  }
  g.strokeStyle = 'rgba(0,0,0,.35)';
  g.lineWidth = 1;
  for (let k = 1; k < 5; k++) {
    const y = hz + (h - hz) * Math.pow(k / 5, 1.6);
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
  }
  chip(g, 8 * u, 14 * u, on ? 'SSR 켬 — 바닥에 비침' : 'SSR 끔', u, on ? '#06281a' : '#eee', on ? 'rgba(110,240,170,.92)' : 'rgba(90,90,110,.9)', 'left');
}

function card497(g: CanvasRenderingContext2D, w: number, h: number, t: number, u: number): void {
  bg(g, w, h, '#0b0a10', '#07060a');
  const wx = 42 * u;
  const wy = 30 * u;
  const ww = 46 * u;
  const wh = 54 * u;
  // 빛줄기
  g.globalCompositeOperation = 'lighter';
  const k = 0.75 + 0.25 * Math.sin(t * 0.9);
  for (let i = 0; i < 2; i++) {
    const x0 = wx + i * (ww / 2 + 2 * u);
    const bw = ww / 2 - 2 * u;
    const gr = g.createLinearGradient(x0, wy, x0 + 150 * u, h);
    gr.addColorStop(0, `rgba(255,220,160,${0.42 * k})`);
    gr.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(x0, wy);
    g.lineTo(x0 + bw, wy);
    g.lineTo(x0 + bw + 160 * u, h * 0.98);
    g.lineTo(x0 + 105 * u, h * 0.98);
    g.closePath();
    g.fill();
  }
  // 먼지
  for (let i = 0; i < 40; i++) {
    const s = i * 12.9898;
    const px = (wx + ((Math.sin(s) * 43758.5) % 1 + 1) % 1 * 150 * u + t * 4 * u * ((i % 3) + 1)) % (w * 0.9);
    const py = ((Math.cos(s) * 24634.6) % 1 + 1) % 1 * h * 0.9 + Math.sin(t + i) * 3 * u;
    const inBeam = px > wx + (py - wy) * 0.9 && px < wx + ww + (py - wy) * 1.5;
    if (inBeam) glow(g, px, py, 2.4 * u, 'rgba(255,240,210,.9)');
  }
  g.globalCompositeOperation = 'source-over';
  // 벽 · 창틀
  g.fillStyle = '#1a1720';
  g.fillRect(wx - 6 * u, wy - 6 * u, ww + 12 * u, 4 * u);
  g.fillStyle = '#fff3d8';
  g.fillRect(wx, wy, ww, wh);
  g.fillStyle = '#231e28';
  g.fillRect(wx + ww / 2 - 2 * u, wy, 4 * u, wh);
  g.fillRect(wx, wy + wh / 2 - 2 * u, ww, 4 * u);
  glow(g, wx + ww / 2, wy + wh / 2, 50 * u, 'rgba(255,230,180,.35)');
  // 바닥 빛 자국
  g.fillStyle = 'rgba(255,220,160,.12)';
  g.beginPath();
  g.ellipse(wx + 160 * u, h * 0.93, 55 * u, 7 * u, 0, 0, TAU);
  g.fill();
  g.font = `700 ${Math.round(10 * u)}px ${FONT}`;
  g.fillStyle = '#ffe3b8';
  g.textAlign = 'right';
  g.textBaseline = 'middle';
  g.fillText('빛이 공기 속에 보인다', w - 10 * u, 34 * u);
}

/* ═════════ 크게 보기 공통 ═════════ */

/** 방 조명 환경 반사 (RoomEnvironment 을 WebGPU 용 PMREM 으로) */
async function roomEnv(ctx: Ctx, sigma = 0.04): Promise<Any> {
  const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
  const pm = new ctx.GPU.PMREMGenerator(ctx.renderer);
  const env: Any = new RoomEnvironment();
  const rt = await pm.fromSceneAsync(env, sigma);
  env.dispose?.();
  pm.dispose();
  return rt;
}

/* ═════════ i493 WebGPU 렌더러 ═════════ */
const i493 = gpuDemo<{ spin: boolean; exposure: number }>({
  caption: 'three/webgpu 의 WebGPURenderer — 지원하면 WebGPU, 아니면 같은 코드가 WebGL2 로 (크게 보기에서 실제 실행)',
  state: () => ({ spin: true, exposure: 1 }),
  card: card493,
  controls: (st, api) => [
    { type: 'toggle', label: '돌리기', value: true, on: (v) => (st.spin = v) },
    {
      type: 'range',
      label: '노출',
      min: 0.4,
      max: 2,
      step: 0.05,
      value: 1,
      on: (v) => {
        st.exposure = v;
        const c = api.ctx();
        if (c) c.renderer.toneMappingExposure = v;
      },
    },
  ],
  async build(ctx, st) {
    const { GPU, renderer } = ctx;
    renderer.toneMapping = GPU.ACESFilmicToneMapping;
    renderer.toneMappingExposure = st.exposure;
    renderer.shadowMap.enabled = true;
    const scene = new GPU.Scene();
    scene.background = new GPU.Color(0x080a16);
    const envRT = await roomEnv(ctx);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.6;
    const cam = new GPU.PerspectiveCamera(36, ctx.w / ctx.h, 0.1, 100);
    cam.position.set(0, 2.1, 7.6);
    cam.lookAt(0, 0.75, 0);

    const floor = new GPU.Mesh(new GPU.CircleGeometry(7, 96), new GPU.MeshStandardMaterial({ color: 0x05060c, roughness: 0.4, metalness: 0.05 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    // 뒤 네온 막대 — 크롬에 비치고 유리 속에서 꺾인다
    const neonCols = [0xff4fa3, 0x46e8ff, 0xffb13b, 0x8a6bff, 0x55ffa0];
    const neonGeo = new GPU.CapsuleGeometry(0.06, 1.5, 6, 12);
    neonCols.forEach((c, i) => {
      const m = new GPU.Mesh(neonGeo, new GPU.MeshBasicMaterial({ color: new GPU.Color(c).multiplyScalar(2.2) }));
      m.position.set(-3 + i * 1.5, 1.25, -2.6);
      scene.add(m);
    });
    const knot = new GPU.Mesh(new GPU.TorusKnotGeometry(0.52, 0.18, 240, 36), new GPU.MeshStandardMaterial({ color: 0xffc24a, metalness: 1, roughness: 0.16 }));
    knot.position.set(-2.15, 1.05, 0.1);
    const chrome = new GPU.Mesh(new GPU.SphereGeometry(0.78, 96, 64), new GPU.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.03 }));
    chrome.position.set(0, 0.78, -0.25);
    const glass = new GPU.Mesh(
      new GPU.IcosahedronGeometry(0.72, 0),
      new GPU.MeshPhysicalMaterial({ color: 0xeaf6ff, metalness: 0, roughness: 0.02, transmission: 1, thickness: 0.9, ior: 1.52, specularIntensity: 1, dispersion: 0.6 }),
    );
    glass.position.set(2.15, 1.0, 0.1);
    for (const m of [knot, chrome, glass]) {
      m.castShadow = true;
      scene.add(m);
    }
    // 둘레 작은 보석 (장미금 · 에메랄드 · 루비)
    const gemGeo = new GPU.OctahedronGeometry(0.13, 0);
    const gemMats = [
      new GPU.MeshStandardMaterial({ color: 0xf2a68a, metalness: 1, roughness: 0.2 }),
      new GPU.MeshPhysicalMaterial({ color: 0x2bd47a, metalness: 0, roughness: 0.05, transmission: 0.6, thickness: 0.3, ior: 1.6 }),
      new GPU.MeshPhysicalMaterial({ color: 0xff3355, metalness: 0, roughness: 0.05, transmission: 0.6, thickness: 0.3, ior: 1.7 }),
    ];
    const gems: Any[] = [];
    for (let i = 0; i < 18; i++) {
      const g = new GPU.Mesh(gemGeo, gemMats[i % 3]);
      g.castShadow = true;
      scene.add(g);
      gems.push(g);
    }
    const key = new GPU.DirectionalLight(0xfff1dc, 2.6);
    key.position.set(3, 6, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -5;
    key.shadow.camera.right = 5;
    key.shadow.camera.top = 5;
    key.shadow.camera.bottom = -5;
    key.shadow.radius = 4;
    scene.add(key);
    const rimA = new GPU.PointLight(0xff4fa3, 18, 12);
    rimA.position.set(-4, 2.5, -2);
    const rimB = new GPU.PointLight(0x46e8ff, 18, 12);
    rimB.position.set(4, 2.5, -2);
    scene.add(rimA, rimB);
    let a = 0;
    return {
      scene,
      camera: cam,
      frame(t, dt) {
        if (st.spin) a += dt;
        knot.rotation.set(a * 0.7, a * 0.9, 0);
        glass.rotation.set(a * 0.4, a * 0.6, a * 0.2);
        chrome.position.y = 0.78 + Math.sin(t * 1.3) * 0.06;
        gems.forEach((g, i) => {
          const ang = (i / gems.length) * TAU + a * 0.35;
          g.position.set(Math.cos(ang) * 3.3, 0.35 + Math.sin(t * 1.7 + i) * 0.12, Math.sin(ang) * 1.6 + 0.4);
          g.rotation.set(t + i, t * 1.3 + i, 0);
        });
        cam.position.x = Math.sin(t * 0.18) * 0.9;
        cam.lookAt(0, 0.75, 0);
      },
      dispose() {
        envRT.dispose();
      },
      note: () =>
        ctx.webgpu
          ? '셰이더가 WGSL 로 만들어져 WebGPU 로 그려지는 중 · 「WebGL2 로 강제」를 켜면 같은 장면이 GLSL 로'
          : '같은 코드가 GLSL 로 바뀌어 WebGL2 로 그려지는 중 (금속 · 유리 · 그림자 모두 그대로)',
    };
  },
});

/* ═════════ i494 TSL 노드 재질 ═════════ */
const CODE494: { title: string; col: string; code: string }[] = [
  {
    title: '흐르는 용암',
    col: '#ff8a3d',
    code: 'n = mx_noise_float(positionLocal.mul(2.2).add(flow))\nvein = oneMinus(abs(n)).pow(6)\nmat.colorNode = mix(rock, ash, n)\nmat.emissiveNode = mix(red, gold, vein).mul(vein.mul(4))',
  },
  {
    title: '홀로그램',
    col: '#46e8ff',
    code: 'fres = oneMinus(abs(dot(normalView,\n        positionViewDirection))).pow(2)\nscan = sin(positionWorld.y.mul(70).sub(time.mul(6)))\nmat.colorNode = cyan.mul(fres.add(scan.mul(.5)))\nmat.positionNode = positionLocal.add(glitch)',
  },
  {
    title: '물결',
    col: '#7fc8ff',
    code: 'w = sin(positionLocal.y.mul(18).add(time.mul(4)))\n  .add(sin(positionLocal.x.mul(11).add(time.mul(2.5))))\nmat.positionNode = positionLocal\n  .add(normalLocal.mul(w.mul(0.02)))\nmat.emissiveNode = foam.mul(w.mul(.5).add(.5).pow(6))',
  },
  {
    title: '디졸브',
    col: '#b79bff',
    code: 'thr = sin(time.mul(0.9)).mul(.45).add(.5)\nn = mx_noise_float(positionLocal.mul(3.2)).mul(.5).add(.5)\nmat.colorNode = Fn(() => {\n  Discard(n.lessThan(thr)); return violet })()\nmat.emissiveNode = orange.mul(smoothstep(thr.add(.08), thr, n).mul(5))',
  },
];

const i494 = gpuDemo<{ speed: number }>({
  caption: 'TSL 로 짠 재질 넷 — 셰이더 글자 대신 함수를 조립 (같은 코드가 WebGPU · WebGL2 모두에서)',
  state: () => ({ speed: 1 }),
  card: card494,
  controls: (st) => [{ type: 'range', label: '시간 빠르기', min: 0, max: 3, step: 0.05, value: 1, on: (v) => (st.speed = v) }],
  async build(ctx, st) {
    const { GPU, TSL, renderer } = ctx;
    const {
      Fn,
      Discard,
      uniform,
      positionLocal,
      positionWorld,
      normalLocal,
      normalView,
      positionViewDirection,
      mx_noise_float,
      mix,
      color,
      smoothstep,
      sin,
      vec3,
      abs,
      dot,
      oneMinus,
      step,
      fract,
    } = TSL;
    renderer.toneMapping = GPU.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    const scene = new GPU.Scene();
    scene.background = new GPU.Color(0x0b0912);
    const envRT = await roomEnv(ctx, 0.06);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.6;
    const cam = new GPU.PerspectiveCamera(32, ctx.w / ctx.h, 0.1, 100);
    cam.position.set(0, 0, 10);
    const T = uniform(0);
    const time = T;

    // 용암
    const flow = vec3(0, time.mul(-0.35), time.mul(0.12));
    const n1 = mx_noise_float(positionLocal.mul(2.2).add(flow));
    const n2 = mx_noise_float(positionLocal.mul(4.6).sub(flow.mul(1.7)));
    const nl = n1.add(n2.mul(0.45));
    const vein = oneMinus(abs(nl)).pow(6);
    const lava = new GPU.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0 });
    lava.colorNode = mix(color(0x1a0c07), color(0x3b2218), nl.mul(0.5).add(0.5));
    lava.emissiveNode = mix(color(0xff2a00), color(0xffd36a), vein).mul(vein.mul(4.2));

    // 홀로그램
    const fres = oneMinus(abs(dot(normalView, positionViewDirection))).pow(2);
    const scan = sin(positionWorld.y.mul(70).sub(time.mul(6))).mul(0.5).add(0.5).pow(3);
    const glitch = step(0.92, fract(time.mul(0.55))).mul(sin(positionLocal.y.mul(25).add(time.mul(50))).mul(0.07));
    const holo = new GPU.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: GPU.DoubleSide, blending: GPU.AdditiveBlending });
    holo.colorNode = color(0x46e8ff).mul(fres.mul(1.7).add(scan.mul(0.55)).add(0.06));
    holo.opacityNode = fres.add(scan.mul(0.35)).add(0.1).clamp(0, 1);
    holo.positionNode = positionLocal.add(vec3(glitch, 0, 0));

    // 물결
    const wv = sin(positionLocal.y.mul(18).add(time.mul(4))).add(sin(positionLocal.x.mul(11).add(time.mul(2.5))).mul(0.6));
    const water = new GPU.MeshPhysicalNodeMaterial({ color: 0x0b4f8f, roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03 });
    water.positionNode = positionLocal.add(normalLocal.mul(wv.mul(0.02)));
    water.emissiveNode = color(0x8fefff)
      .mul(wv.mul(0.31).add(0.5).clamp(0, 1).pow(6).mul(0.9))
      .add(color(0x1a78ff).mul(fres.mul(0.7)));

    // 디졸브
    const thr = sin(time.mul(0.9)).mul(0.45).add(0.5);
    const nd = mx_noise_float(positionLocal.mul(3.2)).mul(0.5).add(0.5);
    const dis = new GPU.MeshStandardNodeMaterial({ roughness: 0.32, metalness: 0.35, side: GPU.DoubleSide });
    dis.colorNode = Fn(() => {
      Discard(nd.lessThan(thr));
      return color(0x8f74ff);
    })();
    dis.emissiveNode = color(0xff7a2a).mul(smoothstep(thr.add(0.08), thr, nd).mul(5));

    const { RoundedBoxGeometry } = await import('three/examples/jsm/geometries/RoundedBoxGeometry.js');
    const objs: Any[] = [
      new GPU.Mesh(new GPU.SphereGeometry(0.85, 128, 96), lava),
      new GPU.Mesh(new GPU.TorusKnotGeometry(0.5, 0.17, 220, 32), holo),
      new GPU.Mesh(new GPU.SphereGeometry(0.85, 160, 120), water),
      new GPU.Mesh(new (RoundedBoxGeometry as Any)(1.25, 1.25, 1.25, 6, 0.18), dis),
    ];
    objs.forEach((o) => scene.add(o));
    // 받침 빛 (재질 색에 맞춘 바닥 원)
    const padGeo = new GPU.CircleGeometry(0.75, 48);
    const pads = CODE494.map((c) => {
      const m = new GPU.Mesh(padGeo, new GPU.MeshBasicMaterial({ color: new GPU.Color(c.col).multiplyScalar(0.35), transparent: true, opacity: 0.6, blending: GPU.AdditiveBlending, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      scene.add(m);
      return m;
    });
    const key = new GPU.DirectionalLight(0xffffff, 1.6);
    key.position.set(2, 4, 5);
    scene.add(key, new GPU.AmbientLight(0x404060, 0.6));

    // 코드 표
    const row = el('div', 'position:absolute;left:12px;right:12px;bottom:12px;display:flex;gap:10px;');
    for (const c of CODE494) {
      const card = el('div', `flex:1;min-width:0;background:rgba(10,8,22,.82);border:1px solid rgba(255,255,255,.12);border-top:2px solid ${c.col};border-radius:10px;padding:7px 9px;`);
      card.append(el('div', `color:${c.col};font-weight:800;font-size:12.5px;margin-bottom:4px;`, c.title));
      card.append(el('pre', `margin:0;white-space:pre-wrap;word-break:break-all;font-family:${MONO};font-size:10.5px;line-height:1.45;color:#dcd6f2;`, c.code));
      row.appendChild(card);
    }
    ctx.layer.appendChild(row);

    const place = (w: number, h: number): void => {
      const dist = cam.position.z;
      const hh = Math.tan((cam.fov * Math.PI) / 360) * dist;
      const hw = hh * (w / h);
      const codeH = row.offsetHeight || 170;
      // 위 HUD(≈80px)와 아래 코드 표 사이 가운데에 놓는다
      const top = 80;
      const bottom = h - codeH - 24;
      const yc = (top + bottom) / 2;
      const upY = hh * (1 - (2 * yc) / h);
      const regionW = ((bottom - top) / h) * 2 * hh;
      const s = Math.min(1, (hw * 0.5) / 1.15, (regionW * 0.92) / 1.8);
      objs.forEach((o, i) => {
        o.position.set(hw * (-0.75 + i * 0.5), upY, 0);
        o.scale.setScalar(s);
        pads[i]!.position.set(o.position.x, o.position.y - 1.05 * s, 0);
        pads[i]!.scale.setScalar(s);
      });
    };
    place(ctx.w, ctx.h);
    let tt = 0;
    return {
      scene,
      camera: cam,
      frame(_t, dt) {
        tt += dt * st.speed;
        T.value = tt;
        objs[0].rotation.y = tt * 0.2;
        objs[1].rotation.set(tt * 0.3, tt * 0.5, 0);
        objs[2].rotation.y = tt * 0.15;
        objs[3].rotation.set(tt * 0.25, tt * 0.35, 0);
      },
      resize: place,
      dispose() {
        envRT.dispose();
      },
      note: () => '아래 코드가 위 재질을 만든 TSL 실제 줄 (줄임) — 렌더러가 WGSL 또는 GLSL 로 번역',
    };
  },
});

/* ═════════ i495 GPU 계산 입자 ═════════ */
const MODE495 = ['소용돌이', '끌어당김', '불꽃놀이'];
const i495 = gpuDemo<{ want: number; mode: number; changedAt: number }>({
  caption: '입자 수십만 개의 위치 · 속도를 계산 셰이더(compute)로 GPU 에서 — CPU 는 명령만 보낸다 (크게 보기에서 실제 실행)',
  state: () => ({ want: 250000, mode: 0, changedAt: 0 }),
  card: card495,
  controls: (st) => [
    {
      type: 'range',
      label: '입자 수 (천 개)',
      min: 20,
      max: 500,
      step: 10,
      value: 250,
      on: (v) => {
        st.want = v * 1000;
        st.changedAt = performance.now();
      },
    },
    { type: 'button', label: '소용돌이', on: () => (st.mode = 0) },
    { type: 'button', label: '끌어당김', on: () => (st.mode = 1) },
    { type: 'button', label: '불꽃놀이', on: () => (st.mode = 2) },
  ],
  async build(ctx, st) {
    const { GPU, TSL, renderer } = ctx;
    const { Fn, If, instancedArray, instanceIndex, hash, uniform, vec3, float, mix, smoothstep, dot, cos, sin, abs, uv } = TSL;
    renderer.toneMapping = GPU.ACESFilmicToneMapping;
    const scene = new GPU.Scene();
    scene.background = new GPU.Color(0x030308);
    const cam = new GPU.PerspectiveCamera(45, ctx.w / ctx.h, 0.1, 200);
    const cap = ctx.webgpu ? 500000 : 80000;
    // 바닥 격자 (크기 느낌)
    const grid = new GPU.GridHelper(24, 24, 0x2a2450, 0x15122a);
    grid.position.y = -2.2;
    scene.add(grid);

    const uDt = uniform(0.016);
    const uT = uniform(0);
    const uMode = uniform(0);
    const uSize = uniform(0.04);
    const uAlpha = uniform(0.5);
    const A1 = uniform(new GPU.Vector3());
    const A2 = uniform(new GPU.Vector3());
    const A3 = uniform(new GPU.Vector3());
    const uBurst = uniform(0);
    const uGroup = uniform(0);
    const uCenter = uniform(new GPU.Vector3());
    const uSeed = uniform(0);

    let sys: { N: number; sprite: Any; mat: Any; update: Any; init: Any } | null = null;
    const build = (N: number): void => {
      if (sys) {
        scene.remove(sys.sprite);
        sys.mat.dispose();
        sys.update.dispose?.();
        sys.init.dispose?.();
      }
      const pos = instancedArray(N, 'vec3');
      const vel = instancedArray(N, 'vec3');
      const life = instancedArray(N, 'float');
      const col = instancedArray(N, 'vec3');
      const init = Fn(() => {
        const i = instanceIndex;
        const a = hash(i).mul(TAU);
        const r = hash(i.add(7919)).sqrt().mul(6.3).add(0.35);
        const y0 = float(1).sub(r.div(6.5)).max(0).pow(2).mul(4.2).sub(0.6).add(hash(i.add(104729)).sub(0.5).mul(0.5));
        pos.element(i).assign(vec3(cos(a).mul(r), y0, a.sin().mul(r)));
        vel.element(i).assign(vec3(0));
        life.element(i).assign(1);
        col.element(i).assign(vec3(0.3, 0.4, 1));
      })().compute(N);
      const update = Fn(() => {
        const i = instanceIndex;
        const p = pos.element(i).toVar();
        const v = vel.element(i).toVar();
        const L = life.element(i).toVar();
        const c = vec3(0).toVar();
        const h1 = hash(i);
        const h2 = hash(i.add(7919));
        const h3 = hash(i.add(104729));
        If(uMode.equal(0), () => {
          // 입자마다 고리 하나를 도는 시간 u (0→1): 바깥에서 빨려 들어 가운데로 솟는다. 각은 지금 방향을 돌려서 쌓는다.
          const u = uT.mul(h2.mul(0.08).add(0.06)).add(h3).fract();
          const r1 = float(1).sub(u).pow(1.4).mul(6.4).add(0.25);
          const r0 = vec3(p.x, 0, p.z).length();
          const dth = float(2.6).div(r1.add(0.45)).mul(uDt);
          const cd = cos(dth);
          const sd = sin(dth);
          const dx = r0.greaterThan(0.001).select(p.x.div(r0), cos(h1.mul(TAU)));
          const dz = r0.greaterThan(0.001).select(p.z.div(r0), h1.mul(TAU).sin());
          const wob = sin(uT.mul(1.3).add(h1.mul(40))).mul(0.18).mul(r1.div(6.5));
          const rr = r1.add(wob);
          const y1 = float(1).sub(r1.div(6.8)).max(0).pow(2.2).mul(4.4).sub(0.7).add(h3.sub(0.5).mul(float(0.25).add(r1.mul(0.08))));
          const np = vec3(dx.mul(cd).sub(dz.mul(sd)).mul(rr), y1, dx.mul(sd).add(dz.mul(cd)).mul(rr));
          const jump = abs(r1.sub(r0)).greaterThan(1.0);
          v.assign(jump.select(vec3(0), np.sub(p).div(uDt.max(0.0001))));
          p.assign(jump.select(np, p));
          const s = v.length();
          c.assign(mix(vec3(0.08, 0.25, 1.0), vec3(1.0, 0.25, 0.75), smoothstep(5.8, 2.2, r1)).add(vec3(0.7, 0.75, 1).mul(smoothstep(1.4, 0.3, r1))).mul(s.mul(0.08).add(0.75)));
          L.assign(1);
        })
          .ElseIf(uMode.equal(1), () => {
            const acc = vec3(0).toVar();
            for (const A of [A1, A2, A3]) {
              const dd = A.sub(p);
              const r2 = dot(dd, dd).add(0.3);
              acc.addAssign(dd.mul(float(2.4).div(r2.mul(r2.sqrt()))));
            }
            v.addAssign(acc.mul(uDt).mul(4));
            v.mulAssign(float(1).sub(uDt.mul(0.3)));
            const s = v.length();
            If(s.greaterThan(9), () => {
              v.mulAssign(float(9).div(s));
            });
            c.assign(mix(vec3(1, 0.5, 0.12), vec3(0.35, 0.85, 1), smoothstep(1, 7, s)));
            L.assign(1);
          })
          .Else(() => {
            const grp = h1.mul(8).floor();
            If(uBurst.greaterThan(0.5).and(grp.equal(uGroup)), () => {
              const z = hash(i.toFloat().add(uSeed)).mul(2).sub(1);
              const a = hash(i.toFloat().add(uSeed).add(31.7)).mul(TAU);
              const rr = float(1).sub(z.mul(z)).max(0).sqrt();
              const dir = vec3(rr.mul(cos(a)), z, rr.mul(a.sin()));
              p.assign(uCenter);
              v.assign(dir.mul(h2.pow(0.15).mul(2.3)).add(vec3(0, 0.4, 0)));
              L.assign(1);
            });
            v.addAssign(vec3(0, -2.2, 0).mul(uDt));
            v.mulAssign(float(1).sub(uDt.mul(0.9)));
            L.assign(L.sub(uDt.mul(0.4)).max(0));
            const base = vec3(0.5).add(vec3(0.5).mul(cos(vec3(0, 0.33, 0.67).add(grp.mul(0.137)).mul(TAU))));
            c.assign(mix(base, vec3(1, 0.95, 0.8), L.pow(8)).mul(L.pow(1.4)).mul(1.6));
          });
        p.addAssign(v.mul(uDt));
        pos.element(i).assign(p);
        vel.element(i).assign(v);
        life.element(i).assign(L);
        col.element(i).assign(c);
      })().compute(N);
      const mat = new GPU.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: GPU.AdditiveBlending });
      mat.positionNode = pos.toAttribute();
      mat.colorNode = col.toAttribute();
      mat.opacityNode = smoothstep(0.5, 0.0, uv().sub(0.5).length()).mul(uAlpha);
      mat.scaleNode = uSize;
      const sprite = new GPU.Sprite(mat);
      sprite.count = N;
      sprite.frustumCulled = false;
      scene.add(sprite);
      renderer.compute(init);
      sys = { N, sprite, mat, update, init };
      uAlpha.value = 0.7 * Math.min(1, Math.pow(60000 / N, 0.6));
    };
    build(Math.min(st.want, cap));
    let burstT = 0;
    let k = 0;
    return {
      scene,
      camera: cam,
      frame(t, dt) {
        const want = Math.min(st.want, cap);
        if (sys && want !== sys.N && performance.now() - st.changedAt > 250) build(want);
        if (!sys) return;
        uDt.value = dt;
        uT.value = t;
        uMode.value = st.mode;
        uSize.value = st.mode === 2 ? 0.035 : 0.04;
        A1.value.set(Math.sin(t * 0.7) * 4, Math.sin(t * 1.1) * 1.5 + 0.5, Math.cos(t * 0.5) * 2.5);
        A2.value.set(Math.sin(t * 0.5 + 2) * 4, Math.cos(t * 0.8) * 1.5 + 0.5, Math.cos(t * 0.9 + 1) * 2.5);
        A3.value.set(Math.cos(t * 0.6 + 4) * 3, Math.sin(t * 0.4 + 3) * 1.2 + 0.5, Math.sin(t * 0.7 + 2) * 2.5);
        uBurst.value = 0;
        if (st.mode === 2) {
          burstT -= dt;
          if (burstT <= 0) {
            burstT = 0.32;
            uBurst.value = 1;
            uGroup.value = k++ % 8;
            uCenter.value.set((Math.random() - 0.5) * 9, 1 + Math.random() * 3, (Math.random() - 0.5) * 4);
            uSeed.value = Math.floor(Math.random() * 100000);
          }
        }
        renderer.compute(sys.update);
        const ang = t * 0.08;
        cam.position.set(Math.sin(ang) * 12.5, 4.2, Math.cos(ang) * 12.5);
        cam.lookAt(0, 0.4, 0);
      },
      dispose() {
        sys?.update.dispose?.();
        sys?.init.dispose?.();
      },
      note: () => {
        const n = sys ? sys.N.toLocaleString('ko-KR') : '-';
        const base = `입자 ${n}개 · ${MODE495[st.mode]} — 매 프레임 GPU 가 위치 · 속도를 계산 (CPU 는 명령 두 줄만 보냄)`;
        return ctx.webgpu ? base : base + '\nWebGL2 대체: 계산 셰이더 대신 변환 피드백이라 최대 8만 개로 줄였어요';
      },
    };
  },
});

/* ═════════ i496 화면 반사 SSR ═════════ */

/** 젖은 판석 바닥 그림: 색 · 거칠기(웅덩이는 매끈) */
function wetFloorCanvases(): { color: HTMLCanvasElement; rough: HTMLCanvasElement } {
  const S = 1024;
  const mk = (): [HTMLCanvasElement, CanvasRenderingContext2D] => {
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    return [c, c.getContext('2d')!];
  };
  const [cc, g] = mk();
  const [rc, r] = mk();
  let seed = 11;
  const rnd = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.fillStyle = '#0d0b0f';
  g.fillRect(0, 0, S, S);
  r.fillStyle = '#e6e6e6';
  r.fillRect(0, 0, S, S);
  const rows = 6;
  const rh = S / rows;
  for (let y = 0; y < rows; y++) {
    let x = -rnd() * 100;
    while (x < S) {
      const w = 120 + rnd() * 120;
      const v = 38 + rnd() * 26;
      const tint = rnd() * 8;
      const gap = 6;
      g.fillStyle = `rgb(${v + tint},${v},${v + tint * 0.6 + 4})`;
      g.beginPath();
      g.roundRect(x + gap, y * rh + gap, w - gap * 2, rh - gap * 2, 10);
      g.fill();
      // 돌결 얼룩
      for (let k = 0; k < 14; k++) {
        g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,240,230'},${0.03 + rnd() * 0.05})`;
        g.beginPath();
        g.ellipse(x + rnd() * w, y * rh + rnd() * rh, 8 + rnd() * 30, 4 + rnd() * 14, rnd() * 3, 0, TAU);
        g.fill();
      }
      const rv = 120 + Math.floor(rnd() * 50);
      r.fillStyle = `rgb(${rv},${rv},${rv})`;
      r.beginPath();
      r.roundRect(x + gap, y * rh + gap, w - gap * 2, rh - gap * 2, 10);
      r.fill();
      x += w;
    }
  }
  // 물웅덩이 — 색은 어둡게, 거칠기는 아주 낮게
  for (let k = 0; k < 9; k++) {
    const px = rnd() * S;
    const py = rnd() * S;
    const rad = 70 + rnd() * 140;
    for (let s = 0; s < 6; s++) {
      const ox = px + (rnd() - 0.5) * rad;
      const oy = py + (rnd() - 0.5) * rad;
      const rr = rad * (0.4 + rnd() * 0.5);
      const gg = r.createRadialGradient(ox, oy, 0, ox, oy, rr);
      gg.addColorStop(0, 'rgba(10,10,10,1)');
      gg.addColorStop(0.7, 'rgba(10,10,10,.9)');
      gg.addColorStop(1, 'rgba(10,10,10,0)');
      r.fillStyle = gg;
      r.fillRect(ox - rr, oy - rr, rr * 2, rr * 2);
      const gc = g.createRadialGradient(ox, oy, 0, ox, oy, rr);
      gc.addColorStop(0, 'rgba(6,6,10,.55)');
      gc.addColorStop(1, 'rgba(6,6,10,0)');
      g.fillStyle = gc;
      g.fillRect(ox - rr, oy - rr, rr * 2, rr * 2);
    }
  }
  return { color: cc, rough: rc };
}

const i496 = gpuDemo<{ on: boolean; intensity: number; dist: number }>({
  caption: '화면에 보이는 횃불 · 기둥을 젖은 던전 바닥에 비추는 화면 반사(SSR) — 켬 / 끔 비교 (크게 보기에서 실제 실행)',
  state: () => ({ on: true, intensity: 1, dist: 12 }),
  card: card496,
  controls: (st, api) => [
    {
      type: 'toggle',
      label: 'SSR 켜기',
      value: true,
      on: (v) => {
        st.on = v;
        (api.ctx() as Any)?.__ssrSet?.();
      },
    },
    { type: 'range', label: '반사 세기', min: 0, max: 1.5, step: 0.05, value: 1, on: (v) => (st.intensity = v) },
    { type: 'range', label: '반사 거리', min: 2, max: 24, step: 0.5, value: 12, on: (v) => (st.dist = v) },
  ],
  async build(ctx, st) {
    const { GPU, TSL, renderer } = ctx;
    const { pass, mrt, output, normalView, directionToColor, colorToDirection, sample, vec2, smoothstep, roughness, blendColor } = TSL;
    const { ssr } = await import('three/examples/jsm/tsl/display/SSRNode.js');
    renderer.toneMapping = GPU.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    const scene = new GPU.Scene();
    scene.background = new GPU.Color(0x050407);
    scene.fog = new GPU.Fog(0x050407, 10, 30);
    const cam = new GPU.PerspectiveCamera(50, ctx.w / ctx.h, 0.1, 60);

    const tex = wetFloorCanvases();
    const cmap = new GPU.CanvasTexture(tex.color);
    cmap.colorSpace = GPU.SRGBColorSpace;
    const rmap = new GPU.CanvasTexture(tex.rough);
    for (const m of [cmap, rmap]) {
      m.wrapS = m.wrapT = GPU.RepeatWrapping;
      m.repeat.set(3, 3);
      m.anisotropy = 8;
    }
    const floorMat = new GPU.MeshStandardNodeMaterial({ map: cmap, roughnessMap: rmap, roughness: 1, metalness: 0 });
    // 반사 표시는 바닥만: 웅덩이(거칠기 낮은 곳)일수록 세게
    floorMat.mrtNode = mrt({ metalrough: vec2(smoothstep(0.5, 0.12, roughness).mul(0.9).add(0.06), roughness) });
    const floor = new GPU.Mesh(new GPU.PlaneGeometry(24, 24), floorMat);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    // 벽: 같은 돌 그림을 세워서
    const wmap = cmap.clone();
    wmap.repeat.set(4, 1.2);
    wmap.needsUpdate = true;
    const wallMat = new GPU.MeshStandardMaterial({ map: wmap, roughness: 0.9, color: 0xc8bcc4 });
    const back = new GPU.Mesh(new GPU.PlaneGeometry(14, 7), wallMat);
    back.position.set(0, 3.5, -9);
    scene.add(back);
    for (const sx of [-1, 1]) {
      const side = new GPU.Mesh(new GPU.PlaneGeometry(24, 7), wallMat);
      side.position.set(sx * 6.5, 3.5, 0);
      side.rotation.y = -sx * Math.PI * 0.5;
      scene.add(side);
    }
    // 안쪽 문: 푸른 빛
    const door = new GPU.Mesh(new GPU.PlaneGeometry(2.2, 3.6), new GPU.MeshBasicMaterial({ color: new GPU.Color(0x3a8cff).multiplyScalar(0.9) }));
    door.position.set(0, 1.8, -8.95);
    scene.add(door);
    const doorL = new GPU.PointLight(0x4a9cff, 14, 12, 2);
    doorL.position.set(0, 2, -8);
    scene.add(doorL);
    // 기둥 · 횃불
    const stone = new GPU.MeshStandardMaterial({ color: 0x6b6170, roughness: 0.85 });
    const colGeo = new GPU.CylinderGeometry(0.42, 0.48, 5, 20);
    const capGeo = new GPU.BoxGeometry(1.25, 0.35, 1.25);
    const flameGeo = new GPU.SphereGeometry(0.14, 16, 12);
    const flameMat = new GPU.MeshBasicMaterial({ color: new GPU.Color(0xffa040).multiplyScalar(4) });
    const brMat = new GPU.MeshStandardMaterial({ color: 0x2a2018, metalness: 0.7, roughness: 0.4 });
    const brGeo = new GPU.BoxGeometry(0.12, 0.12, 0.45);
    const flames: Any[] = [];
    const lights: Any[] = [];
    for (const z of [-6, -2, 2]) {
      for (const sx of [-1, 1]) {
        const x = sx * 3.2;
        const c = new GPU.Mesh(colGeo, stone);
        c.position.set(x, 2.5, z);
        const b = new GPU.Mesh(capGeo, stone);
        b.position.set(x, 0.17, z);
        const tcap = new GPU.Mesh(capGeo, stone);
        tcap.position.set(x, 4.9, z);
        scene.add(c, b, tcap);
        const br = new GPU.Mesh(brGeo, brMat);
        br.position.set(x - sx * 0.62, 2.4, z);
        br.rotation.y = Math.PI / 2;
        const f = new GPU.Mesh(flameGeo, flameMat);
        f.position.set(x - sx * 0.85, 2.62, z);
        f.scale.set(1, 1.6, 1);
        scene.add(br, f);
        flames.push(f);
      }
      const L = new GPU.PointLight(0xff9a48, 15, 12, 2);
      L.position.set(0, 2.6, z);
      lights.push(L);
      scene.add(L);
    }
    // 가운데 떠 있는 수정
    const crystal = new GPU.Mesh(new GPU.OctahedronGeometry(0.45, 0), new GPU.MeshStandardMaterial({ color: 0x66e0ff, emissive: 0x28b8ff, emissiveIntensity: 2.2, roughness: 0.2 }));
    crystal.scale.set(1, 1.7, 1);
    scene.add(crystal);
    const pedestal = new GPU.Mesh(new GPU.CylinderGeometry(0.5, 0.65, 0.8, 8), stone);
    pedestal.position.set(0, 0.4, -3);
    scene.add(pedestal);
    const crL = new GPU.PointLight(0x5ad0ff, 6, 6, 2);
    scene.add(crL, new GPU.AmbientLight(0x4a4060, 1.3));

    // 후처리: 장면 → (색 · 깊이 · 법선 · 금속/거칠기) → SSR → 섞기
    const pipe = new GPU.RenderPipeline(renderer);
    const sp = pass(scene, cam);
    sp.setMRT(mrt({ output, normal: directionToColor(normalView), metalrough: vec2(0, 1) }));
    const col = sp.getTextureNode('output');
    const dep = sp.getTextureNode('depth');
    const nrmT = sp.getTextureNode('normal');
    const mr = sp.getTextureNode('metalrough');
    const nrm = sample((u: Any) => colorToDirection(nrmT.sample(u)));
    const ssrN: Any = ssr(col, dep, nrm, { metalnessNode: mr.r, roughnessNode: mr.g, reflectNonMetals: false, camera: cam });
    ssrN.maxDistance.value = st.dist;
    ssrN.thickness.value = 0.06;
    ssrN.quality.value = 0.5;
    ssrN.resolutionScale = 1;
    const withSSR = blendColor(col, ssrN);
    const setOut = (): void => {
      pipe.outputNode = st.on ? withSSR : col;
      pipe.needsUpdate = true;
    };
    setOut();
    (ctx as Any).__ssrSet = setOut;
    return {
      scene,
      camera: cam,
      frame(t) {
        ssrN.intensity.value = st.intensity;
        ssrN.maxDistance.value = st.dist;
        flames.forEach((f, i) => {
          const k = 0.85 + 0.15 * Math.sin(t * 13 + i * 2.1) * Math.sin(t * 7.3 + i);
          f.scale.set(k, 1.6 * k, k);
        });
        lights.forEach((L, i) => (L.intensity = 15 * (0.85 + 0.15 * Math.sin(t * 11 + i * 1.7))));
        crystal.position.set(0, 1.5 + Math.sin(t * 1.2) * 0.12, -3);
        crystal.rotation.y = t * 0.8;
        crL.position.copy(crystal.position);
        cam.position.set(Math.sin(t * 0.15) * 1.6, 1.25 + Math.sin(t * 0.21) * 0.15, 8.5);
        cam.lookAt(0, 1.4, -4);
      },
      render() {
        pipe.render();
      },
      dispose() {
        pipe.dispose?.();
        wmap.dispose();
        delete (ctx as Any).__ssrSet;
      },
      note: () =>
        (st.on ? 'SSR 켬 — 젖은 웅덩이(거칠기 낮은 곳)에 횃불 · 기둥 · 푸른 문이 비친다' : 'SSR 끔 — 바닥은 빛만 받고 비침이 없다') +
        (ctx.webgpu ? '' : '\nWebGL2 대체: 이 SSR 노드는 WebGL2 백엔드에서 비침이 거의 안 나온다 (WebGPU 에서 보세요)'),
    };
  },
});

/* ═════════ i497 볼류메트릭 빛줄기 ═════════ */

function plankCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const g = c.getContext('2d')!;
  let seed = 5;
  const rnd = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const rows = 8;
  const rh = 512 / rows;
  for (let y = 0; y < rows; y++) {
    let x = -rnd() * 200;
    while (x < 512) {
      const w = 160 + rnd() * 200;
      const v = 70 + rnd() * 30;
      g.fillStyle = `rgb(${v + 20},${v * 0.7},${v * 0.45})`;
      g.fillRect(x, y * rh, w, rh);
      for (let k = 0; k < 10; k++) {
        g.strokeStyle = `rgba(40,22,10,${0.1 + rnd() * 0.15})`;
        g.lineWidth = 1 + rnd() * 2;
        g.beginPath();
        const yy = y * rh + rnd() * rh;
        g.moveTo(x, yy);
        g.bezierCurveTo(x + w * 0.3, yy + (rnd() - 0.5) * 8, x + w * 0.6, yy + (rnd() - 0.5) * 8, x + w, yy);
        g.stroke();
      }
      g.fillStyle = 'rgba(20,10,5,.8)';
      g.fillRect(x, y * rh, 3, rh);
      x += w;
    }
    g.fillStyle = 'rgba(15,8,4,.9)';
    g.fillRect(0, y * rh, 512, 3);
  }
  return c;
}

const i497 = gpuDemo<{ on: boolean; density: number; steps: number; sun: number }>({
  caption: '창으로 들어온 햇빛이 먼지 낀 공기 속에 기둥처럼 보이는 볼류메트릭 빛줄기 (그림자 지도 레이마칭, 반복 16번 이하)',
  state: () => ({ on: true, density: 0.75, steps: 16, sun: 0 }),
  card: card497,
  controls: (st, api) => [
    {
      type: 'toggle',
      label: '빛줄기 켜기',
      value: true,
      on: (v) => {
        st.on = v;
        (api.ctx() as Any)?.__grSet?.();
      },
    },
    { type: 'range', label: '공기 밀도', min: 0.1, max: 1.6, step: 0.05, value: 0.75, on: (v) => (st.density = v) },
    { type: 'range', label: '레이마칭 반복 (최대 16)', min: 4, max: 16, step: 1, value: 16, on: (v) => (st.steps = v) },
    { type: 'range', label: '해 방향', min: -1, max: 1, step: 0.02, value: 0, on: (v) => (st.sun = v) },
  ],
  async build(ctx, st) {
    const { GPU, TSL, renderer } = ctx;
    const { pass, color, instanceIndex, hash, vec3, float, sin, cos, time, smoothstep, uv } = TSL;
    const { godrays } = await import('three/examples/jsm/tsl/display/GodraysNode.js');
    const { bilateralBlur } = await import('three/examples/jsm/tsl/display/BilateralBlurNode.js');
    const { depthAwareBlend } = await import('three/examples/jsm/tsl/display/depthAwareBlend.js');
    renderer.toneMapping = GPU.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    const scene = new GPU.Scene();
    scene.background = new GPU.Color(0x07060a);
    const cam = new GPU.PerspectiveCamera(52, ctx.w / ctx.h, 0.1, 80);

    const wallMat = new GPU.MeshStandardMaterial({ color: 0x6a5f58, roughness: 0.95 });
    const darkMat = new GPU.MeshStandardMaterial({ color: 0x3a2c22, roughness: 0.8 });
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: Any = wallMat): Any => {
      const o = new GPU.Mesh(new GPU.BoxGeometry(w, h, d), m);
      o.position.set(x, y, z);
      o.castShadow = true;
      o.receiveShadow = true;
      scene.add(o);
      return o;
    };
    const ptex = new GPU.CanvasTexture(plankCanvas());
    ptex.colorSpace = GPU.SRGBColorSpace;
    ptex.wrapS = ptex.wrapT = GPU.RepeatWrapping;
    ptex.repeat.set(3, 4);
    ptex.anisotropy = 8;
    const floor = new GPU.Mesh(new GPU.PlaneGeometry(10, 16), new GPU.MeshStandardMaterial({ map: ptex, roughness: 0.75 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    // 왼쪽 벽 — 창 두 개 (z: -4.4~-2.4, 0.4~2.4 / y: 1.6~4.6)
    const WX = -5;
    box(0.4, 1.6, 16, WX, 0.8, 0);
    box(0.4, 1.6, 16, WX, 5.4, 0);
    box(0.4, 3, 3.6, WX, 3.1, -6.2);
    box(0.4, 3, 2.8, WX, 3.1, -1);
    box(0.4, 3, 5.6, WX, 3.1, 5.2);
    for (const zc of [-3.4, 1.4]) {
      box(0.25, 3, 0.12, WX, 3.1, zc, darkMat);
      box(0.25, 0.12, 2, WX, 3.1, zc, darkMat);
      box(0.6, 0.12, 2.2, WX + 0.15, 1.58, zc, darkMat);
    }
    box(10.4, 6.2, 0.4, 0, 3.1, -8);
    box(0.4, 6.2, 16, 5, 3.1, 0);
    box(10.4, 0.4, 16, 0, 6.3, 0);
    // 들보
    for (const z of [-5, -1, 3]) box(10, 0.35, 0.35, 0, 5.9, z, darkMat);
    // 소품: 탁자 · 의자 · 통 · 책장
    box(2.2, 0.12, 1.2, 1, 0.95, -1.2, darkMat);
    for (const [dx, dz] of [
      [-1, -0.5],
      [1, -0.5],
      [-1, 0.5],
      [1, 0.5],
    ] as const)
      box(0.1, 0.9, 0.1, 1 + dx * 0.95, 0.45, -1.2 + dz * 0.95, darkMat);
    box(0.6, 0.08, 0.6, 2.6, 0.55, -1.0, darkMat);
    box(0.6, 0.8, 0.08, 2.6, 0.95, -0.72, darkMat);
    const barrelGeo = new GPU.CylinderGeometry(0.45, 0.45, 1.1, 20);
    const barrelMat = new GPU.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.7 });
    for (const [x, z] of [
      [3.6, -6.4],
      [2.6, -6.6],
      [3.3, -5.4],
    ] as const) {
      const b = new GPU.Mesh(barrelGeo, barrelMat);
      b.position.set(x, 0.55, z);
      b.castShadow = b.receiveShadow = true;
      scene.add(b);
    }
    box(2.4, 3.2, 0.5, -1.6, 1.6, -7.5, darkMat);
    // 바깥 하늘 (창으로 보이는 밝은 빛)
    const sky = new GPU.Mesh(new GPU.PlaneGeometry(30, 14), new GPU.MeshBasicMaterial({ color: new GPU.Color(0xfff0d0).multiplyScalar(2.2) }));
    sky.position.set(-14, 4, 0);
    sky.rotation.y = Math.PI / 2;
    scene.add(sky);

    const sun = new GPU.DirectionalLight(0xffdcae, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -12;
    sc.right = 12;
    sc.top = 12;
    sc.bottom = -12;
    sc.near = 1;
    sc.far = 45;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);
    scene.add(new GPU.HemisphereLight(0x8090b8, 0x3a2a1c, 1.1));
    const bounce = new GPU.PointLight(0xffc890, 12, 11, 2);
    bounce.position.set(0, 0.6, 0);
    scene.add(bounce);

    // 떠도는 먼지 (계산 없이 정점 단계에서 시간으로)
    const dm = new GPU.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: GPU.AdditiveBlending });
    const i = instanceIndex;
    const base = vec3(hash(i).mul(9).sub(4.6), hash(i.add(11)).mul(5.4).add(0.3), hash(i.add(23)).mul(14).sub(7));
    const drift = vec3(
      sin(time.mul(0.3).add(hash(i.add(3)).mul(TAU))).mul(0.35),
      sin(time.mul(0.2).add(hash(i.add(5)).mul(TAU))).mul(0.3),
      cos(time.mul(0.25).add(hash(i.add(7)).mul(TAU))).mul(0.35),
    );
    dm.positionNode = base.add(drift);
    dm.colorNode = color(0xfff0d0);
    dm.opacityNode = smoothstep(0.5, 0.0, uv().sub(0.5).length()).mul(0.14);
    dm.scaleNode = float(0.022);
    const dust = new GPU.Sprite(dm);
    dust.count = 1500;
    dust.frustumCulled = false;
    scene.add(dust);

    const pipe = new GPU.RenderPipeline(renderer);
    const sp = pass(scene, cam);
    const col = sp.getTextureNode('output');
    const dep = sp.getTextureNode('depth');
    const gr: Any = godrays(dep, cam, sun);
    gr.raymarchSteps.value = st.steps;
    gr.density.value = st.density * 7;
    gr.maxDensity.value = 0.7;
    gr.distanceAttenuation.value = 0.6;
    const blur: Any = bilateralBlur(gr.getTextureNode());
    const out = depthAwareBlend(col, blur.getTextureNode(), dep, cam, { blendColor: color(0xffd9a6), edgeRadius: 2, edgeStrength: 2 });
    const setOut = (): void => {
      pipe.outputNode = st.on ? out : col;
      pipe.needsUpdate = true;
    };
    setOut();
    (ctx as Any).__grSet = setOut;
    return {
      scene,
      camera: cam,
      frame(t) {
        gr.raymarchSteps.value = Math.max(1, Math.min(16, Math.round(st.steps)));
        gr.density.value = st.density * 7;
        const z = st.sun * 7 + Math.sin(t * 0.25) * 0.6;
        sun.position.set(-15, 10, z);
        sun.target.position.set(0, 0, z * 0.2);
        bounce.position.set(-0.6, 0.5, z * 0.35 - 1);
        cam.position.set(4.1 + Math.sin(t * 0.17) * 0.4, 2.2 + Math.sin(t * 0.23) * 0.1, 7.2);
        cam.lookAt(-1.6, 2.1, -1.4);
      },
      render() {
        pipe.render();
      },
      dispose() {
        pipe.dispose?.();
        delete (ctx as Any).__grSet;
      },
      note: () => (st.on ? `빛줄기 켬 — 그림자 지도를 따라 ${Math.round(st.steps)}걸음 레이마칭 (창틀 그림자가 빛 기둥을 가른다)` : '빛줄기 끔 — 바닥의 햇빛 자국만 남는다'),
    };
  },
});

/* ═════════ i498 군중 — 뼈 애니메이션을 텍스처에 구워 인스턴스로 (공용 WebGL 렌더러, '3d') ═════════
 * 1) 코드로 만든 블록 캐릭터: SkinnedMesh + Bone 11개, 무릎 · 팔꿈치는 정점 가중치를 두 뼈에 나눠 부드럽게 굽는다.
 * 2) 코드로 만든 클립 셋(걷기 · 뛰기 · 손 흔들기): AnimationClip + QuaternionKeyframeTrack / VectorKeyframeTrack.
 * 3) 굽기: AnimationMixer 로 30fps 마다 자세를 잡고 뼈 행렬(bone.matrixWorld × boneInverse)을
 *    Float DataTexture 한 장에 — 가로 = 뼈 × 4 텍셀(행렬 열 넷), 세로 = 프레임(세 클립을 이어서).
 * 4) 그리기: InstancedMesh 하나(skinIndex/skinWeight 그대로) + onBeforeCompile — 정점 셰이더가
 *    인스턴스 속성 aAnim(vec3 = 클립 번호 · 시작 위상 · 박자)으로 두 프레임을 texelFetch 해 보간 → 스키닝.
 *    그림자도 같은 식(customDepthMaterial). 수천 명이 그리기 1번 + 그림자 1번.
 * 비교: 「SkinnedMesh 로 그렸다면」 = 진짜 SkinnedMesh + AnimationMixer 를 사람마다 (최대 1,000명, 나눠 만듦).
 */
const CROWD_MAX = 5000;
const CROWD_CARD = 1000;
const SKIN_MAX = 1000;
const BAKE_FPS = 30;
const BONE_NAMES = ['hips', 'spine', 'head', 'armUpL', 'armLowL', 'armUpR', 'armLowR', 'legUpL', 'legLowL', 'legUpR', 'legLowR'];
/** 바인드 자세의 뼈 자리 (캐릭터 좌표, 앞 = +Z) · 부모 */
const BONE_POS: [number, number, number][] = [
  [0, 0.5, 0],
  [0, 0.62, 0],
  [0, 0.86, 0],
  [-0.215, 0.84, 0],
  [-0.215, 0.66, 0],
  [0.215, 0.84, 0],
  [0.215, 0.66, 0],
  [-0.08, 0.5, 0],
  [-0.08, 0.27, 0],
  [0.08, 0.5, 0],
  [0.08, 0.27, 0],
];
const BONE_PARENT = [-1, 0, 1, 1, 3, 1, 5, 0, 7, 0, 9];
const CLIP_NAME = ['걷기', '뛰기', '손 흔들기'];
/** 클립 한 바퀴에 나아가는 거리 (걸음 박자를 이동 속력에 맞추는 데 쓴다) */
const CLIP_STRIDE = [1.05, 2.0, 0];

type T3 = typeof import('three');
type Euler3 = [number, number, number];
interface PoseAt {
  rot: Partial<Record<string, Euler3>>;
  hipY: number;
}

/** 블록 캐릭터 모양 — 정점마다 skinIndex/skinWeight(뼈 둘까지) · 색 · aTint(1 옷 · 2 바지 · 3 머리, 인스턴스 색으로 바뀜) */
function crowdGeometry(T: T3): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  type WFn = (y: number) => [number, number, number, number];
  const rigid =
    (b: number): WFn =>
    () => [b, 1, b, 0];
  // 관절: J ± half 사이는 위 뼈 · 아래 뼈를 선형으로 나눠 가진다 (안 나누면 굽힐 때 팔다리가 찢어진다)
  const joint =
    (up: number, low: number, J: number, half: number): WFn =>
    (y) => {
      if (y >= J + half - 1e-4) return [up, 1, low, 0];
      if (y <= J - half + 1e-4) return [low, 1, up, 0];
      const t = (y - (J - half)) / (2 * half);
      return [up, t, low, 1 - t];
    };
  const add = (w: number, h: number, d: number, segH: number, cx: number, y0: number, cz: number, col: number, tint: number, wf: WFn): void => {
    const g = new T.BoxGeometry(w, h, d, 1, segH, 1);
    g.translate(cx, y0 + h / 2, cz);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const n = pos.count;
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    const cc = new Float32Array(n * 3);
    const tn = new Float32Array(n).fill(tint);
    const c = new T.Color(col);
    for (let i = 0; i < n; i++) {
      const [a, wa, b, wb] = wf(pos.getY(i));
      si[i * 4] = a;
      si[i * 4 + 1] = b;
      sw[i * 4] = wa;
      sw[i * 4 + 1] = wb;
      cc[i * 3] = c.r;
      cc[i * 3 + 1] = c.g;
      cc[i * 3 + 2] = c.b;
    }
    g.setAttribute('skinIndex', new T.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new T.Float32BufferAttribute(sw, 4));
    g.setAttribute('color', new T.Float32BufferAttribute(cc, 3));
    g.setAttribute('aTint', new T.Float32BufferAttribute(tn, 1));
    parts.push(g);
  };
  const SKIN = 0xf3c9a2;
  // 몸통 (아래 줄은 엉덩이 뼈) · 골반
  add(0.32, 0.36, 0.2, 3, 0, 0.5, 0, 0xffffff, 1, joint(1, 0, 0.56, 0.06));
  add(0.3, 0.1, 0.19, 1, 0, 0.44, 0, 0xffffff, 2, rigid(0));
  // 다리 (무릎 0.27 에서 반반) · 신발
  for (const [sx, up, low] of [
    [-1, 7, 8],
    [1, 9, 10],
  ] as [number, number, number][]) {
    add(0.13, 0.46, 0.15, 4, sx * 0.08, 0.04, 0, 0xffffff, 2, joint(up, low, 0.27, 0.115));
    add(0.14, 0.06, 0.21, 1, sx * 0.08, 0, 0.025, 0x3a2f2c, 0, rigid(low));
  }
  // 팔 (팔꿈치 0.66 에서 반반) · 손
  for (const [sx, up, low] of [
    [-1, 3, 4],
    [1, 5, 6],
  ] as [number, number, number][]) {
    add(0.09, 0.36, 0.1, 4, sx * 0.215, 0.48, 0, 0xffffff, 1, joint(up, low, 0.66, 0.09));
    add(0.08, 0.07, 0.09, 1, sx * 0.215, 0.42, 0, SKIN, 0, rigid(low));
  }
  // 머리 · 머리카락 · 눈 · 볼
  add(0.28, 0.28, 0.27, 1, 0, 0.86, 0, SKIN, 0, rigid(2));
  add(0.3, 0.08, 0.29, 1, 0, 1.1, -0.005, 0xffffff, 3, rigid(2));
  add(0.3, 0.17, 0.06, 1, 0, 0.95, -0.125, 0xffffff, 3, rigid(2));
  for (const sx of [-1, 1]) {
    add(0.04, 0.06, 0.02, 1, sx * 0.065, 0.97, 0.14, 0x1d1a22, 0, rigid(2));
    add(0.05, 0.025, 0.01, 1, sx * 0.1, 0.925, 0.138, 0xf2938f, 0, rigid(2));
  }
  const geo = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return geo;
}

/** 뼈 계층 + 기준 SkinnedMesh (굽기 · 비교 복제의 원본) */
function crowdRig(T: T3, geo: THREE.BufferGeometry): { mesh: THREE.SkinnedMesh; bones: THREE.Bone[] } {
  const bones = BONE_NAMES.map((n) => {
    const b = new T.Bone();
    b.name = n;
    return b;
  });
  bones.forEach((b, i) => {
    const p = BONE_PARENT[i]!;
    const w = BONE_POS[i]!;
    if (p < 0) b.position.set(w[0], w[1], w[2]);
    else {
      const q = BONE_POS[p]!;
      b.position.set(w[0] - q[0], w[1] - q[1], w[2] - q[2]);
      bones[p]!.add(b);
    }
  });
  const mesh = new T.SkinnedMesh(geo, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));
  mesh.add(bones[0]!);
  mesh.updateMatrixWorld(true);
  mesh.bind(new T.Skeleton(bones));
  return { mesh, bones };
}

/** 자세 함수 → AnimationClip (뼈마다 쿼터니언 트랙 + 엉덩이 높이 트랙, 끝 = 처음이라 이음매 없음) */
function makeClip(T: T3, name: string, dur: number, pose: (p: number) => PoseAt): THREE.AnimationClip {
  const K = 24;
  const times: number[] = [];
  const rot: number[][] = BONE_NAMES.map(() => []);
  const hip: number[] = [];
  const q = new T.Quaternion();
  const e = new T.Euler();
  for (let k = 0; k <= K; k++) {
    times.push((k / K) * dur);
    const P = pose((k / K) * TAU);
    BONE_NAMES.forEach((bn, i) => {
      const r = P.rot[bn] ?? [0, 0, 0];
      q.setFromEuler(e.set(r[0], r[1], r[2]));
      rot[i]!.push(q.x, q.y, q.z, q.w);
    });
    const b0 = BONE_POS[0]!;
    hip.push(b0[0], P.hipY, b0[2]);
  }
  const tracks: THREE.KeyframeTrack[] = BONE_NAMES.map((bn, i) => new T.QuaternionKeyframeTrack(bn + '.quaternion', times, rot[i]!));
  tracks.push(new T.VectorKeyframeTrack('hips.position', times, hip));
  return new T.AnimationClip(name, dur, tracks);
}

function crowdClips(T: T3): THREE.AnimationClip[] {
  const mx = Math.max;
  const walk = makeClip(T, 'walk', 1.0, (p) => {
    const s = Math.sin(p);
    const c = Math.cos(p);
    return {
      rot: {
        hips: [0, -0.1 * s, 0],
        spine: [0.04, 0.12 * s, 0],
        head: [0, -0.06 * s, 0],
        legUpL: [-0.55 * s, 0, 0],
        legUpR: [0.55 * s, 0, 0],
        legLowL: [0.08 + 0.7 * mx(0, c), 0, 0],
        legLowR: [0.08 + 0.7 * mx(0, -c), 0, 0],
        armUpL: [0.45 * s, 0, -0.06],
        armUpR: [-0.45 * s, 0, 0.06],
        armLowL: [-0.2 - 0.25 * mx(0, -s), 0, 0],
        armLowR: [-0.2 - 0.25 * mx(0, s), 0, 0],
      },
      hipY: 0.5 - 0.045 * s * s,
    };
  });
  const run = makeClip(T, 'run', 0.6, (p) => {
    const s = Math.sin(p);
    const c = Math.cos(p);
    return {
      rot: {
        hips: [0, -0.12 * s, 0],
        spine: [0.22, 0.18 * s, 0],
        head: [-0.15, -0.1 * s, 0],
        legUpL: [-0.95 * s, 0, 0],
        legUpR: [0.95 * s, 0, 0],
        legLowL: [0.25 + 1.25 * mx(0, c), 0, 0],
        legLowR: [0.25 + 1.25 * mx(0, -c), 0, 0],
        armUpL: [0.85 * s, 0, -0.1],
        armUpR: [-0.85 * s, 0, 0.1],
        armLowL: [-1.35, 0, 0],
        armLowR: [-1.35, 0, 0],
      },
      hipY: 0.46 + 0.05 * Math.abs(c),
    };
  });
  const wave = makeClip(T, 'wave', 1.2, (p) => {
    const s = Math.sin(p);
    const s2 = Math.sin(2 * p);
    return {
      rot: {
        spine: [0, 0.05 * s, 0.06 + 0.03 * s2],
        head: [-0.06, 0, 0.1 * s],
        armUpR: [-0.15, 0, 2.55 + 0.06 * s],
        armLowR: [0, 0, 0.5 * s2],
        armUpL: [0.05 * s, 0, -0.08],
        armLowL: [-0.15, 0, 0],
        legLowL: [0.05 + 0.05 * (1 - Math.cos(2 * p)), 0, 0],
        legLowR: [0.05 + 0.05 * (1 - Math.cos(2 * p)), 0, 0],
        legUpL: [-0.03 * (1 - Math.cos(2 * p)), 0, -0.02],
        legUpR: [-0.03 * (1 - Math.cos(2 * p)), 0, 0.02],
      },
      hipY: 0.5 - 0.006 * (1 - Math.cos(2 * p)),
    };
  });
  return [walk, run, wave];
}

interface Baked {
  data: Float32Array;
  width: number;
  rows: number;
  /** 클립마다 (시작 줄, 프레임 수, 길이 초) */
  clips: { start: number; frames: number; dur: number }[];
}
/** 굽기: 클립마다 30fps 로 자세를 잡고 뼈 행렬 = bone.matrixWorld × boneInverse 를 한 줄에 */
function bakeBones(T: T3, mesh: THREE.SkinnedMesh, bones: THREE.Bone[], clips: THREE.AnimationClip[]): Baked {
  const nb = bones.length;
  const info = clips.map((c) => ({ start: 0, frames: Math.round(c.duration * BAKE_FPS), dur: c.duration }));
  let rows = 0;
  for (const c of info) {
    c.start = rows;
    rows += c.frames;
  }
  const data = new Float32Array(nb * 4 * rows * 4);
  const mixer = new T.AnimationMixer(mesh);
  const inv = mesh.skeleton.boneInverses;
  const m = new T.Matrix4();
  clips.forEach((clip, k) => {
    const ci = info[k]!;
    mixer.stopAllAction();
    mixer.clipAction(clip).play();
    for (let f = 0; f < ci.frames; f++) {
      mixer.setTime((f / ci.frames) * ci.dur);
      mesh.updateMatrixWorld(true);
      const row = ci.start + f;
      for (let b = 0; b < nb; b++) {
        m.multiplyMatrices(bones[b]!.matrixWorld, inv[b]!);
        data.set(m.elements, (row * nb + b) * 16);
      }
    }
  });
  mixer.stopAllAction();
  mixer.uncacheRoot(mesh);
  // 굽기가 끝나면 기준 캐릭터는 바인드 자세로 (비교 복제가 이 자세에서 시작)
  mesh.skeleton.pose();
  return { data, width: nb * 4, rows, clips: info };
}

const VAT_PARS = /* glsl */ `
uniform highp sampler2D uBones;
uniform vec4 uClip[3];
uniform float uTime;
uniform float uSync;
attribute vec4 skinIndex;
attribute vec4 skinWeight;
attribute vec3 aAnim; // x 클립 번호 · y 시작 위상(0~1) · z 박자 (속성 칸이 16개뿐이라 셋을 한 칸에)
mat4 vatBone(float b, int row) {
  int x = int(b + 0.5) * 4;
  return mat4(texelFetch(uBones, ivec2(x, row), 0), texelFetch(uBones, ivec2(x + 1, row), 0),
              texelFetch(uBones, ivec2(x + 2, row), 0), texelFetch(uBones, ivec2(x + 3, row), 0));
}
`;
// 클립 정보 (x 시작 줄 · y 프레임 수 · z 길이 초) → 지금 프레임 둘과 그 사이 비율 → 두 뼈 행렬을 가중치로
const VAT_SKIN = /* glsl */ `
  vec4 vatClip = uClip[int(aAnim.x + 0.5)];
  float vatF = fract(uTime * mix(aAnim.z, 1.0, uSync) / vatClip.z + aAnim.y * (1.0 - uSync)) * vatClip.y;
  float vatF0 = floor(vatF);
  float vatT = vatF - vatF0;
  int vatR0 = int(vatClip.x + vatF0);
  int vatR1 = int(vatClip.x + mod(vatF0 + 1.0, vatClip.y));
  mat4 vatSkin = skinWeight.x * (vatBone(skinIndex.x, vatR0) * (1.0 - vatT) + vatBone(skinIndex.x, vatR1) * vatT);
  if (skinWeight.y > 0.0) vatSkin += skinWeight.y * (vatBone(skinIndex.y, vatR0) * (1.0 - vatT) + vatBone(skinIndex.y, vatR1) * vatT);
`;
function injectVat(sh: { vertexShader: string; uniforms: Record<string, THREE.IUniform> }, U: Record<string, THREE.IUniform>, color: boolean): void {
  Object.assign(sh.uniforms, U);
  let v = sh.vertexShader
    .replace('#include <common>', '#include <common>\n' + VAT_PARS + (color ? 'attribute float aTint;\nattribute vec3 aShirt;\nattribute vec3 aPants;\nattribute vec3 aHair;\n' : ''))
    .replace('#include <skinbase_vertex>', VAT_SKIN)
    .replace('#include <skinnormal_vertex>', 'objectNormal = (vatSkin * vec4(objectNormal, 0.0)).xyz;')
    .replace('#include <skinning_vertex>', 'transformed = (vatSkin * vec4(transformed, 1.0)).xyz;');
  if (color)
    v = v.replace(
      '#include <color_vertex>',
      '#include <color_vertex>\n  if (aTint > 0.5) vColor.rgb = aTint < 1.5 ? aShirt : (aTint < 2.5 ? aPants : aHair);',
    );
  sh.vertexShader = v;
}

/** 구운 텍스처를 사람이 보는 그림으로 (값 × 0.5 + 0.5 → 색, 텍셀 하나 = 4px) — 한 번만 그린다 */
function bakedPanel(bk: Baked): { canvas: HTMLCanvasElement; ix: number; iy: number; cell: number } {
  const cell = 4;
  const ix = 70;
  const iy = 44;
  const cv = document.createElement('canvas');
  cv.width = ix + bk.width * cell + 14;
  cv.height = iy + bk.rows * cell + 40;
  const g = cv.getContext('2d')!;
  g.fillStyle = 'rgba(8,10,20,.86)';
  g.beginPath();
  g.roundRect(0, 0, cv.width, cv.height, 12);
  g.fill();
  g.fillStyle = '#fff';
  g.font = `800 15px ${FONT}`;
  g.textBaseline = 'middle';
  g.fillText('구운 뼈 텍스처', 12, 16);
  g.fillStyle = '#9fb0e8';
  g.font = `600 11px ${FONT}`;
  g.fillText(`${bk.width} × ${bk.rows} · RGBA32F`, 12, 33);
  const img = g.createImageData(bk.width * cell, bk.rows * cell);
  for (let y = 0; y < bk.rows * cell; y++)
    for (let x = 0; x < bk.width * cell; x++) {
      const k = ((y >> 2) * bk.width + (x >> 2)) * 4;
      const o = (y * bk.width * cell + x) * 4;
      const edge = (x & 15) === 0;
      for (let c = 0; c < 3; c++) img.data[o + c] = Math.max(0, Math.min(255, (bk.data[k + c]! * 0.5 + 0.5) * 255 - (edge ? 40 : 0)));
      img.data[o + 3] = 255;
    }
  g.putImageData(img, ix, iy);
  g.textAlign = 'right';
  bk.clips.forEach((c, i) => {
    const y0 = iy + c.start * cell;
    g.fillStyle = ['#7fd6ff', '#ffb36b', '#c9a3ff'][i]!;
    g.fillRect(ix - 6, y0, 3, c.frames * cell - 1);
    g.font = `700 11px ${FONT}`;
    g.fillText(CLIP_NAME[i]!, ix - 10, y0 + 10);
    g.fillStyle = '#8b97c0';
    g.font = `500 10px ${FONT}`;
    g.fillText(`${c.frames}프레임`, ix - 10, y0 + 24);
  });
  g.textAlign = 'center';
  g.fillStyle = '#8b97c0';
  g.font = `500 10px ${FONT}`;
  g.fillText('↔ 뼈 11개 × 행렬 열 4   ↕ 프레임 (30fps)', ix + (bk.width * cell) / 2, iy + bk.rows * cell + 14);
  g.fillText('흰 선 = 사람 하나가 지금 읽는 줄', ix + (bk.width * cell) / 2, iy + bk.rows * cell + 29);
  return { canvas: cv, ix, iy, cell };
}

/** 광장 바닥 — 돌 판 고리 · 바깥 잔디 */
function plazaCanvas(R: number, plaza: number): HTMLCanvasElement {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const px = S / 2 / R;
  g.fillStyle = '#6f8b4e';
  g.fillRect(0, 0, S, S);
  let sd = 11;
  const rnd = (): number => (sd = (sd * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 5000; i++) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? '40,70,30' : '150,180,90'},${0.12 + rnd() * 0.15})`;
    g.fillRect(rnd() * S, rnd() * S, 3, 3);
  }
  g.save();
  g.translate(S / 2, S / 2);
  g.fillStyle = '#c9b89a';
  g.beginPath();
  g.arc(0, 0, plaza * px, 0, TAU);
  g.fill();
  // 돌 판: 고리마다 조각 수를 둘레에 맞춰
  for (let r = 3.4; r < plaza; r += 1.15) {
    const n = Math.max(8, Math.round((TAU * r) / 1.2));
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * TAU + r;
      const a1 = ((k + 1) / n) * TAU + r;
      const l = 0.74 + rnd() * 0.12;
      g.fillStyle = `rgb(${Math.round(222 * l)},${Math.round(206 * l)},${Math.round(178 * l)})`;
      g.beginPath();
      g.arc(0, 0, (r + 1.09) * px, a0 + 0.012, a1 - 0.012);
      g.arc(0, 0, (r + 0.06) * px, a1 - 0.012, a0 + 0.012, true);
      g.closePath();
      g.fill();
    }
  }
  g.strokeStyle = '#8e7c62';
  g.lineWidth = 0.5 * px;
  g.beginPath();
  g.arc(0, 0, plaza * px, 0, TAU);
  g.stroke();
  g.restore();
  return c;
}

const i498: Demo3D = {
  kind: '3d',
  caption: '뼈 애니메이션(걷기 · 뛰기 · 손 흔들기)을 텍스처 한 장에 구워 두고, 정점 셰이더가 사람마다 다른 프레임을 읽어 스키닝 — 수천 명이 그리기 1번',
  make(T) {
    const tMake = performance.now();
    const st = { count: CROWD_MAX, run: 0.2, wave: 0.15, skin: false, tex: true, sync: false };
    const scene = new T.Scene();
    const SKY = 0xa9cdee;
    scene.background = new T.Color(SKY);
    scene.fog = new T.Fog(SKY, 30, 90);
    const cam = new T.PerspectiveCamera(36, 1.6, 0.5, 260);

    // ── 캐릭터 · 클립 · 굽기 ──
    const baseGeo = crowdGeometry(T);
    const rig = crowdRig(T, baseGeo);
    const clips = crowdClips(T);
    const tBake = performance.now();
    const bk = bakeBones(T, rig.mesh, rig.bones, clips);
    const bakeMs = performance.now() - tBake;
    const boneTex = new T.DataTexture(bk.data, bk.width, bk.rows, T.RGBAFormat, T.FloatType);
    boneTex.minFilter = boneTex.magFilter = T.NearestFilter;
    boneTex.generateMipmaps = false;
    boneTex.needsUpdate = true;
    const U: Record<string, THREE.IUniform> = {
      uBones: { value: boneTex },
      uClip: { value: bk.clips.map((c) => new T.Vector4(c.start, c.frames, c.dur, 0)) },
      uTime: { value: 0 },
      uSync: { value: 0 },
    };

    // ── 사람마다 값 (인스턴스 속성) ──
    const geo = baseGeo.clone();
    // aAnim = (클립 번호, 시작 위상, 박자) — 사람마다 vec3 하나
    const aAnim = new T.InstancedBufferAttribute(new Float32Array(CROWD_MAX * 3), 3);
    const aShirt = new T.InstancedBufferAttribute(new Float32Array(CROWD_MAX * 3), 3);
    const aPants = new T.InstancedBufferAttribute(new Float32Array(CROWD_MAX * 3), 3);
    const aHair = new T.InstancedBufferAttribute(new Float32Array(CROWD_MAX * 3), 3);
    geo.setAttribute('aAnim', aAnim);
    geo.setAttribute('aShirt', aShirt);
    geo.setAttribute('aPants', aPants);
    geo.setAttribute('aHair', aHair);

    let sd = 7;
    const rnd = (): number => (sd = (sd * 16807) % 2147483647) / 2147483647;
    const px = new Float32Array(CROWD_MAX);
    const pz = new Float32Array(CROWD_MAX);
    const hd = new Float32Array(CROWD_MAX);
    const vel = new Float32Array(CROWD_MAX);
    const sc = new Float32Array(CROWD_MAX);
    const mixR = new Float32Array(CROWD_MAX);
    const gait = new Float32Array(CROWD_MAX);
    const wf = new Float32Array(CROWD_MAX);
    const wp = new Float32Array(CROWD_MAX);
    const col = new T.Color();
    const SHIRTS = [0xe8504a, 0x3f7fe0, 0xf2c14e, 0x4cb36a, 0xa063d8, 0xff8a3d, 0x31b5b0, 0xf27fb0, 0xf4f1ea, 0x50607a];
    const PANTS = [0x2b3a5c, 0x3c3c44, 0x5a4636, 0x1f4a3a, 0x6b6f7a, 0x7a3b3b];
    const HAIRS = [0x1d1612, 0x3b2617, 0x6b4223, 0xa86a32, 0xd9b26a, 0x2b2b30];
    const rad = (n: number): number => Math.sqrt((n * 1.1) / Math.PI + 4.2 * 4.2);
    const place = (i: number, R: number): void => {
      const r = Math.sqrt(4.4 * 4.4 + rnd() * (R * R - 4.4 * 4.4));
      const a = rnd() * TAU;
      px[i] = Math.cos(a) * r;
      pz[i] = Math.sin(a) * r;
    };
    for (let i = 0; i < CROWD_MAX; i++) {
      hd[i] = rnd() * TAU;
      sc[i] = 0.9 + rnd() * 0.22;
      mixR[i] = rnd();
      gait[i] = rnd();
      wf[i] = 0.3 + rnd() * 0.5;
      wp[i] = rnd() * TAU;
      aAnim.setY(i, rnd());
      col.setHex(SHIRTS[Math.floor(rnd() * SHIRTS.length)]!).offsetHSL((rnd() - 0.5) * 0.04, 0, (rnd() - 0.5) * 0.1);
      aShirt.setXYZ(i, col.r, col.g, col.b);
      col.setHex(PANTS[Math.floor(rnd() * PANTS.length)]!);
      aPants.setXYZ(i, col.r, col.g, col.b);
      col.setHex(HAIRS[Math.floor(rnd() * HAIRS.length)]!);
      aHair.setXYZ(i, col.r, col.g, col.b);
      place(i, rad(CROWD_CARD));
    }
    let mixKey = '';
    /** 클립 섞기: 사람마다 고정 난수로 클립을 고르고, 이동 속력 ↔ 걸음 박자를 맞춘다 */
    const assignClips = (): void => {
      const key = st.run.toFixed(2) + '/' + st.wave.toFixed(2);
      if (key === mixKey) return;
      mixKey = key;
      const tot = Math.max(1, st.run + st.wave);
      const pr = st.run / tot;
      const pw = st.wave / tot;
      for (let i = 0; i < CROWD_MAX; i++) {
        const r = mixR[i]!;
        const k = r < pr ? 1 : r < pr + pw ? 2 : 0;
        aAnim.setX(i, k);
        const g = gait[i]!;
        if (k === 0) {
          vel[i] = (0.8 + g * 0.4) * sc[i]!;
          aAnim.setZ(i, (vel[i]! / CLIP_STRIDE[0]!) * bk.clips[0]!.dur);
        } else if (k === 1) {
          vel[i] = (2.5 + g * 0.9) * sc[i]!;
          aAnim.setZ(i, (vel[i]! / CLIP_STRIDE[1]!) * bk.clips[1]!.dur);
        } else {
          vel[i] = 0;
          aAnim.setZ(i, 0.8 + g * 0.4);
        }
      }
      aAnim.needsUpdate = true;
      for (const p of pool) p.clip = -1;
    };

    // ── 재질: 보통 MeshStandardMaterial + 정점 셰이더에 구운 스키닝을 끼움 ──
    const mat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.72 });
    mat.onBeforeCompile = (sh) => injectVat(sh, U, true);
    mat.customProgramCacheKey = () => 'i498-vat-color';
    const depth = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking });
    depth.onBeforeCompile = (sh) => injectVat(sh, U, false);
    depth.customProgramCacheKey = () => 'i498-vat-depth';
    const crowd = new T.InstancedMesh(geo, mat, CROWD_MAX);
    crowd.customDepthMaterial = depth;
    crowd.instanceMatrix.setUsage(T.DynamicDrawUsage);
    crowd.frustumCulled = false; // 자리 · 자세가 셰이더에서 바뀌어 경계 구가 틀린다
    crowd.castShadow = true;
    crowd.receiveShadow = true;
    scene.add(crowd);

    // ── 비교: 진짜 SkinnedMesh + AnimationMixer 를 사람마다 ──
    const variants = SHIRTS.slice(0, 6).map((sh, k) => {
      const g2 = baseGeo.clone();
      const c = g2.attributes.color as THREE.BufferAttribute;
      const tn = g2.attributes.aTint as THREE.BufferAttribute;
      const cs = new T.Color(sh);
      const cp = new T.Color(PANTS[k % PANTS.length]!);
      const ch = new T.Color(HAIRS[k % HAIRS.length]!);
      for (let i = 0; i < c.count; i++) {
        const t = tn.getX(i);
        const cc = t === 1 ? cs : t === 2 ? cp : t === 3 ? ch : null;
        if (cc) c.setXYZ(i, cc.r, cc.g, cc.b);
      }
      return g2;
    });
    const skinMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.72 });
    const skinGroup = new T.Group();
    skinGroup.visible = false;
    scene.add(skinGroup);
    const pool: { root: THREE.SkinnedMesh; mixer: THREE.AnimationMixer; clip: number }[] = [];
    const growPool = (want: number): void => {
      const t0 = performance.now();
      while (pool.length < want && performance.now() - t0 < 4) {
        const i = pool.length;
        const root = skelClone(rig.mesh) as THREE.SkinnedMesh;
        root.geometry = variants[i % variants.length]!;
        root.material = skinMat;
        root.castShadow = true;
        root.receiveShadow = true;
        skinGroup.add(root);
        pool.push({ root, mixer: new T.AnimationMixer(root), clip: -1 });
      }
    };

    // ── 광장 ──
    const PLAZA = rad(CROWD_MAX) + 3;
    const GROUND = PLAZA + 26;
    const gtex = new T.CanvasTexture(plazaCanvas(GROUND, PLAZA));
    gtex.colorSpace = T.SRGBColorSpace;
    gtex.anisotropy = 8;
    const ground = new T.Mesh(new T.CircleGeometry(GROUND, 96), new T.MeshStandardMaterial({ map: gtex, roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const stone = new T.MeshStandardMaterial({ color: 0xe6dccb, roughness: 0.7 });
    const basin = new T.Mesh(new T.CylinderGeometry(3.6, 3.8, 0.55, 48), stone);
    basin.position.y = 0.27;
    const water = new T.Mesh(new T.CylinderGeometry(3.3, 3.3, 0.05, 48), new T.MeshStandardMaterial({ color: 0x5fb3d9, roughness: 0.15, metalness: 0.1 }));
    water.position.y = 0.48;
    const tower = new T.Mesh(new T.CylinderGeometry(0.55, 0.9, 5.4, 12), stone);
    tower.position.y = 3;
    const top = new T.Mesh(new T.ConeGeometry(1.0, 1.5, 12), new T.MeshStandardMaterial({ color: 0xd2523f, roughness: 0.5 }));
    top.position.y = 6.45;
    for (const o of [basin, tower, top]) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
    scene.add(basin, water, tower, top);
    // 둘레 나무 (인스턴스 둘 — 줄기 · 잎)
    const NT = 70;
    const trunk = new T.InstancedMesh(new T.CylinderGeometry(0.18, 0.25, 1.6, 6), new T.MeshStandardMaterial({ color: 0x7a5236, roughness: 0.9 }), NT);
    const leaf = new T.InstancedMesh(new T.IcosahedronGeometry(1.5, 1), new T.MeshStandardMaterial({ color: 0x4f8f3e, roughness: 0.85, flatShading: true }), NT);
    const om = new T.Object3D();
    for (let k = 0; k < NT; k++) {
      const a = (k / NT) * TAU;
      const r = PLAZA + 3 + (k % 2) * 2.2;
      const s = 0.85 + rnd() * 0.45;
      om.position.set(Math.cos(a) * r, 0.8 * s, Math.sin(a) * r);
      om.scale.setScalar(s);
      om.updateMatrix();
      trunk.setMatrixAt(k, om.matrix);
      om.position.y = 2.3 * s;
      om.scale.set(s, s * 1.15, s);
      om.updateMatrix();
      leaf.setMatrixAt(k, om.matrix);
    }
    trunk.castShadow = leaf.castShadow = true;
    scene.add(trunk, leaf);

    const sun = new T.DirectionalLight(0xfff1d6, 2.5);
    sun.position.set(26, 42, 16);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 140;
    scene.add(sun, sun.target, new T.HemisphereLight(0xdfeeff, 0x6b5a45, 1.15));

    // ── 화면 위 층 (HUD · 구운 텍스처) ──
    const ui = new T.Scene();
    const uiCam = new T.OrthographicCamera(0, 1, 1, 0, -1, 1);
    const hudCv = document.createElement('canvas');
    hudCv.width = 620;
    hudCv.height = 150;
    const hudTex = new T.CanvasTexture(hudCv);
    hudTex.colorSpace = T.SRGBColorSpace;
    const uiMat = (map: THREE.Texture | null, color = 0xffffff, opacity = 1): THREE.MeshBasicMaterial =>
      new T.MeshBasicMaterial({ map, color, transparent: true, opacity, depthTest: false, depthWrite: false, toneMapped: false });
    const hud = new T.Mesh(new T.PlaneGeometry(1, 1), uiMat(hudTex));
    const pnl = bakedPanel(bk);
    const pnlTex = new T.CanvasTexture(pnl.canvas);
    pnlTex.colorSpace = T.SRGBColorSpace;
    pnlTex.minFilter = T.LinearFilter;
    pnlTex.generateMipmaps = false;
    const panel = new T.Mesh(new T.PlaneGeometry(1, 1), uiMat(pnlTex));
    const marker = new T.Mesh(new T.PlaneGeometry(1, 1), uiMat(null, 0xffffff, 0.95));
    ui.add(hud, panel, marker);

    let card = true;
    let n = CROWD_CARD;
    let tt = 0;
    let lastN = CROWD_CARD;
    let fps = 0;
    let fpsAcc = 0;
    let fpsN = 0;
    let lastRender = 0;
    let calls = 0;
    let cpuMs = 0;
    let hudT = 1;
    const makeMs = performance.now() - tMake;
    assignClips();

    const drawHud = (): void => {
      const g = hudCv.getContext('2d')!;
      g.clearRect(0, 0, hudCv.width, hudCv.height);
      g.fillStyle = 'rgba(8,10,20,.74)';
      g.beginPath();
      g.roundRect(0, 0, hudCv.width, hudCv.height, 14);
      g.fill();
      g.textBaseline = 'middle';
      const shown = st.skin ? Math.min(n, pool.length) : n;
      g.fillStyle = st.skin ? '#ffb36b' : '#8ff0b4';
      g.font = `800 30px ${FONT}`;
      g.fillText(`${shown.toLocaleString('ko-KR')}명 · 그리기 ${calls.toLocaleString('ko-KR')}번`, 18, 34);
      g.font = `600 19px ${FONT}`;
      g.fillStyle = '#e8ecff';
      g.fillText(st.skin ? 'SkinnedMesh + AnimationMixer 를 사람마다 — 몸 · 그림자 따로따로 (비교)' : `군중 = InstancedMesh 하나 → 몸 1번 + 그림자 1번 (나머지 ${Math.max(0, calls - 2)}번은 광장)`, 18, 76);
      g.fillStyle = '#9fb0e8';
      g.font = `500 17px ${MONO}`;
      const extra = st.skin && pool.length < Math.min(n, SKIN_MAX) ? ` · 만드는 중 ${pool.length}/${Math.min(n, SKIN_MAX)}` : st.skin && n > SKIN_MAX ? ' · 최대 1,000명' : '';
      g.fillText(card ? `처음 만들기 ${makeMs.toFixed(0)} ms (굽기 ${bakeMs.toFixed(1)} ms)` : `${fps.toFixed(0)} fps · CPU ${cpuMs.toFixed(2)} ms · 처음 만들기 ${makeMs.toFixed(0)} ms${extra}`, 18, 116);
      hudTex.needsUpdate = true;
    };

    const controls: Control[] = [
      { type: 'range', label: '인원', min: 200, max: CROWD_MAX, step: 100, value: CROWD_MAX, on: (v) => (st.count = v) },
      { type: 'range', label: '뛰기 비율', min: 0, max: 1, step: 0.05, value: st.run, on: (v) => (st.run = v) },
      { type: 'range', label: '손 흔들기 비율', min: 0, max: 1, step: 0.05, value: st.wave, on: (v) => (st.wave = v) },
      { type: 'toggle', label: 'SkinnedMesh 로 그렸다면 (비교, 최대 1,000명)', value: false, on: (v) => (st.skin = v) },
      { type: 'toggle', label: '구운 텍스처 보기', value: true, on: (v) => (st.tex = v) },
      { type: 'toggle', label: '박자 모두 똑같이 (비교)', value: false, on: (v) => (st.sync = v) },
    ];

    return {
      scene,
      camera: cam,
      controls,
      resize(w) {
        card = w / Math.min(devicePixelRatio, 2) < 500;
      },
      update(t, dt) {
        const t0 = performance.now();
        n = card ? Math.min(st.count, CROWD_CARD) : Math.round(st.count);
        const R = rad(n);
        if (n > lastN) for (let i = lastN; i < n; i++) place(i, R);
        lastN = n;
        assignClips();
        tt += dt;
        U.uTime!.value = tt;
        U.uSync!.value = st.sync ? 1 : 0;
        // 걷기: 천천히 방향이 흔들리고, 광장 밖 · 분수 안쪽으로 가면 돌아선다
        const arr = crowd.instanceMatrix.array as Float32Array;
        for (let i = 0; i < n; i++) {
          const v = vel[i]!;
          let h = hd[i]!;
          const x = px[i]!;
          const z = pz[i]!;
          if (v > 0) {
            h += dt * Math.sin(tt * wf[i]! + wp[i]!) * 0.35;
            const d2 = x * x + z * z;
            const out = d2 > R * R;
            if (out || d2 < 4.6 * 4.6) {
              let diff = Math.atan2(out ? -x : x, out ? -z : z) - h;
              diff = Math.atan2(Math.sin(diff), Math.cos(diff));
              const turn = (v > 2 ? 2.2 : 1.4) * dt;
              h += Math.max(-turn, Math.min(turn, diff));
            }
            hd[i] = h;
            px[i] = x + Math.sin(h) * v * dt;
            pz[i] = z + Math.cos(h) * v * dt;
          }
          const s = sc[i]!;
          const cs = Math.cos(h) * s;
          const sn = Math.sin(h) * s;
          const o = i * 16;
          arr[o] = cs;
          arr[o + 1] = 0;
          arr[o + 2] = -sn;
          arr[o + 3] = 0;
          arr[o + 4] = 0;
          arr[o + 5] = s;
          arr[o + 6] = 0;
          arr[o + 7] = 0;
          arr[o + 8] = sn;
          arr[o + 9] = 0;
          arr[o + 10] = cs;
          arr[o + 11] = 0;
          arr[o + 12] = px[i]!;
          arr[o + 13] = 0;
          arr[o + 14] = pz[i]!;
          arr[o + 15] = 1;
        }
        crowd.count = n;
        crowd.instanceMatrix.clearUpdateRanges();
        crowd.instanceMatrix.addUpdateRange(0, n * 16);
        crowd.instanceMatrix.needsUpdate = true;
        crowd.visible = !st.skin;
        skinGroup.visible = st.skin;
        if (st.skin) {
          const want = Math.min(n, SKIN_MAX);
          growPool(want);
          for (let i = 0; i < pool.length; i++) {
            const p = pool[i]!;
            p.root.visible = i < want;
            if (i >= want) continue;
            const k = Math.round(aAnim.getX(i));
            if (p.clip !== k) {
              p.mixer.stopAllAction();
              const a = p.mixer.clipAction(clips[k]!);
              a.play();
              a.time = aAnim.getY(i) * clips[k]!.duration;
              a.timeScale = aAnim.getZ(i);
              p.clip = k;
            }
            p.mixer.update(dt);
            p.root.position.set(px[i]!, 0, pz[i]!);
            p.root.rotation.y = hd[i]!;
            p.root.scale.setScalar(sc[i]!);
          }
        }
        // 광장 크기에 맞춘 카메라 · 그림자 범위
        const a = t * 0.045 + 0.6;
        const dist = R * 0.95 + 7;
        cam.position.set(Math.sin(a) * dist, R * 0.42 + 3.5, Math.cos(a) * dist);
        cam.lookAt(0, 0.4, 0);
        (scene.fog as THREE.Fog).near = dist * 0.9;
        (scene.fog as THREE.Fog).far = dist * 2.6 + 20;
        const sc2 = sun.shadow.camera;
        const ext = R + 6;
        if (sc2.right !== ext) {
          sc2.left = -ext;
          sc2.right = ext;
          sc2.top = ext;
          sc2.bottom = -ext;
          sc2.updateProjectionMatrix();
        }
        cpuMs = cpuMs * 0.9 + (performance.now() - t0) * 0.1;
        hudT += dt;
      },
      render(renderer, w, h) {
        const now = performance.now();
        if (lastRender) {
          fpsAcc += (now - lastRender) / 1000;
          fpsN++;
          if (fpsAcc > 0.5) {
            fps = fpsN / fpsAcc;
            fpsAcc = 0;
            fpsN = 0;
          }
        }
        lastRender = now;
        renderer.render(scene, cam);
        calls = renderer.info.render.calls; // 그림자 그리기까지 든 값 (render 시작에 0 으로)
        if (hudT > 0.25) {
          hudT = 0;
          drawHud();
        }
        // 화면 위 층: 픽셀 좌표 (왼쪽 아래 0,0)
        uiCam.right = w;
        uiCam.top = h;
        uiCam.updateProjectionMatrix();
        const k = Math.max(0.42, Math.min(1.6, h / 760));
        const hw = hudCv.width * k * (card ? 0.95 : 0.85);
        const hh = hudCv.height * (hw / hudCv.width);
        const m = 12 * k;
        hud.scale.set(hw, hh, 1);
        hud.position.set(m + hw / 2, h - m - hh / 2, 0);
        const showTex = st.tex && !card;
        panel.visible = marker.visible = showTex;
        if (showTex) {
          const ps = Math.min((h - 2 * m) / pnl.canvas.height, 1.5 * k);
          const pw = pnl.canvas.width * ps;
          const ph = pnl.canvas.height * ps;
          const x0 = w - m - pw;
          const y0 = h - m - ph;
          panel.scale.set(pw, ph, 1);
          panel.position.set(x0 + pw / 2, y0 + ph / 2, 0);
          // 사람 0번이 지금 읽는 줄 (셰이더와 같은 식)
          const ci = bk.clips[Math.round(aAnim.getX(0))]!;
          const sp = st.sync ? 1 : aAnim.getZ(0);
          const ph0 = st.sync ? 0 : aAnim.getY(0);
          const f = (((tt * sp) / ci.dur + ph0) % 1) * ci.frames;
          const row = ci.start + Math.floor(f);
          marker.scale.set(bk.width * pnl.cell * ps + 8 * ps, Math.max(1.5, 1.6 * ps), 1);
          marker.position.set(x0 + (pnl.ix + (bk.width * pnl.cell) / 2) * ps, y0 + ph - (pnl.iy + (row + 0.5) * pnl.cell) * ps, 0);
        }
        renderer.autoClear = false;
        renderer.clearDepth();
        renderer.render(ui, uiCam);
        renderer.autoClear = true;
      },
      dispose() {
        for (const p of pool) {
          p.mixer.stopAllAction();
          p.mixer.uncacheRoot(p.root);
          p.root.skeleton.dispose();
        }
        rig.mesh.skeleton.dispose();
        for (const o of [baseGeo, geo, ...variants]) o.dispose();
        for (const mm of [mat, depth, skinMat, rig.mesh.material as THREE.Material]) mm.dispose();
        for (const tx of [boneTex, gtex, hudTex, pnlTex]) tx.dispose();
        scene.traverse((o) => {
          const me = o as THREE.Mesh;
          if (me.isMesh && me !== crowd && !(o as THREE.SkinnedMesh).isSkinnedMesh) {
            me.geometry.dispose();
            (me.material as THREE.Material).dispose();
          }
        });
        for (const o of [hud, panel, marker]) {
          o.geometry.dispose();
          o.material.dispose();
        }
        crowd.dispose();
        trunk.dispose();
        leaf.dispose();
      },
    };
  },
};

export const DEMOS: DemoMap = { i493, i494, i495, i496, i497, i498 };

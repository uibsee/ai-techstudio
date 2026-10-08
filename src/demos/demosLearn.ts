import type { Control, DemoDom, DemoMap } from './types';

/**
 * 배움 · 피드백 견본 (i396 ~ i407) — 작은 실제 수학 상황으로 학습 장치를 보여 준다.
 *  - 모두 'dom' 꼴: 16:10 무대(.stage) 안에 SVG(viewBox 320×200) + 필요하면 캔버스 · HTML 층.
 *  - 카드에서는 시나리오가 저절로 흘러가며 되풀이, 큰 화면(폭 480 이상)에서는 아래 판(.panel)이 나타나
 *    직접 답을 넣고 · 누르고 · 끌어 볼 수 있다. 직접 손대면 자동 시연은 멈추고, 「자동 시연」 단추로 되돌린다.
 */

const F = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
let uid = 0;

const clamp = (v: number, a = 0, b = 1): number => (v < a ? a : v > b ? b : v);
const sm = (v: number): number => {
  const x = clamp(v);
  return x * x * (3 - 2 * x);
};
const seg = (t: number, a: number, b: number): number => clamp((t - a) / (b - a));
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const backOut = (v: number): number => {
  const x = clamp(v) - 1;
  const c = 1.9;
  return 1 + (c + 1) * x * x * x + c * x * x;
};
function rng(seed: number): () => number {
  let s = (Math.abs(Math.floor(seed * 7919 + 104729)) % 2147483646) + 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ───────── 아이콘 (선 아이콘) ───────── */
const ICON: Record<string, string> = {
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  prev: '<path d="M17.5 6l-8 6 8 6M6.5 6v12"/>',
  next: '<path d="M6.5 6l8 6-8 6M17.5 6v12"/>',
  bulb: '<path d="M9.5 18h5M10.5 21h3M12 3a6 6 0 0 0-3.6 10.8c.8.6 1.1 1.4 1.1 2.2h5c0-.8.3-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  redo: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  xc: '<circle cx="12" cy="12" r="8.5"/><path d="M9 9l6 6M15 9l-6 6"/>',
  bolt: '<path d="M13 3L5.5 13.5H12L11 21l7.5-10.5H12z"/>',
  flag: '<path d="M6 21V4M6 4.5h11l-2.5 4 2.5 4H6"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8-4.3-4.1 5.9-.8z"/>',
  warn: '<path d="M12 4l9 15.5H3z"/><path d="M12 10v4.2M12 17v.1"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".6"/>',
  swap: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
};
const ic = (n: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICON[n] ?? ''}</svg>`;
/** SVG 장면 안 아이콘 (x, y 왼쪽 위, 크기 s) — 색은 class 의 stroke 로 */
const sic = (n: string, x: number, y: number, s: number, cls = ''): string =>
  `<g class="${cls}" transform="translate(${x} ${y}) scale(${(s / 24).toFixed(4)})" fill="none" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${ICON[n] ?? ''}</g>`;

function starPts(cx: number, cy: number, R: number, r = R * 0.47): string {
  const p: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r : R;
    p.push(`${(cx + Math.cos(a) * rr).toFixed(2)},${(cy + Math.sin(a) * rr).toFixed(2)}`);
  }
  return p.join(' ');
}

/** 가리키는 손가락 (손끝이 0,0) */
const HAND = `<g transform="rotate(-16)">
  <path d="M-4 3C-4-1.5 4-1.5 4 3L4 15C6 13 10 13.5 10.5 16.5C12.5 15 16 16 16 19C18 18.5 20.5 20 20 23L19 31C18 36 13 39 7 39L1 39C-4 39-8 35-9 30L-12.5 22C-13.5 19-9.5 17.5-8 20L-4 24Z" fill="#fffaf2" stroke="#2a1a10" stroke-width="1.8" stroke-linejoin="round"/>
  <path d="M4 15.5L4.4 21.5M10.5 17L10.4 22.5M16 19.5L15.8 23.5" stroke="#2a1a10" stroke-width="1.2" stroke-linecap="round" fill="none" opacity=".55"/>
  <path d="M-1.5 2.2C-1.2 0.6 1.2 0.6 1.5 2.2" stroke="#e8cdb0" stroke-width="1.4" fill="none" stroke-linecap="round"/>
  <rect x="-2" y="38" width="17" height="7" rx="2.5" fill="#ff9b42" stroke="#2a1a10" stroke-width="1.6"/>
</g>`;
/** 화살표 커서 (끝이 0,0) */
const CURSOR = `<path d="M0 0L0 17L4.5 13L7.5 20L10.5 18.7L7.5 12L13 12Z" fill="#fff" stroke="#1a1010" stroke-width="1.4" stroke-linejoin="round"/>`;

/* ───────── 공통 틀 ───────── */
function defs(id: string): string {
  return `<filter id="${id}sh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="2.5" stdDeviation="2.4" flood-color="#000" flood-opacity=".5"/></filter>
  <filter id="${id}gl" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <pattern id="${id}gp" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="#d8c39c" stroke-width=".55"/></pattern>
  <linearGradient id="${id}pp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#f3e4c6"/></linearGradient>
  <linearGradient id="${id}or" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffbf6e"/><stop offset="1" stop-color="#f07a2a"/></linearGradient>`;
}

const BASE = `
.lf{position:absolute;inset:0;overflow:hidden;font-family:${F};color:#fff4e4;user-select:none;-webkit-user-select:none;pointer-events:none;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  background:radial-gradient(130% 110% at 50% -10%,#4a3324 0%,#2a1c14 55%,#170f0b 100%)}
.lf.big{pointer-events:auto}
.lf .stage{position:relative;flex:none;width:min(100cqw,160cqh);aspect-ratio:16/10;container-type:size}
.lf.big .stage{width:min(100cqw,calc((100cqh - 18cqmin) * 1.6))}
.lf svg.sc{position:absolute;inset:0;width:100%;height:100%;display:block;overflow:visible}
.lf svg text{font-family:${F}}
.lf canvas.cv{position:absolute;inset:0;width:100%;height:100%;display:block}
.lf .panel{display:none;flex:none;height:16cqmin;width:100%;align-items:center;justify-content:center;gap:1.5cqmin;padding:0 3cqmin;box-sizing:border-box}
.lf.big .panel{display:flex}
.lf .btn{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:1.1cqmin;height:8.6cqmin;padding:0 2.8cqmin;border-radius:99px;white-space:nowrap;
  background:linear-gradient(#ffbf6e,#f07a2a);color:#2a1406;font-weight:900;font-size:3.3cqmin;box-shadow:0 .7cqmin 0 #a24a16,0 1.4cqmin 2cqmin #0008}
.lf .btn:active{transform:translateY(.5cqmin);box-shadow:0 .2cqmin 0 #a24a16}
.lf .btn.ghost{background:#ffffff12;color:#ffe6c4;box-shadow:inset 0 0 0 .3cqmin #ffd9a055}
.lf .btn.mint{background:linear-gradient(#7ef0be,#2fb57e);color:#062a1a;box-shadow:0 .7cqmin 0 #1c7a52,0 1.4cqmin 2cqmin #0008}
.lf .btn svg{width:4cqmin;height:4cqmin;flex:none}
.lf .btn.on{background:linear-gradient(#ffe08a,#ffb648)}
.lf input.ans{all:unset;box-sizing:border-box;height:8.6cqmin;width:24cqmin;padding:0 2cqmin;border-radius:2cqmin;background:#fffaf0;color:#3b2a1e;
  font-weight:900;font-size:4.4cqmin;text-align:center;box-shadow:inset 0 .5cqmin 0 #0002,0 0 0 .45cqmin #ffb25e;cursor:text}
.lf input.ans:focus{box-shadow:inset 0 .5cqmin 0 #0002,0 0 0 .6cqmin #ffd166,0 0 3cqmin #ffb25e88}
.lf .lab{font-weight:900;font-size:4cqmin;color:#ffe6c4;white-space:nowrap}
.lf .lab:empty{display:none}
.lf .sep{width:.3cqmin;height:7cqmin;background:#ffffff22;margin:0 .6cqmin}
`;

interface Rig {
  id: string;
  root: HTMLElement;
  stage: HTMLElement;
  svg: SVGSVGElement | null;
  panel: HTMLElement | null;
  /** 큰 화면이면 true (.big 붙이고 떼기) */
  sync(): boolean;
  dispose(): void;
}
function rig(box: HTMLElement, cls: string, o: { css?: string; svg?: (id: string) => string; over?: string; panel?: string }): Rig {
  const id = `lf${++uid}`;
  const outer = document.createElement('div');
  outer.style.cssText = 'position:absolute;inset:0;overflow:hidden;container-type:size';
  const root = document.createElement('div');
  root.className = `lf ${cls}`;
  root.innerHTML = `<style>${BASE}${o.css ?? ''}</style><div class="stage">${
    o.svg ? `<svg class="sc" viewBox="0 0 320 200" preserveAspectRatio="xMidYMid meet"><defs>${defs(id)}</defs>${o.svg(id)}</svg>` : ''
  }${o.over ?? ''}</div>${o.panel ? `<div class="panel">${o.panel}</div>` : ''}`;
  outer.appendChild(root);
  box.appendChild(outer);
  let was = false;
  return {
    id,
    root,
    stage: root.querySelector('.stage') as HTMLElement,
    svg: root.querySelector('svg.sc') as SVGSVGElement | null,
    panel: root.querySelector('.panel') as HTMLElement | null,
    sync() {
      const b = box.clientWidth >= 480;
      if (b !== was) {
        was = b;
        root.classList.toggle('big', b);
      }
      return b;
    },
    dispose() {
      outer.remove();
    },
  };
}
const q = <T extends Element = SVGElement>(root: Element, sel: string): T => root.querySelector(sel) as T;
const qa = <T extends Element = SVGElement>(root: Element, sel: string): T[] => Array.from(root.querySelectorAll(sel)) as T[];
function svgPt(svg: SVGSVGElement, e: PointerEvent | MouseEvent): { x: number; y: number } {
  const m = svg.getScreenCTM();
  if (!m) return { x: 0, y: 0 };
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}
const show = (el: Element, on: boolean, op = 1): void => {
  (el as SVGElement).style.opacity = on ? String(op) : '0';
};
const tr = (el: Element, s: string): void => {
  el.setAttribute('transform', s);
};
/** 캔버스를 무대 크기 · 화면 밀도에 맞추고 viewBox(320×200) 좌표로 그리게 한다 */
function fitCanvas(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = c.getContext('2d')!;
  const w = c.clientWidth || 280;
  const h = c.clientHeight || 175;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const W = Math.round(w * dpr);
  const H = Math.round(h * dpr);
  if (c.width !== W || c.height !== H) {
    c.width = W;
    c.height = H;
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.shadowBlur = 0;
  g.clearRect(0, 0, W, H);
  g.setTransform((W / 320), 0, 0, H / 200, 0, 0);
  return g;
}
function ctext(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center', weight = 800): void {
  g.font = `${weight} ${size}px ${F}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(s, x, y);
}
function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, Math.max(0, w), Math.max(0, h), Math.max(0, Math.min(r, w / 2, h / 2)));
}
/** 자동 시연 ↔ 직접 해 보기 */
function autoCtl(onReset: () => void): { manual: boolean; base: number; ctl: Control } {
  const s = {
    manual: false,
    base: -1,
    ctl: {
      type: 'button',
      label: '자동 시연 다시',
      on: () => {
        s.manual = false;
        s.base = -1;
        onReset();
      },
    } as Control,
  };
  return s;
}

/* ═════════════════════ i396 단계 힌트 ═════════════════════ */
const i396: DemoDom = {
  kind: 'dom',
  caption: '힌트를 누를수록 더 크게 — ① 볼 줄 → ② 칸 → ③ 정답, 하나 쓸 때마다 별이 하나씩 줄어요',
  make(box) {
    const SQ = [2, 7, 6, 9, 5, 1, 4, 3, 8];
    const HOLES = [0, 5, 7];
    const X0 = 28;
    const Y0 = 38;
    const CS = 40;
    const GP = 4;
    const cx = (i: number): number => X0 + (i % 3) * (CS + GP);
    const cy = (i: number): number => Y0 + Math.floor(i / 3) * (CS + GP);
    const COST = [10, 20, 40];
    const R = rig(box, 'h396', {
      css: `
.h396 .cb{fill:#fffaf0;stroke:#e9d6b0;stroke-width:1.2}
.h396 .cell.hole .cb{fill:#f1dfbd;stroke:#c49a62;stroke-width:1.4;stroke-dasharray:3.5 3}
.h396 .cell.done .cb{fill:#d9f6e4;stroke:#3fbf83;stroke-dasharray:none}
.h396 .cell.sel .cb{stroke:#6cc4ff;stroke-width:3;stroke-dasharray:none}
.h396.big .cell.hole{cursor:pointer}
.h396 .cn{font-size:22px;font-weight:900;fill:#3b2a1e}
.h396 .cell.done .cn{fill:#1f8a57}
.h396 .band{fill:#ffb25e2a;stroke:#ffb25e;stroke-width:2.6}
.h396 .ring{fill:none;stroke:#ffd166;stroke-width:3.6}
.h396 .ghost{font-size:24px;font-weight:900;fill:#ff8a3d}
.h396 .ttl{font-size:11px;font-weight:900;fill:#ffe2bd}
.h396 .msg{font-size:11px;font-weight:800;fill:#ffd9a8}
.h396 .pn{fill:#2b1d15;stroke:#ffffff16}
.h396 .st{fill:#ffd166;stroke:#a8742a;stroke-width:1.4;stroke-linejoin:round;transition:fill .3s}
.h396 .st.off{fill:#46362a;stroke:#5c4a3a}
.h396 .score{font-size:15px;font-weight:900;fill:#fff2dc}
.h396 .rung rect{fill:#ffffff08;stroke:#ffffff1c;stroke-width:1.2;transition:fill .25s,stroke .25s}
.h396 .rung .bi{stroke:#7d6756}
.h396 .rung text{font-size:10px;font-weight:800;fill:#bfa78f}
.h396 .rung .cost{font-size:9px;fill:#8d7765}
.h396 .rung.on rect{fill:#ffb25e33;stroke:#ffb25e}
.h396 .rung.on .bi{stroke:#ffd166}
.h396 .rung.on text{fill:#fff1d8}
.h396 .rung.on .cost{fill:#ff9b7a}
.h396 .pad{display:flex;gap:.9cqmin}
.h396 .key{all:unset;cursor:pointer;width:7.4cqmin;height:7.4cqmin;border-radius:1.8cqmin;display:grid;place-items:center;background:#fffaf0;color:#3b2a1e;font-weight:900;font-size:3.8cqmin;box-shadow:0 .6cqmin 0 #b89a6c}
.h396 .key:active{transform:translateY(.4cqmin);box-shadow:0 .2cqmin 0 #b89a6c}
`,
      svg: (id) => `
<text class="ttl" x="94" y="25" text-anchor="middle">마방진 · 어느 줄이든 합이 15</text>
<rect x="20" y="30" width="148" height="148" rx="14" fill="#4b3427" stroke="#7a5238" stroke-width="2" filter="url(#${id}sh)"/>
${SQ.map(
  (v, i) => `<g class="cell${HOLES.includes(i) ? ' hole' : ''}" data-i="${i}"><rect class="cb" x="${cx(i)}" y="${cy(i)}" width="${CS}" height="${CS}" rx="8"/>
<text class="cn" x="${cx(i) + CS / 2}" y="${cy(i) + 28.5}" text-anchor="middle">${HOLES.includes(i) ? '' : v}</text></g>`,
).join('')}
<rect class="band" x="24" y="0" width="140" height="44" rx="11" style="opacity:0"/>
<circle class="ring" r="24" style="opacity:0"/>
<text class="ghost" text-anchor="middle" style="opacity:0"></text>
<text class="msg" x="94" y="193" text-anchor="middle"></text>
<g transform="translate(182 22)">
  <rect class="pn" x="0" y="0" width="128" height="164" rx="14" filter="url(#${id}sh)"/>
  ${[0, 1, 2].map((k) => `<polygon class="st" points="${starPts(34 + k * 30, 22, 11)}"/>`).join('')}
  <text class="score" x="64" y="52" text-anchor="middle">100점</text>
  ${[0, 1, 2]
    .map(
      (k) => `<g class="rung"><rect x="8" y="${64 + k * 31}" width="112" height="25" rx="12.5"/>${sic('bulb', 14, 67 + k * 31, 19, 'bi')}
  <text x="37" y="${80.5 + k * 31}">${['① 볼 곳', '② 칸 위치', '③ 정답'][k]}</text><text class="cost" x="113" y="${80.5 + k * 31}" text-anchor="end">−${COST[k]}</text></g>`,
    )
    .join('')}
</g>`,
      panel: `<button class="btn" data-a="hint">${ic('bulb')}힌트</button><span class="sep"></span><div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9]
        .map((n) => `<button class="key" data-n="${n}">${n}</button>`)
        .join('')}</div><span class="sep"></span><button class="btn ghost" data-a="reset">${ic('redo')}처음부터</button>`,
    });
    const root = R.root;
    const cells = qa<SVGGElement>(root, '.cell');
    const cns = qa<SVGTextElement>(root, '.cn');
    const band = q(root, '.band');
    const ring = q(root, '.ring');
    const ghost = q<SVGTextElement>(root, '.ghost');
    const msg = q<SVGTextElement>(root, '.msg');
    const stars = qa(root, '.st');
    const score = q<SVGTextElement>(root, '.score');
    const rungs = qa(root, '.rung');

    const man = { filled: [false, false, false], lvl: 0, used: 0, cost: 0, sel: -1, shakeAt: -9, shakeI: -1, flashAt: -9, flashI: -1 };
    let now = 0;
    const A = autoCtl(() => resetMan());
    function resetMan(): void {
      man.filled = [false, false, false];
      man.lvl = 0;
      man.used = 0;
      man.cost = 0;
      man.sel = -1;
    }
    const target = (): number => man.filled.findIndex((f) => !f);
    function goManual(): void {
      if (!A.manual) {
        A.manual = true;
        resetMan();
      }
    }
    root.addEventListener('pointerdown', (e) => {
      const el = (e.target as Element).closest('[data-i],[data-n],[data-a]');
      if (!el || !R.sync()) return;
      const di = el.getAttribute('data-i');
      const dn = el.getAttribute('data-n');
      const da = el.getAttribute('data-a');
      if (di !== null) {
        const k = HOLES.indexOf(+di);
        if (k < 0) return;
        goManual();
        if (!man.filled[k]) man.sel = k;
      } else if (dn !== null) {
        goManual();
        let k = man.sel;
        if (k < 0 || man.filled[k]) k = target();
        if (k < 0) return;
        const h = HOLES[k]!;
        if (+dn === SQ[h]) {
          man.filled[k] = true;
          man.flashAt = now;
          man.flashI = h;
          man.sel = -1;
          if (k === target() || man.lvl > 0) man.lvl = 0;
        } else {
          man.shakeAt = now;
          man.shakeI = h;
        }
      } else if (da === 'hint') {
        goManual();
        if (target() >= 0 && man.lvl < 3) {
          man.cost += COST[man.lvl]!;
          man.lvl++;
          man.used++;
        }
      } else if (da === 'reset') {
        goManual();
        resetMan();
      }
    });

    function render(filled: boolean[], lvl: number, used: number, cost: number, tgt: number, sel: number, flashAt: number, flashI: number, shakeAt: number, shakeI: number, note: string): void {
      HOLES.forEach((h, k) => {
        cns[h]!.textContent = filled[k] ? String(SQ[h]) : '';
        cells[h]!.classList.toggle('done', !!filled[k]);
        cells[h]!.classList.toggle('sel', sel === k && !filled[k]);
      });
      cells.forEach((c, i) => {
        let tx = 0;
        if (i === shakeI && now - shakeAt < 0.45) tx = Math.sin((now - shakeAt) * 60) * 3.5 * (1 - (now - shakeAt) / 0.45);
        let s = 1;
        if (i === flashI && now - flashAt < 0.6) s = 1 + 0.14 * Math.sin(((now - flashAt) / 0.6) * Math.PI);
        const ox = cx(i) + CS / 2;
        const oy = cy(i) + CS / 2;
        tr(c, `translate(${tx + ox} ${oy}) scale(${s}) translate(${-ox} ${-oy})`);
      });
      const pulse = 0.5 + 0.5 * Math.sin(now * 5);
      const h = tgt >= 0 ? HOLES[tgt]! : -1;
      const on = h >= 0;
      show(band, on && lvl >= 1, 0.65 + 0.35 * pulse);
      if (on) band.setAttribute('y', String(cy(Math.floor(h / 3) * 3) - 2));
      show(ring, on && lvl >= 2);
      if (on) {
        ring.setAttribute('cx', String(cx(h) + CS / 2));
        ring.setAttribute('cy', String(cy(h) + CS / 2));
        ring.setAttribute('r', String(23 + pulse * 3));
      }
      show(ghost, on && lvl >= 3, 0.45 + 0.35 * pulse);
      if (on) {
        ghost.setAttribute('x', String(cx(h) + CS / 2));
        ghost.setAttribute('y', String(cy(h) + 29));
        ghost.textContent = String(SQ[h]);
      }
      rungs.forEach((r, k) => r.classList.toggle('on', k < lvl));
      const nStar = Math.max(0, 3 - used);
      stars.forEach((s, k) => s.classList.toggle('off', k >= nStar));
      score.textContent = `${100 - cost}점`;
      if (on) {
        const row = Math.floor(h / 3);
        const others = [0, 1, 2].map((c) => row * 3 + c).filter((i) => i !== h);
        const known = others.every((i) => !HOLES.includes(i) || filled[HOLES.indexOf(i)]);
        msg.textContent =
          note ||
          (lvl === 0
            ? '막히면 힌트 단추를 눌러요'
            : lvl === 1
              ? `${['첫째', '둘째', '셋째'][row]} 가로줄을 더하면 15`
              : lvl === 2
                ? '이 칸이 열쇠예요!'
                : known
                  ? `15 − ${SQ[others[0]!]} − ${SQ[others[1]!]} = ${SQ[h]}`
                  : `정답은 ${SQ[h]}`);
      } else msg.textContent = note || `완성! 별 ${nStar}개`;
    }

    return {
      controls: [A.ctl],
      update(t) {
        now = t;
        R.sync();
        if (A.base < 0) A.base = t;
        if (A.manual) {
          const tg = target();
          render(man.filled, man.lvl, man.used, man.cost, tg, man.sel, man.flashAt, man.flashI, man.shakeAt, man.shakeI, '');
          return;
        }
        const lt = t - A.base;
        const CY = 8.2;
        const k = Math.floor(lt / CY);
        const p = lt - k * CY;
        const use = 1 + (k % 3);
        let lvl = p > 1.4 ? 1 : 0;
        if (p > 2.8 && use >= 2) lvl = 2;
        if (p > 4.2 && use >= 3) lvl = 3;
        const solveT = 1.4 + use * 1.4 + 0.5;
        const solved = p > solveT;
        let cost = 0;
        for (let i = 0; i < lvl; i++) cost += COST[i]!;
        const note = solved ? `힌트 ${use}번 → 별 ${3 - use}개 · ${100 - cost}점` : '';
        render([solved, false, false], solved ? 0 : lvl, lvl, cost, solved ? -1 : 0, -1, k * CY + solveT + A.base, 0, -9, -1, note);
        if (solved) rungs.forEach((r, i) => r.classList.toggle('on', i < use));
      },
      dispose: () => R.dispose(),
    };
  },
};

/* ═════════════════════ i397 오답 해설 ═════════════════════ */
type Op = '+' | '−' | '×';
interface Diag {
  ok: boolean;
  title: string;
  lines: string[];
  marks: number[];
  ghosts: { col: number; text: string; strike?: boolean }[];
  correct: number;
}
const PLACE = ['일', '십', '백', '천'];
const dR = (n: number): number[] => String(n).split('').reverse().map(Number);
const at = (a: number[], i: number): number => a[i] ?? 0;
function diagnose(a: number, b: number, op: Op, ansStr: string): Diag {
  const correct = op === '+' ? a + b : op === '−' ? a - b : a * b;
  const base = { ok: false, marks: [] as number[], ghosts: [] as Diag['ghosts'], correct };
  const s = ansStr.trim();
  if (!/^\d+$/.test(s)) return { ...base, title: '숫자로 적어 봐요', lines: ['답 칸에는 수만 써요'] };
  const v = +s;
  if (v === correct) return { ...base, ok: true, title: '정답이에요!', lines: ['자리마다 정확하게', '셈했어요'] };
  const A = dR(a);
  const B = dR(b);
  const n = Math.max(A.length, B.length);
  const C = dR(correct);
  const V = dR(v);
  const diffCols: number[] = [];
  for (let i = 0; i < Math.max(C.length, V.length); i++) if (at(C, i) !== at(V, i)) diffCols.push(i);
  if (op === '+') {
    let nc = '';
    let cat = '';
    const carryInto: number[] = [];
    let c = 0;
    for (let i = 0; i < n; i++) {
      const x = at(A, i) + at(B, i);
      nc = String(x % 10) + nc;
      cat = String(x) + cat;
      if (x + c >= 10) carryInto.push(i + 1);
      c = x + c >= 10 ? 1 : 0;
    }
    const k = (carryInto[0] ?? 1) - 1;
    if (+nc === v && carryInto.length)
      return {
        ...base,
        title: '받아올림을 빠뜨렸어요',
        lines: [`${at(A, k)} + ${at(B, k)} = ${at(A, k) + at(B, k)}`, `→ 1을 ${PLACE[k + 1]}의 자리로`, '올려서 같이 더해요'],
        marks: carryInto.filter((x) => x < V.length),
        ghosts: carryInto.map((x) => ({ col: x, text: '1' })),
      };
    if (+cat === v && carryInto.length)
      return {
        ...base,
        title: '자리를 넘쳐 썼어요',
        lines: [`${at(A, k)} + ${at(B, k)} = ${at(A, k) + at(B, k)} 를`, '통째로 적었어요', `→ 1은 ${PLACE[k + 1]}의 자리로 올려요`],
        marks: diffCols,
        ghosts: [{ col: k + 1, text: '1' }],
      };
  }
  if (op === '−') {
    let fd = '';
    let rv = '';
    let firstB = -1;
    for (let i = 0; i < n; i++) {
      const x = at(A, i);
      const y = at(B, i);
      if (x < y && firstB < 0) firstB = i;
      fd = String(x < y ? x + 10 - y : x - y) + fd;
      rv = String(Math.abs(x - y)) + rv;
    }
    if (firstB >= 0) {
      const k = firstB;
      if (+fd === v)
        return {
          ...base,
          title: '빌려 온 뒤 줄이지 않았어요',
          lines: [`${PLACE[k]}의 자리가 10을 빌렸으면`, `${PLACE[k + 1]}의 자리 ${at(A, k + 1)}은`, `${at(A, k + 1) - 1}이 돼요`],
          marks: [k + 1],
          ghosts: [{ col: k + 1, text: String(at(A, k + 1) - 1), strike: true }],
        };
      if (+rv === v)
        return {
          ...base,
          title: '거꾸로 뺐어요',
          lines: [`${at(A, k)} − ${at(B, k)} 는 못 빼서`, `${at(B, k)} − ${at(A, k)} 를 했어요`, `→ 10을 빌려 ${at(A, k) + 10} − ${at(B, k)}`],
          marks: [k],
          ghosts: [
            { col: k + 1, text: String(at(A, k + 1) - 1), strike: true },
            { col: k, text: String(at(A, k) + 10) },
          ],
        };
    }
  }
  if (op === '×' && b < 10) {
    let cat = '';
    let nc = '';
    for (let i = 0; i < A.length; i++) {
      cat = String(at(A, i) * b) + cat;
      nc = String((at(A, i) * b) % 10) + nc;
    }
    const p = at(A, 0) * b;
    if (p >= 10 && +cat === v)
      return {
        ...base,
        title: '자리를 넘쳐 썼어요',
        lines: [`${at(A, 0)} × ${b} = ${p} 에서`, `${Math.floor(p / 10)}은 십의 자리로 올리고`, `${at(A, 1)} × ${b} + ${Math.floor(p / 10)} = ${at(A, 1) * b + Math.floor(p / 10)}`],
        marks: diffCols,
        ghosts: [{ col: 1, text: String(Math.floor(p / 10)) }],
      };
    if (p >= 10 && +nc === v)
      return {
        ...base,
        title: '받아올림을 빠뜨렸어요',
        lines: [`${at(A, 0)} × ${b} = ${p}`, `→ ${Math.floor(p / 10)}을 올려서`, '십의 자리에 더해요'],
        marks: [1],
        ghosts: [{ col: 1, text: String(Math.floor(p / 10)) }],
      };
  }
  if (V.length !== C.length) return { ...base, title: '자릿수가 달라요', lines: [`답은 ${C.length}자리 수예요`, '어림해 보면 얼마쯤?'], marks: diffCols };
  const k = diffCols[0] ?? 0;
  const one = Math.abs(at(V, k) - at(C, k)) === 1 || Math.abs(at(V, k) - at(C, k)) === 9;
  return {
    ...base,
    title: one ? '한 끗 차이예요' : '이 자리를 다시 봐요',
    lines: one ? [`${PLACE[k]}의 자리가 1 달라요`, '올림 · 내림을 확인!'] : [`${PLACE[k]}의 자리가 달라요`, '그 자리만 다시 셈해요'],
    marks: [k],
  };
}
const i397: DemoDom = {
  kind: 'dom',
  caption: '틀린 답의 어긋난 자리에 빨간 동그라미 + 원인 한 문장 — 「받아올림을 빠뜨렸어요」 「거꾸로 뺐어요」',
  make(box) {
    const COLX = [146, 118, 90, 62];
    const R = rig(box, 'h397', {
      css: `
.h397 .dg{font-size:26px;font-weight:800;fill:#3b2a1e}
.h397 .an{font-size:27px;font-weight:700;fill:#2e5aac;font-style:italic}
.h397 .op{font-size:24px;font-weight:800;fill:#3b2a1e}
.h397 .gh{font-size:13px;font-weight:900;fill:#e5484d}
.h397 .ghb{fill:#ffe3df;stroke:#e5484d;stroke-width:1;stroke-dasharray:2 1.6}
.h397 .stk{stroke:#e5484d;stroke-width:2.2;stroke-linecap:round}
.h397 .mk{fill:none;stroke:#e5484d;stroke-width:2.6;stroke-linecap:round}
.h397 .okc{fill:none;stroke:#2fb57e;stroke-width:3;stroke-linecap:round}
.h397 .fix{font-size:11px;font-weight:900;fill:#1f8a57}
.h397 .bb{fill:#2b1d15;stroke:#ff7a59;stroke-width:2}
.h397 .bb.ok{stroke:#4fd69c}
.h397 .btag{font-size:8.5px;font-weight:800;fill:#ff9b7a;letter-spacing:.5px}
.h397 .btag.ok{fill:#7ef0be}
.h397 .btl{font-size:11px;font-weight:900;fill:#ffd2c4}
.h397 .btl.ok{fill:#c9ffe6}
.h397 .bl{font-size:9.5px;font-weight:700;fill:#ffeedd}
.h397 .wi{stroke:#ff7a59}
.h397 .wi.ok{stroke:#4fd69c}
.h397 .xs{font-size:22px;font-weight:900;fill:#e5484d}
.h397 .qs{font-size:9px;font-weight:800;fill:#9a7c5c}
`,
      svg: (id) => `
<rect x="34" y="14" width="140" height="174" rx="10" fill="url(#${id}pp)" filter="url(#${id}sh)"/>
<rect x="34" y="14" width="140" height="174" rx="10" fill="url(#${id}gp)" opacity=".7"/>
<text class="qs" x="44" y="30">세로셈</text>
${COLX.map((x) => `<g class="ghg"><rect class="ghb" x="${x - 10}" y="36" width="20" height="17" rx="4"/><text class="gh" x="${x}" y="49" text-anchor="middle"></text></g>`).join('')}
${COLX.map((x) => `<text class="dg da" x="${x}" y="82" text-anchor="middle"></text>`).join('')}
${COLX.map((x) => `<line class="stk" x1="${x - 10}" y1="78" x2="${x + 10}" y2="64"/>`).join('')}
<text class="op" x="58" y="114" text-anchor="middle"></text>
${COLX.map((x) => `<text class="dg db" x="${x}" y="114" text-anchor="middle"></text>`).join('')}
<line x1="48" y1="124" x2="162" y2="124" stroke="#3b2a1e" stroke-width="2.2" stroke-linecap="round"/>
${COLX.map((x) => `<text class="an" x="${x}" y="157" text-anchor="middle"></text>`).join('')}
<path class="mk" pathLength="1" stroke-dasharray="1 1"/>
<path class="okc" pathLength="1" stroke-dasharray="1 1" d="M50 148 L64 162 L90 132"/>
<text class="xs" x="50" y="156" text-anchor="middle">✗</text>
<text class="fix" x="104" y="180" text-anchor="middle"></text>
<g class="bub">
  <path class="bb" d="M192 38 h112 a10 10 0 0 1 10 10 v96 a10 10 0 0 1 -10 10 h-112 a10 10 0 0 1 -10 -10 v-40 l-10 -6 l10 -6 v-44 a10 10 0 0 1 10 -10z" filter="url(#${id}sh)"/>
  ${sic('warn', 192, 46, 14, 'wi')}
  <text class="btag" x="210" y="57">왜 틀렸을까?</text>
  <text class="btl" x="192" y="78"></text>
  <text class="bl" x="192" y="99"></text><text class="bl" x="192" y="115"></text><text class="bl" x="192" y="131"></text>
</g>`,
      panel: `<span class="lab plab"></span><input class="ans" inputmode="numeric" maxlength="4" placeholder="답"/><button class="btn" data-a="go">${ic('check')}확인</button><button class="btn ghost" data-a="new">${ic('arrow')}새 문제</button>`,
    });
    const root = R.root;
    const ghg = qa<SVGGElement>(root, '.ghg');
    const gh = qa<SVGTextElement>(root, '.gh');
    const da = qa<SVGTextElement>(root, '.da');
    const db = qa<SVGTextElement>(root, '.db');
    const stk = qa(root, '.stk');
    const an = qa<SVGTextElement>(root, '.an');
    const op = q<SVGTextElement>(root, '.op');
    const mk = q<SVGPathElement>(root, '.mk');
    const okc = q(root, '.okc');
    const xs = q(root, '.xs');
    const fix = q<SVGTextElement>(root, '.fix');
    const bub = q<SVGGElement>(root, '.bub');
    const bb = q(root, '.bb');
    const btag = q<SVGTextElement>(root, '.btag');
    const btl = q<SVGTextElement>(root, '.btl');
    const bl = qa<SVGTextElement>(root, '.bl');
    const wi = q(root, '.wi');
    const input = root.querySelector('input.ans') as HTMLInputElement;
    const plab = root.querySelector('.plab') as HTMLElement;

    const AUTO: [number, Op, number, string][] = [
      [47, '+', 38, '75'],
      [61, '−', 27, '46'],
      [23, '×', 4, '812'],
    ];
    const POOL: [number, Op, number][] = [
      [47, '+', 38],
      [61, '−', 27],
      [23, '×', 4],
      [56, '+', 27],
      [83, '−', 46],
      [18, '×', 3],
      [75, '+', 19],
      [92, '−', 58],
      [36, '×', 5],
    ];
    let pi = 0;
    let cur: { a: number; o: Op; b: number; ans: string; d: Diag | null; t0: number } = { a: 47, o: '+', b: 38, ans: '', d: null, t0: 0 };
    let now = 0;
    const A = autoCtl(() => undefined);
    function setProblem(i: number): void {
      const p = POOL[i % POOL.length]!;
      cur = { a: p[0], o: p[1], b: p[2], ans: '', d: null, t0: now };
      input.value = '';
      plab.textContent = `${p[0]} ${p[1]} ${p[2]} =`;
    }
    function submit(): void {
      if (!A.manual) {
        A.manual = true;
      }
      const s = input.value.trim();
      if (!s) return;
      cur.ans = s;
      cur.d = diagnose(cur.a, cur.b, cur.o, s);
      cur.t0 = now - 1.5;
    }
    setProblem(0);
    root.addEventListener('pointerdown', (e) => {
      const el = (e.target as Element).closest('[data-a]');
      if (!el || !R.sync()) return;
      const a = el.getAttribute('data-a');
      if (a === 'go') {
        e.preventDefault();
        submit();
      } else if (a === 'new') {
        e.preventDefault();
        A.manual = true;
        setProblem(++pi);
        input.focus();
      }
    });
    input.addEventListener('focus', () => {
      if (!A.manual) {
        A.manual = true;
        setProblem(pi);
      }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });

    function markPath(cols: number[]): string {
      if (!cols.length) return '';
      const xs2 = cols.map((c) => COLX[c] ?? 146);
      const mx = (Math.min(...xs2) + Math.max(...xs2)) / 2;
      const rx = 15 + (Math.max(...xs2) - Math.min(...xs2)) / 2;
      const ry = 19;
      const cyy = 148;
      let d = '';
      const N = 40;
      for (let i = 0; i <= N; i++) {
        const a = -2.2 + (i / N) * (Math.PI * 2 + 0.55);
        const w = 1 + 0.06 * Math.sin(i * 1.7) + (i / N) * 0.08;
        const x = mx + Math.cos(a) * rx * w;
        const y = cyy + Math.sin(a) * ry * w - (i / N) * 2;
        d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      return d;
    }
    let lastMark = '';
    /** p = 문제 시작부터 초 */
    function render(a: number, o: Op, b: number, ans: string, d: Diag | null, p: number): void {
      const A2 = dR(a);
      const B2 = dR(b);
      COLX.forEach((_, i) => {
        da[i]!.textContent = i < A2.length ? String(A2[i]) : '';
        db[i]!.textContent = i < B2.length ? String(B2[i]) : '';
      });
      op.textContent = o;
      const AN = ans.split('').reverse();
      const nA = AN.length;
      COLX.forEach((_, i) => {
        const order = nA - 1 - i;
        const k = seg(p, 0.15 + order * 0.32, 0.4 + order * 0.32);
        const el = an[i]!;
        el.textContent = AN[i] ?? '';
        el.style.opacity = String(k);
        const x = COLX[i]!;
        tr(el, `translate(${x} 150) scale(${0.6 + 0.4 * backOut(k)}) translate(${-x} -150)`);
      });
      const judged = d !== null && p > 1.3;
      const ok = !!d?.ok;
      const kx = seg(p, 1.3, 1.6);
      show(xs, judged && !ok, kx);
      tr(xs, `translate(50 148) scale(${0.5 + 0.5 * backOut(kx)}) translate(-50 -148)`);
      okc.setAttribute('stroke-dashoffset', String(1 - (judged && ok ? sm(seg(p, 1.3, 1.9)) : 0)));
      const mp = d && !ok ? markPath(d.marks) : '';
      if (mp !== lastMark) {
        mk.setAttribute('d', mp);
        lastMark = mp;
      }
      mk.setAttribute('stroke-dashoffset', String(1 - (judged && !ok ? sm(seg(p, 1.7, 2.3)) : 0)));
      const gk = judged && !ok ? sm(seg(p, 2.8, 3.3)) : 0;
      COLX.forEach((x, i) => {
        const g = d?.ghosts.find((gg) => gg.col === i);
        gh[i]!.textContent = g ? g.text : '';
        const w = g && g.text.length > 1 ? 24 : 18;
        const r = ghg[i]!.querySelector('rect')!;
        r.setAttribute('x', String(x - w / 2));
        r.setAttribute('width', String(w));
        ghg[i]!.style.opacity = g ? String(gk) : '0';
        tr(ghg[i]!, `translate(0 ${(1 - gk) * 6})`);
        stk[i]!.style.opacity = g?.strike ? String(gk) : '0';
      });
      const bk = judged ? sm(seg(p, 2.2, 2.6)) : 0;
      bub.style.opacity = String(bk);
      tr(bub, `translate(${(1 - bk) * 10} 0)`);
      if (d) {
        bb.classList.toggle('ok', ok);
        btag.classList.toggle('ok', ok);
        btl.classList.toggle('ok', ok);
        wi.classList.toggle('ok', ok);
        btag.textContent = ok ? '잘했어요' : '왜 틀렸을까?';
        btl.textContent = d.title;
        bl.forEach((el, i) => (el.textContent = d.lines[i] ?? ''));
      }
      const fk = judged && !ok ? sm(seg(p, 3.6, 4.0)) : 0;
      fix.textContent = d ? `바른 답 ${d.correct}` : '';
      fix.style.opacity = String(fk);
    }
    return {
      controls: [A.ctl],
      update(t) {
        now = t;
        R.sync();
        if (A.base < 0) A.base = t;
        if (A.manual) {
          const typing = input.value.trim() !== cur.ans || !cur.d;
          if (typing && document.activeElement === input) render(cur.a, cur.o, cur.b, input.value.slice(0, 4), null, 9);
          else render(cur.a, cur.o, cur.b, cur.ans, cur.d, t - cur.t0);
          return;
        }
        const lt = t - A.base;
        const CY = 5.8;
        const k = Math.floor(lt / CY);
        const p = lt - k * CY;
        const P = AUTO[k % AUTO.length]!;
        render(P[0], P[1], P[2], P[3], diagnose(P[0], P[2], P[1], P[3]), p);
      },
      dispose: () => R.dispose(),
    };
  },
};

/* ═════════════════════ i398 정답을 그려 보여 주기 (작도) ═════════════════════ */
const i398: DemoDom = {
  kind: 'dom',
  caption: '수직이등분선 작도를 손그림으로 한 단계씩 — 따라 할 수 있는 속도, 멈춤 · 되감기',
  make(box) {
    const AX = 100;
    const BX = 220;
    const Y = 122;
    const RAD = 78;
    const MX = 160;
    const DY = Math.sqrt(RAD * RAD - 60 * 60);
    const SPAN = (55 * Math.PI) / 180;
    const D = [2.4, 2.4, 1.8, 1.5];
    const GAP = 0.55;
    const S: number[] = [];
    let acc = 0.5;
    for (const d of D) {
      S.push(acc);
      acc += d + GAP;
    }
    const END = S[3]! + D[3]!;
    const TOTAL = END + 2.2;
    const STEP_TXT = ['① A를 중심으로 원 그리기', '② B에서 같은 크기로', '③ 만난 두 점을 곧게 잇기', '④ 가운데 점 M — 수직이등분선!'];
    const wob = (seed: number, k: number): number => 0.7 * Math.sin(k * 9.1 + seed) + 0.45 * Math.sin(k * 23.3 + seed * 2);
    function arcPath(cx: number, a0: number, a1: number, seed: number): string {
      let d = '';
      const N = 60;
      for (let i = 0; i <= N; i++) {
        const a = a0 + ((a1 - a0) * i) / N;
        const r = RAD + wob(seed, i / N);
        d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * r).toFixed(1)} ${(Y + Math.sin(a) * r).toFixed(1)}`;
      }
      return d;
    }
    const arcA = arcPath(AX, -SPAN, SPAN, 1);
    const arcB = arcPath(BX, Math.PI + SPAN, Math.PI - SPAN, 4);
    let lineD = '';
    for (let i = 0; i <= 30; i++) {
      const y = 50 + (i / 30) * 134;
      lineD += `${i ? 'L' : 'M'}${(MX + 0.35 * Math.sin(i * 1.3)).toFixed(1)} ${y.toFixed(1)}`;
    }
    const R = rig(box, 'h398', {
      css: `
.h398 .ink{fill:none;stroke:#34302c;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.h398 .pen{fill:none;stroke:#4a5a7a;stroke-width:1.7;stroke-linecap:round;opacity:.92}
.h398 .pen.ln{stroke:#c0462e;stroke-width:2.1}
.h398 .pt{fill:#34302c}
.h398 .lb{font-size:12px;font-weight:900;fill:#34302c;font-style:italic}
.h398 .ix{fill:#ff8a3d}
.h398 .sbx{fill:#2b1d15;stroke:#ffb25e;stroke-width:1.6}
.h398 .stx{font-size:10.5px;font-weight:900;fill:#ffe6c4}
.h398 .chip circle{fill:#e8d7b6;stroke:#b89a6c;stroke-width:1.2}
.h398 .chip text{font-size:8.5px;font-weight:900;fill:#7a6040}
.h398 .chip.done circle{fill:#9fe0bf;stroke:#2fb57e}
.h398 .chip.done text{fill:#16603f}
.h398 .chip.cur circle{fill:#ffb25e;stroke:#a24a16}
.h398 .chip.cur text{fill:#2a1406}
.h398.big .chip{cursor:pointer}
.h398 .mm{fill:none;stroke:#c0462e;stroke-width:1.6}
.h398 .eqt{font-size:9.5px;font-weight:900;fill:#c0462e}
.h398 .pz{font-size:8px;font-weight:900;fill:#fff}
`,
      svg: (id) => `
<rect x="12" y="12" width="296" height="176" rx="10" fill="url(#${id}pp)" filter="url(#${id}sh)"/>
<rect x="12" y="12" width="296" height="176" rx="10" fill="url(#${id}gp)" opacity=".55"/>
<path class="ink" d="M${AX} ${Y} L${BX} ${Y}"/>
<path class="pen s0" pathLength="1" stroke-dasharray="1 1" d="${arcA}"/>
<path class="pen s1" pathLength="1" stroke-dasharray="1 1" d="${arcB}"/>
<path class="pen ln s2" pathLength="1" stroke-dasharray="1 1" d="${lineD}"/>
<circle class="ix ip" cx="${MX}" cy="${Y - DY}" r="3"/><circle class="ix iq" cx="${MX}" cy="${Y + DY}" r="3"/>
<g class="s3g">
  <path class="mm" d="M${MX} ${Y - 9} h9 v9"/>
  <path class="mm" d="M128 ${Y - 5} l4 10 M131 ${Y - 5} l4 10 M188 ${Y - 5} l4 10 M191 ${Y - 5} l4 10"/>
  <circle cx="${MX}" cy="${Y}" r="3.6" fill="#c0462e"/>
  <text class="lb" x="${MX - 13}" y="${Y + 15}" style="fill:#c0462e">M</text>
  <text class="eqt" x="${MX + 30}" y="${Y + 30}">AM = MB</text>
</g>
<circle class="pt" cx="${AX}" cy="${Y}" r="3.2"/><circle class="pt" cx="${BX}" cy="${Y}" r="3.2"/>
<text class="lb" x="${AX - 14}" y="${Y + 5}">A</text><text class="lb" x="${BX + 6}" y="${Y + 5}">B</text>
<g class="ruler"><rect x="${MX + 3}" y="40" width="15" height="152" rx="2" fill="#ffe7a8" stroke="#b08a3c" stroke-width="1" opacity=".82"/>
${Array.from({ length: 30 }, (_, i) => `<line x1="${MX + 3}" x2="${MX + (i % 5 ? 7 : 10)}" y1="${44 + i * 5}" y2="${44 + i * 5}" stroke="#8a6a2c" stroke-width=".7"/>`).join('')}</g>
<g class="cmp">
  <line class="lg1" stroke="#7b8494" stroke-width="2.6" stroke-linecap="round"/>
  <line class="lg2" stroke="#7b8494" stroke-width="2.6" stroke-linecap="round"/>
  <circle class="hg" r="4" fill="#e6b84a" stroke="#6b4a10" stroke-width="1.2"/>
  <rect class="hd" width="5" height="10" x="-2.5" y="-14" rx="2" fill="#c98a2a"/>
  <circle class="nd" r="1.6" fill="#2a2a2a"/>
</g>
<g class="pencil"><g transform="rotate(32)">
  <path d="M0 0 L-3.2 -8 L3.2 -8 Z" fill="#f2c79a" stroke="#6b4a2a" stroke-width=".8"/><path d="M0 0 L-1.1 -2.8 L1.1 -2.8Z" fill="#333"/>
  <rect x="-3.2" y="-36" width="6.4" height="28" fill="#ffc43d" stroke="#8a6a10" stroke-width=".8"/>
  <rect x="-3.2" y="-40" width="6.4" height="4" fill="#bbb"/><rect x="-3.2" y="-45" width="6.4" height="5" rx="1.5" fill="#ff8fa3"/>
</g></g>
<rect class="sbx" x="20" y="20" width="148" height="22" rx="11"/>
<text class="stx" x="31" y="35"></text>
${[0, 1, 2, 3].map((k) => `<g class="chip" data-s="${k}"><circle cx="${238 + k * 18}" cy="31" r="7.5"/><text x="${238 + k * 18}" y="34" text-anchor="middle">${k + 1}</text></g>`).join('')}
<g class="pz" style="opacity:0"><rect x="268" y="160" width="32" height="18" rx="9" fill="#00000088"/><text x="284" y="172" text-anchor="middle">멈춤</text></g>`,
      panel: `<button class="btn ghost" data-a="prev">${ic('prev')}이전</button><button class="btn" data-a="play"><span class="pi">${ic('pause')}</span><span class="pl">멈춤</span></button><button class="btn ghost" data-a="next">${ic('next')}다음</button><span class="sep"></span><button class="btn ghost" data-a="home">${ic('redo')}처음부터</button>`,
    });
    const root = R.root;
    const pens = [0, 1, 2].map((i) => q(root, `.s${i}`));
    const ip = q(root, '.ip');
    const iq = q(root, '.iq');
    const s3g = q(root, '.s3g');
    const ruler = q(root, '.ruler');
    const cmp = q(root, '.cmp');
    const lg1 = q(root, '.lg1');
    const lg2 = q(root, '.lg2');
    const hg = q(root, '.hg');
    const hd = q(root, '.hd');
    const nd = q(root, '.nd');
    const pencil = q(root, '.pencil');
    const stx = q<SVGTextElement>(root, '.stx');
    const chips = qa(root, '.chip');
    const pz = q(root, '.pz');
    const pi = root.querySelector('.pi') as HTMLElement | null;
    const pl = root.querySelector('.pl') as HTMLElement | null;
    let ph = 0;
    let playing = true;
    let speed = 1;
    const setPlay = (v: boolean): void => {
      playing = v;
      if (pi) pi.innerHTML = ic(v ? 'pause' : 'play');
      if (pl) pl.textContent = v ? '멈춤' : '재생';
    };
    const curStep = (): number => {
      let c = 0;
      for (let i = 0; i < 4; i++) if (ph >= S[i]! - 0.01) c = i;
      return c;
    };
    root.addEventListener('pointerdown', (e) => {
      const el = (e.target as Element).closest('[data-a],[data-s]');
      if (!el || !R.sync()) return;
      const a = el.getAttribute('data-a');
      const s = el.getAttribute('data-s');
      if (s !== null) ph = S[+s]!;
      else if (a === 'play') {
        if (ph >= END) ph = 0;
        setPlay(!playing);
      } else if (a === 'prev') {
        const c = curStep();
        ph = ph - S[c]! < 0.4 && c > 0 ? S[c - 1]! : S[c]!;
        setPlay(false);
      } else if (a === 'next') {
        const c = curStep();
        ph = c < 3 ? S[c + 1]! : END;
        setPlay(false);
      } else if (a === 'home') {
        ph = 0;
        setPlay(true);
      }
    });
    const prog = (i: number): number => clamp((ph - S[i]!) / D[i]!);
    return {
      controls: [
        { type: 'range', label: '그리는 속도', min: 0.4, max: 2, step: 0.1, value: 1, on: (v) => (speed = v) },
        { type: 'button', label: '처음부터', on: () => ((ph = 0), setPlay(true)) },
      ],
      update(_t, dt) {
        const big = R.sync();
        if (playing) {
          ph += Math.min(dt, 0.1) * speed;
          if (ph > TOTAL) ph = big ? END : 0;
          if (big && ph >= END) {
            ph = END;
            setPlay(false);
          }
        }
        const c = curStep();
        for (let i = 0; i < 3; i++) pens[i]!.setAttribute('stroke-dashoffset', String(1 - prog(i)));
        show(ip, prog(1) > 0.62);
        show(iq, prog(1) > 0.38);
        const k3 = prog(3);
        s3g.style.opacity = String(sm(k3 * 1.6));
        stx.textContent = ph < S[0]! - 0.05 ? '정답 풀이를 그려 볼게요' : STEP_TXT[c]!;
        chips.forEach((ch, i) => {
          ch.classList.toggle('done', prog(i) >= 1);
          ch.classList.toggle('cur', i === c && prog(i) < 1);
        });
        show(pz, !playing);
        // 도구
        const drawing = (i: number): boolean => ph >= S[i]! - 0.35 && ph <= S[i]! + D[i]! + 0.3;
        const ci = drawing(0) ? 0 : drawing(1) ? 1 : -1;
        if (ci >= 0) {
          const k = sm(prog(ci));
          const cxx = ci === 0 ? AX : BX;
          const a = ci === 0 ? lerp(-SPAN, SPAN, k) : lerp(Math.PI + SPAN, Math.PI - SPAN, k);
          const px = cxx + Math.cos(a) * RAD;
          const py = Y + Math.sin(a) * RAD;
          const mxx = (cxx + px) / 2;
          const myy = (Y + py) / 2;
          let nx = -(py - Y);
          let ny = px - cxx;
          const nl = Math.hypot(nx, ny) || 1;
          nx /= nl;
          ny /= nl;
          if (ny > 0) {
            nx = -nx;
            ny = -ny;
          }
          const hh = 40;
          const hx = mxx + nx * hh;
          const hy = myy + ny * hh;
          const set = (el: Element, x1: number, y1: number, x2: number, y2: number): void => {
            el.setAttribute('x1', x1.toFixed(1));
            el.setAttribute('y1', y1.toFixed(1));
            el.setAttribute('x2', x2.toFixed(1));
            el.setAttribute('y2', y2.toFixed(1));
          };
          set(lg1, cxx, Y, hx, hy);
          set(lg2, hx, hy, px, py);
          hg.setAttribute('cx', hx.toFixed(1));
          hg.setAttribute('cy', hy.toFixed(1));
          const ang = (Math.atan2(ny, nx) * 180) / Math.PI + 90;
          tr(hd, `translate(${hx.toFixed(1)} ${hy.toFixed(1)}) rotate(${ang.toFixed(1)})`);
          nd.setAttribute('cx', String(cxx));
          nd.setAttribute('cy', String(Y));
          const fade = Math.min(seg(ph, S[ci]! - 0.35, S[ci]!), 1 - seg(ph, S[ci]! + D[ci]!, S[ci]! + D[ci]! + 0.3));
          cmp.style.opacity = String(fade);
        } else cmp.style.opacity = '0';
        const rl = drawing(2);
        const fadeR = rl ? Math.min(seg(ph, S[2]! - 0.35, S[2]!), 1 - seg(ph, S[2]! + D[2]!, S[2]! + D[2]! + 0.3)) : 0;
        ruler.style.opacity = String(fadeR);
        if (rl) {
          const y = 50 + sm(prog(2)) * 134;
          tr(pencil, `translate(${MX} ${y.toFixed(1)})`);
          pencil.style.opacity = String(fadeR);
        } else pencil.style.opacity = '0';
      },
      dispose: () => R.dispose(),
    };
  },
};

/* ═════════════════════ i399 실수 패턴 알아채기 ═════════════════════ */
type Fr = [number, number];
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
function classifyFrac(p: Fr, r: Fr, ans: Fr): 'ok' | 'A' | 'B' | 'C' {
  const n = p[0] * r[1] + r[0] * p[1];
  const d = p[1] * r[1];
  const eq = ans[0] * d === n * ans[1];
  if (eq && gcd(ans[0], ans[1]) === 1) return 'ok';
  if (eq) return 'B';
  if (ans[0] === p[0] + r[0] && ans[1] === p[1] + r[1]) return 'A';
  return 'C';
}
const i399: DemoDom = {
  kind: 'dom',
  caption: '실수를 종류별로 세다가 같은 실수가 3번이면 알아채요 — 「분모끼리 더했네요, 통분 연습 해 볼까요?」',
  make(box) {
    const TY = { A: { n: '분모끼리 더함', c: '#ff9b42' }, B: { n: '약분 안 함', c: '#6cc4ff' }, C: { n: '계산 실수', c: '#c79bff' }, ok: { n: '정답', c: '#4fd69c' } } as const;
    type K = keyof typeof TY;
    const SEQ: [Fr, Fr, Fr][] = [
      [[1, 2], [1, 4], [2, 6]],
      [[1, 3], [1, 3], [2, 3]],
      [[1, 2], [1, 6], [4, 6]],
      [[2, 5], [1, 3], [3, 8]],
      [[1, 4], [1, 2], [3, 4]],
      [[1, 2], [1, 3], [2, 5]],
    ];
    const PROB: [Fr, Fr][] = [
      [[1, 2], [1, 5]],
      [[1, 3], [1, 6]],
      [[2, 3], [1, 4]],
      [[1, 4], [1, 4]],
      [[1, 2], [1, 3]],
      [[3, 5], [1, 10]],
      [[1, 6], [1, 3]],
    ];
    const R = rig(box, 'h399', {
      css: `
.h399 .hd{font-size:10px;font-weight:900;fill:#7a5a38}
.h399 .hd2{font-size:10px;font-weight:900;fill:#ffe2bd}
.h399 .fr{font-size:10.5px;font-weight:800;fill:#3b2a1e}
.h399 .fo{font-size:11px;font-weight:800;fill:#7a6450}
.h399 .tg{font-size:8px;font-weight:900;fill:#1a120c}
.h399 .ix{font-size:8px;font-weight:900;fill:#a88a68}
.h399 .tl{font-size:9.5px;font-weight:800;fill:#f3dcc0}
.h399 .cnt{font-size:9px;font-weight:900;fill:#a88f78}
.h399 .slot{fill:#ffffff10;stroke:#ffffff26;stroke-width:1.2}
.h399 .tr.hot .tl{fill:#fff}
.h399 .sg{fill:#3a2414;stroke:#ffd166;stroke-width:2}
.h399 .sgt{font-size:9.5px;font-weight:900;fill:#ffe6b0}
.h399 .sgs{font-size:8.5px;font-weight:700;fill:#f3d6b8}
.h399 .sgbt{font-size:9px;font-weight:900;fill:#2a1406}
.h399 .sgi{stroke:#2a1406}
.h399.big .sgbtn{cursor:pointer}
`,
      svg: (id) => `
<rect x="10" y="12" width="172" height="176" rx="10" fill="url(#${id}pp)" filter="url(#${id}sh)"/>
<text class="hd" x="22" y="30">풀이 기록</text>
<g class="rows"></g>
<rect x="190" y="12" width="122" height="176" rx="12" fill="#2b1d15" stroke="#ffffff14"/>
<text class="hd2" x="200" y="30">실수 종류 세기</text>
${(['A', 'B', 'C'] as const)
  .map(
    (k, i) => `<g class="tr" data-k="${k}">
  <rect class="trb" x="196" y="${38 + i * 30}" width="110" height="26" rx="8" fill="#ffffff06" stroke="${TY[k].c}" stroke-opacity=".0"/>
  <text class="tl" x="203" y="${50 + i * 30}">${TY[k].n}</text>
  ${[0, 1, 2].map((j) => `<circle class="slot" cx="${206 + j * 12}" cy="${57.5 + i * 30}" r="4"/>`).join('')}
  ${[0, 1, 2].map((j) => `<circle class="dot" cx="${206 + j * 12}" cy="${57.5 + i * 30}" r="4" fill="${TY[k].c}" style="opacity:0"/>`).join('')}
  <text class="cnt" x="298" y="${56 + i * 30}" text-anchor="end">0번</text>
</g>`,
  )
  .join('')}
<g class="sug" style="opacity:0">
  <rect class="sg" x="194" y="130" width="114" height="54" rx="10" filter="url(#${id}gl)"/>
  <text class="sgt" x="201" y="145"></text>
  <text class="sgs" x="201" y="158"></text>
  <g class="sgbtn"><rect class="sgb" x="201" y="164" width="100" height="15" rx="7.5" fill="url(#${id}or)"/>${sic('target', 207, 166, 11, 'sgi')}<text class="sgbt" x="221" y="175">맞춤 연습 5문제</text></g>
</g>`,
      panel: `<span class="lab plab"></span><input class="ans" placeholder="예: 7/10" maxlength="7"/><button class="btn" data-a="go">${ic('check')}확인</button><button class="btn ghost" data-a="new">${ic('arrow')}새 문제</button>`,
    });
    const root = R.root;
    const rows = q<SVGGElement>(root, '.rows');
    const trs = qa<SVGGElement>(root, '.tr');
    const sug = q<SVGGElement>(root, '.sug');
    const sgt = q<SVGTextElement>(root, '.sgt');
    const sgs = q<SVGTextElement>(root, '.sgs');
    const sgbt = q<SVGTextElement>(root, '.sgbt');
    const input = root.querySelector('input.ans') as HTMLInputElement;
    const plab = root.querySelector('.plab') as HTMLElement;
    const frac = (x: number, y: number, f: Fr, cls = 'fr'): string =>
      `<text class="${cls}" x="${x}" y="${y - 2.5}" text-anchor="middle">${f[0]}</text><line x1="${x - 5.5}" x2="${x + 5.5}" y1="${y}" y2="${y}" stroke="#3b2a1e" stroke-width="1.1"/><text class="${cls}" x="${x}" y="${y + 10}" text-anchor="middle">${f[1]}</text>`;
    interface Row {
      p: Fr;
      r: Fr;
      a: Fr;
      k: K;
      at: number;
    }
    let list: Row[] = [];
    let count = { A: 0, B: 0, C: 0 };
    let sugK: 'A' | 'B' | 'C' | null = null;
    let sugAt = 0;
    let practice = false;
    let now = 0;
    let built = '';
    let pIdx = 0;
    const A = autoCtl(() => resetAll());
    function resetAll(): void {
      list = [];
      count = { A: 0, B: 0, C: 0 };
      sugK = null;
      practice = false;
      built = '';
    }
    function push(p: Fr, r: Fr, a: Fr, t: number): void {
      const k = classifyFrac(p, r, a);
      list.push({ p, r, a, k, at: t });
      if (k !== 'ok') {
        count[k]++;
        if (count[k] >= 3 && !sugK) {
          sugK = k;
          sugAt = t;
        }
      }
    }
    function newProb(): void {
      pIdx = (pIdx + 1) % PROB.length;
      const pr = PROB[pIdx]!;
      plab.textContent = `${pr[0][0]}/${pr[0][1]} + ${pr[1][0]}/${pr[1][1]} =`;
      input.value = '';
    }
    pIdx = -1;
    newProb();
    function submit(): void {
      const m = input.value.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
      if (!m || +m[2]! === 0) {
        input.value = '';
        input.placeholder = '분수로: 7/10';
        return;
      }
      if (!A.manual) {
        A.manual = true;
        resetAll();
      }
      const pr = PROB[pIdx]!;
      push(pr[0], pr[1], [+m[1]!, +m[2]!], now);
      newProb();
    }
    root.addEventListener('pointerdown', (e) => {
      const el = (e.target as Element).closest('[data-a],.sgbtn');
      if (!el || !R.sync()) return;
      if (el.classList.contains('sgbtn')) {
        if (sugK) {
          practice = true;
          sugAt = now;
        }
        return;
      }
      const a = el.getAttribute('data-a');
      e.preventDefault();
      if (a === 'go') submit();
      else if (a === 'new') newProb();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
    function render(): void {
      const vis = list.slice(-5);
      const key = vis.map((r) => r.at).join(',') + list.length;
      if (key !== built) {
        built = key;
        rows.innerHTML = vis
          .map((r, i) => {
            const y = 48 + i * 27;
            const ty = TY[r.k];
            const idx = list.length - vis.length + i + 1;
            return `<g class="row" data-at="${r.at}"><rect x="16" y="${y - 4}" width="160" height="24" rx="6" fill="${r.k === 'ok' ? '#4fd69c' : ty.c}" fill-opacity=".1"/>
<text class="ix" x="24" y="${y + 11}" text-anchor="middle">${idx}</text>${frac(42, y + 8, r.p)}<text class="fo" x="54" y="${y + 12}" text-anchor="middle">+</text>${frac(66, y + 8, r.r)}<text class="fo" x="78" y="${y + 12}" text-anchor="middle">=</text>${frac(91, y + 8, r.a)}
<text x="104" y="${y + 13}" font-size="12" font-weight="900" fill="${r.k === 'ok' ? '#2fb57e' : '#e5484d'}">${r.k === 'ok' ? '✓' : '✗'}</text>
<rect x="116" y="${y + 2}" width="56" height="13" rx="6.5" fill="${ty.c}"/><text class="tg" x="144" y="${y + 11.5}" text-anchor="middle">${ty.n}</text></g>`;
          })
          .join('');
      }
      qa<SVGGElement>(rows, '.row').forEach((g) => {
        const age = now - +(g.getAttribute('data-at') ?? 0);
        const k = sm(age / 0.35);
        g.style.opacity = String(k);
        tr(g, `translate(${(1 - k) * -10} 0)`);
      });
      trs.forEach((g) => {
        const k = g.getAttribute('data-k') as 'A' | 'B' | 'C';
        const n = count[k];
        qa(g, '.dot').forEach((d, j) => {
          const on = j < n;
          (d as SVGElement).style.opacity = on ? '1' : '0';
        });
        q<SVGTextElement>(g, '.cnt').textContent = `${n}번`;
        const hot = sugK === k;
        g.classList.toggle('hot', hot);
        const b = q(g, '.trb');
        b.setAttribute('stroke-opacity', hot ? String(0.6 + 0.4 * Math.sin(now * 6)) : '0');
        b.setAttribute('stroke-width', hot ? '2' : '1');
      });
      const sk = sugK ? sm((now - sugAt) / 0.4) : 0;
      sug.style.opacity = String(sk);
      tr(sug, `translate(0 ${(1 - sk) * 12})`);
      if (sugK) {
        if (practice) {
          sgt.textContent = '맞춤 연습 시작!';
          sgs.textContent = sugK === 'A' ? '통분 → 분자끼리 더하기' : sugK === 'B' ? '나눌 수 있으면 약분하기' : '한 단계씩 천천히';
          sgbt.textContent = '1 / 5 문제';
        } else {
          sgt.textContent = `「${TY[sugK].n}」 3번째!`;
          sgs.textContent = sugK === 'A' ? '분모를 먼저 같게 해야 해요' : sugK === 'B' ? '답을 끝까지 약분해요' : '셈을 다시 확인해 봐요';
          sgbt.textContent = '맞춤 연습 5문제';
        }
      }
    }
    return {
      controls: [A.ctl],
      update(t) {
        now = t;
        R.sync();
        if (A.base < 0) A.base = t;
        if (!A.manual) {
          const CY = 11;
          const lt = t - A.base;
          const k = Math.floor(lt / CY);
          const p = lt - k * CY;
          const want = Math.min(SEQ.length, Math.floor((p - 0.3) / 1.15) + 1);
          if (want < list.length || (p < 0.3 && list.length)) resetAll();
          while (list.length < want) {
            const s = SEQ[list.length]!;
            push(s[0], s[1], s[2], A.base + k * CY + 0.3 + list.length * 1.15);
          }
          if (sugK && p > 8.6 && !practice) {
            practice = true;
            sugAt = t - 0.4;
          }
        }
        render();
      },
      dispose: () => R.dispose(),
    };
  },
};

/* ═════════════════════ i400 거의 맞았어요 ═════════════════════ */
type Verdict = { v: 'ok' | 'near' | 'no'; msg: string };
function judgeLen(s: string): Verdict {
  const t = s.trim().toLowerCase().replace(/\s+/g, '');
  const m = t.match(/^(\d+(?:\.\d+)?)(cm|mm|m|센티미터|센티|밀리미터|밀리)?$/);
  if (!m) return { v: 'no', msg: '수와 단위로 적어요 (예: 5cm)' };
  const n = +m[1]!;
  const u = m[2] ?? '';
  if (!u) {
    if (Math.abs(n - 5) <= 0.2) return { v: 'near', msg: '수는 맞아요! 단위를 붙여요 — 5 무엇?' };
    if (Math.abs(n - 50) <= 2) return { v: 'near', msg: '50 무엇일까요? 단위를 붙여요' };
    return { v: 'no', msg: '막대 끝이 닿은 눈금을 다시 봐요' };
  }
  const cm = u === 'mm' || u.startsWith('밀리') ? n / 10 : u === 'm' ? n * 100 : n;
  if (Math.abs(cm - 5) < 1e-9) return { v: 'ok', msg: u === 'mm' || u.startsWith('밀리') ? '정답! 50mm = 5cm, 같은 길이예요' : '정답! 눈금을 정확히 읽었어요' };
  if (Math.abs(cm - 5) <= 0.2) return { v: 'ok', msg: '정답 — 눈금 오차(±2mm) 안이에요' };
  if (Math.abs(cm * 10 - 5) < 1e-9 || Math.abs(cm / 10 - 5) < 1e-9 || Math.abs(cm / 100 - 5) < 1e-9) return { v: 'near', msg: '수는 맞는데 단위가 달라요 — cm 와 mm' };
  if (Math.abs(cm - 5) <= 0.6) return { v: 'near', msg: '거의 다 왔어요! 눈금을 한 번 더 세어 봐요' };
  return { v: 'no', msg: '막대 끝이 닿은 눈금을 다시 봐요' };
}
function judgeFrac(s: string): Verdict {
  const t = s.trim().replace(/\s+/g, '');
  const f = t.match(/^(\d+)\/(\d+)$/);
  if (f) {
    const n = +f[1]!;
    const d = +f[2]!;
    if (!d) return { v: 'no', msg: '분모에는 0을 쓸 수 없어요' };
    if (n * 2 === d) return n === 1 ? { v: 'ok', msg: '정답! 8칸 중 4칸 = 1/2' } : { v: 'near', msg: '같은 양이에요! 약분하면 더 간단해요' };
    if (d === 8 || d === 2 || d === 4) return { v: 'no', msg: '색칠한 칸 ÷ 전체 칸을 세어 봐요' };
    return { v: 'no', msg: '전체를 몇 칸으로 나눴는지 세어 봐요' };
  }
  const p = t.match(/^(\d+(?:\.\d+)?)(%)?$/);
  if (p) {
    const v = +p[1]! / (p[2] ? 100 : 1);
    if (Math.abs(v - 0.5) < 1e-9) return { v: 'near', msg: p[2] ? '양은 맞아요 — 분수로 써 볼까요?' : '값은 같아요! 분수로 써 볼까요?' };
    return { v: 'no', msg: '색칠한 칸 ÷ 전체 칸을 세어 봐요' };
  }
  return { v: 'no', msg: '분수로 적어요 (예: 3/4)' };
}
const i400: DemoDom = {
  kind: 'dom',
  caption: '「틀림」 대신 「한 걸음 더」 — 단위 빠짐 · 약분 안 한 분수 · 소수로 쓴 답 · 오차 범위를 구별해 판정',
  make(box) {
    const AUTO: [number, string][] = [
      [0, '5'],
      [0, '4.9cm'],
      [0, '50mm'],
      [1, '2/4'],
      [1, '0.5'],
      [1, '1/2'],
    ];
    const R = rig(box, 'h400', {
      css: `
.h400 .qt{font-size:11px;font-weight:900;fill:#3b2a1e}
.h400 .qs{font-size:8.5px;font-weight:700;fill:#8a6a4a}
.h400 .tk{stroke:#5a4630;stroke-width:.8}
.h400 .tn{font-size:7.5px;font-weight:800;fill:#5a4630}
.h400 .ab{fill:#fffaf0;stroke:#ffb25e;stroke-width:2.4}
.h400 .at{font-size:20px;font-weight:900;fill:#2e5aac}
.h400 .al{font-size:9px;font-weight:900;fill:#ffcf99}
.h400 .car{fill:#2e5aac}
.h400 .lamp rect{fill:#ffffff08;stroke:#ffffff1a;stroke-width:1.2;transition:fill .2s,stroke .2s}
.h400 .lamp text{font-size:10px;font-weight:900;fill:#8f7a66;transition:fill .2s}
.h400 .lamp circle{fill:#4a3a2e;transition:fill .2s}
.h400 .msg{font-size:11px;font-weight:800;fill:#ffe6c4}
.h400 .stamp text{font-size:13px;font-weight:900}
`,
      svg: (id) => `
<g class="q0">
  <rect x="16" y="12" width="288" height="78" rx="10" fill="url(#${id}pp)" filter="url(#${id}sh)"/>
  <text class="qt" x="28" y="31">막대의 길이는 얼마일까요?</text><text class="qs" x="186" y="31">눈금 1칸 = 1cm</text>
  <rect x="40" y="40" width="150" height="10" rx="3" fill="url(#${id}or)" stroke="#a24a16" stroke-width="1"/>
  <rect x="34" y="54" width="252" height="26" rx="3" fill="#ffe7a8" stroke="#b08a3c" stroke-width="1.2"/>
  ${Array.from({ length: 81 }, (_, i) => `<line class="tk" x1="${40 + i * 3}" x2="${40 + i * 3}" y1="54" y2="${54 + (i % 10 === 0 ? 10 : i % 5 === 0 ? 7 : 4)}"/>`).join('')}
  ${Array.from({ length: 9 }, (_, i) => `<text class="tn" x="${40 + i * 30}" y="75" text-anchor="middle">${i}</text>`).join('')}
</g>
<g class="q1" style="opacity:0">
  <rect x="16" y="12" width="288" height="78" rx="10" fill="url(#${id}pp)" filter="url(#${id}sh)"/>
  <text class="qt" x="28" y="36">색칠한 부분을 분수로 나타내요</text><text class="qs" x="28" y="54">피자 한 판을 똑같이 8조각</text>
  <g transform="translate(250 51)">
    <circle r="33" fill="#e9b062" stroke="#a8742a" stroke-width="2"/>
    ${Array.from({ length: 8 }, (_, i) => {
      const a0 = (i * Math.PI) / 4 - Math.PI / 2;
      const a1 = a0 + Math.PI / 4;
      const on = i < 4;
      return `<path d="M0 0 L${(Math.cos(a0) * 29).toFixed(1)} ${(Math.sin(a0) * 29).toFixed(1)} A29 29 0 0 1 ${(Math.cos(a1) * 29).toFixed(1)} ${(Math.sin(a1) * 29).toFixed(1)}Z" fill="${on ? '#ff7b54' : '#fff1d0'}" stroke="#a8742a" stroke-width="1.2"/>${
        on ? `<circle cx="${(Math.cos(a0 + 0.39) * 17).toFixed(1)}" cy="${(Math.sin(a0 + 0.39) * 17).toFixed(1)}" r="3" fill="#c93a2a"/>` : ''
      }`;
    }).join('')}
  </g>
</g>
<text class="al" x="62" y="114">내 답</text>
<rect class="ab" x="60" y="100" width="150" height="34" rx="9"/>
<text class="at" x="135" y="125" text-anchor="middle"></text>
<rect class="car" x="0" y="107" width="2" height="21" rx="1"/>
<g class="stamp" style="opacity:0"><circle cx="246" cy="117" r="22" fill="none" stroke-width="3"/><text x="246" y="122" text-anchor="middle"></text></g>
${[
  ['ok', '정답', '#4fd69c'],
  ['near', '한 걸음 더', '#ffc14d'],
  ['no', '다시 생각', '#ff6b5a'],
]
  .map(
    ([k, n, c], i) => `<g class="lamp" data-k="${k}" data-c="${c}"><rect x="${30 + i * 90}" y="145" width="80" height="22" rx="11"/><circle cx="${44 + i * 90}" cy="156" r="5"/><text x="${54 + i * 90}" y="160">${n}</text></g>`,
  )
  .join('')}
<text class="msg" x="160" y="187" text-anchor="middle"></text>`,
      panel: `<button class="btn ghost" data-a="sw">${ic('swap')}문제 바꾸기</button><input class="ans" maxlength="10" placeholder="답"/><button class="btn" data-a="go">${ic('check')}판정</button><span class="lab hintx"></span>`,
    });
    const root = R.root;
    const q0 = q(root, '.q0');
    const q1 = q(root, '.q1');
    const at2 = q<SVGTextElement>(root, '.at');
    const car = q(root, '.car');
    const stamp = q<SVGGElement>(root, '.stamp');
    const stC = q(stamp, 'circle');
    const stT = q<SVGTextElement>(stamp, 'text');
    const lamps = qa<SVGGElement>(root, '.lamp');
    const msg = q<SVGTextElement>(root, '.msg');
    const input = root.querySelector('input.ans') as HTMLInputElement;
    const hintx = root.querySelector('.hintx') as HTMLElement;
    let now = 0;
    const man = { q: 0, s: '', v: null as Verdict | null, at: 0 };
    const A = autoCtl(() => undefined);
    const hints = ['5 · 5cm · 4.9cm · 50mm · 7cm', '1/2 · 2/4 · 4/8 · 0.5 · 50% · 1/3'];
    hintx.textContent = `넣어 보기: ${hints[0]}`;
    function submit(): void {
      A.manual = true;
      man.s = input.value;
      man.v = man.q === 0 ? judgeLen(man.s) : judgeFrac(man.s);
      man.at = now;
    }
    root.addEventListener('pointerdown', (e) => {
      const el = (e.target as Element).closest('[data-a]');
      if (!el || !R.sync()) return;
      e.preventDefault();
      const a = el.getAttribute('data-a');
      if (a === 'go') submit();
      else if (a === 'sw') {
        A.manual = true;
        man.q = 1 - man.q;
        man.v = null;
        man.s = '';
        input.value = '';
        hintx.textContent = `넣어 보기: ${hints[man.q]}`;
        input.focus();
      }
    });
    input.addEventListener('focus', () => (A.manual = true));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
    function render(qi: number, s: string, v: Verdict | null, age: number, caret: boolean): void {
      q0.style.opacity = qi === 0 ? '1' : '0';
      q1.style.opacity = qi === 1 ? '1' : '0';
      at2.textContent = s;
      const w = s ? at2.getComputedTextLength() : 0;
      car.setAttribute('x', String(135 + w / 2 + 2));
      car.style.opacity = caret && Math.sin(now * 8) > 0 ? '1' : '0';
      const k = v ? backOut(seg(age, 0, 0.35)) : 0;
      stamp.style.opacity = v ? String(clamp(age / 0.15)) : '0';
      tr(stamp, `translate(246 117) scale(${(1.6 - 0.6 * k).toFixed(3)}) rotate(${-12 + 4 * k}) translate(-246 -117)`);
      const col = v ? (v.v === 'ok' ? '#4fd69c' : v.v === 'near' ? '#ffc14d' : '#ff6b5a') : '#fff';
      stC.setAttribute('stroke', col);
      stT.setAttribute('fill', col);
      stT.textContent = v ? (v.v === 'ok' ? '정답' : v.v === 'near' ? '거의!' : '다시') : '';
      lamps.forEach((l) => {
        const on = !!v && l.getAttribute('data-k') === v.v;
        const c = l.getAttribute('data-c')!;
        const r = q(l, 'rect');
        r.style.fill = on ? `${c}33` : '';
        r.style.stroke = on ? c : '';
        q(l, 'circle').style.fill = on ? c : '';
        q(l, 'text').style.fill = on ? '#fff' : '';
      });
      msg.textContent = v ? v.msg : qi === 0 ? '단위까지 써야 정답이에요' : '가장 간단한 분수로 써요';
      msg.style.opacity = v ? String(seg(age, 0.15, 0.4)) : '0.55';
    }
    return {
      controls: [A.ctl],
      update(t) {
        now = t;
        R.sync();
        if (A.base < 0) A.base = t;
        if (A.manual) {
          const typing = document.activeElement === input && input.value !== man.s;
          render(man.q, typing ? input.value : man.s, typing ? null : man.v, t - man.at, document.activeElement === input);
          return;
        }
        const lt = t - A.base;
        const CY = 2.5;
        const k = Math.floor(lt / CY);
        const p = lt - k * CY;
        const [qi, s] = AUTO[k % AUTO.length]!;
        const n = Math.min(s.length, Math.floor(p / 0.09));
        const done = p > s.length * 0.09 + 0.3;
        render(qi, s.slice(0, n), done ? (qi === 0 ? judgeLen(s) : judgeFrac(s)) : null, p - (s.length * 0.09 + 0.3), !done);
      },
      dispose: () => R.dispose(),
    };
  },
};

/* ═════════════════════ i401 칭찬 연출 세기 ═════════════════════ */
const i401: DemoDom = {
  kind: 'dom',
  caption: '작은 성공은 작게, 큰 성공은 크게 — 정답 · 3연속 · 처음 성공 · 어려운 문제마다 칭찬 세기가 4단계로',
  make(box) {
    const LV = [
      { w: '정답!', s: '+10', size: 15, col: '#4fd69c', n: 10 },
      { w: '3연속!', s: '좋아요 · +30', size: 21, col: '#6cc4ff', n: 34 },
      { w: '처음 성공!', s: '새 유형을 풀었어요', size: 27, col: '#ffb25e', n: 80 },
      { w: '대단해요!', s: '어려운 문제 · 10연속', size: 33, col: '#ffd166', n: 160 },
    ];
    const EV = ['정답', '정답 · 2연속', '3연속', '처음 푼 유형', '어려운 문제 · 10연속'];
    const R = rig(box, 'h401', {
      css: `
.h401 .ev rect{fill:#ffffff08;stroke:#ffffff16}
.h401 .ev text{font-size:8.5px;font-weight:800;fill:#a8917b}
.h401 .ev.on rect{fill:#ffb25e2a;stroke:#ffb25e}
.h401 .ev.on text{fill:#fff}
.h401 .bar{fill:#3a2b20;stroke:#ffffff14;transition:fill .2s}
.h401 .bl{font-size:8px;font-weight:800;fill:#a8917b;text-anchor:middle}
.h401 .bl.on{fill:#fff}
.h401 .mt{font-size:9px;font-weight:900;fill:#ffe2bd;text-anchor:middle}
.h401 .ht{font-size:9px;font-weight:900;fill:#ffe2bd}
.h401 .word{position:absolute;left:52.5%;top:44%;transform:translate(-50%,-50%);text-align:center;white-space:nowrap;pointer-events:none}
.h401 .word b{display:block;font-weight:900;letter-spacing:-.02em;-webkit-text-stroke:.5cqw #2a1406;paint-order:stroke fill;text-shadow:0 .8cqw 0 #2a1406,0 0 3cqw currentColor}
.h401 .word i{display:inline-block;margin-top:1cqw;font-style:normal;font-weight:900;font-size:3.4cqw;color:#2a1406;background:#fff1d8;padding:.4cqw 2cqw;border-radius:99px}
`,
      svg: () => `
<text class="ht" x="14" y="24">상황</text>
${EV.map((e, i) => `<g class="ev"><rect x="10" y="${32 + i * 30}" width="80" height="24" rx="8"/><text x="18" y="${48 + i * 30}">${e}</text></g>`).join('')}
<text class="mt" x="280" y="24">칭찬 세기</text>
${[0, 1, 2, 3].map((i) => `<rect class="bar" x="${252 + i * 15}" y="${150 - (i + 1) * 24}" width="11" height="${(i + 1) * 24}" rx="3"/><text class="bl" x="${257.5 + i * 15}" y="164">${i + 1}</text>`).join('')}
<text class="bl lvn" x="280" y="180" style="font-size:9px"></text>`,
      over: `<canvas class="cv"></canvas><div class="word"><b></b><i></i></div>`,
      panel: `<button class="btn mint" data-l="0">${ic('check')}정답</button><button class="btn" data-l="1">${ic('bolt')}3연속</button><button class="btn" data-l="2">${ic('flag')}처음 성공</button><button class="btn" data-l="3">${ic('star')}어려운 문제</button>`,
    });
    const root = R.root;
    const cv = root.querySelector('canvas.cv') as HTMLCanvasElement;
    const word = root.querySelector('.word') as HTMLElement;
    const wb = word.querySelector('b') as HTMLElement;
    const wi = word.querySelector('i') as HTMLElement;
    const evs = qa(root, '.ev');
    const bars = qa(root, '.bar');
    const bls = qa(root, '.bl');
    const lvn = q<SVGTextElement>(root, '.lvn');
    let always = false;
    let gain = 1;
    let now = 0;
    interface P {
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
      age: number;
      c: string;
      s: number;
      kind: 0 | 1 | 2;
      rot: number;
      vr: number;
    }
    let parts: P[] = [];
    let fx = { lv: -1, at: -9, ev: -1 };
    const A = autoCtl(() => (fx = { lv: -1, at: -9, ev: -1 }));
    const CX = 168;
    const CYY = 88;
    const CONF = ['#ff6b5a', '#ffd166', '#4fd69c', '#6cc4ff', '#c79bff', '#ff9bd2'];
    function fire(lv0: number, ev: number, t: number): void {
      const lv = always ? 3 : lv0;
      fx = { lv, at: t, ev };
      const L = LV[lv]!;
      const r = rng(t * 13 + lv);
      const n = Math.round(L.n * gain);
      for (let i = 0; i < n; i++) {
        if (lv === 0) {
          const a = r() * Math.PI * 2;
          const sp = 20 + r() * 30;
          parts.push({ x: CX, y: CYY, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 10, life: 0.6 + r() * 0.3, age: 0, c: L.col, s: 1.4 + r(), kind: 0, rot: 0, vr: 0 });
        } else if (lv === 1) {
          const a = (i / n) * Math.PI * 2;
          const sp = 70 + r() * 40;
          parts.push({ x: CX, y: CYY, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.8 + r() * 0.3, age: 0, c: r() < 0.5 ? L.col : '#fff', s: 3 + r() * 2, kind: 1, rot: r() * 6, vr: (r() - 0.5) * 8 });
        } else {
          const side = lv === 3 ? (i % 2 ? 1 : -1) : 0;
          const fromTop = lv === 2 || i % 3 === 0;
          const x = fromTop ? 100 + r() * 140 : side < 0 ? 96 : 240;
          const y = fromTop ? -6 - r() * 30 : 170;
          const vx = fromTop ? (r() - 0.5) * 30 : side * -(40 + r() * 60);
          const vy = fromTop ? 30 + r() * 40 : -(150 + r() * 80);
          parts.push({ x, y, vx, vy, life: 1.8 + r() * 0.8, age: 0, c: CONF[i % CONF.length]!, s: 2.4 + r() * 2, kind: 2, rot: r() * 6, vr: (r() - 0.5) * 14 });
          if (lv === 3 && i % 4 === 0) {
            const a = r() * Math.PI * 2;
            parts.push({ x: CX, y: CYY, vx: Math.cos(a) * (90 + r() * 70), vy: Math.sin(a) * (90 + r() * 70), life: 0.9, age: 0, c: '#fff6c8', s: 3.5, kind: 1, rot: 0, vr: 4 });
          }
        }
      }
    }
    root.addEventListener('pointerdown', (e) => {
      const el = (e.target as Element).closest('[data-l]');
      if (!el || !R.sync()) return;
      A.manual = true;
      const l = +(el.getAttribute('data-l') ?? 0);
      fire(l, [0, 2, 3, 4][l]!, now);
    });
    function star(g: CanvasRenderingContext2D, s: number): void {
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? s * 0.45 : s;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
    }
    return {
      controls: [
        A.ctl,
        { type: 'toggle', label: '세기 조절 끄기 (늘 최고로)', value: false, on: (v) => (always = v) },
        { type: 'range', label: '입자 배율', min: 0.3, max: 1.6, step: 0.1, value: 1, on: (v) => (gain = v) },
      ],
      update(t, dt) {
        now = t;
        R.sync();
        if (A.base < 0) A.base = t;
        if (!A.manual) {
          const lt = t - A.base;
          const CY = 11.5;
          const k = Math.floor(lt / CY);
          const p = lt - k * CY;
          const TT = [0.3, 1.8, 3.4, 5.6, 8.0];
          const LL = [0, 0, 1, 2, 3];
          let e = -1;
          for (let i = 0; i < TT.length; i++) if (p >= TT[i]!) e = i;
          const key = k * 10 + e;
          if (e >= 0 && key !== (fx as { key?: number }).key) {
            fire(LL[e]!, e, A.base + k * CY + TT[e]!);
            (fx as { key?: number }).key = key;
          }
        }
        const age = t - fx.at;
        const lv = fx.lv;
        const L = lv >= 0 ? LV[lv]! : null;
        const dur = lv === 3 ? 2.6 : lv === 2 ? 2.1 : lv === 1 ? 1.5 : 1.0;
        evs.forEach((e, i) => e.classList.toggle('on', i === fx.ev && age < dur + 0.3));
        bars.forEach((b, i) => {
          const on = lv >= i && age < dur + 0.3;
          b.style.fill = on ? ['#4fd69c', '#6cc4ff', '#ffb25e', '#ffd166'][i]! : '';
          bls[i]!.classList.toggle('on', on);
        });
        lvn.textContent = L && age < dur + 0.3 ? ['작게', '보통', '크게', '최고'][lv]! : '';
        // 글자
        if (L && age < dur) {
          const k = backOut(seg(age, 0, lv >= 2 ? 0.4 : 0.25));
          const out = seg(age, dur - 0.3, dur);
          wb.textContent = L.w;
          wi.textContent = L.s;
          wb.style.fontSize = `${L.size * 0.3125}cqw`;
          wb.style.color = L.col;
          wi.style.display = lv >= 1 ? 'inline-block' : 'none';
          const bob = lv === 0 ? (1 - k) * 2 : 0;
          word.style.opacity = String(1 - out);
          word.style.transform = `translate(-50%,-50%) translateY(${bob - out * 3}cqw) scale(${k})`;
        } else word.style.opacity = '0';
        // 캔버스
        const g = fitCanvas(cv);
        if (L && lv === 3 && age < dur) {
          const k = Math.min(seg(age, 0, 0.3), 1 - seg(age, dur - 0.5, dur));
          g.save();
          g.translate(CX, CYY);
          g.rotate(t * 0.6);
          g.globalAlpha = 0.28 * k;
          g.fillStyle = '#ffd166';
          for (let i = 0; i < 14; i++) {
            g.rotate((Math.PI * 2) / 14);
            g.beginPath();
            g.moveTo(0, 0);
            g.lineTo(220, -16);
            g.lineTo(220, 16);
            g.closePath();
            g.fill();
          }
          g.restore();
          const rg = g.createRadialGradient(CX, CYY, 0, CX, CYY, 70);
          rg.addColorStop(0, `rgba(255,230,150,${0.45 * k})`);
          rg.addColorStop(1, 'rgba(255,230,150,0)');
          g.fillStyle = rg;
          g.fillRect(0, 0, 320, 200);
        }
        if (L && lv >= 1 && age < 0.25) {
          g.globalAlpha = (1 - age / 0.25) * (lv === 3 ? 0.35 : lv === 2 ? 0.18 : 0.1);
          g.fillStyle = '#fff6dc';
          g.fillRect(0, 0, 320, 200);
          g.globalAlpha = 1;
        }
        const d = Math.min(dt, 0.05);
        parts = parts.filter((p) => (p.age += d) < p.life);
        for (const p of parts) {
          if (p.kind === 2) {
            p.vy += 160 * d;
            p.vx *= 1 - 0.8 * d;
            p.vy *= 1 - 0.6 * d;
          } else {
            p.vx *= 1 - 2.6 * d;
            p.vy *= 1 - 2.6 * d;
          }
          p.x += p.vx * d;
          p.y += p.vy * d;
          p.rot += p.vr * d;
          const a = 1 - sm(seg(p.age, p.life * 0.65, p.life));
          g.globalAlpha = a;
          g.fillStyle = p.c;
          g.save();
          g.translate(p.x, p.y);
          g.rotate(p.rot);
          if (p.kind === 0) {
            g.beginPath();
            g.arc(0, 0, p.s, 0, Math.PI * 2);
            g.fill();
          } else if (p.kind === 1) star(g, p.s);
          else {
            g.scale(1, Math.cos(p.rot * 1.7));
            g.fillRect(-p.s, -p.s * 0.55, p.s * 2, p.s * 1.1);
          }
          g.restore();
        }
        g.globalAlpha = 1;
        // 흔들림
        if (L && lv === 3 && age < 0.5) {
          const s = (1 - age / 0.5) * 0.8;
          R.stage.style.transform = `translate(${Math.sin(age * 70) * s}cqw,${Math.cos(age * 57) * s}cqw)`;
        } else R.stage.style.transform = '';
      },
      dispose: () => R.dispose(),
    };
  },
};

/* ═════════════════════ i402 적응형 난이도 ═════════════════════ */
const LVNAME = ['', '한 자리 덧셈', '10 넘는 덧셈', '두 자리 + 한 자리', '두 자리 덧셈', '받아올림 덧셈', '받아내림 뺄셈', '구구단', '두 자리 × 한 자리', '세 자리 덧셈', '두 자리 × 두 자리'];
function makeQ(lv: number, r: () => number): { text: string; ans: number } {
  const ri = (a: number, b: number): number => a + Math.floor(r() * (b - a + 1));
  switch (lv) {
    case 1: {
      const a = ri(1, 5);
      const b = ri(1, 9 - a);
      return { text: `${a} + ${b}`, ans: a + b };
    }
    case 2: {
      const a = ri(5, 9);
      const b = ri(11 - a, 9);
      return { text: `${a} + ${b}`, ans: a + b };
    }
    case 3: {
      const a = ri(2, 8) * 10 + ri(0, 4);
      const b = ri(1, 5);
      return { text: `${a} + ${b}`, ans: a + b };
    }
    case 4: {
      const a = ri(1, 4) * 10 + ri(0, 4);
      const b = ri(1, 4) * 10 + ri(0, 5);
      return { text: `${a} + ${b}`, ans: a + b };
    }
    case 5: {
      const a = ri(1, 6) * 10 + ri(5, 9);
      const b = ri(1, 2) * 10 + ri(5, 9);
      return { text: `${a} + ${b}`, ans: a + b };
    }
    case 6: {
      const a = ri(5, 9) * 10 + ri(0, 4);
      const b = ri(1, 4) * 10 + ri(5, 9);
      return { text: `${a} − ${b}`, ans: a - b };
    }
    case 7: {
      const a = ri(3, 9);
      const b = ri(3, 9);
      return { text: `${a} × ${b}`, ans: a * b };
    }
    case 8: {
      const a = ri(12, 49);
      const b = ri(3, 8);
      return { text: `${a} × ${b}`, ans: a * b };
    }
    case 9: {
      const a = ri(120, 680);
      const b = ri(150, 299);
      return { text: `${a} + ${b}`, ans: a + b };
    }
    default: {
      const a = ri(12, 39);
      const b = ri(12, 29);
      return { text: `${a} × ${b}`, ans: a * b };
    }
  }
}
const i402: DemoDom = {
  kind: 'dom',
  caption: '최근 정답률이 85%를 넘으면 한 단계 위, 70% 밑이면 한 단계 아래 — 몰입 구간 안에서 난이도 계단이 올라가요',
  make(box) {
    const N = 40;
    const R = rig(box, 'h402', { over: `<canvas class="cv"></canvas>`, panel: `<span class="lab plab"></span><input class="ans" inputmode="numeric" maxlength="6" placeholder="답"/><button class="btn" data-a="go">${ic('check')}확인</button><span class="lab res"></span>` });
    const root = R.root;
    const cv = root.querySelector('canvas.cv') as HTMLCanvasElement;
    const input = root.querySelector('input.ans') as HTMLInputElement;
    const plab = root.querySelector('.plab') as HTMLElement;
    const res = root.querySelector('.res') as HTMLElement;
    let showFixed = true;
    interface Ser {
      rate: number[];
      diff: number[];
      ok: boolean[];
      fixed: number[];
    }
    function simulate(seed: number): Ser {
      const r = rng(seed);
      const s: Ser = { rate: [], diff: [], ok: [], fixed: [] };
      let rate = 0.78;
      let fr = 0.5;
      let diff = 2;
      let cool = 0;
      for (let i = 0; i < N; i++) {
        const skill = 1.2 + i * 0.19;
        const p = 1 / (1 + Math.exp(-(skill - diff + 1) * 1.3));
        const ok = r() < p;
        const pf = 1 / (1 + Math.exp(-(skill - 5 + 1) * 1.3));
        fr = fr * 0.82 + (r() < pf ? 1 : 0) * 0.18;
        rate = rate * 0.78 + (ok ? 1 : 0) * 0.22;
        s.ok.push(ok);
        s.rate.push(rate);
        s.diff.push(diff);
        s.fixed.push(fr);
        if (cool > 0) cool--;
        else if (rate > 0.85 && diff < 10) {
          diff++;
          cool = 1;
        } else if (rate < 0.7 && diff > 1) {
          diff--;
          cool = 1;
        }
      }
      return s;
    }
    let sim = simulate(1);
    let simK = -1;
    const man = { rate: [] as number[], diff: [] as number[], ok: [] as boolean[], cur: 0.78, d: 3, cool: 0, q: makeQ(3, rng(5)), r: rng(99), at: -9, last: '' };
    let now = 0;
    const A = autoCtl(() => undefined);
    function setQ(): void {
      man.q = makeQ(man.d, man.r);
      plab.textContent = `Lv ${man.d} · ${man.q.text} =`;
      input.value = '';
    }
    setQ();
    function submit(): void {
      if (!A.manual) {
        A.manual = true;
        man.rate = [];
        man.diff = [];
        man.ok = [];
        man.cur = 0.78;
      }
      if (!input.value.trim()) return;
      const ok = +input.value.trim() === man.q.ans;
      man.cur = man.cur * 0.84 + (ok ? 1 : 0) * 0.16;
      man.ok.push(ok);
      man.rate.push(man.cur);
      man.diff.push(man.d);
      res.textContent = ok ? '맞았어요' : `정답 ${man.q.ans}`;
      res.style.color = ok ? '#7ef0be' : '#ff9b7a';
      man.last = '';
      if (man.cool > 0) man.cool--;
      else if (man.cur > 0.85 && man.d < 10) {
        man.d++;
        man.cool = 2;
        man.last = 'up';
      } else if (man.cur < 0.7 && man.d > 1) {
        man.d--;
        man.cool = 2;
        man.last = 'down';
      }
      man.at = now;
      if (man.rate.length > N) {
        man.rate.shift();
        man.diff.shift();
        man.ok.shift();
      }
      setQ();
    }
    root.addEventListener('pointerdown', (e) => {
      const el = (e.target as Element).closest('[data-a]');
      if (!el || !R.sync()) return;
      e.preventDefault();
      submit();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
    const X0 = 34;
    const X1 = 226;
    const Y0 = 32;
    const Y1 = 132;
    const xOf = (i: number): number => X0 + ((X1 - X0) * i) / (N - 1);
    const yOf = (v: number): number => Y1 - (Y1 - Y0) * v;
    return {
      controls: [A.ctl, { type: 'toggle', label: '고정 난이도와 비교', value: true, on: (v) => (showFixed = v) }],
      update(t) {
        now = t;
        R.sync();
        if (A.base < 0) A.base = t;
        let n: number;
        let rate: number[];
        let diff: number[];
        let oks: boolean[];
        let fixed: number[] = [];
        let change = '';
        let changeAge = 9;
        if (A.manual) {
          rate = man.rate;
          diff = man.diff;
          oks = man.ok;
          n = rate.length;
          change = man.last;
          changeAge = t - man.at;
        } else {
          const lt = t - A.base;
          const CY = 13;
          const k = Math.floor(lt / CY);
          if (k !== simK) {
            simK = k;
            sim = simulate(k + 3);
          }
          const p = lt - k * CY;
          n = Math.min(N, Math.floor(p * 3.8) + 1);
          rate = sim.rate;
          diff = sim.diff;
          oks = sim.ok;
          fixed = sim.fixed;
          if (n >= 2 && n <= N) {
            const dd = diff[n - 1]! - diff[n - 2]!;
            if (dd) {
              change = dd > 0 ? 'up' : 'down';
              changeAge = p * 3.8 - (n - 1);
            } else {
              for (let j = n - 1; j >= 1 && n - j < 3; j--) {
                const d2 = diff[j]! - diff[j - 1]!;
                if (d2) {
                  change = d2 > 0 ? 'up' : 'down';
                  changeAge = (p * 3.8 - j) / 3.8;
                  break;
                }
              }
            }
          }
        }
        const g = fitCanvas(cv);
        // 판
        rrect(g, 8, 10, 228, 182, 12);
        g.fillStyle = 'rgba(43,29,21,.92)';
        g.fill();
        g.strokeStyle = 'rgba(255,255,255,.07)';
        g.stroke();
        ctext(g, '최근 정답률', 16, 18, 8.5, '#ffe2bd', 'left', 900);
        // 몰입 띠
        g.fillStyle = 'rgba(79,214,156,.16)';
        g.fillRect(X0, yOf(0.85), X1 - X0, yOf(0.7) - yOf(0.85));
        g.strokeStyle = 'rgba(79,214,156,.6)';
        g.setLineDash([3, 3]);
        g.lineWidth = 0.8;
        g.beginPath();
        g.moveTo(X0, yOf(0.85));
        g.lineTo(X1, yOf(0.85));
        g.moveTo(X0, yOf(0.7));
        g.lineTo(X1, yOf(0.7));
        g.stroke();
        g.setLineDash([]);
        ctext(g, '몰입 구간 70~85%', X1 - 2, yOf(0.7) + 6, 7, '#7ef0be', 'right', 900);
        for (const v of [0, 0.5, 1]) {
          g.strokeStyle = 'rgba(255,255,255,.07)';
          g.beginPath();
          g.moveTo(X0, yOf(v));
          g.lineTo(X1, yOf(v));
          g.stroke();
          ctext(g, `${v * 100}%`, X0 - 4, yOf(v), 7, '#9a8470', 'right', 700);
        }
        // 고정 난이도 선
        if (showFixed && fixed.length && n > 1) {
          g.strokeStyle = 'rgba(190,170,150,.55)';
          g.lineWidth = 1.4;
          g.setLineDash([3, 2.5]);
          g.beginPath();
          for (let i = 0; i < n; i++) g[i ? 'lineTo' : 'moveTo'](xOf(i), yOf(fixed[i]!));
          g.stroke();
          g.setLineDash([]);
          if (n > 6) ctext(g, '고정 난이도', xOf(3), yOf(Math.min(fixed[3]!, 0.5)) + 10, 7, '#c8b6a2', 'left', 800);
        }
        // 적응형 선
        if (n > 1) {
          g.strokeStyle = '#ffb25e';
          g.lineWidth = 2.4;
          g.lineJoin = 'round';
          g.shadowColor = '#ff9b42';
          g.shadowBlur = 6;
          g.beginPath();
          for (let i = 0; i < n; i++) g[i ? 'lineTo' : 'moveTo'](xOf(i), yOf(rate[i]!));
          g.stroke();
          g.shadowBlur = 0;
        }
        if (n > 0) {
          const v = rate[n - 1]!;
          g.fillStyle = '#fff';
          g.beginPath();
          g.arc(xOf(n - 1), yOf(v), 3, 0, Math.PI * 2);
          g.fill();
          ctext(g, `${Math.round(v * 100)}%`, xOf(n - 1), yOf(v) - 8, 8, '#ffd9a8', 'center', 900);
        }
        // 맞음/틀림 점
        for (let i = 0; i < n; i++) {
          g.fillStyle = oks[i] ? '#4fd69c' : '#ff6b5a';
          g.beginPath();
          g.arc(xOf(i), 140, 1.7, 0, Math.PI * 2);
          g.fill();
        }
        // 난이도 막대
        ctext(g, '난이도', 16, 150, 7.5, '#9a8470', 'left', 800);
        for (let i = 0; i < n; i++) {
          const d = diff[i]!;
          const h = d * 3.2;
          const hue = 30 + (d - 1) * -3;
          g.fillStyle = `hsl(${hue},85%,${48 + d * 2.5}%)`;
          g.fillRect(xOf(i) - 1.8, 186 - h, 3.6, h);
        }
        // 오른쪽 사다리
        const cd = n ? diff[n - 1]! : 1;
        rrect(g, 244, 10, 68, 182, 12);
        g.fillStyle = 'rgba(43,29,21,.92)';
        g.fill();
        ctext(g, '다음 난이도', 278, 20, 8, '#ffe2bd', 'center', 900);
        for (let lv = 1; lv <= 10; lv++) {
          const y = 182 - (lv - 1) * 15;
          const on = lv === cd;
          rrect(g, 254, y - 5.5, 48, 11, 5.5);
          g.fillStyle = on ? '#ffb25e' : lv < cd ? 'rgba(255,178,94,.25)' : 'rgba(255,255,255,.05)';
          g.fill();
          ctext(g, `Lv ${lv}`, 278, y + 0.3, 7, on ? '#2a1406' : lv < cd ? '#ffd9a8' : '#7d6a58', 'center', 900);
        }
        if (change && changeAge < 1.2) {
          const y = 176 - (cd - 1) * 15;
          const a = 1 - seg(changeAge, 0.7, 1.2);
          g.globalAlpha = a;
          const up = change === 'up';
          void y;
          ctext(g, up ? '▲ 올렸어요' : '▼ 내렸어요', 278, 31 - (up ? 1 : -1) * changeAge * 2, 7.5, up ? '#7ef0be' : '#ff9b7a', 'center', 900);
          g.globalAlpha = 1;
        }
        ctext(g, LVNAME[cd] ?? '', 120, 18, 7.5, '#d8c2a8', 'left', 700);
        if (A.manual && !n) ctext(g, '아래 문제를 풀면 그래프가 그려져요', 130, 80, 9, '#ffe2bd', 'center', 800);
      },
      dispose: () => R.dispose(),
    };
  },
};

/* ═════════════════════ i403 간격 반복 ═════════════════════ */
const i403: DemoDom = {
  kind: 'dom',
  caption: '틀린 문제를 1일 · 3일 · 7일 뒤 다시 — 복습할 때마다 기억이 100%로 돌아오고 더 천천히 잊어요',
  make(box) {
    const DAYS = 14;
    const SVAL = [2, 5, 12, 30, 60, 90];
    const R = rig(box, 'h403', { over: `<canvas class="cv"></canvas>`, panel: `<span class="lab">그래프를 눌러 복습 날짜를 넣고 빼요</span><button class="btn" data-a="rec">${ic('redo')}추천 1 · 3 · 7일</button><button class="btn ghost" data-a="clr">${ic('xc')}복습 모두 빼기</button>` });
    const root = R.root;
    const cv = root.querySelector('canvas.cv') as HTMLCanvasElement;
    let reviews = [1, 3, 7];
    let showNo = true;
    const A = autoCtl(() => (reviews = [1, 3, 7]));
    const X0 = 34;
    const X1 = 304;
    const Y0 = 36;
    const Y1 = 132;
    const xOf = (d: number): number => X0 + ((X1 - X0) * d) / DAYS;
    const yOf = (v: number): number => Y1 - (Y1 - Y0) * v;
    function retention(d: number, rv: number[]): number {
      let last = 0;
      let k = 0;
      for (const r of rv) if (r <= d) {
        last = r;
        k++;
      }
      return Math.exp(-(d - last) / SVAL[Math.min(k, SVAL.length - 1)]!);
    }
    cv.addEventListener('pointerdown', (e) => {
      if (!R.sync()) return;
      const rc = cv.getBoundingClientRect();
      const x = ((e.clientX - rc.left) / rc.width) * 320;
      const d = Math.round(((x - X0) / (X1 - X0)) * DAYS);
      if (d < 1 || d > DAYS) return;
      A.manual = true;
      reviews = reviews.includes(d) ? reviews.filter((r) => r !== d) : [...reviews, d].sort((a, b) => a - b);
    });
    cv.style.pointerEvents = 'auto';
    root.addEventListener('pointerdown', (e) => {
      const el = (e.target as Element).closest('[data-a]');
      if (!el || !R.sync()) return;
      A.manual = true;
      reviews = el.getAttribute('data-a') === 'rec' ? [1, 3, 7] : [];
    });
    return {
      controls: [A.ctl, { type: 'toggle', label: '복습 안 한 곡선 보기', value: true, on: (v) => (showNo = v) }],
      update(t) {
        const big = R.sync();
        cv.style.cursor = big ? 'pointer' : '';
        if (A.base < 0) A.base = t;
        const lt = t - A.base;
        const CY = 10;
        const p = lt % CY;
        const cur = A.manual ? DAYS : Math.min(DAYS, sm(seg(p, 0.3, 7.6)) * DAYS);
        const g = fitCanvas(cv);
        rrect(g, 8, 8, 304, 132, 12);
        g.fillStyle = 'rgba(43,29,21,.92)';
        g.fill();
        ctext(g, '기억에 남은 정도', 16, 15, 8.5, '#ffe2bd', 'left', 900);
        for (const v of [0, 0.5, 1]) {
          g.strokeStyle = 'rgba(255,255,255,.07)';
          g.lineWidth = 0.8;
          g.beginPath();
          g.moveTo(X0, yOf(v));
          g.lineTo(X1, yOf(v));
          g.stroke();
          ctext(g, `${v * 100}%`, X0 - 4, yOf(v), 7, '#9a8470', 'right', 700);
        }
        g.strokeStyle = 'rgba(255,107,90,.55)';
        g.setLineDash([3, 3]);
        g.beginPath();
        g.moveTo(X0, yOf(0.6));
        g.lineTo(X1, yOf(0.6));
        g.stroke();
        g.setLineDash([]);
        ctext(g, '이쯤에서 잊기 시작', X1 - 2, yOf(0.6) + 7, 7, '#ff9b7a', 'right', 800);
        // 복습 없는 곡선
        if (showNo) {
          g.strokeStyle = 'rgba(190,170,150,.5)';
          g.lineWidth = 1.4;
          g.setLineDash([3, 2.5]);
          g.beginPath();
          for (let i = 0; i <= 140; i++) {
            const d = (i / 140) * cur;
            g[i ? 'lineTo' : 'moveTo'](xOf(d), yOf(Math.exp(-d / SVAL[0]!)));
          }
          g.stroke();
          g.setLineDash([]);
          if (cur > 4) ctext(g, '복습 안 함', xOf(Math.min(cur, 8)) + 2, yOf(Math.exp(-Math.min(cur, 8) / 2)) - 7, 7, '#c8b6a2', 'left', 800);
        }
        // 복습 곡선 (채움 + 선)
        const pts: [number, number][] = [];
        for (let i = 0; i <= 280; i++) {
          const d = (i / 280) * cur;
          for (const r of reviews)
            if (r <= d && r > d - cur / 280 && r > 0) {
              pts.push([xOf(r), yOf(retention(r - 1e-6, reviews))]);
              pts.push([xOf(r), yOf(1)]);
            }
          pts.push([xOf(d), yOf(retention(d, reviews))]);
        }
        const gr = g.createLinearGradient(0, Y0, 0, Y1);
        gr.addColorStop(0, 'rgba(255,178,94,.35)');
        gr.addColorStop(1, 'rgba(255,178,94,0)');
        g.beginPath();
        g.moveTo(X0, Y1);
        for (const [x, y] of pts) g.lineTo(x, y);
        g.lineTo(pts[pts.length - 1]![0], Y1);
        g.closePath();
        g.fillStyle = gr;
        g.fill();
        g.strokeStyle = '#ffb25e';
        g.lineWidth = 2.3;
        g.lineJoin = 'round';
        g.shadowColor = '#ff9b42';
        g.shadowBlur = 6;
        g.beginPath();
        pts.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y));
        g.stroke();
        g.shadowBlur = 0;
        // 복습 점
        for (const r of reviews) {
          if (r > cur) {
            g.strokeStyle = 'rgba(255,209,102,.35)';
            g.setLineDash([2, 2]);
            g.beginPath();
            g.moveTo(xOf(r), Y0);
            g.lineTo(xOf(r), Y1);
            g.stroke();
            g.setLineDash([]);
            continue;
          }
          const age = (cur - r) * (7.3 / DAYS);
          const pop = age < 0.5 ? 1 + 0.6 * Math.sin((age / 0.5) * Math.PI) : 1;
          g.fillStyle = '#ffd166';
          g.beginPath();
          g.arc(xOf(r), yOf(1), 3.6 * pop, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = '#2a1406';
          g.lineWidth = 1.2;
          g.stroke();
          ctext(g, `${r}일`, xOf(r), yOf(1) - 8, 7.5, '#ffe6b0', 'center', 900);
        }
        // 지금 줄
        if (!A.manual) {
          g.strokeStyle = 'rgba(255,255,255,.5)';
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(xOf(cur), Y0 - 2);
          g.lineTo(xOf(cur), Y1);
          g.stroke();
        }
        for (let d = 0; d <= DAYS; d += 1) ctext(g, String(d), xOf(d), Y1 + 6, 6, d % 7 === 0 ? '#d8c2a8' : '#7d6a58', 'center', 700);
        // 달력 띠
        const cw = (X1 - X0) / DAYS;
        for (let d = 0; d <= DAYS; d++) {
          const x = xOf(d) - cw * 0.44;
          const isR = reviews.includes(d) || d === 0;
          const passed = d <= cur;
          rrect(g, x, 148, cw * 0.88, 44, 4);
          g.fillStyle = isR ? (passed ? 'rgba(255,178,94,.2)' : 'rgba(255,255,255,.06)') : 'rgba(255,255,255,.03)';
          g.fill();
          if (isR) {
            const flip = passed ? clamp((cur - d) * 2.5) : 0;
            const sx = Math.abs(Math.cos(flip * Math.PI));
            const back = flip > 0.5;
            g.save();
            g.translate(xOf(d), 168);
            g.scale(Math.max(0.05, sx), 1);
            rrect(g, -cw * 0.36, -12, cw * 0.72, 24, 3);
            g.fillStyle = back ? '#d9f6e4' : d === 0 ? '#fffaf0' : '#fff1d8';
            g.fill();
            ctext(g, back ? '56' : '7×8', 0, back ? -3 : 0, cw * 0.24, '#3b2a1e', 'center', 900);
            if (back) ctext(g, '✓', 0, 6.5, 6, '#1f8a57', 'center', 900);
            g.restore();
          }
          ctext(g, d === 0 ? '배움' : `D+${d}`, xOf(d), 188, 5.2, isR ? '#ffd9a8' : '#6d5a4a', 'center', 800);
        }
        const fin = retention(DAYS, reviews);
        ctext(g, `14일 뒤 기억 ${Math.round(fin * 100)}%`, 196, 15, 8.5, '#ffd166', 'center', 900);
      },
      dispose: () => R.dispose(),
    };
  },
};

/* ═════════════════════ i404 손가락 코치 ═════════════════════ */
const i404: DemoDom = {
  kind: 'dom',
  caption: '처음 하는 동작은 손가락이 먼저 시범 → 따라 하면 다음 단계, 멈추면 손가락이 다시 보여 줘요',
  make(box) {
    const TILES = [
      { v: 2, x: 86 },
      { v: 4, x: 142 },
      { v: 5, x: 198 },
    ];
    const TY = 112;
    const TS = 36;
    const SLX = 150;
    const SLY = 34;
    const R = rig(box, 'h404', {
      css: `
.h404 .eq{font-size:30px;font-weight:900;fill:#3b2a1e}
.h404 .slot{fill:#fff3dc;stroke:#e08a3a;stroke-width:2.2;stroke-dasharray:5 4}
.h404 .slot.glow{stroke:#ffb25e}
.h404 .tl rect{fill:url(#ORID);stroke:#a24a16;stroke-width:1.6}
.h404 .tl text{font-size:22px;font-weight:900;fill:#2a1406}
.h404.big .tl{cursor:grab}
.h404 .gt rect{fill:#ffb25e;stroke:#a24a16;stroke-width:1.6;stroke-dasharray:4 3}
.h404 .gt text{font-size:22px;font-weight:900;fill:#2a1406}
.h404 .ck rect{fill:#2fb57e;stroke:#1c7a52;stroke-width:1.6}
.h404 .ck text{font-size:12px;font-weight:900;fill:#062a1a}
.h404 .ck .ci{stroke:#062a1a}
.h404.big .ck{cursor:pointer}
.h404 .stp{font-size:10px;font-weight:900;fill:#ffe6c4}
.h404 .dotx{fill:#5c4a3a}
.h404 .dotx.on{fill:#ffb25e}
.h404 .rip{fill:none;stroke:#ffd166;stroke-width:2.4}
.h404 .done{font-size:20px;font-weight:900;fill:#7ef0be}
.h404 .msg{font-size:9.5px;font-weight:800;fill:#ffb39a}
.h404 .idle{fill:none;stroke:#ffd166;stroke-width:2.2;stroke-linecap:round}
`.replace('ORID', 'lfORID'),
      svg: (id) => `
<g class="hdr"><text class="stp" x="20" y="20"></text>
<circle class="dotx" cx="286" cy="16" r="3.5"/><circle class="dotx" cx="298" cy="16" r="3.5"/>
<circle class="idle" cx="268" cy="16" r="5" pathLength="1" stroke-dasharray="1 1" style="opacity:0"/></g>
<rect x="56" y="26" width="208" height="54" rx="12" fill="url(#${id}pp)" filter="url(#${id}sh)"/>
<text class="eq" x="104" y="64" text-anchor="middle">3 +</text>
<rect class="slot" x="${SLX}" y="${SLY}" width="${TS}" height="${TS}" rx="8"/>
<text class="eq" x="222" y="64" text-anchor="middle">= 7</text>
${TILES.map((tl, i) => `<g class="tl" data-t="${i}"><rect x="${-TS / 2}" y="${-TS / 2}" width="${TS}" height="${TS}" rx="8" fill="url(#${id}or)" filter="url(#${id}sh)"/><text y="8" text-anchor="middle">${tl.v}</text></g>`).join('')}
<g class="gt" style="opacity:0"><rect x="${-TS / 2}" y="${-TS / 2}" width="${TS}" height="${TS}" rx="8" opacity=".75"/><text y="8" text-anchor="middle" opacity=".8">4</text></g>
<g class="ck"><rect x="118" y="160" width="84" height="28" rx="14" filter="url(#${id}sh)"/>${sic('check', 136, 166, 16, 'ci')}<text x="156" y="179">확인</text></g>
<text class="msg" x="160" y="104" text-anchor="middle"></text>
<text class="done" x="160" y="104" text-anchor="middle" style="opacity:0">잘했어요!</text>
<circle class="rip" r="8" style="opacity:0"/>
<g class="cur" style="opacity:0">${CURSOR}</g>
<g class="hand" style="opacity:0">${HAND}</g>`,
      panel: `<span class="lab">숫자 타일을 직접 끌어 보세요 · 가만히 있으면 손가락이 다시 보여 줘요</span><button class="btn ghost" data-a="reset">${ic('redo')}다시 하기</button>`,
    });
    const root = R.root;
    root.querySelector('style')!.textContent = root.querySelector('style')!.textContent!.replace('lfORID', `${R.id}or`);
    const svg = R.svg!;
    const tls = qa<SVGGElement>(root, '.tl');
    const gt = q<SVGGElement>(root, '.gt');
    const ck = q<SVGGElement>(root, '.ck');
    const slot = q(root, '.slot');
    const stp = q<SVGTextElement>(root, '.stp');
    const dots = qa(root, '.dotx');
    const idle = q(root, '.idle');
    const rip = q(root, '.rip');
    const cur = q<SVGGElement>(root, '.cur');
    const hand = q<SVGGElement>(root, '.hand');
    const done = q(root, '.done');
    const msg = q<SVGTextElement>(root, '.msg');
    const SC = { x: SLX + TS / 2, y: SLY + TS / 2 };
    const CK = { x: 160, y: 174 };
    const home = (i: number): { x: number; y: number } => ({ x: TILES[i]!.x + TS / 2, y: TY + TS / 2 });
    // 직접 해 보기 상태
    const man = { step: 1, lastAct: 0, drag: -1, dx: 0, dy: 0, pos: TILES.map((_, i) => home(i)), back: -1, backAt: 0, backFrom: { x: 0, y: 0 }, doneAt: 0, msg: '', msgAt: -9, demoT0: 0 };
    let now = 0;
    const A = autoCtl(() => resetMan());
    function resetMan(): void {
      man.step = 1;
      man.lastAct = now;
      man.drag = -1;
      man.pos = TILES.map((_, i) => home(i));
      man.back = -1;
      man.msg = '';
      man.demoT0 = now;
    }
    const act = (): void => {
      man.lastAct = now;
      if (!A.manual) {
        A.manual = true;
        resetMan();
      }
    };
    svg.addEventListener('pointerdown', (e) => {
      if (!R.sync()) return;
      const tl = (e.target as Element).closest('.tl');
      const isCk = (e.target as Element).closest('.ck');
      if (tl) {
        act();
        const i = +(tl.getAttribute('data-t') ?? 0);
        if (man.step !== 1) return;
        const p = svgPt(svg, e);
        man.drag = i;
        man.dx = p.x - man.pos[i]!.x;
        man.dy = p.y - man.pos[i]!.y;
        svg.setPointerCapture(e.pointerId);
      } else if (isCk) {
        act();
        if (man.step === 2) {
          man.step = 3;
          man.doneAt = now;
        } else if (man.step === 1) {
          man.msg = '먼저 빈칸을 채워요';
          man.msgAt = now;
        }
      }
    });
    svg.addEventListener('pointermove', (e) => {
      if (man.drag < 0) return;
      man.lastAct = now;
      const p = svgPt(svg, e);
      man.pos[man.drag] = { x: p.x - man.dx, y: p.y - man.dy };
    });
    const drop = (): void => {
      const i = man.drag;
      if (i < 0) return;
      man.drag = -1;
      man.lastAct = now;
      const p = man.pos[i]!;
      if (Math.hypot(p.x - SC.x, p.y - SC.y) < 30) {
        if (TILES[i]!.v === 4) {
          man.pos[i] = { ...SC };
          man.step = 2;
          man.demoT0 = now;
          man.msg = '';
          return;
        }
        man.msg = `3 + ${TILES[i]!.v} = ${3 + TILES[i]!.v} — 7이 아니에요`;
        man.msgAt = now;
      }
      man.back = i;
      man.backAt = now;
      man.backFrom = { ...p };
    };
    svg.addEventListener('pointerup', drop);
    svg.addEventListener('pointercancel', drop);
    root.addEventListener('pointerdown', (e) => {
      const el = (e.target as Element).closest('[data-a]');
      if (!el || !R.sync()) return;
      act();
      resetMan();
    });

    /** 손가락 시범: kind 1 = 타일 끌기, 2 = 확인 누르기. p = 시범 시작부터 초 */
    function demo(kind: 1 | 2, p: number): { hand: { x: number; y: number; a: number; s: number } | null; ghost: { x: number; y: number; a: number } | null; rip: { x: number; y: number; k: number } | null } {
      const out = { x: 270, y: 196 };
      if (kind === 1) {
        const from = home(1);
        if (p < 0 || p > 2.7) return { hand: null, ghost: null, rip: null };
        const a = Math.min(seg(p, 0, 0.25), 1 - seg(p, 2.4, 2.7));
        let x: number;
        let y: number;
        let s = 1;
        let gh: { x: number; y: number; a: number } | null = null;
        if (p < 0.6) {
          const k = sm(seg(p, 0, 0.6));
          x = lerp(out.x, from.x, k);
          y = lerp(out.y, from.y, k);
        } else if (p < 0.85) {
          x = from.x;
          y = from.y;
          s = 1 - 0.12 * Math.sin(seg(p, 0.6, 0.85) * Math.PI * 0.5);
        } else if (p < 1.9) {
          const k = sm(seg(p, 0.85, 1.9));
          x = lerp(from.x, SC.x, k);
          y = lerp(from.y, SC.y, k) - Math.sin(k * Math.PI) * 18;
          s = 0.88;
          gh = { x, y, a: 1 };
        } else {
          const k = seg(p, 1.9, 2.4);
          x = SC.x + k * 20;
          y = SC.y + k * 22;
          gh = { x: SC.x, y: SC.y, a: 1 - seg(p, 1.9, 2.2) };
        }
        const rp = p > 0.6 && p < 1.2 ? { x: from.x, y: from.y, k: seg(p, 0.6, 1.2) } : null;
        return { hand: { x, y, a, s }, ghost: gh, rip: rp };
      }
      if (p < 0 || p > 1.9) return { hand: null, ghost: null, rip: null };
      const a = Math.min(seg(p, 0, 0.25), 1 - seg(p, 1.6, 1.9));
      let x = CK.x;
      let y = CK.y;
      let s = 1;
      if (p < 0.6) {
        const k = sm(seg(p, 0, 0.6));
        x = lerp(out.x, CK.x, k);
        y = lerp(out.y, CK.y, k);
      } else if (p < 1.0) {
        s = 1 - 0.14 * Math.sin(seg(p, 0.6, 1.0) * Math.PI);
      } else {
        const k = seg(p, 1.0, 1.9);
        x = CK.x + k * 30;
        y = CK.y + k * 14;
      }
      return { hand: { x, y, a, s }, ghost: null, rip: p > 0.7 && p < 1.3 ? { x: CK.x, y: CK.y, k: seg(p, 0.7, 1.3) } : null };
    }
    function render(o: {
      step: number;
      pos: { x: number; y: number }[];
      dragging: number;
      d: ReturnType<typeof demo>;
      cursor: { x: number; y: number; down: boolean } | null;
      idleK: number;
      doneAge: number;
      msg: string;
    }): void {
      stp.textContent = o.step === 1 ? '1단계 · 알맞은 수를 빈칸으로 끌어요' : o.step === 2 ? '2단계 · 「확인」을 눌러요' : '다 했어요!';
      dots.forEach((d, i) => d.classList.toggle('on', i < o.step - (o.step === 3 ? 1 : 0) || i === o.step - 1));
      tls.forEach((g, i) => {
        const p = o.pos[i]!;
        const lift = o.dragging === i ? 1.1 : 1;
        tr(g, `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${lift})`);
      });
      const pulse = 0.5 + 0.5 * Math.sin(now * 6);
      slot.classList.toggle('glow', o.step === 1);
      slot.setAttribute('stroke-opacity', o.step === 1 ? String(0.6 + 0.4 * pulse) : '1');
      const ckGlow = o.step === 2 ? 1 + 0.05 * pulse : 1;
      tr(ck, `translate(160 174) scale(${ckGlow}) translate(-160 -174)`);
      if (o.d.ghost) {
        gt.style.opacity = String(o.d.ghost.a * 0.85);
        tr(gt, `translate(${o.d.ghost.x.toFixed(1)} ${o.d.ghost.y.toFixed(1)})`);
      } else gt.style.opacity = '0';
      if (o.d.hand) {
        hand.style.opacity = String(o.d.hand.a);
        tr(hand, `translate(${o.d.hand.x.toFixed(1)} ${o.d.hand.y.toFixed(1)}) scale(${o.d.hand.s})`);
      } else hand.style.opacity = '0';
      if (o.d.rip) {
        rip.style.opacity = String(1 - o.d.rip.k);
        rip.setAttribute('cx', String(o.d.rip.x));
        rip.setAttribute('cy', String(o.d.rip.y));
        rip.setAttribute('r', String(6 + o.d.rip.k * 18));
      } else rip.style.opacity = '0';
      if (o.cursor) {
        cur.style.opacity = '1';
        tr(cur, `translate(${o.cursor.x.toFixed(1)} ${o.cursor.y.toFixed(1)}) scale(${o.cursor.down ? 0.9 : 1})`);
      } else cur.style.opacity = '0';
      idle.style.opacity = o.idleK > 0 ? '1' : '0';
      idle.setAttribute('stroke-dashoffset', String(1 - o.idleK));
      const dk = o.doneAge >= 0 ? backOut(seg(o.doneAge, 0, 0.4)) : 0;
      done.style.opacity = String(o.doneAge >= 0 ? 1 : 0);
      tr(done, `translate(160 98) scale(${dk}) translate(-160 -98)`);
      msg.textContent = o.msg;
    }
    return {
      controls: [A.ctl],
      update(t) {
        now = t;
        R.sync();
        if (A.base < 0) A.base = t;
        if (A.manual) {
          if (man.back >= 0) {
            const k = sm((t - man.backAt) / 0.35);
            const h = home(man.back);
            man.pos[man.back] = { x: lerp(man.backFrom.x, h.x, k), y: lerp(man.backFrom.y, h.y, k) };
            if (k >= 1) man.back = -1;
          }
          const idleT = t - man.lastAct;
          let d: ReturnType<typeof demo> = { hand: null, ghost: null, rip: null };
          let idleK = 0;
          if (man.step < 3 && man.drag < 0) {
            if (idleT > 2.2) {
              const per = man.step === 1 ? 4.0 : 3.2;
              const p = (idleT - 2.2) % per;
              d = demo(man.step as 1 | 2, p);
            } else idleK = idleT / 2.2;
          }
          if (man.step === 3 && t - man.doneAt > 3) resetMan();
          render({ step: man.step, pos: man.pos, dragging: man.drag, d, cursor: null, idleK, doneAge: man.step === 3 ? t - man.doneAt : -1, msg: t - man.msgAt < 2 ? man.msg : '' });
          return;
        }
        const lt = t - A.base;
        const CY = 11.5;
        const p = lt % CY;
        let step = 1;
        const pos = TILES.map((_, i) => home(i));
        let d: ReturnType<typeof demo> = { hand: null, ghost: null, rip: null };
        let cursor: { x: number; y: number; down: boolean } | null = null;
        let idleK = 0;
        let doneAge = -1;
        if (p < 2.8) d = demo(1, p - 0.2);
        else if (p < 4.5) {
          const h = home(1);
          if (p < 3.3) {
            const k = sm(seg(p, 2.8, 3.3));
            cursor = { x: lerp(250, h.x, k), y: lerp(190, h.y, k), down: false };
          } else {
            const k = sm(seg(p, 3.4, 4.4));
            const x = lerp(h.x, SC.x, k);
            const y = lerp(h.y, SC.y, k) - Math.sin(k * Math.PI) * 12;
            pos[1] = { x, y };
            cursor = { x: x + 2, y: y + 2, down: p > 3.3 && p < 4.4 };
          }
        }
        if (p >= 4.4) {
          step = 2;
          pos[1] = { ...SC };
          if (p < 6.4) {
            idleK = seg(p, 4.6, 6.4);
            cursor = p < 5.0 ? { x: SC.x + 2 + (p - 4.4) * 30, y: SC.y + 2 + (p - 4.4) * 40, down: false } : null;
          } else if (p < 8.0) d = demo(2, p - 6.4);
          else if (p < 8.8) {
            const k = sm(seg(p, 8.0, 8.5));
            cursor = { x: lerp(240, CK.x, k), y: lerp(196, CK.y, k), down: p > 8.55 };
          }
          if (p >= 8.7) {
            step = 3;
            doneAge = p - 8.7;
            cursor = { x: CK.x, y: CK.y, down: false };
          }
        }
        render({ step, pos, dragging: -1, d, cursor, idleK, doneAge, msg: step === 2 && p < 6.4 && p > 5.2 ? '…멈추면 손가락이 다시 알려 줘요' : '' });
      },
      dispose: () => R.dispose(),
    };
  },
};

/* ═════════════════════ i405 풀이 과정 기록 ═════════════════════ */
const i405: DemoDom = {
  kind: 'dom',
  caption: '내가 둔 수와 생각을 차례로 기록해 되짚기 — 「여기서 갈렸어요」 갈림길과 다른 길을 표시',
  make(box) {
    // 컴퓨터 X 먼저, 아이 O. 2번째 수가 갈림길.
    const MV: [number, 'X' | 'O', string][] = [
      [0, 'X', '컴퓨터가 모서리에 뒀다'],
      [1, 'O', '바로 옆을 막아야지!'],
      [4, 'X', '어, 가운데를 뺏겼네'],
      [8, 'O', '대각선은 막았다!'],
      [6, 'X', '…두 줄이 한꺼번에?'],
      [3, 'O', '하나만 막을 수 있어'],
      [2, 'X', '졌다. 어디서 갈렸지?'],
    ];
    const X0 = 24;
    const Y0 = 40;
    const CS = 40;
    const GP = 4;
    const ccx = (i: number): number => X0 + (i % 3) * (CS + GP) + CS / 2;
    const ccy = (i: number): number => Y0 + Math.floor(i / 3) * (CS + GP) + CS / 2;
    const R = rig(box, 'h405', {
      css: `
.h405 .cb{fill:#fffaf0;stroke:#e5d1aa;stroke-width:1.2}
.h405 .mX{stroke:#ff6b5a;stroke-width:4.5;stroke-linecap:round;fill:none}
.h405 .mO{stroke:#3d8bd9;stroke-width:4.5;fill:none}
.h405 .mn{font-size:7.5px;font-weight:900;fill:#a88a68}
.h405 .alt{stroke:#2fb57e;stroke-width:3.5;fill:none;stroke-dasharray:4 3}
.h405 .altt{font-size:8px;font-weight:900;fill:#1f8a57}
.h405 .win{stroke:#ff6b5a;stroke-width:3;stroke-linecap:round;opacity:.75}
.h405 .bub{fill:#fffaf0;stroke:#d9c3a0}
.h405 .bt{font-size:10.5px;font-weight:800;fill:#3b2a1e}
.h405 .bh{font-size:8px;font-weight:900;fill:#a88a68}
.h405 .chip circle{fill:#3a2b20;stroke:#ffffff26;stroke-width:1.2}
.h405 .chip text{font-size:8.5px;font-weight:900;fill:#c8b098}
.h405 .chip.p circle{fill:#5a4433}
.h405 .chip.p text{fill:#fff1dc}
.h405 .chip.cur circle{fill:#ffb25e;stroke:#fff}
.h405 .chip.cur text{fill:#2a1406}
.h405.big .chip{cursor:pointer}
.h405 .tll{stroke:#ffffff22;stroke-width:2}
.h405 .fork{stroke:#4fd69c;stroke-width:1.8;fill:none;stroke-dasharray:3 2}
.h405 .fc circle{fill:#1f5a40;stroke:#4fd69c;stroke-width:1.4}
.h405 .fc text{font-size:8px;font-weight:900;fill:#c9ffe6}
.h405 .fl{fill:#ff6b5a}
.h405 .flt{font-size:8px;font-weight:900;fill:#ffb39a}
.h405 .note{font-size:9px;font-weight:800;fill:#ffe2bd}
.h405 .hd{font-size:9px;font-weight:900;fill:#ffe2bd}
`,
      svg: (id) => `
<rect x="16" y="32" width="144" height="144" rx="12" fill="#4b3427" stroke="#7a5238" stroke-width="2" filter="url(#${id}sh)"/>
${Array.from({ length: 9 }, (_, i) => `<rect class="cb" x="${ccx(i) - CS / 2}" y="${ccy(i) - CS / 2}" width="${CS}" height="${CS}" rx="7"/>`).join('')}
<g class="marks"></g>
<g class="altg" style="opacity:0"><circle class="alt" cx="${ccx(4)}" cy="${ccy(4)}" r="11"/></g>
<line class="win" x1="${ccx(2) + 12}" y1="${ccy(2) - 12}" x2="${ccx(6) - 12}" y2="${ccy(6) + 12}" pathLength="1" stroke-dasharray="1 1"/>
<text class="hd" x="18" y="22">되짚기 · 틱택토</text>
<g class="bg">
  <path class="bub" d="M180 30 h120 a10 10 0 0 1 10 10 v30 a10 10 0 0 1 -10 10 h-108 l-8 8 l1 -8 h-5 a10 10 0 0 1 -10 -10 v-30 a10 10 0 0 1 10 -10z" filter="url(#${id}sh)"/>
  <text class="bh" x="182" y="45">생각 기록 · <tspan class="bwho"></tspan></text>
  <text class="bt" x="182" y="64"></text>
</g>
<line class="tll" x1="182" y1="118" x2="302" y2="118"/>
<path class="fork" d="M202 124 Q202 146 218 148" style="opacity:0"/>
<g class="fc" style="opacity:0"><circle cx="228" cy="148" r="9"/><text x="228" y="151" text-anchor="middle">2'</text><text x="242" y="151" style="font-size:7.5px;fill:#7ef0be;font-weight:800">가운데 → 비김</text></g>
<g class="flg" style="opacity:0"><path d="M202 99 v10" stroke="#ff6b5a" stroke-width="1.4"/><path class="fl" d="M202 99 h12 l-3 3.5 l3 3.5 h-12z"/><text class="flt" x="217" y="105">갈림길</text></g>
${MV.map((m, i) => `<g class="chip" data-m="${i}"><circle cx="${184 + i * 18.3}" cy="118" r="8"/><text x="${184 + i * 18.3}" y="121" text-anchor="middle">${m[1]}</text></g>`).join('')}
<text class="note" x="182" y="178"></text>
<text class="note n2" x="182" y="190" style="font-size:8px;fill:#c8b098"></text>`,
      panel: `<button class="btn ghost" data-a="prev">${ic('prev')}한 수 전</button><button class="btn" data-a="play"><span class="pi">${ic('pause')}</span><span class="pl">멈춤</span></button><button class="btn ghost" data-a="next">${ic('next')}한 수 뒤</button><span class="sep"></span><button class="btn ghost" data-a="fork">${ic('flag')}갈림길로</button>`,
    });
    const root = R.root;
    const marks = q<SVGGElement>(root, '.marks');
    const altg = q(root, '.altg');
    const win = q(root, '.win');
    const bt = q<SVGTextElement>(root, '.bt');
    const bwho = q<SVGTSpanElement>(root, '.bwho');
    const bg = q<SVGGElement>(root, '.bg');
    const chips = qa(root, '.chip');
    const fork = q(root, '.fork');
    const fc = q(root, '.fc');
    const flg = q(root, '.flg');
    const note = q<SVGTextElement>(root, '.note');
    const n2 = q<SVGTextElement>(root, '.n2');
    const pi = root.querySelector('.pi') as HTMLElement;
    const pl = root.querySelector('.pl') as HTMLElement;
    let mPos = 0;
    let playing = true;
    let mAt = 0;
    let now = 0;
    let lastN = -1;
    let lastBranch = false;
    const A = autoCtl(() => undefined);
    const setPlay = (v: boolean): void => {
      playing = v;
      pi.innerHTML = ic(v ? 'pause' : 'play');
      pl.textContent = v ? '멈춤' : '재생';
    };
    root.addEventListener('pointerdown', (e) => {
      const el = (e.target as Element).closest('[data-a],[data-m]');
      if (!el || !R.sync()) return;
      A.manual = true;
      const m = el.getAttribute('data-m');
      const a = el.getAttribute('data-a');
      if (m !== null) {
        mPos = +m + 1;
        setPlay(false);
      } else if (a === 'prev') {
        mPos = Math.max(0, Math.ceil(mPos) - 1);
        setPlay(false);
      } else if (a === 'next') {
        mPos = Math.min(MV.length, Math.floor(mPos) + 1);
        setPlay(false);
      } else if (a === 'play') {
        if (mPos >= MV.length) mPos = 0;
        setPlay(!playing);
      } else if (a === 'fork') {
        mPos = 2;
        setPlay(false);
      }
      mAt = now;
    });
    function render(n: number, branch: boolean, nAge: number): void {
      if (n !== lastN || branch !== lastBranch) {
        lastN = n;
        lastBranch = branch;
        marks.innerHTML = MV.slice(0, n)
          .map(([c, w], i) => {
            const x = ccx(c);
            const y = ccy(c);
            const hi = branch && i === 1;
            const sh =
              w === 'X'
                ? `<path class="mX" d="M${x - 10} ${y - 10}L${x + 10} ${y + 10}M${x + 10} ${y - 10}L${x - 10} ${y + 10}"/>`
                : `<circle class="mO" cx="${x}" cy="${y}" r="11" ${hi ? 'style="stroke:#ff6b5a"' : ''}/>`;
            return `<g class="mk" data-i="${i}">${sh}<text class="mn" x="${x + 15}" y="${y - 12}" text-anchor="end">${i + 1}</text>${hi ? `<circle cx="${x}" cy="${y}" r="17" fill="none" stroke="#ff6b5a" stroke-width="1.5" stroke-dasharray="3 2"/>` : ''}</g>`;
          })
          .join('');
      }
      const last = marks.lastElementChild as SVGGElement | null;
      if (last && n > 0) {
        const c = MV[n - 1]![0];
        const k = backOut(seg(nAge, 0, 0.3));
        tr(last, `translate(${ccx(c)} ${ccy(c)}) scale(${k}) translate(${-ccx(c)} ${-ccy(c)})`);
      }
      chips.forEach((c, i) => {
        c.classList.toggle('p', i < n);
        c.classList.toggle('cur', i === n - 1);
      });
      win.setAttribute('stroke-dashoffset', String(n >= 7 && !branch ? 1 - sm(seg(nAge, 0.3, 0.8)) : 1));
      const showFork = branch || n >= 7;
      fork.style.opacity = showFork ? '1' : '0';
      fc.style.opacity = showFork ? '1' : '0';
      flg.style.opacity = showFork ? '1' : '0';
      altg.style.opacity = branch ? String(0.6 + 0.4 * Math.sin(now * 5)) : '0';
      if (branch) {
        bwho.textContent = '되짚기';
        bt.textContent = '가운데였다면 비길 수 있었어요';
        bt.style.fontSize = '9.5px';
        note.textContent = '갈림길: 2번째 수 (O → 2번 칸)';
        n2.textContent = '더 좋은 수: 가운데(5번 칸)';
      } else if (n > 0) {
        const m = MV[n - 1]!;
        bwho.textContent = m[1] === 'O' ? '나' : '컴퓨터 차례 뒤';
        bt.textContent = m[2];
        bt.style.fontSize = '';
        note.textContent = n >= 7 ? 'X 승 — 되짚어 볼까요?' : `${n}번째 수 기록`;
        n2.textContent = n >= 7 ? '갈림길로 돌아가 다른 길 보기' : '';
      } else {
        bwho.textContent = '';
        bt.textContent = '한 수씩 생각을 남겨요';
        note.textContent = '';
        n2.textContent = '';
      }
      bg.style.opacity = '1';
    }
    return {
      controls: [A.ctl],
      update(t, dt) {
        now = t;
        R.sync();
        if (A.base < 0) A.base = t;
        if (A.manual) {
          if (playing) {
            const prev = Math.floor(mPos);
            mPos = Math.min(MV.length, mPos + Math.min(dt, 0.1) / 1.1);
            if (Math.floor(mPos) !== prev) mAt = t;
            if (mPos >= MV.length) setPlay(false);
          }
          const n = Math.floor(mPos + 1e-6);
          render(n, n === 2 && !playing, t - mAt);
          return;
        }
        const lt = t - A.base;
        const CY = 13;
        const p = lt % CY;
        const k = Math.floor(lt / CY);
        if (p < 9.2) {
          const n = clamp(Math.floor((p - 0.3) / 1.15) + 1, 0, 7);
          const nAge = p - (0.3 + (n - 1) * 1.15);
          render(n, false, nAge);
        } else render(2, true, p - 9.2 + (k > -1 ? 1 : 0));
      },
      dispose: () => R.dispose(),
    };
  },
};

/* ═════════════════════ i406 별 · 숙련도 지도 ═════════════════════ */
const i406: DemoDom = {
  kind: 'dom',
  caption: '단원별 숙련도를 별 · 색 칸 지도로 — 약한 곳이 빨갛게 깜빡, 눌러서 바로 연습하면 별이 늘어요',
  make(box) {
    const NODES: [string, string, number][] = [
      ['덧셈', '+', 3],
      ['뺄셈', '−', 3],
      ['곱셈', '×', 2],
      ['나눗셈', '÷', 1],
      ['분수', '½', 1],
      ['소수', '0.1', 2],
      ['도형', '△', 3],
      ['측정', 'cm', 2],
      ['시각', '⌚', 0],
      ['규칙', '…', 2],
      ['비율', '%', 0],
      ['방정식', 'x', 1],
    ];
    const WEAK: Record<number, string> = { 3: '나머지 있는 나눗셈', 4: '통분하기', 8: '몇 분 전 · 후', 10: '백분율로 바꾸기', 11: '양쪽에 같은 수 더하기' };
    const XS = [52, 124, 196, 268];
    const YS = [50, 108, 166];
    const pos = (i: number): { x: number; y: number } => {
      const r = Math.floor(i / 4);
      const c = i % 4;
      return { x: XS[r === 1 ? 3 - c : c]!, y: YS[r]! };
    };
    const COL = [
      ['#5a2a26', '#ff6b5a'],
      ['#5e3a1c', '#ffa94d'],
      ['#55491c', '#ffd166'],
      ['#1f4f3a', '#4fd69c'],
    ];
    const R = rig(box, 'h406', {
      css: `
.h406 .road{fill:none;stroke:#6b4a33;stroke-width:9;stroke-linecap:round;stroke-linejoin:round}
.h406 .road2{fill:none;stroke:#e8c896;stroke-width:1.6;stroke-dasharray:3 4;stroke-linecap:round;opacity:.6}
.h406 .nd rect.b{stroke-width:2.2;transition:fill .4s,stroke .4s}
.h406 .nd .gl{font-size:12px;font-weight:900;fill:#fff}
.h406 .nd .lb{font-size:7.5px;font-weight:800;fill:#e8d2b8}
.h406 .nd .s{stroke-width:.8;stroke-linejoin:round}
.h406.big .nd{cursor:pointer}
.h406 .wr{fill:none;stroke:#ff6b5a;stroke-width:2}
.h406 .bd circle{fill:#ff6b5a;stroke:#2a1406;stroke-width:1}
.h406 .bd text{font-size:8px;font-weight:900;fill:#fff}
.h406 .pg{fill:none;stroke:#7ef0be;stroke-width:3;stroke-linecap:round}
.h406 .pop{fill:#2b1d15;stroke:#ffd166;stroke-width:1.6}
.h406 .pt{font-size:9.5px;font-weight:900;fill:#fff1d8}
.h406 .ps{font-size:8px;font-weight:700;fill:#f3d6b8}
.h406 .pb{fill:url(#ORID)}
.h406.big .pbtn{cursor:pointer}
.h406 .pbt{font-size:8.5px;font-weight:900;fill:#2a1406}
.h406 .pbi{stroke:#2a1406}
.h406 .hd{font-size:10px;font-weight:900;fill:#ffe2bd}
.h406 .lg{font-size:7px;font-weight:800;fill:#c8b098}
`.replace('ORID', 'lfORID'),
      svg: (id) => `
<text class="hd" x="14" y="19">내 수학 지도</text>
${[0, 1, 2, 3].map((m) => `<rect x="${196 + m * 30}" y="10" width="9" height="9" rx="2.5" fill="${COL[m]![0]}" stroke="${COL[m]![1]}" stroke-width="1.4"/><text class="lg" x="${208 + m * 30}" y="18">${'★'.repeat(m) || '0'}</text>`).join('')}
<path class="road" d="M52 50 H268 C300 50 300 108 268 108 H52 C20 108 20 166 52 166 H268"/>
<path class="road2" d="M52 50 H268 C300 50 300 108 268 108 H52 C20 108 20 166 52 166 H268"/>
${NODES.map((nd, i) => {
  const p = pos(i);
  return `<g class="nd" data-n="${i}"><g class="nb">
  <circle class="wr" cx="${p.x}" cy="${p.y}" r="22" style="opacity:0"/>
  <rect class="b" x="${p.x - 17}" y="${p.y - 17}" width="34" height="34" rx="9" filter="url(#${id}sh)"/>
  <rect x="${p.x - 14}" y="${p.y - 15}" width="28" height="9" rx="4.5" fill="#fff" opacity=".12"/>
  <text class="gl" x="${p.x}" y="${p.y + 2}" text-anchor="middle">${nd[1]}</text>
  ${[0, 1, 2].map((k) => `<polygon class="s" points="${starPts(p.x - 9 + k * 9, p.y + 10, 3.6)}"/>`).join('')}
  <circle class="pg" cx="${p.x}" cy="${p.y}" r="21" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1" transform="rotate(-90 ${p.x} ${p.y})" style="opacity:0"/>
  <g class="bd" style="opacity:0"><circle cx="${p.x + 15}" cy="${p.y - 15}" r="5.5"/><text x="${p.x + 15}" y="${p.y - 12}" text-anchor="middle">!</text></g>
  </g><text class="lb" x="${p.x}" y="${p.y + 27}" text-anchor="middle">${nd[0]}</text></g>`;
}).join('')}
<g class="popg" style="opacity:0">
  <rect class="pop" x="0" y="0" width="122" height="50" rx="10" filter="url(#${id}sh)"/>
  <text class="pt" x="9" y="15"></text>
  <text class="ps" x="9" y="28"></text>
  <g class="pbtn"><rect class="pb" x="9" y="33" width="104" height="13" rx="6.5" fill="url(#${id}or)"/>${sic('play', 14, 34.5, 10, 'pbi')}<text class="pbt" x="27" y="43">바로 연습 5문제</text></g>
</g>
<g class="hand" style="opacity:0">${HAND}</g>`,
      panel: `<span class="lab">칸을 눌러 바로 연습해 보세요</span><button class="btn ghost" data-a="reset">${ic('redo')}처음 상태로</button>`,
    });
    const root = R.root;
    root.querySelector('style')!.textContent = root.querySelector('style')!.textContent!.replace('lfORID', `${R.id}or`);
    const nds = qa<SVGGElement>(root, '.nd');
    const popg = q<SVGGElement>(root, '.popg');
    const pt = q<SVGTextElement>(root, '.pt');
    const ps = q<SVGTextElement>(root, '.ps');
    const hand = q<SVGGElement>(root, '.hand');
    let mastery = NODES.map((n) => n[2]);
    let now = 0;
    let weakHi = true;
    const man = { open: -1, openAt: 0, prac: -1, pracAt: 0, gainAt: -9, gainI: -1 };
    const A = autoCtl(() => {
      mastery = NODES.map((n) => n[2]);
      man.open = -1;
      man.prac = -1;
    });
    function popPlace(i: number): { x: number; y: number } {
      const p = pos(i);
      const x = clamp(p.x - 61, 6, 320 - 128);
      const y = Math.floor(i / 4) === 2 ? p.y - 76 : p.y + 24;
      return { x, y };
    }
    root.addEventListener('pointerdown', (e) => {
      if (!R.sync()) return;
      const t = e.target as Element;
      const btn = t.closest('.pbtn');
      const nd = t.closest('.nd');
      const a = t.closest('[data-a]');
      if (!A.manual && (btn || nd || a)) {
        A.manual = true;
        mastery = NODES.map((n) => n[2]);
        man.open = -1;
        man.prac = -1;
      }
      if (btn && man.open >= 0) {
        if (mastery[man.open]! < 3) {
          man.prac = man.open;
          man.pracAt = now;
        }
        man.open = -1;
      } else if (nd) {
        const i = +(nd.getAttribute('data-n') ?? 0);
        man.open = man.open === i ? -1 : i;
        man.openAt = now;
      } else if (a) {
        mastery = NODES.map((n) => n[2]);
        man.open = -1;
        man.prac = -1;
      }
    });
    function render(open: number, openAge: number, prac: number, pracK: number, gainI: number, gainAge: number, hnd: { x: number; y: number; a: number; s: number } | null): void {
      nds.forEach((g, i) => {
        const m = mastery[i]!;
        const c = COL[m]!;
        const b = q(g, 'rect.b');
        b.setAttribute('fill', c[0]!);
        b.setAttribute('stroke', c[1]!);
        qa(g, '.s').forEach((s, k) => {
          s.setAttribute('fill', k < m ? '#ffd166' : '#00000055');
          s.setAttribute('stroke', k < m ? '#a8742a' : '#ffffff30');
        });
        const weak = m <= 1 && weakHi;
        const wr = q(g, '.wr');
        const ph = (now * 1.6 + i * 0.37) % 1;
        wr.style.opacity = weak ? String((1 - ph) * 0.9) : '0';
        wr.setAttribute('r', String(18 + ph * 9));
        q(g, '.bd').style.opacity = weak ? '1' : '0';
        const pg = q(g, '.pg');
        pg.style.opacity = i === prac ? '1' : '0';
        pg.setAttribute('stroke-dashoffset', String(1 - (i === prac ? pracK : 0)));
        const p = pos(i);
        let s = 1;
        if (i === gainI && gainAge < 0.6) s = 1 + 0.25 * Math.sin((gainAge / 0.6) * Math.PI);
        if (i === open) s = Math.max(s, 1.08);
        tr(q(g, '.nb'), `translate(${p.x} ${p.y}) scale(${s}) translate(${-p.x} ${-p.y})`);
      });
      if (open >= 0) {
        const pp = popPlace(open);
        const k = backOut(seg(openAge, 0, 0.3));
        popg.style.opacity = String(clamp(openAge / 0.15));
        tr(popg, `translate(${pp.x} ${pp.y}) scale(${0.85 + 0.15 * k})`);
        const m = mastery[open]!;
        pt.textContent = `${NODES[open]![0]} · ${'★'.repeat(m)}${'☆'.repeat(3 - m)}`;
        ps.textContent = m >= 3 ? '다 익혔어요! 복습만 가끔' : `약한 곳: ${WEAK[open] ?? '응용 문제'}`;
      } else popg.style.opacity = '0';
      if (hnd) {
        hand.style.opacity = String(hnd.a);
        tr(hand, `translate(${hnd.x.toFixed(1)} ${hnd.y.toFixed(1)}) scale(${hnd.s * 0.85})`);
      } else hand.style.opacity = '0';
    }
    return {
      controls: [A.ctl, { type: 'toggle', label: '약한 곳 강조', value: true, on: (v) => (weakHi = v) }],
      update(t) {
        now = t;
        R.sync();
        if (A.base < 0) A.base = t;
        if (A.manual) {
          let pk = 0;
          if (man.prac >= 0) {
            pk = sm((t - man.pracAt) / 1.2);
            if (pk >= 1) {
              mastery[man.prac] = Math.min(3, mastery[man.prac]! + 1);
              man.gainAt = t;
              man.gainI = man.prac;
              man.prac = -1;
            }
          }
          render(man.open, t - man.openAt, man.prac, pk, man.gainI, t - man.gainAt, null);
          return;
        }
        const lt = t - A.base;
        const CY = 10.5;
        const k = Math.floor(lt / CY);
        const p = lt - k * CY;
        mastery = NODES.map((n) => n[2]);
        const seq = [4, 10];
        let open = -1;
        let openAge = 0;
        let prac = -1;
        let pk = 0;
        let gainI = -1;
        let gainAge = 9;
        let hnd: { x: number; y: number; a: number; s: number } | null = null;
        seq.forEach((ni, j) => {
          const o = 0.5 + j * 4.6;
          const q2 = p - o;
          const np = pos(ni);
          const pp = popPlace(ni);
          const bx = pp.x + 60;
          const by = pp.y + 40;
          if (q2 >= 0 && q2 < 4.6) {
            if (q2 < 0.7) {
              const kk = sm(q2 / 0.7);
              hnd = { x: lerp(300, np.x, kk), y: lerp(198, np.y + 4, kk), a: kk, s: 1 };
            } else if (q2 < 1.0) hnd = { x: np.x, y: np.y + 4, a: 1, s: 0.9 };
            else if (q2 < 1.8) {
              const kk = sm((q2 - 1.0) / 0.8);
              hnd = { x: lerp(np.x, bx, kk), y: lerp(np.y + 4, by, kk), a: 1, s: 1 };
            } else if (q2 < 2.1) hnd = { x: bx, y: by, a: 1, s: 0.9 };
            else if (q2 < 2.5) hnd = { x: bx + (q2 - 2.1) * 40, y: by + (q2 - 2.1) * 40, a: 1 - (q2 - 2.1) / 0.4, s: 1 };
            if (q2 >= 0.9 && q2 < 2.1) {
              open = ni;
              openAge = q2 - 0.9;
            }
            if (q2 >= 2.1 && q2 < 3.3) {
              prac = ni;
              pk = sm((q2 - 2.1) / 1.2);
            }
          }
          if (q2 >= 3.3) {
            mastery[ni] = mastery[ni]! + 1;
            if (q2 < 4.0) {
              gainI = ni;
              gainAge = q2 - 3.3;
            }
          }
        });
        render(open, openAge, prac, pk, gainI, gainAge, hnd);
      },
      dispose: () => R.dispose(),
    };
  },
};

/* ═════════════════════ i407 말풍선 선생님 ═════════════════════ */
const i407: DemoDom = {
  kind: 'dom',
  caption: '막힘 · 연속 실수 · 빠른 정답 · 끈기 — 상황마다 다른 한마디, 같은 말은 한 바퀴 돌 때까지 되풀이 안 해요',
  make(box) {
    type Sit = 'stuck' | 'wrong' | 'fast' | 'grit';
    const SIT: Record<Sit, { tag: string; icon: string; col: string; lines: string[] }> = {
      stuck: {
        tag: '20초째 멈춤',
        icon: 'clock',
        col: '#6cc4ff',
        lines: ['어디부터 볼까? 큰 수부터 봐도 좋아', '잠깐 쉬어도 돼. 같이 한 칸씩 볼까?', '힌트 단추가 여기 있어 — 하나만 써 볼래?', '문제를 소리 내어 한 번 읽어 보자'],
      },
      wrong: {
        tag: '연속 실수 3번',
        icon: 'xc',
        col: '#ff8a6a',
        lines: ['괜찮아, 실수는 단서야. 어디서 달라졌을까?', '받아올림을 한 번만 확인해 볼까?', '천천히! 빠른 것보다 정확한 게 먼저야', '방금 것과 비슷한 실수야. 패턴이 보이지?'],
      },
      fast: {
        tag: '3초 만에 정답',
        icon: 'bolt',
        col: '#ffd166',
        lines: ['와, 3초! 머릿속에 계산기가 있니?', '번개처럼 빨라! 조금 어렵게 가 볼까?', '빠르고 정확해. 이 단원은 졸업이다!', '벌써? 비결 좀 알려 줘!'],
      },
      grit: {
        tag: '오래 고민 끝에 정답',
        icon: 'flag',
        col: '#7ef0be',
        lines: ['끝까지 생각했구나. 그게 진짜 실력이야', '포기 안 하고 찾아냈네! 멋져', '오래 걸려도 맞힌 건 맞힌 거야', '그 끈기, 다음 문제에서도 보여 줘!'],
      },
    };
    const ORDER: Sit[] = ['stuck', 'wrong', 'fast', 'grit', 'wrong', 'fast', 'stuck', 'grit', 'fast', 'wrong'];
    const R = rig(box, 'h407', {
      css: `
.h407 .bubble{position:absolute;left:41%;top:20%;width:55%;min-height:22%;box-sizing:border-box;padding:3cqw 3.6cqw;border-radius:4cqw;background:#fffaf0;color:#3b2a1e;
  font-size:4.3cqw;font-weight:800;line-height:1.4;box-shadow:0 1.2cqw 0 #c9a774,0 2cqw 4cqw #0008;word-break:keep-all}
.h407 .bubble::before{content:'';position:absolute;left:-3.4cqw;top:46%;border:2cqw solid transparent;border-right:2.6cqw solid #fffaf0;border-left:0}
.h407 .bubble .cr{display:inline-block;width:.35cqw;height:1em;background:#3b2a1e;vertical-align:-.12em;margin-left:.2cqw}
.h407 .chip{position:absolute;left:41%;top:6%;display:flex;white-space:nowrap;align-items:center;gap:1.2cqw;padding:.9cqw 2.4cqw;border-radius:99px;background:#00000055;font-size:3.3cqw;font-weight:900;color:#fff;box-shadow:inset 0 0 0 .35cqw currentColor}
.h407 .chip svg{width:3.8cqw;height:3.8cqw}
.h407 .chip b{color:#fff;font-weight:900}
.h407 .chip i{font-style:normal;font-weight:800;opacity:.75;color:#ffe6c4;margin-left:1cqw;font-size:2.8cqw}
.h407 .log{position:absolute;left:41%;right:4%;bottom:4%;display:flex;flex-direction:column;gap:.7cqw}
.h407 .log div{font-size:2.6cqw;font-weight:700;color:#bba58e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-left:3.2cqw;position:relative}
.h407 .log div::before{content:'';position:absolute;left:.4cqw;top:50%;width:1.6cqw;height:1.6cqw;border-radius:50%;transform:translateY(-50%);background:var(--c)}
.h407 .lh{font-size:2.6cqw !important;font-weight:900 !important;color:#ffe2bd !important;padding-left:0 !important}
.h407 .lh::before{display:none}
`,
      svg: () => `
<ellipse cx="68" cy="186" rx="44" ry="7" fill="#000" opacity=".35"/>
<g class="owl">
  <path d="M30 120 C24 160 40 184 68 184 C96 184 112 160 106 120 C102 86 88 70 68 70 C48 70 34 86 30 120Z" fill="#b8804f" stroke="#5a3a1c" stroke-width="2.2"/>
  <path d="M44 132 C42 162 54 178 68 178 C82 178 94 162 92 132 C90 112 80 104 68 104 C56 104 46 112 44 132Z" fill="#f2d6a8"/>
  ${[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => `<path d="M${50 + c * 9 + (r % 2) * 4.5} ${132 + r * 12} q4.5 5 9 0" fill="none" stroke="#d6b07a" stroke-width="1.4"/>`).join('')).join('')}
  <g class="wl"><path d="M32 118 C18 130 18 156 30 166 C38 150 40 134 36 118Z" fill="#9c6a3e" stroke="#5a3a1c" stroke-width="2"/></g>
  <g class="wr2"><path d="M104 118 C118 130 118 156 106 166 C98 150 96 134 100 118Z" fill="#9c6a3e" stroke="#5a3a1c" stroke-width="2"/></g>
  <path d="M40 80 L34 62 L52 74Z M96 80 L102 62 L84 74Z" fill="#9c6a3e" stroke="#5a3a1c" stroke-width="2" stroke-linejoin="round"/>
  <circle cx="54" cy="98" r="16" fill="#fff" stroke="#5a3a1c" stroke-width="1.8"/><circle cx="82" cy="98" r="16" fill="#fff" stroke="#5a3a1c" stroke-width="1.8"/>
  <g class="eyes">
    <g class="eL"><circle class="pu" cx="54" cy="98" r="7" fill="#2a1a10"/><circle class="hl" cx="56.5" cy="95" r="2.4" fill="#fff"/></g>
    <g class="eR"><circle class="pu" cx="82" cy="98" r="7" fill="#2a1a10"/><circle class="hl" cx="84.5" cy="95" r="2.4" fill="#fff"/></g>
  </g>
  <path class="happy" d="M44 100 Q54 88 64 100 M72 100 Q82 88 92 100" fill="none" stroke="#2a1a10" stroke-width="3.2" stroke-linecap="round" style="opacity:0"/>
  <g class="lids"><rect class="lidL" x="37" y="81" width="34" height="0" fill="#b8804f"/><rect class="lidR" x="65" y="81" width="34" height="0" fill="#b8804f"/></g>
  <circle cx="54" cy="98" r="17.5" fill="none" stroke="#ffd166" stroke-width="2.6"/><circle cx="82" cy="98" r="17.5" fill="none" stroke="#ffd166" stroke-width="2.6"/>
  <path d="M71 96 q-3 -3 -6 0" fill="none" stroke="#ffd166" stroke-width="2.4"/>
  <path class="brL" d="M40 78 L64 80" stroke="#5a3a1c" stroke-width="3.2" stroke-linecap="round"/>
  <path class="brR" d="M72 80 L96 78" stroke="#5a3a1c" stroke-width="3.2" stroke-linecap="round"/>
  <path class="beak" d="M63 110 L73 110 L68 121Z" fill="#ff9b42" stroke="#8a4a10" stroke-width="1.6" stroke-linejoin="round"/>
  <ellipse class="ck1" cx="42" cy="114" rx="5" ry="3" fill="#ff8f8f" opacity="0"/><ellipse class="ck2" cx="94" cy="114" rx="5" ry="3" fill="#ff8f8f" opacity="0"/>
  <path d="M38 72 L68 60 L98 72 L68 84Z" fill="#2a2a3a" stroke="#111" stroke-width="1.4"/><rect x="56" y="72" width="24" height="7" rx="2" fill="#2a2a3a"/>
  <path class="tas" d="M68 72 L92 74 L92 90" fill="none" stroke="#ffd166" stroke-width="1.8"/><circle class="tas2" cx="92" cy="92" r="2.6" fill="#ffd166"/>
  <path class="sweat" d="M100 84 q4 6 0 9 q-4 -3 0 -9Z" fill="#9fd8ff" stroke="#3d8bd9" stroke-width="1" style="opacity:0"/>
  <g class="spark" style="opacity:0"><polygon points="${starPts(20, 76, 6)}" fill="#ffd166"/><polygon points="${starPts(112, 68, 5)}" fill="#ffd166"/><polygon points="${starPts(116, 100, 3.5)}" fill="#fff"/></g>
  <g class="think" style="opacity:0"><circle cx="108" cy="72" r="2.5" fill="#ffffffaa"/><circle cx="115" cy="62" r="3.6" fill="#ffffffaa"/><text x="122" y="54" font-size="14" font-weight="900" fill="#ffffffcc">?</text></g>
</g>`,
      over: `<div class="chip"><span class="ci"></span><b class="ct"></b><i class="cn"></i></div><div class="bubble"><span class="bt"></span><span class="cr"></span></div><div class="log"></div>`,
      panel: `<button class="btn ghost" data-s="stuck">${ic('clock')}막힘</button><button class="btn ghost" data-s="wrong">${ic('xc')}연속 실수</button><button class="btn ghost" data-s="fast">${ic('bolt')}빠른 정답</button><button class="btn ghost" data-s="grit">${ic('flag')}끈기 정답</button>`,
    });
    const root = R.root;
    const owl = q<SVGGElement>(root, '.owl');
    const pus = qa<SVGGElement>(root, '.eL, .eR');
    const happy = q(root, '.happy');
    const lidL = q(root, '.lidL');
    const lidR = q(root, '.lidR');
    const brL = q(root, '.brL');
    const brR = q(root, '.brR');
    const ck = qa(root, '.ck1, .ck2');
    const sweat = q(root, '.sweat');
    const spark = q(root, '.spark');
    const think = q(root, '.think');
    const wl = q(root, '.wl');
    const wr = q(root, '.wr2');
    const chip = root.querySelector('.chip') as HTMLElement;
    const ci = root.querySelector('.ci') as HTMLElement;
    const ct = root.querySelector('.ct') as HTMLElement;
    const cn = root.querySelector('.cn') as HTMLElement;
    const btx = root.querySelector('.bt') as HTMLElement;
    const cr = root.querySelector('.cr') as HTMLElement;
    const bubble = root.querySelector('.bubble') as HTMLElement;
    const logEl = root.querySelector('.log') as HTMLElement;
    let now = 0;
    // 상황마다 아직 안 쓴 말 줄 (한 바퀴 다 쓰면 섞어서 다시 — 마지막 말과 첫 말이 겹치지 않게)
    const r = rng(7);
    const queue: Record<Sit, number[]> = { stuck: [], wrong: [], fast: [], grit: [] };
    const lastLine: Record<Sit, number> = { stuck: -1, wrong: -1, fast: -1, grit: -1 };
    const usedN: Record<Sit, number> = { stuck: 0, wrong: 0, fast: 0, grit: 0 };
    function pick(s: Sit): number {
      if (!queue[s].length) {
        const n = SIT[s].lines.length;
        const a = Array.from({ length: n }, (_, i) => i);
        for (let i = n - 1; i > 0; i--) {
          const j = Math.floor(r() * (i + 1));
          [a[i], a[j]] = [a[j]!, a[i]!];
        }
        if (a[0] === lastLine[s] && n > 1) [a[0], a[1]] = [a[1]!, a[0]!];
        queue[s] = a;
        usedN[s] = 0;
      }
      const v = queue[s].shift()!;
      lastLine[s] = v;
      usedN[s]++;
      return v;
    }
    let cur: { s: Sit; li: number; at: number } | null = null;
    const log: { s: Sit; text: string }[] = [];
    let autoIdx = -1;
    const A = autoCtl(() => (autoIdx = -1));
    function say(s: Sit, t: number): void {
      if (cur) log.unshift({ s: cur.s, text: SIT[cur.s].lines[cur.li]! });
      if (log.length > 3) log.length = 3;
      cur = { s, li: pick(s), at: t };
      const S = SIT[s];
      chip.style.color = S.col;
      ci.innerHTML = ic(S.icon);
      ct.textContent = S.tag;
      cn.textContent = `${usedN[s]}/${S.lines.length}번째 말 · 반복 없음`;
      logEl.innerHTML = log.length
        ? `<div class="lh">앞서 한 말</div>${log.map((l) => `<div style="--c:${SIT[l.s].col}">${esc(l.text)}</div>`).join('')}`
        : '';
    }
    root.addEventListener('pointerdown', (e) => {
      const el = (e.target as Element).closest('[data-s]');
      if (!el || !R.sync()) return;
      A.manual = true;
      say(el.getAttribute('data-s') as Sit, now);
    });
    return {
      controls: [A.ctl],
      update(t) {
        now = t;
        R.sync();
        if (A.base < 0) A.base = t;
        if (!A.manual) {
          const lt = t - A.base;
          const k = Math.floor(lt / 3.4);
          if (k !== autoIdx) {
            autoIdx = k;
            say(ORDER[k % ORDER.length]!, t);
          }
        }
        if (!cur) return;
        const age = t - cur.at;
        const line = SIT[cur.s].lines[cur.li]!;
        const n = Math.min(line.length, Math.floor(age / 0.045));
        btx.textContent = line.slice(0, n);
        cr.style.opacity = n < line.length || Math.sin(t * 8) > 0 ? '1' : '0';
        const bk = backOut(seg(age, 0, 0.3));
        bubble.style.transform = `scale(${0.85 + 0.15 * bk})`;
        bubble.style.transformOrigin = '0% 50%';
        // 표정
        const s = cur.s;
        const bob = Math.sin(t * 2.2) * 1.2;
        const hop = s === 'fast' || s === 'grit' ? Math.max(0, Math.sin(seg(age, 0, 0.5) * Math.PI)) * 8 : 0;
        const tilt = s === 'stuck' ? -6 : s === 'wrong' ? 4 : 0;
        tr(owl, `translate(0 ${bob - hop}) rotate(${tilt * sm(age / 0.4)} 68 150)`);
        const look = s === 'stuck' ? { x: 3, y: -4 } : s === 'wrong' ? { x: 0, y: 3 } : s === 'fast' ? { x: 3, y: 0 } : { x: 0, y: 0 };
        const big2 = s === 'fast' ? 1.25 : 1;
        pus.forEach((g, i) => {
          const c = i ? 82 : 54;
          tr(g, `translate(${c + look.x} ${98 + look.y}) scale(${big2}) translate(${-c} -98)`);
        });
        const blinkP = (t + 0.3) % 3.1;
        const blink = blinkP < 0.14 ? Math.sin((blinkP / 0.14) * Math.PI) : 0;
        const half = s === 'stuck' ? 0.35 : s === 'wrong' ? 0.2 : 0;
        const lid = Math.max(blink, half) * 34;
        lidL.setAttribute('height', String(lid));
        lidR.setAttribute('height', String(lid));
        const happyOn = s === 'grit';
        happy.style.opacity = happyOn ? '1' : '0';
        pus.forEach((g) => (g.style.opacity = happyOn ? '0' : '1'));
        if (happyOn) {
          lidL.setAttribute('height', '0');
          lidR.setAttribute('height', '0');
        }
        const brow: Record<Sit, [string, string]> = {
          stuck: ['M40 80 L64 80', 'M72 76 L96 70'],
          wrong: ['M40 76 L64 82', 'M72 82 L96 76'],
          fast: ['M40 72 L64 70', 'M72 70 L96 72'],
          grit: ['M40 78 Q52 72 64 78', 'M72 78 Q84 72 96 78'],
        };
        brL.setAttribute('d', brow[s][0]);
        brR.setAttribute('d', brow[s][1]);
        ck.forEach((c) => c.setAttribute('opacity', s === 'grit' || s === 'fast' ? '0.8' : '0'));
        sweat.style.opacity = s === 'wrong' ? String(0.6 + 0.4 * Math.sin(t * 4)) : '0';
        tr(sweat, `translate(0 ${s === 'wrong' ? (age * 6) % 8 : 0})`);
        spark.style.opacity = s === 'fast' || s === 'grit' ? String(0.5 + 0.5 * Math.sin(t * 7)) : '0';
        think.style.opacity = s === 'stuck' ? String(sm(age / 0.4)) : '0';
        const flap = s === 'fast' || s === 'grit' ? Math.sin(t * 16) * 10 * (1 - seg(age, 0.4, 1)) : 0;
        tr(wl, `rotate(${flap} 34 120)`);
        tr(wr, `rotate(${-flap} 102 120)`);
      },
      dispose: () => R.dispose(),
    };
  },
};

export const DEMOS: DemoMap = { i396, i397, i398, i399, i400, i401, i402, i403, i404, i405, i406, i407 };

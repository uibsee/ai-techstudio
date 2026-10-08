import type { DemoMap } from './types';

/**
 * 모션 그래픽 견본 (i90 ~ i108).
 *  - 캔버스 2D 견본은 280×175 가상 화면(view) 안에 그리고, 바탕은 화면 전체를 채운다 — 카드 · 큰 화면 모두 잘리지 않게.
 *  - DOM 견본(i92 · i108)은 SVG viewBox 280×175 + preserveAspectRatio meet. 클래스 접두 .ma-
 *  - 모두 주기 T 로 이음새 없이 돈다.
 */

type G = CanvasRenderingContext2D;
const F = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
const TF = '"Black Han Sans", "Pretendard Variable", sans-serif';
const TAU = Math.PI * 2;
const VW = 280;
const VH = 175;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const inOut = (x: number): number => {
  const v = clamp01(x);
  return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
};
const outBack = (x: number, s = 1.9): number => {
  const v = clamp01(x) - 1;
  return 1 + (s + 1) * v * v * v + s * v * v;
};
const outCubic = (x: number): number => 1 - Math.pow(1 - clamp01(x), 3);
/** a ~ b 구간에서 0 → 1 */
const seg = (p: number, a: number, b: number): number => clamp01((p - a) / (b - a));
const hsh = (n: number): number => {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
};
const mod = (a: number, b: number): number => ((a % b) + b) % b;

function bg(g: G, w: number, h: number, a = '#24306b', b = '#0c1230'): void {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, a);
  gr.addColorStop(1, b);
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
}
/** 280×175 가상 화면으로 맞추기 (save 포함 — 끝에 restore) */
function view(g: G, w: number, h: number): number {
  const u = Math.min(w / VW, h / VH);
  g.save();
  g.translate((w - VW * u) / 2, (h - VH * u) / 2);
  g.scale(u, u);
  return u;
}
function txt(g: G, s: string, x: number, y: number, size: number, color = '#fff', align: CanvasTextAlign = 'center', font = F, weight = 800): void {
  g.font = `${weight} ${size}px ${font}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(s, x, y);
}
function rr(g: G, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, Math.max(0, w), Math.max(0, h), Math.max(0, Math.min(r, w / 2, h / 2)));
}
function pill(g: G, s: string, x: number, y: number, size: number, fill: string, fg = '#fff'): void {
  g.font = `800 ${size}px ${F}`;
  const tw = g.measureText(s).width;
  const ph = size * 1.7;
  const pw = tw + size * 1.4;
  rr(g, x - pw / 2, y - ph / 2, pw, ph, ph / 2);
  g.fillStyle = fill;
  g.fill();
  txt(g, s, x, y + size * 0.05, size, fg, 'center', F, 800);
}
function stars(g: G, w: number, h: number, t: number, n = 40): void {
  for (let i = 0; i < n; i++) {
    const a = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2 + i * 1.7));
    g.fillStyle = `rgba(255,255,255,${a * 0.6})`;
    g.fillRect(hsh(i) * w, hsh(i + 50) * h, 1.3, 1.3);
  }
}
const speedCtl = (o: { s: number }, label = '속도') => ({ type: 'range' as const, label, min: 0.25, max: 2, step: 0.05, value: 1, on: (v: number) => (o.s = v) });

/* ───────── DOM (SVG) 도우미 ───────── */
let uid = 0;
const SVGNS = 'http://www.w3.org/2000/svg';
function svgRoot(box: HTMLElement, css: string, inner: string): { root: HTMLElement; svg: SVGSVGElement } {
  const root = document.createElement('div');
  root.className = 'ma-root';
  root.style.cssText = 'position:absolute;inset:0;overflow:hidden';
  root.innerHTML = `<style>${css}</style><svg xmlns="${SVGNS}" viewBox="0 0 280 175" preserveAspectRatio="xMidYMid meet" style="position:absolute;inset:0;width:100%;height:100%;display:block">${inner}</svg>`;
  box.appendChild(root);
  return { root, svg: root.querySelector('svg')! };
}

/* ───────── 그림 조각 ───────── */
function apple(g: G, x: number, y: number, r: number, detail = 1): void {
  g.save();
  g.translate(x, y);
  const gr = g.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r * 1.1);
  gr.addColorStop(0, '#ff8a80');
  gr.addColorStop(0.6, '#f0353d');
  gr.addColorStop(1, '#b3121f');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(0, -r * 0.7);
  g.bezierCurveTo(r * 0.9, -r * 1.25, r * 1.35, r * 0.25, r * 0.5, r * 0.95);
  g.bezierCurveTo(r * 0.25, r * 1.1, -r * 0.25, r * 1.1, -r * 0.5, r * 0.95);
  g.bezierCurveTo(-r * 1.35, r * 0.25, -r * 0.9, -r * 1.25, 0, -r * 0.7);
  g.fill();
  if (detail > 0) {
    g.globalAlpha = clamp01(detail);
    g.strokeStyle = '#6b3b1c';
    g.lineWidth = r * 0.12;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(0, -r * 0.6);
    g.quadraticCurveTo(r * 0.05, -r * 1.0, r * 0.2, -r * 1.15);
    g.stroke();
    g.fillStyle = '#4cc36a';
    g.beginPath();
    g.ellipse(r * 0.45, -r * 1.0, r * 0.38, r * 0.17, -0.5, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.beginPath();
    g.ellipse(-r * 0.42, -r * 0.2, r * 0.13, r * 0.26, 0.4, 0, TAU);
    g.fill();
  }
  g.restore();
}
function cloud(g: G, x: number, y: number, s: number, a = 0.95): void {
  g.fillStyle = `rgba(255,255,255,${a})`;
  g.beginPath();
  g.arc(x, y, 9 * s, 0, TAU);
  g.moveTo(x + 22 * s, y - 5 * s);
  g.arc(x + 11 * s, y - 5 * s, 11 * s, 0, TAU);
  g.moveTo(x + 33 * s, y);
  g.arc(x + 24 * s, y, 9 * s, 0, TAU);
  g.rect(x, y, 24 * s, 9 * s);
  g.fill();
}

/* ═════════ i90 키네틱 타이포 ═════════ */
const i90 = {
  kind: '2d' as const,
  caption: '글자마다 조금씩 늦게(stagger) 튀어 올라 통 — 잠시 뒤 차례로 떨어져요',
  make() {
    const o = { s: 1 };
    let tt = 0;
    let gap = 0.09;
    const word = '참 잘했어요!';
    const cols = ['#ffd84d', '#ff7aa8', '#7ee0ff', '#9dff8a', '#ffb05a', '#c9a2ff', '#ff6b6b'];
    return {
      controls: [speedCtl(o), { type: 'range' as const, label: '글자 사이 지연', min: 0.02, max: 0.25, step: 0.01, value: 0.09, on: (v: number) => (gap = v) }],
      draw(g: G, w: number, h: number, _t: number, dt: number) {
        tt += Math.max(0, dt) * o.s;
        const T = 4.3;
        const p = tt % T;
        bg(g, w, h, '#2b2f7a', '#120f38');
        stars(g, w, h, tt);
        view(g, w, h);
        const chars = [...word];
        const size = 40;
        g.font = `400 ${size}px ${TF}`;
        const ws = chars.map((c) => (c === ' ' ? size * 0.35 : g.measureText(c).width + 2));
        const total = ws.reduce((a, b) => a + b, 0);
        let x = VW / 2 - total / 2;
        let landed = 0;
        chars.forEach((c, i) => {
          const cw = ws[i]!;
          const cx = x + cw / 2;
          x += cw;
          if (c === ' ') return;
          const tin = p - (0.2 + i * gap);
          const tout = p - (3.4 + i * gap * 0.7);
          if (tin < 0) return;
          const k = clamp01(tin / 0.55);
          let y = 78 - (1 - outBack(k, 2.4)) * 50;
          let sc = lerp(0.2, 1, outBack(k, 2.2));
          let rot = (1 - outCubic(k)) * (i % 2 ? 0.6 : -0.6);
          let a = clamp01(tin / 0.12);
          // 착지 찌그러짐
          const land = tin - 0.35;
          let sx = 1;
          let sy = 1;
          if (land > 0 && land < 0.5) {
            const q = Math.exp(-land * 9) * Math.sin(land * 30);
            sx = 1 + q * 0.25;
            sy = 1 - q * 0.25;
          }
          if (k >= 1) landed++;
          if (tout > 0) {
            y += tout * tout * 260;
            rot += tout * (i % 2 ? 2.2 : -2.2);
            a *= clamp01(1 - tout * 1.6);
            sc *= 1 - tout * 0.2;
          }
          if (a <= 0) return;
          g.save();
          g.globalAlpha = a;
          g.translate(cx, y + 18);
          g.rotate(rot);
          g.scale(sc * sx, sc * sy);
          g.translate(0, -18);
          g.font = `400 ${size}px ${TF}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.lineJoin = 'round';
          g.fillStyle = 'rgba(0,0,0,.35)';
          g.fillText(c, 2, 4);
          g.strokeStyle = '#1a1446';
          g.lineWidth = 6;
          g.strokeText(c, 0, 0);
          g.fillStyle = cols[i % cols.length]!;
          g.fillText(c, 0, 0);
          g.fillStyle = 'rgba(255,255,255,.35)';
          g.fillText(c, 0, -1.5);
          g.restore();
        });
        // 다 내려앉으면 반짝 + 부제
        const allIn = landed >= chars.length - 1;
        const sub = seg(p, 0.2 + chars.length * gap + 0.4, 0.2 + chars.length * gap + 0.8) * (1 - seg(p, 3.3, 3.6));
        if (sub > 0) {
          g.save();
          g.globalAlpha = sub;
          g.translate(VW / 2, 128);
          g.scale(outBack(sub), outBack(sub));
          pill(g, '3 × 4 = 12  정답!', 0, 0, 12, '#ff5c8a');
          g.restore();
        }
        if (allIn) {
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU + tt;
            const r = 105 + 10 * Math.sin(tt * 3 + i);
            const sx = VW / 2 + Math.cos(a) * r;
            const sy = 78 + Math.sin(a) * r * 0.42;
            const s = 2.5 + 1.5 * Math.sin(tt * 6 + i * 2);
            g.fillStyle = cols[i % cols.length]!;
            g.beginPath();
            for (let j = 0; j < 8; j++) {
              const rr2 = j % 2 ? s * 0.4 : s * 1.4;
              g.lineTo(sx + Math.cos((j * TAU) / 8) * rr2, sy + Math.sin((j * TAU) / 8) * rr2);
            }
            g.fill();
          }
        }
        txt(g, `지연 ${gap.toFixed(2)}초 × 글자 순서`, VW - 8, VH - 9, 8, 'rgba(255,255,255,.5)', 'right', F, 600);
        g.restore();
      },
    };
  },
};
/* ═════════ i91 뜻을 연기하는 글자 ═════════ */
const i91 = {
  kind: '2d' as const,
  caption: '확대는 커지고, 회전은 90°씩 돌고, 대칭은 거울로 뒤집히고, 이동은 미끄러져요 — 단어가 뜻대로 움직여요',
  make() {
    const o = { s: 1 };
    let tt = 0;
    return {
      controls: [speedCtl(o)],
      draw(g: G, w: number, h: number, _t: number, dt: number) {
        tt += Math.max(0, dt) * o.s;
        bg(g, w, h, '#20285e', '#0d1233');
        view(g, w, h);
        const tiles = [
          { x: 8, y: 8, c1: '#ff7aa8', c2: '#c2366c', name: '확대' },
          { x: 142, y: 8, c1: '#7ec8ff', c2: '#2f6fd0', name: '회전' },
          { x: 8, y: 90, c1: '#9be87d', c2: '#3b9a3a', name: '대칭' },
          { x: 142, y: 90, c1: '#ffcf5c', c2: '#d98a1a', name: '이동' },
        ];
        const TW = 130;
        const TH = 77;
        tiles.forEach((tl, i) => {
          const gr = g.createLinearGradient(tl.x, tl.y, tl.x, tl.y + TH);
          gr.addColorStop(0, tl.c1);
          gr.addColorStop(1, tl.c2);
          rr(g, tl.x, tl.y, TW, TH, 12);
          g.fillStyle = gr;
          g.fill();
          g.save();
          rr(g, tl.x, tl.y, TW, TH, 12);
          g.clip();
          const cx = tl.x + TW / 2;
          const cy = tl.y + TH / 2 - 2;
          const word = (sx: number, sy: number, a = 1, rot = 0, ox = 0): void => {
            g.save();
            g.globalAlpha = a;
            g.translate(cx + ox, cy);
            g.rotate(rot);
            g.scale(sx, sy);
            g.font = `400 26px ${TF}`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillStyle = 'rgba(0,0,0,.25)';
            g.fillText(tl.name, 1.5, 2.5);
            g.fillStyle = '#fff';
            g.fillText(tl.name, 0, 0);
            g.restore();
          };
          if (i === 0) {
            // 확대: 0.7 → 1.5 숨쉬듯, 원래 크기 점선
            const k = inOut(0.5 - 0.5 * Math.cos(tt * 1.8));
            const s = lerp(0.7, 1.35, k);
            g.setLineDash([3, 3]);
            g.strokeStyle = 'rgba(255,255,255,.6)';
            g.lineWidth = 1;
            g.strokeRect(cx - 30, cy - 15, 60, 30);
            g.setLineDash([]);
            word(s, s);
            txt(g, `×${s.toFixed(1)}`, tl.x + TW - 8, tl.y + TH - 9, 9, '#fff', 'right');
          } else if (i === 1) {
            // 회전: 90°씩 딸깍
            const q = tt * 0.9;
            const n = Math.floor(q);
            const f = outBack(seg(q - n, 0, 0.45), 1.6);
            const ang = (n + f) * (Math.PI / 2);
            g.strokeStyle = 'rgba(255,255,255,.55)';
            g.lineWidth = 1.5;
            g.beginPath();
            g.arc(cx, cy, 33, -Math.PI / 2, -Math.PI / 2 + (mod(ang, TAU) || 0.001));
            g.stroke();
            word(1, 1, 1, ang);
            txt(g, `${Math.round(mod((n + Math.min(1, f)) * 90, 360))}°`, tl.x + TW - 8, tl.y + TH - 9, 9, '#fff', 'right');
          } else if (i === 2) {
            // 대칭: 축을 중심으로 거울 복사가 뒤집혀 넘어감
            const k = inOut(0.5 - 0.5 * Math.cos(tt * 1.5));
            g.setLineDash([4, 3]);
            g.strokeStyle = 'rgba(255,255,255,.85)';
            g.lineWidth = 1.2;
            g.beginPath();
            g.moveTo(cx, tl.y + 6);
            g.lineTo(cx, tl.y + TH - 6);
            g.stroke();
            g.setLineDash([]);
            const draw = (sx: number, a: number): void => {
              g.save();
              g.globalAlpha = a;
              g.translate(cx, cy);
              g.scale(sx, 1);
              g.font = `400 22px ${TF}`;
              g.textAlign = 'center';
              g.textBaseline = 'middle';
              g.fillStyle = '#fff';
              g.fillText(tl.name, -32, 0);
              g.restore();
            };
            draw(1, 1);
            draw(lerp(1, -1, k), 0.35 + 0.5 * k);
            txt(g, '거울', tl.x + TW - 8, tl.y + TH - 9, 9, '#fff', 'right');
          } else {
            // 이동: 미끄러지며 잔상
            const k = inOut(0.5 - 0.5 * Math.cos(tt * 1.4));
            const v = Math.sin(tt * 1.4);
            const ox = lerp(-30, 30, k);
            for (let j = 4; j >= 1; j--) word(1, 1, 0.12 * (1 - j / 5) * Math.abs(v) * 2, 0, ox - j * 6 * Math.sign(v));
            word(1, 1, 1, 0, ox);
            g.strokeStyle = 'rgba(255,255,255,.7)';
            g.lineWidth = 1;
            for (let j = 0; j <= 6; j++) {
              const xx = cx - 30 + j * 10;
              g.beginPath();
              g.moveTo(xx, tl.y + TH - 12);
              g.lineTo(xx, tl.y + TH - (j % 3 === 0 ? 18 : 15));
              g.stroke();
            }
            g.beginPath();
            g.moveTo(cx - 30, tl.y + TH - 12);
            g.lineTo(cx + 30, tl.y + TH - 12);
            g.stroke();
            g.fillStyle = '#fff';
            g.beginPath();
            g.arc(cx + ox, tl.y + TH - 12, 2.5, 0, TAU);
            g.fill();
            txt(g, `${ox >= 0 ? '+' : ''}${(ox / 10).toFixed(1)}칸`, tl.x + TW - 8, tl.y + 10, 9, '#fff', 'right');
          }
          g.restore();
        });
        g.restore();
      },
    };
  },
};

/* ═════════ i92 길 따라 흐르는 글자 (SVG textPath) ═════════ */
const i92 = {
  kind: 'dom' as const,
  caption: '원 둘레를 따라 문장이 흘러요 — SVG textPath 의 시작 위치(startOffset)만 계속 바꾼 것',
  make(box: HTMLElement) {
    const id = `ma92-${++uid}`;
    const o = { s: 1 };
    const R1 = 66;
    const R2 = 40;
    const C1 = TAU * R1;
    const C2 = TAU * R2;
    const cx = 140;
    const cy = 88;
    // 두 바퀴 길: 글자 길이가 정확히 한 바퀴라 시작점을 한 바퀴 옮기면 처음과 똑같다
    const lap = (r: number, sweep: number): string => `a ${r} ${r} 0 1 ${sweep} 0 ${2 * r} a ${r} ${r} 0 1 ${sweep} 0 ${-2 * r}`;
    const p1 = `M ${cx} ${cy - R1} ${lap(R1, 1)} ${lap(R1, 1)}`;
    const p2 = `M ${cx} ${cy - R2} a ${R2} ${R2} 0 1 0 0 ${2 * R2} a ${R2} ${R2} 0 1 0 0 ${-2 * R2} a ${R2} ${R2} 0 1 0 0 ${2 * R2} a ${R2} ${R2} 0 1 0 0 ${-2 * R2}`;
    let st = '';
    for (let i = 0; i < 46; i++) st += `<circle cx="${(hsh(i) * 280).toFixed(1)}" cy="${(hsh(i + 9) * 175).toFixed(1)}" r="${(0.4 + hsh(i + 3) * 0.8).toFixed(2)}" fill="#fff" opacity="${(0.3 + hsh(i + 5) * 0.5).toFixed(2)}"/>`;
    const { root } = svgRoot(
      box,
      `.ma-92t{font:800 12px ${F};fill:#ffe27a;letter-spacing:.5px}.ma-92s{font:700 10px ${F};fill:#9fe6ff}`,
      `<defs>
        <linearGradient id="${id}-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#25306e"/><stop offset="1" stop-color="#0c1132"/></linearGradient>
        <radialGradient id="${id}-pl" cx=".35" cy=".35" r=".8"><stop offset="0" stop-color="#9ff0ff"/><stop offset=".55" stop-color="#3b8cff"/><stop offset="1" stop-color="#2a3ab8"/></radialGradient>
        <path id="${id}-a" d="${p1}"/><path id="${id}-b" d="${p2}"/>
      </defs>
      <rect x="-200" y="-200" width="680" height="575" fill="url(#${id}-bg)"/>
      ${st}
      <circle cx="${cx}" cy="${cy}" r="${R1}" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="16"/>
      <circle cx="${cx}" cy="${cy}" r="${R2}" fill="none" stroke="rgba(120,220,255,.1)" stroke-width="12"/>
      <line class="ma-92r" x1="${cx}" y1="${cy}" x2="${cx + R2 - 8}" y2="${cy}" stroke="#fff" stroke-width="1" stroke-dasharray="2 2" opacity=".7"/>
      <circle cx="${cx}" cy="${cy}" r="17" fill="url(#${id}-pl)"/>
      <ellipse cx="${cx}" cy="${cy}" rx="26" ry="6" fill="none" stroke="#ffd166" stroke-width="2" opacity=".85" transform="rotate(-18 ${cx} ${cy})"/>
      <text class="ma-92t"><textPath class="ma-92a" href="#${id}-a" textLength="${C1.toFixed(2)}" lengthAdjust="spacing">원의 둘레 = 2 × π × 반지름 ★ 원의 둘레 = 2 × π × 반지름 ★ </textPath></text>
      <text class="ma-92s"><textPath class="ma-92b" href="#${id}-b" textLength="${C2.toFixed(2)}" lengthAdjust="spacing">π = 3.14159… ✦ π = 3.14159… ✦ </textPath></text>`,
    );
    const ta = root.querySelector('.ma-92a')!;
    const tb = root.querySelector('.ma-92b')!;
    const rl = root.querySelector('.ma-92r')!;
    let tt = 0;
    return {
      controls: [speedCtl(o)],
      update(_t: number, dt: number) {
        tt += Math.max(0, dt) * o.s;
        ta.setAttribute('startOffset', (mod(tt * 30, C1)).toFixed(2));
        tb.setAttribute('startOffset', (mod(tt * 22, C2)).toFixed(2));
        rl.setAttribute('transform', `rotate(${((tt * 40) % 360).toFixed(1)} ${cx} ${cy})`);
      },
      dispose() {
        root.remove();
      },
    };
  },
};

/* ═════════ i93 암호 풀리는 글자 ═════════ */
const i93 = {
  kind: '2d' as const,
  caption: '무작위 글자가 돌다가 왼쪽부터 하나씩 정답으로 딸깍 고정 — 해독 연출',
  make() {
    const o = { s: 1 };
    let tt = 0;
    const SYM = '0123456789#$%&?@*';
    const HAN = '가나다라마바사아자차카타파하수학모순검문';
    const code = ['4', '7', '2', '9'];
    const line = [...'모순을 찾았다!'];
    return {
      controls: [speedCtl(o)],
      draw(g: G, w: number, h: number, _t: number, dt: number) {
        tt += Math.max(0, dt) * o.s;
        const T = 5.4;
        const p = tt % T;
        const cyc = Math.floor(tt / T);
        bg(g, w, h, '#0f2a2a', '#06120f');
        // 스캔 줄
        g.fillStyle = 'rgba(80,255,170,.04)';
        for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
        view(g, w, h);
        txt(g, '비밀번호 해독', VW / 2, 18, 11, '#6dffb4', 'center', F, 800);
        const tick = Math.floor(tt * 15);
        const out = seg(p, 4.6, 5.1);
        const BW = 42;
        const x0 = VW / 2 - (BW * 4 + 8 * 3) / 2;
        code.forEach((c, i) => {
          const lockAt = 0.6 + i * 0.5;
          const unlockAt = 4.6 + (3 - i) * 0.12;
          const locked = p >= lockAt && p < unlockAt;
          const flash = locked ? Math.exp(-(p - lockAt) * 5) : 0;
          const x = x0 + i * (BW + 8);
          rr(g, x, 38, BW, 52, 8);
          g.fillStyle = locked ? `rgba(40,${120 + flash * 120},90,.55)` : 'rgba(255,255,255,.07)';
          g.fill();
          g.strokeStyle = locked ? '#6dffb4' : 'rgba(109,255,180,.35)';
          g.lineWidth = locked ? 2 : 1;
          g.stroke();
          const ch = locked ? c : SYM[Math.floor(hsh(tick * 7 + i * 13 + cyc) * SYM.length)]!;
          g.save();
          if (flash > 0) {
            g.shadowColor = '#6dffb4';
            g.shadowBlur = 14 * flash;
          }
          txt(g, ch, x + BW / 2, 65 + (locked ? 0 : (hsh(tick + i) - 0.5) * 3), 30, locked ? '#eafff4' : 'rgba(150,255,200,.55)', 'center', '"Consolas", monospace', 800);
          g.restore();
        });
        // 문장
        g.font = `800 15px ${F}`;
        const ws = line.map((c) => (c === ' ' ? 6 : 16));
        const tot = ws.reduce((a, b) => a + b, 0);
        let x = VW / 2 - tot / 2;
        line.forEach((c, i) => {
          const cw = ws[i]!;
          const lx = x + cw / 2;
          x += cw;
          if (c === ' ') return;
          const lock = p >= 2.6 + i * 0.13 && p < 4.6 + i * 0.05;
          const ch = lock ? c : HAN[Math.floor(hsh(tick * 3 + i * 31 + cyc) * HAN.length)]!;
          txt(g, ch, lx, 115, 15, lock ? '#ffffff' : 'rgba(109,255,180,.45)', 'center', F, 800);
        });
        const done = seg(p, 3.6, 3.9) * (1 - out);
        if (done > 0) {
          g.save();
          g.globalAlpha = done;
          g.translate(VW / 2, 147);
          const s = outBack(done);
          g.scale(s, s);
          pill(g, '해독 완료 ✓', 0, 0, 11, '#21c47a');
          g.restore();
        } else {
          const prog = code.filter((_, i) => p >= 0.6 + i * 0.5 && p < 4.6).length;
          txt(g, `${'■'.repeat(prog)}${'□'.repeat(4 - prog)}  풀어 내는 중…`, VW / 2, 147, 9, 'rgba(109,255,180,.7)', 'center', F, 700);
        }
        g.restore();
      },
    };
  },
};

/* ═════════ i94 숫자 굴러가기 (계기판) ═════════ */
const i94 = {
  kind: '2d' as const,
  caption: '+1 씩 더하면 일의 자리 띠가 돌고, 999 → 1000 에서 받아올림이 줄줄이 돌아가요',
  make() {
    const o = { s: 1 };
    let tt = 0;
    return {
      controls: [speedCtl(o)],
      draw(g: G, w: number, h: number, _t: number, dt: number) {
        tt += Math.max(0, dt) * o.s;
        const T = 7.4;
        const p = tt % T;
        const STEP = 0.36;
        const N = 16;
        let v: number;
        let back = false;
        if (p < N * STEP) {
          const s = p / STEP;
          const n = Math.floor(s);
          v = 992 + n + outBack(clamp01((s - n) / 0.7), 1.2);
        } else {
          back = true;
          v = lerp(992 + N, 992, inOut(seg(p, N * STEP + 0.5, T - 0.15)));
        }
        bg(g, w, h, '#2a2350', '#100c26');
        view(g, w, h);
        txt(g, back ? '되감기 ◀◀' : '+1 씩 더하기', VW / 2, 18, 11, back ? '#ffb4d0' : '#ffe27a');
        const CW = 40;
        const CH = 58;
        const gapX = 8;
        const x0 = VW / 2 - (CW * 4 + gapX * 3) / 2;
        const y0 = 40;
        // 판
        rr(g, x0 - 10, y0 - 10, CW * 4 + gapX * 3 + 20, CH + 20, 12);
        g.fillStyle = '#3b2f6e';
        g.fill();
        g.strokeStyle = '#ffd166';
        g.lineWidth = 2;
        g.stroke();
        const names = ['천', '백', '십', '일'];
        let rolling = 0;
        for (let col = 0; col < 4; col++) {
          const k = 3 - col;
          const pw = Math.pow(10, k);
          let cv: number;
          if (k === 0) cv = mod(v, 10);
          else cv = mod(Math.floor(v / pw), 10) + clamp01(mod(v, pw) - (pw - 1));
          const fr = cv - Math.floor(cv);
          const moving = fr > 0.02 && fr < 0.98;
          if (moving && k > 0) rolling++;
          const x = x0 + col * (CW + gapX);
          g.save();
          rr(g, x, y0, CW, CH, 6);
          g.clip();
          const gr = g.createLinearGradient(0, y0, 0, y0 + CH);
          gr.addColorStop(0, '#d9dcef');
          gr.addColorStop(0.5, '#ffffff');
          gr.addColorStop(1, '#d9dcef');
          g.fillStyle = gr;
          g.fillRect(x, y0, CW, CH);
          const base = Math.floor(cv);
          for (let d = base - 1; d <= base + 2; d++) {
            const y = y0 + CH / 2 + (d - cv) * CH * 0.85;
            txt(g, String(mod(d, 10)), x + CW / 2, y, 36, col === 0 ? '#e0446a' : '#2a2350', 'center', TF, 400);
          }
          const sh = g.createLinearGradient(0, y0, 0, y0 + CH);
          sh.addColorStop(0, 'rgba(30,20,70,.75)');
          sh.addColorStop(0.28, 'rgba(30,20,70,0)');
          sh.addColorStop(0.72, 'rgba(30,20,70,0)');
          sh.addColorStop(1, 'rgba(30,20,70,.75)');
          g.fillStyle = sh;
          g.fillRect(x, y0, CW, CH);
          g.restore();
          if (moving) {
            rr(g, x - 2, y0 - 2, CW + 4, CH + 4, 7);
            g.strokeStyle = k > 0 ? '#ff7aa8' : '#7ee0ff';
            g.lineWidth = 2;
            g.stroke();
          }
          txt(g, names[col]!, x + CW / 2, y0 + CH + 20, 10, 'rgba(255,255,255,.75)', 'center', F, 700);
        }
        if (!back && rolling >= 2) {
          g.save();
          g.translate(VW / 2, 154);
          pill(g, `받아올림 ${rolling}번!`, 0, 0, 11, '#ff5c8a');
          g.restore();
        } else {
          txt(g, `${Math.round(back ? v : Math.floor(v + 0.001))}`, VW / 2, 154, 11, 'rgba(255,255,255,.55)', 'center', F, 700);
        }
        g.restore();
      },
    };
  },
};

/* ═════════ i95 타자기 + 커서 ═════════ */
const i95 = {
  kind: '2d' as const,
  caption: '선배 대사가 한 글자씩 쳐지고, 쉼표 · 마침표에서 잠깐 멈춰요 — 쉬는 동안 커서가 깜박',
  make() {
    const o = { s: 1 };
    let tt = 0;
    const text = '자료를 그냥 믿지 마. 두 곳을 맞대 보면, 숫자가 거짓말하는 곳이 보일 거야.';
    const chars = [...text];
    const at: number[] = [];
    let acc = 0.4;
    chars.forEach((c, i) => {
      at.push(acc);
      acc += 0.055 + hsh(i) * 0.03;
      if (c === '.' || c === ',') acc += 0.38;
    });
    const typedEnd = acc;
    const holdEnd = typedEnd + 1.6;
    const eraseEnd = holdEnd + chars.length * 0.012;
    const T = eraseEnd + 0.5;
    return {
      controls: [speedCtl(o)],
      draw(g: G, w: number, h: number, _t: number, dt: number) {
        tt += Math.max(0, dt) * o.s;
        const p = tt % T;
        bg(g, w, h, '#33406f', '#151b38');
        view(g, w, h);
        // 선배 얼굴
        const ax = 40;
        const ay = 78;
        const talking = p < typedEnd && p > 0.4;
        g.fillStyle = '#ffd9b8';
        g.beginPath();
        g.arc(ax, ay, 22, 0, TAU);
        g.fill();
        g.fillStyle = '#2b2440';
        g.beginPath();
        g.arc(ax, ay - 6, 23, Math.PI * 1.05, Math.PI * 1.95);
        g.fill();
        g.strokeStyle = '#2b2440';
        g.lineWidth = 1.6;
        g.strokeRect(ax - 15, ay - 2, 11, 8);
        g.strokeRect(ax + 4, ay - 2, 11, 8);
        g.beginPath();
        g.moveTo(ax - 4, ay + 1);
        g.lineTo(ax + 4, ay + 1);
        g.stroke();
        g.fillStyle = '#2b2440';
        g.fillRect(ax - 11, ay + 1, 3, 3);
        g.fillRect(ax + 8, ay + 1, 3, 3);
        const mo = talking ? 1.5 + 2.5 * Math.abs(Math.sin(p * 22)) : 1;
        g.fillStyle = '#c24a5a';
        g.beginPath();
        g.ellipse(ax, ay + 13, 4, mo, 0, 0, TAU);
        g.fill();
        pill(g, '선배 윤정확', ax, ay + 36, 8, '#ffd166', '#2b2440');
        // 말풍선
        const bx = 78;
        const by = 38;
        const bw = 192;
        const bh = 92;
        rr(g, bx, by, bw, bh, 12);
        g.fillStyle = '#fffaf0';
        g.fill();
        g.beginPath();
        g.moveTo(bx, ay - 6);
        g.lineTo(bx - 10, ay);
        g.lineTo(bx, ay + 6);
        g.fill();
        // 몇 글자 보이나
        let n = 0;
        if (p < holdEnd) {
          while (n < chars.length && at[n]! <= p) n++;
        } else {
          n = Math.max(0, chars.length - Math.floor((p - holdEnd) / 0.012));
          if (p >= eraseEnd) n = 0;
        }
        g.font = `700 13px ${F}`;
        g.textBaseline = 'middle';
        g.textAlign = 'left';
        const maxW = bw - 24;
        let x = bx + 12;
        let y = by + 18;
        const LH = 21;
        // 낱말 단위 줄바꿈 (전체 문장 기준으로 줄을 미리 정해 두어 쳐지는 동안 글자가 튀지 않게)
        const pos: [number, number][] = [];
        const words = text.split(' ');
        words.forEach((wd, wi) => {
          const ww = g.measureText(wd).width;
          if (x + ww > bx + 12 + maxW) {
            x = bx + 12;
            y += LH;
          }
          for (const c of wd) {
            pos.push([x, y]);
            x += g.measureText(c).width;
          }
          if (wi < words.length - 1) {
            pos.push([x, y]);
            x += g.measureText(' ').width;
          }
        });
        let cx = bx + 12;
        let cy = by + 18;
        for (let i = 0; i < n; i++) {
          const [px, py] = pos[i]!;
          const age = p - at[i]!;
          const pop = p < holdEnd ? clamp01(age / 0.08) : 1;
          g.fillStyle = `rgba(43,36,64,${0.3 + 0.7 * pop})`;
          g.fillText(chars[i]!, px, py + (1 - pop) * 3);
          cx = px + g.measureText(chars[i]!).width;
          cy = py;
        }
        const busy = p < typedEnd && p > 0.4 && n > 0 && p - at[n - 1]! < 0.12;
        const on = busy || Math.floor(tt * 2.2) % 2 === 0;
        if (on) {
          g.fillStyle = '#ff5c8a';
          g.fillRect(cx + 1, cy - 8, 2, 16);
        }
        g.restore();
      },
    };
  },
};

/* ═════════ i96 도형 모핑 ═════════ */
const NPT = 60;
function polyPts(k: number, R: number): [number, number][] {
  const out: [number, number][] = [];
  if (k === 0) {
    for (let i = 0; i < NPT; i++) {
      const a = -Math.PI / 2 + (i / NPT) * TAU;
      out.push([Math.cos(a) * R, Math.sin(a) * R]);
    }
    return out;
  }
  const off = -Math.PI / 2 + (k % 2 === 0 ? Math.PI / k : 0);
  const per = NPT / k;
  for (let s = 0; s < k; s++) {
    const a0 = off + (s / k) * TAU;
    const a1 = off + ((s + 1) / k) * TAU;
    for (let j = 0; j < per; j++) {
      const f = j / per;
      out.push([lerp(Math.cos(a0), Math.cos(a1), f) * R, lerp(Math.sin(a0), Math.sin(a1), f) * R]);
    }
  }
  // 첫 점을 가장 위쪽(시계 12시)에 가깝게 돌려 맞춘다 — 모양끼리 비틀림이 덜하게
  let best = 0;
  let bestA = 9;
  out.forEach(([x, y], i) => {
    const d = Math.abs(Math.atan2(x, -y));
    if (d < bestA - 1e-6) {
      bestA = d;
      best = i;
    }
  });
  return out.slice(best).concat(out.slice(0, best));
}
const i96 = {
  kind: '2d' as const,
  caption: '삼각형 → 사각형 → 오각형 → 육각형 → 원 — 모두 점 60개로 맞춰 두고 점끼리 이어서 바꿔요',
  make() {
    const o = { s: 1 };
    let tt = 0;
    let showPts = false;
    const SH = [
      { k: 3, n: '삼각형', c: '#ff7aa8' },
      { k: 4, n: '사각형', c: '#ffb347' },
      { k: 5, n: '오각형', c: '#ffe066' },
      { k: 6, n: '육각형', c: '#7be0a0' },
      { k: 0, n: '원', c: '#7ec8ff' },
    ];
    const pts = SH.map((s) => polyPts(s.k, 52));
    return {
      controls: [speedCtl(o), { type: 'toggle' as const, label: '점 60개 보기', value: false, on: (v: boolean) => (showPts = v) }],
      draw(g: G, w: number, h: number, _t: number, dt: number) {
        tt += Math.max(0, dt) * o.s;
        const HOLD = 0.9;
        const MOR = 0.75;
        const T = SH.length * (HOLD + MOR);
        const p = tt % T;
        const i = Math.min(SH.length - 1, Math.floor(p / (HOLD + MOR)));
        const lp = p - i * (HOLD + MOR);
        const k = inOut(seg(lp, HOLD, HOLD + MOR));
        const j = (i + 1) % SH.length;
        const A = pts[i]!;
        const B = pts[j]!;
        bg(g, w, h, '#26306a', '#0e1435');
        view(g, w, h);
        const cx = 105;
        const cy = 88;
        // 바닥 그림자
        g.fillStyle = 'rgba(0,0,0,.25)';
        g.beginPath();
        g.ellipse(cx, cy + 66, 46, 6, 0, 0, TAU);
        g.fill();
        const bounce = 1 + 0.06 * Math.sin(k * Math.PI);
        const rot = k * (TAU / 12);
        g.save();
        g.translate(cx, cy);
        g.rotate(rot * (1 - k) * 0);
        g.scale(bounce, bounce);
        g.beginPath();
        for (let q = 0; q < NPT; q++) {
          const x = lerp(A[q]![0], B[q]![0], k);
          const y = lerp(A[q]![1], B[q]![1], k);
          if (q === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.closePath();
        const ca = SH[i]!.c;
        const cb = SH[j]!.c;
        const gr = g.createLinearGradient(-50, -55, 50, 55);
        gr.addColorStop(0, k < 0.5 ? ca : cb);
        gr.addColorStop(1, '#5b4bd6');
        g.fillStyle = gr;
        g.fill();
        g.lineJoin = 'round';
        g.strokeStyle = '#fff';
        g.lineWidth = 3;
        g.stroke();
        // 꼭짓점
        const vk = SH[k < 0.5 ? i : j]!.k;
        const va = 1 - Math.min(1, Math.sin(k * Math.PI) * 2);
        if (vk > 0 && va > 0) {
          const P = k < 0.5 ? A : B;
          for (let q = 0; q < NPT; q += NPT / vk) {
            g.fillStyle = `rgba(255,255,255,${va})`;
            g.beginPath();
            g.arc(P[q]![0], P[q]![1], 4, 0, TAU);
            g.fill();
          }
        }
        if (showPts) {
          for (let q = 0; q < NPT; q++) {
            g.fillStyle = q === 0 ? '#ff3b6b' : 'rgba(255,255,255,.85)';
            g.beginPath();
            g.arc(lerp(A[q]![0], B[q]![0], k), lerp(A[q]![1], B[q]![1], k), q === 0 ? 2.6 : 1.3, 0, TAU);
            g.fill();
          }
        }
        g.restore();
        // 오른쪽 이름 · 변의 수
        const cur = SH[k < 0.5 ? i : j]!;
        const tx = 215;
        txt(g, cur.n, tx, 62, 20, '#fff', 'center', TF, 400);
        txt(g, cur.k ? `변 ${cur.k}개` : '변이 끝없이 많아요', tx, 86, 10, 'rgba(255,255,255,.75)', 'center', F, 700);
        // 순서 띠
        SH.forEach((s, q) => {
          const x = 176 + q * 20;
          const on = q === (k < 0.5 ? i : j);
          g.save();
          g.translate(x, 118);
          g.scale(on ? 1.25 : 1, on ? 1.25 : 1);
          g.beginPath();
          const pp = polyPts(s.k, 6.5);
          pp.forEach(([px, py], r) => (r ? g.lineTo(px, py) : g.moveTo(px, py)));
          g.closePath();
          g.fillStyle = on ? s.c : 'rgba(255,255,255,.25)';
          g.fill();
          g.restore();
        });
        txt(g, '변을 늘리면 원에 가까워져요', tx, 142, 8, 'rgba(255,255,255,.55)', 'center', F, 600);
        g.restore();
      },
    };
  },
};

/* ═════════ i97 매개 모핑 ═════════ */
const i97 = {
  kind: '2d' as const,
  caption: '숫자 「3」이 작은 점으로 줄었다가 사과 3개로 펴져요 — 셋이 한꺼번에 겹치지 않게 「점」을 다리로',
  make() {
    const o = { s: 1 };
    let tt = 0;
    return {
      controls: [speedCtl(o)],
      draw(g: G, w: number, h: number, _t: number, dt: number) {
        tt += Math.max(0, dt) * o.s;
        const T = 6.4;
        const p = tt % T;
        bg(g, w, h, '#fff3df', '#ffd9b3');
        view(g, w, h);
        const cx = VW / 2;
        const cy = 74;
        // 단계: 0-0.9 숫자, 0.9-1.6 숫자→점, 1.6-2.5 점→사과, 2.5-3.6 사과, 3.6-4.4 사과→점, 4.4-5.2 점→숫자, 5.2-6.4 숫자
        let stage = 0;
        const numShrink = seg(p, 0.9, 1.6);
        const split = seg(p, 1.6, 2.5);
        const merge = seg(p, 3.6, 4.4);
        const grow = seg(p, 4.4, 5.2);
        const showNum = p < 1.6 || p >= 4.4;
        if (showNum) {
          const s = p < 1.6 ? lerp(1, 0.08, inOut(numShrink)) : lerp(0.08, 1, outBack(grow, 1.4));
          const crossDot = p < 1.6 ? seg(numShrink, 0.65, 1) : 1 - seg(grow, 0, 0.35);
          stage = s > 0.3 ? 0 : 1;
          g.save();
          g.translate(cx, cy);
          g.scale(s, s);
          g.globalAlpha = 1 - crossDot;
          g.font = `400 96px ${TF}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillStyle = 'rgba(160,60,20,.18)';
          g.fillText('3', 4, 8);
          g.fillStyle = '#ff5a3c';
          g.fillText('3', 0, 4);
          g.restore();
          if (crossDot > 0) {
            g.fillStyle = `rgba(230,50,50,${crossDot})`;
            g.beginPath();
            g.arc(cx, cy, 6, 0, TAU);
            g.fill();
          }
        } else {
          const spread = p < 3.6 ? inOut(split) : 1 - inOut(merge);
          const r = lerp(6, 19, spread);
          stage = spread > 0.6 ? 2 : 1;
          for (let q = 0; q < 3; q++) {
            const delay = q * 0.08;
            const sp = p < 3.6 ? outBack(seg(split, delay, 0.75 + delay), 1.3) : 1 - inOut(seg(merge, 0.25 - delay, 1 - delay));
            const x = cx + (q - 1) * 60 * sp;
            const y = cy + 6 * sp - Math.sin(sp * Math.PI) * 18;
            const bob = spread > 0.95 ? Math.sin(tt * 3 + q) * 2 : 0;
            if (spread < 0.25) {
              g.fillStyle = '#e63232';
              g.beginPath();
              g.arc(x, y, r, 0, TAU);
              g.fill();
            } else apple(g, x, y + bob, r, seg(spread, 0.4, 0.9));
            const lab = seg(p, 2.4 + q * 0.2, 2.6 + q * 0.2) * (1 - merge * 3);
            if (lab > 0) {
              g.save();
              g.globalAlpha = clamp01(lab);
              txt(g, String(q + 1), x, y - 34 - lab * 2, 12, '#b5321c', 'center', TF, 400);
              g.restore();
            }
          }
        }
        // 아래 세 단계 표
        const chips = ['기호 3', '매개 ●', '양 (사과 셋)'];
        chips.forEach((c, q) => {
          const x = 60 + q * 80;
          const on = q === stage;
          g.save();
          g.globalAlpha = on ? 1 : 0.45;
          pill(g, c, x, 150, on ? 10 : 9, on ? '#ff5a3c' : '#c99a7a');
          g.restore();
          if (q < 2) txt(g, '→', x + 40, 150, 10, '#b5784e');
        });
        g.restore();
      },
    };
  },
};

/* ═════════ i98 점선 행진 ═════════ */
const i98 = {
  kind: '2d' as const,
  caption: '점선의 시작 위치(dashoffset)만 계속 옮기면 길 · 물길 · 전류가 흐르는 것처럼 보여요',
  make() {
    const o = { s: 1 };
    let tt = 0;
    return {
      controls: [speedCtl(o, '흐름 빠르기')],
      draw(g: G, w: number, h: number, _t: number, dt: number) {
        tt += Math.max(0, dt) * o.s;
        bg(g, w, h, '#a8e07a', '#6fbf55');
        view(g, w, h);
        // 물길
        const river = (): void => {
          g.beginPath();
          for (let x = -10; x <= 290; x += 5) {
            const y = 24 + Math.sin(x * 0.04) * 7;
            if (x === -10) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
        };
        river();
        g.strokeStyle = '#4aa8ea';
        g.lineWidth = 16;
        g.lineCap = 'round';
        g.stroke();
        river();
        g.strokeStyle = '#d6f2ff';
        g.lineWidth = 2;
        g.setLineDash([10, 12]);
        g.lineDashOffset = -tt * 40;
        g.stroke();
        g.setLineDash([]);
        txt(g, '물길', 252, 44, 8, '#1d5d8f', 'center', F, 800);
        // 길 (집 → 학교)
        const road = (): void => {
          g.beginPath();
          g.moveTo(34, 142);
          g.bezierCurveTo(90, 150, 60, 80, 110, 82);
          g.bezierCurveTo(150, 84, 130, 58, 168, 58);
        };
        road();
        g.strokeStyle = '#f2d8a4';
        g.lineWidth = 12;
        g.stroke();
        road();
        g.strokeStyle = '#ffffff';
        g.lineWidth = 2.5;
        g.setLineDash([6, 6]);
        g.lineDashOffset = -tt * 24;
        g.stroke();
        g.setLineDash([]);
        // 집
        g.fillStyle = '#ffe9c7';
        g.fillRect(20, 128, 26, 20);
        g.fillStyle = '#e8584c';
        g.beginPath();
        g.moveTo(16, 130);
        g.lineTo(33, 114);
        g.lineTo(50, 130);
        g.fill();
        g.fillStyle = '#8a5a2e';
        g.fillRect(29, 137, 8, 11);
        // 학교
        g.fillStyle = '#fff4d9';
        g.fillRect(160, 40, 34, 26);
        g.fillStyle = '#5b7be0';
        g.fillRect(158, 36, 38, 6);
        g.fillStyle = '#ffd166';
        g.beginPath();
        g.arc(177, 52, 5, 0, TAU);
        g.fill();
        txt(g, '길', 110, 98, 8, '#7a4f1c', 'center', F, 800);
        // 회로
        const cx0 = 204;
        const cy0 = 92;
        const CW = 62;
        const CH = 58;
        rr(g, cx0 - 6, cy0 - 6, CW + 12, CH + 12, 8);
        g.fillStyle = 'rgba(30,40,70,.85)';
        g.fill();
        g.beginPath();
        g.rect(cx0, cy0, CW, CH);
        g.strokeStyle = '#6b7488';
        g.lineWidth = 3;
        g.stroke();
        g.beginPath();
        g.rect(cx0, cy0, CW, CH);
        g.strokeStyle = '#ffe14d';
        g.lineWidth = 2;
        g.setLineDash([4, 5]);
        g.lineDashOffset = -tt * 30;
        g.stroke();
        g.setLineDash([]);
        // 전지
        g.fillStyle = '#3a3f55';
        g.fillRect(cx0 - 5, cy0 + CH / 2 - 9, 10, 18);
        g.fillStyle = '#ff5a5a';
        g.fillRect(cx0 - 5, cy0 + CH / 2 - 9, 10, 6);
        // 전구
        const glow = 0.75 + 0.25 * Math.sin(tt * 8);
        const rg = g.createRadialGradient(cx0 + CW, cy0 + CH / 2, 1, cx0 + CW, cy0 + CH / 2, 16);
        rg.addColorStop(0, `rgba(255,240,140,${glow})`);
        rg.addColorStop(1, 'rgba(255,240,140,0)');
        g.fillStyle = rg;
        g.beginPath();
        g.arc(cx0 + CW, cy0 + CH / 2, 16, 0, TAU);
        g.fill();
        g.fillStyle = '#fff7b0';
        g.beginPath();
        g.arc(cx0 + CW, cy0 + CH / 2, 6, 0, TAU);
        g.fill();
        txt(g, '전류', cx0 + CW / 2, cy0 + CH / 2, 9, '#ffe14d', 'center', F, 800);
        g.restore();
      },
    };
  },
};

/* ═════════ 장면 둘 (i99 · i107 공용) ═════════ */
type Scene = (g: G, w: number, h: number, t: number) => void;
const sceneQ: Scene = (g, w, h, t) => {
  bg(g, w, h, '#4f8dff', '#2a4fc4');
  view(g, w, h);
  for (let i = 0; i < 6; i++) {
    const x = (hsh(i) * 300 + t * 8 * (i % 2 ? 1 : -1)) % 300;
    txt(g, '+−×÷'[i % 4]!, mod(x, 300) - 10, 20 + hsh(i + 3) * 140, 14, 'rgba(255,255,255,.18)', 'center', F, 900);
  }
  txt(g, '3 + 4 = ?', VW / 2, VH / 2 - 6, 40, '#fff', 'center', TF, 400);
  txt(g, '문제', VW / 2, VH / 2 + 30, 11, 'rgba(255,255,255,.8)');
  g.restore();
};
const sceneA: Scene = (g, w, h, t) => {
  bg(g, w, h, '#ffcf5c', '#ff8a5c');
  view(g, w, h);
  for (let i = 0; i < 14; i++) {
    const y = mod(hsh(i) * 175 + t * (20 + hsh(i + 1) * 20), 190) - 10;
    g.fillStyle = ['#ff5c8a', '#5cd6ff', '#7be07b', '#ffffff'][i % 4]!;
    g.save();
    g.translate(hsh(i + 7) * 280, y);
    g.rotate(t * 3 + i);
    g.fillRect(-3, -1.5, 6, 3);
    g.restore();
  }
  txt(g, '7', VW / 2 - 30, VH / 2 - 4, 58, '#fff', 'center', TF, 400);
  txt(g, '정답!', VW / 2 + 32, VH / 2 - 2, 22, '#b3261e', 'center', TF, 400);
  g.restore();
};

/* ═════════ i99 마스크 와이프 · 원 조리개 ═════════ */
const i99 = {
  kind: '2d' as const,
  caption: '비스듬한 띠가 쓸며 정답 화면이 드러나고, 원 조리개가 열리며 문제 화면으로 돌아와요',
  make() {
    const o = { s: 1 };
    let tt = 0;
    return {
      controls: [speedCtl(o)],
      draw(g: G, w: number, h: number, _t: number, dt: number) {
        tt += Math.max(0, dt) * o.s;
        const T = 6;
        const p = tt % T;
        const band = inOut(seg(p, 1.1, 2.0));
        const iris = inOut(seg(p, 4.1, 5.0));
        let label = '';
        if (p < 1.1 || p >= 5.0) sceneQ(g, w, h, tt);
        else if (p < 2.0) {
          label = '띠 와이프';
          sceneQ(g, w, h, tt);
          // 비스듬한 가장자리: x + y*0.5 < 경계
          const edge = lerp(-h * 0.5 - 20, w + 20, band);
          g.save();
          g.beginPath();
          g.moveTo(-1, -1);
          g.lineTo(edge + h * 0.25, -1);
          g.lineTo(edge - h * 0.25, h + 1);
          g.lineTo(-1, h + 1);
          g.closePath();
          g.clip();
          sceneA(g, w, h, tt);
          g.restore();
          g.strokeStyle = '#fff';
          g.lineWidth = 4;
          g.beginPath();
          g.moveTo(edge + h * 0.25, 0);
          g.lineTo(edge - h * 0.25, h);
          g.stroke();
        } else if (p < 4.1) sceneA(g, w, h, tt);
        else {
          label = '원 조리개';
          sceneA(g, w, h, tt);
          const R = Math.hypot(w, h) * 0.55 * iris;
          g.save();
          g.beginPath();
          g.arc(w / 2, h / 2, Math.max(0.1, R), 0, TAU);
          g.clip();
          sceneQ(g, w, h, tt);
          g.restore();
          g.strokeStyle = '#fff';
          g.lineWidth = 4;
          g.beginPath();
          g.arc(w / 2, h / 2, Math.max(0.1, R), 0, TAU);
          g.stroke();
        }
        if (label) {
          const u = view(g, w, h);
          void u;
          pill(g, label, VW / 2, 16, 10, 'rgba(20,20,50,.75)');
          g.restore();
        }
      },
    };
  },
};

/* ═════════ i100 글자 속 그림 ═════════ */
const i100 = {
  kind: '2d' as const,
  caption: '큰 글자 「수학」 모양 구멍으로 움직이는 그림이 보여요 — 끝에는 글자 속으로 쑥 들어가 그림 전체가 드러나요',
  make() {
    const o = { s: 1 };
    let tt = 0;
    let oc: HTMLCanvasElement | null = null;
    const paint = (c: G, t: number): void => {
      // 가상 280×175 그림 (하늘 · 해 · 언덕 · 떠다니는 기호)
      const gr = c.createLinearGradient(0, 0, 0, VH);
      gr.addColorStop(0, '#5ec8ff');
      gr.addColorStop(0.6, '#b8ecff');
      gr.addColorStop(1, '#fff1c9');
      c.fillStyle = gr;
      c.fillRect(-40, -40, VW + 80, VH + 80);
      const sx = 70 + Math.sin(t * 0.4) * 30;
      const sg = c.createRadialGradient(sx, 50, 2, sx, 50, 40);
      sg.addColorStop(0, '#fff6a0');
      sg.addColorStop(0.4, '#ffcf3a');
      sg.addColorStop(1, 'rgba(255,200,60,0)');
      c.fillStyle = sg;
      c.beginPath();
      c.arc(sx, 50, 40, 0, TAU);
      c.fill();
      for (let i = 0; i < 3; i++) cloud(c, mod(i * 110 + t * 12, VW + 80) - 50, 30 + i * 18, 0.9);
      const hill = (yb: number, amp: number, col: string, ph: number): void => {
        c.fillStyle = col;
        c.beginPath();
        c.moveTo(-40, VH + 40);
        for (let x = -40; x <= VW + 40; x += 8) c.lineTo(x, yb + Math.sin(x * 0.03 + ph + t * 0.3) * amp);
        c.lineTo(VW + 40, VH + 40);
        c.fill();
      };
      hill(96, 12, '#5fcf6f', 0);
      hill(116, 9, '#3eae5a', 2);
      for (let i = 0; i < 9; i++) {
        const x = mod(hsh(i) * 320 + t * (14 + i * 3), 320) - 20;
        const y = 85 + Math.sin(t * 0.8 + i * 1.3) * 32;
        c.fillStyle = ['#ff3d7f', '#6b4cff', '#ff7a1a'][i % 3]!;
        c.font = `900 ${24 + (i % 3) * 8}px ${F}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(['+', '×', 'π', '÷', '=', '7', '√', '3', '%'][i]!, x, y);
      }
    };
    return {
      controls: [speedCtl(o)],
      dispose() {
        oc = null;
      },
      draw(g: G, w: number, h: number, _t: number, dt: number) {
        tt += Math.max(0, dt) * o.s;
        const T = 7;
        const p = tt % T;
        const dpr = g.getTransform().a;
        const W = Math.max(1, Math.round(w * dpr));
        const H = Math.max(1, Math.round(h * dpr));
        if (!oc) oc = document.createElement('canvas');
        if (oc.width !== W || oc.height !== H) {
          oc.width = W;
          oc.height = H;
        }
        const c = oc.getContext('2d')!;
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.globalCompositeOperation = 'source-over';
        c.clearRect(0, 0, W, H);
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        const u = Math.min(w / VW, h / VH);
        const vx = (w - VW * u) / 2;
        const vy = (h - VH * u) / 2;
        c.save();
        c.translate(vx, vy);
        c.scale(u, u);
        // 그림을 조금 크게 그려 천천히 흐르게 (화면 전체를 덮을 만큼)
        const cov = Math.max(w / (VW * u), h / (VH * u));
        c.translate(VW / 2, VH / 2);
        c.scale(cov * 1.05, cov * 1.05);
        c.translate(-VW / 2, -VH / 2);
        paint(c, tt);
        c.restore();
        // 글자 마스크
        const zin = seg(p, 4.0, 5.0);
        const zout = seg(p, 6.0, 7.0);
        const z = p < 5.5 ? Math.pow(40, inOut(zin)) : Math.pow(40, 1 - inOut(zout));
        const reveal = p < 5.5 ? seg(zin, 0.35, 1) : 1 - seg(zout, 0, 0.5);
        c.globalCompositeOperation = 'destination-in';
        c.save();
        c.translate(vx, vy);
        c.scale(u, u);
        c.translate(VW / 2 - 10 * (z - 1) * 0.0, VH / 2 + 4);
        c.scale(z, z);
        c.font = `400 92px ${TF}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = '#000';
        c.fillText('수학', 0, 0);
        c.restore();
        if (reveal > 0) {
          c.globalAlpha = reveal;
          c.fillRect(0, 0, w, h);
          c.globalAlpha = 1;
        }
        c.globalCompositeOperation = 'source-over';
        // 바탕
        bg(g, w, h, '#1b1f4a', '#0b0d24');
        view(g, w, h);
        g.save();
        g.translate(VW / 2, VH / 2 + 4);
        g.scale(z, z);
        g.font = `400 92px ${TF}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = 'rgba(0,0,0,.45)';
        g.fillText('수학', 3, 5);
        g.restore();
        g.restore();
        g.save();
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.drawImage(oc, 0, 0);
        g.restore();
        view(g, w, h);
        if (z < 1.5) {
          g.save();
          g.translate(VW / 2, VH / 2 + 4);
          g.scale(z, z);
          g.font = `400 92px ${TF}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.strokeStyle = 'rgba(255,255,255,.75)';
          g.lineWidth = 1.5;
          g.strokeText('수학', 0, 0);
          g.restore();
        }
        g.restore();
      },
    };
  },
};

/* ═════════ i101 격자 물결 ═════════ */
const i101 = {
  kind: '2d' as const,
  caption: '곱셈표 칸이 가운데(5 × 5)에서부터 거리 순서대로 물결처럼 뒤집혀 답이 나와요',
  make() {
    const o = { s: 1 };
    let tt = 0;
    let delay = 0.09;
    return {
      controls: [speedCtl(o), { type: 'range' as const, label: '거리당 지연(초)', min: 0.02, max: 0.2, step: 0.01, value: 0.09, on: (v: number) => (delay = v) }],
      draw(g: G, w: number, h: number, _t: number, dt: number) {
        tt += Math.max(0, dt) * o.s;
        const T = 6.4;
        const p = tt % T;
        bg(g, w, h, '#22275e', '#0d1030');
        view(g, w, h);
        const N = 9;
        const CS = 17;
        const x0 = 14;
        const y0 = (VH - N * CS) / 2;
        const D = 0.45;
        for (let r = 0; r < N; r++)
          for (let c = 0; c < N; c++) {
            const d = Math.hypot(r - 4, c - 4);
            const f1 = seg(p, 0.3 + d * delay, 0.3 + d * delay + D);
            const f2 = seg(p, 3.6 + d * delay, 3.6 + d * delay + D);
            const f = f1 - f2; // 0 앞면 → 1 뒷면 → 0
            const ang = (p < 3.6 ? f1 : 1 + f2) * Math.PI;
            const sx = Math.abs(Math.cos(ang));
            const back = f > 0.5 || (p >= 3.6 && f2 < 0.5 && f1 >= 1);
            const x = x0 + c * CS + CS / 2;
            const y = y0 + r * CS + CS / 2;
            const lift = Math.sin(ang) * 2;
            g.save();
            g.translate(x, y - Math.abs(lift));
            g.scale(Math.max(0.02, sx), 1);
            const v = (r + 1) * (c + 1);
            rr(g, -CS / 2 + 1, -CS / 2 + 1, CS - 2, CS - 2, 3);
            if (back) {
              g.fillStyle = `hsl(${(330 - v * 3.2) % 360},85%,${62 - v * 0.15}%)`;
              g.fill();
              txt(g, String(v), 0, 0.5, v >= 10 ? 7.5 : 8.5, '#fff', 'center', F, 900);
            } else {
              g.fillStyle = r === 4 && c === 4 ? '#ffd166' : '#3a438c';
              g.fill();
              g.fillStyle = 'rgba(255,255,255,.18)';
              g.fillRect(-CS / 2 + 3, -CS / 2 + 3, CS - 6, 1.5);
            }
            g.restore();
          }
        // 물결 고리
        for (const s0 of [0.3, 3.6]) {
          const rad = (p - s0) / delay;
          if (rad > 0 && rad < 6.5) {
            g.strokeStyle = `rgba(255,255,255,${0.5 * (1 - rad / 6.5)})`;
            g.lineWidth = 2;
            g.beginPath();
            g.arc(x0 + 4.5 * CS, y0 + 4.5 * CS, rad * CS, 0, TAU);
            g.stroke();
          }
        }
        const tx = 220;
        txt(g, '곱셈표', tx, 50, 18, '#fff', 'center', TF, 400);
        txt(g, '가운데에서 바깥으로', tx, 76, 9, 'rgba(255,255,255,.75)', 'center', F, 700);
        txt(g, `지연 = 거리 × ${delay.toFixed(2)}초`, tx, 92, 9, '#ffd166', 'center', F, 700);
        // 작은 그림: 거리 고리
        for (let k = 3; k >= 1; k--) {
          g.fillStyle = ['#ffd166', '#ff7aa8', '#7ec8ff'][k - 1]!;
          g.globalAlpha = 0.85;
          g.beginPath();
          g.arc(tx, 126, k * 7, 0, TAU);
          g.fill();
        }
        g.globalAlpha = 1;
        g.restore();
      },
    };
  },
};

/* ═════════ i102 스프링 · 예비 동작 · 찌그러짐 ═════════ */
function jumper(g: G, x: number, groundY: number, y: number, sx: number, sy: number, col: string, face: string): void {
  // 그림자
  const hgt = groundY - y;
  g.fillStyle = `rgba(0,0,0,${0.25 * (1 - Math.min(1, hgt / 80))})`;
  g.beginPath();
  g.ellipse(x, groundY + 2, 18 * (1 - Math.min(0.6, hgt / 120)), 4, 0, 0, TAU);
  g.fill();
  g.save();
  g.translate(x, y);
  g.scale(sx, sy);
  rr(g, -16, -32, 32, 32, 8);
  g.fillStyle = col;
  g.fill();
  g.fillStyle = 'rgba(255,255,255,.3)';
  rr(g, -12, -29, 24, 6, 3);
  g.fill();
  g.fillStyle = '#2b2440';
  g.beginPath();
  g.arc(-6, -17, 2.4, 0, TAU);
  g.moveTo(8.4, -17);
  g.arc(6, -17, 2.4, 0, TAU);
  g.fill();
  txt(g, face, 0, -9, 7, '#2b2440', 'center', F, 900);
  g.restore();
}
const i102 = {
  kind: '2d' as const,
  caption: '왼쪽은 그냥 오르내림 · 오른쪽은 움츠렸다(예비 동작) 늘어나며 뛰고, 착지 때 찌그러졌다 통통(감쇠 스프링)',
  make() {
    const o = { s: 1 };
    let tt = 0;
    let stiff = 18;
    return {
      controls: [speedCtl(o), { type: 'range' as const, label: '스프링 떨림', min: 8, max: 34, step: 1, value: 18, on: (v: number) => (stiff = v) }],
      draw(g: G, w: number, h: number, _t: number, dt: number) {
        tt += Math.max(0, dt) * o.s;
        const T = 2.4;
        const p = tt % T;
        bg(g, w, h, '#9fdcff', '#e6f7ff');
        view(g, w, h);
        const GY = 140;
        g.fillStyle = '#7fcf6a';
        g.fillRect(-200, GY, VW + 400, 80);
        g.fillStyle = '#5fb04e';
        g.fillRect(-200, GY, VW + 400, 3);
        g.fillStyle = 'rgba(255,255,255,.7)';
        g.fillRect(VW / 2 - 0.75, 0, 1.5, GY);
        pill(g, '그냥', VW * 0.25, 14, 9, 'rgba(30,50,90,.65)');
        pill(g, '스프링', VW * 0.75, 14, 9, '#ff5c8a');
        // 공통 비행: 0.35 ~ 1.15 공중
        const up0 = 0.35;
        const up1 = 1.15;
        const air = seg(p, up0, up1);
        const yAir = air > 0 && air < 1 ? 4 * air * (1 - air) : 0;
        // 왼쪽: 그냥
        jumper(g, VW * 0.25, GY, GY - yAir * 80, 1, 1, '#b8c2d8', '·_·');
        // 오른쪽: 예비 동작 · 늘어남 · 착지 스프링
        let sx = 1;
        let sy = 1;
        if (p < up0) {
          const k = seg(p, 0.05, up0);
          const sq = Math.sin(k * Math.PI * 0.5) * 0.32;
          sy = 1 - sq;
          sx = 1 + sq * 0.8;
        } else if (p < up1) {
          const v = Math.abs(1 - 2 * air);
          sy = 1 + 0.28 * v * v;
          sx = 1 - 0.18 * v * v;
        } else {
          const tau = p - up1;
          const q = Math.exp(-tau * 6) * Math.cos(tau * stiff);
          sy = 1 - 0.35 * q;
          sx = 1 + 0.3 * q;
        }
        jumper(g, VW * 0.75, GY, GY - yAir * 80, sx, sy, '#ffcf5c', p > up1 && p < up1 + 0.3 ? '>_<' : '^o^');
        // 크기 그래프 (오른쪽 아래)
        const gx = VW * 0.5 + 14;
        const gy = 158;
        const gw = VW * 0.5 - 28;
        g.strokeStyle = 'rgba(255,255,255,.5)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(gx, gy);
        g.lineTo(gx + gw, gy);
        g.stroke();
        g.strokeStyle = '#ff5c8a';
        g.lineWidth = 1.5;
        g.beginPath();
        for (let i = 0; i <= 60; i++) {
          const pp = (i / 60) * T;
          let yy = 1;
          if (pp < up0) yy = 1 - Math.sin(seg(pp, 0.05, up0) * Math.PI * 0.5) * 0.32;
          else if (pp < up1) {
            const a = seg(pp, up0, up1);
            const v = Math.abs(1 - 2 * a);
            yy = 1 + 0.28 * v * v;
          } else yy = 1 - 0.35 * Math.exp(-(pp - up1) * 6) * Math.cos((pp - up1) * stiff);
          const X = gx + (i / 60) * gw;
          const Y = gy - (yy - 1) * 18;
          if (i) g.lineTo(X, Y);
          else g.moveTo(X, Y);
        }
        g.stroke();
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(gx + (p / T) * gw, gy - (sy - 1) * 18, 2.5, 0, TAU);
        g.fill();
        txt(g, '세로 크기', gx, gy - 12, 7, '#1d5d8f', 'left', F, 700);
        g.restore();
      },
    };
  },
};

/* ═════════ i103 경로 따라 (접선 방향) ═════════ */
const i103 = {
  kind: '2d' as const,
  caption: '종이비행기가 8자 길을 따라가며 진행 방향(접선)으로 몸을 돌려요 — 「끔」일 때는 옆으로 미끄러져 어색해요',
  make() {
    const o = { s: 1 };
    let tt = 0;
    let face = 0;
    let mode = 0; // 0 자동 번갈아 1 늘 켬
    return {
      controls: [speedCtl(o), { type: 'toggle' as const, label: '방향 맞춤 늘 켜기', value: false, on: (v: boolean) => (mode = v ? 1 : 0) }],
      draw(g: G, w: number, h: number, _t: number, dt: number) {
        tt += Math.max(0, dt) * o.s;
        bg(g, w, h, '#1f2a5e', '#0d1333');
        view(g, w, h);
        // 모눈
        g.strokeStyle = 'rgba(255,255,255,.07)';
        g.lineWidth = 1;
        for (let x = 0; x <= VW; x += 14) {
          g.beginPath();
          g.moveTo(x, 0);
          g.lineTo(x, VH);
          g.stroke();
        }
        for (let y = 0; y <= VH; y += 14) {
          g.beginPath();
          g.moveTo(0, y);
          g.lineTo(VW, y);
          g.stroke();
        }
        const cx = VW / 2;
        const cy = VH / 2 + 6;
        const A = 105;
        const B = 105;
        const P = (th: number): [number, number] => [cx + A * Math.sin(th), cy + B * Math.sin(th) * Math.cos(th)];
        const Dv = (th: number): [number, number] => [A * Math.cos(th), B * Math.cos(2 * th)];
        g.strokeStyle = 'rgba(126,200,255,.35)';
        g.lineWidth = 2;
        g.setLineDash([4, 5]);
        g.beginPath();
        for (let i = 0; i <= 120; i++) {
          const [x, y] = P((i / 120) * TAU);
          if (i) g.lineTo(x, y);
          else g.moveTo(x, y);
        }
        g.stroke();
        g.setLineDash([]);
        const th = tt * 0.9;
        // 꼬리
        for (let i = 1; i < 18; i++) {
          const [x, y] = P(th - i * 0.04);
          g.fillStyle = `rgba(255,209,102,${0.5 * (1 - i / 18)})`;
          g.beginPath();
          g.arc(x, y, 2.4 * (1 - i / 22), 0, TAU);
          g.fill();
        }
        const on = mode === 1 || Math.floor(tt / 4) % 2 === 0;
        const [x, y] = P(th);
        const [dx, dy] = Dv(th);
        const ang = Math.atan2(dy, dx);
        const target = on ? ang : 0;
        // 짧은 쪽으로 따라 돌기
        const diff = mod(target - face + Math.PI, TAU) - Math.PI;
        face += diff * Math.min(1, dt * 14);
        // 접선
        if (on) {
          g.strokeStyle = 'rgba(255,209,102,.8)';
          g.lineWidth = 1.2;
          g.setLineDash([3, 3]);
          g.beginPath();
          g.moveTo(x - Math.cos(ang) * 34, y - Math.sin(ang) * 34);
          g.lineTo(x + Math.cos(ang) * 34, y + Math.sin(ang) * 34);
          g.stroke();
          g.setLineDash([]);
        }
        g.save();
        g.translate(x, y);
        g.rotate(face);
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.moveTo(14, 0);
        g.lineTo(-10, -9);
        g.lineTo(-5, 0);
        g.lineTo(-10, 9);
        g.closePath();
        g.fill();
        g.fillStyle = '#c9d6ff';
        g.beginPath();
        g.moveTo(14, 0);
        g.lineTo(-5, 0);
        g.lineTo(-10, 9);
        g.closePath();
        g.fill();
        g.restore();
        const deg = Math.round(mod((-ang * 180) / Math.PI, 360));
        pill(g, on ? `방향 맞춤 켬 · ${deg}°` : '방향 맞춤 끔', VW / 2, 14, 9, on ? '#ff5c8a' : 'rgba(255,255,255,.2)');
        g.restore();
      },
    };
  },
};

/* ═════════ i104 시차 층 + 무한 확대 수직선 ═════════ */
const i104 = {
  kind: '2d' as const,
  caption: '위: 먼 산 · 언덕 · 나무가 서로 다른 빠르기(시차) · 아래: 수직선을 끝없이 확대 0.1 → 0.01 → 0.001',
  make() {
    const o = { s: 1 };
    let tt = 0;
    return {
      controls: [speedCtl(o)],
      draw(g: G, w: number, h: number, _t: number, dt: number) {
        tt += Math.max(0, dt) * o.s;
        const topH = h * 0.56;
        // 위: 시차 (화면 전체 폭)
        const u = Math.min(w / VW, h / VH);
        const sky = g.createLinearGradient(0, 0, 0, topH);
        sky.addColorStop(0, '#7fd0ff');
        sky.addColorStop(1, '#ffe7c4');
        g.fillStyle = sky;
        g.fillRect(0, 0, w, topH);
        g.fillStyle = '#fff1a8';
        g.beginPath();
        g.arc(w * 0.78, topH * 0.3, 12 * u, 0, TAU);
        g.fill();
        for (let i = 0; i < 3; i++) cloud(g, mod(i * 130 * u - tt * 4 * u, w + 80 * u) - 40 * u, topH * (0.18 + i * 0.1), 0.6 * u, 0.85);
        const layer = (speed: number, base: number, amp: number, per: number, col: string, f: (x: number) => number): void => {
          const off = tt * speed * u;
          g.fillStyle = col;
          g.beginPath();
          g.moveTo(0, topH);
          for (let x = 0; x <= w + 4; x += 4) g.lineTo(x, topH * base - f((x + off) / (per * u)) * amp * u);
          g.lineTo(w, topH);
          g.fill();
        };
        layer(6, 0.72, 26, 60, '#9fb6e8', (x) => Math.abs(Math.sin(x)) * 0.8 + Math.sin(x * 2.3) * 0.15);
        layer(16, 0.86, 12, 40, '#76c46e', (x) => Math.sin(x) * 0.6 + 0.5);
        // 가까운 나무 (가장 빠름)
        const off = tt * 40 * u;
        const sp = 46 * u;
        g.fillStyle = '#4c9e45';
        g.fillRect(0, topH * 0.92, w, topH * 0.08 + 1);
        for (let k = Math.floor(off / sp) - 1; k * sp - off < w + sp; k++) {
          const x = k * sp - off + hsh(k) * 12 * u;
          const s = (0.8 + hsh(k + 3) * 0.4) * u;
          g.fillStyle = '#7a4f2a';
          g.fillRect(x - 2 * s, topH * 0.92 - 10 * s, 4 * s, 10 * s);
          g.fillStyle = '#2f8a3c';
          g.beginPath();
          g.arc(x, topH * 0.92 - 16 * s, 9 * s, 0, TAU);
          g.fill();
        }
        g.save();
        g.font = `700 ${7.5 * u}px ${F}`;
        g.textAlign = 'left';
        g.textBaseline = 'top';
        g.fillStyle = 'rgba(20,40,80,.65)';
        g.fillText('먼 산 ×0.15 · 언덕 ×0.4 · 나무 ×1', 6 * u, 5 * u);
        g.restore();
        // 아래: 수직선 무한 확대
        const by = topH;
        const bh = h - topH;
        const gr = g.createLinearGradient(0, by, 0, h);
        gr.addColorStop(0, '#20275e');
        gr.addColorStop(1, '#0c1030');
        g.fillStyle = gr;
        g.fillRect(0, by, w, bh);
        const TT = 3.2;
        const z = (tt / TT) % 3; // 0..3 십진 단계
        const x0 = 14 * u;
        const lineY = by + bh * 0.5;
        const L = w - 28 * u;
        const base = L; // z=0 일 때 1 이 L 픽셀
        g.strokeStyle = '#fff';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x0, lineY);
        g.lineTo(w - 6 * u, lineY);
        g.stroke();
        const zl = Math.floor(z);
        for (let n = zl; n <= zl + 3; n++) {
          const stepU = Math.pow(10, -n);
          const px = base * Math.pow(10, z) * stepU;
          if (px < 3) continue;
          const vis = clamp01((px - 3) / 12);
          const big = clamp01(Math.log10(px / 4) / 2);
          const th = (4 + 10 * big) * u * 0.6;
          const cnt = Math.min(400, Math.floor(L / px) + 1);
          g.strokeStyle = `rgba(255,255,255,${vis})`;
          g.lineWidth = 1 + big;
          for (let i = 0; i <= cnt; i++) {
            if (i % 10 === 0 && n > zl) continue;
            const x = x0 + i * px;
            if (x > w) break;
            g.beginPath();
            g.moveTo(x, lineY - th);
            g.lineTo(x, lineY + th);
            g.stroke();
          }
          // 이름표: 칸이 넉넉한 단계만
          if (px > 22 * u && px < L * 1.05) {
            g.font = `800 ${Math.min(10, 5.5 + px / (16 * u)) * u}px ${F}`;
            g.textAlign = 'center';
            g.textBaseline = 'top';
            for (let i = 1; i <= Math.min(10, cnt); i++) {
              const x = x0 + i * px;
              if (x > w - 8 * u) break;
              const a = clamp01((px - 22 * u) / (20 * u));
              g.fillStyle = `rgba(255,${i === 1 ? 209 : 255},${i === 1 ? 102 : 255},${a})`;
              g.fillText((i * stepU).toFixed(n), x, lineY + th + 3 * u);
            }
          }
        }
        g.font = `900 ${10 * u}px ${F}`;
        g.textAlign = 'center';
        g.textBaseline = 'top';
        g.fillStyle = '#ffd166';
        g.fillText('0', x0, lineY + 10 * u);
        const cur = Math.pow(10, -(zl + 1)).toFixed(zl + 1);
        g.save();
        g.font = `800 ${9 * u}px ${F}`;
        g.textAlign = 'right';
        g.textBaseline = 'top';
        g.fillStyle = '#9fe6ff';
        g.fillText(`🔍 ×10 확대 중 → ${cur}`, w - 8 * u, by + 5 * u);
        g.restore();
      },
    };
  },
};

/* ═════════ i105 켄 번스 ═════════ */
const i105 = {
  kind: '2d' as const,
  caption: '멈춘 그림 한 장을 천천히 당기고 옮겨 살아 있는 느낌 — 오른쪽 아래 작은 그림의 네모가 지금 보이는 곳',
  make() {
    const o = { s: 1 };
    let tt = 0;
    const IW = 1680;
    const IH = 1050;
    let img: HTMLCanvasElement | null = null;
    const build = (): HTMLCanvasElement => {
      const c = document.createElement('canvas');
      c.width = IW;
      c.height = IH;
      const g = c.getContext('2d')!;
      g.scale(6, 6); // 280×175 로 그리기
      const sky = g.createLinearGradient(0, 0, 0, 175);
      sky.addColorStop(0, '#ff9f7a');
      sky.addColorStop(0.5, '#ffd39a');
      sky.addColorStop(1, '#fff1d6');
      g.fillStyle = sky;
      g.fillRect(0, 0, 280, 175);
      const sun = g.createRadialGradient(222, 46, 2, 222, 46, 34);
      sun.addColorStop(0, '#fffbe0');
      sun.addColorStop(0.35, '#ffe07a');
      sun.addColorStop(1, 'rgba(255,190,90,0)');
      g.fillStyle = sun;
      g.beginPath();
      g.arc(222, 46, 34, 0, TAU);
      g.fill();
      cloud(g, 30, 30, 0.9);
      cloud(g, 120, 22, 0.7);
      g.fillStyle = '#e7a3c8';
      g.beginPath();
      g.moveTo(0, 110);
      g.quadraticCurveTo(70, 70, 150, 105);
      g.quadraticCurveTo(220, 80, 280, 100);
      g.lineTo(280, 175);
      g.lineTo(0, 175);
      g.fill();
      g.fillStyle = '#86cf72';
      g.beginPath();
      g.moveTo(0, 130);
      g.quadraticCurveTo(140, 105, 280, 128);
      g.lineTo(280, 175);
      g.lineTo(0, 175);
      g.fill();
      // 집
      g.fillStyle = '#fff4dc';
      g.fillRect(52, 98, 46, 34);
      g.fillStyle = '#d9534f';
      g.beginPath();
      g.moveTo(46, 100);
      g.lineTo(75, 78);
      g.lineTo(104, 100);
      g.fill();
      g.fillStyle = '#8a5a2e';
      g.fillRect(70, 112, 10, 20);
      g.fillStyle = '#7ec8ff';
      g.fillRect(56, 104, 10, 9);
      g.fillRect(85, 104, 10, 9);
      g.strokeStyle = '#fff';
      g.lineWidth = 0.8;
      g.strokeRect(56, 104, 10, 9);
      g.strokeRect(85, 104, 10, 9);
      // 나무
      g.fillStyle = '#7a4f2a';
      g.fillRect(124, 104, 4, 22);
      g.fillStyle = '#3f9d4a';
      g.beginPath();
      g.arc(126, 98, 13, 0, TAU);
      g.moveTo(127, 104);
      g.arc(118, 104, 9, 0, TAU);
      g.moveTo(143, 104);
      g.arc(134, 104, 9, 0, TAU);
      g.fill();
      // 아이 + 풍선
      const kx = 180;
      const ky = 128;
      g.strokeStyle = '#555';
      g.lineWidth = 0.6;
      g.beginPath();
      g.moveTo(kx + 7, ky - 6);
      g.quadraticCurveTo(kx + 14, ky - 26, kx + 12, ky - 40);
      g.stroke();
      g.fillStyle = '#ff5c8a';
      g.beginPath();
      g.ellipse(kx + 12, ky - 48, 9, 11, 0, 0, TAU);
      g.fill();
      g.fillStyle = '#fff';
      g.font = `900 11px ${F}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('7', kx + 12, ky - 47);
      g.fillStyle = '#4f7be0';
      rr(g, kx - 7, ky - 8, 14, 14, 4);
      g.fill();
      g.fillStyle = '#ffd9b8';
      g.beginPath();
      g.arc(kx, ky - 14, 7, 0, TAU);
      g.fill();
      g.fillStyle = '#3b2a20';
      g.beginPath();
      g.arc(kx, ky - 16, 7.2, Math.PI, TAU);
      g.fill();
      g.fillStyle = '#2b2440';
      g.fillRect(kx - 3, ky - 14, 1.5, 1.5);
      g.fillRect(kx + 2, ky - 14, 1.5, 1.5);
      g.fillStyle = '#4a3a2e';
      g.fillRect(kx - 5, ky + 6, 3, 6);
      g.fillRect(kx + 2, ky + 6, 3, 6);
      // 꽃
      for (let i = 0; i < 14; i++) {
        g.fillStyle = ['#fff', '#ffd166', '#ff7aa8'][i % 3]!;
        g.beginPath();
        g.arc(hsh(i) * 280, 140 + hsh(i + 4) * 32, 1.6, 0, TAU);
        g.fill();
      }
      return c;
    };
    const KEYS = [
      { x: 0.5, y: 0.5, z: 1.0 },
      { x: 0.27, y: 0.6, z: 2.0 },
      { x: 0.66, y: 0.6, z: 2.4 },
      { x: 0.78, y: 0.28, z: 1.8 },
    ];
    return {
      controls: [speedCtl(o)],
      dispose() {
        img = null;
      },
      draw(g: G, w: number, h: number, _t: number, dt: number) {
        tt += Math.max(0, dt) * o.s;
        if (!img) img = build();
        const SEG = 3.2;
        const T = SEG * KEYS.length;
        const p = tt % T;
        const i = Math.min(KEYS.length - 1, Math.floor(p / SEG));
        const k = inOut((p - i * SEG) / SEG);
        const a = KEYS[i]!;
        const b = KEYS[(i + 1) % KEYS.length]!;
        const z = lerp(a.z, b.z, k);
        const cover = Math.max(w / IW, h / IH);
        const s = cover * z;
        const vw = w / s;
        const vh = h / s;
        let cx = lerp(a.x, b.x, k) * IW;
        let cy = lerp(a.y, b.y, k) * IH;
        cx = Math.min(IW - vw / 2, Math.max(vw / 2, cx));
        cy = Math.min(IH - vh / 2, Math.max(vh / 2, cy));
        g.fillStyle = '#000';
        g.fillRect(0, 0, w, h);
        g.drawImage(img, cx - vw / 2, cy - vh / 2, vw, vh, 0, 0, w, h);
        // 비네트
        const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(40,10,30,.35)');
        g.fillStyle = vg;
        g.fillRect(0, 0, w, h);
        // 작은 지도
        const u = Math.min(w / VW, h / VH);
        const mw = 64 * u;
        const mh = (mw * IH) / IW;
        const mx = w - mw - 8 * u;
        const my = h - mh - 8 * u;
        g.fillStyle = 'rgba(255,255,255,.9)';
        g.fillRect(mx - 2 * u, my - 2 * u, mw + 4 * u, mh + 4 * u);
        g.drawImage(img, mx, my, mw, mh);
        g.strokeStyle = '#ff3b6b';
        g.lineWidth = 2 * u;
        g.strokeRect(mx + ((cx - vw / 2) / IW) * mw, my + ((cy - vh / 2) / IH) * mh, (vw / IW) * mw, (vh / IH) * mh);
        g.save();
        g.font = `800 ${8 * u}px ${F}`;
        g.textAlign = 'left';
        g.textBaseline = 'top';
        g.fillStyle = 'rgba(40,20,40,.75)';
        g.fillText(`확대 ×${z.toFixed(1)}`, 8 * u, 8 * u);
        g.restore();
      },
    };
  },
};

/* ═════════ i106 휩 팬 · 줌 통과 · 매치 컷 ═════════ */
function scDay(g: G, w: number, h: number, u: number, i: number, t: number): void {
  const pal = [
    ['#7fd0ff', '#d9f3ff'],
    ['#9be87d', '#e6ffd9'],
    ['#2b2a6e', '#5a3f9e'],
  ][i]!;
  bg(g, w, h, pal[0], pal[1]);
  const cx = w / 2;
  const cy = h / 2;
  if (i === 0) {
    // 해 (매치 컷 짝)
    const sg = g.createRadialGradient(cx, cy, 2, cx, cy, 34 * u);
    sg.addColorStop(0, '#fff7c0');
    sg.addColorStop(0.65, '#ffcf3a');
    sg.addColorStop(1, '#ffb020');
    g.fillStyle = sg;
    g.beginPath();
    g.arc(cx, cy, 30 * u, 0, TAU);
    g.fill();
    g.strokeStyle = '#ffcf3a';
    g.lineWidth = 3 * u;
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU + t * 0.5;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * 38 * u, cy + Math.sin(a) * 38 * u);
      g.lineTo(cx + Math.cos(a) * 48 * u, cy + Math.sin(a) * 48 * u);
      g.stroke();
    }
    cloud(g, w * 0.08, h * 0.75, 1.2 * u);
  } else if (i === 1) {
    // 숫자 0 — 가운데 구멍으로 줌 통과
    g.fillStyle = '#3eae5a';
    g.fillRect(0, h * 0.8, w, h * 0.2);
    for (let k = 0; k < 6; k++) {
      const x = w * (0.1 + k * 0.16);
      g.fillStyle = '#ff7aa8';
      g.beginPath();
      g.arc(x, h * 0.82, 3 * u, 0, TAU);
      g.fill();
    }
  } else {
    // 밤 + 달 (해와 같은 자리 · 같은 크기)
    for (let k = 0; k < 30; k++) {
      g.fillStyle = `rgba(255,255,255,${0.4 + 0.4 * Math.sin(t * 3 + k)})`;
      g.fillRect(hsh(k) * w, hsh(k + 9) * h, 1.5 * u, 1.5 * u);
    }
    const mg = g.createRadialGradient(cx - 8 * u, cy - 8 * u, 2, cx, cy, 30 * u);
    mg.addColorStop(0, '#ffffff');
    mg.addColorStop(1, '#d7dcff');
    g.fillStyle = mg;
    g.beginPath();
    g.arc(cx, cy, 30 * u, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(150,160,220,.45)';
    g.beginPath();
    g.arc(cx + 9 * u, cy - 6 * u, 6 * u, 0, TAU);
    g.moveTo(cx - 6 * u, cy + 9 * u);
    g.arc(cx - 10 * u, cy + 9 * u, 4 * u, 0, TAU);
    g.fill();
  }
  g.save();
  g.font = `400 ${18 * u}px ${TF}`;
  g.textAlign = 'left';
  g.textBaseline = 'top';
  g.fillStyle = i === 2 ? '#fff' : '#2b3a6e';
  g.fillText(`${i + 1}일차`, 10 * u, 8 * u);
  g.restore();
}
/** 2일차 위에 숫자 0 고리 — 구멍(hole) 안쪽은 비워 둔다 */
function ring0(g: G, cx: number, cy: number, s: number): Path2D {
  const outer = new Path2D();
  outer.ellipse(cx, cy, 34 * s, 46 * s, 0, 0, TAU);
  const hole = new Path2D();
  hole.ellipse(cx, cy, 17 * s, 29 * s, 0, 0, TAU);
  const p = new Path2D();
  p.addPath(outer);
  p.addPath(hole);
  g.fillStyle = '#ff8a2a';
  g.fill(p, 'evenodd');
  return hole;
}
const i106 = {
  kind: '2d' as const,
  caption: '1일차 → 휙(휩 팬, 한 방향 흐림) → 2일차 → 숫자 0 구멍으로 쑥(줌 통과) → 3일차 달 → 같은 자리 해로 딱(매치 컷)',
  make() {
    const o = { s: 1 };
    let tt = 0;
    return {
      controls: [speedCtl(o)],
      draw(g: G, w: number, h: number, _t: number, dt: number) {
        tt += Math.max(0, dt) * o.s;
        const T = 7.6;
        const p = tt % T;
        const u = Math.min(w / VW, h / VH);
        let label = '';
        const whip = seg(p, 1.4, 1.95);
        const zoom = seg(p, 3.4, 4.3);
        const flash = p >= 6.2 ? Math.exp(-(p - 6.2) * 7) : 0;
        if (p < 1.4) scDay(g, w, h, u, 0, tt);
        else if (p < 1.95) {
          label = '휩 팬';
          const k = inOut(whip);
          const vel = Math.sin(whip * Math.PI); // 가운데서 가장 빠름
          const nCopies = 1 + Math.round(vel * 8);
          for (let c = 0; c < nCopies; c++) {
            const off = (k + (c / Math.max(1, nCopies)) * 0.12 * vel) * w;
            g.save();
            g.globalAlpha = c === 0 ? 1 : 0.5 / nCopies + 0.05;
            g.translate(-off, 0);
            g.beginPath();
            g.rect(0, 0, w, h);
            g.clip();
            scDay(g, w, h, u, 0, tt);
            g.restore();
            g.save();
            g.globalAlpha = c === 0 ? 1 : 0.5 / nCopies + 0.05;
            g.translate(w - off, 0);
            g.beginPath();
            g.rect(0, 0, w, h);
            g.clip();
            scDay(g, w, h, u, 1, tt);
            ring0(g, w / 2, h / 2, u);
            g.restore();
          }
          // 가로 속도선
          g.strokeStyle = `rgba(255,255,255,${0.5 * vel})`;
          g.lineWidth = 1.5 * u;
          for (let q = 0; q < 10; q++) {
            const yy = hsh(q) * h;
            g.beginPath();
            g.moveTo(hsh(q + 3) * w, yy);
            g.lineTo(hsh(q + 3) * w + 60 * u, yy);
            g.stroke();
          }
        } else if (p < 3.4) {
          scDay(g, w, h, u, 1, tt);
          const bob = 1 + 0.03 * Math.sin(tt * 4);
          ring0(g, w / 2, h / 2, u * bob);
        } else if (p < 4.3) {
          label = '줌 통과';
          const k = Math.pow(zoom, 2.2);
          const s = Math.pow(16, k);
          scDay(g, w, h, u, 2, tt);
          g.save();
          g.translate(w / 2, h / 2);
          g.scale(s, s);
          g.translate(-w / 2, -h / 2);
          const hole = new Path2D();
          hole.rect(-w, -h, w * 3, h * 3);
          hole.ellipse(w / 2, h / 2, 17 * u, 29 * u, 0, 0, TAU);
          g.save();
          g.clip(hole, 'evenodd');
          scDay(g, w, h, u, 1, tt);
          ring0(g, w / 2, h / 2, u);
          g.restore();
          g.restore();
        } else if (p < 6.2) {
          scDay(g, w, h, u, 2, tt);
          if (p > 5.6) label = '매치 컷';
        } else {
          label = '매치 컷';
          scDay(g, w, h, u, 0, tt);
          g.fillStyle = `rgba(255,255,255,${flash * 0.8})`;
          g.beginPath();
          g.arc(w / 2, h / 2, 30 * u * (1 + (1 - flash) * 0.5), 0, TAU);
          g.fill();
        }
        if (label) {
          view(g, w, h);
          pill(g, label, VW - 40, 18, 10, 'rgba(255,60,110,.9)');
          g.restore();
        }
      },
    };
  },
};

/* ═════════ i107 살 · 범람 · 시계 와이프 ═════════ */
const i107 = {
  kind: '2d' as const,
  caption: '블라인드 살이 차례로 덮고, 물이 차오르며 바뀌고, 시계바늘이 한 바퀴 쓸며 바뀌어요',
  make() {
    const o = { s: 1 };
    let tt = 0;
    const scenes: Scene[] = [
      sceneQ,
      sceneA,
      (g, w, h, t) => {
        bg(g, w, h, '#7b5cff', '#3a2a9e');
        view(g, w, h);
        // 시계
        const cx = VW / 2;
        const cy = VH / 2;
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(cx, cy, 44, 0, TAU);
        g.fill();
        g.fillStyle = '#ffd166';
        g.beginPath();
        g.moveTo(cx, cy);
        g.arc(cx, cy, 40, -Math.PI / 2, 0);
        g.fill();
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TAU;
          g.fillStyle = '#3a2a9e';
          g.fillRect(cx + Math.cos(a) * 38 - 1, cy + Math.sin(a) * 38 - 1, 2, 2);
        }
        g.strokeStyle = '#3a2a9e';
        g.lineWidth = 3;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + 30, cy);
        g.moveTo(cx, cy);
        g.lineTo(cx, cy - 22);
        g.stroke();
        txt(g, '15분 = ¼ 바퀴', cx, cy + 58, 11, '#fff');
        void t;
        g.restore();
      },
    ];
    return {
      controls: [speedCtl(o)],
      draw(g: G, w: number, h: number, _t: number, dt: number) {
        tt += Math.max(0, dt) * o.s;
        const SEG = 2.6;
        const TR = 1.1;
        const T = SEG * 3;
        const p = tt % T;
        const i = Math.min(2, Math.floor(p / SEG));
        const lp = p - i * SEG;
        const k = seg(lp, SEG - TR, SEG);
        const A = scenes[i]!;
        const B = scenes[(i + 1) % 3]!;
        A(g, w, h, tt);
        const names = ['살 와이프', '범람 와이프', '시계 와이프'];
        if (k > 0) {
          g.save();
          const path = new Path2D();
          if (i === 0) {
            const N = 7;
            const sh = h / N;
            for (let s = 0; s < N; s++) {
              const f = inOut(seg(k, s * 0.07, s * 0.07 + 0.55));
              path.rect(0, s * sh + (sh * (1 - f)) / 2, w, sh * f + 0.6);
            }
          } else if (i === 1) {
            const lvl = h * (1.08 - inOut(k) * 1.2);
            path.moveTo(0, h);
            for (let x = 0; x <= w + 4; x += 4) path.lineTo(x, lvl + Math.sin(x * 0.04 + tt * 6) * 6 * Math.min(w / VW, h / VH));
            path.lineTo(w, h);
            path.closePath();
          } else {
            const a = inOut(k) * TAU;
            const R = Math.hypot(w, h);
            path.moveTo(w / 2, h / 2);
            path.arc(w / 2, h / 2, R, -Math.PI / 2, -Math.PI / 2 + Math.max(0.0001, a));
            path.closePath();
          }
          g.clip(path);
          B(g, w, h, tt);
          g.restore();
          const u = Math.min(w / VW, h / VH);
          if (i === 1) {
            const lvl = h * (1.08 - inOut(k) * 1.2);
            g.strokeStyle = 'rgba(255,255,255,.85)';
            g.lineWidth = 3 * u;
            g.beginPath();
            for (let x = 0; x <= w + 4; x += 4) {
              const y = lvl + Math.sin(x * 0.04 + tt * 6) * 6 * u;
              if (x) g.lineTo(x, y);
              else g.moveTo(x, y);
            }
            g.stroke();
            for (let q = 0; q < 8; q++) {
              g.fillStyle = 'rgba(255,255,255,.6)';
              g.beginPath();
              g.arc(hsh(q) * w, lvl + (10 + mod(hsh(q + 2) * 60 - tt * 30, 60)) * u, 2 * u, 0, TAU);
              g.fill();
            }
          } else if (i === 2) {
            const a = -Math.PI / 2 + inOut(k) * TAU;
            g.strokeStyle = '#fff';
            g.lineWidth = 3 * u;
            g.lineCap = 'round';
            g.beginPath();
            g.moveTo(w / 2, h / 2);
            g.lineTo(w / 2 + Math.cos(a) * Math.hypot(w, h), h / 2 + Math.sin(a) * Math.hypot(w, h));
            g.stroke();
            g.fillStyle = '#fff';
            g.beginPath();
            g.arc(w / 2, h / 2, 4 * u, 0, TAU);
            g.fill();
          }
          view(g, w, h);
          pill(g, names[i]!, VW / 2, 16, 10, 'rgba(20,20,50,.78)');
          if (i === 2) txt(g, `${Math.round(inOut(k) * 60)}분`, VW / 2, 32, 10, '#fff');
          g.restore();
        }
      },
    };
  },
};

/* ═════════ i108 끈적 블롭 (메타볼 필터) ═════════ */
const i108 = {
  kind: 'dom' as const,
  caption: '물방울 3개 + 2개가 다가가 끈적하게 붙어 5 가 돼요 — SVG 흐림 뒤 알파를 세게 올리는 필터',
  make(box: HTMLElement) {
    const id = `ma108-${++uid}`;
    const o = { s: 1 };
    let filterOn = true;
    const drops = [
      { x: 52, y: 72, c: '#4fb6ff', ox: 74, oy: 86 },
      { x: 98, y: 70, c: '#4fb6ff', ox: 74, oy: 86 },
      { x: 74, y: 114, c: '#4fb6ff', ox: 74, oy: 86 },
      { x: 186, y: 76, c: '#ff6fa8', ox: 206, oy: 88 },
      { x: 228, y: 100, c: '#ff6fa8', ox: 206, oy: 88 },
    ];
    const circles = drops.map((d, i) => `<circle class="ma-108d" data-i="${i}" cx="${d.x}" cy="${d.y}" r="16" fill="${d.c}"/>`).join('');
    const { root } = svgRoot(
      box,
      `.ma-108n{font:400 22px ${TF};fill:#fff;text-anchor:middle;dominant-baseline:middle}.ma-108s{font:800 11px ${F};fill:rgba(255,255,255,.7);text-anchor:middle}`,
      `<defs>
        <linearGradient id="${id}-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f2a66"/><stop offset="1" stop-color="#0b1030"/></linearGradient>
        <filter id="${id}-goo" filterUnits="userSpaceOnUse" x="-50" y="-50" width="380" height="275" color-interpolation-filters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="b"/>
          <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 40 -17"/>
        </filter>
      </defs>
      <rect x="-200" y="-200" width="680" height="575" fill="url(#${id}-bg)"/>
      <g class="ma-108g" filter="url(#${id}-goo)">${circles}</g>
      <g class="ma-108h" opacity=".55"></g>
      <text class="ma-108n ma-108a" x="74" y="146">3</text>
      <text class="ma-108n ma-108p" x="140" y="88">+</text>
      <text class="ma-108n ma-108b" x="206" y="146">2</text>
      <text class="ma-108n ma-108r" x="140" y="88" style="font-size:30px">5</text>
      <text class="ma-108s ma-108l" x="140" y="168">필터 켬</text>`,
    );
    const cs = Array.from(root.querySelectorAll<SVGCircleElement>('.ma-108d'));
    const grp = root.querySelector('.ma-108g')!;
    const nA = root.querySelector<SVGTextElement>('.ma-108a')!;
    const nB = root.querySelector<SVGTextElement>('.ma-108b')!;
    const nP = root.querySelector<SVGTextElement>('.ma-108p')!;
    const nR = root.querySelector<SVGTextElement>('.ma-108r')!;
    const lab = root.querySelector<SVGTextElement>('.ma-108l')!;
    let tt = 0;
    return {
      controls: [
        speedCtl(o),
        {
          type: 'toggle' as const,
          label: '끈적 필터',
          value: true,
          on: (v: boolean) => {
            filterOn = v;
            if (v) grp.setAttribute('filter', `url(#${id}-goo)`);
            else grp.removeAttribute('filter');
            lab.textContent = v ? '필터 켬' : '필터 끔 — 그냥 동그라미';
          },
        },
      ],
      update(_t: number, dt: number) {
        tt += Math.max(0, dt) * o.s;
        const T = 6.4;
        const p = tt % T;
        const m = p < 3.2 ? inOut(seg(p, 1.0, 2.5)) : 1 - inOut(seg(p, 4.4, 5.9));
        drops.forEach((d, i) => {
          const a = (i / 5) * TAU + tt * 1.6;
          const tx = 140 + Math.cos(a) * 9;
          const ty = 88 + Math.sin(a) * 9;
          // 무리 가운데 쪽으로 숨쉬듯 다가갔다 멀어짐 — 가까울 때 끈적한 다리가 생김
          const br = (0.5 + 0.5 * Math.sin(tt * 2.4 + (i < 3 ? 0 : 1.6))) * 0.42 * (1 - m);
          const x = lerp(lerp(d.x, d.ox, br) + Math.sin(tt * 2.2 + i * 1.7) * 2, tx, m);
          const y = lerp(lerp(d.y, d.oy, br) + Math.cos(tt * 1.9 + i * 2.1) * 2, ty, m);
          const r = lerp(16, 19, m) + Math.sin(tt * 3 + i) * 0.8;
          const c = cs[i]!;
          c.setAttribute('cx', x.toFixed(2));
          c.setAttribute('cy', y.toFixed(2));
          c.setAttribute('r', r.toFixed(2));
          if (filterOn) c.removeAttribute('stroke');
          else {
            c.setAttribute('stroke', '#fff');
            c.setAttribute('stroke-width', '1');
          }
        });
        const sep = clamp01(1 - m * 2.5);
        nA.style.opacity = String(sep);
        nB.style.opacity = String(sep);
        nP.style.opacity = String(sep);
        const r = clamp01((m - 0.85) / 0.15);
        nR.style.opacity = String(r);
        nR.setAttribute('transform', `translate(140 88) scale(${(0.6 + 0.4 * outBack(r)).toFixed(3)}) translate(-140 -88)`);
      },
      dispose() {
        root.remove();
      },
    };
  },
};

export const DEMOS: DemoMap = {
  i90,
  i91,
  i92,
  i93,
  i94,
  i95,
  i96,
  i97,
  i98,
  i99,
  i100,
  i101,
  i102,
  i103,
  i104,
  i105,
  i106,
  i107,
  i108,
};

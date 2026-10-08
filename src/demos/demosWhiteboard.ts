import type { Control, DemoMap } from './types';
import { sketchBoard } from './whiteboardSketch';

/**
 * 화이트보드 설명 영상 — 손그림이 선을 따라 그려지고, 펜이 따라가고, 내레이션 자막이 맞춰 나오는 영상 (참고: @realYunfanYe 라이덴프로스트 영상 · Rome 「Physics Whiteboard」 워크플로).
 *  i79 화이트보드 그리기 애니메이션 (라이덴프로스트 효과 1분 설명 축약판)
 *  i80 SVG 선 그리기 (stroke-dashoffset) · 손떨림
 *  i81 내레이션 동기화 (낱말 타이밍 · 자막 · 읽어 주기)
 *  i82 영상으로 굽기 (헤드리스 브라우저 → 프레임 → mp4)
 */

const FONT_LINK = 'https://fonts.googleapis.com/css2?family=Gaegu:wght@400;700&display=swap';
function ensureFont(): void {
  if (document.querySelector(`link[href="${FONT_LINK}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = FONT_LINK;
  document.head.appendChild(l);
}

type P = [number, number];
/** 씨앗 고정 난수 */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}
/** 점들을 손떨림이 있는 부드러운 경로로 */
function path(pts: P[], wob: number, seed: number): string {
  const r = rng(seed);
  const q = pts.map(([x, y], i) => (i === 0 || i === pts.length - 1 ? [x + (r() - 0.5) * wob * 0.5, y + (r() - 0.5) * wob * 0.5] : [x + (r() - 0.5) * wob, y + (r() - 0.5) * wob]) as P);
  if (q.length < 3) return `M${q[0]![0]},${q[0]![1]} L${q[1]![0]},${q[1]![1]}`;
  let d = `M${q[0]![0].toFixed(1)},${q[0]![1].toFixed(1)}`;
  for (let i = 1; i < q.length - 1; i++) {
    const [x, y] = q[i]!;
    const [nx, ny] = q[i + 1]!;
    d += ` Q${x.toFixed(1)},${y.toFixed(1)} ${((x + nx) / 2).toFixed(1)},${((y + ny) / 2).toFixed(1)}`;
  }
  const l = q[q.length - 1]!;
  return `${d} L${l[0].toFixed(1)},${l[1].toFixed(1)}`;
}
const line = (a: P, b: P, n = 6): P[] => Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n] as P);
const ellipse = (cx: number, cy: number, rx: number, ry: number, a0 = 0, a1 = Math.PI * 2.08, n = 28): P[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as P;
  });
const zig = (x: number, y: number, w: number, h: number, n: number): P[] => Array.from({ length: n * 2 + 1 }, (_, i) => [x + (w * i) / (n * 2), y - (i % 2 ? h : 0)] as P);
/** 물방울 (위가 뾰족) — x = r·sin t·sin(t/2), y = −r·cos t */
const drop = (cx: number, cy: number, r: number): P[] =>
  Array.from({ length: 33 }, (_, i) => {
    const t = (i / 32) * Math.PI * 2;
    return [cx + r * Math.sin(t) * Math.pow(Math.sin(t / 2), 1.1), cy - r - r * Math.cos(t) * 1.15] as P;
  });

interface Stroke {
  pts: P[];
  color: string;
  w: number;
  t0: number;
  dur: number;
  seed: number;
  el?: SVGPathElement;
  len?: number;
}
interface Txt {
  x: number;
  y: number;
  text: string;
  size: number;
  color: string;
  t0: number;
  dur: number;
  el?: SVGTextElement;
  anchor?: string;
}
interface Scene {
  t0: number;
  t1: number;
  say: string;
  strokes: Stroke[];
  texts: Txt[];
}

const K = '#1d1d1f';
const RED = '#e2483a';
const BLUE = '#2f7be0';

/** 라이덴프로스트 세 장면 (시간은 장면 안 초) */
function leidenfrost(): Scene[] {
  let sd = 3;
  const S = (pts: P[], color: string, w: number, t0: number, dur: number): Stroke => ({ pts, color, w, t0, dur, seed: sd++ });
  const T = (x: number, y: number, text: string, size: number, color: string, t0: number, dur: number, anchor = 'start'): Txt => ({ x, y, text, size, color, t0, dur, anchor });
  const a: Scene = {
    t0: 0,
    t1: 9,
    say: '아주 뜨거운 팬에 물을 떨어뜨리면, 물방울이 바로 끓어 없어지지 않고 이리저리 굴러다녀요.',
    texts: [T(60, 70, '왜 물방울이 뜨거운 팬 위에서 춤출까?', 34, K, 0.2, 2.2)],
    strokes: [
      S(ellipse(400, 330, 210, 40, 0, Math.PI * 2.02), K, 3.2, 2.4, 1.4),
      S(line([610, 330], [760, 300], 4), K, 6, 3.8, 0.5),
      S(zig(260, 400, 90, 26, 4), RED, 3, 4.4, 0.6),
      S(zig(360, 405, 90, 30, 4), RED, 3, 5.0, 0.6),
      S(zig(460, 400, 90, 26, 4), RED, 3, 5.6, 0.6),
      S(drop(400, 318, 22), BLUE, 3, 6.3, 0.9),
    ],
  };
  const b: Scene = {
    t0: 9,
    t1: 19,
    say: '바닥이 닿는 순간 아래쪽 물이 곧바로 수증기가 되어, 얇은 수증기 쿠션 위에 물방울이 떠 있어요.',
    texts: [T(60, 70, '확대해 보면…', 30, K, 0.1, 1), T(560, 230, '수증기 쿠션', 28, BLUE, 6.4, 1), T(110, 450, '팬 ≈ 200°C', 28, RED, 7.6, 1)],
    strokes: [
      S(line([90, 380], [710, 380], 10), K, 4, 1.1, 1),
      S(ellipse(400, 300, 170, 70, Math.PI * 1.02, Math.PI * 1.98 + Math.PI, 30).filter((p) => p[1] <= 330), BLUE, 3.4, 2.1, 1.4),
      S(line([232, 330], [568, 330], 8), BLUE, 3, 3.5, 0.6),
      ...[280, 340, 400, 460, 520].map((x, i) => S([[x, 375], [x - 4, 357], [x, 342]], '#7a8a9a', 2.2, 4.2 + i * 0.25, 0.35)),
      S(line([548, 236], [500, 340], 4), BLUE, 2, 6.2, 0.3),
      S(line([170, 430], [230, 384], 4), RED, 2, 7.4, 0.3),
    ],
  };
  const c: Scene = {
    t0: 19,
    t1: 30,
    say: '그래서 온도가 더 높을 때 오히려 물방울이 더 오래 살아남아요. 이 온도를 라이덴프로스트 점이라고 해요.',
    texts: [T(85, 90, '물방울이 사라지는 시간', 24, K, 0.9, 1), T(690, 452, '팬 온도', 24, K, 1.6, 0.8, 'end'), T(235, 470, '100°C', 20, K, 2.2, 0.5, 'middle'), T(430, 470, '≈ 190°C', 20, RED, 5.2, 0.6, 'middle'), T(458, 140, '라이덴프로스트 점!', 30, RED, 6, 1.4)],
    strokes: [
      S(line([90, 100], [90, 420], 6), K, 3, 0, 0.6),
      S(line([90, 420], [700, 420], 8), K, 3, 0.5, 0.7),
      S(
        [
          [100, 380],
          [170, 372],
          [215, 360],
          [240, 400],
          [300, 404],
          [370, 398],
          [410, 380],
          [430, 160],
          [460, 190],
          [530, 250],
          [620, 290],
          [690, 305],
        ],
        BLUE,
        3.6,
        2.6,
        2.6,
      ),
      S(line([430, 420], [430, 170], 6), RED, 2, 5.1, 0.5),
    ],
  };
  return [a, b, c];
}

/** 화이트보드 무대 하나 — i79(종합) · i80(선 그리기만) 이 함께 쓴다 */
function board(box: HTMLElement, opts: { scenes: Scene[]; loop: number; captions: boolean; hand: boolean; wob: number }) {
  ensureFont();
  const root = document.createElement('div');
  root.style.cssText = 'position:absolute;inset:0;background:#fbfaf6;overflow:hidden;font-family:Gaegu,"Pretendard Variable",system-ui,sans-serif';
  root.innerHTML = `<svg viewBox="0 0 800 500" preserveAspectRatio="xMidYMid meet" style="position:absolute;inset:0;width:100%;height:100%">
    <defs><pattern id="wbg" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#eceae2" stroke-width="1"/></pattern></defs>
    <rect width="800" height="500" fill="url(#wbg)"/><g class="ink" fill="none" stroke-linecap="round" stroke-linejoin="round"></g><g class="txt"></g>
    <g class="pen"><path d="M0 0 L-9 -26 L-3 -30 L6 -6 Z" fill="#2c2c30"/><path d="M-9 -26 L-14 -44 L-4 -48 L-3 -30Z" fill="#e2483a"/><circle r="2.4" fill="#1d1d1f"/></g></svg>
    <div class="cap" style="position:absolute;left:4%;right:4%;bottom:3%;text-align:center;font-family:'Pretendard Variable',system-ui;font-weight:600;color:#fff;font-size:clamp(10px,2.2vw,17px);line-height:1.45"><span style="background:rgba(20,20,24,.78);padding:.25em .6em;border-radius:6px;box-decoration-break:clone;-webkit-box-decoration-break:clone"></span></div>`;
  box.appendChild(root);
  const ink = root.querySelector('g.ink')!;
  const txt = root.querySelector('g.txt')!;
  const pen = root.querySelector<SVGGElement>('g.pen')!;
  const cap = root.querySelector<HTMLElement>('.cap span')!;
  const ns = 'http://www.w3.org/2000/svg';
  let wob = opts.wob;
  let hand = opts.hand;
  let captions = opts.captions;
  let curScene = -1;
  const build = (si: number): void => {
    ink.innerHTML = '';
    txt.innerHTML = '';
    const sc = opts.scenes[si]!;
    for (const s of sc.strokes) {
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', path(s.pts, wob, s.seed));
      p.setAttribute('stroke', s.color);
      p.setAttribute('stroke-width', String(s.w));
      ink.appendChild(p);
      s.el = p;
      s.len = p.getTotalLength();
      p.style.strokeDasharray = `${s.len}`;
      p.style.strokeDashoffset = `${s.len}`;
    }
    for (const t of sc.texts) {
      const e = document.createElementNS(ns, 'text');
      e.setAttribute('x', String(t.x));
      e.setAttribute('y', String(t.y));
      e.setAttribute('font-size', String(t.size));
      e.setAttribute('font-weight', '700');
      e.setAttribute('fill', t.color);
      e.setAttribute('text-anchor', t.anchor ?? 'start');
      txt.appendChild(e);
      t.el = e;
    }
  };
  let speakOn = false;
  const speak = (text: string): void => {
    if (!speakOn || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    u.rate = 1.05;
    speechSynthesis.speak(u);
  };
  return {
    setWob(v: number) {
      wob = v;
      curScene = -1;
    },
    setHand(v: boolean) {
      hand = v;
    },
    setCaptions(v: boolean) {
      captions = v;
    },
    setSpeak(v: boolean) {
      speakOn = v;
      if (!v && 'speechSynthesis' in window) speechSynthesis.cancel();
      curScene = -1;
    },
    update(t: number): void {
      const T0 = t % opts.loop;
      const si = Math.max(0, opts.scenes.findIndex((s) => T0 >= s.t0 && T0 < s.t1));
      const sc = opts.scenes[si]!;
      if (si !== curScene) {
        curScene = si;
        build(si);
        speak(sc.say);
      }
      const lt = T0 - sc.t0;
      // 장면 끝 0.5초는 지우개로 쓱 (흐려짐)
      const fade = Math.max(0, Math.min(1, (sc.t1 - T0) / 0.5));
      ink.setAttribute('opacity', String(fade));
      txt.setAttribute('opacity', String(fade));
      let penAt: [number, number] | null = null;
      for (const s of sc.strokes) {
        const k = Math.max(0, Math.min(1, (lt - s.t0) / s.dur));
        const e = k < 1 ? 1 - Math.pow(1 - k, 1.6) : 1;
        s.el!.style.strokeDashoffset = String(s.len! * (1 - e));
        if (k > 0 && k < 1) {
          const p = s.el!.getPointAtLength(s.len! * e);
          penAt = [p.x, p.y];
        }
      }
      for (const tx of sc.texts) {
        const k = Math.max(0, Math.min(1, (lt - tx.t0) / tx.dur));
        const n = Math.round(tx.text.length * k);
        if (tx.el!.textContent !== tx.text.slice(0, n)) tx.el!.textContent = tx.text.slice(0, n);
        if (k > 0 && k < 1) {
          try {
            const bb = (tx.el as SVGGraphicsElement).getBBox();
            penAt = [tx.anchor === 'end' ? bb.x : bb.x + bb.width, bb.y + bb.height * 0.8];
          } catch {
            /* 아직 그려지지 않음 */
          }
        }
      }
      // 물방울 통통 (첫 장면 그림이 끝난 뒤)
      if (si === 0 && lt > 7.2) {
        const last = sc.strokes[sc.strokes.length - 1]!.el!;
        last.setAttribute('transform', `translate(${Math.sin(lt * 3) * 26},${-Math.abs(Math.sin(lt * 6)) * 10})`);
      }
      pen.style.display = hand && penAt ? '' : 'none';
      if (penAt) pen.setAttribute('transform', `translate(${penAt[0]},${penAt[1]})`);
      cap.parentElement!.style.display = captions ? '' : 'none';
      const words = sc.say.split(' ');
      const shown = Math.min(words.length, Math.ceil((lt / Math.max(1, sc.t1 - sc.t0 - 1)) * words.length));
      cap.textContent = words.slice(0, Math.max(1, shown)).join(' ');
    },
    dispose(): void {
      if ('speechSynthesis' in window) speechSynthesis.cancel();
      root.remove();
    },
  };
}

export const DEMOS: DemoMap = {
  i79: {
    kind: 'dom',
    caption: '라이덴프로스트 효과 — 굵기가 변하는 마커 선 · 겹선 · 빗금 색칠 · 얼굴 있는 물방울 · 지우개로 다음 장면 (세 장면 33초)',
    make(box) {
      const b = sketchBoard(box, { wob: 2.4, dbl: true, fill: true, boil: true, hand: true, captions: true, speak: false });
      const controls: Control[] = [
        { type: 'toggle', label: '겹선 (스케치 느낌)', value: true, on: (v) => b.set({ dbl: v }) },
        { type: 'toggle', label: '빗금 색칠', value: true, on: (v) => b.set({ fill: v }) },
        { type: 'toggle', label: '선 살랑임 (line boil)', value: true, on: (v) => b.set({ boil: v }) },
        { type: 'range', label: '손떨림', min: 0, max: 6, step: 0.2, value: 2.4, on: (v) => b.set({ wob: v }) },
        { type: 'toggle', label: '펜 보이기', value: true, on: (v) => b.set({ hand: v }) },
        { type: 'toggle', label: '자막', value: true, on: (v) => b.set({ captions: v }) },
        { type: 'toggle', label: '읽어 주기 (한국어 음성)', value: false, on: (v) => b.set({ speak: v }) },
      ];
      return { update: (t) => b.update(t), controls, dispose: () => b.dispose() };
    },
  },
  i80: {
    kind: 'dom',
    caption: '선의 길이만큼 점선 간격을 주고(dasharray) 그 시작점을 밀어(dashoffset) 선이 그려지는 것처럼 — 손떨림은 점을 살짝 흔들어서',
    make(box) {
      let sd = 40;
      const S = (pts: P[], color: string, w: number, t0: number, dur: number): Stroke => ({ pts, color, w, t0, dur, seed: sd++ });
      const star: P[] = Array.from({ length: 11 }, (_, i) => {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 10;
        const r = i % 2 ? 48 : 110;
        return [200 + Math.cos(a) * r, 250 + Math.sin(a) * r] as P;
      });
      const spiral: P[] = Array.from({ length: 80 }, (_, i) => {
        const a = i * 0.22;
        return [560 + Math.cos(a) * i * 1.5, 250 + Math.sin(a) * i * 1.5] as P;
      });
      const scenes: Scene[] = [
        {
          t0: 0,
          t1: 8,
          say: '선이 그려지는 원리 — 점선 간격을 선 길이만큼, 시작점을 밀어서.',
          texts: [{ x: 400, y: 450, text: 'stroke-dasharray = 길이 · stroke-dashoffset: 길이 → 0', size: 22, color: K, t0: 4.5, dur: 1.6, anchor: 'middle' }],
          strokes: [S(star, RED, 4, 0.4, 2), S(spiral, BLUE, 4, 2.2, 2.2), S(line([90, 400], [710, 400], 10), K, 3, 4.2, 0.8)],
        },
      ];
      const b = board(box, { scenes, loop: 8, captions: false, hand: true, wob: 2 });
      return {
        update: (t) => b.update(t),
        controls: [
          { type: 'range', label: '손떨림', min: 0, max: 8, step: 0.2, value: 2, on: (v) => b.setWob(v) },
          { type: 'toggle', label: '펜 보이기', value: true, on: (v) => b.setHand(v) },
        ],
        dispose: () => b.dispose(),
      };
    },
  },
  i81: {
    kind: '2d',
    caption: '내레이션을 낱말 단위 시각표로 — 그림 · 자막 · 소리가 같은 시계를 따라가요 (읽어 주기는 단추로)',
    make() {
      const lines = leidenfrost().map((s) => ({ t0: s.t0, t1: s.t1, words: s.say.split(' ') }));
      const L = 30;
      let speaking = false;
      return {
        draw(g, w, h, t) {
          const T0 = t % L;
          g.fillStyle = '#fbfaf6';
          g.fillRect(0, 0, w, h);
          const pad = w * 0.05;
          const tw = w - pad * 2;
          const x = (s: number): number => pad + (s / L) * tw;
          const fs = Math.max(9, Math.min(15, w / 45));
          g.font = `600 ${fs}px "Pretendard Variable", system-ui`;
          // 줄: 그림 · 자막 · 소리 · 음악
          const rows = ['그림', '자막', '목소리', '음악'];
          const rh = (h * 0.5) / rows.length;
          const top = h * 0.12;
          rows.forEach((r, i) => {
            g.fillStyle = '#666';
            g.textAlign = 'left';
            g.fillText(r, 6, top + rh * i + rh * 0.62);
          });
          lines.forEach((ln, i) => {
            const c = ['#2f7be0', '#e2483a', '#3aa86a'][i]!;
            // 그림
            g.fillStyle = c + '33';
            g.fillRect(x(ln.t0), top + 4, x(ln.t1) - x(ln.t0) - 3, rh - 8);
            // 자막 · 목소리 — 낱말마다 칸
            const n = ln.words.length;
            for (let k = 0; k < n; k++) {
              const a = ln.t0 + ((ln.t1 - ln.t0 - 1) * k) / n;
              const b2 = ln.t0 + ((ln.t1 - ln.t0 - 1) * (k + 1)) / n;
              const on = T0 >= a && T0 < b2;
              g.fillStyle = on ? c : c + '55';
              g.fillRect(x(a), top + rh + 6, x(b2) - x(a) - 1.5, rh - 12);
              g.fillRect(x(a), top + rh * 2 + 6 + (rh - 12) * 0.3 * (1 - Math.abs(Math.sin(k * 1.7))), x(b2) - x(a) - 1.5, (rh - 12) * (0.7 + 0.3 * Math.abs(Math.sin(k * 1.7))));
            }
          });
          // 음악 — 잔잔한 물결
          g.strokeStyle = '#b48ad8';
          g.lineWidth = 1.5;
          g.beginPath();
          for (let i = 0; i <= 200; i++) {
            const s = (i / 200) * L;
            const y = top + rh * 3 + rh / 2 + Math.sin(s * 3) * rh * 0.18 * (0.6 + 0.4 * Math.sin(s * 0.7));
            if (i) g.lineTo(x(s), y);
            else g.moveTo(x(s), y);
          }
          g.stroke();
          // 재생 머리
          g.strokeStyle = '#1d1d1f';
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(x(T0), top - 6);
          g.lineTo(x(T0), top + rh * 4);
          g.stroke();
          // 지금 자막
          const ln = lines.find((l) => T0 >= l.t0 && T0 < l.t1) ?? lines[0]!;
          const k = Math.min(ln.words.length - 1, Math.floor(((T0 - ln.t0) / Math.max(1, ln.t1 - ln.t0 - 1)) * ln.words.length));
          g.textAlign = 'center';
          g.font = `700 ${fs * 1.3}px Gaegu, "Pretendard Variable", system-ui`;
          const words = ln.words.map((wd, i) => ({ wd, on: i === k, past: i < k }));
          const full = ln.words.join(' ');
          const W = g.measureText(full).width;
          let cx = w / 2 - Math.min(W, w * 0.94) / 2;
          const sc = Math.min(1, (w * 0.94) / W);
          g.save();
          g.translate(cx, h * 0.83);
          g.scale(sc, sc);
          let px = 0;
          g.textAlign = 'left';
          for (const it of words) {
            g.fillStyle = it.on ? '#e2483a' : it.past ? '#1d1d1f' : '#aaa';
            g.fillText(it.wd, px, 0);
            px += g.measureText(it.wd + ' ').width;
          }
          g.restore();
          cx = 0;
          void cx;
          g.fillStyle = '#888';
          g.font = `500 ${fs * 0.85}px "Pretendard Variable", system-ui`;
          g.fillText(`${T0.toFixed(1)}초 / ${L}초`, w / 2, h * 0.95);
        },
        controls: [
          {
            type: 'button',
            label: '읽어 주기 (한 장면씩)',
            on: () => {
              if (!('speechSynthesis' in window)) return;
              speechSynthesis.cancel();
              speaking = true;
              for (const l of lines) {
                const u = new SpeechSynthesisUtterance(l.words.join(' '));
                u.lang = 'ko-KR';
                speechSynthesis.speak(u);
              }
            },
          },
          { type: 'button', label: '멈추기', on: () => ('speechSynthesis' in window ? speechSynthesis.cancel() : undefined) },
        ],
        dispose() {
          if (speaking && 'speechSynthesis' in window) speechSynthesis.cancel();
        },
      };
    },
  },
  i82: {
    kind: '2d',
    caption: '장면 코드 → 헤드리스 브라우저가 1/30초마다 한 장씩 찍기 → 그림 900장 + 목소리 · 음악 → ffmpeg → mp4 (1분 영상)',
    make() {
      return {
        draw(g, w, h, t) {
          g.fillStyle = '#0f1117';
          g.fillRect(0, 0, w, h);
          const fs = Math.max(9, Math.min(15, w / 48));
          const box = (x: number, y: number, bw: number, bh: number, title: string, sub: string, col: string, hot = false): void => {
            g.fillStyle = hot ? col + '33' : '#1a1d27';
            g.strokeStyle = hot ? col : '#33384a';
            g.lineWidth = 1.5;
            g.beginPath();
            g.roundRect(x, y, bw, bh, 8);
            g.fill();
            g.stroke();
            g.fillStyle = '#eceef3';
            g.textAlign = 'center';
            g.font = `700 ${fs}px "Pretendard Variable", system-ui`;
            g.fillText(title, x + bw / 2, y + bh * 0.45);
            g.fillStyle = '#8a90a2';
            g.font = `500 ${fs * 0.8}px "Pretendard Variable", system-ui`;
            g.fillText(sub, x + bw / 2, y + bh * 0.75);
          };
          const ph = (t % 6) / 6;
          const bw = w * 0.2;
          const bh = h * 0.22;
          const y = h * 0.16;
          box(w * 0.03, y, bw, bh, '장면 코드', 'SVG · 캔버스 · 시각표', '#5aa8ff', ph < 0.2);
          box(w * 0.28, y, bw, bh, '헤드리스 브라우저', '1/30초씩 시계를 돌려', '#9b7bff', ph >= 0.2 && ph < 0.55);
          box(w * 0.53, y, bw, bh, '그림 900장', 'frame_0001.png …', '#ffc35a', ph >= 0.45 && ph < 0.8);
          box(w * 0.77, y, bw, bh, 'mp4', 'ffmpeg 로 묶기', '#3ee29a', ph >= 0.75);
          // 화살표
          g.strokeStyle = '#555c70';
          g.lineWidth = 2;
          for (const ax of [0.23, 0.48, 0.73]) {
            g.beginPath();
            g.moveTo(w * ax + 2, y + bh / 2);
            g.lineTo(w * (ax + 0.05) - 4, y + bh / 2);
            g.stroke();
          }
          // 필름 띠 — 찍힌 장면이 흘러감
          const fy = h * 0.5;
          const fh = h * 0.2;
          g.fillStyle = '#1a1d27';
          g.fillRect(0, fy, w, fh);
          const fw = fh * 1.5;
          const off = ((t * 60) % fw) - fw;
          for (let x = off; x < w; x += fw) {
            g.fillStyle = '#fbfaf6';
            g.fillRect(x + 4, fy + 10, fw - 8, fh - 20);
            const k = ((x - off) / fw + Math.floor(t * 60 / fw)) % 30;
            g.strokeStyle = '#2f7be0';
            g.lineWidth = 2;
            g.beginPath();
            g.ellipse(x + fw / 2, fy + fh / 2, (fw - 20) * 0.3 * Math.min(1, (k + 1) / 15), (fh - 26) * 0.25, 0, 0, Math.PI * 2 * Math.min(1, (k + 1) / 12));
            g.stroke();
            g.fillStyle = '#0f1117';
            for (let q = 0; q < 6; q++) {
              g.fillRect(x + (q + 0.3) * (fw / 6), fy + 2, fw / 12, 5);
              g.fillRect(x + (q + 0.3) * (fw / 6), fy + fh - 7, fw / 12, 5);
            }
          }
          // 소리 줄
          const sy = h * 0.8;
          g.fillStyle = '#8a90a2';
          g.textAlign = 'left';
          g.font = `600 ${fs * 0.85}px "Pretendard Variable", system-ui`;
          g.fillText('목소리 (TTS)', w * 0.03, sy - 4);
          g.fillText('배경음악', w * 0.03, sy + h * 0.1 - 4);
          g.strokeStyle = '#e2483a';
          g.beginPath();
          for (let i = 0; i < 160; i++) {
            const x = w * 0.2 + (i / 160) * w * 0.75;
            const a = Math.abs(Math.sin(i * 0.5 + t * 3)) * (i % 23 < 18 ? 1 : 0.1) * h * 0.035;
            g.moveTo(x, sy - 10 - a);
            g.lineTo(x, sy - 10 + a);
          }
          g.stroke();
          g.strokeStyle = '#b48ad8';
          g.beginPath();
          for (let i = 0; i <= 160; i++) {
            const x = w * 0.2 + (i / 160) * w * 0.75;
            const yy = sy + h * 0.1 - 10 + Math.sin(i * 0.25 + t * 2) * h * 0.015;
            if (i) g.lineTo(x, yy);
            else g.moveTo(x, yy);
          }
          g.stroke();
        },
      };
    },
  },
};

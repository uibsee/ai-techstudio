import type { Control, DemoMap } from './types';
import { F, MONO, clamp01, lerp, seg, inOut, outBack, speedCtl, stage, esc } from './lib/stage';

/**
 * 모션 그래픽 견본 D — 흐름도 · 코드 움직임 (i552 ~ i555, 2026-10-10).
 * prompt-motion.com 의 분류(Diagrams · Code)에서 빈칸을 찾아 새로 만든 것 — 그곳 영상 · 프롬프트를 옮긴 것은 아니다.
 * 280×175 무대(lib/stage.ts) 위 SVG · HTML. 상태는 주기 안의 시각 p 에서 바로 계산한다.
 */

/* ═════════ i552 흐름도 차례 그리기 (상자 튀어나옴 · 선 그리기 · 흐르는 점) ═════════ */
const i552 = {
  kind: 'dom' as const,
  caption: '상자가 통 튀어나오고 선이 그려지며 화살촉이 꽂힌 뒤, 데이터 점이 선을 따라 돌고 지나간 상자가 반짝 — 순서도 설명 영상',
  make(box: HTMLElement) {
    const o = { s: 1, dots: 2 };
    // 상자: [가운데 x, y, 너비, 높이, 꼴(0 알약 · 1 네모 · 2 마름모), 글, 나타나는 시각]
    const NODES: [number, number, number, number, number, string, number][] = [
      [34, 88, 44, 22, 0, '시작', 0.2],
      [96, 88, 54, 26, 1, '답 입력', 0.7],
      [162, 88, 56, 40, 2, '맞았나?', 1.2],
      [238, 48, 54, 26, 1, '점수 +1', 1.85],
      [238, 128, 54, 26, 1, '힌트 보기', 1.85],
    ];
    // 선: [경로, 시작 상자, 끝 상자, 그리기 시작 시각, 이름표, 이름표 x, y]
    const EDGES: [string, number, number, number, string, number, number][] = [
      ['M56 88 L69 88', 0, 1, 0.5, '', 0, 0],
      ['M123 88 L134 88', 1, 2, 1.0, '', 0, 0],
      ['M162 68 C162 48 182 48 211 48', 2, 3, 1.5, '예', 176, 42],
      ['M162 108 C162 128 182 128 211 128', 2, 4, 1.5, '아니오', 180, 137],
      ['M238 141 C238 168 96 168 96 101', 4, 1, 2.1, '다시', 167, 163],
      ['M238 35 C238 8 96 8 96 75', 3, 1, 2.1, '다음 문제', 167, 13],
    ];
    const shape = (n: (typeof NODES)[number]): string => {
      const [, , w, h, k] = n;
      if (k === 2) return `<polygon class="sh" points="0,${-h / 2} ${w / 2},0 0,${h / 2} ${-w / 2},0"/>`;
      return `<rect class="sh" x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${k === 0 ? h / 2 : 5}"/>`;
    };
    let svg = '<g class="all">';
    EDGES.forEach((e) => {
      svg += `<path class="e" d="${e[0]}"/><path class="ah" d="M-4.5 -3.2 L1 0 L-4.5 3.2 Z"/>`;
      if (e[4]) svg += `<text class="lb" x="${e[5]}" y="${e[6]}">${e[4]}</text>`;
    });
    NODES.forEach((n) => (svg += `<g transform="translate(${n[0]} ${n[1]})"><g class="nd">${shape(n)}<text class="tx">${n[5]}</text></g></g>`));
    svg += '<circle class="dg" r="6"/><circle class="dt" r="3"/><circle class="dg" r="6"/><circle class="dt" r="3"/><circle class="dg" r="6"/><circle class="dt" r="3"/></g>';
    const S = stage(
      box,
      `.mc52 .sh{fill:#fff;stroke:#4b6bff;stroke-width:1.5}
      .mc52 .tx{font:800 8px ${F};fill:#1d2b4f;text-anchor:middle;dominant-baseline:central}
      .mc52 .e{fill:none;stroke:#8aa4ff;stroke-width:1.6}
      .mc52 .ah{fill:#8aa4ff}
      .mc52 .lb{font:700 7px ${F};fill:#6b7799;text-anchor:middle}
      .mc52 .dt{fill:#ffb800}.mc52 .dg{fill:rgba(255,200,40,.3)}`,
      `<svg class="mc52" width="280" height="175" viewBox="0 0 280 175" style="position:absolute;left:0;top:0;overflow:visible">${svg}</svg>`,
      '#f3f6ff radial-gradient(circle,#d7def5 1px,transparent 1.2px) 0 0/12px 12px',
    );
    const all = S.st.querySelector<SVGGElement>('.all')!;
    const paths = [...S.st.querySelectorAll<SVGPathElement>('.e')];
    const heads = [...S.st.querySelectorAll<SVGPathElement>('.ah')];
    const labels = [...S.st.querySelectorAll<SVGTextElement>('.lb')];
    const nds = [...S.st.querySelectorAll<SVGGElement>('.nd')];
    const shs = [...S.st.querySelectorAll<SVGElement>('.sh')];
    const dts = [...S.st.querySelectorAll<SVGCircleElement>('.dt')];
    const dgs = [...S.st.querySelectorAll<SVGCircleElement>('.dg')];
    let lens: number[] = [];
    const measure = (): void => {
      lens = paths.map((p) => p.getTotalLength());
      paths.forEach((p, i) => {
        // 화살촉은 선 끝 방향으로 — 끝 바로 앞 점과 끝 점으로 각도
        const L = lens[i]!;
        const a = p.getPointAtLength(Math.max(0, L - 1.5));
        const b = p.getPointAtLength(L);
        heads[i]!.setAttribute('transform', `translate(${b.x.toFixed(2)} ${b.y.toFixed(2)}) rotate(${((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI).toFixed(1)})`);
        p.style.strokeDasharray = `${L} ${L}`;
      });
    };
    const PAT = [1, 0, 1, 1, 0, 1, 0, 0];
    const V = 85; // 점 빠르기 (무대 단위/초)
    const WAIT = 0.15; // 상자에서 잠깐 머묾 (처리 중)
    const RUN0 = 2.7;
    const T = 9.4;
    let tt = 0;
    return {
      controls: [speedCtl(o), { type: 'range', label: '흐르는 점', min: 1, max: 3, step: 1, value: 2, on: (v: number) => (o.dots = v) }] as Control[],
      update(_t: number, dt: number) {
        if (!lens.length || !lens[0]) measure();
        tt += Math.max(0, Math.min(dt, 0.1)) * o.s;
        const p = tt % T;
        all.style.opacity = (1 - seg(p, 8.7, 9.1)).toFixed(3);
        const glow = NODES.map(() => 0);
        const hot = EDGES.map(() => 0);
        // 데이터 점 — 시작에서 나와 「입력 → 판정 → 예/아니오 → 입력」을 돈다. 시각에서 바로 위치를 계산(걸어 보기)
        for (let k = 0; k < 3; k++) {
          const st = RUN0 + k * 1.3;
          let t = p - st;
          let pos: DOMPoint | null = null;
          if (k < o.dots && t >= 0 && p < 8.7) {
            const route = (j: number): number[] => (j < 0 ? [0] : PAT[(k * 3 + j) % PAT.length] ? [1, 2, 5] : [1, 3, 4]);
            for (let j = -1; j < 40 && !pos; j++) {
              for (const ei of route(j)) {
                const L = lens[ei] || 1;
                const dur = L / V;
                if (t < dur) {
                  pos = paths[ei]!.getPointAtLength((L * t) / dur);
                  hot[ei] = 1;
                  break;
                }
                t -= dur;
                const nd = EDGES[ei]![2];
                if (t < 0.4) glow[nd] = Math.max(glow[nd]!, 1 - t / 0.4);
                if (t < WAIT) {
                  pos = new DOMPoint(NODES[nd]![0], NODES[nd]![1]);
                  break;
                }
                t -= WAIT;
              }
            }
          }
          const vis = pos ? '1' : '0';
          dts[k]!.style.opacity = dgs[k]!.style.opacity = vis;
          if (pos) {
            dts[k]!.setAttribute('cx', pos.x.toFixed(2));
            dts[k]!.setAttribute('cy', pos.y.toFixed(2));
            dgs[k]!.setAttribute('cx', pos.x.toFixed(2));
            dgs[k]!.setAttribute('cy', pos.y.toFixed(2));
          }
        }
        // 상자: 통 튀어나오고, 점이 지나가면 반짝
        NODES.forEach((n, i) => {
          const s = outBack(seg(p, n[6], n[6] + 0.35), 2);
          const g = glow[i]!;
          nds[i]!.setAttribute('transform', `scale(${(s * (1 + 0.08 * g)).toFixed(4)})`);
          shs[i]!.style.stroke = g > 0.05 ? '#ffb800' : '';
          shs[i]!.style.strokeWidth = (1.5 + 2 * g).toFixed(2);
        });
        // 선: 대시 오프셋으로 그려 나가고, 다 그려지면 화살촉이 꽂힘
        EDGES.forEach((e, i) => {
          const k = inOut(seg(p, e[3], e[3] + 0.35));
          const L = lens[i] || 0;
          paths[i]!.style.strokeDashoffset = (L * (1 - k)).toFixed(2);
          heads[i]!.style.opacity = seg(k, 0.85, 1).toFixed(3);
          const c = hot[i] ? (i === 2 ? '#1fbf6a' : i === 3 ? '#ff5c6c' : '#ffb800') : '';
          paths[i]!.style.stroke = c;
          heads[i]!.style.fill = c;
        });
        let li = 0;
        EDGES.forEach((e) => {
          if (!e[4]) return;
          labels[li++]!.style.opacity = seg(p, e[3] + 0.25, e[3] + 0.5).toFixed(3);
        });
      },
      dispose() {
        S.dispose();
      },
    };
  },
};

/* ═════════ i553 나무 구조 펼치기 (기술 나무 · 마인드맵) ═════════ */
const i553 = {
  kind: 'dom' as const,
  caption: '부모에서 자식이 쏙 나와 제자리로 가며 가지가 늘어나요 — 길 따라 금빛이 번지며 기술이 열리고, 가지를 접으면 부모 속으로 쏙',
  make(box: HTMLElement) {
    const o = { s: 1 };
    // [x, y, 부모, 이름, 색]
    const N: [number, number, number, string, string][] = [
      [140, 22, -1, '기본기', '#ffb800'],
      [56, 76, 0, '공격', '#ff5c6c'],
      [140, 76, 0, '방어', '#3a8bff'],
      [224, 76, 0, '이동', '#1fbf6a'],
      [30, 132, 1, '연타', '#ff5c6c'],
      [82, 132, 1, '강타', '#ff5c6c'],
      [114, 132, 2, '막기', '#3a8bff'],
      [166, 132, 2, '반격', '#3a8bff'],
      [198, 132, 3, '달리기', '#1fbf6a'],
      [250, 132, 3, '이단 뛰기', '#1fbf6a'],
    ];
    const GOLD = [0, 3, 9]; // 열리는 길
    let s = '';
    N.forEach((n, i) => {
      if (i) s += `<path class="ln" style="stroke:${n[4]}"/>`;
    });
    s += '<path class="gl" pathLength="1"/><path class="gl" pathLength="1"/>';
    N.forEach((n, i) => {
      const r = i ? 10 : 13;
      s += `<g class="nd"><circle class="br" r="${r}" fill="none" stroke="#ffb800" stroke-width="2"/><circle class="cc" r="${r}" style="stroke:${n[4]}"/><text class="ic" style="fill:${n[4]}">${n[3][0]}</text><text class="nm" y="${r + 9}">${n[3]}</text>${i === 1 ? '<g class="pl"><circle cx="9" cy="-9" r="5.5" fill="#ff5c6c"/><text x="9" y="-9" class="pt">+2</text></g>' : ''}</g>`;
    });
    const S = stage(
      box,
      `.mc53 .ln{fill:none;stroke-width:2;opacity:.55}
      .mc53 .gl{fill:none;stroke:#ffb800;stroke-width:3.2;stroke-linecap:round;stroke-dasharray:1 1}
      .mc53 .cc{fill:#fff;stroke-width:2}
      .mc53 .ic{font:900 9px ${F};text-anchor:middle;dominant-baseline:central}
      .mc53 .nm{font:700 7.5px ${F};fill:#cfd8f5;text-anchor:middle;dominant-baseline:central}
      .mc53 .pt{font:800 6px ${F};fill:#fff;text-anchor:middle;dominant-baseline:central}
      .mc53 .ttl{font:800 9px ${F};fill:#8fa0d8}`,
      `<svg class="mc53" width="280" height="175" viewBox="0 0 280 175" style="position:absolute;left:0;top:0;overflow:visible"><text class="ttl" x="10" y="14">기술 나무</text>${s}</svg>`,
      'radial-gradient(ellipse at 50% 30%,#2b3a78,#121a3d)',
    );
    const lns = [...S.st.querySelectorAll<SVGPathElement>('.ln')];
    const gls = [...S.st.querySelectorAll<SVGPathElement>('.gl')];
    const nds = [...S.st.querySelectorAll<SVGGElement>('.nd')];
    const ccs = [...S.st.querySelectorAll<SVGCircleElement>('.cc')];
    const brs = [...S.st.querySelectorAll<SVGCircleElement>('.br')];
    const plus = S.st.querySelector<SVGGElement>('.pl')!;
    const link = (a: number[], b: number[], ra: number, rb: number): string => {
      const my = (a[1]! + b[1]!) / 2;
      return `M${a[0]!.toFixed(1)} ${(a[1]! + ra).toFixed(1)} C${a[0]!.toFixed(1)} ${my.toFixed(1)} ${b[0]!.toFixed(1)} ${my.toFixed(1)} ${b[0]!.toFixed(1)} ${(b[1]! - rb).toFixed(1)}`;
    };
    let tt = 0;
    return {
      controls: [speedCtl(o)] as Control[],
      update(_t: number, dt: number) {
        tt += Math.max(0, Math.min(dt, 0.1)) * o.s;
        const T = 8.2;
        const p = tt % T;
        // 펼침 정도 k (outBack 이라 1 을 살짝 넘었다 돌아옴) — 자식 자리 = 부모 자리와 제자리 사이를 k 로
        const fold = p < 5.6 ? 1 - inOut(seg(p, 4.6, 5.0)) : outBack(seg(p, 5.6, 6.05), 1.3);
        const K = N.map((n, i) => {
          if (i === 0) return outBack(seg(p, 0.05, 0.4), 2) * (1 - inOut(seg(p, 7.55, 7.85)));
          if (n[2] === 0) return outBack(seg(p, 0.45 + 0.1 * (i - 1), 0.9 + 0.1 * (i - 1)), 1.3) * (1 - inOut(seg(p, 7.2, 7.55)));
          const j = n[2] - 1;
          const m = (i - 4) % 2;
          const e = outBack(seg(p, 1.0 + 0.1 * j + 0.05 * m, 1.45 + 0.1 * j + 0.05 * m), 1.3);
          return e * (n[2] === 1 ? fold : 1) * (1 - inOut(seg(p, 6.85, 7.2)));
        });
        const pos: number[][] = [];
        N.forEach((n, i) => {
          if (n[2] < 0) pos[i] = [n[0], n[1]];
          else {
            const pp = pos[n[2]]!;
            pos[i] = [lerp(pp[0]!, n[0], K[i]!), lerp(pp[1]!, n[1], K[i]!)];
          }
        });
        // 금빛 길: 기본기 → 이동 → 이단 뛰기
        const g1 = seg(p, 2.3, 2.8);
        const g2 = seg(p, 2.95, 3.45);
        const unlocked = [1, p >= 2.8 ? 1 : 0, p >= 3.45 ? 1 : 0];
        const burst = [9, p - 2.8, p - 3.45];
        N.forEach((n, i) => {
          const k = K[i]!;
          nds[i]!.setAttribute('transform', `translate(${pos[i]![0]!.toFixed(2)} ${pos[i]![1]!.toFixed(2)}) scale(${Math.max(0, k).toFixed(4)})`);
          nds[i]!.style.opacity = clamp01(k * 1.5).toFixed(3);
          if (i) {
            const pi = n[2];
            lns[i - 1]!.setAttribute('d', link(pos[pi]!, pos[i]!, (pi ? 10 : 13) * Math.max(0, K[pi]!), 10 * Math.max(0, k)));
            lns[i - 1]!.style.opacity = (0.55 * clamp01(k * 1.5)).toFixed(3);
          }
          const gi = GOLD.indexOf(i);
          const on = gi >= 0 && unlocked[gi]!;
          ccs[i]!.style.fill = on ? '#fff3c4' : '';
          const b = gi >= 0 && on ? burst[gi]! : 9;
          brs[i]!.setAttribute('r', ((i ? 10 : 13) + 14 * clamp01(b / 0.45)).toFixed(2));
          brs[i]!.style.opacity = b >= 0 && b < 0.45 ? (1 - b / 0.45).toFixed(3) : '0';
        });
        gls[0]!.setAttribute('d', link(pos[0]!, pos[3]!, 13 * Math.max(0, K[0]!), 10 * Math.max(0, K[3]!)));
        gls[1]!.setAttribute('d', link(pos[3]!, pos[9]!, 10 * Math.max(0, K[3]!), 10 * Math.max(0, K[9]!)));
        gls[0]!.style.strokeDashoffset = (1 - g1).toFixed(4);
        gls[1]!.style.strokeDashoffset = (1 - g2).toFixed(4);
        gls[0]!.style.opacity = g1 > 0 ? clamp01(K[3]!).toFixed(3) : '0';
        gls[1]!.style.opacity = g2 > 0 ? clamp01(K[9]!).toFixed(3) : '0';
        plus.style.opacity = (clamp01(1 - fold * 2) * clamp01(K[1]!)).toFixed(3);
      },
      dispose() {
        S.dispose();
      },
    };
  },
};

/* ═════════ i554 코드 타자 + 문법 색 (사람 박자 · 오타 고치기) ═════════ */
const SRC54 = 'function addScore(p, n) {\n  // 콤보면 두 배\n  const bonus = p.combo > 2 ? 2 : 1;\n  p.score += n * bonus;\n  return p.score;\n}';
const KW = /^(function|const|let|var|return|if|else|for|while|new)$/;
/** 한 줄을 색 입힌 HTML 로 — 치는 도중의 반쪽 낱말도 그대로 (「functio」는 아직 이름 색) */
function hl(line: string): string {
  const re = /(\/\/.*$)|('[^']*'?|"[^"]*"?)|(\d+(?:\.\d+)?)|([A-Za-z_$][\w$]*)|(\s+)|(.)/g;
  let out = '';
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const [all, cm, str, num, id, ws] = m;
    if (cm) out += `<span class="c">${esc(cm)}</span>`;
    else if (str) out += `<span class="s">${esc(str)}</span>`;
    else if (num) out += `<span class="n">${num}</span>`;
    else if (id) {
      const isFn = /^\s*\(/.test(line.slice(m.index + id.length));
      out += `<span class="${KW.test(id) ? 'k' : isFn ? 'f' : 'i'}">${id}</span>`;
    } else if (ws) out += ws;
    else out += `<span class="p">${esc(all)}</span>`;
  }
  return out;
}

const i554 = {
  kind: 'dom' as const,
  caption: '글자가 사람 박자로 쳐지며 바로 색이 입혀져요 — 띄어쓰기 · 줄바꿈에서 쉬고, 오타를 냈다 지우고 고쳐요',
  make(box: HTMLElement) {
    const o = { s: 1, human: true };
    type Op = { ch: string | null; at: number };
    let ops: Op[] = [];
    let end = 0;
    const build = (): void => {
      ops = [];
      let t = 0.4;
      const typo = SRC54.indexOf('n * bonus') + 4; // 「bonus」의 b
      for (let i = 0; i < SRC54.length; i++) {
        const ch = SRC54[i]!;
        let d = 0.05;
        if (o.human) {
          d = 0.03 + ((i * 0.618) % 1) * 0.045; // 글자마다 다른 간격
          if (ch === ' ') d += 0.03;
          if (SRC54[i - 1] === '\n') d += 0.28; // 새 줄 앞에서 생각
          if ('(){};'.includes(ch)) d += 0.04;
          if (i === typo) {
            // b · o 다음 u 를 잘못 침 → 잠깐 멈칫 → 지우기 → 바르게
            for (const c of 'bou') ops.push({ ch: c, at: (t += 0.06) });
            t += 0.38;
            ops.push({ ch: null, at: (t += 0.1) });
            t += 0.12;
            i += 1;
            continue;
          }
        }
        ops.push({ ch, at: (t += d) });
      }
      end = t;
    };
    build();
    const S = stage(
      box,
      `.mc54-ed{position:absolute;left:10px;top:8px;width:260px;height:159px;border-radius:9px;background:#1e2130;box-shadow:0 6px 18px rgba(0,0,0,.35);overflow:hidden}
      .mc54-tb{position:absolute;left:0;right:0;top:0;height:18px;background:#171a26}
      .mc54-tb i{position:absolute;top:6px;width:6px;height:6px;border-radius:50%}
      .mc54-tb span{position:absolute;left:38px;top:0;height:18px;padding:0 9px;background:#1e2130;font:700 8px/18px ${F};color:#c9d1e8}
      .mc54-code{position:absolute;left:0;right:0;top:24px;font:10px/15px ${MONO};white-space:pre;color:#e6edf3}
      .mc54-l{position:relative;height:15px;padding-left:26px}
      .mc54-l.on{background:rgba(255,255,255,.06)}
      .mc54-l b{position:absolute;left:0;width:18px;text-align:right;font-weight:400;color:#56607d}
      .mc54-l.on b{color:#c9d1e8}
      .mc54-cur{display:inline-block;width:1.5px;height:12px;margin-left:.5px;vertical-align:-2px;background:#ffcc66}
      .mc54-code .k{color:#c792ea}.mc54-code .f{color:#82aaff}.mc54-code .n{color:#f78c6c}.mc54-code .s{color:#c3e88d}.mc54-code .c{color:#6b7599;font-style:italic}.mc54-code .p{color:#89ddff}.mc54-code .i{color:#e6edf3}
      .mc54-ok{position:absolute;right:10px;bottom:9px;padding:2px 8px;border-radius:9px;background:#1fbf6a;color:#fff;font:800 8px ${F};opacity:0}`,
      `<div class="mc54-ed"><div class="mc54-tb"><i style="left:8px;background:#ff5f57"></i><i style="left:17px;background:#febc2e"></i><i style="left:26px;background:#28c840"></i><span>score.ts</span></div>
      <div class="mc54-code"></div><div class="mc54-ok">✓ 저장됨</div></div>`,
      'linear-gradient(135deg,#3b4a7a,#1a2140)',
    );
    const code = S.st.querySelector<HTMLElement>('.mc54-code')!;
    const ok = S.st.querySelector<HTMLElement>('.mc54-ok')!;
    let shown = -1;
    let cur: HTMLElement | null = null;
    let tt = 0;
    return {
      controls: [
        speedCtl(o),
        { type: 'toggle', label: '사람 같은 박자 (끄면 일정한 간격)', value: true, on: (v: boolean) => { o.human = v; build(); shown = -1; } },
      ] as Control[],
      update(_t: number, dt: number) {
        tt += Math.max(0, Math.min(dt, 0.1)) * o.s;
        const T = end + 2.3;
        const p = tt % T;
        let n = 0;
        while (n < ops.length && ops[n]!.at <= p) n++;
        if (p > end + 2.0) n = 0;
        if (n !== shown) {
          // 글이 바뀐 프레임에만 다시 그린다
          shown = n;
          let text = '';
          for (let i = 0; i < n; i++) {
            const c = ops[i]!.ch;
            text = c === null ? text.slice(0, -1) : text + c;
          }
          const lines = text.split('\n');
          const at = lines.length - 1;
          code.innerHTML = lines.map((l, i) => `<div class="mc54-l${i === at ? ' on' : ''}"><b>${i + 1}</b>${hl(l)}${i === at ? '<i class="mc54-cur"></i>' : ''}</div>`).join('');
          cur = code.querySelector<HTMLElement>('.mc54-cur');
        }
        // 치는 동안은 커서가 켜져 있고, 멈추면 깜박
        const last = n > 0 ? ops[n - 1]!.at : 0;
        const idle = p - last;
        if (cur) cur.style.opacity = idle < 0.45 || Math.floor((idle - 0.45) / 0.53) % 2 ? '1' : '0';
        code.style.opacity = (1 - seg(p, end + 1.7, end + 2.0)).toFixed(3);
        ok.style.opacity = (seg(p, end + 0.3, end + 0.5) * (1 - seg(p, end + 1.5, end + 1.8))).toFixed(3);
      },
      dispose() {
        S.dispose();
      },
    };
  },
};

/* ═════════ i555 코드 모양 바꾸기 (같은 낱말 짝짓기 · Magic Move) ═════════ */
const V555 = [
  'let hp = 10;\nhp = hp - 3;\nshow(hp);',
  'let hp = 10;\nconst dmg = 3;\nhp = Math.max(0, hp - dmg);\nshow(hp);',
  'const MAX = 10;\nlet hp = MAX;\nfunction hit(dmg) {\n  hp = Math.max(0, hp - dmg);\n  show(hp);\n}',
];
const STEP555 = ['그냥 빼기', '피해를 변수로', '함수로 묶기'];
type Tok = { s: string; line: number; col: number; kind: string };
/** 낱말로 자르기 — 칸(col) · 줄(line)을 같이 적어 둔다 (고정폭 글꼴이라 위치 = 칸 × 글자 폭) */
function toks(src: string): Tok[] {
  const out: Tok[] = [];
  src.split('\n').forEach((ln, line) => {
    const re = /[A-Za-z_$][\w$]*|\d+|[^\s\w]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(ln))) {
      const s = m[0];
      const kind = KW.test(s) ? 'k' : /^\d/.test(s) ? 'n' : /^[A-Za-z_$]/.test(s) ? (/^\s*\(/.test(ln.slice(m.index + s.length)) ? 'f' : 'i') : 'p';
      out.push({ s, line, col: m.index, kind });
    }
  });
  return out;
}
/** 가장 긴 공통 부분 수열(LCS) — 순서를 지키며 같은 낱말끼리 짝 */
function lcs(a: Tok[], b: Tok[]): [number, number][] {
  const n = a.length;
  const m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i]![j] = a[i]!.s === b[j]!.s ? L[i + 1]![j + 1]! + 1 : Math.max(L[i + 1]![j]!, L[i]![j + 1]!);
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i]!.s === b[j]!.s) {
      pairs.push([i++, j++]);
    } else if (L[i + 1]![j]! >= L[i]![j + 1]!) i++;
    else j++;
  }
  return pairs;
}

const i555 = {
  kind: 'dom' as const,
  caption: '코드가 바뀔 때 같은 낱말은 남아서 새 자리로 미끄러지고, 없어진 것은 녹고 새것만 피어나요 — 낱말 짝짓기(LCS) + 위치 트윈',
  make(box: HTMLElement) {
    const o = { s: 1, match: true };
    const S = stage(
      box,
      `.mc55-ed{position:absolute;left:10px;top:8px;width:260px;height:159px;border-radius:9px;background:#1e2130;box-shadow:0 6px 18px rgba(0,0,0,.35);overflow:hidden}
      .mc55-tb{position:absolute;left:0;right:0;top:0;height:18px;background:#171a26;font:700 8px/18px ${F};color:#c9d1e8;padding-left:10px}
      .mc55-step{position:absolute;right:10px;top:0;font:800 8px/18px ${F};color:#ffcc66}
      .mc55-g{position:absolute;left:0;width:18px;text-align:right;font:9.5px/14px ${MONO};color:#56607d}
      .mc55-set{position:absolute;inset:0;display:none}
      .mc55-set span{position:absolute;left:0;top:0;font:9.5px/14px ${MONO};white-space:pre;border-radius:2px}
      .mc55-set .k{color:#c792ea}.mc55-set .f{color:#82aaff}.mc55-set .n{color:#f78c6c}.mc55-set .p{color:#89ddff}.mc55-set .i{color:#e6edf3}
      .mc55-m{position:absolute;left:-999px;top:0;font:9.5px ${MONO};white-space:pre}`,
      `<div class="mc55-ed"><div class="mc55-tb">hp.ts<span class="mc55-step"></span></div>
      ${[1, 2, 3, 4, 5, 6].map((i) => `<div class="mc55-g" style="top:${26 + (i - 1) * 14}px">${i}</div>`).join('')}
      <div class="mc55-set"></div><div class="mc55-set"></div><div class="mc55-set"></div><span class="mc55-m">MMMMMMMMMMMMMMMMMMMM</span></div>`,
      'linear-gradient(135deg,#3b4a7a,#1a2140)',
    );
    const cw = (S.st.querySelector<HTMLElement>('.mc55-m')!.offsetWidth || 114) / 20; // 글자 한 칸 폭
    const X0 = 28;
    const Y0 = 26;
    const LH = 14;
    const at = (t: Tok): [number, number] => [X0 + t.col * cw, Y0 + t.line * LH];
    const sets = [...S.st.querySelectorAll<HTMLElement>('.mc55-set')];
    const gut = [...S.st.querySelectorAll<HTMLElement>('.mc55-g')];
    const step = S.st.querySelector<HTMLElement>('.mc55-step')!;
    const nLines = V555.map((v) => v.split('\n').length);
    type Item = { el: HTMLElement; a: [number, number] | null; b: [number, number] | null };
    // 바뀜 s = 판 s → 판 s+1. 짝지은 낱말은 하나의 span 이 옮겨 가고, 나머지는 사라짐 · 나타남
    const items: Item[][] = sets.map((set, sIdx) => {
      const A = toks(V555[sIdx]!);
      const B = toks(V555[(sIdx + 1) % 3]!);
      const pairs = lcs(A, B);
      const ua = new Set(pairs.map((q) => q[0]));
      const ub = new Set(pairs.map((q) => q[1]));
      const list: Item[] = [];
      const mk = (t: Tok): HTMLElement => {
        const el = document.createElement('span');
        el.className = t.kind;
        el.textContent = t.s;
        set.appendChild(el);
        return el;
      };
      pairs.forEach(([i, j]) => list.push({ el: mk(A[i]!), a: at(A[i]!), b: at(B[j]!) }));
      A.forEach((t, i) => ua.has(i) || list.push({ el: mk(t), a: at(t), b: null }));
      B.forEach((t, j) => ub.has(j) || list.push({ el: mk(t), a: null, b: at(t) }));
      return list;
    });
    const tr = (el: HTMLElement, x: number, y: number, op: number, bg: string): void => {
      el.style.transform = `translate(${x.toFixed(2)}px,${y.toFixed(2)}px)`;
      el.style.opacity = op.toFixed(3);
      el.style.background = bg;
    };
    let tt = 0;
    let act = -1;
    return {
      controls: [speedCtl(o), { type: 'toggle', label: '같은 낱말 짝짓기 (끄면 통째로 겹쳐 바뀜)', value: true, on: (v: boolean) => (o.match = v) }] as Control[],
      update(_t: number, dt: number) {
        tt += Math.max(0, Math.min(dt, 0.1)) * o.s;
        const D = 2.7;
        const sIdx = Math.floor(tt / D) % 3;
        const q = tt % D;
        if (sIdx !== act) {
          sets.forEach((st, i) => (st.style.display = i === sIdx ? 'block' : 'none'));
          act = sIdx;
        }
        const k = seg(q, 0, 0.9);
        const mv = inOut(seg(k, 0.15, 0.85));
        const green = 0.3 * (1 - seg(q, 1.0, 2.0));
        for (const it of items[sIdx]!) {
          if (it.a && it.b) {
            if (o.match) tr(it.el, lerp(it.a[0], it.b[0], mv), lerp(it.a[1], it.b[1], mv), 1, 'transparent');
            else if (k < 0.5) tr(it.el, it.a[0], it.a[1], 1 - k * 2, 'transparent');
            else tr(it.el, it.b[0], it.b[1], k * 2 - 1, 'transparent');
          } else if (it.a) {
            const f = seg(k, 0, 0.35);
            tr(it.el, it.a[0], it.a[1] - 3 * f, 1 - f, k > 0 && f < 1 ? 'rgba(255,90,90,.3)' : 'transparent');
          } else if (it.b) {
            const f = seg(k, 0.55, 1);
            tr(it.el, it.b[0], it.b[1] + 3 * (1 - f), f, f > 0 ? `rgba(80,220,120,${(green * Math.min(1, f * 2)).toFixed(3)})` : 'transparent');
          }
        }
        // 줄 번호 개수도 따라감
        const nl = lerp(nLines[sIdx]!, nLines[(sIdx + 1) % 3]!, mv);
        gut.forEach((g, i) => (g.style.opacity = clamp01(nl - i).toFixed(3)));
        step.textContent = `${k < 0.5 ? (sIdx % 3) + 1 : ((sIdx + 1) % 3) + 1}단계 · ${STEP555[k < 0.5 ? sIdx : (sIdx + 1) % 3]}`;
      },
      dispose() {
        S.dispose();
      },
    };
  },
};

export const DEMOS: DemoMap = { i552, i553, i554, i555 };

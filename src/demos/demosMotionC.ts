import type { Control, DemoMap } from './types';
import { F, clamp01, lerp, seg, outCubic, inOut, outBack, speedCtl, stage } from './lib/stage';

/**
 * 모션 그래픽 견본 C — 제품 UI 움직임 (i548 ~ i551, 2026-10-10).
 * prompt-motion.com 의 분류(Product UI · Phone)에서 빈칸을 찾아 새로 만든 것 — 그곳 영상 · 프롬프트를 옮긴 것은 아니다.
 *  - 모두 DOM 견본: 280×175 무대(lib/stage.ts)에 HTML · CSS 로 꾸미고 transform · opacity 만 바꾼다.
 *  - 상태는 되도록 「주기 안에서 지금 몇 초째(p)」에서 바로 계산 — 이음새 없이 돌고, 탭을 오래 숨겨도 꼬이지 않게.
 */

/* ═════════ i548 공유 요소 전환 (FLIP) ═════════ */
const i548 = {
  kind: 'dom' as const,
  caption: '카드를 누르면 그림 · 제목이 제자리에서 커져 상세 화면이 돼요 — 처음 · 끝 위치를 재고, 거꾸로 돌려 놓은 뒤 풀어 주는 FLIP',
  make(box: HTMLElement) {
    const o = { s: 1, flip: true, bounce: 0.5 };
    const NAMES = ['별 모으기', '주사위 굴리기', '숫자 야구', '용 둥지', '얼음 별', '블록 쌓기'];
    const COL = [['#ffb547', '#ff6a3d'], ['#5ad1ff', '#3a6bff'], ['#7be08a', '#1fa36b'], ['#c08bff', '#6a3dff'], ['#9ff0ff', '#4aa8d8'], ['#ff8fb1', '#e2457a']];
    const ORDER = [4, 0, 2, 5, 1, 3];
    const gx = (i: number): number => 12 + (i % 3) * 88;
    const gy = (i: number): number => 26 + Math.floor(i / 3) * 74;
    let h = '<div class="mc48-hd">게임 고르기</div>';
    for (let i = 0; i < 6; i++) h += `<div class="mc48-cd" style="left:${gx(i)}px;top:${gy(i)}px"></div>`;
    for (let i = 0; i < 6; i++) {
      const c = COL[i]!;
      h += `<div class="mc48-th" style="background:radial-gradient(ellipse 22% 34% at 72% 40%,rgba(255,255,255,.55) 96%,transparent 100%),radial-gradient(ellipse 11% 18% at 28% 68%,rgba(255,255,255,.32) 96%,transparent 100%),linear-gradient(135deg,${c[0]},${c[1]})"></div>`;
    }
    for (let i = 0; i < 6; i++) h += `<div class="mc48-ti">${NAMES[i]}</div>`;
    h += '<div class="mc48-d mc48-bk">← 목록</div><div class="mc48-d mc48-l" style="top:124px;width:210px"></div><div class="mc48-d mc48-l" style="top:134px;width:150px"></div><div class="mc48-d mc48-go">시작하기</div><div class="mc48-tap"></div>';
    const S = stage(
      box,
      `.mc48-hd{position:absolute;left:12px;top:7px;font:800 10px ${F};color:#1d2b4f}
      .mc48-cd{position:absolute;width:80px;height:68px;border-radius:9px;background:#fff;box-shadow:0 2px 6px rgba(30,50,110,.15)}
      .mc48-th{position:absolute;transform-origin:0 0}
      .mc48-ti{position:absolute;font-weight:800;font-family:${F};color:#1d2b4f;white-space:nowrap;line-height:1.2;transform-origin:0 0}
      .mc48-d{position:absolute;opacity:0;z-index:6}
      .mc48-bk{left:8px;top:8px;padding:2px 7px;border-radius:9px;background:rgba(0,0,0,.35);color:#fff;font:700 8px ${F}}
      .mc48-l{left:14px;height:5px;border-radius:3px;background:#d5dcef}
      .mc48-go{left:14px;top:147px;width:72px;height:18px;border-radius:9px;background:#3a6bff;color:#fff;font:800 8.5px/18px ${F};text-align:center}
      .mc48-tap{position:absolute;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;border:2px solid #3a6bff;background:rgba(58,107,255,.18);opacity:0;z-index:9;box-sizing:border-box}`,
      h,
      '#eef2fb',
    );
    const q = (s: string): HTMLElement[] => [...S.st.querySelectorAll<HTMLElement>(s)];
    const cd = q('.mc48-cd');
    const th = q('.mc48-th');
    const ti = q('.mc48-ti');
    const det = q('.mc48-d');
    const tap = S.st.querySelector<HTMLElement>('.mc48-tap')!;
    const dv = det.map(() => 0);

    function setLayout(i: number, open: boolean): void {
      const a = th[i]!.style;
      const b = ti[i]!.style;
      if (open) {
        a.left = '0px'; a.top = '0px'; a.width = '280px'; a.height = '88px'; a.borderRadius = '0px';
        b.left = '14px'; b.top = '97px'; b.fontSize = '16px';
      } else {
        a.left = `${gx(i) + 4}px`; a.top = `${gy(i) + 4}px`; a.width = '72px'; a.height = '42px'; a.borderRadius = '6px';
        b.left = `${gx(i) + 6}px`; b.top = `${gy(i) + 51}px`; b.fontSize = '9px';
      }
    }
    for (let i = 0; i < 6; i++) setLayout(i, false);

    // ── FLIP: First(처음 재기) → Last(바꾸고 다시 재기) → Invert(거꾸로 돌려 놓기) → Play(풀어 주기)
    const R = (e: HTMLElement): number[] => [e.offsetLeft, e.offsetTop, e.offsetWidth, e.offsetHeight];
    let an: { i: number; t0: number; dur: number; a: number[]; b: number[] } | null = null;
    let cur = -1;
    let openT = 0;
    let tt = 0;
    let fd = 0;
    function finish(): void {
      if (!an) return;
      th[an.i]!.style.transform = ti[an.i]!.style.transform = '';
      th[an.i]!.style.zIndex = ti[an.i]!.style.zIndex = an.i === cur ? '5' : '';
      an = null;
    }
    function go(i: number, open: boolean): void {
      finish();
      const f1 = R(th[i]!);
      const f2 = R(ti[i]!);
      setLayout(i, open);
      const l1 = R(th[i]!);
      const l2 = R(ti[i]!);
      th[i]!.style.zIndex = ti[i]!.style.zIndex = open ? '5' : '4';
      if (!o.flip) {
        th[i]!.style.zIndex = ti[i]!.style.zIndex = open ? '5' : '';
        return;
      }
      const sT = f2[3]! / l2[3]!; // 글자는 같은 배율로 — 가로세로 따로 늘리면 찌그러진다
      an = { i, t0: tt, dur: open ? 0.75 : 0.6, a: [f1[0]! - l1[0]!, f1[1]! - l1[1]!, f1[2]! / l1[2]!, f1[3]! / l1[3]!], b: [f2[0]! - l2[0]!, f2[1]! - l2[1]!, sT, sT] };
    }
    const spring = (k: number): number => {
      if (k >= 1) return 1;
      const w = 7 + o.bounce * 9;
      const d = 8 - o.bounce * 4;
      return 1 - Math.exp(-d * k) * Math.cos(w * k) * (1 - k * k * k);
    };
    const put = (e: HTMLElement, v: number[], k: number): void => {
      e.style.transform = `translate(${(v[0]! * (1 - k)).toFixed(2)}px,${(v[1]! * (1 - k)).toFixed(2)}px) scale(${lerp(v[2]!, 1, k).toFixed(4)},${lerp(v[3]!, 1, k).toFixed(4)})`;
    };

    return {
      controls: [
        speedCtl(o),
        { type: 'toggle', label: 'FLIP 로 이어 주기 (끄면 뚝 바뀜)', value: true, on: (v: boolean) => (o.flip = v) },
        { type: 'range', label: '스프링 출렁임', min: 0, max: 1, step: 0.05, value: 0.5, on: (v: number) => (o.bounce = v) },
      ] as Control[],
      update(_t: number, dt: number) {
        const d = Math.max(0, Math.min(dt, 0.1)) * o.s;
        tt += d;
        const T = 5.6;
        const c = Math.floor(tt / T);
        const p = tt - c * T;
        const sel = ORDER[c % 6]!;
        const want = p >= 1.25 && p < 4.1 ? sel : -1;
        if (want !== cur) {
          const prev = cur;
          cur = want;
          if (prev >= 0) go(prev, false);
          if (want >= 0) {
            go(want, true);
            openT = tt;
          }
        }
        if (an) {
          const k = (tt - an.t0) / an.dur;
          if (k >= 1) finish();
          else {
            const e = spring(k);
            put(th[an.i]!, an.a, e);
            put(ti[an.i]!, an.b, e);
          }
        }
        // 나머지 카드는 물러나고, 상세 내용은 차례로
        fd += ((cur >= 0 ? 1 : 0) - fd) * (1 - Math.exp(-d * 12));
        const hero = cur >= 0 ? cur : an ? an.i : -1;
        for (let j = 0; j < 6; j++) {
          const op = (1 - fd).toFixed(3);
          cd[j]!.style.opacity = op;
          cd[j]!.style.transform = `scale(${(1 - 0.05 * fd).toFixed(4)})`;
          if (j !== hero) th[j]!.style.opacity = ti[j]!.style.opacity = op;
          else th[j]!.style.opacity = ti[j]!.style.opacity = '1';
        }
        det.forEach((e, j) => {
          const v = cur >= 0 ? outCubic(seg(tt - openT, 0.3 + 0.07 * j, 0.62 + 0.07 * j)) : Math.max(0, dv[j]! - d * 8);
          dv[j] = v;
          e.style.opacity = v.toFixed(3);
          e.style.transform = `translateY(${((1 - v) * 6).toFixed(2)}px)`;
        });
        // 누르는 손가락 자리 — 카드를 누르고, 「← 목록」을 누른다
        const tap1 = seg(p, 0.6, 0.8) * (1 - seg(p, 1.18, 1.32));
        const tap2 = seg(p, 3.45, 3.65) * (1 - seg(p, 4.03, 4.17));
        const on1 = tap1 > 0;
        const tp = on1 ? p - 1.05 : p - 3.9;
        const sc = 1 - 0.3 * seg(tp, 0, 0.1) + 0.9 * seg(tp, 0.1, 0.27);
        tap.style.opacity = Math.max(tap1, tap2).toFixed(3);
        tap.style.transform = on1 ? `translate(${gx(sel) + 40}px,${gy(sel) + 30}px) scale(${sc.toFixed(3)})` : `translate(30px,15px) scale(${sc.toFixed(3)})`;
      },
      dispose() {
        S.dispose();
      },
    };
  },
};

/* ═════════ i549 가짜 커서 UI 시연 (커서 대본 · 클릭 물결 · 따라가는 확대) ═════════ */
const i549 = {
  kind: 'dom' as const,
  caption: '대본대로 움직이는 가짜 커서 — 곡선으로 가서 잠깐 멈추고 딸깍(눌림 · 물결), 화면은 커서를 따라 확대돼요',
  make(box: HTMLElement) {
    const o = { s: 1, zoom: true };
    const ITEMS = [['빛나는 검', '120', '#ffb547'], ['나무 방패', '80', '#b07a4a'], ['회복 물약', '30', '#ff5c8a']];
    let rows = '';
    ITEMS.forEach((it, k) => {
      const y = 32 + k * 28;
      rows += `<div class="mc49-row" style="top:${y}px"><i style="background:${it[2]}"></i><span>${it[0]}</span><em>${it[1]} G</em></div><div class="mc49-btn" style="top:${y + 3}px">담기</div>`;
    });
    const S = stage(
      box,
      `.mc49-cam{position:absolute;left:0;top:0;width:280px;height:175px;transform-origin:0 0}
      .mc49-w{position:absolute;left:20px;top:12px;width:240px;height:150px;border-radius:10px;background:#fff;box-shadow:0 6px 20px rgba(0,0,0,.35);overflow:hidden;font-family:${F}}
      .mc49-hd{position:absolute;left:0;top:0;right:0;height:24px;background:#f2f4fa;border-bottom:1px solid #e3e7f2;font:800 9.5px/24px ${F};color:#1d2b4f;padding-left:12px}
      .mc49-cart{position:absolute;left:212px;top:6px;width:18px;height:13px}
      .mc49-bd{position:absolute;left:224px;top:2px;min-width:12px;height:12px;border-radius:6px;background:#ff3d5a;color:#fff;font:800 8px/12px ${F};text-align:center;opacity:0}
      .mc49-row{position:absolute;left:10px;width:220px;height:24px;font-size:9px;color:#1d2b4f}
      .mc49-row i{position:absolute;left:0;top:3px;width:18px;height:18px;border-radius:5px}
      .mc49-row span{position:absolute;left:26px;top:5px;font-weight:800}
      .mc49-row em{position:absolute;left:120px;top:5px;font-style:normal;color:#7a86a8;font-weight:700}
      .mc49-btn{position:absolute;left:186px;width:44px;height:18px;border-radius:9px;background:#e8eeff;color:#3a6bff;font:800 8.5px/18px ${F};text-align:center}
      .mc49-btn.hv,.mc49-buy.hv{filter:brightness(.93)}
      .mc49-buy{position:absolute;left:10px;top:120px;width:220px;height:22px;border-radius:11px;background:#3a6bff;color:#fff;font:800 9.5px/22px ${F};text-align:center}
      .mc49-fly{position:absolute;left:0;top:0;width:7px;height:7px;margin:-3.5px;border-radius:50%;background:#ff3d5a;opacity:0}
      .mc49-toast{position:absolute;left:90px;top:96px;width:100px;height:20px;border-radius:10px;background:#1d2b4f;color:#fff;font:800 9px/20px ${F};text-align:center;opacity:0}
      .mc49-rp{position:absolute;left:0;top:0;width:30px;height:30px;margin:-15px;border-radius:50%;border:2px solid #ffd23f;opacity:0;box-sizing:border-box}
      .mc49-cu{position:absolute;left:0;top:0;width:12px;height:17px;transform-origin:0 0;filter:drop-shadow(0 1px 1px rgba(0,0,0,.4))}`,
      `<div class="mc49-cam"><div class="mc49-w"><div class="mc49-hd">아이템 상점</div>
        <svg class="mc49-cart" viewBox="0 0 18 13"><path d="M0 1h3l2 8h10l2-6H4.5" fill="none" stroke="#1d2b4f" stroke-width="1.6" stroke-linejoin="round"/><circle cx="6.5" cy="11.5" r="1.3" fill="#1d2b4f"/><circle cx="13.5" cy="11.5" r="1.3" fill="#1d2b4f"/></svg>
        <div class="mc49-bd">0</div>${rows}<div class="mc49-buy">구매하기</div><div class="mc49-toast">구매 완료!</div></div>
        <div class="mc49-fly"></div><div class="mc49-rp"></div>
        <svg class="mc49-cu" viewBox="-1 -1 12 17"><path d="M0 0 L0 13 L3.5 10 L6 15.5 L8 14.6 L5.6 9.4 L10 9.4 Z" fill="#fff" stroke="#111" stroke-width="1" stroke-linejoin="round"/></svg></div>`,
      'linear-gradient(#20305f,#0f1733)',
    );
    const $ = (s: string): HTMLElement => S.st.querySelector<HTMLElement>(s)!;
    const cam = $('.mc49-cam');
    const cu = $('.mc49-cu');
    const rp = $('.mc49-rp');
    const fly = $('.mc49-fly');
    const bd = $('.mc49-bd');
    const toast = $('.mc49-toast');
    const btns = [...S.st.querySelectorAll<HTMLElement>('.mc49-btn')];
    const buy = $('.mc49-buy');

    // 대본 — 무대 좌표 (창 안 단추 가운데)
    type P2 = [number, number];
    const REST: P2 = [262, 166];
    const B = (k: number): P2 => [228, 56 + 28 * k];
    const BUY: P2 = [140, 143];
    const CART: P2 = [241, 25];
    const MOVES: [number, number, P2, P2][] = [
      [0.25, 1.0, REST, B(0)],
      [1.35, 1.95, B(0), B(2)],
      [2.3, 2.95, B(2), BUY],
      [4.2, 4.9, BUY, REST],
    ];
    const ADDS: [number, number][] = [[1.15, 0], [2.1, 2]];
    const BUY_T = 3.1;
    const CLICKS = [1.15, 2.1, BUY_T];
    const T = 5.6;
    let tt = 0;
    let z = 1;
    let fx = 140;
    let fy = 87;

    function cursorAt(p: number): P2 {
      let pos: P2 = REST;
      for (const [t0, t1, a, b] of MOVES) {
        if (p < t0) break;
        const k = inOut(seg(p, t0, t1));
        // 곧은 줄 대신 살짝 휜 길 — 사람 손은 호를 그린다
        const nx = -(b[1] - a[1]);
        const ny = b[0] - a[0];
        const nl = Math.hypot(nx, ny) || 1;
        const arc = Math.sin(Math.PI * k) * 10;
        pos = [lerp(a[0], b[0], k) + (nx / nl) * arc, lerp(a[1], b[1], k) + (ny / nl) * arc];
      }
      return pos;
    }

    return {
      controls: [speedCtl(o), { type: 'toggle', label: '커서 따라 확대', value: true, on: (v: boolean) => (o.zoom = v) }] as Control[],
      update(_t: number, dt: number) {
        const d = Math.max(0, Math.min(dt, 0.1)) * o.s;
        tt += d;
        const p = tt % T;
        const [x, y] = cursorAt(p);
        // 딸깍 — 가장 최근 클릭
        let lc = -1;
        for (const c of CLICKS) if (p >= c) lc = c;
        const since = lc < 0 ? 9 : p - lc;
        const press = since < 0.14;
        cu.style.transform = `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) scale(${press ? 0.82 : 1})`;
        const rk = clamp01(since / 0.5);
        rp.style.opacity = since < 0.5 ? (1 - rk).toFixed(3) : '0';
        if (lc >= 0) rp.style.transform = `translate(${cursorAt(lc)[0].toFixed(1)}px,${cursorAt(lc)[1].toFixed(1)}px) scale(${(0.3 + rk * 1.2).toFixed(3)})`;
        // 단추: 커서가 올라가면 진하게, 누르면 꾹
        btns.forEach((b, k) => {
          const [bx, by] = B(k);
          b.classList.toggle('hv', Math.abs(x - bx) < 22 && Math.abs(y - by) < 9);
          b.style.transform = press && lc !== BUY_T && Math.abs(cursorAt(lc)[1] - by) < 2 ? 'translateY(1px) scale(.94)' : '';
        });
        buy.classList.toggle('hv', Math.abs(x - BUY[0]) < 110 && Math.abs(y - BUY[1]) < 11);
        buy.style.transform = press && lc === BUY_T ? 'translateY(1px) scale(.97)' : '';
        // 담기 → 점이 곡선으로 장바구니에 들어가고 배지가 통
        let count = 0;
        let arr = -9;
        fly.style.opacity = '0';
        for (const [c, k] of ADDS) {
          const f = seg(p, c, c + 0.5);
          if (f > 0 && f < 1) {
            const [bx, by] = B(k);
            const e = inOut(f);
            fly.style.opacity = '1';
            fly.style.transform = `translate(${lerp(bx, CART[0], e).toFixed(1)}px,${(lerp(by, CART[1], e) - Math.sin(Math.PI * e) * 22).toFixed(1)}px)`;
          }
          if (p >= c + 0.5) {
            count++;
            arr = c + 0.5;
          }
        }
        if (p >= BUY_T + 0.15) count = 0;
        const bump = 1 + 0.6 * Math.pow(Math.max(0, 1 - (p - arr) / 0.3), 2);
        bd.textContent = String(count);
        bd.style.opacity = count > 0 ? '1' : '0';
        bd.style.transform = `scale(${bump.toFixed(3)})`;
        const ta = outBack(seg(p, BUY_T + 0.15, BUY_T + 0.5)) * (1 - inOut(seg(p, 4.4, 4.7)));
        toast.style.opacity = clamp01(ta).toFixed(3);
        toast.style.transform = `translateY(${((1 - ta) * 14).toFixed(2)}px)`;
        // 따라가는 확대 — 누르기 직전에 다가가고 누른 뒤엔 물러나 결과(배지 · 알림)를 보여 줌.
        // 목표 배율 · 초점을 부드럽게 따라가고, 화면 밖이 보이지 않게 가두기
        const zt = o.zoom && CLICKS.some((c) => p > c - 0.45 && p < c + 0.2) ? 1.35 : 1;
        const kz = 1 - Math.exp(-d * 6);
        z += (zt - z) * kz;
        fx += (x - fx) * (1 - Math.exp(-d * 5));
        fy += (y - fy) * (1 - Math.exp(-d * 5));
        const tx = Math.min(0, Math.max(280 - 280 * z, 140 - fx * z));
        const ty = Math.min(0, Math.max(175 - 175 * z, 87.5 - fy * z));
        cam.style.transform = `translate(${tx.toFixed(2)}px,${ty.toFixed(2)}px) scale(${z.toFixed(4)})`;
      },
      dispose() {
        S.dispose();
      },
    };
  },
};

/* ═════════ i550 카드 더미 넘기기 (끌기 · 문턱 · 날려 보내기) ═════════ */
const i550 = {
  kind: 'dom' as const,
  caption: '끌면 기울고 도장이 비치며, 문턱을 넘겨 놓으면 날아가고 뒤 카드가 통 올라와요 — 못 넘기면 스프링으로 제자리',
  make(box: HTMLElement) {
    const o = { s: 1, line: true };
    const CARDS = [['불꽃 여우', '#ff9a4a', '#ff4f6d'], ['얼음 거북', '#8fe3ff', '#3a8bff'], ['번개 새', '#ffe36b', '#ffa424'], ['숲 곰', '#8be07a', '#2e9e5b'], ['바다 고래', '#7fb2ff', '#5a4bff']];
    const S = stage(
      box,
      `.mc50-gg{position:absolute;left:60px;top:9px;width:160px;height:4px;border-radius:2px;background:rgba(255,255,255,.18)}
      .mc50-tk{position:absolute;top:5px;width:2px;height:12px;margin-left:-1px;border-radius:1px;background:rgba(255,255,255,.5)}
      .mc50-dt{position:absolute;left:0;top:7px;width:8px;height:8px;margin-left:-4px;border-radius:50%;background:#fff}
      .mc50-gl{position:absolute;top:6px;font:700 7px ${F};color:rgba(255,255,255,.6)}
      .mc50-c{position:absolute;left:88px;top:26px;width:104px;height:128px;border-radius:12px;background:#fff;box-shadow:0 6px 16px rgba(0,0,0,.28);transform-origin:50% 120%;overflow:hidden;font-family:${F}}
      .mc50-hd{position:absolute;left:0;top:0;right:0;height:72px}
      .mc50-fc{position:absolute;left:32px;top:14px;width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.85)}
      .mc50-fc i{position:absolute;top:15px;width:5px;height:7px;border-radius:3px;background:#1d2b4f}
      .mc50-nm{position:absolute;left:10px;top:78px;font:800 11px ${F};color:#1d2b4f}
      .mc50-no{position:absolute;right:9px;top:80px;font:700 8px ${F};color:#8a94b0}
      .mc50-bar{position:absolute;left:10px;width:84px;height:5px;border-radius:3px;background:#e6eaf4}
      .mc50-bar i{position:absolute;left:0;top:0;bottom:0;border-radius:3px}
      .mc50-st{position:absolute;top:16px;padding:1px 6px;border:2.5px solid;border-radius:6px;font:900 12px ${F};opacity:0}
      .mc50-y{left:8px;color:#1fbf6a;transform:rotate(-14deg)}
      .mc50-n{right:8px;color:#ff4f6d;transform:rotate(14deg)}
      .mc50-f{position:absolute;left:0;top:0;width:18px;height:18px;margin:-9px;border-radius:50%;background:rgba(255,255,255,.55);border:2px solid #fff;opacity:0;z-index:20;box-sizing:border-box}`,
      '<div class="mc50-g"><div class="mc50-gg"></div><div class="mc50-tk" style="left:90px"></div><div class="mc50-tk" style="left:190px"></div><div class="mc50-gl" style="left:22px">← 패스</div><div class="mc50-gl" style="left:226px">좋아요 →</div><div class="mc50-dt"></div></div>' +
        '<div class="mc50-c"></div><div class="mc50-c"></div><div class="mc50-c"></div><div class="mc50-c"></div><div class="mc50-f"></div>',
      'linear-gradient(160deg,#5b3fd0,#25155e)',
    );
    const slots = [...S.st.querySelectorAll<HTMLElement>('.mc50-c')];
    // 문턱 눈금 — 점이 카드 가운데가 옮겨 간 거리, 눈금이 문턱 (±50)
    const gauge = S.st.querySelector<HTMLElement>('.mc50-g')!;
    const ticks = [...S.st.querySelectorAll<HTMLElement>('.mc50-tk')];
    const gdot = S.st.querySelector<HTMLElement>('.mc50-dt')!;
    const finger = S.st.querySelector<HTMLElement>('.mc50-f')!;
    const ids = slots.map(() => -1);
    const fill = (el: HTMLElement, id: number): void => {
      const c = CARDS[id % CARDS.length]!;
      const a = 30 + ((id * 37) % 60);
      const b = 25 + ((id * 53) % 65);
      el.innerHTML = `<div class="mc50-hd" style="background:linear-gradient(135deg,${c[1]},${c[2]})"><div class="mc50-fc"><i style="left:12px"></i><i style="right:12px"></i></div></div>
        <div class="mc50-nm">${c[0]}</div><div class="mc50-no">No.${id + 1}</div>
        <div class="mc50-bar" style="top:100px"><i style="width:${a}%;background:${c[2]}"></i></div>
        <div class="mc50-bar" style="top:112px"><i style="width:${b}%;background:${c[1]}"></i></div>
        <div class="mc50-st mc50-y">좋아요</div><div class="mc50-st mc50-n">패스</div>`;
    };
    let tt = 0;
    return {
      controls: [speedCtl(o), { type: 'toggle', label: '문턱 눈금 보기', value: true, on: (v: boolean) => (o.line = v) }] as Control[],
      update(_t: number, dt: number) {
        tt += Math.max(0, Math.min(dt, 0.1)) * o.s;
        const P = 1.7;
        const n = Math.floor(tt / P);
        const q = tt - n * P;
        const fail = n % 4 === 3; // 네 번에 한 번은 문턱을 못 넘김
        const top = n - Math.floor(n / 4);
        const dir = Math.floor(n / 2) % 2 ? -1 : 1;
        const TH = 50;
        let dx = 0;
        let dy = 0;
        let op = 1;
        let promote = 0;
        let fin = 0;
        if (q > 0.25 && q <= 0.85) {
          const k = inOut(seg(q, 0.25, 0.85));
          dx = dir * (fail ? 34 : 72) * k;
          dy = -4 * Math.sin(Math.PI * k);
          fin = 1;
        } else if (q > 0.85) {
          const s = q - 0.85;
          if (fail) dx = dir * 34 * Math.exp(-7 * s) * Math.cos(11 * s); // 문턱 아래 — 스프링으로 제자리
          else {
            // 놓는 순간의 속도를 이어 받아 가속하며 날아감
            const k = seg(q, 0.85, 1.3);
            dx = dir * (72 + 300 * k * k);
            dy = 40 * k * k;
            op = 1 - seg(q, 1.1, 1.3);
            promote = outBack(k, 1.4);
          }
        }
        if (!promote) promote = 0.2 * Math.min(1, Math.abs(dx) / 72); // 끄는 동안 뒤 카드도 조금 올라옴
        for (let r = 0; r < 4; r++) {
          const el = slots[r]!;
          const id = top + r;
          if (ids[r] !== id) {
            fill(el, id);
            ids[r] = id;
          }
          el.style.zIndex = String(10 - r);
          const st = el.querySelectorAll<HTMLElement>('.mc50-st');
          if (r === 0) {
            el.style.transform = `translate(${dx.toFixed(2)}px,${dy.toFixed(2)}px) rotate(${(dx * 0.13).toFixed(2)}deg)`;
            el.style.opacity = op.toFixed(3);
            st[0]!.style.opacity = clamp01(dx / TH).toFixed(3);
            st[1]!.style.opacity = clamp01(-dx / TH).toFixed(3);
          } else {
            const eff = r - promote;
            el.style.transform = `translateY(${(9 * eff).toFixed(2)}px) scale(${(1 - 0.05 * eff).toFixed(4)})`;
            el.style.opacity = clamp01(3 - eff).toFixed(3);
            st[0]!.style.opacity = st[1]!.style.opacity = '0';
          }
        }
        const over = Math.abs(dx) >= TH && q <= 0.9;
        gauge.style.display = o.line ? '' : 'none';
        ticks.forEach((k) => (k.style.background = over ? '#ffe36b' : ''));
        const gdx = !fail && q > 0.85 ? 0 : dx; // 날아가는 동안은 눈금에서 빼기
        gdot.style.transform = `translateX(${(140 + Math.max(-80, Math.min(80, gdx))).toFixed(1)}px)`;
        gdot.style.background = over ? '#ffe36b' : '';
        finger.style.opacity = (fin * seg(q, 0.25, 0.32)).toFixed(3);
        finger.style.transform = `translate(${(140 + dx).toFixed(1)}px,${(100 + dy).toFixed(1)}px)`;
      },
      dispose() {
        S.dispose();
      },
    };
  },
};

/* ═════════ i551 알림 · 창 등장 묶음 (쌓이는 알림 · 뒤 흐림 창 · 차례 등장) ═════════ */
const i551 = {
  kind: 'dom' as const,
  caption: '알림은 옆에서 밀고 들어와 먼저 온 것을 아래로 밀고, 창은 뒤를 흐리며 통 커진 뒤 내용이 차례로 — 나갈 땐 더 빨리',
  make(box: HTMLElement) {
    const o = { s: 1, stag: 0.08 };
    const TOASTS = [['#ffd23f', '별 3개 얻음'], ['#5ad1ff', '새 기술: 이단 뛰기'], ['#7be08a', '친구가 들어왔어요']];
    const E = [0.3, 0.9, 1.5];
    const LIFE = 2.4;
    let th = '';
    TOASTS.forEach((t) => (th += `<div class="mc51-t"><i style="background:${t[0]}"></i><span>${t[1]}</span><b></b></div>`));
    const S = stage(
      box,
      `.mc51-sky{position:absolute;inset:0;background:linear-gradient(#7fc8ff,#d8f0ff)}
      .mc51-hill{position:absolute;left:-40px;right:-40px;top:118px;height:120px;border-radius:50%;background:#6cc96a}
      .mc51-hill.b{left:120px;right:-120px;top:104px;background:#58b85a}
      .mc51-hero{position:absolute;left:52px;top:96px;width:22px;height:26px;border-radius:8px 8px 6px 6px;background:#ff7a59;box-shadow:inset 0 -5px 0 rgba(0,0,0,.12)}
      .mc51-t{position:absolute;left:150px;top:0;width:122px;height:22px;border-radius:8px;background:rgba(20,28,60,.92);color:#fff;font:700 8.5px/22px ${F};overflow:hidden;opacity:0}
      .mc51-t i{position:absolute;left:7px;top:7px;width:8px;height:8px;border-radius:50%}
      .mc51-t span{position:absolute;left:20px;white-space:nowrap}
      .mc51-t b{position:absolute;left:0;bottom:0;height:2px;background:rgba(255,255,255,.55);transform-origin:0 0;width:100%}
      .mc51-bd{position:absolute;inset:0;background:rgba(10,16,40,.45);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);opacity:0}
      .mc51-m{position:absolute;left:60px;top:28px;width:160px;height:122px;border-radius:14px;background:#fff;box-shadow:0 10px 30px rgba(0,0,0,.35);opacity:0;font-family:${F}}
      .mc51-h{position:absolute;left:0;right:0;top:12px;text-align:center;font:900 15px ${F};color:#ff7a1a}
      .mc51-s{position:absolute;left:0;right:0;top:33px;text-align:center;font:700 8.5px ${F};color:#7a86a8}
      .mc51-r{position:absolute;top:52px;width:40px;height:34px;border-radius:9px;background:#f2f4fa;text-align:center;font:800 7.5px ${F};color:#1d2b4f;opacity:0}
      .mc51-r i{display:block;width:14px;height:14px;margin:4px auto 2px;border-radius:4px}
      .mc51-go{position:absolute;left:40px;top:94px;width:80px;height:20px;border-radius:10px;background:#3a6bff;color:#fff;font:800 9px/20px ${F};text-align:center;opacity:0}
      .mc51-tap{position:absolute;left:140px;top:132px;width:22px;height:22px;margin:-11px;border-radius:50%;border:2px solid #fff;background:rgba(255,255,255,.3);opacity:0;box-sizing:border-box}`,
      `<div class="mc51-sky"></div><div class="mc51-hill b"></div><div class="mc51-hill"></div><div class="mc51-hero"></div>${th}
      <div class="mc51-bd"></div><div class="mc51-m"><div class="mc51-h">레벨 업!</div><div class="mc51-s">3 → 4 단계</div>
      <div class="mc51-r" style="left:12px"><i style="background:#ffd23f"></i>별 ×3</div><div class="mc51-r" style="left:60px"><i style="background:#c08bff"></i>열쇠 ×1</div><div class="mc51-r" style="left:108px"><i style="background:#ff7a59"></i>새 모자</div>
      <div class="mc51-go">받기</div></div><div class="mc51-tap"></div>`,
      '#bfe6ff',
    );
    const ts = [...S.st.querySelectorAll<HTMLElement>('.mc51-t')];
    const $ = (s: string): HTMLElement => S.st.querySelector<HTMLElement>(s)!;
    const bd = $('.mc51-bd');
    const m = $('.mc51-m');
    const rw = [...S.st.querySelectorAll<HTMLElement>('.mc51-r')];
    const goBtn = $('.mc51-go');
    const tap = $('.mc51-tap');
    let tt = 0;
    return {
      controls: [speedCtl(o), { type: 'range', label: '차례 간격 (stagger, 초)', min: 0, max: 0.2, step: 0.01, value: 0.08, on: (v: number) => (o.stag = v) }] as Control[],
      update(_t: number, dt: number) {
        tt += Math.max(0, Math.min(dt, 0.1)) * o.s;
        const T = 7.6;
        const p = tt % T;
        // 알림 — 「있음」(들어옴 × 안 나감)을 이어진 값으로 두고, 나보다 늦게 온 것들의 있음 합만큼 아래로
        const pres = E.map((e) => outCubic(seg(p, e, e + 0.4)) * (1 - inOut(seg(p, e + LIFE, e + LIFE + 0.3))));
        ts.forEach((el, j) => {
          const e = E[j]!;
          const enter = outBack(seg(p, e, e + 0.45), 1.4);
          const leave = inOut(seg(p, e + LIFE, e + LIFE + 0.3));
          let below = 0;
          for (let k = j + 1; k < ts.length; k++) below += pres[k]!;
          const x = (1 - enter) * 130 + leave * 130;
          el.style.opacity = p >= e ? (1 - leave).toFixed(3) : '0';
          el.style.transform = `translate(${x.toFixed(2)}px,${(8 + 26 * below).toFixed(2)}px)`;
          (el.lastElementChild as HTMLElement).style.transform = `scaleX(${(1 - seg(p, e + 0.45, e + LIFE)).toFixed(4)})`;
        });
        // 창 — 들어올 땐 0.45초 출렁, 나갈 땐 0.18초 (나가는 것은 더 빨리)
        const M0 = 4.1;
        const C0 = 6.7;
        const close = seg(p, C0, C0 + 0.18);
        bd.style.opacity = (seg(p, M0, M0 + 0.3) * (1 - close)).toFixed(3);
        const mk = outBack(seg(p, M0 + 0.05, M0 + 0.5), 1.6);
        m.style.opacity = (seg(p, M0 + 0.05, M0 + 0.25) * (1 - close)).toFixed(3);
        m.style.transform = `scale(${((0.8 + 0.2 * mk) * (1 - 0.06 * close)).toFixed(4)})`;
        rw.forEach((r, j) => {
          const a0 = M0 + 0.3 + j * o.stag;
          const k = outBack(seg(p, a0, a0 + 0.35), 2.2);
          r.style.opacity = clamp01(k * 2).toFixed(3);
          r.style.transform = `translateY(${((1 - k) * 8).toFixed(2)}px) scale(${(0.6 + 0.4 * k).toFixed(4)})`;
        });
        const g0 = M0 + 0.4 + 3 * o.stag;
        const gk = outBack(seg(p, g0, g0 + 0.35));
        const pressed = p > 6.45 && p < 6.62;
        const pulse = p > g0 + 0.5 && p < 6.4 ? 1 + 0.04 * Math.sin((p - g0) * 7) : 1;
        goBtn.style.opacity = clamp01(gk * 2).toFixed(3);
        goBtn.style.transform = `scale(${((0.7 + 0.3 * gk) * pulse * (pressed ? 0.93 : 1)).toFixed(4)})`;
        tap.style.opacity = (seg(p, 6.1, 6.3) * (1 - seg(p, 6.6, 6.75))).toFixed(3);
        tap.style.transform = `scale(${pressed ? 0.75 : 1})`;
      },
      dispose() {
        S.dispose();
      },
    };
  },
};

export const DEMOS: DemoMap = { i548, i549, i550, i551 };

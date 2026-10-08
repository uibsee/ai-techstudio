import type { Control, Demo, DemoMap } from './types';
import { SFX_PACK } from './sfxPack';
import { DEMOS as SFX } from './demosSfx';

/**
 * 효과음 합성 견본판 (i499) — 코드로 합성한 효과음 70가지를 분류(게임 · 화면 · 전투 · 마법 · 자연 · 생활)별로 골라 듣기.
 * 소리 하나하나는 「기술」이 아니라 같은 기술(파일 없이 합성)로 만든 견본이라 목록에서는 하나로 묶었다.
 * 각 소리 그림 · 합성 코드는 demosSfx.ts 의 견본 + sfxPack.ts 의 추가 묶음을 그대로 띄운다.
 */
const BASE: [string, string, string][] = [
  ['게임', 'i128', '동전 · 줍기'],
  ['게임', 'i129', '점프'],
  ['게임', 'i133', '파워업'],
  ['화면', 'i134', '고르기'],
  ['화면', 'i135', '단추 클릭'],
  ['화면', 'i136', '호버 째깍'],
  ['화면', 'i137', '켜기 · 끄기'],
  ['화면', 'i138', '오류 버저'],
  ['화면', 'i139', '성공 차임'],
  ['화면', 'i144', '숫자 올라가기'],
  ['전투', 'i130', '레이저'],
  ['전투', 'i131', '폭발'],
  ['전투', 'i132', '맞음'],
  ['전투', 'i140', '휙'],
  ['전투', 'i149', '저음 쿵'],
  ['자연', 'i150', '비 · 바람 · 불 · 물'],
  ['자연', 'i151', '거품 · 물방울'],
  ['생활', 'i146', '발소리'],
  ['생활', 'i152', '구르는 공 · 주사위'],
  ['생활', 'i153', '카드 뒤집기'],
  ['생활', 'i154', '동전 더미'],
  ['생활', 'i155', '기계 윙윙'],
];
const CATS = ['게임', '화면', '전투', '마법', '자연', '생활'];
/** 모든 소리: 분류 순서대로 (기존 22 + 추가 묶음) */
const LIST: { cat: string; name: string; demo: Demo | undefined }[] = CATS.flatMap((c) => [
  ...BASE.filter((x) => x[0] === c).map(([cat, id, name]) => ({ cat, name, demo: SFX[id] })),
  ...SFX_PACK.filter((x) => x.cat === c).map((x) => ({ cat: x.cat, name: x.name, demo: x.demo as Demo })),
]);
const FONT = '"Pretendard Variable", Pretendard, system-ui, sans-serif';

type Sub = {
  update?(t: number, dt: number): void;
  draw?(g: CanvasRenderingContext2D, w: number, h: number, t: number, dt: number): void;
  controls?: Control[];
  dispose?(): void;
};

export const DEMOS: DemoMap = {
  i499: {
    kind: 'dom',
    caption: `파일 없이 코드로 합성한 효과음 ${LIST.length}가지 — 분류를 고르고 소리를 눌러 듣기`,
    make(box) {
      box.innerHTML = '';
      box.style.cssText += ';position:relative;overflow:hidden;background:#0d1024;font-family:' + FONT;
      const wide = (): boolean => box.clientWidth >= 480;
      const tabs = document.createElement('div');
      tabs.style.cssText = 'position:absolute;left:0;right:0;top:0;display:flex;flex-wrap:wrap;gap:4px;padding:8px;z-index:2';
      const stage = document.createElement('div');
      stage.style.cssText = 'position:absolute;left:0;right:0;bottom:0;top:0';
      const bar = document.createElement('div');
      bar.style.cssText = 'position:absolute;right:8px;bottom:8px;display:flex;gap:6px;z-index:2';
      const label = document.createElement('div');
      label.style.cssText = 'position:absolute;left:10px;bottom:8px;z-index:2;color:#e7eaff;font-size:12px;font-weight:700;background:rgba(0,0,0,.45);padding:3px 9px;border-radius:999px';
      box.append(stage, tabs, bar, label);

      let idx = 0;
      let sub: Sub | null = null;
      let canvas: HTMLCanvasElement | null = null;
      let ctx: CanvasRenderingContext2D | null = null;
      let autoT = 0;
      let touched = false;

      const btnCss = (on: boolean): string =>
        'border:1px solid ' + (on ? '#f5c451' : 'rgba(255,255,255,.18)') + ';background:' + (on ? 'rgba(245,196,81,.18)' : 'rgba(255,255,255,.06)') +
        ';color:' + (on ? '#ffe6a3' : '#cfd5f5') + ';border-radius:8px;padding:4px 8px;font:600 12px ' + FONT + ';cursor:pointer';

      const renderTabs = (): void => {
        tabs.innerHTML = '';
        tabs.style.display = wide() ? 'flex' : 'none';
        const cur = LIST[idx]!.cat;
        // 첫 줄: 분류 (누르면 그 분류의 첫 소리)
        const row1 = document.createElement('div');
        row1.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;width:100%';
        for (const c of CATS) {
          const n = LIST.filter((x) => x.cat === c).length;
          const b = document.createElement('button');
          b.textContent = `${c} ${n}`;
          b.style.cssText = btnCss(c === cur) + ';font-weight:800';
          b.onclick = () => {
            touched = true;
            pick(LIST.findIndex((x) => x.cat === c));
            play();
          };
          row1.appendChild(b);
        }
        // 둘째 줄: 그 분류의 소리들
        const row2 = document.createElement('div');
        row2.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;width:100%';
        LIST.forEach((x, i) => {
          if (x.cat !== cur) return;
          const b = document.createElement('button');
          b.textContent = x.name;
          b.style.cssText = btnCss(i === idx);
          b.onclick = () => {
            touched = true;
            pick(i);
            play();
          };
          row2.appendChild(b);
        });
        tabs.append(row1, row2);
        stage.style.top = wide() ? `${tabs.offsetHeight || 64}px` : '0';
      };
      const renderBar = (): void => {
        bar.innerHTML = '';
        if (!wide() || !sub?.controls) return;
        for (const c of sub.controls) {
          if (c.type !== 'button') continue;
          const b = document.createElement('button');
          b.textContent = c.label;
          b.style.cssText = btnCss(false);
          b.onclick = () => {
            touched = true;
            c.on();
          };
          bar.appendChild(b);
        }
      };
      const play = (): void => {
        const c = sub?.controls?.find((x) => x.type === 'button');
        if (c && c.type === 'button') c.on();
      };
      const pick = (i: number): void => {
        idx = (i + LIST.length) % LIST.length;
        sub?.dispose?.();
        sub = null;
        stage.innerHTML = '';
        canvas = null;
        ctx = null;
        const it = LIST[idx]!;
        label.textContent = `${idx + 1} / ${LIST.length} · ${it.cat} › ${it.name}`;
        const d = it.demo;
        if (d && d.kind === '2d') {
          const m = d.make();
          canvas = document.createElement('canvas');
          canvas.style.cssText = 'width:100%;height:100%;display:block';
          stage.appendChild(canvas);
          ctx = canvas.getContext('2d');
          sub = { draw: m.draw, controls: m.controls, dispose: m.dispose };
        } else if (d && d.kind === 'dom') {
          const host = document.createElement('div');
          host.style.cssText = 'position:absolute;inset:0';
          stage.appendChild(host);
          const m = d.make(host);
          sub = { update: m.update, controls: m.controls, dispose: m.dispose };
        }
        renderTabs();
        renderBar();
      };
      pick(0);
      let lastWide = wide();

      return {
        controls: [
          { type: 'button', label: '▶ 지금 소리 듣기', on: () => play() },
          { type: 'button', label: '다음 소리', on: () => { touched = true; pick(idx + 1); } },
          { type: 'toggle', label: '저절로 넘기기', value: true, on: (v) => { touched = !v; } },
        ],
        update(t, dt) {
          if (wide() !== lastWide) {
            lastWide = wide();
            renderTabs();
            renderBar();
          }
          if (!touched) {
            autoT += dt;
            if (autoT > 3.2) {
              autoT = 0;
              pick(idx + 1);
            }
          }
          if (canvas && ctx && sub?.draw) {
            const w = stage.clientWidth;
            const h = stage.clientHeight;
            if (w < 2 || h < 2) return;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
              canvas.width = Math.round(w * dpr);
              canvas.height = Math.round(h * dpr);
            }
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            sub.draw(ctx, w, h, t, dt);
          } else sub?.update?.(t, dt);
        },
        dispose() {
          sub?.dispose?.();
          sub = null;
          box.innerHTML = '';
        },
      };
    },
  },
};

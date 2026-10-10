/**
 * DOM 견본용 280×175 무대 — HTML · CSS 로 꾸민 화면을 상자 크기에 맞춰 통째로 늘리고 줄인다 (transform scale).
 * 안쪽 배치는 늘 280×175 기준이라 offsetLeft · offsetWidth 같은 배치 값도 이 단위로 읽힌다 (FLIP 측정에 씀).
 * 모션 그래픽 견본 C · D (제품 UI · 흐름도 · 코드) 가 같이 쓴다.
 */
export const SW = 280;
export const SH = 175;
export const F = '"Pretendard Variable", Pretendard, system-ui, sans-serif';
export const MONO = 'ui-monospace, "JetBrains Mono", "Cascadia Mono", Consolas, Menlo, monospace';

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
/** a ~ b 구간에서 0 → 1 */
export const seg = (p: number, a: number, b: number): number => clamp01((p - a) / (b - a));
export const outCubic = (x: number): number => 1 - Math.pow(1 - clamp01(x), 3);
export const inOut = (x: number): number => {
  const v = clamp01(x);
  return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
};
export const outBack = (x: number, s = 1.7): number => {
  const v = clamp01(x) - 1;
  return 1 + (s + 1) * v * v * v + s * v * v;
};
export const hsh = (n: number): number => {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
};
export const speedCtl = (o: { s: number }, label = '속도') => ({ type: 'range' as const, label, min: 0.25, max: 2, step: 0.05, value: 1, on: (v: number) => (o.s = v) });

/** 무대 만들기 — bg 는 상자 전체(무대 밖 여백까지) 바탕 */
export function stage(box: HTMLElement, css: string, html: string, bg: string): { root: HTMLElement; st: HTMLElement; dispose(): void } {
  const root = document.createElement('div');
  root.style.cssText = `position:absolute;inset:0;overflow:hidden;background:${bg}`;
  root.innerHTML = `<style>${css}</style><div style="position:absolute;left:0;top:0;width:${SW}px;height:${SH}px;transform-origin:0 0">${html}</div>`;
  box.appendChild(root);
  const st = root.lastElementChild as HTMLElement;
  const fit = (): void => {
    const w = box.clientWidth;
    const h = box.clientHeight;
    if (!w || !h) return;
    const u = Math.min(w / SW, h / SH);
    st.style.transform = `translate(${((w - SW * u) / 2).toFixed(1)}px,${((h - SH * u) / 2).toFixed(1)}px) scale(${u.toFixed(4)})`;
  };
  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(box);
  return {
    root,
    st,
    dispose() {
      ro.disconnect();
      root.remove();
    },
  };
}

export const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

import { LABS } from './labs';

/**
 * 특별 무대 목록 (#labs) — 기술 하나를 깊게 보는 무대들.
 * 예전 「실전 무대」(수학 놀이터 게임을 같은 출처 iframe 으로 띄워 조절판을 걸던 칸)는 스튜디오를 따로 떼면서 뺐다 (2026-10-08).
 */
export function viewPlayList(main: HTMLElement): () => void {
  main.insertAdjacentHTML(
    'beforeend',
    `<div class="crumbs"><a href="#home">홈</a><span>›</span>특별 무대</div>
     <header class="page-head"><div><h1>특별 무대 <span class="dim">${LABS.length}</span></h1>
     <p>기술 하나를 실제 무대 위에서 깊게 — 켜고 끄며 비교해 봐요.</p></div></header>
     <section class="labs">${LABS.map((l) => `<a class="lab" href="#lab/${l.id}"><h3>${l.title}</h3><p>${l.sub}</p><span>${l.games.join(' · ')}</span></a>`).join('')}</section>`,
  );
  return () => {};
}

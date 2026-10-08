import '@/game/games/numbaseball/ballfx.css';
import { TECH } from './catalog';
import { h } from './hub';
import './studio.css';
import { viewRefs } from './refs';
import { viewConnect } from './connect';
import { viewCart, viewRecipe, viewRecipes } from './docs/pages';
import { cartList } from './docs/ui';
import { DOMAINS, domainOf, viewBrowse, viewGallery, viewHome, viewResearch, viewTech } from './views';

/**
 * 기술 스튜디오 — 게임 그래픽 · 연출 · 시스템 기술을 움직이는 견본으로 보고, AI 에게 줄 주문서로 가져가는 페이지.
 * 사이트 배포와 따로 (studio.html → 이 파일, vite 빌드는 index.html 만 묶음).
 *
 * 겉틀(2026-10-07, 에셋 스토어처럼): 위 막대(로고 · 검색 · 레시피 · 내 조합) + 분류 한 줄 + 가운데 본문 + 아래 작은 링크.
 * 주소: #home · #all · #d/<분류> · #s/<검색어> · #t/<기술 id> · #fx(효과 모음 — 분류 줄 끝) · #recipes · #recipe/<id> · #mix(내 조합)
 *       #refs(참고 작품) · #connect(AI 연결 안내) — 위 오른쪽 · (아래 링크만) #research
 * 새 기술 = catalog 한 줄 + 견본 하나. 문서는 docs/docs*.ts.
 */

const root = document.getElementById('studio')!;
root.innerHTML = '';
const top = h(
  'header',
  'topbar',
  `<div class="top-in">
     <a class="brand" href="#home"><span class="logo">◆</span><b>기술 스튜디오</b></a>
     <div class="top-search"><input placeholder="기술 · 효과 · 게임 이름으로 찾기" aria-label="기술 찾기" /><div class="top-results"></div></div>
     <nav class="top-links"><a href="#refs">참고 작품</a><a href="#recipes">조합 레시피</a><a class="top-cart" href="#mix" title="여러 기술을 모아 한 장면 주문서로 합치기">내 조합<b>0</b></a><a class="top-ai" href="#connect" title="Claude Code · Codex · Cursor 가 이 사이트의 기술을 직접 찾아 쓰게">AI 연결</a></nav>
   </div>`,
);
const catbar = h(
  'nav',
  'catbar',
  `<div class="top-in"><a data-r="all" href="#all">전체</a>${DOMAINS.map((d) => `<a data-r="d/${d.id}" href="#d/${d.id}">${d.name}</a>`).join('')}<a class="cat-fx" data-r="fx" href="#fx" title="기술이 아니라 기술로 만든 효과를 모아 둔 곳">효과 모음</a></div>`,
);
const main = h('main', 'main');
const foot = h(
  'footer',
  'foot',
  `<div class="top-in"><span>기술 스튜디오</span><nav><a href="#refs">참고 작품</a><a href="#research">연구 노트</a><a href="https://github.com/uibsee/ai-techstudio" target="_blank" rel="noopener">GitHub</a></nav></div>`,
);
const scroller = h('div', 'scroller');
scroller.append(main, foot);
root.append(top, catbar, scroller);

/* 내 조합 숫자 */
const cartCount = (): void => {
  const n = String(cartList().length);
  top.querySelector('.top-cart b')!.textContent = n;
  top.querySelector('.top-cart')!.classList.toggle('has', n !== '0');
};
cartCount();
window.addEventListener('studio-cart', cartCount);

/* 위 검색 — 쓰는 동안 바로 가기 8개, Enter 는 검색 결과 화면 */
const input = top.querySelector<HTMLInputElement>('.top-search input')!;
const results = top.querySelector<HTMLElement>('.top-results')!;
const clear = (): void => {
  input.value = '';
  results.innerHTML = '';
};
input.oninput = () => {
  const q = input.value.trim().toLowerCase();
  if (!q) {
    results.innerHTML = '';
    return;
  }
  const hit = TECH.filter((x) => `${x.name} ${x.desc} ${x.where} ${x.cat}`.toLowerCase().includes(q));
  results.innerHTML = hit.length
    ? hit
        .slice(0, 8)
        .map((x) => `<a href="#t/${x.id}"><b>${x.name}</b><small>${domainOf(x.cat).name} › ${x.of ? '효과 모음' : x.cat}</small></a>`)
        .join('') + (hit.length > 8 ? `<a class="all" href="#s/${encodeURIComponent(input.value.trim())}">결과 ${hit.length}개 모두 보기 →</a>` : '')
    : '<p>찾는 기술이 없어요</p>';
};
input.onkeydown = (e) => {
  if (e.key === 'Enter' && input.value.trim()) {
    location.hash = `s/${encodeURIComponent(input.value.trim())}`;
    clear();
    input.blur();
  }
};
results.onclick = clear;
window.addEventListener('keydown', (e) => {
  const typing = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;
  if (e.key === '/' && !typing) {
    e.preventDefault();
    input.focus();
  }
  if (e.key === 'Escape') {
    clear();
    input.blur();
  }
});

/* 주소 따라 화면 */
let cleanup: (() => void) | null = null;
function route(): void {
  const r = location.hash.slice(1) || 'home';
  cleanup?.();
  cleanup = null;
  main.innerHTML = '';
  scroller.scrollTop = 0;
  const [a, ...rest] = r.split('/');
  const b = rest.join('/');
  // 분류 한 줄에서 지금 자리 표시 (기술 페이지는 그 기술의 분류)
  const t = a === 't' ? TECH.find((x) => x.id === b) : undefined;
  const on = a === 'all' || a === 's' ? 'all' : a === 'fx' ? 'fx' : a === 'd' ? `d/${b}` : t ? `d/${domainOf(t.cat).id}` : '';
  catbar.querySelectorAll<HTMLElement>('a').forEach((n) => n.classList.toggle('on', n.dataset['r'] === on));
  if (a === 'all') cleanup = viewBrowse(main, null);
  else if (a === 's') cleanup = viewBrowse(main, null, decodeURIComponent(b));
  else if (a === 'd' && b) cleanup = viewBrowse(main, b);
  else if (a === 't' && b) cleanup = viewTech(main, b);
  else if (a === 'refs') cleanup = viewRefs(main);
  else if (a === 'research') cleanup = viewResearch(main);
  else if (a === 'connect') cleanup = viewConnect(main);
  else if (a === 'mix' || a === 'cart') cleanup = viewCart(main);
  else if (a === 'fx') cleanup = viewGallery(main);
  else if (a === 'recipes') cleanup = viewRecipes(main);
  else if (a === 'recipe' && b) cleanup = viewRecipe(main, b);
  else cleanup = viewHome(main);
}
window.addEventListener('hashchange', route);
route();

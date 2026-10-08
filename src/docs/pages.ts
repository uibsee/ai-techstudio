import { h, Hub } from '../hub';
import { docOf, pageUrl, techOf } from './index';
import { buildCombined, buildCombinedPack, recipeHead, type Item } from './prompt';
import { RECIPES } from './recipes';
import type { PlatformId, Recipe } from './types';
import { btn, cartAdd, cartClear, cartList, cartMove, cartRemove, copyText, downloadText, esc, fileName, initialOpts, optionChips } from './ui';

/**
 * 새 화면 — 내 조합(#mix) · 조합 레시피 목록(#recipes) · 레시피(#recipe/<id>).
 * 셋 다 「여러 기술 → 한 장면 주문서」 를 만든다 (prompt.ts buildCombined).
 */

const itemsOf = (ids: string[], roles?: Record<string, string>): Item[] =>
  ids.flatMap((id) => {
    const t = techOf(id);
    return t ? [{ t, d: docOf(t).d, role: roles?.[id] }] : [];
  });
const platformsOf = (items: Item[]): PlatformId[] => {
  const all = [...new Set(items.flatMap((x) => x.d.platforms))];
  return all.length ? all : ['three'];
};

/** 합친 주문서 상자 (내 조합 · 레시피 공용). items · head 는 참조 — 바꾼 뒤 redraw() 하면 글만 갈아 끼운다 */
function comboBox(items: Item[], head: { title: string; scene: string; must?: string[]; done?: string[] }, targets: string[], styles: string[], platforms: PlatformId[], extra?: HTMLElement): { el: HTMLElement; redraw: () => void } {
  const box = h('section', 'ai-box');
  box.id = 'ai';
  const o = initialOpts(targets, styles, platforms);
  box.innerHTML = `<header class="ai-head"><div><span class="ai-eyebrow">합친 주문서</span><h2>기술 <span class="ai-n">${items.length}</span>개를 한 장면으로 — 복사해서 AI 에게</h2>
    <p>한 번에 다 만들지 말고 순서대로 쌓아 달라고 적어 두었어요. 단계마다 확인하며 진행하세요.</p></div></header>`;
  const body = h('div', 'ai-body');
  const pre = h('pre', 'ai-prompt');
  pre.tabIndex = 0;
  pre.setAttribute('aria-label', '합친 주문서');
  const draw = (): void => {
    pre.textContent = buildCombined(items, o, head);
    box.querySelector('.ai-n')!.textContent = String(items.length);
  };
  const left = h('div', 'ai-left');
  if (extra) left.appendChild(extra);
  left.appendChild(optionChips(o, targets, styles, platforms, draw));
  draw();
  const acts = h('div', 'ai-acts');
  const pack = (): string => buildCombinedPack(items, o, head);
  acts.append(
    btn('⧉ 합친 프롬프트 복사', 'primary', () => void copyText(pre.textContent ?? '', pre, '합친 프롬프트를 복사했어요')),
    btn('📦 AI 꾸러미 복사', '', () => void copyText(pack(), pre, '꾸러미(주문서 + 기술별 코드 · 실수)를 복사했어요')),
    btn('⬇ .md 내려받기', '', () => downloadText(fileName(head.title), pack())),
  );
  const right = h('div', 'ai-right');
  right.append(pre, acts);
  body.append(left, right);
  box.appendChild(body);
  return { el: box, redraw: draw };
}

/* ───────────── 내 조합 ───────────── */

const CART_TARGETS = ['내 게임 장면', '작은 체험판', '설명 화면'];
const CART_STYLES = ['깔끔한 기본', '귀엽고 아기자기', '어둡고 진지한'];

export function viewCart(main: HTMLElement): () => void {
  main.insertAdjacentHTML(
    'beforeend',
    `<div class="crumbs"><a href="#home">홈</a><span>›</span>내 조합</div>
     <header class="page-head"><div><h1>내 조합</h1><p>여러 기술을 골라 넣으면 <b>한 장면을 만드는 주문서 하나</b>로 합쳐 드려요. 위에서부터 쌓는 순서예요.</p></div></header>`,
  );
  const empty = h(
    'div',
    'cart-empty',
    `<b>아직 넣은 기술이 없어요</b><p>기술 화면의 <span class="chip">＋ 내 조합에 넣기</span> 로 기술을 모으거나, 이미 엮어 둔 <a class="link" href="#recipes">조합 레시피</a>에서 시작해 보세요.</p>
     <div class="chips">${RECIPES.map((r) => `<a class="chip" href="#recipe/${r.id}">${esc(r.title)} →</a>`).join('')}</div>`,
  );
  const wrap = h('div', 'cart-wrap');
  main.append(empty, wrap);

  const items: Item[] = [];
  const head = { title: '내 장면', scene: '' };
  const setScene = (s: string): void => {
    const v = s.trim();
    head.title = v ? v.slice(0, 40) : '내 장면';
    head.scene = v ? `${v} — 대상은 {target}, 분위기는 {style}.` : '{target}을(를) 만들어 줘. 분위기는 {style}.';
  };
  setScene('');
  const sceneIn = h('label', 'scene-in', '<span>만들 장면 <small>(비우면 기본 문장)</small></span>');
  const ta = h('textarea');
  ta.rows = 2;
  ta.placeholder = '예) 횃불을 든 꼬마 기사가 어두운 던전을 걷는 장면';
  sceneIn.appendChild(ta);
  const all = itemsOf(cartList());
  items.push(...all);
  const box = comboBox(items, head, CART_TARGETS, CART_STYLES, platformsOf(all.length ? all : itemsOf(['u01'])), sceneIn);
  ta.oninput = () => {
    setScene(ta.value);
    box.redraw();
  };
  const list = h('ol', 'cart-list');
  const side = h('div', 'cart-side');
  side.append(list, btn('모두 비우기', 'sm ghost', () => cartClear()));
  wrap.append(side, box.el);

  /** 내 조합이 바뀌면 목록 · 주문서 글만 갈아 끼운다 (칩 · 장면 글은 그대로) */
  const sync = (): void => {
    const now = itemsOf(cartList());
    items.length = 0;
    items.push(...now);
    empty.hidden = now.length > 0;
    wrap.hidden = now.length === 0;
    list.innerHTML = '';
    now.forEach((x, i) => {
      const li = h('li', 'cart-item', `<span class="n">${i + 1}</span><div><a href="#t/${x.t.id}">${esc(x.t.name)}</a><small>${esc(x.d.terms[0]?.en ?? x.t.cat)} · ${esc(x.d.summary.slice(0, 80))}</small></div>`);
      const tools = h('div', 'cart-tools');
      const up = btn('↑', 'sm', () => cartMove(x.t.id, -1), '앞으로');
      up.disabled = i === 0;
      up.setAttribute('aria-label', `${x.t.name} 앞으로`);
      const dn = btn('↓', 'sm', () => cartMove(x.t.id, 1), '뒤로');
      dn.disabled = i === now.length - 1;
      dn.setAttribute('aria-label', `${x.t.name} 뒤로`);
      const rm = btn('빼기', 'sm', () => cartRemove(x.t.id));
      rm.setAttribute('aria-label', `${x.t.name} 빼기`);
      tools.append(up, dn, rm);
      li.appendChild(tools);
      list.appendChild(li);
    });
    box.redraw();
  };
  sync();
  window.addEventListener('studio-cart', sync);
  return () => window.removeEventListener('studio-cart', sync);
}

/* ───────────── 레시피 ───────────── */

export function viewRecipes(main: HTMLElement): () => void {
  const hub = new Hub();
  main.insertAdjacentHTML(
    'beforeend',
    `<div class="crumbs"><a href="#home">홈</a><span>›</span>조합 레시피</div>
     <header class="page-head"><div><h1>조합 레시피</h1><p>「이런 장면을 만들고 싶다」에서 시작해요. 완성 장면 견본 · 들어간 기술 · 한 번에 복사하는 합친 주문서가 있어요.</p></div></header>`,
  );
  const g = h('section', 'recipe-grid');
  for (const r of RECIPES) {
    const a = h('a', 'recipe-card');
    a.href = `#recipe/${r.id}`;
    const v = h('div', 'card-view');
    hub.add(v, r.hero);
    a.append(v, h('div', 'card-body', `<h3>${esc(r.title)}</h3><p>${esc(r.sub)}</p><div class="chips">${r.techs.map((id) => `<span class="chip">${esc(techOf(id)?.name ?? id)}</span>`).join('')}</div>`));
    g.appendChild(a);
  }
  main.appendChild(g);
  return () => hub.dispose();
}

export function viewRecipe(main: HTMLElement, id: string): () => void {
  const r: Recipe | undefined = RECIPES.find((x) => x.id === id);
  if (!r) {
    main.appendChild(h('p', 'empty', '없는 레시피예요. <a class="link" href="#recipes">레시피 목록</a>'));
    return () => {};
  }
  const hub = new Hub();
  const items = itemsOf(r.techs, r.roles);
  main.insertAdjacentHTML(
    'beforeend',
    `<div class="crumbs"><a href="#home">홈</a><span>›</span><a href="#recipes">조합 레시피</a><span>›</span>${esc(r.title)}</div>
     <header class="tech-head"><div><div class="card-meta"><span class="pill idea">레시피 · 기술 ${items.length}개</span></div><h1>${esc(r.title)}</h1><p>${esc(r.sub)}</p></div></header>`,
  );
  const stage = h('section', 'recipe-stage');
  const big = h('div', 'big-view');
  big.id = 'view';
  hub.add(big, r.hero, true);
  const steps = h('ol', 'recipe-steps');
  items.forEach((x) => {
    steps.appendChild(h('li', '', `<a href="#t/${x.t.id}"><b>${esc(x.t.name)}</b><small>${esc(x.role ?? x.d.summary)}</small></a>`));
  });
  const side = h('aside', 'tech-side');
  side.innerHTML = `<h4>쌓는 순서</h4>`;
  side.appendChild(steps);
  side.appendChild(btn('＋ 이 기술들을 내 조합에 넣기', 'cart-add', () => cartAdd(r.techs)));
  // 대표 견본이 목록에서 뺀 전시물(i492 등)이면 기술 화면이 없으니 링크 없이
  const heroT = techOf(r.hero);
  side.appendChild(h('p', 'muted', heroT ? `대표 견본: <a class="link" href="#t/${r.hero}">${esc(heroT.name)}</a>` : '위 견본: 이 레시피의 완성 장면'));
  stage.append(big, side);
  main.appendChild(stage);
  main.appendChild(comboBox(items, recipeHead(r), r.targets, r.styles, r.platforms).el);
  main.appendChild(h('h2', 'sec-title', `들어간 기술 <small>${items.length}</small>`));
  const grid = h('div', 'grid');
  for (const x of items) {
    const a = h('a', `card ${x.t.status}`);
    a.href = `#t/${x.t.id}`;
    const v = h('div', 'card-view');
    hub.add(v, x.t.id);
    a.append(v, h('div', 'card-body', `<div class="card-meta"><span class="dim">${esc(x.t.cat)}</span></div><h3>${esc(x.t.name)}</h3><p>${esc(x.role ?? x.d.summary)}</p>`));
    grid.appendChild(a);
  }
  main.appendChild(grid);
  main.appendChild(h('p', 'muted foot-link', `이 페이지 주소: <span class="mono">${esc(pageUrl(`recipe/${r.id}`))}</span>`));
  return () => hub.dispose();
}

import { gameIdsOf, LAB_IDEAS, MAIN, REFS, TECH, type Tech, variantsOf } from './catalog';
import { controlsUI, DEMOS, GAME_TITLE, h, Hub, openGame } from './hub';
import { DOCS, docOf } from './docs/index';
import { RECIPES } from './docs/recipes';
import { aiBox, cartButton, checkCard, codeCard, COST, LEVEL, principleCard, relCard } from './docs/techPage';
import { copyText } from './docs/ui';
import { connectBox } from './connect';
import { LABS } from './labs';

/**
 * 스튜디오 화면들 — 에셋 스토어처럼 단순하게 (2026-10-07 다시).
 *  홈(소개 · 분류 · 추천 · 레시피) · 목록(왼쪽 거르기 + 같은 모양 카드) · 기술 상세(큰 견본 + 「AI 프롬프트 복사」 상자 + 탭) · 실전 무대 · 연구 노트
 * 방문자에게 뜻 없는 것(기술 번호 · 쓰는 중/아이디어 · 통계)은 보여 주지 않는다.
 * 각 view 함수는 main 영역에 그리고 정리 함수를 돌려준다.
 */

export { DOMAINS, domainOf, type Domain } from './domains';
import { DOMAINS, domainOf } from './domains';
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** 난이도 1 · 2 · 3 (문서 → 없으면 catalog 의 하 · 중 · 상) */
const levelOf = (t: Tech): number => docOf(t).d.level;
/** 추천순 — 설명이 다 갖춰진 기술 → 게임에 쓰는 기술 → 나머지 (원래 순서 유지) */
const rank = (t: Tech): number => (DOCS[t.id] ? 0 : t.status === 'used' ? 1 : 2);
const sortBy = (list: Tech[], how: string): Tech[] => {
  const idx = new Map(TECH.map((x, i) => [x, i]));
  const by = (f: (t: Tech) => number | string) => [...list].sort((a, b) => (f(a) < f(b) ? -1 : f(a) > f(b) ? 1 : idx.get(a)! - idx.get(b)!));
  if (how === 'easy') return by((t) => levelOf(t) * 10 + rank(t));
  if (how === 'name') return by((t) => t.name);
  return by(rank);
};

/** 기술 카드 — 견본 · 이름 · 한 줄 설명 · 작은 꼬리표 하나 */
function card(t: Tech, hub: Hub): HTMLElement {
  const a = h('a', 'card');
  a.href = `#t/${t.id}`;
  const view = h('div', 'card-view');
  hub.add(view, t.id);
  a.append(
    view,
    h('div', 'card-body', `<h3>${esc(t.name)}</h3><p>${esc(DEMOS[t.id]?.caption ?? t.desc)}</p><span class="card-tag">${esc(t.cat)} · ${LEVEL[levelOf(t)]}${variantsOf(t.id).length ? ` · <b>효과 ${variantsOf(t.id).length + 1}가지</b>` : ''}</span>`),
  );
  return a;
}
function grid(list: Tech[], hub: Hub, cls = 'grid'): HTMLElement {
  const g = h('div', cls);
  for (const t of list) g.appendChild(card(t, hub));
  return g;
}

/* ───────────── 홈 ───────────── */

/** 처음 온 사람에게 먼저 보여 줄 기술 (설명이 다 갖춰진 것 중 볼거리 있는 것) */
const PICKS = ['i484', 'u01', 'i446', 'i477', 'i499', 'i459', 'i341', 'i182'];

export function viewHome(main: HTMLElement): () => void {
  const hub = new Hub();
  main.appendChild(
    h(
      'section',
      'home-hero',
      `<h1>게임 기술을 눈으로 보고,<br>AI 로 바로 만들어 보세요</h1>
       <p>그래픽 · 이펙트 · 게임 시스템 기술 ${MAIN.length}가지. 모두 움직이는 견본이 있고, 마음에 드는 기술은 프롬프트를 복사해 AI 에게 붙여 넣으면 돼요.</p>
       <ol class="steps"><li><b>1</b>기술 고르기</li><li><b>2</b>견본 움직여 보기</li><li><b>3</b>「AI 프롬프트 복사」</li></ol>`,
    ),
  );
  // AI 코딩 도구에 연결 — 사람이 찾지 않아도 AI 가 직접 기술을 검색해 쓰게 (connect.ts)
  main.appendChild(connectBox());
  main.appendChild(h('h2', 'sec-title', '분류'));
  const doms = h('section', 'cat-tiles');
  for (const d of DOMAINS) {
    const n = MAIN.filter((x) => d.cats.includes(x.cat)).length;
    const a = h('a', 'cat-tile');
    a.href = `#d/${d.id}`;
    const v = h('div', 'card-view');
    hub.add(v, d.hero);
    a.append(v, h('div', 'cat-body', `<h3>${d.name}<span>${n}</span></h3><p>${d.desc}</p>`));
    doms.appendChild(a);
  }
  main.appendChild(doms);
  main.appendChild(h('h2', 'sec-title', '추천 기술 <a class="more" href="#all">전체 보기 →</a>'));
  main.appendChild(grid(PICKS.map((id) => TECH.find((x) => x.id === id)).filter((x): x is Tech => !!x), hub));
  main.appendChild(h('h2', 'sec-title', '조합 레시피 <small>여러 기술을 엮어 한 장면을 만드는 주문서</small>'));
  const rec = h('section', 'recipe-row');
  for (const r of RECIPES) {
    const a = h('a', 'recipe-card');
    a.href = `#recipe/${r.id}`;
    const v = h('div', 'card-view');
    hub.add(v, r.hero);
    a.append(v, h('div', 'card-body', `<h3>${esc(r.title)}</h3><p>${esc(r.sub)}</p><span class="card-tag">기술 ${r.techs.length}개 조합</span>`));
    rec.appendChild(a);
  }
  main.appendChild(rec);
  return () => hub.dispose();
}

/* ───────────── 목록 (분류 · 전체 · 검색) ───────────── */

interface Filter {
  cat: string;
  dim: string;
  lv: number;
  q: string;
  sort: string;
}
const PAGE = 24;

/** domain = null 이면 전체. q 가 있으면 검색 결과로 시작 */
export function viewBrowse(main: HTMLElement, domainId: string | null, q0 = ''): () => void {
  let hub = new Hub();
  const d = domainId ? (DOMAINS.find((x) => x.id === domainId) ?? null) : null;
  const base = d ? MAIN.filter((x) => d.cats.includes(x.cat)) : MAIN;
  const f: Filter = { cat: '', dim: '', lv: 0, q: q0, sort: 'rec' };
  main.insertAdjacentHTML(
    'beforeend',
    `<div class="crumbs"><a href="#home">홈</a><span>›</span>${d ? d.name : q0 ? '검색' : '전체 기술'}</div>
     <header class="page-head"><h1>${d ? d.name : q0 ? `「${esc(q0)}」 찾기` : '전체 기술'}</h1><p>${d ? d.desc : '움직이는 견본을 보고 마음에 드는 기술을 눌러 보세요.'}</p></header>`,
  );
  const wrap = h('div', 'browse');
  const side = h('aside', 'filters');
  const res = h('section', 'results');
  wrap.append(side, res);
  main.appendChild(wrap);

  /* 왼쪽 거르기 */
  const group = (title: string, opts: [string, string, number?][], cur: () => string, set: (v: string) => void): void => {
    const g = h('div', 'f-group', `<h4>${title}</h4>`);
    const list = h('div', 'f-list');
    for (const [v, l, n] of opts) {
      const b = h('button', 'f-opt', `<span>${esc(l)}</span>${n !== undefined ? `<em>${n}</em>` : ''}`);
      b.type = 'button';
      b.dataset['v'] = v;
      b.onclick = () => {
        set(v);
        list.querySelectorAll('button').forEach((x) => x.classList.toggle('on', (x as HTMLElement).dataset['v'] === cur()));
        draw();
      };
      b.classList.toggle('on', v === cur());
      list.appendChild(b);
    }
    g.appendChild(list);
    side.appendChild(g);
  };
  if (d)
    group('세부 분류', [['', '전체', base.length], ...d.cats.map((c): [string, string, number] => [c, c, base.filter((x) => x.cat === c).length]).filter((x) => x[2] > 0)], () => f.cat, (v) => (f.cat = v));
  else {
    const g = h('div', 'f-group', '<h4>분류</h4>');
    const list = h('div', 'f-list');
    for (const x of DOMAINS) list.insertAdjacentHTML('beforeend', `<a class="f-opt" href="#d/${x.id}"><span>${x.name}</span><em>${MAIN.filter((t) => x.cats.includes(t.cat)).length}</em></a>`);
    g.appendChild(list);
    side.appendChild(g);
  }
  group('형태', [['', '전체'], ['3D', '3D'], ['2D', '2D']], () => f.dim, (v) => (f.dim = v));
  group('난이도', [['0', '전체'], ['1', '쉬움'], ['2', '보통'], ['3', '어려움']], () => String(f.lv), (v) => (f.lv = Number(v)));

  /* 오른쪽 결과 */
  const head = h('div', 'res-head');
  const count = h('b', 'res-n');
  const search = h('input', 'res-search');
  search.placeholder = '이 안에서 찾기';
  search.value = q0;
  search.oninput = () => {
    f.q = search.value.trim();
    draw();
  };
  const sort = h('select', 'res-sort');
  sort.innerHTML = '<option value="rec">추천순</option><option value="easy">쉬운 순</option><option value="name">이름순</option>';
  sort.onchange = () => {
    f.sort = sort.value;
    draw();
  };
  head.append(count, search, sort);
  const body = h('div');
  // 끝 표시가 화면 가까이 오면 저절로 다음 묶음 (「더 보기」 단추 없이 내리기만)
  const more = h('div', 'more-sentinel');
  res.append(head, body, more);

  let list: Tech[] = [];
  let shown = 0;
  let g: HTMLElement | null = null;
  const fill = (): void => {
    const next = list.slice(shown, shown + PAGE);
    for (const t of next) g!.appendChild(card(t, hub));
    shown += next.length;
    more.hidden = shown >= list.length;
  };
  const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && shown < list.length && fill(), { rootMargin: '600px' });
  io.observe(more);
  function draw(): void {
    hub.dispose();
    hub = new Hub();
    body.innerHTML = '';
    const q = f.q.toLowerCase();
    list = sortBy(
      base.filter(
        (x) =>
          (!f.cat || x.cat === f.cat) &&
          (!f.dim || x.dim === f.dim) &&
          (!f.lv || levelOf(x) === f.lv) &&
          (!q || `${x.name} ${x.desc} ${x.where} ${x.cat} ${DOCS[x.id]?.terms.map((y) => y.en).join(' ') ?? ''}`.toLowerCase().includes(q)),
      ),
      f.sort,
    );
    count.textContent = `${list.length}개`;
    shown = 0;
    if (!list.length) {
      body.appendChild(h('p', 'empty', '맞는 기술이 없어요. 거르기를 풀어 보세요.'));
      more.hidden = true;
      return;
    }
    g = h('div', 'grid');
    body.appendChild(g);
    fill();
  }
  draw();
  return () => {
    io.disconnect();
    hub.dispose();
  };
}

/* ───────────── 기술 상세 ───────────── */

export function viewTech(main: HTMLElement, id: string): () => void {
  const t = TECH.find((x) => x.id === id);
  if (!t) {
    main.appendChild(h('p', 'empty', '없는 기술이에요.'));
    return () => {};
  }
  const hub = new Hub();
  const d = domainOf(t.cat);
  const games = gameIdsOf(t);
  const { d: doc, auto } = docOf(t);
  const caption = DEMOS[t.id]?.caption;
  const parent = t.of ? TECH.find((x) => x.id === t.of) : undefined;
  const variants = variantsOf(t.id);
  main.insertAdjacentHTML(
    'beforeend',
    `<div class="crumbs"><a href="#home">홈</a><span>›</span><a href="#d/${d.id}">${d.name}</a><span>›</span>${parent ? `<a href="#t/${parent.id}">${esc(parent.name)}</a><span>›</span>효과 모음` : esc(t.cat)}</div>`,
  );

  /* 위: 왼쪽 견본 · 오른쪽 구매 상자 */
  const pd = h('section', 'pd');
  const media = h('div', 'pd-media');
  const big = h('div', 'big-view');
  media.appendChild(big);
  if (caption) media.appendChild(h('p', 'pd-caption', esc(caption)));
  const ctrlWrap = h('div', 'pd-ctrl');
  const ctrl = h('div', 'ctrl');
  ctrlWrap.append(h('h4', '', '조절해 보기'), ctrl);
  media.appendChild(ctrlWrap);
  if (!hub.add(big, t.id, true, (c) => (c.length ? controlsUI(c, ctrl) : ctrlWrap.remove()))) ctrlWrap.remove();

  const buy = h('aside', 'pd-buy');
  const term = doc.terms[0]?.en;
  buy.innerHTML = `${parent ? `<a class="pd-parent" href="#t/${parent.id}">「${esc(parent.name)}」 기술로 만든 효과 →</a>` : `<span class="pd-cat">${esc(t.cat)}</span>`}<h1>${esc(t.name)}</h1>${term ? `<p class="pd-term">${esc(term)}</p>` : ''}
    <p class="pd-sum">${esc(auto ? t.desc : doc.summary)}</p>
    <div class="pd-tags"><span>${t.dim === '공통' ? '2D · 3D' : t.dim}</span><span>난이도 ${LEVEL[doc.level]}</span>${auto ? '' : `<span title="${esc(doc.costNote)}">${COST[doc.cost][0]}</span>`}</div>`;
  const ai = aiBox(t, doc, auto);
  const copy = h('button', 'btn primary big', '⧉ AI 프롬프트 복사');
  copy.type = 'button';
  const pre = ai.querySelector<HTMLElement>('.ai-prompt')!;
  copy.onclick = () => void copyText(pre.textContent ?? '', pre, '프롬프트를 복사했어요 — AI 에게 붙여 넣으세요');
  buy.append(copy, cartButton(t.id));
  const hint = h('p', 'pd-hint', 'Claude · ChatGPT · Cursor 에 붙여 넣으면 이 기술을 만들어 줘요. ');
  const tune = h('a', 'link', '내 게임에 맞게 고치기 →');
  tune.href = '#';
  hint.appendChild(tune);
  buy.appendChild(hint);
  if (games.length) {
    const gl = h('div', 'pd-games', '<h4>이 기술을 쓴 게임</h4>');
    for (const gId of games.slice(0, 6)) {
      const b = h('button', 'chip', `${esc(GAME_TITLE[gId] ?? gId)} ↗`);
      b.type = 'button';
      b.onclick = () => openGame(gId);
      gl.appendChild(b);
    }
    buy.appendChild(gl);
  }
  pd.append(media, buy);
  main.appendChild(pd);

  /* 효과 모음 — 같은 기술로 만든 다른 효과들 (변형 화면이면 형제 효과 + 상위 기술) */
  const family = parent ? [parent, ...variantsOf(parent.id)].filter((x) => x !== t) : variants;
  if (family.length) {
    main.appendChild(
      h('h2', 'sec-title', parent ? `같은 기술로 만든 다른 효과 <small>${family.length}</small>` : `효과 모음 <small>이 기술로 만든 효과 ${family.length + 1}가지 — 방법은 같고 모양만 달라요</small>`),
    );
    main.appendChild(grid(family, hub, 'grid fx-grid'));
  }

  /* 아래: 탭 (한 번에 하나만) */
  const tabs = h('nav', 'tabs');
  tabs.setAttribute('role', 'tablist');
  const panel = h('section', 'tab-panel');
  const over = h('div');
  over.appendChild(principleCard(doc, auto));
  over.appendChild(h('div', 'doc-card wide', `<h3>${t.status === 'used' ? '우리 게임에서' : '쓰면 좋을 곳'}</h3><p>${esc(t.where)}</p>`));
  const rel = relCard(doc);
  if (rel) over.appendChild(rel);
  const check = checkCard(doc);
  const pages: [string, HTMLElement][] = [
    ['개요', over],
    ['AI 주문서', ai],
    ['코드', codeCard(t, doc, auto)],
    ['실수 · 완성 기준', check],
  ];
  const show = (i: number): void => {
    tabs.querySelectorAll('button').forEach((b, k) => {
      b.classList.toggle('on', k === i);
      b.setAttribute('aria-selected', String(k === i));
    });
    pages.forEach(([, el], k) => (el.hidden = k !== i));
  };
  pages.forEach(([label, el], i) => {
    const b = h('button', '', label);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.onclick = () => show(i);
    tabs.appendChild(b);
    panel.appendChild(el);
  });
  show(0);
  tune.onclick = (e) => {
    e.preventDefault();
    show(1);
    tabs.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  main.append(tabs, panel);

  /* 관련 기술 — 문서의 앞 · 뒤 기술 + 같은 세부 분류 */
  const relIds = [...(doc.prev ?? []), ...(doc.next ?? [])];
  const relList = [...relIds.map((x) => MAIN.find((y) => y.id === x)), ...MAIN.filter((x) => x.cat === (parent ?? t).cat)]
    .filter((x, i, a): x is Tech => !!x && x !== t && x !== parent && !family.includes(x) && a.indexOf(x) === i)
    .slice(0, 8);
  if (relList.length) {
    main.appendChild(h('h2', 'sec-title', `관련 기술 <a class="more" href="#d/${d.id}">${d.name} 모두 보기 →</a>`));
    main.appendChild(grid(relList, hub));
  }
  return () => hub.dispose();
}

/* ───────────── 실전 무대 · 연구 노트 (아래 작은 링크로만) ───────────── */

export function viewLab(main: HTMLElement, id: string): () => void {
  const l = LABS.find((x) => x.id === id) ?? LABS[0]!;
  main.insertAdjacentHTML(
    'beforeend',
    `<div class="crumbs"><a href="#home">홈</a><span>›</span><a href="#labs">특별 무대</a><span>›</span>${l.title}</div>
     <header class="page-head"><h1>${l.title}</h1><p>${l.sub}</p>
     <div class="chips">${(l.techs ?? []).map((t) => `<a class="chip" href="#t/${t}">${esc(TECH.find((x) => x.id === t)?.name ?? t)} →</a>`).join('')}</div></header>
     ${l.notes.length ? `<ul class="notes">${l.notes.map((n) => `<li>${n}</li>`).join('')}</ul>` : ''}`,
  );
  const box = h('div', 'lab-box');
  main.appendChild(box);
  const c = l.mount?.(box);
  return () => {
    if (c) c();
  };
}
/* ───────────── 효과 갤러리 — 「무엇을 만들 수 있나」 (기술 목록은 「어떻게 만드나」) ───────────── */

/** 볼거리 묶음: 분류 이름 → 갤러리 칸. 효과 모음(변형)은 모두 들어가고, 기술 중에서도 결과가 곧 볼거리인 분류는 함께 */
const FX_GROUPS: { id: string; name: string; cats: string[] }[] = [
  { id: 'magic', name: '마법 · 스킬', cats: ['스킬 VFX (마법 · 미사일)'] },
  { id: 'vfx', name: '화려한 효과', cats: ['화려한 효과 (VFX)', '입자 · 연출'] },
  { id: 'motion', name: '모션 그래픽', cats: ['모션 그래픽'] },
  { id: 'juice', name: '손맛 · 주스', cats: ['손맛 · 주스'] },
  { id: 'space', name: '우주', cats: ['우주 표현'] },
  { id: 'model', name: '모델 · 재질', cats: ['하드서피스 · 실사 렌더링', '3D 모델링 · 절차'] },
];
const fxGroupOf = (t: Tech): string => FX_GROUPS.find((g) => g.cats.includes(t.cat))?.id ?? 'etc';

export function viewGallery(main: HTMLElement): () => void {
  let hub = new Hub();
  const showcase = FX_GROUPS.flatMap((g) => g.cats);
  // 효과(변형)는 전부 + 볼거리 분류의 기술 — 모델 · 재질은 효과(예시)만 (기계 장치는 「기계 · 구조」 분류의 기술)
  const items = TECH.filter((t) => DEMOS[t.id] && (t.of || (showcase.includes(t.cat) && fxGroupOf(t) !== 'model')));
  main.insertAdjacentHTML(
    'beforeend',
    `<div class="crumbs"><a href="#home">홈</a><span>›</span>효과 모음</div>
     <header class="page-head"><h1>효과 모음 <span class="dim">${items.length}</span></h1><p>여기는 기술 목록이 아니라, 기술로 만든 <b>효과를 모아 둔 곳</b>이에요. 마음에 드는 효과를 누르면 그 효과를 만든 기술과 AI 주문서로 이어져요.</p></header>`,
  );
  const bar = h('nav', 'chips fx-filter');
  const res = h('section', 'results');
  main.append(bar, res);
  let cur = '';
  const groups = [{ id: '', name: '전체' }, ...FX_GROUPS, { id: 'etc', name: '그 밖의 효과' }];
  for (const g of groups) {
    const n = g.id ? items.filter((t) => fxGroupOf(t) === g.id).length : items.length;
    if (!n) continue;
    const b = h('button', 'chip', `${esc(g.name)} <b>${n}</b>`);
    b.type = 'button';
    b.dataset['g'] = g.id;
    b.onclick = () => {
      cur = g.id;
      draw();
    };
    bar.appendChild(b);
  }
  const fxCard = (t: Tech): HTMLElement => {
    const a = h('a', 'card');
    a.href = `#t/${t.id}`;
    const view = h('div', 'card-view');
    hub.add(view, t.id);
    const parent = t.of ? TECH.find((x) => x.id === t.of) : undefined;
    a.append(view, h('div', 'card-body', `<h3>${esc(t.name)}</h3><p>${esc(DEMOS[t.id]?.caption ?? t.desc)}</p><span class="card-tag">${parent ? `만든 기술 · <b>${esc(parent.name)}</b>` : esc(t.cat)}</span>`));
    return a;
  };
  const draw = (): void => {
    hub.dispose();
    hub = new Hub();
    bar.querySelectorAll<HTMLElement>('button').forEach((b) => b.classList.toggle('on', b.dataset['g'] === cur));
    const list = cur ? items.filter((t) => fxGroupOf(t) === cur) : items;
    res.innerHTML = '';
    const g = h('div', 'grid');
    for (const t of list) g.appendChild(fxCard(t));
    res.appendChild(g);
  };
  draw();
  return () => hub.dispose();
}

export function viewResearch(main: HTMLElement): () => void {
  main.insertAdjacentHTML(
    'beforeend',
    `<div class="crumbs"><a href="#home">홈</a><span>›</span>연구 노트</div><header class="page-head"><h1>연구 노트</h1><p>원리 설명형 웹 체험 · 화려한 효과를 조사한 결과예요.</p></header>
     <h2 class="sec-title">원리 체험 아이디어 <small>${LAB_IDEAS.length}</small></h2>
     <section class="ideas">${LAB_IDEAS.map((x) => `<div class="idea-card"><h3>${x.name}</h3><p>${x.math}</p><small>필요한 기술 — ${x.needs}</small></div>`).join('')}</section>
     <h2 class="sec-title">참고 작품 <small>${REFS.length}</small></h2>
     <section class="refs">${REFS.map((x) => `<a class="ref" href="${x.url}" target="_blank" rel="noopener"><h3>${esc(x.name)}</h3><p>${esc(x.what)}</p><span>${esc(x.url.replace(/^https?:[/][/]/, ''))}</span></a>`).join('')}</section>`,
  );
  return () => {};
}

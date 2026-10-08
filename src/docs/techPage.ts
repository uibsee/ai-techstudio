import type { Tech } from '../catalog';
import { h } from '../hub';
import { captionOf, pageUrl, techOf } from './index';
import { buildPack, buildPrompt } from './prompt';
import { findSource } from './source';
import type { Cost, TechDoc } from './types';
import { btn, cartAdd, cartRemove, copyText, downloadText, esc, fileName, inCart, initialOpts, optionChips } from './ui';

/**
 * 기술 페이지의 문서 부분 — 「AI 에게 시키기」 상자 · 원리 · 핵심 코드 · 견본 전체 코드 · 흔한 실수 · 관련 기술.
 * 문서가 없는 기술(auto)도 같은 틀로 (기본 주문서), 사람용 칸은 있는 것만.
 */

export const COST: Record<Cost, [string, string]> = { light: ['폰 OK', 'ok'], medium: ['폰 주의', 'mid'], heavy: ['무거움', 'heavy'] };
export const LEVEL = ['', '쉬움', '보통', '어려움'];

/** 머리 아래 배지 줄 (영어 용어 · 비용 · 난이도) */
export function docBadges(d: TechDoc, auto: boolean): string {
  const term = d.terms[0]?.en;
  return `<div class="doc-badges">${term ? `<span class="term" title="영어 표준 용어 — AI 에게 이 이름으로 말하면 잘 알아들어요">${esc(term)}</span>` : ''}${
    auto ? '' : `<span class="cost ${COST[d.cost][1]}" title="${esc(d.costNote)}">${COST[d.cost][0]}</span>`
  }<span class="lvl">난이도 ${LEVEL[d.level]}</span></div>`;
}

/** 내 조합에 넣기 단추 (상태를 따라 바뀜) */
export function cartButton(id: string): HTMLButtonElement {
  const b = btn('', 'cart-add', () => {
    if (inCart(id)) cartRemove(id);
    else cartAdd([id]);
  });
  let seen = false;
  const sync = (): void => {
    // 화면을 떠난 단추는 듣기를 그만둔다
    if (seen && !b.isConnected) return window.removeEventListener('studio-cart', sync);
    if (b.isConnected) seen = true;
    const on = inCart(id);
    b.innerHTML = on ? '✓ 내 조합에 들어 있음' : '＋ 내 조합에 넣기';
    b.classList.toggle('on', on);
    b.title = '여러 기술을 모아 한 장면을 만드는 주문서 하나로 합쳐요 (위 「내 조합」)';
    b.setAttribute('aria-pressed', String(on));
  };
  sync();
  window.addEventListener('studio-cart', sync);
  return b;
}

/** 「AI 에게 시키기」 상자 */
export function aiBox(t: Tech, d: TechDoc, auto: boolean): HTMLElement {
  const box = h('section', 'ai-box');
  box.id = 'ai';
  const o = initialOpts(d.targets, d.styles, d.platforms);
  // 견본 캡션은 스튜디오 화면 말(「크게 보기」 · 「22가지」 …)이라 AI 가 범위를 넓혀 버린다 — 문서가 있으면 목표 문장만 쓴다 (2026-10-07 실제 AI 시험)
  const caption = auto ? captionOf(t.id) : undefined;
  box.innerHTML = `<header class="ai-head"><div><span class="ai-eyebrow">AI 에게 시키기</span><h2>복사해서 Claude · ChatGPT · Cursor 에 붙여 넣으세요</h2>
    <p>칩을 고르면 주문서의 빈칸이 바로 채워져요. ${auto ? '<b class="warn">이 기술은 아직 자세한 문서가 없어 기본 주문서예요.</b>' : '목표 · 용어 · 환경 · 조건 · 완성 기준을 갖춘 주문서예요.'}</p></div></header>`;
  const body = h('div', 'ai-body');
  const pre = h('pre', 'ai-prompt');
  pre.tabIndex = 0;
  pre.setAttribute('aria-label', '주문서 (프롬프트)');
  const draw = (): void => {
    pre.textContent = buildPrompt(t, d, o, caption);
  };
  const chips = optionChips(o, d.targets, d.styles, d.platforms, draw);
  draw();
  const acts = h('div', 'ai-acts');
  const pack = (): string => buildPack(t, d, o, caption, pageUrl(`t/${t.id}`));
  acts.append(
    btn('⧉ 프롬프트 복사', 'primary', () => void copyText(pre.textContent ?? '', pre, '프롬프트를 복사했어요')),
    btn('📦 AI 꾸러미 복사', '', () => void copyText(pack(), pre, 'AI 꾸러미(프롬프트 + 코드 + 실수 + 기준)를 복사했어요'), '프롬프트 + 핵심 코드 + 흔한 실수 + 완성 기준을 마크다운 한 장으로'),
    btn('⬇ .md 내려받기', '', () => downloadText(fileName(`${t.id}-${t.name}`), pack())),
  );
  const right = h('div', 'ai-right');
  right.append(pre, acts);
  body.append(chips, right);
  box.appendChild(body);
  return box;
}

/** 원리 · 언제 쓰나 · 비용 */
export function principleCard(d: TechDoc, auto: boolean): HTMLElement {
  const s = h('section', 'doc-grid');
  s.id = 'how';
  s.innerHTML = `<div class="doc-card"><h3>원리</h3><ol class="doc-steps">${d.principle.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
      ${d.terms.length ? `<h4>용어</h4><dl class="doc-terms">${d.terms.map((x) => `<dt>${esc(x.en)}</dt><dd>${esc(x.ko || '—')}</dd>`).join('')}</dl>` : ''}</div>
    <div class="doc-card"><h3>언제 쓰나</h3><ul class="doc-yes">${d.when.map((x) => `<li>${esc(x)}</li>`).join('') || '<li class="muted">아래 「쓰는 곳」 칸의 게임에서 쓰고 있어요 — 그 게임을 열어 실제 모습을 보세요.</li>'}</ul>
      ${d.avoid.length ? `<h4>쓰지 말 때</h4><ul class="doc-no">${d.avoid.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${auto ? '' : `<h4>비용</h4><p class="doc-cost"><span class="cost ${COST[d.cost][1]}">${COST[d.cost][0]}</span> ${esc(d.costNote)}</p>`}</div>`;
  return s;
}

/** 견본 전체 코드 보기 (눌렀을 때만 받아 온다) */
function sourceViewer(t: Tech, d: TechDoc): HTMLElement {
  const wrap = h('div', 'src-view');
  const open = btn('{ } 견본 전체 코드 보기', '', () => void load());
  open.setAttribute('aria-expanded', 'false');
  const panel = h('div', 'src-panel');
  panel.hidden = true;
  wrap.append(open, panel);
  let loaded = false;
  async function load(): Promise<void> {
    const show = panel.hidden;
    panel.hidden = !show;
    open.setAttribute('aria-expanded', String(show));
    open.innerHTML = show ? '{ } 견본 코드 접기' : '{ } 견본 전체 코드 보기';
    if (!show || loaded) return;
    loaded = true;
    panel.innerHTML = '<p class="muted">견본 코드 받는 중…</p>';
    try {
      const r = await findSource(t.id, d.source);
      panel.innerHTML = '';
      const list = r.pieces.length ? r.pieces : r.whole ? [{ label: '파일 전체', file: r.whole.file, line: 1, code: r.whole.code }] : [];
      if (!list.length) {
        panel.innerHTML = '<p class="muted">견본 코드를 찾지 못했어요.</p>';
        return;
      }
      if (!r.pieces.length) panel.appendChild(h('p', 'muted', `이 기술 부분을 자동으로 찾지 못해 파일 전체를 보여 드려요 — 파일 안에서 <code>${esc(t.id)}</code> 를 찾아보세요.`));
      for (const p of list) {
        const head = h('div', 'src-head', `<span class="mono">${esc(p.file)} : ${p.line}</span><b>${esc(p.label)}</b>`);
        const pre = h('pre', 'code');
        pre.tabIndex = 0;
        pre.textContent = p.code;
        head.appendChild(btn('복사', 'sm', () => void copyText(p.code, pre, `${p.label} 코드를 복사했어요`)));
        panel.append(head, pre);
      }
      panel.appendChild(h('p', 'muted', '견본 코드는 스튜디오 카드용 장치(조절판 · 캡션 · 정리)가 섞여 있어요. AI 에게 줄 때는 위의 「핵심 코드」나 「AI 꾸러미」가 더 깔끔해요.'));
    } catch (e) {
      panel.innerHTML = `<p class="muted">견본 코드를 받지 못했어요 (${esc(String(e).slice(0, 80))}).</p>`;
      loaded = false;
    }
  }
  return wrap;
}

/** 핵심 코드 */
export function codeCard(t: Tech, d: TechDoc, auto: boolean): HTMLElement {
  const s = h('section', 'doc-card wide');
  s.id = 'code';
  if (auto || !d.code.body) {
    s.innerHTML = `<h3>핵심 코드</h3><p class="muted">아직 정리된 핵심 코드가 없어요. 아래 「견본 전체 코드 보기」에서 이 견본의 실제 코드를 볼 수 있어요.</p>`;
  } else {
    s.innerHTML = `<div class="code-head"><h3>핵심 코드 <small>${esc(d.code.title)}</small></h3></div>${d.code.from ? `<p class="code-from">발췌 · 정리: ${esc(d.code.from)}</p>` : ''}`;
    const pre = h('pre', 'code');
    pre.tabIndex = 0;
    pre.textContent = d.code.body;
    s.querySelector('.code-head')!.appendChild(btn('⧉ 코드 복사', 'sm', () => void copyText(d.code.body, pre, '코드를 복사했어요')));
    s.appendChild(pre);
  }
  s.appendChild(sourceViewer(t, d));
  return s;
}

/** 흔한 실수 · 확인 목록 · 완성 기준 */
export function checkCard(d: TechDoc): HTMLElement {
  const s = h('section', 'doc-grid');
  s.id = 'check';
  s.innerHTML = `<div class="doc-card"><h3>흔한 실수</h3>${
    d.pitfalls.length
      ? `<ul class="pit">${d.pitfalls.map((p) => `<li><b>${esc(p.title)}</b>${p.seen ? '<span class="seen" title="이 사이트를 만들며 실제로 겪은 것">실제로 겪음</span>' : ''}<p>${esc(p.fix)}</p></li>`).join('')}</ul>`
      : '<p class="muted">아직 정리된 것이 없어요.</p>'
  }</div>
    <div class="doc-card"><h3>완성 기준 <small>이게 보이면 성공</small></h3><ul class="checks">${d.done.map((x) => `<li><label><input type="checkbox"><span>${esc(x)}</span></label></li>`).join('')}</ul>
    <h4>주문서 조건</h4><ul class="doc-must">${d.must.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
  return s;
}

/** 관련 기술 · 참고 */
export function relCard(d: TechDoc): HTMLElement | null {
  const link = (id: string): string => {
    const x = techOf(id);
    return x ? `<a class="chip" href="#t/${x.id}">${esc(x.name)} →</a>` : '';
  };
  const prev = (d.prev ?? []).map(link).join('');
  const next = (d.next ?? []).map(link).join('');
  if (!prev && !next && !d.refs?.length) return null;
  const s = h('section', 'doc-card wide');
  s.id = 'rel';
  s.innerHTML = `<h3>관련 기술 · 참고</h3><div class="rel-grid">
    ${prev ? `<div><h4>먼저 알면 좋은 것</h4><div class="chips">${prev}</div></div>` : ''}
    ${next ? `<div><h4>다음에 해 볼 것</h4><div class="chips">${next}</div></div>` : ''}
    ${d.refs?.length ? `<div><h4>참고 (공식 문서 · 예제)</h4><ul class="refs-list">${d.refs.map((r) => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)} ↗</a></li>`).join('')}</ul></div>` : ''}</div>`;
  return s;
}

/** 페이지 안 바로 가기 (폰에서 특히) */
export function tocBar(auto: boolean): HTMLElement {
  const items: [string, string][] = [['view', '견본'], ['ai', 'AI 에게 시키기'], ['how', '원리'], ['code', '코드'], ['check', auto ? '완성 기준' : '실수 · 기준'], ['rel', '관련'], ['more', '쓰는 곳']];
  const nav = h('nav', 'toc');
  nav.setAttribute('aria-label', '이 페이지');
  for (const [id, l] of items) {
    const a = h('a', '', l);
    a.href = `#${id}`;
    a.onclick = (e) => {
      e.preventDefault();
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    nav.appendChild(a);
  }
  return nav;
}

/** 문서 부분 전체 (AI 상자 뒤에 오는 것) */
export function docBody(t: Tech, d: TechDoc, auto: boolean): HTMLElement[] {
  const out: HTMLElement[] = [principleCard(d, auto), codeCard(t, d, auto), checkCard(d)];
  const rel = relCard(d);
  if (rel) out.push(rel);
  return out;
}

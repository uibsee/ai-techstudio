import { REFS } from './catalog';
import { h } from './hub';
import { REF_PREVIEW } from './refPreviews';

/**
 * 참고 작품 (#refs) — 다른 사람이 만든 좋은 작품 · 글 · 도구를 그림 카드로.
 * 그림은 각 사이트가 링크 미리보기용으로 공개한 대표 그림(og:image) 주소를 그대로 쓴다 (refPreviews.ts — scripts/fetch-ref-previews.mjs).
 * 그림이 없는 곳은 사이트 아이콘 + 주소로 꾸민 카드.
 */
type Ref = (typeof REFS)[number];

const GROUPS: { id: string; name: string; test: (r: Ref) => boolean }[] = [
  { id: 'ai', name: 'AI 로 만든 작품', test: (r) => /Opus|airsup|makeuseof|awesome-opus/i.test(r.what + r.url + r.name) },
  { id: 'explain', name: '원리 설명 · 시각화', test: (r) => /ciechanow|distill|worrydream|phet|zygote|nasa|animagraffs|exposure-triangle/i.test(r.url) },
  { id: 'motion', name: '모션 그래픽 · 영상', test: (r) => /hyperframes|motioner|charliehills|cinematic-3d-scroll/i.test(r.url) },
  { id: 'sound', name: '소리', test: (r) => /zzfx|sfxr|tonejs|howler|audio|animalese/i.test(r.url) },
  { id: 'juice', name: '손맛 · 연출', test: (r) => /youtube|mathforgameprogrammers/i.test(r.url) },
  { id: 'map', name: '지도 · 알고리즘', test: (r) => /redblobgames|WaveFunctionCollapse|polygon-map/i.test(r.url) },
  { id: 'gfx', name: '셰이더 · 그래픽', test: () => true },
];
const groupOf = (r: Ref): string => GROUPS.find((g) => g.test(r))!.id;
const kindOf = (u: string): string => (/youtube\.com|youtu\.be/.test(u) ? '영상' : /github\.com/.test(u) ? '코드' : /\.pdf$/i.test(u) ? '자료' : '웹');
const hostOf = (u: string): string => new URL(u).hostname.replace(/^www\./, '');
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
/** 그림 없는 카드 바탕색 — 주소로 정해 늘 같은 색 */
const hueOf = (s: string): number => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);

function refCard(r: Ref): HTMLElement {
  const a = h('a', 'ref-card');
  a.href = r.url;
  a.target = '_blank';
  a.rel = 'noopener';
  const img = REF_PREVIEW[r.url];
  const host = hostOf(r.url);
  const hue = hueOf(host);
  const fallback = `<div class="ref-fallback" style="--h:${hue}"><img src="https://www.google.com/s2/favicons?domain=${host}&sz=128" alt="" loading="lazy" referrerpolicy="no-referrer"><span>${esc(host)}</span></div>`;
  a.innerHTML = `<div class="ref-media">${img ? `<img class="ref-img" src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : fallback}<span class="ref-kind">${kindOf(r.url)}</span></div>
    <div class="ref-body"><h3>${esc(r.name)}</h3><p>${esc(r.what)}</p><small>${esc(host)} ↗</small></div>`;
  // 그림이 막히면(핫링크 금지 등) 꾸민 카드로
  a.querySelector<HTMLImageElement>('.ref-img')?.addEventListener('error', (e) => {
    (e.target as HTMLElement).outerHTML = fallback;
  });
  return a;
}

export function viewRefs(main: HTMLElement): () => void {
  main.insertAdjacentHTML(
    'beforeend',
    `<div class="crumbs"><a href="#home">홈</a><span>›</span>참고 작품</div>
     <header class="page-head"><div><h1>참고 작품 <span class="dim">${REFS.length}</span></h1>
     <p>만들 때 참고한 다른 사람들의 작품 · 글 · 도구예요. 누르면 그 사이트가 새 창으로 열려요.</p></div></header>`,
  );
  const bar = h('nav', 'chips fx-filter');
  const grid = h('section', 'ref-grid');
  main.append(bar, grid);
  let cur = '';
  const draw = (): void => {
    grid.innerHTML = '';
    for (const r of REFS) if (!cur || groupOf(r) === cur) grid.appendChild(refCard(r));
    bar.querySelectorAll<HTMLElement>('button').forEach((b) => b.classList.toggle('on', b.dataset['g'] === cur));
  };
  for (const g of [{ id: '', name: '전체' }, ...GROUPS]) {
    const n = g.id ? REFS.filter((r) => groupOf(r) === g.id).length : REFS.length;
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
  draw();
  return () => {};
}

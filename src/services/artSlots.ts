/**
 * 아트 에셋 슬롯.
 *
 * 그림은 지금 코드(SVG·캔버스)로 그리고 있지만, 나중에 일러스트가 생기면
 * `src/assets/games/<게임 id>/<슬롯 이름>.png` 에 파일을 넣기만 하면 된다.
 * 코드는 손대지 않아도 그 파일이 코드 그림 대신 쓰인다.
 *
 * 파일 존재 여부는 빌드 시점에 Vite 가 확인하므로 런타임 404 가 생기지 않는다.
 * 슬롯 이름 목록은 src/assets/games/README.md 참고.
 */
const files = import.meta.glob('/src/assets/games/*/*.{webp,png,jpg,jpeg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const EXTENSIONS = ['webp', 'png', 'jpg', 'jpeg'] as const;

/** 슬롯에 파일이 있으면 URL, 없으면 undefined (→ 코드 그림을 쓴다) */
export function artUrl(gameId: string, slot: string): string | undefined {
  for (const ext of EXTENSIONS) {
    const url = files[`/src/assets/games/${gameId}/${slot}.${ext}`];
    if (url) return url;
  }
  return undefined;
}

/**
 * 폰용 작은 그림 — 슬롯 옆에 `<슬롯>-sm.webp` 가 있으면 srcset 으로 둘 다 알려 준다.
 * 브라우저가 화면 폭에 맞는 쪽만 받는다 (폰은 작은 것 — 배너·썸네일 받는 양이 1/3 쯤).
 * 폭: 배너 원본 2172 · 작은 것 1200, 썸네일 원본 960 · 작은 것 560 (PIL 로 한 번 만들어 둔 파일 — 새 그림을 넣으면 -sm 도 같이 만든다).
 */
const SMALL_WIDTH: Record<string, [small: number, full: number]> = { hero: [1200, 2172], thumb: [560, 960] };

export function artSrcset(gameId: string, slot: string): string {
  const full = artUrl(gameId, slot);
  const small = artUrl(gameId, `${slot}-sm`);
  const w = SMALL_WIDTH[slot];
  return full && small && w ? `${small} ${w[0]}w, ${full} ${w[1]}w` : '';
}

/**
 * 홈 '카테고리로 탐험하기' 타일 아이콘 — `src/assets/categories/<카테고리 키>.webp` (png 도 된다).
 * 키: duel · luck · puzzle · calc · life. 없으면 코드로 그린 아이콘을 쓴다.
 */
const categoryFiles = import.meta.glob('/src/assets/categories/*.{webp,png,jpg,jpeg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export function categoryArtUrl(key: string): string | undefined {
  for (const ext of EXTENSIONS) {
    const url = categoryFiles[`/src/assets/categories/${key}.${ext}`];
    if (url) return url;
  }
  return undefined;
}

/**
 * 사이트 공용 그림 — `src/assets/site/<이름>.webp`. 예: hero (홈 배너 배경, 2400×720 정도, 가운데는 글씨 자리).
 */
const siteFiles = import.meta.glob('/src/assets/site/*.{webp,png,jpg,jpeg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export function siteArtUrl(name: string): string | undefined {
  for (const ext of EXTENSIONS) {
    const url = siteFiles[`/src/assets/site/${name}.${ext}`];
    if (url) return url;
  }
  return undefined;
}

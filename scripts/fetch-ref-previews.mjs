// 참고 작품 미리보기 그림 모으기 — 각 사이트가 링크 미리보기용으로 공개한 대표 그림(og:image · twitter:image)의 주소만 모은다.
// 그림 파일은 저장하지 않고 그 주소를 그대로 쓴다 (링크 미리보기와 같은 방식). 참고 작품을 더하면 다시: node scripts/fetch-ref-previews.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const cat = fs.readFileSync(path.join(root, 'src/catalog.ts'), 'utf8');
const block = cat.slice(cat.indexOf('export const REFS'), cat.indexOf('];', cat.indexOf('export const REFS')));
const urls = [...block.matchAll(/url:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);

const pick = (html, base) => {
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  for (const key of ['og:image', 'og:image:url', 'twitter:image', 'twitter:image:src']) {
    for (const tag of metas) {
      const k = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
      const c = /content\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
      if (k === key && c) return new URL(c.replace(/&amp;/g, '&'), base).href;
    }
  }
  return null;
};
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; ai-techstudio-preview/1.0; +https://ai-techstudio.web.app)', accept: 'text/html' };
const out = {};
await Promise.all(
  urls.map(async (u) => {
    const yt = /youtube\.com\/watch\?v=([\w-]+)/.exec(u);
    if (yt) return void (out[u] = `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg`); // 유튜브 공식 썸네일
    try {
      const r = await fetch(u, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(15000) });
      const img = pick((await r.text()).slice(0, 400000), r.url);
      if (!img) return;
      const h = await fetch(img, { method: 'GET', headers: { 'user-agent': UA['user-agent'] }, signal: AbortSignal.timeout(15000) });
      const type = h.headers.get('content-type') ?? '';
      // 프로필 사진(X 글 · 아바타)은 작품 그림이 아니라 사람 얼굴이라 쓰지 않는다
      if (/profile_images|avatars?\b|gravatar/i.test(img)) return;
      if (h.ok && type.startsWith('image/')) out[u] = img;
    } catch {
      /* 못 받은 곳은 그림 없이 */
    }
  }),
);
const sorted = Object.fromEntries(urls.filter((u) => out[u]).map((u) => [u, out[u]]));
fs.writeFileSync(
  path.join(root, 'src/refPreviews.ts'),
  `/** 참고 작품 미리보기 그림 주소 — 각 사이트가 공개한 og:image (scripts/fetch-ref-previews.mjs 가 만든다, ${new Date().toISOString().slice(0, 10)}) */\nexport const REF_PREVIEW: Record<string, string> = ${JSON.stringify(sorted, null, 2)};\n`,
);
console.log(`참고 작품 ${urls.length}개 중 미리보기 그림 ${Object.keys(sorted).length}개`);
console.log('그림 없음:\n' + urls.filter((u) => !out[u]).join('\n'));

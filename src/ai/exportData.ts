import { TECH, type Tech } from '../catalog';
import { DOMAINS, domainOf } from '../domains';
import { buildCombinedPack, buildPack, defaultDoc, recipeHead, type PromptOpts } from '../docs/prompt';
import { RECIPES } from '../docs/recipes';
import { findSourceWith } from '../docs/sourceCore';
import type { TechDoc } from '../docs/types';

/**
 * AI 용 글 뽑기 — 사람이 보는 화면(자바스크립트로 그림)은 AI 도구가 읽지 못하므로, 같은 데이터를 글 파일로 만든다.
 * scripts/export-ai.mjs 가 vite 로 이 모듈을 node 에서 불러 public/ 에 쓴다 (견본은 실행하지 않고 원문만 읽음).
 *   /llms.txt            사용법 + 전체 목록 (링크)
 *   /ai/index.json       검색용 목록 (MCP 서버도 이것을 쓴다)
 *   /ai/t/<id>.md        기술 하나 — 주문서 · 원리 · 핵심 코드 · 흔한 실수 · 완성 기준 · 견본 실제 코드 · 관련 기술
 *   /ai/recipes/<id>.md  조합 레시피 — 여러 기술을 한 장면으로
 */

export const SITE = 'https://ai-techstudio.web.app';

const DOC_MODS = import.meta.glob('../docs/docs*.ts', { eager: true }) as Record<string, { DOCS?: Record<string, TechDoc> }>;
const DOCS: Record<string, TechDoc> = Object.assign({}, ...Object.values(DOC_MODS).map((m) => m.DOCS ?? {}));
const RAW = import.meta.glob('../demos/demos*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** 견본 파일 찾기 — DEMOS 표의 열쇠로 (견본을 실행하지 않고 원문에서) */
function fileOf(id: string): string | undefined {
  const key = new RegExp(`(^|[\\s{,])${id}\\s*[:,}]`, 'm');
  for (const [p, src] of Object.entries(RAW)) {
    const at = src.search(/export const DEMOS\b/);
    if (at >= 0 && key.test(src.slice(at))) return p;
  }
  for (const [p, src] of Object.entries(RAW)) if (new RegExp(`^\\s*${id}\\s*:`, 'm').test(src)) return p;
  return undefined;
}

/** 정리한 문서가 없어 영어 용어가 빈 기술 — AI 는 주로 영어로 찾으므로 직접 적는다 (효과 예시는 만든 기술의 용어를 물려받음) */
const EXTRA_EN: Record<string, string[]> = {
  i540: ['Gear train (involute gears)', 'Gear ratio', 'Planetary gear', 'Procedural mechanical model'],
  i541: ['Engine cutaway (inline-4)', 'Crankshaft / piston / connecting rod', 'Camshaft and valves', 'Slider-crank kinematics'],
  i542: ['Industrial robot arm', 'Analytic inverse kinematics (IK)', 'Hydraulic cylinder', 'Pick and place'],
  i543: ['Turbofan jet engine cutaway', 'Twisted blade (airfoil) geometry', 'Compressor / turbine stages'],
  i544: ['Excavator', 'Tank tread (track links)', 'Hydraulic cylinder', 'Four-bar linkage'],
  i469: ['Mechanical assembly', 'Parts assembled to dimensions', 'Screw / bolt tightening animation', 'Exploded view'],
};
const enOf = (t: Tech, d: TechDoc): string[] => {
  const own = d.terms.map((x) => x.en);
  if (own.length) return own;
  if (EXTRA_EN[t.id]) return EXTRA_EN[t.id]!;
  const parent = t.of ? TECH.find((x) => x.id === t.of) : undefined;
  return parent ? docOf(parent).d.terms.map((x) => x.en) : [];
};

const docOf = (t: Tech): { d: TechDoc; auto: boolean } => (DOCS[t.id] ? { d: DOCS[t.id]!, auto: false } : { d: defaultDoc(t), auto: true });
const optsOf = (d: TechDoc): PromptOpts => ({ target: d.targets[0] ?? '내 게임', style: d.styles[0] ?? '깔끔한 기본', platform: d.platforms[0] ?? 'web', level: 2, lang: 'ko' });
const COST = { light: '가벼움 (폰 OK)', medium: '보통 (폰 주의)', heavy: '무거움' } as const;
const LEVEL = ['', '쉬움', '보통', '어려움'];
const mdUrl = (id: string): string => `${SITE}/ai/t/${id}.md`;
const pageUrl = (id: string): string => `${SITE}/#t/${id}`;
const nameOf = (id: string): string => TECH.find((x) => x.id === id)?.name ?? id;
const link = (id: string): string => `[${nameOf(id)}](${mdUrl(id)}) \`${id}\``;
/** 견본 코드가 너무 길면 앞부분만 (AI 가 읽을 양) */
const MAX_LINES = 400;
const clip = (code: string): string => {
  const ls = code.split('\n');
  return ls.length > MAX_LINES ? `${ls.slice(0, MAX_LINES).join('\n')}\n// … (${ls.length - MAX_LINES}줄 더 — 전체는 라이브 견본 페이지의 「코드」 탭)` : code;
};

export interface IndexEntry {
  id: string;
  name: string;
  en: string[];
  summary: string;
  domain: string;
  category: string;
  dim: string;
  level: string;
  cost: string;
  platforms: string[];
  /** 이 기술의 「효과 모음」에 든 예시 (같은 방법, 다른 모양) */
  variants: string[];
  /** 효과 예시라면 그것을 만든 기술 */
  of?: string;
  related: string[];
  md: string;
  page: string;
}

export async function buildAiFiles(): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const index: IndexEntry[] = [];
  const fence = '```';

  for (const t of TECH) {
    const { d } = docOf(t);
    const dom = domainOf(t.cat);
    const variants = TECH.filter((x) => x.of === t.id).map((x) => x.id);
    const related = [...new Set([...(d.prev ?? []), ...(d.next ?? []), ...(t.of ? [t.of] : [])])].filter((x) => TECH.some((y) => y.id === x));
    index.push({
      id: t.id,
      name: t.name,
      en: enOf(t, d),
      summary: d.summary,
      domain: dom.name,
      category: t.cat,
      dim: t.dim,
      level: LEVEL[d.level] ?? '',
      cost: COST[d.cost],
      platforms: d.platforms,
      variants,
      ...(t.of ? { of: t.of } : {}),
      related,
      md: `/ai/t/${t.id}.md`,
      page: pageUrl(t.id),
    });

    const src = await findSourceWith(t.id, d.source, async (p) => RAW[p] ?? null, fileOf);
    const code = src.pieces.length
      ? src.pieces.map((p) => `### ${p.label} — \`${p.file}:${p.line}\`\n${fence}ts\n${clip(p.code)}\n${fence}`).join('\n\n')
      : src.whole
        ? `### 견본 파일 전체 — \`${src.whole.file}\`\n${fence}ts\n${clip(src.whole.code)}\n${fence}`
        : '(견본 코드를 따로 찾지 못했어요 — 위 「핵심 코드」를 쓰세요)';
    const meta = [
      `- id: \`${t.id}\` · 분류: ${dom.name} › ${t.cat} · ${t.dim} · 난이도 ${LEVEL[d.level] ?? ''} · 폰 부담 ${COST[d.cost]}${d.costNote ? ` — ${d.costNote}` : ''}`,
      `- 라이브 견본 (브라우저에서 직접 조작): ${pageUrl(t.id)}`,
      d.when.length ? `- 쓰면 좋을 때: ${d.when.join(' / ')}` : '',
      d.avoid.length ? `- 쓰지 말 때: ${d.avoid.join(' / ')}` : '',
    ].filter(Boolean);
    const rel = [
      t.of ? `- 이 효과를 만든 기술: ${link(t.of)}` : '',
      variants.length ? `- 같은 방법으로 만든 효과 예시: ${variants.map(link).join(' · ')}` : '',
      d.prev?.length ? `- 먼저 알면 좋은 기술: ${d.prev.filter((x) => TECH.some((y) => y.id === x)).map(link).join(' · ')}` : '',
      d.next?.length ? `- 다음에 해 볼 기술: ${d.next.filter((x) => TECH.some((y) => y.id === x)).map(link).join(' · ')}` : '',
      d.refs?.length ? `- 참고 문서: ${d.refs.map((r) => `[${r.name}](${r.url})`).join(' · ')}` : '',
    ].filter(Boolean);
    files[`ai/t/${t.id}.md`] = [
      // 정리한 문서가 없는 기술(효과 예시 등)은 「핵심 코드」가 비어 있다 — 그 칸은 빼고 아래 견본 실제 코드로
      buildPack(t, d, optsOf(d), undefined, pageUrl(t.id))
        .replace(/## 핵심 코드 — \n[^`]*```\w*\n\s*```\n/, '')
        .trim(),
      '',
      '## 이 기술 정보',
      ...meta,
      '',
      '## 견본 실제 코드 (라이브 견본이 돌리는 코드 — three.js · TypeScript)',
      code,
      '',
      ...(rel.length ? ['## 관련 기술', ...rel, ''] : []),
    ].join('\n');
  }

  for (const r of RECIPES) {
    const items = r.techs
      .map((id) => TECH.find((x) => x.id === id))
      .filter((t): t is Tech => !!t)
      .map((t) => ({ t, d: docOf(t).d, role: r.roles?.[t.id] }));
    const o: PromptOpts = { target: r.targets[0] ?? '내 게임', style: r.styles[0] ?? '깔끔한 기본', platform: r.platforms[0] ?? 'web', level: 2, lang: 'ko' };
    files[`ai/recipes/${r.id}.md`] = [
      buildCombinedPack(items, o, recipeHead(r)).trim(),
      '',
      '## 들어간 기술 (하나씩 자세히)',
      ...r.techs.map((id) => `- ${link(id)}`),
      '',
    ].join('\n');
  }

  files['ai/index.json'] = JSON.stringify(
    { site: SITE, updated: new Date().toISOString().slice(0, 10), techniques: index, recipes: RECIPES.map((r) => ({ id: r.id, title: r.title, sub: r.sub, techs: r.techs, md: `/ai/recipes/${r.id}.md` })) },
    null,
    1,
  );

  const main = index.filter((x) => !x.of);
  files['llms.txt'] = [
    '# AI Tech Studio (AI 기술 스튜디오)',
    '',
    '> Game graphics, VFX, physics, AI and system techniques for web games (mostly three.js + TypeScript, also Canvas 2D and Web Audio), each with a live demo, a ready-to-use build spec, principles, pitfalls, acceptance checks and the actual demo source code. Content is written in Korean; English technical terms are included for each technique.',
    '',
    '게임 그래픽 · 연출 · 물리 · 시스템 기술 모음. 기술마다 라이브 견본 · AI 주문서 · 원리 · 흔한 실수 · 완성 기준 · 견본 실제 코드가 있다.',
    '',
    '## How to use (for coding agents)',
    `- Search: fetch ${SITE}/ai/index.json (fields: id, name, en[], summary, domain, category, dim, level, cost, platforms, variants, related, md). Match the user's goal against \`name\`, \`en\`, \`summary\`.`,
    `- Read: fetch ${SITE}/ai/t/<id>.md — section 「주문서」 is the spec to implement, 「완성 기준」 is the acceptance checklist, 「견본 실제 코드」 is working reference code.`,
    `- Combine: scene recipes that stack several techniques are at ${SITE}/ai/recipes/<id>.md.`,
    `- MCP: \`claude mcp add --transport http --scope user ai-techstudio ${SITE}/mcp\` (Claude Code; other tools: MCP server URL ${SITE}/mcp) gives tools search_techniques · get_technique · list_categories · list_recipes · get_recipe.`,
    `- Setup guide for people: ${SITE}/#connect`,
    '- Adapt the reference code to the user\'s project; do not copy studio-only scaffolding (demo frame, control sliders).',
    '',
    ...DOMAINS.flatMap((dm) => {
      const list = main.filter((x) => x.domain === dm.name);
      return list.length ? [`## ${dm.name} — ${dm.desc}`, ...list.map((x) => `- [${x.name}](${SITE}${x.md}): ${x.summary}${x.en[0] ? ` (${x.en[0]})` : ''}`), ''] : [];
    }),
    '## 조합 레시피 (Recipes)',
    ...RECIPES.map((r) => `- [${r.title}](${SITE}/ai/recipes/${r.id}.md): ${r.sub}`),
    '',
    `## Optional`,
    `- 효과 예시 ${index.length - main.length}개 (같은 방법으로 만든 다른 모양) — index.json 에서 \`of\` 가 있는 항목`,
    '',
  ].join('\n');

  // 검색 엔진용 — 화면은 자바스크립트라 못 읽으니 글 파일 주소를 알려 준다 (robots.txt 는 public/ 에 고정)
  const today = new Date().toISOString().slice(0, 10);
  const urls = [`${SITE}/`, `${SITE}/llms.txt`, ...index.map((x) => SITE + x.md), ...RECIPES.map((r) => `${SITE}/ai/recipes/${r.id}.md`)];
  files['sitemap.xml'] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((u) => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`),
    '</urlset>',
    '',
  ].join('\n');

  return files;
}

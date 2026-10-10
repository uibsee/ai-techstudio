import type { Tech } from '../catalog';
import type { PlatformId, Recipe, TechDoc } from './types';

/**
 * 주문서(프롬프트) 만들기 — 기술 문서(TechDoc) + 칩에서 고른 값 → AI 에 붙여 넣을 글.
 * 화면과 떨어진 순수 함수만 (DOM 없음). 기술 페이지 · 내 조합 · 레시피가 함께 쓴다.
 */

export interface PlatformInfo {
  label: string;
  env: string;
  /** 3D/2D 화면 줄 */
  screen: string;
}
export const PLATFORMS: Record<PlatformId, PlatformInfo> = {
  three: { label: '웹 · three.js', env: 'three.js r186 (ES 모듈 · TypeScript, `import * as THREE from "three"`), WebGL2, 외부 라이브러리 추가 없이', screen: '브라우저 — PC 와 폰(가로 844×390 · 세로 390×844) 모두, 60fps 목표' },
  canvas: { label: '웹 · 캔버스 2D', env: 'HTML Canvas 2D (TypeScript), requestAnimationFrame 루프, 라이브러리 없이', screen: '브라우저 — PC 와 폰(390px 폭) 모두, devicePixelRatio 맞춰 또렷하게, 60fps 목표' },
  dom: { label: '웹 · HTML/CSS', env: 'TypeScript + HTML · CSS · SVG (DOM), 라이브러리 없이 — 움직임은 transform · opacity 로', screen: '브라우저 — PC 와 폰(390px 폭) 모두, 60fps 목표' },
  webaudio: { label: '웹 · Web Audio', env: 'Web Audio API (TypeScript) — 소리 파일 없이 OscillatorNode · GainNode · BiquadFilterNode 로 합성', screen: '브라우저 — PC · 폰 모두 (폰은 첫 터치 뒤에만 소리가 난다)' },
  web: { label: '웹 · TypeScript', env: 'TypeScript (브라우저), 라이브러리 없이 — 화면과 떨어진 순수 함수로', screen: '브라우저 — PC · 폰 모두' },
  unity: { label: 'Unity', env: 'Unity 6 (URP), C#', screen: 'PC · 모바일 빌드, 60fps 목표' },
  godot: { label: 'Godot', env: 'Godot 4.x, GDScript', screen: 'PC · 모바일 빌드, 60fps 목표' },
};

export const LEVELS: { id: 1 | 2 | 3; label: string; text: string }[] = [
  { id: 1, label: '처음 해 봐요', text: '나는 이 분야가 처음이야. 단계별로 나눠 설명하고, 파일 하나로 바로 돌아가는 완성 예제를 먼저 줘. 어려운 용어는 한 줄로 풀어 줘.' },
  { id: 2, label: '해 본 적 있어요', text: '핵심 코드 위주로, 설명은 짧게. 내 프로젝트에 끼워 넣기 쉬운 함수 · 클래스로 나눠 줘.' },
  { id: 3, label: '깊게 · 최적화까지', text: '성능(프레임 시간 · 그리기 횟수 · 메모리)과 예외 상황까지 다뤄 줘. 조절할 값은 상수로 빼고 왜 그 값인지 주석으로 적어 줘.' },
];
export const LANGS: { id: 'ko' | 'en'; label: string; text: string }[] = [
  { id: 'ko', label: '한국어', text: '답변과 코드 주석은 한국어로 해 줘.' },
  { id: 'en', label: 'English', text: 'The spec above is written in Korean — please reply and write code comments in English.' },
];

export interface PromptOpts {
  target: string;
  style: string;
  platform: PlatformId;
  level: 1 | 2 | 3;
  lang: 'ko' | 'en';
}

/** 이름 + 영어 대표 용어 (이름에 이미 들어 있으면 붙이지 않음) */
export const titleOf = (t: Tech, d: TechDoc): string => {
  const en = d.terms[0]?.en;
  // 「(견본판 22가지)」 같은 스튜디오용 꼬리는 뺀다 — 그대로 주면 AI 가 22가지를 다 만든다
  const name = t.name.replace(/\s*\(견본판[^)]*\)/, '');
  return en && !name.toLowerCase().includes(en.toLowerCase()) ? `${name} — ${en}` : name;
};
/** 받침에 맞는 조사 — 「곰돌이를」 · 「캐릭터를」 · 「던전 방을」 (한글이 아니면 두 꼴 그대로) */
function josa(word: string, pair: string): string {
  const [withB, noB] = pair.split('(').map((x) => x.replace(')', '')) as [string, string];
  const c = word.trim().charCodeAt(word.trim().length - 1);
  if (!(c >= 0xac00 && c <= 0xd7a3)) return word + pair;
  const has = (c - 0xac00) % 28 !== 0;
  return word + (has ? withB : noB);
}
const fill = (s: string, o: PromptOpts): string =>
  s
    .replace(/\{(target|style)\}(을\(를\)|이\(가\)|은\(는\)|과\(와\))/g, (_, k: string, p: string) => josa(k === 'target' ? o.target : o.style, p))
    .replace(/\{target\}/g, o.target)
    .replace(/\{style\}/g, o.style);
const bullets = (xs: string[]): string => xs.map((x) => `- ${x}`).join('\n');

function envLines(native: PlatformId, d: { platformHints?: TechDoc['platformHints'] }, o: PromptOpts, dim?: string): string[] {
  const p = PLATFORMS[o.platform];
  const out = [`플랫폼: ${p.env}`, `화면: ${dim ? `${dim} · ` : ''}${p.screen}`];
  const hint = d.platformHints?.[o.platform];
  if (hint) out.push(hint);
  if (o.platform !== native) out.push(`아래 설명 · 용어는 ${PLATFORMS[native].label} 기준이야. ${p.label} 에 있는 대응 기능으로 바꿔서 구현해 줘.`);
  return out;
}
function howLines(o: PromptOpts): string[] {
  return [
    LEVELS.find((x) => x.id === o.level)!.text,
    '처음 화면에 바로 결과가 보이게, 그리고 켬/끔(또는 전/후) 비교를 할 수 있게 만들어 줘.',
    '그림 · 소리 · 모델 파일이 필요하면 코드로 만든 임시 대체물로 먼저 돌아가게 하고, 진짜 파일로 바꿀 자리를 표시해 줘.',
    '마지막에 「확인 방법」(무엇을 보면 성공인지)과 「조절할 값」 목록을 짧게 정리해 줘.',
    LANGS.find((x) => x.id === o.lang)!.text,
  ];
}

/** 기술 하나의 주문서 */
export function buildPrompt(t: Tech, d: TechDoc, o: PromptOpts, caption?: string): string {
  const terms = d.terms.length ? d.terms : [];
  const parts = [
    `# 만들어 줘: ${titleOf(t, d)}`,
    '',
    '## 1. 목표',
    fill(d.goal, o),
    caption ? `- 참고 화면: ${caption}` : '',
    '',
    '## 2. 핵심 기술 용어',
    terms.length ? bullets(terms.map((x) => (x.ko ? `**${x.en}** — ${x.ko}` : `**${x.en}**`))) : `- ${t.name} — ${t.desc}`,
    '',
    '## 3. 환경',
    bullets(envLines(d.platforms[0] ?? 'web', d, o, t.dim === '공통' ? '' : t.dim)),
    '',
    '## 4. 조건',
    bullets(d.must),
    '',
    '## 5. 완성 기준 (이게 보이면 성공)',
    bullets(d.done),
    '',
    '## 6. 진행 방식',
    bullets(howLines(o)),
  ];
  return parts.filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n').trim() + '\n';
}

/** AI 꾸러미 — 주문서 + 원리 + 핵심 코드 + 흔한 실수 + 완성 기준 체크리스트 (마크다운 한 장) */
export function buildPack(t: Tech, d: TechDoc, o: PromptOpts, caption?: string, url?: string): string {
  const fence = '```';
  return [
    `# AI 꾸러미 — ${titleOf(t, d)}`,
    `> ${d.summary}${url ? `  \n> 견본: ${url}` : ''}`,
    '',
    '이 문서를 코드 도우미(Claude Code · Cursor · ChatGPT 등)에 그대로 주면 돼요. 「## 주문서」 가 할 일, 나머지는 참고 자료예요.',
    '',
    '## 주문서',
    '',
    buildPrompt(t, d, o, caption).replace(/^# /m, '### ').replace(/^## /gm, '#### '),
    '## 원리',
    bullets(d.principle),
    '',
    `## 핵심 코드 — ${d.code.title}`,
    d.code.from ? `(발췌: ${d.code.from})` : '',
    `${fence}${d.code.lang}`,
    d.code.body.trim(),
    fence,
    '',
    '## 흔한 실수 · 확인 목록',
    d.pitfalls.length ? d.pitfalls.map((p) => `- [ ] **${p.title}** — ${p.fix}`).join('\n') : '- (아직 정리된 것이 없어요)',
    '',
    '## 완성 기준 체크리스트',
    d.done.map((x) => `- [ ] ${x}`).join('\n'),
    '',
  ]
    .filter((x) => x !== undefined)
    .join('\n');
}

export interface Item {
  t: Tech;
  d: TechDoc;
  role?: string;
}
/** 여러 기술을 한 장면으로 엮은 주문서 (내 조합 · 레시피) */
export function buildCombined(items: Item[], o: PromptOpts, head: { title: string; scene: string; must?: string[]; done?: string[] }): string {
  const native = items[0]?.d.platforms[0] ?? 'three';
  const dims = [...new Set(items.map((x) => x.t.dim).filter((x) => x !== '공통'))].join(' + ');
  const must = [...new Set([...(head.must ?? []), ...items.flatMap((x) => x.d.must.slice(0, 2))])].slice(0, 14);
  const parts = [
    `# 한 장면 만들기: ${head.title}`,
    '',
    '## 1. 목표',
    fill(head.scene, o),
    `아래 기술 ${items.length}개를 한 장면에 엮어 줘. 한 번에 다 만들지 말고 1번부터 차례로 쌓되, 단계마다 화면에서 확인할 수 있게.`,
    '',
    '## 2. 들어갈 기술 (쌓는 순서)',
    ...items.map((x, i) =>
      [
        `### ${i + 1}) ${x.t.name}${x.d.terms[0] ? ` — ${x.d.terms[0].en}` : ''}`,
        `- 역할: ${x.role ?? x.d.summary}`,
        x.d.principle[0] ? `- 핵심: ${x.d.principle[0]}` : '',
        ...x.d.done.slice(0, 2).map((y) => `- 확인: ${y}`),
      ]
        .filter(Boolean)
        .join('\n'),
    ),
    '',
    '## 3. 환경',
    bullets(envLines(native, {}, o, dims)),
    '',
    '## 4. 조건 (공통)',
    bullets(must),
    '',
    '## 5. 완성 기준 (전체)',
    bullets([...(head.done ?? []), '기술마다 켬/끔 단추가 있어 하나씩 꺼 보며 그 기술이 맡은 차이를 확인할 수 있다', '콘솔 오류 0 · 폰에서도 끊기지 않는다']),
    '',
    '## 6. 진행 방식',
    bullets(howLines(o)),
  ];
  return parts.join('\n').trim() + '\n';
}

export function buildCombinedPack(items: Item[], o: PromptOpts, head: { title: string; scene: string; must?: string[]; done?: string[] }): string {
  const fence = '```';
  return [
    `# AI 꾸러미 — ${head.title}`,
    '',
    '## 주문서',
    '',
    buildCombined(items, o, head).replace(/^# /m, '### ').replace(/^## /gm, '#### ').replace(/^### (\d)/gm, '##### $1'),
    ...items.map((x, i) =>
      [
        `## 참고 ${i + 1}. ${x.t.name} — ${x.d.code.title}`,
        `${fence}${x.d.code.lang}`,
        x.d.code.body.trim(),
        fence,
        x.d.pitfalls.length ? x.d.pitfalls.map((p) => `- [ ] **${p.title}** — ${p.fix}`).join('\n') : '',
        '',
      ].join('\n'),
    ),
  ].join('\n');
}

/* ───── 문서가 없는 기술 — catalog 만으로 기본 문서 ───── */

const ASCII = /[A-Za-z][A-Za-z0-9.+#/-]*(?:\s+[A-Za-z0-9][A-Za-z0-9.+#/-]*){0,3}/g;
function guessTerms(t: Tech): { en: string; ko: string }[] {
  const out: string[] = [];
  for (const m of `${t.name} ${t.desc}`.match(ASCII) ?? []) {
    const s = m.trim();
    if (s.length >= 3 && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  return out.slice(0, 4).map((en) => ({ en, ko: '' }));
}
export function defaultDoc(t: Tech, caption?: string): TechDoc {
  const sound = /소리|SFX/.test(t.cat);
  const platforms: PlatformId[] = sound ? ['webaudio', 'unity', 'godot'] : t.dim === '3D' ? ['three', 'unity', 'godot'] : t.dim === '2D' ? ['canvas', 'unity', 'godot'] : ['web', 'three', 'canvas', 'unity', 'godot'];
  const targets =
    t.status === 'idea' && t.where
      ? [...t.where.split(/\s*·\s*/).slice(0, 3), '내 게임 장면']
      : t.dim === '3D'
        ? ['3D 장면의 물체', '캐릭터', '게임 화면']
        : t.dim === '2D'
          ? ['2D 게임 화면', '캔버스 그림', '설명 화면']
          : ['내 게임', '웹 화면', '설명 화면'];
  const must = sound
    ? ['사용자가 처음 누를 때 AudioContext 를 만들거나 resume() — 그 전엔 소리가 안 난다', '소리 파일 없이 코드로 합성', '마지막에 GainNode 로 크기를 제한해 찢어지는 소리(클리핑)가 없게']
    : t.dim === '3D'
      ? ['한 프레임 16ms 안 (폰 포함) — 무거운 계산은 처음에 한 번 또는 여러 프레임에 나눠서', '새 재질 · 셰이더는 첫 화면 전에 미리 컴파일 (renderer.compileAsync)', '화면 가장자리 흐림 · 비네트로 얼버무리지 않기', '외부 라이브러리 추가 없이 three.js 와 three/examples 만']
      : t.dim === '2D'
        ? ['devicePixelRatio 를 맞춰 또렷하게', '매 프레임 다시 그릴 필요 없는 그림은 화면 밖 캔버스에 미리 구워 두기', '한 프레임 16ms 안 (폰 포함)']
        : ['화면 코드와 계산 코드를 나눠서 (계산은 순수 함수)', '한 프레임 16ms 안 — 오래 걸리는 계산은 나눠서'];
  return {
    id: t.id,
    summary: t.desc,
    terms: guessTerms(t),
    goal: `{target}에 「${t.name}」 기술을 {style} 느낌으로 넣어 줘. — ${t.desc}`,
    targets,
    styles: ['깔끔한 기본', '귀엽고 아기자기', '어둡고 진지한'],
    platforms,
    principle: caption && caption !== t.desc ? [t.desc, `견본 화면: ${caption}`] : [t.desc],
    when: t.status === 'idea' && t.where ? [`쓰면 좋을 곳 — ${t.where}`] : [],
    avoid: [],
    cost: 'medium',
    costNote: '',
    level: t.lv === '상' ? 3 : t.lv === '하' ? 1 : 2,
    must,
    done: [
      `견본처럼 「${caption ?? t.desc}」 이(가) 첫 화면에서 바로 보인다`,
      '켬/끔(또는 전/후) 비교 단추로 이 기술이 만드는 차이를 확인할 수 있다',
      '중요한 값 1~3개를 슬라이더로 바꿔 볼 수 있다',
      '콘솔 오류 0, 폰 폭(390px)에서도 동작한다',
    ],
    code: { lang: 'ts', title: '', body: '' },
    pitfalls: [],
  };
}

export function recipeHead(r: Recipe): { title: string; scene: string; must: string[]; done: string[] } {
  return { title: r.title, scene: r.scene, must: r.must, done: r.done };
}

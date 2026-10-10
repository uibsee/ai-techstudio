/**
 * 기술 문서 규격 — 「AI 로 만드는 사람」이 가장 편한 기술 페이지를 만드는 데이터.
 *
 * 한 기술 = TechDoc 하나 (`src/studio/docs/docs*.ts` 의 `export const DOCS: Record<string, TechDoc>`).
 * 파일은 import.meta.glob 으로 저절로 모인다 — 새 문서는 파일 하나에 줄만 더하면 된다.
 * 문서가 없는 기술은 catalog 의 이름 · 설명 · 분류 · 차원으로 기본 문서를 만든다 (prompt.ts defaultDoc).
 *
 * 프롬프트(주문서)는 이 데이터로 만든다:
 *   목표(goal) · 핵심 용어(terms) · 환경(platforms + 칩) · 조건(must) · 완성 기준(done) · 진행 방식(칩)
 * 사람용 정보도 같은 데이터에서: summary · principle · when/avoid · cost · level · code · pitfalls · prev/next · refs
 *
 * 작성 지침: docs/studio/doc-writing-guide.md
 */

/** 만들 곳 — 칩으로 고른다. 문서마다 맞는 것만 platforms 에 */
export type PlatformId = 'three' | 'canvas' | 'dom' | 'webaudio' | 'web' | 'unity' | 'godot';

/** 폰 부담 — light: 폰 OK · medium: 주의 · heavy: 무거움 */
export type Cost = 'light' | 'medium' | 'heavy';

export interface Term {
  /** 영어 표준 용어 (AI 가 가장 잘 알아듣는 이름) */
  en: string;
  /** 한국어 풀이 한 줄 */
  ko: string;
}

export interface Pitfall {
  /** 짧은 제목 — 「~하면 ~된다」 */
  title: string;
  /** 왜 · 어떻게 피하나 (1~2문장). 이 사이트에서 실제로 겪은 것이면 seen: true */
  fix: string;
  seen?: boolean;
}

export interface CodeBlock {
  lang: 'ts' | 'js' | 'glsl' | 'cs' | 'gd';
  /** 무엇을 보여 주는 코드인지 */
  title: string;
  /** 10~30줄. 붙여 넣으면 돌아가는(또는 바로 이어 붙일 수 있는) 실제 코드 */
  body: string;
  /** 어디서 발췌했나 (견본 파일 · 함수) — 새로 쓴 것이면 비움 */
  from?: string;
}

export interface TechDoc {
  id: string;
  /** 사람용 한 줄 요약 (무엇이 · 어떻게 달라지나) */
  summary: string;
  /** 영어 표준 용어 — 첫 번째가 대표 이름 */
  terms: Term[];
  /**
   * 프롬프트 「목표」 문장. 자리표시: {target} 대상 · {style} 분위기.
   * 예) '{target}을(를) {style} 느낌의 툰 셰이딩으로 그려 줘.'
   */
  goal: string;
  /** 「대상」 칩 후보 (첫 번째가 기본) */
  targets: string[];
  /** 「분위기 · 그림체」 칩 후보 (첫 번째가 기본) */
  styles: string[];
  /** 맞는 플랫폼 (첫 번째가 기본) */
  platforms: PlatformId[];
  /** 플랫폼별로 덧붙일 한 줄 (그 엔진의 대응 기능 이름 등) */
  platformHints?: Partial<Record<PlatformId, string>>;
  /** 원리 3~5줄 */
  principle: string[];
  /** 언제 쓰나 / 쓰지 말 때 */
  when: string[];
  avoid: string[];
  cost: Cost;
  /** 비용 한 줄 풀이 (무엇이 무겁나 · 폰에서 어떻게) */
  costNote: string;
  /** 1 쉬움 · 2 보통 · 3 어려움 */
  level: 1 | 2 | 3;
  /** 프롬프트 「조건」 — 성능 예산 · 금지 사항 · 꼭 지킬 것 */
  must: string[];
  /** 프롬프트 「완성 기준」 — 무엇이 보이면 성공인가 (켬/끔 비교 · 확인 방법 포함) */
  done: string[];
  code: CodeBlock;
  pitfalls: Pitfall[];
  /** 먼저 알면 좋은 기술 · 다음에 해 볼 기술 (catalog id) */
  prev?: string[];
  next?: string[];
  /** 참고 — 실제로 있는 문서 · 공식 예제만 */
  refs?: { name: string; url: string }[];
  /** 견본 코드 위치를 직접 지정 (없으면 기술 id 로 견본 파일에서 찾는다). file 은 demos 폴더 안 파일 이름 */
  source?: { file: string; symbol: string }[];
}

/** 조합 레시피 — 「이런 장면을 만들고 싶다」에서 출발 */
export interface Recipe {
  id: string;
  title: string;
  /** 한 줄 설명 */
  sub: string;
  /** 대표 견본 (완성 장면) — catalog id */
  hero: string;
  /** 들어간 기술 — 쌓는 순서대로 */
  techs: string[];
  /** 합친 프롬프트의 목표 문장 ({target} {style} 자리표시 가능) */
  scene: string;
  targets: string[];
  styles: string[];
  platforms: PlatformId[];
  /** 레시피 전체에 걸린 조건 · 완성 기준 (기술별 것 위에 덧붙임) */
  must: string[];
  done: string[];
  /** 기술마다 이 장면에서 맡는 역할 (없으면 summary) */
  roles?: Record<string, string>;
}

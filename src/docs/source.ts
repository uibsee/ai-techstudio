import { findSourceWith, type Piece } from './sourceCore';
import type { DemoMap } from '../demos/types';

/**
 * 「견본 전체 코드 보기」 — 견본 파일 원문을 눌렀을 때만 받아(?raw, 지연 로드) 그 기술 부분을 찾아 준다.
 *  1) 문서에 source(file · symbol) 가 있으면 그 함수 · 상수
 *  2) 없으면 기술 id 항목 — `i446: { … }` 이면 그 항목 + 부르는 make 함수, `i90,` · `i199: D199,` 이면 그 이름의 정의
 *  3) 찾기 어려우면 파일 전체 + 위치 안내
 */
const RAW = import.meta.glob('../demos/demos*.ts', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;
const MODS = import.meta.glob('../demos/demos*.ts', { eager: true }) as Record<string, { DEMOS?: DemoMap }>;

/** 그 기술 견본이 든 파일 (../demos/demosX.ts) */
export function fileOfDemo(id: string): string | undefined {
  for (const [p, m] of Object.entries(MODS)) if (m.DEMOS && Object.prototype.hasOwnProperty.call(m.DEMOS, id)) return p;
  return undefined;
}

export type { Piece };

export const findSource = (id: string, hint?: { file: string; symbol: string }[]): ReturnType<typeof findSourceWith> =>
  findSourceWith(id, hint, async (p) => (RAW[p] ? RAW[p]!() : null), fileOfDemo);

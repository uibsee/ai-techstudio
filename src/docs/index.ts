import { TECH, type Tech } from '../catalog';
import { DEMOS } from '../hub';
import { defaultDoc } from './prompt';
import type { TechDoc } from './types';

/**
 * 기술 문서 모음 — docs*.ts 파일을 저절로 모은다 (파일이 없어도 멈추지 않음).
 * docOf(t) 는 문서가 없으면 catalog 로 만든 기본 문서를 준다 (auto = true).
 */
const mods = import.meta.glob('./docs*.ts', { eager: true }) as Record<string, { DOCS?: Record<string, TechDoc> }>;
export const DOCS: Record<string, TechDoc> = Object.assign({}, ...Object.values(mods).map((m) => m.DOCS ?? {}));

export const techOf = (id: string): Tech | undefined => TECH.find((x) => x.id === id);
export const captionOf = (id: string): string | undefined => DEMOS[id]?.caption;

export function docOf(t: Tech): { d: TechDoc; auto: boolean } {
  const d = DOCS[t.id];
  return d ? { d, auto: false } : { d: defaultDoc(t, captionOf(t.id)), auto: true };
}

/** 페이지 주소 (꾸러미에 적는 견본 링크) */
export const pageUrl = (hash: string): string => `${location.origin}${location.pathname}#${hash}`;

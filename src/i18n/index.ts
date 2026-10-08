/** 수학 놀이터에서 가져온 게임 무대가 쓰는 번역 함수 — 스튜디오는 한국어만 (한국어 글이 번역 키라 {0} 자리만 채워 돌려준다) */
export function t(ko: string, vars?: Record<string, string | number>): string {
  return vars ? ko.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : ko;
}

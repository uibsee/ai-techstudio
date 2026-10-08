/**
 * 숫자 야구 — 규칙 · 후보 계산 · 추천 수 (화면과 상관없는 순수 계산, node 로도 돈다)
 *
 * 숨은 수: 서로 다른 숫자 n 개(가능한 숫자 lo ~ hi). 부를 때마다 자리 · 숫자가 같으면 스트라이크, 숫자만 있으면 볼, 하나도 없으면 아웃.
 * 후보 = 지금까지의 단서와 맞는 모든 수. 추천 수 = 나올 수 있는 결과마다 남는 후보 수 중 가장 큰 값이 가장 작은 수(미니맥스).
 * 단계: 놀이 판(정해진 횟수 안에 맞히기, 횟수는 미니맥스 전략의 최악 횟수 + 여유) · 추리 판(주어진 단서로 후보가 하나뿐 — 한 번에 맞히기).
 */

export interface BallLevel {
  name?: string;
  n: number;
  lo: number;
  hi: number;
  /** 놀이 판: 이 안에 맞히면 성공(별 기준) */
  tries: number;
  /** 정해진 숨은 수 (단계 · 추리 판) — 없으면 자유 놀이가 무작위로 */
  secret?: string;
  /** 추리 판: 미리 주어진 단서 */
  given?: { g: string; s: number; b: number }[];
  world?: string;
}

export interface Clue {
  g: string;
  s: number;
  b: number;
}

export function score(secret: string, guess: string): { s: number; b: number } {
  let s = 0;
  let b = 0;
  for (let i = 0; i < guess.length; i++) {
    if (secret[i] === guess[i]) s++;
    else if (secret.includes(guess[i]!)) b++;
  }
  return { s, b };
}

export function allCodes(n: number, lo: number, hi: number): string[] {
  const out: string[] = [];
  const digits = Array.from({ length: hi - lo + 1 }, (_, i) => String(lo + i));
  const go = (cur: string): void => {
    if (cur.length === n) {
      out.push(cur);
      return;
    }
    for (const d of digits) if (!cur.includes(d)) go(cur + d);
  };
  go('');
  return out;
}

export function candidates(lv: BallLevel, clues: Clue[]): string[] {
  return allCodes(lv.n, lv.lo, lv.hi).filter((c) => clues.every((k) => {
    const r = score(c, k.g);
    return r.s === k.s && r.b === k.b;
  }));
}

/** 미니맥스 추천 — pool 이 크면 일부만 본다(화면에서 멈추지 않게) */
export function bestGuess(cands: string[], pool: string[], limit = 400): string {
  if (cands.length <= 2) return cands[0]!;
  let list = pool;
  if (list.length > limit) {
    const step = Math.ceil(list.length / limit);
    list = [...cands.slice(0, Math.min(cands.length, limit / 2)), ...pool.filter((_, i) => i % step === 0)];
  }
  const cset = new Set(cands);
  let best = cands[0]!;
  let bestW = Infinity;
  let bestIn = false;
  for (const g of list) {
    const parts = new Map<number, number>();
    for (const c of cands) {
      const r = score(c, g);
      const k = r.s * 10 + r.b;
      parts.set(k, (parts.get(k) ?? 0) + 1);
    }
    const w = Math.max(...parts.values());
    const inC = cset.has(g);
    if (w < bestW || (w === bestW && inC && !bestIn)) {
      bestW = w;
      best = g;
      bestIn = inC;
    }
  }
  return best;
}

/** 미니맥스 전략으로 가장 오래 걸리는 경우의 부르기 수 (단계 만들 때) */
export function worstCase(lv: BallLevel): number {
  const pool = allCodes(lv.n, lv.lo, lv.hi);
  const go = (cands: string[], depth: number): number => {
    if (cands.length === 1) return depth + 1;
    const g = bestGuess(cands, pool, 2000);
    const parts = new Map<string, string[]>();
    for (const c of cands) {
      const r = score(c, g);
      if (r.s === lv.n) continue;
      const k = `${r.s}${r.b}`;
      (parts.get(k) ?? parts.set(k, []).get(k)!).push(c);
    }
    let worst = cands.includes(g) ? depth + 1 : 0;
    for (const p of parts.values()) worst = Math.max(worst, go(p, depth + 1));
    return worst;
  };
  return go(pool, 0);
}

export function randomCode(lv: BallLevel, rnd: () => number = Math.random): string {
  const all = allCodes(lv.n, lv.lo, lv.hi);
  return all[Math.floor(rnd() * all.length)]!;
}

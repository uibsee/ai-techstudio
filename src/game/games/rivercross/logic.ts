/**
 * 강 건너기 — 규칙 · 풀이기 · 판 만들기 (화면과 상관없는 순수 계산, node 로도 돈다)
 *
 * 모두를 왼쪽 강가에서 오른쪽 강가로 옮긴다. 배는 정해진 수(와 무게)까지 태우고, 노 젓는 친구가 꼭 타야 움직인다.
 * 지켜야 할 것:
 *   - eat: [먹는 쪽, 먹히는 쪽] 이 같은 강가에 있고 지킴이(guard 종류)가 없으면 실패 (늑대 · 염소 · 양배추)
 *   - outnumber: 한 강가에 토끼가 있는데 여우가 토끼보다 많으면 실패 (배가 닿은 강가는 배에 탄 친구도 센다)
 * 상태 = 친구마다 어느 쪽(0 왼 · 1 오른) + 배 위치. 너비 우선 탐색으로 가장 적은 건너기 수(par)를 구한다.
 * 이야기 틀(고전 수학 퍼즐)은 공공 영역, 단계 조합은 우리가 만들어 풀이기로 확인.
 */

export type Kind = 'farmer' | 'kid' | 'wolf' | 'goat' | 'cabbage' | 'rabbit' | 'fox' | 'bear' | 'dog' | 'cat' | 'mouse' | 'cheese' | 'mom' | 'dad' | 'grandpa';

export interface Rider {
  kind: Kind;
  /** 무게 (kg) — 무게 제한 판에서만 */
  w?: number;
}
export interface RiverLevel {
  name: string;
  riders: Rider[];
  /** 배에 타는 최대 수 */
  cap: number;
  /** 배 최대 무게 (없으면 무게 상관없음) */
  maxW?: number;
  /** 노 저을 수 있는 종류 (없으면 모두) */
  rowers?: Kind[];
  /** 먹는 짝 */
  eat?: [Kind, Kind][];
  /** 지킴이 — 같은 강가에 있으면 먹지 못한다 */
  guard?: Kind[];
  /** [수가 많으면 위험한 쪽, 지켜야 할 쪽] */
  outnumber?: [Kind, Kind];
  par: number;
  world?: string;
}

export interface RState {
  side: number[];
  boat: number;
}

export const done = (s: RState): boolean => s.side.every((v) => v === 1);
const key = (s: RState): string => s.side.join('') + s.boat;

/** 강가 하나가 안전한가 — who = 그 강가에 있는 친구 번호들 */
export function bankProblem(lv: RiverLevel, who: number[]): { kind: 'eat' | 'outnumber'; a: number; b: number } | null {
  const kinds = who.map((i) => lv.riders[i]!.kind);
  const guarded = (lv.guard ?? []).some((g) => kinds.includes(g));
  if (!guarded)
    for (const [p, q] of lv.eat ?? []) {
      const a = who.find((i) => lv.riders[i]!.kind === p);
      const b = who.find((i) => lv.riders[i]!.kind === q);
      if (a !== undefined && b !== undefined) return { kind: 'eat', a, b };
    }
  if (lv.outnumber) {
    const [big, small] = lv.outnumber;
    const nb = kinds.filter((k) => k === big).length;
    const ns = kinds.filter((k) => k === small).length;
    if (ns > 0 && nb > ns) return { kind: 'outnumber', a: who.find((i) => lv.riders[i]!.kind === big)!, b: who.find((i) => lv.riders[i]!.kind === small)! };
  }
  return null;
}

/** 이 무리로 배를 띄울 수 있나 — 까닭을 돌려준다 (null = 됨) */
export function boatProblem(lv: RiverLevel, group: number[]): 'empty' | 'cap' | 'weight' | 'rower' | null {
  if (!group.length) return 'empty';
  if (group.length > lv.cap) return 'cap';
  if (lv.maxW !== undefined && group.reduce((a, i) => a + (lv.riders[i]!.w ?? 0), 0) > lv.maxW) return 'weight';
  if (lv.rowers && !group.some((i) => lv.rowers!.includes(lv.riders[i]!.kind))) return 'rower';
  return null;
}

/** 건너기 — 새 상태와 (있으면) 문제. 건넌 뒤 두 강가를 본다 */
export function cross(lv: RiverLevel, s: RState, group: number[]): { next: RState; problem: ReturnType<typeof bankProblem> } {
  const side = [...s.side];
  for (const i of group) side[i] = 1 - s.boat;
  const next = { side, boat: 1 - s.boat };
  const left = side.flatMap((v, i) => (v === 0 ? [i] : []));
  const right = side.flatMap((v, i) => (v === 1 ? [i] : []));
  return { next, problem: bankProblem(lv, left) ?? bankProblem(lv, right) };
}

function subsets(items: number[], max: number): number[][] {
  const out: number[][] = [];
  const go = (start: number, cur: number[]): void => {
    if (cur.length) out.push([...cur]);
    if (cur.length === max) return;
    for (let k = start; k < items.length; k++) {
      cur.push(items[k]!);
      go(k + 1, cur);
      cur.pop();
    }
  };
  go(0, []);
  return out;
}

/** 가장 적은 건너기 — 무리 차례 (못 풀면 null) */
export function solve(lv: RiverLevel, from?: RState): number[][] | null {
  const start: RState = from ?? { side: lv.riders.map(() => 0), boat: 0 };
  if (done(start)) return [];
  const prev = new Map<string, { k: string; g: number[]; s: RState } | null>([[key(start), null]]);
  const q: RState[] = [start];
  for (let h = 0; h < q.length; h++) {
    const s = q[h]!;
    const here = s.side.flatMap((v, i) => (v === s.boat ? [i] : []));
    for (const g of subsets(here, lv.cap)) {
      if (boatProblem(lv, g)) continue;
      const { next, problem } = cross(lv, s, g);
      if (problem) continue;
      const k = key(next);
      if (prev.has(k)) continue;
      prev.set(k, { k: key(s), g, s });
      if (done(next)) {
        const path: number[][] = [];
        let cur: string | undefined = k;
        while (cur) {
          const p = prev.get(cur);
          if (!p) break;
          path.unshift(p.g);
          cur = p.k;
        }
        return path;
      }
      q.push(next);
    }
  }
  return null;
}

/** 갈 수 있는 상태 수 (수학 이야기) */
export function stateCount(lv: RiverLevel): number {
  const start: RState = { side: lv.riders.map(() => 0), boat: 0 };
  const seen = new Set([key(start)]);
  const q = [start];
  for (let h = 0; h < q.length; h++) {
    const s = q[h]!;
    const here = s.side.flatMap((v, i) => (v === s.boat ? [i] : []));
    for (const g of subsets(here, lv.cap)) {
      if (boatProblem(lv, g)) continue;
      const { next, problem } = cross(lv, s, g);
      if (problem || seen.has(key(next))) continue;
      seen.add(key(next));
      q.push(next);
    }
  }
  return seen.size;
}

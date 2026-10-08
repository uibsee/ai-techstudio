/**
 * 빵빵 주차장 탈출 — 규칙 · 풀이기 · 판 만들기 (차 밀어 빼기 퍼즐. 단계는 모두 이 풀이기로 새로 만든다 — 원작 카드 배치를 옮기지 않는다) (화면과 상관없는 순수 계산, node 로도 돈다)
 *
 * 판 글자: '.' 빈칸 · 'x' 막힌 칸(고깔) · 'A' 빨간 차(주인공, 가로) · 'B'~'Z' 다른 차 (같은 글자가 이어진 칸이 한 대).
 * 차는 놓인 방향(가로 · 세로)으로만 미끄러진다. 한 번 움직이면 몇 칸을 가든 1수.
 * 빨간 차가 자기 줄 오른쪽 끝(출구)에 닿으면 끝.
 */

export interface Car {
  len: number;
  horiz: boolean;
  /** 가로 차는 줄(y), 세로 차는 칸(x) */
  fixed: number;
}

export interface Rush {
  w: number;
  h: number;
  cars: Car[];
  wall: Uint8Array;
}

export interface RushLevel {
  rows: string[];
  /** 가장 적은 수 */
  par: number;
  world?: string;
}

export interface Move {
  car: number;
  to: number;
}

export function parse(rows: string[]): { b: Rush; pos: number[] } {
  const h = rows.length;
  const w = rows[0]!.length;
  const wall = new Uint8Array(w * h);
  const seen = new Map<string, { xs: number[]; ys: number[] }>();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = rows[y]![x]!;
      if (c === 'x') wall[y * w + x] = 1;
      else if (c !== '.') {
        const e = seen.get(c) ?? { xs: [], ys: [] };
        e.xs.push(x);
        e.ys.push(y);
        seen.set(c, e);
      }
    }
  const letters = [...seen.keys()].sort((a, c) => (a === 'A' ? -1 : c === 'A' ? 1 : a.localeCompare(c)));
  const cars: Car[] = [];
  const pos: number[] = [];
  for (const k of letters) {
    const { xs, ys } = seen.get(k)!;
    const horiz = new Set(ys).size === 1 && xs.length > 1;
    cars.push({ len: xs.length, horiz, fixed: horiz ? ys[0]! : xs[0]! });
    pos.push(horiz ? Math.min(...xs) : Math.min(...ys));
  }
  return { b: { w, h, cars, wall }, pos };
}

export function toRows(b: Rush, pos: readonly number[]): string[] {
  const g: string[][] = Array.from({ length: b.h }, (_, y) => Array.from({ length: b.w }, (_, x) => (b.wall[y * b.w + x] ? 'x' : '.')));
  const names = 'ABCDEFGHIJKLMNOPQRSTUVWYZ';
  b.cars.forEach((c, i) => {
    for (let k = 0; k < c.len; k++) {
      const x = c.horiz ? pos[i]! + k : c.fixed;
      const y = c.horiz ? c.fixed : pos[i]! + k;
      g[y]![x] = names[i]!;
    }
  });
  return g.map((r) => r.join(''));
}

/** 칸마다 차 번호 (-1 빈칸 · -2 막힌 칸) */
export function occupancy(b: Rush, pos: readonly number[]): Int8Array {
  const o = new Int8Array(b.w * b.h).fill(-1);
  for (let i = 0; i < b.w * b.h; i++) if (b.wall[i]) o[i] = -2;
  b.cars.forEach((c, i) => {
    for (let k = 0; k < c.len; k++) o[c.horiz ? c.fixed * b.w + pos[i]! + k : (pos[i]! + k) * b.w + c.fixed] = i;
  });
  return o;
}

/** 차 i 가 갈 수 있는 범위 [가장 앞(작은 쪽), 가장 뒤(큰 쪽)] */
export function range(b: Rush, pos: readonly number[], i: number, occ = occupancy(b, pos)): [number, number] {
  const c = b.cars[i]!;
  const at = (p: number): number => (c.horiz ? c.fixed * b.w + p : p * b.w + c.fixed);
  const lim = c.horiz ? b.w : b.h;
  let lo = pos[i]!;
  while (lo - 1 >= 0 && occ[at(lo - 1)] === -1) lo--;
  let hi = pos[i]!;
  while (hi + c.len < lim && occ[at(hi + c.len)] === -1) hi++;
  return [lo, hi];
}

export const solved = (b: Rush, pos: readonly number[]): boolean => pos[0] === b.w - b.cars[0]!.len;

export function moves(b: Rush, pos: readonly number[]): Move[] {
  const occ = occupancy(b, pos);
  const out: Move[] = [];
  for (let i = 0; i < b.cars.length; i++) {
    const [lo, hi] = range(b, pos, i, occ);
    for (let p = lo; p <= hi; p++) if (p !== pos[i]) out.push({ car: i, to: p });
  }
  return out;
}

/** 가장 적은 수 풀이 (너비 우선) — 못 찾으면 null */
export function solve(b: Rush, start: readonly number[], limit = 300_000): Move[] | null {
  if (solved(b, start)) return [];
  const key = (p: readonly number[]): string => p.join(',');
  const prev = new Map<string, [string, Move] | null>([[key(start), null]]);
  let layer: number[][] = [[...start]];
  while (layer.length) {
    const next: number[][] = [];
    for (const p of layer) {
      const pk = key(p);
      for (const m of moves(b, p)) {
        const np = [...p];
        np[m.car] = m.to;
        const nk = key(np);
        if (prev.has(nk)) continue;
        prev.set(nk, [pk, m]);
        if (solved(b, np)) {
          const out: Move[] = [];
          for (let e = prev.get(nk); e; e = prev.get(e[0])) out.unshift(e[1]);
          return out;
        }
        if (prev.size > limit) return null;
        next.push(np);
      }
    }
    layer = next;
  }
  return null;
}

/** 너비 우선 겹 — 1수 · 2수 … 만에 처음 닿는 서로 다른 배치 수 (풀리는 겹까지) */
export function layers(b: Rush, start: readonly number[], maxDepth = 80): number[] {
  const key = (p: readonly number[]): string => p.join(',');
  const seen = new Set([key(start)]);
  let layer: number[][] = [[...start]];
  const out: number[] = [];
  for (let d = 0; d < maxDepth && layer.length; d++) {
    const next: number[][] = [];
    let found = false;
    for (const p of layer)
      for (const m of moves(b, p)) {
        const np = [...p];
        np[m.car] = m.to;
        const nk = key(np);
        if (seen.has(nk)) continue;
        seen.add(nk);
        next.push(np);
        if (solved(b, np)) found = true;
      }
    out.push(next.length);
    layer = next;
    if (found) break;
  }
  return out;
}

/**
 * 막는 차 사슬 — 빨간 차 길을 막은 차는 1단계, 그 차가 비키려면 치워야 하는 차는 2단계 …
 * (차마다 가장 얕은 단계, 막지 않는 차는 0)
 */
export function blockDepth(b: Rush, pos: readonly number[]): number[] {
  const occ = occupancy(b, pos);
  const depth = new Array<number>(b.cars.length).fill(0);
  const red = b.cars[0]!;
  let frontier: number[] = [];
  for (let x = pos[0]! + red.len; x < b.w; x++) {
    const o = occ[red.fixed * b.w + x]!;
    if (o >= 0 && !depth[o]) {
      depth[o] = 1;
      frontier.push(o);
    }
  }
  for (let d = 2; frontier.length && d < 10; d++) {
    const next: number[] = [];
    for (const i of frontier) {
      // 차 i 가 막고 있는 줄(빨간 차 줄이나 앞 단계 차의 길)을 비우려면 갈 수 있는 가장 가까운 자리 — 그 사이 칸을 막은 차
      const c = b.cars[i]!;
      const lim = c.horiz ? b.w : b.h;
      for (const dir of [-1, 1]) {
        for (let k = 1; k <= c.len; k++) {
          const p = dir < 0 ? pos[i]! - k : pos[i]! + c.len - 1 + k;
          if (p < 0 || p >= lim) break;
          const cell = c.horiz ? c.fixed * b.w + p : p * b.w + c.fixed;
          const o = occ[cell]!;
          if (o >= 0 && o !== 0 && !depth[o]) {
            depth[o] = d;
            next.push(o);
          }
        }
      }
    }
    frontier = next;
  }
  return depth;
}

/* ───────────── 판 만들기 ───────────── */

export interface GenSpec {
  cars: [number, number];
  /** 트럭(3칸) 비율 */
  trucks?: number;
  walls?: number;
  /** 한 덩어리에서 둘러볼 배치 수 */
  limit?: number;
}

/**
 * 어려운 판 만들기 — 차를 무작위로 놓은 배치에서 갈 수 있는 모든 배치(한 덩어리)를 넓힌 뒤,
 * 다 푼 배치들에서 거꾸로 너비 우선으로 거리를 재 가장 먼 배치를 출발 판으로 삼는다 (움직임은 되돌릴 수 있다).
 */
export function generate(spec: GenSpec, rnd: () => number = Math.random, tries = 10): RushLevel | null {
  const W = 6;
  const H = 6;
  const pickN = ([a, c]: [number, number]): number => a + Math.floor(rnd() * (c - a + 1));
  let best: RushLevel | null = null;
  for (let t = 0; t < tries; t++) {
    const wall = new Uint8Array(W * H);
    const cars: Car[] = [{ len: 2, horiz: true, fixed: 2 }];
    const pos: number[] = [Math.floor(rnd() * 3)];
    const b: Rush = { w: W, h: H, cars, wall };
    for (let k = 0; k < (spec.walls ?? 0); k++) {
      const c = Math.floor(rnd() * W * H);
      if (Math.floor(c / W) !== 2) wall[c] = 1;
    }
    const want = pickN(spec.cars);
    for (let tries2 = 0; tries2 < 200 && cars.length < want; tries2++) {
      const len = rnd() < (spec.trucks ?? 0.3) ? 3 : 2;
      const horiz = rnd() < 0.5;
      const fixed = Math.floor(rnd() * (horiz ? H : W));
      if (horiz && fixed === 2) continue; // 빨간 차 줄에 가로 차는 넣지 않는다 (영원히 막힌다)
      const p = Math.floor(rnd() * ((horiz ? W : H) - len + 1));
      cars.push({ len, horiz, fixed });
      pos.push(p);
      const occ = new Int8Array(W * H);
      let ok = true;
      for (let i = 0; i < W * H; i++) if (wall[i]) occ[i] = 1;
      cars.forEach((c, i) => {
        for (let q = 0; q < c.len; q++) {
          const cell = c.horiz ? c.fixed * W + pos[i]! + q : (pos[i]! + q) * W + c.fixed;
          if (occ[cell]) ok = false;
          occ[cell] = 1;
        }
      });
      if (!ok) {
        cars.pop();
        pos.pop();
      }
    }
    if (cars.length < spec.cars[0]) continue;
    // 한 덩어리 넓히기
    const key = (p: readonly number[]): string => p.join(',');
    const all = new Map<string, number[]>([[key(pos), [...pos]]]);
    let layer = [[...pos]];
    const limit = spec.limit ?? 40_000;
    while (layer.length && all.size < limit) {
      const next: number[][] = [];
      for (const p of layer)
        for (const m of moves(b, p)) {
          const np = [...p];
          np[m.car] = m.to;
          const k = key(np);
          if (all.has(k)) continue;
          all.set(k, np);
          next.push(np);
        }
      layer = next;
    }
    if (all.size >= limit) continue;
    // 다 푼 배치에서 거꾸로
    const dist = new Map<string, number>();
    let q: number[][] = [];
    for (const [k, p] of all)
      if (solved(b, p)) {
        dist.set(k, 0);
        q.push(p);
      }
    if (!q.length) continue;
    let far: number[] = q[0]!;
    let fd = 0;
    for (let d = 1; q.length; d++) {
      const next: number[][] = [];
      for (const p of q)
        for (const m of moves(b, p)) {
          const np = [...p];
          np[m.car] = m.to;
          const k = key(np);
          if (dist.has(k)) continue;
          dist.set(k, d);
          next.push(np);
          if (d > fd) {
            fd = d;
            far = np;
          }
        }
      q = next;
    }
    if (fd < 1) continue;
    // 아무 데도 안 가는 차는 빼고 정리 (그대로 두어도 되지만 판이 지저분하다) — 그대로 둔다: 막는 재미
    const lv = { rows: toRows(b, far), par: fd };
    if (!best || lv.par > best.par) best = lv;
  }
  return best;
}

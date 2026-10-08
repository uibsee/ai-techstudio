/**
 * 꼬마 창고지기 — 상자 밀기 규칙 · 풀이기 · 판 만들기 (화면과 상관없는 순수 계산, node 로도 돈다)
 *
 * 판 글자: '#' 벽 · ' ' 바닥 · '.' 자리 · '$' 상자 · '*' 자리 위 상자 · '@' 사람 · '+' 자리 위 사람 · '_' 바깥(아무것도 없음)
 * 칸 번호 = y * w + x, y 는 아래로 (글자 줄 순서 그대로).
 * 사람은 한 칸씩 걷고, 상자 쪽으로 걸으면 그 너머가 비었을 때 상자를 한 칸 민다. 당기기 · 상자 두 개 밀기는 없다.
 */

export type Dir = 0 | 1 | 2 | 3;
/** 오른쪽 · 위 · 왼쪽 · 아래 (화면 기준, y 는 아래로 커진다) */
export const DX = [1, 0, -1, 0] as const;
export const DY = [0, -1, 0, 1] as const;

export interface Board {
  w: number;
  h: number;
  /** 0 바닥 · 1 벽 · 2 바깥 */
  cell: Uint8Array;
  goal: Uint8Array;
  boxes: number[];
  player: number;
}

export interface SokoLevel {
  rows: string[];
  /** 가장 적은 밀기 수 (0 이면 불러올 때 풀이기로 센다) */
  par: number;
  /** 단계 묶음 (one · two · three · four) */
  world?: string;
}

export function parse(rows: string[]): Board {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const cell = new Uint8Array(w * h).fill(2);
  const goal = new Uint8Array(w * h);
  const boxes: number[] = [];
  let player = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ch = rows[y]![x] ?? '_';
      const i = y * w + x;
      if (ch === '#') cell[i] = 1;
      else if (ch !== '_') cell[i] = 0;
      if (ch === '.' || ch === '*' || ch === '+') goal[i] = 1;
      if (ch === '$' || ch === '*') boxes.push(i);
      if (ch === '@' || ch === '+') player = i;
    }
  // 바깥과 이어진 빈칸(' ')은 바깥으로 — 벽 안쪽만 바닥
  const inside = new Uint8Array(w * h);
  const q = [player];
  inside[player] = 1;
  while (q.length) {
    const c = q.pop()!;
    for (let d = 0; d < 4; d++) {
      const x = (c % w) + DX[d]!;
      const y = Math.floor(c / w) + DY[d]!;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const n = y * w + x;
      if (inside[n] || cell[n] !== 0) continue;
      inside[n] = 1;
      q.push(n);
    }
  }
  for (let i = 0; i < w * h; i++) if (cell[i] === 0 && !inside[i]) cell[i] = 2;
  return { w, h, cell, goal, boxes, player };
}

export function step(b: Board, i: number, d: Dir): number {
  const x = (i % b.w) + DX[d];
  const y = Math.floor(i / b.w) + DY[d];
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return -1;
  return y * b.w + x;
}

export const free = (b: Board, i: number, boxes: readonly number[]): boolean => i >= 0 && b.cell[i] === 0 && !boxes.includes(i);

export interface MoveResult {
  player: number;
  boxes: number[];
  /** 민 상자 번호 (boxes 안의 차례) — 안 밀었으면 -1 */
  pushed: number;
}

/** 사람이 d 쪽으로 한 칸 — 못 가면 null */
export function move(b: Board, player: number, boxes: readonly number[], d: Dir): MoveResult | null {
  const n = step(b, player, d);
  if (n < 0 || b.cell[n] !== 0) return null;
  const k = boxes.indexOf(n);
  if (k < 0) return { player: n, boxes: [...boxes], pushed: -1 };
  const nn = step(b, n, d);
  if (!free(b, nn, boxes)) return null;
  const nb = [...boxes];
  nb[k] = nn;
  return { player: n, boxes: nb, pushed: k };
}

export const solved = (b: Board, boxes: readonly number[]): boolean => boxes.every((i) => b.goal[i] === 1);
export const onGoals = (b: Board, boxes: readonly number[]): number => boxes.filter((i) => b.goal[i] === 1).length;

/** 사람이 상자를 밀지 않고 갈 수 있는 칸 (from 부터) — 이전 칸 표 */
export function reach(b: Board, from: number, boxes: readonly number[]): Int32Array {
  const prev = new Int32Array(b.w * b.h).fill(-2);
  prev[from] = -1;
  const occ = new Uint8Array(b.w * b.h);
  for (const i of boxes) occ[i] = 1;
  const q = [from];
  for (let h = 0; h < q.length; h++) {
    const c = q[h]!;
    for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
      const n = step(b, c, d);
      if (n < 0 || prev[n] !== -2 || b.cell[n] !== 0 || occ[n]) continue;
      prev[n] = c;
      q.push(n);
    }
  }
  return prev;
}

/** from → to 걷는 길 (방향 목록) — 못 가면 null */
export function walkPath(b: Board, from: number, to: number, boxes: readonly number[]): Dir[] | null {
  const prev = reach(b, from, boxes);
  if (prev[to] === -2) return null;
  const out: Dir[] = [];
  for (let c = to; c !== from; c = prev[c]!) {
    const p = prev[c]!;
    const dx = (c % b.w) - (p % b.w);
    const dy = Math.floor(c / b.w) - Math.floor(p / b.w);
    out.unshift((dx === 1 ? 0 : dy === -1 ? 1 : dx === -1 ? 2 : 3) as Dir);
  }
  return out;
}

/** 상자가 들어가면 다시는 자리로 못 가는 칸 (자리에서 거꾸로 당겨 닿을 수 없는 칸) */
export function deadCells(b: Board): Uint8Array {
  const alive = new Uint8Array(b.w * b.h);
  const q: number[] = [];
  for (let i = 0; i < b.w * b.h; i++)
    if (b.goal[i] && b.cell[i] === 0) {
      alive[i] = 1;
      q.push(i);
    }
  while (q.length) {
    const c = q.pop()!;
    for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
      // 상자를 c 에서 d 반대쪽으로 당긴다 = 상자는 n 에 있었고 사람은 n 너머(nn)에 서 있었다
      const n = step(b, c, d);
      const nn = n < 0 ? -1 : step(b, n, d);
      if (n < 0 || nn < 0 || b.cell[n] !== 0 || b.cell[nn] !== 0 || alive[n]) continue;
      alive[n] = 1;
      q.push(n);
    }
  }
  const dead = new Uint8Array(b.w * b.h);
  for (let i = 0; i < b.w * b.h; i++) dead[i] = b.cell[i] === 0 && !alive[i] ? 1 : 0;
  return dead;
}

export interface Push {
  /** 밀기 전 상자 칸 */
  box: number;
  dir: Dir;
}

/**
 * 가장 적은 밀기 수 풀이 (너비 우선 — 상태 = 상자 자리 + 사람이 갈 수 있는 구역의 가장 작은 칸).
 * 못 찾으면(상태 수 limit 초과 포함) null.
 */
export function solve(b: Board, player: number, boxes: readonly number[], limit = 300_000): Push[] | null {
  const dead = deadCells(b);
  if (boxes.some((i) => dead[i] && !b.goal[i])) return null;
  const norm = (p: number, bx: readonly number[]): [number, Int32Array] => {
    const r = reach(b, p, bx);
    let m = p;
    for (let i = 0; i < r.length; i++) if (r[i] !== -2 && i < m) m = i;
    return [m, r];
  };
  const keyOf = (bx: readonly number[], m: number): string => [...bx].sort((a, c) => a - c).join(',') + '|' + m;
  const [m0] = norm(player, boxes);
  const start = keyOf(boxes, m0);
  if (solved(b, boxes)) return [];
  const prev = new Map<string, [string, Push] | null>([[start, null]]);
  let layer: [number, number[]][] = [[player, [...boxes]]];
  while (layer.length) {
    const next: [number, number[]][] = [];
    for (const [p, bx] of layer) {
      const [m, r] = norm(p, bx);
      const sk = keyOf(bx, m);
      for (let k = 0; k < bx.length; k++)
        for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
          const from = step(b, bx[k]!, ((d + 2) % 4) as Dir);
          if (from < 0 || r[from] === -2) continue;
          const to = step(b, bx[k]!, d);
          if (!free(b, to, bx) || dead[to]) continue;
          const nb = [...bx];
          nb[k] = to;
          const [nm] = norm(bx[k]!, nb);
          const nk = keyOf(nb, nm);
          if (prev.has(nk)) continue;
          prev.set(nk, [sk, { box: bx[k]!, dir: d }]);
          if (solved(b, nb)) {
            const out: Push[] = [];
            for (let e = prev.get(nk); e; e = prev.get(e[0])) out.unshift(e[1]);
            return out;
          }
          if (prev.size > limit) return null;
          next.push([bx[k]!, nb]);
        }
    }
    layer = next;
  }
  return null;
}

/* ───────────── 판 만들기 ───────────── */

export interface GenSpec {
  size: [number, number];
  boxes: [number, number];
  pushes: [number, number];
  /** 거꾸로 걷는 걸음 수 · 당길 확률 (길수록 · 클수록 어려운 판) */
  steps?: [number, number];
  pull?: number;
}

/**
 * 판 만들기 — 방을 파고, 상자를 자리에 둔 채 사람이 거꾸로 걸으며 상자를 당긴다(풀린 판에서 거슬러 오르기).
 * 그 판을 풀이기로 풀어 가장 적은 밀기 수가 범위 안이면 쓴다. 사람 · 상자가 한 번도 안 간 바닥은 벽으로 메운다.
 */
export function generate(spec: GenSpec, rnd: () => number = Math.random, tries = 300): SokoLevel | null {
  const pick = ([a, c]: [number, number]): number => a + Math.floor(rnd() * (c - a + 1));
  let best: SokoLevel | null = null;
  for (let t = 0; t < tries; t++) {
    const w = pick(spec.size) + 2;
    const h = pick(spec.size) + 2;
    const cell = new Uint8Array(w * h).fill(1);
    // 방 — 겹치는 직사각형 몇 개
    const rooms = 2 + Math.floor(rnd() * 3);
    for (let k = 0; k < rooms; k++) {
      const rw = 2 + Math.floor(rnd() * (w - 3));
      const rh = 2 + Math.floor(rnd() * (h - 3));
      const rx = 1 + Math.floor(rnd() * (w - 1 - rw));
      const ry = 1 + Math.floor(rnd() * (h - 1 - rh));
      for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) cell[y * w + x] = 0;
    }
    // 기둥 몇 개
    for (let k = 0; k < 1 + Math.floor(rnd() * 3); k++) {
      const x = 2 + Math.floor(rnd() * (w - 4));
      const y = 2 + Math.floor(rnd() * (h - 4));
      if (x > 0 && y > 0) cell[y * w + x] = 1;
    }
    const floors: number[] = [];
    for (let i = 0; i < w * h; i++) if (cell[i] === 0) floors.push(i);
    const n = pick(spec.boxes);
    if (floors.length < n * 3 + 4) continue;
    const take = (): number => floors.splice(Math.floor(rnd() * floors.length), 1)[0]!;
    const goals = Array.from({ length: n }, take);
    const goal = new Uint8Array(w * h);
    for (const g of goals) goal[g] = 1;
    const b: Board = { w, h, cell, goal, boxes: [], player: 0 };
    let boxes = [...goals];
    let player = take();
    // 사람이 이어진 바닥에 있어야
    if (reach(b, player, boxes).filter((v) => v !== -2).length < 4) continue;
    const used = new Uint8Array(w * h);
    for (const g of goals) used[g] = 1;
    used[player] = 1;
    // 거꾸로 걷기 — 걸을 때 등 뒤에 상자가 있으면 가끔 당긴다
    const steps = spec.steps ? pick(spec.steps) : 60 + Math.floor(rnd() * 120);
    for (let s = 0; s < steps; s++) {
      const d = Math.floor(rnd() * 4) as Dir;
      const to = step(b, player, d);
      if (!free(b, to, boxes)) continue;
      const behind = step(b, player, ((d + 2) % 4) as Dir);
      const k = boxes.indexOf(behind);
      if (k >= 0 && rnd() < (spec.pull ?? 0.65)) boxes[k] = player;
      player = to;
      used[player] = 1;
      for (const x of boxes) used[x] = 1;
    }
    if (boxes.some((x) => goal[x]) && rnd() < 0.7) continue;
    // 안 쓴 바닥은 벽으로 — 판이 단정해진다
    for (let i = 0; i < w * h; i++) if (cell[i] === 0 && !used[i]) cell[i] = 1;
    const sol = solve(b, player, boxes, spec.pushes[1] > 20 ? 400_000 : 120_000);
    if (!sol || sol.length < 1) continue;
    const lv = { rows: toRows(b, player, boxes), par: sol.length };
    if (sol.length >= spec.pushes[0] && sol.length <= spec.pushes[1]) return lv;
    if (!best || Math.abs(sol.length - spec.pushes[0]) < Math.abs(best.par - spec.pushes[0])) best = lv;
  }
  return best;
}

/** 판 → 글자 줄 (바닥에 안 닿은 벽은 바깥으로 지운다) */
export function toRows(b: Board, player: number, boxes: readonly number[]): string[] {
  const near = (i: number): boolean => {
    const x = i % b.w;
    const y = Math.floor(i / b.w);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < b.w && ny < b.h && b.cell[ny * b.w + nx] === 0) return true;
      }
    return false;
  };
  const rows: string[] = [];
  for (let y = 0; y < b.h; y++) {
    let s = '';
    for (let x = 0; x < b.w; x++) {
      const i = y * b.w + x;
      const g = b.goal[i] === 1;
      const bx = boxes.includes(i);
      if (b.cell[i] === 1) s += near(i) ? '#' : '_';
      else if (b.cell[i] === 2) s += '_';
      else if (i === player) s += g ? '+' : '@';
      else if (bx) s += g ? '*' : '$';
      else s += g ? '.' : ' ';
    }
    rows.push(s);
  }
  // 빈 바깥 줄 · 칸 잘라 내기
  const used = (r: string): boolean => /[^_]/.test(r);
  while (rows.length && !used(rows[0]!)) rows.shift();
  while (rows.length && !used(rows[rows.length - 1]!)) rows.pop();
  let l = Infinity;
  let rr = 0;
  for (const r of rows) {
    const m = r.search(/[^_]/);
    if (m >= 0) l = Math.min(l, m);
    rr = Math.max(rr, r.replace(/_+$/, '').length);
  }
  return rows.map((r) => r.slice(l, rr).padEnd(rr - l, '_'));
}

/**
 * 어려운 판 만들기 — 방을 판 뒤, 상자가 모두 자리에 있는 상태에서 「거꾸로 당기기」로 갈 수 있는 상태를 너비 우선으로 모두 넓힌다.
 * 가장 멀리(당기기 수가 가장 많이) 떨어진 상태가 곧 가장 적은 밀기 수가 가장 큰 출발 판이다.
 */
export function generateDeep(spec: { size: [number, number]; boxes: number; limit?: number }, rnd: () => number = Math.random, tries = 20): SokoLevel | null {
  const pickN = ([a, c]: [number, number]): number => a + Math.floor(rnd() * (c - a + 1));
  let best: SokoLevel | null = null;
  for (let t = 0; t < tries; t++) {
    const w = pickN(spec.size) + 2;
    const h = pickN(spec.size) + 2;
    const cell = new Uint8Array(w * h).fill(1);
    const rooms = 2 + Math.floor(rnd() * 3);
    for (let k = 0; k < rooms; k++) {
      const rw = 2 + Math.floor(rnd() * (w - 3));
      const rh = 2 + Math.floor(rnd() * (h - 3));
      const rx = 1 + Math.floor(rnd() * (w - 1 - rw));
      const ry = 1 + Math.floor(rnd() * (h - 1 - rh));
      for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) cell[y * w + x] = 0;
    }
    for (let k = 0; k < 1 + Math.floor(rnd() * 3); k++) cell[(2 + Math.floor(rnd() * (h - 4))) * w + 2 + Math.floor(rnd() * (w - 4))] = 1;
    // 가장 큰 이어진 바닥만 남긴다
    const floors: number[] = [];
    for (let i = 0; i < w * h; i++) if (cell[i] === 0) floors.push(i);
    if (floors.length < spec.boxes * 3 + 5) continue;
    const b: Board = { w, h, cell, goal: new Uint8Array(w * h), boxes: [], player: 0 };
    const comp = reach(b, floors[Math.floor(rnd() * floors.length)]!, []);
    for (let i = 0; i < w * h; i++) if (cell[i] === 0 && comp[i] === -2) cell[i] = 1;
    const fl: number[] = [];
    for (let i = 0; i < w * h; i++) if (cell[i] === 0) fl.push(i);
    if (fl.length < spec.boxes * 3 + 5) continue;
    const goals: number[] = [];
    while (goals.length < spec.boxes) {
      const g = fl[Math.floor(rnd() * fl.length)]!;
      if (!goals.includes(g)) goals.push(g);
    }
    for (const g of goals) b.goal[g] = 1;
    // 거꾸로 너비 우선 — 상태 = 상자 자리 + 사람 구역(가장 작은 칸)
    const norm = (p: number, bx: readonly number[]): [number, Int32Array] => {
      const r = reach(b, p, bx);
      let m = p;
      for (let i = 0; i < r.length; i++) if (r[i] !== -2 && i < m) m = i;
      return [m, r];
    };
    const key = (bx: readonly number[], m: number): string => [...bx].sort((a, c) => a - c).join(',') + '|' + m;
    const seen = new Set<string>();
    let layer: [number, number[]][] = [];
    for (const p of fl) {
      if (goals.includes(p)) continue;
      const [m] = norm(p, goals);
      const k = key(goals, m);
      if (seen.has(k)) continue;
      seen.add(k);
      layer.push([p, [...goals]]);
    }
    let last: [number, number[]][] = layer;
    let depth = 0;
    const limit = spec.limit ?? 150_000;
    while (layer.length && seen.size < limit) {
      const next: [number, number[]][] = [];
      for (const [p, bx] of layer) {
        const [, r] = norm(p, bx);
        for (let k = 0; k < bx.length; k++)
          for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
            // 상자 c 를 d 쪽으로 당긴다: 사람은 c+d 에 서 있다가 c+2d 로 물러난다
            const c = bx[k]!;
            const stand = step(b, c, d);
            if (stand < 0 || r[stand] === -2) continue;
            const back = step(b, stand, d);
            if (!free(b, back, bx)) continue;
            const nb = [...bx];
            nb[k] = stand;
            const nk = key(nb, norm(back, nb)[0]);
            if (seen.has(nk)) continue;
            seen.add(nk);
            next.push([back, nb]);
          }
      }
      if (!next.length) break;
      last = next;
      layer = next;
      depth++;
    }
    // 가장 먼 겹에서 자리 위 상자가 가장 적은 상태
    let pickS = last[0]!;
    let bestOn = Infinity;
    for (const s of last) {
      const on = s[1].filter((i) => b.goal[i]).length;
      if (on < bestOn) {
        bestOn = on;
        pickS = s;
      }
    }
    if (depth < 1) continue;
    const lv = { rows: toRows(b, pickS[0], pickS[1]), par: depth };
    if (!best || lv.par > best.par) best = lv;
  }
  return best;
}

/** 너비 우선 탐색 겹 — 밀기 1번 · 2번 … 으로 처음 닿는 서로 다른 상태 수 (풀리는 겹까지) */
export function pushLayers(b: Board, player: number, boxes: readonly number[], maxDepth = 40): number[] {
  const dead = deadCells(b);
  const norm = (p: number, bx: readonly number[]): [number, Int32Array] => {
    const r = reach(b, p, bx);
    let m = p;
    for (let i = 0; i < r.length; i++) if (r[i] !== -2 && i < m) m = i;
    return [m, r];
  };
  const keyOf = (bx: readonly number[], m: number): string => [...bx].sort((a, c) => a - c).join(',') + '|' + m;
  const seen = new Set([keyOf(boxes, norm(player, boxes)[0])]);
  let layer: [number, number[]][] = [[player, [...boxes]]];
  const out: number[] = [];
  for (let depth = 0; depth < maxDepth && layer.length; depth++) {
    const next: [number, number[]][] = [];
    let found = false;
    for (const [p, bx] of layer) {
      const [, r] = norm(p, bx);
      for (let k = 0; k < bx.length; k++)
        for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
          const from = step(b, bx[k]!, ((d + 2) % 4) as Dir);
          if (from < 0 || r[from] === -2) continue;
          const to = step(b, bx[k]!, d);
          if (!free(b, to, bx) || dead[to]) continue;
          const nb = [...bx];
          nb[k] = to;
          const key = keyOf(nb, norm(bx[k]!, nb)[0]);
          if (seen.has(key)) continue;
          seen.add(key);
          next.push([bx[k]!, nb]);
          if (solved(b, nb)) found = true;
        }
    }
    out.push(next.length);
    layer = next;
    if (found) break;
  }
  return out;
}

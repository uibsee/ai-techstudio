import type { TechDoc } from './types';

/**
 * 기술 문서 B12 — 지도 생성 6 (i249 i250 i251 i253 i254 i255) · 소리 · 음악 9 (u77 u78 i31 i52 i77 i435 i436 i437 i438)
 * · 효과음 14 (i141 i143 i145 i147 i148 i156 i157 i158 i159 i160 i163 i164 i165 i169)
 * 견본: demos/demosMapA.ts · demosSystem.ts · demosSim.ts · demosEpic.ts · demosMusicNet.ts · demosSfx.ts, 사이트 코드 core/Bgm.ts · RulesSheet.ts
 */
export const DOCS: Record<string, TechDoc> = {
  // ───────────────────────── 지도 생성 ─────────────────────────
  i249: {
    id: 'i249',
    summary: '칸마다 「아직 될 수 있는 타일」을 남겨 두고, 가능성이 가장 적은 칸부터 하나씩 확정하며 이웃 규칙을 퍼뜨려 해안 · 숲이 저절로 이어진 지도를 만든다.',
    terms: [
      { en: 'Wave Function Collapse (WFC)', ko: '파동 함수 붕괴 — 가능성을 줄여 가며 타일 확정' },
      { en: 'Lowest entropy cell', ko: '가능한 타일이 가장 적은 칸부터 고르기' },
      { en: 'Constraint propagation', ko: '확정한 칸의 규칙을 이웃으로 퍼뜨리기' },
      { en: 'Adjacency rules · weighted choice', ko: '붙을 수 있는 짝 규칙 · 비율 있는 무작위' },
    ],
    goal: '{target}을(를) 파동 함수 붕괴(WFC)로 만들어 줘 — 칸마다 가능한 타일을 두고, 가능성이 가장 적은 칸부터 확정하고 이웃 규칙을 퍼뜨려서. 그림은 {style}.',
    targets: ['바다 · 모래 · 풀 · 숲 · 산 섬 지도', '퍼즐 판 무늬', '길 · 강이 이어진 마을 지도'],
    styles: ['칸이 하나씩 확정되는 과정이 보이는 설명', '귀여운 도트 타일', '보드게임 판 같은 깔끔한 색'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 같은 알고리즘을 C# 으로 돌리고 결과를 Tilemap.SetTile 로 깐다.',
      godot: 'Godot 은 같은 알고리즘을 GDScript 로 돌리고 TileMapLayer.set_cell 로 깐다.',
    },
    principle: [
      '타일 6가지를 깊은 바다 → 바다 → 모래 → 풀밭 → 숲 → 산 순서로 줄 세우고, 이웃끼리는 한 단계 차이까지만 붙을 수 있다는 규칙을 둔다.',
      '그래서 칸마다 가능한 타일은 「lo ~ hi」 범위 하나로 적을 수 있다. 처음엔 모든 칸이 0 ~ 5.',
      '범위가 가장 좁은(가능성이 적은) 칸을 골라, 비율(WT)과 「옆에 같은 타일이 있으면 × 뭉치기」로 하나를 뽑아 확정한다.',
      '확정하면 이웃 범위를 lo = max(lo, 내 lo − 1) · hi = min(hi, 내 hi + 1) 로 줄이고, 바뀐 칸은 다시 그 이웃으로 퍼뜨린다 (스택).',
      '범위가 한 값으로 좁혀진 칸은 저절로 확정 — 모든 칸이 확정되면 끝, 규칙을 어긴 이음이 하나도 없다.',
    ],
    when: ['이어져야 하는 지형 · 무늬 (해안선 · 길 · 강)를 손으로 안 그리고 매번 새로 만들 때', '「컴퓨터가 규칙만 지키며 그림을 채운다」를 한 단계씩 보여 주는 설명 화면'],
    avoid: ['그냥 울퉁불퉁한 높이 지도만 필요할 때 — 잡음 섬 지도(i245)가 훨씬 빠르고 쉽다', '방 · 복도처럼 큰 구조가 중요한 던전 — BSP 방 나누기(i247)가 낫다'],
    cost: 'light',
    costNote: '30 × 19 = 570칸. 한 걸음마다 모든 칸을 훑어 가장 좁은 칸을 찾는다 — 칸이 수만 개면 우선순위 큐로 바꿔야 한다.',
    level: 3,
    must: [
      '타일 규칙은 데이터(순서 · 붙는 짝)로, 알고리즘은 규칙을 몰라도 돌게 나눠서',
      '같은 범위 칸이 여럿이면 시드로 만든 작은 흔들림(0.6 × 해시)을 더해 고른다 — 늘 왼쪽 위부터 채우지 않게',
      '무작위는 시드 있는 난수(mulberry 등)로 — 같은 시드면 같은 지도',
      '모순(가능한 타일이 0개)이 나는 규칙이면 되돌리기나 처음부터 다시를 반드시 넣는다',
      '그려 둔 타일은 화면 밖 캔버스에 쌓아 두고 새로 확정된 칸만 덧그린다',
    ],
    done: [
      '빈 판에서 시작해 칸이 하나씩 확정되며 바다 옆엔 모래, 모래 옆엔 풀처럼 한 단계씩만 이어진 섬이 생긴다',
      '아직 안 정해진 칸에는 남은 가능성 막대가 보이고, 퍼뜨림이 닿은 칸이 잠깐 빛난다',
      '「같은 타일끼리 뭉치기」를 1 → 10 으로 올리면 숲 · 바다 덩어리가 확실히 커진다',
      '같은 시드로 다시 하면 똑같은 지도가 나온다',
    ],
    code: {
      lang: 'ts',
      title: '범위(lo ~ hi) 로 줄이는 WFC 한 걸음',
      from: 'demos/demosMapA.ts i249 step() 을 정리',
      body: `const GW = 30, GH = 19, NT = 6;               // 깊은 바다 · 바다 · 모래 · 풀 · 숲 · 산
const WT = [1.7, 2.1, 1.4, 3, 2.3, 1.1];        // 타일별 뽑힐 비율
const lo = new Int8Array(GW * GH).fill(0), hi = new Int8Array(GW * GH).fill(NT - 1);
const val = new Int8Array(GW * GH).fill(-1);
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function step(rnd: () => number, jitter: (i: number) => number, coherence = 2.5): boolean {
  let best = -1, bs = 1e9;                       // 가능성이 가장 적은 칸
  for (let i = 0; i < GW * GH; i++) {
    if (val[i] >= 0) continue;
    const s = hi[i] - lo[i] + jitter(i) * 0.6;
    if (s < bs) { bs = s; best = i; }
  }
  if (best < 0) return true;                     // 다 확정
  const x0 = best % GW, y0 = (best / GW) | 0;
  const wts: number[] = []; let sum = 0;
  for (let v = lo[best]; v <= hi[best]; v++) {
    let w = WT[v];
    for (const [dx, dy] of N4) {                 // 옆에 같은 타일이 있으면 더 잘 뽑히게
      const nx = x0 + dx, ny = y0 + dy;
      if (nx >= 0 && ny >= 0 && nx < GW && ny < GH && val[ny * GW + nx] === v) w *= coherence;
    }
    wts.push(w); sum += w;
  }
  let pick = rnd() * sum, v = lo[best];
  for (const w of wts) { if (pick < w) break; pick -= w; v++; }
  lo[best] = hi[best] = Math.min(v, hi[best]);
  const st = [best];                             // 퍼뜨리기: 이웃은 한 단계 차이까지만
  while (st.length) {
    const c = st.pop()!, cx = c % GW, cy = (c / GW) | 0;
    for (const [dx, dy] of N4) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const n = ny * GW + nx;
      const nl = Math.max(lo[n], lo[c] - 1), nh = Math.min(hi[n], hi[c] + 1);
      if (nl !== lo[n] || nh !== hi[n]) { lo[n] = nl; hi[n] = nh; st.push(n); }
    }
  }
  for (let i = 0; i < GW * GH; i++) if (val[i] < 0 && lo[i] === hi[i]) val[i] = lo[i];
  return false;
}`,
    },
    pitfalls: [
      { title: '규칙이 복잡하면 가능한 타일이 0개인 칸(모순)이 생긴다', fix: '이 견본의 「한 단계씩」 규칙은 범위가 늘 이어져 모순이 없지만, 일반 타일 짝 규칙은 모순이 난다. 되돌리기나 그 시드로 처음부터 다시를 넣는다.' },
      { title: '같은 점수 칸을 늘 첫 칸부터 고르면 왼쪽 위부터 줄줄이 채워진다', fix: '고르기 점수에 시드 해시로 작은 흔들림(0.6)을 더해 여기저기서 확정되게 한다.' },
      { title: '뭉치기 없이 비율만 쓰면 얼룩덜룩 잡음 같은 지도가 된다', fix: '옆 칸과 같은 타일이면 비율을 coherence(2.5)배 — 덩어리가 생겨 섬 · 숲처럼 보인다.' },
      { title: '확정할 때마다 판 전체를 다시 그리면 칸이 많을 때 느리다', fix: '새로 확정된 칸 목록(pending)만 화면 밖 캔버스에 덧그리고, 화면에는 그 캔버스를 한 번 붙인다.' },
    ],
    prev: ['i245', 'i248'],
    next: ['i254', 'i255'],
    refs: [{ name: 'GitHub — mxgmn/WaveFunctionCollapse (원조 구현)', url: 'https://github.com/mxgmn/WaveFunctionCollapse' }],
  },

  i250: {
    id: 'i250',
    summary: '같은 크기 판을 깊이 우선 · 크루스칼 · 윌슨 세 알고리즘으로 파 내려가, 긴 복도 미로와 짧은 갈래 미로가 어떻게 다른지 나란히 보여 준다.',
    terms: [
      { en: 'Maze generation (spanning tree)', ko: '미로 만들기 = 칸을 잇는 나무 하나 만들기' },
      { en: 'Recursive backtracker (DFS)', ko: '깊이 우선 — 막히면 되돌아가며 파기' },
      { en: "Randomized Kruskal's algorithm · union-find", ko: '벽을 무작위로 허물되 이미 이어진 칸끼리는 안 허묾' },
      { en: "Wilson's algorithm (loop-erased random walk)", ko: '고리를 지우는 무작위 걷기 — 모든 미로가 똑같은 확률' },
    ],
    goal: '{target}을(를) 미로 생성 알고리즘으로 만들어 줘 — 깊이 우선 · 크루스칼 · 윌슨 중에서 고를 수 있게. 보이는 모습은 {style}.',
    targets: ['미로 찾기 게임 판', '세 알고리즘 나란히 비교 화면', '던전 복도'],
    styles: ['파 내려가는 과정이 보이는 설명', '종이에 그린 미로', '어두운 던전'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    principle: [
      '미로는 칸들을 고리 없이 모두 잇는 나무다 — 어느 두 칸 사이에도 길이 딱 하나.',
      '깊이 우선: 스택 맨 위 칸에서 안 가 본 이웃으로 파고, 갈 곳이 없으면 스택에서 빼며 되돌아간다 → 길고 구불구불한 복도, 갈래가 적다.',
      '크루스칼: 모든 벽을 섞어 하나씩 보며, 양쪽 칸이 아직 다른 덩어리일 때만 허문다(합집합-찾기) → 짧은 막다른 길이 많다.',
      '윌슨: 미로 밖 칸에서 미로에 닿을 때까지 무작위로 걷고, 걷다 만든 고리는 지운 뒤 그 길을 파 넣는다 → 치우침 없는 고른 미로.',
      '다 지으면 출발점에서 너비 우선으로 거리를 재 색칠하고, 벽이 셋인 칸(막다른 길) 수와 정답 길이를 센다.',
    ],
    when: ['미로 게임 판을 매번 새로 만들 때 (난이도 = 알고리즘 · 크기)', '그래프 · 나무 · 합집합-찾기를 눈으로 설명할 때'],
    avoid: ['고리가 있어야 재미있는 판(여러 길) — 다 만든 뒤 벽 몇 개를 더 허물거나 동굴(i248)을 쓴다', '방이 있는 던전 — BSP 방 + 복도(i247)'],
    cost: 'light',
    costNote: '10 × 14 칸 기준 걸음 수백 번. 윌슨은 처음에 미로가 작아 걷기가 길어서 한 프레임에 4걸음씩 돌린다.',
    level: 1,
    must: [
      '칸마다 뚫린 쪽을 비트로 (1 오른쪽 · 2 아래 · 4 왼쪽 · 8 위) — 벽을 허물면 양쪽 칸 모두에 표시',
      '세 알고리즘은 같은 칸 · 이웃 함수를 쓰고 「한 걸음」 함수만 다르게',
      '시드 있는 난수로 — 같은 시드면 같은 미로',
      '다 지으면 너비 우선 거리로 정답 길을 찾고, 막다른 길 수를 보여 준다',
    ],
    done: [
      '세 판이 동시에 파이고, 깊이 우선은 머리(노란 점) · 크루스칼은 덩어리 색 · 윌슨은 분홍 걷기 줄이 보인다',
      '다 지으면 출발점에서 거리 색이 번지고 흰 정답 길이 그려진다',
      '판 아래 「막다른 길 · 길이」 숫자로 깊이 우선이 막다른 길이 가장 적다는 것이 보인다',
      '「미로 크기」를 바꾸면 세 판이 같은 크기로 다시 지어진다',
    ],
    code: {
      lang: 'ts',
      title: '깊이 우선 · 크루스칼 · 윌슨 (끝까지 한 번에)',
      from: 'demos/demosMapA.ts i250 carve · stepDfs · stepKruskal · stepWilson 을 한 번에 도는 꼴로',
      body: `const C = 10, R = 14;
const bit = (a: number, b: number): [number, number] =>
  b - a === 1 ? [1, 4] : b - a === -1 ? [4, 1] : b - a === C ? [2, 8] : [8, 2];
const nbrs = (i: number) => {
  const x = i % C, y = (i / C) | 0, o: number[] = [];
  if (x > 0) o.push(i - 1); if (x < C - 1) o.push(i + 1);
  if (y > 0) o.push(i - C); if (y < R - 1) o.push(i + C);
  return o;
};
function carve(pass: Uint8Array, a: number, b: number) {
  const [ba, bb] = bit(a, b); pass[a] |= ba; pass[b] |= bb;     // 양쪽 칸 모두 뚫림 표시
}
function dfs(rnd: () => number): Uint8Array {
  const pass = new Uint8Array(C * R), seen = new Uint8Array(C * R), st = [0];
  seen[0] = 1;
  while (st.length) {
    const c = st[st.length - 1];
    const opts = nbrs(c).filter((n) => !seen[n]);
    if (!opts.length) { st.pop(); continue; }                  // 막히면 되돌아가기
    const n = opts[Math.floor(rnd() * opts.length)];
    carve(pass, c, n); seen[n] = 1; st.push(n);
  }
  return pass;
}
function kruskal(rnd: () => number): Uint8Array {
  const pass = new Uint8Array(C * R), par = Int32Array.from({ length: C * R }, (_, i) => i);
  const find = (i: number) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  const edges: [number, number][] = [];
  for (let i = 0; i < C * R; i++) { if (i % C < C - 1) edges.push([i, i + 1]); if (i + C < C * R) edges.push([i, i + C]); }
  for (let i = edges.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [edges[i], edges[j]] = [edges[j], edges[i]]; }
  for (const [a, b] of edges) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) { par[ra] = rb; carve(pass, a, b); }        // 다른 덩어리일 때만 허문다
  }
  return pass;
}
function wilson(rnd: () => number): Uint8Array {
  const pass = new Uint8Array(C * R), inM = new Uint8Array(C * R);
  inM[Math.floor(rnd() * C * R)] = 1;
  for (;;) {
    const rest = [...inM.keys()].filter((i) => !inM[i]);
    if (!rest.length) return pass;
    const walk = [rest[Math.floor(rnd() * rest.length)]];
    while (!inM[walk[walk.length - 1]]) {
      const ns = nbrs(walk[walk.length - 1]), n = ns[Math.floor(rnd() * ns.length)];
      const at = walk.indexOf(n);
      if (at >= 0) walk.length = at + 1; else walk.push(n);    // 고리는 지운다
    }
    for (let k = 0; k < walk.length - 1; k++) { carve(pass, walk[k], walk[k + 1]); inM[walk[k]] = 1; }
  }
}`,
    },
    pitfalls: [
      { title: '한쪽 칸에만 뚫림을 적으면 길찾기 · 그리기가 어긋난다', fix: '벽 하나를 허물 때 두 칸 모두에 반대 방향 비트를 함께 적는다 (bit 함수가 짝을 돌려준다).' },
      { title: '깊이 우선을 재귀 함수로 짜면 큰 미로에서 스택이 넘친다', fix: '배열 스택으로 돌린다 — 견본도 st 배열을 쓴다.' },
      { title: '윌슨은 처음 몇 걸음이 아주 오래 걸린다', fix: '미로가 한 칸뿐일 때 거기 닿기까지 오래 걷는다. 화면용이면 한 프레임에 여러 걸음(견본 4걸음)을 돌린다.' },
      { title: '난이도를 크기로만 바꾸면 깊이 우선 미로는 큰 판도 쉽게 느껴진다', fix: '갈래가 적어 한 길만 따라가면 되기 때문 — 어렵게 하려면 크루스칼 · 윌슨처럼 갈래가 많은 쪽을 쓴다.' },
    ],
    prev: ['i247'],
    next: ['i264'],
    refs: [{ name: 'Wikipedia — Maze generation algorithm', url: 'https://en.wikipedia.org/wiki/Maze_generation_algorithm' }],
  },

  i251: {
    id: 'i251',
    summary: '높이 지도의 웅덩이를 먼저 메운 뒤 칸마다 빗물 1 을 가장 낮은 이웃으로 넘겨 모으면, 물줄기가 합쳐져 강이 되고 메운 곳은 호수가 된다.',
    terms: [
      { en: 'Flow accumulation (D8 drainage)', ko: '흐름 모으기 — 칸마다 물을 낮은 이웃으로' },
      { en: 'Priority-flood depression filling', ko: '바다에서부터 낮은 순서로 넓혀 웅덩이 메우기' },
      { en: 'Min-heap (priority queue)', ko: '가장 낮은 칸을 먼저 꺼내는 큐' },
      { en: 'Lakes from filled depressions', ko: '메운 깊이 = 호수' },
    ],
    goal: '{target}에 강 흘려보내기를 넣어 줘 — 웅덩이를 메우고, 높은 칸부터 빗물을 가장 낮은 이웃으로 모아 물이 많은 곳을 강으로, 메운 곳을 호수로. 그림은 {style}.',
    targets: ['잡음으로 만든 섬 지도', '판타지 세계 지도', '지형 체험 (물은 어디로 흐를까)'],
    styles: ['종이 지도 색', '물방울이 흘러가는 설명 화면', '도트 지도'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    principle: [
      '그냥 「가장 낮은 이웃」만 따라가면 웅덩이에 물이 갇혀 바다로 못 간다. 그래서 바다 칸부터 우선순위 큐(가장 낮은 것 먼저)로 넓혀 간다.',
      '새로 닿는 칸의 메운 높이 = max(제 높이, 온 칸의 메운 높이 + 아주 조금). 그 칸의 「물 내려갈 곳(down)」은 자기를 꺼내 준 칸이다.',
      '큐에서 꺼낸 순서를 거꾸로 읽으면 높은 곳 → 낮은 곳 순서. 그 순서로 칸마다 빗물 1 을 더하고 내 물을 down 칸에 넘긴다.',
      '모인 물이 기준(6칸 몫) 넘는 칸을 down 쪽으로 선을 그으면 강, 굵기는 log2(물 ÷ 기준). 메운 높이 − 원래 높이 > 0.004 인 칸은 호수.',
    ],
    when: ['잡음 지도에 그럴듯한 강 · 호수를 덧붙일 때', '「물은 낮은 곳으로, 모이면 강」을 보여 주는 지형 · 과학 체험'],
    avoid: ['물이 실제로 출렁이며 흘러야 할 때 — 얕은 물 시뮬레이션 같은 유체 계산이 맞다', '흙이 깎이는 모습까지 필요할 때 — 물방울 침식(i253)'],
    cost: 'light',
    costNote: '200 × 125 = 2만 5천 칸을 큐에 한 번씩 넣고 뺀다 (n log n). 지도를 만들 때 한 번이면 되고, 화면엔 걸러 그린다.',
    level: 2,
    must: [
      '물 모으기 전에 반드시 웅덩이 메우기 — 안 그러면 강이 중간에서 끊긴다',
      '이웃은 8방향, 메운 높이에 아주 작은 기울기(1e-5)를 더해 평평한 곳에서도 방향이 정해지게',
      '강 기준값은 해상도에 맞춰 (견본: 기준 × (res/120)²) — 해상도를 올려도 강 굵기가 비슷하게',
      '강은 굵기별로 묶어 한 번씩 stroke — 선분 수만 개를 하나씩 그리지 않는다',
    ],
    done: [
      '높은 곳부터 물이 모이는 띠가 내려가고, 끝나면 갈래가 합쳐지며 굵어지는 강이 바다까지 이어진다',
      '오목한 곳엔 호수가 생기고, 강이 호수를 지나 계속 흐른다',
      '「강이 되는 물의 양」을 줄이면 가는 지류가 많이 보이고, 늘리면 큰 강만 남는다',
      '물방울 점들이 강을 따라 바다로 흘러간다',
    ],
    code: {
      lang: 'ts',
      title: '웅덩이 메우기 + 흐름 모으기',
      from: 'demos/demosMapA.ts i251 start() · step() 을 정리 (작은 힙은 새로 씀)',
      body: `// h: 높이 (W×H), sea: 바다 높이. down[k] = 물이 내려갈 칸, acc[k] = 모인 물
function flow(h: Float32Array, W: number, H: number, sea: number) {
  const n = W * H, filled = new Float32Array(n), seen = new Uint8Array(n);
  const down = new Int32Array(n).fill(-1);
  const heap: [number, number][] = [];                       // [높이, 칸] 가장 낮은 것 먼저
  const push = (v: number, i: number) => { heap.push([v, i]); heap.sort((a, b) => b[0] - a[0]); }; // 짧게 쓴 판 — 크면 이진 힙으로
  for (let i = 0; i < n; i++) if (h[i] < sea) { seen[i] = 1; filled[i] = h[i]; push(h[i], i); }
  const pops: number[] = [];
  while (heap.length) {
    const c = heap.pop()![1];
    pops.push(c);
    const cx = c % W, cy = (c / W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx, y = cy + dy;
      if ((!dx && !dy) || x < 0 || y < 0 || x >= W || y >= H) continue;
      const k = y * W + x;
      if (seen[k]) continue;
      seen[k] = 1;
      filled[k] = Math.max(h[k], filled[c] + 1e-5);            // 웅덩이는 메워진다
      down[k] = c;
      push(filled[k], k);
    }
  }
  const acc = new Float32Array(n), lake = new Uint8Array(n);
  for (let p = pops.length - 1; p >= 0; p--) {                 // 높은 곳 → 낮은 곳
    const c = pops[p];
    if (h[c] < sea) continue;
    acc[c] += 1;                                               // 빗물 1
    if (down[c] >= 0) acc[down[c]] += acc[c];
    if (filled[c] - h[c] > 0.004) lake[c] = 1;
  }
  return { down, acc, lake };                                  // acc ≥ 기준 → 강
}`,
    },
    pitfalls: [
      { title: '웅덩이를 안 메우면 강이 산 중턱에서 뚝 끊긴다', fix: '가장 낮은 이웃이 자기보다 높은 칸(웅덩이)에서 물이 갇힌다. 바다에서부터 우선순위 큐로 넓히며 메운 높이를 쓴다.' },
      { title: '평평한 곳에서 물이 갈 곳을 못 정한다', fix: '메운 높이에 1e-5 씩 더해 나온 쪽으로 아주 살짝 기울게 한다.' },
      { title: '해상도를 올리니 강이 온통 굵어졌다', fix: '칸이 늘면 모이는 물도 늘어난다. 기준값을 (해상도 비)² 로 함께 키운다.' },
      { title: '배열 정렬로 큐를 만들면 큰 지도에서 아주 느리다', fix: '견본은 이진 힙(Heap 클래스)을 쓴다. 위 짧은 코드의 sort 판은 작은 지도용.' },
    ],
    prev: ['i245'],
    next: ['i253'],
  },

  i253: {
    id: 'i253',
    summary: '물방울 수만 개를 높이 지도 위에 굴려 비탈에서는 흙을 깎고 느려지면 쌓게 해서, 골짜기 · 능선 · 아래쪽 모래 부채꼴이 저절로 생긴 3D 지형을 만든다.',
    terms: [
      { en: 'Hydraulic erosion (particle / droplet based)', ko: '물방울 침식 — 물방울 하나씩 굴리며 깎고 쌓기' },
      { en: 'Sediment capacity', ko: '물방울이 실을 수 있는 흙 양 = 기울기 × 속도 × 물' },
      { en: 'Bilinear height · gradient sampling', ko: '네 칸 사이를 섞어 높이 · 기울기 읽기' },
      { en: 'three.js PlaneGeometry · computeVertexNormals', ko: '높이 지도를 판 메시로, 법선 다시 계산' },
    ],
    goal: '{target}을(를) 물방울 침식으로 다듬어 줘 — 물방울이 비탈을 굴러 흙을 깎고 느려지면 쌓아서 골짜기와 부채꼴 퇴적이 생기게. 보이는 모습은 {style}.',
    targets: ['잡음으로 만든 산 지형', '섬 배경 지형', '침식 과정을 보여 주는 지구과학 체험'],
    styles: ['깎인 곳은 짙게 · 쌓인 곳은 모래색인 설명', '자연스러운 실사 지형', '부드러운 그림책 언덕'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 TerrainData.GetHeights / SetHeights 로 같은 높이 배열을 읽고 쓴다.',
      godot: 'Godot 은 같은 계산 뒤 ArrayMesh(SurfaceTool) 로 판을 다시 짓는다.',
    },
    principle: [
      '물방울은 무작위 칸에서 태어나 최대 40걸음 굴러간다. 방향 = 이전 방향 × 0.05 − 기울기 × 0.95 (관성이 아주 조금).',
      '실을 수 있는 흙 = max(−높이 변화, 0.01) × 속도 × 물 × 4. 실은 흙이 그보다 적으면 깎고, 많거나 오르막이면 내려놓는다.',
      '깎을 때는 반지름 2 칸 붓으로 가까울수록 많이, 쌓을 때는 지금 칸 네 귀퉁이에 거리 비율로 나눠 쌓는다.',
      '내려가면 빨라지고(속도² − 높이 변화 × 4), 물은 걸음마다 0.98 배로 마른다.',
      '수천 개가 같은 골을 지나며 골은 더 깊어지고, 느려지는 아래쪽에 흙이 부채꼴로 쌓인다.',
    ],
    when: ['잡음 지형이 너무 매끈하고 가짜 같을 때 — 골짜기 결을 더하고 싶을 때', '「물이 산을 깎는다」를 보여 주는 과학 체험'],
    avoid: ['폰에서 매 판마다 새로 깎기 — 미리 깎아 둔 높이 지도를 저장해 쓴다', '평평한 퍼즐 판 — 의미가 없다'],
    cost: 'medium',
    costNote: '112² = 1만 2천 꼭짓점 판. 한 프레임에 물방울 150개 × 40걸음 + 두 프레임마다 법선 · 색 다시 계산. 총 2만 4천 개면 끝난다.',
    level: 3,
    must: [
      '높이 · 기울기는 네 칸 겹선형 보간으로 — 칸 정수 자리만 읽으면 계단 무늬가 생긴다',
      '깎는 양은 높이 차(−dh)를 넘지 않게 — 넘으면 구멍이 파이고 뾰족한 가시가 생긴다',
      '한 프레임에 물방울 수를 제한(150)하고 메시 갱신은 두 프레임에 한 번 — 끝나면 멈춘다',
      '깎인 곳 · 쌓인 곳 색을 원래 높이와의 차이로 칠해 변화가 보이게',
    ],
    done: [
      '물방울 자취가 비탈을 따라 흐르고, 시간이 지나며 골짜기가 파여 능선이 날카로워진다',
      '깎인 골은 짙은 흙색, 아래 평지엔 모래색 부채꼴이 생긴다',
      '「한 번에 떨어뜨릴 물방울」을 올리면 빨리 깎이고, 「새 지형」으로 다시 시작된다',
      '물방울 2만 4천 개 뒤에는 멈추고 프레임이 다시 가벼워진다',
    ],
    code: {
      lang: 'ts',
      title: '물방울 하나 굴리기 (깎기 · 쌓기)',
      from: 'demos/demosMapA.ts i253 sample · erodeAt · drop 을 정리',
      body: `// hm: N×N 높이, sample(x,y) → [기울기x, 기울기y, 높이] (네 칸 겹선형)
function drop(hm: Float32Array, N: number, sample: (x: number, y: number) => [number, number, number],
              erodeAt: (x: number, y: number, amt: number) => void) {
  let x = 2 + Math.random() * (N - 5), y = 2 + Math.random() * (N - 5);
  let dx = 0, dy = 0, sp = 1, wv = 1, sed = 0;
  for (let life = 0; life < 40; life++) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const [gx, gy, hh] = sample(x, y);
    dx = dx * 0.05 - gx * 0.95;                       // 관성 조금 + 내리막
    dy = dy * 0.05 - gy * 0.95;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) break;
    dx /= len; dy /= len;
    x += dx; y += dy;
    if (x < 1 || y < 1 || x >= N - 2 || y >= N - 2) break;
    const dh = sample(x, y)[2] - hh;
    const cap = Math.max(-dh, 0.01) * sp * wv * 4;     // 실을 수 있는 흙
    const i = iy * N + ix;
    if (sed > cap || dh > 0) {                          // 내려놓기 — 네 귀퉁이에 나눠서
      const dep = dh > 0 ? Math.min(dh, sed) : (sed - cap) * 0.3;
      sed -= dep;
      hm[i] += dep * (1 - fx) * (1 - fy); hm[i + 1] += dep * fx * (1 - fy);
      hm[i + N] += dep * (1 - fx) * fy;   hm[i + N + 1] += dep * fx * fy;
    } else {                                            // 깎기 — 반지름 2 붓
      const er = Math.min((cap - sed) * 0.3, -dh);
      erodeAt(x - dx, y - dy, er);
      sed += er;
    }
    sp = Math.sqrt(Math.max(0, sp * sp - dh * 4));      // 내려가면 빨라짐
    wv *= 0.98;                                          // 물이 마름
  }
}`,
    },
    pitfalls: [
      { title: '깎는 양을 높이 차보다 크게 두면 바늘 같은 구멍 · 가시가 생긴다', fix: 'er = min((cap − sed) × 0.3, −dh) 처럼 그 걸음의 높이 차를 넘지 않게 묶는다.' },
      { title: '한 칸에서만 깎으면 골이 한 줄짜리 홈처럼 보인다', fix: '반지름 2 붓으로 거리만큼 무게를 나눠 깎는다 (erodeAt).' },
      { title: '물방울마다 법선을 다시 계산하면 프레임이 멈춘다', fix: '물방울은 한 프레임에 150개씩, 메시 높이 · 법선 · 색 갱신은 두 프레임에 한 번.' },
      { title: '지형 가장자리에서 물방울이 판 밖을 읽는다', fix: '1 ~ N−2 범위를 벗어나면 그 물방울을 끝낸다 — 네 칸 보간이 i + N + 1 을 읽기 때문.' },
    ],
    prev: ['i251', 'i245'],
    next: ['i255'],
  },

  i254: {
    id: 'i254',
    summary: '이미 놓인 점 둘레 고리(r ~ 2r)에서만 새 점을 던져 서로 최소 거리를 지키게 해서, 나무 · 바위가 뭉치지도 비지도 않고 고르게 흩어진다.',
    terms: [
      { en: 'Poisson disk sampling (Bridson)', ko: '포아송 원판 흩뿌리기 — 서로 r 이상 떨어진 무작위 점' },
      { en: 'Active list', ko: '아직 둘레에 점을 더 놓을 수 있는 점 목록' },
      { en: 'Background grid (cell = r/√2)', ko: '칸 하나에 점 하나 — 가까운 점만 빠르게 확인' },
      { en: 'Blue noise distribution', ko: '고르게 퍼진 무작위 (뭉침 없음)' },
    ],
    goal: '{target}을(를) 포아송 원판 흩뿌리기로 배치해 줘 — 서로 최소 거리를 지키며 고르게, 그냥 무작위와 나란히 비교할 수 있게. 그림은 {style}.',
    targets: ['숲의 나무 배치', '들판의 꽃 · 바위 장식', '밤하늘 별 배치'],
    styles: ['위에서 내려다본 귀여운 숲', '과정(활성 점 · 고리)이 보이는 설명', '깔끔한 도트 지도'],
    platforms: ['canvas', 'web', 'three', 'unity', 'godot'],
    principle: [
      '그냥 무작위는 우연히 뭉치는 곳과 텅 빈 곳이 생긴다. 포아송 원판은 「어떤 두 점도 r 보다 가깝지 않게」를 지킨다.',
      '첫 점을 놓고 활성 목록에 넣는다. 활성 점 하나를 골라 둘레 r ~ 2r 고리 안에 최대 18번 던져 본다.',
      '던진 자리가 다른 점과 모두 r 이상 떨어져 있으면 놓고 활성 목록에 더한다. 18번 다 실패하면 그 활성 점을 뺀다.',
      '확인을 빠르게 하려고 한 칸 = r/√2 인 격자를 둔다 — 칸 하나에 점이 많아야 하나라, 둘레 5 × 5 칸만 보면 된다.',
      '활성 목록이 비면 끝 — 판이 고르게 꽉 찬다.',
    ],
    when: ['나무 · 풀 · 바위 · 별처럼 많은 장식을 자연스럽게 흩뿌릴 때', '「무작위인데 고르게」를 비교해 보여 줄 때'],
    avoid: ['딱 정해진 줄 · 격자 배치가 필요할 때 — 그냥 격자 + 작은 흔들림이 더 쉽다', '점 수를 정확히 정해야 할 때 — 포아송은 수가 r 에 따라 정해진다'],
    cost: 'light',
    costNote: '점 하나 놓기에 둘레 25칸 확인 × 최대 18번. 수천 개도 한 번에 금방 — 3D 배치는 만든 뒤 인스턴싱으로 그린다.',
    level: 1,
    must: [
      '격자 칸 크기는 반드시 r/√2 이하 — 그래야 칸 하나에 점 하나만 들어간다',
      '가장자리에 여백(0.02)을 둬 나무가 판 밖으로 잘리지 않게',
      '그냥 무작위와 같은 수의 점으로 나란히 비교 — 너무 가까운 짝을 빨간 선으로',
      '3D 로 쓰면 점 수천 개를 하나씩 메시로 만들지 말고 InstancedMesh 로',
    ],
    done: [
      '왼쪽 그냥 무작위는 빨간 선(너무 가까운 짝)이 여기저기, 오른쪽 포아송 원판은 하나도 없다',
      '만드는 중에 활성 점(노랑) · 지금 고리 · 던져 본 점(성공 초록 · 실패 빨강)이 보인다',
      '「최소 거리」를 줄이면 나무가 빽빽해지고 늘리면 듬성해지지만 늘 고르다',
      '같은 시드면 같은 숲이 나온다',
    ],
    code: {
      lang: 'ts',
      title: '브리드슨 포아송 원판 (끝까지 한 번에)',
      from: 'demos/demosMapA.ts i254 step · far · add 를 한 번에 도는 꼴로',
      body: `function poisson(AW: number, AH: number, rad: number, rng: () => number, k = 18) {
  const cs = rad / Math.SQRT2;                         // 칸 하나에 점 하나
  const gw = Math.ceil(AW / cs), gh = Math.ceil(AH / cs);
  const grid = new Int32Array(gw * gh).fill(-1);
  const pts: { x: number; y: number }[] = [];
  const active: number[] = [];
  const add = (x: number, y: number) => {
    pts.push({ x, y });
    active.push(pts.length - 1);
    grid[Math.floor(y / cs) * gw + Math.floor(x / cs)] = pts.length - 1;
  };
  const far = (x: number, y: number) => {
    const gx = Math.floor(x / cs), gy = Math.floor(y / cs);
    for (let j = gy - 2; j <= gy + 2; j++)
      for (let i = gx - 2; i <= gx + 2; i++) {
        if (i < 0 || j < 0 || i >= gw || j >= gh) continue;
        const q = grid[j * gw + i];
        if (q >= 0 && Math.hypot(pts[q].x - x, pts[q].y - y) < rad) return false;
      }
    return true;
  };
  add(AW * (0.3 + rng() * 0.4), AH * (0.3 + rng() * 0.4));
  while (active.length) {
    const ai = Math.floor(rng() * active.length);
    const p = pts[active[ai]];
    let placed = false;
    for (let t = 0; t < k; t++) {
      const a = rng() * Math.PI * 2, d = rad * (1 + rng());   // r ~ 2r 고리
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      if (x > 0.02 && y > 0.02 && x < AW - 0.02 && y < AH - 0.02 && far(x, y)) { add(x, y); placed = true; break; }
    }
    if (!placed) active.splice(ai, 1);                 // 둘레가 꽉 찼다
  }
  return pts;
}`,
    },
    pitfalls: [
      { title: '격자 칸을 r 로 잡으면 가까운 점을 놓친다', fix: '칸 대각선이 r 이 되도록 r/√2 로 잡아야 칸 하나에 점이 많아야 하나 — 그래서 둘레 ±2 칸만 보면 된다.' },
      { title: '모든 점과 거리를 재면 점이 많을 때 아주 느리다', fix: '격자에서 둘레 5 × 5 칸만 확인한다 (n² → 거의 n).' },
      { title: '그냥 무작위에 「너무 가까우면 다시 뽑기」만 하면 끝에 가서 무한히 돈다', fix: '빈자리가 거의 없을 때 끝을 모른다. 활성 목록 방식은 고리 18번 실패로 끝이 정해진다.' },
      { title: '나무가 판 가장자리에서 반쯤 잘린다', fix: '점은 여백(0.02) 안쪽에만 놓고, 그릴 때는 y 순으로 정렬해 앞 나무가 뒤 나무를 덮게 한다.' },
    ],
    prev: ['i245'],
    next: ['i249'],
    refs: [{ name: 'Bridson (2007) — Fast Poisson Disk Sampling in Arbitrary Dimensions', url: 'https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph07-poissondisk.pdf' }],
  },

  i255: {
    id: 'i255',
    summary: '지도를 만드는 모든 무작위를 시드 숫자 하나에서 뽑아, 같은 시드면 누가 어디서 만들어도 똑같은 섬이 나오고 한 자리만 달라도 전혀 다른 섬이 된다.',
    terms: [
      { en: 'Seeded procedural generation', ko: '시드로 정해지는 절차 생성' },
      { en: 'Seeded PRNG (mulberry32)', ko: '시드 있는 난수 — 같은 시드 = 같은 수열' },
      { en: 'Integer hash noise', ko: '좌표 · 시드를 섞은 정수 해시로 만든 잡음' },
      { en: 'Deterministic output', ko: '같은 입력이면 늘 같은 결과' },
    ],
    goal: '{target}을(를) 시드 숫자 하나로 정해지게 만들어 줘 — 같은 시드면 똑같은 지도, Math.random 은 쓰지 않게. 보이는 모습은 {style}.',
    targets: ['오늘의 지도 (날짜 = 시드)', '친구와 같은 판으로 대결', '섬 지도 생성기'],
    styles: ['시드 다이얼이 돌아가는 비교 화면', '종이 지도', '귀여운 도트 섬'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 new System.Random(seed) 또는 Random.InitState(seed) — 단, 전역 Random 은 다른 코드도 써서 어긋나기 쉽다.',
      godot: 'Godot 은 RandomNumberGenerator 를 하나 만들어 seed 를 넣고 그것만 쓴다.',
    },
    principle: [
      '컴퓨터 난수는 사실 「씨앗(시드)에서 시작해 정해진 계산을 되풀이」한 수열이다. 시드가 같으면 수열도 같다.',
      '지도의 잡음은 좌표와 시드를 정수 곱셈 · XOR 로 섞는 해시(hash2)로 만든다 — 같은 (x, y, 시드)면 늘 같은 값.',
      '잡음을 읽는 시작 위치도 시드로 정한다 (ox = hash2(seed, 1) × 200) — 시드가 바뀌면 잡음의 전혀 다른 곳을 읽는다.',
      '그래서 시드 1234 와 1235 는 숫자로는 가깝지만 지도는 전혀 다르다. 친구에게 네 자리 숫자만 알려 주면 같은 판을 공유한다.',
    ],
    when: ['「오늘의 퍼즐」 · 주간 도전처럼 모두가 같은 판을 받아야 할 때', '버그가 난 판을 다시 만들어 보려 할 때 (시드만 기록)'],
    avoid: ['판마다 저장할 내용이 작으면 그냥 판 자체를 저장해도 된다', '실수(부동소수) 계산이 기기마다 조금씩 다를 수 있는 아주 긴 시뮬레이션 — 결과 자체를 저장한다'],
    cost: 'light',
    costNote: '128 × 80 지도 한 장 만들기는 한 번만, 만든 그림은 시드별로 8장까지 캐시해 둔다.',
    level: 1,
    must: [
      '지도 만드는 코드 안에서 Math.random 을 한 번도 쓰지 않는다 — 모든 무작위는 시드 난수 · 해시에서',
      '난수를 뽑는 순서가 바뀌면 결과도 바뀐다 — 생성 순서를 고정하고, 꾸미기용 무작위는 다른 난수기로',
      '시드는 화면에 보이게 (네 자리) 하고, 복사 · 입력할 수 있게',
      '만든 지도는 시드를 열쇠로 캐시 — 같은 시드를 다시 만들지 않게',
    ],
    done: [
      '친구 A · B 에 같은 시드를 넣으면 두 지도가 픽셀까지 똑같고 「=」 표시가 뜬다',
      '시드 한 자리만 바꾸면 전혀 다른 섬이 되고 「≠」 표시가 뜬다',
      '「시드 고정」에 숫자를 넣고 새로고침해도 같은 섬이 나온다',
      '다른 기기 · 브라우저에서 같은 시드로 같은 섬이 나온다',
    ],
    code: {
      lang: 'ts',
      title: '시드 난수 · 정수 해시 · 시드로 정해지는 지형',
      from: 'demos/demosMapA.ts mulberry · hash2 · makeTerrain 을 정리',
      body: `/** 시드 → 0~1 난수 수열 (mulberry32 꼴) */
function mulberry(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** (i, j, 시드) → 0~1. 같은 입력이면 어느 기기에서도 같은 값 */
function hash2(i: number, j: number, s = 0): number {
  let h = (Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul((j | 0) + 0x165667b1, 0x85ebca6b) ^ Math.imul((s | 0) + 0x3c6ef372, 0xc2b2ae35)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
/** 지형 높이: 시드로 잡음 읽는 자리를 옮기고, 가운데가 높은 섬 모양을 뺀다 */
function heights(W: number, H: number, seed: number, fbm: (x: number, y: number, s: number) => number) {
  const h = new Float32Array(W * H), sc = 3.4 / H;
  const ox = hash2(seed, 1) * 200, oy = hash2(seed, 2) * 200;   // 시드마다 잡음의 다른 곳
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const nx = (x / (W - 1)) * 2 - 1, ny = (y / (H - 1)) * 2 - 1;
      h[y * W + x] = fbm(x * sc + ox, y * sc + oy, seed) - 0.62 * (nx * nx * 0.9 + ny * ny);
    }
  return h;
}
const cache = new Map<number, Float32Array>();                    // 시드 → 지도 (8장까지)`,
    },
    pitfalls: [
      { title: '생성 중 한 군데라도 Math.random 을 쓰면 같은 시드가 다른 지도를 만든다', fix: '지도 생성 함수에는 시드 난수만 넘기고, 연출(반짝이 · 흔들림)은 따로 Math.random 으로.' },
      { title: '난수를 뽑는 순서가 바뀌어 예전 시드 지도가 달라졌다', fix: '생성 단계 순서를 바꾸면 수열이 밀린다. 단계마다 hash2(seed, 단계번호) 로 따로 시드를 나누면 서로 영향이 없다.' },
      { title: '시드 0 이 이상한 지도를 만든다', fix: '곱셈 해시에서 0 은 0 이 되기 쉽다. 견본은 >>> 0 || 1 로 0 을 피한다.' },
      { title: '바다 높이를 고정값으로 두면 시드마다 육지 넓이가 들쭉날쭉하다', fix: '높이를 정렬해 아래 (1 − 육지 비율) 지점을 바다 높이로 — 어느 시드든 육지 비율이 같다.' },
    ],
    prev: ['i245'],
    next: ['i249', 'i254'],
    source: [{ file: 'demosMapA.ts', symbol: 'mulberry' }, { file: 'demosMapA.ts', symbol: 'makeTerrain' }],
  },

  // ───────────────────────── 소리 · 음악 ─────────────────────────
  u77: {
    id: 'u77',
    summary: '게임마다 곡을 정해 이음새 없이 반복하고, 열 때 서서히 · 장면이 바뀌면 부드럽게 갈아 끼우고 · 탭을 숨기면 멈추고 · 소리 단추로 끈다.',
    terms: [
      { en: 'Background music (looping HTMLAudioElement)', ko: '반복 재생하는 배경음악' },
      { en: 'Crossfade (fade in · fade out)', ko: '나가는 곡은 줄이며 멈추고 새 곡은 서서히' },
      { en: 'Autoplay policy · user gesture', ko: '자동 재생 막힘 — 첫 터치 뒤에 다시' },
      { en: 'Page Visibility API (visibilitychange)', ko: '탭이 숨으면 멈추고 보이면 다시' },
    ],
    goal: '{target}에 배경음악을 넣어 줘 — 게임 → 곡 표, 열 때 서서히 커지고, 장면이 바뀌면 곡을 부드럽게 갈아 끼우고, 탭을 숨기면 멈추고, 소리 단추로 끄고 켜게. 분위기는 {style}.',
    targets: ['이야기가 있는 게임 (장면마다 곡)', '여러 게임이 있는 사이트 (게임마다 곡)', '메뉴 ↔ 판을 오가는 퍼즐 게임'],
    styles: ['작고 잔잔하게 깔리는', '밝고 신나는', '추리 · 긴장감 있는'],
    platforms: ['web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 AudioSource(loop = true) 두 개를 번갈아 쓰고 코루틴으로 volume 을 바꿔 크로스페이드한다.',
      godot: 'Godot 은 AudioStreamPlayer 두 개 + Tween 으로 volume_db 를 바꾼다.',
    },
    principle: [
      '게임 id → 곡 이름 표(TRACK_OF)를 두고, 게임 창이 열 때 play · 닫을 때 stop 을 부른다. 표에 없는 게임은 조용히.',
      '곡을 바꿀 때 나가는 곡은 0.5초에 걸쳐 줄인 뒤 멈추고, 새 곡은 0 에서 1.4초에 걸쳐 키운다. 같은 곡이면 그대로 둔다 (메뉴 ↔ 판).',
      '브라우저는 사용자가 누르기 전엔 소리를 막는다 — play() 가 실패하면 다음 pointerdown 한 번에 다시 시도한다.',
      '탭이 숨으면(document.hidden) pause, 다시 보이면 서서히 다시 튼다. 소리 단추는 0.25초에 줄인 뒤 pause.',
    ],
    when: ['세계 · 이야기가 있는 게임에 분위기를 깔 때', '장면(메뉴 · 날마다 · 보스)마다 곡을 바꿀 때'],
    avoid: ['집중해야 하는 수읽기 보드게임 · 고전 퍼즐 — 이 사이트는 일부러 효과음만 둔다', '박자 · 층을 실시간으로 바꿔야 할 때 — 파일 재생 대신 Web Audio 층 쌓기(i435)'],
    cost: 'light',
    costNote: '곡 파일 약 0.9MB 하나. 게임 창을 열자마자 받으면 폰 데이터망에서 첫 화면이 2 ~ 3초 늦어진다 — 화면이 다 뜬 뒤(최대 5초) 받는다.',
    level: 1,
    must: [
      '첫 터치 전에는 소리가 안 난다는 것을 전제로 — play() 실패 시 pointerdown 한 번에 다시',
      '곡마다 따로 페이드 타이머 (나가는 곡이 줄어드는 동안 새 곡이 커져도 서로 끊지 않게)',
      'visibilitychange 로 탭이 숨으면 멈춤 — 백그라운드에서 계속 울리지 않게',
      'iOS 는 코드로 volume 을 못 줄인다 — 곡 파일 자체를 효과음보다 작게(약 −30 LUFS) 만들어 둔다',
      '게임 창을 연 직후엔 곡 받기를 미루고, 그림을 다 받은 뒤 (최대 5초 안에) 튼다',
    ],
    done: [
      '게임을 열면 곡이 1.4초에 걸쳐 서서히 커지고, 닫으면 0.5초에 줄며 멈춘다',
      '장면 신호(예: 3일차 시작)에 곡이 끊김 없이 바뀌고, 같은 곡이면 처음부터 다시 시작하지 않는다',
      '탭을 다른 곳으로 옮기면 음악이 멈추고 돌아오면 다시 커진다',
      '폰에서 첫 화면이 곡 때문에 늦게 뜨지 않는다',
    ],
    code: {
      lang: 'ts',
      title: '곡 갈아 끼우기 · 페이드 · 자동 재생 막힘 처리',
      from: 'src/game/core/Bgm.ts fadeTo · start · switchTo 를 정리 (늦게 받기 SETTLE 은 뺌)',
      body: `const FADE_IN = 1.4, FADE_OUT = 0.5;
let audio: HTMLAudioElement | null = null, track = '', muted = false;
const fadeTimers = new WeakMap<HTMLAudioElement, number>();   // 곡마다 따로

function fadeTo(el: HTMLAudioElement, to: number, sec: number, done?: () => void) {
  window.clearInterval(fadeTimers.get(el));
  const from = el.volume, t0 = performance.now();
  const timer = window.setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / (sec * 1000));
    el.volume = from + (to - from) * k;
    if (k >= 1) { window.clearInterval(timer); done?.(); }
  }, 40);
  fadeTimers.set(el, timer);
}
function start() {
  if (!audio || muted || document.hidden) return;
  audio.volume = 0;
  void audio.play().then(
    () => audio && fadeTo(audio, 1, FADE_IN),
    () => window.addEventListener('pointerdown', start, { once: true }), // 자동 재생 막힘 → 다음 터치에
  );
}
document.addEventListener('visibilitychange', () => {
  if (!audio) return;
  if (document.hidden) audio.pause(); else start();
});
function switchTo(name: string, url?: string) {
  if (name === track && audio) { start(); return; }             // 같은 곡이면 그대로
  const old = audio;
  audio = null; track = '';
  window.removeEventListener('pointerdown', start);
  if (old) fadeTo(old, 0, FADE_OUT, () => { old.pause(); old.src = ''; });
  if (!url) return;
  track = name;
  audio = new Audio(url);
  audio.loop = true;
  audio.preload = 'auto';
  start();
}`,
    },
    pitfalls: [
      { title: '게임을 열자마자 곡을 받으면 폰에서 첫 화면이 2 ~ 3초 늦게 뜬다', fix: '0.9MB 곡이 게임 코드 · 그림보다 먼저 받아졌다 (수학 검문소에서 측정). 게임이 다 뜨고 그림을 받은 뒤, 늦어도 5초 안에 튼다.', seen: true },
      { title: 'iOS 에서 음량 페이드가 안 먹는다', fix: 'iOS 는 HTMLAudioElement.volume 을 무시한다. 곡 파일을 미리 작게 다듬어 두고, 코드에서는 켜고 끄기만 믿는다.', seen: true },
      { title: '페이드 타이머 하나를 같이 쓰면 곡을 빨리 바꿀 때 소리가 뚝 끊긴다', fix: '곡(오디오 요소)마다 WeakMap 으로 타이머를 따로 둔다.' },
      { title: '탭을 숨겨도 음악이 계속 울린다', fix: 'visibilitychange 에서 pause, 보이면 start 로 다시 서서히.' },
    ],
    next: ['i435', 'i437'],
    refs: [
      { name: 'MDN — HTMLMediaElement.play()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play' },
      { name: 'MDN — Page Visibility API', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API' },
    ],
  },

  u78: {
    id: 'u78',
    summary: '브라우저 음성 합성으로 게임 방법 글을 문장마다 끊어 소리 내어 읽고, 읽는 낱말을 밝혀 글을 아직 못 읽는 아이도 따라오게 한다.',
    terms: [
      { en: 'Web Speech API — speechSynthesis', ko: '브라우저 음성 합성 (TTS)' },
      { en: 'SpeechSynthesisUtterance', ko: '읽을 글 한 덩어리 (언어 · 목소리 · 빠르기 · 높이)' },
      { en: 'boundary event (charIndex)', ko: '지금 읽는 글자 자리 — 낱말 밝히기에' },
      { en: 'Text-to-speech (TTS)', ko: '글을 소리로' },
    ],
    goal: '{target}에 「읽어 주기」를 넣어 줘 — 브라우저 음성 합성으로 문장마다 끊어 읽고, 지금 읽는 낱말을 밝혀서. 목소리는 {style}.',
    targets: ['게임 방법 책', '퀴즈 문제 · 안내 말', '이야기 장면 대사'],
    styles: ['조금 느리고 또렷한 선생님 말투', '밝고 높은 아이 목소리', '차분한 해설'],
    platforms: ['web'],
    principle: [
      'speechSynthesis.speak(utterance) 한 줄이면 기기에 깔린 목소리로 읽는다. 언어(lang) · 빠르기(rate) · 높이(pitch) 를 정한다.',
      '긴 글을 한 번에 넣으면 브라우저에 따라 중간에 멈춘다 — 문장 끝(. ! ?)과 줄바꿈으로 잘라 차례로 넣는다.',
      '목소리는 getVoices() 에서 화면 언어로 시작하는 것을 고른다. 사이트 언어 10개를 lang 코드로 바꾼다 (ko → ko-KR).',
      '읽는 중 boundary 이벤트의 charIndex 로 지금 낱말을 찾아 밝힌다. 새로 읽기 전엔 늘 cancel() 로 앞의 것을 지운다.',
    ],
    when: ['글을 못 읽는 어린 아이용 안내 · 게임 방법', '여러 언어 안내를 녹음 없이 내야 할 때'],
    avoid: ['캐릭터 목소리 · 연기가 중요한 대사 — 녹음 파일이나 옹알이 효과음(i145)', '기기마다 목소리가 달라도 안 되는 곳 — 녹음 파일'],
    cost: 'light',
    costNote: '소리는 기기가 만든다 — 코드 부담은 거의 없음. 목소리 품질은 기기 · 브라우저마다 다르다.',
    level: 1,
    must: [
      'speechSynthesis 가 없는 브라우저면 단추를 숨기거나 막는다 (있는지 먼저 확인)',
      '읽기 전에 늘 speechSynthesis.cancel() — 앞 글과 겹치지 않게, 창을 닫을 때도 cancel',
      '문장 단위로 잘라 여러 utterance 로 — 마지막 것의 onend 에서 「다 읽음」 처리',
      '「—」「·」 같은 기호는 쉼표로 바꿔 이상하게 읽지 않게',
      '단추는 켜고 끄는 토글 (「읽어 줘요」 ↔ 「그만 읽기」), 쪽을 넘기면 새 쪽을 이어 읽기',
    ],
    done: [
      '「읽어 줘요」를 누르면 지금 보이는 쪽 제목 · 본문을 한국어 목소리로 읽는다',
      '읽는 낱말이 노란 띠로 차례로 밝아진다 (boundary 를 지원하는 목소리에서)',
      '다음 쪽으로 넘기면 앞 쪽 읽기는 멈추고 새 쪽을 읽는다',
      '언어를 바꾸면 그 언어 목소리로 읽는다',
    ],
    code: {
      lang: 'ts',
      title: '문장마다 끊어 읽기 (언어 · 목소리 고르기)',
      from: 'src/shell/components/RulesSheet.ts speak() 를 정리 + demos/demosSystem.ts u78 의 낱말 밝히기',
      body: `const LANG: Record<string, string> = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', zh: 'zh-TW', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE', vi: 'vi-VN', id: 'id-ID' };
const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

function speak(text: string, lang: string, onEnd: () => void, onWord?: (charIndex: number) => void) {
  speechSynthesis.cancel();                                    // 앞 글과 겹치지 않게
  const voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith(lang));
  const parts = text
    .replace(/[—·]/g, ', ')                                    // 기호는 쉼표로
    .split(/(?<=[.!?。])\\s+|\\n+/)                            // 긴 글은 문장마다
    .map((t) => t.trim())
    .filter((t) => t && t !== '.');
  parts.forEach((t, i) => {
    const u = new SpeechSynthesisUtterance(t);
    u.lang = LANG[lang] ?? 'ko-KR';
    if (voice) u.voice = voice;
    u.rate = 0.95;
    u.pitch = 1.05;
    if (onWord) u.onboundary = (e) => onWord(e.charIndex);     // 지금 읽는 글자 자리
    if (i === parts.length - 1) u.onend = onEnd;
    speechSynthesis.speak(u);
  });
  if (!parts.length) onEnd();
}`,
    },
    pitfalls: [
      { title: '긴 글을 한 번에 넣으면 중간에 읽기가 멈춘다', fix: '문장 끝 · 줄바꿈으로 잘라 여러 utterance 로 차례로 넣는다 — 이 사이트 게임 방법 책이 그렇게 한다.', seen: true },
      { title: '페이지를 막 열었을 때 getVoices() 가 빈 배열이다', fix: '목소리 목록은 늦게 온다. 없으면 lang 만 정해도 기본 목소리로 읽고, 필요하면 voiceschanged 이벤트 뒤에 다시 고른다.' },
      { title: '창을 닫았는데 계속 읽는다', fix: '닫기 · 쪽 넘기기 · 「그만 읽기」에서 모두 speechSynthesis.cancel().' },
      { title: '낱말 밝히기가 어떤 기기에서는 안 움직인다', fix: 'boundary 이벤트를 안 보내는 목소리가 있다. 밝히기는 덤으로 두고, 읽기 자체는 그것 없이도 되게.' },
    ],
    next: ['i437', 'i145'],
    refs: [
      { name: 'MDN — Web Speech API', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API' },
      { name: 'MDN — SpeechSynthesisUtterance', url: 'https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance' },
    ],
  },

  i31: {
    id: 'i31',
    summary: 'PannerNode 로 소리에 3D 자리를 주고 그 자리를 시간에 따라 옮겨, 공이 왼쪽에서 오른쪽으로 날면 소리도 왼쪽 귀에서 오른쪽 귀로 옮겨 간다.',
    terms: [
      { en: 'Spatial audio — Web Audio PannerNode', ko: '공간 소리 — 소리에 3D 자리 주기' },
      { en: 'HRTF panning model', ko: '머리 · 귀 모양을 흉내 낸 입체 소리 (이어폰에서 또렷)' },
      { en: 'AudioParam automation (linearRampToValueAtTime)', ko: '자리를 시간에 따라 미리 예약해 옮기기' },
      { en: 'StereoPannerNode', ko: '간단한 왼쪽 ↔ 오른쪽만 (−1 ~ 1)' },
    ],
    goal: '{target}에 공간 소리를 넣어 줘 — 소리 나는 물체의 자리를 PannerNode 로 옮겨 왼쪽 · 오른쪽 · 앞뒤에서 들리게. 분위기는 {style}.',
    targets: ['날아가는 공 소리', '대전 게임 — 상대 쪽에서 나는 소리', '화면 밖에서 다가오는 차'],
    styles: ['이어폰으로 또렷한 입체', '가볍게 좌우만', '게임 화면 위치 그대로'],
    platforms: ['webaudio', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 AudioSource.spatialBlend = 1 (3D) 로 두고 물체를 옮기면 된다 — 좌우만이면 panStereo.',
      godot: 'Godot 은 AudioStreamPlayer3D 를 물체에 붙이거나, 2D 는 AudioStreamPlayer2D.',
    },
    principle: [
      '듣는 사람은 가운데(0, 0, 0)에 있고, PannerNode 의 positionX · Y · Z 가 소리 나는 자리다. X 음수 = 왼쪽, 양수 = 오른쪽.',
      'panningModel = \'HRTF\' 로 두면 머리 · 귀를 지나는 소리를 흉내 내어 이어폰에서 방향이 또렷하다.',
      '자리는 AudioParam 이라 linearRampToValueAtTime 으로 「2.4초 동안 −3 → +3」 처럼 미리 예약하면 화면 프레임과 상관없이 매끄럽게 움직인다.',
      '여러 소리를 한 PannerNode 에 이으면 모두 같은 자리에서 난다 — 견본은 「띵똥」 12번을 하나의 움직이는 판너에 잇는다.',
    ],
    when: ['소리 나는 물체가 화면에서 움직일 때 (공 · 차 · 상대)', '화면 밖 일을 소리로 알려 줄 때 (「왼쪽에서 뭔가 온다」)'],
    avoid: ['폰 스피커 하나로만 듣는 게임 — 좌우 차이가 거의 안 들린다, 크기 · 높이 변화가 더 잘 들린다', '단추 · 정답 같은 화면 소리 — 가운데가 맞다'],
    cost: 'light',
    costNote: 'HRTF 판너는 일반 판너보다 무겁지만 동시에 몇십 개는 괜찮다. 수백 개면 \'equalpower\' 나 StereoPannerNode 로.',
    level: 2,
    must: [
      'AudioContext 는 사용자가 누를 때 만들거나 resume() — 그 전엔 소리가 안 난다',
      '자리는 매 프레임 value 로 바꾸지 말고 setValueAtTime · linearRampToValueAtTime 으로 예약 (지지직 막기)',
      '화면 좌표 → 소리 좌표 비율을 정해 두기 (견본: 화면 끝 = X ±3, 앞 Z −1)',
      '이어폰을 권하는 안내 — 스피커로는 차이가 작다',
    ],
    done: [
      '「들어 보기」를 누르면 띵똥 소리가 2.4초에 걸쳐 왼쪽 귀에서 오른쪽 귀로 옮겨 간다 (이어폰)',
      '화면의 공 · 왼쪽 오른쪽 음량 막대가 소리 자리와 맞게 움직인다',
      'HRTF 와 equalpower 를 바꿔 비교하면 HRTF 가 더 「바깥에서」 들린다',
    ],
    code: {
      lang: 'ts',
      title: '왼쪽 → 오른쪽으로 옮겨 가는 소리 (HRTF)',
      from: 'demos/demosSystem.ts i31 「들어 보기」 단추 + tone() 을 정리',
      body: `let AC: AudioContext | null = null;
function ac(): AudioContext {
  if (!AC) AC = new AudioContext();
  if (AC.state === 'suspended') void AC.resume();            // 첫 터치 뒤에 풀림
  return AC;
}
function tone(freq: number, dur: number, delay: number, dest: AudioNode) {
  const c = ac(), t0 = c.currentTime + delay;
  const osc = c.createOscillator(), gn = c.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, t0);
  gn.gain.setValueAtTime(0.0001, t0);
  gn.gain.exponentialRampToValueAtTime(0.18, t0 + 0.01);
  gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gn).connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}
function flyBy() {
  const c = ac(), pn = c.createPanner();
  pn.panningModel = 'HRTF';                                    // 이어폰에서 방향이 또렷
  const t0 = c.currentTime;
  pn.positionX.setValueAtTime(-3, t0);                         // 왼쪽에서
  pn.positionX.linearRampToValueAtTime(3, t0 + 2.4);           // 오른쪽으로 2.4초
  pn.positionZ.setValueAtTime(-1, t0);                         // 살짝 앞
  pn.connect(c.destination);
  for (let i = 0; i < 12; i++) tone(660 + (i % 2) * 220, 0.16, i * 0.2, pn);
}`,
    },
    pitfalls: [
      { title: '자리를 매 프레임 .value 로 바꾸면 지지직 잡음이 난다', fix: '값이 계단처럼 뛴다. setTargetAtTime · linearRampToValueAtTime 으로 예약하거나 짧게 미끄러지게.' },
      { title: '폰 스피커에서는 차이가 거의 안 들린다', fix: '스피커가 하나이거나 가깝다. 이어폰을 권하고, 거리는 소리 크기로도 함께 표현한다.' },
      { title: '옛 브라우저에서 positionX 가 없다', fix: '아주 옛 사파리는 setPosition(x, y, z) 만 있다. 없으면 StereoPannerNode 로 좌우만.' },
      { title: '모든 소리를 3D 로 두면 정답 · 단추 소리가 한쪽에서 들린다', fix: '화면 소리(UI)는 판너 없이 가운데로, 세계 안 물체 소리만 판너로.' },
    ],
    next: ['i157', 'i158'],
    refs: [
      { name: 'MDN — PannerNode', url: 'https://developer.mozilla.org/en-US/docs/Web/API/PannerNode' },
      { name: 'MDN — Web audio spatialization basics', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Web_audio_spatialization_basics' },
    ],
  },

  i52: {
    id: 'i52',
    summary: '두 음을 실제로 울려 AnalyserNode 의 FFT 로 주파수 막대를 그리고 파형을 겹쳐, 맥놀이 · 화음 비(2:3)가 눈으로 보이게 한다.',
    terms: [
      { en: 'FFT spectrum — Web Audio AnalyserNode', ko: '소리를 주파수별 세기로 나눠 보기' },
      { en: 'getByteFrequencyData · fftSize · frequencyBinCount', ko: '주파수 칸 값 읽기 · 칸 수 = fftSize ÷ 2' },
      { en: 'Beat frequency |f1 − f2|', ko: '맥놀이 — 두 음 차이만큼 초마다 커졌다 작아짐' },
      { en: 'Frequency ratio (perfect fifth 2:3, octave 1:2)', ko: '어울리는 음의 진동수 비' },
    ],
    goal: '{target}을(를) 만들어 줘 — 두 음을 울려 AnalyserNode FFT 로 주파수 막대를, 위에는 두 파형과 합친 파형을 그려 맥놀이가 보이게. 그림은 {style}.',
    targets: ['맥놀이 · 화음 체험', '음악 게임의 소리 막대 (이퀄라이저)', '진동수 · 비 설명 화면'],
    styles: ['밤하늘색 바탕 네온 막대', '깔끔한 과학 그래프', '귀여운 무지개 막대'],
    platforms: ['webaudio', 'canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 AudioSource.GetSpectrumData(배열, 0, FFTWindow.BlackmanHarris) 로 같은 막대를 얻는다.',
      godot: 'Godot 은 버스에 AudioEffectSpectrumAnalyzer 를 달고 get_magnitude_for_frequency_range 로 읽는다.',
    },
    principle: [
      '두 발진기(440Hz · 466Hz)를 AnalyserNode 에 잇고, 분석기에서 주 음량(0.18)을 거쳐 스피커로 보낸다.',
      'fftSize = 8192 이면 칸 하나 = 표본률 ÷ 8192 (약 5.4Hz). getByteFrequencyData 로 칸마다 0 ~ 255 를 받는다.',
      '200 ~ 1400Hz 를 막대 64개로 나눠, 막대마다 그 범위 칸들의 가장 큰 값을 높이로 쓴다.',
      '두 사인을 더하면 |cos(π(f2 − f1)t)| 덮개로 크기가 출렁인다 — 466 − 440 = 초당 26번 맥놀이. f2/f1 = 1.5 면 완전5도, 2 면 옥타브.',
    ],
    when: ['소리 · 진동수 · 화음을 눈으로 설명할 때', '음악에 맞춰 움직이는 막대 · 배경'],
    avoid: ['박자만 알고 싶을 때 — 저음 에너지로 박 찾기(i163)가 더 단순하다', '정확한 음 높이 측정 (튜너) — FFT 칸이 거칠어 자기상관 같은 다른 방법이 낫다'],
    cost: 'light',
    costNote: 'FFT 8192 는 분석기가 알아서 계산 — 한 프레임에 배열 하나 읽기. 막대 64개 그리기는 가볍다.',
    level: 2,
    must: [
      '소리는 단추를 눌러야만 켠다 — AudioContext 는 그때 만들고, 끄면 close()',
      '분석기 → 주 GainNode(작게) → 스피커 순서로, 분석은 크기와 상관없게',
      '막대는 칸 번호가 아니라 Hz 범위로 묶는다 — 칸 Hz = sampleRate / fftSize',
      '소리를 끈 상태에서도 그림이 보이게 (계산한 가짜 막대로) — 카드에서는 소리 없이',
      '음 높이를 바꿀 땐 setTargetAtTime(v, now, 0.02) 로 — 뚝 바꾸면 딸깍',
    ],
    done: [
      '소리를 켜면 440Hz · 466Hz 자리에 막대 둘이 솟고, 위 노란 합친 파형이 초당 26번 커졌다 작아진다',
      '두 번째 음을 880 으로 올리면 「1:2 옥타브」, 660 이면 「2:3 어울림」 표시가 뜬다',
      '두 음을 가깝게 하면 맥놀이가 느려지고, 같으면 멈춘다',
    ],
    code: {
      lang: 'ts',
      title: '두 음 + AnalyserNode 로 주파수 막대 읽기',
      from: 'demos/demosSim.ts i52 start() · draw() 의 막대 부분을 정리',
      body: `let ctx: AudioContext | null = null, an: AnalyserNode | null = null, freq: Uint8Array | null = null;
let o2: OscillatorNode | null = null;

function start(f1 = 440, f2 = 466) {
  ctx = new AudioContext();
  an = ctx.createAnalyser();
  an.fftSize = 8192;                                  // 칸 하나 ≈ 5.4Hz (48kHz 기준)
  an.smoothingTimeConstant = 0.7;
  freq = new Uint8Array(an.frequencyBinCount);
  const master = ctx.createGain();
  master.gain.value = 0.18;
  an.connect(master).connect(ctx.destination);
  const o1 = ctx.createOscillator();
  o2 = ctx.createOscillator();
  o1.frequency.value = f1;
  o2.frequency.value = f2;
  o1.connect(an); o2.connect(an);
  o1.start(); o2.start();
}
/** 200 ~ 1400Hz 를 막대 NB 개로 — 막대마다 그 범위 칸의 가장 큰 값 (0~1) */
function readBars(NB = 64, fLo = 200, fHi = 1400): Float32Array {
  const bars = new Float32Array(NB);
  if (!ctx || !an || !freq) return bars;
  an.getByteFrequencyData(freq);
  const binHz = ctx.sampleRate / an.fftSize;
  for (let b = 0; b < NB; b++) {
    const fa = fLo + ((fHi - fLo) * b) / NB, fb = fLo + ((fHi - fLo) * (b + 1)) / NB;
    let m = 0;
    for (let k = Math.floor(fa / binHz); k <= Math.ceil(fb / binHz); k++) m = Math.max(m, freq[k] ?? 0);
    bars[b] = m / 255;
  }
  return bars;
}
const setSecond = (v: number) => { if (o2 && ctx) o2.frequency.setTargetAtTime(v, ctx.currentTime, 0.02); };
const beat = (f1: number, f2: number) => Math.abs(f2 - f1);   // 초당 맥놀이 수`,
    },
    pitfalls: [
      { title: '막대를 칸 번호로 나누면 낮은 음 쪽이 몇 칸에 몰린다', fix: '칸은 Hz 로 고르게 나뉘어 있다. 보여 줄 Hz 범위를 정하고, 막대마다 그 범위 칸을 묶는다.' },
      { title: 'fftSize 를 작게 두면 440 · 466 이 막대 하나로 붙는다', fix: '칸 너비 = 표본률 ÷ fftSize. 26Hz 차이를 나누려면 8192 정도가 필요하다.' },
      { title: '견본 카드가 많은 화면에서 저절로 소리가 난다', fix: '소리는 「크게 보기」의 단추로만 켠다. 카드에서는 계산한 막대로 그림만.', seen: true },
      { title: '끄고 켤 때마다 AudioContext 를 새로 만들고 안 닫으면 쌓인다', fix: '끌 때 ctx.close() — 브라우저마다 동시에 열 수 있는 수가 정해져 있다.' },
    ],
    next: ['i163'],
    refs: [
      { name: 'MDN — AnalyserNode', url: 'https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode' },
      { name: 'MDN — Visualizations with Web Audio API', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API' },
      { name: 'Bartosz Ciechanowski — Sound', url: 'https://ciechanow.ski/sound/' },
    ],
  },

  i77: {
    id: 'i77',
    summary: '도리아 음계 위에서 가락을 그때그때 지어 수금처럼 뜯고 낮은 드론을 깔아, 소리 파일 하나 없이 끝나지 않는 배경음악을 실시간으로 합성한다.',
    terms: [
      { en: 'Procedural / generative music (Web Audio)', ko: '코드로 짓는 음악 — 파일 없음' },
      { en: 'Dorian mode', ko: '도리아 음계 (0 2 3 5 7 9 10) — 고대 · 중세풍' },
      { en: 'Lookahead scheduler (setInterval + AudioContext.currentTime)', ko: '조금 앞을 미리 예약하는 박자 시계' },
      { en: 'Plucked tone · drone · LFO', ko: '뜯는 소리 · 길게 끄는 바닥 음 · 느린 흔들림' },
    ],
    goal: '{target}에 쓸 배경음악을 소리 파일 없이 Web Audio 로 실시간 합성해 줘 — 음계 위에서 가락을 짓고, 드론을 깔고, 미리 예약하는 박자 시계로. 분위기는 {style}.',
    targets: ['고대 지중해풍 모험 게임', '배경음악이 없는 체험 화면', '박자 · 비율을 배우는 리듬 체험'],
    styles: ['수금 · 드론의 고대풍', '잔잔한 오르골', '신비한 동굴'],
    platforms: ['webaudio', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 AudioSettings.dspTime 으로 박자를 재고 AudioSource.PlayScheduled 로 미리 예약한다.',
      godot: 'Godot 은 AudioStreamGenerator 로 직접 합성하거나, 짧은 음 견본을 AudioStreamPlayer 로 예약 재생한다.',
    },
    principle: [
      '가락은 음계의 「도수」로 짓는다: 72% 는 한 칸 위나 아래, 나머지는 ±3칸 안에서 뛰기, 쉼표 12%, 16칸(한 구절) 끝 두 칸은 으뜸음 쪽(7 또는 4)으로 끝낸다.',
      '도수 → MIDI = 62(레) + 옥타브 × 12 + 도리아[0 2 3 5 7 9 10], MIDI → Hz = 440 × 2^((m − 69)/12).',
      '뜯는 소리: 세모파 + 2.01배 사인(0.35) → 저역 필터가 음높이 × 8 에서 × 1.5 로 0.4초에 닫힘 → 6ms 어택 · 지수 감쇠.',
      '드론: 톱니파 둘(으뜸 − 12 · 으뜸 − 5, 즉 낮은 5도)을 420Hz 저역 필터로, 0.13Hz 느린 흔들림(±180Hz)을 필터에. 32칸마다 레 → 레 → 도 → 솔.',
      '50ms 마다 「지금 + 0.25초」 앞까지의 음을 AudioContext 시계로 예약 — 화면이 버벅여도 박자가 안 흔들린다.',
    ],
    when: ['배경음악 파일이 없거나 용량을 줄여야 할 때', '빠르기 · 음계를 실시간으로 바꾸는 체험 (박자 · 비율)'],
    avoid: ['완성도 높은 곡이 필요한 이야기 게임 — 다듬은 곡 파일(u77)이 낫다', '아주 많은 악기 층 — 층 쌓기 엔진(i435)처럼 미리 짠 악보가 관리하기 쉽다'],
    cost: 'light',
    costNote: '음 하나 = 발진기 2 + 필터 1 + 게인 2, 짧게 쓰고 버린다. 드론 발진기 3개는 계속. 폰에서도 가볍다.',
    level: 2,
    must: [
      '박자는 AudioContext.currentTime 기준 미리 예약 (setInterval 50ms · 앞 0.25초) — requestAnimationFrame 으로 음을 치지 않는다',
      '소리는 단추로만 켠다 (자동 재생 금지), 끌 땐 드론을 setTargetAtTime 으로 줄인 뒤 stop',
      '빠르기를 바꿀 땐 지금 자리를 기준점(anchor)으로 다시 잡아 박자가 튀지 않게',
      '주 음량 0.5 + 메아리(0.33초 · 되먹임 0.32 · 섞기 0.35) 하나로 공간감 — 잔향을 겹겹이 쌓지 않는다',
    ],
    done: [
      '▶ 를 누르면 드론이 1.2초에 걸쳐 깔리고 그 위로 수금 가락이 끊이지 않고 이어진다',
      '구절 끝마다 가락이 으뜸음으로 돌아와 「끝맺는」 느낌이 들고, 두 마디마다 드론 음이 바뀐다',
      '빠르기 손잡이를 돌려도 박자가 튀거나 음이 겹치지 않는다',
      '탭을 바꾸고 와도 박자가 흐트러지지 않는다',
    ],
    code: {
      lang: 'ts',
      title: '도리아 가락 짓기 + 뜯는 소리 + 미리 예약',
      from: 'demos/demosEpic.ts composeMelody · degToMidi · makeI77 의 pluck · schedule 을 정리',
      body: `const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const degToMidi = (d: number) => 62 + Math.floor(d / 7) * 12 + DORIAN[((d % 7) + 7) % 7];
const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function compose(r: () => number, steps: number) {
  const out: { step: number; deg: number; len: number }[] = [];
  let deg = 4, s = 0;
  while (s < steps) {
    const inPhrase = s % 16;
    if (inPhrase !== 0 && r() < 0.12) { s += 1; continue; }            // 쉼표
    const jump = r() < 0.72 ? (r() < 0.5 ? -1 : 1) : Math.round((r() - 0.5) * 6);
    deg = Math.max(0, Math.min(11, deg + jump));
    let len = r() < 0.65 ? 1 : 2;
    if (inPhrase >= 14) { deg = r() < 0.6 ? 7 : 4; len = 16 - inPhrase; } // 구절 끝은 으뜸음 쪽
    out.push({ step: s, deg, len });
    s += len;
  }
  return out;
}
function pluck(ac: AudioContext, out: AudioNode, time: number, hz: number, dur: number) {
  const o1 = ac.createOscillator(), o2 = ac.createOscillator();
  const f = ac.createBiquadFilter(), gn = ac.createGain(), g2 = ac.createGain();
  o1.type = 'triangle'; o2.type = 'sine';
  o1.frequency.value = hz; o2.frequency.value = hz * 2.01;          // 살짝 어긋난 배음
  f.type = 'lowpass';
  f.frequency.setValueAtTime(hz * 8, time);
  f.frequency.exponentialRampToValueAtTime(hz * 1.5, time + 0.4);   // 뜯은 뒤 어두워짐
  gn.gain.setValueAtTime(0.0001, time);
  gn.gain.exponentialRampToValueAtTime(0.28, time + 0.006);
  gn.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(0.6, dur * 2.2));
  g2.gain.value = 0.35;
  o1.connect(f); o2.connect(g2).connect(f); f.connect(gn).connect(out);
  o1.start(time); o2.start(time);
  o1.stop(time + dur * 2.4 + 0.7); o2.stop(time + dur * 2.4 + 0.7);
}
// 50ms 마다: 「지금 + 0.25초」 앞까지 아직 안 친 걸음을 예약
// const ahead = anchorStep + (ac.currentTime - anchorT) / stepDur + 0.25 / stepDur + 1;
// while (scheduled < ahead) { at = anchorT + (scheduled - anchorStep) * stepDur; …pluck(ac, master, at, hz, len * stepDur); scheduled++; }`,
    },
    pitfalls: [
      { title: 'requestAnimationFrame 에서 음을 치면 박자가 들쭉날쭉하다', fix: '화면 프레임은 흔들린다. setInterval 로 깨어나 AudioContext 시계로 조금 앞을 예약하는 「두 시계」 방식을 쓴다.' },
      { title: '빠르기를 바꾸는 순간 음이 몰려 나오거나 건너뛴다', fix: '바꾸기 직전 자리를 anchorStep · anchorT 로 다시 잡고, 그 뒤 걸음만 새 빠르기로 계산한다.' },
      { title: '완전히 무작위인 음은 음악처럼 안 들린다', fix: '대개 한 칸씩 걷고 가끔 뛰며, 구절 끝에 으뜸음으로 돌아오게 — 규칙이 「곡」을 만든다.' },
      { title: '소리 견본이 카드에서 저절로 울린다', fix: '소리는 크게 보기의 ▶ 단추로만, 카드에서는 피아노 롤 · 파형 그림만.', seen: true },
    ],
    prev: ['i499'],
    next: ['i435', 'i438'],
    refs: [
      { name: 'MDN — Advanced techniques: creating and sequencing audio', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques' },
      { name: 'Epicurius (참고 작품)', url: 'https://aibreakfast.itch.io/epicurius' },
    ],
  },

  i435: {
    id: 'i435',
    summary: '북 · 베이스 · 화음 · 멜로디를 같은 박자 시계로 늘 함께 울리고 층마다 음량만 켜고 꺼서, 음악이 끊기지 않고 상황에 따라 분위기만 바뀐다.',
    terms: [
      { en: 'Vertical layering (vertical remixing)', ko: '세로 층 쌓기 — 같은 곡의 악기 층을 켜고 끄기' },
      { en: 'Adaptive music stems', ko: '상황에 따라 바뀌는 음악의 층(스템)' },
      { en: 'GainNode per layer · setTargetAtTime', ko: '층마다 게인 하나 — 부드럽게 0 ↔ 1' },
      { en: 'Lookahead step sequencer', ko: '미리 예약하는 칸 악보 재생기' },
    ],
    goal: '{target}에 층 쌓기 배경음악을 넣어 줘 — 북 · 베이스 · 화음 · 멜로디를 같은 박자로 늘 함께 돌리고, 상황마다 층의 음량만 켜고 끄게. 분위기는 {style}.',
    targets: ['평화 → 탐험 → 적 등장 → 보스 진행 게임', '퍼즐 단계가 오를수록 악기가 늘어나는 게임', '수업 체험 — 층을 직접 켜 보기'],
    styles: ['밝은 신스 팝', '잔잔한 어쿠스틱', '긴장감 있는 전자음'],
    platforms: ['webaudio', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 층마다 AudioSource 를 두고 같은 dspTime 에 PlayScheduled 로 함께 시작한 뒤 volume 만 바꾼다.',
      godot: 'Godot 4.3 은 AudioStreamSynchronized 로 여러 층을 맞춰 틀고 층마다 음량을 바꾼다.',
    },
    principle: [
      '모든 층은 한 엔진 · 한 박자 시계에서 함께 울린다. 층을 「끄는」 것은 멈추는 게 아니라 그 층 GainNode 를 0 으로 내리는 것.',
      '그래서 다시 켜면 박자 · 마디 자리가 이미 맞아 있다 — 처음부터 다시 시작하지 않는다.',
      '층 게인 → 저역 필터 → 덕킹 게인 → 주 음량(0.5) → 압축기(−12dB · 8:1) → 스피커. 켜고 끄기는 setTargetAtTime(v, 지금, 0.05) 로 부드럽게.',
      '상황 바뀜은 박자에 맞춘다: 견본은 16칸(2마디)마다 다음 상황 (평화 = 화음만 · 탐험 = 베이스 + 화음 + 멜로디 · 적 = 북 + 베이스 + 화음 · 보스 = 넷 다).',
    ],
    when: ['게임 진행 · 긴장도에 따라 음악을 바꾸되 끊김은 없어야 할 때', '같은 곡을 오래 들어도 덜 질리게 할 때'],
    avoid: ['장면마다 완전히 다른 곡이 필요할 때 — 곡 갈아 끼우기 · 크로스페이드(u77)', '빠르기 · 조까지 바꿔야 할 때 — 적응형 음악(i436)'],
    cost: 'light',
    costNote: '꺼진 층도 발진기는 돈다 — 층 4 + 경보 1, 8분음표마다 노드 몇 개. 폰에서도 가볍다.',
    level: 2,
    must: [
      '모든 층을 하나의 박자 시계(AudioContext 시간)로 — 층마다 따로 setInterval 을 두지 않는다',
      '층 끄기 = 게인 0 (재생 멈춤 아님), 바꿀 땐 setTargetAtTime 시간 상수 0.05 정도',
      '상황 전환은 마디 · 2마디 경계에서 — 박자 중간에 확 바뀌지 않게',
      '여러 층이 겹쳐도 찢어지지 않게 끝에 압축기 하나',
    ],
    done: [
      '2마디마다 상황 이름이 바뀌며 층이 더해지고 빠지는데 음악은 한 번도 끊기지 않는다',
      '층을 껐다 켜면 그 층이 마디 자리에 맞춰 바로 들어온다 (처음부터 다시 시작 안 함)',
      '「직접 고르기」로 층 넷을 마음대로 켜고 끌 수 있고, 섞는 판 막대가 층마다 튄다',
    ],
    code: {
      lang: 'ts',
      title: '층마다 게인 + 미리 예약하는 칸 재생기',
      from: 'demos/demosMusicNet.ts class Engine (constructor · pump · setLayer) 를 정리',
      body: `class LayerEngine {
  ac = new AudioContext({ latencyHint: 'interactive' });
  lg: GainNode[] = [];                         // 0 북 · 1 베이스 · 2 화음 · 3 멜로디
  bpm = 100; step = 0; nextT: number; timer: number;
  constructor(on: number[], private play: (layer: GainNode[], s: number, T: number, d: number) => void) {
    const comp = this.ac.createDynamicsCompressor();
    comp.threshold.value = -12; comp.ratio.value = 8;
    comp.attack.value = 0.004; comp.release.value = 0.2;
    comp.connect(this.ac.destination);
    const out = this.ac.createGain();
    out.gain.value = 0.5;
    out.connect(comp);
    for (let i = 0; i < 4; i++) {
      const gn = this.ac.createGain();
      gn.gain.value = on[i] ?? 0;
      gn.connect(out);
      this.lg.push(gn);
    }
    this.nextT = this.ac.currentTime + 0.1;
    this.timer = window.setInterval(() => this.pump(), 25);
  }
  stepDur() { return 60 / this.bpm / 2; }     // 8분음표 한 칸
  pump() {                                     // 앞 0.14초까지 예약 — 모든 층이 같은 T 로
    while (this.nextT < this.ac.currentTime + 0.14) {
      this.play(this.lg, this.step % 32, this.nextT, this.stepDur());
      this.nextT += this.stepDur();
      this.step++;
    }
  }
  setLayer(i: number, v: number) {             // 끄기 = 멈춤이 아니라 음량 0
    this.lg[i]?.gain.setTargetAtTime(v, this.ac.currentTime, 0.05);
  }
  close() { clearInterval(this.timer); void this.ac.close(); }
}
// 상황표: 2마디(16칸)마다 다음 상황
const STAGES = [[0, 0, 1, 0], [0, 1, 1, 1], [1, 1, 1, 0], [1, 1, 1, 1]];`,
    },
    pitfalls: [
      { title: '층을 끌 때 재생을 멈추면 다시 켤 때 박자가 어긋난다', fix: '모든 층을 늘 같이 예약하고, 끄기는 게인 0 으로만.' },
      { title: '게인을 .value 로 바로 바꾸면 「딱」 소리가 난다', fix: 'setTargetAtTime(v, 지금, 0.05) 처럼 아주 짧게 미끄러지게 바꾼다.' },
      { title: '층마다 따로 타이머를 돌리면 시간이 지날수록 층끼리 어긋난다', fix: '타이머는 하나, 모든 층의 음을 같은 시각 T 로 예약한다.' },
      { title: '층을 다 켜면 소리가 찢어진다', fix: '층 합을 압축기(−12dB · 8:1)에 통과시키고, 층 음량 자체도 처음부터 작게 잡는다.' },
    ],
    prev: ['u77'],
    next: ['i436', 'i438'],
    refs: [{ name: 'MDN — Advanced techniques: creating and sequencing audio', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques' }],
    source: [{ file: 'demosMusicNet.ts', symbol: 'Engine' }, { file: 'demosMusicNet.ts', symbol: 'demoLayers' }],
  },

  i436: {
    id: 'i436',
    summary: '긴장 값 하나(0 평온 ~ 1 위기)로 빠르기 · 필터 밝기 · 음 높이 · 층 수를 함께 바꿔, 남은 시간이 줄수록 음악이 빨라지고 밝아지고 올라간다.',
    terms: [
      { en: 'Adaptive music (intensity parameter)', ko: '적응형 음악 — 긴장 값 하나로 여러 매개변수' },
      { en: 'Tempo (BPM) change', ko: '빠르기 바꾸기' },
      { en: 'Low-pass filter cutoff sweep', ko: '저역 필터 열기 — 먹먹함 → 또렷함' },
      { en: 'Transposition at bar boundary', ko: '마디 첫 박에서만 음 높이 올리기' },
    ],
    goal: '{target}에 긴장에 따라 바뀌는 음악을 넣어 줘 — 긴장 값 하나로 빠르기 · 필터 · 음 높이 · 층 수가 함께 바뀌게. 분위기는 {style}.',
    targets: ['시간 제한 퀴즈 · 퍼즐', '끝판 · 보스 등장', '남은 기회가 줄어드는 게임'],
    styles: ['점점 조여 오는 긴장', '밝고 신나는 마지막 스퍼트', '오락실 경보'],
    platforms: ['webaudio', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 AudioMixer 의 노출 매개변수(SetFloat)로 저역 필터 · 음량을 바꾸고, 빠르기는 음 예약 간격으로 바꾼다.',
      godot: 'Godot 은 버스의 AudioEffectLowPassFilter.cutoff_hz 와 층 음량을 긴장 값에 맞춰 바꾼다.',
    },
    principle: [
      '긴장 k 하나(남은 시간 30초 → 0 이면 0 → 1)에서 모든 값을 계산한다: 빠르기 = 92 + 60k BPM, 필터 = 700 + 11000 · k^1.6 Hz.',
      'k 가 문턱을 넘으면 층이 더해진다: 북 > 0.22 · 멜로디 > 0.48 · 찰랑이 16분 > 0.62 · 음 +2반음 > 0.72 · 경보음 > 0.8.',
      'k 는 바로 쓰지 않고 lerp(지금, 목표, 1 − e^(−5·dt)) 로 쫓아가게 해 갑자기 튀지 않는다.',
      '음 높이 올리기는 「바라는 값」만 정해 두고 실제로는 마디 첫 칸(s % 8 === 0)에서만 바꾼다 — 가락 중간에 조가 바뀌지 않게.',
    ],
    when: ['시간 제한 · 위기가 있는 게임에서 「서둘러!」를 소리로 알릴 때', '같은 곡으로 평온 ~ 위기를 모두 덮고 싶을 때'],
    avoid: ['차분히 생각해야 하는 퍼즐 — 빨라지는 음악이 방해가 된다', '곡 분위기가 완전히 달라져야 할 때 — 곡 갈아 끼우기(u77)'],
    cost: 'light',
    costNote: '층 쌓기 엔진(i435) 위에 매 프레임 값 몇 개를 계산해 AudioParam 에 넘길 뿐 — 가볍다.',
    level: 2,
    must: [
      '모든 음악 매개변수를 긴장 값 하나의 함수로 (params(k)) — 따로따로 조절하지 않는다',
      '긴장 값은 지수 평활로 쫓아가게 — 매 프레임 확 바뀌지 않게',
      '음 높이(조) 바꿈은 마디 첫 박에서만',
      '필터는 setTargetAtTime(cut, 지금, 0.1) 로 — 매 프레임 .value 대입 금지',
    ],
    done: [
      '남은 초가 줄수록 빠르기(92 → 152 BPM)가 오르고 먹먹하던 소리가 또렷해진다',
      '긴장 0.72 를 넘으면 마디 첫 박에서 음악이 2반음 올라가고, 0.8 을 넘으면 경보음이 섞인다',
      '손잡이로 긴장을 0 ↔ 1 로 오가도 소리가 튀지 않고 부드럽게 따라온다',
    ],
    code: {
      lang: 'ts',
      title: '긴장 값 → 음악 매개변수',
      from: 'demos/demosMusicNet.ts demoTension params() · draw() 앞부분을 정리',
      body: `/** 긴장 k (0 평온 ~ 1 위기) → 음악 값 한 묶음 */
const params = (k: number) => ({
  bpm: Math.round(92 + 60 * k),
  cut: Math.round(700 + 11000 * Math.pow(k, 1.6)),   // 낮으면 먹먹, 높으면 또렷
  trans: k > 0.72 ? 2 : 0,                            // +2 반음 (마디 첫 박에서만 적용)
  layers: [k > 0.22 ? 1 : 0, 1, 1, k > 0.48 ? 1 : 0, k > 0.8 ? 1 : 0], // 북 · 베이스 · 화음 · 멜로디 · 경보
  h16: k > 0.62,                                      // 찰랑이 16분음표
});

let ten = 0, timeLeft = 30;
function update(eng: { bpm: number; wantTrans: number; hats16: boolean; alarm: boolean; ac: AudioContext;
                       filt: BiquadFilterNode; setLayer(i: number, v: number): void }, dt: number) {
  timeLeft -= Math.min(dt, 0.1);
  const want = Math.min(1, Math.max(0, 1 - Math.max(0, timeLeft) / 30));
  ten += (want - ten) * (1 - Math.exp(-Math.min(dt, 0.1) * 5));   // 부드럽게 쫓아가기
  const P = params(ten);
  eng.bpm = P.bpm;                                    // 다음에 예약하는 칸부터 새 빠르기
  eng.wantTrans = P.trans;                            // 엔진이 s % 8 === 0 에서 trans = wantTrans
  eng.hats16 = P.h16;
  eng.alarm = P.layers[4] === 1;
  eng.filt.frequency.setTargetAtTime(P.cut, eng.ac.currentTime, 0.1);
  for (let i = 0; i < 5; i++) eng.setLayer(i, P.layers[i]);
}`,
    },
    pitfalls: [
      { title: '음 높이를 바로 바꾸면 가락 중간에 조가 틀어져 이상하게 들린다', fix: '바라는 값(wantTrans)만 적어 두고 엔진이 마디 첫 칸에서만 반영한다.' },
      { title: '빠르기를 바꾸니 이미 예약한 음과 겹쳐 박이 흔들린다', fix: '이미 예약한 앞 0.14초는 그대로 두고, 그다음 칸부터 새 칸 길이(60/bpm/2)로 예약한다.' },
      { title: '필터를 0 ~ 12000Hz 로 곧게 바꾸면 처음엔 너무 빨리 밝아진다', fix: '귀는 높이를 비율로 듣는다. k^1.6 처럼 휜 곡선으로 낮은 쪽을 천천히.' },
      { title: '위기 내내 빨간 번쩍 · 경보가 계속되면 아이가 불안해한다', fix: '경보 · 화면 번쩍은 긴장 0.6 ~ 0.8 넘어서만, 짧게.' },
    ],
    prev: ['i435'],
    next: ['i437'],
    source: [{ file: 'demosMusicNet.ts', symbol: 'demoTension' }],
  },

  i437: {
    id: 'i437',
    summary: '안내 말소리 · 중요한 효과음이 나오는 동안만 배경음악 음량을 −14dB 쯤 쑥 낮췄다가 끝나면 천천히 되돌려, 말이 음악에 묻히지 않게 한다.',
    terms: [
      { en: 'Audio ducking', ko: '덕킹 — 중요한 소리가 날 때 다른 소리를 낮추기' },
      { en: 'Duck GainNode · dB → gain (10^(dB/20))', ko: '음악 길에만 있는 게인 · 데시벨을 배수로' },
      { en: 'setTargetAtTime attack / release', ko: '빨리 내리고 천천히 올리기' },
      { en: 'Sidechain compression', ko: '(다른 방식) 말소리 크기로 음악을 눌러 주는 압축' },
    ],
    goal: '{target}에 소리 낮추기(덕킹)를 넣어 줘 — 말소리 · 중요한 소리가 날 때 배경음악만 빠르게 낮췄다가 끝나면 천천히 되돌리게. 느낌은 {style}.',
    targets: ['선배 · 안내 캐릭터 대사', '정답 · 레벨 업 같은 큰 알림 소리', '읽어 주기(TTS) 와 함께 도는 음악'],
    styles: ['자연스럽게 살짝 물러나는', '라디오 진행자처럼 확실하게', '거의 티 안 나게'],
    platforms: ['webaudio', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 AudioMixer 의 Duck Volume 효과를 음악 그룹에 걸고, 말소리 그룹에서 Send 로 보낸다.',
      godot: 'Godot 은 음악 버스에 AudioEffectCompressor 를 걸고 sidechain 을 말소리 버스로 둔다.',
    },
    principle: [
      '음악 길에만 「덕 게인」을 하나 끼운다 (층 → 필터 → 덕 게인 → 주 음량). 말소리는 덕 게인을 거치지 않고 바로 주 음량으로.',
      '말이 시작되기 0.05초 전부터 덕 게인을 10^(−14/20) ≈ 0.2 로 빠르게(시간 상수 0.05) 내린다.',
      '말이 끝나는 시각부터 1 로 천천히(시간 상수 0.25) 되돌린다 — 빨리 내리고 천천히 올려야 자연스럽다.',
      '말 길이를 미리 알면(합성 말소리 · 파일 길이) 시작 · 끝 둘 다 미리 예약한다. 새 말이 오면 cancelScheduledValues 로 앞 예약을 지운다.',
    ],
    when: ['배경음악 위로 안내 말 · 대사가 나올 때', '정답 · 보상처럼 꼭 들려야 하는 효과음'],
    avoid: ['모든 효과음마다 덕킹 — 음악이 계속 들썩인다. 말소리 · 큰 알림에만', '음악이 원래 아주 작으면 필요 없다'],
    cost: 'light',
    costNote: 'GainNode 하나와 예약 두 번 — 거의 공짜.',
    level: 1,
    must: [
      '덕 게인은 음악 길에만 — 말소리 · 효과음 길에는 넣지 않는다',
      '내리기는 빠르게(0.05), 올리기는 천천히(0.25) — 반대로 하면 펌프질처럼 들린다',
      '새로 예약하기 전 cancelScheduledValues(지금) — 말이 연달아 와도 꼬이지 않게',
      '깊이는 dB 로 정해 10^(dB/20) 로 바꾼다 (−14dB 기본, 조절 가능)',
    ],
    done: [
      '말풍선이 뜨고 말소리가 나는 동안 음악 그래프가 쑥 내려가고, 끝나면 천천히 올라온다',
      '덕킹 끄기와 비교하면 켰을 때 말이 훨씬 또렷하다',
      '말을 연달아 시켜도 음악이 계속 낮게 유지되다가 마지막 말 뒤에 올라온다',
      '깊이를 −6dB ~ −24dB 로 바꾸면 물러나는 정도가 바뀐다',
    ],
    code: {
      lang: 'ts',
      title: '음악 길의 덕 게인 + 말소리 동안 낮추기',
      from: 'demos/demosMusicNet.ts class Engine (duck · voice) + demoDuck say() 를 정리',
      body: `const ac = new AudioContext();
const out = ac.createGain();       out.gain.value = 0.5;  out.connect(ac.destination);
const duck = ac.createGain();      duck.connect(out);           // 음악만 이 길로
const musicIn = ac.createBiquadFilter();
musicIn.type = 'lowpass'; musicIn.frequency.value = 18000;
musicIn.connect(duck);                                           // 층들은 musicIn 에 잇는다
const voice = ac.createGain();     voice.connect(out);           // 말소리는 덕 게인을 안 거침

/** 말소리를 T 에 틀고, 그동안 음악을 depthDb 만큼 낮춘다. speak 은 말 길이(초)를 돌려준다 */
function say(speak: (T: number, dest: AudioNode) => number, depthDb = -14) {
  const T = ac.currentTime + 0.05;
  const d = speak(T, voice);
  const g = duck.gain;
  g.cancelScheduledValues(ac.currentTime);                       // 앞 예약 지우기
  g.setTargetAtTime(Math.pow(10, depthDb / 20), T - 0.05, 0.05); // 빨리 내리고
  g.setTargetAtTime(1, T + d, 0.25);                             // 천천히 되돌림
}`,
    },
    pitfalls: [
      { title: '덕 게인을 주 음량 뒤에 두면 말소리까지 같이 작아진다', fix: '덕 게인은 음악 길에만 끼우고, 말소리는 그 뒤(주 음량)로 바로 보낸다.' },
      { title: '말이 연달아 오면 앞 말의 「되돌리기」가 끼어들어 음악이 들썩인다', fix: '새 말을 예약하기 전에 cancelScheduledValues(지금) 로 앞 예약을 지우고 다시 건다.' },
      { title: '올리기를 빠르게 하면 말 끝마다 음악이 「훅」 튀어나온다', fix: '되돌리기 시간 상수를 0.25 정도로 길게.' },
      { title: '말 길이를 모르는 TTS 에서는 끝을 예약할 수 없다', fix: '말 시작 이벤트에서 내리고, onend 이벤트에서 되돌리기를 예약한다.' },
    ],
    prev: ['i165'],
    next: ['i436'],
    refs: [{ name: 'MDN — AudioParam.setTargetAtTime()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/setTargetAtTime' }],
    source: [{ file: 'demosMusicNet.ts', symbol: 'demoDuck' }],
  },

  i438: {
    id: 'i438',
    summary: '화면 연출의 시계를 음악이 실제로 예약된 박자 자리에서 읽어, 공이 땅에 닿는 순간 · 별 터짐을 박에 딱 맞추고 제멋대로 타이머처럼 어긋나지 않게 한다.',
    terms: [
      { en: 'Beat-synced visuals (music clock)', ko: '음악 박자 시계에 맞춘 연출' },
      { en: 'AudioContext.currentTime as master clock', ko: '소리 시계를 기준 시계로' },
      { en: 'Quantized trigger (next beat / next bar)', ko: '다음 박 · 다음 마디에 맞춰 예약' },
      { en: 'Timer drift', ko: '따로 노는 타이머가 점점 어긋나는 것' },
    ],
    goal: '{target}에 박자 맞춰 연출을 넣어 줘 — 음악 엔진이 예약한 박자 자리를 시계로 써서 튀기 · 번쩍 · 등장이 박에 맞게, 누르면 다음 박에 예약되게. 느낌은 {style}.',
    targets: ['리듬에 맞춰 튀는 캐릭터 · 공', '정답 축하 별 터짐', '마디마다 바뀌는 배경 조명'],
    styles: ['신나는 클럽 조명', '귀여운 통통 튀기', '은은한 숨쉬기'],
    platforms: ['webaudio', 'canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 AudioSettings.dspTime 에서 박 자리를 계산해 Update 에서 연출 위상으로 쓴다.',
      godot: 'Godot 은 AudioStreamPlayer.get_playback_position() + AudioServer.get_time_since_last_mix() 로 지금 자리를 맞춘다.',
    },
    principle: [
      '음악 엔진은 칸을 예약할 때마다 (칸 번호, 시작 시각, 칸 길이)를 기록해 둔다.',
      '지금 들리는 자리 pos = 지금 시각 이전에 시작한 마지막 칸 번호 + (지금 − 그 칸 시작) ÷ 칸 길이. 이 값이 연출의 시계다.',
      '공 높이 = 1 − (2·frac(pos ÷ 주기) − 1)² — 주기마다 땅에 닿는 순간이 정확히 박이다. 한 박 · 두 박 · 반 박 공이 함께 맞는다.',
      'floor(pos ÷ 8) 가 바뀌면 마디 첫 박 → 별 터짐. 「터뜨리기」를 누르면 바로가 아니라 floor(pos ÷ 2) 가 바뀌는 다음 박에 터진다.',
      '박자 맞춤을 끄면 조금 다른 빠르기(× 1.13 ~)의 제 타이머로 돌려 — 금방 어긋나는 것을 비교로 보여 준다.',
    ],
    when: ['리듬 게임 · 음악에 맞춰 움직이는 배경 · 축하 연출', '정답 소리 · 연출을 음악 박에 맞춰 더 「딱」 맞게 할 때'],
    avoid: ['녹음된 곡 파일만 있고 박 정보가 없을 때 — 박자 검출(i163)로 박을 찾거나, BPM 을 알고 시작 시각에서 계산', '박자와 상관없는 즉각 반응(단추 누름) — 늦추면 답답하다'],
    cost: 'light',
    costNote: '기록 64개에서 지금 자리를 찾는 계산 하나 — 가볍다.',
    level: 2,
    must: [
      '연출 시계는 performance.now · 프레임 dt 적분이 아니라 음악이 예약한 박자 자리에서 읽는다',
      '소리가 꺼졌을 때만 dt 로 적분하는 대체 시계 (견본 Clock 클래스)',
      '「누르면 터짐」 같은 사용자 요청은 다음 박 · 마디로 양자화 — 단, 반응이 늦다고 느끼지 않을 길이(반 박 ~ 한 박)로',
      '박 넘김 판정은 「이전 프레임 pos 와 지금 pos 의 floor 가 다른가」로 — 프레임이 건너뛰어도 놓치지 않게',
    ],
    done: [
      '소리를 켜면 세 공이 각자 한 박 · 두 박 · 반 박마다 북소리에 딱 맞춰 땅에 닿는다',
      '마디 첫 박마다 별이 터지고 화면이 살짝 밝아진다',
      '「박자 맞춤」을 끄면 공과 별이 점점 북소리와 어긋나는 것이 들린다',
      '「터뜨리기」를 누르면 다음 박에 맞춰 터진다',
    ],
    code: {
      lang: 'ts',
      title: '예약 기록에서 지금 박자 자리 읽기 + 박 넘김 판정',
      from: 'demos/demosMusicNet.ts Engine.pump · Engine.pos · class Clock · demoBeat 를 정리',
      body: `// 음악 엔진: 칸을 예약할 때 기록
const hist: { s: number; t: number; d: number }[] = [];
function onScheduled(step: number, T: number, d: number) {
  hist.push({ s: step, t: T, d });
  if (hist.length > 64) hist.shift();
}
/** 지금 들리는 자리 (칸 단위 소수) — 소리 시계 기준 */
function pos(ac: AudioContext): number {
  const now = ac.currentTime;
  for (let i = hist.length - 1; i >= 0; i--) {
    const e = hist[i];
    if (e.t <= now) return e.s + Math.min(1, (now - e.t) / e.d);
  }
  return (hist[0]?.s ?? 0) - 0.001;
}
// 화면: 매 프레임
let prevPos = 0, burstQueued = false;
function frame(ac: AudioContext, burst: () => void) {
  const p = pos(ac);                                   // 8분음표 칸 — 2칸 = 한 박, 8칸 = 한 마디
  const bounce = (per: number) => 1 - Math.pow(2 * ((p / per) % 1) - 1, 2); // 박마다 땅에 닿음
  void bounce;
  if (Math.floor(p / 8) !== Math.floor(prevPos / 8)) burst();               // 마디 첫 박
  if (burstQueued && Math.floor(p / 2) !== Math.floor(prevPos / 2)) { burst(); burstQueued = false; } // 다음 박에
  prevPos = p;
}
const requestBurst = () => { burstQueued = true; };   // 누르면 바로 말고 다음 박에`,
    },
    pitfalls: [
      { title: 'setInterval · requestAnimationFrame 시계로 연출하면 음악과 점점 어긋난다', fix: '두 시계는 따로 논다. 연출 위상을 음악이 예약한 박자 자리(pos)에서 읽는다 — 견본의 「박자 맞춤 끄기」가 그 차이를 보여 준다.' },
      { title: '「지금 박」 판정을 pos 정수와 같은지로 하면 프레임이 건너뛸 때 놓친다', fix: '이전 프레임과 지금의 floor 값이 다른지로 판정한다.' },
      { title: '예약 시각(미래)을 그대로 쓰면 연출이 소리보다 먼저 나온다', fix: '음은 0.1초쯤 앞서 예약된다. 기록에서 「시작 시각 ≤ 지금」 인 칸만 써서 실제로 들리는 자리를 구한다.' },
      { title: '탭이 숨었다 돌아오면 박 넘김이 한꺼번에 몰린다', fix: '오래 멈췄으면(pos 차이가 크면) 그 사이 연출은 건너뛰고 지금 자리부터 다시.' },
    ],
    prev: ['i435'],
    next: ['i163'],
    source: [{ file: 'demosMusicNet.ts', symbol: 'Clock' }, { file: 'demosMusicNet.ts', symbol: 'demoBeat' }],
  },

  // ───────────────────────── 효과음 (SFX) ─────────────────────────
  i141: {
    id: 'i141',
    summary: '배경음악과 같은 조의 1 · 3 · 5 · 8 음을 70ms 간격으로 차례로 울려, 정답 소리가 어느 곡 위에서도 늘 어울리게 한다.',
    terms: [
      { en: 'Arpeggio (major triad + octave)', ko: '화음을 한 음씩 차례로 — 도 미 솔 도' },
      { en: 'Key-matched SFX', ko: '배경음악과 같은 조로 맞춘 효과음' },
      { en: 'Semitone ratio 2^(n/12)', ko: '반음 n 개 위 = 진동수 × 2^(n/12)' },
      { en: 'Web Audio OscillatorNode (triangle)', ko: '세모파 발진기 — 부드럽고 맑은 소리' },
    ],
    goal: '{target}을(를) 정답 아르페지오로 만들어 줘 — 배경음악과 같은 조의 1-3-5-8 음을 60~80ms 간격으로. 느낌은 {style}.',
    targets: ['정답 · 성공 소리', '레벨 클리어 짧은 팡파르', '보물 상자 열기'],
    styles: ['맑은 실로폰 같은', '8비트 오락실', '부드러운 오르골'],
    platforms: ['webaudio', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 음 하나짜리 짧은 클립을 AudioSource.pitch = 2^(n/12) 로 바꿔 PlayScheduled 로 간격을 두고 튼다.',
      godot: 'Godot 은 AudioStreamPlayer.pitch_scale = pow(2, n/12.0) 로 같은 음 견본을 차례로 튼다.',
    },
    principle: [
      '장조 화음은 으뜸음에서 0 · 4 · 7 반음, 그리고 한 옥타브 위 12 반음 — 이 넷이 「도 미 솔 도」.',
      '으뜸음 = 523.25Hz(높은 도) × 2^(조/12). 배경음악이 라 장조면 조 = 9 를 넣으면 「라 도# 미 라」가 된다.',
      '음마다 세모파(0.42초 · 크기 0.22 · 3ms 어택)와 한 옥타브 위 사인(0.15초 · 0.05)을 겹쳐 맑게.',
      '간격 70ms — 너무 촘촘하면 한 덩어리 화음, 너무 넓으면 느린 가락처럼 들린다.',
    ],
    when: ['배경음악이 있는 게임의 정답 · 성공 소리', '같은 화면에서 조가 바뀌는 음악을 쓸 때 (조만 넘겨주면 됨)'],
    avoid: ['틀림 · 실패 소리 — 내려가는 음이나 낮은 「부부」 소리가 맞다', '음악이 없는 화면 — 조를 맞출 필요가 없으니 그냥 견본 소리로'],
    cost: 'light',
    costNote: '음 4개 × 발진기 2 = 8개를 0.5초 쓰고 버린다.',
    level: 1,
    must: [
      '배경음악의 조(으뜸음 반음 수)를 매개변수로 받는다 — 음악 쪽이 지금 조를 알려 주게',
      '간격 60 ~ 80ms (기본 70)',
      '음 높이는 반음 비 2^(n/12) 로만 계산 — Hz 를 손으로 적지 않는다',
      'AudioContext.currentTime 기준으로 네 음을 한 번에 예약',
    ],
    done: [
      '정답을 누르면 「도 미 솔 도」가 70ms 간격으로 올라간다',
      '조 손잡이를 바꾸면 같은 모양으로 다른 조에서 울리고, 그 조의 음악 위에서 어긋나지 않는다',
      '간격을 40 → 160ms 로 바꾸면 화음 → 가락처럼 들리는 차이가 난다',
    ],
    code: {
      lang: 'ts',
      title: '조 맞춤 1-3-5-8 아르페지오',
      from: 'demos/demosSfx.ts recArp · tone · envG 를 정리',
      body: `const st2 = (n: number) => Math.pow(2, n / 12);           // 반음 → 배수

function envG(c: BaseAudioContext, out: AudioNode, t0: number, a: number, hold: number, d: number, peak: number) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + Math.max(0.0005, a));
  g.gain.setValueAtTime(peak, t0 + a + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + hold + d);
  g.connect(out);
  return g;
}
function tone(c: BaseAudioContext, out: AudioNode, t0: number, f: number, d: number, peak: number, type: OscillatorType = 'sine', a = 0.003) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(Math.min(f, c.sampleRate * 0.45), t0);
  o.connect(envG(c, out, t0, a, 0, d, peak));
  o.start(t0);
  o.stop(t0 + a + d + 0.05);
}
/** key = 배경음악 조 (0 다장조 · 2 라장조 · 7 사장조 …), gap = ms */
function correctArp(c: BaseAudioContext, out: AudioNode, t0: number, key = 0, gap = 70) {
  const base = 523.25 * st2(key);                             // 높은 도에서 조만큼
  [0, 4, 7, 12].forEach((n, i) => {
    const t = t0 + (i * gap) / 1000;
    tone(c, out, t, base * st2(n), 0.42, 0.22, 'triangle', 0.003);
    tone(c, out, t, base * st2(n) * 2, 0.15, 0.05, 'sine', 0.002); // 옥타브 위 반짝임
  });
}`,
    },
    pitfalls: [
      { title: '정답 소리를 아무 음으로 만들면 배경음악과 부딪혀 「삑사리」처럼 들린다', fix: '음악의 조를 받아 그 조의 1 · 3 · 5 · 8 음으로 — 늘 화음 안의 음이라 안 부딪힌다.' },
      { title: '네 음을 setTimeout 으로 치면 간격이 들쭉날쭉하다', fix: 'AudioContext 시각으로 t0 + i × gap 에 한 번에 예약한다.' },
      { title: '높은 조에서 옥타브 위 사인이 너무 날카롭다', fix: '배음 사인은 크기 0.05 로 아주 작게, 표본률 절반 아래로 묶는다 (tone 의 min).' },
    ],
    prev: ['i143'],
    next: ['i147'],
    refs: [{ name: 'MDN — OscillatorNode', url: 'https://developer.mozilla.org/en-US/docs/Web/API/OscillatorNode' }],
    source: [{ file: 'demosSfx.ts', symbol: 'recArp' }, { file: 'demosSfx.ts', symbol: 'tone' }],
  },

  i143: {
    id: 'i143',
    summary: '0 ~ 100 같은 어떤 값이든 세 옥타브의 5음계 음 15개 중 하나로 맞춰 울려, 큰 수는 높은 음이 되고 아무렇게나 쳐도 음이 어긋나지 않는다.',
    terms: [
      { en: 'Pitch quantization (scale snapping)', ko: '음계 양자화 — 값을 가장 가까운 음계 음으로' },
      { en: 'Major pentatonic scale (0 2 4 7 9)', ko: '5음계 — 도 레 미 솔 라, 어떻게 섞어도 안 부딪힘' },
      { en: 'Sonification', ko: '값 · 자료를 소리로 들려주기' },
    ],
    goal: '{target}을(를) 소리로 들려줘 — 값을 5음계 음으로 맞춰서 큰 값은 높은 음, 어떤 순서로 쳐도 어울리게. 느낌은 {style}.',
    targets: ['블록 · 숫자를 누를 때마다 나는 음 (수의 크기 듣기)', '그래프 · 막대 값을 소리로', '높이 · 위치에 따라 바뀌는 소리'],
    styles: ['실로폰처럼 맑은', '8비트', '부드러운 오르골'],
    platforms: ['webaudio', 'unity', 'godot'],
    principle: [
      '값을 0 ~ 1 로 줄인 뒤 15칸(5음계 × 세 옥타브) 중 가장 가까운 칸으로 반올림한다: i = round(v/100 × 14).',
      '칸 번호 → 반음 = 12 × floor(i / 5) + [0, 2, 4, 7, 9][i % 5]. 진동수 = 261.63Hz(가운데 도) × 2^(반음/12).',
      '5음계에는 반음 차이 나는 음(미-파, 시-도)이 없어서 어떤 음끼리 겹쳐도 거칠게 부딪히지 않는다.',
      '맞추지 않고 값을 그대로 진동수로 바꾸면(261.63 × 2^(v/100 × 3)) 음계 사이 음이 나와 「틀린 음」처럼 들린다 — 견본의 끄기로 비교.',
    ],
    when: ['아이가 아무렇게나 눌러도 음악처럼 들려야 하는 장난감 · 블록 소리', '수의 크기 · 그래프 모양을 귀로 느끼게 할 때'],
    avoid: ['정확한 값 차이를 들려줘야 할 때 (51 과 52 의 차이) — 양자화하면 같은 음이 된다', '배경음악이 단조 · 다른 조일 때 — 그 조의 음계 표로 바꿔야 한다'],
    cost: 'light',
    costNote: '음 하나 = 발진기 1 + 게인 1.',
    level: 1,
    must: [
      '값 범위를 먼저 0 ~ 1 로 자르고(clamp) 칸으로 반올림',
      '음계 표는 배열 하나 (PENTA = [0, 2, 4, 7, 9]) — 음악 조가 바뀌면 기준음만 바꾼다',
      '짧은 소리(0.3초 · 어택 4ms)로 연달아 쳐도 뭉개지지 않게',
      '켬/끔 비교 단추로 양자화 효과를 들려준다',
    ],
    done: [
      '값 8개를 차례로 치면 막대가 높을수록 음이 높고, 가락처럼 어울린다',
      '「5음계로 맞추기」를 끄면 같은 값들이 어긋난 음으로 들린다',
      '0 ~ 100 손잡이를 끌면 계단처럼 15개 음 중 하나로 딱딱 맞춰진다',
    ],
    code: {
      lang: 'ts',
      title: '값 → 5음계 음',
      from: 'demos/demosSfx.ts pentaNote · recPenta 를 정리',
      body: `const PENTA = [0, 2, 4, 7, 9];                       // 도 레 미 솔 라
const st2 = (n: number) => Math.pow(2, n / 12);

/** 0~100 값 → 가운데 도에서 몇 반음 위인가 (세 옥타브 15칸) */
function pentaNote(v: number): number {
  const steps = 15;
  const i = Math.round(Math.max(0, Math.min(1, v / 100)) * (steps - 1));
  return 12 * Math.floor(i / 5) + PENTA[i % 5];
}
function playValue(c: AudioContext, out: AudioNode, t0: number, v: number, quant = true) {
  const f = quant ? 261.63 * st2(pentaNote(v))         // 음계 음으로 맞춤
                  : 261.63 * Math.pow(2, (v / 100) * 3); // 맞추지 않음 — 비교용
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(f, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.004 + 0.3);
  o.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + 0.36);
}
// 값 여러 개를 0.2초 간격으로: [12, 47, 33, 78, 91, 60, 25, 100].forEach((v, i) => playValue(c, out, t0 + i * 0.2, v));`,
    },
    pitfalls: [
      { title: '값을 진동수에 곧게 비례시키면(100Hz + v) 높은 쪽 차이가 안 들린다', fix: '귀는 비율로 듣는다 — 반음(2^(n/12)) 단위로 바꾼다.' },
      { title: '칠음계(도레미파솔라시) 전부를 쓰면 마구 칠 때 미-파 · 시-도가 부딪힌다', fix: '5음계는 반음 간격이 없어 어떤 조합도 거칠지 않다.' },
      { title: '값 범위 밖(−5, 130)이 들어오면 엉뚱하게 높거나 낮은 음이 난다', fix: '반올림 전에 0 ~ 1 로 자른다.' },
    ],
    prev: ['i499'],
    next: ['i141'],
    refs: [{ name: 'Wikipedia — Pentatonic scale', url: 'https://en.wikipedia.org/wiki/Pentatonic_scale' }],
    source: [{ file: 'demosSfx.ts', symbol: 'pentaNote' }, { file: 'demosSfx.ts', symbol: 'recPenta' }],
  },

  i145: {
    id: 'i145',
    summary: '대사 글자마다 짧은 톱니파 블립을 내되 글자 코드로 음 높이를 · 한글 모음으로 두 공명 필터를 바꿔, 녹음 없이 캐릭터가 「옹알옹알」 말하는 소리를 만든다.',
    terms: [
      { en: 'Gibberish voice / babble (Animal Crossing-like speech)', ko: '옹알이 목소리 — 글자마다 짧은 소리' },
      { en: 'Formant filter (F1 · F2 bandpass)', ko: '모음을 만드는 두 공명 — 대역 필터 둘' },
      { en: 'Hangul syllable decomposition', ko: '한글 글자 코드에서 모음 번호 꺼내기' },
      { en: 'Sawtooth source · pitch glide', ko: '톱니파 목소리 · 끝이 살짝 내려감' },
    ],
    goal: '{target}에 말소리 옹알이를 넣어 줘 — 대사 글자마다 짧은 소리를 내고, 글자 코드로 음 높이, 한글 모음으로 필터를 바꿔 말처럼 들리게. 목소리는 {style}.',
    targets: ['안내 캐릭터 대사 (선배 · 마스코트)', '이야기 장면 말풍선', 'NPC 짧은 인사'],
    styles: ['통통 튀는 귀여운 목소리', '낮고 느긋한 할아버지', '빠르고 높은 꼬마'],
    platforms: ['webaudio', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 짧은 블립 클립을 글자마다 PlayOneShot 하고 pitch 를 글자 코드로 바꾼다.',
      godot: 'Godot 은 AudioStreamPlayer 하나로 글자마다 pitch_scale 을 바꿔 짧게 튼다.',
    },
    principle: [
      '한글 글자 코드 c 에서 모음 번호 = floor(((c − 0xAC00) % 588) / 28) — 21개 모음(ㅏ ~ ㅣ).',
      '모음마다 두 공명 주파수(F1, F2)가 있다: ㅏ 800 · 1200, ㅣ 300 · 2300, ㅜ 350 · 800 … 톱니파를 이 두 대역 필터(Q 5 · 6)에 통과시키면 그 모음처럼 들린다.',
      '음 높이 = 목소리 Hz(기본 320) × (1 + ((c % 7) − 3) × 0.045) — 글자마다 조금씩 달라 말의 억양처럼. 끝은 0.92 배로 살짝 내려간다.',
      '한 글자 = 0.078초 ÷ 빠르기. 띄어쓰기는 0.6칸, 문장 부호는 2.2칸 쉰다.',
    ],
    when: ['대사가 많은 캐릭터에 목소리 느낌을 줄 때 (녹음 없이, 모든 언어)', '말풍선 글자가 하나씩 나타나는 연출과 함께'],
    avoid: ['글을 실제로 읽어 줘야 할 때 — 음성 합성(u78)', '긴 설명문 전체 — 금방 귀가 피곤하다, 첫 몇 글자 · 짧은 대사에만'],
    cost: 'light',
    costNote: '글자 하나 = 발진기 1 + 대역 필터 2 + 게인 2. 문장 하나 수십 개 — 가볍다.',
    level: 2,
    must: [
      '한글은 모음으로 필터, 한글이 아닌 글자는 소리 없이 쉬기만 (문장 부호 2.2칸)',
      '같은 글자는 늘 같은 음 높이 — 무작위가 아니라 글자 코드로',
      '목소리 높이 · 빠르기는 캐릭터마다 매개변수로',
      '말풍선 글자 나타남과 같은 간격(0.078초)으로 맞춘다',
    ],
    done: [
      '「안녕! 나는 선배 윤정확이야.」가 글자마다 옹알옹알 들리고, ㅏ · ㅣ · ㅜ 가 서로 다르게 들린다',
      '목소리 높이를 140Hz ↔ 600Hz 로 바꾸면 할아버지 ↔ 꼬마처럼 바뀐다',
      '말풍선 글자가 소리와 같은 속도로 나타난다',
    ],
    code: {
      lang: 'ts',
      title: '글자마다 모음 공명 블립',
      from: 'demos/demosSfx.ts VOWEL_F · babble 을 정리 (osc · envG · filt 는 견본 도우미)',
      body: `// 21 모음의 [F1, F2] — ㅏ ㅐ ㅑ ㅒ ㅓ ㅔ ㅕ ㅖ ㅗ ㅘ ㅙ ㅚ ㅛ ㅜ ㅝ ㅞ ㅟ ㅠ ㅡ ㅢ ㅣ
const VOWEL_F: [number, number][] = [[800, 1200], [700, 1700], [750, 1300], [700, 1750], [550, 1000], [500, 1800], [550, 1100],
  [500, 1800], [450, 850], [600, 1200], [600, 1600], [400, 1800], [450, 900], [350, 800], [500, 1000], [400, 1700],
  [350, 2000], [350, 850], [400, 1500], [350, 2000], [300, 2300]];

function babble(c: AudioContext, out: AudioNode, t0: number, text: string, voice = 320, speed = 1): number {
  const stepT = 0.078 / speed;
  let t = t0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const vi = Math.floor(((code - 0xac00) % 588) / 28);        // 모음 번호
      const [f1, f2] = VOWEL_F[vi] ?? [500, 1500];
      const f0 = voice * (1 + ((code % 7) - 3) * 0.045);           // 글자마다 억양
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.92, t + stepT * 0.9);
      const g = c.createGain();                                    // 6ms 어택 · 짧게 유지 · 감쇠
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.006);
      g.gain.setValueAtTime(0.5, t + 0.006 + stepT * 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.006 + stepT * 0.85);
      g.connect(out);
      const b1 = c.createBiquadFilter(), b2 = c.createBiquadFilter(), g2 = c.createGain();
      b1.type = b2.type = 'bandpass';
      b1.frequency.value = f1; b1.Q.value = 5;
      b2.frequency.value = f2; b2.Q.value = 6;
      g2.gain.value = 0.6;
      o.connect(b1).connect(g);
      o.connect(b2).connect(g2).connect(g);
      o.start(t); o.stop(t + stepT + 0.05);
      t += stepT;
    } else t += ch === ' ' ? stepT * 0.6 : stepT * 2.2;           // 띄어쓰기 · 문장 부호는 쉼
  }
  return t - t0;                                                   // 전체 길이 (말풍선 맞추기)
}`,
    },
    pitfalls: [
      { title: '글자마다 Math.random 음 높이를 쓰면 같은 대사가 매번 다르게 들려 어색하다', fix: '글자 코드(code % 7)로 정하면 같은 글자는 늘 같은 높이 — 말투처럼 들린다.' },
      { title: '사인파로 만들면 모음 차이가 안 들린다', fix: '배음이 많은 톱니파를 공명 필터에 통과시켜야 F1 · F2 가 살아난다.' },
      { title: '긴 설명을 모두 옹알이로 내면 금방 시끄럽다', fix: '짧은 대사 · 첫 문장에만, 소리 단추로 끌 수 있게.' },
    ],
    prev: ['i499'],
    next: ['u78'],
    refs: [{ name: 'Wikipedia — Formant', url: 'https://en.wikipedia.org/wiki/Formant' }],
    source: [{ file: 'demosSfx.ts', symbol: 'babble' }, { file: 'demosSfx.ts', symbol: 'VOWEL_F' }],
  },

  i147: {
    id: 'i147',
    summary: '자주 나는 소리를 변형 3개로 돌려 쓰고 매번 속도 1±0.05 · 크기 ±2dB 를 살짝 흔들어, 같은 「톡」이 기계처럼 똑같이 반복되지 않게 한다.',
    terms: [
      { en: 'Round-robin sample variation', ko: '라운드 로빈 — 변형 여러 개를 차례로 돌려 쓰기' },
      { en: 'Pitch / volume randomization', ko: '음 높이 · 크기를 조금씩 무작위로' },
      { en: 'Listener fatigue (machine-gun effect)', ko: '똑같은 소리 반복에서 오는 귀 피로' },
      { en: 'Decibel to gain 10^(dB/20)', ko: '데시벨 → 곱하는 배수' },
    ],
    goal: '{target}에 반복 피로 막기를 넣어 줘 — 변형 2~4개를 차례로 돌려 쓰고, 매번 속도 1±0.05 · 크기 ±2dB 를 조금씩 흔들어서. 느낌은 {style}.',
    targets: ['블록 놓기 · 단추 톡 소리', '발소리 · 공 튀는 소리', '연타하는 점수 소리'],
    styles: ['티 안 나게 자연스러운', '나무 블록 톡톡', '8비트 블립'],
    platforms: ['webaudio', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 AudioRandomContainer(2023.2+)나, 클립 배열을 돌리며 AudioSource.pitch · volume 을 Random.Range 로.',
      godot: 'Godot 은 AudioStreamRandomizer 에 변형을 넣고 random_pitch · random_volume_offset_db 를 정한다.',
    },
    principle: [
      '귀는 완전히 똑같은 소리가 반복되면 금방 「기계 같다」고 느낀다.',
      '변형 A · B · C 를 순서대로 돌려 쓴다 (견본: 820 · 960 · 740Hz, 필터 Q 6 · 7 · 5, 크기 1 · 0.95 · 1.05).',
      '그 위에 매번 속도(음 높이) = 1 + (난수 − 0.5) × 0.1 → ±5%, 크기 = 10^((난수 − 0.5) × 4 / 20) → ±2dB.',
      '흔들림은 작게 — 너무 크면 다른 소리처럼 들린다. 「같은 소리인데 손으로 친 것 같다」가 목표.',
    ],
    when: ['1초에 여러 번 나는 소리 (톡 · 발소리 · 블록)', '오래 하는 게임의 자주 나는 화면 소리'],
    avoid: ['정답 · 경고처럼 「늘 같아야 알아듣는」 신호음 — 흔들면 헷갈린다', '음악 음 — 음 높이를 흔들면 음정이 틀어진다'],
    cost: 'light',
    costNote: '난수 두 개와 배열 차례 하나 — 공짜.',
    level: 1,
    must: [
      '변형은 2 ~ 4개를 차례로 (무작위 고르기는 같은 것이 연달아 나올 수 있다)',
      '음 높이 흔들림 ±5% 안, 크기 ±2dB 안',
      '켬/끔 비교 단추로 차이를 들려준다',
      '신호음(정답 · 경고)에는 쓰지 않는다',
    ],
    done: [
      '「톡」 6번을 들으면 켬일 때 하나하나 조금씩 다르고, 끔일 때 기계처럼 똑같다',
      '변형 표시 A · B · C 가 차례로 밝아진다',
      '오래 눌러도 귀가 덜 피곤하다',
    ],
    code: {
      lang: 'ts',
      title: '변형 3개 돌려 쓰기 + 작은 흔들림',
      from: 'demos/demosSfx.ts VARS · recRobin 을 정리',
      body: `const VARS = [
  { f: 820, q: 6, b: 1 },
  { f: 960, q: 7, b: 0.95 },
  { f: 740, q: 5, b: 1.05 },
];
let turn = 0;

function tok(c: AudioContext, out: AudioNode, noiseBuf: AudioBuffer, t: number, vary = true) {
  const v = vary ? VARS[turn++ % VARS.length] : VARS[0];        // 차례로 돌려 쓰기
  const rate = vary ? 1 + (Math.random() - 0.5) * 0.1 : 1;       // 속도 ±5%
  const vol = vary ? Math.pow(10, ((Math.random() - 0.5) * 4) / 20) : 1; // 크기 ±2dB
  // 몸통: 짧게 내려가는 사인
  const o = c.createOscillator(), g = c.createGain();
  o.frequency.setValueAtTime(v.f * rate, t);
  o.frequency.exponentialRampToValueAtTime(v.f * rate * 0.8, t + 0.12);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.45 * vol * v.b, t + 0.001);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.121);
  o.connect(g).connect(out);
  o.start(t); o.stop(t + 0.2);
  // 딸깍: 대역 필터 지난 잡음 25ms
  const n = c.createBufferSource(), bp = c.createBiquadFilter(), ng = c.createGain();
  n.buffer = noiseBuf;
  bp.type = 'bandpass'; bp.frequency.value = v.f * 2.2 * rate; bp.Q.value = v.q;
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.7 * vol, t + 0.0008);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.026);
  n.connect(bp).connect(ng).connect(out);
  n.start(t, Math.random() * 1.5); n.stop(t + 0.08);             // 잡음도 매번 다른 자리부터
}`,
    },
    pitfalls: [
      { title: '변형을 무작위로 고르면 같은 것이 두세 번 연달아 나온다', fix: '차례로 돌리거나, 바로 앞 것만 빼고 고른다.' },
      { title: '흔들림을 ±20% 로 크게 하면 다른 소리처럼 들린다', fix: '속도 ±5% · 크기 ±2dB 정도가 「같은 소리 다른 손」 느낌.' },
      { title: '잡음 버퍼를 늘 처음부터 틀면 딸깍이 매번 똑같다', fix: '긴 잡음 버퍼(2초)를 만들어 두고 시작 자리를 무작위로 (start(t, offset)).' },
    ],
    prev: ['i499'],
    next: ['i148'],
    source: [{ file: 'demosSfx.ts', symbol: 'recRobin' }, { file: 'demosSfx.ts', symbol: 'VARS' }],
  },

  i148: {
    id: 'i148',
    summary: '효과음 하나를 짧은 잡음 타격 · 내려가는 몸통 · 잔향 꼬리 세 층으로 나눠 층마다 따로 사라지게 해서, 도장 「쾅」이 또렷하면서도 묵직하게 들린다.',
    terms: [
      { en: 'Layered sound design (transient + body + tail)', ko: '층 쌓기 — 타격 · 몸통 · 꼬리' },
      { en: 'Transient', ko: '맨 앞 아주 짧은 「딱」 — 또렷함을 만든다' },
      { en: 'Pitch drop (exponential sweep)', ko: '음 높이가 빠르게 떨어지는 몸통 — 무게감' },
      { en: 'Filtered noise tail', ko: '닫히는 저역 필터를 지난 잡음 꼬리 — 울림' },
    ],
    goal: '{target} 효과음을 세 층(짧은 잡음 타격 + 내려가는 몸통 + 잔향 꼬리)으로 합성해 줘 — 층마다 따로 감쇠하고 따로 끄고 켤 수 있게. 느낌은 {style}.',
    targets: ['도장 「쾅」', '블록 · 상자 놓기', '문 닫힘 · 큰 착지'],
    styles: ['묵직하고 또렷한', '가볍고 귀여운', '만화처럼 과장된'],
    platforms: ['webaudio', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 층마다 클립을 만들어 같은 dspTime 에 PlayScheduled 로 함께 튼다.',
      godot: 'Godot 은 층별 AudioStreamPlayer 를 같은 프레임에 play() 한다 (또는 미리 합친 파일로).',
    },
    principle: [
      '타격: 고역 통과(2000Hz) 잡음을 0.5ms 어택 · 18ms 감쇠로 — 귀가 「언제」를 알아듣는 딱 소리.',
      '몸통: 사인 190Hz → 58Hz 로 0.26초에 떨어지고(크기 0.85), 세모파 380 → 120Hz 를 0.12초 살짝 겹친다 — 「무게」.',
      '꼬리: 저역 필터가 1400 → 300Hz 로 0.9초에 닫히는 잡음, 30ms 어택 · 0.85초 감쇠 · 작게(0.22) — 방의 「울림」.',
      '층마다 길이 · 감쇠가 달라서 처음엔 또렷하고 끝은 부드럽게 사라진다. 층을 하나씩 끄면 각 층이 맡은 일이 들린다.',
    ],
    when: ['단순한 소리 하나로는 밋밋한 중요한 순간 (판정 도장 · 큰 착지)', '같은 틀로 크기 · 재질만 바꿔 여러 소리를 만들 때'],
    avoid: ['아주 자주 나는 작은 소리 — 타격 + 몸통 두 층이면 충분', '폰 스피커에서 몸통(58Hz)만 믿기 — 낮은 소리는 안 들린다, 타격 · 위쪽 배음을 꼭 함께'],
    cost: 'light',
    costNote: '층 셋 = 노드 10개 남짓, 1초 쓰고 버린다.',
    level: 2,
    must: [
      '층마다 따로 봉투(감쇠) — 한 봉투에 다 묶지 않는다',
      '가장 큰 순간(타격 · 몸통 시작)을 화면의 「쾅」 순간과 같은 시각에',
      '층마다 켬/끔 토글로 층의 역할을 들려준다',
      '잡음 버퍼는 한 번 만들어 돌려 쓴다',
    ],
    done: [
      '도장이 내려오는 순간 「딱 + 쿵 + 웅~」이 한 소리로 들린다',
      '타격만 끄면 뭉툭해지고, 몸통만 끄면 가벼워지고, 꼬리만 끄면 메마르게 들린다',
      '소리 그림 아래 세 줄에 층마다 다른 길이가 보인다',
    ],
    code: {
      lang: 'ts',
      title: '세 층 「쾅」',
      from: 'demos/demosSfx.ts layHit · layBody · layTail · recLayers 를 정리 (noise · osc · envG · filt 는 견본 도우미)',
      body: `// 도우미 (견본과 같음): noise(c, t0, dur) 잡음 소스 · osc(c, type, f, t0, dur) · envG(c, out, t0, 어택, 유지, 감쇠, 최고)
// filt(c, type, f, q?) 필터 · chain(a, b, c…) 차례로 잇기
function stamp(c: AudioContext, out: AudioNode, t0: number, on = { hit: true, body: true, tail: true }) {
  if (on.hit) {                                                    // 타격 — 또렷함
    chain(noise(c, t0, 0.03), filt(c, 'highpass', 2000), envG(c, out, t0, 0.0005, 0.002, 0.018, 0.9));
  }
  if (on.body) {                                                   // 몸통 — 무게
    const o = osc(c, 'sine', 190, t0, 0.32);
    o.frequency.exponentialRampToValueAtTime(58, t0 + 0.26);
    o.connect(envG(c, out, t0, 0.002, 0.02, 0.26, 0.85));
    const tr = osc(c, 'triangle', 380, t0, 0.15);
    tr.frequency.exponentialRampToValueAtTime(120, t0 + 0.12);
    tr.connect(envG(c, out, t0, 0.002, 0, 0.12, 0.25));
  }
  if (on.tail) {                                                   // 꼬리 — 울림
    const lp = filt(c, 'lowpass', 1400);
    lp.frequency.setValueAtTime(1400, t0);
    lp.frequency.exponentialRampToValueAtTime(300, t0 + 0.9);
    chain(noise(c, t0, 1), lp, envG(c, out, t0 + 0.01, 0.03, 0, 0.85, 0.22));
  }
}`,
    },
    pitfalls: [
      { title: '한 봉투로 세 층을 함께 줄이면 꼬리가 타격과 같이 잘린다', fix: '층마다 따로 envG — 타격 18ms, 몸통 0.26초, 꼬리 0.85초.' },
      { title: '폰 스피커에서는 「쿵」이 거의 안 들린다', fix: '58Hz 몸통은 작은 스피커가 못 낸다. 타격 · 세모파(380Hz) 층이 그 몫을 한다 — 빼지 않는다.' },
      { title: '소리의 최고점이 화면 「쾅」보다 늦으면 굼떠 보인다', fix: '타격 층 어택을 0.5ms 로 두고, 도장이 닿는 프레임에 t0 를 맞춘다. 들어 보고 맞출 것.', seen: true },
    ],
    prev: ['i499'],
    next: ['i159'],
    source: [{ file: 'demosSfx.ts', symbol: 'recLayers' }, { file: 'demosSfx.ts', symbol: 'layHit' }, { file: 'demosSfx.ts', symbol: 'layBody' }, { file: 'demosSfx.ts', symbol: 'layTail' }],
  },

  i156: {
    id: 'i156',
    summary: '엔진 회전수에서 기본 음(rpm/60 × 실린더 수 ÷ 2)을 계산해 톱니 · 네모 · 사인 배음과 잡음을 필터로 섞고, 속도가 오르면 음 높이와 밝기가 함께 올라가게 한다.',
    terms: [
      { en: 'Procedural engine sound (RPM-driven synthesis)', ko: '회전수로 만드는 엔진 소리' },
      { en: 'Firing frequency = rpm/60 × cylinders/2', ko: '4행정 엔진 폭발 횟수 = 기본 음' },
      { en: 'Amplitude modulation · waveshaper', ko: '크기 떨림(부르릉) · 찌그러뜨려 거칠게' },
      { en: 'AudioParam.setTargetAtTime', ko: '값을 부드럽게 따라가게 — 속도 바뀜' },
    ],
    goal: '{target}에 속도에 따라 바뀌는 엔진 소리를 합성해 줘 — 회전수에서 기본 음을 계산하고 배음 · 잡음 · 필터를 섞어, 빨라지면 높고 밝아지게. 느낌은 {style}.',
    targets: ['주차장 탈출 장난감 차', '경주 게임 자동차', '배 · 오토바이'],
    styles: ['귀여운 장난감 차 부릉부릉', '묵직한 트럭', '앵앵거리는 오토바이'],
    platforms: ['webaudio', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 OnAudioFilterRead 로 직접 합성하거나, 엔진 녹음을 AudioSource.pitch 로 회전수에 맞춰 올린다.',
      godot: 'Godot 은 AudioStreamGenerator 로 합성하거나, 엔진 소리 반복 파일의 pitch_scale 을 회전수에 맞춘다.',
    },
    principle: [
      '회전수 rpm = 850(공회전) + 속도(km/h) × 50. 4기통 4행정은 두 바퀴에 한 번씩 실린더마다 터지므로 기본 음 f0 = rpm/60 × 4/2.',
      '소리 재료: 톱니파 f0 · 네모파 f0/2(0.5) · 사인 2f0(0.3) · 대역 필터(3f0) 지난 잡음(0.6).',
      '모두 저역 필터(300 + rpm × 0.35 Hz, Q 2)를 지나 웨이브셰이퍼(k = 3)로 살짝 찌그러뜨린 뒤, f0/2 사인으로 크기를 0.6 ± 0.4 떨게 해 「부르릉」 결을 만든다.',
      '속도가 바뀌면 모든 진동수 · 필터를 setTargetAtTime(값, 지금, 0.08 ~ 0.12) 로 함께 따라가게 — 음 높이와 밝기가 같이 오른다.',
    ],
    when: ['속도가 계속 바뀌는 탈것 소리', '파일 없이 장난감 차 · 배 소리를 낼 때'],
    avoid: ['진짜 자동차처럼 실감 나야 할 때 — 회전수별 녹음을 섞는 방식이 낫다', '차가 수십 대 동시에 — 가까운 몇 대만 소리를 낸다'],
    cost: 'light',
    costNote: '엔진 하나 = 발진기 4 + 잡음 1 + 필터 2 + 셰이퍼 1, 켜져 있는 동안 계속. 동시에 서너 대는 가볍다.',
    level: 2,
    must: [
      '속도 → 회전수 → 기본 음을 한 함수로 — 진동수를 손으로 따로따로 바꾸지 않는다',
      '모든 값 바뀜은 setTargetAtTime 으로 (속도 손잡이를 빨리 돌려도 딸깍 없이)',
      '시동 켜기 · 끄기는 크기를 0.15초 정도로 서서히 — 뚝 끊지 않는다',
      '끌 때 발진기 · 잡음 소스를 모두 stop()',
    ],
    done: [
      '시동을 켜면 낮은 공회전 소리(약 57Hz)가 부르릉 떨며 난다',
      '속도를 0 → 100km/h 로 올리면 음 높이와 밝기가 함께 매끄럽게 올라간다 (약 220Hz)',
      '미리 보기에서 0 → 100 → 0 km/h 로 가속 · 감속하는 소리가 들린다',
    ],
    code: {
      lang: 'ts',
      title: '회전수로 움직이는 엔진',
      from: 'demos/demosSfx.ts rpmOf · engine 을 정리 (osc · noise · filt · gainN · shaper · chain 은 견본 도우미)',
      body: `const rpmOf = (speed: number) => 850 + speed * 50;      // km/h → rpm

function engine(c: AudioContext, out: AudioNode, t0: number) {
  const cyl = 4;
  const saw = osc(c, 'sawtooth', 30, t0, 0);
  const sub = osc(c, 'square', 15, t0, 0);
  const hi = osc(c, 'sine', 60, t0, 0);
  const am = osc(c, 'sine', 30, t0, 0);                     // 크기 떨림 (부르릉)
  const n = noise(c, t0, 0);
  const lp = filt(c, 'lowpass', 500, 2);
  const bp = filt(c, 'bandpass', 120, 2);
  const amG = gainN(c, 0.6), amD = gainN(c, 0.4);
  chain(am, amD);
  amD.connect(amG.gain);                                    // 0.6 ± 0.4
  saw.connect(lp);
  chain(sub, gainN(c, 0.5), lp);
  chain(hi, gainN(c, 0.3), lp);
  chain(n, bp, gainN(c, 0.6), lp);
  chain(lp, shaper(c, 3), amG, gainN(c, 0.5), out);         // 살짝 찌그러뜨려 거칠게
  const set = (speed: number, t: number, tc = 0.08) => {
    const f0 = (rpmOf(speed) / 60) * (cyl / 2);             // 4행정: 두 바퀴에 한 번씩 폭발
    saw.frequency.setTargetAtTime(f0, t, tc);
    sub.frequency.setTargetAtTime(f0 / 2, t, tc);
    hi.frequency.setTargetAtTime(f0 * 2, t, tc);
    am.frequency.setTargetAtTime(f0 / 2, t, tc);
    bp.frequency.setTargetAtTime(f0 * 3, t, tc);
    lp.frequency.setTargetAtTime(300 + rpmOf(speed) * 0.35, t, tc); // 빠를수록 밝게
  };
  set(0, t0, 0.001);
  return { set, srcs: [saw, sub, hi, am, n] };              // 끌 때 srcs 모두 stop()
}`,
    },
    pitfalls: [
      { title: '기본 음을 rpm/60 × 실린더 수로 두면 한 옥타브 높게 앵앵거린다', fix: '4행정 엔진은 두 바퀴에 한 번 터진다 — × 실린더 ÷ 2.' },
      { title: '속도를 바꿀 때 .value 로 바로 넣으면 딸깍딸깍 계단 소리가 난다', fix: 'setTargetAtTime(값, 지금, 0.08 ~ 0.12) 으로 따라가게.' },
      { title: '사인 · 톱니만으로는 전자음처럼 들린다', fix: '대역 필터 지난 잡음 + 웨이브셰이퍼 + 크기 떨림이 「기계」 결을 만든다.' },
      { title: '시동을 끄면 뚝 끊긴다', fix: '앞에 둔 크기 게인을 setTargetAtTime(0, 지금, 0.15) 으로 줄인 뒤 stop.' },
    ],
    prev: ['i499'],
    next: ['i157'],
    source: [{ file: 'demosSfx.ts', symbol: 'engine' }, { file: 'demosSfx.ts', symbol: 'rpmOf' }],
  },

  i157: {
    id: 'i157',
    summary: '지나가는 차의 거리 · 다가오는 속도를 미리 곡선으로 계산해 음 높이(f × c/(c + v)) · 크기 · 좌우를 함께 바꿔, 다가올 땐 높고 지나가면 낮아지는 「니이이용」을 만든다.',
    terms: [
      { en: 'Doppler effect', ko: '도플러 효과 — 다가오면 높게, 멀어지면 낮게' },
      { en: 'Radial velocity', ko: '듣는 사람 쪽으로 다가오는(멀어지는) 빠르기' },
      { en: 'AudioParam.setValueCurveAtTime', ko: '미리 계산한 값 배열을 시간에 맞춰 재생' },
      { en: 'StereoPannerNode · distance attenuation', ko: '좌우 이동 · 멀수록 작게' },
    ],
    goal: '{target}에 도플러 효과를 넣어 줘 — 거리와 다가오는 속도로 음 높이 · 크기 · 좌우를 곡선으로 계산해서. 느낌은 {style}.',
    targets: ['지나가는 차 「니이이용」', '휙 날아가는 공 · 화살', '스쳐 가는 경주차'],
    styles: ['만화처럼 과장된', '실제처럼 자연스러운', '장난감 차'],
    platforms: ['webaudio', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 3D AudioSource 의 Doppler Level 값과 물체 속도로 저절로 계산된다.',
      godot: 'Godot 은 AudioStreamPlayer3D.doppler_tracking 을 켜고 카메라에도 doppler_tracking 을 켠다.',
    },
    principle: [
      '차는 x = −L + v·t 로 지나가고, 듣는 사람은 길에서 6m 떨어져 있다. 거리 r = √(x² + 6²).',
      '멀어지는 속도 vr = v · x / r (다가오면 음수). 들리는 음 = 300Hz × 343 / (343 + vr) — 343 은 소리 빠르기(m/s).',
      '크기 = 0.9 / (1 + r/6), 좌우 = x / r (−1 왼쪽 ~ 1 오른쪽).',
      '2.6초를 128점으로 미리 계산해 setValueCurveAtTime 으로 진동수 · 크기 · 좌우에 한꺼번에 건다 — 셋이 정확히 같이 움직인다.',
      '소리 재료는 톱니 + 반 높이 네모(0.4) → 1800Hz 저역 필터 — 엔진처럼 웅웅.',
    ],
    when: ['빠르게 스쳐 가는 물체가 있는 연출', '「소리의 빠르기 · 진동수」 과학 체험'],
    avoid: ['느린 물체 — 음 변화가 너무 작아 안 들린다 (몇 m/s 는 의미 없음)', '3D 엔진의 위치 소리를 이미 쓰고 있을 때 — 엔진의 도플러 설정을 켠다'],
    cost: 'light',
    costNote: '128점 배열 셋을 한 번 계산하고 노드 몇 개 — 가볍다.',
    level: 2,
    must: [
      '진동수 · 크기 · 좌우를 같은 위치 계산에서 함께 — 따로 계산하면 어긋난다',
      '곡선은 setValueCurveAtTime 으로 (매 프레임 바꾸지 않는다)',
      '소리 빠르기 343m/s, 듣는 사람과 길 사이 거리(6m)를 매개변수로',
      '속도 손잡이 범위는 8 ~ 80m/s — 느리면 차이가 안 들린다',
    ],
    done: [
      '차가 왼쪽에서 다가올 때 높고 크다가, 앞을 지나는 순간 음이 뚝 떨어지며 오른쪽으로 사라진다',
      '속도를 80m/s 로 올리면 음 떨어짐이 더 크고 빠르다',
      '이어폰으로 들으면 왼쪽 → 오른쪽으로 옮겨 간다',
    ],
    code: {
      lang: 'ts',
      title: '도플러 곡선 미리 계산 + 한꺼번에 걸기',
      from: 'demos/demosSfx.ts recDoppler 를 정리',
      body: `function passBy(c: AudioContext, out: AudioNode, t0: number, speed = 40) {
  const D = 2.6, N = 128, L = (speed * D) / 2;            // 2.6초 동안 −L → +L
  const fq = new Float32Array(N), gv = new Float32Array(N), pv = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const tt = (i / (N - 1)) * D;
    const x = -L + speed * tt;
    const r = Math.hypot(x, 6);                           // 길에서 6m 떨어져 듣는다
    const vr = (speed * x) / r;                           // + = 멀어짐
    fq[i] = 300 * (343 / (343 + vr));                     // 도플러
    gv[i] = 0.9 / (1 + r / 6);                            // 멀수록 작게
    pv[i] = Math.max(-1, Math.min(1, x / r));             // 왼쪽 → 오른쪽
  }
  const o = c.createOscillator(), o2 = c.createOscillator();
  o.type = 'sawtooth'; o2.type = 'square';
  o.frequency.setValueCurveAtTime(fq, t0, D);
  o2.frequency.setValueCurveAtTime(fq.map((f) => f / 2), t0, D);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.setValueCurveAtTime(gv, t0, D);
  const pn = c.createStereoPanner();
  pn.pan.setValueCurveAtTime(pv, t0, D);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 1800; lp.Q.value = 1;
  const g2 = c.createGain();
  g2.gain.value = 0.4;
  o.connect(lp); o2.connect(g2).connect(lp);
  lp.connect(g).connect(pn).connect(out);
  o.start(t0); o2.start(t0);
  o.stop(t0 + D + 0.05); o2.stop(t0 + D + 0.05);
}`,
    },
    pitfalls: [
      { title: '음 높이만 바꾸고 크기 · 좌우를 그대로 두면 「지나간다」는 느낌이 안 난다', fix: '세 값을 같은 위치 계산에서 함께 — 지나가는 순간 크기가 가장 크고 좌우가 가운데.' },
      { title: '곡선을 건 AudioParam 에 또 setValueAtTime 을 겹치면 오류가 난다', fix: 'setValueCurveAtTime 구간과 겹치는 다른 예약은 허용되지 않는다. 곡선 시작 전에만 값을 둔다.' },
      { title: '부호를 거꾸로 쓰면 다가올 때 낮아진다', fix: 'vr 은 멀어질 때 + — 343 / (343 + vr) 이 1 보다 작아져 낮아지는 쪽이 맞는지 들어서 확인.' },
    ],
    prev: ['i31', 'i156'],
    next: ['i158'],
    refs: [
      { name: 'Wikipedia — Doppler effect', url: 'https://en.wikipedia.org/wiki/Doppler_effect' },
      { name: 'MDN — AudioParam.setValueCurveAtTime()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/setValueCurveAtTime' },
    ],
    source: [{ file: 'demosSfx.ts', symbol: 'recDoppler' }],
  },

  i158: {
    id: 'i158',
    summary: '벽 뒤에 있는 소리를 저역 필터에 통과시켜 고음을 자르고 크기를 줄여, 같은 가락이 벽 너머에서 먹먹하게 들리게 한다.',
    terms: [
      { en: 'Sound occlusion (low-pass filtering)', ko: '가림 — 벽 뒤 소리는 고음이 먼저 사라짐' },
      { en: 'BiquadFilterNode lowpass', ko: '저역 통과 필터 — 높은 소리 자르기' },
      { en: 'Occlusion amount (wall thickness)', ko: '벽 두께 = 자르는 정도 · 줄이는 정도' },
    ],
    goal: '{target}에 가림 효과를 넣어 줘 — 벽 뒤 소리는 저역 필터로 고음을 자르고 작게, 벽 두께로 정도를 조절하게. 느낌은 {style}.',
    targets: ['벽 · 문 너머에서 나는 소리', '용의 동굴 안 · 상자 속 소리', '물속에 들어갔을 때'],
    styles: ['자연스러운 먹먹함', '만화처럼 확실하게', '아주 살짝'],
    platforms: ['webaudio', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 AudioLowPassFilter 를 AudioSource 에 달고, 사이에 벽이 있는지 Physics.Linecast 로 보고 cutoffFrequency 를 바꾼다.',
      godot: 'Godot 은 AudioStreamPlayer3D 의 attenuation_filter_cutoff_hz 를 바꾸거나 버스에 AudioEffectLowPassFilter 를 건다.',
    },
    principle: [
      '벽은 높은 소리를 더 많이 막는다 — 그래서 벽 뒤 소리는 「먹먹하고 작다」.',
      '소리를 저역 필터(Q 0.8)에 통과시키고, 차단 진동수 = 1500Hz(얇은 벽) ~ 350Hz(두꺼운 벽) 를 두께로 섞는다.',
      '크기도 함께 0.7(얇은) ~ 0.4(두꺼운) 배로 줄인다.',
      '벽이 없으면 필터 없이 바로 보낸다 — 「벽 없이 → 벽 뒤」를 이어 들려주면 차이가 확실하다.',
    ],
    when: ['보이지 않는 곳의 소리 (옆방 · 동굴 안 · 상자 속)', '물속 · 이불 속처럼 「막힌」 느낌'],
    avoid: ['멀리 있는 소리 — 멀리는 작아지기만 하고 먹먹함은 덜하다, 거리 감쇠 쪽', '방 울림이 필요할 때 — 잔향(i159)'],
    cost: 'light',
    costNote: '필터 1 + 게인 1.',
    level: 1,
    must: [
      '가림은 필터 + 크기 둘 다 — 필터만 쓰면 너무 크게 들린다',
      '벽 두께 0 ~ 1 을 차단 진동수 1500 → 350Hz, 크기 0.7 → 0.4 로 섞는다',
      '가림이 켜지고 꺼질 때는 차단 진동수를 setTargetAtTime 으로 미끄러지게 (문이 열리는 순간 등)',
      '고음이 있는 소리(톱니 가락 + 찰랑)로 시험해야 차이가 들린다',
    ],
    done: [
      '「벽 없이 → 벽 뒤 비교」를 누르면 같은 가락이 처음엔 또렷하다가 두 번째엔 먹먹하고 작게 들린다',
      '벽 두께를 올리면 더 먹먹해진다',
      '소리 그림(스펙트로그램)에서 벽 뒤일 때 위쪽(고음)이 어두워진다',
    ],
    code: {
      lang: 'ts',
      title: '벽 두께만큼 먹먹하게',
      from: 'demos/demosSfx.ts wallNode · recOcclude 를 정리',
      body: `const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** 벽 뒤 소리는 이 노드에 이어 보낸다. thick: 0 얇은 벽 ~ 1 두꺼운 벽 */
function wallNode(c: AudioContext, out: AudioNode, wall: boolean, thick: number): AudioNode {
  if (!wall) return out;                                   // 벽 없으면 바로
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = lerp(1500, 350, thick);             // 고음 자르기
  lp.Q.value = 0.8;
  const g = c.createGain();
  g.gain.value = lerp(0.7, 0.4, thick);                    // 크기도 줄이기
  lp.connect(g).connect(out);
  return lp;
}
// 쓰기: 가락(톱니 + 찰랑)을 wallNode 로 보낸다
// const dest = wallNode(ctx, ctx.destination, behindWall, 0.5);
// phrase(ctx, dest, ctx.currentTime + 0.05);
// 문이 열리면: lp.frequency.setTargetAtTime(18000, ctx.currentTime, 0.1) 로 미끄러지게`,
    },
    pitfalls: [
      { title: '사인 같은 둥근 소리로 시험하면 가림 차이가 안 들린다', fix: '자를 고음이 없어서다. 톱니 · 잡음 섞인 소리로 시험한다.' },
      { title: '벽 뒤로 갈 때 필터를 뚝 바꾸면 딸깍 소리가 난다', fix: '차단 진동수 · 크기를 setTargetAtTime 으로 0.1초쯤 미끄러지게.' },
      { title: '필터만 걸고 크기를 안 줄이면 벽 뒤인데 너무 가깝게 들린다', fix: '두께에 따라 크기도 0.7 ~ 0.4 배로.' },
    ],
    prev: ['i31'],
    next: ['i159'],
    refs: [{ name: 'MDN — BiquadFilterNode', url: 'https://developer.mozilla.org/en-US/docs/Web/API/BiquadFilterNode' }],
    source: [{ file: 'demosSfx.ts', symbol: 'wallNode' }, { file: 'demosSfx.ts', symbol: 'recOcclude' }],
  },

  i159: {
    id: 'i159',
    summary: '지수로 사라지며 점점 먹먹해지는 잡음을 코드로 만들어 ConvolverNode 의 울림으로 쓰고, 꼬리 길이(방 크기)와 섞는 양으로 작은 방 ~ 큰 동굴 느낌을 낸다.',
    terms: [
      { en: 'Convolution reverb — ConvolverNode', ko: '울림(임펄스 응답)을 소리에 덧씌우는 잔향' },
      { en: 'Synthetic impulse response (exponential decay noise)', ko: '코드로 만든 울림 — 지수로 사라지는 잡음' },
      { en: 'Dry / wet mix', ko: '원래 소리 · 울린 소리 섞는 비율' },
      { en: 'RT60 (reverb time)', ko: '잔향 시간 — 울림이 사라지는 길이' },
    ],
    goal: '{target}에 방 크기 잔향을 넣어 줘 — 지수로 사라지는 잡음으로 울림을 코드로 만들어 ConvolverNode 에 쓰고, 방 크기 = 꼬리 길이, 섞는 양을 조절하게. 분위기는 {style}.',
    targets: ['동굴 · 보물 방', '천문대 · 큰 강당', '교실 · 작은 방'],
    styles: ['깊고 신비한 동굴', '살짝 울리는 방', '성당처럼 길게'],
    platforms: ['webaudio', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Audio Reverb Zone 이나 AudioMixer 의 SFX Reverb 효과(Decay Time · Room) 로.',
      godot: 'Godot 은 버스에 AudioEffectReverb 를 걸고 room_size · damping · wet 을 바꾼다.',
    },
    principle: [
      '방에서 손뼉을 치면 「쾅 … 웅 …」 울림이 남는다. 그 울림 모양(임펄스 응답)을 소리에 덧씌우는 것이 컨볼루션 잔향이다.',
      '울림을 녹음하지 않고 코드로 만든다: 길이 = 방 크기(0.2 ~ 4초), 스테레오 두 채널에 따로 만든 잡음.',
      '잡음을 한 극 저역 필터에 통과시키되 뒤로 갈수록 더 먹먹하게(k = 0.15 + 0.8x), 크기는 (1 − x)^2.2 × e^(−3x) 로 사라지게 — 진짜 방처럼 고음이 먼저 사라진다.',
      '원래 소리(마른 소리 0.8)와 ConvolverNode 를 지난 소리(젖은 소리 = 섞는 양 × 1.2)를 함께 내보낸다.',
    ],
    when: ['장소 분위기 (동굴 · 강당 · 작은 방)를 한 번에 바꿀 때', '마른 합성 효과음에 공간감을 줄 때'],
    avoid: ['모든 소리마다 컨볼버를 새로 만들기 — 장소마다 하나 만들어 여러 소리가 함께 쓴다', '또렷해야 하는 안내 말소리 — 잔향을 아주 적게'],
    cost: 'medium',
    costNote: '컨볼루션은 울림 길이에 비례해 무겁다 — 4초 스테레오 = 약 38만 표본. 장소마다 하나만 두고 공유하면 폰도 괜찮다.',
    level: 2,
    must: [
      '울림 버퍼는 장소 · 크기마다 한 번만 만들고 돌려 쓴다 (소리마다 만들지 않는다)',
      '두 채널을 다른 시드 잡음으로 — 같으면 넓이감이 없다',
      '뒤로 갈수록 먹먹하게 (고음 먼저 사라짐) — 그냥 지수 감쇠 잡음은 쇳소리처럼 들린다',
      '마른 소리 · 젖은 소리 둘 다 출력으로 — 섞는 양 손잡이',
    ],
    done: [
      '「쿵」 소리 뒤에 방 크기만큼 울림 꼬리가 남는다',
      '방 크기를 0.2 → 4초로 바꾸면 작은 방 → 큰 동굴처럼 들린다',
      '섞는 양 0 이면 마른 소리, 1 이면 멀리서 울리는 소리',
    ],
    code: {
      lang: 'ts',
      title: '코드로 만든 울림 + ConvolverNode',
      from: 'demos/demosSfx.ts makeIR · recReverb 를 정리',
      body: `function rng(seed: number) {                              // 시드 난수 (견본과 같은 꼴)
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** 길이 sec 초 울림 — 지수로 사라지고 뒤로 갈수록 먹먹해지는 잡음 */
function makeIR(c: BaseAudioContext, sec: number, seed = 3): AudioBuffer {
  const len = Math.max(1, Math.floor(c.sampleRate * sec));
  const b = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch), r = rng(seed + ch * 17); // 채널마다 다른 잡음
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const x = i / len;
      const k = 0.15 + 0.8 * x;                            // 뒤로 갈수록 고역이 먼저 사라짐
      lp = lp + (1 - k) * ((r() * 2 - 1) - lp);
      d[i] = lp * Math.pow(1 - x, 2.2) * Math.exp(-x * 3);
    }
  }
  return b;
}
/** 장소마다 하나: 소리는 dry 와 cv 둘 다에 잇는다 */
function room(c: AudioContext, out: AudioNode, size = 1.6, wet = 0.6) {
  const cv = c.createConvolver();
  cv.buffer = makeIR(c, size);
  const wg = c.createGain(); wg.gain.value = wet * 1.2;
  const dry = c.createGain(); dry.gain.value = 0.8;
  cv.connect(wg).connect(out);
  dry.connect(out);
  return { dry, cv };                                       // 예: env.connect(dry); env.connect(cv);
}`,
    },
    pitfalls: [
      { title: '그냥 지수 감쇠 백색 잡음으로 울림을 만들면 쇳소리 · 바람 소리처럼 들린다', fix: '진짜 방은 고음이 먼저 사라진다. 뒤로 갈수록 저역 필터를 세게 (k = 0.15 + 0.8x).' },
      { title: '효과음마다 ConvolverNode 와 울림을 새로 만들면 폰에서 버벅인다', fix: '울림 버퍼 계산 · 컨볼루션 모두 무겁다. 장소마다 하나 만들어 두고 모든 소리가 그리로 보낸다.' },
      { title: 'ConvolverNode 의 기본 normalize 때문에 크기가 예상과 다르다', fix: '기본값 true 는 울림 크기를 자동으로 맞춘다. 섞는 양은 젖은 쪽 게인으로 조절한다.' },
    ],
    prev: ['i158'],
    next: ['i160'],
    refs: [{ name: 'MDN — ConvolverNode', url: 'https://developer.mozilla.org/en-US/docs/Web/API/ConvolverNode' }],
    source: [{ file: 'demosSfx.ts', symbol: 'makeIR' }, { file: 'demosSfx.ts', symbol: 'recReverb' }],
  },

  i160: {
    id: 'i160',
    summary: '소리를 DelayNode 로 늦춰 되먹임(0.6 아래)으로 돌리고 고리 안에 저역 필터를 넣어, 「야호~」 메아리가 점점 작고 먹먹하게 되돌아오게 한다.',
    terms: [
      { en: 'Feedback delay (echo) — DelayNode', ko: '되먹임 딜레이 — 늦춘 소리를 다시 늦추기' },
      { en: 'Feedback gain < 1', ko: '돌 때마다 줄어드는 비율 — 1 이상이면 끝없이 커짐' },
      { en: 'Damping filter in the loop', ko: '고리 안 저역 필터 — 돌 때마다 먹먹하게' },
      { en: 'Formant vowel glide', ko: '모음 공명이 「아 → 오」로 미끄러짐' },
    ],
    goal: '{target}에 메아리를 넣어 줘 — DelayNode 와 되먹임(0.6 넘지 않게), 고리 안에 저역 필터를 넣어 메아리가 점점 작고 먹먹하게. 느낌은 {style}.',
    targets: ['강 골짜기 「야호~」 메아리 놀이', '동굴 안 외침', '우주 · 꿈 장면 소리'],
    styles: ['넓은 산골짜기', '좁은 동굴', '아득한 꿈속'],
    platforms: ['webaudio', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 AudioEchoFilter(delay · decayRatio · wetMix) 를 붙이거나 AudioMixer 의 Echo 효과.',
      godot: 'Godot 은 버스에 AudioEffectDelay 를 걸고 feedback_active · feedback_delay_ms · feedback_level_db 를 정한다.',
    },
    principle: [
      '메아리 = 같은 소리가 조금 늦게(0.32초) 다시 들리는 것. DelayNode 로 늦춘다.',
      '늦춘 소리를 다시 딜레이 입구로 돌려보내면(되먹임) 메아리가 여러 번 온다. 돌 때마다 되먹임 배수(0.5)만큼 작아진다.',
      '되먹임은 반드시 1 보다 작게 — 견본은 0.6 으로 막는다. 1 이상이면 소리가 끝없이 커진다.',
      '고리 안에 2200Hz 저역 필터를 두면 돌 때마다 고음이 깎여 먼 메아리일수록 먹먹하다 — 진짜 골짜기처럼.',
      '「야호」 목소리: 톱니파 280 → 420 → 330Hz, 두 공명 필터가 800 → 480 · 1250 → 850 Hz 로 미끄러져 「아 → 오」.',
    ],
    when: ['골짜기 · 동굴 같은 넓은 장소 연출', '말소리 놀이 (메아리 따라 하기)'],
    avoid: ['방 울림처럼 「뭉친」 공간감 — 잔향(i159)이 맞다', '빠른 효과음이 계속 나는 곳 — 메아리가 겹겹이 쌓여 지저분해진다'],
    cost: 'light',
    costNote: '딜레이 1 + 필터 1 + 게인 1. 아주 가볍다.',
    level: 1,
    must: [
      '되먹임 게인은 Math.min(0.6, 값) 처럼 반드시 위를 막는다',
      '고리 = 딜레이 → 저역 필터 → 되먹임 게인 → 딜레이, 출력은 필터 뒤에서',
      'createDelay(최대 길이) 의 최대 길이를 손잡이 최대(0.7초)보다 크게',
      '원래 목소리도 출력에 바로 — 메아리만 나오면 이상하다',
    ],
    done: [
      '「야호~」 뒤로 0.32초 간격 메아리가 여러 번, 점점 작고 먹먹하게 돌아온다',
      '간격 손잡이로 골짜기 넓이(0.1 ~ 0.7초)가 바뀐다',
      '되먹임을 0.6 까지 올려도 소리가 끝없이 커지지 않는다',
    ],
    code: {
      lang: 'ts',
      title: '되먹임 딜레이 + 고리 안 저역 필터',
      from: 'demos/demosSfx.ts recEcho 의 메아리 부분을 정리',
      body: `/** voice 에 이어 둔 소리를 메아리로 — time 간격(초), fb 되먹임 */
function echo(c: AudioContext, voice: AudioNode, out: AudioNode, time = 0.32, fb = 0.5) {
  const dl = c.createDelay(2);                       // 최대 2초
  dl.delayTime.value = time;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2200;                         // 돌 때마다 먹먹하게
  const fg = c.createGain();
  fg.gain.value = Math.min(0.6, fb);                 // 1 이상이면 끝없이 커진다 — 꼭 막기
  voice.connect(dl);
  dl.connect(lp);
  lp.connect(fg);
  fg.connect(dl);                                    // 고리
  lp.connect(out);                                   // 메아리 출력
}
// 「야호~」 목소리: 톱니 280 → 420 → 330Hz + 공명 800 → 480 · 1250 → 850 (아 → 오)
// const o = ctx.createOscillator(); o.type = 'sawtooth';
// o.frequency.setValueAtTime(280, t0); o.frequency.linearRampToValueAtTime(420, t0 + 0.2); o.frequency.linearRampToValueAtTime(330, t0 + 0.6);
// voice(봉투 GainNode) 를 out 에도 바로 잇고, echo(ctx, voice, out) 로 메아리를 덧붙인다`,
    },
    pitfalls: [
      { title: '되먹임을 1 이상으로 두면 소리가 끝없이 커져 귀가 아프다', fix: '손잡이 범위를 0 ~ 0.6 으로, 코드에서도 Math.min(0.6, fb) 로 이중으로 막는다.' },
      { title: 'DelayNode 없이 게인 · 필터끼리 고리를 만들면 소리가 안 난다', fix: 'Web Audio 는 DelayNode 가 없는 고리를 막아 버린다 — 딜레이 → 필터 → 게인 → 딜레이 처럼 고리 안에 꼭 딜레이를 둔다.' },
      { title: '메아리가 원래 소리만큼 또렷해서 가짜 같다', fix: '고리 안 저역 필터(2200Hz)로 돌 때마다 고음을 깎는다.' },
    ],
    prev: ['i159'],
    next: ['i169'],
    refs: [{ name: 'MDN — DelayNode', url: 'https://developer.mozilla.org/en-US/docs/Web/API/DelayNode' }],
    source: [{ file: 'demosSfx.ts', symbol: 'recEcho' }],
  },

  i163: {
    id: 'i163',
    summary: '음악의 150Hz 아래 저음 에너지를 매 프레임 재서 최근 평균의 1.35배를 넘으면 「박」으로 잡아, 그림이 음악에 맞춰 통통 튀게 한다.',
    terms: [
      { en: 'Beat detection (energy-based onset detection)', ko: '박자 검출 — 저음 에너지가 갑자기 커지는 순간' },
      { en: 'Low-frequency energy · AnalyserNode', ko: '낮은 주파수 칸 세기 합' },
      { en: 'Moving average threshold', ko: '최근 평균 × 민감도 — 넘으면 박' },
      { en: 'Refractory period', ko: '박 하나 뒤 잠깐(0.2초) 안 받기 — 겹침 막기' },
    ],
    goal: '{target}에 박자 검출을 넣어 줘 — 음악의 저음 에너지가 최근 평균보다 확 커지면 박으로 잡아 그림이 튀게. 느낌은 {style}.',
    targets: ['음악에 맞춰 튀는 캐릭터 · 배경', '리듬 세기 체험 (박이 몇 번?)', '파일 곡에 맞춘 조명'],
    styles: ['통통 튀는 귀여운', '클럽 조명처럼 번쩍', '은은하게 숨쉬듯'],
    platforms: ['webaudio', 'canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 AudioSource.GetSpectrumData 로 낮은 칸 합을 구해 같은 평균 비교를 한다.',
      godot: 'Godot 은 AudioEffectSpectrumAnalyzer 의 get_magnitude_for_frequency_range(20, 150) 으로 저음 세기를 읽는다.',
    },
    principle: [
      '북(킥)은 낮은 소리라, 150Hz 아래 세기가 박마다 확 커진다.',
      'AnalyserNode(fftSize 1024 · 평활 0)의 getFloatFrequencyData 는 dB 값 — 칸마다 10^(dB/10) 로 세기로 바꿔 150Hz 아래 칸만 더한다.',
      '최근 40 프레임 평균 × 민감도(1.35)보다 크고, 앞 박에서 0.2초 넘게 지났으면 「박」.',
      '박이 오면 그림의 bump = 1, 0.3초 동안 0 으로 줄어든다 — 튀기 · 고리 · 막대가 bump 를 쓴다.',
      '소리를 켜기 전에는 같은 음악을 OfflineAudioContext 로 미리 그려 둔 에너지 · 박으로 그림만 보여 준다.',
    ],
    when: ['박 정보가 없는 곡 파일 · 바깥 소리에 맞춰 반응할 때', '「박자란 무엇인가」를 그래프로 보여 줄 때'],
    avoid: ['우리가 직접 예약하는 음악 — 이미 박 자리를 알고 있으니 박자 시계(i438)가 정확하다', '정확한 박자(BPM) 측정 — 이 방식은 반응용이라 몇십 ms 흔들린다'],
    cost: 'light',
    costNote: '매 프레임 FFT 칸 512개 읽기 + 최근 40개 평균 — 가볍다.',
    level: 2,
    must: [
      '분석기 평활(smoothingTimeConstant)은 0 — 평활하면 박이 뭉개진다',
      'dB 값을 그대로 더하지 말고 10^(dB/10) 로 세기로 바꿔 더한다',
      '박 사이 최소 간격(0.2초) — 한 박이 두세 번 잡히지 않게',
      '민감도 손잡이 (1.1 ~ 2.5) — 곡마다 맞는 값이 다르다',
      '소리 없이 볼 때를 위한 미리 계산한 그래프',
    ],
    done: [
      '음악을 켜면 저음 에너지 그래프와 평균 × 민감도 점선이 흐르고, 넘는 곳마다 분홍 「박」 막대가 선다',
      '박마다 친구가 튀고 고리가 퍼지며 막대가 솟는다',
      '민감도를 올리면 큰 박만, 내리면 작은 소리에도 반응한다',
    ],
    code: {
      lang: 'ts',
      title: '저음 에너지 > 최근 평균 × 민감도 = 박',
      from: 'demos/demosSfx.ts beatDemo start() · draw() 의 실시간 분석 부분을 정리',
      body: `const ana = ctx.createAnalyser();
ana.fftSize = 1024;
ana.smoothingTimeConstant = 0;                         // 평활하면 박이 뭉개진다
musicOut.connect(ana);                                 // 음악 길에서 갈라 듣기
const fbuf = new Float32Array(ana.frequencyBinCount);
const hist: number[] = [];
let lastBeatT = -9, bump = 0;

/** 매 프레임: t = 초 */
function detect(t: number, sens = 1.35): boolean {
  ana.getFloatFrequencyData(fbuf);                     // dB 값
  const binHz = ctx.sampleRate / ana.fftSize;
  let s = 0;
  for (let i = 1; i * binHz < 150; i++) s += Math.pow(10, fbuf[i] / 10); // 150Hz 아래 세기 합
  const recent = hist.slice(-40);
  const avg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : s;
  const isBeat = s > avg * sens && t - lastBeatT > 0.2 && s > 1e-6;
  if (isBeat) lastBeatT = t;
  hist.push(s);
  if (hist.length > 160) hist.shift();
  bump = Math.max(0, 1 - (t - lastBeatT) / 0.3);       // 그림 튀기: 0.3초에 사라짐
  return isBeat;
}`,
    },
    pitfalls: [
      { title: '분석기 평활을 기본값(0.8)으로 두면 박을 거의 못 잡는다', fix: '값이 천천히 변해 「갑자기 커짐」이 사라진다. 박 검출용 분석기는 smoothingTimeConstant = 0.' },
      { title: 'dB 를 그대로 더하면 조용한 칸이 큰 음수로 결과를 흔든다', fix: '10^(dB/10) 로 세기로 바꿔 더한다.' },
      { title: '한 박이 연달아 두세 번 잡힌다', fix: '앞 박에서 0.2초 안은 받지 않는다.' },
      { title: '평균을 너무 길게 잡으면 곡이 조용해졌다 커질 때 한동안 반응이 없다', fix: '최근 40 프레임(약 0.7초) 정도로 짧게.' },
    ],
    prev: ['i52'],
    next: ['i438'],
    refs: [{ name: 'MDN — AnalyserNode.getFloatFrequencyData()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getFloatFrequencyData' }],
    source: [{ file: 'demosSfx.ts', symbol: 'beatDemo' }, { file: 'demosSfx.ts', symbol: 'beatPre' }],
  },

  i164: {
    id: 'i164',
    summary: '효과음 여러 개를 틈을 두고 버퍼(파일) 하나에 이어 붙이고 시작 위치 · 길이 표를 둬서, start(때, 시작, 길이) 로 골라 재생해 받기 요청을 5번에서 1번으로 줄인다.',
    terms: [
      { en: 'Audio sprite', ko: '소리 여러 개를 한 파일에 — 위치로 골라 재생' },
      { en: 'AudioBufferSourceNode.start(when, offset, duration)', ko: '버퍼의 일부만 잘라 재생' },
      { en: 'OfflineAudioContext rendering', ko: '소리를 화면 밖에서 버퍼로 미리 굽기' },
      { en: 'Sprite map (offset · duration table)', ko: '소리 이름 → 시작 · 길이 표' },
    ],
    goal: '{target}을(를) 오디오 스프라이트로 묶어 줘 — 효과음 여러 개를 틈을 두고 한 버퍼에 이어 붙이고, 이름 → 시작 · 길이 표로 골라 재생하게. 조건은 {style}.',
    targets: ['게임 하나의 효과음 묶음', '폰에서 처음 받는 화면 소리들', '캐릭터 대사 조각 묶음'],
    styles: ['받기 요청을 가장 적게', '소리 사이 틈을 넉넉히', '이름표로 쉽게 고르기'],
    platforms: ['webaudio', 'web'],
    principle: [
      '작은 효과음 파일이 많으면 받기 요청이 많아져 폰 데이터망에서 느리다. 하나로 묶으면 한 번에 받는다.',
      '견본은 효과음 5개(딩딩 · 보잉 · 퓨웅 · 부부 · 띵~)를 OfflineAudioContext(44.1kHz 모노)에서 0.12초 틈을 두고 차례로 구워 버퍼 하나로 만든다.',
      '구우면서 소리마다 { 이름, 시작 at, 길이 dur } 를 표에 적는다.',
      '재생은 새 AudioBufferSourceNode 에 같은 버퍼를 물리고 start(지금 + 0.01, at, dur) — 그 구간만 나온다.',
      '파일로 내보낼 때도 같은 표(JSON)를 함께 두면 된다.',
    ],
    when: ['효과음이 많고 각각 짧은 게임 (폰 첫 실행 속도)', '여러 소리를 한 번에 미리 받아 두고 싶을 때'],
    avoid: ['긴 배경음악 — 따로 파일로 스트리밍(u77)', '소리가 두세 개뿐 — 묶는 수고가 더 크다'],
    cost: 'light',
    costNote: '버퍼 하나를 메모리에 둔다 (5개 약 3.5초 = 15만 표본). 재생은 소스 노드 하나.',
    level: 1,
    must: [
      '소리 사이에 틈(0.1초 이상) — 앞 소리 꼬리가 다음 구간에 새어 들지 않게',
      '시작 · 길이 표는 소리를 굽거나 자를 때 함께 만든다 — 손으로 적지 않는다',
      '재생할 때마다 새 AudioBufferSourceNode (한 번 쓰면 다시 start 못 함), 버퍼는 공유',
      '구간 끝을 duration 으로 정확히 — 안 주면 버퍼 끝까지 다 나온다',
    ],
    done: [
      '「▶ 딩딩」 · 「▶ 보잉」 … 단추를 누르면 그 소리만 나오고 다음 소리가 섞이지 않는다',
      '긴 파형 위에 지금 재생 중인 구간이 밝아지고 재생 줄이 지나간다',
      'source.start(0, 시작, 길이) 값이 화면에 보인다',
    ],
    code: {
      lang: 'ts',
      title: '효과음 묶어 굽기 + 구간 재생',
      from: 'demos/demosSfx.ts makeSprite · spriteDemo play() 를 정리',
      body: `type Rec = (c: BaseAudioContext, out: AudioNode, t0: number) => void;   // 효과음 하나 그리기 함수
interface Mark { name: string; at: number; dur: number }

async function makeSprite(sounds: { name: string; rec: Rec; dur: number }[], gap = 0.12) {
  const sr = 44100;
  const total = sounds.reduce((a, s) => a + s.dur + gap, 0);
  const oc = new OfflineAudioContext(1, Math.ceil(sr * total), sr);
  const out = oc.createGain();
  out.gain.value = 1.4;
  out.connect(oc.destination);
  let at = 0.01;
  const marks: Mark[] = [];
  for (const s of sounds) {
    s.rec(oc, out, at);                                     // 차례로 굽고
    marks.push({ name: s.name, at, dur: s.dur });           // 시작 · 길이 표
    at += s.dur + gap;                                      // 틈을 두고 다음
  }
  const buf = await oc.startRendering();
  return { buf, marks };
}
function playSprite(ac: AudioContext, out: AudioNode, sp: { buf: AudioBuffer; marks: Mark[] }, name: string) {
  const m = sp.marks.find((x) => x.name === name);
  if (!m) return;
  const src = ac.createBufferSource();                      // 재생마다 새 소스, 버퍼는 공유
  src.buffer = sp.buf;
  src.connect(out);
  src.start(ac.currentTime + 0.01, m.at, m.dur);            // 그 구간만
}`,
    },
    pitfalls: [
      { title: '소리 사이에 틈이 없으면 앞 소리 꼬리가 뒤 소리 앞에 묻어 나온다', fix: '0.1초 이상 조용한 틈을 둔다 (견본 0.12초).' },
      { title: 'mp3 로 내보내면 구간 위치가 조금 밀린다', fix: 'mp3 인코딩은 앞에 짧은 빈 소리가 붙을 수 있다. 틈을 넉넉히 두고, 내보낸 파일로 다시 들어 구간을 확인한다.' },
      { title: '같은 소스 노드를 다시 start 하면 오류가 난다', fix: 'AudioBufferSourceNode 는 한 번만 쓴다. 재생마다 새로 만들고 버퍼만 같이 쓴다.' },
    ],
    prev: ['i499'],
    next: ['i165'],
    refs: [
      { name: 'MDN — AudioBufferSourceNode.start()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/start' },
      { name: 'MDN — OfflineAudioContext', url: 'https://developer.mozilla.org/en-US/docs/Web/API/OfflineAudioContext' },
    ],
    source: [{ file: 'demosSfx.ts', symbol: 'makeSprite' }, { file: 'demosSfx.ts', symbol: 'spriteDemo' }],
  },

  i165: {
    id: 'i165',
    summary: '모든 소리를 음악 · 효과음 · 목소리 · 환경음 버스로 나눠 주 음량 → 가벼운 리미터로 모으고, 버스마다 음량을 조절 · 저장해 소리 균형을 사용자가 맞추게 한다.',
    terms: [
      { en: 'Mixer buses (submix groups)', ko: '채널 버스 — 소리 종류별로 모으는 길' },
      { en: 'Master gain · limiter (DynamicsCompressorNode)', ko: '주 음량 · 끝에서 찢어짐 막는 압축기' },
      { en: 'Volume settings persistence (localStorage)', ko: '음량 설정 저장' },
      { en: 'AnalyserNode level meter', ko: '버스마다 소리 크기 막대' },
    ],
    goal: '{target}에 채널 버스와 음량 조절을 넣어 줘 — 음악 · 효과음 · 목소리 · 환경음 버스, 버스마다 음량 · 저장, 끝에 가벼운 리미터. 화면은 {style}.',
    targets: ['게임 설정 화면 (소리)', '여러 게임이 같이 쓰는 소리 엔진', '소리 균형 시험판'],
    styles: ['믹서 페이더처럼', '아이도 쓰기 쉬운 큰 막대', '단순한 켜기 · 끄기 단추'],
    platforms: ['webaudio', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 AudioMixer 그룹(Music · SFX · Voice · Ambience)을 만들고 노출 매개변수로 SetFloat(dB). 저장은 PlayerPrefs.',
      godot: 'Godot 은 Audio 버스 레이아웃에 버스를 만들고 AudioServer.set_bus_volume_db · set_bus_mute. 저장은 ConfigFile.',
    },
    principle: [
      '소리를 내는 곳은 스피커에 바로 잇지 않고 자기 종류의 버스(GainNode)에 잇는다.',
      '버스 넷 → 주 음량(0.35) → 리미터(압축기: −10dB · knee 6 · 12:1 · 어택 3ms · 놓기 0.15초) → 분석기 → 스피커.',
      '사용자가 버스 막대를 움직이면 그 버스 게인을 setTargetAtTime(v, 지금, 0.03) 로 바꾸고 바로 저장한다.',
      '기본값: 음악 0.6 · 효과음 0.9 · 목소리 1 · 환경음 0.5 — 말이 가장 잘 들리게. 0 이면 그 버스는 꺼짐.',
    ],
    when: ['음악과 효과음을 따로 줄이고 싶은 사용자가 있는 모든 게임', '여러 게임 · 체험이 한 소리 엔진을 같이 쓸 때'],
    avoid: ['소리가 한 종류뿐인 아주 작은 화면 — 주 음량 단추 하나면 된다'],
    cost: 'light',
    costNote: 'GainNode 몇 개 + 압축기 1 + 분석기. 거의 공짜.',
    level: 1,
    must: [
      '모든 소리는 반드시 어느 버스를 지나게 — 스피커(destination)에 바로 잇는 코드를 금지',
      '끝에 리미터(압축기) 하나 — 여러 소리가 겹쳐도 찢어지지 않게',
      '음량 바꿈은 setTargetAtTime 으로 (딸깍 없이), 저장 · 읽기는 try/catch (저장소 막힘 대비)',
      '저장 키에 버전을 붙인다 (예: …-v1) — 나중에 구조가 바뀌어도 꼬이지 않게',
    ],
    done: [
      '네 버스를 켜면 음악 · 동전 소리 · 말소리 · 비 소리가 함께 나고, 버스마다 크기 막대가 움직인다',
      '효과음 막대를 0 으로 내리면 동전 소리만 사라지고 나머지는 그대로다',
      '새로고침해도 음량 설정이 그대로 남는다 (「저장됨 ✓」)',
      '모두 최대로 올려도 소리가 찢어지지 않는다',
    ],
    code: {
      lang: 'ts',
      title: '버스 넷 + 주 음량 + 리미터 + 저장',
      from: 'demos/demosSfx.ts audio() · BUSES · loadVols · busDemo 의 start · setVol 을 정리',
      body: `const ac = new AudioContext({ latencyHint: 'interactive' });
const master = ac.createGain();
master.gain.value = 0.35;
const limit = ac.createDynamicsCompressor();          // 끝에서 찢어짐 막기
limit.threshold.value = -10; limit.knee.value = 6; limit.ratio.value = 12;
limit.attack.value = 0.003; limit.release.value = 0.15;
master.connect(limit).connect(ac.destination);

const KEY = 'sfx-bus-v1';
type BusKey = 'music' | 'sfx' | 'voice' | 'amb';
function loadVols(): Record<BusKey, number> {
  const d = { music: 0.6, sfx: 0.9, voice: 1, amb: 0.5 };
  try { const s = localStorage.getItem(KEY); if (s) Object.assign(d, JSON.parse(s)); } catch { /* 저장소 막힘 */ }
  return d;
}
const vols = loadVols();
const bus = {} as Record<BusKey, GainNode>;
for (const k of ['music', 'sfx', 'voice', 'amb'] as BusKey[]) {
  bus[k] = ac.createGain();
  bus[k].gain.value = vols[k];
  bus[k].connect(master);
}
function setVol(k: BusKey, v: number) {
  vols[k] = v;
  bus[k].gain.setTargetAtTime(v, ac.currentTime, 0.03);
  try { localStorage.setItem(KEY, JSON.stringify(vols)); } catch { /* 무시 */ }
}
// 소리를 낼 때: coin(ac, bus.sfx, t) · music.connect(bus.music) · babble(ac, bus.voice, t, '좋아요')`,
    },
    pitfalls: [
      { title: '한 군데라도 destination 에 바로 이으면 그 소리는 음량 막대로 안 줄어든다', fix: '소리 함수는 늘 「어디로 보낼지(out)」를 받게 하고, 버스만 넘긴다.' },
      { title: '저장소가 막힌 사생활 보호 창에서 오류로 소리가 안 난다', fix: 'localStorage 읽기 · 쓰기를 try/catch 로 감싸고, 실패하면 기본값으로.' },
      { title: '리미터를 너무 세게 걸면 소리가 납작하고 펌프질한다', fix: '「가벼운」 리미터 — 문턱 −10dB, 평소엔 거의 안 걸리고 겹칠 때만.' },
    ],
    prev: ['i164'],
    next: ['i437'],
    refs: [{ name: 'MDN — DynamicsCompressorNode', url: 'https://developer.mozilla.org/en-US/docs/Web/API/DynamicsCompressorNode' }],
    source: [{ file: 'demosSfx.ts', symbol: 'audio' }, { file: 'demosSfx.ts', symbol: 'busDemo' }],
  },

  i169: {
    id: 'i169',
    summary: '짧은 소리를 20 ~ 80ms 알갱이로 잘라 한 개씩 부드러운 창을 씌워 초당 수십 개 흩뿌려, 짧은 녹음으로도 끝없이 이어지는 신비한 환경음을 만든다.',
    terms: [
      { en: 'Granular synthesis', ko: '그레인 합성 — 소리를 알갱이로 잘라 흩뿌리기' },
      { en: 'Grain size · density · position · spread', ko: '알갱이 길이 · 빽빽함 · 읽는 위치 · 흩뿌림 폭' },
      { en: 'Hann window (setValueCurveAtTime)', ko: '알갱이마다 씌우는 둥근 크기 곡선 — 딸깍 없음' },
      { en: 'Lookahead scheduler', ko: '조금 앞까지 알갱이를 미리 예약' },
    ],
    goal: '{target}을(를) 그레인 합성으로 만들어 줘 — 짧은 소리를 20~80ms 알갱이로 잘라 부드러운 창을 씌우고 초당 수십 개 흩뿌려서. 분위기는 {style}.',
    targets: ['짧은 녹음으로 만드는 긴 배경음', '마법 · 우주 같은 신비한 소리', '목소리를 늘인 꿈속 소리'],
    styles: ['반짝이는 신비한 구름', '잔잔한 바람결', '어둡고 웅웅거리는'],
    platforms: ['webaudio', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 OnAudioFilterRead 안에서 원본 표본을 알갱이로 읽어 창을 곱해 더한다.',
      godot: 'Godot 은 AudioStreamGenerator 에 같은 방식으로 표본을 밀어 넣는다.',
    },
    principle: [
      '원본(견본: 코드로 계산한 1.6초 「아~」 노랫소리 + 종소리)에서 아주 짧은 조각(알갱이, 기본 50ms)을 떼어 낸다.',
      '알갱이마다 32점 한(Hann) 창 sin²(πi/31) 을 크기 곡선으로 씌운다 — 양 끝이 0 이라 이어 붙여도 딸깍이 없다.',
      '읽는 위치 = 정한 자리(0.4) ± 흩뿌림 폭(0.2)의 무작위, 음 높이 = ±2반음 무작위, 좌우 = ±0.6 무작위.',
      '알갱이 간격 = (1 / 빽빽함) × (0.6 ~ 1.4 무작위). 초당 30개면 알갱이들이 겹쳐 끊김 없는 「구름」이 된다.',
      '40ms 마다 「지금 + 0.15초」까지의 알갱이를 미리 예약한다.',
    ],
    when: ['짧은 소리 하나로 길게 이어지는 환경음이 필요할 때', '신비한 · 몽환적인 분위기 (마법 · 우주 · 꿈)'],
    avoid: ['또렷한 박자 · 가락이 필요한 음악 — 알갱이는 뭉개진다', '아주 느린 기기에서 빽빽함 60 이상 — 노드가 너무 많아진다'],
    cost: 'medium',
    costNote: '알갱이 하나 = 버퍼 소스 1 + 게인 2 + 판너 1. 초당 30개 = 초당 노드 120개를 만들고 버린다 — 폰은 빽빽함 30 안팎으로.',
    level: 3,
    must: [
      '알갱이마다 반드시 창(크기 곡선)을 씌운다 — 안 씌우면 딸깍 잡음 덩어리',
      '알갱이 예약은 setInterval(40ms) + AudioContext 시계로 앞 0.15초까지',
      '읽는 위치는 버퍼 끝을 넘지 않게 (길이 − 알갱이 × 2 까지)',
      '원본 버퍼는 한 번만 만들어 돌려 쓴다',
      '알갱이 길이 · 빽빽함 · 읽는 위치 · 흩뿌림 폭을 손잡이로',
    ],
    done: [
      '켜면 짧은 노랫소리가 끊김 없이 길게 이어지는 반짝이는 소리 구름이 된다',
      '알갱이 길이를 20ms 로 줄이면 지글지글 · 80ms 로 늘리면 원래 소리 결이 더 들린다',
      '읽는 위치를 끌면 원본의 다른 부분(다른 음 · 종소리)으로 바뀐다',
      '빽빽함을 5 로 내리면 알갱이 하나하나가 따로 들린다',
    ],
    code: {
      lang: 'ts',
      title: '알갱이 흩뿌리기 (한 창 + 무작위 위치 · 높이 · 좌우)',
      from: 'demos/demosSfx.ts HANN · grains · class Ahead 를 정리',
      body: `const st2 = (n: number) => Math.pow(2, n / 12);
const HANN = new Float32Array(32).map((_, i) => Math.max(0.0001, Math.sin((Math.PI * i) / 31) ** 2));

/** from ~ to 시간 사이의 알갱이를 예약 */
function grains(c: AudioContext, out: AudioNode, buf: AudioBuffer, from: number, to: number,
                v = { size: 50, dens: 30, pos: 0.4, spread: 0.2, pitch: 2 }) {
  const size = v.size / 1000;
  for (let t = from; t < to; t += (1 / v.dens) * (0.6 + Math.random() * 0.8)) {
    const s = c.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = st2((Math.random() - 0.5) * 2 * v.pitch);  // ±2 반음
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.setValueCurveAtTime(HANN, t, size);                          // 둥근 창 — 딸깍 없음
    const pn = c.createStereoPanner();
    pn.pan.value = (Math.random() - 0.5) * 1.2;
    const half = c.createGain();
    half.gain.value = 0.5;
    s.connect(g).connect(half).connect(pn).connect(out);
    const k = Math.max(0, Math.min(0.98, v.pos + (Math.random() - 0.5) * v.spread));
    s.start(t, k * (buf.duration - size * 2), size * 2);               // 원본의 어느 자리에서
    s.stop(t + size + 0.01);
  }
}
/** 40ms 마다 깨어나 앞 0.15초까지 예약 */
function startCloud(c: AudioContext, out: AudioNode, buf: AudioBuffer) {
  let next = c.currentTime + 0.05;
  const tick = () => { const to = c.currentTime + 0.15; if (to > next) { grains(c, out, buf, next, to); next = to; } };
  tick();
  const id = window.setInterval(tick, 40);
  return () => clearInterval(id);
}`,
    },
    pitfalls: [
      { title: '창 없이 알갱이를 자르면 딸깍딸깍 잡음 덩어리가 된다', fix: '알갱이마다 한 창(양 끝 0)을 크기 곡선으로 — setValueCurveAtTime(HANN, t, size).' },
      { title: '알갱이를 규칙적인 간격으로 놓으면 「웅—」 하는 음이 새로 생긴다', fix: '간격이 일정하면 그 간격이 진동수처럼 들린다. 간격 · 위치 · 높이를 조금씩 무작위로.' },
      { title: '읽는 위치가 버퍼 끝을 넘으면 알갱이가 소리 없이 비어 버린다', fix: '시작 위치를 (버퍼 길이 − 알갱이 × 2) 까지로 묶는다.' },
      { title: '빽빽함을 크게 올리면 폰에서 소리가 끊긴다', fix: '알갱이마다 노드 4개 — 초당 수백 개는 무겁다. 폰은 30 안팎.' },
    ],
    prev: ['i159'],
    next: ['i77'],
    refs: [{ name: 'Wikipedia — Granular synthesis', url: 'https://en.wikipedia.org/wiki/Granular_synthesis' }],
    source: [{ file: 'demosSfx.ts', symbol: 'grains' }, { file: 'demosSfx.ts', symbol: 'grainSource' }, { file: 'demosSfx.ts', symbol: 'Ahead' }],
  },
};
